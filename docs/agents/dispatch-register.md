# Dispatch Register

The project-level Dispatch Register is a live query over canonical GitHub Issue receipts plus built-in Codex task state. It answers which attempts exist, what their durable terminal evidence says, and which Task Sessions are live without creating another state owner.

Use this runbook when dispatching, resuming, accepting, integrating, or archiving repository work. [ADR 0059](../adr/0059-dispatch-repository-work-through-issue-bound-codex-task-sessions.md) owns the decision and [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) owns receipt/session rules.

## Sources and precedence

Read each source only for the state it owns:

| Source | Owns |
| --- | --- |
| GitHub Issue body | Current Brief revision, main Worker role/class/binding, exact base/target, authority, outcome, budget, non-goals, stop conditions |
| Launch Receipt comment | Durable launch/attempt identity, accepted launch evidence, and role-specific start commit: Worker exact base or Reviewer `reviewed_head` |
| Return Receipt comment | Commander-accepted terminal attempt state and outcome, including the same `reviewed_head` for a Reviewer |
| `list_threads` | Current project-level Task overview and live status |
| `wait_threads` | Efficient waiting on one to eight active Tasks |
| `read_thread` | Detailed recent state for one selected Task |
| `set_thread_archived` and archived-task queries | Post-lifecycle visibility/retention state |
| GitHub Issue/pull request | Issue and pull-request state |

Do not infer an attempt's completion from `idle`, a branch commit, a Worker self-report alone, or a closed pull request without its accepted Return Receipt. Do not infer Task liveness from the last durable receipt. Query the owning source.

Launch and Return Receipt comments are immutable after posting. Never edit or delete a bad receipt; close or supersede its attempt with the durable Return Receipt and start a new attempt.

## Query procedure

1. List the ready/active Issues and read their latest Brief revision plus standardized Launch/Return Receipt comments, including the immutable `reviewed_head` for each Reviewer attempt.
2. Call `list_threads` for the project overview and correlate each receipt's Task Session ID.
3. Use `wait_threads` for active waiting. Pass the latest cursor and prefer bounded waits that return only on progress, completion, or required attention.
4. Use `read_thread` only when a selected Task needs detailed recent turns or reported output.
5. Reconcile, without collapsing, the Task live status, attempt terminal status, and GitHub state. For a Reviewer, first verify that its checkout and both receipts identify the same immutable `reviewed_head`; `class_match` is true only when its requested and launch-accepted bindings both equal the fixed reviewed-class binding and the runtime model event is `none`. A self-report is not evidence, and reroute/mismatch stops the attempt.
6. The Commander takes the next authorized action: send a same-attempt follow-up, accept and record a Return Receipt, launch a fresh attempt, integrate serially, or archive according to retention rules.

The register is query-driven. Never copy its live results into a central mutable Git table or encode transient Task status in `PROGRESS.md` or `HANDOFF.md`.

## Three state namespaces

| Namespace | Values and rule |
| --- | --- |
| Task live status | `setup-pending | running | needs-attention | idle`; `idle` does not mean completed |
| Attempt terminal status | `completed | needs-commander | failed | cancelled | superseded`; written only by Commander in the Return Receipt |
| GitHub state | Issue and pull-request open/draft/ready/merged/closed state; never substituted for either task namespace |

When sources appear inconsistent, preserve each value, inspect the exact receipt/task/Issue, and stop for the Commander instead of manufacturing one aggregate state.

Normalize built-in Task state while retaining the raw source state when it is available:

| Built-in observation | Normalized live status |
| --- | --- |
| Only a `clientThreadId`, worktree/task setup still queued | `setup-pending` |
| Active or in progress | `running` |
| Explicit approval, user input, or blocking attention required | `needs-attention` |
| Idle | `idle` |

## Identity and follow-ups

The correlation key is `Issue + role + attempt`, supported by `dispatch_id` and Task Session ID. A same-session follow-up is allowed only while role, attempt, Brief revision and body bytes, requested binding, role-specific start commit, exact base/target, and authority remain unchanged. Any changed identity field—including a Reviewer's `reviewed_head`—post-launch Issue-body byte change, runtime reroute/mismatch, unavailable-launch rebind, cancellation, supersession, or exact base/target rebind requires a fresh attempt and Task Session.

## Retention

- Keep a completed Worker or Reviewer Task visible through the Issue's merge, close, or abandonment; then the Commander archives it.
- Keep `needs-commander` visible until the Commander resolves it.
- After its Return Receipt, archive a `cancelled` or `superseded` Task immediately.
- Task archival does not move repository documents and is distinct from `docs/archive/` lifecycle work.

No daemon, database, host connector, query script, workflow, status file, or second receipt store is part of this register.
