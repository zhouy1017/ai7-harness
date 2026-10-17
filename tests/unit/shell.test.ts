import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PREFERENCE_KEYS, SHELL_BOOK_SECTIONS } from '../../src/shared/preferences.js';
import {
  bookIcon,
  contextHeading,
  rememberRecentBook,
  screenActive,
  sidebarBookRows,
  sidebarMode,
  SIDEBAR_ICONS_ONLY_BELOW_PX,
  togglePinnedBook,
} from '../../src/renderer/shell.js';
import {
  SETTINGS_HUB_GROUPS,
  SHELL_BOOK_GROUPS,
  SHELL_DESTINATIONS,
  SHELL_LABELS,
  SHELL_SETTINGS,
  shellRecentStateLine,
} from '../../src/renderer/shell-labels.js';

// Unit suite for the shell's model (Issue #934, wave 11 slice 11a; editor-surfaces §0.3, §8.6; IA-006 to IA-013). The
// model checks the sidebar through what it is built from: the destinations and groups in their
// fixed order with their exact labels, the icon each collapsed row keeps beside its name, the Book rows, what each screen
// marks as current, the context header's words, and the 设置 hub's rows. shell-dom.test.ts mounts it; Journeys check layout.

describe('the sidebar', () => {
  it('keeps Help current with a global heading even when a Book remains in the sidebar (#939)', () => {
    const active = screenActive('help', null);
    expect(active).toEqual({ kind: 'help' });
    expect(contextHeading('help', active, { bookId: 'a', title: '甲书' })).toEqual({ title: '帮助', position: SHELL_LABELS.global, book: false });
  });
  it('keeps usage, exact Run detail and keyboard pages in Settings (#936)', () => {
    for (const [state, position] of [['usage', '服务 · 用量'], ['usage-run', '服务 · 用量 · 运行详情'], ['keyboard', '本机 · 键盘与无障碍']]) {
      const active = screenActive(state!, null);
      expect(active).toEqual({ kind: 'settings' });
      expect(contextHeading(state!, active, null)).toEqual({ title: '设置', position, book: false });
    }
  });
  it('lists the five global destinations in their fixed order, each with a one-character icon of its own name', () => {
    expect(SHELL_DESTINATIONS.map((entry) => [entry.key, entry.label])).toEqual([
      ['attention', '待我处理'], ['library', '书库'], ['series', '书系'], ['knowledge', '知识库'], ['quality', '质量与学习'],
    ]);
    for (const entry of [...SHELL_DESTINATIONS, SHELL_SETTINGS]) {
      expect([...entry.icon]).toHaveLength(1);
      expect(entry.label).toContain(entry.icon);
    }
  });

  it('groups the current Book as 工作 · 处理 · 资料与记录 with every section once', () => {
    expect(SHELL_BOOK_GROUPS.map((group) => [group.label, group.sections.map((section) => section.label)])).toEqual([
      ['工作', ['稿件', '审阅', '评估', '交付物']],
      ['处理', ['发现']],
      ['资料与记录', ['分析', '来源与证据', '工作概览', '历史与恢复']],
    ]);
    expect(SHELL_BOOK_GROUPS.flatMap((group) => group.sections.map((section) => section.key))).toEqual([...SHELL_BOOK_SECTIONS]);
    for (const section of SHELL_BOOK_GROUPS.flatMap((group) => group.sections)) {
      expect([...section.icon]).toHaveLength(1);
      expect(section.label).toContain(section.icon);
    }
  });

  it('shows icons only when collapsed or narrower than 760 px', () => {
    expect(SIDEBAR_ICONS_ONLY_BELOW_PX).toBe(760);
    expect(sidebarMode(false, false)).toBe('full');
    expect(sidebarMode(true, false)).toBe('icons');
    expect(sidebarMode(false, true)).toBe('icons');
    expect(sidebarMode(true, true)).toBe('icons');
  });

  it('gives every collapsed Book row a name that says its Book and state, and a first-character icon', () => {
    expect(bookIcon('  sample1 ')).toBe('s');
    expect(bookIcon('𠀋字书')).toBe('𠀋');
    expect(bookIcon('')).toBe('书');
    expect(SHELL_LABELS.bookRowName('样书', shellRecentStateLine('review'))).toBe('《样书》 · 上次在「审阅」');
    expect(SHELL_LABELS.pin('样书')).toBe('置顶《样书》');
    expect(SHELL_LABELS.unpin('样书')).toBe('取消置顶《样书》');
  });

  it('keeps the stylesheet drawing each icon from data-nav-icon, so a row\'s text stays exactly its label', () => {
    const css = readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('.sidebar-link::before { content: attr(data-nav-icon);');
    expect(css).toMatch(/:root\[data-sidebar="icons"\] \.nav-label/u);
  });
});

describe('pinned and recent Books', () => {
  const a = { bookId: 'a', title: '甲书' };
  const b = { bookId: 'b', title: '乙书' };
  const c = { bookId: 'c', title: '丙书' };

  it('keeps supplementary-character titles inside the preference validator limit', () => {
    const title = '𠀋'.repeat(200);
    const pinned = togglePinnedBook([], { bookId: 'a', title }, 20);
    const recent = rememberRecentBook([], { bookId: 'a', title, section: 'manuscript' });
    expect(PREFERENCE_KEYS['shell.pinnedBooks'].validate(pinned)).toBe(true);
    expect(PREFERENCE_KEYS['shell.recentBooks'].validate(recent)).toBe(true);
    expect(pinned[0]!.title).toBe('𠀋'.repeat(100));
  });

  it('puts the visited Book first with its section, once, and keeps at most eight', () => {
    let recent = rememberRecentBook([], { ...a, section: 'manuscript' });
    recent = rememberRecentBook(recent, { ...b, section: 'review' });
    recent = rememberRecentBook(recent, { ...a, section: 'overview' });
    expect(recent).toEqual([{ ...a, section: 'overview' }, { ...b, section: 'review' }]);
    for (let index = 0; index < 12; index += 1) recent = rememberRecentBook(recent, { bookId: `n${index}`, title: `第${index}本`, section: 'analysis' });
    expect(recent).toHaveLength(8);
    expect(recent[0]!.bookId).toBe('n11');
  });

  it('pins at the end and unpins in place', () => {
    let pinned = togglePinnedBook([], a, 20);
    pinned = togglePinnedBook(pinned, b, 20);
    expect(pinned).toEqual([a, b]);
    expect(togglePinnedBook(pinned, a, 20)).toEqual([b]);
    expect(togglePinnedBook([a, b], c, 2)).toEqual([b, c]);
  });

  it('lists pinned Books first, then recent ones that are not pinned, with their one-line state', () => {
    const rows = sidebarBookRows([b], [{ ...a, section: 'manuscript' }, { ...b, section: 'review' }, { ...c, section: 'history' }], 'a');
    expect(rows.pinned).toEqual([{ bookId: 'b', title: '乙书', state: '上次在「审阅」', pinned: true, current: false }]);
    expect(rows.recent).toEqual([
      { bookId: 'a', title: '甲书', state: '上次在「稿件」', pinned: false, current: true },
      { bookId: 'c', title: '丙书', state: '上次在「历史与恢复」', pinned: false, current: false },
    ]);
    expect(sidebarBookRows([c], [], null).pinned[0]!.state).toBe(SHELL_LABELS.pinned);
  });
});

describe('what a screen marks as current', () => {
  it('maps the global screens to their destination and the 设置 pages to 设置', () => {
    expect(screenActive('landing', null)).toEqual({ kind: 'destination', destination: 'library' });
    expect(screenActive('global-attention', null)).toEqual({ kind: 'destination', destination: 'attention' });
    expect(screenActive('series', null)).toEqual({ kind: 'destination', destination: 'series' });
    expect(screenActive('knowledge-base', null)).toEqual({ kind: 'destination', destination: 'knowledge' });
    expect(screenActive('quality-learning', null)).toEqual({ kind: 'destination', destination: 'quality' });
    for (const state of ['settings', 'model-service', 'data-storage', 'evaluation-calibration', 'diagnostics']) expect(screenActive(state, null)).toEqual({ kind: 'settings' });
    expect(screenActive('target', null)).toEqual({ kind: 'destination', destination: 'library' });
    expect(screenActive('error', null)).toEqual({ kind: 'none' });
  });

  it('lets a Book screen name its own section', () => {
    expect(screenActive('editor', { bookId: 'a', title: '甲书', section: 'manuscript' })).toEqual({ kind: 'section', section: 'manuscript' });
  });

  it('heads a Book screen with the Book title and its group and section, and a global one with its destination', () => {
    const book = { bookId: 'a', title: '甲书' };
    expect(contextHeading('editor', { kind: 'section', section: 'manuscript' }, book)).toEqual({ title: '甲书', position: '工作 · 稿件', book: true });
    expect(contextHeading('book-sources', { kind: 'section', section: 'sources' }, book)).toEqual({ title: '甲书', position: '资料与记录 · 来源与证据', book: true });
    expect(contextHeading('landing', { kind: 'destination', destination: 'library' }, null)).toEqual({ title: '书库', position: '全局', book: false });
    expect(contextHeading('data-storage', { kind: 'settings' }, book)).toEqual({ title: '设置', position: '本机 · 数据与存储', book: false });
    expect(contextHeading('diagnostics', { kind: 'settings' }, book)).toEqual({ title: '设置', position: '本机 · 诊断', book: false });
    expect(contextHeading('target', { kind: 'destination', destination: 'library' }, null)).toEqual({ title: '导入稿件', position: '书库', book: false });
  });
});

describe('the 设置 hub', () => {
  it('groups the pages as 服务 · 编辑工作 · 本机 with stable routes for the rows later slices replace', () => {
    expect(SETTINGS_HUB_GROUPS.map((group) => [group.label, group.rows.map((row) => [row.route, row.label])])).toEqual([
      ['服务', [['model-service', '模型服务'], ['usage', '用量']]],
      ['编辑工作', [['evaluation-calibration', '评估校准与预测']]],
      ['本机', [['data-storage', '数据与存储'], ['appearance', '外观'], ['keyboard', '键盘与无障碍'], ['notifications', '通知'], ['diagnostics', '诊断']]],
    ]);
  });
});
