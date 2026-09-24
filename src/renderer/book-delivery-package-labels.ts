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
