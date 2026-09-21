import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { OUT_OF_SCOPE_GAP_REASON } from '../../src/service/analysis/reuse-plan.js';
import { REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, type ReviewUnitFinding } from '../../src/service/review/review-category-contract.js';
import { reduceReviewCategory, type ReviewUnitOutcome } from '../../src/service/review/review-category-reducers.js';

// A review category's reduction over a synthetic manifest (Issue #417): Reference Integrity anchors
// every finding in the block it named or excludes it with the reason, duplicates merge, identities are
// content-derived, and a unit the plan left out of scope is a gap the Run did not lose.

function block(position: number, kind: ManifestBlockInput['kind'], text: string): ManifestBlockInput {
  return {
    blockId: `blk_${createHash('sha256').update(`review-block-${position}`).digest('hex').slice(0, 24)}`,
    position,
    kind,
    level: kind === 'heading' ? 1 : null,
    text,
    digest: createHash('sha256').update(text).digest('hex'),
    graphemes: Array.from(text).length,
  };
}

// Two sections, so two units; every finding below names a block of the first, which has no overlap.
const blocks = [
  block(1, 'heading', '合成的第一节'),
  block(2, 'paragraph', '清晨的集市上人来人往，卖菜的老人把秤杆擦得锃亮。'),
  block(3, 'paragraph', '他说明天再来，明天却下起了雨。'),
  block(4, 'paragraph', '码头边停着三艘渔船，其中一艘刚刚刷过桐油。'),
  block(5, 'paragraph', '账本上写着 2024 年买进 3 艘船。'),
  block(6, 'heading', '合成的第二节'),
  block(7, 'paragraph', '傍晚的风从河面吹过来。'),
];
const byId = new Map(blocks.map((entry) => [entry.blockId, entry] as const));
const manifest = deriveCoverageManifest({
  bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(),
  revisionLabel: 'r1', revisionDigest: 'e'.repeat(64), blocks,
});

const located: ReviewUnitFinding = { quote: '人来人往', blockOrdinal: 2, severity: 'should', note: '合成的说明。', replacement: '熙熙攘攘', clauseId: 'typos-and-usage/1' };
const findings: ReviewUnitFinding[] = [
  located,
  { quote: '明天', blockOrdinal: 3, severity: 'note', note: '出现两次，锚点不唯一。', replacement: '次日' },
  { quote: '不在此处的文字', blockOrdinal: 4, severity: 'must', note: '块中没有这段文字。', replacement: '任意' },
  // The same words and the same replacement again: one finding, listing where else it was reported.
  { ...located, severity: 'must' },
  // The same words with another replacement: a second finding.
  { ...located, replacement: '摩肩接踵' },
  // Full-width digits fold onto the ASCII the block holds, and the replacement is exactly that text.
  { quote: '２０２４', blockOrdinal: 5, severity: 'note', note: '数字用法。', replacement: '2024' },
];

function reduce(categoryId = 'typos-and-usage', second: ReviewUnitOutcome = { unitOrdinal: 2, state: 'closed', result: { schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: 2, findings: [] } }) {
  return reduceReviewCategory({
    categoryId,
    manifest,
    blocks: byId,
    outcomes: [{ unitOrdinal: 1, state: 'closed', result: { schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: 1, findings } }, second],
  });
}

describe('a review category reduction', () => {
  it('reads two units over the two synthetic sections', () => {
    expect(manifest.units).toHaveLength(2);
    expect(manifest.units[0]!.overlapBlockIds).toEqual([]);
    expect(manifest.units[0]!.blockIds).toEqual(blocks.slice(0, 5).map((entry) => entry.blockId));
  });

  it('anchors every finding exactly or excludes it with its reason, and merges duplicates', () => {
    const reduction = reduce();
    expect(reduction.findings.map((finding) => [finding.quote, finding.replacement, finding.mergedFrom.length])).toEqual([
      ['人来人往', '熙熙攘攘', 1],
      ['人来人往', '摩肩接踵', 0],
    ]);
    const first = reduction.findings[0]!;
    expect(first.sourceRange).toEqual({ blockId: blocks[1]!.blockId, fromGrapheme: 6, toGrapheme: 10 });
    expect(Array.from(blocks[1]!.text).slice(first.sourceRange.fromGrapheme!, first.sourceRange.toGrapheme!).join('')).toBe('人来人往');
    expect(first.mergedFrom).toEqual([{ unitOrdinal: 1, blockOrdinal: 2, findingOrdinal: 4 }]);
    expect(reduction.excluded.map((excluded) => excluded.reason)).toEqual(['quote-ambiguous', 'quote-not-found', 'replacement-identical']);
    expect(reduction.findingCounts).toEqual({
      listed: 6,
      bySeverity: [{ severity: 'must', count: 2 }, { severity: 'should', count: 2 }, { severity: 'note', count: 2 }],
      located: 4,
      excluded: 3,
      merged: 1,
    });
    // An excluded finding holds no source range, and the assurance axis says some findings failed to anchor.
    expect(reduction.assurance.state).toBe('limited');
    expect(reduction.assurance.unresolvedItemCount).toBe(2);
  });

  it('mints the same identities for the same findings, and never shares one across categories', () => {
    const once = reduce().findings.map((finding) => finding.findingId);
    expect(once.every((id) => /^rfd_[0-9a-f]{24}$/u.test(id))).toBe(true);
    expect(reduce().findings.map((finding) => finding.findingId)).toEqual(once);
    const other = reduce('literary-expression').findings.map((finding) => finding.findingId);
    expect(other.some((id) => once.includes(id))).toBe(false);
  });

  it('counts a unit left out of scope as unreviewed, not as a unit the Run lost', () => {
    const reduction = reduce('typos-and-usage', { unitOrdinal: 2, state: 'gap', code: 'out-of-scope', reason: OUT_OF_SCOPE_GAP_REASON });
    expect(reduction.gaps).toEqual([expect.objectContaining({ unitOrdinal: 2, code: 'out-of-scope', reason: '不在本次审阅范围内' })]);
    expect(reduction.coverage.unitsOutOfScope).toBe(1);
    expect(reduction.coverage.label).toBe('覆盖：部分 · 1/2 单元 · 1 个单元不在本次审阅范围内');
    expect(reduction.reducerClosure.stages[0]).toEqual({ stage: 'unit-validation', state: 'closed', inputCount: 1 });
  });
});
