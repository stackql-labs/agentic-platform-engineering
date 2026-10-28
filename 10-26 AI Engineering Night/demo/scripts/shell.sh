#!/usr/bin/env bash
# Render scripts/shell.iql with the values from .env into runs/shell.iql, for pasting
# into `stackql shell` (with --approot only if .env sets one). The traffic window is the last hour.
set -euo pipefail
. "$(dirname "$0")/_env.sh"

owner="${DECLARATION_REPO%%/*}"
repo="${DECLARATION_REPO##*/}"
since="$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)"
until="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p runs
sed -e "s|{{ zone_id }}|$CLOUDFLARE_ZONE_ID|g" \
    -e "s|{{ owner }}|$owner|g" \
    -e "s|{{ repo }}|$repo|g" \
    -e "s|{{ path }}|$DECLARATION_PATH|g" \
    -e "s|{{ since }}|$since|g" \
    -e "s|{{ until }}|$until|g" \
    scripts/shell.iql > runs/shell.iql
echo "rendered runs/shell.iql; paste from it into: $STACKQL_SHELL" >&2
