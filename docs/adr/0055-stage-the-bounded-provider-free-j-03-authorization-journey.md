---
status: accepted
---

# Stage the bounded provider-free J-03 authorization journey

On 2026-08-31 the Owner selected Issue #47's first bounded standard-direct authorization slice as a supported Journey decision in the one logical provider-free E2E Functional Gate. This decision satisfies [ADR 0051](./0051-admit-j-12-as-the-fourth-supported-e2e-journey.md)'s requirement for an explicit later-Journey routing decision. [ADR 0056](./0056-stage-the-bounded-provider-free-j-15-artifact-lifecycle-journey.md) subsequently admits Issue #88's bounded J-15 slice ahead of J-03. Together they record decision and dependency order, not a permanent Journey count.

## Bounded J-03 meaning

Issue #47 will implement only the first provider-free J-03 slice. It begins from the exact Book, primary Manuscript and Manuscript Revision lineage imported from the [`sample1` compatibility baseline](./0044-use-sample1-as-compatibility-and-recording-baseline.md), and it binds the exact Book-scoped enabled `@ai7/editorial-workspace-profile@1.0.0` revision plus its separately governed AI7 compatibility/authority sidecar state supplied by Issue #88. It persists the exact Task Intent; `Task Input / 任务输入` Manuscript Checkpoint and task-bound pins; current-Book source scope; Model Role and capability requirements; Provider/outbound-data and budget disclosure; explicit Run Budget Ceiling state; Execution Plan/Plan Envelope; and standard direct Run Authorization.

That slice then stops truthfully before scheduler dispatch, DSH Session creation, Provider adapter or Credential Broker resolution, Provider payload construction, network access, model execution, or any Effect. Provider Processing v1 remains selected and permits no live transmission. Durable authorization is neither Provider eligibility nor execution success; Issue #91 remains the sole owner of those execution boundaries. Quick Start and Default Execution Rule behavior remain deferred to a separately authorized successor.

## Dependency order

Issue #88 integrates before Issue #47 under ADR 0056's accepted J-15 routing. Issue #47 then rebases onto the resulting `dev` and consumes Issue #88's exact artifact revision and sidecar state; it does not invent a substitute artifact, bypass scoped enablement, or absorb J-15 product work.

## Staged executable cutover

The current executable admitted set and `e2e:all` remain J-01, J-02, J-08 and J-12. Issue #88 must atomically add real J-15 to that set while J-03 remains non-executable. Issue #47 later atomically adds real J-03 to the resulting set.

Following Issue #133 / PR #134's staged J-12 precedent, the existing disabled workflow displays dormant J-15 after J-12 and dormant J-03 after J-15 before their runners exist. Exact workflow `E2E Functional Gate` (ID `342459594`) remains `disabled_manually` and may not be enabled, dispatched, run, rerun or probed under this decision. Neither dormant projection is a placeholder runner, result, skip or completion claim.

Issue #47 must add the real J-03 dispatcher and runner and atomically add J-03 to the then-current local `e2e:all` orchestration. From that cutover onward, Local completion, any applicable Hosted Gate occurrence and post-boundary re-entry execute every then-current real admitted Journey, including J-03. This ADR fixes no unconditional total count. No alias, fake success, retrospective result or skipped J-03 completion may bridge the cutover.

## Preserved boundaries

This decision amends only the hard-coded four-Journey routing clauses of [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md), [ADR 0049](./0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md), [ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md) and [ADR 0054](./0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md), plus their current runbook projections. It preserves one logical Gate, provider-free execution, identical Windows/macOS Journey meaning, complete-diff Markdown routing, Draft and Ready behavior, failure semantics, CI-degraded activation and evidence meaning, and ADR 0054's macOS deferral and re-entry timing.

This ADR creates no product implementation, runner, dependency, schema, credential operation, Provider call, manuscript payload, Effect, workflow restoration, release, publication or `main` authority. Any later Journey admission still requires its own explicit Owner routing decision and separate CI-governance integration.

## Rollback and stop boundary

Before Issue #47, rollback reverts this governance admission and dormant projection without data migration or product cleanup. Stop if J-03 cannot remain provider-free and standard-direct-only; if Issue #88 cannot precede Issue #47 under ADR 0056; if the slice cannot stop before every Issue #91-owned execution boundary under Provider Processing v1; or if executable cutover would require a placeholder, skipped Journey or fixed total that is not true of then-current `dev`.

[ADR 0057](./0057-restore-hosted-gate-under-observed-actions-usage.md) later restores the active workflow before Issue #47 and therefore removes dormant J-03 from its executable job. J-03 remains admitted but non-executable; Issue #47 still owns the one atomic runner, dispatcher, local-orchestration, and hosted-workflow cutover required by this ADR.
