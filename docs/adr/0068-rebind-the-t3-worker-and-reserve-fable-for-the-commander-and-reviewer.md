---
status: accepted
---

# Rebind the Claude Code T3 Worker to Opus and reserve Fable for the Commander and Reviewer

On 2026-09-07 the Owner changed the fixed Claude Code class bindings of [ADR 0061](./0061-route-repository-dispatch-by-commander-harness.md), as amended by [ADR 0063](./0063-allow-cross-harness-dispatch-through-cli-launched-task-sessions.md) and [ADR 0064](./0064-reweight-repository-development-toward-value-first-delivery.md). The Fable budget is one pool, and the previous table pointed three roles at it: the Commander, every T3 Worker, and every Reviewer of a T3 attempt all ran `claude-fable-5-1 @ xhigh`. On the evening of 2026-09-06 that pool was exhausted with both a Commander and a Worker live: the Commander session and the S40 (#272) Worker A2 session stopped at the limit within twenty minutes of each other, and A2's work — nineteen modified files and two new test files, +660/-121 — stayed uncommitted in `.claude/worktrees/issue-272-a2` with no commit, no Return Receipt, and no pull request. This decision moves the T3 Worker off that pool and reserves it for the two roles whose value is judgment rather than volume.

## Decision

### Claude Code bindings

| Role or class | Binding | Change |
| --- | --- | --- |
| Commander | `claude-fable-5-1 @ xhigh` | unchanged |
| T1 Worker | `claude-sonnet-5 @ medium` | unchanged |
| T2 Worker | `claude-opus-5 @ high` | unchanged |
| T3 Worker | `claude-opus-5 @ high` | was `claude-fable-5-1 @ xhigh` |
| Reviewer, every reviewed class | `claude-fable-5-1 @ xhigh` | was the reviewed class's binding |

The Codex route is unchanged in full: Commander `gpt-5.6-sol @ ultra`, T1 `gpt-5.6-luna @ medium`, T2 `gpt-5.6-terra @ high`, T3 `gpt-5.6-sol @ xhigh`, and a Codex Reviewer keeps the reviewed class's binding. A Reviewer's binding is now fixed by route rather than derived from the reviewed class, so a Claude Code Reviewer's Return Receipt records `class_match` as `fixed-reviewer-binding` and names the reviewed class instead of comparing models; on the Codex route the comparison is unchanged.

### What still separates T2 from T3

On the Claude Code route T2 and T3 Workers now share one model and effort. The classes stay distinct in process, not in model: a T3 Issue body is frozen by its SHA-256 and the Worker recomputes it at preflight, a T3 brief names a high-stakes boundary under the class test, and the Commander's default toward an advisory Reviewer is stronger at T3. A slice's class is assigned by the class test in [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) and never by which model is available or affordable.

### No fallback, and no change inside an open attempt

The no-fallback rule continues without exception: an unavailable binding records `launch-unavailable`, and a harness-reported model switch during an attempt stops it. A resumed Task Session keeps the model it launched with, so an open attempt cannot adopt a new binding. An open T3 attempt still bound to Fable is closed with a Return Receipt of `superseded` and relaunched as the next attempt at `claude-opus-5 @ high`; its committed work and worktree state carry into that attempt the way a base-drift continuation carries a new base.

### Issue bodies

From this decision onward `Requested binding (claude-code)` on a T3 Issue reads `claude-opus-5 @ high`. That line is frozen by the body hash, so the edit is a material body change: the Brief revision increments and the T3 hash is recomputed before the next launch.

### Subagent alias

In the `subagent` launch mode the Agent call's `model` is the fixed class alias: `sonnet` for T1, `opus` for T2 and T3, and `fable` for a Reviewer. Effort is still not a call parameter there and is recorded as `inherited`, so a T3 subagent Worker runs `opus` at the Commander session's effort and the effort component stays excluded from the `mismatch` comparison exactly as ADR 0061 specifies. A `cli-session` or `top-level-session` T3 attempt carries `@ high` explicitly.

## Consequences

- A T3 Worker no longer competes with its own Commander for one budget. A Fable limit can still stop the Commander or a Reviewer, but it no longer stops a Worker mid-run and strands uncommitted work.
- T3 output changes model. This is accepted deliberately: an unfinished T3 slice, with its worktree stranded and no receipt, costs more than the difference between the two bindings.
- A Reviewer of a T1 or T2 attempt now reads at a stronger binding than the class it reviews. That is intended; the Reviewer never authors, and its verdict stays advisory under ADR 0064.
- Receipts written before this decision keep their recorded bindings as historical evidence. Nothing is restated or reissued.
- Open T3 Issues need a Brief revision before their next launch. At the time of this decision that is #272 (S40), whose attempt A2 ended at the Fable limit.

## Rejected alternatives

- **Keep T3 on Fable and wait out each limit.** Rejected: 2026-09-06 showed the Commander and its Worker stopping together, with the Worker's work uncommitted and unreceipted.
- **Move the Commander to Opus and keep T3 Workers on Fable.** Rejected by the Owner: the Commander holds the dispatch, integration, and external-action authority for the whole line, so stranding it strands every open attempt at once.
- **A fallback chain from Fable to Opus on a limit response.** Rejected: no fallback of any kind exists, and a silent switch would falsify the binding evidence the receipts carry.
- **Collapse T2 and T3 into one class now that they share a model on one route.** Rejected: the class test governs brief freezing, the body hash, and review posture, and the Codex route still binds the two classes to different models.
- **Per-attempt Commander discretion over the model.** Rejected: bindings are fixed so that an Issue is launchable from either harness without a body change and so that a receipt's binding means the same thing in every attempt.

This decision governs repository-development orchestration only. It changes no AI7 product Model Role, Provider Resolution Plan, Provider Processing scope, credential, Effect, E2E provider-free boundary, export, publication, distribution, release, or `main` authority; the `deepseek-v4-flash` development binding of ADRs 0065 and 0067 is untouched.
