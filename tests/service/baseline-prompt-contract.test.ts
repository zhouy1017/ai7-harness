import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import {
  BASELINE_PROMPT_CONTRACT_DIGEST,
  BASELINE_PROMPT_CONTRACT_V1_DIGEST,
  BASELINE_UNIT_RESULT_SCHEMA,
  unitRequestDigest,
} from '../../src/service/analysis/contract.js';
import {
  RETAINED_V1_RECORDED_FIXTURE_IDENTITY,
  type BaselinePromptContractSelection,
} from '../../src/service/analysis/kind-definition.js';
import { fixtureEntryKey, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { BaselineAnalysisRouteFacts } from '../../src/service/analysis/baseline-analysis-store.js';
import type { SecretResolver } from '../../src/service/provider/credential-broker.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateRequest,
  type CoverageManifestProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  SAMPLE1_UNITS,
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for Issue #826: a Book whose baseline was read under prompt contract /1 — unit 1 a gap for
// answering its notes as bare strings — is read again under /2 on the real store, as the existing product data will be.
// Every model answer is synthetic and built here in memory; no recorded fixture is replayed (ADR 0044 §Replay), and no
// Provider, socket, credential value or Effect is involved. The input is the admitted public `sample1` (ADR 0043).

/**
 * Route facts naming the recorded fixture's identity: the store admits /1 beside that route alone. The fixture bound with it
 * here is a synthetic in-memory stand-in under a synthetic digest; it carries no recorded byte.
 */
const SYNTHETIC_SHA = '5'.repeat(64);
const HISTORICAL_ROUTE: BaselineAnalysisRouteFacts = {
  fixtureIdentity: RETAINED_V1_RECORDED_FIXTURE_IDENTITY,
  fixtureSha256: SYNTHETIC_SHA,
  fixtureLineage: [{ identity: RETAINED_V1_RECORDED_FIXTURE_IDENTITY, sha256: SYNTHETIC_SHA }],
};

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-prompt-contract-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
});

afterEach(async () => {
  await roots.dispose();
});

function open(route: BaselineAnalysisRouteFacts | null, baselinePromptContract?: BaselinePromptContractSelection): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: route,
    ...(baselinePromptContract === undefined ? {} : { baselinePromptContract }),
  });
}

function fakeSecretResolver(): SecretResolver {
  return { resolve: async () => null };
}

function prepare(store: EditorialStore, bookId: string, update: BaselineAnalysisUpdateRequest | null = null): BaselineAnalysisProjection {
  const goal = update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode];
  let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

/** A synthetic unit answer: valid notes, or — the #807 shape — the unresolved items as bare strings. */
function unitAnswer(unitOrdinal: number, bareStringNotes: boolean): string {
  return JSON.stringify({
    schema: BASELINE_UNIT_RESULT_SCHEMA, unitOrdinal, synopsis: `合成概述（单元 ${unitOrdinal}）。`,
    entities: [], events: [], relationships: [], settingClaims: [], conflicts: [],
    unresolved: bareStringNotes ? ['合成未确定事项。'] : [{ description: '合成未确定事项。', sourceRanges: [] }],
    confidence: 'medium',
  });
}

/** Unit answers keyed by the request digests `promptContractDigest` derives over this manifest; no stage turn is answered. */
function syntheticFixture(manifest: CoverageManifestProjection, promptContractDigest: string, bareStringUnits: ReadonlySet<number>): ResolvedModelFixture {
  const entries = new Map<string, ModelFixtureEntry>();
  for (const unit of manifest.units) {
    const requestDigest = unitRequestDigest(promptContractDigest, unit.ordinal, unit.digest);
    entries.set(fixtureEntryKey(unit.ordinal, requestDigest), {
      unitOrdinal: unit.ordinal, requestDigest, attempt: null, contentDigest: null,
      response: { kind: 'unit-result', text: unitAnswer(unit.ordinal, bareStringUnits.has(unit.ordinal)), usage: { inputTokens: 100, outputTokens: 20 } },
    });
  }
  return {
    identity: RETAINED_V1_RECORDED_FIXTURE_IDENTITY, description: '合成夹具（#826）。', provenance: 'authored',
    lineage: HISTORICAL_ROUTE.fixtureLineage, entries, sha256: SYNTHETIC_SHA,
  };
}

async function authorizeAndSettle(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, bookId: string, prepared: BaselineAnalysisProjection) {
  const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  owner.admitAndDispatch(authorized.dispatchRunRecordId!);
  await owner.whenIdle();
  return store.inspectBaselineAnalysis(bookId, (runRecordId) => owner.progressFor(runRecordId));
}

describe('baseline prompt contract /1 → /2 on the real store (Issue #826)', () => {
  it('refuses /1 beside any route but the recorded fixture alone, and asks /2 by default', async () => {
    for (const route of [
      null,
      { ...HISTORICAL_ROUTE, fixtureIdentity: 'sample1-baseline-happy', fixtureLineage: [{ identity: 'sample1-baseline-happy', sha256: SYNTHETIC_SHA }] },
      { ...HISTORICAL_ROUTE, fixtureLineage: [...HISTORICAL_ROUTE.fixtureLineage, { identity: 'sample1-baseline-happy', sha256: SYNTHETIC_SHA }] },
      { ...HISTORICAL_ROUTE, fixtureLineage: [{ identity: 'sample1-baseline-happy', sha256: SYNTHETIC_SHA }] },
    ]) {
      await expect(open(route, 'retained-v1')).rejects.toMatchObject({ code: 'ANALYSIS_PROMPT_CONTRACT_REFUSED' });
    }
    await expect(open(null, 'retained-v3' as BaselinePromptContractSelection)).rejects.toMatchObject({ code: 'ANALYSIS_PROMPT_CONTRACT_REFUSED' });
    for (const [route, selection] of [[null, undefined], [null, 'current'], [HISTORICAL_ROUTE, undefined]] as const) {
      const store = await open(route, selection);
      try {
        expect(store.baselineAnalysisLedger.definition.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
      } finally {
        store.close();
      }
    }
    const historical = await open(HISTORICAL_ROUTE, 'retained-v1');
    try {
      expect(historical.baselineAnalysisLedger.definition.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_V1_DIGEST);
      // Only the baseline kind is retained: the other kinds' ledgers ask under their own contracts as before.
      expect(historical.factualReviewLedger.definition.promptContractDigest).not.toBe(BASELINE_PROMPT_CONTRACT_V1_DIGEST);
    } finally {
      historical.close();
    }
  });

  it('reads a /1 revision with a unit-1 gap under /2 and re-reads the unit-1 range closure there alone', async () => {
    await requireExactSample1(roots.codeRoot);
    // --- The /1 launch: the first baseline, unit 1 answered with bare-string notes, as S40/first-baseline/9 was.
    let store = await open(HISTORICAL_ROUTE, 'retained-v1');
    let bookId: string;
    let manifest: CoverageManifestProjection;
    let revision1: NonNullable<BaselineAnalysisProjection['resultSetRevision']>;
    let staleRunRecordId: string;
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 提示契约 v2');
      bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const prepared = prepare(store, bookId);
      manifest = prepared.coverageManifest!;
      expect(manifest.units).toHaveLength(SAMPLE1_UNITS);
      expect(prepared.planEnvelope?.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_V1_DIGEST);
      const owner = new BaselineAnalysisExecutionOwner({
        ledger: store.baselineAnalysisLedger, launchPolicy, fixture: syntheticFixture(manifest, BASELINE_PROMPT_CONTRACT_V1_DIGEST, new Set([1])),
        secretResolver: fakeSecretResolver(),
      });
      const settled = await authorizeAndSettle(store, owner, bookId, prepared);
      expect(settled.run?.state).toBe('completed-with-gaps');
      revision1 = settled.resultSetRevision!;
      expect(settled.run?.attempt?.executionBinding?.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_V1_DIGEST);
      expect(revision1.units.map((unit) => unit.state)).toEqual(['gap', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']);
      expect(revision1.gaps[0]).toMatchObject({ unitOrdinal: 1, reason: expect.stringContaining('未解决事项不符合契约 v1。') });

      // A /1 range Task authorized but never dispatched before the release changes the contract.
      const stale = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: null, selectedBlocks: { fromBlockId: manifest.units[0]!.blockIds[1]!, toBlockId: manifest.units[0]!.blockIds[1]! } });
      staleRunRecordId = store.authorizeBaselineAnalysis(bookId, stale.taskIntent!.taskIntentId, stale.planEnvelope!.digest).dispatchRunRecordId!;
      await owner.dispose();
    } finally {
      store.close();
    }

    // --- The /2 launch over the same data: nothing about the /1 revision is refused, and its facts read as they were.
    store = await open(HISTORICAL_ROUTE);
    try {
      expect(store.baselineAnalysisLedger.definition.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
      const reopened = store.inspectBaselineAnalysis(bookId);
      expect(reopened.resultSetRevision).toMatchObject({
        revisionId: revision1.revisionId, digest: revision1.digest, bindingPin: revision1.bindingPin, coverage: revision1.coverage,
      });
      expect(reopened.resultSetRevision!.units.map((unit) => unit.state)).toEqual(revision1.units.map((unit) => unit.state));
      // The baseline kind recomputes rather than leaving units unreviewed, so no unread-changes walk reads its contracts.
      expect(store.baselineAnalysisLedger.unreadChanges(bookId)).toMatchObject({ units: 0, cut: null });

      const v2Fixture = syntheticFixture(manifest, BASELINE_PROMPT_CONTRACT_DIGEST, new Set());
      const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture: v2Fixture, secretResolver: fakeSecretResolver() });
      // The Run /1 froze is not carried by a launch asking /2: its composition drifted, and nothing is sent.
      owner.admitAndDispatch(staleRunRecordId);
      await owner.whenIdle();
      const refused = store.inspectBaselineAnalysis(bookId, (runRecordId) => owner.progressFor(runRecordId));
      expect(refused.run?.state).toBe('failed');
      expect(JSON.stringify(refused.run)).toContain('EXECUTION_COMPOSITION_DRIFT');
      expect(refused.run?.attempt?.spans ?? []).toEqual([]);

      // 重新分析所选范围 over one interior block of unit 1: the range closure, read under /2; every other unit reused.
      const interior = manifest.units[0]!.blockIds[1]!;
      const prepared = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: null, selectedBlocks: { fromBlockId: interior, toBlockId: interior } });
      expect(prepared.planEnvelope?.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
      expect(prepared.update?.predecessor?.revisionId).toBe(revision1.revisionId);
      const plan = prepared.update!.reusePlan!;
      const recomputed = plan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal);
      const reused = plan.units.filter((unit) => unit.disposition === 'reused');
      // Unit 2 reads unit 1's last block as its overlap, so the closure of a unit-1 block is units 1 and 2 (#826 Commander).
      expect(recomputed).toEqual([1, 2]);
      expect(plan.counts).toEqual({ reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 });
      expect(reused.every((unit) => unit.reusedFrom?.revisionId === revision1.revisionId)).toBe(true);
      expect(reused.length + recomputed.length).toBe(SAMPLE1_UNITS);

      const settled = await authorizeAndSettle(store, owner, bookId, prepared);
      const revision2 = settled.resultSetRevision!;
      expect(revision2.revisionId).not.toBe(revision1.revisionId);
      expect(settled.run?.attempt?.executionBinding?.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
      // Only the closure was asked, and under /2: the fixture answers /2's request digests alone.
      expect(settled.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual(recomputed);
      expect(revision2.units.map((unit) => unit.state)).toEqual(Array.from({ length: SAMPLE1_UNITS }, () => 'closed'));
      expect(revision2.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS, gapCount: 0 });
      await owner.dispose();
    } finally {
      store.close();
    }
  });
});
