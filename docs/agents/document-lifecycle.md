# Document lifecycle

Keep current documentation focused on the active outcome and its single authority owner. [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) requires conflicting obsolete rules to be removed from the current tree; Git preserves their history. A superseded label is not a reason to leave misleading instructions in an ordinary reading path.

## Lifecycle triggers

Run a scoped sweep when a decision integrates, an Issue/PR closes or is abandoned, a phase completes, a rule is replaced, a handoff is consumed, or a task freezes behind a unique resume entry. Individual commands and elapsed calendar time are not triggers.

## Dispositions

| Disposition | Material |
| --- | --- |
| Keep current | Root routers, applicable ADR clauses, canonical contexts, current Policy Documents, active runbooks, the current Issue/brief and supported Journeys |
| Remove; retain in Git | Conflicting superseded instructions, obsolete dispatch/model tables, replaced progress chronology, consumed routine handoffs and unnecessary duplicate working records |
| Retain named evidence | A non-conflicting artifact needed for a specific future historical question, with current replacement and retrieval condition identified |
| Delete disposable material | Scratch, generated logs, temporary screenshots, failed intermediate drafts and outputs with no durable evidence value |
| Keep external | Credentials, private manuscripts/derivatives and raw Provider payloads; repository archiving is never an admission path |

A stable old path may hold a concise pointer to its current owner when links still need it. Preserve still-valid independent clauses; remove the obsolete conflicting clauses rather than copying their entire prior file to an archive. Current immutable Policy Documents remain governed by their own version/selection rules; changing prose is not changing a runtime policy pin.

## Sweep procedure

1. Name the lifecycle event and exact Issue/phase/document scope.
2. Identify current owners, duplicate rules, obsolete working material and affected links.
3. Move each valid conclusion to its existing owner; identify the accepted replacement for a changed rule.
4. Remove obsolete conflicting prose and record changed paths plus Git recoverability in the closure record.
5. Update current links and routers. Keep historical material out of default agent reading.
6. For a specific named evidence need, preserve only the required non-conflicting artifact and its retrieval information. If an archive node is justified, its index names the lifecycle event, original path, scope, current replacement and retrieval condition. Do not create an empty archive node.
7. Delete only clearly identified disposable material inside the authorized scope, observing filesystem safeguards.
8. Check local links, root wrappers and directive consistency; run `git diff --check`.

Existing archive nodes are historical evidence, excluded from default search. Consult them only for a current record's named historical question. Do not rewrite archived evidence as current authority or create new full copies of obsolete conflicting rulebooks.

## Progress and handoff

[PROGRESS](../../PROGRESS.md) is the integration-line router: current status, next plan slice and one safe Resume Prompt. [Development plan](../development/development-plan.md) owns delivery order. Existing Orca task/Issue/PR records hold live attempts, writer handoff and validation evidence; [Orca dispatch](orca-dispatch.md) owns their lifecycle and role permissions.

Update PROGRESS when integration routing changes. An explicitly scoped router edit belongs to the integrating change, not a separate status ledger. Remove consumed chronology from the active router and rely on Git/Issue/PR history unless a specific evidence artifact is required. Create no parallel MEMORY, progress ledger or archive-derived current-state summary.

Workspace retention is separate from prose lifecycle. Follow Orca dispatch and the installed runtime's documented cleanup after final merge, closure or abandonment; do not delete a worktree containing needed work or treat session cleanup as a repository archive event.
