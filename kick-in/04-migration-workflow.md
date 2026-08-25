# Migration and project workflow

Status: **current compact router; the full historical sequence is archived and is not an implementation plan**

The original phase-by-phase document mixed still-useful migration direction with verification programmes and implementation prerequisites later superseded by ADR 0027. Its captured form is preserved in the [agent-guidance baseline archive](../docs/archive/agent-guidance-baseline-2026-08-25/migration-workflow-before-compaction.md). Do not recover requirements from that snapshot unless a current authority record explicitly re-admits them.

## Current boundary

- The design interview is complete and the repository remains documentation-only.
- `main` is the only canonical line. The `design-doc` aggregate and its V2 architecture/UI packages do not supply implementation authority by themselves.
- Before implementation begins, the owner must accept the intended design path, the Commander must integrate it through the normal pull-request path, and the owner must separately authorize implementation planning.
- No dependency installation, product scaffold, predecessor asset copy, Plugin discovery, data migration, or release follows from this router.

## Direction after authorization

This is a sequence, not a set of independent gates:

1. **Promote the exact accepted baseline.** Update canonical ADRs, contexts, Policy Documents, product constraints, supported journeys, and current UI/architecture routing. Candidate or historical documents remain labeled and cannot silently fill gaps.
2. **Bootstrap through the first vertical outcome.** Apply the [Source Checkout Buildability Contract](../docs/agents/source-checkout-buildability.md) on every declared Windows/macOS development host while implementing the first thinnest runnable end-to-end outcome. Use one documented root command surface, regular tracked inputs, immutable declared dependencies, and reconstructable dependency stores; never depend on predecessor/sibling checkouts, personal paths, ambient or untracked payloads, pre-generated output, private material, product/provider/signing credentials, or CI-image-only state. Approved registries and immutable artifact sources may be used during exact dependency restoration before the product E2E no-network interval. Launch the same production-shaped non-provider renderer/main/service/Harness/domain topology as normal local use, differing only by the deterministic model fixture, isolated data root, disabled outbound network, and non-substituting test hooks. This setup belongs to the existing E2E Functional Gate and creates no separate build, package, or reproducibility gate. Do not build empty packages or a horizontal architecture skeleton before the outcome.
3. **Deliver further vertical journeys incrementally.** Implement one complete user-visible outcome at a time across the real product path. Once a responsibility exists, follow the [incremental development lifecycle](../docs/agents/incremental-development.md) and its reuse-before-new-code ladder. Do not create layer-porting issues, parallel authorities, a second loop, or speculative infrastructure.
4. **Expand capabilities only for admitted outcomes.** Add skills, providers, native adapters, dependencies, and platform mechanics only through a bounded Change Brief and the applicable authority decision.
5. **Package accepted source.** Windows and macOS share product outcomes while native mechanics may differ explicitly. Packaging or release automation creates no additional engineering proof gate.

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
