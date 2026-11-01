# ClipRemix --- MVP Scope & Product Decisions

**Document purpose:** Capture the agreed MVP scope, record the choices
made during brainstorming, and document additional product decisions
with rationale and alternatives.

## 1. Product summary

ClipRemix helps marketers and creators keep a library of competitor
YouTube videos, turn selected videos into editable content breakdowns,
and organize those ideas into a filming plan with dates and a production
checklist.

The MVP is a single-user web app with no login. It reads **real videos**
from public YouTube channel feeds, which need no API key and no account.
It writes breakdowns from **rules applied to each video's own details**
rather than with an AI model. A sample-data mode (`VIDEO_SOURCE=sample`)
generates videos offline and is used by the tests.

## 2. Agreed MVP decisions

### Navigation and dashboard

-   Use a **top navigation bar** with:
    -   Dashboard
    -   Competitors
    -   Videos
    -   Remixes
    -   Content Plan
    -   Go to videos
-   A single highlight pill **slides** to the current page, and the bar
    wraps onto two rows on phones. An Add competitor action sits at the
    right of the bar.
-   The Dashboard is a **combined overview** of competitors, video
    statistics, recent videos, and content-plan progress. Its hero has a
    one-step **Track & fetch** field, and shows a slowly moving fan of the
    top videos and a strip of the tracked channels.
-   Use a **dark creator-studio visual style**: a near-black ground with
    glowing orange and magenta orbs behind every page, orange-to-pink
    gradient accents (liquid-glass primary buttons), pill-shaped controls,
    and a bold headline with one italic serif phrase.

### Competitors

-   Add a competitor through a **simple modal** (or the Dashboard's
    Track & fetch field).
-   The input accepts a YouTube channel link (`/@handle`,
    `/channel/UC…`, `/c/name`, `/user/name`), a bare `@handle`, a channel
    ID, or a link to any one of the channel's videos (`watch?v=`,
    `youtu.be/`, `/shorts/`).
-   While the user types, a link to that channel (or video) on YouTube
    appears without saving anything.
-   Invalid input displays a clear validation error.
-   Adding the same channel again, in any of these forms, returns the
    existing competitor instead of creating a duplicate.
-   Competitor cards show:
    -   Avatar (the channel's initial if the image cannot load)
    -   @handle
    -   Display name
    -   Number of stored videos
-   Each card has a **Fetch videos** button and a link to the channel on
    YouTube.
-   Fetching replaces that competitor's stored video collection with the
    latest videos from the channel's feed (up to 15); it does not append
    duplicates.

### Videos Library

-   Show all stored videos, newest first by default.
-   Use a **grid by default**, with a **grid/list toggle**.
-   Each video includes a 16:9 thumbnail, title, view count, like count,
    and a **Watch on YouTube** link that opens that exact video. (Counts
    YouTube does not report are left out rather than shown as zero.)
-   Filters and discovery tools:
    -   Filter by competitor
    -   Search captions (a video's caption is its YouTube title)
    -   Sort by newest, most views, or most likes
-   Include a Remix action, a quick Preview of an existing remix, and an
    Add to Plan action.

### Remixes

-   Clicking Remix opens a **dedicated editing page**.
-   The Videos Library also offers a **quick preview panel** for a remix.
-   A remix contains:
    -   Title
    -   Hook
    -   Script
    -   Call to action (CTA)
-   If a remix already exists for a video, opening Remix shows the
    existing remix rather than creating another.
-   Generate a draft immediately, **written from that video's own
    details**: its title (how-to, tutorial, list, comparison, personal
    story, or question), its description (the opening promise, the
    chapter list, and what the creator offers), the channel name, the
    view count, and whether it is a Short.
-   Let users select alternative templates: default, educational,
    storytelling, or promotional. Each has its own script structure
    (default: why it worked and your angle; educational: why it matters,
    steps, recap; storytelling: where it starts, the stakes, the journey,
    the result; promotional: pain, fix, proof, offer).
-   Users can edit all fields manually.
-   Saving is **manual**, using a Save button.
-   Send only changed fields to the server.
-   Show clear save success or error feedback.

### Content Plan

-   Use a **Kanban board by default**, with a **table** view and a
    **calendar** view available from the same toggle.
-   The three statuses are:
    -   ❌ **Not started** --- nothing ready yet; default status
    -   ⏳ **Ready to film** --- the script is done and the video is
        ready to make
    -   ✅ **Filmed** --- filmed and posted
-   Each plan item can have a **film date** and a **publish date**, and
    carries a **production checklist**:
    -   Script completed
    -   Recording completed
    -   Caption prepared
    -   Published
-   Plan cards show:
    -   Thumbnail
    -   Title
    -   Competitor
    -   Status
    -   Hook preview
    -   Date added
    -   Film and publish dates
    -   Checklist with progress
    -   Quick action to edit the remix
    -   Quick action to open the original video
-   The **calendar** is a Monday-first month view that shows what to film
    and what to publish on each day, with each entry's checklist progress.
    Clicking an entry edits its dates and checklist, and videos with no
    dates are listed below the grid.
-   Adding a video to the plan is immediate, starts at ❌ Not started,
    and shows a success message.
-   Prevent duplicate plan entries for the same source video.
-   The Content Plan page shows item counts, including counts by status.
-   A plan item stores its **own copy of the video details**, so it
    remains usable if the competitor's videos are fetched again.

### Dashboard statistics

Show:

-   Total competitors
-   Total videos
-   Total remixes
-   Planned videos
-   Combined views, likes, and comments across stored videos
-   Top-performing video
-   Most-viewed competitor
-   Recent videos and a summary of Content Plan progress

For the MVP, "top-performing video" should be defined simply and
transparently. Default: the video with the highest view count. More
advanced engagement scoring can come later.

## 3. Additional decisions and rationale

These decisions fill in implementation details that were not fully
settled in the brainstorming session.

### 3.1 Removing a competitor

**Recommended decision:** Show a confirmation dialog, then remove the
competitor and delete their stored videos and associated remixes.
Preserve existing Content Plan items as independent copies.

**Why this option:** It follows the core tracking model and prevents a
user from accidentally deleting work. Preserving plan items protects
content that has already been selected for production, including its
dates and checklist progress. It also keeps the Content Plan consistent
with the requirement that plan entries own a copy of the source video
details.

**Alternatives considered:** - Delete everything, including plan items:
simpler data cleanup, but risks losing planned work. - Untrack the
competitor while keeping every video and remix: preserves history, but
makes "remove competitor" ambiguous and leaves orphaned library
content. - Archive the competitor instead of deleting: useful for a
later version, but adds another state and UI concept to the MVP.

**Implementation note:** Keep the source `video_id` on a plan item as
historical provenance, but do not require the original video row to
remain in order for the plan item to render. It is deliberately not a
foreign key.

### 3.2 Duplicate plan items

**Recommended decision:** Allow at most one plan item per source video.
If the user tries to add it again, keep the existing item and show a
friendly message: "Already in your Content Plan."

**Why this option:** It matches the agreed no-duplicates behavior and
avoids confusing counts.

**Alternative considered:** Allow multiple copies of the same video for
different campaigns or versions. This is flexible, but would require a
way to distinguish the copies and is unnecessary for the MVP.

### 3.3 Remix templates

**Recommended decision:** Keep a small set of deterministic templates:
**Default**, **Educational**, **Storytelling**, and **Promotional**.
Write each draft from the video's own title, description, channel name,
view count, and format (Short or long video), so two videos never get the
same text. The same video always gets the same draft. Make it clear in
the interface that these are rule-written drafts rather than AI analysis.

**Why this option:** It delivers a useful, personal-sounding end-to-end
workflow without an AI service, an API key, or video transcription. A
small template set is easy to test and maintain, and every template can
be checked against known inputs.

**Alternatives considered:** - One fixed sentence per template with the
title pasted in: the first version of the app; every video read the same,
so it was replaced. - AI-generated scripts: potentially more varied and
natural, but adds cost, latency, prompt design, safety considerations,
and an API key that are explicitly outside this version. - Let users
build their own templates: powerful, but adds template management and a
more complex editing experience.

**Known limit:** The writer can only use the title and description, not
what is said in the video. A video with an empty description gets a more
general script.

### 3.4 Saving remix edits

**Recommended decision:** Use a manual Save button, disable it when
there are no unsaved changes, and show a clear saved/error state after
the server responds. Send only changed fields. Applying a different
template overwrites the four text fields, so confirm first when there are
unsaved edits.

**Why this option:** It matches the user's preference for manual saving
and keeps the API payload small.

**Alternatives considered:** - Auto-save on every keystroke: convenient,
but can create noisy requests and make saving behavior less
predictable. - Debounced auto-save: a good future enhancement, but adds
complexity and does not match the chosen manual-save workflow.

### 3.5 Fetching videos

**Recommended decision:** Make Fetch videos a per-competitor action with
loading, success, and error states. The backend reads the channel's
public feed (`youtube.com/feeds/videos.xml?channel_id=…`), which lists
the latest 15 videos with title, description, thumbnail, publish time,
views, and likes, and replaces the current collection for that
competitor. When a channel is added by `@handle` or video link, the
backend reads the channel's public page once, like a link preview, to
find its channel ID, name, and avatar. If YouTube cannot be reached or
returns nothing, show a readable error and leave the stored videos
untouched. A video that has a remix or a plan item is kept when videos
are replaced. The Dashboard also offers a one-step Track & fetch that
runs both actions and reports the result.

**Why this option:** It gives real data with no registration, key, or
quota, and the sample-data mode keeps the product flow testable offline
without depending on YouTube's availability.

**Alternatives considered:** - YouTube Data API: more videos per channel
and comment counts, but requires a Google API key and quota management. -
Read the channel's web pages for every field: fragile, because the
markup changes without notice. - Append new videos: can create duplicates
and conflicts with the agreed replacement behavior. - Fetch automatically
on every competitor creation from the Competitors page: hides the cost
and result of fetching, and makes errors harder to explain. - Instagram
data: removed from this version; Instagram offers no free,
registration-free way to read other accounts' Reels.

**Known limits:** The feed returns at most 15 videos and has no comment
counts, so real videos show views and likes only.

### 3.6 Video sorting and performance metrics

**Recommended decision:** Support the agreed sorts---newest, most views,
and most likes---and show raw view and like counts (and comment counts
when known). Use views to identify the top-performing video and
most-viewed competitor.

**Why this option:** Raw metrics are understandable and easy to validate
against what YouTube shows.

**Alternatives considered:** - Engagement rate: useful for comparing
channels of different sizes, but needs a clear formula and consistent
data. - Weighted performance score: can combine views, likes, and
comments, but is harder to explain and tune. - More filters (minimum
views, date range, engagement thresholds): useful later, but not
essential to the first release.

### 3.7 Search, filtering, and pagination

**Recommended decision:** For the MVP, filter by competitor, search
caption text (the video titles), and sort by the three agreed fields. Do not paginate: each
channel contributes at most 15 videos, and a filtered grid stays
manageable. Add simple pagination or "Load more" only if the full
library becomes unwieldy.

**Why this option:** It covers the agreed use cases while keeping the
interface and API straightforward.

**Alternatives considered:** - Advanced filtering by date, minimum
views, or engagement: more powerful, but not selected for the MVP. - No
search or filters: simpler, but makes the library difficult to use as it
grows.

### 3.8 Validation and errors

**Recommended decision:** Validate competitor input on both client and
server, with the same rules on each side. Normalize input so `@name`,
`https://www.youtube.com/@name`, the channel's `/channel/UC…` link, its
channel ID, and a link to one of its videos all resolve to the same
channel. Reject other sites, YouTube pages that are not channels or
videos (search, trending), empty input, and malformed input with a short,
actionable error. Report lookup failures separately: channel not found,
and YouTube unreachable. Confirm destructive removal.

**Why this option:** Client-side validation improves usability, while
server-side validation protects data integrity.

**Alternatives considered:** - Client-only validation: easy to bypass
and unsafe to rely on. - Accept arbitrary text and try to interpret it:
forgiving, but can create inconsistent competitor records.

### 3.9 Data persistence and relationships

**Recommended decision:** Use SQLite (`clipremix.db`) and preserve data
across restarts. Add database constraints for a unique YouTube channel ID
per competitor, one remix per video, and one plan item per video. Use
transactions for operations that delete or replace related records.
Upgrade existing database files on startup by adding any missing columns
(plain `ALTER TABLE … ADD COLUMN`, compatible with Postgres), so new
fields never require deleting data.

**Why this option:** SQLite is sufficient for a local/single-user MVP
and avoids running a separate database service. The channel ID, not the
@handle, is the stable key because handles can change.

**Alternatives considered:** - In-memory storage: simpler initially, but
fails the persistence requirement (kept as an option for tests and demos
with `DATABASE_URL=sqlite://`). - PostgreSQL: a good choice for a
multi-user hosted service, but unnecessary for the current scope. - JSON
files: easy to inspect, but relational updates and consistency are
harder to manage.

### 3.10 No login and deployment

**Recommended decision:** Keep the app single-user and do not implement
authentication in this version, as specified. Treat it as a local
development or controlled demo environment. A Render blueprint
(`render.yaml`, `docs/deploy.md`) exists for a controlled demo.

**Why this option:** It keeps the MVP focused on the core product
workflows.

**Alternatives considered:** - Add accounts and multiple users:
introduces authentication, ownership, permissions, and data isolation. -
Publicly deploy without login: not recommended because anyone with
access could modify or delete the same data.

**Important limitation:** "No login" is acceptable for a local demo, but
a publicly accessible instance should not be deployed without an
appropriate access-control and security plan.

### 3.11 Scheduling and the production checklist

**Recommended decision:** Give each plan item two optional dates (film
and publish, stored as plain calendar days) and four checklist ticks:
script completed, recording completed, caption prepared, published. Save
each change immediately, show it at once, and roll it back with an error
if the save fails. Warn when the publish date is before the film date.
Keep the checklist **separate from the status**: ticking Published does
not move an item to ✅ Filmed. Add the calendar as a third layout of the
Content Plan page rather than a new page.

**Why this option:** It adds planning on top of the existing board and
table without changing how statuses work. Dates are plain days, not
timestamps, so they never shift with time zones.

**Alternatives considered:** - Derive the status from the checklist:
fewer controls, but surprising and harder to correct by hand. - A
separate Calendar page: more navigation for something that is another
view of the same items. - Drag-and-drop on the calendar, reminders, and
calendar export: useful later, but not needed to plan a shoot.

## 4. Explicitly out of scope

-   Reading videos beyond the channel feed: more than the latest 15 per
    channel, and comment counts (both need the YouTube Data API and its
    key)
-   Instagram and other platforms
-   AI-written breakdowns or video transcription/analysis
-   User accounts, authentication, and multi-user support
-   Public deployment without an access-control plan
-   Advanced analytics or custom performance scoring
-   Custom user-created templates
-   Advanced filtering such as engagement thresholds and date ranges
-   Calendar drag-and-drop, reminders, and calendar export

## 5. Core user journeys

### Journey A: Track and fetch

1.  Open Competitors.
2.  Click Add Competitor.
3.  Enter a YouTube channel link, `@handle`, channel ID, or a link to one
    of the channel's videos.
4.  Receive validation feedback or add the normalized competitor.
5.  Click Fetch videos on the competitor card.
6.  See the channel's latest videos (up to 15) replace the previous set.

(The Dashboard's Track & fetch field does steps 3 to 6 in one go.)

### Journey B: Browse and remix

1.  Open Videos.
2.  Search captions, filter by competitor, or change sorting.
3.  Browse in grid or list view.
4.  Open a video's quick preview, or Watch on YouTube.
5.  Click Remix.
6.  Receive a draft written from the video's own details, or select
    another template.
7.  Edit title, hook, script, and CTA.
8.  Click Save and receive a success or error message.

### Journey C: Plan filming

1.  Click Add to Plan on a video or remix.
2.  The item is added with ❌ Not started, unless it already exists.
3.  Open Content Plan in Kanban, table, or calendar view.
4.  Set the film and publish dates.
5.  Tick off the production checklist as work progresses, and change the
    status.
6.  Use the quick actions to edit the remix or open the original video.
7.  Keep the plan item even if the source video is later replaced or
    deleted.

## 6. Suggested MVP acceptance criteria

The MVP is ready for review when:

-   [ ] A valid YouTube channel link, `@handle`, channel ID, or video link
    adds one normalized competitor.
-   [ ] Invalid competitor input displays a useful error.
-   [ ] Adding the same channel twice, through different links, does not
    create a duplicate.
-   [ ] Fetch videos creates/replaces up to 15 real videos for that
    competitor, and a failed fetch leaves the stored videos unchanged.
-   [ ] Stored videos survive application restarts.
-   [ ] The library supports grid/list views, competitor filtering,
    caption (title) search, and the three agreed sorts.
-   [ ] Each video displays its thumbnail, title, view/like counts, and a
    Watch on YouTube link that opens that exact video.
-   [ ] A video has at most one remix; opening an existing remix loads
    it.
-   [ ] Templates produce a title, hook, script, and CTA from the video's
    own details without an AI service, and different videos get
    different text.
-   [ ] Remix edits are manually saved, and only changed fields are
    sent.
-   [ ] A video can be added to the Content Plan once, with a success or
    duplicate message.
-   [ ] Plan status can be changed among the three emoji statuses.
-   [ ] Plan items can be given film and publish dates, which appear on
    the calendar, and have a four-step production checklist whose
    progress is shown.
-   [ ] Plan items preserve their own video details when the source
    collection is refetched or the competitor is removed.
-   [ ] Removing a competitor requires confirmation and deletes the
    competitor's videos/remixes while preserving plan items.
-   [ ] The dashboard displays the agreed totals, aggregate metrics, top
    video, most-viewed competitor, recent videos, and plan progress.
-   [ ] Loading, empty, success, and error states are handled for the
    main actions.

## 7. Open implementation details

These are implementation choices rather than reasons to expand the MVP:

-   Keep the OpenAPI request and response shapes in `openapi.yaml` in
    step with each endpoint before implementing it.
-   Dashboard statistics are calculated in application code from the
    stored lists; revisit SQL aggregation only if the library grows
    large.
-   The sample videos and every template phrase are deterministic: a
    video's YouTube ID picks the phrasing, so tests can check exact text.
-   Pagination is not needed at 15 videos per channel; revisit if that
    limit is lifted.
-   Use accessible contrast, visible keyboard focus, and clear status
    labels alongside the emoji icons, and honour the system's reduced
    motion setting for every animation.

## 8. Product principle

**Build the smallest complete workflow:** track a channel → fetch real
videos → browse and remix → save edits → add to the filming plan →
schedule it and tick off the checklist → update filming status.

Keep the UI polished, but avoid features that do not strengthen this
end-to-end workflow. The YouTube Data API and AI generation can be
evaluated after the MVP has been tested.
