import type { UnitPrices } from './preferences.js';
import type { UsageGrouping, UsageRouteTokensProjection, UsageProjection } from './protocol.js';

/**
 * 用量's estimate and its CSV (Issue #936, plan slice 11c). A cost is tokens × the unit price the editor typed for that route —
 * never a price a Provider reported (Owner decision 15) — and it is only ever offered as 估算, beside the day the price was
 * entered. One route without a price makes the whole figure unavailable: a partial sum would read as a total.
 */

export type UsageCostEstimate =
  | { state: 'unpriced'; missingRoutes: ReadonlyArray<string | null> }
  | { state: 'estimated'; amounts: ReadonlyArray<{ currency: string; amount: number }>; enteredOn: ReadonlyArray<string> };

/** The route a Run ran on, or the word for a Run that never bound one. */
export const UNBOUND_ROUTE_LABEL = '未绑定模型服务';

export function estimateUsageCost(byRoute: ReadonlyArray<UsageRouteTokensProjection>, prices: UnitPrices): UsageCostEstimate {
  const missing: Array<string | null> = [];
  const amounts = new Map<string, number>();
  const enteredOn = new Set<string>();
  for (const entry of byRoute) {
    if (entry.inputTokens === 0 && entry.outputTokens === 0) continue;
    const price = entry.route === null ? undefined : prices[entry.route];
    if (price === undefined) {
      missing.push(entry.route);
      continue;
    }
    const cost = (entry.inputTokens / 1_000_000) * price.inputPerMillion + (entry.outputTokens / 1_000_000) * price.outputPerMillion;
    amounts.set(price.currency, (amounts.get(price.currency) ?? 0) + cost);
    enteredOn.add(price.enteredAt);
  }
  if (missing.length > 0 || amounts.size === 0) return { state: 'unpriced', missingRoutes: missing };
  return {
    state: 'estimated',
    amounts: [...amounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => ({ currency, amount })),
    enteredOn: [...enteredOn].sort(),
  };
}

/** Six decimals: enough for a single short Run, and the same figure every time. */
function plainNumber(value: number): string {
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

export const USAGE_CSV_HEADER = ['group', 'group_id', 'route_id', 'run_count', 'input_tokens', 'output_tokens', 'estimated_cost', 'currency', 'price_entered_on'] as const;

const GROUP_NAME: Readonly<Record<UsageGrouping, string>> = { book: 'book', taskKind: 'task_kind', time: 'period' };

/** Ids that may stand in a CSV cell without quoting: the ledger's own identifiers and period keys, nothing typed by a person. */
const CSV_SAFE_CELL = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;

function cell(value: string): string {
  if (value === '') return '';
  // A cell is an id, a count or a number; anything else is withheld rather than quoted, so no text column can form.
  return CSV_SAFE_CELL.test(value) ? value : '';
}

/**
 * The table as CSV: one line per group and route, numbers and ids only — no Book title, no label, no prose. Rows are
 * the projection's own order; a route with no entered price leaves its cost cells empty.
 */
export function usageCsv(usage: UsageProjection, prices: UnitPrices): string {
  const lines: string[] = [USAGE_CSV_HEADER.join(',')];
  for (const row of usage.rows) {
    for (const entry of row.byRoute) {
      const estimate = estimateUsageCost([entry], prices);
      const first = estimate.state === 'estimated' ? estimate.amounts[0] : undefined;
      lines.push([
        GROUP_NAME[usage.groupBy], cell(row.key), cell(entry.route ?? ''), String(entry.runCount), String(entry.inputTokens), String(entry.outputTokens),
        first === undefined ? '' : plainNumber(first.amount), first === undefined ? '' : first.currency,
        estimate.state === 'estimated' ? (estimate.enteredOn[0] ?? '') : '',
      ].join(','));
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}
