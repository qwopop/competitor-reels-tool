.PHONY: install run frontend dev test check

install:
	cd backend && uv sync
	cd frontend && npm ci

# Backend only, on http://localhost:8091 (API docs at /docs)
run:
	cd backend && uv run uvicorn app.main:app --reload --port 8091

# Frontend only, on http://localhost:5173 (proxies /api to the backend)
frontend:
	cd frontend && npm run dev

# Backend and frontend together. Open http://localhost:5173
dev:
	$(MAKE) -j2 run frontend

test:
	cd backend && uv run pytest
	cd frontend && npm test

check: test
	cd frontend && npm run typecheck && npm run build
