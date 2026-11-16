import { randomUUID } from 'node:crypto';
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
