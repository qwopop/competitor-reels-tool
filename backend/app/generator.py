"""Sample channels and videos (for tests and offline use), and building rows.

Real videos come from app/youtube.py. Remix text is written by app/remix.py
from each video's own title, description and numbers.
"""

import random
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.models import ContentPlanRow, CompetitorRow, VideoRow, RemixRow
from app.remix import VideoFacts, write_remix
from app.youtube import VIDEOS_PER_FETCH, ChannelInfo, ChannelRef, YouTubeError, channel_url

VIBECODING_TOPICS = [
    "I let AI build my entire SaaS in 48 hours",
    "Why your prompts are costing you money",
    "The stack I use to ship full-stack apps in an afternoon",
    "Stop hand-coding CRUD — this prompt does it for you",
    "Cursor + Bolt = the fastest way to prototype",
    "I cloned a $50/mo app in one weekend with AI",
    "My prompt library for full-stack vibe coding",
    "How I prototype auth + payments without writing boilerplate",
    "The 3 system prompts every vibe coder needs",
    "From idea to deployed in 4 hours (full breakdown)",
    "AI wrote my database schema in 90 seconds",
    "The workflow: LLM-as-frontend-engineer",
    "I stopped writing CSS. Here is what replaced it",
    "Vibe coding a realtime chat in 20 minutes",
    "My terminal-first AI dev setup",
    "Designing prompts that produce production-ready code",
    "I built a startup landing page with one prompt",
    "RAG, vector stores, and the vibe coder starter kit",
    "Pair programming with an LLM that actually ships",
    "The lazy engineer guide to AI feature flags",
]

# Sample descriptions, so the remix writer has something real-looking to read.
SAMPLE_DESCRIPTIONS = [
    "In this video I show you how to go from an idea to a deployed app using only AI tools. "
    "You don't need years of experience to follow along.\n\n"
    "0:00 Intro\n1:10 Picking the stack\n4:30 Writing the first prompt\n9:05 Fixing bugs with AI\n"
    "14:20 Deploying\n\nGet my free prompt template: https://example.com/template\n#vibecoding #ai",
    "Most people waste hours on boilerplate they could have generated in a minute. "
    "Here is the exact workflow I use every day, with the prompts.\n\nJoin my free community: https://example.com",
    "I tested this for a full week before recording. The results surprised me, especially on the second day.\n\n"
    "Sponsored by Example. Use code SAVE20 for 20% off.",
]


def now_iso() -> str:
    """UTC timestamp in the same format JavaScript's toISOString() produces."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def build_competitor(info: ChannelInfo) -> CompetitorRow:
    return CompetitorRow(
        id=new_id("comp"),
        channel_id=info.channel_id,
        username=(info.handle or info.channel_id).lower(),
        channel_url=channel_url(info.channel_id, info.handle),
        display_name=info.title[:128],
        avatar_url=info.avatar_url or f"https://picsum.photos/seed/{info.channel_id}-avatar/96/96",
        added_at=now_iso(),
    )


class SampleSource:
    """Offline stand-in for YouTubeSource: no network, generated videos.

    Used by the tests, and when VIDEO_SOURCE=sample.
    """

    def resolve_channel(self, ref: ChannelRef) -> ChannelInfo:
        if ref.kind == "video":
            raise YouTubeError(
                "Sample mode cannot look up a channel from a video link. Paste the channel link instead.",
                status=400,
            )
        if ref.kind == "id":
            return ChannelInfo(ref.value, None, f"Channel {ref.value[-6:]}", None)
        name = ref.value.lower()
        return ChannelInfo(f"sample-{name}", name if ref.kind == "handle" else None, name[:1].upper() + name[1:], None)

    def fetch_videos(self, competitor: CompetitorRow) -> list[VideoRow]:
        return build_videos(competitor)


def build_videos(competitor: CompetitorRow) -> list[VideoRow]:
    """Sample the latest videos for a competitor, newest first, two days apart.

    Sample videos have no real page, so their permalink is the channel link.
    """
    now = datetime.now(UTC)
    fetched_at = now_iso()
    videos: list[VideoRow] = []
    for i in range(VIDEOS_PER_FETCH):
        youtube_id = "".join(random.choices("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-", k=11))
        posted = now - timedelta(days=2 * i)
        videos.append(
            VideoRow(
                id=new_id("video"),
                competitor_id=competitor.id,
                competitor_username=competitor.username,
                youtube_id=youtube_id,
                permalink=competitor.channel_url,
                caption=VIBECODING_TOPICS[i % len(VIBECODING_TOPICS)],
                description=SAMPLE_DESCRIPTIONS[i % len(SAMPLE_DESCRIPTIONS)],
                thumbnail_url=f"https://picsum.photos/seed/{youtube_id}/640/360",
                view_count=random.randint(50_000, 950_000),
                like_count=random.randint(3_000, 63_000),
                comment_count=random.randint(40, 1_540),
                posted_at=posted.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                fetched_at=fetched_at,
            )
        )
    return videos


def template_fields(video: VideoRow, template: str, channel: str | None = None) -> dict[str, str]:
    """Title, hook, script and CTA written from this video's title, description and numbers."""
    facts = VideoFacts(
        title=video.caption,
        description=video.description or "",
        channel=channel or f"@{video.competitor_username}",
        views=video.view_count,
        likes=video.like_count,
        is_short="/shorts/" in video.permalink,
        seed=sum(ord(ch) for ch in video.youtube_id),
    )
    return write_remix(facts, template)


def build_remix(video: VideoRow, template: str = "default", channel: str | None = None) -> RemixRow:
    stamp = now_iso()
    return RemixRow(
        id=new_id("remix"),
        video_id=video.id,
        created_at=stamp,
        updated_at=stamp,
        **template_fields(video, template, channel),
    )


def build_plan_item(video: VideoRow) -> ContentPlanRow:
    stamp = now_iso()
    return ContentPlanRow(
        id=new_id("plan"),
        video_id=video.id,
        status="not_started",
        competitor_username=video.competitor_username,
        caption=video.caption,
        thumbnail_url=video.thumbnail_url,
        permalink=video.permalink,
        posted_at=video.posted_at,
        added_at=stamp,
        updated_at=stamp,
    )
