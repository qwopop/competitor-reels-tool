# Deploying the app

The app has three parts. Each one deploys separately:

| Part | Where it runs | Notes |
| --- | --- | --- |
| Frontend | Render static site (`reels-web`) | Built from `frontend/` |
| Backend API | Render web service (`reels-api`) | FastAPI in Docker, from `backend/` |
| Database | SQLite file on a persistent disk | Mounted at `/app/data` on the API service |

`render.yaml` describes all of this. Render reads it when you create a Blueprint.

## One-time setup

1. Sign in to [Render](https://render.com) and connect your GitHub account.
2. Choose **New → Blueprint** and select `qwopop/competitor-reels-tool`.
3. Choose the branch `claude/eloquent-pasteur-sgl8v0` (or `main` after merging).
4. Render shows two services and asks for the two values marked `sync: false`. Fill them in as described below.
   - The API needs a paid instance because persistent disks are not available on the free plan.
5. Apply the Blueprint. The first build takes a few minutes.

### Connecting the parts

Render gives each service a URL like `https://<name>.onrender.com`. Two values need to point at each other:

1. **`reels-api` → `CORS_ORIGINS`**: the frontend URL, for example `https://reels-web.onrender.com`.
2. **`reels-web` → `VITE_API_BASE_URL`**: the API URL plus `/api`, for example `https://reels-api.onrender.com/api`.

After you change `VITE_API_BASE_URL`, redeploy `reels-web`. The value is baked into the build when it runs, so changing it does nothing until a new build.

## Checking it works

1. Open the frontend URL. You should see the Reels page with no errors.
2. Open `https://<api>/api/competitors`. It should return `[]` or your list as JSON.
3. Open `https://<api>/docs` for the API documentation.
4. Add a competitor, fetch its reels, and refresh the page. The data should still be there, which shows the database persists.

## Running the same stack locally

```bash
cd backend && uv sync && PORT=8000 uv run sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}'
cd frontend && VITE_API_BASE_URL=http://localhost:8000/api npm run dev
```

## Things to know

- **One database file on one instance.** SQLite fits this app. Do not scale the API past one instance. For more than one instance, move to Postgres: change `DATABASE_URL` and add a driver, since the code keeps database access in `app/store.py` and `app/models.py`.
- **No login.** Anyone with the frontend URL can read and change the data. Add authentication before sharing the link widely.
- **Reels are sample data.** Real Instagram fetching is not implemented (see the README).
- **Backups.** Render disks are not backed up automatically. Copy `/app/data/app.db` out with the Render shell if the data matters.
- **Free demo.** The GitHub Pages demo (`.github/workflows/pages.yml`) still builds with the in-browser mock and is unrelated to this deployment.
