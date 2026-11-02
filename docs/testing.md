# How ClipRemix is tested and shipped

This page explains what was built to take ClipRemix from "works on my
machine" to a deployed site that only ships tested code, following the
article *Deploy a Full-Stack App with AI Coding Assistants* (with Render
instead of AWS).

## What was done, in order

| Step | What changed | Where |
| --- | --- | --- |
| 1. One container | The frontend is built once into static files and FastAPI serves them next to the API. One image instead of two services. `GET /api/health` checks the database and reports the deployed commit. | `Dockerfile`, `backend/app/frontend.py` |
| 2. PostgreSQL | The backend runs on PostgreSQL (psycopg 3) as well as SQLite; hosting URLs like `postgres://…` work as given; existing databases gain new columns on startup. | `backend/app/models.py` |
| 3. Docker Compose | `docker compose up --build` runs the app with PostgreSQL 16 and waits for the database to be healthy. Data lives in the `pgdata` volume. | `docker-compose.yaml` |
| 4. Integration tests | 13 tests against the running stack: the frontend is served, and the backend works with PostgreSQL. | `integration/` |
| 5. End-to-end tests | One Playwright spec per feature, each tracked by a GitHub issue labelled `e2e-test` (#53–#72). | `e2e/` |
| 6. Deployment | The same two services on Render: the Docker image as a web service, plus managed PostgreSQL. | `render.yaml`, `docs/deploy.md` |
| 7. CI/CD | Every push runs all tests; a push to `main` that passes is deployed and checked through `/api/health`. | `.github/workflows/ci.yml` |
| 8. Labels | The `e2e-test` label (orange) is defined as code. | `.github/workflows/labels.yml` |

## The test layers

| Layer | What it checks | Command | Size |
| --- | --- | --- | --- |
| Backend unit and API | Every endpoint, YouTube parsing, remix writing, schema upgrades | `make test` (SQLite) and `make test-postgres` (PostgreSQL) | 178 tests |
| Frontend unit | Pages, components, helpers | `cd frontend && npm test` | 152 tests |
| Integration | The compose stack: frontend served, backend on PostgreSQL | `make integration` | 13 tests |
| End-to-end | Each feature in a real browser against the compose stack | `make e2e` | 20 specs, 59 tests |

All of them run with sample videos (`VIDEO_SOURCE=sample`), so no test
depends on YouTube.

`make e2e` starts from an **empty database**, like CI. Tests used to run
on a database that kept every earlier run's channels. It grew to about
8,000 videos, the Videos page slowed down, and tests timed out for
reasons unrelated to the feature under test.

## CI/CD (GitHub Actions)

```
backend tests (SQLite + PostgreSQL) ─┐
                                     ├─> compose stack: integration + end-to-end ─> deploy (main only)
frontend typecheck, tests, build ────┘
```

The deploy job calls Render's deploy hook (`RENDER_DEPLOY_HOOK_URL` secret)
and then waits until `RENDER_APP_URL/api/health` reports the new commit with
a working database. Render's own auto-deploy is off. Setup: `docs/deploy.md`.

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
