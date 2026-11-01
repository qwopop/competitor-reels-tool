import os

import pytest
from fastapi.testclient import TestClient

from app.generator import SampleSource
from app.main import create_app
from app.models import Base, make_engine

# Set TEST_DATABASE_URL (for example postgresql://clipremix:clipremix@localhost:5432/clipremix)
# to run the API tests against PostgreSQL. Without it they use a fresh SQLite file.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "").strip()


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Apps built from the environment use sample data, so no test ever calls YouTube."""
    monkeypatch.setenv("VIDEO_SOURCE", "sample")


@pytest.fixture
def database_url(tmp_path):
    """A clean database for one test: emptied PostgreSQL, or a new SQLite file."""
    if not TEST_DATABASE_URL:
        return f"sqlite:///{tmp_path / 'test.db'}"
    engine = make_engine(TEST_DATABASE_URL)
    Base.metadata.drop_all(engine)
    engine.dispose()
    return TEST_DATABASE_URL


@pytest.fixture
def client(database_url):
    """A fresh app backed by its own database for every test."""
    app = create_app(database_url, video_source=SampleSource())
    with TestClient(app) as test_client:
        yield test_client
