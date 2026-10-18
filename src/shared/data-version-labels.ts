/** Startup refusals that may cross the service boundary: fixed words and version numbers only, never arbitrary error text. */
export const DATA_VERSION_STARTUP_TITLE = '无法打开数据';
export const DATA_VERSION_STARTUP_CLOSE = '关闭';
export const DATA_VERSION_MARKER_UNREADABLE = '这份数据的数据版本标记无法读取：AI7 没有打开这份数据，也没有改动它。请使用写入这份数据的 AI7 打开，或从备份恢复。';
export const DATA_VERSION_MARKER_UNWRITABLE = '无法写入这份数据的数据版本标记：AI7 没有打开这份数据。请确认数据文件夹可以写入，再启动 AI7。';
export const UPGRADE_BACKUP_FAILED = '升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。请确认备份位置可以写入、空间足够，再启动 AI7。';
export const UPGRADE_BACKUP_EXISTS = '备份位置里已经有一个同名的文件，升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。请稍后再启动 AI7。';
export const UPGRADE_BACKUP_UNSUPPORTED = '备份位置所在的磁盘不能安全地新建文件，升级前备份没有完成：AI7 没有升级这份数据，也没有打开它。';

export function newerDataVersionMessage(dataVersion: number, schemaRevision: number): string {
  return `这份数据来自更新的 AI7（数据版本 ${dataVersion} / 数据库修订 ${schemaRevision}），请使用更新的 AI7 打开。`;
}

/** Accept only the exact, bounded storage refusals owned here, on both sides of startup IPC. */
export function dataVersionStartupRefusal(code: unknown, message: unknown): { code: string; message: string } | null {
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  if ((code === 'DATA_VERSION_MARKER_UNREADABLE' && message === DATA_VERSION_MARKER_UNREADABLE) ||
    (code === 'DATA_VERSION_MARKER_UNWRITABLE' && message === DATA_VERSION_MARKER_UNWRITABLE) ||
    (code === 'UPGRADE_BACKUP_FAILED' && message === UPGRADE_BACKUP_FAILED) ||
    (code === 'UPGRADE_BACKUP_EXISTS' && message === UPGRADE_BACKUP_EXISTS) ||
    (code === 'UPGRADE_BACKUP_UNSUPPORTED' && message === UPGRADE_BACKUP_UNSUPPORTED)) return { code, message };
  if (code !== 'DATA_VERSION_NEWER') return null;
  const numbers = /^这份数据来自更新的 AI7（数据版本 ([1-9]\d{0,15}) \/ 数据库修订 ([1-9]\d{0,15})），请使用更新的 AI7 打开。$/u.exec(message);
  if (numbers === null || !numbers.slice(1).every((value) => Number.isSafeInteger(Number(value)))) return null;
  return { code, message };
}
