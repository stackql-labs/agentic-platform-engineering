#!/usr/bin/env bash
# Converge the estate back to the manifest. The checkout statecheck compares the
# image, so a build after scripts/perturb.sh runs the update anchor and restores
# it. This is the idempotent-assertion beat: no state file, the manifest is
# asserted against the live API.
set -euo pipefail
cd "$(dirname "$0")/.."
exec stackql-deploy build stack demo --env-file .env --show-queries "$@"
