import { expect } from 'vitest';

/** #1315 acceptance vocabulary, shared by renderer page tests and later UI slices. */
export const TECHNICAL_TEXT_PATTERNS = [
  /查看技术详情/u, /（第 \d+ 版）/u, /\bv\d{1,3}\b/u,
  /ordinary-production/u, /developer-live/u, /gpt-|claude-|deepseek-|gemini-/u,
  /[0-9a-f]{8,}/u, /主分支/u, /\d+\.\d{3}%/u,
] as const;

export function expectNoTechnicalText(root: { readonly textContent: string | null }): void {
  for (const pattern of TECHNICAL_TEXT_PATTERNS) expect(root.textContent ?? '').not.toMatch(pattern);
}
