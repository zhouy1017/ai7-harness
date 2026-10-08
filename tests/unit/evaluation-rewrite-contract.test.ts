import { describe, expect, it } from 'vitest';
import {
  EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
  EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
  buildEvaluationRewriteSynthesisMessage,
  buildEvaluationRewriteUnitMessage,
  evaluationRewriteContract,
  evaluationRewriteContractDigest,
  evaluationRewriteObservationSetDigest,
  evaluationRewriteRequestDigest,
  evaluationRewriteScoredItems,
  evaluationRewriteSynthesisRequestDigest,
  parseEvaluationRewriteSynthesis,
  parseEvaluationRewriteSynthesisMessageHeader,
  parseEvaluationRewriteUnitMessageHeader,
  parseEvaluationRewriteUnitResult,
  type EvaluationRewriteContractInput,
} from '../../src/service/evaluation/evaluation-rewrite-contract.js';
import { reduceEvaluationRewrite } from '../../src/service/evaluation/evaluation-rewrite-reducers.js';
import { contentWithRewrite, evaluationRewriteContractInput, evaluationRewriteRefusal, type RewritableEvaluation } from '../../src/service/evaluation-rewrites.js';
import type { CoverageManifestProjection, CoverageManifestUnitProjection, EvaluationContent } from '../../src/shared/protocol.js';

// Unit suite (L1) for the evaluation rewrite contract (Issue #429, plan slice S81b2; V2-UX-EVAL-008): the version frozen by its
// words, the unit and synthesis answers admitted whole or refused whole, no number ever read back, and the pure rules of
// `evaluation-rewrites.ts` — when a rewrite can be asked, what it reads, and what 采用 changes. Every word is the suite's own.

const INPUT: EvaluationRewriteContractInput = {
  profile: { title: '审稿评估方案', version: '1' },
  items: [
    { itemId: 'literary-quality', label: '文学品质与作者声音', fullMarks: 20, score: 16.5, notRated: null, comment: '细节生动。', ai7: { score: 16.5, comment: '细节生动。' }, adjustment: null },
    { itemId: 'structure-and-coherence', label: '结构、叙事逻辑与连贯', fullMarks: 20, score: 13, notRated: null, comment: '悬念清楚。', ai7: { score: 15.5, comment: '悬念清楚。' }, adjustment: { reasons: ['打分偏高'], note: null } },
    { itemId: 'readers-and-market', label: '读者与市场潜力', fullMarks: 20, score: null, notRated: '资料未齐。', comment: null, ai7: { score: 12, comment: '依据不足。' }, adjustment: { reasons: ['自行输入'], note: '先不评' } },
  ],
  strengths: ['悬念'],
  weaknesses: ['残句'],
  verdict: null,
};
const CONTRACT = evaluationRewriteContract(INPUT);
const DIGEST = 'a'.repeat(64);

const unitText = (observations: unknown[], unitOrdinal = 2): string => JSON.stringify({ schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal, observations });
const synthesis = (overrides: Record<string, unknown> = {}): string => JSON.stringify({
  schema: EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
  items: [
    { itemId: 'structure-and-coherence', comment: '悬念清楚，但中段照应不足。' },
    { itemId: 'literary-quality', comment: '细节生动，写景与写心相映。' },
  ],
  verdict: '总体较好，结构有待加强。',
  ...overrides,
});

function unit(ordinal: number, own: number, overlap: number): CoverageManifestUnitProjection {
  const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `blk_${prefix}${String(ordinal).padStart(2, '0')}${String(index).padStart(19, '0')}`);
  return {
    ordinal, sectionOrdinal: ordinal, headingText: null, subUnitIndex: 1, subUnitCount: 1,
    startPosition: ordinal * 10, endPosition: ordinal * 10 + own - 1, blockIds: ids('aaa', own), overlapBlockIds: ids('bbb', overlap),
    graphemes: 100, digest: String(ordinal).repeat(64).slice(0, 64),
  } as unknown as CoverageManifestUnitProjection;
}

describe('the frozen version', () => {
  it('freezes the version by its words, the editor\'s scores and reasons, and names only the scored items to the model', () => {
    expect(evaluationRewriteScoredItems(INPUT).map((item) => item.itemId)).toEqual(['literary-quality', 'structure-and-coherence']);
    expect(CONTRACT.systemPrompt).toContain('- 评分项【structure-and-coherence】「结构、叙事逻辑与连贯」（满分 20）：编辑的得分 13；现在的评语：悬念清楚。');
    expect(CONTRACT.systemPrompt).toContain('  AI7 初评 15.5 分；AI7 的评语：悬念清楚。');
    expect(CONTRACT.systemPrompt).toContain('  编辑调分的原因：打分偏高');
    expect(CONTRACT.systemPrompt).toContain('- 评分项【readers-and-market】「读者与市场潜力」（满分 20）：不评（资料未齐。）');
    expect(CONTRACT.systemPrompt).toContain('  编辑调分的原因：自行输入（先不评）');
    expect(CONTRACT.systemPrompt).toContain('- 总评：（尚未写）');
    expect(CONTRACT.systemPrompt).toContain('只为编辑已打分的评分项记依据：literary-quality（文学品质与作者声音）、structure-and-coherence（结构、叙事逻辑与连贯）。');
    expect(CONTRACT.synthesisInstruction).toContain('不改任何分数，也不在评语里写分数');
    expect(CONTRACT.synthesisInstruction).toContain('下列每个编辑已打分的评分项恰好一项：literary-quality、structure-and-coherence');
    // Another word is another contract; the same words are the same one.
    expect(evaluationRewriteContractDigest(evaluationRewriteContract({ ...INPUT }))).toBe(evaluationRewriteContractDigest(CONTRACT));
    expect(evaluationRewriteContractDigest(evaluationRewriteContract({ ...INPUT, verdict: '已写。' }))).not.toBe(evaluationRewriteContractDigest(CONTRACT));
    // A record line break reads as ／ inside the prompt.
    expect(evaluationRewriteContract({ ...INPUT, verdict: '第一行\n第二行' }).systemPrompt).toContain('- 总评：第一行／第二行');
  });

  it('refuses a version it could not have been asked of', () => {
    const refused = (input: unknown): string => {
      try {
        evaluationRewriteContract(input as EvaluationRewriteContractInput);
        return 'ok';
      } catch (error) {
        return (error as { code?: string }).code ?? String(error);
      }
    };
    const item = INPUT.items[1]!;
    expect(refused({ ...INPUT, items: INPUT.items.map((entry) => ({ ...entry, score: null })) })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, items: [{ ...item, notRated: '不评。' }] })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, items: [{ ...item, score: 20.5 }] })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, items: [{ ...item, score: 7.25 }] })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, items: [{ ...item, ai7: { score: Number.NaN, comment: null } }] })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, items: [{ ...item, adjustment: { reasons: [], note: null } }] })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, items: [item, item] })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, items: [{ ...item, itemId: 'Bad Id' }] })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, verdict: '响铃\u0007' })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, strengths: ['分隔 '] })).toBe('EVALUATION_REWRITE_INPUT_INVALID');
    expect(refused({ ...INPUT, items: [item] })).toBe('ok');
  });
});

describe('the unit result and the synthesis', () => {
  it('admits observations of scored items within the unit, and refuses the rest whole', () => {
    const expected = { unitOrdinal: 2, blockCount: 4, itemIds: ['literary-quality', 'structure-and-coherence'] };
    const ok = parseEvaluationRewriteUnitResult(unitText([{ itemId: 'structure-and-coherence', note: '中段照应不足。', blockOrdinals: [2, 4] }]), expected);
    expect(ok.ok && ok.result.observations).toEqual([{ itemId: 'structure-and-coherence', note: '中段照应不足。', blockOrdinals: [2, 4] }]);
    const code = (text: string): string => { const parsed = parseEvaluationRewriteUnitResult(text, expected); return parsed.ok ? 'ok' : parsed.code; };
    expect(code(unitText([{ itemId: 'readers-and-market', note: '无。', blockOrdinals: [1] }]))).toBe('item-unknown');
    expect(code(unitText([{ itemId: 'literary-quality', note: '无。', blockOrdinals: [5] }]))).toBe('block-out-of-unit');
    expect(code(unitText([], 3))).toBe('unit-mismatch');
    expect(code(unitText([{ itemId: 'literary-quality', note: '无。', blockOrdinals: [1, 1] }]))).toBe('schema-invalid');
    expect(code(unitText([{ itemId: 'literary-quality', note: '无。', blockOrdinals: [] }]))).toBe('schema-invalid');
    expect(code(unitText([{ itemId: 'literary-quality', note: '字'.repeat(201), blockOrdinals: [1] }]))).toBe('schema-invalid');
    expect(code(unitText([{ itemId: 'literary-quality', note: '无。', blockOrdinals: [1], score: 13 }]))).toBe('schema-invalid');
    expect(code(unitText(Array.from({ length: 31 }, () => ({ itemId: 'literary-quality', note: '无。', blockOrdinals: [1] }))))).toBe('schema-invalid');
    expect(code(JSON.stringify({ schema: 'ai7.evaluation.unit-result/1', unitOrdinal: 2, observations: [] }))).toBe('schema-invalid');
    expect(code('否')).toBe('not-json');
    expect(code(unitText([]))).toBe('ok');
  });

  it('admits one 评语 per scored item and the 总评, in the version\'s order, and never a number', () => {
    const ok = parseEvaluationRewriteSynthesis(synthesis(), INPUT);
    expect(ok.ok && ok.result).toEqual({
      schema: EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
      items: [
        { itemId: 'literary-quality', comment: '细节生动，写景与写心相映。' },
        { itemId: 'structure-and-coherence', comment: '悬念清楚，但中段照应不足。' },
      ],
      verdict: '总体较好，结构有待加强。',
    });
    const code = (overrides: Record<string, unknown>): string => { const parsed = parseEvaluationRewriteSynthesis(synthesis(overrides), INPUT); return parsed.ok ? 'ok' : parsed.code; };
    const items = (JSON.parse(synthesis()) as { items: Array<Record<string, unknown>> }).items;
    expect(code({ items: [...items, { itemId: 'readers-and-market', comment: '不评。' }] })).toBe('item-unknown');
    expect(code({ items: items.slice(1) })).toBe('items-incomplete');
    expect(code({ items: [...items, items[0]] })).toBe('items-incomplete');
    // A score handed back with a 评语, or beside the 总评, is no answer of this contract.
    expect(code({ items: items.map((item) => ({ ...item, score: 13 })) })).toBe('schema-invalid');
    expect(code({ scores: [] })).toBe('schema-invalid');
    expect(code({ items: items.map((item) => ({ ...item, comment: '字'.repeat(301) })) })).toBe('schema-invalid');
    expect(code({ items: items.map((item) => ({ ...item, comment: '两\n行' })) })).toBe('schema-invalid');
    expect(code({ verdict: '' })).toBe('schema-invalid');
    expect(code({ verdict: '字'.repeat(601) })).toBe('schema-invalid');
    expect(code({ verdict: '字'.repeat(600) })).toBe('ok');
    expect(code({ schema: 'ai7.evaluation-rewrite.synthesis-result/2' })).toBe('schema-invalid');
    expect(parseEvaluationRewriteSynthesis('否', INPUT)).toMatchObject({ ok: false, code: 'not-json' });
  });

  it('builds its two messages under headers of its own, keyed by the frozen contract and what they read', () => {
    const subject = unit(2, 2, 1);
    const blocks = new Map([...subject.overlapBlockIds, ...subject.blockIds].map((blockId, index) => [blockId, { blockId, kind: 'paragraph' as const, level: null, text: `第 ${index + 1} 段` }]));
    const message = buildEvaluationRewriteUnitMessage(CONTRACT, subject, 8, blocks);
    expect(message.split('\n')[0]).toBe(`评语重写单元 2/8 · 单元摘要 ${subject.digest}`);
    expect(parseEvaluationRewriteUnitMessageHeader(message)).toEqual({ ordinal: 2, total: 8, unitDigest: subject.digest });
    expect(parseEvaluationRewriteUnitMessageHeader(`评估单元 2/8 · 单元摘要 ${subject.digest}`)).toBeNull();
    expect(parseEvaluationRewriteUnitMessageHeader(`评语重写单元 9/8 · 单元摘要 ${subject.digest}`)).toBeNull();
    const closed = [
      { unitOrdinal: 2, result: { schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: 2, observations: [{ itemId: 'structure-and-coherence', note: '照应不足。', blockOrdinals: [1] }] } },
      { unitOrdinal: 1, result: { schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: 1, observations: [] } },
    ] as const;
    const synthesisMessage = buildEvaluationRewriteSynthesisMessage(CONTRACT, closed, 8);
    const lines = synthesisMessage.split('\n');
    expect(lines[0]).toBe(`评语重写综合 2/8 · 依据摘要 ${evaluationRewriteObservationSetDigest(closed)}`);
    expect(parseEvaluationRewriteSynthesisMessageHeader(synthesisMessage)).toEqual({ closed: 2, total: 8, setDigest: evaluationRewriteObservationSetDigest(closed) });
    expect(lines).toContain('【literary-quality】文学品质与作者声音 · 编辑的得分 16.5 / 20');
    expect(lines).toContain('【structure-and-coherence】结构、叙事逻辑与连贯 · 编辑的得分 13 / 20');
    expect(lines).toContain('- 单元 2：照应不足。（引用 1 个内容块）');
    expect(lines).toContain('- （各阅读范围都没有记下这一项的依据）');
    expect(synthesisMessage).not.toContain('readers-and-market】');
    // The set digest reads the units in order, whatever order they closed in.
    expect(evaluationRewriteObservationSetDigest([closed[1], closed[0]])).toBe(evaluationRewriteObservationSetDigest(closed));
    const contract = evaluationRewriteContractDigest(CONTRACT);
    expect(evaluationRewriteRequestDigest(contract, 2, subject.digest)).not.toBe(evaluationRewriteRequestDigest(contract, 3, subject.digest));
    expect(evaluationRewriteSynthesisRequestDigest(contract, DIGEST)).not.toBe(evaluationRewriteSynthesisRequestDigest(DIGEST, DIGEST));
    expect(() => evaluationRewriteRequestDigest('x', 2, subject.digest)).toThrow('ANALYSIS_REQUEST_DIGEST_INVALID');
    expect(() => evaluationRewriteSynthesisRequestDigest(contract, 'y')).toThrow('ANALYSIS_REQUEST_DIGEST_INVALID');
  });

  it('reduces to the synthesis\'s words or none, with every cited position resolved', () => {
    const first = unit(1, 3, 0);
    const manifest = { units: [first], totalBlocks: 3, sectionCount: 1, totalGraphemes: 100, digest: DIGEST } as unknown as CoverageManifestProjection;
    const outcomes = [{ unitOrdinal: 1, state: 'closed' as const, result: { schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: 1, observations: [
      { itemId: 'structure-and-coherence', note: '照应不足。', blockOrdinals: [2, 3] },
    ] } }];
    const parsed = parseEvaluationRewriteSynthesis(synthesis(), INPUT);
    const closed = reduceEvaluationRewrite({ manifest, outcomes, scoredItems: 2, synthesis: { state: 'closed', findings: [], requestDigest: DIGEST, usage: null, result: parsed.ok ? parsed.result : null } });
    expect(closed.rewrite.observations).toEqual([{ itemId: 'structure-and-coherence', unitOrdinal: 1, note: '照应不足。', blockIds: [first.blockIds[1], first.blockIds[2]] }]);
    expect(closed.rewrite.words).toEqual({ items: parsed.ok ? parsed.result.items : [], verdict: '总体较好，结构有待加强。' });
    expect(closed.reducerClosure.stages[2]).toEqual({ stage: 'book-synthesis', state: 'closed', inputCount: 3 });
    expect([closed.reducerClosure.state, closed.assurance.state]).toEqual(['closed', 'qualified']);
    const gap = reduceEvaluationRewrite({ manifest, outcomes, scoredItems: 2, synthesis: { state: 'gap', code: 'contract-invalid', reason: '不符合契约。', requestDigest: DIGEST } });
    expect(gap.rewrite).toMatchObject({ words: null, synthesis: { state: 'gap', reason: '不符合契约。' } });
    expect([gap.reducerClosure.label, gap.assurance.state]).toEqual(['归约/综合闭合：已闭合 · 全书综合没有重写评语', 'limited']);
    const notRun = reduceEvaluationRewrite({ manifest, outcomes: [], scoredItems: 2, synthesis: { state: 'not-run', reason: '没有读完的阅读范围。' } });
    expect(notRun.rewrite.synthesis).toEqual({ state: 'not-run', reason: '没有读完的阅读范围。' });
  });
});

describe('when a rewrite can be asked, what it reads, and what 采用 changes', () => {
  const content: EvaluationContent = {
    items: [
      { itemId: 'literary-quality', score: 16.5, notRated: null, comment: 'AI7 的评语。', adjustment: null },
      { itemId: 'structure-and-coherence', score: 13, notRated: null, comment: '编辑的评语。', adjustment: { reasons: ['too-high', 'own'], note: '中段' } },
      { itemId: 'readers-and-market', score: null, notRated: '资料未齐。', comment: null, adjustment: null },
    ],
    risks: [{ riskId: 'facts-and-sources', level: 'low', statement: '无。', reviewed: false }],
    readiness: ['补材料'],
    strengths: ['悬念'],
    weaknesses: ['残句'],
    verdict: '旧的总评。',
    conclusion: null,
  };
  const initial = {
    revisionId: 'r', ordinal: 1, revisionLabel: 'r1', createdAt: 'x', strengths: [], weaknesses: [], nextStep: null, suggestedConclusion: null,
    complete: true, unitsTotal: 8, unreadUnits: [], market: null, total: { score: 0, fullMarks: 100, notRated: 0, unscored: 0 },
    items: [
      { itemId: 'literary-quality', score: 16.5, comment: 'AI7 的评语。', sufficiency: 'sufficient' as const, citedBlocks: 3, unitsCited: 4, evidence: [] },
      { itemId: 'structure-and-coherence', score: 15.5, comment: 'AI7 说结构好。', sufficiency: 'fair' as const, citedBlocks: 1, unitsCited: 1, evidence: [] },
      { itemId: 'readers-and-market', score: 12, comment: null, sufficiency: 'insufficient' as const, citedBlocks: 0, unitsCited: 0, evidence: [] },
    ],
  };
  const profile = {
    profileId: 'p', title: '审稿评估方案', version: '1', issuer: 'AI7', total: 60, bands: [], risks: [], conclusions: [], sha256: DIGEST,
    items: [
      { itemId: 'literary-quality', label: '文学品质与作者声音', fullMarks: 20 },
      { itemId: 'structure-and-coherence', label: '结构、叙事逻辑与连贯', fullMarks: 20 },
      { itemId: 'readers-and-market', label: '读者与市场潜力', fullMarks: 20 },
    ],
  };
  const version: RewritableEvaluation = { recordId: 'v', bookId: 'b', ordinal: 3, state: 'editing', profile, content, entryOrdinal: 2, entrySha256: DIGEST, initial };

  it('is asked of a version begun from AI7\'s 初评 whose saved scores depart from it, and not otherwise', () => {
    expect(evaluationRewriteRefusal(version)).toBeNull();
    expect(evaluationRewriteRefusal({ ...version, state: 'finalized' })).toBe('第 3 版已经定稿：评语不再重写；要改就重新评估。');
    expect(evaluationRewriteRefusal({ ...version, initial: null })).toBe('这一版不是从 AI7 初评开始的：没有 AI7 的评语可以按你的评分重写。');
    const agreeing = { ...content, items: content.items.map((item, index) => ({ ...item, score: initial.items[index]!.score, notRated: null })) };
    expect(evaluationRewriteRefusal({ ...version, content: agreeing })).toBe('先把至少一项改成你的分数并保存：重写会让评语与你保存的分数一致。');
    // 不评 departs from AI7's score too; but with nothing scored there is no 评语 to rewrite.
    const allNotRated = { ...content, items: content.items.map((item) => ({ ...item, score: null, notRated: '不评。' })) };
    expect(evaluationRewriteRefusal({ ...version, content: allNotRated })).toBe('至少要给一项打分并保存，才有评语可以重写。');
    expect(evaluationRewriteRefusal({ ...version, state: 'draft' })).toBeNull();
  });

  it('reads the version\'s words with the reasons in the editor\'s words', () => {
    expect(evaluationRewriteContractInput(version)).toEqual({
      profile: { title: '审稿评估方案', version: '1' },
      items: [
        { itemId: 'literary-quality', label: '文学品质与作者声音', fullMarks: 20, score: 16.5, notRated: null, comment: 'AI7 的评语。', ai7: { score: 16.5, comment: 'AI7 的评语。' }, adjustment: null },
        { itemId: 'structure-and-coherence', label: '结构、叙事逻辑与连贯', fullMarks: 20, score: 13, notRated: null, comment: '编辑的评语。', ai7: { score: 15.5, comment: 'AI7 说结构好。' }, adjustment: { reasons: ['打分偏高', '自行输入'], note: '中段' } },
        { itemId: 'readers-and-market', label: '读者与市场潜力', fullMarks: 20, score: null, notRated: '资料未齐。', comment: null, ai7: { score: 12, comment: null }, adjustment: null },
      ],
      strengths: ['悬念'],
      weaknesses: ['残句'],
      verdict: '旧的总评。',
    });
    expect(() => evaluationRewriteContractInput({ ...version, initial: null })).toThrow();
  });

  it('takes the words into the scored items and the 总评 alone, every number and everything else as it was', () => {
    const taken = contentWithRewrite(content, {
      items: [{ itemId: 'literary-quality', comment: '新一。' }, { itemId: 'structure-and-coherence', comment: '新二。' }, { itemId: 'readers-and-market', comment: '不该写入。' }],
      verdict: '新的总评。',
    });
    expect(taken.items.map((item) => [item.itemId, item.score, item.notRated, item.comment, item.adjustment])).toEqual([
      ['literary-quality', 16.5, null, '新一。', null],
      ['structure-and-coherence', 13, null, '新二。', { reasons: ['too-high', 'own'], note: '中段' }],
      ['readers-and-market', null, '资料未齐。', null, null],
    ]);
    expect(taken.verdict).toBe('新的总评。');
    expect([taken.risks, taken.readiness, taken.strengths, taken.weaknesses, taken.conclusion]).toEqual([content.risks, content.readiness, content.strengths, content.weaknesses, content.conclusion]);
  });
});
