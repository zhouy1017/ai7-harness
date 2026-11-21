import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RETRIEVAL_LEXICAL, RetrievalIndex, RetrievalError, chunkRanges, retrievalTokens, reciprocalRankFusion, type RetrievalSource } from '../../src/service/retrieval/index.js';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
// @ts-expect-error Plain ESM pin shared with J-16 has no declarations.
import { PACKAGED_RUNTIME_BOUNDARIES, SEGMENTER_DICTIONARY_DIFFERENCES, TEST_RUNTIME_BOUNDARIES, hanWordBoundaries, segmenterPinTexts } from '../../e2e/segmenter-pin.mjs';
import { prepareRetrievalResult, markRetrievalResult, notExactFetched, dialogueRetrievalCitations } from '../../src/service/retrieval/result-validator.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { AI7_FAILURE_CODES } from '../../src/service/provider/classification.js';
import { LEGACY_LOCAL_TOOL_SCHEMAS, PLATFORM_TOOL_SCHEMAS, canonicalToolArguments, readPlatformToolsRule, ruleNamedToolSchemas, toolSetEqualsPlatformSchemas, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';
import { LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, assistantToolCallDigest, evaluateEgress, toolResultKey, type EgressAttemptScope, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import type { AssembledContentBlock, AssembledModelPayload } from '../../src/service/provider/payload.js';
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
  it('uses Han words, bigrams and single characters, and Latin and number tokens, for deterministic BM25 (#1623)', async () => {
    expect(retrievalTokens('中文检索 ALPHA 42')).toEqual(['w:中文', 'w:检索', 'b:中文', 'b:文检', 'b:检索', 'u:中', 'u:文', 'u:检', 'u:索', 'w:alpha', 'w:42']);
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
  it('ranks by BM25 alone, embedding nothing, while the provider needs its model or its digest does not match', async () => {
    const sources = [source('one', 'alpha alpha beta'), source('two', 'beta gamma'), source('three', 'delta')];
    const lexical = await new RetrievalIndex(sources).retrieve('alpha beta');
    expect(lexical.map((candidate) => candidate.sourceId)).toEqual(['one', 'two']);
    for (const readiness of [{ state: 'needs-model', expectedDigest: null }, { state: 'digest-mismatch', expectedDigest: 'a'.repeat(64), actualDigest: 'b'.repeat(64) }] as const) {
      let calls = 0;
      const provider = { identity: 'synthetic', dimensions: 2, readiness: () => readiness, embed: async () => { calls += 1; return []; } };
      const materialVectors = async () => { calls += 1; return []; };
      expect(await new RetrievalIndex(sources, provider, materialVectors).retrieve('alpha beta')).toEqual(lexical);
      expect(calls).toBe(0);
    }
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
  it('does not revive a disposed Run when an in-flight embedding completes', async () => {
    let finish!: () => void;
    const index = new RetrievalIndex([source('one', 'alpha')], { ...embeddings([[1], [1]]), embed: () => new Promise((resolve) => {
      finish = () => resolve([Float32Array.from([1]), Float32Array.from([1])]);
    }) });
    const pending = index.retrieve('alpha');
    index.dispose(); finish();
    await expect(pending).rejects.toMatchObject({ code: 'RETRIEVAL_SOURCE_NOT_AUTHORIZED' });
    await expect(index.retrieve('alpha')).rejects.toMatchObject({ code: 'RETRIEVAL_SOURCE_NOT_AUTHORIZED' });
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
  it('validates an anchored citation inside the fenced body the unit parsers accept', async () => {
    const index = new RetrievalIndex([source('one', 'alpha beta')]);
    const [candidate] = await index.retrieve('alpha');
    const fenced = '```json\n' + JSON.stringify({ findings: [{ quote: 'alpha', retrievalAnchor: candidate!.candidateId }] }) + '\n```';
    const unverified = prepareRetrievalResult(fenced, index);
    expect(unverified.rejected.map((entry) => [entry.collection, entry.ordinal])).toEqual([['findings', 0]]);
    expect(JSON.parse(unverified.text)).toEqual({ findings: [{ quote: 'alpha' }] });
    index.exactFetch(candidate!.candidateId);
    const verified = prepareRetrievalResult(fenced, index);
    expect(verified.rejected).toEqual([]);
    expect(JSON.parse(verified.text)).toEqual({ findings: [{ quote: 'alpha' }] });
    // A quotation the exact text does not contain is refused even after Exact Fetch.
    expect(prepareRetrievalResult(fenced.replace('"alpha"', '"gamma"'), index).rejected).toHaveLength(1);
    const ordinary = '```json\n{"findings":[]}\n```';
    expect(prepareRetrievalResult(ordinary, index).text).toBe(ordinary);
  });
  it('keeps the retrieval owner free of any filesystem, network or process seam', () => {
    const root = new URL('../../src/service/retrieval/', import.meta.url);
    const files = readdirSync(root).filter((name) => name.endsWith('.ts')).sort();
    expect(files).toEqual(['index.ts', 'local-rule.ts', 'result-validator.ts', 'source-readers.ts']);
    for (const name of files) {
      const text = readFileSync(new URL(name, root), 'utf8');
      expect(text).not.toMatch(/from '(?:node:)?(?:fs|fs\/promises|net|http|https|http2|tls|dgram|dns|child_process|worker_threads)'/u);
      expect(text).not.toMatch(/\b(?:fetch|writeFile|writeFileSync|appendFile|createWriteStream|mkdir|mkdirSync)\(/u);
    }
  });
});

// #1623 (ADR 0107 §4 points 1–3): the local lexical upgrade. Public SampleBooks are read through the product's own import.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SAMPLE_BOOKS = join(ROOT, 'SampleBooks');
async function sampleBook(id: string, file: string): Promise<RetrievalSource & { readonly texts: ReadonlyMap<string, string> }> {
  const blocks: ParsedDocxBlock[] = [];
  await parseDocx(join(SAMPLE_BOOKS, file), file, (block) => blocks.push(block));
  // Stable identities, so that a pinned order never rests on the identities one import mints.
  const segments = blocks.map((block) => ({ blockId: `${id}-${block.position}`, text: block.text }));
  return { sourceKind: 'manuscript', sourceId: id, digest: 'a'.repeat(64), read: () => ({ digest: 'a'.repeat(64), segments }),
    texts: new Map(segments.map((segment) => [segment.blockId, segment.text])) };
}
/** Pinned orders over 呐喊 for 首印 (with 初印 and 印数), by block position: computed on Node 24.18.1 at #1623. */
const FUSED_ORDER = ['nahan-26', 'nahan-312', 'nahan-152', 'nahan-596', 'nahan-807', 'nahan-842', 'nahan-834', 'nahan-956'];
const TOKENIZED_ORDER = ['nahan-26', 'nahan-312', 'nahan-807', 'nahan-288', 'nahan-152', 'nahan-596', 'nahan-303', 'nahan-68'];
const words = (...items: string[]): RetrievalSource[] => items.map((text, index) => source(`w${index}`, text));

describe('local lexical retrieval over Han text (#1623)', () => {
  it('normalizes with NFKC, keeps a supplementary-plane character and leaves function words out of the single characters', () => {
    expect(retrievalTokens('ＡＢＣ１２')).toEqual(['w:abc12']);
    expect(retrievalTokens('\uF900')).toEqual(['u:\u8C48']);
    expect(retrievalTokens('𠮷')).toEqual(['u:𠮷']);
    expect(retrievalTokens('的书')).toEqual(['b:的书', 'u:书']);
    expect(RETRIEVAL_LEXICAL).toMatchObject({ wordWeight: 1, bigramWeight: 0.6, morphemeWeight: 0.25, maxQueries: 4, aliasMinLength: 2, aliasExpansionLimit: 8 });
  });
  it('pins the test runtime\'s word boundaries, including the seven words only the packaged runtime keeps whole', () => {
    expect(hanWordBoundaries(segmenterPinTexts(ROOT))).toEqual(TEST_RUNTIME_BOUNDARIES);
    expect(SEGMENTER_DICTIONARY_DIFFERENCES).toHaveLength(7);
    expect(PACKAGED_RUNTIME_BOUNDARIES.slice(3)).toEqual(SEGMENTER_DICTIONARY_DIFFERENCES.map((word: string) => [word.length]));
  });
  it('ranks words that share a morpheme, literal matches first, and finds nothing for a query that shares no character', async () => {
    const index = new RetrievalIndex(words('修订', '修改', '改动', '违约', '毁约', '首印', '初印', '印数', '天气'));
    const texts = async (query: string) => (await index.retrieve(query)).map((candidate) => index.exactFetch(candidate.candidateId).text);
    const changed = await texts('修改');
    expect([changed[0], [...changed.slice(1)].sort()]).toEqual(['修改', ['修订', '改动'].sort()]);
    expect(await texts('违约')).toEqual(['违约', '毁约']);
    const printed = await texts('首印');
    expect([printed[0], [...printed.slice(1)].sort()]).toEqual(['首印', ['初印', '印数'].sort()]);
    expect(await texts('晴朗')).toEqual([]);
  });
  it('finds the SampleBook passage that shares a morpheme with each of the Issue\'s words, and a supplementary-plane character', async () => {
    const books = [await sampleBook('nahan', 'luxun-nahan.docx'), await sampleBook('zhaohua', 'luxun-zhaohua-xishi.docx')];
    const index = new RetrievalIndex(books);
    const text = (candidate: { anchor: { blockId?: string; start: number; end: number } }) =>
      books.map((book) => book.texts.get(candidate.anchor.blockId!)).find((entry) => entry !== undefined)!.slice(candidate.anchor.start, candidate.anchor.end);
    // None of these words occurs in either book, so the literal ranker found nothing; every passage now found shares a character with it.
    for (const query of ['修订', '修改', '改动', '违约', '毁约', '首印', '初印', '印数']) {
      expect(books.some((book) => [...book.texts.values()].some((passage) => passage.includes(query))), query).toBe(false);
      const found = (await index.retrieve(query)).map(text);
      expect(found.length, query).toBe(8);
      expect(found.every((passage) => [...query].some((char) => passage.includes(char))), query).toBe(true);
    }
    // And a word of the book that shares the morpheme ranks among the first: 付印, 翻印, 石印 or 刻印 for 首印.
    expect((await index.retrieve('首印')).slice(0, 3).map(text).some((passage) => /付印|翻印|石印|刻印/u.test(passage))).toBe(true);
    const rare = String.fromCodePoint(0x2CB3B);
    const found = await index.retrieve(rare);
    expect(found.length).toBeGreaterThan(0);
    expect(text(found[0]!)).toContain(rare);
  }, 60_000);
  it('ranks tokenized manuscript search by BM25 instead of requiring every token, ties in manuscript order', () => {
    const index = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'book', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: '改过' }, { blockId: 'two', text: '修改了两处，又修改一处' }, { blockId: 'three', text: '天气' }, { blockId: 'four', text: '改过' }] }) }]);
    expect(index.searchManuscript('修改', 'tokenized').map((block) => block.blockId)).toEqual(['two', 'one', 'four']);
    expect(index.searchManuscript('晴朗', 'tokenized')).toEqual([]);
    expect(index.searchManuscript('修改', 'exact').map((block) => block.blockId)).toEqual(['two']);
  });
  it('expands a query by the other names of the pinned entity it names, and only then', async () => {
    const book = await sampleBook('zhaohua', 'luxun-zhaohua-xishi.docx');
    const records = { baseline: { revisionId: 'fixed', digest: 'b'.repeat(64), entities: [{ kind: 'person', name: '长妈妈', aliases: ['阿长'] }], events: [], settingClaims: [] },
      guidelines: [], terms: [{ kind: 'term', name: '甲', aliases: ['乙'] }] };
    const otherNameOnly = async (index: RetrievalIndex) => (await index.retrieve('阿长')).filter((candidate) => {
      const passage = book.texts.get(candidate.anchor.blockId!)!;
      return passage.includes('长妈妈') && !passage.includes('阿长');
    }).length;
    expect(await otherNameOnly(new RetrievalIndex([book]))).toBe(0);
    expect(await otherNameOnly(new RetrievalIndex([book], null, null, records))).toBeGreaterThan(0);
    // No name matches, or only a one-character name: the same ranking as without pinned records.
    for (const query of ['天气', '甲']) expect(await new RetrievalIndex([book], null, null, records).retrieve(query)).toEqual(await new RetrievalIndex([book]).retrieve(query));
  }, 60_000);
  it('fuses further phrasings deterministically, and one query ranks as before', async () => {
    const book = await sampleBook('nahan', 'luxun-nahan.docx');
    const index = new RetrievalIndex([book]);
    const single = await index.retrieve('首印');
    expect(await index.retrieve('首印', 8, undefined, [])).toEqual(single);
    expect(await index.retrieve('首印', 8, undefined, ['首印'])).toEqual(single);
    const fused = await index.retrieve('首印', 8, undefined, ['初印', '印数']);
    expect(await index.retrieve('首印', 8, undefined, ['印数', '初印'])).toEqual(fused);
    expect(await new RetrievalIndex([book]).retrieve('首印', 8, undefined, ['初印', '印数'])).toEqual(fused);
    // The pinned order on a fixed corpus: a change of ranking, of a weight or of the runtime's segmentation shows here.
    expect(fused.map((candidate) => candidate.anchor.blockId)).toEqual(FUSED_ORDER);
    expect(index.searchManuscript('首印', 'tokenized').map((block) => block.blockId)).toEqual(TOKENIZED_ORDER);
  }, 60_000);
  it('fuses phrasings with the local vectors and still rechecks withdrawal after the asynchronous embed', async () => {
    let withdrawn = false; let withdrawOnEmbed = false;
    const index = new RetrievalIndex([{ ...source('authorized', 'alpha'), read: () => {
      if (withdrawn) throw new RetrievalError('MATERIAL_REFERENCE_UNAVAILABLE');
      return source('authorized', 'alpha').read();
    } }], { ...embeddings([[1], [1]]), embed: async (texts: readonly string[]) => { withdrawn = withdrawOnEmbed; return texts.map(() => Float32Array.from([1])); } });
    const [candidate] = await index.retrieve('alpha', 8, undefined, ['beta']);
    expect(candidate!.score).toBe(1 / 61 + 1 / 61 + 1 / 61);
    expect(index.exactFetch(candidate!.candidateId).text).toBe('alpha');
    withdrawOnEmbed = true;
    expect(await index.retrieve('alpha', 8, undefined, ['beta'])).toEqual([]);
  });
});

describe('registered local tools without egress', () => {
  const binding = (): EgressBindingFacts => ({ bindingDigest: 'b'.repeat(64), route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL,
    systemPrompt: 'synthetic', outboundDataCategory: 'public-or-synthetic', admittedUserMessages: new Set(['synthetic']), localTools,
    policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 } });
  it('canonicalizes bounded arguments and admits only the rule-named schema set', () => {
    expect(canonicalToolArguments('retrieve', { query: ' alpha ', k: 8 })).toEqual({ tool: 'retrieve', query: 'alpha', k: 8 });
    expect(canonicalToolArguments('retrieve', { query: 'alpha', k: 9 })).toEqual({ tool: 'retrieve', query: 'alpha', k: 8 });
    expect(canonicalToolArguments('retrieve', { query: 'alpha', sourceKinds: ['other'] })).toEqual({ tool: 'retrieve', query: 'alpha', k: 8 });
    // #1623: further phrasings are taken loosely — junk, empty, repeated and the query itself are dropped, then the first four kept.
    expect(canonicalToolArguments('retrieve', { query: 'alpha', queries: ['e', 'd', 'c', 'b', 'a'] })).toEqual({ tool: 'retrieve', query: 'alpha', k: 8, queries: ['b', 'c', 'd', 'e'] });
    expect(canonicalToolArguments('retrieve', { query: 'alpha', queries: [7, '', '  ', 'alpha', ' beta ', 'beta', null, { x: 1 }] })).toEqual({ tool: 'retrieve', query: 'alpha', k: 8, queries: ['beta'] });
    expect(canonicalToolArguments('retrieve', { query: 'alpha', queries: 'beta' })).toEqual({ tool: 'retrieve', query: 'alpha', k: 8 });
    expect(canonicalToolArguments('retrieve', { queries: ['beta'] })).toBeNull();
    // Only the rule-declared set (composition v2) offers them; composition v1 keeps its legacy bytes.
    const declaredRule = { ...localRetrievalRule(), declarations: [{ name: 'retrieve' as const, readOnly: true, concurrencySafe: true }], parallelCallsAllowed: false };
    const declared = ruleNamedToolSchemas(false, declaredRule).find((schema) => schema.name === 'retrieve')!;
    expect(declared.parameters).toMatchObject({ required: ['query'], properties: { queries: { type: 'array', maxItems: 4, items: { type: 'string' } } } });
    expect(typeof (declared.parameters as { properties: { queries: { description: unknown } } }).properties.queries.description).toBe('string');
    expect(JSON.stringify(LEGACY_LOCAL_TOOL_SCHEMAS)).not.toContain('queries');
    expect(toolSetEqualsPlatformSchemas(LEGACY_LOCAL_TOOL_SCHEMAS, ruleNamedToolSchemas(false, true))).toBe(true);
    const facts = binding();
    const payload = { provider: facts.route, model: facts.model, system: facts.systemPrompt, tools: LEGACY_LOCAL_TOOL_SCHEMAS,
      messages: [{ role: 'user' as const, source: { kind: 'user' as const }, content: [{ type: 'text', text: 'synthetic' }] }] };
    const scope = { currentBindingDigest: () => facts.bindingDigest, acceptedOutputDigests: new Set<string>() };
    expect(evaluateEgress(payload, facts, scope).decision).toBe('transmit-local');
    expect(evaluateEgress({ ...payload, tools: [...LEGACY_LOCAL_TOOL_SCHEMAS, { name: 'unnamed' }] }, facts, scope)).toMatchObject({ decision: 'refuse', reason: 'tools-present' });
  });
  it('executes retrieval and Exact Fetch under installed network denial with no host or transport, and counts cap refusals to the breaker', async () => {
    installNodeNetworkDenial();
    const facts = binding();
    let socketSeamCalls = 0;
    const session = new PlatformToolSession({ binding: facts, scope: { currentBindingDigest: () => facts.bindingDigest, acceptedOutputDigests: new Set() },
      retrieval: new RetrievalIndex([source('one', 'alpha')]), purpose: 'synthetic',
      fetch: async () => { socketSeamCalls += 1; throw new Error('socket seam reached'); }, admitHost: () => { socketSeamCalls += 1; throw new Error('host seam reached'); } });
    const signal = new AbortController().signal;
    const first = await session.execute({ callId: '1', tool: 'retrieve', arguments: { query: 'alpha' }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } });
    const candidates = JSON.parse(first.text) as Array<{ candidateId: string }>;
    expect(first.sourceUrl).toBeNull();
    expect((await session.execute({ callId: '2', tool: 'exact_fetch', arguments: { candidateId: candidates[0]!.candidateId }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } })).sourceUrl).toBeNull();
    for (let i = 3; i <= 129; i += 1) await session.execute({ callId: String(i), tool: 'retrieve', arguments: { query: 'alpha' }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } });
    expect(session.usage).toMatchObject({ requests: 0, retrievalCalls: 128, exactFetchCalls: 1, refusedRetrievalCalls: 124 });
    expect(session.egressScope.localBreakerState?.()).toBe('tripped');
    expect(socketSeamCalls).toBe(0);
    // The local breaker ends the unit with its own disclosure, never the web breaker's 联网核查未完成.
    const failed = { terminal: 'failed', signals: [{ kind: 'failed', failure: { code: AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED } }] };
    expect(session.unitEnd(failed as unknown as Parameters<PlatformToolSession['unitEnd']>[0])?.disclosure).toBe('检索未完成');
    session.startUnit();
    expect(session.egressScope.localBreakerState?.()).toBe('intact');
    expect(session.unitEnd(failed as unknown as Parameters<PlatformToolSession['unitEnd']>[0])).toBeNull();
  });
});

describe('a retrieve call with further phrasings (#1623)', () => {
  it('answers five phrasings from the first four and a junk-laden call from what remains, as one call', async () => {
    const facts: EgressBindingFacts = { bindingDigest: 'b'.repeat(64), route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: 'synthetic', outboundDataCategory: 'public-or-synthetic', admittedUserMessages: new Set(['synthetic']), localTools,
      policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 } };
    const corpus = () => words('修订', '修改', '改动', '违约', '毁约', '首印', '初印', '印数', '天气');
    const session = new PlatformToolSession({ binding: facts, scope: { currentBindingDigest: () => facts.bindingDigest, acceptedOutputDigests: new Set() },
      retrieval: new RetrievalIndex(corpus()), purpose: 'synthetic',
      fetch: async () => { throw new Error('socket seam reached'); }, admitHost: () => { throw new Error('host seam reached'); } });
    const signal = new AbortController().signal;
    const call = async (callId: string, args: unknown) => JSON.parse((await session.execute({ callId, tool: 'retrieve', arguments: args, signal,
      dispatch: { token: Symbol(), active: () => !signal.aborted } })).text) as unknown;
    const expected = await new RetrievalIndex(corpus()).retrieve('修订', 8, undefined, ['首印', '违约', '天气', '初印']);
    expect(await call('1', { query: '修订', queries: ['首印', '违约', '天气', '初印', '毁约'] })).toEqual(expected);
    expect(await call('2', { query: '修订', queries: [1, '', '修订', '违约', '违约'] })).toEqual(await new RetrievalIndex(corpus()).retrieve('修订', 8, undefined, ['违约']));
    expect(session.usage).toMatchObject({ retrievalCalls: 2 });
    expect(session.usage.refusedRetrievalCalls ?? 0).toBe(0);
  });
});

describe('the Egress Gate admits exactly the rule-named tool set (#893 review)', () => {
  const policy = JSON.parse(readFileSync(new URL('../../docs/policies/provider-processing-policy.v7.json', import.meta.url), 'utf8')) as { decision: { providerAllowRules: unknown[] } };
  const web = readPlatformToolsRule(policy.decision.providerAllowRules[0]) as PlatformToolsRule;
  const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
  const user = { role: 'user' as const, source: { kind: 'user' as const }, content: [{ type: 'text' as const, text: 'synthetic' }] };
  const facts = (platformTools: PlatformToolsRule | null, local: boolean | null): EgressBindingFacts => ({
    bindingDigest: 'b'.repeat(64), route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, systemPrompt: 'synthetic',
    outboundDataCategory: 'public-or-synthetic', admittedUserMessages: new Set(['synthetic']), platformTools,
    ...(local === null ? {} : { localTools: localRetrievalRule(local) }),
    policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v18', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
  });
  const decide = (binding: EgressBindingFacts, tools: ReadonlyArray<unknown>, messages: AssembledModelPayload['messages'] = [user], scope: Partial<EgressAttemptScope> = {}) =>
    evaluateEgress({ provider: binding.route, model: binding.model, system: binding.systemPrompt, tools, messages }, binding,
      { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set<string>(), ...scope });

  it('compares the payload with the selected rule: web, local, both, or neither', () => {
    const both = [...LEGACY_LOCAL_TOOL_SCHEMAS, ...PLATFORM_TOOL_SCHEMAS];
    const cases: Array<[EgressBindingFacts, ReadonlyArray<unknown>, boolean]> = [
      [facts(web, null), PLATFORM_TOOL_SCHEMAS, true], [facts(web, null), LEGACY_LOCAL_TOOL_SCHEMAS, false], [facts(web, null), both, false],
      [facts(null, true), LEGACY_LOCAL_TOOL_SCHEMAS, true], [facts(null, true), PLATFORM_TOOL_SCHEMAS, false], [facts(null, true), both, false],
      [facts(web, true), both, true], [facts(web, true), PLATFORM_TOOL_SCHEMAS, false], [facts(web, true), LEGACY_LOCAL_TOOL_SCHEMAS, false],
      [facts(null, false), LEGACY_LOCAL_TOOL_SCHEMAS, false], [facts(web, false), both, false], [facts(null, null), LEGACY_LOCAL_TOOL_SCHEMAS, false],
      [facts(web, true), [...both, { name: 'unnamed', description: '', parameters: {} }], false],
      [facts(null, true), [LEGACY_LOCAL_TOOL_SCHEMAS[0]!], false],
    ];
    for (const [binding, tools, admitted] of cases) {
      const decision = decide(binding, tools);
      expect(admitted ? decision.decision : decision).toEqual(admitted ? 'transmit-local' : expect.objectContaining({ decision: 'refuse', reason: 'tools-present' }));
    }
  });

  it('refuses a call to a tool the rule does not name and ends a tripped unit with 检索未完成', () => {
    const history = (name: string): AssembledModelPayload['messages'] => {
      const content: AssembledContentBlock[] = [{ type: 'tool-call', id: 'c1', name, arguments: '{}' }];
      return [user, { role: 'assistant', source: { kind: 'model', provider: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL }, content },
        { role: 'user', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: '[]' }] }] }] as AssembledModelPayload['messages'];
    };
    const scope = (name: 'retrieve' | 'webfetch', breaker: 'intact' | 'tripped' = 'intact'): Partial<EgressAttemptScope> => ({
      acceptedToolCallDigests: new Set([assistantToolCallDigest(history(name)[1]!.content)]),
      admittedToolResults: new Map([[toolResultKey('c1', name), { callId: 'c1', sourceKind: 'tool', tool: name, sourceUrl: null, sha256: sha('[]'), byteCount: 2 }]]),
      localBreakerState: () => breaker,
    });
    const local = facts(null, true);
    expect(decide(local, LEGACY_LOCAL_TOOL_SCHEMAS, history('retrieve'), scope('retrieve')).decision).toBe('transmit-local');
    expect(decide(local, LEGACY_LOCAL_TOOL_SCHEMAS, history('webfetch'), scope('webfetch'))).toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    const tripped = decide(local, LEGACY_LOCAL_TOOL_SCHEMAS, history('retrieve'), scope('retrieve', 'tripped'));
    expect(tripped).toMatchObject({ decision: 'refuse', reason: 'circuit-breaker-tripped' });
    expect(JSON.stringify(tripped)).toContain('检索未完成');
    expect(JSON.stringify(tripped)).not.toContain('联网核查未完成');
  });
});


it('drops only unmatched retrieval references from prose-wrapped observation entries (#1311 H2)', () => {
  const text = '说明。```json\n' + JSON.stringify({ observations: [{ note: '合成观察', retrievalAnchor: 'a'.repeat(64) }, { note: '保留观察' }] }) + '\n```';
  const validated = prepareRetrievalResult(text, null);
  const result = JSON.parse(validated.text) as { observations: unknown[]; salvaged?: unknown[] };
  markRetrievalResult(result, validated.rejected);
  expect(result.observations).toEqual([{ note: '合成观察' }, { note: '保留观察' }]);
  expect(result.salvaged).toEqual([{ section: 'observations.0', index: 0, reason: 'retrieval-reference-not-exact-fetched' }]);
});
