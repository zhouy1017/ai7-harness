import { canonicalJson, sha256Hex } from '../analysis/canonical.js';

/** Disposable projections only. Readers own authorization, availability and the authoritative pinned bytes. */
export type RetrievalSourceKind = 'manuscript' | 'material' | 'retained-source';
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
/** Temporary narrow seam until #892's interface is integrated; embeddings must be local. */
export interface RetrievalEmbeddingProvider {
  readonly identity: string;
  readonly dimensions: number;
  readiness(): { readonly state: 'ready' } | { readonly state: 'needs-model'; readonly expectedDigest: string | null } | { readonly state: 'digest-mismatch'; readonly expectedDigest: string; readonly actualDigest: string };
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}
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

/** Runs of Han characters become adjacent bigrams; Latin words and numbers remain whole tokens. */
export function retrievalTokens(text: string): string[] {
  const runs = text.normalize('NFC').toLowerCase().match(/\p{Script=Han}+|[\p{Script=Latin}\p{N}]+/gu) ?? [];
  return runs.flatMap((run) => {
    if (!/^\p{Script=Han}/u.test(run)) return [run];
    const chars = [...run];
    return chars.length === 1 ? chars : chars.slice(0, -1).map((char, index) => char + chars[index + 1]!);
  });
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

interface Chunk { readonly candidate: RetrievalCandidate; readonly text: string; readonly tokenCount: number; readonly terms: ReadonlyMap<string, number> }
function termFrequencies(tokens: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) result.set(token, (result.get(token) ?? 0) + 1);
  return result;
}
/** Material vectors are read at the same frozen builds by #892's queryMaterialVectors seam. */
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
  readonly #embedding: RetrievalEmbeddingProvider | null;
  readonly #materialVectors: RetrievalMaterialVectorQuery | null;
  #disposed = false;
  constructor(sources: readonly RetrievalSource[], embedding: RetrievalEmbeddingProvider | null = null, materialVectors: RetrievalMaterialVectorQuery | null = null) {
    this.#sources = new Map(sources.map((source) => [this.#sourceKey(source.sourceKind, source.sourceId), Object.freeze({ ...source })]));
    if (this.#sources.size !== sources.length) throw new Error('RETRIEVAL_DUPLICATE_SOURCE');
    this.#embedding = embedding;
    this.#materialVectors = materialVectors;
  }
  #sourceKey(kind: RetrievalSourceKind, id: string): string { return `${kind}:${id}`; }
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
  async retrieve(query: string, k = RETRIEVAL_MAX_CANDIDATES, sourceKinds?: readonly RetrievalSourceKind[]): Promise<RetrievalCandidate[]> {
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
          const tokens = retrievalTokens(text);
          return { text, tokenCount: tokens.length, terms: termFrequencies(tokens), candidate: { ...identity, candidateId: sha256Hex(canonicalJson(identity)), score: 0, preview: text.slice(0, boundaryEnd(text, Math.min(text.length, RETRIEVAL_PREVIEW_SIZE))) } };
        }));
        this.#chunks.set(key, cached);
      }
      chunks.push(...cached);
    }
    if (chunks.length === 0) return [];
    const terms = [...new Set(retrievalTokens(query))];
    const average = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0) / chunks.length || 1;
    const frequencies = new Map(terms.map((term) => [term, chunks.filter((chunk) => chunk.terms.has(term)).length]));
    const lexical = chunks.map((chunk) => {
      const score = terms.reduce((sum, term) => {
        const tf = chunk.terms.get(term) ?? 0;
        if (tf === 0) return sum;
        const df = frequencies.get(term)!;
        return sum + Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5)) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * chunk.tokenCount / average));
      }, 0);
      return { id: chunk.candidate.candidateId, score };
    }).filter((entry) => entry.score > 0).sort(rank);
    let scores = new Map(lexical.map((entry) => [entry.id, entry.score]));
    if (this.#embedding !== null && this.#embedding.readiness().state === 'ready') {
      try {
        const embeddedChunks = this.#materialVectors === null ? chunks : chunks.filter((chunk) => chunk.candidate.sourceKind !== 'material');
        const missing = embeddedChunks.filter((chunk) => !this.#vectors.has(chunk.candidate.candidateId));
        const vectors = await this.#embedding.embed([query, ...missing.map((chunk) => chunk.text)]);
        if (this.#disposed) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
        if (vectors.length === missing.length + 1 && vectors.every((vector) => vector.length === this.#embedding!.dimensions)) {
          missing.forEach((chunk, index) => this.#vectors.set(chunk.candidate.candidateId, vectors[index + 1]!));
          const vector = embeddedChunks.map((chunk) => ({ id: chunk.candidate.candidateId, score: cosine(vectors[0]!, this.#vectors.get(chunk.candidate.candidateId)!) }));
          const material = this.#materialVectors === null || !chunks.some((chunk) => chunk.candidate.sourceKind === 'material') ? [] : await this.#materialVectors(query, k);
          for (const hit of material) for (const chunk of chunks) {
            if (chunk.candidate.sourceKind === 'material' && chunk.candidate.sourceId === hit.materialId && chunk.candidate.revisionOrIndexDigest === hit.indexDigest && chunk.candidate.anchor.segmentOrdinal === hit.ordinal) {
              vector.push({ id: chunk.candidate.candidateId, score: hit.score });
            }
          }
          const ranked = vector.filter((entry) => Number.isFinite(entry.score) && entry.score > 0).sort(rank);
          scores = reciprocalRankFusion([lexical.map((entry) => entry.id), ranked.map((entry) => entry.id)]);
        }
      } catch { /* The always-available lexical ranker remains usable when local embeddings are unavailable. */ }
    }
    if (this.#disposed) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    // Verify again after an asynchronous embed: withdrawal during ranking cannot leak a cached preview.
    const available = new Set<string>();
    for (const [key, source] of this.#sources) { try { this.#read(source); available.add(key); } catch { this.#chunks.delete(key); } }
    const results = chunks.filter((chunk) => available.has(this.#sourceKey(chunk.candidate.sourceKind, chunk.candidate.sourceId)) && scores.has(chunk.candidate.candidateId))
      .map((chunk) => ({ ...chunk.candidate, score: scores.get(chunk.candidate.candidateId)! })).sort((a, b) => rank({ id: a.candidateId, score: a.score }, { id: b.candidateId, score: b.score })).slice(0, k);
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
  dispose(): void { this.#disposed = true; this.#chunks.clear(); this.#candidates.clear(); this.#fetched.clear(); this.#readingDigests.clear(); this.#vectors.clear(); }
}
function rank(a: { id: string; score: number }, b: { id: string; score: number }): number { return b.score - a.score || a.id.localeCompare(b.id, 'en'); }
