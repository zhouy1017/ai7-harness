import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type {
  ChangeEditorialLearningInput, CreateEditorialMemoryInput, DeactivateEditorialMemoryInput,
  EditorialLearningProjection, GlobalEditorialMemoryVersion, InspectEditorialLearningInput,
  LearningSignal, DecisionLearningSignal, WordTrackedEditLearningSignal, WordTrackedEditLearningSource,
  LearningSignalStanding, LearningSourceReference, EditorialMemoryVersion, EditorialMemorySourceSnapshot,
  EditorialMemoryApplicability, EditorialMemoryAdmission, AcceptEditorialMemoryInput,
  LearningReasonAskInput, LearningReasonAskProjection, LearningReasonAskFrequency, PreferenceAdoptionProjection, PreferenceAdoptionCursor, ReferencedRuleVersion,
} from '../../shared/protocol/learning.js';
import { LEARNING_REASON_OPTIONS } from '../../shared/protocol/learning.js';
import { MAX_FRAME_BYTES, type TrustedOperationalScope, type LearningSupervisionDirective, type GlobalMemoryPin } from '../../shared/protocol.js';
import { reviewCategoryEntry } from '../review/category-configuration.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import { canonicalJson, canonicalRecord, isRecord, hasExactKeys, sha256Hex, UUID_PATTERN, DIGEST_PATTERN } from '../analysis/canonical.js';
import { BookPeople } from '../book-people.js';
import { DecisionFeedbackLedger } from '../decision-feedback.js';
import { graphemeEditVolume } from '../edit-quality-signals.js';
import { LearningEligibilityError, LearningEligibilityLedger, LOCAL_LEARNING_POLICY_BASIS, LEARNING_ELIGIBILITY_POLICY_BASIS,
  learningMaterialDigest, proposalDecisionCandidate, reviewDispositionCandidate, wordTrackedEditCandidate, type LearningMaterialCandidate } from '../learning-eligibility.js';
import { readWordParentSourcePin, wordParentSourcePinRecord, requireWordRevisionSource, wordTemplateKey,
  wordTrackedSampleRecord, validateWordChoice, WORD_EXTRACTOR_IDENTITY,
  type WordTrackedEditSample, type WordRevisionGraph, type WordImportChoiceRecord, type WordLocalImportAdmission,
  type WordImportControlsSnapshot, type WordMaterialStandingSnapshot } from '../import-retention.js';
import { WORD_DOCX_PARSER_IDENTITY } from '../docx.js';

type Row = Record<string, SQLOutputValue>;
const PAGE_SIZE = 30;

export const EDITORIAL_LEARNING_SCHEMA_SQL = {
  learning_signals: `CREATE TABLE learning_signals (
  signal_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  source_key TEXT NOT NULL UNIQUE,
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  editorial_learning_controls: `CREATE TABLE editorial_learning_controls (
  entry_id TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('switch', 'book')),
  book_id TEXT REFERENCES books(book_id),
  value INTEGER NOT NULL CHECK(value IN (0, 1)),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((kind = 'book') = (book_id IS NOT NULL))
) STRICT`,
  global_editorial_memory_items: `CREATE TABLE global_editorial_memory_items (
  item_id TEXT PRIMARY KEY,
  client_memory_id TEXT NOT NULL UNIQUE,
  source_signal_id TEXT NOT NULL REFERENCES learning_signals(signal_id),
  recorded_at TEXT NOT NULL
) STRICT`,
  global_editorial_memory_item_versions: `CREATE TABLE global_editorial_memory_item_versions (
  version_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES global_editorial_memory_items(item_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  supersedes TEXT REFERENCES global_editorial_memory_item_versions(version_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes IS NULL)),
  UNIQUE(item_id, ordinal)
) STRICT`,
} as const;
export const EDITORIAL_LEARNING_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(EDITORIAL_LEARNING_SCHEMA_SQL).flatMap((table) => ['update', 'delete'].map((operation) => [
    `${table}_no_${operation}`, `CREATE TRIGGER ${table}_no_${operation} BEFORE ${operation.toUpperCase()} ON ${table}
    BEGIN SELECT RAISE(ABORT, 'EDITORIAL_LEARNING_IMMUTABLE'); END`,
  ])),
);
export const EDITORIAL_LEARNING_FOREIGN_KEYS = {
  learning_signals: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  editorial_learning_controls: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  global_editorial_memory_items: ['source_signal_id>learning_signals.signal_id:NO ACTION/NO ACTION/NONE'],
  global_editorial_memory_item_versions: ['item_id>global_editorial_memory_items.item_id:NO ACTION/NO ACTION/NONE', 'supersedes>global_editorial_memory_item_versions.version_id:NO ACTION/NO ACTION/NONE'],
};

function requireLearning(condition: unknown): asserts condition {
  if (!condition) throw new LearningEligibilityError('EDITORIAL_LEARNING_INVALID', '学习记录已变化或不可用，请重新查看。');
}
function read<T>(row: Row): T {
  requireLearning(typeof row.canonical_json === 'string' && sha256Hex(row.canonical_json) === row.sha256);
  try { return JSON.parse(row.canonical_json) as T; } catch { throw new LearningEligibilityError('EDITORIAL_LEARNING_INVALID', '学习记录无法读取。'); }
}

function wordControlReference(value: unknown): boolean {
  return isRecord(value) && (value.kind === 'default'
    ? hasExactKeys(value, ['kind', 'basis']) && canonicalJson(value.basis) === canonicalJson(LOCAL_LEARNING_POLICY_BASIS)
    : value.kind === 'entry' && hasExactKeys(value, ['kind', 'entryId', 'sha256']) &&
      typeof value.entryId === 'string' && value.entryId.length > 0 && value.entryId.isWellFormed() &&
      typeof value.sha256 === 'string' && DIGEST_PATTERN.test(value.sha256));
}

function wordStanding(value: unknown): value is WordMaterialStandingSnapshot {
  return isRecord(value) && hasExactKeys(value, ['choice', 'decisionId', 'decisionDigest', 'basisVersion']) &&
    ['book', 'house', 'excluded', 'deferred'].includes(String(value.choice)) && Number.isSafeInteger(value.basisVersion) && Number(value.basisVersion) > 0 &&
    (value.decisionId === null && value.decisionDigest === null || typeof value.decisionId === 'string' && UUID_PATTERN.test(value.decisionId) &&
      typeof value.decisionDigest === 'string' && DIGEST_PATTERN.test(value.decisionDigest));
}

/** Also used for carried historical provenance: shape proof grants no current source authority. */
export function validateEditorialMemorySourceShape(value: unknown): asserts value is EditorialMemorySourceSnapshot {
  const keys = (record: Record<string, unknown>, expected: string[]) => Object.keys(record).sort().join(',') === expected.sort().join(',');
  const bounded = (text: unknown, max = 180) => typeof text === 'string' && text.length > 0 && text.length <= max && text.isWellFormed();
  requireLearning(isRecord(value) && keys(value, ['sourceKey', 'feedbackKey', 'signalId', 'source', 'operationalScope', 'editorialDimension', 'eligibility', 'admission', 'attribution', 'bookTitle']) &&
    typeof value.sourceKey === 'string' && DIGEST_PATTERN.test(value.sourceKey) && typeof value.feedbackKey === 'string' && DIGEST_PATTERN.test(value.feedbackKey) &&
    typeof value.signalId === 'string' && UUID_PATTERN.test(value.signalId) && ['book', 'house'].includes(String(value.eligibility)) &&
    ['development-ci', 'developer-live', 'ordinary-production'].includes(String(value.operationalScope)) &&
    typeof value.editorialDimension === 'string' && reviewCategoryEntry(value.editorialDimension) !== null && bounded(value.bookTitle, 512));
  const source = value.source;
  requireLearning(isRecord(source) && keys(source, ['bookId', 'manuscriptId', 'branchId', 'markId', 'decisionId', 'revisionId', 'journalSequence',
    'blockDigest', 'materialKey', 'materialDigest', 'reasonRevision', 'reviewRunId', 'findingId', 'resultSetRevisionId']) &&
    ['bookId', 'manuscriptId', 'branchId', 'decisionId', 'revisionId', 'materialKey'].every((key) => bounded(source[key])) &&
    ['markId', 'reviewRunId', 'findingId', 'resultSetRevisionId'].every((key) => source[key] === null || bounded(source[key])) &&
    typeof source.materialDigest === 'string' && DIGEST_PATTERN.test(source.materialDigest) &&
    (source.blockDigest === null || typeof source.blockDigest === 'string' && DIGEST_PATTERN.test(source.blockDigest)) &&
    [source.journalSequence, source.reasonRevision].every((number) => Number.isSafeInteger(number) && Number(number) >= 0));
  const attribution = value.attribution;
  requireLearning(isRecord(attribution) && keys(attribution, ['peopleVersion', 'authors', 'editors']) && Number.isSafeInteger(attribution.peopleVersion) &&
    Number(attribution.peopleVersion) >= 0 && [attribution.authors, attribution.editors].every((list) => Array.isArray(list) && list.every((entry) => bounded(entry, 512))));
  const admission = value.admission;
  requireLearning(isRecord(admission) && admission.materialDigest === source.materialDigest && isRecord(admission.controls) &&
    keys(admission.controls, ['switchEntryId', 'bookEntryId']) && Object.values(admission.controls).every((id) => id === null || typeof id === 'string' && UUID_PATTERN.test(id)));
  if (admission.kind === 'explicit') requireLearning(keys(admission, ['kind', 'decisionId', 'ordinal', 'basis', 'materialDigest', 'controls']) &&
    typeof admission.decisionId === 'string' && UUID_PATTERN.test(admission.decisionId) && Number.isSafeInteger(admission.ordinal) && Number(admission.ordinal) > 0 &&
    [LOCAL_LEARNING_POLICY_BASIS, LEARNING_ELIGIBILITY_POLICY_BASIS].some((basis) => canonicalJson(basis) === canonicalJson(admission.basis)));
  else requireLearning(admission.kind === 'automatic' && keys(admission, ['kind', 'basis', 'signalId', 'materialDigest', 'controls']) &&
    admission.signalId === value.signalId && value.eligibility === 'house' && canonicalJson(admission.basis) ===
      canonicalJson({ policy: LOCAL_LEARNING_POLICY_BASIS.policy, mode: LOCAL_LEARNING_POLICY_BASIS.mode, version: 2 }));
  requireLearning(value.sourceKey === sha256Hex(canonicalJson({ signalId: value.signalId, materialDigest: source.materialDigest, reasonRevision: source.reasonRevision })) &&
    value.feedbackKey === sha256Hex(canonicalJson({ bookId: source.bookId, materialKey: source.materialKey, materialDigest: source.materialDigest })));
}

/** Add all relations atomically. A partial or malformed interrupted upgrade is refused by the whole-store validator. */
export function initializeEditorialLearningSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'learning_signals'").get()) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(EDITORIAL_LEARNING_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EDITORIAL_LEARNING_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

interface Controls { enabled: boolean; entries: number; excludedBooks: Set<string> }

interface LearningControl {
  schema: 'ai7.editorial-learning-control/1';
  entryId: string; ordinal: number; kind: 'switch' | 'book'; bookId: string | null;
  value: boolean; actor: 'editor'; recordedAt: string; basis: typeof LOCAL_LEARNING_POLICY_BASIS;
  importedFrom?: { record: LearningControl; sha256: string };
}

/** One control as `change` writes it, with the provenance a merge adds. */
function controlRecord(record: unknown): LearningControl {
  requireLearning(isRecord(record) && record.schema === 'ai7.editorial-learning-control/1' &&
    typeof record.entryId === 'string' && record.entryId.length > 0 && Number.isSafeInteger(record.ordinal) && Number(record.ordinal) > 0 &&
    (record.kind === 'switch' || record.kind === 'book') &&
    (record.kind === 'book' ? typeof record.bookId === 'string' && record.bookId.length > 0 : record.bookId === null) &&
    typeof record.value === 'boolean' && record.actor === 'editor' && typeof record.recordedAt === 'string' &&
    Number.isFinite(Date.parse(record.recordedAt)) && canonicalJson(record.basis) === canonicalJson(LOCAL_LEARNING_POLICY_BASIS));
  const keys = ['schema', 'entryId', 'ordinal', 'kind', 'bookId', 'value', 'actor', 'recordedAt', 'basis'];
  if (record.importedFrom !== undefined) keys.push('importedFrom');
  requireLearning(Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key)));
  return record as unknown as LearningControl;
}

/**
 * A carried control embeds its source control whole: the embedded record's canonical JSON is the source row's exact bytes, held
 * to that row's digest, so the original entry, editor attribution, time, ordinal and any earlier merge provenance stay
 * verifiable. Embedded as a record rather than as escaped text, each merge adds the source once instead of doubling its escapes.
 */
function readControl(row: Row): LearningControl {
  const record = controlRecord(read<unknown>(row));
  requireLearning(canonicalJson(record) === row.canonical_json && record.entryId === row.entry_id && record.ordinal === row.ordinal &&
    record.kind === row.kind && record.bookId === row.book_id && Number(record.value) === row.value && record.recordedAt === row.recorded_at);
  // Walk rather than recurse: repeated Book merges retain the whole provenance chain without growing the call stack.
  let current = record;
  while (current.importedFrom !== undefined) {
    const origin: unknown = current.importedFrom;
    requireLearning(current.kind === 'book' && isRecord(origin) && Object.keys(origin).length === 2 && typeof origin.sha256 === 'string');
    const source = controlRecord(origin.record);
    requireLearning(sha256Hex(canonicalJson(source)) === origin.sha256 &&
      canonicalJson(current) === canonicalJson({ ...source, ordinal: current.ordinal, importedFrom: origin }));
    current = source;
  }
  return record;
}

function* controlHistory(db: DatabaseSync, schema: 'main' | 'src'): Generator<{ row: Row; record: LearningControl }> {
  let ordinal = 0;
  for (const row of db.prepare(`SELECT * FROM ${schema}.editorial_learning_controls ORDER BY ordinal`).iterate() as Iterable<Row>) {
    const record = readControl(row);
    requireLearning(record.ordinal === ++ordinal);
    yield { row, record };
  }
}

/** Only called inside the database merge transaction, after the selected Books have been inserted with their original IDs. */
export function importBookLearningControls(db: DatabaseSync, selectedBook: (bookId: string) => boolean): number {
  let destinationEntries = 0;
  for (const _entry of controlHistory(db, 'main')) destinationEntries += 1;
  let imported = 0;
  const insert = db.prepare('INSERT INTO main.editorial_learning_controls VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const { row, record } of controlHistory(db, 'src')) {
    if (record.kind !== 'book' || !selectedBook(record.bookId!)) continue;
    const ordinal = destinationEntries + ++imported;
    const carried = canonicalRecord({ ...record, ordinal, importedFrom: { record, sha256: String(row.sha256) } });
    insert.run(record.entryId, ordinal, record.kind, record.bookId, Number(record.value), record.recordedAt, carried.json, carried.digest);
  }
  return imported;
}

/**
 * One synchronous read's proved results (Issue #1128 revision 7): complete item chains by their exact row identities and digests,
 * effective sources by version digest, and the signals, origins, snapshots and publications already validated. Only success is
 * kept, and the owner that opens it discards it when that read returns: standing, controls, decisions and directives are read
 * afresh by every operation, and nothing survives a request, a database open or a mutation.
 */
export class LearningReads {
  readonly chains = new Map<string, { readonly fingerprint: string; readonly versions: GlobalEditorialMemoryVersion[] }>();
  readonly effective = new Map<string, EditorialMemorySourceSnapshot[]>();
  readonly signals = new Map<string, { readonly sha256: string; readonly signal: LearningSignal }>();
  readonly origins = new Map<string, { operationalScope: TrustedOperationalScope; editorialDimension: string }>();
  readonly snapshots = new Set<string>();
  readonly eligibility = new Map<string, ReturnType<LearningEligibilityLedger['history']>>();
  readonly publications = new Set<string>();
  readonly wordSources = new Map<string, { graphDigest: string; parentPinDigest: string; events: Set<string> }>();
  readonly wordImports = new Map<string, { digest: string; choice: WordImportChoiceRecord;
    materials: Map<string, WordImportControlsSnapshot['materials'][number]> }>();
  controls: Array<{ row: Row; record: LearningControl }> | null = null;
}

/** Local capture only: no provider, scheduler, retrieval or composition dependency. The caller owns the transaction. */
export class EditorialLearningLedger {
  #reads: LearningReads | null;
  constructor(readonly db: DatabaseSync, reads?: LearningReads) { this.#reads = reads ?? null; }

  /** One read inside the caller's validated-result context, or inside one discarded as soon as this read returns. */
  #read<T>(operation: () => T): T {
    if (this.#reads !== null) return operation();
    this.#reads = new LearningReads();
    try { return operation(); } finally { this.#reads = null; }
  }

  #controlRows(): Array<{ row: Row; record: LearningControl }> {
    if (this.#reads === null) return [...controlHistory(this.db, 'main')];
    return this.#reads.controls ??= [...controlHistory(this.db, 'main')];
  }

  #eligibilityHistory(bookId: string, materialKey: string): ReturnType<LearningEligibilityLedger['history']> {
    const key = `${bookId}\u0000${materialKey}`;
    const known = this.#reads?.eligibility.get(key);
    if (known !== undefined) return known;
    const history = new LearningEligibilityLedger(this.db).history(bookId, materialKey);
    this.#reads?.eligibility.set(key, history);
    return history;
  }

  controls(): Controls {
    const result: Controls = { enabled: true, entries: 0, excludedBooks: new Set() };
    for (const { record } of this.#controlRows()) {
      result.entries += 1;
      if (record.kind === 'switch') result.enabled = record.value;
      else if (record.value) result.excludedBooks.add(record.bookId!);
      else result.excludedBooks.delete(record.bookId!);
    }
    return result;
  }

  #attribution(bookId: string, at: string): LearningSignal['attribution'] {
    const people = new BookPeople(this.db).at(bookId, at);
    return { peopleVersion: people?.version ?? 0, authors: people?.authors ?? [], editors: people?.editors ?? [] };
  }

  #standing(bookId: string, materialKey: string): LearningSignal['eligibility'] {
    const last = this.#eligibilityHistory(bookId, materialKey).at(-1);
    return { choice: last?.choice ?? 'house', decisionId: last?.decisionId ?? null, basisVersion: last?.basis.version ?? 2 };
  }

  #candidate(decisionId: string, allowUnreasoned = false): { candidate: LearningMaterialCandidate; row: Row; reasonRevision: number } | null {
    const row = this.db.prepare(`SELECT d.*, i.current_text, i.proposed_text, m.book_id, m.manuscript_id, m.branch_id, m.mark_id,
      r.reason, r.reason_source FROM proposal_item_decisions d JOIN proposal_change_items i ON i.item_id = d.item_id
      JOIN editorial_marks m ON m.mark_id = i.mark_id LEFT JOIN proposal_decision_reasons r ON r.decision_id = d.decision_id
      WHERE d.decision_id = ?`).get(decisionId) as Row | undefined;
    if (!row || !['accepted', 'accepted-with-edit', 'rejected'].includes(String(row.disposition))) return null;
    const standing = new DecisionFeedbackLedger(this.db).standing(decisionId, typeof row.reason === 'string'
      ? { reason: row.reason, source: String(row.reason_source) as 'reason-field' | 'suggested' | 'free-text' } : null);
    if (!allowUnreasoned && row.disposition === 'rejected' && standing.reason === null) return null;
    if (standing.reasonRevisedAt === null && this.db.prepare('SELECT 1 FROM proposal_conflict_outcomes WHERE decision_id = ?').get(decisionId)) return null;
    return { row, reasonRevision: standing.feedbackEntries, candidate: proposalDecisionCandidate({
      decisionId, disposition: String(row.disposition), currentText: String(row.current_text), proposedText: String(row.proposed_text),
      editedText: row.edited_text === null ? null : String(row.edited_text), reason: standing.reason, reasonSource: standing.reasonSource,
      feedbackEntries: standing.feedbackEntries, recordedAt: standing.reasonRevisedAt ?? String(row.recorded_at), decidedAt: String(row.recorded_at),
    }, false) };
  }

  captureDecision(decisionId: string): void {
    const found = this.#candidate(decisionId);
    if (found === null) return;
    const { row, candidate, reasonRevision } = found;
    const source: LearningSourceReference = {
      bookId: String(row.book_id), manuscriptId: String(row.manuscript_id), branchId: String(row.branch_id), markId: String(row.mark_id),
      decisionId, revisionId: String(row.decided_revision_id), journalSequence: Number(row.decided_journal_sequence),
      blockDigest: row.decided_block_digest === null ? null : String(row.decided_block_digest), materialKey: candidate.materialKey,
      materialDigest: learningMaterialDigest(candidate), reasonRevision, reviewRunId: null, findingId: null, resultSetRevisionId: null,
    };
    this.#capture(`${decisionId}:${source.materialDigest}`, String(row.disposition) as DecisionLearningSignal['kind'], source,
      row.disposition === 'accepted-with-edit' ? graphemeEditVolume(String(row.proposed_text), String(row.edited_text)) : null,
      candidate.recordedAt);
  }

  captureIgnoredFinding(bookId: string, reviewRunId: string, findingId: string): void {
    const row = this.db.prepare(`SELECT * FROM quality_signals WHERE book_id = ? AND review_run_id = ? AND finding_id = ?
      ORDER BY rowid DESC LIMIT 1`).get(bookId, reviewRunId, findingId) as Row | undefined;
    requireLearning(row);
    const original = read<{ binding: { manuscript: { manuscriptId: string; branchId: string; revisionId: string; journalSequence: number }; resultSetRevisionId: string | null } }>(row);
    const candidate = reviewDispositionCandidate({ signalId: String(row.signal_id), reviewRunId, findingId,
      categoryLabel: String(row.category_id), reason: String(row.reason), recordedAt: String(row.recorded_at) }, false);
    const source: LearningSourceReference = { bookId, ...original.binding.manuscript, markId: row.mark_id === null ? null : String(row.mark_id),
      decisionId: String(row.disposition_id), blockDigest: null, materialKey: candidate.materialKey, materialDigest: learningMaterialDigest(candidate),
      reasonRevision: 0, reviewRunId, findingId, resultSetRevisionId: original.binding.resultSetRevisionId };
    this.#capture(String(row.signal_id), 'review-finding-ignored', source, null, candidate.recordedAt);
  }

  /** Actual control/standing owners supply the complete reviewed capture vector. */
  wordImportControls(bookId: string, materials: ReadonlyArray<{ templateKey: string; materialKey: string; materialDigest: string }>): WordImportControlsSnapshot {
    return this.#read(() => {
      requireLearning(UUID_PATTERN.test(bookId) && new Set(materials.map((material) => material.templateKey)).size === materials.length);
      const rows = this.#controlRows();
      const global = rows.filter(({ record }) => record.kind === 'switch').at(-1);
      const book = rows.filter(({ record }) => record.kind === 'book' && record.bookId === bookId).at(-1);
      const reference = (entry: typeof global): WordImportControlsSnapshot['global']['reference'] => entry === undefined
        ? { kind: 'default', basis: LOCAL_LEARNING_POLICY_BASIS }
        : { kind: 'entry', entryId: entry.record.entryId, sha256: String(entry.row.sha256) };
      return { global: { enabled: global?.record.value ?? true, reference: reference(global) },
        book: { excluded: book?.record.value ?? false, reference: reference(book) },
        materials: materials.map((material) => {
          const last = this.#eligibilityHistory(bookId, material.materialKey).at(-1);
          requireLearning(last === undefined || last.materialDigest === material.materialDigest);
          return { templateKey: material.templateKey, materialDigest: material.materialDigest,
            standing: { choice: last?.choice ?? 'house', decisionId: last?.decisionId ?? null,
              decisionDigest: last?.recordDigest ?? null, basisVersion: last?.basis.version ?? LOCAL_LEARNING_POLICY_BASIS.version } };
        }) };
    });
  }

  /** One atomic batch shares source/import validation, without copying or rehashing the graph per sample. */
  captureWordSamples(sources: ReadonlyArray<WordTrackedEditLearningSource>, abortSignal?: AbortSignal): string[] {
    abortSignal?.throwIfAborted();
    requireLearning(this.db.isTransaction);
    return this.#read(() => {
      const result: string[] = [];
      const controls = this.controls();
      if (sources.length === 0) return result;
      requireLearning(new Set(sources.map((source) => source.sampleId)).size === sources.length &&
        sources.every((source) => source.bookId === sources[0]!.bookId && source.importCommitId === sources[0]!.importCommitId));
      const evidenceBySample = sources.map((source) => { abortSignal?.throwIfAborted(); return this.#wordEvidence(source); });
      const current = this.wordImportControls(sources[0]!.bookId, sources.map((source, index) => ({
        templateKey: evidenceBySample[index]!.templateKey, materialKey: source.materialKey, materialDigest: source.materialDigest })));
      for (let index = 0; index < sources.length; index += 1) {
        abortSignal?.throwIfAborted();
        const source = sources[index]!;
        const evidence = evidenceBySample[index]!;
        const eligibility = this.#standing(source.bookId, source.materialKey);
        // The caller must omit ineligible evidence entirely; persisted admissions cannot override current controls.
        requireLearning(controls.enabled && !controls.excludedBooks.has(source.bookId) &&
          (eligibility.choice === 'book' || eligibility.choice === 'house'));
        requireLearning(canonicalJson(current.global) === canonicalJson(evidence.admission.global) &&
          canonicalJson(current.book) === canonicalJson(evidence.admission.book) &&
          canonicalJson(current.materials[index]!.standing) === canonicalJson(evidence.admission.standing));
        const sourceKey = `word-sample:${source.sampleId}:${source.sampleDigest}`;
        const prior = this.db.prepare('SELECT signal_id FROM learning_signals WHERE source_key = ?').get(sourceKey);
        if (prior !== undefined) {
          const signal = this.#signal(String(prior.signal_id));
          requireLearning(signal.kind === 'word-tracked-edit' && signal.source.bookId === source.bookId &&
            signal.source.sampleDigest === source.sampleDigest);
          result.push(signal.signalId); continue;
        }
        const signal: WordTrackedEditLearningSignal = { schema: 'ai7.word-import-learning-signal/1', signalId: randomUUID(),
          kind: 'word-tracked-edit', source, rewriteDistance: null, eligibility,
          attribution: this.#attribution(source.bookId, evidence.recordedAt), recordedAt: evidence.recordedAt };
        const record = canonicalRecord({ ...signal, basis: LOCAL_LEARNING_POLICY_BASIS });
        this.db.prepare('INSERT INTO learning_signals(signal_id, book_id, source_key, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
          .run(signal.signalId, source.bookId, sourceKey, signal.recordedAt, record.json, record.digest);
        result.push(signal.signalId);
      }
      return result;
    });
  }

  #wordEvidence(source: WordTrackedEditLearningSource): { candidate: LearningMaterialCandidate; templateKey: string;
    admission: WordLocalImportAdmission; recordedAt: string } {
    requireLearning(isRecord(source) && hasExactKeys(source, ['bookId', 'sampleId', 'sampleDigest', 'sourceVersionId', 'sourceDigest',
      'graphDigest', 'importCommitId', 'admissionDigest', 'materialKey', 'materialDigest']) &&
      [source.bookId, source.sourceVersionId, source.importCommitId].every((id) => UUID_PATTERN.test(id)) &&
      /^wts_[0-9a-f]{64}$/u.test(source.sampleId) && source.materialKey === `word-sample:${source.sampleId}` &&
      [source.sampleDigest, source.sourceDigest, source.graphDigest, source.admissionDigest, source.materialDigest].every((digest) => DIGEST_PATTERN.test(digest)));
    const parent = readWordParentSourcePin(this.db, source.bookId, source.sourceVersionId);
    const pin = wordParentSourcePinRecord(parent);
    requireLearning(parent.sourceDigest === source.sourceDigest);
    let graph = this.#reads?.wordSources.get(source.sourceVersionId);
    const sourceRow = this.db.prepare(`SELECT book_id, object_digest, parent_parser_identity, parent_source_pin_json,
      parent_source_pin_digest, compiler_identity, extractor_identity, graph_digest
      FROM word_revision_sources WHERE source_version_id = ?`).get(source.sourceVersionId);
    requireLearning(sourceRow && sourceRow.book_id === source.bookId && sourceRow.object_digest === source.sourceDigest &&
      sourceRow.parent_parser_identity === parent.parserIdentity && sourceRow.parent_source_pin_json === pin.json &&
      sourceRow.compiler_identity === WORD_DOCX_PARSER_IDENTITY && sourceRow.extractor_identity === WORD_EXTRACTOR_IDENTITY &&
      sourceRow.parent_source_pin_digest === pin.digest && sourceRow.graph_digest === source.graphDigest);
    if (graph === undefined) {
      const row = this.db.prepare('SELECT graph_json canonical_json, graph_digest sha256 FROM word_revision_sources WHERE source_version_id = ?')
        .get(source.sourceVersionId);
      requireLearning(row);
      const compiledGraph = read<WordRevisionGraph>(row);
      requireWordRevisionSource(this.db, parent, compiledGraph);
      requireLearning(Array.isArray(compiledGraph.events));
      graph = { graphDigest: source.graphDigest, parentPinDigest: pin.digest, events: new Set(compiledGraph.events.map((event) => event.eventId)) };
      this.#reads?.wordSources.set(source.sourceVersionId, graph);
    }
    requireLearning(graph.graphDigest === source.graphDigest && graph.parentPinDigest === pin.digest);
    const sampleRow = this.db.prepare('SELECT * FROM word_tracked_edit_samples WHERE sample_id = ?').get(source.sampleId);
    requireLearning(sampleRow && sampleRow.book_id === source.bookId && sampleRow.source_version_id === source.sourceVersionId && sampleRow.sha256 === source.sampleDigest);
    const storedSample = read<WordTrackedEditSample & { schema: string }>(sampleRow);
    requireLearning(isRecord(storedSample) && hasExactKeys(storedSample, ['schema', 'sampleId', 'bookId', 'sourceDigest', 'extractorIdentity', 'graphDigest',
      'operationKind', 'eventMembership', 'before', 'after', 'sourceLocation', 'destinationLocation']) &&
      ['insert', 'delete', 'replace', 'move', 'paragraph-boundary'].includes(storedSample.operationKind));
    const { schema, ...sample } = storedSample;
    const { sampleId, bookId, sourceDigest, extractorIdentity, graphDigest, ...template } = sample;
    const templateKey = wordTemplateKey(sourceDigest, template);
    requireLearning(schema === 'ai7.word-tracked-edit-sample/1' && sampleId === source.sampleId && bookId === source.bookId &&
      sourceDigest === source.sourceDigest && graphDigest === source.graphDigest && extractorIdentity === WORD_EXTRACTOR_IDENTITY &&
      templateKey === sampleRow.template_key && sampleId === `wts_${sha256Hex(canonicalJson({ schema: 'ai7.word-sample-id/1', bookId, templateKey }))}` &&
      wordTrackedSampleRecord(sample).json === sampleRow.canonical_json && Array.isArray(template.before) && Array.isArray(template.after) &&
      template.before.length + template.after.length > 0 && Array.isArray(template.eventMembership) &&
      template.eventMembership.length > 0 && template.eventMembership.every((id) => graph.events.has(id)));
    let imported = this.#reads?.wordImports.get(source.importCommitId);
    const importRow = this.db.prepare(`SELECT wi.commit_id, wi.source_version_id, wi.book_id, wi.fidelity_review_id,
      wi.revision_id, wi.mode, wi.sha256, wi.created_at, ic.operation_kind, ic.review_digest, ic.committed_at, mir.imported_at,
      mir.book_id original_book_id, mir.source_version_id original_source_id, mir.resulting_revision_id original_revision_id,
      mir.fidelity_review_id original_fidelity_id, fr.book_id fidelity_book_id, fr.source_version_id fidelity_source_id,
      m.book_id revision_book_id, mr.source_version_id revision_source_id
      FROM word_revision_imports wi JOIN import_commits ic ON ic.commit_id = wi.commit_id
      JOIN manuscript_import_records mir ON mir.commit_id = wi.commit_id
      JOIN import_fidelity_reviews fr ON fr.fidelity_review_id = wi.fidelity_review_id
      JOIN manuscript_revisions mr ON mr.revision_id = wi.revision_id
      JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id WHERE wi.commit_id = ?`).get(source.importCommitId);
    requireLearning(importRow && importRow.book_id === source.bookId && importRow.original_book_id === source.bookId &&
      importRow.source_version_id === source.sourceVersionId && importRow.original_source_id === source.sourceVersionId &&
      importRow.fidelity_book_id === source.bookId && importRow.revision_book_id === source.bookId &&
      importRow.fidelity_source_id === source.sourceVersionId && importRow.revision_source_id === source.sourceVersionId &&
      importRow.revision_id === importRow.original_revision_id && importRow.fidelity_review_id === importRow.original_fidelity_id &&
      importRow.operation_kind === 'manuscript-import' && importRow.created_at === importRow.committed_at && importRow.created_at === importRow.imported_at);
    if (imported === undefined) {
      const choiceRow = this.db.prepare('SELECT canonical_json, sha256 FROM word_revision_imports WHERE commit_id = ?').get(source.importCommitId);
      requireLearning(choiceRow && choiceRow.sha256 === importRow.sha256);
      const choice = read<WordImportChoiceRecord>(choiceRow);
      requireLearning(isRecord(choice) && hasExactKeys(choice, ['schema', 'sourceVersionId', 'parentSourcePinDigest', 'originalDigest', 'workingObjectDigest',
        'importReviewId', 'fidelityReviewId', 'commitId', 'revisionId', 'extractorIdentity', 'graphDigest', 'readings', 'mappingDigest',
        'templateManifestDigest', 'effectiveControls', 'mode', 'learnFromEdits', 'acceptedBaselineConfirmed']));
      validateWordChoice({ mode: choice.mode, learnFromEdits: choice.learnFromEdits, acceptedBaselineConfirmed: choice.acceptedBaselineConfirmed });
      requireLearning(isRecord(choice.effectiveControls) && hasExactKeys(choice.effectiveControls, ['global', 'book', 'materials']) &&
        isRecord(choice.effectiveControls.global) && hasExactKeys(choice.effectiveControls.global, ['enabled', 'reference']) &&
        isRecord(choice.effectiveControls.book) && hasExactKeys(choice.effectiveControls.book, ['excluded', 'reference']) &&
        wordControlReference(choice.effectiveControls.global.reference) && wordControlReference(choice.effectiveControls.book.reference) &&
        isRecord(choice.readings) && hasExactKeys(choice.readings, ['rejected', 'accepted']) &&
        [choice.mappingDigest, choice.templateManifestDigest].every((digest) => DIGEST_PATTERN.test(digest)));
      for (const reading of [choice.readings.rejected, choice.readings.accepted]) requireLearning(isRecord(reading) &&
        hasExactKeys(reading, ['digest', 'blockCount', 'usable']) && DIGEST_PATTERN.test(reading.digest) && Number.isSafeInteger(reading.blockCount) &&
        reading.blockCount >= 0 && typeof reading.usable === 'boolean' && (!reading.usable || reading.blockCount > 0));
      requireLearning(choice.readings[choice.mode === 'suggestions' ? 'rejected' : 'accepted'].usable);
      requireLearning(choice.schema === 'ai7.word-import-choice/1' && choice.learnFromEdits && choice.commitId === source.importCommitId &&
        choice.sourceVersionId === source.sourceVersionId && choice.originalDigest === source.sourceDigest && choice.parentSourcePinDigest === pin.digest &&
        choice.graphDigest === source.graphDigest && choice.extractorIdentity === WORD_EXTRACTOR_IDENTITY && choice.workingObjectDigest === null &&
        choice.revisionId === importRow.revision_id && choice.fidelityReviewId === importRow.fidelity_review_id && choice.importReviewId === importRow.review_digest &&
        choice.mode === importRow.mode && choice.effectiveControls.global.enabled && !choice.effectiveControls.book.excluded &&
        Array.isArray(choice.effectiveControls.materials));
      const materials = new Map(choice.effectiveControls.materials.map((material) => [material.templateKey, material]));
      requireLearning(materials.size === choice.effectiveControls.materials.length && choice.effectiveControls.materials.every((material) =>
        isRecord(material) && hasExactKeys(material, ['templateKey', 'materialDigest', 'standing']) &&
        DIGEST_PATTERN.test(material.templateKey) && DIGEST_PATTERN.test(material.materialDigest) && wordStanding(material.standing)));
      imported = { digest: String(importRow.sha256), choice, materials };
      this.#reads?.wordImports.set(source.importCommitId, imported);
    }
    requireLearning(imported.digest === importRow.sha256 && imported.choice.parentSourcePinDigest === pin.digest);
    const membership = this.db.prepare('SELECT * FROM word_tracked_edit_sample_imports WHERE sample_id = ? AND commit_id = ?')
      .get(source.sampleId, source.importCommitId);
    requireLearning(membership && membership.sample_digest === source.sampleDigest && membership.choice_digest === imported.digest && membership.sha256 === source.admissionDigest);
    const admission = read<WordLocalImportAdmission>(membership);
    requireLearning(isRecord(admission) && hasExactKeys(admission, ['schema', 'sampleId', 'sampleDigest', 'importChoiceDigest', 'basis',
      'reviewedLearnFromEdits', 'global', 'book', 'standing']));
    const standing = imported.materials.get(templateKey);
    requireLearning(standing && standing.materialDigest === source.materialDigest &&
      admission.schema === 'ai7.word-local-import-admission/1' && admission.sampleId === source.sampleId && admission.sampleDigest === source.sampleDigest &&
      admission.importChoiceDigest === imported.digest && canonicalJson(admission.basis) === canonicalJson(LOCAL_LEARNING_POLICY_BASIS) &&
      admission.reviewedLearnFromEdits === true && admission.global.enabled && !admission.book.excluded &&
      (admission.standing.choice === 'book' || admission.standing.choice === 'house') &&
      canonicalJson(admission.global) === canonicalJson(imported.choice.effectiveControls.global) &&
      canonicalJson(admission.book) === canonicalJson(imported.choice.effectiveControls.book) && canonicalJson(admission.standing) === canonicalJson(standing.standing));
    const recordedAt = String(membership.captured_at);
    requireLearning(Number.isFinite(Date.parse(recordedAt)) && recordedAt === importRow.created_at);
    const candidate = wordTrackedEditCandidate(sample, source.sampleDigest, recordedAt);
    requireLearning(learningMaterialDigest(candidate) === source.materialDigest);
    return { candidate, templateKey, admission, recordedAt };
  }

  #provedWordSignal(row: Row, signal: WordTrackedEditLearningSignal & { basis: unknown }): WordTrackedEditLearningSignal {
    requireLearning(isRecord(signal) && hasExactKeys(signal, ['schema', 'signalId', 'kind', 'source', 'rewriteDistance', 'eligibility', 'attribution', 'recordedAt', 'basis']) &&
      isRecord(signal.source) && signal.schema === 'ai7.word-import-learning-signal/1' && canonicalJson(signal.basis) === canonicalJson(LOCAL_LEARNING_POLICY_BASIS) &&
      signal.signalId === row.signal_id && signal.source.bookId === row.book_id && signal.recordedAt === row.recorded_at &&
      signal.rewriteDistance === null && signal.ask === undefined && UUID_PATTERN.test(signal.signalId) &&
      row.source_key === `word-sample:${signal.source.sampleId}:${signal.source.sampleDigest}`);
    requireLearning(isRecord(signal.attribution) && hasExactKeys(signal.attribution, ['peopleVersion', 'authors', 'editors']) &&
      Number.isSafeInteger(signal.attribution.peopleVersion) && signal.attribution.peopleVersion >= 0 &&
      [signal.attribution.authors, signal.attribution.editors].every((names) => Array.isArray(names) &&
        names.every((name) => typeof name === 'string' && name.isWellFormed())));
    const evidence = this.#wordEvidence(signal.source);
    requireLearning(signal.recordedAt === evidence.recordedAt && canonicalJson(signal.eligibility) === canonicalJson({
      choice: evidence.admission.standing.choice, decisionId: evidence.admission.standing.decisionId, basisVersion: evidence.admission.standing.basisVersion }));
    return signal;
  }

  #capture(sourceKey: string, kind: DecisionLearningSignal['kind'], source: LearningSourceReference, rewriteDistance: number | null, recordedAt: string, ask?: DecisionLearningSignal['ask']): string | null {
    const controls = this.controls();
    const eligibility = this.#standing(source.bookId, source.materialKey);
    if (!controls.enabled || controls.excludedBooks.has(source.bookId) || eligibility.choice === 'excluded' || eligibility.choice === 'deferred') return null;
    const prior = this.db.prepare('SELECT signal_id FROM learning_signals WHERE source_key = ?').get(sourceKey);
    if (prior) return String(prior.signal_id);
    const signal: DecisionLearningSignal = { signalId: randomUUID(), kind, source, rewriteDistance, eligibility,
      attribution: this.#attribution(source.bookId, recordedAt), recordedAt, ...(ask === undefined ? {} : { ask }) };
    const record = canonicalRecord({ ...signal, schema: 'ai7.learning-signal/1', basis: LOCAL_LEARNING_POLICY_BASIS });
    this.db.prepare('INSERT INTO learning_signals(signal_id, book_id, source_key, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(signal.signalId, source.bookId, sourceKey, recordedAt, record.json, record.digest);
    return signal.signalId;
  }

  #signal(id: string): LearningSignal {
    const row = this.db.prepare('SELECT * FROM learning_signals WHERE signal_id = ?').get(id) as Row | undefined;
    requireLearning(row);
    const known = this.#reads?.signals.get(id);
    if (known !== undefined && known.sha256 === row.sha256 && typeof row.canonical_json === 'string' && sha256Hex(row.canonical_json) === row.sha256) return known.signal;
    const signal = this.#provedSignal(row);
    this.#reads?.signals.set(id, { sha256: String(row.sha256), signal });
    return signal;
  }

  #provedSignal(row: Row): LearningSignal {
    const signal = read<LearningSignal & { schema: string; basis: unknown }>(row);
    if (signal.kind === 'word-tracked-edit') return this.#provedWordSignal(row, signal);
    requireLearning(signal.schema === 'ai7.learning-signal/1' && canonicalJson(signal.basis) === canonicalJson(LOCAL_LEARNING_POLICY_BASIS) &&
      signal.signalId === row.signal_id && signal.source.bookId === row.book_id && signal.recordedAt === row.recorded_at);
    const source = signal.source;
    const proactive = signal.kind === 'proactive-reason';
    if (proactive) requireLearning(signal.ask &&
      ['offered', 'suppressed', 'answered', 'dismissed'].includes(signal.ask.state) &&
      UUID_PATTERN.test(signal.ask.askId) && LEARNING_REASON_OPTIONS[signal.ask.disposition] !== undefined &&
      (signal.ask.choice === null || LEARNING_REASON_OPTIONS[signal.ask.disposition]!.includes(signal.ask.choice)) &&
      (signal.ask.text === null || typeof signal.ask.text === 'string' && signal.ask.text.isWellFormed() && graphemesOf(signal.ask.text).length <= 200) &&
      (signal.ask.state === 'answered' ? signal.ask.choice !== null || signal.ask.text !== null : signal.ask.choice === null && signal.ask.text === null) &&
      row.source_key === `ask:${source.decisionId}:${signal.ask.state}`);
    if (proactive && (signal.ask!.state === 'answered' || signal.ask!.state === 'dismissed')) {
      const offered = this.db.prepare('SELECT * FROM learning_signals WHERE source_key = ?').get(`ask:${source.decisionId}:offered`) as Row | undefined;
      requireLearning(offered);
      const original = read<LearningSignal>(offered);
      requireLearning(original.ask?.askId === signal.ask!.askId && canonicalJson(original.source) === canonicalJson(source));
    }
    if (source.reviewRunId === null) {
      const decision = this.db.prepare(`SELECT d.*, m.book_id, m.manuscript_id, m.branch_id, m.mark_id FROM proposal_item_decisions d
        JOIN proposal_change_items i ON i.item_id = d.item_id JOIN editorial_marks m ON m.mark_id = i.mark_id WHERE d.decision_id = ?`).get(source.decisionId);
      requireLearning(decision && decision.book_id === source.bookId && decision.manuscript_id === source.manuscriptId &&
        decision.branch_id === source.branchId && decision.mark_id === source.markId && decision.disposition === (proactive ? signal.ask!.disposition : signal.kind) &&
        decision.decided_revision_id === source.revisionId && decision.decided_journal_sequence === source.journalSequence &&
        decision.decided_block_digest === source.blockDigest && (proactive || row.source_key === `${source.decisionId}:${source.materialDigest}`));
    } else {
      const original = this.db.prepare('SELECT * FROM quality_signals WHERE disposition_id = ?').get(source.decisionId) as Row | undefined;
      requireLearning(original && (signal.kind === 'review-finding-ignored' || proactive) && original.book_id === source.bookId &&
        original.review_run_id === source.reviewRunId && original.finding_id === source.findingId && (proactive || row.source_key === original.signal_id));
      const record = read<{ binding: { manuscript: { manuscriptId: string; branchId: string; revisionId: string; journalSequence: number }; resultSetRevisionId: string | null } }>(original);
      requireLearning(record.binding.manuscript.manuscriptId === source.manuscriptId && record.binding.manuscript.branchId === source.branchId &&
        record.binding.manuscript.revisionId === source.revisionId && record.binding.manuscript.journalSequence === source.journalSequence &&
        record.binding.resultSetRevisionId === source.resultSetRevisionId && (original.mark_id === null ? null : String(original.mark_id)) === source.markId);
    }
    return signal;
  }

  /** A later decision on the item, or a revised reason, supersedes the source: never usable, and never shown as 明确排除. */
  #currentEligibility(signal: LearningSignal, controls: Controls): LearningSignalStanding {
    if (!controls.enabled || controls.excludedBooks.has(signal.source.bookId)) return 'excluded';
    if (signal.kind === 'word-tracked-edit') {
      this.#wordEvidence(signal.source);
      const last = this.#eligibilityHistory(signal.source.bookId, signal.source.materialKey).at(-1);
      requireLearning(last === undefined || last.materialDigest === signal.source.materialDigest);
      return this.#standing(signal.source.bookId, signal.source.materialKey).choice;
    }
    if (signal.kind === 'proactive-reason' && signal.ask?.state !== 'answered') return 'deferred';
    if (signal.source.reviewRunId === null) {
      const current = this.db.prepare(`SELECT decision_id FROM proposal_item_decisions WHERE item_id =
        (SELECT item_id FROM proposal_item_decisions WHERE decision_id = ?) ORDER BY ordinal DESC LIMIT 1`).get(signal.source.decisionId);
      if (current?.decision_id !== signal.source.decisionId) return 'superseded';
      const candidate = this.#candidate(signal.source.decisionId, signal.kind === 'proactive-reason')?.candidate;
      if (candidate === undefined || learningMaterialDigest(candidate) !== signal.source.materialDigest) return 'superseded';
    }
    return this.#standing(signal.source.bookId, signal.source.materialKey).choice;
  }

  /** Resolve a real decision, including an unreasoned rejection; never accept lineage supplied by the renderer. */
  #askDecision(decisionId: string): { source: LearningSourceReference; disposition: string; eligible: boolean } | null {
    const found = this.#candidate(decisionId, true);
    if (found !== null) {
      const { row, candidate, reasonRevision } = found;
      const latest = this.db.prepare('SELECT decision_id FROM proposal_item_decisions WHERE item_id = ? ORDER BY ordinal DESC LIMIT 1').get(row.item_id!);
      if (latest?.decision_id !== decisionId) return null;
      const finding = this.db.prepare('SELECT review_run_id, category_id FROM review_findings WHERE mark_id = ? ORDER BY rowid DESC LIMIT 1').get(row.mark_id!);
      // The third same-category edit of a Run asks once (Issue #1109); later ones in that Run do not, so a batch Apply never fans out.
      const repeated = finding !== undefined && Number(this.db.prepare(`SELECT count(DISTINCT d.item_id) n FROM proposal_item_decisions d
        JOIN proposal_change_items i ON i.item_id = d.item_id JOIN review_findings f ON f.mark_id = i.mark_id
        WHERE f.review_run_id = ? AND f.category_id = ? AND d.disposition IN ('accepted', 'accepted-with-edit')
          AND d.rowid <= (SELECT rowid FROM proposal_item_decisions WHERE decision_id = ?)`).get(finding.review_run_id!, finding.category_id!, decisionId)?.n) === 3;
      const disposition = String(row.disposition);
      return { disposition, eligible: disposition === 'rejected' ||
        disposition === 'accepted-with-edit' && row.edited_text !== row.proposed_text || repeated,
        source: { bookId: String(row.book_id), manuscriptId: String(row.manuscript_id), branchId: String(row.branch_id), markId: String(row.mark_id),
          decisionId, revisionId: String(row.decided_revision_id), journalSequence: Number(row.decided_journal_sequence),
          blockDigest: row.decided_block_digest === null ? null : String(row.decided_block_digest), materialKey: candidate.materialKey,
          materialDigest: learningMaterialDigest(candidate), reasonRevision, reviewRunId: null, findingId: null, resultSetRevisionId: null } };
    }
    const row = this.db.prepare('SELECT * FROM quality_signals WHERE disposition_id = ?').get(decisionId) as Row | undefined;
    if (row === undefined) return null;
    const original = read<{ binding: { manuscript: { manuscriptId: string; branchId: string; revisionId: string; journalSequence: number }; resultSetRevisionId: string | null } }>(row);
    const candidate = reviewDispositionCandidate({ signalId: String(row.signal_id), reviewRunId: String(row.review_run_id), findingId: String(row.finding_id),
      categoryLabel: String(row.category_id), reason: String(row.reason), recordedAt: String(row.recorded_at) }, false);
    return { disposition: 'ignored', eligible: true, source: { bookId: String(row.book_id), ...original.binding.manuscript,
      markId: row.mark_id === null ? null : String(row.mark_id), decisionId, blockDigest: null,
      materialKey: candidate.materialKey, materialDigest: learningMaterialDigest(candidate), reasonRevision: 0,
      reviewRunId: String(row.review_run_id), findingId: String(row.finding_id), resultSetRevisionId: original.binding.resultSetRevisionId } };
  }

  /** Append-only local asks: frequency survives restart and dismissal; no provider or decision dependency. Caller owns the transaction. */
  reasonAsk(input: LearningReasonAskInput, frequency: LearningReasonAskFrequency, now = new Date().toISOString()): LearningReasonAskProjection | null {
    if (input.action !== 'offer') {
      const row = this.db.prepare(`SELECT signal_id FROM learning_signals WHERE json_extract(canonical_json, '$.ask.askId') = ?
        AND json_extract(canonical_json, '$.ask.state') = 'offered'`).get(input.askId);
      requireLearning(row);
      const offer = this.#signal(String(row.signal_id));
      requireLearning(offer.kind === 'proactive-reason' && offer.ask);
      const answer = input.action === 'answer';
      const choice = answer ? input.choice : null;
      const own = answer ? input.text?.trim() || null : null;
      requireLearning(!answer || (choice === null || LEARNING_REASON_OPTIONS[offer.ask.disposition]?.includes(choice)) &&
        (own === null || own.isWellFormed() && own.length <= 2_048 && graphemesOf(own).length <= 200) && (choice !== null || own !== null));
      const settled = this.db.prepare(`SELECT canonical_json FROM learning_signals WHERE source_key IN (?, ?)`).get(
        `ask:${offer.source.decisionId}:answered`, `ask:${offer.source.decisionId}:dismissed`);
      if (settled) return null;
      const current = this.#askDecision(offer.source.decisionId);
      requireLearning(current && current.source.materialDigest === offer.source.materialDigest);
      requireLearning(this.#capture(`ask:${offer.source.decisionId}:${answer ? 'answered' : 'dismissed'}`, 'proactive-reason', offer.source, null, now,
        { ...offer.ask, state: answer ? 'answered' : 'dismissed', choice, text: own }) !== null);
      return null;
    }
    if (frequency === 'off') return null;
    const decision = this.#askDecision(input.decisionId);
    if (decision === null || !decision.eligible) return null;
    const { source, disposition } = decision;
    const controls = this.controls();
    if (!controls.enabled || controls.excludedBooks.has(source.bookId) || ['excluded', 'deferred'].includes(this.#standing(source.bookId, source.materialKey).choice)) return null;
    const prior = this.db.prepare(`SELECT signal_id FROM learning_signals WHERE source_key IN (?, ?, ?, ?)`).get(
      `ask:${input.decisionId}:offered`, `ask:${input.decisionId}:suppressed`, `ask:${input.decisionId}:answered`, `ask:${input.decisionId}:dismissed`);
    // A decision is considered once, even after a restart or a changed frequency. Reading a card never asks again.
    if (prior) return null;
    const last = this.db.prepare(`SELECT rowid, recorded_at FROM learning_signals
      WHERE json_extract(canonical_json, '$.kind') = 'proactive-reason' AND json_extract(canonical_json, '$.ask.state') = 'offered'
      ORDER BY rowid DESC LIMIT 1`).get();
    const since = Number(this.db.prepare(`SELECT count(*) n FROM learning_signals WHERE rowid > ?
      AND json_extract(canonical_json, '$.kind') = 'proactive-reason'
      AND json_extract(canonical_json, '$.ask.state') IN ('offered', 'suppressed')`).get(last?.rowid ?? 0)?.n);
    const show = frequency === 'often' || since >= 2 && (last === undefined || Date.parse(now) - Date.parse(String(last.recorded_at)) >= 60_000);
    const askId = randomUUID();
    const saved = this.#capture(`ask:${input.decisionId}:${show ? 'offered' : 'suppressed'}`, 'proactive-reason', source, null, now,
      { askId, state: show ? 'offered' : 'suppressed', disposition, choice: null, text: null });
    return !show || saved === null ? null : { askId, decisionId: input.decisionId,
      question: disposition === 'accepted-with-edit' ? '这次为什么这样改？' : disposition === 'accepted' ? '这类修改为什么合适？' : '这次为什么不采用？',
      options: LEARNING_REASON_OPTIONS[disposition] ?? [] };
  }

  /** Passive comparisons from finding/decision records; pending findings remain in the denominator. */
  adoption(bookId: string | null, after: PreferenceAdoptionCursor | null = null): { preferenceAdoption: PreferenceAdoptionProjection[]; preferenceAdoptionNext: PreferenceAdoptionCursor | null } {
    const rows = this.db.prepare(`SELECT f.*, r.book_id, b.title book_title, m.status mark_status,
      (SELECT d.disposition FROM proposal_change_items i JOIN proposal_item_decisions d ON d.item_id = i.item_id
       WHERE i.mark_id = f.mark_id ORDER BY d.ordinal DESC LIMIT 1) decision,
      EXISTS(SELECT 1 FROM review_finding_dispositions d WHERE d.review_run_id = f.review_run_id AND d.finding_id = f.finding_id AND d.disposition = 'ignored') ignored
      FROM review_findings f JOIN review_runs r ON r.review_run_id = f.review_run_id JOIN books b ON b.book_id = r.book_id
      LEFT JOIN editorial_marks m ON m.mark_id = f.mark_id WHERE (? IS NULL OR r.book_id = ?) ORDER BY r.book_id, f.rowid`).all(bookId, bookId) as Row[];
    const books = new Map<string, Array<{ refs: readonly ReferencedRuleVersion[]; accepted: boolean; rejected: boolean }>>();
    const titles = new Map<string, string>();
    for (const row of rows) {
      const id = String(row.book_id); titles.set(id, String(row.book_title));
      const record = read<{ referencedRuleVersions?: readonly ReferencedRuleVersion[] }>(row);
      const entry = { refs: record.referencedRuleVersions ?? [],
        accepted: row.ignored !== 1 && row.decision !== 'rejected' && (row.mark_status === 'applied' ||
          row.output === 'annotation' && row.mark_status === 'resolved' || row.decision === 'accepted' || row.decision === 'accepted-with-edit'),
        rejected: row.ignored === 1 || row.decision === 'rejected' };
      const entries = books.get(id) ?? []; entries.push(entry); books.set(id, entries);
    }
    const result: PreferenceAdoptionProjection[] = [];
    for (const [id, entries] of books) {
      const versions = new Map(entries.flatMap((entry) => entry.refs.map((ref) => [ref.versionId, ref.ordinal] as const)));
      for (const versionId of [null, ...versions.keys()]) {
        const counts = (referenced: boolean) => {
          const cohort = entries.filter((entry) => (versionId === null ? entry.refs.length > 0 : entry.refs.some((ref) => ref.versionId === versionId)) === referenced);
          const accepted = cohort.filter((entry) => entry.accepted).length;
          return { findings: cohort.length, accepted, rejected: cohort.filter((entry) => entry.rejected).length,
            rate: cohort.length === 0 ? null : accepted / cohort.length };
        };
        const referenced = counts(true);
        result.push({ bookId: id, bookTitle: titles.get(id)!, versionId, ordinal: versionId === null ? null : versions.get(versionId)!,
          referenced, unreferenced: counts(false), mostlyRejected: referenced.rejected > referenced.findings / 2 });
      }
    }
    const key = (row: PreferenceAdoptionCursor) => `${row.bookId}/${row.versionId ?? ''}`;
    const ordered = result.sort((a, b) => key(a).localeCompare(key(b), 'en'))
      .filter((row) => after === null || key(row).localeCompare(key(after), 'en') > 0);
    const preferenceAdoption = ordered.slice(0, 40);
    const last = preferenceAdoption.at(-1);
    return { preferenceAdoption, preferenceAdoptionNext: ordered.length <= 40 || last === undefined ? null : { bookId: last.bookId, versionId: last.versionId } };
  }

  change(input: ChangeEditorialLearningInput): void {
    const controls = this.controls();
    if (input.kind === 'material') {
      const signal = this.#signal(input.signalId);
      let candidate: LearningMaterialCandidate | null = null;
      if (signal.kind === 'word-tracked-edit') candidate = this.#wordEvidence(signal.source).candidate;
      else if (signal.source.reviewRunId === null) candidate = this.#candidate(signal.source.decisionId, signal.kind === 'proactive-reason')?.candidate ?? null;
      else {
        const row = this.db.prepare('SELECT * FROM quality_signals WHERE disposition_id = ?').get(signal.source.decisionId) as Row | undefined;
        if (row) candidate = reviewDispositionCandidate({ signalId: String(row.signal_id), reviewRunId: String(row.review_run_id),
          findingId: String(row.finding_id), categoryLabel: String(row.category_id), reason: String(row.reason), recordedAt: String(row.recorded_at) }, false);
      }
      requireLearning(candidate);
      const eligibility = new LearningEligibilityLedger(this.db);
      const last = eligibility.history(signal.source.bookId, candidate.materialKey).at(-1);
      if (last?.choice !== 'excluded') eligibility.decide({ bookId: signal.source.bookId, candidate, expectedDecisions: last?.ordinal ?? 0,
        choice: 'excluded', note: null, attribution: this.#attribution(signal.source.bookId, new Date().toISOString()) });
      return;
    }
    requireLearning(input.expectedEntries === controls.entries);
    if (input.kind === 'book') requireLearning(this.db.prepare('SELECT 1 FROM books WHERE book_id = ?').get(input.bookId));
    const entryId = randomUUID(); const recordedAt = new Date().toISOString();
    const bookId = input.kind === 'book' ? input.bookId : null;
    const value = input.kind === 'switch' ? input.enabled : input.excluded;
    const record = canonicalRecord({ schema: 'ai7.editorial-learning-control/1', entryId, ordinal: controls.entries + 1,
      kind: input.kind, bookId, value, actor: 'editor', recordedAt, basis: LOCAL_LEARNING_POLICY_BASIS });
    this.db.prepare('INSERT INTO editorial_learning_controls VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(entryId, controls.entries + 1, input.kind, bookId, Number(value), recordedAt, record.json, record.digest);
  }

  /** Relevant control identities only: another Book's control cannot invalidate this source. */
  #controlSnapshot(bookId: string): EditorialMemoryAdmission['controls'] {
    let switchEntryId: string | null = null; let bookEntryId: string | null = null;
    for (const { record } of this.#controlRows()) {
      if (record.kind === 'switch') switchEntryId = record.entryId;
      else if (record.bookId === bookId) bookEntryId = record.entryId;
    }
    return { switchEntryId, bookEntryId };
  }

  /** Prove review category and production scope independently of local automatic capture. */
  #reviewOrigin(signal: LearningSignal): { operationalScope: TrustedOperationalScope; editorialDimension: string };
  #reviewOrigin(signal: LearningSignal, allowMissing: true): { operationalScope: TrustedOperationalScope; editorialDimension: string } | null;
  #reviewOrigin(signal: LearningSignal, allowMissing = false): { operationalScope: TrustedOperationalScope; editorialDimension: string } | null {
    const known = this.#reads?.origins.get(signal.signalId);
    if (known !== undefined) return known;
    const origin = this.#provedOrigin(signal, allowMissing);
    if (origin !== null) this.#reads?.origins.set(signal.signalId, origin);
    return origin;
  }

  #provedOrigin(signal: LearningSignal, allowMissing: boolean): { operationalScope: TrustedOperationalScope; editorialDimension: string } | null {
    if (signal.kind === 'word-tracked-edit' || !['accepted', 'accepted-with-edit', 'rejected'].includes(signal.kind) || signal.source.reviewRunId !== null) {
      requireLearning(allowMissing); return null;
    }
    const finding = this.db.prepare(`SELECT f.review_run_id, f.category_id FROM proposal_item_decisions d
      JOIN proposal_change_items i ON i.item_id = d.item_id JOIN review_findings f ON f.mark_id = i.mark_id
      WHERE d.decision_id = ? ORDER BY f.rowid LIMIT 1`).get(signal.source.decisionId);
    if (!finding || reviewCategoryEntry(String(finding.category_id)) === null) { requireLearning(allowMissing); return null; }
    const revision = this.db.prepare(`SELECT r.canonical_json, r.sha256 FROM review_run_category_events e
      JOIN analysis_result_set_revisions r ON r.revision_id = e.result_set_revision_id
      WHERE e.review_run_id = ? AND e.category_id = ? AND e.state = 'materialized' ORDER BY e.sequence DESC LIMIT 1`)
      .get(finding.review_run_id!, finding.category_id!) as Row | undefined;
    if (revision === undefined) { requireLearning(allowMissing); return null; }
    const origin = read<{ policyPin?: { operationalScope?: TrustedOperationalScope } }>(revision).policyPin?.operationalScope;
    if (origin === undefined) { requireLearning(allowMissing); return null; }
    requireLearning(origin !== undefined && ['ordinary-production', 'developer-live', 'development-ci'].includes(origin));
    return { operationalScope: origin, editorialDimension: String(finding.category_id) };
  }

  /** A current proved source, not an inference from old keys or memory existence. Corruption is never swallowed. */
  automaticAdmissionFor(bookId: string, materialKey: string, materialDigest: string, scope: TrustedOperationalScope): { choice: 'house'; sourceKeys: string[] } | null {
    if (this.#eligibilityHistory(bookId, materialKey).length > 0) return null;
    const controls = this.controls();
    if (!controls.enabled || controls.excludedBooks.has(bookId)) return null;
    const sourceKeys: string[] = [];
    for (const row of this.db.prepare('SELECT signal_id FROM learning_signals WHERE book_id = ?').iterate(bookId)) {
      const signal = this.#signal(String(row.signal_id));
      if (signal.source.materialKey !== materialKey || signal.source.materialDigest !== materialDigest || this.#currentEligibility(signal, controls) !== 'house') continue;
      const origin = this.#reviewOrigin(signal, true);
      if (origin?.operationalScope !== scope) continue;
      const snapshot = this.sourceSnapshot(signal.signalId);
      requireLearning(snapshot.admission.kind === 'automatic'); sourceKeys.push(snapshot.sourceKey);
    }
    return sourceKeys.length === 0 ? null : { choice: 'house', sourceKeys: sourceKeys.sort() };
  }

  sourceSnapshot(signalId: string): EditorialMemorySourceSnapshot {
    const standing = this.#sourceStanding(signalId);
    requireLearning('snapshot' in standing);
    return standing.snapshot;
  }

  /**
   * Where one signal stands as a memory source now (Issue #1128 revision 8): its current snapshot, or the normal reason it is
   * not — learning off, an excluded Book or material, a deferred or superseded source, an admission made for another version of
   * its material, or a signal outside the review-decision family. Only validated records give such a reason; a malformed or
   * missing signal, control, decision chain or review origin propagates its refusal and never reads as absence.
   */
  #sourceStanding(signalId: string): { readonly snapshot: EditorialMemorySourceSnapshot } | { readonly unavailable: 'not-current' | 'not-review' } {
    const signal = this.#signal(signalId);
    if (signal.kind === 'word-tracked-edit') return { unavailable: 'not-review' };
    const eligibility = this.#currentEligibility(signal, this.controls());
    if (eligibility !== 'book' && eligibility !== 'house') return { unavailable: 'not-current' };
    const origin = this.#reviewOrigin(signal, true);
    if (origin === null) return { unavailable: 'not-review' };
    const last = this.#eligibilityHistory(signal.source.bookId, signal.source.materialKey).at(-1);
    const controls = this.#controlSnapshot(signal.source.bookId);
    if (last !== undefined && last.materialDigest !== signal.source.materialDigest) return { unavailable: 'not-current' };
    const admission: EditorialMemoryAdmission = last === undefined
      ? { kind: 'automatic', basis: { policy: LOCAL_LEARNING_POLICY_BASIS.policy, mode: LOCAL_LEARNING_POLICY_BASIS.mode, version: 2 },
        signalId, materialDigest: signal.source.materialDigest, controls }
      : { kind: 'explicit', decisionId: last.decisionId, ordinal: last.ordinal, basis: last.basis,
        materialDigest: signal.source.materialDigest, controls };
    return { snapshot: { sourceKey: sha256Hex(canonicalJson({ signalId, materialDigest: signal.source.materialDigest, reasonRevision: signal.source.reasonRevision })),
      feedbackKey: sha256Hex(canonicalJson({ bookId: signal.source.bookId, materialKey: signal.source.materialKey, materialDigest: signal.source.materialDigest })),
      signalId, source: signal.source, ...origin, eligibility, admission, attribution: signal.attribution,
      bookTitle: String(this.db.prepare('SELECT title FROM books WHERE book_id = ?').get(signal.source.bookId)?.title ?? '') } };
  }

  #validateSource(snapshot: EditorialMemorySourceSnapshot): void {
    validateEditorialMemorySourceShape(snapshot);
    const key = this.#reads === null ? null : sha256Hex(canonicalJson(snapshot));
    if (key !== null && this.#reads!.snapshots.has(key)) return;
    this.#provedSource(snapshot);
    if (key !== null) this.#reads?.snapshots.add(key);
  }

  #provedSource(snapshot: EditorialMemorySourceSnapshot): void {
    const signal = this.#signal(snapshot.signalId);
    requireLearning(signal.kind !== 'word-tracked-edit');
    requireLearning(canonicalJson(snapshot.source) === canonicalJson(signal.source) &&
      canonicalJson(snapshot.attribution) === canonicalJson(signal.attribution) &&
      snapshot.sourceKey === sha256Hex(canonicalJson({ signalId: signal.signalId, materialDigest: signal.source.materialDigest, reasonRevision: signal.source.reasonRevision })) &&
      snapshot.feedbackKey === sha256Hex(canonicalJson({ bookId: signal.source.bookId, materialKey: signal.source.materialKey, materialDigest: signal.source.materialDigest })) &&
      canonicalJson(this.#reviewOrigin(signal)) === canonicalJson({ operationalScope: snapshot.operationalScope, editorialDimension: snapshot.editorialDimension }));
    const admission = snapshot.admission;
    requireLearning(isRecord(admission) && admission.materialDigest === signal.source.materialDigest && isRecord(admission.controls));
    if (admission.kind === 'explicit') {
      const decision = this.#eligibilityHistory(signal.source.bookId, signal.source.materialKey).find((entry) => entry.decisionId === admission.decisionId);
      requireLearning(decision && decision.ordinal === admission.ordinal && decision.materialDigest === admission.materialDigest &&
        (decision.choice === 'book' || decision.choice === 'house') && decision.choice === snapshot.eligibility && canonicalJson(decision.basis) === canonicalJson(admission.basis));
    } else requireLearning(admission.kind === 'automatic' && admission.signalId === signal.signalId && canonicalJson(admission.basis) ===
      canonicalJson({ policy: LOCAL_LEARNING_POLICY_BASIS.policy, mode: LOCAL_LEARNING_POLICY_BASIS.mode, version: 2 }) && snapshot.eligibility === 'house');
    for (const [kind, id] of [['switch', admission.controls.switchEntryId], ['book', admission.controls.bookEntryId]] as const) {
      requireLearning(id === null || this.#controlRows().some(({ record }) => record.entryId === id && record.kind === kind &&
        (kind === 'switch' ? record.value : record.bookId === signal.source.bookId && !record.value)));
    }
  }

  validateSourceSnapshot(snapshot: EditorialMemorySourceSnapshot): void { this.#validateSource(snapshot); }

  /** Validate any Book-owned facts still present, without treating absent House control/memory records as current authority. */
  validateHistoricalSource(snapshot: EditorialMemorySourceSnapshot): boolean {
    validateEditorialMemorySourceShape(snapshot);
    if (!this.db.prepare('SELECT 1 FROM learning_signals WHERE signal_id = ?').get(snapshot.signalId)) return false;
    const signal = this.#signal(snapshot.signalId);
    requireLearning(signal.kind !== 'word-tracked-edit');
    requireLearning(canonicalJson(signal.source) === canonicalJson(snapshot.source) && canonicalJson(signal.attribution) === canonicalJson(snapshot.attribution) &&
      canonicalJson(this.#reviewOrigin(signal)) === canonicalJson({ operationalScope: snapshot.operationalScope, editorialDimension: snapshot.editorialDimension }));
    return true;
  }

  /** A withdrawal after this publication's basis stays historical even after a deliberate restore. */
  sourceWithdrawalAt(snapshot: EditorialMemorySourceSnapshot): string | null {
    requireLearning(this.validateHistoricalSource(snapshot));
    const events: string[] = [];
    const controls = this.#controlRows().map((entry) => entry.record);
    for (const [kind, id] of [['switch', snapshot.admission.controls.switchEntryId], ['book', snapshot.admission.controls.bookEntryId]] as const) {
      const basis = id === null ? 0 : controls.find((entry) => entry.entryId === id)?.ordinal;
      // A missing source-House switch cannot be guessed from this House's unrelated control sequence.
      if (basis === undefined) continue;
      const stopped = controls.find((entry) => entry.ordinal > basis && entry.kind === kind &&
        (kind === 'switch' ? !entry.value : entry.bookId === snapshot.source.bookId && entry.value));
      if (stopped !== undefined) events.push(stopped.recordedAt);
    }
    const chain = this.#eligibilityHistory(snapshot.source.bookId, snapshot.source.materialKey);
    const admission = snapshot.admission;
    const basis = admission.kind === 'automatic' ? 0 : chain.find((entry) => entry.decisionId === admission.decisionId)?.ordinal;
    requireLearning(basis !== undefined);
    const excluded = chain.find((entry) => entry.ordinal > basis && entry.choice === 'excluded');
    if (excluded !== undefined) events.push(excluded.recordedAt);
    return events.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  }

  #validateMemory(version: EditorialMemoryVersion): void {
    requireLearning(Object.keys(version).sort().join(',') === ['schema', 'itemId', 'versionId', 'ordinal', 'supersedes', 'recordedAt', 'operationalScope',
      'applicability', 'editorialDimension', 'title', 'confidence', 'state', 'actor', 'actionId', 'action', 'signalIds', 'positiveExamples',
      'negativeExamples', 'sources', 'parentVersions', 'supervisionDirectiveRefs'].sort().join(',') &&
      UUID_PATTERN.test(version.actionId) && reviewCategoryEntry(version.editorialDimension) !== null &&
      typeof version.title === 'string' && version.title.trim().length > 0 && version.title.length <= 160 && version.title.isWellFormed() &&
      !/[\r\n\p{Cc}\p{Zl}\p{Zp}]/u.test(version.title) &&
      ['development-ci', 'developer-live', 'ordinary-production'].includes(version.operationalScope) &&
      ['create', 'accept', 'merge', 'correct', 'deactivate', 'freeze'].includes(version.action) &&
      isRecord(version.applicability) && (version.applicability.kind === 'house' && Object.keys(version.applicability).length === 1 ||
        version.applicability.kind === 'book' && Object.keys(version.applicability).length === 2 && UUID_PATTERN.test(version.applicability.bookId)) &&
      Array.isArray(version.signalIds) && version.signalIds.length <= 10 && new Set(version.signalIds).size === version.signalIds.length &&
      Array.isArray(version.sources) && version.sources.length === version.signalIds.length &&
      Array.isArray(version.parentVersions) && version.parentVersions.length <= 12 &&
      new Set(version.parentVersions.map((pin) => pin.itemId)).size === version.parentVersions.length &&
      Array.isArray(version.supervisionDirectiveRefs) && version.supervisionDirectiveRefs.length <= 1);
    requireLearning(version.action === 'create' || version.action === 'accept' ? version.supervisionDirectiveRefs.length === 0
      : version.action === 'deactivate' || version.supervisionDirectiveRefs.length === 1);
    version.sources.forEach((source, index) => { requireLearning(source.signalId === version.signalIds[index]); this.#validateSource(source); });
    requireLearning(canonicalJson(version.positiveExamples) === canonicalJson(version.sources.filter((entry) => this.#signal(entry.signalId).kind !== 'rejected').map((entry) => entry.source)) &&
      canonicalJson(version.negativeExamples) === canonicalJson(version.sources.filter((entry) => this.#signal(entry.signalId).kind === 'rejected').map((entry) => entry.source)));
    requireLearning(version.action === 'create' ? version.ordinal === 1 && version.state === 'proposed' && version.sources.length > 0 && version.parentVersions.length === 0
      : version.parentVersions.length > 0);
    for (const id of version.supervisionDirectiveRefs) {
      const row = this.db.prepare('SELECT * FROM learning_supervision_directives WHERE directive_id = ?').get(id) as Row | undefined;
      requireLearning(row);
      const directive = read<LearningSupervisionDirective>(row);
      requireLearning(directive.schema === 'ai7.learning-supervision-directive/1' && directive.actor === 'editor' && directive.directiveId === id &&
        directive.directiveId === row.directive_id && directive.operationalScope === row.operational_scope && directive.ordinal === row.ordinal &&
        directive.recordedAt === row.recorded_at && canonicalJson(directive) === row.canonical_json &&
        (version.action === 'merge' ? directive.operation === 'merge' : version.action === 'correct'
          ? directive.operation === 'correct' || directive.operation === 'supervise' && directive.effect === 'correct'
          : version.action === 'freeze' ? directive.operation === 'supervise' && directive.effect === 'freeze' : directive.operation === 'deactivate') &&
        (version.action === 'correct' || version.action === 'merge' && version.ordinal === 1 ? version.title === directive.text : true) &&
        directive.operationalScope === version.operationalScope && directive.actionId === version.actionId &&
        directive.categoryId === version.editorialDimension && (version.action === 'merge' && version.ordinal === 1
          ? canonicalJson(directive.targets.map((pin) => ({ itemId: pin.itemId, versionId: pin.revisionId }))) === canonicalJson(version.parentVersions)
          : version.parentVersions.length === 1 && directive.targets.some((pin) => pin.itemId === version.itemId && pin.revisionId === version.parentVersions[0]!.versionId)));
    }
  }

  version(itemId: string, versionId?: string): GlobalEditorialMemoryVersion {
    return this.#read(() => {
      const versions = this.#versions(itemId);
      const version = versionId === undefined ? versions.at(-1) : versions.find((entry) => entry.versionId === versionId);
      requireLearning(version); return version;
    });
  }

  /** Walk all immutable parents, never just the item anchor or the first visible history page; once per exact version in a read. */
  effectiveSources(version: EditorialMemoryVersion): EditorialMemorySourceSnapshot[] {
    return this.#read(() => {
      const key = sha256Hex(canonicalJson(version));
      const known = this.#reads!.effective.get(key);
      if (known !== undefined) return known;
      const sources = this.#walkSources(version);
      this.#reads!.effective.set(key, sources);
      return sources;
    });
  }

  #walkSources(version: EditorialMemoryVersion): EditorialMemorySourceSnapshot[] {
    const sources = new Map<string, EditorialMemorySourceSnapshot>();
    const histories = new Map<string, GlobalEditorialMemoryVersion[]>();
    const visiting = new Set<string>(); const visited = new Set<string>();
    const stack: Array<{ version: EditorialMemoryVersion; exit: boolean }> = [{ version, exit: false }];
    while (stack.length > 0) {
      const entry = stack.pop()!; const current = entry.version;
      if (entry.exit) { visiting.delete(current.versionId); visited.add(current.versionId); continue; }
      requireLearning(!visiting.has(current.versionId));
      if (visited.has(current.versionId)) continue;
      requireLearning(current.operationalScope === version.operationalScope && current.editorialDimension === version.editorialDimension &&
        canonicalJson(current.applicability) === canonicalJson(version.applicability));
      visiting.add(current.versionId); stack.push({ version: current, exit: true });
      for (const source of current.sources) {
        requireLearning(source.operationalScope === version.operationalScope && source.editorialDimension === version.editorialDimension &&
          (version.applicability.kind === 'house' || source.source.bookId === version.applicability.bookId));
        const previous = sources.get(source.sourceKey);
        requireLearning(previous === undefined || canonicalJson(previous.source) === canonicalJson(source.source) &&
          previous.operationalScope === source.operationalScope && previous.editorialDimension === source.editorialDimension);
        if (previous === undefined || canonicalJson(source).localeCompare(canonicalJson(previous), 'en') < 0) sources.set(source.sourceKey, source);
      }
      for (const pin of current.parentVersions) {
        requireLearning(isRecord(pin) && Object.keys(pin).length === 2 && UUID_PATTERN.test(pin.itemId) && UUID_PATTERN.test(pin.versionId));
        let history = histories.get(pin.itemId);
        if (history === undefined) { history = this.#versions(pin.itemId); histories.set(pin.itemId, history); }
        const parent = history.find((entry) => entry.versionId === pin.versionId);
        requireLearning(parent !== undefined);
        requireLearning(parent.schema === 'ai7.global-editorial-memory/2'); stack.push({ version: parent, exit: false });
      }
    }
    requireLearning(sources.size > 0);
    return [...sources.values()].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey, 'en'));
  }

  currentSources(version: EditorialMemoryVersion): EditorialMemorySourceSnapshot[] {
    return this.#read(() => {
      const current = this.#currentOrNone(version);
      requireLearning(current !== null);
      return current;
    });
  }

  /**
   * The version's current sources, or `null` when a validated record positively places one outside current use (revision 8): a
   * source that stands nowhere now, or one restricted to its Book behind House memory. Every integrity failure propagates.
   */
  #currentOrNone(version: EditorialMemoryVersion): EditorialMemorySourceSnapshot[] | null {
    const current: EditorialMemorySourceSnapshot[] = [];
    for (const source of this.effectiveSources(version)) {
      const standing = this.#sourceStanding(source.signalId);
      // The ancestry walk already proved each source's review origin; losing it now is missing lineage, not ordinary standing.
      if (!('snapshot' in standing)) { requireLearning(standing.unavailable === 'not-current'); return null; }
      if (version.applicability.kind === 'house' && standing.snapshot.eligibility !== 'house') return null;
      requireLearning(standing.snapshot.sourceKey === source.sourceKey && standing.snapshot.operationalScope === version.operationalScope &&
        (version.applicability.kind === 'house' || standing.snapshot.source.bookId === version.applicability.bookId));
      current.push(standing.snapshot);
    }
    return current;
  }

  usable(version: EditorialMemoryVersion): boolean {
    return this.#read(() => version.state === 'active' && this.version(version.itemId).versionId === version.versionId && this.#currentOrNone(version) !== null);
  }

  /** Existing opaque read-pin field, binding this memory version to its relevant current source/control basis only. */
  sourcePinRevision(itemId: string, versionId: string): string {
    return this.#read(() => {
      const version = this.version(itemId, versionId);
      requireLearning(version.schema === 'ai7.global-editorial-memory/2' && version.state === 'active' && this.version(itemId).versionId === versionId);
      const sources = this.currentSources(version).map(({ sourceKey, admission, eligibility }) => ({ sourceKey, admission, eligibility }));
      return `${version.versionId}@${sha256Hex(canonicalJson(sources))}`;
    });
  }

  #createMemory(input: Extract<CreateEditorialMemoryInput, { schema: string }>, scope: TrustedOperationalScope): void {
    requireLearning(input.schema === 'ai7.global-editorial-memory/2' && UUID_PATTERN.test(input.actionId) &&
      Array.isArray(input.signalIds) && input.signalIds.length >= 1 && input.signalIds.length <= 10 && new Set(input.signalIds).size === input.signalIds.length &&
      input.signalIds.every((id) => UUID_PATTERN.test(id)) && input.title.trim().length > 0 && input.title.length <= 160 && input.title.isWellFormed() &&
      reviewCategoryEntry(input.editorialDimension) !== null && Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1);
    const previous = this.db.prepare('SELECT item_id FROM global_editorial_memory_items WHERE client_memory_id = ?').get(input.actionId);
    if (previous) {
      const first = this.#versions(String(previous.item_id))[0]!;
      requireLearning(first.schema === 'ai7.global-editorial-memory/2' && first.actionId === input.actionId && first.operationalScope === scope &&
        first.title === input.title && first.editorialDimension === input.editorialDimension && first.confidence === input.confidence &&
        canonicalJson(first.applicability) === canonicalJson(input.applicability) && canonicalJson(first.signalIds) === canonicalJson(input.signalIds));
      return;
    }
    requireLearning(this.#action(input.actionId).length === 0);
    const sources = input.signalIds.map((id) => this.sourceSnapshot(id));
    const version: EditorialMemoryVersion = { ...input, itemId: randomUUID(), versionId: randomUUID(), ordinal: 1, supersedes: null,
      recordedAt: new Date().toISOString(), operationalScope: scope, title: input.title, state: 'proposed', actor: 'editor', action: 'create',
      positiveExamples: sources.filter((source) => this.#signal(source.signalId).kind !== 'rejected').map((source) => source.source),
      negativeExamples: sources.filter((source) => this.#signal(source.signalId).kind === 'rejected').map((source) => source.source),
      sources, parentVersions: [], supervisionDirectiveRefs: [] };
    this.#validateMemory(version); this.currentSources(version);
    const anchor = this.effectiveSources(version)[0]!.signalId;
    this.db.prepare('INSERT INTO global_editorial_memory_items VALUES (?, ?, ?, ?)').run(version.itemId, input.actionId, anchor, version.recordedAt);
    this.#append(version);
  }

  #action(actionId: string): EditorialMemoryVersion[] {
    return this.db.prepare(`SELECT item_id, version_id FROM global_editorial_memory_item_versions
      WHERE json_extract(canonical_json, '$.actionId') = ? ORDER BY rowid`).all(actionId).map((row) => {
      const version = this.version(String(row.item_id), String(row.version_id));
      requireLearning(version.schema === 'ai7.global-editorial-memory/2'); return version;
    });
  }

  #successor(current: EditorialMemoryVersion, actionId: string, action: EditorialMemoryVersion['action'], state: EditorialMemoryVersion['state'],
    directiveId: string | null = null, title = current.title): EditorialMemoryVersion {
    return { ...current, versionId: randomUUID(), ordinal: current.ordinal + 1, supersedes: current.versionId, actionId, action, state, title,
      recordedAt: new Date().toISOString(), signalIds: [], sources: [], positiveExamples: [], negativeExamples: [],
      parentVersions: [{ itemId: current.itemId, versionId: current.versionId }], supervisionDirectiveRefs: directiveId === null ? [] : [directiveId] };
  }

  #transition(input: AcceptEditorialMemoryInput, action: 'accept' | 'deactivate', scope?: TrustedOperationalScope): void {
    requireLearning(UUID_PATTERN.test(input.actionId));
    const replay = this.#action(input.actionId);
    if (replay.length > 0) {
      requireLearning(replay.length === 1 && replay[0]!.itemId === input.itemId && replay[0]!.action === action &&
        replay[0]!.parentVersions[0]?.versionId === input.expectedVersionId && (scope === undefined || replay[0]!.operationalScope === scope)); return;
    }
    const current = this.version(input.itemId);
    requireLearning(current.schema === 'ai7.global-editorial-memory/2' && current.versionId === input.expectedVersionId &&
      (scope === undefined || current.operationalScope === scope));
    if (action === 'accept') { requireLearning(current.state === 'proposed'); this.currentSources(current); }
    this.#append(this.#successor(current, input.actionId, action, action === 'accept' ? 'active' : 'inactive'));
  }

  accept(input: AcceptEditorialMemoryInput, scope: TrustedOperationalScope): void { this.#transition(input, 'accept', scope); }

  /** Real memory targets are routed here once, inside the store's directive/publication transaction. */
  govern(directive: LearningSupervisionDirective, expected: ReadonlyArray<GlobalMemoryPin>): void {
    requireLearning(directive.actionId !== undefined && UUID_PATTERN.test(directive.actionId));
    const replay = this.#action(directive.actionId);
    if (replay.length > 0) { requireLearning(replay.every((version) => version.supervisionDirectiveRefs.includes(directive.directiveId))); return; }
    const targets = expected.map((pin) => {
      const version = this.version(pin.itemId);
      requireLearning(version.schema === 'ai7.global-editorial-memory/2' && version.versionId === pin.revisionId &&
        version.operationalScope === directive.operationalScope && version.editorialDimension === directive.categoryId &&
        (version.applicability.kind === 'house' ? directive.scope.kind !== 'book'
          : directive.scope.kind === 'book' && directive.scope.bookId === version.applicability.bookId));
      return version;
    });
    requireLearning(targets.length > 0);
    if (directive.operation === 'supervise' && directive.effect === 'guide') return;
    const action = directive.operation === 'supervise' ? directive.effect : directive.operation;
    requireLearning(action === 'merge' || action === 'correct' || action === 'deactivate' || action === 'freeze');
    if (action === 'merge' || action === 'correct') targets.forEach((target) => this.currentSources(target));
    if (action === 'merge') {
      requireLearning(targets.length >= 2 && targets.every((target) => canonicalJson(target.applicability) === canonicalJson(targets[0]!.applicability)));
      const first = targets[0]!;
      const version: EditorialMemoryVersion = { ...first, itemId: randomUUID(), versionId: randomUUID(), ordinal: 1, supersedes: null,
        recordedAt: directive.recordedAt, actionId: directive.actionId, action: 'merge', title: directive.text,
        state: targets.every((target) => target.state === 'active') ? 'active' : 'proposed', signalIds: [], sources: [], positiveExamples: [], negativeExamples: [],
        parentVersions: targets.map((target) => ({ itemId: target.itemId, versionId: target.versionId })), supervisionDirectiveRefs: [directive.directiveId] };
      const anchor = this.effectiveSources(version)[0]!.signalId;
      this.#validateMemory(version);
      this.db.prepare('INSERT INTO global_editorial_memory_items VALUES (?, ?, ?, ?)').run(version.itemId, directive.actionId, anchor, version.recordedAt);
      for (const target of targets) this.#append(this.#successor(target, directive.actionId, 'merge', 'inactive', directive.directiveId));
      this.#append(version);
    } else {
      requireLearning(targets.length === 1 || action === 'freeze');
      for (const target of targets) this.#append(this.#successor(target, directive.actionId, action,
        action === 'correct' ? target.state === 'active' ? 'active' : 'proposed' : action === 'freeze' ? 'frozen' : 'inactive',
        directive.directiveId, action === 'correct' ? directive.text : target.title));
    }
  }

  #versions(itemId: string): GlobalEditorialMemoryVersion[] {
    // A chain this read already proved is reused only while its exact rows are unchanged; otherwise it is read and proved again.
    const known = this.#reads?.chains.get(itemId);
    if (known !== undefined && known.fingerprint === this.db.prepare('SELECT version_id, sha256 FROM global_editorial_memory_item_versions WHERE item_id = ? ORDER BY ordinal')
      .all(itemId).map((row) => `${String(row.version_id)}:${String(row.sha256)}`).join(',')) return known.versions;
    const versions: GlobalEditorialMemoryVersion[] = [];
    const rows: string[] = [];
    for (const row of this.db.prepare('SELECT * FROM global_editorial_memory_item_versions WHERE item_id = ? ORDER BY ordinal').iterate(itemId) as Iterable<Row>) {
      rows.push(`${String(row.version_id)}:${String(row.sha256)}`);
      const version = read<GlobalEditorialMemoryVersion>(row);
      requireLearning(isRecord(version) && canonicalJson(version) === row.canonical_json);
      requireLearning(version.itemId === itemId && version.versionId === row.version_id && version.ordinal === versions.length + 1 &&
        version.ordinal === row.ordinal && version.supersedes === (versions.at(-1)?.versionId ?? null) && version.supersedes === row.supersedes && version.recordedAt === row.recorded_at &&
        version.actor === 'editor' && (version.schema === 'ai7.global-editorial-memory/2'
          ? ['proposed', 'active', 'inactive', 'frozen'].includes(version.state)
          : version.schema === 'ai7.global-editorial-memory/1' && (version.activation === 'active' || version.activation === 'inactive')) &&
        typeof version.title === 'string' && version.title.trim().length > 0 && version.title.length <= 160 &&
        typeof version.editorialDimension === 'string' && version.editorialDimension.trim().length > 0 && version.editorialDimension.length <= 80 &&
        Number.isFinite(version.confidence) && version.confidence >= 0 && version.confidence <= 1 && Number.isFinite(Date.parse(version.recordedAt)));
      versions.push(version);
      if (version.schema === 'ai7.global-editorial-memory/2') {
        this.#validateMemory(version);
        const prior = versions.at(-2);
        if (prior !== undefined) requireLearning(prior.schema === 'ai7.global-editorial-memory/2' &&
          version.operationalScope === prior.operationalScope && version.editorialDimension === prior.editorialDimension &&
          canonicalJson(version.applicability) === canonicalJson(prior.applicability) && version.confidence === prior.confidence &&
          canonicalJson(version.parentVersions) === canonicalJson([{ itemId, versionId: prior.versionId }]) && version.signalIds.length === 0 &&
          (version.action === 'accept' ? prior.state === 'proposed' && version.state === 'active'
            : version.action === 'correct' ? version.state === (prior.state === 'active' ? 'active' : 'proposed')
              : version.action === 'freeze' ? version.state === 'frozen' : (version.action === 'merge' || version.action === 'deactivate') && version.state === 'inactive'));
      }
    }
    requireLearning(versions.length > 0);
    this.#reads?.chains.set(itemId, { fingerprint: rows.join(','), versions });
    return versions;
  }

  #append(version: GlobalEditorialMemoryVersion): void {
    // Every /2 successor is held to the reader's own contract before it is written, not only when it is read back.
    if (version.schema === 'ai7.global-editorial-memory/2') this.#validateMemory(version);
    const record = canonicalRecord({ ...version, schema: version.schema ?? 'ai7.global-editorial-memory/1' });
    requireLearning(Buffer.byteLength(record.json, 'utf8') <= MAX_FRAME_BYTES / 2);
    this.db.prepare('INSERT INTO global_editorial_memory_item_versions VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(version.versionId, version.itemId, version.ordinal, version.supersedes, version.recordedAt, record.json, record.digest);
  }

  create(input: CreateEditorialMemoryInput, scope?: TrustedOperationalScope): void {
    if ('schema' in input) {
      requireLearning(scope !== undefined);
      this.#createMemory(input, scope);
      return;
    }
    const previous = this.db.prepare('SELECT item_id, source_signal_id FROM global_editorial_memory_items WHERE client_memory_id = ?').get(input.clientMemoryId);
    if (previous) {
      const first = this.#versions(String(previous.item_id))[0]!;
      requireLearning(previous.source_signal_id === input.signalId && first.title === input.title.trim() &&
        first.editorialDimension === input.editorialDimension.trim() && first.confidence === input.confidence);
      return;
    }
    const signal = this.#signal(input.signalId);
    requireLearning(signal.kind !== 'word-tracked-edit');
    // House memory may never promote a source explicitly restricted to one Book.
    requireLearning(this.#currentEligibility(signal, this.controls()) === 'house');
    requireLearning(input.title.trim().length > 0 && input.title.length <= 160 && input.editorialDimension.trim().length > 0 &&
      input.editorialDimension.length <= 80 && Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1);
    const itemId = randomUUID(); const recordedAt = new Date().toISOString();
    this.db.prepare('INSERT INTO global_editorial_memory_items VALUES (?, ?, ?, ?)').run(itemId, input.clientMemoryId, input.signalId, recordedAt);
    const disposition = signal.kind === 'proactive-reason' ? signal.ask!.disposition : signal.kind;
    const positive = disposition === 'accepted' || disposition === 'accepted-with-edit';
    this.#append({ itemId, versionId: randomUUID(), ordinal: 1, supersedes: null, title: input.title.trim(), editorialDimension: input.editorialDimension.trim(),
      positiveExamples: positive ? [signal.source] : [], negativeExamples: positive ? [] : [signal.source], confidence: input.confidence,
      activation: 'active', signalIds: [signal.signalId], supervisionDirectiveRefs: [], actor: 'editor', recordedAt });
  }

  deactivate(input: DeactivateEditorialMemoryInput, scope?: TrustedOperationalScope): void {
    const current = this.#versions(input.itemId).at(-1)!;
    if (current.schema === 'ai7.global-editorial-memory/2') {
      requireLearning(input.actionId !== undefined);
      this.#transition({ ...input, actionId: input.actionId }, 'deactivate', scope);
      return;
    }
    requireLearning(current.versionId === input.expectedVersionId);
    if (current.activation === 'inactive') return;
    this.#append({ ...current, versionId: randomUUID(), ordinal: current.ordinal + 1, supersedes: current.versionId,
      activation: 'inactive', recordedAt: new Date().toISOString() });
  }

  /** Existing 学习回溯 and remediation readers include explicitly created memory without changing house preference use. */
  activeMemoryCount(bookId: string, materialKeys: ReadonlyArray<string>): number { return this.#read(() => this.#activeMemoryCount(bookId, materialKeys)); }

  #activeMemoryCount(bookId: string, materialKeys: ReadonlyArray<string>): number {
    const wanted = new Set(materialKeys);
    let count = 0;
    for (const row of this.db.prepare('SELECT item_id FROM global_editorial_memory_items').iterate()) {
      const current = this.#versions(String(row.item_id)).at(-1)!;
      if ((current.schema === 'ai7.global-editorial-memory/2' ? current.state === 'active' : current.activation === 'active') &&
        (current.schema === 'ai7.global-editorial-memory/2' ? this.effectiveSources(current).map((entry) => entry.source) : [...current.positiveExamples, ...current.negativeExamples])
        .some((source) => source.bookId === bookId && wanted.has(source.materialKey))) count += 1;
    }
    return count;
  }

  sourceKeys(bookId: string, materialKeys: ReadonlyArray<string>): string[] {
    const wanted = new Set(materialKeys);
    return this.db.prepare('SELECT signal_id FROM learning_signals WHERE book_id = ?').all(bookId).flatMap((row) => {
      const signal = this.#signal(String(row.signal_id));
      if (signal.kind === 'word-tracked-edit') return wanted.has(signal.source.materialKey)
        ? [sha256Hex(canonicalJson({ signalId: signal.signalId, materialDigest: signal.source.materialDigest, sampleDigest: signal.source.sampleDigest }))] : [];
      return wanted.has(signal.source.materialKey) ? [sha256Hex(canonicalJson({ signalId: signal.signalId,
        materialDigest: signal.source.materialDigest, reasonRevision: signal.source.reasonRevision }))] : [];
    });
  }

  revisions(scope: TrustedOperationalScope): Array<{ current: EditorialMemoryVersion; usable: boolean }> { return this.#read(() => this.#revisions(scope)); }

  #revisions(scope: TrustedOperationalScope): Array<{ current: EditorialMemoryVersion; usable: boolean }> {
    const revisions: Array<{ current: EditorialMemoryVersion; usable: boolean }> = [];
    for (let itemOffset: number | null = 0; itemOffset !== null;) {
      const page = this.inspect({ signalOffset: 0, itemOffset }, scope);
      for (const entry of page.items) if (entry.current.schema === 'ai7.global-editorial-memory/2' && entry.current.operationalScope === scope)
        revisions.push({ current: entry.current, usable: entry.usable });
      itemOffset = page.nextItemOffset;
    }
    return revisions;
  }

  /**
   * The immutable titles of every still-active /2 owner of one scope, whatever their sources, controls or names allow now: an
   * accepted memory keeps its place in the house's bounded block through a reversible suppression (Issue #1128 revision 7).
   */
  activeTitles(scope: TrustedOperationalScope): string[] { return this.#read(() => this.#activeTitles(scope)); }

  #activeTitles(scope: TrustedOperationalScope): string[] {
    const titles: string[] = [];
    for (const row of this.db.prepare('SELECT item_id FROM global_editorial_memory_items ORDER BY item_id').iterate()) {
      const current = this.version(String(row.item_id));
      if (current.schema === 'ai7.global-editorial-memory/2' && current.operationalScope === scope && current.state === 'active') titles.push(current.title);
    }
    return titles;
  }

  candidateMemoryCount(bookId: string, materialKey: string): number { return this.#read(() => this.#candidateMemoryCount(bookId, materialKey)); }

  #candidateMemoryCount(bookId: string, materialKey: string): number {
    let count = 0;
    for (const row of this.db.prepare('SELECT item_id FROM global_editorial_memory_items').iterate()) {
      const current = this.version(String(row.item_id));
      if (current.schema === 'ai7.global-editorial-memory/2' && current.state === 'proposed' && this.effectiveSources(current)
        .some((source) => source.source.bookId === bookId && source.source.materialKey === materialKey)) count += 1;
    }
    return count;
  }

  affectedMemoryCount(bookId: string, materialKeys: ReadonlyArray<string>): number { return this.#read(() => this.#affectedMemoryCount(bookId, materialKeys)); }

  #affectedMemoryCount(bookId: string, materialKeys: ReadonlyArray<string>): number {
    const wanted = new Set(materialKeys); let count = 0;
    for (const row of this.db.prepare('SELECT item_id FROM global_editorial_memory_items').iterate()) {
      const current = this.version(String(row.item_id));
      const relevant = current.schema === 'ai7.global-editorial-memory/2' ? current.state === 'proposed' || current.state === 'active' : current.activation === 'active';
      const sources = current.schema === 'ai7.global-editorial-memory/2' ? this.effectiveSources(current).map((source) => source.source) : [...current.positiveExamples, ...current.negativeExamples];
      if (relevant && sources.some((source) => source.bookId === bookId && wanted.has(source.materialKey))) count += 1;
    }
    return count;
  }

  inspect(input: InspectEditorialLearningInput, scope?: TrustedOperationalScope): EditorialLearningProjection {
    return this.#read(() => this.#inspect(input, scope));
  }

  #inspect(input: InspectEditorialLearningInput, scope?: TrustedOperationalScope): EditorialLearningProjection {
    const controls = this.controls();
    // An ask's own bookkeeping (offered, suppressed, dismissed) only paces later asks; the editor's list shows what they told AI7.
    const rows = this.db.prepare(`SELECT signal_id FROM learning_signals WHERE coalesce(json_extract(canonical_json, '$.ask.state'), 'answered') = 'answered'
      ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(PAGE_SIZE + 1, input.signalOffset);
    const signals = rows.slice(0, PAGE_SIZE).map((row) => {
      const signal = this.#signal(String(row.signal_id));
      // Only a normal standing leaves a signal out of candidate selection (revision 8); a corrupt record refuses the whole page.
      const standing = this.#sourceStanding(signal.signalId);
      const memoryCandidate = 'snapshot' in standing && (scope === undefined || standing.snapshot.operationalScope === scope)
        ? { editorialDimension: standing.snapshot.editorialDimension, operationalScope: standing.snapshot.operationalScope } : null;
      return { ...signal, currentEligibility: this.#currentEligibility(signal, controls),
        memoryCandidate,
        bookTitle: String(this.db.prepare('SELECT title FROM books WHERE book_id = ?').get(signal.source.bookId)?.title ?? '') };
    });
    const itemRows = input.detailItemId === undefined
      ? this.db.prepare('SELECT item_id FROM global_editorial_memory_items ORDER BY rowid DESC LIMIT ? OFFSET ?').all(PAGE_SIZE + 1, input.itemOffset)
      : this.db.prepare('SELECT item_id FROM global_editorial_memory_items WHERE item_id = ?').all(input.detailItemId);
    requireLearning(input.detailItemId === undefined || itemRows.length === 1);
    const items: EditorialLearningProjection['items'][number][] = [];
    let bytes = Buffer.byteLength(JSON.stringify(signals), 'utf8');
    for (const row of itemRows.slice(0, PAGE_SIZE)) {
      const history = this.#versions(String(row.item_id)); const current = history.at(-1)!;
      const historyEnd = Math.max(0, history.length - (input.historyOffset ?? 0));
      const historyStart = Math.max(0, historyEnd - PAGE_SIZE);
      const sources = current.schema === 'ai7.global-editorial-memory/2' ? this.effectiveSources(current) : [];
      const sourceOffset = input.sourceOffset ?? 0;
      const entry = { current, history: history.slice(historyStart, historyEnd),
        nextHistoryOffset: historyStart > 0 ? (input.historyOffset ?? 0) + PAGE_SIZE : null,
        sources: sources.slice(sourceOffset, sourceOffset + PAGE_SIZE), nextSourceOffset: sources.length > sourceOffset + PAGE_SIZE ? sourceOffset + PAGE_SIZE : null,
        usable: current.schema === 'ai7.global-editorial-memory/2' ? this.usable(current)
          : current.activation === 'active' && current.signalIds.every((id) => this.#currentEligibility(this.#signal(id), controls) === 'house') };
      const size = Buffer.byteLength(JSON.stringify(entry), 'utf8');
      requireLearning(size <= MAX_FRAME_BYTES / 2);
      if (bytes + size > MAX_FRAME_BYTES / 2 && items.length > 0) break;
      items.push(entry); bytes += size;
    }
    const exclusionOffset = input.exclusionOffset ?? 0;
    const excludedBooks = [...controls.excludedBooks].slice(exclusionOffset, exclusionOffset + PAGE_SIZE + 1);
    const materialRows = this.db.prepare(`SELECT book_id, material_key FROM learning_eligibility_decisions d WHERE choice = 'excluded'
      AND ordinal = (SELECT max(ordinal) FROM learning_eligibility_decisions n WHERE n.book_id = d.book_id AND n.material_key = d.material_key)
      ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(PAGE_SIZE + 1, exclusionOffset);
    const excludedMaterials = materialRows.slice(0, PAGE_SIZE).map((row) => ({ bookId: String(row.book_id), materialKey: String(row.material_key) }));
    return { basis: LOCAL_LEARNING_POLICY_BASIS.text, enabled: controls.enabled, controlEntries: controls.entries,
      excludedBooks: excludedBooks.slice(0, PAGE_SIZE).map((bookId) => ({ bookId, title: String(this.db.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId)?.title ?? '') })),
      excludedMaterials, signals, items, nextSignalOffset: rows.length > PAGE_SIZE ? input.signalOffset + PAGE_SIZE : null,
      nextItemOffset: input.detailItemId === undefined && itemRows.length > items.length ? input.itemOffset + items.length : null,
      nextExclusionOffset: excludedBooks.length > PAGE_SIZE || materialRows.length > PAGE_SIZE ? exclusionOffset + PAGE_SIZE : null };
  }

  /** Validate append-only records on open, including history beyond the visible page. */
  validate(memoryRevision = true): void { this.#read(() => this.#validateAll(memoryRevision)); }

  /** Before revision 91 a store was written by the /1 readers alone: a /2 record there is a partial upgrade, refused. */
  #validateAll(memoryRevision: boolean): void {
    this.controls();
    for (const row of this.db.prepare('SELECT signal_id FROM learning_signals').iterate()) this.#signal(String(row.signal_id));
    for (const row of this.db.prepare('SELECT * FROM global_editorial_memory_items').iterate()) {
      const signal = this.#signal(String(row.source_signal_id));
      requireLearning(signal.kind !== 'word-tracked-edit');
      for (const version of this.#versions(String(row.item_id))) {
        if (version.schema === 'ai7.global-editorial-memory/2') {
          requireLearning(memoryRevision);
          if (version.ordinal === 1) requireLearning(row.client_memory_id === version.actionId && row.recorded_at === version.recordedAt);
          const sources = this.effectiveSources(version);
          requireLearning(sources.length > 0 && sources[0]!.signalId === signal.signalId);
          continue;
        }
        requireLearning(version.signalIds.length === 1 && version.signalIds[0] === signal.signalId && version.supervisionDirectiveRefs.length === 0 &&
          canonicalJson([...version.positiveExamples, ...version.negativeExamples]) === canonicalJson([signal.source]));
      }
    }
  }
}
