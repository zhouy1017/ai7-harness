import { describe, expect, it } from 'vitest';
import { emptyAnswerGapReason, unparsableAnswerGapReason } from '../../src/service/analysis/execution.js';

// The exact text an editor reads when a unit closes as a gap the model itself produced, asserted
// without a Run, a Provider, or a manuscript. Every answer passed in here is synthetic, and the only
// thing any reading says about one is how long it was.

describe('emptyAnswerGapReason', () => {
  it('says the model reasoned and lost the answer, and that repeating the unit usually works', () => {
    expect(emptyAnswerGapReason(true)).toBe(
      '模型完成了推理，但没有给出答案：答案通道为空，推理通道有内容。这不是稿件或契约的问题；重新分析本单元通常会得到结果。',
    );
  });

  it('says nothing came back at all, and where to look when it keeps happening', () => {
    expect(emptyAnswerGapReason(false)).toBe(
      '模型没有给出答案：答案通道与推理通道都为空。重新分析本单元可能有帮助；如反复出现，请检查模型服务状态。',
    );
  });

  it('reads an empty answer as an empty answer and never as output that failed to parse', () => {
    for (const reasoningPresent of [true, false]) {
      const reason = emptyAnswerGapReason(reasoningPresent);
      // The mislabel this replaces: an empty answer is not a model that produced something unparseable.
      expect(reason).not.toContain('不符合契约');
      expect(reason).not.toContain('JSON');
      // Both readings answer the two questions an editor can act on: what came back, and what to do.
      expect(reason).toContain('答案');
      expect(reason).toContain('重新分析本单元');
    }
    // Whether the model reasoned changes what an editor should conclude, so it changes the text.
    expect(emptyAnswerGapReason(true)).not.toBe(emptyAnswerGapReason(false));
  });
});

describe('unparsableAnswerGapReason', () => {
  it('names the contract code, keeps the parse detail, and adds how much text came back', () => {
    expect(unparsableAnswerGapReason('not-json', '模型输出不是 JSON。', '合成输出')).toBe(
      '单元结果不符合契约 v1（not-json）：模型输出不是 JSON。模型返回了 4 个字符，其中没有可解析的单元结果。重新分析本单元可能有帮助。',
    );
  });

  it('counts characters as code points, so one character counts once whichever plane it lives in', () => {
    // `.length` would call this two characters; an editor counting what came back would call it one.
    expect(unparsableAnswerGapReason('schema-invalid', '合成细节。', '\u{2000B}')).toContain('模型返回了 1 个字符');
    expect(unparsableAnswerGapReason('unit-mismatch', '合成细节。', '')).toContain('模型返回了 0 个字符');
    expect(unparsableAnswerGapReason('range-out-of-unit', '合成细节。', 'x'.repeat(1200))).toContain('模型返回了 1200 个字符');
  });

  it('measures the answer and never quotes any of it', () => {
    const answer = `合成模型输出：${'不该出现在缺口理由里的内容。'.repeat(20)}`;
    const reason = unparsableAnswerGapReason('not-json', '模型输出不是 JSON。', answer);
    // A count is safe to show an editor whatever the answer was made of; a sample never is.
    expect(reason).not.toContain('不该出现在缺口理由里的内容');
    expect(reason).toContain(`模型返回了 ${[...answer].length} 个字符`);
    expect(reason.length).toBeLessThan(answer.length);
  });
});
