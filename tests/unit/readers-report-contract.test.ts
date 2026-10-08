import { describe, expect, it } from 'vitest';
import {
  READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
  READERS_REPORT_UNIT_RESULT_SCHEMA,
  buildReadersReportSynthesisMessage,
  parseReadersReportSynthesis,
  parseReadersReportSynthesisMessageHeader,
  parseReadersReportUnitMessageHeader,
  parseReadersReportUnitResult,
  readersReportContract,
  readersReportContractDigest,
  readersReportExemplarLine,
  type ReadersReportContractInput,
} from '../../src/service/evaluation/readers-report-contract.js';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { parseInitialEvaluationUnitMessageHeader } from '../../src/service/evaluation/initial-evaluation-contract.js';
import { parseUnitMessageHeader } from '../../src/service/analysis/contract.js';
import { readersReportDraftBlocks } from '../../src/service/readers-reports.js';
import { READERS_REPORT_NO_EXEMPLAR } from '../../src/shared/protocol.js';

// Reader's Report Contract v1 (Issue #429, plan slice S81c; V2-UX-EVAL-013): what the contract freezes, what it says when the
// house holds no 审稿意见 among its 范例 (the Owner's answer of 2026-10-07), what it admits from a model, and the draft's shape.

const INPUT: ReadersReportContractInput = {
  template: 'author',
  record: {
    profile: { title: '审稿评估方案', version: '1' },
    items: [
      { label: '文学品质与作者声音', fullMarks: 20, score: 16.5, notRated: null, comment: '细节纯熟。\n个别比喻俗套。', ai7: { score: 16.5, sufficiency: 'sufficient', evidence: [{ unitOrdinal: 1, note: '题辞对仗。' }] } },
      { label: '读者与市场潜力', fullMarks: 20, score: null, notRated: '市场资料尚未收集。', comment: null, ai7: null },
    ],
    total: { score: 16.5, fullMarks: 20 },
    risks: [{ label: '事实与来源', level: 'low', statement: '已核对。' }],
    readiness: ['第三章结尾需要重写'],
    strengths: ['悬念抓人。'],
    weaknesses: ['残句。'],
    verdict: null,
    conclusion: '修改后再议',
  },
  exemplars: [],
};

const SECTIONS = {
  schema: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
  overall: '整体达到出版要求。',
  strengths: ['悬念抓人。'],
  problems: ['残句。'],
  suggestions: ['逐句校读。'],
  conclusion: '修改后再议。',
};

describe('Reader\'s Report Contract v1', () => {
  it('freezes the record\'s words, the template and the exemplars into its digest, and says when there is no exemplar', () => {
    const contract = readersReportContract(INPUT);
    expect(contract.systemPrompt).toContain('「给作者的修改意见」');
    expect(contract.systemPrompt).toContain('评分项「文学品质与作者声音」（满分 20）：得分 16.5；评语：细节纯熟。／个别比喻俗套。');
    expect(contract.systemPrompt).toContain('评分项「读者与市场潜力」（满分 20）：不评（市场资料尚未收集。）');
    expect(contract.systemPrompt).toContain('  · 单元 1：题辞对仗。');
    expect(contract.systemPrompt).toContain('编辑选定的结论：修改后再议');
    expect(contract.synthesisInstruction).toContain(`${READERS_REPORT_NO_EXEMPLAR}。`);
    expect(readersReportExemplarLine([])).toBe(READERS_REPORT_NO_EXEMPLAR);
    const digest = readersReportContractDigest(contract);
    expect(readersReportContractDigest(readersReportContract({ ...INPUT, template: 'editorial' }))).not.toBe(digest);
    expect(readersReportContractDigest(readersReportContract({ ...INPUT, record: { ...INPUT.record, conclusion: '暂缓' } }))).not.toBe(digest);
    // An exemplar, once the house has one, is named in the plan's words and read for its structure only.
    const seeded = readersReportContract({ ...INPUT, exemplars: [{ title: '旧书审稿意见', text: '总体评价……' }] });
    expect(readersReportExemplarLine(seeded.input.exemplars)).toBe('参考本社 1 份审稿意见范例：《旧书审稿意见》');
    expect(seeded.synthesisInstruction).toContain('只学它们的结构与写法，不照抄其中的内容');
    expect(seeded.synthesisInstruction).not.toContain(READERS_REPORT_NO_EXEMPLAR);
    expect(() => readersReportContract({ ...INPUT, exemplars: Array.from({ length: 3 }, () => ({ title: '范例', text: '内容' })) })).toThrowError();
  });

  it('admits a unit result of its own kinds within the unit, and refuses anything else whole', () => {
    const unit = (passages: unknown, ordinal = 2) => JSON.stringify({ schema: READERS_REPORT_UNIT_RESULT_SCHEMA, unitOrdinal: ordinal, passages });
    expect(parseReadersReportUnitResult(unit([{ kind: 'problem', note: '残句。', blockOrdinals: [3] }]), { unitOrdinal: 2, blockCount: 5 })).toMatchObject({ ok: true });
    expect(parseReadersReportUnitResult('not json', { unitOrdinal: 2, blockCount: 5 })).toMatchObject({ ok: false, code: 'not-json' });
    expect(parseReadersReportUnitResult(unit([], 3), { unitOrdinal: 2, blockCount: 5 })).toMatchObject({ ok: false, code: 'unit-mismatch' });
    expect(parseReadersReportUnitResult(unit([{ kind: 'marketing', note: '卖点。', blockOrdinals: [1] }]), { unitOrdinal: 2, blockCount: 5 })).toMatchObject({ ok: false, code: 'kind-unknown' });
    expect(parseReadersReportUnitResult(unit([{ kind: 'strength', note: '好。', blockOrdinals: [6] }]), { unitOrdinal: 2, blockCount: 5 })).toMatchObject({ ok: false, code: 'block-out-of-unit' });
    expect(parseReadersReportUnitResult(unit([{ kind: 'strength', note: '好。', blockOrdinals: [1, 1] }]), { unitOrdinal: 2, blockCount: 5 })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseReadersReportUnitResult(unit([{ kind: 'strength', note: '好\n。', blockOrdinals: [1] }]), { unitOrdinal: 2, blockCount: 5 })).toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('admits the five sections within their bounds, and nothing else', () => {
    expect(parseReadersReportSynthesis(JSON.stringify(SECTIONS))).toEqual({ ok: true, result: SECTIONS });
    expect(parseReadersReportSynthesis(JSON.stringify({ ...SECTIONS, marketing: ['卖点'] }))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseReadersReportSynthesis(JSON.stringify({ ...SECTIONS, strengths: [] }))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseReadersReportSynthesis(JSON.stringify({ ...SECTIONS, suggestions: Array(7).fill('改。') }))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseReadersReportSynthesis(JSON.stringify({ ...SECTIONS, overall: '长'.repeat(601) }))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseReadersReportSynthesis(JSON.stringify({ ...SECTIONS, conclusion: '' }))).toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('names its requests by headers no other contract reads, and keys the synthesis by the passages it reads', () => {
    const definition = readersReportKindDefinition(INPUT);
    const unit = { ordinal: 1, digest: 'a'.repeat(64), overlapBlockIds: [], blockIds: ['blk_1'] } as never;
    const message = definition.buildUnitMessage(unit, 2, new Map([['blk_1', { blockId: 'blk_1', kind: 'paragraph', level: null, text: '正文。' }]]));
    expect(parseReadersReportUnitMessageHeader(message)).toEqual({ ordinal: 1, total: 2, unitDigest: 'a'.repeat(64) });
    expect(parseInitialEvaluationUnitMessageHeader(message)).toBeNull();
    expect(parseUnitMessageHeader(message)).toBeNull();
    const closed = [{ unitOrdinal: 1, result: { schema: READERS_REPORT_UNIT_RESULT_SCHEMA, unitOrdinal: 1, passages: [{ kind: 'strength' as const, note: '好。', blockOrdinals: [1] }] } }];
    const synthesis = buildReadersReportSynthesisMessage(readersReportContract(INPUT), closed, 2);
    expect(parseReadersReportSynthesisMessageHeader(synthesis)).toMatchObject({ closed: 1, total: 2 });
    expect(synthesis).toContain('【印证优点的段落】\n- 单元 1：好。（引用 1 个内容块）');
    expect(synthesis).toContain('【显出问题的段落】\n- （各阅读范围都没有记下这一类段落）');
  });

  it('begins the draft with its title and the five sections in their order', () => {
    expect(readersReportDraftBlocks('书', 'editorial', SECTIONS).map((block) => [block.kind, block.level, block.text])).toEqual([
      ['title', 1, '《书》审稿意见 · 给编辑部 / 选题会的审读报告'],
      ['heading', 1, '总体评价'], ['paragraph', null, '整体达到出版要求。'],
      ['heading', 1, '主要优点'], ['paragraph', null, '1. 悬念抓人。'],
      ['heading', 1, '主要问题'], ['paragraph', null, '1. 残句。'],
      ['heading', 1, '修改建议'], ['paragraph', null, '1. 逐句校读。'],
      ['heading', 1, '结论'], ['paragraph', null, '修改后再议。'],
    ]);
  });
});
