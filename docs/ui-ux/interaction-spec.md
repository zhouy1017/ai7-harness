# AI7 V1 interaction specification

Status: **V1 freeze-candidate interaction reference; not implementation authority**

This document specifies the V1 interaction contract: what each view must know, show, permit, preserve, and announce as state changes. It refines [UI/UX requirements](./requirements.md) and [information architecture](./information-architecture.md); it does not change domain authority. The Codex Desktop screenshot is a visual reference only and contributes no product objects, permissions, or interaction semantics.

Normative words have their usual meaning inside this candidate: **must** is required by the candidate V1 contract, **should** is the preferred candidate behavior unless usability evidence justifies a documented exception, and **may** is optional. Chinese labels in code formatting are user-facing labels. This candidate uses the accepted evidence labels `引证完整性`, `陈述支持`, and `事实核验`; their corresponding English concepts remain Reference Integrity, Claim Support, and Factual Verification for architecture traceability.

## 1. Global interaction invariants

Every screen and transition obeys the following rules.

1. **One authoritative work object.** The center displays one Book-owned object or one global administrative view. A queue card, notification, task conversation, or Harness Session never substitutes for the authoritative object.
2. **Exact context before action.** Any action that starts work, changes text, moves workflow state, exports material, or releases material shows the exact Book, 编辑交付成果, target version, and destination or source range first.
3. **The editor keeps focus.** Background work, progress, completion, and non-critical failures do not navigate away from the manuscript, move the caret, replace a selection, or open a panel without an explicit user action.
4. **No generic authority.** The interface never uses an unqualified `批准`, `审批`, or `允许全部`. It names `任务运行授权`, `提案处理决定`, `编辑评审决定`, `受控动作批准`, or `公开发布许可` as applicable.
5. **Decision is not outcome proof.** A user decision may authorize an attempt. Only a `受控动作回执` or explicitly classified reconciliation/manual evidence may show that a 受控动作 completed.
6. **Textual fidelity is not factual truth.** Exact text from a 稿件修订版 or 源材料版本 proves what that version says. It does not by itself prove the statement true.
7. **No silent degradation.** Import, export, retrieval staleness, conflict, provider fallback, material plan drift, partial task outcome, and recovery are disclosed in the surface where the user decides what to do.
8. **No developer concepts in ordinary work.** The default UI does not expose shell access, tool calls, subagent identities, context compaction, raw model reasoning, Harness event streams, arbitrary paths, secrets, or generic network/filesystem controls.
9. **Restart-safe attention.** 澄清请求, paused tasks, pending decisions, plan revisions, conflicts, ambiguous external outcomes, and recovery choices survive restart and remain reachable from both the Book and the global work queue.
10. **Synthetic design fixtures only.** Examples and prototypes never contain real manuscripts or manuscript-derived material.

## 2. Shell, focus, and navigation view contract

### 2.1 Shell state contract

The desktop shell renders from the following conceptual view state. This is a presentation contract, not a prescribed implementation schema.

| Field | Required meaning | Visible treatment |
| --- | --- | --- |
| navigation scope | local instance, Book, or Series view | Book name is always preserved in the title/context header when Book-owned work is open; a Series view never implies manuscript-mutation authority |
| primary object | 稿件, other 编辑交付成果, proposal, source, workflow, package, audit, or settings view | exactly one central work surface |
| exact pin | 稿件分支 and 稿件修订版, or artifact/source/package version | breadcrumb and accessible name; never inferred from the window title alone |
| journal state | unpersisted, persisting, persisted, or failed | separate status text near the revision context |
| checkpoint state | no checkpoint, current, or changes since checkpoint | never merged with journal state |
| recovery state | normal, recovered working state, restored checkpoint, or restored 恢复快照 | persistent warning until the user creates or intentionally dismisses the next checkpoint prompt |
| active inspector | none, 大纲, 编辑审读与核验, 修改建议, 来源与证据, 编辑任务, or 工作流程 | at most one expanded inspector |
| background attention | running, waiting, decision needed, failed, or completed counts | compact counters link to authoritative records |
| search scope | local instance, current Book, current 稿件, or selected sources | scope appears inside the search control and in results |

If exact context cannot be loaded, the shell shows a blocking contextual error in the center and preserves safe navigation. It must not fall back to the last viewed revision while continuing to display the requested revision label.

### 2.2 Region and focus contract

On a wide desktop the focus order is:

1. application/top-bar controls;
2. left navigation;
3. central work-surface toolbar;
4. central document or view content;
5. right context rail;
6. expanded inspector; and
7. bottom task entry when present.

`F6` cycles these regions in that order; `Shift+F6` cycles backwards. Within a region, native `Tab` order follows visual reading order. A region receiving programmatic focus shows a visible region label to screen-reader users. Closing a drawer, popover, or modal returns focus to the control that opened it. Navigating from evidence to an exact range stores a return point containing the originating task/finding, scroll position, and focused control.

No progress update, queue change, incoming result, or autosave message changes focus. Only a critical local-data condition that prevents further safe editing may open a modal; its first focus target is the problem summary, not a destructive action.

### 2.3 Left navigation contract

The left navigation contains durable destinations and convenience projections, never task transcripts as peer projects.

- `工作台` exposes `继续工作`, `待我处理`, `运行中`, and `最近完成`.
- `书库` exposes Books; opening one restores its last safe central object without automatically reopening a pending modal.
- Inside a Book, `概览`, `稿件`, `相关交付成果`, `来源与证据`, `任务与提案`, `编辑工作资料与交付包`, and `历史与恢复` are durable destinations.
- `书系` shows explicit membership and shared knowledge; it is not a folder that silently broadens task scope.
- `质量、学习与审计` and `设置` are global destinations.

Expanded/collapsed state, width, and pinned Books persist per local user. These preferences never change Book, source, mutation, learning, or provider authority. A count badge reflects current derived state; dismissing it does not resolve the underlying record.

### 2.4 Central work-surface contract

The center owns the user's current editing or review task. Navigation to a different central object with unpersisted edits first attempts to write the 修订日志. On success navigation proceeds; on failure it stays in place and offers `重试写入`, `复制未保存内容`, and safe diagnostic guidance. It never discards edits to satisfy navigation.

Opening a source, receipt, or workflow record from the right inspector may use a temporary central detail view. `返回稿件` restores the exact manuscript window, selection, inspector, and focus. Small evidence metadata may open in the inspector, but exact source text always opens a readable central surface.

### 2.5 Right rail and inspector contract

The rail shows only destinations applicable to the central object. Opening an inspector does not resize the manuscript below the V1 candidate/reference reading measure recorded in this package; at constrained width the inspector becomes an overlay drawer. Switching inspector preserves draft state in the 任务 composer and unsaved filter state in the current inspector for the duration of the app session.

Every inspector has:

- a descriptive heading and exact object binding;
- `收起` with an accessible name;
- its own internal scroll area;
- a stable empty/loading/error/content state; and
- no action that silently changes the central text.

### 2.6 Bottom task entry contract

The compact task entry appears only when a Book-owned editable/reviewable object is active. Its collapsed state shows the bound scope in plain language, for example `基于《…》稿件修订版 r17 和当前选区新建编辑任务`. It never obscures the last readable manuscript lines.

Activating it opens `编辑任务` in the inspector and places focus in the task description. The entry is not a chat history. Existing task results live under `任务与提案` and the global work queue.

### 2.7 Navigation history, close, and launch

- Back/forward traverse semantic object navigation, including exact source ranges, not every inspector toggle.
- Closing a Book view preserves the last persisted position and current inspector; it does not pause or cancel background work.
- On launch, recoverable editing state takes precedence over recent work and is labeled before restoration.
- A running task is summarized in `工作台` but never steals focus during launch.
- If no Book exists, the center offers `创建 Book` and `导入稿件`; model-service setup is a secondary readiness action and is not required for local editing.

## 3. Responsive and focus modes

The shell has four mutually consistent arrangements, not four different products.

| Mode | Interaction contract |
| --- | --- |
| wide desktop | expanded left navigation, centered manuscript, one right inspector |
| standard laptop | either left navigation or right inspector may be expanded; opening one may collapse the other |
| 1366×768 at Windows 150% | manuscript remains visible; left and right regions are temporary drawers; essential decisions fit without horizontal page scrolling |
| `专注模式` | navigation and inspector hide; breadcrumb, save/recovery state, exit control, and background-attention entry remain keyboard reachable |

At no size are four vertical panels permanent. Proposal comparison may replace the manuscript center with two columns; it may not add a permanent fourth panel. When the viewport can no longer support a legible two-column comparison, it switches to inline or tabbed `基准 / 当前 / 提案` views while preserving the same decision state.

## 4. Book, Series, and source-scope interactions

### 4.1 Book creation and overview

`创建 Book` asks for a display title and optional internal reference, then offers manuscript import. It does not ask the user to choose or create a project folder. The resulting Book is the source, privacy, and mutation authority; this is stated in user language as `本书稿的稿件、来源、任务和交付成果均在此管理`.

The Book overview is a coordination surface, not a scalar project stage. It contains:

- the current 稿件 branch/revision, journal/checkpoint/recovery state, and `继续编辑`;
- independent cards for 宣传文章, 新闻报道, and 评论文章;
- active/pending editorial tasks and proposals;
- source/evidence freshness and unresolved verification findings;
- workflow gates, delivery readiness, and recovery attention; and
- explicit Series membership when present.

Pinned/recent state changes only navigation convenience. Renaming a Book preserves stable identity and causes every open header/queue projection to refresh without changing task scope.

### 4.2 Series interaction

`书系` is an explicit governed relationship. Adding a Book to a Series previews the Series identity, available 书系知识, retrieval exclusions, and the fact that every manuscript mutation remains targeted to one Book. Removing membership previews which future retrieval scope is lost; it does not delete the Book's text, sources, task history, or prior lineage.

A task that requests Series reading shows `使用书系范围` in its source-scope editor, lists member Books and explicit exclusions, and records a `书系范围任务`. Membership alone never selects this scope. The current target Book remains visible beside Series sources throughout planning and results.

### 4.3 Source library and Cross-project selection

`来源与证据` lists governed source records by title, source type, provenance, immutable 源材料版本, Book/Series association, freshness, and availability. Importing or updating a source creates a new 源材料版本; it never overwrites the 源材料版本 pinned by a completed task.

Cross-project scope is assembled per task through a searchable selector that shows why each candidate is available and what text category may be sent to a configured provider. No `全部项目` default exists. Removing a selected source updates the draft Task Intent/Plan Preview; changing scope after authorization creates a Plan Revision. Every imported source and generated deliverable remains reachable without filesystem literacy.

## 5. Import and fidelity review

### 5.1 Import journey

Import is a staged local workflow:

```text
选择文件
  → 本地扫描与结构识别
  → 保真报告
  → 处理歧义或确认已披露降级
  → 导入确认
  → 创建来源记录和稿件修订版
  → 导入结果与回执
```

1. `选择文件` uses the Windows file picker. The UI does not ask the user to grant a roaming filesystem or agent folder permission.
2. During `分析文件`, the surface shows file name, format, size, detected pages/sections when available, and cancellable progress. Cancellation before commit leaves no Book or manuscript revision; any retained diagnostic contains no manuscript excerpt.
3. `保真报告` groups each detected feature into `保留`, `降级（需确认）`, or `不支持（阻止导入）` for inline styles, comments/revisions, notes, tables, images/captions, sections, headers/footers, and round-trip behavior.
4. Each `降级（需确认）` row states the exact change, affected count/ranges where safe, effect on the named workflow, and export/round-trip consequence. No row is pre-accepted.
5. `不支持（阻止导入）` explains whether the user can remove/convert the feature outside AI7 or choose a supported representation. The primary action remains disabled while a blocking loss is unresolved.
6. Ambiguous structure opens a comparison with source location, proposed 稿件结构块 mapping, and choices such as `作为正文`, `作为标题`, `作为注释`, or `暂不导入此项`. Reimport never silently reuses an earlier ambiguous mapping against changed input.
7. `确认并导入` summarizes accepted degradations and creates the exact source identity, provenance record, detected structure, Book association, and resulting 稿件修订版. Completion is shown only with its import 受控动作回执.

The final result gives `打开稿件`, `查看完整保真报告`, and `导出报告`. Exporting the report must not include manuscript text unless the user explicitly chooses a local destination and the report previews that inclusion.

### 5.2 Import view states

| State | Primary message | Allowed actions |
| --- | --- | --- |
| empty | supported formats and fidelity promise | choose file |
| scanning | named file and progress | cancel safely |
| reviewable | preserved and disclosed-degradation summary | inspect rows, acknowledge each degradation, import |
| blocked | named unsupported or unreadable feature | return, choose another file, view resolution guidance |
| ambiguity | mapping requires editor judgment | resolve each item, defer whole import |
| committing | staged import and validation | leave view only after warning; no duplicate commit |
| completed | resulting Book/revision and receipt | open, view report |
| failed | whether no state was created or staging can be resumed | retry safe stage, abandon staging, diagnostics without text |

## 6. Windowed long-manuscript editing

### 6.1 Editor view contract

The manuscript editor receives an exact Book, 稿件分支, 稿件修订版 ancestry, loaded block window, global block/offset mapping, 修订日志 status, 稿件修订检查点 status, and projection freshness. It renders only a bounded window while presenting one continuous manuscript experience.

The persistent editor header shows:

- Book and deliverable;
- branch and current working revision context;
- global position, for example `第 18 章 · 全稿 42%`;
- `已写入修订日志` or an honest pending/failure state;
- `自上次稿件修订检查点以来有更改` or the latest 稿件修订检查点 identity/time; and
- recovered-state disclosure where relevant.

The UI never labels a loaded window as the whole manuscript, and the native-looking scrollbar must not falsely imply that its thumb represents the full text. A global position rail/mini-map and outline provide whole-manuscript location; the content scrollbar represents only the active window and is visually distinguished.

### 6.2 Paging and selection behavior

- Scrolling or jumping near a window edge preloads adjacent 稿件结构块 without moving the visible anchor.
- Window replacement preserves the top visible stable block and relative line position; it must not flash the caret to the start.
- Exact selections carry global block identities, offsets, selected revision, and direction. A selection that crosses a window boundary expands the loaded window within a bound or uses an explicit `扩展选区` flow; it never truncates silently.
- A stale exact anchor shows `原位置已变化` with pinned and current revision identities. The user may inspect the old revision, re-anchor manually, or abandon the action; automatic fuzzy re-anchoring cannot authorize a mutation.
- Comments, findings, quotation marks, task bindings, and proposal decorations overlay the editor and do not become manuscript text.
- Copy/paste preserves supported inline structure. Unsupported pasted structure receives the same preserve/degrade/reject disclosure before insertion.

### 6.3 Whole-manuscript outline, find, and replace

`大纲` and `全稿查找` query disk-backed whole-manuscript indexes, not the loaded window.

Find results show query, scope `当前全稿`, match count or `仍在查找`, chapter/section, snippet, and revision/projection freshness. Opening a result exact-fetches the pinned current text, loads its window, highlights the range, and retains a return point. If the index result is stale, it is labeled before navigation and re-derived/re-ranked; stale indexed text is never substituted into the editor.

Replace has two modes:

- `逐项替换` previews each exact match against the current revision.
- `全稿替换` first produces a count and representative/exception preview, then stages one atomic and recoverable operation.

Long replace, reindex, statistics, verification, import, and export operations run outside the UI thread. Their progress surface shows the business operation, scope, completed/total units when knowable, current safe boundary, and `取消`. Ordinary typing remains enabled. Cancelling a staged whole-manuscript replacement changes no active text; cancelling after any independent committed 受控动作 lists their receipts and never claims rollback.

### 6.4 Writing, undo, and persistence

Keystrokes update the bounded editor immediately and append durable branch-specific 修订日志 entries asynchronously. Undo/redo applies to the current 稿件分支 and remains durable across ordinary navigation and restart to the supported 修订日志 boundary.

The status progression is:

```text
有尚未写入修订日志的更改
  → 正在写入修订日志
  → 已写入修订日志
  →（user/domain action）已建立稿件修订检查点
```

`已写入修订日志` appears only after persistence acknowledgment. It never means a 稿件修订检查点, a 恢复快照, task completion, or export. A 稿件修订检查点 action previews its reason/name, branch, included 修订日志 boundary, and projection re-derivation impact; success shows the exact new 稿件修订检查点/稿件修订版 identity.

If journal persistence fails, editing may continue only while AI7 can preserve a bounded in-process recovery buffer. The header becomes a persistent high-priority warning, and navigation/close triggers a safe recovery dialog. AI7 offers copying affected text and retrying persistence; it never shows `已保存` optimistically.

### 6.5 Chinese typography and structure

The editor preserves Chinese IME composition, full-width punctuation, ruby/annotation behavior where supported, paragraphs, headings, lists, tables, notes, captions, and accepted inline styles according to the active document schema. Block boundaries remain stable domain identities but are not exposed as technical IDs in normal editing. A structure inspector may show plain labels such as `正文段落`, `二级标题`, `表题`, and `注释`; changing structure is undoable and participates in the 修订日志.

## 7. Task Intent, planning, and execution

### 7.1 Task composer

The task composer combines natural language with a selected immutable `任务技能` version. It is not free chat and not a mandatory multi-step wizard.

Its compact summary and expandable details show:

- exact Book and 编辑交付成果;
- 稿件精确绑定, selected range, or `全稿` target;
- requested outcome and user constraints;
- selected 任务技能 and 任务编辑维度快照;
- 任务运行来源范围: current Book, explicit 书系 scope, and individually selected Cross-project sources;
- whether current journal-only changes must become a checkpoint before the task can exact-fetch them; and
- attachments/sources by governed product record, not arbitrary agent paths.

Changing a selection after opening the composer does not silently retarget the draft. The composer displays `使用原选区` and `更新为当前选区`, including both range summaries. Submitting creates a versioned `任务意图`; it does not start a Run.

### 7.2 Plan Preview view contract

`计划预览` is the human-readable projection of the proposed 执行计划 and 计划权限边界. It always shows:

1. task goal and expected `任务结果`;
2. exact Book/deliverable/revision/selection target;
3. planned editorial steps and expected proposals/artifacts;
4. 任务运行来源范围 and source exclusions;
5. model-service preflight: model roles, selected bindings in plain language, approved fallback chain, and blockers;
6. 外发数据类别 and what content may be sent for configured model processing;
7. budget/usage ceiling and user-visible stop condition;
8. requested AI7 capabilities and possible 受控动作 classes;
9. allowed `计划内调整` classes;
10. uncertainties, required evidence, and foreseeable 澄清请求; and
11. what remains separately decidable, especially proposals, workflow review, controlled actions, export, and public release.

Technical digests and version identities are available under `技术与审计信息`, except identities of developer-only Policy Documents, Agent Behavior Assets, and composition. The plain summary is sufficient to make the decision. A plan with unresolved provider, credential, source-scope, or governing-constraint blockers has no authorization action; it offers exact remediation without exposing those assets.

The primary action is `授权并开始此任务`, with nearby disclosure:

> 这将记录一次任务运行授权，仅允许在上述计划权限边界内运行。它不接受修改建议，不批准未列明的受控动作，也不构成公开发布许可。

The secondary actions are `返回修改任务` and `保存为草稿`. The view never labels plan generation or inspection as authorized execution.

### 7.3 Run Authorization and launch

Confirming records `任务运行授权` against exact Task Intent and Plan Envelope digests, then creates/starts one Run. If any bound material changes between display and confirmation, launch stops and shows the changed fields. The user must review the resulting `计划修订`; the original authorization remains historical and does not float to the new version.

A successful launch returns focus to the manuscript and opens a compact running summary in the 任务 inspector. The task joins the global work queue. The UI may use one interaction to record authorization and begin dispatch, but it must expose the authorization record separately from execution progress.

### 7.4 Running-task view contract

Normal running state shows:

- task name and Run identity;
- bound Book/deliverable/revision and current source scope;
- editorially meaningful phase and current object, such as `正在核对第 3 章日期`;
- actual-versus-planned summary and any logged 计划内调整;
- progress and expected next update, without invented percentages;
- current budget/ceiling consumption in understandable units;
- wait/block reason;
- committed 受控动作 count with receipt links; and
- `暂停` and `取消` as separate controls where safe.

Harness turns, tool calls, subagents, raw provider payloads, prompt text, and model chain-of-thought are absent. A user may continue editing or switch Books. If their edit makes the task's current projection stale, the Run follows its exact pin: it either safely continues against the pinned revision, requests a Plan Revision to target the new revision, or finishes with drift disclosed. It never silently switches.

`暂停` requests a safe continuation boundary and leaves the Run resumable. The UI may show `正在到达可暂停位置`. `取消` asks to stop unfinished work; its confirmation lists any already committed Effects and states that cancellation will not undo them. Once requested, both controls remain visible as state, not optimistic success.

### 7.5 Durable Clarification Request

A `澄清请求` contains:

- the exact ambiguity category: intent, evidence, authority, source identity, conflict, or next safe action;
- the Book/task/revision context;
- why work cannot safely continue;
- two or three concrete options when the domain supports them, with none preselected;
- a free-text answer where appropriate; and
- the consequence of each answer, including whether it changes the plan boundary.

Answering an in-envelope clarification resumes the same Run at the next safe dispatch. An answer that changes goal, scope, provider, external data, budget, capability, expected outcome, or Effect class produces a `计划修订` and does not resume automatically. Dismissing a notification leaves the clarification waiting.

### 7.6 Plan Adaptation and Plan Revision

`计划内调整` is shown as a non-blocking expandable timeline entry with original step, adjustment, reason, time, and confirmation that all envelope dimensions remain unchanged.

`计划修订` suspends the Run and opens a comparison organized by materially changed field. The view shows old and proposed goal, target, source scope, provider/fallback, 外发数据类别, budget, capabilities, outcome, Effect classes, and any policy-driven constraint change in plain language. Developer-only policy pins remain outside the editorial UI. Unchanged fields collapse by default. Actions are `授权修订后的任务计划`, `保持暂停`, and `取消任务`. Renewed authorization binds the revision; the prior plan and actual work remain immutable history.

### 7.7 Task Outcome

Every terminal Run produces a typed `任务结果`, including cancelled and partially completed Runs. Its view contains:

- requested versus actual work;
- evidence and exact links;
- generated proposals and 编辑工作资料;
- unresolved findings and questions;
- decisions made and still required;
- every planned/attempted/committed/failed/unknown 受控动作 with receipts or reconciliation state;
- plan adaptations/revisions;
- budget/provider summary without secrets; and
- one safe next action.

Labels distinguish `已完成`, `部分完成`, `等待决定`, `已取消`, and `未能完成`. `任务结果` is not displayed as authoritative manuscript text, workflow signoff, factual resolution, public release, or a 受控动作回执.

## 8. Evidence and factual verification

### 8.1 Factual finding view contract

The factual-verification workspace keeps the exact `稿件陈述` and its pinned 稿件修订版 visible beside three independent assessments:

| Display label | Question answered | States |
| --- | --- | --- |
| `引证完整性` | Does the cited identity/version/range/digest match the authentic fetched record? | `已确认`, `不匹配`, `已过期`, `无法取得`, `未检查` |
| `陈述支持` | Does the assigned evidence actually support this statement or finding? | `支持`, `部分支持`, `不支持`, `相互冲突`, `未评估` |
| `事实核验` | Under the system-governed factual-verification criteria, what is the evidence-bearing factual outcome? | `证据支持`, `证据反驳`, `证据冲突`, `尚未解决`, `不适用` |

Meaning never depends on color, and there is no aggregate green `已溯源` badge. Every status exposes rationale, the applicable criteria in user language, evidence roles, unresolved limits, and actor/time without exposing a Policy Document identity or version. Foundation Model knowledge appears only under `研究线索（不能作为事实证据）`. Professional interpretation appears as `编辑判断`, with rationale and passages, and is not styled as objective verification.

An editor can `创建更正提案`, `创建编者/作者问题`, `保留为尚未解决`, or `补充来源`. None is preselected and an unresolved status never forces a rewrite.

### 8.2 Evidence card and exact jump

Each evidence card shows source title/identity, exact 源材料版本 or 稿件修订版, evidence role, quoted range, provenance, capture/freshness, and Exact Fetch result. Quoted snippets are concise; opening the card navigates to the immutable exact version in the central surface and highlights the exact Unicode range.

The source viewer header states `正在查看固定源材料版本；不是当前稿件` or equivalent. It provides `返回核验发现项`, `复制带来源信息的引文`, and provenance details. If Exact Fetch fails or the range digest differs, no cached/fuzzy text is presented as exact. The view reports the mismatch and permits inspecting candidate 源材料版本 only as candidates.

Returning restores the original finding, chosen evidence card, inspector scroll, and keyboard focus. Cross-Book evidence outside the current task scope cannot be opened through a stale link; the view explains the current scope boundary and offers a new bounded task path rather than broad access.

## 9. Correction proposals, comparison, conflicts, and Effects

### 9.1 Proposal review view contract

A `更正提案` opens with:

- exact 提案分支（Proposal Branch） and proposal version;
- base 稿件精确绑定;
- current target branch/revision;
- originating factual finding, evidence, task, and rationale;
- scope/structure impact summary; and
- application readiness: exact match, non-interacting drift, conflict, or stale/ambiguous.

Small changes default to inline `<del>/<ins>`-equivalent semantics with deletions and insertions independently accessible. Large or structural changes offer `并排比较`; its columns are explicitly `基准修订版`, `当前稿件修订版`, and/or `提案`. At constrained width these become keyboard-accessible tabs. Unchanged context can collapse but must be expandable. Search, evidence jump, and structure labels remain usable in compare mode.

Proposal editing changes the 提案分支, never the active manuscript. The view marks editor-authored changes and refreshes the exact proposal version before a decision.

### 9.2 Proposal Decision actions

The decision menu supports the domain outcomes:

- `接受并应用`;
- `接受后由我修改`;
- `选择部分内容使用`;
- `保留为备选分支`;
- `重做此任务`;
- `拒绝提案`; and
- `暂后处理` when workflow permits.

`接受后由我修改` and selective use create/revise an exact proposal before application. `保留为备选分支` records a 提案处理决定 without changing active text. `重做此任务` leads to a new Task Intent/Run and renewed 任务运行授权; it is not a Retry. Rejecting preserves provenance and does not delete the proposal record.

### 9.3 Accept-and-apply transition

`接受并应用` is one compact interaction that may create two records. Its confirmation explicitly says:

1. `提案处理决定`: the editor accepts this exact content proposal; and
2. `受控动作批准`: AI7 may attempt to apply this exact payload to this exact target revision.

It also states that neither record proves application. After confirmation the control enters `正在验证并应用` and the view remains inspectable. Success is shown only after a manuscript-publication `受控动作回执` binds the Effect identity to the resulting 稿件修订版. The resulting state links `查看新稿件修订版`, `查看提案处理决定`, and `查看受控动作回执` separately.

If target, payload, or governing-constraint drift occurs before dispatch, the earlier content decision remains, but stale 受控动作批准 is invalid. The UI shows the reviewed and current target/payload pins plus the constraint change in plain language, without exposing a developer-only Policy Document, and offers `重新比较并批准此受控动作`, `保留为备选`, or `放弃应用`.

### 9.4 Conflict resolution

Same-block competing edits, edit/delete, interacting moves, and ambiguous structural changes enter `稿件冲突`. The resolver shows base, current, and proposal at the smallest safe structural range plus adjacent context. It describes the conflict type in editorial language and offers:

- retain current text;
- use proposal text;
- edit a manual resolution;
- apply non-conflicting items only by creating a newly scoped proposal; or
- request a model-composed resolution.

No action partially applies the original Effect. Manual resolution becomes a new exact proposal version for confirmation. A model-composed resolution remains a proposal and receives no automatic authority. Leaving the resolver preserves both branches and the unresolved conflict.

### 9.5 Effect state and receipt

Every governed application/export/publication state uses this visible lifecycle:

```text
待决定
  → 已记录受控动作批准（if required）
  → 正在暂存与验证
  → 正在提交/发送
  → 已有受控动作回执 | 外部动作结果不明 | 已证实未完成 | 已阻止
```

A receipt view shows safe identity, action class, exact target/destination, expected and resulting version, time, actor, user-visible authority records, governing-constraint outcome, and evidence class. Developer-only Policy Document identities and versions remain outside the editorial UI. It does not store or render secrets, executable commands, full payloads, or manuscript excerpts. A generic success toast, task completion, model statement, tool result, or proposal-persistence receipt cannot stand in for the manuscript-publication receipt.

For `外部动作结果不明`, automatic retry and provider/destination fallback are disabled. The view shows reconciliation attempts/evidence and offers `继续核对结果`, evidence-bound `人工结果确认` when policy permits, or a safe retry only after evidence establishes non-completion. User-attested evidence remains visibly `人工确认`, never system-verified.

## 10. Deliverable workflow, gates, signoff, and delivery

### 10.1 Deliverable overview contract

Each Book overview lists `稿件`, `宣传文章`, `新闻报道`, and `评论文章` as independent 编辑交付成果. Each card shows its exact 工作流程方案 version, current 工作流程实例 revision, primary orientation phase, waiting/gate state, responsible attribution, and next action. There is no Book-wide completion percentage.

Opening an item shows seven composable phase identities: `立项与简报`, `素材与证据准备`, `撰写与编辑`, `审读与核验`, `定稿与签发`, `交付与发布`, and `更正与归档`. Each phase independently supports `未开始`, `进行中`, `等待`, `已完成`, `已跳过（有原因）`, and `已重新打开`. Overlap is shown rather than forced into a linear wizard.

### 10.2 Workflow phase view

A phase exposes purpose, profile requirements, current evidence/artifacts, responsible attribution, entry/exit conditions, gate dependencies, decisions, state history, and exact next action. `跳过此阶段` requires a reason and shows downstream gates affected. `重新打开` creates durable history and never erases earlier completion or signoff.

AI tasks may propose records or content for a phase, but only a narrow deterministic command can change the 工作流程实例, 编辑工作资料, 工作关口, 签发记录, or 交付包. The UI never treats a completed AI task or Harness workflow as phase completion.

### 10.3 工作关口 and Review Decision

A `工作关口` view contains:

- gate name and governing Workflow Profile version;
- exact deliverable/workflow revision;
- required and present evidence;
- missing, stale, or conflicting evidence;
- required editor judgment/signoff;
- prior decisions and conditions; and
- downstream transition affected.

The decision action is named `记录编辑评审决定`, with outcomes such as `接受`, `有条件接受`, `修改后再审`, `暂缓`, or `不接受` as defined by the profile. It never says only `批准`. The confirmation states that an 编辑评审决定 is professional editorial judgment, not factual proof, a 受控动作批准, a 签发记录, 编辑学习准入, legal/regulatory authority, or 公开发布许可.

### 10.4 Editorial Artifact and Signoff Record

An `编辑工作资料` detail view shows stable type, owner Book/deliverable, version, provenance, exact pins, status, decisions, Effects/receipts, and supersession. Replacing it creates a new version or supersession link; history is not overwritten.

`签发` opens a review of the exact deliverable revision, identified evidence/gates, intended next use, actor attribution, and unresolved disclosures. `记录签发` creates a `签发记录`. Its completion message says what use is ready and explicitly states: `签发不等于公开发布许可，也不证明内容事实无误。`

### 10.5 Delivery Package, export, and public release

The `交付包` builder binds:

- exact deliverable revision;
- included 编辑工作资料 and versions;
- required 签发记录;
- named local/external destination;
- applicable 对外导出策略;
- public/non-public destination classification;
- missing requirements and disclosed fidelity limitations; and
- planned 受控动作 and required authority.

`导出到本地文件` is a bounded user-chosen file action. Before commit it previews format and round-trip fidelity; completion requires the export receipt. A handoff to a non-public external destination follows 对外导出策略 and exact 受控动作批准 as applicable.

Public release uses a separate `审查公开发布许可` view identifying the exact 未公开编辑材料, channel, audience, destination, version, and expiry/conditions if defined. Neither workflow completion, a 签发记录, an export receipt, model processing, nor any other authority preselects this permission. The final action is `授予此次公开发布许可`, followed by a separately approved/executed release Effect and its receipt.

## 11. Feedback, learning, quality, and audit

### 11.1 Non-blocking result feedback

After a proposal decision or Task Outcome, AI7 may show one compact optional prompt such as `这个结果主要好在哪里？` or `主要问题是什么？`. It never blocks continued editing, application, or navigation. Two or three context-relevant reasons are offered with none preselected, plus `其他`. If AI7 suggests a likely reason, it is visually labeled `AI7 的猜测`; the record distinguishes accepting that guess from correcting it.

Closing the prompt records no inferred reason. Factual correctness is never learned merely from proposal acceptance or a taste/style reason; factual status continues to require evidence-bearing 事实核验.

### 11.2 Learning Material decision

The `编辑学习材料` review shows the exact candidate material or bounded excerpt, provenance, originating Book/task/decision, proposed Book/书系/社级 scope, current 编辑学习准入策略 result, immediate action, and possible future influence. Actions are named `纳入编辑经验学习`, `明确排除`, or `稍后决定`; none is preselected.

An explicit inclusion/exclusion decision outranks inferred policy and is shown as an override with actor/time/reason. Inclusion grants learning influence only at the displayed scope; it never expands task retrieval scope, public-release authority, or factual authority.

### 11.3 Memory and Learning Audit

`编辑记忆` separates candidate, active, excluded, superseded, and retired material. A memory detail exposes version, scope, supporting Learning Materials, evaluation evidence, expected behavior, prior uses, and rollback/supersession. The interface never describes this as model training or LLM fine-tuning.

`学习审计记录` supports both directions:

- from a Learning Material to every memory version and task/result it influenced; and
- from a result to all material, memory, and profile versions that influenced it, plus the user-visible outcome of applicable governance without exposing developer-only Policy Document identities.

Each hop displays identity, scope, time, transformation, and decision. Links do not grant raw-text access outside the user's current authorized Book/source scope; restricted hops show metadata and the reason content is unavailable.

`排除后续使用` or forgetting first previews affected active memory, future tasks, running-task constraints, and historical audit markers. It does not imply deletion of the original manuscript, Editorial Artifact, decision, receipt, or other editorial evidence. A completed remediation links its exact Effects/receipts.

### 11.4 Quality views

Quality summaries pair `专业编辑可比交付质量` with workload displacement and sample size. They provide Book/editor/house attribution while keeping source-scope access separate. Acceptance rate is never the sole headline, and there is no per-task timer or request to log time spent.

Opening a metric shows its contributing Quality Signals, calculation version, confidence/sample limitations, and excluded material. A zero-data state allows all editing and proposal work and says only that automatic activation lacks sufficient evidence; it never blocks operation.

The editorial product contains no UI for identifying, authoring, revising, or activating 治理规则文档. Post-run evidence may be visible as audit context in user language, but Policy Documents remain hidden developer-reviewed assets. Earlier contrary design evidence remains a Commander dependency and grants no editorial-user authority.

## 12. Onboarding and settings

### 12.1 First run and data location

First run explains in plain Chinese that AI7 stores unpublished editorial work locally and that configured model calls are controlled processing. It identifies the selected channel without demanding path literacy:

- portable folder: program files under `app/`, user data under `data/` when writable;
- installer: normal data location under `%LOCALAPPDATA%\AI7`; or
- portable fallback: the same local-app-data location after a plain notice that the chosen folder was not writable.

A known sync/backup-root placement triggers a clear non-blocking warning about 未公开编辑材料. The action labels are `继续使用此位置` and `选择其他位置`; neither claims the location is unsafe by definition. Placement under a repository working tree is blocked with guided relocation. The 安全凭据库 is described as separate from portable data so copying a portable folder does not copy credentials.

Onboarding sequence is `确认数据位置` → `创建或导入 Book` → optional `连接模型服务` → optional accessibility/keyboard setup. Users can finish local editing setup without a provider.

### 12.2 Model service and credential setup

`模型服务与凭据` lists named provider connections, processing-policy compatibility, available model roles, test status, and opaque credential reference. Secret values are entered into an OS-protected field, are not re-displayed after save, and never appear in task text, results, diagnostics, or the portable folder.

Connection testing previews whether metadata or content will be sent; a credential-only validation sends no manuscript. Provider settings explain `模型服务数据处理策略`, allowed 外发数据类别, and retention/processing disclosures without presenting them as 公开发布许可. Removing a connection previews affected drafts/Runs and never reveals the secret.

### 12.3 Editorial dimensions and profiles

`编辑维度与方案` manages stable 编辑维度 identities and versioned 编辑维度方案. Creating/editing a dimension shows name, purpose, observable criteria, examples, compatible task types, and lineage. Changes are prospective: existing 任务编辑维度快照 remains pinned. `归档` replaces delete when a dimension has history; archived dimensions remain readable in prior tasks.

A Book may select its 书稿编辑维度集. Task creation snapshots it and lists any user additions/removals. A profile change never mutates an already authorized Run.

### 12.4 Workflow Profile and application settings

`工作流程方案` clearly separates editing a reusable versioned profile from viewing one deliverable's active 工作流程实例. Saving profile changes creates a new version and previews which future deliverables may use it; existing instances stay pinned unless a separate, reviewed migration is performed.

Governance Policy Documents, including the Factual Verification Policy Document, have no editorial-user settings entry or identity/version view. Factual-verification work may explain applicable criteria, source-role expectations, blockers, and escalation guidance in user language while the developer-only asset remains hidden.

Appearance, keyboard, and accessibility settings include scaling preview, manuscript type/measure options within the visual-system bounds, focus visibility, reduced motion, high-contrast compatibility, and shortcut remapping. There is no switch to a 开发端能力档案, generic shell, arbitrary network access, or filesystem escalation.

## 13. Checkpoints and recovery

### 13.1 History view contract

`历史与恢复` shows four visually and semantically separate streams:

- immutable 稿件修订版 and branch ancestry;
- per-branch 修订日志 coverage;
- meaningful 稿件修订检查点; and
- independently verified 恢复快照.

It does not mix in 源材料版本, 运行续行检查点, Harness technical checkpoints, or task Session history. Each record shows identity, branch, time, actor/cause, verification state, parent/descendant relation, and safe preview.

### 13.2 Crash/startup recovery

When recoverable state exists, launch shows a recovery comparison before reopening ordinary recent work:

| Candidate | Required label | Meaning |
| --- | --- | --- |
| journal recovery | `恢复的工作状态` | most recent durable edit-journal state; may be newer than the last checkpoint |
| checkpoint | `稿件修订检查点` | meaningful revision boundary, not necessarily newest text |
| snapshot | `恢复快照` | independently verified recovery material |

The preview shows branch, time, extent of changes, verification, and any unavailable features. `恢复并创建新后继修订版` is the preferred action. Restoration never rewrites or deletes existing history. `仅查看`, `稍后处理`, and safe export/copy are available. Choosing an older checkpoint does not silently abandon newer journal state; the latter remains recoverable until the user explicitly resolves it under retention policy.

After recovery the header persistently says `当前为恢复的工作状态` and prompts for a new checkpoint after review. Background Runs pinned to prior revisions are not retargeted.

## 14. Concurrency, waits, errors, and empty states

### 14.1 Concurrent work

Multiple Runs may execute across Books and in the background. The global work queue groups them by user attention state, not by model provider or technical Session. Each row shows Book, editorial task, meaningful phase, current status, last durable update, and next action.

When instance concurrency or budget governance delays a Run, its status is `等待可用运行资源` or `等待预算确认`, with queue position only when authoritative. The UI does not call this a failure and does not imply that another Book's scratch/cache/source content is shared. Switching or closing Books never stops a Run.

Two proposed manuscript mutations may proceed as independent proposal work, but publication to one active branch is fenced. A stale writer cannot commit; it enters drift/conflict review. The user never resolves this by granting blanket access.

### 14.2 Error taxonomy and recovery actions

| UI state | Meaning | Required response |
| --- | --- | --- |
| `需要补充信息` | durable 澄清请求 | open exact request; no generic retry |
| `计划已变化` | material plan drift | compare Plan Revision; renewed 任务运行授权 |
| `源材料版本不一致` | exact source/revision/range mismatch | inspect pins, re-fetch/re-anchor; no cached substitution |
| `稿件冲突` | competing exact manuscript changes | explicit conflict resolver; no partial apply |
| `模型服务暂不可用` | provider attempt failed before ambiguous Effect | show authorized fallback status or safe Retry rules |
| `外部动作结果不明` | action may have completed | reconcile; disable automatic retry/fallback |
| `修订日志写入失败` | local text durability at risk | persistent editor warning, retry/copy/recovery; do not navigate away |
| `本地服务已重启` | service crash/restart | editor remains available where safe; rebind from authoritative state, offer 续行 |
| `受控动作已阻止` | authority, drift, policy, or validation rejected dispatch | name exact blocker and unchanged target state |
| `任务部分完成` | some independent Effects/results exist | list committed receipts and unresolved work; never claim rollback |

Error messages answer: what happened, what remains safe/unchanged, what evidence exists, and the safest next action. Technical diagnostics are expandable and scrubbed of manuscript excerpts, credentials, prompt/provider bodies, and executable commands.

### 14.3 Empty and first-use states

- Empty `书库`: explain Books as editorial authority and offer `创建 Book` / `导入稿件`.
- Empty Book sources: explain that only explicitly imported/selected sources are available; offer bounded import.
- Empty work queue: `目前没有需要处理的任务`; link back to last Book, not to a generic chat.
- No proposals/findings: state what scope and revision were checked; absence of findings is not a guarantee of correctness.
- No evidence: distinguish `尚未添加来源`, `任务运行来源范围排除了可用材料`, `检索未找到候选项`, and `Exact Fetch 失败`.
- No configured model provider: local editing, import, history, and deterministic work remain available; task preflight gives setup guidance without implying model processing is public release.
- Empty workflow: show the pinned Workflow Profile and first eligible phase; never synthesize a Book percentage.

## 15. Resume, Retry, Redo, and Replay

These actions are always labeled and explained separately.

| User label | Identity consequence | Execution consequence | When shown |
| --- | --- | --- | --- |
| `续行` | same Run, unchanged semantics | continues from authoritative state and, if needed, a verified 运行续行检查点; may create a new technical execution span | paused/interrupted Run with a safe next dispatch |
| `重试` | same Run and semantic request | starts a new explicitly linked safe attempt | failure where evidence proves repetition is safe |
| `重做` | new Task Intent/Run authorization as needed | seeks a fresh result under newly reviewed semantics | user wants new result or goal/scope/provider/target/payload meaning changes |
| `重放` | no new Run or attempt | reconstructs existing durable records; no model call and no repeated Effect | receipt/outcome/history inspection |

Confirmation copy names these consequences. `重试` is unavailable for an 外部动作结果不明 until evidence makes repetition safe. `续行` never claims to resume in the middle of a tool call. `重放` never uses action-oriented progress or consumes model budget. A process restart may offer `续行`, but is not itself Resume.

## 16. Keyboard, Chinese IME, and accessibility

### 16.1 Keyboard contract

All essential journeys are completable without a pointer. Baseline shortcuts are discoverable in `键盘与无障碍` and control tooltips:

| Shortcut | Action |
| --- | --- |
| `F6` / `Shift+F6` | cycle shell regions |
| `Ctrl+F` | whole-manuscript find when manuscript is active; the scope label reads `当前全稿` |
| `Ctrl+H` | whole-manuscript replace preview |
| `Ctrl+S` | request immediate 修订日志 persistence and announce acknowledgment; does not create a 稿件修订检查点 |
| `Ctrl+Z` / `Ctrl+Y` | branch-local durable undo/redo |
| `Alt+Left` | return from exact evidence/detail navigation |
| `Esc` | close the topmost non-modal surface, after IME composition has handled Escape |

Potentially destructive, authoritative, or public actions have no single-keystroke shortcut. Buttons remain available for every shortcut. User remapping may change shortcuts but never removes the visible action or IME safeguards.

### 16.2 IME contract

While a `compositionstart`–`compositionend` interval is active:

- global search, task submission, proposal acceptance, navigation, panel shortcuts, and Enter/Ctrl+Enter command handling do not intercept composition keystrokes;
- candidate-window placement follows the caret and remains visible above drawers/task entry;
- window paging does not unload the composing block;
- autosave waits for a committed editor transaction and never persists a half-composed string as final text;
- Escape and arrow keys are offered to the IME first; and
- focus is never moved by progress or status announcements.

Composition behavior is tested with common Simplified Chinese Pinyin and Wubi IMEs, Chinese punctuation, candidate paging, mixed Latin/Chinese text, copy/paste, undo/redo, comments, tables, and edits at loaded-window boundaries.

### 16.3 Semantics, announcements, and contrast

- Headings, landmarks, lists, tables, tabs, dialogs, progress bars, diffs, insertions, and deletions use native accessibility semantics.
- Inline proposal deletions and insertions have text labels and can be navigated change by change; they are not represented only by red/green background.
- Status combines text, shape/icon, and color. Windows high-contrast mode retains borders, focus, selections, and diff meaning.
- Live regions announce journal failure, completion of a user-started long operation, durable clarification, and receipt creation. Routine token/progress updates are throttled and do not interrupt typing.
- Indeterminate progress is labeled `正在…` without a fabricated percentage. Determinate progress exposes current/total and cancellation availability.
- Error summaries receive focus only in modal blocking flows; inline errors are associated with their fields and summarized on submission.
- Minimum target size and spacing follow the visual-system specification; zoom and Windows 125%/150% scaling do not hide decision labels or force horizontal scrolling of prose.
- The manuscript remains readable at 200% zoom through reflow/window adjustment. Two-column comparison may become tabs, but no content or decision disappears.
- Tooltips supplement but never contain the only explanation of authority, factual status, or destructive consequence.

## 17. Authority-language guardrail

The following distinctions must be visible at the decision point and in history, not only in documentation.

| Never collapse | Required user-facing distinction |
| --- | --- |
| 计划预览 / 任务运行授权 | preview explains; authorization starts one exact bounded Run |
| 任务运行授权 / 单次执行许可 | user authorizes the Run envelope; guarded execution permission is transient technical authority and normally hidden |
| 任务运行授权 / 受控动作批准 | starting analysis does not approve a mutation, export, or external Effect |
| 提案处理决定 / 编辑评审决定 | content-proposal disposition is not a workflow-gate professional judgment |
| 提案处理决定 / 受控动作批准 | accepting wording does not by itself authorize a drifted application target |
| 受控动作批准 / 受控动作回执 | authority to attempt is not proof of completion |
| 签发记录 / 公开发布许可 | readiness for a stated next use is not authority for a named public channel |
| 模型服务数据处理 / 公开发布 | configured provider processing is controlled processing, not public release |
| 事实核验 / 编辑评审决定 | evidence-bearing factual outcome is not created by professional preference or signoff |
| 稿件修订检查点 / 恢复快照 / 运行续行检查点 | meaningful manuscript history, independent recovery evidence, and Run continuation are different records |
| 续行 / 重试 / 重做 / 重放 | same-Run continuation, safe new attempt, new Run, and read-only reconstruction have different consequences |

Any compact interaction that creates more than one exact record lists those records before confirmation and links each record after completion.

## 18. V1 interaction acceptance scenarios

The interaction design is complete only when an implementation/prototype can demonstrate these stable journey IDs with all intermediate states, keyboard focus, errors, and restart persistence:

| ID | Acceptance journey |
| --- | --- |
| **J-01** | Import a synthetic DOCX, inspect all fidelity classes, resolve structural ambiguity, accept a disclosed degradation, and open the exact resulting revision/receipt. |
| **J-02** | Edit a windowed synthetic 10M-character corpus at multiple global positions, use Chinese IME, whole-manuscript find/replace, persist the journal, create a checkpoint, and continue typing during long work. |
| **J-03** | Bind an exact selection, create a 任务意图, inspect plan/source/provider/outbound-data/budget boundaries, record 任务运行授权, keep editing, answer a clarification, and review a Plan Revision. |
| **J-04** | Inspect a factual finding with all three independent statuses, exact-fetch two evidence ranges, return without losing position, and leave one conflict unresolved. |
| **J-05** | Review a 更正提案 inline and side by side, edit/selectively use it, distinguish the two records created by accept-and-apply, and verify the new revision only through its 受控动作回执. |
| **J-06** | Cause same-block and structural drift, resolve or retain a 稿件冲突 without partial apply, and confirm that a model-composed merge remains a proposal. |
| **J-07** | Move one 编辑交付成果 through overlapping phases, record a named 编辑评审决定, create a 签发记录, build a 交付包, export locally, and separately withhold 公开发布许可. |
| **J-08** | Crash/restart with journal-only changes, compare recovered state/checkpoint/snapshot, restore as a descendant, and confirm existing Runs remain pinned. |
| **J-09** | Run tasks across two Books, pause one, cancel another after an independent committed Effect, and inspect honest partial outcomes/receipts without focus theft or cross-Book scope leakage. |
| **J-10** | Demonstrate `续行`, safe `重试`, `重做`, and read-only `重放`, including the disabled Retry path for an ambiguous external outcome. |
| **J-11** | Review optional feedback, decide a bounded 编辑学习材料, trace both directions through 学习审计记录, preview exclusion, and inspect quality/sample limitations without time tracking. |
| **J-12** | Complete first run in portable, installer, unwritable-fallback, sync-root-warning, and repository-blocked data-location states; configure a provider without exposing a secret or implying public release. |
| **J-13** | Add a Book to a Series, start an explicitly scoped 书系范围任务 with exclusions, use one Cross-project source, and verify that mutation remains bound to the target Book. |
| **J-14** | Complete every essential journey by keyboard at 1366×768 and Windows 150%, with Simplified Chinese IME, 200% zoom, and high-contrast semantics. |

These scenarios validate interaction semantics, not production persistence, editor performance, provider correctness, import/export fidelity, or Effect enforcement. Those require implementation evidence and the Standalone Editing Sufficiency Gate.
