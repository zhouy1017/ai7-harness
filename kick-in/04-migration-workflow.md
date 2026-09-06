# Migration and project workflow

Status: **current compact router; the full historical sequence is archived and is not an implementation plan**

The original phase-by-phase document mixed still-useful migration direction with verification programmes and implementation prerequisites later superseded by ADR 0027. Its captured form remains source-qualified Git-history evidence at `design-doc@6895f02:docs/archive/agent-guidance-baseline-2026-08-25/migration-workflow-before-compaction.md`; the excluded archive tree is not an active route. Do not recover requirements from that snapshot unless a current authority record explicitly re-admits them.

## Current boundary

- The design interview is complete, the frozen design references are the accepted baseline, and implementation is under way on `dev`.
- The current delivery order is [`docs/development/development-plan.md`](../docs/development/development-plan.md) under [ADR 0064](../docs/adr/0064-reweight-repository-development-toward-value-first-delivery.md); this router no longer sequences work.
- No dependency installation, predecessor asset copy, Plugin discovery, data migration, or release follows from this router.

## Work-item shape

Every implementation Issue uses the one-page [Change Brief](../docs/agents/change-brief.md) and names:

- one user-visible outcome or observed defect;
- exact accepted design and action authority;
- the current owner/reuse seam, or an authorized first-owner bootstrap;
- structural budget and explicit non-goals;
- data, authority, privacy, Effect, migration, and platform consequences;
- any root-command, declared-host-tool, immutable-dependency, generated-input, or launch-contract consequence;
- applicable supported journey or bug regression; and
- stop conditions plus cleanup/archive disposition.

Layer-only rewrites and wholesale predecessor migration are not admissible outcomes.

## Validation

The only standing automated engineering surface is the provider-free [E2E Functional Gate](../docs/agents/ci-test-boundaries.md) on Windows and macOS. Each platform subject is constructed from a fresh checkout through the documented bootstrap/build/launch path before the product's no-network execution interval. That setup has no independent pass/fail record. Historical Test Catalogs, tiered workflows, live-provider/replay proof, request fingerprints, exact-head review, package/signing proof, performance gates, or separate editor/platform/build/reproducibility gates are not current requirements.

## Development roles and records

Repository work follows [Repository Development Dispatch](./27-repository-development-dispatch.md), [Git conventions](../docs/agents/git-conventions.md), and the [document lifecycle](../docs/agents/document-lifecycle.md). `PROGRESS.md` holds the current status and next slice; consumed plans and handoffs leave the active path at lifecycle nodes.
