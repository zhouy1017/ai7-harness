---
status: accepted
---

# Preserve manuscript-native history and recovery

AI7 preserves editable manuscripts as ordered stable blocks in an immutable, reconstructable revision graph, while keeping continuous Edit Journal state, meaningful Manuscript Checkpoints, and independent Recovery Snapshots as distinct records. Generated text changes remain on Proposal Branches; identical or non-interacting different-block changes may merge automatically, but different changes within one block and ambiguous structural interactions require explicit editor resolution, and apply either publishes one verified revision atomically or changes nothing. These semantics remain under an AI7-owned Manuscript History boundary exposed to Harness through narrow capabilities; legacy Python/JSON storage, linear-version, Word-frontier, proof-compatibility, and UI machinery are not inherited architecture.

> Amended by [ADR 0085](./0085-decide-a-ranged-proposal-s-conflict-by-the-words-it-replaces.md): the block rule — "different changes within one block … require explicit editor resolution" — still binds merges that compare whole versions of a block. It no longer binds a Proposal that targets an exact range inside a block (every 修改建议): such a Proposal conflicts only when a change touches the words it replaces, its target is deleted, another change overlaps it, or a structural interaction is ambiguous, and a change elsewhere in its block is a Safe Non-interacting Merge.
