import { extractModelJson, hasKeys, type SalvagedModelResult } from '../analysis/canonical.js';
import { WORKSPACE_SERVICE_WORDS as words } from './agent-workspace-labels.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import { MAX_DIALOGUE_PROPOSAL_CHARACTERS, MAX_MARK_BODY_CODE_UNITS } from '../../shared/protocol.js';
import { MAX_AGENT_WORKSPACE_ITEMS, MAX_AGENT_WORKSPACE_RATIONALE_CHARACTERS } from '../dialogue/contract.js';

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
  | { readonly kind: 'read'; readonly salvaged?: SalvagedModelResult['salvaged']; readonly candidates: ReadonlyArray<AgentWorkspaceCandidate>; readonly dropped: ReadonlyArray<AgentWorkspaceDropped> }
  /** The answer as a whole is outside the contract: nothing of it is offered. */
  | { readonly kind: 'withheld'; readonly reason: string };

const NOT_A_CHANGE_SET = words.invalidAnswer;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Where `anchor` stands in `selection`, in graphemes, when it occurs there exactly once on whole graphemes; else why not. */
function locate(selection: string, anchor: string): { from: number; to: number } | string {
  const first = selection.indexOf(anchor);
  if (first === -1) return words.outside;
  if (selection.indexOf(anchor, first + 1) !== -1) return words.ambiguous;
  const from = graphemesOf(selection.slice(0, first)).length;
  const length = graphemesOf(anchor).length;
  // An occurrence that cuts a grapheme in two is not a range of the editor's words.
  if (graphemesOf(selection).slice(from, from + length).join('') !== anchor) return words.splitGrapheme;
  return { from, to: from + length };
}

/** The answer's one JSON object; a model that fences it in a code block is read the same, and nothing else around it is. */
function answerObject(text: string, partial: boolean): unknown {
  // Both preview and settlement retain complete items from unfinished envelopes.
  for (const salvage of partial ? [false, true] : [false]) {
    for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
      const value = extractModelJson(text.slice(start), { partial: salvage });
      if (!Array.isArray(value?.items)) continue;
      return value;
    }
  }
  return null;
}

/**
 * Read the first object with items, ignoring echoed schema and extra fields. Each item is independently anchored;
 * a malformed item or unfinished trailing value cannot erase candidates already read.
 */
export function readAgentWorkspaceAnswer(text: string, selection: string, partial = true): AgentWorkspaceReading {
  let parsed: unknown;
  try {
    parsed = answerObject(text, partial);
  } catch {
    return { kind: 'withheld', reason: NOT_A_CHANGE_SET };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['items'])) {
    return { kind: 'withheld', reason: NOT_A_CHANGE_SET };
  }
  const candidates: AgentWorkspaceCandidate[] = [];
  const dropped: AgentWorkspaceDropped[] = [];
  for (const [index, item] of (parsed['items'] as unknown[]).entries()) {
    const ordinal = index + 1;
    const drop = (reason: string): void => { dropped.push({ ordinal, reason }); };
    if (ordinal > MAX_AGENT_WORKSPACE_ITEMS) { drop(words.tooMany(MAX_AGENT_WORKSPACE_ITEMS)); continue; }
    if (!isRecord(item) || !hasKeys(item, ['anchor', 'proposedText'])) { drop(words.invalidItem); continue; }
    const { anchor, proposedText } = item;
    const rationale = item.rationale ?? '';
    if (typeof anchor !== 'string' || typeof proposedText !== 'string' || typeof rationale !== 'string' ||
        !anchor.isWellFormed() || !proposedText.isWellFormed() || !rationale.isWellFormed()) { drop(words.invalidItem); continue; }
    if (anchor.length === 0) { drop(words.noAnchor); continue; }
    if (proposedText === anchor) { drop(words.unchanged); continue; }
    if (proposedText.length > MAX_MARK_BODY_CODE_UNITS || [...proposedText].length > MAX_DIALOGUE_PROPOSAL_CHARACTERS) {
      drop(words.tooLong);
      continue;
    }
    const line = [...rationale.replace(/\s+/gu, ' ').trim()].slice(0, MAX_AGENT_WORKSPACE_RATIONALE_CHARACTERS).join('');
    const place = locate(selection, anchor);
    if (typeof place === 'string') { drop(place); continue; }
    if (candidates.some((kept) => place.from < kept.toGrapheme && kept.fromGrapheme < place.to)) { drop(words.overlap); continue; }
    candidates.push({ ordinal, anchor, proposedText, rationale: line, fromGrapheme: place.from, toGrapheme: place.to });
  }
  return { kind: 'read', candidates, dropped, ...(dropped.length > 0 ? { salvaged: dropped.map((entry) => ({ section: 'items', index: entry.ordinal - 1, reason: entry.reason })) } : {}) };
}
