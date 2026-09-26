import type { DatabaseExportActivityProjection, DatabaseExportPreparationProjection, RendererApi } from '../shared/protocol.js';
import {
  DATABASE_EXPORT_ACTIONS,
  DATABASE_EXPORT_HEADING,
  DATABASE_EXPORT_LEDE,
  DATABASE_EXPORT_NO_RECORDS,
  DATABASE_EXPORT_STATUS_LINES,
  databaseExportActivityLine,
  databaseExportOutcomeLine,
  databaseExportPreparedRows,
  databaseExportRecordLine,
  databaseExportRecordsLabel,
} from './database-export-labels.js';

/**
 * 导出数据库 in 设置 › 数据与存储 (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.7): `导出数据库…` opens the system's
 * Save dialog, and the chosen file prepares the package; the prepared file is stated whole, and `按上述方式导出` — never
 * preselected — writes it, or `取消` leaves nothing written. 导出记录 lists what each approved export came to.
 *
 * Packing and writing run in the service (Issue #434 review; V2-UX-EXP-011): the window follows how far they have come and
 * offers `取消导出` until the file is being put in place. A window opened while an export runs follows it too.
 */

type Status = (message: string, tone?: 'busy' | 'success' | 'error') => void;

/** How often the window reads how far an export under way has come. */
const FOLLOW_MS = 250;

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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export interface MountDatabaseExportOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'chooseDatabaseExportDestination' | 'approveDatabaseExport' | 'inspectDatabaseExports' | 'cancelDatabaseExport'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly instant: (iso: string) => string;
}

export function mountDatabaseExport(options: MountDatabaseExportOptions): void {
  const { root, api, setStatus, errorMessage, instant } = options;
  root.classList.add('database-export');
  let busy = false;
  /** The export this window follows, while it does. */
  let following: string | null = null;
  const prepared = el('div', 'database-export-prepared');
  prepared.hidden = true;
  const records = el('details', 'database-export-records');
  const choose = action(DATABASE_EXPORT_ACTIONS.choose, 'secondary', 'choose', () => void chooseFile());
  const toolbar = el('div', 'button-row');
  toolbar.append(choose);
  const progress = el('div', 'database-export-progress');
  progress.hidden = true;
  const progressLine = el('p', 'database-export-progress-line');
  progressLine.setAttribute('role', 'status');
  const stop = action(DATABASE_EXPORT_ACTIONS.stop, 'secondary', 'stop', () => void stopExport());
  const stopRow = el('div', 'button-row');
  stopRow.append(stop);
  progress.append(progressLine, stopRow);
  root.replaceChildren(el('h3', undefined, DATABASE_EXPORT_HEADING), el('p', 'field-note', DATABASE_EXPORT_LEDE), toolbar, progress, prepared, records);

  // 取消导出 answers the export's own state, never the window's busy one.
  const setBusy = (value: boolean): void => {
    busy = value;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-database-export-action]')) {
      if (button !== stop) button.disabled = value;
    }
  };

  const drawProgress = (activity: DatabaseExportActivityProjection): void => {
    progress.hidden = activity.state !== 'running';
    progress.dataset['step'] = activity.step ?? '';
    progressLine.textContent = databaseExportActivityLine(activity);
    stop.disabled = !activity.cancellable;
  };

  /** Follows the export under way until it ends and answers how it ended, or `null` once the window has gone. */
  const follow = async (started: DatabaseExportActivityProjection): Promise<DatabaseExportActivityProjection | null> => {
    let activity = started;
    following = activity.activityId;
    try {
      while (activity.state === 'running') {
        drawProgress(activity);
        await delay(FOLLOW_MS);
        if (!root.isConnected) return null;
        const next = (await api.inspectDatabaseExports()).activity;
        // Only this export's reading counts: another one there means this one ended while the window could not see it.
        if (next === null || next.activityId !== activity.activityId) throw new Error(DATABASE_EXPORT_STATUS_LINES.lost);
        activity = next;
      }
      drawProgress(activity);
      return activity;
    } finally {
      following = null;
    }
  };

  const stopExport = async (): Promise<void> => {
    const activityId = following;
    if (activityId === null) return;
    stop.disabled = true;
    setStatus(DATABASE_EXPORT_STATUS_LINES.stopping, 'busy');
    try {
      const activity = await api.cancelDatabaseExport({ activityId });
      // It stops at its next step: the window goes on following it until it has.
      if (root.isConnected && following === activityId) drawProgress(activity);
    } catch (error) {
      if (root.isConnected) setStatus(errorMessage(error, DATABASE_EXPORT_STATUS_LINES.stopFailed), 'error');
    }
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
      // A window opened while an export runs follows it as the one that began it would.
      if (history.activity?.state === 'running' && following === null && !busy) void resume(history.activity);
    } catch (error) {
      if (!root.isConnected) return;
      records.replaceChildren(el('p', 'attention-note', errorMessage(error, DATABASE_EXPORT_STATUS_LINES.recordsUnavailable)));
    }
  };

  const showPrepared = (preparation: DatabaseExportPreparationProjection): void => {
    prepared.hidden = false;
    prepared.dataset['preparationId'] = preparation.preparationId;
    prepared.dataset['disposition'] = preparation.disposition;
    delete prepared.dataset['outcome'];
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

  /** A preparation that ended: the prepared file to approve, nothing written, or why not. */
  const settlePreparation = (ended: DatabaseExportActivityProjection): void => {
    if (ended.state === 'prepared' && ended.preparation !== null) {
      setBusy(false);
      showPrepared(ended.preparation);
      setStatus(DATABASE_EXPORT_STATUS_LINES.prepared, 'success');
    } else if (ended.state === 'cancelled') {
      setStatus(DATABASE_EXPORT_STATUS_LINES.closed);
      choose.focus();
    } else {
      setStatus(ended.failure?.message ?? DATABASE_EXPORT_STATUS_LINES.prepareFailed, 'error');
    }
  };

  /** An approval that ended: what it came to, the prepared file as it was, or why not. */
  const settleApproval = async (ended: DatabaseExportActivityProjection): Promise<void> => {
    if (ended.state === 'finished' && ended.receipt !== null) {
      const receipt = ended.receipt;
      const outcome = el('p', `database-export-outcome outcome-${receipt.outcome}`, databaseExportOutcomeLine(receipt));
      outcome.setAttribute('role', 'status');
      prepared.hidden = false;
      prepared.dataset['outcome'] = receipt.outcome;
      prepared.replaceChildren(outcome);
      const exported = receipt.outcome === 'created' || receipt.outcome === 'replaced';
      setStatus(receipt.outcomeLabel, exported ? 'success' : 'error');
      await showRecords();
      choose.focus();
    } else if (ended.state === 'cancelled') {
      // Stopped before the approval was recorded: the prepared file is as it was, and 按上述方式导出 may take it again.
      setStatus(DATABASE_EXPORT_STATUS_LINES.writingStopped);
      prepared.querySelector<HTMLButtonElement>('[data-database-export-action="approve"]')?.focus();
    } else {
      setStatus(ended.failure?.message ?? DATABASE_EXPORT_STATUS_LINES.approveFailed, 'error');
    }
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
      setStatus(DATABASE_EXPORT_STATUS_LINES.packing, 'busy');
      const ended = await follow(result.activity);
      if (ended === null) return;
      settlePreparation(ended);
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
      const ended = await follow(await api.approveDatabaseExport({ preparationId }));
      if (ended === null || !root.isConnected) return;
      await settleApproval(ended);
    } catch (error) {
      if (!root.isConnected) return;
      setStatus(errorMessage(error, DATABASE_EXPORT_STATUS_LINES.approveFailed), 'error');
    } finally {
      if (root.isConnected) setBusy(false);
    }
  };

  const resume = async (activity: DatabaseExportActivityProjection): Promise<void> => {
    setBusy(true);
    setStatus(activity.kind === 'prepare' ? DATABASE_EXPORT_STATUS_LINES.packing : DATABASE_EXPORT_STATUS_LINES.writing, 'busy');
    try {
      const ended = await follow(activity);
      if (ended === null || !root.isConnected) return;
      if (ended.kind === 'prepare') settlePreparation(ended);
      else await settleApproval(ended);
    } catch (error) {
      if (!root.isConnected) return;
      setStatus(errorMessage(error, activity.kind === 'prepare' ? DATABASE_EXPORT_STATUS_LINES.prepareFailed : DATABASE_EXPORT_STATUS_LINES.approveFailed), 'error');
    } finally {
      if (root.isConnected) setBusy(false);
    }
  };

  void showRecords();
}
