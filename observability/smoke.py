"""Smoke test of the whole telemetry chain against the running observability stack.

    python3 -I observability/smoke.py --out observability-results

Expects the stack (`make observability-up`) and the backend running on the host with
  VIDEO_SOURCE=sample APP_ENV=<env> APP_VERSION=<version> OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
It drives the API, waits for the telemetry to arrive, then asks Prometheus, Loki, Tempo
and Grafana what they received. It exits 1 if anything expected is missing. Raw query
results go to --out (JSON), and a Markdown report of the names that were actually
observed goes to --out/summary.md (and to $GITHUB_STEP_SUMMARY when set).
Standard library only.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Metric names as the Collector's Prometheus exporter is expected to expose them.
EXPECTED_METRICS = {
    "clipremix_competitors_added_total": "clipremix.competitors.added",
    "clipremix_videos_fetched_total": "clipremix.videos.fetched",
    "clipremix_remixes_created_total": "clipremix.remixes.created",
    "clipremix_plan_items_added_total": "clipremix.plan_items.added",
    "clipremix_fetch_duration_seconds_count": "clipremix.fetch.duration",
    "clipremix_fetch_duration_seconds_sum": "clipremix.fetch.duration",
    "clipremix_fetch_duration_seconds_bucket": "clipremix.fetch.duration",
    "clipremix_competitors": "clipremix.competitors",
}
# Absent or zero is fine: nothing in a normal run raises an unexpected error.
OPTIONAL_METRICS = ["clipremix_remix_failures_total"]

problems: list[str] = []
raw: dict[str, object] = {}


def fail(message: str) -> None:
    problems.append(message)
    print(f"FAIL: {message}", flush=True)


def http(method, url, body=None, headers=None, timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as res:
            text = res.read().decode()
            return res.status, (json.loads(text) if text.strip().startswith(("{", "[")) else text)
    except urllib.error.HTTPError as err:
        text = err.read().decode()
        try:
            return err.code, json.loads(text)
        except ValueError:
            return err.code, text


def get_json(url, headers=None):
    status, body = http("GET", url, headers=headers)
    if status != 200:
        raise RuntimeError(f"GET {url} -> {status}: {str(body)[:300]}")
    return body


def poll(description, check, timeout=120, interval=3):
    """Call check() until it returns something truthy; fail (and return None) on timeout."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            result = check()
            if result:
                return result
        except Exception as err:  # the backend may still be starting
            last = err
        time.sleep(interval)
    fail(f"timed out waiting for {description}" + (f" ({last})" if last else ""))
    return None


def drive_api(app):
    """The article's manual steps, plus a repeat call and a 404 for each counter."""
    def call(method, path, body=None, expect=None):
        status, payload = http(method, app + path, body)
        print(f"{method} {path} -> {status}", flush=True)
        if expect is not None and status != expect:
            fail(f"{method} {path} returned {status}, expected {expect}: {str(payload)[:200]}")
        return payload

    comp = call("POST", "/api/competitors", {"channelUrl": "https://www.youtube.com/@smokecheck"}, 201)
    call("POST", "/api/competitors", {"channelUrl": "https://www.youtube.com/@smokecheck"}, 200)  # repeat: not counted
    videos = call("POST", f"/api/competitors/{comp['id']}/videos/fetch", expect=200)
    call("POST", "/api/competitors/does-not-exist/videos/fetch", expect=404)
    video = videos[0]
    call("POST", f"/api/videos/{video['id']}/remix", expect=201)
    call("POST", f"/api/videos/{video['id']}/remix", expect=200)  # repeat
    call("POST", "/api/videos/does-not-exist/remix", expect=404)
    call("POST", "/api/content-plan", {"videoId": video["id"]}, 201)
    call("POST", "/api/content-plan", {"videoId": video["id"]}, 200)  # repeat
    call("GET", "/api/health", expect=200)


# ---- Prometheus ----------------------------------------------------------------


def check_prometheus(prom, env, version):
    def names():
        found = get_json(f"{prom}/api/v1/label/__name__/values")["data"]
        mine = sorted(n for n in found if n.startswith("clipremix_"))
        return mine if all(m in mine for m in EXPECTED_METRICS) else None

    metric_names = poll("all clipremix metrics in Prometheus", names, timeout=150)
    all_names = get_json(f"{prom}/api/v1/label/__name__/values")["data"]
    metric_names = sorted(n for n in all_names if n.startswith("clipremix_"))
    raw["prometheus_metric_names"] = metric_names
    raw["prometheus_label_names"] = get_json(f"{prom}/api/v1/labels")["data"]
    series_labels: dict[str, list[str]] = {}
    series_raw = {}
    for name in sorted(set(metric_names) | set(OPTIONAL_METRICS)):
        series = get_json(f"{prom}/api/v1/series?" + urllib.parse.urlencode({"match[]": name}))["data"]
        series_raw[name] = series
        if not series:
            if name in EXPECTED_METRICS:
                fail(f"Prometheus has no series for {name}")
            continue
        labels = sorted({k for s in series for k in s if k != "__name__"})
        series_labels[name] = labels
        for s in series:
            if s.get("deployment_environment") != env:
                fail(f"{name}: deployment_environment={s.get('deployment_environment')!r}, expected {env!r} in {s}")
            if s.get("service_version") != version:
                fail(f"{name}: service_version={s.get('service_version')!r}, expected {version!r} in {s}")
            if s.get("service_name") != "clipremix":
                fail(f"{name}: service_name={s.get('service_name')!r} in {s}")
    raw["prometheus_series"] = series_raw
    raw["prometheus_series_labels"] = series_labels
    for expected_name in EXPECTED_METRICS:
        if expected_name not in metric_names:
            fail(f"metric {expected_name} (from {EXPECTED_METRICS[expected_name]}) is not exposed by Prometheus")

    def value(query):
        res = get_json(f"{prom}/api/v1/query?" + urllib.parse.urlencode({"query": query}))["data"]["result"]
        return sum(float(r["value"][1]) for r in res) if res else None

    checks = {
        'sum(clipremix_competitors_added_total)': 1,
        'sum(clipremix_videos_fetched_total{outcome="success"})': 1,
        'sum(clipremix_remixes_created_total)': 1,
        'sum(clipremix_plan_items_added_total)': 1,
        'sum(clipremix_fetch_duration_seconds_count{outcome="success"})': 1,
        'sum(clipremix_competitors)': 1,
    }
    values = {}
    for query, expected in checks.items():
        got = value(query)
        values[query] = got
        if got != expected:
            fail(f"Prometheus {query} = {got}, expected {expected} (repeat calls and 404s must not count)")
    raw["prometheus_values"] = values
    return metric_names, series_labels


# ---- Loki ----------------------------------------------------------------------


def check_loki(loki, env, version):
    start = int((time.time() - 1800) * 1e9)
    end = lambda: int((time.time() + 60) * 1e9)  # noqa: E731

    def query():
        params = urllib.parse.urlencode({"query": '{service_name="clipremix"}', "start": start, "end": end(), "limit": 200})
        data = get_json(
            f"{loki}/loki/api/v1/query_range?{params}",
            headers={"X-Loki-Response-Encoding-Flags": "categorize-labels"},
        )["data"]["result"]
        text = json.dumps(data)
        return data if "Competitor added" in text and "Remix created" in text else None

    streams = poll("the app's log lines in Loki", query, timeout=150)
    labels = get_json(f"{loki}/loki/api/v1/labels")["data"]
    raw["loki_labels"] = labels
    raw["loki_streams"] = streams
    if not streams:
        return {}
    stream_label_names = sorted({k for s in streams for k in s["stream"]})
    metadata_names = sorted({k for s in streams for v in s["values"] if len(v) > 2 for k in (v[2].get("structuredMetadata") or {})})
    raw["loki_stream_label_names"] = stream_label_names
    raw["loki_structured_metadata_names"] = metadata_names
    for s in streams:
        if s["stream"].get("service_name") != "clipremix":
            fail(f"Loki stream without service_name=clipremix: {s['stream']}")
        if s["stream"].get("deployment_environment") != env:
            fail(f"Loki stream deployment_environment={s['stream'].get('deployment_environment')!r}, expected {env!r}")
    versions = set()
    with_ids = 0
    lines = 0
    for s in streams:
        for v in s["values"]:
            lines += 1
            meta = (v[2].get("structuredMetadata") or {}) if len(v) > 2 else {}
            versions.add(meta.get("service_version") or s["stream"].get("service_version"))
            if meta.get("trace_id") and meta.get("span_id"):
                with_ids += 1
    if versions != {version}:
        fail(f"Loki service_version values {sorted(map(str, versions))}, expected [{version!r}]")
    if with_ids == 0:
        fail("no Loki log line carries trace_id and span_id")
    raw["loki_summary"] = {"lines": lines, "lines_with_trace_and_span_id": with_ids, "versions": sorted(map(str, versions))}
    for label in ("service_name", "deployment_environment"):
        if label not in labels:
            fail(f"Loki label {label} is not in /loki/api/v1/labels: {labels}")
    return {"labels": labels, "stream": stream_label_names, "metadata": metadata_names}


# ---- Tempo ---------------------------------------------------------------------


def attr_value(item):
    value = item.get("value", {})
    return next(iter(value.values())) if value else None


def check_tempo(tempo, env, version):
    def search():
        params = urllib.parse.urlencode({"q": '{ resource.service.name = "clipremix" }', "limit": 50, "start": int(time.time()) - 1800, "end": int(time.time()) + 60})
        found = get_json(f"{tempo}/api/search?{params}")
        return found if found.get("traces") else None

    found = poll("a clipremix trace in Tempo", search, timeout=150)
    raw["tempo_search"] = found
    if not found:
        return {}
    trace = None
    for candidate in found["traces"]:
        if candidate.get("rootTraceName", "").startswith("POST"):
            trace = candidate
            break
    trace = trace or found["traces"][0]
    full = get_json(f"{tempo}/api/traces/{trace['traceID']}")
    raw["tempo_trace"] = full
    batches = full.get("batches") or full.get("resourceSpans") or []
    resource_attrs: dict[str, object] = {}
    span_attrs: set[str] = set()
    span_names: list[str] = []
    for batch in batches:
        for attr in batch["resource"]["attributes"]:
            resource_attrs[attr["key"]] = attr_value(attr)
        for scope in batch.get("scopeSpans") or batch.get("instrumentationLibrarySpans") or []:
            for span in scope["spans"]:
                span_names.append(span["name"])
                span_attrs.update(a["key"] for a in span.get("attributes", []))
    expected = {"service.name": "clipremix", "deployment.environment": env, "service.version": version}
    for key, want in expected.items():
        if resource_attrs.get(key) != want:
            fail(f"Tempo resource attribute {key}={resource_attrs.get(key)!r}, expected {want!r}")
    if len(span_names) < 2:
        fail(f"expected the request span plus database child spans in one trace, got {span_names}")
    tags = {}
    try:
        tags = get_json(f"{tempo}/api/v2/search/tags?scope=resource")
    except Exception as err:
        tags = {"error": str(err)}
    raw["tempo_resource_tags"] = tags
    return {"resource": sorted(resource_attrs), "span": sorted(span_attrs), "spans": span_names, "tags": tags, "root": trace.get("rootTraceName")}


# ---- Grafana ---------------------------------------------------------------------


def check_grafana(grafana):
    health = poll("Grafana /api/health", lambda: get_json(f"{grafana}/api/health"), timeout=60)
    raw["grafana_health"] = health
    sources = get_json(f"{grafana}/api/datasources")
    raw["grafana_datasources"] = sources
    types = {s["type"] for s in sources}
    if types != {"prometheus", "loki", "tempo"}:
        fail(f"Grafana datasource types {sorted(types)}")
    health_results = {}
    for source in sources:
        # Grafana's Tempo plugin has no /health route (404 "method not implemented"), so ask
        # each backend something real through Grafana's datasource proxy instead.
        probe = {"prometheus": "/api/v1/query?query=1", "loki": "/loki/api/v1/labels", "tempo": "/api/echo"}[source["type"]]
        try:
            status, body = http("GET", f"{grafana}/api/datasources/proxy/uid/{source['uid']}{probe}")
        except Exception as err:
            status, body = 0, str(err)
        health_results[source["name"]] = {"status": status, "body": body}
        if status != 200:
            fail(f"Grafana datasource {source['name']} probe {probe} -> {status}: {str(body)[:200]}")
    raw["grafana_datasource_health"] = health_results
    # A real query through Grafana's datasource proxy.
    q = urllib.parse.urlencode({"query": "sum(clipremix_competitors_added_total)"})
    try:
        through = get_json(f"{grafana}/api/datasources/proxy/uid/prometheus/api/v1/query?{q}")
        raw["grafana_prometheus_query"] = through
        if not through["data"]["result"]:
            fail("a query through Grafana's Prometheus datasource returned no data")
    except Exception as err:
        fail(f"query through Grafana's Prometheus datasource failed: {err}")
    return health_results


# ---- report --------------------------------------------------------------------


def report(env, version, prom, loki, tempo, grafana_health, run_url):
    lines = ["## Observability smoke test", ""]
    lines.append(f"Result: **{'FAILED' if problems else 'PASSED'}**. Environment `{env}`, version `{version}`." + (f" Run: {run_url}" if run_url else ""))
    if problems:
        lines += ["", "Problems:", *[f"- {p}" for p in problems]]
    metric_names, series_labels = prom if prom else ([], {})
    lines += ["", "### Prometheus metric names observed (`/api/v1/label/__name__/values`, prefix `clipremix_`)", ""]
    lines += [f"- `{n}`" + (f" (labels: {', '.join('`'+l+'`' for l in series_labels.get(n, []))})" if n in series_labels else "") for n in metric_names]
    lines += ["", "Absent as expected: " + ", ".join(f"`{n}`" for n in OPTIONAL_METRICS if n not in metric_names) if any(n not in metric_names for n in OPTIONAL_METRICS) else ""]
    lines += ["", "### Prometheus label names (`/api/v1/labels`)", "", ", ".join(f"`{l}`" for l in raw.get("prometheus_label_names", []))]
    lines += ["", "### Loki", "", f"- labels (`/loki/api/v1/labels`): {', '.join('`'+l+'`' for l in loki.get('labels', []))}",
              f"- stream labels of the app's logs: {', '.join('`'+l+'`' for l in loki.get('stream', []))}",
              f"- structured metadata names: {', '.join('`'+l+'`' for l in loki.get('metadata', []))}",
              f"- summary: `{json.dumps(raw.get('loki_summary', {}))}`"]
    lines += ["", "### Tempo", "", f"- resource attributes of a trace: {', '.join('`'+l+'`' for l in tempo.get('resource', []))}",
              f"- span attributes: {', '.join('`'+l+'`' for l in tempo.get('span', []))}",
              f"- spans in the trace `{tempo.get('root')}`: {', '.join('`'+n+'`' for n in tempo.get('spans', []))}",
              f"- resource tags from `/api/v2/search/tags?scope=resource`: `{json.dumps(tempo.get('tags'))[:600]}`"]
    lines += ["", "### Grafana", "", *[f"- datasource `{n}` queried through Grafana's proxy: HTTP {r['status']}" for n, r in (grafana_health or {}).items()],
              "", "Grafana's UI (Explore) was not opened by this script: it asks each of the three backends a real question through Grafana's datasource proxy."]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", default="http://localhost:8091")
    parser.add_argument("--prometheus", default="http://localhost:9090")
    parser.add_argument("--loki", default="http://localhost:3100")
    parser.add_argument("--tempo", default="http://localhost:3200")
    parser.add_argument("--grafana", default="http://localhost:3000")
    parser.add_argument("--env", default=os.getenv("APP_ENV", "dev"))
    parser.add_argument("--version", default=os.getenv("APP_VERSION", ""))
    parser.add_argument("--out", default="observability-results")
    args = parser.parse_args()
    if not args.version:
        sys.exit("--version (or APP_VERSION) is required")
    os.makedirs(args.out, exist_ok=True)

    poll("the app's /api/health", lambda: get_json(f"{args.app}/api/health"), timeout=60, interval=2)
    drive_api(args.app)

    prom = loki = tempo = grafana_health = None
    try:
        prom = check_prometheus(args.prometheus, args.env, args.version)
    except Exception as err:
        fail(f"Prometheus check crashed: {err}")
    try:
        loki = check_loki(args.loki, args.env, args.version)
    except Exception as err:
        fail(f"Loki check crashed: {err}")
    try:
        tempo = check_tempo(args.tempo, args.env, args.version)
    except Exception as err:
        fail(f"Tempo check crashed: {err}")
    try:
        grafana_health = check_grafana(args.grafana)
    except Exception as err:
        fail(f"Grafana check crashed: {err}")

    for name, value in raw.items():
        with open(os.path.join(args.out, f"{name}.json"), "w") as handle:
            json.dump(value, handle, indent=2, default=str)
    run_url = ""
    if os.getenv("GITHUB_RUN_ID"):
        run_url = f"{os.getenv('GITHUB_SERVER_URL')}/{os.getenv('GITHUB_REPOSITORY')}/actions/runs/{os.getenv('GITHUB_RUN_ID')}"
    text = report(args.env, args.version, prom, loki or {}, tempo or {}, grafana_health, run_url)
    with open(os.path.join(args.out, "summary.md"), "w") as handle:
        handle.write(text)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
            handle.write(text)
    print(text)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
