#!/bin/sh
# A compressed pg_dump of the database in DATABASE_URL (or the first argument),
# named by the minute, into apps/api/backups/. Run from anywhere.
#   scripts/backup.sh                       → backups/lld-20260918-0212.dump
#   scripts/backup.sh postgresql://…/other  → same, from another database
set -eu
cd "$(dirname "$0")/.."
URL="${1:-${DATABASE_URL:-}}"
[ -n "$URL" ] || URL=$(sed -n 's/^DATABASE_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' .env.local .env 2>/dev/null | head -1)
[ -n "$URL" ] || { echo "no DATABASE_URL" >&2; exit 2; }
mkdir -p backups
OUT="backups/lld-$(date +%Y%m%d-%H%M).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$URL"
echo "$OUT ($(du -h "$OUT" | cut -f1))"
