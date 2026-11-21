import { canonicalJson, isRecord, sha256Hex } from '../analysis/canonical.js';
import type { EmbeddingProvider } from '../knowledge/embedding.js';

/** Disposable projections only. Readers own authorization, availability and the authoritative pinned bytes. */
/** `memory` is one explicitly pinned house memory/preference revision of a scoped Global Agent turn (#1171); lexical only. */
export type RetrievalSourceKind = 'manuscript' | 'material' | 'retained-source' | 'memory';
export interface RetrievalAnchor {
  readonly blockId?: string;
  readonly segmentOrdinal?: number;
  /** UTF-16 code-unit offsets within the authoritative block or segment. */
  readonly start: number;
  readonly end: number;
}
export interface RetrievalCandidate {
  readonly candidateId: string;
  readonly sourceKind: RetrievalSourceKind;
  readonly sourceId: string;
  readonly revisionOrIndexDigest: string;
  readonly anchor: RetrievalAnchor;
  readonly score: number;
  readonly preview: string;
}
export interface RetrievalSource {
  readonly sourceKind: RetrievalSourceKind;
  readonly sourceId: string;
  readonly digest: string;
  /** Must recheck withdrawal and read this pin, never substitute the current revision/build. */
  read(): { readonly digest: string; readonly segments: ReadonlyArray<{ readonly blockId?: string; readonly segmentOrdinal?: number; readonly startOffset?: number; readonly text: string }> };
}
/** #892's local embedding seam: the store's provider (the built-in stub until a model adapter is admitted); nothing is sent. */
export type RetrievalEmbeddingProvider = EmbeddingProvider;
export class RetrievalError extends Error {
  constructor(readonly code: 'RETRIEVAL_SOURCE_MOVED' | 'RETRIEVAL_SOURCE_NOT_AUTHORIZED' | 'MATERIAL_REFERENCE_UNAVAILABLE') {
    super(code);
    this.name = 'RetrievalError';
  }
}
export const RETRIEVAL_CHUNK_SIZE = 1_200;
export const RETRIEVAL_CHUNK_OVERLAP = 120;
export const RETRIEVAL_PREVIEW_SIZE = 200;
export const RETRIEVAL_MAX_CANDIDATES = 8;
/** Bounded plan snapshots, never a callback to live ledger rows. Their digest is part of composition v2. */
export interface PinnedLocalToolSources {
  readonly baseline: { readonly revisionId: string; readonly digest: string; readonly entities: readonly unknown[];
    readonly events: readonly unknown[]; readonly settingClaims: readonly unknown[] } | null;
  readonly guidelines: readonly { readonly documentId: string; readonly version: string; readonly clauses: readonly { readonly clauseId: string; readonly text: string }[] }[];
  readonly terms: readonly unknown[];
}
/** The rows one `baseline_facts` or `term_table` section returns; the answer counts the rest. */
export const PINNED_RECORDS_PER_SECTION = 8;
/** The term table's sections: the baseline entities of these kinds. */
const TERM_TABLE_KINDS = ['person', 'place', 'term'] as const;
/** A pinned row's searchable text: its named string fields and string-array fields, NFC and lower-cased. */
function pinnedRowTexts(row: unknown, fields: readonly string[]): string[] {
  if (!isRecord(row)) return [];
  return fields.flatMap((field) => {
    const value = row[field];
    return typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  }).map((text) => text.normalize('NFC').toLowerCase());
}

/** The local lexical ranker's weights and limits (ADR 0107 §4 points 1–3, #1623). */
export const RETRIEVAL_LEXICAL = Object.freeze({
  /** A whole word: a Han word of two or more characters from the word segmenter, or a Latin or number token. */
  wordWeight: 1,
  /** Two adjacent Han characters. */
  bigramWeight: 0.6,
  /** One Han character that is not a function word, so that 修订 / 修改 / 改动 share a feature. */
  morphemeWeight: 0.25,
  bm25K1: 1.2,
  bm25B: 0.75,
  /** The further phrasings one `retrieve` call fuses beside its `query`. */
  maxQueries: 4,
  /** A pinned name or alias shorter than this never expands a query. */
  aliasMinLength: 2,
  /** The sibling names one query gains at most. */
  aliasExpansionLimit: 8,
});
/** Function-word characters that carry no topic: they never form a single-character feature. */
export const RETRIEVAL_STOPWORD_MORPHEMES: ReadonlySet<string> = new Set('的了是在和与及或也就都而之其这那着过把被让对为以于从到将等吗呢吧啊么个');
/**
 * Han word boundaries come from the runtime's ICU dictionary; Latin and number tokens never do (the regex below makes them), so
 * the word-break rules Chromium patches (`.` and `:` between letters) cannot move a token. The packaged runtime's dictionary holds
 * seven words more than the test runtime's (七国集团, 七國集團, 五大湖, 五大连池, 五大連池, 春运, 调控; ADR 0107 §4 point 1), which
 * moves only the word feature of a text containing one of them. No feature is stored, so nothing persisted depends on the runtime.
 */
const HAN_WORDS = new Intl.Segmenter('zh', { granularity: 'word' });
const WORD = 'w:';
const BIGRAM = 'b:';
const MORPHEME = 'u:';
function featureWeight(feature: string): number {
  return feature.startsWith(WORD) ? RETRIEVAL_LEXICAL.wordWeight : feature.startsWith(BIGRAM) ? RETRIEVAL_LEXICAL.bigramWeight : RETRIEVAL_LEXICAL.morphemeWeight;
}

/**
 * A text's weighted lexical features, in text order: per Han run its segmenter words (`w:`), adjacent bigrams (`b:`) and
 * non-function single characters (`u:`); a Latin or number run is one word (`w:`). NFKC keeps supplementary-plane Han characters.
 */
export function retrievalTokens(text: string): string[] {
  return normalizedFeatures(retrievalNormalized(text));
}
/** The one normalisation features, verbatim containment and alias matching all read. */
function retrievalNormalized(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}
const WORD_RUNS = /\p{Script=Han}+|[\p{Script=Latin}\p{N}]+/gu;
function normalizedFeatures(normalized: string): string[] {
  const words = [...HAN_WORDS.segment(normalized)].filter((part) => /^\p{Script=Han}+$/u.test(part.segment) && [...part.segment].length > 1);
  const features: string[] = [];
  let word = 0;
  for (const match of normalized.matchAll(WORD_RUNS)) {
    const run = match[0];
    if (!/^\p{Script=Han}/u.test(run)) { features.push(WORD + run); continue; }
    const end = match.index + run.length;
    while (word < words.length && words[word]!.index < match.index) word += 1;
    for (; word < words.length && words[word]!.index + words[word]!.segment.length <= end; word += 1) features.push(WORD + words[word]!.segment);
    const chars = [...run];
    for (let index = 0; index + 1 < chars.length; index += 1) features.push(BIGRAM + chars[index]! + chars[index + 1]!);
    for (const char of chars) if (!RETRIEVAL_STOPWORD_MORPHEMES.has(char)) features.push(MORPHEME + char);
  }
  return features;
}

/**
 * Where a normalised text may be cut between words: the edges of every Han and Latin or number run, and inside a Han run the
 * segmenter's boundaries (never inside a Latin or number run, so the runtimes' differing break rules cannot move one).
 */
function wordBoundaries(normalized: string): ReadonlySet<number> {
  const boundaries = new Set([0, normalized.length]);
  for (const match of normalized.matchAll(WORD_RUNS)) { boundaries.add(match.index); boundaries.add(match.index + match[0].length); }
  for (const part of HAN_WORDS.segment(normalized)) {
    if (/^\p{Script=Han}+$/u.test(part.segment)) { boundaries.add(part.index); boundaries.add(part.index + part.segment.length); }
  }
  return boundaries;
}
/** Whether `name` stands in `normalized` as whole words: some occurrence starts and ends on a word boundary. */
function namesWholeWords(normalized: string, boundaries: ReadonlySet<number>, name: string): boolean {
  for (let at = normalized.indexOf(name); at !== -1; at = normalized.indexOf(name, at + 1)) {
    if (boundaries.has(at) && boundaries.has(at + name.length)) return true;
  }
  return false;
}

/** A passage's features with its normalised text, which verbatim containment reads. */
interface LexicalDocument { readonly length: number; readonly terms: ReadonlyMap<string, number>; readonly normalized: string }
function lexicalDocument(text: string): LexicalDocument {
  const normalized = retrievalNormalized(text);
  const tokens = normalizedFeatures(normalized);
  return { length: tokens.length, terms: termFrequencies(tokens), normalized };
}
/** Weighted BM25 of each document for one query's features; 0 where no feature occurs. */
function bm25Scores(documents: readonly LexicalDocument[], query: ReadonlySet<string>): number[] {
  const { bm25K1: k1, bm25B: b } = RETRIEVAL_LEXICAL;
  const average = documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1;
  const frequencies = new Map([...query].map((term) => [term, documents.filter((document) => document.terms.has(term)).length]));
  return documents.map((document) => [...query].reduce((sum, term) => {
    const tf = document.terms.get(term) ?? 0;
    if (tf === 0) return sum;
    const df = frequencies.get(term)!;
    return sum + featureWeight(term) * Math.log(1 + (documents.length - df + 0.5) / (df + 0.5)) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * document.length / average));
  }, 0));
}

export function chunkRanges(length: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < length;) {
    const end = Math.min(length, start + RETRIEVAL_CHUNK_SIZE);
    ranges.push({ start, end });
    if (end === length) break;
    start = end - RETRIEVAL_CHUNK_OVERLAP;
  }
  return ranges;
}

interface Chunk extends LexicalDocument { readonly candidate: RetrievalCandidate; readonly text: string }
function termFrequencies(tokens: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}
/** A Task's material vectors, read at the frozen builds its plan pinned through #892's `queryMaterialVectors`. */
export type RetrievalMaterialVectorQuery = (query: string, k: number) => Promise<readonly { readonly materialId: string; readonly indexDigest: string; readonly ordinal: number; readonly score: number }[]>;
function boundaryEnd(text: string, end: number): number {
  return end > 0 && end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!) && /[\uDC00-\uDFFF]/u.test(text[end]!) ? end - 1 : end;
}
function boundaryStart(text: string, start: number): number {
  return start > 0 && /[\uDC00-\uDFFF]/u.test(text[start]!) && /[\uD800-\uDBFF]/u.test(text[start - 1]!) ? start + 1 : start;
}

export function reciprocalRankFusion(rankings: readonly (readonly string[])[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + index + 1)));
  return scores;
}

function cosine(left: Float32Array, right: Float32Array): number {
  if (left.length === 0 || left.length !== right.length || [...left, ...right].some((n) => !Number.isFinite(n))) return 0;
  const dot = left.reduce((sum, n, index) => sum + n * right[index]!, 0);
  const norm = Math.sqrt(left.reduce((sum, n) => sum + n * n, 0) * right.reduce((sum, n) => sum + n * n, 0));
  return norm === 0 ? 0 : dot / norm;
}

/** One Run (or one editor-side search) owns this instance and discards it at completion. No filesystem or network seam. */
export class RetrievalIndex {
  readonly #sources: ReadonlyMap<string, RetrievalSource>;
  readonly #chunks = new Map<string, readonly Chunk[]>();
  readonly #candidates = new Map<string, RetrievalCandidate>();
  readonly #fetched = new Set<string>();
  readonly #readingDigests = new Map<string, string>();
  readonly #vectors = new Map<string, Float32Array>();
  /** Tokenized `search_manuscript`'s block features, by block identity, kept with the text they were read from. */
  readonly #blockDocuments = new Map<string, { readonly text: string; readonly document: LexicalDocument }>();
  readonly #embedding: RetrievalEmbeddingProvider | null;
  readonly #materialVectors: RetrievalMaterialVectorQuery | null;
  #disposed = false;
  readonly #records: PinnedLocalToolSources | null;
  constructor(sources: readonly RetrievalSource[], embedding: RetrievalEmbeddingProvider | null = null, materialVectors: RetrievalMaterialVectorQuery | null = null,
    records: PinnedLocalToolSources | null = null) {
    this.#records = records === null ? null : JSON.parse(canonicalJson(records)) as PinnedLocalToolSources;
    this.#sources = new Map(sources.map((source) => [this.#sourceKey(source.sourceKind, source.sourceId), Object.freeze({ ...source })]));
    if (this.#sources.size !== sources.length) throw new Error('RETRIEVAL_DUPLICATE_SOURCE');
    this.#embedding = embedding;
    this.#materialVectors = materialVectors;
  }
  #sourceKey(kind: RetrievalSourceKind, id: string): string { return `${kind}:${id}`; }
  /** Whole pinned blocks only; the source reader already enforces Book, revision and Run scope. */
  #manuscriptBlocks(): ReturnType<RetrievalSource['read']>['segments'] {
    if (this.#disposed) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    return [...this.#sources.values()].filter((source) => source.sourceKind === 'manuscript').flatMap((source) => [...this.#read(source).segments]);
  }
  readBlocks(blockId: string, radius: number): ReturnType<RetrievalSource['read']>['segments'] {
    const blocks = this.#manuscriptBlocks();
    const index = blocks.findIndex((block) => block.blockId === blockId);
    if (index === -1) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    return blocks.slice(Math.max(0, index - radius), index + radius + 1);
  }
  /**
   * Exact: the blocks containing the query, in manuscript order. Tokenized: the blocks that contain the query verbatim (after the
   * features' normalisation) first, then the rest; BM25 inside each group, ties in manuscript order.
   */
  searchManuscript(query: string, mode: 'exact' | 'tokenized'): ReturnType<RetrievalSource['read']>['segments'] {
    const blocks = this.#manuscriptBlocks();
    if (mode === 'exact') return blocks.filter((block) => block.text.normalize('NFC').includes(query)).slice(0, RETRIEVAL_MAX_CANDIDATES);
    const features = new Set(retrievalTokens(query));
    if (features.size === 0 || blocks.length === 0) return [];
    const needle = retrievalNormalized(query);
    const documents = blocks.map((block, index) => this.#blockDocument(block.blockId ?? `#${index}`, block.text));
    const scores = bm25Scores(documents, features);
    return blocks.map((block, index) => ({ block, index, verbatim: documents[index]!.normalized.includes(needle), score: scores[index]! })).filter((entry) => entry.score > 0)
      .sort((a, b) => Number(b.verbatim) - Number(a.verbatim) || b.score - a.score || a.index - b.index).slice(0, RETRIEVAL_MAX_CANDIDATES).map((entry) => entry.block);
  }
  #blockDocument(key: string, text: string): LexicalDocument {
    const cached = this.#blockDocuments.get(key);
    if (cached?.text === text) return cached.document;
    const document = lexicalDocument(text);
    this.#blockDocuments.set(key, { text, document });
    return document;
  }
  /**
   * The other pinned names of every baseline entity or term the query names (ADR 0107 §4 point 2), as features. A name counts only
   * where it stands as whole words of the query, so 先生的 does not name 生的.
   */
  #aliasFeatures(query: string): string[] {
    const { aliasMinLength, aliasExpansionLimit } = RETRIEVAL_LEXICAL;
    const rows = [...(this.#records?.baseline?.entities ?? []), ...(this.#records?.terms ?? [])];
    if (rows.length === 0) return [];
    const needle = retrievalNormalized(query);
    const boundaries = wordBoundaries(needle);
    const siblings: string[] = [];
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const names = [...new Set([row.name, ...(Array.isArray(row.aliases) ? row.aliases : [])]
        .flatMap((name) => typeof name === 'string' ? [retrievalNormalized(name).trim()] : []))].filter((name) => [...name].length >= aliasMinLength);
      if (names.some((name) => namesWholeWords(needle, boundaries, name))) siblings.push(...names.filter((name) => !needle.includes(name)));
    }
    return [...new Set(siblings)].slice(0, aliasExpansionLimit).flatMap((name) => retrievalTokens(name));
  }
  /**
   * `guideline_clause` names one clause or all. `baseline_facts` and `term_table` answer a query section by section — entities,
   * events and setting claims; persons, places and terms — with at most {@link PINNED_RECORDS_PER_SECTION} rows each and the
   * count left out, so even a whole Book's facts answer under the byte cap (Issue #1090 revision 10). No match, or no pinned
   * baseline, is an empty answer, never an error.
   */
  pinnedRecords(tool: 'baseline_facts' | 'guideline_clause' | 'term_table', argument?: string): unknown {
    if (this.#disposed) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    if (tool === 'guideline_clause') {
      return (this.#records?.guidelines ?? []).flatMap((document) => document.clauses
        .filter((clause) => argument === undefined || clause.clauseId === argument)
        .map((clause) => ({ documentId: document.documentId, version: document.version, ...clause })));
    }
    const baseline = this.#records?.baseline ?? null;
    const terms = this.#records?.terms ?? [];
    const sections: ReadonlyArray<readonly [string, readonly unknown[], readonly string[]]> = tool === 'baseline_facts'
      ? [['entities', baseline?.entities ?? [], ['name', 'aliases']], ['events', baseline?.events ?? [], ['summary', 'chronology', 'participants']],
        ['settingClaims', baseline?.settingClaims ?? [], ['subject', 'claim']]]
      : TERM_TABLE_KINDS.map((kind) => [kind, terms.filter((row) => isRecord(row) && row.kind === kind), ['name', 'aliases']] as const);
    const needle = argument?.normalize('NFC').toLowerCase();
    const answer: Record<string, unknown> = { revisionId: baseline?.revisionId ?? null };
    const more: Record<string, number> = {};
    for (const [section, rows, fields] of sections) {
      const matched = needle === undefined ? rows : rows.filter((row) => pinnedRowTexts(row, fields).some((text) => text.includes(needle)));
      answer[section] = matched.slice(0, PINNED_RECORDS_PER_SECTION);
      more[section] = Math.max(0, matched.length - PINNED_RECORDS_PER_SECTION);
    }
    return { ...answer, more };
  }
  #read(source: RetrievalSource): ReturnType<RetrievalSource['read']> {
    try {
      const reading = source.read();
      if (reading.digest !== source.digest) throw new RetrievalError('RETRIEVAL_SOURCE_MOVED');
      const key = this.#sourceKey(source.sourceKind, source.sourceId);
      const digest = sha256Hex(canonicalJson(reading));
      const prior = this.#readingDigests.get(key);
      if (prior !== undefined && prior !== digest) throw new RetrievalError('RETRIEVAL_SOURCE_MOVED');
      this.#readingDigests.set(key, digest);
      return reading;
    } catch (error) {
      if (error instanceof RetrievalError) throw error;
      const code = error instanceof Error && 'code' in error ? error.code : null;
      throw new RetrievalError(code === 'MATERIAL_REFERENCE_UNAVAILABLE' ? code : 'RETRIEVAL_SOURCE_MOVED');
    }
  }
  /**
   * BM25 over the pinned chunks, fused with the local vectors by reciprocal rank when they are ready. `queries` are further
   * phrasings of `query` (ADR 0107 §4 point 3): each phrasing ranks on its own and every ranking joins one fusion; without them
   * the scores are the single query's. A query naming a pinned entity or term also matches its other names. After the scores, one
   * rule orders: a passage holding a phrasing verbatim comes first ("literal matches still rank first", #1623).
   */
  async retrieve(query: string, k = RETRIEVAL_MAX_CANDIDATES, sourceKinds?: readonly RetrievalSourceKind[], queries: readonly string[] = []): Promise<RetrievalCandidate[]> {
    if (this.#disposed) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    if (!query.isWellFormed() || query.trim().length === 0 || query.length > 1_000 || !Number.isSafeInteger(k) || k < 1 || k > RETRIEVAL_MAX_CANDIDATES) throw new Error('RETRIEVAL_ARGUMENTS_INVALID');
    const chunks: Chunk[] = [];
    for (const [key, source] of this.#sources) {
      if (sourceKinds !== undefined && !sourceKinds.includes(source.sourceKind)) continue;
      let reading: ReturnType<RetrievalSource['read']>;
      try { reading = this.#read(source); } catch { this.#chunks.delete(key); continue; }
      let cached = this.#chunks.get(key);
      if (cached === undefined) {
        cached = reading.segments.flatMap((segment) => chunkRanges(segment.text.length).map((rawRange): Chunk => {
          const range = { start: boundaryStart(segment.text, rawRange.start), end: boundaryEnd(segment.text, rawRange.end) };
          const anchor = { ...(segment.blockId === undefined ? {} : { blockId: segment.blockId }), ...(segment.segmentOrdinal === undefined ? {} : { segmentOrdinal: segment.segmentOrdinal }),
            start: range.start + (segment.startOffset ?? 0), end: range.end + (segment.startOffset ?? 0) };
          const identity = { sourceKind: source.sourceKind, sourceId: source.sourceId, revisionOrIndexDigest: source.digest, anchor };
          const text = segment.text.slice(range.start, range.end);
          // A manuscript block read whole is one chunk: it shares its features with tokenized search's block cache.
          const document = source.sourceKind === 'manuscript' && segment.blockId !== undefined && text.length === segment.text.length
            ? this.#blockDocument(segment.blockId, text) : lexicalDocument(text);
          return { text, ...document, candidate:{ ...identity, candidateId: sha256Hex(canonicalJson(identity)), score: 0, preview: text.slice(0, boundaryEnd(text, Math.min(text.length, RETRIEVAL_PREVIEW_SIZE))) } };
        }));
        this.#chunks.set(key, cached);
      }
      chunks.push(...cached);
    }
    if (chunks.length === 0) return [];
    // The query first, then its other phrasings (one per normalised form) in one fixed order, so that the fusion does not depend on
    // how they were listed.
    const forms = new Map<string, string>([[retrievalNormalized(query), query]]);
    for (const phrasing of queries) if (forms.size <= RETRIEVAL_LEXICAL.maxQueries && !forms.has(retrievalNormalized(phrasing))) forms.set(retrievalNormalized(phrasing), phrasing);
    const phrasings = [query, ...[...forms.values()].slice(1).sort()];
    const needles = [...forms.keys()];
    const lexical = phrasings.map((phrasing) => {
      const scores = bm25Scores(chunks, new Set([...retrievalTokens(phrasing), ...this.#aliasFeatures(phrasing)]));
      return chunks.map((chunk, index) => ({ id: chunk.candidate.candidateId, score: scores[index]! })).filter((entry) => entry.score > 0).sort(rank);
    });
    let scores = phrasings.length === 1 ? new Map(lexical[0]!.map((entry) => [entry.id, entry.score])) : reciprocalRankFusion(lexical.map((ranking) => ranking.map((entry) => entry.id)));
    if (this.#embedding !== null && this.#embedding.readiness().state === 'ready') {
      try {
        const embeddedChunks = this.#materialVectors === null ? chunks : chunks.filter((chunk) => chunk.candidate.sourceKind !== 'material');
        const missing = embeddedChunks.filter((chunk) => !this.#vectors.has(chunk.candidate.candidateId));
        const vectors = await this.#embedding.embed([...phrasings, ...missing.map((chunk) => chunk.text)]);
        if (this.#disposed) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
        if (vectors.length === missing.length + phrasings.length && vectors.every((vector) => vector.length === this.#embedding!.dimensions)) {
          missing.forEach((chunk, index) => this.#vectors.set(chunk.candidate.candidateId, vectors[index + phrasings.length]!));
          const rankings: string[][] = [];
          for (const [ordinal, phrasing] of phrasings.entries()) {
            const vector = embeddedChunks.map((chunk) => ({ id: chunk.candidate.candidateId, score: cosine(vectors[ordinal]!, this.#vectors.get(chunk.candidate.candidateId)!) }));
            const material = this.#materialVectors === null || !chunks.some((chunk) => chunk.candidate.sourceKind === 'material') ? [] : await this.#materialVectors(phrasing, k);
            for (const hit of material) for (const chunk of chunks) {
              if (chunk.candidate.sourceKind === 'material' && chunk.candidate.sourceId === hit.materialId && chunk.candidate.revisionOrIndexDigest === hit.indexDigest && chunk.candidate.anchor.segmentOrdinal === hit.ordinal) {
                vector.push({ id: chunk.candidate.candidateId, score: hit.score });
              }
            }
            rankings.push(lexical[ordinal]!.map((entry) => entry.id), vector.filter((entry) => Number.isFinite(entry.score) && entry.score > 0).sort(rank).map((entry) => entry.id));
          }
          scores = reciprocalRankFusion(rankings);
        }
      } catch { /* The always-available lexical ranker remains usable when local embeddings are unavailable. */ }
    }
    if (this.#disposed) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    // Verify again after an asynchronous embed: withdrawal during ranking cannot leak a cached preview.
    const available = new Set<string>();
    for (const [key, source] of this.#sources) { try { this.#read(source); available.add(key); } catch { this.#chunks.delete(key); } }
    // A passage that holds the query or another phrasing verbatim comes before every passage that holds none; inside each group,
    // the ranking above (BM25, or the fusion).
    const results = chunks.filter((chunk) => available.has(this.#sourceKey(chunk.candidate.sourceKind, chunk.candidate.sourceId)) && scores.has(chunk.candidate.candidateId))
      .map((chunk) => ({ candidate: { ...chunk.candidate, score: scores.get(chunk.candidate.candidateId)! }, verbatim: needles.some((needle) => chunk.normalized.includes(needle)) }))
      .sort((a, b) => Number(b.verbatim) - Number(a.verbatim) || rank({ id: a.candidate.candidateId, score: a.candidate.score }, { id: b.candidate.candidateId, score: b.candidate.score }))
      .slice(0, k).map((entry) => entry.candidate);
    for (const candidate of results) this.#candidates.set(candidate.candidateId, candidate);
    return results;
  }
  exactFetch(candidateId: string): { readonly candidate: RetrievalCandidate; readonly text: string } {
    const candidate = this.#candidates.get(candidateId);
    if (candidate === undefined) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    const source = this.#sources.get(this.#sourceKey(candidate.sourceKind, candidate.sourceId));
    if (source === undefined) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    if (source.digest !== candidate.revisionOrIndexDigest) throw new RetrievalError('RETRIEVAL_SOURCE_MOVED');
    const reading = this.#read(source);
    const segment = reading.segments.find((entry) => entry.blockId === candidate.anchor.blockId && entry.segmentOrdinal === candidate.anchor.segmentOrdinal);
    if (segment === undefined || candidate.anchor.start < (segment.startOffset ?? 0) || segment.text.length + (segment.startOffset ?? 0) < candidate.anchor.end) throw new RetrievalError('RETRIEVAL_SOURCE_MOVED');
    const text = segment.text.slice(candidate.anchor.start - (segment.startOffset ?? 0), candidate.anchor.end - (segment.startOffset ?? 0));
    this.#fetched.add(candidateId);
    return { candidate, text };
  }
  /** Citation validation rechecks the pinned authority, including withdrawal since Exact Fetch. */
  citation(candidateId: string): RetrievalCandidate | null {
    if (!this.#fetched.has(candidateId)) return null;
    try { return this.exactFetch(candidateId).candidate; } catch { return null; }
  }
  exactFetchedCandidates(): ReadonlyMap<string, RetrievalCandidate> {
    return new Map([...this.#fetched].flatMap((id) => { const candidate = this.citation(id); return candidate === null ? [] : [[id, candidate] as const]; }));
  }
  dispose(): void { this.#disposed = true; this.#chunks.clear(); this.#candidates.clear(); this.#fetched.clear(); this.#readingDigests.clear(); this.#vectors.clear(); this.#blockDocuments.clear(); }
}
function rank(a: { id: string; score: number }, b: { id: string; score: number }): number { return b.score - a.score || a.id.localeCompare(b.id, 'en'); }
