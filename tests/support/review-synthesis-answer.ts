import type { ModelFixtureResponse } from '../../src/service/provider/model-fixture.js';

/** Authored for the admitted sample1 review cases; no live response or manuscript text is generated. */
export function sample1SynthesisAnswer(message: string): ModelFixtureResponse | undefined {
  let input: { schema?: string; evidence?: Array<{ ref: string }> };
  try { input = JSON.parse(message); } catch { return undefined; }
  if (input.schema !== 'ai7.review.run-synthesis-input/1') return undefined;
  const refs = (input.evidence ?? []).slice(0, 3).map((entry) => entry.ref);
  return { kind: 'unit-result', usage: { inputTokens: 900, outputTokens: 180 }, text: JSON.stringify({
    schema: 'ai7.review.run-synthesis-result/1',
    overallAssessment: '各章的发现应放回全书脉络逐条核对。建议先统一用字、数字与章题体例，再复核叙述表达和梦境与现场的衔接。',
    recurringProblems: refs.length === 0 ? [] : [{ title: '优先统一各章的编辑处理',
      explanation: '以下发现提供了核对入口；同类问题应采用一致的编辑尺度，具体修改仍须逐条判断。', evidenceRefs: refs, priority: '先处理必须核对的发现。' }],
    contextualExplanations: [], priorities: ['先核对用字与数字体例。', '再结合全书脉络处理表达与情节衔接。'],
  }) };
}
