import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { initializeRunSynthesisSchema } from '../../../../src/service/review/run-synthesis-storage.js';

it('adds a cascade-owned synthesis relation without an immutable deletion barrier (#1433)', () => {
  const db = new DatabaseSync(':memory:');
  try {
    // external-owner stub — not a schema or provenance proof. Its column is checked in the service parity case.
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE review_runs(review_run_id TEXT PRIMARY KEY) STRICT;');
    initializeRunSynthesisSchema(db);
    db.prepare('INSERT INTO review_runs VALUES (?)').run('sample1-run');
    db.prepare('INSERT INTO review_run_synthesis(review_run_id,synthesis_key,summary_json,summary_digest) VALUES (?,?,?,?)').run('sample1-run', 'sample1-summary', '{}', '0'.repeat(64));
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND tbl_name='review_run_synthesis'").all()).toEqual([]);
    db.prepare('DELETE FROM review_runs WHERE review_run_id=?').run('sample1-run');
    expect(db.prepare('SELECT * FROM review_run_synthesis').all()).toEqual([]);
  } finally { db.close(); }
});
