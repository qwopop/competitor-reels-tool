# Agent instructions

## Layout

- `frontend/`: React + Vite + TypeScript app (Tailwind, Vitest). All backend calls go through `frontend/src/services/`.
- `backend/`: FastAPI app with SQLAlchemy and SQLite. Code is in `backend/app/`, tests in `backend/tests/`.
- `openapi.yaml`: the API contract between frontend and backend. Change it first when an endpoint changes, then update both sides.
- `docs/`: supporting docs, including `docs/spec.md`.

## Design

For any page or UI work in `frontend/`, follow the `design-taste-frontend` skill in `.claude/skills/design-taste-frontend/SKILL.md`. It is a copy of `skills/taste-skill` from https://github.com/Leonxlnx/taste-skill. Its scripts need Node 22+ and Chrome, Edge or Chromium.

## Backend (use uv)

```
cd backend
uv sync                      # install dependencies
uv add <PACKAGE-NAME>        # add a dependency
uv run pytest                # run tests
uv run python <PYTHON-FILE>  # run a script
```

Keep database code behind `app/store.py` and `app/models.py`. Avoid SQLite-only features so Postgres can be added later. The database URL comes from `DATABASE_URL`.

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
- Run the tests before committing.
- Commit regularly, in small commits with clear messages.
