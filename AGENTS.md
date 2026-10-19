# Agent instructions

## Layout

- `frontend/`: React + Vite + TypeScript app (Tailwind, Vitest). All backend calls go through `frontend/src/services/`.
- `backend/`: FastAPI app with SQLAlchemy and SQLite. Code is in `backend/app/`, tests in `backend/tests/`.
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
