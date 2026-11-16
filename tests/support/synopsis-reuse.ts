import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { join } from 'node:path';
import type { EditorialStore } from '../../src/service/store.js';
import type { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { BASELINE_ANALYSIS_TASK_GOAL, BASELINE_ANALYSIS_MODE_GOALS, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { loadModelFixture, type ModelFixtureEntry } from '../../src/service/provider/model-fixture.js';

/** Generators reuse the admitted SampleBook's existing provider-free baseline answers. */
export async function seedSynopsisBaselineAnswers(entries: Map<string, ModelFixtureEntry>, codeRoot: string): Promise<void> {
  const baseline = await loadModelFixture(join(codeRoot, 'tests/fixtures/model'), 'sample1-baseline-happy');
  for (const [key, entry] of baseline.entries) if (!entries.has(key)) entries.set(key, entry);
}

export async function runSynopsisBaseline(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, bookId: string, policy: LaunchPolicyProjection): Promise<void> {
  const again = store.inspectBaselineAnalysis(bookId).resultSetRevision !== null;
  const launched = store.launchBaselineAnalysis({ bookId, clientCommandId: randomUUID(),
    goal: again ? BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'] : BASELINE_ANALYSIS_TASK_GOAL,
    update: again ? { mode: 'reanalyze-book', selectedRange: null } : null }, policy);
  owner.admitAndDispatch(launched.runRecordId, store.baselineAnalysisLedger);
  await owner.whenIdle();
  if (store.inspectBaselineAnalysis(bookId).resultSetRevision === null) throw new Error('SYNOPSIS_BASELINE_NOT_CLOSED');
}

/** Append an isolated baseline variant for damaged/older-record compatibility probes. Existing
 * immutable rows and triggers remain intact; no manuscript or original plan is rewritten.
 */
export function appendBaselineUnitVariant(dataRoot: string, bookId: string, variant: 'bad-digest' | 'missing-synopsis'): void {
  const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'));
  try {
    const row = db.prepare(`SELECT r.* FROM analysis_result_set_revisions r JOIN analysis_result_sets s ON s.result_set_id=r.result_set_id
      WHERE s.book_id=? AND s.kind='baseline-manuscript-analysis' ORDER BY r.ordinal DESC LIMIT 1`).get(bookId)!;
    const revisionId = randomUUID(), ordinal = Number(row.ordinal) + 1;
    const body = canonicalRecord({ ...JSON.parse(String(row.canonical_json)), revisionId, ordinal });
    const copy = { ...row, revision_id: revisionId, ordinal, canonical_json: body.json, sha256: body.digest };
    const columns = Object.keys(copy);
    db.prepare(`INSERT INTO analysis_result_set_revisions(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(copy));
    for (const unit of db.prepare('SELECT * FROM analysis_unit_results WHERE revision_id=? ORDER BY unit_ordinal').all(row.revision_id!)) {
      let json = String(unit.canonical_json), digest = String(unit.sha256);
      if (Number(unit.unit_ordinal) === 2) {
        if (variant === 'bad-digest') digest = '0'.repeat(64);
        else { const value = JSON.parse(json); delete value.synopsis; const record = canonicalRecord(value); json = record.json; digest = record.digest; }
      }
      db.prepare('INSERT INTO analysis_unit_results(revision_id,unit_ordinal,state,canonical_json,sha256) VALUES (?,?,?,?,?)')
        .run(revisionId, unit.unit_ordinal!, unit.state!, json, digest);
    }
  } finally { db.close(); }
}
