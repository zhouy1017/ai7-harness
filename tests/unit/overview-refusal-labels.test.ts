import { identityWords } from '../../src/renderer/technical-layer.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isArrowFunction, isCallExpression, isFunctionDeclaration, isNoSubstitutionTemplateLiteral, isStringLiteral, isVariableDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { miniDocument } from '../support/mini-dom.js';
import { TASK_DRAWER_TITLE } from '../../src/renderer/task-drawer-labels.js';
import { analysisRefusalView, overviewAnalysisRefusalView } from '../../src/renderer/overview-refusal-labels.js';
import { NavigationGeneration } from '../../src/renderer/navigation-generation.js';

const RENDERER = readFileSync(fileURLToPath(new URL('../../src/renderer/index.ts', import.meta.url)), 'utf8');

// Execute the actual refusal handlers and navigation helpers with the existing renderer mini-DOM pattern
// (imported-exemplars.test.ts). Source matching alone cannot establish what the editor sees or a click does.
const parsed = createSourceFile('renderer.ts', RENDERER + readFileSync(new URL('../../src/renderer/book-overview-screen.ts', import.meta.url), 'utf8'), ScriptTarget.ES2022, true);
const helpers = new Map<string, string>();
const refusals: string[] = [];
const taskInspections: string[] = [];
function extract(node: Node): void {
  if (isFunctionDeclaration(node) && node.name !== undefined && [
    'element', 'button', 'rendererErrorData', 'rendererErrorCode', 'rendererErrorMessage',
  ].includes(node.name.text)) helpers.set(node.name.text, node.getText(parsed));
  if (isArrowFunction(node) && node.parameters[0]?.name.getText(parsed) === 'error' &&
      /(?:analysisRefusalView|overviewAnalysisRefusalView)/u.test(node.body.getText(parsed))) refusals.push(node.getText(parsed));
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
  const navigation = new NavigationGeneration();
  const api = surface === 'task' ? { getModelServiceSettings, inspectTaskAuthorization } : new Proxy({}, { get: serviceRead });
  const context = createContext({ identityWords, api, navigation, page: navigation.read(host as unknown as HTMLElement),
    document: miniDocument, screen: miniDocument.body, performance,
    window: { setTimeout, ai7: api },
    host, taskHost: host, analysisHost: host, analysisState: host, first: true,
    state: { modelSettings: navigate },
    bookId: 'book-1', bookTitle: '测试图书', overview: { book: { bookId: 'book-1' }, manuscriptState: { state: 'populated' } },
    error: { code, message: '原有拒绝说明。' },
    analysisRefusalView, overviewAnalysisRefusalView, technicalWords: (_service: string, editorial: string) => editorial, TASK_DRAWER_TITLE,
    researchUnavailableLine: (_code: string, message: string) => message,
    openBookSection: navigate,
  });
  const marker = surface === 'overview' ? 'analysisHost' : 'host.replaceChildren';
  const handler = surface === 'task' ? taskInspections : refusals.filter((source) => source.includes(marker));
  expect(handler).toHaveLength(1);
  expect(helpers.size).toBe(5);
  await runInContext(compile([...helpers.values(), `const refuse = ${handler[0]}; refuse(error);`].join('\n')), context);
  return { host, heading, scroll, navigate, serviceRead, inspectTaskAuthorization, getModelServiceSettings };
}

describe('工作概览 refusals (#992)', () => {
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

  it.each(['ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE'])('summarizes %s only on the overview', code => {
    expect(analysisRefusalView(code, '请到设置的模型服务页连接模型。')).toEqual({ text: '请到设置的模型服务页连接模型。', actionLabel: null });
    const tile = overviewAnalysisRefusalView(code, '无法读取');
    expect(tile.actionLabel).toBe('去设置');
    expect(tile.text).toBe(code === 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED' ? '尚未连接模型服务' : '模型服务需要设置，请检查连接。');
  });

  it.each([false, true])('keeps the analysis entry and technical failure text (developer=%s)', async developer => {
    miniDocument.body.replaceChildren();
    const context = createContext({ document: miniDocument, identityWords, analysisRefusalView, overviewAnalysisRefusalView, technicalWords: (service: string, editorial: string) => developer ? service : editorial, researchUnavailableLine: (_code: string, text: string) => text,
      navigation: new NavigationGeneration(), overview: { book: { bookId: 'book-1', title: '图书' } },
      renderBookAnalysis: vi.fn(), rendererErrorCode: () => 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE',
      state: { modelSettings: vi.fn() }, error: { code: 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', message: 'internal' },
    });
    const source = readFileSync(new URL('../../src/renderer/book-overview-screen.ts', import.meta.url), 'utf8');
    const init = source.slice(source.indexOf("  const analysisHost ="), source.indexOf('  const inspectBaselineAnalysis ='));
    runInContext(compile([...helpers.values(), init, 'document.body.append(analysisHost);',
      'const page = navigation.read(analysisHost);', `(${refusals.find(text => text.includes('analysisHost'))})(error);`].join('\n')), context);
    expect(miniDocument.body.textContent).toContain('打开分析');
    expect(miniDocument.body.textContent).toContain(developer ? 'internal' : '模型服务需要设置');
    expect(miniDocument.body.textContent).toContain('去设置');
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

  it.each(['ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE'])('the 分析 page keeps its service sentence for %s while the overview tile offers 去设置', async code => {
    const page = await refusalHarness('analysis', code);
    expect(page.host.textContent).toContain('原有拒绝说明。');
    expect(page.host.textContent).not.toContain('尚未连接模型服务');
    expect(page.host.querySelector('button')).toBeNull();
    const tile = await refusalHarness('overview', code);
    expect(tile.host.textContent).not.toContain('原有拒绝说明。');
    expect(tile.host.textContent).toContain('去设置');
  });

  it.each(['overview', 'analysis'] as const)('keeps other refusal text without a next-step button on %s', async (surface) => {
    const { host, navigate, serviceRead } = await refusalHarness(surface, 'ANALYSIS_LINEAGE_UNAVAILABLE');
    expect(host.textContent).toContain(surface === 'overview' ? '暂时无法读取分析状态，请打开分析重试。' : '原有拒绝说明。');
    expect(host.querySelector('button')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(serviceRead).not.toHaveBeenCalled();
  });
});

it.each([false, true])('places only nonempty first-import actions directly below the empty Book title (actions=%s)', hasActions => {
  miniDocument.body.replaceChildren();
  const content = miniDocument.createElement('section'), title = miniDocument.createElement('h2');
  const lede = miniDocument.createElement('p'), actions = miniDocument.createElement('div');
  content.append(title, lede);
  if (hasActions) { const button = miniDocument.createElement('button'); button.textContent = '导入首份稿件'; actions.append(button); }
  const source = readFileSync(new URL('../../src/renderer/book-overview-screen.ts', import.meta.url), 'utf8');
  const start = source.indexOf("  if (overview.manuscriptState.state === 'empty')");
  const layout = source.slice(start, source.indexOf('  appendRecoveryReturnAction(content', start));
  runInContext(compile(layout), createContext({ content, actions, overview: { manuscriptState: { state: 'empty' } } }));
  expect(content.children[1]).toBe(hasActions ? actions : lede);
  if (hasActions) expect(actions.textContent).toBe('导入首份稿件');
});
