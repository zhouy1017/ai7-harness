# AI7 Initial v1.0.0 Development Milestone scope

Status: Owner-confirmed on 2026-10-13 (decision record kept by the Commander outside the repository); landed by wave 1's documentation slice (#832). Under [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) the boundary is crossed only when a separately authorized completion Issue and pull request integrate a stable record naming the exact `dev` commit containing this scope. The consolidated Windows/macOS re-entry validation follows as a separate authorized step. Promotion to `main`, tags, packaging signatures, notarization and release stay separate.

For the historical 2026-10-13 scope and completion record below, the Owner defined 1.0.0 as **every designed capability** in the PRD, `docs/ui-ux-v2/editor-surfaces.md` and `docs/ui-ux-v2/requirements.md`, except the items listed under the historical exclusions below. Delivery order lives in the [development plan](development-plan.md); this file only fixes what is in and what is out.

## Windows v3.2 successor scope (accepted direction; not milestone backfill)

[ADR 0095](../adr/0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md) and [ADR 0096](../adr/0096-edit-manuscript-structure-recognize-structure-and-remove-editor-facing-ceremony.md) (2026-10-23) extend this successor scope with procedures as the central object (F-26), the execution governor and idle lane (F-16/F-17), DSH as the complex-task harness (F-18), review contract v2 and evidence on cards (F-19), the deterministic checker (F-20), the single policy successor (F-21), structural editing and recognition (F-22), ceremony removal (F-23), the quality baseline (F-24) and hub extraction (F-25); the [development plan](development-plan.md) owns their order. They change neither the milestone boundary commit nor its evidence.

[ADR 0094](../adr/0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md) adds unified multi-provider selection (F-01), DeepSeek/Bocha research (F-02), opt-out local intelligent learning (F-05), the project-independent Global Agent (F-06) and explicit dual-mode Word tracked-change intake/learning (F-07) to the Windows-first delivery scope. F-03/F-04 repair anchoring/reliability; F-08 supplies real local embeddings; F-09/F-10 improve selection/copilot/direct execution; F-11 improves DOCX/report fidelity; F-12/F-13 cover Windows packaging and admitted workflow acceptance. The [development plan](development-plan.md) owns all F-01–F-15 Issues, dependencies and proof. These capabilities remain planned until implemented and verified.

The successor scope replaces the historical provider deferral for the named F-01 services, without changing current selected policies. It changes neither the exact milestone boundary commit nor that commit’s evidence. Standalone DOCX tracked-change intake is not Word integration. House gates (#415/#980), inert Doubao declaration (#719) and other F-15 outcomes remain deferred; #766’s real EPUB/ODT/RTF evidence still requires specific admission. F-12 may prepare signing, but actual certificate use/signing/release and `main` promotion retain their authorization boundaries. ADR 0093’s Windows delivery and indefinite macOS release hold remain in force. Data Version 1 remains frozen.

## Historical in scope (beyond what dev@97149432 integrated)

| Area | Outcome | Decision |
| --- | --- | --- |
| Live non-web AI kinds | Dialogue, review categories, writing, three evaluation contracts, 润色这段, conflict regeneration on Go DeepSeek V4.1 Flash under developer-live and ordinary-production | #52, #809, #810, #429; D7, D18 |
| Local ordinary production | User credential, user data location, production launch path, Go + DeepSeek official routes, proxy setting | #811; D23, D27 |
| Cross-deliverable consistency | Category 9 executable when deliverables exist | #813 |
| Reference consumption | Withdrawal re-check at consumption; reference-bearing review/writing/evaluation | #759 |
| Task controls | Background analysis transmits in production with mandatory ceiling, Series and all-Books scopes; model-initiated clarification (one per unit); Run controls on Review Runs; plan editing for every task kind; 审阅 快速开始 and default rules for all kinds; 停止 as an alias of 取消 | D8, D11, D12 |
| Editorial-value evidence and fidelity | #812 measured case set; #814 edited-DOCX contract; #766 readers | P1 rows |
| Web evidence chain | Every usable search backend shipped in the product (development evaluation only excludes clearly unusable ones and ranks the rest); the user selects a backend in settings, can run a built-in 测试检索 per backend, and each Run freezes the backend used; keys and per-call fees accepted; AI7-owned webfetch; declarations aligned; external evidence retention with 来源译文 and staleness | #473, #744, #425; D24, D24⁵ |
| Retrieval | Similarity vectors with a local embedding model, PDF text layer, 来源译文; targeted retrieval + Exact Fetch as a tool for every model task | #428; D5, D20 |
| Factual verification, second half | Evidence comparison, three assurance levels (default 标准核查; offline degrades to 快速整理 with disclosure), verification review decisions, correction proposals | D9 |
| Proposal and Apply chain surfaces | Dedicated review workspace above 20 suggestions, draft decisions, filtered batch decisions, atomic groups, four-state Apply cards | D10 |
| Learning | House review-preference record as the first consumer; lineage, exclusion and remediation; quality signals from edits | #427, #61, #62; D22 |
| Procedures and tasks | Task Intent Draft + S17b; cross-project scope and Series tasks for real kinds; procedure versions; foreign Skill updates; Skill import/validation; procedure recommendation; custom analysis dimensions driven by procedures | #423, #64, #66, #89; D6, D21 |
| Shell and settings | 跟随系统/浅色/深色; two-level sidebar, three destinations, Book navigation groups, pinned/recent; 用量 page; shortcut remapping; OS notifications default off; diagnostics bundle and local crash record; help and legal texts | D13–D16, D27 |
| Editor | 专注模式; editing-protection read-only state; density and typography presets; Book-level 发现 center; ED-052 save menu; paragraph 分析 side panel with 分析有新发现 hint; 交付包 zip export | D17, D18 |
| Agent Workspace | Book-bound DSH Agent Workspace, one bounded journey; first-run onboarding with a bundled public-domain sample Book | #90; D27 |
| Distribution | Buildable unsigned Windows installer + portable and macOS DMG; Data Version frozen at release; pre-upgrade backup and rollback; manual update | D25, D26 |

## Historical outside 1.0.0 (2026-10-13 exclusions and deferrals)

- Microsoft Word integration (ADR 0013). Legacy production-data migration (ADR 0012).
- S66d house workflow gates, WGATE-001~011 (#415 stays deferred).
- Rewind (回退并调整方向) and Replay (CONT-002~012).
- 结构调整模式 (ED-018) and the Detached Manuscript Window (VIEW-016~024).
- Accessibility-specific settings beyond keyboard remapping; existing J-14 obligations inside every Journey stay as they are.
- Workflow-definition branch (REUSE-055~062), Skill catalog sources, trust tiers and sandboxing (ADR 0087 §6).
- Plugin-provided analysis kinds (story 145, plugin part).
- Escalation and frontier Model Roles bound by default (user-configurable only).
- Code signing, notarization, release, `main` promotion, auto-update.
- Providers other than OpenCode Go and DeepSeek official remain declared documents marked 尚未支持; Doubao waits for official documentation (#719).

## Deferred outcomes after 1.0.0

The [Post-1.0.0 Issues](#post-100-issues) below already track OCR, updates, plugin analysis kinds, 结构调整模式, Detached Manuscript Window, workflow definitions, Skill catalog/trust/sandbox, S66d and Rewind/Replay. Their current order and blockers live in the [development plan](development-plan.md); do not reopen or duplicate them.

## Completion record (ADR 0054)

Record integration: [PR #986](https://github.com/zhouy1017/ai7-harness/pull/986) merged at `dev@ae5d2c1e29eebbeca7823e301d427ad2737ac5c1` on 2026-10-18; #972 is closed. The record below describes the named boundary commit, including its then-current evidence limits. Later implementation and evidence are routed through [PROGRESS](../../PROGRESS.md); the v3.2 successor scope above does not backfill or relabel this record.

This is the stable record required by [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) under the separately authorized completion Issue [#972](https://github.com/zhouy1017/ai7-harness/issues/972). The boundary is crossed only when this record integrates into `dev`; a Draft PR or a slice merge into a wave does not cross it. It names one exact `dev` commit:

**`c2f4fff3faf8b7e3033545a0e1e23c1ca29c752b`** — the squash merge of wave 14's final integration, [PR #971](https://github.com/zhouy1017/ai7-harness/pull/971). That commit contains the Owner-confirmed complete initial-v1.0.0 development scope above: every row of the historical in-scope table was integrated into `dev` by waves 1–14, through reviewed final wave PRs. The Owner's confirmation of the scope is the decision record kept outside the repository named in the status line; what follows is only what `git` proves about the integration.

### Wave integrations

Each commit is on the first-parent history of `dev` and is an ancestor of `c2f4fff3faf8b7e3033545a0e1e23c1ca29c752b` (verified with `git merge-base --is-ancestor`); a wave commit is the squash merge of its final wave PR.

| Wave | Final wave PR | `dev` commit |
| --- | --- | --- |
| 1 | [#835](https://github.com/zhouy1017/ai7-harness/pull/835) | `b2deb1cd03e73d2b061357c5923889bcac3ee180` |
| 2 | [#846](https://github.com/zhouy1017/ai7-harness/pull/846) | `6ea12aad68eda6054921480cc2c001a7733699cf` |
| 3 | [#858](https://github.com/zhouy1017/ai7-harness/pull/858) | `08f006e2952b2b054be0936cef9613bc8c8530f6` |
| 4 | [#871](https://github.com/zhouy1017/ai7-harness/pull/871) | `e692641f138aea4f846cad0a513d3ee14a1dcddb` |
| 5 | [#878](https://github.com/zhouy1017/ai7-harness/pull/878) | `2ad06a2dd675e6b1279cd31b9e4175b9d0b41a14` |
| 6 | [#885](https://github.com/zhouy1017/ai7-harness/pull/885) | `b20c0260989984c71be5792106010b985ce97145` |
| 7 | [#898](https://github.com/zhouy1017/ai7-harness/pull/898) | `de8227ca7ddced2de70f48c314d41938af34d0c1` |
| 8 | [#906](https://github.com/zhouy1017/ai7-harness/pull/906) | `95fd12bf1615ff9c3586d1707d2f0a4604879072` |
| 9 | [#916](https://github.com/zhouy1017/ai7-harness/pull/916) | `a206814c2158798ba7f9f5c675152bce883d4af8` |
| 10 | [#924](https://github.com/zhouy1017/ai7-harness/pull/924) | `2aee9baaaf5a6b607e649bea8dbd3c6bb81915ba` |
| 11 | [#947](https://github.com/zhouy1017/ai7-harness/pull/947) | `fd809256c8a891ec79636ea80676994db6a1fb8e` |
| 12 | [#957](https://github.com/zhouy1017/ai7-harness/pull/957) | `98742312e2f9fb1c752568b9639dcd9dfd12af82` |
| 13 | [#964](https://github.com/zhouy1017/ai7-harness/pull/964) | `117dc060b1948084beef5fd65f63c5df91cd955d` |
| 14 | [#971](https://github.com/zhouy1017/ai7-harness/pull/971) | `c2f4fff3faf8b7e3033545a0e1e23c1ca29c752b` |

### In-scope rows and their integrating pull requests

Slice pull requests were merged into their wave branch and reached `dev` inside the wave commit shown. Every row maps to at least one landed pull request; "Disclosed limits" below states where a row's delivered form is narrower than its wording.

| Area | Slice pull requests | Wave commit on `dev` |
| --- | --- | --- |
| Live non-web AI kinds | Dialogue [#837](https://github.com/zhouy1017/ai7-harness/pull/837) and review [#838](https://github.com/zhouy1017/ai7-harness/pull/838) (policy v10/v8, [#834](https://github.com/zhouy1017/ai7-harness/pull/834)); writing [#845](https://github.com/zhouy1017/ai7-harness/pull/845), the three evaluation contracts [#849](https://github.com/zhouy1017/ai7-harness/pull/849), 润色这段 and conflict regeneration [#848](https://github.com/zhouy1017/ai7-harness/pull/848), streaming [#847](https://github.com/zhouy1017/ai7-harness/pull/847) (policy v11/v9, [#844](https://github.com/zhouy1017/ai7-harness/pull/844)) | wave 1 `b2deb1cd`; wave 2 `6ea12aad` |
| Local ordinary production | [#857](https://github.com/zhouy1017/ai7-harness/pull/857) (production launch, two-route connection store, credential broker, data location), proxy setting [#855](https://github.com/zhouy1017/ai7-harness/pull/855), policy v12/v13/set v10 [#856](https://github.com/zhouy1017/ai7-harness/pull/856) | wave 3 `08f006e2` |
| Cross-deliverable consistency | [#859](https://github.com/zhouy1017/ai7-harness/pull/859) | wave 3 `08f006e2` |
| Reference consumption | Consumption-time re-check [#843](https://github.com/zhouy1017/ai7-harness/pull/843); reference-bearing review, writing and evaluation [#861](https://github.com/zhouy1017/ai7-harness/pull/861); precise material reasons [#914](https://github.com/zhouy1017/ai7-harness/pull/914) | wave 2 `6ea12aad`; wave 3 `08f006e2`; wave 9 `a206814c` |
| Task controls | Background analysis with Series and all-Books scopes [#869](https://github.com/zhouy1017/ai7-harness/pull/869), model clarification [#868](https://github.com/zhouy1017/ai7-harness/pull/868), Run controls, plan editing, 快速开始 and 停止 [#870](https://github.com/zhouy1017/ai7-harness/pull/870), policy v14/v15/set v11 [#867](https://github.com/zhouy1017/ai7-harness/pull/867) | wave 4 `e692641f` |
| Editorial-value evidence and fidelity | #812 case set and measured pass [#881](https://github.com/zhouy1017/ai7-harness/pull/881), edited-DOCX contract [#877](https://github.com/zhouy1017/ai7-harness/pull/877), readers [#876](https://github.com/zhouy1017/ai7-harness/pull/876) | wave 5 `2ad06a2d` |
| Web evidence chain | Backend evaluation, documents, slots and registry [#884](https://github.com/zhouy1017/ai7-harness/pull/884), policy v16/v17/set v12 [#886](https://github.com/zhouy1017/ai7-harness/pull/886), five adapters, 测试检索, AI7 webfetch and the frozen per-Run backend [#887](https://github.com/zhouy1017/ai7-harness/pull/887), declarations [#888](https://github.com/zhouy1017/ai7-harness/pull/888), external evidence retention with 来源译文 refusal and staleness [#889](https://github.com/zhouy1017/ai7-harness/pull/889) | wave 6 `b20c0260` |
| Retrieval | Similarity vectors, PDF text layer, 来源译文 [#897](https://github.com/zhouy1017/ai7-harness/pull/897), targeted retrieval and Exact Fetch [#895](https://github.com/zhouy1017/ai7-harness/pull/895), policy v18/v19/set v13 [#896](https://github.com/zhouy1017/ai7-harness/pull/896) | wave 7 `de8227ca` |
| Factual verification, second half | [#904](https://github.com/zhouy1017/ai7-harness/pull/904) | wave 8 `95fd12bf` |
| Proposal and Apply chain surfaces | [#903](https://github.com/zhouy1017/ai7-harness/pull/903) | wave 8 `95fd12bf` |
| Learning | House review-preference record and consumer [#913](https://github.com/zhouy1017/ai7-harness/pull/913), lineage, exclusion and remediation [#917](https://github.com/zhouy1017/ai7-harness/pull/917), policy v20/v21/set v14 [#915](https://github.com/zhouy1017/ai7-harness/pull/915) | wave 9 `a206814c` |
| Procedures and tasks | ADR 0090 [#921](https://github.com/zhouy1017/ai7-harness/pull/921), policy v22/v23/set v15 [#926](https://github.com/zhouy1017/ai7-harness/pull/926), Task Intent Drafts [#927](https://github.com/zhouy1017/ai7-harness/pull/927), procedure versions and Skill import [#923](https://github.com/zhouy1017/ai7-harness/pull/923), Series scope pins [#925](https://github.com/zhouy1017/ai7-harness/pull/925), custom analysis dimensions [#930](https://github.com/zhouy1017/ai7-harness/pull/930), foreign Skill updates [#932](https://github.com/zhouy1017/ai7-harness/pull/932) | wave 10 `2aee9baa` |
| Shell and settings | Sidebar and navigation [#943](https://github.com/zhouy1017/ai7-harness/pull/943), appearance [#941](https://github.com/zhouy1017/ai7-harness/pull/941), 用量 and shortcut remapping [#942](https://github.com/zhouy1017/ai7-harness/pull/942), notifications [#945](https://github.com/zhouy1017/ai7-harness/pull/945), diagnostics and crash record [#940](https://github.com/zhouy1017/ai7-harness/pull/940), help and legal texts [#946](https://github.com/zhouy1017/ai7-harness/pull/946) | wave 11 `fd809256` |
| Editor | 专注模式, editing protection, density and typography [#956](https://github.com/zhouy1017/ai7-harness/pull/956), 发现 center, save menu and 分析 panel [#954](https://github.com/zhouy1017/ai7-harness/pull/954), 交付包 zip export [#955](https://github.com/zhouy1017/ai7-harness/pull/955) | wave 12 `98742312` |
| Agent Workspace | Book-bound Agent 工作区 [#963](https://github.com/zhouy1017/ai7-harness/pull/963), first-run onboarding with a development sample Book [#962](https://github.com/zhouy1017/ai7-harness/pull/962) | wave 13 `117dc060` |
| Distribution | Data Version freeze, data-root marker and backup/rollback facts [#968](https://github.com/zhouy1017/ai7-harness/pull/968), unsigned Windows installer, portable zip, DMG command, channel-aware data location and self-check [#969](https://github.com/zhouy1017/ai7-harness/pull/969) | wave 14 `c2f4fff3` |

### Disclosed limits

The development plan and the pull requests above record these, and this record does not widen any of them:

- Default Execution Rules exist for baseline analysis, writing and review runs. Review gained its rule and 快速开始 in [#870](https://github.com/zhouy1017/ai7-harness/pull/870); the three evaluation contracts and dialogue carry none.
- The first-run onboarding imports exact `sample1` in development checkouts only. Packaged builds read 示例书尚未提供 and distribute no sample until the Owner designates a public-domain title and its exact text source (development plan row "Public-domain sample Book designation").
- The Agent 工作区 proposal round has fixture evidence only; its one live round was refused for an expired development credential.
- On the Windows host that produced the evidence, only the unsigned installer and the portable zip were built, and only the portable executable was self-checked. The DMG, the macOS launch form and the macOS self-check are unbuilt and unrun.

### Outside the recorded milestone boundary

This historical record adds nothing to the 2026-10-13 exclusion list. Its boundary commit excluded: Microsoft Word integration and legacy production-data migration; S66d house workflow gates; Rewind and Replay; 结构调整模式 and the Detached Manuscript Window; accessibility-specific settings beyond keyboard remapping; the workflow-definition branch, Skill catalog sources, trust tiers and sandboxing; plugin-provided analysis kinds; escalation and frontier Model Roles bound by default; code signing, notarization, release, `main` promotion and auto-update; and providers other than OpenCode Go and DeepSeek official.

### Post-1.0.0 Issues

The original deferred Issue lineage is listed below; current scheduling and successor Issue disposition are owned by the development plan:

- [#973](https://github.com/zhouy1017/ai7-harness/issues/973) OCR for scanned PDFs in the Material Index (#899 lineage)
- [#974](https://github.com/zhouy1017/ai7-harness/issues/974) Update through GitHub Releases (manual update posture today)
- [#975](https://github.com/zhouy1017/ai7-harness/issues/975) Plugin-provided analysis kinds (story 145, plugin part)
- [#976](https://github.com/zhouy1017/ai7-harness/issues/976) 结构调整模式 (ED-018)
- [#977](https://github.com/zhouy1017/ai7-harness/issues/977) Detached Manuscript Window (VIEW-016~024)
- [#978](https://github.com/zhouy1017/ai7-harness/issues/978) Workflow-definition branch (REUSE-055~062)
- [#979](https://github.com/zhouy1017/ai7-harness/issues/979) Skill catalog sources, trust tiers and sandboxing
- [#980](https://github.com/zhouy1017/ai7-harness/issues/980) S66d house workflow gates (WGATE-001~011, #415 lineage)
- [#981](https://github.com/zhouy1017/ai7-harness/issues/981) Rewind (回退并调整方向) and Replay reconsideration (CONT-002~012)

### What this record does not do

Naming this commit crosses no package version, tag, release, signing, notarization, `main` promotion or GitHub milestone. The consolidated Windows/macOS re-entry validation under ADR 0054 follows as a separate authorized Issue on integrated `dev` after this record lands. It validates the consolidated state without retrospectively backfilling earlier PR evidence.
