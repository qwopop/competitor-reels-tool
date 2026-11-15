#!/usr/bin/env bash
# Encrypted pg_dump of one database. Usage: backup.sh OUTPUT_FILE
# Env: SOURCE_DATABASE_URL (postgres:// URL), BACKUP_PASSPHRASE.
# The dump goes straight from pg_dump through openssl into the file: it is never
# written unencrypted and never printed. No secret is echoed.
set -euo pipefail
: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
out="${1:?usage: backup.sh OUTPUT_FILE}"
# SQLAlchemy-style prefixes are not valid for libpq.
url="${SOURCE_DATABASE_URL/postgresql+psycopg:\/\//postgresql://}"
pg_dump --format=custom --no-owner --no-privileges --dbname="$url" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$out"
[ -s "$out" ] || { echo "backup is empty" >&2; exit 1; }
echo "wrote $out ($(wc -c < "$out") bytes, encrypted)"
