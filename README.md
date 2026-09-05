# YaRoute

YaRoute is the runtime and coordination layer for the broader Nyx/Yaro system.

The project is being built around explicit workflows, reusable skills, verifiable state transitions, and a clear separation between governance, operational knowledge, and mutable runtime state.

## Current direction

YaRoute is moving toward a workflow-first execution model:

- **Areas** expose runnable work through their `Scheduled` layer.
- **Scheduler** scans Areas, determines which scheduled workflow instances are eligible, and dispatches them.
- **Workflows** own execution order, recovery, and completion semantics.
- **Tasks** are lower-level units used by workflows.
- **Skills** are reusable capabilities that workflows and tasks can invoke.
- **State and evidence** are recorded separately from stable system definitions.

The intended scheduling relationship is:

```text
Areas
  -> Scheduled
      -> workflow_id
          -> Workflows
              -> Tasks / Skills / Working Sources
                  -> state + evidence
```

A schedule is only a trigger. The referenced workflow remains responsible for how work is performed, retried, verified, and escalated.

## Design principles

- User remains the root authority.
- Deterministic checks should happen before expensive AI analysis.
- Prefer: detect change -> index/map changed scope -> analyze only the delta -> dispatch explicit workflows.
- Retryable unmet conditions remain waiting/retry state instead of silently disappearing.
- Mutating workflows require evidence and readback before being reported as successful.
- Core generation and canonicalization stay explicit lifecycle boundaries rather than silent background actions.
- Secrets and reusable credentials must not be stored in repository content.

## Repository status

This repository is still being initialized. The current canonical Yaro Head has **not** yet been migrated here. Before that happens, Head will be audited and sanitized so that personal, sensitive, runtime-only, and otherwise non-repository-safe material is removed or relocated.

The repository will then become the readable source tree for the executable and reusable YaRoute/Yaro system rather than merely storing generated ZIP bundles.

## Near-term work

1. Finalize the Scheduler v002 contract around Area `Scheduled` entries and workflow dispatch.
2. Define workflow, scheduler-state, retry, lock, and evidence schemas.
3. Add deterministic source-change and index/map maintenance workflows.
4. Sanitize and unpack the canonical Head before migration into Git.
5. Add tests and verification around lifecycle and workflow execution.

---

This README is an early project description and will evolve with the canonical system definitions.
