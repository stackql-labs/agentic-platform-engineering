#!/usr/bin/env bash
# Assert the estate from stack/stackql_manifest.yml against the live API. No state
# file: exists -> create, statecheck -> update. Run it to build the estate the first
# time, and run it again to converge whatever drifted since. Extra arguments go to
# stackql-deploy (for example --dry-run).
set -euo pipefail
. "$(dirname "$0")/_env.sh"

proxy_up || { echo "no kubectl proxy on http://$KUBE_CLUSTER_ADDR: run scripts/proxy.sh first" >&2; exit 1; }
echo "+ stackql-deploy build stack demo --env-file .env --show-queries $*" >&2
exec "$STACKQL_DEPLOY" build stack demo --env-file .env --show-queries "$@"
