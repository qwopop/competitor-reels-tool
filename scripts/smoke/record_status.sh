#!/usr/bin/env bash
# Records the result of the dev smoke run as the commit status `dev-smoke` on the
# commit of the deployed image (#86). promote.yml reads it with check_gate.sh.
#
# The description starts with the image tag ("<tag> smoke passed"), so a status
# for another image built from the same commit is never taken for this one.
#
# Environment: GH_TOKEN (needs `statuses: write`), REPO (owner/name), SHA (full commit sha),
#              TAG (image tag), STATE (pending|success|failure|error), TARGET_URL (run page).
set -euo pipefail

: "${REPO:?}" "${SHA:?}" "${TAG:?}" "${STATE:?}"
case "$STATE" in
  pending) text="smoke is running" ;;
  success) text="smoke passed" ;;
  failure) text="smoke failed" ;;
  error) text="smoke could not finish" ;;
  *) echo "::error::Unknown status state \"$STATE\"."; exit 2 ;;
esac

gh api -X POST "repos/$REPO/statuses/$SHA" \
  -f state="$STATE" \
  -f context="dev-smoke" \
  -f description="$TAG $text" \
  -f target_url="${TARGET_URL:-}" > /dev/null
echo "Recorded commit status dev-smoke=$STATE for $TAG on ${SHA:0:7}."
