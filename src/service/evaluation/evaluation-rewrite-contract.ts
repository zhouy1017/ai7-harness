import { type SalvagedModelResult, extractModelJson, normalizeLine, type ModelResultSalvage, DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, requireAnalysis, sha256Hex } from '../analysis/canonical.js';
import { EVALUATION_REWRITE_CONTRACT_VERSION, type CoverageManifestUnitProjection } from '../../shared/protocol.js';
import type { ManifestBlockInput } from '../analysis/coverage-manifest.js';
import { graphemeCount } from '../analysis/factual-review-contract.js';
import { claimsConclusion, claimsScore, scoreDenominators } from './claim-guards.js';
import { withinEvaluationBytes, normalizeEvaluationLine } from './initial-evaluation-contract.js';

/**
 * Evaluation Rewrite Contract v1 (Issue #429, plan slice S81b2; V2-UX-EVAL-008): `按我的评分重写评语` — AI7 rewrites one
 * Evaluation Record version's item 评语 and its 总评 to the editor's scores, in two steps on the analysis kind's one real path.
 *
 * Each Analysis Unit is read for what bears out the editor's score of each scored item — the passages a comment written to that
 * score can rest on — each citing, by position in the unit message, the blocks it rests on. One book-level synthesis then reads
 * the version's words and every unit's notes — never the manuscript — and writes one 评语 for every item the editor scored and
 * one 总评. A model answer outside the keys or the bounds, or one that leaves a scored item out, names one twice or names one
 * the editor did not score, is refused whole, never trimmed. A 评语 or the 总评 that states a score or names one of the
 * profile's conclusions is not offered (S81b2 review): the numbers and the conclusion are the editor's. That one is set aside
 * with its reason and the rest stand, so one sentence never costs the others.
 *
 * The version is frozen into the contract by its words alone: each item's label and 满分, the editor's score or `不评` with its
 * reason, the comment as it stands, AI7's 初评 score and comment, and the reasons the editor gave for departing from AI7; the
 * strengths, the weaknesses and the 总评 as they stand. Identities and times are not words of the version, so the same words
 * asked again ask the same question. The contract carries no number for the model to write and none is read from its answer:
 * the scores are the editor's and stay theirs. Its words are a proposal the editor 采用 or 放弃; nothing is recorded until then.
 */
export const EVALUATION_REWRITE_UNIT_RESULT_SCHEMA = 'ai7.evaluation-rewrite.unit-result/1' as const;
export const EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA = 'ai7.evaluation-rewrite.synthesis-result/1' as const;
export const EVALUATION_REWRITE_PROMPT_CONTRACT_SCHEMA = 'ai7.evaluation-rewrite.prompt-contract/1' as const;
export const EVALUATION_REWRITE_RESULT_SET_REVISION_SCHEMA = 'ai7.evaluation-rewrite.result-set-revision/1' as const;
/**
 * Contract `/2` (Issue #1407, 按我的修改重新生成): the model reads AI7's whole original report — its strengths, problems, next
 * step, suggested conclusion and market lists — beside the editor's edited report — scores, 评语, lines, 总评, risks, what is
 * still missing and the conclusion they chose — and writes a new version of the report: every scored item's 评语, the 总评 with
 * the next step, and the strengths and problems. Scores and the conclusion stay the editor's constraints. A contract input
 * without `report` is a `/1` Task's, frozen before it existed, and keeps its own prompt and result shape.
 */
export const EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA_V2 = 'ai7.evaluation-rewrite.synthesis-result/2' as const;
export const EVALUATION_REWRITE_PROMPT_CONTRACT_SCHEMA_V2 = 'ai7.evaluation-rewrite.prompt-contract/2' as const;
/** The strengths and the problems a regenerated report offers at most, each line at most this long. */
export const MAX_REWRITTEN_LINES = 5;
export const MAX_REWRITTEN_LINE_GRAPHEMES = 100;
/** The shape that carries scope-plan facts and per-unit lineage: every rewrite after the first. */
export const EVALUATION_REWRITE_SUCCESSOR_REVISION_SCHEMA = 'ai7.evaluation-rewrite.result-set-revision/2' as const;

export const MAX_UNIT_OBSERVATIONS = 30;
export const MAX_OBSERVATION_BLOCKS = 8;
export const MAX_OBSERVATION_NOTE_GRAPHEMES = 200;
/** A rewritten 评语 and 总评 at most; both well within what the record keeps (1000 and 2000). */
export const MAX_REWRITTEN_COMMENT_GRAPHEMES = 300;
export const MAX_REWRITTEN_VERDICT_GRAPHEMES = 600;
/** A line of the frozen prompt and of the model's free text is one line: no control character may break it or hide in it. */
const CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;
/** The record's own text: a line break is its own (`oneLine` reads it as `／`); no other control or separator character is. */
const RECORD_CONTROL_CHARACTER = /[\p{Zl}\p{Zp}]|(?![\n])\p{Cc}/u;
const LINE_BREAKS = /\r\n?|\n/gu;
const ITEM_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** One item of the version, in its words. */
export interface EvaluationRewriteItemInput {
  readonly itemId: string;
  readonly label: string;
  readonly description?: string;
  readonly fullMarks: number;
  /** The editor's score, or `null` while unscored or `不评`. */
  readonly score: number | null;
  /** `不评`, with its reason. */
  readonly notRated: string | null;
  /** The 评语 as it stands: AI7's, or the editor's own. */
  readonly comment: string | null;
  /** AI7's 初评 of the item the version began from. */
  readonly ai7: { readonly score: number | null; readonly comment: string | null };
  /** The reasons the editor gave for departing from AI7's score, in their words; `null` when none were given. */
  readonly adjustment: null | { readonly reasons: ReadonlyArray<string>; readonly note: string | null };
}

/** What the contract freezes of one version at one saved entry: its words, never its identity or its time. */
export interface EvaluationRewriteContractInput {
  readonly profile: { readonly title: string; readonly version: string };
  readonly items: ReadonlyArray<EvaluationRewriteItemInput>;
  readonly strengths: ReadonlyArray<string>;
  readonly weaknesses: ReadonlyArray<string>;
  readonly verdict: string | null;
  /** The profile's conclusions in its words: a rewritten 评语 or 总评 that names one is not offered. */
  readonly conclusions: ReadonlyArray<string>;
  /** Contract `/2`'s whole-report context (Issue #1407); absent from a `/1` Task's frozen input. */
  readonly report?: EvaluationRewriteReportInput;
}

/** AI7's original report and the editor's other report fields, in their words: what a `/2` regeneration reads besides the items. */
export interface EvaluationRewriteReportInput {
  readonly ai7: {
    readonly strengths: ReadonlyArray<string>;
    readonly weaknesses: ReadonlyArray<string>;
    readonly nextStep: string | null;
    /** The conclusion AI7 suggested, in the profile's words. */
    readonly suggestedConclusion: string | null;
    readonly market: null | { readonly readers: ReadonlyArray<string>; readonly sellingPoints: ReadonlyArray<string>; readonly channels: ReadonlyArray<string> };
  };
  /** Each risk item as the editor left it: its label, level in words (低 / 中 / 高) and statement. */
  readonly risks: ReadonlyArray<{ readonly label: string; readonly level: string | null; readonly statement: string | null }>;
  readonly readiness: ReadonlyArray<string>;
  /** The conclusion the editor chose, in the profile's words; `null` while none is. */
  readonly conclusion: string | null;
}

/** One observation exactly as the model listed it. */
export interface EvaluationRewriteObservation {
  readonly itemId: string;
  readonly note: string;
  /** 1-based over the unit's blocks in message order: the overlap blocks first, then the own blocks. */
  readonly blockOrdinals: ReadonlyArray<number>;
}

export interface EvaluationRewriteUnitResult extends SalvagedModelResult {
  readonly schema: typeof EVALUATION_REWRITE_UNIT_RESULT_SCHEMA;
  readonly unitOrdinal: number;
  readonly observations: ReadonlyArray<EvaluationRewriteObservation>;
}

export interface EvaluationRewriteSynthesisResult extends SalvagedModelResult {
  readonly schema: typeof EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA | typeof EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA_V2;
  /** Every item the editor scored whose 评语 may be offered, once each, in the profile's order once read. */
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly comment: string }>;
  /** The rewritten 总评, or `null` when it is not offered. */
  readonly verdict: string | null;
  /** What was written but is not offered, and why: an item's 评语 (`itemId`), or the 总评 or a line (`null`). */
  readonly withheld: ReadonlyArray<{ readonly itemId: string | null; readonly reason: string }>;
  /** Contract `/2`: the regenerated strengths and problems, or `null` when none was offered; absent from a `/1` result. */
  readonly strengths?: ReadonlyArray<string> | null;
  readonly weaknesses?: ReadonlyArray<string> | null;
}

/**
 * Why a unit result did not parse: the first three as every unit contract means them; `item-unknown` an observation of an item
 * the editor did not score; `block-out-of-unit` a cited position past the unit's blocks.
 */
export type EvaluationRewriteUnitParseFailureCode = 'not-json' | 'schema-invalid' | 'unit-mismatch' | 'item-unknown' | 'block-out-of-unit';
/** `item-unknown` a comment for an item the editor did not score; `items-incomplete` a scored item left out or written twice. */
export type EvaluationRewriteSynthesisParseFailureCode = 'not-json' | 'schema-invalid' | 'item-unknown' | 'items-incomplete';

export type EvaluationRewriteUnitParse =
  | { ok: true; salvaged?: SalvagedModelResult['salvaged']; result: EvaluationRewriteUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: EvaluationRewriteUnitParseFailureCode; detail: string };
export type EvaluationRewriteSynthesisParse =
  | { ok: true; salvaged?: SalvagedModelResult['salvaged']; result: EvaluationRewriteSynthesisResult }
  | { ok: false; code: EvaluationRewriteSynthesisParseFailureCode; detail: string };

const UNIT_MESSAGE_HEADER = '评语重写单元 {ordinal}/{total} · 单元摘要 {unitDigest}' as const;
const OVERLAP_HEADER = '以下为承接上一单元的重叠上下文（仅供理解，记录依据时仍可引用）：' as const;
const OWN_HEADER = '以下为本单元的内容块：' as const;
const BLOCK_LINE = '[{blockId}] ({kind}{level}) {text}' as const;
const SYNTHESIS_HEADER = '评语重写综合 {closed}/{total} · 依据摘要 {setDigest}' as const;
const SYNTHESIS_ITEM_LINE = '【{itemId}】{label} · 编辑的得分 {score} / {fullMarks}' as const;
const SYNTHESIS_OBSERVATION_LINE = '- 单元 {unitOrdinal}：{note}（引用 {blocks} 个内容块）' as const;
const SYNTHESIS_NO_OBSERVATION = '- （各阅读范围都没有记下这一项的依据）' as const;

function line(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && value === value.trim() &&
    !CONTROL_CHARACTER.test(value) && graphemeCount(value) <= maximumGraphemes && withinEvaluationBytes(value, maximumGraphemes);
}

function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= maximum &&
    !RECORD_CONTROL_CHARACTER.test(value);
}

/** The record's own text as one prompt line: each line break read as `／`, nothing else touched. */
function oneLine(value: string): string {
  return value.replace(LINE_BREAKS, '／');
}

function score(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A score as the record holds it: a whole or half point, finite and never negative. */
function halfPoint(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value * 2);
}

/** The contract input exactly as it freezes: the version's words of the closed shape, at least one scored item. */
function frozenInput(input: EvaluationRewriteContractInput): EvaluationRewriteContractInput {
  requireAnalysis(isRecord(input) && isRecord(input.profile) && text(input.profile.title, 80) && text(input.profile.version, 32) &&
    Array.isArray(input.items) && input.items.length >= 1 && input.items.length <= 16 && Array.isArray(input.strengths) &&
    Array.isArray(input.weaknesses) && (input.verdict === null || text(input.verdict, 4_000)) &&
    Array.isArray(input.conclusions) && input.conclusions.length >= 1 && input.conclusions.every((label) => text(label, 20)),
  'EVALUATION_REWRITE_INPUT_INVALID', '评语重写所依据的评估版本无效。');
  const items = input.items.map((given): EvaluationRewriteItemInput => {
    const item = given as EvaluationRewriteItemInput;
    requireAnalysis(isRecord(item) && typeof item.itemId === 'string' && ITEM_ID_PATTERN.test(item.itemId) && text(item.label, 40) &&
      Number.isSafeInteger(item.fullMarks) && item.fullMarks >= 1 &&
      (item.score === null || (halfPoint(item.score) && item.score <= item.fullMarks)) && (item.notRated === null || text(item.notRated, 400)) &&
      !(item.score !== null && item.notRated !== null) && (item.comment === null || text(item.comment, 4_000)) &&
      isRecord(item.ai7) && (item.ai7.score === null || halfPoint(item.ai7.score)) && (item.ai7.comment === null || text(item.ai7.comment, 4_000)) &&
      (item.adjustment === null || (isRecord(item.adjustment) && Array.isArray(item.adjustment.reasons) && item.adjustment.reasons.length >= 1 &&
        item.adjustment.reasons.every((reason) => text(reason, 20)) && (item.adjustment.note === null || text(item.adjustment.note, 400)))),
    'EVALUATION_REWRITE_INPUT_INVALID', '评语重写所依据的评分项无效。');
    requireAnalysis(item.description === undefined || item.description === '' || text(item.description, 500), 'EVALUATION_PROFILE_INVALID', '评分项说明无效。');
    return {
      itemId: item.itemId,
      label: item.label,
      ...(item.description === undefined ? {} : { description: item.description }),
      fullMarks: item.fullMarks,
      score: item.score,
      notRated: item.notRated,
      comment: item.comment,
      ai7: { score: item.ai7.score, comment: item.ai7.comment },
      adjustment: item.adjustment === null ? null : { reasons: [...item.adjustment.reasons], note: item.adjustment.note },
    };
  });
  requireAnalysis(new Set(items.map((item) => item.itemId)).size === items.length && items.some((item) => item.score !== null),
    'EVALUATION_REWRITE_INPUT_INVALID', '评语重写要至少有一项已打分。');
  const lines = (list: ReadonlyArray<string>): string[] => {
    requireAnalysis(list.every((entry) => text(entry, 400)), 'EVALUATION_REWRITE_INPUT_INVALID', '评语重写所依据的评估版本无效。');
    return [...list];
  };
  return {
    profile: { title: input.profile.title, version: input.profile.version },
    items,
    strengths: lines(input.strengths),
    weaknesses: lines(input.weaknesses),
    verdict: input.verdict,
    conclusions: [...input.conclusions],
    ...(input.report === undefined ? {} : { report: frozenReport(input.report, lines) }),
  };
}

function frozenReport(report: EvaluationRewriteReportInput, lines: (list: ReadonlyArray<string>) => string[]): EvaluationRewriteReportInput {
  const optional = (value: unknown, maximum: number): boolean => value === null || text(value, maximum);
  const ai7 = report.ai7;
  requireAnalysis(isRecord(report) && isRecord(ai7) && Array.isArray(ai7.strengths) && Array.isArray(ai7.weaknesses) &&
    optional(ai7.nextStep, 400) && optional(ai7.suggestedConclusion, 20) &&
    (ai7.market === null || (isRecord(ai7.market) && Array.isArray(ai7.market.readers) && Array.isArray(ai7.market.sellingPoints) && Array.isArray(ai7.market.channels))) &&
    Array.isArray(report.risks) && report.risks.every((risk) => isRecord(risk) && text(risk.label, 40) && optional(risk.level, 4) && optional(risk.statement, 4_000)) &&
    Array.isArray(report.readiness) && optional(report.conclusion, 20),
  'EVALUATION_REWRITE_INPUT_INVALID', '评估报告重新生成所依据的报告无效。');
  return {
    ai7: {
      strengths: lines(ai7.strengths),
      weaknesses: lines(ai7.weaknesses),
      nextStep: ai7.nextStep,
      suggestedConclusion: ai7.suggestedConclusion,
      market: ai7.market === null ? null : { readers: lines(ai7.market.readers), sellingPoints: lines(ai7.market.sellingPoints), channels: lines(ai7.market.channels) },
    },
    risks: report.risks.map((risk) => ({ label: risk.label, level: risk.level, statement: risk.statement })),
    readiness: lines(report.readiness),
    conclusion: report.conclusion,
  };
}

/** The items the editor scored: the ones a rewrite writes a 评语 for. */
export function evaluationRewriteScoredItems(input: Pick<EvaluationRewriteContractInput, 'items'>): EvaluationRewriteItemInput[] {
  return input.items.filter((item) => item.score !== null);
}

/** The version as the prompt states it, one line each: the editor's scores and words, never to be changed. */
function versionLines(input: EvaluationRewriteContractInput): string[] {
  const lines = [`- 评估方案：${input.profile.title} 第 ${input.profile.version} 版`];
  for (const item of input.items) {
    const own = item.notRated !== null ? `不评（${oneLine(item.notRated)}）` : item.score === null ? '未打分' : `编辑的得分 ${score(item.score)}`;
    lines.push(`- 评分项【${item.itemId}】「${item.label}」（满分 ${item.fullMarks}）：${own}${item.description ? `；评分项说明：${item.description}` : ''}${item.comment === null ? '' : `；现在的评语：${oneLine(item.comment)}`}`);
    const ai7 = item.ai7.score === null ? 'AI7 初评未给分' : `AI7 初评 ${score(item.ai7.score)} 分`;
    lines.push(`  ${ai7}${item.ai7.comment === null ? '' : `；AI7 的评语：${oneLine(item.ai7.comment)}`}`);
    if (item.adjustment !== null) {
      lines.push(`  编辑调分的原因：${item.adjustment.reasons.join('、')}${item.adjustment.note === null ? '' : `（${oneLine(item.adjustment.note)}）`}`);
    }
  }
  if (input.strengths.length > 0) lines.push(`- 主要优点：${input.strengths.map(oneLine).join('；')}`);
  if (input.weaknesses.length > 0) lines.push(`- 主要问题：${input.weaknesses.map(oneLine).join('；')}`);
  lines.push(input.verdict === null ? '- 总评：（尚未写）' : `- 总评：${oneLine(input.verdict)}`);
  return lines;
}

/** Contract `/2`'s whole-report lines: the editor's other fields, then AI7's original report. */
function reportLines(report: EvaluationRewriteReportInput): string[] {
  const lines: string[] = [];
  for (const risk of report.risks) {
    lines.push(`- 风险项「${risk.label}」：${risk.level === null ? '未定级' : `${risk.level}风险`}${risk.statement === null ? '' : `；说明：${oneLine(risk.statement)}`}`);
  }
  if (report.readiness.length > 0) lines.push(`- 距离可出版还差：${report.readiness.map(oneLine).join('；')}`);
  lines.push(report.conclusion === null ? '- 编辑选定的结论：（尚未选定）' : `- 编辑选定的结论：${report.conclusion}`);
  lines.push('以下是 AI7 的原报告（供参照；与编辑的修改不一致处，以编辑为准）：');
  const ai7 = report.ai7;
  if (ai7.strengths.length > 0) lines.push(`- 原报告的主要优点：${ai7.strengths.map(oneLine).join('；')}`);
  if (ai7.weaknesses.length > 0) lines.push(`- 原报告的主要问题：${ai7.weaknesses.map(oneLine).join('；')}`);
  if (ai7.nextStep !== null) lines.push(`- 原报告的下一步建议：${oneLine(ai7.nextStep)}`);
  if (ai7.suggestedConclusion !== null) lines.push(`- 原报告建议的结论：${ai7.suggestedConclusion}`);
  if (ai7.market !== null) {
    if (ai7.market.readers.length > 0) lines.push(`- 原报告的目标读者：${ai7.market.readers.map(oneLine).join('；')}`);
    if (ai7.market.sellingPoints.length > 0) lines.push(`- 原报告的差异化卖点：${ai7.market.sellingPoints.map(oneLine).join('；')}`);
    if (ai7.market.channels.length > 0) lines.push(`- 原报告的渠道与策略：${ai7.market.channels.map(oneLine).join('；')}`);
  }
  return lines;
}

function systemPromptOf(input: EvaluationRewriteContractInput): string {
  const scored = evaluationRewriteScoredItems(input);
  if (input.report !== undefined) {
    return [
      '你是 AI7 的评估报告重新生成组件，按编辑修改后的评估报告重新生成一份新版报告。你只处理用户消息中给出的一个分析单元，逐块阅读，记下能说明编辑所给分数与修改的依据。',
      '以下是编辑修改后的这一版评估报告（编辑的评分与判断，照录，不得改动）：',
      ...versionLines(input),
      ...reportLines(input.report),
      `只为编辑已打分的评分项记依据：${scored.map((item) => `${item.itemId}（${item.label}）`).join('、')}。`,
      '本步只记依据，不打分、不改分、不写评语、不下结论、不改写稿件、不调用任何工具、不引用外部资料。',
      '每条依据精确包含以下键：itemId（上面列出的评分项编号之一）、note（这条依据如何说明编辑所给的分数与修改，不超过 200 字素）、blockOrdinals（它所依据的内容块序号数组，至少 1 个、至多 8 个、不重复）。',
      '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
      '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
      'schema（固定为 "ai7.evaluation-rewrite.unit-result/1"）、unitOrdinal（与用户消息头部的单元序号一致）、observations（数组，至多 30 项）。',
      '本单元没有可记的依据时输出空数组。不要编造稿件中不存在的内容。',
    ].join('\n');
  }
  return [
    '你是 AI7 的评语重写组件，按编辑给出的分数重写一份评估记录的评语。你只处理用户消息中给出的一个分析单元，逐块阅读，记下能说明编辑所给分数的依据。',
    '以下是这一版评估（编辑的评分与判断，照录，不得改动）：',
    ...versionLines(input),
    `只为编辑已打分的评分项记依据：${scored.map((item) => `${item.itemId}（${item.label}）`).join('、')}。`,
    '本步只记依据，不打分、不改分、不写评语、不下结论、不改写稿件、不调用任何工具、不引用外部资料。',
    '每条依据精确包含以下键：itemId（上面列出的评分项编号之一）、note（这条依据如何说明编辑所给的分数，不超过 200 字素）、blockOrdinals（它所依据的内容块序号数组，至少 1 个、至多 8 个、不重复）。',
    '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.evaluation-rewrite.unit-result/1"）、unitOrdinal（与用户消息头部的单元序号一致）、observations（数组，至多 30 项）。',
    '本单元没有可记的依据时输出空数组。不要编造稿件中不存在的内容。',
  ].join('\n');
}

function synthesisInstructionOf(input: EvaluationRewriteContractInput): string {
  const scored = evaluationRewriteScoredItems(input);
  if (input.report !== undefined) {
    return [
      '以下是同一部书稿各已闭合阅读范围按评分项记下的依据。依据系统提示中编辑修改后的评估报告、AI7 的原报告与这些依据，重新生成一份新版评估报告。',
      '新版报告与编辑的分数和修改一致：编辑比 AI7 打分低的项写清它的不足，打分高的项写清它的长处；编辑改写过的评语、优点、问题、总评与调分原因中的判断要保留并展开；原报告中仍然成立的内容可以保留。',
      `不改任何分数，也不在评语、总评、优点或问题里写分数；不改编辑选定的结论，也不在其中写出${input.conclusions.map((label) => `「${label}」`).join('、')}这些结论；写了分数或结论的那一段或那一条不会提供给编辑。`,
      '不重读稿件原文、不进行事实核查、不引用外部知识、不调用任何工具、不改写稿件。',
      '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
      'schema（固定为 "ai7.evaluation-rewrite.synthesis-result/2"）、items、verdict、strengths、weaknesses。',
      `items 为数组，下列每个编辑已打分的评分项恰好一项：${scored.map((item) => item.itemId).join('、')}；每项精确包含 itemId 与 comment（新版评语，一段话，不超过 300 字素）。`,
      'verdict 是新版总评，一段话，不超过 600 字素，概括全书、与各项评语一致，并写出下一步修改建议。',
      `strengths 与 weaknesses 是新版的主要优点与主要问题，各为字符串数组，各 1 至 ${MAX_REWRITTEN_LINES} 条，每条一句、不超过 ${MAX_REWRITTEN_LINE_GRAPHEMES} 字素。每段话都只占一行。`,
    ].join('\n');
  }
  return [
    '以下是同一部书稿各已闭合阅读范围按评分项记下的依据。依据系统提示中这一版评估的评分、调分原因与现有评语，以及这些依据，按编辑的分数重写评语。',
    '评语要与编辑给的分数一致：编辑比 AI7 打分低的项，写清它的不足；打分高的项，写清它的长处；照顾编辑写下的调分原因与现有评语中编辑自己的判断。',
    `不改任何分数，也不在评语或总评里写分数；不选定结论，也不在评语或总评里写出${input.conclusions.map((label) => `「${label}」`).join('、')}这些结论；写了分数或结论的那一段不会提供给编辑。`,
    '不重读稿件原文、不进行事实核查、不引用外部知识、不调用任何工具、不改写稿件。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.evaluation-rewrite.synthesis-result/1"）、items、verdict。',
    `items 为数组，下列每个编辑已打分的评分项恰好一项：${scored.map((item) => item.itemId).join('、')}；每项精确包含 itemId 与 comment（重写后的评语，一段话，不超过 300 字素）。`,
    'verdict 是重写后的总评，一段话，不超过 600 字素，概括全书并与各项评语一致。每段话都只占一行。',
  ].join('\n');
}

/** The frozen prompt contract: model-facing text, fixed formats and the version's words. */
export interface EvaluationRewritePromptContract {
  readonly schema: typeof EVALUATION_REWRITE_PROMPT_CONTRACT_SCHEMA | typeof EVALUATION_REWRITE_PROMPT_CONTRACT_SCHEMA_V2;
  readonly contractVersion: typeof EVALUATION_REWRITE_CONTRACT_VERSION;
  readonly unitResultSchema: typeof EVALUATION_REWRITE_UNIT_RESULT_SCHEMA;
  readonly synthesisResultSchema: typeof EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA | typeof EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA_V2;
  readonly input: EvaluationRewriteContractInput;
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

export function evaluationRewriteContract(input: EvaluationRewriteContractInput): EvaluationRewritePromptContract {
  const frozen = frozenInput(input);
  const whole = frozen.report !== undefined;
  return {
    schema: whole ? EVALUATION_REWRITE_PROMPT_CONTRACT_SCHEMA_V2 : EVALUATION_REWRITE_PROMPT_CONTRACT_SCHEMA,
    contractVersion: EVALUATION_REWRITE_CONTRACT_VERSION,
    unitResultSchema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: whole ? EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA_V2 : EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA,
    input: frozen,
    systemPrompt: systemPromptOf(frozen),
    unitMessageHeader: UNIT_MESSAGE_HEADER,
    overlapHeader: OVERLAP_HEADER,
    ownHeader: OWN_HEADER,
    blockLine: BLOCK_LINE,
    synthesisInstruction: synthesisInstructionOf(frozen),
    synthesisHeader: SYNTHESIS_HEADER,
    synthesisItemLine: SYNTHESIS_ITEM_LINE,
    synthesisObservationLine: SYNTHESIS_OBSERVATION_LINE,
    synthesisNoObservation: SYNTHESIS_NO_OBSERVATION,
  };
}

export function evaluationRewriteContractDigest(contract: EvaluationRewritePromptContract): string {
  return sha256Hex(canonicalJson(contract));
}

/** Admit one unit result: exactly the contract's keys, items the editor scored, positions within the unit. */
export function parseEvaluationRewriteUnitResult(text: string, expected: { unitOrdinal: number; blockCount: number; itemIds: ReadonlyArray<string> }): EvaluationRewriteUnitParse {
  const value = extractModelJson(text, { partial: true });
  if (value === null) return { ok: false, code: 'not-json', detail: '模型回答无法读出任何可用条目。' };
  const salvaged: ModelResultSalvage[] = [];
  const mark = (index: number, reason: string): void => { salvaged.push({ section: 'observations', index, reason }); };
  try { JSON.parse(text); } catch { mark(-1, 'json-extracted-or-partial'); }
  if (value.schema !== EVALUATION_REWRITE_UNIT_RESULT_SCHEMA || value.unitOrdinal !== expected.unitOrdinal) mark(-1, 'request-envelope');
  if (!('observations' in value) && !('schema' in value)) return { ok: false, code: 'schema-invalid', detail: '模型回答无法读出任何可用条目。' };
  if (value.observations !== undefined && !Array.isArray(value.observations)) return { ok: false, code: 'schema-invalid', detail: '模型回答无法读出任何可用条目。' };
  const candidates = Array.isArray(value.observations) ? value.observations : [];
  const observations: EvaluationRewriteObservation[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (index >= MAX_UNIT_OBSERVATIONS || !isRecord(candidate) || typeof candidate.note !== 'string' || !candidate.note.isWellFormed() || !candidate.note.trim()) { mark(index, 'schema-invalid'); continue; }
    if (typeof candidate.itemId !== 'string' || !expected.itemIds.includes(candidate.itemId)) { mark(index, 'item-unknown'); continue; }
    const itemId = candidate.itemId;
    const raw = Array.isArray(candidate.blockOrdinals) ? candidate.blockOrdinals : [];
    const ordinals = [...new Set(raw.map((ordinal) => typeof ordinal === 'string' ? Number(ordinal) : ordinal).filter((ordinal): ordinal is number => typeof ordinal === 'number' && Number.isSafeInteger(ordinal) && ordinal >= 1 && ordinal <= expected.blockCount))].slice(0, MAX_OBSERVATION_BLOCKS);
    if (JSON.stringify(raw) !== JSON.stringify(ordinals)) mark(index, 'block-out-of-unit');
    if (!ordinals.length) { mark(index, 'block-out-of-unit'); continue; }
    const note = normalizeEvaluationLine(candidate.note, MAX_OBSERVATION_NOTE_GRAPHEMES);
    if (note !== candidate.note) mark(index, 'note-normalized');
    observations.push({ itemId, note, blockOrdinals: ordinals });
  }
  if (candidates.length > 0 && observations.length === 0) return { ok: false, code: 'schema-invalid', detail: '模型回答无法读出任何可用条目。' };
  const result: EvaluationRewriteUnitResult = { schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: expected.unitOrdinal, observations, ...(salvaged.length ? { salvaged } : {}) };
  const canonical = canonicalJson(result);
  return { ok: true, result, ...(salvaged.length ? { salvaged } : {}), canonicalJson: canonical, digest: sha256Hex(canonical) };
}

/**
 * Admit the synthesis: one 评语 for every item the editor scored, none for another, and the 总评 — and no other key, so no
 * number can come back with them. The items are returned in the version's order whatever order the model wrote them in.
 */
export function parseEvaluationRewriteSynthesis(text: string, input: Pick<EvaluationRewriteContractInput, 'items' | 'conclusions' | 'report'>): EvaluationRewriteSynthesisParse {
  const whole = input.report !== undefined;
  const schema = whole ? EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA_V2 : EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA;
  const value = extractModelJson(text, { partial: true });
  if (value === null) return { ok: false, code: 'not-json', detail: '模型回答无法读出任何可用条目。' };
  const salvaged: ModelResultSalvage[] = [];
  const withheld: Array<{ itemId: string | null; reason: string }> = [];
  const mark = (section: string, index: number, reason: string): void => { salvaged.push({ section, index, reason }); };
  try { JSON.parse(text); } catch { mark('envelope', -1, 'json-extracted-or-partial'); }
  if (value.schema !== schema) mark('schema', -1, 'request-envelope');
  const scored = evaluationRewriteScoredItems(input);
  const fullMarks = scoreDenominators(input.items);
  const clean = (raw: unknown, itemId: string | null, index: number, maximum: number): string | null => {
    const section = itemId === null ? 'verdict' : 'items';
    if (typeof raw !== 'string' || !raw.isWellFormed() || !raw.trim()) {
      withheld.push({ itemId, reason: '没有可采用的评语。' }); mark(section, index, 'text-missing'); return null;
    }
    // Decimal punctuation inside a number belongs to the sentence being checked, never a detachable prefix.
    const sentences = raw.match(/(?:[^。！？.!?]|(?<=[0-9０-９])\.(?=[0-9０-９]))+[。！？.!?]*/gu) ?? [raw];
    const kept = sentences.filter((sentence) => !claimsScore(sentence, fullMarks) && !claimsConclusion(sentence, input.conclusions));
    if (kept.length !== sentences.length) { withheld.push({ itemId, reason: '含分数或结论的句子没有采用：分数与结论由你定。' }); mark(section, index, 'claim-withheld'); }
    const result = normalizeEvaluationLine(kept.join(''), maximum);
    if (result !== raw && kept.length === sentences.length) mark(section, index, 'text-normalized');
    return result || null;
  };
  const byId = new Map<string, { itemId: string; comment: string }>();
  for (const [index, candidate] of (Array.isArray(value.items) ? value.items : []).entries()) {
    if (!isRecord(candidate) || typeof candidate.itemId !== 'string' || !scored.some((item) => item.itemId === candidate.itemId) || byId.has(candidate.itemId)) { mark('items', index, 'item-unknown-or-duplicate'); continue; }
    const comment = clean(candidate.comment, candidate.itemId, index, MAX_REWRITTEN_COMMENT_GRAPHEMES);
    if (comment !== null) byId.set(candidate.itemId, { itemId: candidate.itemId, comment });
  }
  for (const [index, item] of scored.entries()) if (!byId.has(item.itemId)) { mark('items', index, 'item-missing'); withheld.push({ itemId: item.itemId, reason: '未写出可采用的评语。' }); }
  const verdict = clean(value.verdict, null, -1, MAX_REWRITTEN_VERDICT_GRAPHEMES);
  const items = scored.flatMap((item) => { const written = byId.get(item.itemId); return written === undefined ? [] : [written]; });
  // Contract `/2`'s lines: each kept only without a score or a conclusion in it; none kept leaves the editor's own list.
  const lines = (raw: unknown, section: 'strengths' | 'weaknesses', label: string): string[] | null => {
    if (!Array.isArray(raw)) { mark(section, -1, 'lines-missing'); return null; }
    const kept: string[] = [];
    for (const [index, entry] of raw.entries()) {
      if (typeof entry !== 'string' || !entry.isWellFormed() || !entry.trim() || kept.length >= MAX_REWRITTEN_LINES) { mark(section, index, 'line-invalid'); continue; }
      if (claimsScore(entry, fullMarks) || claimsConclusion(entry, input.conclusions)) {
        withheld.push({ itemId: null, reason: `${label}中含分数或结论的一条没有采用：分数与结论由你定。` }); mark(section, index, 'claim-withheld'); continue;
      }
      const line = normalizeEvaluationLine(entry, MAX_REWRITTEN_LINE_GRAPHEMES);
      if (line !== entry) mark(section, index, 'text-normalized');
      if (line) kept.push(line);
    }
    return kept.length > 0 ? kept : null;
  };
  const strengths = whole ? lines(value.strengths, 'strengths', '主要优点') : null;
  const weaknesses = whole ? lines(value.weaknesses, 'weaknesses', '主要问题') : null;
  if (!items.length && verdict === null && strengths === null && weaknesses === null) return { ok: false, code: 'schema-invalid', detail: '模型回答无法读出任何可用条目。' };
  return { ok: true, ...(salvaged.length ? { salvaged } : {}), result: { schema, items, verdict, withheld, ...(whole ? { strengths, weaknesses } : {}), ...(salvaged.length ? { salvaged } : {}) } };
}

// ---- the unit message ---------------------------------------------------------------------------------------------

/** The prefix `评语重写单元` is this contract's and no other's: the deterministic adapter tells a request's kind by its header alone. */
const UNIT_HEADER_PATTERN = /^评语重写单元 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64})$/u;
const SYNTHESIS_HEADER_PATTERN = /^评语重写综合 (\d+)\/(\d+) · 依据摘要 ([0-9a-f]{64})$/u;

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (placeholder, key: string) => values[key] ?? placeholder);
}

/** The block identities of one unit in message order: the overlap context first, then the own blocks. */
export function evaluationRewriteMessageBlockIds(unit: CoverageManifestUnitProjection): string[] {
  return [...unit.overlapBlockIds, ...unit.blockIds];
}

function requireBlock<T>(blocksById: ReadonlyMap<string, T>, blockId: string): T {
  const block = blocksById.get(blockId);
  if (block === undefined) throw new Error('ANALYSIS_UNIT_BLOCK_MISSING');
  return block;
}

/** The exact user-role message for one Analysis Unit: header, optional overlap context, then own blocks. */
export function buildEvaluationRewriteUnitMessage(
  contract: EvaluationRewritePromptContract,
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

/** Recover the unit identity from a message built by {@link buildEvaluationRewriteUnitMessage}; `null` for anything else. */
export function parseEvaluationRewriteUnitMessageHeader(value: string): { ordinal: number; total: number; unitDigest: string } | null {
  const match = UNIT_HEADER_PATTERN.exec(value.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal) return null;
  return { ordinal, total, unitDigest: match[3]! };
}

/** The request digest a deterministic fixture keys a unit by: a pure function of the frozen contract and the manifest unit. */
export function evaluationRewriteRequestDigest(promptContractDigest: string, unitOrdinal: number, unitDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, step: 'unit', unitOrdinal, unitDigest }));
}

// ---- the book-level synthesis ---------------------------------------------------------------------------------------

/** One closed unit of the Run's complete unit set, as the execution owner holds it. */
export interface ClosedEvaluationRewriteUnit {
  readonly unitOrdinal: number;
  readonly result: EvaluationRewriteUnitResult;
}

function orderedClosed(closed: ReadonlyArray<ClosedEvaluationRewriteUnit>): ClosedEvaluationRewriteUnit[] {
  return [...closed].sort((left, right) => left.unitOrdinal - right.unitOrdinal);
}

/**
 * The digest of what the synthesis reads: every closed unit's observations in unit order. Positions, not block identities, so
 * the same manuscript imported again asks the same question.
 */
export function evaluationRewriteObservationSetDigest(closed: ReadonlyArray<ClosedEvaluationRewriteUnit>): string {
  return sha256Hex(canonicalJson(orderedClosed(closed).map(({ unitOrdinal, result }) => ({ unitOrdinal, observations: result.observations }))));
}

/** The exact user-role message for the synthesis: header, the frozen instruction, then each scored item with its observations. */
export function buildEvaluationRewriteSynthesisMessage(
  contract: EvaluationRewritePromptContract,
  closed: ReadonlyArray<ClosedEvaluationRewriteUnit>,
  totalUnits: number,
): string {
  const units = orderedClosed(closed);
  const lines = [
    fill(contract.synthesisHeader, { closed: String(units.length), total: String(totalUnits), setDigest: evaluationRewriteObservationSetDigest(units) }),
    contract.synthesisInstruction,
  ];
  for (const item of evaluationRewriteScoredItems(contract.input)) {
    lines.push(fill(contract.synthesisItemLine, { itemId: item.itemId, label: item.label, score: score(item.score!), fullMarks: String(item.fullMarks) }));
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

/** Recover the synthesis identity from a message built by {@link buildEvaluationRewriteSynthesisMessage}; `null` for anything else. */
export function parseEvaluationRewriteSynthesisMessageHeader(value: string): { closed: number; total: number; setDigest: string } | null {
  const match = SYNTHESIS_HEADER_PATTERN.exec(value.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const closed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(closed) || closed < 1 || !Number.isSafeInteger(total) || total < closed) return null;
  return { closed, total, setDigest: match[3]! };
}

/** The request digest of the synthesis, keyed under unit ordinal `0`: a pure function of the frozen contract and what it reads. */
export function evaluationRewriteSynthesisRequestDigest(promptContractDigest: string, setDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(setDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, step: 'synthesis', observationSetDigest: setDigest }));
}
