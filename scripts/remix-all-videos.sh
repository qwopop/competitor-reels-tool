#!/usr/bin/env bash
# Request a remix for every video of the app and print the HTTP status of each.
#
#   scripts/remix-all-videos.sh http://localhost:8091
#   SEED_CHANNEL=smokecheck scripts/remix-all-videos.sh https://clipremix-dev.onrender.com
#
# 201 = remix created, 200 = the video already had a remix, 500 = the server failed.
# Used by docs/on-call-exercise.md to produce failing remixes on a build with a bug.
# If the app has no videos yet and SEED_CHANNEL is set (a channel handle, VIDEO_SOURCE=sample
# only makes sense there), that channel is added and its videos are fetched first.
# Needs curl and jq. Exits 1 if the app cannot be reached; it does not exit 1 on a 500,
# because showing the 500s is its job.
set -euo pipefail

base="${1:-}"
if [ -z "$base" ]; then
  echo "usage: $0 <base-url>   e.g. $0 http://localhost:8091" >&2
  exit 2
fi
base="${base%/}"

api() { # method path [json-body] -> prints "<status> <body>" on one line... status first
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS --max-time 90 -X "$method" -H 'Content-Type: application/json' -d "$body" -w '\n%{http_code}' "$base$path"
  else
    curl -sS --max-time 90 -X "$method" -w '\n%{http_code}' "$base$path"
  fi
}

videos=$(curl -fsS --max-time 90 "$base/api/videos") || { echo "Cannot read $base/api/videos" >&2; exit 1; }

if [ "$(echo "$videos" | jq 'length')" -eq 0 ] && [ -n "${SEED_CHANNEL:-}" ]; then
  echo "No videos yet: adding channel @$SEED_CHANNEL and fetching its videos."
  out=$(api POST /api/competitors "{\"channelUrl\":\"https://www.youtube.com/@${SEED_CHANNEL}\"}")
  comp=$(echo "$out" | head -n -1 | jq -r '.id')
  api POST "/api/competitors/$comp/videos/fetch" >/dev/null
  videos=$(curl -fsS --max-time 90 "$base/api/videos")
fi

total=$(echo "$videos" | jq 'length')
if [ "$total" -eq 0 ]; then
  echo "The app has no videos. Add a competitor and fetch its videos, or set SEED_CHANNEL=<handle>." >&2
  exit 1
fi

printf '%-6s %-22s %s\n' STATUS VIDEO TITLE
declare -A count=()
while IFS=$'\t' read -r id title; do
  out=$(api POST "/api/videos/$id/remix")
  code=$(echo "$out" | tail -n 1)
  count[$code]=$(( ${count[$code]:-0} + 1 ))
  printf '%-6s %-22s %s\n' "$code" "$id" "$title"
done < <(echo "$videos" | jq -r '.[] | [.id, .caption] | @tsv')

echo
echo "$total videos:"
for code in $(printf '%s\n' "${!count[@]}" | sort); do
  echo "  HTTP $code: ${count[$code]}"
done
