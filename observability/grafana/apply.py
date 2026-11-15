"""Apply the ClipRemix dashboard, alert rule and notification policy to a Grafana through its HTTP API.

    python3 -I observability/grafana/apply.py [--url URL] [--dry-run]

URL defaults to $GRAFANA_URL, then http://localhost:3000 (the local stack, which needs no token).
The token comes from $GRAFANA_API_TOKEN and may be empty for the local Grafana. It is only sent
as a Bearer header and never printed.

Steps, each idempotent (a second run reports "unchanged" and changes nothing):
  1. folder       alerting/folder.json                  (fixed uid)
  2. dashboard    dashboards/clipremix.json             (fixed uid clipremix-app)
  3. policy       alerting/notification-policy.json     (replaces the root notification policy)
  4. alert rules  alerting/rule-*.json                  (one file per rule, fixed uid, created or updated by uid)

The Prometheus datasource uid is looked up through GET /api/datasources (the datasource named by
--datasource-name or $GRAFANA_PROMETHEUS_DATASOURCE, else the default Prometheus, else the first
one) and replaces __DATASOURCE_UID__ in the rule. __GRAFANA_URL__ in the rule's annotations
becomes the Grafana URL. --dry-run validates the files and prints what would be sent, without
calling Grafana. Standard library only.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRY_UID = "dry-run-datasource-uid"


def load(rel):
    return json.loads((HERE / rel).read_text())


class Grafana:
    def __init__(self, url, token):
        self.url = url.rstrip("/")
        self.token = token

    def call(self, method, path, body=None, extra=None):
        headers = {"Content-Type": "application/json", "Accept": "application/json", **(extra or {})}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                text = res.read().decode()
                return res.status, (json.loads(text) if text.strip()[:1] in "{[" else text)
        except urllib.error.HTTPError as err:
            text = err.read().decode()
            try:
                return err.code, json.loads(text)
            except ValueError:
                return err.code, text


def seconds(value):
    """'5m', '5m0s' and '1h' all become seconds; anything else is returned unchanged."""
    if isinstance(value, str):
        m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", value)
        if m and value:
            h, mi, s = (int(g or 0) for g in m.groups())
            return h * 3600 + mi * 60 + s
    return value


def covers(actual, wanted):
    """True when `actual` contains everything in `wanted` (Grafana adds defaults and ids)."""
    if isinstance(wanted, dict):
        return isinstance(actual, dict) and all(covers(actual.get(k), v) if (k in actual or v) else True for k, v in wanted.items())
    if isinstance(wanted, list):
        if not wanted:
            return not actual
        return isinstance(actual, list) and len(actual) == len(wanted) and all(covers(a, w) for a, w in zip(actual, wanted))
    return seconds(actual) == seconds(wanted)


def validate(folder, dashboard, policy, rules):
    problems = []
    if dashboard.get("uid") != "clipremix-app":
        problems.append("dashboard uid must be clipremix-app")
    uids = [r.get("uid") for r in rules]
    if len(set(uids)) != len(uids):
        problems.append("rule uids must be unique")
    for rule in rules:
        name = rule.get("uid") or "?"
        if rule.get("folderUID") != folder["uid"]:
            problems.append(f"rule {name}: folderUID must be the folder's uid")
        if not rule.get("uid"):
            problems.append("a rule has no uid")
        for key in ("for", "labels", "annotations", "noDataState", "condition", "data"):
            if not rule.get(key):
                problems.append(f"rule {name} has no {key}")
    if not policy.get("receiver"):
        problems.append("policy has no receiver")
    if problems:
        sys.exit("invalid files:\n  " + "\n  ".join(problems))


def pick_datasource(sources, name):
    prom = [s for s in sources if s.get("type") == "prometheus"]
    if name:
        prom = [s for s in prom if s["name"] == name]
    if not prom:
        sys.exit("no Prometheus datasource found" + (f" named {name!r}" if name else "") + " in Grafana")
    return next((s for s in prom if s.get("isDefault")), prom[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--url", default=os.environ.get("GRAFANA_URL") or "http://localhost:3000")
    ap.add_argument("--dry-run", action="store_true", help="validate and print, do not call Grafana")
    ap.add_argument("--datasource-name", default=os.environ.get("GRAFANA_PROMETHEUS_DATASOURCE", ""))
    args = ap.parse_args()
    url = args.url.rstrip("/")

    folder = load("alerting/folder.json")
    dashboard = load("dashboards/clipremix.json")
    policy = load("alerting/notification-policy.json")
    rule_texts = [p.read_text() for p in sorted((HERE / "alerting").glob("rule-*.json"))]
    if not rule_texts:
        sys.exit("no alerting/rule-*.json files")
    validate(folder, dashboard, policy, [json.loads(t) for t in rule_texts])

    g = Grafana(url, os.environ.get("GRAFANA_API_TOKEN", ""))
    if args.dry_run:
        ds_uid = DRY_UID
    else:
        status, sources = g.call("GET", "/api/datasources")
        if status != 200:
            sys.exit(f"GET /api/datasources -> {status}: {str(sources)[:300]} (is the URL right, and does the token allow reading datasources?)")
        source = pick_datasource(sources, args.datasource_name)
        ds_uid = source["uid"]
        print(f"datasource: {source['name']} (uid {ds_uid})")
    rules = [json.loads(t.replace("__DATASOURCE_UID__", ds_uid).replace("__GRAFANA_URL__", url)) for t in rule_texts]

    # Each step: (what, how to read the current state, desired body, how to write it).
    changed = 0

    def step(label, method, path, body, existing_ok, existing, covered):
        nonlocal changed
        if args.dry_run:
            print(f"[dry-run] {label}: {method} {url}{path}\n{json.dumps(body, indent=2)}")
            return
        if existing_ok and covered(existing):
            print(f"{label}: unchanged")
            return
        status, res = g.call(method, path, body, {"X-Disable-Provenance": "true"})
        if status >= 300:
            sys.exit(f"{label}: {method} {path} -> {status}: {str(res)[:500]}")
        changed += 1
        print(f"{label}: {'updated' if existing_ok else 'created'}")

    # 1. folder
    status, cur = (None, None) if args.dry_run else g.call("GET", f"/api/folders/{folder['uid']}")
    step("folder", "PUT" if status == 200 else "POST", f"/api/folders/{folder['uid']}" if status == 200 else "/api/folders", folder, status == 200, cur, lambda c: c.get("title") == folder["title"])

    # 2. dashboard (POST with overwrite creates or updates by uid)
    status, cur = (None, None) if args.dry_run else g.call("GET", f"/api/dashboards/uid/{dashboard['uid']}")
    payload = {"dashboard": {**dashboard, "id": None}, "folderUid": folder["uid"], "overwrite": True, "message": "Applied from the repository"}
    step("dashboard", "POST", "/api/dashboards/db", payload, status == 200, cur,
         lambda c: covers(c["dashboard"], {k: v for k, v in dashboard.items() if k != "version"}) and c["meta"].get("folderUid") == folder["uid"])

    # 3. notification policy (always PUT of the whole root tree)
    status, cur = (None, None) if args.dry_run else g.call("GET", "/api/v1/provisioning/policies")
    step("policy", "PUT", "/api/v1/provisioning/policies", policy, status == 200, cur, lambda c: covers(c, policy))

    # 4. alert rules
    for rule in rules:
        status, cur = (None, None) if args.dry_run else g.call("GET", f"/api/v1/provisioning/alert-rules/{rule['uid']}")
        label = f"alert rule {rule['uid']}"
        if status == 200:
            step(label, "PUT", f"/api/v1/provisioning/alert-rules/{rule['uid']}", rule, True, cur, lambda c, rule=rule: covers(c, rule))
        else:
            step(label, "POST", "/api/v1/provisioning/alert-rules", rule, False, None, None)

    if args.dry_run:
        print("dry run: nothing was sent")
    else:
        print(f"done, {changed} change(s) at {url}")


if __name__ == "__main__":
    main()
