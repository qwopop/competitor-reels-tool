# Deploying ClipRemix to Render

ClipRemix deploys as **one container plus a PostgreSQL database**, the same two
services as `docker-compose.yaml`:

| docker-compose.yaml | Render | What it is |
| --- | --- | --- |
| `app` (root `Dockerfile`) | `clipremix` web service | FastAPI serving the API and the built frontend |
| `db` (`postgres:16-alpine`) | `clipremix-db` | Managed PostgreSQL 16 |

Render doesn't read compose files, so `render.yaml` (a Render *Blueprint*)
describes the same setup. Render gives the site HTTPS and a public address,
so no extra proxy is needed.

## 1. Check it locally first

```bash
make up            # the compose stack with sample videos, http://localhost:8100
make integration   # integration tests against it
make e2e           # Playwright end-to-end tests against it
make down
```

## 2. Create the Blueprint (once)

1. Sign in to [Render](https://render.com) and connect your GitHub account.
2. Choose **New → Blueprint** and select the repository (`qwopop/clip-remix`).
3. Choose the branch to deploy: **`main`**.
4. Render lists `clipremix` (web service) and `clipremix-db` (PostgreSQL). Click **Apply**.

Render creates the database first, passes its address to the app as
`DATABASE_URL`, then builds the `Dockerfile`. The first build takes a few minutes.

Your site is at `https://clipremix.onrender.com` (or a similar name that
Render shows on the service page).

### Or set it up by hand (what the live site uses)

The live site was created by hand instead of from the Blueprint. The
result is the same two services:

1. **New → Web Service**, connect the repository, branch **`main`**,
   runtime **Docker** (Render finds the root `Dockerfile`). Name: `clip-remix`.
2. **New → Postgres**, in the **same region** as the web service. The live
   database is `clipremix-db` (PostgreSQL 18, Oregon). PostgreSQL 16 or
   newer works.
3. On the web service, **Environment → Add Environment Variable**:
   `DATABASE_URL` = the database's **Internal Database URL**.
4. **Settings → Health Check Path**: `/api/health`.
5. **Settings → Build & Deploy → Auto-Deploy: Off**, so only tested commits
   are deployed (see step 4 below).

Without `DATABASE_URL` the app falls back to a SQLite file inside the
container, which is lost on every deploy. To check, add a channel, deploy
again, and see whether it is still there.

### Plans

`render.yaml` uses the free plans so you can try it at no cost:

- The **free web service** sleeps after 15 minutes without visits; the next
  visit takes about a minute to wake it. Choose **Starter** for an always-on site.
- The **free database** is deleted 30 days after it is created. Choose
  **basic-256mb** (or larger) before then to keep your data.

Prices and limits change; check Render's pricing page.

## 3. Check it works

1. Open `https://<your-service>.onrender.com/api/health`. It should return
   `{"status":"ok","database":"ok","version":"<git commit>"}`.
2. Open the site, add a YouTube channel, fetch its videos, and reload. The data
   is still there, so the database is connected.
3. API documentation is at `/docs`.

## 4. Deploy every change automatically (CI/CD)

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Backend tests** (on SQLite and on a PostgreSQL 16 service) and **frontend
   tests** (typecheck, unit tests, production build), in parallel.
2. The **Docker Compose stack** is built and started, then the **integration
   tests** and the **Playwright end-to-end tests** run against it.
3. On a push to **`main`**, once everything passes, it **deploys to Render**
   and waits until `/api/health` reports the new commit and a working database.

`render.yaml` sets `autoDeploy: false`, so Render never deploys a commit
that hasn't passed the tests. Connect GitHub to Render once:

1. In Render, open the `clipremix` service → **Settings → Deploy Hook** and copy the URL.
2. In GitHub, open the repository → **Settings → Secrets and variables → Actions**:
   - **Secrets** tab: add `RENDER_DEPLOY_HOOK_URL` with that URL.
   - **Variables** tab: add `RENDER_APP_URL` with the site's address, for
     example `https://clipremix.onrender.com`.

Until both are set, the deploy job is skipped with a notice and everything
else still runs. The deploy hook is the only credential GitHub holds: it can
start a deploy of the branch, nothing else.

Then change something, commit, and push to `main` to see it go live.

## Things to know

- **No login.** Anyone with the address can read and change the data. Add
  authentication before sharing the link widely.
- **Videos come from YouTube's public channel feeds.** No API key is needed.
  Set `VIDEO_SOURCE=sample` on the service for generated videos instead.
- **Region.** Both services are in Frankfurt, so the app reaches the database
  over Render's private network. Change both `region` values together.
- **Old services.** If you created the earlier Blueprint (`reels-api`,
  `reels-web`), delete those services in Render after this one works; they
  are not used any more.

## Clean up

To stop paying for and remove everything this created: in Render, open the
Blueprint and choose **Delete Blueprint**, then delete the `clipremix`
service and the `clipremix-db` database (Settings → Delete). Deleting the
database deletes its data.
