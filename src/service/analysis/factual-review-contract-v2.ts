import {
  EVIDENCE_LINEAGE_CLASSES,
  EVIDENCE_RELATIONS,
  FACTUAL_ASSERTION_CATEGORIES,
  FACTUAL_ASSERTION_CLASSES,
  FACTUAL_REVIEW_CONTRACT_VERSION,
  FACTUAL_SEVERITY_TIERS,
  MAX_CORRECTION_RATIONALE_GRAPHEMES,
  MAX_CORRECTION_TEXT_GRAPHEMES,
  type EvidenceAssuranceLevel,
  type EvidenceLineageClass,
  type EvidenceRelation,
  type FactualAssertionCategory,
  type FactualAssertionClass,
  type FactualSeverityTier,
} from '../../shared/protocol.js';
import { canonicalJson, hasExactKeys, isRecord, sha256Hex } from './canonical.js';
import { graphemeCount, type FactualUnitAssertion, type FactualUnitResultParse } from './factual-review-contract.js';

/**
 * Factual Review Contract v2 (Issue #901): the successor unit result of 事实核查 under 标准核查 and 严格核查. It is additive:
 * every assertion keeps the seven keys of v1 and gains `evidenceRelations`, what each source the unit's tools returned says of
 * it; and the result may carry `corrections`, at most three minimal Correction Variants for an assertion the evidence says is
 * wrong. Nothing in v1 moves — its prompt contract, its unit message and its request digests are byte for byte what they were,
 * and 快速整理 still runs v1 itself.
 *
 * A relation is the model's claim about a source and nothing more. Whether it counts is decided afterwards, deterministically:
 * only a source the Run actually captured, whose excerpt stands verbatim in what was captured (an exact fetch), may support or
 * contradict anything (V2-UX-EVID-004, EVID-005); every other relation is a candidate, `候选来源 · 尚未核对`. The variants are
 * words the editor may choose from, never evidence.
 */
export const FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA = 'ai7.factual-review.unit-result/2' as const;
export const FACTUAL_REVIEW_PROMPT_CONTRACT_V2_SCHEMA = 'ai7.factual-review.prompt-contract/2' as const;

const MAX_ASSERTIONS = 200;
const MAX_QUOTE_GRAPHEMES = 80;
const MAX_QUESTION_GRAPHEMES = 120;
const MAX_BASIS_GRAPHEMES = 200;
const MAX_EXCERPT_GRAPHEMES = 200;
const MAX_RELATIONS_PER_ASSERTION = 8;
const MAX_VARIANTS = 3;
const HTTPS_SOURCE = /^https:\/\/[^\s<>"'{}|\\^`]{1,2040}$/u;
const RETRIEVAL_SOURCE = /^retrieval:[0-9a-f]{64}$/u;

/** One source's relation to one assertion, exactly as the model wrote it, and — for an in-Book source — what Exact Fetch found. */
export interface FactualEvidenceRelation {
  readonly sourceRef: string;
  readonly relation: EvidenceRelation;
  readonly excerptRef: string | null;
  readonly lineage: EvidenceLineageClass | null;
  /**
   * Set by the execution owner, never by the model (the parser refuses the key): the exact in-Book source an excerpt of a
   * `retrieval:` relation was found in, or `null` when Exact Fetch did not find it there.
   */
  readonly exactFetch?: { readonly sourceKind: string; readonly sourceId: string; readonly digest: string } | null;
}

export interface FactualUnitAssertionV2 extends FactualUnitAssertion {
  readonly evidenceRelations: ReadonlyArray<FactualEvidenceRelation>;
}

export interface FactualCorrectionEntry {
  /** The assertion's 1-based position in the unit's `assertions`. */
  readonly assertionRef: number;
  readonly variants: ReadonlyArray<{ readonly text: string; readonly rationale: string }>;
}

export interface FactualReviewUnitResultV2 {
  readonly schema: typeof FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA;
  readonly unitOrdinal: number;
  readonly assertions: ReadonlyArray<FactualUnitAssertionV2>;
  readonly corrections: ReadonlyArray<FactualCorrectionEntry>;
}

function boundedText(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= maximumGraphemes;
}

function parseRelation(value: unknown): FactualEvidenceRelation | null {
  if (!isRecord(value) || !hasExactKeys(value, ['sourceRef', 'relation', 'excerptRef', 'lineage'])) return null;
  if (typeof value.sourceRef !== 'string' || !(HTTPS_SOURCE.test(value.sourceRef) || RETRIEVAL_SOURCE.test(value.sourceRef))) return null;
  if (!EVIDENCE_RELATIONS.includes(value.relation as EvidenceRelation)) return null;
  if (value.excerptRef !== null && !boundedText(value.excerptRef, MAX_EXCERPT_GRAPHEMES)) return null;
  if (value.lineage !== null && !EVIDENCE_LINEAGE_CLASSES.includes(value.lineage as EvidenceLineageClass)) return null;
  return {
    sourceRef: value.sourceRef,
    relation: value.relation as EvidenceRelation,
    excerptRef: value.excerptRef as string | null,
    lineage: value.lineage as EvidenceLineageClass | null,
  };
}

/** Parse one v2 unit result. The parse failure codes are v1's; a valid v1 answer is not a valid v2 answer. */
export function parseFactualReviewUnitResultV2(
  text: string,
  expected: { unitOrdinal: number; blockCount: number },
): FactualUnitResultParse | { ok: true; result: FactualReviewUnitResultV2; canonicalJson: string; digest: string } {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text);
  const body = fenced?.[1] ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  }
  const invalid = (detail: string): FactualUnitResultParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(parsed) || !(hasExactKeys(parsed, ['schema', 'unitOrdinal', 'assertions']) || hasExactKeys(parsed, ['schema', 'unitOrdinal', 'assertions', 'corrections']))) {
    return invalid('单元结果键集合不符合事实核查契约 v2。');
  }
  if (parsed.schema !== FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA) return invalid('单元结果 schema 不是事实核查契约 v2。');
  if (!Number.isSafeInteger(parsed.unitOrdinal) || (parsed.unitOrdinal as number) < 1) return invalid('单元序号无效。');
  if (parsed.unitOrdinal !== expected.unitOrdinal) {
    return { ok: false, code: 'unit-mismatch', detail: `单元结果声明的序号 ${String(parsed.unitOrdinal)} 与请求单元 ${expected.unitOrdinal} 不一致。` };
  }
  if (!Array.isArray(parsed.assertions) || parsed.assertions.length > MAX_ASSERTIONS) return invalid('断言集合不符合事实核查契约 v2。');
  const assertions: FactualUnitAssertionV2[] = [];
  for (const candidate of parsed.assertions) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['quote', 'blockOrdinal', 'assertionClass', 'category', 'severity', 'question', 'basis', 'evidenceRelations'])) {
      return invalid('断言键集合不符合事实核查契约 v2。');
    }
    if (!boundedText(candidate.quote, MAX_QUOTE_GRAPHEMES)) return invalid('引文缺失或超出 80 字素边界。');
    if (!Number.isSafeInteger(candidate.blockOrdinal) || (candidate.blockOrdinal as number) < 1) return invalid('断言的内容块序号无效。');
    if (!FACTUAL_ASSERTION_CLASSES.includes(candidate.assertionClass as FactualAssertionClass)) return invalid('断言类别不在闭合集合内。');
    if (!FACTUAL_ASSERTION_CATEGORIES.includes(candidate.category as FactualAssertionCategory)) return invalid('断言主题不在闭合集合内。');
    if (!FACTUAL_SEVERITY_TIERS.includes(candidate.severity as FactualSeverityTier)) return invalid('断言分级不在闭合集合内。');
    if (!boundedText(candidate.question, MAX_QUESTION_GRAPHEMES)) return invalid('核查问题缺失或超出 120 字素边界。');
    if (!boundedText(candidate.basis, MAX_BASIS_GRAPHEMES)) return invalid('依据缺失或超出 200 字素边界。');
    if (!Array.isArray(candidate.evidenceRelations) || candidate.evidenceRelations.length > MAX_RELATIONS_PER_ASSERTION) return invalid('证据关系集合不符合事实核查契约 v2。');
    const relations: FactualEvidenceRelation[] = [];
    for (const entry of candidate.evidenceRelations) {
      const relation = parseRelation(entry);
      if (relation === null) return invalid('证据关系不符合事实核查契约 v2。');
      relations.push(relation);
    }
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
      evidenceRelations: relations,
    });
  }
  const corrections: FactualCorrectionEntry[] = [];
  if (Object.hasOwn(parsed, 'corrections')) {
    if (!Array.isArray(parsed.corrections) || parsed.corrections.length > assertions.length) return invalid('更正集合不符合事实核查契约 v2。');
    const seen = new Set<number>();
    for (const entry of parsed.corrections) {
      if (!isRecord(entry) || !hasExactKeys(entry, ['assertionRef', 'variants'])) return invalid('更正键集合不符合事实核查契约 v2。');
      const ref = entry.assertionRef;
      if (!Number.isSafeInteger(ref) || (ref as number) < 1 || (ref as number) > assertions.length || seen.has(ref as number)) return invalid('更正指向的断言无效。');
      seen.add(ref as number);
      if (!Array.isArray(entry.variants) || entry.variants.length < 1 || entry.variants.length > MAX_VARIANTS) return invalid('更正方案须为 1 至 3 项。');
      const variants: Array<{ text: string; rationale: string }> = [];
      for (const variant of entry.variants) {
        if (!isRecord(variant) || !hasExactKeys(variant, ['text', 'rationale'])) return invalid('更正方案键集合不符合事实核查契约 v2。');
        if (!boundedText(variant.text, MAX_CORRECTION_TEXT_GRAPHEMES)) return invalid('更正文字缺失或超出 200 字素边界。');
        if (!boundedText(variant.rationale, MAX_CORRECTION_RATIONALE_GRAPHEMES)) return invalid('更正理由缺失或超出 120 字素边界。');
        variants.push({ text: variant.text, rationale: variant.rationale });
      }
      corrections.push({ assertionRef: ref as number, variants });
    }
  }
  const result: FactualReviewUnitResultV2 = { schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: expected.unitOrdinal, assertions, corrections };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}

/** The system lines v2 shares at both levels it serves. Every one is model-facing text or a fixed format. */
const V2_SYSTEM_LINES = [
  '你是 AI7 的事实核查组件。你只处理用户消息中给出的一个分析单元，逐块阅读，列出其中每一条读者可以对照真实世界核查的断言，并为每条断言查找证据。',
  '可核查断言包括：年代与日期、地点与行政区划、人物与身份、机构与官职、器物与工艺、数字与度量、明确归属于某来源的引文、史实陈述、技术陈述。',
  '你可以使用本次计划声明的工具：websearch 与 webfetch 检索并读取公开来源，retrieve 与 exact_fetch 在本书稿件与资料中检索并精确取文。计划没有声明的工具不得调用。',
  '查询用你自己概括的公开事实主题，不发送稿件原文、引文、标题、作者或文件名。每一条查询只执行一次，不为获得更好的答案重试。',
  '模型知识不是证据：它只能帮你提出核查问题或检索方向，不得写成来源、证据关系或摘录。不改写稿件，不下脱离证据的事实结论。',
  '每条断言必须给出稿件中的逐字引文：原样复制，不加省略号、不合并、不改标点、不超过 80 字素，并指明该引文所在内容块的序号。',
  '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
  '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须包含以下键，且不得多出任何键：',
  'schema（固定为 "ai7.factual-review.unit-result/2"）、unitOrdinal（与用户消息头部的单元序号一致）、assertions（数组），以及可选的 corrections（数组）。',
  'assertions 的每一项精确包含以下键：quote（逐字引文）、blockOrdinal（内容块序号）、assertionClass、category、severity、question、basis、evidenceRelations。',
  'assertionClass 取 real-world-fact/quotation/report-about-manuscript/fictional-canon/judgment 之一；虚构作品中的虚构人物、地点与事件属于 fictional-canon，不是 real-world-fact。',
  'category 取 时间/地点/人物/机构/器物/数字/引文/史实/技术/其他 之一。severity 取 A/B/C 之一：A 表示若有误将直接损害稿件可信度，B 表示很可能需要核实，C 表示建议留意。',
  'question 是你要核查的问题，不超过 120 字素；basis 说明该断言为何可核查、你怀疑什么，不超过 200 字素。',
  'evidenceRelations 是数组，每一项精确包含 sourceRef、relation、excerptRef、lineage 四个键。sourceRef 是本单元工具实际返回过的 https 地址，或 "retrieval:" 加 exact_fetch 取过的候选标识。',
  'relation 取 支持/部分支持/反驳/仅提供背景/关系待判断 之一，每个来源单独判断，不按来源数量下结论。excerptRef 是你在该来源中读到的逐字摘录，不超过 200 字素；没有读到原文时为 null。',
  'lineage 取 original/quoted/syndicated/translated/summarized 之一：原始来源、转引、转载、译介或摘述；无法判断时为 null。没有找到来源的断言给出空数组。',
  'corrections 只为证据表明有误的断言给出：每项精确包含 assertionRef（该断言在 assertions 中的序号，从 1 开始）与 variants；variants 为 1 至 3 项，每项精确包含 text 与 rationale。',
  'text 是改正后的那段文字，不超过 200 字素，只改必须改的部分，不顺带润色或调整结构；rationale 不超过 120 字素。只有一种最小改法时只给一项，不要为凑数制造选项。',
  '没有可核查断言的单元输出空数组。不要编造稿件中不存在的内容，也不要为凑数把评价或虚构设定列为事实断言。',
] as const;

const V2_LEVEL_LINES: Readonly<Record<Exclude<EvidenceAssuranceLevel, 'quick'>, string>> = {
  standard: '本次计划的证据保证级别为标准核查：优先核对最需要确认的断言，读取并摘录能精确说明问题的原文。',
  strict: '本次计划的证据保证级别为严格核查：对每条需要确认或否定的断言，尽量找到至少两个相互独立的原始来源——不同发布方、不同域名，不是转载、转引、译介或摘述——并如实标注 lineage。',
};

/** The frozen v2 prompt contract of one level: the system section, the response schema and v1's unit message format. */
export function factualReviewPromptContractV2(level: Exclude<EvidenceAssuranceLevel, 'quick'>) {
  return {
    schema: FACTUAL_REVIEW_PROMPT_CONTRACT_V2_SCHEMA,
    contractVersion: FACTUAL_REVIEW_CONTRACT_VERSION,
    responseSchema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA,
    evidenceAssuranceLevel: level,
    systemPrompt: [...V2_SYSTEM_LINES, V2_LEVEL_LINES[level]].join('\n'),
    unitMessageHeader: '事实核查单元 {ordinal}/{total} · 单元摘要 {unitDigest}',
    overlapHeader: '以下为承接上一单元的重叠上下文（仅供理解，不属于本单元的覆盖范围）：',
    ownHeader: '以下为本单元需要核查的内容块：',
    blockLine: '[{blockId}] ({kind}{level}) {text}',
  } as const;
}

export const FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STANDARD = factualReviewPromptContractV2('standard');
export const FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STRICT = factualReviewPromptContractV2('strict');
export const FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STANDARD_DIGEST = sha256Hex(canonicalJson(FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STANDARD));
export const FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STRICT_DIGEST = sha256Hex(canonicalJson(FACTUAL_REVIEW_PROMPT_CONTRACT_V2_STRICT));

/** A v2 unit record as the ledger keeps it: the assertions with their relations, and the corrections. */
export function factualReviewUnitRecordV2(result: FactualReviewUnitResultV2): Record<string, unknown> {
  return { assertions: result.assertions, corrections: result.corrections };
}

export function factualReviewUnitResultOfRecordV2(record: Readonly<Record<string, unknown>>, unitOrdinal: number): FactualReviewUnitResultV2 {
  return {
    schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA,
    unitOrdinal,
    assertions: record.assertions as FactualReviewUnitResultV2['assertions'],
    corrections: (record.corrections ?? []) as FactualReviewUnitResultV2['corrections'],
  };
}

/** Whether a source reference names an in-Book Exact Fetch candidate; its identity when it does. */
export function retrievalCandidateOf(sourceRef: string): string | null {
  return RETRIEVAL_SOURCE.test(sourceRef) ? sourceRef.slice('retrieval:'.length) : null;
}

/**
 * Exact Fetch of every in-Book relation of one parsed v2 result, done by the execution owner while the Run's retrieval index
 * is open: a relation whose excerpt the candidate's exact text holds verbatim is marked with the source it was found in, every
 * other `retrieval:` relation with `null`. Web relations are left as they are; their capture is checked against the retained
 * evidence afterwards.
 */
export function markInBookExactFetch(
  result: FactualReviewUnitResultV2,
  exactFetch: ((candidateId: string) => { readonly text: string; readonly candidate: { readonly sourceKind: string; readonly sourceId: string; readonly revisionOrIndexDigest: string } }) | null,
): FactualReviewUnitResultV2 {
  return {
    ...result,
    assertions: result.assertions.map((assertion) => ({
      ...assertion,
      evidenceRelations: assertion.evidenceRelations.map((relation) => {
        const candidateId = retrievalCandidateOf(relation.sourceRef);
        if (candidateId === null) return relation;
        let found: FactualEvidenceRelation['exactFetch'] = null;
        if (exactFetch !== null && relation.excerptRef !== null) {
          try {
            const fetched = exactFetch(candidateId);
            if (fetched.text.includes(relation.excerptRef)) {
              found = { sourceKind: fetched.candidate.sourceKind, sourceId: fetched.candidate.sourceId, digest: fetched.candidate.revisionOrIndexDigest };
            }
          } catch {
            found = null;
          }
        }
        return { ...relation, exactFetch: found };
      }),
    })),
  };
}
