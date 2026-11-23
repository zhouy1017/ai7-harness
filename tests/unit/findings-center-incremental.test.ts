import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountFindingsCenter } from '../../src/renderer/findings-center.js';
import type { BookFindingProjection, BookFindingsReadProjection, InspectBookFindingsInput, RendererApi } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

const token = (letter: string) => letter.repeat(64);
function finding(id: string, category = 'review:typos-and-usage'): BookFindingProjection {
  return { id, category, categoryLabel: '审阅', severity: '提示', status: '待处理', summary: '公开合成发现',
    target: { kind: 'review', reviewRunId: 'run', findingId: id, blockId: 'block' },
    place: { manuscriptId: 'manuscript', branchId: 'branch', reviewRunId: 'run', ordinal: 7, blockId: 'block', markId: 'mark', blockExists: true },
    decision: { kind: 'ignore', input: { bookId: 'book', reviewRunId: 'run', findingId: id, disposition: 'ignored', reason: '编辑决定忽略' } } };
}
function page(all: BookFindingProjection[], input: InspectBookFindingsInput = {}): BookFindingsReadProjection {
  const filters = input.filters ?? {};
  const items = all.filter((item) => (!filters.category || filters.category === item.category) && (!filters.severity || filters.severity === item.severity) && (!filters.status || filters.status === item.status));
  const count = items.filter((item) => item.suggestion?.batchAllowed).length;
  return { bookId: 'book', total: items.length, items, offset: 0, next: null, pageSize: 40, version: token('a'), unchanged: false,
    groups: [...new Set(all.map((item) => item.category))].map((category) => ({ category, label: category, count: all.filter((item) => item.category === category).length, bySeverity: { '提示': all.length }, byStatus: { '待处理': all.length } })),
    batch: { count, sentence: count ? `将把所列 ${count} 条修改建议写入稿件。` : null } };
}

let restore: () => void;
let root: MiniElement;
beforeEach(() => {
  restore = installMiniDom(); vi.useFakeTimers(); miniDocument.visibilityState = 'visible';
  vi.stubGlobal('window', { setInterval, clearInterval });
  root = miniDocument.createElement('section'); miniDocument.body.append(root);
});
afterEach(() => { root.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); miniDocument.visibilityState = 'visible'; restore(); });
const host = () => root as unknown as HTMLElement;
const flush = () => vi.advanceTimersByTimeAsync(0);

it('sends one whole read per visible tick and retains every DOM node on unchanged answers', async () => {
  const initial = page([finding('one')]);
  const read = vi.fn<RendererApi['inspectBookFindings']>().mockResolvedValueOnce(initial)
    .mockResolvedValue({ ...initial, version: token('b'), unchanged: true, items: [] });
  mountFindingsCenter(host(), read, vi.fn()); await flush();
  expect(read).toHaveBeenLastCalledWith({ whole: true, filters: { category: '', severity: '', status: '' } });
  const row = root.querySelector('[data-finding-id]'); const replace = vi.spyOn(root, 'replaceChildren');
  const button = row!.querySelector('button')!; button.focus(); root.scrollTop = 67;
  await vi.advanceTimersByTimeAsync(2000);
  expect(read).toHaveBeenLastCalledWith({ whole: true, since: token('a'), filters: { category: '', severity: '', status: '' } });
  await vi.advanceTimersByTimeAsync(2000);
  expect(read).toHaveBeenLastCalledWith({ whole: true, since: token('b'), filters: { category: '', severity: '', status: '' } });
  expect(read).toHaveBeenCalledTimes(3); expect(replace).not.toHaveBeenCalled();
  expect(root.querySelector('[data-finding-id]')).toBe(row); expect(document.activeElement).toBe(button); expect(root.scrollTop).toBe(67);
  miniDocument.visibilityState = 'hidden'; await vi.advanceTimersByTimeAsync(4000); expect(read).toHaveBeenCalledTimes(3);
  root.remove(); await vi.advanceTimersByTimeAsync(2000); expect(vi.getTimerCount()).toBe(0);
});

it('discards a stale poll and reads the selected filters with the displayed version', async () => {
  const all = [finding('one'), finding('two', 'review:series-consistency')];
  let finish!: (value: BookFindingsReadProjection) => void;
  const read = vi.fn<RendererApi['inspectBookFindings']>().mockResolvedValueOnce(page(all))
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockImplementation(async (input) => page(all, input));
  mountFindingsCenter(host(), read, vi.fn()); await flush(); await vi.advanceTimersByTimeAsync(2000);
  root.querySelector('[data-filter-value="review:series-consistency"]')!.click();
  expect(root.querySelectorAll('[data-finding-id]').map((row) => row.dataset['findingId'])).toEqual(['two']);
  finish({ ...page(all), version: token('b') }); await flush();
  expect(read).toHaveBeenLastCalledWith({ whole: true, since: token('a'), filters: { category: 'review:series-consistency', severity: '', status: '' } });
  expect(read).toHaveBeenCalledTimes(3);
  expect(root.querySelectorAll('[data-finding-id]').map((row) => row.dataset['findingId'])).toEqual(['two']);
});

it('keeps the filters available when a selected view becomes empty', async () => {
  let all = [finding('one'), finding('two', 'review:series-consistency')];
  const read = vi.fn(async (input: InspectBookFindingsInput) => page(all, input));
  mountFindingsCenter(host(), read, vi.fn()); await flush();
  root.querySelector('[data-filter-value="review:series-consistency"]')!.click(); await flush();
  all = [all[0]!]; await vi.advanceTimersByTimeAsync(2000);
  expect(root.querySelector('.findings-empty')).toBeNull(); expect(root.textContent).toContain('当前筛选下没有发现。');
  root.querySelector('[data-findings-filter="category"] [data-filter-value=""]')!.click(); await flush();
  expect(root.querySelector('[data-finding-id]')?.dataset['findingId']).toBe('one');
});

it('maps the row place directly to the manuscript callback and disables deleted blocks', async () => {
  const live = finding('live'); const removed = finding('removed'); removed.place!.blockExists = false;
  const open = vi.fn(); const goToText = vi.fn(async () => undefined);
  mountFindingsCenter(host(), async () => page([live, removed]), open, undefined, undefined, goToText); await flush();
  root.querySelector('[data-finding-id="live"] [data-action="finding-text"]')!.click();
  expect(goToText).toHaveBeenCalledWith({ ordinal: 7, manuscriptId: 'manuscript', branchId: 'branch', blockId: 'block', markId: 'mark' });
  expect(open).not.toHaveBeenCalled();
  const disabled = root.querySelector('[data-finding-id="removed"] [data-action="finding-text"]')!;
  expect(disabled.disabled).toBe(true); expect(disabled.title).toBe('这段文字所在的段落已不在当前稿件中。');
  disabled.click(); expect(goToText).toHaveBeenCalledOnce();
});

it.each(['ignore', 'reject'] as const)('records the row %s and refreshes while retaining scroll and moving focus to the next row', async (kind) => {
  const row = finding('one');
  if (kind === 'reject') row.decision = { kind, input: { manuscriptId: 'manuscript', branchId: 'branch', windowStartBlockId: 'block', markId: 'mark', disposition: 'rejected', editedText: null, reason: null } };
  let all = [row, finding('two')];
  const record = vi.fn(async () => { all = all.slice(1); });
  const getManuscriptWindow = vi.fn(async () => undefined);
  vi.stubGlobal('window', { setInterval, clearInterval, ai7: { recordReviewFindingDisposition: record, recordChangeSuggestionDecision: record, getManuscriptWindow } });
  const read = vi.fn(async (input: InspectBookFindingsInput) => page(all, input));
  mountFindingsCenter(host(), read, vi.fn()); await flush();
  const button = root.querySelector('[data-action="finding-decision"]')!;
  expect(button.textContent).toBe(kind === 'ignore' ? '忽略' : '拒绝'); button.focus(); root.scrollTop = 85; button.click(); await flush();
  expect(record).toHaveBeenCalledWith(kind === 'ignore' ? { reviewRunId: 'run', findingId: 'one', disposition: 'ignored', reason: '编辑决定忽略' } : { ...row.decision!.input, clientDecisionId: expect.stringMatching(/^[a-f0-9-]{36}$/u) });
  if (kind === 'reject') {
    expect(getManuscriptWindow).toHaveBeenCalledWith({ manuscriptId: 'manuscript', branchId: 'branch', cursor: null });
    expect(getManuscriptWindow.mock.invocationCallOrder[0]).toBeLessThan(record.mock.invocationCallOrder[0]!);
  } else expect(getManuscriptWindow).not.toHaveBeenCalled();
  expect(read).toHaveBeenLastCalledWith({ whole: true, since: token('a'), filters: { category: '', severity: '', status: '' } });
  expect(root.querySelector('[data-finding-id="one"]')).toBeNull(); expect(root.scrollTop).toBe(85);
  expect(document.activeElement).toBe(root.querySelector('[data-finding-id="two"] [data-action="finding-decision"]'));
});

it('leaves a refused decision retryable and offers no decision for a row without one', async () => {
  const row = finding('none'); row.decision = null;
  const initial = page([finding('one'), row]); const record = vi.fn().mockRejectedValue(new Error('refused'));
  vi.stubGlobal('window', { setInterval, clearInterval, ai7: { recordReviewFindingDisposition: record } });
  const read = vi.fn<RendererApi['inspectBookFindings']>().mockResolvedValueOnce(initial).mockResolvedValue({ ...initial, items: [], unchanged: true });
  mountFindingsCenter(host(), read, vi.fn()); await flush();
  const button = root.querySelector('[data-action="finding-decision"]')!; button.focus(); button.click(); await flush();
  expect(root.querySelectorAll('[data-action="finding-decision"]')).toHaveLength(1);
  expect(button.disabled).toBe(false); expect(document.activeElement).toBe(button);
  expect(root.querySelector('[role="alert"]')?.textContent).toBe('未能完成处理，请重试。');
});

it('confirms hundreds of suggestions with only the service sentence and applies the full selection', async () => {
  const all = Array.from({ length: 501 }, (_, index) => ({ ...finding(String(index)), suggestion: { manuscriptId: 'manuscript', branchId: 'branch', markId: `mark-${index}`, blockId: 'block', batchAllowed: true, quote: '合成原文', replacement: '合成修订' } }));
  const answer = page(all); answer.batch.sentence = '将把当前筛选下的 501 条修改建议写入稿件。';
  const read = vi.fn(async () => answer); const apply = vi.fn(async () => undefined);
  mountFindingsCenter(host(), read, vi.fn(), apply); await flush(); root.querySelector('[data-findings-batch]')!.click();
  expect(root.querySelectorAll('.findings-confirm p')).toHaveLength(1);
  expect(root.querySelector('.findings-confirm p')?.textContent).toBe(answer.batch.sentence);
  expect(root.querySelector('.findings-confirm')?.textContent).not.toContain('合成原文');
  await vi.advanceTimersByTimeAsync(2000); expect(read).toHaveBeenCalledOnce();
  root.querySelectorAll('.findings-confirm button').find((button) => button.textContent === '确认应用')!.click();
  expect(apply).toHaveBeenCalledWith(all); await flush();
});
