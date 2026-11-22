/** Semantic identity pinned beside the digest of the immutable prompt bytes. */
export interface ReviewContractIdentity {
  readonly contractId: 'ai7.editorial-review';
  readonly version: 1 | 2;
  readonly digest: string;
  readonly categoryConfiguration?: { readonly version: string; readonly digest: string };
}

export type ReviewContractRejectionReason = 'contract-schema-invalid' | 'contract-quote-not-in-block' |
  'contract-replacement-required' | 'contract-replacement-refused' | 'contract-clause-unknown';

/** Read-only excluded entry; no Editorial Mark or action identity is exposed. */
export interface ReviewExcludedFindingProjection {
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly unitOrdinal: number;
  readonly text: string;
  readonly textPart?: { readonly index: number; readonly total: number };
  readonly reasonCode: string;
  readonly reasonLabel: string;
}

/**
 * One source attached to a factual finding, as its card and the 审阅报告 list it (ADR 0095 §5; Issue #1174): the factual
 * result's own source cards less the ones the editor excluded, each joined by `evidenceId` to the retained row 来源与证据
 * archives. A candidate is never quoted (EVID-004), so `snippet` is only an exact excerpt.
 */
export interface ReviewEvidenceSource {
  readonly name: string;
  /** The address as text (the renderer never navigates); `null` for an in-Book source. */
  readonly url: string | null;
  readonly snippet: string | null;
  /** The retained source's 来源译文, when one was made. */
  readonly translation: string | null;
  /** How the verification reads it: its check state and relation, as the Evidence Workspace names them. */
  readonly note: string;
  /** The retained 来源与证据 row; `null` when nothing was retained for it. */
  readonly evidenceId: string | null;
}

export type ReviewReportSchema = 'ai7.review.report/1' | 'ai7.review.report/2';

type FindingCounts = import('../protocol.js').ReviewFindingCountsProjection;

/** What `ai7.review.report/2` adds to the four parts of /1; absent on a /1 record, which reads and exports as it was. */
export interface ReviewReportDerivedSections {
  /** The manuscript the report was made over (Issue #1430): its chapters and characters, for 「正文约 X 万字，共 N 章」. */
  readonly manuscriptExtent?: { readonly chapterCount: number; readonly characterCount: number };
  /** A Book's report (Issue #1430, 导出审阅报告（DOCX）): the authorized Runs whose findings it lists, each mark once. */
  readonly compilation?: { readonly runCount: number };
  /** Every finding of the Run by severity and status, each counted once in both. */
  readonly totals?: FindingCounts;
  /** Findings per chapter (by position, never heading words) and category; each finding counts in its own category. */
  readonly statistics?: {
    readonly title: '章节与类别统计';
    readonly categories: ReadonlyArray<{ readonly categoryId: string; readonly label: string }>;
    readonly rows: ReadonlyArray<{ readonly label: string; readonly counts: ReadonlyArray<number>; readonly total: number }>;
    readonly totals: ReadonlyArray<number>;
    readonly total: number;
  };
  /** Each finding once: the same quote at the same place across categories is one row naming every category. */
  readonly findings?: {
    readonly title: '发现详单';
    readonly entries: ReadonlyArray<ReviewReportFindingEntry>;
    /** Rows left out to keep the record within its byte bound; the cards in 审阅 still hold every one. */
    readonly omitted: number;
  };
}

/**
 * One 发现详单 row. The optional fields (Issue #1430) are what the published DOCX lays out — 问题 001, its category, its
 * chapter and 段落, 问题简述 / 问题所对应的原文 / 建议修改后的文本 / 修改建议的原因与理由 and 引用来源; a row recorded
 * before them exports from the fields below.
 */
export interface ReviewReportFindingEntry {
  readonly index?: string;
  readonly categoryKey?: import('../editorial-mark-category.js').EditorialMarkCategoryKey;
  readonly categoryLabel?: string;
  readonly chapterTitle?: string;
  readonly chapterOrder?: number;
  /** The block's place counted from its chapter's heading, 「段落 N」; `null` when the text is no longer in the manuscript. */
  readonly paragraphOrdinal?: number | null;
  readonly priority?: 'must' | 'should' | 'consider';
  readonly summary?: string;
  /** The finding's quote verbatim, never shortened. */
  readonly originalText?: string;
  /** The finding's note; a factual finding with a recorded conclusion opens with 【核查结论：…】. */
  readonly rationale?: string;
  readonly citations?: ReadonlyArray<{ readonly urlOrSource: string; readonly snippet: string | null; readonly translation?: string | null; readonly explanation?: string }>;
  readonly findingIds: ReadonlyArray<string>;
  readonly categoryLabels: ReadonlyArray<string>;
  readonly severityLabel: string;
  readonly statusLabel: string;
  readonly chapterLabel: string;
  readonly locationLabel: string;
  readonly quote: string;
  readonly suggestedText: string | null;
  readonly reason: string;
  readonly sources: ReadonlyArray<ReviewEvidenceSource>;
}

export const BOOK_FINDINGS_PAGE_SIZE = 40;

export interface BookFindingsFilters {
  category?: string;
  severity?: string;
  status?: string;
}

export interface InspectBookFindingsInput {
  offset?: number;
  since?: string;
  filters?: BookFindingsFilters;
  whole?: boolean;
}

export interface InspectBookFindingsServiceInput extends InspectBookFindingsInput { bookId: string }

export interface BookFindingPlace {
  manuscriptId: string;
  branchId: string;
  reviewRunId: string;
  ordinal: number;
  blockId: string;
  /** Only a mark that still stands (open, resolved or applied). */
  markId: string | null;
  blockExists: boolean;
}

export type BookFindingDecision = {
  kind: 'ignore';
  input: import('./review-runs.js').RecordReviewFindingDispositionInput;
} | {
  kind: 'reject';
  /** Add a fresh clientDecisionId at the press, as on the review card. */
  input: Omit<import('./editorial-marks.js').RecordChangeSuggestionDecisionInput, 'clientDecisionId'> & { disposition: 'rejected'; editedText: null; reason: null };
};

export interface BookFindingProjection {
  /** Present on review rows only; gap and risk targets keep their existing meaning. */
  place?: BookFindingPlace;
  decision?: BookFindingDecision | null;
  /** Exact open suggestion offered by the owning review; Apply still revalidates this binding. */
  suggestion?: { manuscriptId: string; branchId: string; markId: string; blockId: string; batchAllowed: boolean; quote: string; replacement: string };
  id: string;
  category: string;
  categoryLabel: string;
  severity: string;
  status: string;
  summary: string;
  target:
    | { kind: 'gap'; revisionId: string; unitOrdinal: number; blockId: string | null }
    | { kind: 'review'; reviewRunId: string; findingId: string; blockId: string }
    | { kind: 'risk'; recordId: string; riskId: string; revisionId: string };
}

export interface BookFindingsProjection {
  bookId: string;
  total: number;
  offset: number;
  next: number | null;
  pageSize: typeof BOOK_FINDINGS_PAGE_SIZE;
  groups: ReadonlyArray<{ category: string; label: string; count: number; bySeverity: Readonly<Record<string, number>>; byStatus: Readonly<Record<string, number>> }>;
  items: ReadonlyArray<BookFindingProjection>;
}

/** Every service answer carries these, including offset-only reads used by the existing page. */
export interface BookFindingsReadProjection extends BookFindingsProjection {
  version: string;
  /** Keep the displayed list and send the returned version on the next poll; items is empty. */
  unchanged: boolean;
  batch: { count: number; sentence: string | null };
}
