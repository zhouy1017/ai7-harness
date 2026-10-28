import type { AdmittedLocalTools } from '../../shared/protocol.js';
import { isRecord } from '../analysis/canonical.js';

/**
 * AI7's local tools (Issue #891, Provider Processing v18 and v19; ADR 0026, ADR 0047): what a Provider Processing rule must
 * say for the model to call targeted retrieval over the Run's authorized, pinned sources. The tool runs inside AI7's process
 * and sends nothing (`scope: 'no-egress'`); this module only reads the rule's `localTools` block. Executing the tool, its
 * candidates and Exact Fetch belong to the retrieval slice. A rule that names no block yields `null`, and every consumer
 * refuses on `null`; selected v18/v19 name the block on every rule, with `allowed: false` for enrolled background analysis and material translation.
 */

/** The per-unit cap on retrieval calls and the candidates one call returns, as the v18 and v19 rules state them. */
export const LOCAL_TOOL_CALLS_PER_UNIT = 5;
export const LOCAL_TOOL_CANDIDATES_PER_CALL = 8;
/** The consecutive tool round trips one unit may make before the breaker ends it, as the v18 and v19 rules state it. */
export const LOCAL_TOOL_ROUND_TRIP_BREAKER = 128;
/** How a unit the breaker ends is disclosed. */
export const LOCAL_TOOL_BREAKER_END = '检索未完成';
/** The byte cap on one local tool result: the session refuses a larger result and the Egress Gate admits none (Issue #1090). */
export const LOCAL_TOOL_RESULT_MAX_BYTES = 65_536;
/** The closed local capability vocabulary; registration selects the verified rule's exact named subset. */
export const LOCAL_TOOL_DECLARATION_NAMES = ['retrieve', 'exact_fetch', 'read_blocks', 'baseline_facts', 'guideline_clause', 'term_table', 'search_manuscript'] as const;
/** v31's scoped Global Agent rule names exactly these (`scopedTools.names`); only that consumer registers the last two (#1171). */
export const GLOBAL_AGENT_SCOPED_TOOL_NAMES = ['retrieve', 'exact_fetch', 'read_procedure', 'propose_learning_supervision'] as const;

/** The `localTools` block of one Provider Processing v18 or v19 rule, exactly as the policy states it (the shape the launch projects). */
export type LocalToolsRule = AdmittedLocalTools;

export class LocalToolsRuleError extends Error {
  readonly code = 'LOCAL_TOOLS_RULE_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'LocalToolsRuleError';
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new LocalToolsRuleError(message);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * The local tools one Provider Processing allow rule names, or `null` when it names none (every policy before v18 and v19).
 * A block that is present but malformed — a missing or extra key, a non-integer or non-positive bound, a source other than
 * the authorized pinned ones, a scope other than `no-egress`, an Exact Fetch not required — is a refusal, never a silent
 * `null`. A reading, not an execution: the launch compares the values against the bounds of this build.
 */
export function readLocalToolsRule(rule: unknown): LocalToolsRule | null {
  if (!isRecord(rule)) return null;
  const block = rule['localTools'];
  if (block === undefined) return null;
  requireRule(isRecord(block), 'localTools 必须是对象。');
  const metadata = Object.hasOwn(block, 'declarations') || Object.hasOwn(block, 'parallelCallsAllowed');
  requireRule(exactKeys(block, ['targetedRetrieval', 'breaker', ...(metadata ? ['declarations', 'parallelCallsAllowed'] : [])]),
    'localTools 字段不完整或含有未知字段。');
  if (metadata) {
    const declarations = block['declarations'];
    requireRule(typeof block['parallelCallsAllowed'] === 'boolean' && Array.isArray(declarations) &&
      new Set(declarations.map((entry: unknown) => isRecord(entry) ? entry.name : null)).size === declarations.length &&
      declarations.every((entry) => isRecord(entry) && exactKeys(entry, ['name', 'readOnly', 'concurrencySafe']) &&
        LOCAL_TOOL_DECLARATION_NAMES.includes(entry['name'] as typeof LOCAL_TOOL_DECLARATION_NAMES[number]) && entry['readOnly'] === true && entry['concurrencySafe'] === true),
    'localTools 工具声明无效。');
  }
  const retrieval = block['targetedRetrieval'];
  requireRule(isRecord(retrieval) && exactKeys(retrieval, ['allowed', 'source', 'callsPerUnit', 'candidatesPerCall', 'exactFetchRequiredBeforeCitation', 'scope']),
    'targetedRetrieval 字段不完整。');
  requireRule(typeof retrieval['allowed'] === 'boolean', 'targetedRetrieval.allowed 无效。');
  requireRule(!metadata || retrieval['allowed'] === true, '不允许检索的规则不得声明并行工具。');
  requireRule(retrieval['source'] === 'authorized-pinned-sources-only', 'targetedRetrieval 只能读取已授权并固定的来源。');
  requireRule(positiveInteger(retrieval['callsPerUnit']), 'targetedRetrieval.callsPerUnit 无效。');
  requireRule(positiveInteger(retrieval['candidatesPerCall']), 'targetedRetrieval.candidatesPerCall 无效。');
  requireRule(retrieval['exactFetchRequiredBeforeCitation'] === true, '引用前必须精确取回固定版本。');
  requireRule(retrieval['scope'] === 'no-egress', 'targetedRetrieval 不得向外发送任何内容。');
  const breaker = block['breaker'];
  requireRule(isRecord(breaker) && exactKeys(breaker, ['roundTrips', 'end']) && positiveInteger(breaker['roundTrips']) &&
    typeof breaker['end'] === 'string' && breaker['end'].length > 0, 'breaker 无效。');
  return Object.freeze({
    ...(metadata ? { declarations: Object.freeze((block['declarations'] as NonNullable<LocalToolsRule['declarations']>).map((entry) => Object.freeze({ ...entry }))),
      parallelCallsAllowed: block['parallelCallsAllowed'] as boolean } : {}),
    targetedRetrieval: Object.freeze({
      allowed: retrieval['allowed'],
      source: 'authorized-pinned-sources-only' as const,
      callsPerUnit: retrieval['callsPerUnit'],
      candidatesPerCall: retrieval['candidatesPerCall'],
      exactFetchRequiredBeforeCitation: true as const,
      scope: 'no-egress' as const,
    }),
    breaker: Object.freeze({ roundTrips: breaker['roundTrips'], end: breaker['end'] }),
  });
}

/** A boolean permission never removes the existing numeric per-unit call cap. */
export function localToolParallelBound(rule: LocalToolsRule | null | undefined): number {
  return rule?.parallelCallsAllowed === true ? rule.targetedRetrieval.callsPerUnit : 1;
}
