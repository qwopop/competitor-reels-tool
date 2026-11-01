"""Integration tests: run against the stack from docker-compose.yaml.

They check the two things containerising added that can break: the built
frontend is served by the backend, and the backend works with PostgreSQL.

    make integration     (starts the stack with VIDEO_SOURCE=sample, then runs these)

BASE_URL points at the running app (default http://localhost:8100). Every test
uses its own channel handle, so they can run again on a database with old data.
"""

import os
import re
import uuid

import httpx
import pytest

BASE_URL = os.getenv("BASE_URL", "http://localhost:8100").rstrip("/")


@pytest.fixture(scope="session")
def http():
    with httpx.Client(base_url=BASE_URL, timeout=15) as client:
        yield client


def unique_handle(prefix="it"):
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def add_channel(http, handle):
    res = http.post("/api/competitors", json={"channelUrl": f"@{handle}"})
    assert res.status_code == 201, res.text
    return res.json()


# ----- the app and its database ---------------------------------------------

def test_health_reports_the_database_is_reachable(http):
    res = http.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["database"] == "ok"


def test_unknown_api_paths_are_json_404s(http):
    res = http.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.json() == {"detail": "Not Found"}


# ----- the built frontend is served by the backend ---------------------------

def test_the_app_shell_is_served_with_its_compiled_bundle(http):
    res = http.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "<title>ClipRemix</title>" in res.text
    scripts = re.findall(r'src="(/assets/[^"]+\.js)"', res.text)
    assert scripts, "index.html should load a compiled JS bundle"
    bundle = http.get(scripts[0])
    assert bundle.status_code == 200
    assert "javascript" in bundle.headers["content-type"]


@pytest.mark.parametrize("path", ["/competitors", "/videos", "/content-plan", "/remix/some-id", "/go-to-videos"])
def test_client_side_routes_load_the_app(http, path):
    res = http.get(path)
    assert res.status_code == 200
    assert "<title>ClipRemix</title>" in res.text


def test_the_favicon_is_served(http):
    res = http.get("/favicon.svg")
    assert res.status_code == 200
    assert "<svg" in res.text


# ----- the backend works with PostgreSQL -------------------------------------

def test_a_full_flow_is_stored_in_postgres(http):
    comp = add_channel(http, unique_handle())
    videos = http.post(f"/api/competitors/{comp['id']}/videos/fetch").json()
    assert len(videos) == 15

    remix = http.post(f"/api/videos/{videos[0]['id']}/remix", json={"template": "educational"})
    assert remix.status_code == 201
    item = http.post("/api/content-plan", json={"videoId": videos[0]["id"]}).json()
    updated = http.patch(
        f"/api/content-plan/{item['id']}", json={"filmDate": "2026-12-01", "scriptDone": True}
    ).json()
    assert updated["filmDate"] == "2026-12-01" and updated["scriptDone"] is True

    # Read back in fresh requests: the data really is in the database.
    assert any(c["id"] == comp["id"] for c in http.get("/api/competitors").json())
    assert http.get(f"/api/videos/{videos[0]['id']}/remix/current").json()["id"] == remix.json()["id"]
    [stored] = [p for p in http.get("/api/content-plan").json() if p["id"] == item["id"]]
    assert stored["filmDate"] == "2026-12-01"


def test_database_constraints_prevent_duplicates(http):
    handle = unique_handle()
    first = add_channel(http, handle)
    again = http.post("/api/competitors", json={"channelUrl": f"https://www.youtube.com/@{handle}"})
    assert again.status_code == 200 and again.json()["id"] == first["id"]

    video = http.post(f"/api/competitors/{first['id']}/videos/fetch").json()[0]
    assert http.post("/api/content-plan", json={"videoId": video["id"]}).status_code == 201
    assert http.post("/api/content-plan", json={"videoId": video["id"]}).status_code == 200


def test_postgres_enforces_the_text_limits(http):
    comp = add_channel(http, unique_handle())
    video = http.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    remix = http.post(f"/api/videos/{video['id']}/remix").json()
    assert http.patch(f"/api/remixes/{remix['id']}", json={"script": "x" * 2000}).status_code == 200
    assert http.patch(f"/api/remixes/{remix['id']}", json={"script": "x" * 2001}).status_code == 422


def test_removing_a_competitor_cascades_but_keeps_plan_items(http):
    comp = add_channel(http, unique_handle())
    video = http.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    http.post(f"/api/videos/{video['id']}/remix")
    item = http.post("/api/content-plan", json={"videoId": video["id"]}).json()

    assert http.delete(f"/api/competitors/{comp['id']}").status_code == 204
    assert http.get(f"/api/videos/{video['id']}").status_code == 404
    assert any(p["id"] == item["id"] for p in http.get("/api/content-plan").json())
