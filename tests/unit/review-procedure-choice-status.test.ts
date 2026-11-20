import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isFunctionDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { expect, it, vi } from 'vitest';
import { createStatusSurface, reportResult } from '../../src/renderer/notifications.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

// The real procedure-choice handler of the 新建审阅 sheet, its leaf readers stubbed, as review-launch-notice does (#1519).
const parsed = createSourceFile('review-workspace.ts', readFileSync(new URL('../../src/renderer/review-workspace.ts', import.meta.url), 'utf8'), ScriptTarget.ES2022, true);
let handler = '';
function visit(node: Node): void {
  if (isFunctionDeclaration(node) && node.name?.text === 'chooseProcedure') handler = node.getText(parsed);
  forEachChild(node, visit);
}
visit(parsed);
if (handler === '') throw new Error('Procedure choice handler missing');
const implementation = transpileModule(handler, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;

it('a procedure choice answered after a newer error leaves that error standing (#1519)', async () => {
  const restore = installMiniDom();
  try {
    const surface = miniDocument.createElement('div');
    miniDocument.body.append(surface);
    const setStatus = createStatusSurface(surface as unknown as HTMLElement);
    let answer: (run: unknown) => void = () => undefined;
    const state = { requests: { ask: () => 1, current: () => true }, procedure: null, seriesId: null };
    const context = createContext({
      state, projection: {}, sheetState: state, destroyed: false, sheetUpdate: vi.fn(), renderSheet: vi.fn(), sheet: { querySelector: () => null },
      api: { inspectCapturedProcedureRun: () => new Promise((resolve) => { answer = resolve; }) },
      options: { setStatus, errorMessage: (_error: unknown, fallback: string) => fallback },
      settleProcedureChoice: () => ({ status: '已读取《书系复核》第 1 版：要运行的类别由你勾选。', focus: 'procedure' }),
      reportResult,
    });
    runInContext(implementation, context);
    const choosing = runInContext("chooseProcedure(state, 'procedure-1')", context) as Promise<void>;
    setStatus('无法保存审阅偏好。', 'error');
    answer({});
    await choosing;
    expect(surface.hidden).toBe(false);
    expect(surface.dataset['tone']).toBe('error');
    expect(surface.textContent).toBe('无法保存审阅偏好。');
    expect(miniDocument.body.querySelector('[data-toast]')!.textContent).toBe('已读取《书系复核》第 1 版：要运行的类别由你勾选。');
  } finally { restore(); }
});
