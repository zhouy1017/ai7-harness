import { afterEach, describe, expect, it } from 'vitest';
import { reviewPlanReferences, reviewPlanReferenceField } from '../../src/renderer/task-material-selection.js';
import type { WritingTaskMaterialProjection } from '../../src/shared/protocol.js';

class Node {
  children: Node[] = [];
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners = new Map<string, () => void>();
  isConnected = true;
  className = ''; textContent = ''; checked = false; disabled = false; type = ''; title = '';
  classList = { add: (..._names: string[]) => undefined };
  constructor(readonly tag: string) {}
  append(...nodes: Node[]): void { this.children.push(...nodes); }
  setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  addEventListener(key: string, listener: () => void): void { this.listeners.set(key, listener); }
  all(): Node[] { return [this, ...this.children.flatMap((node) => node.all())]; }
}
const globals = globalThis as unknown as { document?: unknown; window?: unknown };
const original = { document: globals.document, window: globals.window };
afterEach(() => { Object.assign(globals, original); });
const item = (materialId: string, characters = 10): WritingTaskMaterialProjection => ({ materialId, title: `资料${materialId}`, characters, scope: 'book', selectable: true, reason: null });
function mount(items: WritingTaskMaterialProjection[], selected = new Set<string>()) {
  globals.document = { createElement: (tag: string) => new Node(tag), createTextNode: (text: string) => Object.assign(new Node('#text'), { textContent: text }) };
  globals.window = { getSelection: () => null };
  const changes: Set<string>[] = [];
  const field = reviewPlanReferences({ api: { searchReferableMaterials: async () => ({ candidates: [] }) as never },
    bookId: 'book', items, selected, change: (next) => changes.push(next) }) as unknown as Node;
  return { field, changes, box: (id: string) => field.all().find((node) => node.dataset['reviewMaterial'] === id)! };
}
describe('review references in full-plan segment 2', () => {
  it('keeps frozen reference statements beside the editable material selector in a prepared plan', async () => {
    mount([]);
    const reference = ['本社审阅偏好', '资料库索引', '书系知识条目', '本地检查选项'];
    const api = {
      inspectReviewWorkspace: async () => ({ run: { referenceInput: { categoryIds: ['typos'], materialIds: ['a'] } },
        categories: [{ categoryId: 'typos', materialReferencesAllowed: true }], materials: { items: [item('a')] } }),
      inspectBookSeries: async () => ({ memberships: [] }), searchReferableMaterials: async () => ({ candidates: [] }),
    } as unknown as Parameters<typeof reviewPlanReferenceField>[0]['api'];
    const field = reviewPlanReferenceField({ api, bookId: 'book', reviewRunId: 'run', reference,
      awaitJob: async (job) => job, change: () => undefined }) as unknown as Node;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    const texts = field.all().map((node) => node.textContent);
    for (const statement of reference) expect(texts).toContain(statement);
    expect(texts).toContain('资料a ×'); expect(texts).toContain('+ 添加参考…');
  });
  it('shows selected chips and optional local discovery under 添加参考', () => {
    const { field } = mount([item('a'), item('b')], new Set(['a']));
    const texts = field.all().map((node) => node.textContent);
    expect(texts).toContain('资料a ×');
    expect(texts).toContain('+ 添加参考…');
    expect(texts).toContain('相似段落检索');
    expect(field.dataset['reviewPlanReferences']).toBe('');
  });
  it('selects or removes a reference through the plan owner without mutating its current selection', () => {
    const selected = new Set(['a']); const view = mount([item('a'), item('b')], selected);
    const box = view.box('b'); box.checked = true; box.listeners.get('change')!();
    expect([...view.changes[0]!]).toEqual(['a', 'b']);
    view.field.all().find((node) => node.textContent === '资料a ×')!.listeners.get('click')!();
    expect([...view.changes[1]!]).toEqual([]);
    expect([...selected]).toEqual(['a']);
  });
  it('keeps unselectable and over-bound items unavailable while selected chips can be removed', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id));
    const view = mount([...items, { ...item('x'), selectable: false, reason: '尚不可参考' }], new Set(['a', 'b', 'c', 'd']));
    expect(view.box('e').disabled).toBe(true);
    expect(view.box('a').disabled).toBe(false);
    expect(view.box('x').disabled).toBe(true);
    const big = mount([item('a', 5999), item('b', 2)], new Set(['a']));
    expect(big.box('b').disabled).toBe(true);
  });
});
