import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import {
  BASELINE_PROMPT_CONTRACT_DIGEST,
  BASELINE_UNIT_RESULT_SCHEMA,
  parseUnitMessageHeader,
  parseUnitResult,
  unitRequestDigest,
  type BaselineUnitResult,
} from '../../src/service/analysis/contract.js';
import {
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST,
  buildCrossUnitMessage,
  citedBlocksByUnit,
  crossUnitRequestDigest,
  parseCrossUnitMessageHeader,
  parseCrossUnitResult,
  unitSetDigest,
} from '../../src/service/analysis/cross-unit-contract.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  ASSURANCE_SAMPLING_RESULT_SCHEMA,
  assuranceSampleDigest,
  assuranceSamplingRequestDigest,
  buildAssuranceSamplingMessage,
  parseAssuranceSamplingListedRefs,
  parseAssuranceSamplingMessageHeader,
  parseAssuranceSamplingResult,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import { AI7_FAILURE_CODES, classifyModelFailure, evaluateRunBudgetCeiling } from '../../src/service/provider/classification.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import {
  Ai7LocalDeterministicAdapter,
  ownBlockIdsOf,
  ownBlockTextsOf,
  substituteAssuranceSamplingRefPlaceholders,
  substituteBlockPlaceholders,
  substituteCrossUnitBlockPlaceholders,
  unitContentDigest,
} from '../../src/service/provider/local-deterministic-adapter.js';
import { BASELINE_PROMPT_CONTRACT } from '../../src/service/analysis/contract.js';
import type { CoverageManifestUnitProjection } from '../../src/shared/protocol.js';
import {
  ModelFixtureError,
  fixtureEntryKey,
  fixturePath,
  loadModelFixture,
  parseModelFixture,
  resolveFixtureEntry,
  type ResolvedModelFixture,
} from '../../src/service/provider/model-fixture.js';

// Fixtures (iii)–(v) are hand-written synthetic shapes consumed here only; their request digests are
// the deterministic function of the frozen prompt contract and a synthetic all-zero unit digest.

import { FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, factualReviewRequestDigest } from '../../src/service/analysis/factual-review-contract.js';

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
    // Four entries of its own over the base: unit 5's first-attempt failure, and (Issue #276) the
    // three Run Report reflection answers for the accountings the Runs on this fixture produce.
    expect(transient.entries.size).toBe(base.entries.size + 4);
  });

  // Issue #53: a second analysis kind shares this adapter. Which kind a request belongs to is decided
  // by its header alone, and its request digest is keyed by the contract digest the adapter holds.
  it('answers a factual-review unit message under its own contract digest and leaves the baseline path alone', async () => {
    const factualDigest = factualReviewRequestDigest(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, 1, ZERO_UNIT_DIGEST);
    expect(factualDigest).not.toBe(ZERO_UNIT_REQUEST_DIGEST);
    await writeFile(join(root, 'factual.json'), fixture('factual', null, [entry(1, 'factual-answer', factualDigest)]));
    const resolved = await loadModelFixture(root, 'factual');
    const adapter = new Ai7LocalDeterministicAdapter(resolved, FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, codes);
    const factualHeader = `事实核查单元 1/1 · 单元摘要 ${ZERO_UNIT_DIGEST}`;
    expect(parseUnitMessageHeader(factualHeader)).toBeNull();
    expect((await collect(adapter.stream(request(factualHeader)))).find((chunk) => chunk.type === 'block-end'))
      .toMatchObject({ block: { text: 'factual-answer' } });
    // One adapter serves one Run and therefore one kind: it is bound to that kind's contract digest,
    // and a Run only ever hands it the messages it built. A baseline-bound adapter given the factual
    // header derives the baseline digest, which this fixture does not describe.
    const baselineBound = new Ai7LocalDeterministicAdapter(resolved, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    expect((await collect(baselineBound.stream(request(factualHeader)))).at(-1))
      .toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH } } });
    expect((await collect(baselineBound.stream(request()))).at(-1))
      .toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH } } });
  });

  // Issue #53: the optional top-level `provenance`, admitted as S41 admitted the per-entry `contentDigest`.
  it('admits an optional fixture provenance and defaults a fixture without one to recorded', async () => {
    expect(parseModelFixture(JSON.parse(fixture('plain', null, [entry(1, 'a')]))).provenance).toBe('recorded');
    const authored = JSON.parse(fixture('authored', null, [entry(1, 'a')])) as Record<string, unknown>;
    authored['provenance'] = 'authored';
    expect(parseModelFixture(authored).provenance).toBe('authored');
    authored['provenance'] = 'invented';
    expect(() => parseModelFixture(authored)).toThrowError(/来源标注无效/u);
    const unknownKey = JSON.parse(fixture('plain', null, [entry(1, 'a')])) as Record<string, unknown>;
    unknownKey['author'] = 'someone';
    expect(() => parseModelFixture(unknownKey)).toThrowError(/键集合无效/u);
    // The six fixtures that ship keep the default, so none of their bytes move.
    for (const identity of ['sample1-baseline-happy', 'sample1-baseline-one-unit-failure', 'synthetic-quota-exceeded']) {
      expect((await loadModelFixture(FIXTURES_ROOT, identity)).provenance).toBe('recorded');
    }
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

  // Issue #274: ordinal 0 is not an Analysis Unit but the Run's one cross-unit reduction. It is
  // admitted, keyed, and merged exactly like every other entry; the schema string does not move.
  it('admits unit ordinal 0 as the cross-unit reduction entry and still refuses a negative ordinal', async () => {
    expect(parseModelFixture(JSON.parse(fixture('zero', null, [entry(0, 'reduction')]))).entries[0]?.unitOrdinal).toBe(0);
    for (const ordinal of [-1, 1.5, '0', null]) {
      expect(() => parseModelFixture(JSON.parse(fixture('bad', null, [entry(ordinal as number, 'x')]))), String(ordinal)).toThrowError(ModelFixtureError);
    }
    // Ordinal 0 sits beside the unit entries of the same digest rather than colliding with any of them.
    await writeFile(join(root, 'both.json'), fixture('both', null, [entry(0, 'reduction'), entry(1, 'unit-one')]));
    const resolved = await loadModelFixture(root, 'both');
    expect(resolved.entries.get(fixtureEntryKey(0, 'e'.repeat(64)))?.response).toMatchObject({ text: 'reduction' });
    expect(resolved.entries.get(fixtureEntryKey(1, 'e'.repeat(64)))?.response).toMatchObject({ text: 'unit-one' });
    // The synthetic fixtures end before the reduction: each answers one unit and then fails, exceeds a
    // ceiling, or interrupts, so no Run over them ever closes two units and none carries an ordinal 0.
    for (const identity of ['synthetic-quota-exceeded', 'synthetic-usage-ceiling', 'synthetic-interrupted']) {
      const committed = await loadModelFixture(FIXTURES_ROOT, identity);
      expect(Array.from(committed.entries.values()).every((item) => item.unitOrdinal >= 1), identity).toBe(true);
    }
    // The sample1 fixtures carry exactly the ordinal-0 entries their own Runs need: the reduction
    // entries of their closed sets, plus the two assurance sampling entries of Issue #275 — one for
    // unit 1 as first analysed and one for it after J-04's acknowledged edit, both inherited by the
    // two variants, because a sampling turn is keyed by unit content and listed findings alone.
    //
    // Synchronized delta (Issue #276): `sample1-baseline-one-unit-failure` gains four Run Report
    // reflection entries, one per distinct accounting J-04's four Runs on it produce, and
    // `sample1-baseline-transient-retry` gains three — the L2 suite's first baseline on it, and
    // J-04's safe-retry range Run and plan-revision range Run. `sample1-baseline-happy` gains none:
    // it is never the bound route of a development-ci Run, and its two variants carry the accountings
    // their own Runs reach.
    const counts = await Promise.all(['sample1-baseline-happy', 'sample1-baseline-one-unit-failure', 'sample1-baseline-transient-retry']
      .map(async (identity) => Array.from((await loadModelFixture(FIXTURES_ROOT, identity)).entries.values()).filter((item) => item.unitOrdinal === 0).length));
    expect(counts).toEqual([3, 9, 12]);
    const factual = await loadModelFixture(FIXTURES_ROOT, 'sample1-factual-authored');
    // One sampling turn per anchor unit — every one of sample1's eight units holds a located finding —
    // and one Run Report reflection entry for the accounting that Run produces.
    expect(Array.from(factual.entries.values()).filter((item) => item.unitOrdinal === 0)).toHaveLength(9);
  });
});

// The cross-unit reduction (Issue #274, ADR 0066): the adapter answers it from an ordinal-0 entry
// keyed by the reduction's own request digest, and substitutes {{unit:U:block:N}} from the message's
// cited-blocks section so a hand-written response can cite exact ranges of two units.
describe('cross-unit reduction replay', () => {
  const BLOCK_A = `blk_${'a'.repeat(24)}`;
  const BLOCK_B = `blk_${'b'.repeat(24)}`;
  const BLOCK_C = `blk_${'c'.repeat(24)}`;
  const BLOCK_D = `blk_${'d'.repeat(24)}`;
  let root: string;

  function closedUnit(unitOrdinal: number, blocks: [string, string]): { unitOrdinal: number; result: BaselineUnitResult } {
    const range = (blockId: string) => ({ blockId, fromGrapheme: null, toGrapheme: null });
    return {
      unitOrdinal,
      result: {
        schema: BASELINE_UNIT_RESULT_SCHEMA,
        unitOrdinal,
        synopsis: `合成概述（单元 ${unitOrdinal}）。`,
        entities: [{ name: `合成人物${unitOrdinal}`, kind: 'person', aliases: [], note: null, sourceRanges: [range(blocks[0])] }],
        events: [],
        relationships: [],
        settingClaims: [{ subject: '合成之城', claim: unitOrdinal === 1 ? '位于北方' : '位于南方', sourceRanges: [range(blocks[1])] }],
        conflicts: [],
        unresolved: [],
        confidence: 'high',
      },
    };
  }

  const CLOSED = [closedUnit(1, [BLOCK_A, BLOCK_B]), closedUnit(3, [BLOCK_C, BLOCK_D])];
  const MESSAGE = buildCrossUnitMessage(CLOSED, 8);
  const REQUEST_DIGEST = crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitSetDigest(CLOSED));
  const RESPONSE = JSON.stringify({
    schema: 'ai7.baseline-manuscript-analysis.cross-unit-result/1',
    findings: [{
      kind: 'contradiction',
      description: '合成矛盾：单元 1 与单元 3 对合成之城的方位陈述不一致。',
      sides: [
        { unitOrdinal: 1, sourceRanges: [{ blockId: '{{unit:1:block:2}}', fromGrapheme: null, toGrapheme: null }] },
        { unitOrdinal: 3, sourceRanges: [{ blockId: '{{unit:3:block:2}}', fromGrapheme: null, toGrapheme: null }] },
      ],
      confidence: 'medium',
    }],
    notes: [],
  });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-cross-unit-test-'));
    await writeFile(join(root, 'reduction.json'), JSON.stringify({
      schema: 'ai7.model-fixture/1', identity: 'reduction', description: '合成测试夹具', basedOn: null,
      provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture',
      entries: [{ unitOrdinal: 0, requestDigest: REQUEST_DIGEST, response: { kind: 'unit-result', text: RESPONSE, usage: { inputTokens: 700, outputTokens: 90 } } }],
    }));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function reductionRequest(text: string): GenerateOptions {
    return {
      provider: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      system: '合成系统提示。',
      messages: [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }],
    };
  }

  it('answers the reduction from its ordinal-0 entry with every cited block substituted', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(root, 'reduction'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const chunks = await collect(adapter.stream(reductionRequest(MESSAGE)));
    const replayed = chunks.find((chunk) => chunk.type === 'block-end');
    const text = replayed?.type === 'block-end' && replayed.block.type === 'text' ? replayed.block.text : '';
    expect(text).not.toContain('{{unit:');
    const parsed = parseCrossUnitResult(text, { closedOrdinals: [1, 3], citedBlocksByUnit: citedBlocksByUnit(CLOSED) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Each side cites the exact block the message listed second for its own unit.
    expect(parsed.result.findings[0]!.sides.map((side) => side.sourceRanges[0]!.blockId)).toEqual([BLOCK_B, BLOCK_D]);
    expect(chunks.find((chunk) => chunk.type === 'usage')).toEqual({ type: 'usage', usage: { inputTokens: 700, outputTokens: 90 } });
  });

  it('fails closed when the closed unit set is not the one the entry answers', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(root, 'reduction'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const other = buildCrossUnitMessage([CLOSED[0]!, closedUnit(4, [BLOCK_C, BLOCK_D])], 8);
    expect(await collect(adapter.stream(reductionRequest(other))))
      .toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH, message: expect.stringContaining('跨单元归纳') } } }]);
  });

  it('never reads a unit message as a reduction, or a reduction as a unit', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(root, 'reduction'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    // A unit message resolves by unit ordinal, finds no unit entry in this fixture, and says so.
    expect(await collect(adapter.stream(request())))
      .toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { message: expect.stringContaining('单元 1') } } }]);
    expect(parseUnitMessageHeader(MESSAGE)).toBeNull();
    expect(parseCrossUnitMessageHeader(`分析单元 1/1 · 单元摘要 ${ZERO_UNIT_DIGEST}`)).toBeNull();
  });

  it('leaves an out-of-range placeholder in place for the contract to refuse', () => {
    const cited = citedBlocksByUnit(CLOSED);
    expect(substituteCrossUnitBlockPlaceholders('{{unit:1:block:1}}', cited)).toBe(BLOCK_A);
    expect(substituteCrossUnitBlockPlaceholders('{{unit:1:block:9}}', cited)).toBe('{{unit:1:block:9}}');
    expect(substituteCrossUnitBlockPlaceholders('{{unit:2:block:1}}', cited)).toBe('{{unit:2:block:1}}');
  });
});

// The assurance sampling turn (Issue #275, ADR 0066): a third ordinal-0 shape, keyed by the anchor
// unit and the findings the turn listed, whose responses name a finding by its listed position.
describe('assurance sampling replay', () => {
  const BLOCK_A = `blk_${'1'.repeat(24)}`;
  const BLOCK_B = `blk_${'2'.repeat(24)}`;
  const UNIT_DIGEST = '7'.repeat(64);
  let root: string;

  const UNIT: CoverageManifestUnitProjection = {
    ordinal: 4, sectionOrdinal: 2, subUnitIndex: 1, subUnitCount: 1,
    headingBlockId: BLOCK_A, headingText: '合成标题', headingLevel: 1,
    startPosition: 4, endPosition: 5, blockIds: [BLOCK_A, BLOCK_B], blockDigests: ['3'.repeat(64), '4'.repeat(64)],
    overlapBlockIds: [], graphemes: 20, digest: UNIT_DIGEST,
  };
  const BLOCKS = new Map([
    [BLOCK_A, { blockId: BLOCK_A, kind: 'heading' as const, level: 1, text: '合成标题' }],
    [BLOCK_B, { blockId: BLOCK_B, kind: 'paragraph' as const, level: null, text: '合成正文。' }],
  ]);
  // Minted refs, exactly as the factual kind produces: a fixture author cannot know either of them.
  const FINDINGS = [
    { ref: 'fnd_aaaaaaaaaaaaaaaaaaaaaaaa', unitOrdinal: 4, tier: 'A', text: '合成发现一。' },
    { ref: 'fnd_bbbbbbbbbbbbbbbbbbbbbbbb', unitOrdinal: 4, tier: 'B', text: '合成发现二。' },
  ];
  const MESSAGE = buildAssuranceSamplingMessage(UNIT, 8, BLOCKS, FINDINGS);
  const REQUEST_DIGEST = assuranceSamplingRequestDigest(
    ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, UNIT.ordinal, UNIT_DIGEST, assuranceSampleDigest(FINDINGS),
  );
  const RESPONSE = JSON.stringify({
    schema: ASSURANCE_SAMPLING_RESULT_SCHEMA,
    dispositions: [
      { ref: '{{ref:1}}', disposition: '成立', reason: '本单元内容块按原样支持该发现。' },
      { ref: '{{ref:2}}', disposition: '需降级', reason: '内容块只支持较弱的说法。' },
    ],
  });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-sampling-test-'));
    await writeFile(join(root, 'sampling.json'), JSON.stringify({
      schema: 'ai7.model-fixture/1', identity: 'sampling', description: '合成测试夹具', basedOn: null,
      provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture',
      entries: [{ unitOrdinal: 0, requestDigest: REQUEST_DIGEST, response: { kind: 'unit-result', text: RESPONSE, usage: { inputTokens: 400, outputTokens: 60 } } }],
    }));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function samplingRequest(text: string): GenerateOptions {
    return {
      provider: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      system: '合成系统提示。',
      messages: [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }],
    };
  }

  it('answers a sampling turn from its ordinal-0 entry with every listed ref substituted', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(root, 'sampling'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const chunks = await collect(adapter.stream(samplingRequest(MESSAGE)));
    const replayed = chunks.find((chunk) => chunk.type === 'block-end');
    const text = replayed?.type === 'block-end' && replayed.block.type === 'text' ? replayed.block.text : '';
    expect(text).not.toContain('{{ref:');
    const parsed = parseAssuranceSamplingResult(text, { refs: FINDINGS.map((finding) => finding.ref) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.dispositions.map((entry) => [entry.ref, entry.disposition])).toEqual([
      [FINDINGS[0]!.ref, '成立'],
      [FINDINGS[1]!.ref, '需降级'],
    ]);
    expect(chunks.find((chunk) => chunk.type === 'usage')).toEqual({ type: 'usage', usage: { inputTokens: 400, outputTokens: 60 } });
  });

  it('fails closed when the anchor unit’s blocks or the listed findings are not the ones the entry answers', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(root, 'sampling'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const otherUnit = buildAssuranceSamplingMessage({ ...UNIT, digest: '8'.repeat(64) }, 8, BLOCKS, FINDINGS);
    expect(await collect(adapter.stream(samplingRequest(otherUnit))))
      .toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH, message: expect.stringContaining('单元 4 的保证抽样') } } }]);
    const otherFindings = buildAssuranceSamplingMessage(UNIT, 8, BLOCKS, [FINDINGS[0]!]);
    expect(await collect(adapter.stream(samplingRequest(otherFindings))))
      .toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH } } }]);
  });

  it('is keyed by content alone, so the same turn under fresh identities finds the same entry', async () => {
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(root, 'sampling'), BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    // A second import: different block identities, different `findingId`s, the same manuscript.
    const remintedBlockA = `blk_${'5'.repeat(24)}`;
    const remintedBlockB = `blk_${'6'.repeat(24)}`;
    const reminted = buildAssuranceSamplingMessage(
      { ...UNIT, blockIds: [remintedBlockA, remintedBlockB], headingBlockId: remintedBlockA },
      8,
      new Map([
        [remintedBlockA, { blockId: remintedBlockA, kind: 'heading' as const, level: 1, text: '合成标题' }],
        [remintedBlockB, { blockId: remintedBlockB, kind: 'paragraph' as const, level: null, text: '合成正文。' }],
      ]),
      FINDINGS.map((finding, index) => ({ ...finding, ref: `fnd_${String(index + 7).repeat(24)}` })),
    );
    expect(reminted).not.toBe(MESSAGE);
    const chunks = await collect(adapter.stream(samplingRequest(reminted)));
    const replayed = chunks.find((chunk) => chunk.type === 'block-end');
    const text = replayed?.type === 'block-end' && replayed.block.type === 'text' ? replayed.block.text : '';
    // The entry answered, and its refs resolved to this import's identities rather than the first's.
    expect(text).toContain(`fnd_${'7'.repeat(24)}`);
    expect(text).not.toContain(FINDINGS[0]!.ref);
  });

  it('never reads a sampling turn as a unit message or as the reduction, and back', () => {
    expect(parseUnitMessageHeader(MESSAGE)).toBeNull();
    expect(parseCrossUnitMessageHeader(MESSAGE)).toBeNull();
    expect(parseAssuranceSamplingMessageHeader(`分析单元 1/1 · 单元摘要 ${ZERO_UNIT_DIGEST}`)).toBeNull();
    // An out-of-range placeholder is left in place for the contract to refuse.
    expect(substituteAssuranceSamplingRefPlaceholders('{{ref:1}}', ['a'])).toBe('a');
    expect(substituteAssuranceSamplingRefPlaceholders('{{ref:9}}', ['a'])).toBe('{{ref:9}}');
    expect(parseAssuranceSamplingListedRefs(MESSAGE)).toEqual(FINDINGS.map((finding) => finding.ref));
    expect(parseAssuranceSamplingListedRefs('没有发现小节')).toEqual([]);
  });
});

/**
 * The pinned unit-set digests of the committed sample1 fixtures (Issue #274). Each is rebuilt here
 * from the fixture's own responses rather than from a Run: block identities are minted per import,
 * and the digest indexes each cited block by its position, so any injective substitution of the
 * `{{block:N}}` placeholders reproduces the exact digest a Run computes. That is what lets a
 * hand-written ordinal-0 entry be keyed at all, and this suite is what keeps it honest.
 */
describe('sample1 cross-unit reduction entries', () => {
  /** Enough synthetic identities for any unit of the sample1 manifest; distinct per unit and per position. */
  function syntheticBlockIds(unitOrdinal: number): string[] {
    return Array.from({ length: 32 }, (_item, index) => `blk_${String(unitOrdinal).padStart(2, '0')}${String(index + 1).padStart(2, '0')}${'0'.repeat(20)}`);
  }

  /**
   * One closed unit set as a Run would hold it: for each ordinal the fixture's conforming response,
   * with `{{block:N}}` filled from that unit's synthetic identities. `unitOneMarker` picks between the
   * two unit-1 responses the happy fixture carries — the original and the one J-04's acknowledged edit
   * recomputes — because they are what make two distinct closed sets of the same eight units.
   */
  function closedSet(fixture: ResolvedModelFixture, ordinals: readonly number[], unitOneMarker: string) {
    return ordinals.map((unitOrdinal) => {
      const candidates = Array.from(fixture.entries.values())
        .filter((item) => item.unitOrdinal === unitOrdinal && item.response.kind === 'unit-result');
      const chosen = candidates.length === 1
        ? candidates[0]
        : candidates.find((item) => item.response.kind === 'unit-result' && item.response.text.includes(unitOneMarker));
      expect(chosen?.response.kind, `unit ${unitOrdinal}`).toBe('unit-result');
      const blockIds = syntheticBlockIds(unitOrdinal);
      const text = substituteBlockPlaceholders(chosen!.response.kind === 'unit-result' ? chosen!.response.text : '', blockIds);
      const parsed = parseUnitResult(text, { unitOrdinal, blockIds });
      expect(parsed.ok, `unit ${unitOrdinal} parses`).toBe(true);
      return { unitOrdinal, result: parsed.ok ? parsed.result : (undefined as never) };
    });
  }

  const SEVEN = [1, 3, 4, 5, 6, 7, 8] as const;
  const EIGHT = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  const ORIGINAL_UNIT_ONE = '合成概述（单元 1）：';
  const RECOMPUTED_UNIT_ONE = '合成概述（单元 1 · 已确认编辑后重算）';

  it('pins one digest per closed unit set the fixtures reach, and every ordinal-0 entry answers one', async () => {
    const happy = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
    const failure = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
    const retry = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry');

    // Set A — the seven units that close when unit 2 fails, with unit 1 as first analysed. Every
    // first-baseline Run over sample1 under either variant reaches it.
    const setA = unitSetDigest(closedSet(failure, SEVEN, ORIGINAL_UNIT_ONE));
    // Set B — the same seven units after J-04's acknowledged edit recomputes unit 1. Every update Run
    // reaches it, whichever of the three update modes asked for it.
    const setB = unitSetDigest(closedSet(failure, SEVEN, RECOMPUTED_UNIT_ONE));
    // Set C — all eight units, which only the happy fixture closes, since unit 2 answers there.
    const setC = unitSetDigest(closedSet(happy, EIGHT, ORIGINAL_UNIT_ONE));
    expect(new Set([setA, setB, setC]).size).toBe(3);
    expect([setA, setB, setC]).toEqual([
      '07dcb9d6dc825a008ba491c8f0fcb236252b8dba68ceaa1be738b2614473857f',
      '330f5f44073d4758826cbe384c615677ff1e53fa55c546ac7b30bbb218d682e1',
      '487d3aa59a9aa024db456117b35d6c46ea52590b2e1bf6a5d901dddcab9eaeac',
    ]);

    // The variants restate no reduction entry of their own: the two seven-unit sets are a property of
    // the one-unit-failure lineage, and transient-retry settles unit 5 to the same result, so it
    // reaches those same two sets and inherits both entries.
    const keyOf = (setDigest: string) => fixtureEntryKey(0, crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, setDigest));
    expect(happy.entries.get(keyOf(setC))?.unitOrdinal).toBe(0);
    for (const fixture of [failure, retry]) {
      expect(fixture.entries.get(keyOf(setA))?.unitOrdinal).toBe(0);
      expect(fixture.entries.get(keyOf(setB))?.unitOrdinal).toBe(0);
    }
    expect(retry.entries.get(keyOf(setA))).toEqual(failure.entries.get(keyOf(setA)));
    expect(retry.entries.get(keyOf(setB))).toEqual(failure.entries.get(keyOf(setB)));
  });
});

// Content-digest resolution (S41): a fixture generated from one import of a text answers a fresh
// import of the same text, whose block identities are different. Nothing here changes the
// request-digest path, which is what production and the J-04 Journey use.
describe('content-digest resolution', () => {
  const UNIT_TEXTS = ['合成段落一。', '合成段落二。'];
  const CONTENT_DIGEST = unitContentDigest(UNIT_TEXTS);
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-content-digest-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function unitMessage(identities: ReadonlyArray<string>, texts: ReadonlyArray<string> = UNIT_TEXTS, unitDigest = ZERO_UNIT_DIGEST): string {
    return [
      `分析单元 1/1 · 单元摘要 ${unitDigest}`,
      BASELINE_PROMPT_CONTRACT.ownHeader,
      ...identities.map((identity, index) => `[${identity}] (paragraph) ${texts[index]!}`),
    ].join('\n');
  }

  function payload(message: string): GenerateOptions {
    return {
      provider: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      system: '合成系统提示。',
      messages: [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text: message }], source: { kind: 'user' } }],
    };
  }

  async function writeGenerated(identity: string, entries: unknown[]): Promise<void> {
    await writeFile(join(root, `${identity}.json`), JSON.stringify({
      schema: 'ai7.model-fixture/1', identity, description: '合成生成夹具', basedOn: null,
      provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture', entries,
    }));
  }

  const generatedEntry = (text: string, contentDigest: string | null = CONTENT_DIGEST) => ({
    unitOrdinal: 1,
    requestDigest: ZERO_UNIT_REQUEST_DIGEST,
    ...(contentDigest === null ? {} : { contentDigest }),
    response: { kind: 'unit-result', text, usage: { inputTokens: 12, outputTokens: 3 } },
  });

  it('reads own block texts with the identity and the kind marker stripped, positionally beside the identities', () => {
    const identities = [`blk_${'1'.repeat(24)}`, `blk_${'2'.repeat(24)}`];
    const message = [
      `分析单元 2/3 · 单元摘要 ${ZERO_UNIT_DIGEST}`,
      BASELINE_PROMPT_CONTRACT.overlapHeader,
      `[blk_${'0'.repeat(24)}] (paragraph) 重叠段落。`,
      BASELINE_PROMPT_CONTRACT.ownHeader,
      `[${identities[0]!}] (heading h1) 合成标题`,
      `[${identities[1]!}] (paragraph) 合成段落。`,
    ].join('\n');
    expect(ownBlockTextsOf(message)).toEqual(['合成标题', '合成段落。']);
    expect(ownBlockTextsOf(message)).toHaveLength(ownBlockIdsOf(message).length);
    expect(ownBlockTextsOf('没有消息头')).toEqual([]);
    // The overlap block is context, not own content: it is outside the digest either way.
    expect(unitContentDigest(ownBlockTextsOf(message))).toBe(unitContentDigest(['合成标题', '合成段落。']));
  });

  it('resolves a generated entry for a fresh import whose block identities are new and whose text is the same', async () => {
    await writeGenerated('generated', [generatedEntry('{"blockId":"{{block:2}}"}')]);
    const fixture = await loadModelFixture(root, 'generated');
    expect(Array.from(fixture.entries.values())[0]?.contentDigest).toBe(CONTENT_DIGEST);
    const adapter = new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes, { resolveBy: 'content-digest' });
    // A different import: new block identities, a new unit digest, the same manuscript text.
    const fresh = unitMessage([`blk_${'7'.repeat(24)}`, `blk_${'8'.repeat(24)}`], UNIT_TEXTS, 'c'.repeat(64));
    const chunks = await collect(adapter.stream(payload(fresh)));
    expect(chunks.find((chunk) => chunk.type === 'block-end')).toMatchObject({ block: { text: `{"blockId":"blk_${'8'.repeat(24)}"}` } });
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } });
    // Different text under the same identities does not resolve.
    const other = unitMessage([`blk_${'7'.repeat(24)}`, `blk_${'8'.repeat(24)}`], ['合成段落一。', '改写后的段落。']);
    expect(await collect(adapter.stream(payload(other)))).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH } } }]);
  });

  it('leaves an entry without a content digest unreachable in content mode and unchanged in request mode', async () => {
    await writeGenerated('request-only', [generatedEntry('合成响应', null)]);
    const fixture = await loadModelFixture(root, 'request-only');
    expect(Array.from(fixture.entries.values())[0]?.contentDigest).toBeNull();
    const message = unitMessage([`blk_${'7'.repeat(24)}`, `blk_${'8'.repeat(24)}`]);
    const content = new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes, { resolveBy: 'content-digest' });
    expect(await collect(content.stream(payload(message)))).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.FIXTURE_MISMATCH } } }]);
    // The same fixture, the same message, the default mode: the request digest still answers.
    const request = new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    expect((await collect(request.stream(payload(message)))).find((chunk) => chunk.type === 'block-end')).toMatchObject({ block: { text: '合成响应' } });
  });

  it('counts attempts per content key so an attempt-specific generated entry still answers the n-th request', async () => {
    await writeGenerated('attempts-by-content', [
      generatedEntry('稳定响应'),
      { unitOrdinal: 1, requestDigest: ZERO_UNIT_REQUEST_DIGEST, attempt: 1, contentDigest: CONTENT_DIGEST, response: { kind: 'adapter-failure', code: 'PROVIDER_ERROR', message: '合成瞬时服务端错误', status: 503 } },
    ]);
    const adapter = new Ai7LocalDeterministicAdapter(await loadModelFixture(root, 'attempts-by-content'), BASELINE_PROMPT_CONTRACT_DIGEST, codes, { resolveBy: 'content-digest' });
    const served = async () => collect(adapter.stream(payload(unitMessage([`blk_${'7'.repeat(24)}`, `blk_${'8'.repeat(24)}`]))));
    expect((await served()).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'PROVIDER_ERROR', status: 503 } } });
    expect((await served()).find((chunk) => chunk.type === 'block-end')).toMatchObject({ block: { text: '稳定响应' } });
  });

  it('admits contentDigest as an optional key, refuses a malformed one, and leaves every committed fixture without one', async () => {
    const entry = (extra: Record<string, unknown>) => ({
      schema: 'ai7.model-fixture/1', identity: 'x', description: '合成测试夹具', basedOn: null,
      provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture',
      entries: [{ unitOrdinal: 1, requestDigest: 'e'.repeat(64), ...extra, response: { kind: 'unit-result', text: 'x', usage: { inputTokens: 1, outputTokens: 1 } } }],
    });
    expect(parseModelFixture(entry({ contentDigest: 'a'.repeat(64) })).entries[0]?.contentDigest).toBe('a'.repeat(64));
    expect(parseModelFixture(entry({ attempt: 2, contentDigest: 'a'.repeat(64) })).entries[0]?.attempt).toBe(2);
    expect(parseModelFixture(entry({})).entries[0]?.contentDigest).toBeNull();
    for (const malformed of ['short', 'A'.repeat(64), '', null, 1, ['a'.repeat(64)]]) {
      expect(() => parseModelFixture(entry({ contentDigest: malformed })), String(malformed)).toThrowError(ModelFixtureError);
    }
    // An unknown key is still refused, so the widened check did not become a permissive one.
    expect(() => parseModelFixture(entry({ unknown: 'x' }))).toThrowError(/条目无效/u);
    for (const identity of [
      'sample1-baseline-happy', 'sample1-baseline-one-unit-failure', 'sample1-baseline-transient-retry',
      'synthetic-quota-exceeded', 'synthetic-usage-ceiling', 'synthetic-interrupted',
    ]) {
      const committed = await loadModelFixture(FIXTURES_ROOT, identity);
      expect(Array.from(committed.entries.values()).every((item) => item.contentDigest === null), identity).toBe(true);
    }
  });
});
