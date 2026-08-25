# Migration and project workflow

Status: **current compact router; the full historical sequence is archived and is not an implementation plan**

The original phase-by-phase document mixed still-useful migration direction with verification programmes and implementation prerequisites later superseded by ADR 0027. Its captured form remains source-qualified Git-history evidence at `design-doc@6895f02:docs/archive/agent-guidance-baseline-2026-08-25/migration-workflow-before-compaction.md`; the excluded archive tree is not an active route. Do not recover requirements from that snapshot unless a current authority record explicitly re-admits them.

## Current boundary

- The design interview is complete and the normalized V2 package is the accepted implementation-facing design baseline on `dev`; at this baseline node the repository remains documentation-only.
- During development, `dev` is the long-lived integration line. `main` is the protected stable/release-promotion line and advances only through a separate exact Owner authorization. The frozen `design-doc` aggregate supplies allowlist provenance only.
- The Owner has separately authorized the sequenced policy-baseline, implementation-planning, and bounded provider-free J-01 new-Book tracer work. Each step still needs its exact Issue, complete Change Brief, Worker branch/worktree, and Commander integration.
- No dependency installation, product scaffold, predecessor asset copy, Plugin discovery, data migration, or release follows from this router.

## Current authorized direction

This is a sequence, not a set of independent gates:

1. **Keep the exact promoted baseline.** Issue #20 establishes current ADRs, contexts, product constraints, V2 UI/architecture routing, and the source/disposition manifest on `dev`. Candidate or historical documents remain qualified and cannot silently fill gaps.
2. **Land the two minimum policy baselines.** A separately bounded Issue creates versioned Provider Processing and External Export policies before any provider/model transmission or export implementation.
3. **Plan and bootstrap through the bounded tracer.** Apply the [Source Checkout Buildability Contract](../docs/agents/source-checkout-buildability.md) on every declared Windows/macOS development host while delivering the public-synthetic, provider-free J-01 new-Book happy path. Use one documented root command surface, regular tracked inputs, immutable declared dependencies, reconstructable dependency stores, and the production-shaped renderer/main/service/Harness/domain topology. Never depend on predecessor/sibling checkouts, personal paths, ambient payloads, private material, credentials, pre-generated output, or CI-image-only state. The tracer ends at a bounded manuscript window and confirmed durable Edit Journal and does not claim complete J-01.
4. **Deliver further vertical journeys incrementally.** Implement one complete user-visible outcome at a time across the real product path. Once a responsibility exists, follow the [incremental development lifecycle](../docs/agents/incremental-development.md) and its reuse-before-new-code ladder. Do not create layer-porting issues, parallel authorities, a second loop, or speculative infrastructure.
5. **Expand capabilities or package only for admitted outcomes.** Skills, providers, native adapters, dependencies, platform mechanics, packaging, and release work each need a bounded Change Brief and applicable authority. Windows and macOS share product outcomes while native mechanics may differ explicitly; packaging creates no additional proof gate.

## Work-item shape

Every implementation Issue uses the [Change Brief](../docs/agents/change-brief.md) and names:

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

Repository work follows [Repository Development Dispatch](./27-repository-development-dispatch.md), [Git conventions](../docs/agents/git-conventions.md), and the [document lifecycle](../docs/agents/document-lifecycle.md). `PROGRESS.md` holds only the current checkpoint; consumed plans and handoffs leave the active path at lifecycle nodes.
