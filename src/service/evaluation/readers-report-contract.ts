import {
  READERS_REPORT_CONTRACT_VERSION,
  READERS_REPORT_NO_EXEMPLAR,
  READERS_REPORT_PASSAGE_KINDS,
  READERS_REPORT_TEMPLATE_LABELS,
  READERS_REPORT_TEMPLATES,
  type CoverageManifestUnitProjection,
  type InitialEvaluationSufficiency,
  type ReadersReportPassageKind,
  type ReadersReportTemplate,
} from '../../shared/protocol.js';
import { DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, requireAnalysis, sha256Hex } from '../analysis/canonical.js';
import type { ManifestBlockInput } from '../analysis/coverage-manifest.js';
import { graphemeCount } from '../analysis/factual-review-contract.js';

/**
 * Reader's Report Contract v1 (Issue #429, plan slice S81c; V2-UX-EVAL-013): AI7's draft of one Book's 审稿意见 from one
 * finalized Evaluation Record, under one of the two V1 templates, in two steps on the analysis kind's one real path.
 *
 * Each Analysis Unit is read for the passages a 审稿意见 can point its reader to — what bears out one of the record's
 * strengths, what shows a problem, where a revision applies — each citing, by position in the unit message, the blocks it
 * rests on. One book-level synthesis then reads the record and every unit's passages — never the manuscript — and writes the
 * five sections the template asks for: 总体评价, 主要优点, 主要问题, 修改建议 and 结论. A model answer outside the keys or the
 * bounds is refused whole, never trimmed.
 *
 * The record is frozen into the contract by its words alone — the profile it was scored under, each item's score or `不评`
 * with its comment and, for a version begun from AI7's 初评, AI7's evidence for the item; the risks, what is still missing,
 * the strengths, the weaknesses, the 总评 and the conclusion the editor chose — and so are the template and the house's
 * 审稿意见 among its 范例 (none yet: the plan then says 「本社暂无审稿意见范例，本次不参考范例」, the Owner's answer of
 * 2026-10-07). Identities and times are not words of the record, so the same record drafted again asks the same question.
 * Changing any word changes the contract digest, every request digest and the schema digest every revision pins: a draft from
 * another record or another template is another contract. The contract drafts; it never decides — the conclusion it writes is
 * the one the editor chose, and the record is left as it was.
 */
export const READERS_REPORT_UNIT_RESULT_SCHEMA = 'ai7.readers-report.unit-result/1' as const;
export const READERS_REPORT_SYNTHESIS_RESULT_SCHEMA = 'ai7.readers-report.synthesis-result/1' as const;
export const READERS_REPORT_PROMPT_CONTRACT_SCHEMA = 'ai7.readers-report.prompt-contract/1' as const;
export const READERS_REPORT_RESULT_SET_REVISION_SCHEMA = 'ai7.readers-report.result-set-revision/1' as const;
/** The shape that carries scope-plan facts and per-unit lineage: every draft after the first. */
export const READERS_REPORT_SUCCESSOR_REVISION_SCHEMA = 'ai7.readers-report.result-set-revision/2' as const;

export const MAX_UNIT_PASSAGES = 20;
export const MAX_PASSAGE_BLOCKS = 8;
export const MAX_PASSAGE_NOTE_GRAPHEMES = 200;
export const MAX_OVERALL_GRAPHEMES = 600;
export const MAX_CONCLUSION_GRAPHEMES = 300;
export const MAX_SECTION_LINES = 6;
export const MAX_SECTION_LINE_GRAPHEMES = 200;
/** At most this many of the house's 审稿意见 seed one draft, each at most this long. */
export const MAX_READERS_REPORT_EXEMPLARS = 2;
export const MAX_EXEMPLAR_GRAPHEMES = 4_000;
/** A line of the frozen prompt and of the model's free text is one line: no control character may break it or hide in it. */
const CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;
/** A record's own text may run over several lines; inside the prompt each becomes one, its breaks read as `／`. */
const LINE_BREAKS = /\r\n?|\n/gu;

/** One scored item of the finalized record, in its words. */
export interface ReadersReportRecordItem {
  readonly label: string;
  readonly fullMarks: number;
  readonly score: number | null;
  /** `不评`, with its reason. */
  readonly notRated: string | null;
  readonly comment: string | null;
  /** AI7's 初评 of the item, for a version begun from one: its score, 依据充分度 and the evidence it noted, range by range. */
  readonly ai7: null | {
    readonly score: number | null;
    readonly sufficiency: InitialEvaluationSufficiency;
    readonly evidence: ReadonlyArray<{ readonly unitOrdinal: number; readonly note: string }>;
  };
}

/** What the contract freezes of one finalized Evaluation Record: its words, never its identity or its time. */
export interface ReadersReportRecordInput {
  readonly profile: { readonly title: string; readonly version: string };
  readonly items: ReadonlyArray<ReadersReportRecordItem>;
  readonly total: { readonly score: number; readonly fullMarks: number };
  readonly risks: ReadonlyArray<{ readonly label: string; readonly level: 'low' | 'medium' | 'high'; readonly statement: string | null }>;
  readonly readiness: ReadonlyArray<string>;
  readonly strengths: ReadonlyArray<string>;
  readonly weaknesses: ReadonlyArray<string>;
  readonly verdict: string | null;
  /** The conclusion the editor chose, in its label. */
  readonly conclusion: string;
}

/** One of the house's 审稿意见 among its 范例 that seeds the draft: what it is, and its text. */
export interface ReadersReportExemplarInput {
  readonly title: string;
  readonly text: string;
}

export interface ReadersReportContractInput {
  readonly template: ReadersReportTemplate;
  readonly record: ReadersReportRecordInput;
  readonly exemplars: ReadonlyArray<ReadersReportExemplarInput>;
}

/** One passage exactly as the model listed it. */
export interface ReadersReportPassage {
  readonly kind: ReadersReportPassageKind;
  readonly note: string;
  /** 1-based over the unit's blocks in message order: the overlap blocks first, then the own blocks. */
  readonly blockOrdinals: ReadonlyArray<number>;
}

export interface ReadersReportUnitResult {
  readonly schema: typeof READERS_REPORT_UNIT_RESULT_SCHEMA;
  readonly unitOrdinal: number;
  readonly passages: ReadonlyArray<ReadersReportPassage>;
}

export interface ReadersReportSynthesisResult {
  readonly schema: typeof READERS_REPORT_SYNTHESIS_RESULT_SCHEMA;
  readonly overall: string;
  readonly strengths: ReadonlyArray<string>;
  readonly problems: ReadonlyArray<string>;
  readonly suggestions: ReadonlyArray<string>;
  readonly conclusion: string;
}

/**
 * Why a unit result did not parse: the first three as every unit contract means them; `kind-unknown` a passage of a kind
 * the contract does not list; `block-out-of-unit` a cited position past the unit's blocks.
 */
export type ReadersReportUnitParseFailureCode = 'not-json' | 'schema-invalid' | 'unit-mismatch' | 'kind-unknown' | 'block-out-of-unit';
export type ReadersReportSynthesisParseFailureCode = 'not-json' | 'schema-invalid';

export type ReadersReportUnitParse =
  | { ok: true; result: ReadersReportUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: ReadersReportUnitParseFailureCode; detail: string };
export type ReadersReportSynthesisParse =
  | { ok: true; result: ReadersReportSynthesisResult }
  | { ok: false; code: ReadersReportSynthesisParseFailureCode; detail: string };

const UNIT_MESSAGE_HEADER = '审稿意见单元 {ordinal}/{total} · 单元摘要 {unitDigest}' as const;
const OVERLAP_HEADER = '以下为承接上一单元的重叠上下文（仅供理解，记录段落时仍可引用）：' as const;
const OWN_HEADER = '以下为本单元的内容块：' as const;
const BLOCK_LINE = '[{blockId}] ({kind}{level}) {text}' as const;
const SYNTHESIS_HEADER = '审稿意见综合 {closed}/{total} · 段落摘要 {setDigest}' as const;
const SYNTHESIS_KIND_LINES: Readonly<Record<ReadersReportPassageKind, string>> = {
  strength: '【印证优点的段落】',
  problem: '【显出问题的段落】',
  suggestion: '【需要修改的地方】',
};
const SYNTHESIS_PASSAGE_LINE = '- 单元 {unitOrdinal}：{note}（引用 {blocks} 个内容块）' as const;
const SYNTHESIS_NO_PASSAGE = '- （各阅读范围都没有记下这一类段落）' as const;
const RISK_LEVEL_LABELS = { low: '低', medium: '中', high: '高' } as const;
const SUFFICIENCY_LABELS: Readonly<Record<InitialEvaluationSufficiency, string>> = { sufficient: '充分', fair: '一般', insufficient: '不足' };
/** What each template asks of the draft: who reads it, and how it speaks. */
const TEMPLATE_GUIDANCE: Readonly<Record<ReadersReportTemplate, string>> = {
  author: '这是写给作者的修改意见：语气尊重、具体，先肯定再指出问题，修改建议要能照着做；不写分数，不谈营销与定价。',
  editorial: '这是写给编辑部与选题会的审读报告：说明评估结论及其依据，可以写总分与各项得分，指出风险与出版前还差什么；不谈营销与定价。',
};

function line(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && value === value.trim() &&
    !CONTROL_CHARACTER.test(value) && graphemeCount(value) <= maximumGraphemes;
}

/** The record's own text as one prompt line: each line break read as `／`, nothing else touched. */
function oneLine(value: string): string {
  return value.replace(LINE_BREAKS, '／');
}

function score(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= maximum;
}

/** The contract input exactly as it freezes: a template it knows, a record of the closed shape, at most two exemplars. */
function frozenInput(input: ReadersReportContractInput): ReadersReportContractInput {
  requireAnalysis(isRecord(input) && READERS_REPORT_TEMPLATES.includes(input.template) && isRecord(input.record) && Array.isArray(input.exemplars),
    'READERS_REPORT_INPUT_INVALID', '审稿意见的输入无效。');
  const record = input.record;
  requireAnalysis(isRecord(record.profile) && text(record.profile.title, 80) && text(record.profile.version, 32) &&
    Array.isArray(record.items) && record.items.length >= 1 && record.items.length <= 32 && Array.isArray(record.risks) &&
    Array.isArray(record.readiness) && Array.isArray(record.strengths) && Array.isArray(record.weaknesses) &&
    (record.verdict === null || text(record.verdict, 4_000)) && text(record.conclusion, 20) && isRecord(record.total) &&
    typeof record.total.score === 'number' && typeof record.total.fullMarks === 'number',
  'READERS_REPORT_INPUT_INVALID', '审稿意见所依据的评估记录无效。');
  const items = record.items.map((given): ReadersReportRecordItem => {
    const item = given as ReadersReportRecordItem;
    requireAnalysis(isRecord(item) && text(item.label, 40) && Number.isSafeInteger(item.fullMarks) &&
      (item.score === null || typeof item.score === 'number') && (item.notRated === null || text(item.notRated, 400)) &&
      (item.comment === null || text(item.comment, 4_000)) &&
      (item.ai7 === null || (isRecord(item.ai7) && Array.isArray(item.ai7.evidence) &&
        item.ai7.evidence.every((entry) => isRecord(entry) && Number.isSafeInteger(entry.unitOrdinal) && text(entry.note, 400)))),
    'READERS_REPORT_INPUT_INVALID', '审稿意见所依据的评分项无效。');
    return {
      label: item.label,
      fullMarks: item.fullMarks,
      score: item.score,
      notRated: item.notRated,
      comment: item.comment,
      ai7: item.ai7 === null ? null : {
        score: item.ai7.score,
        sufficiency: item.ai7.sufficiency,
        evidence: item.ai7.evidence.map((entry) => ({ unitOrdinal: entry.unitOrdinal, note: entry.note })),
      },
    };
  });
  const lines = (list: ReadonlyArray<string>): string[] => {
    requireAnalysis(list.every((entry) => text(entry, 400)), 'READERS_REPORT_INPUT_INVALID', '审稿意见所依据的评估记录无效。');
    return [...list];
  };
  const exemplars = input.exemplars.map((exemplar) => {
    requireAnalysis(isRecord(exemplar) && text(exemplar.title, 200) && text(exemplar.text, MAX_EXEMPLAR_GRAPHEMES),
      'READERS_REPORT_INPUT_INVALID', '审稿意见范例无效。');
    return { title: exemplar.title, text: exemplar.text };
  });
  requireAnalysis(exemplars.length <= MAX_READERS_REPORT_EXEMPLARS, 'READERS_REPORT_INPUT_INVALID', '审稿意见范例过多。');
  return {
    template: input.template,
    record: {
      profile: { title: record.profile.title, version: record.profile.version },
      items,
      total: { score: record.total.score, fullMarks: record.total.fullMarks },
      risks: record.risks.map((risk) => {
        requireAnalysis(isRecord(risk) && text(risk.label, 40) && (risk.level === 'low' || risk.level === 'medium' || risk.level === 'high') &&
          (risk.statement === null || text(risk.statement, 4_000)), 'READERS_REPORT_INPUT_INVALID', '审稿意见所依据的风险项无效。');
        return { label: risk.label, level: risk.level, statement: risk.statement };
      }),
      readiness: lines(record.readiness),
      strengths: lines(record.strengths),
      weaknesses: lines(record.weaknesses),
      verdict: record.verdict,
      conclusion: record.conclusion,
    },
    exemplars,
  };
}

/** The finalized record as the prompt states it, one line each: the editor's scores and judgments, never to be changed. */
function recordLines(record: ReadersReportRecordInput): string[] {
  const lines = [
    `- 评估方案：${record.profile.title} 第 ${record.profile.version} 版；总分 ${score(record.total.score)} / ${record.total.fullMarks}；编辑选定的结论：${record.conclusion}`,
  ];
  for (const item of record.items) {
    const own = item.notRated !== null ? `不评（${oneLine(item.notRated)}）` : item.score === null ? '未打分' : `得分 ${score(item.score)}`;
    lines.push(`- 评分项「${item.label}」（满分 ${item.fullMarks}）：${own}${item.comment === null ? '' : `；评语：${oneLine(item.comment)}`}`);
    if (item.ai7 !== null) {
      lines.push(`  AI7 初评：${item.ai7.score === null ? '未给分' : `${score(item.ai7.score)} 分`}，依据充分度${SUFFICIENCY_LABELS[item.ai7.sufficiency]}`);
      for (const evidence of item.ai7.evidence) lines.push(`  · 单元 ${evidence.unitOrdinal}：${oneLine(evidence.note)}`);
    }
  }
  if (record.strengths.length > 0) lines.push(`- 主要优点：${record.strengths.map(oneLine).join('；')}`);
  if (record.weaknesses.length > 0) lines.push(`- 主要问题：${record.weaknesses.map(oneLine).join('；')}`);
  if (record.readiness.length > 0) lines.push(`- 距离可出版还差：${record.readiness.map(oneLine).join('；')}`);
  for (const risk of record.risks) {
    lines.push(`- 风险项「${risk.label}」：${RISK_LEVEL_LABELS[risk.level]}${risk.statement === null ? '' : `；${oneLine(risk.statement)}`}`);
  }
  if (record.verdict !== null) lines.push(`- 总评：${oneLine(record.verdict)}`);
  return lines;
}

function systemPromptOf(input: ReadersReportContractInput): string {
  return [
    `你是 AI7 的审稿意见组件，按「${READERS_REPORT_TEMPLATE_LABELS[input.template]}」模板，从本社一份定稿的评估记录起草审稿意见。你只处理用户消息中给出的一个分析单元，逐块阅读，找出审稿意见可以指给读者看的段落。`,
    '以下是定稿的评估记录（编辑的评分与判断，照录，不得改动）：',
    ...recordLines(input.record),
    '本步只找段落，不写审稿意见、不打分、不下结论、不改写稿件、不调用任何工具、不引用外部资料。',
    '每条段落精确包含以下键：kind（strength 表示印证评估记录中的一条优点，problem 表示显出一个问题，suggestion 表示需要修改的地方）、note（这一段说明了什么，不超过 200 字素）、blockOrdinals（它所依据的内容块序号数组，至少 1 个、至多 8 个、不重复）。',
    '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.readers-report.unit-result/1"）、unitOrdinal（与用户消息头部的单元序号一致）、passages（数组，至多 20 项）。',
    '本单元没有可引用的段落时输出空数组。不要编造稿件中不存在的内容。',
  ].join('\n');
}

/** What the plan and the synthesis say of the house's 审稿意见: none, as the Owner answered, or the ones that seed the draft. */
export function readersReportExemplarLine(exemplars: ReadonlyArray<ReadersReportExemplarInput>): string {
  return exemplars.length === 0
    ? READERS_REPORT_NO_EXEMPLAR
    : `参考本社 ${exemplars.length} 份审稿意见范例：${exemplars.map((exemplar) => `《${exemplar.title}》`).join('、')}`;
}

function synthesisInstructionOf(input: ReadersReportContractInput): string {
  const exemplarLines = input.exemplars.length === 0
    ? [`${READERS_REPORT_NO_EXEMPLAR}。`]
    : [
        `${readersReportExemplarLine(input.exemplars)}。只学它们的结构与写法，不照抄其中的内容：`,
        ...input.exemplars.map((exemplar) => `《${exemplar.title}》：${oneLine(exemplar.text)}`),
      ];
  return [
    `以下是同一部书稿各已闭合阅读范围中可以引用的段落。依据系统提示中定稿的评估记录与这些段落，按「${READERS_REPORT_TEMPLATE_LABELS[input.template]}」模板写出审稿意见的五个部分：总体评价、主要优点、主要问题、修改建议、结论。`,
    TEMPLATE_GUIDANCE[input.template],
    ...exemplarLines,
    '不重读稿件原文、不进行事实核查、不引用外部知识、不调用任何工具、不改写稿件。结论必须与评估记录中编辑选定的结论一致。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.readers-report.synthesis-result/1"）、overall、strengths、problems、suggestions、conclusion。',
    'overall（总体评价）与 conclusion（结论）各是一段话，分别不超过 600 与 300 字素；strengths（主要优点）、problems（主要问题）、suggestions（修改建议）是字符串数组，各 1 到 6 条，每条不超过 200 字素。每段话与每一条都只占一行。',
  ].join('\n');
}

/** The frozen prompt contract: model-facing text, fixed formats, the template, the record's words and the exemplars. */
export interface ReadersReportPromptContract {
  readonly schema: typeof READERS_REPORT_PROMPT_CONTRACT_SCHEMA;
  readonly contractVersion: typeof READERS_REPORT_CONTRACT_VERSION;
  readonly unitResultSchema: typeof READERS_REPORT_UNIT_RESULT_SCHEMA;
  readonly synthesisResultSchema: typeof READERS_REPORT_SYNTHESIS_RESULT_SCHEMA;
  readonly input: ReadersReportContractInput;
  readonly systemPrompt: string;
  readonly unitMessageHeader: typeof UNIT_MESSAGE_HEADER;
  readonly overlapHeader: typeof OVERLAP_HEADER;
  readonly ownHeader: typeof OWN_HEADER;
  readonly blockLine: typeof BLOCK_LINE;
  readonly synthesisInstruction: string;
  readonly synthesisHeader: typeof SYNTHESIS_HEADER;
  readonly synthesisKindLines: typeof SYNTHESIS_KIND_LINES;
  readonly synthesisPassageLine: typeof SYNTHESIS_PASSAGE_LINE;
  readonly synthesisNoPassage: typeof SYNTHESIS_NO_PASSAGE;
}

export function readersReportContract(input: ReadersReportContractInput): ReadersReportPromptContract {
  const frozen = frozenInput(input);
  return {
    schema: READERS_REPORT_PROMPT_CONTRACT_SCHEMA,
    contractVersion: READERS_REPORT_CONTRACT_VERSION,
    unitResultSchema: READERS_REPORT_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
    input: frozen,
    systemPrompt: systemPromptOf(frozen),
    unitMessageHeader: UNIT_MESSAGE_HEADER,
    overlapHeader: OVERLAP_HEADER,
    ownHeader: OWN_HEADER,
    blockLine: BLOCK_LINE,
    synthesisInstruction: synthesisInstructionOf(frozen),
    synthesisHeader: SYNTHESIS_HEADER,
    synthesisKindLines: SYNTHESIS_KIND_LINES,
    synthesisPassageLine: SYNTHESIS_PASSAGE_LINE,
    synthesisNoPassage: SYNTHESIS_NO_PASSAGE,
  };
}

export function readersReportContractDigest(contract: ReadersReportPromptContract): string {
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

/** Admit one unit result: exactly the contract's keys, kinds the contract lists, positions within the unit. */
export function parseReadersReportUnitResult(text: string, expected: { unitOrdinal: number; blockCount: number }): ReadersReportUnitParse {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  const value = parsed.value;
  const invalid = (detail: string): ReadersReportUnitParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'unitOrdinal', 'passages'])) return invalid('单元结果键集合不符合审稿意见契约 v1。');
  if (value.schema !== READERS_REPORT_UNIT_RESULT_SCHEMA) return invalid('单元结果 schema 不是审稿意见契约 v1。');
  if (!Number.isSafeInteger(value.unitOrdinal) || (value.unitOrdinal as number) < 1) return invalid('单元序号无效。');
  if (value.unitOrdinal !== expected.unitOrdinal) {
    return { ok: false, code: 'unit-mismatch', detail: `单元结果声明的序号 ${String(value.unitOrdinal)} 与请求单元 ${expected.unitOrdinal} 不一致。` };
  }
  if (!Array.isArray(value.passages) || value.passages.length > MAX_UNIT_PASSAGES) return invalid('段落集合不符合审稿意见契约 v1。');
  const passages: ReadersReportPassage[] = [];
  for (const [index, candidate] of (value.passages as unknown[]).entries()) {
    const label = `第 ${index + 1} 条段落`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['kind', 'note', 'blockOrdinals'])) return invalid(`${label}的键集合不符合审稿意见契约 v1。`);
    if (typeof candidate.kind !== 'string') return invalid(`${label}的类别无效。`);
    if (!READERS_REPORT_PASSAGE_KINDS.includes(candidate.kind as ReadersReportPassageKind)) {
      return { ok: false, code: 'kind-unknown', detail: `${label}的类别 ${candidate.kind.slice(0, 32)} 不在审稿意见契约内。` };
    }
    if (!line(candidate.note, MAX_PASSAGE_NOTE_GRAPHEMES)) return invalid(`${label}的说明缺失、含有控制字符或超出 200 字素边界。`);
    const ordinals = candidate.blockOrdinals;
    if (!Array.isArray(ordinals) || ordinals.length < 1 || ordinals.length > MAX_PASSAGE_BLOCKS ||
        !ordinals.every((ordinal) => Number.isSafeInteger(ordinal) && (ordinal as number) >= 1) || new Set(ordinals).size !== ordinals.length) {
      return invalid(`${label}的内容块序号无效。`);
    }
    const outside = (ordinals as number[]).find((ordinal) => ordinal > expected.blockCount);
    if (outside !== undefined) {
      return { ok: false, code: 'block-out-of-unit', detail: `${label}引用的内容块序号 ${outside} 不在本单元列出的 ${expected.blockCount} 个内容块内。` };
    }
    passages.push({ kind: candidate.kind as ReadersReportPassageKind, note: candidate.note, blockOrdinals: [...(ordinals as number[])] });
  }
  const result: ReadersReportUnitResult = { schema: READERS_REPORT_UNIT_RESULT_SCHEMA, unitOrdinal: expected.unitOrdinal, passages };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}

function sectionLines(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= MAX_SECTION_LINES &&
    value.every((entry) => line(entry, MAX_SECTION_LINE_GRAPHEMES));
}

/** Admit the synthesis: the five sections, each within its bound, and nothing else. */
export function parseReadersReportSynthesis(text: string): ReadersReportSynthesisParse {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  const value = parsed.value;
  const invalid = (detail: string): ReadersReportSynthesisParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'overall', 'strengths', 'problems', 'suggestions', 'conclusion'])) {
    return invalid('全书综合的键集合不符合审稿意见契约 v1。');
  }
  if (value.schema !== READERS_REPORT_SYNTHESIS_RESULT_SCHEMA) return invalid('全书综合 schema 不是审稿意见契约 v1。');
  if (!line(value.overall, MAX_OVERALL_GRAPHEMES)) return invalid('总体评价缺失、含有控制字符或超出 600 字素边界。');
  if (!sectionLines(value.strengths)) return invalid('主要优点不符合审稿意见契约 v1。');
  if (!sectionLines(value.problems)) return invalid('主要问题不符合审稿意见契约 v1。');
  if (!sectionLines(value.suggestions)) return invalid('修改建议不符合审稿意见契约 v1。');
  if (!line(value.conclusion, MAX_CONCLUSION_GRAPHEMES)) return invalid('结论缺失、含有控制字符或超出 300 字素边界。');
  return {
    ok: true,
    result: {
      schema: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA,
      overall: value.overall,
      strengths: [...value.strengths],
      problems: [...value.problems],
      suggestions: [...value.suggestions],
      conclusion: value.conclusion,
    },
  };
}

// ---- the unit message ---------------------------------------------------------------------------------------------

/** The prefix `审稿意见单元` is this contract's and no other's: the deterministic adapter tells a request's kind by its header alone. */
const UNIT_HEADER_PATTERN = /^审稿意见单元 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64})$/u;
const SYNTHESIS_HEADER_PATTERN = /^审稿意见综合 (\d+)\/(\d+) · 段落摘要 ([0-9a-f]{64})$/u;

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (placeholder, key: string) => values[key] ?? placeholder);
}

/** The block identities of one unit in message order: the overlap context first, then the own blocks. */
export function readersReportMessageBlockIds(unit: CoverageManifestUnitProjection): string[] {
  return [...unit.overlapBlockIds, ...unit.blockIds];
}

function requireBlock<T>(blocksById: ReadonlyMap<string, T>, blockId: string): T {
  const block = blocksById.get(blockId);
  if (block === undefined) throw new Error('ANALYSIS_UNIT_BLOCK_MISSING');
  return block;
}

/** The exact user-role message for one Analysis Unit: header, optional overlap context, then own blocks. */
export function buildReadersReportUnitMessage(
  contract: ReadersReportPromptContract,
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

/** Recover the unit identity from a message built by {@link buildReadersReportUnitMessage}; `null` for anything else. */
export function parseReadersReportUnitMessageHeader(text: string): { ordinal: number; total: number; unitDigest: string } | null {
  const match = UNIT_HEADER_PATTERN.exec(text.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal) return null;
  return { ordinal, total, unitDigest: match[3]! };
}

/** The request digest a deterministic fixture keys a unit by: a pure function of the frozen contract and the manifest unit. */
export function readersReportRequestDigest(promptContractDigest: string, unitOrdinal: number, unitDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, step: 'unit', unitOrdinal, unitDigest }));
}

// ---- the book-level synthesis ---------------------------------------------------------------------------------------

/** One closed unit of the Run's complete unit set, as the execution owner holds it. */
export interface ClosedReadersReportUnit {
  readonly unitOrdinal: number;
  readonly result: ReadersReportUnitResult;
}

function orderedClosed(closed: ReadonlyArray<ClosedReadersReportUnit>): ClosedReadersReportUnit[] {
  return [...closed].sort((left, right) => left.unitOrdinal - right.unitOrdinal);
}

/**
 * The digest of what the synthesis reads: every closed unit's passages in unit order. Positions, not block identities, so
 * the same manuscript imported again asks the same question.
 */
export function readersReportPassageSetDigest(closed: ReadonlyArray<ClosedReadersReportUnit>): string {
  return sha256Hex(canonicalJson(orderedClosed(closed).map(({ unitOrdinal, result }) => ({ unitOrdinal, passages: result.passages }))));
}

/** The exact user-role message for the synthesis: header, the frozen instruction, then the passages by what they bear out. */
export function buildReadersReportSynthesisMessage(
  contract: ReadersReportPromptContract,
  closed: ReadonlyArray<ClosedReadersReportUnit>,
  totalUnits: number,
): string {
  const units = orderedClosed(closed);
  const lines = [
    fill(contract.synthesisHeader, { closed: String(units.length), total: String(totalUnits), setDigest: readersReportPassageSetDigest(units) }),
    contract.synthesisInstruction,
  ];
  for (const kind of READERS_REPORT_PASSAGE_KINDS) {
    lines.push(contract.synthesisKindLines[kind]);
    let any = false;
    for (const unit of units) {
      for (const passage of unit.result.passages) {
        if (passage.kind !== kind) continue;
        any = true;
        lines.push(fill(contract.synthesisPassageLine, { unitOrdinal: String(unit.unitOrdinal), note: passage.note, blocks: String(passage.blockOrdinals.length) }));
      }
    }
    if (!any) lines.push(contract.synthesisNoPassage);
  }
  return lines.join('\n');
}

/** Recover the synthesis identity from a message built by {@link buildReadersReportSynthesisMessage}; `null` for anything else. */
export function parseReadersReportSynthesisMessageHeader(text: string): { closed: number; total: number; setDigest: string } | null {
  const match = SYNTHESIS_HEADER_PATTERN.exec(text.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const closed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(closed) || closed < 1 || !Number.isSafeInteger(total) || total < closed) return null;
  return { closed, total, setDigest: match[3]! };
}

/** The request digest of the synthesis, keyed under unit ordinal `0`: a pure function of the frozen contract and what it reads. */
export function readersReportSynthesisRequestDigest(promptContractDigest: string, setDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(setDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, step: 'synthesis', passageSetDigest: setDigest }));
}
