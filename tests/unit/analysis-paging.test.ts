import { expect, it, vi } from 'vitest';
import { hydrateAnalysisRevision, appendTaskPlanPage, retainTaskPlanPages } from '../../src/renderer/analysis-paging.js';
import { analysisOverviewPage, analysisOverviewText, baselineAnalysisWire } from '../../src/service/analysis/baseline-analysis-wire.js';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { ANALYSIS_READ_FAILED } from '../../src/renderer/analysis-paging-labels.js';
import { longPreparedAnalysis, longSettledAnalysis } from '../support/long-baseline-analysis.js';

it('keeps all eight short-book units and the exact overview inline, making no overview call', async () => {
  const full = longSettledAnalysis(longPreparedAnalysis(120));
  const revision = baselineAnalysisWire(full).resultSetRevision!;
  expect(revision.units).toHaveLength(8);
  expect(revision.unitPage).toEqual({ shown: 8, total: 8, nextOrdinal: null });
  expect(revision.overviewPage).toBeUndefined();
  const getAnalysisRevisionOverview = vi.fn();
  const hydrated = await hydrateAnalysisRevision({ getAnalysisRevisionOverview }, revision);
  expect(hydrated.sections).toEqual(full.resultSetRevision!.sections);
  expect(hydrated.synthesis).toEqual(full.resultSetRevision!.synthesis);
  expect(getAnalysisRevisionOverview).not.toHaveBeenCalled();
});

it('verifies code-point length and SHA-256 before rendering paged Unicode overviews, rejecting corruption', async () => {
  const full = longSettledAnalysis(longPreparedAnalysis(120));
  const revision = full.resultSetRevision!;
  revision.synthesis = { ...revision.synthesis, synopsis: '甲😀"\\'.repeat(20_000) };
  const { sections: _sections, synthesis: _synthesis, ...wire } = baselineAnalysisWire(full).resultSetRevision!;
  const text = analysisOverviewText(revision);
  const pages = [];
  let cursor: number | null = 0;
  do {
    const page = analysisOverviewPage(revision, cursor);
    pages.push(page);
    cursor = page.next;
  } while (cursor !== null);
  const paged = { ...wire, overviewPage: { totalLength: Array.from(text).length, sha256: sha256Hex(text), chunkCount: pages.length } };
  const getAnalysisRevisionOverview = vi.fn(async (input: { afterIndex: number }) => analysisOverviewPage(revision, input.afterIndex));
  const hydrated = await hydrateAnalysisRevision({ getAnalysisRevisionOverview }, paged);
  expect(hydrated.synthesis).toEqual(revision.synthesis);
  expect(hydrated.sections).toEqual(revision.sections);
  await expect(hydrateAnalysisRevision({ getAnalysisRevisionOverview }, { ...paged,
    overviewPage: { ...paged.overviewPage, sha256: '0'.repeat(64) } })).rejects.toThrow(ANALYSIS_READ_FAILED);
  await expect(hydrateAnalysisRevision({ getAnalysisRevisionOverview }, { ...paged,
    overviewPage: { ...paged.overviewPage, totalLength: paged.overviewPage.totalLength + 1 } })).rejects.toThrow(ANALYSIS_READ_FAILED);
});

it('appends drawer and chapter pages exactly once and rejects stale or nonadvancing replies', () => {
  const original = { rows: [1, 2], listPages: { rows: { shown: 2, total: 4, nextOrdinal: 2, digest: 'snapshot' } } };
  const page = { path: 'rows', items: [3, 4], nextOrdinal: null, digest: 'snapshot' };
  const complete = appendTaskPlanPage(original, page);
  expect(complete.rows).toEqual([1, 2, 3, 4]);
  expect(original.rows).toEqual([1, 2]);
  expect(complete.listPages.rows).toEqual({ shown: 4, total: 4, nextOrdinal: null, digest: 'snapshot' });
  expect(() => appendTaskPlanPage(complete, page)).toThrow(ANALYSIS_READ_FAILED);
  expect(() => appendTaskPlanPage(original, { ...page, digest: 'changed' })).toThrow(ANALYSIS_READ_FAILED);
  expect(() => appendTaskPlanPage(original, { ...page, items: [], nextOrdinal: 2 })).toThrow(ANALYSIS_READ_FAILED);
  expect(() => appendTaskPlanPage(original, { ...page, nextOrdinal: 1 })).toThrow(ANALYSIS_READ_FAILED);
  expect(retainTaskPlanPages(original, complete).rows).toEqual([1, 2, 3, 4]);
  const changed = { ...original, listPages: { rows: { ...original.listPages.rows, digest: 'changed' } } };
  expect(retainTaskPlanPages(changed, complete).rows).toEqual([1, 2]);
});

it('retains technical-row arrays and joins strings using code-point counts', () => {
  const original = { technical: [{ value: '甲😀' }], listPages: { 'technical.0.value': { shown: 2, total: 4, nextOrdinal: 2, digest: 'snapshot' } } };
  const next = appendTaskPlanPage(original, { path: 'technical.0.value', items: '"\\', nextOrdinal: null, digest: 'snapshot' });
  expect(Array.isArray(next.technical)).toBe(true);
  expect(next.technical[0]!.value).toBe('甲😀"\\');
  expect(next.listPages['technical.0.value'].shown).toBe(4);
});
