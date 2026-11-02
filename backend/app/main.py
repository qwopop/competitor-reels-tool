"""Application factory. Run locally with `make run` (uvicorn app.main:app)."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.generator import SampleSource
from app.youtube import YouTubeSource
from app.models import Base, make_engine, repair_channel_id_usernames, upgrade_schema
from app.frontend import mount_frontend
from app.routers import router

# A new file name: the YouTube tables differ from the earlier Instagram ones.
DEFAULT_DATABASE_URL = "sqlite:///./data/clipremix.db"
DEV_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


_FROM_ENV = object()


def source_from_env():
    """VIDEO_SOURCE=sample uses generated videos and no network; anything else reads YouTube."""
    return SampleSource() if os.getenv("VIDEO_SOURCE", "youtube").strip().lower() == "sample" else YouTubeSource()


def create_app(database_url: str | None = None, video_source=_FROM_ENV) -> FastAPI:
    """`video_source` looks channels up and fetches their videos; by default it comes from VIDEO_SOURCE."""
    url = database_url or os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    engine = make_engine(url)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        sqlite_path = make_url(url).database
        if url.startswith("sqlite") and sqlite_path and sqlite_path != ":memory:":
            Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(engine)
        upgrade_schema(engine)
        repair_channel_id_usernames(engine)
        yield
        engine.dispose()

    # Comma-separated list. Set CORS_ORIGINS to the deployed frontend's URL.
    origins = [o.strip() for o in os.getenv("CORS_ORIGINS", DEV_CORS_ORIGINS).split(",") if o.strip()]
    app = FastAPI(title="Competitor Videos API", version="0.1.0", lifespan=lifespan)
    app.state.session_factory = session_factory
    app.state.video_source = source_from_env() if video_source is _FROM_ENV else video_source
    # The Vite dev server proxies /api, so CORS only matters if you call the API directly.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    # Production: the same server also serves the built frontend (see Dockerfile).
    static_dir = os.getenv("STATIC_DIR", "").strip()
    if static_dir:
        mount_frontend(app, static_dir)
    return app


app = create_app()
