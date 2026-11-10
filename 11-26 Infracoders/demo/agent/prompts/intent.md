Rollout of `{{ service }}` release {{ candidate }}, replacing {{ previous }}.

The cells, from the declaration the platform team maintains (`cells/*.env`). This is what
should be:

{{ declared_table }}

A cell is healthy when it serves its declared release and its orders table is ACTIVE with
deletion protection on. A cell marked "not built yet" does not exist: the rollout board leaves
it out, so do not query it, and say in the report that it is not built. Its turn comes with
its wave.

Intent: move release {{ candidate }} forward by one wave, if and only if the waves already on
it are healthy.

1. Read the rollout board: what every cell is serving and the state of its table, live.
2. Compare live with declared, cell by cell.
3. If a cell that is already on {{ candidate }} is not healthy, do not promote past it. Find
   out what changed on that cell and when (the CloudTrail statement, that cell's region). Then
   put the cell back with `cell_converge`, giving the evidence as the reason.
4. When every cell already on {{ candidate }} is healthy, promote the next wave: each cell in
   the lowest wave still on {{ previous }}, with `cell_promote`.
5. Read the board again and report.

Scope and guardrails: these cells only. SELECTs for diagnosis. One wave per run; the wave after
it waits for the next run. Changes only through the platform's tools, and only after you have
read the live state.
