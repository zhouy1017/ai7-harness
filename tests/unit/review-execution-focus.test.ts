import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isFunctionDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { expect, it } from 'vitest';

const source = createSourceFile('review-workspace.ts', readFileSync('src/renderer/review-workspace.ts', 'utf8'), ScriptTarget.ES2022, true);
let update = '';
function visit(node: Node): void {
  if (isFunctionDeclaration(node) && node.name?.text === 'updateExecutionChoice') update = node.getText(source);
  forEachChild(node, visit);
}
visit(source);
if (update === '') throw new Error('Review execution choice handler missing');
const implementation = transpileModule(update, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;

it('restores review choice focus after its native popover has reopened', async () => {
  const body = {};
  let active: object = body, popoverOpen = true;
  class Control { focus(): void { if (popoverOpen) active = this; } }
  const control = new Control(); active = control;
  const state = { chooser: { element: { contains: (node: object) => node === control } } };
  const context = createContext({ sheetState: state, destroyed: false, HTMLElement: Control, queueMicrotask,
    document: { body, get activeElement() { return active; } }, api: { inspectReviewWorkspace: async () => ({}) },
    query: {}, sheetUpdate: () => {}, projection: null,
    renderSheet: () => {
      // Reattaching the chooser hides its popover; renderSheet queues refreshPanel before focus can be restored.
      popoverOpen = false; active = body;
      queueMicrotask(() => { popoverOpen = true; });
    },
  });
  runInContext(implementation, context);
  context['state'] = state;
  await runInContext('updateExecutionChoice(state, {})', context);
  expect(active).toBe(control);
});
