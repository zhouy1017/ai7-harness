import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import {
  FACTUAL_REVIEW_PROMPT_CONTRACT,
  FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST,
  FACTUAL_REVIEW_UNIT_RESULT_SCHEMA,
  buildFactualReviewUnitMessage,
  factualReviewMessageBlockIds,
  factualReviewRequestDigest,
  graphemeCount,
  locateQuotation,
  normalizedQuotation,
  parseFactualReviewUnitMessageHeader,
  parseFactualReviewUnitResult,
  sliceGraphemes,
} from '../../src/service/analysis/factual-review-contract.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, parseUnitMessageHeader } from '../../src/service/analysis/contract.js';
import { FACTUAL_ASSERTION_CATEGORIES } from '../../src/shared/protocol.js';

// Synthetic text only. The Factual Review Contract's job here is to admit exactly the unit results
// its schema describes, to be told apart from the baseline contract by its header alone, and to
// locate a quotation in a block deterministically — or to refuse to, which is the same guarantee.

function block(name: string, position: number, text: string, kind: ManifestBlockInput['kind'] = 'paragraph'): ManifestBlockInput {
  return {
    blockId: `blk_${createHash('sha256').update(`factual-${name}-${position}`).digest('hex').slice(0, 24)}`,
    position,
    kind,
    level: kind === 'heading' ? 1 : null,
    text,
    digest: createHash('sha256').update(`${kind}:${text}`).digest('hex'),
    graphemes: [...text].length,
  };
}

const blocks = [
  block('h', 1, '合成标题', 'heading'),
  block('a', 2, '合成正文甲，用于契约测试。'),
  block('b', 3, '合成正文乙，用于契约测试。'),
];

const manifest = deriveCoverageManifest({
  bookId: randomUUID(),
  manuscriptId: randomUUID(),
  branchId: randomUUID(),
  revisionId: randomUUID(),
  revisionLabel: 'r1',
  revisionDigest: 'c'.repeat(64),
  blocks,
});
const unit = manifest.units[0]!;
const blocksById = new Map(blocks.map((entry) => [entry.blockId, entry] as const));

function assertion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quote: '合成正文甲',
    blockOrdinal: 2,
    assertionClass: 'real-world-fact',
    category: '史实',
    severity: 'B',
    question: '这条断言是否与公开记录一致？',
    basis: '断言指向一个可对照公开记录核查的陈述。',
    ...overrides,
  };
}

function unitResult(assertions: ReadonlyArray<Record<string, unknown>>, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, assertions, ...overrides });
}

const expected = { unitOrdinal: unit.ordinal, blockCount: factualReviewMessageBlockIds(unit).length };

describe('the factual review unit message', () => {
  it('is told from a baseline unit message by its header alone', () => {
    const message = buildFactualReviewUnitMessage(unit, manifest.units.length, blocksById);
    const header = parseFactualReviewUnitMessageHeader(message);
    expect(header).toEqual({ ordinal: unit.ordinal, total: manifest.units.length, unitDigest: unit.digest });
    // The baseline parser must not claim it, and this parser must not claim the baseline's.
    expect(parseUnitMessageHeader(message)).toBeNull();
    expect(parseFactualReviewUnitMessageHeader(`分析单元 1/1 · 单元摘要 ${unit.digest}`)).toBeNull();
    expect(message.startsWith(`事实核查单元 ${unit.ordinal}/${manifest.units.length} · 单元摘要 ${unit.digest}`)).toBe(true);
  });

  it('lists the overlap context before the own blocks, which is the order block ordinals count in', () => {
    const message = buildFactualReviewUnitMessage(unit, manifest.units.length, blocksById);
    const ids = factualReviewMessageBlockIds(unit);
    expect(ids).toEqual([...unit.overlapBlockIds, ...unit.blockIds]);
    for (const [index, blockId] of ids.entries()) {
      expect(message.indexOf(`[${blockId}]`)).toBeGreaterThan(index === 0 ? 0 : message.indexOf(`[${ids[index - 1]!}]`));
    }
  });

  it(`keys its request digest by its own frozen contract, never the baseline kind's`, () => {
    const digest = factualReviewRequestDigest(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toBe(factualReviewRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest));
    expect(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST).not.toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
  });

  it('freezes a system prompt that names the closed category set and forbids fetching evidence', () => {
    for (const category of FACTUAL_ASSERTION_CATEGORIES) {
      expect(FACTUAL_REVIEW_PROMPT_CONTRACT.systemPrompt).toContain(category);
    }
    expect(FACTUAL_REVIEW_PROMPT_CONTRACT.systemPrompt).toContain('不调用任何工具');
    expect(FACTUAL_REVIEW_PROMPT_CONTRACT.systemPrompt).toContain('逐字引文');
  });
});

describe('the factual review unit result parser', () => {
  it('admits a well-formed unit result and canonicalizes it', () => {
    const parsed = parseFactualReviewUnitResult(unitResult([assertion()]), expected);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.assertions).toHaveLength(1);
    expect(parsed.result.assertions[0]!.category).toBe('史实');
    expect(parsed.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.canonicalJson.startsWith('{"assertions"')).toBe(true);
  });

  it('admits a fenced answer, as the baseline parser does', () => {
    expect(parseFactualReviewUnitResult('```json\n' + unitResult([assertion()]) + '\n```', expected).ok).toBe(true);
  });

  it('admits a unit with no checkable assertion at all', () => {
    const parsed = parseFactualReviewUnitResult(unitResult([]), expected);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.result.assertions).toEqual([]);
  });

  it(`refuses with the unit parser's own codes`, () => {
    expect(parseFactualReviewUnitResult('not json', expected)).toMatchObject({ ok: false, code: 'not-json' });
    expect(parseFactualReviewUnitResult(JSON.stringify({ schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal }), expected))
      .toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseFactualReviewUnitResult(unitResult([assertion()], { schema: 'ai7.baseline-manuscript-analysis.unit-result/1' }), expected))
      .toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseFactualReviewUnitResult(JSON.stringify({ schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal + 7, assertions: [] }), expected))
      .toMatchObject({ ok: false, code: 'unit-mismatch' });
  });

  it('refuses a class, a category, or a tier outside its closed set', () => {
    expect(parseFactualReviewUnitResult(unitResult([assertion({ assertionClass: 'guess' })]), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseFactualReviewUnitResult(unitResult([assertion({ category: '天气' })]), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseFactualReviewUnitResult(unitResult([assertion({ severity: 'D' })]), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseFactualReviewUnitResult(unitResult([assertion({ mood: 'extra' })]), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('refuses a quotation, question, or basis past its grapheme bound', () => {
    expect(parseFactualReviewUnitResult(unitResult([assertion({ quote: '甲'.repeat(81) })]), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseFactualReviewUnitResult(unitResult([assertion({ quote: '甲'.repeat(80) })]), expected).ok).toBe(true);
    expect(parseFactualReviewUnitResult(unitResult([assertion({ question: '问'.repeat(121) })]), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseFactualReviewUnitResult(unitResult([assertion({ basis: '据'.repeat(201) })]), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseFactualReviewUnitResult(unitResult([assertion({ quote: '   ' })]), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('refuses `quote-not-in-block` when the named block is not one the unit listed', () => {
    expect(parseFactualReviewUnitResult(unitResult([assertion({ blockOrdinal: expected.blockCount + 1 })]), expected))
      .toMatchObject({ ok: false, code: 'quote-not-in-block' });
    // A block the unit does list is a parse success even before Reference Integrity looks at it: a
    // quotation that is not found there is excluded with its reason, never a refused unit result.
    expect(parseFactualReviewUnitResult(unitResult([assertion({ quote: '不在任何内容块中的引文' })]), expected).ok).toBe(true);
  });
});

describe('reference integrity: locating a quotation in the block it names', () => {
  it('verifies a quotation that occurs exactly once and returns its exact grapheme range', () => {
    const text = '甲乙丙丁戊己庚辛';
    const located = locateQuotation(text, '丙丁戊');
    expect(located).toEqual({ state: 'verified', fromGrapheme: 2, toGrapheme: 5 });
    if (located.state !== 'verified') return;
    expect(sliceGraphemes(text, located.fromGrapheme, located.toGrapheme)).toBe('丙丁戊');
  });

  it('equates full-width and half-width ASCII, and nothing else', () => {
    const located = locateQuotation('民国２６年（１９３７）秋', '26年（1937）');
    expect(located.state).toBe('verified');
    if (located.state !== 'verified') return;
    // The range is the block's own graphemes, so slicing it returns the block's full-width form.
    expect(sliceGraphemes('民国２６年（１９３７）秋', located.fromGrapheme, located.toGrapheme)).toBe('２６年（１９３７）');
    // A changed character is not an exact quotation, however close it looks.
    expect(locateQuotation('民国二六年', '民国26年').state).toBe('not-found');
    expect(locateQuotation('甲乙丙', '甲丙').state).toBe('not-found');
  });

  it(`collapses whitespace runs and trims the ends, and keeps the range over the block's own graphemes`, () => {
    const text = '甲乙  丙丁\t戊';
    const located = locateQuotation(text, ' 乙 丙丁 戊 ');
    expect(located.state).toBe('verified');
    if (located.state !== 'verified') return;
    expect(sliceGraphemes(text, located.fromGrapheme, located.toGrapheme)).toBe('乙  丙丁\t戊');
  });

  it('fails a quotation that is not there and one that is there twice', () => {
    expect(locateQuotation('甲乙丙', '丁戊')).toEqual({ state: 'not-found' });
    expect(locateQuotation('甲乙甲乙丙', '甲乙')).toMatchObject({ state: 'ambiguous', occurrences: 2 });
    // Overlapping occurrences are two places the quotation could have come from, and so ambiguous.
    expect(locateQuotation('甲甲甲', '甲甲')).toMatchObject({ state: 'ambiguous', occurrences: 2 });
    expect(locateQuotation('甲乙丙', '   ')).toEqual({ state: 'not-found' });
  });

  it('merges duplicates by the folded quotation and counts graphemes, not code units', () => {
    expect(normalizedQuotation('民国 ２６ 年')).toBe(normalizedQuotation('民国 26 年'));
    expect(normalizedQuotation('甲  乙')).toBe('甲 乙');
    expect(graphemeCount('👩‍👩‍👧‍👦')).toBe(1);
    expect(graphemeCount('民国26年')).toBe(5);
  });
});
