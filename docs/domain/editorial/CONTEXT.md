# AI7 Editorial

The domain language for Chinese literary-publishing work across Books, manuscripts, sources, revisions, editorial proposals, and related publication texts.

## Language

**Primary Editorial Role**:
The modeled AI7 operator is an editorial professional exercising literary and publication judgment in a leading literary publishing house in mainland China.
_Avoid_: Generic user, casual writing-app user

**Chinese-first Editorial Work**:
AI7 assumes Chinese for normal operator interaction and for the primary language of a Book and its Editorial Deliverables. Mixed-language material is explicit rather than silently normalized.
_Avoid_: Language-neutral default, English-first workflow

**Unpublished Editorial Material**:
Manuscripts, sources, working material, or derivatives that have not been authorized for public release. They require protection from unauthorized public disclosure but are not inherently classified or high-secrecy data.
_Avoid_: Confidential manuscript, classified data, secret document

**Public Release Permission**:
Explicit authority to make identified Unpublished Editorial Material accessible through an identified public channel. Internal editorial processing and public release are distinct actions.
_Avoid_: Generic approval, confidentiality clearance

**Book**:
The local source, privacy, and mutation authority for one intended published work, at most one primary Manuscript, its sources, Tasks, workflows, and related Editorial Deliverables; Book identity does not imply that the work has a Manuscript yet or has been delivered or published.
_中文_: 图书
_Avoid_: Manuscript, multi-work container, filesystem folder, workspace, generic project, publication status

**Editorial Deliverable**:
A Book-related text prepared or revised through editorial work, including a Manuscript, Promotion Article, News Report, or Review Article.
_Avoid_: Edited manuscript when referring to the whole deliverable family, Generated output

**Editorial Deliverable Revision**:
An immutable exact content version of one Editorial Deliverable with stable identity, provenance, and revision lineage. Manuscript Revision is the authoritative manuscript realization of this term; Promotion Article, News Report, and Review Article revisions use the same exact-version boundary without becoming Manuscript Revisions.
_中文_: 编辑交付成果修订版
_Avoid_: Editorial Deliverable identity, latest working state, Source Version, Delivery Package

**Manuscript**:
The sole primary long-form editable text of its Book, preserved through Manuscript Revisions and distinct from its supporting sources and related publication texts.
_中文_: 稿件
_Avoid_: second peer Manuscript in one Book, Source Version, every Editorial Deliverable

**Promotion Article**:
A Book-related Editorial Deliverable intended to introduce, position, or promote a Book to an identified audience or channel.
_中文_: 宣传文章
_Avoid_: Public Release Permission, generic production copy

**News Report**:
A Book-related factual Editorial Deliverable reporting an event, development, person, or publication context under explicit source, quotation, chronology, and correction requirements.
_中文_: 新闻报道
_Avoid_: Unverified publicity copy, press-release authority

**Review Article**:
An Editorial Deliverable discussing a work for readers or publication under explicit evidence, quotation, disclosure, and signoff requirements.
_中文_: 评论文章
_Avoid_: Editorial Review, Review Decision

**Deliverable Workflow**:
The durable, revision-addressed editorial process governing one Editorial Deliverable independently of the current phase of other deliverables in the same Book.
_中文_: 交付成果工作流程
_Avoid_: Book-wide scalar stage, Harness Workflow

**Workflow Profile**:
A versioned reusable definition of Workflow Phases, Workflow Gates, required Editorial Artifact types, and default responsibilities for one deliverable family.
_中文_: 工作流程方案
_Avoid_: Editorial Profile, Harness Profile, agent workflow

**Workflow Instance**:
One Editorial Deliverable's durable application of an exact Workflow Profile version, including phase history, evidence, gates, and signoff.
_中文_: 工作流程实例
_Avoid_: Harness Session, Harness Workflow, Book lifecycle

**Workflow Phase**:
A named area of editorial work whose status, evidence, responsible actor, and next action are recorded without imposing one universal linear transition sequence.
_中文_: 工作阶段
_Avoid_: Progress percentage, universal publication stage

**Workflow Gate**:
A profile-defined point requiring identified evidence and a named Review Decision or Signoff Record before a specified transition or delivery.
_中文_: 工作关口
_Avoid_: Effect Approval, generic approval

**Editorial Artifact**:
A versioned, typed, provenance-bearing supporting record around an Editorial Deliverable, distinct from source/manuscript text and from a public-facing deliverable.
_中文_: 编辑工作资料
_Avoid_: Editorial Deliverable, arbitrary Run output

**Signoff Record**:
The exact human decision that identified workflow evidence and one exact Editorial Deliverable Revision are ready for a stated next use.
_中文_: 签发记录
_Avoid_: Public Release Permission, factual proof, generic approval

<a id="milestone-version"></a>

**Milestone Version**:
An immutable user-designated exact Editorial Deliverable Revision carrying a label, stated next-use purpose, actor and time, and optional note. It may be created alongside a separate Signoff Record but grants no workflow, export, delivery, factual, learning, or public-release authority.
_中文_: 里程碑版本
_Avoid_: Manuscript Checkpoint, latest draft, Signoff Record, Delivery Package, Publication Version

<a id="delivery-package"></a>

**Delivery Package**:
A versioned destination- and format-independent prepared content manifest for one exact immutable Editorial Deliverable Revision, optionally identified by an exact Milestone Version, and one stated purpose. It binds exact included Editorial Artifacts, applicable Workflow Gate and Signoff references, exclusions, and limitations. Formats, filenames, paths, fidelity dispositions, Local Export Preparations, Effect Approvals, and Effect Receipts belong to separate local exports; the package copies no authority and proves no export, delivery, or publication.
_中文_: 交付包
_Avoid_: Exported file, Local Export Preparation, destination-bound archive, Effect Approval, Effect Receipt, proof of delivery or public release

<a id="publication-version"></a>

**Publication Version**:
An append-only exact designation over one Milestone Version for a stated publication scope, linked to but distinct from a separate Public Release Permission. It performs no export, sending, delivery, or publication, and later edits or designations never retarget its exact content.
_中文_: 发稿版本
_Avoid_: Latest draft, published artifact, local export, Public Release Permission, delivery proof

<a id="maintenance-case"></a>

**Maintenance Case**:
A stable Book-owned identity for one post-designation editorial maintenance matter bound permanently to one exact Publication Version and its exact Editorial Deliverable Revision, with one stable Maintenance Classification. Its target and classification never move to a later revision; related work is linked through immutable Maintenance Case Revisions.
_中文_: 维护事项
_Avoid_: Workflow Phase, free-form note, mutable Publication Version, external recall request, moving target

**Maintenance Classification**:
The stable value identifying what one Maintenance Case is intended to accomplish. The values are not interchangeable status labels.
_中文_: 维护分类
_Avoid_: Workflow Phase, case status, free-form tag

| Stable value | Preferred Simplified Chinese | Exact meaning |
| --- | --- | --- |
| `correction` | 更正 | Propose a content change against the exact target; applying it creates a new Editorial Deliverable Revision and never changes or redesignates the prior version. |
| `errata` | 勘误 | Record a versioned Editorial Artifact that discloses identified errors and their stated corrections without mutating the target; it may link to a separate correction case. |
| `supersession` | 替代 | Record that a separately and manually designated newer Publication Version replaces the target for future AI7 use; no external copy is recalled. |
| `withdrawal` | 撤回 | Make the target ineligible for future AI7 publication use while retaining readable access and exact history. It does not block archival or a separately governed local recovery export and makes no external withdrawal, takedown, recall, or notice claim. |
| `reissue` | 再版 | Create a distinct manually designated Publication Version for a new issue or edition scope. It may designate the same exact Editorial Deliverable Revision or a separately created newer one; only a content-changing reissue uses the applicable proposal and mutation workflow to create that newer revision. |
| `archive` | 归档 | Close the target from ordinary active-maintenance visibility and queues while preserving its existing publication-use eligibility, authority state, readable history, and exact records. It is neither deletion nor proof of external archival. |

<a id="maintenance-case-revision"></a>

**Maintenance Case Revision**:
An immutable revision of one Maintenance Case recording its reason and evidence, linked Correction Proposals or Editorial Artifacts, exact resulting Editorial Deliverable Revisions or Publication Version designations, internal status, and unresolved or completed outcome. It cannot change the case target or Maintenance Classification, mutates no prior revision or Publication Version, creates no local export, and never claims external recall, takedown, delivery, or publication.
_中文_: 维护事项修订版
_Avoid_: Correction Proposal, Errata artifact, Publication Version, in-place maintenance note, reclassification, external outcome proof

**Editorial Review**:
Professional assessment of an Editorial Deliverable or Manuscript, producing findings and Review Decisions rather than a publishable article.
_中文_: 编辑审读
_Avoid_: Review Article, Factual Verification alone

**Multi-aspect Editorial Task**:
An editorial task that judges or produces an Editorial Deliverable across the relevant literary and publication considerations rather than optimizing one isolated text property.
_Avoid_: Generic content task, single-pass text generation

**Editorial Dimension**:
A named consideration that a Multi-aspect Editorial Task can select, prioritize, and make visible in its evidence or result.
_Avoid_: Prompt fragment, mandatory score

**Baseline Editorial Dimension Set**:
The eight built-in Editorial Dimensions available as a starting catalog for professional work; production users may extend the catalog, and tasks need not apply every dimension equally.
_Avoid_: Fixed taxonomy, exhaustive rubric

**User-defined Editorial Dimension**:
An Editorial Dimension introduced by a production user to represent a house-, Book-, or task-relevant concern not adequately covered by the baseline.
_Avoid_: Ad hoc prompt instruction, hidden criterion

**Editorial Profile**:
A reusable, user-owned set of Editorial Dimension defaults and User-defined Editorial Dimensions that can seed a Book without silently controlling it forever.
_Avoid_: Global prompt, mandatory house policy

**Book Editorial Dimension Set**:
The Book-owned selection, display wording, and weighting of Editorial Dimensions used as defaults for its subsequent tasks.
_中文_: 图书编辑维度集
_Avoid_: Live profile view, global dimension catalog

**Task Editorial Dimension Snapshot**:
The immutable Editorial Dimension identities, wording, selection, and weights governing a task when it begins.
_Avoid_: Current Book settings, mutable rubric

**Archived Editorial Dimension**:
A dimension no longer offered for new selection but retained under its stable identity because historical Books or tasks reference it.
_Avoid_: Deleted dimension, active default

**Working Corpus**:
The collection of Books and related editorial work eligible to contribute patterns and feedback to cross-Book learning. Eligibility for learning does not grant a task direct source access to every member.
_Avoid_: Current Book, unrestricted source scope

**House Editorial Memory**:
The user-owned body of reusable editorial patterns, preferences, and feedback derived across the Working Corpus to improve future delivery quality.
_Avoid_: Raw corpus mirror, Harness memory, model weights

**Editorial Learning Signal**:
Recorded evidence that indicates a user's delivery-quality preference, such as explicit guidance, review feedback, or a meaningful edit to an AI7 result.
_Avoid_: Untracked inference, raw manuscript content

**Editorial Learning**:
The governed process that turns eligible Editorial Learning Signals into inspectable candidates for later explicit activation or promotion as Series Knowledge or House Editorial Memory without changing Foundation Model weights.
_Avoid_: Model Training, Agent Behavior Improvement

**Series**:
An explicitly related group of Books intended to share continuity, canon, publication identity, or other durable editorial knowledge.
_Avoid_: Cross-project Workspace, folder, inferred collection

**Series Knowledge**:
The versioned body of information intentionally promoted for shared use by one Series, such as canon, characters, places, chronology, terminology, continuity rules, shared style, or positioning. Neither membership nor another editorial or learning decision creates or activates it automatically.
_Avoid_: Series Knowledge Candidate, House Editorial Memory, unrestricted corpus access, automatic promotion

**Series Knowledge Candidate**:
A non-authoritative editor-authored draft or provenance-bound proposal derived from an exact member-Book Manuscript Revision, Source Version, or reviewed evidence for possible Series-wide use, targeting a proposed new or exact existing Series Knowledge Item identity.
_中文_: 书系知识候选项
_Avoid_: active Series Knowledge, Series Knowledge Item, Series Knowledge Revision, Memory Candidate, model answer, membership consequence

**Series Knowledge Item**:
A stable Series-owned identity for one coherent knowledge subject across its immutable Series Knowledge Revisions. A promotion either creates a new item with its first revision or appends a revision to one exact existing item; an exclusion against the item covers its current and future revisions without becoming a stable knowledge-class exclusion or a restriction on the whole Series Knowledge body.
_中文_: 书系知识项
_Avoid_: Series Knowledge Revision, Series Knowledge Candidate, stable knowledge class, whole Series Knowledge body

**Series Knowledge Revision**:
An immutable Series-owned snapshot of one exact Series Knowledge Item created by one Series Knowledge Promotion Decision, retaining exact content, authorship or source provenance, recorded conflicts, and intended reuse scope for later exact task pinning.
_中文_: 书系知识修订版
_Avoid_: Series Knowledge Item, Series Knowledge Candidate, current editable draft, member-Book source revision

**Series Knowledge Promotion Decision**:
The editor's explicit decision to create a new Series Knowledge Item with its first immutable revision or append one immutable revision to an exact existing item after reviewing the exact Series, item identity, content, authorship or source provenance, conflicts, and intended reuse scope. A disclosed unresolved conflict may be preserved only through an explicit conflict disposition and remains recorded rather than becoming factual resolution. Promotion makes the revision eligible for later exact Series-scoped selection but creates no Run Source Scope, retrieval authorization, performed retrieval, or provider-transmission authority.
_中文_: 书系知识纳入决定
_Avoid_: Review Decision, Learning Eligibility Decision, Proposal Decision, Series membership, automatic activation, factual proof, Run Source Scope, retrieval authorization, provider-transmission authority

**Series Corpus**:
The member Books and exact source revisions eligible for governed Series-scoped retrieval.
_Avoid_: Working Corpus, whole library

**Series-scoped Task**:
An editorial task whose declared authority includes one Series and may retrieve exact, provenance-bearing text across its Series Corpus while keeping every mutation targeted to an identified member Book.
_Avoid_: Cross-project task, ambient library task

**Series Retrieval Exclusion**:
A versioned append-only restriction with an exact member Book, Source Version, Series Knowledge Item or stable knowledge class, scope, effective time, and optional reason that prevents every later Series-scoped read after it takes effect. It leaves membership, already fetched evidence, frozen authorization records, and completed history immutable, but an affected queued or active Run must stop before further use and obtain a Plan Revision plus renewed Run Authorization or cancel; superseding or ending the exclusion never auto-resumes that Run.
_Avoid_: Series removal, hidden filter, history deletion, in-place Run Source Scope rewrite, automatic Resume

**Learning Material**:
An identifiable piece of editorial work or evidence considered for learning, such as guidance, feedback, an edit difference, a reviewed result, or a source passage.
_Avoid_: Whole Working Corpus, untracked content

**Learning Eligibility Decision**:
An explicit include or exclude judgment about whether identified Learning Material may contribute Editorial Learning Signals within a stated scope.
_Avoid_: Memory approval, source-access permission

**Learning Eligibility Policy**:
A user-governed Policy Document that uses prior Learning Eligibility Decisions to recommend or determine the eligibility of similar future material within explicit material-type and scope boundaries.
_Avoid_: Editorial preference, hidden classifier

**Learning Lineage**:
The traceable relationship from Learning Material and its eligibility through signals, candidates, approved memory, and later tasks that used it.
_Avoid_: Generic activity log, model transcript

**Learning Audit Log**:
The user-readable history and current projection of Learning Lineage, eligibility decisions, memory lifecycle changes, and downstream use.
_Avoid_: Operations log, raw prompt log

**Professional Editorial Knowledge**:
Knowledge or material supervised, produced, approved, or meaningfully modified by professional editors and governed for reuse in future editorial work.
_Avoid_: Raw training data, unreviewed model output

**Editor-comparable Delivery Quality**:
Delivery quality close enough to the user's professional standard to materially reduce subsequent editorial correction while preserving human judgment and approval.
_Avoid_: Editor replacement, unreviewed model quality

**Textual Source of Record**:
An identified source revision authoritative for the exact wording, ordering, and location of a text; it establishes what the document says, not whether its assertions are true.
_Avoid_: Truth oracle, verified fact, model reconstruction

**Manuscript Assertion**:
A factual, logical, referential, or semantic claim expressed or implied by manuscript text and therefore subject to editorial verification rather than presumed true.
_Avoid_: Source truth, verified claim

**Factual Verification**:
The evidence-based assessment of a Manuscript Assertion as supported, contradicted, or unresolved against appropriate factual authority.
_Avoid_: Textual matching, Foundation Model belief

**Factual Verification Policy Document**:
A versioned Policy Document defining admissible factual evidence, domain-specific authority and precedence, corroboration and freshness requirements, and conflict outcomes for Manuscript Assertions.
_Avoid_: Truth oracle, source-ranking prompt

**Semantic Review**:
Editorial assessment of meaning for incoherence, ambiguity, contradiction, referential failure, concept misuse, or unintended inconsistency within its relevant context.
_Avoid_: Grammar check, exact quotation verification

**Editorial Error Finding**:
A revision-bound, evidence-linked record of a suspected factual or semantic defect, including its rationale, confidence, and review status.
_Avoid_: Model verdict, applied correction

**Correction Proposal**:
A suggested change bound to one exact Editorial Deliverable Revision that addresses an Editorial Error Finding without altering active deliverable content until accepted through its applicable mutation workflow. For a Manuscript, it remains exact-Manuscript-Revision-bound and model-generated changes still begin on a Proposal Branch.
_Avoid_: Silent rewrite, completed fix

**Source Version**:
An immutable identified Book-owned revision of explicitly retained source material that may seed or support editable manuscript work while remaining evidence rather than editable history. Eligible origins include a supported local file, exact editor-pasted or entered material, and a retention-permitted fully retrieved external research snapshot; selection, a snippet, a failed retrieval, a model answer, attachment, or Task use alone never creates it, although their separately governed Task or evidence records may persist.
_Avoid_: Manuscript Revision, current draft, transient search result, model response, Task attachment

**Source Acquisition Record**:
The durable Book-owned completion record for creating a Source Version—or explicitly selecting an exact existing version already owned by the same target Book—linking the acquisition path, exact origin and provenance, retained-content identity, target Book, resulting version, and named non-effects. It grants no Run Source Scope, factual status, Learning Eligibility, Workflow Instance, or publication authority; a Source Import Record is its local-file source-only specialization rather than a second record for the same acquisition.
_中文_: 来源获取记录
_Avoid_: Source Version, cross-Book Source Version reuse, Source Import Record duplicate, Task evidence snapshot, Evidence Link, Run Source Scope grant

**Existing-Book Import Relationship**:
The editor-selected role of one staged file for an exact existing Book: first Manuscript when none exists, reimport of its sole primary Manuscript, or source-only material. A distinct intended work requires another Book rather than a second peer Manuscript.
_中文_: 既有图书导入关系
_Avoid_: Target Book, inferred intent, second primary Manuscript, file-location choice

**Staged Import Snapshot**:
The complete exact local content and verified parse/preflight state retained for one non-authoritative import draft so it can survive restart without depending on later access to the originally selected file. It is import-draft continuity state under the Agent Data Root, not Book authority, manuscript recovery, or Run continuation state.
_中文_: 导入暂存快照
_Avoid_: Source Version, Manuscript Revision, Recovery Snapshot, Run Continuation Checkpoint, partial parse, committed import

**Source Relationship Unconfirmed**:
The explicit provenance state in which AI7 cannot verify that a staged external document descends from a prior Book-owned Source Version, so comparison remains conservative and makes no common-base or structural-continuity claim beyond exact unambiguous mappings.
_中文_: 来源关系未确认
_Avoid_: Proof that files are unrelated, parse failure, filename mismatch, verified lineage

**Import Commit Outcome Uncertain**:
The durable fail-closed reconciliation state in which AI7 cannot prove whether one atomic import transaction committed; it preserves the relevant staged evidence and blocks retry, cancellation cleanup, and duplicate dispatch until local reconciliation resolves the outcome.
_中文_: 导入提交结果待确认
_Avoid_: Proven import failure, proven import success, automatic retry, ambiguous external Effect

**Manuscript Import Record**:
The durable Book-owned completion record for one initial editable Manuscript import, linking the exact original Source Version, fidelity/degradation decisions, provenance, and resulting Manuscript Revision.
_中文_: 稿件导入记录
_Avoid_: Manuscript Checkpoint, Source Import Record, export receipt, success toast

**Manuscript Reimport Record**:
The durable Book-owned completion record for one reimport comparison, linking lineage status, exact prior/current states, the durable resulting Source Version, mapping resolutions, provenance, and either the descendant Manuscript Revision or an explicit no-change outcome.
_中文_: 稿件重新导入记录
_Avoid_: Manuscript Import Record, live synchronization, overwrite log, empty revision

**Source Import Record**:
The local-file source-only specialization of Source Acquisition Record, linking exact original identity, provenance, resulting Source Version, and the explicit absence of Manuscript or Workflow mutation.
_中文_: 来源导入记录
_Avoid_: Manuscript Import Record, non-file Source Acquisition Record, factual-verification result, Run Source Scope grant, manuscript creation

**Manuscript Block**:
A stable structural text identity, such as a title, heading, paragraph, quotation, or list item, whose lineage continues across edits and moves and is explicit across splits or merges.
_Avoid_: Source Index Chunk, line number, text hash

**Manuscript Revision**:
An immutable, reconstructable checkpoint of one complete ordered editable manuscript state with its origin and parent revision or revisions.
_Avoid_: Source Version, autosave, Run Continuation Checkpoint

**Manuscript Branch**:
A named line of editable Manuscript Revisions and working state for one complete manuscript; it does not duplicate or branch Book lifecycle authority.
_Avoid_: Harness Session, project copy

**Edit Journal**:
The durable ordered record of continuous changes to one Manuscript Branch since its base revision, used to reconstruct working state without making every saved edit a Manuscript Revision.
_Avoid_: Manuscript history, Operation journal

**Manuscript Checkpoint**:
The validated transition that commits complete journal-reconstructed working state as a new Manuscript Revision. A checkpoint used to materialize journal-newer task input carries the exact purpose value `Task Input / 任务输入`; the purpose does not create another checkpoint type, Milestone Version, or Signoff.
_Avoid_: Edit Journal entry, Run Continuation Checkpoint, Recovery Snapshot

**Task Input (Manuscript Checkpoint purpose)**:
The exact Manuscript Checkpoint purpose value used whenever a Task would use journal-newer acknowledged manuscript state as target, range, source, or evidence and that state must become one immutable reconstructable revision before Plan Preview or Run Authorization. All attached manuscript target, range, source, and evidence references exact-resolve on that revision and create new task-bound pins while their original pins and provenance remain immutable; an unresolved changed or ambiguous reference blocks planning and authorization rather than being silently rebound.
_中文_: 任务输入
_Avoid_: Task Input Revision Preparation, Context-bound Task Composer, Task Intent, Task Input Checkpoint type, Milestone Version

**Proposal Branch**:
An isolated Manuscript Branch beginning at an exact base revision and containing one lineage of proposed generated text changes until an editor rejects, revises, promotes, or integrates it.
_Avoid_: Correction Proposal, active manuscript overwrite

**Manuscript Conflict**:
An explicit competing textual or structural choice that cannot be resolved automatically without risking editorial intent or provenance.
_Avoid_: Last-write-wins difference, model-selected wording

**Recovery Snapshot**:
Independently stored, verified pre-operation manuscript state sufficient to reconstruct the protected graph state if a high-risk operation or live store fails.
_Avoid_: Manuscript Checkpoint, backup claim without reconstruction proof

**Manuscript Pin**:
The exact Book, Manuscript Branch, Manuscript Revision, and digest identity to which a dependent finding, Run, approval, proposal, merge, or lifecycle record is bound.
_Avoid_: Current manuscript, latest revision

**Proposal Decision**:
The editor's exact content decision to accept, modify, selectively use, retain as an alternative, redo, or reject one generated proposal without implying that integration completed.
_中文_: 提案处理决定
_Avoid_: Approval, Effect Approval, publication receipt

**Review Decision**:
A professional editorial judgment at a review gate, such as accept, accept with conditions, revise, defer, or reject.
_中文_: 编辑评审决定
_Avoid_: Effect Approval, factual proof

**Quality Signal**:
A captured, attributable feedback event from explicit editor feedback, editor-authored content, or a proposal decision/version difference. Captured globally on the local instance by default and attributed for per-Book, per-editor, or per-house aggregation.
_中文_: 质量信号
_Avoid_: Learning Material, Memory Candidate, a rating alone, task authority

**Delivery Quality Metric**:
A versioned measure derived from Quality Signals over a defined window and scope, covering verbatim acceptance, revision distance, survival to delivery, dissatisfaction by Editorial Dimension, and phase-weighted workload displacement. Aggregating it globally never grants global retrieval access.
_中文_: 交付质量度量
_Avoid_: Editor-comparable Delivery Quality as a goal statement, factual correctness, acceptance rate alone

**Manuscript Retrieval Chunk**:
A ranked, approximate retrieval unit over manuscript text used to assemble model context beyond the editing window. It may span or subdivide Manuscript Blocks, returns candidates rather than authoritative text, and is stamped with the Manuscript Revision it was built from so a stale hit is detectable. Authoritative text comes only from Exact Fetch against the current pin.
_中文_: 稿件检索片段
_Avoid_: Manuscript Block, Source Index Chunk, a quotation source, a truth path

**Exact Fetch**:
The deterministic resolution of an already-authorized stable reference against one exact pinned Manuscript Revision or Source Version, returning authoritative text for that record plus exact identity, range or offsets when applicable, and digest. It is never the name for initial external-research retrieval and grants no factual truth, Run Source Scope, provider transmission, mutation, learning, or publication authority.
_中文_: 精确获取
_Avoid_: source search, initial web/research retrieval, fuzzy match, factual verification, retrieval or egress permission
