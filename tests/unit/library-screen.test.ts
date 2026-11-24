import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibraryScreen } from '../../src/renderer/library-screen.js';
import { navigation } from '../../src/renderer/navigation-generation.js';
import { localDayTimeLabel } from '../../src/shared/report-wording.js';
import type { BookSummaryProjection, PriorWorkItemProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); navigation.commit(); });
afterEach(() => { restore(); vi.restoreAllMocks(); });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const book = (bookId: string, lastWorkedAt = '2026-11-01T08:30:00Z'): BookSummaryProjection => ({
  bookId, title: `图书${bookId}`, stableIdentity: `book:${bookId}`, internalNumber: null,
  people: { authors: [], editors: [], related: [] }, lastWorkedAt, seriesNames: [],
  manuscriptState: 'populated', manuscriptStateLabel: '已有主稿件', reimportLineageSourceVersionIds: [], reimportLineageNextCursor: null,
});
const prior = (summary: BookSummaryProjection): PriorWorkItemProjection => ({
  bookId: summary.bookId, bookTitle: summary.title, manuscriptId: `manuscript-${summary.bookId}`, branchId: 'branch', branchName: '主稿件',
  revisionId: 'revision', revisionLabel: '1', journalSequence: 0, workingDigest: 'digest', totalCharacters: 20,
  latestMilestone: null, recoveryAttention: null, library: summary,
});

async function mount(items: BookSummaryProjection[], recent: PriorWorkItemProjection[] = [], apiOverrides: object = {}, nextCursor: { title: string; bookId: string } | null = null) {
  const screen = new MiniElement('main'); miniDocument.body.append(screen);
  const element = (tag: string, className = '', text = '') => {
    const node = new MiniElement(tag); node.className = className; node.textContent = text;
    Object.defineProperty(node, 'childNodes', { get: () => node.children }); return node;
  };
  const button = (label: string, style: string, action: () => void) => {
    const node = element('button', style, label); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const api = { getPreferences: async () => ({ values: { 'onboarding.state': 'skipped' } }), getProductDataLocation: async () => ({}),
    getModelServiceSettings: async () => ({ roles: [] }), inspectGlobalAttention: async () => ({ groups: [] }),
    inspectTaskOverview: async () => ({ groups: [] }), listBooks: vi.fn(async () => ({ items, nextCursor: null })), ...apiOverrides };
  const open = vi.fn(), recover = vi.fn(), status = vi.fn();
  const options = { element, button, api, screen, panel: () => element('section'), setStatus: status,
    rendererErrorMessage: (_error: unknown, fallback: string) => fallback, renderBookCreationForm: vi.fn(),
    bookCardOpen: (title: string, state: string, action: () => void) => button(`${title} · ${state}`, 'book-card-open', action),
    bookCardAction: (words: string) => element('span', 'book-card-action', words), bookIdentityDisclosure: () => element('details'),
    appendRecoveryReturnAction: vi.fn(), requestBookWorkbenchRoute: open, returnToRecoveryComparison: recover,
    replaceScreen: (_state: string, content: MiniElement) => screen.replaceChildren(content),
  } as unknown as Parameters<typeof createLibraryScreen>[0];
  await createLibraryScreen(options).renderLanding(recent, undefined, { items, nextCursor }); await flush();
  const input = screen.querySelector('[id="book-filter-text"]')!;
  const type = (words: string) => { input.value = words; input.dispatchEvent({ type: 'input' }); };
  const ids = () => screen.querySelectorAll('article button[data-book-id]').map(node => node.dataset['bookId']);
  return { screen, input, type, ids, api, open, recover, status };
}

describe('library cards (I-8)', () => {
  it('puts recent work first and deduplicates catalog pages, prior work and recovery branches', async () => {
    const old = book('old'), latest = book('latest', '2026-11-23T08:00:00Z');
    const recovery = { ...prior(latest), recoveryAttention: { attentionId: 'recovery', attentionVersion: 1, status: 'deferred' as const, label: '恢复待确认状态' as const } };
    const view = await mount([old, old], [prior(old), prior(latest), recovery], {
      listBooks: async () => ({ items: [latest, old, book('middle', '2026-11-12T08:00:00Z')], nextCursor: null }),
    }, { title: old.title, bookId: old.bookId });
    expect(view.ids()).toEqual(['latest', 'old']);
    view.screen.querySelector('article button')!.click(); await flush();
    expect(view.recover).toHaveBeenCalledWith('recovery', expect.anything()); expect(view.open).not.toHaveBeenCalled();
    view.screen.querySelectorAll('button').find(node => node.textContent === '加载更多图书')!.click(); await flush();
    expect(view.ids()).toEqual(['latest', 'middle', 'old']);
    expect(view.screen.querySelectorAll('.recent-work-item')).toHaveLength(2);
  });

  it.each(['title', 'author', 'editor', 'series', 'number'])('filters %s immediately without replacing the input or exposing unmatched recent cards', async field => {
    const matching = { ...book('one'), title: '春江', internalNumber: 'CAT-42', people: { authors: ['作者甲'], editors: ['责编乙'], related: [] }, seriesNames: ['山水文丛'] };
    const view = await mount([matching, book('two')], [prior(matching)], { listBooks: () => new Promise(() => undefined) });
    view.input.focus();
    view.type(({ title: '春', author: '作者甲', editor: '责编乙', series: '山水', number: 'cat-42' })[field]!);
    expect(view.ids()).toEqual(['one']); expect(miniDocument.activeElement).toBe(view.input);
    view.type('没有这本'); expect(view.ids()).toEqual([]); expect(view.screen.textContent).toContain('没有找到符合的图书');
    view.type(''); expect(view.ids()).toEqual(['one', 'two']);
    expect(view.screen.querySelector('[id="book-filter-text"]')).toBe(view.input);
  });

  it('loads matches outside the first page, ignores older answers and preserves fallback submit and clear hooks', async () => {
    const first = Promise.withResolvers<{ items: BookSummaryProjection[]; nextCursor: null }>();
    const second = Promise.withResolvers<{ items: BookSummaryProjection[]; nextCursor: null }>();
    const initial = book('initial'); const match = { ...book('remote'), seriesNames: ['山水文丛'] };
    const listBooks = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue({ items: [initial], nextCursor: null });
    const view = await mount([initial], [], { listBooks });
    view.type('旧'); view.screen.querySelector('[id="book-filter-field"]')!.value = 'series'; view.type('山水');
    second.resolve({ items: [match], nextCursor: null }); await flush();
    first.resolve({ items: [book('stale')], nextCursor: null }); await flush();
    expect(view.ids()).toEqual(['remote']); expect(view.screen.querySelector('section.recent-work')!.dataset['bookFilter']).toBe('series');
    view.screen.querySelector('form')!.dispatchEvent({ type: 'submit' }); await flush();
    expect(listBooks).toHaveBeenLastCalledWith({ after: null, filter: { field: 'series', text: '山水' } });
    expect(view.status).toHaveBeenLastCalledWith('已列出找到的图书', 'success');
    view.screen.querySelector('[data-book-filter-action="clear"]')!.click(); await flush();
    expect(view.input.value).toBe(''); expect(view.screen.querySelector('[id="book-filter-text"]')).toBe(view.input);
    expect(view.status).toHaveBeenLastCalledWith('已显示全部图书', 'success');
  });

  it('renders local work time and counts only unique actionable attention, including tasks needing the editor', async () => {
    const summary = book('one');
    const waiting = { itemId: 'pending', book: { bookId: 'one' }, group: 'decisions', state: 'draft-unfinished', target: { kind: 'task' } };
    const resume = { ...waiting, itemId: 'resume', group: 'active', state: 'analysis-resumable' };
    const running = { ...resume, itemId: 'running', state: 'analysis-running' };
    const view = await mount([summary, book('two')], [], {
      inspectGlobalAttention: async () => ({ groups: [{ key: 'decisions', items: [waiting, waiting], total: 2 }, { key: 'active', items: [running], total: 1 }] }),
      inspectTaskOverview: async () => ({ groups: [{ key: 'running', items: [{ attention: resume }, { attention: running }] }] }),
    });
    const cards = view.screen.querySelectorAll('article');
    expect(cards[0]!.textContent).toContain(`上次工作：${localDayTimeLabel(summary.lastWorkedAt!)} · 2 项待处理`);
    expect(cards[1]!.textContent).toContain('暂无待处理');
    expect(view.screen.textContent).not.toContain(summary.lastWorkedAt!);
  });

  it('keeps each card in place while its words are refreshed, so a press that is down on it still opens the Book', async () => {
    const first = book('first', '2026-11-23T08:00:00Z'), second = book('second', '2026-11-12T08:00:00Z');
    let answerAttention!: (value: { groups: [] }) => void;
    let answerBooks!: (value: { items: BookSummaryProjection[]; nextCursor: null }) => void;
    const view = await mount([first, second], [prior(first)], {
      inspectGlobalAttention: () => new Promise((resolve) => { answerAttention = resolve; }),
      listBooks: () => new Promise((resolve) => { answerBooks = resolve; }),
    });
    const cards = () => view.screen.querySelectorAll('article button[data-book-id]');
    const [pressed, other] = cards();
    expect(view.screen.textContent).toContain('正在读取待处理数…');
    // The pending counts arrive after the page is on screen: the cards are the same nodes, only their words changed.
    answerAttention({ groups: [] }); await flush();
    expect(view.screen.textContent).not.toContain('正在读取待处理数…');
    expect(view.screen.querySelectorAll('.book-card-facts').map(line => line.textContent)).toEqual([
      `上次工作：${localDayTimeLabel(first.lastWorkedAt!)} · 暂无待处理`, `上次工作：${localDayTimeLabel(second.lastWorkedAt!)} · 暂无待处理`]);
    expect(cards()[0] === pressed && cards()[1] === other).toBe(true);
    // A filter keeps the matching card while it narrows the list, and the service's answer keeps it again.
    view.type('first');
    expect(cards()).toHaveLength(1); expect(cards()[0] === pressed).toBe(true);
    answerBooks({ items: [first], nextCursor: null }); await flush();
    expect(cards()[0] === pressed).toBe(true);
    // Cleared: the other Book's own card comes back, in order, and the pressed card never left.
    view.type('');
    expect(cards()[0] === pressed && cards()[1] === other).toBe(true);
    // A Book whose record changed is drawn again from the new record; the others keep their cards.
    answerBooks({ items: [{ ...second, title: '改名后的图书' }, first], nextCursor: null }); await flush();
    expect(cards()[0] === pressed).toBe(true);
    expect(cards()[1] === other).toBe(false);
    expect(cards()[1]!.textContent).toContain('改名后的图书');
    pressed!.click(); await flush();
    expect(view.open).toHaveBeenCalledWith({ kind: 'book', bookId: 'first' }, undefined, undefined, expect.anything());
  });

  it('keeps navigation and card facts honest when reads fail or finish after leaving', async () => {
    const answer = Promise.withResolvers<{ items: BookSummaryProjection[]; nextCursor: null }>();
    const view = await mount([book('one', 'invalid')], [], {
      inspectGlobalAttention: async () => { throw new Error('unavailable'); }, listBooks: () => answer.promise,
    });
    expect(view.screen.textContent).toContain('上次工作：暂无记录 · 待处理数暂不可用');
    view.type('remote'); navigation.begin(); view.screen.replaceChildren('另一页'); view.status.mockClear();
    answer.resolve({ items: [book('remote')], nextCursor: null }); await flush();
    expect(view.screen.textContent).toBe('另一页'); expect(view.status).not.toHaveBeenCalled();
  });
});
