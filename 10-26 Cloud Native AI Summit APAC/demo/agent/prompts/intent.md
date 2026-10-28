Scheduled drift review of the `{{ namespace }}` namespace on the cluster reached at
`cluster_addr = '{{ cluster_addr }}'`, `protocol = '{{ protocol }}'`, through the `k8s` provider.

Declared intent for this namespace, from the stack manifest the platform team maintains. This is
what should be:

{{ declared_table }}

Every resource the stack created carries the label `{{ demo_label_key }}={{ demo_label_value }}`.

Intent: compare what is running with what is declared, decide what to do about each difference,
and act only where the platform lets you.

For each declared deployment read the live spec and status (desired and ready replicas, the
container image), its pods (phase, container waiting reason, restart count) and the Warning events
in the namespace. Then classify it:

- converged: live matches declared and it is fully ready. Nothing to do.
- drifted, healthy: live differs from declared (for example a different replica count) but the
  deployment is fully ready. Someone changed it on purpose or by hand. Do not change it. Escalate:
  report the difference, the likely reason, and the two ways to resolve it (change the
  declaration, or converge back to it).
- drifted or unhealthy: not fully ready, pods waiting or restarting, Warning events. Find the cause
  from the events and the pod status, not by inference. If the cause is an image that cannot be
  pulled, confirm it against the upstream project: query the releases of the GitHub repository in
  the declared table and say whether a release matching that tag exists. Then discover the write
  contract (`list_methods` and `describe_method` on `k8s.apps.deployments`) and write the single
  statement that restores the declared value, pinned to `name`, `namespace`, `cluster_addr` and
  `protocol`. Attempt it once with `run_mutation_query`. The platform decides whether it runs;
  report what happened: executed, refused by the server mode, or declined by the operator.

Decide, do not just detect: every row of your status table ends with one of remediate, escalate or
accept, and one line of why.

Scope and guardrails: this namespace only. Only SELECTs for diagnosis. One write at most, the one
you reported, and only after its contract has been discovered. Nothing without the label.
