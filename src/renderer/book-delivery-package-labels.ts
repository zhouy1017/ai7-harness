import type { BookDeliveryPackageVersionProjection } from '../shared/protocol.js';

/**
 * Every word of 图书交付包 (Issue #416, plan slice S67a; editor-surfaces §9; V2-UX-BUNDLE-001 to 005, DPKG-001 to 015)
 * that the service projection does not already carry — each condition's state, the preview's lines and a version's
 * summary come from it. A package is never 发稿 and never 交付, and nothing here says 已交付 (PUB-009's words stay out of
 * every 交付物 answer). Pure, so the unit suite pins every string byte for byte; an instant arrives already formatted.
 */

export const PACKAGE_HEADING = '图书交付包';
export const PACKAGE_CONDITIONS_HEADING = '条件';
/** A condition's state in words and shape, never by colour alone. */
export const PACKAGE_CONDITION_STATE = { met: '✓ 已满足', unmet: '○ 未满足' } as const;
export const PACKAGE_PREVIEW_HEADING = '清单预览';
export const PACKAGE_INCLUDED_HEADING = '包含';
export const PACKAGE_EXCLUDED_HEADING = '不包含';
export const PACKAGE_LIMITATIONS_HEADING = '限制';
export const PACKAGE_INCLUDED_TRUNCATED = '更早的审阅报告也在包中，这里只列出最近的。';
export const PACKAGE_LIMITATIONS_TRUNCATED = '更早的审阅也各有说明，都写在包的内容里，这里只列出最近的。';
export const PACKAGE_PURPOSE_LABEL = '交付包用途';
export const PACKAGE_PURPOSE_HINT = '写明为什么准备这一版，例如「交出版社存档」。';
export const PACKAGE_PREPARE = '准备图书交付包';
export const PACKAGE_PURPOSE_NEEDED = '先写明交付包用途。';
export const PACKAGE_VERSIONS_HEADING = '已准备的版本';
export const PACKAGE_VERSIONS_TRUNCATED = '更早的版本保留在记录中。';
export const PACKAGE_CURRENT_MARK = '当前';
export const PACKAGE_PREPARED = '图书交付包已准备';

export const PACKAGE_STATUS_LINES = {
  preparing: '正在准备图书交付包…',
  prepareFailed: '无法准备图书交付包。',
  refreshFailed: '无法读取图书交付包。',
} as const;

/** Why `准备图书交付包` is unavailable: the conditions that do not hold yet, in the table's order. */
export function packageNotReadyLine(unmet: ReadonlyArray<string>): string {
  return `还不能准备：${unmet.join('、')}未满足。`;
}

/** The content moved on since the newest version (BUNDLE-004). */
export function packageChangedLine(label: string): string {
  return `内容与图书交付包 ${label} 不同：再次准备会生成新的版本，${label} 保持不变。`;
}

/** `v2 · 图书交付包已准备 · 暂无导出记录` (DPKG-011): the prepared state beside its derived export history. */
export function packageVersionLine(version: Pick<BookDeliveryPackageVersionProjection, 'label' | 'exportHistoryLabel'>): string {
  return `${version.label} · ${PACKAGE_PREPARED} · ${version.exportHistoryLabel}`;
}

/** `用途：交出版社存档 · 9月24日 12:30`. */
export function packageVersionMeta(purpose: string, preparedAt: string): string {
  return `用途：${purpose} · ${preparedAt}`;
}

/** `已准备图书交付包 v1`, or the newest version unchanged. */
export function packagePreparedLine(label: string): string {
  return `已准备图书交付包 ${label}`;
}

export function packageUnchangedLine(label: string): string {
  return `内容和用途都没有变化，仍是图书交付包 ${label}`;
}

// ---- a version's export (Issue #416, plan slice S67b; BUNDLE-004, DPKG-011, EXP-010 to EXP-022) ------------------------

/** The label of every `data-package-action` of a version's export. */
export const PACKAGE_EXPORT_ACTION_LABELS = {
  open: '导出…',
  choose: '选择位置…',
  chooseAgain: '重新选择位置…',
  approve: '按上述方式导出',
  cancel: '取消',
  close: '完成',
  reveal: '在文件夹中显示',
} as const;
export type PackageExportAction = keyof typeof PACKAGE_EXPORT_ACTION_LABELS;

/** 导出… names the version it exports for a screen reader, since several stand side by side. */
export function packageExportOpenAccessibleName(label: string): string {
  return `导出图书交付包 ${label}…`;
}

export function packageExportHeading(label: string): string {
  return `导出 · 图书交付包 ${label}`;
}

export const PACKAGE_EXPORT_FILES_LABEL = '写入所选文件夹的文件';
export const PACKAGE_EXPORT_FILES_TRUNCATED = '其余文件也一并写入，这里只列出前面的。';
export const PACKAGE_EXPORT_FORMAT_NAMES = { docx: 'DOCX', pdf: 'PDF', markdown: 'Markdown' } as const;

/** `「书名 · 一审稿.docx」 · DOCX`. */
export function packageExportFileName(fileName: string, format: keyof typeof PACKAGE_EXPORT_FORMAT_NAMES): string {
  return `「${fileName}」 · ${PACKAGE_EXPORT_FORMAT_NAMES[format]}`;
}

/** EXP-019 as a package reads it: the folder must hold none of the names, so an export never replaces a file. */
export const PACKAGE_EXPORT_FOLDER_UNCHOSEN =
  '还没有选择文件夹。请选择一个空文件夹，或在系统的对话框里新建一个：已有同名文件的文件夹不能使用，导出不会替换任何文件。';

export function packageExportFolderLine(folder: string): string {
  return `导出到：${folder}`;
}

export const PACKAGE_EXPORT_APPROVE_REASON = '先选择位置。';

/** The file that stopped the rest, and why (EXP-021): nothing after it was tried, and nothing is retried by itself. */
export function packageExportStoppedLine(stopped: { fileName: string; reason: string }): string {
  return `「${stopped.fileName}」没有导出：${stopped.reason}之后的文件没有写入，AI7 不会自动重试；可以重新导出到别的文件夹。`;
}

/** A version's Package Export History (DPKG-011), each export in one line. */
export function packageExportsAccessibleName(label: string): string {
  return `图书交付包 ${label} 的导出记录`;
}

/** `已导出到所选位置 · 3 个文件 · 9月24日 12:30`. */
export function packageExportHistoryLine(summary: string, exportedAt: string): string {
  return `${summary} · ${exportedAt}`;
}

export const PACKAGE_EXPORTS_TRUNCATED = '更早的导出保留在记录中。';

export const PACKAGE_EXPORT_STATUS_LINES = {
  reviewing: '正在列出要导出的文件…',
  reviewed: '要导出的文件已列出',
  reviewFailed: '无法准备图书交付包的导出。',
  choosing: '正在打开系统的文件夹对话框…',
  cancelled: '已取消选择位置，没有写入任何文件。',
  prepared: '已准备好导出文件，等待你确认。',
  chooseFailed: '未能准备导出文件。',
  writing: '正在写入所选文件夹…',
  approveFailed: '未能导出图书交付包。',
  closed: '已关闭导出，没有写入任何文件。',
  revealed: '已在文件夹中显示。',
  revealFailed: '无法在文件夹中显示。',
} as const;
