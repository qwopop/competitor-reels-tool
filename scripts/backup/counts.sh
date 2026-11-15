#!/usr/bin/env bash
# Print "table<TAB>rows" for every app table. Usage: counts.sh DATABASE_URL
set -euo pipefail
url="${1:?usage: counts.sh DATABASE_URL}"
url="${url/postgresql+psycopg:\/\//postgresql://}"
for t in competitors videos remixes content_plan; do
  n=$(psql "$url" -v ON_ERROR_STOP=1 -tAc "SELECT count(*) FROM $t")
  printf '%s\t%s\n' "$t" "$n"
done
