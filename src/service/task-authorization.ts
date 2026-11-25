import { appendOnly } from './append-only.js';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { J03_TASK_GOAL, isTrustedOperationalScope, selectedPolicyIdentityOf, type SelectedPolicyIdentity, type DeveloperLiveProviderProcessingVersion, type OrdinaryProductionProviderProcessingVersion, type ForegroundExecutionBoundaryProjection, type LaunchPolicyProjection, type ProviderProcessingPin, type TaskAuthorizationProjection, type TrustedOperationalScope } from '../shared/protocol.js';
import { TASK_INPUT_CHECKPOINT_PURPOSE } from './analysis/identity.js';
import { isRecord } from './analysis/canonical.js';
import { providerPlanPolicyMetadata } from './analysis/plan-boundary.js';
import { foreignKeyViolations } from './store-records.js';
import {
  ACTIVE_SET_VERSION,
  DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION,
  ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION,
} from './launch-policy.js';
import { ANALYSIS_RESULT_SET_SCHEMA_SQL } from './analysis/result-set-schema.js';

/** The J-03 revision (Issue #47): the ten immutable record-only task-authorization relations. */
export const J03_TASK_AUTHORIZATION_SCHEMA_VERSION = 14;
/** The additive baseline-analysis revision (Issue #92): analysis task kind, attempts, bindings, outcomes, result sets. */
export const J04_BASELINE_ANALYSIS_SCHEMA_VERSION = 15;
/** The successive-task revision (Issue #93): more than one baseline-analysis Task per Book, update mode, predecessor, range, reuse plan. */
export const SUCCESSIVE_TASK_SCHEMA_VERSION = 16;
/** The plan-version revision (Issue #48): plan components keyed by plan version, Plan Revisions with their diff, Plan Adaptations. */
export const TASK_AUTHORIZATION_SCHEMA_VERSION = 17;
/**
 * The multi-format intake revision (Issue #350): a Source Version may be an original the product
 * retained without parsing, so `source_versions` and `source_provenance` widen and `import_drafts`
 * records the identified format. Those are `store.ts`'s relations and it rebuilds them; the terminal
 * version is declared here, where every module reads it.
 */
export const MANUSCRIPT_INTAKE_SCHEMA_VERSION = 18;
/**
 * The text-conversion revision (Issue #356): a Source Version, its draft, and an abandonment
 * cleanup intent may name the DOCX working representation an original was read through and the
 * converter that produced it. Those are `store.ts`'s relations and it adds the columns; the
 * terminal version is declared here, where every module reads it.
 */
export const TEXT_CONVERSION_SCHEMA_VERSION = 19;
/**
 * The second-analysis-kind revision (Issue #53): a Book may hold a `factual-review` Task and Result
 * Set beside its baseline ones, so the kind-coupled CHECKs of `analysis_task_intents`,
 * `analysis_result_sets`, and `analysis_result_set_revisions` widen to admit both kinds, each bound
 * to its own contract version and its own mode set. Nothing else moves: the three relations are
 * rebuilt with every row copied byte for byte, and every other relation, trigger, and row is
 * untouched.
 */
export const FACTUAL_REVIEW_SCHEMA_VERSION = 20;
/**
 * The manuscript-entry-position revision (Issue #467): one additive relation records, per Book and
 * per Manuscript Revision, the block and grapheme offset an editor last entered the Manuscript at.
 * `bounded-manuscript.ts` owns that relation and creates it; nothing existing moves — no relation is
 * rebuilt, renamed, or dropped, and no row of any revision changes. The terminal version is declared
 * here, where every module reads it (ADR 0079: an additive revision keeps the same Data Version).
 */
export const MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION = 21;
/**
 * The editorial-mark revision (Issue #407): five additive relations hold the Editorial Marks on a
 * Manuscript and the Proposal Change Item, Proposal Decision, decision-reason and reply ledgers
 * behind them. `editorial-marks.ts` owns those relations and creates them; nothing existing moves —
 * no relation is rebuilt, renamed, or dropped, and no row of any revision changes (ADR 0079: an
 * additive revision keeps the same Data Version). This is the terminal version.
 */
export const EDITORIAL_MARK_SCHEMA_VERSION = 22;
/**
 * The manuscript-effect revision (Issue #408): five additive, append-only relations hold the Effect
 * Intent with its exact targets, the Effect Approval, the dispatch and the Effect Receipt of every AI7
 * Apply and Reverse Apply, and `editorial_marks` widens three CHECKs so that a 修改建议 whose Apply
 * deleted its words can stand exactly on the empty range they left. `manuscript-apply.ts` creates the
 * relations and, in the same transaction, rebuilds a revision-22 `editorial_marks` with every row
 * copied byte for byte; no existing row changes and each stays valid, so the revision is additive
 * (ADR 0079: an additive revision keeps the same Data Version).
 */
export const MANUSCRIPT_EFFECT_SCHEMA_VERSION = 23;
/**
 * The editorial-review revision (Issue #417, plan slice S69): a Book may hold one Result Set per
 * Review Category beside its baseline and factual ones, so the kind-coupled CHECKs of
 * `analysis_task_intents`, `analysis_result_sets`, and `analysis_result_set_revisions` widen a second
 * time, exactly as revision 20 widened them. The two existing kinds keep their literal arms. The
 * family is admitted by the shape of its kind identity — `editorial-review/<categoryId>` — and never
 * by a list of categories, because a Review Category is configuration a house may add to
 * (V2-UX-REV-002): it is bound to the one contract version `ai7.editorial-review/1` and to its own
 * five modes, its initial modes name no predecessor, its range-bound modes carry a selected range, and
 * its goal — a text derived from the category's label, which no CHECK can spell — is bounded here and
 * checked in the ledger. The three relations are rebuilt with every row copied byte for byte, and
 * every other relation, trigger, and row is untouched.
 *
 * The same revision also adds the seven Review Run relations, which `src/service/review/review-runs.ts`
 * owns and creates before this version is stamped; nothing of this module moves for them.
 */
export const EDITORIAL_REVIEW_SCHEMA_VERSION = 24;
/**
 * The publication-version revision (Issue #414, plan slice S65): three additive, append-only relations
 * hold the Publication Version (发稿版本) designated over one exact Milestone Version of a Book's primary
 * Manuscript, the separately identified internal Public Release Permission recorded with it, and the
 * events a designation leaves for later slices. `publication-versions.ts` owns them and creates them
 * before this version is stamped; nothing existing moves — no relation is rebuilt, renamed, or dropped,
 * and no row of any revision changes (ADR 0079: an additive revision keeps the same Data Version).
 */
export const PUBLICATION_VERSION_SCHEMA_VERSION = 25;
/**
 * The proposal-conflict revision (Issue #57, plan slice S22; ADR 0085): three additive, append-only
 * relations hold what resolving a 修改建议's Three-way Proposal Conflict records — the Resolution Drafts
 * saved while the editor works, each 暂不处理, and the one outcome (保留当前稿件 or 保存为新提案版本) that
 * resolves it. `proposal-conflicts.ts` owns them and creates them before this version is stamped; nothing
 * existing moves (ADR 0079: an additive revision keeps the same Data Version).
 */
export const PROPOSAL_CONFLICT_SCHEMA_VERSION = 26;
/**
 * The import-retention revision (Issue #410, plan slice S61; ADR 0086): `import_fidelity_categories`
 * widens to the ten classes and the `retained` status — rebuilt with every row copied byte for byte —
 * and four additive relations record the text-box choice of a review, the source paragraph of every
 * staged block and text-box paragraph, and, at commit, which source paragraph each Manuscript block came
 * from. `import-retention.ts` owns them and creates them before this version is stamped; no existing row
 * changes and each stays valid (ADR 0079: an additive revision keeps the same Data Version).
 */
export const IMPORT_RETENTION_SCHEMA_VERSION = 27;
/**
 * The imported-marks revision (Issue #411, plan slice S62): `proposal_change_items` widens to the `insert`
 * kind — rebuilt with every row copied byte for byte — and one additive relation stages the marks a DOCX's
 * comments and tracked changes become, which the import commit creates. `imported-marks.ts` owns them and
 * creates them before this version is stamped; no existing row changes and each stays valid (ADR 0079: an
 * additive revision keeps the same Data Version).
 */
export const IMPORTED_MARK_SCHEMA_VERSION = 28;
/**
 * The export-ledger revision (Issue #413, plan slice S64): three additive, append-only relations record every
 * Local Export Preparation, its Effect Approval and what the approved write came to (External Export Policy
 * v2). `manuscript-export.ts` owns them and creates them before this version is stamped; no existing row
 * changes (ADR 0079: an additive revision keeps the same Data Version).
 */
export const EXPORT_LEDGER_SCHEMA_VERSION = 29;
/**
 * The connectivity-wait revision (Issue #502, plan slice S74b; V2-UX-AUTH-004, OFF-005, OFF-010):
 * `analysis_run_states` widens to two Run states — `awaiting-connectivity`, a Run authorized by
 * `联网后开始任务` that waits in Connectivity Wait until Reconnect Preflight admits it, and `cancelled`, a
 * waiting Run the editor cancelled before it ever dispatched. The relation is rebuilt with every row
 * copied byte for byte, once, while it still holds revision 29's exact text; nothing else moves and no
 * row changes (ADR 0079: an additive revision keeps the same Data Version).
 */
export const CONNECTIVITY_WAIT_SCHEMA_VERSION = 30;
/**
 * The default-execution-rule revision (Issue #421, plan slice S75; V2-UX-TASK-017, TASK-019, TASK-020,
 * TASK-028, AUTH-009): `analysis_run_authorizations.origin` widens to `default-execution-rule`, the origin of a
 * Run started by 快速开始 under the Book's 默认执行规则, rebuilt once with every row copied byte for byte; and
 * three additive, append-only relations record the rules, their versions and whether each is in force.
 * `default-execution-rules.ts` owns those and creates them before this version is stamped. A rule is never a
 * standing authorization: each Run it starts still has its own Task Intent, plan, envelope and authorization,
 * which names the rule version (UI ADR 0001). No existing row changes (ADR 0079: an additive revision keeps the
 * same Data Version).
 */
export const DEFAULT_EXECUTION_RULE_SCHEMA_VERSION = 31;
/**
 * The run-cancellation revision (Issue #422, plan slice S76a; V2-UX-CTRL-004, CTRL-006, CTRL-008):
 * `analysis_run_states` widens to `cancelling` — 正在取消, a started Run the editor cancelled, which stops at the
 * next unit boundary — and `analysis_task_outcomes.classification` to `cancelled`, the outcome of that Run once it
 * has stopped, its completed units kept in a partial Result Set Revision. Both relations are rebuilt once, each
 * while it still holds its frozen prior text, with every row copied byte for byte; nothing else moves and no row
 * changes (ADR 0079: an additive revision keeps the same Data Version).
 */
export const RUN_CANCELLATION_SCHEMA_VERSION = 32;
/**
 * The run-continuation revision (Issue #422, plan slice S76b; V2-UX-CTRL-001, CTRL-002, CONT-014, CONT-015):
 * `analysis_run_states` widens to `pausing` (正在暂停), `paused` (已暂停) and `resumable` (任务已中断 · 可续行), rebuilt
 * once from whichever earlier text it holds with every row copied byte for byte; and one additive, append-only
 * relation, `analysis_unit_checkpoints`, keeps each unit's result as it settles, so a Run that pauses or stops keeps
 * what it read and 续行 goes on from there. `run-checkpoints.ts` owns it and creates it before this version is
 * stamped. No existing row changes (ADR 0079: an additive revision keeps the same Data Version).
 */
export const RUN_CONTINUATION_SCHEMA_VERSION = 33;
/**
 * The plan-edit revision (Issue #419, plan slice S73; V2-UX-PLAN-011): `analysis_plan_revisions.trigger_kind` widens
 * to `plan-edit`, the Plan Revision the editor's own 更新计划 records beside the next plan version, rebuilt once
 * from revision 17's text with every row copied byte for byte. No relation is added and no row changes (ADR 0079: an
 * additive revision keeps the same Data Version).
 */
export const PLAN_EDIT_SCHEMA_VERSION = 34;
/**
 * The clarification revision (Issue #422, plan slice S76d; V2-UX-CLAR-001 to CLAR-007): `analysis_run_states` widens
 * to `awaiting-clarification` (任务等待你的说明) — a Run that read every unit it could and waits, holding nothing, for
 * the editor's answer to what it asked — rebuilt once from whichever earlier text it holds with every row copied byte
 * for byte; and two additive, append-only relations, `analysis_clarification_requests` and
 * `analysis_clarification_answers`, keep what the Run asked and what the editor answered. `clarifications.ts` owns
 * those and creates them before this version is stamped. No existing row changes (ADR 0079: an additive revision keeps
 * the same Data Version).
 */
export const CLARIFICATION_SCHEMA_VERSION = 35;
/**
 * The chapter-level reimport revision (Issue #412, plan slice S63; V2-UX-IMP-041 to IMP-043, IMP-057): five additive
 * relations, owned by `reimport-group-ledger.ts` and created before this version is stamped — a Reimport Comparison's
 * change groups and their members, the verb the editor chose for each, and what each mark of a changed group came to.
 * No existing row changes (ADR 0079: an additive revision keeps the same Data Version).
 */
export const REIMPORT_GROUP_SCHEMA_VERSION = 36;
/**
 * The Production Document revision (Issue #415, plan slice S66; V2-UX-DELIV-001, DELIV-002, WORK-013): `manuscripts`
 * rebuilt so that a Book's Production Documents are rows beside its one primary Manuscript, every existing row copied
 * byte for byte, and two additive ledgers, owned by `production-document-ledger.ts` and created before this version is
 * stamped — which house type each document is and what it was made from, and each 本书不做 / 恢复. No task or analysis
 * relation changes.
 */
export const PRODUCTION_DOCUMENT_SCHEMA_VERSION = 37;
/**
 * The Delivery Record revision (Issue #415, S66b; V2-UX-DELIV-003, DELIV-004): one additive, append-only relation owned by
 * `production-document-ledger.ts` and created before this version is stamped — which exact version of a document went
 * to whom, and when. No existing row changes.
 */
export const PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION = 38;
/**
 * The 图书交付包 revision (Issue #416, S67a; V2-UX-BUNDLE-001 to 005, DPKG-007, DPKG-008): one additive, append-only
 * relation owned by `book-delivery-packages.ts` and created before this version is stamped — each frozen version of a
 * Book's package, its content, purpose and lineage. No existing row changes.
 */
export const BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION = 39;
/**
 * The Deliverable Workflow revision (Issue #415, S66c; V2-UX-WORK-001 to 009): two additive, append-only relations owned by
 * `production-document-workflow.ts` and created before this version is stamped — the workflow profile each Production
 * Document follows, one per document and backfilled for the documents a revision-39 store holds, and every move of its
 * phases. No existing row changes.
 */
export const PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION = 40;
/**
 * The package export revision (Issue #416, S67b; BUNDLE-004, DPKG-014): two additive, append-only relations owned by
 * `book-delivery-package-exports.ts` and created before this version is stamped — each export of a frozen 图书交付包
 * version, and the export ledger's preparation of each file it wrote, in order. No existing row changes.
 */
export const BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION = 41;
/**
 * The origin reading revision (Issue #547, a #415 follow-up): one additive, append-only relation owned by
 * `production-document-origins.ts` and created before this version is stamped — how each Production Document's origin
 * material was read, and how many of its 批注与修订 the document did not carry. A document made before it has no row, and
 * nothing is backfilled. No existing row changes.
 */
export const PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION = 42;
/**
 * The 维护事项 revision (Issue #426, S68a; V2-UX-MAINT-001 to 011, ADR 0040): three additive, append-only relations owned
 * by `maintenance-cases.ts` and created before this version is stamped — each Maintenance Case bound to one exact 发稿版本,
 * each 勘误 version, and every revision of a case, chained. No existing row changes.
 */
export const MAINTENANCE_CASE_SCHEMA_VERSION = 43;
/**
 * The Book People revision (Issue #431, S83; V2-UX-BOOK-006): one additive, append-only relation owned by `book-people.ts`
 * and created before this version is stamped — each version of a Book's 作者, 责编 and 相关人, chained and pinned to the
 * house's role list. No existing row changes.
 */
export const BOOK_PEOPLE_SCHEMA_VERSION = 44;
/**
 * The Review Guideline revision (Issue #427, S79a; V2-UX-KB-003, REV-012): one additive, append-only relation owned by
 * `review-guidelines.ts` and created before this version is stamped — each version a house imported of a guideline document
 * the review categories apply, chained to the version before it. No existing row changes.
 */
export const REVIEW_GUIDELINE_SCHEMA_VERSION = 45;
/**
 * The Library Material revision (Issue #427, S79c; V2-UX-KB-007, LEARN-007): two additive, append-only relations owned by
 * `library-materials.ts` and created before this version is stamped — each item an editor put into 资料库, and the chain of
 * its attribution and Learning Eligibility decisions. No existing row changes.
 */
export const LIBRARY_MATERIAL_SCHEMA_VERSION = 46;
/**
 * The Evaluation Record revision (Issue #429, S81a; V2-UX-EVAL-001, EVAL-012): two additive, append-only relations owned by
 * `evaluation-records.ts` and created before this version is stamped — each version of a Book's Evaluation Record, and the
 * chain of the editor's saves ending in 定稿. No existing row changes.
 */
export const EVALUATION_RECORD_SCHEMA_VERSION = 47;
/**
 * The Analysis Feedback revision (Issue #94, S38; V2-UX-ANALYSIS-023): one additive, append-only relation owned by
 * `analysis-feedback.ts` and created before this version is stamped — each explicit judgment an editor records of an item
 * of a Result Set Revision, chained per item. No existing row changes.
 */
export const ANALYSIS_FEEDBACK_SCHEMA_VERSION = 48;
/**
 * The Decision Feedback revision (Issue #61, S26a; V2-UX-FDBK-001 to FDBK-007): one additive, append-only relation owned by
 * `decision-feedback.ts` and created before this version is stamped — the editor's 不说明 and each later change of the
 * reason for one Proposal Decision, chained per decision. No existing row changes.
 */
export const DECISION_FEEDBACK_SCHEMA_VERSION = 49;
/**
 * The Learning Eligibility revision (Issue #61, S26b; V2-UX-LEARN-004 to LEARN-007): one additive, append-only relation
 * owned by `learning-eligibility.ts` and created before this version is stamped — each explicit decision on whether one
 * Learning Material of a Book may teach, and in which scope, chained per material. No existing row changes.
 */
export const LEARNING_ELIGIBILITY_SCHEMA_VERSION = 50;
/**
 * The Evaluation Calibration revision (Issue #430, S82; V2-UX-EVAL-010, EVAL-011, EVAL-014): two additive, append-only
 * relations owned by `evaluation-calibration.ts` and created before this version is stamped — each Book's 定价与首印 entries
 * and the house's evaluation preferences. No existing row changes.
 */
export const EVALUATION_CALIBRATION_SCHEMA_VERSION = 51;
/**
 * The Series revision (Issue #63, S28a; V2-UX-SER-001 to SER-012): two additive, append-only relations owned by `series.ts`
 * and created before this version is stamped — the house's Series and each Series and Book's membership changes. No
 * existing row changes.
 */
export const SERIES_SCHEMA_VERSION = 52;
/**
 * The Series Knowledge revision (Issue #63, S28b; V2-UX-SER-013 to SER-019): four additive, append-only relations owned by
 * `series-knowledge.ts` and created before this version is stamped — each candidate's versions, the items, their immutable
 * revisions and the promotion decisions. No existing row changes.
 */
export const SERIES_KNOWLEDGE_SCHEMA_VERSION = 53;
/**
 * The store-version revision (Issue #433, S85a; V2-UX-DSTO-016; ADR 0079 §1): one additive, append-only relation owned by
 * `data-version.ts` and created before this version is stamped — the software, Data Version and schema revision that opened
 * the store, each time one of them changes. No existing row changes.
 */
export const STORE_VERSION_SCHEMA_VERSION = 54;
/**
 * The database-export revision (Issue #434, S86a; V2-UX-DSTO-017; ADR 0079 §1.7): three additive, append-only relations owned
 * by `database-exports.ts` and created before this version is stamped — each 导出数据库's preparation, approval and receipt.
 * No existing row changes.
 */
export const DATABASE_EXPORT_SCHEMA_VERSION = 55;
/**
 * The scheduled-backup revision (Issue #434, S86b; V2-UX-DSTO-018; ADR 0079 §1.4): three additive, append-only relations owned
 * by `scheduled-backups.ts` and created before this version is stamped — the 定期自动备份 switch's changes, each backup made
 * and each backup removed. No existing row changes.
 */
export const SCHEDULED_BACKUP_SCHEMA_VERSION = 56;
/**
 * The database-replacement revision (Issue #434, S86c; V2-UX-DSTO-017; ADR 0079 §1.3, §1.4): one additive, append-only relation
 * owned by `database-replacement.ts` and created before this version is stamped — each replacement of the local data by a
 * database package, recorded applied in the data it brought in or failed in the data it spared. No existing row changes.
 */
export const DATABASE_REPLACEMENT_SCHEMA_VERSION = 57;
/**
 * The database-merge revision (Issue #434, S86d; V2-UX-DSTO-017; ADR 0079 §1.5): one additive, append-only relation owned by
 * `database-merge.ts` and created before this version is stamped — each merge of a database package's Books into the local
 * data, recorded applied or failed in the data that opened after it. No existing row changes.
 */
export const DATABASE_MERGE_SCHEMA_VERSION = 58;
/**
 * The AI7 初评 revision (Issue #429, S81b1; V2-UX-EVAL-001, EVAL-005, EVAL-006): the three kind-coupled analysis relations admit
 * the evaluation kind — rebuilt exactly as revisions 20 and 24 rebuilt them, every row copied byte for byte — and one additive,
 * append-only relation owned by `evaluation-records.ts` and created before this version is stamped records the AI7 初评 each
 * Evaluation Record version began from. No existing row changes.
 */
export const INITIAL_EVALUATION_SCHEMA_VERSION = 59;
/**
 * The dialogue revision (Issue #52, S17a; UI ADR 0014; V2-UX-DIALOG-001 to 016): six additive, append-only relations owned by
 * `dialogue/dialogue-ledger.ts` and created before this version is stamped — each dialogue Task, its attempts, and each
 * attempt's Execution Binding, Harness Execution Span, outcome and conversions. No existing row changes. It follows revision 59
 * (Issue #429, S81b1) and moves nothing of its ledger.
 */
export const DIALOGUE_SCHEMA_VERSION = 60;
/**
 * The Series Retrieval Exclusion revision (Issue #64, S29b; V2-UX-SER-020 to SER-029; ADR 0037): one additive, append-only
 * relation owned by `series-exclusions.ts` and created before this version is stamped — each revision of an exclusion of
 * material from one Series' retrieval. No existing row changes. It follows revision 60 (Issue #52, S17a) and moves nothing
 * of its relations.
 */
export const SERIES_RETRIEVAL_EXCLUSION_SCHEMA_VERSION = 61;
/**
 * The 审稿意见 revision (Issue #429, S81c; V2-UX-EVAL-013): the three kind-coupled analysis relations admit the reader's report
 * kind — rebuilt exactly as revisions 20, 24 and 59 rebuilt them, every row copied byte for byte — and two additive,
 * append-only relations owned by `readers-reports.ts` and created before this version is stamped record which finalized
 * record and template each 审稿意见 Task drafts from, and which draft document each drafted result became. It follows revision 61
 * (Issue #64, S29b). No existing row changes.
 */
export const READERS_REPORT_SCHEMA_VERSION = 62;
/**
 * The 可复用工序 revision (Issue #65, S30; ADR 0087; V2-UX-REUSE-001 to 020, 063 to 066): six additive, append-only relations
 * owned by `captured-procedures.ts` and created before this version is stamped — each Captured Procedure, its versions with their
 * local provenance, their state events, each Review Run's procedure pin, and each Developer Capability Proposal version with the
 * files it was written to. No existing row changes. It follows revision 62 (Issue #429, S81c) and moves nothing of its
 * relations.
 */
export const CAPTURED_PROCEDURE_SCHEMA_VERSION = 63;
/**
 * The 按我的评分重写评语 revision (Issue #429, S81b2; V2-UX-EVAL-008): the three kind-coupled analysis relations admit the
 * evaluation rewrite kind — rebuilt exactly as revisions 20, 24, 59 and 62 rebuilt them, every row copied byte for byte — and
 * two additive, append-only relations owned by `evaluation-rewrites.ts` and created before this version is stamped record which
 * version and saved entry each rewrite Task rewrites, and the editor's one decision on each rewritten result. It follows
 * revision 63 (Issue #65, S30). No existing row changes.
 */
export const EVALUATION_REWRITE_SCHEMA_VERSION = 64;
/**
 * The 写作任务 revision (Issue #432, S84a; V2-UX-DELIV-007, KB-004): the three kind-coupled analysis relations admit the writing
 * kind — rebuilt exactly as revisions 20, 24, 59, 62 and 64 rebuilt them, every row copied byte for byte — and two additive,
 * append-only relations owned by `writing-tasks.ts` and created before this version is stamped record which house type, words
 * of the editor and reference set each writing Task drafts from, and which document each drafted result became. It follows
 * revision 64 (Issue #429, S81b2). No existing row changes.
 */
export const WRITING_TASK_SCHEMA_VERSION = 65;
/**
 * The 后台分析登记 revision (Issue #95, S39; ADR 0048; V2-UX-ANALYSIS-016 to 021): three additive, append-only relations owned by
 * `background-analysis-enrollments.ts` and created before this version is stamped — each Book's Background Analysis Enrollment,
 * its versions and its states — and the Run Authorizations' origin widened to admit `background-analysis-enrollment`, rebuilt
 * exactly as revision 31 widened it, every row copied byte for byte. It follows revision 65 (Issue #432, S84a). No existing row
 * changes.
 */
export const BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION = 66;
/**
 * The 资料索引 revision (Issue #428, S80a; V2-UX-KB-009): two additive, append-only relations owned by `material-index.ts` and
 * created before this version is stamped — each 资料库 item's Material Index build and the segments of a complete one. No
 * existing row changes. It follows revision 66 (Issue #95, S39) and moves nothing of its relations.
 */
export const MATERIAL_INDEX_SCHEMA_VERSION = 67;
/**
 * The 人工结果确认 revision (Issue #757; Manual Outcome Resolution, V2-UX-ATTN-002, NOTIF-004, CTRL-007): one additive,
 * append-only relation owned by `analysis/outcome-resolutions.ts` and created before this version is stamped — the editor's
 * 保留为缺口 over requests whose results cannot be known. No existing row changes. It follows revision 67 (Issue #428, S80a)
 * and moves nothing of its relations. This is the terminal version.
 */
export const OUTCOME_RESOLUTION_SCHEMA_VERSION = 68;
/** Additive earlier-Book exemplar ledgers (Issue #427); no existing record moves. */
export const IMPORTED_EXEMPLAR_SCHEMA_VERSION = 69;
/** Immutable house Evaluation Profiles and the exact profile each 初评 Task uses (KB-002). */
export const EVALUATION_PROFILE_SCHEMA_VERSION = 70;
/** The dialogue's Execution Bindings widened for the live Go route under developer-live (Issue #52, S17c). */
export const DIALOGUE_LIVE_BINDING_SCHEMA_VERSION = 71;
/**
 * The model-service connections widened to the two ordinary-production routes (Issue #811): `model_service_connections`
 * rebuilt to hold a Go row beside the DeepSeek 开放平台（官方） row, and which one is selected. Every existing row is kept, the
 * official row moving to the current model id. No task-authorization or analysis relation changes. This is the terminal version.
 */
export const MODEL_SERVICE_ROUTES_SCHEMA_VERSION = 72;
export const MODEL_CLARIFICATION_SCHEMA_VERSION = 73;
export const SEARCH_BACKEND_CONNECTIONS_SQL = `CREATE TABLE search_backend_connections (
  backend_id TEXT PRIMARY KEY CHECK(backend_id IN ('search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai')),
  credential_reference TEXT UNIQUE CHECK(credential_reference IS NULL OR length(credential_reference) = 36),
  credential_operation_state TEXT NOT NULL CHECK(credential_operation_state IN ('ready', 'missing', 'needs-attention')) CHECK(credential_reference IS NOT NULL OR credential_operation_state = 'missing'),
  selected INTEGER UNIQUE CHECK(selected IS NULL OR selected = 1),
  selected_at TEXT NOT NULL, always_use_selected INTEGER NOT NULL DEFAULT 0 CHECK(always_use_selected IN (0, 1))
) STRICT`;
export const SEARCH_BACKEND_SCHEMA_VERSION = 74;
/** Revision 75 (Issue #425, S70): the retained external evidence of research Runs — four append-only relations, nothing existing moved. */
export const RESEARCH_EVIDENCE_SCHEMA_VERSION = 75;
/**
 * Revision 76 (Issue #892): the Material Index's similarity vectors and 来源译文 — two additive, append-only relations owned by
 * `material-index.ts` and created before this version is stamped. No existing row changes, and nothing of revision 67's two
 * relations moves. No task-authorization or analysis relation changes. This is the terminal version.
 */
export const MATERIAL_INDEX_LAYER_SCHEMA_VERSION = 76;
export const PROPOSAL_REVIEW_SCHEMA_VERSION = 77;
/**
 * Revision 78 (Issue #901): factual verification — each 事实核查 Run's assurance level, its Versioned Verification Results, the
 * editor's Factual Review Decisions and each Correction Proposal's lineage: four additive, append-only relations owned by
 * `factual-verification.ts` and created before this version is stamped. No existing relation or row changes. This is the
 * terminal version.
 */
export const FACTUAL_VERIFICATION_SCHEMA_VERSION = 78;
export const HOUSE_REVIEW_PREFERENCE_SCHEMA_VERSION = 79;
/**
 * Revision 80 (Issue #423, slice 7a): the editor's Task Intent Drafts — three additive, append-only relations owned by
 * `task-intent-drafts.ts` and created before this version is stamped — and `analysis_task_intents` rebuilt, every row copied
 * byte for byte, so that a Task promoted from a draft keeps the draft's own bounded sentence as its goal for every kind, and so
 * that the custom analysis kind family (slice 7f) is admitted with its contract version and the baseline modes.
 */
export const TASK_INTENT_DRAFT_SCHEMA_VERSION = 80;
/** Revision 81 (ADR 0090 / #66): the additive foreign Skill ledgers. */
export const IMPORTED_SKILL_SCHEMA_VERSION = 81;
/**
 * Revision 82 (Issue #922, slice 7f): 自定义分析维度 — three additive, append-only relations owned by
 * `custom-analysis-dimensions.ts` and created before this version is stamped — and the two Result Set relations rebuilt, every row
 * copied byte for byte, so that each dimension keeps its own Result Set under the custom analysis kind family and its contract
 * version, which revision 80 already admits in `analysis_task_intents`.
 */
export const CUSTOM_ANALYSIS_SCHEMA_VERSION = 82;
/**
 * Revision 83 (Issue #89; ADR 0090 §3): foreign Skill update candidates, the Artifact Update Rule ledger and current selections —
 * three additive relations owned by `imported-skill-schema.ts` and created before this version is stamped. This is the terminal
 * version.
 */
export const IMPORTED_SKILL_UPDATE_SCHEMA_VERSION = 83;
export const MODEL_SELECTION_SCHEMA_VERSION = 84;
export const PROCEDURE_DEFINITION_SCHEMA_VERSION = 85;
export const EDITORIAL_LEARNING_SCHEMA_VERSION = 86;
export const GLOBAL_AGENT_SCHEMA_VERSION = 87;
export const REVIEW_CONTRACT_SCHEMA_VERSION = 88;
export const IDLE_BACKGROUND_SCHEMA_VERSION = 89;
export const LOCAL_REVIEW_SCHEMA_VERSION = 90;
/** Revision 91 (Issue #1128): the editor-governed memory /2 and 本社审阅偏好 /2 record readers; no relation changes. */
export const EDITORIAL_MEMORY_SCHEMA_VERSION = 91;
/** Reader-only successor: request fences need a reader that will not resend an ambiguous call. */
export const MODEL_REQUEST_ADMISSION_SCHEMA_VERSION = 92;
/** Additive Word source/choice/sample layer; authoring successor under Issue #1132 revision 13. */
export const WORD_TRACKED_IMPORT_SCHEMA_VERSION = 93;
/** First reader of selected original-field identity and local-fixture profile records; no SQL shape change. */
export const POLICY_ORIGINAL_FIELDS_READER_SCHEMA_VERSION = 94;
export const LEARNING_CURATION_SCHEMA_VERSION = 96;
export const FACTUAL_CLAIM_SCHEMA_VERSION = 97;
export const EDITABLE_PROCEDURE_SCHEMA_VERSION = 98;
/** Revision 99 (Issue #1173): the pre-installed composite 全文审校 v1 row; no relation changes. */
export const COMPOSITE_PROCEDURE_SCHEMA_VERSION = 99;
/** Revision 100 (Issue #1175): structural edit kinds, the Apply kind and block lineage in the command history. */
export const STRUCTURAL_EDIT_SCHEMA_VERSION = 100;
/** Revision 101 (Issue #1204): the note block kind in every block relation and the note sources of imports. */
export const NOTE_BLOCK_SCHEMA_VERSION = 101;
/** Revision 102 (Issue #1205): split-paragraph pieces and structure choices of staged imports, and their committed lineage. */
export const IMPORT_STRUCTURE_SCHEMA_VERSION = 102;
/** Revision 103 (Issue #1225): the Zen, Claude 官方 and Gemini 官方 connection rows and every production route a dialogue binds; CHECKs only. */
export const ADMITTED_CHANNELS_SCHEMA_VERSION = 103;
/** Revision 104 (Issue #1226): the one 备用来源 selection row beside the search-backend connections; 103 is W22b-A2's (#1225). */
export const SEARCH_FALLBACK_SCHEMA_VERSION = 104;
export const SEARCH_BACKEND_FALLBACK_SQL = `CREATE TABLE search_backend_fallback (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  backend_id TEXT NOT NULL CHECK(backend_id IN ('search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai')),
  selected_at TEXT NOT NULL
) STRICT`;
/** Revision 105 (#1282): independent Fast model and cached account model metadata. */
export const MODEL_SERVICE_DISCOVERY_SCHEMA_VERSION = 105;
export const LATEST_SCHEMA_VERSION = 117; // #1634: the folded baseline, Data Version 2 (ADR 0105 §4).
export const FACTUAL_RANGE_SCHEMA_VERSION = 110;
/** Revision 111 (Issue #1412): the append-only `ai_edit_lock_events` ledger, created before the stamp; no other relation changes. */
export const AI_EDIT_LOCK_SCHEMA_VERSION = 111;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SAMPLE1_SOURCE_DIGEST = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483' as const;
const NATIVE_CARRIER_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d' as const;
const SIDECAR_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff' as const;
const EXPECTED_OUTCOME = '供编辑复核的结构与叙事连贯性重点清单' as const;
const CHECKPOINT_PURPOSE = 'Task Input / 任务输入' as const;
// The purposes the bounded manuscript's checkpoint names; this owner persists only its own (Issue #413 adds the export's).
type CheckpointPurpose = typeof CHECKPOINT_PURPOSE | 'Reimport Safety / 重新导入安全固定点' | 'Export Input / 导出输入' | 'Document Version / 文档版本';
const NON_EFFECTS = [
  '不派发调度器任务',
  '不创建 DSH Session',
  '不读取或解析凭据',
  '不构造 Provider payload',
  '不访问网络或调用 Provider',
  '不创建或执行 Effect',
] as const;

type SqlRow = Record<string, SQLOutputValue>;

export const TASK_AUTHORIZATION_SCHEMA_SQL = {
  task_intents: `CREATE TABLE task_intents (
    task_intent_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
    goal TEXT NOT NULL CHECK(goal = '${J03_TASK_GOAL}'),
    expected_outcome TEXT NOT NULL CHECK(expected_outcome = '${EXPECTED_OUTCOME}'),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
  task_input_checkpoints: `CREATE TABLE task_input_checkpoints (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    revision_label TEXT NOT NULL,
    revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    purpose TEXT NOT NULL CHECK(purpose = '${CHECKPOINT_PURPOSE}'),
    created_for_dirty_journal INTEGER NOT NULL CHECK(created_for_dirty_journal IN (0, 1)),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  task_manuscript_pins: `CREATE TABLE task_manuscript_pins (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  task_artifact_pins: `CREATE TABLE task_artifact_pins (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  run_source_scopes: `CREATE TABLE run_source_scopes (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  provider_resolution_plans: `CREATE TABLE provider_resolution_plans (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  execution_plans: `CREATE TABLE execution_plans (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  plan_envelopes: `CREATE TABLE plan_envelopes (
    task_intent_id TEXT PRIMARY KEY REFERENCES task_intents(task_intent_id),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  run_authorizations: `CREATE TABLE run_authorizations (
    authorization_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL UNIQUE REFERENCES task_intents(task_intent_id),
    plan_envelope_sha256 TEXT NOT NULL REFERENCES plan_envelopes(sha256),
    origin TEXT NOT NULL CHECK(origin = 'standard-direct'),
    authorized_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
  run_records: `CREATE TABLE run_records (
    run_record_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL UNIQUE REFERENCES task_intents(task_intent_id),
    authorization_id TEXT NOT NULL UNIQUE REFERENCES run_authorizations(authorization_id),
    state TEXT NOT NULL CHECK(state = 'recorded-not-dispatched'),
    dispatched INTEGER NOT NULL CHECK(dispatched = 0),
    recorded_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
} as const;

const IMMUTABLE_TABLES = Object.keys(TASK_AUTHORIZATION_SCHEMA_SQL);

function immutabilityTriggers(tables: readonly string[]): Readonly<Record<string, string>> {
  return appendOnly(Object.fromEntries(tables.map((table) => [table, 'TASK_LEDGER_IMMUTABLE'])));
}

export const TASK_AUTHORIZATION_TRIGGER_SQL = immutabilityTriggers(IMMUTABLE_TABLES);

/**
 * The shape revisions 65 to 79 gave `analysis_task_intents`: every kind's goal pinned to its mode's fixed text except a review
 * category's bounded one, and no custom analysis kind. Kept only to validate a store at those revisions exactly before revision 80
 * (Issue #423, slice 7a) rebuilds the relation with every row copied byte for byte, and for the migration case.
 */

/**
 * Schema revision 15 introduced the baseline-analysis Task kind and its executed Run as additive
 * append-only relations beside the untouched J-03 ledger; the Task-kind discriminator lives here
 * because the J-03 tables fix one record-only Task per Book and are validated byte for byte. Run
 * states beyond `recorded-not-dispatched` are append-only transition rows; attempts, Execution
 * Bindings, Harness Execution Span references, and Task Outcomes are each written once. The Result
 * Set relations belong to the covered-analysis owner and are created before `analysis_task_outcomes`,
 * which links a revision.
 *
 * Revision 16 (Issue #93) rebuilds `analysis_task_intents` so a Book may hold successive
 * baseline-analysis Tasks over time: the `book_id` uniqueness is gone (the store enforces that no
 * new update Task is prepared while one is admitted or executing), every Task carries its exact
 * mode with the one fixed goal text of that mode, an update Task names the predecessor revision it
 * updates and, for `重新分析所选范围`, the explicitly selected block range; `analysis_plan_records`
 * admits the `reuse-plan` component. Both rebuilds copy every existing row with identical canonical
 * JSON and digest inside the migration transaction.
 *
 * Revision 17 (Issue #48) makes the Plan Envelope an authority-bearing boundary: the plan
 * components are keyed by Task Intent, plan version, and component (every existing row becomes
 * version 1 with its canonical JSON and digest untouched); `analysis_plan_versions` records one
 * immutable row per version with the envelope digest a Run Authorization binds;
 * `analysis_plan_revisions` records each Plan Revision with its field-level diff and the version it
 * supersedes, and the version that resolves it links back; `analysis_plan_adaptations` records each
 * in-envelope `safe-retry` adaptation of an attempt, keyed by attempt and ordinal. Every J-03
 * relation, CHECK, trigger, and row stays byte for byte unchanged.
 *
 * Revision 24 (Issue #417) admits the review-category kind family to `analysis_task_intents` beside
 * the two literal kinds, whose arms are untouched. A category is configuration, so the family has no
 * literal of its own in any CHECK: its kind is matched by shape, its contract version and its five
 * modes are the code-owned constants they are, and its goal — derived from the category's label — is
 * bounded in length here and compared with the definition's own text in the ledger. The family also
 * brings the first mode that starts a Result Set over a selected range (`review-first-range`), so
 * "no predecessor" and "carries a range" stop being mutually exclusive, which each CHECK says for
 * itself.
 *
 * Revision 59 (Issue #429, S81b1) admits the evaluation kind — AI7's 初评 — beside them, as one literal kind with its own
 * contract version and its two modes, each with its fixed goal; every other arm is untouched. Revision 62 (Issue #429, S81c)
 * admits the reader's report kind — 审稿意见 — the same way, revision 64 (Issue #429, S81b2) the evaluation rewrite kind —
 * 按我的评分重写评语 — and revision 65 (Issue #432, S84a) the writing kind — 写作任务.
 */
export const ANALYSIS_LEDGER_SCHEMA_SQL = {
  analysis_task_intents: `CREATE TABLE analysis_task_intents (
    task_intent_id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    kind TEXT NOT NULL CHECK(kind IN ('factual-recheck', 'learning-curation', 'baseline-manuscript-analysis', 'factual-review', 'evaluation', 'readers-report', 'evaluation-rewrite', 'writing') OR kind GLOB 'editorial-review/[a-z]*'
      OR kind GLOB 'custom-analysis/[a-z0-9-]*'),
    contract_version TEXT NOT NULL CHECK(contract_version IN ('ai7.factual-claim-verification/1', 'ai7.qualified-learning-curation/1', 'ai7.baseline-manuscript-analysis/1', 'ai7.factual-review/1', 'ai7.editorial-review/1', 'ai7.editorial-review/2', 'ai7.evaluation/1', 'ai7.readers-report/1', 'ai7.evaluation-rewrite/1',
      'ai7.writing/1') OR contract_version GLOB 'ai7.custom-analysis*/[0-9]*'),
    goal TEXT NOT NULL CHECK(length(goal) BETWEEN 1 AND 400),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    mode TEXT NOT NULL CHECK(mode IN ('factual-recheck', 'learning-curation', 'first-baseline', 'sync-current', 'reanalyze-range', 'reanalyze-book', 'whole-manuscript', 'range',
      'review-first', 'review-first-range', 'review-again', 'review-sync', 'review-range', 'evaluation-first', 'evaluation-again',
      'readers-report-first', 'readers-report-again', 'evaluation-rewrite-first', 'evaluation-rewrite-again', 'writing-first', 'writing-again')),
    predecessor_revision_id TEXT REFERENCES analysis_result_set_revisions(revision_id),
    selected_start_position INTEGER CHECK(selected_start_position IS NULL OR selected_start_position >= 1),
    selected_end_position INTEGER CHECK(selected_end_position IS NULL OR selected_end_position >= selected_start_position),
    CHECK((kind = 'factual-recheck' AND contract_version = 'ai7.factual-claim-verification/1' AND mode = 'factual-recheck') OR (kind = 'learning-curation' AND contract_version = 'ai7.qualified-learning-curation/1' AND mode = 'learning-curation') OR (kind = 'baseline-manuscript-analysis' AND contract_version = 'ai7.baseline-manuscript-analysis/1'
        AND mode IN ('first-baseline', 'sync-current', 'reanalyze-range', 'reanalyze-book'))
      OR (kind = 'factual-review' AND contract_version = 'ai7.factual-review/1'
        AND mode IN ('whole-manuscript', 'range', 'review-first-range', 'review-again', 'review-range'))
      OR (kind GLOB 'editorial-review/[a-z]*' AND contract_version IN ('ai7.editorial-review/1', 'ai7.editorial-review/2')
        AND mode IN ('review-first', 'review-first-range', 'review-again', 'review-sync', 'review-range'))
      OR (kind = 'evaluation' AND contract_version = 'ai7.evaluation/1'
        AND mode IN ('evaluation-first', 'evaluation-again'))
      OR (kind = 'readers-report' AND contract_version = 'ai7.readers-report/1'
        AND mode IN ('readers-report-first', 'readers-report-again'))
      OR (kind = 'evaluation-rewrite' AND contract_version = 'ai7.evaluation-rewrite/1'
        AND mode IN ('evaluation-rewrite-first', 'evaluation-rewrite-again'))
      OR (kind = 'writing' AND contract_version = 'ai7.writing/1'
        AND mode IN ('writing-first', 'writing-again'))
      OR (kind GLOB 'custom-analysis/[a-z0-9-]*' AND contract_version GLOB 'ai7.custom-analysis*/[0-9]*'
        AND mode IN ('first-baseline', 'sync-current', 'reanalyze-range', 'reanalyze-book'))),
    CHECK((mode IN ('factual-recheck', 'learning-curation', 'first-baseline', 'whole-manuscript', 'review-first', 'review-first-range', 'evaluation-first', 'readers-report-first',
      'evaluation-rewrite-first', 'writing-first')) = (predecessor_revision_id IS NULL)),
    CHECK((mode IN ('reanalyze-range', 'range', 'review-first-range', 'review-range')) = (selected_start_position IS NOT NULL)),
    CHECK((selected_start_position IS NULL) = (selected_end_position IS NULL))
  ) STRICT`,
  analysis_task_input_checkpoints: `CREATE TABLE analysis_task_input_checkpoints (
    task_intent_id TEXT PRIMARY KEY REFERENCES analysis_task_intents(task_intent_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    revision_label TEXT NOT NULL,
    revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
    journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
    purpose TEXT NOT NULL CHECK(purpose = '${TASK_INPUT_CHECKPOINT_PURPOSE}'),
    created_for_dirty_journal INTEGER NOT NULL CHECK(created_for_dirty_journal IN (0, 1)),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL
  ) STRICT`,
  analysis_plan_records: `CREATE TABLE analysis_plan_records (
    task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
    plan_version INTEGER NOT NULL CHECK(plan_version >= 1),
    component TEXT NOT NULL CHECK(component IN (
      'manuscript-pin', 'artifact-pin', 'run-source-scope', 'coverage-manifest',
      'provider-resolution-plan', 'execution-plan', 'plan-envelope', 'reuse-plan', 'web-tools-backend'
    )),
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
    created_at TEXT NOT NULL,
    PRIMARY KEY(task_intent_id, plan_version, component)
  ) STRICT`,
  analysis_plan_versions: `CREATE TABLE analysis_plan_versions (
    plan_version_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
    plan_revision_id TEXT UNIQUE REFERENCES analysis_plan_revisions(plan_revision_id),
    plan_envelope_sha256 TEXT NOT NULL UNIQUE CHECK(length(plan_envelope_sha256) = 64),
    created_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(task_intent_id, ordinal),
    CHECK((ordinal = 1) = (plan_revision_id IS NULL))
  ) STRICT`,
  analysis_plan_revisions: `CREATE TABLE analysis_plan_revisions (
    plan_revision_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
    prior_plan_version_id TEXT NOT NULL REFERENCES analysis_plan_versions(plan_version_id),
    prior_ordinal INTEGER NOT NULL CHECK(prior_ordinal >= 1),
    trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('prepare', 'inspect', 'reconfirm', 'plan-edit')),
    detected_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
  analysis_run_authorizations: `CREATE TABLE analysis_run_authorizations (
    authorization_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL UNIQUE REFERENCES analysis_task_intents(task_intent_id),
    plan_envelope_sha256 TEXT NOT NULL CHECK(length(plan_envelope_sha256) = 64),
    origin TEXT NOT NULL CHECK(origin IN ('enabled-learning', 'standard-direct', 'default-execution-rule', 'background-analysis-enrollment')),
    authority TEXT NOT NULL CHECK(authority IN ('standard-direct-dispatch', 'record-only-no-dispatch')),
    authorized_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    start_when TEXT NOT NULL DEFAULT 'now' CHECK(start_when IN ('now', 'idle'))
  ) STRICT`,
  analysis_run_records: `CREATE TABLE analysis_run_records (
    run_record_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL UNIQUE REFERENCES analysis_task_intents(task_intent_id),
    authorization_id TEXT NOT NULL UNIQUE REFERENCES analysis_run_authorizations(authorization_id),
    recorded_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
  analysis_run_states: `CREATE TABLE analysis_run_states (
    run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    state TEXT NOT NULL CHECK(state IN (
      'authorized', 'blocked-before-dispatch', 'admitted', 'executing',
      'completed', 'completed-with-gaps', 'failed', 'interrupted',
      'awaiting-connectivity', 'cancelled', 'cancelling',
      'pausing', 'paused', 'resumable', 'awaiting-clarification'
    )),
    recorded_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
    PRIMARY KEY(run_record_id, sequence)
  ) STRICT`,
  analysis_execution_attempts: `CREATE TABLE analysis_execution_attempts (
    attempt_id TEXT PRIMARY KEY,
    run_record_id TEXT NOT NULL REFERENCES analysis_run_records(run_record_id),
    ordinal INTEGER NOT NULL CHECK(ordinal = 1),
    started_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(run_record_id, ordinal)
  ) STRICT`,
  analysis_execution_bindings: `CREATE TABLE analysis_execution_bindings (
    attempt_id TEXT PRIMARY KEY REFERENCES analysis_execution_attempts(attempt_id),
    harness_session_id TEXT NOT NULL UNIQUE,
    bound_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
  analysis_harness_spans: `CREATE TABLE analysis_harness_spans (
    span_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES analysis_execution_attempts(attempt_id),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
    harness_session_id TEXT NOT NULL,
    start_seq INTEGER NOT NULL CHECK(start_seq >= 0),
    end_seq INTEGER NOT NULL CHECK(end_seq >= start_seq),
    unit_ordinal INTEGER CHECK(unit_ordinal IS NULL OR unit_ordinal >= 1),
    recorded_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(attempt_id, ordinal)
  ) STRICT`,
  analysis_plan_adaptations: `CREATE TABLE analysis_plan_adaptations (
    adaptation_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES analysis_execution_attempts(attempt_id),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
    unit_ordinal INTEGER NOT NULL CHECK(unit_ordinal >= 1),
    adaptation_class TEXT NOT NULL CHECK(adaptation_class IN ('safe-retry', 'contract-retry')),
    recorded_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
    UNIQUE(attempt_id, ordinal)
  ) STRICT`,
  ...ANALYSIS_RESULT_SET_SCHEMA_SQL,
  analysis_task_outcomes: `CREATE TABLE analysis_task_outcomes (
    outcome_id TEXT PRIMARY KEY,
    task_intent_id TEXT NOT NULL UNIQUE REFERENCES analysis_task_intents(task_intent_id),
    run_record_id TEXT NOT NULL UNIQUE REFERENCES analysis_run_records(run_record_id),
    classification TEXT NOT NULL CHECK(classification IN ('completed', 'completed-with-gaps', 'failed', 'interrupted', 'cancelled')),
    result_set_revision_id TEXT REFERENCES analysis_result_set_revisions(revision_id),
    recorded_at TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
  ) STRICT`,
} as const;

const ANALYSIS_LEDGER_TABLES = Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL);
export const ANALYSIS_LEDGER_TRIGGER_SQL = immutabilityTriggers(ANALYSIS_LEDGER_TABLES);

export class TaskAuthorizationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TaskAuthorizationError';
  }
}

function requireTask(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new TaskAuthorizationError(code, message);
}

function asString(value: unknown): string {
  requireTask(typeof value === 'string', 'TASK_RECORD_INVALID', '任务授权记录字段无效。');
  return value;
}

function asNumber(value: unknown): number {
  requireTask(typeof value === 'number' && Number.isSafeInteger(value), 'TASK_RECORD_INVALID', '任务授权记录数值无效。');
  return value;
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'string') requireTask(value.isWellFormed(), 'TASK_CANONICAL_INVALID', '任务授权记录无法规范化。');
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  requireTask(encoded !== undefined, 'TASK_CANONICAL_INVALID', '任务授权记录无法规范化。');
  return encoded;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Exported so a suite can write a record this store's own guard will not let it produce. */
export function canonicalRecord(value: unknown): { json: string; digest: string } {
  const json = canonicalJson(value);
  return { json, digest: sha256(json) };
}

function parseCanonicalJson(value: unknown): unknown {
  const json = asString(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new TaskAuthorizationError('TASK_RECORD_INVALID', '任务授权记录不是有效 JSON。');
  }
  requireTask(canonicalJson(parsed) === json, 'TASK_RECORD_INVALID', '任务授权记录不是规范 JSON。');
  return parsed;
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function transact<T>(db: DatabaseSync, body: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = body();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Task authorization transaction rollback failed.');
    }
    throw error;
  }
}

/**
 * The exact Provider Processing pin each trusted scope defines, as `ProviderProcessingPin` declares
 * it. This is the one place the closed value sets live: admitting a second scope to this Task kind
 * is a row here and a branch in the four readings below, not a hunt through the seven statements
 * that used to spell `development-ci`, `v1`, and `0` out for themselves.
 */
const PROVIDER_PROCESSING_PINS: Readonly<Record<TrustedOperationalScope, ProviderProcessingPin>> = {
  'development-ci': { operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 },
  'developer-live': { operationalScope: 'developer-live', version: DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION, decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' },
  // The editor's own model service under the local production launch (Issue #811): Provider Processing v19, bounded by the Run.
  'ordinary-production': { operationalScope: 'ordinary-production', version: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' },
};

/** The developer-live versions earlier launches selected, whose retained records stay readable after a successor is selected. */
const RETAINED_DEVELOPER_LIVE_VERSIONS: readonly DeveloperLiveProviderProcessingVersion[] = ['v5', 'v9', 'v10', 'v11', 'v12', 'v14', 'v16', 'v18', 'v20', 'v22'];
const RETAINED_ORDINARY_PRODUCTION_VERSIONS: readonly OrdinaryProductionProviderProcessingVersion[] = ['v13', 'v15', 'v17', 'v19', 'v21', 'v23', 'v25', 'v26', 'v27', 'v30', 'v31'];

/**
 * The pin a stored value carries, or `null` when it is not exactly the pin of the scope it names.
 * A record is only ever read against its own pin — never against the scope the current launch
 * happens to bind — so a row written under one scope stays valid after a relaunch under another.
 */
function providerProcessingPinOf(value: unknown): ProviderProcessingPin | null {
  if (value === null || typeof value !== 'object') return null;
  const scope = (value as { operationalScope?: unknown }).operationalScope;
  if (typeof scope !== 'string' || !isTrustedOperationalScope(scope)) return null;
  const pin = PROVIDER_PROCESSING_PINS[scope];
  if (canonicalJson(value) === canonicalJson(pin)) return pin;
  // A closed historical version keeps its exact recorded decision/count; it never acquires today's identity.
  const retained: ProviderProcessingPin[] = [
    { operationalScope: 'development-ci', version: 'v29', decision: 'deny', authorizedLiveTransmissionCount: 0 },
    ...RETAINED_DEVELOPER_LIVE_VERSIONS.map((version) => ({ operationalScope: 'developer-live' as const, version,
      decision: 'eligible-only' as const, authorizedLiveTransmissionCount: 'bounded-by-run' as const })),
    ...RETAINED_ORDINARY_PRODUCTION_VERSIONS.map((version) => ({ operationalScope: 'ordinary-production' as const, version,
      decision: 'eligible-only' as const, authorizedLiveTransmissionCount: 'bounded-by-run' as const })),
  ];
  return retained.find((candidate) => canonicalJson(value) === canonicalJson(candidate)) ?? null;
}

/**
 * The pin the bound launch carries. The launch's own scope selects it, and a launch whose stated
 * version, decision, or transmission count disagrees with its scope is refused rather than pinned.
 */
export function planProviderProcessingPin(policy: LaunchPolicyProjection): ProviderProcessingPin {
  const scope = policy.operationalScope;
  requireTask(scope !== null, 'TASK_POLICY_UNAVAILABLE', '可信启动范围缺失。');
  const pin = PROVIDER_PROCESSING_PINS[scope];
  requireTask(policy.providerProcessing.version === pin.version &&
    policy.providerProcessing.decision === pin.decision &&
    policy.providerProcessing.authorizedLiveTransmissionCount === pin.authorizedLiveTransmissionCount,
  'TASK_POLICY_UNAVAILABLE', '可信启动范围与其 Provider Processing 记录不一致。');
  return pin;
}

/**
 * Every statement this Task kind makes about its trusted scope is derived from one pin: the
 * Execution Plan's stop condition, the Plan Envelope's summary, and the foreground boundary's three
 * denial reasons. Under `development-ci` each reads exactly as it always has, byte for byte; a
 * surface that promised zero live transmission under a launch that authorizes them is the defect
 * these derive away. They are exported so a test can assert the readings of a scope the guard in
 * `#requireDeniedPolicy` will not let the store reach.
 */
export function planStopCondition(pin: ProviderProcessingPin): string {
  return pin.decision === 'deny'
    ? `Provider Processing ${pin.version} denies dispatch`
    : `Provider Processing ${pin.version} admits dispatch bounded by the Run`;
}

export function planEnvelopeSummary(pin: ProviderProcessingPin): string {
  return pin.decision === 'deny'
    ? `计划已冻结；Provider Processing ${pin.version} 拒绝派发`
    : `计划已冻结；Provider Processing ${pin.version} 允许的实时传输受运行边界约束`;
}

/** Why a recorded Run cannot start in the foreground; only the middle reason states the launch's own facts. */
export function foregroundDenialReasons(pin: ProviderProcessingPin): readonly [string, string, string] {
  return [
    '现有 Run 权限仅为 record-only-no-dispatch，不能派发。',
    pin.decision === 'deny'
      ? `当前可信启动范围为 ${pin.operationalScope}，Provider Processing ${pin.version} 允许 ${pin.authorizedLiveTransmissionCount} 次实时传输。`
      : `当前可信启动范围为 ${pin.operationalScope}，Provider Processing ${pin.version} 允许的实时传输受运行边界约束（${pin.authorizedLiveTransmissionCount}）。`,
    '生产或录制尝试必须创建新 Plan Envelope 并重新记录 Run Authorization。',
  ];
}

/**
 * The three plan records whose content depends on the pin, built once for both sides: the write side
 * passes the pin of the bound launch, the read side passes the pin the row itself carries, so the
 * two can never drift. Everything else about the plan — the denied production binding, the fixed
 * steps, the frozen digests — is what it always was.
 */
export function providerResolutionPlanValue(credentialReference: string, pin: ProviderProcessingPin, selectedPolicyIdentity?: SelectedPolicyIdentity) {
  return {
    ...(selectedPolicyIdentity === undefined ? {} : { selectedPolicyIdentity }),
    role: 'Main Editorial Role',
    capabilities: [],
    providerId: 'deepseek-open-platform',
    modelId: 'deepseek-v4-pro',
    adapterRevision: 1,
    configurationRevision: 1,
    approvedFallbackChain: [],
    credentialReference,
    credentialReadiness: 'missing',
    outboundDataCategory: 'public-or-synthetic',
    runBudgetCeiling: 'unset',
    providerProcessing: pin,
  } as const;
}

export function executionPlanValue(pin: ProviderProcessingPin) {
  return {
    steps: ['分析结构', '分析叙事连贯性', '形成编辑复核重点'],
    effects: [],
    stopCondition: planStopCondition(pin),
  } as const;
}

export function planEnvelopeValue(pin: ProviderProcessingPin, frozen: {
  taskIntentId: string;
  checkpointDigest: string;
  manuscriptPinDigest: string;
  artifactPinDigest: string;
  runSourceScopeDigest: string;
  providerResolutionPlanDigest: string;
  executionPlanDigest: string;
}) {
  return {
    providerStatus: 'denied',
    dispatchAllowed: false,
    summary: planEnvelopeSummary(pin),
    ...frozen,
  } as const;
}

function validateCanonicalRowDigests(db: DatabaseSync, tables: readonly string[]): void {
  for (const table of tables) {
    const rows = db.prepare(`SELECT canonical_json, sha256 FROM ${table}`).all() as SqlRow[];
    for (const row of rows) {
      const json = asString(row.canonical_json);
      requireTask(DIGEST_PATTERN.test(asString(row.sha256)) && sha256(json) === row.sha256,
        'TASK_RECORD_INVALID', '任务授权记录摘要不一致。');
      parseCanonicalJson(json);
    }
  }
}

function validateStoredCanonicalRows(db: DatabaseSync): void {
  validateCanonicalRowDigests(db, IMMUTABLE_TABLES);
  const rows = db.prepare(
    `SELECT ti.task_intent_id, ti.book_id, ti.goal, ti.expected_outcome, ti.created_at,
            ti.canonical_json intent_json,
            cp.task_intent_id checkpoint_id, cp.manuscript_id, cp.branch_id, cp.revision_id,
            cp.revision_label, cp.revision_digest, cp.journal_sequence, cp.purpose,
            cp.created_for_dirty_journal, cp.canonical_json checkpoint_json, cp.sha256 checkpoint_sha256,
            mp.task_intent_id manuscript_pin_id, mp.canonical_json manuscript_pin_json, mp.sha256 manuscript_pin_sha256,
            ap.task_intent_id artifact_pin_id, ap.canonical_json artifact_pin_json, ap.sha256 artifact_pin_sha256,
            rs.task_intent_id source_scope_id, rs.canonical_json source_scope_json, rs.sha256 source_scope_sha256,
            pp.task_intent_id provider_plan_id, pp.canonical_json provider_plan_json, pp.sha256 provider_plan_sha256,
            ep.task_intent_id execution_plan_id, ep.canonical_json execution_plan_json, ep.sha256 execution_plan_sha256,
            pe.task_intent_id envelope_id, pe.canonical_json envelope_json, pe.sha256 envelope_sha256,
            mr.revision_id joined_revision_id, mr.revision_digest joined_revision_digest,
            mr.source_version_id, sv.source_digest, m.manuscript_id joined_manuscript_id,
            mb.branch_id joined_branch_id, ti.book_id artifact_pin_book_id,
            'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d' native_carrier_sha256,
            ra.task_intent_id authorization_task_id, ra.authorization_id, ra.plan_envelope_sha256,
            ra.origin, ra.authorized_at, ra.canonical_json authorization_json,
            rr.task_intent_id run_task_id, rr.run_record_id, rr.authorization_id run_authorization_id,
            rr.state, rr.dispatched, rr.recorded_at, rr.canonical_json run_json
     FROM task_intents ti
     LEFT JOIN task_input_checkpoints cp ON cp.task_intent_id = ti.task_intent_id
     LEFT JOIN task_manuscript_pins mp ON mp.task_intent_id = ti.task_intent_id
     LEFT JOIN task_artifact_pins ap ON ap.task_intent_id = ti.task_intent_id
     LEFT JOIN run_source_scopes rs ON rs.task_intent_id = ti.task_intent_id
     LEFT JOIN provider_resolution_plans pp ON pp.task_intent_id = ti.task_intent_id
     LEFT JOIN execution_plans ep ON ep.task_intent_id = ti.task_intent_id
     LEFT JOIN plan_envelopes pe ON pe.task_intent_id = ti.task_intent_id
     LEFT JOIN run_authorizations ra ON ra.task_intent_id = ti.task_intent_id
     LEFT JOIN run_records rr ON rr.task_intent_id = ti.task_intent_id
     LEFT JOIN manuscripts m ON m.manuscript_id = cp.manuscript_id AND m.book_id = ti.book_id AND m.role = 'primary'
     LEFT JOIN manuscript_branches mb ON mb.branch_id = cp.branch_id AND mb.manuscript_id = m.manuscript_id
     LEFT JOIN manuscript_revisions mr ON mr.revision_id = cp.revision_id
       AND mr.manuscript_id = m.manuscript_id AND mr.branch_id = mb.branch_id
     LEFT JOIN source_versions sv ON sv.source_version_id = mr.source_version_id
       AND sv.book_id = ti.book_id
`,
  ).all() as SqlRow[];
  for (const row of rows) {
    const taskIntentId = asString(row.task_intent_id);
    const bookId = asString(row.book_id);
    const createdAt = asString(row.created_at);
    requireTask(UUID_PATTERN.test(taskIntentId) && UUID_PATTERN.test(bookId) &&
      row.goal === J03_TASK_GOAL && row.expected_outcome === EXPECTED_OUTCOME && isCanonicalInstant(createdAt) &&
      row.intent_json === canonicalJson({
        bookId,
        createdAt,
        expectedOutcome: EXPECTED_OUTCOME,
        goal: J03_TASK_GOAL,
        taskIntentId,
      }), 'TASK_RECORD_INVALID', '任务意图记录无效。');
    const prepared = row.checkpoint_id !== null;
    const graph = ['manuscript_pin_id', 'artifact_pin_id', 'source_scope_id', 'provider_plan_id', 'execution_plan_id', 'envelope_id'];
    requireTask(graph.every((key) => (row[key] !== null) === prepared), 'TASK_RECORD_INVALID', '任务计划记录图不完整。');
    if (prepared) {
      const manuscriptId = asString(row.manuscript_id);
      const branchId = asString(row.branch_id);
      const revisionId = asString(row.revision_id);
      const revisionLabel = asString(row.revision_label);
      const revisionDigest = asString(row.revision_digest);
      const journalSequence = asNumber(row.journal_sequence);
      const createdForDirtyJournal = asNumber(row.created_for_dirty_journal);
      const sourceVersionId = asString(row.source_version_id);
      // The plan is read against the credential reference it froze, never this computer's connection: a Book merged from
      // another computer brings its plans and not that computer's connection (Issue #434 review), and each plan still has
      // to be exactly what its own reference and pin derive.
      const plan = parseCanonicalJson(row.provider_plan_json) as { providerProcessing?: unknown; credentialReference?: unknown };
      const credentialReference = typeof plan.credentialReference === 'string' ? plan.credentialReference : '';
      requireTask(
        row.checkpoint_id === taskIntentId && UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(branchId) &&
        UUID_PATTERN.test(revisionId) && /^r[1-9][0-9]*$/.test(revisionLabel) && DIGEST_PATTERN.test(revisionDigest) &&
        journalSequence >= 0 && (createdForDirtyJournal === 0 || createdForDirtyJournal === 1) &&
        row.purpose === CHECKPOINT_PURPOSE && row.joined_manuscript_id === manuscriptId &&
        row.joined_branch_id === branchId && row.joined_revision_id === revisionId &&
        row.joined_revision_digest === revisionDigest && UUID_PATTERN.test(sourceVersionId) &&
        row.source_digest === SAMPLE1_SOURCE_DIGEST && row.artifact_pin_book_id === bookId &&
        row.native_carrier_sha256 === NATIVE_CARRIER_DIGEST &&
        UUID_PATTERN.test(credentialReference),
        'TASK_RECORD_INVALID',
        '任务计划所固定的输入、构件或本地绑定无效。',
      );
      requireTask(row.checkpoint_json === canonicalJson({
        branchId,
        createdForDirtyJournal: createdForDirtyJournal === 1,
        journalSequence,
        manuscriptId,
        purpose: CHECKPOINT_PURPOSE,
        revisionDigest,
        revisionId,
        revisionLabel,
        taskIntentId,
      }), 'TASK_RECORD_INVALID', '任务输入固定点记录无效。');
      requireTask(row.manuscript_pin_json === canonicalJson({
        bookId,
        manuscriptId,
        revisionId,
        revisionDigest,
        sourceVersionId,
        sourceDigest: SAMPLE1_SOURCE_DIGEST,
      }), 'TASK_RECORD_INVALID', '任务稿件 pin 无效。');
      requireTask(row.artifact_pin_json === canonicalJson({
        identity: '@ai7/editorial-workspace-profile',
        version: '1.0.0',
        nativeCarrierSha256: NATIVE_CARRIER_DIGEST,
        sidecarIdentity: 'ai7.editorial-workspace-profile.authority',
        sidecarRevision: 2,
        sidecarSha256: SIDECAR_DIGEST,
      }), 'TASK_RECORD_INVALID', '任务原生构件 pin 无效。');
      requireTask(row.source_scope_json === canonicalJson({
        bookId,
        manuscriptId,
        taskInputRevision: { revisionId, revisionDigest },
        readableScopeKinds: ['current-book-primary-manuscript-revision'],
        sourceVersionEvidence: { sourceVersionId, readable: false },
      }), 'TASK_RECORD_INVALID', '任务运行来源范围无效。');
      // The plan is validated against the pin it froze, not against the launch reading it now: the
      // row states its own scope, and the Execution Plan and Plan Envelope must be the derivations
      // of that same pin. Under `development-ci` this is byte for byte the check it always was.
      const pin = providerProcessingPinOf(plan.providerProcessing);
      requireTask(pin !== null, 'TASK_RECORD_INVALID', 'Provider Resolution Plan 的 Provider Processing pin 无效。');
      const selected = providerPlanPolicyMetadata(plan);
      requireTask(row.provider_plan_json === canonicalJson(providerResolutionPlanValue(credentialReference, pin, selected.selectedPolicyIdentity)),
        'TASK_RECORD_INVALID', 'Provider Resolution Plan 无效。');
      requireTask(row.execution_plan_json === canonicalJson(executionPlanValue(pin)),
        'TASK_RECORD_INVALID', 'Execution Plan 无效。');
      requireTask(row.envelope_json === canonicalJson(planEnvelopeValue(pin, {
        taskIntentId,
        checkpointDigest: asString(row.checkpoint_sha256),
        manuscriptPinDigest: asString(row.manuscript_pin_sha256),
        artifactPinDigest: asString(row.artifact_pin_sha256),
        runSourceScopeDigest: asString(row.source_scope_sha256),
        providerResolutionPlanDigest: asString(row.provider_plan_sha256),
        executionPlanDigest: asString(row.execution_plan_sha256),
      })), 'TASK_RECORD_INVALID', 'Plan Envelope 无效。');
    }
    requireTask((row.authorization_task_id !== null) === (row.run_task_id !== null),
      'TASK_RECORD_INVALID', '任务授权与运行记录不完整。');
    if (row.run_task_id !== null) {
      const authorizationId = asString(row.authorization_id);
      const runRecordId = asString(row.run_record_id);
      const authorizedAt = asString(row.authorized_at);
      const recordedAt = asString(row.recorded_at);
      requireTask(prepared && row.authorization_task_id === taskIntentId && row.run_task_id === taskIntentId &&
        UUID_PATTERN.test(authorizationId) && UUID_PATTERN.test(runRecordId) &&
        row.plan_envelope_sha256 === row.envelope_sha256 && row.origin === 'standard-direct' &&
        isCanonicalInstant(authorizedAt) && row.run_authorization_id === authorizationId &&
        row.state === 'recorded-not-dispatched' && row.dispatched === 0 && isCanonicalInstant(recordedAt) &&
        row.authorization_json === canonicalJson({
          authorizationId,
          origin: 'standard-direct',
          planEnvelopeDigest: asString(row.envelope_sha256),
          taskIntentId,
          authority: 'record-only-no-dispatch',
        }) && row.run_json === canonicalJson({
          authorizationId,
          dispatched: false,
          runRecordId,
          state: 'recorded-not-dispatched',
          taskIntentId,
        }), 'TASK_RECORD_INVALID', '运行记录超出标准直接授权的未派发终态。');
    }
  }
  requireTask(foreignKeyViolations(db, IMMUTABLE_TABLES) === 0,
    'TASK_RECORD_INVALID', '任务授权记录引用校验失败。');
}

interface ManuscriptCheckpointBinding {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  journalSequence: number;
  createdForDirtyJournal: boolean;
}

interface CheckpointOwner {
  createManuscriptCheckpointWork(manuscriptId: string, branchId: string, purpose: typeof CHECKPOINT_PURPOSE):
    { workId: string | null; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  advanceManuscriptCheckpointWork(workId: string):
    { done: boolean; completed: number; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  finalizeManuscriptCheckpointWork(
    workId: string,
    persist: (checkpoint: ManuscriptCheckpointBinding, purpose: CheckpointPurpose) => void,
  ): ManuscriptCheckpointBinding;
  cancelManuscriptCheckpointWork(workId: string): boolean;
}

interface PreparationWork {
  workId: string;
  taskIntentId: string;
  checkpointWorkId: string;
  launchPolicy: LaunchPolicyProjection;
  total: number;
}

export type TaskPreparationResult = {
  done: boolean;
  workId: string | null;
  completed: number;
  total: number;
  projection: TaskAuthorizationProjection | null;
};

export type TaskPrepareInput =
  | { phase: 'start'; bookId: string; goal: typeof J03_TASK_GOAL; launchPolicy: LaunchPolicyProjection }
  | { phase: 'advance'; workId: string }
  | { phase: 'cancel'; workId: string }
  | { phase: 'cancel-all' };

export class TaskAuthorizationStore {
  readonly #work = new Map<string, PreparationWork>();
  readonly #db: DatabaseSync;
  readonly #checkpointOwner: CheckpointOwner;

  constructor(db: DatabaseSync, checkpointOwner: CheckpointOwner) {
    this.#db = db;
    this.#checkpointOwner = checkpointOwner;
    validateTaskAuthorizationRecords(db);
  }

  inspect(bookId: string): TaskAuthorizationProjection {
    requireTask(UUID_PATTERN.test(bookId), 'TASK_BOOK_INVALID', '任务所属图书无效。');
    const intent = this.#db.prepare('SELECT * FROM task_intents WHERE book_id = ?').get(bookId) as SqlRow | undefined;
    if (intent === undefined) {
      this.#binding(bookId);
      return this.#available(bookId);
    }
    const taskIntentId = asString(intent.task_intent_id);
    const checkpoint = this.#db.prepare('SELECT * FROM task_input_checkpoints WHERE task_intent_id = ?')
      .get(taskIntentId) as SqlRow | undefined;
    if (checkpoint === undefined) {
      this.#binding(bookId);
      return { ...this.#available(bookId), taskIntent: this.#intentProjection(intent), actions: { canPrepare: true, canAuthorize: false } };
    }
    const read = <T>(table: string): T => {
      const row = this.#db.prepare(`SELECT canonical_json FROM ${table} WHERE task_intent_id = ?`).get(taskIntentId) as SqlRow | undefined;
      requireTask(row !== undefined, 'TASK_RECORD_INVALID', '任务计划记录图不完整。');
      return parseCanonicalJson(row.canonical_json) as T;
    };
    const envelopeRow = this.#db.prepare('SELECT canonical_json, sha256 FROM plan_envelopes WHERE task_intent_id = ?')
      .get(taskIntentId) as SqlRow;
    const envelope = parseCanonicalJson(envelopeRow.canonical_json) as {
      providerStatus: 'denied';
      dispatchAllowed: false;
      summary: string;
    };
    const authorization = this.#db.prepare('SELECT * FROM run_authorizations WHERE task_intent_id = ?')
      .get(taskIntentId) as SqlRow | undefined;
    const runRecord = this.#db.prepare('SELECT * FROM run_records WHERE task_intent_id = ?')
      .get(taskIntentId) as SqlRow | undefined;
    return {
      bookId,
      state: authorization === undefined ? 'prepared' : 'authorized',
      taskIntent: this.#intentProjection(intent),
      checkpoint: {
        manuscriptId: asString(checkpoint.manuscript_id),
        branchId: asString(checkpoint.branch_id),
        revisionId: asString(checkpoint.revision_id),
        revisionLabel: asString(checkpoint.revision_label),
        revisionDigest: asString(checkpoint.revision_digest),
        journalSequence: asNumber(checkpoint.journal_sequence),
        purpose: CHECKPOINT_PURPOSE,
        createdForDirtyJournal: asNumber(checkpoint.created_for_dirty_journal) === 1,
      },
      manuscriptPin: read('task_manuscript_pins'),
      runSourceScope: read('run_source_scopes'),
      artifactPin: read('task_artifact_pins'),
      providerResolutionPlan: read('provider_resolution_plans'),
      executionPlan: read('execution_plans'),
      planEnvelope: {
        digest: asString(envelopeRow.sha256),
        providerStatus: envelope.providerStatus,
        dispatchAllowed: envelope.dispatchAllowed,
        summary: envelope.summary,
      },
      authorization: authorization === undefined ? null : {
        authorizationId: asString(authorization.authorization_id),
        planEnvelopeDigest: asString(authorization.plan_envelope_sha256),
        origin: 'standard-direct',
        authorizedAt: asString(authorization.authorized_at),
      },
      runRecord: runRecord === undefined ? null : {
        runRecordId: asString(runRecord.run_record_id),
        state: 'recorded-not-dispatched',
        dispatched: false,
        terminalLabel: '已记录授权 · 未派发',
        recordedAt: asString(runRecord.recorded_at),
      },
      actions: { canPrepare: false, canAuthorize: authorization === undefined },
      namedNonEffects: NON_EFFECTS,
    };
  }

  inspectForegroundExecutionBoundary(
    bookId: string,
    runRecordId: string,
    launchPolicy: LaunchPolicyProjection,
  ): ForegroundExecutionBoundaryProjection {
    requireTask(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(runRecordId),
      'TASK_FOREGROUND_BOUNDARY_INVALID', '前台执行边界核对参数无效。');
    this.#requireDeniedPolicy(launchPolicy);
    validateStoredCanonicalRows(this.#db);
    const recorded = this.inspect(bookId);
    requireTask(recorded.state === 'authorized' && recorded.taskIntent !== null && recorded.checkpoint !== null &&
      recorded.manuscriptPin?.bookId === bookId && recorded.runSourceScope?.bookId === bookId &&
      recorded.artifactPin !== null &&
      providerProcessingPinOf(recorded.providerResolutionPlan?.providerProcessing) !== null &&
      recorded.executionPlan !== null && recorded.planEnvelope?.dispatchAllowed === false &&
      recorded.authorization?.planEnvelopeDigest === recorded.planEnvelope.digest &&
      recorded.runRecord?.runRecordId === runRecordId && recorded.runRecord.state === 'recorded-not-dispatched' &&
      recorded.runRecord.dispatched === false,
    'TASK_FOREGROUND_BOUNDARY_UNAVAILABLE', '仅可核对当前图书中已记录且未派发的运行。');
    return {
      bookId,
      taskIntentId: recorded.taskIntent.taskIntentId,
      planEnvelopeDigest: recorded.planEnvelope.digest,
      authorizationId: recorded.authorization.authorizationId,
      runRecordId: recorded.runRecord.runRecordId,
      state: 'blocked-before-dispatch',
      terminalLabel: '前台执行已拒绝 · 未启动',
      runAuthority: 'record-only-no-dispatch',
      launchPolicy: structuredClone(launchPolicy),
      requiresNewPlanEnvelope: true,
      requiresRenewedRunAuthorization: true,
      reasons: foregroundDenialReasons(planProviderProcessingPin(launchPolicy)),
    };
  }

  prepare(input: TaskPrepareInput): TaskPreparationResult {
    if (input.phase === 'cancel-all') {
      for (const workId of Array.from(this.#work.keys())) this.prepare({ phase: 'cancel', workId });
      return { done: true, workId: null, completed: 0, total: 0, projection: null };
    }
    if (input.phase === 'cancel') {
      const work = this.#work.get(input.workId);
      if (work !== undefined) {
        this.#checkpointOwner.cancelManuscriptCheckpointWork(work.checkpointWorkId);
        this.#work.delete(input.workId);
      }
      return { done: true, workId: null, completed: 0, total: 0, projection: null };
    }
    if (input.phase === 'advance') return this.#advance(input.workId);
    requireTask(input.goal === J03_TASK_GOAL, 'TASK_GOAL_INVALID', '本次任务目标与固定 J-03 目标不一致。');
    this.#requireDeniedPolicy(input.launchPolicy);
    const existing = this.inspect(input.bookId);
    if (existing.state !== 'available' || existing.taskIntent !== null) {
      if (existing.state === 'prepared' || existing.state === 'authorized') {
        return { done: true, workId: null, completed: 1, total: 1, projection: existing };
      }
    }
    const binding = this.#binding(input.bookId);
    const taskIntentId = existing.taskIntent?.taskIntentId ?? randomUUID();
    if (existing.taskIntent === null) {
      const createdAt = new Date().toISOString();
      const intent = canonicalRecord({
        bookId: input.bookId,
        createdAt,
        expectedOutcome: EXPECTED_OUTCOME,
        goal: J03_TASK_GOAL,
        taskIntentId,
      });
      this.#db.prepare(
        `INSERT INTO task_intents(
           task_intent_id, book_id, goal, expected_outcome, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(taskIntentId, input.bookId, J03_TASK_GOAL, EXPECTED_OUTCOME, createdAt, intent.json, intent.digest);
    }
    const active = Array.from(this.#work.values()).find((work) => work.taskIntentId === taskIntentId);
    if (active !== undefined) return { done: false, workId: active.workId, completed: 0, total: active.total, projection: null };
    const checkpoint = this.#checkpointOwner.createManuscriptCheckpointWork(
      binding.manuscriptId,
      binding.branchId,
      CHECKPOINT_PURPOSE,
    );
    if (checkpoint.workId === null) {
      requireTask(checkpoint.checkpoint !== null, 'TASK_CHECKPOINT_INVALID', '任务输入固定点缺失。');
      transact(this.#db, () => this.#persistPrepared(taskIntentId, checkpoint.checkpoint!, CHECKPOINT_PURPOSE, input.launchPolicy));
      return { done: true, workId: null, completed: 1, total: 1, projection: this.inspect(input.bookId) };
    }
    const workId = randomUUID();
    this.#work.set(workId, {
      workId,
      taskIntentId,
      checkpointWorkId: checkpoint.workId,
      launchPolicy: structuredClone(input.launchPolicy),
      total: checkpoint.total,
    });
    return { done: false, workId, completed: 0, total: checkpoint.total, projection: null };
  }

  authorize(bookId: string, taskIntentId: string, planEnvelopeDigest: string): TaskAuthorizationProjection {
    requireTask(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest),
      'TASK_AUTHORIZATION_INVALID', '任务运行授权参数无效。');
    const prepared = this.inspect(bookId);
    requireTask(prepared.taskIntent?.taskIntentId === taskIntentId && prepared.planEnvelope?.digest === planEnvelopeDigest,
      'TASK_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    if (prepared.state === 'authorized') return prepared;
    requireTask(prepared.state === 'prepared', 'TASK_AUTHORIZATION_INVALID', '任务计划尚未准备完成。');
    const authorizationId = randomUUID();
    const runRecordId = randomUUID();
    const instant = new Date().toISOString();
    const authorization = canonicalRecord({
      authorizationId,
      origin: 'standard-direct',
      planEnvelopeDigest,
      taskIntentId,
      authority: 'record-only-no-dispatch',
    });
    const run = canonicalRecord({
      authorizationId,
      dispatched: false,
      runRecordId,
      state: 'recorded-not-dispatched',
      taskIntentId,
    });
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO run_authorizations(
           authorization_id, task_intent_id, plan_envelope_sha256, origin, authorized_at, canonical_json, sha256
         ) VALUES (?, ?, ?, 'standard-direct', ?, ?, ?)`,
      ).run(authorizationId, taskIntentId, planEnvelopeDigest, instant, authorization.json, authorization.digest);
      this.#db.prepare(
        `INSERT INTO run_records(
           run_record_id, task_intent_id, authorization_id, state, dispatched, recorded_at, canonical_json, sha256
         ) VALUES (?, ?, ?, 'recorded-not-dispatched', 0, ?, ?, ?)`,
      ).run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
    });
    return this.inspect(bookId);
  }

  #advance(workId: string): TaskPreparationResult {
    requireTask(UUID_PATTERN.test(workId), 'JOB_INVALID', '任务准备标识无效。');
    const work = this.#work.get(workId);
    requireTask(work !== undefined, 'JOB_NOT_FOUND', '任务准备不存在或已结束。');
    const progress = this.#checkpointOwner.advanceManuscriptCheckpointWork(work.checkpointWorkId);
    if (!progress.done) {
      return { done: false, workId, completed: progress.completed, total: progress.total, projection: null };
    }
    this.#checkpointOwner.finalizeManuscriptCheckpointWork(
      work.checkpointWorkId,
      (checkpoint, purpose) => this.#persistPrepared(work.taskIntentId, checkpoint, purpose, work.launchPolicy),
    );
    this.#work.delete(workId);
    const intent = this.#db.prepare('SELECT book_id FROM task_intents WHERE task_intent_id = ?').get(work.taskIntentId) as SqlRow;
    return { done: true, workId: null, completed: progress.total, total: progress.total, projection: this.inspect(asString(intent.book_id)) };
  }

  #persistPrepared(
    taskIntentId: string,
    checkpoint: ManuscriptCheckpointBinding,
    purpose: CheckpointPurpose,
    launchPolicy: LaunchPolicyProjection,
  ): void {
    requireTask(purpose === CHECKPOINT_PURPOSE, 'TASK_CHECKPOINT_INVALID', '任务输入固定点用途无效。');
    this.#requireDeniedPolicy(launchPolicy);
    const facts = this.#binding(checkpoint.bookId, checkpoint);
    const instant = new Date().toISOString();
    const checkpointRecord = canonicalRecord({
      branchId: checkpoint.branchId,
      createdForDirtyJournal: checkpoint.createdForDirtyJournal,
      journalSequence: checkpoint.journalSequence,
      manuscriptId: checkpoint.manuscriptId,
      purpose,
      revisionDigest: checkpoint.revisionDigest,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      taskIntentId,
    });
    const manuscriptPin = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      revisionId: checkpoint.revisionId,
      revisionDigest: checkpoint.revisionDigest,
      sourceVersionId: facts.sourceVersionId,
      sourceDigest: SAMPLE1_SOURCE_DIGEST,
    } as const;
    const artifactPin = {
      identity: '@ai7/editorial-workspace-profile',
      version: '1.0.0',
      nativeCarrierSha256: NATIVE_CARRIER_DIGEST,
      sidecarIdentity: 'ai7.editorial-workspace-profile.authority',
      sidecarRevision: 2,
      sidecarSha256: SIDECAR_DIGEST,
    } as const;
    const sourceScope = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      taskInputRevision: {
        revisionId: checkpoint.revisionId,
        revisionDigest: checkpoint.revisionDigest,
      },
      readableScopeKinds: ['current-book-primary-manuscript-revision'],
      sourceVersionEvidence: { sourceVersionId: facts.sourceVersionId, readable: false },
    } as const;
    const pin = planProviderProcessingPin(launchPolicy);
    const selected = launchPolicy.selectedPolicyIdentity === undefined ? undefined : selectedPolicyIdentityOf(launchPolicy.selectedPolicyIdentity);
    requireTask(selected !== null && (pin.version !== 'v29' || selected !== undefined), 'TASK_POLICY_UNAVAILABLE', '当前计划缺少已选处理策略身份。');
    const providerPlan = providerResolutionPlanValue(facts.credentialReference, pin, selected);
    const executionPlan = executionPlanValue(pin);
    const records = {
      manuscriptPin: canonicalRecord(manuscriptPin),
      artifactPin: canonicalRecord(artifactPin),
      sourceScope: canonicalRecord(sourceScope),
      providerPlan: canonicalRecord(providerPlan),
      executionPlan: canonicalRecord(executionPlan),
    };
    const envelope = canonicalRecord(planEnvelopeValue(pin, {
      taskIntentId,
      checkpointDigest: checkpointRecord.digest,
      manuscriptPinDigest: records.manuscriptPin.digest,
      artifactPinDigest: records.artifactPin.digest,
      runSourceScopeDigest: records.sourceScope.digest,
      providerResolutionPlanDigest: records.providerPlan.digest,
      executionPlanDigest: records.executionPlan.digest,
    }));
    this.#db.prepare(
      `INSERT INTO task_input_checkpoints(
         task_intent_id, manuscript_id, branch_id, revision_id, revision_label, revision_digest,
         journal_sequence, purpose, created_for_dirty_journal, canonical_json, sha256, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskIntentId, checkpoint.manuscriptId, checkpoint.branchId, checkpoint.revisionId,
      checkpoint.revisionLabel, checkpoint.revisionDigest, checkpoint.journalSequence, purpose,
      checkpoint.createdForDirtyJournal ? 1 : 0, checkpointRecord.json, checkpointRecord.digest, instant);
    const insert = (table: string, record: { json: string; digest: string }): void => {
      this.#db.prepare(
        `INSERT INTO ${table}(task_intent_id, canonical_json, sha256, created_at) VALUES (?, ?, ?, ?)`,
      ).run(taskIntentId, record.json, record.digest, instant);
    };
    insert('task_manuscript_pins', records.manuscriptPin);
    insert('task_artifact_pins', records.artifactPin);
    insert('run_source_scopes', records.sourceScope);
    insert('provider_resolution_plans', records.providerPlan);
    insert('execution_plans', records.executionPlan);
    insert('plan_envelopes', envelope);
  }

  #binding(bookId: string, checkpoint?: ManuscriptCheckpointBinding): {
    manuscriptId: string;
    branchId: string;
    sourceVersionId: string;
    credentialReference: string;
  } {
    requireTask(UUID_PATTERN.test(bookId), 'TASK_BOOK_INVALID', '任务所属图书无效。');
    const row = this.#db.prepare(
      `SELECT m.manuscript_id, mb.branch_id, bws.base_revision_id, bws.journal_sequence, bws.working_digest,
              mr.source_version_id, sv.source_digest,
              connection.credential_reference, connection.credential_operation_state
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN branch_working_state bws ON bws.branch_id = mb.branch_id
       JOIN manuscript_revisions mr ON mr.revision_id = ${checkpoint === undefined ? 'bws.base_revision_id' : '?'}
       JOIN source_versions sv ON sv.source_version_id = mr.source_version_id AND sv.book_id = m.book_id
       JOIN model_service_connections connection ON connection.connection_id = 'main-editorial-deepseek-v4-pro'
       WHERE m.book_id = ? AND m.role = 'primary'`,
    ).get(...(checkpoint === undefined ? [bookId] : [checkpoint.revisionId, bookId])) as SqlRow | undefined;
    requireTask(row !== undefined && row.source_digest === SAMPLE1_SOURCE_DIGEST,
      'TASK_LINEAGE_UNAVAILABLE', '当前图书不是精确 sample1 主稿件血缘。');
    requireTask(row.credential_operation_state === 'missing' && UUID_PATTERN.test(asString(row.credential_reference)),
      'TASK_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的未就绪凭据引用元数据。');
    if (checkpoint !== undefined) {
      requireTask(row.manuscript_id === checkpoint.manuscriptId && row.branch_id === checkpoint.branchId &&
        row.base_revision_id === checkpoint.revisionId && row.journal_sequence === checkpoint.journalSequence &&
        row.working_digest === checkpoint.revisionDigest,
      'TASK_CHECKPOINT_STALE', '任务输入固定点已经变化。');
    }
    return {
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      sourceVersionId: asString(row.source_version_id),
      credentialReference: asString(row.credential_reference),
    };
  }

  #requireDeniedPolicy(policy: LaunchPolicyProjection): void {
    requireTask(policy.integrityState === 'verified' && policy.denialReason === null &&
      policy.operationalScope === 'development-ci' && policy.activePolicySetVersion === ACTIVE_SET_VERSION &&
      policy.providerProcessing.version === 'v1' && policy.providerProcessing.decision === 'deny' &&
      policy.providerProcessing.authorizedLiveTransmissionCount === 0 &&
      policy.providerProcessing.liveTransmissionAllowed === false,
    'TASK_POLICY_UNAVAILABLE', '无法建立可信的 development-ci Provider Processing v1 拒绝记录。');
  }

  #available(bookId: string): TaskAuthorizationProjection {
    return {
      bookId,
      state: 'available',
      taskIntent: null,
      checkpoint: null,
      manuscriptPin: null,
      runSourceScope: null,
      artifactPin: null,
      providerResolutionPlan: null,
      executionPlan: null,
      planEnvelope: null,
      authorization: null,
      runRecord: null,
      actions: { canPrepare: true, canAuthorize: false },
      namedNonEffects: NON_EFFECTS,
    };
  }

  #intentProjection(row: SqlRow): NonNullable<TaskAuthorizationProjection['taskIntent']> {
    return {
      taskIntentId: asString(row.task_intent_id),
      goal: J03_TASK_GOAL,
      expectedOutcome: EXPECTED_OUTCOME,
      createdAt: asString(row.created_at),
    };
  }
}

function validateAuthorizationStartTimes(db: DatabaseSync): void {
  for (const row of db.prepare('SELECT start_when, canonical_json FROM analysis_run_authorizations').all()) {
    const record = parseCanonicalJson(asString(row.canonical_json));
    requireTask(isRecord(record) && (record.startWhen ?? 'now') === row.start_when, 'TASK_RECORD_INVALID', '任务开始时机与授权记录不一致。');
  }
}

/**
 * What every open checks of the task-authorization and analysis ledgers (#1634): every stored canonical row still digests to
 * its recorded SHA-256, the direct-authorization graphs stand, each Run's start time agrees with its authorization, and every
 * reference holds. The relations' shape is `requireBaselineSchema`'s.
 */
export function validateTaskAuthorizationRecords(db: DatabaseSync): void {
  validateStoredCanonicalRows(db);
  validateCanonicalRowDigests(db, ANALYSIS_LEDGER_TABLES);
  requireTask(foreignKeyViolations(db, ANALYSIS_LEDGER_TABLES) === 0, 'TASK_RECORD_INVALID', '分析任务账本引用校验失败。');
  validateAuthorizationStartTimes(db);
}
