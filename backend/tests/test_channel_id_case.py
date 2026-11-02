"""Issue #73: channel IDs keep their case; handles stay lowercase and case-insensitive."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.generator import SampleSource
from app.main import create_app
from app.models import CompetitorRow, ContentPlanRow, VideoRow, make_engine
from app.youtube import ChannelInfo

CHANNEL_ID = "UCabcdefghijklmnopqrstuv"
CHANNEL_URL = f"https://www.youtube.com/channel/{CHANNEL_ID}"


def add(client, url):
    return client.post("/api/competitors", json={"channelUrl": url})


@pytest.mark.parametrize(
    "link",
    [
        CHANNEL_ID,
        f"  {CHANNEL_ID}  ",
        CHANNEL_URL,
        f"{CHANNEL_URL}/videos",
        f"youtube.com/channel/{CHANNEL_ID}",
    ],
)
def test_adding_by_channel_id_keeps_its_case(client, link):
    res = add(client, link)
    assert res.status_code == 201
    assert res.json()["username"] == CHANNEL_ID
    assert res.json()["channelUrl"] == CHANNEL_URL


def test_channel_id_with_underscore_and_hyphen_is_stored_as_typed(client):
    channel_id = "UCx_y-Z0123456789abcdefg"
    res = add(client, f"https://www.youtube.com/channel/{channel_id}/videos")
    assert res.status_code == 201
    assert res.json()["username"] == channel_id
    assert res.json()["channelUrl"] == f"https://www.youtube.com/channel/{channel_id}"


def test_re_adding_a_channel_id_in_any_form_returns_the_same_competitor(client):
    first = add(client, CHANNEL_ID).json()
    for link in [CHANNEL_ID, f"  {CHANNEL_ID}  ", CHANNEL_URL, f"{CHANNEL_URL}/videos", f"youtube.com/channel/{CHANNEL_ID}"]:
        again = add(client, link)
        assert again.status_code == 200
        assert again.json()["id"] == first["id"]
    assert len(client.get("/api/competitors").json()) == 1


def test_a_channel_id_in_different_case_is_a_different_channel(client):
    first = add(client, CHANNEL_ID).json()
    other = add(client, CHANNEL_ID.upper())
    assert other.status_code == 201
    assert other.json()["id"] != first["id"]
    assert other.json()["username"] == CHANNEL_ID.upper()
    assert len(client.get("/api/competitors").json()) == 2


@pytest.mark.parametrize("handle", [f"@{CHANNEL_ID.lower()}", CHANNEL_ID.lower()])
def test_a_lowercase_handle_does_not_match_the_channel_id_competitor(client, handle):
    by_id = add(client, CHANNEL_ID).json()
    res = add(client, handle)
    assert res.status_code == 201
    assert res.json()["id"] != by_id["id"]
    assert res.json()["username"] == CHANNEL_ID.lower()
    assert res.json()["channelUrl"] == f"https://www.youtube.com/@{CHANNEL_ID.lower()}"


@pytest.mark.parametrize("link", ["@MKBHD", "MKBHD", "https://www.youtube.com/@MKBHD"])
def test_handles_are_still_stored_lowercase(client, link):
    res = add(client, link)
    assert res.status_code == 201
    assert res.json()["username"] == "mkbhd"


def test_handle_dedup_stays_case_insensitive(client):
    first = add(client, "@MKBHD").json()
    again = add(client, "@mkbhd")
    assert again.status_code == 200
    assert again.json()["id"] == first["id"]


class HandleForIdSource(SampleSource):
    """A channel that has a handle, looked up by its channel ID."""

    def resolve_channel(self, ref):
        return ChannelInfo(CHANNEL_ID, "SomeCreator", "Some Creator", None)


def test_a_channel_id_that_has_a_handle_stores_the_handle_lowercase(database_url):
    with TestClient(create_app(database_url, video_source=HandleForIdSource())) as client:
        res = add(client, CHANNEL_ID)
        assert res.status_code == 201
        assert res.json()["username"] == "somecreator"
        assert res.json()["channelUrl"] == "https://www.youtube.com/@somecreator"


def test_videos_and_plan_items_carry_the_channel_id_in_its_case(client):
    comp = add(client, CHANNEL_ID).json()
    videos = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()
    assert {v["competitorUsername"] for v in videos} == {CHANNEL_ID}
    assert {v["competitorUsername"] for v in client.get("/api/videos").json()} == {CHANNEL_ID}
    item = client.post("/api/content-plan", json={"videoId": videos[0]["id"]}).json()
    assert item["competitorUsername"] == CHANNEL_ID


# ---- Repairing databases saved before the fix -----------------------------------


def _seed_old_rows(database_url):
    """Rows as the old code wrote them, plus handle competitors the repair must not touch."""
    engine = make_engine(database_url)
    stamp = "2026-01-01T00:00:00.000Z"

    def competitor(id_, channel_id, username):
        return CompetitorRow(
            id=id_, channel_id=channel_id, username=username, channel_url="https://www.youtube.com/x",
            display_name=id_, avatar_url="https://example.com/a.png", added_at=stamp,
        )

    def video(id_, competitor_id, username):
        return VideoRow(
            id=id_, competitor_id=competitor_id, competitor_username=username, youtube_id=id_[-11:],
            permalink="https://www.youtube.com/x", caption="c", description="", thumbnail_url="t",
            view_count=1, like_count=1, comment_count=1, posted_at=stamp, fetched_at=stamp,
        )

    def plan(id_, video_id, username):
        return ContentPlanRow(
            id=id_, video_id=video_id, status="not_started", competitor_username=username, caption="c",
            thumbnail_url="t", permalink="https://www.youtube.com/x", posted_at=stamp, added_at=stamp, updated_at=stamp,
        )

    lower = CHANNEL_ID.lower()
    with Session(engine) as db:
        db.add_all([
            competitor("comp_old", CHANNEL_ID, lower),
            competitor("comp_sample", "sample-mkbhd", "mkbhd"),
            competitor("comp_handle", f"sample-{lower}", lower),
        ])
        db.flush()
        db.add_all([
            video("video_old_000001", "comp_old", lower),
            video("video_sample_001", "comp_sample", "mkbhd"),
            video("video_handle_001", "comp_handle", lower),
            plan("plan_old", "video_old_000001", lower),
            plan("plan_sample", "video_sample_001", "mkbhd"),
            plan("plan_handle", "video_handle_001", lower),
        ])
        db.commit()
    engine.dispose()


def _snapshot(database_url):
    engine = make_engine(database_url)
    with engine.connect() as conn:
        rows = {
            "competitors": dict(conn.execute(text("SELECT id, username FROM competitors")).all()),
            "videos": dict(conn.execute(text("SELECT id, competitor_username FROM videos")).all()),
            "plan": dict(conn.execute(text("SELECT id, competitor_username FROM content_plan")).all()),
        }
    engine.dispose()
    return rows


def test_startup_repairs_lowercased_channel_ids_and_only_those(database_url):
    with TestClient(create_app(database_url, video_source=SampleSource())):
        pass  # creates the tables
    _seed_old_rows(database_url)

    with TestClient(create_app(database_url, video_source=SampleSource())) as client:
        comps = {c["id"]: c for c in client.get("/api/competitors").json()}
        assert comps["comp_old"]["username"] == CHANNEL_ID
        videos = {v["id"]: v for v in client.get("/api/videos").json()}
        assert videos["video_old_000001"]["competitorUsername"] == CHANNEL_ID
        plan = {p["id"]: p for p in client.get("/api/content-plan").json()}
        assert plan["plan_old"]["competitorUsername"] == CHANNEL_ID

    lower = CHANNEL_ID.lower()
    expected = {
        "competitors": {"comp_old": CHANNEL_ID, "comp_sample": "mkbhd", "comp_handle": lower},
        "videos": {"video_old_000001": CHANNEL_ID, "video_sample_001": "mkbhd", "video_handle_001": lower},
        "plan": {"plan_old": CHANNEL_ID, "plan_sample": "mkbhd", "plan_handle": lower},
    }
    assert _snapshot(database_url) == expected

    # A second restart changes nothing and raises no error.
    with TestClient(create_app(database_url, video_source=SampleSource())):
        pass
    assert _snapshot(database_url) == expected


def test_repair_fixes_plan_items_that_outlived_their_video(database_url):
    with TestClient(create_app(database_url, video_source=SampleSource())):
        pass
    _seed_old_rows(database_url)
    engine = make_engine(database_url)
    with engine.begin() as conn:
        # The handle competitor is gone, and the old competitor's video was replaced by a re-fetch.
        conn.execute(text("DELETE FROM content_plan WHERE id = 'plan_handle'"))
        conn.execute(text("DELETE FROM competitors WHERE id = 'comp_handle'"))
        conn.execute(text("DELETE FROM videos WHERE id = 'video_old_000001'"))
    engine.dispose()

    with TestClient(create_app(database_url, video_source=SampleSource())):
        pass
    assert _snapshot(database_url)["plan"] == {"plan_old": CHANNEL_ID, "plan_sample": "mkbhd"}

    engine = make_engine(database_url)
    with Session(engine) as db:
        assert db.scalars(select(CompetitorRow.username).where(CompetitorRow.id == "comp_old")).one() == CHANNEL_ID
    engine.dispose()
