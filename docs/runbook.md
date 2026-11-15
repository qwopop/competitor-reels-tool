# Runbook: ClipRemix alerts

Alert rules live in `observability/grafana/alerting/` and are applied by
`observability/grafana/apply.py` (see `docs/observability.md` and the "Grafana Cloud" section in `docs/deploy.md`).

Dashboard: `<grafana>/d/clipremix-app/clipremix-application` (variables **Environment** and **Version**;
the alert's `dashboard_url` already has both set). Locally: http://localhost:3000/d/clipremix-app/clipremix-application.

## ClipRemix: repeated remix failures

Rule uid `clipremix-remix-failures`, folder `ClipRemix`, evaluated every minute.

**Meaning.** The backend counted unexpected errors (HTTP 500) while creating a remix, applying a template to it
or updating it: metric `clipremix.remix.failures` (Prometheus `clipremix_remix_failures_total`). The rule fires
for `dev` or `prod`, once per environment and version, when

> `increase(clipremix_remix_failures_total[5m]) > 4.5` (5 or more failed operations in 5 minutes), and that stays true for 5 minutes (`for: 5m`).

Why these numbers, as user impact: a user who cannot save a remix retries a few times, so one unlucky request
or one user's retries is below 5; 5 failures within 5 minutes that last another 5 minutes means remix saving is
broken for people right now, not a blip. `increase()` extrapolates between samples, so 4.5 is used to mean "5 or more"
without firing on 4. A 404 and other 4xx responses do not count. `local` never alerts. Fetch errors (`outcome="error"`
of `clipremix_videos_fetched_total`) are YouTube or network problems that are not ours to fix, so they stay on the dashboard only.

**No data is not an alert.** The counter does not exist until the first failure, and a sleeping Render free
service sends nothing, so the rule has `noDataState: OK` and `execErrState: OK`. A missing series or a broken
query therefore never fires it; a quiet alert does not prove the app is healthy (uptime and latency alerts are #87).
Limit: when the counter first appears (first failure after a restart) the first sample is not a rate, so that
first failure is not counted; a continuing failure is.

Labels: `service=clipremix`, `environment`, `version`, `owner` (GitHub login of the repo owner).
Annotations: `summary`, `description`, `dashboard_url`, `runbook_url` (this file).

**First checks.**

1. Open `dashboard_url`. **Remix failures** shows when it started and for which version; **Remixes created** shows whether successes continue (partial failure) or stopped (total failure).
2. Did a deploy just happen? Compare the `version` label with the latest deploy of that environment (Render, or the GitHub Actions deploy run). If the failures began with a new version, roll it back by redeploying the previous image (`docs/deploy.md`, "Promote to production").
3. Look at the logs in Grafana (Explore, Loki): `{service_name="clipremix", deployment_environment="<environment>"} |= "error"`, and the traces for failing requests in Tempo: `{ resource.service.name = "clipremix" && span.http.status_code = 500 }` (local stack; in Grafana Cloud use its Loki and Tempo data sources).
4. Is the database reachable? Failures here are raised by the store, so check Neon (status page, connection limits) and the `/api/health` response of the service.
5. Is the service waking from sleep (Render free)? Failures right after a wake-up that stop by themselves are not an incident.

**Resolve.** The alert clears by itself once fewer than 5 failures happened in the last 5 minutes. Silence it
in Grafana (**Alerting, Silences**) only while you are fixing it.
