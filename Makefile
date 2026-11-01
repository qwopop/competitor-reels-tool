.PHONY: install run frontend dev test check docker-build docker-run db test-postgres up down integration e2e

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

# A local PostgreSQL 16 for development, like production. Then run the backend with
#   DATABASE_URL=postgresql://clipremix:clipremix@localhost:5432/clipremix make run
db:
	docker run -d --name clipremix-db \
	  -e POSTGRES_USER=clipremix -e POSTGRES_PASSWORD=clipremix -e POSTGRES_DB=clipremix \
	  -p 5432:5432 -v clipremix-pgdata:/var/lib/postgresql/data postgres:16-alpine

# The backend tests against that PostgreSQL instead of SQLite.
test-postgres:
	cd backend && TEST_DATABASE_URL=postgresql://clipremix:clipremix@localhost:5432/clipremix uv run pytest

# ---- The full stack (docker-compose.yaml: app + PostgreSQL) ------------------
# Tests use VIDEO_SOURCE=sample so they never depend on YouTube.
STACK_URL ?= http://localhost:8100

up:
	VIDEO_SOURCE=$${VIDEO_SOURCE:-sample} docker compose up -d --build --wait

down:
	docker compose down

# Integration tests against the running stack.
integration: up
	cd backend && BASE_URL=$(STACK_URL) uv run pytest ../integration -q

# End-to-end tests (Playwright, e2e/) against the running stack.
# First time: cd e2e && npm ci && npx playwright install chromium
e2e: up
	cd e2e && BASE_URL=$(STACK_URL) npx playwright test
