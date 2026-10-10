import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { EvaluationCalibrationError, EvaluationCalibrationLedger, initializeEvaluationCalibrationSchema } from '../../src/service/evaluation-calibration.js';
import {
  EvaluationError,
  EvaluationRecords,
  initializeEvaluationInitialDraftSchema,
  initializeEvaluationRecordSchema,
} from '../../src/service/evaluation-records.js';
import { EvaluationRewriteError, EvaluationRewrites, initializeEvaluationRewriteSchema } from '../../src/service/evaluation-rewrites.js';
import { SeriesError, SeriesLedger, initializeSeriesSchema } from '../../src/service/series.js';

// The readers 评估 guards (Issue #689, from #682's review): a row whose digest was forged to match text that is not JSON is a
// damaged row like any other, so each reader throws its owner's own error — which the store's guards turn into a `StoreError`
// and catch — never a `SyntaxError` past them. Each row is written here directly, the immutability triggers never in the way
// of an insert; nothing of a manuscript is involved.

const NOT_JSON = '{"schema":';
const DIGEST = sha256Hex(NOT_JSON);
const NOW = '2026-10-09T00:00:00.000Z';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
});

afterEach(() => {
  db.close();
});

/** The error one read throws: its class and code, or `none`. */
function thrown(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof EvaluationCalibrationError || error instanceof SeriesError || error instanceof EvaluationRewriteError || error instanceof EvaluationError) {
      return `${error.name}:${error.code}`;
    }
    return `escaped:${(error as Error).name}`;
  }
  return 'none';
}

describe('a forged-digest row that is not JSON reads as damaged, in the owner\'s own error (Issue #689)', () => {
  it('定价与首印 and 评估设置', () => {
    initializeEvaluationCalibrationSchema(db);
    const bookId = randomUUID();
    db.prepare('INSERT INTO publication_actuals(actual_id, book_id, publication_version_id, ordinal, price_fen, first_print, supersedes_actual_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, 1, 3900, 3000, NULL, ?, ?, ?)')
      .run(randomUUID(), bookId, randomUUID(), NOW, NOT_JSON, DIGEST);
    const ledger = new EvaluationCalibrationLedger(db);
    expect(thrown(() => ledger.latestActuals(bookId))).toBe('EvaluationCalibrationError:ACTUALS_RECORD_INVALID');
    expect(thrown(() => ledger.everyLatestActuals())).toBe('EvaluationCalibrationError:ACTUALS_RECORD_INVALID');
    db.prepare('INSERT INTO evaluation_preferences(preference_id, ordinal, prediction_enabled, calibration_enabled, supersedes_preference_id, recorded_at, canonical_json, sha256) VALUES (?, 1, 1, 1, NULL, ?, ?, ?)')
      .run(randomUUID(), NOW, NOT_JSON, DIGEST);
    expect(thrown(() => ledger.preferences())).toBe('EvaluationCalibrationError:PREFERENCES_RECORD_INVALID');
  });

  it('书系 and its membership chain', () => {
    initializeSeriesSchema(db);
    const seriesId = randomUUID();
    const bookId = randomUUID();
    db.prepare('INSERT INTO series(series_id, title, title_key, note, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(seriesId, '书系', '书系', '', NOW, NOT_JSON, DIGEST);
    const json = `${NOT_JSON} `;
    db.prepare(`INSERT INTO series_membership_changes(change_id, series_id, book_id, ordinal, kind, preview_digest, supersedes_change_id, recorded_at, canonical_json, sha256)
      VALUES (?, ?, ?, 1, 'add', ?, NULL, ?, ?, ?)`).run(randomUUID(), seriesId, bookId, '0'.repeat(64), NOW, json, sha256Hex(json));
    const ledger = new SeriesLedger(db);
    expect(thrown(() => ledger.find(seriesId))).toBe('SeriesError:SERIES_RECORD_INVALID');
    expect(thrown(() => ledger.latest(seriesId, bookId))).toBe('SeriesError:SERIES_RECORD_INVALID');
  });

  it('a rewrite Task, its frozen plan and the editor\'s decision', () => {
    initializeEvaluationRewriteSchema(db);
    db.exec('CREATE TABLE analysis_plan_records (task_intent_id TEXT, component TEXT, plan_version INTEGER, canonical_json TEXT, sha256 TEXT)');
    const taskIntentId = randomUUID();
    const revisionId = randomUUID();
    db.prepare(`INSERT INTO evaluation_rewrite_tasks(task_intent_id, prompt_contract_sha256, book_id, record_id, entry_ordinal, entry_sha256, recorded_at, canonical_json, sha256)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`).run(taskIntentId, '1'.repeat(64), randomUUID(), randomUUID(), '2'.repeat(64), NOW, NOT_JSON, DIGEST);
    const plan = `${NOT_JSON} `;
    db.prepare("INSERT INTO analysis_plan_records VALUES (?, 'plan-envelope', 1, ?, ?)").run(taskIntentId, plan, sha256Hex(plan));
    const decision = `${NOT_JSON}  `;
    db.prepare(`INSERT INTO evaluation_rewrite_decisions(analysis_revision_id, book_id, record_id, task_intent_id, decision, entry_ordinal, recorded_at, canonical_json, sha256)
      VALUES (?, ?, ?, ?, 'discarded', NULL, ?, ?, ?)`).run(revisionId, randomUUID(), randomUUID(), taskIntentId, NOW, decision, sha256Hex(decision));
    const rewrites = new EvaluationRewrites(db);
    expect(thrown(() => rewrites.task(taskIntentId))).toBe('EvaluationRewriteError:EVALUATION_REWRITE_RECORD_INVALID');
    expect(thrown(() => rewrites.planContract(taskIntentId))).toBe('EvaluationRewriteError:EVALUATION_REWRITE_RECORD_INVALID');
    expect(thrown(() => rewrites.decisionOf(revisionId))).toBe('EvaluationRewriteError:EVALUATION_REWRITE_RECORD_INVALID');
    // A reconciliation passes a damaged Task over, as it passes over any.
    expect(rewrites.anyTask()).toBeNull();
  });

  it('a version, a saved entry of it, and the 初评 it began from', () => {
    initializeEvaluationRecordSchema(db);
    initializeEvaluationInitialDraftSchema(db);
    const bookId = randomUUID();
    const records = new EvaluationRecords(db, { current: () => ({ manuscriptId: randomUUID(), revisionId: randomUUID(), revisionLabel: 'r1', uncheckpointed: false }) });
    const recordId = records.start(bookId);
    expect(records.rewritable(bookId, recordId).entryOrdinal).toBe(1);
    // An entry after it whose text is not JSON.
    const first = db.prepare('SELECT sha256 FROM evaluation_record_entries WHERE record_id = ?').get(recordId) as { sha256: string };
    db.prepare("INSERT INTO evaluation_record_entries(entry_id, record_id, ordinal, kind, previous_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, 2, 'draft', ?, ?, ?, ?)")
      .run(randomUUID(), recordId, first.sha256, NOW, NOT_JSON, DIGEST);
    expect(thrown(() => records.rewritable(bookId, recordId))).toBe('EvaluationError:EVALUATION_RECORD_INVALID');
    // 评估 names it; 重新评估, which needs it, is refused unless the editor skips it from nothing (Issue #708, Issue #726).
    expect(records.workspace(bookId, '书', recordId)).toMatchObject({ unreadableRecords: [1], record: null, start: { allowed: true, skipDamaged: { skipped: [1], seedOrdinal: null } } });
    expect(thrown(() => records.start(bookId))).toBe('EvaluationError:EVALUATION_RECORD_INVALID');
    // A version whose own record is not JSON, and one whose 初评 snapshot is not.
    const other = randomUUID();
    const recordJson = `${NOT_JSON} `;
    db.prepare(`INSERT INTO evaluation_records(record_id, book_id, ordinal, manuscript_id, revision_id, previous_record_id, profile_sha256, created_at, canonical_json, sha256)
      VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, ?)`).run(other, other, randomUUID(), randomUUID(), '3'.repeat(64), NOW, recordJson, sha256Hex(recordJson));
    expect(thrown(() => records.rewritable(other, other))).toBe('EvaluationError:EVALUATION_RECORD_INVALID');
    const second = randomUUID();
    const begun = records.start(second);
    const draft = `${NOT_JSON}  `;
    db.prepare('INSERT INTO evaluation_initial_drafts(record_id, analysis_revision_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
      .run(begun, randomUUID(), NOW, draft, sha256Hex(draft));
    expect(thrown(() => records.rewritable(second, begun))).toBe('EvaluationError:EVALUATION_RECORD_INVALID');
  });
});
