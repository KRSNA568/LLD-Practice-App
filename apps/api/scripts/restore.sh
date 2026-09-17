#!/bin/sh
# Restore a dump into a database, creating it if needed. Tables that exist are
# dropped first (--clean), so point this at the database you mean.
#   scripts/restore.sh backups/lld-20260918-0212.dump lld_practice_drill
set -eu
cd "$(dirname "$0")/.."
DUMP="$1"; DB="$2"
[ -f "$DUMP" ] || { echo "no such dump: $DUMP" >&2; exit 2; }
psql -d postgres -Atc "select 1 from pg_database where datname='$DB'" | grep -q 1 || createdb "$DB"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DB" "$DUMP"
psql -d "$DB" -Atc "select 'learners '||count(*) from \"Learner\" union all select 'attempts '||count(*) from \"Attempt\" union all select 'evaluations '||count(*) from \"Evaluation\" union all select 'notes '||count(*) from \"AiNote\""
