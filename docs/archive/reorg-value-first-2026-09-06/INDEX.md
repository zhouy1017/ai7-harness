# Archive node: value-first reorganization — 2026-09-06

| Field | Value |
| --- | --- |
| Lifecycle node | Owner decision of 2026-09-06 recorded in ADR 0064, ADR 0065, and ADR 0066: the repository-development process was reweighted, documentation ownership was single-sourced, and the delivery order was replaced by `docs/development/development-plan.md`. |
| Archive scope | The two root routers as they stood at `dev@4c50ce31b0f15ff2bfadd2af17fc914c317e0f22` before the reorganization. |
| Original path | `PROGRESS.md`, `HANDOFF.md` |
| Final status | superseded |
| Reason | `HANDOFF.md` was removed as a root router; `PROGRESS.md` was replaced by the value-first status and routing text. The old S-series order, the recording-deferral wording, and the follow-up candidate list are preserved here. |
| Current replacement | Root `PROGRESS.md`; `docs/development/development-plan.md`; ADR 0064. |
| Retrieval condition | A Commander needs the pre-reorganization follow-up candidate list, the exact wording of the 2026-09-06 recording decisions, or the old resume prompt. |

The Issue #28 PRD body was moved to `docs/prd/ai7-v2-prd.md` with its stale implementation paragraphs removed; the Issue keeps a pointer body. The README Journey narratives moved to `docs/development/e2e-journeys.md`. Neither move needs a snapshot here because Git history and the destination files carry the text.
