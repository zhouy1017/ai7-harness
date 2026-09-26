import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_HISTORY_NOTE,
  QUALITY_LEARNING_TABS,
  feedbackEntryLine,
  feedbackReasonLine,
  LEARNING_CHOICES,
  LEARNING_INFLUENCE,
  LEARNING_SERIES_UNAVAILABLE,
  LEARNING_STATE_LABELS,
  learningBookHeading,
  learningChoiceConsequence,
  learningDecisionLine,
  learningOriginLine,
  learningPeopleLine,
} from '../../src/renderer/quality-learning-labels.js';
import {
  LEARNING_ELIGIBILITY_BASIS,
  analysisFeedbackCandidate,
  learningMaterialDigest,
  proposalDecisionCandidate,
  reviewDispositionCandidate,
} from '../../src/service/learning-eligibility.js';

// Unit suite for 质量与学习 › 学习准入 (Issue #61, plan slice S26b; V2-UX-LEARN-001 to LEARN-012, FDBK-013): the choices in
// their order with none implied, each choice's consequence, the card's lines, and the candidates the service identifies from
// the editor's own records — their excerpts, their rationales, and a digest that moves with what the material says and with
// nothing else. Every text is the suite's own.

const instant = (iso: string): string => `〔${iso.slice(0, 10)}〕`;

describe('学习准入 words', () => {
  it('offers the choices in their fixed order, Book first, with what each would mean', () => {
    expect(LEARNING_CHOICES.map((entry) => [entry.choice, entry.label])).toEqual([
      ['book', '仅纳入当前图书'], ['house', '纳入出版社经验'], ['excluded', '明确排除'], ['deferred', '稍后决定'],
    ]);
    expect(LEARNING_CHOICES.map((entry) => learningChoiceConsequence(entry.choice, '样书'))).toEqual([
      '仅纳入当前图书：它只在《样书》里帮 AI7 学习。',
      '纳入出版社经验：全社以后的图书都可能从它学习。',
      '明确排除：它不会用来学习；它来自的反馈与改动仍原样保留。',
      '稍后决定：它仍然待定，不算纳入，也不算排除。',
    ]);
    expect(LEARNING_SERIES_UNAVAILABLE).toBe('还没有书系：书系接通后，才能把材料纳入书系。');
    // What a decision does not do, said on every card (LEARN-009, LEARN-010).
    for (const words of ['不会改动稿件', '不会自动生效为规则', '不会启用记忆', '不会被发送出去']) expect(LEARNING_INFLUENCE).toContain(words);
    expect(LEARNING_ELIGIBILITY_BASIS).toContain('仅建议');
  });

  it('names a Book with its people, a material with its origin, and the decision it has', () => {
    // The Book's materials in all, whichever page shows them.
    expect(learningBookHeading({ title: '样书', materialCount: 2 })).toBe('《样书》 · 2 条');
    // The Book's count in all, whichever page shows its materials (Issue #61 review).
    expect(learningBookHeading({ title: '样书', materialCount: 45 })).toBe('《样书》 · 45 条');
    expect(learningPeopleLine({ authors: [], editors: [] })).toBe('作者与责编：尚未填写');
    expect(learningPeopleLine({ authors: ['周一', '吴二'], editors: [] })).toBe('作者：周一、吴二 · 责编：尚未填写');
    expect(learningPeopleLine({ authors: ['周一'], editors: ['郑三'] })).toBe('作者：周一 · 责编：郑三');
    expect(learningOriginLine({ originLabel: '修改建议 · 拒绝', recordedAt: '2026-09-25T06:00:00.000Z' }, instant)).toBe('修改建议 · 拒绝 · 记录于 〔2026-09-25〕');
    expect(learningDecisionLine({ decision: null }, instant)).toBe('还没有决定。');
    expect(learningDecisionLine({ decision: { choice: 'house', note: null, decidedAt: '2026-09-25T06:00:00.000Z' } }, instant)).toBe('纳入出版社经验 · 〔2026-09-25〕');
    expect(learningDecisionLine({ decision: { choice: 'book', note: '只在这本书里参考', decidedAt: '2026-09-25T06:00:00.000Z' } }, instant))
      .toBe('仅纳入当前图书 · 〔2026-09-25〕 · 只在这本书里参考');
    expect(LEARNING_STATE_LABELS).toEqual({ pending: '待定', changed: '改过 · 需要重新决定', deferred: '稍后决定', decided: '已决定' });
  });
});

describe('反馈记录 words (Issue #61, S26c)', () => {
  it('opens at the history, says what it is not, and reads each entry by origin, dimension, verdict and reason', () => {
    expect(QUALITY_LEARNING_TABS.map((entry) => [entry.tab, entry.label])).toEqual([['feedback', '反馈记录'], ['learning', '学习准入']]);
    expect(FEEDBACK_HISTORY_NOTE).toBe('这里只是记录你给过的反馈：不会催你补充原因，也不会把没有说明当作认可。');
    expect(feedbackEntryLine({ origin: 'proposal-decision', dimension: null, signal: '拒绝' })).toBe('修改建议 · 拒绝');
    expect(feedbackEntryLine({ origin: 'analysis-feedback', dimension: '全书梗概', signal: '不完整' })).toBe('分析反馈 · 全书梗概 · 不完整');
    expect(feedbackEntryLine({ origin: 'review-disposition', dimension: '错别字与规范用语', signal: '忽略' })).toBe('审阅 · 错别字与规范用语 · 忽略');
    // Neither 不说明 nor silence is read as more than that (FDBK-007).
    expect(feedbackReasonLine({ reason: '证据不足', reasonState: 'given' })).toBe('原因：证据不足');
    expect(feedbackReasonLine({ reason: null, reasonState: 'dismissed' })).toBe('选择了不说明原因');
    expect(feedbackReasonLine({ reason: null, reasonState: 'none' })).toBe('没有说明原因');
  });
});

describe('学习准入 candidates', () => {
  const decision = {
    decisionId: '00000000-0000-4000-8000-000000000001', disposition: 'rejected', currentText: '原来的说法', proposedText: '建议的说法',
    editedText: null, reason: '证据不足', reasonSource: 'suggested', recordedAt: '2026-09-25T06:00:00.000Z', decidedAt: '2026-09-25T05:00:00.000Z',
  } as const;

  it('reads a decided 修改建议 as what was suggested, what the editor did, and why', () => {
    const reasoned = proposalDecisionCandidate(decision, true);
    expect([reasoned.materialKey, reasoned.kind, reasoned.originLabel, reasoned.excerpt]).toEqual([
      `proposal-decision:${decision.decisionId}`, 'proposal-decision', '修改建议 · 拒绝', ['原文：原来的说法', '建议：建议的说法', '你的原因：证据不足'],
    ]);
    const edited = proposalDecisionCandidate({ ...decision, disposition: 'accepted-with-edit', proposedText: '', editedText: '编辑自己的说法', reason: null, reasonSource: null }, true);
    expect([edited.originLabel, edited.excerpt, edited.rationale]).toEqual([
      '修改建议 · 修改后接受', ['原文：原来的说法', '建议：（删去）', '你改为：编辑自己的说法'], '你改写了建议的文字：这处改动可以帮 AI7 以后的建议更接近你的写法。',
    ]);
    // An excerpt is bounded, and asked for only when a card will show it.
    expect(proposalDecisionCandidate({ ...decision, currentText: '字'.repeat(80) }, true).excerpt[0]).toBe(`原文：${'字'.repeat(60)}…`);
    expect(proposalDecisionCandidate(decision, false).excerpt).toEqual([]);
  });

  it('reads an analysis judgment by the alternative’s own words, the editor’s, and their correction', () => {
    const signal = {
      signalId: '00000000-0000-4000-8000-000000000002', revisionId: '00000000-0000-4000-8000-000000000003', itemKey: 'entities/0',
      dimension: 'entities', judgment: 'inaccurate', reason: { choice: 'merged', text: null }, correction: '应分作两个人物', recordedAt: '2026-09-25T06:00:00.000Z',
    } as const;
    const judged = analysisFeedbackCandidate(signal, '某人物');
    expect([judged.materialKey, judged.originLabel, judged.excerpt]).toEqual([
      `analysis-feedback:${signal.revisionId}/entities/0`, '分析反馈 · 人物与名称', ['人物与名称：某人物', '你的判断：不准确 · 把不同人物当成一个', '你的修正：应分作两个人物'],
    ]);
    expect(analysisFeedbackCandidate({ ...signal, itemKey: 'synopsis', dimension: 'synopsis', judgment: 'incomplete', reason: { choice: 'other', text: '少了尾声' }, correction: null }, '梗概')
      .excerpt).toEqual(['全书梗概：梗概', '你的判断：不完整 · 少了尾声']);
    expect(analysisFeedbackCandidate(signal, null).excerpt).toEqual([]);
  });

  it('reads an ignored 审阅 finding by its category and the editor’s reason', () => {
    const ignored = reviewDispositionCandidate({
      signalId: 's', reviewRunId: '00000000-0000-4000-8000-000000000004', findingId: 'f1', categoryLabel: '错别字与规范用语', reason: '作者特意这样写', recordedAt: '2026-09-25T06:00:00.000Z',
    }, true);
    expect([ignored.materialKey, ignored.originLabel, ignored.excerpt]).toEqual([
      'review-disposition:00000000-0000-4000-8000-000000000004/f1', '审阅 · 错别字与规范用语', ['你忽略了这条发现 · 原因：作者特意这样写'],
    ]);
  });

  it('digests exactly what a material says: a changed reason moves it, how it is shown does not', () => {
    const digest = learningMaterialDigest(proposalDecisionCandidate(decision, true));
    expect(learningMaterialDigest(proposalDecisionCandidate(decision, false))).toBe(digest);
    expect(learningMaterialDigest(proposalDecisionCandidate({ ...decision, recordedAt: '2026-09-26T06:00:00.000Z' }, true))).toBe(digest);
    expect(learningMaterialDigest(proposalDecisionCandidate({ ...decision, reason: '方向不合适' }, true))).not.toBe(digest);
    expect(learningMaterialDigest(proposalDecisionCandidate({ ...decision, reasonSource: 'free-text' }, true))).not.toBe(digest);
  });
});
