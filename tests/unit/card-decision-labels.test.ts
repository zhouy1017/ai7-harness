import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(fileURLToPath(new URL(`../../src/renderer/${path}`, import.meta.url)), 'utf8');

// ADR 0096 §3 (#1177): a 修改建议 card offers one decision system; the draft dispositions live only in the proposal workspace.
describe('one decision system on a 修改建议 card', () => {
  const card = source('editorial-marks.ts');
  const workspace = source('proposal-workspace.ts');

  it('offers exactly 接受并应用, 修改后接受, 拒绝 and 转为批注 on the card', () => {
    for (const action of ["'accept-and-apply', '接受并应用'", "'accept-with-edit', '修改后接受'", "'reject', '拒绝'", "convertOrExplain('annotation')"]) {
      expect(card).toContain(action);
    }
    expect(card).not.toContain('saveProposalDecisionDraft');
    expect(card).not.toMatch(/draft-\$\{|'拟采纳'|'拟拒绝'|拟采纳 · 草稿/u);
  });

  it('keeps 拟采纳, 拟拒绝 and 暂不决定 in the proposal workspace, where batches are prepared', () => {
    expect(workspace).toContain("{ accepted: '拟采纳', rejected: '拟拒绝', deferred: '暂不决定' }");
    expect(workspace).toContain('saveProposalDecisionDraft');
  });
});
