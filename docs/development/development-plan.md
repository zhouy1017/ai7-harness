# AI7 development plan

Status: **Owner-accepted delivery order under [ADR 0064](../adr/0064-reweight-repository-development-toward-value-first-delivery.md), re-cut on `dev@28cc1dd800cf55b17947cceb64a3bce4d81ccfef` on 2026-09-10 from the backend alignment list of the [editor-facing surface specification](../ui-ux-v2/editor-surfaces.md) §11 ([ADR 0077](../adr/0077-adopt-the-editor-facing-surface-specification-as-the-execution-standard.md) §7, [ADR 0078](../adr/0078-align-the-remaining-references-the-plan-and-the-tracker-to-the-editor-facing-specification.md)).** This file is the only place the order lives. Root [`PROGRESS.md`](../../PROGRESS.md) names the next slice; every slice Issue carries its plan slot. The order changes only through a Commander pull request that edits this file and states the reason; a change that alters product authority also needs an ADR. The order as it stood before the re-cut is archived at [docs/archive/editor-surfaces-standard-2026-09-10](../archive/editor-surfaces-standard-2026-09-10/INDEX.md).

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
| 1.8 | S41-f1 | #387 | Commander | J-04 | Replay the model's real analysis of `sample1` in J-04 from the Provider Result Cache | S41 | waits for the Owner's answer on the fixture tool's manuscript-echo bound |

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
| 1c.10 | S55a | #435 | T3 | J-12 | Tier 1 of provider configuration: a provider whose format AI7 implements is configured by a schema-validated repository document and a generator (ADR 0073) | #321; ADR 0073 accepted | ADR 0073 accepted (PR #377, 2026-09-10); dispatchable when reached; #322 closed 2026-09-10 |
| 1c.11 | S55b | opened when reached | T3 | — | Tier 2, agent-driven discovery as repository tooling for a provider matching no implemented format | S55a | deferred |
| 1c.12 | S56 | #324 | T1 | none | Retire a merged branch by a sequence that works, and verify it | — | integrated (PR #326) |

## Owner decisions taken and design tasks

The storage rows implement ⑤ 设置 › 数据与存储; the storage decision V2-UX-DSTO-013 requires is [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §1, so both are dispatchable when reached. S87 is the consolidated provider assignment design ADR 0079 §6 defers the web-search binding to; it runs with the Owner before any search-enabled slice.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | S85 | #433 | T3 | J-12 | 数据版本 shown apart from the software version, frozen at release, changed only with backup, disclosure and rollback (B24) | ADR 0079 §1 | planned |
| — | S86 | #434 | T3 | J-12 | 导出数据库 / 导入数据库 with preview, 替换 after an automatic backup or 合并; 定期自动备份 off by default (B25) | S85 | planned |
| — | S87 | #437 | T0 | — | Provider assignment design: every provider-involving task, its Model Role, the capabilities it needs (including the web-search tool), provider and model per scope, the credential slots to enroll (ADR 0079 §6) | ADR 0073, ADR 0079 | Owner + Commander session |

## Phase 2 — the manuscript surface, review, files and delivery

Exit criterion: an editor opens a Book into the manuscript at the last position, runs a categorized 审阅 whose findings arrive as marks, accepts one 修改建议 with 接受并应用 and a batch of 错别字 corrections through one confirmation strip, imports a DOCX with headers, footers, styles, text boxes, images, comments and tracked changes retained, exports it back with 含批注 and 含修改建议, designates a 发稿版本, delivers one Production Document through a Delivery Record and prepares a 图书交付包.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2.0 | S88 | #438 | T3 | J-01, J-08 | Keep only `sample1` in the repository; the other five SampleBooks become local-only test material; J-01's `.doc` scenario, J-08's inputs and the service builders retarget (ADR 0079 §5) | — | integrated (PR #446, `dev@6d1d095`) |
| 2.1 | S57 | #405 | T2 | J-12 | ① Open a Book into the manuscript at its last position; 工作概览 becomes a destination (B1) | — | planned |
| 2.2 | S71 | #406 | T2 | J-04 | ①b / ②A The finished analysis chain in editorial language, including the Run Report (S42b, S44b) | Phase 1, S57 | planned |
| 2.3 | S58 | #407 | T3 | J-05 | ① Editorial marks: 批注, 备注, 高亮 and 修改建议 as Proposal Change Items (B2) | S57 | planned |
| 2.4 | S59 | #408 | T3 | J-05 | ① / ②B One-click 接受并应用 with the three records kept apart (B3) | S58 | planned |
| 2.5 | S60 | #409 | T2 | J-02 | ① Position rail lanes in the unified 导航 column (B5) | S58 | planned |
| 2.6 | S69 | #417 | T3 | J-04 | ②B 审阅: multi-category Review Runs, coverage matrix, Reports, findings synced to marks, 书系一致性 (B6) | S58, S18a | planned |
| 2.7 | S22 | #57 | T3 | J-06 | Same-block and structural conflicts resolved all-or-none, returning through 接受并应用 | S59 | planned |
| 2.8 | S61 | #410 | T3 | J-01 | ④ DOCX content retained with the Source Version by default; 保留 / 并入 per class (B14) | — | planned |
| 2.9 | S62 | #411 | T2 | J-01 | ④ Imported comments and tracked changes enter as marks (B15) | S58, S61 | planned |
| 2.10 | S63 | #412 | T3 | J-01 | ④ Chapter-level reimport with four verbs; marks migrate; return to the manuscript (B16) | S58 | planned |
| 2.11 | S64 | #413 | T3 | J-07 | ④ Export to DOCX / PDF / Markdown with 含批注 / 含修改建议, fidelity table, system picker, receipt (B17) | S58, S61 (the External Export Policy v2 bytes are integrated, PR #440) | planned |
| 2.12 | S65 | #414 | T3 | J-07 | ⑥ 发稿: Manuscript-only milestones and 设为发稿版本 (B26) | — | planned |
| 2.13 | S66 | #415 | T3 | J-07 | ⑥ Production Documents: types, versions, workflow and gates, Delivery Records, 交付后有修改, 本书不做 (B27) | S64, S58 | planned |
| 2.14 | S67 | #416 | T3 | J-07 | ⑥ 图书交付包: conditions, frozen manifest, versions, export history (B28) | S64, S65, S66 | planned |

Each slice's detail is in its Issue and in the specification's screen section; this table carries only the order and the dependencies.

## Phase 3 — one Task Drawer and run governance

Exit criterion: any Task shows its plan in the Task Drawer in 精简 or 完整 mode, can be edited into a new plan version, starts with 开始任务 or 联网后开始任务, or under a Default Execution Rule through 快速开始; a running Run pauses, cancels after an impact summary or is redone under a changed plan, survives interruption with explicit 续行, and honors budgets and account limits; 待我处理 groups cross-Book items; two Books run concurrently without focus or scope leakage.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3.1 | S72 | #418 | T3 | J-03 | ③ One Task Drawer for every Task; 精简 and 完整 modes (B8) | Phase 2 (2.1 to 2.6) | planned |
| 3.2 | S73 | #419 | T3 | J-03 | ③ Editable plan → 更新计划 → next plan version (B9) | S72 | planned |
| 3.3 | S74 | #420 | T2 | J-03 | ③ 开始任务 in one click; 联网后开始任务 with Reconnect Preflight (B10) | S72 | planned |
| 3.4 | S75 | #421 | T3 | J-03 | ③ / ⑤ 快速开始 under a Default Execution Rule; 设为快速开始默认 (B11) | S72, S74 | planned |
| 3.5 | S76 | #422 | T3 | J-10 | ③ Running-Run controls, Clarification Requests, the activity card, 续行 (B12) | S72, S74 | planned |
| 3.6 | S13-f1 | #281 | T2 | J-04 | Every material plan field from durable state; the revert path; the dead `inspect` trigger kind | S13 | integrated (PR #445, `dev@6ecffb9`) |
| 3.7 | S16 | #51 | T2 | J-10 | Run Budget Ceiling termination, Provider Account Limit recovery, ambiguous outcomes | S76 | planned |
| 3.8 | S77 | #423 | T3 | J-16 | ① The 任务 panel: task list, dialogue tasks, result floating windows, the 回到 chip (B4) | S72, S74 | planned |
| 3.9 | S78 | #424 | T2 | J-09 | ⑤ 待我处理: four cross-Book groups (B18) | S72 | planned |
| 3.10 | S14 | #49 | T3 | J-09 | Concurrent Book work without focus or scope leakage | S78, S16 | planned |
| 3.11 | S39 | #95 | T3 | J-09 | Background Analysis Enrollment and revocation | S14 | planned |
| 3.12 | S70 | #425 | T3 | J-04 | ②B / ⑤ External Evidence Retention Procedure; the live research path of 事实核查 (B13) | S69; ADR 0074 (accepted 2026-09-10, PR #391); S87's web-search binding (ADR 0079 §4) | after S87 |
| 3.13 | S68 | #426 | T2 | J-07 | ⑥ 维护事项 (B30) | S65, S59 | planned |

## Phase 4 — the knowledge base, evaluation and learning

Exit criterion: 知识库 holds the seven classes with versions and selection snapshots and a locally built five-layer Material Index; 评估 produces a 100-point Evaluation Record the editor finalizes and a 审稿意见 draft from house exemplars; feedback and learning records attribute by 作者 and 责编; Series membership and knowledge feed 书系一致性.

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 | S79 | #427 | T3 | J-15 | ⑤ 知识库: seven classes, versions, selection snapshots, attribution, eligibility; 范例 auto-archived at 发稿 (B21) | S75, S65 | planned |
| 4.2 | S80 | #428 | T3 | J-15 | ⑤ The five-layer Material Index with local similarity vectors (B22) | S79 | planned (a local dependency needs the Owner) |
| 4.3 | S81 | #429 | T3 | J-11 | ②C 评估 and 审稿意见: Evaluation Records, the 100-point model, risk items, the prediction block, the fixed task (B7) | S79, S72, S65 | planned |
| 4.4 | S82 | #430 | T2 | J-12 | ⑤ 设置 › 评估校准与预测 (B23) | S81, S65 | planned |
| 4.5 | S83 | #431 | T2 | J-11 | ⑤ Book People: 作者, 责编, 相关人 and attribution (B19) | — | planned |
| 4.6 | S38 | #94 | T2 | J-11 | Analysis feedback Quality Signals and the versioned Analysis Quality Metric | S44, S71 | planned |
| 4.7 | S26 | #61 | T3 | J-11 | Optional feedback capture and Book-first learning eligibility (范例 auto-inclusion excepted, KB-008) | S38, S83 | planned |
| 4.8 | S27 | #62 | T3 | J-11 | Learning Lineage, exclusion, remediation | S26 | planned |
| 4.9 | S28 | #63 | T3 | J-13 | Series membership with impact previews and versioned Series Knowledge (B20) | Phase 2 | planned |
| 4.10 | S29 | #64 | T3 | J-13 | Series and Cross-project scope pins and immediate retrieval exclusions (B20) | S28, S69 | planned |

## Phase 5 — ecosystem, dialogue and writing

| Order | Slice | Issue | Class | Journey | Outcome | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5.1 | S17 | #52 | T3 | J-16 | Interactive Editorial Dialogue streaming without authority mutation | S77 | planned |
| 5.2 | S34 | #90 | T3 | J-16 | Book-bound DSH Agent Workspace | S17 | planned |
| 5.3 | S30 | #65 | T3 | J-15 | Capture a reusable procedure candidate as a native artifact, a projection or a developer proposal (the Rule branch is S75's) | S75, S79 | planned |
| 5.4 | S31 | #66 | T3 | J-15 | Resolve, pin, reuse, and retire exact procedure versions | S30 | planned |
| 5.5 | S33 | #89 | T2 | J-15 | Reconcile and adopt foreign Skill updates | S31 | planned |
| 5.6 | S84 | #432 | T3 | J-07 | ⑥ 写作任务 drafting a Production Document from the synopsis, evaluation, exemplars and metadata (B29) | S66, S79, S81, S72 | planned |

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

- #286 (the retried unit's payload digest on the Plan Adaptation), #287 (durable-state drift proven beyond unit tests), #288 (the Task Intent range versus later plan versions; its visible half is satisfied by S72's context chips). #281 (PR #445), #301 (2026-09-07) and #328 (PR #444) are closed; #286 and #287 are dispatchable now that #281 is in.

## Recording under ADR 0044

The human-attended `sample1` recording is scheduled after the Phase 1 exit criterion, when the unit, cross-unit, and factual contracts have stopped changing. Its sequence is: an ADR for the `fixture-recording` policy successor (transmissions equal to the frozen unit count, per-unit Sessions, the development-interval binding), the recording Issue, and the admission Issue. Until then every fixture comes from S41 generation or hand-writing, and no recording Issue is opened.

## Deferred and out of scope

Packaging, signing, notarization, release, `dev` to `main` promotion, Word integration, additional platforms, private manuscripts in any development scope, and the self-hosted Gate remain outside this plan and need their own Owner decisions. Policy Documents are runtime records the Owner reviews byte by byte: the documents ADR 0079 decides are written by the Commander and bundled into as few active-set versions as their timing allows; they are not slices in these tables. Provider Processing v5 and v6 and External Export Policy v2 are integrated under active-policy-set v5 (PR #440, the Owner reviewing their bytes and amending ADR 0079 §3 in the same review); the egress document beside the Factual Verification Policy v1 remains.
