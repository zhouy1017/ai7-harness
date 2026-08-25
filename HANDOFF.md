# Current handoff

Status: **current cold-start router for the `design-doc` freeze-preparation line; not a design authority or historical narrative**

## Current state

- `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` remains the recorded canonical integration baseline. Refresh that pin before any future `main` integration.
- Before Issue #14, `design-doc@4ee5d4bb0967f82c7f8abb01aa2541616052710b` contains PR #10 Source Checkout Buildability, PR #11 Issue #8 completion, and PR #13 response presentation through D-084/J-16/UI ADR 0014.
- The current Issue #14 candidate reorganizes repository-agent guidance and archives consumed working history. It preserves 40 root ADRs, 851 unique V2 UI/UX requirements, 84 directions, 16 journeys, and 14 UI ADRs.
- `design-doc` remains an aggregate/candidate line. Branch-local accepted records do not become `main` implementation authority by visibility, completeness, review, or merge ancestry.
- No product implementation, `package.json`, dependency graph, CI workflow, or supported-journey implementation exists.

## Start here

1. Read root [`AGENTS.md`](AGENTS.md).
2. Read current [`PROGRESS.md`](PROGRESS.md).
3. Read the active Issue/Change Brief and resolve authority from its exact intended target commit.
4. Use the [agent document router](docs/agents/README.md) to load only task-specific material.
5. If working from `design-doc`, read its [aggregate router](docs/design-doc/README.md).

Do not start from chronological history, archived handoffs, all of `kick-in/`, or a candidate package chosen because it is newer or more complete.

## Guidance now available

- [Design authority and action authorization](docs/agents/design-authority.md) separates target-qualified truth from Owner, Commander, Worker, and Reviewer permissions.
- [Incremental development](docs/agents/incremental-development.md) enforces reuse-first vertical change, structural budgets, cumulative replacement detection, narrow bootstrap, and version iteration from the last integrated implementation.
- [Change Brief](docs/agents/change-brief.md) supplies compact and full forms inside the existing Issue/dispatch flow.
- [Detailed project constraints](docs/agents/project-constraints.md) retain product, authority, runtime, buildability, and migration rules behind the thin root router.
- [Document lifecycle](docs/agents/document-lifecycle.md) drives recurring keep/archive/delete/Git-only decisions from development nodes rather than dates.
- [Archive index](docs/archive/agent-guidance-baseline-2026-08-25/INDEX.md) records the exact first lifecycle sweep and its current replacements.

## Immediate traps

- A same-named ADR, context, or rule in the current worktree is not canonical for another target; resolve `<target-commit>:<path>`.
- Owner authorization defines outer scope; Commander authority dispatches, integrates, and performs approved external actions inside it. Neither substitutes for the other.
- Bootstrap means the first thinnest accepted runnable end-to-end outcome, not empty packages or a horizontal architecture skeleton.
- Fresh-checkout buildability is an input/launch contract for the existing provider-free E2E Functional Gate, not a separate build, package, or reproducibility gate.
- One Book owns at most one primary Manuscript; Delivery Package binds one exact Editorial Deliverable Revision; Task Input is a Manuscript Checkpoint purpose; Run Budget Ceiling and Provider Account Limit remain distinct.
- The AI7 Task Ledger and Harness Session Ledger join through exact Execution Bindings/Spans without transcript copying; Dialogue Answer History is a non-authoritative joined projection, not a third ledger.
- Manuscripts, derivatives, credentials, and private samples never enter the repository or hosted CI.
- Do not revive retired verification programmes or create a second generic agent loop.

## Safe next action

Complete the Commander-owned Issue #14 pull request into `design-doc`, then create the separate freeze-baseline Issue/branch/PR that records the disposition of every discovered documentation outcome. Keep `main` unchanged and do not infer product implementation planning or implementation permission.
