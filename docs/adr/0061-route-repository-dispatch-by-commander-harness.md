---
status: accepted
---

# Route repository dispatch by the Commander's harness

On 2026-09-04 the Owner decided that repository development must work from both Codex and Claude Code, so the single-harness exclusivity of ADR 0059 (Codex-only) and ADR 0060 (Claude Code-only) is replaced by harness-conditional routing: the Commander's own harness selects the route for every Worker and Reviewer it launches. The Codex route restores ADR 0059's bindings, Task Session tooling, live-status values, and trailer; the Claude Code route continues ADR 0060's. Every other rule those decisions introduced—the Commander/Worker/Reviewer authority split, one-Issue/branch/pull-request/single-writer rule, Issue-body hash, two-stage launch, no fallback, bounded parallelism, serial integration, three state namespaces, validation lifecycle, and Commander-only integration/external actions—is inherited unchanged.

## Decision

Two harnesses are supported: `codex` and `claude-code`. One attempt never mixes them: a Codex Commander launches Codex Task Sessions, a Claude Code Commander launches Claude Code Task Sessions, and a Reviewer runs on the same harness as the Commander at the reviewed class's binding. Cross-harness Worker or Reviewer attempts and any third harness are out of scope.

Bindings are fixed per harness. Codex: Commander `gpt-5.6-sol @ ultra`, T1 `gpt-5.6-luna @ medium`, T2 `gpt-5.6-terra @ high`, T3 `gpt-5.6-sol @ xhigh`. Claude Code: Commander `claude-fable-5-1 @ xhigh`, T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`. There is no fallback across models, efforts, or harnesses.

The Issue body remains the canonical Change Brief and now carries one requested binding per harness, `Requested binding (codex)` and `Requested binding (claude-code)`, both frozen by the body hash, so a work-ready Issue is launchable from either Commander without a body change. A body that carries only a single legacy `Requested binding:` line binds only the harness of that model family; adding the other line is a material revision. The launching Commander records its `harness` and the selected line as `requested_binding`; the selected line and the launch-accepted binding must agree, or the attempt records `mismatch` and stops.

A **Task Session** is one fresh top-level session of the Commander's harness with its own worktree: on Codex, a Task Session created by `create_thread` with an app-managed worktree under `~/.codex/worktrees/<id>/ai7-harness`, observed through `list_threads`, `wait_threads`, and `read_thread`, messaged through `send_message_to_thread`, and retired through `set_thread_archived`; on Claude Code, a desktop session created by hand with a `.claude/worktrees/<name>` worktree, observed through `list_sessions`, `get_session`, and `list_events`, messaged through `send_message`, titled through `set_session_title`, and retired through `archive_session`. Read-only exploration subagents inside a Worker or Reviewer session may run only within that same worktree and never become a second writer or a separate attempt identity.

Launch keeps ADR 0059's two-stage skeleton with harness-specific attach steps. The first prompt carries the immutable launch expectations and a no-write preflight. After that turn stops, the Commander verifies the launch-accepted binding and a clean checkout at the role-specific start (Worker exact base; Reviewer immutable `reviewed_head`), attaches only a Worker checkout to the Issue branch—on Codex by attaching the clean detached checkout to the pre-created branch, on Claude Code by resetting a clean checkout to the exact start when needed and renaming the app-generated branch to the reserved Issue branch—posts the finalized Launch Receipt, and sends only its permalink. A Reviewer stays detached and read-only.

Receipts use schema v3, which adds `harness` and records `session_id` (the Codex Task Session ID or the Claude Code session ID), `client_thread_id` when Codex reports one, `session_title`, `worktree_path`, `source_branch` on Claude Code, and the harness's own live-status values: Codex `setup-pending | running | needs-attention | idle`, Claude Code `running | idle | archived`. `launch_accepted_binding` is the harness's launch evidence—the accepted `create_thread` request on Codex, the desktop session metadata on Claude Code—and `reported_execution_binding` keeps its inference label; neither is proof of the effective runtime model. Schema v1 and v2 receipts remain historical evidence.

Agent-authored commits carry the stable product-level trailer of the Commander's harness: `Co-authored-by: OpenAI Codex <codex@openai.com>` on the Codex route or `Co-Authored-By: Claude <noreply@anthropic.com>` on the Claude Code route. A trailer never names a model.

The Dispatch Register remains a live query over Issue receipts plus the Commander harness's built-in session tools; it adds no ledger, daemon, database, host connector, query script, workflow, or gate. Root `PROGRESS.md` and `HANDOFF.md` remain Commander-owned integration-line routers. The detailed contract lives in [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) and [Dispatch Register](../agents/dispatch-register.md).

## Rejected alternatives and consequences

- **Single-harness exclusivity** (ADR 0059's Codex-only and ADR 0060's Claude Code-only rules). Rejected: the Owner operates both harnesses, and an Issue written for one must remain launchable from the other without contradicting current authority.
- **Cross-harness Worker or Reviewer within one attempt.** Rejected: receipts, session tools, live-status values, and trailers would mix, and Reviewer independence would depend on two toolchains.
- **Class-only Issue bodies with bindings resolved at launch.** Rejected: the body must keep freezing the exact model and effort under the hash; two explicit lines preserve that while allowing either Commander to launch.
- **Automatic harness fallback.** Rejected: no fallback of any kind exists; an unavailable binding records `launch-unavailable`.

ADR 0060 is superseded in full and ADR 0059's remaining exclusivity clause is superseded; both remain at their stable paths as history, and their route texts continue here. ADR 0027's earlier supersession of ADR 0015's verification and review-gate clauses remains historical; this decision revives no review, proof, model, exact-head, or CI gate.

This decision governs repository-development orchestration only. It changes no AI7 product Model Role, Provider Resolution Plan, Provider Preflight, Approved Fallback Chain, Provider Processing Policy, DSH subagent/artifact behavior, credentials, Effect, E2E provider-free boundary, export, publication, distribution, release, or `main` authority. The product-domain term Codex Interaction Model Reference under ADR 0041 is unaffected.
