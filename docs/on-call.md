# On-call engineer

An alert fires in Grafana, a script notices, a headless coding agent (the free Gemini CLI) investigates the
repository like an on-call engineer, and a fix, if there is one, arrives as a **pull request for a human to review**.
The agent never pushes to `main`. Code: `on-call-engineer/` (Python standard library only), workflow
`.github/workflows/on-call.yml`.

## Flow

```
Grafana alert (docs/runbook.md)
  -> poll         GET $GRAFANA_URL/api/alertmanager/grafana/api/v2/alerts?active=true&silenced=false&inhibited=false
                  keeps service=clipremix, the chosen environments, firing only; skips alerts that have a recent PR
  -> investigate  fresh checkout, `gemini` headless with on-call-engineer/prompt.md; the agent commits locally;
                  the script exports `git format-patch` (may be empty) and the agent's explanation
  -> open-pr      rejects a patch that touches .github/, `git am` on branch on-call/<alertname>-<environment>-<run id>,
                  pushes that branch only, opens the pull request, starts CI on the branch
```

`python3 on-call-engineer/on_call.py <poll|investigate|open-pr|watch> --help` lists the options. `poll` also takes
`--alerts-file` (a recorded API response, used by the fixture run and the tests).

The prompt starts with the article's prompt word for word, then the alert as JSON between markers that mark it as
untrusted data, then two rules (do not modify `.github/`, do not push). Alert text reaches the agent through a file piped to
its stdin and reaches `gh` through a body file and argument lists, never through a shell (a test uses quotes, backticks and
`$(...)`). The poller dedupes: no new run while a pull request whose branch starts with `on-call/<alertname>-<environment>-`
is open or was closed within the last 6 hours (checked with `gh pr list`); `watch` also remembers handled fingerprints.

## Two ways to run it

**Scheduled workflow.** `on-call.yml` runs on `schedule` with cron `*/5 * * * *`. **That is GitHub's minimum: it is
"about every 5 minutes", not every minute**, and scheduled runs can start late or be skipped under load. Scheduled workflows
run from the default branch only. A run does nothing until the settings below exist (a `::notice::` names what is missing).

**Locally, every minute.** `make on-call` runs `on_call.py watch`: every 60 seconds (`--interval`) it runs poll, investigate
and open-pr. Needs `GRAFANA_URL`, `GRAFANA_ALERT_TOKEN`, `GEMINI_API_KEY` in your environment, `gemini` installed
(`npm install -g @google/gemini-cli@0.68.0`) and `gh` logged in. `make on-call ENVS=local` watches the local stack
(`make observability-up`, no token needed). The agent works in a throwaway `git worktree`; `watch --dry-run` stops before pushing.

## Settings

| Where | Name | What |
| --- | --- | --- |
| Actions variable | `GRAFANA_URL` | `https://<stack>.grafana.net` (the same variable as `grafana.yml`) |
| Actions secret | `GRAFANA_ALERT_TOKEN` | read-only Grafana service account token |
| Actions secret | `GEMINI_API_KEY` | free key from Google AI Studio |
| Actions variable (optional) | `GEMINI_MODEL` | model for the agent, default `gemini-3.5-flash` |
| Repository setting | Allow GitHub Actions to create and approve pull requests | see below |

**Grafana token.** In the stack: **Administration, Users and access, Service accounts**, add an account with the role
**Viewer**, then **Add service account token** and copy it (`glsa_...`). Viewer can read the alert list; it cannot change anything.

**Gemini key.** Open https://aistudio.google.com/apikey, create a key (free tier, no card), and add it as the repository
secret `GEMINI_API_KEY`. The free tier has request limits: when they are exhausted the investigate job fails with an
`::error::` that mentions the quota, nothing is pushed, and the next scheduled run tries again.

**Model.** Both the check step and the agent run `gemini -m <model>`. The CLI's own default model (`gemini-2.5-flash`) is retired for new API keys (HTTP 404 "no longer available to new users") and the CLI retries instead of failing, so the model is pinned: `gemini-3.5-flash` unless the variable `GEMINI_MODEL` is set (locally, the environment variable of the same name). The check step prints the model and the API error line (404, quota, API key) when it fails.

**Pull requests from Actions.** Only the repository owner can enable this: **Settings, Actions, General, Workflow permissions,
tick "Allow GitHub Actions to create and approve pull requests"**. If it is off, the `open-pr` job fails with an `::error::`
pointing here; the branch was already pushed and the patch and explanation stay in the artifact `on-call-result-<n>` of the
run, so nothing is lost. Pull requests created with `GITHUB_TOKEN` do not start CI, so the job runs `gh workflow run ci.yml --ref <branch>`.

## Why three jobs

- `poll`: `contents: read` and `pull-requests: read`, only the Grafana read token.
- `investigate` (one per new alert): `contents: read`, checkout with `persist-credentials: false`, and only `GEMINI_API_KEY`. The
  agent runs code from the repository (including the tests it decides to run) and reads text written by the monitored system, so
  it gets no write token and no push credentials; it commits locally and the job uploads the patch.
- `open-pr`: `contents: write`, `pull-requests: write`, `actions: write` (to start CI) and **no agent secrets**. It only applies a patch
  after the guard (no `.github/` paths, never a protected branch) has checked it.

A prompt-injected or confused agent can therefore at worst produce a bad patch, which a human still reviews. Concurrency
groups per alert name and environment (`cancel-in-progress: false`) keep two runs from handling the same alert at once.

## Branch protection (recommended)

On `main`: require a pull request and the CI checks, disallow force pushes. The agent already never pushes to `main`, this makes
it a rule of the repository, and the pull request still goes through the normal flow (CI, dev, then promote to prod).

## Trying it without Grafana

**Actions, On-call engineer, Run workflow** with `fixture` ticked (also runs on a push of the workflow file to a branch other than
`main`) uses `on-call-engineer/tests/fixtures/alerts.json`, a recorded alert API response, instead of Grafana, and dry-runs the pull
request step (the patch is checked and applied, nothing is pushed). The agent job really starts the Gemini CLI with the secret.
Unit tests: `cd backend && uv run pytest ../on-call-engineer/tests` (fake agent through `GEMINI_CMD`, fake `gh` through `GH_CMD`).
