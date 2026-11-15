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
query therefore never fires it; a quiet alert does not prove the app is healthy (see the next sections for slow fetches and uptime).
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

## ClipRemix: slow video fetches

Rule uid `clipremix-fetch-latency`, folder `ClipRemix`, group `clipremix-latency`, evaluated every minute.

**Meaning.** Fetching a competitor's videos (the call to the video source, metric `clipremix.fetch.duration`,
Prometheus `clipremix_fetch_duration_seconds`, all outcomes) is slow. The rule fires for `dev` or `prod`, once per
environment and version, when

> the 95th percentile of fetch time over the last 10 minutes is above **10 seconds**, with **at least 5 fetches** in that window (`increase(..._count[10m]) > 4.5`), and that stays true for **10 minutes** (`for: 10m`).

User impact: the user waits on a spinner after adding a competitor or pressing refresh; 1 in 20 fetches taking more
than 10 seconds (the histogram buckets are 5, 10, 20 and 30 s, so the value is interpolated between 10 and 20 s) means
YouTube or the network is struggling, or the app is starved, for a sustained period, not one slow call. The fetch
timer runs inside the request handler, so it **does not include a Render cold start**: the minute a sleeping service
needs to wake up happens before the app sees the request. The 5-fetch minimum and the 10 minute `for` also keep a
single slow request (for example the first YouTube call after a wake-up) from firing it. Labels and annotations are
the same as for the failure alert; `local` never alerts. Slow fetches that are only errors count too (all outcomes).

**No data is not an alert.** With fewer than 5 fetches in the window (a quiet app) or no series at all (a
sleeping service sends nothing), the query returns nothing, and `noDataState: OK`, `execErrState: OK` keep the rule quiet.
It therefore cannot fire when nobody uses the app; that is the uptime check's job, below.

**First checks.** Open `dashboard_url`: **Fetch latency p50 and p95** for the version. Then **Videos fetched by outcome**
(are errors rising too?), and Tempo traces of `POST /api/competitors/*/fetch` for where the time goes (the urllib child span is
the call to YouTube). If it began with a new version, roll back (`docs/deploy.md`). If YouTube is slow for everyone, wait; there is nothing to fix in the app.
The alert clears by itself when the p95 is back under 10 s for a minute.

## Uptime and the Render free cold start

**Facts.** A Render free web service sleeps after 15 minutes without incoming traffic and needs about a minute
to wake on the next request (the first requests are held or answered 502/503). A sleeping app sends no telemetry.

**What that means for the alerts.** Nothing in Grafana can tell "asleep" from "down", because both look like
absent series. That is why the failure and latency rules treat no data as OK and are built from counts and
percentiles over windows that need real traffic. They cannot fire because a service slept, and a service that
slept and woke while serving traffic does not look slow to them: the fetch timer excludes the wake-up, and a
fresh process starts its counters at zero (a rate needs two samples, and the latency rule needs 5 fetches).

**Uptime check.** Defined as code in `.github/workflows/uptime.yml` and `observability/uptime/check.py`: a scheduled
workflow (hourly, at minute 41) that calls `GET <url>/api/health` for the dev and prod service and passes only on
HTTP 200 with `{"status": "ok", "database": "ok"}`. It is patient on purpose: each attempt waits up to 100 s, a failed
attempt is retried after 30 s, at most 6 attempts, so a service needing a minute or two to wake is reported as
`WOKE` (a `::notice::`, not a failure) and a service is `DOWN` only after at most about 12 minutes (6 x 100 s + 5 x 30 s; much less when attempts fail fast) without a healthy answer.
A failed run is the alert: GitHub emails the person who last edited the workflow's schedule (and shows the run
under Actions). No Grafana contact point or token is needed, and `/api/health` also checks the database, so a dead
Neon connection counts as down.

Settings (Settings, Secrets and variables, Actions, **Variables**): `UPTIME_URL_DEV` and `UPTIME_URL_PROD`, for
example `https://clipremix-dev.onrender.com`. Until at least one exists the workflow skips with
`::notice::Skipping the uptime check`. **The URLs are not set yet, so no real service has been checked**; the
workflow's `selftest` job (push and manual runs) shows the check against a real local app that starts 25 s late.
Scheduled workflows run only from the default branch (`main`) and GitHub disables them after 60 days without
repository activity.

**Decision: tolerate the sleep, do not keep the service warm.** Trade-offs:

- Keeping warm needs a ping every 14 minutes or less. Render gives 750 free instance hours per month per workspace; one service awake all month is about 720 h, so two services (dev and prod) would use up the allowance around day 15 and Render would then suspend them until the month ends. A GitHub schedule also is not exact (runs are delayed or skipped under load), so it would not even reliably keep the service awake.
- Waking is the normal behaviour of the free plan and users of a small tool accept a one minute first load; paging on it would be noise.
- The cost of tolerating: the first visitor after a pause waits about a minute, and the hourly check itself wakes the service, so it is awake for about 15 of every 60 minutes (about 25 percent of the hours, 180 h a month per service, inside the allowance).
- The limit, said plainly: the check proves that the service answered at the time of the check, at most once an hour. An outage between two checks that ends before the next one is not seen, a failure of one feature (remixes, fetch) is covered by the Grafana alerts only while there is traffic, and a cold start longer than about 12 minutes is indistinguishable from an outage (and is reported as one). The check runs from GitHub's network, so it also sees DNS or Render edge problems, but it says nothing about the user's own connection.
- If the owner wants faster detection, lower `cron` in `uptime.yml` (every 30 minutes keeps it awake half the time), or move to a paid instance and set the thresholds down; no other change is needed.

**First checks when the uptime run fails.** Open the run log: `attempt n/6` lines show HTTP status or the error.
503 with `Database unavailable.` means the app is up and Neon is not (check Neon status and the connection string);
timeouts or 502 for all attempts mean the service is suspended, crashed or failing to start (Render dashboard,
Events and Logs; free instance hours used up). A single run that failed while the next one passes was a long wake-up.
