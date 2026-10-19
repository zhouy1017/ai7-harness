import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isArrowFunction, isCallExpression, isFunctionDeclaration, isNoSubstitutionTemplateLiteral, isStringLiteral, isVariableDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { miniDocument } from '../support/mini-dom.js';
import { TASK_DRAWER_TITLE } from '../../src/renderer/task-drawer-labels.js';
import {
  ANALYSIS_PROFILE_ACTION_LABEL,
  ANALYSIS_PROFILE_NEXT_STEP,
  ANALYSIS_PROFILE_PIN_CODE,
  analysisRefusalView,
} from '../../src/renderer/overview-refusal-labels.js';

const RENDERER = readFileSync(fileURLToPath(new URL('../../src/renderer/index.ts', import.meta.url)), 'utf8');

// Execute the actual refusal handlers and navigation helpers with the existing renderer mini-DOM pattern
// (imported-exemplars.test.ts). Source matching alone cannot establish what the editor sees or a click does.
const parsed = createSourceFile('index.ts', RENDERER, ScriptTarget.ES2022, true);
const helpers = new Map<string, string>();
const refusals: string[] = [];
const taskInspections: string[] = [];
function extract(node: Node): void {
  if (isFunctionDeclaration(node) && node.name !== undefined && [
    'element', 'button', 'rendererErrorData', 'rendererErrorCode', 'rendererErrorMessage',
    'openAgentWorkspaceProfile', 'focusEditorialProfileCard',
  ].includes(node.name.text)) helpers.set(node.name.text, node.getText(parsed));
  if (isArrowFunction(node) && node.parameters[0]?.name.getText(parsed) === 'error' &&
      /analysisRefusalView/u.test(node.body.getText(parsed))) refusals.push(node.getText(parsed));
  if (isVariableDeclaration(node) && node.name.getText(parsed) === 'inspectTaskAuthorization' &&
      node.initializer !== undefined && isArrowFunction(node.initializer)) taskInspections.push(node.initializer.getText(parsed));
  forEachChild(node, extract);
}
extract(parsed);
const journey = createSourceFile('run-j01.mjs', readFileSync(new URL('../../e2e/run-j01.mjs', import.meta.url), 'utf8'), ScriptTarget.ES2022, true);
const recoveryPredicates: string[] = [];
function extractRecoveryPredicate(node: Node): void {
  if (isCallExpression(node) && node.expression.getText(journey) === 'waitFor') {
    const predicate = node.arguments[1];
    const stage = node.arguments[2];
    if (stage !== undefined && isStringLiteral(stage) && stage.text === 'before-paint-recovery-acknowledged' &&
        predicate !== undefined && isNoSubstitutionTemplateLiteral(predicate)) recoveryPredicates.push(predicate.text);
  }
  forEachChild(node, extractRecoveryPredicate);
}
extractRecoveryPredicate(journey);
const compile = (source: string): string => transpileModule(source, {
  compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None },
}).outputText;

async function refusalHarness(surface: 'task' | 'overview' | 'analysis', code: string,
  scope: 'development-ci' | 'ordinary-production' | 'developer-live' | null | 'read-failed' = 'development-ci') {
  miniDocument.body.replaceChildren();
  miniDocument.activeElement = null;
  const host = miniDocument.createElement('div');
  host.append(miniDocument.createElement('p'));
  const profileHost = miniDocument.createElement('div');
  profileHost.dataset['nativeArtifactBookId'] = 'book-1';
  const card = miniDocument.createElement('section');
  card.className = 'native-artifact-card';
  const heading = miniDocument.createElement('h3');
  card.append(heading);
  profileHost.append(card);
  miniDocument.body.append(host, profileHost);
  const scroll = vi.spyOn(card, 'scrollIntoView');
  const navigate = vi.fn(async () => undefined);
  const serviceRead = vi.fn(() => { throw new Error('The next-step button must not call a service operation.'); });
  const inspectTaskAuthorization = vi.fn(async () => { throw { code, message: '原有拒绝说明。' }; });
  const getModelServiceSettings = vi.fn(async () => {
    if (scope === 'read-failed') throw new Error('scope unavailable');
    return { launchPolicy: { operationalScope: scope } };
  });
  const context = createContext({
    document: miniDocument, screen: miniDocument.body, performance,
    window: { setTimeout, ai7: surface === 'task' ? { getModelServiceSettings, inspectTaskAuthorization } : new Proxy({}, { get: serviceRead }) },
    host, taskHost: host, analysisHost: host, first: true,
    bookId: 'book-1', bookTitle: '测试图书', overview: { book: { bookId: 'book-1' }, manuscriptState: { state: 'populated' } },
    error: { code, message: '原有拒绝说明。' },
    analysisRefusalView, TASK_DRAWER_TITLE,
    researchUnavailableLine: (_code: string, message: string) => message,
    openBookSection: navigate,
  });
  const marker = surface === 'overview' ? 'analysisHost' : 'host.replaceChildren';
  const handler = surface === 'task' ? taskInspections : refusals.filter((source) => source.includes(marker));
  expect(handler).toHaveLength(1);
  expect(helpers.size).toBe(7);
  await runInContext(compile([...helpers.values(), `const refuse = ${handler[0]}; refuse(error);`].join('\n')), context);
  return { host, heading, scroll, navigate, serviceRead, inspectTaskAuthorization, getModelServiceSettings };
}

describe('工作概览 refusals (#992)', () => {
  it('turns the missing profile pin into a plain next step with one button', () => {
    expect(ANALYSIS_PROFILE_PIN_CODE).toBe('ANALYSIS_ARTIFACT_PIN_UNAVAILABLE');
    const view = analysisRefusalView(ANALYSIS_PROFILE_PIN_CODE, '当前图书尚未固定编辑工作区方案 Revision 2。');
    expect(view).toEqual({ text: '开始分析前，先在 工作概览 › 编辑工作区方案 获取并启用本书的方案。', actionLabel: '前往编辑工作区方案' });
    expect(view.text).toBe(ANALYSIS_PROFILE_NEXT_STEP);
    expect(view.actionLabel).toBe(ANALYSIS_PROFILE_ACTION_LABEL);
    expect(view.text).not.toContain('Revision');
  });

  it('leaves every other analysis refusal with the service text and no button', () => {
    expect(analysisRefusalView('ANALYSIS_LINEAGE_UNAVAILABLE', '当前图书不是精确 sample1 主稿件血缘。'))
      .toEqual({ text: '当前图书不是精确 sample1 主稿件血缘。', actionLabel: null });
    expect(analysisRefusalView(null, '无法读取本地图书的基线稿件分析记录。'))
      .toEqual({ text: '无法读取本地图书的基线稿件分析记录。', actionLabel: null });
  });

  it.each(['ordinary-production', 'developer-live'] as const)('does not request or render the baseline task in %s', async (scope) => {
    for (const code of ['TASK_LINEAGE_UNAVAILABLE', 'TASK_POLICY_UNAVAILABLE']) {
      const { host, inspectTaskAuthorization, getModelServiceSettings } = await refusalHarness('task', code, scope);
      expect(getModelServiceSettings).toHaveBeenCalledOnce();
      expect(inspectTaskAuthorization).not.toHaveBeenCalled();
      expect(host.children).toHaveLength(0);
    }
  });

  it.each(['TASK_LINEAGE_UNAVAILABLE', 'TASK_POLICY_UNAVAILABLE', 'TASK_ARTIFACT_PIN_UNAVAILABLE', 'SERVICE_UNAVAILABLE'])(
    'keeps the development-ci prerequisite note for %s (J-03 exact reuse)', async (code) => {
      const { host, inspectTaskAuthorization } = await refusalHarness('task', code);
      expect(inspectTaskAuthorization).toHaveBeenCalledOnce();
      expect(host.querySelector('.task-authorization-card[data-task-authorization-state="unavailable"]')).not.toBeNull();
      expect(host.textContent).toContain('原有拒绝说明。');
    },
  );

  it.each([null, 'read-failed'] as const)('keeps the original task behaviour when scope is %s', async (scope) => {
    const { host, inspectTaskAuthorization } = await refusalHarness('task', 'TASK_LINEAGE_UNAVAILABLE', scope);
    expect(inspectTaskAuthorization).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-task-authorization-state="unavailable"]')).not.toBeNull();
  });

  it('J-01 recognizes painted recovery with the development-ci task note (#992)', async () => {
    const { host } = await refusalHarness('task', 'TASK_LINEAGE_UNAVAILABLE');
    const imported = miniDocument.createElement('section');
    imported.dataset['screen'] = 'imported';
    const commit = miniDocument.createElement('section');
    commit.dataset['importCommitId'] = 'recovered-commit';
    imported.append(commit, host);
    miniDocument.body.append(imported);
    const dataset: Record<string, string> = {
      ai7ProductReady: 'true', ai7ImportCompletionPainted: 'true', ai7ImportCompletionAcknowledged: 'true',
    };
    const document = {
      visibilityState: 'visible', documentElement: { dataset },
      querySelector: (selector: string) => miniDocument.body.querySelector(selector),
    };
    expect(document.querySelector('[data-task-authorization-state]')).not.toBeNull();
    expect(recoveryPredicates).toHaveLength(1);
    const recovered = () => runInContext(recoveryPredicates[0]!, createContext({ document }));
    expect(recovered()).toBe(true);
    for (const flag of ['ai7ImportCompletionPainted', 'ai7ImportCompletionAcknowledged']) {
      delete dataset[flag];
      expect(recovered()).toBe(false);
      dataset[flag] = 'true';
    }
    document.visibilityState = 'hidden';
    expect(recovered()).toBe(false);
    document.visibilityState = 'visible';
    host.replaceChildren();
    expect(recovered()).toBe(false);
  });

  it.each(['overview', 'analysis'] as const)('renders the profile next step on %s and only navigates or focuses on click', async (surface) => {
    const { host, heading, scroll, navigate, serviceRead } = await refusalHarness(surface, 'ANALYSIS_ARTIFACT_PIN_UNAVAILABLE');
    expect(host.textContent).toContain(ANALYSIS_PROFILE_NEXT_STEP);
    expect(host.textContent).not.toContain('原有拒绝说明。');
    const buttons = host.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe(ANALYSIS_PROFILE_ACTION_LABEL);
    expect(navigate).not.toHaveBeenCalled();
    buttons[0]!.click();
    await vi.waitFor(() => expect(miniDocument.activeElement).toBe(heading));
    expect(heading.tabIndex).toBe(-1);
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    if (surface === 'analysis') expect(navigate).toHaveBeenCalledExactlyOnceWith({ bookId: 'book-1', title: '测试图书' }, 'overview');
    else expect(navigate).not.toHaveBeenCalled();
    expect(serviceRead).not.toHaveBeenCalled();
  });

  it.each(['overview', 'analysis'] as const)('keeps other refusal text without a next-step button on %s', async (surface) => {
    const { host, navigate, serviceRead } = await refusalHarness(surface, 'ANALYSIS_LINEAGE_UNAVAILABLE');
    expect(host.textContent).toContain('原有拒绝说明。');
    expect(host.querySelector('button')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(serviceRead).not.toHaveBeenCalled();
  });
});
