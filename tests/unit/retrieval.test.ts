import { describe, expect, it } from 'vitest';
import { RetrievalIndex, RetrievalError, chunkRanges, retrievalTokens, reciprocalRankFusion, type RetrievalSource } from '../../src/service/retrieval/index.js';
import { prepareRetrievalResult, markRetrievalResult, notExactFetched, dialogueRetrievalCitations } from '../../src/service/retrieval/result-validator.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { LOCAL_TOOL_SCHEMAS, canonicalToolArguments, ruleNamedToolSchemas, toolSetEqualsPlatformSchemas } from '../../src/service/provider/platform-tools.js';
import { LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, evaluateEgress, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { localRetrievalRule } from '../support/policy-rules.js';

// Clearly public synthetic ranking vocabulary; no manuscript fixture or derivative is stored.
const source = (id: string, text: string): RetrievalSource => ({ sourceKind: 'manuscript', sourceId: id, digest: 'a'.repeat(64),
  read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: `block-${id}`, text }] }) });
const localTools = localRetrievalRule();
const embeddings = (values: number[][]) => ({ identity: 'synthetic', dimensions: values[0]!.length, readiness: () => ({ state: 'ready' as const }),
  embed: async () => values.map((value) => Float32Array.from(value)) });

describe('Run-local pinned retrieval', () => {
  it('chunks deterministically by code units with stable bounded overlap', async () => {
    expect(chunkRanges(2401)).toEqual([{ start: 0, end: 1200 }, { start: 1080, end: 2280 }, { start: 2160, end: 2401 }]);
    expect(chunkRanges(0)).toEqual([]);
    const index = new RetrievalIndex([source('one', 'lexical '.repeat(400))]);
    const first = await index.retrieve('lexical');
    expect((await index.retrieve('lexical')).map((entry) => entry.candidateId)).toEqual(first.map((entry) => entry.candidateId));
    expect(first.every((entry) => entry.preview.length <= 200 && entry.anchor.end - entry.anchor.start <= 1200 && entry.anchor.blockId === 'block-one')).toBe(true);
  });
  it('uses CJK bigrams and Latin tokens for deterministic BM25', async () => {
    expect(retrievalTokens('中文检索 ALPHA 42')).toEqual(['中文', '文检', '检索', 'alpha', '42']);
    const index = new RetrievalIndex([source('one', '中文检索 alpha'), source('two', 'unrelated beta')]);
    expect((await index.retrieve('中文 alpha')).map((entry) => entry.sourceId)).toEqual(['one']);
    expect(() => index.exactFetch('unissued')).toThrowError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
  });
  it('keeps UTF-16 anchors bounded without splitting surrogate pairs', async () => {
    const index = new RetrievalIndex([source('unicode', 'x'.repeat(199) + '😀' + ' alpha '.repeat(300))]);
    const candidates = await index.retrieve('alpha');
    expect(candidates.every((candidate) => candidate.preview.isWellFormed() && candidate.preview.length <= 200 &&
      index.exactFetch(candidate.candidateId).text.isWellFormed() && candidate.anchor.end - candidate.anchor.start <= 1_200)).toBe(true);
  });
  it('combines local vector rank and lexical rank with reciprocal rank fusion', async () => {
    const index = new RetrievalIndex([source('one', 'alpha'), source('two', 'beta')], embeddings([[1, 0], [0, 1], [1, 0]]));
    const results = await index.retrieve('alpha');
    expect(results).toHaveLength(2);
    expect(results[0]!.score).toBe(1 / 61);
    expect(reciprocalRankFusion([['a', 'b'], ['b', 'a']]).get('a')).toBe(reciprocalRankFusion([['a', 'b'], ['b', 'a']]).get('b'));
  });
  it('ranks by local vector similarity when wording has no lexical match', async () => {
    const index = new RetrievalIndex([source('one', 'alpha'), source('two', 'beta')], embeddings([[1, 0], [0, 1], [1, 0]]));
    expect((await index.retrieve('gamma')).map((candidate) => candidate.sourceId)).toEqual(['two']);
  });
  it('consumes only pinned material-vector hits and ignores a different build or unpinned source', async () => {
    const material: RetrievalSource = { sourceKind: 'material', sourceId: 'one', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ segmentOrdinal: 1, text: 'alpha' }] }) };
    let digest = 'a'.repeat(64);
    const query = async () => [{ materialId: 'foreign', indexDigest: digest, ordinal: 1, score: 1 }, { materialId: 'one', indexDigest: digest, ordinal: 1, score: 0.9 }];
    const index = new RetrievalIndex([material], embeddings([[1]]), query);
    expect((await index.retrieve('gamma')).map((candidate) => candidate.sourceId)).toEqual(['one']);
    digest = 'b'.repeat(64);
    expect((await index.retrieve('gamma')).length).toBe(0);
  });
  it('refuses withdrawn and moved pins, never substituting fresh text', async () => {
    let digest = 'a'.repeat(64); let withdrawn = false;
    const pinned: RetrievalSource = { ...source('one', 'alpha'), sourceKind: 'material', read: () => {
      if (withdrawn) throw new RetrievalError('MATERIAL_REFERENCE_UNAVAILABLE');
      return { digest, segments: [{ segmentOrdinal: 1, text: 'alpha' }] };
    } };
    const index = new RetrievalIndex([pinned]);
    const [candidate] = await index.retrieve('alpha');
    expect(index.exactFetch(candidate!.candidateId).text.length).toBe(5);
    withdrawn = true;
    expect(await index.retrieve('alpha')).toEqual([]);
    expect(() => index.exactFetch(candidate!.candidateId)).toThrowError('MATERIAL_REFERENCE_UNAVAILABLE');
    withdrawn = false; digest = 'b'.repeat(64);
    expect(() => index.exactFetch(candidate!.candidateId)).toThrowError('RETRIEVAL_SOURCE_MOVED');
    index.dispose();
    expect(() => index.exactFetch(candidate!.candidateId)).toThrowError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
  });
  it('never indexes an unpinned source and rechecks withdrawal after asynchronous ranking', async () => {
    let withdrawn = false;
    const index = new RetrievalIndex([{ ...source('authorized', 'alpha'), read: () => {
      if (withdrawn) throw new RetrievalError('MATERIAL_REFERENCE_UNAVAILABLE');
      return source('authorized', 'alpha').read();
    } }], { ...embeddings([[1], [1]]), embed: async () => { withdrawn = true; return [Float32Array.from([1]), Float32Array.from([1])]; } });
    expect(await index.retrieve('alpha')).toEqual([]);
    expect(() => index.exactFetch('foreign')).toThrowError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
  });
  it('certifies an anchored quotation only after Exact Fetch, preserving ordinary fixture bytes', async () => {
    const index = new RetrievalIndex([source('one', 'alpha')]);
    const [candidate] = await index.retrieve('alpha');
    const raw = JSON.stringify({ findings: [{ quote: 'alpha', retrievalAnchor: { candidateId: candidate!.candidateId } }] });
    const rejected = prepareRetrievalResult(raw, index);
    const parsed: unknown = JSON.parse(rejected.text); markRetrievalResult(parsed, rejected.rejected);
    expect(notExactFetched((parsed as { findings: unknown[] }).findings[0])).toBe(true);
    expect(dialogueRetrievalCitations(`[retrieval:${candidate!.candidateId}]`, index.exactFetchedCandidates()).unverified).toBe(true);
    index.exactFetch(candidate!.candidateId);
    expect(prepareRetrievalResult(raw, index).rejected).toEqual([]);
    expect(dialogueRetrievalCitations(`[retrieval:${candidate!.candidateId}]`, index.exactFetchedCandidates()).anchors.length).toBe(1);
    const ordinary = ' { "findings": [] }\n';
    expect(prepareRetrievalResult(ordinary, index).text).toBe(ordinary);
  });
});

describe('registered local tools without egress', () => {
  const binding = (): EgressBindingFacts => ({ bindingDigest: 'b'.repeat(64), route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL,
    systemPrompt: 'synthetic', outboundDataCategory: 'public-or-synthetic', admittedUserMessages: new Set(['synthetic']), localTools,
    policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 } });
  it('canonicalizes bounded arguments and admits only the rule-named schema set', () => {
    expect(canonicalToolArguments('retrieve', { query: ' alpha ', k: 8 })).toEqual({ tool: 'retrieve', query: 'alpha', k: 8 });
    expect(canonicalToolArguments('retrieve', { query: 'alpha', k: 9 })).toBeNull();
    expect(canonicalToolArguments('retrieve', { query: 'alpha', sourceKinds: ['other'] })).toBeNull();
    expect(toolSetEqualsPlatformSchemas(LOCAL_TOOL_SCHEMAS, ruleNamedToolSchemas(false, true))).toBe(true);
    const facts = binding();
    const payload = { provider: facts.route, model: facts.model, system: facts.systemPrompt, tools: LOCAL_TOOL_SCHEMAS,
      messages: [{ role: 'user' as const, source: { kind: 'user' as const }, content: [{ type: 'text', text: 'synthetic' }] }] };
    const scope = { currentBindingDigest: () => facts.bindingDigest, acceptedOutputDigests: new Set<string>() };
    expect(evaluateEgress(payload, facts, scope).decision).toBe('transmit-local');
    expect(evaluateEgress({ ...payload, tools: [...LOCAL_TOOL_SCHEMAS, { name: 'unnamed' }] }, facts, scope)).toMatchObject({ decision: 'refuse', reason: 'tools-present' });
  });
  it('executes retrieval and Exact Fetch under installed network denial with no host or transport, and counts cap refusals to the breaker', async () => {
    installNodeNetworkDenial();
    const facts = binding();
    let socketSeamCalls = 0;
    const session = new PlatformToolSession({ binding: facts, scope: { currentBindingDigest: () => facts.bindingDigest, acceptedOutputDigests: new Set() },
      retrieval: new RetrievalIndex([source('one', 'alpha')]), purpose: 'synthetic',
      fetch: async () => { socketSeamCalls += 1; throw new Error('socket seam reached'); }, admitHost: () => { socketSeamCalls += 1; throw new Error('host seam reached'); } });
    const signal = new AbortController().signal;
    const first = await session.execute({ callId: '1', tool: 'retrieve', arguments: { query: 'alpha' }, signal });
    const candidates = JSON.parse(first.text) as Array<{ candidateId: string }>;
    expect(first.sourceUrl).toBeNull();
    expect((await session.execute({ callId: '2', tool: 'exact_fetch', arguments: { candidateId: candidates[0]!.candidateId }, signal })).sourceUrl).toBeNull();
    for (let i = 3; i <= 129; i += 1) await session.execute({ callId: String(i), tool: 'retrieve', arguments: { query: 'alpha' }, signal });
    expect(session.usage).toMatchObject({ requests: 0, retrievalCalls: 128, exactFetchCalls: 1, refusedRetrievalCalls: 124 });
    expect(session.egressScope.localBreakerState?.()).toBe('tripped');
    expect(socketSeamCalls).toBe(0);
  });
});
