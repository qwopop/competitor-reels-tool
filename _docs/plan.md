# Competitor Reels Tool --- MVP Scope & Product Decisions

**Document purpose:** Capture the agreed MVP scope, record the choices
made during brainstorming, and document additional product decisions
with rationale and alternatives.

## 1. Product summary

Competitor Reels Tool helps marketers and creators keep a library of
competitor Instagram Reels, turn selected Reels into editable content
breakdowns, and organize those ideas into a filming plan.

The MVP is a single-user web app with no login. It uses generated sample
data rather than fetching real Instagram Reels, and it uses fixed
templates rather than AI-generated breakdowns.

## 2. Agreed MVP decisions

### Navigation and dashboard

-   Use a **left sidebar** with:
    -   Dashboard
    -   Competitors
    -   Reels
    -   Remixes
    -   Content Plan
-   The Dashboard is a **combined overview** of competitors, Reel
    statistics, recent Reels, and content-plan progress.
-   Use a **dark creator-studio visual style**: dark surfaces, vibrant
    purple accents, clear typography, and a polished creator-focused
    interface.

### Competitors

-   Add a competitor through a **simple modal**.
-   The input accepts an Instagram profile URL or a bare `@username`.
-   Invalid input displays a clear validation error.
-   Adding the same username again returns the existing competitor
    instead of creating a duplicate.
-   Competitor cards show:
    -   Avatar
    -   Username
    -   Display name
    -   Number of stored Reels
-   Each card has a **Fetch Reels** button.
-   Fetching replaces that competitor's stored Reel collection with the
    newest 20 sample Reels; it does not append duplicates.

### Reels Library

-   Show all stored Reels, newest first by default.
-   Use a **grid by default**, with a **grid/list toggle**.
-   Each Reel includes a thumbnail, caption, view count, like count,
    comment count, and link to the original Instagram Reel.
-   Filters and discovery tools:
    -   Filter by competitor
    -   Search captions
    -   Sort by newest, most views, or most likes
-   Include a Remix action and an Add to Plan action.

### Remixes

-   Clicking Remix opens a **dedicated editing page**.
-   The Reels Library also offers a **quick preview panel** for a remix.
-   A remix contains:
    -   Title
    -   Hook
    -   Script
    -   Call to action (CTA)
-   If a remix already exists for a Reel, opening Remix shows the
    existing remix rather than creating another.
-   Generate a default breakdown immediately using a fixed template.
-   Let users select alternative fixed templates, such as educational,
    storytelling, or promotional.
-   Users can edit all fields manually.
-   Saving is **manual**, using a Save button.
-   Send only changed fields to the server.
-   Show clear save success or error feedback.

### Content Plan

-   Use a **Kanban board by default**, with a table-view toggle.
-   The three statuses are:
    -   ❌ **Not started** --- nothing ready yet; default status
    -   ⏳ **Ready to film** --- the script is done and the video is
        ready to make
    -   ✅ **Filmed** --- filmed and posted
-   Plan cards show:
    -   Thumbnail
    -   Title
    -   Competitor
    -   Status
    -   Hook preview
    -   Date added
    -   Quick action to edit the remix
    -   Quick action to open the original Reel
-   Adding a Reel to the plan is immediate, starts at ❌ Not started,
    and shows a success message.
-   Prevent duplicate plan entries for the same source Reel.
-   The Content Plan page shows item counts, including counts by status.
-   A plan item stores its **own copy of the Reel details**, so it
    remains usable if the competitor's Reels are fetched again.

### Dashboard statistics

Show: - Total competitors - Total Reels - Total remixes - Planned
videos - Combined views, likes, and comments across stored Reels -
Top-performing Reel - Most-viewed competitor - Recent Reels and a
summary of Content Plan progress

For the MVP, "top-performing Reel" should be defined simply and
transparently. Recommended default: the Reel with the highest view
count. More advanced engagement scoring can come later.

## 3. Additional decisions and rationale

These decisions fill in implementation details that were not fully
settled in the brainstorming session.

### 3.1 Removing a competitor

**Recommended decision:** Show a confirmation dialog, then remove the
competitor and delete their stored Reels and associated remixes.
Preserve existing Content Plan items as independent copies.

**Why this option:** It follows the core tracking model and prevents a
user from accidentally deleting work. Preserving plan items protects
content that has already been selected for production. It also keeps the
Content Plan consistent with the requirement that plan entries own a
copy of the source Reel details.

**Alternatives considered:** - Delete everything, including plan items:
simpler data cleanup, but risks losing planned work. - Untrack the
competitor while keeping every Reel and remix: preserves history, but
makes "remove competitor" ambiguous and leaves orphaned library
content. - Archive the competitor instead of deleting: useful for a
later version, but adds another state and UI concept to the MVP.

**Implementation note:** Keep the `source_reel_id` on a plan item as
historical provenance if useful, but do not require the original Reel
row to remain in order for the plan item to render.

### 3.2 Duplicate plan items

**Recommended decision:** Allow at most one plan item per source Reel.
If the user tries to add it again, keep the existing item and show a
friendly message such as "Already in your Content Plan."

**Why this option:** It matches the agreed no-duplicates behavior and
avoids confusing counts.

**Alternative considered:** Allow multiple copies of the same Reel for
different campaigns or versions. This is flexible, but would require a
way to distinguish the copies and is unnecessary for the MVP.

### 3.3 Remix templates

**Recommended decision:** Start with a small set of deterministic
templates: **Default**, **Educational**, **Storytelling**, and
**Promotional**. Use generated sample Reel details as inputs, and make
it clear that these are template-generated drafts rather than AI
analysis.

**Why this option:** It delivers a useful end-to-end workflow without
requiring an AI service or Instagram video analysis. A small template
set is easy to test and maintain.

**Alternatives considered:** - One fixed template only: fastest to
build, but offers little creative flexibility. - AI-generated scripts:
potentially more varied and useful, but adds cost, latency, prompt
design, safety considerations, and API dependencies that are explicitly
outside this version. - Let users build their own templates: powerful,
but adds template management and a more complex editing experience.

### 3.4 Saving remix edits

**Recommended decision:** Use a manual Save button, disable it when
there are no unsaved changes, and show a clear saved/error state after
the server responds. Send only changed fields.

**Why this option:** It matches the user's preference for manual saving
and keeps the API payload small.

**Alternatives considered:** - Auto-save on every keystroke: convenient,
but can create noisy requests and make saving behavior less
predictable. - Debounced auto-save: a good future enhancement, but adds
complexity and does not match the chosen manual-save workflow.

### 3.5 Fetching sample Reels

**Recommended decision:** Make Fetch Reels a per-competitor action with
loading, success, and error states. For this MVP, the backend generator
returns up to 20 sample Reels and replaces the current collection for
that competitor.

**Why this option:** It makes the product flow testable without
depending on Instagram access, rate limits, or third-party APIs.

**Alternatives considered:** - Append new sample Reels: can create
duplicates and conflicts with the agreed replacement behavior. - Fetch
automatically on competitor creation: hides the cost and result of
fetching, and makes errors harder to explain. - Integrate real Instagram
data now: explicitly out of scope and introduces access, reliability,
and compliance concerns.

### 3.6 Reel sorting and performance metrics

**Recommended decision:** Support the agreed sorts---newest, most views,
and most likes---and show raw view, like, and comment counts. Use views
to identify the top-performing Reel and most-viewed competitor.

**Why this option:** Raw metrics are understandable and easy to validate
with generated data.

**Alternatives considered:** - Engagement rate: useful for comparing
accounts of different sizes, but needs a clear formula and consistent
data. - Weighted performance score: can combine views, likes, and
comments, but is harder to explain and tune. - More filters (minimum
views, date range, engagement thresholds): useful later, but not
essential to the first release.

### 3.7 Search, filtering, and pagination

**Recommended decision:** For the MVP, filter by competitor, search
caption text, and sort by the three agreed fields. Add simple pagination
or "Load more" only if the full library becomes unwieldy.

**Why this option:** It covers the agreed use cases while keeping the
interface and API straightforward.

**Alternatives considered:** - Advanced filtering by date, minimum
views, or engagement: more powerful, but not selected for the MVP. - No
search or filters: simpler, but makes the library difficult to use as it
grows.

### 3.8 Validation and errors

**Recommended decision:** Validate competitor input on both client and
server. Normalize usernames so `@name` and `https://instagram.com/name`
resolve to the same username. Reject unsupported URLs, empty usernames,
and malformed input with a short, actionable error. Confirm destructive
removal.

**Why this option:** Client-side validation improves usability, while
server-side validation protects data integrity.

**Alternatives considered:** - Client-only validation: easy to bypass
and unsafe to rely on. - Accept arbitrary text and try to interpret it:
forgiving, but can create inconsistent competitor records.

### 3.9 Data persistence and relationships

**Recommended decision:** Use SQLite and preserve data across restarts.
Add database constraints for unique competitor usernames and one remix
per Reel. Use transactions for operations that delete or replace related
records.

**Why this option:** SQLite is sufficient for a local/single-user MVP
and avoids running a separate database service.

**Alternatives considered:** - In-memory storage: simpler initially, but
fails the persistence requirement. - PostgreSQL: a good choice for a
multi-user hosted service, but unnecessary for the current scope. - JSON
files: easy to inspect, but relational updates and consistency are
harder to manage.

### 3.10 No login and deployment

**Recommended decision:** Keep the app single-user and do not implement
authentication or public deployment in this version, as specified. Treat
it as a local development or controlled demo environment.

**Why this option:** It keeps the MVP focused on the core product
workflows.

**Alternatives considered:** - Add accounts and multiple users:
introduces authentication, ownership, permissions, and data isolation. -
Publicly deploy without login: not recommended because anyone with
access could modify or delete the same data.

**Important limitation:** "No login" is acceptable for a local demo, but
a publicly accessible instance should not be deployed without an
appropriate access-control and security plan.

## 4. Explicitly out of scope

-   Fetching real Instagram Reels
-   AI-written breakdowns or video transcription/analysis
-   User accounts, authentication, and multi-user support
-   Public deployment
-   Advanced analytics or custom performance scoring
-   Custom user-created templates
-   Advanced filtering such as engagement thresholds and date ranges

## 5. Core user journeys

### Journey A: Track and fetch

1.  Open Competitors.
2.  Click Add Competitor.
3.  Enter an Instagram profile URL or `@username`.
4.  Receive validation feedback or add the normalized competitor.
5.  Click Fetch Reels on the competitor card.
6.  See the latest 20 generated sample Reels replace the previous set.

### Journey B: Browse and remix

1.  Open Reels.
2.  Search captions, filter by competitor, or change sorting.
3.  Browse in grid or list view.
4.  Open a Reel's quick preview.
5.  Click Remix.
6.  Generate a default template breakdown or select another template.
7.  Edit title, hook, script, and CTA.
8.  Click Save and receive a success or error message.

### Journey C: Plan filming

1.  Click Add to Plan on a Reel or remix.
2.  The item is added with ❌ Not started, unless it already exists.
3.  Open Content Plan in Kanban or table view.
4.  Change the status as work progresses.
5.  Use the quick actions to edit the remix or open the original Reel.
6.  Keep the plan item even if the source Reel is later replaced or
    deleted.

## 6. Suggested MVP acceptance criteria

The MVP is ready for review when:

-   [ ] A valid Instagram URL or `@username` adds one normalized
    competitor.
-   [ ] Invalid competitor input displays a useful error.
-   [ ] Adding the same competitor twice does not create a duplicate.
-   [ ] Fetch Reels creates/replaces up to 20 sample Reels for that
    competitor.
-   [ ] Stored Reels survive application restarts.
-   [ ] The library supports grid/list views, competitor filtering,
    caption search, and the three agreed sorts.
-   [ ] Each Reel displays its thumbnail, caption, view/like/comment
    counts, and Instagram link.
-   [ ] A Reel has at most one remix; opening an existing remix loads
    it.
-   [ ] Templates produce a title, hook, script, and CTA without an AI
    service.
-   [ ] Remix edits are manually saved, and only changed fields are
    sent.
-   [ ] A Reel can be added to the Content Plan once, with a success or
    duplicate message.
-   [ ] Plan status can be changed among the three emoji statuses.
-   [ ] Plan items preserve their own Reel details when the source
    collection is refetched or the competitor is removed.
-   [ ] Removing a competitor requires confirmation and deletes the
    competitor's Reels/remixes while preserving plan items.
-   [ ] The dashboard displays the agreed totals, aggregate metrics, top
    Reel, most-viewed competitor, recent Reels, and plan progress.
-   [ ] Loading, empty, success, and error states are handled for the
    main actions.

## 7. Open implementation details

These are implementation choices rather than reasons to expand the MVP:

-   Confirm the exact OpenAPI request and response shapes before
    implementing each endpoint.
-   Decide whether counts and dashboard statistics are calculated in SQL
    or in application code.
-   Define the deterministic formula used to generate sample Reel
    metrics and template text.
-   Decide whether pagination is needed based on the expected size of
    the sample library.
-   Use accessible contrast, visible keyboard focus, and clear status
    labels alongside the emoji icons.

## 8. Product principle

**Build the smallest complete workflow:** track a competitor → fetch
sample Reels → browse and remix → save edits → add to the filming plan →
update filming status.

Keep the UI polished, but avoid features that do not strengthen this
end-to-end workflow. Real Instagram integration and AI generation can be
evaluated after the MVP has been tested.
