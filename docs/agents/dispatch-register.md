# Dispatch Register

The project-level Dispatch Register is a live query over canonical GitHub Issue receipts plus the Commander harness's built-in session state. It answers which attempts exist, what their durable terminal evidence says, and which Task Sessions are live without creating another state owner.

Use this runbook when dispatching, resuming, accepting, integrating, or archiving repository work. [ADR 0061](../adr/0061-route-repository-dispatch-by-commander-harness.md) owns the decision and [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) owns receipt/session rules, including the per-harness tool mapping.

## Sources and precedence

Read each source only for the state it owns:

| Source | Owns |
| --- | --- |
| GitHub Issue body | Current Brief revision, main Worker role/class, both harness binding lines, exact base/target, authority, outcome, budget, non-goals, stop conditions |
| Launch Receipt comment | Durable launch/attempt identity including `harness`, accepted launch evidence, and role-specific start commit: Worker exact base or Reviewer `reviewed_head` |
| Return Receipt comment | Commander-accepted terminal attempt state and outcome, including the same `reviewed_head` for a Reviewer |
| Codex `list_threads` / `read_thread` / `wait_threads` | Codex project-level Task overview and live status / detailed recent state for one Task / bounded waiting on one to eight active Tasks |
| Codex `send_message_to_thread` / `set_thread_archived` | Receipt permalink delivery and same-attempt follow-ups / post-lifecycle retention state |
| Claude Code `list_sessions` / `get_session` / `list_events` | Session overview (`sessionId`, `title`, `branch`, `cwd`, `isRunning`, `isArchived`) / one session's metadata (`model`, `effort`, `worktreePath`, `sourceBranch`, `branch`) / recent transcript when reported output must be read |
| Claude Code `send_message` / `set_session_title` / `archive_session` | Receipt permalink delivery and follow-ups / the fixed session title / post-lifecycle retention state, confirmed by the Owner in the desktop app |
| GitHub Issue/pull request | Issue and pull-request state |

A Commander queries only its own harness's session tools; receipts from the other harness are read as durable evidence, never as live state.

Do not infer an attempt's completion from `idle`, a branch commit, a Worker self-report alone, or a closed pull request without its accepted Return Receipt. Do not infer session liveness from the last durable receipt. Query the owning source.

Launch and Return Receipt comments are immutable after posting. Never edit or delete a bad receipt; close or supersede its attempt with the durable Return Receipt and start a new attempt.

## Query procedure

1. List the ready/active Issues and read their latest Brief revision plus standardized Launch/Return Receipt comments, noting each attempt's `harness` and the immutable `reviewed_head` for each Reviewer attempt.
2. Call the Commander harness's overview tool, `list_threads` or `list_sessions`, and correlate each receipt's `session_id`.
3. Wait according to the harness: on Codex use `wait_threads` with the latest cursor and bounded waits that return only on progress, completion, or required attention; on Claude Code there is no blocking wait tool, so re-query `list_sessions` when a decision needs current liveness or observe the desktop app. Do not poll continuously or record poll results anywhere.
4. Use the harness's detail tool, `read_thread` or `get_session` plus `list_events`, only when a selected session's binding facts, recent turns, or reported output are needed.
5. Reconcile, without collapsing, the session live status, attempt terminal status, and GitHub state. For a Reviewer, first verify that its checkout and both receipts identify the same immutable `reviewed_head`; `class_match` is true only when its requested and launch-accepted bindings both equal the fixed reviewed-class binding on the Commander's harness and the runtime model event is `none`. A self-report is not evidence, and reroute/mismatch stops the attempt.
6. The Commander takes the next authorized action: send a same-attempt follow-up, accept and record a Return Receipt, launch a fresh attempt, integrate serially, or archive according to retention rules.

The register is query-driven. Never copy its live results into a central mutable Git table or encode transient session status in `PROGRESS.md` or `HANDOFF.md`.

## Three state namespaces

| Namespace | Values and rule |
| --- | --- |
| Session live status | Codex `setup-pending | running | needs-attention | idle`; Claude Code `running | idle | archived`; `idle` does not mean completed |
| Attempt terminal status | `completed | needs-commander | failed | cancelled | superseded`; written only by Commander in the Return Receipt |
| GitHub state | Issue and pull-request open/draft/ready/merged/closed state; never substituted for either session namespace |

When sources appear inconsistent, preserve each value, inspect the exact receipt/session/Issue, and stop for the Commander instead of manufacturing one aggregate state.

Normalize built-in state while retaining the raw source state when it is available:

| Harness | Built-in observation | Normalized live status |
| --- | --- | --- |
| Codex | Only a `clientThreadId`, worktree/task setup still queued | `setup-pending` |
| Codex | Active or in progress | `running` |
| Codex | Explicit approval, user input, or blocking attention required | `needs-attention` |
| Codex | Idle | `idle` |
| Claude Code | `isRunning: true` | `running` |
| Claude Code | `isRunning: false` and `isArchived: false` | `idle` |
| Claude Code | `isArchived: true` | `archived` |

On Claude Code a permission prompt or blocking question is visible only in the desktop app. Record it as `idle` and resolve it in the app; it is not a receipt value.

## Identity and follow-ups

The correlation key is `Issue + harness + role + attempt`, supported by `dispatch_id` and `session_id`. A same-session follow-up is allowed only while harness, role, attempt, Brief revision and body bytes, requested binding, role-specific start commit, exact base/target, and authority remain unchanged. Any changed identity field—including a Reviewer's `reviewed_head`—post-launch Issue-body byte change, runtime reroute/mismatch, unavailable-launch rebind, cancellation, supersession, or exact base/target rebind requires a fresh attempt and Task Session.

## Retention

- Keep a completed Worker or Reviewer Task Session visible through the Issue's merge, close, or abandonment; then the Commander archives it through its harness's retire action.
- Keep `needs-commander` visible until the Commander resolves it.
- After its Return Receipt, archive a `cancelled` or `superseded` session immediately.
- Archiving a Claude Code session removes its `.claude/worktrees/<name>` worktree; commit or discard candidate work through the Return Receipt first.
- Session archival does not move repository documents and is distinct from `docs/archive/` lifecycle work.

No daemon, database, host connector, query script, workflow, status file, CLI launcher, or second receipt store is part of this register.
