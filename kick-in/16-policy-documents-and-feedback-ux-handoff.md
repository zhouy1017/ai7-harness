# Policy Documents and Feedback Interaction

Status: **policy-document, hybrid activation, and V2 UI/UX interaction outcomes accepted on `dev`**

## Purpose

Policy authority must be understandable and revisable after real production work. AI7 represents authority-bearing rules as versioned Policy Documents and provides evidence from completed Runs for Post-run Policy Review. AI agents may author Proposed Policy Revisions; editors receive low-friction feedback, future-effect disclosure, review, and rollback without hidden authority expansion.

This document routes accepted outcomes. Root Policy Documents and Execution-context definitions own authority; the accepted [`docs/ui-ux-v2/`](../docs/ui-ux-v2/README.md) package owns presentation. No legacy UI is revived.

## State distinctions the accepted design preserves

| Interaction | User is deciding | It must not silently mean |
| --- | --- | --- |
| Result feedback | Whether a result met editorial expectations and why | Permission to learn from every underlying material |
| Learning-material eligibility | Whether identified material may contribute Editorial Learning Signals at a stated scope | Approval of a Memory Candidate or access to another Book |
| Memory review | Whether a candidate becomes active Book or House memory | A change to the rules selecting future material or automatic Series Knowledge promotion |
| Series Knowledge promotion | Whether one exact candidate creates a new stable Series Knowledge Item with its first immutable revision or appends one revision to an exact existing item after provenance/conflict/reuse review | Learning Eligibility, factual proof, membership change, Run Source Scope, retrieval/provider authority, or automatic activation from another decision |
| Policy-revision review | Whether a Proposed Policy Revision should become active | Retroactive rewriting of prior decisions or completed tasks |
| Audit remediation | How an exclusion or rollback affects descendants and running work | Deletion of original editorial evidence |

## Accepted interaction outcomes

- Common feedback takes one short optional interaction; rationale and scope disclose progressively.
- The exact result or material is always identified. Cross-Book consequences show an unselected explicit scope rather than relying on ambient context or a preselected suggestion.
- Immediate action and possible future influence are explained separately.
- Agent-authored policy revisions support accept, reject, edit, defer, and rollback while preserving immutable historical versions.
- A non-expansive in-envelope calibration that may auto-activate shows why it qualified, leaves an audit trail, and provides immediate rollback and a stop-auto-activation control.
- Any rule/scope addition, precedence change, lowered confidence floor, weakened safeguard, flipped action, or other authority expansion requires explicit activation.
- Policy review presents a compact semantic diff, supporting and contradicting evidence, evaluation result, and affected future material classes/scopes.
- Batch review never converts shared presentation into silent shared scope.
- Learning Audit lineage remains reachable from feedback and revision state.
- Chinese-first copy, professional publishing vocabulary, keyboard access, and the semantic state grammar remain consistent with the V2 UI/UX package.

The concrete accepted flows, states, microcopy, keyboard/accessibility behavior, and placement are in [`docs/ui-ux-v2/interaction-spec.md`](../docs/ui-ux-v2/interaction-spec.md), [`requirements.md`](../docs/ui-ux-v2/requirements.md), [`information-architecture.md`](../docs/ui-ux-v2/information-architecture.md), and [`journeys.md`](../docs/ui-ux-v2/journeys.md). Those presentation records cite the canonical [Learning Eligibility Policy](../docs/policies/learning-eligibility-policy.md), [Learning Audit design](./13-learning-audit-and-eligibility.md), root contexts, and glossary rather than redefining policy authority.

## Current policy-baseline boundary

Learning Eligibility and Factual Verification retain their existing design-baseline status and formats; they are not claimed to have migrated to the new serialized schemas. The separate Provider Processing and External Export active minimum baselines now exist under the [`docs/policies/` owner](../docs/policies/README.md) and are selected by the exact digest-pinned [`active-policy-set.v1.json`](../docs/policies/active-policy-set.v1.json).

Provider Processing v1 denies by default, has zero provider allow rules, and authorizes no live transmission. External Export v1 denies by default and makes only an exact platform-native user-selected local-filesystem file Effect over an exact Delivery Package version or Editorial Deliverable Revision policy-eligible; exact per-file preparation, Effect Approval, commit/verification, receipt or classified outcome, drift, cancellation, and ambiguity safeguards still apply. Policy eligibility is not Effect authority or outcome proof.

These concrete baselines do not choose a provider, endpoint, model, credential, format, or implementation. They authorize no live provider/model call, no local-export implementation, no network/cloud/email destination, and no Public Release Permission. Any such work remains a separately scoped and authorized task.
