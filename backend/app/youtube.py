"""YouTube channels and their latest videos, with no API key and no account.

Two public sources are used:

- The channel's Atom feed, https://www.youtube.com/feeds/videos.xml?channel_id=UC...,
  which YouTube publishes for feed readers. It lists the latest 15 uploads
  with title, link, thumbnail, publish time, views and likes (no comments).
- The channel's public page, read once when a channel is added, like a link
  preview, to turn an @handle or a video link into the channel ID and to get
  the channel's name and avatar.

`parse_channel_input` has no network access, so the routers can reject bad
input before anything is fetched.
"""

import html
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable
from datetime import datetime
from typing import NamedTuple
from urllib.parse import parse_qs, urlparse

from app.models import CompetitorRow, VideoRow

VIDEOS_PER_FETCH = 15  # the most the channel feed returns

CHANNEL_ID_RE = re.compile(r"^UC[A-Za-z0-9_-]{22}$")
# Handles are 3-30 characters: letters, digits, underscores, hyphens and periods.
HANDLE_RE = re.compile(r"^[A-Za-z0-9._-]{3,30}$")
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_HOST_RE = re.compile(r"^(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be)$", re.IGNORECASE)
# Old-style /c/name and /user/name links. Their names allow a few more characters.
LEGACY_NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,100}$")

USER_AGENT = "Mozilla/5.0 (compatible; ClipRemix/1.0; channel link preview)"


class ChannelRef(NamedTuple):
    """What the user pasted. kind is id, handle, c, user or video."""

    kind: str
    value: str


class ChannelInfo(NamedTuple):
    channel_id: str
    handle: str | None  # without @, lowercase
    title: str
    avatar_url: str | None


class YouTubeError(Exception):
    """A message that can be shown to the user as is."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def parse_channel_input(raw: str) -> ChannelRef | None:
    """Recognise a channel link, @handle, channel ID or video link. None if it is none of these."""
    text = raw.strip()
    if not text:
        return None
    if CHANNEL_ID_RE.match(text):
        return ChannelRef("id", text)
    if text.startswith("@"):
        return ChannelRef("handle", text[1:].lower()) if HANDLE_RE.match(text[1:]) else None
    if "/" not in text and "." not in text:
        # A bare name: treat it as a handle.
        return ChannelRef("handle", text.lower()) if HANDLE_RE.match(text) else None

    url = urlparse(text if "://" in text else f"https://{text}")
    if url.scheme not in ("http", "https") or not YOUTUBE_HOST_RE.match(url.hostname or ""):
        return None
    parts = [p for p in url.path.split("/") if p]
    if (url.hostname or "").lower().endswith("youtu.be"):
        return ChannelRef("video", parts[0]) if parts and VIDEO_ID_RE.match(parts[0]) else None
    if not parts:
        return None
    first = parts[0]
    if first.startswith("@"):
        return ChannelRef("handle", first[1:].lower()) if HANDLE_RE.match(first[1:]) else None
    if first == "channel" and len(parts) > 1 and CHANNEL_ID_RE.match(parts[1]):
        return ChannelRef("id", parts[1])
    if first in ("c", "user") and len(parts) > 1 and LEGACY_NAME_RE.match(parts[1]):
        return ChannelRef(first, parts[1])
    if first == "watch":
        video = parse_qs(url.query).get("v", [""])[0]
        return ChannelRef("video", video) if VIDEO_ID_RE.match(video) else None
    if first in ("shorts", "live", "embed") and len(parts) > 1 and VIDEO_ID_RE.match(parts[1]):
        return ChannelRef("video", parts[1])
    return None


def page_url(ref: ChannelRef) -> str:
    return {
        "id": f"https://www.youtube.com/channel/{ref.value}",
        "handle": f"https://www.youtube.com/@{ref.value}",
        "c": f"https://www.youtube.com/c/{ref.value}",
        "user": f"https://www.youtube.com/user/{ref.value}",
        "video": f"https://www.youtube.com/watch?v={ref.value}",
    }[ref.kind]


def channel_url(channel_id: str, handle: str | None) -> str:
    return f"https://www.youtube.com/@{handle}" if handle else f"https://www.youtube.com/channel/{channel_id}"


def feed_url(channel_id: str) -> str:
    return f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"


def _http_get_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en"})
    try:
        with urllib.request.urlopen(request, timeout=20) as res:
            return res.read(3_000_000).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:
        if err.code == 404:
            raise YouTubeError("YouTube could not find that channel.", status=404) from err
        raise YouTubeError(f"YouTube returned HTTP {err.code}. Try again in a minute.") from err
    except (urllib.error.URLError, TimeoutError) as err:
        raise YouTubeError("Could not reach YouTube. Check your internet connection and try again.") from err


# ----- Reading the channel page ----------------------------------------------

_CHANNEL_ID_PATTERNS = [
    re.compile(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[A-Za-z0-9_-]{22})"'),
    re.compile(r'"externalId":"(UC[A-Za-z0-9_-]{22})"'),
    re.compile(r'<meta itemprop="(?:identifier|channelId)" content="(UC[A-Za-z0-9_-]{22})"'),
    re.compile(r'"channelId":"(UC[A-Za-z0-9_-]{22})"'),
]
_HANDLE_PATTERNS = [
    re.compile(r'"vanityChannelUrl":"https?://www\.youtube\.com/@([A-Za-z0-9._-]{3,30})"'),
    re.compile(r'"canonicalBaseUrl":"/@([A-Za-z0-9._-]{3,30})"'),
]
_OG_TITLE = re.compile(r'<meta property="og:title" content="([^"]*)"')
_OG_IMAGE = re.compile(r'<meta property="og:image" content="([^"]*)"')


def _first(patterns: list[re.Pattern], text: str) -> str | None:
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None


def _page_details(page: str) -> tuple[str | None, str | None, str | None]:
    """Handle, title and avatar from a channel page."""
    handle = _first(_HANDLE_PATTERNS, page)
    title = _OG_TITLE.search(page)
    image = _OG_IMAGE.search(page)
    return (
        handle.lower() if handle else None,
        html.unescape(title.group(1)).strip() if title else None,
        small_avatar(html.unescape(image.group(1))) if image else None,
    )


def small_avatar(url: str, px: int = 176) -> str:
    """Channel pages give a 900px avatar (…=s900-c-k-…). The app shows it at 48-64px."""
    return re.sub(r"=s\d+(?=-|$)", f"=s{px}", url)


# ----- Reading the feed ------------------------------------------------------

ATOM = "{http://www.w3.org/2005/Atom}"
YT = "{http://www.youtube.com/xml/schemas/2015}"
MEDIA = "{http://search.yahoo.com/mrss/}"


class FeedEntry(NamedTuple):
    video_id: str
    title: str
    description: str
    link: str
    thumbnail_url: str
    views: int
    likes: int
    published: str | None


def parse_feed(xml_text: str) -> tuple[str | None, list[FeedEntry]]:
    """The channel title and its entries, newest first, as the feed lists them."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as err:
        raise YouTubeError("YouTube sent a feed that could not be read. Try again later.") from err
    title = root.findtext(f"{ATOM}author/{ATOM}name") or root.findtext(f"{ATOM}title")
    entries = []
    for entry in root.findall(f"{ATOM}entry"):
        video_id = entry.findtext(f"{YT}videoId") or ""
        if not VIDEO_ID_RE.match(video_id):
            continue
        link = entry.find(f"{ATOM}link[@rel='alternate']")
        group = entry.find(f"{MEDIA}group")
        thumb = group.find(f"{MEDIA}thumbnail") if group is not None else None
        stars = entry.find(f".//{MEDIA}starRating")
        stats = entry.find(f".//{MEDIA}statistics")
        entries.append(
            FeedEntry(
                video_id=video_id,
                title=(entry.findtext(f"{ATOM}title") or "").strip(),
                description=((group.findtext(f"{MEDIA}description") if group is not None else None) or "").strip(),
                link=link.get("href") if link is not None and link.get("href") else f"https://www.youtube.com/watch?v={video_id}",
                thumbnail_url=(thumb.get("url") if thumb is not None else None) or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                views=_int(stats.get("views") if stats is not None else None),
                likes=_int(stars.get("count") if stars is not None else None),
                published=_iso(entry.findtext(f"{ATOM}published")),
            )
        )
    return (title.strip() if title else None), entries


def _int(value: str | None) -> int:
    try:
        return max(0, int(value or 0))
    except ValueError:
        return 0


def _iso(timestamp: str | None) -> str | None:
    """Feed times look like 2026-10-30T18:04:11+00:00; return the API's ...Z form."""
    if not timestamp:
        return None
    try:
        parsed = datetime.fromisoformat(timestamp)
    except ValueError:
        return None
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


# ----- The live source -------------------------------------------------------

FetchText = Callable[[str], str]


class YouTubeSource:
    """Looks channels up and fetches their latest videos from YouTube."""

    def __init__(self, fetch_text: FetchText = _http_get_text):
        self.fetch_text = fetch_text

    def resolve_channel(self, ref: ChannelRef) -> ChannelInfo:
        page: str | None = None
        if ref.kind == "id":
            channel_id = ref.value
        else:
            page = self.fetch_text(page_url(ref))
            channel_id = _first(_CHANNEL_ID_PATTERNS, page)
            if not channel_id:
                raise YouTubeError(
                    "Could not find the channel on that page. Paste the channel link that "
                    "contains /channel/UC… instead (from the channel's About → Share → Copy channel ID).",
                    status=404,
                )
            if ref.kind == "video":
                page = None  # that was the video page; the channel's details are on its own page

        if page is None:
            try:
                page = self.fetch_text(page_url(ChannelRef("id", channel_id)))
            except YouTubeError:
                page = ""  # name and avatar are nice to have; the feed below still names the channel
        handle, title, avatar = _page_details(page)
        if ref.kind == "handle":
            handle = handle or ref.value
        if not title:
            title, _ = parse_feed(self.fetch_text(feed_url(channel_id)))
        return ChannelInfo(channel_id, handle, title or handle or channel_id, avatar)

    def fetch_videos(self, competitor: CompetitorRow) -> list[VideoRow]:
        from app.generator import new_id, now_iso  # local import: generator imports this module

        _, entries = parse_feed(self.fetch_text(feed_url(competitor.channel_id)))
        fetched_at = now_iso()
        return [
            VideoRow(
                id=new_id("video"),
                competitor_id=competitor.id,
                competitor_username=competitor.username,
                youtube_id=e.video_id,
                permalink=e.link[:255],
                caption=e.title[:500],
                description=e.description[:5000],
                thumbnail_url=e.thumbnail_url[:512],
                view_count=e.views,
                like_count=e.likes,
                comment_count=0,  # the feed has no comment counts
                posted_at=e.published or fetched_at,
                fetched_at=fetched_at,
            )
            for e in entries[:VIDEOS_PER_FETCH]
        ]
