import { afterEach, describe, expect, it } from 'vitest';
import { evaluationMaterialsField } from '../../src/renderer/evaluation.js';
import type { EvaluationWorkspaceProjection, WritingTaskMaterialProjection } from '../../src/shared/protocol.js';

// The 允许参考 rows of 评估 (Issue #428, #795 item 7), run through the real renderer function on a small DOM stub: no Electron
// and no new dependency. Which choices are on offer, what ticking one does, why a choice is off, and the frozen plan rows.

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

type References = NonNullable<EvaluationWorkspaceProjection['materialReferences']>;
const item = (materialId: string, characters = 10, selectable = true): WritingTaskMaterialProjection =>
  ({ materialId, title: `资料${materialId}`, characters, scope: 'book', selectable, reason: selectable ? null : '这份资料已提取 3,001 字，超过每份 3,000 字的上限，不能列进「允许参考」。' });
const OFFERS = (items: WritingTaskMaterialProjection[], more = 0) => ({ statement: '可以勾选资料库里这本书允许参考的资料', items, more });
const REFERENCES: References = {
  initial: ['资料库资料《资料a》：已提取 10 字，按计划冻结的索引版本读取（只参照，不照抄）'],
  readersReport: ['资料库资料《资料b》：已提取 10 字，按计划冻结的索引版本读取（只参照，不照抄）'],
  blocked: { initial: false, readersReport: false },
};

function mount(items: WritingTaskMaterialProjection[], options: { kind?: 'initial' | 'readersReport'; more?: number; available?: boolean; busy?: boolean; selected?: string[]; references?: References } = {}) {
  globals.document = { createElement: (tag: string) => new Node(tag) };
  const selected = new Set<string>(options.selected ?? []);
  const repaints: string[] = [];
  const field = evaluationMaterialsField({ materials: OFFERS(items, options.more), materialReferences: options.references ?? REFERENCES },
    options.kind ?? 'initial', selected, options.available ?? true, options.busy ?? false, (materialId) => { repaints.push(materialId); }) as unknown as Node;
  const box = (id: string) => field.all().find((node) => node.dataset['evaluationMaterial'] === id)!;
  return { field, selected, repaints, box, texts: () => field.all().map((node) => node.textContent) };
}

describe('the 允许参考 rows of 评估', () => {
  it('lists one choice per offered item under its legend, statement and background note', () => {
    const view = mount([item('a', 1_234), item('b')], { more: 3 });
    expect(view.field.tag).toBe('fieldset');
    expect(view.field.dataset['evaluationMaterials']).toBe('initial');
    expect(view.texts()).toContain('允许参考 · 资料库');
    expect(view.texts()).toContain('可以勾选资料库里这本书允许参考的资料');
    // 初评 has no 定稿 of its own: its row says references never override the 初评's scores, comments and conclusion (Issue #795 item 3).
    expect(view.texts()).toContain('资料只提供背景，不改变本社评估方案，也不覆盖初评的分数、评语与结论。');
    expect(view.texts()).not.toContain('资料只提供背景，不改变本社评估方案，也不覆盖定稿的分数、评语与结论。');
    expect(view.texts()).toContain('《资料a》 · 已提取 1,234 字');
    expect(view.texts()).toContain('另有 3 份资料未列出。');
    expect(view.field.all().filter((node) => node.type === 'checkbox')).toHaveLength(2);
  });

  it('says there is nothing to reference when nothing is offered, and shows no send line', () => {
    globals.document = { createElement: (tag: string) => new Node(tag) };
    const field = evaluationMaterialsField({}, 'readersReport', new Set(), true, false, () => undefined) as unknown as Node;
    expect(field.all().map((node) => node.textContent)).toContain('暂无可参考的资料库资料。');
    expect(field.all().filter((node) => node.type === 'checkbox')).toHaveLength(0);
    expect(field.all().some((node) => node.className.includes('evaluation-material-send'))).toBe(false);
  });

  it('ticks and unticks into the selection and asks the page to repaint that row', () => {
    const view = mount([item('a'), item('b')]);
    const a = view.box('a');
    a.checked = true;
    a.listeners.get('change')!();
    expect([...view.selected]).toEqual(['a']);
    expect(view.repaints).toEqual(['a']);
    a.checked = false;
    a.listeners.get('change')!();
    expect(view.selected.size).toBe(0);
    expect(view.repaints).toEqual(['a', 'a']);
  });

  it('disables every choice while unavailable or busy, and a reason-carrying one unless it is ticked', () => {
    const offers = [item('a'), item('b', 10, false), item('c')];
    const held = mount(offers, { available: false });
    expect(held.box('a').disabled).toBe(true);
    expect(held.box('c').disabled).toBe(true);
    const busy = mount([item('a')], { busy: true });
    expect(busy.box('a').disabled).toBe(true);
    const view = mount(offers);
    expect(view.box('b').disabled).toBe(true);
    expect(view.texts()).toContain(item('b', 10, false).reason);
    const stale = mount(offers, { selected: ['b'] });
    expect([...stale.selected]).toEqual([]);
    expect(stale.box('b').checked).toBe(false);
    expect(stale.box('b').disabled).toBe(true);
  });

  it('stops a fifth item and a total past 6,000 characters, naming only the kept selection in the send line', () => {
    const offers = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id));
    const view = mount(offers, { selected: ['a', 'b', 'c', 'd'] });
    expect(view.box('e').disabled).toBe(true);
    expect(view.texts()).toContain('最多参考 4 份资料；可以先去掉一份。');
    expect(view.box('a').disabled).toBe(false);
    const big = [item('a', 3_000), item('b', 2_999), item('c', 10)];
    const roomy = mount(big, { selected: ['a', 'b', 'c'] });
    expect(roomy.box('c').disabled).toBe(true);
    expect(roomy.texts()).toContain('参考资料合计不能超过 6,000 字；可以先去掉一份。');
    expect([...roomy.selected]).toEqual(['a', 'b']);
    expect(roomy.texts()).toContain('会发送：所选资料库资料《资料a》、《资料b》的提取文字随稿件一并发往，只参照，不照抄；本机确定性运行不发送任何内容。');
  });

  it('keeps only still-offered ticks, and lists this kind\u2019s frozen rows under 这份计划允许参考', () => {
    const view = mount([item('a'), item('b')], { selected: ['a', 'gone'] });
    expect([...view.selected]).toEqual(['a']);
    expect(view.box('a').checked).toBe(true);
    expect(view.texts()).toContain('这份计划允许参考：');
    expect(view.texts()).toContain(REFERENCES!.initial[0]);
    expect(view.texts()).not.toContain(REFERENCES!.readersReport[0]);
    const report = mount([item('a')], { kind: 'readersReport' });
    expect(report.texts()).toContain(REFERENCES!.readersReport[0]);
    expect(report.texts()).not.toContain(REFERENCES!.initial[0]);
    // 审稿意见 drafts from a 定稿 record, so its row keeps the 定稿 wording (Issue #795 item 3).
    expect(report.texts()).toContain('资料只提供背景，不改变本社评估方案，也不覆盖定稿的分数、评语与结论。');
    expect(report.texts()).not.toContain('资料只提供背景，不改变本社评估方案，也不覆盖初评的分数、评语与结论。');
  });
});

describe('a choice that leaves the selection says so (Issue #759)', () => {
  const damaged = { materialId: 'd', title: '资料d', characters: 0, scope: 'book', selectable: false, reason: '索引记录已损坏 · 不可选' } as const;
  it('names a ticked item that is no longer offered, and one now offered as damaged, and lists the damaged one without a size', () => {
    const view = mount([item('a'), damaged], { selected: ['a', 'gone', 'd'] });
    expect([...view.selected]).toEqual(['a']);
    expect(view.texts()).toContain('已选的一份资料已不在可参考的清单中，已从所选中去掉。');
    expect(view.texts()).toContain('《资料d》已从所选中去掉：索引记录已损坏 · 不可选');
    expect(view.texts()).toContain('《资料d》 · 字数未知');
    expect(view.texts()).toContain('索引记录已损坏 · 不可选');
    expect(view.box('d').disabled).toBe(true);
    expect(view.box('d').checked).toBe(false);
  });
  it('stops repeating the removal once the editor changes a tick', () => {
    const view = mount([item('a'), item('b')], { selected: ['a', 'gone'] });
    expect(view.texts()).toContain('已选的一份资料已不在可参考的清单中，已从所选中去掉。');
    const b = view.box('b');
    b.checked = true;
    b.listeners.get('change')!();
    globals.document = { createElement: (tag: string) => new Node(tag) };
    const again = evaluationMaterialsField({ materials: OFFERS([item('a'), item('b')]), materialReferences: REFERENCES }, 'initial', view.selected, true, false, () => undefined) as unknown as Node;
    expect(again.all().map((node) => node.textContent)).not.toContain('已选的一份资料已不在可参考的清单中，已从所选中去掉。');
  });
});
