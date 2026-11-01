# ClipRemix in one image: the React frontend is built once into static files,
# and the FastAPI backend serves them next to the API.
#
#   docker build -t clipremix .
#   docker run --rm -p 8000:8000 -v clipremix-data:/app/data clipremix
#
# Stage 1 compiles the frontend with Node. Stage 2 is the Python runtime; it
# copies in only the built files, not Node or node_modules.

# ---- Stage 1: build the frontend -------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: the backend, serving the built frontend ----------------------
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install locked dependencies first so this layer is cached between code changes.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/app ./app
COPY --from=frontend /frontend/dist ./static

# The backend serves ./static (see app/frontend.py). Without DATABASE_URL it
# keeps a SQLite file in /app/data; mount a volume there to keep it.
ENV STATIC_DIR=/app/static
RUN mkdir -p /app/data

# The commit being built, reported by /api/health (CI passes it in).
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PORT\",\"8000\")}/api/health', timeout=2)"

# Render (and others) set PORT; 8000 otherwise.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
