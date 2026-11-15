# Observability: OpenTelemetry traces, metrics and logs

The backend emits traces, metrics and logs over OTLP (HTTP, `http/protobuf`).
Code: `backend/app/telemetry.py`, called from `create_app`. Every signal carries
the resource

| Resource attribute | Value |
| --- | --- |
| `service.name` | `clipremix` |
| `deployment.environment` | `APP_ENV`: `dev`, `prod` or `local` |
| `service.version` | the version helper `app_version()`: `APP_VERSION`, then `RENDER_GIT_COMMIT`, then `dev` |

**Nothing is exported unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.** Without it
the app creates no exporter, background thread or network connection (a test
asserts this). With it, the standard variables apply:
`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
`OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, `OTEL_EXPORTER_OTLP_TIMEOUT`,
`OTEL_METRIC_EXPORT_INTERVAL` (default 60000 ms).

What is recorded:

- **Traces:** one span per incoming request (FastAPI), child spans for database calls (SQLAlchemy) and for outgoing YouTube calls (urllib). `/api/health` is not traced.
- **Logs:** Python log records go through the OTel logging handler, carry `trace_id` and `span_id` inside a request, and still go to stdout.
- **Metrics:** the table below.

An unreachable collector does not make requests fail or slower: exporting runs
in background threads (a test calls the API with the endpoint set to an unused
port). On shutdown the app flushes and stops the providers, waiting at most 6
seconds (Render sends SIGTERM when a free service sleeps).

## Metrics

OTel names. Prometheus names follow the standard conversion (dots become
underscores, counters get `_total`, the histogram unit `s` becomes `_seconds`).
No attribute holds a channel id, URL or any unbounded value; the only attribute
is `outcome`.

| OTel name | Prometheus name | Type | Meaning |
| --- | --- | --- | --- |
| `clipremix.competitors.added` | `clipremix_competitors_added_total` | counter | Competitors newly created (HTTP 201), not the 200 for an existing one. |
| `clipremix.videos.fetched` | `clipremix_videos_fetched_total` | counter, `outcome` | One per fetch request. `success`, `empty` (no public videos) or `error` (source failure). |
| `clipremix.remixes.created` | `clipremix_remixes_created_total` | counter | New remixes (201), not the 200 for an existing one. |
| `clipremix.remix.failures` | `clipremix_remix_failures_total` | counter | Remix creation, apply-template or update raised an unexpected error (HTTP 500). 404 and other 4xx do not count. |
| `clipremix.plan_items.added` | `clipremix_plan_items_added_total` | counter | New content plan items (201). |
| `clipremix.fetch.duration` | `clipremix_fetch_duration_seconds` (`_bucket`, `_sum`, `_count`) | histogram, `outcome` | Seconds spent in the video source fetch. |
| `clipremix.competitors` | `clipremix_competitors` | observable gauge | Competitors currently in the database. A database error in the callback is logged and skipped. |

The FastAPI and SQLAlchemy instrumentations add their own standard metrics
(`http.server.*`, `db.client.*`).

To see a remix failure, make the store raise: `test_remix_failures_count_unexpected_errors_only`
in `backend/tests/test_telemetry.py` patches `store.add_remix` to raise, which
gives HTTP 500 and +1 on `clipremix.remix.failures`. In a running app there is no
normal way to trigger one, so the counter stays at zero or absent.

## Local stack

`observability/` is its own Compose project (`name: clipremix-observability`),
separate from the app stack:

```
app --OTLP/HTTP :4318--> OpenTelemetry Collector --> Prometheus (metrics, scraped from :8889)
                                                 --> Loki       (logs, OTLP)
                                                 --> Tempo      (traces, OTLP gRPC)
                                                 Grafana reads all three
```

| Service | Host port | Image |
| --- | --- | --- |
| Collector (OTLP gRPC / HTTP) | 4317 / 4318 | `otel/opentelemetry-collector-contrib:0.116.1` |
| Grafana | 3000 | `grafana/grafana:11.4.0` |
| Prometheus | 9090 | `prom/prometheus:v3.0.1` |
| Loki | 3100 | `grafana/loki:3.3.2` |
| Tempo | 3200 | `grafana/tempo:2.6.1` |

None of them uses the app stack's ports (8100, 5432). Grafana's datasources are
provisioned from `observability/grafana/provisioning/datasources/`. Anonymous
Admin access is enabled: **local use only**, never expose these ports.

```bash
make observability-up      # start (docker compose -f observability/docker-compose.yaml up -d --wait)
make observability-down    # stop
```

CI checks the file with `docker compose -f observability/docker-compose.yaml config` (no containers),
`backend/tests/test_observability_config.py` parses the stack's files, and the workflow
`observability.yml` (push to paths that affect it, or run it by hand) starts the stack and runs `observability/smoke.py`.

## Manual check

1. `make observability-up`. Wait until it returns, then open Grafana at http://localhost:3000 (no login).
2. In another terminal start the app against the Collector:
   `cd backend && OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 APP_ENV=local OTEL_METRIC_EXPORT_INTERVAL=5000 VIDEO_SOURCE=sample uv run uvicorn app.main:app --port 8091`
   (with the frontend: `make frontend`, http://localhost:5173).
3. Open the app and add a competitor, fetch its videos, create a remix of one video, and add a video to the content plan.
4. In Grafana open **Explore**, pick **Tempo**, run `{ resource.service.name = "clipremix" }` and open the trace of one of those requests: the request span with its database child spans.
5. Pick **Loki** and run `{service_name="clipremix"}`: the log lines of those requests (for example "Competitor added", "Fetched N videos for ...").
6. Pick **Prometheus** and run each query below, once with and once without a filter such as `{deployment_environment="local", service_version="dev"}`:
   - `clipremix_competitors_added_total`
   - `clipremix_videos_fetched_total` (grouped by `outcome`: `sum by (outcome) (...)`)
   - `clipremix_remixes_created_total`
   - `clipremix_plan_items_added_total`
   - `histogram_quantile(0.95, sum by (le) (rate(clipremix_fetch_duration_seconds_bucket[5m])))` or `clipremix_fetch_duration_seconds_sum`
   - `clipremix_competitors`
   - `clipremix_remix_failures_total` is absent or 0.
7. `make observability-down`.

**Status.** Nobody has opened the Grafana UI or run the steps above by hand.
What has been done is an automated version of the same check on a GitHub
Actions runner, which has Docker: workflow `.github/workflows/observability.yml`
runs `observability/smoke.py`, which starts this stack, runs the backend with
`VIDEO_SOURCE=sample APP_ENV=dev APP_VERSION=<sha>` and OTLP to the Collector,
adds a competitor, fetches videos, creates a remix and adds a plan item (each
with a repeat call and a 404), then queries Prometheus, Loki, Tempo and
Grafana's datasource proxy and fails if anything is missing. It passed in
[run 43735262200](https://github.com/qwopop/competitor-reels-tool/actions/runs/43735262200)
(commit `605419f`); the run's job summary lists the observed names and the raw
query results are in its artifact `observability-results`.

Verified automatically in that run:

- every metric above except `clipremix_remix_failures_total` is exposed by Prometheus, each series with `deployment_environment=dev` and `service_version=<sha>`; the counters read 1 after the repeat calls and 404s (so those are not counted); `clipremix_remix_failures_total` is absent;
- Loki holds the app's log lines under `service_name="clipremix"` and `deployment_environment`, with `service_version`, `trace_id` and `span_id` (every line had both ids);
- Tempo finds a trace by `resource.service.name = "clipremix"` with the three resource attributes and the request span plus database child spans;
- Grafana provisioned the three datasources and answered a query for each through its proxy (`/api/datasources/proxy/uid/<uid>/...`; Grafana's Tempo plugin has no `/health` route, so `/api/echo` is used).

Not verified by anyone: what the Explore screens look like, the Loki-to-Tempo and
Tempo-to-Loki links, and an outgoing YouTube span (the sample source makes no HTTP call).

## Label names for service, environment and version

#81 (dashboard and alert) depends on these names. They are **observed** in
[CI run 43735262200](https://github.com/qwopop/competitor-reels-tool/actions/runs/43735262200)
(see Status above), not predicted.

| Backend | service | environment | version |
| --- | --- | --- | --- |
| Prometheus (labels on every `clipremix_*` series) | `service_name` | `deployment_environment` | `service_version` |
| Loki | `service_name` (stream label) | `deployment_environment` (stream label) | `service_version` (structured metadata, not a stream label: `{service_name="clipremix"} \| service_version="1.2.3"`) |
| Tempo (resource attributes, TraceQL `resource.<name>`) | `service.name` | `deployment.environment` | `service.version` |

Other names seen in the same run:

- **Prometheus** metric names: `clipremix_competitors`, `clipremix_competitors_added_total`, `clipremix_fetch_duration_seconds_bucket`, `_count`, `_sum`, `clipremix_plan_items_added_total`, `clipremix_remixes_created_total`, `clipremix_videos_fetched_total`. Labels on the application series: `deployment_environment`, `service_name`, `service_version`, `service_instance_id`, `telemetry_sdk_language`, `telemetry_sdk_name`, `telemetry_sdk_version`, plus `job` and `instance` from the scrape, `outcome` (on `videos_fetched` and `fetch_duration`) and `le` (histogram buckets). Other labels on the standard HTTP and database metrics: `http_method`, `http_status_code`, `http_target`, `pool_name`, `state` and more.
- **Loki** labels (`/loki/api/v1/labels`): `service_name`, `deployment_environment`, `service_instance_id`. Structured metadata on log lines: `trace_id`, `span_id`, `service_version`, `severity_text`, `severity_number`, `detected_level`, `scope_name`, `flags`, `observed_timestamp`, `telemetry_sdk_*`.
- **Tempo** resource tags (`/api/v2/search/tags?scope=resource`): `service.name`, `deployment.environment`, `service.version`, `service.instance.id`, `telemetry.sdk.language`, `telemetry.sdk.name`, `telemetry.sdk.version`. Span attributes include `http.method`, `http.route`, `http.status_code`, `http.target`, `db.system`, `db.name`, `db.operation`, `db.statement`.
- A trace of `POST /api/content-plan` held six spans: the request span, its `http receive` and `http send` spans, and two `SELECT` database spans.

## Deployed: Grafana Cloud, no Collector

The article this work follows notes that a managed OpenTelemetry-compatible
service such as Grafana Cloud lets you skip deploying the Collector and the
backends yourself. So deployed `dev` and `prod` send OTLP **directly to Grafana
Cloud free** (its free tier needs no card), and only the local stack runs a
Collector. `render.yaml` gives both services `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`
and the owner-set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS`.
Where to find the values and how to set them: "OpenTelemetry (Grafana Cloud)" in
`docs/deploy.md`. Nothing is exported until the owner sets them, and no GitHub
secret or variable is needed.

In Grafana Cloud the same resource attributes identify the environment, so
`dev` and `prod` data are told apart by `deployment.environment`.
