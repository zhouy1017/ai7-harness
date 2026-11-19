import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialCardCache, mountEditorialMarks, editorialCommentStartFromFragments, editorialCommentStart, stackEditorialComments, pickEditorialComment } from '../../src/renderer/editorial-marks.js';
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
  const filter = { selectedCategories: new Set<'editor'>(), selectedModels: new Set<string>(), status: 'all' as const, keyword: '' };
  for (const keyword of ['合成', 'abc', '理由', '编辑人工修订']) {
    expect(matchesEditorialMarkFilter(anchor(value), value, { ...filter, keyword })).toBe(true);
  }
  expect(matchesEditorialMarkFilter(anchor(value), value, { ...filter, keyword: '未匹配的检索' })).toBe(false);
});

it('filters handled states and frozen models without treating an open conflict as handled (#1454)', () => {
  const filter = { selectedCategories: new Set<'editor'>(), selectedModels: new Set<string>(), status: 'handled' as const, keyword: '' };
  for (const status of ['applied', 'resolved'] as const) expect(matchesEditorialMarkFilter({ ...anchor(), status }, card, filter)).toBe(true);
  expect(matchesEditorialMarkFilter({ ...anchor(), disposition: 'rejected' }, card, filter)).toBe(true);
  expect(matchesEditorialMarkFilter({ ...anchor(), status: 'applied', conflict: 'unresolved' }, card, filter)).toBe(false);
  const ai = { ...card, source: { ...card.source, kind: 'ai7' as const, modelLabel: '模型甲@high' } };
  const modelFilter = { ...filter, status: 'all' as const, selectedModels: new Set(['模型甲@high']) };
  expect(matchesEditorialMarkFilter(anchor(ai), ai, modelFilter)).toBe(true);
  expect(matchesEditorialMarkFilter(anchor(), card, modelFilter)).toBe(false);
  expect(matchesEditorialMarkFilter(anchor(ai), { ...ai, source: { ...ai.source, modelLabel: '模型乙' } }, modelFilter)).toBe(false);
});

it('stacks all five measured cards in anchor order with ten pixel gaps, including offscreen buffers', () => {
  const items = [{ desiredTop: 200, measuredHeight: 90 }, { desiredTop: -190, measuredHeight: 40 },
    { desiredTop: 190, measuredHeight: 120 }, { desiredTop: 200, measuredHeight: 60 }, { desiredTop: 201, measuredHeight: 80 }];
  const placed = stackEditorialComments(items);
  expect(placed.map((item) => item.top)).toEqual([8, 190, 320, 420, 490]);
  expect(items[0]?.desiredTop).toBe(200);
});

it('coalesces pending reads, keeps a card across an unrelated autosave, and reads it again once its mark or paragraph changed (#1523)', async () => {
  const cache = new EditorialCardCache(); const page = windowOf(); cache.sync(page);
  const pending = deferred<EditorialMarkCardProjection>(); const fetch = vi.fn(() => pending.promise);
  const reads = Array.from({ length: 8 }, () => cache.read(card.markId, fetch));
  await Promise.resolve(); expect(fetch).toHaveBeenCalledTimes(1);
  pending.resolve(card); await Promise.all(reads);
  expect(await cache.read(card.markId, fetch)).toBe(card); expect(fetch).toHaveBeenCalledTimes(1);
  // The pane's own command answered it: no second read. Any other fresh snapshot reads it again behind the card on screen.
  cache.sync({ ...page, marks: [...page.marks] }, false);
  expect(await cache.read(card.markId, fetch)).toBe(card); expect(fetch).toHaveBeenCalledTimes(1);
  const changed = vi.fn(); const watched = new EditorialCardCache(changed); watched.sync(page);
  await watched.read(card.markId, async () => card);
  watched.sync({ ...page, marks: [...page.marks] });
  const same = vi.fn(async () => ({ ...card }));
  expect(await watched.read(card.markId, same)).toBe(card); for (let turn = 0; turn < 12; turn++) await Promise.resolve();
  expect(same).toHaveBeenCalledTimes(1); expect(watched.cards.get(card.markId)).toBe(card); expect(changed).not.toHaveBeenCalled();
  const replied = { ...card, replies: [{ replyId: 'reply', body: '别处添加的回复', createdAt: card.createdAt }] };
  watched.sync({ ...page, marks: [...page.marks] });
  expect(await watched.read(card.markId, async () => replied)).toBe(card); for (let turn = 0; turn < 12; turn++) await Promise.resolve();
  expect(watched.cards.get(card.markId)).toBe(replied); expect(changed).toHaveBeenCalledWith(card.markId);
});

it('an explicit open reads a held card again once its words changed, and returns an unchanged card at once (#1523)', async () => {
  const cache = new EditorialCardCache(); const page = windowOf(); cache.sync(page);
  await cache.read(card.markId, async () => card);
  const unchanged = vi.fn(async () => card);
  expect(await cache.current(card.markId, unchanged)).toBe(card); expect(unchanged).not.toHaveBeenCalled();
  // Typing inside the words drifts the mark: the pane keeps the card on screen, but an open must not show 接受并应用 as before.
  cache.sync({ ...page, marks: page.marks.map(mark => ({ ...mark, anchorState: 'drifted' as const })), blocks: page.blocks.map(block => ({ ...block, digest: 'typed' })) });
  const drifted = { ...card, anchorState: 'drifted' as const };
  const pending = deferred<EditorialMarkCardProjection>(); const fetch = vi.fn(() => pending.promise);
  const opened = cache.current(card.markId, fetch);
  expect(await cache.read(card.markId, fetch)).toBe(card);
  pending.resolve(drifted);
  expect(await opened).toBe(drifted); expect(fetch).toHaveBeenCalledTimes(1);
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

it('drops queued reads on a new projection while running reads keep their shared slots (#1459)', async () => {
  const cache = new EditorialCardCache(); cache.sync(windowOf());
  const held = Array.from({length:4},()=>deferred<EditorialMarkCardProjection>());
  const running = held.map((value,index)=>cache.read(`running-${index}`,()=>value.promise));
  const obsolete = vi.fn(async()=>card);
  const queued = cache.read('queued',obsolete);
  await Promise.resolve(); cache.clear();
  await expect(queued).resolves.toBeUndefined(); expect(obsolete).not.toHaveBeenCalled();
  const latest = vi.fn(async()=>card); const next = cache.read(card.markId,latest);
  await Promise.resolve(); expect(latest).not.toHaveBeenCalled();
  held.forEach(value=>value.resolve(card));
  await Promise.all(running); await expect(next).resolves.toBe(card);
  expect(latest).toHaveBeenCalledOnce(); expect(cache.cards.size).toBe(1);
});

it('does not retry a failed read on scrolling until its version changes', async () => {
  const cache = new EditorialCardCache(); const page = windowOf(); cache.sync(page);
  const fetch = vi.fn(async (): Promise<EditorialMarkCardProjection> => { throw new Error('read failed'); });
  await expect(cache.read(card.markId, fetch)).rejects.toThrow('read failed');
  await expect(cache.read(card.markId, fetch)).rejects.toThrow('read failed'); expect(fetch).toHaveBeenCalledTimes(1);
  cache.sync({ ...page, blocks: [{ ...page.blocks[0]!, digest: 'next' }] });
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
      Object.assign(node, { moveBefore: (child: MiniElement, before: MiniElement | null) => node.insertBefore(child, before) });
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
    vi.stubGlobal('getComputedStyle', () => ({ position: 'static' }));
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('HTMLDetailsElement', MiniElement);
    vi.stubGlobal('HTMLFormElement', MiniElement);
  });
  afterEach(() => { mounted?.destroy(); mounted = undefined; setTechnicalLayerVisible(technicalBefore); vi.restoreAllMocks(); vi.unstubAllGlobals(); restore(); });
  async function paint() { for (let n = 0; n < 24; n++) { await Promise.resolve(); frames.splice(0).forEach((fn) => fn()); } }
  function mount(value = card, others: EditorialMarkCardProjection[] = [], extra: Record<string, unknown> = {}) {
    let page: ManuscriptWindowProjection = { ...windowOf(), marks: [anchor(value), ...others.map(anchor)] }; let latest = value; let enabled = true; let caret = 10; let nativeCaret = 10; let rangeKind = 'none';
    const host = document.createElement('div'); const scroll = document.createElement('div'); const pane = document.createElement('aside');
    miniDocument.body.append(host as unknown as MiniElement, scroll as unknown as MiniElement, pane as unknown as MiniElement);
    const block = document.createElement('p'); block.dataset['blockId'] = 'block'; host.append(block);
    window.getSelection = () => ({isCollapsed:rangeKind==='none',anchorNode:block,anchorOffset:nativeCaret}) as unknown as Selection;
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
      editor: { currentWindow: () => page, setMarks: (marks: EditorialMarkAnchorProjection[]) => { page = { ...page, marks }; }, setActiveMark: active, setLinkedMark: linked, setVisibleMarkIds: vi.fn(), captureContinuity: () => ({ head: { blockId: 'block', grapheme: caret } }), followNativeCaret: () => { const selection = window.getSelection(); return selection?.isCollapsed === false ? null : { blockId: 'block', grapheme: nativeCaret }; }, focus: vi.fn(), selectRange: vi.fn(), flush: async () => undefined,
        selectedRange: () => ({ kind: rangeKind, blockId: 'block', blockDigest: 'digest', fromGrapheme: 0, toGrapheme: 2, text: '合成' }) },
      api: { inspectReviewFindingOfMark: async () => null, getManuscriptApplyOutcome: outcome, inspectApplyReceipt: receipt, getEditorialMarkCard: get, updateEditorialMark: update, recordChangeSuggestionDecision: decide, applyChangeSuggestion: apply,
        inspectProposalWorkspace: async () => ({ items: [], offerWorkspace: false }), recordLearningReasonAsk: async () => null },
      busy: () => false, writeManuscript: write, setStatus: status, errorMessage: (_error: unknown, fallback: string) => fallback, ...extra,
    } as unknown as Parameters<typeof mountEditorialMarks>[0];
    mounted = mountEditorialMarks(options);
    return { host, pane, block, scroll, get, update, decide, apply, write, status, active, linked, outcome, receipt,
      setRange: (next: string) => { rangeKind = next; }, setCaret: (next: number) => { caret = nativeCaret = next; }, setNativeCaret: (next: number) => { nativeCaret = next; }, open: () => mounted!.openMark(value.markId), refresh: () => mounted!.refreshComments(),
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
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-status-filter="handled"]')!.click(); await paint();
    expect(shown()).toEqual(['literary']);
    expect(ui.pane.querySelector('[data-mark-filter-toggle]')?.textContent).toBe('筛选 3');
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
  it('selects a keyboard-focused loading row and retains selection when its card arrives', async () => {
    const ui = mount(); const read = deferred<EditorialMarkCardProjection>();
    ui.get.mockImplementation(() => read.promise); await paint();
    const loading = ui.pane.querySelector<HTMLElement>('[data-comment-pending="comment"]')!;
    expect(loading).not.toBeNull();
    loading.focus(); (loading as unknown as MiniElement).dispatchEvent({ type: 'focusin' }); await paint();
    expect(ui.linked).toHaveBeenLastCalledWith('comment');
    read.resolve(card); await paint();
    const ready = ui.pane.querySelector('[data-comment-card="comment"]');
    expect(ready?.getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(ready);
  });
  it('keeps every category badge readable when slow card reads meet the shared 16-request service limit (#1459)', async () => {
    const cards = [card, ...Array.from({length:20},(_,index)=>({...card,markId:`slow-${index}`}))];
    const ui = mount(card,cards.slice(1));
    const release: Array<() => void> = []; let pending = 0; let refused = 0;
    ui.get.mockImplementation(input => {
      if(pending===16){refused++;return Promise.reject(new Error('SERVICE_UNAVAILABLE'));}
      pending++;
      return new Promise(resolve=>release.push(()=>{pending--;resolve(cards.find(value=>value.markId===input.markId)!);}));
    });
    for(let turn=0;turn<cards.length;turn++){await paint();release.splice(0).forEach(done=>done());}
    await paint();
    expect(refused).toBe(0);
    for(const value of cards)expect(ui.pane.querySelector(`[data-mark-card="${value.markId}"] .editorial-mark-category-badge`)?.textContent).toBe('编辑修订');
  });
  it('keeps factual identifiers, digests and result versions behind the technical layer (#1454)', async () => {
    setTechnicalLayerVisible(false);
    const factual: EditorialMarkCardProjection = { ...suggestion, factualCorrection: { proposalId: 'proposal-id', resultId: 'result-id', resultVersion: 42, decisionId: null,
      level: 'quick', levelLabel: '快速整理', states: { referenceIntegrity: 'verified', claimSupport: '未核查', factualVerification: '待核查' },
      checkedSources: 0, candidateSources: 1, policyPin: { document: 'policy-document', sha256: 'a'.repeat(64), minimumLevel: null },
      assuranceLabel: '证据核查未完成', missingChecks: ['来源待核对'] } };
    const ui = mount(factual);
    await paint();
    const text = () => ui.pane.querySelector('[data-comment-card]')!.textContent;
    expect(text()).toContain('证据核查未完成'); expect(text()).toContain('快速整理');
    for (const technical of ['result-id', 'policy-document', 'aaaaaaaaaaaa', '第 42 版']) expect(text()).not.toContain(technical);
    setTechnicalLayerVisible(true); ui.get.mockImplementation(async () => ({ ...factual, updatedAt: '2026-11-08T00:00:00Z' }));
    ui.setPage({ blocks: [{ ...windowOf().blocks[0]!, digest: 'edited' }] }); await paint();
    expect(text()).toContain('policy-document'); expect(text()).toContain('第 42 版');
  });
  it('re-reads only the card a command changed, then selects and focuses the next pending card (#1523)', async () => {
    const other = { ...card, markId: 'other' }, third = { ...card, markId: 'third' };
    const ui = mount(card, [other, third]); await paint(); await ui.open(); await paint();
    const reads = ui.get.mock.calls.length;
    const handled = { ...card, status: 'resolved' as const };
    ui.update.mockResolvedValueOnce({ markId: card.markId, card: handled, marks: [anchor(handled), anchor(other), anchor(third)], marksTruncated: false });
    ui.pane.querySelector<HTMLButtonElement>('[data-comment-card="comment"] [data-mark-action="resolve"]')!.click(); await paint();
    const row = (id: string) => ui.pane.querySelector<HTMLElement>(`[data-comment-card="${id}"]`)!;
    expect(ui.get.mock.calls.length).toBe(reads);
    for (const id of ['comment', 'other', 'third']) expect(row(id).dataset['revalidating']).toBe('false');
    expect(row('third').querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')!.disabled).toBe(false);
    expect(row('comment').dataset['selected']).toBe('false'); expect(row('third').dataset['expanded']).toBe('false');
    expect(row('other').dataset['selected']).toBe('true'); expect(document.activeElement).toBe(row('other'));
  });
  it('reads the cards again behind an autosave, keeps every node and control as it was, and shows only what changed (#1523)', async () => {
    const elsewhere = { ...card, markId: 'elsewhere', blockId: 'second' };
    const ui = mount(card, [elsewhere]);
    const paragraph = document.createElement('p'); paragraph.dataset['blockId'] = 'second'; ui.host.append(paragraph);
    ui.setPage({ blocks: [...windowOf().blocks, { ...windowOf().blocks[0]!, blockId: 'second', digest: 'second', position: 2 }] }); await paint();
    const row = (id: string) => ui.pane.querySelector<HTMLElement>(`[data-comment-card="${id}"]`)!;
    const nodes = { comment: row('comment').firstElementChild, elsewhere: row('elsewhere').firstElementChild };
    const replied = deferred<EditorialMarkCardProjection>();
    ui.get.mockImplementation((input: { markId: string }) => input.markId === 'elsewhere' ? replied.promise : Promise.resolve(card));
    // Typing in the second paragraph, and a reply added to its mark elsewhere: same mark, same reading position.
    ui.setPage({ journalSequence: 1, blocks: [windowOf().blocks[0]!, { ...windowOf().blocks[0]!, blockId: 'second', digest: 'typed', position: 2 }], marks: [anchor(), anchor(elsewhere)] }); await paint();
    expect(ui.get.mock.calls.slice(-2).map((call) => call[0].markId).sort()).toEqual(['comment', 'elsewhere']);
    for (const id of ['comment', 'elsewhere'] as const) {
      expect(row(id).dataset['revalidating']).toBe('false'); expect(row(id).firstElementChild).toBe(nodes[id]);
      expect(row(id).querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')!.disabled).toBe(false);
    }
    replied.resolve({ ...elsewhere, replies: [{ replyId: 'reply', body: '别处添加的回复', createdAt: card.createdAt }] }); await paint();
    expect(row('elsewhere').textContent).toContain('别处添加的回复'); expect(row('comment').firstElementChild).toBe(nodes.comment);
  });
  it('removes an empty abandoned or sent reply form so an unselected card becomes compact', async () => {
    const other = { ...card, markId: 'other' }, ui = mount(card, [other]); await paint();
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card="comment"]')!;
    const next = ui.pane.querySelector<HTMLElement>('[data-comment-card="other"]')!;
    node.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click(); await paint();
    next.focus(); next.click(); await paint();
    expect(node.querySelector('[data-comment-reply]')).toBeNull(); expect(node.dataset['expanded']).toBe('false');
    node.click(); await paint(); node.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click();
    const input = node.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!; input.value = '公开答复';
    const sent = { ...card, replies: [{ replyId: 'r', body: input.value, createdAt: card.createdAt }] };
    ui.update.mockResolvedValueOnce({ markId: card.markId, card: sent, marks: [anchor(sent), anchor(other)], marksTruncated: false });
    (node.querySelector('form') as unknown as MiniElement).dispatchEvent({ type: 'submit' }); await paint();
    expect(input.value).toBe(''); next.focus(); next.click(); await paint();
    expect(node.querySelector('[data-comment-reply]')).toBeNull(); expect(node.dataset['expanded']).toBe('false');
  });
  it('shows the unchecked line only for listed matches and retains the empty-filter hint', async () => {
    const ui = mount({ ...card, body: '【未联网核查】公开合成说明' }); await paint();
    const line = ui.pane.querySelector<HTMLElement>('.editorial-mark-disclosure')!;
    expect(line.hidden).toBe(false);
    const search = ui.pane.querySelector<HTMLInputElement>('[data-mark-search-input]')!;
    search.value = '没有这个词'; (search as unknown as MiniElement).dispatchEvent({ type: 'input' }); await paint();
    expect(line.hidden).toBe(true); expect(ui.pane.querySelector('.editorial-mark-filter-summary')?.textContent).toContain('没有匹配的批注');
    search.value = ''; (search as unknown as MiniElement).dispatchEvent({ type: 'input' }); await paint();
    Object.assign(ui.block, { getBoundingClientRect: () => ({ top: 3000, bottom: 3100 }) }); ui.refresh(); await paint(); expect(line.hidden).toBe(true);
  });
  it('keeps an initial failed read compact with an explicit retry, then uses the returned card (#1454)', async () => {
    const ui = mount(); ui.get.mockRejectedValueOnce(new Error('read unavailable')); await paint();
    const failed = ui.pane.querySelector<HTMLElement>('[data-comment-pending]')!;
    expect(failed.dataset['expanded']).toBe('false'); expect(failed.textContent).toContain('批注读取失败');
    expect(ui.get).toHaveBeenCalledTimes(1); ui.refresh(); await paint(); expect(ui.get).toHaveBeenCalledTimes(1);
    failed.querySelector<HTMLButtonElement>('[data-comment-retry]')!.click(); await paint();
    expect(ui.pane.querySelector('[data-comment-pending]')).toBeNull();
    expect(ui.pane.querySelector('[data-mark-body]')?.textContent).toBe(card.body); expect(ui.get).toHaveBeenCalledTimes(2);
  });
  it('compares frozen model marks and resets an unselected scrolled frame on filtering (#1454)', async () => {
    const ai = (markId: string, modelLabel: string): EditorialMarkCardProjection => ({ ...card, markId, source: { ...card.source, kind: 'ai7', modelLabel } });
    const ui = mount(card, [ai('model-a', '模型甲@high'), ai('model-b', '模型乙')]); await paint();
    const paneScroll = ui.pane.querySelector<HTMLElement>('.manuscript-comments-scroll')!;
    paneScroll.scrollTop = 400; (paneScroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-model-filter="模型甲@high"]')!.click(); await paint();
    expect(paneScroll.scrollTop).toBe(0);
    const shown = () => Array.from(ui.pane.querySelectorAll<HTMLElement>('[data-comment-card]')).filter(node => !node.hidden).map(node => node.dataset['commentCard']);
    expect(shown()).toEqual(['model-a']);
    expect(ui.pane.querySelector('.editorial-mark-filter-summary')?.textContent).toBe('已筛选 1 / 3');
    ui.refresh(); await paint(); expect(shown()).toEqual(['model-a']);
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-model-filter="模型乙"]')!.click(); await paint(); expect(shown()).toEqual(['model-a', 'model-b']);
  });
  it('expands after a completed row click without re-reading, and keeps a deselected reply open (#1454)', async () => {
    const ui = mount(card, [{ ...card, markId: 'other' }]); await paint();
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card="comment"]')!;
    const other = ui.pane.querySelector<HTMLElement>('[data-comment-card="other"]')!;
    expect(node.dataset['expanded']).toBe('false');
    (node as unknown as MiniElement).dispatchEvent({ ...{ type: 'pointerdown', button: 0, bubbles: true } });
    (node as unknown as MiniElement).dispatchEvent({ type: 'focusin', bubbles: true }); await paint();
    expect(node.dataset['expanded']).toBe('false');
    node.click(); await paint(); expect(node.dataset['expanded']).toBe('true'); expect(ui.get).toHaveBeenCalledTimes(2);
    node.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click(); await paint();
    const input = node.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!; input.value = '保留草稿'; other.focus(); other.click(); await paint();
    expect(node.dataset['selected']).toBe('false'); expect(node.dataset['expanded']).toBe('true'); expect(node.querySelector('[data-comment-reply]')).toBe(input);
  });
  it('flushes layout dropped during an auto-scrolling text drag and releases a press on window blur (#1454)', async () => {
    vi.stubGlobal('Element', MiniElement); vi.stubGlobal('Node', MiniElement);
    const ui = mount(); await paint();
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card]')!;
    const top = node.style.top;
    (ui.block as unknown as MiniElement).dispatchEvent({ ...{ type: 'mousedown', button: 0, bubbles: true } });
    Object.assign(ui.block, { getBoundingClientRect: () => ({ top: 180, bottom: 200 }) });
    (ui.scroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint(); expect(node.style.top).toBe(top);
    ui.setRange('range'); (ui.block as unknown as MiniElement).dispatchEvent({ ...{ type: 'click', button: 0, bubbles: true } }); await paint();
    expect(node.style.top).not.toBe(top);
    (node as unknown as MiniElement).dispatchEvent({ ...{ type: 'pointerdown', button: 0, bubbles: true } });
    const held = node.style.top; Object.assign(ui.block, { getBoundingClientRect: () => ({ top: 250, bottom: 270 }) });
    ui.refresh(); await paint(); expect(node.style.top).toBe(held);
    const blur = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === 'blur')![1] as () => void;
    blur(); await paint(); expect(node.style.top).not.toBe(held);
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
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-status-filter="handled"]')!.click(); await paint();
    expect(selected.dataset['selected']).toBe('false');
  });
  it.each([true, false])('uses the collapsed native selection while the model still holds a range (pane=%s, #1459)', async enabled => {
    vi.stubGlobal('Element', MiniElement);
    const ui = mount(); await paint(); ui.setEnabled(enabled); await paint();
    const words = document.createElement('span'); words.dataset['markId'] = card.markId; ui.block.append(words);
    const native = { isCollapsed: false, anchorNode: words };
    vi.spyOn(window, 'getSelection').mockReturnValue(native as unknown as Selection);
    ui.setRange('range');
    (words as unknown as MiniElement).dispatchEvent({ ...{ type: 'click', bubbles: true, button: 0 } });
    expect(ui.scroll.querySelector('[data-mark-card]')).toBeNull();
    native.isCollapsed = true;
    await paint(); // The fallback frame precedes ProseMirror's queued selectionchange listener.
    if(enabled)expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')!.dataset['selected']).toBe('true');
    else expect(ui.scroll.querySelector('[data-mark-card]')).not.toBeNull();
  });
  it('resolves a paragraph-retargeted click from the native caret rather than the stale model (#1459)', async () => {
    vi.stubGlobal('Element', MiniElement);
    const ui = mount(); await paint(); ui.setCaret(8); ui.setNativeCaret(1);
    vi.spyOn(window, 'getSelection').mockReturnValue({isCollapsed:true,anchorNode:ui.block} as unknown as Selection);
    (ui.block as unknown as MiniElement).dispatchEvent({...{type:'click',bubbles:true,button:0}}); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')!.dataset['selected']).toBe('true');
  });
  it('expires a native drag decision after one frame, so a later caret cannot activate it (#1459)', async () => {
    vi.stubGlobal('Element', MiniElement);
    const ui = mount(); await paint(); ui.setEnabled(false); await paint();
    const words = document.createElement('span'); words.dataset['markId'] = card.markId; ui.block.append(words);
    const native = { isCollapsed: false, anchorNode: words };
    vi.spyOn(window, 'getSelection').mockReturnValue(native as unknown as Selection);
    ui.setRange('range');
    (words as unknown as MiniElement).dispatchEvent({ ...{ type: 'click', bubbles: true, button: 0 } }); await paint();
    native.isCollapsed = true; ui.setRange('none');
    miniDocument.body.dispatchEvent({ type: 'selectionchange' }); await paint();
    expect(ui.scroll.querySelector('[data-mark-card]')).toBeNull();
  });
  it.each(['key', 'press', 'input', 'blur', 'destroy'])('cancels a pending mark decision on %s (#1459)', async cause => {
    vi.stubGlobal('Element', MiniElement);
    const ui = mount(); await paint(); ui.setEnabled(false); await paint();
    const words = document.createElement('span'); words.dataset['markId'] = card.markId; ui.block.append(words);
    (words as unknown as MiniElement).dispatchEvent({ ...{ type: 'click', bubbles: true, button: 0 } });
    if(cause==='key')miniDocument.body.dispatchEvent({type:'keydown',key:'a'});
    if(cause==='press')miniDocument.body.dispatchEvent({...{type:'pointerdown',button:0}});
    if(cause==='input')miniDocument.body.dispatchEvent({type:'beforeinput'});
    if(cause==='blur')for(const [,listener] of vi.mocked(window.addEventListener).mock.calls.filter(call=>call[0]==='blur'))(listener as () => void)();
    if(cause==='destroy'){mounted!.destroy();mounted=undefined;}
    await paint();
    expect(ui.scroll.querySelector('[data-mark-card]')).toBeNull();
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
  it('keeps unselected pane scroll and layout frames, and text movement leaves the pane scroll where it is (#1451, #1523)', async () => {
    const ui = mount(); await paint();
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card]')!;
    const paneScroll = ui.pane.querySelector<HTMLElement>('.manuscript-comments-scroll')!;
    const top = node.style.top;
    paneScroll.scrollTop = 100; (paneScroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    expect(node.style.top).toBe(top); expect(paneScroll.scrollTop).toBe(100);
    ui.refresh(); await paint(); expect(node.style.top).toBe(top); expect(paneScroll.scrollTop).toBe(100);
    (ui.scroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint(); expect(paneScroll.scrollTop).toBe(100);
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
  it('meets the words again once the pane is back at its top after a selection scrolled it (#1523)', async () => {
    const ui = mount(); await paint(); await ui.open(); await paint();
    const node = ui.pane.querySelector<HTMLElement>('[data-comment-card]')!;
    const paneScroll = ui.pane.querySelector<HTMLElement>('.manuscript-comments-scroll')!;
    paneScroll.scrollTop = 70; ui.refresh(); await paint();
    (node as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true }); await paint();
    paneScroll.scrollTop = 0; (paneScroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    (ui.scroll as unknown as MiniElement).dispatchEvent({ type: 'scroll' }); await paint();
    expect(node.dataset['selected']).toBe('false'); expect(node.style.top).toBe('8px');
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
    expect(ui.pane.querySelector('[data-mark-state]')?.textContent).toContain('待处理');
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
  it('keeps focused input and enabled controls during a background re-read, replaces the content it brings, then respects viewport removal', async () => {
    const ui = mount(); await paint(); ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click();
    const input = ui.pane.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!; input.value = '刷新期间的草稿'; input.focus(); input.setSelectionRange(2, 4);
    const pending = deferred<EditorialMarkCardProjection>(); ui.get.mockImplementationOnce(() => pending.promise);
    ui.setPage({ journalSequence: 1, blocks: [{ ...windowOf().blocks[0]!, digest: 'typed' }], marks: [anchor()] }); await paint();
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')?.hidden).toBe(false);
    expect(document.activeElement).toBe(input); expect(input.value).toBe('刷新期间的草稿');
    expect(ui.pane.querySelector<HTMLElement>('[data-comment-card]')?.dataset['revalidating']).toBe('false');
    expect(ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')?.disabled).toBe(false);
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
    expect(full.querySelector('[data-mark-application]')?.textContent).toContain('已接受 · 已写入稿件');
    expect(full.querySelector('[data-mark-state]')?.textContent).toBe('已接受');
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

  // 上一条 / 下一条待处理, the card keys, 接受 / 拒绝 on a compact card and the Book's count (Issue #1523).
  const row = (pane: HTMLElement, id: string) => pane.querySelector<HTMLElement>(`[data-comment-card="${id}"]`)!;
  const selectedCard = (pane: HTMLElement) => pane.querySelector<HTMLElement>('[data-comment-card][data-selected="true"]')?.dataset['commentCard'];
  const literaryCard = (markId: string, fromGrapheme: number): EditorialMarkCardProjection => ({ ...card, markId, fromGrapheme, toGrapheme: fromGrapheme + 2,
    categoryKey: 'literary', categoryLabel: '文学性与表达', source: { ...card.source, kind: 'ai7', origin: 'review-category', label: '文学性与表达改进' } });
  const atPage = (blockId: string, position: number, startCharacter: number) => ({
    blocks: [{ blockId, kind: 'paragraph', text: '公开合成测试段落', digest: blockId, position }],
    position: { startCharacter, endCharacter: startCharacter + 10, totalCharacters: 1000 },
  }) as unknown as Pick<ManuscriptWindowProjection, 'blocks' | 'position'>;
  it('steps to the next and previous pending card in reading order, past handled ones and through the filter (#1523)', async () => {
    const handled = { ...card, markId: 'handled', fromGrapheme: 2, toGrapheme: 3, status: 'resolved' as const };
    const second = { ...card, markId: 'second', fromGrapheme: 3, toGrapheme: 5 };
    const ui = mount(card, [handled, second, literaryCard('literary', 6)]); await paint(); await ui.open(); await paint();
    const step = (direction: string) => ui.pane.querySelector<HTMLButtonElement>(`[data-pending-step="${direction}"]`)!.click();
    step('next'); await paint(); expect(selectedCard(ui.pane)).toBe('second'); expect(document.activeElement).toBe(row(ui.pane, 'second'));
    step('next'); await paint(); expect(selectedCard(ui.pane)).toBe('literary');
    step('previous'); await paint(); expect(selectedCard(ui.pane)).toBe('second');
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-category-filter="literary"]')!.click(); await paint();
    step('previous'); await paint(); expect(selectedCard(ui.pane)).toBe('literary');
    step('next'); await paint();
    expect(selectedCard(ui.pane)).toBe('literary'); expect(ui.status).toHaveBeenLastCalledWith('按当前筛选，后面没有待处理的了。', 'success');
  });
  it('crosses to the nearest later page holding a match, keeps that card selected, and says so without moving when none does (#1523)', async () => {
    const far = { ...card, markId: 'far', blockId: 'far-block' }, skipped = { ...literaryCard('skipped', 0), blockId: 'mid-block' };
    let ui!: ReturnType<typeof mount>;
    const pages: Record<string, ReturnType<typeof atPage> & { marks: EditorialMarkAnchorProjection[] }> = {
      'mid-block': { ...atPage('mid-block', 40, 400), marks: [anchor(skipped)] }, 'far-block': { ...atPage('far-block', 80, 800), marks: [anchor(far)] },
    };
    const windowAt = vi.fn(async (blockId: string) => pages[blockId]!);
    const go = vi.fn(async (blockId: string) => { ui.setPage({ ...pages[blockId]! }); return true; });
    const places = [{ blockId: 'block', proportion: 0.001 }, { blockId: 'mid-block', proportion: 0.4 }, { blockId: 'far-block', proportion: 0.8 }];
    ui = mount(card, [far, skipped], { bookPending: { read: () => ({ places, truncated: false }), windowAt, go } });
    const paragraph = document.createElement('p'); paragraph.dataset['blockId'] = 'far-block'; ui.host.append(paragraph);
    ui.setPage({ ...atPage('block', 1, 0), marks: [anchor()] }); await paint(); await ui.open(); await paint();
    expect(ui.pane.querySelector('[data-comments-book-pending]')?.textContent).toBe('全书待处理 3');
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-category-filter="editor"]')!.click(); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click(); await paint();
    expect(windowAt.mock.calls.map((call) => call[0])).toEqual(['mid-block', 'far-block']); expect(go.mock.calls).toEqual([['far-block']]);
    expect(selectedCard(ui.pane)).toBe('far'); expect(document.activeElement).toBe(row(ui.pane, 'far'));
    ui.refresh(); await paint(); expect(selectedCard(ui.pane)).toBe('far');
    ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click(); await paint();
    expect(go).toHaveBeenCalledTimes(1); expect(selectedCard(ui.pane)).toBe('far');
    expect(ui.status).toHaveBeenLastCalledWith('按当前筛选，后面没有待处理的了。', 'success');
  });
  it('keeps a card brought forward under a keyword filter selected while its words are still being read (#1523)', async () => {
    const far = { ...card, markId: 'far', blockId: 'far-block', body: '公开合成跨页批注' };
    const page = { ...atPage('far-block', 80, 800), marks: [anchor(far)] };
    let ui!: ReturnType<typeof mount>;
    const go = vi.fn(async () => { ui.setPage({ ...page }); return true; });
    ui = mount(card, [], { bookPending: { read: () => ({ places: [{ blockId: 'far-block', proportion: 0.8 }], truncated: false }), windowAt: async () => page, go } });
    const paragraph = document.createElement('p'); paragraph.dataset['blockId'] = 'far-block'; ui.host.append(paragraph);
    ui.setPage({ ...atPage('block', 1, 0), marks: [anchor()] }); await paint();
    const held = deferred<EditorialMarkCardProjection>(); let farReads = 0;
    ui.get.mockImplementation(async (input: { markId: string }) => input.markId !== 'far' ? card : ++farReads === 1 ? far : held.promise);
    const search = ui.pane.querySelector<HTMLInputElement>('[data-mark-search-input]')!;
    search.value = '跨页'; (search as unknown as MiniElement).dispatchEvent({ type: 'input' }); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click(); await paint();
    expect(go).toHaveBeenCalledTimes(1);
    held.resolve(far); await paint();
    expect(selectedCard(ui.pane)).toBe('far'); expect(document.activeElement).toBe(row(ui.pane, 'far'));
  });
  // Review round 1 (#1523): where a decision goes next, a walk that meets a stale result, and the selection across the jump.
  const rejectedOf = (value: EditorialMarkCardProjection): EditorialMarkCardProjection => ({ ...value, status: 'resolved',
    suggestion: { ...value.suggestion!, decision: { disposition: 'rejected' } as never } });
  const twoPages = (farMarks: EditorialMarkAnchorProjection[], places = [{ blockId: 'far-block', proportion: 0.8 }]) => {
    const far = { ...atPage('far-block', 80, 800), marks: farMarks };
    let ui!: ReturnType<typeof mount>;
    const windowAt = vi.fn(async () => far);
    const go = vi.fn(async () => { ui.setPage({ ...far }); return true; });
    return { far, windowAt, go, bookPending: { read: () => ({ places, truncated: false }), windowAt, go }, bind: (mounted: ReturnType<typeof mount>) => { ui = mounted; } };
  };
  it('walks on across pages after a keyboard decision on the page\'s last match, from where the decided card stood (#1523)', async () => {
    const farCard = { ...suggestion, markId: 'far', blockId: 'far-block' };
    const pages = twoPages([anchor(farCard)]);
    const ui = mount(suggestion, [farCard], { bookPending: pages.bookPending }); pages.bind(ui);
    const paragraph = document.createElement('p'); paragraph.dataset['blockId'] = 'far-block'; ui.host.append(paragraph);
    ui.setPage({ ...atPage('block', 1, 0), marks: [anchor(suggestion)] }); await paint(); await ui.open(); await paint();
    const rejected = rejectedOf(suggestion);
    ui.decide.mockImplementationOnce(async () => ({ markId: 'comment', card: rejected, marks: [anchor(rejected)], marksTruncated: false }));
    // Enter or Space on the card's own 拒绝: a click with no pointer behind it.
    (row(ui.pane, 'comment').querySelector('[data-mark-action="reject"]') as unknown as MiniElement).dispatchEvent({ ...{ type: 'click', bubbles: true, detail: 0, isTrusted: true } }); await paint();
    expect(pages.go.mock.calls).toEqual([['far-block']]);
    expect(selectedCard(ui.pane)).toBe('far'); expect(document.activeElement).toBe(row(ui.pane, 'far'));
  });
  it('keeps a pointer decision on the page: the card stays and 下一条待处理 is offered, and the Book\'s end is said once (#1523)', async () => {
    const farCard = { ...suggestion, markId: 'far', blockId: 'far-block' };
    const pages = twoPages([anchor(farCard)]);
    const ui = mount(suggestion, [farCard], { bookPending: pages.bookPending }); pages.bind(ui);
    const paragraph = document.createElement('p'); paragraph.dataset['blockId'] = 'far-block'; ui.host.append(paragraph);
    ui.setPage({ ...atPage('block', 1, 0), marks: [anchor(suggestion)] }); await paint(); await ui.open(); await paint();
    const rejected = rejectedOf(suggestion);
    ui.decide.mockImplementationOnce(async () => ({ markId: 'comment', card: rejected, marks: [anchor(rejected)], marksTruncated: false }));
    row(ui.pane, 'comment').querySelector<HTMLButtonElement>('[data-mark-action="reject"]')!.click(); await paint();
    const next = ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!;
    expect(pages.go).not.toHaveBeenCalled(); expect(selectedCard(ui.pane)).toBe('comment');
    expect(next.dataset['offered']).toBe('true'); expect(ui.status).toHaveBeenLastCalledWith('本页没有待处理的了；点「下一条待处理」到后面继续。', 'success');
    next.click(); await paint();
    expect(next.dataset['offered']).toBeUndefined(); expect(pages.go).toHaveBeenCalledTimes(1); expect(selectedCard(ui.pane)).toBe('far');
    const last = rejectedOf(farCard);
    ui.decide.mockImplementationOnce(async () => ({ markId: 'far', card: last, marks: [anchor(last)], marksTruncated: false }));
    const ends = ui.status.mock.calls.length;
    row(ui.pane, 'far').querySelector<HTMLButtonElement>('[data-mark-action="reject"]')!.click(); await paint();
    expect(ui.status.mock.calls.slice(ends).filter((call) => call[0] === '后面没有待处理的了。')).toHaveLength(1);
    expect(next.dataset['offered']).toBeUndefined(); expect(pages.go).toHaveBeenCalledTimes(1);
  });
  it('walks past a mark decided while its page loaded, and counts the card reads inside one page against the bound (#1523)', async () => {
    const gone = { ...card, markId: 'gone', blockId: 'far-block', body: '公开合成跨页批注' };
    const after = { ...card, markId: 'after', blockId: 'far-block', fromGrapheme: 4, toGrapheme: 6, body: '公开合成跨页批注' };
    const pages = twoPages([anchor(gone), anchor(after)]);
    pages.go.mockImplementation(async () => { ui.setPage({ ...pages.far, marks: [{ ...anchor(gone), status: 'resolved' }, anchor(after)] }); return true; });
    const ui = mount(card, [gone, after], { bookPending: pages.bookPending }); pages.bind(ui);
    const paragraph = document.createElement('p'); paragraph.dataset['blockId'] = 'far-block'; ui.host.append(paragraph);
    ui.setPage({ ...atPage('block', 1, 0), marks: [anchor()] }); await paint();
    const search = ui.pane.querySelector<HTMLInputElement>('[data-mark-search-input]')!;
    search.value = '跨页'; (search as unknown as MiniElement).dispatchEvent({ type: 'input' }); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click(); await paint();
    expect(selectedCard(ui.pane)).toBe('after');
    const many = Array.from({ length: 70 }, (_, index) => ({ ...anchor(), markId: `many-${index}`, blockId: 'far-block', fromGrapheme: index, toGrapheme: index + 1 }));
    const crowded = twoPages(many);
    mounted?.destroy(); mounted = undefined;
    const other = mount(card, [], { bookPending: crowded.bookPending }); crowded.bind(other);
    other.setPage({ ...atPage('block', 1, 0), marks: [anchor()] }); await paint();
    const field = other.pane.querySelector<HTMLInputElement>('[data-mark-search-input]')!;
    field.value = '没有这个词'; (field as unknown as MiniElement).dispatchEvent({ type: 'input' }); await paint();
    const reads = other.get.mock.calls.length;
    other.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click();
    for (let turn = 0; turn < 12; turn++) await paint();
    expect(other.get.mock.calls.length - reads).toBe(60); expect(crowded.go).not.toHaveBeenCalled();
    expect(other.status).toHaveBeenLastCalledWith('按当前筛选，后面最近的 1 处待处理的位置都不匹配；没有移动。', 'success');
  });
  it('judges a keyword on the card as it is once its page arrived, and walks on when its words changed meanwhile (#1523)', async () => {
    const target = { ...card, markId: 'target', blockId: 'far-block', body: '公开合成跨页批注' };
    const later = { ...card, markId: 'later', blockId: 'far-block', fromGrapheme: 4, toGrapheme: 6, body: '公开合成跨页批注' };
    const pages = twoPages([anchor(target), anchor(later)]);
    let edited = false;
    pages.go.mockImplementation(async () => { edited = true; ui.setPage({ ...pages.far }); return true; });
    const ui = mount(card, [target, later], { bookPending: pages.bookPending }); pages.bind(ui);
    ui.get.mockImplementation(async (input: { markId: string }) => input.markId === 'target' ? (edited ? { ...target, body: '公开合成另一段批注' } : target) : input.markId === 'later' ? later : card);
    const paragraph = document.createElement('p'); paragraph.dataset['blockId'] = 'far-block'; ui.host.append(paragraph);
    ui.setPage({ ...atPage('block', 1, 0), marks: [anchor()] }); await paint();
    const search = ui.pane.querySelector<HTMLInputElement>('[data-mark-search-input]')!;
    search.value = '跨页'; (search as unknown as MiniElement).dispatchEvent({ type: 'input' }); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click();
    for (let turn = 0; turn < 4; turn++) await paint();
    expect(pages.go).toHaveBeenCalledTimes(1);
    expect(selectedCard(ui.pane)).toBe('later'); expect(document.activeElement).toBe(row(ui.pane, 'later'));
  });
  it('holds the selection across the jump: neither the arrival\'s caret nor a refused load takes it (#1523)', async () => {
    vi.stubGlobal('Element', MiniElement);
    const farCard = { ...card, markId: 'far', blockId: 'far-block' };
    const pages = twoPages([anchor(farCard)]);
    const ui = mount(card, [farCard], { bookPending: pages.bookPending }); pages.bind(ui);
    const paragraph = document.createElement('p'); paragraph.dataset['blockId'] = 'far-block'; ui.host.append(paragraph);
    ui.setPage({ ...atPage('block', 1, 0), marks: [anchor()] }); await paint(); await ui.open(); await paint();
    vi.stubGlobal('document', Object.assign(Object.create(document), { getSelection: () => ({ anchorNode: ui.block }) }));
    const caretMoves = () => { ui.host.focus(); ui.setCaret(8); miniDocument.body.dispatchEvent({ type: 'selectionchange' }); };
    // The load is refused after the editor took focus and placed its caret: the card selected before stays selected.
    pages.go.mockImplementationOnce(async () => { caretMoves(); return false; });
    ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click(); await paint();
    expect(selectedCard(ui.pane)).toBe('comment');
    // The arrival's caret lands after the card was brought forward, before focus reaches it.
    ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click();
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    caretMoves(); await paint();
    expect(pages.go).toHaveBeenCalledTimes(2); expect(selectedCard(ui.pane)).toBe('far');
  });
  it('gives a compact 修改建议\'s 接受 and 拒绝 their own place beside its preview line (#1523)', async () => {
    const ui = mount(suggestion); await paint();
    const line = row(ui.pane, 'comment').querySelector<HTMLElement>('.editorial-mark-compact-line')!;
    expect(Array.from(line.children, (child) => child.className)).toEqual(['editorial-mark-compact-preview', 'editorial-mark-quick-actions']);
  });
  it('stops reading beyond the page at its bound and says so without moving (#1523)', async () => {
    const places = Array.from({ length: 30 }, (_, index) => ({ blockId: `later-${index}`, proportion: 0.1 + index / 100 }));
    const windowAt = vi.fn(async (blockId: string) => ({ ...atPage(blockId, 10 + places.findIndex((place) => place.blockId === blockId), 100), marks: [{ ...anchor(literaryCard(`m-${blockId}`, 0)), blockId }] }));
    const go = vi.fn(async () => true);
    const ui = mount(card, [], { bookPending: { read: () => ({ places, truncated: true }), windowAt, go } });
    ui.setPage({ ...atPage('block', 1, 0), marks: [anchor()] }); await paint(); await ui.open(); await paint();
    expect(ui.pane.querySelector('[data-comments-book-pending]')?.textContent).toBe('全书待处理 30+');
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-category-filter="editor"]')!.click(); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-pending-step="next"]')!.click(); await paint();
    expect(windowAt).toHaveBeenCalledTimes(20); expect(go).not.toHaveBeenCalled();
    expect(ui.status).toHaveBeenLastCalledWith('按当前筛选，后面最近的 20 处待处理的位置都不匹配；没有移动。', 'success');
  });
  it('decides a focused card with A and R through its own buttons, never from a field or while composing, then focuses the next (#1523)', async () => {
    const second = { ...suggestion, markId: 'second', fromGrapheme: 3, toGrapheme: 5 }, third = { ...suggestion, markId: 'third', fromGrapheme: 6, toGrapheme: 8 };
    const ui = mount(suggestion, [second, third]); await paint();
    const decided: Record<string, EditorialMarkCardProjection> = {
      comment: { ...suggestion, status: 'applied' }, second: { ...second, status: 'resolved', suggestion: { ...second.suggestion!, decision: { disposition: 'rejected' } as never } },
    };
    const done = new Set<string>();
    const answer = (markId: string) => {
      done.add(markId);
      const marks = [suggestion, second, third].map((value) => anchor(done.has(value.markId) ? decided[value.markId]! : value));
      return { markId, card: decided[markId]!, marks, marksTruncated: false };
    };
    ui.apply.mockImplementationOnce(async () => ({ ...answer('comment'), window: windowOf(), application: {} }));
    ui.decide.mockImplementationOnce(async () => answer('second'));
    const press = (node: HTMLElement, key: string, more: Record<string, unknown> = {}) =>
      (node as unknown as MiniElement).dispatchEvent({ type: 'keydown', key, bubbles: true, ...more });
    const first = row(ui.pane, 'comment'); first.focus(); (first as unknown as MiniElement).dispatchEvent({ type: 'focusin', bubbles: true }); await paint();
    press(first, 'a', { isComposing: true }); press(first, 'a', { keyCode: 229 }); press(first, 'a', { ctrlKey: true }); await paint();
    expect(ui.apply).not.toHaveBeenCalled();
    press(first, 'a'); await paint();
    expect(ui.apply).toHaveBeenCalledTimes(1); expect(ui.apply.mock.calls[0]?.[0]).toMatchObject({ markId: 'comment', interaction: 'accept-and-apply' });
    expect(selectedCard(ui.pane)).toBe('second'); expect(document.activeElement).toBe(row(ui.pane, 'second'));
    press(row(ui.pane, 'second'), 'a', { repeat: true }); press(row(ui.pane, 'second'), 'r', { repeat: true }); await paint();
    expect(ui.apply).toHaveBeenCalledTimes(1); expect(ui.decide).not.toHaveBeenCalled();
    press(row(ui.pane, 'second'), 'r'); await paint();
    expect(ui.decide.mock.calls[0]?.[0]).toMatchObject({ markId: 'second', disposition: 'rejected' });
    expect(selectedCard(ui.pane)).toBe('third');
    const field = document.createElement('textarea'); row(ui.pane, 'third').append(field);
    press(field, 'r', { target: field }); await paint(); expect(ui.decide).toHaveBeenCalledTimes(1);
  });
  it('offers 接受 and 拒绝 on a compact 修改建议 for one click each, and none on an annotation (#1523)', async () => {
    const ui = mount(suggestion, [{ ...card, markId: 'note', fromGrapheme: 4, toGrapheme: 6 }]); await paint();
    const compact = row(ui.pane, 'comment');
    expect(compact.dataset['expanded']).toBe('false');
    expect(Array.from(compact.querySelectorAll('[data-mark-quick]'), (button) => button.textContent)).toEqual(['接受', '拒绝']);
    expect(row(ui.pane, 'note').querySelector('[data-mark-quick]')).toBeNull();
    compact.querySelector<HTMLButtonElement>('[data-mark-quick="reject"]')!.click(); await paint();
    expect(ui.decide).toHaveBeenCalledTimes(1); expect(ui.decide.mock.calls[0]?.[0]).toMatchObject({ markId: 'comment', disposition: 'rejected' });
  });
  it('opens the toolbar 让 AI 修改… on 仅修改所选部分 with words selected and names that scope on the button (#1523)', async () => {
    const entry = document.createElement('button'); entry.textContent = '让 AI 修改…';
    const scopedHost = { api: { getModelServiceSettings: async () => { throw new Error('settings unavailable'); }, inspectAiEditLocks: vi.fn() }, preferences: async () => ({}) };
    const ui = mount(card, [], { scopedAiEdit: { host: scopedHost, sectionOf: () => 'heading', entry } });
    await paint(); ui.setRange('range');
    vi.stubGlobal('document', Object.assign(Object.create(document), { getSelection: () => ({ anchorNode: ui.block }) }));
    miniDocument.body.dispatchEvent({ type: 'selectionchange' });
    expect(entry.textContent).toBe('让 AI 修改所选…'); expect(entry.title).toBe('仅修改所选部分');
    mounted!.composeScopedAiEdit(); await paint();
    const scopes = ui.scroll.querySelectorAll<HTMLInputElement>('[data-scoped-ai-edit-scope]');
    expect(Array.from(scopes, (radio) => [radio.dataset['scopedAiEditScope'], radio.checked])).toEqual([['selected', true], ['section', false], ['document', false]]);
    ui.setRange('none'); miniDocument.body.dispatchEvent({ type: 'selectionchange' });
    expect(entry.textContent).toBe('让 AI 修改本节…'); expect(entry.title).toBe('本节未锁定的段落');
  });

});


it('clips the connector to exposed words and omits wholly covered words (#1470)', () => {
  const words = { left: 540, right: 574, top: 100, height: 24 };
  const pane = { left: 566, right: 900, top: 0, bottom: 681 };
  expect(editorialCommentStart(words)).toEqual({ x: 574, y: 110 });
  expect(editorialCommentStart(words, pane)).toEqual({ x: 565, y: 110 });
  expect(editorialCommentStart({ ...words, left: 566 }, pane)).toBeUndefined();
  expect(editorialCommentStart(words, { ...pane, left: 574 })).toEqual({ x: 574, y: 110 });
  expect(editorialCommentStart(words, { ...pane, bottom: 100 })).toEqual({ x: 574, y: 110 });
  expect(editorialCommentStart(words, { ...pane, left: 539, right: 560 })).toEqual({ x: 574, y: 110 });
  expect(editorialCommentStart({ ...words, left: 565.5 }, pane)?.x).toBe(565.75);
});


it('continues into later exposed fragments and ignores zero-width words (#1470)', () => {
  const pane = { left: 566, right: 900, top: 0, bottom: 681 };
  const covered = { left: 600, right: 700, top: 100, height: 24 };
  const exposed = { left: 300, right: 450, top: 128, height: 24 };
  expect(editorialCommentStartFromFragments([covered, exposed], pane)).toEqual({ x: 450, y: 138 });
  expect(editorialCommentStartFromFragments([covered, exposed, { ...exposed, top: 156 }], pane)).toEqual({ x: 450, y: 138 });
  expect(editorialCommentStartFromFragments([covered, { ...covered, top: 128 }], pane)).toBeUndefined();
  expect(editorialCommentStartFromFragments([], pane)).toBeUndefined();
  expect(editorialCommentStart({ ...exposed, right: exposed.left }, pane)).toBeUndefined();
  expect(editorialCommentStart({ ...exposed, height: 0 }, pane)).toBeUndefined();
  expect(editorialCommentStartFromFragments([{ ...exposed, right: exposed.left }, exposed], pane)).toEqual({ x: 450, y: 138 });
});
