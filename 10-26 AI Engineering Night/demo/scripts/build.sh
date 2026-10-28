#!/usr/bin/env bash
# Assert the rule from stack/stackql_manifest.yml against the live API. No state file:
# exists -> createorupdate, statecheck -> createorupdate. Run it to create the rule the
# first time, and run it again to converge whatever drifted since. Extra arguments go
# to stackql-deploy (for example --dry-run).
set -euo pipefail
. "$(dirname "$0")/_env.sh"

echo "+ stackql-deploy build stack demo --env-file .env --show-queries $*" >&2
exec "$STACKQL_DEPLOY" build stack demo --env-file .env --show-queries "$@"
