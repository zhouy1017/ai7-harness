---
status: superseded
---

# Dispatch repository work through Issue-bound Codex Task Sessions

This decision is superseded in full by [ADR 0060](./0060-dispatch-repository-work-through-issue-bound-claude-code-sessions.md), itself superseded by [ADR 0061](./0061-route-repository-dispatch-by-commander-harness.md). Its Codex-only exclusivity and schema-v1 receipt fields are historical only; its Codex bindings, Task Session tooling, live-status values, and commit trailer continue as the `codex` route under ADR 0061, and the role model, Issue-body hash, two-stage launch, no-fallback, parallelism, and Commander-only boundaries it introduced continue unchanged. The original body remains below unchanged as decision history.

The Owner replaces ADR 0015's provider-neutral, Claude-first/Spark/fallback repository-development design with one Codex-only process. Every dispatch-eligible T1/T2/T3 Worker and every Reviewer starts in a fresh top-level Codex Task Session whose authority is frozen by one GitHub Issue and one verified Launch Receipt. The existing Commander/Worker/Reviewer authority split, one-Issue/branch/pull-request/single-writer rule, validation lifecycle, and Commander-only integration/external-action boundary remain unchanged.

## Decision

Bindings are fixed: Commander `gpt-5.6-sol @ ultra`; T1 `gpt-5.6-luna @ medium`; T2 `gpt-5.6-terra @ high`; and T3 `gpt-5.6-sol @ xhigh`. A Reviewer uses the reviewed class's binding. T0 stays with the Commander, which shapes Issues, dispatches, accepts, integrates, and takes external actions but does not perform T1–T3 controlled-file work inline. `T3-par` is only Commander coordination of independent classified tasks, not another class or permission for in-session subagents.

The Issue body is the canonical current Change Brief and records its revision, main Worker class, requested model/effort, exact base/target, authority, outcome, structural budget, non-goals, stop conditions, and reporting boundary. The body hash is SHA-256 over the exact UTF-8 bytes of the GitHub API body string. A material pre-launch body change increments the revision; an editorial-only pre-launch edit may keep the revision but recomputes the hash. The launch request freezes both. Any later body-byte change prevents or invalidates that attempt, and after a Launch Receipt always requires an incremented revision and fresh Task Session. Role, binding, runtime reroute/mismatch, base/target, cancellation, or supersession changes also create a new `Issue + role + attempt` identity.

Launch is deliberately two-stage because the app-managed worktree path and Task ID do not exist until `create_thread` atomically sends the first turn. The exact start is role-specific: a Worker starts from the exact integration base, while a Reviewer starts from the immutable completed authoring commit recorded as `reviewed_head`. The first turn receives that start plus the immutable launch expectations, reports the actual cwd and branch-or-detached state, and performs a no-write preflight without expecting a Receipt. After it stops, the Commander verifies the generated clean checkout at the role-specific start, may attach only a detached Worker checkout to the pre-created Issue branch, then posts the finalized Launch Receipt and sends its permalink. A Reviewer remains detached and read-only at `reviewed_head`. Controlled-file work begins only after exact verification. Task titles are `[#<issue>] <role> A<attempt> — <issue title>`.

The Commander later posts one Return Receipt after accepting the report. Receipt comments are immutable; an error closes or supersedes the attempt and starts a new one. Receipts distinguish requested/launch-accepted binding from `reported_execution_binding`, which is only an inference from launch acceptance and observed runtime events—not proof of the effective model. A Reviewer's Launch and Return Receipts both record the exact `reviewed_head`; class match comes only from its own requested/launch-accepted binding and runtime event, self-report is never evidence, and reroute/mismatch stops the attempt. Task live status, attempt terminal status, and GitHub state remain separate.

There is no automatic fallback. An unavailable specified binding records `launch-unavailable` and starts no work; any rebind requires an Issue revision, reason, new attempt, and fresh session. When multiple ready Issues are independent, the Commander should run at most three Worker Tasks concurrently without inventing work, while product integration remains serial. Target drift after another integration requires re-resolution, rebase, revalidation, and a fresh attempt before more controlled edits.

The project-level Dispatch Register is a live query over Issue receipts and built-in Codex task tools, not another state owner. It adds no central mutable Git ledger, daemon, database, host connector, query script, workflow, or gate. Root `PROGRESS.md` and `HANDOFF.md` remain Commander-owned integration-line routers rather than per-attempt ledgers; Workers and Reviewers start from `AGENTS.md`, their Issue, and their Launch Receipt.

The detailed contract lives in [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) and [Dispatch Register](../agents/dispatch-register.md).

## Rejected alternatives and consequences

Provider-neutral Layer A/B policy, Claude-first or cross-provider selection, the Spark lane, quota fallback, CLI shim/plumbing, Commander inline execution, mutable pending receipts, and unqualified actual-model reporting are removed from current authority. ADR 0015 remains at its stable path as explicitly superseded history. ADR 0027's earlier supersession of ADR 0015's verification and review-gate clauses remains historical; this decision does not revive any review, proof, model, exact-head, or CI gate.

This decision governs repository-development orchestration only. It changes no AI7 product Model Role, Provider Resolution Plan, Provider Preflight, Approved Fallback Chain, Provider Processing Policy, DSH subagent/artifact behavior, credentials, Effect, E2E provider-free boundary, export, publication, distribution, release, or `main` authority.
