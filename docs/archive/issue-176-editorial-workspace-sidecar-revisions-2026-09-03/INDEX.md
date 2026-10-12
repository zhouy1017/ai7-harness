# Issue #176 editorial-workspace sidecar revisions — 2026-09-03

| Field | Record |
| --- | --- |
| Lifecycle node | Issue #176 / PR #177 integrated the immutable editorial-workspace authority sidecar successor into exact `dev@7dec919ecb8a37d34dc8e450d52d7d2708d43726` from head `c21428bb7534865ea4069863e3ccd80150fa2a02` after Gate run `33692616156` passed J-01, J-02, J-08, J-12, and J-15 on Windows and macOS. |
| Archive scope | The outgoing root checkpoint for the Issue #176 rebase, overlap preservation, review repairs, exact-head Windows completion, paired Gate, and integration. |
| Original path | `PROGRESS.md` |
| Final status | consumed |
| Reason | Stable sidecar, migration, pin, presentation, and Journey behavior is now owned by the integrated implementation and current documentation; the implementation checkpoint no longer belongs in the active root reading path. |
| Current replacement | [PROGRESS](../../../PROGRESS.md) and [Orca dispatch](../../agents/orca-dispatch.md) own current routing and operation. |
| Retrieval condition | Read only when auditing Issue #176's predecessor migration, immutable sidecar/pin semantics, review repairs, overlap preservation, local completion, or paired Gate evidence. |

The outgoing root `HANDOFF.md` is retained in Git history only. No database, build log, E2E stream, screenshot, trace, video, manuscript/source payload, credential material, Provider payload, fixture, workflow artifact, or other protected material entered this archive.

Snapshot bodies have been retired under [ADR 0089](../../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). Use Git history for the original wording; current operation follows [Orca dispatch](../../agents/orca-dispatch.md).
