# Multi-session design workflow

Status: **binding for architecture and design forks when referenced by `AGENTS.md`**

This runbook specializes the Issue-bound Codex Commander, Worker, and optional Reviewer rules in [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md). Under ADR 0027, design validation is intentionally light: hostile review is advisory and source/evidence proof is not an architecture gate.

## Invariants

1. During development, `dev` is the current implementation-facing design and integration line. `main` is the protected stable/release-promotion line and advances only through a separately Owner-authorized promotion. A branch, task, prototype, review, frozen-source artifact, or handoff remains qualified evidence until the Owner accepts the change and the Commander integrates it into the intended line through the normal pull-request path.
2. One writing Issue has one branch, one worktree, one writable Worker, and a fresh Task Session for each attempt. Never give two Tasks write authority over the same checkout or file set.
3. The Commander owns T0 Issue shaping, the freeze point, dispatch, conflict resolution, acceptance proposal, integration decision, receipts, and every external action; it does not perform T1–T3 controlled-file work inline.
4. A Worker whose brief is frozen may finish only work already materially underway. It may not add architecture assumptions, widen scope, or treat another candidate branch as canonical.
5. A Reviewer starts in a separate fresh top-level Codex Task Session at the immutable completed candidate commit recorded as `reviewed_head`, from the Issue and its own Launch Receipt, never the authoring Task transcript. Architecture review and hostile challenge are Reviewer assignments, not new roles.
6. Accepted ADRs and canonical context definitions outrank summaries. Candidate revisions must identify every accepted decision they would supersede; they never rewrite history silently.
7. Design exploration and product implementation are separate authorization boundaries. An exploration outcome cannot start scaffolding, dependency installation, implementation issue decomposition, or a product branch by implication.
8. Archives are historical storage, never additional design lines. New work consumes current authority owners and Commander-curated conclusions; it reads an exact archive artifact only when a current record names a blocking historical question.

## Task states

### Legacy line

| State | Meaning | Permitted transition |
| --- | --- | --- |
| `active` | The original brief is still executing. | `freeze-requested` |
| `freeze-requested` | Commander has stopped new scope and new assumptions. | `freeze-validating` |
| `freeze-validating` | Existing artifacts are being cleaned, summarized, and committed as a candidate head. | `frozen` or `needs-commander` |
| `freeze-reviewing-head` | Optional historical/advisory review state; no exact-head pass is required. | `frozen`, `freeze-validating`, or `needs-commander` at Commander discretion |
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

The Commander records the freeze brief in the Issue body with its revision, exact binding/base/target, branch, allowed finishing work, prohibited expansion, validation, and external-action boundary. A material change starts a fresh attempt/Task. The Worker then:

1. stops starting new sub-tasks and new design decisions;
2. finishes only already-created or materially underway artifacts;
3. removes or relocates scratch outputs that must not enter Git;
4. writes a freeze handoff using the schema below;
5. reports the safe next action in its Task response for the Commander-authored Return Receipt;
6. creates a local candidate commit when the branch is coherent;
7. records any obvious unresolved assumption without launching a proof task;
8. may be followed by a separate fresh advisory Reviewer Task when the Commander requests it; and
9. stops without pushing, opening a pull request, merging, publishing, or dispatching more work.

The Commander marks a line `frozen` and posts the Return Receipt after checking the final report, branch head, worktree status, and handoff. Validation evidence and an exact-head review are not required.

Freeze is a document-lifecycle node. After the Issue receipt and any separately authorized Commander-owned root routing are current, run the scoped [archive sweep](document-lifecycle.md) for superseded packets, handoffs, and scratch. Do not archive a still-unconsumed freeze handoff itself.

## Freeze record schema

Every legacy freeze record consists of the Worker handoff plus the Commander control-board or packet-manifest entry. Together they contain these fields. The Worker records what is knowable before commit, and the Commander records the candidate head and any optional review reference afterward.

- **Identity:** Issue, role, attempt, dispatch/Task ID, requested and launch-accepted binding, runtime model event, inferred reported execution binding, branch, worktree, base commit, and candidate head commit; when optional review occurs, its Launch and Return Receipts both record that candidate commit as `reviewed_head`.
- **Artifact status:** complete, partial, invalid, or deliberately omitted; candidate/reference status stated explicitly.
- **Changed paths:** grouped by outcome rather than a raw transcript.
- **Reusable assets:** requirements, domain discoveries, boundary cases, evidence, interfaces, prototypes, or tests worth inheriting.
- **Incompatibilities:** assumptions that conflict with the exact intended target (normally current `dev`), another candidate line, or the accepted V2 direction.
- **Migration cost:** expected rewrite, adapter, evidence, or deletion cost; use qualitative estimates unless measured.
- **Open matters:** unanswered questions and unverified claims, each with its authoritative source or required evidence.
- **Optional diagnostics/review:** include only when actually used; neither is required to freeze a design branch.
- **Resume Prompt:** one sentence that does not silently authorize implementation.

## Context-contamination firewall

New architecture work consumes the canonical Issue and a review packet assembled by the Commander. Root routers appear only when the Issue names them. The packet may include:

- the exact canonical base commit;
- `AGENTS.md`, normalized project overview, decision map, context map, applicable context definitions, and accepted ADRs;
- Commander-audited freeze handoffs;
- a concise known-problems register; and
- direct evidence paths needed to verify a claim.

It excludes:

- full task or chat transcripts;
- raw or reconstructed design conversations;
- another task's active worktree;
- unreviewed scratch notes;
- archive directories not named by the current packet for one exact historical question;
- chain-of-thought, tool logs, and failed intermediate drafts; and
- candidate conclusions presented without their status.

Every packet item is labeled `accepted`, `candidate`, `proposed`, `deferred`, `rejected`, or `evidence-only`. When a conclusion cannot be traced to an accepted decision or direct evidence, the architecture task treats it as a question.

## Dispatch shape

Use one coherent design authority and independent challenge:

| Assignment | Repository role | Write authority | Primary output |
| --- | --- | --- | --- |
| Design control and integration | Commander | Commander's issue branch only | Control board, curated packet, decision proposal |
| Legacy completion | Worker | Its existing branch/worktree only | Frozen candidate assets and handoff |
| Architecture review | Reviewer | Fresh read-only Task; any later authoring uses a new Issue-bound Worker Task | v1 assumptions, root causes, inheritance matrix, v2 principles, exploration map |
| Hostile architecture challenge | Reviewer | Read-only | Failure modes, missing evidence, and verdict |
| Accepted architecture drafting | Worker, only after a written brief | A new issue branch/worktree | Coherent architecture/ADR candidate |

Run at most three active Worker Task Sessions. When two or more work-ready Issues are independent, the Commander should dispatch them concurrently; never split work to fill slots. Reviewer work does not authorize a competing architecture line; the Commander chooses what advances.

## Commander control loop

1. Query the [Dispatch Register](dispatch-register.md), record the canonical base, and shape each work-ready Issue.
2. Launch fresh Tasks through the two-stage receipt protocol; do not rely on Tasks reading one another.
3. Observe live status with built-in task tools rather than copying histories into a control file.
4. Audit returned reports, handoffs, and branch state; then post the accepted Return Receipt.
5. Update the review packet with conclusions, not transcripts.
6. Resolve contradictions into an explicit question, evidence Task, or superseding ADR proposal.
7. Optionally dispatch one fresh high-level hostile Reviewer against the coherent candidate; do not turn it into an exact-head proof cycle.
8. Present one recommended decision to the owner, with trade-offs and rejected alternatives.
9. Record acceptance immediately in the authority-owning documents; otherwise keep the item candidate, revised, or deferred.

## Architecture-to-implementation gate

Architecture exploration does not end because legacy tasks are closed. It ends only when all of the following are true:

- one coherent architecture document is complete;
- core trade-offs and rejected alternatives are explicit;
- every affected accepted ADR is kept, superseded, or deferred explicitly;
- migration direction is credible;
- important assumptions are stated plainly, without mandatory evidence spikes;
- any advisory hostile-review concerns the Commander considers material are visible to the owner;
- the owner has explicitly accepted the architecture; and
- the owner separately authorizes implementation planning.

## Durable records

- Current brief and terminal attempt evidence: the canonical GitHub Issue body plus its Launch/Return Receipts.
- Current Task liveness and retention: the query-only [Dispatch Register](dispatch-register.md) over built-in Codex task tools.
- Current integration-line routing: Commander-owned root [`PROGRESS.md`](../../PROGRESS.md) and [`HANDOFF.md`](../../HANDOFF.md).
- Accepted domain authority: [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) and its routed context owners.
- Document lifecycle: [Document lifecycle and archiving](./document-lifecycle.md).

The earlier architecture-exploration control board, review packet, and known-problems register remain source-qualified Git-history evidence only; they are excluded from the active V2 development baseline and are not routing targets. Increment the Issue Brief revision for every material contract change; ordinary dispatch, freeze, review, acceptance, branch-head, and terminal attempt evidence belongs in standardized receipts. Root routers change only when Commander integration routing changes. Archive at most the defined node-level outgoing snapshot, and only at the defined lifecycle nodes.
