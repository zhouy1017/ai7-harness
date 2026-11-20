import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { assistantToolCalls, toolResultOf, type AssembledMessage } from './payload.js';

/**
 * The key of a recorded tool-turn continuation (Issue #1598). A continuation is answered by the digest of the whole tool exchange its
 * request carries — every call with its arguments and every result, in order — under the digest of the unit request the exchange
 * belongs to. Turn position is the round count, so no position is stored; a call, an argument, a result or a unit that differs by
 * one byte misses the key, which is how a recording goes stale instead of answering different input.
 *
 * Identities minted per import or per Run (block identities, candidate identities, uuids) are renamed by first appearance before the
 * hash — the unit's own blocks `{{block:N}}`, every other one `{{tool-id:K}}` — so a fresh import of the same manuscript yields the
 * same key and the rename hides identity churn and nothing else. `tools/generate-model-fixture.mjs` carries a copy of this
 * function; tests/unit/generate-model-fixture.test.ts checks that the two agree.
 */
export const TOOL_TURN_DIGEST_SCHEMA = 'ai7.model-fixture.tool-turn/1';
const IDENTITY_TOKEN = /(?<![A-Za-z0-9_-])(?:blk_[0-9a-f]{24}|[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![A-Za-z0-9_-])/gu;
const TOOL_ID_PLACEHOLDER = /\{\{tool-id:(\d+)\}\}/gu;

export interface ToolExchangeRound {
  readonly calls: ReadonlyArray<{ readonly id: string; readonly name: string; readonly arguments: string }>;
  readonly results: ReadonlyArray<{ readonly callId: string; readonly text: string; readonly isError: boolean }>;
}

/**
 * The tool rounds that follow the original user message: assistant tool calls, then one result per call. `null` when the messages
 * after it are anything else, or a call has no result, so a request this does not understand falls back to the older lookups.
 */
export function toolExchangeOf(messages: ReadonlyArray<AssembledMessage>, originalUserIndex: number): ToolExchangeRound[] | null {
  const rounds: Array<{ calls: ToolExchangeRound['calls'][number][]; results: ToolExchangeRound['results'][number][] }> = [];
  for (const message of messages.slice(originalUserIndex + 1)) {
    const calls = assistantToolCalls(message);
    if (calls !== null) { rounds.push({ calls: calls.calls.map(({ id, name, arguments: args }) => ({ id, name, arguments: args })), results: [] }); continue; }
    const result = message.source?.kind === 'tool' ? toolResultOf(message) : null;
    const round = rounds.at(-1);
    if (result === null || round === undefined) return null;
    round.results.push(result);
  }
  const complete = rounds.length > 0 && rounds.every((round) => round.results.length === round.calls.length &&
    round.calls.every((call) => round.results.filter((result) => result.callId === call.id).length === 1));
  return complete ? rounds : null;
}

export interface NormalizedToolExchange {
  readonly rounds: ReadonlyArray<{ readonly calls: ReadonlyArray<{ readonly name: string; readonly arguments: string }>; readonly results: ReadonlyArray<{ readonly text: string; readonly isError: boolean }> }>;
  /** Every identity that is not an own block of the unit, in order of first appearance: `{{tool-id:K}}` is `foreign[K - 1]`. */
  readonly foreign: ReadonlyArray<string>;
}

export function normalizeToolExchange(rounds: ReadonlyArray<ToolExchangeRound>, ownBlockIds: ReadonlyArray<string>): NormalizedToolExchange {
  const names = new Map<string, string>(ownBlockIds.map((id, index) => [id, `{{block:${index + 1}}}`]));
  const foreign: string[] = [];
  const rename = (text: string): string => text.replace(IDENTITY_TOKEN, (identity) => {
    let name = names.get(identity);
    if (name === undefined) { foreign.push(identity); name = `{{tool-id:${foreign.length}}}`; names.set(identity, name); }
    return name;
  });
  const canonicalArguments = (raw: string): string => { try { return canonicalJson(JSON.parse(raw)); } catch { return raw; } };
  return {
    rounds: rounds.map((round) => ({
      calls: round.calls.map((call) => ({ name: call.name, arguments: rename(canonicalArguments(call.arguments)) })),
      results: round.calls.map((call) => {
        const result = round.results.find((candidate) => candidate.callId === call.id)!;
        return { text: rename(result.text), isError: result.isError };
      }),
    })),
    foreign,
  };
}

export function toolTurnRequestDigest(unitRequestDigest: string, normalized: NormalizedToolExchange): string {
  return sha256Hex(canonicalJson({ schema: TOOL_TURN_DIGEST_SCHEMA, unitRequestDigest, rounds: normalized.rounds }));
}

/** Fill `{{tool-id:K}}` from the identities this request's own exchange named; an out-of-range placeholder is left for the contract to reject. */
export function substituteToolIdPlaceholders(text: string, foreign: ReadonlyArray<string>): string {
  return text.replace(TOOL_ID_PLACEHOLDER, (placeholder, index: string) => foreign[Number(index) - 1] ?? placeholder);
}
