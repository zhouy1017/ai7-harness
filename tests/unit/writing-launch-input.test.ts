import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isFunctionDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { expect, it, vi } from 'vitest';
import type { TaskLaunchRequest } from '../../src/renderer/task-drawer.js';

const source = createSourceFile('writing-task.ts', readFileSync(new URL('../../src/renderer/writing-task.ts', import.meta.url), 'utf8'), ScriptTarget.ES2022, true);
let prepare = '';
function visit(node: Node): void {
  if (isFunctionDeclaration(node) && node.name?.text === 'prepare') prepare = node.getText(source);
  forEachChild(node, visit);
}
visit(source);
if (prepare === '') throw new Error('Writing start handler missing');
const implementation = transpileModule(prepare, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;

it('keeps the writing sheet until launch succeeds and reads edits made after a refusal', async () => {
  const sheet = { typeId: 'promotion-article', title: '文档', audience: '读者', channel: '书店', requirements: '保留原意', materialIds: new Set<string>() };
  const openLaunch = vi.fn((_request: TaskLaunchRequest) => undefined), paint = vi.fn();
  const context = createContext({ busy: false, sheet, projection: { bookId: 'book' }, GRAPHEMES: new Intl.Segmenter('zh', { granularity: 'grapheme' }),
    WRITING_FIELD_MOST: { audience: 1000, channel: 1000, requirements: 1000 }, rememberedTitles: new Map(), titleKey: (book: string, type: string) => `${book}/${type}`,
    paint, options: { openLaunch }, awaitDraft: vi.fn() });
  runInContext(implementation, context); await runInContext('prepare(null)', context);
  expect(context['sheet']).toBe(sheet); expect(paint).not.toHaveBeenCalled();
  const launch = openLaunch.mock.calls[0]![0];
  expect(launch.operation).toBe('launchWritingTask');
  // A refused service call never invokes onStarted; the editor's original form and its fields remain.
  sheet.audience = '编辑'; sheet.channel = '新书会'; sheet.requirements = '保留引文'; sheet.title = '修订文档';
  expect(launch.readInput!()).toMatchObject({ audience: '编辑', channel: '新书会', requirements: '保留引文' });
  launch.onStarted!();
  expect(context['sheet']).toBeNull(); expect(paint).toHaveBeenCalledOnce();
});
