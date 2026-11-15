"""Verify the dashboard and alert rule in a running local observability stack, through Grafana's HTTP API.

    python3 -I observability/grafana/verify.py --out grafana-results --version <APP_VERSION>

Run it after `make observability-up` and after the backend has sent data (observability/smoke.py).
It
  1. runs apply.py twice (empty token) and checks the second run changes nothing,
  2. checks the dashboard: uid, the variables, a panel for every application metric, every query
     uses both variables, and runs each query through Grafana against the real data,
  3. checks that the alert rules (remix failures, slow fetches) and the policy are loaded, and the
     rules evaluate without error and do not fire with the real traffic of the app (#87),
  4. SENDS SYNTHETIC metrics over OTLP/HTTP to the Collector (same metric names and labels as the
     app, resource attribute synthetic=true): remix failures and slow fetches (version
     "synthetic-ci") for environment dev (must alert) and local (must not); plus two series that
     must NOT alert: "synthetic-fast" (many fast fetches) and "synthetic-coldstart" (a single 60 s
     fetch, as after a Render cold start). Waits for both rules to go Firing in Grafana,
  5. calls the alert API documented for the on-call script (#82) and checks the shape.
The synthetic data is not produced by the application. Standard library only.
"""

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ALERTS_PATH = "/api/alertmanager/grafana/api/v2/alerts?active=true&silenced=false&inhibited=false"
RULE_UID = "clipremix-remix-failures"
RULE_TITLE = "ClipRemix: repeated remix failures"
LATENCY_UID = "clipremix-fetch-latency"
LATENCY_TITLE = "ClipRemix: slow video fetches"
RULES = {RULE_UID: RULE_TITLE, LATENCY_UID: LATENCY_TITLE}
FETCH_BOUNDS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30]
EXPECTED_PANELS = {
    "Competitors added": "clipremix_competitors_added_total",
    "Videos fetched by outcome": "clipremix_videos_fetched_total",
    "Remixes created": "clipremix_remixes_created_total",
    "Remix failures": "clipremix_remix_failures_total",
    "Plan items added": "clipremix_plan_items_added_total",
    "Fetch latency p50 and p95": "clipremix_fetch_duration_seconds_bucket",
    "Total competitors": "clipremix_competitors",
}
problems = []
raw = {}
notes = []


def fail(msg):
    problems.append(msg)
    print(f"FAIL: {msg}", flush=True)


def note(msg):
    notes.append(msg)
    print(msg, flush=True)


def http(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
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


def get(url):
    status, body = http("GET", url)
    if status != 200:
        raise RuntimeError(f"GET {url} -> {status}: {str(body)[:300]}")
    return body


def run_apply(grafana):
    env = {**os.environ, "GRAFANA_API_TOKEN": ""}
    out = subprocess.run([sys.executable, "-I", str(HERE / "apply.py"), "--url", grafana], capture_output=True, text=True, env=env)
    print(out.stdout + out.stderr, flush=True)
    if out.returncode != 0:
        fail(f"apply.py exited {out.returncode}")
    return out.stdout


def check_apply(grafana):
    first = run_apply(grafana)
    second = run_apply(grafana)
    raw["apply_first"], raw["apply_second"] = first, second
    if "0 change(s)" not in second or any(w in second for w in ("created", "updated")):
        fail("the second apply changed something:\n" + second)
    else:
        note("apply.py, second run: every step unchanged, 0 change(s)")


def interpolate(expr, env, version):
    return expr.replace("$environment", env).replace("$version", version).replace("$__rate_interval", "10m")


def check_dashboard(grafana, version):
    res = get(f"{grafana}/api/dashboards/uid/clipremix-app")
    dash = res["dashboard"]
    raw["dashboard_meta"] = res["meta"]
    variables = {v["name"]: v for v in dash["templating"]["list"]}
    for name in ("environment", "version", "datasource"):
        if name not in variables:
            fail(f"dashboard has no variable {name}")
    for name in ("environment", "version"):
        v = variables.get(name, {})
        if not (v.get("multi") and v.get("includeAll")):
            fail(f"variable {name} is not multi-select")
    note(f"dashboard clipremix-app: variables {sorted(variables)}; panels {[p['title'] for p in dash['panels']]}")
    sources = get(f"{grafana}/api/datasources")
    prom = next(s for s in sources if s["type"] == "prometheus")
    label_env = get(f"{grafana}/api/datasources/proxy/uid/{prom['uid']}/api/v1/label/deployment_environment/values")["data"]
    label_ver = get(f"{grafana}/api/datasources/proxy/uid/{prom['uid']}/api/v1/label/service_version/values")["data"]
    note(f"variable values available in Prometheus: environment={label_env}, version={label_ver}")
    if "dev" not in label_env or version not in label_ver:
        fail(f"expected environment dev and version {version} among the label values")
    by_title = {p["title"]: p for p in dash["panels"]}
    results = {}
    for title, metric in EXPECTED_PANELS.items():
        panel = by_title.get(title)
        if not panel:
            fail(f"no panel {title!r}")
            continue
        for target in panel["targets"]:
            expr = target["expr"]
            if metric not in expr:
                fail(f"{title}: query does not use {metric}")
            if "$environment" not in expr or "$version" not in expr:
                fail(f"{title}: query does not use both variables: {expr}")
            query = {"refId": "A", "datasource": {"type": "prometheus", "uid": prom["uid"]}, "expr": interpolate(expr, "dev", version), "instant": True}
            status, out = http("POST", f"{grafana}/api/ds/query", {"queries": [query], "from": "now-15m", "to": "now"})
            frames = out.get("results", {}).get("A", {}).get("frames", []) if isinstance(out, dict) else []
            results[f"{title} / {target['legendFormat']}"] = {"status": status, "series": len(frames), "query": query["expr"]}
            if status != 200 or not frames:
                fail(f"{title}: query returned status {status} and {len(frames)} series")
    raw["dashboard_queries"] = results
    for k, v in results.items():
        note(f"  panel query {k}: status {v['status']}, {v['series']} series")


def rule_state(grafana, uid=RULE_UID):
    groups = get(f"{grafana}/api/prometheus/grafana/api/v1/rules")["data"]["groups"]
    for g in groups:
        for r in g["rules"]:
            if r.get("uid") == uid or r.get("name") == RULES[uid]:
                raw["rules_api"] = groups
                return r
    return None


def check_rule_loaded(grafana):
    policy = get(f"{grafana}/api/v1/provisioning/policies")
    raw["policy"] = policy
    if policy.get("receiver") != "grafana-default-email" or policy.get("routes"):
        fail(f"unexpected policy {policy}")
    raw["rules"] = {}
    for uid in RULES:
        rule = get(f"{grafana}/api/v1/provisioning/alert-rules/{uid}")
        raw["rules"][uid] = rule
        if uid == RULE_UID:
            raw["rule"] = rule  # bug_chain.py reads this one
        if rule.get("noDataState") != "OK" or rule.get("execErrState") != "OK":
            fail(f"{uid}: noDataState/execErrState are {rule.get('noDataState')}/{rule.get('execErrState')}, expected OK")
        if "dev|prod" not in json.dumps(rule["data"]) or "local" in json.dumps(rule["data"]):
            fail(f"{uid}: the query must select dev|prod only")
        for k in ("service", "environment", "version", "owner"):
            if k not in rule.get("labels", {}):
                fail(f"{uid}: label {k} missing")
        for k in ("summary", "description", "dashboard_url", "runbook_url"):
            if not rule.get("annotations", {}).get(k):
                fail(f"{uid}: annotation {k} missing")
    for uid, title in RULES.items():
        deadline = time.time() + 150
        state = None
        while time.time() < deadline:
            state = rule_state(grafana, uid)
            if state and not state.get("lastEvaluation", "0001").startswith("0001") and state.get("health") in ("ok", "nodata", "error"):
                break
            time.sleep(5)
        raw[f"rule_state_before_{uid}"] = state
        if not state:
            raw["rules_api"] = get(f"{grafana}/api/prometheus/grafana/api/v1/rules")
            fail(f"{uid}: not listed by /api/prometheus/grafana/api/v1/rules")
            continue
        note(f"rule {uid} loaded: health={state.get('health')}, state={state.get('state')}, lastError={state.get('lastError')!r}, for={raw['rules'][uid].get('for')}")
        if state.get("health") == "error" or state.get("lastError"):
            fail(f"{uid}: the rule evaluates with an error: {state.get('lastError')}")
    # Real traffic only so far (the app's fast sample fetches, no failures): nothing may fire.
    time.sleep(70)  # at least one more evaluation of every rule after the traffic
    status, active = http("GET", grafana + ALERTS_PATH)
    mine = [a for a in active if a["labels"].get("alertname") in RULES.values()] if status == 200 else []
    raw["alerts_with_real_traffic"] = active
    if mine:
        fail(f"an alert fires with real, normal traffic: {mine}")
    else:
        note("no alert is active with the app's real traffic: no remix failure series (no data), fast fetches, fewer than 5 of them (no data does not fire)")


# ---- synthetic remix failures over OTLP -----------------------------------------


def resource(env, version):
    attrs = {"service.name": "clipremix", "deployment.environment": env, "service.version": version,
             "service.instance.id": "synthetic-ci", "synthetic": "true"}
    return {"attributes": [{"key": k, "value": {"stringValue": v}} for k, v in attrs.items()]}


def otlp_payload(env, version, value, start_ns):
    return {"resourceMetrics": [{
        "resource": resource(env, version),
        "scopeMetrics": [{"scope": {"name": "synthetic-ci"}, "metrics": [{
            "name": "clipremix.remix.failures",
            "description": "SYNTHETIC: sent by observability/grafana/verify.py, not by the application",
            "sum": {"aggregationTemporality": 2, "isMonotonic": True,
                    "dataPoints": [{"startTimeUnixNano": str(start_ns), "timeUnixNano": str(time.time_ns()), "asInt": str(value)}]}}]}]}]}


def histogram_payload(env, version, start_ns, count, seconds_each):
    """Cumulative histogram of clipremix.fetch.duration with `count` observations of `seconds_each` (outcome=success)."""
    counts = [0] * (len(FETCH_BOUNDS) + 1)
    idx = next((i for i, b in enumerate(FETCH_BOUNDS) if seconds_each <= b), len(FETCH_BOUNDS))
    counts[idx] = count
    point = {"startTimeUnixNano": str(start_ns), "timeUnixNano": str(time.time_ns()), "count": str(count),
             "sum": count * seconds_each, "bucketCounts": [str(c) for c in counts], "explicitBounds": FETCH_BOUNDS,
             "attributes": [{"key": "outcome", "value": {"stringValue": "success"}}]}
    return {"resourceMetrics": [{
        "resource": resource(env, version),
        "scopeMetrics": [{"scope": {"name": "synthetic-ci"}, "metrics": [{
            "name": "clipremix.fetch.duration", "unit": "s",
            "description": "SYNTHETIC: sent by observability/grafana/verify.py, not by the application",
            "histogram": {"aggregationTemporality": 2, "dataPoints": [point]}}]}]}]}


# version -> (observations added per 5 s tick, seconds each, should it alert)
SYNTHETIC_FETCHES = {
    "synthetic-ci": (2, 15.0, True),         # slow and many: p95 ~19 s, must alert for dev
    "synthetic-fast": (2, 0.1, False),       # many but fast: must not alert
    "synthetic-coldstart": (0, 60.0, False)  # one 60 s fetch (a cold start), then nothing: must not alert
}


def send_synthetic(collector, stop, versions):
    start = time.time_ns()
    n = 0
    while not stop.is_set():
        n += 3
        for env in ("dev", "local"):
            sends = [otlp_payload(env, versions, n, start)]
            for version, (per_tick, secs, _) in SYNTHETIC_FETCHES.items():
                total = per_tick * (n // 3) if per_tick else 1
                sends.append(histogram_payload(env, version, start, total, secs))
            for payload in sends:
                status, _ = http("POST", f"{collector}/v1/metrics", payload)
                if status != 200:
                    print(f"synthetic OTLP send -> {status}", flush=True)
        stop.wait(5)


def check_alert_fires(grafana, collector, version):
    stop = threading.Event()
    synth_version = "synthetic-ci"
    thread = threading.Thread(target=send_synthetic, args=(collector, stop, synth_version), daemon=True)
    thread.start()
    started = time.time()
    pending, firing = {}, {}
    wrong = []  # alerts that must not exist
    try:
        while time.time() - started < 18 * 60 and len(firing) < len(RULES):
            for uid, title in RULES.items():
                state = rule_state(grafana, uid)
                for a in (state or {}).get("alerts", []):
                    if a["labels"].get("environment") == "dev" and a["labels"].get("version") == synth_version \
                            and a["state"].lower().startswith("pending") and uid not in pending:
                        pending[uid] = {"after_seconds": round(time.time() - started), "alert": a}
                        note(f"after {pending[uid]['after_seconds']}s the {title!r} instance for dev is Pending (synthetic)")
            status, active = http("GET", grafana + ALERTS_PATH)
            if status == 200:
                for a in active:
                    lb = a["labels"]
                    if lb.get("alertname") not in RULES.values():
                        continue
                    if lb.get("environment") == "local" or lb.get("version") in ("synthetic-fast", "synthetic-coldstart"):
                        wrong.append(a)
                    elif lb.get("environment") == "dev" and lb.get("version") == synth_version:
                        uid = next(u for u, t in RULES.items() if t == lb["alertname"])
                        if uid not in firing:
                            firing[uid] = {"after_seconds": round(time.time() - started), "alerts": active}
                            note(f"after {firing[uid]['after_seconds']}s {lb['alertname']!r} is firing for dev (synthetic data)")
            time.sleep(10)
    finally:
        stop.set()
        thread.join(timeout=10)
    raw["synthetic_pending"] = pending
    raw["synthetic_firing"] = {k: v["after_seconds"] for k, v in firing.items()}
    raw["alerts_api_output"] = firing.get(RULE_UID)
    raw["alerts_api_output_latency"] = firing.get(LATENCY_UID)
    raw["alerts_that_must_not_fire"] = wrong
    if wrong:
        fail(f"alerts fired that must not: {[(a['labels'].get('alertname'), a['labels'].get('environment'), a['labels'].get('version')) for a in wrong]}")
    else:
        note("no alert for environment local, for synthetic-fast (many fast fetches) or synthetic-coldstart (one 60 s fetch), although all were sent")
    for uid, title in RULES.items():
        if uid not in firing:
            fail(f"{title!r} did not fire within 18 minutes of synthetic data")
            continue
        alerts = [a for a in firing[uid]["alerts"] if a["labels"].get("alertname") == title]
        alert = next(a for a in alerts if a["labels"].get("environment") == "dev" and a["labels"].get("version") == synth_version)
        labels, ann = alert["labels"], alert["annotations"]
        expect = {"service": "clipremix", "environment": "dev", "version": synth_version, "owner": "qwopop"}
        for k, v in expect.items():
            if labels.get(k) != v:
                fail(f"{uid}: label {k}={labels.get(k)!r}, expected {v!r}")
        for k in ("summary", "description", "dashboard_url", "runbook_url"):
            if not ann.get(k):
                fail(f"{uid}: annotation {k} is missing")
        want_url = f"{grafana}/d/clipremix-app/clipremix-application?var-environment=dev&var-version={synth_version}"
        if ann.get("dashboard_url") != want_url:
            fail(f"{uid}: dashboard_url {ann.get('dashboard_url')!r}, expected {want_url!r}")
        if alert.get("status", {}).get("state") != "active":
            fail(f"{uid}: status.state is {alert.get('status')}")
        for k in ("startsAt", "endsAt", "fingerprint", "generatorURL", "receivers"):
            if k not in alert:
                fail(f"{uid}: alert has no field {k}")


def report(out, grafana):
    out.mkdir(parents=True, exist_ok=True)
    (out / "grafana-results.json").write_text(json.dumps(raw, indent=2, default=str))
    lines = ["# Grafana dashboard and alert, local stack", "", f"Grafana: `{grafana}`", ""]
    lines += [f"- {n}" for n in notes]
    for key, what in (("alerts_api_output", RULE_TITLE), ("alerts_api_output_latency", LATENCY_TITLE)):
        fired = raw.get(key)
        if fired:
            mine = [a for a in fired["alerts"] if a["labels"].get("alertname") == what]
            lines += ["", f"Output of `GET {ALERTS_PATH}` while {what!r} fires (synthetic data, only its alerts):", "", "```json",
                      json.dumps(mine, indent=2), "```"]
    lines += ["", "Result: " + ("FAILED\n\n" + "\n".join(f"- {p}" for p in problems) if problems else "passed")]
    text = "\n".join(lines) + "\n"
    (out / "summary.md").write_text(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grafana", default="http://localhost:3000")
    ap.add_argument("--collector", default="http://localhost:4318")
    ap.add_argument("--version", required=True, help="service.version the app sent data with")
    ap.add_argument("--out", default="grafana-results")
    args = ap.parse_args()
    try:
        check_apply(args.grafana)
        check_dashboard(args.grafana, args.version)
        check_rule_loaded(args.grafana)
        check_alert_fires(args.grafana, args.collector, args.version)
    finally:
        report(Path(args.out), args.grafana)
    if problems:
        print(f"{len(problems)} problem(s)")
        sys.exit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()
