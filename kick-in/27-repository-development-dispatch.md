# Repository Development Dispatch

## Scope

This runbook governs repository-development work performed through Codex Task Sessions. It is not AI7 product runtime behavior, a Model Role, a Provider Resolution Plan, a Harness Session, or a second product agent loop. [ADR 0059](../docs/adr/0059-dispatch-repository-work-through-issue-bound-codex-task-sessions.md) owns the decision; this file owns the operating detail.

## Roles and fixed bindings

| Role or class | Binding | Authority |
| --- | --- | --- |
| **Commander** | `gpt-5.6-sol @ ultra` | Holds the owner's foreground session; shapes T0 work and Issues, dispatches, accepts reports, integrates, and alone takes external actions |
| **T1 Worker** — mechanical | `gpt-5.6-luna @ medium` | Executes one exact brief in its own branch/worktree and reports |
| **T2 Worker** — standard build | `gpt-5.6-terra @ high` | Executes one exact brief in its own branch/worktree and reports |
| **T3 Worker** — high-stakes | `gpt-5.6-sol @ xhigh` | Executes one exact brief in its own branch/worktree and reports |
| **Reviewer** | Same binding as the reviewed T1/T2/T3 class | Starts fresh, remains read-only and non-author, and returns advisory findings |

T0 clarification, Issue shaping, dispatch, acceptance, integration, and every external action stay with the Commander. The Commander does not perform T1–T3 controlled-file work inline. Every T1–T3 Worker and every Reviewer starts in a fresh top-level Codex Task Session; never fork, reuse, or convert the Commander, another role, or an earlier attempt.

`T3-par` is only the name for Commander coordination of independent T1, T2, or T3 Task Sessions. It is not a task class, binding row, or permission for in-session subagents.

Role authority is invariant across bindings:

- A Worker may read the repository, write only its own worktree and branch, run the authorized Local diagnostic/Local completion sequence, commit locally when instructed, and report. It never pushes, changes an Issue or pull request, merges, publishes, archives tasks, reads or writes credentials or protected material, or takes another external action.
- A Reviewer reads the Issue, Launch Receipt, branch, and applicable authority from fresh context. It never authors the reviewed change, writes the branch, dispatches another task, integrates, or takes an external action. Its verdict is advisory and never becomes a pull-request, CI, exact-head, zero-finding, or iterative-review gate.
- The Commander alone may create or revise Issues, post receipts, create or archive Task Sessions, push, manage Draft/Ready state, merge, release, or publish within separately authorized scope.

## Task classes and no fallback

| Class | Test | Examples |
| --- | --- | --- |
| **T0** | Scope or authority still requires Commander/Owner judgment | Ambiguous scope, a brief in doubt, or an unresolved authority decision |
| **T1** | Correctness needs little judgment and can be checked mechanically | Format repair, exact index update, path rename |
| **T2** | A written brief and existing seam make the build straightforward | Bounded vertical slice, E2E journey, ordinary defect repair |
| **T3** | The work changes or records high-stakes boundaries | Architecture, domain, ADR, authority, Effect, credentials, recovery, replay, source scope |

There is no automatic fallback. If the specified model or effort is unavailable, the Commander records a Launch Receipt with `launch_result: launch-unavailable`, starts no Worker or Reviewer turn, closes that attempt with a `failed` Return Receipt, and leaves the Issue incomplete. A different Codex binding requires a material Issue-body revision with its reason, a new attempt, and a fresh Task Session. Never downgrade or relabel the class, and never substitute Commander inline execution.

## Canonical Issue identity

The GitHub Issue body is the canonical current Change Brief. It states:

- `Brief revision` as an integer;
- the main Worker role and task class;
- the exact model and reasoning effort;
- exact base, named branch, requested fresh-worktree mode, and intended target;
- target-qualified authority, outcome, reuse anchor, structural budget, non-goals, stop conditions, validation, and external-action boundary.

The body hash is SHA-256 over the exact UTF-8 bytes of the GitHub API `body` string. Do not include a newline added by a CLI or display layer.

Before `create_thread`, a material body change—role, class, binding, outcome, authority, base/target, branch/worktree ownership, structural budget, non-goals, stop conditions, validation, or reporting/external-action boundary—requires an incremented `Brief revision`. A pre-launch editorial-only body edit may keep the revision when the contract is unchanged, but the Commander recomputes the hash. The `create_thread` request freezes the expected revision/hash. Any later body-byte change prevents or invalidates that attempt; after a Launch Receipt it always requires an incremented revision, new attempt, and fresh Task Session, even when editorial-only. Comments, labels, and assignments outside the body do not restart an attempt.

One Task Session identity is `Issue + role + attempt`. A follow-up may reuse that session only while its role, attempt, Brief revision/body bytes, requested binding, role-specific start commit, exact base/target, and authority remain unchanged. A Worker starts at the exact integration base. A Reviewer starts at the immutable completed authoring commit recorded as `reviewed_head`. Start a new attempt and fresh Task Session for a new role; any post-launch Issue-body byte change; a new binding; an unavailable-launch rebind; a reroute or mismatch response; an exact base/target or `reviewed_head` rebind; or a superseded or cancelled attempt.

## Two-stage launch

`create_thread` atomically sends the first prompt before it returns the Task Session ID, so a complete receipt cannot exist before launch. Use this sequence:

1. The Commander prepares the role-specific exact start, preallocates a unique `dispatch_id`, computes the Issue-body hash, and requests a fresh isolated Codex worktree from that commit. For a Worker, it creates the work-ready Issue and named task branch from the exact integration base. For a Reviewer, it fixes the completed authoring commit as immutable `reviewed_head`; the Reviewer receives no branch ownership. The app-managed worktree path and Task/client ID do not yet exist and cannot be placed in the first prompt.
2. The Commander launches a fresh Task with a first prompt containing only the Issue URL, dispatch ID, expected Brief revision/body hash, role/class/binding, named branch, exact base/target, the `reviewed_head` when the role is Reviewer, and a no-write bootstrap-preflight instruction. The prompt requires the Task to report its actual cwd/worktree and current branch-or-detached state.
3. The Worker or Reviewer reads root `AGENTS.md`, the Issue, and those immutable launch expectations, then verifies the hash, actual checkout at the role-specific start commit, and every start/stop condition read-only. It reports `preflight-ready` or `needs-commander` and stops without expecting a Receipt or editing controlled files.
4. After `create_thread` returns the Task/client ID and that first turn stops, the Commander verifies the generated worktree path and clean checkout at the role-specific start. If a Worker checkout is detached, the Commander may attach it to the pre-created Issue branch only while it is clean and still at the exact integration base. A Reviewer stays detached and read-only at `reviewed_head`; never attach it to the branch. The Commander then posts the finalized Launch Receipt as one GitHub Issue comment and sends only that immutable comment permalink as the follow-up.
5. The Worker or Reviewer fetches the exact comment, verifies every field against the Issue, task, checkout and preflight facts, and only then begins authorized work. A mismatch returns `needs-commander` without a controlled-file edit.

There is no mutable `pending` receipt and no claim that task creation plus receipt publication is atomic.

Task titles use exactly `[#<issue>] <role> A<attempt> — <issue title>`.

## Receipts and binding evidence

Each attempt has exactly one standardized Launch Receipt and one Return Receipt as GitHub Issue comments. The Issue body owns the brief; receipts own attempt evidence and must not restate or revise the brief. Once posted, a receipt comment is immutable: never edit or delete it. If it is wrong, close or supersede that attempt with its Return Receipt and start a new attempt.

The Launch Receipt records:

- schema version, `dispatch_id`, Issue, role, class, attempt, Brief revision and body hash;
- `requested_binding`, `launch_accepted_binding`, and `runtime_model_event` at launch;
- `reported_execution_binding`, explicitly labeled as inference from launch acceptance plus observed runtime events, never proof of the effective model;
- Task Session ID, client thread ID when present, title, branch, worktree, exact base and intended target, plus the immutable `reviewed_head` for a Reviewer;
- creation timestamp, `launch_result: accepted | launch-unavailable`, and live status at receipt when a Task exists.

The Return Receipt records:

- the same dispatch/Issue/role/class/attempt identity;
- terminal status `completed | needs-commander | failed | cancelled | superseded`;
- final `runtime_model_event` and inferred `reported_execution_binding` with the same non-attestation label;
- exact head and concise outcome, validation state, unresolved matters, and safe next action;
- Task live status, GitHub Issue state, pull-request state/reference, and timestamp.

A Reviewer Return Receipt repeats the exact `reviewed_head` from its Launch Receipt and also records the reviewed class and `class_match`. Set `class_match: true` only when `requested_binding` and `launch_accepted_binding` both equal the fixed reviewed-class binding and `runtime_model_event` is `none`. A self-report never satisfies the match; `rerouted` or `mismatch` stops the attempt. The Reviewer binding lives in that Reviewer's own Launch/Return Receipts, not in the Issue's main Worker binding block.

`runtime_model_event` is `none`, `rerouted`, or `mismatch`. An observed reroute or mismatch stops the attempt and requires Commander resolution plus a fresh attempt before controlled-file work continues. A model self-report is not attestation. This Codex-only workflow has no provider field and no unqualified `actual model` field.

Only the Commander posts the terminal Return Receipt after accepting the Worker or Reviewer report. Keep three state namespaces separate:

| Namespace | Values |
| --- | --- |
| Codex Task live status | `setup-pending | running | needs-attention | idle` |
| Attempt terminal status | `completed | needs-commander | failed | cancelled | superseded` |
| GitHub state | Issue and pull-request states from GitHub |

`idle` never means `completed`.

## Dispatch and parallel work

- One Issue owns one branch, one pull request, and one writable Worker. Never give two writers the same branch, worktree, or controlled paths.
- When two or more work-ready Issues are independent, the Commander should author them concurrently, with at most three active Worker Task Sessions. Do not split work merely to fill slots.
- Parallel branches consume only stable owners and interfaces on current `dev`; they never depend on unintegrated candidate code or overlap controlled responsibility.
- Product integration remains serial. After each integration, every remaining branch re-resolves authority and base, rebases, and revalidates. Because that changes the exact base/target binding, its old attempt stops; the Commander records the terminal status and launches a fresh attempt/Task before any further controlled-file work.
- The live project view is the query-only [Dispatch Register](../docs/agents/dispatch-register.md). Do not create a central mutable Git ledger, daemon, database, host connector, query script, or workflow.

## Local completion and return

A Worker follows the applicable Change Brief and [incremental development lifecycle](../docs/agents/incremental-development.md). Product work restores only accepted pins, uses payload-safe diagnostics when useful, and completes the repository-root `doctor` → `bootstrap` → `build` → applicable Journey sequence on its supported host. Documentation/design-only work creates no automated proof and runs only its named checks.

The final Worker report contains:

- role, task class, Issue/attempt/dispatch identity;
- requested and launch-accepted binding;
- final runtime model event and inferred reported execution binding, never an attestation;
- exact base/head, host, planned versus actual structural delta, changed paths, reuse/new-owner disposition, authority/data impact, cleanup, validation commands/outcomes, unresolved matters, and one safe next action;
- `Local diagnostic` or `Local completion` for product work, or the exact non-behavior validation state for documentation/design-only work.

Do not include raw logs, proof artifacts, credentials, Provider payloads, private material, or personal dependency state. A Worker stops and returns `needs-commander` when the Issue is wrong, the structural budget must expand, authority or semantics drift, a required dependency/process/schema is missing from scope, protected material would be exposed, or required validation fails outside the authorized change.

The Commander audits the returned report and branch state, posts the Return Receipt, and alone performs authorized external integration. Pull requests remain Draft during authoring, review, rebase, and local validation. The current [CI boundary](../docs/agents/ci-test-boundaries.md) governs Local completion and Hosted Gate evidence; no dispatch or review receipt is a new gate.

## Review and retention

Independent review is optional and advisory unless an exact Owner/Issue instruction requests one. After an authoring head is locally complete, the Commander fixes that exact commit as immutable `reviewed_head` and launches the Reviewer from it as a separate fresh attempt at the reviewed class's binding. The Reviewer verifies its checkout and Launch Receipt against `reviewed_head`, reads the canonical Issue from fresh context, and never reuses the Worker task or transcript. After accepting the review report, the Commander repeats that same head in the Return Receipt.

Keep a completed Worker or Reviewer Task visible through the Issue's merge, close, or abandonment, then the Commander archives it. A `needs-commander` task remains visible. A `superseded` or `cancelled` attempt receives a Return Receipt and is archived immediately. Codex Task archival is task retention; it is distinct from repository `docs/archive/` document lifecycle.

## Decision summary

Accepted in Question 25, replaced by the Owner on 2026-09-03, and recorded in ADR 0059:

- fixed Codex-only bindings by role/class;
- fresh Issue-bound Task Sessions for every Worker, Reviewer, role, and attempt;
- a two-stage verified Launch Receipt and Commander-authored Return Receipt;
- no fallback, runtime-model attestation claim, or Commander inline T1–T3 substitute;
- queryable Issue receipts plus built-in task tools instead of orchestration infrastructure; and
- bounded parallel authoring with serial product integration and fresh attempts after target drift.
