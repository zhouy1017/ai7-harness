import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { mountTaskOverview } from '../../src/renderer/tasks-overview.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { composeTaskOverview } from '../../src/service/task-overview.js';
import type { GlobalAttentionItemProjection, RendererApi } from '../../src/shared/protocol.js';

const remembered = vi.hoisted(() => ({ taskBooks: [] as string[] }));
vi.mock('../../src/renderer/action-defaults.js', () => ({
  readActionDefaults: async () => ({ taskBooks: remembered.taskBooks, taskProcedure: 'baseline-analysis' }),
  rememberActionDefaults: async () => undefined,
}));

const BOOKS = ['甲', '乙', '丙'].map((title, index) => ({ bookId: `book-${index}`, title }));
const running = (id: string, book = BOOKS[0]!): GlobalAttentionItemProjection => ({
  itemId: id, group: 'active', state: 'analysis-running', blocked: false, at: new Date().toISOString(), book: { bookId: book.bookId, title: book.title },
  object: { kind: 'analysis', mode: 'first-baseline' }, facts: { progress: null, categories: [], revisionOrdinal: null }, nextStep: 'view-run',
  target: { kind: 'analysis', bookId: book.bookId, taskIntentId: id }, technical: [{ key: 'run-record', label: '运行', value: id }] });

let uninstall = (): void => undefined;
let surface: { destroy(): void } | null = null;
// The mini DOM has no select options: a stand-in is enough for the lists these tests read.
const miniSelect = MiniElement.prototype as unknown as { add?: (option: MiniElement) => void };
beforeEach(() => {
  uninstall = installMiniDom(); setTechnicalLayerVisible(false); remembered.taskBooks = [];
  miniSelect.add = function add(this: MiniElement, option: MiniElement) { this.append(option as never); };
  vi.stubGlobal('Option', class { constructor(text: string, value: string) { const option = document.createElement('option'); option.textContent = text; option.value = value; return option as never; } });
  vi.stubGlobal('HTMLSelectElement', class {});
});
afterEach(() => { surface?.destroy(); surface = null; delete miniSelect.add; vi.unstubAllGlobals(); uninstall(); });

async function mount(items: GlobalAttentionItemProjection[], books = BOOKS, saved: Record<string, string> = {}) {
  vi.stubGlobal('window', { setInterval: () => 0, clearInterval: () => undefined, setTimeout: () => 0, clearTimeout: () => undefined });
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ type: 'all', time: 'all', ...saved }), setItem: () => undefined });
  const projection = { ...composeTaskOverview({ groups: items.length === 0 ? [] : [{ key: 'active', items, total: items.length }], actionableCount: 0, running: items.length > 0, processing: { state: 'local' } }, 2, () => null), books };
  const root = document.createElement('section'); miniDocument.body.append(root as never);
  surface = mountTaskOverview({ root, api: { inspectTaskOverview: async () => projection, startQuickTasks: vi.fn(async () => ({ results: [] })) } as unknown as RendererApi,
    setStatus: vi.fn(), openTarget: vi.fn(), openBook: vi.fn(), openResult: vi.fn() });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return root as unknown as MiniElement;
}
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const ticked = (root: MiniElement): string[] => root.querySelectorAll('.task-overview-sheet input').filter((input) => input.checked).map((input) => input.value);

describe('发起任务 sheet', () => {
  it('opens with no Book ticked on a page that has none, and counts what is ticked', async () => {
    const root = await mount([]);
    root.querySelector('[data-task-overview-start]')!.click(); await settled();
    expect(root.querySelector('.task-overview-sheet')!.open).toBe(true);
    expect(ticked(root)).toEqual([]);
    expect(root.querySelector('[data-task-overview-enqueue]')!.textContent).toBe('加入队列（0 本）');
    const first = root.querySelectorAll('.task-overview-sheet input')[0]!;
    first.checked = true; first.dispatchEvent({ type: 'change', bubbles: true });
    expect(root.querySelector('[data-task-overview-enqueue]')!.textContent).toBe('加入队列（1 本）');
  });

  it('opens with the Book the page is filtered to, else the Book last used, and only that one', async () => {
    const filtered = await mount([], BOOKS, { book: 'book-1' });
    filtered.querySelector('[data-task-overview-start]')!.click(); await settled();
    expect(ticked(filtered)).toEqual(['book-1']);
    expect(filtered.querySelector('[data-task-overview-enqueue]')!.textContent).toBe('加入队列（1 本）');
    surface?.destroy(); remembered.taskBooks = ['book-2', 'book-0'];
    const last = await mount([], BOOKS, { book: 'all' });
    last.querySelector('[data-task-overview-start]')!.click(); await settled();
    expect(ticked(last)).toEqual(['book-0']);
  });

  it('moves focus in on opening and back to the button on closing', async () => {
    const root = await mount([]);
    const start = root.querySelector('[data-task-overview-start]')!;
    start.focus(); start.click(); await settled(); await settled();
    const sheet = root.querySelector('.task-overview-sheet')!;
    expect(sheet.contains(miniDocument.activeElement as never)).toBe(true);
    sheet.close(); expect(miniDocument.activeElement).toBe(start);
  });
});

describe('任务 page', () => {
  it('is one sentence when there is no task, and draws only the groups that hold one', async () => {
    const empty = await mount([]);
    expect(empty.querySelectorAll('.task-overview-group')).toHaveLength(0);
    expect(empty.querySelector('.task-overview-none')!.textContent).toBe('现在没有任务，可以用上面的「发起任务」开始一项。');
    expect(empty.querySelectorAll('.task-overview-filter-row')).toHaveLength(0);
    surface?.destroy();
    const busy = await mount([running('a')]);
    expect(busy.querySelectorAll('.task-overview-group').map((group) => group.dataset.taskGroup)).toEqual(['running']);
    expect(busy.querySelector('.task-overview-none')).toBeNull();
  });

  it('keeps one button per Book up to six and a list above', async () => {
    const few = await mount([running('a')]);
    expect(few.querySelectorAll('.task-overview-filter-row select')).toHaveLength(0);
    surface?.destroy();
    const many = Array.from({ length: 7 }, (_, index) => ({ bookId: `b${index}`, title: `书${index}` }));
    const lots = await mount([running('a')], many);
    expect(lots.querySelector('.task-overview-filter-row select')).not.toBeNull();
  });

  it('names the Book and the task in the cancel confirmation, and hands focus back to the card on 继续保留 and Escape', async () => {
    const root = await mount([running('a')]);
    const card = root.querySelector('[data-task-item="a"]')!;
    root.querySelector('[data-task-action="cancel"]')!.click();
    const confirm = root.querySelector('.task-overview-confirm')!;
    expect(confirm.hidden).toBe(false);
    expect(confirm.textContent).toContain('《甲》');
    expect(confirm.textContent).toContain(card.querySelector('strong')!.textContent);
    confirm.querySelectorAll('button').find((node) => node.textContent === '继续保留')!.click();
    expect(confirm.hidden).toBe(true);
    expect(miniDocument.activeElement).toBe(card);
    miniDocument.body.append(document.createElement('input') as never);
    (miniDocument.body.querySelector('input') as MiniElement).focus();
    root.querySelector('[data-task-action="cancel"]')!.click();
    root.dispatchEvent({ type: 'keydown', key: 'Escape', target: confirm.querySelector('button')!, bubbles: true, preventDefault() {} } as never);
    expect(confirm.hidden).toBe(true);
    expect(miniDocument.activeElement).toBe(card);
  });
});
