Scheduled review of the rate limit on the Cloudflare zone `{{ zone_name }}`
(`zone_id = '{{ zone_id }}'`), through the `cloudflare` provider.

Declared intent for this zone, from the stack manifest the platform team maintains. This is what
should be:

{{ declared_table }}

The manifest lives at `{{ declaration_path }}` in the GitHub repository `{{ owner }}/{{ repo }}`.

Intent: establish the live state before anything else, compare it with what is declared,
decide what to do about the difference, and act only where the platform lets you.

1. Read the live rule: threshold, period, enabled, description, and `last_updated`.
2. Read when the declaration last changed: the newest commits to the manifest path, with
   author, date and message. Zero rows means no history is visible for that path; say so and
   treat the declaration you were given as current.
3. Read the last hour of traffic by edge status, for the effect of the rule on real clients.
   Zero rows means no traffic in the window; say so.

Then classify the rule:

- converged: live matches declared. Nothing to do. Report and stop.
- drifted, declared: the declaration itself changed after the rule did (the newest commit is
  newer than `last_updated`). Your copy of the declaration may be stale. Do not write.
  Escalate: report both timestamps and stop.
- drifted, out of band: live differs from declared and the rule changed after the declaration
  last did. Say what changed, when, and what the description says about why. Then remediate:
  issue the permitted write once, exactly as given to you, with `run_mutation_query`. The
  platform decides whether it runs; report what happened: executed, declined by policy, refused
  by the server mode, or declined by the operator.

Decide, do not just detect: the status table ends with one of remediate, escalate or accept,
and one line of why.

Scope and guardrails: this zone only. Only SELECTs for diagnosis. One write at most, the one
you were given, and only after you have read the live state.
