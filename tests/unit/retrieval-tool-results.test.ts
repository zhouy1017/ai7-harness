import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RetrievalIndex, type RetrievalSource } from '../../src/service/retrieval/index.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { localRetrievalRule } from '../support/policy-rules.js';

// What a model receives from `retrieve` and `exact_fetch` once the vectors left (R5-F2c; the Commander's amendment of the cut,
// 2026-11-21). A tool result carries the candidate's score, the ranker's own number, so every score changes with the ranker
// (ADR 0107 §4 point 5); nothing else may. The expectation is the BASE's: the two result texts PlatformToolSession returned at
// 8fd9a3668 for this corpus and call, with the index bound as `store.retrievalIndexForRun` bound it there (the store's stub
// provider), written by the script recorded in PR #1665. Clearly synthetic public words; no manuscript.

const BASE = JSON.parse(readFileSync('tests/fixtures/retrieval/latin-tool-results-8fd9a3668.json', 'utf8')) as { commit: string; retrieve: string; exactFetch: string };

const source = (id: string, text: string): RetrievalSource => ({ sourceKind: 'manuscript', sourceId: id, digest: 'a'.repeat(64),
  read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: `block-${id}`, text }] }) });
const SOURCES = [source('lighthouse', 'The keeper lit the lamp at dusk and watched the ships pass.'), source('harbour', 'Ships waited in the harbour while the keeper slept.')];
const binding: EgressBindingFacts = { bindingDigest: 'b'.repeat(64), route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, systemPrompt: 'synthetic',
  outboundDataCategory: 'public-or-synthetic', admittedUserMessages: new Set(['synthetic']), localTools: localRetrievalRule(),
  policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 } };

/** The two result texts exactly as the tool session sends them: one `retrieve`, then `exact_fetch` of its first candidate. */
async function toolResults(): Promise<{ retrieve: string; exactFetch: string }> {
  const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() },
    retrieval: new RetrievalIndex(SOURCES), purpose: 'synthetic' });
  const signal = new AbortController().signal;
  const call = (callId: string, tool: 'retrieve' | 'exact_fetch', args: unknown) =>
    session.execute({ callId, tool, arguments: args, signal, dispatch: { token: Symbol(callId), active: () => true } });
  const retrieve = (await call('1', 'retrieve', { query: 'keeper ships lamp' })).text;
  const exactFetch = (await call('2', 'exact_fetch', { candidateId: (JSON.parse(retrieve) as Array<{ candidateId: string }>)[0]!.candidateId })).text;
  return { retrieve, exactFetch };
}

type Candidate = { readonly score: number } & Record<string, unknown>;
const withoutScore = ({ score: _score, ...rest }: Candidate): Record<string, unknown> => rest;

describe('retrieve and exact_fetch results after the vectors left (R5-F2c)', () => {
  it('answers a Latin-only query with the base\'s candidates, order, ids, anchors and text; only the score is the ranker\'s new one', async () => {
    expect(BASE.commit).toBe('8fd9a3668');
    const head = await toolResults();
    const now = JSON.parse(head.retrieve) as Candidate[];
    const before = JSON.parse(BASE.retrieve) as Candidate[];
    // Byte for byte once the score is taken out.
    expect(JSON.stringify(now.map(withoutScore))).toBe(JSON.stringify(before.map(withoutScore)));
    // The base's scores were the fusion of its lexical and vector ranks (1/61 + 1/61, 1/62 + 1/62); the head's are BM25 alone.
    expect(before.map((candidate) => candidate.score)).toEqual([2 / 61, 2 / 62]);
    expect(now.map((candidate) => candidate.score)).toEqual([0.9993846950844762, 0.38727613443129677]);
  });

  it('answers exact_fetch with the very candidate retrieve named, its score included, and otherwise the base\'s bytes', async () => {
    const head = await toolResults();
    const fetched = JSON.parse(head.exactFetch) as { candidate: Candidate; text: string };
    const named = (JSON.parse(head.retrieve) as Candidate[])[0]!;
    expect(fetched.candidate).toEqual(named);
    expect(Object.keys(fetched)).toEqual(['candidate', 'text']);
    expect(fetched.text).toBe('The keeper lit the lamp at dusk and watched the ships pass.');
    const base = JSON.parse(BASE.exactFetch) as { candidate: Candidate; text: string };
    expect(JSON.stringify({ ...fetched, candidate: withoutScore(fetched.candidate) })).toBe(JSON.stringify({ ...base, candidate: withoutScore(base.candidate) }));
    expect([base.candidate.score, fetched.candidate.score]).toEqual([2 / 61, 0.9993846950844762]);
  });
});
