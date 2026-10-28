#!/usr/bin/env bash
# The 3am change (scripts/drift.sql): the rate limit tightened from the declared 100 to
# 5 requests per 10 s, with a note in the description, outside the declaration. One
# statement, so it is repeatable on stage. Undo with scripts/restore.sh (the
# declaration wins) or let the agent propose it.
set -euo pipefail
. "$(dirname "$0")/_env.sh"

sql "$(sed -e "s/{{ zone_id }}/$CLOUDFLARE_ZONE_ID/" -e "/^--/d" "$ROOT/scripts/drift.sql")"

echo >&2
echo "the human view in SQL: $STACKQL_SHELL  (paste from runs/shell.iql, rendered by scripts/shell.sh)" >&2
