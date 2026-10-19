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

from app.models import ContentPlanRow, CompetitorRow, ReelRow, RemixRow

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

# Instagram usernames are 1-30 characters: letters, digits, periods and underscores.
USERNAME_RE = re.compile(r"^[A-Za-z0-9._]{1,30}$")
INSTAGRAM_LINK_RE = re.compile(r"^(https?://)?([A-Za-z0-9-]+\.)*instagram\.com(/|$|\?)", re.IGNORECASE)
# First path segments that are Instagram pages, not accounts.
RESERVED_SEGMENTS = {
    "p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct",
    "about", "web", "developer", "legal", "privacy", "press", "api", "directory",
}


def now_iso() -> str:
    """UTC timestamp in the same format JavaScript's toISOString() produces."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def parse_username(raw: str) -> str | None:
    """Return the username from a profile link or a bare (optionally @-prefixed) name.

    Accepts links with or without a scheme, a www./m. host, a trailing slash,
    a query string and a profile sub-path such as /name/reels/. Anything that
    is not a profile (a post, Reel, explore page, another site) returns None.
    """
    text = raw.strip()
    if not text:
        return None
    if INSTAGRAM_LINK_RE.match(text):
        parsed = urlparse(text if "://" in text else f"https://{text}")
        parts = [part for part in parsed.path.split("/") if part]
        if not parts or parts[0].lower() in RESERVED_SEGMENTS:
            return None
        name = parts[0]
    else:
        name = text[1:] if text.startswith("@") else text
    return name if USERNAME_RE.match(name) else None


def build_competitor(username: str) -> CompetitorRow:
    username = username.lower()
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
                permalink=competitor.instagram_url,
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


def template_fields(reel: ReelRow, template: str) -> dict[str, str]:
    """Title, hook, script and CTA for a Reel, chosen deterministically from its shortcode."""
    bank = TEMPLATE_BANKS[template]
    seed = sum(ord(ch) for ch in reel.shortcode)
    return {
        "title": f"{bank['title']}: {reel.caption}",
        "hook": bank["hook"][seed % len(bank["hook"])].replace("{topic}", reel.caption),
        "script": bank["script"][seed % len(bank["script"])].replace("{topic}", reel.caption),
        "cta": bank["cta"][seed % len(bank["cta"])].replace("{topic}", reel.caption),
    }


def build_remix(reel: ReelRow, template: str = "default") -> RemixRow:
    stamp = now_iso()
    return RemixRow(
        id=new_id("remix"),
        reel_id=reel.id,
        created_at=stamp,
        updated_at=stamp,
        **template_fields(reel, template),
    )


def build_plan_item(reel: ReelRow) -> ContentPlanRow:
    stamp = now_iso()
    return ContentPlanRow(
        id=new_id("plan"),
        reel_id=reel.id,
        status="not_started",
        competitor_username=reel.competitor_username,
        caption=reel.caption,
        thumbnail_url=reel.thumbnail_url,
        permalink=reel.permalink,
        posted_at=reel.posted_at,
        added_at=stamp,
        updated_at=stamp,
    )
