# Editorial Quality Metrics and the Behavior Evaluation Gate

Status: **proposed for Question 36; not accepted**

Question 36 was opened because Question 29 established that agent-authored revisions require an evaluation gate, and the pinned Harness provides no general quality evaluator. AI7 must own that layer. The design is large enough to decide on its own rather than as a sub-clause of the capability boundary.

## Governing user story

The owner's framing: an editor places most related text-content work inside AI7's scope, and **the editor's decisions and ratings are the oracle** for what counts as good. AI7 learns the editor's taste and style in order to assist their tasks.

## Three signal families

### A — Explicit feedback

The editor has entries to comment on or correct an unsatisfied result. Capture the rating, the comment, the correction diff, and which Editorial Dimension failed.

Yields dissatisfaction rate by task type and by dimension.

### B — Editor-authored content

Editors writing their own text is a **style reference, not a pass/fail signal**. It answers what this editor's prose actually looks like, giving a conformance reference for register, structure, and diction on comparable material.

This is the most sensitive family, because it learns from the user's own writing. It routes through the Learning Eligibility Policy and Learning Audit Log rather than being consumed automatically, exactly as accepted at Questions 13 through 15.

### C — Decision and version differences

The strongest family, because it is behavioral rather than reported. Per proposal, capture the outcome — accepted verbatim, accepted with edits, rejected, discarded, or superseded — plus revision distance when edited, and whether the change survived into the delivered revision.

Questions 13 and 14 already accepted capturing accept/reject actions, ratings, user rewrites, and AI7-to-final-deliverable differences as evidence. What Question 36 adds is turning that evidence into quantified, versioned measures that can gate an activation.

## Derived metrics

| Metric | Reads as |
| --- | --- |
| **Verbatim acceptance rate** | Proposals needing no touch-up |
| **Revision distance** | How much repair an accepted proposal required |
| **Survival rate** | Accepted changes still present at delivery; catches work accepted in the moment and quietly undone later |
| **Dissatisfaction by dimension** | Which of the eight Editorial Dimensions AI7 is weakest on |
| **Workload displacement** | Edit volume or editor time that accepted work removed |

Two headline measures, not one. The accepted success criterion is already *Editor-comparable Delivery Quality plus measurable workload reduction*, so quality and workload are reported together.

## Design cautions

1. **Acceptance rate alone is perverse.** An agent optimizing for acceptance learns to propose safe, trivial changes. High acceptance at low value is a failure mode wearing success's clothes, which is why workload displacement is a required counterweight rather than a nice-to-have.
2. **Silence is not consent.** An unreviewed proposal is weak evidence, not approval. Question 13 already holds that inferred patterns remain candidates.
3. **Small-N.** One editor's decisions are a thin dataset. Metrics need a minimum sample and a confidence bound before they gate any activation, or a single unrepresentative week flips behavior.
4. **Attribution.** If a Behavior Asset changed while the editor's own standards drifted, production metrics cannot separate the two causes.
5. **The gate is therefore two-sided.** Deterministic replay against the Question 24 fixed scenario corpus proves no regression on known cases; production metrics show real-world improvement. Replay cannot see taste, and production evidence cannot isolate cause, so neither half is sufficient alone.

## The boundary on the oracle

Editor decisions are ground truth for **taste, style, and editorial judgment**. They are **not** ground truth for **factual correctness**: an editor accepting a sentence does not make its claims true.

ADR 0005 and the accepted rule that workflow completion or signoff never implies factual truth both continue to hold. Factual Verification stays evidence-based and is measured separately from taste conformance. Collapsing the two would let an approving editor silently certify a false claim.

## Proposed terms

Not yet promoted to a context `CONTEXT.md` or the glossary, because Question 36 is unaccepted.

| Proposed English term | Proposed Simplified Chinese | Meaning |
| --- | --- | --- |
| Quality Signal | 质量信号 | A captured, attributable feedback event from any of the three families |
| Delivery Quality Metric | 交付质量度量 | A versioned measure derived from Quality Signals over a defined window and scope |
| Behavior Evaluation Gate | 行为评估关口 | What a Behavior Asset, Policy Document, or composition revision must pass before activation |

## Open sub-decisions

1. Whether Quality Signals are captured per Book, per editor, per house, or all three, and how that interacts with the accepted Book/Series/Cross-project/House scope hierarchy.
2. The minimum sample and confidence threshold before a metric may gate an activation.
3. Whether workload displacement is measured by edit volume, elapsed editor time, or a declared proxy.
4. Whether dissatisfaction entries are mandatory or optional at the point of rejection, given that mandatory reason-capture raises data quality but adds editor burden — which cuts against the workload-reduction goal.
5. Retention and privacy treatment of Quality Signals derived from unpublished manuscript text.
