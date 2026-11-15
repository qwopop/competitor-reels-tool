# On-call exercise: a realistic bug, from alert to pull request

The goal (#88): show that the whole chain works on a bug that passes every test. A change that looks like a feature
breaks remix creation for some videos on dev; the dashboard (#81) shows it, the alert (#81) fires, the on-call engineer
(#82, [on-call.md](on-call.md)) wakes up, and a pull request with a fix and a regression test arrives for a human to review.

## Status: what has and has not been done

Read this first. The task is **not** marked done by pretending the live run happened.

| Part | State |
| --- | --- |
| The bug on a throwaway branch, its pull request, CI green on it | **Done** (below) |
| `scripts/remix-all-videos.sh`, partial failures on sample videos | **Done**, run locally (below) |
| `deploy-dev-branch.yml` (build and deploy a branch to dev only) | **Written**, built on the shared workflows. **Not run on GitHub**: it needs the owner's Render dev service |
| Promotion of the bug build is refused | **Checked locally** with the real `resolve` step of `promote.yml` and a mocked dev. **No link to a failed GitHub run exists** (needs a live dev service running the bug build) |
| Dashboard shows the failures, alert fires in Grafana Cloud, on-call run, `on-call/...` pull request | **Not done live.** Needs the owner's Render, Neon, Grafana Cloud and Gemini accounts, which do not exist yet. Missing links are marked **(missing)** below |
| The local run (stack on this machine, no accounts) | **Written as steps.** What has been run on this machine is marked in each step |

Links still missing until the live run: the Render dev deploy of the bug build, the Grafana Cloud dashboard panel and
screenshot (`docs/screenshots/`), the firing alert, the on-call workflow run, the `on-call/...` pull request.

## 1. The bug

Branch `bug/remix-intermittent-failure`, pull request **do not merge** (draft; its base is `claude/gallant-pascal-355cez`
so that the diff shows only the bug). The change looks like a small nicety: *keep acronyms in remix titles in their
standard spelling* (`SAAS` becomes `SaaS`). In `backend/app/remix.py` the pattern that finds acronyms lists
`AI|SAAS|API|UI|SEO|CRUD|LLM|CSS|RAG|SQL|MVP`, but the lookup table has only `ai`, `saas`, `api`, `ui` and `seo`. Any title that
shouts `CRUD`, `LLM`, `CSS`, `RAG`, `SQL` or `MVP` raises `KeyError`, and `POST /api/videos/{id}/remix` returns **HTTP 500**.
`.get(word, word)` would have been the fix.

**Condition:** the video's title contains one of `CRUD`, `LLM`, `CSS`, `RAG`, `SQL`, `MVP` as a whole upper-case word.

**Why every test passes:** no test, sample or fixture uses those words in capitals, and `AI` (which the tests do use) is in the table.

**Sample videos** (`VIDEO_SOURCE=sample`, which dev serves): a fetch creates 15 videos with fixed titles. Three are hit:

| Title | Remix |
| --- | --- |
| Stop hand-coding **CRUD** — this prompt does it for you | 500 |
| The workflow: **LLM**-as-frontend-engineer | 500 |
| I stopped writing **CSS**. Here is what replaced it | 500 |
| the other 12 | 201 |

Run on this machine against the bug build with `scripts/remix-all-videos.sh` (section 2): `HTTP 201: 12`, `HTTP 500: 3`, and
the app log showed three `KeyError` tracebacks. On `main` the same script gives `HTTP 201: 15`.

Reproduce with `curl` (sample source):

```bash
base=http://localhost:8092
comp=$(curl -s -X POST $base/api/competitors -H 'Content-Type: application/json' \
  -d '{"channelUrl":"https://www.youtube.com/@reprocheck"}' | jq -r .id)
curl -s -X POST $base/api/competitors/$comp/videos/fetch > /dev/null
vid=$(curl -s $base/api/videos | jq -r '[.[] | select(.caption | test("CRUD"))][0].id')
curl -i -X POST $base/api/videos/$vid/remix        # HTTP/1.1 500 Internal Server Error on the bug build, 201 on main
```

CI on the branch is green with the bug in place: backend tests on SQLite and PostgreSQL, frontend tests, integration and end-to-end
tests. Run: [run 43738295297](https://github.com/qwopop/competitor-reels-tool/actions/runs/43738295297) (commit `f38f339`). The bug is never merged and never promoted.

## 2. `scripts/remix-all-videos.sh`

`scripts/remix-all-videos.sh <base-url>` lists every video (`GET /api/videos`), requests a remix for each and prints the status
codes and a count (`201` created, `200` already had one, `500` failed). `SEED_CHANNEL=<handle>` adds a channel and fetches its
videos first when the app has none (sample source only). It exits 1 only when the app cannot be reached, because a 500 is what it
is there to show. Run again, the failing videos fail again (a failed remix is never stored) while the others answer 200: three
500s per run, which is what keeps the alert's failure count growing.

## 3. Deploying the bug to dev, and only dev

**Actions, "Deploy a branch to dev", Run workflow, branch `bug/remix-intermittent-failure`.** The workflow
(`.github/workflows/deploy-dev-branch.yml`) calls the same reusable workflows as `ci.yml` does for `main`:
`build-image.yml` (tag `YYYYMMDD-HHMMSS-shortsha`, pushed to GHCR) and `deploy-dev.yml` (the dev deploy hook with `imgURL`, then
waits for `/api/health` to report that tag). Nothing is copied, and no step touches the `prod` environment: `deploy-dev.yml` is
hard-wired to the `dev` environment. To return dev to `main`, push to `main` (or re-run the last CI/CD run on `main`).
Run: **(missing)**, needs the dev Render service.

## 4. Promoting the bug build fails

Run **Actions, "Promote dev to prod"** on `main` while dev runs the bug image. Its `resolve` job reads the tag from dev's `/api/health`,
finds the image, and then stops: the tag's commit is not an ancestor of `origin/main`.

```
::error::Commit 843edd2 of image tag 20261115-170000-843edd2 is not on main (for example an image deployed to dev by hand). Deploy an image built from main to dev first.
```

That output is from the real `resolve` step of `promote.yml`, run on this machine in a scratch git repository with `curl` mocked to
answer a dev health reply for a commit that is on a side branch (so it shows the check, not a live run). The failed GitHub run:
**(missing)**, link it here after the live run.

## 5. The chain, live (needs the owner's accounts)

Do this once the owner has done the steps in `docs/deploy.md` (Render, Neon, Grafana Cloud, `docs/on-call.md` settings).

1. Run "Deploy a branch to dev" on the bug branch. Check `https://<dev>/api/health` reports the bug build's tag.
2. `scripts/remix-all-videos.sh https://<dev>` every 30 seconds for about 15 minutes (`while true; do scripts/remix-all-videos.sh https://<dev> | tail -4; sleep 30; done`). The first pass is a mix of 201 and 500; the 500s repeat.
3. Open the dashboard (`<grafana>/d/clipremix-app/clipremix-application`, Environment `dev`, Version = the bug build's tag): **Remix failures** rises while **Remixes created** stays flat after the first pass. Save a screenshot as `docs/screenshots/on-call-dashboard.png`. **(missing)**
4. After about 10 minutes (`increase(...[5m]) > 4.5`, `for: 5m`) the alert **ClipRemix: repeated remix failures** goes to firing with `service`, `environment`, `version`, `owner` and `dashboard_url`. Link: **(missing)**
5. The on-call workflow (`on-call.yml`, every 5 minutes at best) picks it up. Its run log shows the poll, the agent start and the agent's explanation. Run: **(missing)**
6. A pull request from `on-call/<alert name>-dev-<run id>` appears, with a fix and a regression test that fails on the bug build and passes on the fix, backend tests green on SQLite and PostgreSQL. Check that nothing was pushed to `main` and nothing merged by automation. Pull request: **(missing)**
7. Stop the loop. Put a good build back on dev by pushing to `main` (or re-running CI/CD on `main`), then close the exercise pull requests (`docs/cleanup.md`).
8. Write up the timeline here: when each step happened, the links above, and what the agent got right or wrong. **(missing)**

## 6. The chain, locally (no accounts)

Everything runs on one machine: the app on the bug branch, the local observability stack (#80), the dashboard and alert
(#81) in the local Grafana, and the on-call engineer (#82) against it. You need Docker, `uv`, `gh` (logged in), the Gemini CLI
and a `GEMINI_API_KEY` for the last step.

**Use `APP_ENV=dev`, not `local`, for this run.** The alert rule only matches the environments `dev` and `prod` on purpose
(`docs/runbook.md`: "`local` never alerts"), so an app that reports `local` would never fire it. Giving the local app the
label `dev` puts its data where the rule looks; it is still your machine. `make on-call` then watches `dev` (`ENVS=dev`).
(#88 says `--environments local`; that would see no alert, because of the rule above. This document uses `dev`.)

1. Check out the bug and start the stack:
   ```bash
   git fetch origin bug/remix-intermittent-failure && git checkout bug/remix-intermittent-failure
   make observability-up
   ```
   Shows: `make` returns when Grafana, Prometheus, Loki, Tempo and the Collector are healthy; http://localhost:3000 opens.
2. Start the app on the bug branch with telemetry going to the Collector:
   ```bash
   cd backend && VIDEO_SOURCE=sample APP_ENV=dev APP_VERSION=bug-1 OTEL_METRIC_EXPORT_INTERVAL=5000 \
     OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 uv run uvicorn app.main:app --port 8092
   ```
   Shows: `curl localhost:8092/api/health` gives `"environment":"dev","version":"bug-1"`.
3. Put the dashboard and the alert rule into the local Grafana:
   ```bash
   make grafana-apply-local
   ```
   Shows: the script reports what it applied (dashboard, alert rule, notification policy; see `docs/observability.md`), and running it again changes nothing.
4. Break remixes, repeatedly (the rule needs 5 failures in 5 minutes, held for 5 more):
   ```bash
   while true; do SEED_CHANNEL=smokecheck scripts/remix-all-videos.sh http://localhost:8092 | tail -4; sleep 30; done
   ```
   Shows: `HTTP 201: 12` and `HTTP 500: 3` on the first pass, then `HTTP 200: 12` and `HTTP 500: 3`.
5. Open http://localhost:3000/d/clipremix-app/clipremix-application (Environment `dev`, Version `bug-1`). Shows: **Remix failures** climbs by three
   per pass, **Remixes created** stops at 12. Save a screenshot under `docs/screenshots/`.
6. After about 10 minutes, Alerting, Alert rules: **ClipRemix: repeated remix failures** is **Firing** with labels `service=clipremix`,
   `environment=dev`, `version=bug-1`, `owner`, and a `dashboard_url`. Or
   `curl -s 'localhost:3000/api/alertmanager/grafana/api/v2/alerts?active=true' | jq '.[].labels'`.
7. Start the on-call engineer against the local stack (no Grafana token needed):
   ```bash
   make on-call ENVS=dev
   ```
   Shows, in this order: the poll finding the firing alert, the agent starting (`gemini` headless), the agent's explanation, and
   `open-pr` pushing a branch `on-call/<alert name>-dev-<id>` and printing the pull request URL.
8. Review that pull request (do not let automation merge it): the fix (look the acronym up with a default) and a regression test that
   fails on the bug branch and passes on the fix; CI on it passes on SQLite and PostgreSQL.
9. Stop everything (`Ctrl-C` the loops and the app, `make observability-down`) and delete the exercise branches (`docs/cleanup.md`).

**Run on this machine:** steps 2 and 4's script, with the app on the bug branch (section 1, 12 × 201 and 3 × 500), and the
promotion check of section 4. **Not run on this machine:** steps 1, 3, 5 to 9 and the 10-minute wait: there is no Docker daemon
here. The Docker parts of the stack and the dashboard and alert were exercised by CI instead (`observability.yml`,
`grafana-local.yml`, see `docs/observability.md` and `docs/runbook.md`); that is not this exercise, so do not read it as one.
