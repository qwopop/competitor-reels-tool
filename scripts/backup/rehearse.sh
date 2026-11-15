#!/usr/bin/env bash
# Full rehearsal on one PostgreSQL server: seed a source database, back it up,
# restore into a fresh database, compare row counts. Used by CI and by hand.
# Usage: rehearse.sh ADMIN_URL   (e.g. postgresql://clipremix:clipremix@localhost:5432/postgres)
# Needs a role that can CREATE DATABASE. Uses throwaway names, drops them at the end.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
admin="${1:?usage: rehearse.sh ADMIN_URL}"
base="${admin%/*}"
suffix="$$"
src="rehearsal_src_$suffix"; dst="rehearsal_restored_$suffix"
work="$(mktemp -d)"
export BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-$(openssl rand -hex 24)}"
cleanup() { psql "$admin" -qc "DROP DATABASE IF EXISTS $src" -c "DROP DATABASE IF EXISTS $dst" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
psql "$admin" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $src" -c "CREATE DATABASE $dst"
(cd "$here/../../backend" && uv run python ../scripts/backup/seed.py "$base/$src")
SOURCE_DATABASE_URL="$base/$src" "$here/backup.sh" "$work/dump.enc"
# The dump must be encrypted: pg_restore's magic header must not appear.
if head -c 5 "$work/dump.enc" | grep -q PGDMP; then echo "dump is NOT encrypted" >&2; exit 1; fi
# A wrong passphrase must fail.
if BACKUP_PASSPHRASE=wrong TARGET_DATABASE_URL="$base/$dst" "$here/restore.sh" "$work/dump.enc" >/dev/null 2>&1; then
  echo "restore worked with a wrong passphrase" >&2; exit 1; fi
TARGET_DATABASE_URL="$base/$dst" "$here/restore.sh" "$work/dump.enc"
"$here/compare.sh" "$base/$src" "$base/$dst"
