"""Real Videos from Instagram, through the official Instagram Graph API.

Uses Business Discovery, which reads another account's public media:
https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery

It needs two settings, both from a Meta developer app connected to your own
Instagram Business or Creator account:

- INSTAGRAM_ACCESS_TOKEN: a long-lived access token with instagram_basic.
- INSTAGRAM_USER_ID: the Instagram user ID of *your* Business or Creator account.

Only public Business and Creator accounts can be read this way. Without the
two settings the app falls back to the sample data in generator.py.
"""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from datetime import datetime

from app.generator import VIDEOS_PER_FETCH, new_id, now_iso
from app.models import CompetitorRow, VideoRow

DEFAULT_GRAPH_VERSION = "v21.0"
# Business Discovery returns posts newest first; fetch enough to find 20 Videos among them.
MEDIA_PAGE_SIZE = 50
MEDIA_FIELDS = (
    "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,"
    "like_count,comments_count,timestamp"
)
SHORTCODE_RE = re.compile(r"instagram\.com/(?:[^/]+/)?(?:video|videos|p|tv)/([A-Za-z0-9_-]+)")

FetchJson = Callable[[str], dict]


class InstagramError(Exception):
    """A message that can be shown to the user as is."""


def _http_get_json(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=20) as res:
            return json.load(res)
    except urllib.error.HTTPError as err:
        try:
            return json.load(err)
        except ValueError:
            raise InstagramError(f"Instagram API returned HTTP {err.code}.") from err
    except (urllib.error.URLError, TimeoutError) as err:
        raise InstagramError("Could not reach the Instagram API. Try again in a minute.") from err


class GraphApiVideoSource:
    def __init__(
        self,
        access_token: str,
        ig_user_id: str,
        graph_version: str = DEFAULT_GRAPH_VERSION,
        fetch_json: FetchJson = _http_get_json,
    ):
        self.access_token = access_token
        self.ig_user_id = ig_user_id
        self.graph_version = graph_version
        self.fetch_json = fetch_json

    def build_url(self, username: str) -> str:
        fields = (
            f"business_discovery.username({username})"
            f"{{username,name,profile_picture_url,media.limit({MEDIA_PAGE_SIZE}){{{MEDIA_FIELDS}}}}}"
        )
        query = urllib.parse.urlencode({"fields": fields, "access_token": self.access_token})
        return f"https://graph.facebook.com/{self.graph_version}/{self.ig_user_id}?{query}"

    def fetch_videos(self, competitor: CompetitorRow) -> list[VideoRow]:
        body = self.fetch_json(self.build_url(competitor.username))
        if "error" in body:
            raise InstagramError(_explain_error(competitor.username, body["error"]))
        profile = body.get("business_discovery") or {}
        if profile.get("name"):
            competitor.display_name = profile["name"][:120]
        if profile.get("profile_picture_url"):
            competitor.avatar_url = profile["profile_picture_url"]

        fetched_at = now_iso()
        videos = []
        for media in (profile.get("media") or {}).get("data", []):
            if not _is_video(media) or not media.get("permalink"):
                continue
            videos.append(_to_row(competitor, media, fetched_at))
            if len(videos) == VIDEOS_PER_FETCH:
                break
        return videos


def _is_video(media: dict) -> bool:
    if "media_product_type" in media:
        return media["media_product_type"] == "VIDEOS"
    return media.get("media_type") == "VIDEO"


def _to_row(competitor: CompetitorRow, media: dict, fetched_at: str) -> VideoRow:
    permalink = media["permalink"]
    match = SHORTCODE_RE.search(permalink)
    return VideoRow(
        id=new_id("video"),
        competitor_id=competitor.id,
        competitor_username=competitor.username,
        shortcode=match.group(1) if match else str(media.get("id", ""))[:32],
        permalink=permalink[:255],
        caption=(media.get("caption") or "").strip()[:500],
        thumbnail_url=(media.get("thumbnail_url") or media.get("media_url") or "")[:512],
        # The Graph API does not report views for other accounts' Videos.
        view_count=0,
        like_count=int(media.get("like_count") or 0),
        comment_count=int(media.get("comments_count") or 0),
        posted_at=_iso(media.get("timestamp")) or fetched_at,
        fetched_at=fetched_at,
    )


def _iso(timestamp: str | None) -> str | None:
    """Graph API timestamps look like 2026-10-30T18:04:11+0000."""
    if not timestamp:
        return None
    try:
        parsed = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        return None
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _explain_error(username: str, error: dict) -> str:
    code = error.get("code")
    if code == 190:
        return "The Instagram access token is invalid or expired. Update INSTAGRAM_ACCESS_TOKEN."
    if code in (4, 17, 32, 613):
        return "Instagram's rate limit was reached. Try again later."
    if code == 110 or "business" in str(error.get("message", "")).lower():
        return (
            f"Instagram did not return Videos for @{username}. The account must exist, be public, "
            "and be a Business or Creator account."
        )
    return f"Instagram API error: {error.get('message', 'unknown error')}"


def source_from_env() -> GraphApiVideoSource | None:
    token = os.getenv("INSTAGRAM_ACCESS_TOKEN", "").strip()
    user_id = os.getenv("INSTAGRAM_USER_ID", "").strip()
    if not token or not user_id:
        return None
    return GraphApiVideoSource(token, user_id, os.getenv("INSTAGRAM_GRAPH_VERSION", DEFAULT_GRAPH_VERSION))
