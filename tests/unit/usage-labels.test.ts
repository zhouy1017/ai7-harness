import { describe, expect, it } from 'vitest';
import { estimateUsageCost, usageCsv, UNBOUND_ROUTE_LABEL } from '../../src/shared/usage.js';
import type { UsageProjection } from '../../src/shared/protocol.js';
import {
  USAGE_UNPRICED,
  moneyText,
  usageCostLine,
  usagePeriodLabel,
  usageRouteLabel,
  usageRowLabel,
  usageTaskKindLabel,
} from '../../src/renderer/usage-labels.js';
import { bindingRefusalLabel } from '../../src/renderer/commands-labels.js';

// Unit suite for 用量's estimate, CSV and words (Issue #936, plan slice 11c; V2-UX-MSET-010; Owner decision 15).

const price = { inputPerMillion: 2, outputPerMillion: 8, currency: 'CNY', enteredAt: '2026-10-17' };

describe('the estimate', () => {
  it('is tokens times the entered unit price per route, summed per currency', () => {
    const estimate = estimateUsageCost(
      [{ route: 'opencode-go', runCount: 2, inputTokens: 1_500_000, outputTokens: 500_000 }, { route: 'deepseek-open-platform', runCount: 1, inputTokens: 1_000_000, outputTokens: 0 }],
      { 'opencode-go': price, 'deepseek-open-platform': { ...price, currency: 'USD', inputPerMillion: 1, enteredAt: '2026-10-10' } },
    );
    expect(estimate).toEqual({ state: 'estimated', amounts: [{ currency: 'CNY', amount: 7 }, { currency: 'USD', amount: 1 }], enteredOn: ['2026-10-10', '2026-10-17'] });
    expect(usageCostLine(estimate)).toBe('估算 ¥7.00 + $1.00 · 按你录入的单价（录入于 2026-10-10、2026-10-17）');
  });

  it('is unavailable — never zero and never partial — when any route used has no entered price', () => {
    const rows = [{ route: 'opencode-go', runCount: 1, inputTokens: 10, outputTokens: 10 }, { route: null, runCount: 1, inputTokens: 5, outputTokens: 0 }];
    expect(estimateUsageCost(rows, { 'opencode-go': price })).toEqual({ state: 'unpriced', missingRoutes: [null] });
    expect(estimateUsageCost(rows, {})).toEqual({ state: 'unpriced', missingRoutes: ['opencode-go', null] });
    expect(usageCostLine(estimateUsageCost(rows, {}))).toBe(USAGE_UNPRICED);
    expect(USAGE_UNPRICED).toBe('未填写单价，无法估算');
    expect(estimateUsageCost([], { 'opencode-go': price })).toEqual({ state: 'unpriced', missingRoutes: [] });
  });
});

const projection: UsageProjection = {
  range: 'all', groupBy: 'book', asOf: '2026-10-17T00:00:00.000Z', since: null, unrecordedRuns: 0, emptyLabel: null,
  totals: { runCount: 3, inputTokens: 3000, outputTokens: 600, byRoute: [] },
  rows: [
    { key: 'b1b1b1b1-0000-4000-8000-000000000001', label: '《含逗号，的书名》', runCount: 2, inputTokens: 2000, outputTokens: 400,
      byRoute: [{ route: 'opencode-go', runCount: 1, inputTokens: 1500, outputTokens: 300 }, { route: null, runCount: 1, inputTokens: 500, outputTokens: 100 }], runs: [] },
  ],
};

describe('the CSV', () => {
  it('holds numbers and ids only: no title, no label, no prose, one line per group and route', () => {
    const csv = usageCsv(projection, { 'opencode-go': price });
    expect(csv.split('\r\n')).toEqual([
      'group,group_id,route_id,run_count,input_tokens,output_tokens,estimated_cost,currency,price_entered_on',
      'book,b1b1b1b1-0000-4000-8000-000000000001,opencode-go,1,1500,300,0.0054,CNY,2026-10-17',
      'book,b1b1b1b1-0000-4000-8000-000000000001,,1,500,100,,,',
      '',
    ]);
    expect(csv).not.toMatch(/\p{Script=Han}/u);
    expect(csv).not.toContain('，');
  });

  it('withholds a cell that is not an identifier rather than quoting text into the file', () => {
    const odd: UsageProjection = { ...projection, groupBy: 'taskKind', rows: [{ ...projection.rows[0]!, key: '图书 甲', byRoute: [{ route: 'a b', runCount: 1, inputTokens: 1, outputTokens: 1 }] }] };
    expect(usageCsv(odd, {}).split('\r\n')[1]).toBe('task_kind,,,1,1,1,,,');
  });
});

describe('the words', () => {
  it('names a Task kind, a period, a route and an amount in the editor\'s words', () => {
    expect(usageTaskKindLabel('baseline-manuscript-analysis')).toBe('稿件分析');
    expect(usageTaskKindLabel('editorial-review/language')).toBe('审阅');
    expect(usageTaskKindLabel('something-new')).toBe('something-new');
    expect(usagePeriodLabel('2026-10-17T08')).toBe('2026-10-17 08 时');
    expect(usagePeriodLabel('2026-10')).toBe('2026-10');
    expect(usageRowLabel('time', '2026-10-17', '2026-10-17')).toBe('2026-10-17');
    expect(usageRowLabel('book', 'id', '书名')).toBe('书名');
    expect(usageRouteLabel(null)).toBe(UNBOUND_ROUTE_LABEL);
    expect(usageRouteLabel('opencode-go')).toContain('OpenCode Go');
    expect(moneyText('CNY', 0.00543)).toBe('¥0.0054');
    expect(moneyText('GBP', 12.5)).toBe('GBP 12.50');
  });

  it('says each refusal with the reserved key or the command and contexts it would make ambiguous', () => {
    expect(bindingRefusalLabel('editable-text', null, [], 'Ctrl+C')).toBe('「Ctrl+C」用于输入文字、移动光标或编辑稿件，不能设为快捷键。请加上 Ctrl/Command 或 Alt 组合，或选用功能键。');
    expect(bindingRefusalLabel('os-reserved', null, [], 'Alt+F4')).toBe('「Alt+F4」由操作系统或窗口保留，不能设为快捷键。');
    expect(bindingRefusalLabel('ime-reserved', null, [], 'Ctrl+Space')).toBe('「Ctrl+Space」由输入法保留，不能设为快捷键。');
    expect(bindingRefusalLabel('exact-conflict', '查找', ['整个应用', '稿件编辑'])).toBe('与「查找」的快捷键完全相同，在整个应用、稿件编辑里会含糊，未设置。');
    expect(bindingRefusalLabel('prefix-conflict', '知识库', ['整个应用'])).toBe('与「知识库」的快捷键前后相接（一个是另一个的开头），在整个应用里会含糊，未设置。');
  });
});
