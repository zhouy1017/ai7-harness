---
status: accepted-candidate
---

# Represent editor-directed Run rewind as an append-only attempt branch

AI7 provides `回退并调整方向` as an editor-facing workflow over the existing Run causal model, not as destructive rollback. The editor selects an eligible business milestone backed by a safe continuation boundary, reviews current authority, later history, and non-reversible Effects, then supplies a revised direction. If the direction remains an allowed Plan Adaptation and exact pins still hold, AI7 appends a linked Retry attempt branch inside the same unchanged Run; later events and candidates remain replayable as superseded. If semantics or the Plan Envelope materially change, AI7 creates a Plan Revision and routes through a newly authorized Redo Run. Rewind never erases ledger history, executes from stale authority, or reverses a committed Effect.

## Considered options

- Truncating all history after the selected point was rejected because it destroys auditability, obscures causal evidence, and falsely suggests that committed Effects never occurred.
- Exposing arbitrary messages, tool calls, or Harness checkpoints as rewind targets was rejected because editors need meaningful business milestones and cannot judge technical continuation safety.
- Always creating a new Run was rejected because an in-envelope change of direction can remain one coherent authorized Run and benefits from an exact linked attempt history.
- Treating Rewind as ordinary Resume or Retry without a distinct interaction was rejected because the editor deliberately selects an earlier point and supplies a changed direction whose impact must be previewed.

## Consequences

AI7 must project verified safe continuation boundaries as editor-readable Rewind Points, retain superseded attempt branches, revalidate current authoritative state, and explain committed or ambiguous Effects before dispatch. In-envelope Rewind remains linked to the same Run; material change incurs Plan Revision, renewed authorization, and Redo. The UI gains a more capable direction-control mechanism at the cost of a branched causal presentation and explicit impact review.
