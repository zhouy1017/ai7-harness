# Current checkpoint

## What's done

- [Issue #119](https://github.com/zhouy1017/ai7-harness/issues/119) is assigned to branch `docs/119-waive-hosted-gate` from exact `dev@c87137b32baab4dcb08ef38ab714be3261cfdfda` for one T3 governance outcome.
- New accepted-but-unintegrated [ADR 0050](docs/adr/0050-waive-hosted-e2e-integration-evidence-during-actions-exhaustion.md) records the Owner's temporary waiver of hosted E2E integration evidence during exhausted Actions usage. Narrow projections amend ADRs 0027/0049 plus the CI, incremental-development, Git, and Repository Development Dispatch runbooks.
- The draft authority activates only after integration into `dev` and only while workflow `342459594` is `disabled_manually`, no run is queued or in progress, and no fresh usable allocation after reset has been authoritatively confirmed. Hosted evidence alone is waived; unchanged local completion, authority/privacy/dependency/order, and Commander-only integration rules remain.
- Read-only pre-edit verification found workflow `E2E Functional Gate` (`342459594`) `disabled_manually` with zero queued and zero in-progress runs. No workflow, GitHub, dependency, product, configuration, Provider, or protected-material state was changed.
- Local documentation validation passed: all nine changed paths are authorized; relative Markdown links resolve; ADR 0050 routing and exact disclosure are consistent; no legacy conflicting suspension wording remains; tracked and untracked files have clean whitespace and final newlines; and `.github/workflows/e2e.yml` retains exact base/worktree blob `cc4397ab85d1441175fe2bb1db17fe865582dbe8`.

## What's next

- Return the uncommitted branch to the Commander. Before integration, the Commander re-resolves current `dev`, revalidates the documentation diff, and records the workflow's disabled/no-run state. If reset has been authoritatively confirmed or another activation condition fails, stop rather than integrate this authority as current.
- After integration only, otherwise-ready product pull requests may use the waiver one at a time while every activation condition remains true. Confirmed reset expires it immediately and permits only the separate explicit Commander re-enablement of exact workflow `342459594` before normal ADR 0049 processing resumes.

## Key decisions

- The waiver is not a green Gate, substitute Gate, single-platform Gate, branch-protection check, or relaxation of the local `doctor` → `bootstrap` → `build` → applicable journey sequence and cleared-output final `build` plus journey rerun.
- Immediately before Ready and again before merge, the Commander records workflow `disabled_manually` and no queued/active run. Each waived pull request carries ADR 0050's exact disclosure.
- No workflow is enabled, run, rerun, or dispatched to probe reset. A Ready but unmerged pull request returns to the normal paired-platform lifecycle at expiry; already merged waived changes receive no synthetic or retrospective run.
- No new process, dependency, test surface, workflow path, product behavior, release authority, or `main` authority is introduced.

## Unresolved matters or blockers

- ADR 0050 is not current authority until this branch integrates into `dev`.
- The timing of an authoritative fresh usable Actions allocation after reset remains external and unconfirmed. The workflow must remain disabled and unrun for this documentation integration.
- Scoped archive sweep: none. The Worker identified no consumed or disposable repository artifact; the Commander records the same result at integration unless the lifecycle state changes.

## Safe Resume Prompt

```text
Commander: resume Issue #119 from branch docs/119-waive-hosted-gate. Verify the diff remains limited to ADR 0050, narrow ADR/runbook projections, and current PROGRESS/HANDOFF routing; run the documented local consistency, whitespace, allowed-path, and workflow-unchanged checks. Re-resolve current dev authority and record workflow 342459594 as disabled_manually with no queued or active run before integration. If a fresh usable Actions allocation after reset has been authoritatively confirmed or any activation condition fails, stop. Otherwise push/maintain the Draft documentation PR and integrate only through the authorized disabled-workflow governance path, claiming no green Gate. After integration, apply ADR 0050 only while all exact conditions hold; never probe or automatically re-enable Actions.
```
