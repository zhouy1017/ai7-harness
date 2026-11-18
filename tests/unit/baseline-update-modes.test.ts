import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { baselineAnalysisWire } from '../../src/service/analysis/baseline-analysis-wire.js';
import { createBaselineAnalysisCard } from '../../src/renderer/baseline-analysis-card.js';
import { mountTaskDrawer } from '../../src/renderer/task-drawer.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { longPreparedAnalysis, longSettledAnalysis } from '../support/long-baseline-analysis.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

vi.mock('../../src/renderer/task-panel.js', () => ({ mountTaskPanel: () => ({ element: document.createElement('div'), stop: vi.fn() }), mountTaskComposer: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
vi.mock('../../src/renderer/dialogue.js', () => ({ mountDialogue: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });

// 更新这份分析 (#1526 review): the bar's start names the mode it will run, and the pressed mode button is that mode — after a
// mode button and after a range pick alike.
it('names the chosen update mode on the start and keeps the pressed button on it, by button and by range', async () => {
  const projection = baselineAnalysisWire(longSettledAnalysis(longPreparedAnalysis(3), 2, false));
  const controls = projection.updateControls!;
  for (const mode of ['sync-current', 'reanalyze-range', 'reanalyze-book'] as const) Object.assign(controls.actions[mode], { available: true, unavailableReason: null });
  const option = controls.actions['reanalyze-range'].options[0]!;
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() }, ai7: {
    inspectCustomAnalysisDimensions: vi.fn(async () => { throw new Error('unused custom dimensions'); }),
    inspectAnalysisFeedback: vi.fn(async () => { throw new Error('unused feedback'); }),
    getBaselineAnalysisRangePlan: vi.fn(async () => ({ selectedRange: { startPosition: option.startPosition, endPosition: option.endPosition }, expected: { reused: 1, recomputed: 1, invalidated: 0, bypassed: 0 } })),
  } });
  const drawerRoot = document.createElement('aside'); document.body.append(drawerRoot);
  const drawer = mountTaskDrawer({ root: drawerRoot, shell: document.body, onOpen: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn(), errorCode: () => null,
    errorMessage: (_error: unknown, fallback: string) => fallback, technicalDetails: () => document.createElement('details'),
    api: { getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }), getPreferences: async () => ({ values: preferenceDefaults() }) } } as never);
  const root = miniDocument.createElement('main'); miniDocument.body.append(root);
  const card = createBaselineAnalysisCard({ screen: root as unknown as HTMLElement, technicalDetails: () => document.createElement('details'), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    setStatus: vi.fn(), taskDrawer: drawer, taskPlanOpenButton: () => document.createElement('button'), awaitServiceJob: vi.fn(), jumpToManuscript: vi.fn(),
    leaveReturnChip: vi.fn(), openEditorWindow: vi.fn(), openTaskPlan: vi.fn(), quickStartStartedLine: () => '', renderBookReview: vi.fn() } as never);
  card.renderBaselineAnalysis(root as unknown as HTMLElement, projection, '公开样书');
  const launch = () => root.querySelector('[data-task-launch-kind="baseline-analysis"] [data-task-drawer-control="launch"]')!;
  const pressed = () => root.querySelectorAll('.analysis-update-action [aria-pressed="true"]').map(node => node.dataset['analysisAction']);
  await vi.waitFor(() => expect(launch()).not.toBeNull());
  expect([launch().textContent, pressed()]).toEqual(['开始同步', ['sync-current']]);
  root.querySelector('.analysis-update-action [data-analysis-action="reanalyze-book"]')!.click();
  expect([launch().textContent, pressed()]).toEqual(['开始全部重来', ['reanalyze-book']]);
  const radio = root.querySelector('.analysis-range-option input')!;
  radio.checked = true; radio.dispatchEvent({ type: 'change', bubbles: true });
  expect([launch().textContent, pressed()]).toEqual(['开始重新分析', ['reanalyze-range']]);
  root.querySelector('.analysis-update-action [data-analysis-action="sync-current"]')!.click();
  expect([launch().textContent, pressed()]).toEqual(['开始同步', ['sync-current']]);
});
