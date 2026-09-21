import {
  EDITORIAL_REVIEW_CONTRACT_VERSION,
  REVIEW_FINDING_SEVERITIES,
  isReviewCategoryId,
  type CoverageManifestUnitProjection,
  type ReviewCategoryOutputKind,
  type ReviewFindingSeverity,
} from '../../shared/protocol.js';
import { DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, requireAnalysis, sha256Hex } from '../analysis/canonical.js';
import type { ManifestBlockInput } from '../analysis/coverage-manifest.js';
import { graphemeCount } from '../analysis/factual-review-contract.js';

/**
 * Editorial Review Contract v1 (Issue #417, plan slice S69): the one product-built, exact-versioned
 * contract every Review Category is read under. One typed partial result per Analysis Unit — every
 * finding the category's guideline clauses call for, each with its verbatim quotation, the block that
 * quotation comes from, a severity, a note, and, for a category whose findings become 修改建议, the
 * text it proposes in place of the quotation.
 *
 * The contract is generic and its frozen text is not. A Review Category is configuration (V2-UX-REV-002:
 * a house may add one), so there is no constant prompt contract to digest: {@link reviewCategoryContract}
 * builds one from a category's identity, label, output kind, guideline clauses and procedure, and
 * freezes all of it — the category's own facts beside the model-facing text assembled from them. Its
 * digest binds the Execution Binding and the deterministic fixture key exactly as the two other
 * kinds' do, which is also how a revision pins what it was read under (V2-UX-REV-012): change one
 * clause and the digest, every request digest, and the reuse compatibility of every earlier unit
 * result change with it.
 *
 * The contract lists and locates; it never decides. Reference Integrity — the factual kind's
 * `locateQuotation`, reused rather than restated — is the only anchor a finding ever carries, and what
 * becomes of a finding is the editor's (V2-UX-REV-003).
 */
export const REVIEW_CATEGORY_UNIT_RESULT_SCHEMA = 'ai7.editorial-review.unit-result/1' as const;
export const REVIEW_CATEGORY_PROMPT_CONTRACT_SCHEMA = 'ai7.editorial-review.prompt-contract/1' as const;
export const REVIEW_CATEGORY_RESULT_SET_REVISION_SCHEMA = 'ai7.editorial-review.result-set-revision/1' as const;
/** The shape that carries scope-plan facts and per-unit lineage: every update, and a first review of one range. */
export const REVIEW_CATEGORY_SUCCESSOR_REVISION_SCHEMA = 'ai7.editorial-review.result-set-revision/2' as const;

const MAX_FINDINGS = 200;
const MAX_QUOTE_GRAPHEMES = 80;
const MAX_NOTE_GRAPHEMES = 200;
const MAX_REPLACEMENT_GRAPHEMES = 200;
const MAX_LABEL_GRAPHEMES = 40;
const MAX_CLAUSES = 40;
const MAX_CLAUSE_TEXT_GRAPHEMES = 300;
const MAX_TITLE_GRAPHEMES = 80;
/** A clause or procedure identity: what a configuration author writes, and what a finding may cite back. */
const REFERENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/u;
/** A line of the frozen prompt is one line: no control character may break it or hide in it. */
const CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;

/**
 * What one category contributes to its frozen contract. It is the minimal reading of a category's
 * configuration entry: the category configuration (its guideline documents with their issuers and
 * versions, its executor, its search-engine statement) is Stage B's and flattens onto this.
 */
export interface ReviewCategoryContractInput {
  readonly categoryId: string;
  readonly label: string;
  readonly output: ReviewCategoryOutputKind;
  /** Findings are only `需人工复核的风险点`: the model is told to state no compliance, plagiarism, policy or legal verdict. */
  readonly riskPointsOnly: boolean;
  readonly clauses: ReadonlyArray<{ readonly clauseId: string; readonly text: string }>;
  readonly procedure: { readonly procedureId: string; readonly title: string; readonly version: string };
}

/** One finding exactly as the model listed it, before Reference Integrity has looked at it. */
export interface ReviewUnitFinding {
  readonly quote: string;
  /** 1-based over the unit's blocks in message order: the overlap blocks first, then the own blocks. */
  readonly blockOrdinal: number;
  readonly severity: ReviewFindingSeverity;
  readonly note: string;
  /** Present exactly for a 修改建议 category; an empty string proposes deleting the quotation. */
  readonly replacement?: string;
  readonly clauseId?: string;
}

export interface ReviewCategoryUnitResult {
  readonly schema: typeof REVIEW_CATEGORY_UNIT_RESULT_SCHEMA;
  readonly unitOrdinal: number;
  readonly findings: ReadonlyArray<ReviewUnitFinding>;
}

/**
 * Why a unit result did not parse. The first four are the factual parser's own codes and mean what
 * they mean there. The last three are this contract's: a 修改建议 category's finding without its
 * replacement, a 批注 category's finding with one, and a clause the category does not list. Each is a
 * refused unit result rather than a dropped finding, because a model that ignored the category's
 * output kind has not answered the contract it was given.
 */
export type ReviewCategoryUnitResultParseFailureCode =
  | 'not-json'
  | 'schema-invalid'
  | 'unit-mismatch'
  | 'quote-not-in-block'
  | 'replacement-required'
  | 'replacement-refused'
  | 'clause-unknown';

export type ReviewCategoryUnitResultParse =
  | { ok: true; result: ReviewCategoryUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: ReviewCategoryUnitResultParseFailureCode; detail: string };

function boundedLine(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && value === value.trim() &&
    !CONTROL_CHARACTER.test(value) && graphemeCount(value) <= maximumGraphemes;
}

function boundedText(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= maximumGraphemes;
}

/**
 * The category exactly as the contract freezes it: every key checked, nothing carried that is not
 * named. A configuration that does not read as one is refused here, before any plan is frozen over it.
 */
function frozenCategory(input: ReviewCategoryContractInput): ReviewCategoryContractInput {
  requireAnalysis(isRecord(input) && hasExactKeys(input, ['categoryId', 'label', 'output', 'riskPointsOnly', 'clauses', 'procedure']),
    'REVIEW_CATEGORY_INVALID', '审阅类别的键集合无效。');
  requireAnalysis(isReviewCategoryId(input.categoryId), 'REVIEW_CATEGORY_INVALID', '审阅类别标识无效。');
  requireAnalysis(boundedLine(input.label, MAX_LABEL_GRAPHEMES) && !/[「」]/u.test(input.label), 'REVIEW_CATEGORY_INVALID', '审阅类别名称无效。');
  requireAnalysis(input.output === 'change-suggestion' || input.output === 'annotation', 'REVIEW_CATEGORY_INVALID', '审阅类别的产出种类无效。');
  requireAnalysis(typeof input.riskPointsOnly === 'boolean', 'REVIEW_CATEGORY_INVALID', '审阅类别的风险点声明无效。');
  // A risk point is something a person must look at; it cannot also be a replacement AI7 proposes.
  requireAnalysis(!(input.riskPointsOnly && input.output === 'change-suggestion'), 'REVIEW_CATEGORY_INVALID', '只标出风险点的类别不能产出修改建议。');
  requireAnalysis(Array.isArray(input.clauses) && input.clauses.length >= 1 && input.clauses.length <= MAX_CLAUSES,
    'REVIEW_CATEGORY_INVALID', '审阅类别的依据条款数量无效。');
  const clauses = input.clauses.map((clause) => {
    requireAnalysis(isRecord(clause) && hasExactKeys(clause, ['clauseId', 'text']) &&
      typeof clause.clauseId === 'string' && REFERENCE_ID_PATTERN.test(clause.clauseId) && boundedLine(clause.text, MAX_CLAUSE_TEXT_GRAPHEMES),
    'REVIEW_CATEGORY_INVALID', '审阅类别的依据条款无效。');
    return { clauseId: clause.clauseId, text: clause.text };
  });
  requireAnalysis(new Set(clauses.map((clause) => clause.clauseId)).size === clauses.length, 'REVIEW_CATEGORY_INVALID', '审阅类别的依据条款编号重复。');
  const procedure = input.procedure;
  requireAnalysis(isRecord(procedure) && hasExactKeys(procedure, ['procedureId', 'title', 'version']) &&
    typeof procedure.procedureId === 'string' && REFERENCE_ID_PATTERN.test(procedure.procedureId) &&
    boundedLine(procedure.title, MAX_TITLE_GRAPHEMES) && typeof procedure.version === 'string' && VERSION_PATTERN.test(procedure.version),
  'REVIEW_CATEGORY_INVALID', '审阅类别的工序无效。');
  return {
    categoryId: input.categoryId,
    label: input.label,
    output: input.output,
    riskPointsOnly: input.riskPointsOnly,
    clauses,
    procedure: { procedureId: procedure.procedureId, title: procedure.title, version: procedure.version },
  };
}

const UNIT_MESSAGE_HEADER = '审阅单元 {ordinal}/{total} · 类别 {categoryId} · 单元摘要 {unitDigest}' as const;
const OVERLAP_HEADER = '以下为承接上一单元的重叠上下文（仅供理解，不属于本单元的审阅范围）：' as const;
const OWN_HEADER = '以下为本单元需要审阅的内容块：' as const;
const BLOCK_LINE = '[{blockId}] ({kind}{level}) {text}' as const;

function systemPromptOf(category: ReviewCategoryContractInput): string {
  const replacementRule = category.output === 'change-suggestion'
    ? '本类别的产出是修改建议：每条发现必须给出 replacement，即用来替换该逐字引文的完整文字；replacement 不得与引文相同，不超过 200 字素，建议删去引文时给出空字符串。'
    : '本类别的产出是批注：不得给出 replacement，只在 note 中说明问题，由编辑决定如何处理。';
  return [
    `你是 AI7 的审阅组件，本次只执行一个审阅类别：「${category.label}」。你只处理用户消息中给出的一个分析单元，逐块阅读，按下列审阅依据列出属于该类别的发现。`,
    `审阅工序：${category.procedure.title}（${category.procedure.procedureId} · 版本 ${category.procedure.version}）。`,
    '审阅依据（每条以条款编号开头；不属于这些条款的问题不在本类别之内）：',
    ...category.clauses.map((clause) => `- [${clause.clauseId}] ${clause.text}`),
    '不改写稿件、不调用任何工具、不引用外部资料、不下事实结论。你只负责列出发现、说明理由，并精确指出它在稿件中的位置。',
    ...(category.riskPointsOnly
      ? ['本类别只标出需人工复核的风险点：note 只说明为何需要人工复核，不得给出合规、抄袭、政策或法律结论。']
      : []),
    '每条发现必须给出稿件中的逐字引文：原样复制，不加省略号、不合并、不改标点、不超过 80 字素，并指明该引文所在内容块的序号。引文应尽量短，只覆盖有问题的文字，并且在该内容块中只出现一次。',
    '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.editorial-review.unit-result/1"）、unitOrdinal（与用户消息头部的单元序号一致）、findings（数组）。',
    category.output === 'change-suggestion'
      ? 'findings 的每一项精确包含以下键：quote（逐字引文）、blockOrdinal（内容块序号）、severity、note、replacement；另可包含 clauseId。'
      : 'findings 的每一项精确包含以下键：quote（逐字引文）、blockOrdinal（内容块序号）、severity、note；另可包含 clauseId。',
    'severity 取 must/should/note 之一：must 表示必须处理，should 表示建议处理，note 表示提示。',
    replacementRule,
    'note 说明问题与理由，不超过 200 字素。clauseId 给出时必须是上面列出的条款编号之一。',
    '没有发现的单元输出空数组。不要编造稿件中不存在的内容，也不要为凑数列出不属于本类别的问题。',
  ].join('\n');
}

/** The frozen prompt contract of one category. Every field is model-facing text, a fixed format, or the category's own configuration; none is manuscript content. */
export interface ReviewCategoryPromptContract {
  readonly schema: typeof REVIEW_CATEGORY_PROMPT_CONTRACT_SCHEMA;
  readonly contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION;
  readonly responseSchema: typeof REVIEW_CATEGORY_UNIT_RESULT_SCHEMA;
  readonly category: ReviewCategoryContractInput;
  readonly systemPrompt: string;
  readonly unitMessageHeader: typeof UNIT_MESSAGE_HEADER;
  readonly overlapHeader: typeof OVERLAP_HEADER;
  readonly ownHeader: typeof OWN_HEADER;
  readonly blockLine: typeof BLOCK_LINE;
}

export function reviewCategoryContract(input: ReviewCategoryContractInput): ReviewCategoryPromptContract {
  const category = frozenCategory(input);
  return {
    schema: REVIEW_CATEGORY_PROMPT_CONTRACT_SCHEMA,
    contractVersion: EDITORIAL_REVIEW_CONTRACT_VERSION,
    responseSchema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA,
    category,
    systemPrompt: systemPromptOf(category),
    unitMessageHeader: UNIT_MESSAGE_HEADER,
    overlapHeader: OVERLAP_HEADER,
    ownHeader: OWN_HEADER,
    blockLine: BLOCK_LINE,
  };
}

export function reviewCategoryContractDigest(contract: ReviewCategoryPromptContract): string {
  return sha256Hex(canonicalJson(contract));
}

export function parseReviewCategoryUnitResult(
  text: string,
  expected: { unitOrdinal: number; blockCount: number; output: ReviewCategoryOutputKind; clauseIds: ReadonlyArray<string> },
): ReviewCategoryUnitResultParse {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text);
  const body = fenced?.[1] ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  }
  const invalid = (detail: string): ReviewCategoryUnitResultParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['schema', 'unitOrdinal', 'findings'])) {
    return invalid('单元结果键集合不符合编辑审阅契约 v1。');
  }
  if (parsed.schema !== REVIEW_CATEGORY_UNIT_RESULT_SCHEMA) return invalid('单元结果 schema 不是编辑审阅契约 v1。');
  if (!Number.isSafeInteger(parsed.unitOrdinal) || (parsed.unitOrdinal as number) < 1) return invalid('单元序号无效。');
  if (parsed.unitOrdinal !== expected.unitOrdinal) {
    return {
      ok: false,
      code: 'unit-mismatch',
      detail: `单元结果声明的序号 ${String(parsed.unitOrdinal)} 与请求单元 ${expected.unitOrdinal} 不一致。`,
    };
  }
  if (!Array.isArray(parsed.findings) || parsed.findings.length > MAX_FINDINGS) return invalid('发现集合不符合编辑审阅契约 v1。');
  const findings: ReviewUnitFinding[] = [];
  for (const [index, candidate] of (parsed.findings as unknown[]).entries()) {
    const label = `第 ${index + 1} 条发现`;
    // The four keys every finding carries, plus whichever of the two optional ones this one names; an
    // unknown key is refused, exactly as every other contract's parser refuses one.
    if (!isRecord(candidate) || !hasExactKeys(candidate, [
      'quote', 'blockOrdinal', 'severity', 'note',
      ...(['replacement', 'clauseId'] as const).filter((key) => key in candidate),
    ])) {
      return invalid(`${label}的键集合不符合编辑审阅契约 v1。`);
    }
    if (!boundedText(candidate.quote, MAX_QUOTE_GRAPHEMES)) return invalid(`${label}的引文缺失或超出 80 字素边界。`);
    if (!Number.isSafeInteger(candidate.blockOrdinal) || (candidate.blockOrdinal as number) < 1) return invalid(`${label}的内容块序号无效。`);
    if (!REVIEW_FINDING_SEVERITIES.includes(candidate.severity as ReviewFindingSeverity)) return invalid(`${label}的严重度不在闭合集合内。`);
    if (!boundedText(candidate.note, MAX_NOTE_GRAPHEMES)) return invalid(`${label}的说明缺失或超出 200 字素边界。`);
    if ('replacement' in candidate) {
      if (expected.output === 'annotation') {
        return { ok: false, code: 'replacement-refused', detail: `${label}给出了替换文字，但本类别的产出是批注。` };
      }
      // A replacement may be empty — that proposes deleting the quotation — and is otherwise bounded
      // like every other free text here. One equal to its own quotation proposes nothing at all.
      if (typeof candidate.replacement !== 'string' || !candidate.replacement.isWellFormed() ||
          graphemeCount(candidate.replacement) > MAX_REPLACEMENT_GRAPHEMES || candidate.replacement === candidate.quote) {
        return invalid(`${label}的替换文字无效、超出 200 字素边界，或与引文相同。`);
      }
    } else if (expected.output === 'change-suggestion') {
      return { ok: false, code: 'replacement-required', detail: `${label}没有给出替换文字，但本类别的产出是修改建议。` };
    }
    if ('clauseId' in candidate) {
      if (typeof candidate.clauseId !== 'string' || !REFERENCE_ID_PATTERN.test(candidate.clauseId)) return invalid(`${label}的条款编号无效。`);
      if (!expected.clauseIds.includes(candidate.clauseId)) {
        return { ok: false, code: 'clause-unknown', detail: `${label}引用的条款 ${candidate.clauseId} 不在本类别列出的审阅依据内。` };
      }
    }
    if ((candidate.blockOrdinal as number) > expected.blockCount) {
      return {
        ok: false,
        code: 'quote-not-in-block',
        detail: `${label}引用的内容块序号 ${String(candidate.blockOrdinal)} 不在本单元列出的 ${expected.blockCount} 个内容块内。`,
      };
    }
    findings.push({
      quote: candidate.quote,
      blockOrdinal: candidate.blockOrdinal as number,
      severity: candidate.severity as ReviewFindingSeverity,
      note: candidate.note,
      ...('replacement' in candidate ? { replacement: candidate.replacement as string } : {}),
      ...('clauseId' in candidate ? { clauseId: candidate.clauseId as string } : {}),
    });
  }
  const result: ReviewCategoryUnitResult = { schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: expected.unitOrdinal, findings };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}

// ---- the unit message ------------------------------------------------------------------------------

/**
 * The header names the category beside the unit. The deterministic adapter decides which kind a
 * request belongs to by its header alone, so the prefix `审阅单元` is this family's and no other
 * contract's, and the category travels in it because one fixture answers several categories.
 */
const HEADER_PATTERN = /^审阅单元 (\d+)\/(\d+) · 类别 ([a-z][a-z0-9]*(?:-[a-z0-9]+)*) · 单元摘要 ([0-9a-f]{64})$/u;

function blockLine(block: Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>): string {
  return BLOCK_LINE
    .replace('{blockId}', block.blockId)
    .replace('{kind}', block.kind)
    .replace('{level}', block.level === null ? '' : ` h${block.level}`)
    .replace('{text}', () => block.text);
}

/** The block identities of one unit in message order: the overlap context first, then the own blocks. */
export function reviewCategoryMessageBlockIds(unit: CoverageManifestUnitProjection): string[] {
  return [...unit.overlapBlockIds, ...unit.blockIds];
}

function requireBlock<T>(blocksById: ReadonlyMap<string, T>, blockId: string): T {
  const block = blocksById.get(blockId);
  if (block === undefined) throw new Error('ANALYSIS_UNIT_BLOCK_MISSING');
  return block;
}

/** The exact user-role message for one Analysis Unit of one category: header, optional overlap context, then own blocks. */
export function buildReviewCategoryUnitMessage(
  contract: ReviewCategoryPromptContract,
  unit: CoverageManifestUnitProjection,
  totalUnits: number,
  blocksById: ReadonlyMap<string, Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>>,
): string {
  const lines = [
    contract.unitMessageHeader
      .replace('{ordinal}', String(unit.ordinal))
      .replace('{total}', String(totalUnits))
      .replace('{categoryId}', contract.category.categoryId)
      .replace('{unitDigest}', unit.digest),
  ];
  if (unit.overlapBlockIds.length > 0) {
    lines.push(contract.overlapHeader);
    for (const blockId of unit.overlapBlockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  }
  lines.push(contract.ownHeader);
  for (const blockId of unit.blockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  return lines.join('\n');
}

export interface ReviewCategoryUnitMessageHeader {
  readonly ordinal: number;
  readonly total: number;
  readonly categoryId: string;
  readonly unitDigest: string;
}

/** Recover the unit identity from a message built by {@link buildReviewCategoryUnitMessage}; `null` for anything else. */
export function parseReviewCategoryUnitMessageHeader(text: string): ReviewCategoryUnitMessageHeader | null {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = HEADER_PATTERN.exec(firstLine);
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal || !isReviewCategoryId(match[3])) return null;
  return { ordinal, total, categoryId: match[3], unitDigest: match[4]! };
}

/**
 * The request digest a deterministic fixture is keyed by beside the unit ordinal. It is the same pure
 * function of prompt contract and manifest unit the two other kinds use, with the category named in it
 * as well: the contract digest already differs per category, and naming the category keeps a fixture
 * entry's key legible as the category's own rather than relying on that.
 */
export function reviewCategoryRequestDigest(promptContractDigest: string, categoryId: string, unitOrdinal: number, unitDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest) || !isReviewCategoryId(categoryId)) {
    throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  }
  return sha256Hex(canonicalJson({ promptContractDigest, categoryId, unitOrdinal, unitDigest }));
}
