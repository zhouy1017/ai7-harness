# Current checkpoint

## What's done

- [Issue #115](https://github.com/zhouy1017/ai7-harness/issues/115) / [PR #116](https://github.com/zhouy1017/ai7-harness/pull/116) is squash-integrated at `dev@a2c8f2979f982fa819fb9d5963397e115f19fb54`. The existing `.github/workflows/e2e.yml` now implements the ADR 0049 hosted-invocation boundary.
- The workflow subscribes only to `ready_for_review` and `synchronize`, guards the route job against Draft pull requests, and uses pull-request-number-scoped `cancel-in-progress`. The complete-diff Markdown router and unchanged J-01/J-02/J-08 Windows Server 2025 x64 / macOS 15 arm64 matrix remain in the one logical Gate.
- Local validation confirmed the exact single-path, eight-line additive diff, retained router/matrix/journey commands, and clean whitespace. No dependency was installed, no advisory review was required, and no hosted workflow ran.
- Workflow `E2E Functional Gate` (`342459594`) remains `disabled_manually` with no active or queued run. PR #110 remains an open Draft. Integration claims no green Gate and does not restore Actions authority.
- Scoped lifecycle sweep: the stable workflow, ADR, and runbooks remain current; the consumed root routing remains recoverable in `dev` Git history and PR #116, and no archive move or disposable artifact is needed.

## What's next

- Await an exact Owner statement restoring GitHub Actions usage. Until then, do not run, rerun, dispatch, or re-enable the workflow; do not make PR #110 or another product pull request Ready; and do not merge product work that requires the Gate.
- After exact restoration, process queued product branches one at a time in dependency order under ADR 0049: re-resolve current `dev` authority, rebase, locally revalidate, make Ready, obtain one paired-platform Gate occurrence, merge, then advance.

## Key decisions

- A quota reset, elapsed billing period, available minutes, or the integrated workflow change does not restore authority.
- Draft activity starts no hosted job. The Commander-controlled Ready transition and later synchronization while Ready are the only workflow activity types; same-PR concurrency cancels a superseded occurrence.
- The complete pull-request-diff router remains authoritative inside the workflow. Markdown-only Ready changes stop after routing; product-affecting changes retain all currently admitted J-01/J-02/J-08 journeys on both supported CI hosts.
- No label, component catalog, direct push, manual dispatch, schedule, nightly, release, package, exact-head rule, required check, second gate, dependency, or new routing authority was introduced.

## Unresolved matters or blockers

- GitHub-hosted Actions usage remains suspended until an exact future Owner restoration statement.
- PR #110 remains queued as a Draft product change. Its target authority, local validation, and integration order must be re-resolved after restoration; this checkpoint grants it no merge authority.

## Safe Resume Prompt

```text
Commander: resolve exact HEAD and current origin/dev, then consume ADR 0049 and integrated Issue #115 / PR #116. Verify E2E Functional Gate 342459594 remains disabled_manually with no active or queued run and confirm PR #110 remains Draft. Unless the Owner has supplied an exact new restoration statement, do not run, rerun, dispatch, or re-enable Actions; do not make a product PR Ready or merge product work; report the verified suspension and stop. If an exact restoration statement is present, follow its bounded authority, re-resolve queued branches against current dev, locally revalidate, and process them one at a time through the paired Windows/macOS J-01/J-02/J-08 Gate.
```
