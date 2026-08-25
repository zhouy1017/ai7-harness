# Current progress

Status: **Issue #14 repository-guidance reconciliation complete on `docs/14-incremental-agent-guidance`; awaiting advisory review and Commander PR integration; documentation only**

## What's done

- Preserved the current aggregate chain before this task: Source Checkout Buildability through PR #10, Issue #8 through PR #11 at `226ccfd1e34665c42af178e54d47f6d0c918138c`, and response presentation through PR #13 at `4ee5d4bb0967f82c7f8abb01aa2541616052710b`.
- Recovered governance source snapshot `93c9e406c33cc44019555b92e51e6d10094c938e` onto Issue #14 rather than treating the internal snapshot as an integration parent or authority owner.
- Added the task-oriented agent router, design-authority, Change Brief, incremental-development, document-lifecycle, and detailed-project-constraint guidance under `docs/agents/`.
- Moved consumed `handoff20260817/` material into the indexed `docs/archive/agent-guidance-baseline-2026-08-25/` historical package; archive content remains evidence, not current authority.
- Replaced root `AGENTS.md` and `HANDOFF.md` with thin current routers while preserving the later Book/import, Task Input, budget/Resume, Source/Series, Delivery Package/export, maintenance, and fresh-checkout buildability constraints in `docs/agents/project-constraints.md`.
- Replaced the obsolete phase/gate migration plan with a compact vertical-outcome router that keeps the full Source Checkout Buildability contract inside the existing E2E Functional Gate boundary.
- Passed lightweight maintenance checks: 190 active Markdown files with zero broken local links, eight archived payloads byte-identical to `design-doc@2932f61`, 851 requirements, D-001–D-084, J-01–J-16, 40 root ADRs, 14 UI ADRs, no conflict markers, exact `CLAUDE.md`, clean diff whitespace, and unchanged `origin/main@c8cbe26`.
- Consumed a bounded same-provider advisory review with reduced independence. Its status finding was corrected by making archive activation conditional on the actual Commander PR integration. Its governance findings were resolved from the recovery snapshot's explicit owner decision: root `AGENTS.md` now records the 2026-08-25 supersession of the monolithic layout, and checkpoint cadence is reconciled to update the current `PROGRESS.md` after every sub-task while archiving at most one outgoing snapshot at a lifecycle node. Bounded re-review passed with no remaining actionable Standards or Spec finding.

## What's next

- Re-run the lightweight checks, commit and push the advisory correction, open and merge Issue #14's Commander-owned pull request into `design-doc`, then create the separate freeze-baseline Issue/branch/PR.

## Key decisions

- Root `AGENTS.md`, `HANDOFF.md`, and `PROGRESS.md` are current routing surfaces. Stable authority remains in ADRs, Policy Documents, context definitions, and detailed runbooks; consumed chronology is archived or Git-only.
- `AGENTS.md` remains the canonical shared instruction entry point after the owner-approved thin-router supersession; routed shared detail is edited in its exact owning runbook, while `CLAUDE.md` remains import-only.
- The governance compaction changes repository-development guidance only. It does not promote `design-doc` to canonical `main`, accept every candidate conclusion, authorize implementation, or add a validation gate.
- Source Checkout Buildability remains part of the existing provider-free E2E Functional Gate setup and is not a separate build/package/reproducibility programme.
- The final freeze will claim aggregate completeness only when every discovered branch, PR, recovery snapshot, worktree delta, and stash has an explicit disposition.

## Unresolved matters or blockers

- No product-design decision is reopened by Issue #14. Retrieval strategy and concrete macOS mechanics remain deferred design/implementation matters, not blockers for this documentation integration.
- No blocking product or repository question remains. The completed same-provider advisory review has reduced independence and remains evidence, not a gate.

## Resume Prompt

Resume on `docs/14-incremental-agent-guidance`: validate and commit the review correction, integrate Issue #14 into `design-doc`, and then create the separate freeze-baseline record and disposition manifest.
