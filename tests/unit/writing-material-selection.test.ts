import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isFunctionDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { describe, expect, it } from 'vitest';
import { writingMaterialLabel, writingMaterialsMore } from '../../src/renderer/writing-task-labels.js';
import { WRITING_MATERIALS_TOO_MANY, writingMaterialsOverTotal } from '../../src/service/writing-tasks.js';
import type { WritingTaskProjection } from '../../src/shared/protocol.js';

// Run the actual renderer's private material controls with a small DOM stub, as task-drawer-completion does.
// This exercises event order, refreshed offers and the visible disabled reasons without opening Electron.
const source = readFileSync(new URL('../../src/renderer/writing-task.ts', import.meta.url), 'utf8');
const parsed = createSourceFile('writing-task.ts', source, ScriptTarget.ES2022, true);
const matches: string[] = [];
function visit(node: Node): void {
  if (isFunctionDeclaration(node) && node.name?.text === 'materialsNode') matches.push(node.getText(parsed));
  forEachChild(node, visit);
}
visit(parsed);
if (matches.length !== 1) throw new Error('Expected one writing material controls function.');
const controls = transpileModule(matches[0]!, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;

type Item = WritingTaskProjection['references']['materials']['items'][number];
const item = (materialId: string, characters = 10): Item => ({ materialId, title: materialId, characters, scope: 'book', selectable: true, reason: null });

class Element {
  children: Element[] = [];
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners = new Map<string, () => void>();
  checked = false;
  disabled = false;
  value = '';
  id = '';
  constructor(readonly tag: string, readonly className = '', readonly text = '') {}
  append(...nodes: Element[]): void { this.children.push(...nodes); }
  setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  addEventListener(key: string, listener: () => void): void { this.listeners.set(key, listener); }
  all(): Element[] { return [this, ...this.children.flatMap((node) => node.all())]; }
}

function harness(items: Item[]) {
  const page = { references: { materials: { statement: '允许参考', items, more: 0 } } };
  const state = { materialIds: [] as string[], problem: null };
  let root: Element;
  let identities = 0;
  let paints = 0;
  const context = createContext({
    busy: false, CSS: { escape: (value: string) => value }, writingMaterialLabel, writingMaterialsMore,
    el: (tag: string, className?: string, text?: string) => new Element(tag, className, text),
    uid: () => `control-${++identities}`,
    paint: () => { paints += 1; draw(); },
    page, state,
  });
  runInContext(controls, context);
  function draw(): void { root = runInContext('materialsNode(page, state)', context) as Element; }
  draw();
  const box = (id: string): Element => root.all().find((node) => node.dataset['writingMaterial'] === id)!;
  return {
    state, box,
    tick(id: string, checked = true): void {
      const control = box(id);
      expect(control.disabled).toBe(false);
      control.checked = checked;
      control.listeners.get('change')!();
    },
    refresh(next: Item[]): void { page.references.materials.items = next; draw(); },
    reason(id: string): string | undefined {
      const described = box(id).attributes['aria-describedby'];
      return root.all().find((node) => node.id === described)?.text;
    },
    paints: () => paints,
  };
}

describe('writing material controls', () => {
  it('submits ticks in offer order and drops absent or no longer selectable items on refresh', () => {
    const view = harness([item('a'), item('b'), item('c')]);
    view.tick('c');
    view.tick('a');
    expect(view.state.materialIds).toEqual(['a', 'c']);
    expect(view.box('a').checked).toBe(true);
    expect(view.paints()).toBe(2);
    view.refresh([item('b'), { ...item('c'), selectable: false, reason: '稍后决定' }]);
    expect(view.state.materialIds).toEqual([]);
    expect(view.box('c').checked).toBe(false);
    expect(view.box('c').disabled).toBe(true);
    expect(view.reason('c')).toBe('稍后决定');
  });

  it('disables a fifth tick with the service wording and enables it again after unticking', () => {
    const view = harness(['a', 'b', 'c', 'd', 'e'].map((id) => item(id)));
    for (const id of ['a', 'b', 'c', 'd']) view.tick(id);
    expect(view.box('e').disabled).toBe(true);
    expect(view.reason('e')).toBe(WRITING_MATERIALS_TOO_MANY);
    expect(view.box('a').disabled).toBe(false);
    view.tick('a', false);
    expect(view.box('e').disabled).toBe(false);
    view.tick('e');
    expect(view.state.materialIds).toEqual(['b', 'c', 'd', 'e']);
  });

  it('admits exactly 6,000 characters and disables exceeding ticks with an accessible reason', () => {
    const view = harness([item('a', 3_000), item('b', 2_999), item('c', 1), item('d', 10)]);
    view.tick('a');
    view.tick('b');
    expect(view.box('c').disabled).toBe(false);
    expect(view.box('d').disabled).toBe(true);
    expect(view.reason('d')).toBe(writingMaterialsOverTotal(6_009));
    view.tick('c');
    expect(view.reason('d')).toBe(writingMaterialsOverTotal(6_010));
    expect(view.box('a').disabled).toBe(false);
    view.tick('a', false);
    expect(view.box('d').disabled).toBe(false);
  });
});
