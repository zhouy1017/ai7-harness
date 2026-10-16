import { isRecord } from '../analysis/canonical.js';

/** Structural consumer of #891's admitted projection; replaced by its exported type at restack. */
export interface LocalToolsRule {
  readonly targetedRetrieval: { readonly allowed: boolean; readonly source: 'authorized-pinned-sources-only'; readonly callsPerUnit: number; readonly candidatesPerCall: number; readonly exactFetchRequiredBeforeCitation: true; readonly scope: 'no-egress' };
  readonly breaker: { readonly roundTrips: number; readonly end: string };
}
export function localToolsFromProjection(rule: unknown): LocalToolsRule | null {
  if (!isRecord(rule) || !isRecord(rule.localTools)) return null;
  const block = rule.localTools;
  const retrieval = block.targetedRetrieval;
  const breaker = block.breaker;
  if (!isRecord(retrieval) || retrieval.allowed !== true || retrieval.source !== 'authorized-pinned-sources-only' ||
      retrieval.callsPerUnit !== 5 || retrieval.candidatesPerCall !== 8 || retrieval.exactFetchRequiredBeforeCitation !== true || retrieval.scope !== 'no-egress' ||
      !isRecord(breaker) || breaker.roundTrips !== 128 || breaker.end !== '检索未完成') return null;
  return block as unknown as LocalToolsRule;
}
