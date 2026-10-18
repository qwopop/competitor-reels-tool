"""Stand-ins for the real Instagram scraper and the AI remix step.

Both produce deterministic-looking sample data, the same way the frontend's
MockReelsApi does. Replace these functions with real integrations later; the
store and routers only call into this module.
"""

import random
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse
from uuid import uuid4

from app.models import CompetitorRow, ReelRow, RemixRow

REELS_PER_FETCH = 20

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

USERNAME_RE = re.compile(r"^@?([A-Za-z0-9._]+)$")


def now_iso() -> str:
    """UTC timestamp in the same format JavaScript's toISOString() produces."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def parse_username(raw: str) -> str | None:
    """Accept an Instagram profile URL or a bare (optionally @-prefixed) username."""
    text = raw.strip()
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme in ("http", "https") and parsed.hostname:
        host = parsed.hostname.lower()
        if host != "instagram.com" and not host.endswith(".instagram.com"):
            return None
        parts = [part for part in parsed.path.split("/") if part]
        return parts[0] if parts else None
    match = USERNAME_RE.match(text)
    return match.group(1) if match else None


def build_competitor(username: str) -> CompetitorRow:
    return CompetitorRow(
        id=new_id("comp"),
        username=username,
        instagram_url=f"https://www.instagram.com/{username}/",
        display_name=username[:1].upper() + username[1:],
        avatar_url=f"https://picsum.photos/seed/{username}-avatar/96/96",
        added_at=now_iso(),
    )


def build_reels(competitor: CompetitorRow) -> list[ReelRow]:
    """Sample the latest Reels for a competitor, newest first, two days apart."""
    now = datetime.now(UTC)
    fetched_at = now_iso()
    reels: list[ReelRow] = []
    for i in range(REELS_PER_FETCH):
        shortcode = competitor.username[:3] + "".join(
            random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=7)
        )
        posted = now - timedelta(days=2 * i)
        reels.append(
            ReelRow(
                id=new_id("reel"),
                competitor_id=competitor.id,
                competitor_username=competitor.username,
                shortcode=shortcode,
                permalink=f"https://www.instagram.com/reel/{shortcode}/",
                caption=VIBECODING_TOPICS[i % len(VIBECODING_TOPICS)],
                thumbnail_url=f"https://picsum.photos/seed/{shortcode}/640/800",
                view_count=random.randint(50_000, 950_000),
                like_count=random.randint(3_000, 63_000),
                comment_count=random.randint(40, 1_540),
                posted_at=posted.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                fetched_at=fetched_at,
            )
        )
    return reels


def build_remix(reel: ReelRow) -> RemixRow:
    seed = sum(ord(ch) for ch in reel.shortcode)
    stamp = now_iso()
    return RemixRow(
        id=new_id("remix"),
        reel_id=reel.id,
        title=f"Remix: {reel.caption}",
        hook=HOOK_BANK[seed % len(HOOK_BANK)],
        script=SCRIPT_BANK[seed % len(SCRIPT_BANK)],
        cta=CTA_BANK[seed % len(CTA_BANK)],
        created_at=stamp,
        updated_at=stamp,
    )
