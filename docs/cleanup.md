# Clean up: delete everything the DevOps set created

The DevOps and Observability tasks (#78, #79, #77, #80, #81, #82, #88) created accounts, services, secrets,
workflows and local data. This lists each one and how to delete it, then ends with a checklist to prove it is gone.
Order matters in one place: delete the GitHub secrets and workflows first, so nothing keeps deploying or polling
while you take the services down.

Free tiers: nothing here costs money, but unused services still count against shared limits (Render's 750 free
instance hours) and keep data you may not want kept.

## 1. Stop the automation (GitHub)

| What | How to delete |
| --- | --- |
| Scheduled workflows `on-call.yml` (every 5 minutes) and `grafana.yml` | Delete the files from the repository (`git rm .github/workflows/on-call.yml .github/workflows/grafana.yml`, commit, push), or disable them: Actions, pick the workflow, **...**, **Disable workflow**. Other workflows from the set: `gemini-api-check.yml` (manual), `deploy-dev.yml`, `deploy-dev-branch.yml`, `bug-patch.yml`, `bug-chain.yml`, `promote.yml`, `build-image.yml`, `observability.yml`, `grafana-local.yml`. |
| Repository secrets `GRAFANA_API_TOKEN`, `GRAFANA_ALERT_TOKEN`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY` | Settings, Secrets and variables, Actions, Secrets: delete each. Or `gh secret delete <NAME>`. |
| Repository variables `GRAFANA_URL` and the optional `GEMINI_MODEL` (pins the Gemini model of the on-call agent) | Settings, Secrets and variables, Actions, Variables. Or `gh variable delete GRAFANA_URL` and `gh variable delete GEMINI_MODEL`. |
| Environment secret `RENDER_DEPLOY_HOOK_URL` and variable `RENDER_APP_URL`, in both `dev` and `prod` | Deleted with the environments below. Older setups also had them at repository level (#78 removed that); `gh secret delete RENDER_DEPLOY_HOOK_URL` and `gh variable delete RENDER_APP_URL` remove any leftover. |
| GitHub Environments `dev` and `prod` (with the `prod` required reviewer) | Settings, Environments, each one, **Delete environment**. Or `gh api -X DELETE repos/<owner>/<repo>/environments/dev` and the same for `prod`. |
| Setting "Allow GitHub Actions to create and approve pull requests" (turned on for #82) | Settings, Actions, General, Workflow permissions: untick it. |
| The exercise branches and pull requests (#88) | The bug itself is only a patch file (`scripts/bugs/`), no branch. If an earlier attempt left the draft pull request #90 or the branch `bug/remix-intermittent-failure`, close the pull request, then `git push origin --delete bug/remix-intermittent-failure`. Close the `on-call/...` pull requests and delete their branches: `gh pr list --state all --search "head:on-call/"`, then `git push origin --delete <branch>` for each. |

## 2. Render (dev and prod)

1. Dashboard, each service, **Settings**, **Delete Web Service**: `clipremix-dev` and `clipremix-prod`.
2. Delete the **old git-backed services** that #77 replaced, if you still have them (the pre-#77 `clipremix-dev` / `clipremix-prod`, and the earlier Blueprint services `reels-api` and `reels-web`).
3. Delete the **old Render database** `clipremix-db` (Dashboard, the database, **Settings**, **Delete Database**). This deletes its data.
4. If you created a Blueprint from `render.yaml`, delete the Blueprint (Dashboard, **Blueprints**, the one for this repository, **Settings**, **Delete Blueprint**) so Render stops syncing it.

## 3. Neon

Open the project, **Settings**, **Delete project**. This deletes the `dev` and `prod` branches and all data. To keep the project
and drop only the exercise data, delete the branch `dev` (**Branches**) instead.

## 4. Grafana Cloud

1. Delete the **service accounts and tokens** first: stack, **Administration, Users and access, Service accounts**: the write account behind `GRAFANA_API_TOKEN` (dashboards and alert rules) and the read-only account behind `GRAFANA_ALERT_TOKEN`. Deleting an account deletes its tokens.
2. Delete the **OpenTelemetry token** used by the apps (grafana.com, your organization, **Access Policies**: the policy and its token you created under Connections, OpenTelemetry). This is the `OTEL_EXPORTER_OTLP_HEADERS` value in Render.
3. Delete the stack: grafana.com, **My Account**, the stack, **Delete Stack**. This removes dashboards, alert rules, and stored metrics, logs and traces.

## 5. GitHub Container Registry

The image `ghcr.io/<owner>/clipremix` and all its versions (including the `bugtest-...` tags of the bug build): github.com, your profile, **Packages**, `clipremix`, **Package settings**, **Delete this package**.
Or delete versions only: the package page, **Versions**, each tag, **Delete**.
With the API: `gh api -X DELETE /user/packages/container/clipremix` (needs the `delete:packages` scope: `gh auth refresh -s delete:packages`).

## 6. Google AI Studio

The Gemini key behind `GEMINI_API_KEY`: https://aistudio.google.com/apikey, find the key, **Delete**. The same name is used in
two places: the repository secret (on-call agent and `gemini-api-check.yml`) and the Render variable on `clipremix-dev` and
`clipremix-prod` (**Write with AI**, #96). Remove the Render variable too; without it the app keeps working with templates only.

The YouTube key behind `YOUTUBE_API_KEY`: Google Cloud Console, **APIs & Services, Credentials**, find the API key, **Delete** (to rotate: create a new key, update the Render variable `YOUTUBE_API_KEY` on `clipremix-prod` and the GitHub secret, then delete the old one). Also remove the variable in Render when you delete the services.

## 7. Your machine

```bash
make down                  # the app stack (app + PostgreSQL), if it is running
docker compose down -v     # also removes the app's pgdata volume
make observability-down    # stops the observability stack
docker compose -f observability/docker-compose.yaml down -v   # also removes the Prometheus, Loki, Tempo and Grafana volumes
```

Also delete any worktree the local on-call run left behind (`git worktree list`, `git worktree remove <path>`) and the
local database files if you used them (`backend/data/`).

## Check yourself that everything is gone

Run each line; the expected result is in the second column. `<owner>/<repo>` is this repository. (`gh` must be logged in.)

| Check | Gone when |
| --- | --- |
| `gh secret list` | none of `GRAFANA_API_TOKEN`, `GRAFANA_ALERT_TOKEN`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `RENDER_DEPLOY_HOOK_URL` |
| `gh variable list` | none of `GRAFANA_URL`, `GEMINI_MODEL`, `RENDER_APP_URL` |
| `gh api repos/<owner>/<repo>/environments --jq '.environments[].name'` | no `dev`, no `prod` |
| `gh secret list --env dev` and `gh secret list --env prod` | an error that the environment does not exist |
| `gh workflow list` | no "On-call engineer", "Grafana", "Deploy the bug build to dev", "Bug patch proof" or "Bug chain" (or they show as disabled, if you only disabled them) |
| `gh api /user/packages/container/clipremix` | HTTP 404 |
| `gh pr list --state open` and `git ls-remote --heads origin 'bug/*' 'on-call/*'` | no exercise pull request and no `bug/` or `on-call/` branch |
| `gh api repos/<owner>/<repo>/actions/permissions/workflow --jq .can_approve_pull_request_reviews` | `false` |
| `docker ps -a --filter name=clipremix` | no rows |
| `docker volume ls --filter name=clipremix` | no rows (`clipremix_pgdata`, `clipremix-observability_*` are gone) |
| Render dashboard | no `clipremix-*` service, no `clipremix-db`, no Blueprint |
| Neon console | no `clipremix` project (or no `dev` branch if you kept the project) |
| Grafana Cloud, grafana.com account page | no stack, no access policy, no service account |
| https://aistudio.google.com/apikey | no key named for this project |
| Google Cloud Console, APIs & Services, Credentials | no YouTube Data API key for this project |
