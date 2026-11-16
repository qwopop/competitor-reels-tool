"""Application factory. Run locally with `make run` (uvicorn app.main:app)."""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.ai_writer import HttpGeminiClient
from app.generator import SampleSource
from app.youtube import YouTubeApiSource, YouTubeSource
from app.models import Base, make_engine, upgrade_schema
from app.frontend import mount_frontend
from app.routers import router
from app import store, telemetry as otel

# A new file name: the YouTube tables differ from the earlier Instagram ones.
DEFAULT_DATABASE_URL = "sqlite:///./data/clipremix.db"
DEV_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


_FROM_ENV = object()


def source_from_env():
    """Pick the video source from VIDEO_SOURCE and YOUTUBE_API_KEY.

    sample: generated videos, no network. youtube (default): the YouTube Data API when
    YOUTUBE_API_KEY is set, otherwise the public channel feed. youtube_api: the API, and
    startup fails when the key is missing. youtube_feed: always the public feed.
    """
    mode = os.getenv("VIDEO_SOURCE", "youtube").strip().lower()
    key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if mode == "sample":
        return SampleSource()
    if mode == "youtube_feed":
        return YouTubeSource()
    if mode == "youtube_api":
        if not key:
            raise RuntimeError("VIDEO_SOURCE=youtube_api needs YOUTUBE_API_KEY to be set.")
        return YouTubeApiSource(key)
    if key:
        return YouTubeApiSource(key)
    logging.getLogger(__name__).warning(
        "YOUTUBE_API_KEY is not set: reading YouTube's public feeds, which YouTube often refuses."
    )
    return YouTubeSource()


def create_app(
    database_url: str | None = None, video_source=_FROM_ENV, telemetry=_FROM_ENV, gemini=None, clock=None
) -> FastAPI:
    """`video_source` looks channels up and fetches their videos; by default it comes from VIDEO_SOURCE.

    `telemetry` is an app.telemetry.Telemetry; by default it comes from the OTEL_EXPORTER_OTLP_*
    variables and is disabled (nothing exported) when OTEL_EXPORTER_OTLP_ENDPOINT is unset.

    `gemini` is the client the AI writer calls (app.ai_writer); by default the real HTTP client.
    Its key (GEMINI_API_KEY) is read on every request, so AI writing works only when it is set.

    `clock` returns the current time (timezone-aware); it decides the UTC day of the AI write
    limit (AI_WRITES_PER_DAY). By default the real time; tests inject a fixed one.
    """
    url = database_url or os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    engine = make_engine(url)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    telemetry = otel.from_env() if telemetry is _FROM_ENV else telemetry

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        sqlite_path = make_url(url).database
        if url.startswith("sqlite") and sqlite_path and sqlite_path != ":memory:":
            Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(engine)
        upgrade_schema(engine)
        yield
        telemetry.shutdown()  # flush pending telemetry (Render sends SIGTERM when a free service sleeps)
        engine.dispose()

    # Comma-separated list. Set CORS_ORIGINS to the deployed frontend's URL.
    origins = [o.strip() for o in os.getenv("CORS_ORIGINS", DEV_CORS_ORIGINS).split(",") if o.strip()]
    app = FastAPI(title="Competitor Videos API", version="0.1.0", lifespan=lifespan)
    app.state.session_factory = session_factory
    app.state.telemetry = telemetry
    app.state.video_source = source_from_env() if video_source is _FROM_ENV else video_source
    app.state.gemini = gemini or HttpGeminiClient()
    app.state.clock = clock or (lambda: datetime.now(timezone.utc))
    # The Vite dev server proxies /api, so CORS only matters if you call the API directly.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    telemetry.instrument(app, engine, session_factory, store.count_competitors)
    # Production: the same server also serves the built frontend (see Dockerfile).
    static_dir = os.getenv("STATIC_DIR", "").strip()
    if static_dir:
        mount_frontend(app, static_dir)
    return app


app = create_app()
