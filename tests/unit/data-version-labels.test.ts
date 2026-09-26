import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_VERSION_PROMISE,
  DATA_VERSION_UPGRADE,
  dataVersionRecordsLabel,
  dataVersionRollbackSteps,
  dataVersionStateLine,
  dataVersionUpdateLine,
  dataVersionUpgradeBackupLine,
  dataVersionUpgradeLine,
  storeVersionLine,
} from '../../src/renderer/data-version-labels.js';
import {
  DATA_VERSION,
  DATA_VERSION_BASELINE_REVISION,
  DATA_VERSION_FROZEN,
  PRE_UPGRADE_BACKUP_NAME,
  SCHEMA_REVISION_CLASSES,
  breakingChanges,
  compareSoftwareVersions,
  dataVersionAt,
  latestSoftwareUpdate,
  readSoftwareVersion,
  type StoredVersion,
} from '../../src/service/data-version.js';
import { DATABASE_MERGE_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { preUpgradeBackupFileName } from '../../src/service/upgrade-backup.js';

// Unit suite for 数据版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1): the Data Version this software reads,
// not yet frozen before the first packaged release; the software version read from the package it ships in; the latest
// software update found in the store's version records; and every line 数据与存储 states.

const record = (ordinal: number, softwareVersion: string, dataVersion = 1): StoredVersion => ({
  recordId: `record-${ordinal}`, ordinal, softwareVersion, dataVersion, schemaRevision: 54, recordedAt: `2026-09-${String(ordinal).padStart(2, '0')}T00:00:00.000Z`, upgrade: null,
});

describe('数据版本', () => {
  it('reads Data Version 1, not frozen before the first packaged release', () => {
    expect([DATA_VERSION, DATA_VERSION_FROZEN]).toEqual([1, false]);
  });

  it('holds the Data Version to the classification of every schema revision after the release baseline (Issue #433, S85b)', () => {
    // Nothing is frozen before the first packaged release: no baseline, no revision classified, and every revision reads as 1.
    expect([DATA_VERSION_BASELINE_REVISION, SCHEMA_REVISION_CLASSES]).toEqual([null, []]);
    // The software's Data Version is always the classification's at its terminal revision: a breaking revision added to the
    // list without raising DATA_VERSION, or DATA_VERSION raised without one, fails here.
    expect(DATA_VERSION).toBe(dataVersionAt(DATABASE_MERGE_SCHEMA_VERSION));
    // Classified entries lie after the baseline, one per revision, in order, and a breaking one says what it changes.
    const revisions = SCHEMA_REVISION_CLASSES.map((entry) => entry.revision);
    expect(revisions).toEqual([...new Set(revisions)].sort((left, right) => left - right));
    expect(SCHEMA_REVISION_CLASSES.every((entry) => DATA_VERSION_BASELINE_REVISION !== null && entry.revision > DATA_VERSION_BASELINE_REVISION &&
      entry.revision <= DATABASE_MERGE_SCHEMA_VERSION && (entry.class === 'additive' || (entry.change ?? '').length > 0))).toBe(true);
    // Additive revisions stay inside a Data Version; each breaking one raises it by one, and says what changed.
    const classes = [
      { revision: 60, class: 'additive' as const },
      { revision: 61, class: 'breaking' as const, change: '甲' },
      { revision: 62, class: 'additive' as const },
      { revision: 63, class: 'breaking' as const, change: '乙' },
    ];
    expect([59, 60, 61, 62, 63, 64].map((revision) => dataVersionAt(revision, classes))).toEqual([1, 1, 2, 2, 3, 3]);
    expect([breakingChanges(59, 64, classes), breakingChanges(61, 64, classes), breakingChanges(61, 62, classes)]).toEqual([['甲', '乙'], ['乙'], []]);
  });

  it('names a backup before an upgrade by the computer\'s own time, in the one form a record may name (Issue #433, S85b)', () => {
    expect(preUpgradeBackupFileName(new Date(2026, 8, 26, 10, 0, 5))).toBe('AI7 升级前备份 2026-09-26 10-00-05.ai7db');
    expect(PRE_UPGRADE_BACKUP_NAME.test(preUpgradeBackupFileName(new Date(2026, 0, 2, 3, 4, 5)))).toBe(true);
    expect(['../victim.ai7db', 'AI7 自动备份 2026-09-26 10-00-05.ai7db', 'AI7 升级前备份 2026-09-26 10-00-05.ai7db.exe']
      .map((name) => PRE_UPGRADE_BACKUP_NAME.test(name))).toEqual([false, false, false]);
  });

  it('reads the software version from the package it ships in, and refuses a package that names none', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai7-data-version-'));
    try {
      // Build metadata, which SemVer allows, is a version too (Issue #433 review).
      for (const [version, expected] of [['0.1.0', '0.1.0'], ['1.2.3-beta.2', '1.2.3-beta.2'], ['0.2.0+build.7', '0.2.0+build.7'], ['1.0.0-rc.1+sha.5114f85', '1.0.0-rc.1+sha.5114f85']] as const) {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
        await expect(readSoftwareVersion(root)).resolves.toBe(expected);
      }
      for (const content of [JSON.stringify({}), JSON.stringify({ version: 'latest' }), JSON.stringify({ version: 1 }), JSON.stringify({ version: '0.2.0+' }), '{']) {
        writeFileSync(join(root, 'package.json'), content);
        await expect(readSoftwareVersion(root)).rejects.toMatchObject({ code: 'SOFTWARE_VERSION_UNAVAILABLE' });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds the latest software change in the records, and none while one software opened the store', () => {
    expect(latestSoftwareUpdate([])).toBeNull();
    expect(latestSoftwareUpdate([record(1, '0.1.0')])).toBeNull();
    expect(latestSoftwareUpdate([record(1, '0.0.9'), record(2, '0.1.0')])).toEqual({
      from: '0.0.9', to: '0.1.0', direction: 'newer', fromDataVersion: 1, toDataVersion: 1, recordedAt: '2026-09-02T00:00:00.000Z',
    });
    // An older build opening the store again is no update (Issue #433 review), and build metadata alone orders nothing.
    expect(latestSoftwareUpdate([record(1, '0.1.0'), record(2, '0.2.0'), record(3, '0.1.0')])).toMatchObject({ from: '0.2.0', to: '0.1.0', direction: 'earlier' });
    expect(latestSoftwareUpdate([record(1, '0.2.0+build.7'), record(2, '0.2.0+build.8')])).toMatchObject({ direction: 'same' });
    // A later record for the same software — a schema revision within the same Data Version — is not an update of it.
    expect(latestSoftwareUpdate([record(1, '0.0.9'), record(2, '0.1.0'), record(3, '0.1.0')])?.to).toBe('0.1.0');
    expect(latestSoftwareUpdate([record(1, '0.0.9'), record(2, '0.1.0'), record(3, '0.2.0', 2)])).toMatchObject({ from: '0.1.0', to: '0.2.0', fromDataVersion: 1, toDataVersion: 2 });
  });
});

describe('数据版本 words', () => {
  it('says what the Data Version promises and whether it is frozen', () => {
    expect(DATA_VERSION_PROMISE).toBe('数据版本只在旧版软件无法再读取这些数据时才会改变；普通的软件更新保持它不变。');
    expect(dataVersionStateLine({ frozen: false, dataVersion: 1 })).toBe('开发阶段：首个正式发布时冻结为数据版本 1；在那之前，开发中的数据可以重建。');
    expect(dataVersionStateLine({ frozen: true, dataVersion: 1 })).toBe('数据版本 1 已冻结。');
  });

  it('states an upgrade of the data, the backup made first, and how to go back (Issue #433, S85b)', () => {
    const instant = (iso: string): string => `〔${iso.slice(5, 10)}〕`;
    const upgrade = {
      recordedAt: '2026-09-26T02:00:00.000Z', fromDataVersion: 1, toDataVersion: 2, changes: ['批注改为按段落记下', '书系记下成员的加入顺序'],
      backupFileName: 'AI7 升级前备份 2026-09-26 10-00-05.ai7db', backupPresent: true, fromSoftwareVersion: '0.1.0',
    };
    expect(DATA_VERSION_UPGRADE).toBe('最近一次数据升级');
    expect(dataVersionUpgradeLine(upgrade, instant)).toBe('〔09-26〕 · 数据版本从 1 升级为 2：批注改为按段落记下；书系记下成员的加入顺序。');
    expect([dataVersionUpgradeBackupLine(upgrade), dataVersionUpgradeBackupLine({ ...upgrade, backupPresent: false })]).toEqual([
      '升级前的数据已备份为「AI7 升级前备份 2026-09-26 10-00-05.ai7db」，在备份位置保留到你删除。',
      '升级前备份「AI7 升级前备份 2026-09-26 10-00-05.ai7db」已不在备份位置。',
    ]);
    // Going back is the earlier AI7's, which cannot open the upgraded data: the steps move it aside first (Issue #433 review).
    const places = { dataRoot: 'C:\\Users\\编辑\\AppData\\Roaming\\AI7', backupLocation: 'C:\\Users\\编辑\\AppData\\Roaming\\AI7-backups' };
    expect(dataVersionRollbackSteps(upgrade, places)).toEqual({
      lead: '回退只恢复升级前的数据，AI7 不保留、也不运行旧版软件。升级前的 AI7（0.1.0）打不开升级后的数据，所以先把它挪开：',
      steps: [
        '关闭 AI7，把数据文件夹「C:\\Users\\编辑\\AppData\\Roaming\\AI7」改名，例如在名字后面加上「-升级后」。不要删除它，升级后的数据都在里面。',
        '安装并启动升级前的 AI7（0.1.0）：它以空白数据启动。',
        '在它的「设置 › 数据与存储」里选「导入数据库…」，选「C:\\Users\\编辑\\AppData\\Roaming\\AI7-backups」里的「AI7 升级前备份 2026-09-26 10-00-05.ai7db」，再选「替换本机全部数据」。',
      ],
    });
    expect(dataVersionRollbackSteps({ ...upgrade, fromSoftwareVersion: null }, places).steps[1]).toBe('安装并启动升级前的 AI7：它以空白数据启动。');
  });

  it('says what the latest software update did to the Data Version, and writes each record', () => {
    expect(dataVersionUpdateLine(null)).toBe('这份数据还没有经历过软件更新。');
    const kept = { from: '0.0.9', to: '0.1.0', direction: 'newer' as const, fromDataVersion: 1, toDataVersion: 1, recordedAt: '2026-09-25T00:00:00.000Z' };
    expect(dataVersionUpdateLine(kept)).toBe('软件从 0.0.9 更新到 0.1.0；数据版本仍为 1，数据无需变更。');
    expect(dataVersionUpdateLine({ ...kept, to: '1.0.0', toDataVersion: 2 })).toBe('软件从 0.0.9 更新到 1.0.0；数据版本从 1 变为 2。');
    expect(dataVersionUpdateLine({ ...kept, from: '0.2.0', to: '0.1.0', direction: 'earlier' })).toBe('改用较早的软件：从 0.2.0 改为 0.1.0；数据版本仍为 1，数据无需变更。');
    expect(dataVersionUpdateLine({ ...kept, from: '0.2.0+build.7', to: '0.2.0+build.8', direction: 'same' })).toBe('软件从 0.2.0+build.7 换为 0.2.0+build.8；数据版本仍为 1，数据无需变更。');
    expect(storeVersionLine({ softwareVersion: '0.1.0', dataVersion: 1, recordedAt: '2026-09-25T00:00:00.000Z' }, (iso) => `〔${iso.slice(0, 10)}〕`))
      .toBe('〔2026-09-25〕 · 软件 0.1.0 · 数据版本 1');
    expect([dataVersionRecordsLabel(1, false), dataVersionRecordsLabel(20, true)]).toEqual(['版本记录（1）', '版本记录（最近 20 条）']);
  });
});

describe('software version precedence (Issue #433 review)', () => {
  it('orders versions as SemVer does, build metadata never counted', () => {
    const ordered = ['0.1.0-alpha', '0.1.0-alpha.1', '0.1.0-alpha.beta', '0.1.0-beta', '0.1.0-beta.2', '0.1.0-beta.11', '0.1.0-rc.1', '0.1.0', '0.1.1', '0.2.0', '0.10.0', '1.0.0'];
    for (let index = 1; index < ordered.length; index += 1) {
      expect([compareSoftwareVersions(ordered[index - 1]!, ordered[index]!), compareSoftwareVersions(ordered[index]!, ordered[index - 1]!)]).toEqual([-1, 1]);
    }
    expect(compareSoftwareVersions('0.2.0+build.7', '0.2.0+build.8')).toBe(0);
    expect(compareSoftwareVersions('0.2.0', '0.2.0')).toBe(0);
    const lower = '1.0.0-9007199254740992';
    const higher = '1.0.0-9007199254740993';
    expect([compareSoftwareVersions(lower, higher), compareSoftwareVersions(higher, lower)]).toEqual([-1, 1]);
    expect(latestSoftwareUpdate([record(1, lower), record(2, higher)])).toMatchObject({ direction: 'newer' });
    expect(latestSoftwareUpdate([record(1, higher), record(2, lower)])).toMatchObject({ direction: 'earlier' });
  });
});
