import type { DatabaseExportContentsProjection, DatabaseExportPreparationProjection, DatabaseExportReceiptProjection } from '../shared/protocol.js';
import { exportBytesLabel } from './manuscript-export-labels.js';

/**
 * 设置 › 数据与存储's 导出数据库 (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.6, §1.7): what the package holds and
 * what it never does, the prepared file before `按上述方式导出`, and what each export came to. The export's own words are every
 * export's. Pure, so the unit suite pins every line.
 */

export const DATABASE_EXPORT_HEADING = '导出数据库';
/** What the one file holds, and what it does not (DSTO-017; ADR 0079 §1.6: not encrypted, no credential). */
export const DATABASE_EXPORT_LEDE = '把全部图书、稿件与历史、知识库和设置打包成一个文件。文件不含模型服务凭据，也不加密；包里记录数据版本和导出时间。';
export const DATABASE_EXPORT_ACTIONS = {
  choose: '导出数据库…',
  approve: '按上述方式导出',
  cancel: '取消',
} as const;
export const DATABASE_EXPORT_STATUS_LINES = {
  choosing: '正在打开系统的保存对话框…',
  cancelled: '已取消选择保存位置，没有写入任何文件。',
  prepared: '数据库已打包好，等待你确认导出。',
  prepareFailed: '未能打包数据库。',
  writing: '正在写入所选位置…',
  approveFailed: '未能导出数据库。',
  closed: '已取消这次导出，没有写入任何文件。',
  recordsUnavailable: '无法读取导出记录。',
} as const;
export const DATABASE_EXPORT_RECORDS = '导出记录';
export const DATABASE_EXPORT_NO_RECORDS = '还没有导出过数据库。';

/** `3 本图书 · 5 个来源版本 · 资料库 2 项 · 书系 1 个`. */
export function databaseExportContentsLine(contents: DatabaseExportContentsProjection): string {
  return `${contents.books} 本图书 · ${contents.sourceVersions} 个来源版本 · 资料库 ${contents.libraryMaterials} 项 · 书系 ${contents.series} 个`;
}

/** The prepared file as `按上述方式导出` will write it: name and size, place, create or replace, contents, versions. */
export function databaseExportPreparedRows(preparation: DatabaseExportPreparationProjection): ReadonlyArray<readonly [string, string]> {
  return [
    ['文件', `「${preparation.fileName}」 · ${exportBytesLabel(preparation.payloadBytes)}`],
    ['位置', preparation.destination],
    ['方式', preparation.dispositionLabel],
    ['内容', databaseExportContentsLine(preparation.contents)],
    ['版本', `数据版本 ${preparation.dataVersion} · 软件 ${preparation.softwareVersion}`],
  ];
}

/** What an approved export came to, in the export's own words. */
export function databaseExportOutcomeLine(receipt: Pick<DatabaseExportReceiptProjection, 'outcomeLabel' | 'detail'>): string {
  return `${receipt.outcomeLabel}：${receipt.detail}`;
}

/** One export as 导出记录 lists it: when, which file, and what it came to. */
export function databaseExportRecordLine(receipt: DatabaseExportReceiptProjection, instant: (iso: string) => string): string {
  return `${instant(receipt.recordedAt ?? receipt.approvedAt)} · 「${receipt.fileName}」 · ${receipt.outcomeLabel}`;
}

/** 导出记录's summary: how many, and whether only the newest are listed. */
export function databaseExportRecordsLabel(listed: number, total: number): string {
  return total > listed ? `${DATABASE_EXPORT_RECORDS}（最近 ${listed} 次，共 ${total} 次）` : `${DATABASE_EXPORT_RECORDS}（${total}）`;
}
