Scheduled health check of the `{{ namespace }}` namespace on the cluster reached at
`cluster_addr = '{{ cluster_addr }}'`, `protocol = '{{ protocol }}'`, through the `k8s` provider.

Intent: establish whether every deployment in the namespace is healthy, and if one is not, find the
most likely cause and the single StackQL statement that would fix it.

What healthy means here: desired replicas equal ready replicas, no pod waiting (ImagePullBackOff,
ErrImagePull, CrashLoopBackOff, Pending), no Warning events in the last few minutes for the
deployment's pods. Read the deployments, the pods (phase, container state, restart count) and the
Warning events. Prefer the event message over inference when deciding the cause.

If a deployment is unhealthy:

- name the deployment, the pod and the cause, with the evidence (the event message, the waiting
  reason, the image or value involved);
- discover the write contract for the fix (`list_methods` and `describe_method` on the resource you
  would change) and write the exact single statement, pinned to `name`, `namespace`, `cluster_addr`
  and `protocol`;
- then attempt it once with `run_mutation_query`. The platform decides whether it runs. Report what
  happened: executed, refused by the server mode, or declined by the operator.

If every deployment is healthy, say so with the numbers and propose nothing.

Scope and guardrails: this namespace only. Every resource the stack created carries the label
`{{ demo_label_key }}={{ demo_label_value }}`; do not propose a change to anything without it.
Only SELECTs for diagnosis. One write at most, the one you reported, and only after the contract
has been discovered.
