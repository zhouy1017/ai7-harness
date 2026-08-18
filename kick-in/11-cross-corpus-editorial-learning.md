# Cross-corpus Editorial Learning

Status: **accepted; audit and eligibility controls settled by Questions 14 and 15**

## Accepted boundary

- A Book remains the ordinary authority boundary for manuscript sources, exact retrieval, revisions, proposals, deliverables, and mutations.
- Explicit Cross-project work remains necessary when a task directly reads or compares identified Books.
- Separately, AI7 learns reusable editorial patterns and user feedback across the eligible Working Corpus so future deliveries move closer to the user's quality standard.
- Learning scope does not silently widen a task's source scope. A task may benefit from an abstracted pattern without gaining access to another Book's text or facts.

## Accepted House Editorial Memory boundary

Use a versioned, user-owned **House Editorial Memory** rather than hidden model-weight training as the initial adaptation mechanism:

- Store derived preferences, style patterns, recurring editorial judgments, rubric refinements, and feedback summaries.
- Preserve provenance to the contributing feedback and Book without copying unrelated raw passages into another Book's task context by default.
- Keep direct quotations, facts, characters, plots, and unpublished Book-specific content inside their source authority unless an explicit Cross-project task selects them.
- Log or snapshot every memory item made model-visible so a result can be reconstructed and explained.
- Let users inspect, correct, disable, archive, or forget learned items.
- Version updates prospectively so historical tasks retain the memory state they used.
- Keep provider/model choice independent from the memory representation; changing providers must not erase learned editorial practice.

This is the accepted default for unrelated Books. A Series is the accepted explicit exception with the richer boundary defined in [Series Work Boundary](./12-series-work.md).

## Pinned original-AI7 evidence

At `ai7-reborn-ai@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`:

- `docs/adr/0072-cross-project-source-scope-is-run-local-and-user-designated.md` and the current runtime prove exact, integrity-checked retrieval from explicitly selected projects. This is direct source access, not learning.
- Word round-trip captures project-owned `wordFeedback`, explicit `style-entry.upsert@1` stores project style rules, and `builtin.memory-review` governs pre-existing memory candidates.
- The current runtime has no feedback-to-candidate generator, no consumer that turns accepted memory into prompt context, and no learned-style consumer. Exported project-memory snapshots are stored but not retrieved into tasks.
- `docs/reference/current-ai7/plans/memory-governance-and-learning-queue.md` describes edit cases, editor preferences, feedback, preference pairs, review, and behavioral retrieval, but its implementation paths are absent from the pinned redesign checkout. Treat it as legacy design evidence, not shipped authority.

Preserve the strongest legacy distinction:

```text
Feedback evidence
  → proposal-only memory candidate
  → human review
  → approved scoped memory
  → logged retrieval into task context
```

Direct source retrieval remains a separate, explicitly scoped capability.

## Boundary examples

- Repeated edits that reduce exaggerated promotional language can produce a reusable tone preference.
- Repeated corrections to dialogue punctuation can produce a Chinese house-style pattern.
- A preference for evidence-led review reports can become a delivery-quality rule.
- A plot detail or unpublished quotation from Book A must not appear in Book B merely because both contributed to the Working Corpus.
- Comparing themes across Books A and B remains an explicit Cross-project task with both Books selected.

## Accepted learning-signal governance

- An explicit “remember this” instruction becomes active immediately at the user-selected Book, Series, or House scope.
- Accept/reject actions, editor feedback, ratings, user rewrites, and generated-to-final-deliverable differences are captured automatically as evidence.
- Implicit patterns create provenance-bearing Memory Candidates; repeated evidence may strengthen or merge them, but cross-Book activation requires user approval.
- Users can edit, approve, reject, bulk-review, roll back, or forget learned items.
- Forgetting stops retrieval without deleting the original Book/task evidence, and every task snapshots the exact approved memory revision it used.
- No feedback enters model training automatically.

The additional [Learning Audit and Eligibility](./13-learning-audit-and-eligibility.md) design governs which source materials may contribute evidence at all.
