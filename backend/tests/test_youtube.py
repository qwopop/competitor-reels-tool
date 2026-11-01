"""YouTube channel lookup and feed reading, with every HTTP call faked."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.youtube import (
    ChannelRef,
    YouTubeError,
    YouTubeSource,
    feed_url,
    parse_channel_input,
    parse_feed,
)

CHANNEL_ID = "UCBJycsmduvYEL83R_U4JriQ"

# Trimmed copies of what YouTube serves: the channel feed and the parts of a channel page we read.
FEED = f"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Marques Brownlee</title>
 <yt:channelId>{CHANNEL_ID}</yt:channelId>
 <author><name>Marques Brownlee</name><uri>https://www.youtube.com/channel/{CHANNEL_ID}</uri></author>
 <entry>
  <id>yt:video:AAAAAAAAAA1</id>
  <yt:videoId>AAAAAAAAAA1</yt:videoId>
  <title>The Best Phone of 2026 &amp; Why</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=AAAAAAAAAA1"/>
  <published>2026-10-30T18:04:11+00:00</published>
  <media:group>
   <media:title>The Best Phone of 2026 &amp; Why</media:title>
   <media:thumbnail url="https://i1.ytimg.com/vi/AAAAAAAAAA1/hqdefault.jpg" width="480" height="360"/>
   <media:description>Full review.</media:description>
   <media:community>
    <media:starRating count="61234" average="5.00" min="1" max="5"/>
    <media:statistics views="1834567"/>
   </media:community>
  </media:group>
 </entry>
 <entry>
  <id>yt:video:BBBBBBBBBB2</id>
  <yt:videoId>BBBBBBBBBB2</yt:videoId>
  <title>Tiny camera test</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/BBBBBBBBBB2"/>
  <published>2026-10-28T09:00:00+00:00</published>
  <media:group>
   <media:thumbnail url="https://i2.ytimg.com/vi/BBBBBBBBBB2/hqdefault.jpg" width="480" height="360"/>
   <media:community>
    <media:starRating count="900" average="5.00" min="1" max="5"/>
    <media:statistics views="45000"/>
   </media:community>
  </media:group>
 </entry>
</feed>
"""

CHANNEL_PAGE = f"""<html><head>
<link rel="canonical" href="https://www.youtube.com/channel/{CHANNEL_ID}">
<meta property="og:title" content="Marques Brownlee">
<meta property="og:image" content="https://yt3.googleusercontent.com/avatar=s900">
</head><body><script>var ytInitialData = {{"metadata":{{"channelMetadataRenderer":{{
"externalId":"{CHANNEL_ID}","vanityChannelUrl":"http://www.youtube.com/@MKBHD"}}}}}};</script></body></html>"""

VIDEO_PAGE = f"""<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=AAAAAAAAAA1">
<meta property="og:title" content="The Best Phone of 2026"></head>
<body><script>var ytInitialPlayerResponse = {{"videoDetails":{{"videoId":"AAAAAAAAAA1","channelId":"{CHANNEL_ID}"}}}};</script></body></html>"""


class FakeYouTube:
    """Answers by URL. A value that is an exception is raised instead."""

    def __init__(self, pages: dict[str, object]):
        self.pages = pages
        self.urls: list[str] = []

    def __call__(self, url: str) -> str:
        self.urls.append(url)
        page = self.pages.get(url)
        if page is None:
            raise YouTubeError("YouTube could not find that channel.", status=404)
        if isinstance(page, Exception):
            raise page
        return page


def site(**overrides) -> FakeYouTube:
    pages = {
        "https://www.youtube.com/@mkbhd": CHANNEL_PAGE,
        f"https://www.youtube.com/channel/{CHANNEL_ID}": CHANNEL_PAGE,
        "https://www.youtube.com/watch?v=AAAAAAAAAA1": VIDEO_PAGE,
        feed_url(CHANNEL_ID): FEED,
    }
    pages.update(overrides)
    return FakeYouTube(pages)


# ----- parsing what people paste --------------------------------------------

@pytest.mark.parametrize(
    "raw, expected",
    [
        ("https://www.youtube.com/@MKBHD", ("handle", "mkbhd")),
        ("youtube.com/@mkbhd/videos", ("handle", "mkbhd")),
        ("https://m.youtube.com/@mkbhd/shorts?si=abc", ("handle", "mkbhd")),
        ("@mkbhd", ("handle", "mkbhd")),
        ("mkbhd", ("handle", "mkbhd")),
        ("@vibe.coder-1", ("handle", "vibe.coder-1")),
        (f"https://www.youtube.com/channel/{CHANNEL_ID}", ("id", CHANNEL_ID)),
        (CHANNEL_ID, ("id", CHANNEL_ID)),
        ("https://www.youtube.com/c/LinusTechTips", ("c", "LinusTechTips")),
        ("https://www.youtube.com/user/marquesbrownlee/videos", ("user", "marquesbrownlee")),
        ("https://www.youtube.com/watch?v=AAAAAAAAAA1&t=30s", ("video", "AAAAAAAAAA1")),
        ("https://youtu.be/AAAAAAAAAA1?si=x", ("video", "AAAAAAAAAA1")),
        ("https://www.youtube.com/shorts/BBBBBBBBBB2", ("video", "BBBBBBBBBB2")),
        ("https://www.youtube.com/live/AAAAAAAAAA1", ("video", "AAAAAAAAAA1")),
        # not channels
        ("", None),
        ("   ", None),
        ("@ab", None),
        ("@" + "a" * 31, None),
        ("@vibe coder", None),
        ("https://www.youtube.com/", None),
        ("https://www.youtube.com/feed/trending", None),
        ("https://www.youtube.com/results?search_query=x", None),
        ("https://www.youtube.com/watch?v=short", None),
        ("https://www.youtube.com/channel/not-an-id", None),
        ("https://evil.com/www.youtube.com/@mkbhd", None),
        ("https://notyoutube.com/@mkbhd", None),
        ("https://youtube.com.evil.com/@mkbhd", None),
        ("javascript://www.youtube.com/@mkbhd", None),
        ("https://instagram.com/mkbhd", None),
    ],
)
def test_parse_channel_input(raw, expected):
    result = parse_channel_input(raw)
    assert (tuple(result) if result else None) == expected


# ----- reading the feed ------------------------------------------------------

def test_parse_feed_reads_title_link_thumbnail_views_and_likes():
    title, entries = parse_feed(FEED)
    assert title == "Marques Brownlee"
    first, short = entries
    assert first.video_id == "AAAAAAAAAA1"
    assert first.title == "The Best Phone of 2026 & Why"
    assert first.link == "https://www.youtube.com/watch?v=AAAAAAAAAA1"
    assert first.thumbnail_url == "https://i1.ytimg.com/vi/AAAAAAAAAA1/hqdefault.jpg"
    assert first.views == 1834567
    assert first.likes == 61234
    assert first.published == "2026-10-30T18:04:11.000Z"
    assert short.link == "https://www.youtube.com/shorts/BBBBBBBBBB2"


def test_a_broken_feed_is_a_readable_error():
    with pytest.raises(YouTubeError):
        parse_feed("<html>not a feed")


# ----- looking a channel up --------------------------------------------------

@pytest.mark.parametrize(
    "ref",
    [ChannelRef("handle", "mkbhd"), ChannelRef("id", CHANNEL_ID), ChannelRef("video", "AAAAAAAAAA1")],
)
def test_resolve_channel_from_a_handle_an_id_or_a_video(ref):
    info = YouTubeSource(site()).resolve_channel(ref)
    assert info.channel_id == CHANNEL_ID
    assert info.handle == "mkbhd"
    assert info.title == "Marques Brownlee"
    assert info.avatar_url == "https://yt3.googleusercontent.com/avatar=s900"


def test_resolve_by_id_falls_back_to_the_feed_when_the_page_is_unavailable():
    fake = site(**{f"https://www.youtube.com/channel/{CHANNEL_ID}": YouTubeError("blocked")})
    info = YouTubeSource(fake).resolve_channel(ChannelRef("id", CHANNEL_ID))
    assert info.title == "Marques Brownlee"
    assert info.avatar_url is None


def test_a_page_without_a_channel_id_asks_for_the_channel_link():
    fake = site(**{"https://www.youtube.com/@mkbhd": "<html>consent page</html>"})
    with pytest.raises(YouTubeError) as err:
        YouTubeSource(fake).resolve_channel(ChannelRef("handle", "mkbhd"))
    assert "/channel/UC" in str(err.value)


# ----- through the API -------------------------------------------------------

@pytest.fixture
def live(tmp_path):
    fake = site()
    with TestClient(create_app(f"sqlite:///{tmp_path / 'yt.db'}", video_source=YouTubeSource(fake))) as client:
        yield client, fake


def add(client, link):
    return client.post("/api/competitors", json={"channelUrl": link})


def test_adding_a_channel_stores_its_real_id_name_and_avatar(live):
    client, _ = live
    res = add(client, "https://www.youtube.com/@MKBHD")
    assert res.status_code == 201
    body = res.json()
    assert body["channelId"] == CHANNEL_ID
    assert body["username"] == "mkbhd"
    assert body["channelUrl"] == "https://www.youtube.com/@mkbhd"
    assert body["displayName"] == "Marques Brownlee"
    assert body["avatarUrl"] == "https://yt3.googleusercontent.com/avatar=s900"


def test_the_same_channel_through_another_link_is_not_duplicated(live):
    client, _ = live
    first = add(client, "@mkbhd").json()
    for link in (CHANNEL_ID, "https://youtu.be/AAAAAAAAAA1", "youtube.com/@MKBHD/videos"):
        again = add(client, link)
        assert again.status_code == 200
        assert again.json()["id"] == first["id"]
    assert len(client.get("/api/competitors").json()) == 1


def test_an_already_tracked_handle_needs_no_network(live):
    client, fake = live
    add(client, "@mkbhd")
    calls = len(fake.urls)
    assert add(client, "https://www.youtube.com/@mkbhd").status_code == 200
    assert len(fake.urls) == calls


def test_an_unknown_handle_is_404(live):
    client, _ = live
    res = add(client, "@nobody_here")
    assert res.status_code == 404
    assert client.get("/api/competitors").json() == []


def test_fetch_stores_real_videos_with_links_to_each_video(live):
    client, _ = live
    comp = add(client, "@mkbhd").json()
    res = client.post(f"/api/competitors/{comp['id']}/videos/fetch")
    assert res.status_code == 200
    videos = res.json()
    assert [v["permalink"] for v in videos] == [
        "https://www.youtube.com/watch?v=AAAAAAAAAA1",
        "https://www.youtube.com/shorts/BBBBBBBBBB2",
    ]
    assert videos[0]["youtubeId"] == "AAAAAAAAAA1"
    assert videos[0]["caption"] == "The Best Phone of 2026 & Why"
    assert videos[0]["viewCount"] == 1834567
    assert videos[0]["likeCount"] == 61234
    assert videos[0]["commentCount"] == 0
    assert videos[0]["competitorUsername"] == "mkbhd"


def test_a_failed_fetch_keeps_the_stored_videos(live):
    client, fake = live
    comp = add(client, "@mkbhd").json()
    client.post(f"/api/competitors/{comp['id']}/videos/fetch")

    fake.pages[feed_url(CHANNEL_ID)] = YouTubeError("Could not reach YouTube.")
    res = client.post(f"/api/competitors/{comp['id']}/videos/fetch")
    assert res.status_code == 502
    assert res.json()["detail"] == "Could not reach YouTube."
    assert len(client.get("/api/videos").json()) == 2


def test_a_channel_with_no_videos_is_an_error(live):
    client, fake = live
    comp = add(client, "@mkbhd").json()
    fake.pages[feed_url(CHANNEL_ID)] = FEED.split("<entry>")[0] + "</feed>"
    res = client.post(f"/api/competitors/{comp['id']}/videos/fetch")
    assert res.status_code == 502
    assert "no public videos" in res.json()["detail"]


def test_video_source_comes_from_the_environment(monkeypatch, tmp_path):
    from app.generator import SampleSource

    monkeypatch.setenv("VIDEO_SOURCE", "sample")
    assert isinstance(create_app(f"sqlite:///{tmp_path / 'a.db'}").state.video_source, SampleSource)
    monkeypatch.delenv("VIDEO_SOURCE")
    assert isinstance(create_app(f"sqlite:///{tmp_path / 'b.db'}").state.video_source, YouTubeSource)
