"""Health check and serving the built frontend from the API server."""

import pytest
from fastapi.testclient import TestClient

from app.generator import SampleSource
from app.main import create_app


def test_health_reports_ok_and_the_version(client, monkeypatch):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "ok", "version": "dev"}

    monkeypatch.setenv("RENDER_GIT_COMMIT", "abc123")
    assert client.get("/api/health").json()["version"] == "abc123"


@pytest.fixture
def served(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>ClipRemix</title>")
    (dist / "favicon.svg").write_text("<svg/>")
    (dist / "assets" / "app-123.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("outside the build")
    monkeypatch.setenv("STATIC_DIR", str(dist))
    app = create_app(f"sqlite:///{tmp_path / 'web.db'}", video_source=SampleSource())
    with TestClient(app) as test_client:
        yield test_client


def test_the_app_shell_is_served_at_root_and_for_client_side_routes(served):
    for path in ["/", "/content-plan", "/remix/remix_1", "/go-to-videos"]:
        res = served.get(path)
        assert res.status_code == 200, path
        assert "<title>ClipRemix</title>" in res.text


def test_built_files_are_served(served):
    assert served.get("/assets/app-123.js").text == "console.log(1)"
    assert served.get("/favicon.svg").text == "<svg/>"


def test_the_api_still_works_and_unknown_api_paths_are_json_404s(served):
    assert served.get("/api/competitors").json() == []
    res = served.get("/api/nope")
    assert res.status_code == 404
    assert res.json() == {"detail": "Not Found"}


def test_files_outside_the_build_folder_are_not_served(served):
    res = served.get("/../secret.txt")
    assert "outside the build" not in res.text
    res = served.get("/%2e%2e/secret.txt")
    assert "outside the build" not in res.text


def test_a_missing_build_is_a_clear_startup_error(tmp_path, monkeypatch):
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "nowhere"))
    with pytest.raises(RuntimeError, match="no index.html"):
        create_app(f"sqlite:///{tmp_path / 'x.db'}", video_source=SampleSource())
