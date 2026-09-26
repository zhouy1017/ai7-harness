import { describe, expect, it } from 'vitest';
import {
  DATABASE_IMPORT_ACTIONS,
  DATABASE_IMPORT_CHOICES,
  DATABASE_IMPORT_CHOICES_LEGEND,
  DATABASE_IMPORT_HEADING,
  DATABASE_IMPORT_LEDE,
  DATABASE_IMPORT_STATUS_LINES,
  DATABASE_PACKAGE_ORIGIN_LABELS,
  DATABASE_REPLACE_CONSEQUENCE,
  DATABASE_REPLACEMENT_NO_RECORDS,
  databaseImportPreviewRows,
  databaseImportRefusalLine,
  databaseImportVersionLine,
  databasePendingLines,
  databaseReplacementRecordLine,
  databaseReplacementRecordsLabel,
  databaseRollBackLines,
} from '../../src/renderer/database-import-labels.js';
import type { DatabaseImportPreviewProjection, DatabaseReplacementRecordProjection } from '../../src/shared/protocol.js';

// Unit suite for 导入数据库 (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.3, §1.4): the words byte for byte — the
// preview of a file, the one choice and what it will do, the replacement waiting, each replacement recorded, and the roll-back.

const instant = (iso: string): string => `〔${iso.slice(5, 16)}〕`;

const preview: DatabaseImportPreviewProjection = {
  previewId: 'p',
  fileName: 'AI7 数据库.ai7db',
  source: 'C:\\Users\\编辑\\Documents\\AI7 数据库.ai7db',
  byteLength: 3 * 1024 * 1024,
  origin: 'database-export',
  createdAt: '2026-09-25T02:00:00.000Z',
  dataVersion: 1,
  softwareVersion: '0.1.0',
  schemaRevision: 57,
  localDataVersion: 1,
  compatibility: 'compatible',
  contents: { books: 3, sourceVersions: 5, libraryMaterials: 2, series: 1 },
  members: 12,
};

const record: DatabaseReplacementRecordProjection = {
  replacementId: 'r',
  kind: 'replace',
  outcome: 'applied',
  packageFileName: 'AI7 数据库.ai7db',
  backupFileName: 'AI7 替换前备份 2026-09-25 10-00-00.ai7db',
  preparedAt: '2026-09-25T02:00:00.000Z',
  recordedAt: '2026-09-25T02:05:00.000Z',
  backupPresent: true,
  failure: null,
};

describe('导入数据库\'s words', () => {
  it('says what the section is for, the one choice, and what it will do', () => {
    expect(DATABASE_IMPORT_HEADING).toBe('导入数据库');
    expect(DATABASE_IMPORT_LEDE).toBe('先查看数据库文件里有什么、数据版本是否与本机兼容、来自哪里，再决定怎样使用它。');
    expect(DATABASE_IMPORT_ACTIONS).toEqual({
      choose: '导入数据库…',
      confirm: '按所选方式导入',
      cancelPreview: '取消',
      quit: '现在关闭 AI7',
      cancelReplacement: '取消替换',
      cancelRollBack: '取消回退',
      rollBack: '回退到替换前的数据…',
      confirmRollBack: '确认回退',
      keep: '不回退',
    });
    expect(DATABASE_IMPORT_CHOICES_LEGEND).toBe('怎样使用这个文件');
    expect(DATABASE_IMPORT_CHOICES).toEqual({ replace: '替换本机全部数据（先自动备份，可回退）' });
    expect(DATABASE_REPLACE_CONSEQUENCE).toBe(
      '本机现在的全部图书、稿件与历史、知识库和设置都会换成这个文件里的内容。AI7 先把现在的数据备份成一个文件，放在备份位置，之后可以回退；替换在 AI7 下次启动时完成。模型服务凭据不在文件里，替换后可能需要重新填写。',
    );
    expect(DATABASE_REPLACEMENT_NO_RECORDS).toBe('还没有替换过本机数据。');
    expect([DATABASE_IMPORT_STATUS_LINES.prepared, DATABASE_IMPORT_STATUS_LINES.replacementCancelled, DATABASE_IMPORT_STATUS_LINES.quitBlocked])
      .toEqual(['已准备好替换，AI7 下次启动时完成。', '已取消，本机数据没有改变。', '还有窗口里有未保存的修改，AI7 没有关闭。']);
  });

  it('states a previewed file whole before anything is chosen', () => {
    expect(databaseImportPreviewRows(preview, instant)).toEqual([
      ['文件', '「AI7 数据库.ai7db」 · 3.0 MB'],
      ['来源', '导出数据库 · 〔09-25T02:00〕'],
      ['版本', '数据版本 1 · 与本机相同 · 软件 0.1.0'],
      ['内容', '3 本图书 · 5 个来源版本 · 资料库 2 项 · 书系 1 个'],
      ['完整性', '已逐项核对 12 个文件，完整'],
    ]);
    expect(DATABASE_PACKAGE_ORIGIN_LABELS).toEqual({ 'database-export': '导出数据库', 'scheduled-backup': '定期自动备份', 'pre-replace-backup': '替换前备份' });
    expect(databaseImportRefusalLine(preview)).toBeNull();
  });

  it('says why a file that does not fit this AI7 offers no choice', () => {
    expect([
      databaseImportVersionLine({ ...preview, dataVersion: 2, compatibility: 'newer-data-version' }),
      databaseImportVersionLine({ ...preview, dataVersion: 1, compatibility: 'older-data-version', localDataVersion: 2 }),
      databaseImportVersionLine({ ...preview, compatibility: 'newer-schema', softwareVersion: '0.2.0' }),
    ]).toEqual([
      '数据版本 2 · 比本机的数据版本 1 新，请先更新 AI7 · 软件 0.1.0',
      '数据版本 1 · 比本机的数据版本 2 旧，暂不能导入 · 软件 0.1.0',
      '数据版本 1 · 由更新的 AI7 做成，请先更新 AI7 · 软件 0.2.0',
    ]);
    expect(databaseImportRefusalLine({ compatibility: 'newer-schema' })).toBe('这个文件的数据版本与本机 AI7 不兼容，不能导入。');
  });

  it('states the replacement waiting, each replacement recorded, and the roll-back', () => {
    expect(databasePendingLines({ kind: 'replace', packageFileName: 'AI7 数据库.ai7db', backupFileName: 'AI7 替换前备份 1.ai7db' })).toEqual([
      '已准备好用「AI7 数据库.ai7db」替换本机全部数据。',
      '本机现在的数据已备份为「AI7 替换前备份 1.ai7db」，放在备份位置。',
      'AI7 下次启动时完成替换；在此之前不能再做修改，要继续修改请先取消替换。',
    ]);
    expect(databasePendingLines({ kind: 'roll-back', packageFileName: 'AI7 替换前备份 1.ai7db', backupFileName: 'AI7 替换前备份 2.ai7db' })).toEqual([
      '已准备好回退到「AI7 替换前备份 1.ai7db」。',
      '本机现在的数据已备份为「AI7 替换前备份 2.ai7db」，放在备份位置。',
      'AI7 下次启动时完成回退；在此之前不能再做修改，要继续修改请先取消回退。',
    ]);
    expect([
      databaseReplacementRecordLine(record, instant),
      databaseReplacementRecordLine({ ...record, outcome: 'failed', backupPresent: false }, instant),
      databaseReplacementRecordLine({ ...record, kind: 'roll-back', packageFileName: 'AI7 替换前备份 1.ai7db' }, instant),
      databaseReplacementRecordLine({ ...record, kind: 'roll-back', outcome: 'failed', packageFileName: 'AI7 替换前备份 1.ai7db' }, instant),
    ]).toEqual([
      '〔09-25T02:05〕 · 已用「AI7 数据库.ai7db」替换本机全部数据 · 替换前备份「AI7 替换前备份 2026-09-25 10-00-00.ai7db」',
      '〔09-25T02:05〕 · 未能用「AI7 数据库.ai7db」替换：它无法打开，本机数据保持原样 · 替换前备份「AI7 替换前备份 2026-09-25 10-00-00.ai7db」（文件不在备份位置）',
      '〔09-25T02:05〕 · 已回退到「AI7 替换前备份 1.ai7db」 · 回退前备份「AI7 替换前备份 2026-09-25 10-00-00.ai7db」',
      '〔09-25T02:05〕 · 未能回退到「AI7 替换前备份 1.ai7db」：它无法打开，本机数据保持原样 · 回退前备份「AI7 替换前备份 2026-09-25 10-00-00.ai7db」',
    ]);
    // One refused because what waited had changed since it was prepared says so (Issue #434 review).
    expect([
      databaseReplacementRecordLine({ ...record, outcome: 'failed', failure: 'changed' }, instant),
      databaseReplacementRecordLine({ ...record, kind: 'roll-back', outcome: 'failed', failure: 'changed', packageFileName: 'AI7 替换前备份 1.ai7db' }, instant),
    ]).toEqual([
      '〔09-25T02:05〕 · 未能用「AI7 数据库.ai7db」替换：准备好的文件已不完整或被改动，本机数据保持原样 · 替换前备份「AI7 替换前备份 2026-09-25 10-00-00.ai7db」',
      '〔09-25T02:05〕 · 未能回退到「AI7 替换前备份 1.ai7db」：准备好的文件已不完整或被改动，本机数据保持原样 · 回退前备份「AI7 替换前备份 2026-09-25 10-00-00.ai7db」',
    ]);
    expect([databaseReplacementRecordsLabel(0, 0), databaseReplacementRecordsLabel(2, 2), databaseReplacementRecordsLabel(20, 23)])
      .toEqual(['替换记录（0）', '替换记录（2）', '替换记录（最近 20 次，共 23 次）']);
    expect(databaseRollBackLines(record)).toEqual([
      '上次用「AI7 数据库.ai7db」替换了本机全部数据；替换前的数据在「AI7 替换前备份 2026-09-25 10-00-00.ai7db」里。',
      '回退会用「AI7 替换前备份 2026-09-25 10-00-00.ai7db」替换本机现在的全部数据。AI7 先把现在的数据也备份一次；回退在 AI7 下次启动时完成。',
    ]);
  });
});
