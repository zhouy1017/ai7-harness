import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import {
  BASELINE_PROMPT_CONTRACT_DIGEST,
  BASELINE_PROMPT_CONTRACT_V1_DIGEST,
} from '../../src/service/analysis/contract.js';
import {
  RETAINED_V1_RECORDED_FIXTURE_IDENTITY,
  type BaselinePromptContractSelection,
} from '../../src/service/analysis/kind-definition.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { assuranceContractMoved, type BaselineAnalysisRouteFacts } from '../../src/service/analysis/baseline-analysis-store.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { controlledUnitHold } from '../../src/service/unit-hold.js';
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
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Service-integration suite (L2) for Issue #826: actual current authored pauses, exact old-pin reading and no-write drift
// refusal. Genuine retained-/1 execution provenance is owned by complete J04; this file reads its fixture metadata only,
// with no recorded replay, Provider, socket, credential value or Effect. Input is admitted public sample1 (ADR 0043).

// Only the refusal cases below use deliberately malformed route tuples. Positive /1 execution provenance belongs
// to complete J04: recorded-binds-prompt-contract-1, recorded-restart-preserves-result-and-report,
// range-recorded-predecessor-readable, and the additional authentic paused-/1 continuation scenario (#1161 rev6).
const SYNTHETIC_SHA = '5'.repeat(64);
let historicalRoute: BaselineAnalysisRouteFacts;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let holdPath: string;
let currentFixture: ResolvedModelFixture;
let currentRoute: BaselineAnalysisRouteFacts;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-prompt-contract-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  holdPath = join(roots.dataRoot, '..', 'j10-unit-hold.txt');
  writeFileSync(holdPath, 'release');
  currentFixture = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-baseline-happy');
  currentRoute = { fixtureIdentity: currentFixture.identity, fixtureSha256: currentFixture.sha256, fixtureLineage: currentFixture.lineage };
  // Reading fixture metadata is not a replay: this L2 file never dispatches the recorded fixture.
  const recorded = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), RETAINED_V1_RECORDED_FIXTURE_IDENTITY);
  historicalRoute = { fixtureIdentity: recorded.identity, fixtureSha256: recorded.sha256, fixtureLineage: recorded.lineage };
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

function withDatabase<T>(operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

/**
 * The plan the A2 candidate (bc20548f) froze for the same preparation, before plans recorded a sampling pin: the same
 * execution-plan record without `assurancePromptContractDigest`, and so an envelope and a plan version naming that record's
 * digest. Rewritten in place with the store closed; the ledger's own triggers are put back exactly as they were.
 */
function rewriteToPrePinPlan(taskIntentId: string): void {
  withDatabase((database) => {
    const names = ['analysis_plan_records_no_update', 'analysis_plan_versions_no_update', 'procedure_plan_pins_no_delete'];
    const triggers = names.map((name) => (database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(name) as { sql: string }).sql);
    for (const name of names) database.exec(`DROP TRIGGER ${name}`);
    // A pre-826 plan also predates Procedure Definitions; its changed envelope has no revision-85 sibling pin.
    database.prepare('DELETE FROM procedure_plan_pins WHERE task_intent_id = ?').run(taskIntentId);
    const component = (name: string) => JSON.parse((database.prepare(
      'SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = 1 AND component = ?',
    ).get(taskIntentId, name) as { canonical_json: string }).canonical_json) as Record<string, unknown>;
    const { assurancePromptContractDigest, ...prePin } = component('execution-plan');
    expect(assurancePromptContractDigest).toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST);
    const execution = canonicalRecord(prePin);
    const envelope = canonicalRecord({ ...component('plan-envelope'), executionPlanDigest: execution.digest });
    const rewrite = database.prepare('UPDATE analysis_plan_records SET canonical_json = ?, sha256 = ? WHERE task_intent_id = ? AND plan_version = 1 AND component = ?');
    rewrite.run(execution.json, execution.digest, taskIntentId, 'execution-plan');
    rewrite.run(envelope.json, envelope.digest, taskIntentId, 'plan-envelope');
    const versionJson = (database.prepare('SELECT canonical_json FROM analysis_plan_versions WHERE task_intent_id = ? AND ordinal = 1')
      .get(taskIntentId) as { canonical_json: string }).canonical_json;
    const version = canonicalRecord({ ...(JSON.parse(versionJson) as Record<string, unknown>), planEnvelopeDigest: envelope.digest });
    database.prepare('UPDATE analysis_plan_versions SET plan_envelope_sha256 = ?, canonical_json = ?, sha256 = ? WHERE task_intent_id = ? AND ordinal = 1')
      .run(envelope.digest, version.json, version.digest, taskIntentId);
    for (const sql of triggers) database.exec(sql);
  });
}

async function newBook(store: EditorialStore, title: string, connect: boolean): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  if (connect) recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((settle) => setTimeout(settle, 5));
  }
}

/** A genuine current /2 pause on the unchanged admitted authored fixture, with three successful retained checkpoints. */
async function pausedCurrentRun(store: EditorialStore, bookId: string): Promise<string> {
  const prepared = prepare(store, bookId);
  expect(prepared.planEnvelope!.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy,
    fixture: currentFixture, secretResolver: fakeSecretResolver(), unitHold: controlledUnitHold(holdPath, { pollMs: 5 }) });
  try {
    writeFileSync(holdPath, '2');
    const runRecordId = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
    owner.admitAndDispatch(runRecordId);
    await until(() => owner.progressFor(runRecordId)?.currentUnitOrdinal === 3, 'unit 3 in flight');
    store.requestBaselineAnalysisPause(bookId, prepared.taskIntent!.taskIntentId);
    owner.pauseRun(runRecordId, store.baselineAnalysisLedger);
    writeFileSync(holdPath, 'release'); await owner.whenIdle();
    expect(store.inspectBaselineAnalysis(bookId).run!.state).toBe('paused');
    expect(store.baselineAnalysisLedger.unitCheckpoints(runRecordId).map((entry) => entry.unit.closed.state)).toEqual(['closed', 'closed', 'closed']);
    return runRecordId;
  } finally { await owner.dispose(); }
}

describe('baseline prompt contract /1 → /2 on the real store (Issue #826)', () => {
  it('refuses /1 beside any route but the recorded fixture alone, and asks /2 by default', async () => {
    for (const route of [
      null,
      { ...historicalRoute, fixtureIdentity: 'sample1-baseline-happy', fixtureLineage: [{ identity: 'sample1-baseline-happy', sha256: SYNTHETIC_SHA }] },
      { ...historicalRoute, fixtureLineage: [...historicalRoute.fixtureLineage, { identity: 'sample1-baseline-happy', sha256: SYNTHETIC_SHA }] },
      { ...historicalRoute, fixtureLineage: [{ identity: 'sample1-baseline-happy', sha256: SYNTHETIC_SHA }] },
    ]) {
      await expect(open(route, 'retained-v1')).rejects.toMatchObject({ code: 'ANALYSIS_PROMPT_CONTRACT_REFUSED' });
    }
    await expect(open(null, 'retained-v3' as BaselinePromptContractSelection)).rejects.toMatchObject({ code: 'ANALYSIS_PROMPT_CONTRACT_REFUSED' });
    for (const [route, selection] of [[null, undefined], [null, 'current'], [historicalRoute, undefined]] as const) {
      const store = await open(route, selection);
      try {
        expect(store.baselineAnalysisLedger.definition.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
      } finally {
        store.close();
      }
    }
    const historical = await open(historicalRoute, 'retained-v1');
    try {
      expect(historical.baselineAnalysisLedger.definition.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_V1_DIGEST);
      // Only the baseline kind is retained: the other kinds' ledgers ask under their own contracts as before.
      expect(historical.factualReviewLedger.definition.promptContractDigest).not.toBe(BASELINE_PROMPT_CONTRACT_V1_DIGEST);
    } finally {
      historical.close();
    }
  });

  // One-to-one provenance relocation (#1161 rev5/6): the former synthetic /1 execution, immutable reopen and range
  // closure assertions are owned by complete J04's genuine recorded-/1 Book and six-reused/two-recomputed repair.
  // Its separate paused-/1 Book proves actual historical continuation refusal with no new work. L2 retains real current
  // pauses, absent-pin reading/refusal and isolated sampling/unit-contract drift before any state or span changes.

});

describe('the sampling contract a baseline plan froze (Issue #826 stage pin)', () => {
  it('refuses stopped-run continuation when only the sampling contract changes, before recording a state or span', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await open(currentRoute);
    const ledger = store.baselineAnalysisLedger;
    let owner: BaselineAnalysisExecutionOwner | undefined;
    const definition = ledger.definition;
    const binding = vi.spyOn(ledger, 'definition', 'get');
    try {
      const bookId = await newBook(store, 'L2 sample1 仅抽样契约变化', true);
      const runRecordId = await pausedCurrentRun(store, bookId);
      const stopped = store.inspectBaselineAnalysis(bookId);
      const facts = ledger.loadExecutionPlan(runRecordId);
      const recordedBinding = ledger.executionBindingOf(runRecordId);
      expect(stopped.run?.state).toBe('paused');
      expect(stopped.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3]);
      expect(recordedBinding).not.toBeNull();
      expect(facts.assurancePromptContractDigest).toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST);
      owner = new BaselineAnalysisExecutionOwner({
        requestGovernor,
        ledger, launchPolicy, fixture: currentFixture,
        secretResolver: fakeSecretResolver(),
      });
      expect(owner.carriesStoppedRun(runRecordId)).toBe(true);

      // Change only the currently bound sampling contract through the existing definition getter. The actual paused Run,
      // its frozen /2 plan, unit prompt, composition, route and persisted Execution Binding remain byte-for-byte unchanged.
      binding.mockReturnValue({
        ...definition,
        assurance: { ...definition.assurance!, prompt: ASSURANCE_SAMPLING_PROMPT_CONTRACT, promptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST },
      });
      expect(ledger.definition.promptContractDigest).toBe(definition.promptContractDigest);
      expect(ledger.definition.systemPrompt).toBe(definition.systemPrompt);
      expect(ledger.loadExecutionPlan(runRecordId)).toEqual(facts);
      expect(owner.carriesStoppedRun(runRecordId)).toBe(false);
      expect(() => owner!.admitAndDispatch(runRecordId, ledger, { resume: true }))
        .toThrowError(expect.objectContaining({ code: 'EXECUTION_RESUME_BINDING_DRIFT' }));
      expect(owner.idle).toBe(true);
      expect(store.inspectBaselineAnalysis(bookId).run).toEqual(stopped.run);
      expect(ledger.executionBindingOf(runRecordId)).toEqual(recordedBinding);

      binding.mockRestore();
      expect(owner.carriesStoppedRun(runRecordId)).toBe(true);
    } finally {
      binding.mockRestore();
      await owner?.dispose();
      store.close();
    }
  });

  it('pins sampling /2 on a current plan, reuses it unchanged, and replaces or refuses a plan frozen without the pin', async () => {
    await requireExactSample1(roots.codeRoot);
    let store = await open(currentRoute);
    let stale: { bookId: string; taskIntentId: string };
    let authorized: { bookId: string; taskIntentId: string; manifest: CoverageManifestProjection };
    try {
      const bookA = await newBook(store, 'L2 sample1 抽样契约 甲', true);
      const prepared = prepare(store, bookA);
      expect(prepared.executionPlan).toMatchObject({ assurancePromptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST });
      // An unchanged preparation is the same Task under the same frozen plan.
      const again = prepare(store, bookA);
      expect(again.taskIntent?.taskIntentId).toBe(prepared.taskIntent!.taskIntentId);
      expect(again.planEnvelope?.digest).toBe(prepared.planEnvelope!.digest);
      stale = { bookId: bookA, taskIntentId: prepared.taskIntent!.taskIntentId };
      const bookB = await newBook(store, 'L2 sample1 抽样契约 乙', false);
      const preparedB = prepare(store, bookB);
      authorized = { bookId: bookB, taskIntentId: preparedB.taskIntent!.taskIntentId, manifest: preparedB.coverageManifest! };
    } finally {
      store.close();
    }
    rewriteToPrePinPlan(stale.taskIntentId);
    rewriteToPrePinPlan(authorized.taskIntentId);

    store = await open(currentRoute);
    const owner = new BaselineAnalysisExecutionOwner({
      requestGovernor,
      ledger: store.baselineAnalysisLedger, launchPolicy, fixture: currentFixture,
      secretResolver: fakeSecretResolver(),
    });
    try {
      // The pre-pin plan still reads, as sampling /1, the only contract there was when it was frozen.
      const read = store.inspectBaselineAnalysis(stale.bookId);
      expect(read.taskIntent?.taskIntentId).toBe(stale.taskIntentId);
      expect(read.executionPlan).not.toHaveProperty('assurancePromptContractDigest');
      // Preparing again replaces it with a new Task whose plan pins the contract it will sample under.
      const replaced = prepare(store, stale.bookId);
      expect(replaced.taskIntent?.taskIntentId).not.toBe(stale.taskIntentId);
      expect(replaced.executionPlan).toMatchObject({ assurancePromptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST });

      // A pre-pin plan authorized and never dispatched is refused at execution: nothing is sent and no revision forms.
      const prePin = store.inspectBaselineAnalysis(authorized.bookId);
      expect(prePin.executionPlan).not.toHaveProperty('assurancePromptContractDigest');
      const runRecordId = store.authorizeBaselineAnalysis(authorized.bookId, authorized.taskIntentId, prePin.planEnvelope!.digest).dispatchRunRecordId!;
      expect(store.baselineAnalysisLedger.loadExecutionPlan(runRecordId).assurancePromptContractDigest).toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST);
      owner.admitAndDispatch(runRecordId);
      await owner.whenIdle();
      const refused = store.inspectBaselineAnalysis(authorized.bookId, (id) => owner.progressFor(id));
      expect(refused.run?.state).toBe('failed');
      expect(JSON.stringify(refused.run)).toContain('EXECUTION_STAGE_CONTRACT_DRIFT');
      expect(JSON.stringify(refused.run)).not.toContain('EXECUTION_COMPOSITION_DRIFT');
      expect(refused.run?.attempt?.spans ?? []).toEqual([]);
      expect(refused.resultSetRevision).toBeNull();
    } finally {
      await owner.dispose();
      store.close();
    }
  });

  it('carries a genuine current /2 paused Run after reopen and refuses a changed unit contract before writes', async () => {
    await requireExactSample1(roots.codeRoot);
    let store = await open(currentRoute);
    let currentRun: string;
    let bookId: string;
    try { bookId = await newBook(store, 'L2 sample1 停下的 /2 运行', true); currentRun = await pausedCurrentRun(store, bookId); }
    finally { store.close(); }
    store = await open(currentRoute);
    const ledger = store.baselineAnalysisLedger;
    const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger, launchPolicy, fixture: currentFixture,
      secretResolver: fakeSecretResolver() });
    const selected = ledger.definition;
    const definition = vi.spyOn(ledger, 'definition', 'get');
    try {
      expect(owner.carriesStoppedRun(currentRun)).toBe(true);
      const facts = ledger.loadExecutionPlan(currentRun);
      const before = store.inspectBaselineAnalysis(bookId).run;
      expect(facts.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
      expect(facts.assurancePromptContractDigest).toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST);
      expect(assuranceContractMoved(selected, facts.assurancePromptContractDigest)).toBe(false);
      expect(before!.attempt!.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3]);
      // A mismatched selected unit-contract digest is a negative guard stimulus, never an invented /1 receipt.
      definition.mockReturnValue({ ...selected, promptContractDigest: BASELINE_PROMPT_CONTRACT_V1_DIGEST });
      expect(owner.carriesStoppedRun(currentRun)).toBe(false);
      expect(() => owner.admitAndDispatch(currentRun, ledger, { resume: true })).toThrowError(expect.objectContaining({ code: 'EXECUTION_RESUME_BINDING_DRIFT' }));
      expect(ledger.loadExecutionPlan(currentRun)).toEqual(facts);
      expect(store.inspectBaselineAnalysis(bookId).run).toEqual(before);
      definition.mockRestore(); expect(owner.carriesStoppedRun(currentRun)).toBe(true);
    } finally { definition.mockRestore(); await owner.dispose(); store.close(); }
  });

});
