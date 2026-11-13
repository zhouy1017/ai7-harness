import { reviewFindingHasGuessedAnchor } from '../../src/shared/review-basis.js';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  reviewCategoryBasis,
  reviewCategoryConfigurationDigest,
  reviewCategoryContractInput,
  reviewCategoryEntry,
  type ReviewCategoryConfiguration,
  type ReviewCategoryConfigurationEntry,
} from '../../src/service/review/category-configuration.js';
import {
  REVIEW_CATEGORY_UNIT_RESULT_SCHEMA,
  parseReviewCategoryUnitMessageHeader,
  parseReviewCategoryUnitResult,
  reviewCategoryContract,
  reviewCategoryContractDigest,
  reviewCategoryRequestDigest,
  type ReviewCategoryContractInput,
} from '../../src/service/review/review-category-contract.js';
import { REVIEW_CATEGORY_REDUCER_DESCRIPTOR, REVIEW_CATEGORY_REDUCER_DIGEST, reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  MAX_REVIEW_CATEGORY_GOAL_LENGTH,
  REVIEW_CATEGORY_TASK_MODES,
  isReviewCategoryKindId,
  reviewCategoryIdOfKind,
  reviewCategoryModeGoal,
} from '../../src/shared/protocol.js';

// The Editorial Review Contract and the built-in category configuration it is built from (Issue #417).
// Everything here is the categories' own configuration and synthetic unit results; no manuscript text.

function entry(categoryId: string): ReviewCategoryConfigurationEntry {
  const found = reviewCategoryEntry(categoryId);
  if (found === null) throw new Error(categoryId);
  return found;
}

const TYPOS = reviewCategoryContractInput(entry('typos-and-usage'));
const STYLE = reviewCategoryContractInput(entry('style-and-format'));

describe('the built-in review categories', () => {
  it('pins UTF-16 anchoring and exact grapheme slices separately from historical reductions (#1022)', () => {
    const { sourceRangeMapping, ...historical } = REVIEW_CATEGORY_REDUCER_DESCRIPTOR;
    expect(sourceRangeMapping).toBe('folded-utf16-code-units-to-source-graphemes');
    const { sourceRangeIntegrity, ...beforeSliceCheck } = REVIEW_CATEGORY_REDUCER_DESCRIPTOR;
    expect(sourceRangeIntegrity).toBe('sole-candidate-normalized-grapheme-slice-equals-quotation');
    expect(REVIEW_CATEGORY_REDUCER_DIGEST).not.toBe(sha256Hex(canonicalJson(beforeSliceCheck)));
    expect(REVIEW_CATEGORY_REDUCER_DIGEST).not.toBe(sha256Hex(canonicalJson(historical)));
    expect(reviewCategoryKindDefinition(TYPOS).reducerDigest).toBe(REVIEW_CATEGORY_REDUCER_DIGEST);
  });

  it('are the nine of the specification, in its order', () => {
    expect(BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.map((category) => category.label)).toEqual([
      '错别字与规范用语', '体例与格式', '情节逻辑与前后一致', '事实核查', '学术道德与引用', '出版政策与风险', '文学性与表达改进', '书系一致性', '跨交付物一致性',
    ]);
  });

  it('state what each yields and how it runs (V2-UX-REV-003, REV-006, REV-010, REV-011, REV-013)', () => {
    const by = (predicate: (category: ReviewCategoryConfigurationEntry) => boolean): string[] =>
      BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.filter(predicate).map((category) => category.categoryId);
    expect(by((category) => category.output === 'change-suggestion')).toEqual(['typos-and-usage', 'literary-expression']);
    expect(by((category) => category.batchApply)).toEqual(['typos-and-usage']);
    expect(by((category) => category.riskPointsOnly)).toEqual(['academic-integrity', 'publication-risk']);
    expect(by((category) => category.searchEngine)).toEqual(['factual-review', 'academic-integrity']);
    expect(by((category) => category.executor === 'baseline-leads')).toEqual([]);
    expect(by((category) => category.crossChapter !== undefined)).toEqual(['style-and-format', 'plot-consistency']);
    expect(by((category) => category.executor === 'factual-review-kind')).toEqual(['factual-review']);
    expect(by((category) => category.executor === 'unavailable')).toEqual(['cross-deliverable-consistency']);
    // 书系一致性 is the house's until resolved for one Book from the Series Knowledge of its Series (Issue #64, S29a).
    expect(by((category) => category.executor === 'series-knowledge')).toEqual(['series-consistency']);
    expect(entry('series-consistency').unavailableReason).toBeNull();
    expect(entry('cross-deliverable-consistency').unavailableReason).toBe('这本书还没有编辑交付物；有了交付物后才能选。');
    expect(BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.filter((category) => category.executor !== 'unavailable')
      .every((category) => category.unavailableReason === null)).toBe(true);
  });

  it('give every category the contract executes a valid frozen contract, and only those', () => {
    for (const category of BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories) {
      if (category.executor !== 'review-category-contract') {
        expect(() => reviewCategoryContractInput(category)).toThrow('REVIEW_CATEGORY_NOT_CONTRACT_EXECUTED');
        continue;
      }
      const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(category));
      expect(definition.kind).toBe(`editorial-review/${category.categoryId}`);
      expect(isReviewCategoryKindId(definition.kind)).toBe(true);
      expect(reviewCategoryIdOfKind(definition.kind)).toBe(category.categoryId);
      // A risk point is something a person must look at: the frozen prompt forbids every verdict.
      expect(definition.systemPrompt.includes('不得给出合规、抄袭、政策或法律结论')).toBe(category.riskPointsOnly);
    }
  });

  it('state their basis once, search-engine use included (V2-UX-REV-010, REV-012)', () => {
    expect(reviewCategoryBasis(entry('typos-and-usage'))).toMatchObject({
      guidelineDocuments: [{ title: '文字规范条款', issuer: 'AI7 内置默认', version: '1' }],
      procedure: { title: '错别字与规范用语审阅工序', version: '1' }, searchEngine: false,
    });
    expect(reviewCategoryBasis(entry('academic-integrity')).searchEngine).toBe(true);
    expect(reviewCategoryBasis(entry('plot-consistency')).procedure.version).toBe('2');
    expect(reviewCategoryBasis(entry('series-consistency'))).toMatchObject({ executor: 'series-knowledge', guidelineDocuments: [], procedure: { title: '书系一致性检查', version: '1' } });
  });

  it('are digested whole, so a Review Run that snapshots the digest names the exact configuration it used', () => {
    const digest = reviewCategoryConfigurationDigest();
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(reviewCategoryConfigurationDigest()).toBe(digest);
    const changed = structuredClone(BUILTIN_REVIEW_CATEGORY_CONFIGURATION) as { -readonly [K in keyof ReviewCategoryConfiguration]: ReviewCategoryConfiguration[K] };
    changed.version = 'next';
    expect(reviewCategoryConfigurationDigest(changed)).not.toBe(digest);
  });

  it('keep every mode goal of every category inside the durable bound', () => {
    for (const category of BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories) {
      for (const mode of REVIEW_CATEGORY_TASK_MODES) {
        expect(reviewCategoryModeGoal(category.label, mode).length).toBeLessThanOrEqual(MAX_REVIEW_CATEGORY_GOAL_LENGTH);
      }
    }
  });
});

describe('the Editorial Review Contract', () => {
  it('binds its digest to every clause, so a changed clause never inherits an earlier unit result', () => {
    const digest = reviewCategoryContractDigest(reviewCategoryContract(TYPOS));
    const edited: ReviewCategoryContractInput = { ...TYPOS, clauses: TYPOS.clauses.map((clause, index) => (index === 0 ? { ...clause, text: `${clause.text}另加一句。` } : clause)) };
    expect(reviewCategoryContractDigest(reviewCategoryContract(edited))).not.toBe(digest);
    expect(reviewCategoryContractDigest(reviewCategoryContract(TYPOS))).toBe(digest);
  });

  it('refuses a category it cannot honour', () => {
    expect(() => reviewCategoryContract({ ...STYLE, riskPointsOnly: true, output: 'change-suggestion' })).toThrow();
    expect(() => reviewCategoryContract({ ...STYLE, clauses: [STYLE.clauses[0]!, STYLE.clauses[0]!] })).toThrow();
    expect(() => reviewCategoryContract({ ...STYLE, label: '「体例」' })).toThrow();
    expect(() => reviewCategoryContract({ ...STYLE, categoryId: 'Style' })).toThrow();
    expect(() => reviewCategoryContract({ ...STYLE, clauses: [] })).toThrow();
  });

  it('reads its own unit message header and no other category’s', () => {
    const unitDigest = 'a'.repeat(64);
    const header = `审阅单元 2/8 · 类别 typos-and-usage · 单元摘要 ${unitDigest}\n以下为本单元需要审阅的内容块：`;
    expect(parseReviewCategoryUnitMessageHeader(header)).toEqual({ ordinal: 2, total: 8, categoryId: 'typos-and-usage', unitDigest });
    expect(parseReviewCategoryUnitMessageHeader(`审阅单元 9/8 · 类别 typos-and-usage · 单元摘要 ${unitDigest}`)).toBeNull();
    expect(parseReviewCategoryUnitMessageHeader(`事实核查单元 2/8 · 单元摘要 ${unitDigest}`)).toBeNull();
    expect(reviewCategoryKindDefinition(TYPOS).parseUnitMessageHeader(header)).toEqual({ ordinal: 2, total: 8, unitDigest });
    expect(reviewCategoryKindDefinition(STYLE).parseUnitMessageHeader(header)).toBeNull();
    expect(reviewCategoryRequestDigest('b'.repeat(64), 'typos-and-usage', 2, unitDigest))
      .not.toBe(reviewCategoryRequestDigest('b'.repeat(64), 'style-and-format', 2, unitDigest));
  });
});

describe('a review unit result', () => {
  const suggestion = { version: 1 as const, unitOrdinal: 3, blockCount: 4, output: 'change-suggestion' as const, clauseIds: ['typos-and-usage/1'] };
  const annotation = { version: 1 as const, unitOrdinal: 3, blockCount: 4, output: 'annotation' as const, clauseIds: ['style-and-format/1'] };
  const body = (findings: unknown[], extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: 3, findings, ...extra });
  const finding = { quote: '合成的引文', blockOrdinal: 2, severity: 'must', note: '合成的说明。' };

  it('parses a 修改建议 finding with its replacement, and a 批注 finding without one', () => {
    const parsed = parseReviewCategoryUnitResult(body([{ ...finding, replacement: '合成的改文', clauseId: 'typos-and-usage/1' }]), suggestion);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result.findings).toEqual([{ ...finding, replacement: '合成的改文', clauseId: 'typos-and-usage/1' }]);
      expect(parsed.digest).toMatch(/^[0-9a-f]{64}$/u);
    }
    expect(parseReviewCategoryUnitResult(body([finding]), annotation).ok).toBe(true);
    // An empty replacement proposes deleting the quotation; a fenced answer is read as its body.
    expect(parseReviewCategoryUnitResult(body([{ ...finding, replacement: '' }]), suggestion).ok).toBe(true);
    expect(parseReviewCategoryUnitResult(`\`\`\`json\n${body([])}\n\`\`\``, suggestion).ok).toBe(true);
  });

  it('uses the per-finding path for v1 and keeps strict ordinal and quote bounds', () => {
    const good = { ...finding, replacement: '改文' };
    const parsed = parseReviewCategoryUnitResult('说明```JSON\n' + body([good,
      { ...good, blockOrdinal: 5 }, { ...good, quote: '字'.repeat(81) },
      { ...good, blockOrdinal: '2', severity: 'critical', replacement: finding.quote, clauseId: 'unknown', extra: true }], { schema: 'other', unitOrdinal: 99 }) + '\n```结束', suggestion);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.findings).toEqual([good, { ...finding, clauseId: null }]);
    expect(parsed.result.unitOrdinal).toBe(3);
    expect(parsed.result.rejected!.map((entry) => entry.index)).toEqual([1, 2]);
    expect(parsed.result.salvaged).toEqual(expect.arrayContaining([expect.objectContaining({ index: 3, reason: 'replacement-annotation' })]));
    const partial = parseReviewCategoryUnitResult(body([good]).slice(0, -2) + ',{"note":', suggestion);
    expect(partial.ok && partial.result.findings).toEqual([good]);
    expect(parseReviewCategoryUnitResult('not json', annotation).ok).toBe(false);
  });
});


describe('review contract v2 tolerance', () => {
  it.each([1, 2] as const)('closes v%i with every parsed finding visibly rejected', (version) => {
    const findings = [null, { quote: '合成引文', blockOrdinal: 99, severity: 'should', note: '合成说明' }];
    const parsed = parseReviewCategoryUnitResult(JSON.stringify({ schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: 1, findings }),
      { version, unitOrdinal: 1, blockCount: 2, output: 'annotation', clauseIds: [] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.findings).toEqual([]);
    expect(parsed.result.acceptedIndexes).toEqual([]);
    expect(parsed.result.rejected).toEqual([
      { index: 0, reasonCode: 'schema-invalid', text: JSON.stringify(findings[0]) },
      { index: 1, reasonCode: 'quote-not-in-block', text: JSON.stringify(findings[1]) },
    ]);
  });

  it('preserves valid siblings and the complete rejected JSON with original indexes', () => {
    const finding = { quote: '合成引文', blockOrdinal: 1, severity: 'should', note: '合成说明', replacement: '合成改文' };
    const bad = { ...finding, replacement: finding.quote };
    const parsed = parseReviewCategoryUnitResult(JSON.stringify({ schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: 1,
      findings: [finding, bad, null, { ...finding, blockOrdinal: 99 }, finding] }),
      { unitOrdinal: 1, blockCount: 2, output: 'change-suggestion', clauseIds: [] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.accepted).toEqual([finding, { quote: finding.quote, blockOrdinal: 1, severity: 'should', note: finding.note }, finding]);
    expect(parsed.result.acceptedIndexes).toEqual([0, 1, 4]);
    expect(parsed.rejected!.map((entry) => [entry.index, entry.reasonCode])).toEqual([[2, 'schema-invalid'], [3, 'quote-not-in-block']]);
    expect(JSON.parse(parsed.rejected![0]!.text)).toBeNull();
  });
  it('numbers overlap and own blocks continuously while keeping v1 bytes available', () => {
    const definition = reviewCategoryKindDefinition(TYPOS);
    const ids = ['blk_' + 'a'.repeat(24), 'blk_' + 'b'.repeat(24)];
    const blocks = new Map(ids.map((blockId) => [blockId, { blockId, kind: 'paragraph' as const, level: null, text: '合成段落' }]));
    const unit = { ordinal: 2, sectionOrdinal: 1, subUnitIndex: 1, subUnitCount: 1, headingBlockId: null, headingText: null, headingLevel: null, blockDigests: ['b'.repeat(64)], digest: 'a'.repeat(64), overlapBlockIds: [ids[0]!], blockIds: [ids[1]!], startPosition: 2, endPosition: 2, graphemes: 4 };
    const message = definition.buildUnitMessage(unit, 2, blocks);
    expect(message).toContain(`[1] [${ids[0]}] (paragraph)`);
    expect(message).toContain(`[2] [${ids[1]}] (paragraph)`);
    expect(definition.systemPrompt).toContain('照抄该块开头的数字 n');
    const legacy = reviewCategoryKindDefinition(TYPOS, 1);
    expect(legacy.buildUnitMessage(unit, 2, blocks)).not.toContain('[1] [');
    expect(legacy.systemPrompt).toContain('ai7.editorial-review.unit-result/1');
    expect(legacy.promptContractDigest).not.toBe(definition.promptContractDigest);
  });
});

it.each([undefined, 2, 0, 1.5, '2', 99])('admits optional occurrence without losing a finding (%s)', (occurrence) => {
  const parsed = parseReviewCategoryUnitResult(JSON.stringify({ schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: 1,
    findings: [{ quote: '目标', blockOrdinal: 1, occurrence, severity: 'should', note: '合成建议。', replacement: '替换' }] }),
    { unitOrdinal: 1, blockCount: 1, output: 'change-suggestion', clauseIds: [] });
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.result.findings[0]).toMatchObject({ quote: '目标', replacement: '替换',
    ...(typeof occurrence === 'number' && Number.isInteger(occurrence) && occurrence > 0 ? { occurrence } : {}) });
});

it('keeps the pre-#1435 frozen reducer digest byte-identical to base', () => {
  expect(REVIEW_CATEGORY_REDUCER_DIGEST).toBe('a8e818cb4afefbb4e0cff17b634b3a903fb5dc424c9f863e03fc8200c036a8df');
});

it.each([
  ['【锚点不唯一】合成建议', true], ['【未联网核查】【锚点不唯一】合成建议', true],
  ['【未联网核查】【锚点不唯一】（标点已与原稿对齐）合成建议', true],
  ['合成建议', false], ['【未联网核查】合成建议', false],
] as const)('classifies the stored review note %s', (note, guessed) => {
  expect(reviewFindingHasGuessedAnchor(note)).toBe(guessed);
});
