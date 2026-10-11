import { afterEach, describe, expect, it } from 'vitest';
import { reviewMaterialsField, syncReviewMaterials } from '../../src/renderer/review-workspace.js';
import type { WritingTaskMaterialProjection } from '../../src/shared/protocol.js';

// The 允许参考 fieldset of 新建审阅 (Issue #428, #782 item 5), run through the real renderer functions on a small DOM stub: no
// Electron and no new dependency. Which choices are on offer, what ticking one does, and why a choice is off.

class Node {
  children: Node[] = [];
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners = new Map<string, () => void>();
  className = '';
  textContent = '';
  id = '';
  type = '';
  checked = false;
  disabled = false;
  hidden = false;
  constructor(readonly tag: string) {}
  append(...nodes: Node[]): void { this.children.push(...nodes); }
  setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  addEventListener(key: string, listener: () => void): void { this.listeners.set(key, listener); }
  all(): Node[] { return [this, ...this.children.flatMap((node) => node.all())]; }
}

const globals = globalThis as unknown as { document?: unknown };
const original = globals.document;
afterEach(() => { globals.document = original; });

const item = (materialId: string, characters = 10): WritingTaskMaterialProjection => ({ materialId, title: `资料${materialId}`, characters, scope: 'book', selectable: true, reason: null });
const OFFERS = (items: WritingTaskMaterialProjection[], more = 0) => ({ statement: '可以勾选资料库里这本书允许参考的资料', items, more });

function mount(items: WritingTaskMaterialProjection[], more = 0) {
  globals.document = { createElement: (tag: string) => new Node(tag) };
  const state = { materialIds: new Set<string>(), categories: new Set<string>(), problem: null as string | null };
  let sheets = 0;
  const built = reviewMaterialsField(OFFERS(items, more), state, () => { sheets += 1; });
  const field = built.field as unknown as Node;
  const box = (id: string) => field.all().find((node) => node.dataset['reviewMaterial'] === id)!;
  const reasonOf = (id: string) => field.all().find((node) => node.id === box(id).attributes['aria-describedby'])!;
  const sync = (offers: WritingTaskMaterialProjection[], categories: string[]) => {
    state.categories = new Set(categories);
    return syncReviewMaterials(built.inputs, offers, state, [
      { categoryId: 'typos-and-usage', materialReferencesAllowed: true },
      { categoryId: 'factual-review', materialReferencesAllowed: false },
    ], false);
  };
  return { state, field, box, reasonOf, sync, sheets: () => sheets };
}

describe('the 允许参考 fieldset of 新建审阅', () => {
  it('lists one choice per offered item under its legend and statement, with the unread-categories note', () => {
    const view = mount([item('a', 1_234), item('b')], 3);
    expect(view.field.tag).toBe('fieldset');
    const texts = view.field.all().map((node) => node.textContent);
    expect(texts).toContain('允许参考 · 资料库');
    expect(texts).toContain('可以勾选资料库里这本书允许参考的资料');
    expect(texts).toContain('《资料a》 · 这本书 · 已提取 1,234 字');
    expect(texts).toContain('还有 3 份资料未列出；这里显示最近到来的 50 份。');
    expect(texts).toContain('资料只供调用模型的审阅类别参考；事实核查与只读已有线索的类别不参考这些资料。');
    expect(view.field.all().filter((node) => node.type === 'checkbox')).toHaveLength(2);
  });

  it('says there is nothing to reference when nothing is offered', () => {
    globals.document = { createElement: (tag: string) => new Node(tag) };
    const state = { materialIds: new Set<string>(), problem: null };
    const built = reviewMaterialsField(undefined, state, () => undefined);
    expect(built.inputs).toEqual([]);
    expect((built.field as unknown as Node).all().map((node) => node.textContent)).toContain('暂无可参考的资料库资料。');
  });

  it('ticks and unticks into the sheet state, clears a standing problem and refreshes the sheet', () => {
    const view = mount([item('a'), item('b')]);
    view.state.problem = '旧的问题';
    const a = view.box('a');
    a.checked = true;
    a.listeners.get('change')!();
    expect([...view.state.materialIds]).toEqual(['a']);
    expect(view.state.problem).toBeNull();
    expect(view.sheets()).toBe(1);
    a.checked = false;
    a.listeners.get('change')!();
    expect(view.state.materialIds.size).toBe(0);
    expect(view.sheets()).toBe(2);
  });

  it('keeps every choice off, with the reason beside it, until a model-calling category is selected', () => {
    const offers = [item('a'), item('b')];
    const view = mount(offers);
    expect(view.sync(offers, ['factual-review'])).toBe(false);
    expect(view.box('a').disabled).toBe(true);
    expect(view.reasonOf('a').textContent).toBe('请先选择调用模型的审阅类别；事实核查与只读已有线索的类别不参考资料库。');
    expect(view.reasonOf('a').hidden).toBe(false);
    expect(view.sync(offers, ['factual-review', 'typos-and-usage'])).toBe(true);
    expect(view.box('a').disabled).toBe(false);
    expect(view.reasonOf('a').hidden).toBe(true);
  });

  it('drops a tick whose item is no longer offered or selectable, and names why', () => {
    const offers = [item('a'), item('b'), item('c')];
    const view = mount(offers);
    view.sync(offers, ['typos-and-usage']);
    for (const id of ['a', 'b']) view.state.materialIds.add(id);
    view.sync([item('a'), { ...item('b'), selectable: false, reason: '稍后决定' }], ['typos-and-usage']);
    expect([...view.state.materialIds]).toEqual(['a']);
    expect(view.box('a').checked).toBe(true);
    expect(view.box('b').checked).toBe(false);
    expect(view.box('b').disabled).toBe(true);
    expect(view.reasonOf('b').textContent).toBe('稍后决定');
    expect(view.reasonOf('c').textContent).toBe('这份资料现在不在可参考的清单中。');
  });

  it('stops a fifth item and a total past 6,000 characters, leaving the ticked ones free to untick', () => {
    const offers = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id));
    const view = mount(offers);
    for (const id of ['a', 'b', 'c', 'd']) view.state.materialIds.add(id);
    view.sync(offers, ['typos-and-usage']);
    expect(view.box('e').disabled).toBe(true);
    expect(view.reasonOf('e').textContent).toBe('最多参考 4 份资料；可以先去掉一份。');
    expect(view.box('a').disabled).toBe(false);
    const big = [item('a', 3_000), item('b', 2_999), item('c', 10)];
    const roomy = mount(big);
    for (const id of ['a', 'b']) roomy.state.materialIds.add(id);
    roomy.sync(big, ['typos-and-usage']);
    expect(roomy.box('c').disabled).toBe(true);
    expect(roomy.reasonOf('c').textContent).toBe('参考资料合计不能超过 6,000 字；可以先去掉一份。');
  });
});
