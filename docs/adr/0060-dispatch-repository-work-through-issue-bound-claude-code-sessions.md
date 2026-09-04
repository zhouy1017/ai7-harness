---
status: superseded
---

# Dispatch repository work through Issue-bound Claude Code sessions

This decision is superseded in full by [ADR 0061](./0061-route-repository-dispatch-by-commander-harness.md). Its Claude Code-only exclusivity is historical; its Claude Code route, bindings, session tooling, and schema-v2 receipt shape continue as the `claude-code` route under ADR 0061 beside the restored Codex route. The original body remains below unchanged as decision history.

On 2026-09-04 the Owner moved repository development from Codex to Claude Code and replaced ADR 0059's Codex-only tooling with one Claude Code process. Every dispatch-eligible T1/T2/T3 Worker and every Reviewer starts in a fresh top-level Claude Code Task Session whose authority is frozen by one GitHub Issue and one verified Launch Receipt. The Commander/Worker/Reviewer authority split, one-Issue/branch/pull-request/single-writer rule, Issue-body hash, two-stage launch, no-fallback rule, bounded parallelism, serial integration, three state namespaces, validation lifecycle, and Commander-only integration/external-action boundary are inherited from ADR 0059 unchanged.

## Decision

Bindings are fixed: Commander `claude-fable-5-1 @ xhigh`; T1 `claude-sonnet-5 @ medium`; T2 `claude-opus-5 @ high`; and T3 `claude-fable-5-1 @ xhigh`. A Reviewer uses the reviewed class's binding. The effort label is the Claude Code reasoning-effort level that the desktop session metadata reports. T0 stays with the Commander, which shapes Issues, dispatches, accepts, integrates, and takes external actions but does not perform T1–T3 controlled-file work inline. `T3-par` is only Commander coordination of independent classified tasks, not another class.

A **Task Session** is one fresh top-level Claude Code session created in the Claude desktop app (Code tab) with its own isolated worktree under `.claude/worktrees/<name>`. The Owner/Commander creates it by hand; no CLI launcher, daemon, script, or connector is part of this process. Read-only exploration subagents inside a Worker or Reviewer session may run only within that same worktree; they never write, never become a second writer, and never create a separate attempt identity. A Reviewer never delegates authoring, dispatch, or external actions to any agent.

The Issue body remains the canonical Change Brief under ADR 0059's revision and SHA-256 rules. The hash is computed over the exact UTF-8 bytes of the GitHub API `body` string retrieved byte-preservingly, never over CLI-rendered output.

Launch remains two-stage. The desktop app creates the worktree and its branch from the main checkout's current branch at session creation, and the session's metadata exists only afterwards. The first prompt carries the immutable launch expectations and a no-write preflight and asks the session to report its actual worktree and branch. After that turn stops, the Commander reads the session's harness-reported model, effort, worktree path, source branch, and branch through the desktop session tools, verifies a clean checkout at the role-specific start (Worker exact base; Reviewer immutable `reviewed_head`), renames a Worker worktree branch to the pre-created Issue branch, posts the finalized Launch Receipt as one immutable Issue comment, and sends only its permalink to the session. A Reviewer stays detached and read-only. Controlled-file work begins only after the Worker or Reviewer verifies that Receipt.

Receipts use schema v2. `launch_accepted_binding` is the `model @ effort` reported by the desktop session metadata; it is harness evidence rather than a model self-report, yet still not proof of the effective runtime model, so `reported_execution_binding` keeps its inference label. `runtime_model_event` is `none`, `rerouted` when the app shows an automatic model fallback or switch, or `mismatch` when reported metadata differs from the requested binding; either non-`none` value stops the attempt. Session live status is `running | idle | archived`, normalized from the desktop session metadata; `idle` never means completed.

There is no automatic fallback. An unavailable specified binding records `launch-unavailable` and starts no work; any rebind requires an Issue revision, reason, new attempt, and fresh Task Session. At most three Worker Task Sessions run concurrently on independent Issues while product integration remains serial; target drift after another integration ends the old attempt.

Agent-authored commits carry the stable product-level trailer `Co-Authored-By: Claude <noreply@anthropic.com>`. Class, requested binding, and reported execution binding belong only in receipts.

The Dispatch Register remains a live query over Issue receipts plus the Claude desktop session tools. It adds no central mutable Git ledger, daemon, database, host connector, query script, workflow, or gate. Root `PROGRESS.md` and `HANDOFF.md` remain Commander-owned integration-line routers; Workers and Reviewers start from `AGENTS.md`, their Issue, and their Launch Receipt.

The detailed contract lives in [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) and [Dispatch Register](../agents/dispatch-register.md).

## Rejected alternatives and consequences

- **Workers as in-session subagents of the Commander** (the Agent tool with worktree isolation). Rejected: it turns the Commander into an author, mixes contexts, hides the attempt from Owner-visible session lists, and breaks fresh-context independence and Reviewer non-delegation.
- **Single-session development without roles or receipts.** Rejected: it discards the isolation and immutable attempt evidence the Owner accepted.
- **Editing ADR 0059 in place, or keeping Codex and Claude rules side by side.** Rejected: ADR 0059 remains at its stable path as explicitly superseded history, and no dual dispatch policy exists.
- **Cross-provider selection or CLI-launched sessions.** Out of scope; a future change requires its own decision.

ADR 0059's Codex-only bindings, Task Session tooling, receipt fields, live-status values, and commit trailer are removed from current authority. ADR 0027's earlier supersession of ADR 0015's verification and review-gate clauses remains historical; this decision revives no review, proof, model, exact-head, or CI gate.

This decision governs repository-development orchestration only. It changes no AI7 product Model Role, Provider Resolution Plan, Provider Preflight, Approved Fallback Chain, Provider Processing Policy, DSH subagent/artifact behavior, credentials, Effect, E2E provider-free boundary, export, publication, distribution, release, or `main` authority. The product-domain term Codex Interaction Model Reference under ADR 0041 is unaffected.
