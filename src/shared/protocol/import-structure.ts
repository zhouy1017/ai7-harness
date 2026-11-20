import type { EditorialMarkKind, FidelityCategoryProjection, ImportDegradationDecisionReviewProjection, StagedImportProjection } from '../protocol.js';
/**
 * Candidate structure and long paragraphs in the import fidelity review (protocol 183; Issue #1205, ADR 0096 §2).
 *
 * A file whose reading made no heading is offered the headings deterministic text rules recognise, none of them preselected;
 * the editor confirms some, sets their levels, or confirms none. A paragraph over the block bound was split when it was read:
 * at its soft line breaks, which the review only discloses, and otherwise at the bound, where the review asks one question for
 * the whole file — split those paragraphs at sentence ends, or keep them as several blocks. Every split names its source
 * paragraph: 「第N段 来自原文第K段（共M段）」.
 */
export type ImportHeadingRule = 'numbered' | 'contents' | 'short-line';

export interface ImportHeadingCandidateProjection {
  /** The staged block's position, which is also its position in the imported manuscript. */
  position: number;
  /** The candidate line, at most 40 characters and an ellipsis. */
  excerpt: string;
  rule: ImportHeadingRule;
  /** 1 to 6. */
  suggestedLevel: number;
}

/** How the paragraphs cut at the bound enter the manuscript: split at sentence ends, or as the cuts stand. */
export type LongParagraphMethod = 'sentences' | 'blocks';

export interface ImportSplitParagraphProjection {
  /** 原文第K段: the paragraph's place among the file's body paragraphs with text. */
  sourceOrdinal: number;
  /** The position of the first block the paragraph becomes. */
  firstPosition: number;
  /** How many blocks it becomes: with the review's choice once it is made, as cut at the bound until then. */
  pieceCount: number;
  /** For a paragraph cut at the bound: how many blocks it becomes split at sentence ends, and kept as cut. */
  choice?: { sentences: number; blocks: number };
  excerpt: string;
}

export interface ImportStructureProjection {
  headings: ReadonlyArray<ImportHeadingCandidateProjection>;
  /** True when the rules found more candidates than the review lists. */
  headingsTruncated: boolean;
  /** Paragraphs split at their soft line breaks, which needs no choice. */
  softBreakSplits: ReadonlyArray<ImportSplitParagraphProjection>;
  /** Paragraphs cut at the bound: the review cannot be formed until `longParagraphs` is chosen. */
  longParagraphs: ReadonlyArray<ImportSplitParagraphProjection>;
}

export interface ImportStructureChoice {
  /** The confirmed candidates with their levels, in position order; empty keeps every candidate a paragraph. */
  headings: ReadonlyArray<{ position: number; level: number }>;
  /** Required exactly when the staged structure lists long paragraphs. */
  longParagraphs: LongParagraphMethod | null;
}

/** The wire shape of a structure choice: at most the candidates a review lists, each at a level from 1 to 6. */
export function validStructureChoice(value: unknown): value is ImportStructureChoice {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return keys.length === 2 && keys[0] === 'headings' && keys[1] === 'longParagraphs' &&
    (record.longParagraphs === null || record.longParagraphs === 'sentences' || record.longParagraphs === 'blocks') &&
    Array.isArray(record.headings) && record.headings.length <= 1_000 && record.headings.every((heading: unknown) =>
      heading !== null && typeof heading === 'object' && !Array.isArray(heading) && Object.keys(heading).length === 2 &&
      Number.isSafeInteger((heading as { position?: unknown }).position) && (heading as { position: number }).position > 0 &&
      Number.isSafeInteger((heading as { level?: unknown }).level) && (heading as { level: number }).level >= 1 &&
      (heading as { level: number }).level <= 6);
}



/** At most this many rows and unfollowed marks a Manuscript Reimport Record lists; its counts say how many there were. */
export const MAX_REIMPORT_RECORD_ITEMS = 50;


/** The verb that resolved one row of a chapter-level Reimport Comparison (Issue #412, S63; V2-UX-IMP-057). */
export type ReimportGroupVerb = 'split' | 'rewrite' | 'delete' | 'merge';


export const REIMPORT_GROUP_VERB_LABELS: Readonly<Record<ReimportGroupVerb, '拆分' | '改写与新增' | '删除' | '并入'>> = Object.freeze({
  split: '拆分',
  rewrite: '改写与新增',
  delete: '删除',
  merge: '并入',
});


export interface ReimportRecordGroupProjection {
  ordinal: number;
  verb: ReimportGroupVerb;
  verbLabel: string;
  chapterLabel: string | null;
  currentFrom: number | null;
  currentTo: number | null;
  stagedFrom: number | null;
  stagedTo: number | null;
}


/** One editorial mark that could not follow the new file: set aside from the text, kept, and listed for the editor. */
export interface ReimportUnfollowedMarkProjection {
  markId: string;
  kind: EditorialMarkKind;
  /** The words the mark was on, as it recorded them. */
  words: string;
  /** Where it stood in the revision the reimport replaced, 1-based. */
  fromPosition: number;
}


export interface ReimportMappingProjection {
  mappingId: string;
  position: number;
  changeKind: 'unchanged' | 'move' | 'edit' | 'insert' | 'delete';
  currentBlockId: string | null;
  lineageBlockId: string | null;
  stagedBlockId: string | null;
  currentText: string | null;
  lineageText: string | null;
  stagedText: string | null;
  state: 'resolved' | 'unresolved';
  identityConsequence: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity' | null;
  resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity' | null;
  resolvedCurrentBlockId: string | null;
}


export interface ReviewBeforeManuscriptReimportProjection {
  draftId: string;
  draftVersion: number;
  reviewDigest: string;
  commitAttemptId: string | null;
  target: {
    kind: 'existing-book';
    bookId: string;
    stableIdentity: string;
    label: string;
    internalNumber: string | null;
    manuscriptId: string;
    branchId: string;
    relationship: 'reimport';
    relationshipLabel: '重新导入主稿件';
    bookStateDigest: string;
  };
  checkpoint: {
    revisionId: string;
    revisionLabel: string;
    revisionDigest: string;
    journalSequence: number;
    createdForDirtyJournal: boolean;
  };
  lineage:
    | {
        status: 'verified';
        label: '来源关系已确认';
        comparisonKind: 'three-way';
        sourceVersionId: string;
        revisionId: string;
      }
    | {
        status: 'unconfirmed';
        label: '来源关系未确认';
        comparisonKind: 'two-way';
        sourceVersionId: null;
        revisionId: null;
      };
  source: StagedImportProjection['source'];
  sourceVersionResult:
    | { disposition: 'created'; label: '创建所选图书拥有的新来源版本'; sourceVersionId: null }
    | { disposition: 'reused-same-book'; label: '复用已明确选择的同图书来源版本'; sourceVersionId: string };
  comparison: {
    comparisonDigest: string;
    totalMappings: number;
    unresolvedMappings: number;
    changed: boolean;
    resultPreviewLabel: '稿件将重新导入' | '未发现稿件变化';
    /** The chapter-level rows (Issue #412, S63): how many, how many the editor has still to resolve, and how many paragraphs matched exactly. */
    groups: number;
    unresolvedGroups: number;
    exactBlocks: number;
  };
  fidelity: ReadonlyArray<FidelityCategoryProjection>;
  degradationDecision: ImportDegradationDecisionReviewProjection;
  commitReady: boolean;
  recordsToCreate: ReadonlyArray<string>;
  namedNonEffects: ReadonlyArray<string>;
}


/**
 * One row of the chapter-level Reimport Comparison (Issue #412, plan slice S63; V2-UX-IMP-041, IMP-057): a run of
 * changed paragraphs between two that match exactly — what the current revision has there and what the new file has —
 * with the verbs its shape admits and the one chosen, or none yet. A side shows its first paragraphs, each cut to
 * `MAX_REIMPORT_EXCERPT_GRAPHEMES`, and says how many more there are.
 */
export interface ReimportGroupProjection {
  groupId: string;
  ordinal: number;
  /** The heading the row stands under; `null` in a manuscript without headings. */
  chapterLabel: string | null;
  current: ReimportGroupSideProjection;
  staged: ReimportGroupSideProjection;
  verbs: ReadonlyArray<ReimportGroupVerb>;
  verb: ReimportGroupVerb | null;
}


export interface ReimportGroupSideProjection {
  count: number;
  from: number | null;
  to: number | null;
  excerpts: ReadonlyArray<{ position: number; text: string; truncated: boolean }>;
}


/** At most this many paragraphs a row shows on each side, each cut to this many graphemes. */
export const MAX_REIMPORT_EXCERPTS_PER_SIDE = 3;


export const MAX_REIMPORT_EXCERPT_GRAPHEMES = 400;


export interface ReimportMappingPageProjection {
  draftId: string;
  draftVersion: number;
  reviewDigest: string;
  items: ReadonlyArray<ReimportGroupProjection>;
  /** The group ordinal before the page, and after it. */
  previousCursor: number | null;
  nextCursor: number | null;
}


export interface ReimportLineageSourceVersionPageProjection {
  bookId: string;
  after: string | null;
  items: ReadonlyArray<string>;
  previousCursor: string | null;
  nextCursor: string | null;
}
