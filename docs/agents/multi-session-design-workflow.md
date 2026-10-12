# Multi-session design workflow

This runbook governs bounded design exploration and candidate freezing. [Orca dispatch](orca-dispatch.md) alone owns repository roles, model pairings, assignment, writer handoff, PR review and integration. An optional exploratory challenge is an advisory research activity; it does not replace the required PR Reviewer or change that Reviewer's repair/test/merge responsibility.

## Invariants

- Resolve accepted design at the intended target through [design authority](design-authority.md). Candidate branches, spikes and handoffs are evidence until the accepted change reaches dev; main remains a separate promotion decision.
- Give each writing outcome an Issue and bounded brief. Assign branch/workspace ownership and handoff through Orca dispatch.
- A freeze limits finishing work to what is already materially underway; it does not authorize new architecture assumptions or broader implementation.
- Exploration, architecture acceptance and implementation authorization are separate decisions. A design conclusion alone does not authorize scaffolding, dependency installation, product changes or live calls.
- Current accepted ADRs and contexts outrank summaries. Replaced conflicting instructions are removed under ADR 0089; Git retains history.
- Archives are queried only for a named historical question, not used as another current design baseline.

## Exploration states

| State | Meaning | Next step |
| --- | --- | --- |
| `preparing` | Record the canonical baseline, question and missing facts. | `exploring` |
| `exploring` | Compare assumptions, root problems, principles and bounded spikes. | `challenge-ready` |
| `challenge-ready` | One coherent candidate can be tested by independent opposition. | `decision-ready` or `rework` |
| `decision-ready` | Tradeoffs, ADR impact, migration direction and uncertainty are explicit. | Owner decision |
| `accepted` | Owner accepts the design; implementation still needs its own authorized scope. | Assigned drafting/integration |
| `rework` | An assumption or candidate failed the challenge. | `exploring` |
| `revised` | Owner changes constraints without accepting the candidate. | Revised brief |
| `deferred` | Owner postpones a bounded question with a reconsideration trigger. | Resume when that trigger occurs |

Record explicit Owner outcomes in the authority-owning project records; an agent cannot accept its own candidate. A challenge may be omitted when the bounded question is already resolved; that does not waive PR review for a resulting document change.

## Freeze contract

The Issue states the exact baseline, permitted finishing work, prohibited expansion, expected candidate and resume condition. The current writer:

1. stops starting new subtasks or design decisions;
2. finishes only the permitted material already underway;
3. removes scratch that should not enter Git;
4. records coherent candidate state, unresolved assumptions and a safe next action;
5. commits the candidate when appropriate and stops writing, or hands over through Orca dispatch.

The Commander verifies the candidate and records the frozen state in existing Issue/task records. Freezing alone does not merge, publish or grant new work authority. A resulting PR uses the ordinary dispatch review and integration path. [Document lifecycle](document-lifecycle.md) governs consumed handoffs and obsolete prose.

## Freeze record

Record only material needed to resume:

- Issue and brief revision, actual task/workspace, current writer, branch, base and candidate head;
- artifact state: complete, partial, invalid or deliberately omitted;
- paths and reusable discoveries grouped by outcome;
- incompatibilities with the accepted baseline and qualitative migration/deletion cost;
- unanswered questions with their evidence source or decision owner;
- any exploratory challenge actually used; and
- one Resume Prompt that states the next scope without silently authorizing implementation.

Assignment and verification details are linked from Orca dispatch records, not copied into a new control board or receipt protocol.

## Context firewall

Fresh exploration and review consume the Issue, accepted owners and a concise evidence packet. A packet may contain the canonical base, relevant contexts/ADRs, audited freeze conclusions, a bounded problem register and direct evidence paths.

Label each item accepted, candidate, proposed, deferred, rejected or evidence-only. A conclusion without accepted authority or direct evidence is a question. Exclude full author conversations, chain-of-thought, raw tool logs, reconstructed transcripts, unreviewed scratch and unnamed archives. A review brief is not the author's conversation history.

## Coordination loop

1. Query the [Dispatch Register](dispatch-register.md), resolve the baseline and write the bounded question.
2. Assign work and ownership through Orca dispatch; parallelize only independent disjoint outcomes.
3. Observe actual task/workspace state and collect conclusions rather than copying transcripts.
4. Resolve contradictions into a decision question, bounded investigation or ADR proposal.
5. When useful, commission an independent exploratory challenge and identify its advisory scope.
6. Present one recommended decision with tradeoffs and rejected alternatives.
7. Record accepted semantics in their owner, remove conflicting obsolete clauses, and route any concrete document PR through the required Reviewer.

## Architecture-to-implementation boundary

Exploration is complete when the architecture is coherent, affected decisions and migration direction are explicit, material uncertainty is visible and the Owner accepts it. Product work begins only under the separate implementation scope and plan slice. No mandatory proof spike or extra hosted architecture gate is introduced by this runbook.

Durable authority remains in contexts/ADRs, work scope in the Issue, live execution in Orca, integration status in PROGRESS and delivery order in the development plan.
