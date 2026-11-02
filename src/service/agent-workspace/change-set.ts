import { WORKSPACE_SERVICE_WORDS as words } from './agent-workspace-labels.js';
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

const NOT_A_CHANGE_SET = words.invalidAnswer;

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
  // Scan balanced objects rather than a greedy brace regex: strings may themselves contain braces or escaped quotes.
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const char = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) {
        try {
          const value: unknown = JSON.parse(text.slice(start, end + 1));
          if (isRecord(value) && value['schema'] === AGENT_WORKSPACE_RESULT_SCHEMA) return value;
        } catch { /* Keep looking past explanatory text. */ }
        break;
      }
    }
  }
  if (partial && text.includes(`"${AGENT_WORKSPACE_RESULT_SCHEMA}"`)) {
    const start = /"items"\s*:\s*\[/u.exec(text);
    if (start !== null) {
      // Completed items can be previewed before the surrounding array/object has arrived.
      const body = text.slice(start.index + start[0].length);
      let quoted = false;
      let escaped = false;
      let depth = 0;
      let itemStart = -1;
      const items: unknown[] = [];
      for (let at = 0; at < body.length; at += 1) {
        const char = body[at];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') { if (depth === 0) itemStart = at; depth += 1; }
        else if (char === '}' && --depth === 0 && itemStart !== -1) {
          try { items.push(JSON.parse(body.slice(itemStart, at + 1))); } catch { break; }
        } else if (char === ']' && depth === 0) break;
      }
      return { schema: AGENT_WORKSPACE_RESULT_SCHEMA, items };
    }
  }
  return null;
}

/**
 * Read a workspace answer against the selection it was asked about. The answer is one JSON object holding exactly `schema`
 * and `items`; anything else withholds it whole. Each item holds exactly `anchor`, `proposedText` and `rationale`.
 */
export function readAgentWorkspaceAnswer(text: string, selection: string, partial = false): AgentWorkspaceReading {
  let parsed: unknown;
  try {
    parsed = answerObject(text, partial);
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
    if (ordinal > MAX_AGENT_WORKSPACE_ITEMS) { drop(words.tooMany(MAX_AGENT_WORKSPACE_ITEMS)); continue; }
    if (!isRecord(item) || !sameKeys(item, ['anchor', 'proposedText', 'rationale'])) { drop(words.invalidItem); continue; }
    const { anchor, proposedText, rationale } = item;
    if (typeof anchor !== 'string' || typeof proposedText !== 'string' || typeof rationale !== 'string' ||
        !anchor.isWellFormed() || !proposedText.isWellFormed() || !rationale.isWellFormed()) { drop(words.invalidItem); continue; }
    if (anchor.length === 0) { drop(words.noAnchor); continue; }
    if (proposedText === anchor) { drop(words.unchanged); continue; }
    if (proposedText.length > MAX_MARK_BODY_CODE_UNITS || [...proposedText].length > MAX_DIALOGUE_PROPOSAL_CHARACTERS) {
      drop(words.tooLong);
      continue;
    }
    const line = [...rationale.replace(/\s+/gu, ' ').trim()].slice(0, MAX_AGENT_WORKSPACE_RATIONALE_CHARACTERS).join('');
    if (line.length === 0) {
      drop(words.invalidRationale(MAX_AGENT_WORKSPACE_RATIONALE_CHARACTERS));
      continue;
    }
    const place = locate(selection, anchor);
    if (typeof place === 'string') { drop(place); continue; }
    if (candidates.some((kept) => place.from < kept.toGrapheme && kept.fromGrapheme < place.to)) { drop(words.overlap); continue; }
    candidates.push({ ordinal, anchor, proposedText, rationale: line, fromGrapheme: place.from, toGrapheme: place.to });
  }
  return { kind: 'read', candidates, dropped };
}
