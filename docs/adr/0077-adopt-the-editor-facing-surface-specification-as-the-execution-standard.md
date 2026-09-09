---
status: accepted
date: 2026-09-09
deciders: Owner (chooow.yang@gmail.com)
supersedes: none
amends: ADR 0076; V2-UX-AUTH-002, AUTH-003, TASK-017, TASK-019, PLAN-001, DPKG-009, MILE (scope) and the clauses named in §8
---

# 0077 · Adopt the editor-facing surface specification as the execution standard

## Context

[ADR 0076](./0076-align-editor-facing-surfaces-to-the-owner-s-september-decisions.md) recorded the first half of the Owner's September design session — manuscript-first entry, marks, review, evaluation, the knowledge base, the findings center and external evidence retention. The session then continued screen by screen through task planning and authorization (③), import, reimport and export (④), global navigation, the knowledge base and settings (⑤), and deliverables (⑥), and re-cut two earlier screens (②A to baseline-only, ②B with one more category). Every screen ended with the Owner's 「定了」.

On 2026-09-09 the Owner changed what the session delivers: 「不是写handoff而是写为最新的作为执行标准的设计开发文档。同时将所有后端功能实现都和界面中确认的流程进行对齐」. The deliverable is therefore not a handoff note but a specification that ranks as design truth, plus an explicit alignment of the backend to the confirmed flows.

Under ADR 0064 the frozen references change only through an ADR that names the clause. This ADR names every clause the second half of the session changed, adds the specification to the frozen reference set, and states how the backend alignment enters the development plan.

## Decision

### 1 · The specification is the execution standard

[`docs/ui-ux-v2/editor-surfaces.md`](../ui-ux-v2/editor-surfaces.md) is a frozen design reference with the same standing as `requirements.md`, `information-architecture.md`, `interaction-spec.md`, `visual-direction.md` and `journeys.md`. It states, for every editor-facing screen, the final form, the states, the Chinese wording, the data each surface needs and the backend capability each confirmed flow requires. A conflict between it and another reference is resolved by the clause this ADR names, then by the specification. The prototypes it links are evidence and discussion tools, not authority; a Worker implements the specification, not the prototype.

### 2 · Task plan and authorization

「Q1 OK Q2 当前模式可以，但是应当再有一个精简模式，只显示最重要的一批问题，因为长期文字工作下可能不会每次都有精力进行这么多review，即使提供了用户也只会直接点执行 Q3 开始任务 Q4 负面授权说明ok Q5 要保留 Q6 保留 Q7 可以」「R1： 在任务派发最后有一个AI7的动作解释的结果卡非常好，我希望在这里添加一个交互功能，用户可以在这里编辑AI7的任务范围或者更改任务的限制，比如删掉某一条“要做的事”，改掉某一条重试，也就是截图中的板块应该是可编辑的，甚至可以拖动交换。而这个更改可以重新同步到计划中」「Q1 ok Q2 ok Q3 ok Q4 是的，运行中的任务只能暂停或者重做 Q5 快速开始的情况下默认执行规则」

Every Task shares one plan surface in the right-side Task Drawer beside the visible manuscript. The plan has a 精简 mode (default, remembered) that shows only the LAYER-002 minimum — 处理, 发送 with cost and ceiling, 会得到, 不会, 中途 — and a 完整 mode with the six PLAN-002 sections. In 完整 mode the editor edits the plan in place: business steps (text, delete, reorder, add), the adaptations AI7 may make on its own (edit, remove, or drag into the ask-first column), and the reference materials; the material fields PLAN-004 lists stay locked. Edits mark the plan 「你改了 N 处」 and the primary action becomes 更新计划, which regenerates the plan as the next plan version through the PLAN-009 Plan Revision path; only then can the Run start. The primary action reads 开始任务 (offline: 联网后开始任务); the negative-authority statement reads 「只是让 AI7 按这份计划做这一次；接受修改建议、批准受控动作、保存里程碑版本、设为发稿版本都仍由你另行决定」. A running Run is never edited in place: the controls are 暂停, 取消 (after one inline impact summary) and 改计划重做, which redoes the work as a new Task under the changed plan carrying the results so far. 快速开始 starts the Task under the task pattern's Default Execution Rule, names the rule in a quiet notice, and stores the identical frozen plan; a rule is created only by the explicit 设为快速开始默认 action from a viewed plan and is managed in 知识库 › 工序与规则.

### 3 · Navigation, knowledge base and settings

「Q1 知识库的基础划分Ok，范例下的审稿意见/新闻稿这些要同样按照图书项目组织，对应生产图书的结构。另外要另设两种新划分，一种是“资料库”指编辑自行收集的图书，资料，论文等，另一种是在外来来源审查中本地落盘的资料，这两类都需要以agent友好的索引/形态组腌制起来。 Q2 根据Q1的增加重新建议 Q3 要增加作者和责编字段，另外还要增加一个相关人字段让编辑添加其他可能的任务，要注意在“学习”过程中作者、责编本身就是重要的影响因素 Q4 没有问题。这里附加一个与界面有关的业务功能：我们在之后的开发中要把“数据库”策略和软件业务逻辑分别进行版本标识和管理，而且在非必要的情况下不要更改发布时冻结的“数据库”策略，保证大部分升级更新不会破坏已有的工作和存储下的数据。 同时要增加导出和导入数据库的功能。 Q5 保留全部设计，主要是书系知识和内容逻辑的一致性检查」「Q1 ok Q2 ok，向量索引放进v1 Q3 用清单，允许多人 Q4 可以，加自动备份，默认不开启  Q5 叫数据版本 Q6 自动归入，默认仅本社，不用问」

- 待我处理 keeps ATTN-001's four groups; material items map into them (retention failure → 异常与结果待确认, attribution or eligibility pending → 等待你的决定, indexing done → 最近完成).
- A Book carries 作者, 责编 and 相关人; authors and editors may be several people; 相关人 take a role from a house list. Feedback history, Learning Eligibility records and House Editorial Memory attribute by author and editor.
- 书系 keeps SER-001 to 029 in full; the Series' knowledge is the basis of the new review category 书系一致性.
- 知识库 has seven classes: 审阅规范文件, 评估方案, 工序与规则, 社级编辑记忆, 范例 organized by Book and mirroring the deliverable structure, 资料库 (editor-collected books, papers, documents, web captures with an attribution and a Learning Eligibility decision) and 外部来源留存 (the cross-Book index of the sources SRC-013 retains, owned by each Book's 来源与证据). Both new classes carry a five-layer Material Index — original, metadata, extracted text with Source Translation, segment and page anchors, similarity vectors — built locally in V1. An Exemplar enters automatically when the Manuscript's Publication Version is designated, with 仅本社 as the default eligibility and no prompt.
- 设置 groups 服务 / 编辑工作 / 本机 and adds 评估校准与预测. 数据与存储 shows the 数据版本 separately from the software version: the data version is frozen at each release and changed only when necessary, every store and export package records it, and an upgrade that must change it backs up first, states the change and can roll back. 导出数据库 packages every Book, manuscript, history, knowledge-base item and setting without credentials; 导入数据库 previews the package and its data version before 替换 (with an automatic backup) or 合并. 定期自动备份 exists and is off by default.

### 4 · Review category 书系一致性

「保留全部设计，主要是书系知识和内容逻辑的一致性检查」

Manuscript review gains the category 书系一致性, which checks characters, settings and timelines across a Series against its Series Knowledge; it is unavailable when the Book is in no Series, and its findings return to each Book's manuscript as marks.

### 5 · Import, reimport and export

「Q1 ok Q2 ok Q3 ok Q4 ok Q5 最好保留页眉页脚，对于大部分docx文件下的东西，都最好形成保留选项 Q6 同一个稿件第一次导入时进一次工作概览（只是更新版本则不用）」

DOCX content is retained by default: headers and footers, page setup, style sheets, text boxes and images stay with the Source Version and are restored on export, while the manuscript surface edits only body text and marks. A class the editor may choose to fold into the body offers 保留 / 并入; 降级导入 is reserved for content that cannot be retained and still requires the unselected, fixed-wording decision of IMP-005. Imported comments and tracked revisions become 批注 and 修改建议 with the file's author as their source and count as 完整保留. Reimport resolves structure at chapter level with four verbs — 拆分, 改写与新增, 删除, 并入 — never preselected. The first import of a Manuscript enters the Book Work Overview once; a reimport returns to the manuscript. Export offers 含批注 and 含修改建议（作为修订）, both on by default, and never exports 备注.

### 6 · Deliverables: 发稿, 交付 and the Book delivery package

「最后交付物有一点不符合业务设计，保存为里程碑版本主要绑定的是稿件变化，而新闻稿，发布会，营销等等文档是图书项目中产生的生产文档，这些文档本身的版本变动与交付与稿件本身的交付（发稿）是相互独立的，我认为要做这个区分，为了更明确，把针对图书稿件本身的里程碑发布称为发稿，而其他相关文档为交付，同时在管理上要相对区分。 交付包是在发稿和其他工作全部完成后将所有工作文档（含发稿稿件）的总和。这三者要进行区别」「Q1 ok Q2 ok Q3 ok Q4 ok Q5 ok Q6 ok，这一屏定了」

Three things are kept apart. **发稿** belongs to the Manuscript alone: Milestone Versions are Manuscript versions, and 设为发稿版本 designates one of them with a publication scope and the fixed sentence 「仅表示此版本可用于上述发稿范围；AI7 不会发布或发送」. **交付** belongs to Production Documents — the house-configurable types 新闻稿, 宣传文章, 评论文章, 发布会材料, 营销要点 — each with its own versions, workflow and gates; a delivery is a Delivery Record of one exact version to a named recipient plus the exported file, independent of the Manuscript's 发稿; a later edit is a new version marked 交付后有修改 and may be delivered again; a type may be marked 本书不做. The **图书交付包** is the Book-level frozen bundle prepared only after the Publication Version is designated and every Production Document is delivered or marked 本书不做: the 发稿 manuscript, the latest delivered version of every document, and the work records; it is versioned and its export history is separate. The per-deliverable Delivery Package of DPKG-009 is superseded by the Book-level package; DPKG-001 to 014's manifest, freeze, versioning and export-separation rules apply to it. A writing Task drafts a Production Document from the manuscript synopsis, the Evaluation Record's conclusion and marketing points, house Exemplars and Book metadata; its output is an Editorial Artifact draft in the 起草 phase. This supersedes in part kick-in/20's per-deliverable delivery and signoff framing.

### 7 · Backend alignment

「同时将所有后端功能实现都和界面中确认的流程进行对齐」

Section 11 of the specification lists every confirmed flow with the records, projections and commands it requires and the current implementation state. It is the source from which the Commander adds slices to the [development plan](../development/development-plan.md); the plan alone owns the order. This ADR authorizes no code change, dependency, Provider call or release by itself (ADR 0064). Two items — the data version and the database export, import and backup — are storage decisions and need their own ADR before implementation (DSTO-013).

### 8 · Clauses changed

- `docs/ui-ux-v2/requirements.md`: revised V2-UX-AUTH-002, AUTH-003, TASK-017, TASK-019, PLAN-001 (by PLAN-010); added PLAN-010 to 012, AUTH-010 to 011, REV-013, EVAL-014, KB-006 to 010, ATTN-009, BOOK-006, FDBK-013, IMP-055 to 057, EXP-024, WORK-013, MILE-014, DPKG-015, DSTO-016 to 018 and the sections `## Production document delivery` (DELIV-001 to 007) and `## Book delivery package` (BUNDLE-001 to 005).
- `docs/ui-ux-v2/information-architecture.md`: Persistent navigation (library cards), Plan Preview (modes, editing, drawer), Standard Run Authorization (labels, Quick Start), Global Attention View (material items), Knowledge Base (seven classes, index), Settings (评估校准与预测), Data and storage settings (数据版本, export, import, backup), Import and reimport workspaces (retention, first-import rule), Milestone Versions (Manuscript only) and a new section `## Production documents, publication and the Book delivery package`.
- `docs/ui-ux-v2/interaction-spec.md`: Plan Preview (modes and editing rows), Standard Run Authorization (labels), Offline preparation (label), the `快速开始` invariant.
- `docs/ui-ux-v2/journeys.md`: J-03 note (labels, plan editing, redo).
- `docs/ui-ux-v2/CONTEXT.md` and `GLOSSARY.md`: presentation terms Task Drawer, Plan Mode, Editable Plan, Delivery Card, Book Delivery Package Card, Materials Library View, External Retention View, Data Version Row.
- `docs/domain/editorial/CONTEXT.md` and root `GLOSSARY.md`: domain objects Production Document, Delivery Record, Book Delivery Package, Materials Library Item, Material Index, Book People, Writing Task; `docs/domain/execution/CONTEXT.md`: Data Version.
- `docs/ui-ux-v2/README.md` (D-090), `docs/ui-ux-v2/HANDOFF.md`, `docs/agents/README.md` (read-by-task row).

kick-in/10 and kick-in/20 are interview history and are not edited.

## Consequences

- Workers implementing any editor-facing slice read the specification first and cite its screen section and the clause IDs in the Brief; the prototypes are consulted for form, never copied as authority.
- The Decision Layer vocabulary of §10 of the specification replaces the renderer's current labels; the E2E Journeys that pin those labels change with the slices that change them (LAYER-008).
- The backend alignment list becomes development-plan slices at the Commander's discretion; until a slice lands, `PROGRESS.md` remains the only implementation status.
- 发稿 / 交付 / 图书交付包 change the domain model of delivery: Milestone Version and Publication Version narrow to the Manuscript, Production Documents gain Delivery Records, and the Delivery Package becomes Book-level. Existing per-deliverable package clauses are read as Book-level.
- The data version and database export/import/backup need a storage ADR before code; this ADR records the Owner's intent so that no interim schema change is made lightly.

## Rejected alternatives

- A separate handoff file outside the frozen references: rejected by the Owner; a handoff would not bind implementation.
- Keeping per-deliverable Delivery Packages beside a Book-level bundle: rejected; the Owner named three distinct things and per-document delivery is a Delivery Record, not a package.
- Letting AI7 create Default Execution Rules from observed confidence: rejected; a rule comes only from a viewed plan and an explicit action, and only governs 快速开始.
- Editing a running Run's plan in place: rejected; a Run pauses, cancels or is redone under a new plan.
