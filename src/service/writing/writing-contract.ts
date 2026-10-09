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
/**
 * The frozen prompt contract carries the copy rules that judge its answer (the Commander's ruling on #704 P2-2): `/2` since
 * #698. A Task recorded under `/1` keeps `/1`'s contract — its digest, its instruction — and `/1`'s rules.
 */
export const WRITING_PROMPT_CONTRACT_SCHEMA = 'ai7.writing.prompt-contract/2' as const;
export const WRITING_PROMPT_CONTRACT_SCHEMA_V1 = 'ai7.writing.prompt-contract/1' as const;
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
 * words are a copy, and the draft is refused, when no punctuation stands inside them in either text…
 */
export const EXEMPLAR_COPY_WINDOW = 12;
/** …and this many when punctuation does (the Commander's ruling on #698): house phrasing of two short clauses is no one's copy. */
export const EXEMPLAR_COPY_WINDOW_ACROSS = 16;
/**
 * Latin-script prose under the same rules on words (#698; the Commander's rulings for the Owner on #704): this many consecutive
 * words within punctuation, or across it; shingles of this many words, and spans of this many. Carried by the `/2` contract.
 */
export const EXEMPLAR_COPY_WORDS = 8;
export const EXEMPLAR_COPY_WORDS_ACROSS = 11;
export const EXEMPLAR_WORD_SHINGLE = 4;
export const EXEMPLAR_WORD_SPAN = 130;
/** The near-copy test (the Commander's ruling (b)): this share or more of a draft's distinct shingles of this length in one exemplar. */
export const EXEMPLAR_SHINGLE = 6;
export const EXEMPLAR_SHINGLE_SHARE = 0.25;
/** …or, in any span of this many characters of the draft, this share or more of the span's shingles in one exemplar (#688 re-review). */
export const EXEMPLAR_SPAN = 200;
export const EXEMPLAR_SPAN_SHARE = 0.3;
/** The copy rules a frozen prompt contract carries: `/1` (#688) or `/2` (#698). */
export type WritingCopyRules = 1 | 2;
export const WRITING_COPY_RULES = 2 as const;
/** The sizes `/1` judges by (#688): 12 characters whatever stands inside them, 6-character shingles, a 200-character span. */
export interface WritingCopySizesV1 {
  readonly rules: 1;
  readonly copyWindow: 12;
  readonly shingle: 6;
  readonly shingleShare: 0.25;
  readonly span: 200;
  readonly spanShare: 0.3;
}
/** The sizes `/2` judges by (#698): characters within and across punctuation, Latin-script words, their shingles and spans. */
export interface WritingCopySizesV2 {
  readonly rules: 2;
  readonly copyWindow: typeof EXEMPLAR_COPY_WINDOW;
  readonly copyWindowAcross: typeof EXEMPLAR_COPY_WINDOW_ACROSS;
  readonly shingle: typeof EXEMPLAR_SHINGLE;
  readonly shingleShare: typeof EXEMPLAR_SHINGLE_SHARE;
  readonly span: typeof EXEMPLAR_SPAN;
  readonly spanShare: typeof EXEMPLAR_SPAN_SHARE;
  readonly copyWords: typeof EXEMPLAR_COPY_WORDS;
  readonly copyWordsAcross: typeof EXEMPLAR_COPY_WORDS_ACROSS;
  readonly wordShingle: typeof EXEMPLAR_WORD_SHINGLE;
  readonly wordSpan: typeof EXEMPLAR_WORD_SPAN;
}
export type WritingCopySizes = WritingCopySizesV1 | WritingCopySizesV2;
export const WRITING_COPY_SIZES_V1: WritingCopySizesV1 = { rules: 1, copyWindow: 12, shingle: 6, shingleShare: 0.25, span: 200, spanShare: 0.3 };
export const WRITING_COPY_SIZES: WritingCopySizesV2 = {
  rules: 2,
  copyWindow: EXEMPLAR_COPY_WINDOW,
  copyWindowAcross: EXEMPLAR_COPY_WINDOW_ACROSS,
  shingle: EXEMPLAR_SHINGLE,
  shingleShare: EXEMPLAR_SHINGLE_SHARE,
  span: EXEMPLAR_SPAN,
  spanShare: EXEMPLAR_SPAN_SHARE,
  copyWords: EXEMPLAR_COPY_WORDS,
  copyWordsAcross: EXEMPLAR_COPY_WORDS_ACROSS,
  wordShingle: EXEMPLAR_WORD_SHINGLE,
  wordSpan: EXEMPLAR_WORD_SPAN,
};
/** A Task whose exemplar no longer gives the text its reference pinned is not started again; the editor prepares a new one. */
export const WRITING_EXEMPLAR_MOVED = '这次起草参照的范例已不在本机，不能再开始；可以用「新建文档…」重新准备。' as const;

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

/** What the model is told of the copy rules (the Commander's ruling on #704 P2-2: `/2` states the Chinese and English rules plainly). */
function copyRulesInstruction(rules: WritingCopyRules): string {
  if (rules === 1) return `与范例相同的连续 ${WRITING_COPY_SIZES_V1.copyWindow} 个字以上的文字，或与一份范例大段近似的写法，都会让整份草稿被拒绝`;
  const sizes = WRITING_COPY_SIZES;
  return [
    `以下任何一种都会让整份草稿被拒绝：中文与一份范例在一句之内有连续 ${sizes.copyWindow} 个字相同，或跨标点、空格有连续 ${sizes.copyWindowAcross} 个字相同`,
    `英文等拉丁字母文字与一份范例在一句之内有连续 ${sizes.copyWords} 个词相同，或跨标点有连续 ${sizes.copyWordsAcross} 个词相同`,
    `与一份范例大段近似：草稿的 ${sizes.shingle} 字片段与 ${sizes.wordShingle} 词片段合计有 ${sizes.shingleShare * 100}% 出现在这份范例中，或草稿任一 ${sizes.span} 字、${sizes.wordSpan} 词的段落中有 ${sizes.spanShare * 100}% 的片段出现在这份范例中`,
    '两份以上范例共有的本社套话、本书自己的书名人名与参考信息，以及书号、网址、编号不算照抄',
  ].join('；');
}

function synthesisInstructionOf(input: WritingContractInput, rules: WritingCopyRules): string {
  const exemplarLines = input.exemplars.length === 0
    ? [`${writingExemplarLine(input.type.label, input.exemplars)}。`]
    : [
        `${writingExemplarLine(input.type.label, input.exemplars)}。只学它们的结构、篇幅与写法，不照抄其中任何句子；${copyRulesInstruction(rules)}：`,
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

/** What every frozen prompt contract holds: model-facing text, fixed formats, the type, the editor's words, the reference set. */
interface WritingPromptContractCommon {
  readonly contractVersion: typeof WRITING_CONTRACT_VERSION;
  readonly unitResultSchema: typeof WRITING_UNIT_RESULT_SCHEMA;
  readonly synthesisResultSchema: typeof WRITING_SYNTHESIS_RESULT_SCHEMA;
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

/** `/1` exactly as #688 froze it — its keys and values are its digest — with #688's copy sizes. */
export interface WritingPromptContractV1 extends WritingPromptContractCommon {
  readonly schema: typeof WRITING_PROMPT_CONTRACT_SCHEMA_V1;
  readonly exemplarCopyWindow: WritingCopySizesV1['copyWindow'];
  readonly exemplarShingle: WritingCopySizesV1['shingle'];
  readonly exemplarShingleShare: WritingCopySizesV1['shingleShare'];
  readonly exemplarSpan: WritingCopySizesV1['span'];
  readonly exemplarSpanShare: WritingCopySizesV1['spanShare'];
}

/** `/2` (#698): every size that judges the answer, for characters and for Latin-script words. */
export interface WritingPromptContractV2 extends WritingPromptContractCommon {
  readonly schema: typeof WRITING_PROMPT_CONTRACT_SCHEMA;
  readonly exemplarCopyWindow: typeof EXEMPLAR_COPY_WINDOW;
  readonly exemplarCopyWindowAcross: typeof EXEMPLAR_COPY_WINDOW_ACROSS;
  readonly exemplarShingle: typeof EXEMPLAR_SHINGLE;
  readonly exemplarShingleShare: typeof EXEMPLAR_SHINGLE_SHARE;
  readonly exemplarSpan: typeof EXEMPLAR_SPAN;
  readonly exemplarSpanShare: typeof EXEMPLAR_SPAN_SHARE;
  readonly exemplarCopyWords: typeof EXEMPLAR_COPY_WORDS;
  readonly exemplarCopyWordsAcross: typeof EXEMPLAR_COPY_WORDS_ACROSS;
  readonly exemplarWordShingle: typeof EXEMPLAR_WORD_SHINGLE;
  readonly exemplarWordSpan: typeof EXEMPLAR_WORD_SPAN;
}

/** The frozen prompt contract: model-facing text, fixed formats, the type, the editor's words, the reference set and the exemplars. */
export type WritingPromptContract = WritingPromptContractV1 | WritingPromptContractV2;

/**
 * The frozen prompt contract of one request, under the copy rules `rules`: `/2` for every Task prepared now; `/1` only to read
 * again, byte for byte, a Task recorded under it (the Commander's ruling on #704 P2-2).
 */
export function writingContract(input: WritingContractInput, rules: WritingCopyRules = WRITING_COPY_RULES): WritingPromptContract {
  const frozen = frozenInput(input);
  const common: WritingPromptContractCommon = {
    contractVersion: WRITING_CONTRACT_VERSION,
    unitResultSchema: WRITING_UNIT_RESULT_SCHEMA,
    synthesisResultSchema: WRITING_SYNTHESIS_RESULT_SCHEMA,
    input: frozen,
    systemPrompt: systemPromptOf(frozen),
    unitMessageHeader: UNIT_MESSAGE_HEADER,
    overlapHeader: OVERLAP_HEADER,
    ownHeader: OWN_HEADER,
    blockLine: BLOCK_LINE,
    synthesisInstruction: synthesisInstructionOf(frozen, rules),
    synthesisHeader: SYNTHESIS_HEADER,
    synthesisKindLines: SYNTHESIS_KIND_LINES,
    synthesisPassageLine: SYNTHESIS_PASSAGE_LINE,
    synthesisNoPassage: SYNTHESIS_NO_PASSAGE,
  };
  if (rules === 1) {
    const sizes = WRITING_COPY_SIZES_V1;
    return {
      ...common,
      schema: WRITING_PROMPT_CONTRACT_SCHEMA_V1,
      exemplarCopyWindow: sizes.copyWindow,
      exemplarShingle: sizes.shingle,
      exemplarShingleShare: sizes.shingleShare,
      exemplarSpan: sizes.span,
      exemplarSpanShare: sizes.spanShare,
    };
  }
  const sizes = WRITING_COPY_SIZES;
  return {
    ...common,
    schema: WRITING_PROMPT_CONTRACT_SCHEMA,
    exemplarCopyWindow: sizes.copyWindow,
    exemplarCopyWindowAcross: sizes.copyWindowAcross,
    exemplarShingle: sizes.shingle,
    exemplarShingleShare: sizes.shingleShare,
    exemplarSpan: sizes.span,
    exemplarSpanShare: sizes.spanShare,
    exemplarCopyWords: sizes.copyWords,
    exemplarCopyWordsAcross: sizes.copyWordsAcross,
    exemplarWordShingle: sizes.wordShingle,
    exemplarWordSpan: sizes.wordSpan,
  };
}

/** The copy rules a frozen contract carries. */
export function writingContractRules(contract: WritingPromptContract): WritingCopyRules {
  return contract.schema === WRITING_PROMPT_CONTRACT_SCHEMA_V1 ? 1 : 2;
}

/** The sizes a frozen contract carries, as the bound reads them: the Task is judged under its own contract (#704 P2-2). */
export function writingCopySizes(contract: WritingPromptContract): WritingCopySizes {
  if (contract.schema === WRITING_PROMPT_CONTRACT_SCHEMA_V1) {
    return { rules: 1, copyWindow: contract.exemplarCopyWindow, shingle: contract.exemplarShingle, shingleShare: contract.exemplarShingleShare, span: contract.exemplarSpan, spanShare: contract.exemplarSpanShare };
  }
  return {
    rules: 2,
    copyWindow: contract.exemplarCopyWindow,
    copyWindowAcross: contract.exemplarCopyWindowAcross,
    shingle: contract.exemplarShingle,
    shingleShare: contract.exemplarShingleShare,
    span: contract.exemplarSpan,
    spanShare: contract.exemplarSpanShare,
    copyWords: contract.exemplarCopyWords,
    copyWordsAcross: contract.exemplarCopyWordsAcross,
    wordShingle: contract.exemplarWordShingle,
    wordSpan: contract.exemplarWordSpan,
  };
}

export function writingContractDigest(contract: WritingPromptContract): string {
  return sha256Hex(canonicalJson(contract));
}

// ---- the reference bound: an exemplar is referenced, never copied (KB-004) -----------------------------------------------

/** Spaces, punctuation and symbols are not words: a copy is the same characters whatever stands between them. */
const NOT_WORD = /[\s\p{P}\p{S}\p{C}]/u;
/** …but punctuation and symbols end a run that is only 12 characters long: across them a run counts from 16 (#698). */
const PUNCTUATION = /[\p{P}\p{S}]/u;
const LETTER = /\p{L}/u;
const LATIN = /\p{Script=Latin}/u;
const MARK = /\p{M}/u;
const LINE_BREAK = /[\n\r\u2028\u2029]/u;
const SEGMENTER = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
/** The one unit an identifier leaves in the character stream: a window touching it is no one's words. */
const IDENTIFIER_UNIT = '\uE000';

/**
 * What a soft break is, so a refusal can name the ones a run was copied across (#707): in the characters, punctuation, a space
 * between two clauses or a Latin-script word; in the words, punctuation, a number or an identifier.
 */
export type CopyBreak = 'punctuation' | 'space' | 'latin-word' | 'number' | 'identifier';
/** The soft breaks before one unit, as bits of one mask, in the order the refusal names them. */
const BREAKS: ReadonlyArray<CopyBreak> = ['punctuation', 'space', 'latin-word', 'number', 'identifier'];
const BREAK_PUNCTUATION = 1;
const BREAK_SPACE = 2;
const BREAK_LATIN_WORD = 4;
const BREAK_NUMBER = 8;
const BREAK_IDENTIFIER = 16;
/** The breaks of one mask, by name, in their fixed order. */
function breakNames(mask: number): CopyBreak[] {
  return BREAKS.filter((_, bit) => (mask & (1 << bit)) !== 0);
}

/**
 * One text as the bound compares it: a stream of units — characters, or Latin-script words — each with which soft breaks
 * (punctuation, a number, an identifier, a space between clauses) stand right before it as a mask, `0` for none, whether a hard
 * stop does (text of another script, which no word window may span), and whether it is an identifier no one writes (an ISBN, a
 * URL, a code).
 */
interface CopyStream {
  readonly units: ReadonlyArray<string>;
  readonly breakBefore: ReadonlyArray<number>;
  readonly hardBefore: ReadonlyArray<boolean>;
  readonly identifier: ReadonlyArray<boolean>;
}

function latinLetter(character: string | undefined): boolean {
  return character !== undefined && LETTER.test(character) && LATIN.test(character);
}

function digit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9';
}

function asciiPrintable(character: string): boolean {
  return character.length === 1 && character > ' ' && character <= '~';
}

/** Whether one run of ASCII between spaces and other scripts, its punctuation trimmed, is a URL, an e-mail address or a domain. */
function addressLike(core: string): boolean {
  if (core.includes('://') || /^www\./iu.test(core)) return true;
  const at = core.indexOf('@');
  if (at > 0) {
    const dot = core.indexOf('.', at);
    if (dot > at + 1 && dot < core.length - 1) return true;
  }
  const host = core.split(/[/?#]/u, 1)[0]!;
  const labels = host.split('.');
  return labels.length >= 2 && labels.every((label) => /^[0-9A-Za-z-]+$/u.test(label)) && /^[A-Za-z]{2,24}$/u.test(labels.at(-1)!);
}

/**
 * An ISBN-10 whose check digit is X, hyphenated or not (#707): its X is a Latin letter, which would otherwise go to the words and
 * leave nine digits, one short of the ISBN-like run {@link markNumbers} marks. Recognised whole before the streams are split.
 */
const ISBN10_X = /^\d(?:-?\d){8}-?[Xx]$/u;

/** A Latin-script word as the word stream compares it: without its accents, lower-cased, a curly apostrophe read as straight. */
function wordKey(token: string): string {
  return token.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\u2018\u2019]/gu, "'");
}

/**
 * A text's two streams under the `/2` rules (the Commander's rulings on #688 and #698), read in passes linear in its characters:
 *
 * - words: each maximal run of Latin-script letters, accented ones included (an apostrophe or a hyphen between two letters
 *   joins it), compared without accents and lower-cased. Punctuation, a number or an identifier between two words is a soft
 *   break; text of another script — a Chinese character, kana — is a hard stop no word window or shingle spans (#704 P2-1).
 * - characters: everything else that is a word — CJK and other scripts, and the digits of a number — compatibility-normalized
 *   and without spaces, punctuation or symbols. A Latin word in it is weighed on words instead, and leaves a soft break where it
 *   stood (#704 P3-1); so does punctuation, and a space between two clauses of non-ASCII text (#704 P3-3). A line break — a
 *   part's or a paragraph's edge — is no break: a copy cut there is still a copy; nor is whitespace beside one — a paragraph's
 *   indentation, a trailing space — which is the edge's own and no space between clauses (#707).
 *
 * An identifier — a URL, an e-mail address, a domain, a code of letters and digits, or an ISBN-10 ending in X (#707) — is no
 * one's words: it leaves one marked unit in the characters, and a soft break between words. ISBN-like numbers of digits alone
 * are marked by {@link markNumbers}.
 */
function copyStreams(value: string): { characters: CopyStream; words: CopyStream } {
  const points = Array.from(value.normalize('NFKC'));
  // The addresses, each a run of printable ASCII its punctuation trimmed: [first, last) in code points.
  const addressEnd = new Int32Array(points.length).fill(-1);
  for (let index = 0; index < points.length;) {
    if (!asciiPrintable(points[index]!)) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < points.length && asciiPrintable(points[end]!)) end += 1;
    let first = index;
    let last = end;
    while (first < last && !/^[0-9A-Za-z]$/u.test(points[first]!)) first += 1;
    while (last > first && !/^[0-9A-Za-z]$/u.test(points[last - 1]!)) last -= 1;
    if (first < last) {
      const core = points.slice(first, last).join('');
      if (addressLike(core) || ISBN10_X.test(core)) addressEnd[first] = last;
    }
    index = end;
  }

  const words: string[] = [];
  const wordBreaks: number[] = [];
  const wordHard: boolean[] = [];
  let wordSoft = 0;
  let wordStop = false;
  const pushWord = (word: string): void => {
    words.push(word);
    wordBreaks.push(wordSoft);
    wordHard.push(wordStop);
    wordSoft = 0;
    wordStop = false;
  };

  let kept = '';
  const keptBreak: number[] = [];
  const keptIdentifier: boolean[] = [];
  let soft = 0;
  let space = false;
  let afterLineBreak = false;
  let previousNonAscii = false;
  const keep = (unit: string, identifier: boolean): void => {
    const nonAscii = unit.codePointAt(0)! > 0x7f;
    const broken = soft | (space && previousNonAscii && nonAscii ? BREAK_SPACE : 0);
    kept += unit;
    for (let at = 0; at < unit.length; at += 1) {
      keptBreak.push(at === 0 ? broken : 0);
      keptIdentifier.push(identifier);
    }
    soft = 0;
    space = false;
    previousNonAscii = nonAscii;
  };

  for (let index = 0; index < points.length;) {
    const point = points[index]!;
    const whitespace = /\s/u.test(point);
    if (!whitespace) afterLineBreak = false;
    if (addressEnd[index]! >= 0) {
      keep(IDENTIFIER_UNIT, true);
      wordSoft |= BREAK_IDENTIFIER;
      index = addressEnd[index]!;
      continue;
    }
    if (latinLetter(point) || digit(point)) {
      let tail = index + 1;
      while (tail < points.length && addressEnd[tail]! < 0 && (latinLetter(points[tail]) || digit(points[tail]) || MARK.test(points[tail]!) ||
        (/^['\u2018\u2019-]$/u.test(points[tail]!) && latinLetter(points[tail - 1]) && latinLetter(points[tail + 1])))) tail += 1;
      const token = points.slice(index, tail);
      const letters = token.some((character) => latinLetter(character));
      const digits = token.some((character) => digit(character));
      if (letters && digits) {
        keep(IDENTIFIER_UNIT, true);
        wordSoft |= BREAK_IDENTIFIER;
      } else if (digits) {
        for (const character of token) if (digit(character)) keep(character, false);
        wordSoft |= BREAK_NUMBER;
      } else {
        pushWord(wordKey(token.join('')));
        soft |= BREAK_LATIN_WORD;
      }
      index = tail;
      continue;
    }
    if (whitespace) {
      // Whitespace beside a line break is the edge's own: a paragraph's indentation or a trailing space breaks nothing (#707).
      if (LINE_BREAK.test(point)) {
        space = false;
        afterLineBreak = true;
      } else if (!afterLineBreak) space = true;
    } else if (PUNCTUATION.test(point)) {
      soft |= BREAK_PUNCTUATION;
      wordSoft |= BREAK_PUNCTUATION;
    } else if (!NOT_WORD.test(point)) {
      // Another script's character: the characters' own, a hard stop for the words.
      keep(point, false);
      wordStop = true;
    }
    index += 1;
  }

  const units: string[] = [];
  const breakBefore: number[] = [];
  const identifier: boolean[] = [];
  for (const { segment, index: start } of SEGMENTER.segment(kept)) {
    units.push(segment);
    let broken = 0;
    let marked = false;
    for (let unit = start; unit < start + segment.length; unit += 1) {
      broken |= keptBreak[unit]!;
      marked ||= keptIdentifier[unit]!;
    }
    breakBefore.push(broken);
    identifier.push(marked);
  }
  return {
    characters: { units, breakBefore, hardBefore: units.map(() => false), identifier: markNumbers(units, identifier) },
    words: { units: words, breakBefore: wordBreaks, hardBefore: wordHard, identifier: words.map(() => false) },
  };
}

/**
 * The characters of an ISBN-like run — ten or more of digits and X with at least nine digits: a book number, a phone number, a
 * date written out — marked as an identifier, wherever in that number a window begins or ends (the Commander's ruling (c),
 * #688 review). Linear in the stream.
 */
function markNumbers(characters: ReadonlyArray<string>, identifier: ReadonlyArray<boolean>): boolean[] {
  const marked = [...identifier];
  let start = 0;
  for (let index = 0; index <= characters.length; index += 1) {
    if (index < characters.length && /^[0-9Xx]$/u.test(characters[index]!)) continue;
    let digits = 0;
    for (let at = start; at < index; at += 1) if (/^[0-9]$/u.test(characters[at]!)) digits += 1;
    if (index - start >= 10 && digits >= 9) marked.fill(true, start, index);
    start = index + 1;
  }
  return marked;
}

/** Running counts of a stream's marks — a boolean, or a break mask that is `0` for none — so each window is decided in constant time. */
function before(marks: ReadonlyArray<boolean | number>): number[] {
  const counts = [0];
  for (let index = 0; index < marks.length; index += 1) counts.push(counts[index]! + (marks[index] ? 1 : 0));
  return counts;
}

/** For each `size`-unit window, the soft breaks standing anywhere inside it — before any unit but its first — as one mask. */
function breaksInside(stream: CopyStream, size: number): number[] {
  // Running counts per break, so the pass stays linear in the stream.
  const counts = BREAKS.map((_, bit) => before(stream.breakBefore.map((mask) => (mask & (1 << bit)) !== 0)));
  const inside: number[] = [];
  for (let first = 0; first + size <= stream.units.length; first += 1) {
    inside.push(counts.reduce((mask, count, bit) => (count[first + size]! - count[first + 1]! > 0 ? mask | (1 << bit) : mask), 0));
  }
  return inside;
}

/** The `size`-unit window starting at each position of a stream: characters joined as they are, words with a space. */
function windowKeys(stream: CopyStream, size: number, words: boolean): string[] {
  const keys: string[] = [];
  for (let first = 0; first + size <= stream.units.length; first += 1) keys.push(stream.units.slice(first, first + size).join(words ? ' ' : ''));
  return keys;
}

/** For each `size`-unit window, whether one of the marks stands anywhere inside it — before any unit but its first. */
function marksInside(stream: CopyStream, marks: ReadonlyArray<boolean | number>, size: number): boolean[] {
  const counts = before(marks);
  const inside: boolean[] = [];
  for (let first = 0; first + size <= stream.units.length; first += 1) inside.push(counts[first + size]! - counts[first + 1]! > 0);
  return inside;
}

/**
 * For each `size`-unit window, whether it may count at all: a word window that spans no hard stop; a character window not
 * made only of digits — a number is no one's — and touching no identifier. Linear in the stream.
 */
function countableWindows(stream: CopyStream, size: number, words: boolean): boolean[] {
  if (words) return marksInside(stream, stream.hardBefore, size).map((hard) => !hard);
  const ascii = before(stream.units.map((character) => /^[0-9A-Za-z]$/u.test(character)));
  const marked = before(stream.identifier);
  const windows: boolean[] = [];
  for (let first = 0; first + size <= stream.units.length; first += 1) {
    windows.push(ascii[first + size]! - ascii[first]! !== size && marked[first + size]! - marked[first]! === 0);
  }
  return windows;
}

/**
 * Every word of the reference set that is the Book's own: what the draft may say in the same words — its title, authors,
 * editors and 书系, its synopsis and people, its evaluation's words, and the house type's own name and guidance. The editor's
 * words — 受众, 渠道 and 其他要求 — are not among them (the Commander's ruling (d), #688 re-review): words pasted there from an
 * exemplar exempt nothing.
 */
function ownWordsOf(input: WritingContractInput): string[] {
  return [
    input.type.label, writingTypeGuidance(input.type.typeId), input.book.title, ...input.book.authors, ...input.book.editors, ...input.book.series,
    ...(input.synopsis === null ? [] : [input.synopsis.text, ...input.synopsis.characters.flatMap((entry) => [entry.name, entry.note ?? ''])]),
    ...(input.evaluation === null ? [] : [
      input.evaluation.conclusion, ...input.evaluation.strengths,
      ...(input.evaluation.market === null ? [] : [...input.evaluation.market.readers, ...input.evaluation.market.sellingPoints, ...input.evaluation.market.channels]),
    ]),
  ];
}

/** The two streams a copy is counted in: characters, and Latin-script words (#698). */
export type ExemplarCopyUnit = 'character' | 'word';

/**
 * How a draft copied an exemplar: a verbatim run of `run` units — with the soft breaks it was copied across, when it was a run
 * across them under `/2` (#707); a near copy whose distinct shingles it shares at the threshold or above; or one span of the draft
 * whose shingles it shares at the span threshold or above — each in characters or in words.
 */
export type ExemplarCopy =
  | { exemplar: number; kind: 'verbatim'; unit: ExemplarCopyUnit; run: number; breaks?: ReadonlyArray<CopyBreak> }
  | { exemplar: number; kind: 'near'; unit: ExemplarCopyUnit; share: number }
  | { exemplar: number; kind: 'span'; unit: ExemplarCopyUnit; share: number };

/** One stream's sizes: the verbatim run within punctuation and across it, the shingle, the span. */
interface StreamRules {
  readonly unit: ExemplarCopyUnit;
  readonly within: number;
  readonly across: number;
  readonly shingle: number;
  readonly span: number;
}

/** The `/2` sizes of each stream, as the frozen prompt contract carries them. */
function streamRules(sizes: WritingCopySizesV2): readonly [StreamRules, StreamRules] {
  return [
    { unit: 'character', within: sizes.copyWindow, across: sizes.copyWindowAcross, shingle: sizes.shingle, span: sizes.span },
    { unit: 'word', within: sizes.copyWords, across: sizes.copyWordsAcross, shingle: sizes.wordShingle, span: sizes.wordSpan },
  ];
}

/** One text's windows in one stream, as sets: the runs within punctuation, every run of each length, every shingle. */
interface StreamWindows {
  readonly within: Set<string>;
  readonly withinAny: Set<string>;
  readonly across: Set<string>;
  readonly shingles: Set<string>;
}

function streamWindows(stream: CopyStream, rules: StreamRules): StreamWindows {
  const words = rules.unit === 'word';
  const keep = (size: number): string[] => {
    // A window that spans a hard stop is in no set: the same words across another script are not a run.
    const allowed = words ? countableWindows(stream, size, true) : null;
    return windowKeys(stream, size, words).filter((_, at) => allowed === null || allowed[at]);
  };
  const withinKeys = windowKeys(stream, rules.within, words);
  const withinAllowed = words ? countableWindows(stream, rules.within, true) : withinKeys.map(() => true);
  const crosses = marksInside(stream, stream.breakBefore, rules.within);
  return {
    within: new Set(withinKeys.filter((_, at) => withinAllowed[at] && !crosses[at])),
    withinAny: new Set(withinKeys.filter((_, at) => withinAllowed[at])),
    across: new Set(keep(rules.across)),
    shingles: new Set(keep(rules.shingle)),
  };
}

/** What the draft holds in one stream, and which of its windows may count against an exemplar. */
interface DraftStream {
  readonly rules: StreamRules;
  /** Runs that may count, each with whether a soft break stands inside it. */
  readonly within: ReadonlyArray<{ key: string; crosses: boolean }>;
  /** Runs across soft breaks that may count, each with the breaks inside it as a mask (#707: the refusal names them). */
  readonly across: ReadonlyArray<{ key: string; breaks: number }>;
  readonly shingleKeys: ReadonlyArray<string>;
  readonly countable: ReadonlyArray<boolean>;
  /** For each span-sized window, whether it spans no hard stop. */
  readonly spans: ReadonlyArray<boolean>;
  /** The draft's distinct shingles that weigh in the near share: its own words, numbers and the house's phrasing among them. */
  readonly distinct: number;
}

/**
 * The first exemplar a draft copies, by its position among the contract's exemplars, or `null` when it copies none — judged
 * under the copy rules its own frozen prompt contract carries (the Commander's ruling on #704 P2-2): a Task recorded under
 * `ai7.writing.prompt-contract/1` keeps #688's rules ({@link exemplarCopiedV1}); every Task prepared since is judged under `/2`,
 * whose sizes `sizes` are, read from the contract by {@link writingCopySizes}.
 *
 * The `/2` rules, the Commander's rulings on the reference bound (#688 review and re-review, #698, and #704's review), which the
 * Issue's stop clause leaves to the Commander:
 *
 * - (a) The draft is compared as one text, its title, headings and paragraphs joined as the exemplar's paragraphs are — a
 *   copy cut at a part's edge is still a copy. Both are compatibility-normalized.
 * - Verbatim: {@link EXEMPLAR_COPY_WINDOW} consecutive characters of the draft that stand in the exemplar with no soft break
 *   inside them, in either — punctuation, a Latin word, or a space between two clauses — or
 *   {@link EXEMPLAR_COPY_WINDOW_ACROSS} across one (#698): house phrasing of two short clauses, 「书中人物形象鲜明，情节跌宕起伏」
 *   or 「人物形象鲜明 情节跌宕起伏」, is no one's copy even in one exemplar.
 * - (b) Near copy, over {@link EXEMPLAR_SHINGLE}-character shingles: {@link EXEMPLAR_SHINGLE_SHARE} or more of the draft's
 *   distinct shingles stand in one exemplar — a draft that is mostly a lightly edited exemplar — or, in any
 *   {@link EXEMPLAR_SPAN}-character span of the draft, {@link EXEMPLAR_SPAN_SHARE} or more of the span's shingles do — a
 *   near-copied paragraph inside a long draft. An edit every n characters keeps n − 6 clean shingles of every n, so a draft
 *   that is all such a copy is caught from n = 8. Inside a long draft the span rule needs 59 of a span's 195 shingles, so it
 *   catches such a paragraph only from a certain length: 178 characters edited every 9, 148 every 10, 130 every 11, 118
 *   every 12, and 112, 106, 100 and 94 every 13 to 16 when the clean runs cross punctuation (a clean run of 12 within
 *   punctuation, or of 16 across it, is verbatim). A near-copied paragraph shorter than that — 120 characters edited every
 *   10, say — passes inside a long draft (#698). The known limits: edits every 5 characters or fewer leave no shingle in
 *   common; every 6 or 7 pass however much is copied; every 8 passes inside a long draft.
 * - Latin-script prose — English, French, a name in Chinese text — runs through the same rules on words (#698, #704):
 *   {@link EXEMPLAR_COPY_WORDS} words within punctuation, or {@link EXEMPLAR_COPY_WORDS_ACROSS} across it;
 *   {@link EXEMPLAR_WORD_SHINGLE}-word shingles, their share counted with the characters' in the near copy, and their own
 *   {@link EXEMPLAR_WORD_SPAN}-word span. No word window, shingle or span spans text of another script. A span floor follows
 *   the same way: an edit every n words is caught inside a long draft from 118 words every 6, 90 every 7 and 78 every 8, and
 *   70, 66 and 62 every 9 to 11 across punctuation. English edited every 5 words or fewer passes.
 * - (c) House boilerplate is no one's copy: a run that stands in two or more exemplars — each another Book's, one per Book. An
 *   ASCII run is no one's words only when it looks like an identifier (#698) — an ISBN-like number, a URL, an e-mail address, a
 *   domain, a code of letters and digits — and a character window touching one is left; a number between words is no word.
 * - (d) A run the Book's own reference words share — its title, a character's name, its synopsis, its evaluation's words — is
 *   the Book's; the editor's 受众, 渠道 and 其他要求 exempt nothing.
 * - (e) 繁体 and 简体 are compared as written: no conversion table is among the dependencies, so a copy re-written in the other
 *   script is not caught (a known limit).
 *
 * Deterministic and linear in the words: no model takes part in it.
 */
export function exemplarCopied(draft: WritingDraftWordsProjection, input: WritingContractInput, sizes: WritingCopySizes = WRITING_COPY_SIZES): ExemplarCopy | null {
  if (input.exemplars.length === 0) return null;
  if (sizes.rules === 1) return exemplarCopiedV1(draft, input, sizes);
  const ownStreams = ownWordsOf(input).map(copyStreams);
  const own = (pick: 'characters' | 'words', rules: StreamRules): StreamWindows => {
    const sets: StreamWindows = { within: new Set(), withinAny: new Set(), across: new Set(), shingles: new Set() };
    for (const streams of ownStreams) {
      const windows = streamWindows(streams[pick], rules);
      for (const key of windows.withinAny) sets.withinAny.add(key);
      for (const key of windows.across) sets.across.add(key);
      for (const key of windows.shingles) sets.shingles.add(key);
    }
    return sets;
  };
  const exemplarStreams = input.exemplars.map((exemplar) => copyStreams(exemplar.text));
  // The draft's parts are joined as the exemplar's paragraphs are, one per line.
  const draftStreams = copyStreams([draft.title, ...draft.sections.flatMap((section) => [section.heading, ...section.paragraphs])].join('\n'));
  const [characterRules, wordRules] = streamRules(sizes);

  const streams = ([['characters', characterRules], ['words', wordRules]] as const).map(([pick, rules]) => {
    const stream = draftStreams[pick];
    const ownSets = own(pick, rules);
    const exemplars = exemplarStreams.map((streamsOf) => streamWindows(streamsOf[pick], rules));
    // Runs two exemplars share are the house's phrasing: every exemplar is another Book's, one per Book.
    const shared = (sets: (entry: StreamWindows) => Set<string>, key: string): boolean => exemplars.filter((entry) => sets(entry).has(key)).length >= 2;
    const words = rules.unit === 'word';
    const withinKeys = windowKeys(stream, rules.within, words);
    const withinAllowed = countableWindows(stream, rules.within, words);
    const withinCrosses = marksInside(stream, stream.breakBefore, rules.within);
    const acrossKeys = windowKeys(stream, rules.across, words);
    const acrossAllowed = countableWindows(stream, rules.across, words);
    const acrossBreaks = breaksInside(stream, rules.across);
    const shingleKeys = windowKeys(stream, rules.shingle, words);
    const shingleAllowed = countableWindows(stream, rules.shingle, words);
    // A word shingle that spans a hard stop is no shingle; every character shingle weighs, numbers among them.
    const weighed = words ? shingleAllowed : shingleKeys.map(() => true);
    const draftStream: DraftStream = {
      rules,
      within: withinKeys.flatMap((key, at) => (withinAllowed[at] && !ownSets.withinAny.has(key) && !shared((entry) => entry.withinAny, key) ? [{ key, crosses: withinCrosses[at]! }] : [])),
      across: acrossKeys.flatMap((key, at) => (acrossAllowed[at] && !ownSets.across.has(key) && !shared((entry) => entry.across, key) ? [{ key, breaks: acrossBreaks[at]! }] : [])),
      shingleKeys,
      countable: shingleKeys.map((key, at) => shingleAllowed[at]! && !ownSets.shingles.has(key) && !shared((entry) => entry.shingles, key)),
      spans: words ? countableWindows(stream, rules.span, true) : windowKeys(stream, rules.span, false).map(() => true),
      // The share is of every distinct shingle the draft has in this stream, so its own words, numbers and the house's
      // phrasing dilute a copy only by what they add, never by being skipped.
      distinct: new Set(shingleKeys.filter((_, at) => weighed[at])).size,
    };
    return { draft: draftStream, exemplars };
  });

  for (const index of input.exemplars.keys()) {
    for (const { draft: stream, exemplars } of streams) {
      const exemplar = exemplars[index]!;
      if (stream.within.some((run) => !run.crosses && exemplar.within.has(run.key))) return { exemplar: index, kind: 'verbatim', unit: stream.rules.unit, run: stream.rules.within };
      // The first run across soft breaks, with the breaks inside it: the refusal names the ones it was copied across (#707).
      const across = stream.across.find((run) => exemplar.across.has(run.key));
      if (across !== undefined) return { exemplar: index, kind: 'verbatim', unit: stream.rules.unit, run: stream.rules.across, breaks: breakNames(across.breaks) };
    }
  }
  const distinct = streams.reduce((sum, { draft: stream }) => sum + stream.distinct, 0);
  if (distinct > 0) {
    for (const index of input.exemplars.keys()) {
      const counted = streams.map(({ draft: stream, exemplars }) =>
        new Set(stream.shingleKeys.filter((key, at) => stream.countable[at] && exemplars[index]!.shingles.has(key))).size);
      const share = (counted[0]! + counted[1]!) / distinct;
      if (share >= sizes.shingleShare) return { exemplar: index, kind: 'near', unit: counted[0]! >= counted[1]! ? 'character' : 'word', share };
    }
  }
  // One span of the draft at a time, slid along it with a running count; a word span never spans a hard stop.
  for (const index of input.exemplars.keys()) {
    for (const { draft: stream, exemplars } of streams) {
      const span = stream.rules.span - stream.rules.shingle + 1;
      if (stream.shingleKeys.length < span) continue;
      const hits = stream.shingleKeys.map((key, at) => (stream.countable[at] && exemplars[index]!.shingles.has(key) ? 1 : 0));
      let inSpan = 0;
      let most = 0;
      for (let at = 0; at < hits.length; at += 1) {
        inSpan += hits[at]!;
        if (at >= span) inSpan -= hits[at - span]!;
        if (at >= span - 1 && stream.spans[at - span + 1]) most = Math.max(most, inSpan);
      }
      if (most / span >= sizes.spanShare) return { exemplar: index, kind: 'span', unit: stream.rules.unit, share: most / span };
    }
  }
  return null;
}

// ---- the `/1` rules: #688's bound, kept for the Tasks recorded under it -----------------------------------------------

const V1_NOT_WORDS = /[\s\p{P}\p{S}\p{C}]/gu;

/** A text's characters as the `/1` bound compares them: compatibility-normalized, without spaces, punctuation or symbols. */
function comparableV1(value: string): string[] {
  return Array.from(SEGMENTER.segment(value.normalize('NFKC').replace(V1_NOT_WORDS, '')), ({ segment }) => segment);
}

/**
 * For each start of a `size`-character window under `/1`, whether it could be someone's words (the Commander's ruling (c),
 * #688 review): not a run of digits and ASCII letters only, and not one touching an ISBN-like run. Linear in the stream.
 */
function wordWindowsV1(characters: ReadonlyArray<string>, size: number): boolean[] {
  const numbered = markNumbers(characters, characters.map(() => false));
  const ascii = before(characters.map((character) => /^[0-9A-Za-z]$/u.test(character)));
  const marked = before(numbered);
  const words: boolean[] = [];
  for (let first = 0; first + size <= characters.length; first += 1) {
    words.push(ascii[first + size]! - ascii[first]! !== size && marked[first + size]! - marked[first]! === 0);
  }
  return words;
}

function windowKeysV1(characters: ReadonlyArray<string>, size: number): string[] {
  const keys: string[] = [];
  for (let first = 0; first + size <= characters.length; first += 1) keys.push(characters.slice(first, first + size).join(''));
  return keys;
}

/**
 * The `/1` bound exactly as #688 landed it, for a Task whose frozen contract is `ai7.writing.prompt-contract/1`: any
 * `sizes.copyWindow` (12) consecutive characters of one exemplar, whatever stands inside them; a quarter of the
 * draft's distinct 6-character shingles; 30% of one 200-character span. All-ASCII windows are skipped; there is no English rule.
 */
export function exemplarCopiedV1(draft: WritingDraftWordsProjection, input: WritingContractInput, sizes: WritingCopySizesV1 = WRITING_COPY_SIZES_V1): ExemplarCopy | null {
  const { copyWindow, shingle, shingleShare, span: spanSize, spanShare } = sizes;
  if (input.exemplars.length === 0) return null;
  const ownRuns = new Set<string>();
  const ownShingles = new Set<string>();
  for (const words of ownWordsOf(input)) {
    const characters = comparableV1(words);
    for (const run of windowKeysV1(characters, copyWindow)) ownRuns.add(run);
    for (const run of windowKeysV1(characters, shingle)) ownShingles.add(run);
  }
  const exemplars = input.exemplars.map((exemplar) => {
    const characters = comparableV1(exemplar.text);
    return { runs: new Set(windowKeysV1(characters, copyWindow)), shingles: new Set(windowKeysV1(characters, shingle)) };
  });
  const shared = (pick: (entry: (typeof exemplars)[number]) => Set<string>, run: string): boolean =>
    exemplars.filter((entry) => pick(entry).has(run)).length >= 2;
  const stream = comparableV1([draft.title, ...draft.sections.flatMap((section) => [section.heading, ...section.paragraphs])].join(''));
  const runKeys = windowKeysV1(stream, copyWindow);
  const runWords = wordWindowsV1(stream, copyWindow);
  const runs = runKeys.filter((run, index) => runWords[index] && !ownRuns.has(run) && !shared((entry) => entry.runs, run));
  for (const [index, exemplar] of exemplars.entries()) {
    if (runs.some((run) => exemplar.runs.has(run))) return { exemplar: index, kind: 'verbatim', unit: 'character', run: copyWindow };
  }
  const shingleKeys = windowKeysV1(stream, shingle);
  if (shingleKeys.length === 0) return null;
  const shingleWords = wordWindowsV1(stream, shingle);
  const countable = shingleKeys.map((run, index) => shingleWords[index]! && !ownShingles.has(run) && !shared((entry) => entry.shingles, run));
  const distinct = new Set(shingleKeys).size;
  for (const [index, exemplar] of exemplars.entries()) {
    const counted = new Set(shingleKeys.filter((run, at) => countable[at] && exemplar.shingles.has(run))).size;
    if (counted / distinct >= shingleShare) return { exemplar: index, kind: 'near', unit: 'character', share: counted / distinct };
  }
  const span = spanSize - shingle + 1;
  if (shingleKeys.length < span) return null;
  for (const [index, exemplar] of exemplars.entries()) {
    const hits = shingleKeys.map((run, at) => (countable[at] && exemplar.shingles.has(run) ? 1 : 0));
    let inSpan = 0;
    let most = 0;
    for (let at = 0; at < hits.length; at += 1) {
      inSpan += hits[at]!;
      if (at >= span) inSpan -= hits[at - span]!;
      if (at >= span - 1) most = Math.max(most, inSpan);
    }
    if (most / span >= spanShare) return { exemplar: index, kind: 'span', unit: 'character', share: most / span };
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

/** A soft break as the refusal names it (#707). */
const BREAK_NAMES: Readonly<Record<CopyBreak, string>> = { punctuation: '标点', space: '空格', 'latin-word': '外文词', number: '数字', identifier: '编号' };

/**
 * What a refused draft is told: which exemplar it copied, and how, in the sizes of the rules that judged it. A run copied across
 * soft breaks names the breaks it crossed — 标点, 空格, an 外文词, a 数字 or an 编号 — and Latin-script words are 外文词, whatever
 * the language (#707).
 */
export function exemplarCopyDetail(copied: ExemplarCopy, input: WritingContractInput, sizes: WritingCopySizes = WRITING_COPY_SIZES): string {
  const exemplar = input.exemplars[copied.exemplar]!;
  const words = copied.unit === 'word' && sizes.rules === 2;
  const across = copied.kind === 'verbatim' && sizes.rules === 2 && copied.breaks !== undefined && copied.breaks.length > 0
    ? `跨${copied.breaks.map((name) => BREAK_NAMES[name]).join('、')}`
    : '';
  const shingle = words ? `${sizes.wordShingle} 词片段` : `${sizes.shingle} 字片段`;
  const how = copied.kind === 'verbatim'
    ? `有${across}连续 ${copied.run} 个${words ? '外文词' : '字'}以上相同`
    : copied.kind === 'near'
      ? `的 ${shingle}重合达 ${Math.floor(copied.share * 100)}%（不少于 ${sizes.shingleShare * 100}% 即算照抄）`
      : `在草稿的一段 ${words ? `${sizes.wordSpan} 个外文词` : `${sizes.span} 字`}中，${shingle}重合达 ${Math.floor(copied.share * 100)}%（不少于 ${sizes.spanShare * 100}% 即算照抄）`;
  return `草稿与范例《${exemplar.bookTitle}》版本 ${exemplar.version} ${how}；范例只参照，不复制，这份草稿不予采用。`;
}

/**
 * Admit the synthesis: a title and its sections, each within its bound, and nothing else — and a draft that copies none of the
 * contract's exemplars, since an exemplar is referenced and never copied (KB-004).
 */
export function parseWritingSynthesis(value: string, contract: WritingPromptContract): WritingSynthesisParse {
  const input = contract.input;
  const sizes = writingCopySizes(contract);
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
  // Judged under the sizes the Task's own frozen contract carries (#704 P2-2).
  const copied = exemplarCopied(draft, input, sizes);
  if (copied !== null) return { ok: false, code: 'exemplar-copied', detail: exemplarCopyDetail(copied, input, sizes) };
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
