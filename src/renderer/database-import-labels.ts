import type {
  DatabaseImportBookProjection,
  DatabaseImportPreviewProjection,
  DatabaseMergeNotice,
  DatabasePackageOrigin,
  DatabasePendingReplacementProjection,
  DatabaseReplacementRecordProjection,
} from '../shared/protocol.js';
import { databaseExportContentsLine } from './database-export-labels.js';
import { exportBytesLabel } from './manuscript-export-labels.js';

/**
 * 设置 › 数据与存储's 导入数据库 (Issue #434, plan slices S86c and S86d; V2-UX-DSTO-017; ADR 0079 §1.3 to §1.5): the preview of
 * a database file — what it holds, whether its Data Version fits this AI7, where it came from — the two choices, neither
 * preselected, of what to do with it, each Book as a merge would take it and what stays behind, the replacement or merge
 * waiting for AI7's next start, and what each came to. Pure, so the unit suite pins every line.
 */

export const DATABASE_IMPORT_HEADING = '导入数据库';
export const DATABASE_IMPORT_LEDE = '先查看数据库文件里有什么、数据版本是否与本机兼容、来自哪里，再决定怎样使用它。';
export const DATABASE_IMPORT_ACTIONS = {
  choose: '导入数据库…',
  confirm: '按所选方式导入',
  cancelPreview: '取消',
  quit: '现在关闭 AI7',
  cancelReplacement: '取消替换',
  cancelRollBack: '取消回退',
  cancelMerge: '取消合并',
  rollBack: '回退到替换前的数据…',
  confirmRollBack: '确认回退',
  keep: '不回退',
} as const;
/** The choices a previewed file offers; neither is preselected (DSTO-017). */
export const DATABASE_IMPORT_CHOICES_LEGEND = '怎样使用这个文件';
export const DATABASE_IMPORT_CHOICES = {
  replace: '替换本机全部数据（先自动备份，可回退）',
  merge: '只导入其中的图书，与本机合并（重名的另存）',
} as const;
/** What `替换本机全部数据` will do, stated before it is confirmed. */
export const DATABASE_REPLACE_CONSEQUENCE =
  '本机现在的全部图书、稿件与历史、知识库和设置都会换成这个文件里的内容。AI7 先把现在的数据备份成一个文件，放在备份位置，之后可以回退；替换在 AI7 下次启动时完成。模型服务凭据不在文件里，替换后可能需要重新填写。';
/** What `只导入其中的图书` will do, stated before it is confirmed (ADR 0079 §1.5). */
export const DATABASE_MERGE_CONSEQUENCE =
  '本机还没有的图书会带着它的稿件与历史、标注与建议、任务与结果、交付物一起导入；和本机图书同名的另存为另一本。本机已有的图书、设置与模型服务凭据都不变。AI7 先把现在的数据备份成一个文件，放在备份位置；合并在 AI7 下次启动时完成。';
/** When every Book of the file is already here. */
export const DATABASE_MERGE_NOTHING = '这个文件里的图书本机都已经有了，没有可以合并的。';
/** What stays behind when the Books merge. */
export const DATABASE_MERGE_NOTICE_LINES: Readonly<Record<DatabaseMergeNotice, string>> = {
  series: '书系关系与书系知识不随图书合并。',
  'library-materials': '资料库的条目不随图书合并。',
  'internal-number': '内部编号已被本机其他图书使用的，合并后不带内部编号。',
};
export const DATABASE_IMPORT_STATUS_LINES = {
  choosing: '正在打开系统的文件对话框…',
  cancelled: '已取消选择数据库文件。',
  previewed: '已读取并逐项核对数据库文件，请选择怎样使用它。',
  previewFailed: '未能读取数据库文件。',
  closed: '已取消这次导入，本机数据没有改变。',
  preparing: '正在备份本机数据并准备替换…',
  prepared: '已准备好替换，AI7 下次启动时完成。',
  prepareFailed: '未能准备替换。',
  cancelling: '正在取消…',
  replacementCancelled: '已取消，本机数据没有改变。',
  cancelFailed: '未能取消。',
  rollingBack: '正在备份本机数据并准备回退…',
  rollBackPrepared: '已准备好回退，AI7 下次启动时完成。',
  rollBackFailed: '未能准备回退。',
  preparingMerge: '正在备份本机数据并准备合并…',
  mergePrepared: '已准备好合并，AI7 下次启动时完成。',
  mergeFailed: '未能准备合并。',
  quitting: '正在关闭 AI7…',
  quitBlocked: '还有窗口里有未保存的修改，AI7 没有关闭。',
  quitFailed: '未能关闭 AI7。',
  recordsUnavailable: '无法读取替换记录。',
} as const;
export const DATABASE_REPLACEMENT_RECORDS = '导入记录';
export const DATABASE_REPLACEMENT_NO_RECORDS = '还没有导入过数据库。';

export const DATABASE_PACKAGE_ORIGIN_LABELS: Readonly<Record<DatabasePackageOrigin, string>> = {
  'database-export': '导出数据库',
  'scheduled-backup': '定期自动备份',
  'pre-replace-backup': '替换前备份',
  'pre-merge-backup': '合并前备份',
  'pre-upgrade-backup': '升级前备份',
};

/** The file's Data Version against this AI7's, and the software that made it. */
export function databaseImportVersionLine(preview: Pick<DatabaseImportPreviewProjection, 'dataVersion' | 'localDataVersion' | 'compatibility' | 'softwareVersion'>): string {
  const fit = {
    compatible: '与本机相同',
    'newer-data-version': `比本机的数据版本 ${preview.localDataVersion} 新，请先更新 AI7`,
    'older-data-version': `比本机的数据版本 ${preview.localDataVersion} 旧，暂不能导入`,
    'newer-schema': '由更新的 AI7 做成，请先更新 AI7',
  }[preview.compatibility];
  return `数据版本 ${preview.dataVersion} · ${fit} · 软件 ${preview.softwareVersion}`;
}

/** The previewed file, as 导入数据库 states it before anything is chosen: file, origin, versions, contents, integrity. */
export function databaseImportPreviewRows(
  preview: DatabaseImportPreviewProjection,
  instant: (iso: string) => string,
): ReadonlyArray<readonly [string, string]> {
  return [
    ['文件', `「${preview.fileName}」 · ${exportBytesLabel(preview.byteLength)}`],
    ['来源', `${DATABASE_PACKAGE_ORIGIN_LABELS[preview.origin]} · ${instant(preview.createdAt)}`],
    ['版本', databaseImportVersionLine(preview)],
    ['内容', databaseExportContentsLine(preview.contents)],
    ['完整性', `已逐项核对 ${preview.members} 个文件，完整`],
  ];
}

/** Why a file that does not fit this AI7 offers no choice. */
export function databaseImportRefusalLine(preview: Pick<DatabaseImportPreviewProjection, 'compatibility'>): string | null {
  return preview.compatibility === 'compatible' ? null : '这个文件的数据版本与本机 AI7 不兼容，不能导入。';
}

/** What a preview lists past its first Books: `…以及另外 N 本`. */
export function databaseImportMoreBooksLine(listed: number, total: number): string | null {
  return total > listed ? `…以及另外 ${total - listed} 本` : null;
}

/** One Book of the file, as a merge would take it. */
export function databaseImportBookLine(book: DatabaseImportBookProjection): string {
  const how = { new: '将导入', 'same-title': '与本机的一本同名，另存为另一本', present: '本机已有，不导入' }[book.status];
  return `《${book.title}》 · ${how}${book.internalNumberCleared ? ' · 导入后不带内部编号' : ''}`;
}

/** The replacement or merge waiting for AI7's next start, in three lines: what changes, the backup made, and when it completes. */
export function databasePendingLines(
  pending: Pick<DatabasePendingReplacementProjection, 'kind' | 'packageFileName' | 'backupFileName' | 'mergeBooksTotal'>,
): readonly [string, string, string] {
  if (pending.kind === 'merge') {
    return [
      `已准备好把「${pending.packageFileName}」里的 ${pending.mergeBooksTotal ?? 0} 本图书合并到本机。`,
      `本机现在的数据已备份为「${pending.backupFileName}」，放在备份位置。`,
      'AI7 下次启动时完成合并；在此之前做的修改都会保留。',
    ];
  }
  const rollBack = pending.kind === 'roll-back';
  return [
    rollBack ? `已准备好回退到「${pending.packageFileName}」。` : `已准备好用「${pending.packageFileName}」替换本机全部数据。`,
    `本机现在的数据已备份为「${pending.backupFileName}」，放在备份位置。`,
    `AI7 下次启动时完成${rollBack ? '回退' : '替换'}；在此之前不能再做修改，要继续修改请先${rollBack ? DATABASE_IMPORT_ACTIONS.cancelRollBack : DATABASE_IMPORT_ACTIONS.cancelReplacement}。`,
  ];
}

/** One replacement or merge as 导入记录 lists it: when, what it came to, and the backup it made. */
export function databaseReplacementRecordLine(record: DatabaseReplacementRecordProjection, instant: (iso: string) => string): string {
  // Why one failed (Issue #434 review): what waited had changed since it was prepared, an open of the data it brought in was
  // interrupted, or its data would not open.
  const why = record.failure === 'changed' ? '准备好的文件已不完整或被改动'
    : record.failure === 'interrupted' ? '上次启动时打开替换来的数据被中断' : '它无法打开';
  if (record.kind === 'merge') {
    const named = record.mergedTitles ?? [];
    const count = record.mergedCount ?? named.length;
    // The first titles, and 等 when there were more (Issue #434 review).
    const titles = `${named.map((title) => `《${title}》`).join('、')}${count > named.length ? ' 等' : ''}`;
    const what = record.outcome === 'applied'
      ? `已从「${record.packageFileName}」合并 ${count} 本图书：${titles}`
      : `未能从「${record.packageFileName}」合并图书：${record.failure === 'changed' ? `${why}，` : ''}本机数据保持原样`;
    return `${instant(record.recordedAt)} · ${what} · 合并前备份「${record.backupFileName}」${record.backupPresent ? '' : '（文件不在备份位置）'}`;
  }
  const what = record.kind === 'roll-back'
    ? record.outcome === 'applied' ? `已回退到「${record.packageFileName}」` : `未能回退到「${record.packageFileName}」：${why}，本机数据保持原样`
    : record.outcome === 'applied' ? `已用「${record.packageFileName}」替换本机全部数据` : `未能用「${record.packageFileName}」替换：${why}，本机数据保持原样`;
  return `${instant(record.recordedAt)} · ${what} · ${record.kind === 'roll-back' ? '回退前备份' : '替换前备份'}「${record.backupFileName}」${record.backupPresent ? '' : '（文件不在备份位置）'}`;
}

/** 导入记录's summary: how many, and whether only the newest are listed. */
export function databaseReplacementRecordsLabel(listed: number, total: number): string {
  return total > listed ? `${DATABASE_REPLACEMENT_RECORDS}（最近 ${listed} 次，共 ${total} 次）` : `${DATABASE_REPLACEMENT_RECORDS}（${total}）`;
}

/** What `回退到替换前的数据…` offers, and what confirming it will do. */
export function databaseRollBackLines(record: Pick<DatabaseReplacementRecordProjection, 'packageFileName' | 'backupFileName'>): readonly [string, string] {
  return [
    `上次用「${record.packageFileName}」替换了本机全部数据；替换前的数据在「${record.backupFileName}」里。`,
    `回退会用「${record.backupFileName}」替换本机现在的全部数据。AI7 先把现在的数据也备份一次；回退在 AI7 下次启动时完成。`,
  ];
}
