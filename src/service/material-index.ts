import { randomUUID } from 'node:crypto';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { opendir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_MATERIAL_SEGMENTS_PAGE,
  type LibraryMaterialFormat,
  type MaterialIndexLanguage,
  type MaterialIndexLayerState,
  type MaterialIndexProjection,
  type MaterialIndexReason,
  type MaterialSegmentsPageProjection,
} from '../shared/protocol.js';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../shared/data-root.js';
import { UUID_PATTERN, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { DOC_CONVERTER_IDENTITY, convertDocManuscript } from './doc-manuscript.js';
import { DOCX_PARSER_IDENTITY, MAX_ARCHIVE_BYTES, parseDocx, type ParsedDocxBlock } from './docx.js';
import { TEXT_CONVERTER_IDENTITY, convertTextManuscript } from './text-manuscript.js';

/**
 * ⑤ 资料库 · 资料索引 (Issue #428, plan slice S80a; editor-surfaces §8.4, V2-UX-KB-009, ATTN-009): the Material Index of a
 * 资料库 item, built on this machine from the original kept whole at its arrival.
 *
 * The Owner's decision of 2026-10-09 (option 乙) admits the four layers that need no new local dependency, and this module
 * builds exactly those:
 *
 * 1. the original — kept by `library-materials.ts`, re-verified here by its digest before anything is read from it;
 * 2. metadata — the file's own title when it names one, the language its text is mostly in, and its counts;
 * 3. extracted full text — for the formats AI7 already reads with its admitted conversion dependencies: DOCX (fflate and
 *    saxes), the legacy DOC (word-extractor) and plain text or Markdown, each through the very parser and converter the
 *    manuscript intake uses, inside the same bounds;
 * 4. segments — each paragraph with its sentences, every sentence citable by its position anchor (第 n 段第 m 句). These
 *    formats carry no page layout, so the anchors are positions and never claim a page.
 *
 * Similarity vectors (相似段落检索) and text recognition for scans need a local embedding, recognition or vector-store
 * dependency the Owner has not admitted (ADR 0070 §3 covers only intake conversion), and machine 来源译文 needs a Model
 * Role: those layers are stated as not provided, never imitated. PDF text is the same: no admitted dependency reads it.
 *
 * An index grants nothing. It is no Run Source Scope; a Task reads it read-only, only for an item its plan lists under
 * 允许参考 at the exact index version it pinned (`readForTask`), and what any Task sends stays bounded by its plan.
 *
 * Schema revision 67 owns two append-only relations: one build per item per indexer identity — its state, the metadata
 * and layer facts, and the digest over its segments — and the segments of a complete build, one row per paragraph.
 */

export const MATERIAL_INDEX_SCHEMA_SQL = {
  material_index_builds: `CREATE TABLE material_index_builds (
  index_id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES library_materials(material_id),
  indexer TEXT NOT NULL CHECK(length(indexer) BETWEEN 1 AND 256),
  state TEXT NOT NULL CHECK(state IN ('complete', 'unsupported', 'failed')),
  segment_count INTEGER NOT NULL CHECK(segment_count >= 0),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(material_id, indexer),
  CHECK((state = 'complete') = (segment_count > 0))
) STRICT`,
  material_index_segments: `CREATE TABLE material_index_segments (
  index_id TEXT NOT NULL REFERENCES material_index_builds(index_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  PRIMARY KEY(index_id, ordinal)
) STRICT`,
} as const;

export const MATERIAL_INDEX_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(MATERIAL_INDEX_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MATERIAL_INDEX_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MATERIAL_INDEX_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const MATERIAL_INDEX_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  material_index_builds: ['material_id>library_materials.material_id:NO ACTION/NO ACTION/NONE'],
  material_index_segments: ['index_id>material_index_builds.index_id:NO ACTION/NO ACTION/NONE'],
};

/**
 * The indexer's identity: what a build was made by. A build is made once per item per identity, so a later indexer that
 * reads more makes a new build beside the old one, and nothing is rewritten.
 *
 * It names the DOCX parser every format is read through, and not the DOC and text converters (#729): it is one identity for
 * every format, so naming them would move every item's current build — DOCX ones included — and rebuild them all, each
 * build's digest with it. Each build records the converter it read through in its own record (`converter`, under the
 * build's digest); a change to a converter's output moves `ai7-material-index/N` instead. Refinements of the sentence
 * anchors (`splitSentences`) are not versioned this way: a build made earlier keeps the anchors it was made with, and a
 * plan pins a build by its digest, so what a plan froze never moves under it (#729; #751 review, P3-3).
 */
export const MATERIAL_INDEXER_IDENTITY = `ai7-material-index/1+${DOCX_PARSER_IDENTITY}`;
/** Where a converted working copy is written while it is read, inside the Agent Data Root; removed after, and at open. */
export const MATERIAL_INDEX_WORK_DIRECTORY = 'material-index-work';
const BUILD_SCHEMA = 'ai7.material-index/1';
const SEGMENT_SCHEMA = 'ai7.material-index-segment/1';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'material_index_builds'";
const WORK_NAME = /^\.work-[0-9a-f-]{36}\.docx$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const READABLE: ReadonlySet<LibraryMaterialFormat> = new Set(['DOCX', 'DOC', 'TXT', 'MD']);
const SEGMENT_KINDS: ReadonlySet<string> = new Set(['title', 'heading', 'paragraph']);
const REASONS: ReadonlySet<MaterialIndexReason> = new Set(['needs-local-dependency', 'format-unsupported', 'over-bound', 'unreadable', 'original-changed', 'empty']);
const LANGUAGES: ReadonlySet<MaterialIndexLanguage> = new Set(['zh', 'other', 'none']);

export class MaterialIndexError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MaterialIndexError';
  }
}

function requireIndex(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new MaterialIndexError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

/** Revision 67's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeMaterialIndexSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(MATERIAL_INDEX_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Material index schema rollback failed.');
    }
    throw error;
  }
}

// ---- the segment layer: sentences, and the language ---------------------------------------------------------------

/** What ends a sentence: the full stops, question and exclamation marks of Chinese and Latin text, and an ellipsis. */
const TERMINATORS: ReadonlySet<string> = new Set(['。', '！', '？', '!', '?', '…', '．']);
/** What closes a sentence after its end mark and belongs to it: closing quotes and brackets. */
const CLOSERS: ReadonlySet<string> = new Set(['”', '’', '」', '』', '）', ')', '】', '》', '〉', '"', '\'', '］', ']', '〗', '〕']);
const WHITESPACE = /\s/u;
/** A clause number: `1` of 「1. 第一条」. */
const CLAUSE_NUMBER = /^\d+$/u;
/**
 * A single Latin letter, or single Latin letters joined by full stops: `U.S` of 「The U.S. economy」. Latin only: a Han
 * character before a stop, 「好. 我们走吧.」, ends its sentence (#751 review, P1-1).
 */
const INITIALS = /^\p{Script=Latin}(?:\.\p{Script=Latin})*$/u;

/**
 * Whether a Latin full stop at `index` closes no sentence though white space follows it (#729): the sentence so far is
 * only digits — a numbered clause, 「1. 第一条」 — or the word before the stop, after a space or at the sentence's start, is
 * a single Latin letter or single Latin letters joined by full stops — an initial or an abbreviation, 「The U.S. economy」,
 * 「J. Smith」.
 * Only the word before the stop is read, and the white space before it, so a paragraph is still read once over.
 */
function heldFullStop(text: string, start: number, index: number): boolean {
  let word = index;
  while (word > start && !WHITESPACE.test(text.charAt(word - 1))) word -= 1;
  const last = text.slice(word, index);
  if (INITIALS.test(last)) return true;
  if (!CLAUSE_NUMBER.test(last)) return false;
  let before = word;
  while (before > start && WHITESPACE.test(text.charAt(before - 1))) before -= 1;
  return before === start;
}

/**
 * A paragraph's sentences, as `[start, end)` ranges of its UTF-16 code units, in order and without the white space around
 * them: a sentence ends after a run of end marks and the closing quotes or brackets that follow, a Latin full stop ends
 * one only before white space or the paragraph's end (so `3.14` stays whole) and never after a clause number or an
 * initial (`heldFullStop`), and a line break inside a paragraph ends one too. A paragraph without any end mark is one
 * sentence. Every end mark and closer is a single code unit, so no range ever splits a surrogate pair. Deterministic: the
 * same text always gives the same anchors.
 */
export function splitSentences(text: string): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  let start = 0;
  const push = (end: number): void => {
    let from = start;
    let to = end;
    while (from < to && WHITESPACE.test(text.charAt(from))) from += 1;
    while (to > from && WHITESPACE.test(text.charAt(to - 1))) to -= 1;
    if (to > from) ranges.push([from, to]);
  };
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === '\n' || character === '\r' || character === ' ' || character === ' ') {
      push(index);
      index += 1;
      start = index;
      continue;
    }
    const ends = TERMINATORS.has(character) ||
      (character === '.' && (index + 1 >= text.length || WHITESPACE.test(text.charAt(index + 1))) && !heldFullStop(text, start, index));
    if (ends) {
      let next = index + 1;
      while (next < text.length && (TERMINATORS.has(text.charAt(next)) || text.charAt(next) === '.')) next += 1;
      while (next < text.length && CLOSERS.has(text.charAt(next))) next += 1;
      push(next);
      start = next;
      index = next;
      continue;
    }
    index += 1;
  }
  push(text.length);
  return ranges;
}

const LETTER = /\p{L}/u;
const HAN = /\p{Script=Han}/u;

/**
 * The language the text is mostly in, for the Source Translation layer: Chinese when Han characters are at least half of
 * its letters, another language when they are fewer, and none when it has no letters.
 */
export function classifyLanguage(texts: Iterable<string>): MaterialIndexLanguage {
  const counts = { letters: 0, han: 0 };
  for (const text of texts) countLetters(text, counts);
  return languageOf(counts);
}

function countLetters(text: string, counts: { letters: number; han: number }): void {
  for (const character of text) {
    if (!LETTER.test(character)) continue;
    counts.letters += 1;
    if (HAN.test(character)) counts.han += 1;
  }
}

function languageOf(counts: { letters: number; han: number }): MaterialIndexLanguage {
  if (counts.letters === 0) return 'none';
  return counts.han * 2 >= counts.letters ? 'zh' : 'other';
}

// ---- a build's segments, prepared before its one write --------------------------------------------------------------

/**
 * A build's segments and the facts read from them, prepared before the transaction that records it (#729): the sentence
 * ranges, each segment's canonical record and digest, and the counts and language of its metadata.
 */
export interface PreparedMaterialIndex {
  readonly indexId: string;
  readonly extraction: MaterialExtraction;
  readonly segments: ReadonlyArray<{ readonly json: string; readonly digest: string }>;
  readonly sentences: number;
  readonly headings: number;
  readonly characters: number;
  readonly language: MaterialIndexLanguage | null;
}

/**
 * How much text is prepared before the service takes its other work again (#729). Measured on the developer host, a
 * 10,000,000-character DOCX took about 0.96 s to prepare in one piece, which every request then waited behind; a slice of
 * this many code units takes about 20 ms.
 */
export const MATERIAL_INDEX_PREPARE_SLICE = 200_000;

/** The preparation, one slice at a time: it yields after each slice of text and returns what it prepared. */
function* preparing(extraction: MaterialExtraction, indexId: string): Generator<void, PreparedMaterialIndex, void> {
  const segments: Array<{ json: string; digest: string }> = [];
  let sentences = 0;
  let headings = 0;
  let characters = 0;
  let language: MaterialIndexLanguage | null = null;
  if (extraction.state === 'complete') {
    const counts = { letters: 0, han: 0 };
    let slice = 0;
    for (const [index, block] of extraction.blocks.entries()) {
      const ranges = splitSentences(block.text);
      // A paragraph of white space alone is no sentence, and is never a segment: the parser keeps none such.
      requireIndex(ranges.length > 0, 'MATERIAL_INDEX_INVALID', '资料的分段无效。');
      sentences += ranges.length;
      if (block.kind !== 'paragraph') headings += 1;
      characters += block.graphemeLength;
      countLetters(block.text, counts);
      segments.push(canonicalRecord({
        schema: SEGMENT_SCHEMA, indexId, ordinal: index + 1, kind: block.kind, level: block.level,
        sourceParagraphIndex: block.sourceParagraphIndex, text: block.text, sentences: ranges,
      }));
      slice += block.text.length;
      if (slice >= MATERIAL_INDEX_PREPARE_SLICE) {
        slice = 0;
        yield;
      }
    }
    language = languageOf(counts);
  }
  return { indexId, extraction, segments, sentences, headings, characters, language };
}

/** A build prepared in one piece: for a caller that records it at once. */
export function prepareMaterialIndex(extraction: MaterialExtraction, indexId: string = randomUUID()): PreparedMaterialIndex {
  const steps = preparing(extraction, indexId);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * A build prepared a slice at a time, the service taking its other work between two slices (#729): what one piece took
 * the requests waiting behind it no longer wait for. A stop asked meanwhile ends it before the next slice.
 */
export async function prepareMaterialIndexInSlices(extraction: MaterialExtraction, signal?: AbortSignal, indexId: string = randomUUID()): Promise<PreparedMaterialIndex> {
  const steps = preparing(extraction, indexId);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
    if (signal?.aborted === true) throw new MaterialIndexAborted();
  }
}

// ---- the text layer: extraction ------------------------------------------------------------------------------------

export interface MaterialExtractionInput {
  /** The kept original's absolute path inside the Agent Data Root. */
  readonly originalPath: string;
  readonly format: LibraryMaterialFormat;
  readonly displayName: string;
  /** The original's digest and length as its arrival recorded them. */
  readonly objectSha256: string;
  readonly bytes: number;
  readonly dataRoot: string;
  readonly signal?: AbortSignal;
}

export type MaterialExtraction =
  | {
    readonly state: 'complete';
    readonly converter: string;
    readonly documentTitle: string | null;
    readonly blocks: ReadonlyArray<Pick<ParsedDocxBlock, 'kind' | 'level' | 'text' | 'graphemeLength' | 'sourceParagraphIndex'>>;
  }
  | { readonly state: 'unsupported' | 'failed'; readonly reason: MaterialIndexReason; readonly converter: string | null };

/** The extraction stopped because the store is closing: nothing is recorded, and the next open builds it again. */
export class MaterialIndexAborted extends Error {
  constructor() {
    super('Material indexing stopped.');
    this.name = 'MaterialIndexAborted';
  }
}

/** The one refusal every converter and the parser give a file that holds no text at all (#725 review, P2-1). */
const NO_TEXT_REFUSAL = /文件没有可转换为稿件的文本内容|所选文件为空|DOCX contains no editable text blocks|empty DOCX/u;

function docxRefusal(error: unknown): MaterialIndexReason | null {
  if (!(error instanceof Error) || !error.message.startsWith('DOCX_REJECTED:')) return null;
  if (NO_TEXT_REFUSAL.test(error.message)) return 'empty';
  if (error.message.includes('changed during staging')) return 'original-changed';
  return /exceed|bound|too many|ratio|large/iu.test(error.message) ? 'over-bound' : 'unreadable';
}

/** Why a converter refused the file: no text in it, or anything else. */
function conversionRefusal(error: unknown): MaterialIndexReason {
  return error instanceof Error && NO_TEXT_REFUSAL.test(error.message) ? 'empty' : 'unreadable';
}

/**
 * The text layer of one original, read by the parser and converters the manuscript intake uses and inside their bounds.
 * A DOCX is read in place, with its digest and length checked as it streams; a DOC, a text or a Markdown file is read whole
 * once (within the archive bound), checked against its digest, converted, and its working copy read from the Agent Data
 * Root and removed. Nothing it reads leaves this process.
 */
export async function extractMaterialText(input: MaterialExtractionInput): Promise<MaterialExtraction> {
  if (input.format === 'PDF') return { state: 'unsupported', reason: 'needs-local-dependency', converter: null };
  if (!READABLE.has(input.format)) return { state: 'unsupported', reason: 'format-unsupported', converter: null };
  const blocks: Array<Pick<ParsedDocxBlock, 'kind' | 'level' | 'text' | 'graphemeLength' | 'sourceParagraphIndex'>> = [];
  const onBlock = (block: ParsedDocxBlock): void => {
    blocks.push({ kind: block.kind, level: block.level, text: block.text, graphemeLength: block.graphemeLength, sourceParagraphIndex: block.sourceParagraphIndex });
  };
  const aborted = (): boolean => input.signal?.aborted === true;
  const converter = input.format === 'DOCX' ? DOCX_PARSER_IDENTITY
    : `${input.format === 'DOC' ? DOC_CONVERTER_IDENTITY : TEXT_CONVERTER_IDENTITY}+${DOCX_PARSER_IDENTITY}`;
  try {
    if (input.format === 'DOCX') {
      const parsed = await parseDocx(input.originalPath, input.displayName, onBlock,
        { digest: input.objectSha256, bytes: input.bytes }, { ...(input.signal === undefined ? {} : { signal: input.signal }), formatIdentified: true });
      if (aborted()) throw new MaterialIndexAborted();
      if (blocks.length === 0) return { state: 'failed', reason: 'empty', converter };
      return { state: 'complete', converter, documentTitle: parsed.titleSuggestion.sourceLabel === 'DOCX 标题元数据' ? parsed.titleSuggestion.value : null, blocks };
    }
    let size: number;
    try {
      size = (await stat(input.originalPath)).size;
    } catch {
      return { state: 'failed', reason: 'original-changed', converter };
    }
    if (size !== input.bytes) return { state: 'failed', reason: 'original-changed', converter };
    if (size > MAX_ARCHIVE_BYTES) return { state: 'failed', reason: 'over-bound', converter };
    const bytes = await readFile(input.originalPath);
    if (sha256Hex(bytes) !== input.objectSha256) return { state: 'failed', reason: 'original-changed', converter };
    let docx: Uint8Array;
    try {
      docx = input.format === 'DOC' ? (await convertDocManuscript(bytes)).docx : convertTextManuscript(bytes, { format: input.format as 'TXT' | 'MD' }).docx;
    } catch (error) {
      return { state: 'failed', reason: conversionRefusal(error), converter };
    }
    if (aborted()) throw new MaterialIndexAborted();
    const directory = await ensureCanonicalDataDirectory(input.dataRoot, MATERIAL_INDEX_WORK_DIRECTORY);
    const work = await inspectCanonicalDataFile(input.dataRoot, directory, `.work-${randomUUID()}.docx`);
    try {
      await writeFile(work.path, docx, { flag: 'wx' });
      await parseDocx(work.path, 'material.docx', onBlock, undefined, input.signal === undefined ? {} : { signal: input.signal });
    } finally {
      await rm(work.path, { force: true });
    }
    if (aborted()) throw new MaterialIndexAborted();
    if (blocks.length === 0) return { state: 'failed', reason: 'empty', converter };
    return { state: 'complete', converter, documentTitle: null, blocks };
  } catch (error) {
    if (error instanceof MaterialIndexAborted || aborted()) throw new MaterialIndexAborted();
    const refusal = docxRefusal(error);
    if (refusal !== null) return { state: 'failed', reason: refusal, converter };
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return { state: 'failed', reason: 'original-changed', converter };
    return { state: 'failed', reason: 'unreadable', converter };
  }
}

/** What a converted working copy left behind when a build stopped mid-way: removed at open. */
export async function sweepMaterialIndexWork(dataRoot: string): Promise<void> {
  let entries: Awaited<ReturnType<typeof opendir>>;
  try {
    entries = await opendir(resolve(dataRoot, MATERIAL_INDEX_WORK_DIRECTORY));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const directory = await ensureCanonicalDataDirectory(dataRoot, MATERIAL_INDEX_WORK_DIRECTORY);
  for await (const entry of entries) {
    if (entry.isFile() && WORK_NAME.test(entry.name)) await rm((await inspectCanonicalDataFile(dataRoot, directory, entry.name)).path, { force: true });
  }
}

// ---- the ledger --------------------------------------------------------------------------------------------------

/** One build as its record holds it, verified against its row. */
interface StoredBuild {
  readonly indexId: string;
  readonly materialId: string;
  readonly state: 'complete' | 'unsupported' | 'failed';
  readonly reason: MaterialIndexReason | null;
  readonly segmentCount: number;
  readonly recordedAt: string;
  readonly sha256: string;
  readonly segmentsSha256: string | null;
  readonly metadata: NonNullable<MaterialIndexProjection['metadata']>;
}

interface StoredSegment {
  readonly ordinal: number;
  readonly kind: 'title' | 'heading' | 'paragraph';
  readonly text: string;
  readonly sentences: ReadonlyArray<readonly [number, number]>;
  readonly sha256: string;
}

/** The material a build is of, as the arrival record names it. */
export interface IndexedMaterial {
  readonly materialId: string;
  /** The arrival record's digest. */
  readonly sha256: string;
  readonly format: LibraryMaterialFormat;
}

/**
 * A Task's reading boundary (KB-007, KB-009): the Book it works for and the 资料库 items its plan lists under 允许参考,
 * each pinned at the exact index version the plan froze.
 */
export interface MaterialReferenceBoundary {
  readonly bookId: string;
  readonly references: ReadonlyArray<MaterialReferencePin>;
}

export interface MaterialReferencePin {
  readonly materialId: string;
  /** The index record's digest the plan froze (KB-002). */
  readonly indexDigest: string;
}

/** What a Task reads of one listed item: a page of its segments, each sentence with its citation. */
export interface MaterialTaskReading {
  readonly materialId: string;
  readonly indexDigest: string;
  readonly total: number;
  readonly segments: ReadonlyArray<{
    readonly ordinal: number;
    readonly kind: 'title' | 'heading' | 'paragraph';
    readonly sentences: ReadonlyArray<{ readonly ordinal: number; readonly text: string; readonly citation: string }>;
  }>;
  readonly next: number | null;
}

/** One build within 最近完成's window, as 待我处理 reads it (ATTN-009). */
export interface MaterialIndexCompletion {
  readonly materialId: string;
  readonly indexId: string;
  readonly state: 'complete' | 'unsupported' | 'failed';
  readonly recordedAt: string;
  readonly sha256: string;
}

/**
 * Whether the item is one this Book's Tasks may list under 允许参考 (KB-007): attributed to this Book or the house, with a
 * Learning Eligibility decided under that attribution and not left for later. The library ledger answers it.
 */
export type MaterialReferenceAvailability = (materialId: string, bookId: string) => boolean;

/** The citation of one sentence: the item's title and its position anchor. */
export function materialCitation(title: string, paragraph: number, sentence: number): string {
  return `《${title}》第 ${paragraph} 段第 ${sentence} 句`;
}

function integer(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

function naturalCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export class MaterialIndexLedger {
  readonly #db: DatabaseSync;
  /** The builds whose every segment was read and matched its digest once in this service's life. */
  readonly #verified = new Set<string>();

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #present(): boolean {
    return this.#db.prepare(TABLE_PRESENT).get() !== undefined;
  }

  #build(row: SqlRow): StoredBuild {
    const json = String(row.canonical_json);
    requireIndex(sha256Hex(json) === String(row.sha256), 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的记录已损坏。');
    const record = JSON.parse(json) as unknown;
    requireIndex(isRecord(record) && record.schema === BUILD_SCHEMA && record.indexId === row.index_id && record.materialId === row.material_id &&
      record.indexer === row.indexer && record.state === row.state && record.recordedAt === row.recorded_at &&
      record.segmentCount === integer(row.segment_count) && isRecord(record.metadata) &&
      (record.reason === null ? row.state === 'complete' : row.state !== 'complete' && REASONS.has(record.reason as MaterialIndexReason)) &&
      (row.state === 'complete' ? typeof record.segmentsSha256 === 'string' && DIGEST_PATTERN.test(record.segmentsSha256) : record.segmentsSha256 === null),
    'MATERIAL_INDEX_RECORD_INVALID', '资料索引的记录已损坏。');
    const metadata = record.metadata;
    requireIndex((metadata.documentTitle === null || typeof metadata.documentTitle === 'string') &&
      (metadata.language === null || LANGUAGES.has(metadata.language as MaterialIndexLanguage)) &&
      naturalCount(metadata.paragraphs) && naturalCount(metadata.headings) && naturalCount(metadata.sentences) && naturalCount(metadata.characters) &&
      metadata.paragraphs === record.segmentCount,
    'MATERIAL_INDEX_RECORD_INVALID', '资料索引的记录已损坏。');
    return {
      indexId: String(row.index_id), materialId: String(row.material_id), state: row.state as StoredBuild['state'],
      reason: record.reason as MaterialIndexReason | null, segmentCount: integer(row.segment_count), recordedAt: String(row.recorded_at),
      sha256: String(row.sha256), segmentsSha256: record.segmentsSha256 as string | null,
      metadata: metadata as unknown as StoredBuild['metadata'],
    };
  }

  #segment(row: SqlRow, indexId: string): StoredSegment {
    const json = String(row.canonical_json);
    requireIndex(sha256Hex(json) === String(row.sha256), 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
    const record = JSON.parse(json) as unknown;
    const ordinal = integer(row.ordinal);
    requireIndex(isRecord(record) && record.schema === SEGMENT_SCHEMA && record.indexId === indexId && record.ordinal === ordinal &&
      SEGMENT_KINDS.has(record.kind as string) && typeof record.text === 'string' && record.text.length > 0 && Array.isArray(record.sentences) &&
      record.sentences.length > 0,
    'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
    const text = record.text;
    let previous = 0;
    const sentences = (record.sentences as unknown[]).map((range) => {
      requireIndex(Array.isArray(range) && range.length === 2 && naturalCount(range[0]) && naturalCount(range[1]) &&
        range[0] >= previous && range[1] > range[0] && range[1] <= text.length,
      'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
      previous = range[1] as number;
      return [range[0], range[1]] as const;
    });
    return { ordinal, kind: record.kind as StoredSegment['kind'], text, sentences, sha256: String(row.sha256) };
  }

  /** The build of the current indexer for one item, verified; `null` before one is made. */
  current(materialId: string): StoredBuild | null {
    if (!this.#present()) return null;
    const row = this.#db.prepare('SELECT * FROM material_index_builds WHERE material_id = ? AND indexer = ?').get(materialId, MATERIAL_INDEXER_IDENTITY) as SqlRow | undefined;
    return row === undefined ? null : this.#build(row);
  }

  /** The items that still wait for a build by the current indexer, oldest arrival first. */
  unindexed(): string[] {
    if (!this.#present()) return [];
    return (this.#db.prepare(
      `SELECT m.material_id FROM library_materials m
       WHERE NOT EXISTS (SELECT 1 FROM material_index_builds b WHERE b.material_id = m.material_id AND b.indexer = ?)
       ORDER BY m.recorded_at, m.material_id`,
    ).all(MATERIAL_INDEXER_IDENTITY) as SqlRow[]).map((row) => String(row.material_id));
  }

  /**
   * One build recorded, inside the caller's transaction: the extraction's state, the metadata and layer facts, and — for a
   * complete one — every paragraph as a segment with its sentence ranges, the build naming the digest over them all.
   * Refused when the item already has a build by this indexer; nothing of an earlier build is touched. The segments come
   * prepared (`prepareMaterialIndexInSlices`, #729), or are prepared here in one piece.
   */
  record(material: IndexedMaterial, extraction: MaterialExtraction | PreparedMaterialIndex, recordedAt = new Date().toISOString()): string {
    requireIndex(UUID_PATTERN.test(material.materialId) && DIGEST_PATTERN.test(material.sha256), 'MATERIAL_INDEX_INVALID', '资料标识无效。');
    requireIndex(this.#db.prepare('SELECT 1 FROM library_materials WHERE material_id = ? AND sha256 = ?').get(material.materialId, material.sha256) !== undefined,
      'MATERIAL_INDEX_MATERIAL_MOVED', '资料库里没有这份资料。');
    requireIndex(this.current(material.materialId) === null, 'MATERIAL_INDEX_EXISTS', '这份资料的索引已经建好。');
    const prepared = 'indexId' in extraction ? extraction : prepareMaterialIndex(extraction);
    const { indexId, segments, sentences, headings, characters, language } = prepared;
    const read = prepared.extraction;
    const build = canonicalRecord({
      schema: BUILD_SCHEMA,
      indexId,
      materialId: material.materialId,
      materialSha256: material.sha256,
      indexer: MATERIAL_INDEXER_IDENTITY,
      converter: read.converter,
      state: read.state,
      reason: read.state === 'complete' ? null : read.reason,
      segmentCount: segments.length,
      segmentsSha256: read.state === 'complete' ? sha256Hex(segments.map((segment) => segment.digest).join('\n')) : null,
      metadata: {
        documentTitle: read.state === 'complete' ? read.documentTitle : null,
        language,
        paragraphs: segments.length,
        headings,
        sentences,
        characters,
      },
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO material_index_builds(index_id, material_id, indexer, state, segment_count, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(indexId, material.materialId, MATERIAL_INDEXER_IDENTITY, read.state, segments.length, recordedAt, build.json, build.digest);
    const insert = this.#db.prepare('INSERT INTO material_index_segments(index_id, ordinal, canonical_json, sha256) VALUES (?, ?, ?, ?)');
    segments.forEach((segment, index) => insert.run(indexId, index + 1, segment.json, segment.digest));
    return indexId;
  }

  /**
   * The item's index as its card reads it (KB-009): every layer's state honestly, the deferred ones as not provided. `queue`
   * says whether the store is building it now or it waits its turn, when no build exists yet.
   */
  projection(material: IndexedMaterial, queue: 'queued' | 'indexing'): MaterialIndexProjection {
    const build = this.current(material.materialId);
    const recognition: MaterialIndexLayerState = material.format === 'PDF' ? 'deferred' : 'not-needed';
    if (build === null) {
      return {
        state: queue, reason: null, builtAt: null, digest: null, metadata: null,
        layers: { original: 'complete', metadata: 'pending', text: 'pending', recognition, translation: 'pending', segments: 'pending', vectors: 'deferred' },
      };
    }
    const text: MaterialIndexLayerState = build.state === 'complete' ? 'complete'
      : build.reason === 'needs-local-dependency' ? 'deferred' : build.state;
    const translation: MaterialIndexLayerState = build.state !== 'complete' ? text
      : build.metadata.language === 'other' ? 'deferred' : 'not-needed';
    return {
      state: build.state,
      reason: build.reason,
      builtAt: build.recordedAt,
      digest: build.sha256,
      metadata: build.metadata,
      layers: { original: 'complete', metadata: 'complete', text, recognition, translation, segments: text, vectors: 'deferred' },
    };
  }

  /** Every segment of a complete build read once and matched against the digest its build names; then remembered. */
  #verify(build: StoredBuild): void {
    if (this.#verified.has(build.indexId)) return;
    const rows = this.#db.prepare('SELECT * FROM material_index_segments WHERE index_id = ? ORDER BY ordinal').iterate(build.indexId) as IterableIterator<SqlRow>;
    const digests: string[] = [];
    let ordinal = 0;
    for (const row of rows) {
      ordinal += 1;
      const segment = this.#segment(row, build.indexId);
      requireIndex(segment.ordinal === ordinal, 'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
      digests.push(segment.sha256);
    }
    requireIndex(ordinal === build.segmentCount && sha256Hex(digests.join('\n')) === build.segmentsSha256,
      'MATERIAL_INDEX_RECORD_INVALID', '资料索引的分段记录已损坏。');
    this.#verified.add(build.indexId);
  }

  #complete(materialId: string): StoredBuild {
    const build = this.current(materialId);
    requireIndex(build !== null, 'MATERIAL_INDEX_NOT_READY', '这份资料的索引还没有建好。');
    requireIndex(build.state === 'complete', 'MATERIAL_INDEX_NO_TEXT', '这份资料没有提取出可分段的文字。');
    this.#verify(build);
    return build;
  }

  /**
   * The build a plan pinned (#729): read whichever indexer made it, so a plan pinned before a later indexer built the item
   * again still reads what it froze, for as long as this data keeps that build — builds are append-only, so only data
   * replaced or merged from elsewhere loses one, and then the plan is told its version is gone.
   */
  #pinned(materialId: string, indexDigest: string): StoredBuild {
    const row = DIGEST_PATTERN.test(indexDigest) && this.#present()
      ? this.#db.prepare('SELECT * FROM material_index_builds WHERE material_id = ? AND sha256 = ?').get(materialId, indexDigest) as SqlRow | undefined
      : undefined;
    requireIndex(row !== undefined, 'MATERIAL_INDEX_MOVED', '计划冻结的这份资料的索引版本已不在本机。');
    const build = this.#build(row);
    requireIndex(build.state === 'complete', 'MATERIAL_INDEX_NO_TEXT', '这份资料没有提取出可分段的文字。');
    this.#verify(build);
    return build;
  }

  #segments(indexId: string, from: number, count: number): StoredSegment[] {
    return (this.#db.prepare('SELECT * FROM material_index_segments WHERE index_id = ? AND ordinal >= ? ORDER BY ordinal LIMIT ?')
      .all(indexId, from, count) as SqlRow[]).map((row) => this.#segment(row, indexId));
  }

  /** 查看分段 (KB-009): one page of the item's paragraphs from `from`, each with its sentence ranges; read-only. */
  page(materialId: string, title: string, from: number): MaterialSegmentsPageProjection {
    requireIndex(UUID_PATTERN.test(materialId) && Number.isSafeInteger(from) && from >= 1, 'MATERIAL_INDEX_CURSOR_INVALID', '分段位置无效。');
    const build = this.#complete(materialId);
    requireIndex(from <= build.segmentCount, 'MATERIAL_INDEX_CURSOR_INVALID', '分段位置无效。');
    const segments = this.#segments(build.indexId, from, MAX_MATERIAL_SEGMENTS_PAGE);
    const last = from + segments.length - 1;
    return {
      materialId,
      title,
      indexDigest: build.sha256,
      total: build.segmentCount,
      from,
      segments: segments.map((segment) => ({ ordinal: segment.ordinal, kind: segment.kind, text: segment.text, sentences: segment.sentences })),
      next: last < build.segmentCount ? last + 1 : null,
      previous: from > 1 ? Math.max(1, from - MAX_MATERIAL_SEGMENTS_PAGE) : null,
    };
  }

  /**
   * What a plan freezes when it lists the item under 允许参考: the item and its index version, only for an item this Book's
   * Tasks may list and whose text was read. The plan's 发送 line, not this pin, says what of it may leave.
   */
  referencePin(materialId: string, bookId: string, available: MaterialReferenceAvailability): MaterialReferencePin {
    requireIndex(UUID_PATTERN.test(materialId) && UUID_PATTERN.test(bookId), 'MATERIAL_INDEX_INVALID', '资料标识无效。');
    requireIndex(available(materialId, bookId), 'MATERIAL_REFERENCE_UNAVAILABLE', '这份资料还不能列进这本书任务的「允许参考」。');
    return { materialId, indexDigest: this.#complete(materialId).sha256 };
  }

  /**
   * A Task's read of the index (KB-009): read-only, and only within its plan boundary — an item the plan lists, at the index
   * version the plan pinned, that this Book's Tasks may still list. Anything else is refused, and nothing is written, sent
   * or scheduled by reading. The sentences come with their citations, so whatever the Task makes of them cites its source.
   */
  readForTask(boundary: MaterialReferenceBoundary, materialId: string, title: string, from: number, available: MaterialReferenceAvailability): MaterialTaskReading {
    requireIndex(UUID_PATTERN.test(boundary.bookId) && UUID_PATTERN.test(materialId) && Number.isSafeInteger(from) && from >= 1,
      'MATERIAL_INDEX_INVALID', '资料标识无效。');
    const pin = boundary.references.find((reference) => reference.materialId === materialId);
    requireIndex(pin !== undefined, 'MATERIAL_OUTSIDE_PLAN', '这份资料不在这项任务计划的「允许参考」里。');
    requireIndex(available(materialId, boundary.bookId), 'MATERIAL_REFERENCE_UNAVAILABLE', '这份资料现在不能列进这本书任务的「允许参考」。');
    const build = this.#pinned(materialId, pin.indexDigest);
    requireIndex(from <= build.segmentCount, 'MATERIAL_INDEX_CURSOR_INVALID', '分段位置无效。');
    const segments = this.#segments(build.indexId, from, MAX_MATERIAL_SEGMENTS_PAGE);
    const last = from + segments.length - 1;
    return {
      materialId,
      indexDigest: build.sha256,
      total: build.segmentCount,
      segments: segments.map((segment) => ({
        ordinal: segment.ordinal,
        kind: segment.kind,
        sentences: segment.sentences.map(([start, end], index) => ({
          ordinal: index + 1, text: segment.text.slice(start, end), citation: materialCitation(title, segment.ordinal, index + 1),
        })),
      })),
      next: last < build.segmentCount ? last + 1 : null,
    };
  }

  /** The builds of the current indexer recorded since `since`, newest first, at most `limit` (索引完成, ATTN-009). */
  completions(since: string, limit: number): MaterialIndexCompletion[] {
    requireIndex(Number.isSafeInteger(limit) && limit >= 0, 'MATERIAL_INDEX_CURSOR_INVALID', '资料索引列表数量无效。');
    if (!this.#present()) return [];
    return (this.#db.prepare(
      `SELECT * FROM material_index_builds WHERE indexer = ? AND recorded_at >= ? ORDER BY recorded_at DESC, index_id DESC LIMIT ?`,
    ).all(MATERIAL_INDEXER_IDENTITY, since, limit) as SqlRow[]).map((row) => {
      const build = this.#build(row);
      return { materialId: build.materialId, indexId: build.indexId, state: build.state, recordedAt: build.recordedAt, sha256: build.sha256 };
    });
  }
}
