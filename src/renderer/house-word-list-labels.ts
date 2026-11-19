import { technicalWords } from './technical-layer.js';

/**
 * 本社词表's words (Issue #1543; plan #1516 §5): one name everywhere, a saved list named by the date and time it was saved,
 * and no 「版本」 without one. Pure, so the unit suite pins every sentence. The developer layer keeps the version number.
 */
export const HOUSE_NAME = '本社词表';
export const HOUSE_CATEGORY_HOLDS = '本社自己的词条：审阅时可以选用，命中的词会以批注提示，由你判断。';
export const HOUSE_EMPTY = '还没有保存本社词表；AI7 不提供预置词条。';
export const HOUSE_CREATE = '创建词表';
export const HOUSE_EDIT = '编辑';
export const HOUSE_SAVE = '保存';
export const HOUSE_DISCARD = '放弃修改';
export const HOUSE_ADD = '添加词条';
export const HOUSE_REMOVE = '移除';
export const HOUSE_LATEST = '回到最新词表';
export const HOUSE_RETRY_READ = '重新读取';
export const HOUSE_PREVIOUS = '上一页';
export const HOUSE_NEXT = '下一页';
export const HOUSE_COLUMNS = ['词条', '说明', '启用'] as const;
export const HOUSE_DRAFT_NOTE = '保存后成为最新词表；说明会随批注一起显示；打开、编辑和保存词表都不会开始检查。';
export const HOUSE_READING = '正在读取本社词表…';
export const HOUSE_PASTE_LABEL = '一次加入多条：一行一条，空行忽略';
export const HOUSE_PASTE_ADD = '加入';
export const HOUSE_PASTE_SAVE = '加入并保存';
export const HOUSE_PASTE_REFUSED = '粘贴的词条没有加入：';
export const HOUSE_PASTE_NOTHING = '没有可加入的词条。';
export const HOUSE_HISTORY_SUMMARY = '以前保存的词表';
export const HOUSE_READ_FAILED = '词表读取未完成，请重试。';
export const HOUSE_DRAFT_FAILED = '词表操作未完成；你改的内容还在，请重试。';
export const HOUSE_PASTE_FAILED = '粘贴未完成。';
export const HOUSE_CHANGED = '词表刚被改过，请重新打开编辑。';
export const HOUSE_TOO_MANY = '词表最多保存 500 条词条。';
export const HOUSE_SAVED_READ_PENDING = '本社词表已保存；读取未完成，请重试读取。';
export const HOUSE_SAVED_READING = '本社词表已保存；正在读取词条。';

/** `11 月 16 日 14:05`, with the year only when it is not this one. */
export function houseSavedAt(iso: string, now: Date = new Date(), seconds = false): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const pad = (value: number): string => String(value).padStart(2, '0');
  const year = at.getFullYear() === now.getFullYear() ? '' : `${at.getFullYear()} 年 `;
  return `${year}${at.getMonth() + 1} 月 ${at.getDate()} 日 ${pad(at.getHours())}:${pad(at.getMinutes())}${seconds ? `:${pad(at.getSeconds())}` : ''}`;
}

interface SavedVersion { readonly ordinal: number; readonly createdAt: string; readonly entryCount: number; readonly enabledCount: number }

/** The list on screen: when it was saved and how many words it holds. */
export function houseCurrentLine(version: SavedVersion): string {
  return `${houseSavedAt(version.createdAt)}保存${technicalWords(` · 第 ${version.ordinal} 版`)} · ${version.entryCount} 条，启用 ${version.enabledCount} 条`;
}

/** An earlier list, which can only be read. */
export function houseEarlierLine(version: SavedVersion): string {
  return `这是 ${houseSavedAt(version.createdAt)}保存的词表，只能查看；${version.entryCount} 条，启用 ${version.enabledCount} 条。`;
}

/** One row of the earlier lists: named by date and time to the second, so two saves close together never read the same. */
export function houseHistoryLabel(version: Pick<SavedVersion, 'ordinal' | 'createdAt' | 'entryCount'>): string {
  return `${houseSavedAt(version.createdAt, new Date(), true)} · ${version.entryCount} 条${technicalWords(` · 第 ${version.ordinal} 版`)}`;
}

export function houseSavedStatus(created: boolean, ordinal: number): string {
  return created ? `已保存本社词表${technicalWords(`（第 ${ordinal} 版）`)}。` : `词条没有变化，本社词表保持原样${technicalWords(`（第 ${ordinal} 版）`)}。`;
}

export function houseSavedUnreadStatus(created: boolean): string {
  return `${created ? '已保存本社词表' : '词条没有变化，本社词表保持原样'}；读取未完成，请重试读取。`;
}

export function houseCountLine(total: number, from: number, to: number): string {
  return from === 1 && to === total ? `共 ${total} 条` : `第 ${from}–${to} 条，共 ${total} 条`;
}

export function houseRowLabel(row: number, what: string): string {
  return `第 ${row} 行${what}`;
}
