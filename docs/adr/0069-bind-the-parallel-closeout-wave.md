---
status: accepted
---

# Bind the parallel closeout wave to an Opus Commander and Sonnet T1 Workers at high effort

On 2026-09-07, after the governance closeout of that day, the Owner resumed development in a different shape: split the standing design and Issue backlog into units a `claude-sonnet-5 @ high` Worker can finish, run several of them in parallel, and have the Commander at `claude-opus-5 @ high` review every result and merge every pull request. Three things in force do not admit that as written — the T1 effort of [ADR 0061](./0061-route-repository-dispatch-by-commander-harness.md), the Commander binding of [ADR 0068](./0068-rebind-the-t3-worker-and-reserve-fable-for-the-commander-and-reviewer.md), and the absence of any rule about running two Electron Journeys on one host — so this decision records all three.

## Decision

### Claude Code bindings

| Role or class | Binding | Change |
| --- | --- | --- |
| Commander | `claude-opus-5 @ high` | was `claude-fable-5-1 @ xhigh` under ADR 0068 |
| T1 Worker (mechanical) | `claude-sonnet-5 @ high` | was `claude-sonnet-5 @ medium` |
| T2 Worker (standard build) | `claude-opus-5 @ high` | unchanged |
| T3 Worker (high-stakes) | `claude-opus-5 @ high` | unchanged under ADR 0068 |
| Reviewer, every reviewed class | `claude-fable-5-1 @ xhigh` | unchanged under ADR 0068, and optional under ADR 0064 |

The Codex route is unchanged in full. ADR 0068's reservation of `claude-fable-5-1 @ xhigh` now covers the Reviewer alone; its T3 Worker rebinding and its class-match rule continue unchanged.

### The Commander reviews what it integrates

In this wave the Commander performs the review itself, at its own binding, before it integrates: it reads the Worker's diff at the exact head against the Brief and the class test, verifies the head, the ladder claims, and the protected-material and dependency boundaries, and records what it verified in the Return Receipt. This is not a new authority — ADR 0061 already gives the Commander acceptance and integration, and ADR 0064 already made the advisory Reviewer optional — but it becomes the default for T1 work instead of a Reviewer attempt. A separate Reviewer attempt stays available at the ADR 0068 binding whenever the Commander wants a second, independent read, and stays advisory.

### Splitting to the class, not to the model

A unit dispatched at T1 satisfies the class test's T1 bar — mechanically checkable — **at the moment it is dispatched**, not after the Worker starts. Where a standing Issue mixes a decision with its implementation, the Commander settles the decision in the Brief first, which is the T0 work it already owns, and dispatches only the checkable remainder. A unit that cannot be reduced that way stays T2 or T3 and is not part of this wave. Class is never lowered to fit an available model; the work is reduced to fit the class, or it keeps its class.

### Parallelism and the single E2E slot

Parallel T1 attempts are admitted under the delivery plan's existing rule — same phase, no dependency between them, different owners — sharpened here to **file-disjoint owner sets**: two attempts running at once never edit the same file, and the Commander states each attempt's file set in its Brief.

One host constraint is now explicit: only one Electron Journey may run on this host at a time, so `e2e:all` cannot run in two attempts at once. A parallel Worker therefore runs the Local Verification Ladder through `build`, commits, and reports `ready-for-e2e` with everything else complete. The Commander then releases the E2E rung to one attempt at a time by resuming that Task Session, and each Worker finishes its own ladder in its own turn. A Return Receipt still records `Local completion` only when every rung, `e2e:all` included, passed at the exact head; a Worker that stopped at `ready-for-e2e` and never got its slot is `needs-commander`, not complete.

### No fallback

The no-fallback rule continues without exception. An open attempt keeps the binding it launched with; a rebinding applies to attempts launched after this decision.

## Consequences

- The Fable budget now backs only the optional Reviewer, so the exhaustion that ADR 0068 was written for cannot recur through the Commander.
- Review quality for T1 work now depends on the Commander reading every diff. The Commander records what it verified, so a thin review is visible in the receipt rather than invisible.
- Parallel attempts are limited by file disjointness and by the single E2E slot, so the practical width of a wave is small — two or three attempts, not many.
- Serial product integration is unchanged: pull requests still merge one at a time, each rebased on the head the previous one produced.

## Rejected alternatives

- **Keep T1 at `medium`.** Rejected by the Owner: a wave where the Commander reviews rather than co-writes puts more weight on the Worker's own care.
- **Move T2 to Sonnet as well.** Not adopted: T2 has a written brief but an existing seam to judge, and nothing in this wave requires it. T2 stays `claude-opus-5 @ high`.
- **Let parallel Workers run `e2e:all` whenever they are ready.** Rejected: two Electron Journeys on one host corrupt each other's results, and a flaky pair would be indistinguishable from a real regression.
- **Drop `e2e:all` from a parallel Worker's ladder.** Rejected: ADR 0062 makes the complete ladder the precondition for Ready, and a Journey-blind T1 change is exactly the kind that breaks a Journey.
- **Keep a Fable Reviewer on every T1 attempt.** Rejected: ADR 0064 already made the Reviewer optional, and spending the scarce binding on mechanical work is what this decision is avoiding.

This decision governs repository-development orchestration only. It changes no AI7 product Model Role, Provider Resolution Plan, Provider Processing scope, credential, Effect, E2E provider-free boundary, export, publication, release, or `main` authority.
