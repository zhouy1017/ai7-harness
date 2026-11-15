import type { ReviewSynthesisProjection } from '../../src/shared/protocol.js';

/** Evidence quotation from the admitted sample1 authored review fixture. */
export const SAMPLE1_SYNTHESIS: ReviewSynthesisProjection = {
  state: 'completed', detail: '已形成全书审阅统合总结。', missingCategories: [], omissionLabel: null,
  summary: { overallAssessment: '先统一用字与数字体例。', recurringProblems: [{ title: '数字体例', explanation: '请统一数字中的零字写法。', evidenceRefs: ['e1'], priority: '优先核对。' }],
    contextualExplanations: [], priorities: ['先核对数字体例。'] },
  evidence: [{ ref: 'e1', findingId: 'rvf_111111111111111111111111', blockId: 'blk_222222222222222222222222',
    chapterLabel: '第一章', quote: '一九九○年代', status: 'pending' }],
};
