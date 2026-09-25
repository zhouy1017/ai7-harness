import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EVALUATION_CALIBRATION_SCHEMA_SQL,
  EVALUATION_CALIBRATION_TRIGGER_SQL,
  EvaluationCalibrationError,
  EvaluationCalibrationLedger,
  initializeEvaluationCalibrationSchema,
} from '../../src/service/evaluation-calibration.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_EXPORT_SCHEMA_VERSION, LEARNING_ELIGIBILITY_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { MAX_FIRST_PRINT, MAX_PRICE_FEN } from '../../src/shared/evaluation-calibration.js';
import { PUBLICATION_FORBIDDEN_WORDS, type DesignatePublicationVersionInput, type EvaluationCalibrationProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 设置 › 评估校准与预测 (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014; ADR
// 0076 §7) over the real store: 定价与首印 entered for a Book's current 发稿版本 and shown on 交付物's line, the house's two
// switches with the prediction closed until thirty published Books carry actuals, both ledgers across a restart, refusing to be
// rewritten, and revision 51 added to a revision-50 store. The manuscript is composed from the one admitted SampleBook and no
// assertion reads its text; prices and print runs are the suite's own.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 24, title: '校准组稿' };
const EDIT = '〔编辑改动〕';
const ACTUALS_TABLES = Object.keys(EVALUATION_CALIBRATION_SCHEMA_SQL);

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-evaluation-calibration-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** The editor's own typing, one journal edit at the start of the first paragraph, so the next milestone freezes a new revision. */
function edit(store: EditorialStore, book: Imported): void {
  const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = now.blocks.find((candidate) => candidate.kind === 'paragraph')!;
  store.flushJournalEdit({
    clientEditId: randomUUID(),
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    baseRevisionId: now.revisionId,
    blockId: block.blockId,
    windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: block.digest,
    expectedJournalSequence: now.journalSequence,
    fromGrapheme: 0,
    toGrapheme: 0,
    insertText: EDIT,
  });
}

/** 设为发稿版本 over a new milestone of the Book's current state; the request, so it can be repeated. */
async function publish(store: EditorialStore, book: Imported, label: string, scope: string): Promise<DesignatePublicationVersionInput> {
  const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, label, 'delivery-candidate', null, '');
  const input = { bookId: book.bookId, milestoneId: milestone.milestoneId, scope, basis: '三审通过' };
  expect(store.designatePublicationVersion(input).outcome).toBe('designated');
  return input;
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError || error instanceof EvaluationCalibrationError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function counts(): Record<string, number> {
  const database = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    return Object.fromEntries(ACTUALS_TABLES.map((table) => [table, (database.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count]));
  } finally {
    database.close();
  }
}

/** Each listed Book as its 发稿版本 ordinal, its actuals and how many entries it holds. */
function booksOf(projection: EvaluationCalibrationProjection): unknown[] {
  return projection.books.map((book) => [book.title, book.publicationOrdinal, book.actuals === null ? null
    : [book.actuals.priceFen, book.actuals.firstPrint, book.actuals.publicationOrdinal, book.actuals.current], book.entries]);
}

describe('设置 › 评估校准与预测 over the real store', () => {
  it('enters 定价与首印 for the current 发稿版本 only, shows them on 交付物\'s line, and refuses what moved, is no number or already stands', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    try {
      // Before any Book: calibration waits on adjustments the editor cannot make yet, the prediction is closed, nothing listed.
      expect(store.inspectEvaluationCalibration()).toEqual({
        calibration: { adjustments: 0, threshold: 10, enabled: true, active: false },
        prediction: { booksWithActuals: 0, threshold: 30, enabled: false, available: false },
        preferenceEntries: 0,
        books: [],
      });
      const book = await importBook(store);
      bookId = book.bookId;
      const entry = { bookId, expectedEntries: 0, priceFen: 4500, firstPrint: 3000 };

      // A Book with no 发稿版本 has nothing to enter them for, and is not listed.
      expect(refusal(() => store.recordPublicationActuals(entry))).toBe('PUBLICATION_REQUIRED:这本书还没有发稿版本；设为发稿版本后才能录入定价与首印。');
      expect(refusal(() => store.recordPublicationActuals({ ...entry, bookId: 'not-a-uuid' }))).toBe('BOOK_INVALID:图书标识无效。');
      expect(refusal(() => store.recordPublicationActuals({ ...entry, bookId: randomUUID() }))).toBe('BOOK_NOT_FOUND:图书不存在。');
      expect(store.inspectEvaluationCalibration().books).toEqual([]);

      const designation = await publish(store, book, '二审稿', '纸质版首印');
      const pending = store.inspectDeliverables(bookId).publication.actualsPrompt!;
      expect([pending.label, pending.stateLabel, pending.actuals]).toEqual(['录入定价与首印', '尚未录入', null]);
      const listed = store.inspectEvaluationCalibration();
      expect(booksOf(listed)).toEqual([['校准组稿', 1, null, 0]]);
      expect(listed.books[0]!.publicationVersionId).toBe(pending.publicationVersionId);

      // Numbers that are not a price or a print run, and a count the editor did not see, are refused by name.
      for (const [change, expected] of [
        [{ priceFen: 0 }, 'ACTUALS_INVALID:定价要是大于 0 的金额，最多两位小数。'],
        [{ priceFen: MAX_PRICE_FEN + 1 }, 'ACTUALS_INVALID:定价要是大于 0 的金额，最多两位小数。'],
        [{ priceFen: 45.5 }, 'ACTUALS_INVALID:定价要是大于 0 的金额，最多两位小数。'],
        [{ firstPrint: 0 }, 'ACTUALS_INVALID:首印要是大于 0 的册数。'],
        [{ firstPrint: MAX_FIRST_PRINT + 1 }, 'ACTUALS_INVALID:首印要是大于 0 的册数。'],
        [{ expectedEntries: 1 }, 'ACTUALS_MOVED:这本书的定价与首印刚被改过；请看过现在的数据再改。'],
      ] as const) {
        expect(refusal(() => store.recordPublicationActuals({ ...entry, ...change }))).toBe(expected);
      }
      expect(counts()).toEqual({ publication_actuals: 0, evaluation_preferences: 0 });

      // Entered: the list and 交付物's line both carry them, and the prediction counts the Book.
      const recorded = store.recordPublicationActuals(entry);
      expect(booksOf(recorded)).toEqual([['校准组稿', 1, [4500, 3000, 1, true], 1]]);
      expect(recorded.prediction).toEqual({ booksWithActuals: 1, threshold: 30, enabled: false, available: false });
      const shown = store.inspectDeliverables(bookId).publication.actualsPrompt!;
      expect([shown.stateLabel, shown.actuals?.priceFen, shown.actuals?.firstPrint, shown.actuals?.publicationOrdinal]).toEqual(['已录入', 4500, 3000, 1]);
      // An identical repeat of 设为发稿版本 appends nothing and answers 交付物 with the same line.
      const repeated = store.designatePublicationVersion(designation);
      expect([repeated.outcome, repeated.deliverables.publication.actualsPrompt?.stateLabel, repeated.deliverables.publication.actualsPrompt?.actuals?.priceFen])
        .toEqual(['unchanged', '已录入', 4500]);
      expect(refusal(() => store.recordPublicationActuals({ ...entry, expectedEntries: 1 }))).toBe('ACTUALS_UNCHANGED:定价与首印没有变化。');
      expect(refusal(() => store.recordPublicationActuals(entry))).toBe('ACTUALS_MOVED:这本书的定价与首印刚被改过；请看过现在的数据再改。');

      // Changed: a second entry supersedes the first, which stays as it was.
      expect(booksOf(store.recordPublicationActuals({ ...entry, expectedEntries: 1, priceFen: 3990 }))).toEqual([['校准组稿', 1, [3990, 3000, 1, true], 2]]);

      // A newer 发稿版本 starts its own line: 尚未录入 on 交付物, the earlier entry named as the earlier version's.
      edit(store, book);
      await publish(store, book, '三审稿', '电子版首发');
      const newer = store.inspectDeliverables(bookId).publication.actualsPrompt!;
      expect([newer.stateLabel, newer.actuals]).toEqual(['尚未录入', null]);
      expect(booksOf(store.inspectEvaluationCalibration())).toEqual([['校准组稿', 2, [3990, 3000, 1, false], 2]]);
      // The same numbers are no repeat for another 发稿版本.
      const again = store.recordPublicationActuals({ ...entry, expectedEntries: 2, priceFen: 3990 });
      expect(booksOf(again)).toEqual([['校准组稿', 2, [3990, 3000, 2, true], 3]]);
      expect(again.prediction.booksWithActuals).toBe(1);
      for (const value of [again, store.inspectDeliverables(bookId)]) {
        for (const word of PUBLICATION_FORBIDDEN_WORDS) expect(JSON.stringify(value).includes(word)).toBe(false);
      }
      expect(counts()).toEqual({ publication_actuals: 3, evaluation_preferences: 0 });
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A restart keeps every entry; the ledgers refuse to be rewritten, and an entry rewritten by hand no longer reads.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(booksOf(reopened.inspectEvaluationCalibration())).toEqual([['校准组稿', 2, [3990, 3000, 2, true], 3]]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(databasePath());
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_EXPORT_SCHEMA_VERSION);
      const records = (database.prepare('SELECT canonical_json FROM publication_actuals ORDER BY ordinal').all() as Array<{ canonical_json: string }>)
        .map((row) => JSON.parse(row.canonical_json) as { schema: string; priceFen: number; publicationOrdinal: number; supersedes: string | null; actor: string });
      expect(records.map((record) => [record.schema, record.priceFen, record.publicationOrdinal, record.supersedes === null, record.actor])).toEqual([
        ['ai7.publication-actuals/1', 4500, 1, true, '本机编辑'],
        ['ai7.publication-actuals/1', 3990, 1, false, '本机编辑'],
        ['ai7.publication-actuals/1', 3990, 2, false, '本机编辑'],
      ]);
      expect(() => database.exec('UPDATE publication_actuals SET price_fen = 1')).toThrowError(/EVALUATION_CALIBRATION_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM publication_actuals')).toThrowError(/EVALUATION_CALIBRATION_LEDGER_IMMUTABLE/u);
      // Rewritten with a digest that matches: the record no longer agrees with its row.
      database.exec('DROP TRIGGER publication_actuals_no_update');
      const first = database.prepare('SELECT actual_id, canonical_json FROM publication_actuals WHERE ordinal = 1 AND book_id = ?').get(bookId!) as { actual_id: string; canonical_json: string };
      const rewritten = first.canonical_json.replace('"priceFen":4500', '"priceFen":4600');
      expect(rewritten).not.toBe(first.canonical_json);
      database.prepare('UPDATE publication_actuals SET canonical_json = ?, sha256 = ? WHERE actual_id = ?')
        .run(rewritten, createHash('sha256').update(rewritten).digest('hex'), first.actual_id);
      database.exec(EVALUATION_CALIBRATION_TRIGGER_SQL.publication_actuals_no_update!);
    } finally {
      database.close();
    }
    const tampered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(refusal(() => tampered.inspectEvaluationCalibration())).toBe('ACTUALS_RECORD_INVALID:定价与首印的记录已损坏。');
      expect(refusal(() => tampered.inspectDeliverables(bookId!))).toBe('ACTUALS_RECORD_INVALID:定价与首印的记录已损坏。');
      tampered.markCleanShutdown();
    } finally {
      tampered.close();
    }
  }, 240_000);

  it('turns calibration off and on, keeps the prediction closed before thirty published Books carry actuals, and keeps every change', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const off = store.setEvaluationPreferences({ expectedEntries: 0, predictionEnabled: false, calibrationEnabled: false });
      expect([off.calibration, off.preferenceEntries]).toEqual([{ adjustments: 0, threshold: 10, enabled: false, active: false }, 1]);
      expect(refusal(() => store.setEvaluationPreferences({ expectedEntries: 0, predictionEnabled: false, calibrationEnabled: true })))
        .toBe('PREFERENCES_MOVED:评估设置刚被改过；请看过现在的设置再改。');
      expect(refusal(() => store.setEvaluationPreferences({ expectedEntries: 1, predictionEnabled: false, calibrationEnabled: false })))
        .toBe('PREFERENCES_UNCHANGED:评估设置没有变化。');
      expect(refusal(() => store.setEvaluationPreferences({ expectedEntries: 1, predictionEnabled: true, calibrationEnabled: false })))
        .toBe('PREDICTION_UNAVAILABLE:至少 30 本已发稿图书录入实际数据后，才能打开定价与首印预测。');
      const on = store.setEvaluationPreferences({ expectedEntries: 1, predictionEnabled: false, calibrationEnabled: true });
      expect([on.calibration.enabled, on.prediction.enabled, on.preferenceEntries]).toEqual([true, false, 2]);
      expect(counts()).toEqual({ publication_actuals: 0, evaluation_preferences: 2 });
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const kept = reopened.inspectEvaluationCalibration();
      expect([kept.calibration.enabled, kept.prediction.enabled, kept.preferenceEntries]).toEqual([true, false, 2]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(databasePath());
    try {
      const records = (database.prepare('SELECT canonical_json FROM evaluation_preferences ORDER BY ordinal').all() as Array<{ canonical_json: string }>)
        .map((row) => JSON.parse(row.canonical_json) as { calibrationEnabled: boolean; predictionEnabled: boolean; thresholds: unknown });
      expect(records.map((record) => [record.calibrationEnabled, record.predictionEnabled, record.thresholds])).toEqual([
        [false, false, { calibrationAdjustments: 10, predictionBooks: 30 }],
        [true, false, { calibrationAdjustments: 10, predictionBooks: 30 }],
      ]);
      expect(() => database.exec('UPDATE evaluation_preferences SET prediction_enabled = 1')).toThrowError(/EVALUATION_CALIBRATION_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM evaluation_preferences')).toThrowError(/EVALUATION_CALIBRATION_LEDGER_IMMUTABLE/u);
      // The switch rewritten on the row alone: the record no longer agrees with it.
      database.exec('DROP TRIGGER evaluation_preferences_no_update');
      database.exec('UPDATE evaluation_preferences SET prediction_enabled = 1 WHERE ordinal = 2');
      database.exec(EVALUATION_CALIBRATION_TRIGGER_SQL.evaluation_preferences_no_update!);
    } finally {
      database.close();
    }
    const tampered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(refusal(() => tampered.inspectEvaluationCalibration())).toBe('PREFERENCES_RECORD_INVALID:评估设置的记录已损坏。');
      tampered.markCleanShutdown();
    } finally {
      tampered.close();
    }
  }, 120_000);

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

  it('adds revision 51 to a revision-50 store with nothing else moved, and an earlier 发稿版本 reads 尚未录入', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    try {
      const book = await importBook(first);
      bookId = book.bookId;
      await publish(first, book, '二审稿', '纸质版首印');
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const tablesOf = (database: DatabaseSync): Array<{ name: string; sql: string }> =>
      database.prepare("SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'trigger', 'index') AND sql IS NOT NULL ORDER BY name").all() as Array<{ name: string; sql: string }>;
    const plant = new DatabaseSync(databasePath());
    let before: Array<{ name: string; sql: string }>;
    try {
      plant.exec(`DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; DROP TABLE store_versions; DROP TABLE series_knowledge_promotions; DROP TABLE series_knowledge_revisions; DROP TABLE series_knowledge_candidates; DROP TABLE series_knowledge_items; DROP TABLE series_membership_changes; DROP TABLE series; DROP TABLE evaluation_preferences; DROP TABLE publication_actuals; PRAGMA user_version = ${LEARNING_ELIGIBILITY_SCHEMA_VERSION};`);
      before = tablesOf(plant);
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const prompt = migrated.inspectDeliverables(bookId!).publication.actualsPrompt!;
      expect([prompt.stateLabel, prompt.actuals]).toEqual(['尚未录入', null]);
      expect(booksOf(migrated.inspectEvaluationCalibration())).toEqual([['校准组稿', 1, null, 0]]);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(databasePath(), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DATABASE_EXPORT_SCHEMA_VERSION);
      const after = tablesOf(database);
      // Revision 52's Series relations (Issue #63, S28a) return with it, as the planted store lacked them too.
      expect(after.filter((entry) => !/^(publication_actuals|evaluation_preferences|series|store_versions|database_export_)/u.test(entry.name))).toEqual(before!);
      expect(after.filter((entry) => ACTUALS_TABLES.includes(entry.name)).map((entry) => entry.sql))
        .toEqual(ACTUALS_TABLES.slice().sort().map((table) => EVALUATION_CALIBRATION_SCHEMA_SQL[table as keyof typeof EVALUATION_CALIBRATION_SCHEMA_SQL]));
      expect(counts()).toEqual({ publication_actuals: 0, evaluation_preferences: 0 });
    } finally {
      database.close();
    }
  }, 120_000);
});
