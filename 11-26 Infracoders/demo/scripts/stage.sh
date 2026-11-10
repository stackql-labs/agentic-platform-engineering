#!/usr/bin/env bash
# Put the estate where the talk starts, from wherever it was left:
#   declared   syd 1.5.0 (the canary, already promoted), pdx 1.4.0, fra 1.4.0
#   live       syd and pdx built to that; fra removed, so it can be built on stage
#   drift      deletion protection switched off on syd's table, outside the declaration
# Run it at least ten minutes before the talk: CloudTrail takes a few minutes to show
# the drift, and the agent looks there for who made it.
#   scripts/stage.sh            the above
#   scripts/stage.sh --keep-fra leave fra built (skip the live build beat)
set -euo pipefail
. "$(dirname "$0")/_env.sh"

release() { sed -i -E "s/^CELL_RELEASE=.*/CELL_RELEASE=$2/" "cells/$1.env"; }
release syd 1.5.0
release pdx 1.4.0
release fra 1.4.0

quiet() { "$@" 2>&1 | grep -E 'does not exist|creating \[|updating \[|deleting \[|complete|failed|ERROR' | sed -E 's/^\[[^]]*\] //' || true; }

echo "== syd: converge to the declaration (1.5.0)" >&2; quiet scripts/build.sh syd
echo "== pdx: converge to the declaration (1.4.0)" >&2; quiet scripts/build.sh pdx
if [ "${1:-}" = "--keep-fra" ]; then
  echo "== fra: converge to the declaration (1.4.0)" >&2; quiet scripts/build.sh fra
else
  echo "== fra: remove, to be built on stage" >&2; quiet scripts/teardown.sh fra
fi
echo "== syd: the out-of-band change" >&2; scripts/drift.sh syd 2>&1 | tail -1 >&2
echo >&2
scripts/board.sh
echo >&2
echo "staged at $(date '+%H:%M:%S'). CloudTrail will show the drift in a few minutes." >&2
