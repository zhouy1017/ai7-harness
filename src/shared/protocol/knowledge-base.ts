import type { PreinstalledProcedureProjection } from './procedures.js';
import type { ReadersReportTemplate } from './task-kinds.js';
import type { CapturedProcedureScopeSlot } from './captured-procedures.js';

// ---- 知识库 › 审阅规范文件 (Issue #427, plan slice S79a; V2-UX-KB-001 to KB-003, REV-012) ----------------------------

/** The largest guideline file 导入新版本 reads: a Word document or plain text of numbered clauses. */
export const MAX_REVIEW_GUIDELINE_FILE_BYTES = 2 * 1024 * 1024;

/** The Review Runs a guideline version names, the latest first; the page counts the rest (Issue #427 review). */
export const MAX_GUIDELINE_VERSION_RUNS_SHOWN = 5;

/** The Books 还在用旧版 names, by title; the page counts the rest (Issue #427 review). */
export const MAX_GUIDELINE_OLDER_BOOKS_SHOWN = 10;

/** At most this many versions a document's merged Books were reviewed under and this data never had are named; the rest are counted. */
export const MAX_GUIDELINE_MERGED_VERSIONS_SHOWN = 10;

/** The file one imported version was read from: its name as picked, how it was read, and its exact bytes. */
export interface ReviewGuidelineSourceProjection {
  readonly displayName: string;
  readonly format: 'docx' | 'text';
  readonly sha256: string;
  readonly bytes: number;
}

export interface ReviewGuidelineClauseProjection {
  readonly clauseId: string;
  readonly number: number;
  readonly text: string;
  /** How many findings of the Review Runs that applied this version cite this clause, each finding once. */
  readonly citations: number;
}

export interface ReviewGuidelineVersionProjection {
  readonly ordinal: number;
  readonly issuer: string;
  /** `null` for AI7's built-in first version, which is configuration and never stored. */
  readonly versionId: string | null;
  readonly recordedAt: string | null;
  readonly source: ReviewGuidelineSourceProjection | null;
  readonly clauseCount: number;
  readonly digest: string;
  /**
   * How many Review Runs used exactly this version: a category of the Run that applies the document formed its findings
   * under it. A Run only prepared, refused or failed has used nothing yet.
   */
  readonly usedByCount: number;
  /** The latest of those Runs, newest first, at most `MAX_GUIDELINE_VERSION_RUNS_SHOWN`. */
  readonly usedBy: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly reviewRunId: string; readonly reviewOrdinal: number; readonly createdAt: string }>;
}

/**
 * How the review categories that apply a guideline document read it (Issue #427 review). `clauses`: the Editorial Review
 * Contract hands its numbered clauses to the model, so the house may import its own next version. `leads`: the category
 * turns the baseline analysis's leads into annotations and reads no clause. `factual-kind`: the category runs AI7's own
 * fixed factual-review contract. The last two are AI7's fixed statements of what the category does, never imported.
 */
export type ReviewGuidelineDocumentUse = 'clauses' | 'leads' | 'factual-kind';

/**
 * A version of a guideline document that Books merged here were reviewed under, and this data never had (Issue #434 review;
 * ADR 0079 §1.5): another house's, or another AI7's wording of one. It is the read-only snapshot those Books' Review Runs hold,
 * as they applied it, and never taken for this data's version of the same number.
 */
export interface ReviewGuidelineMergedVersionProjection {
  readonly ordinal: number;
  readonly issuer: string;
  readonly title: string;
  /** Its numbered clauses, as the Runs applied them. */
  readonly clauses: ReadonlyArray<{ readonly number: number; readonly text: string }>;
  readonly clauseCount: number;
  readonly clausePage: number;
  readonly clausePages: number;
  /** What tells it apart: the digest of the document as the Runs hold it. */
  readonly digest: string;
  readonly usedByCount: number;
  /** The latest of the Runs that used it, newest first, at most `MAX_GUIDELINE_VERSION_RUNS_SHOWN`. */
  readonly usedBy: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly reviewRunId: string; readonly reviewOrdinal: number; readonly createdAt: string }>;
}

export interface ReviewGuidelineDocumentProjection {
  readonly documentId: string;
  readonly title: string;
  /** Who issued the version that applies now: `AI7 内置默认`, or `本社` once the house imported its own. */
  readonly issuer: string;
  readonly currentOrdinal: number;
  readonly use: ReviewGuidelineDocumentUse;
  /** The review categories that apply this document. */
  readonly appliedBy: ReadonlyArray<{ readonly categoryId: string; readonly label: string }>;
  /** The clauses of the version that applies now. */
  readonly clauses: ReadonlyArray<ReviewGuidelineClauseProjection>;
  readonly clauseCount: number;
  readonly clausePage: number;
  readonly clausePages: number;
  /** Every version, newest first. */
  readonly versions: ReadonlyArray<ReviewGuidelineVersionProjection>;
  readonly versionCount: number;
  readonly versionsBefore: number | null;
  readonly versionsNext: number | null;
  /** How many Books' latest Review Run that used this document used an older version than the current one. */
  /**
   * The versions merged Books were reviewed under that this data never had, highest number first, at most
   * `MAX_GUIDELINE_MERGED_VERSIONS_SHOWN` (Issue #434 review).
   */
  readonly mergedVersions: ReadonlyArray<ReviewGuidelineMergedVersionProjection>;
  readonly mergedVersionCount: number;
  readonly mergedVersionsBefore: ReviewGuidelineMergedCursor | null;
  readonly mergedVersionsNext: ReviewGuidelineMergedCursor | null;
  /**
   * How many Books' latest Review Run that used this document used an older version than the current one, or a version that
   * came with the Book when it was merged here.
   */
  readonly olderVersionBookCount: number;
  /** Those Books by title, at most `MAX_GUIDELINE_OLDER_BOOKS_SHOWN`; `merged` when the version came with the Book. */
  readonly olderVersionBooks: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly ordinal: number; readonly merged: boolean }>;
}

export interface ReviewGuidelinesProjection {
  readonly documents: ReadonlyArray<ReviewGuidelineDocumentProjection>;
}

export interface ReviewGuidelinesPage {
  readonly documentId: string;
  readonly versionsBefore?: number | null;
  readonly clausePage?: number;
  readonly mergedVersionsBefore?: ReviewGuidelineMergedCursor | null;
  readonly mergedClause?: { readonly digest: string; readonly page: number };
}

export interface ReviewGuidelineMergedCursor {
  readonly ordinal: number;
  readonly digest: string;
}

/** 导入新版本 before it is confirmed: the clauses the file holds, as the document's next version would read them. */
export interface ReviewGuidelinePreviewProjection {
  readonly previewId: string;
  readonly documentId: string;
  readonly title: string;
  /** The version the file would become. */
  readonly ordinal: number;
  readonly currentOrdinal: number;
  readonly source: ReviewGuidelineSourceProjection;
  readonly clauses: ReadonlyArray<{ readonly clauseId: string; readonly number: number; readonly text: string }>;
  readonly clauseCount: number;
  readonly clausePage: number;
  readonly clausePages: number;
  /** How the clauses differ from the current version's, by number. */
  readonly changes: { readonly changed: number; readonly added: number; readonly removed: number };
}

// ---- 知识库 › 范例 (Issue #427, plan slice S79b; V2-UX-KB-004, KB-006) --------------------------------------------------

/** The published Books one answer of 范例 carries, by title; `更多已出版的书…` reads the next (Issue #427 review). */
export const MAX_EXEMPLAR_BOOKS_PAGE = 20;

/** The earlier delivered versions an exemplar names, the latest of them; the rest are counted. */
export const MAX_EXEMPLAR_EARLIER_VERSIONS = 10;

/** Where the next page of 范例 starts: after this Book, in title order as 书库 pages. */
export interface ExemplarBookCursor {
  readonly title: string;
  readonly bookId: string;
}

/** 导入以前图书的范例 (Issue #427): the chosen file as it will arrive, read and kept nowhere yet. */
export interface ImportedExemplarPreview {
  readonly previewId: string;
  readonly displayName: string;
  readonly format: 'DOCX' | 'TXT' | 'MD';
  readonly sha256: string;
  readonly bytes: number;
  readonly excerpt: string;
  readonly types: ReadonlyArray<{ readonly typeId: string; readonly label: string }>;
}

export interface ImportedExemplarInput {
  readonly previewId: string;
  readonly bookId: string | null;
  readonly bookTitle: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  readonly typeId: string;
  readonly expectedVersion: number;
}

export interface ImportedExemplarDecisionInput {
  readonly revisionId: string;
  readonly revisionDigest: string;
  readonly expectedDecisions: number;
  readonly choice: 'house' | 'excluded' | 'deferred';
}

/** One exemplar: the version of one delivered document of a published Book that stands in 范例. */
export interface ExemplarProjection {
  readonly documentId: string;
  readonly typeId: string;
  readonly typeLabel: string;
  /** The document version its latest Delivery Record named. */
  readonly version: number;
  readonly revisionId: string;
  readonly revisionDigest: string;
  readonly deliveredTo: string;
  readonly deliveredAt: string;
  /**
   * When it came into 范例: its delivery, made while a 发稿版本 stood in AI7; or, for one delivered before the first
   * designation or after a 撤回, the next designation.
   */
  readonly archivedAt: string;
  /** How many other versions of the document came into 范例 before this one. */
  readonly earlierVersionCount: number;
  /** The latest of them, oldest first, at most `MAX_EXEMPLAR_EARLIER_VERSIONS`. */
  readonly earlierVersions: ReadonlyArray<number>;
  /** The Learning Eligibility it came in with: `仅本社`, the default, asked of no one. */
  readonly eligibility: 'house-only' | 'excluded' | 'deferred';
  readonly imported?: { readonly decisions: number; readonly sourceName: string };
}

/** A published Book in 范例: who it is attributed to, its latest 发稿版本, and its exemplars by document type. */
export interface ExemplarBookProjection {
  readonly imported?: true;
  readonly bookId: string;
  readonly bookTitle: string;
  /** As the Book's 人员 read now. */
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  /** Its latest designation: which one, and when. */
  readonly publicationOrdinal: number;
  readonly designatedAt: string;
  /**
   * Whether a 撤回 holds that designation (ADR 0040): in AI7 it is no longer used for 发稿, so what the Book delivers
   * after it comes in only once another 发稿版本 is set. What came in before stays.
   */
  readonly withdrawn: boolean;
  readonly exemplars: ReadonlyArray<ExemplarProjection>;
  /**
   * The (imported) 范例 of this Book whose records no longer read, each named by Book and document type as 写作任务 names them
   * (Issue #799, #800): they are skipped while the rest of the Book stays listed. Absent when nothing was skipped.
   */
  readonly skipped?: ReadonlyArray<string>;
  /** The Book's 审稿意见 as 范例 offers them (Issue #429; KB-006): one per template with a draft, the version 图书交付包 pins. */
  readonly readersReports: ReadonlyArray<ReadersReportExemplarProjection>;
}

/**
 * One 审稿意见 of a Book with a 发稿版本 (Issue #429, S81c remainder; KB-006): the version pinned exactly as 图书交付包 pins it —
 * the latest saved when the 发稿版本 was designated, or, for a draft that came after it, the latest saved now — offered into
 * 范例 under 仅本社, and admitted only by the editor (`admitReadersReportExemplar`).
 */
export interface ReadersReportExemplarProjection {
  readonly template: ReadersReportTemplate;
  readonly typeId: string;
  readonly typeLabel: string;
  readonly documentId: string;
  readonly version: number;
  readonly revisionId: string;
  readonly revisionDigest: string;
  readonly savedAt: string;
  /** `designation`: the latest version saved by the designation; `later`: the draft came after it, so its latest version. */
  readonly pin: 'designation' | 'later';
  readonly eligibility: 'house-only';
  /**
   * Where the editor's admission stands: `offered` while none was made, `admitted` when this exact version was, `superseded`
   * when an earlier version of this 审稿意见 was admitted and this one is offered anew. `decisions` counts the admissions made.
   */
  readonly admission: { readonly state: 'offered' | 'admitted' | 'superseded'; readonly admittedAt: string | null; readonly decisions: number };
}

/** 归入范例 of one 审稿意见 (Issue #429): the Book, the template, the exact version seen, and how many admissions the editor saw. */
export interface AdmitReadersReportExemplarInput {
  readonly bookId: string;
  readonly template: ReadersReportTemplate;
  readonly revisionDigest: string;
  readonly expectedDecisions: number;
}

export interface ExemplarsProjection {
  readonly books: ReadonlyArray<ExemplarBookProjection>;
  /** Where the next page starts; `null` when this is the last. */
  readonly nextCursor: ExemplarBookCursor | null;
}

// ---- 知识库 › 工序与规则's expert 工序 (Issue #427, plan slice S79d; V2-UX-KB-010, REUSE-029, REUSE-030) ---------------

/**
 * A native artifact AI7 carries, in the house's words (editor-surfaces §10; REUSE-030): the 编辑工作区方案 with its AI7 权限侧车
 * reads 本社方案 vN, in its lifecycle as the Book card reads it. Its identities are the Technical Identity Layer's (ADR 0071
 * §1, LAYER-001), for 查看技术详情 only.
 */
export interface KnowledgeArtifactProjection {
  /** The house's word for it: 本社方案. */
  readonly title: string;
  /** The newest AI7 权限侧车 revision the installed 方案 offers — the N of 本社方案 vN; `null` before it is installed. */
  readonly revision: number | null;
  readonly state: 'available-to-install' | 'installed' | 'unavailable-needs-attention';
  readonly enabledBooks: number;
  readonly technical: {
    readonly artifactId: string;
    readonly version: string;
    readonly sha256: string;
    readonly sidecarId: string;
    readonly sidecarSha256: string | null;
  };
}

export interface KnowledgeProceduresProjection {
  /** The pre-installed procedure library (Issue #1081, F-26a; ADR 0095 §1), in the configuration's order, baseline last. */
  readonly preinstalled: ReadonlyArray<PreinstalledProcedureProjection>;
  readonly artifacts: ReadonlyArray<KnowledgeArtifactProjection>;
}

// ADR 0045 / ADR 0090: foreign Skills are retained as inert, inspectable documents, never executors.
export type ImportedSkillState = 'pending-validation' | 'validated' | 'restricted' | 'rejected' | 'installed-disabled' | 'enabled';

export interface ImportedSkillFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly base64: string;
}

export interface SkillConversionReport {
  readonly preserved: readonly string[];
  readonly mapped: readonly string[];
  readonly reviewRequired: readonly string[];
  readonly unsupported: readonly string[];
}

export interface ImportedSkillCeiling {
  readonly requestedCapabilities: readonly string[];
  readonly executor: false;
  readonly runSourceScope: 'none';
  readonly provider: false;
  readonly effect: false;
  readonly credentials: false;
  readonly network: false;
  readonly backgroundAnalysis: false;
  readonly apply: false;
}

export interface ImportedSkillSummary {
  readonly skillId: string;
  readonly revisionId: string;
  readonly ordinal: number;
  readonly name: string;
  readonly sourceRevision: string;
  readonly kind: 'DSH Skill';
  readonly state: ImportedSkillState;
  readonly stateLabel: string;
}

export type ImportedSkillSelectionReason = 'import' | 'adopt' | 'rule' | 'rollback';

export interface ImportedSkillRevisionProjection extends ImportedSkillSummary {
  readonly snapshotId: string;
  readonly previousRevisionId: string | null;
  readonly sourcePath: string;
  readonly snapshotSha256: string;
  readonly workingSha256: string;
  readonly files: readonly ImportedSkillFile[];
  readonly workingFiles: readonly ImportedSkillFile[];
  readonly license: string | null;
  readonly notices: readonly string[];
  readonly conversion: SkillConversionReport;
  readonly reasons: readonly string[];
  readonly enabledBooks: readonly string[];
  readonly ceiling: ImportedSkillCeiling;
  /** Exact revision + conversion + ceiling + state, shown before separate explicit installation/enablement. */
  readonly previewDigest: string;
  readonly createdAt: string;
}

/** One revision in a Skill's history: newest first, the current one marked, and how each came about. */
export interface ImportedSkillHistoryEntry {
  readonly revisionId: string;
  readonly ordinal: number;
  readonly state: ImportedSkillState;
  readonly stateLabel: string;
  readonly sourceRevision: string;
  readonly previousRevisionId: string | null;
  readonly createdAt: string;
  readonly current: boolean;
  readonly origin: 'import' | 'adopt' | 'rule';
  /** Why the current revision is current; `null` on every other entry. */
  readonly selectedReason: ImportedSkillSelectionReason | null;
}

export type ImportedSkillUpdateDisposition = 'clean' | 'conflict' | 'validator-failed' | 'authority-change';

export type ImportedSkillUpdateFileChange = 'unchanged' | 'upstream' | 'local' | 'conflict';

export interface ImportedSkillUpdateFileReport {
  readonly path: string;
  readonly change: ImportedSkillUpdateFileChange;
  readonly priorSha256: string | null;
  readonly workingSha256: string | null;
  readonly incomingSha256: string | null;
}

/** One update candidate in the Skill's list: inert until the editor adopts it, or the rule does a clean one (REUSE-032, REUSE-034). */
export interface ImportedSkillUpdateCandidateSummary {
  readonly candidateId: string;
  readonly skillId: string;
  readonly disposition: ImportedSkillUpdateDisposition;
  readonly status: 'open' | 'adopted' | 'dismissed';
  /** An open candidate whose base is no longer the Skill's current revision cannot be adopted; the update is checked again. */
  readonly stale: boolean;
  readonly adoptedBy: 'editor' | 'rule' | null;
  readonly adoptedRevisionId: string | null;
  readonly incomingName: string;
  readonly incomingSourceRevision: string;
  readonly createdAt: string;
}

/** The three-way reconciliation behind a candidate: the prior Source Skill Snapshot, the working revision and the incoming snapshot. */
export interface ImportedSkillUpdateCandidateProjection extends ImportedSkillUpdateCandidateSummary {
  readonly prior: { readonly snapshotId: string; readonly sha256: string; readonly sourceRevision: string };
  readonly working: { readonly revisionId: string; readonly ordinal: number; readonly sha256: string };
  readonly incoming: { readonly snapshotId: string; readonly sha256: string; readonly sourcePath: string };
  readonly files: readonly ImportedSkillUpdateFileReport[];
  readonly validator: { readonly state: 'validated' | 'restricted' | 'rejected'; readonly reasons: readonly string[] };
  readonly authorityChanges: readonly string[];
  readonly conflicts: readonly string[];
  /** Every item an explicit adoption of a candidate that is not clean names: validator reasons, authority changes and conflicting files. */
  readonly acceptItems: readonly string[];
  readonly reviewDigest: string;
}

export interface ImportedSkillUpdateRuleProjection {
  readonly active: boolean;
  readonly ruleId: string | null;
  /** The sentence the editor confirms to create the rule. */
  readonly confirmation: string;
  readonly since: string | null;
  readonly history: ReadonlyArray<{ readonly action: 'create' | 'revoke'; readonly recordedAt: string }>;
}

export interface ImportedSkillsProjection {
  readonly skills: readonly ImportedSkillSummary[];
  readonly nextBefore: string | null;
  readonly revision: ImportedSkillRevisionProjection | null;
  /** Of the Skill `revision` belongs to (empty/`null` when none is selected): its revisions, update candidates and update rule. */
  readonly history: readonly ImportedSkillHistoryEntry[];
  readonly candidates: readonly ImportedSkillUpdateCandidateSummary[];
  readonly rule: ImportedSkillUpdateRuleProjection | null;
}

/**
 * What acquisition discloses before anything is kept (ADR 0090 §2; REUSE-021): exact identity, kind, source revision, provenance,
 * license and notices, content digest and the conversion it would keep. Nothing of it is written until the editor keeps it.
 */
export interface ImportedSkillAcquisitionProjection {
  /** The disclosed package, held in the service's memory only until it is kept or dropped. */
  readonly acquisitionId: string;
  readonly name: string;
  readonly sourceRevision: string;
  readonly kind: 'DSH Skill';
  readonly sourcePath: string;
  readonly contentSha256: string;
  readonly license: string | null;
  readonly notices: readonly string[];
  readonly files: readonly Omit<ImportedSkillFile, 'base64'>[];
  readonly conversion: SkillConversionReport;
  readonly ceiling: ImportedSkillCeiling;
  readonly problems: readonly string[];
  /** A package without a SKILL.md is not a Skill: it is disclosed and never kept. */
  readonly keepable: boolean;
  /** The working revision already holding exactly this content, when it was kept before: keeping it again adds nothing. */
  readonly keptRevisionId: string | null;
}

/** 导入 Skill…: the disclosure, and the kept working revision once the editor keeps it (`null` until then). */
export interface ImportedSkillImportProjection {
  readonly acquisition: ImportedSkillAcquisitionProjection;
  readonly revision: ImportedSkillRevisionProjection | null;
}

/**
 * 检查更新（从文件）…: the disclosure of one local package for a Skill already kept, and — once the editor keeps it — the inert
 * candidate it became. The package is the same kind 导入 Skill… takes; nothing is read from any Book and nothing is fetched.
 */
export interface ImportedSkillUpdateCheckProjection {
  readonly skillId: string;
  readonly acquisition: ImportedSkillAcquisitionProjection;
  /** Newer than what the Skill is on, the very version it was kept from, or one already in its history (which 回到此版本 returns to). */
  readonly relation: 'newer' | 'same-as-current' | 'already-kept';
  readonly candidate: ImportedSkillUpdateCandidateProjection | null;
}

export interface ProcedureRecommendationInput {
  readonly bookId: string;
  readonly goal: string;
  readonly taskKind: 'review-run' | 'baseline-analysis' | 'writing' | 'unclassified';
  readonly scope: CapturedProcedureScopeSlot;
  readonly categoryIds: readonly string[];
}

export interface ProcedureRecommendationCandidate {
  readonly procedureId: string;
  readonly versionId: string;
  readonly version: number;
  readonly documentSha256: string;
  readonly purpose: string;
  readonly kind: '可复用工序' | '预装工序' | '本社工序';
  readonly fit: 'all' | 'partial';
  readonly rationale: readonly string[];
  readonly requiredInputs: readonly string[];
  readonly expectedOutcome: string;
  readonly proposalClasses: readonly string[];
  readonly effectClasses: readonly string[];
}

export interface ProcedureRecommendationProjection {
  readonly intentDigest: string;
  readonly status: 'clear' | 'ambiguous' | 'none';
  readonly candidates: readonly ProcedureRecommendationCandidate[];
  readonly selectedVersionId: null;
  readonly note: string;
  readonly excludedSkillReason: string;
}
