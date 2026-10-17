import {
  MODEL_SERVICE_ROUTES,
  USAGE_GROUPINGS,
  USAGE_RANGES,
  USAGE_ROW_RUN_LINKS,
  type RendererApi,
  type UsageGrouping,
  type UsageProjection,
  type UsageRange,
  type UsageRunLinkProjection,
} from '../shared/protocol.js';
import { parseUnitPrices, type UnitPrices } from '../shared/preferences.js';
import { estimateUsageCost } from '../shared/usage.js';
import {
  USAGE_EMPTY,
  USAGE_EXPORT,
  USAGE_EXPORT_NOTE,
  USAGE_GROUPING_HEADING,
  USAGE_LEDE,
  USAGE_PRICES_HEADING,
  USAGE_PRICES_LEDE,
  USAGE_RANGE_HEADING,
  USAGE_RUNS_TRUNCATED,
  USAGE_STATUS_LINES,
  USAGE_UNRECORDED_NOTE,
  moneyText,
  tokenText,
  usageCostLine,
  usageGroupingLabel,
  usageRangeLabel,
  usageRouteLabel,
  usageRowLabel,
  usageRunLinkLabel,
  usageRunsSummary,
  usageTotalsLine,
} from './usage-labels.js';

/**
 * 设置 › 服务 › 用量 (Issue #936, plan slice 11c; V2-UX-MSET-010; Owner decision 15): the Runs already recorded, summed by Book,
 * Task kind or period, each row linking its exact Runs; the estimate is tokens × the unit price the editor entered for the
 * route, shown as 估算 beside the day the price was entered, and absent — never zero — where no price was entered.
 */

type Status = (message: string, tone?: 'busy' | 'success' | 'error') => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface MountUsageOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectUsage' | 'exportUsageCsv' | 'getPreferences' | 'savePreference'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly instant: (iso: string) => string;
  /** Opens the existing surface of one Run. */
  readonly openRun: (run: UsageRunLinkProjection) => void;
  /** The day a price is entered, `YYYY-MM-DD`. */
  readonly today?: () => string;
}

function localDay(): string {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function mountUsage(options: MountUsageOptions): void {
  const { root, api, setStatus, errorMessage, instant, openRun } = options;
  const today = options.today ?? localDay;
  root.classList.add('usage-page');
  let range: UsageRange = 'month';
  let groupBy: UsageGrouping = 'book';
  let usage: UsageProjection | null = null;
  let prices: UnitPrices = {};
  let busy = false;

  const table = el('div', 'usage-table-host');
  const controls = el('div', 'usage-controls');
  const pricesHost = el('section', 'source-card usage-prices');
  const exportRow = el('div', 'button-row');

  const choice = <T extends string>(heading: string, kind: 'range' | 'grouping', values: readonly T[], current: T, label: (value: T) => string, pick: (value: T) => void): HTMLElement => {
    const group = el('fieldset', 'usage-choice');
    group.append(el('legend', undefined, heading));
    for (const value of values) {
      const wrapper = el('label', 'usage-choice-option');
      const input = el('input');
      input.type = 'radio';
      input.name = `usage-${kind}`;
      input.value = value;
      input.checked = value === current;
      input.dataset[kind === 'range' ? 'usageRange' : 'usageGrouping'] = value;
      input.addEventListener('change', () => pick(value));
      wrapper.append(input, el('span', undefined, label(value)));
      group.append(wrapper);
    }
    return group;
  };

  const paintControls = (): void => {
    controls.replaceChildren(
      choice(USAGE_RANGE_HEADING, 'range', USAGE_RANGES, range, usageRangeLabel, (value) => { range = value; void load(); }),
      choice(USAGE_GROUPING_HEADING, 'grouping', USAGE_GROUPINGS, groupBy, usageGroupingLabel, (value) => { groupBy = value; void load(); }),
    );
  };

  const paintTable = (): void => {
    table.replaceChildren();
    if (usage === null) return;
    root.dataset['usageRange'] = usage.range;
    root.dataset['usageGrouping'] = usage.groupBy;
    root.dataset['usageRuns'] = String(usage.totals.runCount);
    if (usage.emptyLabel !== null) {
      const empty = el('p', 'field-note usage-empty', USAGE_EMPTY);
      empty.dataset['usageEmpty'] = 'true';
      table.append(empty);
    } else {
      delete root.dataset['usageEmpty'];
      const grid = el('table', 'usage-table');
      const head = el('tr');
      for (const heading of ['', '运行次数', '输入词元', '输出词元', '估算费用']) {
        const cell = el('th', undefined, heading === '' ? usageGroupingLabel(usage.groupBy).replace('按', '') : heading);
        cell.scope = 'col';
        head.append(cell);
      }
      const header = el('thead');
      header.append(head);
      grid.append(el('caption', 'visually-hidden', `${usageRangeLabel(usage.range)} · ${usageGroupingLabel(usage.groupBy)}`), header);
      const body = el('tbody');
      for (const row of usage.rows) {
        const line = el('tr');
        line.dataset['usageRow'] = row.key;
        const name = el('th', undefined, usageRowLabel(usage.groupBy, row.key, row.label));
        name.scope = 'row';
        const cost = el('td', 'usage-cost', usageCostLine(estimateUsageCost(row.byRoute, prices)));
        cost.dataset['usageCost'] = 'true';
        line.append(name, el('td', undefined, tokenText(row.runCount)), el('td', undefined, tokenText(row.inputTokens)), el('td', undefined, tokenText(row.outputTokens)), cost);
        body.append(line);
        // The row's exact Runs, one deliberate step below the figures.
        const runs = el('tr', 'usage-runs-row');
        const cell = el('td');
        cell.colSpan = 5;
        const details = el('details', 'usage-runs');
        details.append(el('summary', undefined, usageRunsSummary(row.runCount)));
        const list = el('ul');
        for (const run of row.runs) {
          const item = el('li');
          const open = el('button', 'quiet', usageRunLinkLabel(run, instant));
          open.type = 'button';
          open.dataset['usageRunRecord'] = run.runRecordId;
          open.addEventListener('click', () => {
            setStatus(USAGE_STATUS_LINES.opening, 'busy');
            openRun(run);
          });
          item.append(open, el('span', 'field-note', ` · ${usageRouteLabel(run.route)}`));
          list.append(item);
        }
        details.append(list);
        if (row.runCount > row.runs.length) details.append(el('p', 'field-note', USAGE_RUNS_TRUNCATED(USAGE_ROW_RUN_LINKS, row.runCount)));
        cell.append(details);
        runs.append(cell);
        body.append(runs);
      }
      grid.append(body);
      const totalsCost = usageCostLine(estimateUsageCost(usage.totals.byRoute, prices));
      const foot = el('p', 'usage-totals', `${usageTotalsLine(usage)} · ${totalsCost}`);
      foot.dataset['usageTotals'] = 'true';
      table.append(grid, foot);
    }
    if (usage.unrecordedRuns > 0) table.append(el('p', 'field-note usage-unrecorded', USAGE_UNRECORDED_NOTE(usage.unrecordedRuns)));
    exportRow.hidden = usage.emptyLabel !== null;
  };

  const routesShown = (): string[] => {
    const found = new Set<string>(MODEL_SERVICE_ROUTES);
    for (const route of Object.keys(prices)) found.add(route);
    for (const entry of usage?.totals.byRoute ?? []) if (entry.route !== null) found.add(entry.route);
    return [...found];
  };

  const savePrices = async (next: UnitPrices, done: string): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const saved = await api.savePreference({ key: 'usage.unitPrices', value: next });
      prices = saved.values['usage.unitPrices'];
      paintPrices();
      paintTable();
      setStatus(done, 'success');
    } catch (error) {
      setStatus(errorMessage(error, USAGE_STATUS_LINES.priceFailed), 'error');
    } finally {
      busy = false;
    }
  };

  const paintPrices = (): void => {
    pricesHost.replaceChildren(el('h3', undefined, USAGE_PRICES_HEADING), el('p', 'field-note', USAGE_PRICES_LEDE));
    for (const route of routesShown()) {
      const held = prices[route];
      const form = el('form', 'usage-price');
      form.dataset['usagePriceRoute'] = route;
      form.noValidate = true;
      const title = el('h4', undefined, usageRouteLabel(route));
      const field = (labelText: string, name: string, value: string, mode: 'decimal' | 'text', width: number): HTMLInputElement => {
        const label = el('label', 'usage-price-field', labelText);
        const input = el('input');
        input.type = 'text';
        input.inputMode = mode;
        input.name = name;
        input.value = value;
        input.size = width;
        input.autocomplete = 'off';
        label.append(input);
        form.append(label);
        return input;
      };
      form.append(title);
      const input = field('输入单价（每百万词元）', 'inputPerMillion', held === undefined ? '' : String(held.inputPerMillion), 'decimal', 10);
      const output = field('输出单价（每百万词元）', 'outputPerMillion', held === undefined ? '' : String(held.outputPerMillion), 'decimal', 10);
      const currency = field('币种', 'currency', held?.currency ?? 'CNY', 'text', 5);
      const note = el('p', 'field-note usage-price-note', held === undefined ? '未填写单价' : `${moneyText(held.currency, held.inputPerMillion)} / ${moneyText(held.currency, held.outputPerMillion)}（录入于 ${held.enteredAt}）`);
      note.setAttribute('role', 'status');
      const save = el('button', 'secondary', '保存单价');
      save.type = 'submit';
      const clear = el('button', 'quiet', '清除');
      clear.type = 'button';
      clear.disabled = held === undefined;
      clear.addEventListener('click', () => {
        void savePrices(Object.fromEntries(Object.entries(prices).filter(([held]) => held !== route)), USAGE_STATUS_LINES.priceCleared);
      });
      const actions = el('div', 'button-row');
      actions.append(save, clear);
      form.append(note, actions);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const candidate = parseUnitPrices({
          ...prices,
          [route]: { inputPerMillion: Number(input.value.trim()), outputPerMillion: Number(output.value.trim()), currency: currency.value.trim().toUpperCase(), enteredAt: today() },
        });
        const valid = input.value.trim() !== '' && output.value.trim() !== '' && candidate !== null;
        if (!valid) {
          note.textContent = USAGE_STATUS_LINES.priceInvalid;
          setStatus(USAGE_STATUS_LINES.priceInvalid, 'error');
          return;
        }
        void savePrices(candidate, USAGE_STATUS_LINES.priceSaved);
      });
      pricesHost.append(form);
    }
  };

  const load = async (): Promise<void> => {
    setStatus(USAGE_STATUS_LINES.loading, 'busy');
    try {
      usage = await api.inspectUsage({ range, groupBy });
      paintTable();
      paintPrices();
      setStatus(USAGE_STATUS_LINES.loaded, 'success');
    } catch (error) {
      setStatus(errorMessage(error, USAGE_STATUS_LINES.failed), 'error');
    }
  };

  const exportButton = el('button', 'secondary', USAGE_EXPORT);
  exportButton.type = 'button';
  exportButton.dataset['usageExport'] = 'csv';
  exportButton.addEventListener('click', () => {
    exportButton.disabled = true;
    setStatus(USAGE_STATUS_LINES.exporting, 'busy');
    api.exportUsageCsv({ range, groupBy })
      .then((result) => setStatus(result.outcome === 'cancelled' ? USAGE_STATUS_LINES.exportCancelled : USAGE_STATUS_LINES.exported, 'success'))
      .catch((error: unknown) => setStatus(errorMessage(error, USAGE_STATUS_LINES.exportFailed), 'error'))
      .finally(() => { exportButton.disabled = false; });
  });
  exportRow.append(exportButton, el('span', 'field-note', USAGE_EXPORT_NOTE));

  paintControls();
  root.append(el('p', 'field-note', USAGE_LEDE), controls, table, exportRow, pricesHost);
  void (async () => {
    try {
      prices = (await api.getPreferences()).values['usage.unitPrices'];
    } catch {
      prices = {};
    }
    await load();
  })();
}
