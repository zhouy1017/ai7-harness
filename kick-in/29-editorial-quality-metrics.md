# Editorial Quality Signals and Metrics

Status: **accepted product metrics; the mandatory two-sided Behavior Evaluation Gate is superseded by ADR 0027**

Question 36 was opened when Question 29 exposed the need for AI7-owned quality measurement that the pinned Harness does not provide. Its Quality Signals and metrics remain accepted; ADR 0027 later superseded the proposed separate Behavior Evaluation Gate.

## Governing user story

An editor places most related text-content work inside AI7's scope, and **the editor's decisions and ratings are the oracle** for what counts as good. AI7 learns the editor's taste and style in order to assist their tasks.

## Three Quality Signal families

### A — Explicit feedback

The editor has entries to comment on or correct an unsatisfied result. Capture the rating, the comment, the correction diff, and which Editorial Dimension failed. Yields dissatisfaction rate by task type and by dimension.

### B — Editor-authored content

Editors writing their own text is a **style reference, not a pass/fail signal**. It answers what this editor's prose actually looks like, giving a conformance reference for register, structure, and diction on comparable material.

This family learns from the user's own writing, so it routes through the Learning Eligibility Policy and Learning Audit Log rather than being consumed automatically, as accepted at Questions 13 through 15.

### C — Decision and version differences

The strongest family, because it is behavioral rather than reported. Per proposal, capture the outcome — accepted verbatim, accepted with edits, rejected, discarded, or superseded — plus revision distance when edited, and whether the change survived into the delivered revision.

Questions 13 and 14 already accepted capturing these as evidence. Question 36 turns that evidence into quantified, versioned measures that can inform governed activation. The former independent activation-evaluation gate is superseded by ADR 0027; these product Quality Signals and activation constraints remain.

## Capture scope

Per Book, per editor, and per house are all supported. **The default is capture globally on the local instance**, with every signal attributed so it can be filtered or aggregated along any of the three dimensions afterward.

One line must not blur: **aggregating metrics globally is not granting retrieval access globally.** A Delivery Quality Metric may be computed across every Book on the instance, while a Run's ability to read manuscript text remains bound by Run Source Scope and the Book/Series/Cross-project hierarchy of ADR 0002. Metric aggregation is measurement, not task authority.

## Derived metrics

| Metric | Reads as |
| --- | --- |
| **Verbatim acceptance rate** | Proposals needing no touch-up |
| **Revision distance** | How much repair an accepted proposal required |
| **Survival rate** | Accepted changes still present at delivery; catches work accepted in the moment and quietly undone later |
| **Dissatisfaction by dimension** | Which of the eight Editorial Dimensions AI7 is weakest on |
| **Workload displacement** | Weighted share of delivered change that came from accepted AI7 work |

Two headline measures, not one. The accepted success criterion is *Editor-comparable Delivery Quality plus measurable workload reduction*, so quality and workload are always reported together.

### Workload displacement is edit volume weighted by declared phase effort

Measured as the share of change in a delivered revision that came from accepted AI7 proposals, computed from Proposal Branches and Manuscript Revisions, then **weighted by a phase effort weight each Workflow Profile declares once**. A developmental review pass weighs more per unit of change than a formatting pass.

This is automatic from the first day, adds no per-task question, and corrects for the fact that raw volume is not effort.

**Per-task time tracking is explicitly rejected.** It needs a baseline that does not exist, is noisy with thinking time and interruptions, and for a professional user reads as surveillance — which would corrode trust in a product whose premise is assisting expert judgment.

## Cold start

AI7 must work at **N = 0**. Thin data and near-zero-shot operation are a required tolerance, not a degraded mode. Nothing about sample size may prevent AI7 from operating, or prevent an agent from proposing a revision.

Sample size governs **auto-activation only**. Below the confidence threshold, revisions remain proposal-only and a human decides. This costs nothing at cold start — with no data nothing would auto-activate anyway, and human review is already the ADR 0004 default — while preventing a two-sample metric from silently flipping behavior later. Cold start works because the human is the gate, not because the sample is large.

## Feedback interaction

Reasons for accept, reject, and change are **actively queried**, not passively hoped for. To keep editor burden near zero, the query is a quick interaction offering **one-click guessed answers** drawn from a small closed taxonomy mapped to the Editorial Dimensions plus a few operational reasons.

The query is never blocking. An ignored prompt still yields a valid accept/reject signal; it simply carries no dimension attribution.

### Guessed chips must not steer the oracle

If AI7 guesses "tone" and the editor taps it because it is convenient, the system has learned its own guess rather than the editor's judgment — a self-confirming loop that would corrupt the very oracle everything else rests on.

Three required mitigations:

1. offer two or three alternatives, never a single suggestion;
2. never pre-select a default; and
3. track **guess acceptance versus correction as its own calibration metric**. If the editor almost always taps the first chip, the chips are steering rather than capturing, and the taxonomy or ordering needs revision.

## Privacy: the boundary is egress, not identity

AI7 is a local desktop product, and any developer or user of an instance is authorized personnel with manuscript access. There is no internal access-control requirement between them, and Quality Signals may retain manuscript excerpts locally.

What does not change is the egress boundary:

> **Any authorized person may read a manuscript locally. No automated path may carry one off this machine except a configured model call.**

Manuscripts still never enter a repository (ADR 0016), and never enter hosted CI, hosted runners, build artifacts, or logs — not because developers are untrusted, but because each of those is a path off the machine. A configured model call remains the explicitly permitted egress, because that is the product's function.

## The boundary on the oracle

Editor decisions are ground truth for **taste, style, and editorial judgment**. They are **not** ground truth for **factual correctness**: an editor accepting a sentence does not make its claims true.

ADR 0005 and the accepted rule that workflow completion or signoff never implies factual truth both continue to hold. Factual Verification stays evidence-based and is measured separately from taste conformance. Collapsing the two would let an approving editor silently certify a false claim.

## Design cautions carried into implementation

1. **Acceptance rate alone is perverse.** An agent optimizing for acceptance learns to propose safe, trivial changes. High acceptance at low value is a failure mode wearing success's clothes, which is why weighted workload displacement is a required counterweight rather than a nice-to-have.
2. **Silence is not consent.** An unreviewed proposal is weak evidence, not approval.
3. **Attribution.** If a Behavior Asset changed while the editor's own standards drifted, production metrics cannot separate the two causes.
4. **Historical evaluation-gate note — superseded by ADR 0027.** The earlier design required fixed-corpus replay plus production metrics as a separate two-sided Behavior Evaluation Gate. That engineering gate no longer applies. Production Quality Signals still inform product learning and calibration, while user-visible behavior is covered only when it belongs to an applicable supported E2E journey or observed-bug regression.

## Question 36 decision

Accepted with owner revisions:

- three Quality Signal families, captured globally on the local instance by default and attributed for per-Book, per-editor, and per-house aggregation;
- five derived metrics, with workload displacement measured as edit volume weighted by a once-declared phase effort weight, and per-task time tracking rejected;
- cold start at N = 0 is required, and sample size gates auto-activation only;
- accept/reject/change reasons are actively queried through a quick, non-blocking, one-click interaction with anti-steering mitigations;
- privacy is an egress boundary rather than an identity boundary; and
- editor decisions are the oracle for taste but never for factual correctness.

See [ADR 0019](../docs/adr/0019-editorial-quality-metrics-and-behavior-evaluation-gate.md) for the retained product metrics and [ADR 0027](../docs/adr/0027-concentrate-ci-on-e2e-functionality.md) for supersession of its separate gate.
