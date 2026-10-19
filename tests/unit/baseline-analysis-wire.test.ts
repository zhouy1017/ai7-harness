import { encodeServiceResponse } from '../../src/service/request-frames.js';
import { expect, it } from 'vitest';
import { MAX_FRAME_BYTES } from '../../src/shared/protocol.js';
import { baselineAnalysisOutbound, baselineAnalysisWire, analysisOverviewPage, analysisOverviewText, revisionUnitsPage,
  serializedBytes } from '../../src/service/analysis/baseline-analysis-wire.js';
import { longPreparedAnalysis, longSettledAnalysis } from '../support/long-baseline-analysis.js';

const operations = ['inspectBaselineAnalysis', 'authorizeBaselineAnalysis', 'startBaselineAnalysisWhenOnline',
  'cancelWaitingBaselineAnalysis', 'cancelBaselineAnalysisRun', 'pauseBaselineAnalysisRun', 'resumeBaselineAnalysisRun',
  'editBaselineAnalysisPlan', 'answerBaselineAnalysisClarification', 'quickStartBaselineAnalysis', 'pollServiceJob'] as const;

it('bounds every baseline reply envelope for 400-unit prepared, settled and multi-revision states without mutating records', () => {
  const prepared = longPreparedAnalysis();
  expect(prepared.coverageManifest!.units).toHaveLength(400);
  const states = { prepared, settled: longSettledAnalysis(prepared), history: longSettledAnalysis(prepared, 12) };
  for (const [state, projection] of Object.entries(states)) {
    const before = JSON.stringify(projection);
    for (const op of operations) {
      const result = op === 'pollServiceJob' ? { kind: 'baseline-analysis-preparation', result: projection }
        : op === 'quickStartBaselineAnalysis' ? { outcome: 'fell-back', reasons: [], projection } : projection;
      const response = { id: '00000000-0000-4000-8000-000000000000', ok: true, op, result };
      const wire = baselineAnalysisOutbound(response);
      expect(serializedBytes(wire), `${state}/${op}`).toBeLessThanOrEqual(MAX_FRAME_BYTES - 64 * 1024);
    }
    expect(JSON.stringify(projection)).toBe(before);
    const wire = baselineAnalysisWire(projection);
    expect(wire.coverageManifest!.units.every((unit) => !('blockIds' in unit) && !('blockDigests' in unit) && !('overlapBlockIds' in unit))).toBe(true);
    if (wire.run?.attempt !== null && wire.run?.attempt !== undefined) {
      expect(wire.run.attempt.spanCount).toBe(400);
      expect(wire.run.attempt.spans).toHaveLength(20);
    }
    expect(wire.history?.entries.every((entry) => entry.report !== null && !('unitRows' in entry.report))).not.toBe(false);
  }
}, 60_000);

it('pages every realistic unit exactly once and reconstructs the exact large overview', () => {
  const revision = longSettledAnalysis(longPreparedAnalysis()).resultSetRevision!;
  expect(serializedBytes({ sections: revision.sections, synthesis: revision.synthesis })).toBeGreaterThan(MAX_FRAME_BYTES / 2);
  const wire = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis()));
  expect(wire.resultSetRevision?.overviewPage).toBeDefined();
  const units = [...revisionUnitsPage(revision, 0).units];
  let after = revisionUnitsPage(revision, 0).next;
  while (after !== null) {
    const page = revisionUnitsPage(revision, after);
    expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
    units.push(...page.units);
    after = page.next;
  }
  expect(units).toEqual(revision.units);
  const chunks: string[] = [];
  let cursor: number | null = 0;
  do {
    const page = analysisOverviewPage(revision, cursor);
    expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
    chunks.push(page.text);
    cursor = page.next;
  } while (cursor !== null);
  expect(chunks.join('')).toBe(analysisOverviewText(revision));
}, 60_000);

it('still surfaces RESPONSE_TOO_LARGE for an oversized reply outside the baseline mapper', () => {
  const result: { state: 'stopping'; oversized: string } = { state: 'stopping', oversized: 'x'.repeat(MAX_FRAME_BYTES) };
  const frame = encodeServiceResponse({ id: 'synthetic-frame', ok: true, op: 'shutdown', result });
  expect(frame.readUInt32BE(0)).toBe(frame.length - 4);
  expect(JSON.parse(frame.subarray(4).toString('utf8'))).toEqual({ id: 'synthetic-frame', ok: false,
    error: { code: 'RESPONSE_TOO_LARGE', message: '服务响应超出安全范围。' } });
});
