-- A plausible write that is not the declaration: same resource, same zone, but a
-- threshold of 1000 instead of the declared 100. The policy declines it before it
-- reaches the server or a human: `npm run probe -- ../scripts/denied.sql`
REPLACE cloudflare.rulesets.phases
SET rules = '[
  {
    "action": "block",
    "description": "edge-estate rate limit (managed by stackql-deploy)",
    "enabled": true,
    "expression": "(starts_with(http.request.uri.path, \\"/\\"))",
    "ratelimit": {
      "characteristics": ["ip.src", "cf.colo.id"],
      "period": 10,
      "requests_per_period": 1000,
      "mitigation_timeout": 10
    }
  }
]'
WHERE zone_id       = '{{ zone_id }}'
  AND ruleset_phase = 'http_ratelimit'
