import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/service/analysis/canonical.js';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { transmitOnce, type LiveModelFetch } from '../../src/service/provider/live-transmission.js';
import { fixtureEntryKey, parseModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
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

const unitMessage = (own: ReadonlyArray<string>, ordinal = 1): string => [
  BASELINE_PROMPT_CONTRACT.unitMessageHeader.replace('{ordinal}', String(ordinal)).replace('{total}', '3').replace('{unitDigest}', UNIT_DIGEST),
  BASELINE_PROMPT_CONTRACT.overlapHeader,
  `[blk_${'0'.repeat(24)}] (paragraph) 合成重叠段落，不属于本单元。`,
  BASELINE_PROMPT_CONTRACT.ownHeader,
  ...own.map((identity, index) => `[${identity}] (paragraph) ${TEXTS[index]!}`),
].join('\n');

interface Round { calls: Array<{ id: string; name: string; arguments: unknown }>; results: string[] }

/** The chat-completions body of one turn: the unit, then each tool round as the product writes it. */
function wireBody(own: ReadonlyArray<string>, rounds: ReadonlyArray<Round>, ordinal = 1): { model: string; messages: Array<Record<string, unknown>>; stream: boolean } {
  return { model: MODEL, stream: false, messages: [
    { role: 'system', content: BASELINE_PROMPT_CONTRACT.systemPrompt },
    { role: 'user', content: unitMessage(own, ordinal) },
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
  async function recordedFixture(): Promise<ResolvedModelFixture> {
    const first = await convert(wireBody(OWN, []), callsMessage([{ name: 'retrieve', arguments: { query: '合成之城', k: 2, sourceKinds: ['manuscript'], near: OWN[0] } }]));
    const second = await convert(wireBody(OWN, [retrieveRound(OWN, CANDIDATE)]), callsMessage([{ name: 'exact_fetch', arguments: { candidateId: CANDIDATE } }]));
    const third = await convert(wireBody(OWN, [retrieveRound(OWN, CANDIDATE), fetchRound(CANDIDATE)]), { role: 'assistant', content: UNIT_RESULT(CANDIDATE) });
    return replayOf(parseModelFixture({ schema: 'ai7.model-fixture/1', identity: 'tool-turn-synthetic', description: '合成', basedOn: null,
      provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture', entries: [first, second, third] }));
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
    // The tool keeps its own copy of the function; the two agree on every vector above.
    for (const exchange of [rounds(OWN, CANDIDATE), rounds(FRESH_OWN, FRESH_CANDIDATE), twoCalls(true)]) {
      expect(tool.toolTurnRequestDigest('b'.repeat(64), tool.normalizeToolExchange(exchange, OWN))).toBe(digest(exchange, OWN));
    }
  });
});
