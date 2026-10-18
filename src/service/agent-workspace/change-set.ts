import { graphemesOf } from '../../shared/mark-anchor.js';
import { MAX_DIALOGUE_PROPOSAL_CHARACTERS, MAX_MARK_BODY_CODE_UNITS } from '../../shared/protocol.js';
import { AGENT_WORKSPACE_RESULT_SCHEMA, MAX_AGENT_WORKSPACE_ITEMS, MAX_AGENT_WORKSPACE_RATIONALE_CHARACTERS } from '../dialogue/contract.js';

/**
 * A workspace turn's answer read as a change set (Issue #90, wave 13 slice 13a; HARNESS-INTEGRATION l.66 `contentCandidate`):
 * model output awaiting AI7 validation, never persisted as it stands. Each item names words of the selection — its anchor —
 * the words that would replace them and a one-line reason; an item is kept only when its anchor is exactly one place of the
 * selected words, on whole graphemes, overlapping no item kept before it. Every other item is dropped with why, and the
 * editor is told. Nothing outside these anchored replacements is ever read.
 */
export interface AgentWorkspaceCandidate {
  /** 1-based position in the answer, so a dropped item can be named beside the kept ones. */
  readonly ordinal: number;
  readonly anchor: string;
  readonly proposedText: string;
  readonly rationale: string;
  /** Grapheme offsets inside the selection: `[from, to)`. */
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
}

export interface AgentWorkspaceDropped {
  readonly ordinal: number;
  readonly reason: string;
}

export type AgentWorkspaceReading =
  | { readonly kind: 'read'; readonly candidates: ReadonlyArray<AgentWorkspaceCandidate>; readonly dropped: ReadonlyArray<AgentWorkspaceDropped> }
  /** The answer as a whole is outside the contract: nothing of it is offered. */
  | { readonly kind: 'withheld'; readonly reason: string };

const NOT_A_CHANGE_SET = '模型的回答不是约定格式的变更集';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** Where `anchor` stands in `selection`, in graphemes, when it occurs there exactly once on whole graphemes; else why not. */
function locate(selection: string, anchor: string): { from: number; to: number } | string {
  const first = selection.indexOf(anchor);
  if (first === -1) return '摘出的文字不在所选范围内';
  if (selection.indexOf(anchor, first + 1) !== -1) return '摘出的文字在所选范围内不止一处，无法确定位置';
  const from = graphemesOf(selection.slice(0, first)).length;
  const length = graphemesOf(anchor).length;
  // An occurrence that cuts a grapheme in two is not a range of the editor's words.
  if (graphemesOf(selection).slice(from, from + length).join('') !== anchor) return '摘出的文字没有落在完整的字上';
  return { from, to: from + length };
}

/** The answer's one JSON object; a model that fences it in a code block is read the same, and nothing else around it is. */
function answerObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\n([\s\S]*)\n```$/u.exec(trimmed);
  return JSON.parse(fenced === null ? trimmed : fenced[1]!);
}

/**
 * Read a workspace answer against the selection it was asked about. The answer is one JSON object holding exactly `schema`
 * and `items`; anything else withholds it whole. Each item holds exactly `anchor`, `proposedText` and `rationale`.
 */
export function readAgentWorkspaceAnswer(text: string, selection: string): AgentWorkspaceReading {
  let parsed: unknown;
  try {
    parsed = answerObject(text);
  } catch {
    return { kind: 'withheld', reason: NOT_A_CHANGE_SET };
  }
  if (!isRecord(parsed) || !sameKeys(parsed, ['schema', 'items']) || parsed['schema'] !== AGENT_WORKSPACE_RESULT_SCHEMA || !Array.isArray(parsed['items'])) {
    return { kind: 'withheld', reason: NOT_A_CHANGE_SET };
  }
  const candidates: AgentWorkspaceCandidate[] = [];
  const dropped: AgentWorkspaceDropped[] = [];
  for (const [index, item] of (parsed['items'] as unknown[]).entries()) {
    const ordinal = index + 1;
    const drop = (reason: string): void => { dropped.push({ ordinal, reason }); };
    if (ordinal > MAX_AGENT_WORKSPACE_ITEMS) { drop(`超过 ${MAX_AGENT_WORKSPACE_ITEMS} 项的提议不予提供`); continue; }
    if (!isRecord(item) || !sameKeys(item, ['anchor', 'proposedText', 'rationale'])) { drop('提议不是约定的格式'); continue; }
    const { anchor, proposedText, rationale } = item;
    if (typeof anchor !== 'string' || typeof proposedText !== 'string' || typeof rationale !== 'string' ||
        !anchor.isWellFormed() || !proposedText.isWellFormed() || !rationale.isWellFormed()) { drop('提议不是约定的格式'); continue; }
    if (anchor.length === 0) { drop('提议没有摘出要替换的文字'); continue; }
    if (proposedText === anchor) { drop('替换后的文字与原文相同'); continue; }
    if (proposedText.length > MAX_MARK_BODY_CODE_UNITS || [...proposedText].length > MAX_DIALOGUE_PROPOSAL_CHARACTERS) {
      drop('替换后的文字超过修改建议的长度上限');
      continue;
    }
    const line = rationale.trim();
    if (line.length === 0 || /[\r\n]/u.test(line) || [...line].length > MAX_AGENT_WORKSPACE_RATIONALE_CHARACTERS) {
      drop(`理由要是一行，最多 ${MAX_AGENT_WORKSPACE_RATIONALE_CHARACTERS} 个字`);
      continue;
    }
    const place = locate(selection, anchor);
    if (typeof place === 'string') { drop(place); continue; }
    if (candidates.some((kept) => place.from < kept.toGrapheme && kept.fromGrapheme < place.to)) { drop('与前面的提议重叠'); continue; }
    candidates.push({ ordinal, anchor, proposedText, rationale: line, fromGrapheme: place.from, toGrapheme: place.to });
  }
  return { kind: 'read', candidates, dropped };
}
