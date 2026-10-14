import { DIGEST_PATTERN, canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import { MAX_MARK_BODY_CODE_UNITS } from '../../shared/protocol.js';

/**
 * Editorial Polish Contract v1 (Issue #842; decisions D7/D18 of the 1.0.0 scope; Owner decision 18 of 2026-10-13): the frozen
 * text 润色这段 carries. One request sends exactly the words the editor selected in their own manuscript, a bounded window of
 * the same paragraph around them for understanding, and the built-in polishing 工序's instructions — nothing else of the Book.
 * The answer is a list of 修改建议: anchored replacements of words inside the selection, each with a one-line reason. It
 * changes nothing; each suggestion becomes a 修改建议 mark the editor accepts, edits or rejects under the existing marks and
 * Apply authority, and nothing is applied on its own.
 *
 * The contract is frozen text; its digest binds the deterministic fixture key and the live request alike, so changing one
 * character of it changes every request digest, which is the intent.
 */
export const EDITORIAL_POLISH_KIND = 'editorial-polish' as const;
export const EDITORIAL_POLISH_PROMPT_CONTRACT_SCHEMA = 'ai7.editorial-polish-prompt-contract/1' as const;
export const EDITORIAL_POLISH_CONTRACT_VERSION = 'ai7.editorial-polish/1' as const;
export const EDITORIAL_POLISH_RESULT_SCHEMA = 'ai7.editorial-polish.result/1' as const;
/** How many graphemes of the paragraph on each side of the selection are sent for understanding. */
export const EDITORIAL_POLISH_CONTEXT_GRAPHEMES = 120;
/** The most suggestions one answer may carry; any further one is withheld. */
export const MAX_EDITORIAL_POLISH_SUGGESTIONS = 20;
/** The longest one-line reason a suggestion may give, in characters. */
export const MAX_EDITORIAL_POLISH_REASON_CHARACTERS = 120;

export const EDITORIAL_POLISH_PROMPT_CONTRACT = {
  schema: EDITORIAL_POLISH_PROMPT_CONTRACT_SCHEMA,
  contractVersion: EDITORIAL_POLISH_CONTRACT_VERSION,
  systemPrompt: [
    '你是出版社的文字编辑，按本社内置的润色工序处理编辑选中的一段稿件文字。',
    '只润色【所选文字】：改正病句、冗余和不通顺的搭配，让表达更准确、简洁、自然；不改动情节、人物、事实和作者的风格，不增写新的内容。',
    '【前文】和【后文】只供理解上下文，不要对它们提出修改。',
    '每条建议必须从【所选文字】中原样摘出要替换的一小段文字（original），它在【所选文字】中只能出现一次；给出替换后的文字（replacement）和一行简短理由（reason）。',
    `最多给出 ${MAX_EDITORIAL_POLISH_SUGGESTIONS} 条建议，各条摘出的文字互不重叠；没有需要润色的地方就返回空列表。`,
    `只输出一个 JSON 对象，不要输出其他文字：{"schema":"${EDITORIAL_POLISH_RESULT_SCHEMA}","suggestions":[{"original":"…","replacement":"…","reason":"…"}]}`,
    '你的建议只供编辑决定是否采用，不会自动修改稿件。不调用任何工具。',
  ].join('\n'),
  messageHeader: 'AI7 润色这段 · 选段摘要 {selectionDigest} · 上下文摘要 {contextDigest}',
  beforeHeader: '【前文（仅供理解，不要修改）】',
  selectionHeader: '【所选文字】',
  afterHeader: '【后文（仅供理解，不要修改）】',
} as const;

export const EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(EDITORIAL_POLISH_PROMPT_CONTRACT));

const HEADER_PATTERN = /^AI7 润色这段 · 选段摘要 ([0-9a-f]{64}) · 上下文摘要 ([0-9a-f]{64})$/u;

/** The words sent: the selection and the bounded window of its own paragraph around it. */
export interface EditorialPolishMessageInput {
  readonly before: string;
  readonly selection: string;
  readonly after: string;
}

export function editorialPolishSelectionDigest(selection: string): string {
  return sha256Hex(selection);
}

export function editorialPolishContextDigest(before: string, after: string): string {
  return sha256Hex(canonicalJson({ before, after }));
}

/** The request key the deterministic fixture answers by: the frozen contract, the selected words and their context. */
export function editorialPolishRequestDigest(contractDigest: string, selectionDigest: string, contextDigest: string): string {
  return sha256Hex(`${EDITORIAL_POLISH_CONTRACT_VERSION}\u0000${contractDigest}\u0000${selectionDigest}\u0000${contextDigest}`);
}

/** The one user message a polish request sends. */
export function buildEditorialPolishMessage(input: EditorialPolishMessageInput): string {
  const contract = EDITORIAL_POLISH_PROMPT_CONTRACT;
  const header = contract.messageHeader
    .replace('{selectionDigest}', editorialPolishSelectionDigest(input.selection))
    .replace('{contextDigest}', editorialPolishContextDigest(input.before, input.after));
  return [header, contract.beforeHeader, input.before, contract.selectionHeader, input.selection, contract.afterHeader, input.after].join('\n');
}

/** The header of a polish message, or `null` for any other message. */
export function parseEditorialPolishMessageHeader(text: string): { selectionDigest: string; contextDigest: string } | null {
  const match = HEADER_PATTERN.exec(text.split('\n', 1)[0] ?? '');
  if (match === null || !DIGEST_PATTERN.test(match[1]!) || !DIGEST_PATTERN.test(match[2]!)) return null;
  return { selectionDigest: match[1]!, contextDigest: match[2]! };
}

/** Whether a text holds the contract's own section marks, which would let its message read back two ways. */
export function holdsEditorialPolishMarks(text: string): boolean {
  const contract = EDITORIAL_POLISH_PROMPT_CONTRACT;
  return [contract.beforeHeader, contract.selectionHeader, contract.afterHeader].some((mark) => text.includes(mark));
}

/** A polish message read back: the three texts exactly as `buildEditorialPolishMessage` wrote them, or `null`. */
export function parseEditorialPolishMessage(text: string): EditorialPolishMessageInput | null {
  const header = parseEditorialPolishMessageHeader(text);
  if (header === null) return null;
  const contract = EDITORIAL_POLISH_PROMPT_CONTRACT;
  const body = text.slice(text.indexOf('\n') + 1);
  const beforeStart = `${contract.beforeHeader}\n`;
  const selectionMark = `\n${contract.selectionHeader}\n`;
  const afterMark = `\n${contract.afterHeader}\n`;
  if (!body.startsWith(beforeStart)) return null;
  const selectionAt = body.indexOf(selectionMark);
  const afterAt = body.lastIndexOf(afterMark);
  if (selectionAt === -1 || afterAt === -1 || afterAt < selectionAt) return null;
  const parsed: EditorialPolishMessageInput = {
    before: body.slice(beforeStart.length, selectionAt),
    selection: body.slice(selectionAt + selectionMark.length, afterAt),
    after: body.slice(afterAt + afterMark.length),
  };
  return buildEditorialPolishMessage(parsed) === text ? parsed : null;
}

/** One suggestion kept from an answer: its words, their place inside the selection in graphemes, its replacement and reason. */
export interface EditorialPolishSuggestion {
  /** 1-based position in the answer, so a withheld one can be named beside it. */
  readonly ordinal: number;
  readonly original: string;
  readonly replacement: string;
  readonly reason: string;
  /** Grapheme offsets inside the selection: `[from, to)`. */
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
}

/** A suggestion the answer gave that is not offered, with why in the editor's words. */
export interface EditorialPolishWithheld {
  readonly ordinal: number;
  readonly reason: string;
}

export type EditorialPolishReading =
  | { readonly kind: 'read'; readonly suggestions: ReadonlyArray<EditorialPolishSuggestion>; readonly withheld: ReadonlyArray<EditorialPolishWithheld> }
  /** The answer as a whole is outside the contract: nothing of it is offered. */
  | { readonly kind: 'withheld'; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** Where `original` stands in `selection`, in graphemes, when it occurs there exactly once on whole graphemes; else why not. */
function locate(selection: string, original: string): { from: number; to: number } | string {
  const first = selection.indexOf(original);
  if (first === -1) return '摘出的文字不在所选文字中';
  if (selection.indexOf(original, first + 1) !== -1) return '摘出的文字在所选文字中不止一处，无法确定位置';
  const from = graphemesOf(selection.slice(0, first)).length;
  const length = graphemesOf(original).length;
  // An occurrence that cuts a grapheme in two is not a range of the editor's words.
  if (graphemesOf(selection).slice(from, from + length).join('') !== original) return '摘出的文字没有落在完整的字上';
  return { from, to: from + length };
}

/**
 * Read a polish answer against the selection it was asked about. The answer is one JSON object holding exactly `schema` and
 * `suggestions`; anything else withholds it whole. Each suggestion holds exactly `original`, `replacement` and `reason`, and is
 * withheld with its reason when its words are not exactly one place of the selection, overlap a suggestion kept before it,
 * would not change anything, or exceed the bounds of a 修改建议. Nothing outside these anchored replacements is ever read.
 */
export function readEditorialPolishAnswer(text: string, selection: string): EditorialPolishReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'withheld', reason: '模型的回答不是约定格式的建议列表' };
  }
  if (!isRecord(parsed) || !sameKeys(parsed, ['schema', 'suggestions']) || parsed['schema'] !== EDITORIAL_POLISH_RESULT_SCHEMA ||
      !Array.isArray(parsed['suggestions'])) {
    return { kind: 'withheld', reason: '模型的回答不是约定格式的建议列表' };
  }
  const suggestions: EditorialPolishSuggestion[] = [];
  const withheld: EditorialPolishWithheld[] = [];
  for (const [index, item] of (parsed['suggestions'] as unknown[]).entries()) {
    const ordinal = index + 1;
    const refuse = (reason: string): void => { withheld.push({ ordinal, reason }); };
    if (ordinal > MAX_EDITORIAL_POLISH_SUGGESTIONS) { refuse(`超过 ${MAX_EDITORIAL_POLISH_SUGGESTIONS} 条的建议不予提供`); continue; }
    if (!isRecord(item) || !sameKeys(item, ['original', 'replacement', 'reason'])) { refuse('建议不是约定的格式'); continue; }
    const { original, replacement, reason } = item;
    if (typeof original !== 'string' || typeof replacement !== 'string' || typeof reason !== 'string' ||
        !original.isWellFormed() || !replacement.isWellFormed() || !reason.isWellFormed()) { refuse('建议不是约定的格式'); continue; }
    if (original.length === 0) { refuse('建议没有摘出要替换的文字'); continue; }
    if (replacement === original) { refuse('替换后的文字与原文相同'); continue; }
    if (replacement.length > MAX_MARK_BODY_CODE_UNITS) { refuse('替换后的文字超过修改建议的长度上限'); continue; }
    const line = reason.trim();
    if (line.length === 0 || /[\r\n]/u.test(line) || [...line].length > MAX_EDITORIAL_POLISH_REASON_CHARACTERS) {
      refuse(`理由要是一行，最多 ${MAX_EDITORIAL_POLISH_REASON_CHARACTERS} 个字`);
      continue;
    }
    const place = locate(selection, original);
    if (typeof place === 'string') { refuse(place); continue; }
    if (suggestions.some((kept) => place.from < kept.toGrapheme && kept.fromGrapheme < place.to)) { refuse('与前面的建议重叠'); continue; }
    suggestions.push({ ordinal, original, replacement, reason: line, fromGrapheme: place.from, toGrapheme: place.to });
  }
  return { kind: 'read', suggestions, withheld };
}
