# Agent document router

This is the task-oriented reading map. Root [`AGENTS.md`](../../AGENTS.md) is the universal entry. A Commander then reads current [`PROGRESS.md`](../../PROGRESS.md), [`HANDOFF.md`](../../HANDOFF.md), and the [Dispatch Register](./dispatch-register.md). During the no-write bootstrap, a Worker or Reviewer reads `AGENTS.md`, its GitHub Issue, and immutable launch expectations; after the finalized Receipt permalink arrives, it fetches and verifies that Receipt before edits. Load the smallest additional row that covers the active Change Brief; do not read another task transcript, every linked document, or the root routers by default.

## Design-truth order

Resolve every authority path from the exact intended integration target, written as `<target-commit>:<path>`. A same-named file in another tree is not a substitute. During development, task work normally targets `dev`; a record present only on frozen `design-doc`, another branch, or an archive is source-qualified candidate/evidence until exactly promoted to the intended target.

1. scoped owner decision;
2. target-qualified repository operating rules and their binding runbooks;
3. target-qualified accepted ADRs, Policy Documents, and context definitions;
4. the accepted Issue outcome after it agrees with those owners;
5. current implementation reality;
6. current routing and background records;
7. explicitly labeled candidate or evidence material; and
8. exact archived history when a current record names it.

Use [design authority and action authorization](./design-authority.md) for conflicts and its separate action-authorization matrix before acting. Authority and permission are separate: a correct design statement may still lack permission to act, and Commander execution authority never expands owner-only scope.

## Read by task

| Task | Read after the universal set |
| --- | --- |
| Repository dispatch, resume, acceptance, or retention | [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md); [Dispatch Register](./dispatch-register.md); active Issue receipts; the Commander harness's session state |
| Any non-mechanical change | Active Issue/Change Brief; [incremental development](./incremental-development.md); relevant context/ADR; affected sections of [project constraints](./project-constraints.md) |
| Mechanical T1 change | Short Change Brief; exact named paths; applicable formatting or Git rule only |
| Bug diagnosis | Nearest supported journey and issue; affected code path; [CI boundary](./ci-test-boundaries.md). Temporary diagnostics do not become standing gates |
| Domain or authority change | [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md); relevant context; root ADRs/Policy Documents; [domain rules](./domain.md); owner decision if semantics or authority would change |
| Architecture/design fork | [design authority](./design-authority.md); [multi-session workflow](./multi-session-design-workflow.md); Commander-curated packet; current control record if the branch uses one |
| Harness, dependency, pin, bootstrap, build, or launch change | Relevant accepted ADRs, especially 0020/0021; Runtime/Harness sections of [project constraints](./project-constraints.md); [Source Checkout Buildability](./source-checkout-buildability.md) when applicable; [incremental development](./incremental-development.md) |
| Git, PR, tag, or release work | [Git conventions](./git-conventions.md); [issue tracker](./issue-tracker.md); [CI boundary](./ci-test-boundaries.md); explicit Commander authorization |
| Documentation cleanup or handoff | [document lifecycle](./document-lifecycle.md); current Change Brief; exact node archive index |
| Historical investigation | Current authority record naming the gap; exact archive index/artifact only. Do not search all archives or reconstruct chronology without a blocking reason |

## Current versus historical material

- Root ADRs remain at stable paths even when superseded; their explicit status or supersession chain preserves decision history.
- Root context files and Policy Documents own current domain and authority definitions.
- `kick-in/` records the design interview and migration reasoning. It is not the ordinary implementation entry point and cannot override a root authority owner.
- `docs/architecture-v2/` and `docs/ui-ux-v2/` are the Owner-accepted implementation-facing design packages on `dev`; their acceptance defines design truth but grants no adjacent action, provider/export authority, publication, release, or `main` promotion.
- `HANDOFF.md` and `PROGRESS.md` are Commander-owned integration-line routers, not Task/attempt state or universal Worker/Reviewer context.
- `docs/archive/` is historical storage, excluded from default search and context assembly.

## Keep the reading set small

Use `rg` to locate the exact symbol, term, ADR, or section named by the Change Brief, adding `-g '!docs/archive/**'` for repository-wide searches. Read the owner module, its direct callers/consumers, and the nearest contract or supported journey. Expand outward only when that bounded scan fails to locate an adequate seam or exposes a concrete contradiction.
