import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_TOOL_BREAKER_END,
  LOCAL_TOOL_CALLS_PER_UNIT,
  LOCAL_TOOL_CANDIDATES_PER_CALL,
  LOCAL_TOOL_ROUND_TRIP_BREAKER,
  LocalToolsRuleError,
  readLocalToolsRule,
} from '../../src/service/provider/local-tools.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BACKGROUND = 7;
const TRANSLATION = 8;

function rulesOf(version: string): Array<Record<string, unknown>> {
  const policy = JSON.parse(readFileSync(`${REPO_ROOT}docs/policies/provider-processing-policy.${version}.json`, 'utf8')) as {
    decision: { providerAllowRules: Array<Record<string, unknown>> };
  };
  return policy.decision.providerAllowRules;
}

function block(): { targetedRetrieval: Record<string, unknown>; breaker: Record<string, unknown> } {
  return structuredClone(rulesOf('v18')[2]!.localTools) as { targetedRetrieval: Record<string, unknown>; breaker: Record<string, unknown> };
}

describe('readLocalToolsRule (Provider Processing v18 and v19, Issue #891)', () => {
  it('retains verified v26 declarations while preserving the predecessor retrieval bounds', () => {
    const prior = rulesOf('v25');
    for (const rule of rulesOf('v26')) {
      const reading = readLocalToolsRule(rule);
      expect(reading).not.toBeNull();
      const previous = readLocalToolsRule(prior.find((entry) => entry.ruleId === rule.ruleId));
      expect(reading?.targetedRetrieval).toEqual(previous?.targetedRetrieval);
      expect(reading?.breaker).toEqual(previous?.breaker);
      expect(reading?.declarations).toEqual((rule.localTools as { declarations?: unknown }).declarations);
    }
  });

  it('fails closed on unknown or malformed v26 metadata', () => {
    const mutations: Array<(value: Record<string, unknown>) => void> = [
      (value) => { value['unknown'] = true; },
      (value) => { delete value['parallelCallsAllowed']; },
      (value) => { delete value['declarations']; },
      (value) => { value['parallelCallsAllowed'] = 5; },
      (value) => { value['declarations'] = [{ name: 'shell', readOnly: true, concurrencySafe: true }]; },
      (value) => { (value['declarations'] as Array<Record<string, unknown>>)[0]!['readOnly'] = false; },
      (value) => { (value['declarations'] as Array<Record<string, unknown>>)[0]!['unknown'] = true; },
      (value) => { (value['targetedRetrieval'] as Record<string, unknown>)['allowed'] = false; },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(rulesOf('v26')[2]!.localTools) as Record<string, unknown>;
      mutate(value);
      expect(() => readLocalToolsRule({ localTools: value })).toThrow(LocalToolsRuleError);
    }
  });
  it('declares the bounds the policies state', () => {
    expect([LOCAL_TOOL_CALLS_PER_UNIT, LOCAL_TOOL_CANDIDATES_PER_CALL, LOCAL_TOOL_ROUND_TRIP_BREAKER, LOCAL_TOOL_BREAKER_END]).toEqual([5, 8, 128, '检索未完成']);
  });

  it.each(['v18', 'v19'])('reads the block of every %s rule, retrieval not allowed for the background and 来源译文 rules alone', (version) => {
    rulesOf(version).forEach((rule, index) => {
      const reading = readLocalToolsRule(rule);
      expect(reading, `${index}`).toEqual({
        targetedRetrieval: {
          allowed: index !== BACKGROUND && index !== TRANSLATION, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8,
          exactFetchRequiredBeforeCitation: true, scope: 'no-egress',
        },
        breaker: { roundTrips: 128, end: '检索未完成' },
      });
      expect(Object.isFrozen(reading)).toBe(true);
    });
  });

  it.each(['v14', 'v16', 'v17'])('names no local tools in the predecessor %s: the reading is null, never a default', (version) => {
    for (const rule of rulesOf(version)) expect(readLocalToolsRule(rule)).toBeNull();
    expect(readLocalToolsRule(null)).toBeNull();
    expect(readLocalToolsRule('rule')).toBeNull();
    expect(readLocalToolsRule({})).toBeNull();
  });

  it('refuses a block that is present but malformed rather than reading it as absent', () => {
    const refuse = (label: string, mutate: (value: ReturnType<typeof block>) => unknown): void => {
      const value = block();
      const replaced = mutate(value);
      const rule = { localTools: replaced === undefined ? value : replaced };
      expect(() => readLocalToolsRule(rule), label).toThrow(LocalToolsRuleError);
    };
    refuse('not an object', () => 'on');
    refuse('null', () => null);
    refuse('array', () => []);
    refuse('extra root term', (value) => { (value as Record<string, unknown>).other = {}; });
    refuse('no retrieval', (value) => { delete (value as Partial<typeof value>).targetedRetrieval; });
    refuse('no breaker', (value) => { delete (value as Partial<typeof value>).breaker; });
    refuse('allowed not boolean', (value) => { value.targetedRetrieval.allowed = 1; });
    refuse('source', (value) => { value.targetedRetrieval.source = 'every-source'; });
    refuse('calls zero', (value) => { value.targetedRetrieval.callsPerUnit = 0; });
    refuse('calls negative', (value) => { value.targetedRetrieval.callsPerUnit = -5; });
    refuse('calls fractional', (value) => { value.targetedRetrieval.callsPerUnit = 2.5; });
    refuse('calls string', (value) => { value.targetedRetrieval.callsPerUnit = '5'; });
    refuse('calls unsafe', (value) => { value.targetedRetrieval.callsPerUnit = Number.MAX_SAFE_INTEGER + 1; });
    refuse('candidates zero', (value) => { value.targetedRetrieval.candidatesPerCall = 0; });
    refuse('candidates string', (value) => { value.targetedRetrieval.candidatesPerCall = '8'; });
    refuse('exact fetch waived', (value) => { value.targetedRetrieval.exactFetchRequiredBeforeCitation = false; });
    refuse('exact fetch missing', (value) => { delete value.targetedRetrieval.exactFetchRequiredBeforeCitation; });
    refuse('scope', (value) => { value.targetedRetrieval.scope = 'egress'; });
    refuse('extra retrieval term', (value) => { value.targetedRetrieval.host = 'example.com'; });
    refuse('breaker trips zero', (value) => { value.breaker.roundTrips = 0; });
    refuse('breaker end empty', (value) => { value.breaker.end = ''; });
    refuse('breaker end number', (value) => { value.breaker.end = 3; });
    refuse('extra breaker term', (value) => { value.breaker.extra = true; });
  });

  it('reads a block whose bounds differ from this build\'s: the reader checks the shape, the launch checks the values', () => {
    const value = block();
    value.targetedRetrieval.callsPerUnit = 3;
    expect(readLocalToolsRule({ localTools: value })?.targetedRetrieval.callsPerUnit).toBe(3);
  });
});
