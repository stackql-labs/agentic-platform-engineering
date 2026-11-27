#!/usr/bin/env bash
# Remove one cell: the release pointer and the orders table. Deletion protection is part
# of the declaration, so it has to come off first; that is the point of it.
#   scripts/teardown.sh fra
set -euo pipefail
. "$(dirname "$0")/_env.sh"
cell "${1:-}"; shift

sql "UPDATE aws.dynamodb.tables
SET DeletionProtectionEnabled = false
WHERE region = '$CELL_REGION' AND TableName = '$SERVICE'" >/dev/null || true

echo "+ stackql-deploy teardown stack $CELL --env-file $CELL_FILE $*" >&2
exec "$STACKQL_DEPLOY" teardown stack "$CELL" --env-file "$CELL_FILE" "$@"
