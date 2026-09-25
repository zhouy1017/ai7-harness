import type { RendererApi, ScheduledBackupsProjection } from '../shared/protocol.js';
import {
  SCHEDULED_BACKUP_HEADING,
  SCHEDULED_BACKUP_LEDE,
  SCHEDULED_BACKUP_LOCATION,
  SCHEDULED_BACKUP_NONE,
  SCHEDULED_BACKUP_STATUS_LINES,
  SCHEDULED_BACKUP_SWITCH,
  scheduledBackupLine,
  scheduledBackupStateLine,
  scheduledBackupsLabel,
} from './scheduled-backup-labels.js';

/**
 * 定期自动备份 in 设置 › 数据与存储 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4, §1.7): the switch, off by
 * default and turned only by the editor; the fixed backup location; and the backups kept. Turning it on backs up at once
 * when none was made in the day before; turning it off removes nothing.
 */

type Status = (message: string, tone?: 'busy' | 'success' | 'error') => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface MountScheduledBackupOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectScheduledBackups' | 'setScheduledBackup'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly instant: (iso: string) => string;
}

export function mountScheduledBackup(options: MountScheduledBackupOptions): void {
  const { root, api, setStatus, errorMessage, instant } = options;
  root.classList.add('scheduled-backup');
  let projection: ScheduledBackupsProjection | null = null;
  let busy = false;
  let refusal: string | null = null;

  const paint = (focusSwitch: boolean): void => {
    if (projection === null) return;
    root.dataset['enabled'] = String(projection.enabled);
    root.dataset['backups'] = String(projection.total);
    const wrapper = el('label', 'calibration-switch scheduled-backup-switch');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = projection.enabled;
    input.disabled = busy;
    input.dataset['scheduledBackupSwitch'] = 'on';
    input.addEventListener('change', () => void turn(input.checked));
    wrapper.append(input, el('span', undefined, SCHEDULED_BACKUP_SWITCH));
    const state = el('p', 'field-note scheduled-backup-state', scheduledBackupStateLine(projection));
    state.setAttribute('role', 'status');
    const where = el('dl');
    where.append(el('dt', undefined, SCHEDULED_BACKUP_LOCATION), el('dd', 'scheduled-backup-location', projection.location));
    const list = el('ol');
    for (const backup of projection.backups) list.append(el('li', 'scheduled-backup-record', scheduledBackupLine(backup, instant)));
    const kept = el('details', 'scheduled-backup-records');
    kept.append(
      el('summary', undefined, scheduledBackupsLabel(projection.backups.length, projection.total)),
      projection.total === 0 ? el('p', 'field-note', SCHEDULED_BACKUP_NONE) : list,
    );
    const nodes: HTMLElement[] = [el('h3', undefined, SCHEDULED_BACKUP_HEADING), el('p', 'field-note', SCHEDULED_BACKUP_LEDE), wrapper, state];
    if (refusal !== null) {
      const alert = el('p', 'attention-note', refusal);
      alert.setAttribute('role', 'alert');
      nodes.push(alert);
    }
    nodes.push(where, kept);
    root.replaceChildren(...nodes);
    if (focusSwitch) input.focus();
  };

  const turn = async (enabled: boolean): Promise<void> => {
    if (busy || projection === null) return;
    const before = projection;
    busy = true;
    refusal = null;
    paint(true);
    setStatus(enabled ? SCHEDULED_BACKUP_STATUS_LINES.turningOn : SCHEDULED_BACKUP_STATUS_LINES.turningOff, 'busy');
    try {
      projection = await api.setScheduledBackup({ enabled, expectedOrdinal: before.ordinal });
      busy = false;
      if (!root.isConnected) return;
      paint(true);
      setStatus(!enabled ? SCHEDULED_BACKUP_STATUS_LINES.turnedOff
        : projection.total > before.total ? SCHEDULED_BACKUP_STATUS_LINES.backedUp : SCHEDULED_BACKUP_STATUS_LINES.turnedOn, 'success');
    } catch (error) {
      busy = false;
      if (!root.isConnected) return;
      refusal = errorMessage(error, SCHEDULED_BACKUP_STATUS_LINES.failed);
      try { projection = await api.inspectScheduledBackups(); } catch { /* the section keeps what it had */ }
      paint(true);
      setStatus(refusal, 'error');
    }
  };

  root.replaceChildren(el('h3', undefined, SCHEDULED_BACKUP_HEADING), el('p', 'field-note', SCHEDULED_BACKUP_STATUS_LINES.loading));
  void api.inspectScheduledBackups().then((loaded) => {
    if (!root.isConnected) return;
    projection = loaded;
    paint(false);
  }, (error: unknown) => {
    if (!root.isConnected) return;
    root.replaceChildren(el('h3', undefined, SCHEDULED_BACKUP_HEADING), el('p', 'attention-note', errorMessage(error, SCHEDULED_BACKUP_STATUS_LINES.unavailable)));
  });
}
