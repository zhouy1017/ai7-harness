import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import {
  BaselineAnalysisExecutionOwner,
  ModelRequestGovernor,
  type ModelRequestGovernorOptions,
  type ModelRequestLane,
  type ModelRequestProducer,
  type ModelRequestProducerKind,
} from '../../src/service/analysis/execution.js';
import { EditorialStore } from '../../src/service/store.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { DataVersionError, dataVersionMarkerPath, readDataVersionMarker, refuseNewerDataVersion } from '../../src/service/data-version.js';
import { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { writeDatabasePackage } from '../../src/service/database-exports.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';

// Primitive cases retain deferred caller-owned cleanup. The reader cases below use real
// production owners over admitted sample1, synthetic responses and no provider/network.
const governors: ModelRequestGovernor[] = [];
const scenarioCleanups: Array<() => Promise<void>> = [];

function governor(options: ModelRequestGovernorOptions = {}): ModelRequestGovernor {
  const owner = new ModelRequestGovernor(options);
  governors.push(owner);
  return owner;
}

function producer(owner: ModelRequestGovernor, key: string, lane: ModelRequestLane = 'foreground',
  kind: ModelRequestProducerKind = 'analysis-unit'): ModelRequestProducer {
  return owner.registerProducer({ key, kind, lane });
}

function acquire(owner: ModelRequestGovernor, registration: ModelRequestProducer): ReturnType<ModelRequestGovernor['acquire']> {
  return owner.acquire(registration, new AbortController().signal);
}

afterEach(async () => {
  for (const cleanup of scenarioCleanups.splice(0).reverse()) await cleanup();
  for (const owner of governors.splice(0)) {
    owner.close();
    expect(owner.snapshot()).toEqual({ registered: 0, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
  }
  vi.restoreAllMocks();
});

/** Real production authorization, owner, harness, admission and transport; only the response is synthetic. */
async function admittedCrash(first: 'held' | 'unit' | 'clarification' = 'held') {
  const roots = await createServiceTestRoots('ai7-request-reader-');
  const opened: EditorialStore[] = [];
  const capacity = governor({ globalCapacity: 1 });
  let owner: BaselineAnalysisExecutionOwner | undefined;
  let driver: ReviewRunDriver | undefined;
  scenarioCleanups.push(async () => {
    const stopped = driver?.dispose(); await owner?.dispose(); await stopped;
    for (const store of opened.reverse()) await store.close();
    await roots.dispose();
  });
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  opened.push(store);
  const choice = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0];
  const pending = store.saveModelServiceConnection('合成请求读取测试', null, 'needs-attention', choice.route);
  store.saveModelServiceConnection('合成请求读取测试', pending.credentialReference, 'ready', choice.route);
  store.selectModelServiceRoute(choice.route);
  const binding = { ...choice, credentialReference: pending.credentialReference };
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy,
    live: { scope: 'ordinary-production', ...binding, runBudgetCeiling: 'unset' } });
  let reachedTransport!: () => void;
  const entered = new Promise<void>((resolve) => { reachedTransport = resolve; });
  let calls = 0;
  let checkpointed!: () => void;
  const settled = new Promise<void>((resolve) => { checkpointed = resolve; });
  if (first === 'unit') {
    const original = BaselineAnalysisStore.prototype.recordUnitCheckpoint;
    vi.spyOn(BaselineAnalysisStore.prototype, 'recordUnitCheckpoint').mockImplementation(function (this: BaselineAnalysisStore, input) {
      Reflect.apply(original, this, [input]); checkpointed();
    });
  } else if (first === 'clarification') {
    const original = BaselineAnalysisStore.prototype.recordClarificationRequest;
    vi.spyOn(BaselineAnalysisStore.prototype, 'recordClarificationRequest').mockImplementation(function (this: BaselineAnalysisStore, input) {
      const requestId = Reflect.apply(original, this, [input]); checkpointed(); return requestId;
    });
  }
  const nativeFetch: typeof fetch = async (_url, init) => {
    calls += 1;
    if (calls === 1 && first !== 'held') {
      const message = (JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> }).messages.findLast((entry) => entry.role === 'user')!.content;
      const ordinal = parseReviewCategoryUnitMessageHeader(message)!.ordinal;
      const content = first === 'unit' ? { schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: ordinal, findings: [] }
        : { question: '按哪个合成阅读重点处理？', options: ['人物', '事件'], freeTextAllowed: true };
      return new Response(JSON.stringify({ model: choice.model, choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
    }
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      const abort = () => controller.error(init?.signal?.reason);
      init?.signal?.addEventListener('abort', abort, { once: true });
      reachedTransport();
    } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({ requestGovernor: capacity, ledger: store.baselineAnalysisLedger,
    launchPolicy: policy, fixture: null, production: { scope: 'ordinary-production', nativeFetch },
    secretResolver: { resolve: async () => 'synthetic-placeholder' },
    productionPolicyFor: (selected) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', selected) });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  const book = await importSample1Book(store, roots.codeRoot, '合成读取边界');
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  let prepared = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage'],
    { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
  while (!prepared.done) prepared = store.advanceReviewRunPreparationWork(prepared.workId!);
  const review = prepared.projection!.run!;
  store.authorizeReviewRun(book.bookId, review.reviewRunId, review.categories.filter((entry) => entry.planEnvelopeDigest !== null)
    .map((entry) => ({ categoryId: entry.categoryId, planEnvelopeDigest: entry.planEnvelopeDigest! })));
  const working = driver.drive(review.reviewRunId);
  void working.catch(() => undefined);
  await entered;
  if (first !== 'held') await settled;
  const snapshot = join(roots.dataRoot, '..', 'request-crash');
  await cp(roots.dataRoot, snapshot, { recursive: true,
    filter: (source) => !['ai7.sqlite', 'ai7.sqlite-wal', 'ai7.sqlite-shm'].includes(basename(source)) });
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  let runRecordId: string;
  try {
    runRecordId = String(db.prepare('SELECT run_record_id FROM analysis_run_records ORDER BY rowid DESC LIMIT 1').get()!.run_record_id);
    await backup(db, join(snapshot, 'store', 'ai7.sqlite'));
  } finally { db.close(); }
  const ledger = store.executionLedgerForRun(runRecordId);
  expect(ledger.requestAdmissionOf(runRecordId)!.open.size).toBe(1);
  expect(ledger.unitCheckpoints(runRecordId)).toHaveLength(first === 'unit' ? 1 : 0);
  return { roots, snapshot, runRecordId, policy, binding, book, reviewRunId: review.reviewRunId,
    calls: () => calls, opened, capacity };
}

const requestFields = [
  ['analysis_run_states', 'requestAdmission'], ['analysis_run_states', 'requestRefusal'],
  ['analysis_unit_checkpoints', 'requests'], ['analysis_clarification_requests', 'requests'],
] as const;

/** Deliberate corruption of real owner records, with the exact immutable triggers restored. */
function rewriteRequestRows(db: DatabaseSync, table: (typeof requestFields)[number][0], change: (record: Record<string, unknown>, index: number) => void): void {
  const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ?").all(table);
  for (const trigger of triggers) db.exec(`DROP TRIGGER "${String(trigger.name).replaceAll('"', '""')}"`);
  try {
    const rows = db.prepare(`SELECT rowid, canonical_json FROM ${table} ORDER BY rowid`).all();
    rows.forEach((row, index) => {
      const record = JSON.parse(String(row.canonical_json)) as Record<string, unknown>;
      change(record, index);
      const canonical = canonicalRecord(record);
      db.prepare(`UPDATE ${table} SET canonical_json = ?, sha256 = ? WHERE rowid = ?`).run(canonical.json, canonical.digest, row.rowid!);
    });
  } finally { for (const trigger of triggers) db.exec(String(trigger.sql)); }
}

function requestRows(db: DatabaseSync) {
  return { revision: db.prepare('PRAGMA user_version').get()!.user_version,
    rows: requestFields.map(([table]) => db.prepare(`SELECT rowid, canonical_json, sha256 FROM ${table} ORDER BY rowid`).all()) };
}

function rewriteRulePin(db: DatabaseSync, value: unknown, drift = false): void {
  let previous: string | null = null; let changed = false;
  rewriteRequestRows(db, 'analysis_run_states', (record) => {
    const receipt = record.requestAdmission as { data: Record<string, unknown>; digest: string } | undefined;
    if (receipt === undefined) return;
    if (!drift || changed) receipt.data.policyRuleId = value;
    changed = true;
    receipt.data.predecessorDigest = previous;
    receipt.digest = canonicalRecord(receipt.data).digest; previous = receipt.digest;
  });
}

describe('durable request reader compatibility', () => {
  it('refuses the actual admitted crash marker to the accepted schema91 reader before it can reconcile', async () => {
    const crash = await admittedCrash();
    const marker = await readDataVersionMarker(crash.snapshot);
    expect(marker).not.toBeNull();
    expect(() => refuseNewerDataVersion(marker!, { dataVersion: 1, schemaRevision: 91 })).toThrow(DataVersionError);
    expect(crash.calls()).toBe(1);
  });

  it('reopens a real possible-send crash and explicitly continues only unsent units, with no repeated physical request', async () => {
    const crash = await admittedCrash();
    const reopened = await EditorialStore.open(crash.snapshot, crash.roots.codeRoot); crash.opened.push(reopened);
    reopened.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy: crash.policy,
      live: { scope: 'ordinary-production', ...crash.binding, runBudgetCeiling: 'unset' } });
    reopened.reconcileStoppedReviewCategoryRuns();
    const kept = reopened.executionLedgerForRun(crash.runRecordId);
    expect(kept.unitCheckpoints(crash.runRecordId).map((entry) => entry.unit.closed)).toMatchObject([{ state: 'gap', gap: { code: 'outcome-unknown' } }]);
    expect(kept.requestAdmissionOf(crash.runRecordId)!.open.size).toBe(0);
    const resumedUnits: number[] = [];
    const restarted = new BaselineAnalysisExecutionOwner({ requestGovernor: governor(), ledger: reopened.baselineAnalysisLedger,
      launchPolicy: crash.policy, fixture: null, secretResolver: { resolve: async () => 'synthetic-placeholder' },
      productionPolicyFor: (selected) => resolveSourceCheckoutLaunchPolicySync(crash.roots.codeRoot, 'ordinary-production', selected),
      production: { scope: 'ordinary-production', nativeFetch: async (_url, init) => {
        const message = (JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> }).messages.findLast((entry) => entry.role === 'user')!.content;
        const header = parseReviewCategoryUnitMessageHeader(message);
        if (header !== null) resumedUnits.push(header.ordinal);
        const content = header === null ? { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] }
          : { schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal, findings: [] };
        return new Response(JSON.stringify({ model: crash.binding.model, choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
      } } });
    scenarioCleanups.push(() => restarted.dispose());
    restarted.admitAndDispatch(crash.runRecordId, kept, { resume: true }); await restarted.whenIdle();
    expect(resumedUnits).not.toContain(1); expect(resumedUnits.length).toBeGreaterThan(0); expect(crash.calls()).toBe(1);
    expect(kept.currentRunState(crash.runRecordId)).toMatch(/^completed/u);
    const before = kept.unitCheckpoints(crash.runRecordId);
    reopened.reconcileStoppedReviewCategoryRuns(); expect(kept.unitCheckpoints(crash.runRecordId)).toEqual(before);
    // The all-record validator must inspect a terminal Run excluded by active-Run routers too.
    kept.recordRunState(crash.runRecordId, kept.currentRunState(crash.runRecordId), { requestRefusal: null });
    await restarted.dispose(); await reopened.close(); crash.opened.splice(crash.opened.indexOf(reopened), 1);
    await expect(EditorialStore.open(crash.snapshot, crash.roots.codeRoot)).rejects.toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
  });

  it('refuses an unsupported SQLite reader revision without an external marker and leaves canonical records untouched', async () => {
    const crash = await admittedCrash();
    await unlink(dataVersionMarkerPath(crash.snapshot));
    const path = join(crash.snapshot, 'store', 'ai7.sqlite');
    const db = new DatabaseSync(path); db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`); const before = requestRows(db); db.close();
    await expect(EditorialStore.open(crash.snapshot, crash.roots.codeRoot)).rejects.toMatchObject({ code: 'SCHEMA_UNSUPPORTED' });
    const after = new DatabaseSync(path); try { expect(requestRows(after)).toEqual(before); } finally { after.close(); }
  });

  it.each([90, 91].flatMap((revision) => requestFields.flatMap(([table, field]) => [null, { malformed: true }].map((value) => ({ revision, table, field, location: `${table}.${field}`, value })))))
    ('refuses property presence under predecessor $revision at $location ($value), without restamping', async ({ revision, table, field, value }) => {
      const crash = await admittedCrash(table === 'analysis_unit_checkpoints' ? 'unit' : table === 'analysis_clarification_requests' ? 'clarification' : 'held');
      const path = join(crash.snapshot, 'store', 'ai7.sqlite'); const db = new DatabaseSync(path);
      for (const [target, property] of requestFields) rewriteRequestRows(db, target, (record) => { delete record[property]; });
      expect(db.prepare(`SELECT count(*) total FROM ${table}`).get()!.total).toBeGreaterThan(0);
      rewriteRequestRows(db, table, (record, index) => { if (index === 0) record[field] = value; });
      db.exec(`PRAGMA user_version = ${revision}`); const before = requestRows(db); db.close();
      const marker = (await readDataVersionMarker(crash.snapshot))!;
      await writeFile(dataVersionMarkerPath(crash.snapshot), JSON.stringify({ ...marker, schemaRevision: revision }));
      await expect(EditorialStore.open(crash.snapshot, crash.roots.codeRoot)).rejects.toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
      const after = new DatabaseSync(path); try { expect(requestRows(after)).toEqual(before); } finally { after.close(); }
      expect((await readDataVersionMarker(crash.snapshot))!.schemaRevision).toBe(revision);
    });

  it.each(['digest', 'chain', 'sequence', 'binding', 'foreign-run', 'foreign-unit', 'input', 'logical-request', 'ordinal', 'unknown-event', 'extra-key', 'orphan-array', 'orphan-refusal', 'duplicate-array', 'foreign-array', 'no-send-correlation'] as const)
    ('refuses rehashed current-format $0 corruption before any reconciliation or canonical mutation', async (damage) => {
      const crash = await admittedCrash('unit'); const path = join(crash.snapshot, 'store', 'ai7.sqlite'); const db = new DatabaseSync(path);
      let previous: string | null = null; let changed = false;
      rewriteRequestRows(db, 'analysis_run_states', (record) => {
        if (damage === 'orphan-array') { delete record.requestAdmission; return; }
        if (damage === 'orphan-refusal' && !changed) { record.requestRefusal = null; changed = true; }
        const receipt = record.requestAdmission as { data: Record<string, unknown>; digest: string } | undefined;
        if (receipt === undefined) return;
        receipt.data.predecessorDigest = previous;
        const event = receipt.data.event as { kind: string; request?: Record<string, unknown>; evidence?: { kind: string; digest: string } };
        if (!changed && (event.kind === 'admit' || damage === 'no-send-correlation' && event.kind === 'resolve')) {
          if (damage === 'chain') receipt.data.predecessorDigest = 'f'.repeat(64);
          else if (damage === 'sequence') receipt.data.sequence = 99;
          else if (damage === 'binding') receipt.data.bindingDigest = '0'.repeat(64);
          else if (damage === 'foreign-run') receipt.data.runRecordId = '00000000-0000-4000-8000-000000000001';
          else if (damage === 'foreign-unit') event.request!.unitOrdinal = 2;
          else if (damage === 'input') event.request!.inputDigest = '0'.repeat(64);
          else if (damage === 'logical-request') event.request!.requestDigest = '0'.repeat(64);
          else if (damage === 'ordinal') event.request!.requestOrdinal = 99;
          else if (damage === 'unknown-event') event.kind = 'unknown';
          else if (damage === 'extra-key') event.request!.unexpected = true;
          else if (damage === 'no-send-correlation') {
            if (event.kind !== 'resolve') { receipt.digest = canonicalRecord(receipt.data).digest; previous = receipt.digest; return; }
            event.evidence!.kind = 'no-send';
          }
          changed = true;
        }
        receipt.digest = damage === 'digest' && changed && event.kind === 'admit' ? '0'.repeat(64) : canonicalRecord(receipt.data).digest;
        previous = receipt.digest;
      });
      if (damage === 'duplicate-array' || damage === 'foreign-array') rewriteRequestRows(db, 'analysis_unit_checkpoints', (record) => {
        const requests = record.requests as string[];
        record.requests = damage === 'duplicate-array' ? [requests[0], requests[0]] : ['00000000-0000-4000-8000-000000000001'];
      });
      const before = requestRows(db); db.close();
      await expect(EditorialStore.open(crash.snapshot, crash.roots.codeRoot)).rejects.toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
      const after = new DatabaseSync(path); try { expect(requestRows(after)).toEqual(before); } finally { after.close(); }
    });

  it.each(['replace', 'merge'] as const)('preserves exact admitted request identities through export and %s without sending', async (operation) => {
    const crash = await admittedCrash('unit');
    const source = await EditorialStore.open(crash.snapshot, crash.roots.codeRoot); crash.opened.push(source);
    const db = new DatabaseSync(join(crash.snapshot, 'store', 'ai7.sqlite'), { readOnly: true }); const before = requestRows(db); db.close();
    const destination = join(crash.roots.inputRoot, 'request-evidence.ai7db');
    const prepared = await source.prepareDatabaseExport(destination, true);
    expect((await source.approveDatabaseExport(prepared.preparationId, true)).outcome).toBe('created');
    const targetRoot = join(crash.roots.dataRoot, '..', 'request-target');
    let target = await EditorialStore.open(targetRoot, crash.roots.codeRoot);
    const preview = await target.inspectDatabaseImport(destination);
    if (operation === 'replace') await target.prepareDatabaseReplacement(preview.previewId);
    else await target.prepareDatabaseMerge(preview.previewId);
    await target.close(); target = await EditorialStore.open(targetRoot, crash.roots.codeRoot); crash.opened.push(target);
    const carried = new DatabaseSync(join(targetRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try { expect(requestRows(carried)).toEqual(before); } finally { carried.close(); }
    expect(target.executionLedgerForRun(crash.runRecordId).requestAdmissionOf(crash.runRecordId)!.open.size).toBe(1);
    expect(crash.calls()).toBe(2);
  });

  it.each(['replace', 'merge'] as const)('refuses invalid incoming request evidence through %s and retains the destination', async (operation) => {
    const crash = await admittedCrash(); const path = join(crash.snapshot, 'store', 'ai7.sqlite'); const db = new DatabaseSync(path);
    rewriteRequestRows(db, 'analysis_run_states', (record, index) => { if (index === 0) record.requestRefusal = null; });
    const destination = join(crash.roots.inputRoot, 'invalid-request-evidence.ai7db');
    try { await writeDatabasePackage(db, crash.snapshot, destination, () => ({ dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION, softwareVersion: '0.1.0',
      createdAt: new Date().toISOString(), origin: 'database-export' })); } finally { db.close(); }
    const targetRoot = join(crash.roots.dataRoot, '..', 'request-target'); let target = await EditorialStore.open(targetRoot, crash.roots.codeRoot);
    crash.opened.push(target);
    const creation = target.prepareBookCreation('合成目标数据', null); target.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest });
    const before = target.listBooks(null);
    const preview = await target.inspectDatabaseImport(destination);
    if (operation === 'replace') {
      await target.prepareDatabaseReplacement(preview.previewId);
      await target.close(); crash.opened.splice(crash.opened.indexOf(target), 1);
      target = await EditorialStore.open(targetRoot, crash.roots.codeRoot); crash.opened.push(target);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'replace', outcome: 'failed' });
    } else await expect(target.prepareDatabaseMerge(preview.previewId)).rejects.toBeDefined();
    expect(target.listBooks(null)).toEqual(before); expect(crash.calls()).toBe(1);
  });

  it('refuses a second discharge of an already checkpointed physical request', async () => {
    const crash = await admittedCrash('unit'); const path = join(crash.snapshot, 'store', 'ai7.sqlite'); const db = new DatabaseSync(path);
    const rows = db.prepare('SELECT * FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence').all(crash.runRecordId);
    const records = rows.map((row) => JSON.parse(String(row.canonical_json)));
    const discharged = records.find((record) => record.requestAdmission?.data.event.kind === 'resolve' && record.requestAdmission.data.event.evidence.kind === 'unit-checkpoint');
    expect(discharged).toBeDefined();
    const latest = records.at(-1); const previous = [...records].reverse().find((record) => record.requestAdmission !== undefined).requestAdmission;
    const data = { ...previous.data, sequence: previous.data.sequence + 1, predecessorDigest: previous.digest, event: discharged.requestAdmission.data.event };
    const record = { ...latest, sequence: latest.sequence + 1, recordedAt: new Date().toISOString(),
      requestAdmission: { schema: 'ai7.analysis.request-admission/1', data, digest: canonicalRecord(data).digest } };
    const canonical = canonicalRecord(record);
    db.prepare('INSERT INTO analysis_run_states(run_record_id, sequence, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crash.runRecordId, record.sequence, record.state, record.recordedAt, canonical.json, canonical.digest);
    const before = requestRows(db); db.close();
    await expect(EditorialStore.open(crash.snapshot, crash.roots.codeRoot)).rejects.toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
    const after = new DatabaseSync(path); try { expect(requestRows(after)).toEqual(before); } finally { after.close(); }
  });

  it('refuses a governed append under a predecessor stamp before writing any positive no-send evidence', async () => {
    const crash = await admittedCrash(); const path = join(crash.roots.dataRoot, 'store', 'ai7.sqlite'); const db = new DatabaseSync(path);
    const original = crash.opened[0]!; const ledger = original.executionLedgerForRun(crash.runRecordId);
    const request = [...ledger.requestAdmissionOf(crash.runRecordId)!.open.values()][0]!;
    db.exec('PRAGMA user_version = 91'); const before = requestRows(db);
    try {
      expect(() => ledger.recordModelRequestNotSent(crash.runRecordId, request.requestId)).toThrow('读者修订');
      expect(requestRows(db)).toEqual(before);
    } finally { db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION}`); db.close(); }
  });

  it.each([null, true, ['ordinary-production-editorial-review']])('refuses a coercible nonstring rule pin %j instead of treating it as a string', async (rule) => {
    const crash = await admittedCrash(); const db = new DatabaseSync(join(crash.snapshot, 'store', 'ai7.sqlite'));
    rewriteRulePin(db, rule); db.close();
    let refusal: unknown = null;
    try { const opened = await EditorialStore.open(crash.snapshot, crash.roots.codeRoot); await opened.close(); }
    catch (error) { refusal = error; }
    expect(refusal).toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
  });

  it('refuses changed chain rule pins while retaining a consistently rehashed first receipt as an immutable historical pin', async () => {
    const crash = await admittedCrash(); const db = new DatabaseSync(join(crash.snapshot, 'store', 'ai7.sqlite'));
    rewriteRulePin(db, 'another-admitted-rule', true); db.close();
    await expect(EditorialStore.open(crash.snapshot, crash.roots.codeRoot)).rejects.toMatchObject({ code: 'ANALYSIS_RECORD_INVALID' });
  });

  it('refuses a fully substituted root rule at actual continuation before admission, producer registration, history or send', async () => {
    const crash = await admittedCrash(); const path = join(crash.snapshot, 'store', 'ai7.sqlite'); const db = new DatabaseSync(path);
    rewriteRulePin(db, 'another-admitted-rule'); db.close();
    // The pure reader authenticates existing parents and chain consistency, not a substituted root rule.
    const reopened = await EditorialStore.open(crash.snapshot, crash.roots.codeRoot); crash.opened.push(reopened);
    reopened.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy: crash.policy,
      live: { scope: 'ordinary-production', ...crash.binding, runBudgetCeiling: 'unset' } });
    reopened.reconcileStoppedReviewCategoryRuns(); const ledger = reopened.executionLedgerForRun(crash.runRecordId);
    const current = new DatabaseSync(path); const before = requestRows(current); current.close();
    const capacity = governor(); let calls = 0;
    const restarted = new BaselineAnalysisExecutionOwner({ requestGovernor: capacity, ledger: reopened.baselineAnalysisLedger,
      launchPolicy: crash.policy, fixture: null, secretResolver: { resolve: async () => 'synthetic-placeholder' },
      productionPolicyFor: (selected) => resolveSourceCheckoutLaunchPolicySync(crash.roots.codeRoot, 'ordinary-production', selected),
      production: { scope: 'ordinary-production', nativeFetch: async () => { calls += 1; throw new Error('synthetic possible send'); } } });
    scenarioCleanups.push(() => restarted.dispose());
    expect(() => restarted.admitAndDispatch(crash.runRecordId, ledger, { resume: true })).toThrow('规则');
    expect(calls).toBe(0); expect(capacity.snapshot()).toMatchObject({ registered: 0, waiting: 0, inFlight: 0 });
    const after = new DatabaseSync(path); try { expect(requestRows(after)).toEqual(before); } finally { after.close(); }
  });

  it('keeps frozen width3 for the same rule when a resumed caller proposes width1, without appending evidence', async () => {
    const crash = await admittedCrash(); const ledger = crash.opened[0]!.executionLedgerForRun(crash.runRecordId);
    const receipt = ledger.requestAdmissionOf(crash.runRecordId)!; expect(receipt.width).toBe(3);
    const db = new DatabaseSync(join(crash.roots.dataRoot, 'store', 'ai7.sqlite')); const before = requestRows(db);
    expect(ledger.beginRequestAdmissions(crash.runRecordId, 1, receipt.pins.policyRuleId)).toBe(3);
    expect(() => ledger.beginRequestAdmissions(crash.runRecordId, 1, 'a-different-admitted-rule')).toThrow('规则');
    try { expect(requestRows(db)).toEqual(before); } finally { db.close(); }
  });
});

describe('ModelRequestGovernor capacity and identity', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 5])(
    'refuses invalid or raised global capacity %s', (globalCapacity) => {
      expect(() => new ModelRequestGovernor({ globalCapacity })).toThrow('MODEL_REQUEST_CAPACITY_INVALID');
    },
  );

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 2])(
    'refuses invalid or raised background capacity %s', (backgroundCapacity) => {
      expect(() => new ModelRequestGovernor({ backgroundCapacity })).toThrow('MODEL_REQUEST_CAPACITY_INVALID');
    },
  );

  it.each([1, 2, 3, 4])('allows lower trusted request capacity %s', async (globalCapacity) => {
    const owner = governor({ globalCapacity, backgroundCapacity: 1 });
    const permits = await Promise.all(Array.from({ length: globalCapacity }, (_, index) => acquire(owner, producer(owner, `unit-${index}`))));
    const next = acquire(owner, producer(owner, 'next'));
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: globalCapacity });
    permits[0]!.release();
    const nextPermit = await next;
    expect(owner.snapshot()).toMatchObject({ waiting: 0, inFlight: globalCapacity });
    for (const permit of permits) permit.release();
    nextPermit.release();
  });

  it.each([{}, { globalCapacity: 1, backgroundCapacity: 1 }])('keeps all nine producer registrations with options %j', async (options) => {
    const owner = governor(options);
    const kinds: ModelRequestProducerKind[] = [
      'analysis-unit', 'analysis-unit', 'analysis-unit', 'analysis-stage', 'analysis-stage', 'analysis-stage',
      'dialogue', 'fast-role', 'connection-test',
    ];
    const registrations = kinds.map((kind, index) => producer(owner, `producer-${index}`, 'foreground', kind));
    expect(owner.snapshot()).toEqual({ registered: 9, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
    expect(() => producer(owner, 'tenth')).toThrow('MODEL_REQUEST_PRODUCER_CAPACITY');
    const snapshot = owner.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    owner.unregisterProducer(registrations[0]!);
    const replacement = producer(owner, 'tenth');
    const permit = await acquire(owner, replacement);
    expect(snapshot).toEqual({ registered: 9, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
    expect(owner.snapshot()).toMatchObject({ registered: 9, inFlight: 1 });
    permit.release();
  });

  it('refuses duplicate live keys and alien registrations without changing either governor', async () => {
    const owner = governor();
    const other = governor();
    const registration = producer(owner, 'shared-key');
    const alien = producer(other, 'shared-key');
    expect(Object.isFrozen(registration)).toBe(true);
    expect(() => producer(owner, 'shared-key')).toThrow('MODEL_REQUEST_PRODUCER_DUPLICATE');
    await expect(acquire(owner, alien)).rejects.toThrow('MODEL_REQUEST_PRODUCER_ALIEN');
    expect(() => owner.unregisterProducer(alien)).toThrow('MODEL_REQUEST_PRODUCER_ALIEN');
    expect(owner.snapshot()).toEqual(other.snapshot());
    const permit = await acquire(owner, registration);
    permit.release();
  });

  it('refuses a second queued or active acquisition from the same producer', async () => {
    const owner = governor({ globalCapacity: 1 });
    const first = producer(owner, 'first');
    const second = producer(owner, 'second');
    const firstPermit = await acquire(owner, first);
    await expect(acquire(owner, first)).rejects.toThrow('MODEL_REQUEST_PRODUCER_BUSY');
    const secondRequest = acquire(owner, second);
    await expect(acquire(owner, second)).rejects.toThrow('MODEL_REQUEST_PRODUCER_BUSY');
    expect(owner.snapshot()).toMatchObject({ registered: 2, waiting: 1, inFlight: 1 });
    firstPermit.release();
    const secondPermit = await secondRequest;
    secondPermit.release();
  });
});

describe('ModelRequestGovernor eligible FIFO', () => {
  it('caps defaults at four total and one background, skipping only ineligible background waits', async () => {
    const owner = governor();
    const background = await acquire(owner, producer(owner, 'background-1', 'background'));
    const foreground = await Promise.all([0, 1, 2].map((index) => acquire(owner, producer(owner, `foreground-${index}`))));
    const nextBackground = acquire(owner, producer(owner, 'background-2', 'background'));
    const nextForeground = acquire(owner, producer(owner, 'foreground-next'));
    expect(owner.snapshot()).toEqual({ registered: 6, waiting: 2, inFlight: 4, backgroundInFlight: 1 });
    foreground[0]!.release();
    const foregroundPermit = await nextForeground;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 4, backgroundInFlight: 1 });
    background.release();
    const backgroundPermit = await nextBackground;
    expect(owner.snapshot()).toMatchObject({ waiting: 0, inFlight: 4, backgroundInFlight: 1 });
    for (const permit of foreground) permit.release();
    foregroundPermit.release();
    backgroundPermit.release();
  });

  it('never reserves an idle permit for background work', async () => {
    const owner = governor();
    const permits = await Promise.all([0, 1, 2, 3].map((index) => acquire(owner, producer(owner, `foreground-${index}`))));
    expect(owner.snapshot()).toMatchObject({ inFlight: 4, backgroundInFlight: 0 });
    for (const permit of permits) permit.release();
  });

  it('admits an older background waiter before a younger foreground waiter once eligible', async () => {
    const owner = governor({ globalCapacity: 1 });
    const active = await acquire(owner, producer(owner, 'active'));
    const background = acquire(owner, producer(owner, 'older-background', 'background'));
    const foreground = acquire(owner, producer(owner, 'younger-foreground'));
    active.release();
    const backgroundPermit = await background;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1, backgroundInFlight: 1 });
    backgroundPermit.release();
    const foregroundPermit = await foreground;
    foregroundPermit.release();
  });

  it('puts a registered producer re-acquiring after tools behind older queued requests', async () => {
    const owner = governor({ globalCapacity: 1 });
    const first = producer(owner, 'first');
    const firstPermit = await acquire(owner, first);
    const second = acquire(owner, producer(owner, 'second'));
    const third = acquire(owner, producer(owner, 'third'));
    firstPermit.release(); // Tool processing retains this registration without a permit or priority.
    const firstAgain = acquire(owner, first);
    const secondPermit = await second;
    expect(owner.snapshot()).toMatchObject({ registered: 3, waiting: 2, inFlight: 1 });
    secondPermit.release();
    const thirdPermit = await third;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1 });
    thirdPermit.release();
    const firstAgainPermit = await firstAgain;
    firstAgainPermit.release();
  });
});

describe('ModelRequestGovernor cancellation and permit ownership', () => {
  it('rejects a pre-aborted acquisition without queuing or closing its registration', async () => {
    const owner = governor();
    const registration = producer(owner, 'unit');
    const controller = new AbortController();
    const reason = new Error('cancelled before queue');
    controller.abort(reason);
    const listener = vi.spyOn(controller.signal, 'addEventListener');
    await expect(owner.acquire(registration, controller.signal)).rejects.toBe(reason);
    expect(listener).not.toHaveBeenCalled();
    expect(owner.snapshot()).toEqual({ registered: 1, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
    const permit = await acquire(owner, registration);
    permit.release();
  });

  it('removes a queued abort, detaches its listener and preserves the remaining FIFO', async () => {
    const owner = governor({ globalCapacity: 1 });
    const active = await acquire(owner, producer(owner, 'active'));
    const cancelled = producer(owner, 'cancelled');
    const controller = new AbortController();
    const detached = vi.spyOn(controller.signal, 'removeEventListener');
    const reason = new Error('cancelled while queued');
    const queued = owner.acquire(cancelled, controller.signal);
    const rejected = expect(queued).rejects.toBe(reason);
    const next = acquire(owner, producer(owner, 'next'));
    controller.abort(reason);
    await rejected;
    expect(detached).toHaveBeenCalledOnce();
    expect(owner.snapshot()).toMatchObject({ registered: 3, waiting: 1, inFlight: 1 });
    const cancelledAgain = acquire(owner, cancelled);
    active.release();
    const nextPermit = await next;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1 });
    nextPermit.release();
    const retriedPermit = await cancelledAgain;
    retriedPermit.release();
  });

  it('cancels an ineligible background waiter without disturbing active foreground work', async () => {
    const owner = governor({ globalCapacity: 2 });
    const background = await acquire(owner, producer(owner, 'background', 'background'));
    const controller = new AbortController();
    const queued = owner.acquire(producer(owner, 'queued-background', 'background'), controller.signal);
    const rejected = expect(queued).rejects.toHaveProperty('name', 'AbortError');
    const foreground = await acquire(owner, producer(owner, 'foreground'));
    controller.abort();
    await rejected;
    expect(owner.snapshot()).toMatchObject({ waiting: 0, inFlight: 2, backgroundInFlight: 1 });
    background.release();
    foreground.release();
  });

  it('keeps an immediate grant occupied when aborted before the awaiting continuation', async () => {
    const owner = governor({ globalCapacity: 1 });
    const registration = producer(owner, 'unit');
    const controller = new AbortController();
    const attached = vi.spyOn(controller.signal, 'addEventListener');
    const detached = vi.spyOn(controller.signal, 'removeEventListener');
    const request = owner.acquire(registration, controller.signal);
    const next = acquire(owner, producer(owner, 'next'));
    const reason = new Error('abort after grant');
    controller.abort(reason);
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1 });
    expect(detached).toHaveBeenCalledWith('abort', attached.mock.calls[0]![1]);
    const permit = await request;
    expect(() => controller.signal.throwIfAborted()).toThrow(reason);
    await expect(acquire(owner, registration)).rejects.toThrow('MODEL_REQUEST_PRODUCER_BUSY');
    permit.release();
    const nextPermit = await next;
    nextPermit.release();
  });

  it('keeps a queued grant occupied when aborted synchronously after release grants it', async () => {
    const owner = governor({ globalCapacity: 1 });
    const active = await acquire(owner, producer(owner, 'active'));
    const controller = new AbortController();
    const request = owner.acquire(producer(owner, 'queued'), controller.signal);
    active.release();
    controller.abort(); // The grant happened, but the awaiting caller has not resumed.
    expect(owner.snapshot()).toMatchObject({ waiting: 0, inFlight: 1 });
    const permit = await request;
    permit.release();
  });

  it('holds capacity during aborted body consumption until caller-owned cleanup finishes', async () => {
    const owner = governor({ globalCapacity: 1 });
    const controller = new AbortController();
    const body = Promise.withResolvers<void>();
    const consuming = Promise.withResolvers<void>();
    const cleaning = Promise.withResolvers<void>();
    const cleanup = Promise.withResolvers<void>();
    const reason = new Error('transport aborted');
    const consume = async (): Promise<void> => {
      const permit = await owner.acquire(producer(owner, 'body'), controller.signal);
      try {
        controller.signal.throwIfAborted();
        consuming.resolve();
        await body.promise;
      } finally {
        cleaning.resolve();
        await cleanup.promise;
        permit.release();
      }
    };
    const consumption = consume();
    const rejected = expect(consumption).rejects.toBe(reason);
    await consuming.promise;
    const next = acquire(owner, producer(owner, 'next'));
    controller.abort(reason);
    body.reject(reason);
    await cleaning.promise;
    expect(owner.snapshot()).toMatchObject({ waiting: 1, inFlight: 1 });
    cleanup.resolve();
    await rejected;
    const nextPermit = await next;
    nextPermit.release();
  });
});

describe('ModelRequestGovernor unregister, close and idle', () => {
  it('unregisters idle or queued producers, detaches waits and refuses released identities', async () => {
    const owner = governor({ globalCapacity: 1 });
    const idle = producer(owner, 'idle');
    owner.unregisterProducer(idle);
    owner.unregisterProducer(idle);
    await expect(acquire(owner, idle)).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    const active = await acquire(owner, producer(owner, 'active'));
    const queued = producer(owner, 'queued');
    const controller = new AbortController();
    const detached = vi.spyOn(controller.signal, 'removeEventListener');
    const request = owner.acquire(queued, controller.signal);
    const rejected = expect(request).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    const next = acquire(owner, producer(owner, 'next'));
    owner.unregisterProducer(queued);
    owner.unregisterProducer(queued);
    await rejected;
    expect(detached).toHaveBeenCalledOnce();
    controller.abort();
    await expect(acquire(owner, queued)).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    expect(owner.snapshot()).toMatchObject({ registered: 2, waiting: 1, inFlight: 1 });
    active.release();
    const nextPermit = await next;
    nextPermit.release();
  });

  it('retains a closing active producer and key until release, isolating all later same-key registrations', async () => {
    const owner = governor({ globalCapacity: 1 });
    const registration = producer(owner, 'unit', 'background');
    const permit = await acquire(owner, registration);
    owner.unregisterProducer(registration);
    owner.unregisterProducer(registration);
    expect(owner.snapshot()).toEqual({ registered: 1, waiting: 0, inFlight: 1, backgroundInFlight: 1 });
    expect(() => producer(owner, 'unit')).toThrow('MODEL_REQUEST_PRODUCER_DUPLICATE');
    await expect(acquire(owner, registration)).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    permit.release();
    const replacement = producer(owner, 'unit');
    expect(replacement).not.toBe(registration);
    const replacementPermit = await acquire(owner, replacement);
    owner.unregisterProducer(registration);
    permit.release();
    await expect(acquire(owner, registration)).rejects.toThrow('MODEL_REQUEST_PRODUCER_CLOSED');
    expect(owner.snapshot()).toEqual({ registered: 1, waiting: 0, inFlight: 1, backgroundInFlight: 0 });
    replacementPermit.release();
  });

  it('keeps closing active registrations inside the fixed nine-producer bound', async () => {
    const owner = governor({ globalCapacity: 1 });
    const registrations = Array.from({ length: 9 }, (_, index) => producer(owner, `unit-${index}`));
    const active = await acquire(owner, registrations[0]!);
    owner.unregisterProducer(registrations[0]!);
    expect(() => producer(owner, 'replacement')).toThrow('MODEL_REQUEST_PRODUCER_CAPACITY');
    expect(owner.snapshot()).toMatchObject({ registered: 9, inFlight: 1 });
    active.release();
    producer(owner, 'replacement');
    expect(owner.snapshot()).toMatchObject({ registered: 9, inFlight: 0 });
  });

  it('closes queued and idle registrations while retaining active counts until cleanup', async () => {
    const owner = governor({ globalCapacity: 1 });
    const activeRegistration = producer(owner, 'active', 'background');
    const active = await acquire(owner, activeRegistration);
    const queuedRegistration = producer(owner, 'queued');
    const controller = new AbortController();
    const detached = vi.spyOn(controller.signal, 'removeEventListener');
    const queued = owner.acquire(queuedRegistration, controller.signal);
    const rejected = expect(queued).rejects.toThrow('MODEL_REQUEST_GOVERNOR_CLOSED');
    producer(owner, 'idle');
    owner.close();
    owner.close();
    await rejected;
    expect(detached).toHaveBeenCalledOnce();
    expect(owner.snapshot()).toEqual({ registered: 1, waiting: 0, inFlight: 1, backgroundInFlight: 1 });
    expect(controller.signal.aborted).toBe(false); // The governor does not own transport cancellation.
    expect(() => producer(owner, 'new')).toThrow('MODEL_REQUEST_GOVERNOR_CLOSED');
    await expect(acquire(owner, activeRegistration)).rejects.toThrow('MODEL_REQUEST_GOVERNOR_CLOSED');
    owner.unregisterProducer(queuedRegistration);
    owner.unregisterProducer(activeRegistration);
    active.release();
    active.release();
    await owner.whenIdle();
    expect(owner.snapshot()).toEqual({ registered: 0, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
  });

  it('waits for queued and active requests, shares one idle promise, and ignores idle registrations', async () => {
    const owner = governor({ globalCapacity: 1 });
    const idleRegistration = producer(owner, 'idle');
    await owner.whenIdle();
    const active = await acquire(owner, producer(owner, 'active'));
    const queued = acquire(owner, producer(owner, 'queued'));
    const idle = owner.whenIdle();
    expect(owner.whenIdle()).toBe(idle);
    let settled = false;
    const observedIdle = idle.then(() => { settled = true; });
    active.release();
    const queuedPermit = await queued;
    expect(settled).toBe(false);
    queuedPermit.release();
    await observedIdle;
    expect(settled).toBe(true);
    expect(owner.snapshot()).toMatchObject({ registered: 3, waiting: 0, inFlight: 0 });
    const nextPermit = await acquire(owner, idleRegistration);
    expect(owner.whenIdle()).not.toBe(idle);
    nextPermit.release();
    await owner.whenIdle();
  });

  it('does not resolve idle while an aborted granted request remains active after close', async () => {
    const owner = governor({ globalCapacity: 1 });
    const controller = new AbortController();
    const permit = await owner.acquire(producer(owner, 'active'), controller.signal);
    let settled = false;
    const idle = owner.whenIdle().then(() => { settled = true; });
    controller.abort();
    owner.close();
    await Promise.resolve();
    expect(settled).toBe(false);
    permit.release();
    await idle;
    expect(settled).toBe(true);
  });

  it('releasing an old permit twice cannot release its re-acquired successor', async () => {
    const owner = governor({ globalCapacity: 1 });
    const registration = producer(owner, 'unit');
    const first = await acquire(owner, registration);
    first.release();
    const second = await acquire(owner, registration);
    first.release();
    expect(owner.snapshot()).toMatchObject({ inFlight: 1 });
    second.release();
    second.release();
    await owner.whenIdle();
  });
});
