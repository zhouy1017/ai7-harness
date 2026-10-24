import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { PROCEDURE_DEFINITION_SCHEMA_SQL, PROCEDURE_DEFINITION_TRIGGER_SQL, resolveProcedureDefinition } from '../../src/service/procedures/definition-store.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

let roots: ServiceTestRoots;
afterEach(async () => { await roots?.dispose(); });

describe('Procedure Definition persistence and exact plan pins', () => {
  it('pins a baseline plan and Run beside unchanged canonical envelope bytes and preserves them on restart', async () => {
    roots = await createServiceTestRoots('ai7-procedure-pins-');
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let digest: string;
    try {
      ({ bookId } = await importSample1Book(store, roots.codeRoot, '工序定义公开样书测试'));
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, '工序测试连接');
      let work = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
      while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
      const projection = work.projection!;
      const pin = projection.planEnvelope!.procedure!;
      digest = projection.planEnvelope!.digest;
      expect(pin).toMatchObject({ procedureId: 'ai7-procedure/baseline-analysis', version: 1, digest: expect.stringMatching(/^[a-f0-9]{64}$/u) });
      const read = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const row = read.prepare("SELECT canonical_json, sha256 FROM analysis_plan_records WHERE component = 'plan-envelope' AND task_intent_id = ?")
          .get(projection.taskIntent!.taskIntentId)!;
        const envelope = JSON.parse(String(row.canonical_json));
        expect(envelope).not.toHaveProperty('procedure');
        expect(canonicalRecord(envelope)).toEqual({ json: row.canonical_json, digest });
        expect(row.sha256).toBe(digest);
      } finally { read.close(); }
      const run = store.authorizeBaselineAnalysis(bookId, projection.taskIntent!.taskIntentId, digest);
      expect(run.projection.run!.procedure).toEqual(pin);
      expect((await store.inspectKnowledgeProcedures()).preinstalled?.find((entry) => entry.procedureId === pin.procedureId)?.uses).toBe(1);
      store.markCleanShutdown();
    } finally { store.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const projection = store.inspectBaselineAnalysis(bookId!);
      expect(projection.planEnvelope!.digest).toBe(digest!);
      expect(projection.run!.procedure).toEqual(projection.planEnvelope!.procedure);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('migrates revision 84 additively, recovers a committed pre-stamp schema and refuses missing terminal tables', async () => {
    roots = await createServiceTestRoots('ai7-procedure-migration-');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const creation = store.prepareBookCreation('合成工序迁移图书', null);
    const book = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book;
    store.markCleanShutdown(); store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    let db = new DatabaseSync(path);
    const before = db.prepare('SELECT * FROM books').all();
    for (const table of Object.keys(PROCEDURE_DEFINITION_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE ${table}`);
    db.exec('PRAGMA user_version = 84'); db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect((await store.inspectKnowledgeProcedures()).preinstalled).toHaveLength(11);
    store.markCleanShutdown(); store.close();
    db = new DatabaseSync(path);
    expect(db.prepare('SELECT * FROM books').all()).toEqual(before);
    expect(db.prepare('SELECT count(*) total FROM procedure_plan_pins').get()!.total).toBe(0);
    expect(() => db.exec('UPDATE procedure_definition_versions SET version = 2')).toThrow(/PROCEDURE_DEFINITION_IMMUTABLE/u);
    expect(() => db.exec('DELETE FROM procedure_definitions')).toThrow(/PROCEDURE_DEFINITION_IMMUTABLE/u);
    db.exec('PRAGMA user_version = 84'); db.close(); // Committed tables and seed, interrupted before the stamp.
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getBookOverview(book.bookId).book.bookId).toBe(book.bookId);
    store.markCleanShutdown(); store.close();
    db = new DatabaseSync(path);
    // Synchronized with #1082, #1083 and #1084: revisions 86 to 88 follow; 88 adds the version-2 review procedures beside version 1.
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(90);
    const originalVersions = db.prepare("SELECT * FROM procedure_definition_versions WHERE version = 1 AND procedure_id <> 'ai7-procedure/local-text-check' ORDER BY version_id").all();
    // A genuine revision85 holds the historical ten definitions, before the new local identity exists.
    db.exec("DROP TRIGGER procedure_definition_versions_no_delete; DROP TRIGGER procedure_definitions_no_delete; DELETE FROM procedure_definition_versions WHERE version = 2 OR procedure_id = 'ai7-procedure/local-text-check'; DELETE FROM procedure_definitions WHERE procedure_id = 'ai7-procedure/local-text-check'; PRAGMA user_version = 85;");
    db.exec(PROCEDURE_DEFINITION_TRIGGER_SQL['procedure_definition_versions_no_delete']!);
    db.exec(PROCEDURE_DEFINITION_TRIGGER_SQL['procedure_definitions_no_delete']!);
    db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const library = (await store.inspectKnowledgeProcedures()).preinstalled!;
    expect(library.filter((entry) => entry.version === 2)).toHaveLength(7);
    expect(library.filter((entry) => entry.version === 2).every((entry) => entry.previousVersions?.[0]?.version === 1)).toBe(true);
    store.markCleanShutdown(); store.close();
    db = new DatabaseSync(path);
    expect(db.prepare("SELECT * FROM procedure_definition_versions WHERE version = 1 AND procedure_id <> 'ai7-procedure/local-text-check' ORDER BY version_id").all()).toEqual(originalVersions);
    expect(resolveProcedureDefinition(db, 'ai7-procedure/review-typos-and-usage', 1).document.stages[0]!.outputTemplateId).toBe('ai7.editorial-review.unit-result/1');
    expect(resolveProcedureDefinition(db, 'ai7-procedure/review-typos-and-usage').document.stages[0]!.outputTemplateId).toBe('ai7.editorial-review.unit-result/2');
    db.exec('DROP TABLE procedure_plan_pins'); db.close();
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
    db = new DatabaseSync(path, { readOnly: true });
    expect(db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'procedure_plan_pins'").get()).toBeUndefined();
    db.close();
  });
});
