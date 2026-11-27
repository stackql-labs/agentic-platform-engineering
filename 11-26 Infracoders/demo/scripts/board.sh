#!/usr/bin/env bash
# The rollout board: what every cell is running and whether its table is protected, read
# live. One statement, three regions, two services, no state file. The same statement is
# in scripts/shell.iql for pasting into `stackql shell`.
set -euo pipefail
. "$(dirname "$0")/_env.sh"

regions="$(for c in $CELLS; do sed -nE 's/^CELL_REGION=//p' "cells/$c.env"; done | sed "s/.*/'&'/" | paste -sd, - | sed 's/,/, /g')"

echo "declared (cells/*.env):" >&2
for c in $CELLS; do
  ( . "cells/$c.env"; printf '  %-4s %-15s wave %s  release %s\n' "$c" "$CELL_REGION" "$CELL_WAVE" "$CELL_RELEASE" >&2 )
done
echo >&2
echo "live:" >&2
sql "SELECT r.region, r.value AS running, r.version AS changes, datetime(r.last_modified_date, 'unixepoch') AS changed_utc, t.table_status, t.deletion_protection_enabled AS deletion_protection
FROM aws.ssm.parameters_by_paths r
INNER JOIN aws.dynamodb.tables t ON r.region = t.region
WHERE r.region IN ($regions) AND r.Path = '/$SERVICE'
  AND t.region IN ($regions) AND t.TableName = '$SERVICE'
ORDER BY r.region"
