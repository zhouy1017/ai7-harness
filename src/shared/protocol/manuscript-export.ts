


// ---- ④ 导出 · DOCX (Issue #413, plan slice S64; editor-surfaces §7 导出, V2-UX-EXP-001 to EXP-024) ------

/**
 * What one Manuscript export carries beyond its text (V2-UX-EXP-023, EXP-024, MARK-006; ADR 0079 §3):
 * 含批注 and 含修改建议（作为修订） are on by default, 含备注 is off by default. An option changes the exported
 * file only, never the manuscript or its marks. Highlights and AI7's basis never leave (hard exclusions).
 */
export interface ManuscriptExportOptions {
  includeAnnotations: boolean;
  includeSuggestions: boolean;
  includeEditorNotes: boolean;
}


export const DEFAULT_MANUSCRIPT_EXPORT_OPTIONS: Readonly<ManuscriptExportOptions> = Object.freeze({
  includeAnnotations: true,
  includeSuggestions: true,
  includeEditorNotes: false,
});


/** DOCX, the primary editable format; PDF, optional and fixed; Markdown, the 备用格式 (Issue #500, S64b). */
export type ManuscriptExportFormat = 'docx' | 'pdf' | 'markdown';


/**
 * What is exported: the current revision (a dirty working state is saved first), one milestone, or one version of
 * a Review Run's 审阅报告 (Issue #500, S64b part 2; ADR 0079 §3.4), which exports in the manuscript's formats.
 */
export type ManuscriptExportTargetInput =
  | { kind: 'current' }
  | { kind: 'milestone'; milestoneId: string }
  | { kind: 'report'; reportId: string }
  // Issue #415 (S66b): one exact version of a Production Document of the route's Book (EXP-024, DELIV-003).
  | { kind: 'document'; documentId: string; revisionId: string };


/**
 * The classes of the Export Fidelity Review (V2-UX-EXP-007): the content classes ADR 0086 retains with the
 * Source Version, the three marks an export may carry, and the file's own revision markup that did not become
 * a mark.
 */
export type ExportFidelityKey =
  | 'inline-styles'
  | 'annotations'
  | 'change-suggestions'
  | 'editor-notes'
  | 'notes'
  | 'tables'
  | 'images-captions'
  | 'sections'
  | 'headers-footers'
  | 'text-boxes'
  | 'fields'
  | 'file-revisions'
  // The four parts of a 审阅报告 (V2-UX-REV-009; Issue #500, S64b part 2).
  | 'report-overview'
  | 'report-must-items'
  | 'report-summaries' | 'report-statistics' | 'report-findings'
  | 'report-appendix'
  // The published DOCX's 审阅说明 and 重点问题 (Issue #1430).
  | 'report-explanation' | 'report-priorities';


/** `excluded`: a mark kind the editor left out of this export — a choice, not a loss. */
export type ExportFidelityStatus = 'preserved' | 'degraded' | 'unavailable' | 'excluded';


export const EXPORT_FIDELITY_STATUS_LABELS = Object.freeze({
  preserved: '完整保留',
  degraded: '降级导出',
  unavailable: '无法导出',
  excluded: '本次不含',
} as const);


export type ExportFidelityStatusLabel = (typeof EXPORT_FIDELITY_STATUS_LABELS)[ExportFidelityStatus];


/** At most this many manuscript positions are named on one row; the count always says how many there are. */
export const MAX_EXPORT_FIDELITY_POSITIONS = 20;


/** One row of the Export Fidelity Review, in the service's own words. */
export interface ExportFidelityRowProjection {
  key: ExportFidelityKey;
  label: string;
  /** How many items of the class the export concerns. */
  count: number;
  status: ExportFidelityStatus;
  statusLabel: ExportFidelityStatusLabel;
  detail: string;
  /** The 1-based manuscript positions where the class is not written as it was, in order. */
  positions: ReadonlyArray<number>;
  positionsTruncated: boolean;
  /**
   * Actual DOCX writer facts, frozen in the existing fidelity record; absent on older exports. The first row also
   * freezes the export's summary line, so a receipt reads the words the review showed.
   */
  retention?: ExportRetentionProjection & { summary?: string };
}


export interface ExportRetentionProjection {
  preserved: ReadonlyArray<string>;
  rebuilt: ReadonlyArray<string>;
  excluded: ReadonlyArray<string>;
}


export interface ExportRetentionDisclosure {
  /** Null for other formats and for historical preparations without writer facts. */
  retention: ExportRetentionProjection | null;
  retentionSummary: string | null;
}


/**
 * The exact version one export is of: the current revision, one Milestone Version and the revision it froze, or one
 * version of a 审阅报告 and the revision its Review Run read.
 */
export interface ManuscriptExportTargetProjection {
  /** `package-manifest` is the service's own target (Issue #416, S67b): a package export's 交付包清单, never the renderer's. */
  kind: 'current' | 'milestone' | 'report' | 'document' | 'package-manifest';
  milestoneId: string | null;
  milestoneLabel: string | null;
  revisionId: string;
  revisionLabel: string;
  /** The report version exported, and the Review Run it reports on; `null` for a manuscript version. */
  report: { reportId: string; version: number; reviewRunId: string; runLabel: string } | null;
  /** The Production Document version exported (Issue #415, S66b): its type and `版本 N`; `null` for any other target. */
  document: { documentId: string; typeId: string; typeLabel: string; versionLabel: string } | null;
  /** The package version whose 交付包清单 is exported (Issue #416, S67b); `null` for any other target. */
  packageVersion: { packageVersionId: string; versionLabel: string } | null;
}


/** One format as the export card offers it: DOCX, the optional PDF, and the Markdown 备用格式 (Issue #500, S64b). */
export interface ManuscriptExportFormatProjection {
  format: ManuscriptExportFormat;
  label: string;
  available: boolean;
  note: string;
  /** Offered only under the secondary `备用格式` disclosure, never beside the recommended format (V2-UX-EXP-005). */
  fallback: boolean;
}


/**
 * The Export Fidelity Review of one exact version under one set of options (V2-UX-EXP-007 to EXP-009), before
 * any destination is chosen. Nothing is recorded by reading it; a current revision whose working state held
 * unsaved edits was first saved as a revision for the export (`savedForExport`).
 */
export interface ManuscriptExportReviewProjection extends ExportRetentionDisclosure {
  bookId: string;
  bookTitle: string;
  target: ManuscriptExportTargetProjection;
  savedForExport: boolean;
  /** The format this review is of (Issue #500, S64b): each format has its own review (EXP-007). */
  format: ManuscriptExportFormat;
  formats: ReadonlyArray<ManuscriptExportFormatProjection>;
  options: ManuscriptExportOptions;
  /** Whether retained content is restored from the original file, or the file is written fresh from the text. */
  restoration: 'from-original' | 'regenerated';
  /** One sentence on how the file is written, in the editor's words. */
  restorationLine: string;
  /** What the format promises, in the editor's words (V2-UX-EXP-009). */
  formatLine: string;
  fidelity: ReadonlyArray<ExportFidelityRowProjection>;
  /** Some class is `降级导出` or `无法导出`: `按上述方式导出` then accepts them for this export (EXP-008). */
  degraded: boolean;
  suggestedFileName: string;
  /** Binds a later preparation to exactly this review. */
  reviewDigest: string;
  technical: { revisionDigest: string; sourceVersionId: string | null; writerIdentity: string; inputDigest: string };
}


/** Whether the chosen file is created or replaces the one the platform's dialog confirmed replacing (EXP-019). */
export type ManuscriptExportDisposition = 'create' | 'replace';


/**
 * One frozen Local Export Preparation (External Export Policy v2 per-file requirements): the exact version,
 * format, options, fidelity, file name, final local path as the system dialog returned it, create-or-replace
 * disposition and payload digest, recorded after the destination was chosen and before any approval.
 */
export interface ManuscriptExportPreparationProjection extends ExportRetentionDisclosure {
  bookId: string;
  preparationId: string;
  target: ManuscriptExportTargetProjection;
  format: ManuscriptExportFormat;
  options: ManuscriptExportOptions;
  fidelity: ReadonlyArray<ExportFidelityRowProjection>;
  degraded: boolean;
  fileName: string;
  /** The path exactly as the system dialog returned it; never a path inside AI7's own data. */
  destination: string;
  disposition: ManuscriptExportDisposition;
  dispositionLabel: string;
  payloadBytes: number;
  preparedAt: string;
  technical: { effectIntentId: string; payloadDigest: string; recordDigest: string; policy: string };
}


/**
 * What one approved export came to (V2-UX-EXP-012, EXP-017, EXP-021): a verified created or replaced file with
 * its Effect Receipt — `已导出到所选位置` — or a classified outcome: `未能导出` when nothing at the destination
 * changed, `结果待确认` when AI7 cannot tell, which never retries by itself.
 */
export interface ManuscriptExportReceiptProjection extends ExportRetentionDisclosure {
  bookId: string;
  preparationId: string;
  target: ManuscriptExportTargetProjection;
  /** The format the receipt binds (V2-UX-EXP-013). */
  format: ManuscriptExportFormat;
  outcome: 'created' | 'replaced' | 'ambiguous' | 'failed';
  outcomeLabel: string;
  detail: string;
  fileName: string;
  destination: string;
  byteLength: number | null;
  recordedAt: string | null;
  /** Whether 在文件夹中显示 can be offered: only for a verified file. */
  revealAvailable: boolean;
  technical: { approvalId: string; receiptId: string | null; receiptDigest: string | null; fileSha256: string | null; failureCode: string | null };
}


/** At most this many exports are listed on 交付物, newest first. */
export const MAX_EXPORT_RECORDS_LISTED = 10;


/**
 * The longest local path an export binds, in UTF-16 code units: above macOS's PATH_MAX and the Windows path
 * the system dialogs return, and small enough that the most 交付物 lists stays within one service frame.
 */
export const MAX_EXPORT_DESTINATION_CODE_UNITS = 1024;


export interface ReviewManuscriptExportInput {
  bookId: string;
  target: ManuscriptExportTargetInput | { kind: 'book-review-report'; reviewRunId?: string };
  options: ManuscriptExportOptions;
  /** Absent reads as DOCX, so a request made before S64b (Issue #500) still means what it meant. */
  format?: ManuscriptExportFormat;
}


/** Freeze one preparation: the main process adds the destination the system dialog returned. */
export interface PrepareManuscriptExportInput {
  bookId: string;
  revisionId: string;
  target: ManuscriptExportTargetInput;
  options: ManuscriptExportOptions;
  reviewDigest: string;
  destination: string;
  format?: ManuscriptExportFormat;
}


/**
 * The main process's step before it approves a PDF (Issue #500, S64b): the service lays out the page the preparation
 * bound, checks it is still exactly that page, and stages it inside AI7's own data for the main process to print — a
 * print needs a Chromium the service does not have. `print` names the page and where the printed file goes; `null`
 * for a format the service writes itself.
 */
export interface StageManuscriptExportInput {
  bookId: string;
  preparationId: string;
}


export interface ManuscriptExportStageProjection {
  format: ManuscriptExportFormat;
  print: null | { pagePath: string; pdfPath: string };
}


export interface ApproveManuscriptExportInput {
  bookId: string;
  preparationId: string;
}


/** The main process's own read of a receipt, to reveal the verified file in the system file manager. */
export interface InspectManuscriptExportReceiptInput {
  bookId: string;
  preparationId: string;
}


/** 选择保存位置… as the renderer asks for it: the exact review it read, and no path. */
export interface ChooseManuscriptExportDestinationInput {
  revisionId: string;
  target: ManuscriptExportTargetInput;
  options: ManuscriptExportOptions;
  reviewDigest: string;
  /** The file name the dialog offers first; the editor may change it there. */
  suggestedFileName: string;
  /** The format the review was of (Issue #500, S64b); absent reads as DOCX. */
  format?: ManuscriptExportFormat;
}


/** The system dialog was cancelled — nothing is recorded (V2-UX-EXP-020) — or a preparation was frozen. */
export type ManuscriptExportDestinationResult =
  | { outcome: 'cancelled' }
  | { outcome: 'prepared'; preparation: ManuscriptExportPreparationProjection };
