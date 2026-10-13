# AI7 Initial v1.0.0 Development Milestone scope

Status: Owner-confirmed on 2026-10-13 (decision record kept by the Commander outside the repository); landed by wave 1's documentation slice (#832). Under [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md) the boundary is crossed only when a separately authorized completion Issue and pull request name the exact `dev` commit containing this scope, followed by the consolidated Windows/macOS re-entry validation. Promotion to `main`, tags, packaging signatures, notarization and release stay separate.

The Owner defines 1.0.0 as **every designed capability** in the PRD, `docs/ui-ux-v2/editor-surfaces.md` and `docs/ui-ux-v2/requirements.md`, except the items listed under "Outside 1.0.0". Delivery order lives in the [development plan](development-plan.md); this file only fixes what is in and what is out.

## In scope (beyond what dev@97149432 already integrates)

| Area | Outcome | Decision |
| --- | --- | --- |
| Live non-web AI kinds | Dialogue, review categories, writing, three evaluation contracts, 润色这段, conflict regeneration on Go DeepSeek V4.1 Flash under developer-live and ordinary-production | #52, #809, #810, #429; D7, D18 |
| Local ordinary production | User credential, user data location, production launch path, Go + DeepSeek official routes, proxy setting | #811; D23, D27 |
| Cross-deliverable consistency | Category 9 executable when deliverables exist | #813 |
| Reference consumption | Withdrawal re-check at consumption; reference-bearing review/writing/evaluation | #759 |
| Task controls | Background analysis transmits in production with mandatory ceiling, Series and all-Books scopes; model-initiated clarification (one per unit); Run controls on Review Runs; plan editing for every task kind; 审阅 快速开始 and default rules for all kinds; 停止 as an alias of 取消 | D8, D11, D12 |
| Editorial-value evidence and fidelity | #812 measured case set; #814 edited-DOCX contract; #766 readers | P1 rows |
| Web evidence chain | Every usable search backend shipped in the product (development evaluation only excludes clearly unusable ones and ranks the rest); the user selects a backend in settings, can run a built-in 测试检索 per backend, and each Run freezes the backend used; keys and per-call fees accepted; AI7-owned webfetch; declarations aligned; external evidence retention with 来源译文 and staleness | #473, #744, #425; D24 |
| Retrieval | Similarity vectors with a local embedding model, PDF text layer, 来源译文; targeted retrieval + Exact Fetch as a tool for every model task | #428; D5, D20 |
| Factual verification, second half | Evidence comparison, three assurance levels (default 标准核查; offline degrades to 快速整理 with disclosure), verification review decisions, correction proposals | D9 |
| Proposal and Apply chain surfaces | Dedicated review workspace above 20 suggestions, draft decisions, filtered batch decisions, atomic groups, four-state Apply cards | D10 |
| Learning | House review-preference record as the first consumer; lineage, exclusion and remediation; quality signals from edits | #427, #61, #62; D22 |
| Procedures and tasks | Task Intent Draft + S17b; cross-project scope and Series tasks for real kinds; procedure versions; foreign Skill updates; Skill import/validation; procedure recommendation; custom analysis dimensions driven by procedures | #423, #64, #66, #89; D6, D21 |
| Shell and settings | 跟随系统/浅色/深色; two-level sidebar, three destinations, Book navigation groups, pinned/recent; 用量 page; shortcut remapping; OS notifications default off; diagnostics bundle and local crash record; help and legal texts | D13–D16, D27 |
| Editor | 专注模式; editing-protection read-only state; density and typography presets; Book-level 发现 center; ED-052 save menu; paragraph 分析 side panel with 分析有新发现 hint; 交付包 zip export | D17, D18 |
| Agent Workspace | Book-bound DSH Agent Workspace, one bounded journey; first-run onboarding with a bundled public-domain sample Book | #90; D27 |
| Distribution | Buildable unsigned Windows installer + portable and macOS DMG; Data Version frozen at release; pre-upgrade backup and rollback; manual update | D25, D26 |

## Outside 1.0.0 (confirmed exclusions and deferrals)

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

## TODO after 1.0.0

OCR for the Material Index; auto-update via GitHub Releases; plugin analysis kinds; 结构调整模式; Detached Manuscript Window; workflow-definition branch; Skill catalog/trust/sandbox; S66d when a house profile exists; Rewind/Replay reconsideration.
