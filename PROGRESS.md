# Current checkpoint

## What's done

- The Owner confirmed on 2026-09-01 that GitHub Actions again has 3,000 included minutes per month and authorized a monitored restoration of exact workflow `E2E Functional Gate` (ID `342459594`). Hosted CI remains integration evidence and may not be used as a debugger.
- Issue #166 / PR #167 integrated ADR 0057 and the truthful workflow configuration into exact `dev@3ea64490795a7a2b8b92930058c1c5766de69f8a`. The hosted command order is exactly J-01 → J-02 → J-08 → J-12 → J-15; dormant J-03 remains absent until Issue #47 supplies its real runner and dispatcher.
- Issue #168 completed the scoped repository lifecycle sweep. The outgoing Issue #166 implementation checkpoint is preserved byte-identically at `docs/archive/issue-166-hosted-gate-restoration-2026-09-01/`; its handoff remains in Git history only.
- The restoration and lifecycle pull requests were authored, reviewed, and integrated while the workflow was disabled. No dispatch, probe, rerun, backfill, product Journey, or September Actions occurrence was used to validate them.

## What's next

- Resolve mutable GitHub state live rather than from this checkpoint. If Issue #166 is open and workflow `342459594` is still disabled, the Commander may enable it once only after confirming its exact identity/configuration, zero queued/in-progress runs, no open Ready pull request, and the authoritative usage baseline. If it is already active, do not repeat the action. Confirm enablement itself created no run, record the result on Issue #166, and close that Issue.
- After the restoration closure, the next repository decision is the Owner response on Issue #165. Issue #47 remains blocked and must not be refreshed or dispatched before that authority conflict is resolved.

## Key decisions

- The Gate retains Ready-only `pull_request` cadence, Draft suppression, complete-diff routing, same-PR cancellation, and one paired Windows/macOS occurrence per integration-ready product change. Debugging and repair stay local; a changing PR returns to Draft before push.
- Actual usage is observed outside Actions. Before Ready, read the Owner-visible account meter plus repository attribution; after the one normal occurrence, read its run/job usage and the account delta. If the authoritative meter is unavailable or capacity is insufficient, leave the PR Draft instead of probing with a run.
- No monitoring workflow, schedule, manual dispatch, fast lane, usage ledger, uploaded artifact, additional proof gate, or numeric spend policy was introduced.

## Unresolved matters or blockers

- The current CLI credential lacks GitHub Plan-read, so exact account-wide minutes require the Owner-visible billing surface or a separately authorized read scope. Do not widen credentials silently. The truthful starting facts are the Owner-confirmed 3,000-minute monthly allowance and zero repository runs in September before restoration.
- Issue #165 requires an exact Owner decision about the Issue #47 artifact ceiling and provider-denied preflight. No Provider action is authorized.

## Safe Resume Prompt

```text
From current origin/dev, first query Issue #166 and live workflow 342459594 state. If #166 remains open and the workflow is disabled, recheck exact identity/configuration, zero Ready pull requests, zero queued/in-progress runs, and the authoritative usage baseline, then enable once without dispatch, probe, rerun, or backfill; verify that no run was created, comment the facts on #166, and close it. If it is already active or #166 is closed, do not repeat enablement. Then stop at Issue #165 for the Owner's authority decision; keep Issue #47 blocked and do not expand billing permissions.
```
