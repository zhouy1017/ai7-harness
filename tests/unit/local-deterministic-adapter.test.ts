import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST, parseUnitResult, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { AI7_FAILURE_CODES, classifyModelFailure, evaluateRunBudgetCeiling } from '../../src/service/provider/classification.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { Ai7LocalDeterministicAdapter, ownBlockIdsOf, substituteBlockPlaceholders } from '../../src/service/provider/local-deterministic-adapter.js';
import { BASELINE_PROMPT_CONTRACT } from '../../src/service/analysis/contract.js';
import { ModelFixtureError, fixtureEntryKey, fixturePath, loadModelFixture, parseModelFixture, resolveFixtureEntry } from '../../src/service/provider/model-fixture.js';

// Fixtures (iii)–(v) are hand-written synthetic shapes consumed here only; their request digests are
// the deterministic function of the frozen prompt contract and a synthetic all-zero unit digest.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
const ZERO_UNIT_DIGEST = '0'.repeat(64);
const ZERO_UNIT_REQUEST_DIGEST = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 1, ZERO_UNIT_DIGEST);

function request(header = `分析单元 1/1 · 单元摘要 ${ZERO_UNIT_DIGEST}`): GenerateOptions {
  return {
    provider: LOCAL_DETERMINISTIC_ROUTE,
    model: LOCAL_DETERMINISTIC_MODEL,
    system: '合成系统提示。',
    messages: [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text: `${header}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。` }], source: { kind: 'user' } }],
  };
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('synthetic fixtures (iii)–(v)', () => {
  it('carry the exact request digest the contract derives for the synthetic unit', async () => {
    for (const identity of ['synthetic-quota-exceeded', 'synthetic-usage-ceiling', 'synthetic-interrupted']) {
      const fixture = await loadModelFixture(FIXTURES_ROOT, identity);
      expect(fixture.identity).toBe(identity);
      expect(fixture.lineage).toHaveLength(1);
      expect(fixture.entries.get(fixtureEntryKey(1, ZERO_UNIT_REQUEST_DIGEST))?.requestDigest).toBe(ZERO_UNIT_REQUEST_DIGEST);
      expect(fixture.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('(iii) replays an account-limit shape that classifies as a Provider Account Limit blocker', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(FIXTURES_ROOT, 'synthetic-quota-exceeded'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const chunks = await collect(adapter.stream(request()));
    expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'error', failure: { code: QUOTA_EXCEEDED_CODE, message: 'Insufficient Balance (synthetic fixture shape)', status: 402 } } }]);
    expect(classifyModelFailure({ code: QUOTA_EXCEEDED_CODE, message: '' }, codes)).toMatchObject({ signal: 'failed', failureClass: 'provider-account-limit' });
    expect(adapter.servedRequests).toBe(1);
  });

  it('(iv) replays a usage shape whose total reaches an explicit Run Budget Ceiling', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(FIXTURES_ROOT, 'synthetic-usage-ceiling'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const chunks = await collect(adapter.stream(request()));
    const usage = chunks.find((chunk) => chunk.type === 'usage');
    expect(usage).toEqual({ type: 'usage', usage: { inputTokens: 900_000, outputTokens: 120_000 } });
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } });
    const text = chunks.find((chunk) => chunk.type === 'block-end');
    expect(text?.type === 'block-end' && text.block.type === 'text' ? parseUnitResult(text.block.text, { unitOrdinal: 1, blockIds: [] }).ok : false).toBe(true);
    expect(evaluateRunBudgetCeiling([{ inputTokens: 900_000, outputTokens: 120_000 }], { kind: 'tokens', maxTotalTokens: 1_000_000 })).toMatchObject({ state: 'reached', overrunTokens: 20_000 });
    expect(evaluateRunBudgetCeiling([{ inputTokens: 900_000, outputTokens: 120_000 }], { kind: 'unset' })).toMatchObject({ state: 'not-evaluated' });
  });

  it('(v) replays an interruption shape classified interrupted', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(FIXTURES_ROOT, 'synthetic-interrupted'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const chunks = await collect(adapter.stream(request()));
    expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'aborted', failure: { code: AI7_FAILURE_CODES.INTERRUPTED, message: 'Synthetic interruption before the unit response completed.' } } }]);
    expect(classifyModelFailure({ code: AI7_FAILURE_CODES.INTERRUPTED, message: '' }, codes)).toMatchObject({ signal: 'interrupted', failureClass: 'interrupted' });
  });

  it('substitutes in-unit block placeholders from the unit message and leaves out-of-range ones for the contract', () => {
    const own1 = `blk_${'1'.repeat(24)}`;
    const own2 = `blk_${'2'.repeat(24)}`;
    const overlap = `blk_${'0'.repeat(24)}`;
    const message = [
      `分析单元 2/3 · 单元摘要 ${ZERO_UNIT_DIGEST}`,
      BASELINE_PROMPT_CONTRACT.overlapHeader,
      `[${overlap}] (paragraph) 重叠段落。`,
      BASELINE_PROMPT_CONTRACT.ownHeader,
      `[${own1}] (heading h1) 合成标题`,
      `[${own2}] (paragraph) 合成段落。`,
    ].join('\n');
    expect(ownBlockIdsOf(message)).toEqual([own1, own2]);
    expect(ownBlockIdsOf('没有消息头')).toEqual([]);
    expect(substituteBlockPlaceholders('{"blockId":"{{block:2}}","other":"{{block:1}}","far":"{{block:9}}"}', ownBlockIdsOf(message)))
      .toBe(`{"blockId":"${own2}","other":"${own1}","far":"{{block:9}}"}`);
  });

  it('fails closed as a fixture mismatch for an unknown unit, a different unit digest, another route, or no header', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(FIXTURES_ROOT, 'synthetic-usage-ceiling'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const mismatch = { type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH } } };
    expect(await collect(adapter.stream(request(`分析单元 2/2 · 单元摘要 ${ZERO_UNIT_DIGEST}`)))).toMatchObject([mismatch]);
    expect(await collect(adapter.stream(request(`分析单元 1/1 · 单元摘要 ${'9'.repeat(64)}`)))).toMatchObject([mismatch]);
    expect(await collect(adapter.stream(request('没有消息头')))).toMatchObject([mismatch]);
    expect(await collect(adapter.stream({ ...request(), provider: 'deepseek-open-platform' }))).toMatchObject([mismatch]);
    expect(classifyModelFailure({ code: AI7_FAILURE_CODES.FIXTURE_MISMATCH, message: '' }, codes)).toMatchObject({ failureClass: 'fixture-mismatch' });
  });
});

describe('model fixture loading', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-fixture-test-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function fixture(identity: string, basedOn: string | null, entries: unknown[]): string {
    return JSON.stringify({
      schema: 'ai7.model-fixture/1', identity, description: '合成测试夹具', basedOn,
      provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture', entries,
    });
  }

  function entry(unitOrdinal: number, text: string, requestDigest = 'e'.repeat(64)): unknown {
    return { unitOrdinal, requestDigest, response: { kind: 'unit-result', text, usage: { inputTokens: 1, outputTokens: 1 } } };
  }

  it('merges a variant over its base so the variant restates only what it changes', async () => {
    await writeFile(join(root, 'base.json'), fixture('base', null, [entry(1, 'one'), entry(2, 'two'), entry(3, 'three')]));
    await writeFile(join(root, 'variant.json'), fixture('variant', 'base', [
      { unitOrdinal: 2, requestDigest: 'e'.repeat(64), response: { kind: 'adapter-failure', code: 'SYNTHETIC_FAILURE', message: '合成失败', status: null } },
    ]));
    const resolved = await loadModelFixture(root, 'variant');
    expect(resolved.lineage.map((link) => link.identity)).toEqual(['variant', 'base']);
    const key = (ordinal: number) => fixtureEntryKey(ordinal, 'e'.repeat(64));
    expect(resolved.entries.get(key(1))?.response).toMatchObject({ kind: 'unit-result', text: 'one' });
    expect(resolved.entries.get(key(2))?.response).toMatchObject({ kind: 'adapter-failure', code: 'SYNTHETIC_FAILURE' });
    expect(resolved.entries.get(key(3))?.response).toMatchObject({ kind: 'unit-result', text: 'three' });
    const base = await loadModelFixture(root, 'base');
    expect(base.sha256).not.toBe(resolved.sha256);
  });

  it('keys entries by unit ordinal and request digest so one identity serves successive manifests of the same unit', async () => {
    const before = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 1, 'a'.repeat(64));
    const after = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 1, 'b'.repeat(64));
    await writeFile(join(root, 'successive.json'), fixture('successive', null, [entry(1, 'before-edit', before), entry(1, 'after-edit', after)]));
    const resolved = await loadModelFixture(root, 'successive');
    expect(resolved.entries.size).toBe(2);
    expect(resolved.entries.get(fixtureEntryKey(1, before))?.response).toMatchObject({ text: 'before-edit' });
    expect(resolved.entries.get(fixtureEntryKey(1, after))?.response).toMatchObject({ text: 'after-edit' });
    const adapter = new Ai7LocalDeterministicAdapter(resolved, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const served = async (unitDigest: string) => collect(adapter.stream(request(`分析单元 1/1 · 单元摘要 ${unitDigest}`)));
    expect((await served('a'.repeat(64))).find((chunk) => chunk.type === 'block-end')).toMatchObject({ block: { text: 'before-edit' } });
    expect((await served('b'.repeat(64))).find((chunk) => chunk.type === 'block-end')).toMatchObject({ block: { text: 'after-edit' } });
    expect(await served('c'.repeat(64))).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH } } }]);
  });

  it('answers the n-th request of a unit and digest from its attempt-specific entry and every other from the any-attempt entry', async () => {
    await writeFile(join(root, 'attempts.json'), fixture('attempts', null, [
      entry(1, 'steady', ZERO_UNIT_REQUEST_DIGEST),
      { unitOrdinal: 1, requestDigest: ZERO_UNIT_REQUEST_DIGEST, attempt: 1, response: { kind: 'adapter-failure', code: 'PROVIDER_ERROR', message: '合成瞬时服务端错误', status: 503 } },
      { unitOrdinal: 1, requestDigest: ZERO_UNIT_REQUEST_DIGEST, attempt: 3, response: { kind: 'adapter-failure', code: 'RATE_LIMIT', message: '合成速率限制', status: 429 } },
    ]));
    const resolved = await loadModelFixture(root, 'attempts');
    expect(resolved.entries.size).toBe(3);
    expect(resolved.entries.get(fixtureEntryKey(1, ZERO_UNIT_REQUEST_DIGEST))?.attempt).toBeNull();
    expect(resolved.entries.get(fixtureEntryKey(1, ZERO_UNIT_REQUEST_DIGEST, 1))?.attempt).toBe(1);
    expect(fixtureEntryKey(1, ZERO_UNIT_REQUEST_DIGEST, 1)).toBe(`1:${ZERO_UNIT_REQUEST_DIGEST}#1`);
    expect(resolveFixtureEntry(resolved.entries, 1, ZERO_UNIT_REQUEST_DIGEST, 1)?.response).toMatchObject({ code: 'PROVIDER_ERROR', status: 503 });
    expect(resolveFixtureEntry(resolved.entries, 1, ZERO_UNIT_REQUEST_DIGEST, 2)?.response).toMatchObject({ kind: 'unit-result', text: 'steady' });
    expect(resolveFixtureEntry(resolved.entries, 1, ZERO_UNIT_REQUEST_DIGEST, 3)?.response).toMatchObject({ code: 'RATE_LIMIT' });
    expect(resolveFixtureEntry(resolved.entries, 1, ZERO_UNIT_REQUEST_DIGEST, 9)?.response).toMatchObject({ text: 'steady' });
    expect(resolveFixtureEntry(resolved.entries, 2, ZERO_UNIT_REQUEST_DIGEST, 1)).toBeUndefined();
    // The adapter counts the served pair within its own lifetime: attempt 1 fails, 2 succeeds, 3 is rate-limited, 4 succeeds.
    const adapter = new Ai7LocalDeterministicAdapter(resolved, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const served = async () => collect(adapter.stream(request()));
    expect((await served()).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'PROVIDER_ERROR', status: 503 } } });
    expect((await served()).find((chunk) => chunk.type === 'block-end')).toMatchObject({ block: { text: 'steady' } });
    expect((await served()).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', status: 429 } } });
    expect((await served()).find((chunk) => chunk.type === 'block-end')).toMatchObject({ block: { text: 'steady' } });
    expect(adapter.servedRequests).toBe(4);
    // A request the fixture never describes does not advance any served pair; a fresh adapter starts at attempt 1 again.
    expect(await collect(adapter.stream(request(`分析单元 2/2 · 单元摘要 ${ZERO_UNIT_DIGEST}`)))).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH } } }]);
    const fresh = new Ai7LocalDeterministicAdapter(resolved, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    expect((await collect(fresh.stream(request()))).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'PROVIDER_ERROR' } } });
  });

  it('rejects an invalid or duplicate attempt and keeps every attempt-free fixture unchanged', async () => {
    const withAttempt = (attempt: unknown) => fixture('bad-attempt', null, [{ unitOrdinal: 1, requestDigest: 'e'.repeat(64), attempt, response: { kind: 'unit-result', text: 'x', usage: { inputTokens: 1, outputTokens: 1 } } }]);
    for (const attempt of [0, -1, 9, 1.5, '1', null]) {
      expect(() => parseModelFixture(JSON.parse(withAttempt(attempt)))).toThrowError(ModelFixtureError);
    }
    const duplicate = fixture('dup', null, [
      { unitOrdinal: 1, requestDigest: 'e'.repeat(64), attempt: 1, response: { kind: 'unit-result', text: 'x', usage: { inputTokens: 1, outputTokens: 1 } } },
      { unitOrdinal: 1, requestDigest: 'e'.repeat(64), attempt: 1, response: { kind: 'unit-result', text: 'y', usage: { inputTokens: 1, outputTokens: 1 } } },
    ]);
    expect(() => parseModelFixture(JSON.parse(duplicate))).toThrowError(/重复/u);
    // The same pair with and without an attempt is not a duplicate.
    const beside = fixture('beside', null, [entry(1, 'any'), { unitOrdinal: 1, requestDigest: 'e'.repeat(64), attempt: 2, response: { kind: 'unit-result', text: 'second', usage: { inputTokens: 1, outputTokens: 1 } } }]);
    expect(parseModelFixture(JSON.parse(beside)).entries.map((item) => item.attempt)).toEqual([null, 2]);
    for (const identity of ['sample1-baseline-happy', 'sample1-baseline-one-unit-failure', 'synthetic-quota-exceeded', 'synthetic-usage-ceiling', 'synthetic-interrupted']) {
      const existing = await loadModelFixture(FIXTURES_ROOT, identity);
      expect(Array.from(existing.entries.values()).every((item) => item.attempt === null)).toBe(true);
    }
  });

  it('(vi) sample1-baseline-transient-retry layers a first-attempt PROVIDER_ERROR 503 for unit 5 over shape (ii)', async () => {
    const transient = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry');
    expect(transient.lineage.map((link) => link.identity)).toEqual(['sample1-baseline-transient-retry', 'sample1-baseline-one-unit-failure', 'sample1-baseline-happy']);
    const unit5 = '8d32b61042d075334c910da1d6fc6887b2c6f84c3034707c721070399fba328f';
    const unit2 = 'cbc613c1c72be55aa803ab03658fa4e70638719764daf6a3a2ceef1034496295';
    expect(resolveFixtureEntry(transient.entries, 5, unit5, 1)?.response).toMatchObject({ kind: 'adapter-failure', code: 'PROVIDER_ERROR', status: 503 });
    expect(resolveFixtureEntry(transient.entries, 5, unit5, 2)?.response).toMatchObject({ kind: 'unit-result', usage: { inputTokens: 1400, outputTokens: 180 } });
    expect(classifyModelFailure({ code: 'PROVIDER_ERROR', message: '', status: 503 }, codes).retrySafe).toBe(true);
    // Unit 2's inherited failure stays non-retry-safe and answers every attempt.
    expect(resolveFixtureEntry(transient.entries, 2, unit2, 1)?.response).toMatchObject({ code: 'SYNTHETIC_ADAPTER_FAILURE' });
    expect(resolveFixtureEntry(transient.entries, 2, unit2, 2)?.response).toMatchObject({ code: 'SYNTHETIC_ADAPTER_FAILURE' });
    expect(classifyModelFailure({ code: 'SYNTHETIC_ADAPTER_FAILURE', message: '' }, codes).retrySafe).toBe(false);
    const base = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
    expect(transient.sha256).not.toBe(base.sha256);
    expect(transient.entries.size).toBe(base.entries.size + 1);
  });

  it('rejects an absent fixture, a cyclic base chain, an identity that differs from its file name, and invalid shapes', async () => {
    await expect(loadModelFixture(root, 'missing')).rejects.toMatchObject({ code: 'MODEL_FIXTURE_ABSENT' });
    await writeFile(join(root, 'loop-a.json'), fixture('loop-a', 'loop-b', []));
    await writeFile(join(root, 'loop-b.json'), fixture('loop-b', 'loop-a', []));
    await expect(loadModelFixture(root, 'loop-a')).rejects.toBeInstanceOf(ModelFixtureError);
    await writeFile(join(root, 'renamed.json'), fixture('other', null, []));
    await expect(loadModelFixture(root, 'renamed')).rejects.toMatchObject({ code: 'MODEL_FIXTURE_INVALID' });
    expect(() => parseModelFixture({})).toThrowError(ModelFixtureError);
    expect(() => parseModelFixture(JSON.parse(fixture('x', null, [entry(1, 'a'), entry(1, 'b')])))).toThrowError(/单元序号与请求摘要重复/u);
    expect(() => parseModelFixture(JSON.parse(fixture('x', null, [entry(1, 'a'), entry(1, 'b', 'f'.repeat(64))])))).not.toThrow();
    expect(() => parseModelFixture(JSON.parse(fixture('x', null, [{ unitOrdinal: 1, requestDigest: 'short', response: { kind: 'interrupted', message: 'x' } }])))).toThrowError(/条目无效/u);
    expect(() => parseModelFixture(JSON.parse(fixture('x', 'x', [])))).toThrowError(/基础引用无效/u);
    expect(() => fixturePath(root, '../escape')).toThrowError(ModelFixtureError);
    expect(() => fixturePath(root, 'Upper')).toThrowError(ModelFixtureError);
  });
});
