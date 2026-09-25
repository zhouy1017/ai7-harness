import type { DatabaseExportPreparationProjection, RendererApi } from '../shared/protocol.js';
import {
  DATABASE_EXPORT_ACTIONS,
  DATABASE_EXPORT_HEADING,
  DATABASE_EXPORT_LEDE,
  DATABASE_EXPORT_NO_RECORDS,
  DATABASE_EXPORT_STATUS_LINES,
  databaseExportOutcomeLine,
  databaseExportPreparedRows,
  databaseExportRecordLine,
  databaseExportRecordsLabel,
} from './database-export-labels.js';

/**
 * 导出数据库 in 设置 › 数据与存储 (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.7): `导出数据库…` opens the system's
 * Save dialog, and the chosen file prepares the package; the prepared file is stated whole, and `按上述方式导出` — never
 * preselected — writes it, or `取消` leaves nothing written. 导出记录 lists what each approved export came to.
 */

type Status = (message: string, tone?: 'busy' | 'success' | 'error') => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['databaseExportAction'] = name;
  node.addEventListener('click', run);
  return node;
}

export interface MountDatabaseExportOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'chooseDatabaseExportDestination' | 'approveDatabaseExport' | 'inspectDatabaseExports'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly instant: (iso: string) => string;
}

export function mountDatabaseExport(options: MountDatabaseExportOptions): void {
  const { root, api, setStatus, errorMessage, instant } = options;
  root.classList.add('database-export');
  let busy = false;
  const prepared = el('div', 'database-export-prepared');
  prepared.hidden = true;
  const records = el('details', 'database-export-records');
  const choose = action(DATABASE_EXPORT_ACTIONS.choose, 'secondary', 'choose', () => void chooseFile());
  const toolbar = el('div', 'button-row');
  toolbar.append(choose);
  root.replaceChildren(el('h3', undefined, DATABASE_EXPORT_HEADING), el('p', 'field-note', DATABASE_EXPORT_LEDE), toolbar, prepared, records);

  const setBusy = (value: boolean): void => {
    busy = value;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-database-export-action]')) button.disabled = value;
  };

  const showRecords = async (): Promise<void> => {
    try {
      const history = await api.inspectDatabaseExports();
      if (!root.isConnected) return;
      root.dataset['databaseExports'] = String(history.total);
      const list = el('ol');
      for (const receipt of history.exports) list.append(el('li', `database-export-record outcome-${receipt.outcome}`, databaseExportRecordLine(receipt, instant)));
      records.replaceChildren(
        el('summary', undefined, databaseExportRecordsLabel(history.exports.length, history.total)),
        history.total === 0 ? el('p', 'field-note', DATABASE_EXPORT_NO_RECORDS) : list,
      );
    } catch (error) {
      if (!root.isConnected) return;
      records.replaceChildren(el('p', 'attention-note', errorMessage(error, DATABASE_EXPORT_STATUS_LINES.recordsUnavailable)));
    }
  };

  const showPrepared = (preparation: DatabaseExportPreparationProjection): void => {
    prepared.hidden = false;
    prepared.dataset['preparationId'] = preparation.preparationId;
    prepared.dataset['disposition'] = preparation.disposition;
    const rows = el('dl');
    for (const [term, value] of databaseExportPreparedRows(preparation)) rows.append(el('dt', undefined, term), el('dd', undefined, value));
    const approve = action(DATABASE_EXPORT_ACTIONS.approve, 'primary', 'approve', () => void approveFile(preparation.preparationId));
    const cancel = action(DATABASE_EXPORT_ACTIONS.cancel, 'quiet', 'cancel', () => {
      prepared.hidden = true;
      prepared.replaceChildren();
      delete prepared.dataset['preparationId'];
      setStatus(DATABASE_EXPORT_STATUS_LINES.closed);
      choose.focus();
    });
    const buttons = el('div', 'button-row');
    buttons.append(approve, cancel);
    prepared.replaceChildren(rows, buttons);
    approve.focus();
  };

  const chooseFile = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus(DATABASE_EXPORT_STATUS_LINES.choosing, 'busy');
    try {
      const result = await api.chooseDatabaseExportDestination();
      if (!root.isConnected) return;
      if (result.outcome === 'cancelled') {
        setStatus(DATABASE_EXPORT_STATUS_LINES.cancelled);
        return;
      }
      setBusy(false);
      showPrepared(result.preparation);
      setStatus(DATABASE_EXPORT_STATUS_LINES.prepared, 'success');
    } catch (error) {
      if (!root.isConnected) return;
      setStatus(errorMessage(error, DATABASE_EXPORT_STATUS_LINES.prepareFailed), 'error');
    } finally {
      if (root.isConnected) setBusy(false);
    }
  };

  const approveFile = async (preparationId: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus(DATABASE_EXPORT_STATUS_LINES.writing, 'busy');
    try {
      const receipt = await api.approveDatabaseExport({ preparationId });
      if (!root.isConnected) return;
      const outcome = el('p', `database-export-outcome outcome-${receipt.outcome}`, databaseExportOutcomeLine(receipt));
      outcome.setAttribute('role', 'status');
      prepared.dataset['outcome'] = receipt.outcome;
      prepared.replaceChildren(outcome);
      const exported = receipt.outcome === 'created' || receipt.outcome === 'replaced';
      setStatus(receipt.outcomeLabel, exported ? 'success' : 'error');
      await showRecords();
      choose.focus();
    } catch (error) {
      if (!root.isConnected) return;
      setStatus(errorMessage(error, DATABASE_EXPORT_STATUS_LINES.approveFailed), 'error');
    } finally {
      if (root.isConnected) setBusy(false);
    }
  };

  void showRecords();
}
