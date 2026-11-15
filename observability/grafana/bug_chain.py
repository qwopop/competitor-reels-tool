"""#88: show with the REAL application (bug patch applied) that failing remix requests raise
clipremix_remix_failures_total and make the Grafana alert fire. No synthetic metrics.

    python3 -I observability/grafana/bug_chain.py --app http://localhost:8091 --version <v> --out bug-chain-results

Expects the observability stack, the backend started with the patch and OTLP export
(APP_ENV=dev APP_VERSION=<v>), and curl+jq. It applies dashboard and rule (apply.py), then
keeps running scripts/remix-all-videos.sh against --app, and polls Prometheus and Grafana until
the counter is above zero and the alert for environment=dev and version=<v> is firing.
Standard library only.
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import verify  # noqa: E402  (reuse its HTTP helpers, constants and apply step)

ROOT = HERE.parent.parent
results = {"traffic": []}


def traffic(app):
    out = subprocess.run([str(ROOT / "scripts/remix-all-videos.sh"), app], capture_output=True, text=True,
                         env={**os.environ, "SEED_CHANNEL": "bugchain"})
    print(out.stdout + out.stderr, flush=True)
    results["traffic"].append(out.stdout)
    return out.stdout


def prom_value(prom, version):
    q = f'sum(clipremix_remix_failures_total{{service_name="clipremix",deployment_environment="dev",service_version="{version}"}})'
    body = verify.get(f"{prom}/api/v1/query?query={urllib.parse.quote(q)}")
    res = body["data"]["result"]
    return float(res[0]["value"][1]) if res else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", default="http://localhost:8091")
    ap.add_argument("--grafana", default="http://localhost:3000")
    ap.add_argument("--prometheus", default="http://localhost:9090")
    ap.add_argument("--version", required=True)
    ap.add_argument("--out", default="bug-chain-results")
    args = ap.parse_args()
    version = args.version

    verify.check_apply(args.grafana)
    verify.check_rule_loaded(args.grafana)

    first = traffic(args.app)
    if "HTTP 500" not in first or "HTTP 201" not in first:
        verify.fail("the first pass over all videos did not show both 201 and 500:\n" + first)

    title = verify.raw["rule"]["title"]
    started = time.time()
    counter, firing = 0.0, None
    while time.time() - started < 14 * 60:
        counter = prom_value(args.prometheus, version)
        status, active = verify.http("GET", args.grafana + verify.ALERTS_PATH)
        if status == 200:
            mine = [a for a in active if a["labels"].get("alertname") == title and a["labels"].get("version") == version]
            if mine:
                firing = {"after_seconds": round(time.time() - started), "alert": mine[0]}
                break
        print(f"[{round(time.time() - started)}s] failures counter {counter}, alert not firing yet", flush=True)
        traffic(args.app)  # keep failures arriving inside the rule's window
        time.sleep(15)
    results["failures_counter"] = counter
    results["alert"] = firing
    verify.note(f"clipremix_remix_failures_total{{dev,{version}}} = {counter} (real app)")
    if counter <= 0:
        verify.fail("clipremix_remix_failures_total never rose above zero")
    if not firing:
        verify.fail("the alert did not fire within 14 minutes of real failing traffic")
    else:
        verify.note(f"after {firing['after_seconds']}s the alert is firing for version {version} (real app)")
        a = firing["alert"]
        for k, v in {"service": "clipremix", "environment": "dev", "version": version}.items():
            if a["labels"].get(k) != v:
                verify.fail(f"label {k}={a['labels'].get(k)!r}, expected {v!r}")
        for k in ("summary", "description", "dashboard_url", "runbook_url"):
            if not a["annotations"].get(k):
                verify.fail(f"annotation {k} is missing")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "bug-chain.json").write_text(json.dumps(results, indent=2, default=str))
    verify.report(out, args.grafana)
    if verify.problems:
        sys.exit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()
