# How ClipRemix is tested and shipped

This page explains what was built to take ClipRemix from "works on my
machine" to a deployed site that only ships tested code, following the
article *Deploy a Full-Stack App with AI Coding Assistants* (with Render
instead of AWS).

## What was done, in order

| Step | What changed | Where |
| --- | --- | --- |
| 1. One container | The frontend is built once into static files and FastAPI serves them next to the API. One image instead of two services. `GET /api/health` checks the database and reports the deployed commit and environment. | `Dockerfile`, `backend/app/frontend.py` |
| 2. PostgreSQL | The backend runs on PostgreSQL (psycopg 3) as well as SQLite; hosting URLs like `postgres://…` work as given; existing databases gain new columns on startup. | `backend/app/models.py` |
| 3. Docker Compose | `docker compose up --build` runs the app with PostgreSQL 16 and waits for the database to be healthy. Data lives in the `pgdata` volume. | `docker-compose.yaml` |
| 4. Integration tests | 13 tests against the running stack: the frontend is served, and the backend works with PostgreSQL. | `integration/` |
| 5. End-to-end tests | One Playwright spec per feature, each tracked by a GitHub issue labelled `e2e-test` (#53–#72). | `e2e/` |
| 6. Deployment | Two copies, dev and prod: each a Render web service that pulls the Docker image CI pushed to GHCR, with its own Neon PostgreSQL branch. | `render.yaml`, `docs/deploy.md` |
| 7. CI/CD | Every push runs all tests; a push to `main` that passes is deployed to dev and checked through `/api/health`. | `.github/workflows/ci.yml` |
| 8. Labels | The `e2e-test` label (orange) is defined as code. | `.github/workflows/labels.yml` |

## The test layers

| Layer | What it checks | Command | Size |
| --- | --- | --- | --- |
| Backend unit and API | Every endpoint, YouTube parsing, remix writing, schema upgrades, OpenTelemetry signals and metrics (in-memory exporters, `tests/test_telemetry.py`), observability config files | `make test` (SQLite) and `make test-postgres` (PostgreSQL) | 211 tests |
| Frontend unit | Pages, components, helpers | `cd frontend && npm test` | 152 tests |
| Integration | The compose stack: frontend served, backend on PostgreSQL | `make integration` | 13 tests |
| End-to-end | Each feature in a real browser against the compose stack | `make e2e` | 20 specs, 59 tests |

| Smoke (dev) | The `@smoke` subset, `e2e/tests/smoke.spec.ts`: health, pages, list endpoints, one add/remix/delete cycle that cleans up after itself | `cd e2e && npm run smoke` | 4 tests |

The smoke subset is also run against the dev site after every deploy, and promotion to prod needs it to have passed (see below).

All of them run with sample videos (`VIDEO_SOURCE=sample`), so no test
depends on YouTube.

`make e2e` starts from an **empty database**, like CI. Tests used to run
on a database that kept every earlier run's channels. It grew to about
8,000 videos, the Videos page slowed down, and tests timed out for
reasons unrelated to the feature under test.

## CI/CD (GitHub Actions)

The deliberate bug is only a patch (`scripts/bugs/`, never committed to the app): `bug-patch.yml` runs `scripts/bugs/apply-and-test.sh` (existing suite passes with it, remix fails for a subset), `bug-chain.yml` shows the real patched app firing the alert on the local stack, and `backend/tests/test_bug_patch.py` keeps it out of the code and checks that promotion refuses the `bugtest-` image tag.

The end-to-end exercise with a deliberate bug (alert, on-call run, fix pull request) is in [on-call-exercise.md](on-call-exercise.md); deleting everything the DevOps set created is in [cleanup.md](cleanup.md).

The on-call engineer (poller, patch guard, fake agent) has its own tests in `on-call-engineer/tests/`, run by the backend job; see [on-call.md](on-call.md).

The prod database backup (`.github/workflows/backup-db.yml`, scripts in `scripts/backup/`) has a `rehearsal` job that backs up a seeded PostgreSQL 17 service, restores it into a fresh database and compares row counts; the same rehearsal runs from `backend/tests/test_backup.py` when `TEST_DATABASE_URL` is set. See [deploy.md](deploy.md#backups-and-restore-84).

A separate workflow, `.github/workflows/observability.yml`, starts the observability stack and the backend on a runner and runs `observability/smoke.py` (metrics in Prometheus, logs in Loki, a trace in Tempo, datasources in Grafana); see `docs/observability.md`.

```
backend tests (SQLite + PostgreSQL) ─┐
                                     ├─> compose stack: integration + end-to-end ─> image ─> deploy-dev
frontend typecheck, tests, build ────┘                                      (main only: build once, push to GHCR, deploy)

manual "Promote dev to prod":  resolve (read dev's tag, check image + commit on main) ─> promote (prod reviewer, same image)
```

The `image` job (main only, `permissions: packages: write`, no new secret) calls
the reusable workflow `.github/workflows/build-image.yml`. It builds the image
once with the `APP_VERSION` build argument and pushes
`ghcr.io/<owner>/clipremix:YYYYMMDD-HHMMSS-shortsha`. Pull requests and other
branches never push an image.

The `deploy-dev` job runs in the GitHub Environment `dev`. It calls the dev
service's Render deploy hook (`RENDER_DEPLOY_HOOK_URL` secret) with
`imgURL=<image:tag>` and then waits until `RENDER_APP_URL/api/health` reports
that tag as `version`, `environment` `dev` and a working database. Prod is never
deployed by a push. Render's own auto-deploy is off. Setup: `docs/deploy.md`.

Prod is deployed only by the manual workflow `.github/workflows/promote.yml`
("Promote dev to prod", `workflow_dispatch`, branch `main` only). Job `resolve`
(environment `dev`) reads the version from dev's `/api/health` and fails unless
it is an image tag, `ghcr.io/<owner>/clipremix:<tag>` exists and the tag's short
sha is a commit on `main`. Job `promote` (environment `prod`, so it waits for the
required reviewer) skips if prod already runs that tag, otherwise calls prod's
deploy hook with `imgURL=<image:tag>` and polls prod's `/api/health` for 20
minutes. It builds nothing: prod runs the exact image dev runs. Missing settings
skip with a notice. The shell logic is checked locally by running the workflows'
`run` blocks with mocked `curl`, `docker` and `jq` inputs; the full flow runs only
on GitHub. See "Container registry" and "Promote to production" in `docs/deploy.md`.

## Smoke tests on dev before promotion (#86)

After the dev deploy, job `smoke` in `deploy-dev.yml` runs `npm run smoke` (the specs tagged `@smoke` in `e2e/tests/smoke.spec.ts`) with `BASE_URL` set to dev. It is the only part of `e2e/` meant for a long-lived database: it never opens `/videos`, never counts totals, and its single write test deletes what it created. The full suite stays on the compose stack. The result is the commit status `dev-smoke` on the image's commit; `promote.yml` runs `scripts/smoke/check_gate.sh` and refuses a tag without a successful, matching status. Rollback is not gated. The gate and the status recorder are tested with a mock `gh` (`cd backend && uv run python -m pytest ../scripts/smoke/tests`, part of the backend CI job), and the subset runs on the compose stack in `ci.yml`. Details and settings: `docs/deploy.md`.

## How the end-to-end backlog was worked

The backlog of 20 `e2e-test` issues went through the team process in
`_docs/process.md`, with each role as a separate agent:

1. **PM** rewrote each issue into `_docs/task-template.md` (Goal, checkable
   acceptance criteria, out of scope, constraints) and filed follow-ups
   for real gaps it found: #73 (a channel added by ID shows as `@uc…`) and
   #74 (a remix save sends every field, not only changed ones).
2. **Engineer** implemented each issue's spec against its criteria,
   committed it on its own, and commented on the issue.
3. **QA** checked every criterion against the running app and posted
   `## QA: PASS` or `## QA: FAIL`. Five issues failed at first because
   specs timed out on the large shared database; they went back to the
   engineer, were made robust, and passed on re-check.
4. Issues were closed only after QA passed. #61 was closed by the owner
   after the full suite passed on a fresh database (59/59).

Bugs the end-to-end tests found and fixed along the way: after an
invalid entry in **Add competitor**, the error stayed and hid the channel
preview; the **Go to videos** page had no tab title.

## Still open

- #73, #74: the follow-ups above.
- The Videos page loads every video at once; a large library is slow.
- The deployed site has no login.

## Image retention (#85)

`scripts/ghcr/ghcr_cleanup.py` holds the selection logic of `.github/workflows/ghcr-cleanup.yml`; `scripts/ghcr/tests/` tests it with mock package-version data (newest N, protected tags, non-image tags, untagged versions and referenced manifests, failing closed on bad health data, unreadable manifests, delete refusing a protected tag). Run with `cd backend && uv run python -m pytest ../scripts/ghcr/tests`. The workflow runs these tests first, then a dry run against the real package (skips with a notice if it does not exist). Deleting for real is never part of CI.
