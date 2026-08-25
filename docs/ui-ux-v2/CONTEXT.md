# AI7 V2 UI/UX

Status: **candidate context under Issue #8 missing-design completion and the response-presentation delta; presentation authority only**

The candidate language for how professional editors perceive and operate AI7. It owns presentation concepts only and does not redefine editorial or execution authority.

## Language

**AI7 Desktop Interaction Language** (`AI7 桌面交互语言`):
The AI7-owned visual and interaction grammar that intentionally feels familiar to Codex Desktop through calm surfaces, progressive disclosure, persistent context, focused work, interruptible activity, and reviewable outcomes while retaining AI7's editorial object model and named authorities.
_Avoid_: Codex clone, Codex layout, generic chat shell, component copy

**Interaction Reference Evidence** (`交互参考证据`):
An external screenshot or observed interaction used to identify desirable experience qualities without making its geometry, content hierarchy, assets, source, branding, or product semantics an AI7 baseline.
_Avoid_: UI specification, implementation baseline, reusable asset

**Book-anchored Workbench** (`图书锚定工作台`):
The AI7 workspace model in which a Book is the stable editorial context, one Book-owned manuscript or Editorial Deliverable is the active work object, and Tasks enter as context-bound activity rather than peer conversations.
_Avoid_: folder workspace, conversation list, task-first shell

**Book Library** (`书库`):
The searchable user-facing collection of every locally available exact Book and the stable global entry for opening or creating one, without granting task scope, publication status, or filesystem meaning merely by listing it.
_Avoid_: folder browser, manuscript list, task scope, published-book catalog

**Active Work Object** (`当前工作对象`):
The one manuscript, Editorial Deliverable, proposal comparison, evidence review, workflow record, or other authoritative AI7 object occupying the primary central surface at a given moment.
_Avoid_: current chat, renderer authority, whole Book

**Task Context Layer** (`任务上下文层`):
The presentation of Task Intent, Plan, Run activity, clarification, and outcome in relation to an exact Book and work object without allowing the Task or Harness Session to replace that object's authority.
_Avoid_: chat workspace, task ledger UI, Harness Session view

**Interactive Editorial Dialogue** (`交互式编辑问答`):
A user-facing sequence of contextual questions and streamed answers bound to one exact Book and active manuscript, deliverable, source, or other work object, without becoming a generic chat product root or a software-quality-assurance workflow.
_Avoid_: QA test, generic chatbot, Harness Session transcript, unowned conversation

**Global Attention View** (`全局待处理视图`):
A cross-Book projection of work requiring awareness or action, whose items navigate back to their authoritative Book, Task, decision, Effect, or workflow record.
_Avoid_: global workflow, third ledger, inbox authority

**Continuity-first Return** (`连续工作续接`):
The launch and restart behavior that first exposes recovery requiring confirmation and otherwise restores the last exact Book, Active Work Object, and manuscript position instead of routing every session through a generic home page.
_Avoid_: dashboard-first launch, silent recovery, most-recent notification

**Recovery Attention State** (`恢复待确认状态`):
A startup state indicating that recovered working content or recovery evidence requires explicit user understanding before ordinary continuation, without implying that a Recovery Snapshot or recovered text has already replaced the active manuscript.
_Avoid_: automatic restore, unsaved-file dialog, recovery completed

**Book Recovery Workspace** (`图书恢复工作区`):
The affected-Book central workspace that compares exact recoverable manuscript states and lets the editor inspect, defer, copy/export, or restore one as a new descendant without blocking access to every other Book.
_Avoid_: system crash modal, generic backup manager, filesystem recovery tool, automatic restore

**Recovered Working State** (`恢复的工作状态`):
The most recent working manuscript state reconstructed from acknowledged durable Edit Journal entries after interruption, explicitly distinguished from a clean Manuscript Checkpoint, Milestone Version, or Recovery Snapshot.
_Avoid_: unsaved memory buffer, latest checkpoint, active manuscript overwrite, successful recovery

**Recovery State Comparison** (`恢复状态对比`):
The exact comparison of a Recovered Working State with relevant Milestone Version/Manuscript Checkpoint and any applicable verified Recovery Snapshot, showing branch, last acknowledged persistence time, change extent, verification, and limitations before restoration.
_Avoid_: generic file diff, three-way Proposal merge, backup list, proof every keystroke survived

**Restore as New Version** (`恢复为新版本`):
The user-facing action that restores selected recovery material by creating a new descendant Manuscript Revision while retaining all prior revisions, journal evidence, checkpoints, snapshots, and unresolved newer material.
_Avoid_: overwrite current, rollback history, reopen file, mark snapshot current

**Recovered-state Review Status** (`恢复状态待复核`):
The persistent post-restoration status expressed as `当前为恢复的工作状态`, remaining until the editor reviews the descendant content and deliberately saves a new Milestone Version.
_Avoid_: recovery failure, unsaved status, automatic milestone, proof of complete recovery

**Two-level Contextual Sidebar** (`两级上下文侧栏`):
The single collapsible navigation surface combining stable global destinations with pinned/recent Book switching and navigation for the current Book, without introducing a second permanent sidebar or an all-Books object tree.
_Avoid_: filesystem tree, two permanent left rails, conversation list

**Book Convenience View** (`图书便捷视图`):
A non-authoritative selection of pinned or recently used Books that accelerates switching while the searchable Book library remains the route to the complete collection.
_Avoid_: Working Corpus, source scope, Book ownership list

**Book Work Overview** (`图书工作概览`):
The Book-owned orientation surface that foregrounds the sole primary Manuscript when present, or explicitly shows `尚无稿件` and the first-Manuscript entry when absent, while presenting related Editorial Deliverables independently and linking to contextual Workflow, Task, Evidence, Proposal, source, Series, and recovery records.
_Avoid_: Book dashboard, Book-wide workflow, conversation home

**Manuscript Visual Anchor** (`稿件视觉主锚`):
The deliberate primary slot in a Book Work Overview that either shows the exact sole Manuscript continuation state or, for a zero-Manuscript Book, shows `尚无稿件` with `导入首份稿件` and no fabricated branch, revision, journal, checkpoint, or recovery state. It never makes related Editorial Deliverables share a Workflow Instance or lose their own authority.
_Avoid_: only deliverable, Book-wide phase owner, manuscript truth authority

**Contextual Work Lens** (`上下文工作入口`):
A Book- or deliverable-bound entry that summarizes and opens related Workflow, Task, Evidence, Proposal, source, Series, or recovery records without becoming their authority or a peer product root.
_Avoid_: authoritative summary, global object, generic activity feed

**Actionable Attention Count** (`待处理计数`):
The unresolved Global Attention item count limited to exceptions requiring confirmation and exact editor decisions, excluding routine running, paused, and completed work.
_Avoid_: notification count, Run count, unread count

**Attention Projection Item** (`待处理投影项`):
A Global Attention pointer showing the exact Book, work object, named state or decision, reason for attention, and next action while delegating all authority and mutation to its owning record.
_Avoid_: inbox record, approval request, copied task state

**Manuscript Editing Mode** (`稿件编辑模式`):
The normal work-surface state in which the Manuscript remains dominant, the sidebar may be visible or collapsed, the contextual supporting surface is closed by default, and task entry remains compact.
_Avoid_: document-only application, chat mode, workflow phase

**Contextual Collaboration Mode** (`上下文协作模式`):
The work-surface state in which a supporting side surface exposes Task, Evidence, Proposal, or Workflow context while the Manuscript and its exact relevant selection remain visible.
_Avoid_: split authority, chat workspace, side-by-side proposal comparison

**Dedicated Work Workspace** (`专门工作区`):
A temporary central surface for large or structural proposal comparison, factual review, multi-evidence comparison, or Manuscript Conflict resolution that preserves exact Book and object context plus a direct return to the Manuscript.
_Avoid_: new product root, detached tool window, permanent mode

**Editorial Focus Mode** (`编辑专注模式`):
A distraction-reduced presentation that hides navigation, contextual support, and task entry while retaining the Manuscript, necessary persistence/recovery state, and deliberate controls for restoring hidden surfaces.
_Avoid_: offline mode, pause, full-screen authority

**Continuous Manuscript Experience** (`连续稿件体验`):
The editor-facing perception of one uninterrupted Manuscript across bounded rendering windows, with stable text, cursor, selection, and Chinese IME continuity and without technical pagination or load-more interaction.
_Avoid_: whole manuscript in renderer, page chunking, Manuscript Block UI

**Dual-scale Manuscript Navigation** (`双尺度稿件导航`):
The separation between fine local reading scroll around the current bounded window and indexed whole-manuscript location and jump controls that expose structural and global position without pretending the local scroll thumb represents the complete Manuscript.
_Avoid_: one misleading scrollbar, loaded-window navigation, technical window selector

**Whole-manuscript Position** (`全稿位置`):
The user-readable structural and proportional location of the current editor anchor within the complete Manuscript, derived from the exact revision and its outline/index projections.
_Avoid_: local scroll offset, line number, renderer position

**Manuscript Outline Navigator** (`稿件大纲导航器`):
The virtualized hierarchical projection used to browse and jump through a complete Manuscript while remaining distinct from authoritative manuscript structure and from structure-changing commands.
_Avoid_: manuscript authority, folder tree, always-editable outline

**Whole-manuscript Position Rail** (`全稿位置轨道`):
The compact editor-edge projection of coarse manuscript position and sparse markers for relevant search hits, findings, Proposals, and comments across the complete Manuscript.
_Avoid_: local scrollbar, minimap of loaded text, status authority

**Structure Adjustment Mode** (`结构调整模式`):
An explicitly entered outline state for editor-authored structural moves or hierarchy changes that discloses the affected text range and retains durable undo; model-suggested structural changes remain Proposals.
_Avoid_: normal outline navigation, drag-by-default, proposal application

**Search and Jump Entry** (`搜索与跳转入口`):
The persistent right-navigation entry that opens manuscript-wide text search and indexed location controls without replacing the Manuscript or implying a broader source scope.
_Avoid_: global search, source search, generic command palette

**Manuscript Search and Jump Panel** (`稿件搜索与跳转面板`):
The local right-side surface for revision-aware text, heading, and exact-position discovery within the current Manuscript, optionally narrowed to the current chapter or exact selection.
_Avoid_: global search, source retrieval, model research

**Search Return Position** (`搜索返回位置`):
The exact manuscript location and selection retained before following a search or jump result so the editor can deliberately return to the prior work context.
_Avoid_: browser history, undo, current result

**Stale Search Result** (`已过期搜索结果`):
A search result whose bound Manuscript Revision or exact range no longer matches current working state and therefore cannot silently retarget or support a consequential action.
_Avoid_: approximate match, current result, failed search

**Replacement Preview** (`替换预览`):
The revision-bound review of search text, replacement text, scope, matching rules, total count, representative context, and included/excluded matches before a selected or whole-manuscript replacement may commit.
_Avoid_: replacement completed, search results alone, confirmation dialog

**Frozen Match Set** (`冻结匹配集合`):
The exact revision- and range-bound set of displayed matches selected for one replacement transaction, whose meaning cannot be widened or silently recomputed during commitment.
_Avoid_: current query, live results, approximate matches

**Atomic Manuscript Replacement** (`原子稿件替换`):
One service-executed manuscript edit that revalidates a Frozen Match Set and writes every selected replacement or none, recording success as one durable undoable Edit Journal transaction rather than a Manuscript Checkpoint.
_Avoid_: best-effort replace all, partial apply, checkpoint

**Live Manuscript Selection** (`当前稿件选择`):
The ephemeral cursor or text range currently selected for direct editing, which gains no durable Task, Evidence, finding, comment, Proposal, or authority meaning until an explicit anchoring action occurs.
_Avoid_: Pinned Manuscript Range, task scope, proposal target

**Pinned Manuscript Range** (`已固定稿件范围`):
An explicitly created exact reference to one Book, Manuscript Branch, Manuscript Revision, stable block identity, Unicode range, and text digest for later navigation or binding to a specific record. Journal-newer text cannot become this reference until Task Input Revision Preparation materializes its exact revision; before then, the Task Intent Draft may show only a non-authoritative pending range.
_Avoid_: copied excerpt, current selection, fuzzy anchor

**Manuscript Range Set** (`稿件范围集合`):
An editor-visible ordered collection of one or more Pinned Manuscript Ranges assembled for one Task or other supported context without automatically granting each member to unrelated records.
_Avoid_: Run Source Scope, whole chapter, clipboard collection

**Drifted Manuscript Range** (`已变化稿件范围`):
A Pinned Manuscript Range whose target text or structure no longer exact-resolves in the relevant current state and therefore requires difference review, explicit reselection, or removal.
_Avoid_: updated selection, approximate match, stale search result

**Editing Persistence Status** (`编辑持久化状态`):
The combined user-readable state of pending or acknowledged Edit Journal writes, changes since the latest Manuscript Checkpoint, and any durability failure, expressed without collapsing journal persistence into checkpoint creation.
_Avoid_: generic saved state, sync status, checkpoint status alone

**Editing Protection Mode** (`编辑保护模式`):
The temporary affected-manuscript state entered when local journal durability cannot be confirmed, allowing only strictly bounded process-local typing while preventing navigation or consequential work that could discard or fork the at-risk content.
_Avoid_: offline mode, ordinary autosave delay, full local editing, Recovery Workspace

**Last Durable Edit Boundary** (`最近持久写入边界`):
The latest exact Edit Journal acknowledgement—shown with time and covered state—from which AI7 can guarantee reconstruction, distinct from newer process-local input.
_Avoid_: latest keystroke, Milestone Version, estimated save time, renderer cache

**At-risk Edit Extent** (`可能未持久化范围`):
The currently known amount and location of input newer than the Last Durable Edit Boundary that remains only in the bounded process-local safety buffer and therefore cannot be promised recoverable after process loss.
_Avoid_: lost content, whole manuscript, unsaved filename, recovered working state

**Bounded Edit Safety Buffer** (`有界编辑保护缓冲`):
The strictly capacity-limited process-local buffer that temporarily preserves continuing IME/text input while AI7 retries journal persistence, without becoming a durable record or expanding the recovery guarantee.
_Avoid_: Edit Journal, Recovery Snapshot, unlimited offline editing, renderer manuscript authority

**Protective Read-only State** (`保护性只读状态`):
The affected-manuscript state entered when AI7 can no longer safely accept more process-local input, preserving inspection and salvage actions while blocking further mutation until durability is restored or the at-risk content is handled.
_Avoid_: permission restriction, ordinary read-only source, locked Book, recovery completed

**Journal Save Action** (`保存当前编辑`):
The native shortcut—`Ctrl+S` on Windows or `⌘S` on macOS—or menu action that requests immediate persistence of pending edits to the Edit Journal and confirms only the journal acknowledgement, never a Manuscript Checkpoint.
_Avoid_: create checkpoint, export, save file copy

**Milestone Version Suggestion** (`里程碑版本建议`):
A non-authoritative prompt to save current exact working content as a labeled Milestone Version before or after consequential editing work, which never implies that a checkpoint/milestone already exists or blocks ordinary editing by itself.
_Avoid_: automatic milestone, required approval, recovery snapshot

**Manuscript Import Target** (`稿件导入目标`):
The explicitly selected new-Book draft or eligible exact existing Book that would own the result of one staged file import; context may recommend a target but never selects one implicitly.
_Avoid_: file destination, current folder, last-open Book, source-only relationship

**Book Creation Draft** (`图书创建草稿`):
The non-authoritative proposed Book identity and initialization defaults used for explicit standalone Book creation, inside a new-Book manuscript import, or inside source-bound Book creation. Its standalone variant may create an intentionally empty Book, its manuscript-import-bound variant becomes authoritative only with the first Manuscript, and its source-bound variant becomes authoritative only with the first Source Version while the Book remains zero-Manuscript.
_Avoid_: Book, silently committed empty Book, Manuscript Import Record, Source Acquisition Record, partial import

**Review Before Book Creation** (`新建图书前确认`):
The consequence-first creation surface showing exact Book identity/defaults and named non-effects before either an intentional empty Book is created alone or a source-bound zero-Manuscript Book and its first Source Version are created atomically. The source-bound variant additionally shows exact retained content, provenance and Source Acquisition Record; neither variant silently inherits manuscript-import objects.
_Avoid_: Review Before Import, Review Before Source Retention for an existing Book, Book completion, optimistic creation

**Book Title Suggestion** (`建议书名`):
A source-labeled editable title candidate extracted locally during preflight but presented as Book metadata only after the editor selects `新建图书`: non-empty document title metadata supplies the primary candidate, filename stem is its fallback, and bounded title-bearing early content may supply separately labeled alternatives.
_Avoid_: authoritative Book title, model-generated title, filename identity, silent first-heading inference

**Exact Import Match** (`精确导入匹配`):
A local disclosure that a staged file exactly matches either the immutable original-file identity of a previously imported Source Version or its exact parsed content and structure, with the matched Book, Source Version, and record visible but no target or relationship selected automatically. Membership in the same source family or lineage is not exact identity by itself.
_Avoid_: filename match, fuzzy similarity, automatic deduplication, reimport decision

**Filename Collision** (`文件名冲突`):
The disclosed condition in which a staged file has the same display filename as prior material but different exact content, carrying no duplicate identity or blocking authority by itself.
_Avoid_: Exact Import Match, overwrite warning, duplicate proof

**Import Fidelity Review** (`导入保真审阅`):
The local pre-commit review that classifies each supported document-content class and round-trip behavior as fully preserved, degraded with exact disclosure, or unsupported for editable Manuscript import.
_Avoid_: import log, successful import, generic preview

**Import Degradation Decision** (`导入降级决定`):
The editor's explicit unselected decision to proceed with the exact material degradations disclosed by one Import Fidelity Review for the named import, without accepting unsupported or undisclosed loss.
_Avoid_: generic continue, silent loss waiver, standing preference

**Import Draft Recovery** (`导入草稿恢复`):
The restart state that offers explicit continuation or abandonment of a verified non-authoritative import draft after revalidating its staged source, target relationship, and consequential review.
_Avoid_: automatic resume, successful import, manuscript recovery, authority restoration

**Reimport Comparison** (`重新导入对照`):
The staged comparison that uses prior Source Version, current Manuscript Revision, and the staged document when lineage is verified, or only current and staged states under Source Relationship Unconfirmed; exact mappings and unresolved ambiguities remain visible before any descendant revision may be created.
_Avoid_: overwrite, synchronization, automatic remap

**Review Before Import** (`导入前确认`):
The relationship-specific consequence-first pre-commit surface binding the exact target, staged source, fidelity or comparison result, records to create, and named non-effects before initial Manuscript import or reimport. File retention as source material uses Review Before Source Retention even when entered from manuscript-import preflight.
_Avoid_: Import Fidelity Review, Book creation completion, Effect Approval, Manuscript Import Record

**Review Before Source Retention** (`保存来源材料前确认`):
The consequence-first pre-commit surface binding one exact existing target Book, the complete retained-content boundary, source type, provenance, resulting Source Version and Source Acquisition Record plus named non-effects before the file-specific `作为来源材料导入` or the pasted/entered-and-research `保存为来源材料`; the file path retains the Source Import Record specialization.
_Avoid_: Review Before Import, source preview, Task evidence persistence, Run Source Scope, automatic source capture

**Context-bound Task Composer** (`上下文绑定任务输入框`):
The compact manuscript- or deliverable-adjacent entry that captures an editor's requested work while visibly retaining its exact Book, work object, revision, and explicitly selected range context.
_Avoid_: chat box, model prompt, Run input

**Task Intent Draft** (`任务意图草稿`):
The durable editable pre-Run state created by `准备任务`, containing requested goal, target, expected outcome, and selected context without yet creating a Run, model transmission, or authority record.
_Avoid_: Task Intent authorization, Run, model message

**Task Input Revision Preparation** (`为任务保存修订版`):
The low-ceremony pre-authorization transition that, whenever a Task would use acknowledged Edit Journal state newer than the latest Manuscript Revision as target, range, source, or evidence, creates an existing Manuscript Checkpoint with purpose `Task Input / 任务输入`; it exact-resolves every attached prior-revision pin and pending manuscript target/range/source/evidence reference on the resulting revision, creates new task-bound pins without mutating original pins or provenance, and blocks planning when a changed or ambiguous reference needs explicit reselection or removal.
_Avoid_: a new checkpoint type, Journal Save, Milestone Version, Signoff, model dispatch

**Prepare Task Action** (`准备任务`):
The transition from compact task text to the editable right-side Task Intent Draft, which invokes no model and grants no Run or Effect authority.
_Avoid_: send, run, authorize, submit to provider

**Task Skill Recommendation** (`任务技能建议`):
An AI7-proposed fit between the visible Task Intent Draft and one or more available Task Skills, including rationale, required inputs, expected outcome, and possible Proposal/Effect classes without selecting runtime authority.
_Avoid_: Task Skill Activation, Capability Grant, automatic skill choice

**Reusable Procedure Capture** (`保存为可复用工序`):
The user-invoked presentation flow that turns selected prior editorial work into one classified reusable-asset draft or rule proposal without persisting a generic object or granting runtime authority.
_Avoid_: macro recording, Plugin installation, automatic skill activation

**Reusable Procedure Classification Preview** (`可复用工序分类预览`):
The compact pre-save explanation that recommends exactly one of Default Execution Rule, Task Skill Candidate, Workflow Profile Draft or Developer Capability Proposal and permits correction where the underlying object boundary remains valid.
_Avoid_: saved asset, generic template type, authority decision

**Procedure Capture Source Set** (`工序捕获来源集合`):
The exact user-selected completed Run or ordered completed user-visible editorial steps from which reusable structure may be extracted, excluding hidden Harness activity and unsuccessful instance outcomes by default.
_Avoid_: recent-activity feed, transcript, whole Book history

**Reusable Procedure Extraction Preview** (`可复用工序提取预览`):
The editable pre-save projection of reusable purpose, steps, branches, parameters and declared requirements together with an explicit account of instance data and authority that will not enter the resulting asset.
_Avoid_: saved candidate, Run replay, copied Task Outcome

**Automation Center** (`自动化中心`):
The global cross-type management projection for Task Skills, Workflow Profiles, Default Execution Rules and Developer Capability Proposals, preserving each object's own lifecycle and authority rather than persisting one generic automation type.
_Avoid_: automation runtime, generic asset, Plugin marketplace

**Automation Version Group** (`自动化版本组`):
The management grouping of all exact versions belonging to one stable typed automation identity, including status, default eligibility and version-specific actions without merging their records.
_Avoid_: mutable latest object, Book Series, interchangeable asset family

**Version-linked Work and Delivery View** (`版本关联工作与交付视图`):
The read/navigation projection from one exact automation version to the Runs, Workflow Instances, Editorial Deliverables, Editorial Artifacts and Delivery Packages that already reference it.
_Avoid_: copied deliverable archive, source scope, authority inheritance

**Latest Eligible Version Resolution** (`最新可用版本解析`):
The deterministic selection of the newest enabled and compatible version within one stable Task Skill identity for a new use that has not yet been pinned; resolution freezes an exact version before authorization.
_Avoid_: latest candidate, silent upgrade of pinned work, compatibility fallback after authorization

**Version Removal Preview** (`版本删除影响预览`):
The exact pre-deletion explanation of current/future availability, active blockers, removable package bytes, retained historical identity and affected version links.
_Avoid_: generic confirmation dialog, history erasure, cascade delete

**Historical Version Stub** (`历史版本存根`):
The minimal immutable identity, type, version, digest/provenance and retired/removal state retained after a referenced automation version is removed from future availability, so authoritative history and deliveries remain explainable.
_Avoid_: installed package, executable fallback, copied historical content

**Task Skill Catalog Availability** (`任务技能目录可见范围`):
The local-instance visibility of an enabled Task Skill in Automation Center and manual selection, independent of whether AI7 recommends it or a Run may read any source.
_Avoid_: Run Source Scope, Task Skill Activation, provider availability

**Task Skill Recommendation Applicability** (`任务技能推荐适用范围`):
The optional Book, Series, Editorial Deliverable-type or Workflow-phase filter controlling where AI7 proactively recommends an enabled Task Skill, without preventing compatible manual selection or granting source access.
_Avoid_: capability scope, source scope, enablement, mandatory eligibility

**Workflow Profile Draft** (`工作流程方案草案`):
An editable non-active proposal for a reusable Workflow Profile definition, distinct from every installed profile version and every Deliverable's current Workflow Instance.
_Avoid_: Workflow Instance, active profile version, Task Skill Candidate

**Developer Capability Proposal** (`开发能力建议`):
A non-executing developer-track record describing a missing code-bearing capability and possible implementation path, which may mention a Plugin without creating, installing, enabling or authorizing one.
_Avoid_: Plugin, Capability Implementation, user-enabled extension

**Progressive Task Fields** (`渐进任务字段`):
The required structured inputs revealed inside the Task surface only when the current Task Skill and intent need them, while optional detail remains collapsed and the original natural-language goal stays visible.
_Avoid_: mandatory wizard, hidden prompt fields, Plan Preview

**Quick Start** (`快速开始`):
A user-invoked Task shortcut that skips the separate Task Intent review surface while still creating the exact Task Intent, Execution Plan, Plan Envelope, and Run Authorization records before execution begins.
_Avoid_: send without authorization, generic chat, Effect Approval shortcut

**Default Execution Rule** (`默认直接运行规则`):
A versioned user-approved rule that permits a future user-initiated Task matching its exact Task Skill, intent pattern, applicability scope, provider/egress, Run Budget Ceiling state, outcome, and Effect-class envelope to receive an exact per-Run Run Authorization and start without separate Task Intent review.
_Avoid_: standing Run Authorization, auto-apply rule, model confidence

**Task Pattern Confidence** (`任务模式信心`):
The editor's practical confidence that a repeatable task pattern normally produces useful reviewable results, sufficient to reduce repeated Run-review interaction but never to establish factual truth or approve later Effects.
_Avoid_: factual confidence, model score, automatic authority

**Default-executed Run** (`默认直接运行任务`):
A user-initiated Run whose exact per-Run authorization was issued after deterministic matching and preflight under one identified Default Execution Rule version, without a separate Task Intent review interaction.
_Avoid_: background automation, standing authorization, auto-applied result

**Task Target Card** (`任务处理目标卡`):
The exact visible Book, manuscript or Editorial Deliverable, branch/revision, and selected range or outcome target that a Task may analyze, produce for, or mutate according to its later grants.
_Avoid_: source scope, current editor tab, provider context

**Source Scope Builder** (`来源范围选择器`):
The product-record interface for reviewing a Task Skill's minimum readable-source recommendation and explicitly adding or removing exact current-Book, Series, Cross-project, and approved-memory sources before Run Source Scope freezes, while applying the current effective Series Retrieval Exclusions both before authorization and again at later read/payload guards.
_Avoid_: filesystem picker, whole workspace, mutation scope

**Potential Provider Data Summary** (`模型可能接收内容摘要`):
The user-readable maximum categories and source boundaries that the configured provider may receive for the planned Run, distinct from local readability and from the exact final payload later admitted by the egress gate.
_Avoid_: actual payload log, Run Source Scope, Public Release Permission

**Editorial Plan Summary** (`编辑计划摘要`):
The concise six-part human projection of one exact Execution Plan and Plan Envelope, covering goal/outcome, target/sources, business steps, editor-participation points, provider/budget, and possible results/Effects without exposing Harness mechanics.
_Avoid_: machine plan, Run Authorization, task transcript

**Plan Boundary Split** (`计划边界分栏`):
The paired presentation of `运行中可调整` items and material changes that require suspension, Plan Revision, and renewed Run Authorization.
_Avoid_: flexible plan, blanket permission, Plan Revision itself

**Editor Participation Point** (`编辑者参与点`):
A planned moment when execution may need an exact Clarification Request, Proposal Decision, Review Decision, Effect Approval, or other named editor action, without implying that the action is already requested or granted.
_Avoid_: generic approval step, model question, completed decision

**Inline Run Authorization Bar** (`内联任务运行授权栏`):
The sticky Plan Preview action region that summarizes the exact current Run boundary and offers exactly one applicable start action—`授权并开始任务` for immediate dispatch or `授权并在联网后开始` for an eligible deferred start—without a second modal confirmation.
_Avoid_: approval dialog, Quick Start, Effect Approval bar

**Run Authorization Readiness** (`任务运行授权就绪状态`):
The current preflight condition for the displayed Run Authorization action. Immediate start requires exact target/source versions, plan, provider/fallback binding, outbound category, exact Run Budget Ceiling state, governing constraints, and live credential/service readiness. Deferred start requires the same locally fixed authority boundary plus an exact Credential Reference; live credential/service readiness is postponed to Reconnect Preflight rather than guessed offline.
_Avoid_: provider online status, Run started, plan accepted

**Offline Task Preparation** (`离线任务准备`):
The provider-free local ability to draft Task Intent, select locally available context, and inspect the portions of Plan Preview derivable from current authoritative configuration without implying live Provider Preflight or execution readiness.
_Avoid_: offline model execution, frozen plan guarantee, Run Authorization, local editing mode

**Start When Online Action** (`授权并在联网后开始`):
The explicit alternate Run Authorization action that creates one exact Run and permits it to enter scheduling automatically after connectivity returns only if Reconnect Preflight confirms the unchanged authorized boundary.
_Avoid_: background preference, Default Execution Rule, automatic retry, saved Task draft

**Model Selection Strip** (`模型选择条`):
The compact primary Task control for choosing a Model Role and visible model capability requirements without exposing raw provider/model catalogs or consuming a full plan section.
_Avoid_: raw model picker, quality slider, Provider settings

**Model Capability Requirement** (`模型能力要求`):
A user-understandable requirement or preference for model work, such as long-form Chinese editing, multi-source synthesis, difficult reasoning, or latency sensitivity, used by Provider Preflight without granting an AI7 Capability or factual authority.
_Avoid_: AI7 Capability, Capability Grant, model truth level

**Provider and Budget Disclosure** (`模型服务与预算披露`):
The compact always-reachable readiness summary for resolved provider/model, connection, outbound category, fallback presence, reliable estimate, and exact Run Budget Ceiling state. The default value is displayed as `未设置任务预算上限`, while a Provider Account Limit is separately named and may remain `未知 / 提供方未返回`; full details stay in secondary Task detail and Settings/Usage surfaces.
_Avoid_: primary model picker, billing settings, hidden provider state, `免费`, provider-unlimited claim

**Response Presentation Mode** (`响应呈现模式`):
The explicit per-task-type presentation contract selecting `Waiting Only` or `Interactive Stream`; every task defaults to waiting-only, and only an expressly classified Interactive Editorial Dialogue may stream its current user-facing answer.
_Avoid_: Policy Document, provider-token mode, output-length inference, per-Run user preference

**Run Activity Header** (`任务运行状态栏`):
The compact current-Run projection showing the editorial business phase, current work object, last meaningful update, and exact wait reason when present, with immediate access to currently valid Run controls.
_Avoid_: technical status console, Harness Session header, generic spinner

**Editorial Milestone Timeline** (`编辑里程碑时间线`):
The expandable chronological projection of durable or meaningful business events such as source review, evidence comparison, candidate creation, clarification, interruption, continuation, and outcome, without exposing raw model reasoning or technical execution traces.
_Avoid_: chain of thought, tool log, Harness event stream

**Live Reasoning Summary** (`实时思路摘要`):
A transient user-facing summary of the approach, checks, evidence comparison, and explicit uncertainty currently shaping one Interactive Editorial Dialogue answer; it is automatically hidden when the formal answer begins and never claims to expose raw internal reasoning.
_Avoid_: chain of thought, system prompt, provider reasoning tokens, tool parameters, factual evidence

**Interactive Answer Stream** (`交互回答流`):
The progressive formal answer of an Interactive Editorial Dialogue, rendered in complete semantic text fragments and atomic structured items while source-bound citations appear only after binding; the unfinished stream creates no Proposal, factual conclusion, authoritative record, or executable action.
_Avoid_: raw token stream, partial structured record, unbound citation, completed authoritative result

**Incomplete Dialogue Answer** (`未完成回答`):
The readable and copyable complete semantic fragments preserved after an Interactive Answer Stream is stopped or interrupted, visibly carrying its exact incomplete reason and never qualifying as a formal answer, factual conclusion, Proposal, Learning Material, or executable action.
_Avoid_: completed answer, failed empty turn, authoritative result, silently resumed stream

**Dialogue Answer History** (`问答记录`):
The recoverable, non-authoritative joined presentation of questions, completed formal answers, and Incomplete Dialogue Answers under one exact Book, work object, and Task context. Exact Execution Bindings and Harness Execution Spans resolve the presentation to model messages and attempt history owned only by the Harness Session Ledger; it copies no transcript into the AI7 Task Ledger and creates no third ledger. It excludes Live Reasoning Summary and grants no factual, manuscript, Proposal, learning, or execution authority.
_Avoid_: raw transcript, hidden reasoning archive, generic chat history, authoritative editorial record, third ledger, copied transcript

**Usable Candidate Stream** (`可用候选结果流`):
The umbrella presentation of provisional content or structured intermediate results that an editor can inspect only when the explicit Response Presentation Mode permits progressive display. Under the current allocation, provider-generated answer content enters it only as an Interactive Answer Stream; ordinary Runs remain Waiting Only, and appearance never promotes content to an authoritative artifact, Proposal Decision, factual conclusion, or committed Effect.
_Avoid_: default provider stream, model thoughts, authoritative result, auto-applied proposal

**Measured Run Progress** (`可测任务进度`):
Exact completed-versus-total progress shown only when the work units are semantically comparable and the denominator is real and stable enough to remain meaningful; otherwise AI7 reports stage and milestones without a percentage.
_Avoid_: estimated spinner percentage, model confidence, workflow completion

**Book-grouped Run Overview** (`按图书分组的任务概览`):
The Global Attention projection that groups queued, running, paused, and attention-requiring Runs beneath their authoritative Books while preserving each Run's exact target and state.
_Avoid_: thread list, global task authority, cross-Book source scope

**Current Book Run Switcher** (`当前图书任务切换器`):
The compact control for selecting which one of the current Book's concurrent Runs is expanded in the right Task surface without pausing, reprioritizing, or changing any Run merely by switching the projection.
_Avoid_: conversation tabs, scheduler control, Task history

**Foreground Run Projection** (`前台任务投影`):
The one Run activity surface currently expanded for inspection in the active Book, distinct from execution priority and from whether other Runs continue in the background.
_Avoid_: foreground process, highest-priority Run, exclusive execution

**Background Answer Wait** (`等待回答`):
The compact background projection of an active Interactive Editorial Dialogue turn, hiding its Live Reasoning Summary and Interactive Answer Stream while provider work may continue unchanged and restoring received complete fragments when the user returns.
_Avoid_: Connectivity Wait State, Run Capacity Wait, pause, cancellation, provider inactivity

**Run Capacity Wait** (`等待运行名额`):
The explicit queued condition in which an authorized Run is waiting for instance concurrency capacity, shown without a position or duration unless that value is stable and authoritative.
_Avoid_: provider activity, Run Budget Ceiling, Provider Account Limit, paused Run, estimated completion time

**Cooperative Run Pause** (`协作式任务暂停`):
A user-requested transition that allows current work to reach an execution-safe boundary, records durable continuation state, and then suspends the same Run without revoking its authorization or undoing committed Effects.
_Avoid_: instant process kill, cancellation, rollback, new Run

**Cancellation Impact Summary** (`取消影响摘要`):
The compact inline confirmation that states which future work will stop, which candidates and evidence remain, and which committed or ambiguous Effects cannot be claimed as undone before a terminal cancellation request is issued.
_Avoid_: generic confirmation dialog, Effect reversal, data deletion warning

**Terminal Run Cancellation** (`终止任务`):
The final state transition that stops a Run from performing future work while retaining its activity, evidence, candidates, outcomes, and Effect/receipt history; the same Run cannot later resume.
_Avoid_: pause, rollback, delete Run, Redo

**Context-bound Clarification Card** (`上下文绑定澄清卡`):
The durable Run-linked interaction that presents one Clarification Request with its exact Book, target, reason, blocked scope, relevant source context, and continuation consequence.
_Avoid_: chat message, generic notification, authority decision

**Choice-first Input Card** (`选项优先输入卡`):
A bounded user-input pattern that offers concise directly selectable choices, may visibly recommend one without preselection, and always provides a free-input path for an answer the listed choices do not capture.
_Avoid_: forced multiple choice, preselected recommendation, generic approval

**Clarification Blocking Scope** (`澄清阻塞范围`):
The exact dependent portion of a Run that cannot safely continue without one Clarification Answer, distinguished from independent in-envelope work that may keep running.
_Avoid_: whole Run by default, source scope, Plan Envelope expansion

**Run Rewind** (`回退并调整方向`):
The editor-facing operation that selects an eligible earlier business milestone, supplies a revised in-envelope direction, and creates a linked attempt branch inside the same Run while retaining all later causal history as superseded.
_Avoid_: destructive rollback, Resume, Redo, Effect reversal

**Rewind Point** (`任务回退点`):
An editor-readable business milestone backed by a verified safe continuation boundary and current-authority revalidation, eligible as the origin of a Run Rewind rather than exposing arbitrary technical checkpoints.
_Avoid_: model message, tool call, Manuscript Checkpoint, stale snapshot

**Rewind Impact Preview** (`回退影响预览`):
The pre-execution comparison showing the chosen Rewind Point, work that will remain authoritative, later attempts/candidates that will become superseded, current drift, committed or ambiguous Effects, and whether the proposed direction stays inside the Plan Envelope.
_Avoid_: rollback confirmation, deletion warning, Plan Preview replacement

**Superseded Attempt Branch** (`已被新方向取代的尝试分支`):
A retained, replayable portion of Run attempt history that no longer represents the current execution direction after Rewind, without being deleted or treated as a reversed Effect.
_Avoid_: erased history, cancelled Run, invalid evidence, rollback

**Run Notification Tier** (`任务通知层级`):
The consequence-based level that determines whether one Run event stays inline, produces a quiet transient notice, enters persistent actionable attention, or may also produce a privacy-safe native system notification.
_Avoid_: technical severity alone, unread-message count, provider event level

**Quiet Completion Notice** (`安静结果提示`):
The transient non-modal in-app indication that a Run produced an ordinary non-actionable outcome, retained durably in `最近完成` without increasing actionable attention.
_Avoid_: success proof, Effect Receipt, celebratory toast

**Privacy-safe System Notification** (`隐私保护型系统通知`):
A native Windows or macOS background notification whose default content identifies only AI7 and a generic action-required or abnormal event, omitting Book identity and unpublished editorial content unless the editor explicitly relaxes notification privacy settings.
_Avoid_: in-app attention record, manuscript preview, Public Release Permission

**Book-coalesced Notification** (`按图书合并通知`):
A rate-limited notification summary that combines successive events for one Book while preserving separate exact records and deep links inside AI7.
_Avoid_: merged Run history, generic digest, one combined authority decision

**Contextual Proposal Review** (`上下文提案审阅`):
The manuscript-adjacent review mode that compares a small Proposal change with its exact bounded text neighborhood while preserving the editor's current manuscript position and authoritative revision context.
_Avoid_: Apply, generic diff viewer, chat response

**Proposal Margin Anchor** (`提案边栏锚点`):
A compact manuscript-adjacent marker bound to one exact Proposal change target and its persistent card identity, used to open or locate review without becoming Manuscript text or a Proposal Decision.
_Avoid_: comment, accepted-change marker, approximate highlight

**Manuscript-anchored Proposal Card** (`稿件锚定提案卡`):
The persistent review-card identity for one independently reviewable Proposal change, bound to its exact range or range set and displayed expanded only when active or nearby while the remaining cards stay collapsed or virtualized.
_Avoid_: Word UI clone, manuscript content, Proposal Decision, Apply card

**Proposal Change Item** (`提案修改项`):
One semantically independent editorial change intent with exact target identity and its own draft and recorded disposition, regardless of visual grouping or shared generation origin.
_Avoid_: card group, model message, paragraph, Apply payload

**Proposal Change Content** (`提案修改内容`):
The exact current-to-proposed wording or structure bound to one Proposal Change Item and shown as the primary review subject without becoming authoritative Manuscript text.
_Avoid_: rationale, evidence, editor disposition, applied text

**Proposal Change Rationale** (`提案修改理由`):
AI7's concise user-facing explanation of why one Proposal Change Item is recommended, kept separate from proposed content, evidence, factual status and the editor's own decision reason.
_Avoid_: chain of thought, evidence, Non-blocking Decision Reason

**Proposal Support Detail** (`提案依据与核查`):
The independently expandable sources, evidence links, limitations and verification-state records relevant to one Proposal Change Item without converting a rationale or model assertion into evidence.
_Avoid_: Proposal Change Rationale, confidence badge, hidden reasoning

**Atomic Proposal Change Group** (`关联原子修改组`):
A named set of Proposal Change Items whose declared semantic dependency makes partial acceptance internally inconsistent, so the set receives one indivisible disposition while every member and dependency remains visible.
_Avoid_: ordinary batch selection, whole Proposal, adjacent-change group

**Proposal Change Navigator** (`提案更改导航器`):
The virtualized list and whole-manuscript marker projection for moving among one Proposal's exact changed ranges, review states, types, and conflict states without loading the whole Manuscript.
_Avoid_: manuscript outline, Proposal Decision aggregate, search results

**Bounded Proposal Comparison** (`有界提案对照`):
The inline or side-by-side comparison of current text, proposed text, and the exact local context needed to understand one change, loaded from authoritative/revision-pinned sources rather than a whole-manuscript renderer copy.
_Avoid_: whole manuscript diff in memory, Apply preview, fuzzy match

**Stale Proposal Base** (`提案基准已变化`):
The visible condition that the current authoritative Manuscript state no longer exactly matches the Proposal's pinned base at an affected or structurally relevant location, requiring exact conflict/safe-merge analysis rather than silent retargeting.
_Avoid_: rejected Proposal, stale search result, automatic conflict

**Proposal Review Return Position** (`提案审阅返回位置`):
The persisted manuscript position and review-view state used to return the editor to the exact prior reading context after opening, navigating, or leaving Proposal review.
_Avoid_: manuscript undo, Proposal anchor, Search Return Position

**Three-way Proposal Conflict** (`三方提案冲突`):
An exact interaction among a Proposal's pinned base, the current authoritative Manuscript, and proposed content at the same or structurally dependent target, requiring explicit resolution rather than automatic or fuzzy rebasing.
_Avoid_: every stale base, generic text diff, merge completed

**Safe Non-interacting Merge** (`可安全合并`):
The exact classification that current changes do not interact with the Proposal's target or structural effect, allowing a later Apply preflight to merge without conflict while granting no Proposal Decision or Effect authority.
_Avoid_: Proposal accepted, already merged, fuzzy match

**Resolution Draft** (`冲突解决草稿`):
The reversible editor-visible composition of selected current/proposed fragments and manual edits used to form a new Proposal version without mutating the authoritative Manuscript.
_Avoid_: applied text, manuscript branch authority, Proposal Decision

**Diff-Merge Quick Action** (`差异合并快捷操作`):
A one-click or keyboard operation that copies an exact current/proposed conflict unit, or an explicit ordered combination, into the Resolution Draft and records an undoable draft edit without applying it to the Manuscript.
_Avoid_: Apply, accept Proposal, automatic conflict resolution

**Proposal Decision Draft** (`提案决定草稿`):
The reversible pre-decision collection of per-change proposed dispositions and optional draft reasons for one exact Proposal version, creating no authoritative Proposal Decision until explicitly recorded.
_Avoid_: Proposal Decision, Resolution Draft, Apply selection

**Proposal Change Disposition** (`提案修改处置`):
The exact per-change outcome inside a Proposal Decision—accepted, rejected, or deferred—kept distinct from review navigation state, factual status, and whether an accepted change is later applied.
_Avoid_: generic approval, Apply result, review progress

**Proposal Decision Scope Summary** (`提案决定范围摘要`):
The pre-commit statement of exact Proposal version, selected and excluded ranges, accepted/rejected/deferred counts, unresolved conflicts, and current base status for one `记录提案决定` action.
_Avoid_: Apply preview, generic confirmation, Book progress

**Non-blocking Decision Reason** (`非阻塞决定理由`):
An optional unselected choice-first or free-text explanation requested after or alongside an exact Proposal Decision, Review Decision, or clear Task Outcome feedback interaction without delaying the originating record or the editor's next work.
_Avoid_: required justification, preselected guess, factual evidence

**Contextual Feedback Prompt** (`就地反馈轻问`):
The compact once-only optional reason interaction attached to its originating Proposal Decision, Review Decision, or clear Task Outcome, actively offered without a modal, repeated reminder, attention badge, or blocked next action.
_Avoid_: survey, required review, Global Attention item, Learning Eligibility Decision

**AI7 Reason Guess** (`AI7 的猜测`):
An explicitly labeled AI7-generated candidate reason shown among multiple unselected alternatives, whose acceptance, correction, replacement, or dismissal is recorded separately so the system does not mistake its own wording for editor-authored judgment.
_Avoid_: recommendation authority, preselected answer, editor reason, factual explanation

**Feedback History View** (`反馈历史视图`):
The global `质量与学习` projection of attributable Quality Signals and optional reasons back to their exact Book, originating decision/outcome, time, and editorial dimension, with deep links but no power to create Learning Eligibility or memory activation merely by display.
_Avoid_: Global Attention inbox, Learning Audit Log, rating leaderboard, task transcript

**Learning Material Review Card** (`编辑学习材料审阅卡`):
The bounded user-facing projection of one exact candidate Learning Material item, its provenance and originating Book/Task/decision, candidate rationale, possible later influence, and unselected eligibility/scope choices before any Learning Eligibility Decision exists.
_Avoid_: Memory Candidate review, feedback prompt, policy editor, source-scope picker

**Learning Reuse Scope Choice** (`学习复用范围选择`):
The explicit unselected current-Book, named-Series, or House boundary bound to one Learning Eligibility Decision, describing where the material may contribute later Editorial Learning without itself approving memory or granting Run retrieval.
_Avoid_: Run Source Scope, Series membership edit, Memory Candidate activation, provider outbound scope

**Learning Eligibility Attention Item** (`学习准入待处理项`):
The Book-grouped Global Attention projection created only when one exact candidate Learning Material item genuinely requires an editor's include, exclude, or defer decision.
_Avoid_: every Quality Signal, feedback reminder, Learning Audit Log entry, generic learning badge

**Learning Lineage Explorer** (`学习来源链视图`):
The object-centered UI projection of one Learning Lineage in both directions, tracing backward from a Task/result to the materials and memory that influenced it and forward from a material or memory item to its descendants and downstream Tasks.
_Avoid_: technical event log, model transcript, evidence-source lineage, default full graph

**Learning Remediation Impact Preview** (`学习补救影响预览`):
The pre-action comparison of how excluding or stopping future use of exact learning material affects future retrieval/influence, currently running Tasks, activated or candidate memory, and immutable completed history before a remediation decision is recorded.
_Avoid_: deletion confirmation, effect receipt, promise to rewrite past output, policy editor

**Historically Affected Result Marker** (`历史受影响结果标记`):
The durable label on an immutable completed Task/result showing that a learning material, memory item, Source Version, Series Knowledge Item, member Book or stable knowledge class which influenced it was later excluded, forgotten, or otherwise restricted, without changing the historical result itself.
_Avoid_: result invalidation, factual verdict, output deletion, current Run blocker

**On-demand Model Service Setup** (`按需模型服务设置`):
The local-first onboarding behavior that postpones Provider connection, credential, billing-currency and optional Run Budget Ceiling preference configuration until an editor first prepares a Task that actually requires model processing, while leaving all healthy local-only work available beforehand.
_Avoid_: first-run requirement, offline editing mode, Provider Preflight, Run Authorization

**Model Connection Blocker Card** (`模型连接阻断卡`):
The compact Task-context card naming the exact missing/unavailable Model Role binding, connection or credential-readiness condition and the safe route to Model Service Settings without losing the Task draft.
_Avoid_: generic offline banner, credential field, provider picker, Plan Revision

**Model Setup Return Point** (`模型设置返回点`):
The durable local view state that returns an editor from Model Service Settings to the exact blocked Task draft, target/source context, Plan Preview position and prior focus without authorizing or dispatching the Task.
_Avoid_: Run continuation checkpoint, browser history, Run Authorization, saved credential

**Distribution Channel Status** (`运行方式状态`):
The user-readable current platform and distribution mode together with any declared fallback that changes where product data actually lives, without implying a different AI7 authority model. Windows uses `便携版` or `安装版`; macOS uses the language selected by its package decision.
_Avoid_: release channel selector, update status, data path, product edition

**Data and Storage Summary** (`数据与存储摘要`):
The secondary Settings projection of current Distribution Channel Status, actual Product Data Location, local footprint, location-view action and Protected Secret Store separation in editor-understandable language.
_Avoid_: Agent Data Root authority, filesystem browser, export destination, backup guarantee

**Data Location Exception State** (`数据位置异常状态`):
The named placement condition that requires disclosure or remediation because the portable directory is unwritable, the location is under a known sync/backup root, or the AI7 folder is in a prohibited development/repository tree.
_Avoid_: Editing Protection Mode, Provider offline, disk-full diagnosis, generic warning

**Data Location Remediation Guidance** (`数据位置修复引导`):
The bounded product guidance that explains the actual supported location and safe next step for one Data Location Exception State without presenting an arbitrary Agent Data Root picker or asking the editor to assess filesystem/security mechanics.
_Avoid_: automatic migration receipt, file picker, local export, credential transfer

**Limited Shortcut Remapping** (`有限快捷键重映射`):
The local preference capability for changing only eligible navigation, search and view command shortcuts with conflict detection and reset, while preserving the current platform's text-editing, system, IME and authority-bearing command safety.
_Avoid_: arbitrary keybinding editor, macro system, Task Skill, command authority

**IME-safe Command Guard** (`输入法安全命令保护`):
The unconditional interaction guard that prevents AI7 navigation, search, Task, Proposal, decision or other application commands from interpreting keystrokes while a Chinese IME composition is active.
_Avoid_: shortcut preference, composition styling, editor read-only state, accessibility mode

**Discoverable Action Entry** (`可发现操作入口`):
The labeled pointer- and keyboard-reachable path to a supported action, located directly in its current context or within a clearly named disclosure/overflow/second-level menu according to importance, without requiring permanent always-on display.
_Avoid_: always-visible button, shortcut-only action, hover-only icon, hidden gesture

**Workspace Density Mode** (`工作台密度模式`):
The local `标准` or `紧凑` presentation preference controlling shell, navigation, queue, table and metadata spacing without changing manuscript reading typography, information authority or essential target readability.
_Avoid_: browser zoom, manuscript style, responsive breakpoint, content deletion

**Manuscript Reading Preset** (`稿件阅读预设`):
A named starting combination for reading-oriented or editing-oriented manuscript typography and surrounding chrome that remains fully adjustable and affects display only.
_Avoid_: Manuscript Editing Mode, DOCX style, export template, immutable typography profile

**View-only Typography Preference** (`仅视图排版偏好`):
A local user choice for manuscript font family, font size, line height, text width, alignment or related reading presentation that never writes characters/styles into the Manuscript or exported representation.
_Avoid_: document style, content formatting, DOCX round-trip rule, accessibility override

**Resizable Workspace Region** (`可调工作区区域`):
A subpage, contextual panel or comparison region whose presentation size can be changed by an accessible separator or keyboard command within safe minimum/maximum bounds, with a reset path and no effect on underlying records.
_Avoid_: resizable manuscript block, arbitrary windowing unit, content scope, saved document geometry

**Optional Surface Visibility** (`可选视图显隐`):
The local collapsed/hidden/closed state allowed for a lower-importance supporting card or view, with a stable restore entry and no implication that its underlying item was dismissed, decided, deleted or resolved.
_Avoid_: Global Attention dismissal, record deletion, decision, permission to hide safety state

**Detached Manuscript Window** (`独立稿件窗口`):
A separate desktop application window on Windows or macOS that hosts the one active editable manuscript subpage after it is transferred from the Book Workbench, retaining its eligible manuscript operations while remaining a bounded service projection.
_Avoid_: read-only exported-document viewer, parallel editor, second Manuscript Revision, independent manuscript store

**Manuscript Surface Transfer** (`稿件页面转移`):
The guarded re-hosting of one exact manuscript subpage between the Book Workbench and a Detached Manuscript Window after IME composition and durable edit acknowledgement settle, without copying or synchronizing two interactive pages.
_Avoid_: document export, window duplication, manuscript merge, Run handoff

**Active Manuscript Surface Binding** (`活动稿件页面绑定`):
The service-enforced UI input binding that permits only one Renderer surface to submit manuscript edit commands for one exact Book/manuscript/branch at a time.
_Avoid_: Manuscript authority, Book lock, Run lock, Effect Approval, operating-system focus

**Detached Manuscript Placeholder** (`稿件独立显示占位`):
The non-editable main-workbench replacement for a manuscript body currently hosted in a Detached Manuscript Window, preserving exact identity, persistence/safety visibility, and direct `显示独立窗口` and `移回工作台` actions without rendering a second text copy.
_Avoid_: read-only manuscript mirror, closed Book, hidden safety state, empty-state error

**Application Theme Preference** (`应用主题偏好`):
The local display choice `跟随系统`, `浅色` or `深色` applied coherently to all AI7 windows without changing any content, record, authority or export.
_Avoid_: document theme, DOCX style, custom palette, accessibility mode

**System-following Theme** (`跟随系统主题`):
The default theme behavior that selects AI7's light or dark semantic-token mapping from the current operating system's application-theme preference and updates all AI7 windows coherently.
_Avoid_: native accessibility appearance, time-based theme, automatic content style, Provider state

**Native Accessibility Appearance Override** (`原生辅助显示接管`):
The unconditional platform rendering layer—Windows high contrast/forced-colors or applicable macOS contrast, transparency, and color-accessibility settings—that takes priority over AI7 light/dark decoration while preserving exact text, focus, boundary and non-color state semantics.
_Avoid_: optional fourth theme, custom accent palette, warning state, reduced motion

**Semantic State Presentation Grammar** (`语义状态呈现语法`):
The shared cross-component structure `exact Chinese state term + icon/shape + necessary boundary or structure + optional detail and safe next action` that makes interaction states consistent without renaming or merging their domain meaning.
_Avoid_: traffic-light taxonomy, badge palette, generic success/error label, domain state machine

**Authoritative Completion Styling** (`权威完成样式`):
The restrained completion treatment reserved for an authoritative AI7 record, classified outcome evidence or verified Effect Receipt that supports the exact displayed claim.
_Avoid_: model/Harness success, optimistic animation, tool result, Proposal generation, selection state

**Consequence-first Message** (`后果优先提示`):
The primary Chinese message layer that states which object has which exact state, what remains safe or unchanged, and the next safe action before exposing diagnostics.
_Avoid_: generic error toast, raw exception, success slogan, technical log

**Safe-next-action Copy** (`安全下一步文案`):
The exact verb-plus-object instruction or action label that remains valid from the current authoritative state and does not imply a stronger permission, outcome or recovery guarantee.
_Avoid_: generic retry/continue, recommendation as authorization, disabled reason, hidden automation

**Sanitized Technical Detail** (`已清理技术详情`):
The secondary expandable diagnostic view or copyable support bundle after manuscript excerpts, credentials, request bodies, hidden behavior/policy content and other prohibited sensitive material have been removed.
_Avoid_: raw Harness transcript, Provider payload, ordinary editor explanation, audit authority

**V1 Semantic Retention** (`V1 语义保留`):
The deliberate preservation of a frozen V1 user outcome, state distinction, negative guarantee or stable journey identity while allowing its V2 placement, wording and component expression to change.
_Avoid_: screen reuse, source copying, implementation compatibility, validation inheritance

**V1 Interaction Reshaping** (`V1 交互重塑`):
The re-expression of a retained V1 professional need through accepted V2 objects, authority, navigation and product language rather than the frozen screen hierarchy.
_Avoid_: cosmetic reskin, domain migration, prototype port, artifact retention

**V1 Artifact Drop** (`V1 设计资产舍弃`):
The explicit exclusion of a frozen V1 screen geometry, prototype, Figma frame, component implementation, token value, validation gate or incompatible interaction assumption from the V2 baseline without silently deleting a retained outcome.
_Avoid_: feature deletion, evidence destruction, journey removal, source-history rewrite

**Series Membership and Sharing Scope** (`书系成员与共享范围`):
The Series-owned workspace for inspecting exact member Books, Series Knowledge Candidates and immutable revisions, promotion history, explicit Series Retrieval Exclusions and membership history, and for initiating only the corresponding exact commands without becoming a Task source-scope or learning-eligibility authority.
_Avoid_: Book library grouping, Run Source Scope, Learning Eligibility Scope, shared manuscript browser

**Series Membership Impact Preview** (`书系成员变更影响预览`):
The pre-command comparison that names the Book/Series and separately explains effects on future Task selection, frozen authorized/running Runs, governed Series Knowledge/learning records and immutable history.
_Avoid_: Plan Preview, Learning Remediation Impact Preview, deletion confirmation, generic approval

**Series Membership Change Record** (`书系成员变更记录`):
The durable append-only record of one exact Book being added to or removed from one exact Series, including actor, absolute local time, prior/new membership and the displayed impact basis.
_Avoid_: Run Authorization, source-scope grant, Learning Eligibility Decision, manuscript mutation

**Series Knowledge Promotion Review** (`书系知识纳入审阅`):
The consequence-first review of one editor-authored or provenance-bound Series Knowledge Candidate, naming the exact Series, proposed new or exact existing Series Knowledge Item, content, provenance, conflicts, current/superseded revision and future reuse scope. A disclosed conflict offers unselected `编辑候选项`, `保留已披露冲突`, and `取消`; only after explicit disposition may the exact `纳入书系知识` action create the item with its first Series Knowledge Revision or append a revision and Series Knowledge Promotion Decision.
_Avoid_: Learning Eligibility review, Proposal acceptance, factual verification, automatic memory activation

**Series Retrieval Exclusion Impact Preview** (`书系检索排除影响预览`):
The pre-command comparison for adding, superseding or ending one Series Retrieval Exclusion, separating later retrieval, queued/authorized/active Runs, immutable completed history and unaffected Book/source authority while naming the immediate current-read consequence.
_Avoid_: Series Membership Impact Preview, Learning Remediation Impact Preview, deletion confirmation, Plan Revision

**Apply Preparation** (`稿件应用准备`):
The local pre-Effect surface that selects accepted exact Proposal changes, revalidates current authority and merge safety, previews the bounded result, and freezes an Effect target/payload without authorizing or committing it.
_Avoid_: Proposal Decision, Effect Approval, Apply execution

**Apply Change Set** (`稿件应用修改集合`):
The frozen exact set of accepted Proposal changes included in one atomic manuscript Apply Effect, with explicit exclusions and bindings to Proposal Decision, target revision, Effect identity, payload, and replay policy.
_Avoid_: all accepted changes forever, Proposal version, mutable selection

**Apply Result Preview** (`应用结果预览`):
The bounded before/result comparison projected from one prepared Apply Change Set against the exact current Manuscript Revision, without presenting the result as committed authority.
_Avoid_: new Manuscript Revision, Proposal review, Effect Receipt

**Apply Readiness** (`稿件应用就绪状态`):
The current exact preflight condition that target revision, selected ranges, structural relations, Proposal Decision, Effect payload, and relevant policy pins remain valid for a separately named Effect Approval.
_Avoid_: Proposal accepted, Effect approved, Apply committed

**Inline Apply Approval Bar** (`内联稿件应用批准栏`):
The sticky exact-Effect action region in a current frozen Apply Preparation that summarizes the bound target/payload and offers one `批准并应用到稿件` interaction without a duplicate modal.
_Avoid_: generic approval bar, Proposal Decision, Apply Receipt

**Apply Approval Readiness** (`稿件应用批准就绪状态`):
The final validity state confirming that the frozen Effect target, payload, Proposal Decision, target Manuscript Revision, policies, and expected result remain unchanged enough to present the exact Apply Effect Approval action.
_Avoid_: Apply Readiness alone, Effect committed, manuscript saved

**Applying Manuscript State** (`正在应用稿件状态`):
The durable post-dispatch, pre-receipt presentation that one exact approved Apply Effect is executing or awaiting outcome classification and cannot be triggered again.
_Avoid_: applied successfully, generic loading, Effect Receipt

**Apply Effect Receipt Card** (`稿件应用凭据卡`):
The compact durable presentation of one exact Apply Effect's verified commit, confirmed non-commit, recovery, or unresolved outcome, expandable to its authoritative revisions, lineage, atomic result, and evidence.
_Avoid_: success toast, Effect Approval, Proposal status alone

**Apply Outcome Recovery** (`正在确认应用结果`):
The idempotent local reconciliation state that queries authoritative Effect and Manuscript records by stable identity after lost acknowledgement, restart, or interruption without dispatching the Apply again.
_Avoid_: Retry, generic loading, ambiguous external outcome

**Unresolved Apply Outcome** (`应用结果待确认`):
The actionable state in which AI7 cannot yet prove either committed or safely non-committed local Apply outcome, blocking repetition until authoritative recovery or classified resolution exists.
_Avoid_: ordinary failure, safe retry, Effect Receipt success

**Reverse Apply Effect** (`反向稿件应用动作`):
A new exact prepared, approved, and receipted Effect that counteracts one prior committed Apply against current authoritative manuscript state while leaving the original Effect and Receipt immutable.
_Avoid_: deleting history, cancellation, ordinary manuscript undo, receipt reversal

**Fact-check Lens** (`事实核查工作入口`):
The right contextual Manuscript surface that virtualizes revision-bound assertions/findings, separate integrity/support/verification states, filters, whole-manuscript markers, and routes into exact evidence comparison.
_Avoid_: truth dashboard, generic annotation list, model confidence panel

**Manuscript Assertion Marker** (`稿件声明标记`):
The restrained margin or position-rail projection linking one exact revision/range-bound Manuscript Assertion or Editorial Error Finding to its current verification attention state.
_Avoid_: factual verdict underline, comment, Proposal change marker

**Factual Review Result Item** (`事实核查结果项`):
The virtualized row/card combining an assertion's exact location, risk/attention state, Reference Integrity, Claim Support, Factual Verification sub-state, and evidence-comparison route without becoming the authoritative finding itself.
_Avoid_: Effect, correction, truth score

**Stale Verification Anchor** (`核查基准已变化`):
The state in which edits overlap or structurally invalidate the exact Manuscript Assertion/finding range, requiring re-identification and renewed verification rather than fuzzy movement to similar wording.
_Avoid_: disproved claim, stale source, approximate anchor

**Assertion-centered Evidence Workspace** (`声明中心证据工作区`):
The Dedicated Work Workspace for one exact Manuscript Assertion, presenting its revision/policy context, candidate and checked sources, pinned comparisons, source relations, and routes toward a factual determination or Correction Proposal.
_Avoid_: global research dashboard, truth oracle, Correction Proposal itself

**Evidence Source Card** (`证据来源卡`):
The source/version presentation that adds discrete completed identity, provenance, freshness, integrity, exact-excerpt, and assertion-relation fields as checks settle, with incomplete assurance explicitly visible rather than blocking all discovery; it is not progressive Provider-answer content.
_Avoid_: source equals evidence, model summary, citation badge alone

**Evidence Comparison Matrix** (`证据比较矩阵`):
The bounded side-by-side comparison of two to four editor-pinned source versions across exact excerpt, authority, freshness, provenance, integrity, and support/contradiction relation for one assertion.
_Avoid_: source ranking leaderboard, automatic truth vote, unlimited columns

**Exact Evidence Excerpt** (`精确证据摘录`):
A quotation or text span obtained by Exact Fetch from one pinned Source Version and linked back to its exact source context; only this form may certify what the source says.
_Avoid_: retrieval snippet, model paraphrase, search-result text

**Evidence Source Lineage** (`证据来源关系`):
The visible derivation relationship among original, syndicated, quoted, translated, summarized, or otherwise dependent sources used to prevent dependent material from appearing as independent corroboration.
_Avoid_: Book lineage, Learning Lineage, source count

**AI7 Evidence Comparison Summary** (`AI7 证据比较摘要`):
A clearly labeled navigational synthesis linking each statement to exact evidence or unresolved source candidates while carrying no evidentiary authority itself.
_Avoid_: evidence, Factual Verification, model knowledge proof

**Evidence Assurance Level** (`证据核查强度`):
The user-visible, policy-bounded choice among quick, standard, and strict progressive checking that controls when eligible assurance work runs without changing what counts as evidence or lowering the policy minimum for a formal determination.
_Avoid_: truth confidence, model quality, source permission

**Quick Evidence Triage** (`快速整理`):
The discovery-first level that returns labeled candidate sources and comparison summaries quickly while deferring eligible checks; it may support pending findings/drafts but cannot produce supported or contradicted formal Factual Verification.
_Avoid_: weak verification, checked evidence, fast factual verdict

**Standard Evidence Assurance** (`标准核查`):
The default level that checks pinned/high-relevance evidence in background and exposes each completed discrete check state, blocking only on the active policy's Minimum Evidence Gate before a formal determination; Provider-bound content remains Waiting Only.
_Avoid_: every-source exhaustive check, quick triage, policy bypass

**Strict Evidence Assurance** (`严格核查`):
The high-assurance level that completes all policy-required checks for selected evidence—including exact text, authority, freshness, provenance, integrity, lineage, applicability, and conflict—before determination.
_Avoid_: absolute truth, all internet sources, legal signoff

**Minimum Evidence Gate** (`最低证据门槛`):
The active Factual Verification Policy Document's non-bypassable evidence checks required before recording a formal supported or contradicted assessment for the exact assertion and risk context.
_Avoid_: UI preference, sample threshold, model confidence gate

**Versioned Verification Result** (`版本化事实核查结果`):
The user-visible projection of one evidence-backed Factual Verification version bound to an exact Manuscript Assertion/range, evidence snapshot, assurance level, policy version, and separate integrity/support/verification states.
_Avoid_: Review Decision, absolute truth, model answer

**Factual Review Decision Card** (`核查审阅决定卡`):
The compact choice-first surface immediately following one Versioned Verification Result through which an editor records an exact Review Decision without merging it with the evidence assessment.
_Avoid_: generic approval, Proposal Decision, evidence rating

**Verification Review Disposition** (`核查审阅处置`):
The editor's exact Review Decision outcome for one verification-result version: accept current conclusion, request more evidence, keep unresolved, or decline the assessment.
_Avoid_: Factual Verification status, correction acceptance, Signoff

**Correction Proposal Draft** (`更正提案草稿`):
The editable pre-Proposal state bound to one accepted Editorial Error Finding, its Review Decision, current exact manuscript target, evidence state, and policy, creating no Correction Proposal version until explicitly saved.
_Avoid_: Correction Proposal, Proposal Decision, direct manuscript fix

**Correction Variant** (`更正方案`):
One unselected candidate wording/scope approach for resolving the exact finding, with resulting text, rationale, evidence links, limitations, and affected ranges while carrying no selection or mutation authority.
_Avoid_: model answer, accepted correction, Apply payload

**Minimal Correction Scope** (`最小更正范围`):
The smallest exact manuscript range set and typed changes required to address the reviewed finding without silently adding stylistic, structural, or adjacent-content improvements.
_Avoid_: whole chapter rewrite, all similar text, automatic cleanup

**Linked Correction Range Set** (`关联更正范围集合`):
The explicit separately reviewable exact ranges where one fact or referential error recurs and may be addressed by one Correction Proposal without fuzzy whole-manuscript replacement.
_Avoid_: search matches, automatic replace-all, one implicit broad target

**Deliverable Workflow Lens** (`交付物工作流入口`):
The contextual right-side projection of one Editorial Deliverable's Workflow Instance, pinned profile/version, phases, gates, related records, and actionable next work without becoming a global product root.
_Avoid_: Harness Workflow, Book-wide progress, task timeline

**Action-first Workflow Summary** (`工作流待处理摘要`):
The `下一项需要处理` projection of exact Workflow Gates, named decisions, blockers, and safe next actions across overlapping phases rather than a scalar progress score.
_Avoid_: completion percentage, generic inbox, automated next step

**Parallel Phase View** (`并行阶段视图`):
The non-linear presentation in which multiple Workflow phases may independently be active, waiting, blocked, completed, reopened, or skipped with recorded reasons.
_Avoid_: mandatory stepper, Run concurrency, one current phase

**Workflow Profile Pin Display** (`工作流配置版本标识`):
The always-reachable identification of the exact Workflow Profile and version governing one Deliverable's Workflow Instance, with migration treated as a separate explicit flow.
_Avoid_: profile selector that silently migrates, Task Skill version, Harness profile

**Workflow Gate Card** (`工作流关口卡`):
The exact Deliverable/phase/profile-bound surface presenting one Workflow Gate's mandatory/advisory criteria, evidence, missing items, consequences, computed readiness, and separately recordable disposition.
_Avoid_: generic approval card, phase checklist, Signoff surface

**Gate Readiness** (`关口就绪状态`):
The computed current condition of a Workflow Gate—unready, reviewable, advisory-incomplete, or mandatory-blocked—based on pinned profile criteria and exact evidence without itself passing or failing the Gate.
_Avoid_: Gate decision, Review Decision, Signoff readiness

**Workflow Gate Disposition** (`工作流关口处置`):
The exact recorded user outcome for one Gate version: pass, return for supplementation, conditionally pass where permitted, or defer, distinct from readiness and any accompanying Review Decision.
_Avoid_: generic approval, phase completion, Signoff

**Conditional Gate Passage** (`有条件通过关口`):
A profile-authorized Workflow Gate Disposition that permits identified downstream work while retaining exact unmet advisory conditions and their restrictions; never a bypass for mandatory criteria.
_Avoid_: override, unconditional pass, skipped Gate

**Save as Milestone Version** (`保存为里程碑版本`):
The explicit user action that identifies or first creates the exact immutable content version, records the canonical [Milestone Version](../domain/editorial/CONTEXT.md#milestone-version) label/purpose, and appends the separate internal Signoff Record required by the domain without exposing signoff workflow jargon.
_Avoid_: native Journal Save shortcut, Save As file, generic signoff, export

**Milestone Version Label** (`里程碑版本标签`):
The concise editor-chosen name used to recognize one exact Milestone Version, such as `一审修改完成` or `2026-08 交付候选`, distinct from its immutable content identity.
_Avoid_: filename, revision ID, mutable content, Workflow phase state

**Milestone Purpose** (`里程碑用途`):
The stated next use for which the editor designates the exact version as ready, such as phase archive, review candidate, or delivery candidate, recorded without authorizing that later use itself.
_Avoid_: Delivery Permission, Public Release Permission, phase completion

**Delivery Package Preparation** (`交付包准备`):
The local content-manifest surface that selects one exact Editorial Deliverable Revision, optionally identified by an exact Milestone Version, and one stated Delivery Package Purpose; it composes required artifacts, applicable Gate/Signoff references, exclusions, and limitations, and freezes one canonical [Delivery Package](../domain/editorial/CONTEXT.md#delivery-package) version without choosing formats, filenames, fidelity disposition, or Local Export Destination.
_Avoid_: export, Public Release, folder compression alone

**Delivery Package Purpose** (`交付包用途`):
The concise user-facing presentation of the canonical Delivery Package's stated purpose, such as internal review copy, archive copy, or delivery candidate, without recording a recipient, output format, external channel, transmission event, or Local Export Destination.
_Avoid_: Milestone Purpose, handoff record, delivery proof, Public Release purpose, Effect target

**Milestone Change Exclusion Notice** (`里程碑后修改排除提示`):
The explicit statement, used when a Milestone Version identifies the selected Editorial Deliverable Revision, that later edits are not included in the prepared package, with counts/locations and a route to create a newer milestone rather than silently moving the package target.
_Avoid_: stale warning alone, auto-update, data-loss notice

**Delivery Package Manifest Preview** (`交付包清单预览`):
The user-readable exact list of included/excluded content, Editorial Artifacts, applicable Gate/Signoff references, version/source/factual materials, and limitations before one destination- and format-independent Delivery Package version is frozen.
_Avoid_: output-format selector, filesystem tree, archive contents after export, Effect payload log

**Prepared Delivery Package** (`已准备交付包`):
The editor-visible `交付包已准备` presentation of one immutable canonical Delivery Package version, with stable Package identity, unconditional binding to one exact Editorial Deliverable Revision, optional identifying Milestone Version, purpose, manifest integrity, applicable authority references, exclusions/limitations, and a separate Package Export History. It has no output format, destination, fidelity disposition, or implication of transmission.
_Avoid_: delivered package, exported file, export preparation, public release

**Package Export History** (`交付包导出记录`):
The read-only projection from one exact Delivery Package version to zero or more separately identified Local Export Preparations and per-file Effect Receipts, shown as `暂无导出记录` or exact receipt links without changing package identity or state.
_Avoid_: package status, delivery log, recipient tracking, one mutable latest export

**Primary Editable Export** (`主要可编辑导出`):
The ordinary user-facing DOCX representation generated from one exact Milestone Version or Prepared Delivery Package for continued professional editing and handoff, with explicit round-trip and content-class fidelity disclosure.
_Avoid_: manuscript authority, internal storage format, guaranteed pixel-identical layout, Public Release

**Agent Exchange Projection** (`Agent 交换投影`):
A bounded or streamed Markdown representation derived from and pinned to one exact Manuscript Revision so an agent can reliably read editorial text and express proposed changes through AI7 Capabilities. It is disposable and re-derivable; agent output against it creates a Proposal and never directly mutates manuscript authority.
_Avoid_: Manuscript Revision, whole-manuscript prompt, editable source file, Proposal, Apply Effect

**Markdown Fallback Export** (`Markdown 备用导出`):
An explicitly selected user export of the revision-pinned Markdown projection for portability or recovery when rich-document fidelity is not required, with every lost or transformed content class disclosed before export.
_Avoid_: silent DOCX substitute, lossless rich-document export, internal projection authority, automatic fallback

**Fixed-layout PDF Export** (`PDF 定版导出`):
An optional user-selected fixed-layout representation generated from one exact package/version for reading, printing, or handoff, with no editable round-trip promise.
_Avoid_: editable source, manuscript authority, automatic public release, PDF proof/final truth

**Export Fidelity Review** (`导出保真审阅`):
The pre-export comparison that classifies each applicable content class for the chosen format as fully preserved, degraded with exact disclosure, or unavailable/blocking, and requires an unselected explicit choice for material degradation.
_Avoid_: generic warning, import fidelity review, visual preview alone, proof of delivery

**Export Fidelity Disposition** (`导出保真处置`):
The editor's exact format-specific response to disclosed export degradation: accept it for this export, choose another representation, or stop and resolve the source/package requirement. It is bound into the prepared payload and grants no delivery or release authority.
_Avoid_: generic approval, permanent preference, import acceptance, proof of successful export

**Local Export Preparation** (`本地导出准备`):
The separately identified pre-Effect surface binding one exact milestone or Delivery Package version, export-specific formats, filenames, Export Fidelity Disposition, and one Resolved Local Export Target before exact target-bound Effect Approval. A changed format or target creates a new preparation and never re-versions the package.
_Avoid_: Delivery Package Preparation, external handoff, save-as working copy, committed export

**Local Export Destination** (`本地导出位置`):
The exact local file or folder target explicitly selected for one export through the current platform's system picker, distinct from the Delivery Package Purpose and from any external channel.
_Avoid_: named recipient, product-managed staging root, remembered hint alone, Public Release destination

**Native Export Collision Resolution** (`系统原生导出冲突处理`):
The current platform's OS-owned save/copy conflict interaction for an existing local target, whose native alternative-name/path, cancellation, replacement/overwrite, or equivalent outcome is normalized into AI7's exact export semantics without a duplicate AI7 collision modal.
_Avoid_: import Filename Collision, AI7 confirmation modal, standing overwrite permission, Effect Approval by itself

**Resolved Local Export Target** (`已确定本地导出目标`):
The exact final local path plus create-or-replace disposition returned from native selection/conflict handling and bound to one current Local Export Preparation before Effect Approval; later target drift invalidates that readiness.
_Avoid_: remembered destination, unresolved filename, external endpoint, immutable package identity

**Local Export Receipt Card** (`本地导出凭据卡`):
The durable per-file presentation of a verified Effect Receipt showing the actual final local path, created-or-replaced outcome, exact package/version and format/fidelity binding, actor/time, and no external delivery or publication claim.
_Avoid_: delivery confirmation, package completion, native-dialog confirmation, optimistic export toast

**Local-only Export Boundary** (`仅本地导出边界`):
The V1 product boundary in which AI7 may prepare and atomically publish files only to a user-selected local destination on Windows or macOS, producing no direct external transmission, handoff log, recipient tracking, or delivery-confirmation state.
_Avoid_: offline-only product, prohibition on later manual sharing, External Export Policy, proof of delivery

**Set as Publication Version** (`设为发稿版本`):
The explicit exact-version action that records the canonical [Publication Version](../domain/editorial/CONTEXT.md#publication-version) designation and the separately identified internal Public Release Permission in one deterministic interaction, with publication scope/public channel, actor, time, and basis visible in user language.
_Avoid_: generic approval, Save as Milestone Version, local export, Publish button, automatic Workflow transition

**Publication Version Change Notice** (`发稿版本后修改提示`):
The explicit statement that current working content contains material edits after the selected Publication Version and that those edits are not covered by its designation or internal permission.
_Avoid_: automatic permission transfer, stale warning alone, revocation, proof the later edits are unsuitable

**Maintenance Case Workspace** (`维护事项工作区`):
The exact Publication Version-context surface for drafting, recording, and following one canonical [Maintenance Case](../domain/editorial/CONTEXT.md#maintenance-case), with classification, reason/evidence, current safe next action, and immutable revision history visible without turning the Workflow phase into authority.
_Avoid_: phase notes, mutable Publication Version, external recall center, Correction Proposal workspace

**Maintenance Case Timeline** (`维护事项时间线`):
The read-only causal presentation of canonical [Maintenance Case Revisions](../domain/editorial/CONTEXT.md#maintenance-case-revision) and their exact linked reasons/evidence, Proposals, Errata artifacts, resulting Deliverable revisions, Milestone/Publication Versions, and local export receipts.
_Avoid_: mutable activity feed, publication history replacement, merged authority, external delivery timeline

**Internal-only Maintenance Notice** (`仅内部维护提示`):
The persistent consequence copy attached to Withdrawal or Archive stating `仅在 AI7 内记录；不代表已撤稿、下架、召回、通知接收方或删除外部文件` and granting no external outcome.
_Avoid_: external withdrawal confirmation, takedown receipt, delete warning, Public Release revocation
