---
status: accepted
---

# Add model-driven cross-unit reduction, assurance sampling, and the Run Report

On 2026-09-06 the Owner accepted three additions to the covered-analysis design after the prompt-only manuscript-review practice showed where its value and its failures came from. Cross-chapter contradictions were found only by model reasoning over topic-reorganized ledgers, not by string matching; the only systemic defect was caught by an adversarial sample that cost 1.7% of the run; and the execution report itself was the most reusable artifact. This decision extends [ADR 0047](./0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md) and [ADR 0048](./0048-enroll-and-evaluate-background-manuscript-analysis.md). It authorizes design, not implementation; each addition lands through its plan slice.

## Decision

### Model-driven cross-unit reduction

A second product-built, exact-versioned contract, the **Baseline Cross-Unit Reduction Contract**, runs inside the same authorized Run as a declared reducer suboperation after the unit stage. Its input is the complete new unit set reorganized by topic: entities and aliases, events and chronology, relationships, and setting claims, each row carrying its unit ordinal and source ranges. Its output is typed cross-unit findings: contradictions, continuity breaks, alias and identity divergences, and chronology conflicts, each with the source ranges on every side and a confidence. The existing deterministic pass stays as a pre-filter and its three conflict kinds remain. Findings enter the Result Set Revision with `reducer` lineage; they never mutate a unit result. When the topic-reorganized input exceeds one unit budget, it is split by topic, never by chapter, so every cross-unit read sees one whole axis.

### Assurance sampling

A declared **assurance sampling** suboperation draws a stratified, fixed-seed sample of findings (default 30, at least one per structural section) after reduction, re-reads each finding's unit and surrounding blocks, and returns one of `成立`, `需降级`, or `应删除` with a reason, plus an estimated precision for the sampled tier. The result feeds the semantic/evidence assurance axis and is disclosed in the revision. Sampling never edits, deletes, or reorders findings; a disposition is evidence for the editor and for the Run Report. The seed is recorded so the sample is reproducible.

### Run Report

Every Run produces one durable **Run Report** linked from its Task Outcome: stages and their wall time, unit accounting (submitted, reused, recomputed, gaps), adaptations, failures with classified reasons, usage per stage, the assurance sample and its precision, and an `if redone` list the model writes for its own next run. The report is the first learning loop; it precedes Quality Signals and the Analysis Quality Metric and feeds neither automatically.

### Finding record shape for factual review

Factual-review findings (the J-04 branches of plan slices S18 and S19) use one record shape: a verbatim quote anchored to an exact block range, a category from a closed set, a severity tier `A` (confirmed), `B` (probable), or `C` (advisory), a verdict from `确证`, `部分成立`, `存疑`, `无法核实`, `未外部复核`, or `误报`, a basis, and sources with institutional provenance. A finding judged `误报` keeps its identity in an excluded appendix; duplicates merge into one record that lists the merged identities. Exact field names are decided in the slice and recorded in its closure.

### Research budget

The research capability that factual verification uses declares a per-Run search budget in the Plan Envelope, allocated by severity tier, and prefers a curated institutional-source list over open search. Chinese historical and institutional sources are a required source class, not an environmental accident. Exhausting the budget is a disclosed state on the affected findings, never a silent downgrade.

## Consequences

- The Result Set Revision gains reducer-lineage findings, the assurance sample, and the Run Report link; the four axes keep their meaning.
- Both new suboperations inherit the Run's unchanged Plan Envelope as declared operation classes under ADR 0048; neither creates a new authority origin.
- Under the deterministic route both contracts replay hand-written or generated fixtures like the unit contract; under the developer-live scope of [ADR 0065](./0065-admit-a-developer-live-provider-processing-scope.md) they run live.

## Rejected alternatives

- **Keep the deterministic cross-unit pass as the only reduction.** Rejected: it cannot find a contradiction that is not a literal string mismatch.
- **Rely on editor Quality Signals for assurance.** Rejected: they arrive after the editor has already spent the time the sample would have saved.
- **Make the Run Report a log.** Rejected: a log is deleted; the report is the artifact a future Run and a future Commander read.
