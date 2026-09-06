# Current checkpoint

This is the single Commander-owned status and routing file under [ADR 0064](docs/adr/0064-reweight-repository-development-toward-value-first-delivery.md). The delivery order lives in the [development plan](docs/development/development-plan.md); what each Journey proves lives in [E2E journeys](docs/development/e2e-journeys.md). The Commander updates this file inside the integrating pull request or through its own documentation pull request.

## What exists

- Seven executable Journeys on `dev`: J-01 import, J-02 long-manuscript editing, J-08 recovery, J-12 workbench and Model Service setup, J-15 native artifact lifecycle, J-03 provider-denied Task authorization with the foreground execution boundary, and J-04 covered baseline analysis with its three update modes and Revision History (#92 / PR #266, #93 / PR #269). J-04 runs through the real execution path (Task Intent, `Task Input / 任务输入` checkpoint, Provider Preflight, Plan Envelope, Run Authorization, single-slot scheduler, immutable Execution Binding, `PrimaryAgentHarness`, Egress Gate, bound adapter) on hand-written synthetic fixtures; the Egress Gate refuses every remote route under `development-ci` / Provider Processing v1, and no live model call has ever been made.
- The Local Verification Ladder is complete: `doctor`, `bootstrap`, `check`, `test`, `test:service`, `build`, `e2e` / `e2e:all`, `e2e:debug`, `e2e:repeat`.
- Cross-unit reduction is deterministic string matching only; factual review, proposals, Apply, and export do not exist yet.

## In flight

- **#48 (S13, Phase 0)**: Worker A1 (`cli-session`, dispatch `1187b4de-…`) ended with an API session limit at 12:57 on 2026-09-06 after 106 turns. Its worktree `.claude/worktrees/issue-48-a1` on `feat/48-plan-revision-and-adaptation` holds uncommitted partial work: `src/service/analysis/plan-boundary.ts` (new), `tests/fixtures/model/sample1-baseline-transient-retry.json` (new), and edits to `task-authorization.ts`, `protocol.ts`, the three provider modules, and the J-03/J-04/J-12/J-15 runners. No commit, no pull request, no Return Receipt. The next Commander resumes that session with a continuation message or supersedes A1 and launches A2 from the same worktree state, then posts the schema-v5 Return Receipt.

## Next

Phase 1 of the plan, in order: S40 #272 (developer-live scope) → S41 #273 (fixture generation) → S42 #274 (model-driven cross-unit reduction) → S18 #53 (factual review with research budget) → S19 #54 (research snapshot and Correction Proposal) → S43 #275 (assurance sampling) → S44 #276 (Run Report). Each slice receives a one-page Brief on the then-current `dev` head before `ready-for-agent`. Product integration stays serial.

## Decisions of 2026-09-06

- [ADR 0064](docs/adr/0064-reweight-repository-development-toward-value-first-delivery.md): value-first order; `PROGRESS.md` is the only root router; schema-v5 receipts; Reviewer optional; T3-only body hash; base-drift continuation; one-page Brief; frozen design references; implementation status only here and in E2E journeys; PRD moved to `docs/prd/ai7-v2-prd.md`.
- [ADR 0065](docs/adr/0065-admit-a-developer-live-provider-processing-scope.md): the human-attended `developer-live` scope (Provider Processing v4) for prompt tuning on developer hosts, with `deepseek-v4-flash` as the development-interval Main Editorial binding, one Session per unit, a required ceiling of 500,000 tokens by default, admitted Public SampleBooks only, and no fixture or capture by itself.
- [ADR 0066](docs/adr/0066-add-model-driven-cross-unit-reduction-and-assurance-sampling.md): the Baseline Cross-Unit Reduction Contract, assurance sampling into the assurance axis, the Run Report, the factual finding record shape, and the per-Run research budget.
- The human-attended `sample1` recording under ADR 0044 is scheduled after the Phase 1 exit criterion; its kept decisions (policy v2 successor with transmissions equal to the unit count, per-unit Sessions, the ceiling) are in ADR 0065 and the plan. No recording Issue is open.
- Dispatch bindings are unchanged: Claude Code T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`; Codex T1 `gpt-5.6-luna @ medium`, T2 `gpt-5.6-terra @ high`, T3 `gpt-5.6-sol @ xhigh`. A Claude Code Commander without `SendMessage` uses `cli-session` for every attempt.

## Unresolved

- A credential value was pasted into a Commander chat on 2026-09-06; the Owner was asked to revoke it. Any live run under ADR 0065 uses a fresh key entered only through the product's Protected Secret Store.
- The active-set-v3 ordinary-production pin does not match the current v3 policy bytes; S40 must correct it when it adds active-set v4.
- Whether the `.agents/skills` vendoring on `temp/freeze-20260904-112022` enters `dev` remains an Owner decision; the self-hosted Gate is shelved.
- One unreproduced `LOCAL_COMPLETION/J-01/fail` of unknown cause was recorded on #249; a transient `EBUSY` on a freshly extracted `electron.exe` cleared on rerun.
- The pre-reorganization follow-up candidate list is preserved in [the archive node](docs/archive/reorg-value-first-2026-09-06/INDEX.md).

## Safe Resume Prompt

```text
Commander: identify your harness (Codex or Claude Code), then read PROGRESS.md, docs/development/development-plan.md, and the Dispatch Register. First settle #48 (S13): resume Worker A1's cli-session with a continuation message or supersede it and launch A2 from the same worktree state, finish the ladder, post the schema-v5 Return Receipt, open the pull request, run the Gate, squash-merge, and update PROGRESS.md in that pull request. Then take Phase 1 in the plan's order (S40 #272 first): write the one-page Change Brief on the current dev head, dispatch one fresh Task Session with the class binding, Reviewer optional, integrate serially after the complete Local Verification Ladder and one paired Gate. Under ADR 0058 do not query or consider Actions usage. Do not open a recording Issue, enroll a credential outside the product's Protected Secret Store, transmit anything except an admitted Public SampleBook under the developer-live scope once S40 exists, or touch export, publication, release, distribution, or main.
```
