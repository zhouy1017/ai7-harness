import { DIGEST_PATTERN, canonicalJson, extractModelJson, sha256Hex } from '../analysis/canonical.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import { MAX_MARK_BODY_CODE_UNITS } from '../../shared/protocol.js';

/**
 * Scoped Edit Contract v1 (Issue #1412, 就选中部分让 AI 修改): the frozen text a scoped AI edit carries on the Fast Interaction
 * Role's editor-selected-excerpt route — the one 润色这段 runs on. One request sends the editor's instruction and, in document
 * order, the parts of the manuscript it may change as numbered `<target_to_modify>` segments beside `<readonly_context>`
 * segments it may only read. The answer is one replacement text per target it changed. Whatever else it writes — a target it
 * was not given, a context paragraph restated, text outside the JSON — is never read as manuscript text: the splice keeps
 * only the targets' replacements and every other byte of the manuscript stays the base's.
 *
 * The contract is frozen text; its digest binds the deterministic fixture key and the live request alike.
 */
export const SCOPED_EDIT_CONTRACT_VERSION = 'ai7.scoped-edit/1' as const;
export const SCOPED_EDIT_PROMPT_CONTRACT_SCHEMA = 'ai7.scoped-edit-prompt-contract/1' as const;
export const SCOPED_EDIT_RESULT_SCHEMA = 'ai7.scoped-edit.result/1' as const;
/** The label every scoped-edit mark carries as its source, and the action as the editor names it. */
export const SCOPED_EDIT_LABEL = 'AI 局部修改';

const CONTEXT_OPEN = '<readonly_context>';
const CONTEXT_CLOSE = '</readonly_context>';
const TARGET_CLOSE = '</target_to_modify>';
const TARGET_OPEN_PATTERN = /<target_to_modify id="(T[1-9][0-9]{0,2})">/u;

export const SCOPED_EDIT_PROMPT_CONTRACT = {
  schema: SCOPED_EDIT_PROMPT_CONTRACT_SCHEMA,
  contractVersion: SCOPED_EDIT_CONTRACT_VERSION,
  systemPrompt: [
    '你是出版社的文字编辑，按编辑给出的修改要求，只改写稿件中编辑指定的部分。',
    `用户消息中，${'<target_to_modify id="T1">'}…${TARGET_CLOSE} 包住的是允许修改的部分，每段有自己的编号；${CONTEXT_OPEN}…${CONTEXT_CLOSE} 包住的是只读上下文，只供你理解前后衔接，绝不能修改、重复或改写到你的输出里。`,
    '每个允许修改的部分各自改写；不要把两个部分合并，不要拆成多段，不要在改写结果中加入只读上下文里的文字，也不要增写编辑没有要求的新内容。',
    '只为你确实改动了的部分输出结果；不需要改动的部分不要输出。没有给出编号的文字一律不得输出。',
    `只输出一个 JSON 对象，不要输出其他文字：{"schema":"${SCOPED_EDIT_RESULT_SCHEMA}","targets":[{"id":"T1","text":"改写后的完整文字"}]}`,
    '不调用任何工具。',
  ].join('\n'),
  messageHeader: 'AI7 局部修改 · 要求摘要 {instructionDigest} · 范围摘要 {scopeDigest}',
  instructionHeader: '【编辑的修改要求】',
  passageHeader: '【稿件片段（按原文顺序；只改 target_to_modify）】',
} as const;

export const SCOPED_EDIT_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(SCOPED_EDIT_PROMPT_CONTRACT));

const HEADER_PATTERN = /^AI7 局部修改 · 要求摘要 ([0-9a-f]{64}) · 范围摘要 ([0-9a-f]{64})$/u;

/** One piece of one block as it is sent: read-only context, or a numbered target. */
export type ScopedEditSegment = { readonly kind: 'context'; readonly text: string } | { readonly kind: 'target'; readonly id: string; readonly text: string };

/** The passage sent: one line per block, each line the block's segments in order. */
export interface ScopedEditMessageInput {
  readonly instruction: string;
  readonly lines: ReadonlyArray<ReadonlyArray<ScopedEditSegment>>;
}

export function scopedEditInstructionDigest(instruction: string): string {
  return sha256Hex(instruction);
}

export function scopedEditScopeDigest(lines: ScopedEditMessageInput['lines']): string {
  return sha256Hex(canonicalJson(lines.map((line) => line.map((segment) => segment.kind === 'context' ? { context: segment.text } : { id: segment.id, target: segment.text }))));
}

/** The request key the deterministic fixture answers by: the frozen contract, the instruction and the exact passage. */
export function scopedEditRequestDigest(contractDigest: string, instructionDigest: string, scopeDigest: string): string {
  return sha256Hex(`${SCOPED_EDIT_CONTRACT_VERSION}\u0000${contractDigest}\u0000${instructionDigest}\u0000${scopeDigest}`);
}

/** Whether a text holds the contract's own marks, which would let its message read back two ways. */
export function holdsScopedEditMarks(text: string): boolean {
  const contract = SCOPED_EDIT_PROMPT_CONTRACT;
  return text.includes('<readonly_context') || text.includes('</readonly_context') || text.includes('<target_to_modify') ||
    text.includes('</target_to_modify') || text.includes(contract.instructionHeader) || text.includes(contract.passageHeader);
}

/** The one user message a scoped edit sends. */
export function buildScopedEditMessage(input: ScopedEditMessageInput): string {
  const contract = SCOPED_EDIT_PROMPT_CONTRACT;
  const header = contract.messageHeader
    .replace('{instructionDigest}', scopedEditInstructionDigest(input.instruction))
    .replace('{scopeDigest}', scopedEditScopeDigest(input.lines));
  const passage = input.lines.map((line) => line.map((segment) => segment.kind === 'context'
    ? `${CONTEXT_OPEN}${segment.text}${CONTEXT_CLOSE}`
    : `<target_to_modify id="${segment.id}">${segment.text}${TARGET_CLOSE}`).join(''));
  return [header, contract.instructionHeader, input.instruction, contract.passageHeader, ...passage].join('\n');
}

/** The header of a scoped-edit message, or `null` for any other message. */
export function parseScopedEditMessageHeader(text: string): { instructionDigest: string; scopeDigest: string } | null {
  const match = HEADER_PATTERN.exec(text.split('\n', 1)[0] ?? '');
  if (match === null || !DIGEST_PATTERN.test(match[1]!) || !DIGEST_PATTERN.test(match[2]!)) return null;
  return { instructionDigest: match[1]!, scopeDigest: match[2]! };
}

/** Whether a well-formed target id. */
export function isScopedEditTargetId(id: string): boolean {
  return TARGET_OPEN_PATTERN.test(`<target_to_modify id="${id}">`);
}

/** What the answer offers for one target it was given. */
export interface ScopedEditChange {
  readonly id: string;
  readonly text: string;
}

export interface ScopedEditReading {
  readonly kind: 'read' | 'withheld';
  /** Why nothing of it is usable, when `withheld`. */
  readonly reason?: string;
  /** Targets the answer changed, each once, in the order of the targets given. */
  readonly changes: ReadonlyArray<ScopedEditChange>;
  /** Targets it answered with the same words, or did not answer. */
  readonly unchanged: number;
  /** Targets whose replacement is not admitted, with why. */
  readonly withheld: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
  /** Entries for no target it was given, or a second entry for one: dropped unread. */
  readonly dropped: number;
}

/** The context segments long enough that finding one inside a replacement means the model restated it. */
const RESTATED_CONTEXT_GRAPHEMES = 12;

/**
 * Read a scoped-edit answer against the targets that were sent: only an entry naming one of them is read, once; a replacement
 * that would split the paragraph, restate read-only context, hold the contract's marks or outgrow a 修改建议 is withheld; one
 * identical to the target is no change. Nothing else of the answer is ever kept.
 */
export function readScopedEditAnswer(text: string, input: ScopedEditMessageInput): ScopedEditReading {
  const targets = new Map(input.lines.flat().flatMap((segment) => segment.kind === 'target' ? [[segment.id, segment.text] as const] : []));
  const contexts = input.lines.flat().flatMap((segment) => segment.kind === 'context' && graphemesOf(segment.text).length >= RESTATED_CONTEXT_GRAPHEMES ? [segment.text] : []);
  const parsed = extractModelJson(text, { partial: true, arrayKey: 'targets' });
  if (parsed === null || !Array.isArray(parsed['targets'])) {
    return { kind: 'withheld', reason: '模型回答无法读出任何可用的修改', changes: [], unchanged: targets.size, withheld: [], dropped: 0 };
  }
  const answered = new Map<string, string>();
  const withheld: Array<{ id: string; reason: string }> = [];
  let dropped = 0;
  for (const entry of parsed['targets'] as unknown[]) {
    const record = entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : null;
    const id = typeof record?.['id'] === 'string' ? record['id'] : null;
    if (id === null || !targets.has(id) || answered.has(id) || withheld.some((item) => item.id === id)) { dropped += 1; continue; }
    const raw = record!['text'];
    if (typeof raw !== 'string' || !raw.isWellFormed()) { withheld.push({ id, reason: '修改结果不是约定的格式' }); continue; }
    const replacement = raw.normalize('NFC');
    const original = targets.get(id)!;
    if (replacement.length === 0 && original.length > 0) { withheld.push({ id, reason: '修改结果会删去整段文字' }); continue; }
    if (replacement.length > MAX_MARK_BODY_CODE_UNITS) { withheld.push({ id, reason: '修改结果超过修改建议的长度上限' }); continue; }
    if (holdsScopedEditMarks(replacement)) { withheld.push({ id, reason: '修改结果含有片段标记' }); continue; }
    if ((replacement.match(/\n/gu)?.length ?? 0) !== (original.match(/\n/gu)?.length ?? 0)) { withheld.push({ id, reason: '修改结果会合并或拆分段落' }); continue; }
    if (contexts.some((context) => replacement.includes(context))) { withheld.push({ id, reason: '修改结果混入了只读上下文' }); continue; }
    if (replacement === original) continue;
    answered.set(id, replacement);
  }
  const changes = [...targets.keys()].flatMap((id) => answered.has(id) ? [{ id, text: answered.get(id)! }] : []);
  return { kind: 'read', changes, unchanged: targets.size - changes.length - withheld.length, withheld, dropped };
}
