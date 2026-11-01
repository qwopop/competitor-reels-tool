"""Content plan: filming and publishing dates, and the production checklist."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def planned(client):
    comp = client.post("/api/competitors", json={"channelUrl": "@creator"}).json()
    video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
    return client.post("/api/content-plan", json={"videoId": video["id"]}).json()


def patch(client, item, **body):
    return client.patch(f"/api/content-plan/{item['id']}", json=body)


def test_new_items_have_no_dates_and_an_empty_checklist(client):
    item = planned(client)
    assert item["filmDate"] is None and item["publishDate"] is None
    assert [item[k] for k in ("scriptDone", "recordingDone", "captionDone", "publishedDone")] == [False] * 4


def test_set_and_clear_dates(client):
    item = planned(client)
    res = patch(client, item, filmDate="2026-11-10", publishDate="2026-11-14")
    assert res.status_code == 200
    assert (res.json()["filmDate"], res.json()["publishDate"]) == ("2026-11-10", "2026-11-14")

    cleared = patch(client, item, filmDate=None).json()
    assert cleared["filmDate"] is None
    assert cleared["publishDate"] == "2026-11-14"  # untouched
    assert client.get("/api/content-plan").json()[0]["publishDate"] == "2026-11-14"


def test_tick_the_checklist_without_touching_the_status(client):
    item = planned(client)
    res = patch(client, item, scriptDone=True, captionDone=True).json()
    assert (res["scriptDone"], res["recordingDone"], res["captionDone"], res["publishedDone"]) == (True, False, True, False)
    assert res["status"] == "not_started"
    assert patch(client, item, scriptDone=False).json()["scriptDone"] is False


def test_status_only_updates_still_work(client):
    item = planned(client)
    patch(client, item, filmDate="2026-11-10")
    res = patch(client, item, status="ready").json()
    assert res["status"] == "ready" and res["filmDate"] == "2026-11-10"


@pytest.mark.parametrize(
    "body",
    [{}, {"filmDate": "10/11/2026"}, {"filmDate": "2026-02-30"}, {"scriptDone": None},
     {"status": None}, {"status": "done"}, {"colour": "red"}],
)
def test_bad_updates_are_rejected(client, body):
    item = planned(client)
    assert patch(client, item, **body).status_code == 422


def test_an_older_database_gets_the_new_plan_columns(tmp_path):
    path = tmp_path / "old.db"
    with TestClient(create_app(f"sqlite:///{path}", video_source=None)):
        pass
    conn = sqlite3.connect(path)
    for column in ("film_date", "publish_date", "script_done", "recording_done", "caption_done", "published_done"):
        conn.execute(f"ALTER TABLE content_plan DROP COLUMN {column}")
    conn.execute(
        "INSERT INTO content_plan (id, video_id, status, competitor_username, caption, thumbnail_url, permalink,"
        " posted_at, added_at, updated_at) VALUES ('p1', 'v1', 'ready', 'x', 'c', 't', 'p', 'a', 'a', 'a')"
    )
    conn.commit()
    conn.close()

    with TestClient(create_app(f"sqlite:///{path}", video_source=None)) as client:
        [item] = client.get("/api/content-plan").json()
        assert item["filmDate"] is None and item["scriptDone"] is False
        assert client.patch("/api/content-plan/p1", json={"recordingDone": True}).json()["recordingDone"] is True
