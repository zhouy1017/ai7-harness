import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { randomUUID } from 'node:crypto';
import type { DevelopmentValidationIntent } from '../../src/shared/protocol.js';
import { platformToolCallOnce, transmitOnce, type LiveModelFetch } from '../../src/service/provider/live-transmission.js';
import {
  PROVIDER_CACHE_DIRECTORY,
  PROVIDER_CLAIM_DIRECTORY,
  PROVIDER_LEDGER_FILE,
  ProviderResultCache,
  isItemLine,
  isModelCallLine,
  legacyProviderCacheKey,
  providerCacheKey,
  providerEvidenceGeneration,
  providerRequestDigest,
  providerSemanticDigest,
  type ProviderCacheEntry,
  type ProviderLedgerLine,
  type ProviderToolLedgerLine,
} from '../../src/service/provider/provider-result-cache.js';
import { ResearchSnapshotCache } from '../../src/service/provider/research-snapshot-cache.js';

// The shared once-only transmission (Issue #473, S87-f3a; Issue #808): a development validation model call is replayed,
// refused or sent by its namespace, purpose and step, the ledger names S87 and S17c items beside S40's, and a platform-tool
// call is sent once and answered from the Research Snapshot Cache after. Stub transports only; the roots are temporary
// directories.

const CONTRACT = 'a'.repeat(64);
let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai7-live-transmission-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function modelFetch(calls: string[], status = 200): LiveModelFetch {
  return async (_url, init) => {
    calls.push(init.body);
    return { status, json: async () => ({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }) };
  };
}

async function rawLedger(): Promise<string[]> {
  return (await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8')).split('\n').filter((line) => line.length > 0);
}

// Development validation (Issue #808): every model call names its purpose and step, an exact request replays under its full
// namespace, evidence of the same question refuses a resend, and a possibly billed request stays held across restarts.
const SAMPLE_CASE: DevelopmentValidationIntent = { family: 'baseline-analysis', case: 'sample1-whole-book', delta: null };
const SHAPE = 'openai-chat-completions';
const ENDPOINT = 'https://x.invalid/v1/chat/completions';
const BLOCK_A = `blk_${'a'.repeat(24)}`;
const BLOCK_B = `blk_${'b'.repeat(24)}`;

/** A unit request as the analysis path sends it: the header's unit digest and the block identity are minted per import. */
function unitBody(blockId: string, text: string, minted = 'c'): string {
  return JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: `分析单元 1/7 · 单元摘要 ${minted.repeat(64)}\n[${blockId}] ${text}` }] });
}

interface CallOptions {
  readonly intent?: DevelopmentValidationIntent;
  readonly step?: string;
  readonly model?: string;
  readonly url?: string;
  readonly shape?: string;
  readonly profile?: typeof OPENCODE_GO_ROUTE_PROFILE;
  readonly contract?: string;
}

function call(cache: ProviderResultCache, fetch: LiveModelFetch, body: string, options: CallOptions = {}) {
  return transmitOnce(cache, fetch, { purpose: 'first-baseline', promptContractDigest: options.contract ?? CONTRACT }, {
    intent: options.intent ?? SAMPLE_CASE, step: options.step ?? 'first-baseline/unit-1', requestShape: options.shape ?? SHAPE,
  }, options.profile ?? OPENCODE_GO_ROUTE_PROFILE, options.model ?? 'deepseek-v4-flash', options.url ?? ENDPOINT,
  { method: 'POST', headers: { authorization: 'Bearer placeholder' }, body });
}

async function refusal(sent: Promise<unknown>): Promise<string> {
  try {
    await sent;
    return 'sent';
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

async function opened(): Promise<ProviderResultCache> {
  const cache = new ProviderResultCache(root);
  await cache.open();
  return cache;
}

/** The model-call lines that sent or replayed; a refusal's line is read through {@link refusalLines}. */
function modelLines(cache: ProviderResultCache): ProviderLedgerLine[] {
  return cache.lines.filter(isModelCallLine).filter((line) => line.outcome !== 'refused');
}

function refusalLines(cache: ProviderResultCache): Array<[string | undefined, ReadonlyArray<string> | undefined]> {
  return cache.lines.filter(isModelCallLine).filter((line) => line.outcome === 'refused')
    .map((line) => [line.validation?.refusal, line.validation?.evidence]);
}

const dropped = (calls: string[]): LiveModelFetch => async (_url, init) => {
  calls.push(init.body);
  return { status: 200, json: async () => { throw new Error('socket hang up'); } };
};

function claimKey(body: string): string {
  return providerCacheKey({ route: 'opencode-go', endpoint: ENDPOINT, requestShape: SHAPE, model: 'deepseek-v4-flash' }, providerSemanticDigest(body));
}

describe('transmitOnce under development validation', () => {
  it('replays an identical request under its full namespace and records the capture usage apart from what the replay incurred', async () => {
    const cache = await opened();
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const first = await call(cache, modelFetch(calls), body);
    expect(first.replayed).toBeUndefined();
    const second = await call(cache, modelFetch(calls), body);
    expect(second.replayed).toBe(true);
    expect(await second.json()).toEqual(await first.json());
    expect(calls).toHaveLength(1);
    const [captured, replayed] = modelLines(cache);
    expect(captured).toMatchObject({
      itemId: 'S40/first-baseline/1', outcome: 'transmitted', route: 'opencode-go', endpoint: ENDPOINT, requestShape: SHAPE,
      usage: { inputTokens: 3, outputTokens: 2 }, incurredUsage: { inputTokens: 3, outputTokens: 2 },
      validation: { family: 'baseline-analysis', case: 'sample1-whole-book', step: 'first-baseline/unit-1', delta: null, decision: 'first-capture', evidence: [] },
    });
    expect(replayed).toMatchObject({
      itemId: 'S40/first-baseline/2', outcome: 'replayed', cacheKey: captured!.cacheKey,
      usage: { inputTokens: 3, outputTokens: 2 }, incurredUsage: { inputTokens: 0, outputTokens: 0 },
      validation: { decision: 'exact-replay', evidence: ['S40/first-baseline/1'] },
    });
    const entry = await cache.readEntry(captured!.cacheKey!);
    expect(entry).toMatchObject({ state: 'present', entry: { itemId: 'S40/first-baseline/1', route: 'opencode-go', endpoint: ENDPOINT, requestShape: SHAPE } });
    expect(replayed!.capturedAt).toBe(entry.state === 'present' ? entry.entry.transmittedAt : null);
    expect(cache.usageTotals()).toEqual({ recorded: { inputTokens: 6, outputTokens: 4 }, incurred: { inputTokens: 3, outputTokens: 2 } });
    // The terminal claim survives cache loss; nothing anywhere carries the credential header.
    expect(await cache.readClaim(claimKey(body))).toMatchObject({ state: 'completed' });
    expect((await rawLedger()).join('\n')).not.toContain('placeholder');
    expect(JSON.stringify(entry)).not.toContain('placeholder');
  });

  it('keeps route, endpoint, request shape and model apart: none answers another, and each records what changed', async () => {
    const cache = await opened();
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    // A changed prompt contract always changes the body too: its system section travels in it.
    const contractBody = JSON.stringify({ ...JSON.parse(body) as object, system: '新的提示契约' });
    const variants: Array<CallOptions & { body?: string }> = [{}, { url: `${ENDPOINT}?v=2` }, { shape: 'anthropic-messages' }, { model: 'deepseek-v4.1-flash' },
      { profile: { ...OPENCODE_GO_ROUTE_PROFILE, route: 'deepseek-open-platform' } as typeof OPENCODE_GO_ROUTE_PROFILE },
      { contract: 'd'.repeat(64), body: contractBody }];
    for (const variant of variants) await call(cache, modelFetch(calls), variant.body ?? body, variant);
    expect(calls).toHaveLength(variants.length);
    expect(modelLines(cache).map((line) => [line.validation!.decision, line.validation!.changed ?? null])).toEqual([
      ['first-capture', null],
      ['config-delta', ['endpoint']],
      ['config-delta', ['requestShape']],
      ['config-delta', ['model']],
      ['config-delta', ['route']],
      ['config-delta', ['promptContractDigest']],
    ]);
    // Every namespace replays its own capture and nothing else.
    for (const variant of variants) expect((await call(cache, modelFetch(calls), variant.body ?? body, variant)).replayed).toBe(true);
    expect(calls).toHaveLength(variants.length);
    expect(new Set(modelLines(cache).filter((line) => line.outcome === 'transmitted').map((line) => line.cacheKey)).size).toBe(variants.length);
  });

  it('refuses the same question asked again with newly minted identities, whatever purpose or delta it is filed under', async () => {
    const cache = await opened();
    const calls: string[] = [];
    await call(cache, modelFetch(calls), unitBody(BLOCK_A, '雨落在旧城。'));
    const reimported = unitBody(BLOCK_B, '雨落在旧城。', 'e');
    expect(await refusal(call(cache, modelFetch(calls), reimported))).toBe('PROVIDER_VALIDATION_EVIDENCE_EXISTS');
    const renamed: DevelopmentValidationIntent = { family: 'baseline-analysis', case: 'sample1-reimported', delta: { kind: 'input', rationale: 'fresh-import-of-sample' } };
    expect(await refusal(call(cache, modelFetch(calls), reimported, { intent: renamed, step: 'reanalyze-book/unit-1' }))).toBe('PROVIDER_VALIDATION_EVIDENCE_EXISTS');
    const runIdentity = JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: `运行反思 ${randomUUID()} · 账目摘要 ${'f'.repeat(64)}` }] });
    await call(cache, modelFetch(calls), runIdentity, { step: 'first-baseline/reflection' });
    const anotherRun = runIdentity.replace(/运行反思 [0-9a-f-]{36}/u, `运行反思 ${randomUUID()}`);
    expect(await refusal(call(cache, modelFetch(calls), anotherRun, { step: 'reanalyze-book/reflection' }))).toBe('PROVIDER_VALIDATION_EVIDENCE_EXISTS');
    expect(calls).toHaveLength(2);
    expect(modelLines(cache)).toHaveLength(2);
    // Each refusal is on the ledger, sent nothing, and names the capture that answers it.
    expect(refusalLines(cache)).toEqual([
      ['PROVIDER_VALIDATION_EVIDENCE_EXISTS', ['S40/first-baseline/1']],
      ['PROVIDER_VALIDATION_EVIDENCE_EXISTS', ['S40/first-baseline/1']],
      ['PROVIDER_VALIDATION_EVIDENCE_EXISTS', ['S40/first-baseline/4']],
    ]);
    expect(cache.lines.filter(isModelCallLine).filter((line) => line.outcome === 'refused').every((line) =>
      line.usage === null && line.status === null && line.incurredUsage?.inputTokens === 0)).toBe(true);
  });

  it('refuses similar evidence for the same purpose and step unless an input delta is declared, and records what it rests on', async () => {
    const cache = await opened();
    const calls: string[] = [];
    await call(cache, modelFetch(calls), unitBody(BLOCK_A, '雨落在旧城。'));
    const edited = unitBody(BLOCK_A, '雪落在旧城。');
    expect(await refusal(call(cache, modelFetch(calls), edited))).toBe('PROVIDER_VALIDATION_SIMILAR_EVIDENCE');
    const declared: DevelopmentValidationIntent = { ...SAMPLE_CASE, delta: { kind: 'input', rationale: 'snow-instead-of-rain' } };
    await call(cache, modelFetch(calls), edited, { intent: declared });
    // Another step of the same purpose has no evidence yet: its first capture needs no declaration.
    await call(cache, modelFetch(calls), unitBody(BLOCK_B, '风吹过河岸。'), { step: 'first-baseline/unit-2' });
    expect(calls).toHaveLength(3);
    expect(modelLines(cache).map((line) => [line.validation!.decision, line.validation!.evidence])).toEqual([
      ['first-capture', []],
      ['input-delta', ['S40/first-baseline/1']],
      ['first-capture', []],
    ]);
    expect(modelLines(cache)[1]!.validation!.delta).toEqual({ kind: 'input', rationale: 'snow-instead-of-rain' });
    expect(refusalLines(cache)).toEqual([['PROVIDER_VALIDATION_SIMILAR_EVIDENCE', ['S40/first-baseline/1']]]);
  });

  it('stops reusing a retired capture — invalidated by item, by purpose, or stale — and keeps its identity', async () => {
    const cache = await opened();
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    await call(cache, modelFetch(calls), body);
    await cache.invalidate({ itemId: 'S40/first-baseline/1' }, 'captured-before-contract-fix');
    expect((await call(cache, modelFetch(calls), body)).replayed).toBeUndefined();
    await cache.invalidate({ family: 'baseline-analysis', case: 'sample1-whole-book' }, 'sample-edited-by-tester');
    expect((await call(cache, modelFetch(calls), body)).replayed).toBeUndefined();
    // Marked stale where it stands — the existing convention, which frees the item id — the capture answers nothing either.
    const latest = modelLines(cache).at(-1)!;
    const ledgerText = await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8');
    await writeFile(join(root, PROVIDER_LEDGER_FILE), ledgerText.replace(JSON.stringify(latest), JSON.stringify({ ...latest, stale: true })), 'utf8');
    expect((await call(cache, modelFetch(calls), body)).replayed).toBeUndefined();
    expect(calls).toHaveLength(4);
    expect((await call(cache, modelFetch(calls), body)).replayed).toBe(true);
    expect(calls).toHaveLength(4);
    // Each retired capture's entry was moved aside, never overwritten; its line and the reason it was retired stay on the ledger.
    expect((await readdir(join(root, PROVIDER_CACHE_DIRECTORY))).filter((name) => name.includes('.superseded-'))).toHaveLength(3);
    const reread = await opened();
    expect(reread.lines.filter((line) => line.kind === 'invalidation').map((line) => (line as { reason: string }).reason))
      .toEqual(['captured-before-contract-fix', 'sample-edited-by-tester']);
    expect(reread.isRetired('S40/first-baseline/1', null)).toBe(true);
    await expect(cache.invalidate({ itemId: 'S40/first-baseline/1' }, 'x')).rejects.toMatchObject({ code: 'PROVIDER_INVALIDATION_INVALID' });
  });

  it('sends two concurrent misses of one request once, across two cache instances', async () => {
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    const slow: LiveModelFetch = async (url, init) => {
      await gate;
      return modelFetch(calls)(url, init);
    };
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const [left, right] = [await opened(), await opened()];
    const both = Promise.all([call(left, slow, body), call(right, slow, body)]);
    setTimeout(release, 20);
    const answers = await both;
    expect(calls).toHaveLength(1);
    expect(answers.map((answer) => answer.replayed ?? false).sort()).toEqual([false, true]);
    expect((await opened()).counts()).toEqual({ transmitted: 1, replayed: 1, failed: 0 });
  });

  it('holds a request claimed by a sender that never settled it, or whose claim does not read, across a restart', async () => {
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const namespace = { route: 'opencode-go', endpoint: ENDPOINT, requestShape: SHAPE, model: 'deepseek-v4-flash' };
    const cacheKey = providerCacheKey(namespace, providerSemanticDigest(body));
    // Another process claimed the request and died — or is still waiting on the answer. Nobody can tell which.
    expect(await (await opened()).claim({ cacheKey, itemId: 'S40/first-baseline/1', claimedAt: new Date().toISOString(), family: 'baseline-analysis', case: 'sample1-whole-book', step: 'first-baseline/unit-1' })).toBe(true);
    expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    await writeFile(join(root, PROVIDER_CLAIM_DIRECTORY, `${cacheKey}.json`), '{"schema":"ai7.provider-cl', 'utf8');
    expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(0);
    // A rationale cannot displace an unreadable claim or prove the sender exited.
    const retry: DevelopmentValidationIntent = { ...SAMPLE_CASE, delta: { kind: 'retry-unknown', rationale: 'sender-died-mid-request' } };
    const resent = await opened();
    expect(await refusal(call(resent, modelFetch(calls), body, { intent: retry }))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(0);
  });

  it('keeps an answer that never came back whole as a lasting hold, resent once per declared rationale', async () => {
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const first = await call(await opened(), dropped(calls), body);
    await expect(first.json()).rejects.toThrowError(/AI7_OUTCOME_UNKNOWN/u);
    expect((await readdir(join(root, PROVIDER_CACHE_DIRECTORY))).filter((name) => name.endsWith('.json'))).toEqual([]);
    const after = await opened();
    expect(modelLines(after)).toMatchObject([{ outcome: 'failed', status: 200, classification: 'outcome-unknown', usage: null, incurredUsage: null }]);
    // Restarted, renumbered, under a new Run: still held, never a new test item.
    expect(await refusal(call(after, modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    const retry: DevelopmentValidationIntent = { ...SAMPLE_CASE, delta: { kind: 'retry-unknown', rationale: 'gateway-dropped-the-answer' } };
    await call(after, dropped(calls), body, { intent: retry });
    expect(await refusal(call(await opened(), modelFetch(calls), body, { intent: retry }))).toBe('PROVIDER_VALIDATION_RETRY_SPENT');
    const another: DevelopmentValidationIntent = { ...SAMPLE_CASE, delta: { kind: 'retry-unknown', rationale: 'second-gateway-drop-checked' } };
    expect((await call(await opened(), modelFetch(calls), body, { intent: another })).status).toBe(200);
    expect(calls).toHaveLength(3);
    const settled = await opened();
    expect(modelLines(settled).map((line) => [line.outcome, line.validation!.decision, line.validation!.evidence])).toEqual([
      ['failed', 'first-capture', []],
      ['failed', 'retry-unknown', ['S40/first-baseline/1']],
      ['transmitted', 'retry-unknown', ['S40/first-baseline/3']],
    ]);
    expect(refusalLines(settled)).toEqual([
      ['PROVIDER_VALIDATION_OUTCOME_UNKNOWN', ['S40/first-baseline/1']],
      ['PROVIDER_VALIDATION_RETRY_SPENT', ['S40/first-baseline/3']],
    ]);
  });

  it('reads an unreadable entry, namespaced or legacy, as possibly billed and never as a miss', async () => {
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const cache = await opened();
    await call(cache, modelFetch(calls), body);
    const cacheKey = modelLines(cache)[0]!.cacheKey!;
    await cache.invalidate({ itemId: 'S40/first-baseline/1' }, 'retired-for-this-check');
    await writeFile(join(root, PROVIDER_CACHE_DIRECTORY, `${cacheKey}.json`), '{"model":"deep', 'utf8');
    expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    const legacyBody = unitBody(BLOCK_B, '风吹过河岸。');
    await writeFile(join(root, PROVIDER_CACHE_DIRECTORY, `${legacyProviderCacheKey('deepseek-v4-flash', providerRequestDigest(legacyBody))}.json`), 'not json', 'utf8');
    expect(await refusal(call(await opened(), modelFetch(calls), legacyBody, { step: 'first-baseline/unit-2' }))).toBe('PROVIDER_VALIDATION_LEGACY_UNSCOPED');
    expect(calls).toHaveLength(1);
  });

  it('preserves legacy evidence without assigning it an unproved namespace, until explicitly retired', async () => {
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const requestDigest = providerRequestDigest(body);
    const legacyLine = { itemId: 'S40/first-baseline/1', purpose: 'first-baseline', model: 'deepseek-v4-flash', promptContractDigest: CONTRACT, requestDigest, outcome: 'transmitted', status: 200, usage: { inputTokens: 5, outputTokens: 1 }, recordedAt: '2026-09-06T00:00:00.000Z' };
    await writeFile(join(root, PROVIDER_LEDGER_FILE), `${JSON.stringify(legacyLine)}\n`, 'utf8');
    const cache = await opened();
    await cache.store({ model: 'deepseek-v4-flash', requestDigest, requestBody: body, status: 200, response: { choices: [] }, usage: { inputTokens: 5, outputTokens: 1 }, transmittedAt: '2026-09-06T00:00:00.000Z' });
    const calls: string[] = [];
    for (const options of [{}, { url: `${ENDPOINT}?different-route=true` }, { shape: 'anthropic-messages' }]) {
      expect(await refusal(call(cache, modelFetch(calls), body, options))).toBe('PROVIDER_VALIDATION_LEGACY_UNSCOPED');
    }
    expect(calls).toHaveLength(0);
    expect(modelLines(cache)).toEqual([legacyLine]);
    // The legacy line is no purpose's evidence, and once stale its entry answers nothing.
    const ledgerText = await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8');
    await writeFile(join(root, PROVIDER_LEDGER_FILE), ledgerText.replace(JSON.stringify(legacyLine), JSON.stringify({ ...legacyLine, stale: true })), 'utf8');
    expect((await call(cache, modelFetch(calls), body)).replayed).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(modelLines(cache).at(-1)!.validation!.decision).toBe('first-capture');
  });

  it('records a limit as quota-exhausted under a named slice and frees its request to be asked again later', async () => {
    const cache = await opened();
    const calls: string[] = [];
    await transmitOnce(cache, modelFetch(calls, 429), { purpose: 'dialogue', slice: 'S17c', promptContractDigest: CONTRACT },
      { intent: SAMPLE_CASE, step: 'dialogue/ask', requestShape: SHAPE }, OPENCODE_GO_ROUTE_PROFILE, 'deepseek-v4-flash', ENDPOINT,
      { method: 'POST', headers: {}, body: '{"q":1}' });
    expect(cache.lines).toMatchObject([{ itemId: 'S17c/dialogue/1', outcome: 'failed', status: 429, classification: 'quota-exhausted', incurredUsage: { inputTokens: 3, outputTokens: 2 } }]);
    expect(await cache.readClaim(claimKey('{"q":1}'))).toMatchObject({ state: 'failed' });
    await transmitOnce(cache, modelFetch(calls), { purpose: 'dialogue', slice: 'S17c', promptContractDigest: CONTRACT },
      { intent: SAMPLE_CASE, step: 'dialogue/ask', requestShape: SHAPE }, OPENCODE_GO_ROUTE_PROFILE, 'deepseek-v4-flash', ENDPOINT,
      { method: 'POST', headers: {}, body: '{"q":1}' });
    expect(calls).toHaveLength(2);
  });

  it('retains an aborted or rejected fetch across restart and freshly minted input identities', async () => {
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const calls: string[] = [];
    const aborted: LiveModelFetch = async (_url, init) => { calls.push(init.body); throw new Error('connection closed after send'); };
    await expect(call(await opened(), aborted, body)).rejects.toThrow('connection closed');
    const reopened = await opened();
    expect(modelLines(reopened)[0]).toMatchObject({ classification: 'outcome-unknown', incurredUsage: null });
    expect(await refusal(call(reopened, modelFetch(calls), unitBody(BLOCK_B, '雨落在旧城。', 'e'), {
      intent: { ...SAMPLE_CASE, case: 'renamed-case' }, step: 'reanalyze-book/unit-1/turn-2',
    }))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(1);
  });

  it('keeps a surviving unknown ledger record authoritative when its claim file is lost', async () => {
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const calls: string[] = [];
    await call(await opened(), dropped(calls), body);
    await rm(join(root, PROVIDER_CLAIM_DIRECTORY, `${claimKey(body)}.json`));
    const reminted = unitBody(BLOCK_B, '雨落在旧城。', 'e');
    expect(await refusal(call(await opened(), modelFetch(calls), reminted))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(1);
    const intent: DevelopmentValidationIntent = { ...SAMPLE_CASE, delta: { kind: 'retry-unknown', rationale: 'verified-gateway-recovery' } };
    await call(await opened(), dropped(calls), reminted, { intent });
    await rm(join(root, PROVIDER_CLAIM_DIRECTORY, `${claimKey(reminted)}.json`));
    expect(await refusal(call(await opened(), modelFetch(calls), reminted, { intent }))).toBe('PROVIDER_VALIDATION_RETRY_SPENT');
    expect(calls).toHaveLength(2);
  });

  it('does not turn a legacy unknown ledger item with no cached response into a fresh request', async () => {
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    await writeFile(join(root, PROVIDER_LEDGER_FILE), JSON.stringify({
      itemId: 'S40/first-baseline/1', purpose: 'first-baseline', model: 'deepseek-v4-flash', promptContractDigest: CONTRACT,
      requestDigest: providerRequestDigest(body), outcome: 'failed', status: 200, classification: 'outcome-unknown',
      usage: null, recordedAt: '2026-09-06T00:00:00.000Z',
    }) + '\n');
    const calls: string[] = [];
    expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(0);
  });

  it.each(['entry', 'claim', 'ledger', 'entry-and-claim', 'ledger-and-claim', 'corrupt-ledger', 'corrupt-claim'])(
    'recovers a completed capture with %s loss only from surviving verified provenance', async (damage) => {
      const cache = await opened();
      const calls: string[] = [];
      const body = unitBody(BLOCK_A, '雨落在旧城。');
      await call(cache, modelFetch(calls), body);
      const line = modelLines(cache)[0]!;
      const entry = join(root, PROVIDER_CACHE_DIRECTORY, `${line.cacheKey}.json`);
      const claim = join(root, PROVIDER_CLAIM_DIRECTORY, `${claimKey(body)}.json`);
      const ledger = join(root, PROVIDER_LEDGER_FILE);
      if (damage === 'entry' || damage === 'entry-and-claim') await rm(entry);
      if (damage === 'claim' || damage.endsWith('-and-claim')) await rm(claim);
      if (damage === 'ledger' || damage === 'ledger-and-claim') await rm(ledger);
      if (damage === 'corrupt-ledger') await writeFile(ledger, '{torn');
      if (damage === 'corrupt-claim') await writeFile(claim, '{torn');
      if (damage === 'corrupt-ledger') {
        await expect(opened()).rejects.toMatchObject({ code: 'PROVIDER_LEDGER_CORRUPT' });
      } else if (damage === 'entry' || damage.endsWith('-and-claim')) {
        expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_EVIDENCE_UNAVAILABLE');
      } else {
        expect((await call(await opened(), modelFetch(calls), body)).replayed).toBe(true);
      }
      expect(calls).toHaveLength(1);
    },
  );

  it('retains an unknown claim after ledger loss and does not release it through invalidation', async () => {
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    await call(await opened(), dropped(calls), body);
    await rm(join(root, PROVIDER_LEDGER_FILE));
    const cache = await opened();
    await cache.invalidate({ family: SAMPLE_CASE.family, case: SAMPLE_CASE.case }, 'question-revised-after-timeout');
    expect(await refusal(call(cache, modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(1);
  });

  it('does not replay tampered or transplanted JSON entries and does not resend after complete cache loss', async () => {
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    const cache = await opened();
    const calls: string[] = [];
    await call(cache, modelFetch(calls), body);
    const key = modelLines(cache)[0]!.cacheKey!;
    const path = join(root, PROVIDER_CACHE_DIRECTORY, `${key}.json`);
    const raw = await readFile(path, 'utf8');
    for (const changed of [
      { response: { choices: [] } }, { route: 'another-route' }, { requestBody: '{}' }, { responseDigest: 'f'.repeat(64) },
      { itemId: null }, { generation: 'f'.repeat(64) }, { usage: { inputTokens: -3, outputTokens: 2 } },
    ]) {
      await writeFile(path, JSON.stringify({ ...JSON.parse(raw), ...changed }), 'utf8');
      expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    }
    await rm(path);
    await rm(join(root, PROVIDER_LEDGER_FILE));
    expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(1);
  });

  it('invalidates exact replay when the prompt generation changes even when the bytes are identical', async () => {
    const cache = await opened();
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    await call(cache, modelFetch(calls), body);
    expect((await call(cache, modelFetch(calls), body, { contract: 'b'.repeat(64) })).replayed).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(modelLines(cache).at(-1)).toMatchObject({ validation: { decision: 'config-delta', changed: ['promptContractDigest'] } });
  });

  it('does not turn renamed cases, modes or retry turns into a new validation purpose', async () => {
    const cache = await opened();
    const calls: string[] = [];
    await call(cache, modelFetch(calls), unitBody(BLOCK_A, '雨落在旧城。'));
    expect(await refusal(call(cache, modelFetch(calls), unitBody(BLOCK_B, '另一部稿件。'), {
      intent: { family: 'renamed-family', case: 'renamed-case', delta: null }, step: 'reanalyze-book/unit-1/turn-2',
    }))).toBe('PROVIDER_VALIDATION_SIMILAR_EVIDENCE');
    expect(calls).toHaveLength(1);
  });

  it('keeps distinct concurrent captures under distinct immutable item identities', async () => {
    const calls: string[] = [];
    await Promise.all([
      call(await opened(), modelFetch(calls), unitBody(BLOCK_A, '雨落在旧城。')),
      call(await opened(), modelFetch(calls), unitBody(BLOCK_B, '风吹过河岸。'), { step: 'first-baseline/unit-2' }),
    ]);
    const lines = modelLines(await opened());
    expect(calls).toHaveLength(2);
    expect(new Set(lines.map((line) => line.itemId)).size).toBe(2);
    for (const line of lines) expect(await (await opened()).readEntry(line.cacheKey!)).toMatchObject({ entry: { itemId: line.itemId } });
  });

  it('retires a capture invalidated while in flight even when its ledger line settles later', async () => {
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    let started!: () => void;
    const sent = new Promise<void>((resolveSent) => { started = resolveSent; });
    let finish!: () => void;
    const waiting = new Promise<void>((resolveWait) => { finish = resolveWait; });
    const pending = call(await opened(), async (url, init) => {
      started(); await waiting; return modelFetch(calls)(url, init);
    }, body);
    await sent;
    await (await opened()).invalidate({ family: SAMPLE_CASE.family, case: SAMPLE_CASE.case }, 'question-revised-during-capture');
    finish(); await pending;
    const next = await call(await opened(), modelFetch(calls), body);
    expect(next.replayed).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect((await call(await opened(), modelFetch(calls), body)).replayed).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('atomically excludes real competing processes and never steals a live claim for retry', async () => {
    const file = join(root, 'synthetic-claim-child.mjs');
    // Bundle the actual owner, then coordinate children through IPC. No sockets, Provider or external input.
    await build({ stdin: { contents: `
      import { ProviderResultCache } from './src/service/provider/provider-result-cache.ts';
      import { transmitOnce } from './src/service/provider/live-transmission.ts';
      import { OPENCODE_GO_ROUTE_PROFILE } from './src/service/provider/deepseek-adapter.ts';
      process.once('message', async ({ root, body, retry }) => {
        const cache = new ProviderResultCache(root); await cache.open();
        try {
          await transmitOnce(cache, async () => {
            process.send('sent'); await new Promise(resolve => process.once('message', resolve));
            return { status: 200, json: async () => ({ usage: { prompt_tokens: 3, completion_tokens: 2 } }) };
          }, { purpose: 'first-baseline', promptContractDigest: '${CONTRACT}' }, {
            intent: { family: 'baseline-analysis', case: 'sample1-whole-book', delta: retry ? { kind: 'retry-unknown', rationale: 'gateway-dropped-the-answer' } : null },
            step: 'first-baseline/unit-1', requestShape: '${SHAPE}'
          }, OPENCODE_GO_ROUTE_PROFILE, 'deepseek-v4-flash', '${ENDPOINT}', { method: 'POST', headers: {}, body });
          process.send('done');
        } catch (error) { process.send(error.code ?? 'failed'); }
        process.disconnect();
      });`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: file, logLevel: 'silent' });
    const children: ReturnType<typeof spawn>[] = [];
    const launch = () => {
      const child = spawn(process.execPath, [file], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      children.push(child);
      const messages: unknown[] = [];
      const waiters: Array<(value: unknown) => void> = [];
      child.on('message', (value) => { const next = waiters.shift(); if (next) next(value); else messages.push(value); });
      const exited = new Promise<number | null>((resolveExit) => child.once('exit', resolveExit));
      return { child, exited, next: () => messages.length ? Promise.resolve(messages.shift()) : new Promise((resolveMessage) => waiters.push(resolveMessage)) };
    };
    const body = unitBody(BLOCK_A, '雨落在旧城。');
    try {
      const first = launch();
      first.child.send!({ root, body, retry: false });
      expect(await first.next()).toBe('sent');
      const second = launch();
      second.child.send!({ root, body: unitBody(BLOCK_B, '雨落在旧城。', 'e'), retry: true });
      expect(await second.next()).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
      expect(await second.exited).toBe(0);
      // Kill the actual claimant after the simulated send but before any ledger/response settlement.
      first.child.kill();
      await first.exited;
      const automatic = launch();
      automatic.child.send!({ root, body, retry: false });
      expect(await automatic.next()).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
      expect(await automatic.exited).toBe(0);
      const deliberate = launch();
      deliberate.child.send!({ root, body, retry: true });
      expect(await deliberate.next()).toBe('sent');
      const competingRetry = launch();
      competingRetry.child.send!({ root, body, retry: true });
      expect(await competingRetry.next()).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
      expect(await competingRetry.exited).toBe(0);
      deliberate.child.send!('finish');
      expect(await deliberate.next()).toBe('done');
      expect(await deliberate.exited).toBe(0);
      const calls: string[] = [];
      expect((await call(await opened(), modelFetch(calls), body)).replayed).toBe(true);
      expect(calls).toHaveLength(0);
    } finally {
      await Promise.all(children.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>((resolveExit) => {
        child.once('exit', () => resolveExit()); child.kill();
      })));
    }
  });
});

describe('the semantic digest and the evidence generation', () => {
  it('ignores minted identities and nothing else', () => {
    const base = unitBody(BLOCK_A, '雨落在旧城。');
    expect(providerSemanticDigest(unitBody(BLOCK_B, '雨落在旧城。', 'e'))).toBe(providerSemanticDigest(base));
    expect(providerSemanticDigest(unitBody(BLOCK_A, '雨落在旧城！'))).not.toBe(providerSemanticDigest(base));
    expect(providerSemanticDigest(base.replace('1/7', '2/7'))).not.toBe(providerSemanticDigest(base));
    const namespace = { route: 'opencode-go', endpoint: ENDPOINT, requestShape: SHAPE, model: 'deepseek-v4-flash' };
    expect(providerEvidenceGeneration(namespace, CONTRACT)).not.toBe(providerEvidenceGeneration({ ...namespace, model: 'deepseek-v4.1-flash' }, CONTRACT));
    expect(providerCacheKey(namespace, CONTRACT)).not.toBe(legacyProviderCacheKey('deepseek-v4-flash', CONTRACT));
  });

  it('preserves literal manuscript identities and block-reference relationships while ignoring JSON formatting', () => {
    const literal = randomUUID();
    const base = unitBody(BLOCK_A, `密码示例 ${literal}，摘要 ${'a'.repeat(64)}。`);
    expect(providerSemanticDigest(base.replace(literal, randomUUID()))).not.toBe(providerSemanticDigest(base));
    expect(providerSemanticDigest(base.replace(`摘要 ${'a'.repeat(64)}`, `摘要 ${'b'.repeat(64)}`))).not.toBe(providerSemanticDigest(base));
    expect(providerSemanticDigest(JSON.stringify(JSON.parse(base), null, 2))).toBe(providerSemanticDigest(base));
    const sameBlock = unitBody(BLOCK_A, `第一行\n[${BLOCK_A}] 第二行`);
    const anotherBlock = unitBody(BLOCK_A, `第一行\n[${BLOCK_B}] 第二行`);
    expect(providerSemanticDigest(sameBlock)).not.toBe(providerSemanticDigest(anotherBlock));
  });
});

describe('the ledger across slices and kinds', () => {
  function foreignModel(body = unitBody(BLOCK_A, 'synthetic ledger question')): ProviderLedgerLine {
    const namespace = { route: 'opencode-go', endpoint: ENDPOINT, requestShape: SHAPE, model: 'deepseek-v4-flash' };
    const requestDigest = providerRequestDigest(body);
    const semanticDigest = providerSemanticDigest(body);
    return {
      itemId: 'Future7/first-baseline/1', purpose: 'first-baseline', ...namespace,
      promptContractDigest: CONTRACT, requestDigest, semanticDigest,
      cacheKey: providerCacheKey(namespace, requestDigest), claimKey: providerCacheKey(namespace, semanticDigest),
      generation: providerEvidenceGeneration(namespace, CONTRACT), evidencePosition: 0,
      outcome: 'transmitted', status: 200, usage: { inputTokens: 3, outputTokens: 2 },
      validation: { ...SAMPLE_CASE, step: 'first-baseline/unit-1', decision: 'first-capture', evidence: [] },
      recordedAt: '2026-10-08T00:00:00.000Z',
    };
  }

  async function ledger(...lines: unknown[]): Promise<void> {
    await writeFile(join(root, PROVIDER_LEDGER_FILE), lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
  }

  function foreignTool(): ProviderToolLedgerLine {
    return { itemId: 'Future7/search/1', kind: 'search-call', purpose: 'search', argumentsDigest: CONTRACT, host: 'search.invalid',
      outcome: 'transmitted', status: 200, resultDigest: CONTRACT, resultBytes: 10, elapsedMs: 0.5, recordedAt: '2026-10-08T00:00:00.000Z' };
  }

  it.each([undefined, 'model-call'] as const)('admits foreign model metadata with kind %s without granting positive evidence', async (kind) => {
    await ledger({ ...foreignModel(), kind });
    const cache = await opened();
    expect(cache.lines).toHaveLength(1);
    expect(await cache.validEvidence()).toEqual([]);
    expect(cache.foreignRows).toEqual([{ position: 0, itemId: 'Future7/first-baseline/1', kind: 'model-call', outcome: 'transmitted' }]);
  });

  it('holds foreign transmission history even when a supported entry and completed claim would otherwise replay', async () => {
    const cache = await opened();
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, 'synthetic ledger question');
    await call(cache, modelFetch(calls), body);
    await ledger({ ...modelLines(cache)[0]!, itemId: 'Future7/first-baseline/1' });
    expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(1);
  });

  it.each(['transmitted', 'unknown'] as const)('holds matching foreign %s history with no entry or claim before any send', async (outcome) => {
    const line = foreignModel();
    await ledger(outcome === 'unknown' ? { ...line, outcome: 'failed', classification: 'outcome-unknown', usage: null } : line);
    const cache = await opened();
    const calls: string[] = [];
    const body = unitBody(BLOCK_B, 'synthetic ledger question', 'e');
    expect(await refusal(call(cache, modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(0);
    expect((await readdir(join(root, PROVIDER_CLAIM_DIRECTORY))).filter((name) => !name.startsWith('item-'))).toEqual([]);
    expect(refusalLines(cache).at(-1)).toEqual(['PROVIDER_VALIDATION_OUTCOME_UNKNOWN', [line.itemId]]);
  });

  it('preserves all nonempty positions and foreign invalidations, including an in-flight retirement', async () => {
    const foreign = foreignModel();
    const invalidation = { kind: 'invalidation', target: { itemId: foreign.itemId }, reason: 'question-revised', recordedAt: foreign.recordedAt };
    const known = { ...foreign, itemId: 'S40/first-baseline/1', evidencePosition: 4 };
    const rows = [foreign, foreignTool(), invalidation, invalidation,
      { ...invalidation, target: { family: SAMPLE_CASE.family, case: SAMPLE_CASE.case } }, known];
    const raw = '\n \n' + rows.map((row) => JSON.stringify(row)).join('\n\n') + '\n';
    await writeFile(join(root, PROVIDER_LEDGER_FILE), raw);
    const cache = await opened();
    expect(cache.lines).toEqual(rows);
    expect(cache.foreignRows.map(({ position, kind, outcome }) => ({ position, kind, outcome }))).toEqual([
      { position: 0, kind: 'model-call', outcome: 'transmitted' }, { position: 1, kind: 'search-call', outcome: 'transmitted' },
      { position: 2, kind: 'invalidation', outcome: null }, { position: 3, kind: 'invalidation', outcome: null },
    ]);
    expect(cache.isRetired(known.itemId, { family: SAMPLE_CASE.family, case: SAMPLE_CASE.case,
      capturedAt: known.recordedAt, evidencePosition: known.evidencePosition })).toBe(true);
    expect(await cache.validEvidence()).toEqual([]);
    expect(await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8')).toBe(raw);
  });

  it('bounds foreign report counts and identity length without exposing other row fields or changing storage', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...foreignTool(), itemId: `${'F'.repeat(170)}/search/${index + 1}` }));
    await ledger(...rows);
    const cache = await opened();
    expect(cache.lines).toHaveLength(101);
    expect(cache.foreignRows).toHaveLength(100);
    expect(cache.foreignRows.every((row) => row.itemId.length === 160 && Object.keys(row).sort().join(',') === 'itemId,kind,outcome,position')).toBe(true);
  });

  it.each(['S40', 'Future7'])('rejects duplicate non-stale #808 model-call identities in %s', async (slice) => {
    const model = { ...foreignModel(), itemId: `${slice}/same/1` };
    await ledger(model, model);
    await expect(opened()).rejects.toMatchObject({ code: 'PROVIDER_LEDGER_CORRUPT' });
  });

  it.each(['S40', 'Future7'])('keeps %s tool and pre-#808 duplicate identities readable, since only #808 model calls reserve theirs', async (slice) => {
    const model = { ...foreignModel(), itemId: `${slice}/same/1` };
    const { route: _route, endpoint: _endpoint, requestShape: _shape, cacheKey: _cacheKey, claimKey: _claimKey, semanticDigest: _semantic,
      generation: _generation, evidencePosition: _position, validation: _validation, ...legacy } = model;
    const tool = { ...foreignTool(), itemId: model.itemId };
    await ledger(model, tool, tool, legacy, legacy);
    expect((await opened()).lines).toEqual([model, tool, tool, legacy, legacy]);
  });

  it('keeps explicit stale history readable and allocates past every stale ordinal', async () => {
    const model = { ...foreignModel(), itemId: 'S40/first-baseline/1' };
    const stale = { ...model, outcome: 'failed', stale: true, usage: null, status: null };
    await ledger(model, stale, { ...stale, itemId: 'S40/first-baseline/9' }, { ...stale, itemId: 'Future7/first-baseline/1' });
    const cache = await opened();
    expect(cache.lines).toHaveLength(4);
    expect(cache.nextItemId('first-baseline')).toBe('S40/first-baseline/10');
    expect(() => cache.claimItem(model.itemId)).toThrowError();
    expect(() => cache.claimItem('S40/first-baseline/9')).not.toThrow();
  });

  it.each([
    ['item grammar', { itemId: 'Future_7/test/1' }], ['ordinal zero', { itemId: 'Future7/test/0' }],
    ['item type', { itemId: ['Future7/first-baseline/1'] }],
    ['ordinal limit', { itemId: 'Future7/test/1000000' }], ['kind', { kind: 'shell' }], ['outcome', { outcome: 'maybe' }],
    ['timestamp', { recordedAt: 'invalid' }], ['stale', { stale: 'true' }], ['status', { status: '200' }],
    ['negative status', { status: -1 }], ['status range', { status: 600 }],
    ['usage', { usage: { inputTokens: -1, outputTokens: 2 } }], ['incurred usage', { incurredUsage: { inputTokens: 1 } }],
    ['model', { model: null }], ['prompt digest', { promptContractDigest: 'wrong' }], ['request digest', { requestDigest: 'wrong' }],
    ['task digest', { taskPromptContractDigest: 'wrong' }], ['semantic digest', { semanticDigest: 'wrong' }],
    ['response digest shape', { responseDigest: 'wrong' }], ['cache key shape', { cacheKey: 'wrong' }],
    ['cache key relation', { cacheKey: 'b'.repeat(64) }], ['claim key relation', { claimKey: 'b'.repeat(64) }],
    ['generation relation', { generation: 'b'.repeat(64) }], ['task generation relation', { taskPromptContractDigest: 'b'.repeat(64) }],
    ['namespace key relation', { route: 'different-route' }], ['namespace required for key', { endpoint: undefined }],
    ['namespace type', { requestShape: 1 }], ['classification', { classification: 'unknown' }], ['reset window', { resetWindow: 1 }],
    ['captured timestamp', { capturedAt: 'invalid' }], ['evidence scope', { evidenceScope: 'foreign' }],
    ['future evidence position', { evidencePosition: 1 }], ['fractional evidence position', { evidencePosition: 0.5 }],
    ['negative evidence position', { evidencePosition: -1 }], ['validation', { validation: null }],
    ['validation decision', { validation: { ...SAMPLE_CASE, step: 'unit-1', decision: 'maybe', evidence: [] } }],
    ['validation evidence', { validation: { ...SAMPLE_CASE, step: 'unit-1', decision: 'first-capture', evidence: ['bad-id'] } }],
    ['validation delta', { validation: { ...SAMPLE_CASE, delta: { kind: 'config', rationale: 'test' }, step: 'unit-1', decision: 'first-capture', evidence: [] } }],
    ['validation changed', { validation: { ...SAMPLE_CASE, step: 'unit-1', decision: 'config-delta', evidence: [], changed: [1] } }],
    ['validation refusal', { validation: { ...SAMPLE_CASE, step: 'unit-1', decision: 'refused', evidence: [], refusal: 1 } }],
  ] as const)('rejects malformed foreign model metadata: %s', async (_name, patch) => {
    await ledger({ ...foreignModel(), ...patch });
    await expect(opened()).rejects.toMatchObject({ code: 'PROVIDER_LEDGER_CORRUPT' });
  });

  it.each(['requestDigest', 'promptContractDigest'] as const)('rejects a non-string required %s even without foreign identity keys', async (field) => {
    const line = foreignModel();
    await ledger({ ...line, cacheKey: undefined, claimKey: undefined, generation: undefined, [field]: [line[field]] });
    expect(await refusal(opened())).toBe('PROVIDER_LEDGER_CORRUPT');
  });

  it.each([
    ['tool outcome', { outcome: 'refused' }], ['tool timestamp', { recordedAt: 'invalid' }], ['tool status', { status: 0.5 }],
    ['tool status range', { status: -1 }],
    ['argument digest', { argumentsDigest: 'wrong' }], ['host', { host: null }], ['result digest', { resultDigest: 'wrong' }],
    ['result size', { resultBytes: -1 }], ['fractional size', { resultBytes: 0.5 }], ['missing size', { resultBytes: undefined }],
    ['elapsed time', { elapsedMs: -1 }], ['missing time', { elapsedMs: undefined }],
  ] as const)('rejects malformed foreign tool metadata: %s', async (_name, patch) => {
    await ledger({ ...foreignTool(), ...patch });
    await expect(opened()).rejects.toMatchObject({ code: 'PROVIDER_LEDGER_CORRUPT' });
  });

  it.each(['invalid', null])('rejects malformed foreign invalidation timestamps: %s', async (recordedAt) => {
    await ledger({ kind: 'invalidation', target: { itemId: 'Future7/search/1' }, reason: 'question-revised', recordedAt });
    await expect(opened()).rejects.toMatchObject({ code: 'PROVIDER_LEDGER_CORRUPT' });
  });

  it('reads legacy foreign model rows and nullable fetch results without claiming their response digest is verified', async () => {
    const { route, endpoint, requestShape, cacheKey, claimKey, generation, semanticDigest, ...legacy } = foreignModel();
    await ledger({ ...legacy, responseDigest: 'b'.repeat(64) }, { ...foreignTool(), kind: 'fetch',
      outcome: 'failed', status: null, resultDigest: null, resultBytes: null, elapsedMs: null });
    expect((await opened()).foreignRows.map((row) => row.kind)).toEqual(['model-call', 'fetch']);
  });

  it.each(['transmitted', 'unknown'] as const)('holds legacy foreign %s history without storage or namespace', async (outcome) => {
    const { route, endpoint, requestShape, cacheKey, claimKey, generation, semanticDigest, ...legacy } = foreignModel();
    await ledger({ ...legacy, ...(outcome === 'unknown' ? { outcome: 'failed', classification: 'outcome-unknown' } : {}) });
    const calls: string[] = [];
    expect(await refusal(call(await opened(), modelFetch(calls), unitBody(BLOCK_A, 'synthetic ledger question')))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(0);
  });

  it.each([false, true])('matches foreign history without a cache key using recorded namespace facts (different route: %s)', async (differentRoute) => {
    const line = foreignModel();
    await ledger({ ...line, route: differentRoute ? 'different-route' : line.route,
      cacheKey: undefined, claimKey: undefined, generation: undefined });
    const calls: string[] = [];
    const result = await refusal(call(await opened(), modelFetch(calls), unitBody(BLOCK_B, 'synthetic ledger question', 'e')));
    expect(result).toBe(differentRoute ? 'sent' : 'PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(differentRoute ? 1 : 0);
  });

  it.each(['route', 'endpoint', 'requestShape'] as const)('does not hold an unrelated foreign unknown with no cache key and a different %s', async (field) => {
    const line = foreignModel();
    await ledger({ ...line, [field]: 'different-configuration', cacheKey: undefined, claimKey: undefined, generation: undefined,
      outcome: 'failed', classification: 'outcome-unknown' });
    const cache = await opened();
    const calls: string[] = [];
    expect(await refusal(call(cache, modelFetch(calls), unitBody(BLOCK_A, 'synthetic ledger question')))).toBe('sent');
    expect(calls).toHaveLength(1);
    expect(await cache.validEvidence()).toHaveLength(1);
  });

  it.each(['item', 'family', 'stale'] as const)('releases retired foreign transmitted history through %s retirement', async (retirement) => {
    const line = foreignModel();
    await ledger({ ...line, ...(retirement === 'stale' ? { stale: true } : {}) });
    const cache = await opened();
    if (retirement !== 'stale') await ledger(line, { kind: 'invalidation',
      target: retirement === 'item' ? { itemId: line.itemId } : { family: SAMPLE_CASE.family, case: SAMPLE_CASE.case },
      reason: 'question-revised', recordedAt: line.recordedAt });
    const calls: string[] = [];
    expect((await call(cache, modelFetch(calls), unitBody(BLOCK_A, 'synthetic ledger question'))).replayed).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(modelLines(cache).at(-1)?.itemId).toBe('S40/first-baseline/1');
  });

  it('never releases foreign unknown history through retirement or a declared retry', async () => {
    const line = { ...foreignModel(), outcome: 'failed', classification: 'outcome-unknown', stale: true };
    await ledger(line, { kind: 'invalidation', target: { itemId: line.itemId }, reason: 'question-revised', recordedAt: line.recordedAt });
    const calls: string[] = [];
    const intent: DevelopmentValidationIntent = { ...SAMPLE_CASE, delta: { kind: 'retry-unknown', rationale: 'sender-confirmed-stopped' } };
    expect(await refusal(call(await opened(), modelFetch(calls), unitBody(BLOCK_A, 'synthetic ledger question'), { intent }))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(0);
  });

  it.each(['request', 'route', 'endpoint', 'requestShape', 'model', 'tool'] as const)('does not block a supported request with unrelated foreign %s history', async (difference) => {
    const line = foreignModel();
    const namespace = { route: line.route!, endpoint: line.endpoint!, requestShape: line.requestShape!, model: line.model,
      ...(['route', 'endpoint', 'requestShape', 'model'].includes(difference) ? { [difference]: 'different-configuration' } : {}) };
    await ledger(difference === 'request' ? foreignModel(unitBody(BLOCK_A, 'unrelated synthetic question')) : difference === 'tool' ? foreignTool() :
      { ...line, ...namespace, cacheKey: providerCacheKey(namespace, line.requestDigest), claimKey: providerCacheKey(namespace, line.semanticDigest!),
        generation: providerEvidenceGeneration(namespace, CONTRACT), classification: 'outcome-unknown' });
    const cache = await opened();
    const calls: string[] = [];
    await call(cache, modelFetch(calls), unitBody(BLOCK_A, 'synthetic ledger question'));
    expect(calls).toHaveLength(1);
    expect(await cache.validEvidence()).toHaveLength(1);
  });

  it('rejects every foreign mutation while retaining known-only claims, settlements and entries', async () => {
    const cache = await opened();
    const foreign = foreignModel();
    const facts = { cacheKey: foreign.claimKey!, itemId: foreign.itemId, claimedAt: foreign.recordedAt, family: SAMPLE_CASE.family,
      case: SAMPLE_CASE.case, step: 'first-baseline/unit-1' };
    expect(() => cache.nextItemId('first-baseline', 'Future7' as never)).toThrowError();
    await expect(cache.reserveItemId('first-baseline', 'Future7' as never)).rejects.toMatchObject({ code: 'PROVIDER_TEST_ITEM_INVALID' });
    expect(() => cache.claimItem(foreign.itemId)).toThrowError();
    for (const mutation of [() => cache.record(foreign), () => cache.claim(facts), () => cache.holdUnknown(facts),
      () => cache.settle(facts, 'completed'), () => cache.settle(facts, 'failed')]) {
      await expect(mutation()).rejects.toMatchObject({ code: 'PROVIDER_TEST_ITEM_INVALID' });
    }
    await expect(cache.invalidate({ itemId: foreign.itemId }, 'question-revised')).rejects.toMatchObject({ code: 'PROVIDER_INVALIDATION_INVALID' });
    const entry: ProviderCacheEntry & { cacheKey: string } = { itemId: foreign.itemId, cacheKey: foreign.cacheKey!, model: foreign.model,
      requestBody: '{}', requestDigest: providerRequestDigest('{}'), status: 200, response: {}, usage: null, transmittedAt: foreign.recordedAt };
    await expect(cache.keep(entry)).rejects.toMatchObject({ code: 'PROVIDER_TEST_ITEM_INVALID' });
    await expect(cache.store(entry)).rejects.toMatchObject({ code: 'PROVIDER_TEST_ITEM_INVALID' });
    expect(await readdir(join(root, PROVIDER_CLAIM_DIRECTORY))).toEqual([]);
    expect(await readdir(join(root, PROVIDER_CACHE_DIRECTORY))).toEqual([]);
    expect(cache.lines).toEqual([]);
    const calls: string[] = [];
    await call(cache, modelFetch(calls), unitBody(BLOCK_A, 'known synthetic question'));
    const known = modelLines(cache)[0]!;
    expect(known.itemId).toBe('S40/first-baseline/1');
    expect((await cache.readEntry(known.cacheKey!)).state).toBe('present');
    expect((await cache.readClaim(known.claimKey!)).state).toBe('completed');
  });

  it('does not replay a transplanted foreign entry even when no foreign ledger row survives', async () => {
    const cache = await opened();
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, 'known synthetic question');
    await call(cache, modelFetch(calls), body);
    const entryPath = join(root, PROVIDER_CACHE_DIRECTORY, `${modelLines(cache)[0]!.cacheKey}.json`);
    const entry = JSON.parse(await readFile(entryPath, 'utf8')) as ProviderCacheEntry;
    await writeFile(entryPath, JSON.stringify({ ...entry, itemId: 'Future7/first-baseline/1' }));
    await ledger();
    expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_OUTCOME_UNKNOWN');
    expect(calls).toHaveLength(1);
  });

  it('keeps a supported capture/ledger mismatch classified as unavailable evidence', async () => {
    const cache = await opened();
    const calls: string[] = [];
    const body = unitBody(BLOCK_A, 'known synthetic question');
    await call(cache, modelFetch(calls), body);
    await ledger({ ...modelLines(cache)[0]!, generation: 'b'.repeat(64) });
    expect(await refusal(call(await opened(), modelFetch(calls), body))).toBe('PROVIDER_VALIDATION_EVIDENCE_UNAVAILABLE');
    expect(calls).toHaveLength(1);
  });

  it('reads every line it already carries, names only the closed slice set, and counts model calls apart from tools', async () => {
    const legacy = { itemId: 'S40/smoke/1', purpose: 'smoke', model: 'm', promptContractDigest: CONTRACT, requestDigest: CONTRACT, outcome: 'transmitted', status: 200, usage: null, recordedAt: '2026-09-06T00:00:00.000Z' };
    const tool = { itemId: 'S87/factual-review/1', kind: 'search-call', purpose: 'factual-review', argumentsDigest: CONTRACT, host: 'search.parallel.ai', outcome: 'transmitted', status: 200, resultDigest: CONTRACT, resultBytes: 10, elapsedMs: 5, recordedAt: '2026-10-08T00:00:00.000Z' };
    await writeFile(join(root, PROVIDER_LEDGER_FILE), `${JSON.stringify(legacy)}\n${JSON.stringify(tool)}\n`, 'utf8');
    const cache = new ProviderResultCache(root);
    await cache.open();
    expect(cache.lines.filter(isItemLine).map((line) => line.itemId)).toEqual(['S40/smoke/1', 'S87/factual-review/1']);
    expect(cache.counts()).toEqual({ transmitted: 1, replayed: 0, failed: 0 });
    expect(cache.toolCounts('search-call')).toEqual({ transmitted: 1, replayed: 0, failed: 0 });
    expect(cache.toolCounts('fetch')).toEqual({ transmitted: 0, replayed: 0, failed: 0 });
    expect(cache.nextItemId('smoke')).toBe('S40/smoke/2');
    expect(cache.nextItemId('factual-review', 'S87')).toBe('S87/factual-review/2');
    expect(cache.nextItemId('factual-review')).toBe('S40/factual-review/1');
    // 生成来源译文's items name their own slice (Issue #892).
    expect(cache.nextItemId('material-translation', 'S80')).toBe('S80/material-translation/1');
    expect(() => cache.claimItem('S87/factual-review/1')).toThrowError(/Provider Test Ledger/u);
    expect(() => cache.claimItem('S41/smoke/1')).toThrowError(/<slice>/u);
    expect(() => cache.nextItemId('smoke', 'S41' as never)).toThrowError(/切片/u);
    await writeFile(join(root, PROVIDER_LEDGER_FILE), `${JSON.stringify({ ...tool, kind: 'shell' })}\n`, 'utf8');
    await expect(new ProviderResultCache(root).open()).rejects.toMatchObject({ code: 'PROVIDER_LEDGER_CORRUPT' });
  });
});

const SEARCH_ORIGIN = 'parallel@search.parallel.ai';

describe('platformToolCallOnce', () => {
  async function opened(): Promise<{ cache: ProviderResultCache; snapshots: ResearchSnapshotCache }> {
    const cache = new ProviderResultCache(root);
    await cache.open();
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    return { cache, snapshots };
  }

  it('sends a call once under an S87 item, keeps its snapshot, and answers the identical call from it', async () => {
    const { cache, snapshots } = await opened();
    const bytes = new TextEncoder().encode('{"result":"x"}');
    let sent = 0;
    let authorized = 0;
    const call = {
      authorize: () => { authorized += 1; return 'ok' as const; },
      send: async () => {
        sent += 1;
        return { url: 'https://search.parallel.ai/mcp', status: 200, contentType: 'application/json', bytes, text: '结果' };
      },
    };
    const item = { kind: 'search-call' as const, purpose: 'factual-review', argumentsDigest: 'b'.repeat(64), host: 'search.parallel.ai', origin: SEARCH_ORIGIN };
    let clock = 1_000;
    const first = await platformToolCallOnce(cache, snapshots, item, call, () => (clock += 7));
    expect(first).toMatchObject({ replayed: false, status: 200, snapshot: { text: '结果', url: 'https://search.parallel.ai/mcp', responseBytes: bytes.byteLength } });
    const again = await platformToolCallOnce(cache, new ResearchSnapshotCache(root), item, call);
    expect(again).toMatchObject({ replayed: true, snapshot: { text: '结果' } });
    expect(sent).toBe(1);
    // A replay authorizes nothing: no ticket is redeemed for a call that sends nothing.
    expect(authorized).toBe(1);
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(cache.lines).toMatchObject([
      { itemId: 'S87/factual-review/1', kind: 'search-call', outcome: 'transmitted', host: 'search.parallel.ai', resultDigest: digest, resultBytes: bytes.byteLength, elapsedMs: 7 },
      { itemId: 'S87/factual-review/2', kind: 'search-call', outcome: 'replayed', resultDigest: digest },
    ]);
    expect(await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8')).not.toContain('结果');
    // Another service or host never replays this one's answer.
    expect(await snapshots.lookup('search-call', 'exa@mcp.exa.ai', item.argumentsDigest)).toBeNull();
    await platformToolCallOnce(cache, snapshots, { ...item, origin: 'exa@mcp.exa.ai' }, call);
    expect(sent).toBe(2);
  });

  it('claims no item and records nothing when the ticket does not redeem', async () => {
    const { cache, snapshots } = await opened();
    let sent = 0;
    const refused = platformToolCallOnce(cache, snapshots,
      { kind: 'fetch', purpose: 'factual-review', argumentsDigest: 'c'.repeat(64), host: 'example.org', origin: 'webfetch' },
      {
        authorize: () => { throw Object.assign(new Error('refused'), { code: 'PLATFORM_TOOL_TICKET_REFUSED' }); },
        send: async () => { sent += 1; return { url: 'https://example.org/', status: 200, contentType: null, bytes: new Uint8Array(0), text: 'x' }; },
      });
    await expect(refused).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(sent).toBe(0);
    expect(cache.lines).toEqual([]);
    expect(cache.nextItemId('factual-review', 'S87')).toBe('S87/factual-review/1');
  });

  it('records a sent call on the ledger even when its snapshot cannot be kept, and still hands back the answer', async () => {
    const { cache } = await opened();
    const failing = new ResearchSnapshotCache(root);
    failing.store = async () => { throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); };
    const bytes = new TextEncoder().encode('{"result":"x"}');
    const item = { kind: 'search-call' as const, purpose: 'factual-review', argumentsDigest: 'e'.repeat(64), host: 'search.parallel.ai', origin: SEARCH_ORIGIN };
    const settled = await platformToolCallOnce(cache, failing, item, {
      authorize: () => null,
      send: async () => ({ url: 'https://search.parallel.ai/mcp', status: 200, contentType: 'application/json', bytes, text: '结果' }),
    });
    expect(settled).toMatchObject({ replayed: false, kept: false, status: 200, snapshot: { text: '结果' } });
    expect(cache.lines).toMatchObject([{ itemId: 'S87/factual-review/1', kind: 'search-call', outcome: 'transmitted' }]);
    // The next reader of the ledger sees the item: it is never live again under the same id.
    const reread = new ProviderResultCache(root);
    await reread.open();
    expect(reread.nextItemId('factual-review', 'S87')).toBe('S87/factual-review/2');
  });

  it('keeps nothing from an unusable or failed call, and records it as failed', async () => {
    const { cache, snapshots } = await opened();
    const item = { kind: 'fetch' as const, purpose: 'factual-review', argumentsDigest: 'c'.repeat(64), host: 'example.org', origin: 'webfetch' };
    const unusable = await platformToolCallOnce(cache, snapshots, item,
      { authorize: () => null, send: async () => ({ url: 'https://example.org/', status: 404, contentType: null, bytes: new Uint8Array(0), text: null }) });
    expect(unusable).toMatchObject({ snapshot: null, status: 404, replayed: false });
    await expect(platformToolCallOnce(cache, snapshots, item, { authorize: () => null, send: async () => { throw new Error('boom'); } })).rejects.toThrowError('boom');
    expect(cache.lines.filter(isItemLine).map((line) => [line.itemId, line.outcome])).toEqual([['S87/factual-review/1', 'failed'], ['S87/factual-review/2', 'failed']]);
    expect(await snapshots.lookup('fetch', 'webfetch', item.argumentsDigest)).toBeNull();
  });

  it('keeps the shared ledger readable after two checkouts number different tool calls alike', async () => {
    // A tool id is numbered from each checkout's own view of the ledger, so both record S87/factual-review/1 (#1054 review).
    const first = await opened();
    const second = await opened();
    const bytes = new TextEncoder().encode('{}');
    const call = { authorize: () => null, send: async () => ({ url: 'https://example.org/', status: 200, contentType: 'application/json', bytes, text: '结果' }) };
    const item = (digest: string) => ({ kind: 'fetch' as const, purpose: 'factual-review', argumentsDigest: digest.repeat(64), host: 'example.org', origin: 'webfetch' });
    await platformToolCallOnce(first.cache, first.snapshots, item('b'), call);
    await platformToolCallOnce(second.cache, second.snapshots, item('c'), call);
    const reader = await opened();
    expect(reader.cache.lines.filter(isItemLine).map((line) => [line.itemId, line.outcome])).toEqual([
      ['S87/factual-review/1', 'transmitted'], ['S87/factual-review/1', 'transmitted'],
    ]);
  });
});

describe('ResearchSnapshotCache', () => {
  const snapshot = {
    kind: 'fetch' as const, origin: 'webfetch', argumentsDigest: 'd'.repeat(64), url: 'https://example.org/', retrievedAt: '2026-10-08T00:00:00.000Z',
    status: 200, contentType: 'text/plain', responseDigest: createHash('sha256').update('x').digest('hex'), responseBytes: 1,
    bodyBase64: Buffer.from('x').toString('base64'), text: 'x',
  };

  it('refuses to keep bytes that do not match their digest, and keeps nothing half-written', async () => {
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    await expect(snapshots.store({ ...snapshot, responseDigest: 'e'.repeat(64) })).rejects.toMatchObject({ code: 'RESEARCH_SNAPSHOT_DIGEST_MISMATCH' });
    await snapshots.store(snapshot);
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toEqual(snapshot);
    expect((await readdir(snapshots.root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(() => new ResearchSnapshotCache('relative')).toThrowError(/绝对路径/u);
  });

  it('reads a torn, tampered, or foreign entry as a miss, which the next store overwrites', async () => {
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    const path = snapshots.entryPath('fetch', 'webfetch', snapshot.argumentsDigest);
    await writeFile(path, '{"kind":"fetch","ori', 'utf8');
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await writeFile(path, JSON.stringify({ ...snapshot, bodyBase64: Buffer.from('y').toString('base64') }), 'utf8');
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await writeFile(path, JSON.stringify({ ...snapshot, text: 7 }), 'utf8');
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await writeFile(path, JSON.stringify({ ...snapshot, origin: 'other' }), 'utf8');
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await snapshots.store(snapshot);
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toEqual(snapshot);
    // An entry that cannot be read at all — here a directory in its place — is a miss too, and the next store replaces it.
    await rm(path, { force: true });
    await mkdir(join(path, 'occupant'), { recursive: true });
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await snapshots.store(snapshot);
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toEqual(snapshot);
  });
});
