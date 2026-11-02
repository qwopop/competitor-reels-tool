# Agent instructions

## Layout

- `frontend/`: React + Vite + TypeScript app (Tailwind, Vitest). All backend calls go through `frontend/src/services/`.
- `backend/`: FastAPI app with SQLAlchemy: SQLite for local development and tests, PostgreSQL in Docker Compose and production. Code is in `backend/app/`, tests in `backend/tests/`.
- `Dockerfile`: one production image; Node builds the frontend, FastAPI serves it next to the API (`app/frontend.py`).
- `docker-compose.yaml`: the app plus PostgreSQL 16, as in production.
- `integration/`: tests against the running compose stack. `e2e/`: Playwright end-to-end tests, one spec per feature (GitHub issues labelled `e2e-test`).
- `.github/workflows/ci.yml`: CI/CD. `render.yaml` and `docs/deploy.md`: deployment to Render. `docs/testing.md`: how everything is tested.
- `openapi.yaml`: the API contract between frontend and backend. Change it first when an endpoint changes, then update both sides.
- `docs/`: supporting docs, including `docs/spec.md`.

## Design

The UI follows the ViraClip-inspired look (see `docs/screenshots/`): near-black ground, a bold Inter headline with one italic Instrument Serif phrase, the orange-to-pink gradient (`bg-brand`) for primary actions, pill buttons and inputs, rounded panels, and a purple glow. Tokens are in `frontend/tailwind.config.js` and global styles in `frontend/src/index.css`.

This look was chosen on purpose and breaks several house rules of the `design-taste-frontend` skill (gradients, glass, pills, an italic accent word). The skill's lint (`.claude/skills/design-taste-frontend/scripts/lint.mjs`) is therefore expected to report failures and is not part of the checks. Keep new UI consistent with the current pages.

## Backend (use uv)

```
cd backend
uv sync                      # install dependencies
uv add <PACKAGE-NAME>        # add a dependency
uv run pytest                # run tests
uv run python <PYTHON-FILE>  # run a script
```

Keep database code behind `app/store.py` and `app/models.py`. Code must work on both SQLite and PostgreSQL: avoid SQLite-only features, and add new columns to `upgrade_schema` in `app/models.py` so existing databases are upgraded on startup. The database URL comes from `DATABASE_URL` (`postgres://…` URLs are accepted). Run `make test-postgres` (after `make db`) to run the backend tests on PostgreSQL.

## Frontend

```
cd frontend
npm ci
npm run dev        # http://localhost:5173
npm test
npm run typecheck
```

## Workflow

- From the repository root: `make install`, `make dev`, `make test`, `make check`.
- Full stack: `make up` / `make down`, `make integration`, and `make e2e` (starts from an empty database, like CI).
- Run the tests before committing. Every push runs all of them in GitHub Actions; a push to `main` that passes is deployed to Render.
- Work on tasks follows `_docs/process.md`: PM grooms, engineer implements, QA posts `## QA: PASS` or `## QA: FAIL`; issues are closed only after a pass.
- Commit regularly, in small commits with clear messages.
