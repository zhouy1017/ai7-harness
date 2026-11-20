import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { transmitOnce, type LiveModelFetch } from '../../src/service/provider/live-transmission.js';
import { fixtureToolResultDigest } from '../../src/service/provider/local-deterministic-adapter.js';
import { fixtureEntryKey, parseModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
import { RetrievalIndex, type RetrievalSource } from '../../src/service/retrieval/index.js';
import { normalizeToolExchange, toolTurnRequestDigest, type ToolExchangeRound } from '../../src/service/provider/tool-turn-digest.js';
import { replayTransport, type ReplayTally } from '../editorial-cases/runner/session.js';

// Issue #1598: a model that called platform tools converts into fixture entries and replays them. The first answer is keyed by the
// unit's own request digest, each continuation by the digest of the whole tool exchange it carries under that digest; per-import
// identities are renamed before the hash and nothing else is. Everything runs on a synthetic cache in a temporary directory.

type Tool = {
  parseCachedRequest: (requestBody: string) => { requestDigest: string; contentDigest: string | null; identities: Array<{ placeholder: string; identity: string }> };
  generateModelFixture: (request: { selector: string; cacheRoot: string; identity: string; description: string; out: string }) => Promise<Record<string, unknown>>;
  normalizeToolExchange: (rounds: ReadonlyArray<ToolExchangeRound>, ownBlockIds: ReadonlyArray<string>) => unknown;
  toolTurnRequestDigest: (unitRequestDigest: string, normalized: unknown) => string;
  toolResultsAreSample1: (resultTexts: ReadonlyArray<string>, blockTexts: ReadonlyArray<string>) => boolean;
};
// @ts-expect-error tools/*.mjs carry no declarations; the tool is exercised as the plain module it is.
const tool = (await import('../../tools/generate-model-fixture.mjs')) as unknown as Tool;

const MODEL = 'deepseek-v4-flash';
const ENDPOINT = 'https://x.invalid/v1/chat/completions';
const VALIDATION = { family: 'baseline-analysis', case: 'sample1-whole-book', delta: null } as const;
const UNIT_DIGEST = 'a'.repeat(64);
const OWN = [`blk_${'1'.repeat(24)}`, `blk_${'2'.repeat(24)}`];
const FRESH_OWN = [`blk_${'7'.repeat(24)}`, `blk_${'8'.repeat(24)}`];
const TEXTS = ['合成段落一：人物甲在合成之城落脚。', '合成段落二：合成之城的规矩被首次提及。'];
const CANDIDATE = 'c'.repeat(64);
const FRESH_CANDIDATE = 'e'.repeat(64);
const PREVIEW = '合成检索预览文字：城门在清晨开启。';

const unitMessage = (own: ReadonlyArray<string>, ordinal = 1, unitDigest = UNIT_DIGEST): string => [
  BASELINE_PROMPT_CONTRACT.unitMessageHeader.replace('{ordinal}', String(ordinal)).replace('{total}', '3').replace('{unitDigest}', unitDigest),
  BASELINE_PROMPT_CONTRACT.overlapHeader,
  `[blk_${'0'.repeat(24)}] (paragraph) 合成重叠段落，不属于本单元。`,
  BASELINE_PROMPT_CONTRACT.ownHeader,
  ...own.map((identity, index) => `[${identity}] (paragraph) ${TEXTS[index]!}`),
].join('\n');

interface Round { calls: Array<{ id: string; name: string; arguments: unknown }>; results: string[] }

/** The chat-completions body of one turn: the unit, then each tool round as the product writes it. */
function wireBody(own: ReadonlyArray<string>, rounds: ReadonlyArray<Round>, ordinal = 1, unitDigest = UNIT_DIGEST): { model: string; messages: Array<Record<string, unknown>>; stream: boolean } {
  return { model: MODEL, stream: false, messages: [
    { role: 'system', content: BASELINE_PROMPT_CONTRACT.systemPrompt },
    { role: 'user', content: unitMessage(own, ordinal, unitDigest) },
    ...rounds.flatMap((round) => [
      { role: 'assistant', content: null, reasoning_content: '合成思考。', tool_calls: round.calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) },
      ...round.calls.map((call, index) => ({ role: 'tool', tool_call_id: call.id, content: round.results[index]! })),
    ]),
  ] };
}

const retrieveRound = (own: ReadonlyArray<string>, candidate: string, preview = PREVIEW): Round => ({
  calls: [{ id: 'call_a', name: 'retrieve', arguments: { query: '合成之城', k: 2, sourceKinds: ['manuscript'], near: own[0] } }],
  results: [JSON.stringify([{ candidateId: candidate, sourceKind: 'manuscript', preview, score: 0.5 }])],
});
const fetchRound = (candidate: string): Round => ({
  calls: [{ id: 'call_b', name: 'exact_fetch', arguments: { candidateId: candidate } }],
  results: [JSON.stringify({ candidate: { candidateId: candidate }, text: PREVIEW })],
});

const UNIT_RESULT = (candidate: string, note = '合成注记：见检索结果'): string =>
  JSON.stringify({ synopsis: '合成概述：本单元交代人物甲的出场。', entities: [{ name: '合成人物甲', note: `${note} ${candidate}` }] });

function replayOf(fixture: ReturnType<typeof parseModelFixture>): ResolvedModelFixture {
  return { identity: fixture.identity, description: fixture.description, provenance: fixture.provenance, lineage: [], sha256: 'f'.repeat(64),
    entries: new Map(fixture.entries.map((entry) => [fixtureEntryKey(entry.unitOrdinal, entry.requestDigest, entry.attempt), entry])) };
}

describe('tool-turn fixtures (Issue #1598)', () => {
  let root: string;
  let captured = 0;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-tool-turn-'));
    captured = 0;
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** Capture one turn through the real cache and convert it; the item ids run S40/first-baseline/1, /2, … in capture order. */
  async function convert(body: object, message: Record<string, unknown>): Promise<Record<string, unknown>> {
    const cache = new ProviderResultCache(root);
    await cache.open();
    const stub: LiveModelFetch = async () => ({ status: 200, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 900, completion_tokens: 120 } }) });
    await transmitOnce(cache, stub, { purpose: 'first-baseline', promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST },
      { intent: VALIDATION, step: `first-baseline/unit-1${captured === 0 ? '' : `/tool-turn-${captured + 1}`}`, requestShape: 'openai-chat-completions' },
      OPENCODE_GO_ROUTE_PROFILE, MODEL, ENDPOINT, { method: 'POST', headers: { authorization: 'Bearer placeholder' }, body: canonicalJson(body) });
    captured += 1;
    const fixture = await tool.generateModelFixture({ selector: `S40/first-baseline/${captured}`, cacheRoot: root, identity: 'tool-turn-synthetic', description: '合成工具回合夹具', out: join(root, 'out.json') });
    return (fixture.entries as Array<Record<string, unknown>>)[0]!;
  }

  const callsMessage = (calls: Array<{ name: string; arguments: unknown }>): Record<string, unknown> => ({
    role: 'assistant', content: null, reasoning_content: '合成思考。',
    tool_calls: calls.map((call, index) => ({ id: `call_${index}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })),
  });

  /** The synthetic exchange of the first test: retrieve, then exact_fetch, then the unit result. */
  async function recordedEntries(): Promise<Array<Record<string, any>>> {
    const first = await convert(wireBody(OWN, []), callsMessage([{ name: 'retrieve', arguments: { query: '合成之城', k: 2, sourceKinds: ['manuscript'], near: OWN[0] } }]));
    const second = await convert(wireBody(OWN, [retrieveRound(OWN, CANDIDATE)]), callsMessage([{ name: 'exact_fetch', arguments: { candidateId: CANDIDATE } }]));
    const third = await convert(wireBody(OWN, [retrieveRound(OWN, CANDIDATE), fetchRound(CANDIDATE)]), { role: 'assistant', content: UNIT_RESULT(CANDIDATE) });
    return [first, second, third];
  }
  const sealed = (entries: ReadonlyArray<Record<string, any>>): ReturnType<typeof parseModelFixture> => parseModelFixture({ schema: 'ai7.model-fixture/1', identity: 'tool-turn-synthetic', description: '合成', basedOn: null,
    provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture', entries });
  /** An entry's response replaced, its capture re-sealed over the new bytes as a hand edit would. */
  const edited = (entry: Record<string, any>, response: unknown, capture: Record<string, unknown> = {}): Record<string, any> =>
    ({ ...entry, response, capture: { ...entry.capture, ...capture, fixtureResponseDigest: sha256Hex(canonicalJson(response)) } });
  async function recordedFixture(): Promise<ResolvedModelFixture> {
    return replayOf(sealed(await recordedEntries()));
  }

  const ask = async (fixture: ResolvedModelFixture, body: object): Promise<{ status: number; message: Record<string, any> | null }> => {
    const tally: ReplayTally = { answered: 0, unmatched: 0, answeredContracts: new Set() };
    const response = await replayTransport([fixture], tally)('x', { method: 'POST', body: JSON.stringify(body) });
    return { status: response.status, message: response.status === 200 ? (await response.json() as { choices: Array<{ message: Record<string, any> }> }).choices[0]!.message : null };
  };

  it('converts a tool-call answer and each continuation, the first under the unit request digest and the others under their exchange', async () => {
    const fixture = await recordedFixture();
    const [first, second, third] = [...fixture.entries.values()];
    expect(first!.requestDigest).toBe(unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 1, UNIT_DIGEST));
    expect(first!.response).toMatchObject({ kind: 'tool-calls', calls: [{ name: 'retrieve', arguments: { near: '{{block:1}}' } }] });
    expect(second!.response).toMatchObject({ kind: 'tool-calls', calls: [{ name: 'exact_fetch', arguments: { candidateId: '{{tool-id:1}}' } }] });
    expect(second!.capture!.identityMap).toEqual([{ placeholder: '{{tool-id:1}}', identity: CANDIDATE }]);
    expect(third!.response.kind).toBe('unit-result');
    expect(third!.contentDigest).toBeNull();
    expect(new Set([first, second, third].map((entry) => entry!.requestDigest)).size).toBe(3);
    // The exchange itself, its results and the manuscript text they carry, is never written.
    expect(JSON.stringify([...fixture.entries.values()])).not.toContain(PREVIEW);
  });

  it('replays the recorded turns on a fresh import, filling its own identities and running no tool itself', async () => {
    const fixture = await recordedFixture();
    const firstTurn = await ask(fixture, wireBody(FRESH_OWN, []));
    expect(firstTurn.message!.tool_calls[0].function.name).toBe('retrieve');
    expect(JSON.parse(firstTurn.message!.tool_calls[0].function.arguments)).toEqual({ k: 2, near: FRESH_OWN[0], query: '合成之城', sourceKinds: ['manuscript'] });
    expect(firstTurn.message!.content).toBeNull();
    const secondTurn = await ask(fixture, wireBody(FRESH_OWN, [retrieveRound(FRESH_OWN, FRESH_CANDIDATE)]));
    expect(JSON.parse(secondTurn.message!.tool_calls[0].function.arguments)).toEqual({ candidateId: FRESH_CANDIDATE });
    const last = await ask(fixture, wireBody(FRESH_OWN, [retrieveRound(FRESH_OWN, FRESH_CANDIDATE), fetchRound(FRESH_CANDIDATE)]));
    expect(last.message!.content).toContain(FRESH_CANDIDATE);
    expect(last.message!.content).not.toContain(CANDIDATE);
  });

  it('goes stale when a call, an argument or a result changes, or when another unit carries the same exchange', async () => {
    const fixture = await recordedFixture();
    const carried = (round: Round): Promise<{ status: number }> => ask(fixture, wireBody(FRESH_OWN, [round]));
    expect((await carried(retrieveRound(FRESH_OWN, FRESH_CANDIDATE))).status).toBe(200);
    const changedArgument = retrieveRound(FRESH_OWN, FRESH_CANDIDATE);
    (changedArgument.calls[0]!.arguments as { k: number }).k = 3;
    const changedTool = retrieveRound(FRESH_OWN, FRESH_CANDIDATE);
    changedTool.calls[0]!.name = 'search_manuscript';
    const changedResult = retrieveRound(FRESH_OWN, FRESH_CANDIDATE, '合成检索预览文字：城门在黄昏关闭。');
    for (const round of [changedArgument, changedTool, changedResult]) expect((await carried(round)).status).toBe(500);
    // The same exchange under another unit of the Run answers nothing: the key is bound to the unit's request.
    expect((await ask(fixture, wireBody(FRESH_OWN, [retrieveRound(FRESH_OWN, FRESH_CANDIDATE)], 2))).status).toBe(500);
    // Nor does it under the same ordinal and another unit digest: the exchange key carries the unit's request digest itself.
    expect((await ask(fixture, wireBody(FRESH_OWN, [retrieveRound(FRESH_OWN, FRESH_CANDIDATE)], 1, 'b'.repeat(64)))).status).toBe(500);
  });

  it('refuses a result that echoes manuscript text carried only in a tool result, and an identity no request named', async () => {
    const exchange = [retrieveRound(OWN, CANDIDATE)];
    // One capture each, on a cache of its own: a second turn at the same step is the live-once rule's refusal, not the converter's.
    const refused = async (message: Record<string, unknown>): Promise<unknown> => {
      await rm(root, { recursive: true, force: true });
      root = await mkdtemp(join(tmpdir(), 'ai7-tool-turn-'));
      captured = 0;
      return convert(wireBody(OWN, exchange), message).catch((error: unknown) => error);
    };
    expect(await refused({ role: 'assistant', content: UNIT_RESULT(CANDIDATE, PREVIEW) })).toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
    expect(await refused(callsMessage([{ name: 'retrieve', arguments: { query: PREVIEW.slice(0, 14) } }]))).toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
    expect(await refused(callsMessage([{ name: 'read_blocks', arguments: { blockId: `blk_${'9'.repeat(24)}`, radius: 0 } }]))).toMatchObject({ code: 'FIXTURE_GEN/identity-unmapped' });
    expect(await refused(callsMessage([{ name: 'exact_fetch', arguments: { candidateId: 'f'.repeat(64) } }]))).toMatchObject({ code: 'FIXTURE_GEN/identity-unmapped' });
  });

  const fresh = async (): Promise<void> => {
    await rm(root, { recursive: true, force: true });
    root = await mkdtemp(join(tmpdir(), 'ai7-tool-turn-'));
    captured = 0;
  };

  it('reads the result as its decoded strings, so an escaped quotation mark or newline cannot split a quoted passage', async () => {
    const passage = '城门"在"清晨"开"启，守"卫查"验行"人旅"客通"过合"成\n之后"才"闭"合。';
    const exchange = [retrieveRound(OWN, CANDIDATE, passage)];
    const refused = async (message: Record<string, unknown>): Promise<unknown> => { await fresh(); return convert(wireBody(OWN, exchange), message).catch((error: unknown) => error); };
    expect(await refused({ role: 'assistant', content: UNIT_RESULT(CANDIDATE, passage) })).toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
    expect(await refused(callsMessage([{ name: 'retrieve', arguments: { query: passage } }]))).toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
  });

  it('refuses a placeholder-shaped text in the carried exchange, and reads such an exchange as unreadable on replay', async () => {
    const shaped = await convert(wireBody(OWN, [retrieveRound(OWN, CANDIDATE, '{{tool-id:1}}')]), { role: 'assistant', content: UNIT_RESULT(CANDIDATE) }).catch((error: unknown) => error);
    expect(shaped).toMatchObject({ code: 'FIXTURE_GEN/identity-unmapped' });
    await fresh();
    const fixture = await recordedFixture();
    expect((await ask(fixture, wireBody(FRESH_OWN, [retrieveRound(FRESH_OWN, FRESH_CANDIDATE)]))).status).toBe(200);
    expect((await ask(fixture, wireBody(FRESH_OWN, [retrieveRound(FRESH_OWN, FRESH_CANDIDATE, '{{tool-id:1}}')]))).status).toBe(500);
  });

  it('admits a tool identity only on a continuation, and never hands the product a placeholder it could not fill', async () => {
    const [first, second, third] = await recordedEntries();
    const withIdentity = { kind: 'tool-calls', calls: [{ name: 'retrieve', arguments: { near: '{{block:1}}', query: '{{tool-id:1}}' } }], usage: first!.response.usage };
    const map = [...first!.capture.identityMap, { placeholder: '{{tool-id:1}}', identity: CANDIDATE }];
    // On a first answer, or on a plain unit answer, the placeholder has no exchange to be filled from: the loader refuses it.
    expect(() => sealed([edited(first!, withIdentity, { identityMap: map })])).toThrowError();
    expect(() => sealed([edited(third!, { ...third!.response, text: UNIT_RESULT('{{tool-id:1}}') }, { identityMap: [{ placeholder: '{{tool-id:1}}', identity: CANDIDATE }], validation: { ...third!.capture.validation, step: 'first-baseline/unit-1' } })])).toThrowError();
    expect(() => sealed([edited(second!, second!.response)])).not.toThrowError();
    // A resolved entry that carries one anyway (built by hand, past the loader) is answered as a mismatch, not with the literal placeholder.
    const stray = replayOf(sealed([first!]));
    const [entry] = [...stray.entries.values()];
    const hand = { ...stray, entries: new Map([[fixtureEntryKey(entry!.unitOrdinal, entry!.requestDigest, null), { ...entry!, response: withIdentity }]]) } as ResolvedModelFixture;
    expect((await ask(hand, wireBody(FRESH_OWN, []))).status).toBe(500);
  });

  it('refuses a captured tool-call answer for a subject no continuation can follow', async () => {
    const [first] = await recordedEntries();
    const calls = { kind: 'tool-calls', calls: [{ name: 'retrieve', arguments: { query: '甲' } }], usage: first!.response.usage };
    expect(() => sealed([{ ...edited(first!, calls, { subject: 'reduction', identityMap: [] }), unitOrdinal: 0 }])).toThrowError(/没有可匹配的后续回合/u);
  });

  it('answers a captured entry only by its exchange key, never by the older key over result bytes alone', async () => {
    const [, second] = await recordedEntries();
    const old = fixtureToolResultDigest([{ text: retrieveRound(OWN, CANDIDATE).results[0]!, isError: false }]);
    const legacy = replayOf(sealed([{ ...second!, requestDigest: old }]));
    const hand = { ...legacy, provenance: 'authored' } as ResolvedModelFixture;
    expect((await ask(hand, wireBody(OWN, [retrieveRound(OWN, CANDIDATE)]))).status).toBe(500);
  });

  it('never lets the older key answer a captured entry when the carried exchange is unreadable, and still answers an authored script', async () => {
    const [first, , third] = await recordedEntries();
    // A placeholder-shaped result makes the exchange one the key does not read, so the request is looked up under its result bytes alone.
    const unreadable = retrieveRound(FRESH_OWN, FRESH_CANDIDATE, '{{tool-id:1}}');
    const readable = retrieveRound(FRESH_OWN, FRESH_CANDIDATE);
    const old = (round: Round): string => fixtureToolResultDigest([{ text: round.results[0]!, isError: false }]);
    const plain = edited(third!, { ...third!.response, text: '{"synopsis":"合成概述","entities":[]}' }, { identityMap: [] });
    const asAuthored = (fixture: ReturnType<typeof parseModelFixture>): ResolvedModelFixture => ({ ...replayOf(fixture), provenance: 'authored' }) as ResolvedModelFixture;
    // A captured tool-call answer and a captured text answer, each stored under the result-bytes key of the request that asks.
    for (const captured of [first!, plain]) {
      const under = (round: Round): ReturnType<typeof parseModelFixture> => sealed([{ ...captured, requestDigest: old(round) }]);
      for (const fixture of [replayOf(under(unreadable)), asAuthored(under(unreadable))]) {
        expect((await ask(fixture, wireBody(FRESH_OWN, [unreadable]))).status).toBe(500);
      }
    }
    // The same entry without its capture is an authored script and answers by that key, with an unreadable exchange and a readable one;
    // the captured third turn only gives the replay transport its adapter and sits under a key of its own.
    const script = (round: Round): ReturnType<typeof parseModelFixture> => sealed([third!, { unitOrdinal: 1, requestDigest: old(round), response: plain.response }]);
    for (const round of [unreadable, readable]) {
      expect((await ask(asAuthored(script(round)), wireBody(FRESH_OWN, [round]))).status).toBe(200);
    }
    // A recorded fixture is answered by the exchange key: its capture-less entry under the result-bytes key is no fallback for a readable exchange.
    expect((await ask(replayOf(script(readable)), wireBody(FRESH_OWN, [readable]))).status).toBe(500);
  });

  it('proves a result by the whole refusal texts and field names of the product, read from its source, and nothing that merely resembles them', async () => {
    const source = (path: string): string => readFileSync(resolve(path), 'utf8');
    const refusals = [...source('src/service/provider/platform-tool-session.ts').matchAll(/refuse\('([^']+)'\)/gu)].map((match) => match[1]!);
    const codes = [...source('src/service/retrieval/index.ts').match(/constructor\(readonly code: ([^)]+)\)/u)![1]!.matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1]!);
    expect(refusals).toContain('检索未完成：结果超过字节上限。');
    expect(codes).toContain('RETRIEVAL_SOURCE_MOVED');
    const foreign = '：来自另一份合成稿件的一段较长的文字，不在样书里。';
    for (const text of [...refusals, ...codes]) {
      expect(tool.toolResultsAreSample1([text], [])).toBe(true);
      expect(tool.toolResultsAreSample1([`${text}${foreign}`], [])).toBe(false);
    }
    // The results the product's own index writes, for a manuscript and for a material: every field name and word in them is proved.
    const own = (id: string, segment: { blockId?: string; segmentOrdinal?: number; text: string }, sourceKind: 'manuscript' | 'material'): RetrievalSource =>
      ({ sourceKind, sourceId: id, digest: 'a'.repeat(64), read: () => ({ digest: 'a'.repeat(64), segments: [segment] }) });
    const index = new RetrievalIndex([own('m1', { blockId: OWN[0]!, text: TEXTS[0]! }, 'manuscript'), own('m2', { segmentOrdinal: 1, text: TEXTS[1]! }, 'material')]);
    const found = await index.retrieve('合成段落');
    const results = [JSON.stringify(found), ...found.map((candidate) => JSON.stringify(index.exactFetch(candidate.candidateId))),
      JSON.stringify(index.readBlocks(OWN[0]!, 0)), JSON.stringify(index.searchManuscript('合成段落', 'exact'))];
    expect(results[0]).toContain('"revisionOrIndexDigest"');
    expect(results[0]).toContain('"segmentOrdinal"');
    expect(tool.toolResultsAreSample1(results, TEXTS)).toBe(true);
    expect(tool.toolResultsAreSample1(results, [])).toBe(false);
  });

  it('replays from the first turn again after the exchange was cut short, on the same transport', async () => {
    const fixture = await recordedFixture();
    const transport = replayTransport([fixture], { answered: 0, unmatched: 0, answeredContracts: new Set() });
    const turn = async (rounds: Round[]): Promise<number> => (await transport('x', { method: 'POST', body: JSON.stringify(wireBody(FRESH_OWN, rounds)) })).status;
    expect(await turn([])).toBe(200);
    expect(await turn([retrieveRound(FRESH_OWN, FRESH_CANDIDATE)])).toBe(200);
    // The run is cancelled here and started again: nothing was kept between requests, so the first turn answers as before.
    expect(await turn([])).toBe(200);
    expect(await turn([retrieveRound(FRESH_OWN, FRESH_CANDIDATE), fetchRound(FRESH_CANDIDATE)])).toBe(200);
  });

  it('renames identity churn and nothing else in the exchange digest, in the product and in the tool', () => {
    const rounds = (own: ReadonlyArray<string>, candidate: string, edit: (round: Round) => void = () => undefined): ToolExchangeRound[] => {
      const round = retrieveRound(own, candidate);
      edit(round);
      return [{ calls: round.calls.map((call) => ({ id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) })),
        results: round.results.map((text, index) => ({ callId: round.calls[index]!.id, text, isError: false })) }];
    };
    const digest = (exchange: ToolExchangeRound[], own = OWN): string => toolTurnRequestDigest('b'.repeat(64), normalizeToolExchange(exchange, own));
    // A second fresh import of the same exchange: other block and candidate identities, the same digest.
    expect(digest(rounds(FRESH_OWN, FRESH_CANDIDATE), FRESH_OWN)).toBe(digest(rounds(OWN, CANDIDATE)));
    // A different text, an argument, the call order, or the error flag: another digest.
    const base = digest(rounds(OWN, CANDIDATE));
    expect(digest(rounds(OWN, CANDIDATE, (round) => { round.results[0] = round.results[0]!.replace('清晨', '黄昏'); }))).not.toBe(base);
    expect(digest(rounds(OWN, CANDIDATE, (round) => { (round.calls[0]!.arguments as { k: number }).k = 5; }))).not.toBe(base);
    const twoCalls = (swap: boolean): ToolExchangeRound[] => {
      const calls = [{ id: 'x', name: 'retrieve', arguments: '{"query":"甲"}' }, { id: 'y', name: 'retrieve', arguments: '{"query":"乙"}' }];
      const results = [{ callId: 'x', text: '甲结果', isError: false }, { callId: 'y', text: '乙结果', isError: false }];
      return [{ calls: swap ? [calls[1]!, calls[0]!] : calls, results: swap ? [results[1]!, results[0]!] : results }];
    };
    expect(digest(twoCalls(true))).not.toBe(digest(twoCalls(false)));
    const errored = rounds(OWN, CANDIDATE);
    expect(digest([{ calls: errored[0]!.calls, results: errored[0]!.results.map((result) => ({ ...result, isError: true })) }])).not.toBe(base);
    // Retrieval breaks a tie in score by candidate identity, so two equal-scored candidates swap between imports: the same digest.
    const tie = (swap: boolean): ToolExchangeRound[] => {
      const entries = [{ candidateId: CANDIDATE, score: 0.5, preview: '甲' }, { candidateId: FRESH_CANDIDATE, score: 0.5, preview: '乙' }, { candidateId: 'd'.repeat(64), score: 0.4, preview: '丙' }];
      return [{ calls: [{ id: 'x', name: 'retrieve', arguments: '{"query":"甲"}' }], results: [{ callId: 'x', text: JSON.stringify(swap ? [entries[1], entries[0], entries[2]] : entries), isError: false }] }];
    };
    expect(digest(tie(true))).toBe(digest(tie(false)));
    // Only a tie moves: the lower score ahead of the higher is another exchange.
    const [ordered] = tie(false);
    const inverted: ToolExchangeRound[] = [{ ...ordered!, results: [{ ...ordered!.results[0]!, text: JSON.stringify(JSON.parse(ordered!.results[0]!.text).reverse()) }] }];
    expect(digest(inverted)).not.toBe(digest(tie(false)));
    // Every kind of identity the key renames — a uuid source, a block that is not the unit's, a candidate — across two rounds and a refusal text.
    const rich = (own: ReadonlyArray<string>, uuid: string, other: string, candidate: string): ToolExchangeRound[] => [
      { calls: [{ id: 'p', name: 'retrieve', arguments: JSON.stringify({ query: '合成', k: 2 }) }],
        results: [{ callId: 'p', text: JSON.stringify([{ sourceId: uuid, candidateId: candidate, anchor: { blockId: other }, score: 0.5, preview: PREVIEW }, { sourceId: uuid, candidateId: 'f'.repeat(64), anchor: { blockId: own[0] }, score: 0.4, preview: '丙' }]), isError: false }] },
      { calls: [{ id: 'q', name: 'exact_fetch', arguments: JSON.stringify({ candidateId: candidate }) }, { id: 'r', name: 'read_blocks', arguments: JSON.stringify({ blockId: other, radius: 0 }) }],
        results: [{ callId: 'q', text: 'RETRIEVAL_SOURCE_NOT_AUTHORIZED', isError: false }, { callId: 'r', text: '检索未完成', isError: false }] },
    ];
    const richFirst = rich(OWN, '11111111-1111-4111-8111-111111111111', `blk_${'5'.repeat(24)}`, CANDIDATE);
    const richSecond = rich(FRESH_OWN, '22222222-2222-4222-8222-222222222222', `blk_${'6'.repeat(24)}`, FRESH_CANDIDATE);
    // Each kind of identity is churn (one digest across two imports) in the product and in the tool alike.
    expect(digest(richSecond, FRESH_OWN)).toBe(digest(richFirst));
    const viaTool = (exchange: ToolExchangeRound[], own: ReadonlyArray<string>): string => tool.toolTurnRequestDigest('b'.repeat(64), tool.normalizeToolExchange(exchange, own));
    expect(viaTool(richSecond, FRESH_OWN)).toBe(viaTool(richFirst, OWN));
    expect(viaTool(richFirst, OWN)).toBe(digest(richFirst));
    // The second round is part of the key, and so are the words of a refusal.
    expect(digest(richFirst.slice(0, 1))).not.toBe(digest(richFirst));
    expect(digest([richFirst[0]!, { ...richFirst[1]!, results: [{ ...richFirst[1]!.results[0]!, text: 'RETRIEVAL_SOURCE_MOVED' }, richFirst[1]!.results[1]!] }])).not.toBe(digest(richFirst));
    // The tool keeps its own copy of the function; the two agree on every vector above.
    for (const exchange of [rounds(OWN, CANDIDATE), rounds(FRESH_OWN, FRESH_CANDIDATE), twoCalls(true), tie(true)]) {
      expect(tool.toolTurnRequestDigest('b'.repeat(64), tool.normalizeToolExchange(exchange, OWN))).toBe(digest(exchange, OWN));
    }
  });
});
