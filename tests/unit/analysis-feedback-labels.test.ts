import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_FEEDBACK_METRIC_NOTE,
  analysisFeedbackItemName,
  analysisFeedbackLine,
  analysisFeedbackReasonChoices,
  analysisFeedbackRevisionLine,
  analysisFeedbackToggleName,
  analysisQualityMetricLines,
} from '../../src/renderer/analysis-feedback-labels.js';
import {
  ANALYSIS_FEEDBACK_DIMENSIONS,
  ANALYSIS_FEEDBACK_OTHER,
  ANALYSIS_FEEDBACK_REASONS,
  analysisFeedbackReasonOffered,
} from '../../src/shared/analysis-feedback.js';
import type { AnalysisFeedbackSignalProjection, AnalysisQualityMetricProjection } from '../../src/shared/protocol.js';

// Unit suite for ②A 分析反馈's vocabulary and words (Issue #94, plan slice S38; V2-UX-ANALYSIS-023, ANALYSIS-024, FDBK-005 to
// FDBK-008): two or three reasons fitted to each fault of each kind of item with 其他 beside them and none for 准确, a recorded
// judgment as it reads afterwards, and the Book's metric, which counts only what was judged and says what it is not.

const instant = (iso: string): string => `〔${iso.slice(0, 10)}〕`;
const signal = (patch: Partial<AnalysisFeedbackSignalProjection>): AnalysisFeedbackSignalProjection => ({
  signalId: '00000000-0000-4000-8000-000000000001', judgment: 'accurate', reason: null, correction: null, recordedAt: '2026-09-25T08:00:00.000Z', supersedes: null, ...patch,
});

describe('分析反馈 reasons', () => {
  it('offers two or three alternatives fitted to each fault of each kind of item, 其他 last, and none for 准确', () => {
    for (const dimension of ANALYSIS_FEEDBACK_DIMENSIONS) {
      expect(analysisFeedbackReasonChoices(dimension, 'accurate')).toEqual([]);
      for (const judgment of ['inaccurate', 'incomplete'] as const) {
        const offered = ANALYSIS_FEEDBACK_REASONS[dimension][judgment];
        expect(offered.length).toBeGreaterThanOrEqual(2);
        expect(offered.length).toBeLessThanOrEqual(3);
        const choices = analysisFeedbackReasonChoices(dimension, judgment);
        expect(choices.slice(0, -1)).toEqual(offered);
        expect(choices.at(-1)).toEqual({ choice: ANALYSIS_FEEDBACK_OTHER, label: '其他 / 自行输入' });
        // Each alternative is one the store accepts for exactly this judgment, and no label is AI7's guess.
        for (const entry of choices) {
          expect(analysisFeedbackReasonOffered(dimension, judgment, entry.choice)).toBe(true);
          expect(entry.label).not.toContain('AI7');
        }
        expect(new Set(choices.map((entry) => entry.choice)).size).toBe(choices.length);
      }
      expect(analysisFeedbackReasonOffered(dimension, 'accurate', ANALYSIS_FEEDBACK_OTHER)).toBe(false);
    }
    // A reason fitted to one fault is not offered for the other.
    expect(analysisFeedbackReasonOffered('entities', 'incomplete', 'misnamed')).toBe(false);
    expect(analysisFeedbackReasonOffered('synopsis', 'inaccurate', 'ending-missing')).toBe(false);
  });
});

describe('分析反馈 words', () => {
  it('names an item by its list and place, and each toggle with the item it judges', () => {
    expect(analysisFeedbackItemName('synopsis', 0)).toBe('全书梗概');
    expect(analysisFeedbackItemName('entities', 0)).toBe('人物与名称 第 1 条');
    expect(analysisFeedbackItemName('settings', 11)).toBe('设定 第 12 条');
    expect(analysisFeedbackToggleName(false, '事件 第 2 条')).toBe('反馈：事件 第 2 条');
    expect(analysisFeedbackToggleName(true, '全书梗概')).toBe('改反馈：全书梗概');
  });

  it('reads a recorded judgment with its reason, the editor’s own words and correction, and when', () => {
    expect(analysisFeedbackLine('entities', signal({}), instant)).toBe('你的反馈：准确 · 〔2026-09-25〕');
    expect(analysisFeedbackLine('entities', signal({ judgment: 'inaccurate', reason: { choice: 'merged', text: null }, correction: '甲和乙是两个人' }), instant))
      .toBe('你的反馈：不准确 · 把不同人物当成一个 · 修正：甲和乙是两个人 · 〔2026-09-25〕');
    expect(analysisFeedbackLine('events', signal({ judgment: 'incomplete', reason: { choice: ANALYSIS_FEEDBACK_OTHER, text: '少了第二次会面' } }), instant))
      .toBe('你的反馈：不完整 · 少了第二次会面 · 〔2026-09-25〕');
    expect(analysisFeedbackLine('synopsis', signal({ judgment: 'incomplete', reason: null, correction: '结尾没有概括' }), instant))
      .toBe('你的反馈：不完整 · 修正：结尾没有概括 · 〔2026-09-25〕');
  });

  it('counts only what was judged, by dimension, and says nothing was judged rather than implying approval', () => {
    const empty: AnalysisQualityMetricProjection = {
      definition: 'ai7.analysis-quality-metric/1', scope: 'book', judged: 0, accurate: 0, inaccurate: 0, incomplete: 0,
      byDimension: ANALYSIS_FEEDBACK_DIMENSIONS.map((dimension) => ({ dimension, judged: 0, accurate: 0, inaccurate: 0, incomplete: 0 })),
      lineageDigest: '0'.repeat(64),
    };
    expect(analysisQualityMetricLines(empty)).toEqual({ total: '还没有给出判断。', dimensions: [] });
    const judged: AnalysisQualityMetricProjection = {
      ...empty, judged: 3, accurate: 1, inaccurate: 1, incomplete: 1,
      byDimension: empty.byDimension.map((entry) => entry.dimension === 'entities' ? { ...entry, judged: 2, accurate: 1, inaccurate: 1 }
        : entry.dimension === 'synopsis' ? { ...entry, judged: 1, incomplete: 1 } : entry),
    };
    expect(analysisQualityMetricLines(judged)).toEqual({
      total: '这本书判断了 3 条：准确 1、不准确 1、不完整 1',
      dimensions: ['全书梗概：1 条，准确 0、不准确 0、不完整 1', '人物与名称：2 条，准确 1、不准确 1、不完整 0'],
    });
    // What the metric is not, said beside it: silence is no approval, and a judgment is neither a fact check nor a change.
    expect(ANALYSIS_FEEDBACK_METRIC_NOTE).toContain('没有判断的条目不算认可');
    expect(ANALYSIS_FEEDBACK_METRIC_NOTE).toContain('不代表事实核实');
    expect(analysisFeedbackRevisionLine({
      revisionOrdinal: 2, revisionId: '00000000-0000-4000-8000-000000000002',
      items: [
        { itemKey: 'synopsis', dimension: 'synopsis', index: 0, digest: 'a'.repeat(64), latest: signal({}), signals: 2 },
        { itemKey: 'entities/0', dimension: 'entities', index: 0, digest: 'b'.repeat(64), latest: null, signals: 0 },
      ],
    })).toBe('Revision 2 · 00000000-0000-4000-8000-000000000002 · 已判断 1 条');
  });
});
