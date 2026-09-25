import type { DatabaseImportPreviewProjection, DatabaseReplacementsProjection, RendererApi } from '../shared/protocol.js';
import {
  DATABASE_IMPORT_ACTIONS,
  DATABASE_IMPORT_CHOICES,
  DATABASE_IMPORT_CHOICES_LEGEND,
  DATABASE_IMPORT_HEADING,
  DATABASE_IMPORT_LEDE,
  DATABASE_IMPORT_STATUS_LINES,
  DATABASE_MERGE_CONSEQUENCE,
  DATABASE_MERGE_NOTHING,
  DATABASE_MERGE_NOTICE_LINES,
  DATABASE_REPLACE_CONSEQUENCE,
  DATABASE_REPLACEMENT_NO_RECORDS,
  databaseImportBookLine,
  databaseImportPreviewRows,
  databaseImportRefusalLine,
  databasePendingLines,
  databaseReplacementRecordLine,
  databaseReplacementRecordsLabel,
  databaseRollBackLines,
} from './database-import-labels.js';

/**
 * 导入数据库 in 设置 › 数据与存储 (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.3, §1.4): `导入数据库…` opens the
 * system's Open dialog, and the chosen file is read and verified whole before anything else — its file, origin, versions,
 * contents and integrity stated. A file that fits this AI7 offers two choices, neither preselected, and `按所选方式导入` does
 * only what was chosen: `替换本机全部数据` backs the data up and waits for AI7's next start, with `现在关闭 AI7` and `取消替换`;
 * `只导入其中的图书` (S86d) names each Book as the merge would take it and what stays behind, backs the data up, and merges at
 * the next start. Once a replacement has come to pass, `回退到替换前的数据…` offers its backup back, after a confirmation of its
 * own.
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
  node.dataset['databaseImportAction'] = name;
  node.addEventListener('click', run);
  return node;
}

export interface MountDatabaseImportOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi,
    'chooseDatabaseImportFile' | 'prepareDatabaseReplacement' | 'cancelDatabaseReplacement' | 'inspectDatabaseReplacements' |
    'rollBackDatabaseReplacement' | 'prepareDatabaseMerge' | 'quitApplication'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly instant: (iso: string) => string;
}

export function mountDatabaseImport(options: MountDatabaseImportOptions): void {
  const { root, api, setStatus, errorMessage, instant } = options;
  root.classList.add('database-import');
  let busy = false;
  let state: DatabaseReplacementsProjection | null = null;
  const preview = el('div', 'database-import-preview');
  preview.hidden = true;
  const pending = el('div', 'database-import-pending');
  pending.hidden = true;
  const rollBack = el('div', 'database-import-roll-back');
  rollBack.hidden = true;
  const records = el('details', 'database-import-records');
  const choose = action(DATABASE_IMPORT_ACTIONS.choose, 'secondary', 'choose', () => void chooseFile());
  const toolbar = el('div', 'button-row');
  toolbar.append(choose);
  root.replaceChildren(el('h3', undefined, DATABASE_IMPORT_HEADING), el('p', 'field-note', DATABASE_IMPORT_LEDE), toolbar, preview, pending, rollBack, records);

  const setBusy = (value: boolean): void => {
    busy = value;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-database-import-action]')) {
      const name = button.dataset['databaseImportAction'];
      button.disabled = value || (name === 'confirm' && button.dataset['chosen'] !== 'true') || (name === 'choose' && (state?.pending ?? null) !== null);
    }
    for (const input of root.querySelectorAll<HTMLInputElement>('input[name="database-import-choice"]')) input.disabled = value;
  };

  const closePreview = (): void => {
    preview.hidden = true;
    preview.replaceChildren();
    delete preview.dataset['previewId'];
    delete preview.dataset['compatibility'];
  };

  /** The replacement waiting, the one that can be rolled back, and 替换记录, from what the service answered. */
  const show = (projection: DatabaseReplacementsProjection): void => {
    state = projection;
    root.dataset['pending'] = String(projection.pending !== null);
    root.dataset['replacements'] = String(projection.total);
    if (projection.rollBackOf === null) delete root.dataset['rollBackOf'];
    else root.dataset['rollBackOf'] = projection.rollBackOf;
    // One replacement waits at a time: while one does, no other file is taken.
    choose.disabled = busy || projection.pending !== null;

    if (projection.pending === null) {
      pending.hidden = true;
      pending.replaceChildren();
      delete pending.dataset['replacementId'];
    } else {
      const waiting = projection.pending;
      pending.hidden = false;
      pending.dataset['replacementId'] = waiting.replacementId;
      pending.dataset['kind'] = waiting.kind;
      const lines = databasePendingLines(waiting);
      const first = el('p', 'database-import-pending-state', lines[0]);
      first.setAttribute('role', 'status');
      const buttons = el('div', 'button-row');
      buttons.append(
        action(DATABASE_IMPORT_ACTIONS.quit, 'primary', 'quit', () => void quit()),
        action(waiting.kind === 'roll-back' ? DATABASE_IMPORT_ACTIONS.cancelRollBack : waiting.kind === 'merge' ? DATABASE_IMPORT_ACTIONS.cancelMerge
          : DATABASE_IMPORT_ACTIONS.cancelReplacement, 'quiet', 'cancel-replacement',
          () => void cancelReplacement(waiting.replacementId)),
      );
      pending.replaceChildren(first, el('p', 'field-note', lines[1]), el('p', 'attention-note', lines[2]), buttons);
    }

    const target = projection.rollBackOf === null ? undefined : projection.replacements.find((record) => record.replacementId === projection.rollBackOf);
    if (target === undefined) {
      rollBack.hidden = true;
      rollBack.replaceChildren();
    } else {
      rollBack.hidden = false;
      const [offer, consequence] = databaseRollBackLines(target);
      const open = action(DATABASE_IMPORT_ACTIONS.rollBack, 'secondary', 'roll-back', () => {
        const confirmation = el('div', 'database-import-roll-back-confirm');
        const confirm = action(DATABASE_IMPORT_ACTIONS.confirmRollBack, 'primary', 'confirm-roll-back', () => void rollBackTo(target.replacementId));
        const keep = action(DATABASE_IMPORT_ACTIONS.keep, 'quiet', 'keep', () => {
          confirmation.remove();
          open.hidden = false;
          open.focus();
        });
        const buttons = el('div', 'button-row');
        buttons.append(confirm, keep);
        confirmation.append(el('p', 'attention-note', consequence), buttons);
        open.hidden = true;
        rollBack.append(confirmation);
        keep.focus();
      });
      rollBack.replaceChildren(el('p', 'field-note', offer), open);
    }

    const list = el('ol');
    for (const record of projection.replacements) {
      list.append(el('li', `database-replacement-record outcome-${record.outcome}`, databaseReplacementRecordLine(record, instant)));
    }
    records.replaceChildren(
      el('summary', undefined, databaseReplacementRecordsLabel(projection.replacements.length, projection.total)),
      projection.total === 0 ? el('p', 'field-note', DATABASE_REPLACEMENT_NO_RECORDS) : list,
    );
  };

  const showPreview = (file: DatabaseImportPreviewProjection): void => {
    preview.hidden = false;
    preview.dataset['previewId'] = file.previewId;
    preview.dataset['compatibility'] = file.compatibility;
    const rows = el('dl');
    for (const [term, value] of databaseImportPreviewRows(file, instant)) rows.append(el('dt', undefined, term), el('dd', undefined, value));
    const cancel = action(DATABASE_IMPORT_ACTIONS.cancelPreview, 'quiet', 'cancel-preview', () => {
      closePreview();
      setStatus(DATABASE_IMPORT_STATUS_LINES.closed);
      choose.focus();
    });
    const buttons = el('div', 'button-row');
    const refusal = databaseImportRefusalLine(file);
    if (refusal !== null) {
      buttons.append(cancel);
      preview.replaceChildren(rows, el('p', 'attention-note', refusal), buttons);
      cancel.focus();
      return;
    }
    // The two choices, neither preselected (DSTO-017): `按所选方式导入` waits for one, and each says what it will do once it is
    // made — a merge names every Book of the file as it would take it, and what stays behind.
    const choices = el('fieldset', 'database-import-choices');
    const confirm = action(DATABASE_IMPORT_ACTIONS.confirm, 'primary', 'confirm', () => {
      const chosen = choices.querySelector<HTMLInputElement>('input[name="database-import-choice"]:checked')?.value;
      if (chosen === 'replace') void prepare(file.previewId);
      else if (chosen === 'merge') void merge(file.previewId);
    });
    confirm.disabled = true;
    const mergeable = file.books.some((book) => book.status !== 'present');
    const shown: HTMLElement[] = [];
    const option = (value: 'replace' | 'merge', text: string, details: HTMLElement): HTMLLabelElement => {
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'database-import-choice';
      radio.value = value;
      radio.checked = false;
      radio.disabled = value === 'merge' && !mergeable;
      details.hidden = true;
      shown.push(details);
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        for (const node of shown) node.hidden = node !== details;
        confirm.dataset['chosen'] = 'true';
        confirm.disabled = busy;
      });
      const label = el('label', 'database-import-choice');
      label.append(radio, document.createTextNode(text));
      return label;
    };
    const replaceDetails = el('p', 'attention-note database-import-consequence', DATABASE_REPLACE_CONSEQUENCE);
    replaceDetails.dataset['choice'] = 'replace';
    const mergeDetails = el('div', 'database-import-consequence database-merge-plan');
    mergeDetails.dataset['choice'] = 'merge';
    const books = el('ul', 'database-merge-books');
    for (const book of file.books) {
      const item = el('li', `database-merge-book status-${book.status}`, databaseImportBookLine(book));
      item.dataset['bookId'] = book.bookId;
      item.dataset['status'] = book.status;
      books.append(item);
    }
    mergeDetails.append(el('p', 'attention-note', DATABASE_MERGE_CONSEQUENCE), books,
      ...file.mergeNotices.map((notice) => el('p', 'field-note database-merge-notice', DATABASE_MERGE_NOTICE_LINES[notice])));
    choices.append(
      el('legend', undefined, DATABASE_IMPORT_CHOICES_LEGEND),
      option('replace', DATABASE_IMPORT_CHOICES.replace, replaceDetails), replaceDetails,
      option('merge', DATABASE_IMPORT_CHOICES.merge, mergeDetails), mergeDetails,
    );
    if (!mergeable) choices.append(el('p', 'field-note database-merge-nothing', DATABASE_MERGE_NOTHING));
    buttons.append(confirm, cancel);
    preview.replaceChildren(rows, choices, buttons);
    choices.querySelector<HTMLInputElement>('input[name="database-import-choice"]')?.focus();
  };

  const chooseFile = async (): Promise<void> => {
    if (busy) return;
    closePreview();
    setBusy(true);
    setStatus(DATABASE_IMPORT_STATUS_LINES.choosing, 'busy');
    try {
      const result = await api.chooseDatabaseImportFile();
      if (!root.isConnected) return;
      if (result.outcome === 'cancelled') {
        setStatus(DATABASE_IMPORT_STATUS_LINES.cancelled);
        return;
      }
      setBusy(false);
      showPreview(result.preview);
      setStatus(DATABASE_IMPORT_STATUS_LINES.previewed, 'success');
    } catch (error) {
      if (!root.isConnected) return;
      setStatus(errorMessage(error, DATABASE_IMPORT_STATUS_LINES.previewFailed), 'error');
    } finally {
      if (root.isConnected) setBusy(false);
    }
  };

  /** Run one change of the replacement's state, and show what the service answered. */
  const change = async (
    run: () => Promise<DatabaseReplacementsProjection>,
    lines: { busy: string; done: string; failed: string },
    focus: () => HTMLElement | null,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus(lines.busy, 'busy');
    try {
      const projection = await run();
      if (!root.isConnected) return;
      closePreview();
      busy = false;
      show(projection);
      setStatus(lines.done, 'success');
      focus()?.focus();
    } catch (error) {
      if (!root.isConnected) return;
      setStatus(errorMessage(error, lines.failed), 'error');
    } finally {
      if (root.isConnected) setBusy(false);
    }
  };

  const quitButton = (): HTMLElement | null => pending.querySelector<HTMLElement>('[data-database-import-action="quit"]');

  const prepare = (previewId: string): Promise<void> =>
    change(() => api.prepareDatabaseReplacement({ previewId }),
      { busy: DATABASE_IMPORT_STATUS_LINES.preparing, done: DATABASE_IMPORT_STATUS_LINES.prepared, failed: DATABASE_IMPORT_STATUS_LINES.prepareFailed }, quitButton);

  const merge = (previewId: string): Promise<void> =>
    change(() => api.prepareDatabaseMerge({ previewId }),
      { busy: DATABASE_IMPORT_STATUS_LINES.preparingMerge, done: DATABASE_IMPORT_STATUS_LINES.mergePrepared, failed: DATABASE_IMPORT_STATUS_LINES.mergeFailed }, quitButton);

  const cancelReplacement = (replacementId: string): Promise<void> =>
    change(() => api.cancelDatabaseReplacement({ replacementId }),
      { busy: DATABASE_IMPORT_STATUS_LINES.cancelling, done: DATABASE_IMPORT_STATUS_LINES.replacementCancelled, failed: DATABASE_IMPORT_STATUS_LINES.cancelFailed }, () => choose);

  const rollBackTo = (replacementId: string): Promise<void> =>
    change(() => api.rollBackDatabaseReplacement({ replacementId }),
      { busy: DATABASE_IMPORT_STATUS_LINES.rollingBack, done: DATABASE_IMPORT_STATUS_LINES.rollBackPrepared, failed: DATABASE_IMPORT_STATUS_LINES.rollBackFailed }, quitButton);

  const quit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus(DATABASE_IMPORT_STATUS_LINES.quitting, 'busy');
    try {
      const result = await api.quitApplication();
      if (!root.isConnected) return;
      if (result.outcome === 'blocked') setStatus(DATABASE_IMPORT_STATUS_LINES.quitBlocked, 'error');
    } catch (error) {
      if (!root.isConnected) return;
      setStatus(errorMessage(error, DATABASE_IMPORT_STATUS_LINES.quitFailed), 'error');
    } finally {
      if (root.isConnected) setBusy(false);
    }
  };

  void api.inspectDatabaseReplacements().then((projection) => {
    if (root.isConnected) show(projection);
  }, (error: unknown) => {
    if (!root.isConnected) return;
    records.replaceChildren(el('p', 'attention-note', errorMessage(error, DATABASE_IMPORT_STATUS_LINES.recordsUnavailable)));
  });
}
