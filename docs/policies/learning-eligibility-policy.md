# Learning Eligibility Policy

Status: **accepted design baseline; not connected to a runtime**

This is the canonical design-phase Policy Document for deciding whether identified Learning Material may contribute Editorial Learning Signals. It records accepted authority rules in a form that users and AI agents can review and revise. Its production storage and serialization format remain open, but the production artifact must remain human-readable, machine-validatable, versioned, diffable, and exportable.

## Current authority boundary

The following local-learning boundary follows [ADR 0094 §3](../adr/0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#3-opt-out-local-learning-with-intelligent-curation). It records accepted design; it does not install a runtime rule, select an active policy, establish completed curation, admit new material, or migrate existing records. Existing immutable runtime policy versions and selections remain unchanged.

1. Default local learning admits eligible editorial acceptance/rejection reasons, editor rewrites and imported Word revision pairs into the local Working Corpus learning pipeline. Disclose collection and future cross-Book influence, with a visible global disable control and per-Book/material/scope exclusions; explicit exclusions and narrower scope prevail immediately.
2. Automatic local admission records its governing basis and provenance, never a fabricated human inclusion decision. Local capture alone sends no model request and activates no memory.
3. Governed intelligent curation may propose or automatically activate sufficiently supported derived editorial preferences only inside ADR 0094 §3's disclosed local operating envelope. Eligibility alone does not establish a useful preference or activate memory.
4. Novel, conflicting, low-confidence, and out-of-boundary cases require review.
5. Every decision records its reason, confidence, policy version, and Learning Lineage.
6. An explicit user decision overrides an inferred rule and becomes evidence for future policy review.
7. The policy cannot expand its own material types, scopes, actions, or authority.
8. Eligibility grants no ambient manuscript retrieval, external egress, Series membership or Series Knowledge promotion, publication authority, or Foundation Model training. Ordinary task execution retains its exact task/source/processing authorization; manuscript Apply remains a separate explicit authority.
9. The user can disable a rule, roll back the active version, return to recommendation-only mode, or disable automation.

ADR 0094 §3's default local admission does not depend on an inferred inclusion rule. For inferred include/exclude rules outside that accepted default local basis, a new policy still begins in recommendation-only calibration mode. Only after sufficient audited examples may high-confidence matches automatically include or exclude material inside the user-approved boundary; the independent activation safeguards below still apply.

Local capture and intelligent curation are separate stages. The disclosed enabled-learning state records the automatic-curation authorization envelope: eligible source/material and outbound categories, selected provider/model and policy, scope, supervision, budget, and disable/exclusion consequences. Threshold or import events may schedule only the exact model-driven processing within that active envelope, with task/dispatch provenance and preflight; missing or exceeded authority blocks the pass. Background Analysis Enrollment is specific to manuscript analysis and supplies no generic curation grant.

A Curation Pass filters noise, merges duplicates and identifies recurring patterns before proposing or activating inspectable Global Editorial Memory Items and Editorial Exemplars. Roughly 5–10 effective decisions or one imported revision batch may trigger evaluation; six decisions do not prove that a useful rule exists. A deterministic summary is not intelligent curation. Keep uncertain or conflicting patterns inspectable without inventing a rule; retain title, Editorial Dimension, positive/negative examples, confidence, exact decision/source lineage and activation history for derived items.

Later consumption pins exact eligible memory/exemplar revisions, records actual use and revalidates exclusions, supervision and source/egress eligibility. A preference cannot establish factual truth or override task-specific direction. Disabling learning stops new capture, curation and use as applicable; exclusion/remediation invalidates later consumption without rewriting completed history. The approved local operating envelope does not authorize the policy to enlarge itself: independent Proposed Policy Revisions and out-of-envelope activation remain subject to the safeguards below.

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
