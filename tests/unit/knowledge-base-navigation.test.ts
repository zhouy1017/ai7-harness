import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createKnowledgeBase, type KnowledgeBaseOptions } from '../../src/renderer/knowledge-base.js';
import type { DefaultExecutionRulesProjection } from '../../src/shared/protocol.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { ScreenReturnHistory } from '../../src/renderer/screen-return.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(true); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });

function navigation(returnToOrigin: KnowledgeBaseOptions['returnToOrigin'] = vi.fn()) {
  const root = document.createElement('main');
  miniDocument.body.append(root as unknown as MiniElement);
  const element: KnowledgeBaseOptions['element'] = (tag, className, text) => {
    const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
  };
  const setStatus = vi.fn();
  const options: KnowledgeBaseOptions = {
    element, panel: () => element('section'), setStatus, rendererErrorMessage: (_error, fallback) => fallback,
    replaceScreen: (_state, content) => root.replaceChildren(content), rememberReturn: vi.fn(),
    button: (label, className, action) => { const node = element('button', className, label); node.addEventListener('click', () => void action()); return node; },
    technicalDetails: () => element('details'), leaveThen: async (open) => open(),
    openWordSourceVersion: vi.fn(), renderGlobalAgent: vi.fn(), returnToOrigin, initializeStartup: vi.fn(),
    openFeedbackTarget: vi.fn(), openLearningMaterialSource: vi.fn(), requestBookWorkbenchRoute: vi.fn(),
    renderBookDeliverables: vi.fn(), renderBookEvaluation: vi.fn(), renderBookAnalysis: vi.fn(), renderBookReview: vi.fn(),
  };
  return { root, setStatus, ...createKnowledgeBase(options) };
}

it.each(['guidelines', 'library'] as const)('returns a direct %s entry to its Book surface', async (tab) => {
  vi.stubGlobal('window', { ai7: {
    inspectReviewGuidelines: vi.fn(async () => ({ documents: [] })),
    inspectLibraryMaterials: vi.fn(async () => ({ materials: [], nextCursor: null })),
    inspectLibraryMaterial: vi.fn(async () => null),
  } });
  const history = new ScreenReturnHistory();
  const book = vi.fn(); const fallback = vi.fn();
  history.enter('book-review', fallback);
  history.enter('knowledge-base', book);
  const page = navigation(() => history.back('knowledge-base', fallback));
  await page.renderKnowledgeBase(tab, false, tab === 'library' ? 'attention-material' : null);
  expect(page.root.querySelector('[role="tabpanel"]')).not.toBeNull();
  const buttons = Array.from(page.root.querySelectorAll('button'));
  expect(buttons.some((button) => button.textContent === '返回知识库')).toBe(true);
  const back = buttons.find((button) => button.textContent === '返回');
  expect(back).toBeDefined();
  back!.click();
  expect(book).toHaveBeenCalledOnce();
  expect(fallback).not.toHaveBeenCalled();
});

it.each([false, true])('ignores a late rules response after navigating away (developer mode switched off: %s)', async (switchOff) => {
  let finish!: (value: DefaultExecutionRulesProjection) => void;
  const rules = new Promise<DefaultExecutionRulesProjection>((resolve) => { finish = resolve; });
  vi.stubGlobal('window', { ai7: { inspectDefaultExecutionRules: vi.fn(() => rules),
    inspectKnowledgeProcedures: vi.fn(async () => ({ preinstalled: [] })) } });
  const page = navigation();
  const pending = page.renderKnowledgeBase('rules');
  const help = document.createElement('section'); help.textContent = '帮助';
  page.root.replaceChildren(help);
  if (switchOff) setTechnicalLayerVisible(false);
  finish({ rules: [] } as unknown as DefaultExecutionRulesProjection);
  await pending;
  expect(page.root.textContent).toBe('帮助');
  expect(page.root.querySelector('[data-knowledge-tab="rules"]')).toBeNull();
  expect(page.setStatus).not.toHaveBeenCalledWith('工序与规则已打开');
});

it('ignores a late rules response when mode changes while the rules loading page stays attached', async () => {
  let finish!: (value: DefaultExecutionRulesProjection) => void;
  const rules = new Promise<DefaultExecutionRulesProjection>((resolve) => { finish = resolve; });
  vi.stubGlobal('window', { ai7: { inspectDefaultExecutionRules: vi.fn(() => rules),
    inspectKnowledgeProcedures: vi.fn(async () => ({ preinstalled: [] })) } });
  const page = navigation();
  const pending = page.renderKnowledgeBase('rules');
  setTechnicalLayerVisible(false);
  finish({ rules: [] } as unknown as DefaultExecutionRulesProjection);
  await pending;
  expect(page.root.querySelector('.knowledge-procedures')).toBeNull();
  expect(page.root.querySelector('[data-rule-count]')).toBeNull();
  expect(page.setStatus).not.toHaveBeenCalledWith('工序与规则已打开');
});
