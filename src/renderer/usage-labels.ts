import {
  MODEL_SERVICE_ROUTE_BINDINGS,
  MODEL_SERVICE_ROUTES,
  USAGE_EMPTY_LABEL,
  type ModelServiceRouteId,
  type UsageGrouping,
  type UsageProjection,
  type UsageRange,
  type UsageRunLinkProjection,
} from '../shared/protocol.js';
import { UNBOUND_ROUTE_LABEL, type UsageCostEstimate } from '../shared/usage.js';

/**
 * 设置 › 服务 › 用量's words (Issue #936, plan slice 11c; V2-UX-MSET-010). Pure, so the unit suite pins every line. A cost is
 * always 估算, always beside the day the editor entered the price, and never a figure a model service reported.
 */

export const USAGE_TITLE = '用量';
export const USAGE_SECTION_LABEL = '设置 · 服务 · 用量';
export const USAGE_LEDE = '按已经记录的运行，汇总模型服务用掉的词元（输入与输出分开）。这里不另行记账：数字来自各次运行自己的运行报告。';
export const USAGE_EMPTY = USAGE_EMPTY_LABEL;
export const USAGE_RANGE_HEADING = '时间范围';
export const USAGE_GROUPING_HEADING = '汇总方式';
export const USAGE_RETURN = '返回';
export const USAGE_EXPORT = '导出为 CSV…';
export const USAGE_EXPORT_NOTE = 'CSV 只含数字和标识，不含书名或任何文字。';
export const USAGE_PRICES_HEADING = '单价';
export const USAGE_PRICES_LEDE = '单价由你自行录入，AI7 不会向模型服务商查询价格。估算费用 = 词元数 × 你录入的单价，只是估算，不是账单。';
export const USAGE_UNPRICED = '未填写单价，无法估算';
export const USAGE_UNRECORDED_NOTE = (count: number): string => `另有 ${count.toLocaleString('zh-CN')} 次运行在运行报告出现之前结束，没有用量记录，未计入。`;
export const USAGE_MORE_RUNS = '显示更多运行';
export const USAGE_RUNS_SHOWN = (shown: number, total: number): string => `已列出 ${shown.toLocaleString('zh-CN')} 次运行，共 ${total.toLocaleString('zh-CN')} 次。`;
export const USAGE_COLUMNS = ['运行次数', '输入词元', '输出词元', '估算费用'] as const;
export const USAGE_PRICE_FIELDS = { input: '输入单价（每百万词元）', output: '输出单价（每百万词元）', currency: '币种', save: '保存单价', clear: '清除', empty: '未填写单价' } as const;
export const USAGE_RUN_TITLE = '运行详情';
export const USAGE_RUN_REPORT_ABSENT = '这次运行的报告不可用。';
export const usageRunIdentity = (id: string): string => `运行标识：${id}`;
export const usagePriceNote = (currency: string, input: number, output: number, day: string): string => `${moneyText(currency, input)} / ${moneyText(currency, output)}（录入于 ${day}）`;
export const USAGE_STATUS_LINES = {
  loading: '正在读取用量…',
  loaded: '已读取用量。',
  failed: '无法读取用量。',
  exporting: '正在导出用量表…',
  exported: '已导出用量表。',
  exportCancelled: '已取消导出。',
  exportFailed: '无法导出用量表。',
  priceSaved: '已保存单价。',
  priceCleared: '已清除单价。',
  priceFailed: '无法保存单价。',
  priceInvalid: '请填写 0 以上的数字和三位字母的币种，例如 CNY。',
  opening: '正在打开运行所在的页面…',
  moreFailed: '无法读取更多运行。',
} as const;

const RANGE_LABELS: Readonly<Record<UsageRange, string>> = { day: '近一天', week: '近一周', month: '近一月', all: '全部' };
const GROUPING_LABELS: Readonly<Record<UsageGrouping, string>> = { book: '按图书', taskKind: '按任务类型', time: '按时间' };

export const usageRangeLabel = (range: UsageRange): string => RANGE_LABELS[range];
export const usageGroupingLabel = (groupBy: UsageGrouping): string => GROUPING_LABELS[groupBy];

const KIND_LABELS: Readonly<Record<string, string>> = {
  'global-agent-dialogue': '全域对话',
  'baseline-manuscript-analysis': '稿件分析',
  'factual-review': '事实核查',
  evaluation: 'AI7 初评',
  'readers-report': '审稿意见',
  'evaluation-rewrite': '按我的评分重写评语',
  writing: '写作任务',
};

/** A ledger Task kind in the editor's words; a review category reads as 审阅, and an unknown kind as its own identity. */
export function usageTaskKindLabel(kind: string): string {
  if (kind.startsWith('editorial-review/')) return '审阅';
  return KIND_LABELS[kind] ?? kind;
}

/** A period key (`YYYY-MM-DDTHH`, `YYYY-MM-DD`, `YYYY-MM`) in the machine's own calendar. */
export function usagePeriodLabel(key: string): string {
  const hour = /^(\d{4}-\d{2}-\d{2})T(\d{2})$/u.exec(key);
  return hour === null ? key : `${hour[1]} ${hour[2]} 时`;
}

export function usageRowLabel(groupBy: UsageGrouping, key: string, label: string): string {
  if (groupBy === 'taskKind') return usageTaskKindLabel(key);
  if (groupBy === 'time') return usagePeriodLabel(key);
  return label;
}

export const tokenText = (value: number): string => value.toLocaleString('zh-CN');

/** A route in words: a configured route reads as its service and model, the test route as itself. */
export function usageRouteLabel(route: string | null): string {
  if (route === null) return UNBOUND_ROUTE_LABEL;
  // A channel with multiple eligible models cannot truthfully name its default as historical usage.
  if (route === 'openai-platform') return 'OpenAI 官方';
  if ((MODEL_SERVICE_ROUTES as readonly string[]).includes(route)) {
    const binding = MODEL_SERVICE_ROUTE_BINDINGS[route as ModelServiceRouteId];
    return `${binding.providerLabel} · ${binding.modelLabel}`;
  }
  if (route === 'ai7-local-deterministic') return '本地确定性路线（开发与测试）';
  return route;
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥' };

export function moneyText(currency: string, amount: number): string {
  const digits = amount >= 1 ? 2 : 4;
  const symbol = CURRENCY_SYMBOLS[currency];
  const figure = amount.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return symbol === undefined ? `${currency} ${figure}` : `${symbol}${figure}`;
}

/** The estimate as a row shows it: 估算 with the price source and the day it was entered, or why there is none. */
export function usageCostLine(estimate: UsageCostEstimate): string {
  if (estimate.state === 'unpriced') return USAGE_UNPRICED;
  const amounts = estimate.amounts.map((entry) => moneyText(entry.currency, entry.amount)).join(' + ');
  return `估算 ${amounts} · 按你录入的单价（录入于 ${estimate.enteredOn.join('、')}）`;
}

export function usageRunLinkLabel(run: UsageRunLinkProjection, instant: (iso: string) => string): string {
  return `${usageTaskKindLabel(run.taskKind)} · ${instant(run.recordedAt)} · 输入 ${tokenText(run.inputTokens)} · 输出 ${tokenText(run.outputTokens)}`;
}

export function usageRunsSummary(count: number): string {
  return `查看 ${count.toLocaleString('zh-CN')} 次运行`;
}

export function usageTotalsLine(usage: UsageProjection): string {
  return `共 ${usage.totals.runCount.toLocaleString('zh-CN')} 次运行 · 输入 ${tokenText(usage.totals.inputTokens)} · 输出 ${tokenText(usage.totals.outputTokens)}`;
}
