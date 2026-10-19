import { decodeRequest, encodeServiceResponse, ProtocolError } from '../../src/service/request-frames.js';
import { expect, it } from 'vitest';
import { MAX_FRAME_BYTES } from '../../src/shared/protocol.js';
import { baselineAnalysisOutbound, baselineAnalysisWire, baselineAnalysisSummaryPage, analysisOverviewPage, analysisOverviewText, revisionUnitsPage,
  serializedBytes } from '../../src/service/analysis/baseline-analysis-wire.js';
import { longPreparedAnalysis, longSettledAnalysis, BASELINE_REPLY_OPERATIONS, baselineReplyResult } from '../support/long-baseline-analysis.js';

const operations = BASELINE_REPLY_OPERATIONS;

it('bounds every baseline reply envelope for 400-unit prepared, settled and multi-revision states without mutating records', () => {
  const prepared = longPreparedAnalysis();
  expect(prepared.coverageManifest!.units).toHaveLength(400);
  const states = { prepared, settled: longSettledAnalysis(prepared), history: longSettledAnalysis(prepared, 12) };
  for (const [state, projection] of Object.entries(states)) {
    const before = JSON.stringify(projection);
    for (const op of operations) {
      const result = baselineReplyResult(op, projection);
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
    expect(wire.history?.entries.every((entry) => entry.report !== null && !('unitRows' in entry.report) && entry.report.unitPage?.total === 400)).not.toBe(false);
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

it.each([{ paragraphs: 18000, headings: false, units: 1200, dense: true },
  { paragraphs: 6000, headings: true, units: 6000, dense: false }])(
  'bounds $units-unit replies and reads every summary-list page exactly once', ({ paragraphs, headings, units, dense }) => {
    const prepared = longPreparedAnalysis(paragraphs, headings);
    expect(prepared.coverageManifest!.units).toHaveLength(units);
    const readPath = (value: unknown, path: string): ReadonlyArray<unknown> => {
      let selected = value;
      for (const key of path.split('.')) selected = (selected as Record<string, unknown>)[key];
      return selected as ReadonlyArray<unknown>;
    };
    for (const make of [() => prepared, () => longSettledAnalysis(prepared, 1, dense), () => longSettledAnalysis(prepared, 12, dense)]) {
      const projection = make();
      const raw = baselineAnalysisWire(projection, false);
      const wire = baselineAnalysisWire(projection);
      console.info('ANALYSIS_D8_BYTES', JSON.stringify({ units, state: projection.state, revisions: projection.history?.entries.length ?? 0,
        before: serializedBytes(projection), after: serializedBytes(wire) }));
      for (const op of operations) {
        const result = baselineReplyResult(op, wire);
        expect(serializedBytes({ id: '00000000-0000-4000-8000-000000000000', ok: true, op, result }), op)
          .toBeLessThanOrEqual(MAX_FRAME_BYTES - 64 * 1024);
      }
      for (const [path, meta] of Object.entries(wire.listPages)) {
        const expected = path === 'run.attempt.spans' ? projection.run!.attempt!.spans : readPath(raw, path);
        const collected = [...readPath(wire, path)];
        let cursor = meta.nextOrdinal;
        while (cursor !== null) {
          const page = baselineAnalysisSummaryPage(projection, path, cursor);
          expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
          collected.push(...page.items);
          cursor = page.nextOrdinal;
        }
        expect(collected).toHaveLength(expected.length);
        expect(collected.map((item) => JSON.stringify(item)).sort(), path)
          .toEqual(expected.map((item) => JSON.stringify(item)).sort());
      }
    }
  }, 120_000);

it('shrinks inline lists further when they compete for the same reply budget', () => {
  const full = longSettledAnalysis(longPreparedAnalysis(), 12);
  const normal = baselineAnalysisWire(full);
  const reduced = baselineAnalysisWire(full, true, 96 * 1024);
  expect(serializedBytes(reduced)).toBeLessThanOrEqual(96 * 1024);
  expect(reduced.resultSetRevision!.unitPage.total).toBe(normal.resultSetRevision!.unitPage.total);
  expect(reduced.listPages['coverageManifest.units']!.total).toBe(400);
});

it('leaves a large first unit for the detail read instead of failing the enclosing analysis reply', () => {
  const full = longSettledAnalysis(longPreparedAnalysis(120), 1, false);
  const first = full.resultSetRevision!.units[0]!;
  if (first.state !== 'closed') throw new Error('closed synthetic unit required');
  first.synopsis = '甲'.repeat(50_000);
  const wire = baselineAnalysisWire(full);
  expect(wire.resultSetRevision!.unitPage).toEqual({ shown: 0, total: 8, nextOrdinal: 0 });
  expect(serializedBytes(wire)).toBeLessThanOrEqual(MAX_FRAME_BYTES - 64 * 1024);
  expect(revisionUnitsPage(full.resultSetRevision!, 0).units[0]).toEqual(first);
});

it('validates all readonly page cursors through the real request decoder', () => {
  const bookId = '00000000-0000-4000-8000-000000000001';
  const taskIntentId = '00000000-0000-4000-8000-000000000002';
  const revisionId = '00000000-0000-4000-8000-000000000003';
  const requests = [
    { op: 'getCoverageManifestUnits', input: { bookId, taskIntentId, afterOrdinal: 0 } },
    { op: 'getAnalysisRevisionUnits', input: { bookId, revisionId, afterOrdinal: 0 } },
    { op: 'getAnalysisRevisionOverview', input: { bookId, revisionId, afterIndex: 0 } },
    { op: 'getAnalysisRunReportRows', input: { bookId, taskIntentId, afterOrdinal: 0 } },
    { op: 'getBaselineAnalysisRangePlan', input: { bookId, unitOrdinal: 1 } },
    { op: 'getBaselineAnalysisPage', input: { bookId, taskIntentId, revisionId: null, path: 'history.entries', afterOrdinal: 0 } },
  ];
  for (const request of requests) {
    const frame = { id: taskIntentId, ...request };
    expect(decodeRequest(Buffer.from(JSON.stringify(frame)))).toEqual(frame);
    expect(() => decodeRequest(Buffer.from(JSON.stringify({ ...frame, input: { ...frame.input, bookId: 'foreign' } })))).toThrow(ProtocolError);
    const cursor = 'afterIndex' in request.input ? 'afterIndex' : 'unitOrdinal' in request.input ? 'unitOrdinal' : 'afterOrdinal';
    expect(() => decodeRequest(Buffer.from(JSON.stringify({ ...frame, input: { ...frame.input, [cursor]: -1 } })))).toThrow(ProtocolError);
  }
});

it('pages a summary list by position when its items carry ordinals that repeat or fall back', () => {
  const full = longSettledAnalysis(longPreparedAnalysis(), 1, false);
  const revision = full.resultSetRevision!;
  // A moved chapter: the second half reuses the predecessor's first-half units, so a reused lineage entry's unitOrdinal
  // (the predecessor's unit) restarts at 1 halfway down the list.
  revision.lineage = revision.lineage.map((entry, index) => index < 200 ? entry
    : { unitOrdinal: index - 199, kind: 'reused', revisionId: revision.revisionId, revisionOrdinal: 1 });
  const wire = baselineAnalysisWire(full, true, 96 * 1024);
  const meta = wire.listPages['resultSetRevision.lineage']!;
  expect(meta.total).toBe(400);
  const collected = [...wire.resultSetRevision!.lineage];
  let cursor = meta.nextOrdinal;
  while (cursor !== null) {
    const page = baselineAnalysisSummaryPage(full, 'resultSetRevision.lineage', cursor);
    collected.push(...page.items as typeof collected);
    cursor = page.nextOrdinal;
  }
  expect(collected).toEqual(revision.lineage);
  const twelve = longSettledAnalysis(longPreparedAnalysis(), 12);
  const history = baselineAnalysisWire(twelve, true, 96 * 1024);
  const entries = [...history.history!.entries];
  cursor = history.listPages['history.entries']!.nextOrdinal;
  while (cursor !== null) {
    const page = baselineAnalysisSummaryPage(twelve, 'history.entries', cursor);
    entries.push(...page.items as typeof entries);
    cursor = page.nextOrdinal;
  }
  expect(entries.map((entry) => entry.ordinal)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
});

it('keeps short-book history reports, range options and reuse sources as they were', () => {
  const short = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(120), 12));
  expect(short.listPages).toEqual({});
  expect(short.history!.entries.every((entry) => entry.report?.unitRows?.length === 8 && entry.report.unitPage === undefined)).toBe(true);
  const full = longSettledAnalysis(longPreparedAnalysis(120));
  const wire = baselineAnalysisWire(full);
  const option = full.updateControls!.actions['reanalyze-range'].options[0]!;
  expect(wire.updateControls!.actions['reanalyze-range'].options[0]).toEqual({ unitOrdinal: option.unitOrdinal, sectionOrdinal: option.sectionOrdinal,
    label: option.label, startPosition: option.startPosition, endPosition: option.endPosition });
  const unit = full.update!.reusePlan!.units[0]!;
  expect(wire.update!.reusePlan!.units[0]).toEqual({ unitOrdinal: unit.unitOrdinal, disposition: unit.disposition, reason: unit.reason, reusedFrom: unit.reusedFrom });
  const long = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(), 12));
  expect(long.history!.entries.every((entry) => entry.report?.unitRows === undefined &&
    JSON.stringify(entry.report?.unitPage) === JSON.stringify({ shown: 0, total: 400, nextOrdinal: 0 }))).toBe(true);
});

it('pages older spans by attempt ordinal when retries repeat a unit and reducer spans name no unit', () => {
  const full = longSettledAnalysis(longPreparedAnalysis(600), 1, false);
  const attempt = full.run!.attempt!;
  attempt.spans = attempt.spans.map((span, index) => ({ ...span, unitOrdinal: index % 3 === 0 ? null : Math.floor(index / 2) + 1 }));
  const wire = baselineAnalysisWire(full);
  const older = baselineAnalysisSummaryPage(full, 'run.attempt.spans', wire.listPages['run.attempt.spans']!.nextOrdinal!);
  const all = [...wire.run!.attempt!.spans, ...older.items];
  expect(all.map((item) => (item as { ordinal: number }).ordinal).sort((left, right) => left - right))
    .toEqual(attempt.spans.map((span) => span.ordinal));
  expect(older.nextOrdinal).toBeNull();
});
