import { describe, expect, it } from 'vitest';
import {
  INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
  INITIAL_EVALUATION_UNIT_RESULT_SCHEMA,
  buildInitialEvaluationSynthesisMessage,
  buildInitialEvaluationUnitMessage,
  initialEvaluationContract,
  initialEvaluationContractDigest,
  initialEvaluationObservationSetDigest,
  initialEvaluationRequestDigest,
  initialEvaluationSynthesisRequestDigest,
  parseInitialEvaluationSynthesis,
  parseInitialEvaluationSynthesisMessageHeader,
  parseInitialEvaluationUnitMessageHeader,
  parseInitialEvaluationUnitResult,
  type InitialEvaluationUnitResult,
} from '../../src/service/evaluation/initial-evaluation-contract.js';
import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { reduceInitialEvaluation } from '../../src/service/evaluation/initial-evaluation-reducers.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { SUFFICIENT_MIN_CITED_BLOCKS, evaluationItemAdjusted, evaluationSufficiency } from '../../src/shared/evaluation-scoring.js';
import type { CoverageManifestProjection, CoverageManifestUnitProjection } from '../../src/shared/protocol.js';

// Unit suite for Evaluation Contract v1 (Issue #429, plan slice S81b1; V2-UX-EVAL-005 to EVAL-007): the unit and synthesis
// parsers refuse what the profile does not name and what the scale cannot score, the messages carry their identity in their
// headers, the digests separate the two steps, the reducer counts 依据充分度 and never scores on its own, and the shared rules
// say plainly when evidence suffices and when the editor adjusted AI7.

const PROFILE = { ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) };
const CONTRACT = initialEvaluationContract(PROFILE);
const ITEM_IDS = PROFILE.items.map((item) => item.itemId);
const DIGEST = 'a'.repeat(64);

const unitText = (value: unknown): string => JSON.stringify(value);
const unitResult = (observations: unknown[], unitOrdinal = 2): string =>
  unitText({ schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal, observations });
const synthesis = (overrides: Record<string, unknown> = {}): string => JSON.stringify({
  schema: INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
  items: [
    { itemId: 'readers-and-market', score: 12, comment: '依据不足。' },
    { itemId: 'literary-quality', score: 16.5, comment: '细节生动。' },
    { itemId: 'theme-and-context', score: 15, comment: '主题鲜明。' },
    { itemId: 'structure-and-coherence', score: 15.5, comment: '悬念清楚。' },
    { itemId: 'chinese-language', score: 14, comment: '个别残句。' },
  ],
  strengths: ['悬念'],
  weaknesses: ['残句'],
  nextStep: '先校改残句。',
  suggestedConclusion: 'revise',
  market: {
    readers: ['文史爱好者。'],
    sellingPoints: ['甲骨文悬念。'],
    channels: ['读书会。'],
    marketReturn: null,
    awards: { statement: '有参评潜力，确定性低。', basis: '主题与语言。' },
  },
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

describe('the unit contract', () => {
  it('admits observations of the profile\'s items that cite blocks of the unit, and refuses everything else whole', () => {
    const expected = { unitOrdinal: 2, blockCount: 4, itemIds: ITEM_IDS };
    const ok = parseInitialEvaluationUnitResult(unitResult([{ itemId: 'literary-quality', note: '写景与写心相互映照。', blockOrdinals: [1, 4] }]), expected);
    expect(ok.ok && ok.result.observations).toEqual([{ itemId: 'literary-quality', note: '写景与写心相互映照。', blockOrdinals: [1, 4] }]);
    expect(parseInitialEvaluationUnitResult(`\`\`\`json\n${unitResult([])}\n\`\`\``, expected).ok).toBe(true);
    const code = (text: string): string => { const parsed = parseInitialEvaluationUnitResult(text, expected); return parsed.ok ? 'ok' : parsed.code; };
    expect(code('不是 JSON')).toBe('not-json');
    expect(code(unitResult([{ itemId: 'market-forecast', note: '说明。', blockOrdinals: [1] }]))).toBe('item-unknown');
    expect(code(unitResult([{ itemId: 'literary-quality', note: '说明。', blockOrdinals: [5] }]))).toBe('block-out-of-unit');
    expect(code(unitResult([], 3))).toBe('unit-mismatch');
    for (const observation of [
      { itemId: 'literary-quality', note: '说明。', blockOrdinals: [] },
      { itemId: 'literary-quality', note: '说明。', blockOrdinals: [1, 1] },
      { itemId: 'literary-quality', note: '说明。', blockOrdinals: [0] },
      { itemId: 'literary-quality', note: '说明。', blockOrdinals: [1, 2, 3, 4, 1.5] },
      { itemId: 'literary-quality', note: '', blockOrdinals: [1] },
      { itemId: 'literary-quality', note: '一行\n两行', blockOrdinals: [1] },
      { itemId: 'literary-quality', note: '字'.repeat(201), blockOrdinals: [1] },
      { itemId: 'literary-quality', note: '说明。', blockOrdinals: [1], score: 18 },
    ]) {
      expect(code(unitResult([observation])), JSON.stringify(observation)).toBe('schema-invalid');
    }
    expect(code(unitText({ schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: 2, observations: [], extra: 1 }))).toBe('schema-invalid');
    expect(code(unitText({ schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: 2, observations: [] }))).toBe('schema-invalid');
    expect(code(unitResult(Array.from({ length: 41 }, () => ({ itemId: 'literary-quality', note: '说明。', blockOrdinals: [1] }))))).toBe('schema-invalid');
  });

  it('builds a message whose header names the unit and is no other contract\'s', () => {
    const subject = unit(2, 2, 1);
    const blocks = new Map([...subject.overlapBlockIds, ...subject.blockIds].map((blockId, index) => [blockId, { blockId, kind: 'paragraph' as const, level: null, text: `第 ${index + 1} 段 $&` }]));
    const message = buildInitialEvaluationUnitMessage(CONTRACT, subject, 8, blocks);
    expect(message.split('\n')[0]).toBe(`评估单元 2/8 · 单元摘要 ${subject.digest}`);
    expect(parseInitialEvaluationUnitMessageHeader(message)).toEqual({ ordinal: 2, total: 8, unitDigest: subject.digest });
    expect(message).toContain('第 3 段 $&');
    expect(message.indexOf(CONTRACT.overlapHeader)).toBeLessThan(message.indexOf(CONTRACT.ownHeader));
    expect(parseInitialEvaluationUnitMessageHeader(`审阅单元 2/8 · 类别 typos · 单元摘要 ${subject.digest}`)).toBeNull();
    expect(parseInitialEvaluationUnitMessageHeader(`评估单元 9/8 · 单元摘要 ${subject.digest}`)).toBeNull();
    expect(CONTRACT.systemPrompt).toContain('[readers-and-market] 读者与市场潜力（满分 20）');
  });
});

describe('the book-level synthesis', () => {
  it('admits one score per item in whole or half points within its 满分, in the profile\'s order, and refuses the rest whole', () => {
    const ok = parseInitialEvaluationSynthesis(synthesis(), PROFILE);
    expect(ok.ok && ok.result.items.map((item) => [item.itemId, item.score])).toEqual([
      ['literary-quality', 16.5], ['theme-and-context', 15], ['structure-and-coherence', 15.5], ['chinese-language', 14], ['readers-and-market', 12],
    ]);
    const code = (overrides: Record<string, unknown>): string => { const parsed = parseInitialEvaluationSynthesis(synthesis(overrides), PROFILE); return parsed.ok ? 'ok' : parsed.code; };
    const items = (change: (items: Array<Record<string, unknown>>) => unknown[]): Record<string, unknown> =>
      ({ items: change((JSON.parse(synthesis()) as { items: Array<Record<string, unknown>> }).items) });
    expect(code(items((list) => [...list, { itemId: 'market-forecast', score: 3, comment: '无。' }]))).toBe('item-unknown');
    expect(code(items((list) => list.slice(1)))).toBe('items-incomplete');
    expect(code(items((list) => [...list, list[0]]))).toBe('items-incomplete');
    for (const score of [20.5, -0.5, 7.25, '15', null, Number.NaN]) {
      expect(code(items((list) => list.map((item, index) => (index === 1 ? { ...item, score } : item)))), String(score)).toBe(Number.isNaN(score) || score === null ? 'score-invalid' : 'score-invalid');
    }
    expect(code(items((list) => list.map((item, index) => (index === 1 ? { ...item, score: 20 } : item))))).toBe('ok');
    expect(code(items((list) => list.map((item, index) => (index === 1 ? { ...item, score: 0 } : item))))).toBe('ok');
    expect(code({ suggestedConclusion: 'publish' })).toBe('schema-invalid');
    expect(code({ suggestedConclusion: null, nextStep: null })).toBe('ok');
    expect(code({ strengths: ['一', '二', '三', '四', '五', '六'] })).toBe('schema-invalid');
    expect(code({ weaknesses: ['字'.repeat(101)] })).toBe('schema-invalid');
    expect(code({ risks: [] })).toBe('schema-invalid');
    expect(parseInitialEvaluationSynthesis('否', PROFILE)).toMatchObject({ ok: false, code: 'not-json' });
  });

  it('reads the observations alone, under its own header and a digest no unit request shares', () => {
    const closed = [
      { unitOrdinal: 2, result: { schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: 2, observations: [{ itemId: 'literary-quality', note: '甲。', blockOrdinals: [1, 2] }] } },
      { unitOrdinal: 1, result: { schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: 1, observations: [{ itemId: 'literary-quality', note: '乙。', blockOrdinals: [3] }] } },
    ] satisfies ReadonlyArray<{ unitOrdinal: number; result: InitialEvaluationUnitResult }>;
    const message = buildInitialEvaluationSynthesisMessage(CONTRACT, closed, 8);
    const setDigest = initialEvaluationObservationSetDigest(closed);
    expect(message.split('\n')[0]).toBe(`评估综合 2/8 · 依据摘要 ${setDigest}`);
    expect(parseInitialEvaluationSynthesisMessageHeader(message)).toEqual({ closed: 2, total: 8, setDigest });
    // In unit order, and an item nobody observed is said to be so.
    expect(message.indexOf('单元 1：乙。')).toBeLessThan(message.indexOf('单元 2：甲。'));
    expect(message).toContain('【readers-and-market】读者与市场潜力 · 满分 20\n- （各阅读范围都没有记下这一项的依据）');
    expect(initialEvaluationObservationSetDigest([...closed].reverse())).toBe(setDigest);
    const contract = initialEvaluationContractDigest(CONTRACT);
    expect(initialEvaluationSynthesisRequestDigest(contract, setDigest)).not.toBe(initialEvaluationRequestDigest(contract, 1, setDigest));
    expect(() => initialEvaluationRequestDigest('x', 1, DIGEST)).toThrowError('ANALYSIS_REQUEST_DIGEST_INVALID');
    expect(() => initialEvaluationSynthesisRequestDigest(contract, 'x')).toThrowError('ANALYSIS_REQUEST_DIGEST_INVALID');
  });

  it('freezes the profile into the contract: another 满分 is another contract', () => {
    const other = initialEvaluationContract({ ...PROFILE, items: PROFILE.items.map((item, index) => (index === 0 ? { ...item, fullMarks: 30 } : item)) });
    expect(initialEvaluationContractDigest(other)).not.toBe(initialEvaluationContractDigest(CONTRACT));
    expect(initialEvaluationKindDefinition(PROFILE).schemaDigest).toBe(initialEvaluationKindDefinition(PROFILE).schemaDigest);
    expect(() => initialEvaluationContract({ ...PROFILE, items: [...PROFILE.items, PROFILE.items[0]!] })).toThrowError('评估方案的评分项重复。');
    expect(() => initialEvaluationContract({ ...PROFILE, items: [{ itemId: 'x', label: '一项', fullMarks: 0 }] })).toThrowError('评估方案的评分项无效。');
  });
});

describe('the reducer and the shared rules', () => {
  it('says 依据充分度 plainly: at least three cited blocks in half the ranges is 充分, any citation 一般, none 不足', () => {
    expect(SUFFICIENT_MIN_CITED_BLOCKS).toBe(3);
    expect(evaluationSufficiency({ citedBlocks: 3, unitsCited: 4, unitsTotal: 8 })).toBe('sufficient');
    expect(evaluationSufficiency({ citedBlocks: 2, unitsCited: 4, unitsTotal: 8 })).toBe('fair');
    expect(evaluationSufficiency({ citedBlocks: 9, unitsCited: 3, unitsTotal: 8 })).toBe('fair');
    expect(evaluationSufficiency({ citedBlocks: 3, unitsCited: 1, unitsTotal: 1 })).toBe('sufficient');
    expect(evaluationSufficiency({ citedBlocks: 1, unitsCited: 1, unitsTotal: 8 })).toBe('fair');
    expect(evaluationSufficiency({ citedBlocks: 0, unitsCited: 0, unitsTotal: 8 })).toBe('insufficient');
    expect(evaluationSufficiency({ citedBlocks: 5, unitsCited: 0, unitsTotal: 8 })).toBe('insufficient');
  });

  it('counts an adjustment only where the editor\'s own score departs from AI7\'s', () => {
    expect(evaluationItemAdjusted({ score: 15, notRated: false }, 16.5)).toBe(true);
    expect(evaluationItemAdjusted({ score: 16.5, notRated: false }, 16.5)).toBe(false);
    expect(evaluationItemAdjusted({ score: null, notRated: true }, 16.5)).toBe(true);
    expect(evaluationItemAdjusted({ score: null, notRated: false }, 16.5)).toBe(false);
    expect(evaluationItemAdjusted({ score: 15, notRated: false }, null)).toBe(false);
    expect(evaluationItemAdjusted({ score: 0, notRated: false }, 0.5)).toBe(true);
  });

  it('gathers observations per item with their blocks, and scores nothing when the synthesis did not close', () => {
    const first = unit(1, 3, 0);
    // Unit 2's overlap is unit 1's last own block, as a manifest carries it.
    const units = [first, { ...unit(2, 2, 1), overlapBlockIds: [first.blockIds[2]!] }];
    const manifest = { units, totalBlocks: 6, sectionCount: 2, totalGraphemes: 200, digest: DIGEST } as unknown as CoverageManifestProjection;
    const outcomes = [
      { unitOrdinal: 1, state: 'closed' as const, result: { schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: 1, observations: [
        { itemId: 'literary-quality', note: '甲。', blockOrdinals: [1, 2] },
        { itemId: 'literary-quality', note: '乙。', blockOrdinals: [2, 3] },
        { itemId: 'chinese-language', note: '丙。', blockOrdinals: [1] },
      ] } },
      { unitOrdinal: 2, state: 'closed' as const, result: { schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: 2, observations: [
        { itemId: 'literary-quality', note: '丁。', blockOrdinals: [1] },
      ] } },
    ];
    const parsed = parseInitialEvaluationSynthesis(synthesis(), PROFILE);
    const closed = reduceInitialEvaluation({ profile: PROFILE, manifest, outcomes, synthesis: { state: 'closed', findings: [], requestDigest: DIGEST, usage: null, result: parsed.ok ? parsed.result : null } });
    const literary = closed.evaluation.items[0]!;
    // Unit 2's first message block is its overlap, which is unit 1's last own block: the same block cited twice counts once.
    expect([literary.score, literary.citedBlocks, literary.unitsCited, literary.sufficiency]).toEqual([16.5, 3, 2, 'sufficient']);
    expect(literary.observations.map((observation) => observation.blockIds)).toEqual([
      [units[0]!.blockIds[0], units[0]!.blockIds[1]], [units[0]!.blockIds[1], units[0]!.blockIds[2]], [units[1]!.overlapBlockIds[0]],
    ]);
    expect(closed.evaluation.items.map((item) => item.sufficiency)).toEqual(['sufficient', 'insufficient', 'insufficient', 'fair', 'insufficient']);
    expect(closed.reducerClosure.state).toBe('closed');
    expect(closed.assurance.state).toBe('limited');
    expect(closed.evaluation.synthesis).toEqual({ state: 'closed', reason: null });

    const gap = reduceInitialEvaluation({ profile: PROFILE, manifest, outcomes: [outcomes[0]!], synthesis: { state: 'gap', code: 'contract-invalid', reason: '全书综合结果不符合契约 v1。', requestDigest: DIGEST } });
    expect(gap.evaluation.items.every((item) => item.score === null && item.comment === null)).toBe(true);
    expect([gap.evaluation.suggestedConclusion, gap.evaluation.strengths, gap.evaluation.nextStep]).toEqual([null, [], null]);
    expect(gap.evaluation.synthesis).toEqual({ state: 'gap', reason: '全书综合结果不符合契约 v1。' });
    expect(gap.reducerClosure.stages.map((stage) => [stage.stage, stage.state])).toEqual([
      ['unit-validation', 'closed-with-gaps'], ['cross-unit-reduction', 'closed-with-gaps'], ['book-synthesis', 'closed-with-gaps'],
    ]);
    expect(gap.coverage).toMatchObject({ state: 'partial', unitsClosed: 1, gapCount: 1 });
    expect(gap.reducerClosure.label).toBe('归约/综合闭合：已闭合 · 全书综合未给出分数');
    expect(gap.assurance.label).toBe('语义/证据保证：有限 · 全书综合未闭合，没有初评分数');

    const notRun = reduceInitialEvaluation({ profile: PROFILE, manifest, outcomes: [], synthesis: { state: 'not-run', reason: '没有读完的阅读范围。' } });
    expect(notRun.evaluation.synthesis).toEqual({ state: 'not-run', reason: '没有读完的阅读范围。' });
    expect(notRun.reducerClosure.stages[1]).toEqual({ stage: 'cross-unit-reduction', state: 'not-run', inputCount: 0 });
  });

  it('names the kind\'s finding classes by 依据充分度 only', () => {
    const definition = initialEvaluationKindDefinition(PROFILE);
    const items = PROFILE.items.map((item, index) => ({ itemId: item.itemId, sufficiency: (['sufficient', 'sufficient', 'fair', 'insufficient', 'sufficient'] as const)[index]! }));
    expect(definition.findingCounts({ components: { evaluation: { items } } } as never)).toEqual([
      { kind: 'sufficiency:fair', count: 1 }, { kind: 'sufficiency:insufficient', count: 1 }, { kind: 'sufficiency:sufficient', count: 3 },
    ]);
    expect([definition.crossUnit?.step?.minimumClosedUnits, definition.assurance, definition.outOfScope]).toEqual([1, null, 'leave-unreviewed']);
  });
});
