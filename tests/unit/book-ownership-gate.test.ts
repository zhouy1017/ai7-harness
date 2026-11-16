import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { IPC_CHANNELS, type RendererApi } from '../../src/shared/protocol.js';
import { NavigationGeneration, reconcileBookWorkbenchApi } from '../../src/renderer/navigation-generation.js';

// Derive the obligation from main's handlers, rather than a second list of API names.
const guards = new Set(['requireCurrentBookRoute', 'requireManuscriptCapability', 'requireEditorResource']);
const main = new URL('../../src/main/', import.meta.url);
const files = readdirSync(main, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts'))
  .map((name) => fileURLToPath(new URL(name, main)));
const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2023, skipLibCheck: true });
const checker = program.getTypeChecker();
function callsBookGuard(node: ts.Node, seen = new Set<ts.Declaration>()): boolean {
  if (ts.isCallExpression(node)) {
    const name = ts.isIdentifier(node.expression) ? node.expression.text
      : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
    if (guards.has(name)) return true;
    if (ts.isIdentifier(node.expression)) {
      for (const declaration of checker.getSymbolAtLocation(node.expression)?.declarations ?? []) {
        if (seen.has(declaration)) continue;
        seen.add(declaration);
        const body = ts.isFunctionDeclaration(declaration) ? declaration.body
          : ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
        if (body && callsBookGuard(body, seen)) return true;
      }
    }
  }
  return ts.forEachChild(node, (child) => callsBookGuard(child, seen)) === true;
}
const operations = new Set<keyof RendererApi>();
const channelNames = new Map<string,string>(Object.entries(IPC_CHANNELS).map(([name, channel]) => [channel, name]));
for (const file of files) {
  const source = program.getSourceFile(file)!;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'ipcMain.handle') {
      const [channel, handler] = node.arguments;
      if (channel && handler && callsBookGuard(handler)) {
        const type = checker.getTypeAtLocation(channel);
        for (const candidate of type.isUnion() ? type.types : [type]) {
          const name = candidate.isStringLiteral() ? channelNames.get(candidate.value) : undefined;
          if (name === undefined) throw new Error(`Book handler has an unbounded channel: ${channel.getText(source)}`);
          operations.add(name as keyof RendererApi);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

it('gates every operation whose main handler requires the window Book', async () => {
  expect(operations.size).toBeGreaterThan(0);
  const answer = Promise.withResolvers<void>();
  const calls = new Map([...operations].map((name) => [name, vi.fn(async () => undefined)]));
  const raw = { ...Object.fromEntries(calls), leaveBookWorkbench: () => answer.promise };
  const api = reconcileBookWorkbenchApi(raw as unknown as RendererApi, {
    bookOnScreen: () => null, left: vi.fn(), failed: vi.fn(),
  }, new NavigationGeneration());
  const leave = api.leaveBookWorkbench();
  const waiting = [...operations].map((name) => {
    const invoke = api[name] as (input: unknown) => Promise<unknown>;
    return invoke({});
  });
  const bypassed = [...calls].filter(([, call]) => call.mock.calls.length > 0).map(([name]) => name);
  answer.resolve();
  await Promise.all([leave, ...waiting]);
  expect(bypassed, 'main Book operations bypassing the ownership gate').toEqual([]);
  for (const [name, call] of calls) expect(call, `${name} stays blocked after reconciliation`).toHaveBeenCalledOnce();
});
