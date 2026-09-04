# Repository Development Dispatch

## Scope

This runbook governs repository-development work performed through Task Sessions on either supported harness, Codex or Claude Code, routed by the Commander's own harness. It is not AI7 product runtime behavior, a Model Role, a Provider Resolution Plan, a Harness Session, or a second product agent loop. [ADR 0061](../docs/adr/0061-route-repository-dispatch-by-commander-harness.md) owns the decision; this file owns the operating detail. [ADR 0059](../docs/adr/0059-dispatch-repository-work-through-issue-bound-codex-task-sessions.md) and [ADR 0060](../docs/adr/0060-dispatch-repository-work-through-issue-bound-claude-code-sessions.md) are the superseded single-harness predecessors whose route texts continue here.

A **Task Session** is one fresh top-level session of the Commander's harness with its own isolated worktree. One attempt never mixes harnesses.

## Harness routes

| Concern | `codex` route | `claude-code` route |
| --- | --- | --- |
| Task Session | Fresh top-level Codex Task Session in the Codex desktop app | Fresh top-level Claude Code session in the Claude desktop app (Code tab) |
| Worktree | App-managed `~/.codex/worktrees/<id>/ai7-harness`, detached at the requested commit | `.claude/worktrees/<name>` inside the main checkout on the app-generated `claude/<name>` branch, created from the main checkout's current branch and excluded through `.git/info/exclude`; keep names short because Windows dependency paths grow with them |
| Create session | `create_thread`, a Commander tool that sends the first prompt atomically and returns the Task Session ID afterwards | Owner/Commander creates the session by hand with worktree isolation and the exact model and effort |
| Overview / detail / wait | `list_threads` / `read_thread` / `wait_threads` | `list_sessions` / `get_session` plus `list_events` / no blocking wait, re-query when needed |
| Follow-up message | `send_message_to_thread` | `send_message` |
| Title / retire | Task title at creation / `set_thread_archived` | `set_session_title` / `archive_session`, confirmed by the Owner and removing the worktree |
| Launch-acceptance evidence | The accepted `create_thread` request plus observed runtime events | `get_session` fields `model` and `effort` plus any app fallback or switch notice |
| Live-status values | `setup-pending | running | needs-attention | idle` | `running | idle | archived` |
| Session identity fields | `session_id` is the Task Session ID; `client_thread_id` when present | `session_id` is the desktop `sessionId` |
| Attach step for a Worker | Attach the clean detached checkout to the pre-created Issue branch | Reset a clean checkout to the exact start when needed, then rename the app-generated branch to the reserved Issue branch |
| Commit trailer | `Co-authored-by: OpenAI Codex <codex@openai.com>` | `Co-Authored-By: Claude <noreply@anthropic.com>` |

## Roles and fixed bindings

| Role or class | `codex` binding | `claude-code` binding | Authority |
| --- | --- | --- | --- |
| **Commander** | `gpt-5.6-sol @ ultra` | `claude-fable-5-1 @ xhigh` | Holds the owner's foreground session; shapes T0 work and Issues, dispatches, accepts reports, integrates, and alone takes external actions |
| **T1 Worker** — mechanical | `gpt-5.6-luna @ medium` | `claude-sonnet-5 @ medium` | Executes one exact brief in its own branch/worktree and reports |
| **T2 Worker** — standard build | `gpt-5.6-terra @ high` | `claude-opus-5 @ high` | Executes one exact brief in its own branch/worktree and reports |
| **T3 Worker** — high-stakes | `gpt-5.6-sol @ xhigh` | `claude-fable-5-1 @ xhigh` | Executes one exact brief in its own branch/worktree and reports |
| **Reviewer** | Same binding as the reviewed T1/T2/T3 class on the Commander's harness | Same binding as the reviewed T1/T2/T3 class on the Commander's harness | Starts fresh, remains read-only and non-author, and returns advisory findings |

The effort label is the harness's own reasoning-effort level for the session.

T0 clarification, Issue shaping, dispatch, acceptance, integration, and every external action stay with the Commander. The Commander does not perform T1–T3 controlled-file work inline. Every T1–T3 Worker and every Reviewer starts in a fresh top-level Task Session on the Commander's harness; never fork, reuse, or convert the Commander, another role, or an earlier attempt.

`T3-par` is only the name for Commander coordination of independent T1, T2, or T3 Task Sessions. It is not a task class, binding row, or permission to use in-session subagents as writers. A Worker or Reviewer session may use read-only exploration subagents only inside its own worktree; they never write, never become a second writer, and never form a separate attempt identity.

Role authority is invariant across harnesses and bindings:

- A Worker may read the repository, write only its own worktree and branch, run the authorized Local diagnostic/Local completion sequence, commit locally when instructed, and report. It never pushes, changes an Issue or pull request, merges, publishes, archives sessions, reads or writes credentials or protected material, or takes another external action.
- A Reviewer reads the Issue, Launch Receipt, branch, and applicable authority from fresh context. It never authors the reviewed change, writes the branch, dispatches another task, integrates, or takes an external action. Its verdict is advisory and never becomes a pull-request, CI, exact-head, zero-finding, or iterative-review gate.
- The Commander alone may create or revise Issues, post receipts, create or archive Task Sessions, push, manage Draft/Ready state, merge, release, or publish within separately authorized scope.

## Task classes and no fallback

| Class | Test | Examples |
| --- | --- | --- |
| **T0** | Scope or authority still requires Commander/Owner judgment | Ambiguous scope, a brief in doubt, or an unresolved authority decision |
| **T1** | Correctness needs little judgment and can be checked mechanically | Format repair, exact index update, path rename |
| **T2** | A written brief and existing seam make the build straightforward | Bounded vertical slice, E2E journey, ordinary defect repair |
| **T3** | The work changes or records high-stakes boundaries | Architecture, domain, ADR, authority, Effect, credentials, recovery, replay, source scope |

There is no automatic fallback across models, efforts, or harnesses. If the specified model or effort is unavailable, the Commander records a Launch Receipt with `launch_result: launch-unavailable`, starts no Worker or Reviewer turn, closes that attempt with a `failed` Return Receipt, and leaves the Issue incomplete. A different binding requires a material Issue-body revision with its reason, a new attempt, and a fresh Task Session. Never downgrade or relabel the class, and never substitute Commander inline execution. An automatic model fallback or switch that the harness reports during an attempt is a `rerouted` runtime model event and stops the attempt.

## Canonical Issue identity

The GitHub Issue body is the canonical current Change Brief. It states:

- `Brief revision` as an integer;
- the main Worker role and task class;
- one requested binding per harness, `Requested binding (codex)` and `Requested binding (claude-code)`, each the fixed class binding of that harness;
- exact base, named branch, requested fresh-worktree mode, and intended target;
- target-qualified authority, outcome, reuse anchor, structural budget, non-goals, stop conditions, validation, and external-action boundary.

Both binding lines are frozen by the body hash, so either Commander may launch the Issue without a body change. A body that carries only a single legacy `Requested binding:` line binds only the harness of that model family; adding the other harness's line is a material revision. The launching Commander records its `harness` and the selected line as `requested_binding`.

The body hash is SHA-256 over the exact UTF-8 bytes of the GitHub API `body` string. Do not include a newline added by a CLI or display layer, and never hash rendered `gh issue view` output. This byte-preserving command works in bash and PowerShell and needs only the Node runtime the repository already requires:

```text
gh api repos/<owner>/<repo>/issues/<n> | node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8')).body;process.stdout.write(require('crypto').createHash('sha256').update(Buffer.from(b,'utf8')).digest('hex'))"
```

Before the session is created, a material body change—role, class, either binding, outcome, authority, base/target, branch/worktree ownership, structural budget, non-goals, stop conditions, validation, or reporting/external-action boundary—requires an incremented `Brief revision`. A pre-launch editorial-only body edit may keep the revision when the contract is unchanged, but the Commander recomputes the hash. The session-creation request freezes the expected revision/hash. Any later body-byte change prevents or invalidates that attempt; after a Launch Receipt it always requires an incremented revision, new attempt, and fresh Task Session, even when editorial-only. Comments, labels, and assignments outside the body do not restart an attempt.

One Task Session identity is `Issue + harness + role + attempt`. A follow-up may reuse that session only while its harness, role, attempt, Brief revision/body bytes, requested binding, role-specific start commit, exact base/target, and authority remain unchanged. A Worker starts at the exact integration base. A Reviewer starts at the immutable completed authoring commit recorded as `reviewed_head`. Start a new attempt and fresh Task Session for a new role or harness; any post-launch Issue-body byte change; a new binding; an unavailable-launch rebind; a reroute or mismatch response; an exact base/target or `reviewed_head` rebind; or a superseded or cancelled attempt.

## Two-stage launch

On both harnesses the session identity exists only after the first prompt is sent, so a complete receipt cannot exist before launch. Use this sequence:

1. The Commander prepares the role-specific exact start, preallocates a unique `dispatch_id`, and computes the Issue-body hash. For a Worker, it creates the work-ready Issue and names the task branch: on Codex it creates the branch from the exact integration base; on Claude Code it reserves the name and positions the main checkout on the exact start, because the app creates the worktree from the main checkout's current branch, and the branch ref itself is created in step 4 by renaming. For a Reviewer, it fixes the completed authoring commit as immutable `reviewed_head`; the Reviewer receives no branch ownership. The session ID, app-managed worktree path, and app-generated branch do not yet exist and cannot be placed in the first prompt.
2. The Commander launches a fresh Task Session on its harness—`create_thread` on Codex; a hand-created desktop session with worktree isolation, a short worktree name, and the exact requested model and effort on Claude Code—with a first prompt containing only the Issue URL, dispatch ID, expected Brief revision/body hash, harness, role/class/binding, named branch, exact base/target, the `reviewed_head` when the role is Reviewer, and a no-write bootstrap-preflight instruction. The prompt requires the session to report its actual cwd/worktree and current branch-or-detached state.
3. The Worker or Reviewer reads root `AGENTS.md`, the Issue, and those immutable launch expectations, then verifies the hash from a byte-preserving API read, the actual checkout at the role-specific start commit, and every start/stop condition read-only. It reports `preflight-ready` or `needs-commander` and stops without expecting a Receipt or editing controlled files.
4. After that first turn stops, the Commander verifies the launch-accepted binding through its harness's evidence, the generated worktree, and a clean checkout at the role-specific start. For a Worker it then applies the harness's attach step from the Harness routes table, only while the checkout is clean. A Reviewer stays detached and read-only at `reviewed_head`; never attach it to a branch. The Commander sets the session title, posts the finalized Launch Receipt as one GitHub Issue comment, and sends only that immutable comment permalink to the session.
5. The Worker or Reviewer fetches the exact comment, verifies every field against the Issue, session, checkout and preflight facts, and only then begins authorized work. A mismatch returns `needs-commander` without a controlled-file edit.

There is no mutable `pending` receipt and no claim that session creation plus receipt publication is atomic. No CLI launcher, daemon, script, or connector is part of this sequence on either harness.

Session titles use exactly `[#<issue>] <role> A<attempt> — <issue title>`.

## Receipts and binding evidence

Each attempt has exactly one standardized Launch Receipt and one Return Receipt as GitHub Issue comments, marked `<!-- ai7-dispatch-launch-receipt:v3 -->` and `<!-- ai7-dispatch-return-receipt:v3 -->`. Schema-v1 (Codex-only) and schema-v2 (Claude Code-only) receipts on earlier Issues remain historical evidence. The Issue body owns the brief; receipts own attempt evidence and must not restate or revise the brief. Once posted, a receipt comment is immutable: never edit or delete it. If it is wrong, close or supersede that attempt with its Return Receipt and start a new attempt.

The Launch Receipt records:

- schema version, `dispatch_id`, Issue, `harness`, role, class, attempt, Brief revision and body hash;
- `requested_binding` (the selected body line), `launch_accepted_binding` from the harness's launch evidence, and `runtime_model_event` at launch;
- `reported_execution_binding`, explicitly labeled as inference from launch evidence plus observed runtime events, never proof of the effective model;
- `session_id`, `client_thread_id` when Codex reports one, `session_title`, `branch`, `worktree_path`, `source_branch` on Claude Code, exact base and intended target, plus the immutable `reviewed_head` for a Reviewer;
- creation timestamp, `launch_result: accepted | launch-unavailable`, and `live_status_at_receipt` in the harness's own values when a session exists.

The Return Receipt records:

- the same dispatch/Issue/harness/role/class/attempt identity;
- terminal status `completed | needs-commander | failed | cancelled | superseded`;
- final `runtime_model_event` and inferred `reported_execution_binding` with the same non-attestation label;
- exact head and concise outcome, validation state, unresolved matters, and safe next action;
- `live_status_at_return`, GitHub Issue state, pull-request state/reference, and timestamp.

A Reviewer Return Receipt repeats the exact `reviewed_head` from its Launch Receipt and also records the reviewed class and `class_match`. Set `class_match: true` only when `requested_binding` and `launch_accepted_binding` both equal the fixed reviewed-class binding on the Commander's harness and `runtime_model_event` is `none`. A self-report never satisfies the match; `rerouted` or `mismatch` stops the attempt. The Reviewer binding lives in that Reviewer's own Launch/Return Receipts, not in the Issue's main Worker binding block.

`runtime_model_event` is `none`, `rerouted` when the harness reports an automatic model fallback or switch during the attempt, or `mismatch` when the launch-accepted binding differs from the selected requested binding. An observed reroute or mismatch stops the attempt and requires Commander resolution plus a fresh attempt before controlled-file work continues. Launch evidence is harness evidence, not a model self-report, yet it is still not proof of the effective runtime model. This workflow has no provider field and no unqualified `actual model` field.

Only the Commander posts the terminal Return Receipt after accepting the Worker or Reviewer report. Keep three state namespaces separate:

| Namespace | Values |
| --- | --- |
| Task Session live status | Codex `setup-pending | running | needs-attention | idle`; Claude Code `running | idle | archived` |
| Attempt terminal status | `completed | needs-commander | failed | cancelled | superseded` |
| GitHub state | Issue and pull-request states from GitHub |

`idle` never means `completed`. On Claude Code a permission prompt or blocking question is visible only in the desktop app and is not a receipt value.

## Dispatch and parallel work

- One Issue owns one branch, one pull request, and one writable Worker. Never give two writers the same branch, worktree, or controlled paths.
- When two or more work-ready Issues are independent, the Commander should author them concurrently, with at most three active Worker Task Sessions. Do not split work merely to fill slots.
- Parallel branches consume only stable owners and interfaces on current `dev`; they never depend on unintegrated candidate code or overlap controlled responsibility.
- Product integration remains serial. After each integration, every remaining branch re-resolves authority and base, rebases, and revalidates. Because that changes the exact base/target binding, its old attempt stops; the Commander records the terminal status and launches a fresh attempt/Task Session before any further controlled-file work.
- The live project view is the query-only [Dispatch Register](../docs/agents/dispatch-register.md). Do not create a central mutable Git ledger, daemon, database, host connector, query script, or workflow.

## Local completion and return

A Worker follows the applicable Change Brief and [incremental development lifecycle](../docs/agents/incremental-development.md). Product work restores only accepted pins, uses payload-safe diagnostics when useful, and completes the repository-root `doctor` → `bootstrap` → `build` → applicable Journey sequence on its supported host from inside its own worktree. Documentation/design-only work creates no automated proof and runs only its named checks.

The final Worker report contains:

- harness, role, task class, Issue/attempt/dispatch identity;
- requested and launch-accepted binding;
- final runtime model event and inferred reported execution binding, never an attestation;
- exact base/head, host, planned versus actual structural delta, changed paths, reuse/new-owner disposition, authority/data impact, cleanup, validation commands/outcomes, unresolved matters, and one safe next action;
- `Local diagnostic` or `Local completion` for product work, or the exact non-behavior validation state for documentation/design-only work.

Do not include raw logs, proof artifacts, credentials, Provider payloads, private material, or personal dependency state. A Worker stops and returns `needs-commander` when the Issue is wrong, the structural budget must expand, authority or semantics drift, a required dependency/process/schema is missing from scope, protected material would be exposed, or required validation fails outside the authorized change.

The Commander audits the returned report and branch state, posts the Return Receipt, and alone performs authorized external integration. Pull requests remain Draft during authoring, review, rebase, and local validation. The current [CI boundary](../docs/agents/ci-test-boundaries.md) governs Local completion and Hosted Gate evidence; no dispatch or review receipt is a new gate.

## Review and retention

Independent review is optional and advisory unless an exact Owner/Issue instruction requests one. After an authoring head is locally complete, the Commander fixes that exact commit as immutable `reviewed_head` and launches the Reviewer from it as a separate fresh attempt on its own harness at the reviewed class's binding. The Reviewer verifies its checkout and Launch Receipt against `reviewed_head`, reads the canonical Issue from fresh context, and never reuses the Worker session or transcript. After accepting the review report, the Commander repeats that same head in the Return Receipt.

Keep a completed Worker or Reviewer Task Session visible through the Issue's merge, close, or abandonment, then the Commander archives it through its harness's retire action. A `needs-commander` session remains visible. A `superseded` or `cancelled` attempt receives a Return Receipt and is archived immediately. Session archival is task retention; it is distinct from repository `docs/archive/` document lifecycle.

## Decision summary

Accepted in Question 25, replaced by the Owner on 2026-09-03 in ADR 0059, rebound to Claude Code in ADR 0060, and routed by the Commander's harness in ADR 0061 on 2026-09-04:

- two supported harnesses, Codex and Claude Code, selected by the Commander's own harness and never mixed within one attempt;
- fixed bindings per harness and class, with one requested-binding line per harness in every work-ready Issue body;
- fresh Issue-bound Task Sessions in isolated worktrees for every Worker, Reviewer, role, and attempt;
- a two-stage verified Launch Receipt and Commander-authored Return Receipt in schema v3 with a `harness` field;
- no fallback, runtime-model attestation claim, or Commander inline T1–T3 substitute;
- queryable Issue receipts plus each harness's built-in session tools instead of orchestration infrastructure; and
- bounded parallel authoring with serial product integration and fresh attempts after target drift.
