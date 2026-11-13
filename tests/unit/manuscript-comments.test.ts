import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialCardCache, mountEditorialMarks, stackEditorialComments, pickEditorialComment } from '../../src/renderer/editorial-marks.js';
import { matchesEditorialMarkFilter } from '../../src/renderer/editorial-mark-filter.js';
import type { EditorialMarkAnchorProjection, EditorialMarkCardProjection, ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { collectTechnicalDisclosures, setTechnicalLayerVisible, technicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

const card: EditorialMarkCardProjection = {
  categoryKey: 'editor', categoryLabel: '编辑人工修订', markId: 'comment', kind: 'annotation', status: 'open', anchorState: 'exact', highlightColor: null,
  blockId: 'block', fromGrapheme: 0, toGrapheme: 2, pinnedText: '合成', body: '公开合成批注', replies: [], basis: [],
  source: { kind: 'editor', origin: null, label: null, taskId: null, editorName: '责编' }, suggestion: null,
  convertedFrom: null, resolvedFrom: null, changedElsewhere: false, conflict: null, exportDisposition: 'exported-by-default',
  createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z',
  pin: { revisionId: 'revision', revisionLabel: '1', journalSequence: 0, blockDigest: 'digest' },
};
const anchor = (value = card): EditorialMarkAnchorProjection => ({
  markId: value.markId, kind: value.kind, blockId: value.blockId, fromGrapheme: value.fromGrapheme, toGrapheme: value.toGrapheme,
  anchorState: value.anchorState === 'exact' ? 'exact' : 'drifted', status: value.status, highlightColor: null, sourceKind: value.source.kind,
  sourceOrigin: value.source.origin, sourceLabel: value.source.label, categoryKey: value.categoryKey, categoryLabel: value.categoryLabel,
  disposition: value.suggestion?.decision?.disposition ?? null, deletedText: null, insertedText: null, conflict: null,
});
const windowOf = (): ManuscriptWindowProjection => ({
  bookId: 'book', manuscriptId: 'manuscript', branchId: 'branch', revisionId: 'revision', journalSequence: 0, workingDigest: 'digest',
  blocks: [{ blockId: 'block', kind: 'paragraph', text: '公开合成测试段落', digest: 'digest', position: 1 }], marks: [anchor()], marksTruncated: false,
} as unknown as ManuscriptWindowProjection);
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const suggestion: EditorialMarkCardProjection = { ...card, kind: 'change-suggestion', suggestion: { itemId: 'item', changeType: 'replace', currentText: '合成', proposedText: '改后', rationale: '理由', atomicGroupId: null, decision: null, application: null } };

it('searches original wording, replacement, rationale and category, case-insensitively (#1429)', () => {
  const value = { ...suggestion, suggestion: { ...suggestion.suggestion!, proposedText: 'ABC改后' } };
  const filter = { selectedCategories: new Set<'editor'>(), status: 'all' as const, keyword: '' };
  for (const keyword of ['合成', 'abc', '理由', '编辑人工修订']) {
    expect(matchesEditorialMarkFilter(anchor(value), value, { ...filter, keyword })).toBe(true);
  }
  expect(matchesEditorialMarkFilter(anchor(value), value, { ...filter, keyword: '未匹配的检索' })).toBe(false);
});

it('stacks all five measured cards in anchor order with ten pixel gaps, including offscreen buffers', () => {
  const items = [{ desiredTop: 200, measuredHeight: 90 }, { desiredTop: -190, measuredHeight: 40 },
    { desiredTop: 190, measuredHeight: 120 }, { desiredTop: 200, measuredHeight: 60 }, { desiredTop: 201, measuredHeight: 80 }];
  const placed = stackEditorialComments(items);
  expect(placed.map((item) => item.top)).toEqual([8, 190, 320, 420, 490]);
  expect(items[0]?.desiredTop).toBe(200);
});

it('coalesces pending reads and scroll hits, then refreshes a changed journal and mark projection', async () => {
  const cache = new EditorialCardCache(); const page = windowOf(); cache.sync(page);
  const pending = deferred<EditorialMarkCardProjection>(); const fetch = vi.fn(() => pending.promise);
  const reads = Array.from({ length: 8 }, () => cache.read(card.markId, fetch));
  await Promise.resolve(); expect(fetch).toHaveBeenCalledTimes(1);
  pending.resolve(card); await Promise.all(reads);
  expect(await cache.read(card.markId, fetch)).toBe(card); expect(fetch).toHaveBeenCalledTimes(1);
  cache.sync({ ...page, journalSequence: 1 }); expect(cache.cards.size).toBe(0);
  const fresh = { ...card, body: '最新正文', source: { ...card.source, editorName: '新责编' } };
  expect(await cache.read(card.markId, async () => fresh)).toBe(fresh);
  cache.sync({ ...page, journalSequence: 1, marks: [...page.marks] }); expect(cache.cards.size).toBe(0);
});

it('stacks around the chosen card and clamps it without losing earlier cards (#1451)', () => {
  const items = Array.from({ length: 4 }, (_, i) => ({ desiredTop: 100 + i, measuredHeight: 50 }));
  expect(stackEditorialComments(items, 2).map(item => item.top)).toEqual([-18, 42, 102, 162]);
  expect(stackEditorialComments(items, 2, { top: 0, height: 120 }).map(item => item.top)).toEqual([-50, 10, 70, 130]);
  expect(stackEditorialComments(items, 2, { top: 150, height: 120 }).map(item => item.top)).toEqual([30, 90, 150, 210]);
  expect(stackEditorialComments(items).map(item => item.top)).toEqual([100, 160, 220, 280]);
});

it('picks the shortest range, prefers a start over an end and keeps window-order ties (#1451)', () => {
  const outer = { ...anchor(), markId: 'outer', fromGrapheme: 0, toGrapheme: 10 };
  const inner = { ...outer, markId: 'inner', fromGrapheme: 2, toGrapheme: 4 };
  const next = { ...inner, markId: 'next', fromGrapheme: 4, toGrapheme: 6 };
  const twin = { ...inner, markId: 'twin' };
  const highlight = { ...inner, markId: 'highlight', kind: 'personal-highlight' as const };
  const marks = [outer, inner, twin, next, highlight];
  expect(pickEditorialComment([highlight], 'block', 3)).toBeUndefined();
  expect(pickEditorialComment(marks, 'block', 3)?.markId).toBe('inner');
  expect(pickEditorialComment(marks, 'block', 4)?.markId).toBe('next');
  expect(pickEditorialComment(marks, 'block', 6)?.markId).toBe('next');
  expect(pickEditorialComment(marks, 'block', 11)).toBeUndefined();
});

it('fences old Book/branch/window reads and never overwrites a newer command card', async () => {
  const cache = new EditorialCardCache(); const page = windowOf(); cache.sync(page);
  const old = deferred<EditorialMarkCardProjection>(); const read = cache.read(card.markId, () => old.promise);
  await Promise.resolve(); cache.put({ ...card, status: 'resolved', body: '命令返回最新正文' }); old.resolve(card);
  expect(await read).toBeUndefined(); expect(cache.cards.get(card.markId)?.status).toBe('resolved');
  for (const next of [{ ...page, bookId: 'other' }, { ...page, branchId: 'other' }, { ...page, blocks: [] }]) {
    const pending = deferred<EditorialMarkCardProjection>(); cache.clear(); const stale = cache.read(card.markId, () => pending.promise);
    await Promise.resolve(); cache.sync(next); pending.resolve(card);
    expect(await stale).toBeUndefined(); expect(cache.cards.size).toBe(0);
  }
  cache.put({ ...card, kind: 'personal-highlight' }); expect(cache.cards.size).toBe(0);
});

it('does not retry a failed read on scrolling until its version changes', async () => {
  const cache = new EditorialCardCache(); const page = windowOf(); cache.sync(page);
  const fetch = vi.fn(async (): Promise<EditorialMarkCardProjection> => { throw new Error('read failed'); });
  await expect(cache.read(card.markId, fetch)).rejects.toThrow('read failed');
  await expect(cache.read(card.markId, fetch)).rejects.toThrow('read failed'); expect(fetch).toHaveBeenCalledTimes(1);
  cache.sync({ ...page, revisionId: 'next' });
  await expect(cache.read(card.markId, fetch)).rejects.toThrow('read failed'); expect(fetch).toHaveBeenCalledTimes(2);
});

it('coalesces explicit retries and fences a stale retry failure after a returned command card', async () => {
  const cache = new EditorialCardCache(); cache.sync(windowOf());
  await expect(cache.read(card.markId, async () => { throw new Error('transient'); })).rejects.toThrow('transient');
  const pending = deferred<EditorialMarkCardProjection>(); const fetch = vi.fn(() => pending.promise);
  const retry = cache.read(card.markId, fetch, true); const second = cache.read(card.markId, fetch, true);
  await Promise.resolve(); expect(fetch).toHaveBeenCalledTimes(1);
  const current = { ...card, body: '命令返回的新正文', status: 'resolved' as const }; cache.put(current);
  pending.reject(new Error('obsolete failure'));
  await expect(retry).resolves.toBeUndefined(); await expect(second).resolves.toBeUndefined();
  expect(cache.cards.get(card.markId)).toBe(current); expect(cache.failed(card.markId)).toBe(false);
});

// The real pane owner with measured boundary doubles: no Electron or manuscript persistence.
describe('comments command parity and refresh continuity', () => {
  let technicalBefore: boolean;
  let restore: () => void; let frames: Array<() => void>; let mounted: ReturnType<typeof mountEditorialMarks> | undefined;
  beforeEach(() => {
    restore = installMiniDom(); frames = []; technicalBefore = technicalLayerVisible; setTechnicalLayerVisible(false);
    const create = miniDocument.createElement;
    vi.spyOn(miniDocument, 'createElement').mockImplementation((tag) => {
      const node = create(tag);
      Object.assign(node, { style: {}, clientHeight: 600, getClientRects: () => [{}], getBoundingClientRect: () => ({ top: 50, bottom: 230, left: 600, right: 920, width: 320, height: 180 }) });
      let hidden = false;
      Object.defineProperty(node, 'hidden', { get: () => hidden, set: (value: boolean) => { hidden = value; if (value && node.contains(miniDocument.activeElement)) miniDocument.activeElement = null; } });
      Object.defineProperty(node, 'firstElementChild', { get: () => node.children[0] ?? null });
      return node;
    });
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), getSelection: () => null });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { frames.push(fn); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Object.assign(miniDocument.body, { getBoundingClientRect: () => ({ top: 0, left: 0, right: 1000, bottom: 700, width: 1000, height: 700 }) });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('HTMLDetailsElement', MiniElement);
    vi.stubGlobal('HTMLFormElement', MiniElement);
  });
  afterEach(() => { mounted?.destroy(); mounted = undefined; setTechnicalLayerVisible(technicalBefore); vi.restoreAllMocks(); vi.unstubAllGlobals(); restore(); });
  async function paint() { for (let n = 0; n < 24; n++) { await Promise.resolve(); frames.splice(0).forEach((fn) => fn()); } }
  function mount(value = card, others: EditorialMarkCardProjection[] = []) {
    let page: ManuscriptWindowProjection = { ...windowOf(), marks: [anchor(value), ...others.map(anchor)] }; let latest = value; let enabled = true; let caret = 10;
    const host = document.createElement('div'); const scroll = document.createElement('div'); const pane = document.createElement('aside');
    miniDocument.body.append(host as unknown as MiniElement, scroll as unknown as MiniElement, pane as unknown as MiniElement);
    const block = document.createElement('p'); block.dataset['blockId'] = 'block'; host.append(block);
    const get = vi.fn(async (input: { markId: string }) => others.find((other) => other.markId === input.markId) ?? latest);
    const update = vi.fn(async (input: { action: string; status: 'open' | 'resolved'; body: string }) => {
      latest = input.action === 'reply' ? { ...latest, replies: [{ replyId: 'reply', body: input.body, createdAt: card.createdAt }] } : { ...latest, status: input.status };
      return { markId: latest.markId, card: latest, marks: [anchor(latest)], marksTruncated: false };
    });
    const decide = vi.fn(async (_input: Record<string, unknown>) => ({ markId: latest.markId, card: latest, marks: [anchor(latest)], marksTruncated: false }));
    const apply = vi.fn(async (_input: Record<string, unknown>) => ({ markId: latest.markId, card: latest, marks: [anchor(latest)], marksTruncated: false, window: page, application: {} }));
    const write = vi.fn(async (operation: () => Promise<unknown>) => operation());
    const status = vi.fn(); const active = vi.fn();
    const linked = vi.fn((id: string | null) => {
      for (const node of host.querySelectorAll<HTMLElement>('[data-mark-id]')) { node.classList.remove('manuscript-comments-anchor'); if (node.dataset['markId'] === id) node.classList.add('manuscript-comments-anchor'); }
    });
    const outcome = vi.fn(async (_input: Record<string, unknown>): Promise<unknown> => { throw new Error('outcome unavailable'); });
    const receipt = vi.fn(async (input: Record<string, unknown>) => ({ state: input['recovery'] === 'confirming' ? 'confirming' : 'unresolved', clientEffectId: input['clientEffectId'], reason: '结果待确认' }));
    const options = { host, scroll, comments: { host: pane, enabled: () => enabled },
      editor: { currentWindow: () => page, setMarks: (marks: EditorialMarkAnchorProjection[]) => { page = { ...page, marks }; }, setActiveMark: active, setLinkedMark: linked, setVisibleMarkIds: vi.fn(), captureContinuity: () => ({ head: { blockId: 'block', grapheme: caret } }), focus: vi.fn(), selectRange: vi.fn(), selectedRange: () => ({ kind: 'none' }) },
      api: { inspectReviewFindingOfMark: async () => null, getManuscriptApplyOutcome: outcome, inspectApplyReceipt: receipt, getEditorialMarkCard: get, updateEditorialMark: update, recordChangeSuggestionDecision: decide, applyChangeSuggestion: apply,
        inspectProposalWorkspace: async () => ({ items: [], offerWorkspace: false }), recordLearningReasonAsk: async () => null },
      busy: () => false, writeManuscript: write, setStatus: status, errorMessage: (_error: unknown, fallback: string) => fallback,
    } as unknown as Parameters<typeof mountEditorialMarks>[0];
    mounted = mountEditorialMarks(options);
    return { host, pane, block, scroll, get, update, decide, apply, write, status, active, linked, outcome, receipt,
      setCaret: (next: number) => { caret = next; }, open: () => mounted!.openMark(value.markId), refresh: () => mounted!.refreshComments(),
      setEnabled: (next: boolean) => { enabled = next; mounted!.refreshComments(); },
      setPage: (next: Partial<ManuscriptWindowProjection>) => { page = { ...page, ...next }; mounted!.refreshComments(); },
    };
  }
  it('combines category chips, status and search while keeping selections and search focus across polling (#1429)', async () => {
    const literary: EditorialMarkCardProjection = { ...card, markId: 'literary', categoryKey: 'literary', categoryLabel: '文学性与表达',
      source: { ...card.source, kind: 'ai7', origin: 'review-category', label: '文学性与表达改进' }, status: 'applied' };
    const ui = mount(card, [literary]); await paint();
    const chip = (key: string) => ui.pane.querySelector<HTMLButtonElement>(`[data-mark-category-filter="${key}"]`)!;
    const shown = () => Array.from(ui.pane.querySelectorAll<HTMLElement>('[data-comment-card]')).filter((node) => !node.hidden).map((node) => node.dataset['commentCard']);
    chip('editor').click(); await paint(); expect(shown()).toEqual(['comment']);
    chip('literary').click(); await paint(); expect(shown()).toEqual(['comment', 'literary']);
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-status-filter="applied"]')!.click(); await paint();
    expect(shown()).toEqual(['literary']);
    const search = ui.pane.querySelector<HTMLInputElement>('[data-mark-search-input]')!;
    search.value = '文学性'; search.focus(); (search as unknown as MiniElement).dispatchEvent({ type: 'input' }); await paint();
    ui.setPage({ journalSequence: 1 }); await paint();
    expect(ui.pane.querySelector('[data-mark-search-input]')).toBe(search);
    expect(document.activeElement).toBe(search); expect(search.value).toBe('文学性');
    expect(chip('editor').getAttribute('aria-pressed')).toBe('true');
    expect(chip('literary').getAttribute('aria-pressed')).toBe('true'); expect(shown()).toEqual(['literary']);
    search.value = '不存在的公开检索词'; (search as unknown as MiniElement).dispatchEvent({ type: 'input' }); await paint(); expect(shown()).toEqual([]);
    search.value = ''; (search as unknown as MiniElement).dispatchEvent({ type: 'input' });
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-status-filter="all"]')!.click();
    chip('all').click(); await paint(); expect(shown()).toEqual(['comment', 'literary']);
    chip('editor').click(); chip('editor').click(); await paint(); expect(chip('all').getAttribute('aria-pressed')).toBe('true');
  });
  it('keeps the chosen pane card through hover, then clears it when filtered out (#1451)', async () => {
    const ui = mount(card, [{ ...card, markId: 'other' }]); await paint();
    await ui.open(); await paint();
    const selected = ui.pane.querySelector<HTMLElement>('[data-comment-card="comment"]')!;
    const other = ui.pane.querySelector<HTMLElement>('[data-comment-card="other"]')!;
    expect(selected.dataset['selected']).toBe('true');
    expect(ui.scroll.querySelector('[data-mark-card]')).toBeNull();
    const top = selected.style.top;
    const paneScroll = ui.pane.querySelector<HTMLElement>('.manuscript-comments-scroll')!;
    paneScroll.scrollTop = 70;
    (paneScroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    expect(selected.style.top).toBe(top); expect(paneScroll.scrollTop).toBe(70);
    (other as unknown as MiniElement).dispatchEvent({ type: 'pointerenter' }); await paint();
    expect(selected.dataset['selected']).toBe('true'); expect(other.dataset['hovered']).toBe('true');
    (other as unknown as MiniElement).dispatchEvent({ type: 'pointerleave' }); await paint();
    expect(selected.dataset['selected']).toBe('true');
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-status-filter="applied"]')!.click(); await paint();
    expect(selected.dataset['selected']).toBe('false');
  });
  it('selects from the caret when decoration replacement retargets the click to its paragraph (#1451)', async () => {
    vi.stubGlobal('Element', MiniElement);
    const ui = mount(); await paint();
    const click = () => (ui.block as unknown as MiniElement).dispatchEvent({ ...{ type: 'click', bubbles: true, button: 0 } });
    ui.setCaret(1); click(); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')!.dataset['selected']).toBe('true');
    ui.setCaret(8); click(); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')!.dataset['selected']).toBe('false');
  });
  it('keeps unselected pane scroll and layout frames, then resets them on text movement (#1451)', async () => {
    const ui = mount(); await paint();
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card]')!;
    const paneScroll = ui.pane.querySelector<HTMLElement>('.manuscript-comments-scroll')!;
    const top = node.style.top;
    paneScroll.scrollTop = 100; (paneScroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    expect(node.style.top).toBe(top); expect(paneScroll.scrollTop).toBe(100);
    ui.refresh(); await paint(); expect(node.style.top).toBe(top); expect(paneScroll.scrollTop).toBe(100);
    (ui.scroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint(); expect(paneScroll.scrollTop).toBe(0);
  });
  it('holds pointer-focused controls in place until the completed click selects their card (#1451)', async () => {
    const ui = mount(); await paint();
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card]')!;
    const reply = node.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!;
    const top = node.style.top;
    (node as unknown as MiniElement).dispatchEvent({ ...{ type: 'pointerdown', button: 0, bubbles: true } });
    reply.focus(); (reply as unknown as MiniElement).dispatchEvent({ type: 'focusin', bubbles: true }); await paint();
    expect(node.dataset['selected']).not.toBe('true'); expect(node.style.top).toBe(top);
    reply.click(); await paint(); expect(node.dataset['selected']).toBe('true'); expect(node.querySelector('[data-comment-reply]')).not.toBeNull();
  });
  it('keeps existing cards in place when an earlier mark arrives in a scrolled pane (#1451)', async () => {
    const other = { ...card, markId: 'arriving' };
    const ui = mount(card, [other]); ui.setPage({ marks: [anchor()] }); await paint();
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card="comment"]')!;
    const paneScroll = ui.pane.querySelector<HTMLElement>('.manuscript-comments-scroll')!;
    const top = node.style.top; paneScroll.scrollTop = 100;
    (paneScroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    ui.setPage({ journalSequence: 1, marks: [anchor(other), anchor()] }); await paint();
    expect(node.style.top).toBe(top); expect(paneScroll.scrollTop).toBe(100);
    expect(Number.parseFloat(ui.pane.querySelector<HTMLElement>('[data-comment-card="arriving"]')!.style.top)).toBeGreaterThan(Number.parseFloat(top));
  });
  it('waits until a text press completes before linking its caret mark (#1451)', async () => {
    vi.stubGlobal('Element', MiniElement); vi.stubGlobal('Node', MiniElement);
    const ui = mount(); await paint();
    const words = document.createElement('span'); words.dataset['markId'] = card.markId; ui.block.append(words);
    vi.stubGlobal('document', Object.assign(Object.create(document), { getSelection: () => ({ anchorNode: words }) }));
    ui.host.focus(); ui.setCaret(1);
    (words as unknown as MiniElement).dispatchEvent({ ...{ type: 'mousedown', button: 0, bubbles: true } });
    miniDocument.body.dispatchEvent({ type: 'selectionchange' }); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')!.dataset['selected']).not.toBe('true');
    (words as unknown as MiniElement).dispatchEvent({ ...{ type: 'click', button: 0, bubbles: true } }); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')!.dataset['selected']).toBe('true');
  });
  it('keeps the pointed mark when its last glyph puts the caret at an adjacent start (#1451)', async () => {
    vi.stubGlobal('Element', MiniElement);
    vi.stubGlobal('Node', MiniElement);
    const ui = mount(card, [{ ...card, markId: 'adjacent', fromGrapheme: 2, toGrapheme: 4 }]); await paint();
    const words = document.createElement('span'); words.dataset['markId'] = card.markId; ui.block.append(words);
    ui.setCaret(2); (words as unknown as MiniElement).dispatchEvent({ ...{ type: 'mousedown', button: 0, bubbles: true } });
    (ui.block as unknown as MiniElement).dispatchEvent({ ...{ type: 'click', button: 0, bubbles: true } }); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card="comment"]')!.dataset['selected']).toBe('true');
  });
  it('reuses reply/resolve commands, keeps the actual reply input and caret across a returned-card refresh, and reads once', async () => {
    const ui = mount(); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click();
    const input = ui.pane.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!;
    input.value = '尚未发送的答复'; input.focus(); input.setSelectionRange(2, 4);
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')!.click(); await paint();
    expect(ui.update.mock.calls[0]?.[0]).toMatchObject({ action: 'set-status', status: 'resolved', markId: card.markId });
    expect(ui.pane.querySelector('[data-comment-reply]') === input).toBe(true);
    expect([input.value, input.selectionStart, input.selectionEnd]).toEqual(['尚未发送的答复', 2, 4]);
    expect(document.activeElement).toBe(input);
    expect(ui.pane.querySelector('[data-mark-state]')?.textContent).toContain('已处理');
    const form = ui.pane.querySelector('form')!;
    (form as unknown as MiniElement).dispatchEvent({ type: 'submit' }); await paint();
    expect(ui.update.mock.calls[1]?.[0]).toMatchObject({ action: 'reply', body: '尚未发送的答复' });
    expect(ui.pane.querySelector('[data-mark-region="replies"]')?.textContent).toContain('尚未发送的答复');
    expect(input.value).toBe(''); expect(ui.get).toHaveBeenCalledTimes(1);
  });
  it('uses the existing decision and guarded Apply path and refuses a duplicate click in flight', async () => {
    const suggestion = { ...card, kind: 'change-suggestion' as const, suggestion: { itemId: 'item', changeType: 'replace' as const, currentText: '合成', proposedText: '改后', rationale: '理由', atomicGroupId: null, decision: null, application: null } };
    const ui = mount(suggestion); await paint();
    const accept = ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="accept-and-apply"]')!;
    accept.click(); accept.click(); await paint();
    expect(ui.apply).toHaveBeenCalledTimes(1); expect(ui.write).toHaveBeenCalledTimes(1);
    expect(ui.apply.mock.calls[0]?.[0]).toMatchObject({ markId: card.markId, interaction: 'accept-and-apply' });
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reject"]')!.click(); await paint();
    expect(ui.decide.mock.calls[0]?.[0]).toMatchObject({ markId: card.markId, disposition: 'rejected' });
  });
  it('reports a failed inline command, retains the draft and allows the same guarded action to succeed later', async () => {
    const ui = mount(); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click();
    const input = ui.pane.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!;
    input.value = '失败后保留的回复';
    ui.update.mockRejectedValueOnce(new Error('service refused'));
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')!.click(); await paint();
    expect(ui.status).toHaveBeenLastCalledWith('标记未能更新。', 'error');
    expect(ui.pane.querySelector('[data-mark-state]')?.textContent).toContain('待你处理');
    expect(input.value).toBe('失败后保留的回复');
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')!.click(); await paint();
    expect(ui.pane.querySelector('[data-mark-state]')?.textContent).toContain('已处理');
  });
  it('recovers an explicit full-card open after one failed passive read without retrying passive refresh', async () => {
    const ui = mount(); ui.get.mockRejectedValueOnce(new Error('transient read')); await paint();
    ui.refresh(); await paint(); expect(ui.get).toHaveBeenCalledTimes(1);
    ui.setEnabled(false); await ui.open(); await paint();
    expect(ui.get).toHaveBeenCalledTimes(2);
    expect(ui.scroll.querySelector('[data-mark-card]')?.textContent).toContain(card.body);
  });
  it.each(['new draft', 'composition', 'restored text'])('preserves %s begun while a captured reply is sending', async (mode) => {
    const ui = mount(); await paint(); ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click();
    const input = ui.pane.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!;
    input.value = '已提交的回复'; const pending = deferred<Awaited<ReturnType<typeof ui.update>>>();
    ui.update.mockImplementationOnce(() => pending.promise);
    (ui.pane.querySelector('form')! as unknown as MiniElement).dispatchEvent({ type: 'submit' }); await paint();
    if (mode === 'new draft') { input.value = '新写的草稿'; (input as unknown as MiniElement).dispatchEvent({ type: 'input' }); }
    else if (mode === 'composition') (input as unknown as MiniElement).dispatchEvent({ type: 'compositionstart' });
    else { input.value = '临时改动'; (input as unknown as MiniElement).dispatchEvent({ type: 'input' }); input.value = '已提交的回复'; (input as unknown as MiniElement).dispatchEvent({ type: 'input' }); }
    input.focus(); input.setSelectionRange(2, 4);
    pending.resolve({ markId: card.markId, card: { ...card, replies: [{ replyId: 'r', body: '已提交的回复', createdAt: card.createdAt }] }, marks: [anchor()], marksTruncated: false });
    await paint();
    expect(input.value).toBe(mode === 'new draft' ? '新写的草稿' : '已提交的回复');
    expect(document.activeElement).toBe(input); expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]);
    expect(ui.update.mock.calls[0]?.[0]).toMatchObject({ body: '已提交的回复' });
    expect(ui.pane.querySelector('[data-mark-region="replies"]')?.textContent).toContain('已提交的回复');
  });
  it('keeps a surviving reply node across an unrelated structural edit, and discards it on actual Book departure', async () => {
    const ui = mount(); await paint(); ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click();
    const input = ui.pane.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!; input.value = '结构编辑前的草稿';
    ui.setPage({ journalSequence: 1, blocks: [...windowOf().blocks, { ...windowOf().blocks[0]!, blockId: 'new-unrelated-block' }], marks: [anchor()] });
    await paint(); expect(ui.pane.querySelector('[data-comment-reply]') === input).toBe(true); expect(input.value).toBe('结构编辑前的草稿');
    ui.setPage({ bookId: 'other-book', manuscriptId: 'other-manuscript', marks: [] }); await paint();
    expect(ui.pane.querySelector('[data-comment-reply]')).toBeNull();
  });
  it('keeps focused input visible during deferred revalidation, disables stale actions, then respects viewport removal', async () => {
    const ui = mount(); await paint(); ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click();
    const input = ui.pane.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!; input.value = '刷新期间的草稿'; input.focus(); input.setSelectionRange(2, 4);
    const oldResolve = ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')!;
    const pending = deferred<EditorialMarkCardProjection>(); ui.get.mockImplementationOnce(() => pending.promise);
    ui.setPage({ journalSequence: 1, marks: [anchor()] }); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')?.hidden).toBe(false);
    expect(document.activeElement).toBe(input); expect(input.value).toBe('刷新期间的草稿');
    expect(ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')?.disabled).toBe(true);
    oldResolve.click(); await paint(); expect(ui.update).not.toHaveBeenCalled();
    pending.resolve({ ...card, body: '刷新后的最新正文' }); await paint();
    expect(ui.pane.querySelector('[data-comment-reply]') === input).toBe(true); expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]); expect(ui.pane.textContent).toContain('刷新后的最新正文');
    Object.assign(ui.block, { getBoundingClientRect: () => ({ top: 3000, bottom: 3100 }) });
    (ui.scroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')?.hidden).toBe(true);
  });
  it('clears only the inline-owned proposed preview when comments are dismissed', async () => {
    const ui = mount(suggestion); await paint(); ui.pane.querySelector<HTMLElement>('[data-comment-card]')!.click();
    expect(ui.active).toHaveBeenLastCalledWith({ markId: card.markId, previewText: '改后' });
    ui.setEnabled(false); await paint(); expect(ui.active).toHaveBeenLastCalledWith(null);
    await ui.open(); await paint();
    const calls = ui.active.mock.calls.length; ui.setEnabled(false); await paint();
    expect(ui.active.mock.calls.length).toBe(calls); expect(ui.active).toHaveBeenLastCalledWith({ markId: card.markId, previewText: '改后' });
  });
  it('synchronizes unresolved receipt controls, blocks stale mutations and rechecks the original Effect without resending', async () => {
    const ui = mount(suggestion); await paint();
    const accept = ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="accept-and-apply"]')!;
    const reject = ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reject"]')!;
    const pending = deferred<unknown>(); ui.outcome.mockImplementationOnce(() => pending.promise);
    ui.apply.mockRejectedValueOnce(new Error('lost acknowledgement')); accept.click(); await paint();
    pending.reject(new Error('outcome read failed')); await paint();
    expect(ui.scroll.querySelector('[data-apply-receipt-state="unresolved"]')).not.toBeNull();
    expect(ui.pane.querySelector('[data-apply-receipt-state="unresolved"]')).not.toBeNull();
    accept.click(); reject.click(); await paint();
    expect(ui.apply).toHaveBeenCalledTimes(1); expect(ui.decide).not.toHaveBeenCalled();
    const effect = ui.apply.mock.calls[0]![0]['clientEffectId'];
    ui.receipt.mockImplementationOnce(async (input) => ({ state: 'not-applied', clientEffectId: input['clientEffectId'], reason: '未应用' }));
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="receipt-recheck"]')!.click(); await paint();
    expect(ui.receipt).toHaveBeenLastCalledWith(expect.objectContaining({ clientEffectId: effect, recovery: 'recheck' }));
    expect(ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="accept-and-apply"]')?.disabled).toBe(false);
    expect(ui.scroll.querySelector('[data-apply-receipt-state="unresolved"]')).toBeNull(); expect(ui.apply).toHaveBeenCalledTimes(1);
  });

  it('keeps applied proof readable while the real ordinary-mode collector removes credential identities', async () => {
    const application = { effectId: 'effect-private-id', kind: 'apply' as const, interaction: 'accept-and-apply' as const,
      approvalId: 'approval', dispatchId: 'dispatch', receiptId: 'receipt-private-id', changeCount: 1, payloadDigest: 'a'.repeat(64), receiptDigest: 'b'.repeat(64),
      before: { revisionId: 'revision', journalSequence: 0, workingDigest: 'c'.repeat(64) }, after: { revisionId: 'revision', journalSequence: 1, workingDigest: 'd'.repeat(64) },
      committedAt: card.createdAt, reversesEffectId: null, reversedByEffectId: null };
    const value: EditorialMarkCardProjection = { ...suggestion, status: 'applied', suggestion: { ...suggestion.suggestion!, application } };
    const ui = mount(value); await paint(); ui.setEnabled(false); await ui.open(); await paint();
    collectTechnicalDisclosures(document.body);
    const full = ui.scroll.querySelector('[data-mark-card]')!;
    expect(full.querySelector('[data-mark-receipt]')).toBeNull();
    expect(full.querySelector('[data-mark-application]')?.textContent).toContain('已应用 · 已写入稿件');
    expect(full.querySelector('[data-mark-state]')?.textContent).toBe('已应用');
    expect(full.textContent).not.toContain('effect-private-id'); expect(full.textContent).not.toContain('receipt-private-id');
    expect(full.textContent).not.toContain(application.receiptDigest);
  });

  it('keeps the real focused-card activation when a retained editor selection emits selectionchange', async () => {
    const ui = mount(); await paint();
    const decorator = document.createElement('span'); decorator.className = 'editorial-mark'; decorator.dataset['markId'] = card.markId; ui.block.append(decorator);
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card]')!; node.focus();
    (node as unknown as MiniElement).dispatchEvent({ type: 'focusin', bubbles: true }); await paint();
    expect(node.dataset['active']).toBe('true');
    expect(miniDocument.body.querySelector('[data-comment-leader]') !== null).toBe(true);
    vi.stubGlobal('document', Object.assign(Object.create(document), { getSelection: () => ({ anchorNode: ui.block }) }));
    miniDocument.body.dispatchEvent({ type: 'selectionchange' }); await paint();
    expect(document.activeElement).toBe(node); expect(node.dataset['active']).toBe('true');
    expect(miniDocument.body.querySelector('[data-comment-leader]') !== null).toBe(true);
    ui.host.focus(); miniDocument.body.dispatchEvent({ type: 'selectionchange' }); await paint();
    expect(node.dataset['active']).toBe('false');
    ui.setCaret(1); miniDocument.body.dispatchEvent({ type: 'selectionchange' }); await paint();
    expect(node.dataset['active']).toBe('true');
  });
  it('retains the managed link identity through a frame without repainting editor DOM', async () => {
    const ui = mount(); await paint();
    const decorator = document.createElement('span'); decorator.className = 'editorial-mark'; decorator.dataset['markId'] = card.markId; ui.block.append(decorator);
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card]')!; node.focus();
    (node as unknown as MiniElement).dispatchEvent({ type: 'focusin', bubbles: true }); await paint();
    expect(decorator.classList.contains('manuscript-comments-anchor')).toBe(true);
    const calls = ui.linked.mock.calls.length;
    (ui.scroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    expect(node.dataset['active']).toBe('true'); expect(ui.linked).toHaveBeenLastCalledWith(card.markId); expect(ui.linked.mock.calls.length).toBe(calls);
    expect(miniDocument.body.querySelector('[data-comment-leader]') !== null).toBe(true);
  });

});
