# Dispatch Register

The Dispatch Register is a live query over GitHub Issue receipts plus the Commander's own session, agent, and background-process tools. It answers which attempts exist, what their durable terminal evidence says, and which Task Sessions are live, without creating another state owner. [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) owns the receipt schema and launch modes.

## Sources

| Source | Owns |
| --- | --- |
| Issue body | Current Brief revision, class, bindings, base, allowed change, stop conditions |
| Launch Receipt (v5) | Durable attempt identity: `dispatch_id`, harnesses, `launch_mode`, binding, start commit, worktree, session |
| Return Receipt (v5) | Commander-accepted terminal status, head, final base, ladder outcome, pull request, next action |
| Codex `list_threads` / `read_thread` / `wait_threads` | Live state of a Codex Commander's `top-level-session` attempts |
| Claude Code `list_sessions` / `get_session` / `list_events` | Live state of a Claude Code Commander's `top-level-session` attempts |
| Claude Code `ListAgents` / `TaskOutput` / completion notification | Live state of `subagent` attempts inside the hosting Commander session |
| The Commander's background-process tools plus the CLI's JSON output | Live state of `cli-session` attempts on either harness |
| GitHub Issue and pull request | Issue and pull-request state |

A Commander queries only its own harness's tools and its own process and agent tools; receipts from attempts it cannot observe live are durable evidence, not live state. Do not infer completion from `idle`, a branch commit, a self-report, a process exit, or a closed pull request without the Return Receipt. Do not infer liveness from a receipt.

## Query procedure

1. List the ready and active Issues; read the latest Brief revision and both receipts, noting harness, `launch_mode`, session or agent id, and the Reviewer's `reviewed_head`.
2. Correlate each Launch Receipt's session or agent id with your live sources.
3. Read a detail source only when an attempt's binding facts or reported output are needed.
4. Keep the three state namespaces separate: session live status (`running | idle | ended`, plus the harness's own values), attempt terminal status (`completed | needs-commander | failed | cancelled | superseded`, written only in the Return Receipt), and GitHub state. Never collapse them into one aggregate.
5. Take the next authorized action: a same-attempt follow-up, a base-drift continuation message, a Return Receipt, a fresh attempt, serial integration, or retirement.

A permission prompt or blocking question in a desktop session is `idle` and is resolved there. A `cli-session` cannot answer prompts, so a denied required command surfaces as `needs-commander`. A subagent worktree that is still unchanged when the agent ends is removed by the harness; the preflight marker exists to prevent that before attach.

## Retention

Keep completed sessions and worktrees visible through the Issue's merge, close, or abandonment; keep `needs-commander` visible; retire `cancelled` or `superseded` immediately after the Return Receipt. Never copy live results into `PROGRESS.md`, a Git table, a daemon, a database, or a status file.
