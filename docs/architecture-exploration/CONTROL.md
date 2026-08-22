# Architecture Exploration Control Board

Status: **active**
Commander issue: [#3 — Freeze v1 design and prepare v2 architecture exploration](https://github.com/zhouy1017/ai7-harness/issues/3)
V2 architecture issue: [#4 — Design the AI7 V2 architecture candidate](https://github.com/zhouy1017/ai7-harness/issues/4)
Last updated: **2026-08-23**

This file records repository-development coordination only. It is not an AI7 product workflow or a replacement for the canonical architecture.

## Freeze point

- Canonical baseline: `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`
- Commander branch: `docs/3-design-freeze-v2-exploration`
- Main remains canonical. Neither v1 Worker branch is approved for merge.
- No product implementation, implementation issue decomposition, pull request, merge, or release is authorized by this control run.

## Task registry

| Task | App task ID | Repository role | Branch / worktree | State | Write boundary | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| `Commander — AI7 Design Freeze` | `01a02273-a4f7-7fa1-8d66-7130f7566cd4` | Commander | `docs/3-design-freeze-v2-exploration` / `worktrees/6bbc` | `active` | Control and curation files only | Freeze audit, curated packet, integration recommendation |
| `Worker — Freeze V1 UI UX` | `01a02240-c432-7600-8fdf-008858cae447` | Worker | `docs/2-ai7-ui-ux@587d645` / `worktrees/062a` | `frozen` | Its branch only | Reviewed local V1 UI/UX reference; candidate/evidence-only assets |
| `Worker — Freeze V1 Platform and Phase 0` | `01a005a7-019f-7203-ba38-2a367a667db8` | Worker | `docs/1-windows-macos-phase0@9606891` / saved-project checkout | `frozen` | Its branch only | Reviewed local V1 platform/Q16/Phase-0 reference; Phase 0 remains NOT PASSED |
| `Architecture Reviewer — Prepare V2 Exploration` | `01a02278-cdc5-7c81-a08d-490b8b76bc26` | Reviewer | read-only `main@c8cbe26` / `worktrees/1d24` | `exploring` | No repository writes | [Round 1](./ROUND-1-REVIEW.md) and [candidate delta](./CANDIDATE-DELTA-REVIEW.md) complete; A1–A3 prepared |
| `AI7 V2 架构设计（Issue #4）` | A1/A2 sessions recorded below; T1 Worker `/root/a2_offline_mapping_t1` | A1 completed; A2 Worker / T1 evidence mapping correction | `docs/4-v2-architecture-candidate@f1d212c5` / `worktrees/1649` | `awaiting fresh exact-head Spec and Standards re-review` | All candidate Workers stopped; exact head read-only | Review `b507617...f1d212c5`; preserve every row/score/source/DSH/A3 boundary |
| `AI7 V2 反方审查（只读）` | `01a022df-0d69-7173-ab31-679038c1f446` | Reviewer / T3 charter | read-only `c383afd` / `worktrees/1be4` | `preparing` | No repository writes | Challenge charter complete and task stopped; a later exact-head verdict requires a T3-par Reviewer after a coherent V2 candidate exists |

The function labels “Architecture Reviewer” and “V2 Hostile Architecture Reviewer” do not create a fourth repository role. Both are independent Reviewer assignments under ADR 0015. The V2 architecture designer remains a Worker even when exercising Chief Architect responsibilities.

## Commander directives in force

1. Both v1 Workers stop after already-materialized work is cleaned, validated, independently reviewed, summarized, and locally committed.
2. Neither Worker may add a new architecture assumption, consume the other candidate branch as truth, push, open a pull request, merge, publish, or dispatch further work.
3. The Architecture Reviewer reads normalized conclusions from canonical `main`, not either legacy task history or active worktree.
4. Worker handoffs enter the review packet only after Commander audit.
5. A future v2 candidate receives an independent T3-par-or-higher hostile verdict before an owner decision; T3 is sufficient only for the pre-candidate charter.
6. The V2 hostile Reviewer may prepare its challenge charter now, but it receives no design-task transcript, worktree, branch diff, or candidate material until the Commander supplies an exact coherent-candidate review brief.
7. The 2026-08-21 owner direction makes Codex the preferred V2 harness candidate and leaves AI7 authoritative for product, domain, UI, policy, Effects, and business ledgers. If A2 proves Codex capability closure, Codex is the sole production Primary Agent Harness and DeepSeek becomes a non-runtime Development Reference Framework. Verified gaps prefer costed Codex secondary development; DeepSeek may re-enter runtime comparison only after both an exact Codex gap and a mature DeepSeek substitute are proven, followed by a new owner choice. See [Clarification 0001](./clarifications/0001-primary-agent-harness-role.md) and [Clarification 0002](./clarifications/0002-codex-gap-closure-and-dsh-reentry.md). This does not claim closure or authorize implementation.
8. Load-bearing ambiguity is never resolved by Worker inference. The Worker first exhausts authorized factual evidence and probes; only a residual owner trade-off enters a structured decision queue. The Commander uses `grill-with-docs` one question at a time and creates an exact clarification record; the Worker consumes its exact Git object and writes resulting candidate terms and qualifying decisions on the Worker branch, never from a transcript.
9. From 2026-08-22, every suitable parallel, bounded Worker brief uses the matching Layer B Claude Code binding for that Worker's T1/T2/T3 class first until its usable quota is observed unavailable or exhausted; only then does the Commander use the existing same-class fallback. Every dispatch records requested and actual binding plus the exact downgrade reason. Commander decisions and T3-par synthesis, final integration, external actions, and independent Review remain in their existing authority boundaries. This is repository-development routing only and has no bearing on V2 product Model Roles or harness selection.

## Provider dispatch log

- Effective directive: **2026-08-22 owner instruction**.
- Preferred eligible-Worker binding: **Claude Code, same task class**.
- Current observed availability: Claude Code `2.1.228`; the required post-reset Opus attempt, session `1540bd4c-0b54-4454-8a5f-6b2dec2b1cc8`, returned exit 1 / API HTTP 429 `You've hit your session limit · resets 2am (Asia/Shanghai)` before inference and reported `$0`.
- Current fallback: **same-class fallback completed for this T3 correction**. The actual Claude attempt established exhaustion; GPT-5.6 Sol / `xhigh` Worker `/root/a2_contract_rework_t3` completed the unchanged Worker/T3 brief at `059dd658`. This did not downgrade task class or alter authority.
- Required future entry: task/branch, role and class, requested binding, actual provider/model/effort, availability or quota outcome, exact fallback reason, and reviewer independence.

| Date | Task / branch | Role / class | Requested binding | Actual binding | Availability / quota | Fallback / reason | Review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-22 | A1 five-file mechanical commit recovery / `docs/4-v2-architecture-candidate` | Worker / T1 mechanical recovery; candidate review floor remains T3-par | Claude Code / `claude-haiku-4-5-20251001` / low | Anthropic Claude Haiku 4.5 / `claude-haiku-4-5-20251001` / low; session `7bfa7b54-9b68-4d30-9d63-a9c3870647de` | Available; completed successfully | None — requested binding satisfied | Commander state verification complete; exact-head architecture review pending |
| 2026-08-22 | A1 exact-review fixes / `docs/4-v2-architecture-candidate` | Worker / T3 bounded architecture-document correction; candidate review floor remains T3-par | Claude Code / `claude-opus-5` / high; session `e91a7cae-2a8b-49fe-a863-c788af4dd90c` | Anthropic Claude Opus 5 / `claude-opus-5` / high; the CLI also reported a small internal Haiku 4.5 auxiliary call | Available; completed successfully; CLI reported `$7.298785` total | None — requested primary binding satisfied; auxiliary metering was not a provider/model fallback | Commander mechanical verification passed at `92d1089`; renewed Standards and Spec review in progress |
| 2026-08-22 | A1 two-finding wording/checkpoint correction / `docs/4-v2-architecture-candidate` | Worker / T1 exact, mechanically verifiable correction; candidate review floor remains T3-par | Claude Code / `claude-haiku-4-5-20251001` / low; session `f8248fbb-ebce-4b8c-9a2e-50602584bd41` | Anthropic Claude Haiku 4.5 / `claude-haiku-4-5-20251001` / low | Available; both passes completed; CLI reported `$0.7211562` total | None — requested binding satisfied | Exact review findings and Commander checkpoint defects closed at `b507617`; final Standards and Spec PASS with zero findings |
| 2026-08-22 | A2 Codex-first capability closure / `docs/4-v2-architecture-candidate` | Worker / T3; returned candidate review floor T3-par | Claude Code / `claude-opus-5` / high; session `92ea5b6f-d0b3-45b8-90a3-804f9a4702e2` | Anthropic Claude Opus 5 / `claude-opus-5` / high; CLI also reported internal Haiku 4.5 usage | Available; completed successfully; CLI reported `$8.4924905` total | None — requested primary binding satisfied; auxiliary metering was not fallback | `Closure not proven` authored at `756f2f9`; 40 rows and no gaps; later evidence sync finalized the same A2 commit at `4cd8250`; T3-par review pending |
| 2026-08-22 | A2 Commander-probe evidence sync / `docs/4-v2-architecture-candidate` | Worker / T1 exact, mechanically verifiable correction; A2 review floor remains T3-par | Claude Code / `claude-haiku-4-5-20251001` / low; session `fb73bf3a-2d6b-40fb-8d83-1aaad14beccc` | First pass: Anthropic Claude Haiku 4.5 / low; completion fallback: GPT-5.6 Luna / medium, Worker `/root/a2_probe_sync_fallback` | Haiku first pass completed and reported `$0.3161163`; resume returned HTTP 429 session limit and reported `$0.1652621` incremental cost | Same-class fallback after observed quota exhaustion: `You've hit your session limit · resets 2am (Asia/Shanghai)` | Sync complete at `4cd8250`; Commander verified exact parent/two-commit/seven-path/clean-tree boundary, 40 rows, 21 Unknowns, no gap, unchanged verdict; T3-par review pending |
| 2026-08-22 | A2 exact-review architecture correction / `docs/4-v2-architecture-candidate` | Worker / T3; candidate review floor remains T3-par | Claude Code / `claude-opus-5` / high | GPT-5.6 Sol / `xhigh`; Worker `/root/a2_review_rework_t3` | Known exhausted quota window; no repeat Claude attempt before reset evidence; completed successfully | Same-class fallback required by the observed HTTP 429 session-limit response; no task-class downgrade | Corrected head `dcbd437`; Commander verified exact parent/two-commit/seven-path/clean-tree boundary, 44 rows, 26 matched Unknowns, two Experimentals, no gap, lowercase subject; fresh review pending |
| 2026-08-23 | A2 execution-contract review correction / `docs/4-v2-architecture-candidate` | Worker / T3; candidate review floor remains T3-par | Claude Code / `claude-opus-5` / high; session `1540bd4c-0b54-4454-8a5f-6b2dec2b1cc8` | GPT-5.6 Sol / `xhigh`; Worker `/root/a2_contract_rework_t3` | Claude returned exit 1 / API HTTP 429 before inference; CLI cost `$0`; no Claude write. Sol fallback completed successfully. | Same-class fallback after exact observed exhaustion: `You've hit your session limit · resets 2am (Asia/Shanghai)` | Corrected head `059dd658`; Commander verified exact parent/history/seven paths/clean state, unchanged matrix/source/probe sets, contract trace, and links; fresh review pending |
| 2026-08-23 | A2 offline-authority mapping correction / `docs/4-v2-architecture-candidate` | Worker / T1 exact correction; candidate review floor remains T3-par | Claude Code / `claude-haiku-4-5-20251001` / low | GPT-5.6 Luna / medium; Worker `/root/a2_offline_mapping_t1` | Known current Claude quota exhaustion from post-reset session `1540bd4c...`; no new reset/availability evidence, so no repeated attempt. Luna completed successfully. | Same-class fallback under the existing window; exact prior API HTTP 429, before inference, `$0` | Corrected head `f1d212c5`; Commander verified exact three-path delta, full range/history/clean state, unchanged counts/sets, and removed false mappings; fresh review pending |

## V2 dispatch boundary

The exact dispatch is recorded in [V2-DISPATCH.md](./V2-DISPATCH.md). The design Worker starts with A1 only. A2 remains blocked on stable A1 invariants but not on the owner's exact parity/support choice; its scope is now Codex-first harness selection with DeepSeek comparison. That choice gates canonical product promises and the coherent candidate. A3 remains blocked on A1 and the revised A2. The hostile Reviewer is active only to establish an independent rubric and must then stop until the Commander supplies a coherent candidate.

## Candidate fork inputs

These inputs are material but are not canonical on this branch:

- The owner instructed the platform candidate task to revise the Windows-only target into one Windows+macOS product. This is an owner-stated candidate input, not a canonical `main` decision until integration.
- The UI/UX Worker began from the current Windows-only baseline and produced a candidate requirements/prototype line.
- The platform candidate affects packaging, local storage, credentials, IPC, sandbox claims, signing, release evidence, and UI platform conventions; it is not a runner-label edit.
- The owner added Codex as the preferred V2 harness and integration template after OpenAI published its open-harness platform guidance. Codex Desktop-like interaction remains a UX reference while AI7 owns the interface and publishing workflow; DeepSeek Harness remains comparative rather than an automatic co-runtime.

The Commander must preserve both lines as candidate/evidence-only unless the owner later accepts a specific architecture change and the normal integration path promotes exact records.

## Expected freeze evidence

### UI/UX line

- **Frozen at consolidated local head `587d6455f6a578d3df8a39f534ec7a057c07a18c`; exact-head T3 Standards and Spec reviews both passed with zero findings.**
- Worktree is clean; QA scratch is outside the branch; no push, PR, merge, Figma continuation, publication, or further design expansion occurred.
- `docs/ui-ux/V1-FREEZE-HANDOFF.md` records 79 requirements, fourteen journeys, reusable state/authority semantics, Windows-specific assumptions, migration cost, unknown cross-branch conflicts, and safe-resume boundaries.
- Earlier exact-head attempts exposed successively narrower candidate-authority, Policy visibility, preferred-term, state-set, external-Figma, commit-metadata, and freeze-history findings. `587d645` corrects only those items and consolidates the unpublished Issue #2 line into one commit above `c8cbe26`; all obsolete tips are non-ancestors and recoverable through reflog.
- Reviewers `/root/consolidated_head_standards_t3` and `/root/consolidated_head_spec_t3`, both Reviewer/T3/OpenAI/`gpt-5.6-sol`/`xhigh`, reported PASS, zero findings, no post-review changes, and `same-provider review — independence reduced`. The Commander independently confirmed the exact head, merge base, one-commit history, clean worktree, clean diff check, and one-line `CLAUDE.md`.
- Worker validation reports 79/79 traceability, eleven Markdown files with valid local links, JavaScript/PowerShell parsing, clean diff checks, and browser console 0 errors / 0 warnings.

### Platform / Phase-0 line

- **Frozen at local commit `960689172bcf54eb3f27b57045a4ce4e9f20695d`; exact-head T3 Standards and Spec reviews both passed with zero findings.**
- Worktree is clean and no push, PR, merge, release, implementation, dependency, CI, or issue decomposition occurred.
- `kick-in/37-v1-platform-freeze-handoff.md` records exact accepted Q16/platform inputs, affected decisions, reusable assets, incompatibilities, migration cost, and open risks.
- The review explicitly bound to `23df3c8` failed on the Agent Data Root definition, a design-note count, and nonstandard compound ADR statuses. Corrective head `16a6ff1` fixed those items; its review found one stale `PROGRESS.md` next action. Final head `9606891` fixed only that checkpoint and passed both fresh reviewers over `c8cbe26...9606891`.
- Reviewers Aquinas (Standards) and Wegener (Spec), both Reviewer/T3/Codex/`gpt-5.6-sol`/`xhigh`, reported zero findings, no post-review changes, and `same-provider review — independence reduced`. The Commander independently confirmed the exact head, merge base, clean worktree, clean diff check, and one-line `CLAUDE.md`.
- Worker validation reports 46 Markdown files, 27 ADRs, 38 design notes, 151/151 glossary ownership, zero broken links, and no forbidden artifacts.

### Architecture review

- **First round received from a clean read-only `main@c8cbe26` worktree with the contamination boundary intact.**
- [Round 1 review](./ROUND-1-REVIEW.md) records the v1 assumptions, seven root tensions, twelve proposed principles, inheritance dispositions, a fourteen-stage exploration order, and freeze exit criteria.
- [Candidate delta review](./CANDIDATE-DELTA-REVIEW.md) confirms the root tensions/principles, refines asset disposition, and recommends A1 product consistency, A2 exact Harness composition, then A3 truthful isolation. Its DeepSeek-only A2 scope is superseded by the later [Codex-first owner directive](./CODEX-HARNESS-DIRECTIVE.md), while its dependency order remains.

## Next control events

1. Keep `c383afd2fdb5f08342cde277b7babced6c1207fc` as the immutable control/packet authority and both frozen legacy branches local and noncanonical.
2. Keep all four stopped A1 Worker assignments read-only at clean candidate head `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`; there is no active writer.
3. Preserve final A1 head `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`: independent Standards and Spec both passed with zero findings, and the Commander confirms its stable invariant list. Present DQ-A1-01 one question at a time without treating any choice as already answered.
4. Keep exact corrected A2 head `f1d212c5ebc5287dbc2b97a716de14b8195e2c3c` and every A1/A2 Worker read-only. Repeat exact-head T3-par Spec review and Standards non-regression review over `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5...f1d212c5ebc5287dbc2b97a716de14b8195e2c3c`; A3 remains blocked.
5. Keep the hostile charter task stopped. Supply a final hostile-verdict brief only after the Commander declares the full V2 candidate coherent, and run that verdict at T3-par or higher.
6. Do not begin implementation planning or issue decomposition without separate owner authorization.

The old lines do not need to finish every originally planned document before architecture exploration can advance.
