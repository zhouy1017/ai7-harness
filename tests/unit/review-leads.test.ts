import { describe, expect, it } from 'vitest';
import { reviewLeadBody, reviewLeadsOf } from '../../src/service/review/review-leads.js';
import type { AnalysisSectionProjection, AnalysisSynthesisProjection } from '../../src/shared/protocol.js';

// Unit suite for the model-free leads of 情节逻辑与前后一致 (Issue #417, REV-011). The revision is a
// hand-made shape with public synthetic text; no manuscript is involved.

const RANGE_A = { blockId: 'blk_aaaaaaaaaaaaaaaaaaaaaaaa', fromGrapheme: null, toGrapheme: null };
const RANGE_B = { blockId: 'blk_bbbbbbbbbbbbbbbbbbbbbbbb', fromGrapheme: 0, toGrapheme: 8 };
const RANGE_C = { blockId: 'blk_cccccccccccccccccccccccc', fromGrapheme: null, toGrapheme: null };

function section(unresolved: AnalysisSectionProjection['unresolved']): AnalysisSectionProjection {
  return {
    sectionOrdinal: 1, headingText: null, headingLevel: null, unitOrdinals: [1], closedUnitOrdinals: [1], gapUnitOrdinals: [], synopsis: '合成',
    entities: [], events: [], relationships: [], settingClaims: [], conflicts: [], unresolved,
  };
}

function synthesis(unresolved: AnalysisSynthesisProjection['unresolved']): AnalysisSynthesisProjection {
  return { synopsis: '合成', entities: [], events: [], relationships: [], settingClaims: [], conflicts: [], unresolved };
}

const REVISION = {
  revisionId: '11111111-1111-4111-8111-111111111111',
  conflicts: [
    { kind: 'alias-collision' as const, description: '甲与乙共用一个别名。', sourceRanges: [RANGE_A, RANGE_B], unitOrdinals: [1, 3] },
    { kind: 'unit-reported' as const, description: '单元内自报的冲突。', sourceRanges: [RANGE_C], unitOrdinals: [2] },
  ],
  crossUnitFindings: [
    {
      kind: 'chronology-conflict' as const,
      description: '两处时间先后不一致。',
      sides: [{ unitOrdinal: 3, sourceRanges: [RANGE_B] }, { unitOrdinal: 5, sourceRanges: [RANGE_C] }],
      unitOrdinals: [3, 5],
      confidence: 'medium' as const,
    },
  ],
  sections: [section([{ unitOrdinal: 1, description: '某事尚未交代。', sourceRanges: [RANGE_A] }])],
  // The synthesis restates the section's open question; it is one lead, not two.
  synthesis: synthesis([{ unitOrdinal: 1, description: '某事尚未交代。', sourceRanges: [RANGE_A] }]),
};

describe('the leads of 情节逻辑与前后一致', () => {
  it('takes the conflicts, the cross-unit findings and the open questions in that order, one lead per description and ranges', () => {
    const leads = reviewLeadsOf(REVISION);
    expect(leads.map((lead) => [lead.source, lead.kind, lead.kindLabel, lead.severity])).toEqual([
      ['conflict', 'alias-collision', '别名冲突', 'should'],
      ['conflict', 'unit-reported', '单元内报告', 'should'],
      ['cross-unit-finding', 'chronology-conflict', '时间线冲突', 'should'],
      ['unresolved', 'unresolved', '未决事项', 'note'],
    ]);
    // A cross-unit finding cites every side's ranges; its 批注 is anchored at the first.
    expect(leads[2]!.ranges).toEqual([RANGE_B, RANGE_C]);
  });

  it('mints stable identities from the revision, the kind, the description and the ranges', () => {
    const first = reviewLeadsOf(REVISION).map((lead) => lead.leadId);
    expect(reviewLeadsOf(REVISION).map((lead) => lead.leadId)).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
    expect(first.every((leadId) => /^lead_[0-9a-f]{24}$/u.test(leadId))).toBe(true);
    // The same lead read from another baseline revision is another lead.
    expect(reviewLeadsOf({ ...REVISION, revisionId: '22222222-2222-4222-8222-222222222222' })[0]!.leadId).not.toBe(first[0]);
  });

  it('says on the manuscript which kind of lead it is, then the analysis\'s own words', () => {
    expect(reviewLeadBody({ kindLabel: '时间线冲突', description: '两处时间先后不一致。' })).toBe('【线索 · 时间线冲突】两处时间先后不一致。');
  });
});
