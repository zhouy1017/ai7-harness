import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { mountSeries, seriesListHead } from '../../src/renderer/series.js';
import { SERIES_LEDE } from '../../src/renderer/series-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book } from '../support/sample1-baseline.js';
import { makeJ13Series } from '../support/series-consistency.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });

it('offers 去审阅 beside 可以审阅 on a member whose 书系一致性 can be reviewed, and asks for that Book (#1522)', async () => {
  const roots = await createServiceTestRoots('ai7-renderer-series-review-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null,
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const root = document.createElement('main'); miniDocument.body.append(root as unknown as MiniElement);
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() } });
  try {
    const book = await importSample1Book(store, roots.codeRoot, '公开样书');
    const seriesId = makeJ13Series(store, book.bookId);
    const reviewMember = vi.fn();
    const series = mountSeries({ root, seriesId, api: { inspectSeries: async () => store.inspectSeries(seriesId) } as unknown as Parameters<typeof mountSeries>[0]['api'],
      setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, reviewMember });
    await series.load();
    const card = root.querySelector<HTMLElement>('.series-member-card')!;
    expect(card.querySelector('.series-consistency')!.textContent).toContain('可以审阅');
    const open = card.querySelector<HTMLButtonElement>('[data-series-action="review-open"]')!;
    expect(open.textContent).toBe('去审阅');
    open.click();
    expect(reviewMember).toHaveBeenCalledWith(book.bookId, '公开样书');
  } finally { store.close(); await roots.dispose(); }
});

it('opens 书系 with one sentence on what a Series is for, and says its name only in the hidden heading', () => {
  const [heading, lede] = seriesListHead();
  expect(heading!.className).toContain('visually-hidden');
  expect(lede!.textContent).toBe('把同一系列的图书归到一个书系里，就能审阅它们前后是否一致。');
  setTechnicalLayerVisible(true);
  expect(seriesListHead()[1]!.textContent).toBe(SERIES_LEDE);
});
