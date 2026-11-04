import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { baselineAnalysisWire } from '../../src/service/analysis/baseline-analysis-wire.js';
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
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    let prepared = store.createReviewRunPreparationWork(book.bookId, ['local-text-check'],
      { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, [], null, null, null,
      { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [] });
    while (!prepared.done) prepared = store.advanceReviewRunPreparationWork(prepared.workId!);
    const plan = store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: prepared.projection!.run!.reviewRunId });
    const drawer = mountTaskDrawer({ root, shell: document.body, api: { inspectTaskPlan: async () => plan }, technicalDetails,
      errorMessage, errorCode: () => null, setStatus: vi.fn(), onOpen: vi.fn(), onRecorded: vi.fn() } as unknown as MountTaskDrawerOptions);
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
    setStatus: vi.fn(), taskDrawer: { refresh: vi.fn() } as unknown as ReturnType<typeof mountTaskDrawer>,
    taskPlanOpenButton: () => document.createElement('button'), awaitServiceJob: vi.fn(), jumpToManuscript: vi.fn(),
    leaveReturnChip: vi.fn(), openEditorWindow: vi.fn(), openTaskPlan: vi.fn(), quickStartStartedLine: () => '', renderBookReview: vi.fn() });
  card.renderBaselineAnalysis(root, projection, '公开样书'); await settle();
  expect(root.querySelector('.baseline-analysis-card')).not.toBeNull();
  expect(root.textContent).toContain('历史分析结果');
  scan(root);
});
