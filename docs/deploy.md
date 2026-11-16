# Deploying ClipRemix: dev and prod on Render and Neon

ClipRemix runs as **two independent copies** of the same stack, `dev` and `prod`.
Each is a Render free web service that runs a Docker image built once by CI
and pulled from GitHub Container Registry, with its own branch of one Neon free PostgreSQL project.

| | `dev` | `prod` |
| --- | --- | --- |
| Render service | `clipremix-dev` | `clipremix-prod` |
| Neon branch | `dev` | `prod` |
| `APP_ENV` | `dev` | `prod` |
| `VIDEO_SOURCE` | `sample` | `youtube` |
| Deployed by | every push to `main` that passes all tests | the manual "Promote dev to prod" workflow, after approval (section 7) |
| Image | `ghcr.io/<owner>/clipremix:<tag>`, built once by CI | the same tag dev runs |

Render doesn't read compose files, so `render.yaml` (a Render *Blueprint*)
describes the two services. Render gives each site HTTPS and a public address.
`/api/health` reports `environment` (`APP_ENV`), `version` (the image tag)
and `database`, so you can always tell which copy you are looking at.

A push to `main` deploys to **dev only**. No CI job uses the `prod` environment.

## 1. Check it locally first

```bash
make up            # the compose stack with sample videos, http://localhost:8100 (APP_ENV=local)
make integration   # integration tests against it
make e2e           # Playwright end-to-end tests against it
make down
```

## 2. Set up Neon (once)

1. Sign in to [Neon](https://neon.com) and create one **project** (PostgreSQL 16 or newer). Its default branch can be renamed to `prod`.
2. Create a second branch named `dev` (**Branches → Create branch**).
3. For each branch open **Connect** and copy the connection string. It must end with `?sslmode=require` (add it if it is missing). `postgres://` and `postgresql://` URLs both work.

You now have two connection strings: one for `dev`, one for `prod`.

## 3. Set up Render (once)

Render **cannot convert a git-backed service into an image-backed one**, so the
owner recreates both services. Do this in order:

1. **Make the GHCR package Public** so Render can pull without credentials. The package `clipremix` exists after the first push to `main` with the `image` job (section 5): open GitHub → your profile or organization → **Packages → clipremix → Package settings → Change visibility → Public**. Check from a machine that is not logged in: `docker pull ghcr.io/<owner>/clipremix:<tag>`.
2. **Create the two image-backed services**, either from `render.yaml` (**New → Blueprint**) or by hand (**New → Web Service → Existing Image**, image `ghcr.io/<owner>/clipremix:<a tag from the Packages page>`, plan **Free**, region Frankfurt, names `clipremix-dev` and `clipremix-prod`). Set Health Check Path `/api/health` and **Auto-Deploy: Off**. The initial image is replaced by the first deploy; Render needs a tag that exists to start, so use the newest one (section 6).
3. **Copy the environment** from the old services: `DATABASE_URL` (Neon `dev` for dev, `prod` for prod), `APP_ENV` (`dev`, `prod`) and `VIDEO_SOURCE` (`sample`, `youtube`). Remove any other database setting.
4. For each new service open **Settings → Deploy Hook** and copy the URL.
5. **Update each GitHub Environment**: set the secret `RENDER_DEPLOY_HOOK_URL` and the variable `RENDER_APP_URL` of `dev` and `prod` to the new services (section 4). No new secret or variable names are needed.
6. **Run a deploy** (push to `main`, or re-run the latest CI run) and check that `/api/health` of dev shows the new tag as `version` (section 8).
7. **Delete the old git-backed services** in Render, and the old Render database (`clipremix-db`) if it still exists. Deleting a database deletes its data.

Until step 5 is done, `deploy-dev` skips with a notice (or, if still set to the old services, calls a hook that ignores `imgURL`: finish step 5 first).

### Plans and limits

- A **free web service sleeps** after 15 minutes without visits; the next visit
  takes about a minute to wake it.
- All free web services in a workspace **share 750 instance hours a month**.
  Two services that never sleep would use about 1,460, so they will sleep
  and the shared budget can run out late in the month.
- The Neon free database **suspends when idle** (scale to zero) and wakes on the
  next connection. The app's database engine uses `pool_pre_ping=True`
  (`app/models.py`, covered by `backend/tests/test_deploy.py`), so connections
  that Neon closed while suspended are replaced instead of failing.

Prices and limits change; check Render's and Neon's pricing pages.

## 4. GitHub settings

Deploy settings live in **GitHub Environments**, not at repository level.

| GitHub Environment | Secret `RENDER_DEPLOY_HOOK_URL` | Variable `RENDER_APP_URL` |
| --- | --- | --- |
| `dev` | Deploy Hook of `clipremix-dev` | `https://clipremix-dev.onrender.com` (the dev service's address) |
| `prod` | Deploy Hook of `clipremix-prod` | `https://clipremix-prod.onrender.com` (the prod service's address) |

Steps:

1. In GitHub open the repository → **Settings → Environments → New environment**, name it `dev`.
2. In `dev`, add the secret `RENDER_DEPLOY_HOOK_URL` and the variable `RENDER_APP_URL` from the table.
3. Create a second environment named `prod` and add its secret and variable the same way. Its required reviewer is set up in section 7.
4. **Delete the old repository-level** secret `RENDER_DEPLOY_HOOK_URL` and variable `RENDER_APP_URL` (Settings → Secrets and variables → Actions). They are not used any more.

Until the `dev` secret and variable exist, the `deploy-dev` job is skipped with a
notice that names what is missing, and the rest of the workflow still runs. The
deploy hook is the only credential GitHub holds: it can start a deploy, nothing else.

## 5. How a deploy works

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Backend tests** (on SQLite and on a PostgreSQL 16 service) and **frontend
   tests** (typecheck, unit tests, production build), in parallel.
2. The **Docker Compose stack** is built and started, then the **integration
   tests** and the **Playwright end-to-end tests** run against it.
3. On a push to **`main`**, once everything passes, job `image` builds the image
   once and pushes it to GHCR (section 6). Pull requests and other branches
   never push an image.
4. `deploy-dev` calls the dev Deploy Hook with `imgURL=<URL-encoded image:tag>`,
   so Render pulls exactly that image. The hook URL is never printed to the log.
   The job then polls `<RENDER_APP_URL>/api/health` for up to 20 minutes until
   `version` is the tag, `environment` is `dev` and `database` is `ok`;
   otherwise it fails with an error.

`render.yaml` sets `autoDeploy: false` on both services, so Render never deploys
an image that hasn't passed the tests. Runs of `deploy-dev` queue (they never
cancel one another halfway).

### Smoke tests on dev (#86)

After `deploy-dev` the job `smoke` (in `.github/workflows/deploy-dev.yml`, environment `dev`) runs the `@smoke` Playwright subset (`e2e/tests/smoke.spec.ts`, `cd e2e && npm run smoke`) against `RENDER_APP_URL`, with `EXPECT_VERSION=<the deployed tag>` and `EXPECT_ENVIRONMENT=dev`, so it proves it tested the version just deployed.

- **Recorded as** the commit status `dev-smoke` on the image's commit (`scripts/smoke/record_status.sh`): `pending` when the run starts, then `success`, `failure` or `error`. The description starts with the image tag. A cancelled run stays `pending`.
- **No new secret or setting.** It uses the `dev` environment's `RENDER_APP_URL` and the workflow's `GITHUB_TOKEN` (`statuses: write`, granted in `ci.yml` and `deploy-dev-branch.yml`).
- **Skips with `::notice::`** when the dev settings do not exist (nothing was deployed), and for tags that are not `YYYYMMDD-HHMMSS-shortsha` (the bug build, which can never be promoted).
- **Specs do not need YouTube.** Dev runs with `VIDEO_SOURCE=sample` (set it as an environment variable of the `clipremix-dev` service in Render, as `render.yaml` does); the smoke tests add a channel through the API and fetch sample videos.
- **Safe on a long-lived database:** four tests. Health (version, environment, database), the five small pages and three list endpoints (read only), and one write path that creates a uniquely named `smoke-…` channel, fetches its 15 sample videos, makes one remix and deletes the channel again in a `finally` (videos and remixes cascade). It never opens `/videos` (renders every stored video) or compares totals, which the full suite does on an empty database.
- **Waking up:** a free dev service may sleep; the job calls `/api/health` first with a 120 s timeout, and Playwright retries once.

`promote.yml` (job `resolve`) runs `scripts/smoke/check_gate.sh` for the tag dev runs and fails with `Promotion refused: ...` unless the newest `dev-smoke` status recorded for exactly that tag is `success`. Missing, pending, failed, stale (the status belongs to another image of the same commit) or unreadable statuses all refuse. **Rollback is not gated** (section 7a): it is the emergency path and needs no smoke run.

If the smoke run fails for a flaky reason, re-run the `smoke` job from the CI run on `main` (Re-run failed jobs); it records a new status. To promote without it there is no switch, by design: push a fix to main.

What is proven where: the gate and recorder logic runs in CI against a mock `gh` (`scripts/smoke/tests`, pass, fail, pending, missing, stale, API error); the smoke spec runs in CI on the compose stack (`ci.yml`, and `smoke-proof.yml`, which has one concurrency group per commit and runs it twice to show it leaves the database empty; run 43758392510 passed, 4/4 tests twice, 0 channels left). The real Render dev and the status call on a real commit need the owner's `dev` environment and are not exercised before it exists.

## 6. Container registry

CI builds the image **once** and Render only **pulls** it. Building in each
environment (as before: Render built from the repository for dev, and again for
prod) means prod could run something dev never ran. With separate stages, the
bytes that passed the tests and ran on dev are the bytes promoted to prod, and a
deploy is a quick pull instead of a build.

- **Image:** `ghcr.io/<owner lowercase>/clipremix` (public package, free).
- **Tag:** `YYYYMMDD-HHMMSS-shortsha`, for example `20261115-153000-a1b2c3d`: UTC build time and the first 7 characters of the commit. It is computed once per run and fails the job if the format is wrong. Only this tag is pushed, never `latest`.
- **Labels:** `org.opencontainers.image.source` (the repository) and `org.opencontainers.image.revision` (the full commit sha).
- **Version in the app:** the tag is passed as the `APP_VERSION` build argument, so `/api/health` reports it as `version`.
- **Permissions:** the `image` job has `packages: write` and logs in with the `GITHUB_TOKEN`. No new secret.
- **Reuse:** the build lives in the reusable workflow `.github/workflows/build-image.yml` (`workflow_call`, outputs `tag` and `image`), so other workflows can call it.
- **Newest tag:** open the latest successful CI run on `main` (its summary prints the full image reference), or the repository's **Packages → clipremix** page, or ask dev: `curl <dev url>/api/health`.
- **Re-running a failed `image` job** computes a new timestamp, so it pushes a new tag and never fails because a tag exists. The earlier tag, if it was pushed, stays until it is cleaned up (#85). Then re-run `deploy-dev` too, since it needs the new tag.
- The job warns (not fails) if the image cannot be pulled without login: the package is still private (section 3, step 1).

## 7. Promote to production

Prod is only deployed by the manual workflow `.github/workflows/promote.yml`
("Promote dev to prod"). It deploys **the image that dev is running**, so what
you tested on dev is exactly what reaches prod. Nothing is rebuilt.

**Set up the `prod` environment (once, owner):**

1. Create the `prod` environment and add its secret `RENDER_DEPLOY_HOOK_URL` and variable `RENDER_APP_URL` (section 4). The `dev` environment needs its `RENDER_APP_URL` variable too, because the workflow reads dev's version from it. No other secrets or variables are used.
2. Open **Settings → Environments → prod → Required reviewers**, tick it, and add the person who approves production deploys (up to 6 people or teams). Required reviewers are free on a public repository.
3. **Prevent self-review must be off** if you are the only reviewer, because you start the workflow yourself and could not approve your own run otherwise.
4. Save protection rules.

**Run it:**

1. **Actions → Promote dev to prod → Run workflow**, branch **`main`** (any other branch is refused).
2. Job `resolve` reads `<dev RENDER_APP_URL>/api/health` and writes the version to the run summary. It fails with an error if dev is unreachable, if dev's `environment` is not `dev`, if the version is not an image tag (for example `dev`, when no tag is known), if `ghcr.io/<owner>/clipremix:<tag>` does not exist (checked with `docker buildx imagetools inspect`), or if the tag's short sha is not a commit on `main` (for example an image deployed to dev by hand).
3. Job `promote` then waits for the reviewer. The reviewer opens the run, reads the version in the summary and clicks **Review deployments → Approve**.
4. If prod already reports that version, the job ends with a notice and does not deploy. Otherwise it writes prod's current version to the summary and the log (`Previous prod version: <tag>`, used by the rollback, section 7a), calls prod's deploy hook with `imgURL=<image:tag>` and polls `<prod RENDER_APP_URL>/api/health` for up to 20 minutes until `version` is the tag, `environment` is `prod` and `database` is `ok`.

If the settings are missing, the jobs end with a notice that names them instead of failing.
Runs queue in the concurrency group `deploy-prod` and never cancel one another.

## 7a. Roll back prod

If a promoted release misbehaves, restore the previous image with the manual workflow
`.github/workflows/rollback.yml` ("Roll back prod"). It uses the same `prod`
environment, secret `RENDER_DEPLOY_HOOK_URL`, variable `RENDER_APP_URL`, required
reviewer and `deploy-prod` concurrency group as the promotion, so there is nothing new
to set up. Nothing is rebuilt: Render pulls the old image from GHCR.

**Steps:**

1. **Actions → Roll back prod → Run workflow**, branch **`main`** (any other branch is refused).
2. Leave `image_tag` empty to restore the version prod ran before the last promotion, or enter a tag (`YYYYMMDD-HHMMSS-shortsha`, for example `20261110-100000-aaaaaaa`) to go back further. Tags are listed under **Packages → clipremix**; an older promote run's summary also shows "Prod ran version ...".
3. Job `resolve` picks the tag, checks its format and that `ghcr.io/<owner>/clipremix:<tag>` exists (`docker buildx imagetools inspect`), and writes the tag to the run summary. It fails if the tag is malformed or missing from GHCR.
4. Job `rollback` waits for the reviewer, who reads the tag in the summary and clicks **Review deployments → Approve**.
5. It calls prod's deploy hook with `imgURL=<image:tag>` and polls `<prod RENDER_APP_URL>/api/health` for up to 20 minutes until `version` is the tag, `environment` is `prod` and `database` is `ok`. If prod already runs the tag, it ends with a notice and deploys nothing.

**Where the default comes from:** `promote.yml` prints `Previous prod version: <tag>` in the log of its "Check what prod runs now" step. `resolve` reads it from the newest successful promote run in which the deploy step actually ran (a "prod already runs it" promotion is skipped). GitHub keeps logs 90 days. If no such run exists, or prod's version was unknown, the run fails with a message asking for `image_tag`; an explicit input always wins.

**Missing settings:** if the prod secret or variable is missing, the `rollback` job ends with a `::notice::` naming them. `resolve` runs first without the environment, so it still validates the tag (and fails if there is nothing to roll back to).

**What it does not do:**

- It does not undo database changes. Prod's database keeps whatever the newer version wrote or migrated (`upgrade_schema` only adds columns, so the older version normally still runs, but data from the newer version stays). Restore a backup separately if needed.
- It does not change dev, `main` or the promote record. Dev keeps running the newer image, so promoting again would redeploy the bad release: fix it or deploy a fixed image to dev first.
- The old image must still exist: the GHCR clean-up (section on clean-up, `keep`) deletes old tags, so raise `keep` for a longer rollback window.

Tested without Render: `scripts/rollback/test_rollback.sh` runs every `run` block of the workflow against mocks (gh, docker, curl). The real deploy needs the owner's prod service and has not been run.

## 8. Check it works

1. Open `https://<dev-service>.onrender.com/api/health`. It should return
   `{"status":"ok","database":"ok","version":"<image tag>","environment":"dev"}`.
   The first request after a sleep takes about a minute.
2. Open the site, add a YouTube channel (or a sample one on dev), fetch its videos, and reload. The data is still there, so the Neon branch is connected.
3. Do the same on prod; it must show `"environment":"prod"` and its own data.
4. API documentation is at `/docs`.

Without `DATABASE_URL` the app falls back to a SQLite file inside the
container, which is lost on every deploy.

## OpenTelemetry (Grafana Cloud)

The app can send traces, metrics and logs over OTLP straight to **Grafana Cloud
free**, with no Collector to run (the reasoning is in `docs/observability.md`).
`render.yaml` declares, for both services:

| Render variable | Value |
| --- | --- |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` (set in `render.yaml`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | the OTLP endpoint of your Grafana Cloud stack (you set it, `sync: false`) |
| `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic%20<base64 instance-id:token>` (you set it, `sync: false`) |

Where to find them: sign in to Grafana Cloud, open **Connections → OpenTelemetry** (or
**Connections → Add new connection → OpenTelemetry**), choose **Create a token**, and copy
the endpoint (like `https://otlp-gateway-<zone>.grafana.net/otlp`) and the header it
shows. The header value is `Authorization=Basic%20` followed by the base64 of
`<instance id>:<token>`. Set the same endpoint on both services; `dev` and `prod`
are told apart by `deployment.environment` (`APP_ENV`).

**Write `Basic%20`, not `Basic ` with a space.** The Grafana page shows a space, but the
OpenTelemetry Python SDK requires header values in environment variables to be URL
encoded and silently drops a header that has a space (checked with the SDK this app
pins: `parse_env_headers("Authorization=Basic xyz")` returns `{}`, while
`Authorization=Basic%20xyz` returns the header). Without the header every export is
rejected as unauthenticated. Grafana's own docs give the same advice for Python. The
base64 text is `base64("<instance id>:<token>")`, e.g.
`printf '%s' '<instance id>:<token>' | base64 -w0` (never paste the token into chat or
a commit).

**Nothing is exported until you set `OTEL_EXPORTER_OTLP_ENDPOINT`.** Without it the
app makes no telemetry connection at all. No GitHub secret or variable is needed.
Treat the header as a secret: it is only ever stored in Render.

## Grafana Cloud (dashboard and alert rule)

The dashboard `clipremix-app` and the alert "ClipRemix: repeated remix failures" are stored as JSON in
`observability/grafana/` and applied by `observability/grafana/apply.py`, which the workflow
`.github/workflows/grafana.yml` runs on every push to `main` that changes `observability/grafana/**`
(or by hand: **Actions, Grafana Cloud, Run workflow**). Until you create the settings below the workflow
skips with a notice naming what is missing.

1. **Stack.** Sign up at grafana.com for Grafana Cloud free (no card), create a stack, and note its URL, `https://<stack>.grafana.net`. Metrics from the app (see "OpenTelemetry" above) land in that stack's Prometheus data source.
2. **Service account and token.** In the stack open **Administration, Users and access, Service accounts**, add a service account with the role **Editor** (it needs to write dashboards, folders, alert rules and notification policies; **Admin** also works), then **Add service account token** and copy it (`glsa_...`). It is shown once.
3. **Repository settings** (GitHub: Settings, Secrets and variables, Actions):
   - variable `GRAFANA_URL` = `https://<stack>.grafana.net` (a variable, not a secret; no trailing path)
   - secret `GRAFANA_API_TOKEN` = the token. The scripts never print it.
4. Push to `main`, or run the workflow by hand. A second apply must report `0 change(s)`.
5. **Where to look.** Dashboard: **Dashboards, ClipRemix, ClipRemix application**. Alert rule: **Alerting, Alert rules, ClipRemix, ClipRemix: repeated remix failures**; firing alerts: **Alerting, Active notifications** (older versions: Alert groups). Notifications go to the default contact point (`grafana-default-email`): put your address on it under **Alerting, Contact points**.

The apply script picks the default Prometheus data source of the stack; if the stack has several, set
`GRAFANA_PROMETHEUS_DATASOURCE` to the name of the one that holds the app metrics (in Grafana Cloud usually `grafanacloud-<stack>-prom`).
It replaces the stack's **root notification policy** with `observability/grafana/alerting/notification-policy.json`.
Rules and the dashboard are created with `X-Disable-Provenance`, so they stay editable in the UI, and the next apply overwrites such edits.

Locally: `make observability-up`, then `make grafana-apply-local` (no token needed). `make grafana-dry-run` only validates.
Free tier: one dashboard, two rule groups with one rule each (remix failures, slow fetches), a few series per environment and version.

### Uptime check (#87)

`.github/workflows/uptime.yml` pings `/api/health` of the deployed services hourly. Repository **variables** `UPTIME_URL_DEV` and
`UPTIME_URL_PROD` (`https://<service>.onrender.com`); it skips with a notice until one exists. How the Render free sleep is handled
(tolerated, not kept warm), why and what it cannot see: "Uptime and the Render free cold start" in `docs/runbook.md`.

### Secrets and variables for the on-call engineer (#82)

Repository level (Settings, Secrets and variables, Actions), used by `.github/workflows/on-call.yml`; it skips with a notice until they exist.
Details in `docs/on-call.md`.

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `GRAFANA_URL` | `https://<stack>.grafana.net` (shared with the Grafana Cloud workflow) |
| Secret | `GRAFANA_ALERT_TOKEN` | read-only (Viewer) Grafana service account token |
| Secret | `GEMINI_API_KEY` | free key from Google AI Studio |
| Variable (optional) | `GEMINI_MODEL` | Gemini model, default `gemini-3.5-flash`; the CLI's default model is retired for new keys |

## Backups and restore (#84)

`.github/workflows/backup-db.yml` runs `pg_dump` against the prod Neon branch every day at 03:17 UTC (and on `workflow_dispatch`). Free tooling only: a GitHub-hosted runner and a workflow artifact.

### Secrets (repository level)

| Secret | Value |
| --- | --- |
| `NEON_PROD_DATABASE_URL` | connection string of the Neon `prod` branch. A read-only role is enough for `pg_dump`. |
| `BACKUP_PASSPHRASE` | long random passphrase the dump is encrypted with. Keep a copy in your password manager: without it a backup is useless. |
| `NEON_SCRATCH_DATABASE_URL` | optional. A scratch Neon branch (see below). If set, every backup is restored there and the row counts are compared with prod. |

Until the first two exist, the `backup` job skips with a `::notice::` and the run stays green. The workflow's `rehearsal` job needs no secret.

### Where the dump goes and why it is encrypted

This repository is public, so anyone can download workflow artifacts. The dump is therefore encrypted before it is written to disk: `pg_dump | openssl enc -aes-256-cbc -pbkdf2` (`scripts/backup/backup.sh`). The plain dump is never a file and is never printed; the scripts do not echo any secret. The artifact `clipremix-prod-backup` is kept **30 days** (`retention-days` in the workflow; GitHub allows up to 90 on a public repo). Chosen alternative rejected: private storage, because every free option needs another account and secret.

### Restore

Download the artifact (Actions run, Artifacts, or `gh run download <run-id> -n clipremix-prod-backup`), then restore into an **empty** database or Neon branch. `pg_restore` and `openssl` are needed, and `pg_restore` must be the same major version as the dump or newer, and the target server at least as new as the dump. The first CI rehearsal proved this the hard way: a dump made by `pg_dump` 17 does not load into a PostgreSQL 16 server (`unrecognized configuration parameter "transaction_timeout"`). The workflow sets `PG_VERSION: 17`; change it to the major version shown in the Neon console for the project.

```
export BACKUP_PASSPHRASE='...'
export TARGET_DATABASE_URL='postgresql://user:pass@host/db?sslmode=require'
scripts/backup/restore.sh clipremix-prod-YYYYMMDD-HHMMSS.dump.enc
scripts/backup/counts.sh "$TARGET_DATABASE_URL"        # rows per app table
```

For a target that already has tables (a scratch branch), add `RESTORE_CLEAN=1` before `scripts/backup/restore.sh`. Without the script: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in FILE | pg_restore --no-owner --no-privileges --dbname "$TARGET_DATABASE_URL"`.

To bring prod back after data loss: create a new Neon branch (or database), restore into it, check the counts, then set Render's `DATABASE_URL` of the prod service to it (or restore into the prod branch after wiping it) and redeploy.

### Neon point-in-time restore (free tier, as of writing: November 2026)

Neon's own restore ("Restore" on the branch page, or branching from a past timestamp) only covers the **history retention window, 6 hours on the free plan** (limited to about 1 GB of changes). Anything older than that, or lost after the window, can only come from these dumps. Neon changes these limits from time to time; check its pricing page. Prefer point-in-time restore for a mistake you notice within hours, and the dump for everything else.

### What was exercised

- **Real PostgreSQL in CI (done):** the `rehearsal` job starts PostgreSQL 17, creates the app schema with some rows, runs `backup.sh`, checks the file is encrypted and that a wrong passphrase fails, restores into a fresh database and compares the row count of every app table (`competitors`, `videos`, `remixes`, `content_plan`). The same check runs in the backend tests (`backend/tests/test_backup.py`, with `make test-postgres`) and by hand: `scripts/backup/rehearse.sh postgresql://user:pass@localhost:5432/postgres`.
- **Restore into a scratch Neon branch (not yet exercised):** the agent that built this has no Neon account access, so this was not run against Neon. To do it once: in Neon create a branch `scratch` from `prod`, add its connection string as `NEON_SCRATCH_DATABASE_URL`, and run the workflow by hand. The `backup` job then restores the dump there and fails if the row counts differ from prod. Write the run link and date here after the first pass: _not recorded yet_. Delete the scratch branch afterwards.

## Things to know

- **No login.** Anyone with the address can read and change the data. Add
  authentication before sharing the link widely.
- **Videos come from the YouTube Data API** when `YOUTUBE_API_KEY` is set (next section), otherwise from YouTube's public channel feeds, which YouTube now often answers with 404.
  `VIDEO_SOURCE=sample` gives generated videos instead (used on dev).
- **Version.** `/api/health` reports `APP_VERSION` (the image tag, baked in at build), then `RENDER_GIT_COMMIT`, then `dev`.
- **Old services.** If you created the earlier Blueprint (`reels-api`,
  `reels-web`), delete those services in Render.

## YouTube Data API key (`YOUTUBE_API_KEY`)

YouTube's public Atom feed no longer works for most channels (it answers 404, so "Fetch videos" fails with
"YouTube could not find that channel."). With a key the app uses the YouTube Data API v3 instead:
`channels.list`, `playlistItems.list` and `videos.list` only (never `search.list`).

| `VIDEO_SOURCE` | Behaviour |
| --- | --- |
| `youtube` (default) | The API when `YOUTUBE_API_KEY` is set and not empty, otherwise the public feed (one warning in the log) |
| `youtube_api` | The API only; the app refuses to start without `YOUTUBE_API_KEY` |
| `youtube_feed` | The public feed only, the old behaviour |
| `sample` | Generated videos, no network (dev, tests) |

Get a key:

1. In [Google Cloud Console](https://console.cloud.google.com/) create or pick a project.
2. **APIs & Services, Library**: search **YouTube Data API v3** and **Enable** it.
3. **APIs & Services, Credentials, Create credentials, API key**.
4. Edit the key and under **API restrictions** choose **Restrict key**, select only **YouTube Data API v3**. Do not use HTTP-referrer restrictions: this is a server key and the server sends no referrer (an IP restriction does not fit Render's free plan either).
5. Set it where it is used. GitHub secrets are not visible to Render, so set `YOUTUBE_API_KEY` in Render itself: service `clipremix-prod`, **Environment**, add `YOUTUBE_API_KEY`. Set it on `clipremix-dev` only if dev is switched from `VIDEO_SOURCE=sample`. The repository secret `YOUTUBE_API_KEY` is used only by the workflow `youtube-api-check.yml`.

The key is sent in the `x-goog-api-key` header, never in a URL, so it does not show in logs, traces or error messages. If Google rejects it the app says "The YouTube API key was rejected. Check YOUTUBE_API_KEY and that YouTube Data API v3 is enabled for it." Quota: 10,000 units a day by default, and a fetch costs about 3 units (adding a channel costs 1), so roughly 3,000 fetches a day. When it is used up the app says "The YouTube API daily quota is used up. Try again tomorrow." Rotate by creating a second key, setting it in Render and the GitHub secret, then deleting the old one (cleanup.md).

## Clean up

Everything the DevOps set created, and how to delete each piece and check it is gone: [cleanup.md](cleanup.md). The exercise that proves alert and on-call response end to end: [on-call-exercise.md](on-call-exercise.md).

In Render delete the `clipremix-dev` and `clipremix-prod` services (Settings →
Delete). In Neon delete the project; that deletes both databases and their data.

## Image retention

`.github/workflows/ghcr-cleanup.yml` ("Image retention (GHCR cleanup)") keeps GHCR from filling up with one image per push. It runs weekly and by hand, and is a dry run unless told otherwise: it lists the versions of `ghcr.io/<owner>/clipremix` and prints which would be deleted.

- **Never deleted:** the tag dev runs and the tag prod runs (read from each `/api/health`), the newest `keep` tagged versions (input, default 20), versions with a tag that is not an image tag, and the untagged manifests that a kept image refers to. Untagged versions older than 7 days that nothing refers to are deleted.
- **Fails closed:** if dev or prod is unreachable, reports the wrong environment or a version that is not an image tag, or a kept manifest cannot be read, the run fails and deletes nothing.
- **Setup:** repository variables `DEV_APP_URL` and `PROD_APP_URL` (the same addresses as `RENDER_APP_URL` in the dev and prod environments; they are repository-level so the scheduled run does not wait for the prod reviewer). Without them, or before the package exists, the run skips with a notice.
- **Deleting for real:** Run workflow with `dry_run` off and `confirm` set to `delete`. A scheduled run deletes only if the repository variable `GHCR_CLEANUP_CONFIRM` is `delete`; otherwise it stays a dry run. `packages: write` is granted only to the `delete` job; the plan job has `packages: read`.
- Rollback needs an older tag: raise `keep` if you want a longer rollback window.
