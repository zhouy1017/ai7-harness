# Current checkpoint

## What's done

- On 2026-09-01 the Owner required agents to keep workflow checks synchronized with new code implementation. Issue #170 contains the full documentation/process Change Brief from exact `origin/dev@244117bac73756f4269563a594f49f531b2d168f`.
- Current exact-head inspection found no existing projection drift: `e2e/controller.mjs` admission/runner/location ownership and `.github/workflows/e2e.yml` both resolve J-01 → J-02 → J-08 → J-12 → J-15. The stable package entries derive local execution from the controller.
- `docs/agents/incremental-development.md` now owns the implementation completion rule: every implementation Change Brief and PR closure records either `exact reuse — checked unchanged` or one synchronized projection delta. A required scenario/runner/controller/local `e2e:all`/Hosted workflow change must land atomically with the implementation in the same Issue and pull request.
- `docs/agents/change-brief.md` now prompts for that disposition in both the full brief and PR closure. Root `AGENTS.md` remains concise because it already routes every code change through the lifecycle and Change Brief owners.
- Exact four-path scope, required wording, two template prompts, documentation/design-only `N/A` limits, local Markdown links, and `git diff --check` pass. Independent read-only review found and then confirmed closure of the implementation-scope and `N/A` bypasses; final verdict is CLEAN.
- Live read-only GitHub inspection confirms workflow `342459594` is active, with zero September runs and zero queued/in-progress runs before this branch is pushed. No workflow action occurred.

## What's next

- Commit and integrate the validated Issue #170 unit through a Draft pull request.
- Immediately before Ready, re-read workflow/run/account usage state. Permit only the normal Markdown route occurrence, inspect its actual job usage afterward, and never dispatch, probe, or rerun it as a debugger. After merge, run the scoped lifecycle sweep.

## Key decisions

- Synchronization is a reconciliation decision, not mandatory YAML churn. Existing Journey coverage may be reused only when the brief names the real scenario/runner and explains why local and Hosted invocation already exercise the change.
- An implementation change that alters a represented outcome or invocation cannot merge while its required Gate projection is deferred. Missing Structural Budget is a stop condition and requires a revised Change Brief before work continues.
- Detailed admission and execution rules remain in the existing CI boundary; the lifecycle owns when implementation must resolve them, and the template makes that decision visible to the next agent.

## Unresolved matters or blockers

- The current CLI credential still lacks GitHub Plan-read, so exact account-wide minutes require the Owner-visible Billing surface; do not expand permissions silently. The Owner-confirmed allowance is 3,000 included minutes per month, and repository attribution is currently zero September runs.
- A pre-existing root `README.md` sentence still describes the paired workflow as dormant. It is outside Issue #170's four-path structural budget and must not be cleaned opportunistically; a separately scoped documentation fix is needed before that sentence is treated as current state.
- Issue #165 still requires the Owner's separate artifact-ceiling/provider-preflight decision; Issue #47 remains blocked. No Provider action is authorized.

## Safe Resume Prompt

```text
Continue Issue #170 from exact origin/dev@244117b in docs/170-sync-gate-projection. Commit the exact four-path CLEAN diff and open a Draft PR. Before Ready, recheck live workflow/usage state; if available, allow only the normal Markdown route occurrence and inspect its actual job usage. Do not dispatch, rerun, change workflow configuration, fix README drift, or touch Issue #165/#47 scope. After merge, run the scoped lifecycle sweep.
```
