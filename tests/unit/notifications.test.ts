import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNotifier } from '../../src/main/notifications.js';
import { createNotificationObserver, mountQuietNotice } from '../../src/renderer/notifications.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { completionLabel, NOTIFICATION_LABELS } from '../../src/renderer/notification-labels.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import type { GlobalAttentionItemProjection, GlobalAttentionProjection } from '../../src/shared/protocol.js';

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
  })), actionableCount: items.filter((entry) => ['exceptions', 'decisions'].includes(entry.group)).length, running: false };
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

describe('privacy-safe main notifications', () => {
  it('shows generic silent actionable text when unfocused, and only navigates on click', () => {
    const test = setup();
    const event = item();
    const before = structuredClone(event);
    test.notifier.accept(event);
    expect(test.notices[0]?.input).toEqual({ title: 'AI7', body: 'AI7：有一项需要你处理', silent: true });
    expect(test.notices[0]?.show).toHaveBeenCalledOnce();
    test.notices[0]?.click();
    expect(test.navigate).toHaveBeenCalledWith({ bookId: event.book.bookId, eventId: event.itemId });
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
    expect(test.notices[2]?.input.body).toBe(NOTIFICATION_LABELS.decision);
  });
  it('does not replay an old or malformed timestamp at restart or reconnect', () => {
    const test = setup();
    for (const at of [new Date(START).toISOString(), new Date(START - 1).toISOString(), 'invalid']) test.notifier.accept(item({ at }));
    expect(test.notices).toHaveLength(0);
  });
  it('defaults all notification switches off and uses content-free distinct labels', () => {
    for (const [key, value] of Object.entries(preferenceDefaults())) if (key.startsWith('notifications.')) expect(value).toBe(false);
    expect(new Set(Object.values(NOTIFICATION_LABELS)).size).toBe(Object.values(NOTIFICATION_LABELS).length);
    for (const label of Object.values(NOTIFICATION_LABELS)) expect(label).not.toMatch(/Synthetic|\$\{|\{.*\}|书稿|任务已完成/u);
    expect(completionLabel(item({ state: 'review-completed' }))).toBe('审阅结果已可查看');
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
      vi.advanceTimersByTime(3_999);
      expect(host.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(host.hidden).toBe(true);

      const latest = item({ itemId: 'latest', group: 'recent', state: 'review-completed' });
      const original = structuredClone(latest);
      show(item({ group: 'recent', state: 'analysis-completed' }));
      show(latest);
      expect(miniDocument.body.children).toHaveLength(1);
      expect(host.children[0]?.textContent).toBe('审阅结果已可查看');
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
