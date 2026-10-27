#!/usr/bin/env bash
# Converge the estate back to the declaration: the idempotent-assertion beat. The
# statecheck on each deployment compares replicas and image, so after scripts/drift.sh
# both update anchors run and the estate ends where the manifest says, however it got
# there. It is scripts/build.sh under another name, because it is the same operation.
set -euo pipefail
exec "$(dirname "$0")/build.sh" "$@"
