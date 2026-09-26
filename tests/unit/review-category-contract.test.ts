import { describe, expect, it } from 'vitest';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  reviewCategoryBasisStatement,
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
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
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
    expect(by((category) => category.executor === 'baseline-leads')).toEqual(['plot-consistency']);
    expect(by((category) => category.executor === 'factual-review-kind')).toEqual(['factual-review']);
    expect(by((category) => category.executor === 'unavailable')).toEqual(['series-consistency', 'cross-deliverable-consistency']);
    expect(entry('series-consistency').unavailableReason).toBe('这本书不在任何书系中；书系一致性审阅还没有接入书系知识，暂不能选。');
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
    expect(reviewCategoryBasisStatement(entry('typos-and-usage')))
      .toBe('依据：AI7 内置默认 · 文字规范条款（第 1 版） · 工序：错别字与规范用语审阅工序（第 1 版） · 不使用搜索引擎');
    expect(reviewCategoryBasisStatement(entry('academic-integrity')))
      .toBe('依据：AI7 内置默认 · 引用与学术规范条款（第 1 版） · 工序：引用风险点标注（第 1 版） · 会使用搜索引擎（外部核查接入前为「未联网核查」）');
    expect(reviewCategoryBasisStatement(entry('plot-consistency')))
      .toBe('依据：这本书最新的基线分析结果 · 工序：线索转批注（第 1 版） · 不调用模型，不使用搜索引擎');
    expect(reviewCategoryBasisStatement(entry('series-consistency'))).toBe('依据：书系知识 · 工序：书系一致性检查（第 1 版）');
  });

  it('are digested whole, so a Review Run that snapshots the digest names the exact configuration it used', () => {
    const digest = reviewCategoryConfigurationDigest();
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(reviewCategoryConfigurationDigest()).toBe(digest);
    const changed = structuredClone(BUILTIN_REVIEW_CATEGORY_CONFIGURATION) as { -readonly [K in keyof ReviewCategoryConfiguration]: ReviewCategoryConfiguration[K] };
    changed.version = '2';
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
  const suggestion = { unitOrdinal: 3, blockCount: 4, output: 'change-suggestion' as const, clauseIds: ['typos-and-usage/1'] };
  const annotation = { unitOrdinal: 3, blockCount: 4, output: 'annotation' as const, clauseIds: ['style-and-format/1'] };
  const body = (findings: unknown[], extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: 3, findings, ...extra });
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

  it('refuses a result that does not answer the category’s contract, with the reason why', () => {
    const code = (text: string, expected: typeof suggestion | typeof annotation): string | null => {
      const parsed = parseReviewCategoryUnitResult(text, expected);
      return parsed.ok ? null : parsed.code;
    };
    expect(code('不是 JSON', suggestion)).toBe('not-json');
    expect(code(body([], { extra: true }), suggestion)).toBe('schema-invalid');
    expect(code(JSON.stringify({ schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: 4, findings: [] }), suggestion)).toBe('unit-mismatch');
    expect(code(body([finding]), suggestion)).toBe('replacement-required');
    expect(code(body([{ ...finding, replacement: '合成的改文' }]), annotation)).toBe('replacement-refused');
    expect(code(body([{ ...finding, replacement: '合成的改文', clauseId: 'typos-and-usage/9' }]), suggestion)).toBe('clause-unknown');
    expect(code(body([{ ...finding, blockOrdinal: 5, replacement: '合成的改文' }]), suggestion)).toBe('quote-not-in-block');
    expect(code(body([{ ...finding, severity: 'critical', replacement: '合成的改文' }]), suggestion)).toBe('schema-invalid');
    expect(code(body([{ ...finding, replacement: finding.quote }]), suggestion)).toBe('schema-invalid');
    expect(code(body([{ ...finding, verdict: '合规' }]), annotation)).toBe('schema-invalid');
  });
});
