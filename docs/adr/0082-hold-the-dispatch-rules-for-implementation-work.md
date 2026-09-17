---
status: accepted
---

# Hold the dispatch rules for implementation work until the Owner lifts the hold

On 2026-09-17 the Owner asked for "a temporary hold on dispatch rules on implementation tasks" with "a quick fallback", and settled its shape in one line: "go, keep Issue linkage, lift on my word". This decision records that hold. While it is active, an implementation slice is built directly in a session the Owner runs, on the slice's Issue branch and through its own pull request, without a Change Brief, a fresh Task Session, receipts, or a fixed class binding. The Issue linkage, the pull-request path, the Local Verification Ladder, the Gate and the nightly queue, the protected-material and credential rules, and every Owner-reserved decision stand exactly as they are. The Owner's direction to write and land this record is its acceptance, as it was for [ADR 0081](./0081-run-the-nightly-full-gate-over-every-open-pull-request-merge-the-ones-that-pass-and-then-over-dev.md).

The hold is a documentary switch because nothing in the repository enforces the dispatch procedure mechanically: `dev` and `main` require only a pull request ([development lines](../agents/development-lines.md)), and the nightly queue of ADR 0081 merges any green non-draft candidate that touches no `proposed` ADR and no policy document. The procedure lives in the runbooks and the dispatch ADRs alone, so the switch is one bullet in root `AGENTS.md`, and the fallback is that bullet's removal. [ADR 0050](./0050-waive-hosted-e2e-integration-evidence-during-actions-exhaustion.md) is the precedent: a temporary amendment keyed to an observable state, with its expiry and restoration written into the record itself.

## Decision

### 1. Activation and lift condition

The hold is active while root `AGENTS.md` at the integrated `dev` head carries the Development bullet that names this decision as the active dispatch hold. It became active at the `dev` commit that landed this record. It ends on the Owner's word alone, executed by the lift pull request of §5. No date, elapsed time, count of pull requests, phase, or milestone ends it by itself, and no agent asks the Owner whether it continues.

### 2. Scope

The hold covers implementation work: every T1, T2, or T3 slice of the [development plan](../development/development-plan.md), and every fix, test, runner, schema, fixture-tooling, or configuration change that would otherwise be dispatched to a Worker. It does not cover the authoring or acceptance of an ADR, the bytes of a canonical policy document under `docs/policies/`, a change to a frozen design reference, a credential, export, publication, distribution, release, or any action on `main`. Those keep their owners and their Owner gate unchanged.

### 3. Clauses held

Explicit supersession changes only the named clauses ([design authority](../agents/design-authority.md), conflict algorithm rule 3). For work inside §2, and only while the hold is active, the following clauses do not apply. They are not edited; they resume unchanged at the lift.

| Owner | Clause held |
| --- | --- |
| Root `AGENTS.md`, Development | The Worker clauses of the lifecycle bullet and the launch-mode, binding, receipt, and Reviewer clauses of the dispatch bullet, for held work |
| [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) | "The Commander never performs T1–T3 product work inline and never edits an attempt's worktree"; the class test and the fixed bindings; the launch modes and the launch sequence; the Issue identity, Brief revision, and T3 body hash; the receipts; the local completion and return report; the retention rule for Task Sessions |
| [Incremental development](../agents/incremental-development.md) §1 and §7 | "one writable Worker in a fresh Task Session"; "A Worker starts only after verifying its Issue and Launch Receipt"; the Worker's report and the Commander's audit, receipt, and relay in §7 |
| [Design authority](../agents/design-authority.md), action-authorization matrix | The Commander's "Perform T1–T3 product work inline" |
| [Git conventions](../agents/git-conventions.md) | "one writable Worker. Every Worker attempt runs in a fresh Task Session …"; "Before work is labeled `ready-for-agent` or dispatched, the Issue contains the one-page Change Brief"; the Return Receipt in step 1 of the branch-retirement sequence |
| [Issue tracker](../agents/issue-tracker.md) | The Brief as the meaning of `ready-for-agent`; one Launch and one Return Receipt per attempt; the T3 body hash |
| [Change Brief](../agents/change-brief.md) | The Brief as the precondition of work; the header bindings; the first prompt to a Task Session |
| [Development plan](../development/development-plan.md), the loop | Step 2 in full, and the Return Receipt of step 3 |
| ADRs [0061](./0061-route-repository-dispatch-by-commander-harness.md), [0063](./0063-allow-cross-harness-dispatch-through-cli-launched-task-sessions.md), [0064](./0064-reweight-repository-development-toward-value-first-delivery.md), [0068](./0068-rebind-the-t3-worker-and-reserve-fable-for-the-commander-and-reviewer.md), [0069](./0069-bind-the-parallel-closeout-wave.md) | Their binding tables, launch modes, receipt schema, class test, and no-fallback rule, for held work only |

Every clause not named here continues: the Reviewer role and its receipts under ADR 0068, ADR 0069's rule that two sessions running at once never edit the same file and its single Electron Journey per host, the Commander's mechanical-edit allowance of ADR 0064, the [Dispatch Register](../agents/dispatch-register.md) as a query, and everything outside §2. The read-by-task table of [`docs/agents/README.md`](../agents/README.md) is deliberately untouched; the `AGENTS.md` bullet is the route to this record.

### 4. How held work is done

- **One Issue, one branch, one pull request.** The slice's existing Issue is the Issue; an unplanned fix opens its own Issue before its branch. The branch is `<type>/<issue>-<slug>` from current `dev`, one branch has one writing session, and the pull request body links the Issue and states the outcome. No Brief is written on the Issue; the pull request body is the record.
- **Any session the Owner runs.** The Owner's own session or the Commander session implements in its own worktree and branch, at whatever model and effort the Owner chose for it. No class binding applies, `launch-unavailable` cannot occur, and a model change inside a session is recorded in the pull request, not stopped. The implementing session holds the Commander's authority for its own branch: it pushes, opens the pull request, marks it Ready, and merges by hand or leaves the merge to the nightly queue.
- **Provenance in the pull request body.** The Change closure of [`change-brief.md`](../agents/change-brief.md) gains one line: `Authored under the ADR 0082 hold: <harness>, <model> @ <effort>`. It is the only place the binding is recorded, and it claims nothing about the effective runtime model, exactly as receipts never did.
- **Verification is unchanged.** Product work passes the complete Local Verification Ladder at the exact head on the supported host before Ready ([ADR 0062](./0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md)); the pull-request lane runs at Ready and the nightly queue merges what passes ([ADR 0075](./0075-split-the-hosted-gate-into-a-fast-pull-request-lane-and-a-nightly-full-gate.md), ADR 0081). The Commander's review of ADR 0069 becomes the author's own check of its diff against the plan slice before Ready, recorded in the Change closure. A fresh read-only Reviewer at `claude-fable-5-1 @ xhigh` stays available on the Owner's request, with its own receipts, and stays advisory.
- **`PROGRESS.md`** is updated inside the integrating pull request or by a documentation pull request, as ADR 0064 already says; the hold adds no ledger, status file, or register.

### 5. The lift

The lift is one Commander documentation pull request under ADR 0064, without an Issue, Worker, or receipts. It removes the Development bullet from `AGENTS.md`, replaces the hold sentences in `PROGRESS.md` and its Resume Prompt, and sets this record's status line to `superseded` with one line naming the lift date and the pull requests authored under the hold. Nothing else changes, because nothing else was edited. From the lift's integration every new implementation slice returns to dispatch under the resumed clauses.

A pull request authored under the hold and still open at the lift keeps its provenance line, stays under the unchanged ladder and Gate, and merges as it stands; it is not re-dispatched and receives no Launch or Return Receipt after the fact. Uncommitted or unpushed hold work at the lift is finished and opened under the same provenance line, or abandoned with its tip recorded on its Issue.

Re-activating the hold later is the same bullet put back by a documentation pull request that names this record and restores its status line; no new ADR is needed unless the hold's terms change.

## Consequences

- Each implementation slice saves the Brief, the launch, the two receipts, and the relay of a Worker's report; the pull request body carries the record instead.
- The audit of what ran moves from immutable Issue comments to an editable pull request body. That is accepted for a single-developer interval; the receipts return with the lift.
- No independent read precedes Ready unless the Owner asks for a Reviewer. The ladder and the two Gate occurrences remain the evidence that a change works.
- The runbooks still read as if dispatch were in force. `AGENTS.md` is the mandatory entry and its hold bullet routes every agent here before it implements or dispatches; a Worker or Reviewer session launched under the hold by mistake still stops `needs-commander` on its missing receipt.
- The revert surface is three files. A hold that is never lifted costs nothing beyond this record's presence.

## Rejected alternatives

- **Editing every runbook and kick-in/27 to carry hold clauses.** Rejected: seven owners, one of them a frozen design reference, and hold text mixed into durable rules, when the explicit-supersession rule already makes the named clauses inactive.
- **A chat-only hold.** Rejected: a fresh Commander session resolves its rules from the tree and would dispatch under the full procedure, and there would be no recorded state to fall back from.
- **Superseding the dispatch clauses permanently.** Rejected as not what the Owner asked for; the lift pull request can become that record if the hold proves out.
- **A marker or status file as the switch.** Rejected: the Dispatch Register forbids status files, and the router bullet is read by every agent at entry anyway.
- **An expiry by date, count, phase, or milestone.** Rejected by the Owner: the hold lifts on the Owner's word.
- **Dropping the Issue linkage as well.** Rejected by the Owner: every plan slice already has an Issue, and work without one is work nobody can find later.

This decision governs repository-development orchestration only. It changes no AI7 product Model Role, Provider Resolution Plan, Provider Processing scope, credential, Effect, E2E provider-free boundary, export, publication, distribution, release, or `main` authority.
