---
status: accepted — drafted on 2026-10-23 from the Owner's decisions of that day, recorded in #1065, and accepted by the Owner on 2026-10-23 in the Commander session (「接受 ADR 0095/0096，按推荐顺序派发」), which this record names as its acceptance
date: 2026-10-23
deciders: Owner
amends: ADR 0006 and ADR 0025 (structural edits as ordinary journal edits; note and table block kinds); ADR 0086 §2 rows 脚注与尾注, 表格 and 图片与图注, and its rejected prototype reading as far as a note block is concerned; ADR 0072 (heading classification by style only); ADR 0045 staged admission (the default workspace profile is pinned at Book creation); ADR 0094 §6 (the one explicit action extends to starting a procedure from its sheet); V2-UX-ED-017/018/019/044, IMP-002, IMP-055, AUTH-001/002/004, PLAN-007/008, PDEC-001/002/006/012, EAPP-003/004, LIVE-004, TASK-017; UI ADR 0011; editor surfaces §0.1, §1, §6, §7; the manuscript block definition of the editorial CONTEXT
---

# 0096 · Edit manuscript structure, recognize structure on import, and remove editor-facing ceremony

On 2026-10-23 the Owner accepted the assessment that the manuscript editor cannot split, merge, insert or delete a paragraph or change a heading level, that a DOCX without Word heading styles enters AI7 as one unstructured run of paragraphs, that footnotes are neither shown nor editable, and that several confirmations, identifiers and one static status label stand between the editor and the work. This record decides the editor-side changes; [ADR 0095](0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md) decides the execution side. It is design, not implementation; [PROGRESS](../../PROGRESS.md) owns delivered behavior.

## 1. Structural edits are ordinary edits

Splitting a paragraph, merging two, inserting or deleting one, and changing a heading's level are ordinary manuscript edits recorded in the Edit Journal as **structural edit kinds** beside the single-block text replacement that exists today. Each records the lineage ADR 0006 requires — which blocks a new block descends from, and which block absorbed a merged one — so that pinned ranges, marks and reimport comparison keep resolving. A ranged 修改建议 whose text a structural edit touches becomes a Drifted Manuscript Range exactly as ED-044 states. Enter splits at the caret, Backspace at the start of a paragraph merges with the previous one, and both work inside the bounded window with no round trip the editor must wait for. Hierarchy changes across many headings and section moves remain Structure Adjustment Mode (ED-018), deferred in F-15.

Two block kinds join title, heading and paragraph: a **note block** that carries a footnote or endnote with its reference position, shown and editable in the manuscript, and a **table block** that shows a table's cells read-only while the table's structure stays with the Source Version; an image is shown read-only from the Source Version. Export restores unedited structures from the original file as today and discloses, per edited structure, what it could not restore.

Applying a suggestion no longer cuts the undo history: the Apply is one more journal entry that `撤销` steps over; reversing an Apply remains the governed reversal Effect of UI ADR 0003.

## 2. Structure recognition on import, and long paragraphs

When an imported DOCX carries no heading styles, AI7 proposes a **candidate structure** from the text itself — lines such as 第X章 / 第X节 / 一、/ 1., short standalone lines between long paragraphs, and a table-of-contents block — and shows it in the import fidelity review as a list the editor confirms, adjusts or declines; nothing is preselected and nothing is committed without the confirmation. Confirmed candidates are written back as heading kinds with their levels. The resulting chapter table drives 选章, 各章 and every report's position label. A manuscript with heading styles behaves as today.

A paragraph longer than the block bound no longer refuses the whole import: AI7 splits it at soft line breaks when the file has them, and otherwise shows the paragraph in the fidelity review with the choice to split it at a sentence boundary or import it as several blocks with disclosed lineage. The block bound stays a bound on blocks, not on imports.

## 3. Less ceremony, more trust

- **The default 编辑工作区方案 is pinned when a Book is created.** The explicit review-and-enable step of ADR 0045 remains for any artifact other than the shipped default; the editor never installs the default by hand before an analysis can start.
- **Starting a procedure from its sheet is the one explicit action.** When the prepared plan is not editable, `开始审阅` (or the procedure's own start) creates the Run Authorization directly; the full plan stays reachable and a changed boundary still stops before dispatch (ADR 0094 §6, extended from polish, research and redo to every procedure start).
- **One decision system on a card.** A 修改建议 card offers `接受并应用`, `修改后接受`, `拒绝` and `转为批注`; the draft dispositions 拟采纳 / 拟拒绝 / 暂不决定 live only in the proposal workspace where batches are prepared.
- **Identifiers live in the technical layer.** Book identifiers, revision and decision identifiers and raw receipts are never printed inline on 书库 cards, in the proposal workspace, in reimport choices or in model settings; they stay one disclosure away as ADR 0071 §1 requires.
- **The processing indicator tells the truth.** The context header's 「本地处理 · 未联网」 label is replaced by a live indicator derived from the execution state: `本地处理` when nothing is in flight, `正在发送至〈渠道〉` while a request is out, `等待网络` during a connectivity wait, and nothing it cannot vouch for.
- **Smaller frictions**: the Main Editorial Role gains the same connection test the Fast role has; `返回` returns to the screen the editor came from; the manuscript surface says 段落, not 内容块; a search result set is marked stale after an edit instead of being discarded; the search query and replacement limits are one value in the service and the surface.

## Clauses amended

| Owner | Affected clause and replacement |
| --- | --- |
| Editorial CONTEXT **Manuscript Block**; [ADR 0006](0006-preserve-manuscript-native-history-and-recovery.md); [ADR 0025](0025-windowed-editing-over-a-paging-manuscript-store.md); [kick-in 18](../../kick-in/18-manuscript-revision-and-recovery-boundary.md#accepted-semantic-model) | Block kinds gain note and table; structural edits are journal edit kinds with lineage (§1). |
| V2-UX-ED-017, ED-018, ED-019, ED-044 | Split/merge/insert/delete and a single heading's level are ordinary edits; section moves and multi-heading hierarchy changes keep Structure Adjustment Mode (§1). |
| [ADR 0086](0086-classify-ten-import-content-classes-and-retain-them-with-the-source-version.md) §2 rows 脚注与尾注 (`降级导入 until the manuscript has a note block`), 表格, 图片与图注; its rejected "prototype as drawn" | A note block exists; tables and images are shown read-only; the long-paragraph import refusal becomes a split or a disclosed choice (§1, §2). |
| [ADR 0072](0072-admit-multi-format-manuscript-intake-with-docx-as-the-working-representation.md) §4 classified import; V2-UX-IMP-002, IMP-055 | Candidate structure recognition with editor confirmation for style-less manuscripts (§2). |
| [ADR 0045](0045-preserve-native-dsh-artifacts-behind-ai7-authority-sidecars.md) staged admission, Issue #165 successor; [ADR 0055](0055-stage-the-bounded-provider-free-j-03-authorization-journey.md); V2-UX-OFF-007, REUSE-026 | The shipped default profile is pinned at Book creation; explicit enablement remains for any other artifact (§3). |
| V2-UX-AUTH-001, AUTH-002, AUTH-004, PLAN-007, PLAN-008, TASK-017; [ADR 0094 §6](0094-unified-multi-provider-runtime-global-learning-agent-and-word-track-changes-intake.md#6-one-explicit-action-for-frequent-operations); editor surfaces §6 | A procedure sheet's start is the one explicit action when the plan is not editable (§3). |
| V2-UX-PDEC-001, PDEC-002, PDEC-006, PDEC-012, EAPP-003, EAPP-004; [UI ADR 0011](../ui-ux-v2/adr/0011-use-proposal-change-items-and-explicit-atomic-groups.md); editor surfaces §1 mark table | One decision system on the card; drafts only in the proposal workspace (§3). |
| Editor surfaces §0.3 context header 「一句状态」; V2-UX-LIVE-004 | The live processing indicator (§3). |
| [PRD Further Notes](../prd/ai7-v2-prd.md#further-notes) successor routing; editor surfaces §0.1 precedence sentence; UI CONTEXT **Live Processing Indicator** and glossary; UI README decision log | ADR 0096 is named. |

## Delivery and proof

Implementation owners (unchanged here): `src/service/docx.ts` style-name heading detection and paragraph bounds, manuscript store/editor structural edit and undo paths (F-22), and the default-profile, procedure-start and card projections (F-23).

Structural edits, the note block and structure recognition are F-22 in the [development plan](../development/development-plan.md) (Wave 22, with tables and images in Wave 23); the ceremony and indicator changes are F-23 (Wave 22). J-02 proves split, merge, heading level and undo continuity on the synthetic long manuscript; J-01 proves candidate structure recognition and the long-paragraph choice on an admitted Public SampleBook variant without heading styles; J-05 proves the single decision system; J-12 proves the live indicator and the Main-role connection test. This record supplies no product or live-model pass.
