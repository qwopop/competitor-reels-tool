"""The remix writer: reading a video's title and description, and the drafts it writes."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.remix import VideoFacts, clean_title, read_description, read_title, write_remix
from app.youtube import YouTubeSource, feed_url

TEMPLATES = ["default", "educational", "storytelling", "promotional"]

DESCRIPTION = """In this video I show you how to go from zero to a deployed app using only AI tools.
You don't need to know how to code to follow along, and we ship a real project by the end.

🔗 Join my free community: https://skool.com/example
Use code SAVE20 for 20% off my sponsor.

0:00 Intro
1:12 Setting up Cursor
4:30 Your first prompt
9:05 Fixing bugs with AI
18:00 Outro

#vibecoding #ai"""


def facts(title, description="", short=False, views=1_834_567):
    return VideoFacts(title, description, "Nick Saraev", views, 61_234, short, sum(map(ord, title)))


# ----- reading the title -----------------------------------------------------

def test_clean_title_drops_emoji_hashtags_brackets_and_channel_suffix():
    assert clean_title("I built an app 🤯 (FULL COURSE) #ai | Nick Saraev") == "I built an app"


@pytest.mark.parametrize(
    "title, kind, topic, action",
    [
        ("The ONLY Vibe Coding Tutorial Beginners Need in 2026", "tutorial", "vibe coding", None),
        ("How I Find Unlimited Clients With AI", "how_to", None, "find unlimited clients with AI"),
        ("How to Build a SaaS with ChatGPT", "how_to", None, "build a SaaS with ChatGPT"),
        ("I let AI build my entire SaaS in 48 hours", "story", None, "let AI build your entire SaaS in 48 hours"),
        ("Cursor vs Claude Code: which one should you use?", "versus", "Cursor vs Claude Code", None),
        ("5 Prompts That Replaced My Entire Team", "list", "prompts that replaced your entire team", None),
        ("Is vibe coding dead?", "question", None, None),
        ("Building in public, week 12", "general", None, None),
    ],
)
def test_read_title(title, kind, topic, action):
    read = read_title(title)
    assert (read.kind, read.topic, read.action) == (kind, topic, action)


# ----- reading the description -----------------------------------------------

def test_read_description_finds_the_promise_chapters_and_offer_and_skips_noise():
    read = read_description(DESCRIPTION)
    assert read.sentences[0] == "how to go from zero to a deployed app using only AI tools."
    assert read.chapters == ["Setting up Cursor", "Your first prompt", "Fixing bugs with AI"]
    assert read.offer == "community"
    joined = " ".join(read.sentences)
    assert "http" not in joined and "SAVE20" not in joined and "#" not in joined


def test_an_empty_description_is_fine():
    read = read_description("")
    assert (read.sentences, read.chapters, read.offer) == ([], [], None)


# ----- writing ---------------------------------------------------------------

def test_the_draft_follows_the_videos_own_chapters():
    draft = write_remix(facts("The ONLY Vibe Coding Tutorial Beginners Need in 2026", DESCRIPTION), "educational")
    assert draft["title"] == "Vibe coding for beginners: the simple version"
    assert "vibe coding" in draft["hook"]
    assert "Setting up Cursor" in draft["script"]
    assert "Fixing bugs with AI" in draft["script"]
    assert "Outro" not in draft["script"] and "Intro" not in draft["script"]


def test_the_promotional_cta_echoes_what_the_creator_offers():
    draft = write_remix(facts("The ONLY Vibe Coding Tutorial Beginners Need in 2026", DESCRIPTION), "promotional")
    assert draft["cta"] == "Comment “JOIN” and I'll send you the link to my community."


def test_shorts_get_second_by_second_beats():
    draft = write_remix(facts("I let AI build my entire SaaS in 48 hours", short=True), "storytelling")
    assert draft["script"].startswith("0–3s · Hook")
    assert draft["script"].endswith("Last 5s · CTA")
    assert draft["title"] == "I tried to let AI build my entire SaaS in 48 hours"


def test_a_comparison_gets_a_comparison_script():
    draft = write_remix(facts("Cursor vs Claude Code: which one should you use?"), "default")
    assert draft["hook"] == "Cursor vs Claude Code: I picked a side, and here's why."
    assert "Where Cursor wins" in draft["script"] and "Where Claude Code wins" in draft["script"]


def test_the_view_count_and_channel_make_it_personal():
    draft = write_remix(facts("Building in public, week 12"), "storytelling")
    assert draft["hook"] == "Nick Saraev's video “Building in public, week 12” hit 1.8M views, so I tried it myself."


@pytest.mark.parametrize("template", TEMPLATES)
@pytest.mark.parametrize(
    "title",
    ["The ONLY Vibe Coding Tutorial Beginners Need in 2026", "How I Find Unlimited Clients With AI",
     "I let AI build my entire SaaS in 48 hours", "Cursor vs Claude Code: which one should you use?",
     "5 Prompts That Replaced My Entire Team", "Is vibe coding dead?", "🔥🔥🔥", "a"],
)
def test_every_template_writes_all_four_fields_for_any_title(title, template):
    draft = write_remix(facts(title, DESCRIPTION, views=0), template)
    for name, limit in [("title", 500), ("hook", 1000), ("script", 2000), ("cta", 500)]:
        assert draft[name].strip() and len(draft[name]) <= limit
    assert "{" not in "".join(draft.values())


def test_the_same_video_always_gets_the_same_draft():
    one = write_remix(facts("How I Find Unlimited Clients With AI", DESCRIPTION), "default")
    two = write_remix(facts("How I Find Unlimited Clients With AI", DESCRIPTION), "default")
    assert one == two


# ----- end to end: the description travels from the feed to the remix -------

FEED = """<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <author><name>Nick Saraev</name></author>
 <entry>
  <yt:videoId>AAAAAAAAAA1</yt:videoId>
  <title>The ONLY Vibe Coding Tutorial Beginners Need in 2026</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=AAAAAAAAAA1"/>
  <published>2026-10-30T18:04:11+00:00</published>
  <media:group>
   <media:description>0:00 Intro
1:12 Setting up Cursor
4:30 Your first prompt</media:description>
   <media:community><media:starRating count="10"/><media:statistics views="2500000"/></media:community>
  </media:group>
 </entry>
</feed>"""
CHANNEL_ID = "UCBJycsmduvYEL83R_U4JriQ"
PAGE = f'<link rel="canonical" href="https://www.youtube.com/channel/{CHANNEL_ID}"><meta property="og:title" content="Nick Saraev">'


def test_remix_through_the_api_uses_the_fetched_description(database_url):
    pages = {"https://www.youtube.com/@nick_saraev": PAGE,
             f"https://www.youtube.com/channel/{CHANNEL_ID}": PAGE, feed_url(CHANNEL_ID): FEED}
    app = create_app(database_url, video_source=YouTubeSource(pages.__getitem__))
    with TestClient(app) as client:
        comp = client.post("/api/competitors", json={"channelUrl": "@nick_saraev"}).json()
        video = client.post(f"/api/competitors/{comp['id']}/videos/fetch").json()[0]
        assert "Setting up Cursor" in video["description"]

        remix = client.post(f"/api/videos/{video['id']}/remix", json={"template": "storytelling"}).json()
        assert "Nick Saraev's video" in remix["hook"] and "2.5M views" in remix["hook"]
        assert "Setting up Cursor" in remix["script"]


def test_an_older_database_gets_the_description_column(database_url):
    from sqlalchemy import inspect, text

    from app.models import make_engine

    with TestClient(create_app(database_url, video_source=None)):
        pass
    engine = make_engine(database_url)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE videos DROP COLUMN description"))

    with TestClient(create_app(database_url, video_source=None)) as client:
        assert client.get("/api/videos").status_code == 200
    assert "description" in {c["name"] for c in inspect(engine).get_columns("videos")}
    engine.dispose()


# ----- each template has its own structure -----------------------------------

TEXT_DESCRIPTION = (
    "Most freelancers rely on referrals and wait. Here is the outreach system I use every single day "
    "to book calls. It takes about 30 minutes and costs nothing."
)


def test_each_template_has_its_own_script_structure():
    scripts = {
        tpl: write_remix(facts("How I Find Unlimited Clients With AI", TEXT_DESCRIPTION), tpl)["script"]
        for tpl in TEMPLATES
    }
    assert "Why it worked:" in scripts["default"] and "Your angle:" in scripts["default"]
    assert "Why it matters: Most freelancers rely on referrals and wait." in scripts["educational"]
    assert "Step 1: Here is the outreach system" in scripts["educational"]
    assert "Where it starts: Most freelancers rely on referrals" in scripts["storytelling"]
    assert "The stakes: you gave yourself 30 minutes" in scripts["storytelling"]
    assert "The pain: Most freelancers rely on referrals" in scripts["promotional"]
    assert "The fix: Here is the outreach system" in scripts["promotional"]
    assert "The proof: 30 minutes" in scripts["promotional"]
    assert len(set(scripts.values())) == 4


def test_chapters_are_framed_differently_by_each_template():
    title = "The ONLY Vibe Coding Tutorial Beginners Need in 2026"
    scripts = {tpl: write_remix(facts(title, DESCRIPTION), tpl)["script"] for tpl in TEMPLATES}
    assert "How it's built: 3 parts. Setting up Cursor" in scripts["default"]
    assert "Step 1: Setting up Cursor (show it on screen)" in scripts["educational"]
    assert "The journey: Setting up Cursor → Your first prompt" in scripts["storytelling"]
    assert "What's inside: Setting up Cursor" in scripts["promotional"]
    assert "The offer: your community" in scripts["promotional"]


@pytest.mark.parametrize("template", TEMPLATES)
def test_no_template_produces_clumsy_phrases(template):
    for title in ["How I Find Unlimited Clients With AI", "I let AI build my entire SaaS in 48 hours",
                  "Building in public, week 12", "Cursor vs Claude Code", "5 Prompts That Replaced My Entire Team"]:
        text = " ".join(write_remix(facts(title), template).values())
        for clumsy in ["needs how to", "at how to", "of how to build", "you decided to let AI build my", "{", "None"]:
            assert clumsy not in text, (title, clumsy, text)
