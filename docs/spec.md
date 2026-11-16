# ClipRemix: specification

## Purpose

Marketers and creators track competitor YouTube channels, collect their latest
videos in one library, and generate an editable breakdown of each video (hook,
script, call to action) to base their own content on.

## Users

A single user with no login. Anyone who can reach the app can use it.

## Core flows

1. **Track a competitor.** The user pastes a YouTube channel link
   (`https://www.youtube.com/@<handle>`, `/channel/UC…`, `/c/<name>`,
   `/user/<name>`), an `@handle`, a channel ID, or a link to one of the
   channel's videos (`watch?v=`, `youtu.be/`, `/shorts/`). The backend looks the
   channel up once to get its ID, name and avatar. Invalid input shows an
   error. Adding the same channel again, through any of these forms, returns
   the existing competitor and does not create a duplicate.
2. **Fetch videos.** For a tracked competitor, the user fetches its latest
   videos (up to 15, the most YouTube's channel feed returns). Refetching
   replaces that competitor's videos rather than adding to them.
3. **Browse the library.** The Videos page lists every stored video, newest
   first, with thumbnail, title, views and likes, and a **Watch on YouTube**
   link that opens that exact video.
4. **Remix a video.** The user generates a breakdown for a video: a title, hook,
   script, and CTA, in one of four styles (default, educational, storytelling,
   promotional). The draft is written from that video's own title, description
   (opening promise, chapters, what the creator offers), channel, views and
   format, so every video gets its own text. Remixing a video that already has
   one opens the existing one.
5. **Write a remix with AI.** On the Remix page the user picks a creator voice
   (Educational blogger, Storyteller, Entertainer, Expert reviewer, Motivational
   coach, or a custom "You are…" text of up to 300 characters), optionally adds
   instructions (up to 500 characters), and presses **Write with AI**. The
   backend asks Google's Gemini (`backend/app/ai_writer.py`) to write the title,
   hook, script (the same beat format as the templates) and CTA from the source
   video's title, description, channel, numbers and format. The draft fills the
   editor as unsaved changes; nothing is stored until **Save changes**. The
   templates stay the fallback: when `GEMINI_API_KEY` is not set, the quota is
   used up or Gemini fails, the user sees a message, the editor text is unchanged
   and **Apply template** works as before.
6. **Edit a remix.** The user edits the title, hook, script, or CTA and saves.
   Only changed fields are sent to the server.
7. **Stop tracking.** Removing a competitor deletes its videos and their remixes.
   Videos that have a remix or a content plan item are kept when the competitor's
   videos are fetched again, so edits and plans are never lost.
8. **Plan filming.** From the Videos page or a remix, the user adds a video to the
   content plan. Each item has a status shown as an emoji: ❌ not started (the
   default), ⏳ ready to film (script done), or ✅ filmed (filmed and posted).
   The Content Plan page lists the items with their status and counts, and the
   user changes status there. Plan items keep their own copy of the video's
   details, so they survive re-fetching a competitor's videos.
   Each item can also get a **film date** and a **publish date**, and has a
   **production checklist**: script completed, recording completed, caption
   prepared, published. The page has three layouts: Board (by status), Table,
   and **Calendar**, a month view showing what to film and publish on each day,
   with unscheduled videos listed underneath.
9. **Open a channel.** As soon as the user types a valid channel link or handle
   on the dashboard or in the Add competitor dialog, a link to that channel's
   Videos tab appears (a video link opens the video). The **Go to videos** page
   does the same on its own and also links to the channel's Shorts.

## Data

- **Competitor:** id, YouTube channel ID, username (handle, or the channel ID
  when there is none), channel URL, display name, avatar URL, added time.
- **Video:** id, competitor, YouTube video ID, permalink, caption (the video
  title), description, thumbnail URL, view, like and comment counts, posted time, fetched time.
- **Remix:** id, video, title, hook, script, CTA, created and updated times.
- **Plan item:** id, source video id, status, a copy of the video's details, film and
  publish dates, four checklist ticks, added and updated times.

Data survives restarts: SQLite in local development, PostgreSQL in Docker Compose and in production on Render. The contract is in `openapi.yaml`.

## Where the data comes from

No API key or account is needed (`backend/app/youtube.py`):

- **Videos:** the channel's public feed,
  `https://www.youtube.com/feeds/videos.xml?channel_id=UC…`. It has no comment
  counts, so real videos show views and likes only.
- **Channel lookup:** the channel's public page, read once when a channel is
  added, like a link preview.

**AI drafts:** Google's Gemini API (`generateContent`), called only from the
backend with `GEMINI_API_KEY` (docs/deploy.md). Fixed instructions go in the
system instruction; the video's text and the user's voice and instructions are
sent only as JSON data, and the answer must match a JSON schema. Without the
key, AI writing is off and the templates work as before.

`VIDEO_SOURCE=sample` switches to generated sample data
(`backend/app/generator.py`) with no network access. Tests always use it.

## Out of scope for this version

- More than the latest 15 videos per channel, and comment counts. Both need the
  YouTube Data API, which requires a Google API key.
- Limits on AI writes per day, remembered voices, AI from the Videos page, and
  streaming or single-field AI rewrites (#97, #98, #99).
- Accounts, authentication, and multiple users.
