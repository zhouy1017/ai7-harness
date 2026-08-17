# Learning Eligibility Policy

Status: **accepted design baseline; not connected to a runtime**

This is the canonical design-phase Policy Document for deciding whether identified Learning Material may contribute Editorial Learning Signals. It records accepted authority rules in a form that users and AI agents can review and revise. Its production storage and serialization format remain open, but the production artifact must remain human-readable, machine-validatable, versioned, diffable, and exportable.

## Current authority boundary

1. The user approves the eligible material types and Book, Series, or House scopes.
2. A new policy begins in recommendation-only calibration mode.
3. After sufficient audited examples, high-confidence matches may include or exclude material automatically only inside the approved boundary.
4. Novel, conflicting, low-confidence, and out-of-boundary cases require review.
5. Every decision records its reason, confidence, policy version, and Learning Lineage.
6. An explicit user decision overrides an inferred rule and becomes evidence for future policy review.
7. The policy cannot expand its own material types, scopes, actions, or authority.
8. Eligibility permits creation of Editorial Learning Signals or Memory Candidates only. It does not approve memory, grant task source access, authorize publication, or train a Foundation Model.
9. The user can disable a rule, roll back the active version, return to recommendation-only mode, or disable automation.

## Policy-document contract

Every production version must logically expose:

- stable policy and rule identities;
- version, digest, lifecycle status, effective time, and predecessor;
- owner-approved material-type and scope boundaries;
- each rule's conditions, action, rationale, confidence requirements, exceptions, and precedence;
- evidence and Learning Eligibility Decisions supporting or contradicting each rule;
- authoring user or agent, Post-run Policy Review, evaluation, activation decision, and rollback link;
- downstream eligibility decisions made under that version.

The exact file/schema format is deferred. A profile name, prompt fragment, classifier checkpoint, or hidden database row alone does not satisfy this document contract.

## Post-run agent revision

After a production run, an AI agent may inspect eligible run evidence, review how the active policy behaved, and create or edit a Proposed Policy Revision. The revision must show:

- a semantic diff from the active version;
- the supporting and contradicting run/material evidence;
- the reason for each rule change;
- replay and evaluation results;
- the expected effect on future material;
- any authority, scope, or confidence change;
- a rollback target.

Historical and active versions are immutable; an agent edits a new proposed version. Authorship never grants activation authority.

## Accepted revision activation

A Proposed Policy Revision may activate automatically only when every condition below holds:

- it calibrates an existing stable rule rather than adding or deleting a semantic rule;
- it keeps the same approved material types, scopes, action, and precedence;
- every parameter remains inside a user-approved adjustment envelope and confidence floor;
- it does not weaken review, explicit override, audit, notification, or rollback safeguards;
- replay and semantic evaluation gates pass over affected historical and synthetic cases;
- the complete diff, evidence, evaluation, activation reason, and rollback target are logged;
- the user is notified and can immediately roll back or disable further automatic activation.

Explicit user activation is required for a new rule, material type or scope; an include/exclude/review action change; a precedence change; a lower confidence floor; a weakened safeguard; or any new authority. The system treats uncertainty about this classification as requiring user activation.

Every activation creates a new immutable active version and retains the predecessor. No agent can make an out-of-envelope revision eligible by editing the envelope itself.

See the [Learning Audit and Eligibility design](../../kick-in/13-learning-audit-and-eligibility.md) and [future feedback-interaction handoff](../../kick-in/16-policy-documents-and-feedback-ux-handoff.md).
