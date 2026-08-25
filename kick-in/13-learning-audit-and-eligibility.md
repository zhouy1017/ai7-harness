# Learning Audit and Eligibility

Status: **accepted through Question 15**

## Accepted purpose

AI7 must show which materials contribute to learning and let the user mark what should or should not be included. Those decisions are not isolated corrections: they become supervised evidence for a versioned policy that helps decide the eligibility of similar future materials.

## Learning lineage

The audit feature traces the full chain:

```text
Learning Material
  → Learning Eligibility Decision
  → Editorial Learning Signal
  ├─→ Memory Candidate → approved House/Book memory
  └─→ Series Knowledge Candidate → Series Knowledge Promotion Decision → Series Knowledge Item + immutable revision
  → task that retrieved the exact approved memory or promoted knowledge revision
```

A user should be able to move in both directions: from a task result to the memory and source materials that influenced it, or from a material to every candidate, memory item, and task descended from it.

## Accepted Learning Audit Log contract

Use an append-only, user-readable audit history with projected current status. For each material or derived record, retain:

- stable identity, material type, owning Book/Series, source revision, and time;
- why it was observed as possible learning evidence;
- eligibility status and whether it came from an explicit decision or policy suggestion;
- the exact Learning Eligibility Policy revision and explanation used;
- user include/exclude/undo decisions and optional rationale;
- descendant signals, Memory Candidates, Series Knowledge Candidates, promotion decisions, approved/rejected/forgotten memory items, promoted knowledge revisions, and merges;
- every task that retrieved an approved descendant and the exact memory or Series Knowledge revision used.

The production view should support filtering and bulk review by Book, Series, material type, time, eligibility state, candidate state, and downstream use.

When the user excludes material:

- unused material is blocked from learning immediately;
- a memory item supported only by that material is disabled for future retrieval;
- a memory item with other eligible support is recalculated and flagged for review;
- a running task using an affected item pauses for revalidation;
- completed tasks and outputs remain immutable but are marked as historically affected;
- original Book/task evidence is retained independently;
- re-inclusion triggers a new evaluation rather than erasing history;
- scope and rationale become labeled evidence for the Learning Eligibility Policy.

## Pinned original-AI7 evidence

At `ai7-reborn-ai@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`, current memory commands already provide a strong durable intent → approval → operation → audit → receipt chain, exact candidate revision/digest binding, content-minimized audit records, and a forget operation that removes retrievable content while keeping a redacted digest tombstone. However, candidate lineage is not independently frozen or validated, candidate generation/retrieval are absent, and neither current nor legacy AI7 learns future material eligibility from prior decisions.

The new design preserves those mechanics but adds typed source IDs/revisions/digests, derivation and policy versions, eligibility rationale, independently validated lineage, downstream-use links, and separate review/retrieval/export states.

## Accepted bounded Learning Eligibility Policy

- Store authority and rules in the versioned [Learning Eligibility Policy Document](../docs/policies/learning-eligibility-policy.md), not only in code, prompts, or an opaque classifier.
- Treat explicit include/exclude decisions as labeled examples, including material features, scope, and user rationale.
- Begin in recommendation-only calibration and generalize decisions into explainable proposed rules or classifications for similar future materials.
- After sufficient audited evidence, permit high-confidence automatic inclusion or exclusion only inside material-type and scope boundaries already approved by the user.
- Route novel, conflicting, low-confidence, and out-of-boundary cases to review.
- Preserve explicit source/material decisions as higher-priority overrides that inferred policy can never reverse.
- Log each reason, confidence, Policy Document version, and Learning Lineage relationship.
- Never allow the policy to expand its own eligible material types, scopes, or authority.
- Let the user inspect, correct, disable, roll back, or forget learned eligibility rules.
- Let the user return the policy to recommendation-only mode or disable automatic decisions.
- Keep editorial-memory learning and eligibility-policy learning as separate models: deciding that material is eligible does not decide what editorial preference it proves.
- Eligibility permits evidence/candidate creation only; it never approves House/Book memory, promotes a Series Knowledge Candidate, grants task source access, or authorizes Model Training.
- Run a Post-run Policy Review over production evidence. AI agents may create and edit Proposed Policy Revisions with diffs, rationale, evidence, evaluation results, and expected effects while preserving prior versions.
- Permit automatic Policy Revision Activation only for evaluated, non-expansive calibration of an existing rule inside a user-approved parameter envelope; log and notify with immediate rollback.
- Require explicit user activation for new rules, material types/scopes, action or precedence changes, lowered confidence floors, weakened safeguards, or any expanded authority.

See the canonical [Learning Eligibility Policy Document](../docs/policies/learning-eligibility-policy.md) and [ADR 0004](../docs/adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md).

## Examples

- If the user repeatedly excludes copyediting corrections as unhelpful for voice learning, future mechanical corrections should be preclassified or excluded under an explainable rule.
- If the user includes substantial rewrites of promotional copy, similar delivery-level rewrites should be proposed as useful learning material.
- Excluding one Book-specific plot correction must not accidentally create a global rule that all continuity feedback is ineligible; scope and rationale matter.

The future feedback interaction is intentionally deferred to a separate UI/UX design session. Its required outcomes and state distinctions are captured in the [policy-document and feedback-interaction handoff](./16-policy-documents-and-feedback-ux-handoff.md); no legacy UI layout is implied.
