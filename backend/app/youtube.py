"""YouTube channels and their latest videos.

Without an API key (YouTubeSource) two public sources are used:

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
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable
from datetime import datetime
from typing import NamedTuple
from urllib.parse import parse_qs, urlencode, urlparse

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


# ----- The YouTube Data API source ------------------------------------------
#
# YouTube answers the public Atom feed with 404 for most channels now, so with an
# API key the app uses the Data API v3 instead. Only cheap endpoints are used, 1
# quota unit per call and never search.list (100 units):
#   channels.list       resolve a channel, find its uploads playlist
#   playlistItems.list  the latest uploads
#   videos.list         views, likes, comments and descriptions (up to 50 ids per call)
# The key travels in the x-goog-api-key header, never in a URL, so it cannot show up
# in a log line, a trace span or an error message.

API_BASE = "https://www.googleapis.com/youtube/v3"
API_KEY_HEADER = "x-goog-api-key"
KEY_REJECTED = "The YouTube API key was rejected. Check YOUTUBE_API_KEY and that YouTube Data API v3 is enabled for it."
QUOTA_USED_UP = "The YouTube API daily quota is used up. Try again tomorrow."
_REJECTED_REASONS = {"keyInvalid", "accessNotConfigured", "ipRefererBlocked", "forbidden", "keyExpired", "referrerNotAllowed"}
_QUOTA_REASONS = {"quotaExceeded", "rateLimitExceeded", "dailyLimitExceeded", "userRateLimitExceeded"}

# (url, headers) -> parsed JSON. Raises YouTubeError.
GetJson = Callable[[str, dict[str, str]], dict]


def _error_reasons(body: bytes) -> tuple[set[str], str]:
    try:
        error = json.loads(body.decode("utf-8", errors="replace")).get("error", {})
        reasons = {e.get("reason", "") for e in error.get("errors", []) if isinstance(e, dict)}
        for detail in error.get("details", []):
            if isinstance(detail, dict) and detail.get("reason"):
                reasons.add(detail["reason"])
        return reasons, str(error.get("message", ""))
    except (ValueError, AttributeError, TypeError):
        return set(), ""


def _api_error(code: int, body: bytes) -> YouTubeError:
    """A user-facing error for a failed API call. Never includes the request URL or headers."""
    reasons, message = _error_reasons(body)
    if reasons & _QUOTA_REASONS:
        return YouTubeError(QUOTA_USED_UP)
    if reasons & _REJECTED_REASONS or (code == 400 and "api key" in message.lower()):
        return YouTubeError(KEY_REJECTED)
    if code == 404:
        return YouTubeError("YouTube could not find that channel.", status=404)
    return YouTubeError(f"YouTube returned HTTP {code}. Try again in a minute.")


def _http_get_json(url: str, headers: dict[str, str]) -> dict:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as res:
            return json.loads(res.read(3_000_000).decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as err:
        raise _api_error(err.code, err.read(100_000)) from None
    except (urllib.error.URLError, TimeoutError) as err:
        raise YouTubeError("Could not reach YouTube. Check your internet connection and try again.") from err
    except ValueError as err:
        raise YouTubeError("YouTube sent an answer that could not be read. Try again later.") from err


def _thumb(snippet: dict, video_id: str) -> str:
    thumbs = snippet.get("thumbnails") or {}
    for size in ("high", "medium", "standard", "default"):
        if thumbs.get(size, {}).get("url"):
            return thumbs[size]["url"]
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


class YouTubeApiSource:
    """Same interface as YouTubeSource, backed by the YouTube Data API v3."""

    def __init__(self, api_key: str, get_json: GetJson = _http_get_json, fetch_text: FetchText = _http_get_text):
        api_key = (api_key or "").strip()
        if not api_key:
            raise ValueError("YouTubeApiSource needs an API key")
        self._api_key = api_key
        self._get_json = get_json
        self.fetch_text = fetch_text

    def __repr__(self) -> str:
        return "YouTubeApiSource()"

    def _call(self, endpoint: str, **params: str) -> dict:
        url = f"{API_BASE}/{endpoint}?{urlencode(params)}"
        return self._get_json(url, {API_KEY_HEADER: self._api_key, "Accept": "application/json"})

    def _channels(self, **params: str) -> dict:
        items = self._call("channels", **params).get("items") or []
        if not items:
            raise YouTubeError("YouTube could not find that channel.", status=404)
        return items[0]

    def resolve_channel(self, ref: ChannelRef) -> ChannelInfo:
        part = "snippet"
        if ref.kind == "id":
            item = self._channels(part=part, id=ref.value)
        elif ref.kind == "handle":
            item = self._channels(part=part, forHandle=f"@{ref.value}")
        elif ref.kind == "user":
            item = self._channels(part=part, forUsername=ref.value)
        elif ref.kind == "video":
            videos = self._call("videos", part="snippet", id=ref.value).get("items") or []
            channel_id = videos[0].get("snippet", {}).get("channelId") if videos else None
            if not channel_id:
                raise YouTubeError("YouTube could not find that video.", status=404)
            item = self._channels(part=part, id=channel_id)
        else:  # /c/name links have no API lookup: read the id from the page, then ask the API
            page = self.fetch_text(page_url(ref))
            channel_id = _first(_CHANNEL_ID_PATTERNS, page)
            if not channel_id:
                raise YouTubeError("YouTube could not find that channel.", status=404)
            item = self._channels(part=part, id=channel_id)
        snippet = item.get("snippet") or {}
        custom = (snippet.get("customUrl") or "").lstrip("@").lower()
        handle = custom if HANDLE_RE.match(custom) else (ref.value if ref.kind == "handle" else None)
        avatars = snippet.get("thumbnails") or {}
        avatar = (avatars.get("default") or avatars.get("medium") or {}).get("url")
        return ChannelInfo(item["id"], handle, snippet.get("title") or handle or item["id"], avatar)

    def fetch_videos(self, competitor: CompetitorRow) -> list[VideoRow]:
        from app.generator import new_id, now_iso  # local import: generator imports this module

        channel = self._channels(part="contentDetails", id=competitor.channel_id)
        uploads = (channel.get("contentDetails", {}).get("relatedPlaylists", {}) or {}).get("uploads")
        if not uploads:
            return []
        try:
            playlist = self._call("playlistItems", part="contentDetails", playlistId=uploads, maxResults=str(VIDEOS_PER_FETCH))
        except YouTubeError as err:
            if err.status == 404:
                return []  # a channel that never uploaded has no uploads playlist
            raise
        ids = [
            i.get("contentDetails", {}).get("videoId", "")
            for i in playlist.get("items") or []
        ]
        ids = [v for v in ids if VIDEO_ID_RE.match(v)][:VIDEOS_PER_FETCH]
        details: dict[str, dict] = {}
        for start in range(0, len(ids), 50):
            batch = ids[start : start + 50]
            for item in self._call("videos", part="snippet,statistics", id=",".join(batch)).get("items") or []:
                details[item.get("id", "")] = item
        fetched_at = now_iso()
        rows = []
        for video_id in ids:  # playlist order is newest first; private or deleted videos have no details
            item = details.get(video_id)
            if not item:
                continue
            snippet, stats = item.get("snippet") or {}, item.get("statistics") or {}
            rows.append(
                VideoRow(
                    id=new_id("video"),
                    competitor_id=competitor.id,
                    competitor_username=competitor.username,
                    youtube_id=video_id,
                    permalink=f"https://www.youtube.com/watch?v={video_id}"[:255],
                    caption=(snippet.get("title") or "").strip()[:500],
                    description=(snippet.get("description") or "").strip()[:5000],
                    thumbnail_url=_thumb(snippet, video_id)[:512],
                    view_count=_int(stats.get("viewCount")),
                    like_count=_int(stats.get("likeCount")),  # absent when the channel hides likes
                    comment_count=_int(stats.get("commentCount")),
                    posted_at=_iso(snippet.get("publishedAt")) or fetched_at,
                    fetched_at=fetched_at,
                )
            )
        return rows
