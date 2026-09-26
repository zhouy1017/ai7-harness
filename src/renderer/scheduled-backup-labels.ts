import type {
  ScheduledBackupFailureProjection,
  ScheduledBackupFailureReason,
  ScheduledBackupProjection,
  ScheduledBackupsProjection,
} from '../shared/protocol.js';
import { exportBytesLabel } from './manuscript-export-labels.js';

/**
 * 设置 › 数据与存储's 定期自动备份 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4, §1.7): the switch, off by
 * default; what it does and never does; where the backups are; and each backup kept. Pure, so the unit suite pins every line.
 */

export const SCHEDULED_BACKUP_HEADING = '定期自动备份';
export const SCHEDULED_BACKUP_LEDE = '打开后，AI7 每天把产品数据备份一次到本机的备份位置，保留 14 天。备份不含模型服务凭据，也不加密。关闭后不再备份，已有的备份保留到到期。';
export const SCHEDULED_BACKUP_SWITCH = '定期自动备份';
export const SCHEDULED_BACKUP_LOCATION = '备份位置';
export const SCHEDULED_BACKUP_NONE = '还没有备份。';
/** Shown while the service's background check writes a backup (Issue #434 review). */
export const SCHEDULED_BACKUP_RUNNING = '正在备份…';
export const SCHEDULED_BACKUP_STATUS_LINES = {
  loading: '正在读取定期自动备份…',
  turningOn: '正在打开定期自动备份…',
  turnedOn: '已打开定期自动备份。',
  backingUp: '已打开定期自动备份，正在做今天的备份…',
  backedUp: '已打开定期自动备份，并完成了今天的备份。',
  turningOff: '正在关闭定期自动备份…',
  turnedOff: '已关闭定期自动备份；已有的备份保留到到期。',
  failed: '无法更改定期自动备份。',
  unavailable: '无法读取定期自动备份。',
} as const;

/** Why the last backup was not made, in the section's words: never a path or the file system's own message. */
export const SCHEDULED_BACKUP_FAILURE_REASONS: Readonly<Record<ScheduledBackupFailureReason, string>> = {
  'no-space': '备份位置的空间不足',
  'not-writable': 'AI7 无法写入备份位置',
  'location-unavailable': '备份位置不可用',
  'too-large': '数据超过 4 GB 或文件过多，暂时无法打包成一个文件',
  other: '备份没有写完',
};

/** `最近一次自动备份没有完成（…）：备份位置的空间不足。AI7 会在一小时后再试。` (Issue #434 review). */
export function scheduledBackupFailureLine(failure: ScheduledBackupFailureProjection, instant: (iso: string) => string): string {
  return `最近一次自动备份没有完成（${instant(failure.at)}）：${SCHEDULED_BACKUP_FAILURE_REASONS[failure.reason]}。AI7 会在一小时后再试。`;
}

/** `已关闭`, or `已打开 · 每天一次 · 保留 14 天`. */
export function scheduledBackupStateLine(projection: Pick<ScheduledBackupsProjection, 'enabled' | 'keptDays'>): string {
  return projection.enabled ? `已打开 · 每天一次 · 保留 ${projection.keptDays} 天` : '已关闭';
}

/** The kept backups' summary: how many, and whether only the newest are listed. */
export function scheduledBackupsLabel(listed: number, total: number): string {
  return total > listed ? `已保留的备份（最近 ${listed} 份，共 ${total} 份）` : `已保留的备份（${total}）`;
}

/** One kept backup: when it was made, its size, until when it is kept, and whether its file is still there. */
export function scheduledBackupLine(backup: ScheduledBackupProjection, instant: (iso: string) => string): string {
  return `${instant(backup.createdAt)} · ${exportBytesLabel(backup.byteLength)} · 保留到 ${instant(backup.expiresAt)}${backup.present ? '' : ' · 文件不在备份位置'}`;
}
