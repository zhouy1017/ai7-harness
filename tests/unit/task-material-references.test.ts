import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import {
  materialInterruptionMessage, materialInterruptionNextAction, materialSettledReason, taskMaterialKindDefinition, taskMaterialReferenceLine,
  taskMaterialRefusal, taskMaterialSettled, taskMaterialSources, taskMaterialWords,
} from '../../src/service/task-material-references.js';
import { writingMaterialDigest } from '../../src/service/writing-tasks.js';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import {
  acknowledgeTaskMaterialRemovals, reconcileTaskMaterialSelection, taskMaterialSelection, taskMaterialSelectionReason, taskMaterialSendLine, taskMaterialSizeText,
} from '../../src/renderer/task-material-selection.js';
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
    expect(taskMaterialRefusal(source, 'MATERIAL_INDEX_RECORD_INVALID', '评估').refusal?.message).toBe('资料《合成资料》的索引记录已损坏，这份计划不能再开始；可以在「评估」重新准备计划。');
    expect(() => taskMaterialRefusal(source, 'MATERIAL_OUTSIDE_PLAN')).toThrow();
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

const CODES = ['MATERIAL_INDEX_MOVED', 'MATERIAL_REFERENCE_UNAVAILABLE', 'MATERIAL_INDEX_RECORD_INVALID'] as const;

describe('moved, withdrawn and corrupt references each say their own reason, at each stage (Issue #759)', () => {
  it('tells the three reasons apart before the Task starts, under way, and once it has settled', () => {
    const before = CODES.map((code) => taskMaterialRefusal(source, code, '写作').refusal!.message);
    const during = CODES.map((code) => materialInterruptionMessage({ code, materialTitle: source.title, message: '' }));
    const after = CODES.map((code) => materialSettledReason(code));
    for (const stage of [before, during, after]) expect(new Set(stage).size).toBe(3);
    expect(before[0]).toBe('资料《合成资料》计划冻结的索引版本已不在本机，这份计划不能再开始；可以用「新建文档…」重新准备。');
    expect(before[1]).toContain('现在不能列进这本书任务的「允许参考」');
    expect(before[2]).toContain('的索引记录已损坏');
    expect(during).toEqual([
      '资料《合成资料》在任务运行中的索引版本已不在本机，任务已中断；已完成的单元保留。',
      '资料《合成资料》在任务运行中已撤回允许参考，任务已中断；已完成的单元保留。',
      '资料《合成资料》在任务运行中的索引记录已损坏，任务已中断；已完成的单元保留。',
    ]);
    // Under way is not "before": no stage-wrong "cannot start" for a Run already going, and no "interrupted" for a plan not begun.
    for (const line of during) expect(line).not.toContain('不能再开始');
    for (const line of before) expect(line).not.toContain('已中断');
    for (const line of [...before, ...during, ...after]) expect(line).not.toMatch(/MATERIAL_|[A-Za-z]{4}/u);
  });
  it('gives each reason its own next step and leaves any other stop to its owner', () => {
    const next = CODES.map((code) => materialInterruptionNextAction(code));
    expect(new Set(next).size).toBe(3);
    expect(next[0]).toContain('索引版本已不在本机');
    expect(next[1]).toContain('已撤回允许参考');
    expect(next[2]).toContain('索引记录已损坏');
    expect(materialInterruptionNextAction('REVIEW_DELIVERABLE_CHANGED')).toBeNull();
    expect(materialSettledReason('REVIEW_DELIVERABLE_CHANGED')).toBeNull();
    expect(materialInterruptionMessage({ code: 'REVIEW_DELIVERABLE_CHANGED', materialTitle: source.title, message: '' })).toContain('已不可用');
  });
  it('discloses a reference that no longer reads on a Task already started without calling it unstartable', () => {
    for (const code of CODES) {
      const refused = taskMaterialRefusal(source, code, '审阅');
      expect(taskMaterialReferenceLine(refused)).toContain('这份计划不能再开始');
      const settled = taskMaterialSettled(refused);
      expect(settled.refusal).toBeNull();
      const line = taskMaterialReferenceLine(settled);
      expect(line).toContain('已有的结果仍可查看，再次运行需重新准备计划');
      expect(line).toContain(materialSettledReason(code)!);
      expect(line).not.toContain('不能再开始');
    }
    const healthy = taskMaterialWords(source, paragraphs);
    expect(taskMaterialSettled(healthy)).toEqual({ source, paragraphs, refusal: null });
    expect(taskMaterialReferenceLine(taskMaterialSettled(healthy))).toBe(taskMaterialReferenceLine(healthy));
  });
});

describe('material ids at the request frame are bounded to what the service takes (Issue #759)', () => {
  const frames = {
    prepareReviewRun: (materialIds: unknown) => ({ op: 'prepareReviewRun', input: { bookId: boundary.bookId, categoryIds: ['typos-and-usage'],
      scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, materialIds } }),
    prepareInitialEvaluation: (materialIds: unknown) => ({ op: 'prepareInitialEvaluation', input: { bookId: boundary.bookId, materialIds } }),
    prepareReadersReport: (materialIds: unknown) => ({ op: 'prepareReadersReport', input: { bookId: boundary.bookId, template: 'author', materialIds } }),
    prepareWritingTask: (materialIds: unknown) => ({ op: 'prepareWritingTask', input: { bookId: boundary.bookId, typeId: 'review-article',
      audience: '合成受众', channel: '合成渠道', requirements: null, materialIds } }),
  } as const;
  it.each(Object.entries(frames))('%s admits four and refuses a fifth with the frame refusal', (_op, build) => {
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const encode = (materialIds: unknown) => new TextEncoder().encode(JSON.stringify({ id: randomUUID(), ...build(materialIds) }));
    expect(decodeRequest(encode(ids.slice(0, 4))).input).toMatchObject({ materialIds: ids.slice(0, 4) });
    expect(() => decodeRequest(encode(ids))).toThrow(ProtocolError);
  });
});

describe('the selection leaves no choice out silently (Issue #759)', () => {
  const items = (): WritingTaskMaterialProjection[] => [offer('a', 1000), offer('b', 1000), { ...offer('c', 0, false), reason: '索引记录已损坏 · 不可选' }, offer('d', 1000)];
  it('keeps the same order whichever choice was ticked first', () => {
    const orders = [['d', 'a', 'b'], ['b', 'd', 'a'], ['a', 'b', 'd']].map((ticks) => reconcileTaskMaterialSelection({}, items(), new Set(ticks)).kept);
    expect(orders).toEqual([['a', 'b', 'd'], ['a', 'b', 'd'], ['a', 'b', 'd']]);
  });
  it('says which choice left the selection and why, until the editor has seen it', () => {
    const owner = {};
    expect(reconcileTaskMaterialSelection(owner, items(), new Set(['a', 'c']))).toEqual({
      kept: ['a'],
      removals: ['《c》已从所选中去掉：索引记录已损坏 · 不可选'],
    });
    // The item then leaves the offers altogether: it is still named, from the offers it was last seen in.
    const gone = reconcileTaskMaterialSelection(owner, items().filter((entry) => entry.materialId !== 'b'), new Set(['a', 'b']));
    expect(gone.kept).toEqual(['a']);
    expect(gone.removals).toEqual(['《c》已从所选中去掉：索引记录已损坏 · 不可选', '《b》已不在可参考的清单中，已从所选中去掉。']);
    acknowledgeTaskMaterialRemovals(owner);
    expect(reconcileTaskMaterialSelection(owner, items(), new Set(['a'])).removals).toEqual([]);
    // One never offered before can only be named as a choice.
    expect(reconcileTaskMaterialSelection({}, items(), new Set(['zz'])).removals).toEqual(['已选的一份资料已不在可参考的清单中，已从所选中去掉。']);
  });
  it('names a choice the whole-item bounds took out, and forgets one that is back', () => {
    const owner = {};
    const big = [offer('x', 4000), offer('y', 3000)];
    const out = reconcileTaskMaterialSelection(owner, big, new Set(['x', 'y']));
    expect(out.kept).toEqual(['x']);
    expect(out.removals).toEqual(['《y》已从所选中去掉：最多参考 4 份资料，合计不超过 6,000 字。']);
    expect(reconcileTaskMaterialSelection(owner, big, new Set(['y'])).removals).toEqual([]);
  });
  it('states an item size, or that a damaged index gives none', () => {
    expect(taskMaterialSizeText(offer('a', 1234))).toBe('已提取 1,234 字');
    expect(taskMaterialSizeText(offer('a', 0))).toBe('字数未知');
  });
});
