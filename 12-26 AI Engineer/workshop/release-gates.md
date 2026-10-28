# Public release and delivery gates

## Repository release

- [ ] Run secret/private-data scans on the full checked-out tree and all available Git history; do not publish if an owner remediation is needed.
- [ ] Verify provenance and third-party notices for reused material/dependencies.
- [ ] Confirm MIT license, synthetic data, no customer names, private emails, account IDs, endpoint URLs, or credentials.
- [ ] Confirm `.env.example` contains placeholders only; never add real `.env`.
- [ ] Pass both languages' offline shared-contract tests, type checks, and container build/runtime smoke in CI without production secrets or paid calls.
- [ ] Validate slide links, timing totals, terms, and scenario outputs; test 16:9 export if the selected slide tooling is added.
- [ ] Keep any background CronJob disabled and do not claim a live run, recording, sponsor approval, credits, publication, or deployment without evidence.

## Live event/workshop gates

- [ ] Verify the exact GPT-6-family model ID is available to the supplied account, with tool compatibility, spend limits, and rate limits.
- [ ] Validate separate read-only and narrowly scoped mutation identities in an approved disposable environment.
- [ ] Integrate authenticated operator approval bound to the exact plan, target, identity, evidence version, and expiry.
- [ ] Implement atomic version preconditions where supported; document any residual time-of-check/time-of-use race.
- [ ] Verify output bounds, time bounds, API failure paths, no blind retries, structured audit, retention, subprocess cleanup, and reset ownership.
- [ ] Complete the 32-environment workshop capacity test, spare and second-region plan, and fast reset/teardown rehearsal.
- [ ] Complete and validate live equivalents for FinOps, SRE, CSPM, and access review.
- [ ] Confirm sponsor status, participant provisioning, credits, privacy, support, and fallback with organizers; no personal contact details in public docs.

**Status at preparation:** The offline fixture implementation is the only path exercised. Live API access, isolated Kubernetes path, authenticated approval, durable audit, hosted workshop environments, and all four live tracks remain release blockers.
