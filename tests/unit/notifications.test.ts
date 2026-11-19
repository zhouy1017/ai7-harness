import { NavigationGeneration } from '../../src/renderer/navigation-generation.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGlobalAttentionReader } from '../../src/renderer/global-attention.js';
import { createNotifier } from '../../src/main/notifications.js';
import { createNotificationObserver, createStatusSurface, mountAttentionNotice, mountQuietNotice, openCurrentBookCompletion, reportResult } from '../../src/renderer/notifications.js';
import { mountAttentionPill } from '../../src/renderer/global-attention.js';
import { mountTaskNotices } from '../../src/renderer/task-notices.js';
import { composeTaskOverview } from '../../src/service/task-overview.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { attentionKind, attentionLabel, completionLabel, NOTIFICATION_LABELS, notificationClass, systemNoticeText } from '../../src/renderer/notification-labels.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import type { GlobalAttentionItemProjection, GlobalAttentionProjection, TaskOverviewProjection } from '../../src/shared/protocol.js';

const START = Date.parse('2026-10-17T10:00:00Z');
function item(overrides: Partial<GlobalAttentionItemProjection> = {}): GlobalAttentionItemProjection {
  return {
    itemId: 'analysis:synthetic-task', group: 'decisions', state: 'analysis-clarification', blocked: false,
    at: new Date(START + 1_000).toISOString(), book: { bookId: 'synthetic-book', title: 'Synthetic private title' },
    object: { kind: 'analysis', mode: 'first-baseline' }, facts: { progress: null, categories: [], revisionOrdinal: null }, nextStep: 'view-run',
    target: { kind: 'analysis', bookId: 'synthetic-book', taskIntentId: 'synthetic-task' }, technical: [], ...overrides,
  };
}
function projection(items: GlobalAttentionItemProjection[]): GlobalAttentionProjection {
  return { groups: ['exceptions', 'decisions', 'active', 'recent'].map((key) => ({
    key: key as GlobalAttentionItemProjection['group'], items: items.filter((entry) => entry.group === key), total: items.filter((entry) => entry.group === key).length,
  })), actionableCount: items.filter((entry) => ['exceptions', 'decisions'].includes(entry.group)).length, running: false, processing: { state: 'local' } };
}
function setup() {
  let prefs = { ...preferenceDefaults(), 'notifications.enabled': true };
  let focused = false;
  const notices: { input: { title: string; body: string; silent: boolean }; show: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; click: () => void }[] = [];
  const navigate = vi.fn();
  const notifier = createNotifier({
    startedAt: START, preferences: () => prefs, focused: () => focused, navigate,
    factory: (input) => {
      const notice = { input, show: vi.fn(), close: vi.fn(), click: () => {} };
      notices.push(notice);
      return { ...notice, on: (_event, listener) => { notice.click = listener; } };
    },
  });
  return { notifier, notices, navigate, prefs: (change: Partial<typeof prefs>) => { prefs = { ...prefs, ...change }; }, focus: (value: boolean) => { focused = value; } };
}
afterEach(() => vi.restoreAllMocks());

it('keeps a delayed completion on its Book and opens only while that Book is still current', async () => {
  const restore = installMiniDom();
  try {
    const event = item({ group: 'recent', state: 'analysis-completed' });
    const overview = composeTaskOverview(projection([event]), 2, () => null);
    let currentBookId = event.book.bookId;
    let release!: (value: TaskOverviewProjection) => void;
    const reading = new Promise<TaskOverviewProjection>((resolve) => { release = resolve; });
    const open = vi.fn();
    const options = { allowed: (event: GlobalAttentionItemProjection) => event.book.bookId === currentBookId, enabled: () => true, navigation: new NavigationGeneration().route(), read: () => reading, open };
    const pending = openCurrentBookCompletion(event, options);
    currentBookId = 'another-book'; release(overview); await pending;
    expect(open).not.toHaveBeenCalled();
    currentBookId = event.book.bookId;
    await openCurrentBookCompletion(event, options);
    expect(open).toHaveBeenCalledExactlyOnceWith(overview.groups.find((group) => group.key === 'recent')!.items[0]);
  } finally { restore(); }
});

it('keeps manuscript focus when a current-Book completion arrives or finishes reading', async () => {
  const restore = installMiniDom();
  try {
    const editor = miniDocument.createElement('div'); editor.dataset['testid'] = 'manuscript-editor';
    const text = miniDocument.createElement('span'); editor.append(text);
    const elsewhere = miniDocument.createElement('button'); miniDocument.body.append(editor, elsewhere);
    const event = item({ group: 'recent', state: 'analysis-completed' });
    const overview = composeTaskOverview(projection([event]), 2, () => null);
    let release!: (value: TaskOverviewProjection) => void;
    const reading = new Promise<TaskOverviewProjection>((resolve) => { release = resolve; });
    const read = vi.fn(() => reading); const open = vi.fn();
    const options = { allowed: (next: GlobalAttentionItemProjection) => next.book.bookId === event.book.bookId, enabled: () => true, navigation: new NavigationGeneration().route(), read, open };
    text.focus();
    await openCurrentBookCompletion(event, { ...options, read: async () => overview });
    expect(open).not.toHaveBeenCalled();
    elsewhere.focus();
    const pending = openCurrentBookCompletion(event, options);
    text.focus(); release(overview); await pending;
    expect(read).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    expect(miniDocument.activeElement).toBe(text);
    elsewhere.focus();
    await openCurrentBookCompletion(event, options);
    expect(open).toHaveBeenCalledOnce();
  } finally { restore(); }
});

describe('privacy-safe main notifications', () => {
  it('shows generic silent actionable text when unfocused, and only navigates on click', () => {
    const test = setup();
    const event = item();
    const before = structuredClone(event);
    test.notifier.accept(event);
    expect(test.notices[0]?.input).toEqual({ title: 'AI7', body: 'AI7：有一项需要你处理', silent: true });
    expect(test.notices[0]?.show).toHaveBeenCalledOnce();
    test.notices[0]?.click();
    expect(test.navigate).toHaveBeenCalledWith({ bookId: event.book.bookId, eventId: event.itemId, target: event.target });
    expect(event).toEqual(before);
  });
  it.each(['focus', 'disabled', 'completion', 'progress'] as const)('suppresses %s without replay when a switch or focus changes', (guard) => {
    const test = setup();
    if (guard === 'focus') test.focus(true);
    if (guard === 'disabled') test.prefs({ 'notifications.enabled': false });
    const event = item(guard === 'completion' ? { group: 'recent', state: 'analysis-completed' } : guard === 'progress' ? { group: 'active', state: 'analysis-running' } : {});
    test.notifier.accept(event);
    expect(test.notices).toHaveLength(0);
    test.focus(false);
    test.prefs({ 'notifications.enabled': true, 'notifications.completions': true });
    test.notifier.accept(event);
    expect(test.notices).toHaveLength(0);
  });
  it('requires both switches for completion and separately opts into title and sound', () => {
    const test = setup();
    test.prefs({ 'notifications.completions': true, 'notifications.bookName': true, 'notifications.sound': true });
    test.notifier.accept(item({ group: 'recent', state: 'analysis-completed' }));
    expect(test.notices[0]?.input).toEqual({ title: 'AI7', body: 'AI7：任务结果已记录 · Synthetic private title', silent: false });
  });
  it('coalesces within each Book, dedupes across windows, and opens the Book list for multiple events', () => {
    const test = setup();
    test.notifier.accept(item());
    test.notifier.accept(item());
    expect(test.notices).toHaveLength(1);
    test.notifier.accept(item({ itemId: 'second', group: 'exceptions', state: 'analysis-failed' }));
    expect(test.notices[0]?.close).toHaveBeenCalledOnce();
    expect(test.notices[1]?.input.body).toBe('AI7：一项任务出现异常 · 共 2 项');
    test.notices[1]?.click();
    expect(test.navigate).toHaveBeenCalledWith({ bookId: 'synthetic-book', eventId: null });
    test.notifier.accept(item({ itemId: 'other', book: { bookId: 'other-book', title: 'Other' } }));
    expect(test.notices[2]?.input.body).toBe(systemNoticeText('pending'));
  });
  it('does not replay an old or malformed timestamp at restart or reconnect', () => {
    const test = setup();
    for (const at of [new Date(START).toISOString(), new Date(START - 1).toISOString(), 'invalid']) test.notifier.accept(item({ at }));
    expect(test.notices).toHaveLength(0);
  });
  it('counts current records, replacing a changed record and dropping resolved records from a later coalesced notice', () => {
    const test = setup();
    const first = item();
    test.notifier.accept(first, [first]);
    const changed = item({ state: 'analysis-plan-revision', at: new Date(START + 2_000).toISOString() });
    test.notifier.accept(changed, [changed]);
    expect(test.notices[1]?.input.body).toBe(systemNoticeText('pending'));
    const second = item({ itemId: 'second', group: 'exceptions', state: 'analysis-failed' });
    test.notifier.accept(second, [second]);
    expect(test.notices[2]?.input.body).toBe(systemNoticeText('failure'));
    test.notices[2]?.click();
    expect(test.navigate).toHaveBeenCalledWith({ bookId: second.book.bookId, eventId: second.itemId, target: second.target });
  });
  it('defaults all notification switches off and uses content-free distinct labels', () => {
    for (const [key, value] of Object.entries(preferenceDefaults())) if (key.startsWith('notifications.')) expect(value).toBe(false);
    expect(new Set(Object.values(NOTIFICATION_LABELS)).size).toBe(Object.values(NOTIFICATION_LABELS).length);
    for (const label of Object.values(NOTIFICATION_LABELS)) expect(label).not.toMatch(/Synthetic|\$\{|\{.*\}|书稿|任务已完成/u);
    expect(completionLabel(item({ group: 'recent', state: 'review-completed', object: { kind: 'review', ordinal: 1 } }))).toBe('《Synthetic private title》审阅完成');
  });
  it('tells 结果待确认 from a failure and a pending decision, and a coalesced notice names the most pressing class', () => {
    const classes = [
      notificationClass(item()),
      notificationClass(item({ group: 'exceptions', state: 'analysis-failed' })),
      notificationClass(item({ group: 'exceptions', state: 'apply-outcome-unresolved' })),
      notificationClass(item({ group: 'recent', state: 'review-completed', object: { kind: 'review', ordinal: 1 } })),
      notificationClass(item({ group: 'recent', state: 'analysis-completed' })),
    ];
    expect(classes).toEqual(['pending', 'failure', 'ambiguous', 'candidate', 'outcome']);
    const test = setup();
    const ambiguous = item({ itemId: 'unresolved', group: 'exceptions', state: 'analysis-outcome-unknown' });
    test.notifier.accept(ambiguous);
    expect(test.notices[0]?.input.body).toBe('AI7：有一项结果待确认');
    test.notifier.accept(item());
    expect(test.notices[1]?.input.body).toBe('AI7：有一项结果待确认 · 共 2 项');
    test.notifier.accept(item({ itemId: 'failed', group: 'exceptions', state: 'analysis-failed' }));
    expect(test.notices[2]?.input.body).toBe('AI7：一项任务出现异常 · 共 3 项');
  });
  it('a click on a notice another one replaced keeps the newer notice current', () => {
    const test = setup();
    test.notifier.accept(item());
    test.notifier.accept(item({ itemId: 'second' }));
    test.notices[0]?.click();
    test.notifier.accept(item({ itemId: 'third' }));
    expect(test.notices[2]?.input.body).toBe('AI7：有一项需要你处理 · 共 3 项');
  });
});

describe('renderer projection observer', () => {
  it('keeps a completed Run with an unresolved external outcome actionable, without a quiet completion', () => {
    const completed = vi.fn();
    const notify = vi.fn(async () => {});
    const observe = createNotificationObserver({ api: { notify }, focused: () => true, completed, startedAt: START });
    observe(projection([
      item({ itemId: 'outcome', group: 'recent', state: 'analysis-completed-with-gaps' }),
      item({ itemId: 'unconfirmed', group: 'exceptions', state: 'analysis-outcome-unconfirmed', target: { kind: 'task-plan', bookId: 'synthetic-book', taskKind: 'baseline-analysis', ref: 'synthetic-task' } }),
    ]));
    expect(completed).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledExactlyOnceWith({ bookId: 'synthetic-book', eventId: 'unconfirmed' });
  });
  it('emits one foreground completion per new event without changing history or its attention count', () => {
    const completed = vi.fn();
    const notify = vi.fn(async () => {});
    const observe = createNotificationObserver({ api: { notify }, focused: () => true, completed, startedAt: START });
    const reading = projection([item({ group: 'recent', state: 'analysis-completed' })]);
    const before = structuredClone(reading);
    observe(reading); observe(reading);
    expect(completed).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
    expect(reading).toEqual(before);
    expect(reading.actionableCount).toBe(0);
  });
  it('ignores old outcomes and progress; a background outcome stays in history without a transient notice', () => {
    const completed = vi.fn();
    const notify = vi.fn(async () => {});
    const observe = createNotificationObserver({ api: { notify }, focused: () => false, completed, startedAt: START });
    observe(projection([item({ at: new Date(START - 1).toISOString(), target: { kind: 'analysis', bookId: 'synthetic-book', taskIntentId: 'old-task' } }), item({ group: 'active' }), item({ group: 'recent' })]));
    expect(completed).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce();
  });
});

describe('quiet notice lifetime', () => {
  it('clears a saving status when protection has no separate cause to announce', () => {
    const restore = installMiniDom();
    try {
      const surface = miniDocument.createElement('div'); miniDocument.body.append(surface);
      const update = createStatusSurface(surface as unknown as HTMLElement);
      update('正在保存…', 'busy'); update('', 'error');
      expect(surface.hidden).toBe(true);
      expect(surface.textContent).toBe('');
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      update('确认结果与当前编辑不符', 'error');
      expect(surface.textContent).toBe('确认结果与当前编辑不符');
      expect(surface.dataset['tone']).toBe('error');
      update('');
      expect(surface.textContent).toBe('确认结果与当前编辑不符');
      expect(surface.hidden).toBe(false);
    } finally { restore(); }
  });

  it.each(['error', 'busy'] as const)('keeps %s visible beyond the transient lifetime without a toast', (tone) => {
    const restore = installMiniDom();
    vi.useFakeTimers();
    try {
      const surface = miniDocument.createElement('div');
      miniDocument.body.append(surface);
      const update = createStatusSurface(surface as unknown as HTMLElement);
      update(tone === 'error' ? '模型服务不可达' : '正在测试连接…', tone);
      vi.advanceTimersByTime(10_000);
      expect(surface.hidden).toBe(false);
      expect(surface.dataset['tone']).toBe(tone);
      expect(miniDocument.body.querySelector('[data-toast]') === null).toBe(true);
    } finally { vi.useRealTimers(); restore(); }
  });

  it('keeps an error through untoned and busy lines; the next success clears it and is said once', () => {
    const restore = installMiniDom();
    vi.useFakeTimers();
    try {
      const surface = miniDocument.createElement('div');
      miniDocument.body.append(surface);
      const update = createStatusSurface(surface as unknown as HTMLElement);
      update('凭据被拒', 'error');
      update('正在测试连接…', 'busy');
      expect(surface.textContent).toContain('凭据被拒');
      expect(surface.textContent).toContain('正在测试连接…');
      update('设置已打开');
      expect(surface.textContent).toBe('凭据被拒');
      expect(surface.dataset['tone']).toBe('error');
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      update('其他设置已保存', 'success');
      expect(surface.hidden).toBe(true);
      expect(surface.textContent).toBe('其他设置已保存');
      const toast = miniDocument.body.querySelector('[data-toast]')!;
      expect(toast.textContent).toBe('其他设置已保存');
      vi.advanceTimersByTime(2_500);
      expect(toast.hidden).toBe(true);
      update('正在测试连接…', 'busy');
      expect(surface.textContent).toBe('正在测试连接…');
      expect(surface.dataset['tone']).toBe('busy');
    } finally { vi.useRealTimers(); restore(); }
  });

  it('a status without a tone is the live region only, and an empty one shows nothing', () => {
    const restore = installMiniDom();
    try {
      const surface = miniDocument.createElement('div');
      miniDocument.body.append(surface);
      const update = createStatusSurface(surface as unknown as HTMLElement);
      update('设置已打开');
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      expect(surface.hidden).toBe(true);
      expect(surface.textContent).toBe('设置已打开');
      expect(surface.dataset['tone']).toBeUndefined();
      update('');
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      expect(surface.textContent).toBe('');
      update('', 'success');
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      update('正在打开图书…', 'busy');
      update('');
      expect(surface.hidden).toBe(true);
    } finally { restore(); }
  });

  it('says a line without a tone once, through the announcer only; a success is said by its toast alone', () => {
    const restore = installMiniDom();
    try {
      const surface = miniDocument.createElement('div'); const announcer = miniDocument.createElement('div');
      miniDocument.body.append(surface, announcer);
      const update = createStatusSurface(surface as unknown as HTMLElement, announcer as unknown as HTMLElement);
      update('设置已打开');
      expect(announcer.textContent).toBe('设置已打开');
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      update('设置已保存', 'success');
      expect(announcer.textContent).toBe('');
      expect(miniDocument.body.querySelector('[data-toast]')!.textContent).toBe('设置已保存');
      update('无法保存', 'error');
      expect(announcer.textContent).toBe('');
      update('');
      expect(announcer.textContent).toBe('');
    } finally { restore(); }
  });

  it('a result that settles no error ends the busy line and says itself once in a toast', () => {
    const restore = installMiniDom();
    try {
      const surface = miniDocument.createElement('div'); const announcer = miniDocument.createElement('div');
      miniDocument.body.append(surface, announcer);
      const update = createStatusSurface(surface as unknown as HTMLElement, announcer as unknown as HTMLElement);
      update('无法打开图书', 'error');
      update('正在选择文件…', 'busy');
      reportResult(update, '已取消文件选择');
      expect(surface.textContent).toBe('无法打开图书');
      expect(surface.dataset['tone']).toBe('error');
      expect(announcer.textContent).toBe('');
      expect(miniDocument.body.querySelector('[data-toast]')!.textContent).toBe('已取消文件选择');
    } finally { restore(); }
  });

  it('an update unrelated to a standing error leaves its text and × the same nodes; the announcer alone says it', () => {
    const restore = installMiniDom();
    try {
      const surface = miniDocument.createElement('div'); const announcer = miniDocument.createElement('div');
      miniDocument.body.append(surface, announcer);
      const update = createStatusSurface(surface as unknown as HTMLElement, announcer as unknown as HTMLElement);
      update('无法打开图书', 'error');
      const [line, close] = surface.children;
      const errorText = line!.children[0]!;
      // Counts every write of the error's words: an unrelated update must not repaint them.
      let rewrites = 0;
      const words = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(errorText), 'textContent')!;
      Object.defineProperty(errorText, 'textContent', { configurable: true, get() { return words.get!.call(this); }, set(value) { rewrites += 1; words.set!.call(this, value); } });
      for (const next of [() => update('已保存'), () => reportResult(update, '已取消文件选择'), () => update('正在保存…', 'busy'), () => update('')]) {
        next();
        expect(surface.children[0]).toBe(line);
        expect(surface.children[1]).toBe(close);
        expect(line!.children[0]).toBe(errorText);
        expect(rewrites).toBe(0);
        expect(errorText.textContent).toBe('无法打开图书');
      }
      update('已保存');
      expect(announcer.textContent).toBe('已保存');
      expect(surface.textContent).toBe('无法打开图书');
    } finally { restore(); }
  });

  it('settle ends the standing error its owner names, silently, and nothing else', () => {
    const restore = installMiniDom();
    try {
      const surface = miniDocument.createElement('div'); const announcer = miniDocument.createElement('div');
      miniDocument.body.append(surface, announcer);
      const update = createStatusSurface(surface as unknown as HTMLElement, announcer as unknown as HTMLElement);
      // No standing error: nothing happens.
      update('已保存');
      update.settle('无法读取审阅。');
      expect(surface.hidden).toBe(true);
      expect(surface.textContent).toBe('已保存');
      expect(announcer.textContent).toBe('已保存');
      // Another error stands: it is left untouched.
      update('无法保存审阅偏好。', 'error');
      update.settle('无法读取审阅。');
      expect(surface.hidden).toBe(false);
      expect(surface.textContent).toBe('无法保存审阅偏好。');
      expect(surface.querySelector('.status-dismiss')).not.toBeNull();
      // The named error: it ends, its × goes, no toast, the announcer says nothing.
      update('无法读取审阅。', 'error');
      update.settle('无法读取审阅。');
      expect(surface.hidden).toBe(true);
      expect(surface.textContent).toBe('');
      expect(surface.querySelector('.status-dismiss')).toBeNull();
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      expect(announcer.textContent).toBe('');
      // Raised again after a settle, it shows again.
      update('无法读取审阅。', 'error');
      expect(surface.hidden).toBe(false);
      expect(surface.dataset['tone']).toBe('error');
      expect(surface.textContent).toBe('无法读取审阅。');
      // A busy line beside the error stays when the error settles.
      update('正在读取…', 'busy');
      update.settle('无法读取审阅。');
      expect(surface.hidden).toBe(false);
      expect(surface.dataset['tone']).toBe('busy');
      expect(surface.textContent).toBe('正在读取…');
    } finally { restore(); }
  });

  it('closing an error only dismisses it, and a new destination clears it', () => {
    const restore = installMiniDom();
    try {
      const surface = miniDocument.createElement('div');
      miniDocument.body.append(surface);
      const update = createStatusSurface(surface as unknown as HTMLElement);
      const reached = vi.fn();
      surface.addEventListener('click', reached);
      update('无法打开图书', 'error');
      const close = surface.querySelector('button')!;
      close.click();
      expect(surface.hidden).toBe(true);
      expect(reached).not.toHaveBeenCalled();
      update('无法打开图书', 'error');
      update.clearError();
      expect(surface.hidden).toBe(true);
      update('正在打开图书…', 'busy');
      update.clearError();
      expect(surface.textContent).toBe('正在打开图书…');
    } finally { restore(); }
  });

  it('replaces the one notice, pauses its remaining reading time on hover and focus, and dismisses without touching the record', async () => {
    const restore = installMiniDom();
    vi.useFakeTimers();
    let hovering = false;
    vi.stubGlobal('document', {
      body: miniDocument.body,
      get activeElement() { return miniDocument.activeElement; },
      createElement: (tag: string) => Object.assign(miniDocument.createElement(tag), { matches: () => hovering }),
    });
    try {
      const open = vi.fn();
      const show = mountQuietNotice(open);
      show(item({ group: 'recent', state: 'analysis-completed' }));
      const host = miniDocument.body.children[0]!;
      vi.advanceTimersByTime(2_000);
      hovering = true;
      host.dispatchEvent({ type: 'mouseenter' });
      vi.advanceTimersByTime(20_000);
      expect(host.hidden).toBe(false);
      hovering = false;
      host.dispatchEvent({ type: 'mouseleave' });
      vi.advanceTimersByTime(499);
      expect(host.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(host.hidden).toBe(true);

      const latest = item({ itemId: 'latest', group: 'recent', state: 'review-completed', object: { kind: 'review', ordinal: 1 } });
      const original = structuredClone(latest);
      show(item({ group: 'recent', state: 'analysis-completed' }));
      show(latest);
      expect(miniDocument.body.children).toHaveLength(1);
      expect(host.children[0]?.textContent).toBe('《Synthetic private title》审阅完成');
      const view = host.children[1]!;
      view.focus();
      host.dispatchEvent({ type: 'focusin' });
      vi.advanceTimersByTime(20_000);
      expect(host.hidden).toBe(false);
      view.click();
      expect(host.hidden).toBe(true);
      expect(open).toHaveBeenCalledWith(latest);
      expect(latest).toEqual(original);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      restore();
    }
  });
});

describe('a Run started from the Task Drawer reaches the observer', () => {
  it('automatically follows new Runs and reports their completion only once', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    try {
      const running = { ...projection([item({ group: 'active', state: 'analysis-running', itemId: 'run' })]), running: true };
      const settled = projection([item({ group: 'recent', state: 'analysis-completed', itemId: 'outcome' })]);
      let current = projection([]);
      const reader = createGlobalAttentionReader({ inspectGlobalAttention: async () => current });
      const completed = vi.fn();
      const observe = createNotificationObserver({ api: { notify: vi.fn(async () => {}) }, focused: () => true, completed, startedAt: START });
      reader.subscribe((reading) => { if (reading.kind === 'projection') observe(reading.projection); });
      reader.refresh();
      await vi.advanceTimersByTimeAsync(0);
      // A new task is followed even when the previous reading had no running work.
      current = running;
      current = settled;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(completed).toHaveBeenCalledOnce();
      // Reading the same completion again does not open a second result.
      current = running;
      reader.refresh();
      await vi.advanceTimersByTimeAsync(0);
      current = settled;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(completed).toHaveBeenCalledOnce();
      reader.interrupt();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
  it('the shell refreshes 待我处理 whenever the Task Drawer records a change', () => {
    const renderer = readFileSync(fileURLToPath(new URL('../../src/renderer/index.ts', import.meta.url)), 'utf8');
    const recorded = renderer.slice(renderer.indexOf('  onRecorded: (kind, bookId, ref) => {'), renderer.indexOf('  openRunSurface: (plan) =>'));
    expect(recorded).toContain('globalAttentionReader.refresh();');
  });
});

describe('a task that needs the editor (#1528)', () => {
  const KINDS = [
    { state: 'analysis-failed', group: 'exceptions', words: '《Synthetic private title》分析没有完成' },
    { state: 'review-failed', group: 'exceptions', words: '《Synthetic private title》审阅没有完成' },
    { state: 'analysis-budget-reached', group: 'exceptions', words: '《Synthetic private title》分析用量已到上限' },
    { state: 'analysis-account-limit', group: 'exceptions', words: '《Synthetic private title》分析被模型服务拒绝：账户限额已用完' },
    { state: 'analysis-clarification', group: 'decisions', words: '《Synthetic private title》分析在等你回答' },
    { state: 'analysis-outcome-unconfirmed', group: 'exceptions', words: '《Synthetic private title》分析结果待确认' },
  ] as const;

  it.each(KINDS)('raises its notice for $state in the foreground, naming the Book and the task', ({ state, group, words }) => {
    const attention = vi.fn(); const completed = vi.fn(); const notify = vi.fn(async () => {});
    const observe = createNotificationObserver({ api: { notify }, focused: () => true, completed, attention, startedAt: START });
    const object = state.startsWith('review') ? { kind: 'review' as const, ordinal: 1 } : { kind: 'analysis' as const, mode: 'first-baseline' as const };
    const event = item({ state, group, object });
    observe(projection([event])); observe(projection([event]));
    expect(attention).toHaveBeenCalledExactlyOnceWith(event);
    expect(completed).not.toHaveBeenCalled();
    expect(attentionLabel(event)).toBe(words);
  });

  it('raises none for a state that is not a task stopped for the editor', () => {
    const attention = vi.fn();
    const observe = createNotificationObserver({ api: { notify: vi.fn(async () => {}) }, focused: () => true, completed: vi.fn(), attention, startedAt: START });
    observe(projection([
      item({ itemId: 'plan', state: 'analysis-plan-revision' }), item({ itemId: 'recovery', state: 'recovery-pending', group: 'exceptions' }),
    ]));
    expect(attention).not.toHaveBeenCalled();
    expect(attentionKind(item({ state: 'analysis-failed', group: 'exceptions' }))).toBe('failed');
  });

  it('collects what happens in the background, and lists the tasks that need the editor at every reading', () => {
    const away = vi.fn(); const attention = vi.fn(); const completed = vi.fn(); const standing = vi.fn();
    const observe = createNotificationObserver({ api: { notify: vi.fn(async () => {}) }, focused: () => false, completed, attention, away, standing, startedAt: START });
    const failed = item({ itemId: 'failed', state: 'analysis-failed', group: 'exceptions' });
    const done = item({ itemId: 'done', group: 'recent', state: 'analysis-completed', target: { kind: 'analysis', bookId: 'synthetic-book', taskIntentId: 'another-task' } });
    observe(projection([failed, done]));
    expect(away.mock.calls).toEqual([[failed, 'attention'], [done, 'completed']]);
    expect(attention).not.toHaveBeenCalled(); expect(completed).not.toHaveBeenCalled();
    expect(standing).toHaveBeenLastCalledWith([failed]);
    observe(projection([]));
    expect(standing).toHaveBeenLastCalledWith([]);
  });

  function mount() {
    const restore = installMiniDom();
    vi.useFakeTimers();
    const editor = miniDocument.createElement('div'); editor.dataset['testid'] = 'manuscript-editor';
    miniDocument.body.append(editor); editor.focus();
    const open = vi.fn();
    const notice = mountAttentionNotice(open);
    const host = () => miniDocument.body.querySelector('[data-attention-toast]')!;
    return { notice, open, host, editor, done: () => { vi.useRealTimers(); restore(); } };
  }

  it('stays until closed, is not the transient toast, and does not take the focus', () => {
    const page = mount();
    try {
      page.notice.raise(item());
      vi.advanceTimersByTime(60_000);
      expect(page.host().hidden).toBe(false);
      expect(page.host().children[0]?.textContent).toBe('《Synthetic private title》分析在等你回答');
      expect(page.host().children[1]?.textContent).toBe('去处理');
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      expect(miniDocument.activeElement).toBe(page.editor);
      page.host().children[2]!.click();
      expect(page.host().hidden).toBe(true);
      expect(page.open).not.toHaveBeenCalled();
    } finally { page.done(); }
  });

  it('collapses several into one line, opens them together and drops the one that is settled', () => {
    const page = mount();
    try {
      const first = item({ itemId: 'one' }); const second = item({ itemId: 'two', group: 'exceptions', state: 'analysis-failed' });
      page.notice.raise(first); page.notice.raise(second);
      expect(page.host().children[0]?.textContent).toBe('有 2 项任务需要你处理');
      expect(miniDocument.body.querySelectorAll('[data-attention-toast]')).toHaveLength(1);
      page.notice.settle(new Set(['two']));
      expect(page.host().children[0]?.textContent).toBe('《Synthetic private title》分析没有完成');
      page.notice.raise(first);
      page.host().children[1]!.click();
      expect(page.open).toHaveBeenCalledExactlyOnceWith([second, first]);
      expect(page.host().hidden).toBe(true);
      page.notice.settle(new Set());
      expect(page.host().hidden).toBe(true);
    } finally { page.done(); }
  });

  it('says what happened in the background once, on return: finished and needing the editor', () => {
    const page = mount();
    try {
      const failed = item({ itemId: 'failed', state: 'analysis-failed', group: 'exceptions' });
      const done = [item({ itemId: 'a', group: 'recent', state: 'analysis-completed' }), item({ itemId: 'b', group: 'recent', state: 'review-completed', object: { kind: 'review', ordinal: 1 } })];
      page.notice.summarize(done, [failed]);
      expect(miniDocument.body.querySelectorAll('[data-attention-toast]')).toHaveLength(1);
      expect(page.host().children[0]?.textContent).toBe('你不在时，2 项任务已完成，1 项需要你处理');
      expect(page.host().children[1]?.textContent).toBe('去处理');
      page.notice.settle(new Set());
      expect(page.host().children[0]?.textContent).toBe('你不在时，2 项任务已完成');
      expect(page.host().children[1]?.textContent).toBe('查看');
      page.host().children[1]!.click();
      expect(page.open).toHaveBeenCalledExactlyOnceWith(done);
    } finally { page.done(); }
  });

  it('repaints no words that did not change, so the line is said once', () => {
    const page = mount();
    try {
      const event = item();
      page.notice.raise(event);
      const text = page.host().children[0]!;
      let writes = 0;
      const words = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(text), 'textContent')!;
      Object.defineProperty(text, 'textContent', { configurable: true, get() { return words.get!.call(this); }, set(value) { writes += 1; words.set!.call(this, value); } });
      page.notice.raise(event); page.notice.settle(new Set([event.itemId]));
      expect(writes).toBe(0);
    } finally { page.done(); }
  });

  it('the header pill shows the same count as the entry on every page, and only while it is above nothing', () => {
    const restore = installMiniDom();
    try {
      const button = miniDocument.createElement('button'); miniDocument.body.append(button);
      type Reading = { kind: 'projection'; projection: GlobalAttentionProjection } | { kind: 'unavailable' };
      let listener: (reading: Reading) => void = () => {};
      const open = vi.fn();
      mountAttentionPill({ button: button as unknown as HTMLElement, reader: { subscribe: (next: typeof listener) => { listener = next; return () => {}; } } as never, open });
      listener({ kind: 'projection', projection: projection([item(), item({ itemId: 'two', group: 'exceptions', state: 'analysis-failed' })]) });
      expect(button.hidden).toBe(false);
      expect(button.textContent).toBe('待处理 2');
      listener({ kind: 'projection', projection: projection([]) });
      expect(button.hidden).toBe(true);
      listener({ kind: 'projection', projection: projection([item()]) });
      button.click();
      expect(open).toHaveBeenCalledOnce();
    } finally { restore(); }
  });
});

describe('the notices of tasks as the window leaves and returns (#1528)', () => {
  function mountNotices(options: Partial<Parameters<typeof mountTaskNotices>[0]> = {}) {
    const restore = installMiniDom();
    let focused = true;
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('window', { addEventListener: (name: string, run: () => void) => { listeners.set(name, run); } });
    vi.stubGlobal('localStorage', { getItem: () => null });
    Object.assign(miniDocument, { hasFocus: () => focused });
    let reading: (value: { kind: 'projection'; projection: GlobalAttentionProjection }) => void = () => {};
    const calls = { openResult: vi.fn(), openAttention: vi.fn(), openList: vi.fn(), openWindow: vi.fn() };
    mountTaskNotices({
      api: { notify: vi.fn(async () => {}), inspectTaskOverview: vi.fn(async () => composeTaskOverview(projection([]), 2, () => null)) },
      reader: { subscribe: (next: typeof reading) => { reading = next; return () => {}; } } as never,
      screen: miniDocument.createElement('main') as unknown as HTMLElement, drawerView: () => null, ...calls, ...options,
    });
    const later = (change: Partial<GlobalAttentionItemProjection>) => item({ at: new Date(Date.now() + 60_000).toISOString(), ...change });
    return {
      calls, later, toast: () => miniDocument.body.querySelector('[data-attention-toast]'),
      read: (items: GlobalAttentionItemProjection[]) => reading({ kind: 'projection', projection: projection(items) }),
      focus: (value: boolean) => { focused = value; if (value) listeners.get('focus')?.(); },
      done: () => { vi.unstubAllGlobals(); delete (miniDocument as unknown as Record<string, unknown>)['hasFocus']; restore(); },
    };
  }

  it('says a task that stops for a question once while focused, and says nothing of it in the background', () => {
    const page = mountNotices();
    try {
      const question = page.later({ itemId: 'question' });
      page.read([question]);
      expect(page.toast()?.children[0]?.textContent).toBe('《Synthetic private title》分析在等你回答');
      page.toast()!.children[1]!.click();
      expect(page.calls.openAttention).toHaveBeenCalledExactlyOnceWith(question);
      expect(page.calls.openResult).not.toHaveBeenCalled();
      page.focus(false);
      page.read([page.later({ itemId: 'another', group: 'exceptions', state: 'analysis-failed', target: { kind: 'analysis', bookId: 'synthetic-book', taskIntentId: 'another-task' } })]);
      expect(page.toast()?.hidden).toBe(true);
    } finally { page.done(); }
  });

  it('on return, one summary for everything that finished or needs the editor meanwhile, opened as the 待我处理 list of the one Book', () => {
    const page = mountNotices();
    try {
      page.focus(false);
      const failed = page.later({ itemId: 'failed', state: 'analysis-failed', group: 'exceptions' });
      const done = page.later({ itemId: 'done', group: 'recent', state: 'analysis-completed', target: { kind: 'analysis', bookId: 'synthetic-book', taskIntentId: 'another-task' } });
      page.read([failed, done]);
      expect(page.toast()?.hidden ?? true).toBe(true);
      page.focus(true);
      expect(page.toast()?.hidden ?? true).toBe(true);
      page.read([failed, done]);
      expect(page.toast()?.children[0]?.textContent).toBe('你不在时，1 项任务已完成，1 项需要你处理');
      page.read([failed, done]);
      expect(page.toast()?.children[0]?.textContent).toBe('你不在时，1 项任务已完成，1 项需要你处理');
      page.toast()!.children[1]!.click();
      expect(page.calls.openList).toHaveBeenCalledExactlyOnceWith('synthetic-book');
    } finally { page.done(); }
  });

  it('the summary of one completion opens its result, not an attention record; one that needs the editor opens that record', () => {
    const page = mountNotices();
    try {
      const done = page.later({ itemId: 'done', group: 'recent', state: 'analysis-completed' });
      page.focus(false); page.read([done]); page.focus(true); page.read([done]);
      expect(page.toast()?.children[0]?.textContent).toBe('你不在时，1 项任务已完成');
      expect(page.toast()?.children[1]?.textContent).toBe('查看结果');
      page.toast()!.children[1]!.click();
      expect(page.calls.openResult).toHaveBeenCalledExactlyOnceWith(done);
      expect(page.calls.openAttention).not.toHaveBeenCalled();
    } finally { page.done(); }
  });

  it('a dialogue the editor cancelled just before the window lost focus is not counted on return', () => {
    const page = mountNotices();
    try {
      page.focus(false);
      page.read([page.later({ itemId: 'cancelled', group: 'recent', state: 'dialogue-interrupted', object: { kind: 'dialogue', question: null },
        facts: { progress: null, categories: [], revisionOrdinal: null, dialogueCancelled: true } })]);
      page.focus(true); page.read([]);
      expect(page.toast()?.hidden ?? true).toBe(true);
    } finally { page.done(); }
  });

  it('a task that was settled before the editor returned is not in the summary', () => {
    const page = mountNotices();
    try {
      page.focus(false);
      page.read([page.later({ itemId: 'failed', state: 'analysis-failed', group: 'exceptions' })]);
      page.focus(true);
      page.read([]);
      expect(page.toast()?.hidden ?? true).toBe(true);
    } finally { page.done(); }
  });
});

describe('review round 1 of #1528', () => {
  it('a failed or interrupted dialogue is a task that needs the editor, never a completion; what the editor cancelled is quiet or silent', () => {
    const completed = vi.fn(); const attention = vi.fn();
    const observe = createNotificationObserver({ api: { notify: vi.fn(async () => {}) }, focused: () => true, completed, attention, startedAt: START });
    const dialogue = (state: GlobalAttentionItemProjection['state'], itemId: string, change: Partial<GlobalAttentionItemProjection> = {}) => item({ itemId, group: 'recent', state, object: { kind: 'dialogue', question: null },
      target: { kind: 'dialogue', bookId: 'synthetic-book', dialogueId: itemId }, ...change });
    const failed = dialogue('dialogue-failed', 'd1'); const interrupted = dialogue('dialogue-interrupted', 'd2');
    // The editor's cancellation of a Book dialogue is `dialogue-interrupted` with `dialogueCancelled` (dialogue-execution.ts).
    const cancelled = dialogue('dialogue-interrupted', 'd3', { facts: { progress: null, categories: [], revisionOrdinal: null, dialogueCancelled: true } });
    const globalFailed = dialogue('dialogue-failed', 'd4', { book: { bookId: null, title: null }, target: { kind: 'global-agent-dialogue', dialogueId: 'd4' } });
    const cancelledTask = item({ itemId: 'cancelled', group: 'recent', state: 'analysis-cancelled', object: { kind: 'task', taskKind: 'initial-evaluation' },
      target: { kind: 'task-plan', bookId: 'synthetic-book', taskKind: 'initial-evaluation', ref: 'cancelled' } });
    observe(projection([failed, interrupted, cancelled, globalFailed, cancelledTask]));
    expect(attention.mock.calls.map(([entry]) => entry.itemId)).toEqual(['d1', 'd2', 'd4']);
    expect(completed.mock.calls.map(([entry]) => entry.itemId)).toEqual(['d3']);
    expect(attentionLabel(failed)).toBe('《Synthetic private title》对话没有完成');
    expect(attentionLabel(globalFailed)).toBe('对话没有完成');
    expect(completionLabel(cancelled)).toBe('《Synthetic private title》对话已取消');
  });

  it('a press on the notice takes no focus from the page', () => {
    const restore = installMiniDom();
    try {
      const notice = mountAttentionNotice(vi.fn());
      notice.raise(item());
      const press = { type: 'mousedown', defaultPrevented: false };
      miniDocument.body.querySelector('[data-attention-toast]')!.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
    } finally { restore(); }
  });

  it('the return summary counts only the tasks that stopped while the window was away', () => {
    const restore = installMiniDom();
    try {
      const notice = mountAttentionNotice(vi.fn());
      notice.raise(item({ itemId: 'before' }));
      notice.summarize([], [item({ itemId: 'away', group: 'exceptions', state: 'analysis-failed' })]);
      const host = miniDocument.body.querySelector('[data-attention-toast]')!;
      expect(host.children[0]?.textContent).toBe('你不在时，有 1 项任务需要你处理');
      notice.raise(item({ itemId: 'after' }));
      expect(host.children[0]?.textContent).toBe('有 3 项任务需要你处理');
      // What finished is all it can still say once nothing is waiting: never 「有 0 项」.
      const done = item({ itemId: 'done', group: 'recent', state: 'analysis-completed' });
      const again = mountAttentionNotice(vi.fn());
      again.summarize([done], []);
      again.raise(item({ itemId: 'late' }));
      again.settle(new Set());
      expect(miniDocument.body.querySelectorAll('[data-attention-toast]')[1]?.children[0]?.textContent).toBe('你不在时，1 项任务已完成');
    } finally { restore(); }
  });
});

describe('the first reading after the window returns (#1528)', () => {
  it('says a completion that arrives in it in the one summary, not as a second notice or an automatic window', () => {
    const restore = installMiniDom();
    let focused = false;
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('window', { addEventListener: (name: string, run: () => void) => { listeners.set(name, run); } });
    vi.stubGlobal('localStorage', { getItem: () => null });
    Object.assign(miniDocument, { hasFocus: () => focused });
    let reading: (value: { kind: 'projection'; projection: GlobalAttentionProjection }) => void = () => {};
    const openWindow = vi.fn();
    try {
      mountTaskNotices({
        api: { notify: vi.fn(async () => {}), inspectTaskOverview: vi.fn(async () => composeTaskOverview(projection([]), 2, () => null)) },
        reader: { subscribe: (next: typeof reading) => { reading = next; return () => {}; } } as never,
        screen: miniDocument.createElement('main') as unknown as HTMLElement, drawerView: () => null,
        openResult: vi.fn(), openAttention: vi.fn(), openList: vi.fn(), openWindow,
      });
      const later = (change: Partial<GlobalAttentionItemProjection>) => item({ at: new Date(Date.now() + 60_000).toISOString(), ...change });
      const failed = later({ itemId: 'failed', state: 'analysis-failed', group: 'exceptions' });
      reading({ kind: 'projection', projection: projection([failed]) });
      focused = true; listeners.get('focus')?.();
      const done = later({ itemId: 'done', group: 'recent', state: 'analysis-completed', target: { kind: 'analysis', bookId: 'synthetic-book', taskIntentId: 'another-task' } });
      reading({ kind: 'projection', projection: projection([failed, done]) });
      expect(miniDocument.body.querySelector('[data-attention-toast]')?.children[0]?.textContent).toBe('你不在时，1 项任务已完成，1 项需要你处理');
      expect(miniDocument.body.querySelector('[data-toast]')).toBeNull();
      expect(openWindow).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); delete (miniDocument as unknown as Record<string, unknown>)['hasFocus']; restore(); }
  });
});
