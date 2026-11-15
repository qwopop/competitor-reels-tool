#!/usr/bin/env bash
# Restore an encrypted dump made by backup.sh into an EMPTY database.
# Usage: restore.sh DUMP_FILE      Env: TARGET_DATABASE_URL, BACKUP_PASSPHRASE.
# RESTORE_CLEAN=1 drops existing objects first (for a scratch branch that already has tables).
# Point it at a scratch database or Neon branch first.
set -euo pipefail
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
in="${1:?usage: restore.sh DUMP_FILE}"
url="${TARGET_DATABASE_URL/postgresql+psycopg:\/\//postgresql://}"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$in" \
  | pg_restore ${RESTORE_CLEAN:+--clean --if-exists} --no-owner --no-privileges --exit-on-error --dbname="$url"
echo "restored $in"
