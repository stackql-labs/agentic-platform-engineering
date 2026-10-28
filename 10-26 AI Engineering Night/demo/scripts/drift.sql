-- The 3am change. Someone saw a burst of bot traffic, tightened the rule in the
-- dashboard from 100 to 5 requests per 10 s per IP, left a note in the description,
-- and went back to bed. Every page load with more than five assets now gets a 429.
-- Same REPLACE shape as the declaration; the difference is it never went through it.
REPLACE cloudflare.rulesets.phases
SET rules = '[
  {
    "action": "block",
    "description": "TEMP bot scare 03:12 - put back later",
    "enabled": true,
    "expression": "(starts_with(http.request.uri.path, \\"/\\"))",
    "ratelimit": {
      "characteristics": ["ip.src", "cf.colo.id"],
      "period": 10,
      "requests_per_period": 5,
      "mitigation_timeout": 10
    }
  }
]'
WHERE zone_id       = '{{ zone_id }}'
  AND ruleset_phase = 'http_ratelimit';
