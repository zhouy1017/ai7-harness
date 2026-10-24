import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { canonicalJson } from '../../src/service/analysis/canonical.js';
import { describeComposition, prepareExecution } from '../../src/service/harness/primary-agent-harness.js';
import { Ai7LocalDeterministicAdapter } from '../../src/service/provider/local-deterministic-adapter.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { LOCAL_TOOL_DECLARATION_NAMES, readLocalToolsRule } from '../../src/service/provider/local-tools.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { toolResultOf, type AssembledModelPayload } from '../../src/service/provider/payload.js';
import { evaluateEgress, LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { RetrievalIndex } from '../../src/service/retrieval/index.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { reviewCategoryContract } from '../../src/service/review/review-category-contract.js';
import { reviewCategoryContractInput, reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition, withReviewLocalTools, pinnedReviewDefinition } from '../../src/service/review/review-category-kind.js';
import { taskMaterialKindDefinition, taskMaterialWords, liveMaterialContract } from '../../src/service/task-material-references.js';
import { writingMaterialDigest } from '../../src/service/writing-tasks.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { liveKindAdmission } from '../../src/service/analysis/live-kind-admission.js';
import { withModelClarification } from '../../src/service/provider/clarification-contract.js';

installNodeNetworkDenial();
// @ts-expect-error tools/*.mjs carry no declarations; the generator is exercised as the plain module it is.
const generator = (await import('../../tools/generate-model-fixture.mjs')) as unknown as { authoredToolScriptEntries: (input: Record<string, unknown>) => unknown[] };
const rule =readLocalToolsRule({ localTools: { declarations: LOCAL_TOOL_DECLARATION_NAMES.map((name) => ({ name, readOnly: true, concurrencySafe: true })),
  parallelCallsAllowed: true, targetedRetrieval: { allowed: true, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8,
    exactFetchRequiredBeforeCitation: true, scope: 'no-egress' }, breaker: { roundTrips: 128, end: '检索未完成' } } })!;

describe('declared local-tool turns', () => {
  it('rebuilds a real material wrapper around the tool-aware base and retains its old frozen definition', async () => {
    const base = reviewCategoryKindDefinition(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!));
    const source = { materialId: '11111111-1111-4111-8111-111111111111', indexDigest: 'a'.repeat(64), title: '合成资料', characters: 4, sha256: writingMaterialDigest(['固定资料']) };
    const wrapped = taskMaterialKindDefinition(base, { bookId: '22222222-2222-4222-8222-222222222222', references: [source] }, [taskMaterialWords(source, ['固定资料'])]);
    const next = withReviewLocalTools(wrapped, rule);
    expect(liveMaterialContract(next)?.sources).toEqual(liveMaterialContract(wrapped)?.sources);
    expect(liveMaterialContract(next)?.materials).toEqual(liveMaterialContract(wrapped)?.materials);
    expect(next.systemPrompt).toContain('read_blocks');
    expect(next.systemPrompt).toContain('固定资料');
    expect(pinnedReviewDefinition(next, wrapped.promptContractDigest)).toBe(wrapped);
    expect(withReviewLocalTools(next, null)).toBe(wrapped);
    const oldClarified = withModelClarification(wrapped);
    expect(pinnedReviewDefinition(withModelClarification(next), oldClarified.promptContractDigest).promptContractDigest).toBe(oldClarified.promptContractDigest);
    const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0], credentialReference: '33333333-3333-4333-8333-333333333333' };
    const policy = await resolveSourceCheckoutLaunchPolicy(resolve('.'), 'ordinary-production', binding);
    expect(liveKindAdmission(policy, next, binding)).not.toBeNull();
  });
  it('keeps both earlier review prompts frozen and names only the admitted tool in the successor', () => {
    const input = reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!);
    for (const version of [1, 2] as const) expect(reviewCategoryContract(input, version).systemPrompt).toContain('不调用任何工具');
    const next = reviewCategoryContract(input, 2, ['read_blocks']);
    expect(next.schema).toBe('ai7.editorial-review.prompt-contract/3');
    expect(next.systemPrompt).not.toContain('不调用任何工具');
    expect(next.systemPrompt).toContain('read_blocks');
    expect(next.systemPrompt).not.toContain('search_manuscript');
  });

  it('reads only pinned blocks and snapshot records, without a live-ledger or external source seam', () => {
    const sources = { baseline: { revisionId: 'fixed', digest: 'a'.repeat(64), entities: [{ name: '合成名', kind: 'person' }], events: [], settingClaims: [] },
      guidelines: [{ documentId: 'fixed-guideline', version: '2', clauses: [{ clauseId: 'clause/1', text: '固定条款' }] }], terms: [{ name: '固定术语' }] };
    const index = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'one-book', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: '合成文本' }, { blockId: 'two', text: '另一段' }] }) }], null, null, sources);
    sources.terms[0]!.name = '改动后的表';
    expect(index.readBlocks('one', 1)).toHaveLength(2);
    expect(() => index.readBlocks('other-book-block', 1)).toThrow('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    expect(index.searchManuscript('合成', 'exact').map((block) => block.blockId)).toEqual(['one']);
    expect(index.searchManuscript('合成文本', 'tokenized').map((block) => block.blockId)).toEqual(['one']);
    expect(index.pinnedRecords('baseline_facts')).toMatchObject({ revisionId: 'fixed' });
    expect(index.pinnedRecords('guideline_clause', 'clause/1')).toEqual([{ documentId: 'fixed-guideline', version: '2', clauseId: 'clause/1', text: '固定条款' }]);
    expect(index.pinnedRecords('term_table')).toEqual([{ name: '固定术语' }]);
    index.dispose();
    expect(() => index.pinnedRecords('term_table')).toThrow('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
  });
  it('keeps explicit v1 bytes and gives v2 an exact named subset and resolved bound', () => {
    const old = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, 'a'.repeat(64), { localTools: true });
    expect(canonicalJson(old)).not.toContain('"version"');
    expect(describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, 'a'.repeat(64), { version: 1, localTools: rule }).digest).toBe(old.digest);
    const subset = { ...rule, declarations: rule.declarations!.filter((entry) => entry.name === 'read_blocks'), parallelCallsAllowed: false };
    const next = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, 'a'.repeat(64), { version: 2, localTools: subset });
    expect(next.localTools?.names).toEqual(['read_blocks']);
    expect(next.agentLoop.maxParallelToolCalls).toBe(1);
    expect(next.localTools?.callsPerUnit).toBe(5);
    expect(next.localTools?.parallelCallsAllowed).toBe(false);
    // The permission resolves to the per-unit cap; the descriptor pins both the bound and what it was derived from.
    const parallel = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, 'a'.repeat(64), { version: 2, localTools: { ...subset, parallelCallsAllowed: true } });
    expect(parallel.agentLoop.maxParallelToolCalls).toBe(5);
    expect(parallel.tools.maxParallelSubCalls).toBe(5);
    expect(parallel.localTools?.parallelCallsAllowed).toBe(true);
    expect(parallel.digest).not.toBe(next.digest);
  });

  it('replays an authored two-call review through real DSH parallel dispatch and exact result admission', async () => {
    const digest = 'a'.repeat(64);
    const blockId = `blk_${'b'.repeat(24)}`;
    const message = `审阅单元 1/1 · 类别 typos-and-usage · 单元摘要 ${'0'.repeat(64)}\n以下为本单元需要审阅的内容块：\n[1] [${blockId}] (paragraph) 合成段落。`;
    const fixture = await loadModelFixture(resolve('tests/fixtures/model'), 'synthetic-local-tool-turn');
    const adapter = new Ai7LocalDeterministicAdapter(fixture, digest, { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE });
    const binding = { bindingDigest: digest, route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, systemPrompt: '合成审阅',
      outboundDataCategory: 'public-or-synthetic' as const, localTools: rule, admittedUserMessages: new Set([message]),
      policy: { operationalScope: 'development-ci' as const, providerProcessingVersion: 'v1' as const, liveTransmissionAllowed: false as const, authorizedLiveTransmissionCount: 0 as const } };
    const index = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest,
      read: () => ({ digest, segments: [{ blockId, text: '合成段落。' }] }) }]);
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => digest, acceptedOutputDigests: new Set() }, retrieval: index, purpose: 'authored-unit' });
    let active = 0;
    let peak = 0;
    const owner = { ...session, acceptToolCallMessage: (value: string) => session.acceptToolCallMessage(value), admit: session.admit.bind(session),
      execute: async (call: Parameters<PlatformToolSession['execute']>[0]) => {
        active++; peak = Math.max(peak, active);
        await new Promise((done) => setTimeout(done, 5));
        try { return await session.execute(call); } finally { active--; }
      } };
    const decisions: string[] = [];
    const payloads: AssembledModelPayload[] = [];
    const handle = await prepareExecution({ sessionId: randomUUID(), route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: binding.systemPrompt, promptContractDigest: digest, compositionOptions: { version: 2, localTools: rule }, localToolsRule: rule,
      localTools: owner, adapterFactory: () => adapter, onTransmitTicket: () => { throw new Error('NO_EGRESS'); },
      gate: (payload) => { payloads.push(payload); const decision = evaluateEgress(payload, binding, session.egressScope); decisions.push(decision.decision); return decision; } });
    try {
      handle.bindExecution({ harnessSessionId: handle.sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: digest });
      const turn = await handle.submitUnit(message);
      expect(turn.terminal).toBe('completed');
      expect(peak).toBe(2);
      expect(decisions).toEqual(['transmit-local', 'transmit-local']);
      expect(turn.signals.find((signal) => signal.kind === 'usage')).toMatchObject({ usage: { inputTokens: 24, outputTokens: 12 } });
      expect(session.usage.localToolCalls).toEqual({ read_blocks: 1, search_manuscript: 1 });
      // The generator authors exactly these entries from the same script and the admitted results: the next entry is keyed
      // on the ordered result bytes, never on the call ids minted per replay.
      const results = payloads.at(-1)!.messages.flatMap((entry) => { const result = toolResultOf(entry); return result === null ? [] : [{ text: result.text, isError: result.isError }]; });
      expect(results).toHaveLength(2);
      const authored = JSON.parse(await readFile(resolve('tests/fixtures/model/synthetic-local-tool-turn.json'), 'utf8')) as { entries: Array<{ requestDigest: string; response: Record<string, unknown> }> };
      const script = authored.entries[0]!.response as { calls: unknown[]; usage: unknown };
      const reply = authored.entries[1]!.response as { text: string; usage: unknown };
      expect(generator.authoredToolScriptEntries({ unitOrdinal: 1, requestDigest: authored.entries[0]!.requestDigest, calls: script.calls, results,
        text: reply.text, usage: script.usage })).toEqual(authored.entries);
    } finally { await handle.finish(); index.dispose(); }
  });
});
