/**
 * The words of Editing Protection Mode and its Protective Read-only State (Issue #951, wave 12 slice 12a; V2-UX-DUR-001 to
 * DUR-012, ED-055, ED-056, ED-058). Pure, so the unit suite pins each line. Nothing here says 已保存: until the service
 * acknowledges the exact buffered sequence every line says the change is not yet durable.
 */

/** The persistent header line that replaces the saved styling (ED-055, DUR-003). */
export const PROTECTION_HEADLINE = '本地写入中断 · 当前更改尚未持久保存';
export const PROTECTION_READ_ONLY_HEADLINE = '保护性只读 · 当前更改尚未持久保存';
/** The one direct action of the header (DUR-003). */
export const PROTECTION_OPTIONS_ACTION = '查看保护选项';
export const PROTECTION_OPTIONS_TITLE = '编辑保护选项';
export const PROTECTION_RETRY_ACTION = '重试写入';
export const PROTECTION_COPY_ACTION = '复制受影响内容';
export const PROTECTION_CLOSE_OPTIONS = '关闭';
export const PROTECTION_COPIED = '受影响内容已复制到剪贴板；这不代表已写入修订日志。';
export const PROTECTION_COPY_FAILED = '无法复制受影响内容，请在稿件中选中这些文字后自行复制。';
/** DUR-012: the line the status returns to — the normal completion label, nothing celebratory and no record. */
export const PROTECTION_CLEARED = '已写入修订日志';
/** DUR-011: what a forced termination keeps. */
export const PROTECTION_RESTART_PROMISE = '如果 AI7 被强制关闭，重新打开后只能恢复到「最后确认写入」处；之后的内容只在本窗口中，无法保证保留。';
/** DUR-009: exact local salvage export appears only when the service can reconstruct and receipt the payload. */
export const PROTECTION_SALVAGE_UNAVAILABLE = '本地业务服务目前无法重建并出具回执，暂不提供导出受影响内容；请先复制受影响内容。';
/** An input that would take the buffer past its safe capacity is not taken (DUR-002). */
export const PROTECTION_BUFFER_REFUSED = '未确认内容已接近安全上限，这次输入未被接收；请先重试写入，或复制受影响内容。';
/** The marker shape beside the words (ED-058): text and shape, never colour alone. */
export const PROTECTION_MARKER = '⚠';

export type ProtectionCause = 'journal-unavailable' | 'service-stopped' | 'drift';
export type ProtectionReadOnlyReason = 'capacity' | 'service-stopped' | 'drift';

export function lastDurableLine(sequence: number, durableAt: string): string {
  return `最后确认写入：修订日志序号 ${sequence.toLocaleString('zh-CN')} · ${new Date(durableAt).toLocaleString('zh-CN', { hour12: false })}`;
}

/** DUR-004: editor-readable location and character count, never bytes or process detail. */
export function atRiskLine(location: string | null, characters: number): string {
  if (location === null || characters === 0) return '未确认内容：无';
  return `未确认内容：${location}，约 ${characters.toLocaleString('zh-CN')} 字`;
}

export function atRiskLocation(structureLabel: string | null, firstBlockPosition: number, blocks: number): string {
  const paragraph = `第 ${firstBlockPosition.toLocaleString('zh-CN')} 段${blocks > 1 ? `起 ${blocks} 段` : ''}`;
  return structureLabel === null ? paragraph : `${structureLabel} · ${paragraph}`;
}

export function retryLine(cause: ProtectionCause, retrying: boolean, attempts: number, secondsUntilNext: number | null): string {
  if (cause === 'service-stopped') return '自动重试：本地业务服务已停止，无法自动重试';
  if (cause === 'drift') return '自动重试：已停止——稿件在中断期间已变化，不能按原顺序写入';
  if (retrying) return `自动重试：正在重试写入（已重试 ${attempts} 次）`;
  if (secondsUntilNext !== null) return `自动重试：${secondsUntilNext} 秒后重试（已重试 ${attempts} 次）`;
  return `自动重试：等待中（已重试 ${attempts} 次）`;
}

export function readOnlyLine(reason: ProtectionReadOnlyReason): string {
  switch (reason) {
    case 'capacity':
      return '未确认内容已接近安全上限，已暂停输入以免丢失；输入法组合已完整保留。';
    case 'service-stopped':
      return '本地业务服务已停止，已暂停输入；未确认内容仍在编辑区。';
    case 'drift':
      return '稿件在写入中断期间已在别处变化，AI7 不会模糊地重放这些内容；请复制受影响内容，再刷新稿件后核对。';
  }
}

/** DUR-005: the exact reason beside an attempted action that could discard, duplicate or fork the buffered input. */
export function blockedActionLine(action: string | null): string {
  const named = action === null || action.length === 0 ? '这项操作' : `「${action}」`;
  return `本地写入中断，当前更改尚未持久保存：暂不能执行${named}。请先${PROTECTION_RETRY_ACTION}，或${PROTECTION_COPY_ACTION}。`;
}

/** DUR-010: a close request with at-risk input opens the protection surface and says why the window stays. */
export const PROTECTION_CLOSE_BLOCKED = '窗口未关闭：仍有未持久保存的内容。请先重试写入；或复制受影响内容后，待写入恢复再关闭。';
