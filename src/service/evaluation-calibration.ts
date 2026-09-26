import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  CALIBRATION_MIN_ADJUSTMENTS,
  MAX_FIRST_PRINT,
  MAX_PRICE_FEN,
  PREDICTION_MIN_BOOKS_WITH_ACTUALS,
  predictionAvailable,
} from '../shared/evaluation-calibration.js';
import { canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';

/**
 * 设置 › 评估校准与预测 (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014; ADR 0076 §7). Pricing and first print
 * run are not predicted: once a Book's 发稿版本 is designated the editor enters the actuals, and only after enough published
 * Books carry them may the house turn on the prediction. House calibration of AI7's starting scores — never the editor's,
 * never a risk item — begins only after enough of the editor's adjustments, and can be turned off.
 *
 * Schema revision 51 owns two relations, ledgers like the others: each Book's 定价与首印 entries, chained per Book and bound
 * to the 发稿版本 they were entered for; and the house's two preferences, one chain. Each record is canonical and digested,
 * appended once and never rewritten.
 */

export const EVALUATION_CALIBRATION_SCHEMA_SQL = {
  publication_actuals: `CREATE TABLE publication_actuals (
  actual_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  publication_version_id TEXT NOT NULL REFERENCES publication_versions(publication_version_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  price_fen INTEGER NOT NULL CHECK(price_fen BETWEEN 1 AND ${MAX_PRICE_FEN}),
  first_print INTEGER NOT NULL CHECK(first_print BETWEEN 1 AND ${MAX_FIRST_PRINT}),
  supersedes_actual_id TEXT REFERENCES publication_actuals(actual_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes_actual_id IS NULL)),
  UNIQUE(book_id, ordinal)
) STRICT`,
  evaluation_preferences: `CREATE TABLE evaluation_preferences (
  preference_id TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal >= 1),
  prediction_enabled INTEGER NOT NULL CHECK(prediction_enabled IN (0, 1)),
  calibration_enabled INTEGER NOT NULL CHECK(calibration_enabled IN (0, 1)),
  supersedes_preference_id TEXT REFERENCES evaluation_preferences(preference_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes_preference_id IS NULL))
) STRICT`,
} as const;

export const EVALUATION_CALIBRATION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(EVALUATION_CALIBRATION_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_CALIBRATION_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_CALIBRATION_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const EVALUATION_CALIBRATION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  publication_actuals: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'publication_version_id>publication_versions.publication_version_id:NO ACTION/NO ACTION/NONE',
    'supersedes_actual_id>publication_actuals.actual_id:NO ACTION/NO ACTION/NONE',
  ],
  evaluation_preferences: ['supersedes_preference_id>evaluation_preferences.preference_id:NO ACTION/NO ACTION/NONE'],
};

export class EvaluationCalibrationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EvaluationCalibrationError';
  }
}

function requireCalibration(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new EvaluationCalibrationError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const ACTUALS_SCHEMA = 'ai7.publication-actuals/1';
const PREFERENCES_SCHEMA = 'ai7.evaluation-preferences/1';
const ACTOR = '本机编辑';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'publication_actuals'";
/** What the house starts with: no prediction, and calibration on, to begin once there are enough adjustments. */
const DEFAULT_PREFERENCES = { predictionEnabled: false, calibrationEnabled: true } as const;

/** Revision 51's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeEvaluationCalibrationSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(EVALUATION_CALIBRATION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EVALUATION_CALIBRATION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Evaluation calibration schema rollback failed.');
    }
    throw error;
  }
}

/** One 定价与首印 entry as the chain holds it. */
export interface StoredActuals {
  readonly actualId: string;
  readonly publicationVersionId: string;
  readonly publicationOrdinal: number;
  readonly ordinal: number;
  readonly priceFen: number;
  readonly firstPrint: number;
  readonly recordedAt: string;
}

export class EvaluationCalibrationLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Validate every entry in order, retaining only the Book's latest actuals and their ordinal. */
  latestActuals(bookId: string): StoredActuals | null {
    const rows = this.#db.prepare('SELECT * FROM publication_actuals WHERE book_id = ? ORDER BY ordinal').iterate(bookId) as IterableIterator<SqlRow>;
    let before: StoredActuals | null = null;
    for (const row of rows) {
      const json = String(row.canonical_json);
      requireCalibration(sha256Hex(json) === String(row.sha256), 'ACTUALS_RECORD_INVALID', '定价与首印的记录已损坏。');
      const record = JSON.parse(json) as unknown;
      const ordinal = Number(row.ordinal);
      requireCalibration(isRecord(record) && record.schema === ACTUALS_SCHEMA && record.actualId === row.actual_id && record.bookId === bookId &&
        record.publicationVersionId === row.publication_version_id && record.ordinal === ordinal && record.priceFen === Number(row.price_fen) &&
        record.firstPrint === Number(row.first_print) && record.recordedAt === row.recorded_at && record.actor === ACTOR &&
        typeof record.publicationOrdinal === 'number' && Number.isSafeInteger(record.publicationOrdinal) &&
        (record.supersedes ?? null) === (row.supersedes_actual_id ?? null) && (record.supersedes ?? null) === (before?.actualId ?? null) &&
        ordinal === (before?.ordinal ?? 0) + 1,
      'ACTUALS_RECORD_INVALID', '定价与首印的记录已损坏。');
      const entry: StoredActuals = {
        actualId: String(row.actual_id),
        publicationVersionId: String(row.publication_version_id),
        publicationOrdinal: record.publicationOrdinal as number,
        ordinal,
        priceFen: Number(row.price_fen),
        firstPrint: Number(row.first_print),
        recordedAt: String(row.recorded_at),
      };
      before = entry;
    }
    return before;
  }

  /** How many Books carry any actuals: what the prediction switch waits on (EVAL-010). */
  booksWithActuals(): number {
    return Number((this.#db.prepare('SELECT count(DISTINCT book_id) count FROM publication_actuals').get() as SqlRow).count);
  }

  /** The house's preferences as the newest entry records them, or the defaults, with the chain's length; verified. */
  preferences(): { readonly entries: number; readonly predictionEnabled: boolean; readonly calibrationEnabled: boolean } {
    const rows = this.#db.prepare('SELECT * FROM evaluation_preferences ORDER BY ordinal').iterate() as IterableIterator<SqlRow>;
    let before: string | null = null;
    let entries = 0;
    let current: { predictionEnabled: boolean; calibrationEnabled: boolean } = DEFAULT_PREFERENCES;
    for (const row of rows) {
      const json = String(row.canonical_json);
      requireCalibration(sha256Hex(json) === String(row.sha256), 'PREFERENCES_RECORD_INVALID', '评估设置的记录已损坏。');
      const record = JSON.parse(json) as unknown;
      requireCalibration(isRecord(record) && record.schema === PREFERENCES_SCHEMA && record.preferenceId === row.preference_id &&
        record.ordinal === entries + 1 && Number(row.ordinal) === entries + 1 && record.predictionEnabled === (Number(row.prediction_enabled) === 1) &&
        record.calibrationEnabled === (Number(row.calibration_enabled) === 1) && record.recordedAt === row.recorded_at && record.actor === ACTOR &&
        (record.supersedes ?? null) === (row.supersedes_preference_id ?? null) && (record.supersedes ?? null) === before,
      'PREFERENCES_RECORD_INVALID', '评估设置的记录已损坏。');
      before = String(row.preference_id);
      current = { predictionEnabled: record.predictionEnabled as boolean, calibrationEnabled: record.calibrationEnabled as boolean };
      entries += 1;
    }
    return { entries, ...current };
  }

  /**
   * 录入定价与首印 for the Book's current 发稿版本, inside the caller's transaction — refused when the entries moved since the
   * editor read them, when a number is not one, or when it would record what already stands for that 发稿版本.
   */
  recordActuals(input: {
    readonly bookId: string;
    readonly publicationVersionId: string;
    readonly publicationOrdinal: number;
    readonly expectedEntries: number;
    readonly priceFen: number;
    readonly firstPrint: number;
  }): void {
    requireCalibration(Number.isSafeInteger(input.priceFen) && input.priceFen >= 1 && input.priceFen <= MAX_PRICE_FEN,
      'ACTUALS_INVALID', '定价要是大于 0 的金额，最多两位小数。');
    requireCalibration(Number.isSafeInteger(input.firstPrint) && input.firstPrint >= 1 && input.firstPrint <= MAX_FIRST_PRINT,
      'ACTUALS_INVALID', '首印要是大于 0 的册数。');
    const latest = this.latestActuals(input.bookId);
    const entries = latest?.ordinal ?? 0;
    requireCalibration(entries === input.expectedEntries, 'ACTUALS_MOVED', '这本书的定价与首印刚被改过；请看过现在的数据再改。');
    requireCalibration(latest === null || latest.publicationVersionId !== input.publicationVersionId || latest.priceFen !== input.priceFen ||
      latest.firstPrint !== input.firstPrint, 'ACTUALS_UNCHANGED', '定价与首印没有变化。');
    const actualId = randomUUID();
    const ordinal = entries + 1;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: ACTUALS_SCHEMA,
      actualId,
      bookId: input.bookId,
      publicationVersionId: input.publicationVersionId,
      publicationOrdinal: input.publicationOrdinal,
      ordinal,
      priceFen: input.priceFen,
      firstPrint: input.firstPrint,
      supersedes: latest?.actualId ?? null,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO publication_actuals(actual_id, book_id, publication_version_id, ordinal, price_fen, first_print, supersedes_actual_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(actualId, input.bookId, input.publicationVersionId, ordinal, input.priceFen, input.firstPrint, latest?.actualId ?? null, recordedAt, record.json, record.digest);
  }

  /**
   * The house's two switches, inside the caller's transaction — refused when they moved since the editor read them, when
   * the prediction would be turned on before enough published Books carry actuals, or when nothing would change.
   */
  setPreferences(input: { readonly expectedEntries: number; readonly predictionEnabled: boolean; readonly calibrationEnabled: boolean }): void {
    const current = this.preferences();
    requireCalibration(current.entries === input.expectedEntries, 'PREFERENCES_MOVED', '评估设置刚被改过；请看过现在的设置再改。');
    requireCalibration(!input.predictionEnabled || predictionAvailable(this.booksWithActuals()), 'PREDICTION_UNAVAILABLE',
      `至少 ${PREDICTION_MIN_BOOKS_WITH_ACTUALS} 本已发稿图书录入实际数据后，才能打开定价与首印预测。`);
    requireCalibration(current.predictionEnabled !== input.predictionEnabled || current.calibrationEnabled !== input.calibrationEnabled,
      'PREFERENCES_UNCHANGED', '评估设置没有变化。');
    const rows = this.#db.prepare('SELECT preference_id FROM evaluation_preferences ORDER BY ordinal DESC LIMIT 1').get() as SqlRow | undefined;
    const preferenceId = randomUUID();
    const ordinal = current.entries + 1;
    const recordedAt = new Date().toISOString();
    const supersedes = rows === undefined ? null : String(rows.preference_id);
    const record = canonicalRecord({
      schema: PREFERENCES_SCHEMA,
      preferenceId,
      ordinal,
      predictionEnabled: input.predictionEnabled,
      calibrationEnabled: input.calibrationEnabled,
      thresholds: { calibrationAdjustments: CALIBRATION_MIN_ADJUSTMENTS, predictionBooks: PREDICTION_MIN_BOOKS_WITH_ACTUALS },
      supersedes,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO evaluation_preferences(preference_id, ordinal, prediction_enabled, calibration_enabled, supersedes_preference_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(preferenceId, ordinal, input.predictionEnabled ? 1 : 0, input.calibrationEnabled ? 1 : 0, supersedes, recordedAt, record.json, record.digest);
  }
}
