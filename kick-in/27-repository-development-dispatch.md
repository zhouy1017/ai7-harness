# Repository Development Dispatch

## Scope

This runbook is the operating detail for repository development through Task Sessions on either supported harness, Codex or Claude Code. [ADR 0061](../docs/adr/0061-route-repository-dispatch-by-commander-harness.md) owns the fixed bindings and the `subagent` launch mode, [ADR 0063](../docs/adr/0063-allow-cross-harness-dispatch-through-cli-launched-task-sessions.md) owns per-attempt harness selection and the `cli-session` mode, and [ADR 0064](../docs/adr/0064-reweight-repository-development-toward-value-first-delivery.md) owns the current receipt schema, the optional Reviewer, the T3-only body hash, base-drift continuation, and the Commander's mechanical-edit allowance. None of this is AI7 product behavior; a repository-development subagent is never a DSH subagent.

A **Task Session** is one fresh execution context on the attempt's harness with its own isolated worktree. One attempt never changes its harness or launch mode.

## Roles and fixed bindings

| Role or class | `codex` | `claude-code` | Authority |
| --- | --- | --- | --- |
| Commander | `gpt-5.6-sol @ ultra` | `claude-fable-5-1 @ xhigh` | Shapes slices and Issues, dispatches, accepts reports, integrates, takes every external action; may make mechanical documentation edits through its own pull request |
| T1 Worker (mechanical) | `gpt-5.6-luna @ medium` | `claude-sonnet-5 @ medium` | Executes one brief in its own branch and worktree |
| T2 Worker (standard build) | `gpt-5.6-terra @ high` | `claude-opus-5 @ high` | Same |
| T3 Worker (high-stakes) | `gpt-5.6-sol @ xhigh` | `claude-fable-5-1 @ xhigh` | Same |
| Reviewer (optional) | reviewed class binding | reviewed class binding | Fresh read-only advisory review at `reviewed_head`; never authors, dispatches, or spawns |

Class test: T0 still needs Commander or Owner judgment and is not dispatched; T1 is mechanically checkable; T2 has a written brief and an existing seam; T3 changes or records a high-stakes boundary (architecture, domain, ADR, authority, Effect, credentials, recovery, source scope, policy). There is no fallback across models, efforts, harnesses, or modes: an unavailable binding records `launch-unavailable` and the Issue stays incomplete until a revised binding launches a new attempt. A harness-reported model switch during an attempt stops it. The Commander never performs T1–T3 product work inline and never edits an attempt's worktree.

A Worker reads the repository, writes only its own worktree and branch, runs the Local Verification Ladder, commits locally, and reports. It never pushes, changes an Issue or pull request, merges, reads or writes credentials or protected material, or takes another external action. A Worker or Reviewer may use read-only exploration subagents inside its own worktree only.

## Launch modes

| Mode | Attempt harness | Mechanism | Worktree and attach | Follow-up | Retire |
| --- | --- | --- | --- | --- | --- |
| `top-level-session` | `codex` | `create_thread` from a Codex Commander | App-managed detached worktree at the exact start; attach the clean checkout to the pre-created Issue branch | `send_message_to_thread` | `set_thread_archived` |
| `top-level-session` | `claude-code` | Hand-created desktop session with worktree isolation and the exact model and effort | `.claude/worktrees/<name>` on an app-generated branch; reset to the exact start if needed, rename to the Issue branch | `send_message` | `archive_session` (removes the worktree) |
| `subagent` | `claude-code` | Agent tool: `run_in_background: true`, `isolation: "worktree"`, `model` = class alias (`sonnet`, `opus`, `fable`), description `[#<issue>] <role> A<n>` | Harness-created worktree; the preflight leaves one untracked marker `.ai7-preflight-<dispatch_id>` so an unchanged worktree survives until attach; Worker deletes it after verifying its receipt | `SendMessage` to the `agent_id` | `TaskStop`; `git worktree remove` after the Issue closes |
| `cli-session` | either | `codex exec …` or `claude -p … --worktree <name>` from the Commander's shell with the exact model and effort; a Reviewer gets a read-only sandbox or allowlist | Codex: `git worktree add --detach` at the exact start; Claude: CLI-created worktree, rename to the Issue branch | `codex exec resume <thread_id>` / `claude -p … --resume <session_id>` from the worktree | Stop the process; `git worktree remove` after the Issue closes |

A cross-harness attempt uses `cli-session` only. In `subagent` mode effort is not a call parameter and is recorded as `inherited`. In `cli-session` mode the allowlist or sandbox must cover the brief's validation commands; a Worker there runs single invocations, and a denied required command is a `needs-commander` stop, never a widened allowlist. Never use `--ephemeral`, `--dangerously-bypass-approvals-and-sandbox`, `--approve-for-me`, `--bare`, or `--dangerously-skip-permissions`. The commit trailer follows the attempt's harness: `Co-authored-by: OpenAI Codex <codex@openai.com>` or `Co-Authored-By: Claude <noreply@anthropic.com>`; a trailer never names a model.

## Issue identity

The Issue body is the one-page [Change Brief](../docs/agents/change-brief.md). Identity is `Issue + harness + role + attempt`, supported by `dispatch_id`. A T3 body is frozen by its SHA-256; T1 and T2 bodies are frozen by Brief revision only. A material body change before launch increments the revision; after a Launch Receipt it ends the attempt and requires a new one. A base-only drift caused by integration does not end the attempt: the Commander sends one message naming the new exact base, the Worker rebases and revalidates, and the receipts record the new base in the Return Receipt.

## Launch sequence

1. The Commander preallocates `dispatch_id`, resolves the exact base (Worker) or `reviewed_head` (Reviewer), reserves the branch name, and selects harness and launch mode.
2. The Commander launches the Task Session with the first prompt defined in the Change Brief runbook: Issue URL, `dispatch_id`, revision (and hash for T3), harnesses, mode, role, class, binding, branch, start commit, and the no-write preflight.
3. The Worker or Reviewer reads `AGENTS.md`, the Issue, and the launch expectations, verifies the start commit and (T3) the hash, and reports `preflight-ready` or `needs-commander` without editing controlled files.
4. The Commander verifies the launch-accepted binding and the clean checkout, attaches a Worker checkout to the Issue branch, posts the Launch Receipt, and sends only its permalink.
5. The Worker or Reviewer verifies the receipt against the Issue and its checkout, then works. A mismatch returns `needs-commander` with no controlled-file edit.

## Receipts (schema v5)

Each attempt has exactly one Launch Receipt and one Return Receipt as GitHub Issue comments, marked `<!-- ai7-dispatch-launch-receipt:v5 -->` and `<!-- ai7-dispatch-return-receipt:v5 -->`. A receipt is immutable; a wrong receipt is closed by a Return Receipt (`superseded` or `failed`) and a new attempt. Schema v1–v4 receipts remain historical evidence.

Launch Receipt: `dispatch_id`, `issue`, `role`, `class`, `attempt`, `brief_revision`, `brief_sha256` (T3; otherwise `none`), `commander_harness`, `harness`, `launch_mode`, `binding` (model and effort as launched, plus `inherited` in `subagent` mode), `base` or `reviewed_head`, `branch`, `worktree`, `session` (session, thread, or agent id), `created_at`.

Return Receipt: `dispatch_id`, `issue`, `role`, `attempt`, `terminal_status` (`completed | needs-commander | failed | cancelled | superseded`), `head`, `base` (final, after any drift continuation), `ladder` (product work: layers and outcome, or `N/A`), `pull_request`, `unresolved`, `next_action`, `closed_at`.

A Reviewer's Return Receipt repeats `reviewed_head` and whether its binding matched the reviewed class. Receipts never claim effective runtime-model attestation.

## Parallel work and integration

- One Issue owns one branch, one pull request, and one writable Worker.
- At most three active Worker Task Sessions across all harnesses and modes, only when their slices consume stable owners on current `dev`; never split work to fill slots. Only one Worker may run Electron Journeys on one host at a time; the Commander tells the other to hold its Journey rung.
- Product integration is serial. After each integration the remaining branches re-resolve base, rebase, and revalidate under the base-drift continuation rule.
- The Commander alone pushes, manages Draft/Ready, merges, and posts receipts. Root `PROGRESS.md` is updated inside the integrating pull request or by a Commander-authored documentation pull request, without an Issue, Worker, or receipts.
- The live project view is the query-only [Dispatch Register](../docs/agents/dispatch-register.md). No central ledger, daemon, database, launcher script, or workflow is created.

## Local completion and return

A Worker runs the Local Verification Ladder from inside its worktree on the supported host and reports: harnesses, mode, role, class, Issue/attempt/dispatch identity, launch-accepted binding, exact base and head, changed paths, planned versus actual change, reuse or new-owner disposition, data and authority impact, cleanup, each ladder layer's outcome, unresolved matters, and one safe next action. No logs, proof artifacts, credentials, payloads, or private material. A Worker stops `needs-commander` when the brief is wrong, the allowed change must widen, authority or semantics drift, a required dependency, process, or schema is out of scope, protected material would be exposed, or required validation fails outside the authorized change.

## Retention

Keep a completed Worker or Reviewer Task Session and its worktree visible through the Issue's merge, close, or abandonment; then retire it through the mode's action. Keep `needs-commander` visible until resolved. Retire a `cancelled` or `superseded` session immediately after its Return Receipt. Session retention is separate from `docs/archive/`.
