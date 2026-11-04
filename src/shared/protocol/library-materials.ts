import type { ModelTextAttemptProvenance } from '../protocol.js';

// ---- 知识库 › 资料库 (Issue #427, plan slice S79c; V2-UX-KB-007, KB-002, ATTN-009, LEARN-004 to LEARN-010) --------------

/** The largest file 资料库 takes in, and the bounds of what the editor writes about one. */
export const MAX_LIBRARY_MATERIAL_BYTES = 1024 * 1024 * 1024;

export const MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES = 200;

export const MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES = 500;

/** The items one answer of 资料库 carries, newest first; `更多资料…` reads the next (Issue #427 review). */
export const MAX_LIBRARY_MATERIALS_PAGE = 20;

/** The decisions an item's card names, the latest of them; the rest are counted. */
export const MAX_LIBRARY_MATERIAL_DECISIONS_SHOWN = 10;

/** Where the next page of 资料库 starts: after this item, newest first. */
export interface LibraryMaterialCursor {
  readonly recordedAt: string;
  readonly materialId: string;
}

/** What an editor collected (KB-007): a book, a paper, a document or a web capture. */
export type LibraryMaterialKind = 'book' | 'paper' | 'document' | 'web';

export const LIBRARY_MATERIAL_KINDS: readonly LibraryMaterialKind[] = ['book', 'paper', 'document', 'web'];

/** What a material's content was identified as. The original is kept whole whatever it is; nothing is read from it yet. */
export type LibraryMaterialFormat = 'DOCX' | 'DOC' | 'PDF' | 'ODT' | 'RTF' | 'TXT' | 'MD' | 'HTML' | 'EPUB' | 'UNKNOWN';

export interface LibraryMaterialSourceProjection {
  readonly displayName: string;
  readonly format: LibraryMaterialFormat;
  readonly bytes: number;
  readonly sha256: string;
}

/** 放入资料…'s first step: the chosen file as it will arrive. Nothing is kept until 放入资料库. */
export interface LibraryMaterialPreviewProjection {
  readonly previewId: string;
  readonly source: LibraryMaterialSourceProjection;
  /** The title it carries unless the editor changes it: the file's name without its extension. */
  readonly suggestedTitle: string;
  /** The kind its format names — a web page for HTML, a book for EPUB — or `null` when only the editor can say. */
  readonly suggestedKind: LibraryMaterialKind | null;
}

/** Where a material belongs (KB-007): one Book or the house. A Series is named once Series exist (Issue #63, S28). */
export type LibraryAttribution = { readonly scope: 'book'; readonly bookId: string } | { readonly scope: 'house' };

/**
 * A Learning Eligibility choice (LEARN-004 to LEARN-006): the one Book it may teach in, the house, excluded, or left for
 * later. `纳入当前书系` waits for Series as the attribution does.
 */
export type LearningEligibilityChoice = 'book' | 'house' | 'excluded' | 'deferred';

/** One decision the editor made, as the chain holds it: a later one supersedes, none is rewritten (LEARN-007). */
export type LibraryMaterialDecisionInput =
  | { readonly kind: 'attribution'; readonly attribution: LibraryAttribution }
  | { readonly kind: 'eligibility'; readonly choice: LearningEligibilityChoice; readonly reason: string | null };

export interface LibraryMaterialDecisionProjection {
  readonly ordinal: number;
  readonly recordedAt: string;
  readonly decision:
    | { readonly kind: 'attribution'; readonly scope: 'book'; readonly bookId: string; readonly bookTitle: string }
    | { readonly kind: 'attribution'; readonly scope: 'house' }
    | { readonly kind: 'eligibility'; readonly choice: LearningEligibilityChoice; readonly bookTitle: string | null; readonly reason: string | null; readonly reasonHasMore: boolean };
}

/** One 资料库 item: what arrived, where it belongs, whether it may teach, and whose Tasks may list it under 允许参考. */
export interface LibraryMaterialProjection {
  readonly materialId: string;
  readonly title: string;
  readonly kind: LibraryMaterialKind;
  readonly source: LibraryMaterialSourceProjection;
  readonly recordedAt: string;
  /** The arrival record's digest: the version a Task that lists it would name (KB-002). */
  readonly digest: string;
  /** The attribution that stands; `null` while the editor has not decided one. */
  readonly attribution:
    | null
    | { readonly scope: 'book'; readonly bookId: string; readonly bookTitle: string; readonly decidedAt: string }
    | { readonly scope: 'house'; readonly decidedAt: string };
  /** The Learning Eligibility decided under that attribution; `null` while none was. */
  readonly eligibility: null | {
    readonly choice: LearningEligibilityChoice;
    readonly bookTitle: string | null;
    readonly reason: string | null;
    readonly reasonHasMore: boolean;
    readonly ordinal: number;
    readonly decidedAt: string;
  };
  /** A decision made under an earlier attribution, which changing the attribution set aside: it is decided again. */
  readonly eligibilityReset: boolean;
  /** Whether a Task may list it under 允许参考 (KB-007): once both are decided, and eligibility not left for later. */
  readonly reference:
    | { readonly state: 'available'; readonly scope: 'book'; readonly bookTitle: string }
    | { readonly state: 'available'; readonly scope: 'house' }
    | { readonly state: 'pending' };
  /** How many decisions the item's chain holds. */
  readonly decisionCount: number;
  /** The latest of them, oldest first, at most `MAX_LIBRARY_MATERIAL_DECISIONS_SHOWN`. */
  readonly decisions: ReadonlyArray<LibraryMaterialDecisionProjection>;
  /** Its Material Index, layer by layer, as it stands on this machine (Issue #428, S80a; KB-009). */
  readonly index: MaterialIndexProjection;
  /** Where it came from when 保存为来源材料 made it of a retained external source (Issue #425, S70); absent otherwise. */
  readonly provenance?: LibraryMaterialProvenance;
}

/** A 来源材料's provenance: the retained source, the Run that retained it and the capture's identities (Issue #425, S70). */
export interface LibraryMaterialProvenance {
  readonly kind: 'research-evidence';
  readonly evidenceId: string;
  readonly bookId: string;
  readonly runRecordId: string;
  readonly url: string;
  readonly capturedAt: string;
  readonly contentSha256: string;
  readonly pageSha256: string | null;
  readonly snapshotDigest: string | null;
}

// ---- ⑤ 资料库 · 资料索引 (Issue #428, plan slice S80a; editor-surfaces §8.4, V2-UX-KB-009, ATTN-009) -------------------

/**
 * Where an item's Material Index stands: waiting for its turn or being built on this machine, or built — every layer
 * read, or some layers not readable for its format, or not readable at all for the reason given.
 */
export type MaterialIndexState = 'queued' | 'indexing' | 'complete' | 'unsupported' | 'failed';

/**
 * Why a layer could not be read (S80a): the format needs a local dependency the Owner has not admitted (PDF text and
 * recognition), AI7 reads no text of this format yet, the text crossed the local reading bounds, the file could not be
 * read, the kept original no longer matches its record, or the file holds no text. Since protocol 121 (Issue #428): the file
 * is encrypted or carries DRM (an EPUB's, an ODT saved with a password), or it declares entities or an internal DTD subset,
 * which AI7 never expands or fetches. Since protocol 140 (Issue #892): a PDF whose pages carry no text layer to speak of — a
 * scan — needs recognition (需要识别), which this build does not provide.
 */
export type MaterialIndexReason =
  | 'needs-local-dependency'
  | 'format-unsupported'
  | 'over-bound'
  | 'unreadable'
  | 'original-changed'
  | 'empty'
  | 'encrypted'
  | 'external-entity'
  | 'needs-recognition';

/**
 * One layer's state, in the five layers of KB-009 and the two parts its text layer names (recognition, Source
 * Translation). `deferred` is a layer this build of AI7 does not provide: recognition (OCR) needs a local dependency the
 * Owner has not admitted. Since protocol 140 (Issue #892) the two layers made on request say where they stand: `not-built`
 * before the editor asks (构建相似索引, 生成来源译文), `building` while they are made, `partial` when 来源译文 stopped part way,
 * and `needs-model` when the similarity provider's model files are missing or do not match (需要模型文件).
 */
export type MaterialIndexLayerState = 'complete' | 'pending' | 'unsupported' | 'failed' | 'deferred' | 'not-needed' | 'not-built' | 'building' | 'partial' | 'needs-model';

/** The language the extracted text is mostly in: Chinese, another language, or no letters at all. */
export type MaterialIndexLanguage = 'zh' | 'other' | 'none';

export interface MaterialIndexProjection {
  readonly state: MaterialIndexState;
  /** Why the text could not be read; `null` while it is waiting, or once it was read. */
  readonly reason: MaterialIndexReason | null;
  /** When the index was built; `null` before. */
  readonly builtAt: string | null;
  /** The index record's digest: the version a Task that lists the item pins (KB-002); `null` before it is built. */
  readonly digest: string | null;
  readonly layers: {
    readonly original: MaterialIndexLayerState;
    readonly metadata: MaterialIndexLayerState;
    readonly text: MaterialIndexLayerState;
    readonly recognition: MaterialIndexLayerState;
    readonly translation: MaterialIndexLayerState;
    readonly segments: MaterialIndexLayerState;
    readonly vectors: MaterialIndexLayerState;
  };
  /** What the metadata layer read of the file: its own title when it names one, the language, and the counts. */
  readonly metadata: null | {
    readonly documentTitle: string | null;
    readonly language: MaterialIndexLanguage | null;
    readonly paragraphs: number;
    readonly headings: number;
    readonly sentences: number;
    readonly characters: number;
    /** A PDF's page count (Issue #892); `null` for every format without pages. */
    readonly pages: number | null;
  };
  /**
   * 相似段落检索 (Issue #892): the similarity vectors of the current build, made only when the editor asks, never on open;
   * `null` until the text was read.
   */
  readonly vectors: null | MaterialVectorsProjection;
  /** 来源译文 (Issue #892): the machine translation of a non-Chinese item's text, a separate layer; `null` when none is needed. */
  readonly translation: null | MaterialTranslationProjection;
}

/** Where the current build's similarity vectors stand, and what makes them (Issue #892). */
export interface MaterialVectorsProjection {
  readonly state: 'not-built' | 'building' | 'complete' | 'needs-model';
  /** The provider's identity, e.g. `ai7-embedding/stub-1`: what the vectors are made by. */
  readonly embedding: string;
  readonly dimensions: number;
  /** How many of the build's paragraphs have their vector, of `total`. */
  readonly built: number;
  readonly total: number;
  /** When the last vector was recorded; `null` before any. */
  readonly builtAt: string | null;
  /** The model digest the provider expects when its model files are missing or do not match; `null` otherwise. */
  readonly expectedDigest: string | null;
}

/** Where the current build's 来源译文 stands, and whether the editor may ask for it now (Issue #892). */
export interface MaterialTranslationProjection {
  readonly state: 'not-built' | 'building' | 'complete' | 'partial';
  /** How many of the build's paragraphs have their 来源译文, of `total`. */
  readonly translated: number;
  readonly total: number;
  /** The model that made the translations on record; `null` before any. */
  readonly model: string | null;
  /** Whether 生成来源译文 may be asked now; `reason` says why not (「当前策略未开放来源译文」 when no rule names it). */
  readonly request: { readonly available: boolean; readonly reason: string | null };
  /** Why the last request stopped part way, in the editor's words; `null` when it did not. */
  readonly lastFailure: string | null;
  /** Last actual model attempt, retained independently of whether it produced any translation. */
  readonly lastAttempt?: MaterialTranslationAttemptProjection | null;
}

export interface MaterialTranslationAttemptProjection {
  readonly attemptId: string;
  readonly indexId: string;
  readonly indexSha256: string;
  readonly sourceSha256: string;
  readonly batch: ReadonlyArray<{ readonly ordinal: number; readonly sha256: string }>;
  readonly recordedAt: string;
  readonly outcome: 'translated' | 'failed' | 'outcome-unknown';
  readonly provenance: ModelTextAttemptProvenance;
}

/** What a 来源译文 is labelled wherever it is shown or read: it is the machine's, never the original. */
export const MATERIAL_TRANSLATION_LABEL = '来源译文';

/** The candidates one 相似段落检索 answers at most, and the longest text it compares. */
export const MAX_MATERIAL_VECTOR_CANDIDATES = 32;

export const MAX_MATERIAL_VECTOR_QUERY_CODE_UNITS = 2_000;

/**
 * 相似段落检索 in an item's 查看索引 (Issue #892): its paragraphs nearest the editor's text, each with its anchor and a short
 * preview. The ranking finds candidates; the words are read where the anchor points (ADR 0026).
 */
export interface MaterialVectorSearchProjection {
  readonly materialId: string;
  readonly indexDigest: string;
  readonly embedding: string;
  readonly candidates: ReadonlyArray<{
    readonly ordinal: number;
    readonly page: number | null;
    readonly pageParagraph: number | null;
    readonly score: number;
    readonly preview: string;
  }>;
}

/** The paragraphs one answer of 查看分段 carries at most: one frame holds them at the paragraph bound. */
export const MAX_MATERIAL_SEGMENTS_PAGE = 16;

/**
 * One page of an item's segments (KB-009): each paragraph with its kind and its sentences as ranges of its text, so every
 * sentence is citable by its position anchor — 第 n 段第 m 句. These formats carry no page numbers, and the anchors say so by
 * being positions.
 */
export interface MaterialSegmentsPageProjection {
  readonly materialId: string;
  readonly title: string;
  /** The index record the page was read from. */
  readonly indexDigest: string;
  /** How many paragraphs the index holds. */
  readonly total: number;
  /** The first paragraph's ordinal on this page, 1-based. */
  readonly from: number;
  readonly segments: ReadonlyArray<{
    readonly ordinal: number;
    readonly kind: 'title' | 'heading' | 'paragraph';
    readonly text: string;
    /** Each sentence as `[start, end)` in UTF-16 code units of `text`, in order. */
    readonly sentences: ReadonlyArray<readonly [number, number]>;
    /** A PDF paragraph's page and its place on that page (Issue #892); `null` for every format without pages. */
    readonly page: number | null;
    readonly pageParagraph: number | null;
    /** Its 来源译文 when one was made (Issue #892): labelled, attributed to this paragraph, never in place of it. */
    readonly translation: null | { readonly text: string; readonly model: string };
  }>;
  readonly next: number | null;
  readonly previous: number | null;
}

/** One page of 资料库. An attribution names its Book from 书库's own pages (`listBooks`), never from this answer. */
export interface LibraryMaterialsProjection {
  /** Newest arrival first. */
  readonly materials: ReadonlyArray<LibraryMaterialProjection>;
  /** Where the next page starts; `null` when this is the last. */
  readonly nextCursor: LibraryMaterialCursor | null;
}
