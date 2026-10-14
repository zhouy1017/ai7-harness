import { DIGEST_PATTERN, canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { MAX_MARK_BODY_CODE_UNITS } from '../../shared/protocol.js';

/**
 * Conflict Regeneration Contract v1 (Issue #842; ADR 0085; V2-UX-CONFLICT-005, CONFLICT-011; Owner decision 18 of
 * 2026-10-13): the frozen text 稿件冲突 › 基于当前稿件重新生成建议 carries for one `conflict` unit of a Three-way Proposal
 * Conflict. One request sends exactly that unit's 提案基准, 当前权威稿件 and 提议内容 words, the reason the 修改建议 recorded
 * for itself, and a bounded window of the current manuscript around the unit for understanding — all words of the editor's
 * own manuscript and nothing else of the Book. The answer is one text: the words the unit's place could hold now, carrying
 * the proposal's intent onto the current manuscript. It becomes the unit's resolution in a Resolution Draft, which the
 * editor resolves through the existing paths; nothing is accepted or applied.
 */
export const CONFLICT_REGENERATE_KIND = 'conflict-regenerate' as const;
export const CONFLICT_REGENERATE_PROMPT_CONTRACT_SCHEMA = 'ai7.conflict-regenerate-prompt-contract/1' as const;
export const CONFLICT_REGENERATE_CONTRACT_VERSION = 'ai7.conflict-regenerate/1' as const;
export const CONFLICT_REGENERATE_RESULT_SCHEMA = 'ai7.conflict-regenerate.result/1' as const;
/** How many graphemes of the current manuscript on each side of the unit are sent for understanding. */
export const CONFLICT_REGENERATE_CONTEXT_GRAPHEMES = 120;

export const CONFLICT_REGENERATE_PROMPT_CONTRACT = {
  schema: CONFLICT_REGENERATE_PROMPT_CONTRACT_SCHEMA,
  contractVersion: CONFLICT_REGENERATE_CONTRACT_VERSION,
  systemPrompt: [
    '你是出版社的文字编辑。稿件中的一条修改建议是在【提案基准】上提出的；之后稿件这处文字已改成【当前稿件】，与【原提议】冲突。',
    '请基于【当前稿件】重新写出这一处的建议文字：保留【原提议】想要达到的修改意图（见【原提议的理由】），同时保留【当前稿件】在提出建议之后所做的改动。',
    '只写这一处的文字；【前文】和【后文】是当前稿件，只供理解上下文，不要改写或重复它们。不改动情节、人物和事实，不增写新的内容。',
    `只输出一个 JSON 对象，不要输出其他文字：{"schema":"${CONFLICT_REGENERATE_RESULT_SCHEMA}","text":"…"}`,
    '你的文字只是一条新的建议，由编辑决定是否采用，不会自动修改稿件。不调用任何工具。',
  ].join('\n'),
  messageHeader: 'AI7 冲突重新生成 · 冲突单元摘要 {regionDigest}',
  intentHeader: '【原提议的理由】',
  baseHeader: '【提案基准】',
  currentHeader: '【当前稿件】',
  proposedHeader: '【原提议】',
  beforeHeader: '【前文（当前稿件，仅供理解）】',
  afterHeader: '【后文（当前稿件，仅供理解）】',
} as const;

export const CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(CONFLICT_REGENERATE_PROMPT_CONTRACT));

const HEADER_PATTERN = /^AI7 冲突重新生成 · 冲突单元摘要 ([0-9a-f]{64})$/u;

/** The words of one conflict unit as they are sent. */
export interface ConflictRegenerateMessageInput {
  /** The reason the 修改建议 recorded for itself; empty when it recorded none. */
  readonly intent: string;
  readonly base: string;
  readonly current: string;
  readonly proposed: string;
  readonly before: string;
  readonly after: string;
}

const SECTIONS: ReadonlyArray<[keyof ConflictRegenerateMessageInput, keyof typeof CONFLICT_REGENERATE_PROMPT_CONTRACT]> = [
  ['intent', 'intentHeader'],
  ['base', 'baseHeader'],
  ['current', 'currentHeader'],
  ['proposed', 'proposedHeader'],
  ['before', 'beforeHeader'],
  ['after', 'afterHeader'],
];

/** The digest of the unit's words, which names the request in its header. */
export function conflictRegenerateRegionDigest(input: ConflictRegenerateMessageInput): string {
  return sha256Hex(canonicalJson({ intent: input.intent, base: input.base, current: input.current, proposed: input.proposed, before: input.before, after: input.after }));
}

/** The request key the deterministic fixture answers by: the frozen contract and the unit's words. */
export function conflictRegenerateRequestDigest(contractDigest: string, regionDigest: string): string {
  return sha256Hex(`${CONFLICT_REGENERATE_CONTRACT_VERSION}\u0000${contractDigest}\u0000${regionDigest}`);
}

export function buildConflictRegenerateMessage(input: ConflictRegenerateMessageInput): string {
  const contract = CONFLICT_REGENERATE_PROMPT_CONTRACT;
  const lines: string[] = [contract.messageHeader.replace('{regionDigest}', conflictRegenerateRegionDigest(input))];
  for (const [field, header] of SECTIONS) lines.push(contract[header], input[field]);
  return lines.join('\n');
}

/** The header of a conflict regeneration message, or `null` for any other message. */
export function parseConflictRegenerateMessageHeader(text: string): { regionDigest: string } | null {
  const match = HEADER_PATTERN.exec(text.split('\n', 1)[0] ?? '');
  return match === null || !DIGEST_PATTERN.test(match[1]!) ? null : { regionDigest: match[1]! };
}

/** Whether a text holds the contract's own section marks, which would let its message read back two ways. */
export function holdsConflictRegenerateMarks(text: string): boolean {
  return SECTIONS.some(([, header]) => text.includes(CONFLICT_REGENERATE_PROMPT_CONTRACT[header]));
}

/** A conflict regeneration message read back exactly as `buildConflictRegenerateMessage` wrote it, or `null`. */
export function parseConflictRegenerateMessage(text: string): ConflictRegenerateMessageInput | null {
  if (parseConflictRegenerateMessageHeader(text) === null) return null;
  const contract = CONFLICT_REGENERATE_PROMPT_CONTRACT;
  let rest = text.slice(text.indexOf('\n') + 1);
  const values: Partial<Record<keyof ConflictRegenerateMessageInput, string>> = {};
  for (const [index, [field, header]] of SECTIONS.entries()) {
    const start = `${contract[header]}\n`;
    if (!rest.startsWith(start)) return null;
    rest = rest.slice(start.length);
    const next = SECTIONS[index + 1];
    if (next === undefined) {
      values[field] = rest;
      break;
    }
    const at = rest.indexOf(`\n${contract[next[1]]}\n`);
    if (at === -1) return null;
    values[field] = rest.slice(0, at);
    rest = rest.slice(at + 1);
  }
  const parsed = values as ConflictRegenerateMessageInput;
  return buildConflictRegenerateMessage(parsed) === text ? parsed : null;
}

/**
 * A regeneration answer read: the one text it offers, or why it is withheld. The answer is one JSON object holding exactly
 * `schema` and `text`; anything else, an empty text, or one longer than a 修改建议 may hold withholds it whole.
 */
export type ConflictRegenerateReading =
  | { readonly kind: 'read'; readonly text: string }
  | { readonly kind: 'withheld'; readonly reason: string };

export function readConflictRegenerateAnswer(answer: string): ConflictRegenerateReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    return { kind: 'withheld', reason: '模型的回答不是约定格式的建议文字' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'withheld', reason: '模型的回答不是约定格式的建议文字' };
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || record['schema'] !== CONFLICT_REGENERATE_RESULT_SCHEMA || typeof record['text'] !== 'string' || !record['text'].isWellFormed()) {
    return { kind: 'withheld', reason: '模型的回答不是约定格式的建议文字' };
  }
  const text = record['text'];
  if (text.trim().length === 0) return { kind: 'withheld', reason: '模型没有给出新的建议文字' };
  if (text.length > MAX_MARK_BODY_CODE_UNITS) return { kind: 'withheld', reason: '模型给出的文字超过修改建议的长度上限' };
  return { kind: 'read', text };
}
