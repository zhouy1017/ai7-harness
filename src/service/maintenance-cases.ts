import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAINTENANCE_CLASSIFICATIONS,
  MAX_MAINTENANCE_CASES_LISTED,
  MAX_MAINTENANCE_CASES_PAGE,
  MAX_MAINTENANCE_ERRATA_CHARACTERS,
  MAX_MAINTENANCE_EVIDENCE_CHARACTERS,
  MAX_MAINTENANCE_PROPOSALS_OFFERED,
  MAX_MAINTENANCE_PUBLICATIONS_OFFERED,
  MAX_MAINTENANCE_REASON_CHARACTERS,
  MAX_MAINTENANCE_REVISIONS_LISTED,
  publicationText,
  type AppendMaintenanceCaseRevisionInput,
  type InspectMaintenanceCaseInput,
  type ListMaintenanceCasesInput,
  type MaintenanceCaseLinkProjection,
  type MaintenanceCasePageProjection,
  type MaintenanceCaseProjection,
  type MaintenanceCaseResultProjection,
  type MaintenanceCaseRevisionProjection,
  type MaintenanceCaseStatus,
  type MaintenanceCaseStep,
  type MaintenanceCaseSummaryProjection,
  type MaintenanceClassification,
  type MaintenanceNextStep,
  type PublicationMaintenanceProjection,
  type RecordMaintenanceCaseInput,
  type SaveMaintenanceErrataInput,
} from '../shared/protocol.js';
import {
  MAINTENANCE_CLASSIFICATION_LABELS,
  MAINTENANCE_CONCLUDED,
  MAINTENANCE_CONSEQUENCES,
  MAINTENANCE_INTERNAL_ONLY,
  MAINTENANCE_RECORDED,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STEP_LABELS,
} from '../shared/maintenance-wording.js';
import { UUID_PATTERN, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';

/**
 * 维护事项 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011, ADR 0040). After 设为发稿版本 a matter about that exact
 * 发稿版本 is recorded as one Maintenance Case of one classification, bound for good to the designation and the exact
 * Manuscript Revision it froze. Every later step — a 修改建议 or a later designation linked, a 勘误 version saved, a
 * conclusion — appends the case's next revision; nothing earlier is rewritten, and nothing a case records corrects,
 * withdraws, publishes or sends anything outside AI7.
 *
 * Schema revision 43 owns three relations, ledgers like the others: a row is appended once and never rewritten or removed.
 */
export const MAINTENANCE_CASE_SCHEMA_SQL = {
  maintenance_cases: `CREATE TABLE maintenance_cases (
  case_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  publication_version_id TEXT NOT NULL REFERENCES publication_versions(publication_version_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  classification TEXT NOT NULL CHECK(classification IN ('correction', 'errata', 'supersession', 'withdrawal', 'reissue', 'archive')),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(book_id, ordinal)
) STRICT`,
  maintenance_errata_versions: `CREATE TABLE maintenance_errata_versions (
  errata_version_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES maintenance_cases(case_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(case_id, version)
) STRICT`,
  maintenance_case_revisions: `CREATE TABLE maintenance_case_revisions (
  case_id TEXT NOT NULL REFERENCES maintenance_cases(case_id),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  step TEXT NOT NULL CHECK(step IN ('recorded', 'proposal-linked', 'publication-linked', 'errata-saved', 'concluded')),
  status TEXT NOT NULL CHECK(status IN ('unresolved', 'waiting', 'complete')),
  reason TEXT CHECK(reason IS NULL OR length(reason) BETWEEN 1 AND 500),
  evidence TEXT CHECK(evidence IS NULL OR length(evidence) BETWEEN 1 AND 500),
  link_mark_id TEXT REFERENCES editorial_marks(mark_id),
  link_publication_version_id TEXT REFERENCES publication_versions(publication_version_id),
  link_errata_version_id TEXT REFERENCES maintenance_errata_versions(errata_version_id),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(case_id, revision),
  CHECK((step = 'recorded') = (revision = 1)),
  CHECK((step = 'proposal-linked') = (link_mark_id IS NOT NULL)),
  CHECK((step = 'publication-linked') = (link_publication_version_id IS NOT NULL)),
  CHECK((step = 'errata-saved') = (link_errata_version_id IS NOT NULL)),
  CHECK(step NOT IN ('recorded', 'concluded') OR reason IS NOT NULL)
) STRICT`,
} as const;

export const MAINTENANCE_CASE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(MAINTENANCE_CASE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MAINTENANCE_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MAINTENANCE_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const MAINTENANCE_CASE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  maintenance_cases: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'publication_version_id>publication_versions.publication_version_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  maintenance_errata_versions: [
    'case_id>maintenance_cases.case_id:NO ACTION/NO ACTION/NONE',
  ],
  maintenance_case_revisions: [
    'case_id>maintenance_cases.case_id:NO ACTION/NO ACTION/NONE',
    'link_errata_version_id>maintenance_errata_versions.errata_version_id:NO ACTION/NO ACTION/NONE',
    'link_mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
    'link_publication_version_id>publication_versions.publication_version_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class MaintenanceCaseError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MaintenanceCaseError';
  }
}

function requireMaintenance(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new MaintenanceCaseError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const text = (value: SQLOutputValue | undefined): string => {
  requireMaintenance(typeof value === 'string', 'MAINTENANCE_RECORD_INVALID', '维护事项记录无效。');
  return value;
};
const nullableText = (value: SQLOutputValue | undefined): string | null => (value === null ? null : text(value));
const integer = (value: SQLOutputValue | undefined): number => {
  requireMaintenance(typeof value === 'number' && Number.isSafeInteger(value), 'MAINTENANCE_RECORD_INVALID', '维护事项记录无效。');
  return value;
};

const CASE_SCHEMA = 'ai7.maintenance-case/1';
const REVISION_SCHEMA = 'ai7.maintenance-case-revision/1';
const ERRATA_SCHEMA = 'ai7.maintenance-errata-version/1';
const ACTOR = '本机编辑';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'maintenance_cases'";

/** Revision 43's relations, created once: a store that predates them gains three empty relations and nothing existing moves. */
export function initializeMaintenanceCaseSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'publication_versions'").get() === undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(MAINTENANCE_CASE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(MAINTENANCE_CASE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Maintenance case schema rollback failed.');
    }
    throw error;
  }
  requireMaintenance(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_INVALID', '维护事项的关系与已有记录不一致。');
}

/** The first status each classification records (D4): 撤回 and 归档 set an internal state at once. */
const INITIAL_STATUS: Readonly<Record<MaintenanceClassification, MaintenanceCaseStatus>> = {
  correction: 'unresolved',
  errata: 'unresolved',
  supersession: 'waiting',
  withdrawal: 'complete',
  reissue: 'waiting',
  archive: 'complete',
};

/** One designation of the Book, as a case binds it and names it. */
interface Designation {
  publicationVersionId: string;
  ordinal: number;
  createdAt: string;
  revisionId: string;
  revisionLabel: string;
  digest: string;
  label: string;
}

interface CaseRow {
  caseId: string;
  bookId: string;
  ordinal: number;
  publicationVersionId: string;
  revisionId: string;
  classification: MaintenanceClassification;
  createdAt: string;
  digest: string;
}

interface RevisionRow {
  revision: number;
  step: MaintenanceCaseStep;
  status: MaintenanceCaseStatus;
  reason: string | null;
  evidence: string | null;
  markId: string | null;
  publicationVersionId: string | null;
  errataVersionId: string | null;
  recordedAt: string;
  digest: string;
}

function revisionRecord(caseId: string, revision: Omit<RevisionRow, 'digest'>, prior: string | null) {
  return canonicalRecord({
    schema: REVISION_SCHEMA,
    caseId,
    revision: revision.revision,
    step: revision.step,
    status: revision.status,
    reason: revision.reason,
    evidence: revision.evidence,
    link: revision.markId !== null ? { kind: 'proposal', id: revision.markId }
      : revision.publicationVersionId !== null ? { kind: 'publication-version', id: revision.publicationVersionId }
        : revision.errataVersionId !== null ? { kind: 'errata', id: revision.errataVersionId } : null,
    actor: ACTOR,
    recordedAt: revision.recordedAt,
    prior,
  });
}

/** A few characters of a mark's words, enough to tell it from another. */
function excerpt(value: string): string {
  const characters = Array.from(value.replace(/\s+/gu, ' ').trim());
  return characters.length <= 16 ? characters.join('') : `${characters.slice(0, 16).join('')}…`;
}

export class MaintenanceCases {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  #present(): boolean {
    return this.#db.prepare(TABLE_PRESENT).get() !== undefined;
  }

  /** A designation's 维护事项 as 交付物's one read carries them: newest first, as far as listed, and the states they set. */
  summaries(bookId: string, publicationVersionId: string): PublicationMaintenanceProjection {
    if (!this.#present()) return { cases: [], total: 0, withdrawn: false, archived: false };
    const rows = this.#db.prepare(
      'SELECT case_id FROM maintenance_cases WHERE book_id = ? AND publication_version_id = ? ORDER BY ordinal DESC',
    ).all(bookId, publicationVersionId) as SqlRow[];
    const cases: MaintenanceCaseSummaryProjection[] = [];
    let withdrawn = false;
    let archived = false;
    for (const row of rows) {
      const record = this.#case(bookId, text(row.case_id));
      if (record.classification === 'withdrawal') withdrawn = true;
      if (record.classification === 'archive') archived = true;
      if (cases.length >= MAX_MAINTENANCE_CASES_LISTED) continue;
      cases.push(this.#summary(record));
    }
    return { cases, total: rows.length, withdrawn, archived };
  }

  /**
   * `更早的维护事项…` (MAINT-001): the designation's cases before the oldest one shown, newest first, a page at a time, so
   * every case it holds can be opened however many came after it.
   */
  page(input: ListMaintenanceCasesInput): MaintenanceCasePageProjection {
    requireMaintenance(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.publicationVersionId === 'string' && UUID_PATTERN.test(input.publicationVersionId) &&
      typeof input.beforeOrdinal === 'number' && Number.isSafeInteger(input.beforeOrdinal) && input.beforeOrdinal >= 1,
    'MAINTENANCE_INVALID', '维护事项请求无效。');
    requireMaintenance(this.#designation(input.bookId, input.publicationVersionId) !== null, 'MAINTENANCE_TARGET_NOT_FOUND', '所选发稿版本不属于这本书。');
    const empty = { bookId: input.bookId, publicationVersionId: input.publicationVersionId, cases: [], more: false };
    if (!this.#present()) return empty;
    const rows = this.#db.prepare(
      'SELECT case_id FROM maintenance_cases WHERE book_id = ? AND publication_version_id = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT ?',
    ).all(input.bookId, input.publicationVersionId, input.beforeOrdinal, MAX_MAINTENANCE_CASES_PAGE + 1) as SqlRow[];
    return {
      ...empty,
      cases: rows.slice(0, MAX_MAINTENANCE_CASES_PAGE).map((row) => this.#summary(this.#case(input.bookId, text(row.case_id)))),
      more: rows.length > MAX_MAINTENANCE_CASES_PAGE,
    };
  }

  /** One case as its designation lists it. */
  #summary(record: CaseRow): MaintenanceCaseSummaryProjection {
    const revisions = this.#revisions(record);
    const latest = revisions.at(-1)!;
    return {
      caseId: record.caseId,
      ordinal: record.ordinal,
      classification: record.classification,
      classificationLabel: MAINTENANCE_CLASSIFICATION_LABELS[record.classification],
      status: latest.status,
      statusLabel: MAINTENANCE_STATUS_LABELS[latest.status],
      nextStep: nextStepOf(record.classification, revisions),
      revisions: revisions.length,
      recordedAt: record.createdAt,
      latestAt: latest.recordedAt,
    };
  }

  /** Whether a 撤回 case holds the designation: in AI7 it is no longer used for 发稿 (ADR 0040). */
  withdrawn(publicationVersionId: string): boolean {
    if (!this.#present()) return false;
    return this.#db.prepare("SELECT 1 FROM maintenance_cases WHERE publication_version_id = ? AND classification = 'withdrawal'")
      .get(publicationVersionId) !== undefined;
  }

  inspect(input: InspectMaintenanceCaseInput): MaintenanceCaseProjection {
    requireMaintenance(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.caseId === 'string' && UUID_PATTERN.test(input.caseId), 'MAINTENANCE_INVALID', '维护事项请求无效。');
    requireMaintenance(this.#present(), 'MAINTENANCE_NOT_FOUND', '这个维护事项不属于这本书。');
    return this.#projection(this.#case(input.bookId, input.caseId));
  }

  /**
   * `记录维护事项` (MAINT-002, MAINT-003): one case of one classification and its first revision, bound to one exact
   * designation of the Book. The caller holds the transaction.
   */
  record(input: RecordMaintenanceCaseInput): MaintenanceCaseResultProjection {
    requireMaintenance(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.publicationVersionId === 'string' && UUID_PATTERN.test(input.publicationVersionId) &&
      typeof input.classification === 'string' && (MAINTENANCE_CLASSIFICATIONS as readonly string[]).includes(input.classification),
    'MAINTENANCE_INVALID', '维护事项请求无效。');
    const classification = input.classification;
    const reason = publicationText(input.reason, MAX_MAINTENANCE_REASON_CHARACTERS);
    requireMaintenance(reason !== null, 'MAINTENANCE_REASON_INVALID', `请写明原因（1–${MAX_MAINTENANCE_REASON_CHARACTERS} 个字）。`);
    const evidence = input.evidence === null ? null : publicationText(input.evidence, MAX_MAINTENANCE_EVIDENCE_CHARACTERS);
    requireMaintenance(input.evidence === null || evidence !== null, 'MAINTENANCE_EVIDENCE_INVALID',
      `依据最多 ${MAX_MAINTENANCE_EVIDENCE_CHARACTERS} 个字；不填写时请留空。`);
    const designation = this.#designation(input.bookId, input.publicationVersionId);
    requireMaintenance(designation !== null, 'MAINTENANCE_TARGET_NOT_FOUND', '所选发稿版本不属于这本书。');
    if (classification === 'withdrawal' || classification === 'archive') {
      const held = this.#db.prepare('SELECT 1 FROM maintenance_cases WHERE publication_version_id = ? AND classification = ?')
        .get(designation.publicationVersionId, classification) !== undefined;
      requireMaintenance(!held, 'MAINTENANCE_ALREADY_RECORDED',
        classification === 'withdrawal' ? '这个发稿版本已在 AI7 内撤回。' : '这个发稿版本的维护已经归档。');
    }
    const caseId = randomUUID();
    const createdAt = new Date().toISOString();
    const ordinal = integer((this.#db.prepare('SELECT coalesce(max(ordinal), 0) + 1 next FROM maintenance_cases WHERE book_id = ?')
      .get(input.bookId) as SqlRow).next);
    const record = canonicalRecord({
      schema: CASE_SCHEMA,
      caseId,
      bookId: input.bookId,
      ordinal,
      publicationVersionId: designation.publicationVersionId,
      publicationVersionDigest: designation.digest,
      revisionId: designation.revisionId,
      classification,
      actor: ACTOR,
      createdAt,
    });
    this.#db.prepare(
      `INSERT INTO maintenance_cases(
         case_id, book_id, ordinal, publication_version_id, revision_id, classification, actor, created_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
    ).run(caseId, input.bookId, ordinal, designation.publicationVersionId, designation.revisionId, classification, createdAt,
      record.json, record.digest);
    this.#appendRevision(caseId, null, {
      revision: 1, step: 'recorded', status: INITIAL_STATUS[classification], reason, evidence,
      markId: null, publicationVersionId: null, errataVersionId: null, recordedAt: createdAt,
    });
    return { bookId: input.bookId, maintenanceCase: this.#projection(this.#case(input.bookId, caseId)), completion: MAINTENANCE_RECORDED };
  }

  /**
   * 关联修改建议, 关联发稿版本 or 记录维护事项结论: the case's next revision, against the revision the editor read. A
   * link grants the case nothing and moves nothing it names (MAINT-010). The caller holds the transaction.
   */
  append(input: AppendMaintenanceCaseRevisionInput): MaintenanceCaseResultProjection {
    requireMaintenance(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.caseId === 'string' && UUID_PATTERN.test(input.caseId) && isRecord(input.step) &&
      typeof input.expectedRevision === 'number' && Number.isSafeInteger(input.expectedRevision),
    'MAINTENANCE_INVALID', '维护事项请求无效。');
    requireMaintenance(this.#present(), 'MAINTENANCE_NOT_FOUND', '这个维护事项不属于这本书。');
    const record = this.#case(input.bookId, input.caseId);
    const revisions = this.#revisions(record);
    const latest = this.#open(revisions, input.expectedRevision);
    const step = input.step;
    const recordedAt = new Date().toISOString();
    const next = { revision: latest.revision + 1, reason: null, evidence: null, markId: null, publicationVersionId: null, errataVersionId: null, recordedAt };
    if (step.kind === 'link-proposal') {
      requireMaintenance(record.classification === 'correction', 'MAINTENANCE_STEP_INVALID', '只有更正可以关联修改建议。');
      requireMaintenance(typeof step.markId === 'string' && UUID_PATTERN.test(step.markId), 'MAINTENANCE_INVALID', '维护事项请求无效。');
      requireMaintenance(this.#proposals(record, revisions).some((proposal) => proposal.markId === step.markId), 'MAINTENANCE_LINK_INVALID',
        '所选修改建议不是这本书稿件在这个发稿版本之后提出的，或已经关联过。');
      this.#appendRevision(record.caseId, latest.digest, { ...next, step: 'proposal-linked', status: latest.status, markId: step.markId });
      return this.#result(record, MAINTENANCE_RECORDED);
    }
    if (step.kind === 'link-publication') {
      requireMaintenance(record.classification === 'correction' || record.classification === 'supersession' || record.classification === 'reissue',
        'MAINTENANCE_STEP_INVALID', '只有更正、替代和再版可以关联发稿版本。');
      requireMaintenance(typeof step.publicationVersionId === 'string' && UUID_PATTERN.test(step.publicationVersionId),
        'MAINTENANCE_INVALID', '维护事项请求无效。');
      requireMaintenance(this.#successors(record, revisions).some((designation) => designation.publicationVersionId === step.publicationVersionId),
        'MAINTENANCE_LINK_INVALID', '只能关联在这个发稿版本之后另行设定的发稿版本，且每个只关联一次。');
      // The wait for a separately designated version ends; the case still waits for its conclusion (MAINT-007).
      this.#appendRevision(record.caseId, latest.digest, {
        ...next, step: 'publication-linked', status: latest.status === 'waiting' ? 'unresolved' : latest.status, publicationVersionId: step.publicationVersionId,
      });
      return this.#result(record, MAINTENANCE_RECORDED);
    }
    requireMaintenance(step.kind === 'conclude' && (step.status === 'unresolved' || step.status === 'complete'), 'MAINTENANCE_INVALID', '维护事项请求无效。');
    // A 替代 or 再版 ends only with the separately designated version it names (MAINT-007): until one is linked it may be
    // concluded 仍未解决, never 已完成.
    requireMaintenance(step.status !== 'complete' || !awaitsDesignation(record.classification, revisions), 'MAINTENANCE_STEP_INVALID',
      '替代和再版要先关联另行设定的发稿版本，才能记为已完成。');
    const outcome = publicationText(step.outcome, MAX_MAINTENANCE_REASON_CHARACTERS);
    requireMaintenance(outcome !== null, 'MAINTENANCE_REASON_INVALID', `请写明结论（1–${MAX_MAINTENANCE_REASON_CHARACTERS} 个字）。`);
    this.#appendRevision(record.caseId, latest.digest, { ...next, step: 'concluded', status: step.status, reason: outcome });
    return this.#result(record, MAINTENANCE_CONCLUDED);
  }

  /** `保存勘误版本` (MAINT-005): the 勘误's next version, and the case revision that links it. The caller holds the transaction. */
  saveErrata(input: SaveMaintenanceErrataInput): MaintenanceCaseResultProjection {
    requireMaintenance(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.caseId === 'string' && UUID_PATTERN.test(input.caseId) &&
      typeof input.expectedRevision === 'number' && Number.isSafeInteger(input.expectedRevision),
    'MAINTENANCE_INVALID', '维护事项请求无效。');
    requireMaintenance(this.#present(), 'MAINTENANCE_NOT_FOUND', '这个维护事项不属于这本书。');
    const record = this.#case(input.bookId, input.caseId);
    requireMaintenance(record.classification === 'errata', 'MAINTENANCE_STEP_INVALID', '只有勘误可以保存勘误版本。');
    const revisions = this.#revisions(record);
    const latest = this.#open(revisions, input.expectedRevision);
    const body = publicationText(input.body, MAX_MAINTENANCE_ERRATA_CHARACTERS);
    requireMaintenance(body !== null, 'MAINTENANCE_ERRATA_INVALID', `请写下勘误（1–${MAX_MAINTENANCE_ERRATA_CHARACTERS} 个字）。`);
    const previous = this.#errata(record.caseId);
    requireMaintenance(previous === null || previous.body !== body, 'MAINTENANCE_ERRATA_UNCHANGED', '勘误与上一版相同，没有保存新版本。');
    const errataVersionId = randomUUID();
    const recordedAt = new Date().toISOString();
    const version = (previous?.version ?? 0) + 1;
    const errata = canonicalRecord({ schema: ERRATA_SCHEMA, errataVersionId, caseId: record.caseId, version, body, recordedAt });
    this.#db.prepare(
      `INSERT INTO maintenance_errata_versions(errata_version_id, case_id, version, body, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(errataVersionId, record.caseId, version, body, recordedAt, errata.json, errata.digest);
    this.#appendRevision(record.caseId, latest.digest, {
      revision: latest.revision + 1, step: 'errata-saved', status: latest.status, reason: null, evidence: null,
      markId: null, publicationVersionId: null, errataVersionId, recordedAt,
    });
    return this.#result(record, MAINTENANCE_RECORDED);
  }

  // ---- reading ------------------------------------------------------------------------------------------------

  #result(record: CaseRow, completion: string): MaintenanceCaseResultProjection {
    return { bookId: record.bookId, maintenanceCase: this.#projection(this.#case(record.bookId, record.caseId)), completion };
  }

  /** The newest revision, when it is the one the editor read and the case still takes a step. */
  #open(revisions: RevisionRow[], expected: number): RevisionRow {
    const latest = revisions.at(-1)!;
    requireMaintenance(latest.revision === expected, 'MAINTENANCE_CASE_CHANGED', '这个维护事项在查看后有了新的记录，请看过再继续。');
    requireMaintenance(latest.status !== 'complete', 'MAINTENANCE_CASE_COMPLETE', '这个维护事项已经完成，不再记录新的步骤。');
    return latest;
  }

  #appendRevision(caseId: string, prior: string | null, revision: Omit<RevisionRow, 'digest'>): void {
    const record = revisionRecord(caseId, revision, prior);
    this.#db.prepare(
      `INSERT INTO maintenance_case_revisions(
         case_id, revision, step, status, reason, evidence, link_mark_id, link_publication_version_id, link_errata_version_id,
         actor, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
    ).run(caseId, revision.revision, revision.step, revision.status, revision.reason, revision.evidence, revision.markId,
      revision.publicationVersionId, revision.errataVersionId, revision.recordedAt, record.json, record.digest);
  }

  /** One case of the Book, its record verified against the designation it binds. */
  #case(bookId: string, caseId: string): CaseRow {
    const row = this.#db.prepare('SELECT * FROM maintenance_cases WHERE case_id = ? AND book_id = ?').get(caseId, bookId) as SqlRow | undefined;
    requireMaintenance(row !== undefined, 'MAINTENANCE_NOT_FOUND', '这个维护事项不属于这本书。');
    const record: CaseRow = {
      caseId,
      bookId,
      ordinal: integer(row.ordinal),
      publicationVersionId: text(row.publication_version_id),
      revisionId: text(row.revision_id),
      classification: text(row.classification) as MaintenanceClassification,
      createdAt: text(row.created_at),
      digest: text(row.sha256),
    };
    const designation = this.#designation(bookId, record.publicationVersionId);
    requireMaintenance(designation !== null && designation.revisionId === record.revisionId, 'MAINTENANCE_RECORD_INVALID', '维护事项所绑定的发稿版本无效。');
    const expected = canonicalRecord({
      schema: CASE_SCHEMA, caseId, bookId, ordinal: record.ordinal, publicationVersionId: record.publicationVersionId,
      publicationVersionDigest: designation.digest, revisionId: record.revisionId, classification: record.classification,
      actor: ACTOR, createdAt: record.createdAt,
    });
    requireMaintenance(expected.json === text(row.canonical_json) && expected.digest === record.digest && sha256Hex(expected.json) === record.digest,
      'MAINTENANCE_RECORD_INVALID', '维护事项记录与其摘要不一致。');
    return record;
  }

  /** The case's revisions in order, each verified and chained to the one before it. */
  #revisions(record: CaseRow): RevisionRow[] {
    const rows = this.#db.prepare('SELECT * FROM maintenance_case_revisions WHERE case_id = ? ORDER BY revision').all(record.caseId) as SqlRow[];
    requireMaintenance(rows.length > 0, 'MAINTENANCE_RECORD_INVALID', '维护事项缺少它的第一条记录。');
    let prior: string | null = null;
    return rows.map((row, index) => {
      const revision: RevisionRow = {
        revision: integer(row.revision),
        step: text(row.step) as MaintenanceCaseStep,
        status: text(row.status) as MaintenanceCaseStatus,
        reason: nullableText(row.reason),
        evidence: nullableText(row.evidence),
        markId: nullableText(row.link_mark_id),
        publicationVersionId: nullableText(row.link_publication_version_id),
        errataVersionId: nullableText(row.link_errata_version_id),
        recordedAt: text(row.recorded_at),
        digest: text(row.sha256),
      };
      const expected = revisionRecord(record.caseId, revision, prior);
      requireMaintenance(revision.revision === index + 1 && expected.json === text(row.canonical_json) && expected.digest === revision.digest,
        'MAINTENANCE_RECORD_INVALID', '维护事项的记录与其摘要不一致。');
      prior = revision.digest;
      return revision;
    });
  }

  /** The newest 勘误 version of a case, verified; `null` before the first. */
  #errata(caseId: string): { errataVersionId: string; version: number; body: string; recordedAt: string } | null {
    const row = this.#db.prepare('SELECT * FROM maintenance_errata_versions WHERE case_id = ? ORDER BY version DESC LIMIT 1').get(caseId) as SqlRow | undefined;
    if (row === undefined) return null;
    return this.#errataOf(row, caseId);
  }

  #errataOf(row: SqlRow, caseId: string): { errataVersionId: string; version: number; body: string; recordedAt: string } {
    const errata = { errataVersionId: text(row.errata_version_id), version: integer(row.version), body: text(row.body), recordedAt: text(row.recorded_at) };
    const expected = canonicalRecord({
      schema: ERRATA_SCHEMA, errataVersionId: errata.errataVersionId, caseId, version: errata.version, body: errata.body, recordedAt: errata.recordedAt,
    });
    requireMaintenance(text(row.case_id) === caseId && expected.json === text(row.canonical_json) && expected.digest === text(row.sha256),
      'MAINTENANCE_RECORD_INVALID', '勘误记录与其摘要不一致。');
    return errata;
  }

  /** One designation of the Book, named as a case names it; `null` when it is not the Book's. */
  #designation(bookId: string, publicationVersionId: string): Designation | null {
    const row = this.#db.prepare(
      `SELECT pv.publication_version_id, pv.ordinal, pv.created_at, pv.revision_id, pv.scope, pv.sha256, mr.revision_label, mv.label milestone_label
       FROM publication_versions pv
       JOIN manuscript_revisions mr ON mr.revision_id = pv.revision_id
       JOIN milestone_versions mv ON mv.milestone_id = pv.milestone_id
       WHERE pv.publication_version_id = ? AND pv.book_id = ?`,
    ).get(publicationVersionId, bookId) as SqlRow | undefined;
    return row === undefined ? null : designationOf(row);
  }

  /** The Book's designations after the target, in order: what 关联发稿版本 may name, less the ones already linked. */
  #successors(record: CaseRow, revisions: RevisionRow[]): Designation[] {
    const target = this.#designation(record.bookId, record.publicationVersionId)!;
    const linked = new Set(revisions.flatMap((revision) => (revision.publicationVersionId === null ? [] : [revision.publicationVersionId])));
    return (this.#db.prepare(
      `SELECT pv.publication_version_id, pv.ordinal, pv.created_at, pv.revision_id, pv.scope, pv.sha256, mr.revision_label, mv.label milestone_label
       FROM publication_versions pv
       JOIN manuscript_revisions mr ON mr.revision_id = pv.revision_id
       JOIN milestone_versions mv ON mv.milestone_id = pv.milestone_id
       WHERE pv.book_id = ? AND pv.ordinal > ? ORDER BY pv.ordinal`,
    ).all(record.bookId, target.ordinal) as SqlRow[]).map(designationOf).filter((designation) => !linked.has(designation.publicationVersionId));
  }

  /** The Book's manuscript's 修改建议 made after the designation, newest first: what 关联修改建议 may name, less the linked. */
  #proposals(record: CaseRow, revisions: RevisionRow[]): Array<{ markId: string; label: string; stateLabel: string; createdAt: string }> {
    const target = this.#designation(record.bookId, record.publicationVersionId)!;
    const linked = new Set(revisions.flatMap((revision) => (revision.markId === null ? [] : [revision.markId])));
    return (this.#db.prepare(
      `SELECT em.mark_id, i.current_text, i.proposed_text, em.status, em.created_at
       FROM editorial_marks em
       JOIN manuscripts m ON m.manuscript_id = em.manuscript_id AND m.role = 'primary'
       JOIN proposal_change_items i ON i.mark_id = em.mark_id
       WHERE em.book_id = ? AND em.kind = 'change-suggestion' AND em.status IN ('open', 'applied', 'resolved') AND em.created_at > ?
       ORDER BY em.created_at DESC, em.rowid DESC LIMIT ?`,
    ).all(record.bookId, target.createdAt, MAX_MAINTENANCE_PROPOSALS_OFFERED + linked.size) as SqlRow[])
      .map((row) => proposalOf(row))
      .filter((proposal) => !linked.has(proposal.markId))
      .slice(0, MAX_MAINTENANCE_PROPOSALS_OFFERED);
  }

  /** A linked record in its own words as it stands now; linking it granted the case nothing. */
  #link(record: CaseRow, revision: RevisionRow): MaintenanceCaseLinkProjection | null {
    if (revision.markId !== null) {
      const row = this.#db.prepare(
        `SELECT em.mark_id, i.current_text, i.proposed_text, em.status, em.created_at
         FROM editorial_marks em JOIN proposal_change_items i ON i.mark_id = em.mark_id
         WHERE em.mark_id = ? AND em.book_id = ?`,
      ).get(revision.markId, record.bookId) as SqlRow | undefined;
      requireMaintenance(row !== undefined, 'MAINTENANCE_RECORD_INVALID', '维护事项关联的修改建议不存在。');
      const proposal = proposalOf(row);
      return { kind: 'proposal', markId: proposal.markId, label: proposal.label, stateLabel: proposal.stateLabel };
    }
    if (revision.publicationVersionId !== null) {
      const designation = this.#designation(record.bookId, revision.publicationVersionId);
      requireMaintenance(designation !== null, 'MAINTENANCE_RECORD_INVALID', '维护事项关联的发稿版本不存在。');
      return { kind: 'publication-version', publicationVersionId: designation.publicationVersionId, label: designation.label };
    }
    if (revision.errataVersionId !== null) {
      const row = this.#db.prepare('SELECT * FROM maintenance_errata_versions WHERE errata_version_id = ?').get(revision.errataVersionId) as SqlRow | undefined;
      requireMaintenance(row !== undefined, 'MAINTENANCE_RECORD_INVALID', '维护事项关联的勘误不存在。');
      const errata = this.#errataOf(row, record.caseId);
      return { kind: 'errata', errataVersionId: errata.errataVersionId, version: errata.version };
    }
    return null;
  }

  #projection(record: CaseRow): MaintenanceCaseProjection {
    const revisions = this.#revisions(record);
    const latest = revisions.at(-1)!;
    const target = this.#designation(record.bookId, record.publicationVersionId)!;
    const open = latest.status !== 'complete';
    const listed = revisions.slice(-MAX_MAINTENANCE_REVISIONS_LISTED);
    return {
      bookId: record.bookId,
      caseId: record.caseId,
      ordinal: record.ordinal,
      classification: record.classification,
      classificationLabel: MAINTENANCE_CLASSIFICATION_LABELS[record.classification],
      consequence: MAINTENANCE_CONSEQUENCES[record.classification],
      internalOnly: record.classification === 'withdrawal' || record.classification === 'archive' ? MAINTENANCE_INTERNAL_ONLY : null,
      target: { publicationVersionId: target.publicationVersionId, ordinal: target.ordinal, label: target.label, revisionId: target.revisionId, revisionLabel: target.revisionLabel },
      status: latest.status,
      statusLabel: MAINTENANCE_STATUS_LABELS[latest.status],
      nextStep: nextStepOf(record.classification, revisions),
      revisions: listed.map((revision): MaintenanceCaseRevisionProjection => ({
        revision: revision.revision,
        step: revision.step,
        stepLabel: MAINTENANCE_STEP_LABELS[revision.step],
        status: revision.status,
        statusLabel: MAINTENANCE_STATUS_LABELS[revision.status],
        reason: revision.reason,
        evidence: revision.evidence,
        link: this.#link(record, revision),
        actor: ACTOR,
        recordedAt: revision.recordedAt,
        digest: revision.digest,
      })),
      revisionsTotal: revisions.length,
      errata: this.#errata(record.caseId),
      conclusions: !open ? [] : awaitsDesignation(record.classification, revisions) ? ['unresolved'] : ['unresolved', 'complete'],
      choices: {
        proposals: open && record.classification === 'correction' ? this.#proposals(record, revisions) : [],
        publications: open && (record.classification === 'correction' || record.classification === 'supersession' || record.classification === 'reissue')
          ? this.#successors(record, revisions).slice(0, MAX_MAINTENANCE_PUBLICATIONS_OFFERED)
            .map((designation) => ({ publicationVersionId: designation.publicationVersionId, label: designation.label }))
          : [],
      },
      expectedRevision: latest.revision,
      technical: { caseDigest: record.digest },
    };
  }
}

function designationOf(row: SqlRow): Designation {
  const ordinal = integer(row.ordinal);
  const revisionLabel = text(row.revision_label);
  return {
    publicationVersionId: text(row.publication_version_id),
    ordinal,
    createdAt: text(row.created_at),
    revisionId: text(row.revision_id),
    revisionLabel,
    digest: text(row.sha256),
    label: `第 ${ordinal} 次 · 「${text(row.milestone_label)}」 · ${revisionLabel} · ${text(row.scope)}`,
  };
}

function proposalOf(row: SqlRow): { markId: string; label: string; stateLabel: string; createdAt: string } {
  const status = text(row.status);
  const current = text(row.current_text);
  const proposed = text(row.proposed_text);
  return {
    markId: text(row.mark_id),
    label: current.length === 0 ? `修改建议 · 插入「${excerpt(proposed)}」`
      : proposed.length === 0 ? `修改建议 · 删除「${excerpt(current)}」`
        : `修改建议 · 「${excerpt(current)}」→「${excerpt(proposed)}」`,
    stateLabel: status === 'applied' ? '已应用' : status === 'open' ? '尚未应用' : '已处理，未应用',
    createdAt: text(row.created_at),
  };
}

/** A 替代 or 再版 with no later designation linked yet: it still waits for one (MAINT-007). */
function awaitsDesignation(classification: MaintenanceClassification, revisions: ReadonlyArray<RevisionRow>): boolean {
  return (classification === 'supersession' || classification === 'reissue') && !revisions.some((revision) => revision.step === 'publication-linked');
}

/** The step a case offers next (D5): none once complete. */
function nextStepOf(classification: MaintenanceClassification, revisions: ReadonlyArray<RevisionRow>): MaintenanceNextStep | null {
  const latest = revisions.at(-1)!;
  if (latest.status === 'complete') return null;
  const has = (step: MaintenanceCaseStep): boolean => revisions.some((revision) => revision.step === step);
  if (classification === 'correction') return !has('proposal-linked') ? 'link-proposal' : !has('publication-linked') ? 'link-publication' : 'conclude';
  if (classification === 'errata') return has('errata-saved') ? 'conclude' : 'write-errata';
  if (classification === 'supersession' || classification === 'reissue') return has('publication-linked') ? 'conclude' : 'link-publication';
  return 'conclude';
}
