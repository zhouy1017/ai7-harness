import { expect } from 'vitest';

/** #1315 acceptance vocabulary, shared by renderer page tests and later UI slices. */
export const TECHNICAL_TEXT_PATTERNS = [
  /（默认不选择）/u, /（四选一）/u, /精确结果记录/u, /工作流程实例/u, /结果集修订版/u, /新鲜度/u, /来源字节数/u, /本机文件选择器 · 本地解析 · 未联网/u, /安全的下一步：/u,
  /查看技术详情/u, /（第 \d+ 版）/u, /\bv\d{1,3}\b/u,
  /ordinary-production/u, /developer-live/u, /gpt-|claude-|deepseek-|gemini-/u,
  /[0-9a-f]{8,}/u, /主分支/u, /\d+\.\d{3}%/u,
] as const;

export function expectNoTechnicalText(root: { readonly textContent: string | null }, sourceContent: ReadonlyArray<{ readonly textContent: string | null }> = []): void {
  // Legal/source text is preserved verbatim and asserted separately by the caller; scan composed UI metadata only.
  let text = root.textContent ?? '';
  for (const source of sourceContent) if (source.textContent) text = text.replace(source.textContent, '');
  for (const pattern of TECHNICAL_TEXT_PATTERNS) expect(pattern.test(text), `technical text pattern: ${pattern.source}`).toBe(false);
}
