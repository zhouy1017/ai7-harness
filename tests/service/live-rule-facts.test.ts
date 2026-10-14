import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnalysisError, BaselineAnalysisStore, type LaunchBinding } from '../../src/service/analysis/baseline-analysis-store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { EditorialStore } from '../../src/service/store.js';
import { writingKindDefinition } from '../../src/service/writing/writing-kind.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { withoutRuleFor } from '../support/policy-rules.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// #810 via #429's shared seam: the facts a 默认执行规则 binds are read under developer-live for writing's quick start alone,
// with its ceiling over the units the next checkpoint would freeze; every other kind and launch reads exactly as before.
// Exact sample1; no transport, credential value or manuscript text is involved.

let roots: ServiceTestRoots;
let store: EditorialStore;
let database: DatabaseSync;
let bookId: string;
let selected: LaunchPolicyProjection;

const writing = writingKindDefinition({
  type: { typeId: 'promotion-article', label: '宣传文章' },
  book: { title: '合成书名', authors: ['作者甲'], editors: [], series: [] },
  audience: '历史爱好者', channel: '公众号', requirements: null,
  synopsis: { text: '一位学者收到一封古怪的信。', excerpt: false, characters: [{ name: '学者甲', note: null }] },
  evaluation: { conclusion: '推荐出版', strengths: ['结构完整'], market: { readers: ['青年读者'], sellingPoints: ['悬疑'], channels: ['线上'] } },
  exemplars: [],
});

function live(policy: LaunchPolicyProjection): LaunchBinding {
  return {
    operationalScope: 'developer-live', policy,
    live: {
      route: DEVELOPER_LIVE_POLICY_BINDING.route, model: DEVELOPER_LIVE_POLICY_BINDING.model, endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
      credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
      runBudgetCeiling: { kind: 'tokens-per-frozen-unit', tokensPerFrozenUnit: 30_000 },
    },
  };
}

function refusedCode(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof AnalysisError) return error.code;
    throw error;
  }
  return 'read';
}

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-live-rule-facts-');
  await requireExactSample1(roots.codeRoot);
  selected = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  bookId = (await importSample1Book(store, roots.codeRoot, 'L2 sample1 rule facts')).bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑角色连接');
  database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
});

afterEach(async () => {
  database?.close();
  store?.close();
  await roots?.dispose();
});

describe('default execution rule facts under developer-live (#810)', () => {
  it('reads writing\'s facts live under a selected writing rule, with the ceiling over the working units', () => {
    const ledger = new BaselineAnalysisStore(database, {} as never, null, writing);
    // Provider-free: the reading it always had, with no unit-count ceiling.
    expect(ledger.currentRuleFacts(bookId, 'writing-first').runBudgetCeiling).toBe('unset');
    ledger.bindLaunch(live(selected));
    const facts = ledger.currentRuleFacts(bookId, 'writing-first');
    expect(facts.providerBinding).toMatchObject({ providerId: DEVELOPER_LIVE_POLICY_BINDING.route, modelId: DEVELOPER_LIVE_POLICY_BINDING.model });
    // Exact sample1 freezes eight units: the per-frozen-unit default over them.
    expect(facts.runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: 240_000 });
  });

  it('refuses every other kind live, and writing under a policy that names no writing rule', () => {
    const baseline = new BaselineAnalysisStore(database, {} as never, null);
    expect(baseline.currentRuleFacts(bookId, 'first-baseline').runBudgetCeiling).toBe('unset');
    baseline.bindLaunch(live(selected));
    expect(refusedCode(() => baseline.currentRuleFacts(bookId, 'first-baseline'))).toBe('ANALYSIS_RULE_FACTS_INVALID');
    const ledger = new BaselineAnalysisStore(database, {} as never, null, writing);
    ledger.bindLaunch(live(withoutRuleFor(selected, 'writing')));
    expect(refusedCode(() => ledger.currentRuleFacts(bookId, 'writing-first'))).toBe('ANALYSIS_RULE_FACTS_INVALID');
  });
});
