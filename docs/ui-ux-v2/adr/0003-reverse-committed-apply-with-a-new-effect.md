---
status: accepted
---

# Reverse a committed manuscript Apply with a new governed Effect

AI7 never erases or mutates a committed Apply Effect Receipt to represent undo. `准备撤销本次应用` compares the inverse of the original Apply with the current authoritative Manuscript, handles interacting later edits through exact conflict or Correction Proposal, and—when valid—creates a new Reverse Apply Effect with its own target, payload, approval, atomic commit, and receipt linked to the original. The original Apply remains historically committed even when the new reverse Effect later counteracts its textual result.

## Considered options

- Removing the original Effect Receipt or relabeling it as undone was rejected because it would rewrite authoritative causal history and obscure what actually committed.
- Restoring the entire old Manuscript Revision was rejected because it could silently discard unrelated later edits and would treat historical state as current authority.
- Exposing committed Apply as an ordinary untracked editor undo was rejected because it would bypass exact target/payload binding, conflict analysis, Effect Approval, and outcome evidence.
- Disallowing reversal was rejected because professional editors need a direct recovery path when an applied Proposal is later judged unsuitable.

## Consequences

Reversal remains auditable and safe against later manuscript changes, but it incurs a preparation and approval path instead of instantaneous history erasure. AI7 must derive exact inverse intent, revalidate current authority, route interactions through conflict/Correction Proposal, link both Effects and receipts, and explain that the original event remains committed even when its content is counteracted.
