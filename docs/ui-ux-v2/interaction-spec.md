# AI7 V2 interaction specification

Status: **Owner-approved Issue #86 successor; repository-current only in an exact integrated `dev` commit containing this revision; accepted-but-unintegrated elsewhere; not implementation evidence**

## Startup and restart

| Condition | Primary surface | Required disclosure | Prohibited behavior |
| --- | --- | --- | --- |
| One Recovery Attention State exists | Exact affected Book and Book Recovery Workspace | Durable Recovered Working State, relevant Milestone Version/Manuscript Checkpoint, any applicable verified Recovery Snapshot, and safe next actions | Global modal, silent restore/overwrite, or claiming recovery completed |
| Multiple Recovery Attention States exist | Global Attention recovery list plus one explicitly opened affected-Book workspace | Separate Book identity, urgency, durable boundary, and unresolved count | Cross-Book merge, forced global wizard, or silently choosing the newest item |
| No recovery attention; previous work resolves exactly | Last Active Work Object at its prior whole-manuscript position | Current Book, deliverable or manuscript identity, branch/revision, journal/checkpoint state, and any recovered-state label | Generic dashboard detour or silently switching to latest revision |
| No Book exists | `新建图书` / `导入稿件` | Standalone creation uses Review Before Book Creation for an intentional empty Book; import first opens an unresolved Manuscript Import Target where `新建图书` remains unselected and creates an import-bound draft only after explicit selection; local work remains available before Provider setup | Forcing model credentials, silently choosing the new-Book target, silently creating a Book, or treating either draft as authority |
| Import Draft Recovery exists | `继续导入` / `放弃` over the exact staged file, target and last completed review state | Non-authoritative status, staging completeness, target/relationship drift, original-file access state, and every review that must be repeated | Auto-resume, auto-commit, presenting it as manuscript recovery, or hiding a changed target |
| Safely reconciled interrupted Run exists | Exact Book/Task Run Activity surface and `任务已中断 · 可续行` attention | Existing Run Authorization, last durable milestone, verified Run Continuation Checkpoint, retained candidates/evidence, and `续行` consequence | Automatic Resume, new provider dispatch, calling the interruption a Retry, or hiding material drift/ambiguous Effects |

Startup resolves those rows in safety order: manuscript Recovery Attention first; then Import Draft Recovery, with Import Commit Outcome Uncertain ahead of an ordinary staged draft inside that workspace; then any Resume-ready Run State as durable attention without dispatch; then exact prior work; and finally the no-Book entry. Lower-priority state remains reachable and is never discarded by the higher-priority opening.

### Background attention

- Startup may show a compact count or quiet notification for Global Attention.
- A running or newly completed Task never replaces the Active Work Object automatically.
- A Clarification Request, pending decision, failure, or ambiguous outcome remains durable and reachable, but opening it is an editor action.
- Clicking an attention item navigates to the exact authoritative Book and record; notification dismissal changes no underlying state.

### Focus preservation

Reconstruction of the shell restores the last meaningful editor focus and whole-manuscript location when exact resolution remains possible. A Recovery Attention State may place focus on its explanation or first safe action, but it never applies recovered text merely by receiving focus.

### Standalone Book creation

| State | Primary surface | Available action |
| --- | --- | --- |
| `新建图书` opened outside import | Non-authoritative Book Creation Draft with required `书名`, optional `内部编号`, and effective Book Editorial Dimension Set | Edit, cancel, or open Review Before Book Creation |
| Review Before Book Creation ready | Exact Book identity/defaults and explicit `不创建稿件、来源材料或工作流程` plus named Series/learning/Provider/publication/delivery non-effects | `新建图书`, return to edit, or cancel |
| Atomic creation completed | `图书已创建`; intentional empty Book, not partial import | `打开图书` or `导入首份稿件` |

A manuscript-import-bound or source-bound Book Creation Draft cannot use the standalone commit without explicitly leaving its flow. Conversely, standalone creation does not inherit staged content, title suggestion, Source Version, fidelity review, Source Acquisition Record or Manuscript objects.

### Recovery comparison and restoration

| Recovery state | Primary presentation | Available action and invariant |
| --- | --- | --- |
| Durable journal state found | `恢复的工作状态` with last acknowledged persistence time and covered changes | Compare; not current authority yet |
| Checkpoint/milestone found | Exact immutable version and relation to journal state | Compare or select; never erase newer material |
| Applicable verified snapshot found | Verification identity/time and protected state | Compare or select; snapshot is not a checkpoint |
| No applicable snapshot | Quiet `没有适用的恢复快照` | Not itself an error; journal/checkpoint recovery may remain valid |
| Candidate incomplete/corrupt | Exact unavailable state, at-risk extent, and limitation | Safe salvage only when content can be reconstructed; never claim restorable |
| Selection ready | Resulting descendant preview and preserved-history statement | `恢复为新版本` |
| Restored | New descendant identity + `当前为恢复的工作状态` | Review and later `保存为里程碑版本` |
| Deferred | Persistent `恢复待确认状态` | Other Books remain usable; affected manuscript stays recovery/read-only until resolved |

- No candidate is preselected. A recommendation may favor the most complete recent durable journal reconstruction only when its verification is current and explains why.
- `恢复为新版本` is one deterministic all-or-none manuscript command. Failure leaves all source recovery material and prior authority untouched.
- `仅查看` opens bounded read-only comparison. `复制受影响内容` is salvage only; local export uses its exact Effect/Receipt path. Neither action restores, checkpoints, milestones, or resolves the candidate.
- Choosing older material keeps newer journal recovery visible and protected until a later explicit resolution under retention policy.
- `稍后处理` permits work in unaffected Books but prevents ordinary editing on the unresolved affected manuscript branch, avoiding an implicit competing working state.
- Runs and other exact revision pins remain attached to their original revisions. A process restart itself is neither restoration nor Run Resume.
- Renderer/main/service/Harness fault classes appear only in diagnostic detail unless they explain unavailable data. Ordinary copy names durable/at-risk content and the safe next action.
- If journal writes fail while editing, navigation or close never discards a bounded process-local buffer to satisfy the command. The user receives `重试写入` and safe copy/export choices, with no optimistic `已保存`.
- AI7 promises only acknowledged durable journal coverage. Input not acknowledged before interruption may be at risk and is never described as certainly recovered.

## Sidebar navigation

| Interaction | Result | Authority consequence |
| --- | --- | --- |
| Select a pinned or recent Book | Switches the current Book context and restores or opens its appropriate work object | None; convenience order grants no scope or authority |
| Open `书库` | Shows the searchable complete Book collection | None; listing a Book does not add it to a task scope |
| Select a current-Book destination | Opens that Book-owned work object or area | Context changes only; no workflow or Task transition occurs |
| Collapse the sidebar | Reduces it to recognizable destinations, current Book identity, and attention count | No underlying navigation or business state changes |
| Dismiss or reorder a recent/pinned entry | Changes the Book Convenience View | Does not delete, archive, exclude, or otherwise mutate the Book |

The sidebar never renders Books as filesystem roots or Tasks as peer chat threads. Switching Books updates the exact context used by the task entry and contextual supporting surface; drafts bound to the previous Book must remain explicitly bound rather than silently following the switch.

### Book-bound Agent Workspace

| Interaction/state | Visible result | Authority consequence |
| --- | --- | --- |
| Explicitly open Agent Workspace from an eligible exact Book context | AI7 keeps the Book and safety state visible/reachable while the eligible DSH composition occupies the primary central presentation slot | None; preserves the prior Active Work Object and creates no Task, Run, Provider or source authority |
| Compatible DSH UI Plugin renders inside the workspace | Plugin-owned inner interaction remains contained by AI7 shell and Book bindings | Cannot bypass typed AI7 Capabilities, Effects or AI7 Apply |
| Return to Book work | Restore the preserved Active Work Object and its view state | No pause/cancel, Run transition or DSH-owned business-state mutation |

Agent Workspace is an explicit Book-bound work surface, not a generic chat root and not an automatic reaction to Run activity. Entering, leaving, resizing, backgrounding or restoring it creates no Book, Workflow Instance, Background Analysis Enrollment, Proposal Decision or manuscript mutation.

## Book Work Overview

| Interaction | Result | Guardrail |
| --- | --- | --- |
| Continue from the Manuscript Visual Anchor when a primary Manuscript exists | Opens the exact active manuscript branch/revision and last resolvable whole-manuscript position | Does not silently choose `latest` when the recorded pin differs |
| Open the Manuscript Visual Anchor when no primary Manuscript exists | Shows `尚无稿件` and offers `导入首份稿件` | Creates no placeholder Manuscript, branch, revision, journal, checkpoint, recovery state, or Workflow Instance |
| Open a related Editorial Deliverable | Opens that deliverable's own Active Work Object and Workflow Instance context | Does not inherit the Manuscript's phase, decisions, or completion state |
| Open a Workflow lens | Navigates to the selected deliverable's authoritative Workflow Instance | Does not show or mutate a Book-wide scalar lifecycle |
| Open Agent Workspace | Temporarily gives the eligible Book-bound DSH composition the central presentation slot while preserving this overview/work object | Does not transfer Book, safety, workflow or Apply authority to DSH |
| Open a Task, Evidence, or Proposal lens | Navigates to the exact Book- or deliverable-bound record | Summary counts are not decisions or outcome proof |
| Open history/recovery | Shows manuscript history, journals, checkpoints, and recovery records with their distinct identities | Viewing or selecting a record does not restore it |

The overview may use visually prominent cards and quiet state summaries in the Codex-referential language. It must not let visual prominence imply that the Manuscript owns another deliverable's workflow, evidence, decision, or release authority.

## Series membership and sharing scope

| State/request | Primary surface | Result |
| --- | --- | --- |
| Open exact Series | `成员与共享范围` | Show member Books, Series Knowledge Items with immutable revisions, Candidates/promotion history, current Series Retrieval Exclusions and membership history |
| Request `加入书系` | Series Membership Impact Preview | Name Book/Series and consequences for future Tasks, frozen Runs, knowledge/learning and history |
| Commit `加入书系` against current preview | Inline exact command | Append membership and Series Membership Change Record; enable future explicit Series selection |
| Request `移出书系` | Series Membership Impact Preview | Name future removal, unchanged frozen Runs/history and separately governed knowledge/learning records |
| Commit `移出书系` against current preview | Inline exact command | Remove future membership-derived selection and append change record |
| Preview or governing state drifted | Keep command unavailable | Refresh exact preview; do not apply stale membership change |
| Start editor-authored knowledge | `提议为书系知识` | Create a non-authoritative Series Knowledge Candidate bound to the exact Series |
| Propose exact member-Book material | `提议为书系知识` with exact Manuscript Revision, Source Version or reviewed-evidence provenance | Create a provenance-bound candidate; source remains source of record |
| Candidate ready | `书系知识纳入审阅` | Show item identity, content, provenance, conflicts, existing/superseded revision and future reuse scope; `纳入书系知识` remains unavailable until review and any conflict disposition are explicit |
| Conflict disclosed | `存在书系知识冲突 · 需要处理` | Offer unselected `编辑候选项`, `保留已披露冲突`, and `取消`; preserving records the conflict and never resolves factual truth |
| Promotion committed | `书系知识已纳入` or `书系知识已更新` | Create a stable Series Knowledge Item with its first revision or append one immutable revision to the exact item, plus a Series Knowledge Promotion Decision |
| Request add/change/end exclusion | `书系检索排除影响预览` | Show exact target/scope/effective time and impact on future reads, current Runs, history and unaffected authority |
| Exclusion committed | `书系检索排除已生效` | Append exclusion revision and immediately block every later affected Series read |
| Affected queued/authorized/active Run | `书系检索范围已变化 · 需要重新确认计划` | `修改计划并重新授权` or `取消任务`; no ordinary `续行` |

### Series-membership rules

- The impact preview starts with exact Book and Series identity and separates `未来任务`, `已授权或正在运行`, `书系知识与学习` and `历史记录`. It never compresses these into `将共享所有内容`.
- Membership is eligibility for explicit future Series-scope selection, not the selection itself. It grants no Run Authorization, source scope, learning eligibility, provider egress or cross-Book mutation.
- Adding membership does not alter existing drafts/Runs automatically. Removing membership does not alter already frozen authorized/running Runs; their exact source pins and normal drift/revalidation remain visible. This prospective membership rule must never be reused for an immediate Series Retrieval Exclusion.
- Related Series Knowledge, Learning Material, eligibility, memory and lineage remain governed by their own records. Membership change neither silently activates nor deletes them.
- Final actions are `加入书系` and `移出书系`. Successful change shows the exact new membership and links its Series Membership Change Record; no generic approval or celebratory state appears.
- A failed/stale command leaves membership unchanged. Viewing, filtering or closing the workspace creates no membership change.

### Series-knowledge rules

- Candidate entry has only two paths: exact editor authorship or exact provenance from a member-Book Manuscript Revision, Source Version, or reviewed evidence. Membership, model output, Learning Eligibility, Proposal acceptance and Milestone designation never auto-populate governed knowledge.
- A candidate remains non-authoritative and absent from Series retrieval until the exact promotion review commits. Conflict copy is `存在书系知识冲突 · 需要处理`; no competing statement is preselected or merged silently. The unselected handling choices are `编辑候选项`, `保留已披露冲突`, and `取消`. Preserving a disclosed conflict permits the final commit only after explicit selection and stores the conflict on the revision; it never resolves factual truth.
- `纳入书系知识` creates a stable item with its first immutable revision or appends one immutable revision to the exact selected item, plus a promotion decision. It never rewrites the Book/source of record, establishes factual truth, creates Run Source Scope, authorizes or performs retrieval, permits provider transmission, decides learning eligibility, mutates a manuscript, or authorizes publication. The revision becomes eligible only for later exact Series-scoped selection and pinning.
- Candidate/provenance/conflict drift invalidates the review. Failure or cancellation retains safe draft input but creates no knowledge revision or promotion decision.

### Series-retrieval-exclusion rules

- The target may be an exact member Book, Source Version, Series Knowledge Item, or stable knowledge class. An item target covers its current and future revisions; a class target also covers later matching items. The preview states the exact continuing behavior and shows optional reason, actor and effective time.
- Create, change and end are append-only revisions. Ending or narrowing an exclusion does not restore an old authorization or auto-resume stopped work.
- Once committed, the current read guard blocks not-yet-performed affected reads in queued, authorized and active Runs. The original Plan Envelope, Run Authorization, Execution Binding, already-fetched evidence, Session/history and completed results remain immutable; data already sent to a Provider cannot be recalled.
- A stopped Run cannot use same-binding `续行`, Retry, fallback or silent substitution. Only a current Plan Revision plus renewed Run Authorization may resume permissible work; cancellation remains available.
- Completed results receive `此结果使用的材料后来被排除` when applicable. The marker is historical impact, not deletion or a factual verdict.
- The restriction belongs to the Series retrieval path only. It does not globally delete/hide the Book or source, decide Learning Eligibility, or silently decide separately authorized Cross-project access.

## Global Attention

| Group | Includes | Badge | Primary interaction |
| --- | --- | --- | --- |
| `异常与结果待确认` | Ambiguous external outcomes, recovery attention, material drift, Manuscript Conflicts, and cannot-continue-safely failures | Counts unresolved editor-action items | Open exact reconciliation, recovery, refresh/reselection, conflict, or failure record |
| `等待你的决定` | Clarification Request, Plan Revision, Proposal Decision, Review Decision, Effect Approval, plus target-house `里程碑版本待处理` and `发稿版本待设定` projections over internal Signoff/Public Release records | Counts unresolved editor-action items | Open exact named decision context |
| `运行中与已暂停` | Current business-readable Run phase, next step, and wait reason | Does not count | Open bound Run projection without taking authority from the Task Ledger |
| `最近完成` | Recent Task Outcomes, Effect Receipts, and classified outcomes | Does not count | Open exact outcome or receipt; aging out changes only the projection |

### Ordering and naming

- Exceptions and unresolved outcomes precede ordinary pending decisions; both precede routine activity and completion history.
- Every decision item uses its exact preferred Chinese label. The surface never substitutes `待审批`, `批准`, or another generic decision word.
- Within a group, blocked work precedes non-blocking work; stable user-set priority then precedes age. Mere arrival recency never moves routine activity above an unresolved consequential item.
- Dismissing a notification or filtering a group changes only the projection. It cannot answer a clarification, decide a proposal, authorize an Effect, sign off a deliverable, grant public release, reconcile an outcome, or cancel a Run.

## Manuscript work-surface modes

| Mode | Central surface | Supporting surfaces | Entry and exit |
| --- | --- | --- | --- |
| Manuscript Editing Mode | Manuscript | Sidebar visible/collapsed; contextual support closed | Default on normal manuscript entry; opens another mode only by explicit editor action |
| Contextual Collaboration Mode | Manuscript with exact relevant range visible | One Task, Evidence, Proposal, or Workflow surface | Open/close context without losing selection or scroll position |
| Dedicated Work Workspace | Large comparison, factual review, multi-evidence view, or conflict resolution | Exact context header; optional task/evidence controls | Explicit open; explicit `返回稿件` restores prior manuscript location |
| Editorial Focus Mode | Manuscript | Navigation, contextual support, and task entry hidden; necessary save/recovery state retained | Explicit command/shortcut; explicit restoration controls |

### Mode invariants

- Starting, pausing, clarifying, failing, completing, resuming, retrying, redoing, or replaying a Run never changes mode automatically.
- Opening a contextual surface preserves the exact manuscript selection or location that motivated it.
- Returning from a Dedicated Work Workspace restores the prior resolvable manuscript location and selection; if the pin drifted, the UI explains the mismatch rather than silently targeting current text.
- Editorial Focus Mode does not pause background work, hide persistence failure, suppress recovery attention, or alter capabilities.
- Only one expanded contextual supporting surface exists at a time; AI7 never creates four permanent vertical regions.

## Bounded-window continuity

| Interaction | Visible behavior | Required invariant |
| --- | --- | --- |
| Fine wheel/trackpad/keyboard scroll | Text moves continuously through the current neighborhood and prefetches the adjacent neighborhood | No load-more control, boundary flash, cursor jump, selection loss, or IME interruption |
| Cross a rendering-window boundary | The anchor content remains visually stable while the service changes the bounded projection | The editor never exposes a technical page, block, or window transition |
| Distant outline/search/global-position jump | A short destination-oriented loading state appears, then the exact target neighborhood opens | Exact revision and target resolve before focus is placed; failure does not silently select nearby current text |
| Whole-manuscript index updating | Current bounded editing continues; unavailable global operations show a precise updating state | AI7 does not claim global completeness or disable unrelated local editing |

### Position disclosure

- Whole-manuscript Position combines human-recognizable structure with proportional location, for example `第三编 · 第十二章 · 全稿 37%`.
- Local scroll and Whole-manuscript Position have distinct visual affordances and accessible names.
- The UI never communicates renderer-window size, Manuscript Block identity, cache boundaries, or retrieval-chunk boundaries as normal navigation concepts.
- A position restored after restart or return is exact when resolvable; when it cannot be resolved, AI7 explains the fallback rather than silently moving to the beginning or latest nearby text.

## Outline and structure adjustment

| State or interaction | Visible behavior | Mutation rule |
| --- | --- | --- |
| Open `大纲` | Expands the Manuscript Outline Navigator in the one contextual supporting surface | Navigation only |
| Follow editor position | Marks the current heading without forcibly scrolling away from the editor's manually browsed outline location | No mutation |
| Click an outline entry | Loads and focuses the exact indexed manuscript location | No approximate targeting when the projection is stale |
| Enter `调整结构` | Changes the outline to an explicit structural-edit state and exposes affected-range disclosure | Enables editor-authored deterministic structural commands only |
| Move or change hierarchy | Previews affected headings and text range, then records the accepted change in current working state with durable undo | Does not create or apply a model Proposal |
| Review a model-suggested move | Opens Proposal review with exact base/current/proposed structure | Cannot be converted into an ordinary outline gesture |

### Whole-manuscript Position Rail

- Shows coarse global position and sparse markers only.
- Marker families are filterable so search hits, findings, Proposals, and comments do not create an unreadable rail.
- Selecting a marker performs an exact indexed jump and preserves the return position.
- A stale marker is disabled or visibly re-resolved; it never silently jumps to similar current text.

### Search and Jump Entry

`搜索与跳转` remains present in the right contextual navigation alongside `大纲`. Opening it uses the same single supporting surface and keeps the Manuscript central.

| Mode | Accepted input | Result behavior |
| --- | --- | --- |
| `文字` | CJK-aware substring or exact phrase; ordinary Latin case/whole-word options; scope of whole Manuscript, current chapter, or exact selection | Virtualized results grouped by heading with context, total count, revision/range identity, next/previous navigation, and sparse rail markers |
| `标题` | Tolerant heading text | Virtualized outline matches that jump only after exact current-revision resolution |
| `位置` | Structural location, whole-manuscript proportion, or revision-specific character position | Opens the exact indexed neighborhood; page number appears only for an identified layout version |

### Search interaction invariants

- Search and jump are local and never require a provider, credential, Harness, or network.
- The panel's scope is always visible and never expands beyond the current Manuscript; source/global search uses another surface.
- Enter and Shift+Enter move to next and previous results without closing the panel.
- Following the first result records a Search Return Position; `返回原位置` restores it when still resolvable.
- An edit that invalidates revision/range identity marks the result stale or refreshes it against current state. A stale result cannot silently navigate to similar text or become a replacement target.
- The panel remains open across jumps and closes only by explicit editor action or a deliberate switch to another right-side destination.

## Replacement

| Action/state | Required interaction | Outcome |
| --- | --- | --- |
| `替换此处` | Revalidate exact current result immediately before edit | One normal journal-backed edit with durable undo |
| Open selected/all replacement | Show Replacement Preview with query, replacement, scope, rules, revision, count, grouped context, and inclusion controls | No manuscript mutation |
| Confirm preview | Freeze exact included revision/range identities as the Frozen Match Set | Staged service operation; still no mutation |
| Service processing | Show business-readable progress and allow cancellation before atomic commit | Editor may work elsewhere; cancellation writes nothing |
| Revalidation detects intersecting drift or changed match-set meaning | Stop and identify why preview must refresh | No partial replacement and no skipped stale match |
| Atomic commit succeeds | Persist every replacement as one undoable Edit Journal transaction, then show exact completion summary | Not a Manuscript Checkpoint |
| User requests cancellation after commit | Offer normal manuscript undo/history actions | Never claim committed text was cancelled |

### Replacement safeguards

- Search normalization, tolerant heading lookup, fuzzy matching, or nearby text cannot add a replacement target.
- A replacement target is eligible only when it appeared in the reviewed Frozen Match Set and still exact-resolves at commit.
- Excluding a match is part of the frozen intent and remains visible in the preview summary.
- Progress before atomic commit never increments a visible `已替换` count; processed/revalidated items are not committed items.
- The completion message appears only after journal persistence acknowledgement and reports the exact committed count and scope.

## Manuscript selection anchoring

| Interaction/state | Visible behavior | Binding consequence |
| --- | --- | --- |
| Select text | Show ordinary editing selection and context actions | Live Manuscript Selection only; no durable context |
| `加入任务范围` on revision-exact text | Add a range card with chapter/location, preview, character count, and current state | Creates one Pinned Manuscript Range for the current Task draft |
| `加入任务范围` on journal-newer text | Add the same card labeled `待保存修订版` | Retains a non-authoritative pending range in the Task Intent Draft; no Pinned Manuscript Range exists until Task Input Revision Preparation succeeds |
| Add another distant range | Preserve existing cards while the editor navigates and selects elsewhere | Extends the exact Manuscript Range Set when all cards are pinned, or the visible Task Intent Draft range list while any card remains pending; never creates a cross-window live selection |
| Create comment/finding/Evidence Link/Proposal context | Ask for or use the explicitly relevant current/pinned range | Does not inherit every range in a Task set unless explicitly selected |
| Open a range card | Load the exact bound neighborhood and highlight it; preserve a return location | Preview text is not authoritative; Exact Fetch supplies wording |
| Target changes but exact stable resolution succeeds | Mark current and update visible location metadata without changing intended text | Range remains valid with recorded derivation/re-resolution history |
| Target text/structure no longer resolves exactly | Mark `范围已变化` and offer difference review, reselection, or removal | Cannot be used for new authority-bearing work until resolved |

### Selection invariants

- Anchors use Unicode grapheme boundaries rather than byte, UTF-16 code-unit, visual line, or renderer-window offsets.
- Active Chinese IME composition is never committed, cancelled, or captured by anchoring or Task shortcuts.
- Unrelated edits do not invalidate an exact-resolvable range; affected text or ambiguous structural interactions do.
- Reordering or removing a range card changes the Task draft's context presentation only; it does not mutate manuscript text.
- A Drifted Manuscript Range cannot be silently remapped through fuzzy, vector, or nearby-text matching.

## Editing persistence and checkpoints

| Trigger/state | Visible wording | Meaning and action |
| --- | --- | --- |
| Edit awaiting journal acknowledgement | `正在写入修订日志…` | Working input exists but durability is not yet confirmed |
| Journal acknowledgement, no newer pending edit | `已写入修订日志` | Current edits are durable in the Edit Journal; no checkpoint implication |
| Durable journal differs from latest milestone | `已写入修订日志 · 自里程碑版本「{标签}」后有修改` | Durable working state exists after the latest designated immutable version |
| Manuscript-bound Task needs exact input while journal is newer than latest revision | `为任务保存修订版` | Create one Manuscript Checkpoint with purpose `任务输入`; bind the Task to its resulting revision without creating a Milestone Version or Signoff |
| Milestone successfully saved | `已保存里程碑版本「{标签}」 · rN` | A new/existing immutable Manuscript Revision has the exact milestone designation |
| Journal acknowledgement delayed beyond normal pending state | `本地写入中断 · 最近持久写入 {time}` | Enter Editing Protection Mode; bounded input only |
| At-risk buffered input exists | `{count} 字可能尚未持久化` + structural location | Automatic exact retry; unsafe departure/mutation blocked |
| Buffer approaches safety limit | `为保护内容，编辑已暂时转为只读` | Enter Protective Read-only State before input loss |
| Exact buffered sequence acknowledged | Normal journal state | Clear protection state; no checkpoint/milestone implication |
| Exact rebinding fails after service return | Current/base/buffered comparison | Stop automatic replay and route to recovery/salvage |

### Commands and history

- The native Journal Save shortcut—`Ctrl+S` on Windows or `⌘S` on macOS—and `保存当前编辑` immediately request journal flush and wait for acknowledgement; repeated input after the request forms a newer pending state.
- `保存为里程碑版本` is separately named, requires label/purpose, may accept a note, and never shares a shortcut or completion message with Journal Save.
- `为任务保存修订版` appears only as a local prerequisite when journal-newer acknowledged text needs an exact Task/Run pin. It requires no editor-authored milestone label, and success returns directly to task preparation; failure retains both the journaled text and Task draft while blocking authorization.
- A Milestone Version Suggestion around large replacement, structural adjustment, Proposal application, or delivery is a quiet recommendation with `保存里程碑版本` and `暂不` actions; neither is preselected.
- Durable undo/redo survives renderer/service restart and remains branch-scoped. Crossing a checkpoint through undo creates new working state and never deletes or edits the immutable checkpoint revision.
- A persistence failure remains visible in all manuscript presentation modes. Before close or a high-risk batch/apply transition, AI7 requires durability resolution or an explicitly safe recovery path rather than relying on a toast.
- Recovery Snapshot labels appear only when viewing recovery state or evidence and never beside routine Save as if they were synonyms.

### Editing Protection Mode

- Existing IME composition completes into the bounded buffer without forced commit/cancel. Further typing is accepted only while the declared protection capacity remains safe.
- The header continuously shows Last Durable Edit Boundary, At-risk Edit Extent, and retry state. Saved color/iconography disappears immediately.
- Commands that could leave, close, switch branches, Apply, bulk replace, reimport, restore, or otherwise change graph authority are disabled or intercepted with the exact durability reason.
- Automatic retry uses deterministic ordered journal commands and exact current binding. Acknowledgement of every buffered edit is required before normal editing returns.
- Capacity is communicated as remaining protection, at-risk characters, and location—not raw memory bytes. At the threshold, Protective Read-only State begins before input can be dropped.
- `复制受影响内容` is always preferred when reconstructable; local salvage export follows its exact Effect Approval/Receipt path. Neither marks the journal saved.
- A forced process loss may lose process-local input. Restart wording names the Last Durable Edit Boundary and never claims zero-loss recovery beyond it.
- Network/provider/credential/Harness status appears elsewhere and does not alter the local editor's persistence state.

## Manuscript import

### Target, relationship and exact-match selection

| State | Primary surface | Available action |
| --- | --- | --- |
| File selected | Local parsing/preflight and staging; possible title candidates remain hidden as Book metadata before target selection | Continue to exact-match/target review; cancel without creating Book/manuscript authority |
| Exact Import Match found | Exact matching Book, Source Version, prior import/reimport/source record, and whether identity or parsed content/structure matched | Choose unselected `打开已有导入`, eligible `重新导入并比较`, or `按已选择的关系继续`; a cross-Book match may change target but cannot share Book-owned source authority |
| Filename Collision only | `名称相同，内容不同` with the exact prior item named | Continue normally; the collision neither blocks nor selects anything |
| Manuscript Import Target unresolved | Unselected `新建图书` and eligible exact existing-Book choices; current context may be `建议目标` | Explicitly select one target or cancel |
| Existing Book without primary Manuscript selected | Book identity plus unselected `作为首份稿件导入` and eligible `作为来源材料导入` | Choose one relationship, change target, or cancel |
| Existing Book with primary Manuscript selected | Exact current Manuscript/revision plus unselected `重新导入当前稿件` and eligible `作为来源材料导入`; no second-Manuscript action | Choose one relationship, change to `新建图书` for a different intended work, or cancel |
| `新建图书` selected | Non-authoritative Book Creation Draft with source-labeled Book Title Suggestions, required editable `书名`, and optional `内部编号` | Edit/confirm the title, validate the draft, return to target selection, or cancel |

### New-Book and first-Manuscript import

| State | Primary surface | Available action |
| --- | --- | --- |
| New-Book draft and preflight valid | Direct transition into fidelity review and then Review Before Import | No separate empty-Book commit or creation-success state |
| `作为首份稿件导入` selected | Existing empty Book, effective dimension set, proposed primary Manuscript/branch/revision, exact AI7 Workflow Profile projection/native definition pin/Workflow Instance and original Source Version | Continue to fidelity review, change relationship, or cancel |
| New-Book fidelity review contains only `完整保留` | Concise summary with expandable per-class detail | Open the new-Book Review Before Import or cancel |
| New-Book fidelity review contains `降级导入` | Expanded material degradation count, examples, behavior, and export consequence | Record explicit degradation intent for this review or cancel; no preselection |
| First-Manuscript fidelity review | Same content-class fidelity contract, with exact existing Book and no Book-creation consequence | Open its Review Before Import, change relationship, or cancel |
| Initial editable-import fidelity review contains critical `不支持导入` | Blocking explanation identifying unsupported classes | Cancel, or choose eligible `作为来源材料导入` and then select an exact existing Book or source-bound `新建图书`; no partial Manuscript extraction |
| New-Book Review Before Import ready | Exact new-Book target/title, file/provenance, initial Manuscript/branch/revision, AI7 Workflow Profile projection/native definition pin/Workflow Instance, effective Book Editorial Dimension Set, fidelity outcome, created records, and named non-effects | `新建图书并导入稿件`; degraded path uses `按上述降级方式新建图书并导入稿件`; change an applicable input or cancel |
| First-Manuscript Review Before Import ready | Exact existing Book, source/provenance, proposed primary Manuscript/branch/revision, AI7 Workflow Profile projection/native definition pin/Workflow Instance, effective existing dimension set, fidelity outcome, created records and named non-effects | `导入为首份稿件`; degraded path uses `按上述降级方式导入为首份稿件`; change an applicable input or cancel |
| Initial editable import running | Business-readable progress and exact relationship | `取消导入` before atomic commit |
| New-Book atomic commit completed and all records persisted | `稿件已导入` plus the exact resulting Book Work Overview, direct Book/primary Manuscript/Revision/Source Version-provenance/Workflow Instance-native Profile and AI7 projection pins/Manuscript Import Record presentations, and degradation summary | `打开稿件` or open any exact record |
| First-Manuscript atomic commit completed | `稿件已导入` plus that exact existing Book Work Overview, direct new primary Manuscript/Revision/source/workflow/import-record presentations, and degradation summary | `打开稿件` or open any exact record |
| Import committed and matching active Background Analysis Enrollment exists | Import completion remains primary; a separate analysis row names each queued kind and the one or more exact Task/Plan/Run records, including any shared authorized batch Run | Open analysis status; every kind keeps independent Result Set/status/failure/feedback, and queued does not mean analyzed |
| Import committed without matching active Enrollment | Import completion remains primary; analysis shows `待分析` or another exact non-error state | Open analysis setup or start an explicit Task later; no Provider call, transmission or cost |

### Source-only import

| State | Primary surface | Available action |
| --- | --- | --- |
| `作为来源材料导入` selected | Eligible retained file and unselected exact existing-Book / `新建图书` target | Select target, change relationship, or cancel |
| Exact existing Book selected | Source identity/provenance, eligible retained content, Source Version and Source Import Record preview; explicit `不创建稿件` | Open Review Before Source Retention, change target/relationship, or cancel |
| Existing-Book Review Before Source Retention ready | Exact Source Version/result plus no Manuscript, revision, Workflow Instance, Run Source Scope, factual, learning or publication consequence | `作为来源材料导入` or cancel; no generic continue |
| `新建图书` selected | Source-bound Book Creation Draft with required confirmed title and source-labeled local suggestions only where defined | Open source-bound Review Before Book Creation, change target/relationship, or cancel |
| Source-bound Review Before Book Creation ready | Exact zero-Manuscript Book/defaults, retained file/provenance, Source Version, Source Import Record and named non-effects | `新建图书并导入来源材料` or cancel |
| Source-only commit completed | `来源材料已导入`; no manuscript-success styling | `查看来源材料` or `查看来源导入记录` |

### Import invariants

- Preflight and Book Title Suggestion are local and Provider-independent. Candidate extraction may begin during preflight, but Book-title presentation/editing begins only after `新建图书` is selected. Non-empty DOCX title metadata supplies the primary candidate and filename stem is its fallback; a bounded subset of title-bearing early content may supply separately source-labeled alternatives. No content candidate silently displaces the primary/fallback rule or becomes Book identity without editor confirmation, and model output is never a title source in this flow.
- Target and Existing-Book Import Relationship are separate choices and both start unselected. Context may mark one exact Book as `建议目标`, while verified Source Version lineage may recommend a relationship with its basis shown; current/last-open Book, filename, path, recency, source location or fuzzy similarity creates no selection.
- One Book owns at most one primary Manuscript. A populated Book has no `作为新稿件导入` action; another intended work changes the target to `新建图书`, while supporting material remains source-only.
- None of the three Book Creation Draft variants is a Book, Manuscript, revision, Workflow Instance, acquisition/import record, or partial success. Once valid, the manuscript-import-bound variant immediately leads to Review Before Import and cannot commit an empty Book; the standalone variant leads to Review Before Book Creation and may create an intentionally empty Book; the source-bound variant leads to its source-bearing Review Before Book Creation and may create only a zero-Manuscript Book plus first Source Version.
- Only `书名` is required and a working title is allowed; `内部编号` is optional and richer bibliographic metadata may be added later. The editor must enter or confirm the title before commitment and must explicitly confirm or edit any source-derived suggestion shown in either the manuscript-import-bound or source-bound variant. The manuscript-import-bound variant follows the disclosed DOCX-metadata, filename-fallback and bounded-content rules above; the source-bound variant uses only separately disclosed source-specific metadata and bounded title-bearing content and never silently inherits manuscript-import heuristics.
- Status meaning never depends only on green/amber/red; text and icon/shape carry the classification.
- An Import Degradation Decision applies only to the displayed report for this import and never grants standing acceptance of future degradation.
- Every Review Before Import, Review Before Source Retention and Review Before Book Creation variant is relationship-specific. Manuscript variants keep the exact AI7 Workflow Profile projection/native definition pin and effective Book Editorial Dimension defaults visible; source-only variants explicitly omit Manuscript/Workflow objects. All state that no Series membership, learning eligibility, Provider transmission, Publication Version, public release, or delivery record results.
- One final new-Book action atomically creates the Book/stable identity, effective Book Editorial Dimension Set, Book-owned original Source Version, primary Manuscript, initial branch/revision, pinned Workflow Instance, provenance/fidelity records, applicable degradation decision, and Manuscript Import Record.
- One final first-Manuscript action creates the same source/manuscript/workflow/import objects without recreating or replacing the existing Book or dimension set. One final source-only action creates a target-Book-owned Source Version, provenance and Source Import Record; it may reuse an existing Source Version identity only after the editor selects an exact match already owned by that same Book.
- No completion state appears before all of those records are persisted.
- A failed atomic action exposes no new partial Book, Source Version, Manuscript, revision or record. Interruption may retain only the non-authoritative staged recovery state below; explicit cancellation deletes it.
- The Manuscript Import Record remains reachable from Book history and links original-file identity, final fidelity review, accepted degradation, provenance and resulting revision.
- `含已接受的降级` persists on the record and opens the exact affected classes/examples/export consequence; it is not hidden after the first completion card.
- The user-facing record is not a Manuscript Checkpoint, Milestone Version, export receipt or round-trip guarantee. Any internally applicable Effect Receipt remains separately linked in audit/technical detail.
- Import success and analysis are independent outcomes. Import, source retention, Model Service setup and artifact enablement create no Background Analysis Enrollment, Provider permission, analysis authority or AI7 Apply; an existing matching Enrollment must still issue one or more exact Tasks/Plans/Runs under current policy. Compatible kinds may share one authorized batch Run, but their Result Sets, status, failures and feedback remain independent.

### Duplicate and interruption invariants

- Exact immutable original-file identity associated with a prior Source Version and exact parsed content/structure are disclosed separately. Membership in one source family or lineage is not exact identity by itself; a different filename does not hide an Exact Import Match, a same filename does not create one, and fuzzy similarity is merely non-authoritative related-material guidance.
- Exact matching never selects a target/relationship, rewrites provenance, reuses authority silently, or exposes a hash/canonicalization algorithm as an editorial decision.
- Complete verified staging persists one Staged Import Snapshot and non-authoritative draft under the Agent Data Root until completion or explicit cancellation. It remains local, Provider-independent, outside repositories and hosted CI, and distinct from a Source Version, Manuscript Revision, Recovery Snapshot or successful import.
- Restart opens Import Draft Recovery with `继续导入` and `放弃` unselected. Continuation revalidates snapshot identity, target/relationship, lineage/comparison, fidelity/degradation and consequential review; it never auto-resumes or commits.
- Target/relationship drift preserves the draft but invalidates stale review. Loss of original-file access after complete staging permits continuation from the exact snapshot with disclosure; incomplete staging requires native-picker reselection and an exact match. Parse failure retains payload-free diagnostics only.
- Outside an uncertain atomic boundary, `取消导入` or `放弃` deletes the draft and staged payload and creates no success record. Successful completion deletes that non-authoritative payload only after the durable current-Book Source Version/link and completion record verify. At an interrupted atomic boundary AI7 first reconciles authoritative commit identity and returns exact committed evidence or recoverable uncommitted review; if neither can be proven, `导入提交结果待确认` preserves evidence, blocks retry/cancellation cleanup, and never dispatches the same commit twice.

## Reimport

| Step | Visible behavior | Guardrail |
| --- | --- | --- |
| Enter reimport | Exact populated Book and sole primary Manuscript/revision; dirty journal state first receives its labeled safety checkpoint | Checkpoint failure preserves edits and aborts before comparison |
| Select replacement external document | Parse/stage locally, show Exact Import Matches, and bind one Staged Import Snapshot | Does not alter current Manuscript or infer lineage from filename/location/time |
| Verified prior Source Version lineage | Three-way Reimport Comparison: prior Source Version, exact current Manuscript Revision, staged document | Common-base claim exists only from exact Book-owned lineage |
| Lineage not verified | Two-way current/staged comparison labeled `来源关系未确认` | No invented ancestry or structural continuity |
| Review mappings | Show exact stable mappings, changed structure, additions/deletions, and ambiguities | Automatic mapping is limited to unambiguous identities |
| Resolve ambiguity | Editor selects or creates intended structural relationships | No default mapping is preselected where identity is ambiguous |
| Changed result ready | Review exact base/status/current/staged pins, mappings, fidelity, descendant revision and Manuscript Reimport Record | `重新导入并创建新修订版`; never overwrite current or imply synchronization |
| Changed commit completed | New current-Book Source Version—or explicitly selected exact existing current-Book version—plus descendant Manuscript Revision and Manuscript Reimport Record persist atomically | `稿件已重新导入`; open exact revision or record |
| No editable change | Exact `未发现稿件变化` result and Manuscript Reimport Record linked to comparison evidence and the durable current-Book Source Version | No empty Manuscript Revision; open record or return to manuscript |

## Source Version acquisition

| State | Primary surface | Available action / invariant |
| --- | --- | --- |
| Supported local file selected outside manuscript import | Exact file identity, locally parsed retained-content boundary and provenance | `作为来源材料导入`; no automatic Source Version |
| Exact editor-pasted/entered material captured | Exact entered content and editor-authored provenance fields | `保存为来源材料`; Task use or attachment alone does not retain it |
| External research fully retrieved and retention permitted | Complete retrieved snapshot, source URL/identity, retrieval time and permission state | `保存为来源材料`; initial retrieval is not canonical Exact Fetch |
| External research incomplete/failed or retention prohibited | `尚未完整读取，不能保存为来源材料` with retained Task/evidence history disclosed separately | Complete/repeat research where permitted or leave without Source Version |
| Target unresolved | `选择目标图书` with exact existing Books and unselected `新建图书` | Select one target or cancel; context never selects it |
| Existing Book selected | Review Before Source Retention with retained boundary, provenance, Source Version result, Source Acquisition Record and non-effects | File: `作为来源材料导入`; paste/research: `保存为来源材料` |
| No-Book `新建图书` selected | Source-bound Book Creation Draft with required confirmed `书名`, optional `内部编号`, effective dimensions and source-labeled local suggestions where defined | Edit, open source-bound Review Before Book Creation, change target, or cancel |
| Source-bound review ready | Exact Book/defaults + first Source Version/provenance/acquisition record + explicit zero-Manuscript/non-authority consequences | File: `新建图书并导入来源材料`; paste/research: `新建图书并保存来源材料` |
| Existing-Book acquisition completed | `来源材料已导入` for file or `来源材料已保存` for paste/research | `查看来源材料` and applicable `查看来源获取记录` / `查看来源导入记录` |
| Source-bound acquisition completed | Exact `图书已创建` plus source completion and `尚无稿件` | `打开图书`, `查看来源材料`, or applicable acquisition record |
| Review drift/failure/cancellation | No optimistic completion or partial Book/Source Version | Correct/review again, cancel, or reconcile an ambiguous atomic outcome before retry |

- On a local-file path, same-Book Exact Import Match reuse requires explicit selection. On a pasted/entered or research path, only an explicitly disclosed exact existing Source Version identity match may be selected under the same same-Book rule. Cross-Book acquisition always creates a new target-owned Source Version and provenance.
- Source-type-specific title suggestions use only disclosed local metadata and bounded title-bearing content. They remain editable and cannot silently inherit manuscript-import rules or use a model/provider.
- Search snippets, failed retrievals, model answers, attachments and mere Task use never auto-create Source Versions. Their separate Task/evidence records may still remain durable.
- Only a committed Source Version may later enter indexing, search or Exact Fetch through a separate exact Run Source Scope. Acquisition grants no Run read, provider transmission, factual status, learning eligibility, mutation or publication authority.

## Coverage-aware manuscript analysis

| Situation | Primary presentation | Available action / invariant |
| --- | --- | --- |
| No Result Set exists for an admitted kind | Exact Book/revision/kind shown as `待分析` | Start an explicit Task or consider the separate disclosed Background Analysis Enrollment decision; its entry is deferred and no Provider call is implicit |
| Comprehensive analysis is running | Coverage Manifest and structure-aware Analysis Unit accounting, plus current reducer lineage | Pause/cancel the exact Run where allowed; no scalar `完整` claim |
| Unit/reducer gap or conflict exists | Analysis Coverage and Gap View names exact ranges/nodes and affected synthesis | Open exact lineage, retry through a new authorized attempt, or leave explicitly unresolved |
| Result settles | Immutable Manuscript Analysis Result Set Revision with contract/kind/version, exact manuscript pin, four-axis state and limitations | Inspect overview, history, source ranges or feedback; no manuscript mutation |
| Manuscript advances | Exact-revision freshness becomes stale/invalidated through local deterministic comparison | `同步到当前稿件`, `重新分析所选范围`, or `重新分析全书` with disclosed reuse/bypass consequence |
| Explicit editor feedback | Analysis Feedback Card bound to exact result revision/item/range/evidence | Record immutable Quality Signal; silence is not approval |

### Analysis status and update rules

- Coverage, reducer/synthesis closure, exact-revision freshness and semantic/evidence assurance remain four independently labeled axes. Color, one score or an aggregate completion badge cannot hide an unknown/failed axis or transform assurance into factual truth.
- Targeted retrieval shows ranked candidates and then canonical Exact Fetch ranges. It never enters the Coverage Manifest denominator or stands in for a comprehensive Result Set.
- Baseline Manuscript Analysis is one exact-versioned kind. The eight Editorial Dimensions and Plugin/user-defined kinds are selected, run, stored and failed independently; baseline selection never silently selects all eight.
- `同步到当前稿件` may reuse compatible unchanged units and exposes the invalidation/reduction closure plus reused/recomputed lineage. `重新分析所选范围` bypasses prior model results for that range and necessary closure. `重新分析全书` bypasses all prior model results for a new full manifest. Every path creates a successor Result Set Revision and preserves prior history.
- Result Set Revisions remain Book-bound records, not Task Outcomes, Editorial Artifacts, retrieval caches, DSH scratch state, factual truth, Series knowledge, Learning Material or permission to Apply.

### Background Analysis Enrollment

| State/action | Required disclosure | Consequence |
| --- | --- | --- |
| Before a separate explicit editor decision | Exact Book/Series/all-Books scope, selected kinds, Provider/data categories, budget and prospective/backfill consequences | No Enrollment yet; baseline may be selected by default only within this disclosed decision |
| Active Enrollment matches a change/import | Exact Enrollment version plus current policy/preflight and invalidation basis | Create one or more exact Task/Plan/Run/provenance records; compatible kinds may share one authorized batch Run while retaining independent per-kind Result Sets/status/failure/feedback |
| Enrollment is revoked | Future-dispatch consequence and any already-issued exact Runs | Stops future matching dispatch under that Enrollment; it cannot recall sent Provider data or rewrite Run history |

Provider/Model Service setup, import, artifact discovery/acquisition/validation/install/scoped enablement, Workflow Profile activation, Default Execution Rule and DSH Session membership never create or activate Enrollment. Issue #86 requires a separate, explicit and revocable Enrollment decision but defers its final entry point, label and compact create/revise/pause/disable mechanics. Moving the same already-authorized Run to the background is presentation-only and may continue under its unchanged envelope; any new idle, scheduled, import-triggered, post-checkpoint or cross-Run Provider dispatch requires a matching active Enrollment.

Analysis Quality Metrics are presented separately from Delivery Quality Metrics and identify their definition/version, source Quality Signals and scope. A feedback signal or aggregate metric grants no factual, learning, policy, artifact-update, source, Provider, Effect or AI7 Apply authority.

## Task Intent capture

| Entry | Seeded context | Result |
| --- | --- | --- |
| Bottom composer from active manuscript/deliverable | Exact Book and Active Work Object; no inferred text range | Editable composer text with visible context chips |
| Selection action | Explicit Pinned Manuscript Range, or journal-newer range labeled `待保存修订版` | Adds only that exact or pending range to the Task Intent Draft context; the pending form grants no exact pin |
| Finding/Evidence/Proposal action | Exact selected record and its permitted target reference | Does not inherit every related source or range |
| Book Work Overview action | Explicitly selected Manuscript or Editorial Deliverable | No implicit whole-Manuscript source scope |
| `准备任务` | Current visible composer text and exact context | Persist/open Task Intent Draft in the right surface; no model, provider, Run, or authority transition |
| Planning begins while acknowledged journal state is newer than the latest revision | Exact current branch and journal-reconstructed state | Show `为任务保存修订版`, create a Manuscript Checkpoint with purpose `任务输入`, then bind the draft to its resulting revision before Plan Preview |

### Draft lifecycle

- The composer and right Task surface always show Book, target, branch/revision, each attached Pinned Manuscript Range, and any non-authoritative pending range. A pending range is labeled `待保存修订版`; when the journal advances beyond a pin's revision, that unchanged original pin remains visible as `待核对到任务修订版` until a new task-bound pin is created.
- Missing target or context is explicit and blocks later planning only when required; AI7 never fills it with ambient Book-wide authority.
- Switching Books collapses the draft under its original Book and offers `返回继续`. It cannot rewrite context chips to the newly active Book.
- A draft remains restart-safe until discarded or advanced; discarding it deletes no manuscript text, Task Ledger Run, or authoritative outcome because none exists yet.
- Task Input Revision Preparation is local and low-ceremony. It does not ask for a Milestone Version label or Signoff, make a model call, or create a second checkpoint type; Quick Start and Default Execution invoke the same prerequisite without bypass.
- On success, every attached prior-revision pin and pending manuscript target/range/source/evidence reference exact-resolves against the new revision and creates a new task-bound pin; original pins and provenance remain immutable. Only then do Task Intent, sources, evidence and the later Plan/Run use that one exact revision. Newer editor changes remain newer working state and never silently retarget the Task or authorized Run.
- If the checkpoint succeeds but a changed or ambiguous attached reference cannot exact-resolve, the new revision remains valid while the Task draft shows `任务范围需要重新选择` with `查看变化`, `重新选择`, and `移除`; no Plan Preview or Run Authorization is created until every required reference resolves.
- On checkpoint failure, the Task Intent Draft and acknowledged journaled edits remain intact, `本地无法为任务保存修订版` names the blocker, and every Run Authorization path stays unavailable until exact materialization succeeds.
- The round-arrow visual may be retained from the Codex-referential language, but accessible name and status say `准备任务`; no sent/streaming animation appears.
- Active Chinese IME composition consumes Enter and related keys normally and can never invoke `准备任务`.

## Native DSH artifact recommendation

| Situation | Presentation | Editor control |
| --- | --- | --- |
| One clear eligible artifact fit | One Native DSH Artifact Recommendation with professional purpose, exact native kind/revision, AI7 compatibility-authority summary, rationale, required inputs, outcome and possible Proposal/Effect classes | Accept, change, inspect exact revision, or continue editing intent |
| Materially ambiguous fit | Two or three candidate cards, none preselected | Select one or revise intent |
| Artifact selected | Required Progressive Task Fields expand inline; optional detail remains collapsed | Complete, edit, or change exact revision |
| Goal changes materially | Existing recommendation marked `建议需更新` | Review new recommendation; no silent swap |
| No suitable enabled artifact | `暂无适合的可用工序` with intent-revision and available-artifact routes | No generic-chat execution fallback |

Selecting a recommendation changes only the Task Intent Draft. It does not discover with authority, acquire, validate, install, scoped-enable, create a Background Analysis Enrollment, activate a per-Run revision, grant capabilities, bind a Provider or authorize a Run/Effect.

## Reusable procedure classification

| Recommended result | Exact trigger meaning | Preview consequence |
| --- | --- | --- |
| Default Execution Rule draft | Repeat the same newly user-initiated pattern under one existing exact eligible artifact revision | Reduces later Task Intent review only; creates no background trigger or new procedure definition |
| Native DSH Skill draft | Reusable model-assisted steps with variable inputs/outputs and existing declarative AI7 Capabilities | Produces a non-executing native Skill draft for later independent validation and scoped enablement |
| Workflow-definition draft | Reusable phases, gates, responsibilities, required artifacts or Deliverable lifecycle | Produces an inactive native DSH definition draft plus its separate AI7 Workflow Profile draft projection; exact DSH carrier mapping remains deferred |
| Developer Capability Proposal | New code, tool, external integration or code-bearing Capability Implementation is required | Produces a developer-track suggestion; no Plugin or capability is installed or enabled |

- `将以上工序保存为可复用工序` opens the classification preview before any result exists. The button label never claims that a Skill, Workflow or Plugin has already been generated.
- AI7 recommends exactly one result with `为什么这样分类`. The editor may switch between native Skill and Workflow-definition drafts; Default Execution Rule remains available only for an existing exact artifact pattern, and code-bearing need remains in the developer route.
- Choosing a result type advances only to that type's capture/review flow. It performs no Task execution, acquisition, validation, installation, scoped enablement, Profile migration, Plugin admission, Enrollment, capability grant or authority-bearing action.

### Reusable procedure source and extraction

- The entry starts from one completed Run or an editor-selected ordered set of completed visible Task-plan business steps, deterministic commands and Workflow actions. It never begins from an unbounded recent-activity feed, transcript or whole Book history.
- The source selector permits add, remove and reorder before extraction. Failed, cancelled, rejected and later corrected instance steps are absent by default; an editor may provide one explicit corrected reusable version rather than inheriting failed history.
- `将提取什么` shows reusable purpose, steps, branches, parameter slots, output types, source classes, Model Roles, requested AI7 Capabilities, possible Effect classes and applicable Workflow structure.
- `不会保存什么` names manuscript text, Book identity, concrete source content, secrets, Provider/model bindings, factual outcomes, decisions, approvals, receipts, hidden Harness activity and technical retries. The native draft contains none; a separate local provenance record may retain the exact capture origin.
- Closing the preview creates nothing. AI7 never performs silent capture for learning, later suggestion or automatic artifact update.

### Native artifact acquisition, validation and scoped enablement

| Exact stage/action | Visible result | Authority consequence |
| --- | --- | --- |
| Discover exact native artifact | Native kind/identity/version, provenance, digest, license/notices and source | None; discovery/source metadata is not trust or admission |
| Acquire/import exact artifact | Pinned bytes retained as non-executing input | None; no validation, install, enablement, Provider or Run authority |
| Import DSH Skill | Immutable Source Skill Snapshot plus minimally derived versioned Imported Skill Working Revision | Source remains unchanged; working revision is still non-authorizing |
| Provider-free validation/conversion | Exact compatibility, requested AI7 boundaries, limitations and failures | Does not execute the artifact as an editorial Task or approve itself |
| Validation failed/incompatible | Preserve exact revision and reasons; offer repair as successor working revision | Prior bytes and result remain immutable and unavailable |
| Eligible compatible exact revision | Show exact native pin plus AI7 compatibility/authority ceiling before enablement | May offer one compact visible install-and-scoped-enable action or install disabled for later scoped enablement; internal boundaries remain distinct and future Tasks may only request within the reviewed ceiling; no Task, Enrollment, per-Run use or Apply |
| Revision needs lifecycle hooks, dependency scripts or native code | Show `受限` plus the blocked executable requirement | No compact install-and-enable path and no executable availability until separate executable-admission and sandbox authority exists |

- Source artifact, catalog result, importer, converter, validator and authoring Run cannot approve, install, enable, activate or authorize themselves.
- No surface uses `允许全部`, `始终批准`, `立即运行`, or treats Plugin/Bundle packaging as the DSH Skill semantic unit. Exact catalog sources, adapters, sidecar record/schema, trust tiers, sandbox mechanics and Profile/Bundle mapping for external or user-authored artifacts remain unresolved; the built-in Manuscript Profile's exact mapping is separately fixed by root ADR 0045.
- Editing, repair, conversion and accepted update always create successor revisions; prior sources, working revisions, validation outcomes and Run pins remain immutable.

### Artifact and automation management projection

- One consolidated typed projection remains stably reachable, but Issue #86 does not fix its final global label or placement. Contextual artifact, Workflow and Rule surfaces may deep-link to one exact entry/revision without creating a second runtime owner.
- The first level separates native artifacts, AI7 Workflow Profile projections, Default Execution Rules and Developer Capability Proposals. It never flattens acquisition, validation, install, scoped enablement, update, Profile default, Rule enablement and developer state into one flag. Background Analysis Enrollment remains outside this projection and separately disclosed; Issue #86 does not choose its placement, controls or whether a final product route links the two.
- Each native revision row shows exact identity/version, lifecycle/scope state, `最新可用` eligibility where applicable, change time, source/working/update lineage and linked work/delivery count. The detail shows exact content/diff and AI7-side compatibility/authority consequences without inventing a final sidecar record name.
- A new unpinned picker begins on Latest Eligible Version only when the revision is scoped-enabled and compatible. Before Plan Preview the exact native and AI7 pins are visible; authorization freezes them. Existing Runs, Rules and Workflow Instances never move when a newer revision appears or an older one is restored.
- `关联工作与交付` navigates to exact Runs, Task Outcomes, Workflow Instances, Manuscript Analysis Result Sets, Editorial Deliverables, Editorial Artifacts and Delivery Packages without duplicating their content or authority.

| Removal situation | `删除版本` behavior | Retained result |
| --- | --- | --- |
| Never-validated, wholly unreferenced draft/candidate/proposal | Explain permanent deletion and require explicit confirmation | No artifact revision; protected source/provenance remains when referenced elsewhere |
| Installed/scoped-enabled/previously used, pinned, approved or historically referenced revision with no active blocker | Retire future availability and remove only safe package bytes | Historical Version Stub plus authoritative links, Runs, decisions, outcomes and deliveries |
| Active Run/use, enabled-rule dependency or current Workflow Instance pin | Disable destructive action and name exact blockers with routes | Revision remains until completion/cancellation, Rule disablement/update or explicit migration |
| Whole entry | Summarize every revision as permanent-delete, retained-stub or blocked | No cascade into Books, content, Result Sets, Runs, Workflow state, decisions or deliveries |

### Imported-Skill updates and rollback

| State/action | Presentation | Consequence |
| --- | --- | --- |
| New upstream source detected | Inert update/reconciliation candidate | No executable working revision, enablement, Rule, Run pin or authority changes |
| Review candidate | Three-way comparison of prior Source Skill Snapshot, current Working Revision and new source, with conflicts/validation/authority changes | Editor may reject, repair or explicitly adopt |
| Artifact Update Rule considered | Exact trusted, conflict-free, validator-clean, semantically and operationally non-expansive conditions | May apply only to Imported Skill updates; never Plugins, core DSH dependencies, Policies or authority expansion |
| Roll back current selection | Exact current-versus-target revision and present compatibility/policy/authority state | Creates a new current selection; preserves history and never restores revoked authority |

Upstream checking is metadata-only. A candidate remains inert until explicit adoption or an exact active allowed Artifact Update Rule. Running/authorized work keeps its pin, and no source or rollback can bypass current validation and policy.

### Artifact discovery and reuse scope

| Surface/state | Visible behavior | Does not imply |
| --- | --- | --- |
| Management/discovery route | Browse locally visible native artifacts and exact revision histories from available sources | Authoritative catalog source, recommendation, source access or Task authority |
| Intent-based recommendation | Suggest compatible scoped-enabled artifacts matching the professional intent and Recommendation Applicability | Automatic choice, hidden pin or Run start |
| Manual selector | Permit an exact eligible revision; default to Latest Eligible Version | Permission to use disabled/retired/incompatible history |
| Outside recommendation applicability | Show a concise mismatch across Book/Series/deliverable/phase | Hard prohibition when otherwise enabled and compatible |
| New Book use | Start with current Book/target and unfilled variable inputs | Original Book/content/sources/results copied from capture |

- Recommendation Applicability is a suggestion filter only. The Source Scope Builder still defaults to current-Book material; Series, Cross-project and House Editorial Memory require explicit exact selection and per-Run authorization.
- Exact native revision and AI7 compatibility/authority pins remain visible in Task Intent Draft and Plan Preview. Changing them before authorization refreshes requirements; changing them afterward is a material Plan change.

### Workflow Profile, default-rule and developer-proposal completion

| Result path | Save action | Separate consequential action | Explicit non-effect |
| --- | --- | --- | --- |
| Workflow-definition/Profile draft | `仅保存草案` or `发布为新版本` | Published exact native definition may later use `设为新建交付成果的默认方案` through its AI7 Profile projection | No current Workflow Instance migration; no exact carrier kind selected here |
| Default Execution Rule | `仅保存规则草稿` | `审阅并启用规则` after the complete exact envelope is visible | No scheduled/autonomous background Task, Run start now or Effect authority |
| Developer Capability Proposal | `保存开发建议` | Later repository-development intake outside the editorial flow | No Plugin generation/install/enablement or Capability Implementation |

- Workflow publication creates an immutable native-definition version plus AI7-facing Profile projection. Default designation is separately named and applies only to newly created Workflow Instances. Exact Profile/Bundle/Plugin mapping remains deferred.
- Existing Workflow Instance migration starts from the exact instance/Profile/native-definition pin, previews phase/Gate/responsibility/artifact/history consequences and never occurs as a side effect of publication or default designation.
- Default Execution Rule enablement presents the exact native artifact revision, required fields/variation, applicability, source rule, Provider/egress, exact Run Budget Ceiling state—including `未设置`—result classes and possible Effect classes. It can match only a future newly user-submitted Task after deterministic preflight; it never originates or schedules work.
- Editing any saved draft, published definition/Profile, enabled Rule or developer proposal uses `保存为新版本`; version history and related-work/delivery links remain reachable.
- A Developer Capability Proposal may name a possible Plugin but the editorial flow performs no catalog selection, dependency installation, trust-tier/sandbox decision, Plugin admission, repository action or capability escalation.

## Quick Start and default execution

- `快速开始` is distinct from `准备任务` and must be explicitly invoked by the editor.
- It skips the separate Task Intent review screen but still creates the exact Task Intent, Execution Plan, Plan Envelope, and Run Authorization before dispatch.
- It cannot imply Proposal Decision, Review Decision, Effect Approval, Signoff Record, Public Release Permission, or Effect completion.
- A user may approve a Default Execution Rule after developing Task Pattern Confidence; future user-initiated matching Tasks may then start after deterministic preflight without a separate Task Intent review screen.
- Every such Run remains exact and points to the rule version that permitted automatic creation of its Run Authorization.
- Rule applicability may be one Book, an identified Series, or identified/all Books, but never silently expands the source scope of an individual Run.
- The rule binds an exact native artifact revision plus current AI7 compatibility/authority pins, required fields and allowed variation, source-scope rule, Provider/outbound constraints, Run Budget Ceiling state, outcome classes, and allowed Effect classes.
- Only a newly user-submitted Task triggers matching; the rule never schedules, invents, imports into, idles into, or model-triggers a Task and creates no Background Analysis Enrollment.

### Default execution state table

| State | Visible behavior | Authority behavior |
| --- | --- | --- |
| User approves rule | Show complete rule envelope, applicability, source rule, provider/outbound, Run Budget Ceiling state, outcomes/Effects, version, and revoke control | Creates/revises Default Execution Rule only; no Run |
| User submits one exact match and preflight passes | Start immediately; show `已按“{规则名}”默认直接运行` with expandable detail plus pause/cancel | Create exact Task/Plan/Envelope and per-Run Run Authorization linked to rule version |
| Ambiguous/multiple match | Explain ambiguity and open standard Task preparation | No Run Authorization or dispatch |
| Context/source/current Series Retrieval Exclusion/provider/outbound/Run Budget Ceiling/outcome/Effect drift | Name the mismatched field and open standard preparation | Never widen, bypass a current restriction, or rewrite the rule |
| Rule paused/revoked | Show rule status where it would have matched | Standard preparation only |
| Rule revised | New submissions use the new version after explicit user activation | Historical Runs keep their original rule-version link |

Task Pattern Confidence governs reduced Run-review burden only. Output remains an answer, finding, Artifact candidate, or Proposal as planned; any Proposal Decision, Review Decision, Effect Approval, Apply, Signoff, or Public Release Permission remains separately named and obtained.

## Task data boundary

| Region | Displays | Does not grant |
| --- | --- | --- |
| `要处理什么` | Exact Book, work object, branch/revision, ranges, and expected outcome target | Read access to every Book source or mutation of reference sources |
| `允许参考什么` | Selected/recommended exact native artifact plus selected exact current-Book, Series, Cross-project, and approved-memory records/versions | Mutation authority, Working Corpus access, or provider transmission |
| `哪些内容可能发送给模型` | Provider-bound maximum data categories and selected source boundaries | Public release, external export, exact promise to send every item, or permission beyond the Run plan |

### Source selection

- The Source Scope Builder uses Book, Series, source, revision, exclusion, and approved-memory labels rather than paths or folders.
- A Native DSH Artifact Recommendation is visible and editable and never silently includes all Book, Series, or Cross-project material.
- Selecting Series scope expands its current eligible members and effective exclusions for review. Later membership changes do not alter the frozen Run; a later effective Series Retrieval Exclusion immediately blocks further affected reads and stops the Run for Plan Revision plus renewed authorization or cancellation.
- Cross-project selection is itemized and never inferred from recent Books, Working Corpus, search history, or House Editorial Memory.
- Removing a source updates the draft plan and reveals any requirement it can no longer satisfy; it never substitutes another source automatically.
- Material expansion after Run Authorization suspends execution for Plan Revision and renewed authorization. Material restriction through a new effective exclusion also suspends before further use and cannot use ordinary same-binding Resume.

### Provider-bound disclosure

- The summary uses plain categories and counts, for example `当前稿件选段、3 项图书来源、1 项已批准社级编辑记忆摘要`.
- It distinguishes local readability from potential provider transmission and never labels configured model processing as public release.
- Actual payload audit remains reachable after the Run, but the preflight UI does not expose secrets, raw Harness Session content, or technical context-assembly details.

## Plan Preview

| Section | Default content | Expandable detail |
| --- | --- | --- |
| `目标与预计产出` | One concise goal and named outcome class | Full Task Intent fields and exact target identity |
| `处理对象与来源` | Book/work object/range plus source classes and counts | Exact revisions, exclusions, memory records, and scope digest |
| `执行步骤` | Three to seven editorial business steps with intermediate outcomes | Exact artifact-derived configuration without raw Harness internals |
| `需要你参与的位置` | Named possible Clarification/Proposal/Review/Effect actions or `预计无需中途参与` | Conditions that cause each request |
| `模型服务与预算` | Model Role, provider, outbound categories, reliable estimate/range, and exact Run Budget Ceiling state such as `未设置任务预算上限` | Binding/fallback, optional explicit ceiling, Provider Account Limit status, and detailed assumptions |
| `结果与受控动作` | Named outcome/Effect classes and important `不会做` statements | Exact replay/approval requirements and targets |

### Plan boundary behavior

- `运行中可调整` uses concrete editorial examples such as search terms, candidate-evidence count, non-critical step ordering, and safe retries within the frozen source/provider/Run Budget Ceiling/outcome/Effect envelope.
- `变化后必须暂停并重新授权` names goal, target, source expansion, provider, outbound category, Run Budget Ceiling state, expected outcome, Effect class, and authority-bearing pin changes.
- Expanding/collapsing detail changes no plan record or authorization state.
- The preview footer states `计划说明，不是运行授权` until the separate authorization interaction occurs.
- A material edit creates a new Plan Revision diff; the previous preview remains immutable and linked to any prior Run Authorization.
- Quick/default execution exposes this identical frozen preview from Run detail after dispatch.

## Standard Run Authorization

| State | Primary action/status | Behavior |
| --- | --- | --- |
| Plan current; preflight valid | `授权并开始任务` | One activation creates exact Run Authorization and Run Record and hands Run to scheduler |
| Draft needs editing | `返回修改` | Returns to Task Intent/source/plan editing without authorizing |
| Editor stops for now | `保存草稿` | Persists draft/preview without Run Authorization |
| Offline; exact boundary not locally identifiable | `仅保存任务草稿` | No Run or authorization; live-dependent fields remain `待联网确认` |
| Offline; exact boundary locally identifiable | `授权并在联网后开始` or `仅保存任务草稿` | Explicit choice; first creates exact Run/authorization in Connectivity Wait State |
| Any material drift | `查看计划修订` | Shows exact diff; old plan cannot be authorized |
| Authorized, waiting for connectivity | `等待网络` or `等待模型服务` plus cancel | No provider work, usage, or cost has begun |
| Connectivity returns; preflight unchanged, including no new effective source restriction | `联网恢复预检` then ordinary queue/run state | Same exact authorized Run may dispatch automatically |
| Connectivity returns; material boundary drift | `需要重新确认计划` | Exact Plan Revision and renewed Run Authorization; no silent start or fallback |
| Connectivity returns; credential/provider-service blocker without boundary drift | `需要处理模型连接` | Preserve exact Run Authorization, route to connection remediation, and re-run preflight; no silent fallback |
| Authorized, waiting for capacity | `正在排队` plus pause/cancel | Run exists; provider execution has not necessarily begun |
| Scheduler dispatches execution | `运行中` plus pause/cancel | Activity moves into Run projection; authorization bar no longer appears actionable |

### Authorization invariants

- The authorization bar stays inline and sticky within Plan Preview and never opens a duplicate confirmation modal.
- Its compact summary always includes Book/target, plan version, provider, exact Run Budget Ceiling state, outcome, and possible Effect classes. The default is literal `未设置任务预算上限`, never `免费`, `0`, or `无限`.
- The exact negative-authority statement remains visible before activation.
- Disabled readiness states identify the specific stale/missing field rather than presenting a generic disabled button.
- Successful activation records actor, time, plan version, target/source/outbound/Run Budget Ceiling boundary, and exact Run Authorization identity for expansion after dispatch.
- `正在排队` is not model activity, and `运行中` is not Task Outcome or proof of any Effect.
- Creating or changing a Default Execution Rule requires its separate explicit action and never rides along with standard Run Authorization.

### Offline preparation and reconnect

- Offline Plan Preview distinguishes locally authoritative plan facts from `待联网确认` live provider facts. Unknown data is never shown as a zero-cost or ready state.
- `授权并在联网后开始` summarizes the same exact target, source, outbound, provider/fallback, Run Budget Ceiling state, outcome, and Effect boundary as ordinary Run Authorization and explicitly states `当前不会调用模型`.
- After activation, the bar becomes a Connectivity Wait status card. Cancel remains immediate; there is no background toggle that silently changes future drafts.
- Reconnect Preflight runs only while the supervised AI7 service is active. Network return does not launch the desktop application.
- Unchanged preflight hands the existing Run to the normal scheduler. A new effective Series Retrieval Exclusion is material restriction even though the historical binding is unchanged, so it replaces auto-start with Plan Revision and renewed authorization or cancellation. Other material boundary drift does the same; credential or provider-service readiness failure under an otherwise unchanged permissible binding preserves the authorization, names the blocker, and routes to connection remediation before preflight runs again.
- Mid-Run disconnection does not pretend the Run is still progressing. The last durable milestone remains visible; once safely reconciled it becomes `任务已中断 · 可续行` and waits for explicit Resume. The already-authorized deferred-start path above is the only ordinary automatic-dispatch exception.

## Model role, capability, provider, and budget

| Layer | Visible by default | Interaction |
| --- | --- | --- |
| Primary Task surface | Compact Model Role selector and Model Capability Requirement chips | Editor changes desired work capability; Provider Preflight recomputes |
| Compact disclosure | Exact provider/model label, ready/blocking state, outbound category, fallback presence, reliable estimate/range, Run Budget Ceiling state | Expand secondary detail; no raw provider control here |
| Secondary Task detail | Binding rationale, fallback conditions, provider policy, outbound classes, connection name, explicit/unset ceiling, reported Provider Account Limit, and estimate assumptions | Review; material Plan-boundary changes return through Plan Revision |
| Settings | Connections, credentials, eligible alternative frontier, default bindings, billing currency, and optional Run Budget Ceiling preference | Configure persistent service state; provider-side limits stay provider-owned and secrets never display after entry |
| Usage | Historical/aggregate usage and cost plus per-Run links | Inspect; no Task or Run authority |

### Compactness and exception behavior

- The Model Selection Strip occupies one compact row or disclosure group and never becomes a large provider dashboard.
- Exact provider, outbound, and Run Budget Ceiling facts cannot disappear entirely before Run Authorization; they remain in one compact readable line with accessible expansion.
- AI7 defaults the ceiling to `未设置` and explains that provider-side quotas, spending controls and billing still apply. A Provider Account Limit may be `未知 / 提供方未返回`; no unavailable value becomes `0`, `免费`, or `无限`.
- A missing connection, changed outbound category, unavailable model, ambiguous fallback, unreliable estimate, invalid explicit ceiling, reached Run Budget Ceiling, or Provider Account Limit expands inline automatically with its own exact safe action.
- Model Role and Model Capability Requirements are not quality/factual sliders and never use labels such as `更正确` or `事实可靠`.
- DeepSeek default bindings and any explicitly configured alternative frontier binding remain exact detail, not user-facing product authority.
- After execution, actual use/cost moves to Run detail and Usage rather than permanently occupying the manuscript/task surface.

## Running Run activity

| Run condition | Compact header | Expanded activity |
| --- | --- | --- |
| Running with measurable units | Business phase, current object, exact `completed/total`, last meaningful update | Milestones plus already completed provisional results; no progressive Provider output under Waiting Only |
| Running without a stable denominator | Business phase, current object, last meaningful update; no percentage | Milestones and exact wait state; a completed candidate appears only after its Provider response settles |
| Waiting for clarification | `等待你的说明` plus the named Clarification Request | Prior milestones, exact request, and context needed to answer |
| Connectivity/model-service wait | `等待网络` or `等待模型服务`, authorized plan identity, and last completed milestone | Connection detail, Reconnect Preflight state, and cancel; no provider activity implied |
| Provider Account Limit blocker | `模型服务账户限额` plus affected provider/connection and last completed milestone | Provider-reported condition or `提供方未返回`, remediation route, retained Run Authorization, and explicit `续行` only after the condition clears |
| Run Capacity Wait | `等待运行名额` and last completed milestone | Queue position when trustworthy plus pause/cancel; connectivity is not the blocker |
| Paused | `已暂停` and last completed milestone | Continuation checkpoint/context and explicit `续行` when still valid |
| Safely reconciled interruption | `任务已中断 · 可续行` and last completed milestone | Existing authorization, Run Continuation Checkpoint, retained work, lightweight revalidation scope, and explicit `续行`; no automatic dispatch |
| Explicit Run Budget Ceiling reached | `任务运行预算已达上限 · 已保留部分结果` | Terminal partial Task Outcome, actual usage, candidates/evidence, unresolved matters, Effects/receipts, and `调整预算并重做`; no Resume/Retry |
| Completed | Named Task Outcome summary, not merely `100%` | Actual-versus-planned milestones, results, unresolved matters, Effects and receipts |

### Activity projection rules

- The Run Activity Header stays compact in the right Task surface and is also projected into `运行中与已暂停` without duplicating Task Ledger authority.
- The Editorial Milestone Timeline contains business-readable events with stable links to exact source, candidate, Clarification Request, outcome, Effect, or receipt records when those records exist.
- Technical attempts, raw tool calls, Harness events, provider token streaming, subagent identities, and chain of thought never become the normal timeline vocabulary.
- Waiting Only is the default for Provider-bound work. Its activity surface may reveal a completed provisional candidate after the applicable Provider response settles, but it never progressively renders that response. Progressive provider content is reserved for the Interactive Answer Stream defined below.
- Measured Run Progress uses exact comparable work units, for example `已核对 12/37 条引文`. If the total changes materially or ceases to be trustworthy, AI7 drops the numeric indicator and explains the current phase rather than preserving a misleading percentage.
- When meaningful activity stops, the UI reports the last completed milestone, current wait/stall reason, time since the meaningful update, and valid safe action. Elapsed time alone is never a progress measure.
- Clicking an expanded candidate, evidence comparison, or result may explicitly open a Dedicated Work Workspace; no background event changes work-surface mode automatically.
- Provider/model/cost and diagnostics remain behind secondary disclosure unless they are the blocking condition. No activity surface implies factual verification, Proposal Decision, Effect Approval, Effect Receipt, workflow completion, Signoff, or Public Release Permission.
- Run Budget Ceiling Reached, Provider Account Limit, Run Capacity Wait, Connectivity Wait State, Cooperative Run Pause, and Resume-ready Run State retain different labels and action sets; no generic `预算不足` or `继续` collapses them.

## Interactive Editorial Dialogue presentation

Response Presentation Mode is assigned explicitly by task type:

| Task category | Mode | Provider-content behavior |
| --- | --- | --- |
| Writing, rewriting, research, factual verification, Proposal generation, automation, export, and other ordinary Runs | `Waiting Only` | Show exact phase/wait state; reveal no progressive Provider answer |
| Interactive Editorial Dialogue bound to the exact active Book/work object | `Interactive Stream` | Stream only while that dialogue is foregrounded, under the boundaries below |

The product never infers this mode from response length, latency, provider protocol, model, user impatience, or current window location. The user does not toggle an individual Run into streaming.

### Foreground turn sequence

| Turn state | User-facing presentation | Required transition |
| --- | --- | --- |
| Submitted / awaiting first useful content | Exact contextual question and `等待回答` | Remain quiet until a safe user-facing summary or formal fragment exists |
| Approach/checking work is useful to disclose | `实时思路摘要` with concise approach, checks, evidence comparison, and uncertainty | Do not claim raw chain of thought; hide automatically before the first formal-answer fragment appears |
| Formal answer has begun | `正在回答 · 内容尚未完成` plus complete semantic fragments | Append only complete prose fragments or atomic structured items |
| Formal answer has settled | Complete answer without the incomplete label | Expose through the recoverable Dialogue Answer History projection; retain no visible Live Reasoning Summary |

### Stream content boundaries

- Prose appends by a complete short sentence or coherent semantic fragment, never by raw character/token jitter or an exposed broken tail.
- A list item or table row appears only when complete. A later correction to streamed prose is explicit rather than silently rewriting already presented text.
- A citation or evidence reference appears only after exact source binding and remains attached to the corresponding claim. Unbound citation placeholders do not appear.
- Proposal content, factual-verification conclusions, structured authoritative records, and executable actions wait until the applicable object is complete and structurally valid, then appear atomically in their governed surface rather than being assembled as authority inside the answer stream.

### Foreground/background transition

| Event | Active dialogue surface | Background/global projection | Execution consequence |
| --- | --- | --- | --- |
| Editor leaves the active dialogue | Hide Live Reasoning Summary and Interactive Answer Stream | Show only `等待回答`; no fragment notice or focus theft | None; Provider work continues without pause, cancel, or reprioritization |
| Editor returns before completion | Restore every received complete fragment, then resume live presentation | Remove the compact background projection | None |
| Turn completes while backgrounded | Show the settled formal answer on return | Quiet completed state; no per-fragment notification | None |

### Stop, interruption, and later attempts

| Event | Preserved content | Settled presentation | Available next action |
| --- | --- | --- | --- |
| User invokes `停止回答` | Complete semantic fragments only; discard incomplete sentence/item/row tail | `回答已停止 · 内容不完整`; Live Reasoning Summary hidden | `继续回答` or `重新回答` as a new traceable attempt |
| Provider/network interruption | Complete semantic fragments only; known cause retained | `回答中断 · 内容不完整`; Live Reasoning Summary hidden | Explicit new attempt after the blocker is understood |
| Interruption before any usable fragment | Question plus failed attempt metadata | No fabricated Incomplete Dialogue Answer body | Explicit retry/re-answer action only |

AI7 never silently retries, continues, changes Provider, or falls back after these states. An Incomplete Dialogue Answer remains readable and copyable but is not a completed formal answer, factual conclusion, Proposal, Learning Material, authoritative record, or executable action.

### History and promotion boundary

- Dialogue Answer History is a recoverable, non-authoritative joined projection under the exact Book, active work object, and Task context. Exact Execution Bindings and Harness Execution Spans resolve it to model messages and attempt history owned only by the Harness Session Ledger; no transcript is copied into the AI7 Task Ledger and no third ledger is created.
- Live Reasoning Summary is generation-only presentation and does not appear in visible history.
- A subsequent turn may reference prior questions and answers in the same dialogue but gains no broader manuscript/source scope, Provider outbound category, or authorization from that history.
- A completed answer remains generated content. `转为提案`, `用于新任务草稿`, or another exact named action may copy selected answer content into a new governed draft while preserving provenance back to the joined history; no conversion is implicit, and manuscript mutation still requires Proposal Decision plus the normal Apply path. `用于新任务草稿` creates a Task Intent Draft, not a `Task Input / 任务输入` Manuscript Checkpoint; D-075 applies later only if that task actually targets journal-newer manuscript state.

## Concurrent Run presentation

| Event | Current foreground behavior | Background/global behavior |
| --- | --- | --- |
| A second Run starts in the current Book | Keep the current foreground Run and manuscript focus | Add one compact switcher row with target, state, and phase |
| A Run starts in another Book | No surface or focus change | Add/update its row under that Book in Global Attention |
| Editor selects another current-Book Run | Restore that Run's prior expanded activity position | Previously foreground Run continues and becomes a compact row |
| Editor opens a cross-Book Run | Navigate explicitly to its Book, target, and Run projection | Preserve the previous Book's continuation position |
| Background Run advances or completes routinely | No automatic opening or mode change | Quiet state update; routine completion does not inflate the actionable badge |
| Background Run needs clarification, fails, or yields a decision-ready outcome | Preserve current focus | Enter the exact actionable attention group and count only when editor action is required |
| Authorized Run lacks execution capacity | Show `等待运行名额` when inspected | Keep queued beneath its Book; show position only if stable |

### Concurrency invariants

- Foreground and background are display states only. They do not change scheduler priority, Run Budget Ceiling state, provider selection, execution grants, or Run authority.
- Each Run row carries enough identity to distinguish same-skill work on different deliverables, revisions, selections, or Books without displaying technical IDs by default.
- Activity scroll/expansion, candidate selection, and secondary-detail state are retained per Run when the editor switches projections.
- No background candidate inserts into, selects, scrolls, or otherwise disturbs the foreground Manuscript; a later exact Proposal/Effect interaction remains separate.
- Concurrent Runs never share scratch, cache, retrieved source payloads, or UI candidate state merely because they appear in one grouped view.
- Queue wording distinguishes `正在排队`/`等待运行名额` from provider activity, pause, interruption, and completion. AI7 does not invent queue positions or remaining-time estimates.

## Pause and cancellation

| Initial condition | Action | Transitional presentation | Settled presentation |
| --- | --- | --- | --- |
| Queued | `暂停` | `正在暂停` only while the queue removal/state record settles | `已暂停 · 尚未开始运行` |
| Running | `暂停` | `正在暂停 · 正在到达安全停止位置` plus current milestone | `已暂停` with preserved continuation summary |
| Paused and exact envelope still valid | `续行` | `正在核对续行条件` or capacity wait | Same Run returns to running after lightweight revalidation |
| Paused with material drift | `续行` attempt | Blocked with exact changed boundary | Plan Revision and renewed authorization route |
| Queued or running | `取消任务` | Inline Cancellation Impact Summary, then `正在取消` | `已取消` only after durable terminal classification |
| Effect already committed | `取消任务` | Summary identifies committed Effect and receipt | Run cancels future work; Effect remains committed |
| External Effect outcome ambiguous | `取消任务` | Stop automatic retry/fallback and classify uncertainty | `结果待确认`, never false `已取消且无影响` |

### Control invariants

- The first pause click records a durable request and needs no confirmation. Repeated clicks do not create multiple requests.
- `正在暂停` and `正在取消` remain visible through Book switching/restart and name the current safe-boundary condition; neither is collapsed into a spinner.
- The Cancellation Impact Summary states future work to be stopped, retained candidate/evidence records, known committed Effects/receipts, and any action whose outcome is not yet known.
- Confirmation cancels only the named Run. It grants no rollback, Proposal Decision, Effect Approval/reversal, Signoff change, or Public Release change.
- Candidate and partial-result retention does not make those records authoritative or eligible for automatic Apply.
- Terminal cancellation disables `续行`. A later attempt must use the separately defined Redo path rather than mutating the cancelled Run.
- Pause/cancel state and receipts survive restart. A crash or network loss is an interruption condition, not an inferred user cancellation.

## Clarification Requests

| Situation | Card state | Run behavior after input |
| --- | --- | --- |
| A small meaningful answer set exists | Unselected choice cards, one optional `推荐` marker with reason, plus `自行输入` | Submit exact selected/written answer; recommendation alone does nothing |
| Nuanced editorial explanation is required | Free input primary, with optional prompt fragments rather than false exhaustive choices | Submit exact text answer bound to shown context |
| Only one branch depends on the answer | `该步骤等待说明 · 其他步骤仍在继续` | Independent in-envelope work continues; dependent branch waits |
| Further work could prejudice or exceed the answer | `任务等待你的说明` | Run remains durably waiting |
| Answer stays inside current envelope | Show consequence then continue dependent work | Same Run continues and timeline links the answer |
| Answer changes a material boundary | Show exact boundary diff; do not treat submit as authorization | Create Plan Revision and route through a newly authorized Redo Run |
| Editor selects `暂不回答` | Keep question and context accessible | No answer, cancellation, or authorization is recorded |

### Choice-first interaction rules

- Choice cards expose direct consequences and remain unselected by default. A recommended option is visually marked but has identical authority to every other unsubmitted option.
- `自行输入` opens a Chinese-IME-safe field and may coexist with a selected choice when the surface explicitly supports qualification; the exact submitted combination remains visible before commit.
- Keyboard navigation moves focus independently from selection, and submitting requires the named action rather than Enter during IME composition.
- A Clarification Answer records author, time, exact request/context, selected option identifier when used, free text when used, and the resulting continue/revision disposition.
- If relevant manuscript/source context drifts before answer submission, the card shows the drift and prevents a stale answer from silently targeting new content.
- The common visual pattern never relabels distinct actions as `批准`; each surface uses its canonical verb, consequence, and authority statement.
- The product may notify once and retain an actionable badge, but reopening the application or switching Books does not generate repeated blocking dialogs.

## Resume, Retry, Rewind, Redo, and Replay

| Action | Entry condition | Causal result | Execution/authority result |
| --- | --- | --- | --- |
| `续行` | Paused/interrupted same Run; exact semantics still current | Continue from current Run Continuation Checkpoint | Same Run; no new attempt merely for process restoration |
| `重试` | Prior attempt failed/inconclusive and repetition is proven safe | Append a linked new attempt from a safe point | Same unchanged Run; never automatic after ambiguous Effect outcome |
| `回退并调整方向` | Editor wants an earlier eligible milestone and revised direction | Preserve prior path; append a new attempt branch or route to Redo | Same Run only for valid in-envelope adaptation; otherwise renewed authorization/new Run |
| `重做` | Fresh result requested or semantics materially change | Link a new Task/Run to the prior one | New intent, plan, envelope, preflight, authorization, and Run |
| `重放` | Existing durable history is available | Reconstruct existing records in causal order | No provider, model, Capability, Effect, or execution attempt |

### Resume after interruption

- Startup/service reconciliation that proves the same semantics, exact target/source/provider/outbound/Run Budget Ceiling pins, safe Effect state, and verified Run Continuation Checkpoint settles the Run as `任务已中断 · 可续行`; it does not create a Harness Execution Span or provider transmission.
- `续行` is the explicit user action. It runs a lightweight current-state revalidation and, when unchanged, opens a new Harness Execution Span in the same Run without inventing a Retry merely because a process restarted.
- Material drift produces the exact Plan Revision diff and routes to a newly authorized Redo Run. A current Series Retrieval Exclusion is such a blocker before any further affected read. An ambiguous Effect remains `结果待确认`; prior Run Authorization cannot override either blocker.
- Run Budget Ceiling Reached is terminal and offers `调整预算并重做`, not `续行` or `重试`. Provider Account Limit is nonterminal only when the provider-side condition is resolved and the same unchanged Run then passes explicit Resume revalidation.
- Start When Online remains the narrow exception: its existing Run may dispatch automatically only after Reconnect Preflight confirms the plan and every current source restriction remain unchanged, because the editor explicitly authorized later start before the interruption/connectivity wait.

### Rewind flow

```text
choose `回退并调整方向`
→ request Cooperative Run Pause if needed
→ select one eligible Rewind Point
→ inspect Rewind Impact Preview
→ choose suggested direction or `自行输入`
→ exact current-state and envelope preflight
   ├─ valid Plan Adaptation → append linked Retry attempt in same Run
   ├─ material change → Plan Revision → authorize Redo Run
   └─ unsafe/ambiguous Effect → block with exact unresolved outcome
```

### Rewind invariants

- The milestone picker shows business labels, time, meaningful output, and why each point is safe; it does not expose internal turns, raw messages, tools, subagents, or technical checkpoint identifiers.
- Selecting a point changes no record. The Rewind Impact Preview is required before a new direction may be submitted.
- The preview separates `仍然有效`, `将被新方向取代`, `不可通过回退撤销`, and `需要重新授权` content.
- Later candidates, evidence, milestones, and attempt history remain accessible and are marked `已被新方向取代`; they are not deleted, relabeled as never having happened, or silently reused as current.
- The new branch reads current authoritative Manuscript/source/policy/decision state and validates exact pins. Historical projections are context for Replay, never authority for new execution.
- A committed Effect and its Receipt remain in the causal graph even if the selected Rewind Point predates them. Correction requires a new Proposal/Effect path; an ambiguous external outcome blocks potentially repeating work.
- The Rewind direction input follows Choice-first Input Card rules. A recommended direction is unselected, free input remains available, and material text is diffed into Plan Revision rather than hidden in a prompt.
- Redo may prefill prior intent and plan for editing but visibly creates new identities and never looks like continuation of the cancelled/superseded attempt.
- Replay can traverse both current and superseded branches and shows their relationship without offering an execution-shaped primary button.

## Run notifications

| Event | AI7 foreground | AI7 background/minimized | Durable destination |
| --- | --- | --- | --- |
| Routine progress/milestone | Inline update only | No system notification | Run timeline |
| Ordinary candidate/outcome requiring no action | One auto-dismissing Quiet Completion Notice | No system notice by default; configurable separately | `最近完成` |
| Clarification Request | Persistent contextual prompt/attention | Generic privacy-safe `AI7 有一项任务需要你的说明` | Exact clarification card |
| Named decision ready | Persistent attention using canonical decision label | Generic privacy-safe `AI7 有一项内容等待处理` | Exact decision record |
| Run failure | Persistent failure item and safe next action | Generic privacy-safe abnormal-event notice | Exact Run outcome/diagnostics link |
| Ambiguous Effect/external outcome | High-priority persistent `结果待确认` | Generic privacy-safe `AI7 有一项结果需要确认` | Effect/outcome evidence record |

### Notification rules

- A transient notice contains a concise accurate outcome label and direct navigation target but no generic `成功` when candidate review, a named decision, Effect commitment, or workflow work remains.
- Native Windows and macOS system notifications default to application identity plus generic event class only. Book title, deliverable, excerpt, source, claim, candidate, person/place name, provider, cost, and decision details stay inside AI7.
- Notification Settings separately control ordinary completion, sound, and richer Book identity. All default off except generic action-required/abnormal background notices.
- Sound is never used by default. An accessibility setting may provide non-audio persistent alternatives independently from notification sound.
- Multiple events for one Book within a short active burst produce one Book-coalesced Notification. Opening it displays the exact separate items; coalescing changes no badge count or authority.
- Clicking navigates to the exact Book/Run/record and preserves the editor's prior return position. Dismissing only removes the transient/system projection and never resolves its underlying record.
- Editorial Focus Mode queues Quiet Completion Notices for history and suppresses foreground popups. Actionable count and exact records remain visible when the editor exits focus mode.
- Restart or ledger catch-up computes current unresolved attention and does not emit one system notification per historical event.

## Proposal review workspace

| Proposal shape | Initial surface | Comparison behavior |
| --- | --- | --- |
| One local text change | Active Manuscript-anchored Proposal Card beside its exact Proposal Margin Anchor | Inline current/proposed difference with bounded context |
| Several local non-structural changes | Contextual surface plus compact navigator | Virtualized next/previous change navigation |
| Cross-chapter or many ranges | Explicit `在专门工作区审阅` action | Virtualized navigator plus one active bounded comparison |
| Structural, table, or long rewrite | Dedicated Work Workspace | Side-by-side available; inline remains available where meaningful |
| Stale base | Same surface with prominent exact revision state | Block silent retargeting; route to safe-merge/conflict comparison |

### Comparison rules

- Opening a Proposal stores the Proposal Review Return Position. Leaving returns to the exact manuscript neighborhood and restores review state on later entry.
- Every independently reviewable change keeps one stable card identity bound to its exact base revision and target range or range set. Window loading, sorting, filtering and switching between manuscript-adjacent and Dedicated Work Workspace routes do not create a replacement card identity.
- Text changes show semantic inline insertion/deletion plus a compact Proposal Margin Anchor. Activating the anchor expands its Manuscript-anchored Proposal Card and makes that exact range the active bounded comparison without converting the Proposal into Manuscript text.
- Only the active or nearby card expands beside the Manuscript. Other cards collapse to anchors and virtualized navigator rows; scrolling never requires all cards, full contexts or comparisons to coexist in the renderer.
- A Manuscript-anchored Proposal Card may visually group adjacent Proposal Change Items, but item rows keep independent focus, identity, location, change type and disposition. A shared card border never implies one decision.
- An Atomic Proposal Change Group is visibly titled `需共同处理` and lists its member items, semantic dependency and the inconsistency partial acceptance would create. It is never inferred merely from proximity or shared generation origin.
- Each active item card uses four titled regions. `修改内容` leads with the exact current-to-proposed comparison; `修改理由` contains only concise Proposal Change Rationale; `依据与核查` expands Proposal Support Detail and the three separate factual/evidence dimensions; `你的处理` contains disposition/edit actions and the optional editor-attributed reason.
- Collapsing `修改理由` or `依据与核查` for space preserves their independent headings and state summaries. Neither section may be folded into proposed wording, and a compelling rationale never supplies a missing evidence or verification state.
- The editor's Non-blocking Decision Reason appears only in `你的处理` or its immediate post-decision prompt. It cannot edit AI7's Proposal Change Rationale, and editing the rationale cannot alter the editor's recorded reason.
- Current manuscript, pinned base, and proposed text use persistent labels. Styling alone never carries identity, insertion/deletion meaning, conflict, or factual status.
- Inline Chinese text differences preserve punctuation, paragraph, annotation, and IME-readable grapheme boundaries and avoid character-level noise where a phrase-level change is the meaningful unit.
- The Proposal Change Navigator virtualizes rows and supports next/previous keyboard movement, type/state filters, heading context, and whole-manuscript markers. It never materializes the full manuscript or every full diff.
- Selecting a navigator row fetches the exact base/proposed/current bounded neighborhood and restores focus without changing the authoritative Manuscript selection.
- Rationale is a concise result explanation, not hidden reasoning. Source/evidence expansion links to exact records and displays Reference Integrity, Claim Support, and Factual Verification independently.
- A proposal based on an older revision is not automatically a conflict: AI7 first classifies exact non-interaction versus same-block/structural ambiguity. Until classified, the UI says `提案基准已变化` rather than `可应用`.
- Review-state affordances may record navigation/progress only if explicitly saved; they never masquerade as Proposal Decision. No default action mutates manuscript text.
- Dedicated Work Workspace entry and exit are editor actions. Proposal arrival, stale detection, or background completion never switches the central surface automatically.

## Proposal conflict resolution

| Exact classification | Default presentation | Available next interaction |
| --- | --- | --- |
| Pinned target still exact | `目标内容未变化` | Continue normal Proposal review |
| Current change is provably non-interacting | `可安全合并` plus exact block/range/structure basis | Continue review; later Apply revalidates |
| Same-block/overlap/deletion/structural ambiguity | `需要解决冲突` | Three-way comparison and Resolution Draft |

### Diff-Merge interaction

- The three source panes/regions are read-only and persistently labeled. The Resolution Draft alone is editable.
- Each aligned conflict unit exposes labeled quick actions in addition to directional icons; keyboard shortcuts are discoverable and configurable, and focus remains distinct from activation.
- `采用当前内容` and `采用提议内容` copy the exact selected unit into the Resolution Draft. They do not mark the Proposal accepted or change current manuscript text.
- `两者都保留` requires `当前后接提议` or `提议后接当前` and is offered only when the resulting structure is valid. AI7 never guesses order.
- `编辑合并结果` opens an IME-safe draft editor with current/proposed fragments available as reference. Draft undo/redo is local to the Resolution Draft and distinct from manuscript undo.
- Previous/next unresolved navigation, `采用并前往下一处`, and `将全部无冲突更改加入解决草稿` provide fast flow without hiding skipped or unresolved conflicts.
- Bulk inclusion uses the frozen exact non-conflicting set and produces a summary of included/excluded units. Any current drift invalidates the affected operation and refreshes comparison rather than retargeting.
- `基于当前稿件重新生成建议` creates a new model Proposal version against exact current authority and keeps the old Proposal/conflict visible. It performs no Apply.
- `保存为新提案版本` persists Resolution Draft text, editor authorship/operations, exact base/current pins, and lineage, then returns the version to ordinary Proposal review with no decision preselected.
- A conflict remains unresolved until every interacting unit has an exact resolution or is explicitly deferred. No action named `自动解决全部冲突` appears for structurally ambiguous work.

## Proposal Decision interaction

| Interaction | Draft effect | Authoritative effect |
| --- | --- | --- |
| Choose `拟采纳` / `拟拒绝` / `暂不决定` | Set reversible per-change draft disposition and optionally advance | None |
| Undo or change choice | Restore/update Proposal Decision Draft | None |
| Batch by selected/chapter/type/filter | Set draft dispositions only for frozen exact eligible set | None |
| Record optional reason | Add unselected choice/free text to draft or post-decision prompt | None until explicitly associated with decision |
| `记录提案决定` | Freeze and show final scope summary | Append immutable Proposal Decision with per-change dispositions |
| `准备应用` | Open accepted-change Apply preparation | None; no manuscript mutation |

### Decision rules

- The Proposal Decision Draft stays bound to one exact Proposal version. Switching versions preserves separate drafts and never carries dispositions forward silently.
- `拟采纳`, `拟拒绝`, and `暂不决定` use text labels plus shortcuts; color and focus alone never communicate disposition.
- Auto-advance skips conflict-blocked or filtered-out items and makes the next target visible before keyboard input is accepted.
- A batch menu shows exact item count, current filter definition, Proposal version, excluded stale/conflicting items, and whether any target drift requires reclassification. Applying the batch remains reversible within the draft.
- Batch draft actions operate over named Proposal Change Items and preserve their identities. An Atomic Proposal Change Group enters or leaves the batch only as its full exact member set; it cannot be partially selected.
- The Proposal Decision Scope Summary displays accepted/rejected/deferred/unresolved counts, affected headings/ranges, base/current revision state, and any item whose status changed since selection.
- If material drift occurs before `记录提案决定`, affected draft choices become stale and the commit action routes back to exact review/conflict analysis rather than retargeting.
- Recording a partial decision leaves deferred/unresolved items in actionable Proposal review without claiming whole-Proposal acceptance.
- Optional reason choices remain unselected. The prompt may follow the commit without blocking `准备应用`, and free input remains available with Chinese IME-safe submission.
- Decision-reason telemetry distinguishes a system suggestion accepted as-is, a corrected suggestion, an alternative, and editor-authored free text; it grants no learning eligibility by itself.
- `拟采纳`/`采纳` never appears on the Manuscript as applied text. After recording, accepted items show `已采纳 · 尚未应用` and a separate `准备应用` route.

## Apply Preparation

Every formal agent-originated Manuscript mutation, including work from Agent Workspace, dialogue, native Skill/Plugin, imported Skill or foreground/background analysis, must enter this single AI7 Apply interaction. Direct editor typing and separately governed deterministic import/domain commands remain distinct and cannot be used as labels to bypass it.

| State | Primary presentation | Next action |
| --- | --- | --- |
| Accepted exact changes available | Default included set plus explicit exclusions | Adjust set or begin exact preflight |
| Accepted item deliberately removed | `已采纳 · 尚未应用` | Keep pending for later preparation |
| Preflight current | Apply Result Preview and frozen Effect summary | Proceed to separate Effect Approval |
| Target/structure/decision drift | Exact invalid item and reason | Return to linked Proposal review/conflict location |
| Scope changed after freeze | Prior payload/approval visibly stale | Freeze new Effect payload; old approval cannot be reused |

### Preparation rules

- Initial inclusion derives only from one current Proposal Decision and one target branch/revision. Changes from another decision/version are never silently combined.
- Every included row shows accepted disposition, exact target, current revision result, and current safe-merge/conflict state. Exclusion is reversible before freeze.
- The Apply Result Preview uses the same bounded, virtualized Chinese-prose comparison rules as Proposal review while labeling the right side `预计应用结果`, never `当前稿件`.
- A summary lists affected headings/ranges, insert/delete/replace/structure counts, any preserved unsupported document structures, expected new Manuscript Revision identity, and unchanged out-of-scope content classes.
- Preflight executes locally against authoritative service state, not renderer text or a cached Proposal projection.
- If one included item fails exact validation, the atomic set cannot proceed. AI7 does not silently drop it; the editor may explicitly return, resolve/exclude it, and freeze a new set.
- Freezing records Effect ID, exact Book, base Manuscript pin, diff and target set, payload digest, Proposal/decision lineage, replay policy, atomicity, expected result, and exact preflight state. The frozen summary is immutable.
- Any material drift replaces the later approval action with `重新准备应用` and an exact diff. Prior Effect Approval, if any, is invalid for the new payload.
- Preparation ends with `尚未批准应用，稿件未发生变化`. It offers no generic `应用` button before the separately named Effect Approval boundary.

## Apply Effect Approval

| Approval state | Inline bar | Behavior |
| --- | --- | --- |
| Frozen payload current | Exact summary + `批准并应用到稿件` | One activation records approval and dispatches same Effect |
| Payload/target/decision/policy drift | `稿件应用准备已变化` + `重新准备应用` | Old Effect Approval action unavailable |
| Activated, no receipt yet | `正在应用` with Effect identity and current commit phase | Re-trigger disabled; state durable across navigation/restart |
| Safe stop possible before commit | `请求停止应用` with exact boundary explanation | Requests stop; does not promise cancellation until classified |
| Commit known or outcome settling | No cancel-shaped action | Await/display verified receipt or exact exceptional outcome |

### Approval rules

- The bar remains sticky in the same Apply Preparation surface, so the editor sees the exact preview and scope without a repeated confirmation modal.
- The authority sentence and action use `稿件应用` explicitly and never the unqualified noun or verb `批准` alone.
- On pointer/keyboard activation, AI7 durably creates one single-use Effect Approval containing actor, time, Effect ID, exact Book/base pin/diff/targets, payload digest, Proposal/decision lineage, replay policy, and expected result before dispatching the same identity.
- If durable approval succeeds but dispatch has not yet started, the UI states `已批准，等待应用` rather than presenting a second approval action.
- Dispatch uses idempotent Effect identity. Renderer retry or application restart queries the existing outcome and never repeats commit merely because acknowledgement was lost.
- A focused shortcut is disabled while IME composition is active and requires the same exact current Apply Approval Readiness as pointer activation.
- Once activated, the surface cannot be edited in place. Any changed scope or retry path creates a new prepared payload/identity according to the declared replay policy.
- No artifact, discovery/acquisition/validation/install/scoped enablement, Artifact Update Rule, Default Execution Rule, Background Analysis Enrollment, DSH Session, Plugin/Agent membership, Result Set or Run Authorization contains or inherits AI7 Apply.
- `正在应用` is neither Task Outcome nor Effect Receipt. Only verified commit evidence may transition the manuscript and Proposal item to `已应用`.

## Apply Effect Receipt

| Classified state | Required default evidence/wording | Available action |
| --- | --- | --- |
| `已应用` | Verified old→new revision, atomic count, Effect identity, actor/time, Proposal Decision | View manuscript/proposal/full receipt; prepare reversal |
| `未应用` | Confirmed zero commit plus failed/stopped stage and reason | Retry only when replay safety is proven; otherwise re-prepare |
| `正在确认应用结果` | Stable Effect identity and current recovery source | Wait/navigate; never repeat dispatch |
| `结果待确认` | What is known, what is missing, last authoritative evidence | Resolve/recover outcome; no repeat-shaped action |

### Receipt rules

- The compact card headline reflects commit classification rather than request, approval, dispatch, tool, or Harness success.
- Expanded receipt detail exposes Effect/idempotency identity, approval link, target/payload digest, replay policy, exact revisions, commit evidence, Proposal lineage, and outcome-classification source without storing/displaying the full payload as a receipt.
- `在稿件中查看` opens the new authoritative revision at the first affected range with navigation among all applied ranges and a return link to the receipt.
- Proposal review rows transition from `已采纳 · 尚未应用` to `已应用至版本 {Revision}` only for changes proven in the committed receipt. Excluded accepted items remain pending.
- A renderer crash after service commit reconstructs `已应用` from authoritative records; loss of an acknowledgement first enters Apply Outcome Recovery and cannot cause re-dispatch.
- A confirmed non-commit card states `稿件未发生变化`. A failed tool call or timeout without non-commit evidence is insufficient for that claim.
- Unresolved Apply Outcome appears in `异常与结果待确认`, persists across restart, and suppresses all actions that may repeat the same semantic Effect.

### Reverse Apply flow

```text
committed Apply Effect Receipt
→ 准备撤销本次应用
→ compare inverse change with current authoritative Manuscript
   ├─ exact/non-interacting → Reverse Apply Preparation
   └─ interacting later edits → conflict / Correction Proposal
→ new exact Effect Approval
→ new atomic Reverse Apply Effect
→ new Effect Receipt linked to original
```

- The original receipt never changes status merely because a reversal later commits; both receipts remain linked and visible in causal order.
- Reverse preparation explains later edits, content that would be restored/removed, and what remains untouched. It never rolls the whole Manuscript back to an old revision.
- Any shortcut labeled `撤销本次应用` routes through this preparation/approval path and never behaves like an untracked local deletion.
- A reversal receipt proves only the reverse Effect's outcome and does not retroactively invalidate the original Proposal Decision or Effect Receipt.

## Factual-verification overview

| Entry | Exact target shown before Task preparation | Result return |
| --- | --- | --- |
| Selection `核查事实` | Book/branch/revision plus Pinned Manuscript Range | Open exact first result beside selection |
| `核查本章` | Current structural heading/range and revision | Fact-check Lens filtered to that chapter |
| `全稿事实核查` | Whole Manuscript revision, policy, scope/provider/Run Budget Ceiling state | Fact-check Lens virtualized across all results |

### Marker and lens rules

- A margin marker identifies attention/status with an icon and accessible label; hover/focus/selection reveals assertion summary and the three separate status dimensions.
- Default density shows selected, high-risk, and editor-action-required assertions. `显示本章全部标记` and `隐藏低风险标记` change projection only, never record state.
- The Fact-check Lens virtualizes rows, groups by heading, and supports next/previous keyboard navigation, precise result counts, filters, and Whole-manuscript Position markers.
- Each result row shows exact manuscript revision/range, policy version, last verification time, source count/state, and one route to bounded evidence comparison. No raw model answer appears as the finding.
- Factual Verification labels map visibly to the policy-governed outcome: `证据支持` is supported; `疑似错误` is contradicted/suspected defect; insufficient, conflicting, unverifiable, and pending remain distinct unresolved reasons.
- Reference Integrity concerns whether a cited/retrieved reference is exact and trustworthy as the referenced object; Claim Support concerns what the evidence bears on the assertion; Factual Verification is the policy-governed assessment. No one dimension inherits another's status.
- A changed manuscript range marks the result `核查基准已变化`, retains the historical result against its old revision, and offers renewed verification rather than approximate anchor movement.
- Opening evidence comparison stores the manuscript and lens return position. Closing returns to the exact assertion without changing review or correction state.
- Any `建议更正` route creates/opens a Correction Proposal flow. There is no inline `修复` action that directly changes the active Manuscript.

## Evidence comparison workspace

| Evidence state | Card treatment | Permitted use |
| --- | --- | --- |
| Candidate discovered | `候选来源 · 尚未核对`, retrieval context, missing checks | Inspect, pin provisionally, request assurance; not evidence |
| Source/version identified | Identity/provenance available, assurance incomplete | Compare metadata; no certified quotation |
| Exact excerpt fetched | Pinned Source Version plus context-linked exact text | Quote what source says; other policy checks may remain |
| Checked evidence | Required policy authority/freshness/integrity/lineage complete | Use in Claim Support/Factual Verification assessment |
| Stale/unavailable | Exact failed field and prior-use impact | Re-fetch/research/retain historical state; not silently current |

### Comparison rules

- The header shows original manuscript text and AI7's normalized assertion in separately labeled fields. Editing the normalization changes no manuscript text and requires exact review before it becomes the assessed assertion.
- Evidence Source Cards add publisher, version, freshness, provenance, integrity, exact-fetch, and relation fields only as each discrete check settles; missing/running fields remain explicit rather than blocking the entire source list with a spinner. This is not progressive Provider-answer rendering.
- Pinning adds no evidentiary authority. The matrix aligns source identity/version, exact excerpt or candidate state, authority under policy, dates, provenance/lineage, integrity, applicability, and relation to the assertion.
- At most four sources occupy comparison columns at once; keyboard and source-list navigation make replacement/pinning fast while retaining the rest in the virtualized list.
- Exact Evidence Excerpts preserve punctuation, surrounding context, Source Version, exact range/digest, fetch time, and source link. Search snippets and retrieval chunks retain their own labels.
- Lineage grouping explains shared origin and does not simply hide duplicates; editors can inspect every derivative while independent-corroboration counts remain honest.
- Conflicting evidence highlights the exact incompatible propositions and relevant date/scope differences without ranking by model preference or source count alone.
- The AI7 Evidence Comparison Summary uses sentence-level evidence links and explicit `尚无足够证据` gaps. It never includes uncited model knowledge as a factual premise.
- Source drift or failed re-fetch marks only the affected excerpt/card and every determination that depended on it; unaffected evidence remains usable under policy.
- Closing comparison returns to the exact Fact-check Lens/manuscript position and commits no factual determination or correction by itself.

## Progressive evidence assurance

| Level | Initial experience | Blocking point | Formal outcome ceiling |
| --- | --- | --- | --- |
| `快速整理` | Completed candidate sources/snippets and summary return first; settled check states fill incrementally | Exact quotation requires Exact Fetch; no general determination gate because formal determination unavailable | `待核查` finding or evidence-incomplete Correction Proposal draft |
| `标准核查` | Candidates first; pinned/quoted/high-relevance evidence checks in background | Minimum Evidence Gate when recording formal verification | Policy-permitted supported/contradicted/unresolved result |
| `严格核查` | Selected evidence assurance runs to full required depth | Full policy-required selected-evidence gate | Same result vocabulary with higher documented assurance |

Here, incremental assurance means that independently completed check records become visible one by one. It does not stream a Provider response; any Provider-bound factual-verification contribution follows Waiting Only until that response settles.

### Assurance interaction rules

- The selector shows a one-line consequence, estimated additional work when reliable, and `政策要求` on any enforced minimum. It never uses `更正确` or a model-quality ladder.
- Candidate browsing and comparison remain interactive while checks run. Individual cards show missing/running/current/stale fields rather than one workspace-wide blocking loader.
- `记录正式核查结论` evaluates the exact policy version, assertion risk/context, selected evidence, and current checks. Missing requirements reveal a concise checklist and safe actions, not a generic disabled button.
- In Quick mode, the equivalent primary action is `保存为待核查结果`; supported/contradicted actions remain unavailable and explain the required move to Standard/Strict.
- `建议更正` remains available to draft a Correction Proposal in Quick mode, but both draft and later review display `证据核查未完成` and the precise missing checks.
- Raising level starts only missing/stale work and shows `复用 {n} 项已有核查 · 补充 {m} 项`. Lowering does not cancel a check already needed by another current decision or policy.
- Policy may require Strict for named high-risk classes or workflow points. The UI exposes the professional reason and required checks, not hidden prompt or policy implementation detail.
- No assurance selection changes Run Source Scope or provider-bound data silently; any material source/egress/Run Budget Ceiling change follows Plan Revision and renewed authorization.

## Factual result and Review Decision

| Verification result | Available Review Decision | Next route after recording |
| --- | --- | --- |
| Formal `证据支持` | Accept, request more evidence, keep unresolved, decline | Close current attention or open supplementary Task |
| Formal `疑似错误`/contradicted | Accept, request more evidence, keep unresolved, decline | `准备更正提案` only after accepted review; otherwise Task/unresolved |
| `证据不足` / `证据冲突` / `无法核实` | Accept unresolved conclusion, request more evidence, keep unresolved, decline assessment | Supplementary Task or retain unresolved finding |
| Quick-mode `待核查` | Request more evidence, keep unresolved, decline; no formal accept-as-supported/contradicted | Raise assurance or retain pending |

### Review rules

- Recording the Versioned Verification Result freezes its exact evidence snapshot, source versions, assurance/check state, policy version, producer, rationale, limitations, and three status dimensions.
- The Factual Review Decision Card remains in the same scroll/workspace context but uses its own heading, authority statement, and `记录核查审阅决定` action.
- Choice cards start unselected. An AI7 recommendation links to the relevant policy/evidence basis but recommendation display creates no decision.
- Selection stays editable until explicit record. The optional reason prompt may be completed before or immediately after without delaying the next route.
- `接受当前核查结论` means the editor accepts that versioned assessment for editorial handling; it does not assert universal truth or accept any future wording change.
- If relevant evidence, policy, or manuscript anchor changes before record, the card shows the exact drift and disables stale submission. A later result receives a fresh undecided card.
- An accepted suspected-error result offers `准备更正提案`, not `修复稿件`. A supplementary request pre-fills exact assertion, evidence gap, source scope, and current policy into Task preparation without silently authorizing it.
- Closing a supported finding removes it from actionable attention while leaving all result/Review Decision history reachable; it creates no Workflow Gate or Signoff Record.

## Correction Proposal drafting

| Condition | Variant presentation | Save consequence |
| --- | --- | --- |
| One clear minimal factual replacement | One unselected recommended variant plus `自行编辑` | Save selected/edited exact proposal version |
| Several defensible editorial expressions | Two or three unselected variants with tradeoffs plus `自行编辑` | Save one selected/edited version; alternatives remain draft evidence |
| Fact repeats at exact multiple ranges | Linked Correction Range Set with per-range include/exclude | Save exact included multi-range Proposal |
| Evidence incomplete | Persistent `证据核查未完成` and missing-check detail | Save permitted as incomplete Correction Proposal; never formal verification |
| Target drifted | Exact drift/conflict card | Refresh/resolve before saving; no fuzzy retarget |

### Drafting rules

- The header links the finding, Review Decision, current target revision/ranges, evidence snapshot, assurance level, policy, and unresolved evidence without requiring the user to reconstruct context from activity history.
- A Correction Variant shows current text, proposed result, typed correction changes, evidence citations, limitations, and why the scope is sufficient. Explanation is concise rationale, not hidden reasoning.
- Selecting a variant populates the editable Correction Proposal Draft and remains reversible. Manual edits preserve the selected variant lineage and editor-authored delta.
- `自行编辑` starts from current text or a user-chosen variant and supports Chinese IME, durable draft persistence, undo/redo, and exact bounded context.
- If the model suggests unrelated polish, the UI places it outside the correction scope with `另建提案`; dismissing it has no effect on the correction.
- Multi-range candidates derive from exact search/retrieval and remain unselected until reviewed. Each included range receives its own target pin; changing one invalidates only its affected draft portion.
- Saving freezes selected wording, exact ranges, change types, evidence links/states, finding/review/policy lineage, and limitations as a new Correction Proposal version.
- Save returns to Contextual Proposal Review or Dedicated Work Workspace according to scope. No accepted disposition, Apply Change Set, or Effect Approval is inherited.

## Deliverable Workflow overview

| Workflow projection | Default content | Interaction consequence |
| --- | --- | --- |
| Profile header | Profile name/version, governing-since time, update availability | Open exact version/diff; no migration |
| `下一项需要处理` | Exact gate/decision/blocker, affected phase, safe action | Navigate to authoritative record/action |
| Phase card | Shared Chinese phase, exact state, last transition/reason, linked-record counts | Expand related records; no state change from expansion |
| Summary | Active/waiting/blocked counts | Filter only; no scalar progress |

### Workflow rules

- The profile's seven shared phases retain common labels while phase descriptions, gate names, permitted overlaps, and skips come from the pinned version.
- `进行中` does not designate one exclusive current phase. A Deliverable may draft while source development continues or reopen review while maintenance remains active.
- `等待你处理` names the exact Clarification Request, Review Decision, Workflow Gate, Signoff, or other record and never uses a generic approval badge.
- `已阻塞` identifies the unmet gate/dependency and safe next action. The blocker remains distinct from a merely running Task or unavailable provider.
- Reopen/skip uses Choice-first Input Card rules. Suggested reasons remain unselected, free input is available, and submission invokes an exact deterministic command rather than a native-artifact Run.
- A reopened phase displays prior completion time/decision and the new reason in causal order. A skipped phase remains visible with reason and any downstream consequence.
- Profile migration preview compares phases, gates, defaults, active state mapping, removed/added requirements, and unresolved consequences. It never edits the instance until the exact migration command commits.
- Task/Run/Effect outcomes may supply evidence for a transition but cannot directly mutate the Workflow Instance. The UI shows `结果可用于更新工作流` when a deterministic command remains necessary.
- The lens never infers factual truth, delivery, Signoff, or Public Release Permission from phase completion or aggregate counts.

## Workflow Gate interaction

| Gate Readiness | Available disposition behavior |
| --- | --- |
| `尚未就绪` | Review criteria/evidence; pass disabled; return/defer available as profile permits |
| `可供审阅` | All unselected dispositions allowed according to profile |
| `存在建议项未完成` | Pass or conditional pass only with exact profile-allowed rationale/conditions |
| `存在强制条件未满足` | Pass/conditional pass disabled; exact missing mandatory actions linked |

### Gate rules

- Criterion rows state mandatory/advisory nature, evidence identity/status, last change, and which requirement is computed versus editor-reviewed.
- Opening, checking, expanding, or navigating evidence changes no readiness source or Gate state. Readiness refreshes from authoritative records.
- A recommendation cites exact criteria/evidence and remains unselected. Choice selection stays draft state until `记录关口决定`.
- `退回补充` identifies exact unmet/rejected criteria and creates the deterministic Gate transition plus linked next-work references; it does not automatically create/authorize a Task unless the editor separately prepares one.
- Conditional passage requires explicit listed conditions and shows which downstream actions remain unavailable. Completing a condition later does not silently convert the historical disposition to unconditional pass.
- If a Review Decision is required, the final summary separates `核查/审阅决定` from `工作流关口状态变化`; one activation may commit both exact records only when both are current and valid.
- Evidence/profile/Gate drift between selection and record replaces the action with a diff and requires re-evaluation; no stale Gate choice silently binds new evidence.
- Reopening retains the passed/returned/conditional history and requires a choice-first reason. No event deletes prior disposition.
- Gate pass may unlock work according to profile, but all separate authority surfaces remain unchanged and visible.

## Milestone Version interaction

| Current content state | `保存为里程碑版本` behavior | Result |
| --- | --- | --- |
| Manuscript journal newer than immutable revision | Validate and persist checkpoint from exact journal state | New Manuscript Revision + milestone metadata + internal stated-use record |
| Exact current Manuscript Revision already exists | Bind designation without duplicating text | Milestone metadata + internal stated-use record on existing revision |
| Other exact versioned Deliverable exists | Bind designation to exact Deliverable version | Milestone metadata + internal stated-use record |
| Persistence/validation unresolved | Block with exact issue and recovery action | No partial revision, milestone, or internal record |

### Milestone rules

- The compact sheet/popover starts with an editable recommended label, an unselected purpose card set plus `自行输入`, and optional note. Submission uses `保存里程碑版本`, not `签发`.
- Label examples derive from phase/date/use only for convenience and do not imply stage completion. Duplicate labels show exact version/time disambiguation and invite editing.
- One deterministic transaction either produces/designates the exact version and appends both milestone metadata and the separate internal stated-use record, or reports no milestone creation.
- The user-facing completion card shows label, purpose, revision/version, and `已保存为里程碑版本`. Internal Signoff terminology appears only in developer/audit detail.
- Later edits never mutate the milestone. The editor sees the last label and `有后续修改`, with a direct action to save a new milestone.
- Selecting `交付候选` does not prepare/export/deliver anything. Delivery preparation separately chooses the exact milestone and shows its current relationship to later edits.
- Milestone history may be filtered/pinned but not erased from causal history. Corrections to display metadata retain audit history without changing content identity.

## Delivery Package Preparation

| Preparation state | Presentation | Consequence |
| --- | --- | --- |
| No milestone selected | Unselected milestone cards; latest delivery candidate may be recommended | No package target |
| Selected revision has later edits | Exact change-exclusion notice; use Milestone Change Exclusion Notice when a Milestone Version identifies it | Continue with the selected revision or explicitly select/save a newer exact revision |
| Required item missing | Exact item, profile requirement, safe route | Package freeze unavailable until requirement/profile exception resolves |
| Content manifest ready | Full destination-/format-independent Delivery Package Manifest Preview | `准备交付包` available; still no export or external action |
| Frozen | `交付包已准备` + Package ID/version + separate Package Export History | Inspect package or begin a new Local Export Preparation |

### Package rules

- The milestone selector shows label, purpose, exact version, author/time, later-edit relation, and recommendation reason. Selection remains explicit.
- Delivery Package Purpose names the package's intended editorial use without collecting a recipient, output format, filename, Local Export Destination, or external-channel target. Those export choices occur later through a separate preparation and the current platform's system picker.
- Included content/artifacts show type, originating exact version, requirement source, status, applicable Gate/Signoff reference, and limitation. Exclusions remain a first-class list; ordinary users see familiar Gate/milestone language rather than internal Signoff jargon.
- Version/change/source/factual supporting materials remain typed Editorial Artifacts and never merge with the public-facing Deliverable text.
- Format-specific fidelity is absent from package identity. DOCX, PDF, Markdown, filenames, path, and Export Fidelity Disposition are selected only in each later Local Export Preparation.
- Local preparation validates content-manifest completeness and exact integrity identities and provides product-level inspect actions without exposing internal storage paths or generating a user-facing export file.
- If one required content/artifact/reference is unavailable, no immutable prepared package version is recorded. The user may inspect the exact failure and retry preparation safely.
- Freeze records Package ID/version, one selected exact Editorial Deliverable Revision, its optional identifying Milestone Version, purpose, exact content manifest, exclusions, limitations, applicable Gate/Signoff references, and artifact/decision lineage—never another Deliverable, whole-Book content, output format, destination, fidelity disposition, approval, or receipt.
- Post-freeze content-manifest changes use `创建新交付包版本`; the previous package stays immutable. Export history is a separate 0..N projection rather than one exported/unexported package state.
- Preparing or previewing never emits a success term such as `已交付` and never creates Export authority or Public Release Permission.

## Local Export Formats and Fidelity

| Export state | Presentation | Available action |
| --- | --- | --- |
| Exact milestone selected for standalone export | DOCX recommended; PDF visible; Markdown under `备用格式` | Choose one or more formats |
| Prepared package selected | Exact content manifest and Delivery Package Purpose shown separately; no format/path inherited | Choose export-specific eligible format(s) |
| Fidelity calculating | Progressive per-format/content-class rows | Inspect completed rows; no premature approval |
| Material degradation | Exact transformed/lost classes; acceptance unselected | Accept for this exact export, change format, or return |
| Required class unavailable | Affected format and reason | Choose valid format or resolve the source/package requirement |
| Destination unresolved | Current platform system picker | Select a path; any existing-target choice remains OS-owned |
| Existing target | Native Export Collision Resolution | Choose an alternative name/path, cancel, replace/overwrite, or native equivalent |
| Native cancellation | Package and safe export draft retained | No Effect Approval, dispatch, or Receipt |
| Ready | Exact version/package, formats, filenames, Resolved Local Export Target, Export Fidelity Disposition | One exact target-bound local Effect Approval |
| Generating | Compact measurable background progress | Cancel before commit boundary |
| Committed | Effect Receipt and `已导出到所选位置` | Open local result or return to package; no follow-on handoff step |
| Ambiguous/failed | Exact outcome classification; no success label | Inspect safe next action; never blind retry |

### Representation and export rules

- DOCX is selected by default only as the recommended Primary Editable Export; the user may add or replace it with PDF or explicitly open `备用格式` for Markdown.
- PDF preview emphasizes page/print result and states `固定版式，不支持可编辑往返`; it is never represented as a proof, factual authority, or release state.
- Markdown fallback states which structure and rich-document semantics are flattened, externalized, or omitted. A DOCX failure never silently substitutes Markdown.
- Fidelity rows cover every applicable content class and remain summarized when fully preserved. Any degraded/unavailable class expands automatically and places its consequence beside the choice.
- The remembered destination is a user-recognizable recent location hint only. Final export still uses the current platform's system picker; choosing a format, filename, or destination freezes a separate Local Export Preparation and never changes the Delivery Package.
- When the selected target exists, Windows or macOS owns the save/copy conflict dialog, localized wording, action order, geometry, accessibility, and equivalent rename/replace mechanics. AI7 does not imitate it, translate it into a second custom dialog, or ask the collision choice again.
- Alternative name/path returns one Resolved Local Export Target; native cancellation returns to the safe export context with no Effect Approval or attempted Effect; replacement returns the exact existing target plus replace disposition. Only then may the existing single exact export approval bind the target before commit.
- A native apply-to-all choice covers only the exact colliding files already enumerated in that interaction. Each receives its own target-bound approval and receipt; the choice is never saved as a future overwrite preference.
- Target drift after the native decision removes approval readiness and reopens native conflict handling. The final file state is reconciled by stable Effect identity before a verified created/replaced receipt appears; an ambiguous OS result remains `结果待确认` and cannot Retry blindly.
- Export runs outside the renderer. Cancellation is available until the commit boundary; after atomic commit the UI shows the receipt rather than pretending cancellation reversed the file.
- Temporary output stays product-managed and cannot be mistaken for a completed destination file. Each declared local publication has stable Effect identity and one classified receipt/outcome.
- Agent Exchange Projection is never a normal file-editing surface. Its freshness and revision binding are enforced behind AI7 Capabilities, and agent-authored revisions always return through Proposal review and Apply.
- The committed receipt ends the V1 export flow. No `发送`, `记录已交接`, `确认送达`, recipient, email, cloud-drive, OA, or external-channel action follows it.
- Local export proves only atomic publication at the chosen local target on the current platform. Product status never upgrades it to `已交付` or another external outcome, and activity/notifications do not imply that the user later shared the file.

## Publication Version

| State | Presentation | Consequence |
| --- | --- | --- |
| No exact Milestone Version selected | No action or latest-draft assumption | Select/create an immutable milestone first |
| Exact version selected | Version identity, current relation, identified publication scope/public channel, actor/time, basis/note | `设为发稿版本` may become available |
| Policy/profile requirement missing | Exact missing authority/scope item | Designation unavailable; route to the named requirement |
| Ready | `仅表示此版本可用于上述发稿范围；AI7 不会发布或发送` beside the exact action | One interaction records separate linked identities |
| Designated | `发稿版本` on the exact version-history item | May be referenced for package preparation; no export/publication occurs |
| Later material edits exist | Publication Version Change Notice with exact change relationship | Keep historical version or designate a newer exact milestone |
| Linked post-designation maintenance exists | Exact Maintenance Case identity, latest revision, classification and internal consequence | Open Maintenance Case Workspace; never erase or retarget the earlier version/permission |

### Publication-version rules

- The action is contextual to version/history, not a standalone approval destination or a checkbox inside Local Export Preparation.
- The visible completion wording is `已设为发稿版本`, followed by the exact version and scope. `已发布` is forbidden because V1 performs no publication Effect.
- One user interaction appends the Publication Version designation and the separate internal Public Release Permission or reports no change; audit detail may reveal the internal identity without exposing unfamiliar terminology in ordinary use.
- Publication Version does not include later edits, another Deliverable, source materials, or every file in a later package unless its exact permission scope says so.
- Ordinary exports remain entirely unchanged whether no Publication Version exists, one exists, or the editor chooses a different internal-use milestone.
- Global Attention uses `发稿版本待设定` only for a real profile/policy-required action; it never treats every local export as pending publication work.

## Post-designation Maintenance Cases

| Maintenance state | Presentation | Safe next action / consequence |
| --- | --- | --- |
| No case draft | Exact Publication Version / Deliverable revision context | `记录维护事项` opens an uncommitted draft |
| Draft | Unselected `更正` / `勘误` / `替代` / `撤回` / `再版` / `归档`, reason/evidence, actor/time | Record first immutable case revision or cancel with no case |
| Correction selected | Exact target and current Case Timeline | Create/attach Correction Proposal; normal Decision/Apply path creates any new revision |
| Errata selected | Versioned Errata Editorial Artifact | Link artifact; changing content still follows Correction Proposal/Apply |
| Supersession/Reissue waiting | No successor assumption | Select/save exact milestone, then separately `设为发稿版本` |
| Withdrawal/Archive recorded | Internal-only Maintenance Notice | Change only future AI7 use/visibility; no external action |
| New local output needed | Prior package/export history remains immutable | Begin a separate Delivery Package version only if content manifest changed, then a separate Local Export Preparation |
| Resolved/closed internally | Latest immutable Maintenance Case Revision + retained unresolved detail | Append `记录维护事项结论`; claim only the internal record outcome |

### Maintenance rules

- Entry is contextual to one exact Publication Version and exact Editorial Deliverable revision from version history or the `维护` phase. The Workflow phase is navigation/state context, never the Maintenance Case authority.
- The six classifications begin unselected. `记录维护事项` commits one stable case plus its first immutable revision or reports no case; selection, editing, or cancellation remains draft-only.
- Every later reason, evidence, classification, status, link, or outcome change appends a Maintenance Case Revision. The timeline never edits a previous case revision, Publication Version, Public Release Permission, package, export, approval, or receipt.
- Correction follows the existing Correction Proposal → Proposal Decision → Apply Preparation → Effect Approval → Effect Receipt flow. Errata stays a versioned Editorial Artifact. Neither one proves factual resolution merely because the Maintenance Case exists.
- A resulting exact Deliverable revision gains no milestone or publication designation automatically. Supersession and Reissue may link only a separately manually designated newer Publication Version.
- Withdrawal and Archive present `仅在 AI7 内记录；不代表已撤稿、下架、召回、通知接收方或删除外部文件`. They offer no send, recall, takedown, recipient, or local-file-delete control and produce no external Effect Receipt.
- A corrected/reissued export begins a new Local Export Preparation and receives new per-file receipts. Existing files and receipts remain unchanged even when an internal case is later closed.
- Only a current unresolved named action appears in Global Attention as `维护事项待处理`. Completion wording is `维护事项已记录` or `维护事项结论已记录`, never `已更正发布`, `已撤稿`, `已下架`, `已召回`, or `已再版`.

## Contextual result feedback

| Origin state | Contextual presentation | Consequence |
| --- | --- | --- |
| Proposal Decision or Review Decision just recorded | One optional `补充原因` row beside the recorded decision | The next editorial action stays immediately available; the decision itself already supplies the disposition signal |
| Accepted/edited/rejected content has an exact version difference | Contextual reason alternatives reflect the actual disposition and affected Editorial Dimension | No duplicate rating or inferred learning permission |
| Clear Task Outcome without an editor disposition | One outcome-specific optional reason interaction in the outcome card | Records explicit feedback only if the editor responds; Task completion alone is not satisfaction |
| AI7 can suggest a likely reason | Two or three unselected alternatives, with generated wording labeled `AI7 的猜测` | Acceptance/correction/replacement is distinguishable; suggestion is not editor judgment |
| Editor chooses `其他 / 自行输入` | IME-safe compact input without losing the choice context | Binds editor-authored text to this exact origin only |
| Editor dismisses or continues working | Prompt closes and does not recur for this origin/version | No reason and no inferred positive/negative judgment |

### Feedback rules

- The originating decision/outcome is committed before or independently of the optional reason. A slow, abandoned, or invalid reason input never rolls back or delays it.
- One prompt belongs to one exact origin/version. A genuinely new superseding decision or outcome may have its own prompt; reopening the same record cannot manufacture another request.
- Choices are contextual, concise, unselected, and ordered so the same AI7 guess does not always occupy the steering-first position. Free input remains equally reachable.
- The UI visibly distinguishes `AI7 的猜测`, a selected alternative, a corrected suggestion, and editor-authored text. Telemetry never rewrites those origins into one generic reason.
- Dismissal is final for active prompting but does not prevent a user from voluntarily adding/editing a reason from the exact record or Feedback History View later; this voluntary path creates no reminder state.
- Feedback History View can filter by Book, Task/result type, decision, Editorial Dimension, and time, then deep-link to exact context. Aggregate views never grant retrieval across those Books.
- Ordinary feedback never enters Global Attention. Only a separately existing governed Learning Material, Learning Eligibility, Memory Candidate, or audit-remediation decision may do so.
- A Quality Signal and its optional reason are not Learning Eligibility, Memory approval, factual evidence, Policy activation, provider consent, Run Authorization, Effect Approval, or Public Release Permission.

## Learning Material eligibility

| Candidate state | Presentation | Available consequence |
| --- | --- | --- |
| Identified; no explicit decision currently required | Quiet candidate/history row in `质量与学习` | Inspect only; no badge or eligibility inference |
| Explicit decision required | Book-grouped `学习准入待处理` item | Open exact Learning Material Review Card |
| Review opened | Bounded material, provenance, origin, candidate rationale, governing basis, possible future influence | Inspect/deep-link without creating a decision |
| No scope selected | All include/exclude/defer choices unselected; `仅纳入当前图书` marked recommended | Select/edit only; no authority yet |
| Named Series selected | Exact Series and cross-Book influence expand inline | Record eligibility for that displayed Series scope only |
| House selected | House-wide future-influence consequence expands inline | Record eligibility for House scope only |
| Exclude selected | Exact material and optional reason remain visible | Explicit exclusion supersedes inferred recommendation for this material |
| Defer selected | `稍后决定` with preserved candidate identity | Keep one unresolved item; no eligibility state inferred |
| Origin/material changed before record | Exact drift/version difference | Refresh review; stale selection cannot bind new material |

### Eligibility rules

- Candidate identification never chains a second prompt after contextual feedback. Only a genuine unresolved editor decision enters `待我处理`.
- The Book-first recommendation is visibly advisory and unselected. Keyboard focus, hover, or ordering cannot be mistaken for selection.
- Wider Series/House scope reveals its named reuse boundary and likely future influence beside the choice before `记录学习准入决定`; no generic second confirmation repeats the card.
- Selection remains draft state until the exact record action. Recording binds material/version, scope, actor/time, optional reason, and governing basis; later correction appends a superseding decision.
- `明确排除` does not delete the originating feedback/edit or Learning Material evidence. `稍后决定` does not count as inclusion, exclusion, or a negative Quality Signal.
- Hidden Learning Eligibility Policy or behavior-composition assets may explain why a decision is required through plain-language basis text, but editors receive no policy editing or authority-expansion control.
- Inclusion permits downstream signals or Memory Candidates only. `纳入当前书系` never means `纳入书系知识` and cannot create or bypass a Series Knowledge Candidate/Promotion Review. Memory approval/activation, task retrieval, provider egress, factual status, and every named product authority remain separate.
- Series/House eligibility does not make raw material a global browsing result. Every later use remains attributable through Learning Lineage and bound by the future Run's exact source scope.

## Learning Audit and remediation

| Audit/remediation state | Presentation | Consequence |
| --- | --- | --- |
| Enter `学习回溯` | Book-grouped filtered object list with current state and downstream-use count | Navigation/filter only |
| Open from result | Backward path headed `为什么会影响这个结果` | Trace exact memory revision, candidate, signal, eligibility and material |
| Open from material/memory | Forward path headed `后来影响了什么` | Trace exact descendants and downstream Tasks/results |
| Expand `审计详情` | Immutable identities, actor/time, governing-version reference and exact lineage edges | Inspect only; no Policy/Composition editing |
| Choose `停止今后使用` | Learning Remediation Impact Preview split by future/running/memory/history | Selection only; no immediate exclusion |
| Record exact exclusion/remediation | Per-item outcome and updated current projection | Future influence stops/re-evaluates; running Tasks pause; completed results stay immutable and marked |
| Re-include later | New current decision/evaluation beside retained prior history | No deletion or relabeling of the earlier exclusion |
| Start batch remediation | Explicit same-scope selected set plus counts/exclusions/impact | One submitted batch with exact per-item outcomes; no scope expansion |

### Audit and remediation rules

- List position, filters, expanded nodes and the originating return position survive context switches/restart as local view state, not Learning Audit authority.
- The explorer virtualizes long descendant sets and defaults to one readable causal path; expanding a node never grants access beyond the user's existing product records.
- A completed result's historical-impact marker states what changed later and when, never `结果已撤销`, `事实错误`, or another retroactive business conclusion.
- The remediation preview identifies singly versus multiply supported memory where known and explains whether future use stops, a candidate is re-evaluated, or an activated memory revision must be recalculated.
- Running Tasks affected by remediation show the exact paused Run and revalidation route. Cancellation, Plan Revision, or another decision follows its own existing semantics.
- Batch selection is keyboard-accessible and begins empty. A common action is enabled only when every included item shares the displayed scope and disposition; drifted/incompatible items are named and left out.
- Neither `审计详情` nor recommendation explanations expose an editor-facing Learning Eligibility Policy editor, behavior-composition control, raw prompt, model reasoning, or Harness trace.

## On-demand Model Service setup

| State | Presentation | Consequence |
| --- | --- | --- |
| First launch/no connection | Normal Book create/import and local work | No forced setup or reduced local capability |
| Task needs an unconfigured Model Role | Inline Model Connection Blocker Card | Save exact Model Setup Return Point; no Run/authorization |
| Open `设置模型服务` | Role-first connection states, with blocked role focused | Task draft remains intact in background/local state |
| Enter credential | Protected input with purpose/Provider/connection name | Store through broker; secret never becomes redisplayable text |
| Connection becomes ready | `已连接` plus exact role/binding summary | Return to originating Task and re-run preflight only |
| Credential invalid/expired | `需处理` plus `重新输入`/`移除` | Preserve Task/Run boundary; no silent fallback |
| Leave setup unresolved | Return or close Settings | Task remains a blocked draft at its prior position |

### Setup rules

- The blocker states why model processing cannot start without converting the whole application into an offline/error state.
- The deep link focuses the exact role/connection needing work. Returning restores target, source choices, draft text, Plan Preview position and keyboard focus; any material intervening drift is shown normally.
- `已连接` means brokered readiness for the shown binding, not authorization to transmit a manuscript. Provider Processing Policy, outbound category and Run Authorization remain later exact boundaries.
- Provider setup, connection readiness and credentials never acquire/enable artifacts, create a Default Execution Rule or Background Analysis Enrollment, issue an analysis Run, or grant AI7 Apply. Onboarding may explain or offer a separate unselected, consequence-disclosed Enrollment decision, but Issue #86 does not fix its route, label or compact controls.
- Operational scope selection for development/CI, exact fixture recording or ordinary production is trusted build/launch authority, not a product setting, environment value, artifact/Plugin choice or fallback. Missing/unknown selection blocks Provider work and no cross-scope fallback appears.
- A secret entry may support paste and password-manager behavior but offers no reveal-after-save, copy, export or diagnostic action. Replacement does not expose the old value.
- Removing a connection names affected defaults and waiting/blocked Runs without deleting their history or silently choosing another Provider.
- Role cards remain primary. Raw model/endpoint/fallback detail expands only when needed for configuration or support, and no label implies one role is more factually correct.
- Optional Run Budget Ceiling preferences never hide per-Run estimate uncertainty, the exact default `未设置`, or Provider Account Limit uncertainty. `用量` presents aggregate and exact history without becoming a source of authorization or a substitute for provider account controls.

## Distribution channel and Product Data Location

| State | Settings presentation | Active behavior |
| --- | --- | --- |
| Windows writable portable folder | `Windows · 便携版 · 数据位于 AI7 文件夹内` | Normal; credentials stated separately |
| Windows installer/default local location | `Windows · 安装版 · 数据位于本机` | Normal; exact path expandable |
| Windows portable folder unwritable | `Windows · 已改用本机位置` plus actual location and reason | One ordinary notice; Settings retains exception state |
| macOS direct-download package | `macOS · 直接下载版 · DMG · 数据位于本机` | Per-user Application Support for `io.github.zhouy1017.ai7`; manual app replacement preserves product data; never portable/NSIS |
| Source checkout | `<actual platform> · 源码检出运行` plus actual canonical root | Never claims to be a portable/installed/DMG package |
| Known sync/backup root | `此位置可能被同步或备份` plus unpublished-material consequence | Non-blocking acknowledge; warning remains reviewable |
| Prohibited repository/development location | `当前位置不受支持` plus Data Location Remediation Guidance | Do not ask for technical risk judgment; guide to supported placement |
| `查看数据位置` | Open/reveal actual location as secondary support action | No path edit, migration, export, scope or authority change |

### Data-location rules

- Channel and location detection comes from authoritative local product state; the editor never selects `便携版` or `安装版` as a cosmetic preference.
- Fallback copy names the true current data location and the loss of full self-containment. It never leaves a stale `全部数据随文件夹移动` claim visible.
- Sync/backup warning explains possible external copying without asserting whether the third-party service actually synchronized anything. It does not block local work.
- Prohibited placement is stronger than a sync warning but uses guided plain language and a supported destination, not repository/worktree/shell terminology.
- The exact path may be copied/revealed from secondary detail for support. It is never an editable text field and never becomes a source selector or Local Export Destination.
- Credential separation remains visible in every platform/channel state and exception: copied product data is never described as carrying Provider credentials; Windows uses Credential Manager and macOS uses Keychain behind the same Credential Broker.
- A noncanonical or unavailable macOS Application Support location fails closed with exact remediation; it never silently falls back beside the `.app` or to another root.
- Viewing, acknowledging or hiding an informational notice changes no Product Data Location. Any future product-owned migration requires its own exact outcome and recovery semantics rather than being implied by this design.

## Keyboard commands and discoverable action entries

| Command/action class | Default placement | Remapping and IME behavior |
| --- | --- | --- |
| Text editing/selection/clipboard/undo | Native editor and current-platform conventions | Fixed; IME/system reserved behavior wins |
| Navigation | Direct common control or labeled menu | Eligible with conflict detection; blocked during composition when it would leave context |
| Search and jump | Right entry/panel plus menu command | Eligible; no command fires during composition |
| View/layout | `视图` menu or local disclosure | Eligible; changes view state only |
| Current primary or safety action | Direct exact contextual control | Not application-globally remappable; remains visible while actionable |
| Named authority/destructive action | Exact focused decision/effect/version surface | No global shortcut; any contextual modified shortcut requires visible scope/consequence |
| Secondary/infrequent action | Labeled overflow or second-level menu | Shortcut hint if assigned; pointer/keyboard route required |

### Keyboard/action rules

- IME composition state is checked before any AI7 accelerator, menu mnemonic or ProseMirror command. AI7 never treats a composition keystroke as submit, navigate, search, decide or authorize.
- A remap field captures one proposed combination, identifies conflicts and affected contexts, and saves only a valid unambiguous binding. Escape cancels capture after IME handling.
- Menus expose full Chinese action names, current shortcut and state/reason where disabled. Icon-only overflow triggers require an accessible name and visible tooltip, while individual consequential actions retain text.
- Secondary placement saves always-on space but does not create hunt-by-memory interaction: a stable category, search/help index and keyboard route lead to the action.
- Opening/closing disclosures changes no underlying Task, Proposal, decision, Effect, Workflow, persistence or recovery state. Focus returns predictably.
- At the moment a named authority action is valid, its dedicated contextual bar remains visible with exact scope and negative authority. An overflow menu may contain related inspection/history actions, not replace the record action itself.
- All remaps remain local preferences and have `恢复默认`. A missing/corrupt preference falls back to safe native Windows or macOS defaults without changing content or authority.

## Workbench density, reading typography and flexible surfaces

| Interaction | Presentation behavior | Invariant |
| --- | --- | --- |
| Choose `标准` | Default workbench spacing | No content/authority change |
| Choose `紧凑` | Reduce navigation/table/queue/metadata spacing | Manuscript, consequences, errors, targets and focus remain readable |
| Choose `编辑`/`审读` preset | Apply a starting reading rhythm | Work mode and document content unchanged |
| Adjust font/size/line height/width/alignment | Live bounded manuscript reflow with exact position/selection preserved | View-only; no stored/exported formatting change |
| Drag a separator | Resize one Resizable Workspace Region | Safe min/max; adjacent region remains usable |
| Keyboard-resize focused separator | Announce and change logical size step | Same bounds and reset as pointer behavior |
| Hide/close optional surface | Remove its projection and add/retain restore entry under `视图` | No record is dismissed/resolved/deleted |
| Attempt to hide required safety/authority surface | Collapse only to named persistent status/entry or refuse with reason | Urgency, consequence and return remain available |
| `恢复默认布局` | Reset density/region visibility/sizes according to scope shown | No content, Task or Run change |
| `在独立窗口打开稿件` | Guarded transfer of the active editable manuscript page to a Detached Manuscript Window | One Active Manuscript Surface Binding; no copy or authority expansion |
| Explicitly open another exact Book | Create or reveal that Book's Workbench | At most one Workbench per Book; distinct Books may coexist |
| Explicitly open an exact historical Revision | Reuse its Book Workbench and show immutable bounded content | Service-derived identity; no editor or mutation command |

### Flexible-surface rules

- Font lists prioritize dependable installed/bundled CJK families and preview representative Chinese punctuation/rare-character fallback before selection; fallback never rewrites text.
- Typography controls remain usable at system zoom and high contrast. Changing text width loads/reflows bounded windows while preserving the global location, selection and Search Return Position.
- Resize handles have visible focus, accessible orientation/value and a non-drag keyboard path. Double activation or the local menu may reset one region without resetting all preferences.
- When minimum sizes collide, the lower-priority supporting surface becomes a drawer/tab/stack according to context. The Manuscript and exact current decision are never horizontally compressed into unusability.
- Optional visibility state is recorded by surface type/local workspace. A changed record may still create Global Attention even if its prior projection was hidden; hiding never suppresses underlying attention.
- Required states that cannot be hidden include current Book/manuscript/revision identity, persistence/recovery danger, active blockers, exact consequences and the current named authority action. Compact projection may be used only if it remains unambiguous and directly reopenable.
- A Detached Manuscript Window uses the same manuscript component and eligible operations as the embedded page. It does not create a second editing instance, branch, revision, Run scope or authority surface.
- A Book Workbench Window is distinct from a Detached Manuscript Window. Its exact-Book registration serializes duplicate open requests; only an explicit editor route creates/reveals/focuses it, while background work and state changes never steal focus.
- The main workbench replaces the detached body with `稿件已在独立窗口打开`, exact identity/persistence status, `显示独立窗口` and `移回工作台`. It renders no second read-only manuscript body.
- Window transfer and close follow this state machine:

| Current state | Request | Result |
| --- | --- | --- |
| Embedded active; no IME composition; current journal acknowledged | `在独立窗口打开稿件` | Target loads bounded noninteractive projection; service atomically binds target; source becomes placeholder |
| Detached active; no IME composition; current journal acknowledged | `移回工作台` or ordinary window close | Workbench host becomes ready; service atomically rebinds it; detached host closes |
| IME composition active | Detach, reattach or close | Show `完成当前输入后继续`; wait for natural composition end without forced blur/commit/cancel |
| Journal acknowledgement pending | Detach, reattach or close | Keep source active and wait; no saved or transferred claim |
| Editing Protection Mode / at-risk buffer | Detach, reattach or destructive close | Block transfer/destruction; keep source Renderer and open exact protection options |
| Target readiness/binding fails | Any transfer | Cancel transfer and keep source active; never expose two writable surfaces |
| Active Renderer crashes | Recovery | Reopen from acknowledged service state in workbench/Recovery Workspace; do not claim recovery of a process-local buffer |

- Position, durable selection anchors, search state and view preferences transfer when representable from acknowledged state. Unacknowledged buffers and unverifiable Renderer-local undo state do not.
- Active Manuscript Surface Binding is an input-routing invariant, not a Book/manuscript business lock. It neither pauses background Runs nor weakens exact-pin and drift checks for Task, Proposal or Effect operations.
- Every Renderer still receives only bounded service projections. Opening, closing, moving or resizing windows changes no business record by itself.

## Application theme and native accessibility appearance

| Preference/system state | Presentation | Invariant |
| --- | --- | --- |
| `跟随系统` + OS light | AI7 light semantic-token mapping | Default; no content/state change |
| `跟随系统` + OS dark | AI7 dark semantic-token mapping | All AI7 windows update coherently |
| Manual `浅色` | Keep light mapping across ordinary OS light/dark changes | Native accessibility appearance still wins |
| Manual `深色` | Keep dark mapping across ordinary OS light/dark changes | Native accessibility appearance still wins |
| Windows high contrast/forced colors active | Use system-owned colors and expose exact focus/boundary/state semantics | Windows native adapter; not a fourth theme |
| Applicable macOS contrast/transparency/color-accessibility setting active | Preserve exact focus/boundary/state semantics through native adaptation | macOS native adapter; not a fourth theme |

### Theme rules

- Theme switches preserve the focused control, manuscript global position, exact selection, open panel, active input and window arrangement; they never blur/commit an IME composition as a side effect.
- Light mode keeps cool-neutral chrome and a slightly warm manuscript surface. Dark mode uses low-glare charcoal/neutral surfaces and avoids pure black/white contrast except where the system requires it.
- Semantic roles map shell, manuscript, raised surface, text, subdued text, focus, selection, boundary, status and action consistently. Color never substitutes for precise Chinese status text, focus geometry, icon/shape or structure.
- All main, detached and secondary AI7 windows share the active Application Theme Preference. A newly opened window cannot flash or remain on a stale theme.
- V1 provides no custom accent/palette editor. Theme remains a local view choice and never enters manuscript content, model context or exports.

## Semantic component-state presentation

| Presentation state | Required expression | Must not imply |
| --- | --- | --- |
| Focus | Visible focus geometry + accessible focus identity | Selection, decision or authority |
| Selected | Exact selected label/shape and count where relevant | Accepted, approved, applied or verified |
| Disabled | Named action retained + exact unavailable reason | Missing feature, completed decision or hidden consequence |
| Projection loading | Local object/surface named; stable layout where possible | Active Run, Provider request or business progress |
| Domain work/wait | Exact phase or wait reason + applicable interrupt/return | Generic `AI 正在思考` or invented percentage |
| Error/recovery | Affected object + consequence + preserved-safe state + next safe action | Automatic loss, safe Retry or generic failure |
| Authoritative completion | Exact record/evidence/receipt-backed claim + scope | Any stronger downstream authority |

### State-presentation rules

- The same component state uses consistent focus, boundary, text hierarchy and icon/shape across workbench cards, virtualized rows, panels and detached windows, with semantic-token remapping for each theme.
- Domain labels remain exact. `已采纳 · 尚未应用`, `已应用`, `事实核验待处理`, `已写入修订日志` and `已导出到所选位置` cannot collapse to one green success state.
- A disabled current action remains keyboard discoverable and explains the missing condition, but cannot be activated through a shortcut, menu duplicate or stale focus target.
- Projection loading is visually quiet and preserves geometry. Business activity names the actual phase/wait; only real measured progress receives a percentage.
- Authoritative Completion Styling appears after the supporting record/evidence/receipt is available. Optimistic styling is removed from Run dispatch, model response, tool result, Proposal generation and Effect attempt.
- Animation is functional and restrained. It may clarify focus, expansion or ongoing local loading, but never celebrates or supplies status meaning.

## Consequence-first microcopy and error disclosure

| Situation | Primary message pattern | Secondary behavior |
| --- | --- | --- |
| Field input invalid | `{字段}需要{修正}` beside retained input | Optional concise example; no global error |
| Run/provider blocker | `{任务/模型角色} · {exact blocker}` + what remains available + safe action | `查看技术详情` with sanitized code/diagnostics |
| Explicit Run Budget Ceiling reached | `任务运行预算已达上限 · 已保留部分结果` + `调整预算并重做` | Terminal Task Outcome; never success, pause, or provider-account wording |
| Provider Account Limit | `模型服务账户限额` + affected connection + `处理模型服务` | Keep separate from AI7 ceiling; no silent fallback or `无限` claim |
| Resume-ready interruption | `任务已中断 · 可续行` + last durable milestone + `续行` | No automatic dispatch; material drift and ambiguous Effects retain their own blockers |
| Editing persistence failure | `本地写入中断` + last durable boundary + at-risk extent + `查看保护选项` | Never `已保存`; technical cause secondary |
| Proposal/decision drift | `{record}已变化 · 需要重新确认` + unchanged content boundary | Link exact current/previous pins |
| Ambiguous external outcome | `{Effect}结果待确认` + no-repeat consequence + reconciliation action | No ordinary Retry/fallback |
| Verified completion | Exact scoped record/receipt claim + next available action | Absolute local time and expandable identity/evidence |

### Copy rules

- The first reading layer answers in order: affected object/state, consequence, retained-safe or unchanged boundary, and next safe action. It does not lead with exception codes or implementation causes.
- Headings use `对象 + 状态`; buttons use `动词 + 对象`. Easily confused authorities retain their full accepted names rather than `批准`, `继续` or `完成`.
- Input remains in place after validation or recoverable errors. Focus moves only when required to reach the error summary or prevent an unsafe action, then returns predictably.
- `查看技术详情` expands in place or in a secondary support panel without replacing the primary object. Copyable detail is sanitized before rendering and again before copying.
- Absolute local time accompanies durable decisions, receipts, milestone/publication versions and audit history. Relative time is supplemental, not the only durable timestamp.
- Closing a message changes only its projection unless the action explicitly names a separate record decision. A required blocker/status retains a compact named return path.
- No wording claims content loss, recovery, safe retry, committed Effect, factual truth, delivery or publication beyond exact evidence.

## V1 semantic migration rules

- [`migration-from-v1.md`](./migration-from-v1.md) is the retain/reshape/drop index; [`journeys.md`](./journeys.md) is the stable `J-01`–`J-14` continuity map.
- Retain copies state meaning and user outcome, never frozen placement, color, gesture or component mechanics.
- Reshape preserves the professional intent while applying current V2 authority. For example, Signoff becomes the user-facing Milestone Version projection, and delivery becomes local export plus an exact receipt rather than send/handoff tracking.
- Drop means the artifact has no V2 interaction contract. No route, hidden mode or fallback may silently reintroduce old A/B/C geometry, prototype behavior, editor-facing Policy/Composition elevation or external-channel delivery.
- Journey entries are design narratives, not completed acceptance evidence. They create no independent UI/usability/accessibility/performance gate.
- Question 60 historically closed the then-known `J-01` completion-record and `J-13` Series-membership seams. Issue #8 Batches 1–5 now close the separately discovered Book/import, Task-input, budget/Resume, Source/Series, destination-independent package, native export-conflict and versioned-maintenance branches.
