import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, evaluateEgress, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { Ai7LocalDeterministicAdapter } from '../../src/service/provider/local-deterministic-adapter.js';
import { fixtureEntryKey, loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { HARNESS_PACKAGE_PINS, describeComposition, prepareExecution } from '../../src/service/harness/primary-agent-harness.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST } from '../../src/service/fast-role/polish-contract.js';
import { CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST } from '../../src/service/fast-role/conflict-regenerate-contract.js';
import { DIALOGUE_PROMPT_CONTRACT_DIGEST } from '../../src/service/dialogue/contract.js';

// The composition is exercised over the real pinned DSH packages with the deterministic adapter and
// a synthetic fixture; no Provider, socket, or credential is involved. Network denial is installed
// first, exactly as the service does before any third-party module loads.

installNodeNetworkDenial();

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
const ZERO_UNIT = `分析单元 1/1 · 单元摘要 ${'0'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
const SYSTEM = BASELINE_PROMPT_CONTRACT.systemPrompt;

function bindingFacts(bindingDigest: string): EgressBindingFacts {
  return {
    bindingDigest,
    route: LOCAL_DETERMINISTIC_ROUTE,
    model: LOCAL_DETERMINISTIC_MODEL,
    systemPrompt: SYSTEM,
    outboundDataCategory: 'public-or-synthetic',
    policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 },
    admittedUserMessages: new Set([ZERO_UNIT]),
  };
}

describe('PrimaryAgentHarness', () => {
  it('keeps the no-tool 润色, conflict regeneration and /1 dialogue compositions byte-identical to their predecessors (#893 rev 8)', () => {
    // Values computed at the 7d base (4dacb862) and at this head: the frozen no-tool contracts register nothing under v18.
    expect(describeComposition('opencode-go', 'deepseek-v4.1-flash', EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST).digest).toBe('8ce79c998b3b9fb45a7af33f5ceb105941e5bf71a0fbac41aaf9b7aee4eea247');
    expect(describeComposition('opencode-go', 'deepseek-v4.1-flash', CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST).digest).toBe('d345e282bedeb39f8178a6fed51f4a6aad25d1fde41f3c124ffe053e2c6ba105');
    expect(describeComposition('opencode-go', 'deepseek-v4.1-flash', DIALOGUE_PROMPT_CONTRACT_DIGEST, { sessionLog: true }).digest).toBe('4d9cbce7647bd951989a00a9a1ffe4e00e01671d76ceb7e6775c46be650da809');
    expect(describeComposition('opencode-go', 'deepseek-v4.1-flash', EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST, { platformTools: false, localTools: false }).tools.registeredTools).toBe(0);
  });
  it('pins the exact local subset and the combined four-tool composition (#893)', () => {
    const local = describeComposition('opencode-go', 'deepseek-v4.1-flash', BASELINE_PROMPT_CONTRACT_DIGEST, { localTools: true });
    const both = describeComposition('opencode-go', 'deepseek-v4.1-flash', BASELINE_PROMPT_CONTRACT_DIGEST, { platformTools: true, localTools: true });
    expect(local.tools.registeredTools).toBe(2);
    expect(local.localTools?.names).toEqual(['exact_fetch', 'retrieve']);
    expect(local).not.toHaveProperty('platformTools');
    expect(local.digest).toBe('85a2d753073c658ef6f44fea3d7895391565c4f7fe0b68af722247e6b6cdbbcd');
    expect(both.tools.registeredTools).toBe(4);
    expect(both.digest).toBe('2fb2e380b426c9c341b7bd29c8fe0d061a4337383e9ece825604fd5329221bba');
  });
  it('pins the research declaration in tool compositions and preserves non-web compositions (#744)', () => {
    const plain = describeComposition('opencode-go', 'deepseek-v4.1-flash', BASELINE_PROMPT_CONTRACT_DIGEST);
    const web = describeComposition('opencode-go', 'deepseek-v4.1-flash', BASELINE_PROMPT_CONTRACT_DIGEST, { platformTools: true });
    expect(web.researchDeclaration).toEqual({ webSearch: true, searchEngine: 'user-selected-backend' });
    expect(web.digest).toBe('ba328a177e73f47501260431dea68b98bc660d39e8850390ce85491e2aa97bc2');
    expect(plain).not.toHaveProperty('researchDeclaration');
    // Flipping the declaration flips the digest, both ways.
    expect(describeComposition('opencode-go', 'deepseek-v4.1-flash', BASELINE_PROMPT_CONTRACT_DIGEST,
      { platformTools: true, researchDeclaration: { webSearch: true, searchEngine: 'user-selected-backend' } }).digest).toBe(web.digest);
    expect(web.digest).not.toBe(plain.digest);
    expect(describeComposition('opencode-go', 'deepseek-v4.1-flash', BASELINE_PROMPT_CONTRACT_DIGEST,
      { researchDeclaration: { webSearch: false, searchEngine: null } }).digest).toBe(plain.digest);
    expect(() => describeComposition('opencode-go', 'deepseek-v4.1-flash', BASELINE_PROMPT_CONTRACT_DIGEST,
      { platformTools: true, researchDeclaration: { webSearch: false, searchEngine: null } })).toThrow('RESEARCH_DECLARATION_COMPOSITION_MISMATCH');
  });
  it('pins exactly the versions package.json declares', async () => {
    const manifest = JSON.parse(await readFile(resolve(REPO_ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    for (const [name, version] of Object.entries(HARNESS_PACKAGE_PINS)) expect(manifest.dependencies[name]).toBe(version);
    const descriptor = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, BASELINE_PROMPT_CONTRACT_DIGEST);
    expect(descriptor.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, BASELINE_PROMPT_CONTRACT_DIGEST).digest).toBe(descriptor.digest);
    expect(describeComposition('deepseek-open-platform', 'deepseek-v4-pro', BASELINE_PROMPT_CONTRACT_DIGEST).digest).not.toBe(descriptor.digest);
  });

  it('composes the six-service loop with zero tools, one route, and the complete AI7 prompt, then drives one unit turn through the gate', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'synthetic-usage-ceiling');
    const adapter = new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const sessionId = randomUUID();
    const bindingDigest = 'b'.repeat(64);
    let currentBinding: string | null = bindingDigest;
    const accepted = new Set<string>();
    const gateDecisions: string[] = [];
    const handle = await prepareExecution({
      sessionId,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: SYSTEM,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      adapterFactory: () => adapter,
      gate: (payload) => {
        const decision = evaluateEgress(payload, bindingFacts(bindingDigest), { currentBindingDigest: () => currentBinding, acceptedOutputDigests: accepted });
        gateDecisions.push(decision.decision);
        return decision;
      },
      onTransmitTicket: () => { throw new Error('no remote ticket may be issued under v1'); },
    });
    try {
      expect(handle.sessionId).toBe(sessionId);
      expect(handle.failureCodes.QUOTA_EXCEEDED_CODE).toBe('QUOTA');
      // The binding must be verified before the first model call; an unbound submit is refused.
      await expect(handle.submitUnit(ZERO_UNIT)).rejects.toMatchObject({ code: 'HARNESS_UNBOUND' });
      expect(() => handle.bindExecution({ harnessSessionId: randomUUID(), behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST }))
        .toThrowError(/HARNESS_BINDING_MISMATCH|不一致/u);
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });

      const outcome = await handle.submitUnit(ZERO_UNIT);
      expect(outcome.terminal).toBe('completed');
      expect(outcome.signals.map((signal) => signal.kind)).toEqual(['started', 'contentCandidate', 'usage', 'completed']);
      const candidate = outcome.signals.find((signal) => signal.kind === 'contentCandidate');
      expect(candidate?.kind === 'contentCandidate' && candidate.text.startsWith('{"schema":"ai7.baseline-manuscript-analysis.unit-result/1"')).toBe(true);
      expect(candidate?.kind === 'contentCandidate' ? candidate.digest : '').toBe(createHash('sha256').update(candidate?.kind === 'contentCandidate' ? candidate.text : '').digest('hex'));
      expect(outcome.signals.find((signal) => signal.kind === 'usage')).toEqual({ kind: 'usage', usage: { inputTokens: 900_000, outputTokens: 120_000 } });
      expect(outcome.span).toEqual({ sessionId, startSeq: 0, endSeq: expect.any(Number) });
      expect(outcome.span.endSeq).toBeGreaterThan(outcome.span.startSeq);
      expect(gateDecisions).toEqual(['transmit-local']);
      expect(adapter.servedRequests).toBe(1);
      if (candidate?.kind === 'contentCandidate') accepted.add(candidate.digest);

      // A stale binding refuses at the gate: nothing reaches the adapter and the turn ends interrupted.
      currentBinding = null;
      const refused = await handle.submitUnit(ZERO_UNIT);
      expect(refused.terminal).toBe('interrupted');
      expect(refused.signals.at(-1)).toMatchObject({ kind: 'interrupted', failure: { failureClass: 'egress-refused', code: 'AI7_EGRESS_REFUSED' } });
      expect(gateDecisions).toEqual(['transmit-local', 'refuse']);
      expect(adapter.servedRequests).toBe(1);
      expect(refused.span.startSeq).toBe(outcome.span.endSeq + 1);
    } finally {
      const spans = await handle.finish();
      expect(spans).toHaveLength(2);
      await expect(handle.submitUnit(ZERO_UNIT)).rejects.toMatchObject({ code: 'HARNESS_DISPOSED' });
    }
  });

  it('records an adapter failure as a failed terminal signal with the DSH-keyed class', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'synthetic-quota-exceeded');
    const adapter = new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const sessionId = randomUUID();
    const handle = await prepareExecution({
      sessionId,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: SYSTEM,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      adapterFactory: () => adapter,
      gate: () => ({ decision: 'transmit-local', payloadDigest: 'a'.repeat(64) }),
      onTransmitTicket: () => undefined,
    });
    try {
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      const outcome = await handle.submitUnit(ZERO_UNIT);
      expect(outcome.terminal).toBe('failed');
      expect(outcome.signals.at(-1)).toMatchObject({ kind: 'failed', failure: { failureClass: 'provider-account-limit', code: QUOTA_EXCEEDED_CODE } });
    } finally {
      await handle.finish();
    }
  });

  // Issue #1131: capacity is awaited before the final gate, and the permit is released exactly once on every path — after
  // the whole body, or at once when the gate refuses or throws or the owner's admission refuses — with nothing sent then.
  it.each(['completed', 'gate-refused', 'gate-throws', 'admission-throws'] as const)('releases the shared request permit once when the turn is %s', async (path) => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'synthetic-usage-ceiling');
    const adapter = new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const governor = new ModelRequestGovernor({ globalCapacity: 1 });
    const producer = governor.registerProducer({ key: `harness-${path}`, kind: 'analysis-unit', lane: 'foreground' });
    const occupancy: number[] = [];
    const observed = new Proxy(adapter, { get: (target, property) => property === 'stream'
      ? async function* (options: Parameters<typeof adapter.stream>[0]) {
        occupancy.push(governor.snapshot().inFlight); yield* target.stream(options); occupancy.push(governor.snapshot().inFlight);
      }
      : Reflect.get(target, property, target) });
    const order: string[] = [];
    const sessionId = randomUUID();
    const handle = await prepareExecution({
      sessionId, route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, systemPrompt: SYSTEM, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      adapterFactory: () => observed,
      acquireRequest: async (_payload, signal) => {
        const permit = await governor.acquire(producer, signal); order.push('granted');
        return {
          admit: () => { order.push('admitted'); if (path === 'admission-throws') throw new Error('owner refused the admission'); },
          release: () => { order.push('released'); permit.release(); },
        };
      },
      gate: () => {
        order.push('gate');
        if (path === 'gate-throws') throw new Error('gate failed');
        return path === 'gate-refused' ? { decision: 'refuse', reason: 'binding-stale', detail: '合成拒绝。' } : { decision: 'transmit-local', payloadDigest: 'a'.repeat(64) };
      },
      onTransmitTicket: () => { throw new Error('no remote ticket may be issued under v1'); },
    });
    try {
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      const outcome = await handle.submitUnit(ZERO_UNIT);
      expect(outcome.terminal).toBe(path === 'completed' ? 'completed' : path === 'gate-refused' ? 'interrupted' : 'failed');
      expect(order).toEqual(path === 'completed' ? ['granted', 'gate', 'admitted', 'released']
        : path === 'admission-throws' ? ['granted', 'gate', 'admitted', 'released'] : ['granted', 'gate', 'released']);
      expect(adapter.servedRequests).toBe(path === 'completed' ? 1 : 0);
      expect(occupancy).toEqual(path === 'completed' ? [1, 1] : []);
      expect(governor.snapshot()).toMatchObject({ registered: 1, waiting: 0, inFlight: 0 });
    } finally {
      await handle.finish();
      governor.unregisterProducer(producer); governor.close(); await governor.whenIdle();
    }
  });

  // Issue #51 (S16c): a request sent whose answer never came back whole ends the turn ambiguous — never failed, so no retry
  // table is ever asked about it — with the classified outcome the executor names the unit by.
  it('ends a turn whose result cannot be known as ambiguous, carrying the classified outcome', async () => {
    const synthetic = await loadModelFixture(FIXTURES_ROOT, 'synthetic-interrupted');
    const entry = [...synthetic.entries.values()][0]!;
    const fixture = {
      ...synthetic,
      entries: new Map([[fixtureEntryKey(entry.unitOrdinal, entry.requestDigest), { ...entry, response: { kind: 'outcome-unknown' as const, message: '合成：回答没有完整传回。' } }]]),
    };
    const adapter = new Ai7LocalDeterministicAdapter(fixture, BASELINE_PROMPT_CONTRACT_DIGEST, codes);
    const sessionId = randomUUID();
    const handle = await prepareExecution({
      sessionId,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: SYSTEM,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      adapterFactory: () => adapter,
      gate: () => ({ decision: 'transmit-local', payloadDigest: 'a'.repeat(64) }),
      onTransmitTicket: () => undefined,
    });
    try {
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      const outcome = await handle.submitUnit(ZERO_UNIT);
      expect(outcome.terminal).toBe('ambiguous');
      expect(outcome.signals.some((signal) => signal.kind === 'failed' || signal.kind === 'contentCandidate')).toBe(false);
      expect(outcome.signals.at(-1)).toMatchObject({
        kind: 'ambiguous',
        reason: '结果待确认：请求已发出，但回答没有完整传回，无法确认模型服务是否已处理并计费。',
        failure: { signal: 'ambiguous', failureClass: 'outcome-unknown', code: 'AI7_OUTCOME_UNKNOWN', retrySafe: false },
      });
    } finally {
      await handle.finish();
    }
  });
});
