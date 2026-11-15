"""Health check and serving the built frontend from the API server."""

import pytest
from fastapi.testclient import TestClient

from app.generator import SampleSource
from app.main import create_app


@pytest.fixture
def clean_env(monkeypatch):
    for name in ("APP_ENV", "APP_VERSION", "RENDER_GIT_COMMIT"):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_health_reports_ok_the_version_and_the_environment(client, clean_env):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "ok", "version": "dev", "environment": "local"}


def test_health_reports_the_configured_environment(client, clean_env):
    clean_env.setenv("APP_ENV", "dev")
    assert client.get("/api/health").json()["environment"] == "dev"
    clean_env.setenv("APP_ENV", "prod")
    assert client.get("/api/health").json()["environment"] == "prod"


@pytest.mark.parametrize("value", ["", "staging", "  "])
def test_unknown_environments_fall_back_to_local(client, clean_env, value):
    clean_env.setenv("APP_ENV", value)
    assert client.get("/api/health").json()["environment"] == "local"


def test_version_uses_render_commit_when_app_version_is_unset(client, clean_env):
    clean_env.setenv("RENDER_GIT_COMMIT", "abc123")
    assert client.get("/api/health").json()["version"] == "abc123"


def test_app_version_wins_over_the_render_commit(client, clean_env):
    clean_env.setenv("RENDER_GIT_COMMIT", "abc123")
    clean_env.setenv("APP_VERSION", "v9")
    assert client.get("/api/health").json()["version"] == "v9"


def test_an_empty_app_version_counts_as_unset(client, clean_env):
    clean_env.setenv("APP_VERSION", "")
    clean_env.setenv("RENDER_GIT_COMMIT", "abc123")
    assert client.get("/api/health").json()["version"] == "abc123"


def test_postgres_connections_are_pinged_before_use_so_neon_suspends_are_survived():
    from app.models import make_engine

    engine = make_engine("postgresql://u:p@localhost:5432/x")
    assert engine.pool._pre_ping is True
    engine.dispose()


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


@pytest.mark.parametrize(
    "given, expected",
    [
        ("postgres://u:p@db:5432/clipremix", "postgresql+psycopg://u:p@db:5432/clipremix"),
        ("postgresql://u:p@db/clipremix", "postgresql+psycopg://u:p@db/clipremix"),
        ("postgresql+psycopg://u:p@db/clipremix", "postgresql+psycopg://u:p@db/clipremix"),
        ("sqlite:///./data/clipremix.db", "sqlite:///./data/clipremix.db"),
    ],
)
def test_database_urls_from_hosting_providers_are_accepted(given, expected):
    from app.models import normalize_database_url

    assert normalize_database_url(given) == expected
