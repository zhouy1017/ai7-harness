import type { DataVersionProjection, DataVersionUpgradeProjection, StoreVersionProjection } from '../shared/protocol.js';

/**
 * 设置 › 数据与存储's 版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1): the software version and the Data
 * Version apart, what the Data Version promises and whether it is frozen yet, the latest software update, and the store's
 * version records. Pure, so the unit suite pins every one.
 */

export const DATA_VERSION_HEADING = '版本';
export const DATA_VERSION_SOFTWARE = '软件版本';
export const DATA_VERSION_DATA = '数据版本';
export const DATA_VERSION_MEANING = '数据版本说明';
export const DATA_VERSION_UPDATE = '最近一次软件更新';
export const DATA_VERSION_RECORDS = '版本记录';
export const DATA_VERSION_UPGRADE = '最近一次数据升级';
export const DATA_VERSION_UNAVAILABLE = '无法读取版本。';
/** What the Data Version is (ADR 0079 §1.1): it changes only when older software could no longer read the data. */
export const DATA_VERSION_PROMISE = '数据版本只在旧版软件无法再读取这些数据时才会改变；普通的软件更新保持它不变。';

/** Whether the Data Version is frozen yet (ADR 0079 §1.2). */
export function dataVersionStateLine(projection: Pick<DataVersionProjection, 'frozen' | 'dataVersion'>): string {
  return projection.frozen
    ? `数据版本 ${projection.dataVersion} 已冻结。`
    : `开发阶段：首个正式发布时冻结为数据版本 ${projection.dataVersion}；在那之前，开发中的数据可以重建。`;
}

/**
 * The latest software change and what it did to the Data Version (DSTO-016): an update, or — when an older build opened the
 * store again — a change to earlier software, never called an update (Issue #433 review).
 */
export function dataVersionUpdateLine(update: DataVersionProjection['update']): string {
  if (update === null) return '这份数据还没有经历过软件更新。';
  const change = update.direction === 'earlier'
    ? `改用较早的软件：从 ${update.from} 改为 ${update.to}`
    : update.direction === 'same' ? `软件从 ${update.from} 换为 ${update.to}` : `软件从 ${update.from} 更新到 ${update.to}`;
  return update.fromDataVersion === update.toDataVersion
    ? `${change}；数据版本仍为 ${update.toDataVersion}，数据无需变更。`
    : `${change}；数据版本从 ${update.fromDataVersion} 变为 ${update.toDataVersion}。`;
}

/** The records' summary: how many, and whether only the newest are listed. */
export function dataVersionRecordsLabel(listed: number, truncated: boolean): string {
  return truncated ? `${DATA_VERSION_RECORDS}（最近 ${listed} 条）` : `${DATA_VERSION_RECORDS}（${listed}）`;
}

/** One version record: when, which software, which Data Version. */
export function storeVersionLine(record: Pick<StoreVersionProjection, 'softwareVersion' | 'dataVersion' | 'recordedAt'>, instant: (iso: string) => string): string {
  return `${instant(record.recordedAt)} · 软件 ${record.softwareVersion} · 数据版本 ${record.dataVersion}`;
}

/** The latest upgrade of the data (Issue #433, S85b; DSTO-016): when, from which Data Version to which, and what changed. */
export function dataVersionUpgradeLine(upgrade: Pick<DataVersionUpgradeProjection, 'recordedAt' | 'fromDataVersion' | 'toDataVersion' | 'changes'>, instant: (iso: string) => string): string {
  return `${instant(upgrade.recordedAt)} · 数据版本从 ${upgrade.fromDataVersion} 升级为 ${upgrade.toDataVersion}：${upgrade.changes.join('；')}。`;
}

/** Where the data as it was before the upgrade is kept (ADR 0079 §1.4): until the editor deletes it. */
export function dataVersionUpgradeBackupLine(upgrade: Pick<DataVersionUpgradeProjection, 'backupFileName' | 'backupPresent'>): string {
  return upgrade.backupPresent
    ? `升级前的数据已备份为「${upgrade.backupFileName}」，在备份位置保留到你删除。`
    : `升级前备份「${upgrade.backupFileName}」已不在备份位置。`;
}

/**
 * How to go back (ADR 0079 §1.3; Issue #433 review): the data only, through the earlier software, which AI7 neither keeps nor
 * runs. The earlier AI7 cannot open data a later one upgraded, so the steps move that data aside first: the earlier AI7 then
 * starts with empty data, and its 导入数据库 replaces that with the backup.
 */
export function dataVersionRollbackSteps(
  upgrade: Pick<DataVersionUpgradeProjection, 'fromSoftwareVersion' | 'backupFileName'>,
  places: { readonly dataRoot: string; readonly backupLocation: string },
): { readonly lead: string; readonly steps: ReadonlyArray<string> } {
  const earlier = upgrade.fromSoftwareVersion === null ? '升级前的 AI7' : `升级前的 AI7（${upgrade.fromSoftwareVersion}）`;
  return {
    lead: `回退只恢复升级前的数据，AI7 不保留、也不运行旧版软件。${earlier}打不开升级后的数据，所以先把它挪开：`,
    steps: [
      `关闭 AI7，把数据文件夹「${places.dataRoot}」改名，例如在名字后面加上「-升级后」。不要删除它，升级后的数据都在里面。`,
      `安装并启动${earlier}：它以空白数据启动。`,
      `在它的「设置 › 数据与存储」里选「导入数据库…」，选「${places.backupLocation}」里的「${upgrade.backupFileName}」，再选「替换本机全部数据」。`,
    ],
  };
}
