"""Turns one competitor video into a remix draft: title, hook, script and CTA.

No AI model is involved. The text is built from what the video itself says:

- its title, read for the kind of video (how-to, tutorial, list, comparison,
  personal story, question) and its topic;
- its description: the first useful sentences, the chapter list (0:00 Intro…),
  and what the creator offers (a newsletter, a free template…), with links,
  hashtags and sponsor lines left out;
- the channel name, the view and like counts, and whether it is a Short.

Each template (default, educational, storytelling, promotional) has a few
phrasings; the video's ID picks one, so a video always gets the same draft.
"""

import re
from dataclasses import dataclass, field

# ----- Reading the title -----------------------------------------------------

_EMOJI = re.compile("[\U0001f000-\U0001faff☀-➿️‍]")
_HASHTAG = re.compile(r"(?<!\w)#\w+")
_BRACKETS = re.compile(r"\s*[\(\[][^\)\]]*[\)\]]")
_YEAR = re.compile(r"\b(?:in\s+)?20\d\d\b", re.IGNORECASE)
_LEADING_HYPE = re.compile(
    r"^(?:the\s+)?(?:only|ultimate|complete|full|best|easiest|fastest|simple|simplest|perfect|new|real)\s+",
    re.IGNORECASE,
)
_TUTORIAL_WORDS = (
    r"(?:full\s+|complete\s+|crash\s+|beginner'?s?\s+)?"
    r"(?:tutorial|guide|course|explained|for\s+beginners|basics|masterclass|walkthrough|breakdown|101)"
)
_SMALL_WORDS = {"a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "vs", "at", "by"}


def clean_title(title: str) -> str:
    text = _EMOJI.sub("", title)
    text = _HASHTAG.sub("", text)
    text = re.split(r"\s+[|•]\s+", text)[0]  # "Title | Channel" → "Title"
    text = _BRACKETS.sub("", text)
    text = re.sub(r"\s+", " ", text).strip(" -–—:")
    return text or title.strip()


def _natural_case(phrase: str) -> str:
    """Lower-case a title-cased phrase so it reads inside a sentence, keeping
    acronyms and brand spellings (AI, SaaS, iPhone, ChatGPT)."""
    words = []
    for word in phrase.split():
        core = re.sub(r"[^A-Za-z]", "", word)
        keep = (
            (core.isupper() and 1 < len(core) <= 4)
            or any(ch.isupper() for ch in core[1:])
            or (core[:1].islower() and core != core.lower())
        )
        words.append(word if keep else word.lower())
    return " ".join(words)


def _second_person(phrase: str) -> str:
    """'I built my app' → 'you built your app', for reusing a creator's story as a prompt."""
    swaps = [
        (r"\bI'm\b", "you're"), (r"\bI've\b", "you've"), (r"\bI'll\b", "you'll"),
        (r"\bI\b", "you"), (r"\bmy\b", "your"), (r"\bMy\b", "Your"), (r"\bme\b", "you"),
        (r"\bmyself\b", "yourself"), (r"\bmine\b", "yours"),
    ]
    for pattern, repl in swaps:
        phrase = re.sub(pattern, repl, phrase)
    return phrase


@dataclass
class TitleRead:
    clean: str
    kind: str = "general"  # how_to, tutorial, list, versus, story, question, general
    topic: str | None = None  # a noun phrase: "vibe coding", "Cursor vs Claude Code"
    action: str | None = None  # addressed to the viewer: "let AI build your entire SaaS"
    action_mine: str | None = None  # in the creator's own words: "let AI build my entire SaaS"
    count: int | None = None
    head: str | None = None  # for lists, the thing being listed: "prompts"


def _cut_tail(text: str) -> str:
    """'Cursor vs Claude Code: which one should you use?' → 'Cursor vs Claude Code'."""
    return re.split(r"\s*[:?!]\s+|\s+[-–—]\s+|\?$", text)[0].strip()


def read_title(title: str) -> TitleRead:
    clean = clean_title(title)
    plain = _YEAR.sub("", clean).strip(" ?!.:")
    plain = re.sub(r"\s+", " ", plain)
    read = TitleRead(clean=clean)

    if m := re.match(r"^(.+?)\s+vs\.?\s+(.+)$", plain, re.IGNORECASE):
        read.kind, read.topic = "versus", f"{_cut_tail(m.group(1))} vs {_cut_tail(m.group(2))}"
    elif m := re.match(r"^how\s+(?:to|i|we|you)\s+(.+)$", plain, re.IGNORECASE):
        read.kind = "how_to"
        read.action_mine = _natural_case(_cut_tail(m.group(1)))
        read.action = _second_person(read.action_mine)
    elif m := re.match(rf"^(.+?)\s+{_TUTORIAL_WORDS}\b", plain, re.IGNORECASE):
        read.kind, read.topic = "tutorial", _natural_case(_LEADING_HYPE.sub("", m.group(1)).strip())
    elif m := re.match(r"^(\d{1,2})\s+(.+)$", plain):
        read.kind, read.count = "list", int(m.group(1))
        read.topic = _second_person(_natural_case(_cut_tail(m.group(2))))
        read.head = re.split(r"\s+(?:that|which|who|to|for|you|i|we|every|in)\b", read.topic, maxsplit=1)[0]
    elif m := re.match(r"^I\s+(.+)$", plain):
        read.kind = "story"
        read.action_mine = _natural_case(_cut_tail(m.group(1)))
        read.action = _second_person(read.action_mine)
    elif clean.rstrip().endswith("?") or re.match(r"^(why|what|is|are|can|should|does|do)\b", plain, re.IGNORECASE):
        read.kind = "question"

    if read.topic and (len(read.topic) < 3 or read.topic.lower() in _SMALL_WORDS):
        read.topic = None
    return read


# ----- Reading the description -----------------------------------------------

_CHAPTER = re.compile(r"^\s*[\(\[]?(\d{1,2}:\d{2}(?::\d{2})?)[\)\]]?\s*[-–—:|·]?\s*(.+?)\s*$")
_SKIP_CHAPTER = re.compile(r"^(intro(duction)?|outro|end|ending|subscribe|sponsor|ad|thanks|credits)\b", re.IGNORECASE)
_NOISE = re.compile(
    r"https?://|www\.|@\w|#\w|%\s*off|\buse code\b|\bsponsor|\baffiliate|\bpatreon\b|\bmerch\b"
    r"|\binstagram\b|\btwitter\b|\btiktok\b|\bfacebook\b|\bbusiness inquiries\b|\bcopyright\b|\bdisclaimer\b"
    r"|\blinks?\b.*\bbelow\b|\bfollow me\b|\bsubscribe\b|\bmy gear\b|\bsocials?\b",
    re.IGNORECASE,
)
_OFFERS = [
    ("newsletter", "newsletter"), ("checklist", "checklist"), ("template", "template"),
    ("cheat sheet", "cheat sheet"), ("prompt", "prompt list"), ("guide", "guide"),
    ("ebook", "ebook"), ("course", "mini course"), ("community", "community"),
    ("discord", "community"), ("skool", "community"), ("workshop", "workshop"),
]


@dataclass
class DescriptionRead:
    sentences: list[str] = field(default_factory=list)
    chapters: list[str] = field(default_factory=list)
    offer: str | None = None


_IN_THIS_VIDEO = re.compile(
    r"^in (?:this|today's) (?:video|episode)[,]?\s+(?:i|we)(?:'ll| will| am going to|'m going to)?\s+"
    r"(?:show you|teach you|walk you through|explain|break down|cover)\s+(.+)$",
    re.IGNORECASE,
)


def _promise(sentence: str) -> str:
    """'In this video I show you how to X.' → 'how to X.' (what the viewer gets)."""
    m = _IN_THIS_VIDEO.match(sentence)
    return m.group(1) if m else sentence


def read_description(description: str) -> DescriptionRead:
    read = DescriptionRead()
    prose: list[str] = []
    for raw in (description or "").splitlines():
        line = _EMOJI.sub("", raw).strip(" •*-–—>")
        if not line:
            continue
        if m := _CHAPTER.match(line):
            name = m.group(2).strip(" -–—:")
            if name and not _SKIP_CHAPTER.match(name) and len(read.chapters) < 8:
                read.chapters.append(name[:90])
            continue
        lowered = line.lower()
        if read.offer is None and ("free" in lowered or "join" in lowered or "get my" in lowered or "download" in lowered):
            read.offer = next((noun for word, noun in _OFFERS if word in lowered), None)
        if _NOISE.search(line):
            continue
        prose.append(line)

    for sentence in re.split(r"(?<=[.!?])\s+", " ".join(prose)):
        sentence = _promise(sentence.strip())
        if 30 <= len(sentence) <= 220 and len(sentence.split()) >= 6 and sentence not in read.sentences:
            read.sentences.append(sentence)
        if len(read.sentences) == 4:
            break
    return read


# ----- Writing the draft -----------------------------------------------------


def compact(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}".rstrip("0").rstrip(".") + "M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}".rstrip("0").rstrip(".") + "K"
    return str(n)


def _pick(options: list[str], seed: int) -> str:
    return options[seed % len(options)]


def _cap(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def _quote(text: str) -> str:
    return f"“{text}”"


@dataclass
class VideoFacts:
    title: str
    description: str
    channel: str
    views: int
    likes: int
    is_short: bool
    seed: int


def _about(t: TitleRead) -> str:
    """What the video is about, ready to drop into a sentence."""
    if t.topic:
        return t.topic
    if t.action:
        return f"how to {t.action}"
    return _quote(t.clean)


def _beats(facts: VideoFacts, middle: list[str]) -> str:
    """Numbered beats. Shorts get second marks; long videos get numbered sections."""
    if facts.is_short:
        steps = ["Hook: say it straight to camera", *middle[:3]]
        marks = ["0–3s", "3–15s", "15–30s", "30–45s"]
        lines = [f"{mark} · {step}" for mark, step in zip(marks, steps)]
        return "\n".join([*lines, "Last 5s · CTA"])
    steps = ["Hook (first 15 seconds)", *middle[:7], "Wrap up and CTA"]
    return "\n".join(f"{i}. {step}" for i, step in enumerate(steps, 1))


_PROBLEM = re.compile(
    r"\b(most people|struggl|waste|wasting|stuck|mistake|problem|hard|rely on|without|can't|cannot|never|"
    r"tired of|frustrat|fail|expensive|slow)\w*", re.IGNORECASE)
_METHOD = re.compile(
    r"\b(here is|here's|i use|we use|the system|the workflow|the method|the process|step|framework|"
    r"how to|set up|using|with)\b", re.IGNORECASE)
_NUMBER = re.compile(
    r"(?:\$\d[\d,.]*[kKmM]?|\b\d[\d,.]*\s*(?:%|x\b|k\b|(?:minutes?|hours?|days?|weeks?|months?|"
    r"clients?|calls?|customers?|users?|dollars?|views?|subscribers?|lines?)\b))", re.IGNORECASE)


def _find(sentences: list[str], pattern: re.Pattern, skip: set[str]) -> str | None:
    return next((x for x in sentences if x not in skip and pattern.search(x)), None)


def _proof(t: TitleRead, d: DescriptionRead) -> str | None:
    """A concrete number the video itself claims: '48 hours', '30 minutes', '$10k'."""
    for text in (t.clean, *d.sentences):
        if m := _NUMBER.search(_YEAR.sub("", text)):
            return m.group(0).strip()
    return None


def _why_it_worked(facts: VideoFacts, t: TitleRead) -> str:
    reason = {
        "how_to": "it promises one clear outcome",
        "tutorial": "it promises a complete answer for beginners",
        "list": "a numbered list is easy to follow and easy to save",
        "versus": "an either/or makes viewers pick a side",
        "story": "it's a personal experiment with a clear stake",
        "question": "it asks the question the audience already has",
    }.get(t.kind, "the title makes one clear promise")
    if facts.views:
        return f"Why it worked: {reason}, and {compact(facts.views)} views say it landed"
    return f"Why it worked: {reason}"


def _middle(facts: VideoFacts, t: TitleRead, d: DescriptionRead, template: str) -> list[str]:
    """The body of the script. Each template has its own structure, filled from the
    video's chapters, description sentences, numbers and channel. The most important
    beats come first, because Shorts only keep three."""
    about = _about(t)
    used: set[str] = set()
    problem = _find(d.sentences, _PROBLEM, used)
    if problem:
        used.add(problem)
    method = _find(d.sentences, _METHOD, used)
    if method:
        used.add(method)
    promise = next((x for x in d.sentences if x not in used), None)
    proof = _proof(t, d)
    chapters = d.chapters
    # A noun for "who needs ___" sentences, and a verb phrase for "before you ___".
    noun = t.topic or "this"
    doing = t.action or (f"use {t.topic}" if t.topic else "put it into practice")

    if t.kind == "versus" and t.topic:
        left, right = t.topic.split(" vs ", 1)
        compare = [f"Where {left} wins", f"Where {right} wins"]
    else:
        compare = []

    if template == "educational":
        if problem:
            beats = [f"Why it matters: {_cap(problem)}"]
        elif t.action:
            beats = [f"Why it matters: what changes once you can {t.action}"]
        else:
            beats = [f"Why it matters: who {noun} is for, and what it saves them"]
        if chapters:
            beats += [f"Step {i}: {c} (show it on screen)" for i, c in enumerate(chapters[:5], 1)]
        elif compare:
            beats += [f"Step 1: {compare[0]}", f"Step 2: {compare[1]}", "Step 3: the simple rule for choosing"]
        elif t.kind == "list" and t.count:
            beats += [f"Steps 1–{t.count}: one line each on the {t.head or 'items'}", "Then slow down on the one to learn first"]
        else:
            beats += [
                f"Step 1: {_cap(method)}" if method else f"Step 1: what you need before you {doing}",
                f"Step 2: {doing}, once, live, start to finish",
                "Step 3: the mistake most beginners make here, and the fix",
            ]
        beats.append(f"Recap: {_cap(promise)}" if promise else "Recap the whole thing in one sentence")
        return beats

    if template == "storytelling":
        if problem:
            start = f"Where it starts: {_cap(problem)}"
        elif t.action:
            start = f"Where it starts: why you decided to {t.action}"
        else:
            start = f"Where it starts: the moment {facts.channel}'s video made you want to try this"
        beats = [start]
        if proof:
            beats.append(f"The stakes: you gave yourself {proof}" if re.search(r"(minute|hour|day|week|month)", proof)
                         else f"The stakes: {proof} on the line")
        if chapters:
            beats.append("The journey: " + " → ".join(chapters[:4]))
        elif compare:
            beats.append(f"The test: a week with {compare[0][9:]}, then a week with {compare[1][9:]}")
        else:
            beats.append(f"The attempt: {_cap(method)}" if method else "The attempt: what you did, step by step")
        beats += ["The turning point: what went wrong, or surprisingly right",
                  "The result, and what you'd tell yourself before you started"]
        return beats

    if template == "promotional":
        if problem:
            beats = [f"The pain: {_cap(problem)}"]
        elif t.action:
            beats = [f"The pain: trying to {t.action} the slow way"]
        else:
            beats = [f"The pain: what it costs you to get {noun} wrong"]
        beats.append(f"The fix: {_cap(method)}" if method else f"The fix: your way to {doing}")
        if proof:
            beats.append(f"The proof: {proof}. Show it on screen")
        elif facts.views:
            beats.append(f"The proof: {compact(facts.views)} people watched {facts.channel} cover this. Show your own result")
        else:
            beats.append("The proof: one before/after or screenshot")
        if chapters:
            beats.append("What's inside: " + ", ".join(chapters[:4]))
        if d.offer:
            beats.append(f"The offer: your {d.offer}, and who it's for")
        return beats

    # default: a breakdown of the original, then your own take
    beats = [f"What the video promises: {_cap(promise)}" if promise else f"What the video promises: {about}",
             _why_it_worked(facts, t)]
    if chapters:
        beats.append(f"How it's built: {len(chapters)} parts. " + ", ".join(chapters[:4]))
    elif compare:
        beats += compare
    if problem:
        beats.append(f"The problem it solves: {problem}")
    beats += [f"Your angle: what you'd add or do differently from {facts.channel}",
              f"Show it: your own version of {about}"]
    return beats


def _hook(facts: VideoFacts, t: TitleRead, template: str) -> str:
    s = facts.seed
    views = compact(facts.views) if facts.views else None
    if t.kind == "versus" and t.topic:
        left, right = t.topic.split(" vs ", 1)
        return {
            "educational": f"{left} or {right}? Here's the simple rule I use to choose.",
            "storytelling": f"I used {left} and {right} for a week each. One of them surprised me.",
            "promotional": f"Stop switching between {left} and {right}. Pick this one.",
        }.get(template, f"{left} vs {right}: I picked a side, and here's why.")
    if t.kind == "list" and t.count and t.topic:
        return {
            "educational": f"{t.count} {t.topic}, and the one to learn first.",
            "storytelling": f"I tried all {t.count} {t.head}. Only a few were worth it.",
            "promotional": f"These {t.count} {t.topic} will save you hours. Number {min(3, t.count)} especially.",
        }.get(template, f"{t.count} {t.topic}, and the one I'd start with.")
    if template == "educational":
        if t.action:
            return _pick([f"Here's how to {t.action}, explained like you're starting from zero.",
                          f"You can {t.action} this week. Here's the simplest way."], s)
        if t.topic:
            return _pick([f"If you're new to {t.topic}, start with this.",
                          f"The one thing beginners miss about {t.topic}."], s)
        if t.kind == "question":
            return f"{_quote(t.clean)} Here's the honest answer, in plain words."
        return f"{_quote(t.clean)}, explained in plain words."
    if template == "storytelling":
        if t.action:
            return _pick([f"So I tried to {t.action_mine}. It didn't go the way I expected.",
                          f"What actually happens when you {t.action}?"], s)
        lead = f"{facts.channel}'s video {_quote(t.clean)}"
        return f"{lead} hit {views} views, so I tried it myself." if views else f"I watched {lead} and had to try it."
    if template == "promotional":
        if t.action:
            return f"Want to {t.action} without wasting a week on it? Watch this."
        if t.topic:
            return _pick([f"This is the fastest way I know to get results with {t.topic}.",
                          f"Still stuck on {t.topic}? This fixes it."], s)
        if t.kind == "question":
            return f"Everyone's asking {_quote(t.clean)} Here's what's actually working right now."
        return f"If {_quote(t.clean)} caught your eye, this is the shortcut."
    if t.kind == "question":
        return f"{_quote(t.clean)} Short answer: it depends on one thing."
    if t.topic and views:
        return _pick([f"{facts.channel}'s video on {t.topic} pulled {views} views. Here's what it gets right.",
                      f"Everyone's watching {facts.channel} talk about {t.topic}. Here's my take."], s)
    if views:
        return f"{_quote(t.clean)} pulled {views} views for {facts.channel}. Here's my take."
    return f"Here's my take on {_about(t)}, in under a minute."


def _title(facts: VideoFacts, t: TitleRead, template: str) -> str:
    if template == "educational":
        if t.action:
            return f"How to {t.action}, step by step"
        if t.kind == "list" and t.count and t.topic:
            return f"{t.count} {t.topic}, explained"
        if t.kind == "question":
            return f"{t.clean} The honest answer"
        return f"{_cap(t.topic)} for beginners: the simple version" if t.topic else f"{t.clean}, explained simply"
    if template == "storytelling":
        if t.action_mine:
            return f"I tried to {t.action_mine}"
        if t.kind == "versus" and t.topic:
            return f"I switched from {t.topic.replace(' vs ', ' to ')}. Here's what happened"
        return f"What I learned from {_quote(t.clean)}"
    if template == "promotional":
        if t.action:
            return f"{_cap(t.action)}: the fast way"
        if t.kind == "versus" and t.topic:
            return f"{t.topic}: the one I'd actually pay for"
        if t.kind == "list" and t.count and t.head:
            return f"{t.count} {t.head} that actually save you time"
        if t.kind == "question":
            return f"{t.clean.rstrip('?')}? Here's what still works"
        return f"The {t.topic} shortcut that actually works" if t.topic else f"Get results faster: {t.clean}"
    if t.topic and t.kind in ("tutorial", "general"):
        return _pick([f"My take on {_quote(t.clean)}", f"What {facts.channel} gets right about {t.topic}"], facts.seed)
    return f"My take on {_quote(t.clean)}"


# What the creator gives away in their description, turned into your own CTA.
_OFFER_CTA = {
    "community": ("JOIN", "the link to my community"),
    "newsletter": ("NEWSLETTER", "my newsletter"),
    "mini course": ("COURSE", "my free mini course"),
    "workshop": ("WORKSHOP", "the workshop details"),
}


def _cta(facts: VideoFacts, t: TitleRead, d: DescriptionRead, template: str) -> str:
    s = facts.seed
    if template == "promotional":
        word, what = _OFFER_CTA.get(d.offer or "", (None, None))
        if not word:
            offer = d.offer or "checklist"
            word, what = offer.split()[-1].upper(), f"my {offer}"
        return f"Comment “{word}” and I'll send you {what}."
    if template == "educational":
        if t.action:
            return _pick([f"Save this for the next time you {t.action}.",
                          f"Try it today, then tell me in the comments which step was hardest."], s)
        return _pick([f"Save this for the next time you work on {_about(t)}.",
                      f"Subscribe for a short {t.topic or 'lesson'} lesson every week." if t.topic
                      else "Subscribe for one short lesson like this every week."], s)
    if template == "storytelling":
        if t.action:
            return f"Would you {t.action}? Tell me in the comments."
        if t.kind == "versus" and t.topic:
            return f"Which would you pick, {t.topic.replace(' vs ', ' or ')}? Tell me in the comments."
        return "Would you have done the same? Tell me in the comments."
    if t.kind == "versus":
        return "Which one do you use? Tell me in the comments."
    return _pick(["Which part would you try first? Tell me in the comments.",
                  f"Subscribe for more {t.head} like these." if t.head
                  else f"Subscribe if you want more on {t.topic}." if t.topic
                  else "Subscribe for more breakdowns like this."], s)


def write_remix(facts: VideoFacts, template: str) -> dict[str, str]:
    t = read_title(facts.title)
    d = read_description(facts.description)
    return {
        "title": _title(facts, t, template)[:500],
        "hook": _hook(facts, t, template)[:1000],
        "script": _beats(facts, _middle(facts, t, d, template))[:2000],
        "cta": _cta(facts, t, d, template)[:500],
    }
