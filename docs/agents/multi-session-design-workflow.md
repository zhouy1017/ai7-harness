# Multi-session design workflow

Status: **binding for architecture and design forks when referenced by `AGENTS.md`**

This runbook specializes the provider-neutral Commander, Worker, and Reviewer rules in [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md). It does not add a fourth repository role, change the task-class floor, or describe AI7 product runtime behavior.

## Invariants

1. `main` is the only canonical design line. A branch, task, prototype, review, or handoff is candidate evidence until the owner accepts the change and the Commander integrates it through the normal pull-request path.
2. One writing task has one branch, one worktree, and one Worker. Never give two tasks write authority over the same checkout or file set.
3. The Commander owns the freeze point, dispatch, conflict resolution, acceptance proposal, integration decision, and every external action.
4. A Worker whose brief is frozen may finish only work already materially underway. It may not add architecture assumptions, widen scope, or treat another candidate branch as canonical.
5. A Reviewer starts from fresh, curated context, never the authoring task transcript. Architecture review and hostile challenge are Reviewer assignments, not new roles.
6. Accepted ADRs and canonical context definitions outrank summaries. Candidate revisions must identify every accepted decision they would supersede; they never rewrite history silently.
7. Design exploration and product implementation are separate authorization boundaries. An exploration outcome cannot start scaffolding, dependency installation, implementation issue decomposition, or a product branch by implication.

## Task states

### Legacy line

| State | Meaning | Permitted transition |
| --- | --- | --- |
| `active` | The original brief is still executing. | `freeze-requested` |
| `freeze-requested` | Commander has stopped new scope and new assumptions. | `freeze-validating` |
| `freeze-validating` | Existing artifacts are being cleaned, checked, summarized, and committed as a candidate head. | `freeze-reviewing-head` or `needs-commander` |
| `freeze-reviewing-head` | An independent Reviewer is checking the exact immutable candidate head. | `frozen` when it passes with no later change; otherwise `freeze-validating` or `needs-commander` |
| `frozen` | A local head commit and structured handoff exist; the task has stopped. | Commander review only |
| `needs-commander` | Safe freezing needs a scope or conflict decision. | Commander supplies a narrower brief |

### Architecture exploration

| State | Meaning | Permitted transition |
| --- | --- | --- |
| `preparing` | Reviewer reads the canonical baseline and records what evidence is missing. | `exploring` |
| `exploring` | Assumptions, root problems, principles, and spikes are compared without implementation. | `challenge-ready` |
| `challenge-ready` | One coherent candidate is ready for independent T3 opposition. | `decision-ready` or `rework` |
| `decision-ready` | Trade-offs, ADR disposition, migration direction, and evidence are explicit. | Owner `accepted`, `revised`, or `deferred` |
| `accepted` | The owner explicitly accepted the architecture change and the Commander may prepare integration. | Normal review/PR flow |
| `rework` | Challenge or evidence invalidated part of the candidate. | `exploring` |
| `revised` | The owner supplied new constraints or rejected part of the candidate without accepting it. The Commander records the revision and returns the work to exploration. | `exploring` under a revised brief |
| `deferred` | The owner explicitly postponed the candidate or a bounded part of it. The Commander records the trigger for reconsideration and stops that line. | `preparing` only when the trigger fires |

No task may mark itself `accepted`, `revised`, or `deferred`. The Commander records the owner's explicit outcome in the control board and authority-owning project records.

## Freeze contract

The Commander freeze brief states the exact base commit, branch, allowed finishing work, prohibited expansion, validation required, and external-action boundary. The Worker then:

1. stops starting new sub-tasks and new design decisions;
2. finishes only already-created or materially underway artifacts;
3. removes or relocates scratch outputs that must not enter Git;
4. writes a freeze handoff using the schema below;
5. updates `PROGRESS.md` with a safe next action;
6. validates links, terminology, syntax, and task-specific evidence in proportion to risk;
7. creates a local candidate commit when the branch is coherent;
8. obtains the required independent review against the exact immutable base-to-head diff, recording the reviewed head SHA;
9. if a finding causes any change, creates a new candidate commit and repeats exact-head review; and
10. stops without pushing, opening a pull request, merging, publishing, or dispatching more work.

The Commander marks a line `frozen` only after checking the final report, branch head, worktree status, handoff, validation evidence, reviewer independence disclosure, and proof that the passing review names the current head and that no change followed it.

## Freeze record schema

Every legacy freeze record consists of the Worker handoff plus the Commander control-board or packet-manifest entry. Together they contain these fields. This split avoids the impossible requirement for a commit to name its own final SHA: the Worker records what is knowable before commit, and the Commander records the immutable candidate/reviewed heads after exact-head review.

- **Identity:** task title and ID, role, task class, branch, worktree, base commit, candidate head commit, and exact reviewed head commit. Candidate and reviewed heads belong in the Commander record rather than inside the commit they identify.
- **Artifact status:** complete, partial, invalid, or deliberately omitted; candidate/reference status stated explicitly.
- **Changed paths:** grouped by outcome rather than a raw transcript.
- **Reusable assets:** requirements, domain discoveries, boundary cases, evidence, interfaces, prototypes, or tests worth inheriting.
- **Incompatibilities:** assumptions that conflict with canonical `main`, another candidate line, or the proposed v2 direction.
- **Migration cost:** expected rewrite, adapter, evidence, or deletion cost; use qualitative estimates unless measured.
- **Open matters:** unanswered questions and unverified claims, each with its authoritative source or required evidence.
- **Verification:** commands/checks run and their results.
- **Review:** reviewer identity, class, exact base and head reviewed, verdict, findings, cross-provider status, and whether any post-review change occurred. Any post-review change invalidates the verdict until the new head is reviewed.
- **Resume Prompt:** one sentence that does not silently authorize implementation.

## Context-contamination firewall

New architecture work consumes a review packet assembled by the Commander. It may include:

- the exact canonical base commit;
- `AGENTS.md`, `HANDOFF.md`, normalized project overview, decision map, context map, applicable context definitions, and accepted ADRs;
- Commander-audited freeze handoffs;
- a concise known-problems register; and
- direct evidence paths needed to verify a claim.

It excludes:

- full task or chat transcripts;
- raw or reconstructed design conversations;
- another task's active worktree;
- unreviewed scratch notes;
- chain-of-thought, tool logs, and failed intermediate drafts; and
- candidate conclusions presented without their status.

Every packet item is labeled `accepted`, `candidate`, `proposed`, `deferred`, `rejected`, or `evidence-only`. When a conclusion cannot be traced to an accepted decision or direct evidence, the architecture task treats it as a question.

## Dispatch shape

Use one coherent design authority and independent challenge:

| Assignment | Repository role | Write authority | Primary output |
| --- | --- | --- | --- |
| Design control and integration | Commander | Commander's issue branch only | Control board, curated packet, decision proposal |
| Legacy completion | Worker | Its existing branch/worktree only | Frozen candidate assets and handoff |
| Architecture review | Reviewer | Read-only unless later dispatched as a Worker on a new issue | v1 assumptions, root causes, inheritance matrix, v2 principles, exploration map |
| Hostile architecture challenge | Reviewer | Read-only | Failure modes, missing evidence, and verdict |
| Accepted architecture drafting | Worker, only after a written brief | A new issue branch/worktree | Coherent architecture/ADR candidate |

The soft cap of three concurrent Workers still applies. Reviewer work does not authorize a competing architecture line; the Commander chooses what advances.

## Commander control loop

1. Record the canonical base and current task registry in the control board.
2. Send scoped briefs; do not rely on tasks reading one another.
3. Observe milestone snapshots rather than repeatedly pulling full histories.
4. Audit returned handoffs and branch state before feeding conclusions forward.
5. Update the review packet with conclusions, not transcripts.
6. Resolve contradictions into an explicit question, evidence task, or superseding ADR proposal.
7. Dispatch an independent T3 challenge against the coherent candidate.
8. Present one recommended decision to the owner, with trade-offs and rejected alternatives.
9. Record acceptance immediately in the authority-owning documents; otherwise keep the item candidate, revised, or deferred.

## Architecture-to-implementation gate

Architecture exploration does not end because legacy tasks are closed. It ends only when all of the following are true:

- one coherent architecture document is complete;
- core trade-offs and rejected alternatives are explicit;
- every affected accepted ADR is kept, superseded, or deferred explicitly;
- migration direction is credible;
- security, platform, package-composition, data-scale, and UX claims are either evidenced or assigned to a named spike with exit criteria;
- an independent Reviewer at T3 or above has challenged the candidate;
- material findings are resolved or consciously accepted;
- the owner has explicitly accepted the architecture; and
- the owner separately authorizes implementation planning.

## Durable records

- Current task state: [Architecture Exploration Control Board](../architecture-exploration/CONTROL.md)
- Curated inputs: [Architecture Review Packet](../architecture-exploration/REVIEW-PACKET.md)
- Open tensions: [Known Problems](../architecture-exploration/KNOWN-PROBLEMS.md)
- Session checkpoint: root `PROGRESS.md`

Update the control board after dispatch, freeze, review, acceptance, or a branch-head change. Update `PROGRESS.md` after each completed sub-task as required by `AGENTS.md`.
