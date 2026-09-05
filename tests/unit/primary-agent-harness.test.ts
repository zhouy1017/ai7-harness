import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, evaluateEgress, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { Ai7LocalDeterministicAdapter } from '../../src/service/provider/local-deterministic-adapter.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { HARNESS_PACKAGE_PINS, describeComposition, prepareExecution } from '../../src/service/harness/primary-agent-harness.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

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
      adapter,
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
      adapter,
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
});
