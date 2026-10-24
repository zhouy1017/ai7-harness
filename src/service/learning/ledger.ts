import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type {
  ChangeEditorialLearningInput, CreateEditorialMemoryInput, DeactivateEditorialMemoryInput,
  EditorialLearningProjection, GlobalEditorialMemoryVersion, InspectEditorialLearningInput,
  LearningSignal, LearningSignalStanding, LearningSourceReference,
  LearningReasonAskInput, LearningReasonAskProjection, LearningReasonAskFrequency, PreferenceAdoptionProjection, PreferenceAdoptionCursor, ReferencedRuleVersion,
} from '../../shared/protocol/learning.js';
import { LEARNING_REASON_OPTIONS } from '../../shared/protocol/learning.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import { canonicalJson, canonicalRecord, sha256Hex, UUID_PATTERN } from '../analysis/canonical.js';
import { BookPeople } from '../book-people.js';
import { DecisionFeedbackLedger } from '../decision-feedback.js';
import { graphemeEditVolume } from '../edit-quality-signals.js';
import { LearningEligibilityError, LearningEligibilityLedger, LOCAL_LEARNING_POLICY_BASIS,
  learningMaterialDigest, proposalDecisionCandidate, reviewDispositionCandidate, type LearningMaterialCandidate } from '../learning-eligibility.js';

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
  return JSON.parse(row.canonical_json) as T;
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

/** Local capture only: no provider, scheduler, retrieval or composition dependency. The caller owns the transaction. */
export class EditorialLearningLedger {
  constructor(readonly db: DatabaseSync) {}

  controls(): Controls {
    const result: Controls = { enabled: true, entries: 0, excludedBooks: new Set() };
    for (const row of this.db.prepare('SELECT * FROM editorial_learning_controls ORDER BY ordinal').iterate() as Iterable<Row>) {
      const record = read<{ entryId: string; ordinal: number; kind: string; bookId: string | null; value: boolean; recordedAt: string }>(row);
      requireLearning(record.entryId === row.entry_id && record.ordinal === ++result.entries && record.kind === row.kind &&
        record.bookId === row.book_id && typeof record.value === 'boolean' && Number(record.value) === row.value && record.recordedAt === row.recorded_at);
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
    const last = new LearningEligibilityLedger(this.db).history(bookId, materialKey).at(-1);
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
    this.#capture(`${decisionId}:${source.materialDigest}`, String(row.disposition) as LearningSignal['kind'], source,
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

  #capture(sourceKey: string, kind: LearningSignal['kind'], source: LearningSourceReference, rewriteDistance: number | null, recordedAt: string, ask?: LearningSignal['ask']): string | null {
    const controls = this.controls();
    const eligibility = this.#standing(source.bookId, source.materialKey);
    if (!controls.enabled || controls.excludedBooks.has(source.bookId) || eligibility.choice === 'excluded' || eligibility.choice === 'deferred') return null;
    const prior = this.db.prepare('SELECT signal_id FROM learning_signals WHERE source_key = ?').get(sourceKey);
    if (prior) return String(prior.signal_id);
    const signal: LearningSignal = { signalId: randomUUID(), kind, source, rewriteDistance, eligibility,
      attribution: this.#attribution(source.bookId, recordedAt), recordedAt, ...(ask === undefined ? {} : { ask }) };
    const record = canonicalRecord({ ...signal, schema: 'ai7.learning-signal/1', basis: LOCAL_LEARNING_POLICY_BASIS });
    this.db.prepare('INSERT INTO learning_signals(signal_id, book_id, source_key, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(signal.signalId, source.bookId, sourceKey, recordedAt, record.json, record.digest);
    return signal.signalId;
  }

  #signal(id: string): LearningSignal {
    const row = this.db.prepare('SELECT * FROM learning_signals WHERE signal_id = ?').get(id) as Row | undefined;
    requireLearning(row);
    const signal = read<LearningSignal & { schema: string; basis: unknown }>(row);
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
      if (signal.source.reviewRunId === null) candidate = this.#candidate(signal.source.decisionId, signal.kind === 'proactive-reason')?.candidate ?? null;
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

  #versions(itemId: string): GlobalEditorialMemoryVersion[] {
    const versions: GlobalEditorialMemoryVersion[] = [];
    for (const row of this.db.prepare('SELECT * FROM global_editorial_memory_item_versions WHERE item_id = ? ORDER BY ordinal').iterate(itemId) as Iterable<Row>) {
      const version = read<GlobalEditorialMemoryVersion>(row);
      requireLearning(version.itemId === itemId && version.versionId === row.version_id && version.ordinal === versions.length + 1 &&
        version.ordinal === row.ordinal && version.supersedes === (versions.at(-1)?.versionId ?? null) && version.supersedes === row.supersedes && version.recordedAt === row.recorded_at &&
        version.actor === 'editor' && (version.activation === 'active' || version.activation === 'inactive') &&
        typeof version.title === 'string' && version.title.trim().length > 0 && version.title.length <= 160 &&
        typeof version.editorialDimension === 'string' && version.editorialDimension.trim().length > 0 && version.editorialDimension.length <= 80 &&
        Number.isFinite(version.confidence) && version.confidence >= 0 && version.confidence <= 1);
      versions.push(version);
    }
    requireLearning(versions.length > 0);
    return versions;
  }

  #append(version: GlobalEditorialMemoryVersion): void {
    const record = canonicalRecord({ ...version, schema: 'ai7.global-editorial-memory/1' });
    this.db.prepare('INSERT INTO global_editorial_memory_item_versions VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(version.versionId, version.itemId, version.ordinal, version.supersedes, version.recordedAt, record.json, record.digest);
  }

  create(input: CreateEditorialMemoryInput): void {
    const previous = this.db.prepare('SELECT item_id, source_signal_id FROM global_editorial_memory_items WHERE client_memory_id = ?').get(input.clientMemoryId);
    if (previous) {
      const first = this.#versions(String(previous.item_id))[0]!;
      requireLearning(previous.source_signal_id === input.signalId && first.title === input.title.trim() &&
        first.editorialDimension === input.editorialDimension.trim() && first.confidence === input.confidence);
      return;
    }
    const signal = this.#signal(input.signalId);
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

  deactivate(input: DeactivateEditorialMemoryInput): void {
    const current = this.#versions(input.itemId).at(-1)!;
    requireLearning(current.versionId === input.expectedVersionId);
    if (current.activation === 'inactive') return;
    this.#append({ ...current, versionId: randomUUID(), ordinal: current.ordinal + 1, supersedes: current.versionId,
      activation: 'inactive', recordedAt: new Date().toISOString() });
  }

  /** Existing 学习回溯 and remediation readers include explicitly created memory without changing house preference use. */
  activeMemoryCount(bookId: string, materialKeys: ReadonlyArray<string>): number {
    const wanted = new Set(materialKeys);
    let count = 0;
    for (const row of this.db.prepare('SELECT item_id FROM global_editorial_memory_items').iterate()) {
      const current = this.#versions(String(row.item_id)).at(-1)!;
      if (current.activation === 'active' && [...current.positiveExamples, ...current.negativeExamples]
        .some((source) => source.bookId === bookId && wanted.has(source.materialKey))) count += 1;
    }
    return count;
  }

  inspect(input: InspectEditorialLearningInput): EditorialLearningProjection {
    const controls = this.controls();
    // An ask's own bookkeeping (offered, suppressed, dismissed) only paces later asks; the editor's list shows what they told AI7.
    const rows = this.db.prepare(`SELECT signal_id FROM learning_signals WHERE coalesce(json_extract(canonical_json, '$.ask.state'), 'answered') = 'answered'
      ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(PAGE_SIZE + 1, input.signalOffset);
    const signals = rows.slice(0, PAGE_SIZE).map((row) => {
      const signal = this.#signal(String(row.signal_id));
      return { ...signal, currentEligibility: this.#currentEligibility(signal, controls),
        bookTitle: String(this.db.prepare('SELECT title FROM books WHERE book_id = ?').get(signal.source.bookId)?.title ?? '') };
    });
    const itemRows = this.db.prepare('SELECT item_id FROM global_editorial_memory_items ORDER BY rowid DESC LIMIT ? OFFSET ?').all(PAGE_SIZE + 1, input.itemOffset);
    const items = itemRows.slice(0, PAGE_SIZE).map((row) => {
      const history = this.#versions(String(row.item_id)); const current = history.at(-1)!;
      return { current, history, usable: current.activation === 'active' && current.signalIds.every((id) => this.#currentEligibility(this.#signal(id), controls) === 'house') };
    });
    const exclusionOffset = input.exclusionOffset ?? 0;
    const excludedBooks = [...controls.excludedBooks].slice(exclusionOffset, exclusionOffset + PAGE_SIZE + 1);
    const materialRows = this.db.prepare(`SELECT book_id, material_key FROM learning_eligibility_decisions d WHERE choice = 'excluded'
      AND ordinal = (SELECT max(ordinal) FROM learning_eligibility_decisions n WHERE n.book_id = d.book_id AND n.material_key = d.material_key)
      ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(PAGE_SIZE + 1, exclusionOffset);
    const excludedMaterials = materialRows.slice(0, PAGE_SIZE).map((row) => ({ bookId: String(row.book_id), materialKey: String(row.material_key) }));
    return { basis: LOCAL_LEARNING_POLICY_BASIS.text, enabled: controls.enabled, controlEntries: controls.entries,
      excludedBooks: excludedBooks.slice(0, PAGE_SIZE).map((bookId) => ({ bookId, title: String(this.db.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId)?.title ?? '') })),
      excludedMaterials, signals, items, nextSignalOffset: rows.length > PAGE_SIZE ? input.signalOffset + PAGE_SIZE : null,
      nextItemOffset: itemRows.length > PAGE_SIZE ? input.itemOffset + PAGE_SIZE : null,
      nextExclusionOffset: excludedBooks.length > PAGE_SIZE || materialRows.length > PAGE_SIZE ? exclusionOffset + PAGE_SIZE : null };
  }

  /** Validate append-only records on open, including history beyond the visible page. */
  validate(): void {
    this.controls();
    for (const row of this.db.prepare('SELECT signal_id FROM learning_signals').iterate()) this.#signal(String(row.signal_id));
    for (const row of this.db.prepare('SELECT item_id, source_signal_id FROM global_editorial_memory_items').iterate()) {
      const signal = this.#signal(String(row.source_signal_id));
      for (const version of this.#versions(String(row.item_id))) {
        requireLearning(version.signalIds.length === 1 && version.signalIds[0] === signal.signalId && version.supervisionDirectiveRefs.length === 0 &&
          canonicalJson([...version.positiveExamples, ...version.negativeExamples]) === canonicalJson([signal.source]));
      }
    }
  }
}
