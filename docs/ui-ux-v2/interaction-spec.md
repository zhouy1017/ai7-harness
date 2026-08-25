# AI7 V2 interaction specification

Status: **candidate interaction contract complete for this session; not implementation evidence**

## Startup and restart

| Condition | Primary surface | Required disclosure | Prohibited behavior |
| --- | --- | --- | --- |
| One Recovery Attention State exists | Exact affected Book and Book Recovery Workspace | Durable Recovered Working State, relevant Milestone Version/Manuscript Checkpoint, any applicable verified Recovery Snapshot, and safe next actions | Global modal, silent restore/overwrite, or claiming recovery completed |
| Multiple Recovery Attention States exist | Global Attention recovery list plus one explicitly opened affected-Book workspace | Separate Book identity, urgency, durable boundary, and unresolved count | Cross-Book merge, forced global wizard, or silently choosing the newest item |
| No recovery attention; previous work resolves exactly | Last Active Work Object at its prior whole-manuscript position | Current Book, deliverable or manuscript identity, branch/revision, journal/checkpoint state, and any recovered-state label | Generic dashboard detour or silently switching to latest revision |
| No Book exists | Book creation or manuscript import | Local data location at the point it matters and the ability to work locally before provider setup | Forcing model credentials before local editing |

### Background attention

- Startup may show a compact count or quiet notification for Global Attention.
- A running or newly completed Task never replaces the Active Work Object automatically.
- A Clarification Request, pending decision, failure, or ambiguous outcome remains durable and reachable, but opening it is an editor action.
- Clicking an attention item navigates to the exact authoritative Book and record; notification dismissal changes no underlying state.

### Focus preservation

Reconstruction of the shell restores the last meaningful editor focus and whole-manuscript location when exact resolution remains possible. A Recovery Attention State may place focus on its explanation or first safe action, but it never applies recovered text merely by receiving focus.

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

## Book Work Overview

| Interaction | Result | Guardrail |
| --- | --- | --- |
| Continue from the Manuscript Visual Anchor | Opens the exact active manuscript branch/revision and last resolvable whole-manuscript position | Does not silently choose `latest` when the recorded pin differs |
| Open a related Editorial Deliverable | Opens that deliverable's own Active Work Object and Workflow Instance context | Does not inherit the Manuscript's phase, decisions, or completion state |
| Open a Workflow lens | Navigates to the selected deliverable's authoritative Workflow Instance | Does not show or mutate a Book-wide scalar lifecycle |
| Open a Task, Evidence, or Proposal lens | Navigates to the exact Book- or deliverable-bound record | Summary counts are not decisions or outcome proof |
| Open history/recovery | Shows manuscript history, journals, checkpoints, and recovery records with their distinct identities | Viewing or selecting a record does not restore it |

The overview may use visually prominent cards and quiet state summaries in the Codex-referential language. It must not let visual prominence imply that the Manuscript owns another deliverable's workflow, evidence, decision, or release authority.

## Series membership and sharing scope

| State/request | Primary surface | Result |
| --- | --- | --- |
| Open exact Series | `成员与共享范围` | Show member Books, governed Series Knowledge, explicit exclusions and membership history |
| Request `加入书系` | Series Membership Impact Preview | Name Book/Series and consequences for future Tasks, frozen Runs, knowledge/learning and history |
| Commit `加入书系` against current preview | Inline exact command | Append membership and Series Membership Change Record; enable future explicit Series selection |
| Request `移出书系` | Series Membership Impact Preview | Name future removal, unchanged frozen Runs/history and separately governed knowledge/learning records |
| Commit `移出书系` against current preview | Inline exact command | Remove future membership-derived selection and append change record |
| Preview or governing state drifted | Keep command unavailable | Refresh exact preview; do not apply stale membership change |

### Series-membership rules

- The impact preview starts with exact Book and Series identity and separates `未来任务`, `已授权或正在运行`, `书系知识与学习` and `历史记录`. It never compresses these into `将共享所有内容`.
- Membership is eligibility for explicit future Series-scope selection, not the selection itself. It grants no Run Authorization, source scope, learning eligibility, provider egress or cross-Book mutation.
- Adding membership does not alter existing drafts/Runs automatically. Removing membership does not alter already frozen authorized/running Runs; their exact source pins and normal drift/revalidation remain visible.
- Related Series Knowledge, Learning Material, eligibility, memory and lineage remain governed by their own records. Membership change neither silently activates nor deletes them.
- Final actions are `加入书系` and `移出书系`. Successful change shows the exact new membership and links its Series Membership Change Record; no generic approval or celebratory state appears.
- A failed/stale command leaves membership unchanged. Viewing, filtering or closing the workspace creates no membership change.

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
| `加入任务范围` | Add a range card with chapter/location, preview, character count, and current state | Creates one Pinned Manuscript Range for the current Task draft |
| Add another distant range | Preserve existing cards while the editor navigates and selects elsewhere | Extends the same Manuscript Range Set without creating a cross-window live selection |
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
| Milestone successfully saved | `已保存里程碑版本「{标签}」 · rN` | A new/existing immutable Manuscript Revision has the exact milestone designation |
| Journal acknowledgement delayed beyond normal pending state | `本地写入中断 · 最近持久写入 {time}` | Enter Editing Protection Mode; bounded input only |
| At-risk buffered input exists | `{count} 字可能尚未持久化` + structural location | Automatic exact retry; unsafe departure/mutation blocked |
| Buffer approaches safety limit | `为保护内容，编辑已暂时转为只读` | Enter Protective Read-only State before input loss |
| Exact buffered sequence acknowledged | Normal journal state | Clear protection state; no checkpoint/milestone implication |
| Exact rebinding fails after service return | Current/base/buffered comparison | Stop automatic replay and route to recovery/salvage |

### Commands and history

- The native Journal Save shortcut—`Ctrl+S` on Windows or `⌘S` on macOS—and `保存当前编辑` immediately request journal flush and wait for acknowledgement; repeated input after the request forms a newer pending state.
- `保存为里程碑版本` is separately named, requires label/purpose, may accept a note, and never shares a shortcut or completion message with Journal Save.
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

| State | Primary surface | Available action |
| --- | --- | --- |
| File selected | Local parsing/preflight progress | Cancel without creating Book/manuscript state |
| Fidelity review contains only `完整保留` | Concise summary with expandable per-class detail | Commit import or cancel |
| Fidelity review contains `降级导入` | Expanded material degradation count, examples, behavior, and export consequence | Explicit `按上述降级方式导入` or cancel; no preselection |
| Fidelity review contains critical `不支持导入` | Blocking explanation identifying unsupported classes | Cancel; optionally choose separately eligible `作为来源材料导入` |
| Service import running | Business-readable progress | Cancel before atomic commit |
| Atomic commit completed and all records persisted | `稿件已导入` with exact Book/manuscript/revision and degradation summary | `打开稿件` or `查看导入记录` |

### Import invariants

- Preflight is local and provider-independent.
- Status meaning never depends only on green/amber/red; text and icon/shape carry the classification.
- An Import Degradation Decision applies only to the displayed report for this import and never grants standing acceptance of future degradation.
- No completion state appears before the original file record, report, provenance, and resulting revision are persisted.
- A failed or cancelled import exposes no partially editable Manuscript.
- The Manuscript Import Record remains reachable from Book history and links original-file identity, final fidelity review, accepted degradation, provenance and resulting revision.
- `含已接受的降级` persists on the record and opens the exact affected classes/examples/export consequence; it is not hidden after the first completion card.
- The user-facing record is not a Manuscript Checkpoint, Milestone Version, export receipt or round-trip guarantee. Any internally applicable Effect Receipt remains separately linked in audit/technical detail.

## Reimport

| Step | Visible behavior | Guardrail |
| --- | --- | --- |
| Select replacement external document | Parse locally and open Reimport Comparison | Does not alter current Manuscript |
| Review mappings | Show exact stable mappings, changed structure, additions/deletions, and ambiguities | Automatic mapping is limited to unambiguous identities |
| Resolve ambiguity | Editor selects or creates intended structural relationships | No default mapping is preselected where identity is ambiguous |
| Commit | Create a new descendant Manuscript Revision atomically | Never overwrite current revision or imply live external synchronization |

## Task Intent capture

| Entry | Seeded context | Result |
| --- | --- | --- |
| Bottom composer from active manuscript/deliverable | Exact Book and Active Work Object; no inferred text range | Editable composer text with visible context chips |
| Selection action | Explicit Pinned Manuscript Range or newly anchored range | Adds only that range to the Task Intent Draft context |
| Finding/Evidence/Proposal action | Exact selected record and its permitted target reference | Does not inherit every related source or range |
| Book Work Overview action | Explicitly selected Manuscript or Editorial Deliverable | No implicit whole-Manuscript source scope |
| `准备任务` | Current visible composer text and exact context | Persist/open Task Intent Draft in the right surface; no model, provider, Run, or authority transition |

### Draft lifecycle

- The composer and right Task surface always show Book, target, branch/revision, and each Pinned Manuscript Range currently attached.
- Missing target or context is explicit and blocks later planning only when required; AI7 never fills it with ambient Book-wide authority.
- Switching Books collapses the draft under its original Book and offers `返回继续`. It cannot rewrite context chips to the newly active Book.
- A draft remains restart-safe until discarded or advanced; discarding it deletes no manuscript text, Task Ledger Run, or authoritative outcome because none exists yet.
- The round-arrow visual may be retained from the Codex-referential language, but accessible name and status say `准备任务`; no sent/streaming animation appears.
- Active Chinese IME composition consumes Enter and related keys normally and can never invoke `准备任务`.

## Task Skill recommendation

| Situation | Presentation | Editor control |
| --- | --- | --- |
| One clear Task Skill fit | One recommended card with rationale, required inputs, outcome, and possible Proposal/Effect classes | Accept, change, or continue editing intent |
| Materially ambiguous fit | Two or three candidate cards, none preselected | Select one or revise intent |
| Skill selected | Required Progressive Task Fields expand inline; optional detail remains collapsed | Complete, edit, or change skill |
| Goal changes materially | Existing recommendation marked `建议需更新` | Review new recommendation; no silent swap |
| No suitable skill | `暂无适合的任务技能` with intent-revision and available-skill routes | No generic-chat execution fallback |

Selecting a recommendation changes only the Task Intent Draft. Runtime Task Skill Activation and Effective Capability Grants occur later under the exact Plan Envelope and Run Authorization.

## Reusable procedure classification

| Recommended result | Exact trigger meaning | Preview consequence |
| --- | --- | --- |
| Default Execution Rule | Repeat the same user-initiated pattern under one existing Task Skill/version | Reduces later Task Intent review only; creates no new procedure definition |
| Task Skill Candidate | Reusable model-assisted steps with variable inputs/outputs and existing declarative AI7 Capabilities | Produces a non-executing local-user candidate for later independent admission |
| Workflow Profile Draft | Reusable phases, gates, responsibilities, required artifacts or Deliverable lifecycle | Produces an inactive profile draft; no current Workflow Instance changes |
| Developer Capability Proposal | New code, tool, external integration or code-bearing Capability Implementation is required | Produces a developer-track suggestion; no Plugin or capability is installed or enabled |

- `将以上工序保存为可复用工序` opens the classification preview before any result exists. The button label never claims that a Skill, Workflow or Plugin has already been generated.
- AI7 recommends exactly one result with a short `为什么这样分类` explanation. The editor may switch between Task Skill Candidate and Workflow Profile Draft; Default Execution Rule remains available only for an existing exact skill pattern, and code-bearing need remains in the developer route.
- Choosing a result type advances to that type's later capture/review flow. It performs no Task execution, installation, enablement, profile migration, Plugin admission, capability grant or authority-bearing action.

### Reusable procedure source and extraction

- The entry starts from one completed Run or an editor-selected ordered set of completed visible Task-plan business steps, deterministic commands and Workflow actions. It never begins from an unbounded recent-activity feed, transcript or whole Book history.
- The source selector permits add, remove and reorder before extraction. Failed, cancelled, rejected and later corrected instance steps are absent by default; an editor may provide one explicit corrected reusable version rather than inheriting the failed history.
- `将提取什么` shows reusable purpose, steps, branches, parameter slots, output types, source classes, Model Roles, requested AI7 Capabilities, possible Effect classes and applicable Workflow structure.
- `不会保存什么` names manuscript text, Book identity, concrete source content, secrets, provider/model bindings, factual outcomes, decisions, approvals, receipts, hidden Harness activity and technical retries. The reusable asset contains none of them; a separate local provenance record may retain the exact capture origin.
- The editor confirms this extraction boundary before classification can create a draft, candidate, rule proposal or developer proposal. Closing the preview creates nothing, and AI7 never performs silent capture for learning or later suggestion.

### Task Skill save, admission and enablement

| Exact action/state | Visible result | Authority consequence |
| --- | --- | --- |
| `仅保存候选版本` | New immutable local-user candidate version with source provenance and `尚未送交检查` | None; not installed, checked, enabled or executable |
| `保存并送交检查` | New immutable candidate enters AI7 admission; exact progress and reasons stay visible | May install exact bytes disabled and run an independent provider-free check; no enablement |
| Admission/check failed | Preserve failed candidate version and exact actionable reason; offer `修改并保存新版本` | Prior version remains immutable and unavailable |
| Check passed | Show installed exact version as `已检查 · 尚未启用` | Still unavailable for Task Skill Activation |
| `查看权限上限并启用` | Show admitted capabilities, eligible scope kinds, Model Roles/provider needs, Effect classes and exclusions before confirmation | Creates Task Skill Enablement only; future Task still requires its own exact Plan and Run Authorization |

- The Run that authored or repaired the candidate cannot validate, install, enable, approve, promote or activate it. AI7's independent admission path is visibly separate from that Run and does not reuse its success status as evidence.
- No enablement surface uses generic `允许全部`, `始终批准` or `立即运行` copy. An enabled version may request no more than its Authority Ceiling, and each future Run still resolves a narrower exact Task Skill Activation and Capability Grants.
- Candidate edits, repairs and upgrades always create new immutable versions. Historical versions, their admission outcomes and the Runs that referenced them are not rewritten.

### Automation Center version management

- `自动化中心` is always reachable from the stable global navigation. Contextual Task Skill, Workflow and Default Execution Rule surfaces may deep-link into a filtered exact entry/version without creating a second management implementation.
- The first level separates `任务技能`, `工作流程方案`, `默认直接运行规则` and `开发能力建议`. Each entry expands into exact versions rather than showing only a mutable `current` record.
- Each version row shows version, lifecycle state, whether it is `最新可用` or the active Workflow Profile default, change time and linked-work/delivery count. Opening it shows exact content/diff, Authority Ceiling or type-specific definition, and the Version-linked Work and Delivery View.
- A Task Skill picker starts on the newest enabled compatible version for a new unpinned use. Before Plan Preview the exact version is visible; authorization freezes it. Existing Runs and Default Execution Rules never move when a newer version appears.
- `关联工作与交付` navigates through exact ledger/profile links to Runs, Task Outcomes, Workflow Instances, Editorial Deliverables, Editorial Artifacts and Delivery Packages. Empty categories stay absent; the view does not duplicate manuscript or deliverable content.

| Removal situation | `删除版本` behavior | Retained result |
| --- | --- | --- |
| Never-admitted, wholly unreferenced candidate/draft/proposal | Explain permanent deletion, require explicit confirmation, then remove it | No asset version; separate audit record only if the governing record policy already requires one |
| Installed/enabled/previously activated, pinned, approved or historically referenced version with no active blocker | Disable/retire future availability and remove only safe package bytes | Historical Version Stub plus all authoritative links, Runs, decisions, outcomes and deliveries |
| Active Run/activation, enabled-rule dependency or current Workflow Instance pin | Disable destructive action and name exact blockers with direct routes | Version remains until completion/cancellation, rule disablement/update or explicit profile migration |
| Whole entry | Summarize every version as permanent-delete, retained-stub or blocked before one explicit confirmation | No cascade into Books, content, Runs, workflow state, decisions or deliveries |

- After removal of the latest eligible version, the next new unpinned use resolves to the next newest eligible version and names it. No historical pin changes.
- `删除版本` is never presented as deleting associated deliverables. Deliverables retain their own normal management and authority regardless of automation-version availability.

### Task Skill discovery and reuse scope

| Surface/state | Visible behavior | Does not imply |
| --- | --- | --- |
| Automation Center | Search/browse every locally visible enabled Task Skill and all historical versions | Recommendation, source access or Task authority |
| Intent-based recommendation | Suggest compatible enabled skills matching the current professional intent and Recommendation Applicability | Automatic choice, hidden version selection or Run start |
| Manual selector | Permit an exact eligible version; default to Latest Eligible Version | Permission to use disabled/retired/incompatible history |
| Outside recommendation applicability | Show `此技能通常不在当前范围推荐` plus the mismatched Book/Series/deliverable/phase filter | Hard prohibition when the version is otherwise enabled and compatible |
| New Book use | Start with current Book/target fields and unfilled variable inputs | Original Book/content/sources/results copied from capture |

- Recommendation Applicability may be edited as a suggestion filter for named Books, Series, Editorial Deliverable types and Workflow phases. The default leaves the enabled skill recommendable instance-wide.
- The Source Scope Builder still defaults to current-Book material for every new Task. A Task Skill may declare Series, Cross-project or House Editorial Memory scope kinds eligible, but the editor must select and authorize exact sources for this Run.
- Exact Task Skill/version remains visible in the Task Intent Draft and Plan Preview. Changing the selected version before authorization refreshes requirements and compatibility; changing it afterward is a material plan change.

### Workflow Profile, default-rule and developer-proposal completion

| Result path | Save action | Separate consequential action | Explicit non-effect |
| --- | --- | --- | --- |
| Workflow Profile Draft | `仅保存草案` or `发布为新版本` | Published version may later use `设为新建交付成果的默认方案` | No current Workflow Instance migration |
| Default Execution Rule | `仅保存规则草稿` | `审阅并启用规则` after the complete exact envelope is visible | No scheduled/background Task, Run start now or Effect authority |
| Developer Capability Proposal | `保存开发建议` | Later repository-development intake outside the editorial flow | No Plugin generation/install/enablement or Capability Implementation |

- Workflow Profile publication creates an immutable available version. Default designation is separately named, applies only to newly created Workflow Instances and identifies the Editorial Deliverable types affected.
- Existing Workflow Instance migration begins from the exact instance/profile pin or a named same-profile batch, previews phase/Gate/responsibility/artifact/history consequences and never occurs as a side effect of publication or default designation.
- Default Execution Rule enablement presents the exact Task Skill/version, required fields/variation, applicability, source rule, provider/egress, budget, result classes and possible Effect classes in one review. A future match still requires user submission and deterministic preflight.
- Editing any saved draft, published profile, enabled rule or developer proposal uses `保存为新版本`; version history and related-work/delivery links remain reachable.
- A Developer Capability Proposal may name a possible Plugin and the accepted developer-side eligibility/pinning policy: more than five GitHub stars, more than three repository updates, a latest update within the 30 days before development, and one exact locally managed version. The ordinary editor never sees a Plugin marketplace, code-generation action or capability escalation control.

## Quick Start and default execution

- `快速开始` is distinct from `准备任务` and must be explicitly invoked by the editor.
- It skips the separate Task Intent review screen but still creates the exact Task Intent, Execution Plan, Plan Envelope, and Run Authorization before dispatch.
- It cannot imply Proposal Decision, Review Decision, Effect Approval, Signoff Record, Public Release Permission, or Effect completion.
- A user may approve a Default Execution Rule after developing Task Pattern Confidence; future user-initiated matching Tasks may then start after deterministic preflight without a separate Task Intent review screen.
- Every such Run remains exact and points to the rule version that permitted automatic creation of its Run Authorization.
- Rule applicability may be one Book, an identified Series, or identified/all Books, but never silently expands the source scope of an individual Run.
- The rule binds exact Task Skill/version, required fields and allowed variation, source-scope rule, provider/outbound constraints, budget ceiling, outcome classes, and allowed Effect classes.
- Only a user submission triggers matching; the rule never schedules or invents Tasks.

### Default execution state table

| State | Visible behavior | Authority behavior |
| --- | --- | --- |
| User approves rule | Show complete rule envelope, applicability, source rule, provider/outbound, budget, outcomes/Effects, version, and revoke control | Creates/revises Default Execution Rule only; no Run |
| User submits one exact match and preflight passes | Start immediately; show `已按“{规则名}”默认直接运行` with expandable detail plus pause/cancel | Create exact Task/Plan/Envelope and per-Run Run Authorization linked to rule version |
| Ambiguous/multiple match | Explain ambiguity and open standard Task preparation | No Run Authorization or dispatch |
| Context/provider/outbound/budget/outcome/Effect drift | Name the mismatched field and open standard preparation | Never widen or rewrite the rule |
| Rule paused/revoked | Show rule status where it would have matched | Standard preparation only |
| Rule revised | New submissions use the new version after explicit user activation | Historical Runs keep their original rule-version link |

Task Pattern Confidence governs reduced Run-review burden only. Output remains an answer, finding, Artifact candidate, or Proposal as planned; any Proposal Decision, Review Decision, Effect Approval, Apply, Signoff, or Public Release Permission remains separately named and obtained.

## Task data boundary

| Region | Displays | Does not grant |
| --- | --- | --- |
| `要处理什么` | Exact Book, work object, branch/revision, ranges, and expected outcome target | Read access to every Book source or mutation of reference sources |
| `允许参考什么` | Task Skill recommendation plus selected exact current-Book, Series, Cross-project, and approved-memory records/versions | Mutation authority, Working Corpus access, or provider transmission |
| `哪些内容可能发送给模型` | Provider-bound maximum data categories and selected source boundaries | Public release, external export, exact promise to send every item, or permission beyond the Run plan |

### Source selection

- The Source Scope Builder uses Book, Series, source, revision, exclusion, and approved-memory labels rather than paths or folders.
- A Task Skill recommendation is visible and editable and never silently includes all Book, Series, or Cross-project material.
- Selecting Series scope expands its current eligible members and exclusions for review; later membership changes do not alter the frozen Run.
- Cross-project selection is itemized and never inferred from recent Books, Working Corpus, search history, or House Editorial Memory.
- Removing a source updates the draft plan and reveals any requirement it can no longer satisfy; it never substitutes another source automatically.
- Material expansion after Run Authorization suspends execution for Plan Revision and renewed authorization.

### Provider-bound disclosure

- The summary uses plain categories and counts, for example `当前稿件选段、3 项 Book 来源、1 项已批准社级编辑记忆摘要`.
- It distinguishes local readability from potential provider transmission and never labels configured model processing as public release.
- Actual payload audit remains reachable after the Run, but the preflight UI does not expose secrets, raw Harness Session content, or technical context-assembly details.

## Plan Preview

| Section | Default content | Expandable detail |
| --- | --- | --- |
| `目标与预计产出` | One concise goal and named outcome class | Full Task Intent fields and exact target identity |
| `处理对象与来源` | Book/work object/range plus source classes and counts | Exact revisions, exclusions, memory records, and scope digest |
| `执行步骤` | Three to seven editorial business steps with intermediate outcomes | Task Skill step configuration, without raw Harness internals |
| `需要你参与的位置` | Named possible Clarification/Proposal/Review/Effect actions or `预计无需中途参与` | Conditions that cause each request |
| `模型服务与预算` | Model Role, provider, outbound categories, estimate/range, and ceiling | Binding/fallback and detailed budget assumptions |
| `结果与受控动作` | Named outcome/Effect classes and important `不会做` statements | Exact replay/approval requirements and targets |

### Plan boundary behavior

- `运行中可调整` uses concrete editorial examples such as search terms, candidate-evidence count, non-critical step ordering, and safe retries within the frozen source/provider/budget/outcome/Effect envelope.
- `变化后必须暂停并重新授权` names goal, target, source expansion, provider, outbound category, budget ceiling, expected outcome, Effect class, and authority-bearing pin changes.
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
| Authorized, waiting for connectivity | `等待网络` or `等待模型服务` plus cancel | No provider work or budget consumption has begun |
| Connectivity returns; preflight unchanged | `联网恢复预检` then ordinary queue/run state | Same exact authorized Run may dispatch automatically |
| Connectivity returns; material boundary drift | `需要重新确认计划` | Exact Plan Revision and renewed Run Authorization; no silent start or fallback |
| Connectivity returns; credential/provider-service blocker without boundary drift | `需要处理模型连接` | Preserve exact Run Authorization, route to connection remediation, and re-run preflight; no silent fallback |
| Authorized, waiting for capacity | `正在排队` plus pause/cancel | Run exists; provider execution has not necessarily begun |
| Scheduler dispatches execution | `运行中` plus pause/cancel | Activity moves into Run projection; authorization bar no longer appears actionable |

### Authorization invariants

- The authorization bar stays inline and sticky within Plan Preview and never opens a duplicate confirmation modal.
- Its compact summary always includes Book/target, plan version, provider, budget ceiling, outcome, and possible Effect classes.
- The exact negative-authority statement remains visible before activation.
- Disabled readiness states identify the specific stale/missing field rather than presenting a generic disabled button.
- Successful activation records actor, time, plan version, target/source/outbound/budget boundary, and exact Run Authorization identity for expansion after dispatch.
- `正在排队` is not model activity, and `运行中` is not Task Outcome or proof of any Effect.
- Creating or changing a Default Execution Rule requires its separate explicit action and never rides along with standard Run Authorization.

### Offline preparation and reconnect

- Offline Plan Preview distinguishes locally authoritative plan facts from `待联网确认` live provider facts. Unknown data is never shown as a zero-cost or ready state.
- `授权并在联网后开始` summarizes the same exact target, source, outbound, provider/fallback, budget, outcome, and Effect boundary as ordinary Run Authorization and explicitly states `当前不会调用模型`.
- After activation, the bar becomes a Connectivity Wait status card. Cancel remains immediate; there is no background toggle that silently changes future drafts.
- Reconnect Preflight runs only while the supervised AI7 service is active. Network return does not launch the desktop application.
- Unchanged preflight hands the existing Run to the normal scheduler. Material boundary drift replaces auto-start with Plan Revision and renewed authorization. Credential or provider-service readiness failure under an unchanged binding preserves the authorization, names the blocker, and routes to connection remediation before preflight runs again.
- Mid-Run disconnection does not pretend the Run is still progressing. The last durable milestone remains visible; safe continuation uses the already accepted Resume/Retry meanings.

## Model role, capability, provider, and budget

| Layer | Visible by default | Interaction |
| --- | --- | --- |
| Primary Task surface | Compact Model Role selector and Model Capability Requirement chips | Editor changes desired work capability; Provider Preflight recomputes |
| Compact disclosure | Exact provider/model label, ready/blocking state, outbound category, fallback presence, reliable estimate/range, hard ceiling | Expand secondary detail; no raw provider control here |
| Secondary Task detail | Binding rationale, fallback conditions, provider policy, outbound classes, connection name, budget assumptions/rules | Review; material changes return through Plan Revision |
| Settings | Connections, credentials, eligible alternative frontier, default bindings, billing currency, budget defaults | Configure persistent service state; secrets never displayed after entry |
| Usage | Historical/aggregate usage and cost plus per-Run links | Inspect; no Task or Run authority |

### Compactness and exception behavior

- The Model Selection Strip occupies one compact row or disclosure group and never becomes a large provider dashboard.
- Exact provider, outbound, and budget facts cannot disappear entirely before Run Authorization; they remain in one compact readable line with accessible expansion.
- A missing connection, changed outbound category, unavailable model, ambiguous fallback, unreliable estimate, or exceeded ceiling expands inline automatically with the exact safe action.
- Model Role and Model Capability Requirements are not quality/factual sliders and never use labels such as `更正确` or `事实可靠`.
- DeepSeek default bindings and any explicitly configured alternative frontier binding remain exact detail, not user-facing product authority.
- After execution, actual use/cost moves to Run detail and Usage rather than permanently occupying the manuscript/task surface.

## Running Run activity

| Run condition | Compact header | Expanded activity |
| --- | --- | --- |
| Running with measurable units | Business phase, current object, exact `completed/total`, last meaningful update | Milestones plus inspectable candidate/partial results |
| Running without a stable denominator | Business phase, current object, last meaningful update; no percentage | Milestones and any usable candidate stream |
| Waiting for clarification | `等待你的说明` plus the named Clarification Request | Prior milestones, exact request, and context needed to answer |
| Connectivity/model-service wait | `等待网络` or `等待模型服务`, authorized plan identity, and last completed milestone | Connection detail, Reconnect Preflight state, and cancel; no provider activity implied |
| Run Capacity Wait | `等待运行名额` and last completed milestone | Queue position when trustworthy plus pause/cancel; connectivity is not the blocker |
| Paused or interrupted | Exact state, cause when known, last completed milestone | Continuation checkpoint/context and valid next actions |
| Completed | Named Task Outcome summary, not merely `100%` | Actual-versus-planned milestones, results, unresolved matters, Effects and receipts |

### Activity projection rules

- The Run Activity Header stays compact in the right Task surface and is also projected into `运行中与已暂停` without duplicating Task Ledger authority.
- The Editorial Milestone Timeline contains business-readable events with stable links to exact source, candidate, Clarification Request, outcome, Effect, or receipt records when those records exist.
- Technical attempts, raw tool calls, Harness events, provider token streaming, subagent identities, and chain of thought never become the normal timeline vocabulary.
- A Usable Candidate Stream may progressively reveal draft prose, candidate claims, comparison rows, or other inspectable intermediate material; every item remains visibly provisional until the appropriate later decision or Effect succeeds.
- Measured Run Progress uses exact comparable work units, for example `已核对 12/37 条引文`. If the total changes materially or ceases to be trustworthy, AI7 drops the numeric indicator and explains the current phase rather than preserving a misleading percentage.
- When meaningful activity stops, the UI reports the last completed milestone, current wait/stall reason, time since the meaningful update, and valid safe action. Elapsed time alone is never a progress measure.
- Clicking an expanded candidate, evidence comparison, or result may explicitly open a Dedicated Work Workspace; no background event changes work-surface mode automatically.
- Provider/model/cost and diagnostics remain behind secondary disclosure unless they are the blocking condition. No activity surface implies factual verification, Proposal Decision, Effect Approval, Effect Receipt, workflow completion, Signoff, or Public Release Permission.

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

- Foreground and background are display states only. They do not change scheduler priority, budget allocation, provider selection, execution grants, or Run authority.
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
| Paused and exact envelope still valid | `继续任务` | `正在恢复` or capacity wait | Same Run returns to running |
| Paused with material drift | `继续任务` attempt | Blocked with exact changed boundary | Plan Revision and renewed authorization route |
| Queued or running | `取消任务` | Inline Cancellation Impact Summary, then `正在取消` | `已取消` only after durable terminal classification |
| Effect already committed | `取消任务` | Summary identifies committed Effect and receipt | Run cancels future work; Effect remains committed |
| External Effect outcome ambiguous | `取消任务` | Stop automatic retry/fallback and classify uncertainty | `结果待确认`, never false `已取消且无影响` |

### Control invariants

- The first pause click records a durable request and needs no confirmation. Repeated clicks do not create multiple requests.
- `正在暂停` and `正在取消` remain visible through Book switching/restart and name the current safe-boundary condition; neither is collapsed into a spinner.
- The Cancellation Impact Summary states future work to be stopped, retained candidate/evidence records, known committed Effects/receipts, and any action whose outcome is not yet known.
- Confirmation cancels only the named Run. It grants no rollback, Proposal Decision, Effect Approval/reversal, Signoff change, or Public Release change.
- Candidate and partial-result retention does not make those records authoritative or eligible for automatic Apply.
- Terminal cancellation disables `继续任务`. A later attempt must use the separately defined Redo path rather than mutating the cancelled Run.
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
- Freezing records Effect ID, target/payload digest, Proposal/decision lineage, replay policy, atomicity, expected result, and exact preflight state. The frozen summary is immutable.
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
- On pointer/keyboard activation, AI7 durably creates an Effect Approval containing actor, time, Effect ID, target/payload digest, target revision, Proposal/decision lineage, replay policy, and expected result before dispatching the same identity.
- If durable approval succeeds but dispatch has not yet started, the UI states `已批准，等待应用` rather than presenting a second approval action.
- Dispatch uses idempotent Effect identity. Renderer retry or application restart queries the existing outcome and never repeats commit merely because acknowledgement was lost.
- A focused shortcut is disabled while IME composition is active and requires the same exact current Apply Approval Readiness as pointer activation.
- Once activated, the surface cannot be edited in place. Any changed scope or retry path creates a new prepared payload/identity according to the declared replay policy.
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
| `全稿事实核查` | Whole Manuscript revision, policy, scope/provider/budget | Fact-check Lens virtualized across all results |

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
- Evidence Source Cards may render progressively; missing publisher, version, freshness, provenance, integrity, exact fetch, or relation fields remain explicit rather than blocking the entire source list with a spinner.
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
| `快速整理` | Candidate sources/snippets and summary return first; checks fill progressively | Exact quotation requires Exact Fetch; no general determination gate because formal determination unavailable | `待核查` finding or evidence-incomplete Correction Proposal draft |
| `标准核查` | Candidates first; pinned/quoted/high-relevance evidence checks in background | Minimum Evidence Gate when recording formal verification | Policy-permitted supported/contradicted/unresolved result |
| `严格核查` | Selected evidence assurance runs to full required depth | Full policy-required selected-evidence gate | Same result vocabulary with higher documented assurance |

### Assurance interaction rules

- The selector shows a one-line consequence, estimated additional work when reliable, and `政策要求` on any enforced minimum. It never uses `更正确` or a model-quality ladder.
- Candidate browsing and comparison remain interactive while checks run. Individual cards show missing/running/current/stale fields rather than one workspace-wide blocking loader.
- `记录正式核查结论` evaluates the exact policy version, assertion risk/context, selected evidence, and current checks. Missing requirements reveal a concise checklist and safe actions, not a generic disabled button.
- In Quick mode, the equivalent primary action is `保存为待核查结果`; supported/contradicted actions remain unavailable and explain the required move to Standard/Strict.
- `建议更正` remains available to draft a Correction Proposal in Quick mode, but both draft and later review display `证据核查未完成` and the precise missing checks.
- Raising level starts only missing/stale work and shows `复用 {n} 项已有核查 · 补充 {m} 项`. Lowering does not cancel a check already needed by another current decision or policy.
- Policy may require Strict for named high-risk classes or workflow points. The UI exposes the professional reason and required checks, not hidden prompt or policy implementation detail.
- No assurance selection changes Run Source Scope or provider-bound data silently; any material source/egress/budget change follows Plan Revision and renewed authorization.

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
- Reopen/skip uses Choice-first Input Card rules. Suggested reasons remain unselected, free input is available, and submission invokes an exact deterministic command rather than a Task Skill.
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
| Selected milestone has later edits | Exact Milestone Change Exclusion Notice | Continue with old version or return to save a new milestone |
| Required item missing | Exact item, profile requirement, safe route | Package freeze unavailable until requirement/profile exception resolves |
| Manifest/fidelity ready | Full Delivery Package Manifest Preview | `准备交付包` available; still no external action |
| Frozen | `已准备 · 尚未导出` + Package ID/version | Inspect package or enter Local Export Preparation |

### Package rules

- The milestone selector shows label, purpose, exact version, author/time, later-edit relation, and recommendation reason. Selection remains explicit.
- Delivery Package Purpose names the local package's intended editorial use without collecting a recipient or external-channel target. Local Export Destination is chosen later through the current platform's system picker.
- Included files/artifacts show type, originating exact version, expected filename/format, requirement source, status, and limitation. Exclusions remain a first-class list.
- Version/change/source/factual supporting materials remain typed Editorial Artifacts and never merge with the public-facing Deliverable text.
- Fidelity summary states fully preserved, degraded with exact disclosure, or unavailable content classes for every planned format. DOCX is the primary editable format, PDF is an optional fixed-layout format, and Markdown is the explicit fallback format; the linked Export Fidelity Disposition is frozen with the package.
- Local generation validates manifest completeness and file digests and provides product-level preview/open actions without exposing the staging root.
- If one required staged file fails, no immutable prepared package version is recorded. The user may inspect exact failure and retry local generation safely.
- Freeze records Package ID/version, selected milestone, purpose/target, exact manifest, exclusions, limitations, fidelity state, artifact/decision lineage, and generated-file digests.
- Post-freeze changes use `创建新交付包版本`; the previous package stays immutable and clearly unexported/exported according to its own Effect Receipts.
- Preparing or previewing never emits a success term such as `已交付` and never creates Export authority or Public Release Permission.

## Local Export Formats and Fidelity

| Export state | Presentation | Available action |
| --- | --- | --- |
| Exact milestone selected for standalone export | DOCX recommended; PDF visible; Markdown under `备用格式` | Choose one or more formats |
| Prepared package selected | Frozen package files/formats; Delivery Package Purpose shown separately | Continue with eligible files or create a new package version for another format |
| Fidelity calculating | Progressive per-format/content-class rows | Inspect completed rows; no premature approval |
| Material degradation | Exact transformed/lost classes; acceptance unselected | Accept for this exact export, change format, or return |
| Required class unavailable | Affected format and reason | Choose valid format or resolve the source/package requirement |
| Ready | Exact version, formats, filenames, Local Export Destination, Export Fidelity Disposition | Exact local Effect Approval |
| Generating | Compact measurable background progress | Cancel before commit boundary |
| Committed | Effect Receipt and `已导出到所选位置` | Open local result or return to package; no follow-on handoff step |
| Ambiguous/failed | Exact outcome classification; no success label | Inspect safe next action; never blind retry |

### Representation and export rules

- DOCX is selected by default only as the recommended Primary Editable Export; the user may add or replace it with PDF or explicitly open `备用格式` for Markdown.
- PDF preview emphasizes page/print result and states `固定版式，不支持可编辑往返`; it is never represented as a proof, factual authority, or release state.
- Markdown fallback states which structure and rich-document semantics are flattened, externalized, or omitted. A DOCX failure never silently substitutes Markdown.
- Fidelity rows cover every applicable content class and remain summarized when fully preserved. Any degraded/unavailable class expands automatically and places its consequence beside the choice.
- The remembered destination is a user-recognizable recent location hint only. Final export still uses the current platform's system picker and binds the resolved exact target in Effect Approval.
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
| Replaced/withdrawn | Historical state and succeeding record | Never erase or retarget the earlier version/permission |

### Publication-version rules

- The action is contextual to version/history, not a standalone approval destination or a checkbox inside Local Export Preparation.
- The visible completion wording is `已设为发稿版本`, followed by the exact version and scope. `已发布` is forbidden because V1 performs no publication Effect.
- One user interaction appends the Publication Version designation and the separate internal Public Release Permission or reports no change; audit detail may reveal the internal identity without exposing unfamiliar terminology in ordinary use.
- Publication Version does not include later edits, another Deliverable, source materials, or every file in a later package unless its exact permission scope says so.
- Ordinary exports remain entirely unchanged whether no Publication Version exists, one exists, or the editor chooses a different internal-use milestone.
- Global Attention uses `发稿版本待设定` only for a real profile/policy-required action; it never treats every local export as pending publication work.

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
| No scope selected | All include/exclude/defer choices unselected; `仅纳入当前 Book` marked recommended | Select/edit only; no authority yet |
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
- Inclusion permits downstream signals or Memory Candidates only. Memory approval/activation, task retrieval, provider egress, factual status, and every named product authority remain separate.
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
- A secret entry may support paste and password-manager behavior but offers no reveal-after-save, copy, export or diagnostic action. Replacement does not expose the old value.
- Removing a connection names affected defaults and waiting/blocked Runs without deleting their history or silently choosing another Provider.
- Role cards remain primary. Raw model/endpoint/fallback detail expands only when needed for configuration or support, and no label implies one role is more factually correct.
- Budget defaults never hide per-Run estimate uncertainty or ceiling. `用量` presents aggregate and exact history without becoming a source of authorization.

## Distribution channel and Product Data Location

| State | Settings presentation | Active behavior |
| --- | --- | --- |
| Windows writable portable folder | `Windows · 便携版 · 数据位于 AI7 文件夹内` | Normal; credentials stated separately |
| Windows installer/default local location | `Windows · 安装版 · 数据位于本机` | Normal; exact path expandable |
| Windows portable folder unwritable | `Windows · 已改用本机位置` plus actual location and reason | One ordinary notice; Settings retains exception state |
| macOS selected native channel/location | `macOS · <actual channel> · 数据位于本机` | Exact wording follows the macOS package/data decision; never claims portable/NSIS behavior |
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

### Flexible-surface rules

- Font lists prioritize dependable installed/bundled CJK families and preview representative Chinese punctuation/rare-character fallback before selection; fallback never rewrites text.
- Typography controls remain usable at system zoom and high contrast. Changing text width loads/reflows bounded windows while preserving the global location, selection and Search Return Position.
- Resize handles have visible focus, accessible orientation/value and a non-drag keyboard path. Double activation or the local menu may reset one region without resetting all preferences.
- When minimum sizes collide, the lower-priority supporting surface becomes a drawer/tab/stack according to context. The Manuscript and exact current decision are never horizontally compressed into unusability.
- Optional visibility state is recorded by surface type/local workspace. A changed record may still create Global Attention even if its prior projection was hidden; hiding never suppresses underlying attention.
- Required states that cannot be hidden include current Book/manuscript/revision identity, persistence/recovery danger, active blockers, exact consequences and the current named authority action. Compact projection may be used only if it remains unambiguous and directly reopenable.
- A Detached Manuscript Window uses the same manuscript component and eligible operations as the embedded page. It does not create a second editing instance, branch, revision, Run scope or authority surface.
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
- Question 60 closes the former `J-01` and `J-13` seams through the Manuscript Import Record and Series membership/shared-scope interaction; all fourteen IDs now have candidate mappings.
