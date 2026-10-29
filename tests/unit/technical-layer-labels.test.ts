import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { modelConnectionTestLabel } from '../../src/renderer/model-service-roles.js';
import { TECHNICAL_IDENTITY_PATTERN, bookChoiceWords, bookIdentityRows, proposalIdentityRows, proposalPreparationLine } from '../../src/renderer/technical-layer-labels.js';

// ADR 0096 §3 / ADR 0071 §1 (#1177): no Book, revision or decision identity, digest or raw receipt is printed inline on 书库 cards,
// in the proposal workspace, in reimport choices or in model settings; each stays one disclosure away. Synthetic identities only.
const source = (path: string): string => readFileSync(fileURLToPath(new URL(`../../src/renderer/${path}`, import.meta.url)), 'utf8');
const bookId = randomUUID();

describe('identifiers in the technical layer', () => {
  it('names an exact Book target by its words, and keeps its identity for the disclosure', () => {
    const words = [bookChoiceWords(`合成书名 · 图书 ID ${bookId}`, bookId), bookChoiceWords(`合成书名 · 内部编号 B-7 · 图书 ID ${bookId}`, bookId)];
    expect(words).toEqual(['合成书名', '合成书名 · 内部编号 B-7']);
    expect(words.some((line) => TECHNICAL_IDENTITY_PATTERN.test(line))).toBe(false);
    expect(bookIdentityRows({ bookId, stableIdentity: `book:${bookId}` })).toEqual([['图书 ID', bookId], ['稳定标识', `book:${bookId}`]]);
  });

  it('says what a proposal Apply writes without its branch, revision or decision, which stay behind 查看技术详情', () => {
    const line = proposalPreparationLine('合成书名', true, 2, 8);
    expect(line).toBe('合成书名 · 决定已记录 · 纳入 2 项 · 预计修订日志序号 8，写入一次新的受控稿件变更');
    expect(TECHNICAL_IDENTITY_PATTERN.test(line)).toBe(false);
    expect(proposalIdentityRows({ 分支: randomUUID(), 提案决定: null })).toHaveLength(1);
  });

  it('reads a connection test by the model\'s label, never its id or code', () => {
    const test = { modelId: 'deepseek-flash', credentialUpdatedAt: '2026-10-29T00:00:00.000Z', testedAt: '2026-10-29T00:00:00.000Z', verified: 'buffered-text-only' as const };
    expect(modelConnectionTestLabel({ ...test, outcome: 'passed', code: null }, 'DeepSeek V4.1 Flash')).toBe('文本连接测试通过 · DeepSeek V4.1 Flash');
    expect(modelConnectionTestLabel({ ...test, outcome: 'failed', code: 'MODEL_CONNECTION_TEST_UNAVAILABLE' })).toBe('文本连接测试未通过');
  });

  it('prints no identity inline where the four surfaces used to', () => {
    expect(source('proposal-workspace.ts')).not.toMatch(/稿件修订 \$\{|基准修订 \$\{|分支 \$\{|决定 \$\{preparedDecision/u);
    expect(source('index.ts')).not.toMatch(/图书 ID \$\{summary\.bookId\}/u);
    expect(source('import-review.ts')).not.toMatch(/确认来源版本 \$\{|目标图书 \$\{selectedChoice\.bookId\}|'technical-identity', (?:sourceVersionId|exactSourceVersionId)/u);
  });
});
