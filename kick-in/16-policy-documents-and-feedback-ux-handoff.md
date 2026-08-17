# Policy Documents and Feedback-interaction Handoff

Status: **policy-document and hybrid activation requirements accepted; detailed UI/UX intentionally deferred to a separate agent session**

## Purpose

Policy authority must be understandable and revisable after real production work. AI7 therefore represents authority-bearing rules as versioned Policy Documents and provides evidence from completed runs for Post-run Policy Review. AI agents may author Proposed Policy Revisions; users need a low-friction way to provide feedback, understand future effects, review changes, and undo mistakes.

This document defines required interaction outcomes only. It does not choose a window, panel, ribbon, page structure, component library, or visual layout, and it does not revive the legacy UI.

## State distinctions the future design must preserve

| Interaction | User is deciding | It must not silently mean |
| --- | --- | --- |
| Result feedback | Whether a result met editorial expectations and why | Permission to learn from every underlying material |
| Learning-material eligibility | Whether identified material may contribute Editorial Learning Signals at a stated scope | Approval of a Memory Candidate or access to another Book |
| Memory review | Whether a candidate becomes active Book, Series, or House knowledge | A change to the rules selecting future material |
| Policy-revision review | Whether a Proposed Policy Revision should become active | Retroactive rewriting of prior decisions or completed tasks |
| Audit remediation | How an exclusion or rollback affects descendants and running work | Deletion of original editorial evidence |

## Low-friction interaction goals

- Make the common feedback action possible in one short interaction, with rationale and detailed scope available progressively rather than required every time.
- Always identify the result or material receiving feedback; never rely on an ambiguous current selection.
- Show the default learning scope in Chinese and let the user change it before submission when the decision has cross-Book consequences.
- Explain the immediate action and the possible future effect separately—for example, “exclude this material” versus “suggest a rule for similar promotional-copy rewrites.”
- Offer clear accept, reject, edit, defer, and undo paths for agent-authored policy revisions.
- Notify the user when an in-envelope calibration auto-activates, show why it qualified, and provide immediate rollback and “stop automatic activation” controls.
- Present a compact semantic diff, supporting/contradicting evidence, confidence, evaluation outcome, and affected future material types/scopes before activation.
- Require explicit user activation when a revision adds a rule or scope, flips an action, changes precedence, lowers a confidence floor, weakens a safeguard, or otherwise expands authority.
- Support batch review without turning bulk actions into silent scope expansion.
- Keep the Learning Audit Log reachable from the feedback and revision state so the user can inspect lineage when desired.
- Use Chinese-first labels and explanations, professional publishing vocabulary, and keyboard-accessible behavior in the Standalone desktop product.

## Suggested future session brief

The independent UI/UX agent should design and test at least these journeys:

1. An editor gives quick feedback on an AI7 deliverable without opening a policy screen.
2. The editor includes or excludes one Learning Material item and optionally explains why and at which scope.
3. AI7 later shows how that decision affected a future eligibility recommendation.
4. A post-run agent proposes a Policy Document revision; the editor understands the future impact and accepts, edits, rejects, or defers it.
5. The editor discovers a mistaken rule, rolls it back, and sees affected memory/tasks without rewriting completed history.
6. The editor reviews many low-confidence cases efficiently while detecting a dangerous global or cross-Series scope change.

Expected outputs from that future session are user flows, state/error diagrams, interaction alternatives, Chinese microcopy, accessibility/keyboard behavior, wireframes or prototypes, and usability scenarios. Those outputs must cite the canonical [Learning Eligibility Policy](../docs/policies/learning-eligibility-policy.md), [Learning Audit design](./13-learning-audit-and-eligibility.md), and glossary rather than redefining policy authority.

## Deliberately open for the UI/UX session

- Inline versus post-run placement and notification timing.
- Whether feedback is binary, graded, dimension-specific, or combines these modes.
- Default rationale shortcuts and free-text handling.
- Batch-review grouping and confidence visualization.
- Standalone placement, editor integration, and desktop-specific affordances; future Word interaction is outside this V1 handoff.
- How much policy detail appears by default versus on demand.

These interaction choices do not block the current architecture interview.
