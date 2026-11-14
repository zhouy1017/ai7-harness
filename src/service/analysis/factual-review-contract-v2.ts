import { type SalvagedModelResult, boundedText, ModelResultReader, NO_USABLE_MODEL_ENTRIES, canonicalJson, hasKeys, modelNumber, sha256Hex } from './canonical.js';
import {
  EVIDENCE_LINEAGE_CLASSES,
  EVIDENCE_RELATIONS,
  FACTUAL_REVIEW_CONTRACT_VERSION,
  MAX_CORRECTION_RATIONALE_GRAPHEMES,
  MAX_CORRECTION_TEXT_GRAPHEMES,
  type EvidenceAssuranceLevel,
  type EvidenceLineageClass,
  type EvidenceRelation,
} from '../../shared/protocol.js';
import { parseFactualAssertion, type FactualUnitAssertion, type FactualUnitResultParse } from './factual-review-contract.js';

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
   * Set by the execution owner, never by the model (the parser ignores the model key): the exact in-Book source an excerpt of a
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

export interface FactualReviewUnitResultV2 extends SalvagedModelResult {
  readonly schema: typeof FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA;
  readonly unitOrdinal: number;
  readonly assertions: ReadonlyArray<FactualUnitAssertionV2>;
  /** Original zero-based positions, used by retrieval validation after per-entry filtering. */
  readonly acceptedIndexes?: ReadonlyArray<number>;
  readonly corrections: ReadonlyArray<FactualCorrectionEntry>;
}

const RELATION_ALIASES: Readonly<Record<string, EvidenceRelation>> = {
  support: '支持', supports: '支持', supported: '支持', 确证: '支持', 部分成立: '部分支持', 'partial-support': '部分支持',
  contradict: '反驳', contradicts: '反驳', refutes: '反驳', background: '仅提供背景', 背景: '仅提供背景', unknown: '关系待判断',
};
const LINEAGE_ALIASES: Readonly<Record<string, EvidenceLineageClass>> = {
  原始来源: 'original', 原文: 'original', 转引: 'quoted', 转载: 'syndicated', 译介: 'translated', 翻译: 'translated', 摘述: 'summarized', 摘要: 'summarized',
};

export function parseFactualEvidenceRelations(value: unknown, reader: ModelResultReader, section: string, httpsOnly = false): FactualEvidenceRelation[] {
  return reader.array(value, section, MAX_RELATIONS_PER_ASSERTION).flatMap((entry, index) => {
    if (!hasKeys(entry, ['sourceRef']) || typeof entry.sourceRef !== 'string' || !entry.sourceRef.isWellFormed() ||
      !(HTTPS_SOURCE.test(entry.sourceRef) || !httpsOnly && RETRIEVAL_SOURCE.test(entry.sourceRef))) {
      reader.drop(section, index, 'sourceRef-invalid'); return [];
    }
    let excerptRef = entry.excerptRef ?? null;
    if (excerptRef !== null && !boundedText(excerptRef, MAX_EXCERPT_GRAPHEMES)) {
      reader.drop(section, index, 'excerpt-invalid'); excerptRef = null;
    }
    const rawLineage = entry.lineage;
    const lineage = rawLineage === undefined || rawLineage === null ? null : reader.enum(rawLineage, [...EVIDENCE_LINEAGE_CLASSES, 'unknown'],
      LINEAGE_ALIASES, 'unknown', section, index);
    return [{ sourceRef: entry.sourceRef, relation: reader.enum(entry.relation, EVIDENCE_RELATIONS, RELATION_ALIASES, '关系待判断', section, index),
      excerptRef: excerptRef as string | null, lineage: lineage === 'unknown' ? null : lineage }];
  });
}

export function parseFactualCorrectionVariants(value: unknown, reader: ModelResultReader, section: string): FactualCorrectionEntry['variants'] {
  return reader.array(value, section, MAX_VARIANTS).flatMap((entry, index) => {
    if (!hasKeys(entry, ['text'])) { reader.drop(section, index, 'variant-invalid'); return []; }
    const text = reader.text(entry.text, MAX_CORRECTION_TEXT_GRAPHEMES, section, index);
    const rationale = reader.text(entry.rationale, MAX_CORRECTION_RATIONALE_GRAPHEMES, section, index, true);
    if (text === null || rationale === null) { reader.drop(section, index, 'variant-invalid'); return []; }
    return [{ text, rationale }];
  });
}

/** Bad relations/corrections never remove their surviving assertion siblings. */
export function parseFactualReviewUnitResultV2(
  text: string,
  expected: { unitOrdinal: number; blockCount: number },
): FactualUnitResultParse | { ok: true; salvaged?: SalvagedModelResult['salvaged']; result: FactualReviewUnitResultV2; canonicalJson: string; digest: string } {
  const reader = ModelResultReader.read(text, FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, expected.unitOrdinal);
  if (reader === null) return ModelResultReader.failure(text);
  const assertions: FactualUnitAssertionV2[] = [];
  const remap = new Map<number, number>();
  for (const [index, candidate] of reader.array(reader.value.assertions, 'assertions', MAX_ASSERTIONS).entries()) {
    const assertion = parseFactualAssertion(candidate, expected, reader, index);
    if (assertion === null || !hasKeys(candidate, ['quote'])) continue;
    remap.set(index + 1, assertions.length + 1);
    assertions.push({ ...assertion, evidenceRelations: parseFactualEvidenceRelations(candidate.evidenceRelations, reader, `assertions.${index}.evidenceRelations`) });
  }
  const corrections: FactualCorrectionEntry[] = [];
  const seen = new Set<number>();
  for (const [index, entry] of reader.array(reader.value.corrections, 'corrections', MAX_ASSERTIONS).entries()) {
    const ref = hasKeys(entry, ['assertionRef']) ? modelNumber(entry.assertionRef) : NaN;
    const mapped = remap.get(ref);
    if (!hasKeys(entry, ['assertionRef']) || !Number.isSafeInteger(ref) || mapped === undefined || seen.has(mapped)) {
      reader.drop('corrections', index, 'assertionRef-invalid'); continue;
    }
    const variants = parseFactualCorrectionVariants(entry.variants, reader, `corrections.${index}.variants`);
    if (variants.length === 0) { reader.drop('corrections', index, 'variants-empty'); continue; }
    seen.add(mapped);
    if (mapped !== entry.assertionRef) reader.drop('corrections', index, 'assertionRef-remapped');
    corrections.push({ assertionRef: mapped, variants });
  }
  if (assertions.length === 0 && !reader.empty('assertions')) return { ok: false, code: 'schema-invalid', detail: NO_USABLE_MODEL_ENTRIES };
  const acceptedIndexes = [...remap.keys()].map((ref) => ref - 1);
  return reader.finish<FactualReviewUnitResultV2>({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: expected.unitOrdinal, assertions, corrections,
    ...(acceptedIndexes.some((original, index) => original !== index) ? { acceptedIndexes } : {}) });
}

/** The system lines v2 shares at both levels it serves. Every one is model-facing text or a fixed format. */
const V2_SYSTEM_LINES = [
  '你是 AI7 的事实核查组件。你只处理用户消息中给出的一个分析单元，逐块阅读，列出其中每一条读者可以对照真实世界核查的断言，并为每条断言查找证据。',
  '可核查断言包括：年代与日期、地点与行政区划、人物与身份、机构与官职、器物与工艺、数字与度量、明确归属于某来源的引文、史实陈述、技术陈述。',
  '你可以使用本次计划声明的工具：websearch 与 webfetch 检索并读取公开来源，retrieve 与 exact_fetch 在本书稿件与资料中检索并精确取文。计划没有声明的工具不得调用。',
  '查询用你自己概括的公开事实主题，不发送稿件原文、引文、标题、作者或文件名。每一条查询只执行一次，不为获得更好的答案重试。',
  '模型知识不是证据：它只能帮你提出核查问题或检索方向，不得写成来源、证据关系或摘录。不改写稿件，不下脱离证据的事实结论。',
  '每条断言必须给出稿件中的逐字引文：原样复制，不加省略号、不合并、不改标点、不超过 80 字素，并指明该引文所在内容块的序号。',
  '若引文在该内容块中出现多次，必须给出 occurrence，表示第几次出现（从 1 开始，1 表示第一处）；只出现一次时可省略。',
  '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
  '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须包含以下键，且不得多出任何键：',
  'schema（固定为 "ai7.factual-review.unit-result/2"）、unitOrdinal（与用户消息头部的单元序号一致）、assertions（数组），以及可选的 corrections（数组）。',
  'assertions 的每一项精确包含以下键：quote（逐字引文）、blockOrdinal（内容块序号）、assertionClass、category、severity、question、basis、evidenceRelations；另可包含 occurrence。',
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
  return { assertions: result.assertions, corrections: result.corrections, ...(result.salvaged === undefined ? {} : { salvaged: result.salvaged }) };
}

export function factualReviewUnitResultOfRecordV2(record: Readonly<Record<string, unknown>>, unitOrdinal: number): FactualReviewUnitResultV2 {
  return {
    schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA,
    unitOrdinal,
    assertions: record.assertions as FactualReviewUnitResultV2['assertions'],
    ...(record.salvaged === undefined ? {} : { salvaged: record.salvaged as NonNullable<FactualReviewUnitResultV2['salvaged']> }),
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
