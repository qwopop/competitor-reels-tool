# On-call exercise: a realistic bug, from alert to pull request

The goal (#88): show that the whole chain works on a bug that passes every test. A change that looks like a feature
breaks remix creation for some videos on dev; the dashboard (#81) shows it, the alert (#81) fires, the on-call engineer
(#82, [on-call.md](on-call.md)) wakes up, and a pull request with a fix and a regression test arrives for a human to review.

## Status: what has and has not been done

Read this first. The task is **not** marked done by pretending the live run happened.

| Part | State |
| --- | --- |
| The bug as a patch file (`scripts/bugs/`), never on a branch | **Done**; the existing suite passes with it and the remix endpoint fails for a subset, proved by `bug-patch.yml` (below) |
| `scripts/remix-all-videos.sh`, partial failures on sample videos | **Done**, run locally (below) |
| `deploy-dev-branch.yml` (manual: apply the patch in CI, build a `bugtest-` image, deploy to dev only) | **Written**, built on the shared workflows. The deploy step skips with `::notice::` until the dev secrets exist, so it cannot be a full run yet |
| Real app with the patch makes `clipremix_remix_failures_total` rise and the alert fire (local stack in CI, no synthetic data) | `bug-chain.yml`; see the run in section 7 |
| Promotion of the bug build is refused | The `bugtest-` tag fails the tag-format check of `promote.yml`; a backend test (`test_bug_patch.py`) reads that regex from `promote.yml` and checks it. **No link to a failed GitHub run exists** (needs a live dev service running the bug build) |
| Dashboard shows the failures, alert fires in Grafana Cloud, on-call run, `on-call/...` pull request | **Not done live.** Needs the owner's Render, Neon, Grafana Cloud and Gemini accounts, which do not exist yet. Missing links are marked **(missing)** below |
| The local run (stack on this machine, no accounts) | **Written as steps.** What has been run on this machine is marked in each step |

Links still missing until the live run: the Render dev deploy of the bug build, the Grafana Cloud dashboard panel and
screenshot (`docs/screenshots/`), the firing alert, the on-call workflow run, the `on-call/...` pull request.

## 1. The bug

**Deviation from the issue text:** #88 asked for a throwaway branch `bug/remix-intermittent-failure` and a "do not merge"
pull request. Work here may only be pushed to `claude/gallant-pascal-355cez`, so the bug is a patch file instead,
`scripts/bugs/remix-intermittent-failure.patch` ([README](../scripts/bugs/README.md)), which is never applied to committed code.
CI applies it to its own workspace only. (An earlier attempt did push a branch and a draft pull request, #90; that branch is
superseded, close it and delete it as `docs/cleanup.md` says.)

The change looks like a small nicety: *keep acronyms in remix titles in their
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

Run against the patched app with `scripts/remix-all-videos.sh` (section 2): `HTTP 201: 12`, `HTTP 500: 3`, three `KeyError` tracebacks
in the app log. Without the patch the same script gives `HTTP 201: 15`.

Reproduce with `curl` (sample source):

```bash
# an app started with the patch applied (git apply scripts/bugs/remix-intermittent-failure.patch in a throwaway checkout)
base=http://localhost:8092
comp=$(curl -s -X POST $base/api/competitors -H 'Content-Type: application/json' \
  -d '{"channelUrl":"https://www.youtube.com/@reprocheck"}' | jq -r .id)
curl -s -X POST $base/api/competitors/$comp/videos/fetch > /dev/null
vid=$(curl -s $base/api/videos | jq -r '[.[] | select(.caption | test("CRUD"))][0].id')
curl -i -X POST $base/api/videos/$vid/remix        # HTTP/1.1 500 Internal Server Error with the patch, 201 without
```

**Proof that the existing tests still pass with the bug:** `scripts/bugs/apply-and-test.sh` (CI: `bug-patch.yml`) copies the
tracked files to a temp directory, applies the patch there, runs the full existing backend suite (it passes), then
`scripts/bugs/test_patched_remix.py`, which sees a mix of 201 and 500 for the sample videos, the same videos failing again on a
second pass, and `clipremix.remix.failures` equal to the number of 500s. The same test fails on clean code, so it detects the patch.
`backend/tests/test_bug_patch.py` keeps `backend/app/remix.py` free of the bug. The bug is never merged and never promoted.
Run: see section 7.

## 2. `scripts/remix-all-videos.sh`

`scripts/remix-all-videos.sh <base-url>` lists every video (`GET /api/videos`), requests a remix for each and prints the status
codes and a count (`201` created, `200` already had one, `500` failed). `SEED_CHANNEL=<handle>` adds a channel and fetches its
videos first when the app has none (sample source only). It exits 1 only when the app cannot be reached, because a 500 is what it
is there to show. Run again, the failing videos fail again (a failed remix is never stored) while the others answer 200: three
500s per run, which is what keeps the alert's failure count growing.

## 3. Deploying the bug to dev, and only dev

**Actions, "Deploy the bug build to dev", Run workflow, "Use workflow from" the ref you want (this branch).** The workflow
(`.github/workflows/deploy-dev-branch.yml`) calls the same reusable workflows as `ci.yml` does for `main`:
`build-image.yml` and `deploy-dev.yml`. Differences, all by inputs of `build-image.yml`: the patch
`scripts/bugs/remix-intermittent-failure.patch` is applied to the CI workspace after checkout (nothing is committed), and the tag
gets the prefix `bugtest-` (`bugtest-YYYYMMDD-HHMMSS-shortsha`, pushed to GHCR). `deploy-dev.yml` is hard-wired to the `dev`
environment and skips with `::notice::` until `RENDER_DEPLOY_HOOK_URL` and `RENDER_APP_URL` exist there; no step touches `prod`.
To return dev to `main`, push to `main`. Run: **(missing)**, needs the dev Render service.

## 4. Promoting the bug build fails

Run **Actions, "Promote dev to prod"** on `main` while dev runs the bug image. Its `resolve` job reads the version from dev's
`/api/health` and checks it against `^[0-9]{8}-[0-9]{6}-[0-9a-f]{7}$`. The bug build's tag is `bugtest-2026...`, so it stops with

```
::error::Dev reports version "bugtest-20261115-170000-843edd2", which is not an image tag (YYYYMMDD-HHMMSS-shortsha). Deploy an image to dev first (push to main).
```

Checked in `backend/tests/test_bug_patch.py::test_promote_refuses_the_bug_build_tag`, which reads the regex from `promote.yml`
(a normal tag matches, the `bugtest-` tag does not). Even a hand-made untagged variant is caught by the second line of
defence: the commit of a tag must be an ancestor of `origin/main`. The failed GitHub run: **(missing)**, link it here after the
live run.

## 5. The chain, live (needs the owner's accounts)

Do this once the owner has done the steps in `docs/deploy.md` (Render, Neon, Grafana Cloud, `docs/on-call.md` settings).

1. Run "Deploy the bug build to dev" on this branch. Check `https://<dev>/api/health` reports the bug build's tag.
2. `scripts/remix-all-videos.sh https://<dev>` every 30 seconds for about 15 minutes (`while true; do scripts/remix-all-videos.sh https://<dev> | tail -4; sleep 30; done`). The first pass is a mix of 201 and 500; the 500s repeat.
3. Open the dashboard (`<grafana>/d/clipremix-app/clipremix-application`, Environment `dev`, Version = the bug build's tag): **Remix failures** rises while **Remixes created** stays flat after the first pass. Save a screenshot as `docs/screenshots/on-call-dashboard.png`. **(missing)**
4. After about 10 minutes (`increase(...[5m]) > 4.5`, `for: 5m`) the alert **ClipRemix: repeated remix failures** goes to firing with `service`, `environment`, `version`, `owner` and `dashboard_url`. Link: **(missing)**
5. The on-call workflow (`on-call.yml`, every 5 minutes at best) picks it up. Its run log shows the poll, the agent start and the agent's explanation. Run: **(missing)**
6. A pull request from `on-call/<alert name>-dev-<run id>` appears, with a fix and a regression test that fails on the bug build and passes on the fix, backend tests green on SQLite and PostgreSQL. Check that nothing was pushed to `main` and nothing merged by automation. Pull request: **(missing)**
7. Stop the loop. Put a good build back on dev by pushing to `main` (or re-running CI/CD on `main`), then close the exercise pull requests (`docs/cleanup.md`).
8. Write up the timeline here: when each step happened, the links above, and what the agent got right or wrong. **(missing)**

## 6. The chain, locally (no accounts)

Everything runs on one machine: the app with the bug patch applied, the local observability stack (#80), the dashboard and alert
(#81) in the local Grafana, and the on-call engineer (#82) against it. You need Docker, `uv`, `gh` (logged in), the Gemini CLI
and a `GEMINI_API_KEY` for the last step.

**Use `APP_ENV=dev`, not `local`, for this run.** The alert rule only matches the environments `dev` and `prod` on purpose
(`docs/runbook.md`: "`local` never alerts"), so an app that reports `local` would never fire it. Giving the local app the
label `dev` puts its data where the rule looks; it is still your machine. `make on-call` then watches `dev` (`ENVS=dev`).
(#88 says `--environments local`; that would see no alert, because of the rule above. This document uses `dev`.)

1. Apply the bug to a **throwaway checkout** (never commit it) and start the stack:
   ```bash
   git worktree add ../clipremix-bug HEAD && cd ../clipremix-bug
   git apply scripts/bugs/remix-intermittent-failure.patch
   make observability-up
   ```
   Shows: `make` returns when Grafana, Prometheus, Loki, Tempo and the Collector are healthy; http://localhost:3000 opens.
2. Start the app with the bug patch applied with telemetry going to the Collector:
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
   fails on the patched code and passes on the fix; CI on it passes on SQLite and PostgreSQL.
9. Stop everything (`Ctrl-C` the loops and the app, `make observability-down`) and remove the worktree (`git worktree remove ../clipremix-bug --force`) and the exercise branches (`docs/cleanup.md`).

**Run on this machine:** the patch proof (`scripts/bugs/apply-and-test.sh`) and the app with `scripts/remix-all-videos.sh`
(12 x 201 and 3 x 500). **Not run on this machine:** steps 1, 3, 5 to 9: there is no Docker daemon here. They are run by CI
instead, with the real app and the patch (`bug-chain.yml`, section 7).

## 7. CI evidence

- `bug-patch.yml`: existing backend suite passes on the patched copy; the bug test sees 500s and the counter. Run: [run 43739431978](https://github.com/qwopop/competitor-reels-tool/actions/runs/43739431978) (passed)
- `bug-chain.yml`: the real patched app sends telemetry to the local stack, `scripts/remix-all-videos.sh` drives the traffic,
  `clipremix_remix_failures_total` rises and the alert **ClipRemix: repeated remix failures** fires for `environment=dev` and
  the build's version (no synthetic metrics; `grafana-local.yml` is the synthetic one). Run: [run 43739431938](https://github.com/qwopop/competitor-reels-tool/actions/runs/43739431938) (passed in about 7 minutes: the script exits 1 unless the counter is above zero and the alert fires with the expected labels and annotations)

## 8. Owner steps for the live chain

Nothing below can run until the owner has the accounts. In order:

1. Do `docs/deploy.md` (Render dev and prod, Neon, GHCR package public, GitHub Environments `dev` and `prod` with
   `RENDER_DEPLOY_HOOK_URL` and `RENDER_APP_URL`).
2. Create the Grafana Cloud stack and set `GRAFANA_URL`, `GRAFANA_API_TOKEN` and `GRAFANA_ALERT_TOKEN` (`docs/observability.md`,
   `docs/on-call.md`); the Render services need the OTLP settings.
3. Create the Gemini key in Google AI Studio and set the secret `GEMINI_API_KEY` (optional variable `GEMINI_MODEL`); tick
   "Allow GitHub Actions to create and approve pull requests" (`docs/on-call.md`).
4. Run "Deploy the bug build to dev", then section 5 steps 2 to 8. Fill in the **(missing)** links above.
5. Put a good build back on dev (push to `main`) and clean up with `docs/cleanup.md`.
