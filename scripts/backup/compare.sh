#!/usr/bin/env bash
# Exit 0 only if both databases hold the same row counts in every app table
# and the source is not empty. Usage: compare.sh SOURCE_URL RESTORED_URL
set -euo pipefail
here="$(dirname "$0")"
a="$("$here/counts.sh" "$1")"; b="$("$here/counts.sh" "$2")"
echo "source:"; echo "$a"; echo "restored:"; echo "$b"
[ "$a" = "$b" ] || { echo "row counts differ" >&2; exit 1; }
total=$(echo "$a" | awk '{s+=$2} END {print s}')
[ "$total" -gt 0 ] || { echo "source is empty, nothing proven" >&2; exit 1; }
echo "row counts match ($total rows)"
