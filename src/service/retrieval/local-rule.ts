import {
  LOCAL_TOOL_BREAKER_END,
  LOCAL_TOOL_CALLS_PER_UNIT,
  LOCAL_TOOL_CANDIDATES_PER_CALL,
  LOCAL_TOOL_ROUND_TRIP_BREAKER,
  readLocalToolsRule,
  type LocalToolsRule,
} from '../provider/local-tools.js';

export type { LocalToolsRule };

/**
 * The local tools a selected rule lets the model call, read through #891's reader: `null` for a rule naming none (every policy
 * before v18), for one whose targeted retrieval is not allowed (enrolled background analysis, material translation), and for a
 * block that is malformed or whose bounds are not this build's.
 */
export function localToolsFromProjection(rule: unknown): LocalToolsRule | null {
  let block: LocalToolsRule | null;
  try { block = readLocalToolsRule(rule); } catch { return null; }
  if (block === null) return null;
  const { targetedRetrieval: retrieval, breaker } = block;
  return retrieval.allowed && retrieval.callsPerUnit === LOCAL_TOOL_CALLS_PER_UNIT && retrieval.candidatesPerCall === LOCAL_TOOL_CANDIDATES_PER_CALL &&
    breaker.roundTrips === LOCAL_TOOL_ROUND_TRIP_BREAKER && breaker.end === LOCAL_TOOL_BREAKER_END ? block : null;
}
