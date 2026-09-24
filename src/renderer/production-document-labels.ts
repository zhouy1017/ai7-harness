import type { ProductionDocumentProjection, ProductionDocumentSourceProjection } from '../shared/protocol.js';

/**
 * Every word of 交付 · 生产文档 (Issue #415, plan slice S66; editor-surfaces §9; V2-UX-DELIV-001, DELIV-002,
 * WORK-013, MILE-014) that the service projection does not already carry — the house types' labels and every
 * version's `版本 N` come from it. A document is never a milestone, is never 签发 and is never 发稿: none of these
 * words names one, and none says 已交付 (PUB-009's words stay out of every 交付物 answer). Pure, so the unit suite
 * pins every string byte for byte; an instant arrives already formatted.
 */

// ---- 交付物's block ------------------------------------------------------------------------------------

export const DOCUMENTS_HEADING = '交付 · 生产文档';
export const DOCUMENTS_LEDE = '每一类生产文档有自己的版本，与稿件的发稿互不影响。';
/** A type with no document yet. */
export const DOCUMENT_STATE_NONE = '尚未创建';
/** The type is `本书不做` for this Book. */
export const DOCUMENT_STATE_NOT_FOR_THIS_BOOK = '本书不做';
/** Beside `本书不做` when the type already has a document: nothing of it is removed. */
export const DOCUMENT_KEPT_NOTE = '文档与它的版本都保留；恢复后照常处理。';
/** The working text moved past the latest version. */
export const DOCUMENT_CHANGED_SINCE_VERSION = '有修改尚未保存为版本';
/** Why 从来源材料创建… cannot be offered: the Book holds no source material a document can start from. */
export const DOCUMENT_NO_SOURCES = '先把文档的初稿作为来源材料导入：导入稿件时选「作为来源材料导入」。';

/** The label of every `data-document-action` the block and the document surface carry. */
export const DOCUMENT_ACTION_LABELS = {
  create: '从来源材料创建…',
  confirmCreate: '创建文档',
  cancel: '取消',
  open: '打开',
  notForThisBook: '本书不做',
  restore: '恢复',
  saveVersion: '保存为版本',
  back: '返回交付物',
} as const;
export type DocumentAction = keyof typeof DOCUMENT_ACTION_LABELS;

/** The create form: one material chosen from the Book's own, none preselected. */
export const DOCUMENT_SOURCE_LEGEND = '选择来源材料';
export const DOCUMENT_SOURCE_HINT = '文档的第一个版本就是这份材料的文字；材料本身不变。';

/** A material on the create form: its name, its format and when it was imported. */
export function documentSourceLine(source: ProductionDocumentSourceProjection, importedAt: string): string {
  return `${source.displayName} · ${source.format} · 导入于 ${importedAt}`;
}

/** The first line of a document's card: its latest version and the material it was made from. */
export function documentCardLine(document: ProductionDocumentProjection): string {
  const latest = document.versions[0];
  return `${latest === undefined ? '' : `${latest.label} · `}由「${document.origin.displayName}」创建`;
}

/** An accessible name for a card action: what it does to which type. */
export function documentActionName(action: DocumentAction, typeLabel: string): string {
  return `${DOCUMENT_ACTION_LABELS[action]}：${typeLabel}`;
}

export const DOCUMENT_STATUS_LINES = {
  creating: '正在从来源材料创建文档…',
  deciding: '正在记录…',
  opening: '正在打开文档…',
  openFailed: '无法打开文档。',
  createFailed: '无法创建文档。',
  decideFailed: '无法记录这个决定。',
  notForThisBook: '已标为本书不做',
  restored: '已恢复',
  savingVersion: '正在保存为版本…',
  saveVersionFailed: '无法保存为版本。',
  versionUnchanged: '没有新的修改，当前已是最新版本',
} as const;

/** `已创建「新闻稿」`. */
export function documentCreatedLine(typeLabel: string): string {
  return `已创建「${typeLabel}」`;
}

/** `已保存为版本 2`. */
export function documentVersionSavedLine(label: string): string {
  return `已保存为${label}`;
}

// ---- the document's surface (DELIV-002) -------------------------------------------------------------

export const DOCUMENT_SURFACE_LABEL = '生产文档';
export const DOCUMENT_CURRENT_VERSION = '当前版本';
export const DOCUMENT_LENS_LABEL = '工作流程';
export const DOCUMENT_VERSIONS_HEADING = '版本与交付';
export const DOCUMENT_VERSIONS_TRUNCATED = '更早的版本保留在文档的历史中。';
/** The version the working text stands on. */
export const DOCUMENT_VERSION_CURRENT_MARK = '当前';
export const DOCUMENT_MATERIALS_HEADING = '这份文档的材料';
export const DOCUMENT_MATERIALS_EMPTY = '暂无材料。任务简报、引语台账、事实核查记录与参考的范例会列在这里。';

/** A version row: `版本 2 · 2026年9月24日 10:30`. */
export function documentVersionLine(label: string, createdAt: string): string {
  return `${label} · ${createdAt}`;
}
