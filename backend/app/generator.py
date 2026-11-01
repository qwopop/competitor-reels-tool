"""Sample channels and videos (for tests and offline use) and the template remix step.

Real videos come from app/youtube.py. The sample data here mirrors the
frontend's MockVideosApi. Remixes come from fixed templates, not an AI model.
"""

import random
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.models import ContentPlanRow, CompetitorRow, VideoRow, RemixRow
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

HOOK_BANK = [
    "Stop scrolling — I built this in 2 hours using only AI.",
    "This one prompt replaced my entire frontend team.",
    "I was today years old when I learned AI can ship auth for you.",
    "Nobody tells you this about vibe coding. So I will.",
    "If you write CRUD by hand in 2026, you are losing hours every day.",
]

SCRIPT_BANK = [
    "Step 1: open your AI IDE. Step 2: describe the app in plain English. Step 3: review the diff, ship, repeat.",
    "Start with the data model, then ask the AI for the routes, then the UI. Never write boilerplate.",
    "I prompt for the feature, the AI drafts the component, I tweak the copy, and I deploy.",
    "The trick is to give the model the schema first. Everything else falls out of that.",
]

CTA_BANK = [
    'Comment "STACK" and I will DM you my full prompt library.',
    "Follow for daily vibe coding breakdowns.",
    "Save this for your next AI build weekend.",
    "Tag a founder who still hand-codes CRUD.",
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
                thumbnail_url=f"https://picsum.photos/seed/{youtube_id}/640/360",
                view_count=random.randint(50_000, 950_000),
                like_count=random.randint(3_000, 63_000),
                comment_count=random.randint(40, 1_540),
                posted_at=posted.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                fetched_at=fetched_at,
            )
        )
    return videos


TEMPLATE_BANKS: dict[str, dict] = {
    "default": {
        "title": "Remix",
        "hook": HOOK_BANK,
        "script": SCRIPT_BANK,
        "cta": CTA_BANK,
    },
    "educational": {
        "title": "Lesson",
        "hook": [
            "Most people get {topic} wrong. Here is the fix.",
            "Three things you need to know about {topic}.",
        ],
        "script": [
            "Step 1: state the problem. Step 2: show one concrete example. Step 3: give the takeaway.",
            "Explain the core idea in one sentence, then walk through a worked example.",
        ],
        "cta": [
            "Save this so you can practise it later.",
            "Follow for one lesson like this every week.",
        ],
    },
    "storytelling": {
        "title": "Story",
        "hook": [
            "Last year I tried {topic} and it went badly.",
            "Here is what happened when I stopped doing {topic} the old way.",
        ],
        "script": [
            "Setup: where I started. Conflict: what broke. Resolution: what changed.",
            "Open on the moment things went wrong, then rewind to show how I got there.",
        ],
        "cta": [
            "Tell me your version of this story in the comments.",
            "Follow to see how the next chapter ends.",
        ],
    },
    "promotional": {
        "title": "Promo",
        "hook": [
            "Stop struggling with {topic}. There is an easier way.",
            "If you want results from {topic}, watch this first.",
        ],
        "script": [
            "Show the problem, present the product as the fix, then show one result.",
            "Lead with the benefit, show proof in ten seconds, end with the offer.",
        ],
        "cta": [
            "Link in bio to get started today.",
            "Comment READY and I will send you the details.",
        ],
    },
}


def template_fields(video: VideoRow, template: str) -> dict[str, str]:
    """Title, hook, script and CTA for a video, chosen deterministically from its YouTube ID."""
    bank = TEMPLATE_BANKS[template]
    seed = sum(ord(ch) for ch in video.youtube_id)
    return {
        "title": f"{bank['title']}: {video.caption}",
        "hook": bank["hook"][seed % len(bank["hook"])].replace("{topic}", video.caption),
        "script": bank["script"][seed % len(bank["script"])].replace("{topic}", video.caption),
        "cta": bank["cta"][seed % len(bank["cta"])].replace("{topic}", video.caption),
    }


def build_remix(video: VideoRow, template: str = "default") -> RemixRow:
    stamp = now_iso()
    return RemixRow(
        id=new_id("remix"),
        video_id=video.id,
        created_at=stamp,
        updated_at=stamp,
        **template_fields(video, template),
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
