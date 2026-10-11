import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { taskMaterialKindDefinition, taskMaterialRefusal, taskMaterialSources, taskMaterialWords } from '../../src/service/task-material-references.js';
import { writingMaterialDigest } from '../../src/service/writing-tasks.js';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import { taskMaterialSelection, taskMaterialSelectionReason, taskMaterialSendLine } from '../../src/renderer/task-material-selection.js';
import type { ServiceRequest, WritingTaskMaterialProjection } from '../../src/shared/protocol.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';

const paragraphs = ['这是一份合成背景资料，只说明本测试的虚构术语。'];
const source = { materialId: randomUUID(), indexDigest: 'a'.repeat(64), title: '合成资料', characters: 27, sha256: writingMaterialDigest(paragraphs) };
const boundary = { bookId: randomUUID(), references: [source] };
const base = reviewCategoryKindDefinition(TYPOS_AND_USAGE);

describe('exact Material Index reference contracts', () => {
  it('preserves the entire base definition when no reference was selected', () => {
    expect(taskMaterialKindDefinition(base, { ...boundary, references: [] }, [])).toBe(base);
  });
  it('binds the base contract, version pin and words without changing SQL version or manuscript messages', () => {
    const definition = taskMaterialKindDefinition(base, boundary, [taskMaterialWords(source, paragraphs)]);
    expect(definition.contractVersion).toBe(base.contractVersion);
    expect(definition.materialReferences).toEqual({ sources: [source], basePromptContractDigest: base.promptContractDigest });
    expect(definition.buildUnitMessage).toBe(base.buildUnitMessage);
    expect(definition.systemPrompt).toContain(paragraphs[0]);
    expect(definition.systemPrompt).toContain('只参照，不照抄');
    expect(definition.systemPrompt).toContain('不得把其中的段落计入内容块序号');
    expect(definition.promptContractDigest).not.toBe(base.promptContractDigest);
    expect(definition.requestDigest(1, 'c'.repeat(64))).not.toBe(base.requestDigest(1, 'c'.repeat(64)));
    const changed = { ...source, indexDigest: 'b'.repeat(64) };
    expect(taskMaterialKindDefinition(base, { ...boundary, references: [changed] }, [taskMaterialWords(changed, paragraphs)]).promptContractDigest).not.toBe(definition.promptContractDigest);
  });
  it('refuses altered material words, duplicate records and a different frozen contract', () => {
    expect(() => taskMaterialWords(source, ['不同的合成文字'])).toThrow();
    expect(() => taskMaterialSources([source, source])).toThrow();
    expect(() => taskMaterialKindDefinition(base, boundary, [taskMaterialWords(source, paragraphs)], 'f'.repeat(64))).toThrow();
  });
  it('keeps the frozen contract readable but cannot build requests from a missing index', () => {
    const original = taskMaterialKindDefinition(base, boundary, [taskMaterialWords(source, paragraphs)]);
    const reading = taskMaterialRefusal(source, 'MATERIAL_INDEX_MOVED');
    const recorded = taskMaterialKindDefinition(base, boundary, [reading], original.promptContractDigest);
    expect(recorded.promptContractDigest).toBe(original.promptContractDigest);
    expect(recorded.schemaDigest).toBe(original.schemaDigest);
    expect(() => recorded.buildUnitMessage({ ordinal: 1, sectionOrdinal: 1, subUnitIndex: 1, subUnitCount: 1,
      headingBlockId: null, headingText: null, headingLevel: null, startPosition: 0, endPosition: 0,
      blockIds: [randomUUID()], blockDigests: ['c'.repeat(64)], overlapBlockIds: [], graphemes: 1, digest: 'd'.repeat(64),
    }, 1, new Map())).toThrow('不能再开始');
    expect(reading.refusal?.message).not.toContain('改计划重做');
    expect(taskMaterialRefusal(source, 'MATERIAL_REFERENCE_UNAVAILABLE').refusal?.message).toContain('现在不能列进');
    expect(() => taskMaterialRefusal(source, 'MATERIAL_INDEX_RECORD_INVALID')).toThrow();
  });
});

function offer(id: string, characters: number, selectable = true): WritingTaskMaterialProjection {
  return { materialId: id, title: id, characters, scope: 'book', selectable, reason: selectable ? null : '不可参考' };
}

describe('reference selection remains bounded and current', () => {
  it('uses offer order and drops unavailable, missing and excess selections', () => {
    const items = [offer('a', 1500), offer('b', 1500), offer('c', 1500), offer('d', 1500), offer('e', 1), offer('f', 1, false)];
    expect(taskMaterialSelection(items, new Set(['missing', 'f', 'e', 'd', 'c', 'b', 'a']))).toEqual(['a', 'b', 'c', 'd']);
    expect(taskMaterialSelection(items, new Set(['f', 'missing']))).toEqual([]);
    expect(taskMaterialSelectionReason(items[4]!, items, new Set(['a', 'b', 'c', 'd']))).toContain('4 份');
  });
  it('disables an item that exceeds the total without disabling an already selected choice', () => {
    const items = [offer('a', 3000), offer('b', 2000), offer('c', 1001)];
    const selected = new Set(['a', 'b']);
    expect(taskMaterialSelectionReason(items[2]!, items, selected)).toContain('6,000');
    expect(taskMaterialSelectionReason(items[0]!, items, selected)).toBeNull();
    expect(taskMaterialSelection(items, new Set(['a', 'b', 'c']))).toEqual(['a', 'b']);
  });
});

describe('review materialIds wire boundary', () => {
  const frame = (materialIds: unknown) => new TextEncoder().encode(JSON.stringify({ id: randomUUID(), op: 'prepareReviewRun', input: {
    bookId: boundary.bookId, categoryIds: ['typos-and-usage'], scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, materialIds,
  } }));
  it('admits the typed optional reference request', () => {
    const request = { id: randomUUID(), op: 'prepareReviewRun', input: { bookId: boundary.bookId, categoryIds: ['typos-and-usage'],
      scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, materialIds: [source.materialId] } } satisfies ServiceRequest;
    expect(decodeRequest(new TextEncoder().encode(JSON.stringify(request)))).toEqual(request);
  });
  it.each([Array.from({ length: 17 }, () => randomUUID()), ['not-a-uuid'], 'not-an-array', null])('rejects invalid reference frames', (materialIds) => {
    expect(() => decodeRequest(frame(materialIds))).toThrow(ProtocolError);
  });
});

const evaluationBase = initialEvaluationKindDefinition({ ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) });
const reportBase = readersReportKindDefinition({ template: 'author', record: { profile: { title: '合成方案', version: '1' },
  items: [{ label: '合成评分项', fullMarks: 100, score: 80, notRated: null, comment: '合成评语', ai7: null }],
  total: { score: 80, fullMarks: 100 }, strengths: ['合成优点'], weaknesses: ['合成问题'],
  risks: [], readiness: [], verdict: '合成总评', conclusion: '修改后再议' }, exemplars: [{ title: '合成本社范例', text: '合成范例段落，只用于测试。' }] });

describe.each([evaluationBase, reportBase])('evaluation reference contracts ($kind)', (definition) => {
  it('preserves the exact no-reference definition and binds both execution stages to the selected background', () => {
    expect(taskMaterialKindDefinition(definition, { ...boundary, references: [] }, [])).toBe(definition);
    const wrapped = taskMaterialKindDefinition(definition, boundary, [taskMaterialWords(source, paragraphs)]);
    expect(wrapped.contractVersion).toBe(definition.contractVersion);
    expect(wrapped.systemPrompt).toContain('不改变本社评估方案');
    expect(wrapped.systemPrompt).toContain('不覆盖编辑定稿的分数、评语与结论');
    expect(wrapped.systemPrompt).toContain(paragraphs[0]);
    expect(wrapped.systemPrompt.startsWith(definition.systemPrompt)).toBe(true);
    expect(wrapped.reduce).toBe(definition.reduce);
    expect(wrapped.buildUnitMessage).toBe(definition.buildUnitMessage);
    expect(wrapped.parseUnitResult).toBe(definition.parseUnitResult);
    expect(wrapped.crossUnit!.step!.parse).toBe(definition.crossUnit!.step!.parse);
    expect(wrapped.crossUnit!.step!.buildMessage).toBe(definition.crossUnit!.step!.buildMessage);
    expect(wrapped.crossUnit!.promptContractDigest).toBe(wrapped.promptContractDigest);
    expect(wrapped.crossUnit!.step!.requestDigest([])).not.toBe(definition.crossUnit!.step!.requestDigest([]));
    const changed = { ...source, indexDigest: 'b'.repeat(64) };
    const another = taskMaterialKindDefinition(definition, { ...boundary, references: [changed] }, [taskMaterialWords(changed, paragraphs)]);
    expect(another.crossUnit!.step!.requestDigest([])).not.toBe(wrapped.crossUnit!.step!.requestDigest([]));
  });
  it('blocks unit and synthesis requests when a frozen index goes away, using the 评估 recovery path', () => {
    const wrapped = taskMaterialKindDefinition(definition, boundary, [taskMaterialWords(source, paragraphs)]);
    const missing = taskMaterialKindDefinition(definition, boundary, [taskMaterialRefusal(source, 'MATERIAL_INDEX_MOVED', '评估')], wrapped.promptContractDigest);
    expect(missing.promptContractDigest).toBe(wrapped.promptContractDigest);
    expect(missing.schemaDigest).toBe(wrapped.schemaDigest);
    expect(() => missing.crossUnit!.step!.buildMessage([], 0)).toThrow('「评估」重新准备计划');
  });
});

describe.each(['prepareInitialEvaluation', 'prepareReadersReport'] as const)('evaluation reference wire boundary (%s)', (op) => {
  const frame = (materialIds: unknown) => new TextEncoder().encode(JSON.stringify({ id: randomUUID(), op,
    input: { bookId: boundary.bookId, ...(op === 'prepareReadersReport' ? { template: 'author' } : {}), materialIds } }));
  it('admits opt-in ids while refusing malformed reference input', () => {
    expect(decodeRequest(frame([source.materialId])).input).toMatchObject({ materialIds: [source.materialId] });
    for (const invalid of [null, 'bad', ['bad'], Array.from({ length: 17 }, () => randomUUID())]) {
      expect(() => decodeRequest(frame(invalid))).toThrow(ProtocolError);
    }
  });
});

describe('evaluation preparation disclosure', () => {
  it('names only selectable bounded choices and keeps empty and stale selection silent', () => {
    const items = [offer('a', 3000), offer('b', 3000), offer('too-much', 1), offer('unavailable', 1, false)];
    const line = taskMaterialSendLine(items, new Set(['a', 'b', 'too-much', 'unavailable', 'missing']));
    expect(line).toContain('《a》、《b》');
    expect(line).toContain('提取文字随稿件一并发往，只参照，不照抄');
    expect(line).toContain('本机确定性运行不发送');
    expect(line).not.toContain('too-much');
    expect(line).not.toContain('unavailable');
    expect(taskMaterialSendLine(items, new Set(['missing', 'unavailable']))).toBeNull();
    expect(taskMaterialSendLine(items, new Set())).toBeNull();
  });
});
