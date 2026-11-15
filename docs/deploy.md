# Deploying ClipRemix: dev and prod on Render and Neon

ClipRemix runs as **two independent copies** of the same stack, `dev` and `prod`.
Each is a Render free Docker web service built from this repository, with its
own branch of one Neon free PostgreSQL project.

| | `dev` | `prod` |
| --- | --- | --- |
| Render service | `clipremix-dev` | `clipremix-prod` |
| Neon branch | `dev` | `prod` |
| `APP_ENV` | `dev` | `prod` |
| `VIDEO_SOURCE` | `sample` | `youtube` |
| Deployed by | every push to `main` that passes all tests | the manual "Promote dev to prod" workflow, after approval (section 6) |

Render doesn't read compose files, so `render.yaml` (a Render *Blueprint*)
describes the two services. Render gives each site HTTPS and a public address.
`/api/health` reports `environment` (`APP_ENV`), `version` (the deployed commit)
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

The service that runs today becomes `dev`:

1. In Render open the existing web service, **Settings → Name**, and rename it to `clipremix-dev`.
2. **Environment**: set `DATABASE_URL` to the Neon `dev` connection string, `APP_ENV` to `dev`, `VIDEO_SOURCE` to `sample`. Remove any other database setting.
3. **Settings**: Health Check Path `/api/health`, **Auto-Deploy: Off**.
4. Delete the old Render database (`clipremix-db`) once dev works with Neon. Deleting it deletes its data.

Then create `prod`:

1. **New → Web Service**, connect the repository `qwopop/competitor-reels-tool`, branch **`main`**, runtime **Docker**, plan **Free**, name `clipremix-prod`, same region as dev.
2. **Environment**: `DATABASE_URL` = the Neon `prod` connection string, `APP_ENV` = `prod`, `VIDEO_SOURCE` = `youtube`.
3. **Settings**: Health Check Path `/api/health`, **Auto-Deploy: Off**.

Or create both from `render.yaml` with **New → Blueprint**; Render then asks for
the two `DATABASE_URL` values (they are `sync: false`, so they are never stored
in the repository).

For each service, open **Settings → Deploy Hook** and copy the URL. You need
both in the next step.

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
3. Create a second environment named `prod` and add its secret and variable the same way. Its required reviewer is set up in section 6.
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
3. On a push to **`main`**, once everything passes, `deploy-dev` calls the dev
   Deploy Hook with `ref=<commit SHA>`, so Render builds exactly the pushed
   commit. The hook URL is never printed to the log. The job then polls
   `<RENDER_APP_URL>/api/health` for up to 20 minutes until `version` is that
   commit, `environment` is `dev` and `database` is `ok`; otherwise it fails
   with an error.

`render.yaml` sets `autoDeploy: false` on both services, so Render never deploys
a commit that hasn't passed the tests. Runs of `deploy-dev` queue (they never
cancel one another halfway).

## 6. Promote to production

Prod is only deployed by the manual workflow `.github/workflows/promote.yml`
("Promote dev to prod"). It deploys **the commit that dev is running**, so what
you tested on dev is what reaches prod.

**Set up the `prod` environment (once, owner):**

1. Create the `prod` environment and add its secret `RENDER_DEPLOY_HOOK_URL` and variable `RENDER_APP_URL` (section 4). The `dev` environment needs its `RENDER_APP_URL` variable too, because the workflow reads dev's version from it. No other secrets or variables are used.
2. Open **Settings → Environments → prod → Required reviewers**, tick it, and add the person who approves production deploys (up to 6 people or teams). Required reviewers are free on a public repository.
3. **Prevent self-review must be off** if you are the only reviewer, because you start the workflow yourself and could not approve your own run otherwise.
4. Save protection rules.

**Run it:**

1. **Actions → Promote dev to prod → Run workflow**, branch **`main`** (any other branch is refused).
2. Job `resolve` reads `<dev RENDER_APP_URL>/api/health` and writes the version to the run summary. It fails with an error if dev is unreachable, if dev's `environment` is not `dev`, if the version is not a 40-character commit sha (for example `dev`, when no commit is known), or if that commit is not on `main` (for example a branch build deployed to dev by hand).
3. Job `promote` then waits for the reviewer. The reviewer opens the run, reads the version in the summary and clicks **Review deployments → Approve**.
4. If prod already reports that version, the job ends with a notice and does not deploy. Otherwise it writes prod's current version to the summary (needed to roll back later, #83), calls prod's deploy hook with `ref=<sha>` and polls `<prod RENDER_APP_URL>/api/health` for up to 20 minutes until `version` is the sha, `environment` is `prod` and `database` is `ok`.

If the settings are missing, the jobs end with a notice that names them instead of failing.
Runs queue in the concurrency group `deploy-prod` and never cancel one another.

**Note:** this step builds the commit again on Render for prod. It does not move
the image that ran on dev; that is #77.

## 7. Check it works

1. Open `https://<dev-service>.onrender.com/api/health`. It should return
   `{"status":"ok","database":"ok","version":"<git commit>","environment":"dev"}`.
   The first request after a sleep takes about a minute.
2. Open the site, add a YouTube channel (or a sample one on dev), fetch its videos, and reload. The data is still there, so the Neon branch is connected.
3. Do the same on prod; it must show `"environment":"prod"` and its own data.
4. API documentation is at `/docs`.

Without `DATABASE_URL` the app falls back to a SQLite file inside the
container, which is lost on every deploy.

## Things to know

- **No login.** Anyone with the address can read and change the data. Add
  authentication before sharing the link widely.
- **Videos come from YouTube's public channel feeds.** No API key is needed.
  `VIDEO_SOURCE=sample` gives generated videos instead (used on dev).
- **Version.** `/api/health` reports `APP_VERSION`, then `RENDER_GIT_COMMIT`
  (set by Render), then `dev`.
- **Old services.** If you created the earlier Blueprint (`reels-api`,
  `reels-web`), delete those services in Render.

## Clean up

In Render delete the `clipremix-dev` and `clipremix-prod` services (Settings →
Delete). In Neon delete the project; that deletes both databases and their data.
