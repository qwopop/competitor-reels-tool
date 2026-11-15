.PHONY: on-call install run frontend dev test check docker-build docker-run db test-postgres up down integration e2e observability-up observability-down grafana-apply-local grafana-dry-run

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
# Starts from an empty database, like CI: `down -v` drops the local pgdata volume.
e2e:
	docker compose down -v
	VIDEO_SOURCE=$${VIDEO_SOURCE:-sample} docker compose up -d --build --wait
	cd e2e && BASE_URL=$(STACK_URL) npx playwright test

# ---- Local observability (observability/: its own Compose project) ------------
# Collector, Prometheus, Loki, Tempo and Grafana (http://localhost:3000). Then run the app with
#   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 APP_ENV=local make run
# See docs/observability.md.
observability-up:
	docker compose -f observability/docker-compose.yaml up -d --wait

observability-down:
	docker compose -f observability/docker-compose.yaml down

# Dashboard, alert rule and notification policy (observability/grafana/) into the local Grafana.
# Safe to run again. For Grafana Cloud: GRAFANA_URL=https://<stack>.grafana.net GRAFANA_API_TOKEN=... python3 -I observability/grafana/apply.py
grafana-apply-local:
	python3 -I observability/grafana/apply.py --url http://localhost:3000

grafana-dry-run:
	python3 -I observability/grafana/apply.py --dry-run

# ---- On-call engineer (on-call-engineer/, docs/on-call.md) ----------------------------------
# Polls Grafana every 60 s and wakes the headless Gemini agent. Needs GRAFANA_URL, GRAFANA_ALERT_TOKEN,
# GEMINI_API_KEY and an authenticated `gh`. ENVS=local for the local stack.
ENVS ?= dev,prod
on-call:
	python3 -I on-call-engineer/on_call.py watch --environments $(ENVS)
