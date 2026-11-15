#!/usr/bin/env bash
# Promotion gate (#86): succeeds only if the commit of the image being promoted has a
# successful `dev-smoke` commit status that was recorded for exactly this image tag.
# Fails closed: a missing, pending, failed or stale (other tag) status, or any error
# while reading statuses, stops the promotion. Used by promote.yml (job resolve).
#
# Environment: GH_TOKEN, REPO (owner/name), SHA (full commit sha), TAG (image tag).
set -uo pipefail

: "${REPO:?}" "${SHA:?}" "${TAG:?}"
fail() { echo "::error::Promotion refused: $1"; exit 1; }

# Statuses of a commit, newest first. A failed call must not look like "no status".
if ! raw=$(gh api "repos/$REPO/commits/$SHA/statuses?per_page=100" 2>/dev/null); then
  fail "could not read the commit statuses of ${SHA:0:7} (GitHub API error). Try again."
fi
if ! echo "$raw" | jq -e 'type == "array"' >/dev/null 2>&1; then
  fail "the commit statuses of ${SHA:0:7} could not be read (unexpected answer). Try again."
fi

all=$(echo "$raw" | jq -c '[.[] | select(.context == "dev-smoke")]')
mine=$(echo "$all" | jq -c --arg tag "$TAG" '[.[] | select((.description // "") | startswith($tag + " "))]')

if [ "$(echo "$all" | jq 'length')" = "0" ]; then
  fail "no dev-smoke status exists for commit ${SHA:0:7} (image $TAG). The smoke tests have not run on dev for this version. Deploy it to dev (push to main) and wait for the smoke job."
fi
if [ "$(echo "$mine" | jq 'length')" = "0" ]; then
  other=$(echo "$all" | jq -r '.[0].description // "unknown"')
  fail "the dev-smoke status of commit ${SHA:0:7} is for another image (\"$other\"), not $TAG. Run the smoke tests for this image again."
fi

state=$(echo "$mine" | jq -r '.[0].state')
url=$(echo "$mine" | jq -r '.[0].target_url // ""')
case "$state" in
  success)
    echo "dev-smoke passed for $TAG (commit ${SHA:0:7}) ${url}"
    ;;
  pending)
    fail "the smoke tests of $TAG on dev have not finished (status pending). Wait for them ${url}"
    ;;
  *)
    fail "the smoke tests of $TAG on dev did not pass (status $state). Fix it and deploy again ${url}"
    ;;
esac
