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
import { Ai7LocalDeterministicAdapter } from '../../src/service/provider/local-deterministic-adapter.js';
import { ModelFixtureError, fixturePath, loadModelFixture, parseModelFixture } from '../../src/service/provider/model-fixture.js';

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
      expect(fixture.entries.get(1)?.requestDigest).toBe(ZERO_UNIT_REQUEST_DIGEST);
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

  function entry(unitOrdinal: number, text: string): unknown {
    return { unitOrdinal, requestDigest: 'e'.repeat(64), response: { kind: 'unit-result', text, usage: { inputTokens: 1, outputTokens: 1 } } };
  }

  it('merges a variant over its base so the variant restates only what it changes', async () => {
    await writeFile(join(root, 'base.json'), fixture('base', null, [entry(1, 'one'), entry(2, 'two'), entry(3, 'three')]));
    await writeFile(join(root, 'variant.json'), fixture('variant', 'base', [
      { unitOrdinal: 2, requestDigest: 'e'.repeat(64), response: { kind: 'adapter-failure', code: 'SYNTHETIC_FAILURE', message: '合成失败', status: null } },
    ]));
    const resolved = await loadModelFixture(root, 'variant');
    expect(resolved.lineage.map((link) => link.identity)).toEqual(['variant', 'base']);
    expect(resolved.entries.get(1)?.response).toMatchObject({ kind: 'unit-result', text: 'one' });
    expect(resolved.entries.get(2)?.response).toMatchObject({ kind: 'adapter-failure', code: 'SYNTHETIC_FAILURE' });
    expect(resolved.entries.get(3)?.response).toMatchObject({ kind: 'unit-result', text: 'three' });
    const base = await loadModelFixture(root, 'base');
    expect(base.sha256).not.toBe(resolved.sha256);
  });

  it('rejects an absent fixture, a cyclic base chain, an identity that differs from its file name, and invalid shapes', async () => {
    await expect(loadModelFixture(root, 'missing')).rejects.toMatchObject({ code: 'MODEL_FIXTURE_ABSENT' });
    await writeFile(join(root, 'loop-a.json'), fixture('loop-a', 'loop-b', []));
    await writeFile(join(root, 'loop-b.json'), fixture('loop-b', 'loop-a', []));
    await expect(loadModelFixture(root, 'loop-a')).rejects.toBeInstanceOf(ModelFixtureError);
    await writeFile(join(root, 'renamed.json'), fixture('other', null, []));
    await expect(loadModelFixture(root, 'renamed')).rejects.toMatchObject({ code: 'MODEL_FIXTURE_INVALID' });
    expect(() => parseModelFixture({})).toThrowError(ModelFixtureError);
    expect(() => parseModelFixture(JSON.parse(fixture('x', null, [entry(1, 'a'), entry(1, 'b')])))).toThrowError(/单元序号重复/u);
    expect(() => parseModelFixture(JSON.parse(fixture('x', null, [{ unitOrdinal: 1, requestDigest: 'short', response: { kind: 'interrupted', message: 'x' } }])))).toThrowError(/条目无效/u);
    expect(() => parseModelFixture(JSON.parse(fixture('x', 'x', [])))).toThrowError(/基础引用无效/u);
    expect(() => fixturePath(root, '../escape')).toThrowError(ModelFixtureError);
    expect(() => fixturePath(root, 'Upper')).toThrowError(ModelFixtureError);
  });
});
