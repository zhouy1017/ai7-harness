import { describe, expect, it } from 'vitest';
import {
  SCHEDULED_BACKUP_HEADING,
  SCHEDULED_BACKUP_LEDE,
  SCHEDULED_BACKUP_NONE,
  SCHEDULED_BACKUP_STATUS_LINES,
  SCHEDULED_BACKUP_SWITCH,
  scheduledBackupLine,
  scheduledBackupStateLine,
  scheduledBackupsLabel,
} from '../../src/renderer/scheduled-backup-labels.js';
import { BACKUP_CHECK_INTERVAL_MS, BACKUP_INTERVAL_MS, BACKUP_KEPT_DAYS, backupFileName, backupLocationFor } from '../../src/service/scheduled-backups.js';

// Unit suite for 定期自动备份 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4): the words byte for byte, and the
// backup's name, place and cadence.

describe('定期自动备份\'s words', () => {
  it('says what the switch does and never does', () => {
    expect([SCHEDULED_BACKUP_HEADING, SCHEDULED_BACKUP_SWITCH]).toEqual(['定期自动备份', '定期自动备份']);
    expect(SCHEDULED_BACKUP_LEDE).toBe('打开后，AI7 每天把产品数据备份一次到本机的备份位置，保留 14 天。备份不含模型服务凭据，也不加密。关闭后不再备份，已有的备份保留到到期。');
    expect(SCHEDULED_BACKUP_NONE).toBe('还没有备份。');
    expect(SCHEDULED_BACKUP_STATUS_LINES.backedUp).toBe('已打开定期自动备份，并完成了今天的备份。');
    expect(SCHEDULED_BACKUP_STATUS_LINES.turnedOff).toBe('已关闭定期自动备份；已有的备份保留到到期。');
  });

  it('states the switch, the backups kept and each one', () => {
    expect([scheduledBackupStateLine({ enabled: false, keptDays: 14 }), scheduledBackupStateLine({ enabled: true, keptDays: 14 })])
      .toEqual(['已关闭', '已打开 · 每天一次 · 保留 14 天']);
    expect([scheduledBackupsLabel(0, 0), scheduledBackupsLabel(3, 3), scheduledBackupsLabel(20, 22)])
      .toEqual(['已保留的备份（0）', '已保留的备份（3）', '已保留的备份（最近 20 份，共 22 份）']);
    const backup = { backupId: 'b', fileName: 'AI7 自动备份.ai7db', byteLength: 2 * 1024 * 1024, createdAt: '2026-09-25T02:00:00.000Z', expiresAt: '2026-10-09T02:00:00.000Z', present: true };
    const instant = (iso: string): string => `〔${iso.slice(5, 10)}〕`;
    expect(scheduledBackupLine(backup, instant)).toBe('〔09-25〕 · 2.0 MB · 保留到 〔10-09〕');
    expect(scheduledBackupLine({ ...backup, present: false }, instant)).toBe('〔09-25〕 · 2.0 MB · 保留到 〔10-09〕 · 文件不在备份位置');
  });
});

describe('a backup\'s name, place and cadence', () => {
  it('names a backup by the computer\'s own time, keeps it beside the data, once a day for fourteen days', () => {
    expect(backupFileName(new Date(2026, 8, 25, 22, 30, 5))).toBe('AI7 自动备份 2026-09-25 22-30-05.ai7db');
    expect(backupFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe('AI7 自动备份 2026-01-02 03-04-05.ai7db');
    expect(backupLocationFor('C:\\Users\\编辑\\AppData\\Local\\AI7\\data')).toBe('C:\\Users\\编辑\\AppData\\Local\\AI7\\data-backups');
    expect([BACKUP_KEPT_DAYS, BACKUP_INTERVAL_MS, BACKUP_CHECK_INTERVAL_MS]).toEqual([14, 24 * 60 * 60 * 1000, 60 * 60 * 1000]);
  });
});
