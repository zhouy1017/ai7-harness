# Current checkpoint

## What's done

- [Issue #111](https://github.com/zhouy1017/ai7-harness/issues/111) / [PR #112](https://github.com/zhouy1017/ai7-harness/pull/112) is integrated at `dev@d3a02954df0e9747339df793b5d1330a60d2ec6f`. [ADR 0049](docs/adr/0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md) and its current runbook projections now own the accepted hosted-consumption boundary.
- Workflow `E2E Functional Gate` (`342459594`) remains `disabled_manually`, no run is in progress, and PR #110 remains an open Draft. GitHub-hosted Actions usage stays suspended until an exact later Owner restoration statement.
- `.github/workflows/e2e.yml` still predates ADR 0049. The exact next outcome is a separate CI-governance Issue/branch/PR organized by the next Commander; no workflow implementation, product code, dependency, Provider, policy, manuscript, release, or `main` path changed in the design normalization.
- Scoped lifecycle sweep: no archive move under the explicit no-archive task boundary; the superseded pre-merge checkpoint remains recoverable in `dev` Git history and PR #112, and no disposable artifact exists.

## What's next

- The next Commander follows `HANDOFF.md`: create the exact CI-governance Issue and full Change Brief from then-current `dev`, dispatch one writable Worker for existing `.github/workflows/e2e.yml`, validate locally, and integrate while the workflow remains disabled.

## Key decisions

- This is a fresh Owner amendment, not restoration of surviving tier authority. Superseded ADR and Question 24 history remain intact.
- The accepted model keeps one provider-free logical Gate: Draft PRs run nothing; a Commander makes an integration-ready PR Ready; newer Ready-PR pushes cancel a superseded same-PR run and start the newest occurrence; one external-infrastructure transient may be rerun once by Commander, while product/bootstrap/build/journey failures return the PR to Draft for local diagnosis.
- Every formal hosted occurrence keeps Windows/macOS parity and initially runs all currently admitted J-01/J-02/J-08 journeys. Admission of a fourth journey must reevaluate routing; shared or unknown changes fail closed to every admitted journey.
- Local development continues during the suspension, but product merges pause. Pure documentation, design, and CI-governance changes may integrate while the workflow is disabled after local validation; advisory read-only review remains optional. No required branch-protection check is added.

## Unresolved matters or blockers

- GitHub Actions usage remains suspended. Only an exact future Owner statement restores authority; neither a quota reset nor integration of the workflow implementation does so.
- The next workflow Change Brief must stop rather than add another path, gate, dependency, routing authority, journey-selection rule, required check, or hosted test run.

## Safe Resume Prompt

```text
Commander: continue from current origin/dev after consuming Issue #111 and ADR 0049. Verify exact HEAD/target authority, confirm E2E Functional Gate 342459594 remains disabled_manually with no run in progress, and confirm PR #110 remains Draft. Create one separate CI-governance Issue and Change Brief for the existing .github/workflows/e2e.yml, then dispatch one writable Worker under kick-in/27. Implement only Draft suppression, integration-ready pull-request execution, PR-scoped cancel-in-progress, the retained complete-diff Markdown router, and the unchanged J-01/J-02/J-08 Windows/macOS matrix. Validate locally; advisory read-only review remains optional. Integrate while disabled, but do not run or re-enable Actions until the Owner explicitly restores usage.
```
