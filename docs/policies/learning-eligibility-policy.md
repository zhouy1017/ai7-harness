# Learning Eligibility Policy

Status: **accepted design baseline; not connected to a runtime**

This is the canonical design-phase Policy Document for deciding whether identified Learning Material may contribute Editorial Learning Signals. It records accepted authority rules in a form that users and AI agents can review and revise. Its production storage and serialization format remain open, but the production artifact must remain human-readable, machine-validatable, versioned, diffable, and exportable.

[ADR 0094 §3](../adr/0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#3-opt-out-local-learning-with-intelligent-curation) replaces the universal recommendation-only/explicit-inclusion starting rule with the disclosed opt-out local-learning envelope below, as reflected in [ADR 0004](../adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md). This design alignment installs no runtime rule, selects no active policy, completes no curation, admits no new material in a running system and performs no migration. Existing immutable policy bytes and historical records remain unchanged; runtime selections change only through their separately reviewed implementation and selection.

## Current authority boundary

1. Local learning is enabled by default inside ADR 0094 §3's disclosed eligible material and local scope: editorial acceptance/rejection decisions and reasons, editor rewrites, and imported Word revision pairs enter the local Working Corpus learning pipeline. Show what is collected and its future cross-Book influence, a visible global off switch, and Book/material/scope exclusion controls.
2. Record each automatic admission's governing basis, policy version and source provenance; never fabricate a human inclusion click. Preserve exact source/decision identities and revisions, author/editor attribution, reason, confidence and Learning Lineage.
3. An explicit exclusion or narrower scope prevails immediately over the default and any inferred rule. An explicit user decision overrides an inferred rule. User decisions and Learning Supervision Directives constrain subsequent curation and use and become evidence for review; affected derived memory is frozen or corrected with lineage.
4. Local capture creates learning signals only: it sends no model request and activates no memory. Governed intelligent curation and derived-memory activation follow the separate envelope below. Novel, conflicting, low-confidence and out-of-boundary cases remain inspectable and require review rather than forced activation.
5. Eligibility grants no ambient manuscript retrieval, external egress, Series membership, Series Knowledge promotion, publication or Foundation Model training. Later task source access and processing require their respective exact authority; manuscript changes retain the ordinary explicit Apply boundary.
6. The policy cannot expand its own material types, scopes, actions or authority. Proposed Policy Revisions retain the independent versioning, review and activation safeguards below.
7. The user can disable a rule, roll back the active version, return to recommendation-only mode or disable automation. Disabling learning stops later capture, curation and use as applicable; exclusion/remediation invalidates later consumption without rewriting completed history.

## Governed curation and memory use

The disclosed enabled-learning state records the automatic-curation authorization envelope: eligible sources/material and outbound categories, selected model/provider and processing policy, local scope, supervision, budget, and disable/exclusion consequences. The existing scheduler, task/authorization, store and composition owners carry each pass with exact task/dispatch provenance and preflight. A missing or exceeded envelope blocks a model pass. Local collection supplies no unrelated egress authority, and Background Analysis Enrollment is neither required for this separate envelope nor a generic curation grant.

Within that active envelope, roughly 5–10 effective decisions or one imported revision batch may schedule a model-driven Curation Pass on the idle-time background lane without a repeated per-pass click. Six decisions trigger evaluation, not evidence of a useful preference. Intelligent curation filters noise, merges duplicates and identifies recurring patterns; a deterministic summary is not intelligent curation. Keep uncertain or conflicting patterns inspectable without inventing a rule.

A pass may propose or automatically activate only eligible, sufficiently supported derived Global Editorial Memory Items and Editorial Exemplars inside the disclosed local scope. Preserve title, Editorial Dimension, positive/negative examples, confidence, exact decision/source lineage and activation history. This is retrieval/context adaptation, never Foundation Model training. The accepted operating envelope permits this bounded derived-memory activation; it does not activate or enlarge a Policy Document.

Subsequent review, polish and dialogue retrieve relevant eligible memory/exemplars (initial target Top-5), pin exact revisions and record actual use. Revalidate exclusions, supervision and source/egress eligibility at consumption, and identify the preference followed in plain language. A remembered preference neither proves a factual claim nor overrides task-specific editor direction.

## Optional reason inputs

Under [ADR 0095 §7](../adr/0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#7-the-learning-agent-may-ask-why), the learning agent may ask why a decision was made when the reason would help learning. Its short options card has optional free text, nothing preselected and never blocks review. Answers are capture inputs with the same eligibility checks and lineage as other decision signals; answering, declining or ignoring an ask never changes eligibility standing. The editor's frequency setting (`经常 / 偶尔 / 关闭`) controls asks only and remains outside this policy; it neither disables learning nor grants admission, curation or egress authority.

## Policy-document contract

Every production version must logically expose:

- stable policy and rule identities;
- version, digest, lifecycle status, effective time, and predecessor;
- material-type and scope boundaries established by the accepted envelope and any explicit user exclusions or narrower choices;
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

These conditions govern Proposed Policy Revision activation independently of the already approved curation and derived-memory operating envelope. A derived preference inside that envelope is not a new eligibility-policy semantic rule; a proposed change to policy semantics, scope or authority remains subject to the conditions below.

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
