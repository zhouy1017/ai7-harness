# Current checkpoint

## What's done

- On 2026-09-01 the Owner required workflow checks to stay synchronized with new implementation. Issue #170 / PR #171 integrated the binding rule into exact `dev@c4add0dbd93e2937d4f0ded18d3634b2b6e296ff`.
- Every implementation Change Brief and PR closure now records one Gate projection disposition: `exact reuse — checked unchanged`, naming why the existing scenario/runner/local/Hosted invocation already exercises the change; or `synchronized delta`, atomically updating every affected scenario/runner/controller/local `e2e:all`/Hosted workflow projection in the same Issue and pull request.
- A missing Structural Budget for required projection work is a stop condition. Documentation/design-only work may use `N/A`; implementation work cannot. Unchanged invocation does not justify mechanical workflow YAML edits.
- Issue #172 completed the scoped lifecycle sweep. The consumed Issue #170 checkpoint is archived byte-identically at `docs/archive/issue-170-gate-projection-sync-2026-09-01/`; its handoff remains in Git history only.
- PR #171's normal Markdown occurrence was run `33470502060`: one Ubuntu route job succeeded, the product matrix was skipped, total run duration was 9 seconds, and GitHub's timing API reported billable Ubuntu time `0 ms`. There was no duplicate, dispatch, probe, or rerun.

## What's next

- The next repository authority boundary is the Owner response on Issue #165. Issue #47 remains blocked and must not be refreshed or dispatched before that decision.
- For every later implementation, resolve the Gate projection disposition in its Change Brief before editing, keep debugging local while Draft, and observe actual Actions usage before Ready and after its one normal occurrence.

## Key decisions

- Synchronization is a reconciliation decision, not mandatory YAML churn. Existing Journey coverage may be reused only when the brief names the real scenario/runner and explains why local and Hosted invocation already exercise the change.
- An implementation change that alters a represented outcome or invocation cannot merge while its required Gate projection is deferred. Missing Structural Budget is a stop condition and requires a revised Change Brief before work continues.
- Detailed admission and execution rules remain in the existing CI boundary; the lifecycle owns when implementation must resolve them, and the template makes that decision visible to the next agent.

## Unresolved matters or blockers

- The current CLI credential lacks GitHub Plan-read, so exact account-wide minutes require the Owner-visible Billing surface; do not expand permissions silently. The Owner-confirmed allowance remains 3,000 included minutes per month. Repository run/job timing remains independently observable.
- A pre-existing root `README.md` sentence still describes the paired workflow as dormant. It was outside Issues #170/#172 and needs separate documentation scope before that sentence is treated as current state.
- Issue #165 still requires the Owner's separate artifact-ceiling/provider-preflight decision; Issue #47 remains blocked. No Provider action is authorized.

## Safe Resume Prompt

```text
Resume from current origin/dev. The next authority boundary is the Owner response on Issue #165; keep Issue #47 blocked until that decision. For any later implementation, require its Change Brief and PR closure to record exact Gate reuse checked unchanged or the named synchronized local/Hosted projection delta in the same Issue/PR; stop if the Structural Budget omits required projection work. Keep debugging Draft/local, check Actions usage before Ready and after the one normal occurrence, and do not fix the stale README sentence without separate scope.
```
