# AI7 V2 information architecture

Status: **Owner-approved Issue #86 successor; repository-current only in an exact integrated `dev` commit containing this revision; accepted-but-unintegrated elsewhere; not implementation evidence**

## Accepted organizing model

AI7 uses a **Book-anchored Workbench** with three levels:

1. **Book anchor** — the stable source, privacy, mutation, and editorial context visible in navigation and work context.
2. **Active Work Object** — one manuscript, related Editorial Deliverable, proposal comparison, evidence review, analysis Result Set, workflow record, or other authoritative object in the central surface.
3. **Task Context Layer** — task capture, Plan Preview, Run activity, clarification, covered-analysis status, proposals, and outcomes attached to the exact work object rather than organized as peer conversations.

An explicitly entered **Book-bound Agent Workspace** may temporarily occupy the primary central presentation slot while preserving the prior Active Work Object. It is a DSH-composed presentation inside the AI7 shell, not another authority object or a generic chat root.

```text
AI7 desktop shell
├─ Two-level Contextual Sidebar
│  ├─ global destinations
│  │  ├─ 待我处理
│  │  ├─ 书库
│  │  ├─ 书系
│  │  └─ 质量与学习
│  ├─ Book Convenience View
│  │  ├─ pinned Books
│  │  └─ recent Books
│  ├─ current Book navigation
│  └─ bottom application/account area
│     └─ 设置
├─ central Active Work Object
│  └─ or explicit Book-bound Agent Workspace presentation
├─ contextual supporting surface
├─ context-bound task entry
├─ reachable native-artifact / Rule management projection
│  └─ final global label and placement deferred
└─ separately disclosed Background Analysis Enrollment presentation
   └─ final entry point, label and compact controls deferred
```

This is a relationship map, not accepted screen geometry. The Codex-referential direction permits a compact collapsible left surface, dominant center, optional contextual right surface, and bottom task entry, but exact proportions and behavior remain open.

## Authority rules

- Book navigation never derives authority from a folder, recent-item list, Task, or Harness Session.
- Starting or completing a Run does not automatically replace the Active Work Object.
- A Task may be reached from its Book or the Global Attention View, but opening it restores its exact authoritative context.
- The Global Attention View is a projection. Dismissing, grouping, or filtering an item cannot mutate the underlying Task, decision, Effect, or Workflow Instance.
- Contextual surfaces may summarize a record, but consequential actions resolve against the authoritative record and exact pins.
- Entering, leaving, expanding, or rendering a DSH-composed Agent Workspace creates no Book, Task, Run, Provider permission, background authority, source scope, Proposal Decision, Effect, or manuscript mutation.
- AI7 retains the exact Book and safety state around a DSH UI Plugin; the Plugin cannot replace the shell or bypass AI7 Capability, Effect, or Apply boundaries.

## Book-bound Agent Workspace

```text
exact Book + preserved Active Work Object
└─ explicit Agent Workspace entry
   ├─ AI7 shell / Book / safety state remain visible and reachable
   ├─ eligible exact DSH composition supplies the inner agent experience
   ├─ compatible DSH UI Plugin may render inside the contained host
   └─ return to preserved Active Work Object
```

The workspace may host task preparation, dialogue, artifact-supported work and links to authoritative Book records, but none of those relations turns the workspace or DSH Session into a source-of-record owner. Agent-originated manuscript changes still leave the workspace for the exact AI7 Apply boundary.

## Accepted documentation-completion boundary

The earlier interview-completion statement is historical. Issue #8 closed the dependency-ordered branches in [`MISSING-DESIGN-DECISION-MAP.md`](./MISSING-DESIGN-DECISION-MAP.md). Issue #86 supplies the target-qualified successor for Book-bound Agent Workspace, native DSH artifact lifecycle, operational-scope Provider policy selection, covered manuscript analysis, Background Analysis Enrollment and universal single-use AI7 Apply. These additions are repository-current only in an exact integrated `dev` commit containing this revision, remain accepted-but-unintegrated elsewhere, and grant no implementation authority.

## Semantic state presentation hierarchy

```text
authoritative or projected state
├─ exact Chinese state term
├─ redundant icon / shape
├─ necessary boundary or grouping
├─ optional consequence/detail
└─ one safe next action when applicable

presentation state
├─ focus
├─ selected
├─ disabled + exact reason
├─ projection loading
├─ domain work/wait state
├─ error/recovery
└─ authoritative completion · only with supporting record/evidence/receipt
```

The grammar is reusable; the labels are not interchangeable. A selected row does not become accepted, a completed Harness turn does not become a completed Task, and a Proposal Decision does not become an Apply receipt. Dense collections retain exact state in text while secondary detail expands progressively.

## Message disclosure hierarchy

```text
primary editor layer
├─ object + exact state
├─ consequence
├─ safe / unchanged boundary
└─ one safe next action

secondary disclosure
└─ 查看技术详情
   ├─ sanitized diagnostic class/code
   ├─ local timestamp and applicable record reference
   ├─ copy support information
   └─ no manuscript excerpt / credential / request body / raw transcript
```

Field errors remain local to their input; Run/Proposal/Effect errors remain with their exact record; persistent safety/authority blockers retain a named anchor. Modals sit outside the normal hierarchy and appear only for potential manuscript-input loss or a material irreversible misunderstanding.

## V1 semantic migration map

The frozen V1 screen catalog is not an ancestor of the V2 navigation tree. [`migration-from-v1.md`](./migration-from-v1.md) maps semantic assets by retain/reshape/drop, while [`journeys.md`](./journeys.md) keeps all fourteen business-outcome IDs independent of old screen codes.

Retained meanings enter their V2 authoritative Book/object context. Reshaped interactions use the accepted workbench, contextual side surfaces, dedicated workspaces, settings and exact record routes. Dropped screen/component/prototype/Figma artifacts receive no hidden navigation placeholder. A journey may cross several V2 surfaces; it never creates a new peer navigation root merely because the frozen package named a screen for it.

## Default landing priority

The accepted launch order is:

1. an exact manuscript Recovery Attention State requiring user understanding;
2. Import Draft Recovery when a non-authoritative staged draft or Import Commit Outcome Uncertain exists—the uncertain commit is shown first inside that workspace and blocks retry/cleanup, while an ordinary verified draft offers unselected `继续导入` / `放弃`;
3. the last active Book, Active Work Object, and whole-manuscript position; or
4. `新建图书` / `导入稿件` when no Book exists. Standalone creation intentionally creates an empty Book only after Review Before Book Creation; import keeps `新建图书` unselected until target choice.

Global Attention remains reachable and updates its counts, but a new Run state, clarification, decision, failure, or completion never becomes the launch destination merely by being newer. Startup therefore restores the editor's work context rather than selecting the most recent system event.

## Book Recovery Workspace

Recovery stays bound to the Book and its exact manuscript history:

```text
Recovery Attention State
└─ exact affected Book
   └─ Book Recovery Workspace
      ├─ Recovery State Comparison
      │  ├─ 恢复的工作状态 · acknowledged Edit Journal boundary
      │  ├─ relevant Milestone Version / Manuscript Checkpoint
      │  └─ applicable verified Recovery Snapshot · when available
      ├─ branch/time/change extent/verification/limitations
      ├─ 恢复为新版本 · recommended
      ├─ 仅查看
      ├─ 稍后处理
      └─ 导出或复制受影响内容
```

Multiple affected Books remain separate `恢复待确认状态` items rather than one cross-Book recovery wizard. Unaffected Books remain reachable. Recovery records stay in `历史与恢复`; they are not filesystem backups or renderer-session artifacts. After descendant restoration, the exact new version carries `当前为恢复的工作状态` until editor review and a new Milestone Version.

## Persistent navigation

AI7 uses one Two-level Contextual Sidebar rather than a global sidebar plus a second Book sidebar:

- the stable global layer contains `待我处理`, `书库`, `书系`, and `质量与学习`; Issue #86 does not place the native-artifact/Rule management projection or the separately disclosed Background Analysis Enrollment presentation in this layer and fixes neither final label nor entry point;
- the Book layer contains pinned Books, recent Books, and navigation scoped to the current Book;
- the searchable library provides the complete Book collection;
- the bottom application/account area contains Settings; and
- collapsed navigation retains global destination recognition, current Book identity, and the Global Attention count.

Pinned and recent Books are a Book Convenience View only. Their order and membership never imply Series membership, task scope, learning eligibility, privacy, or mutation authority.

## Series membership and sharing scope

`书系` owns a dedicated membership/shared-context lens rather than reusing the Book library:

```text
书系
└─ exact Series
   ├─ 概览
   ├─ 成员与共享范围
   │  ├─ member Books
   │  ├─ 书系知识
   │  │  ├─ stable Series Knowledge Items
   │  │  │  └─ immutable Series Knowledge Revisions
   │  │  ├─ Series Knowledge Candidates
   │  │  │  └─ 书系知识纳入审阅
   │  │  │     ├─ 编辑候选项 → re-review
   │  │  │     ├─ 保留已披露冲突 → 纳入书系知识
   │  │  │     └─ 取消
   │  │  ├─ provenance / conflicts / promotion history
   │  │  └─ 提议为书系知识 · editor-authored or exact source-bound
   │  ├─ 书系检索排除
   │  │  ├─ current effective exclusions + append-only revisions
   │  │  ├─ 添加检索排除 / 修改检索排除 / 停止此排除
   │  │  └─ 书系检索排除影响预览
   │  ├─ 加入书系 / 移出书系
   │  │  └─ Series Membership Impact Preview
   │  │     ├─ 未来任务
   │  │     ├─ 已授权或正在运行
   │  │     ├─ 书系知识与学习
   │  │     └─ 历史记录
   │  └─ Series Membership Change Records
   └─ 相关任务与历史
```

The workspace does not render all member manuscripts as one browsable corpus. Membership changes are prospective: adding membership enables explicit future Series-scope selection, removing it stops future membership-derived selection, and frozen Runs retain their exact resolved membership basis. Series Knowledge follows a different explicit candidate → conflict disposition → promotion-review → stable-item/immutable-revision path and never arises from membership, learning eligibility, model output or Proposal acceptance alone. Promotion only makes a revision eligible for later exact Series-scope selection. Series Retrieval Exclusions are different again: once committed they immediately block every later affected Series read, including not-yet-performed reads in an already authorized or active Run, which stops for Plan Revision plus renewed Run Authorization or cancellation. Knowledge, membership, retrieval restriction, learning and lineage remain separately governed and append-only.

## Quality and learning: feedback projection

Ordinary feedback begins and ends in the context that produced it; the global destination is a history and governance surface, not a survey inbox:

```text
Proposal Decision / Review Decision / clear Task Outcome
└─ Contextual Feedback Prompt · at most once
   ├─ 2–3 unselected contextual reasons
   ├─ optional AI7 Reason Guess · labeled `AI7 的猜测`
   ├─ 其他 / 自行输入
   └─ dismiss → no reason, no inferred judgment

质量与学习
├─ Feedback History View
│  ├─ Book / origin / time / Editorial Dimension
│  └─ exact deep link to decision or outcome
└─ governed learning decisions
   └─ only real Learning Material / eligibility / memory / audit actions
```

An ordinary optional reason never enters `待我处理`, adds an unread badge, or becomes Learning Eligibility by accumulation. `质量与学习` may later surface a real governed decision, but feedback history itself has no activation authority and grants no cross-Book source access.

## Learning Material eligibility

Eligibility begins from one identified item and keeps reuse scope explicit:

```text
candidate Learning Material · created quietly
├─ no editor decision currently required
│  └─ 质量与学习 / candidate history
└─ explicit editor decision required
   ├─ 待我处理 / Learning Eligibility Attention Item · grouped by Book
   └─ Learning Material Review Card
      ├─ bounded item/excerpt + exact provenance/version
      ├─ originating Book / Task / decision or outcome
      ├─ why candidate + possible future influence
      └─ unselected decision
         ├─ 仅纳入当前图书 · recommended
         ├─ 纳入当前书系 · exact named Series + wider consequence
         ├─ 纳入出版社经验 · House-wide consequence
         ├─ 明确排除
         ├─ 稍后决定
         ├─ 补充说明 / 自行输入
         └─ 记录学习准入决定
```

The review stays a product-record surface rather than a Policy editor. Scope means where this material may contribute learning; it is not Run Source Scope, provider outbound permission, memory activation, or permission to browse other Books. A decision deep-links into later Learning Lineage without rewriting the originating feedback, edit, or business record.

## Learning Audit and remediation

The global learning surface begins with editorial objects and reveals causality on demand:

```text
质量与学习
└─ 学习回溯
   ├─ searchable/filterable Book-grouped object list
   ├─ current eligibility/candidate/memory/downstream-use state
   └─ open one object
      └─ Learning Lineage Explorer
         ├─ backward: 为什么会影响这个结果
         ├─ Learning Material
         ├─ Learning Eligibility Decision
         ├─ Editorial Learning Signal
         ├─ Memory Candidate
         ├─ approved Book / Series / House memory revision
         ├─ forward: 后来影响了什么
         └─ downstream Tasks/results
            ├─ current use
            └─ Historically Affected Result Marker

exact material or memory item
└─ 停止今后使用
   └─ Learning Remediation Impact Preview
      ├─ 未来使用
      ├─ 正在运行
      ├─ 候选或已启用记忆
      ├─ 已完成历史
      └─ exact single/batch remediation action
```

The lineage is not rendered as an unbounded graph: one causal path and its immediate branches stay primary, while exact IDs and governing-version references expand under `审计详情`. Batch review/remediation is a list operation over an explicitly summarized same-scope set, not a new cross-Book authority container.

## Settings and on-demand Model Service setup

Local work precedes service setup; the first real blocker preserves its Task context:

```text
first launch
├─ create/import Book
├─ local reading/editing/search/history/recovery/export
└─ no Provider or credential requirement

Task requiring model processing
└─ Provider Preflight
   ├─ ready → normal Plan Preview / Run Authorization path
   └─ connection/credential not ready
      └─ Model Connection Blocker Card
         ├─ requested Model Role + exact blocker
         ├─ Model Setup Return Point
         └─ 设置模型服务
            └─ 设置 > 模型服务
               ├─ 快速交互角色 · state
               ├─ 主编辑角色 · state
               ├─ 疑难升级角色 · state
               ├─ 前沿模型角色 · state
               ├─ secondary Provider/model/fallback connections
               ├─ secondary credential replace/remove
               └─ secondary optional Run Budget Ceiling preference
                  └─ return to exact Task draft → re-run preflight

bottom application area
├─ 设置
└─ 用量 → aggregate history → exact Run detail
```

The Task surface remains role/capability-first. Model Service Settings configure persistent connections; they never become an alternate Task planner, source-scope editor, authorization surface, Background Analysis Enrollment, or hidden provider dashboard in the manuscript workspace. Provider setup may explain or offer a separate unselected Enrollment decision but cannot prefill or activate it; Issue #86 does not place or name that presentation. The trusted development/CI, fixture-recording or ordinary-production Provider-policy scope is launch authority, not a product setting, and missing/unknown scope fails closed rather than falling back across scopes.

## Data and storage settings

```text
设置
└─ 数据与存储
   └─ Data and Storage Summary
      ├─ 当前平台：Windows / macOS
      ├─ 运行方式：actual platform channel（Windows: 便携版 / 安装版）
      ├─ 数据保存在：user-readable location
      ├─ 本机占用
      ├─ 查看数据位置
      ├─ 凭据由当前系统单独保护（Windows Credential Manager / macOS Keychain），不随产品数据复制
      └─ Data Location Exception State · only when applicable
         ├─ 已改用本机位置 · Windows portable unwritable fallback
         ├─ 此位置可能被同步或备份 · non-blocking
         └─ 当前位置不受支持 · Data Location Remediation Guidance
```

Normal state remains secondary and quiet. The exact technical path can expand for support, but the first layer uses the actual platform/channel plus `本机位置`, `可能被同步` and `当前位置不受支持`; `便携版` and `安装版` appear only for the Windows channels. No path field or arbitrary location picker appears. Data/storage navigation is distinct from Book import/export and from Settings `模型服务`; viewing a location changes no product record or permission.

## Appearance settings

`设置 > 外观` groups display-only preferences:

```text
外观
├─ 应用主题
│  ├─ 跟随系统 · default
│  ├─ 浅色
│  └─ 深色
├─ 工作台密度
│  ├─ 标准
│  └─ 紧凑
└─ 稿件阅读
   ├─ 编辑 / 审读 preset
   └─ font / size / line height / text width / alignment

Native accessibility appearance
├─ Windows high contrast / forced colors
└─ applicable macOS contrast / transparency / color accessibility
```

The appearance hierarchy does not offer a custom palette or treat high contrast as decoration. All entries are local view preferences; changing one preserves exact focus, position, selection and business state.

## Keyboard settings and action-entry hierarchy

```text
设置
└─ 键盘与无障碍
   └─ 快捷键
      ├─ 导航 · eligible for remapping
      ├─ 搜索 · eligible for remapping
      ├─ 视图 · eligible for remapping
      ├─ 编辑 · native Windows/macOS editor behavior
      ├─ 权威与受控动作 · no global shortcut
      ├─ conflict explanation
      └─ 恢复默认

current work surface action hierarchy
├─ current primary / safety / named authority action
│  └─ directly visible exact contextual bar/control
├─ common contextual action
│  └─ direct labeled control or shallow disclosure
└─ secondary/infrequent action
   └─ labeled overflow / second-level menu
      └─ Discoverable Action Entry + shortcut hint
```

The hierarchy controls placement, not authority. Moving a secondary action into a menu does not rename, merge or weaken it, while a currently required Run Authorization, Proposal/Review Decision, Effect Approval or safety consequence remains in its already accepted exact context. `可发现` means a stable labeled route for pointer, keyboard and assistive technology—not permanent pixels.

## Flexible workbench and manuscript reading surfaces

```text
视图
├─ 工作台密度模式
│  ├─ 标准 · default
│  └─ 紧凑 · navigation/table/queue/metadata only
├─ 稿件阅读预设
│  ├─ 编辑
│  ├─ 审读
│  └─ 自定义
│     ├─ 字体
│     ├─ 字号
│     ├─ 行高
│     ├─ 文本宽度
│     └─ alignment/related display preferences
├─ 可见视图
│  ├─ optional cards/surfaces · show/hide/close
│  ├─ current required/safety surfaces · persistent named entry
│  └─ 恢复默认布局
└─ 在独立窗口打开稿件
   └─ Manuscript Surface Transfer
      ├─ exact Book/manuscript/branch/revision identity
      ├─ one Active Manuscript Surface Binding
      ├─ bounded service-backed editable page
      └─ Detached Manuscript Window
         ├─ editing/search/contextual operations
         ├─ exact persistence and authority states
         └─ 移回工作台

Main-workbench location while detached
└─ Detached Manuscript Placeholder
   ├─ 稿件已在独立窗口打开
   ├─ 显示独立窗口
   └─ 移回工作台

Resizable Workspace Region
├─ pointer separator
├─ keyboard resize
├─ safe minimum/maximum
└─ insufficient space → drawer / tab / vertical stack
```

Layout choices are local projections. A hidden card remains reachable from `视图`; a resized column changes no source/evidence scope; a detached window does not duplicate the Manuscript. Required identity, persistence/recovery danger and current consequential action preserve a named visible anchor even when surrounding surfaces collapse.

Detached Manuscript Window is a full host for the existing manuscript subpage, not a second product workspace or authority. The workbench does not keep a read-only body mirror: its quiet placeholder retains exact identity, durability/safety visibility and direct locate/reattach actions while the rest of the workbench remains usable. Manuscript Surface Transfer waits for IME completion and current Edit Journal acknowledgement; a durability-protection buffer stays in its originating Renderer and blocks a lifecycle step that would destroy it. Target readiness and the service-owned Active Manuscript Surface Binding switch precede source unload. Failure returns to the source-active state, and detached-window close normally means guarded `移回工作台并关闭窗口`. Background Runs and committed Effects remain governed by their own records.

## Book Work Overview

The accepted Book-level hierarchy is deliberately asymmetric in presentation and independent in authority:

```text
Book Work Overview
├─ Manuscript Visual Anchor
│  ├─ primary Manuscript exists
│  │  ├─ active branch and Manuscript Revision
│  │  ├─ Edit Journal and latest Manuscript Checkpoint state
│  │  ├─ recovery state
│  │  └─ continue editing
│  └─ no primary Manuscript
│     ├─ 尚无稿件
│     ├─ no fabricated branch / revision / journal / checkpoint / recovery state
│     └─ 导入首份稿件
├─ related Editorial Deliverables
│  ├─ Promotion Article — independent Workflow Instance
│  ├─ News Report — independent Workflow Instance
│  └─ Review Article — independent Workflow Instance
└─ Contextual Work Lenses
   ├─ Workflow, delivery and maintenance
   ├─ Tasks and Proposals
   ├─ Sources and Evidence
   ├─ Series context
   └─ History and recovery
```

The Manuscript receives the strongest visual priority because it is the central long-form work of the Book. This priority does not collapse the other Editorial Deliverables into its revision or Workflow Instance. AI7 therefore shows each deliverable's own phase and next action and never displays a single Book-wide completion percentage.

Task, Evidence, Proposal, and Workflow summaries are navigation lenses. They may expose counts, state, and next actions, but a consequential interaction opens or resolves against the exact authoritative record.

## Global Attention View

The accepted projection hierarchy is:

```text
待我处理
├─ 异常与结果待确认
│  ├─ 外部动作结果不明
│  ├─ 恢复待确认状态
│  ├─ material drift
│  ├─ 稿件冲突
│  └─ cannot-continue-safely failures
├─ 等待你的决定
│  ├─ 澄清请求
│  ├─ 计划修订
│  ├─ 提案处理决定
│  ├─ 编辑评审决定
│  ├─ 受控动作批准
│  ├─ 里程碑版本待处理
│  ├─ 发稿版本待设定
│  └─ 维护事项待处理
├─ 运行中与已暂停
└─ 最近完成
```

Only unresolved items requiring editor action in the first two groups contribute to the Actionable Attention Count. Running, paused, and completed work remains visible without creating a persistent alert badge. Every item is an Attention Projection Item that returns to its exact authoritative record.

## Manuscript work-surface modes

The central and supporting surfaces have four explicit presentation states:

```text
Manuscript Editing Mode
├─ open contextual support → Contextual Collaboration Mode
├─ open comparison/evidence/conflict task → Dedicated Work Workspace
└─ reduce distractions → Editorial Focus Mode
```

- Manuscript Editing Mode is the default and preserves the strongest central emphasis.
- Contextual Collaboration Mode adds one supporting side surface without replacing the Manuscript.
- Dedicated Work Workspace temporarily replaces the central presentation for work that genuinely needs more space, while retaining exact context and a direct return path.
- Editorial Focus Mode removes navigation and task-entry distraction but retains persistence/recovery visibility and deliberate restoration controls.

These are presentation states only. Run lifecycle, editorial decisions, manuscript state, and authority never transition merely because the visible mode changes.

## Continuous manuscript and navigation scale

The editor presents one continuous Manuscript while keeping two navigation scales visibly distinct:

```text
Continuous Manuscript Experience
├─ local reading scroll
│  └─ fine movement through the current bounded neighborhood
└─ Whole-manuscript Position
   ├─ structural location
   ├─ proportional global location
   └─ indexed distant jump
```

Crossing a rendering-window boundary is a seamless continuation of reading and editing, not a page transition. A distant indexed jump may briefly state the destination being opened, then restores ordinary editing at that location. Technical units such as renderer windows, Manuscript Blocks, cache ranges, or retrieval chunks remain hidden from normal editorial interaction.

The local scroll affordance and the whole-manuscript position control never impersonate each other. If a global projection is updating, local editing remains available and the unavailable global operation is described precisely.

## Right-side manuscript navigation

The manuscript's right contextual navigation contains at least two persistent entries:

```text
right contextual navigation
├─ 大纲
│  └─ Manuscript Outline Navigator
└─ 搜索与跳转
   └─ manuscript-wide indexed search and location controls

editor edge
└─ Whole-manuscript Position Rail
```

Only one supporting side surface expands at a time. `大纲` opens a virtualized hierarchical navigator; `搜索与跳转` opens manuscript-wide discovery and location controls while preserving the Manuscript in the center. The Whole-manuscript Position Rail stays compact and uses sparse markers rather than reproducing the whole document.

The outline is navigation-first. Structural mutation is unavailable until the editor explicitly enters Structure Adjustment Mode, which discloses affected headings and text ranges and retains durable undo. Model-authored structure changes remain Proposals and follow proposal review/application semantics.

### Search and Jump Panel

`搜索与跳转` opens one manuscript-scoped supporting surface:

```text
稿件搜索与跳转面板
├─ 文字
│  ├─ 全稿
│  ├─ 当前章节
│  └─ 当前选择范围
├─ 标题
│  └─ tolerant outline-heading lookup
└─ 位置
   ├─ structural location
   ├─ whole-manuscript proportion
   └─ revision-specific character position
```

The panel never mixes source, Series, cross-Book, or instance search into the manuscript scope. Global and source discovery remain separate surfaces with explicit scope. Search results may contribute sparse Whole-manuscript Position Rail markers and preserve one Search Return Position for deliberate return to the editor's prior context.

Search results are exact revision/range projections. Edits may mark them stale or trigger re-indexing, but AI7 never converts a Stale Search Result into a current approximate target without disclosure and exact resolution.

### Replacement expansion

Text mode may expand from discovery into replacement without changing its manuscript-only scope:

```text
文字 search
├─ 替换此处
└─ batch replacement
   ├─ 替换预览
   ├─ 冻结匹配集合
   ├─ service-side progress / pre-commit cancellation
   └─ 原子稿件替换
```

The Replacement Preview is a substantive review surface rather than a generic confirmation modal. It keeps query, replacement, scope, rules, exact revision, count, and match inclusion visible. The final service command applies the Frozen Match Set all-or-none and returns a persistence-backed completion summary. It never turns search tolerance into replacement authority and never calls the result a Manuscript Checkpoint.

## Manuscript selection anchoring

Selection has two explicit layers:

```text
Live Manuscript Selection
└─ explicit anchoring action
   ├─ text already belongs to exact Manuscript Revision
   │  └─ Pinned Manuscript Range
   │     └─ optional Manuscript Range Set for one Task/context
   └─ journal-newer Task text
      └─ non-authoritative pending range · 待保存修订版
         └─ Task Input Revision Preparation
            └─ Pinned Manuscript Range on resulting exact revision
```

The bottom Task entry and contextual supporting surface show pinned or visibly pending ranges as removable cards with structural location, short preview, character count, and exact-current/drifted/pending state. A pending range is part only of the Task Intent Draft and carries no revision pin until Task Input Revision Preparation succeeds; the visible draft list becomes a Manuscript Range Set only after every member is pinned. If the journal advances after an R1 Pinned Manuscript Range was attached, that original pin remains immutable and is labeled `待核对到任务修订版`; preparation creates a new task-bound R2 pin only after exact resolution. A changed or ambiguous reference becomes `任务范围需要重新选择` and blocks planning rather than being rebound. Editors may navigate across chapters and bounded windows to build the list without dragging one enormous live selection through unloaded text.

Each consuming record receives only its explicitly attached range or set. A preview excerpt is never the text authority; following a card Exact Fetches the bound revision and highlights the exact range. Later edits preserve ranges only when stable identities and digests resolve exactly. Changed or ambiguous targets become Drifted Manuscript Ranges and cannot silently follow similar wording.

## Editing persistence context

Editing Persistence Status remains part of the persistent Book/manuscript context rather than a transient toast. It combines separate facts when needed:

```text
editing persistence
├─ Edit Journal write
│  ├─ 正在写入修订日志…
│  ├─ 已写入修订日志
│  └─ Editing Protection Mode
│     ├─ 本地写入中断
│     ├─ Last Durable Edit Boundary
│     ├─ At-risk Edit Extent
│     ├─ Bounded Edit Safety Buffer
│     ├─ 自动重试 / 查看保护选项
│     └─ Protective Read-only State at safety limit
├─ milestone relation
│  ├─ 自里程碑版本「{标签}」后有修改
│  └─ 已保存里程碑版本「{标签}」· rN
└─ recovery context only
   └─ Recovery Snapshot identity/status
```

`保存当前编辑` flushes journal persistence. `保存为里程碑版本` is the user-facing meaningful-version action: it creates a distinct immutable Manuscript Revision through a Manuscript Checkpoint when needed, then attaches milestone designation. Milestone Version Suggestions may appear near consequential work but do not replace either command or claim completion.

Editing Protection Mode is local-durability context, not a network/offline mode. While an affected buffer exists, the center preserves that manuscript and blocks unsafe departure or graph mutation. It ends only after exact journal acknowledgement or transitions to Protective Read-only State and salvage. Provider/network failure remains a separate Task/Run condition and never downgrades local editing durability.

## Import and reimport workspaces

One Book owns at most one primary Manuscript. Standalone Book creation and import-bound Book creation share a non-authoritative draft shape but have different exact consequences:

```text
standalone 新建图书
→ 图书创建草稿
   ├─ 书名 · required
   ├─ 内部编号 · optional
   └─ effective Book Editorial Dimension Set
→ 新建图书前确认
   └─ explicitly no Manuscript / Source Version / Workflow Instance
→ 新建图书 · atomic Book + dimension-set commit
→ 图书已创建
   ├─ 打开图书
   └─ 导入首份稿件
```

An import-bound draft cannot use that empty-Book commit. Every staged file import uses a temporary Dedicated Work Workspace, persists a complete verified Staged Import Snapshot, discloses exact matches without selecting anything, and then resolves one Manuscript Import Target plus any required Existing-Book Import Relationship:

```text
选择文件
→ 本地暂存与预检
   ├─ complete Staged Import Snapshot · non-authoritative, restart-safe
   ├─ Exact Import Match
   │  ├─ exact immutable original-file identity of a prior Source Version
   │  └─ exact parsed content + structure
   ├─ Filename Collision · same name, different content
   └─ possible title candidates not yet presented as Book metadata
→ 稿件导入目标
   ├─ 新建图书
   │  └─ 图书创建草稿 · non-authoritative
   │     ├─ 建议书名 shown only here
   │     │  ├─ DOCX title metadata → primary when non-empty
   │     │  ├─ filename stem → primary fallback
   │     │  └─ bounded title-bearing early content → separately labeled alternatives
   │     ├─ 书名 · required, working title allowed
   │     ├─ 内部编号 · optional
   │     └─ 导入保真审阅
   │        ├─ 完整保留
   │        ├─ 降级导入 → explicit Import Degradation Decision
   │        └─ 不支持导入 → block editable import
   │        → 导入前确认 · new-Book path
   │           ├─ target/title + original-file identity/provenance
   │           ├─ primary Manuscript + initial branch/revision
   │           ├─ exact AI7 Workflow Profile projection / native definition pin / Workflow Instance
   │           ├─ effective Book Editorial Dimension Set
   │           ├─ final fidelity/degradation consequence
   │           └─ named non-effects
   │        → 新建图书并导入稿件
   │           └─ degraded path: 按上述降级方式新建图书并导入稿件
   │        → service progress / pre-commit cancellation
   │        → one atomic Book / Source Version / Manuscript / initialization / import-record commit
   │        → 稿件已导入
   │           └─ exact resulting 图书工作概览
   │              ├─ 打开稿件
   │              ├─ Book / primary Manuscript / Revision
   │              ├─ Source Version / provenance
   │              ├─ Workflow Instance / native Profile + AI7 projection pins
   │              └─ Manuscript Import Record
   └─ eligible exact existing 图书
      → 既有图书导入关系 · unselected
         ├─ no primary Manuscript
         │  ├─ 作为首份稿件导入
         │  │  → fidelity review + relationship-specific 导入前确认
         │  │  → atomic Source Version / primary Manuscript / branch / revision /
         │  │     Workflow Instance / Manuscript Import Record commit
         │  │  → 稿件已导入
         │  └─ 作为来源材料导入
         └─ primary Manuscript exists
            ├─ 重新导入当前稿件
            ├─ 作为来源材料导入
            └─ different intended work → change target to 新建图书

作为来源材料导入
→ target
   ├─ exact selected existing Book
   │  └─ 保存来源材料前确认
   │     → 作为来源材料导入 · atomic
   └─ 新建图书 · when no Book exists
      └─ source-bound Book Creation Draft + confirmed title
         → 新建图书前确认
         → 新建图书并导入来源材料 · atomic
→ target-Book-owned Source Version + provenance + Source Import Record
→ explicitly no Manuscript / Revision / Workflow / source-scope / factual authority
→ 来源材料已导入
   ├─ 查看来源材料
   └─ 查看来源导入记录
```

Every target and relationship starts unselected. Exact matching lists every matching Book/Source Version/record and offers `打开已有导入`, eligible `重新导入并比较`, or `按已选择的关系继续`; cross-Book matches may change the target but cannot share Book-owned source authority. Filename is never identity, and fuzzy similarity is never a duplicate or lineage proof. An eligible source-only file may instead enter the source-bound new-Book path, whose exact final action creates a zero-Manuscript Book and first Source Version atomically.

The import-bound Book Creation Draft becomes authoritative only through the combined final action, which converts it into the exact Book while importing its first Manuscript. Title candidates may be extracted during preflight but are shown and editable only after `新建图书` is selected; non-empty DOCX title metadata is primary, filename stem is the fallback, and bounded title-bearing early content supplies separately labeled alternatives. Relationship-specific Review Before Import or Review Before Source Retention names only its exact created objects and non-effects. `稿件已导入`, `来源材料已导入`, `稿件已重新导入`, and `未发现稿件变化` are distinct completions backed by Manuscript Import Record, Source Import Record, or Manuscript Reimport Record as applicable.

Reimport follows exact manuscript history rather than file replacement:

```text
重新导入当前稿件
→ dirty working state? labeled safety Manuscript Checkpoint first
→ bind exact current Manuscript Revision + Staged Import Snapshot
→ source lineage
   ├─ verified prior Book-owned Source Version
   │  └─ three-way: prior Source Version / current Revision / staged document
   └─ unverified
      └─ 来源关系未确认 · two-way current / staged
→ exact mappings + explicit ambiguity resolution
→ result
   ├─ changed
   │  └─ atomic current-Book Source Version + descendant Revision + Manuscript Reimport Record
   │     → 稿件已重新导入
   └─ no editable change
      └─ durable current-Book Source Version + Manuscript Reimport Record
         → 未发现稿件变化 · no empty Revision
```

Complete staging persists under the Agent Data Root until completion or explicit abandonment. Restart opens Import Draft Recovery with `继续导入` and `放弃`, then revalidates snapshot, target/relationship, lineage, fidelity and review; it never auto-resumes or commits. Target drift returns to the changed choice. A complete snapshot can continue after the original file becomes unreadable with disclosure, while incomplete staging requires exact native-picker reselection and parse failure retains only payload-free diagnostics. Cancellation deletes the draft/snapshot only when no uncertain atomic boundary exists. Successful completion deletes it only after the durable Source Version/link and completion record verify. Atomic-boundary interruption reconciles exact commit identity; if neither commit nor non-commit can be proven, `导入提交结果待确认` preserves staged evidence and blocks retry/cancellation cleanup rather than guessing.

Import completion and analysis scheduling remain separate branches:

```text
durable editable-import commit
├─ matching active Background Analysis Enrollment
│  └─ queue one or more exact Task / Plan / Run records
│     └─ compatible kinds may share one authorized batch Run; per-kind Result Sets/status remain independent
└─ no matching active Enrollment
   └─ analysis stays 待分析 · no Provider call, transmission or cost
```

The import record never becomes Enrollment, Provider permission, artifact enablement, Run authority, analysis success, or AI7 Apply. A queued analysis outcome remains independently reachable and cannot delay or replace `稿件已导入`.

## Source Version acquisition workspace

Source retention is always explicit and Book-targeted, regardless of where material was first seen:

```text
保存为来源材料
├─ supported local file
├─ exact editor-pasted / entered material
└─ retention-permitted fully retrieved external research snapshot
   └─ incomplete or failed retrieval → 尚未完整读取，不能保存为来源材料
→ 选择目标图书 · unselected
   ├─ exact existing Book
   │  └─ 保存来源材料前确认
   │     ├─ retained-content boundary + source type
   │     ├─ exact provenance + acquisition time
   │     ├─ Source Version + Source Acquisition Record
   │     └─ named non-effects
   └─ 新建图书
      └─ source-bound Book Creation Draft
         ├─ required confirmed 书名
         ├─ source-labeled local suggestions only where defined
         └─ 新建图书前确认
→ exact final action
   ├─ file: 作为来源材料导入 / 新建图书并导入来源材料
   └─ paste or research: 保存为来源材料 / 新建图书并保存来源材料
→ completion
   ├─ file: 来源材料已导入 + Source Import Record
   └─ paste or research: 来源材料已保存 + Source Acquisition Record
```

Search snippets, incomplete retrievals, model answers, attachments and mere Task use do not create Source Versions automatically; their own Task/evidence history may remain durable. Same-Book exact identity can be reused only after explicit selection, while a cross-Book source becomes a new target-owned Source Version with its own provenance. Acquisition creates no Manuscript, Workflow Instance, Run Source Scope, provider permission, factual status, Learning Eligibility or publication authority. `Exact Fetch / 精确获取` is reserved for resolving an already-authorized stable Manuscript Revision or Source Version, not the initial external-research retrieval.

## Coverage-aware manuscript analysis

Analysis is a Book/revision-bound product-record surface, separate from candidate retrieval and factual verification:

```text
exact Book + Manuscript Revision
└─ Manuscript Analysis Overview
   ├─ Baseline Manuscript Analysis · exact contract/version
   ├─ selected Editorial Dimension analyses · independent
   ├─ Plugin/user-defined analyses · independent
   └─ each analysis kind
      ├─ latest Manuscript Analysis Result Set Revision
      ├─ Analysis Coverage and Gap View
      │  ├─ Coverage Manifest / Analysis Units
      │  ├─ coverage
      │  ├─ reducer / synthesis closure
      │  ├─ exact-revision freshness
      │  └─ semantic / evidence assurance
      ├─ explicit gaps / conflicts / known limitations
      ├─ Analysis Result Revision History
      ├─ Analysis Update Controls
      │  ├─ 同步到当前稿件
      │  ├─ 重新分析所选范围
      │  └─ 重新分析全书
      └─ Analysis Feedback Card
         └─ exact immutable Quality Signal
```

Targeted retrieval continues to expose ranked candidates and canonical Exact Fetch ranges; it cannot satisfy the Coverage Manifest branch. Result Set Revisions are durable and immutable, keep unit/reducer/provenance/reuse lineage and do not become Manuscript text, a generic Task Outcome, an Editorial Artifact, DSH scratch state or factual truth.

`同步到当前稿件` may reuse compatible unchanged units through an explicit invalidation/reduction closure. `重新分析所选范围` bypasses prior model results for the selected range and necessary closure. `重新分析全书` bypasses all prior model results for a new full manifest. Each creates a successor Result Set Revision and keeps older revisions reachable.

Background authority remains separately disclosed from Provider setup, import and artifact lifecycle. Its final route, label and compact controls are deferred:

```text
editor considering a Background Analysis Enrollment
├─ exact Book / Series / all-Books scope
├─ selected analysis kinds
├─ Provider / outbound categories / budget
├─ prospective / backfill consequence
└─ separate explicit editor decision
   └─ Background Analysis Enrollment
      └─ each dispatch → one or more exact Task / Plan Envelope / Run records / provenance
         └─ compatible kinds may share an authorized batch Run without merging per-kind results
```

Baseline is preselected only within the separately disclosed Enrollment decision; the eight Editorial Dimensions and Plugin/user-defined kinds remain independent. Enrollment is revocable, but Issue #86 does not settle pause/disable mechanics. Model Service setup, import, artifact lifecycle, Workflow Profile activation, Default Execution Rule and DSH Session membership never create this authority. Moving the same already-authorized Run out of the foreground changes presentation only; a new idle, scheduled, import-triggered, post-checkpoint or cross-Run Provider dispatch requires a matching active Enrollment.

## Task capture entry

The bottom composer is a Context-bound Task Composer, not a chat transcript:

```text
active Book/work object
└─ Context-bound Task Composer
   ├─ requested work text
   ├─ visible exact context chips
   └─ 准备任务
      └─ right-side Task Intent Draft
         ├─ goal and target
         ├─ expected outcome
         ├─ selected manuscript ranges
         ├─ exact revision prerequisite
            ├─ journal not newer → retain current exact revision
            └─ journal newer → 为任务保存修订版
               └─ Manuscript Checkpoint purpose 任务输入
                  ├─ success → bind exact resulting revision
                  └─ failure → retain draft/edits; block authorization
         └─ later preflight/plan/authorization steps
```

The composer may be seeded from a selection, finding, evidence, Proposal, or Book overview, but it carries only explicit context. Preparing the Task expands the right contextual surface while the Manuscript remains visible. It invokes no model and creates no Run.

One unfinished draft remains durably bound to its original Book context when the editor switches Books. It collapses rather than following the switch, and the UI exposes a deliberate return route.

### Native DSH artifact resolution

Natural language remains the primary layer. The right Task surface then adds transparent native-artifact structure without exposing a parallel AI7 Task Skill runtime:

```text
natural-language goal
→ Native DSH Artifact Recommendation
   ├─ one clear recommendation
   └─ two or three unselected candidates when ambiguous
→ exact native kind / identity / revision + AI7 compatibility-authority summary
→ Progressive Task Fields
→ source / preflight / plan / authorization
```

Starting from any available artifact-discovery route joins the same Task Intent Draft path. Recommendation, discovery, acquisition, validation, installation and scoped enablement remain distinct; none creates a Task, source grant, Provider permission, Background Analysis Enrollment, per-Run activation or Effect authority.

### Reusable procedure capture

One professional-language entry classifies reuse before it asks the editor to understand native packaging:

```text
将以上工序保存为可复用工序
└─ Procedure Capture Source Set
   ├─ one completed Run; or
   └─ explicit ordered completed user-visible editorial steps
      └─ add / remove / reorder eligible steps
         └─ Reusable Procedure Extraction Preview
            ├─ 将提取什么
            ├─ 不会保存什么
            └─ Reusable Procedure Classification Preview
               ├─ existing exact artifact pattern → Default Execution Rule draft
               ├─ reusable model-assisted procedure → native DSH Skill draft
               ├─ phases / gates / responsibilities / lifecycle → Workflow-definition draft
               │  └─ AI7 Workflow Profile projection; built-in Manuscript pins `manuscript-editorial@1.0.0`, while other native carrier mappings remain deferred
               └─ new code / tool / external capability → Developer Capability Proposal
                  └─ may recommend Plugin evaluation; never creates or installs one
```

The extraction preview preserves reusable business structure while excluding manuscript instance content, Book identity, concrete sources, credentials, provider/model bindings, historical conclusions and decisions, prior authority, receipts, hidden Harness activity and unsuccessful steps. Local capture provenance remains separate. Classification never creates an interchangeable generic asset and cannot relabel code-bearing work as a declarative Skill to avoid the developer path.

### Native artifact lifecycle and management projection

The consolidated management projection has a deferred final label and placement. It exposes native artifact identity while preserving AI7-side compatibility and authority separately:

```text
artifact discovery / local capture / import
├─ exact DSH Skill · semantic procedure unit
├─ Plugin / Bundle · packaging and distribution
├─ DSH Profile / Agent Preset · native composition carrier
└─ exact identity / version / digest / provenance / license-notices
   └─ acquire exact bytes · non-executing
      ├─ imported Skill
      │  ├─ immutable Source Skill Snapshot
      │  └─ minimally derived versioned Imported Skill Working Revision
      └─ provider-free validation / required conversion
         ├─ failed / incompatible → exact reasons; repair as successor revision
         └─ eligible → review AI7 compatibility / authority ceiling
            ├─ compatible → compact visible install-and-scoped-enable may be offered
            ├─ or install disabled → later scoped enablement
            ├─ any scoped-enabled compatible revision → exact Task selection / Plan / Run authorization remain later
            └─ hooks / dependency scripts / native code → restricted pending separate executable admission
```

Install and scoped enablement remain distinct, auditable internal boundaries even when one compact visible action performs both for a compatible artifact. The source, importer, converter, validator and authoring Run cannot approve, install, enable, activate or authorize themselves. Exact catalog sources, adapter shape, sidecar/schema names, trust tiers, executable sandbox mechanics and Profile/Bundle mapping for external or user-authored artifacts remain unresolved and are not represented as product authority; the built-in Manuscript Profile's exact mapping is separately fixed by root ADR 0045.

```text
stable typed identity
├─ exact native revisions · newest first
├─ type-specific lifecycle and scope state
├─ Version-linked Work and Delivery View
│  ├─ Runs and Task Outcomes
│  ├─ Workflow Instances / Manuscript Analysis Result Sets
│  ├─ Editorial Deliverables / Editorial Artifacts
│  └─ Delivery Packages
├─ source / working / update lineage where applicable
└─ type-valid actions only
   ├─ validate / install / scoped-enable / disable / update / rollback
   └─ 删除版本 → Version Removal Preview
```

For new unpinned use, Latest Eligible Version Resolution identifies the newest scoped-enabled compatible exact native revision and freezes it with current AI7 pins before authorization. A discoverable, newer, disabled, failed, retired or incompatible revision is not eligible. Existing Runs, rules and Workflow Instances never follow a label or restored revision silently.

Deletion remains version-aware. A wholly unreferenced never-validated draft/candidate may be deleted; an authority-bearing or referenced revision becomes unavailable for future use while a Historical Version Stub preserves exact identity, provenance and links. Active Runs, enabled rule dependencies and current Workflow Instance pins block destructive removal. No deletion cascades into authoritative Book work, Result Sets or deliveries.

Discovery and Task data authority remain separate:

```text
scoped-enabled compatible native artifact
├─ management / manual-selection availability
├─ Native DSH Artifact Recommendation Applicability · optional suggestion filter
│  ├─ named Book / Series
│  ├─ Editorial Deliverable type
│  └─ Workflow phase
└─ new Task selection
   ├─ no original Book / content / result carried forward
   ├─ exact eligible revision shown and frozen before authorization
   └─ new Run Source Scope · current Book default
      └─ Series / Cross-project / House memory only by explicit selection
```

An applicability mismatch suppresses proactive recommendation but not compatible manual selection. Discovery, recommendation and manual selection are projections before exact Plan, per-Run activation and source grants.

### Imported-Skill updates and type-specific activation

```text
new upstream Imported Skill source
└─ inert reconciliation candidate
   ├─ prior immutable Source Skill Snapshot
   ├─ current Imported Skill Working Revision
   └─ new source candidate
      ├─ conflicts / validator or authority expansion → blocked for adoption
      ├─ explicit reviewed adoption
      └─ Artifact Update Rule only when trusted, conflict-free,
         validator-clean, semantically and operationally non-expansive
         └─ Imported Skill only; never Plugin, core DSH dependency or Policy
```

Rollback chooses another exact current compatible revision without rewriting history or restoring revoked authority. Running work retains its exact pin. Upstream checks and candidates remain metadata-only until an allowed adoption creates a new working revision/current selection.

```text
Workflow-definition draft
├─ 仅保存草案 → inactive successor draft
└─ 发布为新版本 → exact native carrier + immutable AI7 Workflow Profile projection
   └─ 设为新建交付成果的默认方案 · separate
      └─ future Workflow Instances only
         └─ existing-instance migration · separate impact preview

Default Execution Rule proposal
├─ 仅保存规则草稿 → inactive rule draft version
└─ 审阅并启用规则
   ├─ exact native artifact revision and allowed variation
   ├─ applicability and source rule
   ├─ Provider / egress and exact Run Budget Ceiling state
   └─ result / Effect envelope
      └─ future newly user-submitted exact matches only

Developer Capability Proposal
└─ 保存开发建议
   ├─ missing capability and affected procedure
   ├─ suggested implementation direction
   └─ possible Plugin route · separate repository-development process only
```

No shared `save and activate` action crosses these branches. Profile default designation, rule enablement, the separate Enrollment decision, artifact scoped enablement, per-Run authorization and future developer implementation remain exact type-specific boundaries; every accepted update creates a successor version rather than mutating a version already linked to work or deliveries. This does not prohibit the lifecycle's one compatible-artifact install-and-enable presentation described above.

### Quick Start and default execution addition

The compact composer now has two semantic routes:

```text
Context-bound Task Composer
├─ 准备任务 → Task Intent Draft review path
├─ 快速开始 → one-time compressed record + Run Authorization path
└─ matching Default Execution Rule
   └─ user-initiated Task starts after deterministic preflight
```

Quick Start and a Default Execution Rule skip a separate human Task Intent review surface, not the authoritative records or `Task Input / 任务输入` revision prerequisite. A rule expresses the user's prior confidence in a repeatable Task pattern and remains versioned, inspectable, bounded, and revocable.

```text
user-initiated task submission
├─ no matching rule / preflight fails
│  └─ 准备任务 standard path with exact reason
└─ one exact matching Default Execution Rule + preflight passes
   ├─ capture matching request plus every attached prior-revision or pending reference
   ├─ journal newer? create Manuscript Checkpoint with purpose Task Input / 任务输入
   ├─ exact-resolve all attached manuscript references into new task-bound pins
   │  └─ changed/ambiguous → keep draft; block Plan Preview/authorization
   ├─ create exact Task Intent and Pinned Manuscript Ranges on resulting revision
   ├─ create exact Execution Plan and Plan Envelope
   ├─ issue exact per-Run Run Authorization linked to rule version
   ├─ start Default-executed Run
   └─ show quiet rule notice + pause/cancel
```

Rule applicability and Run Source Scope are separate. A rule may apply to Books within an identified scope while each matching Run remains limited to the source rule explicitly approved for that task pattern. A default-run notice stays visible without asking for another click and expands to the full plan, scope, provider, exact Run Budget Ceiling state, and authorization record.

## Task target, readable scope, and provider-bound data

The right Task surface uses three separate regions:

```text
Task preparation
├─ 要处理什么
│  └─ Task Target Card
├─ 允许参考什么
│  └─ Source Scope Builder
│     ├─ current-Book manuscript/source versions
│     ├─ explicit Series scope + current effective exclusions
│     ├─ explicit Cross-project Books/sources
│     └─ approved House Editorial Memory
└─ 哪些内容可能发送给模型
   └─ Potential Provider Data Summary
```

The selected exact native DSH artifact proposes a minimum readable set suited to the requested outcome. The editor can adjust it through named Books, Series, source records, versions, and memory records without filesystem literacy. The builder resolves current Series membership and exclusions before authorization; later membership changes leave the frozen scope intact, while a later effective exclusion immediately stops any further affected read and requires Plan Revision plus renewed authorization or cancellation. Artifact applicability, readable scope, mutation target, and provider-bound data remain independent.

Provider-bound summary is a maximum category/scope disclosure, not a claim that every readable item will be sent or that dynamic retrieval can be predicted byte-for-byte. The final payload is assembled and checked later against the exact frozen bounds, and actual transmissions remain traceable.

## Plan Preview

The right Task surface advances into one Editorial Plan Summary:

```text
Plan Preview
├─ 目标与预计产出
├─ 处理对象与来源
├─ 执行步骤（3–7 editorial business steps）
├─ 需要你参与的位置
├─ 模型服务与预算
│  ├─ reliable estimate/range when available
│  ├─ Run Budget Ceiling: 未设置任务预算上限 by default or explicit value
│  └─ Provider Account Limit: reported value/state or 未知 / 提供方未返回
├─ 可能产生的结果与受控动作
│  └─ important `不会做` guarantees
└─ Plan Boundary Split
   ├─ 运行中可调整
   └─ 变化后必须暂停并重新授权
```

Exact source versions, native artifact revision plus AI7 compatibility/authority pins, policies, capability grants, plan fields, and digests remain available in expandable detail without becoming the default reading burden. The Plan Preview is the human projection of exact machine records and never replaces them or acts as Run Authorization.

Quick/default execution retains the same frozen preview and exact Plan Envelope in Run detail even though it does not require the editor to open the preview before dispatch.

## Standard Run Authorization

The standard path remains inside the right Task surface:

```text
Editorial Plan Summary
└─ Inline Run Authorization Bar
   ├─ Book/target + plan version
   ├─ provider + exact Run Budget Ceiling state
   ├─ outcome + possible Effect classes
   ├─ 返回修改
   ├─ 保存草稿
   ├─ online + ready
   │  └─ 授权并开始任务
   │     ├─ Run Record + exact Run Authorization
   │     └─ scheduler state: 正在排队 / 运行中
   └─ offline + exact boundary locally identifiable
      └─ 授权并在联网后开始
         ├─ Run Record + exact Run Authorization
         ├─ Connectivity Wait State: 等待网络 / 等待模型服务
         └─ Reconnect Preflight
            ├─ unchanged → normal scheduling
            ├─ material drift → 需要重新确认计划
            └─ connection/credential readiness blocker → 需要处理模型连接
```

No modal repeats the same summary. The bar exists only while Run Authorization Readiness is current. Drift replaces it with the Plan Revision route. After activation, the region becomes a status/control projection and does not continue looking like an unconsumed authorization action.

Quick Start and Default Execution Rules remain separate entry paths and do not appear as hidden checkboxes inside this authorization bar.

Offline Task Preparation changes availability, not authority. If exact provider/outbound/Credential Reference/Run Budget Ceiling boundaries cannot be identified locally, the Task remains a draft. A Connectivity Wait Run is grouped beneath its Book like other queued Runs but retains its own wait reason and cancel action; it is never grouped as local durability failure or provider activity. A live connection/credential-readiness or Provider Account Limit blocker preserves the authorization when its exact boundary is unchanged, while material drift alone routes to Plan Revision.

## Model selection and service detail

The primary Task surface gives Model Role/capability selection little vertical weight:

```text
Model Selection Strip
├─ 模型角色
└─ 模型能力要求

compact Provider and Budget Disclosure
└─ exact binding · ready/blocking · outbound · fallback · estimate · Run Budget Ceiling state
   ├─ default: 未设置任务预算上限
   ├─ Provider Account Limit: separate reported/unknown status
   └─ secondary 模型服务与预算详情
      └─ tertiary 设置 / 用量
```

Editors choose the role and capability needed for the work, not a raw model catalog or provider endpoint. Provider Preflight resolves the exact binding. The compact disclosure satisfies non-silent processing and budget visibility without becoming a large Task card; a blocker expands inline automatically.

Settings owns persistent provider connections, credentials, alternative-frontier eligibility, default bindings, and optional Run Budget Ceiling preferences. Provider account quotas/spending controls remain provider-owned. Usage owns historical/aggregate consumption. Per-Run detail owns the exact binding, fallback, ceiling state and actual cost for that Run.

## Running Run activity

Running work remains a contextual layer beside the active work object:

```text
right Task surface
└─ Run Activity Header
   ├─ editorial business phase
   ├─ current work object
   ├─ last meaningful update
   ├─ exact wait reason when present
   ├─ Measured Run Progress when a real denominator exists
   └─ expand
      ├─ Editorial Milestone Timeline
      ├─ Response Presentation Mode
      │  ├─ Waiting Only (default) → exact wait state; completed candidate only after Provider response settles
      │  └─ Interactive Stream → foreground Interactive Editorial Dialogue only
      ├─ Usable Candidate Stream
      ├─ exact terminal/blocking/continuation state
      │  ├─ 任务运行预算已达上限 → partial Task Outcome + 调整预算并重做
      │  ├─ 模型服务账户限额 → remediate → explicit 续行
      │  └─ 任务已中断 · 可续行 → explicit 续行
      └─ secondary provider / usage / diagnostic detail
```

The activity layer is compact by default and does not replace or narrow the Manuscript beyond the accepted contextual side surface. Ordinary Provider-bound Runs use Waiting Only; they do not expose progressive Provider output. An editor may explicitly move a completed candidate or evidence comparison into a Dedicated Work Workspace. Global Attention shows only a projection of phase, last milestone, and wait reason and routes back to this exact Book-owned Run context.

## Interactive Editorial Dialogue organization

Interactive question answering remains subordinate to the current editorial context:

```text
Book
└─ exact Active Work Object
   └─ Task Context Layer
      └─ Interactive Editorial Dialogue
         ├─ Dialogue Answer History
         │  ├─ question
         │  ├─ completed answer attempts
         │  └─ Incomplete Dialogue Answer attempts
         └─ active turn
            ├─ foreground
            │  ├─ optional Live Reasoning Summary (generation-only)
            │  ├─ Interactive Answer Stream
            │  └─ 停止回答
            └─ background
               └─ 等待回答
```

There is no instance-wide generic chat root. Opening a dialogue restores the exact Book, work object, Task context, answer attempt, and scroll position through exact Execution Binding and Harness Execution Span joins. Dialogue Answer History survives navigation and restart as a non-authoritative projection over Harness Session Ledger-owned messages and attempt history; it excludes Live Reasoning Summary, copies no transcript into the AI7 Task Ledger, and creates no third ledger. Moving the dialogue between foreground and background changes presentation only and does not change Provider execution, priority, scope, or authority.

Completed and incomplete answers are generated-content projections, not Manuscript, Editorial Artifact, factual-verification, Proposal, Learning Material, or Effect authority. Named actions such as `转为提案` or `用于新任务草稿` begin a separate governed object with provenance; they do not silently promote the answer, widen source/egress scope, or bypass Proposal Decision and Apply. A new Task Intent Draft is not the `Task Input / 任务输入` Manuscript Checkpoint purpose; that checkpoint appears only later if the new task meets D-075's journal-newer manuscript condition.

## Concurrent Run organization

Parallel work has two navigation projections over the same exact Run records:

```text
Global Attention
└─ Book-grouped Run Overview
   ├─ Book A
   │  ├─ Run · target · state · phase
   │  └─ Run · target · state · phase
   └─ Book B
      └─ Run · target · state · phase

current Book
└─ Current Book Run Switcher
   ├─ Foreground Run Projection (one expanded)
   └─ other Runs (compact status rows)
```

The Book grouping preserves source, privacy, and mutation context. The switcher changes only what is inspected; all Runs retain independent execution and per-Run UI position. Cross-Book opening navigates to the exact Book and target. Concurrency-capacity-queued Runs remain visible as `等待运行名额`, with stable position only when the scheduler can authoritatively supply it; Run Budget Ceiling and Provider Account Limit states never enter that queue label.

## Run pause and cancellation controls

Pause and cancel remain exact per-Run actions inside the Run Activity Header or expanded Run detail:

```text
Run controls
├─ 暂停
│  └─ 正在暂停 → 已暂停 → 续行（only if continuation remains valid）
└─ 取消任务
   └─ Cancellation Impact Summary
      └─ 正在取消
         ├─ 已取消
         └─ 结果待确认（ambiguous external outcome）
```

The switcher and Global Attention may expose these controls for the identified Run but never aggregate them into a default instance-wide kill switch. Closing, navigating, or changing presentation mode has no pause/cancel semantics.

## Clarification and choice-first input

Clarification remains inside the exact Run context while also projecting into actionable Global Attention:

```text
Run activity / Global Attention projection
└─ Context-bound Clarification Card
   ├─ question + reason
   ├─ exact Book / target / plan context
   ├─ Clarification Blocking Scope
   ├─ paused work / `其他步骤仍在继续`
   ├─ Choice-first Input Card
   │  ├─ concise choices
   │  ├─ one visibly recommended choice when useful
   │  └─ 自行输入
   └─ answer consequence
      ├─ continue inside unchanged envelope
      └─ Plan Revision + renewed authorization
```

The Choice-first Input Card is a reusable visual/input pattern, not a reusable authority. Each surface retains the exact semantic action and record it creates. It is used only when a small meaningful choice set exists; nuanced or open editorial questions keep free input primary.

## Continuation and Rewind

Continuation actions are presented together only for comparison; they retain distinct causal and authority paths:

```text
Run continuation actions
├─ 续行 Resume
│  ├─ same Run · unchanged semantics · current continuation point
│  └─ after restart: 任务已中断 · 可续行 → explicit 续行 → lightweight revalidation
│     ├─ unchanged → new Harness Execution Span in same Run
│     ├─ material drift → Plan Revision → Redo
│     └─ ambiguous Effect → 结果待确认
├─ 重试 Retry
│  └─ same Run · new safe attempt · unchanged semantics
├─ 回退并调整方向 Run Rewind
│  └─ choose Rewind Point → Rewind Impact Preview → new direction
│     ├─ inside envelope → linked Retry attempt branch in same Run
│     └─ material change → Plan Revision → newly authorized Redo Run
├─ 重做 Redo
│  └─ new Task/plan/envelope/authorization/Run identities
└─ 重放 Replay
   └─ read-only reconstruction · no execution
```

Rewind Points are an editor-readable projection of safe continuation boundaries, not a list of Harness checkpoints. Later history remains under the prior attempt as a Superseded Attempt Branch. The current authoritative state, committed Effects, receipts, and unresolved external outcomes stay visible across every branch. Safe restart reconciliation never dispatches on its own; the separate Start When Online path remains the narrow exception because the existing authorization already includes automatic dispatch after unchanged Reconnect Preflight.

## Notification hierarchy

Notification destinations remain projections over exact Book/Run records:

```text
Run event
├─ routine progress
│  └─ inline Run Activity Header / timeline only
├─ ordinary non-actionable outcome
│  ├─ Quiet Completion Notice when AI7 is foregrounded
│  └─ 最近完成
└─ action-required or abnormal event
   ├─ persistent exact item in Global Attention
   ├─ Actionable Attention Count when editor action is required
   └─ Privacy-safe System Notification when AI7 is backgrounded

successive events for one Book
└─ Book-coalesced Notification
   └─ exact separate records after opening AI7
```

Notification Settings is a tertiary application surface for ordinary-completion system notices, sound, and whether Book identity may appear. Defaults protect unpublished editorial context. Focus mode changes transient presentation only and never changes Run state or durable attention.

## Proposal review surfaces

Proposal review scales with change scope while retaining one exact Proposal identity:

```text
small single-range Proposal
└─ Contextual Proposal Review beside Manuscript
   ├─ inline semantic insertion/deletion
   ├─ Proposal Margin Anchor
   │  └─ active Manuscript-anchored Proposal Card
   │     ├─ one or more visually grouped Proposal Change Items
   │     │  ├─ 修改内容 — Proposal Change Content
   │     │  ├─ 修改理由 — Proposal Change Rationale
   │     │  ├─ 依据与核查 — Proposal Support Detail
   │     │  └─ 你的处理 — disposition + optional editor reason
   │     └─ separate item disposition unless explicitly Atomic Proposal Change Group
   └─ Bounded Proposal Comparison

large / structural / cross-chapter / multi-range Proposal
└─ explicit Dedicated Work Workspace
   ├─ Proposal Change Navigator
   │  ├─ persistent card/change identity + location + change type
   │  ├─ review / stale / conflict state
   │  └─ sparse whole-manuscript markers
   └─ Bounded Proposal Comparison
      ├─ inline Chinese-prose diff (default)
      ├─ side-by-side complex comparison
      └─ expandable rationale / source / evidence / verification
```

Every route displays Proposal base revision, current revision, and proposed state as distinct identities. Every Proposal Change Item keeps one exact anchor and decision identity across the manuscript-adjacent and Dedicated Work Workspace routes. Adjacent items may share one card group but not one disposition; only an explicitly explained Atomic Proposal Change Group is indivisible. Only the active or nearby card expands; the renderer loads only the active range and bounded context while collapsed anchors and the virtualized navigator preserve reachability. Proposal Review Return Position restores both manuscript and review state. Proposal Decision and Apply remain later, separately labeled interactions.

The four card regions retain one stable semantic order even when secondary detail collapses responsively. Proposed wording remains the primary reading object; AI7's rationale, supporting evidence/verification and the editor's own disposition reason never merge into a conversational transcript or one generic `说明` section.

## Proposal conflict workspace

Stale-base analysis first separates safe non-interaction from actual conflict:

```text
Stale Proposal Base
├─ affected target exact → continue ordinary review
├─ Safe Non-interacting Merge → show exact basis; Apply remains later
└─ Three-way Proposal Conflict
   ├─ 提案基准
   ├─ 当前权威稿件
   ├─ 提议内容
   └─ Resolution Draft
      ├─ Diff-Merge Quick Actions
      │  ├─ 采用当前内容
      │  ├─ 采用提议内容
      │  ├─ 两者都保留（explicit order, when valid）
      │  ├─ 编辑合并结果
      │  └─ undo / redo / previous / next
      ├─ regenerate against current state
      └─ 保存为新提案版本
```

The Resolution Draft is a fourth, clearly provisional surface. It may assemble all exactly non-conflicting units quickly, but conflicting units remain individually visible. Saving produces a new Proposal version with lineage and returns to review; it never writes the Manuscript.

## Proposal Decision surface

Proposal review accumulates reversible decisions before one authoritative commit:

```text
Proposal review
└─ Proposal Decision Draft
   ├─ per-change: 拟采纳 / 拟拒绝 / 暂不决定
   ├─ unresolved conflict remains excluded
   ├─ fast next-item + keyboard + undo
   ├─ exact batch scope
   │  ├─ selected items
   │  ├─ chapter / change type
   │  └─ current filter summary
   └─ 记录提案决定
      ├─ Proposal Decision Scope Summary
      ├─ immutable per-change Proposal Decision
      ├─ optional Non-blocking Decision Reason
      └─ accepted changes → 准备应用
```

The draft and its view state belong to the Proposal review workspace. The recorded decision belongs to the authoritative Task Ledger. `准备应用` is a navigation transition to a separate Effect preparation flow, not a second label for Proposal Decision.

## Apply Preparation surface

Every formal agent-originated Manuscript mutation—whether it originates in Agent Workspace, dialogue, a native Skill/Plugin, foreground/background Run or imported-Skill path—enters this one separate local AI7 Apply preparation route. Direct editor typing and separately governed deterministic import/domain commands remain distinct:

```text
recorded Proposal Decision
└─ 准备应用
   └─ Apply Preparation
      ├─ exact target Book / branch / base Manuscript Revision
      ├─ Proposal version / Proposal Decision
      ├─ Apply Change Set
      │  ├─ included accepted exact changes
      │  └─ explicit exclusions → 已采纳 · 尚未应用
      ├─ virtualized Apply Result Preview
      ├─ 会发生什么 / 不会发生什么
      ├─ current-state + structure + policy preflight
      └─ frozen Effect identity / exact Book / base pin / diff / targets / atomic scope / replay policy
         └─ separate Effect Approval interaction
```

Apply Preparation remains inside the Proposal/Dedicated Work Workspace context but reads current authoritative manuscript state. It is entirely local and uses one bounded comparison at a time. No prepared or predicted result appears as the active Manuscript Revision.

## Apply Effect Approval

The prepared exact Effect retains one inline final, single-use AI7 Apply authority boundary:

```text
frozen Apply Preparation
└─ Inline Apply Approval Bar
   ├─ target Book / branch / current revision
   ├─ Apply Change Set count + atomic scope
   ├─ expected new revision
   ├─ exact single-use Book / base / diff / targets authority statement
   └─ 批准并应用到稿件
      ├─ append exact Effect Approval
      ├─ dispatch same bound Effect
      └─ Applying Manuscript State
         └─ wait for Effect Receipt / classified outcome
```

Any exact drift routes backward to Apply Preparation instead of weakening the bar's binding. The approval bar disappears after one semantic activation and cannot be reused. No artifact, acquisition/install/scoped enablement, update rule, Default Execution Rule, Background Analysis Enrollment, DSH Session, Plugin/Agent membership or Run authorization contains or inherits Apply. Effect status remains linked from Proposal review, the active Book, and Global Attention without taking manuscript focus.

## Apply Effect Receipt and reversal

The post-dispatch surface remains one durable stateful card:

```text
Apply Effect Receipt Card
├─ 已应用
│  ├─ Effect ID + actor/time
│  ├─ old revision → new revision
│  ├─ atomic change count + Proposal Decision
│  ├─ 在稿件中查看 / 返回提案 / 查看完整凭据
│  └─ 准备撤销本次应用
│     └─ Reverse Apply Preparation → new approval/effect/receipt
├─ 未应用
│  └─ non-commit evidence + safe next action when proven
├─ 正在确认应用结果
│  └─ local idempotent Apply Outcome Recovery
└─ 结果待确认
   └─ persistent high-priority attention; no potentially repeating action
```

The card is reachable from the applied manuscript location, Proposal lineage, Run/Task history, and Global Attention when unresolved. Technical evidence remains expandable, while revision transition and exact consequence are visible by default. Reversal is a forward append to the Effect graph, never a visual deletion of history.

## Factual-verification overview

Factual verification enters through Manuscript context and remains a Book-owned editorial lens:

```text
Manuscript
├─ selected text → 核查事实 Task
├─ current chapter → 核查本章 Task
├─ whole manuscript → 全稿事实核查 Task
├─ restrained Manuscript Assertion Markers
└─ right Fact-check Lens
   ├─ virtualized Factual Review Result Items
   │  ├─ exact assertion + location
   │  ├─ attention / risk
   │  ├─ Reference Integrity
   │  ├─ Claim Support
   │  └─ Factual Verification sub-state
   ├─ chapter / status / risk / source / action filters
   ├─ whole-manuscript markers
   └─ evidence comparison → Correction Proposal route
```

The lens is not a new truth authority or global source collection. It projects exact revision-bound records and uses the current Factual Verification Policy Document. Visual marker density remains independently adjustable from which findings exist or remain actionable.

## Evidence comparison workspace

One exact assertion owns the comparison context:

```text
Assertion-centered Evidence Workspace
├─ original manuscript wording + normalized assertion
├─ Manuscript Revision / range / policy version
├─ virtualized Evidence Source Cards
│  ├─ candidate source · 尚未核对
│  └─ checked source/version
│     ├─ Exact Evidence Excerpt
│     ├─ provenance / authority / freshness / integrity
│     ├─ support / partial / contradict / context / undecided
│     └─ Evidence Source Lineage
├─ pin 2–4 → Evidence Comparison Matrix
├─ conflicting evidence retained side by side
├─ AI7 Evidence Comparison Summary (not evidence)
└─ later factual determination / Correction Proposal routes
```

Source discovery and assurance state are separate so candidate material can appear without falsely becoming evidence. The still-open assurance mode decides which checks are immediate or deferred; exact quotation, non-model evidence, lineage, and preserved conflict remain hard semantic distinctions.

## Evidence assurance levels

The same evidence workspace increases assurance through discrete completed check states instead of duplicating three workflows. This progression does not stream Provider-answer content:

```text
Evidence Assurance Level
├─ 快速整理
│  ├─ candidates + snippets + AI7 summary first
│  ├─ eligible checks lazy/background
│  └─ pending finding/draft only; no formal supported/contradicted result
├─ 标准核查 (default)
│  ├─ pinned/quoted/high-relevance source checks appear as each discrete check settles
│  └─ Minimum Evidence Gate at formal determination
└─ 严格核查
   └─ full policy-required selected-evidence assurance before determination

non-bypassable at every level
├─ model knowledge is not evidence
├─ certified quotation requires Exact Fetch
├─ unchecked derivation is not independent corroboration
├─ conflicting evidence remains visible
└─ policy minimum controls final determination
```

The compact selector appears in Task preparation and evidence detail without occupying the primary manuscript surface. Raising the level reuses existing work. Policy-required minimums disable only invalid options and explain why; they do not turn the selector into a developer settings panel.

## Factual result and Review Decision

The evidence workspace keeps assessment and editorial disposition compact but authoritative-record separate:

```text
Assertion-centered Evidence Workspace
└─ Versioned Verification Result
   ├─ assertion / range / evidence snapshot
   ├─ assurance level / policy version
   ├─ Reference Integrity
   ├─ Claim Support
   └─ Factual Verification
      └─ Factual Review Decision Card
         ├─ 接受当前核查结论
         ├─ 要求补充证据
         ├─ 维持未决
         ├─ 不采纳该核查判断
         ├─ 自行输入
         └─ 记录核查审阅决定
            └─ separate exact Review Decision
```

The result can exist without an editor decision. The decision always names its bound result version. Downstream links are contextual consequences, not bundled authorities: supplementary verification Task, close attention, or `准备更正提案`.

## Correction Proposal drafting

Correction drafting remains between accepted factual review and standard Proposal review:

```text
accepted suspected-error Review Decision
└─ 准备更正提案
   └─ Correction Proposal Draft
      ├─ finding / review / current target / evidence / policy lineage
      ├─ Minimal Correction Scope
      ├─ one clear recommendation
      │  or 2–3 unselected Correction Variants
      ├─ 自行编辑
      ├─ Linked Correction Range Set when repeated
      ├─ typed changes: quotation / reference / body / qualifier...
      ├─ persistent evidence-assurance limitations
      └─ 保存为更正提案
         └─ versioned Correction Proposal
            └─ standard Proposal review pipeline
```

The draft stays in the evidence/finding context and shows a bounded resulting-text comparison. Additional style or structure ideas branch to `另建提案`; they never expand the correction scope implicitly.

## Deliverable Workflow lens

Workflow remains one contextual projection per Editorial Deliverable:

```text
Book → Editorial Deliverable
└─ Deliverable Workflow Lens
   ├─ Workflow Profile Pin Display
   ├─ Action-first Workflow Summary: 下一项需要处理
   └─ Parallel Phase View
      ├─ 接收与准备
      ├─ 来源建设
      ├─ 起草
      ├─ 审阅与核查
      ├─ 定稿
      ├─ 交付
      └─ 维护
         ├─ Maintenance Cases by exact Publication Version
         ├─ unresolved named next action
         └─ immutable Maintenance Case Timeline

each phase → state/reason + related authoritative records
```

The Workflow Profile Pin Display names the AI7-facing profile projection and its exact native definition carrier pin without treating DSH Profile state as the durable business Workflow Instance. Multiple phase cards may be active and are ordered by actionable attention or stable profile order, never implied as one blocking sequence. Profile migration is reached from version detail, not the normal phase-state control. Workflow percentages remain absent.

## Workflow Gate card

One Gate keeps computed evidence state and human disposition in distinct regions:

```text
Workflow Gate Card
├─ Gate / Deliverable / phase / pinned profile version
├─ mandatory criteria + evidence / missing items
├─ advisory criteria + evidence / missing items
├─ downstream pass / return consequences
├─ Gate Readiness (computed only)
└─ Workflow Gate Disposition (unselected)
   ├─ 通过此关口
   ├─ 退回补充
   ├─ 有条件通过 (only if profile permits)
   ├─ 暂不决定
   ├─ 自行输入
   └─ 记录关口决定 → deterministic command
      └─ separate Review Decision record when required
```

Conditional outstanding items remain projected into the affected Workflow phases and next-action summary. Gate history remains visible after return/reopen. In the target-house profile, Milestone Version designation—not a user-facing Signoff surface—is the later exact-version action.

## Milestone Versions

The target-house workflow projects the internal exact-next-use record through familiar version language:

```text
current Deliverable / Manuscript working state
└─ 保存为里程碑版本
   ├─ required Milestone Version Label
   ├─ required Milestone Purpose
   │  ├─ 阶段留档
   │  ├─ 送审候选
   │  ├─ 交付候选
   │  └─ 其他 / 自行输入
   ├─ optional note
   └─ deterministic commit
      ├─ Manuscript Checkpoint → new revision, if needed
      ├─ Milestone Version metadata
      └─ separate internal Signoff Record for stated next use

version history
├─ multiple labeled Milestone Versions
├─ current working state · 自「{标签}」后有修改
└─ later Delivery preparation selects one exact milestone
```

Ordinary UI never presents `签发`, Signoff readiness, or signing exceptions. The milestone creates neither Delivery Package nor Public Release Permission and cannot move to later content after edits.

## Publication Version

The target-house publication authority appears as an exact version designation rather than a permission workflow:

```text
exact Milestone Version
└─ 设为发稿版本
   ├─ exact Deliverable/version
   ├─ identified publication scope/public channel
   ├─ actor/time + basis/note
   ├─ 此版本可用于发稿 · AI7 不会发布或发送
   └─ Publication Version
      ├─ linked separate internal Public Release Permission
      ├─ version history identity
      ├─ Publication Version Change Notice after material edits
      └─ 维护事项
         └─ Maintenance Case Workspace
```

The action lives in version/history and only enters Global Attention as `发稿版本待设定` when a pinned Workflow/Profile creates a real unresolved editor action. It never appears in ordinary local export. Publication Version may be referenced by a later Delivery Package or Maintenance Case, but package preparation, format choice, local Effect Approval, Effect Receipt, or maintenance status cannot create, retarget, or infer it.

## Post-designation Maintenance Cases

Maintenance is one versioned exact record path, not a note field or mutation of publication history:

```text
exact Publication Version + exact Editorial Deliverable revision
└─ 记录维护事项
   ├─ exact Book / version identity
   ├─ classification · unselected
   │  ├─ 更正
   │  ├─ 勘误
   │  ├─ 替代
   │  ├─ 撤回
   │  ├─ 再版
   │  └─ 归档
   ├─ reason / evidence / actor / time
   └─ Maintenance Case + first immutable revision
      └─ Maintenance Case Workspace
         ├─ Maintenance Case Timeline
         ├─ 更正 → Correction Proposal → normal Apply path → new revision
         ├─ 勘误 → versioned Errata Editorial Artifact
         ├─ 替代 / 再版 → separately designated newer Publication Version
         ├─ 撤回 / 归档 → Internal-only Maintenance Notice
         ├─ new local output → separate Local Export Preparation / Receipt
         └─ 记录维护事项结论 → append another case revision
```

The earlier Publication Version, Public Release Permission, Delivery Packages, exports and receipts stay immutable. Only a real unresolved next action appears in Global Attention as `维护事项待处理`. Withdrawal and Archive remain internal AI7 state and never branch to external recall, takedown, recipient notification, or file deletion.

## Delivery Package Preparation

One exact Editorial Deliverable Revision, optionally identified by an exact Milestone Version, and one editorial preparation purpose own a destination- and format-independent package context:

```text
Editorial Deliverable → 准备交付
└─ Delivery Package Preparation
   ├─ select one exact Editorial Deliverable Revision
   │  ├─ optional identifying Milestone Version
   │  └─ change-exclusion notice when later edits exist
   ├─ Delivery Package Purpose
   ├─ Delivery Package Manifest Preview
   │  ├─ included content + required Editorial Artifacts
   │  ├─ applicable Workflow Gate / Signoff references
   │  ├─ version/change/source/factual materials
   │  ├─ unresolved limitations
   │  └─ explicit exclusions / limitations
   └─ 准备交付包
      └─ Prepared Delivery Package
         ├─ stable Package ID/version
         ├─ exact Editorial Deliverable Revision + optional Milestone Version + Delivery Package Purpose
         ├─ immutable content-manifest integrity
         ├─ 交付包已准备
         └─ Package Export History
            ├─ 暂无导出记录
            └─ 0..N exact Local Export Preparations / Receipts
```

The package is browsed through product records, not internal paths. A change to its exact content, artifacts, authority references, purpose, exclusions, or limitations produces a new version; format, filename, path, fidelity disposition, and export outcome never do. V1 continues only to separate local exports and has no transfer, recipient, or delivery-tracking destination.

## Local Export and Document Representations

User-facing format hierarchy and internal agent exchange are deliberately different:

```text
exact Milestone Version or Prepared Delivery Package
└─ Local Export Preparation
   ├─ format
   │  ├─ DOCX · 主要可编辑格式
   │  ├─ PDF · 定版导出选项
   │  └─ 备用格式
   │     └─ Markdown · 明示结构/富内容损失
   ├─ Export Fidelity Review
   │  ├─ 完整保留
   │  ├─ 降级导出 · explicit unselected acceptance
   │  └─ 无法导出 · affected format blocked
   ├─ exact package/version + export-specific formats + filenames
   ├─ Export Fidelity Disposition
   ├─ Local Export Destination · current platform system picker
   │  └─ target exists → Native Export Collision Resolution
   │     ├─ alternative name/path → Resolved Local Export Target
   │     ├─ cancel → no Effect Approval / dispatch / Receipt
   │     └─ replace/overwrite or native equivalent
   │        └─ Resolved Local Export Target · replace disposition
   ├─ exact target-bound local Effect Approval
   └─ atomic file commit + reconciliation
      ├─ verified → per-file Local Export Receipt Card
      └─ ambiguous → 结果待确认 · no blind retry

exact Manuscript Revision
└─ bounded/streamed Markdown Agent Exchange Projection
   ├─ agent reads through AI7 Capabilities
   └─ agent writes → Proposal/change set, never direct authority
```

DOCX remains visually primary for ordinary editors. PDF is a visible optional export; Markdown user export stays under `备用格式` or equivalent secondary disclosure. Each format/filename/path choice belongs to one separate Local Export Preparation, and changing it leaves the exact Delivery Package untouched. Windows and macOS use their own native file-conflict labels, ordering, accessibility and equivalent rename/replace mechanics; AI7 adds no duplicate collision modal. A native apply-to-all outcome is limited to the exact enumerated collisions. Internal projection identity, revision pins, and chunking remain out of ordinary export navigation unless troubleshooting or audit context requires them. The navigation ends at exact per-file Effect Receipts: there is no send, recipient, handoff log, or delivery-confirmation child surface in V1.
