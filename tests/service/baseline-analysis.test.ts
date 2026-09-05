import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { SecretResolver } from '../../src/service/provider/credential-broker.js';
import { ANALYSIS_LEDGER_SCHEMA_SQL, ANALYSIS_LEDGER_TRIGGER_SQL, TASK_AUTHORIZATION_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  SAMPLE1_BLOCKS,
  SAMPLE1_UNITS,
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for the covered baseline analysis: the real store, the real pinned
// DSH composition, the AI7 local deterministic adapter over fixture (i)+(ii), and a fake secret
// resolver. The manuscript is exact `sample1` (ADR 0043); no Provider, socket, credential value, or
// Effect is involved, and nothing here reads the DOCX outside the supported import path.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-analysis-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(dataRoot: string, route: ResolvedModelFixture | null): Promise<EditorialStore> {
  return EditorialStore.open(dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: route === null ? null : { fixtureIdentity: route.identity, fixtureSha256: route.sha256, fixtureLineage: route.lineage },
  });
}

function fakeSecretResolver(): SecretResolver & { reads: string[] } {
  const reads: string[] = [];
  return { reads, resolve: async (reference) => { reads.push(reference); return null; } };
}

function prepare(store: EditorialStore, bookId: string): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  expect(progress.projection).not.toBeNull();
  return progress.projection!;
}

async function settle(owner: BaselineAnalysisExecutionOwner, store: EditorialStore, bookId: string): Promise<BaselineAnalysisProjection> {
  await owner.whenIdle();
  return store.inspectBaselineAnalysis(bookId, (runRecordId) => owner.progressFor(runRecordId));
}

describe('baseline manuscript analysis over the real store on exact sample1', () => {
  it('executes the authorized Run through the real path and reaches one immutable Result Set Revision', async () => {
    await requireExactSample1(roots.codeRoot);
    const resolver = fakeSecretResolver();
    const store = await openWithRoute(roots.dataRoot, fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: resolver });
    let bookId: string;
    let revisionId: string;
    let attemptId: string;
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 基线分析');
      bookId = imported.bookId;

      // Before the preconditions exist the surface stays closed, exactly like J-03's.
      expect(() => store.inspectBaselineAnalysis(bookId)).toThrowError(StoreError);
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      const credentialReference = recordMissingCredentialConnection(store, 'L2 主编辑连接');

      const available = store.inspectBaselineAnalysis(bookId);
      expect(available.state).toBe('available');
      expect(available.actions).toEqual({ canPrepare: true, canAuthorize: false });
      expect(available.namedNonEffects.some((statement) => statement.includes('Enrollment'))).toBe(true);

      const prepared = prepare(store, bookId);
      expect(prepared.state).toBe('prepared');
      expect(prepared.taskIntent?.goal).toBe(BASELINE_ANALYSIS_TASK_GOAL);
      expect(prepared.checkpoint?.revisionId).toBe(imported.revisionId);
      expect(prepared.checkpoint?.createdForDirtyJournal).toBe(false);
      const manifest = prepared.coverageManifest!;
      expect(manifest.totalBlocks).toBe(SAMPLE1_BLOCKS);
      expect(manifest.units).toHaveLength(SAMPLE1_UNITS);
      expect(manifest.units.map((unit) => unit.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(manifest.units.every((unit) => unit.graphemes <= manifest.parameters.unitBudgetGraphemes)).toBe(true);
      expect(manifest.units.slice(1).every((unit) => unit.overlapBlockIds.length === manifest.parameters.overlapBlocks)).toBe(true);
      expect(manifest.digest).toMatch(DIGEST_PATTERN);
      // The fixture is keyed by the exact request digests this manifest derives.
      for (const unit of manifest.units) {
        expect(fixture.entries.get(unit.ordinal)?.requestDigest).toBe(unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest));
      }
      expect(prepared.providerResolutionPlan?.remoteBinding.credentialReference).toBe(credentialReference);
      expect(prepared.providerResolutionPlan?.remoteBinding.credentialReadiness).toBe('missing');
      expect(prepared.providerResolutionPlan?.remoteBinding.providerProcessing).toEqual({ operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 });
      expect(prepared.providerResolutionPlan?.executionRoute).toMatchObject({ kind: 'ai7-local-deterministic', fixtureIdentity: 'sample1-baseline-one-unit-failure', fixtureSha256: fixture.sha256 });
      expect(prepared.planEnvelope).toMatchObject({ dispatchAllowed: true, providerStatus: 'remote-denied-local-deterministic', promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      expect(prepared.executionPlan?.unitCount).toBe(SAMPLE1_UNITS);
      expect(prepared.actions).toEqual({ canPrepare: false, canAuthorize: true });
      // Preparing again returns the frozen plan.
      expect(prepare(store, bookId).planEnvelope?.digest).toBe(prepared.planEnvelope!.digest);

      const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(authorized.projection.authorization).toMatchObject({ origin: 'standard-direct', authority: 'standard-direct-dispatch' });
      expect(authorized.projection.run?.state).toBe('authorized');
      expect(authorized.dispatchRunRecordId).toBe(authorized.projection.run!.runRecordId);
      owner.admitAndDispatch(authorized.dispatchRunRecordId!);
      const admitted = store.inspectBaselineAnalysis(bookId, (runRecordId) => owner.progressFor(runRecordId));
      expect(['admitted', 'executing']).toContain(admitted.state);
      expect(admitted.run?.progress).toMatchObject({ unitsTotal: SAMPLE1_UNITS });
      expect(() => owner.admitAndDispatch(authorized.dispatchRunRecordId!)).toThrowError(/EXECUTION_BUSY|一次只执行一个运行/u);

      const settled = await settle(owner, store, bookId);
      expect(settled.state).toBe('settled');
      expect(settled.run?.state).toBe('completed-with-gaps');
      expect(settled.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing', 'completed-with-gaps']);
      const attempt = settled.run!.attempt!;
      attemptId = attempt.attemptId;
      expect(attempt.credentialReadinessCheck).toEqual({ slot: 'deepseek-api-key', readiness: 'missing', valueReleased: false });
      expect(resolver.reads).toEqual([credentialReference]);
      const binding = attempt.executionBinding!;
      expect(binding).toMatchObject({
        planEnvelopeDigest: prepared.planEnvelope!.digest,
        coverageManifestDigest: manifest.digest,
        promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
        behaviorCompositionDigest: prepared.planEnvelope!.behaviorCompositionDigest,
        route: 'ai7-local-deterministic',
        fixtureIdentity: 'sample1-baseline-one-unit-failure',
        sidecarRevision: 2,
      });
      expect(binding.harnessSessionId).toMatch(UUID_PATTERN);
      expect(attempt.spans).toHaveLength(SAMPLE1_UNITS);
      expect(attempt.spans.every((span) => span.harnessSessionId === binding.harnessSessionId && span.endSeq > span.startSeq)).toBe(true);
      expect(attempt.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      const revision = settled.resultSetRevision!;
      revisionId = revision.revisionId;
      expect(revision.ordinal).toBe(1);
      expect(revision.manuscriptPin.revisionId).toBe(imported.revisionId);
      expect(revision.coverageManifestDigest).toBe(manifest.digest);
      expect(revision.bindingPin).toMatchObject({ attemptId, bindingDigest: binding.bindingDigest, harnessSessionId: binding.harnessSessionId });
      expect(revision.policyPin).toEqual({ operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v3', liveTransmissions: 0 });
      expect(revision.usage.requests).toBe(SAMPLE1_UNITS);
      // Four independent axes; no aggregate flag.
      expect(revision.coverage).toMatchObject({ axis: 'coverage', state: 'partial', unitsTotal: 8, unitsClosed: 7, gapCount: 1 });
      expect(revision.reducerClosure).toMatchObject({ axis: 'reducer-closure', state: 'closed-with-gaps' });
      expect(revision.freshness).toMatchObject({ axis: 'freshness', state: 'current', boundRevisionId: imported.revisionId, comparison: 'local-deterministic' });
      expect(revision.assurance).toMatchObject({ axis: 'assurance', state: 'qualified-with-open-conflicts' });
      expect(revision.assurance.unresolvedConflictCount).toBe(revision.conflicts.length);
      expect(JSON.stringify(revision)).not.toMatch(/"complete":/u);
      // The exact gap: unit 2, the adapter failure, with its exact block range.
      const unit2 = manifest.units[1]!;
      expect(revision.gaps).toEqual([{
        unitOrdinal: 2, code: 'adapter-failure', reason: expect.stringContaining('SYNTHETIC_ADAPTER_FAILURE'),
        startPosition: unit2.startPosition, endPosition: unit2.endPosition, blockIds: [...unit2.blockIds],
      }]);
      // The deterministic contradiction pass reported the planted divergences and resolved none.
      expect(revision.conflicts.map((conflict) => conflict.kind)).toEqual(['unit-reported', 'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence']);
      const claim = revision.conflicts.find((conflict) => conflict.kind === 'setting-claim-divergence')!;
      expect(claim.unitOrdinals).toEqual([1, 3]);
      expect(claim.sourceRanges.every((range) => manifest.units.some((unit) => unit.blockIds.includes(range.blockId)))).toBe(true);
      // Unit results: seven closed with exact in-unit ranges, one gap; lineage preserved.
      expect(revision.units.map((unit) => unit.state)).toEqual(['closed', 'gap', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']);
      const firstUnit = revision.units[0]!;
      expect(firstUnit.state === 'closed' && firstUnit.entities[0]?.sourceRanges[0]?.blockId).toBe(manifest.units[0]!.blockIds[0]);
      expect(firstUnit.state === 'closed' ? firstUnit.usage : null).toEqual({ inputTokens: 1400, outputTokens: 360 });
      expect(revision.synthesis.entities.find((entity) => entity.name === '合成之城')?.unitOrdinals).toEqual([1, 3, 5]);
      expect(revision.sections).toHaveLength(1);
      expect(revision.sections[0]!.gapUnitOrdinals).toEqual([2]);
      // The Task Outcome links the revision.
      expect(settled.taskOutcome).toMatchObject({ classification: 'completed-with-gaps', resultSetRevisionId: revisionId });
      expect(settled.actions).toEqual({ canPrepare: false, canAuthorize: false });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }

    // Restart reads the identical revision from durable state, and an acknowledged edit makes freshness stale.
    const reopened = await openWithRoute(roots.dataRoot, fixture);
    try {
      const restarted = reopened.inspectBaselineAnalysis(bookId);
      expect(restarted.state).toBe('settled');
      expect(restarted.resultSetRevision?.revisionId).toBe(revisionId);
      expect(restarted.resultSetRevision?.freshness.state).toBe('current');
      expect(restarted.run?.attempt?.attemptId).toBe(attemptId);
      const window = reopened.getManuscriptWindow(restarted.checkpoint!.manuscriptId, restarted.checkpoint!.branchId, null);
      const block = window.blocks[0]!;
      const acknowledgement = reopened.flushJournalEdit({
        clientEditId: randomUUID(),
        manuscriptId: window.manuscriptId,
        branchId: window.branchId,
        baseRevisionId: window.revisionId,
        blockId: block.blockId,
        windowStartBlockId: block.blockId,
        baseBlockDigest: block.digest,
        expectedJournalSequence: window.journalSequence,
        fromGrapheme: 0,
        toGrapheme: 0,
        insertText: '（L2 基线分析后已确认编辑）',
      });
      expect(acknowledgement.completionLabel).toBe('已写入修订日志');
      const stale = reopened.inspectBaselineAnalysis(bookId);
      expect(stale.resultSetRevision?.revisionId).toBe(revisionId);
      expect(stale.resultSetRevision?.freshness).toMatchObject({ state: 'stale', boundRevisionId: restarted.checkpoint!.revisionId, currentJournalSequence: acknowledgement.sequence });
      expect(stale.resultSetRevision?.coverage).toEqual(restarted.resultSetRevision?.coverage);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }

    // Every analysis relation with rows rejects update and delete in the database itself.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(TASK_AUTHORIZATION_SCHEMA_VERSION);
      for (const table of Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL)) {
        const total = (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total;
        expect(total).toBeGreaterThan(0);
        expect(() => database.prepare(`UPDATE ${table} SET sha256 = sha256`).run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
        expect(() => database.prepare(`DELETE FROM ${table}`).run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
        expect((database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total).toBe(total);
      }
      expect((database.prepare('SELECT count(*) total FROM analysis_unit_results').get() as { total: number }).total).toBe(SAMPLE1_UNITS);
    } finally {
      database.close();
    }
  }, 300_000);

  it('records the authorized Run as blocked before dispatch when no local deterministic route is bound', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await openWithRoute(roots.dataRoot, null);
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 无路由');
      await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const prepared = prepare(store, imported.bookId);
      expect(prepared.providerResolutionPlan?.executionRoute).toEqual({ kind: 'none', reason: 'j04-model-adapter-control-absent' });
      expect(prepared.planEnvelope).toMatchObject({ dispatchAllowed: false, providerStatus: 'remote-denied-no-route' });
      const authorized = store.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(authorized.dispatchRunRecordId).toBeNull();
      expect(authorized.projection.state).toBe('authorized-blocked');
      expect(authorized.projection.authorization?.authority).toBe('record-only-no-dispatch');
      expect(authorized.projection.run).toMatchObject({ state: 'blocked-before-dispatch', attempt: null, progress: null });
      expect(authorized.projection.run?.blockedReasons?.length).toBe(3);
      expect(authorized.projection.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'blocked-before-dispatch']);
      expect(authorized.projection.resultSetRevision).toBeNull();
      expect(authorized.projection.taskOutcome).toBeNull();
      const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture: null, secretResolver: fakeSecretResolver() });
      expect(() => owner.admitAndDispatch(authorized.projection.run!.runRecordId)).toThrowError(/EXECUTION_ROUTE_ABSENT|没有可执行的本地确定性路由/u);
      // Authorizing again is idempotent and a stale envelope digest is refused.
      expect(store.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).projection.authorization?.authorizationId)
        .toBe(authorized.projection.authorization?.authorizationId);
      expect(() => store.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, 'f'.repeat(64))).toThrowError(StoreError);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('migrates a revision-14 store forward without rewriting any J-03 row', async () => {
    const store = await openWithRoute(roots.dataRoot, null);
    store.markCleanShutdown();
    store.close();
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
      // Rebuild the exact revision-14 shape: drop only the additive relations and their triggers.
      for (const name of Object.keys(ANALYSIS_LEDGER_TRIGGER_SQL)) database.exec(`DROP TRIGGER ${name}`);
      for (const name of Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL).reverse()) database.exec(`DROP TABLE ${name}`);
      database.exec('PRAGMA user_version = 14');
    } finally {
      database.close();
    }
    const migrated = await openWithRoute(roots.dataRoot, null);
    try {
      await expect(migrated.getStartup()).resolves.toBeDefined();
    } finally {
      migrated.markCleanShutdown();
      migrated.close();
    }
    const verify = new DatabaseSync(databasePath);
    try {
      expect((verify.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(TASK_AUTHORIZATION_SCHEMA_VERSION);
      for (const table of Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL)) {
        expect((verify.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total).toBe(0);
      }
    } finally {
      verify.close();
    }
  }, 120_000);
});
