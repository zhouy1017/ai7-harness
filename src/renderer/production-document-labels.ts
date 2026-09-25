import type { ProductionDocumentDeliveryProjection, ProductionDocumentProjection, ProductionDocumentSourceProjection } from '../shared/protocol.js';

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
  deliver: '交付…',
  redeliver: '再交付…',
  confirmDeliver: '交付',
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

// ---- 交付 (Issue #415, S66b; DELIV-003, DELIV-004) --------------------------------------------------

/** A document with no Delivery Record yet. */
export const DOCUMENT_NOT_DELIVERED = '尚未交付';
/** `交付后有修改` (DELIV-004): an edit after a delivery, so the text is no version the document was delivered at. */
export const DOCUMENT_CHANGED_SINCE_DELIVERY = '交付后有修改';
export const DOCUMENT_DELIVERIES_HEADING = '交付记录';
export const DELIVERY_FORM_HEADING = '交付';
export const DELIVERY_VERSION_LEGEND = '交付哪一版';
export const DELIVERY_UNSAVED_NOTE = '有修改尚未保存为版本：交付「现在的文字」会先把它保存为新的版本；也可以交付已保存的版本。';
export const DELIVERY_RECIPIENT_LEGEND = '交给谁';
export const DELIVERY_CUSTOM_RECIPIENT = '自行输入';
export const DELIVERY_CUSTOM_LABEL = '交给谁（自行输入）';
export const DELIVERY_NOTE_LABEL = '备注（可不填）';
/** Stated beside `交付` before the editor confirms (DELIV-003): a delivery records and never sends. */
export const DELIVERY_STATEMENT = '交付只记录这一版交给了谁；AI7 不会发送，文件由你导出到所选位置后自行交出。';
export const DELIVERY_BLOCKERS = {
  version: '先选择要交付的版本',
  recipient: '先选择交给谁',
  custom: '请写明交给谁',
} as const;
/** The first choice while the text moved past the latest version (DELIV-003): `现在的文字（交付时先保存为版本 3）`. */
export function documentCurrentTextChoice(nextOrdinal: number): string {
  return `现在的文字（交付时先保存为版本 ${nextOrdinal}）`;
}
/** What a Delivery Record's export came to, when none has been made yet. */
export const DELIVERY_NO_EXPORT = '暂无导出记录';

/** `第 1 次交付 · 宣传部 · 版本 2 · 9月24日 11:00`: never 已交付 (PUB-009's words stay out of 交付物). */
export function documentDeliveryLine(delivery: Pick<ProductionDocumentDeliveryProjection, 'ordinal' | 'recipient' | 'versionLabel'>, recordedAt: string): string {
  return `第 ${delivery.ordinal} 次交付 · ${delivery.recipient.label} · ${delivery.versionLabel} · ${recordedAt}`;
}

/** What the delivery's export came to: the file written, or nothing yet. */
export function documentDeliveryExportLine(delivery: Pick<ProductionDocumentDeliveryProjection, 'export'>): string {
  return delivery.export === null ? DELIVERY_NO_EXPORT : `${delivery.export.outcomeLabel} · ${delivery.export.fileName}`;
}

/** `已记录第 1 次交付 · 宣传部`. */
export function documentDeliveredLine(ordinal: number, recipient: string): string {
  return `已记录第 ${ordinal} 次交付 · ${recipient}`;
}

/** The export card's name for a document version: `新闻稿 · 版本 2`. */
export function documentExportLabel(typeLabel: string, versionLabel: string): string {
  return `${typeLabel} · ${versionLabel}`;
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
  delivering: '正在记录交付…',
  deliverFailed: '无法记录这次交付。',
  // A recovery restore of a document (Issue #543 follow-up): its text is the chosen one, which no version holds yet.
  recovered: '文档已恢复为所选的文字，尚未保存为版本。',
  recoveredNotOpened: '文档已恢复为所选的文字，但没能打开；已回到交付物，可以从这里再打开它。',
  recoveredNothingOpened: '文档已恢复为所选的文字，但文档和交付物都没能打开；可以再打开图书。',
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
