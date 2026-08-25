# Current handoff

Status: **freeze-marker cold-start router; active at the dedicated Issue #16 merge commit or its descendants; documentation only; no implementation authority**

## Current state

- Canonical line: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`, unchanged by the aggregation and freeze work.
- Exact content baseline before the freeze marker: `design-doc@779db44cb557156f71af17e5b240b03681264ad5`.
- Freeze identity: the merge commit of [PR #17](https://github.com/zhouy1017/ai7-harness/pull/17) into `design-doc`; Git/PR metadata supplies its exact SHA because a merge commit cannot embed its own identity.
- [`docs/design-doc/FREEZE-BASELINE.md`](docs/design-doc/FREEZE-BASELINE.md) lists every integrated source line, recovery snapshot, stash, evidence-only ref, superseded item, reconciliation, and deferred matter.
- The aggregate has 40 root ADRs, 851 unique V2 UI/UX requirements, D-001–D-084, J-01–J-16, and 14 V2 UI ADRs.
- No product implementation, dependency manifest, CI workflow, supported-journey implementation, manuscript, credential, or private fixture exists in this freeze work.

Before PR #17 merges, this file routes only to completing the bounded Commander integration. At the merge commit or any descendant, it routes to later owner selection from the frozen aggregate.

## Start here

1. Read root [`AGENTS.md`](AGENTS.md).
2. Read the [freeze baseline](docs/design-doc/FREEZE-BASELINE.md).
3. Read current [`PROGRESS.md`](PROGRESS.md) and the [control board](docs/architecture-exploration/CONTROL.md).
4. Use the [agent document router](docs/agents/README.md) to load only the runbooks relevant to the authorized task.
5. Resolve product definitions from the exact target commit and their owning ADR, Policy Document, or context `CONTEXT.md`.

Do not start from chronological history, archived handoffs, all of `kick-in/`, or whichever candidate looks newest or most complete.

## What the freeze means

Every discovered documentation outcome has a recorded disposition and all integrated source heads are reachable from `design-doc`. This is a stable design-reading and later-selection point.

The freeze does not accept every candidate conclusion, promote anything to canonical `main`, authorize implementation planning, or grant product implementation, source-copying, dependency-installation, publication, migration, or release authority.

## Immediate traps

- Candidate status is target-qualified. Branch visibility, merge ancestry, review, or completeness does not establish canonical authority.
- Owner authorization sets outer scope; Commander dispatch and integration authority operates inside it. Worker and Reviewer roles do not inherit either authority.
- One Book owns at most one primary Manuscript. A Delivery Package binds exactly one Editorial Deliverable Revision, optionally at one exact Milestone Version.
- `Task Input` is a Manuscript Checkpoint purpose. Promoting a response targets a `Task Intent Draft`.
- Dialogue Answer History is a non-authoritative joined projection across the AI7 Task Ledger and Harness Session Ledger, not a third ledger or copied transcript.
- Source Checkout Buildability is setup for the existing E2E Functional Gate, not a separate proof programme.
- Manuscripts, derivatives, credentials, and private samples never enter repositories or hosted CI.
- Do not revive retired validation programmes or create a second generic agent loop.

## Safe next action

If this is the pre-merge Issue #16 source branch, complete only PR #17 into `design-doc`. At the merge commit or any descendant, obtain an explicit owner decision naming the exact candidate paths to accept, reject, or revise. Only then may the Commander prepare a separate allowlisted `main` integration. Implementation planning and implementation require their own later authorization.
