import {
  EVALUATION_CONCLUSIONS,
  INITIAL_EVALUATION_CONTRACT_VERSION,
  type CoverageManifestUnitProjection,
  type EvaluationConclusion,
  type InitialEvaluationMarketProjection,
  type InitialEvaluationPredictionProjection,
} from '../../shared/protocol.js';
import { validEvaluationScore } from '../../shared/evaluation-scoring.js';
import { DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, requireAnalysis, sha256Hex } from '../analysis/canonical.js';
import type { ManifestBlockInput } from '../analysis/coverage-manifest.js';
import { graphemeCount } from '../analysis/factual-review-contract.js';
import { claimsQuantity } from './claim-guards.js';

/**
 * Evaluation Contract v1 (Issue #429, plan slice S81b1; V2-UX-EVAL-005 to EVAL-007): AI7's 初评 of one Book under the house
 * Evaluation Profile, in two steps on the analysis kind's one real path.
 *
 * Each Analysis Unit is read for what bears on each scored item, and every observation cites, by position in the unit
 * message, the blocks it rests on. One book-level synthesis then reads every unit's observations — never the manuscript — and
 * returns, per item, a score in whole or half points within its 满分 and a short comment, with the Book's strengths and
 * weaknesses, a next step and the conclusion AI7 would suggest. A model answer that names an item the profile does not list,
 * leaves one out, or scores outside the scale is refused whole, never trimmed.
 *
 * The same synthesis writes the market section (Issue #429, plan slice S81b2; EVAL-009): 目标读者, 差异化卖点 and 渠道与策略, and
 * the `预测 · 低确定性` block's 市场回报 and 评奖可能性 — each a statement with its basis, or `null` for `暂无法预测`. Web search is
 * not connected (ADR 0080 §7: 未联网核查), so the instruction holds it to what was read in the Book: no sales figure, no award
 * record, no other house's book. The market section is held apart from the scores: a line or a prediction that states a
 * quantity (sales, a print run, a price, a share, odds) is set aside with the reason recorded, a market part out of shape
 * reads as not written, and neither ever costs the 初评 its scores — the market section alone is "refused, never trimmed".
 *
 * The profile is frozen into the contract: its items, their 满分 and the conclusions. Changing one changes the contract digest,
 * every request digest and the schema digest every revision pins, which is the intent — a 初评 under another profile is
 * another contract. The contract scores; it never decides: the record keeps the editor's scores, and the conclusion is the
 * editor's to choose (EVAL-006, EVAL-007).
 */
export const INITIAL_EVALUATION_UNIT_RESULT_SCHEMA = 'ai7.evaluation.unit-result/1' as const;
/** Since S81b2 the synthesis also writes the market section; `/1`, its first shape, is no longer asked for. */
export const INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA = 'ai7.evaluation.synthesis-result/2' as const;
export const INITIAL_EVALUATION_PROMPT_CONTRACT_SCHEMA = 'ai7.evaluation.prompt-contract/2' as const;
export const INITIAL_EVALUATION_RESULT_SET_REVISION_SCHEMA = 'ai7.evaluation.result-set-revision/1' as const;
/** The shape that carries scope-plan facts and per-unit lineage: every 初评 after the first. */
export const INITIAL_EVALUATION_SUCCESSOR_REVISION_SCHEMA = 'ai7.evaluation.result-set-revision/2' as const;

export const MAX_UNIT_OBSERVATIONS = 40;
export const MAX_OBSERVATION_BLOCKS = 8;
export const MAX_OBSERVATION_NOTE_GRAPHEMES = 200;
export const MAX_ITEM_COMMENT_GRAPHEMES = 300;
export const MAX_SYNTHESIS_LINES = 5;
export const MAX_SYNTHESIS_LINE_GRAPHEMES = 100;
export const MAX_NEXT_STEP_GRAPHEMES = 200;
/** The market section's bounds (S81b2): its three lists as the synthesis's own lines, and each prediction's two parts. */
export const MAX_PREDICTION_STATEMENT_GRAPHEMES = 150;
export const MAX_PREDICTION_BASIS_GRAPHEMES = 200;
/** A line of the frozen prompt and of the model's free text is one line: no control character may break it or hide in it. */
const CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const ITEM_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** What the contract freezes of the house Evaluation Profile: its identity and its scored items with their 满分. */
export interface InitialEvaluationProfileInput {
  readonly profileId: string;
  readonly version: string;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly label: string; readonly fullMarks: number }>;
  readonly conclusions: ReadonlyArray<{ readonly conclusion: EvaluationConclusion; readonly label: string }>;
}

/** One observation exactly as the model listed it. */
export interface InitialEvaluationObservation {
  readonly itemId: string;
  readonly note: string;
  /** 1-based over the unit's blocks in message order: the overlap blocks first, then the own blocks. */
  readonly blockOrdinals: ReadonlyArray<number>;
}

export interface InitialEvaluationUnitResult {
  readonly schema: typeof INITIAL_EVALUATION_UNIT_RESULT_SCHEMA;
  readonly unitOrdinal: number;
  readonly observations: ReadonlyArray<InitialEvaluationObservation>;
}

export interface InitialEvaluationSynthesisResult {
  readonly schema: typeof INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA;
  /** Every scored item of the profile, once each, in the profile's order once read. */
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly score: number; readonly comment: string }>;
  readonly strengths: ReadonlyArray<string>;
  readonly weaknesses: ReadonlyArray<string>;
  readonly nextStep: string | null;
  readonly suggestedConclusion: EvaluationConclusion | null;
  /** The market section (S81b2; EVAL-009), from what was read alone; `null` when the model wrote none. */
  readonly market: InitialEvaluationMarketProjection | null;
}

/**
 * Why a unit result did not parse: the first three as every unit contract means them; `item-unknown` an observation of an item
 * the profile does not list; `block-out-of-unit` a cited position past the unit's blocks.
 */
export type InitialEvaluationUnitParseFailureCode = 'not-json' | 'schema-invalid' | 'unit-mismatch' | 'item-unknown' | 'block-out-of-unit';
/**
 * Why the synthesis did not parse: `item-unknown`, `items-incomplete` (an item missing or twice) and `score-invalid` are this
 * contract's. The market section never fails it (S81b2): what in it cannot be used is set aside with its reason.
 */
export type InitialEvaluationSynthesisParseFailureCode = 'not-json' | 'schema-invalid' | 'item-unknown' | 'items-incomplete' | 'score-invalid';

export type InitialEvaluationUnitParse =
  | { ok: true; result: InitialEvaluationUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: InitialEvaluationUnitParseFailureCode; detail: string };
export type InitialEvaluationSynthesisParse =
  | { ok: true; result: InitialEvaluationSynthesisResult }
  | { ok: false; code: InitialEvaluationSynthesisParseFailureCode; detail: string };

const UNIT_MESSAGE_HEADER = '评估单元 {ordinal}/{total} · 单元摘要 {unitDigest}' as const;
const OVERLAP_HEADER = '以下为承接上一单元的重叠上下文（仅供理解，记录依据时仍可引用）：' as const;
const OWN_HEADER = '以下为本单元的内容块：' as const;
const BLOCK_LINE = '[{blockId}] ({kind}{level}) {text}' as const;
const SYNTHESIS_HEADER = '评估综合 {closed}/{total} · 依据摘要 {setDigest}' as const;
const SYNTHESIS_ITEM_LINE = '【{itemId}】{label} · 满分 {fullMarks}' as const;
const SYNTHESIS_OBSERVATION_LINE = '- 单元 {unitOrdinal}：{note}（引用 {blocks} 个内容块）' as const;
const SYNTHESIS_NO_OBSERVATION = '- （各阅读范围都没有记下这一项的依据）' as const;

function line(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && value === value.trim() &&
    !CONTROL_CHARACTER.test(value) && graphemeCount(value) <= maximumGraphemes;
}

/** The profile exactly as the contract freezes it: every item named once, a 满分 the scale can score, the four conclusions. */
function frozenProfile(input: InitialEvaluationProfileInput): InitialEvaluationProfileInput {
  requireAnalysis(isRecord(input) && typeof input.profileId === 'string' && input.profileId.length > 0 && typeof input.version === 'string' &&
    Array.isArray(input.items) && input.items.length >= 1 && input.items.length <= 16 && Array.isArray(input.conclusions),
  'EVALUATION_PROFILE_INVALID', '评估方案无效。');
  const items = input.items.map((item) => {
    requireAnalysis(isRecord(item) && typeof item.itemId === 'string' && ITEM_ID_PATTERN.test(item.itemId) && line(item.label, 40) &&
      typeof item.fullMarks === 'number' && Number.isSafeInteger(item.fullMarks) && item.fullMarks >= 1 && item.fullMarks <= 100,
    'EVALUATION_PROFILE_INVALID', '评估方案的评分项无效。');
    return { itemId: item.itemId, label: item.label, fullMarks: item.fullMarks };
  });
  requireAnalysis(new Set(items.map((item) => item.itemId)).size === items.length, 'EVALUATION_PROFILE_INVALID', '评估方案的评分项重复。');
  const conclusions = input.conclusions.map((entry) => ({ conclusion: entry.conclusion, label: entry.label }));
  requireAnalysis(conclusions.length === EVALUATION_CONCLUSIONS.length && conclusions.every((entry, index) => entry.conclusion === EVALUATION_CONCLUSIONS[index] && line(entry.label, 20)),
    'EVALUATION_PROFILE_INVALID', '评估方案的结论无效。');
  return { profileId: input.profileId, version: input.version, items, conclusions };
}

function systemPromptOf(profile: InitialEvaluationProfileInput): string {
  return [
    `你是 AI7 的审稿评估组件，按本社评估方案「${profile.profileId}」第 ${profile.version} 版为书稿做初评。你只处理用户消息中给出的一个分析单元，逐块阅读，记下这一单元里与各评分项有关的依据。`,
    '评分项（每条以评分项编号开头；只记与这些评分项有关的依据）：',
    ...profile.items.map((item) => `- [${item.itemId}] ${item.label}（满分 ${item.fullMarks}）`),
    '本步只记依据，不打分、不下结论、不改写稿件、不调用任何工具、不引用外部资料。',
    '每条依据精确包含以下键：itemId（上面列出的评分项编号之一）、note（这条依据说明了什么，不超过 200 字素）、blockOrdinals（它所依据的内容块序号数组，至少 1 个、至多 8 个、不重复）。',
    '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.evaluation.unit-result/1"）、unitOrdinal（与用户消息头部的单元序号一致）、observations（数组，至多 40 项）。',
    '本单元没有可记的依据时输出空数组。不要编造稿件中不存在的内容。',
  ].join('\n');
}

function synthesisInstructionOf(profile: InitialEvaluationProfileInput): string {
  return [
    '以下是同一部书稿各已闭合阅读范围按评分项记下的依据。只依据这些内容，为每个评分项给出初评分数与评语。',
    '不重读稿件原文、不进行事实核查、不引用外部知识、不调用任何工具、不改写稿件。分数只是供编辑参考的初评，由编辑定分。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.evaluation.synthesis-result/2"）、items、strengths、weaknesses、nextStep、suggestedConclusion、market。',
    `items 为数组，下列每个评分项恰好一项：${profile.items.map((item) => `${item.itemId}（满分 ${item.fullMarks}）`).join('、')}；每项精确包含 itemId、score、comment。`,
    'score 是 0 到该项满分之间的整数或半分（如 15 或 15.5），不得超出满分；comment 不超过 300 字素，说明打分的依据。',
    'strengths 与 weaknesses 是字符串数组，各至多 5 条，每条不超过 100 字素；nextStep 是一句下一步建议（不超过 200 字素），没有时为 null。',
    `suggestedConclusion 取 ${profile.conclusions.map((entry) => `${entry.conclusion}（${entry.label}）`).join('、')} 之一，或为 null；它只是 AI7 的建议，结论由编辑决定。`,
    '依据不足的评分项照常打分，但在 comment 中说明依据不足。',
    'market 是市场部分，精确包含以下键：readers（目标读者）、sellingPoints（差异化卖点）、channels（渠道与策略），各为字符串数组，至多 5 条，每条不超过 100 字素；marketReturn（市场回报）与 awards（评奖可能性），各为 null 或精确包含 statement（不超过 150 字素）与 basis（不超过 200 字素）两个键的对象。',
    '市场部分同样只依据上面的依据：没有联网检索，不得声称参考了销量、获奖记录、其他出版社的图书或任何外部数据；市场部分的任何一句都不得给出数量（销量、印数、定价、份额、倍数或概率），给出数量的那一句不会被采用。依据不足以判断时 marketReturn 或 awards 为 null，界面会显示「暂无法预测」；basis 说明这一判断依据的是书稿中的哪些方面。',
  ].join('\n');
}

/** The frozen prompt contract: model-facing text, fixed formats and the profile; never manuscript content. */
export interface InitialEvaluationPromptContract {
  readonly schema: typeof INITIAL_EVALUATION_PROMPT_CONTRACT_SCHEMA;
  readonly contractVersion: typeof INITIAL_EVALUATION_CONTRACT_VERSION;
  readonly unitResultSchema: typeof INITIAL_EVALUATION_UNIT_RESULT_SCHEMA;
  readonly synthesisResultSchema: typeof INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA;
  readonly profile: InitialEvaluationProfileInput;
  readonly systemPrompt: string;
  readonly unitMessageHeader: typeof UNIT_MESSAGE_HEADER;
  readonly overlapHeader: typeof OVERLAP_HEADER;
  readonly ownHeader: typeof OWN_HEADER;
  readonly blockLine: typeof BLOCK_LINE;
  readonly synthesisInstruction: string;
  readonly synthesisHeader: typeof SYNTHESIS_HEADER;
  readonly synthesisItemLine: typeof SYNTHESIS_ITEM_LINE;
  readonly synthesisObservationLine: typeof SYNTHESIS_OBSERVATION_LINE;
  readonly synthesisNoObservation: typeof SYNTHESIS_NO_OBSERVATION;
}

export function initialEvaluationContract(input: InitialEvaluationProfileInput): InitialEvaluationPromptContract {
  const profile = frozenProfile(input);
  return {
    schema: INITIAL_EVALUATION_PROMPT_CONTRACT_SCHEMA,
    contractVersion: INITIAL_EVALUATION_CONTRACT_VERSION,
    unitResultSchema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
    profile,
    systemPrompt: systemPromptOf(profile),
    unitMessageHeader: UNIT_MESSAGE_HEADER,
    overlapHeader: OVERLAP_HEADER,
    ownHeader: OWN_HEADER,
    blockLine: BLOCK_LINE,
    synthesisInstruction: synthesisInstructionOf(profile),
    synthesisHeader: SYNTHESIS_HEADER,
    synthesisItemLine: SYNTHESIS_ITEM_LINE,
    synthesisObservationLine: SYNTHESIS_OBSERVATION_LINE,
    synthesisNoObservation: SYNTHESIS_NO_OBSERVATION,
  };
}

export function initialEvaluationContractDigest(contract: InitialEvaluationPromptContract): string {
  return sha256Hex(canonicalJson(contract));
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text);
  try {
    return { ok: true, value: JSON.parse(fenced?.[1] ?? text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Admit one unit result: exactly the contract's keys, items the profile lists, positions within the unit. */
export function parseInitialEvaluationUnitResult(
  text: string,
  expected: { unitOrdinal: number; blockCount: number; itemIds: ReadonlyArray<string> },
): InitialEvaluationUnitParse {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  const value = parsed.value;
  const invalid = (detail: string): InitialEvaluationUnitParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'unitOrdinal', 'observations'])) return invalid('单元结果键集合不符合评估契约 v1。');
  if (value.schema !== INITIAL_EVALUATION_UNIT_RESULT_SCHEMA) return invalid('单元结果 schema 不是评估契约 v1。');
  if (!Number.isSafeInteger(value.unitOrdinal) || (value.unitOrdinal as number) < 1) return invalid('单元序号无效。');
  if (value.unitOrdinal !== expected.unitOrdinal) {
    return { ok: false, code: 'unit-mismatch', detail: `单元结果声明的序号 ${String(value.unitOrdinal)} 与请求单元 ${expected.unitOrdinal} 不一致。` };
  }
  if (!Array.isArray(value.observations) || value.observations.length > MAX_UNIT_OBSERVATIONS) return invalid('依据集合不符合评估契约 v1。');
  const observations: InitialEvaluationObservation[] = [];
  for (const [index, candidate] of (value.observations as unknown[]).entries()) {
    const label = `第 ${index + 1} 条依据`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['itemId', 'note', 'blockOrdinals'])) return invalid(`${label}的键集合不符合评估契约 v1。`);
    if (typeof candidate.itemId !== 'string') return invalid(`${label}的评分项编号无效。`);
    if (!expected.itemIds.includes(candidate.itemId)) {
      return { ok: false, code: 'item-unknown', detail: `${label}的评分项 ${candidate.itemId.slice(0, 64)} 不在评估方案内。` };
    }
    if (!line(candidate.note, MAX_OBSERVATION_NOTE_GRAPHEMES)) return invalid(`${label}的说明缺失、含有控制字符或超出 200 字素边界。`);
    const ordinals = candidate.blockOrdinals;
    if (!Array.isArray(ordinals) || ordinals.length < 1 || ordinals.length > MAX_OBSERVATION_BLOCKS ||
        !ordinals.every((ordinal) => Number.isSafeInteger(ordinal) && (ordinal as number) >= 1) || new Set(ordinals).size !== ordinals.length) {
      return invalid(`${label}的内容块序号无效。`);
    }
    const outside = (ordinals as number[]).find((ordinal) => ordinal > expected.blockCount);
    if (outside !== undefined) {
      return { ok: false, code: 'block-out-of-unit', detail: `${label}引用的内容块序号 ${outside} 不在本单元列出的 ${expected.blockCount} 个内容块内。` };
    }
    observations.push({ itemId: candidate.itemId, note: candidate.note, blockOrdinals: [...(ordinals as number[])] });
  }
  const result: InitialEvaluationUnitResult = { schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: expected.unitOrdinal, observations };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}

function boundedLines(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_SYNTHESIS_LINES && value.every((entry) => line(entry, MAX_SYNTHESIS_LINE_GRAPHEMES));
}

const MARKET_LISTS = [['readers', '目标读者'], ['sellingPoints', '差异化卖点'], ['channels', '渠道与策略']] as const;
const MARKET_PREDICTIONS = [['marketReturn', '市场回报'], ['awards', '评奖可能性']] as const;
const MARKET_KEYS = ['readers', 'sellingPoints', 'channels', 'marketReturn', 'awards'] as const;

/**
 * The market section as AI7 may show it (S81b2; EVAL-009): each part held to its shape, and each line or prediction that
 * states a quantity set aside. What is set aside is said in `withheld`, one reason a part; a part out of shape reads as not
 * written (an empty list, `暂无法预测`). `null` when the model wrote no market section at all.
 */
function marketOf(value: unknown): InitialEvaluationMarketProjection | null {
  if (value === undefined) return null;
  const withheld: string[] = [];
  if (!isRecord(value) || !hasExactKeys(value, [...MARKET_KEYS])) {
    return { readers: [], sellingPoints: [], channels: [], marketReturn: null, awards: null, withheld: ['AI7 写出的市场部分不合格式，没有采用。'] };
  }
  const lists: Record<string, string[]> = {};
  for (const [key, label] of MARKET_LISTS) {
    const candidate = value[key];
    if (!boundedLines(candidate)) {
      lists[key] = [];
      withheld.push(`AI7 写出的${label}不合格式，没有采用。`);
      continue;
    }
    const kept = candidate.filter((entry) => !claimsQuantity(entry));
    if (kept.length < candidate.length) withheld.push(`AI7 写出的${label}有 ${candidate.length - kept.length} 条给出了数量，没有采用：只依据所读书稿，不能给出销量、印数、定价或概率。`);
    lists[key] = kept;
  }
  const predictions: Record<string, InitialEvaluationPredictionProjection | null> = {};
  for (const [key, label] of MARKET_PREDICTIONS) {
    const candidate = value[key];
    predictions[key] = null;
    if (candidate === null) continue;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['statement', 'basis']) || !line(candidate.statement, MAX_PREDICTION_STATEMENT_GRAPHEMES) ||
        !line(candidate.basis, MAX_PREDICTION_BASIS_GRAPHEMES)) {
      withheld.push(`AI7 写出的${label}预测不合格式，没有采用。`);
      continue;
    }
    if (claimsQuantity(candidate.statement) || claimsQuantity(candidate.basis)) {
      withheld.push(`AI7 写出的${label}预测给出了数量，没有采用：只依据所读书稿，不能给出销量、印数、定价或概率。`);
      continue;
    }
    predictions[key] = { statement: candidate.statement, basis: candidate.basis };
  }
  return {
    readers: lists['readers']!, sellingPoints: lists['sellingPoints']!, channels: lists['channels']!,
    marketReturn: predictions['marketReturn']!, awards: predictions['awards']!, withheld,
  };
}

const SYNTHESIS_KEYS = ['schema', 'items', 'strengths', 'weaknesses', 'nextStep', 'suggestedConclusion'] as const;

/**
 * Admit the synthesis: every scored item of the profile exactly once, each score a whole or half point within its 满分, and
 * nothing the profile does not name. The items are returned in the profile's order whatever order the model wrote them in.
 */
export function parseInitialEvaluationSynthesis(text: string, profile: Pick<InitialEvaluationProfileInput, 'items'>): InitialEvaluationSynthesisParse {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  const value = parsed.value;
  const invalid = (detail: string): InitialEvaluationSynthesisParse => ({ ok: false, code: 'schema-invalid', detail });
  // The market key may be missing: an answer without it keeps its scores and reads as having no market section (S81b2).
  if (!isRecord(value) || !(hasExactKeys(value, [...SYNTHESIS_KEYS, 'market']) || hasExactKeys(value, [...SYNTHESIS_KEYS]))) {
    return invalid('全书综合的键集合不符合评估契约 v1。');
  }
  if (value.schema !== INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA) return invalid('全书综合 schema 不是评估契约 v1。');
  if (!Array.isArray(value.items)) return invalid('评分项集合不符合评估契约 v1。');
  const byId = new Map<string, { itemId: string; score: number; comment: string }>();
  for (const [index, candidate] of (value.items as unknown[]).entries()) {
    const label = `第 ${index + 1} 个评分项`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['itemId', 'score', 'comment']) || typeof candidate.itemId !== 'string') {
      return invalid(`${label}的键集合不符合评估契约 v1。`);
    }
    const item = profile.items.find((entry) => entry.itemId === candidate.itemId);
    if (item === undefined) return { ok: false, code: 'item-unknown', detail: `${label}的评分项 ${candidate.itemId.slice(0, 64)} 不在评估方案内。` };
    if (byId.has(item.itemId)) return { ok: false, code: 'items-incomplete', detail: `评分项 ${item.itemId} 出现了不止一次。` };
    if (typeof candidate.score !== 'number' || !validEvaluationScore(candidate.score, item.fullMarks)) {
      return { ok: false, code: 'score-invalid', detail: `评分项 ${item.itemId} 的分数不是 0 到 ${item.fullMarks} 之间的整数或半分。` };
    }
    if (!line(candidate.comment, MAX_ITEM_COMMENT_GRAPHEMES)) return invalid(`评分项 ${item.itemId} 的评语缺失、含有控制字符或超出 300 字素边界。`);
    byId.set(item.itemId, { itemId: item.itemId, score: candidate.score, comment: candidate.comment });
  }
  const missing = profile.items.find((item) => !byId.has(item.itemId));
  if (missing !== undefined) return { ok: false, code: 'items-incomplete', detail: `没有给出评分项 ${missing.itemId} 的分数。` };
  if (!boundedLines(value.strengths) || !boundedLines(value.weaknesses)) return invalid('主要优点或主要问题不符合评估契约 v1。');
  if (!(value.nextStep === null || line(value.nextStep, MAX_NEXT_STEP_GRAPHEMES))) return invalid('下一步建议不符合评估契约 v1。');
  const conclusion = value.suggestedConclusion;
  if (!(conclusion === null || EVALUATION_CONCLUSIONS.includes(conclusion as EvaluationConclusion))) return invalid('建议结论不在闭合集合内。');
  return {
    ok: true,
    result: {
      schema: INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
      items: profile.items.map((item) => byId.get(item.itemId)!),
      strengths: [...value.strengths],
      weaknesses: [...value.weaknesses],
      nextStep: value.nextStep as string | null,
      suggestedConclusion: conclusion as EvaluationConclusion | null,
      market: marketOf(value.market),
    },
  };
}

// ---- the unit message ---------------------------------------------------------------------------------------------

/** The prefix `评估单元` is this contract's and no other's: the deterministic adapter tells a request's kind by its header alone. */
const UNIT_HEADER_PATTERN = /^评估单元 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64})$/u;
const SYNTHESIS_HEADER_PATTERN = /^评估综合 (\d+)\/(\d+) · 依据摘要 ([0-9a-f]{64})$/u;

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (placeholder, key: string) => values[key] ?? placeholder);
}

/** The block identities of one unit in message order: the overlap context first, then the own blocks. */
export function initialEvaluationMessageBlockIds(unit: CoverageManifestUnitProjection): string[] {
  return [...unit.overlapBlockIds, ...unit.blockIds];
}

function requireBlock<T>(blocksById: ReadonlyMap<string, T>, blockId: string): T {
  const block = blocksById.get(blockId);
  if (block === undefined) throw new Error('ANALYSIS_UNIT_BLOCK_MISSING');
  return block;
}

/** The exact user-role message for one Analysis Unit: header, optional overlap context, then own blocks. */
export function buildInitialEvaluationUnitMessage(
  contract: InitialEvaluationPromptContract,
  unit: CoverageManifestUnitProjection,
  totalUnits: number,
  blocksById: ReadonlyMap<string, Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>>,
): string {
  const blockLine = (block: Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>): string =>
    fill(contract.blockLine, { blockId: block.blockId, kind: block.kind, level: block.level === null ? '' : ` h${block.level}`, text: block.text });
  const lines = [fill(contract.unitMessageHeader, { ordinal: String(unit.ordinal), total: String(totalUnits), unitDigest: unit.digest })];
  if (unit.overlapBlockIds.length > 0) {
    lines.push(contract.overlapHeader);
    for (const blockId of unit.overlapBlockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  }
  lines.push(contract.ownHeader);
  for (const blockId of unit.blockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  return lines.join('\n');
}

/** Recover the unit identity from a message built by {@link buildInitialEvaluationUnitMessage}; `null` for anything else. */
export function parseInitialEvaluationUnitMessageHeader(text: string): { ordinal: number; total: number; unitDigest: string } | null {
  const match = UNIT_HEADER_PATTERN.exec(text.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal) return null;
  return { ordinal, total, unitDigest: match[3]! };
}

/** The request digest a deterministic fixture keys a unit by: a pure function of the frozen contract and the manifest unit. */
export function initialEvaluationRequestDigest(promptContractDigest: string, unitOrdinal: number, unitDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, step: 'unit', unitOrdinal, unitDigest }));
}

// ---- the book-level synthesis ---------------------------------------------------------------------------------------

/** One closed unit of the Run's complete unit set, as the execution owner holds it. */
export interface ClosedInitialEvaluationUnit {
  readonly unitOrdinal: number;
  readonly result: InitialEvaluationUnitResult;
}

function orderedClosed(closed: ReadonlyArray<ClosedInitialEvaluationUnit>): ClosedInitialEvaluationUnit[] {
  return [...closed].sort((left, right) => left.unitOrdinal - right.unitOrdinal);
}

/**
 * The digest of what the synthesis reads: every closed unit's observations in unit order. Positions, not block identities, so
 * the same manuscript imported again asks the same question.
 */
export function initialEvaluationObservationSetDigest(closed: ReadonlyArray<ClosedInitialEvaluationUnit>): string {
  return sha256Hex(canonicalJson(orderedClosed(closed).map(({ unitOrdinal, result }) => ({ unitOrdinal, observations: result.observations }))));
}

/** The exact user-role message for the synthesis: header, the frozen instruction, then each item with its observations. */
export function buildInitialEvaluationSynthesisMessage(
  contract: InitialEvaluationPromptContract,
  closed: ReadonlyArray<ClosedInitialEvaluationUnit>,
  totalUnits: number,
): string {
  const units = orderedClosed(closed);
  const lines = [
    fill(contract.synthesisHeader, { closed: String(units.length), total: String(totalUnits), setDigest: initialEvaluationObservationSetDigest(units) }),
    contract.synthesisInstruction,
  ];
  for (const item of contract.profile.items) {
    lines.push(fill(contract.synthesisItemLine, { itemId: item.itemId, label: item.label, fullMarks: String(item.fullMarks) }));
    let any = false;
    for (const unit of units) {
      for (const observation of unit.result.observations) {
        if (observation.itemId !== item.itemId) continue;
        any = true;
        lines.push(fill(contract.synthesisObservationLine, { unitOrdinal: String(unit.unitOrdinal), note: observation.note, blocks: String(observation.blockOrdinals.length) }));
      }
    }
    if (!any) lines.push(contract.synthesisNoObservation);
  }
  return lines.join('\n');
}

/** Recover the synthesis identity from a message built by {@link buildInitialEvaluationSynthesisMessage}; `null` for anything else. */
export function parseInitialEvaluationSynthesisMessageHeader(text: string): { closed: number; total: number; setDigest: string } | null {
  const match = SYNTHESIS_HEADER_PATTERN.exec(text.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const closed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(closed) || closed < 1 || !Number.isSafeInteger(total) || total < closed) return null;
  return { closed, total, setDigest: match[3]! };
}

/** The request digest of the synthesis, keyed under unit ordinal `0`: a pure function of the frozen contract and what it reads. */
export function initialEvaluationSynthesisRequestDigest(promptContractDigest: string, setDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(setDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, step: 'synthesis', observationSetDigest: setDigest }));
}
