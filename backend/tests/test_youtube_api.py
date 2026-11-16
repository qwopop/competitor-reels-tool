"""The YouTube Data API source and source selection, with the HTTP transport faked."""

import io
import json
import logging
import sys
import urllib.error
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest

from app import youtube
from app.generator import SampleSource
from app.main import source_from_env
from app.youtube import ChannelRef, YouTubeApiSource, YouTubeError, YouTubeSource

KEY = "AIzaSyFAKE-KEY-for-tests-0123456789abc"
CHANNEL_ID = "UCX6OQ3DkcsbYNE6H8uQQuVA"
COMPETITOR = SimpleNamespace(id="comp_1", username="mrbeast", channel_id=CHANNEL_ID)

CHANNEL = {
    "items": [
        {
            "id": CHANNEL_ID,
            "snippet": {"title": "MrBeast", "customUrl": "@MrBeast", "thumbnails": {"default": {"url": "https://yt3.example/a=s88"}}},
            "contentDetails": {"relatedPlaylists": {"uploads": "UU" + CHANNEL_ID[2:]}},
        }
    ]
}


def vid(n: int) -> str:
    return f"vid{n:08d}"[:11]


def video_item(n: int, **stats) -> dict:
    return {
        "id": vid(n),
        "snippet": {
            "title": f" Video {n} ",
            "description": f"About {n}",
            "publishedAt": "2026-10-30T18:04:11Z",
            "thumbnails": {"high": {"url": f"https://i.ytimg.com/vi/{vid(n)}/hq.jpg"}},
        },
        "statistics": stats or {"viewCount": "1000", "likeCount": "50", "commentCount": "7"},
    }


class FakeApi:
    """Routes by endpoint name; records every URL and header set."""

    def __init__(self, **answers):
        self.answers = answers
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, url, headers):
        self.calls.append((url, headers))
        endpoint = urlparse(url).path.rsplit("/", 1)[-1]
        answer = self.answers[endpoint]
        if callable(answer):
            answer = answer(parse_qs(urlparse(url).query))
        if isinstance(answer, Exception):
            raise answer
        return answer

    def params(self, endpoint):
        return [parse_qs(urlparse(u).query) for u, _ in self.calls if urlparse(u).path.endswith("/" + endpoint)]


def playlist(n: int) -> dict:
    return {"items": [{"contentDetails": {"videoId": vid(i)}} for i in range(n)]}


PRIVATE = vid(9)


def videos_for(query):
    return {"items": [video_item(int(i[3:])) for i in query["id"][0].split(",") if i != PRIVATE]}


def source(api: FakeApi) -> YouTubeApiSource:
    return YouTubeApiSource(KEY, get_json=api)


# ----- resolving channels ----------------------------------------------------

def test_resolve_handle_uses_for_handle_and_header_key():
    api = FakeApi(channels=CHANNEL)
    info = source(api).resolve_channel(ChannelRef("handle", "mrbeast"))
    assert info == (CHANNEL_ID, "mrbeast", "MrBeast", "https://yt3.example/a=s88")
    assert api.params("channels")[0]["forHandle"] == ["@mrbeast"]
    url, headers = api.calls[0]
    assert headers["x-goog-api-key"] == KEY
    assert KEY not in url and "key=" not in url


def test_resolve_id_and_user():
    api = FakeApi(channels=CHANNEL)
    s = source(api)
    assert s.resolve_channel(ChannelRef("id", CHANNEL_ID)).channel_id == CHANNEL_ID
    s.resolve_channel(ChannelRef("user", "mrbeast6000"))
    assert api.params("channels")[0]["id"] == [CHANNEL_ID]
    assert api.params("channels")[1]["forUsername"] == ["mrbeast6000"]


def test_resolve_video_link_goes_through_videos_list():
    api = FakeApi(videos={"items": [{"snippet": {"channelId": CHANNEL_ID}}]}, channels=CHANNEL)
    assert source(api).resolve_channel(ChannelRef("video", "AAAAAAAAAA1")).channel_id == CHANNEL_ID
    assert api.params("videos")[0]["id"] == ["AAAAAAAAAA1"]
    assert api.params("channels")[0]["id"] == [CHANNEL_ID]


def test_resolve_video_not_found():
    with pytest.raises(YouTubeError) as err:
        source(FakeApi(videos={"items": []})).resolve_channel(ChannelRef("video", "AAAAAAAAAA1"))
    assert err.value.status == 404


def test_resolve_c_url_reads_the_page_then_asks_the_api():
    api = FakeApi(channels=CHANNEL)
    pages = []
    page = f'<link rel="canonical" href="https://www.youtube.com/channel/{CHANNEL_ID}">'
    s = YouTubeApiSource(KEY, get_json=api, fetch_text=lambda u: pages.append(u) or page)
    assert s.resolve_channel(ChannelRef("c", "MrBeast")).channel_id == CHANNEL_ID
    assert pages == ["https://www.youtube.com/c/MrBeast"]


def test_channel_not_found_is_404():
    with pytest.raises(YouTubeError, match="could not find that channel") as err:
        source(FakeApi(channels={"items": []})).resolve_channel(ChannelRef("handle", "nobodyhere"))
    assert err.value.status == 404


# ----- fetching videos -------------------------------------------------------

def test_fetch_videos_parses_rows_in_playlist_order_and_skips_private_videos():
    api = FakeApi(channels=CHANNEL, playlistItems=playlist(10), videos=videos_for)
    rows = source(api).fetch_videos(COMPETITOR)
    assert [r.youtube_id for r in rows] == [vid(i) for i in range(9)]  # vid(9) is private: no details
    first = rows[0]
    assert (first.caption, first.description) == ("Video 0", "About 0")
    assert (first.view_count, first.like_count, first.comment_count) == (1000, 50, 7)
    assert first.posted_at == "2026-10-30T18:04:11.000Z"
    assert first.permalink == f"https://www.youtube.com/watch?v={vid(0)}"
    assert first.thumbnail_url.endswith("/hq.jpg")
    assert first.competitor_id == "comp_1" and first.competitor_username == "mrbeast"
    pl = api.params("playlistItems")[0]
    assert pl["playlistId"] == ["UU" + CHANNEL_ID[2:]] and pl["maxResults"] == ["15"]


def test_hidden_likes_become_zero():
    api = FakeApi(channels=CHANNEL, playlistItems=playlist(1), videos={"items": [video_item(0, viewCount="5")]})
    row = source(api).fetch_videos(COMPETITOR)[0]
    assert (row.view_count, row.like_count, row.comment_count) == (5, 0, 0)


def test_video_details_are_batched_in_50s(monkeypatch):
    monkeypatch.setattr(youtube, "VIDEOS_PER_FETCH", 120)
    monkeypatch.setattr(sys.modules[__name__], "PRIVATE", "none")
    api = FakeApi(channels=CHANNEL, playlistItems=playlist(120), videos=videos_for)
    rows = source(api).fetch_videos(COMPETITOR)
    sizes = [len(p["id"][0].split(",")) for p in api.params("videos")]
    assert sizes == [50, 50, 20] and len(rows) == 120


def test_a_normal_fetch_costs_three_calls_and_never_searches():
    api = FakeApi(channels=CHANNEL, playlistItems=playlist(1), videos={"items": [video_item(0)]})
    assert len(source(api).fetch_videos(COMPETITOR)) == 1
    assert [urlparse(u).path.rsplit("/", 1)[-1] for u, _ in api.calls] == ["channels", "playlistItems", "videos"]


def test_channel_without_uploads_gives_no_videos():
    no_uploads = {"items": [{"id": CHANNEL_ID, "contentDetails": {"relatedPlaylists": {}}}]}
    assert source(FakeApi(channels=no_uploads)).fetch_videos(COMPETITOR) == []
    gone = YouTubeError("YouTube could not find that channel.", status=404)
    assert source(FakeApi(channels=CHANNEL, playlistItems=gone)).fetch_videos(COMPETITOR) == []


# ----- errors ----------------------------------------------------------------

def http_error(code, reason="", message=""):
    body = json.dumps({"error": {"code": code, "message": message, "errors": [{"reason": reason}]}}).encode()
    return urllib.error.HTTPError("https://www.googleapis.com/youtube/v3/channels?part=snippet", code, "x", {}, io.BytesIO(body))


@pytest.mark.parametrize(
    "code, reason, message, expected",
    [
        (400, "badRequest", "API key not valid. Please pass a valid API key.", youtube.KEY_REJECTED),
        (400, "keyInvalid", "", youtube.KEY_REJECTED),
        (403, "keyInvalid", "", youtube.KEY_REJECTED),
        (403, "accessNotConfigured", "", youtube.KEY_REJECTED),
        (403, "ipRefererBlocked", "", youtube.KEY_REJECTED),
        (403, "quotaExceeded", "", youtube.QUOTA_USED_UP),
        (403, "rateLimitExceeded", "", youtube.QUOTA_USED_UP),
        (500, "backendError", "", "YouTube returned HTTP 500. Try again in a minute."),
    ],
)
def test_http_errors_are_mapped_through_the_real_transport(monkeypatch, code, reason, message, expected):
    def urlopen(request, timeout):
        raise http_error(code, reason, message)

    monkeypatch.setattr(youtube.urllib.request, "urlopen", urlopen)
    with pytest.raises(YouTubeError) as err:
        YouTubeApiSource(KEY).resolve_channel(ChannelRef("id", CHANNEL_ID))
    assert str(err.value) == expected and err.value.status == 502
    assert KEY not in str(err.value) and "googleapis" not in str(err.value)


def test_network_error_and_request_headers(monkeypatch):
    seen = {}

    def urlopen(request, timeout):
        seen["url"], seen["headers"], seen["timeout"] = request.full_url, dict(request.header_items()), timeout
        raise urllib.error.URLError("boom " + KEY)

    monkeypatch.setattr(youtube.urllib.request, "urlopen", urlopen)
    with pytest.raises(YouTubeError, match="Could not reach YouTube") as err:
        YouTubeApiSource(KEY).resolve_channel(ChannelRef("handle", "mrbeast"))
    assert KEY not in str(err.value)
    assert KEY not in seen["url"] and seen["headers"]["X-goog-api-key"] == KEY and seen["timeout"] == 20


def test_unreadable_answer(monkeypatch):
    class Res(io.BytesIO):
        __enter__ = lambda self: self
        __exit__ = lambda self, *a: None

    monkeypatch.setattr(youtube.urllib.request, "urlopen", lambda r, timeout: Res(b"<html>"))
    with pytest.raises(YouTubeError, match="could not be read"):
        YouTubeApiSource(KEY).resolve_channel(ChannelRef("id", CHANNEL_ID))


def test_key_is_never_in_repr_or_the_missing_key_error():
    assert KEY not in repr(source(FakeApi()))
    with pytest.raises(ValueError):
        YouTubeApiSource("  ")


def test_api_error_through_the_endpoint_hides_the_key(monkeypatch, caplog):
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app("sqlite://", video_source=YouTubeApiSource(KEY, get_json=FakeApi(channels=youtube._api_error(403, b'{"error":{"errors":[{"reason":"quotaExceeded"}]}}'))))
    with TestClient(app) as client, caplog.at_level(logging.DEBUG):
        res = client.post("/api/competitors", json={"channelUrl": "@mrbeast"})
    assert res.status_code == 502 and res.json()["detail"] == youtube.QUOTA_USED_UP
    assert KEY not in res.text and KEY not in caplog.text


# ----- choosing the source ---------------------------------------------------

@pytest.fixture
def env(monkeypatch):
    for name in ("VIDEO_SOURCE", "YOUTUBE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_default_uses_the_api_when_a_key_is_set(env):
    env.setenv("YOUTUBE_API_KEY", KEY)
    assert isinstance(source_from_env(), YouTubeApiSource)
    env.setenv("VIDEO_SOURCE", "youtube")
    assert isinstance(source_from_env(), YouTubeApiSource)


@pytest.mark.parametrize("key", [None, "", "   "])
def test_default_falls_back_to_the_feed_with_one_warning(env, caplog, key):
    if key is not None:
        env.setenv("YOUTUBE_API_KEY", key)
    with caplog.at_level(logging.WARNING):
        assert type(source_from_env()) is YouTubeSource
    assert len([r for r in caplog.records if "YOUTUBE_API_KEY" in r.message]) == 1


def test_sample_and_feed_ignore_the_key(env):
    env.setenv("YOUTUBE_API_KEY", KEY)
    env.setenv("VIDEO_SOURCE", "sample")
    assert isinstance(source_from_env(), SampleSource)
    env.setenv("VIDEO_SOURCE", "youtube_feed")
    assert type(source_from_env()) is YouTubeSource


def test_youtube_api_requires_the_key(env):
    env.setenv("VIDEO_SOURCE", "youtube_api")
    with pytest.raises(RuntimeError, match="YOUTUBE_API_KEY"):
        source_from_env()
    env.setenv("YOUTUBE_API_KEY", KEY)
    assert isinstance(source_from_env(), YouTubeApiSource)
