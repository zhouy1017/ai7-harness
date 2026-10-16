import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CUSTOM_ANALYSIS_FIXED_TERMS,
  CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA,
  customAnalysisContract,
  customAnalysisContractDigest,
  customAnalysisDimensionDocument,
  customAnalysisDocumentDigest,
  customAnalysisTextRefusal,
  parseCustomAnalysisDimensionDocument,
  parseCustomAnalysisUnitResult,
} from '../../src/service/analysis/custom-analysis-contract.js';
import { customAnalysisKindDefinition, customAnalysisPlan, reduceCustomAnalysis } from '../../src/service/analysis/custom-analysis-kind.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST } from '../../src/service/analysis/assurance-sampling-contract.js';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { liveKindAdmission } from '../../src/service/analysis/live-kind-admission.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import {
  BASELINE_ANALYSIS_KIND,
  CUSTOM_ANALYSIS_CONTRACT_VERSION,
  customAnalysisDimensionIdOfKind,
  customAnalysisKindId,
  isCustomAnalysisKindId,
  type CoverageManifestProjection,
  type TaskPlanProjection,
} from '../../src/shared/protocol.js';
import { withoutRuleFor } from '../support/policy-rules.js';
import { CUSTOM_DIMENSION_TEMPLATE, CUSTOM_DIMENSION_TITLE } from '../support/custom-analysis.js';

// Issue #922 (slice 7f): the Custom Analysis Dimension document, Custom Analysis Contract v1 and the kind family it builds —
// pure functions over synthetic text; no store, transport, credential or manuscript.

const DIMENSION_ID = '0b0c3c1e-4c7e-4d0a-9a51-3a6f2f7d9e01';
const VERSION_ID = '5d7a2e10-8f3b-4c2d-8e6f-1a2b3c4d5e6f';
const document = customAnalysisDimensionDocument(CUSTOM_DIMENSION_TITLE, CUSTOM_DIMENSION_TEMPLATE);
const documentDigest = customAnalysisDocumentDigest(document);
const version = { dimensionId: DIMENSION_ID, versionId: VERSION_ID, version: 1, documentDigest, questionTemplate: CUSTOM_DIMENSION_TEMPLATE, title: CUSTOM_DIMENSION_TITLE };

describe('the dimension document (ai7.custom-analysis-dimension/1)', () => {
  it('carries the editor\'s title and template beside AI7\'s fixed answer schema and Authority Ceiling, digested canonically', () => {
    expect(document).toEqual({ schema: 'ai7.custom-analysis-dimension/1', title: CUSTOM_DIMENSION_TITLE, questionTemplate: CUSTOM_DIMENSION_TEMPLATE, ...CUSTOM_ANALYSIS_FIXED_TERMS });
    expect(document.answerSchema.row.score).toBe('never');
    expect(document.authorityCeiling).toEqual({ runSourceScope: 'current-book', mutation: 'none', platformTools: 'none', localTools: 'none', crossUnitSynthesis: 'none' });
    expect(documentDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(customAnalysisDocumentDigest(customAnalysisDimensionDocument(CUSTOM_DIMENSION_TITLE, CUSTOM_DIMENSION_TEMPLATE))).toBe(documentDigest);
    expect(customAnalysisDocumentDigest(customAnalysisDimensionDocument('另一个名称', CUSTOM_DIMENSION_TEMPLATE))).not.toBe(documentDigest);
    expect(parseCustomAnalysisDimensionDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it('refuses a stored document whose fixed terms were changed or that carries any other key', () => {
    const scored = { ...document, answerSchema: { ...document.answerSchema, row: { ...document.answerSchema.row, score: 'allowed' } } };
    expect(() => parseCustomAnalysisDimensionDocument(scored)).toThrow('固定条款');
    const widened = { ...document, authorityCeiling: { ...document.authorityCeiling, platformTools: 'websearch' } };
    expect(() => parseCustomAnalysisDimensionDocument(widened)).toThrow('固定条款');
    expect(() => parseCustomAnalysisDimensionDocument({ ...document, prompt: '另写的系统提示' })).toThrow('键集合');
  });

  it('bounds the template in graphemes, asks for Chinese, and admits only the {本单元} placeholder', () => {
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, CUSTOM_DIMENSION_TEMPLATE)).toBeNull();
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, '问'.repeat(400))).toBeNull();
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, '问'.repeat(401))).toBe('提问模板最多 400 个字。');
    // A grapheme of several code points counts once.
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, `问${'👩‍👩‍👧'.repeat(399)}`)).toBeNull();
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, 'What happens in this unit?')).toBe('提问模板须用中文书写。');
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, '{作者}在本单元写了什么？')).toContain('只能用 {本单元}');
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, '{本单元}与{本单元}有何不同？')).toContain('最多出现一次');
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, '本单元{写了什么？')).toBe('提问模板里有不成对的花括号。');
    expect(customAnalysisTextRefusal(CUSTOM_DIMENSION_TITLE, '第一行\n第二行')).toContain('须写成一段');
    expect(customAnalysisTextRefusal('', CUSTOM_DIMENSION_TEMPLATE)).toContain('维度名称不能为空');
    expect(customAnalysisTextRefusal('名'.repeat(41), CUSTOM_DIMENSION_TEMPLATE)).toBe('维度名称最多 40 个字。');
    expect(() => customAnalysisDimensionDocument(CUSTOM_DIMENSION_TITLE, '问'.repeat(401))).toThrow('提问模板最多 400 个字。');
  });
});

describe('the custom analysis kind family (custom-analysis/<dimension-id>)', () => {
  it('names one kind per dimension and reads it back, never another kind', () => {
    expect(customAnalysisKindId(DIMENSION_ID)).toBe(`custom-analysis/${DIMENSION_ID}`);
    expect(customAnalysisDimensionIdOfKind(`custom-analysis/${DIMENSION_ID}`)).toBe(DIMENSION_ID);
    for (const kind of ['custom-analysis/', 'custom-analysis/synthetic', 'editorial-review/typos-and-usage', BASELINE_ANALYSIS_KIND, `custom-analysis/${DIMENSION_ID}/x`]) {
      expect(isCustomAnalysisKindId(kind), kind).toBe(false);
    }
    expect(() => customAnalysisKindId('Not-A-Uuid')).toThrow('CUSTOM_ANALYSIS_DIMENSION_ID_INVALID');
  });

  it('freezes a deterministic contract per version: its number, digest and question, never its title or the store\'s identities', () => {
    const definition = customAnalysisKindDefinition(version);
    expect(definition.kind).toBe(`custom-analysis/${DIMENSION_ID}`);
    expect(definition.contractVersion).toBe(CUSTOM_ANALYSIS_CONTRACT_VERSION);
    expect(definition.modes.map((mode) => mode.mode)).toEqual(['first-baseline', 'sync-current', 'reanalyze-range', 'reanalyze-book']);
    expect(definition.updateModes).toEqual(['sync-current', 'reanalyze-range', 'reanalyze-book']);
    expect(definition.crossUnit).toBeNull();
    expect(definition.assurance).toBeNull();
    expect(definition.systemPrompt).toContain('本单元的内容块是从哪个场景或事件开始写的');
    expect(definition.systemPrompt).not.toContain(CUSTOM_DIMENSION_TITLE);
    expect(definition.livePromptContractDigest!()).toBe(definition.promptContractDigest);
    // The same version in another store, under other identities and another title, is the same contract.
    const elsewhere = customAnalysisKindDefinition({ ...version, dimensionId: VERSION_ID, versionId: DIMENSION_ID, title: '别的名称' });
    expect(elsewhere.promptContractDigest).toBe(definition.promptContractDigest);
    expect(elsewhere.kind).not.toBe(definition.kind);
    // Another version number or another question is another contract, and so another request digest for every unit.
    expect(customAnalysisKindDefinition({ ...version, version: 2 }).promptContractDigest).not.toBe(definition.promptContractDigest);
    const asked = customAnalysisKindDefinition({ ...version, questionTemplate: '本单元里谁第一次出场？', documentDigest: 'a'.repeat(64) });
    expect(asked.promptContractDigest).not.toBe(definition.promptContractDigest);
    expect(asked.requestDigest(1, 'b'.repeat(64))).not.toBe(definition.requestDigest(1, 'b'.repeat(64)));
    const { title: _title, ...contractInput } = version;
    expect(customAnalysisContractDigest(customAnalysisContract(contractInput))).toBe(definition.promptContractDigest);
  });

  it('leaves every existing kind\'s frozen contract byte-identical', () => {
    // The digests J-04 pins for the baseline's current unit contract and sampling contract /2.
    expect(BASELINE_PROMPT_CONTRACT_DIGEST).toBe('89776b1b5ca2e4d3ef529b0be6b2380bfc0cb5addf0426e815df7aa195c7d386');
    expect(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST).toBe('1bfd29ecb6ba5d9bdbd1e1d097da4de6a0d1c9e6319c5f2318d2ca8c5eeb112c');
    expect(baselineAnalysisKindDefinition().promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
  });

  it('admits a unit result of exactly its shape and refuses any other', () => {
    const row = { answer: '本单元从一封信写起。', blockOrdinal: 2, quote: '收到一封信', confidenceNote: '开篇直接写到，依据充分。' };
    const result = (rows: unknown[], unitOrdinal = 3): string => JSON.stringify({ schema: CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA, unitOrdinal, rows });
    const parsed = parseCustomAnalysisUnitResult(result([row]), { unitOrdinal: 3, blockCount: 4 });
    expect(parsed).toMatchObject({ ok: true, result: { unitOrdinal: 3, rows: [row] } });
    expect(parseCustomAnalysisUnitResult(`\`\`\`json\n${result([])}\n\`\`\``, { unitOrdinal: 3, blockCount: 4 }).ok).toBe(true);
    expect(parseCustomAnalysisUnitResult('不是 JSON', { unitOrdinal: 3, blockCount: 4 })).toMatchObject({ ok: false, code: 'not-json' });
    expect(parseCustomAnalysisUnitResult(result([{ ...row, score: 4 }]), { unitOrdinal: 3, blockCount: 4 })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseCustomAnalysisUnitResult(JSON.stringify({ schema: CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA, unitOrdinal: 3, rows: [], summary: '跨单元总结' }), { unitOrdinal: 3, blockCount: 4 }))
      .toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseCustomAnalysisUnitResult(result([row], 4), { unitOrdinal: 3, blockCount: 4 })).toMatchObject({ ok: false, code: 'unit-mismatch' });
    expect(parseCustomAnalysisUnitResult(result([{ ...row, blockOrdinal: 5 }]), { unitOrdinal: 3, blockCount: 4 })).toMatchObject({ ok: false, code: 'quote-not-in-block' });
    expect(parseCustomAnalysisUnitResult(result([{ ...row, answer: '答'.repeat(301) }]), { unitOrdinal: 3, blockCount: 4 })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseCustomAnalysisUnitResult(result([{ ...row, quote: '引'.repeat(81) }]), { unitOrdinal: 3, blockCount: 4 })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseCustomAnalysisUnitResult(result([{ ...row, confidenceNote: '注'.repeat(121) }]), { unitOrdinal: 3, blockCount: 4 })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseCustomAnalysisUnitResult(result(Array.from({ length: 13 }, () => row)), { unitOrdinal: 3, blockCount: 4 })).toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('locates each quotation deterministically, keeps the rows it cannot locate, and counts without synthesizing across units', () => {
    const blockA = { blockId: `blk_${'a'.repeat(24)}`, kind: 'paragraph', level: null, text: '曾本之刚刚收到一封信。' };
    const blockB = { blockId: `blk_${'b'.repeat(24)}`, kind: 'paragraph', level: null, text: '雷声，雷声，又是雷声。' };
    const manifest = {
      units: [
        { ordinal: 1, digest: 'c'.repeat(64), blockIds: [blockA.blockId], overlapBlockIds: [], startPosition: 1, endPosition: 1 },
        { ordinal: 2, digest: 'd'.repeat(64), blockIds: [blockB.blockId], overlapBlockIds: [blockA.blockId], startPosition: 2, endPosition: 2 },
        { ordinal: 3, digest: 'e'.repeat(64), blockIds: [], overlapBlockIds: [], startPosition: 3, endPosition: 3 },
      ],
    } as unknown as CoverageManifestProjection;
    const blocks = new Map([blockA, blockB].map((block) => [block.blockId, block as never] as const));
    const dimension = { dimensionId: DIMENSION_ID, versionId: VERSION_ID, version: 1, documentDigest };
    const outcome = (unitOrdinal: number, rows: Array<{ blockOrdinal: number; quote: string }>) => ({
      unitOrdinal, state: 'closed' as const,
      result: { schema: CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA, unitOrdinal, rows: rows.map((row) => ({ ...row, answer: '回答。', confidenceNote: '说明。' })) },
    });
    const reduction = reduceCustomAnalysis({
      dimension, manifest, blocks, reusedUnitOrdinals: new Set(),
      outcomes: [
        outcome(1, [{ blockOrdinal: 1, quote: '收到一封信' }]),
        outcome(2, [{ blockOrdinal: 2, quote: '雷声' }, { blockOrdinal: 2, quote: '雨声' }, { blockOrdinal: 1, quote: '曾本之' }]),
        { unitOrdinal: 3, state: 'gap', code: 'adapter-failure', reason: '合成失败。' },
      ],
    });
    expect(reduction.rows.map((row) => [row.unitOrdinal, row.anchorState])).toEqual([[1, 'located'], [2, 'ambiguous'], [2, 'not-found'], [2, 'located']]);
    expect(reduction.rows[0]!.sourceRange).toEqual({ blockId: blockA.blockId, fromGrapheme: 5, toGrapheme: 10 });
    // The overlap block is the unit's first in message order; a quotation located there names that block.
    expect(reduction.rows[3]!.sourceRange?.blockId).toBe(blockA.blockId);
    expect(reduction.rowCounts).toEqual({ units: 2, rows: 4, located: 2, unlocated: 2 });
    expect(reduction.coverage.state).toBe('partial');
    expect(reduction.gaps.map((gap) => gap.unitOrdinal)).toEqual([3]);
    expect(reduction.assurance.state).toBe('limited');
    expect(reduction.reducerClosure.stages.map((stage) => stage.stage)).toEqual(['unit-validation', 'reference-integrity']);
    const definition = customAnalysisKindDefinition(version);
    expect(definition.findingCounts({ components: { rows: reduction.rows } } as never)).toEqual([
      { kind: 'row:ambiguous', count: 1 }, { kind: 'row:located', count: 2 }, { kind: 'row:not-found', count: 1 },
    ]);
  });

  it('names the dimension version and its template on the plan, and the template as 会发送 only for a live route', () => {
    const plan = {
      goal: { sentence: '对当前书稿执行基线稿件分析。', chips: { procedure: '基线分析' } },
      scope: { send: '不发送任何内容' },
      service: { send: '不发送任何内容' },
      steps: [{ id: 'units', label: '逐章读取', result: '各章摘要', removable: false, removed: false }, { id: 'reduction', label: '汇总全书', result: '梗概', removable: false, removed: false }],
      outcomes: ['基线分析结果'],
      technical: [],
    } as unknown as TaskPlanProjection;
    const local = customAnalysisPlan(plan, { ...version }, false);
    expect(local.goal.chips.procedure).toBe(`自定义分析 · ${CUSTOM_DIMENSION_TITLE} · 第 1 版`);
    expect(local.scope.send).toBe(`不发送任何内容；实时运行时会一并发送该维度第 1 版的提问模板「${CUSTOM_DIMENSION_TEMPLATE}」`);
    expect(local.service.send).toBe('不发送任何内容');
    expect(local.steps.map((step) => step.id)).toEqual(['units', 'reduction']);
    expect(local.technical.at(-1)).toEqual({ key: 'custom-analysis-dimension', label: '自定义分析维度版本', value: `${VERSION_ID} · ${documentDigest}` });
    const live = customAnalysisPlan({ ...plan, scope: { ...plan.scope, send: '所读阅读范围的稿件正文（8 个）' } }, { ...version }, true);
    expect(live.scope.send).toBe(`所读阅读范围的稿件正文（8 个），以及该维度第 1 版的提问模板「${CUSTOM_DIMENSION_TEMPLATE}」`);
    // The title is the editor's label: never on the 会发送 line.
    expect(live.scope.send.includes(`「${CUSTOM_DIMENSION_TITLE}」`)).toBe(false);
  });
});

describe('live admission of a dimension version (#920 rule, slice 7f definition)', async () => {
  const policy = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../../', import.meta.url)), 'developer-live');
  const binding = policy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes(BASELINE_ANALYSIS_KIND))!;
  const definition = customAnalysisKindDefinition(version);

  it('is admitted by the custom-analysis/* rule for the contract its owner re-derives, and by no replaced digest', () => {
    expect(liveKindAdmission(policy, definition, binding)?.ruleId).toBe('developer-live-public-samplebook-custom-analysis');
    expect(liveKindAdmission(policy, { ...definition, promptContractDigest: 'a'.repeat(64) }, binding)).toBeNull();
  });

  it('is refused under a policy that does not list the family: 当前策略未开放自定义分析', () => {
    expect(liveKindAdmission(withoutRuleFor(policy, definition.kind), definition, binding)).toBeNull();
  });
});
