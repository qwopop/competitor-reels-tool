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
