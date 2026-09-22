---
status: proposed — the Owner chose this reading on 2026-09-22; the Owner merging this pull request is its acceptance
date: 2026-09-22
deciders: Owner
amends: ADR 0006 — "different changes within one block … require explicit editor resolution" no longer binds a Proposal that targets an exact range inside a block (§1); V2-UX-CONFLICT-003 and -005; kick-in/18 item 7; the stale-base line of the interaction specification; journeys J-06; project constraints, Proposal Branches
---

# Decide a ranged Proposal's conflict by the words it replaces

On 2026-09-22 the Owner answered the two readings S22 (#57) asked for before it could be built (comment 5764542378): a 修改建议 conflicts with the current manuscript when the words it would replace have changed, not whenever anything else in its paragraph has; and `保留当前稿件` and `暂不处理` each leave a record. The Owner merging this pull request accepts this text.

## Context

Two readings of a conflict stood side by side.

- [ADR 0006](./0006-preserve-manuscript-native-history-and-recovery.md) lets "identical or non-interacting different-block changes" merge automatically and requires "explicit editor resolution" for "different changes within one block". V2-UX-CONFLICT-003 sends "same-block changes" to Three-way Proposal Conflict, and [kick-in/18](../../kick-in/18-manuscript-revision-and-recovery-boundary.md) item 7 adds "even if character ranges appear disjoint".
- The alignment on #57 under [ADR 0077](./0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md) and [ADR 0078](./0078-align-the-remaining-references-the-plan-and-the-tracker-to-the-editor-facing-specification.md) reads a conflict as a 修改建议 whose anchor drifted (原文已变). S58 (#407, PR #482) and S59 (#408, PR #483) are built that way: a mark follows its words through edits elsewhere in the paragraph and stays exact, and only an edit to its own words makes it `drifted`, which disables `接受并应用`.

The block rule was written for merging whole versions of a block, before a 修改建议 was a mark on an exact range. Applied to such marks, one corrected character anywhere in a paragraph would send every suggestion in that paragraph through the three-way comparison although none of their words changed, and long Chinese paragraphs carry many suggestions.

## Decision

### 1. What conflicts

A **ranged Proposal** targets an exact range inside one block: every 修改建议, whether the editor wrote it or 审阅 produced it. Since its base, it enters Three-way Proposal Conflict when:

- the words it replaces changed (its anchor drifted, 原文已变), or its target was deleted;
- another change overlaps its range;
- a structure change competes with it, or a structural interaction is ambiguous (its block split, merged or deleted).

A change elsewhere in the same block does not touch the words it replaces. That is a Safe Non-interacting Merge (V2-UX-CONFLICT-002): `接受并应用` stays available and writes only the Proposal's own range, all or none, as S59 does.

Merges that compare whole versions of a block keep ADR 0006's block rule unchanged — a Proposal that rewrites whole blocks, a Proposal Branch, a reimport reconciliation. For such a Proposal every change in the block touches what it replaces, so the two rules agree wherever a Proposal covers the whole block.

### 2. What the card says

V2-UX-CONFLICT-002 requires the non-interaction to be explained. When the block of a ranged Proposal changed elsewhere after its base, its card says 「本段后来改过别处，没有碰到这条建议的原文」 beside `接受并应用`. The line is a label: it records nothing and decides nothing.

### 3. What two conflict paths record

Of V2-UX-CONFLICT-005's four unselected paths:

- **`保留当前稿件`** records the Proposal's rejection with the reason 「保留当前稿件」, so that later counts can tell it from an ordinary rejection. The manuscript does not change.
- **`暂不处理`** records a deferral: who deferred it and when. The conflict stays unresolved and listed, and its Resolution Draft is kept.

`自行编辑解决草稿` and `基于当前稿件重新生成建议` are unchanged.

### 4. What stays

- An Apply publishes one verified revision or changes nothing (ADR 0006), and a model-composed resolution remains a Proposal.
- Reversing an Apply whose words were edited afterwards enters the same conflict resolution.
- Conflicts from a block being split, merged or deleted are S63's (#412).

### 5. Clauses amended

| Owner | Clause | Now |
| --- | --- | --- |
| [ADR 0006](./0006-preserve-manuscript-native-history-and-recovery.md) | "different changes within one block and ambiguous structural interactions require explicit editor resolution" | Still binds whole-block merges; a ranged Proposal conflicts by its range (§1) |
| [V2-UX-CONFLICT-003](../ui-ux-v2/requirements.md) | "Same-block changes, deleted targets, overlapping ranges, competing structure changes, and ambiguous structural interactions enter Three-way Proposal Conflict" | A change to a ranged Proposal's words, or any same-block change for a whole-block Proposal; a change elsewhere in a ranged Proposal's block is a Safe Non-interacting Merge |
| [V2-UX-CONFLICT-005](../ui-ux-v2/requirements.md) | the four unselected paths | Adds the records of §3 |
| [kick-in/18](../../kick-in/18-manuscript-revision-and-recovery-boundary.md) item 7 | "Different edits within the same block … become conflicts even if character ranges appear disjoint" | Adds the ranged-Proposal exception of §1 |
| [kick-in/08](../../kick-in/08-source-document-inheritance.md), recommendations | "different same-block changes and structural interactions require explicit editor resolution" | Read with §1 |
| [Interaction specification](../ui-ux-v2/interaction-spec.md), Proposal review | "classifies exact non-interaction versus same-block/structural ambiguity" | Versus an interaction with the Proposal's range, or its whole block for a whole-block Proposal, or structural ambiguity |
| [Journeys](../ui-ux-v2/journeys.md), J-06 | "Resolve same-block or structural drift" | Resolve a Proposal's target drift or structural drift |
| [Project constraints](../agents/project-constraints.md), Proposal Branches | "different same-block changes and ambiguous structural interactions require explicit editor resolution" | Adds the ranged-Proposal exception of §1 |

## Consequences

- S59 is unchanged. S22 adds the card line (§2), the conflict surface for a drifted 修改建议, the two records (§3) and Journey J-06.
- The block rule guarded against an edit elsewhere in a sentence changing what a suggestion means — a renamed character that a pronoun in the suggestion refers to. That judgment is now the editor's, prompted by the §2 line, not a forced three-way comparison. A Proposal that covers the whole block keeps the old protection.

## Rejected alternatives

- **Keep the block rule for every Proposal.** Any change in a paragraph would route each of its suggestions through the three-way comparison, although none of their words changed, and S59 would have to be tightened. Rejected by the Owner on 2026-09-22.
- **Record nothing for `暂不处理`.** Closing the surface without a record leaves a deferred conflict indistinguishable from one never looked at. Rejected by the Owner on 2026-09-22.
