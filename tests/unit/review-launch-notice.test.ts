import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isFunctionDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { expect, it, vi } from 'vitest';
import { preferenceDefaults } from '../../src/shared/preferences.js';

// Use the real sheet start handler with leaf plan/DOM readers stubbed, as task-drawer-completion does.
const parsed = createSourceFile('review-workspace.ts', readFileSync(new URL('../../src/renderer/review-workspace.ts', import.meta.url), 'utf8'), ScriptTarget.ES2022, true);
let handler = '';
function visit(node: Node): void {
  if (isFunctionDeclaration(node) && node.name?.text === 'startOrEstimateRun') handler = node.getText(parsed);
  forEachChild(node, visit);
}
visit(parsed);
if (handler === '') throw new Error('Review launch handler missing');
const implementation = transpileModule(handler, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;

it('keeps a review remembered-choice fallback notice visible after the launch succeeds', async () => {
  const notice = '上次选择的模型已不可用，本次已使用角色默认模型。';
  const remembered = { modelConnectionId: 'previous-connection', modelId: 'previous-model', reasoningEffort: 'high' };
  const preferences = { ...preferenceDefaults(), 'model.dispatchChoices': { 'review-run': remembered } };
  const setStatus = vi.fn(), launchReviewRun = vi.fn(async (_input: unknown) => ({ run: { reviewRunId: 'run' }, launchNotice: notice }));
  const state = { executionConfig: preferences['model.dispatchChoices']['review-run'], rememberedChoice: true, requests: { loading: false },
    scope: 'whole', seriesId: null, materialIds: new Set() };
  const context = createContext({ state, destroyed: false, projection: { scopeOptions: { selection: { unavailableReason: null } }, connectivity: 'online' },
    procedurePreparationPin: () => ({ refusal: null, pin: null }), sheetPreparationReason: () => null,
    reviewSheetRequest: () => ({ categoryIds: ['typos-and-usage'], scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null },
      preparation: {}, launch: { categoryIds: ['typos-and-usage'], scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } } }),
    rememberActionDefaults: async () => undefined, rememberEvidenceAssuranceLevel: async () => undefined, sheetUpdate: vi.fn(), api: { launchReviewRun },
    options: { setStatus, recorded: vi.fn() }, crypto, REVIEW_STATUS_LINES: { launching: '正在启动审阅', started: '已开始审阅' },
    NO_FILTERS: {}, query: {}, ui: {}, sheet: { open: false }, generation: 0, clearFactual: vi.fn(), stableKey: '', host: { isConnected: false },
  });
  runInContext(implementation, context);
  await runInContext("startOrEstimateRun(state, 'start')", context);
  expect(launchReviewRun.mock.calls[0]![0]).toMatchObject({ rememberedChoice: true, executionConfig: remembered });
  expect(setStatus).toHaveBeenLastCalledWith(notice, 'success');
  expect(preferences['model.dispatchChoices']['review-run']).toEqual(remembered);
});
