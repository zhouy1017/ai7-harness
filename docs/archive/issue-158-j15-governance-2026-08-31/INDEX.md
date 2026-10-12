# Issue #158 J-15 governance — archive index

| Field | Record |
| --- | --- |
| Lifecycle node | Issue #158 / PR #159 integrated into `dev@20a34ce5554ae50cc662a1a2f73c5e6cefcb716a` on 2026-08-31; Issue #160 closes the consumed routing node. |
| Archive scope | The consumed Issue #158 root checkpoint and its closure-boundary handoff. |
| Original path | Root `PROGRESS.md`; root `HANDOFF.md`. |
| Final status | `PROGRESS.md` consumed historical evidence; outgoing `HANDOFF.md` retained in Git history only. |
| Reason | Issue #158 / PR #159's bounded provider-free J-15 staging governance is integrated. Its detailed working checkpoint no longer belongs in the active reading path. |
| Current replacement | [PROGRESS](../../../PROGRESS.md) and [Orca dispatch](../../agents/orca-dispatch.md) own current routing and operation. |
| Retrieval condition | Read this node only when reconstructing Issue #158 / PR #159 closure or resolving a concrete historical gap that current routing cannot answer. |

## Preserved artifact

| Archived path | Original path | Disposition |
| --- | --- | --- |
Original snapshot bodies are retained in Git history; current bodies are retirement pointers. Historical source: dev@20a34ce5554ae50cc662a1a2f73c5e6cefcb716a.

The outgoing root `HANDOFF.md` was replaced as a stable current router and was not copied into this node. Its outgoing form is retained in Git history only at `20a34ce5554ae50cc662a1a2f73c5e6cefcb716a:HANDOFF.md`.

Return to the [documentation archive index](../README.md). The archive disposition follows the [document lifecycle](../../agents/document-lifecycle.md); workflow `342459594` remains disabled and unrun, and no Provider action is implied.

Snapshot bodies have been retired under [ADR 0089](../../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). Use Git history for the original wording; current operation follows [Orca dispatch](../../agents/orca-dispatch.md).
