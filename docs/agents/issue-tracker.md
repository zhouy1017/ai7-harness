# Issue tracker: GitHub

GitHub Issues own bounded work outcomes. The PRD lives at [AI7 V2 PRD](../prd/ai7-v2-prd.md); the [development plan](../development/development-plan.md) owns delivery order. [Orca dispatch](orca-dispatch.md) owns assignments, role permissions, handoff and integration.

## Work records

- Use authenticated Issue/PR tooling; prefer `--body-file` for multiline shell submissions.
- Reuse the slice's existing Issue. A new bounded follow-up links its predecessor; completed implementation is not reopened merely because an old checkpoint omitted it.
- Each work-ready body carries the [Change Brief](change-brief.md), dependencies, relevant design links and its current plan slot. Remove obsolete conflicting instructions from the active body; GitHub history retains them.
- `ready-for-agent` means the brief is complete and ready for manual per-Issue dispatch by the Owner or wave dispatch under Orca dispatch. `needs-info` identifies missing facts; `ready-for-human` identifies an unresolved Owner decision. T0 ambiguity is resolved before implementation dispatch.
- Record actual branch/workspace, PR and exact validation/merge evidence in the existing GitHub records. Historical receipts remain evidence; new work follows the current rulebook (repair only on E2E or CI test failure, no mandatory cross-provider check).
- The assigned coding agent updates implementation and test evidence under Orca dispatch. A slice merged into a wave is not yet implemented on dev. Issue closure and PROGRESS updates follow final integration.

## Pull requests as a triage surface

A PR represents a concrete change, not an incoming feature request. GitHub shares Issue and PR numbering; resolve an ambiguous `#N` before acting. Each PR links its Issue and states its target and integration status.
