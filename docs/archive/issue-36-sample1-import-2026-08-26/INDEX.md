# Issue #36 sample1 import lifecycle archive

| Field | Record |
| --- | --- |
| Lifecycle node | Issue #36 / PR #75 merged and closed; documentation lifecycle sweep completed 2026-08-26 |
| Archive scope | Issue #36's completed provider-free sample1 degraded-import implementation and its root routing handoff/checkpoint |
| Original path | [`HANDOFF.md`](HANDOFF.md); [`PROGRESS.md`](PROGRESS.md) |
| Final status | historical evidence |
| Reason | The implementation node is integrated at `dev`; its consumed root routing documents no longer belong in the active reading path. |
| Current replacement | [PROGRESS](../../../PROGRESS.md) and [Orca dispatch](../../agents/orca-dispatch.md) own current routing and operation. |
Original snapshot bodies are retained in Git history; current bodies are retirement pointers.

Original snapshot bodies are retained in Git history; current bodies are retirement pointers.

Snapshot bodies have been retired under [ADR 0089](../../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). Use Git history for the original wording; current operation follows [Orca dispatch](../../agents/orca-dispatch.md).
