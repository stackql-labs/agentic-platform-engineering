#!/usr/bin/env bash
# Assert one cell from stack/stackql_manifest.yml against the live API. No state file:
# exists -> create, statecheck -> update. Run it to create the cell the first time, and
# run it again to converge whatever drifted since. Extra arguments go to stackql-deploy
# (for example --dry-run).
#   scripts/build.sh syd
set -euo pipefail
. "$(dirname "$0")/_env.sh"
cell "${1:-}"; shift

echo "+ stackql-deploy build stack $CELL --env-file $CELL_FILE --show-queries $*" >&2
exec "$STACKQL_DEPLOY" build stack "$CELL" --env-file "$CELL_FILE" --show-queries "$@"
