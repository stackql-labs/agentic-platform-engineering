#!/usr/bin/env bash
# Converge the rule back to the declaration: the idempotent-assertion beat, and the
# recovery path that needs no agent and no approval. It is scripts/build.sh under another
# name, because it is the same operation: the createorupdate anchor runs the same REPLACE
# whether the rule is missing, drifted or already right, and the statecheck confirms the
# result. Then the rule is read back, so the room sees where it ended.
set -euo pipefail
. "$(dirname "$0")/_env.sh"

"$ROOT/scripts/build.sh" "$@"

echo >&2
echo "the rule as live, after the build:" >&2
sql "SELECT json_extract(rules, '\$[0].description') AS description,
       json_extract(rules, '\$[0].ratelimit.requests_per_period') AS threshold,
       json_extract(rules, '\$[0].ratelimit.period') AS period,
       json_extract(rules, '\$[0].enabled') AS enabled,
       last_updated
FROM cloudflare.rulesets.phases
WHERE zone_id = '$CLOUDFLARE_ZONE_ID' AND ruleset_phase = 'http_ratelimit'"
