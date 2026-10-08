import {
  WRITING_CONTRACT_VERSION,
  WRITING_PASSAGE_KINDS,
  type CoverageManifestUnitProjection,
  type WritingDraftWordsProjection,
  type WritingPassageKind,
} from '../../shared/protocol.js';
import { AnalysisError, DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, sha256Hex } from '../analysis/canonical.js';
import type { ManifestBlockInput } from '../analysis/coverage-manifest.js';
import { graphemeCount } from '../analysis/factual-review-contract.js';

/**
 * Writing Contract v1 (Issue #432, plan slice S84a; V2-UX-DELIV-007, KB-004; editor-surfaces §9 新建文档 · 写作任务): AI7's
 * draft of one Production Document of a house type, in two steps on the analysis kind's one real path.
 *
 * Each Analysis Unit is read for the passages the document can draw on — a highlight to lead with, a character, a theme or
 * background — each citing, by position in the unit message, the blocks it rests on. One book-level synthesis then reads those
 * passages and the reference set — never the manuscript again — and writes the document: a title, then sections, each a
 * heading and its paragraphs. A model answer outside the keys or the bounds is refused whole, never trimmed.
 *
 * The reference set is frozen into the contract by its words alone: the house type, the Book's metadata (title, authors,
 * editors, 书系), the audience, channel and requirements the editor wrote, the synopsis and characters of the Book's latest
 * baseline analysis, the conclusion, strengths and marketing points of its latest 定稿 evaluation, and at most two of the
 * house's 范例 of the type from other Books. Each part the Book does not have is frozen as absent, and the plan says so.
 * Identities and times are not words, so the same request made again asks the same question.
 *
 * A 范例 is referenced, never copied (KB-004). The instruction says so, and the synthesis is refused whole —
 * `exemplar-copied`, a gap, so AI7 writes no draft — when the draft copies an exemplar verbatim or nearly, by the bound the
 * Commander ruled for the Issue's stop clause ({@link exemplarCopied}).
 */
export const WRITING_UNIT_RESULT_SCHEMA = 'ai7.writing.unit-result/1' as const;
export const WRITING_SYNTHESIS_RESULT_SCHEMA = 'ai7.writing.synthesis-result/1' as const;
export const WRITING_PROMPT_CONTRACT_SCHEMA = 'ai7.writing.prompt-contract/1' as const;
export const WRITING_RESULT_SET_REVISION_SCHEMA = 'ai7.writing.result-set-revision/1' as const;
/** The shape that carries scope-plan facts and per-unit lineage: every draft after the first. */
export const WRITING_SUCCESSOR_REVISION_SCHEMA = 'ai7.writing.result-set-revision/2' as const;

export const MAX_UNIT_PASSAGES = 12;
export const MAX_PASSAGE_BLOCKS = 8;
export const MAX_PASSAGE_NOTE_GRAPHEMES = 200;
export const MAX_TITLE_GRAPHEMES = 60;
export const MAX_SECTIONS = 8;
export const MAX_HEADING_GRAPHEMES = 30;
export const MAX_SECTION_PARAGRAPHS = 6;
export const MAX_PARAGRAPH_GRAPHEMES = 600;
/** At most this many of the house's 范例 of the type seed one draft, each at most this long (the opening, said so when cut). */
export const MAX_WRITING_EXEMPLARS = 2;
export const MAX_EXEMPLAR_GRAPHEMES = 3_000;
/** The synopsis as the contract freezes it: at most this long (the opening, said so when cut), and at most this many people. */
export const MAX_SYNOPSIS_GRAPHEMES = 3_000;
export const MAX_CHARACTERS = 12;
/**
 * The reference bound (Issue #432's stop clause): this many consecutive characters of a draft — compared without spaces,
 * punctuation or symbols, after compatibility normalization — that stand in an exemplar and not in the reference set's own
 * words are a copy, and the draft is refused.
 */
export const EXEMPLAR_COPY_WINDOW = 12;
/** The near-copy test (the Commander's ruling (b)): this share or more of a draft's distinct shingles of this length in one exemplar. */
export const EXEMPLAR_SHINGLE = 8;
export const EXEMPLAR_SHINGLE_SHARE = 0.25;

/** A line of the frozen prompt and of the model's free text is one line: no control character may break it or hide in it. */
const CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;
/** An input's own text may run over several lines; inside the prompt each becomes one, its breaks read as `／`. */
const LINE_BREAKS = /\r\n?|\n/gu;
/** An input's own text: a line break is its own (`oneLine` reads it as `／`); no other control or separator character is. */
const INPUT_CONTROL_CHARACTER = /[\p{Zl}\p{Zp}]|(?![\n])\p{Cc}/u;

/** The Book's metadata as the draft may state it. */
export interface WritingBookInput {
  readonly title: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  readonly series: ReadonlyArray<string>;
}

/** The synopsis and characters of the Book's latest baseline analysis, in its words. */
export interface WritingSynopsisInput {
  readonly text: string;
  /** The synopsis was longer than the contract takes: this is its opening. */
  readonly excerpt: boolean;
  readonly characters: ReadonlyArray<{ readonly name: string; readonly note: string | null }>;
}

/** What the draft may take from the Book's latest 定稿 evaluation: the editor's conclusion, strengths and marketing points. */
export interface WritingEvaluationInput {
  /** The conclusion the editor chose, in its label. */
  readonly conclusion: string;
  readonly strengths: ReadonlyArray<string>;
  /** AI7's market section of the 初评 the version began from: 目标读者, 差异化卖点, 渠道与策略; `null` when it has none. */
  readonly market: null | {
    readonly readers: ReadonlyArray<string>;
    readonly sellingPoints: ReadonlyArray<string>;
    readonly channels: ReadonlyArray<string>;
  };
}

/** One of the house's 范例 of the type that seeds the draft: whose it is, which version, and its text — to reference, never copy. */
export interface WritingExemplarInput {
  readonly bookTitle: string;
  readonly version: number;
  readonly text: string;
  /** The exemplar was longer than the contract takes: this is its opening. */
  readonly excerpt: boolean;
}

export interface WritingContractInput {
  readonly type: { readonly typeId: string; readonly label: string };
  readonly book: WritingBookInput;
  readonly audience: string;
  readonly channel: string;
  readonly requirements: string | null;
  readonly synopsis: WritingSynopsisInput | null;
  readonly evaluation: WritingEvaluationInput | null;
  readonly exemplars: ReadonlyArray<WritingExemplarInput>;
}

/** One passage exactly as the model listed it. */
export interface WritingPassage {
  readonly kind: WritingPassageKind;
  readonly note: string;
  /** 1-based over the unit's blocks in message order: the overlap blocks first, then the own blocks. */
  readonly blockOrdinals: ReadonlyArray<number>;
}

export interface WritingUnitResult {
  readonly schema: typeof WRITING_UNIT_RESULT_SCHEMA;
  readonly unitOrdinal: number;
  readonly passages: ReadonlyArray<WritingPassage>;
}

export interface WritingSynthesisResult extends WritingDraftWordsProjection {
  readonly schema: typeof WRITING_SYNTHESIS_RESULT_SCHEMA;
}

/**
 * Why a unit result did not parse: the first three as every unit contract means them; `kind-unknown` a passage of a kind the
 * contract does not list; `block-out-of-unit` a cited position past the unit's blocks.
 */
export type WritingUnitParseFailureCode = 'not-json' | 'schema-invalid' | 'unit-mismatch' | 'kind-unknown' | 'block-out-of-unit';
/** `exemplar-copied`: a draft that copies an exemplar's text (KB-004), refused whole. */
export type WritingSynthesisParseFailureCode = 'not-json' | 'schema-invalid' | 'exemplar-copied';

export type WritingUnitParse =
  | { ok: true; result: WritingUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: WritingUnitParseFailureCode; detail: string };
export type WritingSynthesisParse =
  | { ok: true; result: WritingSynthesisResult }
  | { ok: false; code: WritingSynthesisParseFailureCode; detail: string };

const UNIT_MESSAGE_HEADER = '写作单元 {ordinal}/{total} · 单元摘要 {unitDigest}' as const;
const OVERLAP_HEADER = '以下为承接上一单元的重叠上下文（仅供理解，记录段落时仍可引用）：' as const;
const OWN_HEADER = '以下为本单元的内容块：' as const;
const BLOCK_LINE = '[{blockId}] ({kind}{level}) {text}' as const;
const SYNTHESIS_HEADER = '写作综合 {closed}/{total} · 段落摘要 {setDigest}' as const;
const SYNTHESIS_KIND_LINES: Readonly<Record<WritingPassageKind, string>> = {
  highlight: '【看点】',
  character: '【人物】',
  theme: '【主题与背景】',
};
const SYNTHESIS_PASSAGE_LINE = '- 单元 {unitOrdinal}：{note}（引用 {blocks} 个内容块）' as const;
const SYNTHESIS_NO_PASSAGE = '- （各阅读范围都没有记下这一类段落）' as const;

/**
 * What each house type of the V1 baseline asks of its draft. A type the house added later has no guidance of its own and is
 * written as a document of its label; the types are configuration, so this is a reading of the labels, never a list of them.
 */
const TYPE_GUIDANCE: Readonly<Record<string, string>> = {
  'news-release': '这是一篇新闻稿：标题之后先写导语，一段说清是什么书、谁写的、为什么值得关注；正文客观、简洁，不夸大，最后一部分写图书信息。',
  'promotion-article': '这是一篇宣传文章：标题要吸引人，以看点开篇，再介绍人物与主题，语气贴合所写的受众与渠道。',
  'review-article': '这是一篇评论文章：标题要有观点，评析这本书的主题、人物与写法，论述要有依据，不写空泛的赞美。',
  'launch-materials': '这是发布会材料：分部分写出图书亮点、作者与作品介绍，以及可以在现场使用的问答要点。',
  'marketing-points': '这是营销要点：分部分写出核心卖点、目标读者与渠道建议，每一段只写一条，简短可用。',
};
const GENERIC_GUIDANCE = '按这一类文档的通常写法组织标题与各部分，语气贴合所写的受众与渠道。' as const;

/** The guidance the contract gives a type: its own for the V1 baseline's five, the generic one for any other. */
export function writingTypeGuidance(typeId: string): string {
  return Object.hasOwn(TYPE_GUIDANCE, typeId) ? TYPE_GUIDANCE[typeId]! : GENERIC_GUIDANCE;
}

function line(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && value === value.trim() &&
    !CONTROL_CHARACTER.test(value) && graphemeCount(value) <= maximumGraphemes;
}

/** An input's own text as one prompt line: each line break read as `／`, nothing else touched. */
function oneLine(value: string): string {
  return value.replace(LINE_BREAKS, '／');
}

function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= maximum &&
    !INPUT_CONTROL_CHARACTER.test(value);
}

function texts(value: unknown, maximumItems: number, maximum: number): value is string[] {
  return Array.isArray(value) && value.length <= maximumItems && value.every((entry) => text(entry, maximum));
}

/** The contract input exactly as it freezes: a type, the editor's words, each reference part present or absent, at most two exemplars. */
function frozenInput(input: WritingContractInput): WritingContractInput {
  function invalid(what: string): never {
    throw new AnalysisError('WRITING_INPUT_INVALID', `写作任务的${what}无效。`);
  }
  if (!isRecord(input) || !isRecord(input.type) || !isRecord(input.book) || !Array.isArray(input.exemplars)) invalid('输入');
  if (!text(input.type.typeId, 64) || !text(input.type.label, 40)) invalid('文档类型');
  const book = input.book;
  if (!text(book.title, 200) || !texts(book.authors, 20, 80) || !texts(book.editors, 20, 80) || !texts(book.series, 20, 120)) invalid('图书信息');
  if (!text(input.audience, 60) || !text(input.channel, 60) || (input.requirements !== null && !text(input.requirements, 300))) invalid('受众、渠道或要求');
  let synopsis: WritingSynopsisInput | null = null;
  if (input.synopsis !== null) {
    const given = input.synopsis;
    if (!isRecord(given) || !text(given.text, MAX_SYNOPSIS_GRAPHEMES) || typeof given.excerpt !== 'boolean' || !Array.isArray(given.characters) ||
        given.characters.length > MAX_CHARACTERS ||
        !given.characters.every((entry) => isRecord(entry) && text(entry.name, 80) && (entry.note === null || text(entry.note, 300)))) {
      invalid('梗概与人物');
    }
    synopsis = {
      text: given.text,
      excerpt: given.excerpt,
      characters: given.characters.map((entry) => ({ name: entry.name, note: entry.note })),
    };
  }
  let evaluation: WritingEvaluationInput | null = null;
  if (input.evaluation !== null) {
    const given = input.evaluation;
    if (!isRecord(given) || !text(given.conclusion, 20) || !texts(given.strengths, 20, 400) ||
        (given.market !== null && (!isRecord(given.market) || !texts(given.market.readers, 5, 400) ||
          !texts(given.market.sellingPoints, 5, 400) || !texts(given.market.channels, 5, 400)))) {
      invalid('评估结论与营销要点');
    }
    evaluation = {
      conclusion: given.conclusion,
      strengths: [...given.strengths],
      market: given.market === null ? null : {
        readers: [...given.market.readers],
        sellingPoints: [...given.market.sellingPoints],
        channels: [...given.market.channels],
      },
    };
  }
  if (input.exemplars.length > MAX_WRITING_EXEMPLARS) invalid('范例数量');
  const exemplars = input.exemplars.map((exemplar) => {
    if (!isRecord(exemplar) || !text(exemplar.bookTitle, 200) || typeof exemplar.version !== 'number' || !Number.isSafeInteger(exemplar.version) ||
        exemplar.version < 1 || !text(exemplar.text, MAX_EXEMPLAR_GRAPHEMES) || typeof exemplar.excerpt !== 'boolean') {
      invalid('范例');
    }
    return { bookTitle: exemplar.bookTitle, version: exemplar.version, text: exemplar.text, excerpt: exemplar.excerpt };
  });
  return {
    type: { typeId: input.type.typeId, label: input.type.label },
    book: { title: book.title, authors: [...book.authors], editors: [...book.editors], series: [...book.series] },
    audience: input.audience,
    channel: input.channel,
    requirements: input.requirements,
    synopsis,
    evaluation,
    exemplars,
  };
}

/** The Book's metadata, the editor's words and the reference parts, as the prompt states them, one line each. */
function referenceLines(input: WritingContractInput): string[] {
  const named = (list: ReadonlyArray<string>, none: string): string => (list.length === 0 ? none : list.map(oneLine).join('、'));
  const lines = [
    `- 图书：《${oneLine(input.book.title)}》；作者：${named(input.book.authors, '未填写')}；责编：${named(input.book.editors, '未填写')}；书系：${named(input.book.series, '不在任何书系中')}`,
    `- 文档类型：${input.type.label}；受众：${oneLine(input.audience)}；渠道：${oneLine(input.channel)}${input.requirements === null ? '' : `；其他要求：${oneLine(input.requirements)}`}`,
  ];
  if (input.synopsis === null) lines.push('- 梗概与人物：本书尚无基线分析，本次不参考梗概与人物');
  else {
    lines.push(`- 梗概${input.synopsis.excerpt ? '（节选开头）' : ''}：${oneLine(input.synopsis.text)}`);
    for (const character of input.synopsis.characters) {
      lines.push(`- 人物「${oneLine(character.name)}」${character.note === null ? '' : `：${oneLine(character.note)}`}`);
    }
  }
  if (input.evaluation === null) lines.push('- 评估：本书尚无定稿的评估，本次不参考评估结论与营销要点');
  else {
    lines.push(`- 评估结论（编辑选定）：${input.evaluation.conclusion}`);
    if (input.evaluation.strengths.length > 0) lines.push(`- 主要优点：${input.evaluation.strengths.map(oneLine).join('；')}`);
    const market = input.evaluation.market;
    if (market === null) lines.push('- 营销要点：这一版评估没有 AI7 初评的市场部分');
    else {
      if (market.readers.length > 0) lines.push(`- 目标读者：${market.readers.map(oneLine).join('；')}`);
      if (market.sellingPoints.length > 0) lines.push(`- 差异化卖点：${market.sellingPoints.map(oneLine).join('；')}`);
      if (market.channels.length > 0) lines.push(`- 渠道与策略：${market.channels.map(oneLine).join('；')}`);
    }
  }
  return lines;
}

function systemPromptOf(input: WritingContractInput): string {
  return [
    `你是 AI7 的写作组件，为本社起草一份「${input.type.label}」。你只处理用户消息中给出的一个分析单元，逐块阅读，找出这份文档可以取用的段落。`,
    '以下是这份文档的参考信息（照录，不得改动）：',
    ...referenceLines(input).slice(0, 2),
    '本步只找段落，不写文档、不改写稿件、不调用任何工具、不引用外部资料。',
    '每条段落精确包含以下键：kind（highlight 表示可以用来吸引读者的看点、悬念或场面，character 表示人物，theme 表示主题或背景）、note（这一段说明了什么，不超过 200 字素）、blockOrdinals（它所依据的内容块序号数组，至少 1 个、至多 8 个、不重复）。',
    '内容块序号从 1 开始，按用户消息中列出的顺序计数：先是重叠上下文的内容块，然后是本单元的内容块。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.writing.unit-result/1"）、unitOrdinal（与用户消息头部的单元序号一致）、passages（数组，至多 12 项）。',
    '本单元没有可取用的段落时输出空数组。不要编造稿件中不存在的内容。',
  ].join('\n');
}

/** What the plan and the synthesis say of the house's 范例 of the type: none, or the ones the draft references. */
export function writingExemplarLine(typeLabel: string, exemplars: ReadonlyArray<Pick<WritingExemplarInput, 'bookTitle' | 'version'>>): string {
  return exemplars.length === 0
    ? `本社暂无其他图书的${typeLabel}范例，本次不参考范例`
    : `参照本社 ${exemplars.length} 份${typeLabel}范例（只参照，不照抄）：${exemplars.map((exemplar) => `《${exemplar.bookTitle}》版本 ${exemplar.version}`).join('、')}`;
}

function synthesisInstructionOf(input: WritingContractInput): string {
  const exemplarLines = input.exemplars.length === 0
    ? [`${writingExemplarLine(input.type.label, input.exemplars)}。`]
    : [
        `${writingExemplarLine(input.type.label, input.exemplars)}。只学它们的结构、篇幅与写法，不照抄其中任何句子；与范例相同的连续 ${EXEMPLAR_COPY_WINDOW} 个字以上的文字，或与一份范例大段近似的写法，都会让整份草稿被拒绝：`,
        ...input.exemplars.map((exemplar) => `《${oneLine(exemplar.bookTitle)}》版本 ${exemplar.version}${exemplar.excerpt ? '（节选开头）' : ''}：${oneLine(exemplar.text)}`),
      ];
  return [
    `以下是同一部书稿各已闭合阅读范围中可以取用的段落。依据这些段落与下列参考信息，为本社起草一份「${input.type.label}」。`,
    writingTypeGuidance(input.type.typeId),
    ...referenceLines(input),
    ...exemplarLines,
    '只写参考信息与段落中有依据的内容：不编造获奖、销量、价格、日期或任何数字，不重读稿件原文、不引用外部知识、不调用任何工具、不改写稿件。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.writing.synthesis-result/1"）、title、sections。',
    'title 是文档标题，不超过 60 字素；sections 是 1 到 8 个部分的数组，每个部分精确包含 heading（小标题，不超过 30 字素）与 paragraphs（1 到 6 段的字符串数组，每段不超过 600 字素）。标题、小标题与每一段都只占一行。',
  ].join('\n');
}

/** The frozen prompt contract: model-facing text, fixed formats, the type, the editor's words, the reference set and the exemplars. */
export interface WritingPromptContract {
  readonly schema: typeof WRITING_PROMPT_CONTRACT_SCHEMA;
  readonly contractVersion: typeof WRITING_CONTRACT_VERSION;
  readonly unitResultSchema: typeof WRITING_UNIT_RESULT_SCHEMA;
  readonly synthesisResultSchema: typeof WRITING_SYNTHESIS_RESULT_SCHEMA;
  readonly exemplarCopyWindow: typeof EXEMPLAR_COPY_WINDOW;
  readonly exemplarShingle: typeof EXEMPLAR_SHINGLE;
  readonly exemplarShingleShare: typeof EXEMPLAR_SHINGLE_SHARE;
  readonly input: WritingContractInput;
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

export function writingContract(input: WritingContractInput): WritingPromptContract {
  const frozen = frozenInput(input);
  return {
    schema: WRITING_PROMPT_CONTRACT_SCHEMA,
    contractVersion: WRITING_CONTRACT_VERSION,
    unitResultSchema: WRITING_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: WRITING_SYNTHESIS_RESULT_SCHEMA,
    exemplarCopyWindow: EXEMPLAR_COPY_WINDOW,
    exemplarShingle: EXEMPLAR_SHINGLE,
    exemplarShingleShare: EXEMPLAR_SHINGLE_SHARE,
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

export function writingContractDigest(contract: WritingPromptContract): string {
  return sha256Hex(canonicalJson(contract));
}

// ---- the reference bound: an exemplar is referenced, never copied (KB-004) -----------------------------------------------

/** Spaces, punctuation and symbols are not words: a copy is the same characters whatever stands between them. */
const NOT_WORDS = /[\s\p{P}\p{S}\p{C}]/gu;
const SEGMENTER = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

/** A text's characters as the bound compares them: compatibility-normalized, without spaces, punctuation or symbols. */
function comparable(value: string): string[] {
  return Array.from(SEGMENTER.segment(value.normalize('NFKC').replace(NOT_WORDS, '')), ({ segment }) => segment);
}

/** Every run of `size` consecutive characters of one comparable stream. */
function windowsOf(characters: ReadonlyArray<string>, size: number): Set<string> {
  const found = new Set<string>();
  for (let start = 0; start + size <= characters.length; start += 1) found.add(characters.slice(start, start + size).join(''));
  return found;
}

/**
 * The draft's runs of `size` characters that could be someone's words (the Commander's ruling (c), #688 review): not a run of
 * digits and ASCII letters only, and not one touching an ISBN-like run — ten or more of digits and X with at least nine digits,
 * a book number, a phone number, a date written out — wherever in that number the run begins or ends.
 */
function wordWindowsOf(characters: ReadonlyArray<string>, size: number): Set<string> {
  const numbered = characters.map(() => false);
  let start = 0;
  for (let index = 0; index <= characters.length; index += 1) {
    if (index < characters.length && /^[0-9Xx]$/u.test(characters[index]!)) continue;
    const run = characters.slice(start, index);
    if (run.length >= 10 && run.filter((character) => /^[0-9]$/u.test(character)).length >= 9) numbered.fill(true, start, index);
    start = index + 1;
  }
  const found = new Set<string>();
  for (let first = 0; first + size <= characters.length; first += 1) {
    const window = characters.slice(first, first + size);
    if (window.every((character) => /^[0-9A-Za-z]$/u.test(character)) || numbered.slice(first, first + size).includes(true)) continue;
    found.add(window.join(''));
  }
  return found;
}

/**
 * Every word of the reference set that is the Book's own: what the draft may say in the same words. The editor's 其他要求 are
 * not among them (the Commander's ruling (d)): words pasted there from an exemplar exempt nothing.
 */
function ownWordsOf(input: WritingContractInput): string[] {
  return [
    input.type.label, writingTypeGuidance(input.type.typeId), input.book.title, ...input.book.authors, ...input.book.editors, ...input.book.series,
    input.audience, input.channel,
    ...(input.synopsis === null ? [] : [input.synopsis.text, ...input.synopsis.characters.flatMap((entry) => [entry.name, entry.note ?? ''])]),
    ...(input.evaluation === null ? [] : [
      input.evaluation.conclusion, ...input.evaluation.strengths,
      ...(input.evaluation.market === null ? [] : [...input.evaluation.market.readers, ...input.evaluation.market.sellingPoints, ...input.evaluation.market.channels]),
    ]),
  ];
}

/** How a draft copied an exemplar: a verbatim run, or a near copy whose shingles it shares at the threshold or above. */
export type ExemplarCopy = { exemplar: number; kind: 'verbatim' } | { exemplar: number; kind: 'near'; share: number };

/**
 * The first exemplar a draft copies, by its position among the contract's exemplars, or `null` when it copies none. The
 * Commander's rulings on the reference bound (#688 review), which the Issue's stop clause leaves to the Commander:
 *
 * - (a) The draft is compared as one stream, its title, headings and paragraphs joined as the exemplar's paragraphs are — a
 *   copy cut at a part's edge is still a copy. Both are compatibility-normalized, without spaces, punctuation or symbols.
 * - Verbatim: any {@link EXEMPLAR_COPY_WINDOW} consecutive characters of the draft that stand in the exemplar.
 * - (b) Near copy: {@link EXEMPLAR_SHINGLE_SHARE} or more of the draft's distinct {@link EXEMPLAR_SHINGLE}-character shingles
 *   stand in one exemplar — an edit every few characters does not hide a copy.
 * - (c) House boilerplate is no one's copy: a run that stands in the exemplars of two different Books, or one of digits and
 *   ASCII letters only, or one touching an ISBN-like run of the draft.
 * - (d) A run the Book's own words share — its title, a character's name, its synopsis — is the Book's; the editor's 其他要求
 *   exempt nothing.
 * - (e) 繁体 and 简体 are compared as written: no conversion table is among the dependencies, so a copy re-written in the other
 *   script is not caught (a known limit).
 *
 * Deterministic and linear in the words: no model takes part in it.
 */
export function exemplarCopied(draft: WritingDraftWordsProjection, input: WritingContractInput): ExemplarCopy | null {
  if (input.exemplars.length === 0) return null;
  const own12 = new Set<string>();
  const own8 = new Set<string>();
  for (const words of ownWordsOf(input)) {
    const characters = comparable(words);
    for (const run of windowsOf(characters, EXEMPLAR_COPY_WINDOW)) own12.add(run);
    for (const run of windowsOf(characters, EXEMPLAR_SHINGLE)) own8.add(run);
  }
  const exemplars = input.exemplars.map((exemplar) => {
    const characters = comparable(exemplar.text);
    return { book: exemplar.bookTitle, runs: windowsOf(characters, EXEMPLAR_COPY_WINDOW), shingles: windowsOf(characters, EXEMPLAR_SHINGLE) };
  });
  // Runs the exemplars of two different Books share are the house's phrasing, not one Book's words.
  const shared = (pick: (entry: (typeof exemplars)[number]) => Set<string>, run: string): boolean =>
    new Set(exemplars.filter((entry) => pick(entry).has(run)).map((entry) => entry.book)).size >= 2;
  const stream = comparable([draft.title, ...draft.sections.flatMap((section) => [section.heading, ...section.paragraphs])].join(''));
  const runs = [...wordWindowsOf(stream, EXEMPLAR_COPY_WINDOW)].filter((run) => !own12.has(run) && !shared((entry) => entry.runs, run));
  for (const [index, exemplar] of exemplars.entries()) {
    if (runs.some((run) => exemplar.runs.has(run))) return { exemplar: index, kind: 'verbatim' };
  }
  // The share is of every distinct shingle the draft has, so its own words, numbers and the house's phrasing dilute a copy only
  // by what they add, never by being skipped.
  const shingles = windowsOf(stream, EXEMPLAR_SHINGLE);
  if (shingles.size === 0) return null;
  const counted = [...wordWindowsOf(stream, EXEMPLAR_SHINGLE)].filter((run) => !own8.has(run) && !shared((entry) => entry.shingles, run));
  for (const [index, exemplar] of exemplars.entries()) {
    const share = counted.filter((run) => exemplar.shingles.has(run)).length / shingles.size;
    if (share >= EXEMPLAR_SHINGLE_SHARE) return { exemplar: index, kind: 'near', share };
  }
  return null;
}

// ---- parsing ---------------------------------------------------------------------------------------------------------

function parseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(value);
  try {
    return { ok: true, value: JSON.parse(fenced?.[1] ?? value) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Admit one unit result: exactly the contract's keys, kinds the contract lists, positions within the unit. */
export function parseWritingUnitResult(value: string, expected: { unitOrdinal: number; blockCount: number }): WritingUnitParse {
  const parsed = parseJson(value);
  if (!parsed.ok) return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  const result = parsed.value;
  const invalid = (detail: string): WritingUnitParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(result) || !hasExactKeys(result, ['schema', 'unitOrdinal', 'passages'])) return invalid('单元结果键集合不符合写作契约 v1。');
  if (result.schema !== WRITING_UNIT_RESULT_SCHEMA) return invalid('单元结果 schema 不是写作契约 v1。');
  if (!Number.isSafeInteger(result.unitOrdinal) || (result.unitOrdinal as number) < 1) return invalid('单元序号无效。');
  if (result.unitOrdinal !== expected.unitOrdinal) {
    return { ok: false, code: 'unit-mismatch', detail: `单元结果声明的序号 ${String(result.unitOrdinal)} 与请求单元 ${expected.unitOrdinal} 不一致。` };
  }
  if (!Array.isArray(result.passages) || result.passages.length > MAX_UNIT_PASSAGES) return invalid('段落集合不符合写作契约 v1。');
  const passages: WritingPassage[] = [];
  for (const [index, candidate] of (result.passages as unknown[]).entries()) {
    const label = `第 ${index + 1} 条段落`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['kind', 'note', 'blockOrdinals'])) return invalid(`${label}的键集合不符合写作契约 v1。`);
    if (typeof candidate.kind !== 'string') return invalid(`${label}的类别无效。`);
    if (!WRITING_PASSAGE_KINDS.includes(candidate.kind as WritingPassageKind)) {
      return { ok: false, code: 'kind-unknown', detail: `${label}的类别 ${candidate.kind.slice(0, 32)} 不在写作契约内。` };
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
    passages.push({ kind: candidate.kind as WritingPassageKind, note: candidate.note, blockOrdinals: [...(ordinals as number[])] });
  }
  const unit: WritingUnitResult = { schema: WRITING_UNIT_RESULT_SCHEMA, unitOrdinal: expected.unitOrdinal, passages };
  const canonical = canonicalJson(unit);
  return { ok: true, result: unit, canonicalJson: canonical, digest: sha256Hex(canonical) };
}

/** What a refused draft is told: which exemplar it copied, and how. */
export function exemplarCopyDetail(copied: ExemplarCopy, input: WritingContractInput): string {
  const exemplar = input.exemplars[copied.exemplar]!;
  const how = copied.kind === 'verbatim'
    ? `有连续 ${EXEMPLAR_COPY_WINDOW} 个字以上相同`
    : `的 ${EXEMPLAR_SHINGLE} 字片段重合达 ${Math.floor(copied.share * 100)}%（不少于 ${EXEMPLAR_SHINGLE_SHARE * 100}% 即算照抄）`;
  return `草稿与范例《${exemplar.bookTitle}》版本 ${exemplar.version} ${how}；范例只参照，不复制，这份草稿不予采用。`;
}

/**
 * Admit the synthesis: a title and its sections, each within its bound, and nothing else — and a draft that copies none of the
 * contract's exemplars, since an exemplar is referenced and never copied (KB-004).
 */
export function parseWritingSynthesis(value: string, input: WritingContractInput): WritingSynthesisParse {
  const parsed = parseJson(value);
  if (!parsed.ok) return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  const result = parsed.value;
  const invalid = (detail: string): WritingSynthesisParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(result) || !hasExactKeys(result, ['schema', 'title', 'sections'])) return invalid('全书综合的键集合不符合写作契约 v1。');
  if (result.schema !== WRITING_SYNTHESIS_RESULT_SCHEMA) return invalid('全书综合 schema 不是写作契约 v1。');
  if (!line(result.title, MAX_TITLE_GRAPHEMES)) return invalid('文档标题缺失、含有控制字符或超出 60 字素边界。');
  if (!Array.isArray(result.sections) || result.sections.length < 1 || result.sections.length > MAX_SECTIONS) {
    return invalid('文档的部分不符合写作契约 v1：要有 1 到 8 个部分。');
  }
  const sections: Array<{ heading: string; paragraphs: string[] }> = [];
  for (const [index, candidate] of (result.sections as unknown[]).entries()) {
    const label = `第 ${index + 1} 部分`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['heading', 'paragraphs'])) return invalid(`${label}的键集合不符合写作契约 v1。`);
    if (!line(candidate.heading, MAX_HEADING_GRAPHEMES)) return invalid(`${label}的小标题缺失、含有控制字符或超出 30 字素边界。`);
    const paragraphs = candidate.paragraphs;
    if (!Array.isArray(paragraphs) || paragraphs.length < 1 || paragraphs.length > MAX_SECTION_PARAGRAPHS ||
        !paragraphs.every((paragraph) => line(paragraph, MAX_PARAGRAPH_GRAPHEMES))) {
      return invalid(`${label}的段落不符合写作契约 v1：要有 1 到 6 段，每段只占一行、不超过 600 字素。`);
    }
    sections.push({ heading: candidate.heading, paragraphs: [...(paragraphs as string[])] });
  }
  const draft: WritingSynthesisResult = { schema: WRITING_SYNTHESIS_RESULT_SCHEMA, title: result.title, sections };
  const copied = exemplarCopied(draft, input);
  if (copied !== null) return { ok: false, code: 'exemplar-copied', detail: exemplarCopyDetail(copied, input) };
  return { ok: true, result: draft };
}

// ---- the unit message -----------------------------------------------------------------------------------------------

/** The prefix `写作单元` is this contract's and no other's: the deterministic adapter tells a request's kind by its header alone. */
const UNIT_HEADER_PATTERN = /^写作单元 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64})$/u;
const SYNTHESIS_HEADER_PATTERN = /^写作综合 (\d+)\/(\d+) · 段落摘要 ([0-9a-f]{64})$/u;

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (placeholder, key: string) => values[key] ?? placeholder);
}

/** The block identities of one unit in message order: the overlap context first, then the own blocks. */
export function writingMessageBlockIds(unit: CoverageManifestUnitProjection): string[] {
  return [...unit.overlapBlockIds, ...unit.blockIds];
}

function requireBlock<T>(blocksById: ReadonlyMap<string, T>, blockId: string): T {
  const block = blocksById.get(blockId);
  if (block === undefined) throw new Error('ANALYSIS_UNIT_BLOCK_MISSING');
  return block;
}

/** The exact user-role message for one Analysis Unit: header, optional overlap context, then own blocks. */
export function buildWritingUnitMessage(
  contract: WritingPromptContract,
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

/** Recover the unit identity from a message built by {@link buildWritingUnitMessage}; `null` for anything else. */
export function parseWritingUnitMessageHeader(message: string): { ordinal: number; total: number; unitDigest: string } | null {
  const match = UNIT_HEADER_PATTERN.exec(message.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal) return null;
  return { ordinal, total, unitDigest: match[3]! };
}

/** The request digest a deterministic fixture keys a unit by: a pure function of the frozen contract and the manifest unit. */
export function writingRequestDigest(promptContractDigest: string, unitOrdinal: number, unitDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, step: 'unit', unitOrdinal, unitDigest }));
}

// ---- the book-level synthesis ---------------------------------------------------------------------------------------

/** One closed unit of the Run's complete unit set, as the execution owner holds it. */
export interface ClosedWritingUnit {
  readonly unitOrdinal: number;
  readonly result: WritingUnitResult;
}

function orderedClosed(closed: ReadonlyArray<ClosedWritingUnit>): ClosedWritingUnit[] {
  return [...closed].sort((left, right) => left.unitOrdinal - right.unitOrdinal);
}

/**
 * The digest of what the synthesis reads: every closed unit's passages in unit order. Positions, not block identities, so
 * the same manuscript imported again asks the same question.
 */
export function writingPassageSetDigest(closed: ReadonlyArray<ClosedWritingUnit>): string {
  return sha256Hex(canonicalJson(orderedClosed(closed).map(({ unitOrdinal, result }) => ({ unitOrdinal, passages: result.passages }))));
}

/** The exact user-role message for the synthesis: header, the frozen instruction, then the passages by what they are. */
export function buildWritingSynthesisMessage(
  contract: WritingPromptContract,
  closed: ReadonlyArray<ClosedWritingUnit>,
  totalUnits: number,
): string {
  const units = orderedClosed(closed);
  const lines = [
    fill(contract.synthesisHeader, { closed: String(units.length), total: String(totalUnits), setDigest: writingPassageSetDigest(units) }),
    contract.synthesisInstruction,
  ];
  for (const kind of WRITING_PASSAGE_KINDS) {
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

/** Recover the synthesis identity from a message built by {@link buildWritingSynthesisMessage}; `null` for anything else. */
export function parseWritingSynthesisMessageHeader(message: string): { closed: number; total: number; setDigest: string } | null {
  const match = SYNTHESIS_HEADER_PATTERN.exec(message.split('\n', 1)[0] ?? '');
  if (match === null) return null;
  const closed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(closed) || closed < 1 || !Number.isSafeInteger(total) || total < closed) return null;
  return { closed, total, setDigest: match[3]! };
}

/** The request digest of the synthesis, keyed under unit ordinal `0`: a pure function of the frozen contract and what it reads. */
export function writingSynthesisRequestDigest(promptContractDigest: string, setDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(setDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, step: 'synthesis', passageSetDigest: setDigest }));
}
