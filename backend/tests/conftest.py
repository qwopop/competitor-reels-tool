import pytest
from fastapi.testclient import TestClient

from app.generator import SampleSource
from app.main import create_app


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Apps built from the environment use sample data, so no test ever calls YouTube."""
    monkeypatch.setenv("VIDEO_SOURCE", "sample")


@pytest.fixture
def client(tmp_path):
    """A fresh app backed by its own SQLite file for every test."""
    app = create_app(f"sqlite:///{tmp_path / 'test.db'}", video_source=SampleSource())
    with TestClient(app) as test_client:
        yield test_client
