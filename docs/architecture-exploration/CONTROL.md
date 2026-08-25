# Architecture exploration control board

Status: **freeze-marker payload; active at the dedicated Issue #16 merge commit or its descendants; no active architecture Worker; implementation not authorized**

Freeze work item: [Issue #16](https://github.com/zhouy1017/ai7-harness/issues/16)

Canonical integration line: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`

Exact pre-marker aggregate content head: `design-doc@779db44cb557156f71af17e5b240b03681264ad5`

Freeze manifest: [`docs/design-doc/FREEZE-BASELINE.md`](../design-doc/FREEZE-BASELINE.md)

Last updated: **2026-08-25**

This board controls repository-development coordination only. It is not an AI7 product workflow, a Policy Document, or a replacement for canonical context and ADR definitions.

On the source branch before the Issue #16 pull request merges, the only remaining action is Commander integration into `design-doc`. At that merge commit or any descendant, the frozen-state directives and next control event below are active.

## Current disposition

| Work line | State at freeze | Authority disposition |
| --- | --- | --- |
| Issues #1–#3: Phase 0, V1 UI/UX, and Commander exploration | integrated historical/candidate outcomes | Reachable in `design-doc`; no longer active; not accepted into `main` by this freeze |
| Issue #4: V2 architecture candidate | coherent candidate complete | Reachable under `docs/architecture-v2/`; awaits a separate owner acceptance/retirement decision |
| Issue #5: V2 UI/UX plus proposal/reusable-procedure delta | candidate complete | Reachable under `docs/ui-ux-v2/`; awaits a separate owner acceptance/retirement decision |
| Issues #6–#9, #12, and #14 | Commander integrations complete | Exact source heads, commits, and PRs are listed in the freeze manifest |
| Issue #16 | validated marker payload before merge; active freeze marker at/after merge | Records completeness and dispositions only; does not select a canonical product design |

There is no active design-writing dispatch after Issue #16. Previous Worker/Reviewer task IDs, provider fallback logs, probe history, and obsolete next events remain available at `design-doc@779db44:docs/architecture-exploration/CONTROL.md` and in the indexed archive where applicable. They are Git-only history rather than current instructions.

## Directives in force

1. `main` remains the only canonical design line. Do not merge or push to it without a new owner authorization and Commander integration action.
2. `design-doc` is a frozen aggregate starting point. Completeness of disposition does not grant acceptance, implementation, source-copying, dependency-installation, publication, migration, or release authority.
3. Do not revive frozen Workers or infer precedence from branch recency, merge order, document count, or apparent completeness.
4. Resolve design truth against an exact target commit and the owning ADR, Policy Document, or context definition. Use the freeze manifest only as the source/disposition index.
5. Any later canonicalization must identify an exact path allowlist and collision treatment. Any later implementation-planning action must be separately authorized after that selection.
6. Keep the existing minimal validation boundary: one logical provider-free E2E Functional Gate on Windows and macOS. The freeze checks are documentation integrity checks, not a product gate.

## Next control event

Before the marker exists, the next valid event is only the dedicated Commander merge into `design-doc`. At the marker or any descendant, the next valid event is an explicit owner decision to do one of the following:

- accept, reject, or revise named candidate paths;
- authorize a bounded Commander pull request that promotes an exact path allowlist into `main`; or
- after an accepted canonical baseline exists, authorize implementation planning or implementation as a separate scope.

Until then, preserve the freeze marker, keep `main` unchanged, and perform no product implementation.
