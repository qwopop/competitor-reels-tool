import os
import socket

import pytest
from fastapi.testclient import TestClient

from app.ai_writer import API_HOST as GEMINI_HOST
from app.generator import SampleSource
from app.main import create_app
from app.models import Base, make_engine

# Set TEST_DATABASE_URL (for example postgresql://clipremix:clipremix@localhost:5432/clipremix)
# to run the API tests against PostgreSQL. Without it they use a fresh SQLite file.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "").strip()


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Apps built from the environment use sample data, so no test ever calls YouTube.

    No test calls Gemini either: GEMINI_API_KEY and GEMINI_MODEL are cleared, and any attempt
    to resolve Gemini's host fails the test (tests inject a fake client instead).
    """
    monkeypatch.setenv("VIDEO_SOURCE", "sample")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("AI_WRITES_PER_DAY", raising=False)
    real_getaddrinfo = socket.getaddrinfo

    def guarded_getaddrinfo(host, *args, **kwargs):
        if isinstance(host, (str, bytes)) and GEMINI_HOST in (host.decode() if isinstance(host, bytes) else host):
            pytest.fail(f"A test tried to reach {GEMINI_HOST}; use a fake Gemini client.")
        return real_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", guarded_getaddrinfo)


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
