import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import {
  ANALYSIS_LEDGER_SCHEMA_SQL,
  CLARIFICATION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION,
  TASK_AUTHORIZATION_SCHEMA_SQL,
  TaskAuthorizationError,
  canonicalRecord,
  executionPlanValue,
  planEnvelopeSummary,
  planEnvelopeValue,
  planStopCondition,
  providerResolutionPlanValue,
  validateTaskAuthorizationSchema,
} from '../../src/service/task-authorization.js';
import {
  J03_TASK_GOAL,
  type LaunchPolicyProjection,
  type ProviderProcessingPin,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for task authorization. `TaskAuthorizationStore` gates its whole
// surface on exact `sample1` primary-manuscript lineage (`src/service/task-authorization.ts`
// `#binding()`), so this suite consumes the ADR 0043-admitted public input
// `SampleBooks/sample1.docx` — the same input J-01 and J-03 already consume — and verifies its
// identity before importing it. The sequence mirrors J-03 at the service layer: import, then the two
// product preconditions (the editorial-workspace-profile pin and one unready credential-reference
// row written through the store's own nonsecret-metadata operations), then prepare, authorize, and
// inspect. No secret value, OS secret store, network, Provider call, or Effect is involved.

const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const NATIVE_CARRIER_SHA256 = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
const SIDECAR_REVISION_2_SHA256 = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
const CONFIRMED_TITLE = 'L2 sample1 任务授权';
const CONNECTION_NAME = 'L2 主编辑连接';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const IMMUTABLE_TABLES = Object.keys(TASK_AUTHORIZATION_SCHEMA_SQL);
// Revision 15 (Issue #92) adds the baseline-analysis relations beside the J-03 ledger. A J-03
// authorization must leave every one of them empty: the additive migration writes no row.
const ANALYSIS_LEDGER_TABLES = Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL);
// The two pins `ProviderProcessingPin` declares. Only the first is reachable through the store: the
// guard admits nothing else, which is why the second one's row has to be written by hand below.
const DEVELOPMENT_CI_PIN: ProviderProcessingPin = {
  operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0,
};
const DEVELOPER_LIVE_PIN: ProviderProcessingPin = {
  operationalScope: 'developer-live', version: 'v10', decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run',
};

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-task-');
});

afterEach(async () => {
  await roots.dispose();
});

function sample1Path(): string {
  return join(roots.codeRoot, 'SampleBooks', 'sample1.docx');
}

/**
 * The exact admitted public input, checked the way J-01 and J-03 check it before importing: a
 * regular file, never a link, at its reviewed byte length and digest. The whole task-authorization
 * surface is bound to this digest, so an inexact input must fail here rather than inside the store.
 */
async function requireExactSample1(): Promise<void> {
  const metadata = await lstat(sample1Path());
  expect(metadata.isFile()).toBe(true);
  expect(metadata.isSymbolicLink()).toBe(false);
  expect(metadata.size).toBe(SAMPLE1_BYTES);
  expect(createHash('sha256').update(await readFile(sample1Path())).digest('hex')).toBe(SAMPLE1_SHA256);
}

/** Import exact `sample1` as a new Book: its review is clean, so it asks for no degradation decision. */
async function importSample1(store: EditorialStore): Promise<{ bookId: string; manuscriptId: string }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), sample1Path());
  expect(staged.source.format).toBe('DOCX');
  expect(staged.source.sourceSha256).toBe(SAMPLE1_SHA256);
  expect(staged.source.sourceBytes).toBe(SAMPLE1_BYTES);

  const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: CONFIRMED_TITLE } as const;
  // ADR 0086: `sample1`'s inline styles and its one section are retained with the file, so the first
  // review is formed at once and carries its digest, exactly as J-03 now sees it.
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
  expect(review.reviewDigest).not.toBeNull();
  expect(review.degradationDecision.state).toBe('not-required-clean-import');
  expect(review.target.kind).toBe('new-book');

  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  expect(commit.completionLabel).toBe('稿件已导入');
  expect(commit.source.sourceSha256).toBe(SAMPLE1_SHA256);
  expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId };
}

/** Pin the editorial workspace profile at Revision 2 for this Book, as J-03's artifact card does. */
async function pinProfileRevision2(store: EditorialStore, bookId: string): Promise<void> {
  const offered = await store.inspectEditorialWorkspaceProfile(bookId);
  expect(offered.lifecycle.state).toBe('available-to-install');
  expect(offered.sha256).toBe(NATIVE_CARRIER_SHA256);

  const installed = await store.installEditorialWorkspaceProfile(bookId);
  expect(installed.lifecycle.state).toBe('installed-disabled');
  expect(installed.sidecar.activeRevision).toBeNull();
  expect(installed.sidecar.offeredRevision).toBe(2);

  const enabled = await store.enableEditorialWorkspaceProfile(bookId);
  expect(enabled.lifecycle.state).toBe('enabled-for-book');
  expect(enabled.lifecycle.enabledForCurrentBook).toBe(true);
  expect(enabled.sidecar.activeRevision).toBe(2);
  expect(enabled.sidecar.pinHistory.map((pin) => pin.revision)).toEqual([2]);
  expect(enabled.sidecar.pinHistory[0]!.sha256).toBe(SIDECAR_REVISION_2_SHA256);
}

/**
 * Record one Main Editorial Role connection whose credential is not ready. Only nonsecret metadata
 * crosses the store boundary: a name, an opaque credential reference, and an operation state. The
 * product reaches `missing` by removing a protected secret; the store's own operations reach the
 * same recorded state without one ever existing.
 */
function recordUnreadyCredentialMetadata(store: EditorialStore): string {
  expect(store.getModelServiceConnection()).toBeNull();
  const credentialReference = randomUUID();
  const saved = store.saveModelServiceConnection(CONNECTION_NAME, credentialReference, 'needs-attention');
  expect(saved.connectionId).toBe('main-editorial-deepseek-v4-pro');
  expect(saved.roleId).toBe('main-editorial');
  expect(saved.binding.credentialSlot).toBe('deepseek-api-key');
  expect(saved.credentialReference).toBe(credentialReference);

  const missing = store.setModelServiceCredentialState(credentialReference, 'missing');
  expect(missing.credentialOperationState).toBe('missing');
  // The reference is stable metadata: removing readiness never re-keys the connection.
  expect(missing.credentialReference).toBe(credentialReference);
  return credentialReference;
}

/**
 * Write one prepared plan graph straight into the immutable ledger, pinned to `pin`. The store's own
 * guard admits only the `development-ci` denial, so a plan carrying any other Provider Processing
 * pin cannot be produced through the API; writing the row is the only way to observe what the read
 * side does with one. `executionPlan` overrides the derivation so a record whose statements are not
 * its own pin's readings can be written too.
 */
function writePreparedPlan(
  database: DatabaseSync,
  bookId: string,
  pin: ProviderProcessingPin,
  executionPlan: unknown = executionPlanValue(pin),
): void {
  const binding = database.prepare(
    `SELECT m.manuscript_id, mb.branch_id, mr.revision_id, mr.revision_label, mr.revision_digest,
            mr.source_version_id, bws.journal_sequence, connection.credential_reference
     FROM manuscripts m
     JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
     JOIN branch_working_state bws ON bws.branch_id = mb.branch_id
     JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
     JOIN model_service_connections connection ON connection.connection_id = 'main-editorial-deepseek-v4-pro'
     WHERE m.book_id = ? AND m.role = 'primary'`,
  ).get(bookId) as {
    manuscript_id: string; branch_id: string; revision_id: string; revision_label: string;
    revision_digest: string; source_version_id: string; journal_sequence: number; credential_reference: string;
  };
  const taskIntentId = randomUUID();
  const instant = new Date().toISOString();
  const records = {
    intent: canonicalRecord({
      bookId,
      createdAt: instant,
      expectedOutcome: '供编辑复核的结构与叙事连贯性重点清单',
      goal: J03_TASK_GOAL,
      taskIntentId,
    }),
    checkpoint: canonicalRecord({
      branchId: binding.branch_id,
      createdForDirtyJournal: false,
      journalSequence: binding.journal_sequence,
      manuscriptId: binding.manuscript_id,
      purpose: 'Task Input / 任务输入',
      revisionDigest: binding.revision_digest,
      revisionId: binding.revision_id,
      revisionLabel: binding.revision_label,
      taskIntentId,
    }),
    manuscriptPin: canonicalRecord({
      bookId,
      manuscriptId: binding.manuscript_id,
      revisionId: binding.revision_id,
      revisionDigest: binding.revision_digest,
      sourceVersionId: binding.source_version_id,
      sourceDigest: SAMPLE1_SHA256,
    }),
    artifactPin: canonicalRecord({
      identity: '@ai7/editorial-workspace-profile',
      version: '1.0.0',
      nativeCarrierSha256: NATIVE_CARRIER_SHA256,
      sidecarIdentity: 'ai7.editorial-workspace-profile.authority',
      sidecarRevision: 2,
      sidecarSha256: SIDECAR_REVISION_2_SHA256,
    }),
    sourceScope: canonicalRecord({
      bookId,
      manuscriptId: binding.manuscript_id,
      taskInputRevision: { revisionId: binding.revision_id, revisionDigest: binding.revision_digest },
      readableScopeKinds: ['current-book-primary-manuscript-revision'],
      sourceVersionEvidence: { sourceVersionId: binding.source_version_id, readable: false },
    }),
    providerPlan: canonicalRecord(providerResolutionPlanValue(binding.credential_reference, pin)),
    executionPlan: canonicalRecord(executionPlan),
  };
  const envelope = canonicalRecord(planEnvelopeValue(pin, {
    taskIntentId,
    checkpointDigest: records.checkpoint.digest,
    manuscriptPinDigest: records.manuscriptPin.digest,
    artifactPinDigest: records.artifactPin.digest,
    runSourceScopeDigest: records.sourceScope.digest,
    providerResolutionPlanDigest: records.providerPlan.digest,
    executionPlanDigest: records.executionPlan.digest,
  }));
  database.prepare(
    `INSERT INTO task_intents(task_intent_id, book_id, goal, expected_outcome, created_at, canonical_json, sha256)
     VALUES (?, ?, ?, '供编辑复核的结构与叙事连贯性重点清单', ?, ?, ?)`,
  ).run(taskIntentId, bookId, J03_TASK_GOAL, instant, records.intent.json, records.intent.digest);
  database.prepare(
    `INSERT INTO task_input_checkpoints(
       task_intent_id, manuscript_id, branch_id, revision_id, revision_label, revision_digest,
       journal_sequence, purpose, created_for_dirty_journal, canonical_json, sha256, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Task Input / 任务输入', 0, ?, ?, ?)`,
  ).run(taskIntentId, binding.manuscript_id, binding.branch_id, binding.revision_id, binding.revision_label,
    binding.revision_digest, binding.journal_sequence, records.checkpoint.json, records.checkpoint.digest, instant);
  const insert = (table: string, record: { json: string; digest: string }): void => {
    database.prepare(`INSERT INTO ${table}(task_intent_id, canonical_json, sha256, created_at) VALUES (?, ?, ?, ?)`)
      .run(taskIntentId, record.json, record.digest, instant);
  };
  insert('task_manuscript_pins', records.manuscriptPin);
  insert('task_artifact_pins', records.artifactPin);
  insert('run_source_scopes', records.sourceScope);
  insert('provider_resolution_plans', records.providerPlan);
  insert('execution_plans', records.executionPlan);
  insert('plan_envelopes', envelope);
}

/** Drive the preparation job to completion the way the cooperative job owner does for the product. */
function completePreparation(store: EditorialStore, bookId: string, launchPolicy: LaunchPolicyProjection) {
  let progress = store.createTaskAuthorizationPreparationWork(bookId, J03_TASK_GOAL, launchPolicy);
  while (!progress.done) {
    expect(progress.workId).not.toBeNull();
    progress = store.advanceTaskAuthorizationPreparationWork(progress.workId!);
  }
  expect(progress.projection).not.toBeNull();
  return progress.projection!;
}

/** The store's authority database, opened directly to observe the append-only triggers. */
function storeDatabasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

describe('task authorization over the real store on exact sample1', () => {
  it('verifies the exact admitted sample1 input this suite is bound to', async () => {
    await requireExactSample1();
  }, 60_000);

  it('retains a denied zero-transmission authorization across restart', async () => {
    await requireExactSample1();
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    expect(policy).toMatchObject({ integrityState: 'verified', operationalScope: 'development-ci',
      providerProcessing: { version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0, liveTransmissionAllowed: false } });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let runRecordId: string;
    try {
      bookId = (await importSample1(store)).bookId;
      expect(() => store.inspectTaskAuthorization(bookId)).toThrow();
      await pinProfileRevision2(store, bookId);
      recordUnreadyCredentialMetadata(store);
      const prepared = completePreparation(store, bookId, policy);
      expect(prepared.providerResolutionPlan?.providerProcessing).toEqual({ operationalScope: 'development-ci',
        version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 });
      const authorized = store.authorizeTaskAuthorization(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      runRecordId = authorized.runRecord!.runRecordId;
      expect(authorized.runRecord?.dispatched).toBe(false);
      expect(store.inspectForegroundExecutionBoundary(bookId, runRecordId, policy)).toMatchObject({
        state: 'blocked-before-dispatch', runAuthority: 'record-only-no-dispatch', requiresNewPlanEnvelope: true });
      store.markCleanShutdown();
    } finally { store.close(); }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectTaskAuthorization(bookId!)).toMatchObject({ state: 'authorized', runRecord: { runRecordId: runRecordId!, dispatched: false } });
      reopened.markCleanShutdown();
    } finally { reopened.close(); }
  });

  // `task_artifact_pins.sha256` is unique and the artifact pin record is identical for every Book, so
  // one store holds at most one prepared J-03 plan. Each scope is therefore observed in its own
  // store: the `development-ci` row above, read back after a reopen, and the `developer-live` row
  // here. Neither is ever validated against the scope the launch reading it happens to bind.
  it.each([DEVELOPER_LIVE_PIN, { ...DEVELOPER_LIVE_PIN, version: 'v11' as const }, { ...DEVELOPER_LIVE_PIN, version: 'v9' as const }, { ...DEVELOPER_LIVE_PIN, version: 'v5' as const },
    { ...DEVELOPER_LIVE_PIN, version: 'v18' as const }, { ...DEVELOPER_LIVE_PIN, version: 'v20' as const },
    { ...DEVELOPER_LIVE_PIN, version: 'v22' as const }])('reads a stored plan against its own immutable pin ($version)', async (pin) => {
    await requireExactSample1();
    let bookId: string;

    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      bookId = (await importSample1(store)).bookId;
      await pinProfileRevision2(store, bookId);
      recordUnreadyCredentialMetadata(store);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    const database = new DatabaseSync(storeDatabasePath());
    try {
      writePreparedPlan(database, bookId, pin);
    } finally {
      database.close();
    }

    // Opening validates every stored row, and this one is validated against its own historical or current pin under a
    // launch that binds `development-ci`: the guard still refuses to write such a plan, but the read
    // side keeps one valid, which is what a relaunch under another scope needs.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const live = reopened.inspectTaskAuthorization(bookId);
      expect(live.state).toBe('prepared');
      expect(live.providerResolutionPlan?.providerProcessing).toEqual(pin);
      expect(live.executionPlan?.stopCondition).toBe(planStopCondition(pin));
      expect(live.planEnvelope?.summary).toBe(planEnvelopeSummary(pin));
      // v1 as a whole token: the selected developer-live version v10 is not the development-ci v1.
      expect(live.executionPlan?.stopCondition).not.toMatch(/\bv1(?!\d)/);
      expect(live.planEnvelope?.summary).not.toMatch(/\bv1(?!\d)/);
      if (pin.version === 'v18' || pin.version === 'v20' || pin.version === 'v22') {
        // #920 rev 4, #990, #1044: predecessor records retain their exact pin while active set v19 still selects developer-live v24.
        const selected = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
        expect(selected.activePolicySetVersion).toBe('v23');
        expect(selected.providerProcessing.version).toBe('v24');
        const authorized = reopened.authorizeTaskAuthorization(bookId, live.taskIntent!.taskIntentId, live.planEnvelope!.digest);
        expect(authorized.state).toBe('authorized');
        expect(authorized.providerResolutionPlan?.providerProcessing).toEqual(pin);
        expect(authorized.runRecord?.dispatched).toBe(false);
        expect((await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live')).providerProcessing.version).toBe('v24');
      }
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);
});
