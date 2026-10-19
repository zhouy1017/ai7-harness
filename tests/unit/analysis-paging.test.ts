import { expect, it, vi } from 'vitest';
import { hydrateAnalysisRevision } from '../../src/renderer/analysis-paging.js';
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
