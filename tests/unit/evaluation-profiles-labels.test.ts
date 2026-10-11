import { describe, expect, it } from 'vitest';
import { builtinEvaluationProfile } from '../../src/service/evaluation-profiles.js';
import { PROFILE_CALIBRATION, PROFILE_ITEM_COUNT, PROFILE_PROSPECTIVE, profileEditInput, profileFullMarks } from '../../src/renderer/evaluation-profiles.js';
import { evaluationComparisonLines } from '../../src/renderer/evaluation-labels.js';

describe('the house profile editing surface', () => {
  it('starts edits from exact identities and descriptions, admits only the Commander-approved integer splits, and explains prospective calibration', () => {
    const profile = { ...builtinEvaluationProfile(), readiness: ['完成事实复核。'], items: builtinEvaluationProfile().items.map((item) => ({ ...item, description: '本社说明。' })) };
    const draft = profileEditInput(profile);
    expect(draft).toMatchObject({ expectedSha256: profile.sha256, readiness: ['完成事实复核。'], items: profile.items.map((item) => ({ itemId: item.itemId, label: item.label, description: item.description })) });
    expect(draft).not.toHaveProperty('risks');
    expect(draft).not.toHaveProperty('bands');
    expect([1, 2, 4, 5, 10].map(profileFullMarks)).toEqual([100, 50, 25, 20, 10]);
    expect([0, 3, 6, 8, 16].map(profileFullMarks)).toEqual([null, null, null, null, null]);
    expect(PROFILE_ITEM_COUNT).toBe('评分项数需要能把 100 分平均分成整数：1、2、4、5 或 10 项。');
    expect(PROFILE_PROSPECTIVE).toBe('新版本只用于之后准备的初评和新建的评估，已有记录保留当时的方案。');
    expect(PROFILE_CALIBRATION).toContain('改名或修改说明保留该项的校准依据');
    expect(PROFILE_CALIBRATION).toContain('新增的项等待自己的调分依据');
  });

  it('names additions and removed items with the historical label even when both scores are absent', () => {
    const total = { score: 0, fullMarks: 100, notRated: 0, unscored: 5 };
    const lines = evaluationComparisonLines(builtinEvaluationProfile(), { previousOrdinal: 1,
      items: [{ itemId: 'old-item', label: '原来的项', change: 'removed', previous: 10, current: null }, { itemId: 'new-item', label: '新的项', change: 'added', previous: null, current: null }],
      risks: [], total: { previous: total, current: total }, conclusion: { previous: null, current: null } }).lines;
    expect(lines).toContain('原来的项：已移除（原得分 10）');
    expect(lines).toContain('新的项：新增评分项');
  });
});
