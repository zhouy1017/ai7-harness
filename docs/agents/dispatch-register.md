# Dispatch Register

The project-level Dispatch Register is a live query over canonical GitHub Issue receipts plus Claude desktop session state. It answers which attempts exist, what their durable terminal evidence says, and which Task Sessions are live without creating another state owner.

Use this runbook when dispatching, resuming, accepting, integrating, or archiving repository work. [ADR 0060](../adr/0060-dispatch-repository-work-through-issue-bound-claude-code-sessions.md) owns the decision and [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) owns receipt/session rules.

## Sources and precedence

Read each source only for the state it owns:

| Source | Owns |
| --- | --- |
| GitHub Issue body | Current Brief revision, main Worker role/class/binding, exact base/target, authority, outcome, budget, non-goals, stop conditions |
| Launch Receipt comment | Durable launch/attempt identity, accepted launch evidence, and role-specific start commit: Worker exact base or Reviewer `reviewed_head` |
| Return Receipt comment | Commander-accepted terminal attempt state and outcome, including the same `reviewed_head` for a Reviewer |
| `list_sessions` | Project-level session overview: `sessionId`, `title`, `branch`, `cwd`, `isRunning`, `isArchived`, `lastActivityAt`; pass `include_archived` for retention checks |
| `get_session` | One session's metadata: `model`, `effort`, `worktreePath`, `sourceBranch`, `branch`, `createdAt`, `isRemote` |
| `list_events` | Recent transcript of one selected session when its reported output must be read |
| `send_message` | Receipt permalink delivery and same-attempt follow-ups |
| `set_session_title` | The fixed `[#<issue>] <role> A<attempt> — <issue title>` title |
| `archive_session` | Post-lifecycle visibility/retention state; each call is confirmed by the Owner in the desktop app |
| GitHub Issue/pull request | Issue and pull-request state |

Do not infer an attempt's completion from `idle`, a branch commit, a Worker self-report alone, or a closed pull request without its accepted Return Receipt. Do not infer session liveness from the last durable receipt. Query the owning source.

Launch and Return Receipt comments are immutable after posting. Never edit or delete a bad receipt; close or supersede its attempt with the durable Return Receipt and start a new attempt.

## Query procedure

1. List the ready/active Issues and read their latest Brief revision plus standardized Launch/Return Receipt comments, including the immutable `reviewed_head` for each Reviewer attempt.
2. Call `list_sessions` for the project overview and correlate each receipt's `session_id`.
3. There is no blocking wait tool. Re-query `list_sessions` when a decision needs current liveness, or observe the desktop app; do not poll continuously or record poll results anywhere.
4. Use `get_session` to verify a session's reported model, effort, worktree path, source branch, and branch against its receipt, and `list_events` only when a selected session's recent turns or reported output are needed.
5. Reconcile, without collapsing, the session live status, attempt terminal status, and GitHub state. For a Reviewer, first verify that its checkout and both receipts identify the same immutable `reviewed_head`; `class_match` is true only when its requested and launch-accepted bindings both equal the fixed reviewed-class binding and the runtime model event is `none`. A self-report is not evidence, and reroute/mismatch stops the attempt.
6. The Commander takes the next authorized action: send a same-attempt follow-up, accept and record a Return Receipt, launch a fresh attempt, integrate serially, or archive according to retention rules.

The register is query-driven. Never copy its live results into a central mutable Git table or encode transient session status in `PROGRESS.md` or `HANDOFF.md`.

## Three state namespaces

| Namespace | Values and rule |
| --- | --- |
| Session live status | `running | idle | archived`; `idle` does not mean completed |
| Attempt terminal status | `completed | needs-commander | failed | cancelled | superseded`; written only by Commander in the Return Receipt |
| GitHub state | Issue and pull-request open/draft/ready/merged/closed state; never substituted for either session namespace |

When sources appear inconsistent, preserve each value, inspect the exact receipt/session/Issue, and stop for the Commander instead of manufacturing one aggregate state.

Normalize session metadata while retaining the raw fields when they are available:

| Session metadata | Normalized live status |
| --- | --- |
| `isRunning: true` | `running` |
| `isRunning: false` and `isArchived: false` | `idle` |
| `isArchived: true` | `archived` |

A permission prompt or blocking question is visible only in the desktop app. Record it as `idle` and resolve it in the app; it is not a receipt value.

## Identity and follow-ups

The correlation key is `Issue + role + attempt`, supported by `dispatch_id` and `session_id`. A same-session follow-up is allowed only while role, attempt, Brief revision and body bytes, requested binding, role-specific start commit, exact base/target, and authority remain unchanged. Any changed identity field—including a Reviewer's `reviewed_head`—post-launch Issue-body byte change, runtime reroute/mismatch, unavailable-launch rebind, cancellation, supersession, or exact base/target rebind requires a fresh attempt and Task Session.

## Retention

- Keep a completed Worker or Reviewer Task Session visible through the Issue's merge, close, or abandonment; then the Commander archives it.
- Keep `needs-commander` visible until the Commander resolves it.
- After its Return Receipt, archive a `cancelled` or `superseded` session immediately.
- Archiving a session removes its `.claude/worktrees/<name>` worktree; commit or discard candidate work through the Return Receipt first.
- Session archival does not move repository documents and is distinct from `docs/archive/` lifecycle work.

No daemon, database, host connector, query script, workflow, status file, CLI launcher, or second receipt store is part of this register.
