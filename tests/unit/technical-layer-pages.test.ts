import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { baselineAnalysisWire } from '../../src/service/analysis/baseline-analysis-wire.js';
import { renderFidelityReview } from '../../src/renderer/import-fidelity.js';
import { buildFidelityReport } from '../../src/service/docx.js';
import { IMPORT_RELATIONSHIP_LABELS } from '../../src/renderer/import-review-labels.js';
import { createImportReview } from '../../src/renderer/import-review.js';
import { createBaselineAnalysisCard } from '../../src/renderer/baseline-analysis-card.js';
import { mountSeries } from '../../src/renderer/series.js';
import { mountTaskDrawer, type MountTaskDrawerOptions } from '../../src/renderer/task-drawer.js';
import { collectTechnicalDisclosures, setTechnicalLayerVisible, technicalDisclosure } from '../../src/renderer/technical-layer.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, sample1Path } from '../support/sample1-baseline.js';
import { makeJ13Series } from '../support/series-consistency.js';
import { longPreparedAnalysis, longSettledAnalysis } from '../support/long-baseline-analysis.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });
const settle = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const technicalDetails = (_className: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement => {
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = '查看技术详情';
  details.append(summary, ...rows); return technicalDisclosure(details);
};
const scan = (root: HTMLElement) => { collectTechnicalDisclosures(root); expectNoTechnicalText(root); };
const errorMessage = (_error: unknown, fallback: string) => fallback;

it('scans the Journey import review, prepared review plan and populated Series using existing sample1/J13 fixtures', async () => {
  const roots = await createServiceTestRoots('ai7-renderer-technical-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null,
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const root = document.createElement('main'); miniDocument.body.append(root as unknown as MiniElement);
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() } });
  try {
    const staged = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
    const reviewed = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '公开样书' }, false);
    const view = createImportReview({ appendRecoveryReturnAction: vi.fn(), technicalDetails,
      replaceScreen: (_state, content) => root.replaceChildren(content), rendererErrorMessage: errorMessage,
      abandonAndContinue: vi.fn(), awaitServiceJob: vi.fn(), hasErrorCode: () => false, identityFindingDisclosure: () => document.createElement('div'),
      initializeStartup: vi.fn(), instantValue: () => document.createElement('span'), renderError: vi.fn(), renderImported: vi.fn(), setStatus: vi.fn(), sourceCard: () => document.createElement('div') });
    view.renderReview(reviewed);
    expect(root.querySelector('h2')!.textContent).toBe('导入前复核'); scan(root);
    const book = await importSample1Book(store, roots.codeRoot, '公开样书');
    view.renderTargetChoice(staged, 'new-book');
    expect(root.querySelector('[id="import-book"] option')!.textContent).toBe('新建图书');
    expect(root.querySelector('.commit-bar button.primary')).not.toBeNull(); scan(root);
    const again = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
    for (const relationship of ['source-only', 'reimport'] as const) {
      view.renderTargetChoice(again, `existing-book:${book.bookId}`, undefined, undefined, relationship);
      expect((root.querySelector('[id="import-book"]') as HTMLSelectElement).querySelector(`option[data-book-id="${book.bookId}"]`)).not.toBeNull();
      expect((root.querySelector(`[data-import-relationship="${relationship}"]`) as HTMLInputElement).checked).toBe(true);
      expect(root.querySelector('.commit-bar button.primary')).not.toBeNull(); scan(root);
    }
    expect(root.querySelector('[data-reimport-source-version-choices] input')).toBeNull();
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    let prepared = store.createReviewRunPreparationWork(book.bookId, ['local-text-check'],
      { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, [], null, null, null,
      { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [] });
    while (!prepared.done) prepared = store.advanceReviewRunPreparationWork(prepared.workId!);
    const plan = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: prepared.projection!.run!.reviewRunId });
    const drawer = mountTaskDrawer({ root, shell: document.body, api: { inspectTaskPlan: async () => plan, inspectReviewWorkspace: async () => prepared.projection! }, technicalDetails,
      errorMessage, errorCode: () => null, setStatus: vi.fn(), onOpen: vi.fn(), onClose: vi.fn(), onRecorded: vi.fn() } as unknown as MountTaskDrawerOptions);
    drawer.open({ bookId: book.bookId, kind: 'review-run', ref: plan.ref }, () => null); await settle();
    expect(root.querySelector('.task-plan-full')).not.toBeNull();
    expect(root.textContent).toContain('确定性检查'); scan(root); drawer.close(false);
    const seriesId = makeJ13Series(store, book.bookId);
    const series = mountSeries({ root, seriesId, api: { inspectSeries: async () => store.inspectSeries(seriesId) } as unknown as Parameters<typeof mountSeries>[0]['api'],
      setStatus: vi.fn(), errorMessage });
    await series.load();
    expect(root.querySelector('.knowledge-item')).not.toBeNull(); scan(root);
  } finally { store.close(); await roots.dispose(); }
});

it('scans the settled baseline, historical revision, plan versions and update controls with the existing long-analysis fixture', async () => {
  const root = document.createElement('main'); document.body.append(root);
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  vi.stubGlobal('window', { setTimeout, clearTimeout, ai7: {
    inspectCustomAnalysisDimensions: vi.fn(async () => { throw new Error('unused custom dimensions'); }),
    inspectAnalysisFeedback: vi.fn(async () => { throw new Error('unused feedback'); }),
  } });
  const card = createBaselineAnalysisCard({ screen: root, technicalDetails, rendererErrorMessage: errorMessage,
    setStatus: vi.fn(), taskDrawer: { refresh: vi.fn(), openLaunch: vi.fn() } as unknown as ReturnType<typeof mountTaskDrawer>,
    taskPlanOpenButton: () => document.createElement('button'), awaitServiceJob: vi.fn(), jumpToManuscript: vi.fn(),
    leaveReturnChip: vi.fn(), openEditorWindow: vi.fn(), openTaskPlan: vi.fn(), quickStartStartedLine: () => '', renderBookReview: vi.fn() });
  card.renderBaselineAnalysis(root, projection, '公开样书'); await settle();
  expect(root.querySelector('.baseline-analysis-card')).not.toBeNull();
  expect(root.textContent).toContain('历史记录（稿件已有更新）');
  scan(root);
});

it('keeps fidelity details closed and the text-box choice outside them (#1681)', () => {
  const signals = { inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0, textBoxes: 1, fields: 0 };
  for (const fields of [0, 2]) {
    const view = renderFidelityReview(buildFidelityReport({ ...signals, fields }, 0), null, { kind: 'offer' });
    const root = document.createElement('section'); root.append(...view.elements);
    expect(Boolean((root.querySelector('.fidelity-details') as HTMLDetailsElement).open)).toBe(false);
    expect(root.querySelector('.fidelity-details [data-text-box-choice]')).toBeNull();
    expect(root.querySelector('.fidelity-details .fidelity-summary')).toBeNull();
    expect(root.querySelector('.fidelity-summary')!.getAttribute('data-fidelity-summary')).toBe(fields ? 'decision' : 'no-decision');
    expect(root.querySelector('.fidelity-details .roundtrip-card')).not.toBeNull();
    expect(root.querySelectorAll('.fidelity-details .fidelity-row').length).toBe(9);
    const merge = root.querySelector('[data-text-box-disposition="merge"]') as HTMLInputElement;
    merge.checked = true; (merge as unknown as MiniElement).dispatchEvent({ type: 'change' });
    expect(view.textBoxDisposition()).toBe('merge');
  }
  expect(IMPORT_RELATIONSHIP_LABELS).toEqual({ 'first-manuscript': '作为首份稿件导入', 'source-only': '存为来源材料', reimport: '更新稿件' });
});
