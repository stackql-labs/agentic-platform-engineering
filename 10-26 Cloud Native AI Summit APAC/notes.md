# What IaC Was Built For

Four assumptions, all reasonable in 2015.

Humans authored the changes.
Changes happened at human timescales, which is to say minutes to days.
One writer per environment, enforced by review and state locking.
And drift was an exception, something you fixed and then went back to the steady state.

These assumptions held for a decade.

# AI Changes Everything

Every one of those assumptions inverts under agents.

Agents and humans both author changes.
Changes happen at machine speed, dozens per minute.
Multiple writers operate at the same time without coordinating.
And drift is no longer the exception; it is the default state of the system.

The model we had is now broken.

# Drift Isn't an Error, It's a Signal

Drift was a binary alarm.

It went off occasionally, someone reconciled it, and you went back to flat.

In 2026, drift is a continuous waveform.

It is the signal of what your system is actually doing.

Treating it as an error to suppress means missing the only telemetry you have.

decide, don't just detect

2015 drift  ->  log it, page someone
2026 drift  ->  it's the default state, so the agent must decide:
                auto-remediate / escalate / accept

# Where the Model Strains

Four specific places the model breaks.

Single-writer state.
Plan and apply expecting a human.
Opinionated abstractions.
And the control plane / data plane split.

Let me take each one briefly.

# 01 - Single-Writer State

The state file is a cache of what one tool did.

It is intent, not reality.

If a human, an agent, all touch the same resource, the state file is wrong within seconds.

The fix is not better locking.

The fix is recognising the state file is not the source of truth - the cloud is.

# 02 - Plan and Apply Expects a Human

The review cycle is doing the safety work.

A human looks at the plan, recognises something is off, and stops the apply.

Agents do not stop. They proceed.

So whatever safety we got from review has to move somewhere agents can use it, which means policy and assertion, not human inspection.

# 03 - Opinionated Abstractions

Each IaC tool implements its own DSL,

its own resource model,

its own ecosystem.

That is fine for humans, who learn one and stay there.

For an agent, every abstraction is a new surface to plan against and a new place to be wrong.

What helped humans does not always help agents.

# 04 - Plane-Bounded

IaC tools were built for the control plane.

Data plane operations - queries, grants, table-level access - lived in different tools.

Agents need to traverse both in a single decision.

The split is becoming a constraint, and the underlying APIs are already converging.

# So, Where to From Here?

So the 2015 model breaks in 2026. The question is what replaces it.

# IaC in the Agent Era

The reframe is small but consequential.

# The New Contract

Infrastructure-as-Code:intent lived in the code.

Infrastructure-as-Context: agents query it, the reality is data.

The deliverable changes from a file you wrote to a queryable view agents reason about. Code does not disappear. It just stops being the contract.

# What's Working Now

Several patterns are holding up in the agent era.

None of these are new ideas in isolation.

Applied together, they become the contract.

# 01 - Query Before Mutation

Inspect reality before acting. Not the state file.

The API. Every decision an agent makes should be grounded in what is actually there right now, not what some cache says was there ten minutes ago.

This is the cheapest pattern to adopt and the one that prevents the most damage.

# 02 - Idempotent Assertions

Declare what should be, not how to get there.

Retries are safe because the engine handles the diff.

Agents retry, parallelise, and resume from partial failures by default.

If your interface assumes a single clean execution, agents will break it.

If your interface assumes assertions, they will not.

# 03 - Bi-Temporal View

Three views, kept separate.

What is, observed now.
What was, the trail of observations.
What should be, the declared intent.

Most tools collapse these into one state file and lose the history.

Keep them separate and drift stops being an alarm and starts being diagnosable.

# 04 - Agents as Event Sources

Every mutation, by any author, becomes an event.

The audit log is not a separate compliance artefact bolted on after the fact. It is the substrate.

Replay, metrics, reconciliation all read from the same log.

Agents do not need a special audit story if they are event sources by default.

What happened and why give us "Intent provenance"

# 05 - Universal Interfaces

One query shape across providers.

Agents that have to learn a different SDK for every cloud spend most of their tokens on plumbing.

A single interface collapses that.

The provider-specific surface is still there underneath; it just stops being the agent's problem to model.

# 06 - Policy Gates Replace Review Cycles

Human review was the safety loop. Agents bypass it by design, so something has to replace it.
Policy gates are that replacement - declarative rules the agent evaluates against its own intent before acting.
Four constraint categories: spend, geography, change velocity, resource count. Together they bound what an agent can do by accident.
Policy is not a compliance layer bolted on after the fact. In the agent era it is the safety loop.
