import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialCardCache, mountEditorialMarks, stackEditorialComments } from '../../src/renderer/editorial-marks.js';
import type { EditorialMarkAnchorProjection, EditorialMarkCardProjection, ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

const card: EditorialMarkCardProjection = {
  markId: 'comment', kind: 'annotation', status: 'open', anchorState: 'exact', highlightColor: null,
  blockId: 'block', fromGrapheme: 0, toGrapheme: 2, pinnedText: '合成', body: '公开合成批注', replies: [], basis: [],
  source: { kind: 'editor', origin: null, label: null, taskId: null, editorName: '责编' }, suggestion: null,
  convertedFrom: null, resolvedFrom: null, changedElsewhere: false, conflict: null, exportDisposition: 'exported-by-default',
  createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z',
  pin: { revisionId: 'revision', revisionLabel: '1', journalSequence: 0, blockDigest: 'digest' },
};
const anchor = (value = card): EditorialMarkAnchorProjection => ({
  markId: value.markId, kind: value.kind, blockId: value.blockId, fromGrapheme: value.fromGrapheme, toGrapheme: value.toGrapheme,
  anchorState: value.anchorState === 'exact' ? 'exact' : 'drifted', status: value.status, highlightColor: null, sourceKind: value.source.kind,
  disposition: value.suggestion?.decision?.disposition ?? null, deletedText: null, insertedText: null, conflict: null,
});
const windowOf = (): ManuscriptWindowProjection => ({
  bookId: 'book', manuscriptId: 'manuscript', branchId: 'branch', revisionId: 'revision', journalSequence: 0, workingDigest: 'digest',
  blocks: [{ blockId: 'block', kind: 'paragraph', text: '公开合成测试段落', digest: 'digest', position: 1 }], marks: [anchor()], marksTruncated: false,
} as unknown as ManuscriptWindowProjection);
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

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

// The real pane owner with measured boundary doubles: no Electron or manuscript persistence.
describe('comments command parity and refresh continuity', () => {
  let restore: () => void; let frames: Array<() => void>; let mounted: ReturnType<typeof mountEditorialMarks> | undefined;
  beforeEach(() => {
    restore = installMiniDom(); frames = [];
    const create = miniDocument.createElement;
    vi.spyOn(miniDocument, 'createElement').mockImplementation((tag) => {
      const node = create(tag);
      Object.assign(node, { style: {}, clientHeight: 600, getClientRects: () => [{}], getBoundingClientRect: () => ({ top: 50, bottom: 230, left: 600, right: 920, width: 320, height: 180 }) });
      Object.defineProperty(node, 'firstElementChild', { get: () => node.children[0] ?? null });
      return node;
    });
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), getSelection: () => null });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { frames.push(fn); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('HTMLDetailsElement', MiniElement);
    vi.stubGlobal('HTMLFormElement', MiniElement);
  });
  afterEach(() => { mounted?.destroy(); mounted = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); restore(); });
  async function paint() { for (let n = 0; n < 12; n++) { await Promise.resolve(); frames.splice(0).forEach((fn) => fn()); } }
  function mount(value = card) {
    let page = { ...windowOf(), marks: [anchor(value)] }; let latest = value;
    const host = document.createElement('div'); const scroll = document.createElement('div'); const pane = document.createElement('aside');
    miniDocument.body.append(host as unknown as MiniElement, scroll as unknown as MiniElement, pane as unknown as MiniElement);
    const block = document.createElement('p'); block.dataset['blockId'] = 'block'; host.append(block);
    const get = vi.fn(async () => latest);
    const update = vi.fn(async (input: { action: string; status: 'open' | 'resolved'; body: string }) => {
      latest = input.action === 'reply' ? { ...latest, replies: [{ replyId: 'reply', body: input.body, createdAt: card.createdAt }] } : { ...latest, status: input.status };
      return { markId: latest.markId, card: latest, marks: [anchor(latest)], marksTruncated: false };
    });
    const decide = vi.fn(async (_input: Record<string, unknown>) => ({ markId: latest.markId, card: latest, marks: [anchor(latest)], marksTruncated: false }));
    const apply = vi.fn(async (_input: Record<string, unknown>) => ({ markId: latest.markId, card: latest, marks: [anchor(latest)], marksTruncated: false, window: page, application: {} }));
    const write = vi.fn(async (operation: () => Promise<unknown>) => operation());
    const status = vi.fn();
    const options = { host, scroll, comments: { host: pane, enabled: () => true },
      editor: { currentWindow: () => page, setMarks: (marks: EditorialMarkAnchorProjection[]) => { page = { ...page, marks }; }, setActiveMark: vi.fn(), focus: vi.fn(), selectRange: vi.fn(), selectedRange: () => ({ kind: 'none' }) },
      api: { getEditorialMarkCard: get, updateEditorialMark: update, recordChangeSuggestionDecision: decide, applyChangeSuggestion: apply,
        inspectProposalWorkspace: async () => ({ items: [], offerWorkspace: false }), recordLearningReasonAsk: async () => null },
      busy: () => false, writeManuscript: write, setStatus: status, errorMessage: (_error: unknown, fallback: string) => fallback,
    } as unknown as Parameters<typeof mountEditorialMarks>[0];
    mounted = mountEditorialMarks(options);
    return { host, pane, get, update, decide, apply, write, status, refresh: () => mounted!.refreshComments() };
  }
  it('reuses reply/resolve commands, keeps the actual reply input and caret across a returned-card refresh, and reads once', async () => {
    const ui = mount(); await paint();
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="reply"]')!.click();
    const input = ui.pane.querySelector<HTMLTextAreaElement>('[data-comment-reply]')!;
    input.value = '尚未发送的答复'; input.focus(); input.setSelectionRange(2, 4);
    ui.pane.querySelector<HTMLButtonElement>('[data-mark-action="resolve"]')!.click(); await paint();
    expect(ui.update.mock.calls[0]?.[0]).toMatchObject({ action: 'set-status', status: 'resolved', markId: card.markId });
    expect(ui.pane.querySelector('[data-comment-reply]')).toBe(input);
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
});
