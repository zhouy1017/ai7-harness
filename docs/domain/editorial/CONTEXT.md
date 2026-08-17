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

**Editorial Deliverable**:
A Book-related text prepared or revised through editorial work, including a Manuscript, Promotion Article, News Report, or Review Article.
_Avoid_: Edited manuscript when referring to the whole deliverable family, Generated output

**Manuscript**:
The primary long-form editable text of a Book, preserved through Manuscript Revisions and distinct from its supporting sources and related publication texts.
_中文_: 稿件
_Avoid_: Source Version, every Editorial Deliverable

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
The exact human decision that identified workflow evidence and an exact deliverable revision are ready for a stated next use.
_中文_: 签发记录
_Avoid_: Public Release Permission, factual proof, generic approval

**Delivery Package**:
The exact deliverable revision together with required Editorial Artifacts, Signoff Records, destination, and release/export authority prepared for one handoff or publication action.
_中文_: 交付包
_Avoid_: Generated archive, proof of public release

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
The governed process that turns eligible Editorial Learning Signals into inspectable candidates, Series Knowledge, or House Editorial Memory for later editorial work without changing Foundation Model weights.
_Avoid_: Model Training, Agent Behavior Improvement

**Series**:
An explicitly related group of Books intended to share continuity, canon, publication identity, or other durable editorial knowledge.
_Avoid_: Cross-project Workspace, folder, inferred collection

**Series Knowledge**:
Versioned information intentionally shared by a Series, such as canon, characters, places, chronology, terminology, continuity rules, shared style, or positioning.
_Avoid_: House Editorial Memory, unrestricted corpus access

**Series Corpus**:
The member Books and exact source revisions eligible for governed Series-scoped retrieval.
_Avoid_: Working Corpus, whole library

**Series-scoped Task**:
An editorial task whose declared authority includes one Series and may retrieve exact, provenance-bearing text across its Series Corpus while keeping every mutation targeted to an identified member Book.
_Avoid_: Cross-project task, ambient library task

**Series Retrieval Exclusion**:
An explicit restriction that prevents a member Book or source from future Series-scoped retrieval without dissolving the Series or rewriting historical task evidence.
_Avoid_: Series removal, hidden filter

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
A suggested change bound to an exact target and revision that addresses an Editorial Error Finding without altering the active manuscript until accepted through its mutation workflow.
_Avoid_: Silent rewrite, completed fix

**Source Version**:
An immutable identified revision of imported source material that may seed or support editable manuscript work while remaining evidence rather than editable history.
_Avoid_: Manuscript Revision, current draft

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
The validated transition that commits complete journal-reconstructed working state as a new Manuscript Revision.
_Avoid_: Edit Journal entry, Run Continuation Checkpoint, Recovery Snapshot

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
