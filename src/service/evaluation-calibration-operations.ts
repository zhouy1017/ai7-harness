import type { DatabaseSync } from 'node:sqlite';
import type { EvaluationCalibrationLedger } from './evaluation-calibration.js';
import type { EvaluationRecords } from './evaluation-records.js';
import type { PublicationVersionStore } from './publication-versions.js';
import type { StoreControl } from './store-operation-support.js';
import { UUID_PATTERN, asString, requireStore, type SqlRow } from './store-records.js';
import { one } from './store-operation-support.js';
import {
  CALIBRATION_MIN_ADJUSTMENTS,
  PREDICTION_MIN_BOOKS_WITH_ACTUALS,
  calibrationActive,
  predictionAvailable,
} from '../shared/evaluation-calibration.js';
import { PUBLICATION_ACTUALS_RECORDED_STATE, type DeliverablesProjection } from '../shared/protocol/deliverables.js';
import {
  MAX_EVALUATION_CALIBRATION_BOOKS,
  type EvaluationCalibrationBookProjection,
  type EvaluationCalibrationProjection,
  type InspectEvaluationCalibrationInput,
  type RecordPublicationActualsInput,
  type SetEvaluationPreferencesInput,
} from '../shared/protocol/evaluation.js';

// ---- 设置 › 评估校准与预测 operations of the store (Issue #430, plan slice S82; moved from store.ts by Issue #1534) ----------

/** What the calibration operations reach of the store, lent by EditorialStore: its connection and ledgers read live, its guarded calls and transaction runner bound. */
export interface EvaluationCalibrationOperationsHost {
  readonly authority: DatabaseSync;
  calibrationCall<T>(operation: () => T): T;
  readonly control: StoreControl;
  readonly evaluationCalibration: EvaluationCalibrationLedger;
  readonly evaluations: EvaluationRecords;
  publicationCall<T>(operation: () => T): T;
  readonly publicationVersions: Pick<PublicationVersionStore, 'current'>;
  safeTitle(input: string): string;
  transaction<T>(db: DatabaseSync, operation: () => T): T;
}

/** 交付物's 录入定价与首印 line with what was entered for its 发稿版本 (Issue #430, S82). */
export function withActuals(host: EvaluationCalibrationOperationsHost, deliverables: DeliverablesProjection): DeliverablesProjection {
  const prompt = deliverables.publication.actualsPrompt;
  if (prompt === null) return deliverables;
  const latest = host.calibrationCall(() => host.evaluationCalibration.latestActuals(deliverables.bookId));
  if (latest === null || latest.publicationVersionId !== prompt.publicationVersionId) return deliverables;
  return {
    ...deliverables,
    publication: {
      ...deliverables.publication,
      actualsPrompt: {
        ...prompt,
        stateLabel: PUBLICATION_ACTUALS_RECORDED_STATE,
        actuals: { priceFen: latest.priceFen, firstPrint: latest.firstPrint, publicationOrdinal: latest.publicationOrdinal, recordedAt: latest.recordedAt },
      },
    },
  };
}

/**
 * 设置 › 评估校准与预测 (Issue #430, plan slice S82; EVAL-010, EVAL-011, EVAL-014): calibration's progress and switch, the
 * prediction switch and the published Books it waits on, and every Book with a 发稿版本 with its 定价与首印. A read.
 */
export function inspectEvaluationCalibration(host: EvaluationCalibrationOperationsHost, input: InspectEvaluationCalibrationInput = { after: null, focusBookId: null }): EvaluationCalibrationProjection {
  return host.calibrationCall(() => evaluationCalibrationProjection(host, input));
}

/**
 * 录入定价与首印 for a Book's current 发稿版本 (EVAL-010) — the one the page listed: a 发稿版本 designated since refuses the
 * save (Issue #430 review), so an open form never puts its numbers on a version the editor did not see.
 */
export function recordPublicationActuals(host: EvaluationCalibrationOperationsHost, input: RecordPublicationActualsInput): EvaluationCalibrationProjection {
  return host.calibrationCall(() => {
    requireStore(UUID_PATTERN.test(input.bookId), 'BOOK_INVALID', '图书标识无效。');
    host.transaction(host.authority, () => {
      one(host.authority.prepare('SELECT 1 FROM books WHERE book_id = ?').all(input.bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
      const current = host.publicationCall(() => host.publicationVersions.current(input.bookId));
      requireStore(current !== null, 'PUBLICATION_REQUIRED', '这本书还没有发稿版本；设为发稿版本后才能录入定价与首印。');
      requireStore(current.projection.publicationVersionId === input.publicationVersionId, 'ACTUALS_MOVED',
        '这本书刚设了新的发稿版本；请看过现在的发稿版本再录入。');
      host.evaluationCalibration.recordActuals({
        bookId: input.bookId,
        publicationVersionId: current.projection.publicationVersionId,
        publicationOrdinal: current.projection.ordinal,
        expectedEntries: input.expectedEntries,
        priceFen: input.priceFen,
        firstPrint: input.firstPrint,
      });
    });
    return evaluationCalibrationProjection(host, { after: null, focusBookId: input.bookId });
  });
}

/** The house's calibration and prediction switches (EVAL-010, EVAL-011). */
export function setEvaluationPreferences(host: EvaluationCalibrationOperationsHost, input: SetEvaluationPreferencesInput): EvaluationCalibrationProjection {
  return host.calibrationCall(() => {
    host.transaction(host.authority, () => host.evaluationCalibration.setPreferences(input));
    return evaluationCalibrationProjection(host);
  });
}

function evaluationCalibrationBook(host: EvaluationCalibrationOperationsHost, bookId: string, title: string): EvaluationCalibrationBookProjection | null {
  const current = host.publicationCall(() => host.publicationVersions.current(bookId));
  if (current === null) return null;
  const latest = host.evaluationCalibration.latestActuals(bookId);
  return {
    bookId, title,
    publicationVersionId: current.projection.publicationVersionId,
    publicationOrdinal: current.projection.ordinal,
    designatedAt: current.projection.createdAt,
    actuals: latest === null ? null : {
      priceFen: latest.priceFen, firstPrint: latest.firstPrint, publicationOrdinal: latest.publicationOrdinal,
      recordedAt: latest.recordedAt, current: latest.publicationVersionId === current.projection.publicationVersionId,
    },
    entries: latest?.ordinal ?? 0,
  };
}

function evaluationCalibrationProjection(host: EvaluationCalibrationOperationsHost, input: InspectEvaluationCalibrationInput = { after: null, focusBookId: null }): EvaluationCalibrationProjection {
  const { after, focusBookId } = input;
  requireStore(after === null || (UUID_PATTERN.test(after.bookId) && after.title === host.safeTitle(after.title)), 'CALIBRATION_CURSOR_INVALID', '实际数据列表位置无效。');
  requireStore(focusBookId === null || UUID_PATTERN.test(focusBookId), 'BOOK_INVALID', '图书标识无效。');
  const preferences = host.evaluationCalibration.preferences();
  const booksWithActuals = host.evaluationCalibration.booksWithActuals();
  // The Books whose editor adjusted AI7's 初评 in a 定稿 version, each counted once (Issue #429, S81b1; §8.6 「10 本调分记录」),
  // and past ten of them the house offset as the 定稿 evaluations give it now (EVAL-011a), recomputed at every read.
  const house = host.evaluations.calibration();
  const { adjustments, unreadable: unreadableBooks } = house;
  const profileItems = host.evaluations.calibrationScale().items;
  const where = 'EXISTS (SELECT 1 FROM publication_versions p WHERE p.book_id = b.book_id)';
  const rows = (after === null
    ? host.authority.prepare(`SELECT b.book_id, b.title FROM books b WHERE ${where} ORDER BY b.title, b.book_id LIMIT ?`).all(MAX_EVALUATION_CALIBRATION_BOOKS + 1)
    : host.authority.prepare(`SELECT b.book_id, b.title FROM books b WHERE ${where} AND (b.title > ? OR (b.title = ? AND b.book_id > ?)) ORDER BY b.title, b.book_id LIMIT ?`)
      .all(after.title, after.title, after.bookId, MAX_EVALUATION_CALIBRATION_BOOKS + 1)) as SqlRow[];
  const books: EvaluationCalibrationBookProjection[] = [];
  for (const row of rows.slice(0, MAX_EVALUATION_CALIBRATION_BOOKS)) {
    const book = evaluationCalibrationBook(host, asString(row.book_id), asString(row.title));
    if (book !== null) books.push(book);
  }
  const last = books.at(-1);
  const focusedRow = focusBookId === null ? undefined : host.authority.prepare('SELECT title FROM books WHERE book_id = ?').get(focusBookId) as SqlRow | undefined;
  const focusedBook = focusBookId === null || focusedRow === undefined ? null
    : books.find((book) => book.bookId === focusBookId) ?? evaluationCalibrationBook(host, focusBookId, asString(focusedRow.title));
  return {
    calibration: {
      adjustments,
      unreadableBooks,
      initialScoresConnected: true,
      threshold: host.control.calibrationMinAdjustments ?? CALIBRATION_MIN_ADJUSTMENTS,
      enabled: preferences.calibrationEnabled,
      active: calibrationActive(adjustments, preferences.calibrationEnabled, host.control.calibrationMinAdjustments ?? CALIBRATION_MIN_ADJUSTMENTS),
      offset: house.offsets === null ? null : {
        basisBooks: house.basisBooks,
        booksWithoutBasis: house.booksWithoutBasis,
        items: profileItems.map((item) => ({
          itemId: item.itemId, label: item.label, fullMarks: item.fullMarks,
          offset: house.offsets!.get(item.itemId)?.offset ?? null, books: house.offsets!.get(item.itemId)?.books ?? 0,
        })),
      },
    },
    prediction: {
      booksWithActuals,
      threshold: PREDICTION_MIN_BOOKS_WITH_ACTUALS,
      enabled: preferences.predictionEnabled,
      available: predictionAvailable(booksWithActuals),
    },
    preferenceEntries: preferences.entries,
    books,
    focusedBook,
    nextCursor: rows.length > MAX_EVALUATION_CALIBRATION_BOOKS && last !== undefined ? { title: last.title, bookId: last.bookId } : null,
  };
}