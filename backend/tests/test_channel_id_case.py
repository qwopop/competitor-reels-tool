"""Issue #73: channel IDs keep their case; handles stay lowercase and case-insensitive."""

import pytest
from fastapi.testclient import TestClient

from app.generator import SampleSource
from app.main import create_app
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
