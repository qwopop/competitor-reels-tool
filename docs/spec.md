# Competitor Videos Tool: specification

## Purpose

Marketers and creators track Instagram competitors, collect their most recent
Videos in one library, and generate an editable breakdown of each Video (hook,
script, call to action) to base their own content on.

## Users

A single user with no login. Anyone who can reach the app can use it.

## Core flows

1. **Track a competitor.** The user pastes an Instagram profile URL
   (`https://instagram.com/<name>`) or a bare `@username`. Invalid input shows
   an error. Adding the same username again returns the existing competitor
   and does not create a duplicate.
2. **Fetch Videos.** For a tracked competitor, the user fetches the 20 most
   recent Videos. Refetching replaces that competitor's Videos rather than
   adding to them.
3. **Browse the library.** The dashboard lists every stored Video, newest first,
   with thumbnail, caption, views, likes, comments, and a link to the
   competitor's Videos tab on Instagram (`https://www.instagram.com/<name>/videos/`).
4. **Remix a Video.** The user generates a breakdown for a Video: a title, hook,
   script, and CTA. Remixing a Video that already has one opens the existing one.
5. **Edit a remix.** The user edits the title, hook, script, or CTA and saves.
   Only changed fields are sent to the server.
6. **Stop tracking.** Removing a competitor deletes its Videos and their remixes.
   Videos that have a remix or a content plan item are kept when the competitor's
   Videos are fetched again, so edits and plans are never lost.
7. **Plan filming.** From the Videos page or a remix, the user adds a Video to the
   content plan. Each item has a status shown as an emoji: ❌ not started (the
   default, nothing ready yet), ⏳ ready to film (script done, video ready to
   go), or ✅ filmed (filmed and posted). The Content Plan page lists the items
   with their status and counts, and the user changes status there. Plan items
   keep their own copy of the Video's details, so they survive re-fetching a
   competitor's Videos.
8. **Open a profile's Videos.** As soon as the user types a valid profile link or
   username on the dashboard or in the Add competitor dialog, a link to that
   account's Videos tab on Instagram appears. It opens in a new tab and works
   without tracking the account. Each tracked competitor also has this link.
   The **Go to Videos** page does the same on its own: type a username, press
   Generate link, and open or copy `https://www.instagram.com/<name>/videos/`.

## Data

- **Competitor:** id, username, Instagram URL, display name, avatar URL, added time.
- **Video:** id, competitor, shortcode, permalink, caption, thumbnail URL, view,
  like, and comment counts, posted time, fetched time.
- **Remix:** id, Video, title, hook, script, CTA, created and updated times.
- **Plan item:** id, source Video id, status, a copy of the Video's details, added and updated times.

Data survives restarts (SQLite). The contract is in `openapi.yaml`.

## Out of scope for this version

- Reading Videos from personal (non-Business, non-Creator) accounts. Real Videos
  come from the Instagram Graph API (`backend/app/instagram.py`) when it is
  configured, and sample data from `backend/app/generator.py` otherwise.
- AI-written breakdowns. Remixes come from fixed templates in the same file.
- Accounts, authentication, and multiple users.
- Public deployment.
