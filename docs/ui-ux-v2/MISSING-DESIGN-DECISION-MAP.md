# AI7 V2 missing-design decision map

Status: **Issue #8 candidate decision map complete; all 18 owner decisions resolved**

Authority: repository-only omission audit and candidate documentation. `main`, implementation, external publishing/sending, delivery proof, tests, prototypes, and release remain outside scope. The owner-settled local-export/manual exact `发稿版本` boundary is not a decision ticket.

## Dependency map

```text
#1 Book identity + new-Book import
 └─ #2 existing-Book import relationships + interruption
     ├─ #3 authoritative revision + Run lifecycle
     └─ #4 Source/Series governed reuse
         └─ #5 post-milestone delivery + maintenance
```

## #1: Book identity and new-Book manuscript import

Blocked by: none

Type: Discuss

Batch: 1/5 — resolved

### Question

How does `sample1.docx` receive an explicit Book identity when no Book exists, which metadata/defaults are visible, and when does authority begin?

### Answer

Use `图书` for Book. Every target begins unselected; context may only recommend. A no-Book import creates a non-authoritative Book Creation Draft and requires only an editor-confirmed working title. Non-empty DOCX title metadata supplies the primary editable suggestion, filename stem is the fallback, and bounded title-bearing early content may supply separately source-labeled alternatives. Once valid, the draft leads directly to Review Before Import. One exact clean/degraded action atomically creates the Book, dimension set, primary Manuscript/branch/revision, pinned Workflow Instance, provenance/fidelity/degradation records, and Manuscript Import Record; no partial Book or unrelated authority results.

## #2: Existing-Book import relationships and interruption

Blocked by: #1 — satisfied

Type: Discuss

Batch: 2/5 — resolved

### Question

For an exact existing Book, when is a file its first Manuscript, an explicit reimport, or source-only material; how are duplicates/reimport bases handled; and what survives cancellation, stale target, permission loss, or restart?

### Answer

Each Book owns zero or one primary Manuscript. An empty existing Book may receive its first Manuscript or source-only material; a populated Book may reimport its sole primary Manuscript or receive source-only material; a different intended work requires another Book. Target and relationship start separately unselected. Source-only completion creates a target-owned Source Version plus Source Import Record and no Manuscript/Workflow mutation.

Local preflight distinguishes exact immutable source identity, exact parsed content/structure, same-name/different-content collision, and fuzzy similarity without auto-deduplication or authority inference. Reimport uses a verified prior Source Version for three-way comparison and otherwise labels a conservative two-way comparison `来源关系未确认`; changed content creates a descendant revision, while a no-change result creates no empty revision. Complete verified staging persists locally until completion or abandonment, restart requires explicit revalidated continuation, and uncertain atomic outcome fails closed as `导入提交结果待确认`. Standalone Book creation is the explicit derived zero-Manuscript path; an import-bound draft still cannot commit empty. See root [ADR 0029](../adr/0029-keep-one-primary-manuscript-per-book.md), [ADR 0030](../adr/0030-compare-reimports-without-inventing-source-lineage.md), and [ADR 0031](../adr/0031-persist-verified-import-staging-for-explicit-recovery.md).

## #3: Authoritative working-state and Run lifecycle

Blocked by: none — #2 satisfied

Type: Discuss

Batch: 3/5 — resolved

### Question

How does journal-newer working text obtain an exact Run/evidence pin, what happens at budget exhaustion, and does a safely reconciled interrupted Run resume automatically or await `续行`?

### Answer

When acknowledged Edit Journal state is newer than the latest Manuscript Revision, AI7 materializes it through a Manuscript Checkpoint with purpose `Task Input / 任务输入` before Plan Preview or any Run Authorization. Every attached prior-revision pin and pending manuscript target/range/source/evidence reference exact-resolves on the resulting revision into a new task-bound pin without mutating the original; a changed or ambiguous reference requires reselection/removal and blocks planning. Once resolved, the Task Intent, ranges, sources, evidence, Plan Envelope and Run bind the same exact revision; later edits do not retarget them, and checkpoint failure preserves the draft/edits while blocking authorization. See root [ADR 0032](../adr/0032-materialize-task-input-before-exact-run-pinning.md).

Every Plan Envelope binds an exact Run Budget Ceiling state, defaulting to `unset` and displayed as `未设置任务预算上限`. This is no AI7 product-side per-Run stop, not free/unlimited service; Provider account controls remain separate. An optional explicit ceiling is terminal when reached, preserving a partial Task Outcome and requiring Plan Revision plus a newly authorized linked Redo to change it. Provider Account Limit is instead a remediable service blocker. See root [ADR 0033](../adr/0033-default-run-budget-ceiling-to-unset.md).

After safe restart/service reconciliation, the existing authorized Run remains `任务已中断 · 可续行` until explicit `续行` triggers lightweight revalidation and a new Harness Execution Span in the same Run. Material drift routes to Plan Revision/Redo and ambiguous Effects to `结果待确认`; only the already-authorized Start When Online path may auto-dispatch after unchanged Reconnect Preflight. See root [ADR 0034](../adr/0034-require-explicit-resume-after-interruption.md).

## #4: Source Version, Series Knowledge, and persistent exclusions

Blocked by: none — #2 satisfied

Type: Discuss

Batch: 4/5 — resolved

### Question

Which remaining V1 acquisition paths create Book-owned Source Versions, how is Series Knowledge authored/promoted, and how are persistent Series Retrieval Exclusions changed without rewriting frozen Runs or history?

### Answer

Decision 4.1 accepts file-specific `作为来源材料导入` for a supported local file and `保存为来源材料` for exact editor-pasted/entered material or a retention-permitted fully retrieved external research snapshot. Target begins as an unselected exact existing Book or explicit source-bound Book Creation Draft; an existing Book receives a target-owned Source Version and Source Acquisition Record, with Source Import Record as the file specialization. A no-Book path uses the draft and Review Before Book Creation, then atomically creates a zero-Manuscript Book plus first Source Version. Search snippets, incomplete retrievals, model answers, attachments and mere Task use do not auto-retain a Source Version, although their separate Task/evidence records may persist. Canonical Exact Fetch applies only after an already-stable revision/version is admitted by a later exact scope. See root [ADR 0035](../adr/0035-require-explicit-book-targeted-source-acquisition.md).

Decision 4.2 accepts an editor-authored or exact member-Book-provenance Series Knowledge Candidate followed by one `书系知识纳入审阅` over a proposed new or exact existing Series Knowledge Item. A conflict must be edited and re-reviewed, explicitly preserved, or cancelled; preservation records rather than resolves it. Only `纳入书系知识` creates the item with its first immutable revision or appends one Series Knowledge Revision and Promotion Decision; the original Book/source stays source of record, and membership, model output, Proposal acceptance, Milestone Version or Learning Eligibility never auto-promotes. Promotion does not itself create Run Source Scope, authorize or perform retrieval, permit Provider transmission, decide factual or learning status, mutate a manuscript, or authorize publication; the revision becomes eligible only for later exact Series-scoped selection and pinning. See root [ADR 0036](../adr/0036-promote-series-knowledge-through-explicit-review.md).

Decision 4.3 accepts versioned append-only Series Retrieval Exclusions over an exact member Book, Source Version, Series Knowledge Item or stable knowledge class. An item target covers its current and future revisions; a class target also covers later matching items. A committed exclusion immediately blocks every later affected Series read, including not-yet-performed reads in queued/authorized/active Runs; affected work stops for Plan Revision plus renewed Run Authorization or cancellation, with no same-binding Resume/Retry/fallback. Historical Plan/authorization/binding, already-fetched evidence and completed results remain immutable; already-sent Provider data cannot be recalled, and completed affected results receive a historical marker. Superseding/ending never restores old authority or auto-resumes. This restriction is Series-path-specific and does not decide Learning Eligibility or separately authorized Cross-project access. See root [ADR 0037](../adr/0037-enforce-versioned-series-retrieval-exclusions-immediately.md).

## #5: Post-milestone package, export collision, and maintenance

Blocked by: none — #3 and #4 satisfied

Type: Discuss

Batch: 5/5 — resolved

### Question

What is the destination-independent versus export-bound meaning of a Delivery Package, how does local export handle an existing target file, and how are correction/errata/supersession/withdrawal/reissue/archive maintenance responsibilities recorded?

### Answer

Decision 5.1 fixes Delivery Package as a destination-/format-independent versioned content manifest bound unconditionally to one exact Editorial Deliverable Revision, optionally identified by an exact Milestone Version, plus its purpose, artifacts, applicable Gate/Signoff references, exclusions and limitations. Formats, names, paths, fidelity, approval and per-file receipts belong to separate exports; changing or repeating an export never re-versions the package. See root [ADR 0038](../adr/0038-separate-delivery-package-identity-from-local-export.md).

Decision 5.2 delegates an existing local target to the current platform's native alternative-name/cancel/replace workflow without a duplicate AI7 modal. Create/replace resolves an exact final target/disposition before Effect Approval; cancellation creates no Effect; drift invalidates approval; ambiguous outcomes reconcile before retry; apply-to-all is limited to exact enumerated collisions. See root [ADR 0039](../adr/0039-delegate-local-export-collisions-to-native-os-workflows.md).

Decision 5.3 creates stable Maintenance Cases with immutable revisions for Correction, Errata, Supersession, Withdrawal, Reissue and Archive bound to exact Publication Version/Deliverable revision. Correction uses Proposal/Apply/new revision, Errata is an Editorial Artifact, any successor/reissue requires a separately designated Publication Version, and Withdrawal/Archive remains internal AI7 status only. Earlier versions, packages, exports and receipts stay immutable. See root [ADR 0040](../adr/0040-preserve-post-designation-maintenance-as-versioned-cases.md).

V1 still ends at local export plus an independent manual exact-version `发稿版本`; AI7 performs no external send/publication, delivery proof, recall, or takedown.
