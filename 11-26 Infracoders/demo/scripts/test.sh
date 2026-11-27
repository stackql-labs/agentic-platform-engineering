#!/usr/bin/env bash
# Check one cell against its declaration without changing anything: the exists and
# statecheck queries from the stack, run against the live API. Exits non-zero when the
# cell is not what the declaration says.
#   scripts/test.sh syd
set -euo pipefail
. "$(dirname "$0")/_env.sh"
cell "${1:-}"; shift

echo "+ stackql-deploy test stack $CELL --env-file $CELL_FILE $*" >&2
exec "$STACKQL_DEPLOY" test stack "$CELL" --env-file "$CELL_FILE" "$@"
