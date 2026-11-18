import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { EvaluationCalibrationError, EvaluationCalibrationLedger, initializeEvaluationCalibrationSchema } from '../../../../src/service/evaluation-calibration.js';
import * as calibration from '../../../../src/service/evaluation-calibration-operations.js';
import { StoreError } from '../../../../src/service/store-records.js';
import { calibrationHost, seedBook, seedPublication, seededEvaluationDatabase } from '../../../support/domain/evaluation.js';

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError || error instanceof EvaluationCalibrationError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

describe('设置 › 评估校准与预测 over the domain relations', () => {
  it('pages published Books and reads an exact off-page Book without losing its save target', async () => {
    const db = await seededEvaluationDatabase();
    try {
      const host = calibrationHost(db);
      const ids: string[] = [];
      // Every Book carries the same title, as the real imports did: the page order falls to the Book identity.
      for (let index = 0; index < 21; index += 1) {
        const bookId = seedBook(db, '校准组稿');
        seedPublication(db, bookId);
        ids.push(bookId);
      }
      const first = calibration.inspectEvaluationCalibration(host);
      expect(first.books).toHaveLength(20);
      expect(first.nextCursor).not.toBeNull();
      const last = calibration.inspectEvaluationCalibration(host, { after: first.nextCursor, focusBookId: null });
      expect(last.books).toHaveLength(1);
      expect(last.nextCursor).toBeNull();
      expect([...first.books, ...last.books].map((book) => book.bookId).sort()).toEqual(ids.sort());
      const target = last.books[0]!;
      const opened = calibration.inspectEvaluationCalibration(host, { after: null, focusBookId: target.bookId });
      expect(opened.books).toEqual(first.books);
      expect(opened.focusedBook).toEqual(target);
      const saved = calibration.recordPublicationActuals(host, { bookId: target.bookId, publicationVersionId: target.publicationVersionId, expectedEntries: 0, priceFen: 4500, firstPrint: 3000 });
      expect(saved.books).toHaveLength(20);
      expect(saved.focusedBook?.bookId).toBe(target.bookId);
      expect(saved.focusedBook?.entries).toBe(1);
      expect(saved.focusedBook?.actuals?.priceFen).toBe(4500);
      expect(calibration.inspectEvaluationCalibration(host, { after: first.nextCursor, focusBookId: null }).books).toEqual([saved.focusedBook]);
    } finally { db.close(); }
  });

  it('opens the prediction at the thirtieth published Book with actuals and not before, and a switch that is on can always be turned off', () => {
    // The ledger alone, over the two relations it references, so thirty published Books need no thirty imports.
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT; CREATE TABLE publication_versions (publication_version_id TEXT PRIMARY KEY) STRICT;');
      initializeEvaluationCalibrationSchema(database);
      initializeEvaluationCalibrationSchema(database);
      const ledger = new EvaluationCalibrationLedger(database);
      const publishOne = (): void => {
        const bookId = randomUUID();
        const publicationVersionId = randomUUID();
        database.prepare('INSERT INTO books(book_id) VALUES (?)').run(bookId);
        database.prepare('INSERT INTO publication_versions(publication_version_id) VALUES (?)').run(publicationVersionId);
        ledger.recordActuals({ bookId, publicationVersionId, publicationOrdinal: 1, expectedEntries: 0, priceFen: 4500, firstPrint: 3000 });
      };
      for (let index = 0; index < 29; index += 1) publishOne();
      expect(ledger.booksWithActuals()).toBe(29);
      expect(refusal(() => ledger.setPreferences({ expectedEntries: 0, predictionEnabled: true, calibrationEnabled: true })))
        .toBe('PREDICTION_UNAVAILABLE:至少 30 本已发稿图书录入实际数据后，才能打开定价与首印预测。');
      publishOne();
      expect(ledger.booksWithActuals()).toBe(30);
      ledger.setPreferences({ expectedEntries: 0, predictionEnabled: true, calibrationEnabled: true });
      expect(ledger.preferences()).toEqual({ entries: 1, predictionEnabled: true, calibrationEnabled: true });
      ledger.setPreferences({ expectedEntries: 1, predictionEnabled: false, calibrationEnabled: true });
      expect(ledger.preferences()).toEqual({ entries: 2, predictionEnabled: false, calibrationEnabled: true });
    } finally {
      database.close();
    }
  });
});
