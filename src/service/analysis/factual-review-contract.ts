import type { CoverageManifestUnitProjection } from '../../shared/protocol.js';
import {
  FACTUAL_ASSERTION_CATEGORIES,
  FACTUAL_ASSERTION_CLASSES,
  FACTUAL_REVIEW_CONTRACT_VERSION,
  FACTUAL_REVIEW_EXPECTED_OUTCOME,
  FACTUAL_REVIEW_KIND,
  FACTUAL_REVIEW_MODE_GOALS,
  FACTUAL_REVIEW_MODE_LABELS,
  FACTUAL_REVIEW_MODE_MEANINGS,
  FACTUAL_REVIEW_TASK_GOAL,
  FACTUAL_REVIEW_TASK_MODES,
  FACTUAL_SEVERITY_TIERS,
  type FactualAssertionCategory,
  type FactualAssertionClass,
  type FactualReviewTaskMode,
  type FactualSeverityTier,
} from '../../shared/protocol.js';
import { DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, sha256Hex } from './canonical.js';
import type { ManifestBlockInput } from './coverage-manifest.js';

/**
 * Factual Review Contract v1: the product-built, exact-versioned DSH Analysis Contract for the
 * Manuscript Assertions of one Analysis Unit. One typed partial result per unit — every assertion a
 * reader could check against the world, each with its verbatim quotation, the block that quotation
 * comes from, its class in kick-in 17's two-axis model, a category from a closed set, a severity
 * tier, the verification question the model would ask, and the basis for asking it.
 *
 * The contract lists and classifies; it never verifies. Reference Integrity is decided here
 * deterministically against the committed block text ({@link locateQuotation}) and is the only anchor
 * a finding ever carries; Claim Support and Factual Verification need evidence this slice fetches
 * none of (ADR 0074, proposed), so they stay `未核查` and every verdict stays `未外部复核`.
 *
 * The prompt contract is frozen text of this kind alone. Its digest binds the Execution Binding and
 * the deterministic fixture key; it is deliberately not derived from the baseline kind's contract, so
 * that neither kind's frozen text can move the other kind's request digests.
 */
export const FACTUAL_REVIEW_UNIT_RESULT_SCHEMA = 'ai7.factual-review.unit-result/1' as const;
export const FACTUAL_REVIEW_PROMPT_CONTRACT_SCHEMA = 'ai7.factual-review.prompt-contract/1' as const;
export const FACTUAL_REVIEW_RESULT_SET_REVISION_SCHEMA = 'ai7.factual-review.result-set-revision/1' as const;
export const FACTUAL_REVIEW_SUCCESSOR_REVISION_SCHEMA = 'ai7.factual-review.result-set-revision/2' as const;

export {
  FACTUAL_REVIEW_CONTRACT_VERSION,
  FACTUAL_REVIEW_EXPECTED_OUTCOME,
  FACTUAL_REVIEW_KIND,
  FACTUAL_REVIEW_MODE_GOALS,
  FACTUAL_REVIEW_MODE_LABELS,
  FACTUAL_REVIEW_MODE_MEANINGS,
  FACTUAL_REVIEW_TASK_GOAL,
  FACTUAL_REVIEW_TASK_MODES,
};

const MAX_ASSERTIONS = 200;
const MAX_QUOTE_GRAPHEMES = 80;
const MAX_QUESTION_GRAPHEMES = 120;
const MAX_BASIS_GRAPHEMES = 200;
/** Graphemes, the unit every bound and every source range in this contract is measured in. */
const GRAPHEMES = new Intl.Segmenter('zh', { granularity: 'grapheme' });

export function goalForFactualReviewMode(mode: FactualReviewTaskMode): string {
  return FACTUAL_REVIEW_MODE_GOALS[mode];
}

/** One assertion exactly as the model listed it, before Reference Integrity has looked at it. */
export interface FactualUnitAssertion {
  readonly quote: string;
  /** 1-based over the unit's blocks in message order: the overlap blocks first, then the own blocks. */
  readonly blockOrdinal: number;
  readonly assertionClass: FactualAssertionClass;
  readonly category: FactualAssertionCategory;
  readonly severity: FactualSeverityTier;
  readonly question: string;
  readonly basis: string;
}

export interface FactualReviewUnitResult {
  readonly schema: typeof FACTUAL_REVIEW_UNIT_RESULT_SCHEMA;
  readonly unitOrdinal: number;
  readonly assertions: ReadonlyArray<FactualUnitAssertion>;
}

/**
 * Why a unit result did not parse. The first three are the unit parser's own codes; `quote-not-in-block`
 * is this contract's: an assertion named a block ordinal the unit's message never listed, so there is
 * no block text in which its quotation could be sought at all. A quotation that names a real block and
 * is not found there — or is found twice — is not a parse failure: the assertion is recorded and
 * excluded by Reference Integrity with its reason (decision 4).
 */
export type FactualUnitResultParseFailureCode = 'not-json' | 'schema-invalid' | 'unit-mismatch' | 'quote-not-in-block';

export type FactualUnitResultParse =
  | { ok: true; result: FactualReviewUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: FactualUnitResultParseFailureCode; detail: string };

export function graphemeCount(text: string): number {
  let count = 0;
  for (const _segment of GRAPHEMES.segment(text)) count += 1;
  return count;
}

function boundedText(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= maximumGraphemes;
}

export function parseFactualReviewUnitResult(
  text: string,
  expected: { unitOrdinal: number; blockCount: number },
): FactualUnitResultParse {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text);
  const body = fenced?.[1] ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  }
  const invalid = (detail: string): FactualUnitResultParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['schema', 'unitOrdinal', 'assertions'])) {
    return invalid('单元结果键集合不符合事实核查契约 v1。');
  }
  if (parsed.schema !== FACTUAL_REVIEW_UNIT_RESULT_SCHEMA) return invalid('单元结果 schema 不是事实核查契约 v1。');
  if (!Number.isSafeInteger(parsed.unitOrdinal) || (parsed.unitOrdinal as number) < 1) return invalid('单元序号无效。');
  if (parsed.unitOrdinal !== expected.unitOrdinal) {
    return {
      ok: false,
      code: 'unit-mismatch',
      detail: `单元结果声明的序号 ${String(parsed.unitOrdinal)} 与请求单元 ${expected.unitOrdinal} 不一致。`,
    };
  }
  if (!Array.isArray(parsed.assertions) || parsed.assertions.length > MAX_ASSERTIONS) return invalid('断言集合不符合事实核查契约 v1。');
  const assertions: FactualUnitAssertion[] = [];
  for (const candidate of parsed.assertions) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['quote', 'blockOrdinal', 'assertionClass', 'category', 'severity', 'question', 'basis'])) {
      return invalid('断言键集合不符合事实核查契约 v1。');
    }
    if (!boundedText(candidate.quote, MAX_QUOTE_GRAPHEMES)) return invalid('引文缺失或超出 80 字素边界。');
    if (!Number.isSafeInteger(candidate.blockOrdinal) || (candidate.blockOrdinal as number) < 1) return invalid('断言的内容块序号无效。');
    if (!FACTUAL_ASSERTION_CLASSES.includes(candidate.assertionClass as FactualAssertionClass)) return invalid('断言类别不在闭合集合内。');
    if (!FACTUAL_ASSERTION_CATEGORIES.includes(candidate.category as FactualAssertionCategory)) return invalid('断言主题不在闭合集合内。');
    if (!FACTUAL_SEVERITY_TIERS.includes(candidate.severity as FactualSeverityTier)) return invalid('断言分级不在闭合集合内。');
    if (!boundedText(candidate.question, MAX_QUESTION_GRAPHEMES)) return invalid('核查问题缺失或超出 120 字素边界。');
    if (!boundedText(candidate.basis, MAX_BASIS_GRAPHEMES)) return invalid('依据缺失或超出 200 字素边界。');
    if ((candidate.blockOrdinal as number) > expected.blockCount) {
      return {
        ok: false,
        code: 'quote-not-in-block',
        detail: `断言引用的内容块序号 ${String(candidate.blockOrdinal)} 不在本单元列出的 ${expected.blockCount} 个内容块内。`,
      };
    }
    assertions.push({
      quote: candidate.quote,
      blockOrdinal: candidate.blockOrdinal as number,
      assertionClass: candidate.assertionClass as FactualAssertionClass,
      category: candidate.category as FactualAssertionCategory,
      severity: candidate.severity as FactualSeverityTier,
      question: candidate.question,
      basis: candidate.basis,
    });
  }
  const result: FactualReviewUnitResult = { schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, unitOrdinal: expected.unitOrdinal, assertions };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}

/** The frozen prompt contract. Every field is model-facing text or a fixed format; none is manuscript content. */
export const FACTUAL_REVIEW_PROMPT_CONTRACT = {
  schema: FACTUAL_REVIEW_PROMPT_CONTRACT_SCHEMA,
  contractVersion: FACTUAL_REVIEW_CONTRACT_VERSION,
  responseSchema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA,
  systemPrompt: [
    '你是 AI7 的事实核查组件。你只处理用户消息中给出的一个分析单元，逐块阅读，列出其中每一条读者可以对照真实世界核查的断言。',
    '可核查断言包括：年代与日期、地点与行政区划、人物与身份、机构与官职、器物与工艺、数字与度量、明确归属于某来源的引文、史实陈述、技术陈述。',
    '不改写稿件、不给出修改建议、不下事实结论、不调用任何工具、不引用外部资料。你只负责列出断言并提出应当核查的问题。',
    '每条断言必须给出稿件中的逐字引文：原样复制，不加省略号、不合并、不改标点、不超过 80 字素，并指明该引文所在内容块的序号。',
    '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.factual-review.unit-result/1"）、unitOrdinal（与用户消息头部的单元序号一致）、assertions（数组）。',
    'assertions 的每一项精确包含以下键：quote（逐字引文）、blockOrdinal（内容块序号）、assertionClass、category、severity、question、basis。',
    'assertionClass 取 real-world-fact/quotation/report-about-manuscript/fictional-canon/judgment 之一：',
    'real-world-fact 是可对照真实世界核查的事实断言；quotation 是明确归属于某来源的引文；report-about-manuscript 是关于稿件自身叙述的陈述；',
    'fictional-canon 是仅在作品内部成立的虚构设定；judgment 是评价或判断。虚构作品中的虚构人物、地点与事件属于 fictional-canon，不是 real-world-fact。',
    'category 取 时间/地点/人物/机构/器物/数字/引文/史实/技术/其他 之一。',
    'severity 取 A/B/C 之一：A 表示若有误将直接损害稿件可信度，B 表示很可能需要核实，C 表示建议留意。',
    'question 是你若能检索外部资料会提出的核查问题，不超过 120 字素；basis 说明该断言为何可核查、你怀疑什么，不超过 200 字素。',
    '没有可核查断言的单元输出空数组。不要编造稿件中不存在的内容，也不要为凑数把评价或虚构设定列为事实断言。',
  ].join('\n'),
  unitMessageHeader: '事实核查单元 {ordinal}/{total} · 单元摘要 {unitDigest}',
  overlapHeader: '以下为承接上一单元的重叠上下文（仅供理解，不属于本单元的覆盖范围）：',
  ownHeader: '以下为本单元需要核查的内容块：',
  blockLine: '[{blockId}] ({kind}{level}) {text}',
} as const;

export const FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(FACTUAL_REVIEW_PROMPT_CONTRACT));

const HEADER_PATTERN = /^事实核查单元 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64})$/u;

function blockLine(block: Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>): string {
  return FACTUAL_REVIEW_PROMPT_CONTRACT.blockLine
    .replace('{blockId}', block.blockId)
    .replace('{kind}', block.kind)
    .replace('{level}', block.level === null ? '' : ` h${block.level}`)
    .replace('{text}', block.text);
}

/** The block identities of one unit in message order: the overlap context first, then the own blocks. */
export function factualReviewMessageBlockIds(unit: CoverageManifestUnitProjection): string[] {
  return [...unit.overlapBlockIds, ...unit.blockIds];
}

/** The exact user-role message for one Analysis Unit: header, optional overlap context, then own blocks. */
export function buildFactualReviewUnitMessage(
  unit: CoverageManifestUnitProjection,
  totalUnits: number,
  blocksById: ReadonlyMap<string, Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>>,
): string {
  const lines = [
    FACTUAL_REVIEW_PROMPT_CONTRACT.unitMessageHeader
      .replace('{ordinal}', String(unit.ordinal))
      .replace('{total}', String(totalUnits))
      .replace('{unitDigest}', unit.digest),
  ];
  if (unit.overlapBlockIds.length > 0) {
    lines.push(FACTUAL_REVIEW_PROMPT_CONTRACT.overlapHeader);
    for (const blockId of unit.overlapBlockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  }
  lines.push(FACTUAL_REVIEW_PROMPT_CONTRACT.ownHeader);
  for (const blockId of unit.blockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  return lines.join('\n');
}

function requireBlock<T>(blocksById: ReadonlyMap<string, T>, blockId: string): T {
  const block = blocksById.get(blockId);
  if (block === undefined) throw new Error('ANALYSIS_UNIT_BLOCK_MISSING');
  return block;
}

export interface FactualUnitMessageHeader {
  readonly ordinal: number;
  readonly total: number;
  readonly unitDigest: string;
}

/** Recover the unit identity from a message built by {@link buildFactualReviewUnitMessage}; `null` for anything else. */
export function parseFactualReviewUnitMessageHeader(text: string): FactualUnitMessageHeader | null {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = HEADER_PATTERN.exec(firstLine);
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal) return null;
  return { ordinal, total, unitDigest: match[3]! };
}

/**
 * The request digest a deterministic fixture is keyed by beside the unit ordinal. It is the same pure
 * function of prompt contract and manifest unit the baseline kind uses, taken over this kind's frozen
 * contract digest, so one fixture format serves both kinds and no fixture key changes shape.
 */
export function factualReviewRequestDigest(promptContractDigest: string, unitOrdinal: number, unitDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, unitOrdinal, unitDigest }));
}

// ---- Reference Integrity ------------------------------------------------------------------------

/**
 * Presentation-only folding of one grapheme, kick-in 17 rule 7. Exactly two equivalences are applied:
 * every full-width ASCII form (U+FF01–U+FF5E) folds onto its half-width original, and the ideographic
 * space folds onto a space, which the whitespace collapse below then handles. Nothing else moves — no
 * case folding, no NFKC over the wider compatibility ranges, no punctuation substitution — because a
 * changed character is not an exact quotation.
 */
function foldWidth(segment: string): string {
  let folded = '';
  for (const character of segment) {
    const code = character.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) folded += String.fromCodePoint(code - 0xfee0);
    else if (code === 0x3000) folded += ' ';
    else folded += character;
  }
  return folded;
}

const WHITESPACE = /^\s+$/u;

interface FoldedText {
  /** The folded characters, whitespace runs collapsed to one space and the ends trimmed. */
  readonly text: string;
  /** For each folded character, the first grapheme of the source that produced it. */
  readonly fromGrapheme: ReadonlyArray<number>;
  /** For each folded character, the last grapheme of the source that produced it. */
  readonly toGrapheme: ReadonlyArray<number>;
}

/**
 * Fold one text into the form quotations are compared in, keeping for every folded character the
 * exact graphemes of the source it came from. The map is what lets a match in the folded form be
 * reported as an exact grapheme range of the committed block, which is the only anchor a finding gets.
 */
function fold(text: string): FoldedText {
  const characters: string[] = [];
  const fromGrapheme: number[] = [];
  const toGrapheme: number[] = [];
  let graphemeIndex = 0;
  let pendingSpaceFrom: number | null = null;
  let pendingSpaceTo = 0;
  for (const { segment } of GRAPHEMES.segment(text)) {
    const index = graphemeIndex;
    graphemeIndex += 1;
    if (WHITESPACE.test(segment)) {
      // A whitespace run becomes at most one space, and only between two kept characters: leading and
      // trailing whitespace is dropped, which trims both the block text and the quotation.
      if (characters.length > 0) {
        pendingSpaceFrom ??= index;
        pendingSpaceTo = index;
      }
      continue;
    }
    if (pendingSpaceFrom !== null) {
      characters.push(' ');
      fromGrapheme.push(pendingSpaceFrom);
      toGrapheme.push(pendingSpaceTo);
      pendingSpaceFrom = null;
    }
    for (const character of foldWidth(segment)) {
      characters.push(character);
      fromGrapheme.push(index);
      toGrapheme.push(index);
    }
  }
  return { text: characters.join(''), fromGrapheme, toGrapheme };
}

/** Where a quotation sits in the block it named, or why it does not sit there exactly once. */
export type QuotationLocation =
  | { readonly state: 'verified'; readonly fromGrapheme: number; readonly toGrapheme: number }
  | { readonly state: 'not-found' }
  | { readonly state: 'ambiguous'; readonly occurrences: number };

/**
 * Locate one quotation in one committed block under the normalization above and return the exact
 * grapheme range of the block it occupies. Exactly one occurrence verifies; none, or more than one,
 * fails — an ambiguous anchor is no anchor, and the service never rewrites a quotation, shortens it,
 * or picks the first of several to make it match.
 */
export function locateQuotation(blockText: string, quote: string): QuotationLocation {
  const haystack = fold(blockText);
  const needle = fold(quote).text;
  if (needle.length === 0) return { state: 'not-found' };
  const starts: number[] = [];
  // Every start position, overlapping ones included: two occurrences that share characters are still
  // two places the quotation could have come from, and the anchor is ambiguous either way.
  for (let index = haystack.text.indexOf(needle); index !== -1; index = haystack.text.indexOf(needle, index + 1)) {
    starts.push(index);
  }
  if (starts.length === 0) return { state: 'not-found' };
  if (starts.length > 1) return { state: 'ambiguous', occurrences: starts.length };
  const start = starts[0]!;
  return {
    state: 'verified',
    fromGrapheme: haystack.fromGrapheme[start]!,
    toGrapheme: haystack.toGrapheme[start + needle.length - 1]! + 1,
  };
}

/** The comparison key duplicates are merged by: the folded form of the quotation (decision 5). */
export function normalizedQuotation(quote: string): string {
  return fold(quote).text;
}

/** The exact graphemes of a block a located range names; the service suite slices the block with it. */
export function sliceGraphemes(text: string, fromGrapheme: number, toGrapheme: number): string {
  let index = 0;
  let sliced = '';
  for (const { segment } of GRAPHEMES.segment(text)) {
    if (index >= fromGrapheme && index < toGrapheme) sliced += segment;
    index += 1;
  }
  return sliced;
}
