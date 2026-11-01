.PHONY: install run frontend dev test check docker-build docker-run

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

# One production image: the backend serves the built frontend. Open http://localhost:8000
docker-build:
	docker build -t clipremix:latest .

# Runs the image with a named volume, so the SQLite file survives restarts.
docker-run:
	docker run --rm -p 8000:8000 -v clipremix-data:/app/data --name clipremix clipremix:latest
