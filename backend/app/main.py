"""Application factory. Run locally with `make run` (uvicorn app.main:app)."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.models import Base, make_engine
from app.routers import router

DEFAULT_DATABASE_URL = "sqlite:///./data/app.db"
DEV_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


def create_app(database_url: str | None = None) -> FastAPI:
    url = database_url or os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    engine = make_engine(url)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        sqlite_path = make_url(url).database
        if url.startswith("sqlite") and sqlite_path and sqlite_path != ":memory:":
            Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(engine)
        yield
        engine.dispose()

    # Comma-separated list. Set CORS_ORIGINS to the deployed frontend's URL.
    origins = [o.strip() for o in os.getenv("CORS_ORIGINS", DEV_CORS_ORIGINS).split(",") if o.strip()]
    app = FastAPI(title="Competitor Reels API", version="0.1.0", lifespan=lifespan)
    app.state.session_factory = session_factory
    # The Vite dev server proxies /api, so CORS only matters if you call the API directly.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
