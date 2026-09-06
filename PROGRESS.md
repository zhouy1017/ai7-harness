# Current checkpoint

This is the single Commander-owned status and routing file under [ADR 0064](docs/adr/0064-reweight-repository-development-toward-value-first-delivery.md). The delivery order lives in the [development plan](docs/development/development-plan.md); what each Journey proves lives in [E2E journeys](docs/development/e2e-journeys.md). The Commander updates this file inside the integrating pull request or through its own documentation pull request.

## What exists

- Seven executable Journeys on `dev`: J-01 import, J-02 long-manuscript editing, J-08 recovery, J-12 workbench and Model Service setup, J-15 native artifact lifecycle, J-03 provider-denied Task authorization with the foreground execution boundary, and J-04 covered baseline analysis with its three update modes and Revision History (#92 / PR #266, #93 / PR #269). J-04 runs through the real execution path (Task Intent, `Task Input / 任务输入` checkpoint, Provider Preflight, Plan Envelope, Run Authorization, single-slot scheduler, immutable Execution Binding, `PrimaryAgentHarness`, Egress Gate, bound adapter) on hand-written synthetic fixtures; the Egress Gate refuses every remote route under `development-ci` / Provider Processing v1, and no live model call has ever been made.
- The Local Verification Ladder is complete: `doctor`, `bootstrap`, `check`, `test`, `test:service`, `build`, `e2e` / `e2e:all`, `e2e:debug`, `e2e:repeat`.
- S13 (#48 / PR #280, `dev@f417e50`): the Plan Envelope is an authority-bearing boundary on the executing analysis Task. Plans are versioned (analysis ledger 16 → 17), a material change among fifteen fields between Plan Preview and Run Authorization suspends authorization with `查看计划修订` and its field-level diff, `重新确认计划` yields the next version, a stale version is refused with `plan-revision-required`, the Plan Boundary Split is part of the canonical envelope, and the one declared adaptation class `safe-retry` repeats a unit's unchanged request at most once on `RATE_LIMIT` / `TRANSPORT_FAILED` (any status) or `PROVIDER_ERROR` (5xx) with a durable Plan Adaptation written before dispatch. J-04 gained ten stages; protocol is 19.
- Cross-unit reduction is deterministic string matching only; factual review, proposals, Apply, and export do not exist yet.

## In flight

- Nothing. Phase 0 is complete.

## Next

Phase 1 of the plan, in order: S40 #272 (developer-live scope) → S41 #273 (fixture generation) → S42 #274 (model-driven cross-unit reduction) → S18 #53 (factual review with research budget) → S19 #54 (research snapshot and Correction Proposal) → S43 #275 (assurance sampling) → S44 #276 (Run Report). Each slice receives a one-page Brief on the then-current `dev` head before `ready-for-agent`. Product integration stays serial.

## Decisions of 2026-09-06

- [ADR 0064](docs/adr/0064-reweight-repository-development-toward-value-first-delivery.md): value-first order; `PROGRESS.md` is the only root router; schema-v5 receipts; Reviewer optional; T3-only body hash; base-drift continuation; one-page Brief; frozen design references; implementation status only here and in E2E journeys; PRD moved to `docs/prd/ai7-v2-prd.md`.
- [ADR 0065](docs/adr/0065-admit-a-developer-live-provider-processing-scope.md): the human-attended `developer-live` scope (Provider Processing v4) for prompt tuning on developer hosts, with `deepseek-v4-flash` as the development-interval Main Editorial binding, one Session per unit, a required ceiling of 500,000 tokens by default, admitted Public SampleBooks only, and no fixture or capture by itself.
- [ADR 0066](docs/adr/0066-add-model-driven-cross-unit-reduction-and-assurance-sampling.md): the Baseline Cross-Unit Reduction Contract, assurance sampling into the assurance axis, the Run Report, the factual finding record shape, and the per-Run research budget.
- [ADR 0067](docs/adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md): the Owner's OpenCode Go subscription key (untracked `opencodego.key.txt` at the main checkout root, `*.key.txt` ignored) is authorized for development Provider testing while its quota lasts; the `developer-live` scope binds `deepseek-v4-flash` through the `opencode-go` route; every live call is a named test item recorded in the Provider Test Ledger and replayed from the Provider Result Cache, so the same or a similar test runs live at most once; limit responses end the Run as a Provider Account Limit.
- The human-attended `sample1` recording under ADR 0044 is scheduled after the Phase 1 exit criterion; its kept decisions (policy v2 successor with transmissions equal to the unit count, per-unit Sessions, the ceiling) are in ADR 0065 and the plan. No recording Issue is open.
- Dispatch bindings are unchanged: Claude Code T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`; Codex T1 `gpt-5.6-luna @ medium`, T2 `gpt-5.6-terra @ high`, T3 `gpt-5.6-sol @ xhigh`. A Claude Code Commander without `SendMessage` uses `cli-session` for every attempt.

## Unresolved

- A credential value was pasted into a Commander chat on 2026-09-06; the Owner was asked to revoke it. Any live run under ADR 0065 uses a fresh key entered only through the product's Protected Secret Store.
- The OpenCode Go key file stays unused until S40 lands the enrollment helper, the route, the ledger, and the cache; no agent reads or prints it. The DeepSeek key pasted earlier remains to be revoked by the Owner.
- The active-set-v3 ordinary-production pin does not match the current v3 policy bytes; S40 must correct it when it adds active-set v4.
- Whether the `.agents/skills` vendoring on `temp/freeze-20260904-112022` enters `dev` remains an Owner decision; the self-hosted Gate is shelved.
- One unreproduced `LOCAL_COMPLETION/J-01/fail` of unknown cause was recorded on #249; a transient `EBUSY` on a freshly extracted `electron.exe` cleared on rerun.
- Follow-up Issue #281 (S13-f1, Phase 3) carries the advisory review's two P2 findings on #48. Other follow-up candidates from #48 (no Issue yet): the adaptation record carries the first attempt's payload digest only while the retry's digest sits on its span row; durable-state drift fields (binding and pin changes) are asserted per field by unit tests only; the Task Intent row keeps the first-requested range while later plan versions carry theirs; the PowerShell tool returned exit 66 for every command in one interrupted cli-session and recovered after a reset.
- The pre-reorganization follow-up candidate list is preserved in [the archive node](docs/archive/reorg-value-first-2026-09-06/INDEX.md).

## Safe Resume Prompt

```text
Commander: identify your harness (Codex or Claude Code), then read PROGRESS.md, docs/development/development-plan.md, and the Dispatch Register. Treat #48 (S13) as integrated. Take Phase 1 in the plan's order (S40 #272 first): write the one-page Change Brief on the current dev head, dispatch one fresh Task Session with the class binding, Reviewer optional, integrate serially after the complete Local Verification Ladder and one paired Gate. Under ADR 0058 do not query or consider Actions usage. Never read, print, or copy the key file at the main checkout root; live Provider tests run only through the S40 ledger and cache tooling, one test item at most once (ADR 0067). Do not open a recording Issue, enroll a credential outside the product's Protected Secret Store, transmit anything except an admitted Public SampleBook under the developer-live scope once S40 exists, or touch export, publication, release, distribution, or main.
```
