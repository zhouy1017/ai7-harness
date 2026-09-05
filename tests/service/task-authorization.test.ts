import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import {
  ANALYSIS_LEDGER_SCHEMA_SQL,
  TASK_AUTHORIZATION_SCHEMA_SQL,
  TASK_AUTHORIZATION_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import { J03_TASK_GOAL, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
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

/** Import exact `sample1` as a new Book, accepting the fidelity degradations its review reports. */
async function importSample1(store: EditorialStore): Promise<{ bookId: string; manuscriptId: string }> {
  const staged = await store.stageSelectedDocx(randomUUID(), sample1Path());
  expect(staged.source.format).toBe('DOCX');
  expect(staged.source.sourceSha256).toBe(SAMPLE1_SHA256);
  expect(staged.source.sourceBytes).toBe(SAMPLE1_BYTES);

  const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: CONFIRMED_TITLE } as const;
  // `sample1` carries reported degradations, so the first review withholds its digest until the
  // acceptance the product collects on its review screen is passed back, exactly as J-03 does.
  const pending = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
  expect(pending.reviewDigest).toBeNull();
  expect(pending.degradationDecision.state).toBe('required-unselected');
  const review = store.prepareNewBookReview(pending.draftId, pending.draftVersion, target, true);
  expect(review.reviewDigest).not.toBeNull();
  expect(review.degradationDecision.state).toBe('accepted-complete-set');
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

  it('records a not-dispatched authorization and leaves an append-only ledger', async () => {
    await requireExactSample1();
    const launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    // The suite asserts the store's behavior under the trusted development-ci denial, so an
    // unverified checkout must fail here rather than as a confusing task-authorization error.
    expect(launchPolicy.integrityState).toBe('verified');
    expect(launchPolicy.operationalScope).toBe('development-ci');
    expect(launchPolicy.providerProcessing.version).toBe('v1');
    expect(launchPolicy.providerProcessing.decision).toBe('deny');
    expect(launchPolicy.providerProcessing.liveTransmissionAllowed).toBe(false);

    let bookId: string;
    let credentialReference: string;
    let authorizationId: string;
    let runRecordId: string;

    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const imported = await importSample1(store);
      bookId = imported.bookId;

      // Before the preconditions exist the whole surface stays closed: `inspect` itself is gated,
      // which is why no task-authorization state is reachable from a Book that only has lineage.
      let closed: unknown;
      try {
        store.inspectTaskAuthorization(bookId);
      } catch (error) {
        closed = error;
      }
      expect(closed).toBeInstanceOf(StoreError);
      expect((closed as StoreError).code).toBe('TASK_LINEAGE_UNAVAILABLE');

      await pinProfileRevision2(store, bookId);
      credentialReference = recordUnreadyCredentialMetadata(store);

      // With both preconditions recorded the surface opens, and nothing is prepared yet.
      const available = store.inspectTaskAuthorization(bookId);
      expect(available.state).toBe('available');
      expect(available.taskIntent).toBeNull();
      expect(available.planEnvelope).toBeNull();
      expect(available.actions).toEqual({ canPrepare: true, canAuthorize: false });
      expect(available.namedNonEffects).toContain('不访问网络或调用 Provider');

      const prepared = completePreparation(store, bookId, launchPolicy);
      expect(prepared.state).toBe('prepared');
      expect(prepared.taskIntent?.goal).toBe(J03_TASK_GOAL);
      expect(prepared.taskIntent?.expectedOutcome).toBe('供编辑复核的结构与叙事连贯性重点清单');
      expect(prepared.checkpoint?.purpose).toBe('Task Input / 任务输入');
      expect(prepared.checkpoint?.manuscriptId).toBe(imported.manuscriptId);
      expect(prepared.checkpoint?.revisionDigest).toMatch(DIGEST_PATTERN);

      // The frozen plan pins exact sample1 lineage, the Revision 2 authority sidecar, and an
      // unready credential reference, and it stays a denied, non-dispatchable envelope.
      expect(prepared.manuscriptPin?.sourceDigest).toBe(SAMPLE1_SHA256);
      expect(prepared.manuscriptPin?.revisionId).toBe(prepared.checkpoint?.revisionId);
      expect(prepared.manuscriptPin?.revisionDigest).toBe(prepared.checkpoint?.revisionDigest);
      expect(prepared.manuscriptPin?.sourceVersionId).toMatch(UUID_PATTERN);
      expect(prepared.runSourceScope?.readableScopeKinds).toEqual(['current-book-primary-manuscript-revision']);
      expect(prepared.runSourceScope?.sourceVersionEvidence.readable).toBe(false);
      expect(prepared.artifactPin?.sidecarRevision).toBe(2);
      expect(prepared.artifactPin?.sidecarSha256).toBe(SIDECAR_REVISION_2_SHA256);
      expect(prepared.artifactPin?.nativeCarrierSha256).toBe(NATIVE_CARRIER_SHA256);
      expect(prepared.providerResolutionPlan?.credentialReference).toBe(credentialReference);
      expect(prepared.providerResolutionPlan?.credentialReadiness).toBe('missing');
      expect(prepared.providerResolutionPlan?.capabilities).toEqual([]);
      expect(prepared.providerResolutionPlan?.approvedFallbackChain).toEqual([]);
      expect(prepared.providerResolutionPlan?.providerProcessing).toEqual({
        operationalScope: 'development-ci',
        version: 'v1',
        decision: 'deny',
        authorizedLiveTransmissionCount: 0,
      });
      expect(prepared.executionPlan?.effects).toEqual([]);
      expect(prepared.executionPlan?.stopCondition).toBe('Provider Processing v1 denies dispatch');
      expect(prepared.planEnvelope?.providerStatus).toBe('denied');
      expect(prepared.planEnvelope?.dispatchAllowed).toBe(false);
      expect(prepared.planEnvelope?.digest).toMatch(DIGEST_PATTERN);
      expect(prepared.authorization).toBeNull();
      expect(prepared.runRecord).toBeNull();
      expect(prepared.actions).toEqual({ canPrepare: false, canAuthorize: true });

      // Preparing again over the same Book returns the frozen plan rather than a second intent.
      const reprepared = completePreparation(store, bookId, launchPolicy);
      expect(reprepared.taskIntent?.taskIntentId).toBe(prepared.taskIntent!.taskIntentId);
      expect(reprepared.planEnvelope?.digest).toBe(prepared.planEnvelope!.digest);

      const authorized = store.authorizeTaskAuthorization(
        bookId,
        prepared.taskIntent!.taskIntentId,
        prepared.planEnvelope!.digest,
      );
      expect(authorized.state).toBe('authorized');
      expect(authorized.authorization?.origin).toBe('standard-direct');
      expect(authorized.authorization?.planEnvelopeDigest).toBe(prepared.planEnvelope!.digest);
      expect(authorized.authorization?.authorizationId).toMatch(UUID_PATTERN);
      // The terminal state is a record, not a dispatch: the run is never handed to any executor.
      expect(authorized.runRecord?.state).toBe('recorded-not-dispatched');
      expect(authorized.runRecord?.dispatched).toBe(false);
      expect(authorized.runRecord?.terminalLabel).toBe('已记录授权 · 未派发');
      expect(authorized.actions).toEqual({ canPrepare: false, canAuthorize: false });
      authorizationId = authorized.authorization!.authorizationId;
      runRecordId = authorized.runRecord!.runRecordId;

      // Authorizing the same frozen envelope again is idempotent, and a stale digest is refused.
      const repeated = store.authorizeTaskAuthorization(
        bookId,
        prepared.taskIntent!.taskIntentId,
        prepared.planEnvelope!.digest,
      );
      expect(repeated.authorization?.authorizationId).toBe(authorizationId);
      expect(repeated.runRecord?.runRecordId).toBe(runRecordId);
      let stale: unknown;
      try {
        store.authorizeTaskAuthorization(bookId, prepared.taskIntent!.taskIntentId, 'f'.repeat(64));
      } catch (error) {
        stale = error;
      }
      expect((stale as StoreError).code).toBe('TASK_AUTHORIZATION_STALE');

      const inspected = store.inspectTaskAuthorization(bookId);
      expect(inspected.state).toBe('authorized');
      expect(inspected.authorization?.authorizationId).toBe(authorizationId);
      expect(inspected.runRecord?.runRecordId).toBe(runRecordId);
      expect(inspected.planEnvelope?.digest).toBe(prepared.planEnvelope!.digest);

      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A second open reads the recorded authorization back unchanged.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const restarted = reopened.inspectTaskAuthorization(bookId);
      expect(restarted.state).toBe('authorized');
      expect(restarted.authorization?.authorizationId).toBe(authorizationId);
      expect(restarted.runRecord?.runRecordId).toBe(runRecordId);
      expect(restarted.runRecord?.dispatched).toBe(false);
      expect(restarted.providerResolutionPlan?.credentialReference).toBe(credentialReference);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }

    // The ledger is append-only in the database itself, not only behind the store API: every task
    // table rejects `UPDATE` and `DELETE` through its own trigger, with the row left in place.
    const database = new DatabaseSync(storeDatabasePath());
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
        .toBe(TASK_AUTHORIZATION_SCHEMA_VERSION);
      expect(ANALYSIS_LEDGER_TABLES.length).toBeGreaterThan(0);
      for (const table of ANALYSIS_LEDGER_TABLES) {
        const rows = database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number };
        expect(rows.total).toBe(0);
      }
      expect(IMMUTABLE_TABLES.length).toBeGreaterThan(0);
      for (const table of IMMUTABLE_TABLES) {
        const before = database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number };
        expect(before.total).toBe(1);
        expect(() => database.prepare(`UPDATE ${table} SET sha256 = sha256`).run())
          .toThrowError(/TASK_LEDGER_IMMUTABLE/);
        expect(() => database.prepare(`DELETE FROM ${table}`).run())
          .toThrowError(/TASK_LEDGER_IMMUTABLE/);
        const after = database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number };
        expect(after.total).toBe(1);
      }
      // The recorded run stayed exactly the terminal not-dispatched row the API reported.
      const run = database.prepare('SELECT state, dispatched FROM run_records WHERE run_record_id = ?')
        .get(runRecordId) as { state: string; dispatched: number };
      expect(run.state).toBe('recorded-not-dispatched');
      expect(run.dispatched).toBe(0);
    } finally {
      database.close();
    }
  }, 300_000);
});
