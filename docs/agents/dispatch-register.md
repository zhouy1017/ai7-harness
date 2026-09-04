# Dispatch Register

The project-level Dispatch Register is a live query over canonical GitHub Issue receipts plus the Commander's own built-in session, agent, and background-process state. It answers which attempts exist, what their durable terminal evidence says, and which Task Sessions are live without creating another state owner.

Use this runbook when dispatching, resuming, accepting, integrating, or archiving repository work. [ADR 0061](../adr/0061-route-repository-dispatch-by-commander-harness.md) and [ADR 0063](../adr/0063-allow-cross-harness-dispatch-through-cli-launched-task-sessions.md) own the decisions and [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) owns receipt/session rules, including the per-harness and per-launch-mode tool mapping.

## Sources and precedence

Read each source only for the state it owns:

| Source | Owns |
| --- | --- |
| GitHub Issue body | Current Brief revision, main Worker role/class, both harness binding lines, exact base/target, authority, outcome, budget, non-goals, stop conditions |
| Launch Receipt comment | Durable launch/attempt identity including `commander_harness`, `harness`, `launch_mode`, `agent_id` for a subagent attempt, accepted launch evidence, and role-specific start commit: Worker exact base or Reviewer `reviewed_head` |
| Return Receipt comment | Commander-accepted terminal attempt state and outcome, including the same `reviewed_head` for a Reviewer |
| Codex `list_threads` / `read_thread` / `wait_threads` | A Codex Commander's native `top-level-session` attempts: project-level Task overview and live status / detailed recent state for one Task / bounded waiting on one to eight active Tasks |
| Codex `send_message_to_thread` / `set_thread_archived` | Receipt permalink delivery and same-attempt follow-ups / post-lifecycle retention state |
| Claude Code `list_sessions` / `get_session` / `list_events` | A Claude Code Commander's native `top-level-session` attempts: session overview (`sessionId`, `title`, `branch`, `cwd`, `isRunning`, `isArchived`) / one session's metadata (`model`, `effort`, `worktreePath`, `sourceBranch`, `branch`) / recent transcript when reported output must be read |
| Claude Code `send_message` / `set_session_title` / `archive_session` | Receipt permalink delivery and follow-ups to a top-level session / the fixed session title / post-lifecycle retention state, confirmed by the Owner in the desktop app |
| Claude Code `ListAgents` / `TaskOutput` / completion notification | `subagent` attempts inside the hosting Commander session: overview (agent name, `agent_id`, busy or idle) / one subagent's current status and latest turn result without blocking (`block: false`) / the harness's notice that a subagent turn ended |
| Claude Code `SendMessage` / `TaskStop` | Receipt permalink delivery and same-attempt follow-ups to a subagent by `agent_id` or name / stopping a running subagent |
| The Commander's background-process tools plus the CLI's JSON output and report file | `cli-session` attempts on either harness: process alive or exited, the `session_id` or `thread_id` the CLI reported, and the final message to relay |
| GitHub Issue/pull request | Issue and pull-request state |

A Commander queries only its own harness's session tools and its own background-process and agent tools; receipts from attempts it cannot observe live are read as durable evidence, never as live state. A `subagent` attempt never appears in `list_sessions`: its `session_id` is the hosting Commander session, and `agent_id` is its correlation key inside that session. A `cli-session` attempt is observed through its process and CLI output, not through either desktop app's session tools, even when that app also lists the session; an Owner-observed app value may be retained beside the process state as a raw relayed value.

Do not infer an attempt's completion from `idle`, a branch commit, a Worker self-report alone, a CLI process exit, or a closed pull request without its accepted Return Receipt. Do not infer session liveness from the last durable receipt. Query the owning source.

Launch and Return Receipt comments are immutable after posting. Never edit or delete a bad receipt; close or supersede its attempt with the durable Return Receipt and start a new attempt.

## Query procedure

1. List the ready/active Issues and read their latest Brief revision plus standardized Launch/Return Receipt comments, noting each attempt's `commander_harness`, `harness`, `launch_mode`, `agent_id` when present, and the immutable `reviewed_head` for each Reviewer attempt.
2. Correlate each receipt's `session_id` with your own live sources: your harness's overview tool, `list_threads` or `list_sessions`, for native `top-level-session` attempts; `ListAgents` in your own session for `subagent` attempts, by `agent_id`; your background-process tools for `cli-session` attempts, by the CLI-reported session or thread ID.
3. Wait according to the source: on Codex use `wait_threads` with the latest cursor and bounded waits that return only on progress, completion, or required attention; on Claude Code there is no blocking wait tool, so re-query `list_sessions` or `ListAgents` when a decision needs current liveness, or observe the desktop app, and a subagent's turn end also arrives as a completion notification; a `cli-session` process reports its exit through your background-process tools. Do not poll continuously or record poll results anywhere.
4. Use the detail source—`read_thread`, `get_session` plus `list_events`, `TaskOutput` with `block: false` for a subagent, or the CLI's JSON output and report file for a `cli-session`—only when a selected attempt's binding facts, recent turns, or reported output are needed.
5. Reconcile, without collapsing, the session live status, attempt terminal status, and GitHub state. For a Reviewer, first verify that its checkout and both receipts identify the same immutable `reviewed_head`; `class_match` is true only when its requested and launch-accepted bindings both equal the fixed reviewed-class binding on the Reviewer's own harness and the runtime model event is `none`, and in the `subagent` mode the comparison covers the model alias while the effort is `inherited`. A self-report is not evidence, and reroute/mismatch stops the attempt.
6. The Commander takes the next authorized action: send a same-attempt follow-up, accept and record a Return Receipt, launch a fresh attempt, integrate serially, or archive according to retention rules.

The register is query-driven. Never copy its live results into a central mutable Git table or encode transient session status in `PROGRESS.md` or `HANDOFF.md`.

## Three state namespaces

| Namespace | Values and rule |
| --- | --- |
| Session live status | Codex `setup-pending | running | needs-attention | idle`; Claude Code top-level session `running | idle | archived`; Claude Code subagent and `cli-session` on either harness `running | idle | ended`; `idle` does not mean completed |
| Attempt terminal status | `completed | needs-commander | failed | cancelled | superseded`; written only by Commander in the Return Receipt |
| GitHub state | Issue and pull-request open/draft/ready/merged/closed state; never substituted for either session namespace |

When sources appear inconsistent, preserve each value, inspect the exact receipt/session/Issue, and stop for the Commander instead of manufacturing one aggregate state.

Normalize built-in state while retaining the raw source state when it is available:

| Attempt source | Built-in observation | Normalized live status |
| --- | --- | --- |
| Codex top-level session | Only a `clientThreadId`, worktree/task setup still queued | `setup-pending` |
| Codex top-level session | Active or in progress | `running` |
| Codex top-level session | Explicit approval, user input, or blocking attention required | `needs-attention` |
| Codex top-level session | Idle | `idle` |
| Claude Code top-level session | `isRunning: true` | `running` |
| Claude Code top-level session | `isRunning: false` and `isArchived: false` | `idle` |
| Claude Code top-level session | `isArchived: true` | `archived` |
| Claude Code subagent | `ListAgents` shows the agent busy | `running` |
| Claude Code subagent | `ListAgents` shows the agent idle, or its turn-completion notification has arrived | `idle` |
| Claude Code subagent | No longer listed: stopped through `TaskStop`, or its hosting session ended. When a subagent ends, the harness also removes its worktree if that worktree is still unchanged, so a live attempt is one whose preflight left the untracked `.ai7-preflight-<dispatch_id>` marker at the worktree root and has not yet deleted it | `ended` |
| `cli-session`, either harness | The CLI process is alive | `running` |
| `cli-session`, either harness | The process exited after a turn and the reported session or thread ID is resumable | `idle` |
| `cli-session`, either harness | The session cannot be resumed, or the process was stopped before its turn ended | `ended` |

On Claude Code a permission prompt or blocking question is visible only in the desktop app—for a subagent, inside the hosting Commander session. Record it as `idle` and resolve it there; it is not a receipt value. A `cli-session` run has nobody to answer a prompt, so a denied required permission surfaces as a `needs-commander` report, never as a widened allowlist mid-attempt.

## Identity and follow-ups

The correlation key is `Issue + harness + role + attempt`, supported by `dispatch_id`, `session_id`, and, for a subagent attempt, `agent_id`; `commander_harness` and `launch_mode` are fixed per attempt. A same-session follow-up is allowed only while harness, launch mode, role, attempt, Brief revision and body bytes, requested binding, role-specific start commit, exact base/target, and authority remain unchanged. Any changed identity field—including a Reviewer's `reviewed_head`—post-launch Issue-body byte change, runtime reroute/mismatch, unavailable-launch rebind, cancellation, supersession, or exact base/target rebind requires a fresh attempt and Task Session.

## Retention

- Keep a completed Worker or Reviewer Task Session visible through the Issue's merge, close, or abandonment; then the Commander archives it through its harness's retire action.
- Keep `needs-commander` visible until the Commander resolves it.
- After its Return Receipt, archive a `cancelled` or `superseded` session immediately.
- Archiving a Claude Code top-level session removes its `.claude/worktrees/<name>` worktree; commit or discard candidate work through the Return Receipt first.
- A subagent attempt stays visible only inside its hosting Commander session; keep that session unarchived and the attempt's retained worktree in place through the same node, then remove the worktree with `git worktree remove`. The harness removes an unchanged subagent worktree by itself when the agent ends.
- A `cli-session` attempt's retention is its persisted CLI transcript (never `--ephemeral`), its report file, and its worktree; keep them through the same node, then remove the worktree with `git worktree remove`.
- Session archival does not move repository documents and is distinct from `docs/archive/` lifecycle work.

No daemon, database, host connector, query script, workflow, status file, launcher script, or second receipt store is part of this register; the target harness's CLI in the `cli-session` mode is invoked directly by the Commander and is an Owner host prerequisite, not repository tooling.
