# AI7 development plan

Status: **Owner-accepted delivery order under [ADR 0064](../adr/0064-reweight-repository-development-toward-value-first-delivery.md), re-cut on `dev@28cc1dd800cf55b17947cceb64a3bce4d81ccfef` on 2026-09-10 from the backend alignment list of the [editor-facing surface specification](../ui-ux-v2/editor-surfaces.md) §11 ([ADR 0077](../adr/0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md) §7, [ADR 0078](../adr/0078-align-the-remaining-references-the-plan-and-the-tracker-to-the-editor-facing-specification.md)).** This file is the only place the order lives. Status columns were refreshed at `dev@d3c04b3` on 2026-09-17 by the agent-readiness review and since then with each `PROGRESS.md` checkpoint, most recently at `dev@0d5381b3` on 2026-10-10; no order changed. Root [`PROGRESS.md`](../../PROGRESS.md) names the next slice; every slice Issue carries its plan slot. The order changes only through a Commander pull request that edits this file and states the reason; a change that alters product authority also needs an ADR. The order as it stood before the re-cut is archived at [docs/archive/editor-surfaces-standard-2026-09-10](../archive/editor-surfaces-standard-2026-09-10/INDEX.md).

## Why this order

Phase 1 completed the analysis pipeline on real model output service-side: unit results, cross-unit findings, factual assertions with Reference Integrity, an assurance estimate and a Run Report. The Owner then settled every editor-facing screen and asked that the backend be aligned to the confirmed flows. What the editor pays for next is, in order: opening a Book into the manuscript and working with marks; reviewing by category with findings that land on the manuscript as 修改建议 and 批注 and are accepted in one click; bringing a DOCX in with everything retained and sending it out again; 发稿, 交付 and the 图书交付包. Only then do the one shared Task Drawer, run governance, the knowledge base, evaluation and learning follow, because they govern and enrich work that will by then exist. Each row below names the specification's screen and the §11 row it implements. S88 comes first in Phase 2 because every later Journey input must be `sample1` or generated (ADR 0079 §5).

## How an agent executes this plan

1. The Commander reads `PROGRESS.md`, takes the next slice from the phase tables below, and opens its Issue.
2. The Commander writes the one-page Brief on the then-current `dev` head in the form of [`docs/agents/change-brief.md`](../agents/change-brief.md), reusing the slice's Issue, labels the Issue `ready-for-agent`, and dispatches one fresh Task Session under [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md) with the class binding in the table.
3. The Worker runs the Local Verification Ladder at the exact head; the Commander posts the schema-v5 Return Receipt, pushes, marks the pull request Ready, waits for the paired Gate, squash-merges, updates `PROGRESS.md` in the same or its own pull request, and marks the slice `integrated` here.
4. A slice that exposes a design gap stops `needs-commander`; the Commander records the gap in `PROGRESS.md`, writes an ADR if authority changes, and edits this plan.
5. Slices marked `Owner confirmation` or `Owner decision first` are not dispatched until the Owner confirms or decides in writing when they are reached.
6. A Brief for an editor-facing slice cites the specification's screen section and the clause IDs it implements; the prototype linked there is consulted for form, never copied as authority (ADR 0077).

Product integration stays serial. Slices in different phases never run in parallel; two slices in the same phase may run in parallel only when the table shows no dependency between them and they touch different owners.

## Phase 0 — closed

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.1 | S13 | #48 | T3 | J-04 | Plan Revision on material drift and the `safe-retry` in-envelope adaptation on the executing analysis Task | — | integrated (PR #280, `dev@f417e50`) |

## Phase 1 — real analysis loop on `sample1` (service side complete)

Exit criterion: one `developer-live` Run on exact `sample1` produces unit results, model-driven cross-unit findings, sourced factual findings, a sampled assurance estimate, and a Run Report; fixtures generated from that Run replay the same path in J-04; the Owner has read at least one Run Report and its findings. Met service-side on 2026-09-09 for everything but the sourced factual findings, which wait for the research egress (S70); the editor-facing halves moved under the specification into Phase 2.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 | S40 | #272 | T3 | J-04 | `developer-live` scope: Provider Processing v4, active set v4, trusted launch form, per-unit Session, required ceiling, `deepseek-v4-flash` through the `opencode-go` route, the ADR 0067 enrollment helper, Provider Test Ledger and Result Cache, quota classification, Egress Gate `transmit-remote` | S13 | integrated (PR #285, `dev@3c3d820`); first live Run `S40/smoke/1` on 2026-09-07 (#307, closed) |
| 1.1a | S40-f6 | #306 | T3 | J-04 | Diagnose and fix the `contract-invalid (not-json)` failures of the first live Run from the cached responses | S40, #310 | integrated (PR #330); the format constraint verified by one live item, `S40/reanalyze-range/1` |
| 1.1b | S40-f5 | #303 | T2 | J-03, J-04 | Derive every scope, policy-version, transmission-count, ceiling, and binding statement from the bound launch | S40 | integrated (PR #315) |
| 1.2 | S41 | #273 | T2 | J-04 | Fixture generation from the Provider Result Cache with echo checks; content-digest resolution for tests | S40 | integrated (PR #376, `dev@af7d2b18`); the first real generation is the Commander unit #387 |
| 1.3 | S42 | #274 | T3 | J-04 | Baseline Cross-Unit Reduction Contract v1; `reducer`-lineage findings | S40 | S42a integrated (PR #393, `dev@f2d587a5`); S42b (the surface) → S71 |
| 1.4 | S18 | #53 | T3 | J-04 | Factual review: the `factual-review` kind, Factual Review Contract v1, deterministic Reference Integrity, the ADR 0066 finding record, a research capability that refuses under every scope | S40 | S18a integrated (PR #395, `dev@abb7bbb2`); S18b → S69; S18c → S70; #53 closed 2026-09-10 |
| 1.5 | S19 | #54 | T3 | J-04 | `保存为来源材料` research snapshot; exact-revision Correction Proposal | S18 | superseded: retention → S70, the Correction Proposal as 修改建议 → S58 and S59; #54 closed 2026-09-10 |
| 1.6 | S43 | #275 | T3 | J-04 | Assurance Sampling Contract v1 over the Run's own findings | S42, S18 | integrated (PR #397, `dev@7b8f626d`); dispositions render in S69 and S71 |
| 1.7 | S44 | #276 | T3 | J-04 | Durable Run Report inside every Task Outcome | S43 | S44a integrated (PR #399, `dev@a9154593`); S44b (opening it) → S71; #276 closed 2026-09-10 |
| 1.8 | S41-f1 | #387 | Commander | J-04 | Replay the model's real analysis of `sample1` in J-04 from the Provider Result Cache | S41 | unblocked by ADR 0079 §5 (2026-09-10: exact `sample1` is exempt from the echo rule); units 4 and 7 still need one named live item each (ADR 0070); not yet run — the Owner (2026-10-09) has it run in the same Owner-attended session as the ADR 0080 §7.7 `toolCalling` evidence item, once the S87-f3b policy pull request is ready |

## Phase 1c — what the first live Run exposed (closed except the provider line)

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1c.1 | S46 | #304 | T3 | all | The decision-layer / technical-identity rule and the per-surface survey | 1.1b | rule ADR 0071 (PR #329); families #332 to #337 integrated (PRs #347, #380, #383, #355, #386, #392); #304 closed 2026-09-10 |
| 1c.2 | S47 | #305 | T3 | J-04 | The Run Liveness Signal | 1.1b | integrated (PR #341, `dev@4254345`) |
| 1c.3 | S48 | #308 | T1 | — | `--check` answers `present`, `absent`, or `unavailable` | — | integrated (PR #314) |
| 1c.4 | S49 | #310 | T3 | J-04 | Model capability profiles keyed by route and model | S40 | integrated (PR #320) |
| 1c.5 | S50 | #311 | T2 | J-01, J-04, J-12 | Test manuscripts composed from admitted SampleBook content | #352 | integrated (PR #365); J-08's conversion #360 (PR #369) |
| 1c.6 | S51 | #313 | T3 | J-01 | Multi-format manuscript intake normalizing to DOCX under ADR 0072 | #297 | four units integrated (PRs #357, #370, #374, #378, #382) |
| 1c.7 | S52 | #316 | T2 | J-03 | The provider-denied Task kind's scope statements derived from the bound launch | #303 | integrated (PR #331) |
| 1c.8 | S53 | #318 | T1 | none | The delivery Gate fires on a pull request opened directly as ready | — | integrated (PR #319) |
| 1c.9 | S54 | #321 | T3 | J-04, J-12 | The explicit provider support list as inert profiles across four request shapes | #310 | five units integrated (PRs #340, #348, #359, #364, #366); #321 closed 2026-09-10 |
| 1c.10 | S55a | #435 | T3 | J-12 | Tier 1 of provider configuration: a provider whose format AI7 implements is configured by a schema-validated repository document and a generator (ADR 0073) | #321; ADR 0073 accepted | integrated (PR #712, `dev@e673100`; #435 closed): thirteen provider documents under `config/providers/`, the generator and its `check`; DeepSeek official and OpenCode Go moved byte for byte, eleven inert; follow-ups #715 integrated (PR #735, `dev@948c9e50`: ledger evidence cited per row from a checked-in recorded-evidence record) and #743 (PR #748, `dev@4de76c8a`: a withdrawn row kept as history); 字节豆包 is #719, written once its official API documentation is clear (the Owner, 2026-10-09) |
| 1c.11 | S55b | opened when reached | T3 | — | Tier 2, agent-driven discovery as repository tooling for a provider matching no implemented format | S55a | deferred |
| 1c.12 | S56 | #324 | T1 | none | Retire a merged branch by a sequence that works, and verify it | — | integrated (PR #326) |

## Owner decisions taken and design tasks

The storage rows implement ⑤ 设置 › 数据与存储; the storage decision V2-UX-DSTO-013 requires is [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §1, so both are dispatchable when reached. S87 is the consolidated provider assignment design ADR 0079 §6 defers the web-search binding to; it runs with the Owner before any search-enabled slice.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | S85 | #433 | T3 | J-12 | 数据版本 shown apart from the software version, frozen at release, changed only with backup, disclosure and rollback (B24) | ADR 0079 §1 | S85a (PR #595, `dev@220712b`) and S85b (PR #628, `dev@e7a9f78`) integrated |
| — | S86 | #434 | T3 | J-12 | 导出数据库 / 导入数据库 with preview, 替换 after an automatic backup or 合并; 定期自动备份 off by default (B25) | S85 | S86a (PR #613, `dev@23ce705`), S86b (PR #617, `dev@b5bec28`), S86c (PR #620, `dev@d08a4fa`) and S86d (PR #627, `dev@1e5fb0c`) integrated |
| — | S87 | #437 | T0 | — | Provider assignment design: every provider-involving task, its Model Role, the capabilities it needs (including the web-search tool), provider and model per scope, the credential slots to enroll (ADR 0079 §6) | ADR 0073, ADR 0079 | integrated as ADR 0080 (PR #449, `dev@ab76db6`); #437 closed as completed on 2026-09-17 |
| — | S87-f1 | #464 | T1 | J-04 | `toolCalling` and `webSearchTool` declared in every model capability profile with their evidence, inert (ADR 0080 §7.8 step 1) | S87 | integrated (PR #468) |
| — | S87-f2 | #465 | T2 | — | Provider Processing v7 bytes for `developer-live`: the two platform tools on the eligible-only rule, selected by no active set (ADR 0080 §7.8 step 2) | S87-f1 | integrated (PR #466); the Owner's byte decisions of 2026-09-12 — Parallel as the service, 90,000 tokens per frozen unit |
| — | S87-f3 | #473 | T3 | J-04 | AI7 platform tools `websearch` and `webfetch`: the Egress Gate narrowings, the network-denial allowance set, the `tool` payload source, their ledger and cache, and active-policy-set v6 selecting v7 (ADR 0080 §7.8 step 3) | S87-f2; ADR 0074 §3 | S87-f3a, the inert plumbing, integrated (PR #671, `dev@fcabd8f`); its five code blockers #676 closed by PR #724 (`dev@f900e6eb`; the follow-up #728 by PR #733, `dev@47bb9359`), everything still inert under Provider Processing v5; S87-f3b — Provider Processing v8 (v7 plus the dialogue rule of ADR 0088), active-policy-set v6 selecting it, and the execution wiring, with the renderer's 联网核查未完成 disclosure and `PLATFORM_TOOL_OUTBOUND_CATEGORY` widening with the policy as requirements of its brief — is the provider line's next unit, ahead of S70: it is draft PR #742 (protocol 115 at its landing), awaiting the Owner's byte review and the Owner's merge, with `perAttemptOutputCapTokens` left `null` for the Owner's word; the ADR 0080 §7.7 `toolCalling` evidence item follows the merge, Owner-attended, with #387 in the same session, and closes #473; aligning ADR 0080 rows 10, 15 and 17 with their kinds' web-search declarations after that item is #744 |

## Phase 2 — the manuscript surface, review, files and delivery

Exit criterion: an editor opens a Book into the manuscript at the last position, runs a categorized 审阅 whose findings arrive as marks, accepts one 修改建议 with 接受并应用 and a batch of 错别字 corrections through one confirmation strip, imports a DOCX with headers, footers, styles, text boxes, images, comments and tracked changes retained, exports it back with 含批注 and 含修改建议, designates a 发稿版本, delivers one Production Document through a Delivery Record and prepares a 图书交付包.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2.0 | S88 | #438 | T3 | J-01, J-08 | Keep only `sample1` in the repository; the other five SampleBooks become local-only test material; J-01's `.doc` scenario, J-08's inputs and the service builders retarget (ADR 0079 §5) | — | integrated (PR #446, `dev@6d1d095`) |
| 2.1 | S57 | #405 | T2 | J-12 | ① Open a Book into the manuscript at its last position; 工作概览 becomes a destination (B1) | S57-s | integrated (PR #470, `dev@1860641`); its `e2e:all` rung was withheld under the wave of 2026-09-12, and the hosted nightly has failed J-02 at `j14-behavior` on most runs since — #474 |
| 2.1a | S57-s | #467 | T3 | J-12 | Remember a manuscript's entry position: the additive record at schema revision 21, written on arrival, paging and leaving | — | integrated (PR #469, `dev@6327643`) |
| 2.2 | S71 | #406 | T2 | J-04 | ①b / ②A The finished analysis chain in editorial language, including the Run Report (S42b, S44b) | Phase 1, S57 | integrated (PR #480, `dev@50e7a6b`); the quick start on ②A is shown disabled until S75 (the Owner, 2026-09-20) |
| 2.3 | S58 | #407 | T3 | J-05 | ① Editorial marks: 批注, 备注, 高亮 and 修改建议 as Proposal Change Items (B2) | S57 | integrated (PR #482, `dev@cf9b0a5`); admits J-05 |
| 2.4 | S59 | #408 | T3 | J-05 | ① / ②B One-click 接受并应用 with the three records kept apart (B3) | S58 | integrated (PR #483, `dev@07cdc7f`) |
| 2.5 | S60 | #409 | T2 | J-02 | ① Position rail lanes in the unified 导航 column (B5) | S58 | integrated (PR #484, `dev@65d15b3`) |
| 2.6 | S69 | #417 | T3 | J-04 | ②B 审阅: multi-category Review Runs, coverage matrix, Reports, findings synced to marks, 书系一致性 (B6) | S58, S18a | integrated (PR #487, `dev@1c600a8`); the coverage follow-ups #709 (PR #711, `dev@feccde92`), #716 (PR #717, `dev@4d288490`) and #727 (PR #730, `dev@d4c856b0`) integrated — a 选章 carries a failed read as the gap it is, and the walk's bound is worded apart |
| 2.7 | S22 | #57 | T3 | J-06 | Same-block and structural conflicts resolved all-or-none, returning through 接受并应用 | S59 | integrated (PR #491, `dev@12d668d`); admits J-06 |
| 2.8 | S61 | #410 | T3 | J-01 | ④ DOCX content retained with the Source Version by default; 保留 / 并入 per class (B14) | — | integrated (PR #492, `dev@b1db4a1`) |
| 2.9 | S62 | #411 | T2 | J-01 | ④ Imported comments and tracked changes enter as marks (B15) | S58, S61 | integrated (PR #498, `dev@3a139c0`) |
| 2.10 | S63 | #412 | T3 | J-01 | ④ Chapter-level reimport with four verbs; marks migrate; return to the manuscript (B16) | S58 | integrated (PR #528, `dev@f5eab27`) |
| 2.11 | S64 | #413 | T3 | J-07 | ④ Export to DOCX with 含批注 / 含修改建议, fidelity table, system picker, receipt (B17) | S58, S61, S62 (the External Export Policy v2 bytes are integrated, PR #440, and need no further confirmation) | integrated (PR #501, `dev@fdda1b3`) |
| 2.11b | S64b | #500 | T3 | J-07 | ④ The same export to PDF and Markdown, and the 审阅报告 export (B17) | S64 | part 1 (PR #526, `dev@936eb5b`) and part 2 (PR #527, `dev@dade758`) integrated |
| 2.12 | S65 | #414 | T3 | J-07 | ⑥ 发稿: Manuscript-only milestones and 设为发稿版本 (B26) | — | integrated (PR #488, `dev@f169695`), taken ahead of S64; admits J-07 |
| 2.13 | S66 | #415 | T3 | J-07 | ⑥ Production Documents: types, versions, workflow and gates, Delivery Records, 交付后有修改, 本书不做 (B27) | S64, S58 | S66a (PR #529, `dev@17f0a20`) and S66b (PR #530, `dev@e96a306`) integrated; S66c (PR #556, `dev@e434153`) integrated; S66d, the gates, deferred by the Owner on 2026-10-09 (丙: no workflow profile that defines gates was given) |
| 2.14 | S67 | #416 | T3 | J-07 | ⑥ 图书交付包: conditions, frozen manifest, versions, export history (B28) | S64, S65, S66 | S67a (PR #531, `dev@c972758`) and S67b (PR #557, `dev@85c2fb3`) integrated |

Each slice's detail is in its Issue and in the specification's screen section; this table carries only the order and the dependencies. J-05 and J-07 are admitted by S58 and S65, and J-06 by S22's pull request (#491). Under [CI and test boundaries](../agents/ci-test-boundaries.md) admitting one is an explicit Owner routing decision, and on 2026-09-20 the Owner gave it for these and for J-09, J-10, J-11, J-13 and J-16 ("admit as you need"): the first slice of each supplies the real runner in its own pull request and cuts it over atomically into `ADMITTED_JOURNEYS`, `JOURNEY_MODULES`, `JOURNEY_LOCATIONS`, `e2e/run-all.mjs` and the nightly's full set, `GATE_JOURNEYS` unchanged.

## Phase 3 — one Task Drawer and run governance

Exit criterion: any Task shows its plan in the Task Drawer in 精简 or 完整 mode, can be edited into a new plan version, starts with 开始任务 or 联网后开始任务, or under a Default Execution Rule through 快速开始; a running Run pauses, cancels after an impact summary or is redone under a changed plan, survives interruption with explicit 续行, and honors budgets and account limits; 待我处理 groups cross-Book items; two Books run concurrently without focus or scope leakage.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3.1 | S72 | #418 | T3 | J-03 | ③ One Task Drawer for every Task; 精简 and 完整 modes (B8) | Phase 2 (2.1 to 2.6) | integrated (PR #499, `dev@3557a4f`) |
| 3.2 | S73 | #419 | T3 | J-03 | ③ Editable plan → 更新计划 → next plan version (B9) | S72 | integrated (PR #519, `dev@09578c3`) |
| 3.3 | S74a | #420 | T2 | J-03 | ③ The Task Drawer’s authorization bar: 开始任务 in one click for every kind (B10) | S72 | integrated (PR #503, `dev@80554ad`) |
| 3.3b | S74b | #502 | T2 | J-03 | ③ 联网后开始任务, the Reconnect Preflight and the Connectivity Wait (B10) | S74a | integrated (PR #512, `dev@0865589`); 需要重新确认计划 at reconnect integrated as #536 (PR #540, `dev@41a46c0`) |
| 3.4 | S75 | #421 | T3 | J-03 | ③ / ⑤ 快速开始 under a Default Execution Rule; 设为快速开始默认 (B11) | S72, S74a | integrated (PR #514, `dev@da94971`) |
| 3.5 | S76 | #422 | T3 | J-10 | ③ Running-Run controls, Clarification Requests, the activity card, 续行 (B12) | S72, S74a | S76a (PR #515, `dev@84058ae`), S76b (PR #516, `dev@6ee4279`), S76c (PR #520, `dev@58331ba`) and S76d (PR #522, `dev@92620e6`) integrated; admits J-10 |
| 3.6 | S13-f1 | #281 | T2 | J-04 | Every material plan field from durable state; the revert path; the dead `inspect` trigger kind | S13 | integrated (PR #445, `dev@6ecffb9`) |
| 3.7 | S16 | #51 | T2 | J-10 | Run Budget Ceiling termination, Provider Account Limit recovery, ambiguous outcomes | S76 | S16a (PR #523, `dev@52582dc`) and S16b (PR #524, `dev@d1d633d`) integrated; S16c waits for a route that can produce an ambiguous turn |
| 3.8 | S77 | #423 | T3 | J-16 | ① The 任务 panel: task list, dialogue tasks, result floating windows, the 回到 chip (B4) | S72, S74a | S77a (PR #562, `dev@342bc2e`; admits J-16) and S77b (PR #700, `dev@e6b2010`: 就这段发起任务… — 重新分析这段 or 审阅这段 on the selected paragraph) integrated; S77b's deferred items a and d — the house's enabled 可复用工序 on a selection and 跳到所选文字 — integrated (PR #738, `dev@0f577d80`; protocol 112); still deferred: joining a second range (refused in words), a free-text composer with a durable Task Intent Draft, and selection Tasks on a Production Document, which the Owner refused on 2026-10-09 |
| 3.9 | S78 | #424 | T2 | J-09 | ⑤ 待我处理: four cross-Book groups (B18) | S72 | integrated (PR #513, `dev@10af99e`); admits J-09 |
| 3.10 | S14 | #49 | T3 | J-09 | Concurrent Book work without focus or scope leakage | S78, S16 | integrated (PR #563, `dev@0b34c4d`); the follow-ups #632 items 1 to 3 (PR #648) and the Journey half of item 4 (PR #737, `dev@5ec04355`: J-09 applies a 修改建议 beside a Run under way) integrated, the several-windows half open |
| 3.11 | S39 | #95 | T3 | J-09 | Background Analysis Enrollment and revocation | S14 | integrated (PR #713, `dev@d5d912bc`; schema 66, protocol 109; J-09 +8 stages; #95 closed); the Owner's defaults of 2026-10-09 — the entry on 资料与记录 › 分析, nothing transmits before `ordinary-production`, an explicit ceiling once it can, capacity − 1, restored Enrollments suspended, pause and restart continuation deferred — are as built |
| 3.12 | S70 | #425 | T3 | J-04 | ②B / ⑤ External Evidence Retention Procedure; the live research path of 事实核查 (B13) | S69; ADR 0074 (accepted 2026-09-10, PR #391); S87-f3 (#473) | after S87-f3b; the Factual Verification Policy v1 bytes and the egress document it writes are the Owner's byte review at Ready |
| 3.13 | S68 | #426 | T2 | J-07 | ⑥ 维护事项 (B30) | S65, S59 | S68a (PR #559, `dev@215602c`) and S68b (PR #560, `dev@682a74c`) integrated |

## Phase 4 — the knowledge base, evaluation and learning

Exit criterion: 知识库 holds the seven classes with versions and selection snapshots and a locally built five-layer Material Index; 评估 produces a 100-point Evaluation Record the editor finalizes and a 审稿意见 draft from house exemplars; feedback and learning records attribute by 作者 and 责编; Series membership and knowledge feed 书系一致性.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 | S79 | #427 | T3 | J-15 | ⑤ 知识库: seven classes, versions, selection snapshots, attribution, eligibility; 范例 auto-archived at 发稿 (B21) | S75, S65 | S79a (PR #564, `dev@2de1042`), S79b (PR #565, `dev@b2f3fc3`), S79d's first piece (PR #566, `dev@828ca35`) and S79c (PR #567, `dev@84b0353`) integrated; S79d's remainder (评估方案, 社级编辑记忆, 外部来源留存 after S70) and the 范例 import remain; S79b's remainder, a published Book's 审稿意见 offered into 范例 under 仅本社 (KB-006), integrated (PR #739, `dev@2e2b3e14`; protocol 111) |
| 4.2 | S80 | #428 | T3 | J-15 | ⑤ The five-layer Material Index with local similarity vectors (B22) | S79 | S80a integrated (PR #725, `dev@678b27fa`; schema 67, protocol 110; J-15 +2 stages): layers 1 to 4 — original, metadata, extracted text, sentence-anchored segments — built locally in the background under the Owner's option 乙 of 2026-10-09, with the Task read seam; layer 5 (local vectors and 相似段落检索), OCR, PDF text and machine 来源译文 deferred until a local dependency or a Model Role is admitted; follow-ups #729 integrated (PR #751, `dev@2f7abf4c`: the builder counts as running work and resumes after 取消替换, numbered clauses and initials stay one sentence, a plan reads its pinned build, segments prepared outside the write) |
| 4.3 | S81 | #429 | T3 | J-11 | ②C 评估 and 审稿意见: Evaluation Records, the 100-point model, risk items, the prediction block, the fixed task (B7) | S79, S72, S65 | S81a (PR #570, `dev@3cd7bd8`), S81b1 (PR #653, `dev@d9b11df`), S81b2 (PR #682, `dev@61b2563`) and S81c (PR #662, `dev@fe8256d`) integrated, with follow-ups #689 (PR #692, `dev@d1d66f3`), #696 (PR #702, `dev@cac7a18`) and #708 (PR #720, `dev@9940fe13`); the 定稿 评估记录 and the pinned 审稿意见 in the 图书交付包 (BUNDLE-001) integrated (PR #739, `dev@2e2b3e14`; protocol 111); EVAL-011a, the house calibration offset on AI7's starting scores, and 从第 M 版重新评估 past a damaged latest version integrated (PR #741, `dev@9b3fb13d`; protocol 113; #726 and #430 closed); Quality Signals from adjustments remain |
| 4.4 | S82 | #430 | T2 | J-12 | ⑤ 设置 › 评估校准与预测 (B23) | S81, S65 | integrated (PR #577, `dev@1b6464a`); the offset it waited for applied by EVAL-011a (PR #741, `dev@9b3fb13d`), and #430 closed |
| 4.5 | S83 | #431 | T2 | J-11 | ⑤ Book People: 作者, 责编, 相关人 and attribution (B19) | — | integrated (PR #561, `dev@6c138f6`); admits J-11 |
| 4.6 | S38 | #94 | T2 | J-11 | Analysis feedback Quality Signals and the versioned Analysis Quality Metric | S44, S71 | integrated (PR #573, `dev@b17492f`) |
| 4.7 | S26 | #61 | T3 | J-11 | Optional feedback capture and Book-first learning eligibility (范例 auto-inclusion excepted, KB-008) | S38, S83 | S26a (PR #574, `dev@84867d1`), S26b (PR #575, `dev@84b5fc6`) and S26c (PR #576, `dev@d8c985c`) integrated |
| 4.8 | S27 | #62 | T3 | J-11 | Learning Lineage, exclusion, remediation | S26 | S27a (PR #673, `dev@0747067`) integrated; learning signals, memory candidates and their lineage remain until something produces them |
| 4.9 | S28 | #63 | T3 | J-13 | Series membership with impact previews and versioned Series Knowledge (B20) | Phase 2 | S28a (PR #578, `dev@22d4cd9`) and S28b (PR #585, `dev@f418284`) integrated; admits J-13 |
| 4.10 | S29 | #64 | T3 | J-13 | Series and Cross-project scope pins and immediate retrieval exclusions (B20) | S28, S69 | S29a (PR #645, `dev@8e41343`) and S29b (PR #663, `dev@8bd098e`) integrated; Cross-project scope pins and Series-scope Tasks beyond 书系一致性 remain |

## Phase 5 — ecosystem, dialogue and writing

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5.1 | S17 | #52 | T3 | J-16 | Interactive Editorial Dialogue streaming without authority mutation | S77 | S17a (PR #658, `dev@3a6b73d`) integrated on the local route; S17c, the live route under ADR 0088, follows S87-f3b; S17b (the reasoning summary, structured rows and a Task Intent Draft from an answer) needs the free-text composer and durable Task Intent Draft that S77b (PR #700) deferred |
| 5.2 | S34 | #90 | T3 | J-16 | Book-bound DSH Agent Workspace | S17 | planned |
| 5.3 | S30 | #65 | T3 | J-15 | Capture a reusable procedure candidate as a native artifact, a projection or a developer proposal (the Rule branch is S75's) | S75, S79 | integrated (PR #666, `dev@fed7ed6`) under ADR 0087 (PR #664) |
| 5.4 | S31 | #66 | T3 | J-15 | Resolve, pin, reuse, and retire exact procedure versions | S30 | S31a (PR #681, `dev@f862f24`) and S31b (PR #695, `dev@5d41023`) integrated, with follow-ups #691 (PR #699, `dev@00dc1c1`), #697 (PR #703, `dev@947d7d8`) and #705 (PR #731, `dev@d2a95bd8`); permanent deletion, a Default Execution Rule bound to a procedure version and recommendation remain, each deferred by ADR 0087 §4 to §6 and needing an Owner ADR |
| 5.5 | S33 | #89 | T2 | J-15 | Reconcile and adopt foreign Skill updates | S31 | planned |
| 5.6 | S84 | #432 | T3 | J-07 | ⑥ 写作任务 drafting a Production Document from the synopsis, evaluation, exemplars and metadata (B29) | S66, S79, S81, S72 | integrated: S84a (PR #688, `dev@aaaa7fa`) and S84b, its 快速开始 under a writing 默认执行规则 (PR #701, `dev@c475b93`); #432 closed; the copy-rule follow-up #698 (PR #704, `dev@7f98777`), its rules confirmed by the Owner on 2026-10-09; #707 integrated (PR #736, `dev@2f5e28b6`: the wording names 拉丁字母文字 and the break a run crossed) |

## Superseded slices

| Old slice | Issue | Disposition on 2026-09-10 |
| --- | --- | --- |
| S15 | #50 | closed as outdated → S76 |
| S18b, S18c | #53 | S18a integrated; closed → S69 (surfaces as the 事实核查 category), S70 (live research) |
| S19 | #54 | closed as outdated → S58 and S59 (a finding's Correction Proposal as 修改建议 and 接受并应用), S70 (retention) |
| S20 | #55 | closed as outdated → S58 |
| S21 | #56 | closed as outdated → S59 |
| S23 | #58 | closed as outdated → S66 |
| S24 | #59 | closed as outdated → S64 (still Owner confirmation) |
| S25 | #60 | closed as outdated → S65 and S68 |
| S44b | #276 | S44a integrated; closed → S71 |
| S45 | #277 | closed as outdated → S75 |
| S55 | #322 | settled 2026-09-08; closed → S55a |
| S13b | never opened | Clarification Requests and prompt contract v2 → S76 |

## Unscheduled backlog

Open, recorded, and deliberately not ordered — the Commander schedules them when the Owner reaches them.

- **Gate health:** #474 and #475 are closed by PR #479 (`dev@7fe1c05`): `navigate()` held its paging guard across the S57 position write, which dropped J-01's and J-02's paired paging commands on a slow disk, and the pane's own scroll restoration was read as the editor reaching the top edge, which paged away and paused editing on hosted macOS. #579 was the long-standing one: J-02 failed intermittently at `j14-keyboard-search-focus` on hosted macOS only; PR #586 (`dev@4789ac7`) made the step wait for its precondition and name what its ⌘F press did, which ruled out the composition guard, and PR #599 made the hosted marker say whether the key arrived and with its modifier, #591 keeping the `-search-disabled` split. The same Journey failed once on hosted macOS at `j14-keyboard-focus-keeps-window-no-reveal`, a recurrence of #493; PR #610 (#604) makes that hosted marker say what the focus found, and until a recurrence names its cause it counts as a known flake, re-run once per occurrence. #518, J-01's intermittent readiness miss at `renderer-ready`, is closed by PR #550 (`dev@e700abb`), which makes a miss say where the product's startup stopped; the 60 s budget is unchanged. Since PR #654 (`dev@29bce35`) a hosted failure also names the check that failed; #641, #656 and #665 are closed by PRs #669, #668 and #667. On 2026-10-09 #579, #591 and #619 were closed on the evidence of PR #723's scan of every nightly run since 2026-09-20 (no recurrence in 139 and 120 clean full-gate runs), and the three that stay open each gained an instrument: #675 (J-01 with no renderer target, or no browser at all; PR #721, `dev@43393dec`, names how far main came and what the host was doing), #643 (J-08 once on hosted macOS; PR #722, `dev@00c2e24a`, names the screen, tone and marker the product showed) and #621 (J-02's import waits on a slow hosted Windows runner; PR #723, `dev@01d1eac4`, says how busy the product and the host were), each re-run once per occurrence. On 2026-10-10 #675 recurred on hosted macOS with #721's instrument in place, naming a launch whose process never reached main's script, idle, with no helpers and no earlier instance alive; and #745, J-06 at `keep-current/check/third-suggestion-choose` on hosted macOS twice on 2026-10-09 and 2026-10-10, is traced to the Mark menu closing on the pane's own scroll, its fix draft PR #747 in macOS investigation.
- #286 (the retried unit's payload digest on the Plan Adaptation) is closed by PR #635 (`dev@23b622c`), and #288 (the Task Intent range versus later plan versions) by PR #651 (`dev@e2d540b`) under the Owner's 甲 of 2026-10-07. #287 (durable-state drift proven beyond unit tests) is **parked** since 2026-09-12: attempt A1 proved its premise unreachable today — the sidecar pin is immutable and four of five Provider Binding columns are CHECK-pinned — and it is re-cut when S87-f3b (#473) or S55a (#435) makes a second admitted binding possible, or a sidecar Revision 3 exists. #452 (the provider literals) is routed, not scheduled: the union and profile share retired with S55a (PR #712), the gate and store share to S87-f3b, the schema share its own T3. #632 (S14's wait labels and Journey coverage) has items 1 to 3 landed (PR #648) and the Journey half of item 4 (PR #737, `dev@5ec04355`); the several-windows half keeps it open. #644 (the storage landing-review P3s) has its protocol item landed (PR #749, `dev@0d5381b3`: a merge that stops before its data is in use records `unmergeable`) and keeps only the Owner's `readUpgrade` reading. #281 (PR #445), #301 (2026-09-07) and #328 (PR #444) are closed.

## Recording under ADR 0044

The human-attended `sample1` recording is scheduled after the Phase 1 exit criterion, when the unit, cross-unit, and factual contracts have stopped changing. Its sequence is: an ADR for the `fixture-recording` policy successor (transmissions equal to the frozen unit count, per-unit Sessions, the development-interval binding), the recording Issue, and the admission Issue. Until then every fixture comes from S41 generation or hand-writing, and no recording Issue is opened.

## Deferred and out of scope

Packaging, signing, notarization, release, `dev` to `main` promotion, Word integration, additional platforms, private manuscripts in any development scope, and the self-hosted Gate remain outside this plan and need their own Owner decisions. Policy Documents are runtime records the Owner reviews byte by byte: the documents ADR 0079 decides are written by the Commander and bundled into as few active-set versions as their timing allows; they are not slices in these tables. Provider Processing v5 and v6 and External Export Policy v2 are integrated under active-policy-set v5 (PR #440, the Owner reviewing their bytes and amending ADR 0079 §3 in the same review); the egress document beside the Factual Verification Policy v1 remains.
