import type { DataVersionProjection, StoreVersionProjection } from '../shared/protocol.js';

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
export const DATA_VERSION_UNAVAILABLE = '无法读取版本。';
/** What the Data Version is (ADR 0079 §1.1): it changes only when older software could no longer read the data. */
export const DATA_VERSION_PROMISE = '数据版本只在旧版软件无法再读取这些数据时才会改变；普通的软件更新保持它不变。';

/** Whether the Data Version is frozen yet (ADR 0079 §1.2). */
export function dataVersionStateLine(projection: Pick<DataVersionProjection, 'frozen' | 'dataVersion'>): string {
  return projection.frozen
    ? `数据版本 ${projection.dataVersion} 已冻结。`
    : `开发阶段：首个正式发布时冻结为数据版本 ${projection.dataVersion}；在那之前，开发中的数据可以重建。`;
}

/** The latest software update and what it did to the Data Version (DSTO-016). */
export function dataVersionUpdateLine(update: DataVersionProjection['update']): string {
  if (update === null) return '这份数据还没有经历过软件更新。';
  return update.fromDataVersion === update.toDataVersion
    ? `软件从 ${update.from} 更新到 ${update.to}；数据版本仍为 ${update.toDataVersion}，数据无需变更。`
    : `软件从 ${update.from} 更新到 ${update.to}；数据版本从 ${update.fromDataVersion} 变为 ${update.toDataVersion}。`;
}

/** The records' summary: how many, and whether only the newest are listed. */
export function dataVersionRecordsLabel(listed: number, truncated: boolean): string {
  return truncated ? `${DATA_VERSION_RECORDS}（最近 ${listed} 条）` : `${DATA_VERSION_RECORDS}（${listed}）`;
}

/** One version record: when, which software, which Data Version. */
export function storeVersionLine(record: Pick<StoreVersionProjection, 'softwareVersion' | 'dataVersion' | 'recordedAt'>, instant: (iso: string) => string): string {
  return `${instant(record.recordedAt)} · 软件 ${record.softwareVersion} · 数据版本 ${record.dataVersion}`;
}
