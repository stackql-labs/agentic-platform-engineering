#!/usr/bin/env bash
# The out-of-band change: somebody switches deletion protection off on one cell's orders
# table, outside the declaration (default: syd, the canary). One statement, so it is
# repeatable on stage. Undo with scripts/build.sh <cell> (the declaration wins) or let
# the agent propose it.
#   scripts/drift.sh [cell]
set -euo pipefail
. "$(dirname "$0")/_env.sh"
cell "${1:-syd}"

sql "UPDATE aws.dynamodb.tables
SET DeletionProtectionEnabled = false
WHERE region = '$CELL_REGION' AND TableName = '$SERVICE'" >/dev/null

echo >&2
echo "cell $CELL ($CELL_REGION): deletion protection is now off. scripts/board.sh shows it." >&2
