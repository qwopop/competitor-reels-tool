"""The Grafana dashboard and alert files, checked without Grafana or secrets, plus apply.py against a fake Grafana."""

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GRAFANA = ROOT / "observability/grafana"
APPLY = GRAFANA / "apply.py"


def load(rel):
    return json.loads((GRAFANA / rel).read_text())


def all_json():
    return sorted(GRAFANA.rglob("*.json"))


def test_all_json_parses_and_uids_are_unique():
    files = all_json()
    assert len(files) >= 4
    uids = []
    for f in files:
        data = json.loads(f.read_text())
        if "uid" in data:
            uids.append(data["uid"])
    assert len(uids) == len(set(uids)) == 4  # folder, dashboard, two rules


def test_dashboard_has_variables_and_a_panel_per_metric():
    dash = load("dashboards/clipremix.json")
    assert dash["uid"] == "clipremix-app"
    variables = {v["name"]: v for v in dash["templating"]["list"]}
    assert {"datasource", "environment", "version"} <= set(variables)
    for name in ("environment", "version"):
        assert variables[name]["multi"] and variables[name]["includeAll"]
    assert "deployment_environment" in variables["environment"]["query"]["query"]
    assert "service_version" in variables["version"]["query"]["query"]
    titles = {p["title"]: p for p in dash["panels"]}
    wanted = {
        "Competitors added": "clipremix_competitors_added_total",
        "Videos fetched by outcome": "clipremix_videos_fetched_total",
        "Remixes created": "clipremix_remixes_created_total",
        "Remix failures": "clipremix_remix_failures_total",
        "Plan items added": "clipremix_plan_items_added_total",
        "Fetch latency p50 and p95": "clipremix_fetch_duration_seconds_bucket",
        "Total competitors": "clipremix_competitors",
    }
    assert set(wanted) <= set(titles)
    for title, metric in wanted.items():
        for target in titles[title]["targets"]:
            expr = target["expr"]
            assert metric in expr
            assert "$environment" in expr and "$version" in expr  # every query respects both variables
    exprs = " ".join(t["expr"] for t in titles["Fetch latency p50 and p95"]["targets"])
    assert "histogram_quantile(0.5" in exprs and "histogram_quantile(0.95" in exprs
    assert "or vector(0)" in titles["Remix failures"]["targets"][0]["expr"]  # the series is absent until the first failure


def test_alert_rule_has_for_labels_annotations_and_does_not_fire_on_no_data():
    rule = load("alerting/rule-remix-failures.json")
    assert rule["uid"] == "clipremix-remix-failures" and rule["folderUID"] == load("alerting/folder.json")["uid"]
    assert rule["for"] == "5m"
    assert rule["noDataState"] == "OK" and rule["execErrState"] == "OK"
    assert set(rule["labels"]) >= {"service", "environment", "version", "owner"}
    assert rule["labels"]["service"] == "clipremix" and rule["labels"]["owner"] == "qwopop"
    assert set(rule["annotations"]) >= {"summary", "description", "dashboard_url", "runbook_url"}
    assert rule["annotations"]["dashboard_url"].startswith("__GRAFANA_URL__/d/clipremix-app")
    assert "docs/runbook.md" in rule["annotations"]["runbook_url"]
    query = next(d for d in rule["data"] if d["refId"] == "A")
    assert query["datasourceUid"] == "__DATASOURCE_UID__"  # resolved by apply.py, never hard-coded
    expr = query["model"]["expr"]
    assert "clipremix_remix_failures_total" in expr and "deployment_environment=~\"dev|prod\"" in expr
    assert "by (deployment_environment, service_version)" in expr
    assert rule["condition"] == "C"


def test_latency_rule_uses_the_same_pattern_as_the_failure_rule():
    failure = load("alerting/rule-remix-failures.json")
    rule = load("alerting/rule-fetch-latency.json")
    assert rule["uid"] == "clipremix-fetch-latency" and rule["folderUID"] == failure["folderUID"]
    assert rule["for"] == "10m"
    assert rule["noDataState"] == "OK" and rule["execErrState"] == "OK"
    assert rule["labels"] == failure["labels"]  # same service, environment, version and owner labels
    assert set(rule["annotations"]) == set(failure["annotations"])
    assert rule["annotations"]["dashboard_url"] == failure["annotations"]["dashboard_url"]
    assert rule["annotations"]["runbook_url"].endswith("docs/runbook.md#clipremix-slow-video-fetches")
    expr = next(d for d in rule["data"] if d["refId"] == "A")["model"]["expr"]
    assert "histogram_quantile(0.95" in expr and "clipremix_fetch_duration_seconds_bucket" in expr
    assert expr.count('deployment_environment=~"dev|prod"') == 2  # never local
    assert "> 4.5" in expr  # at least 5 fetches in the window, so one slow fetch after a cold start cannot fire it
    threshold = next(d for d in rule["data"] if d["refId"] == "C")["model"]["conditions"][0]["evaluator"]
    assert threshold == {"type": "gt", "params": [10]}
    assert "[10m]" in expr


def test_policy_routes_to_the_default_contact_point_without_webhooks():
    policy = load("alerting/notification-policy.json")
    assert policy["receiver"] == "grafana-default-email"
    assert not policy.get("routes")
    text = " ".join(f.read_text() for f in all_json())
    assert "webhook" not in text.lower() and "repository_dispatch" not in text


def test_no_secret_is_in_the_grafana_files():
    for f in list(GRAFANA.rglob("*")):
        if f.is_file() and f.suffix in {".json", ".py", ".yaml"}:
            assert "glsa_" not in f.read_text() and "eyJ" not in f.read_text()


def test_apply_dry_run_validates_and_calls_nothing():
    out = subprocess.run([sys.executable, "-I", str(APPLY), "--dry-run", "--url", "http://127.0.0.1:1"], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    assert "dry run: nothing was sent" in out.stdout
    assert "/api/v1/provisioning/alert-rules" in out.stdout and "/api/dashboards/db" in out.stdout


class FakeGrafana(BaseHTTPRequestHandler):
    """Stores what apply.py sends and returns it, adding fields like a real Grafana does."""

    store: dict = {}
    writes: list = []
    auth: list = []

    def log_message(self, *a):
        pass

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n)) if n else None

    def do_GET(self):
        s = FakeGrafana.store
        FakeGrafana.auth.append(self.headers.get("Authorization"))
        p = self.path
        if p == "/api/datasources":
            return self.reply(200, [{"uid": "loki-uid", "name": "Loki", "type": "loki"}, {"uid": "prom-uid", "name": "Prometheus", "type": "prometheus", "isDefault": True}])
        if p == "/api/v1/provisioning/policies":
            return self.reply(200, s.get("policy") or {"receiver": "other"})
        if p in s:
            return self.reply(200, s[p])
        self.reply(404, {"message": "not found"})

    def do_POST(self):
        b = self.body()
        FakeGrafana.writes.append(("POST", self.path))
        if self.path == "/api/folders":
            FakeGrafana.store[f"/api/folders/{b['uid']}"] = {**b, "id": 1}
        elif self.path == "/api/dashboards/db":
            d = b["dashboard"]
            FakeGrafana.store[f"/api/dashboards/uid/{d['uid']}"] = {"dashboard": {**d, "id": 5, "version": 2}, "meta": {"folderUid": b["folderUid"]}}
        elif self.path == "/api/v1/provisioning/alert-rules":
            FakeGrafana.store[f"/api/v1/provisioning/alert-rules/{b['uid']}"] = {**b, "id": 9, "updated": "now", "for": f"{int(b['for'][:-1])}m0s"}
        self.reply(200, {})

    def do_PUT(self):
        b = self.body()
        FakeGrafana.writes.append(("PUT", self.path))
        if self.path == "/api/v1/provisioning/policies":
            FakeGrafana.store["policy"] = {**b, "routes": None}
        self.reply(200, {})


def run_apply(url, token=""):
    import os

    env = {**os.environ, "GRAFANA_API_TOKEN": token}
    return subprocess.run([sys.executable, "-I", str(APPLY), "--url", url], capture_output=True, text=True, env=env)


def test_apply_creates_then_changes_nothing_and_resolves_the_datasource_uid():
    FakeGrafana.store, FakeGrafana.writes, FakeGrafana.auth = {}, [], []
    server = HTTPServer(("127.0.0.1", 0), FakeGrafana)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    try:
        first = run_apply(url)
        assert first.returncode == 0, first.stdout + first.stderr
        assert "5 change(s)" in first.stdout
        for uid in ("clipremix-remix-failures", "clipremix-fetch-latency"):
            rule = FakeGrafana.store[f"/api/v1/provisioning/alert-rules/{uid}"]
            assert rule["data"][0]["datasourceUid"] == "prom-uid"
            assert rule["annotations"]["dashboard_url"].startswith(url + "/d/clipremix-app")
            assert "__" not in json.dumps(rule["annotations"]) and "__DATASOURCE_UID__" not in json.dumps(rule)
        writes_after_first = len(FakeGrafana.writes)
        second = run_apply(url, token="secret-token-value")
        assert second.returncode == 0, second.stdout + second.stderr
        assert "0 change(s)" in second.stdout and "unchanged" in second.stdout
        assert len(FakeGrafana.writes) == writes_after_first  # the second run wrote nothing
        assert "secret-token-value" not in second.stdout + second.stderr
        assert "Bearer secret-token-value" in FakeGrafana.auth and None in FakeGrafana.auth  # empty token sends no header
    finally:
        server.shutdown()
