import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { IMPORTED_SKILL_SCHEMA_SQL, IMPORTED_SKILL_TRIGGER_SQL, IMPORTED_SKILL_UPDATE_SCHEMA_SQL, IMPORTED_SKILL_UPDATE_TRIGGER_SQL } from '../../src/service/imported-skill-schema.js';
import { NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL } from '../../src/service/editorial-workspace-profile.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { IMPORTED_SKILL_UPDATE_SCHEMA_VERSION, LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { execPre74Fixture, pre82SchemaRows } from '../support/pre74-schema.js';

let roots: ServiceTestRoots | undefined;
afterEach(async () => { await roots?.dispose(); roots = undefined; });

describe('imported Skill store boundary', () => {
  it('migrates schema 80 additively, preserving existing schema and native installation bytes, and retains exact history across restart', async () => {
    roots = await createServiceTestRoots('ai7-imported-skill-service-');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const creation = store.prepareBookCreation('合成工序测试图书', null);
    const bookId = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
    store.markCleanShutdown(); store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const prior = new DatabaseSync(path);
    let before: unknown[];
    try {
      // Synchronized delta with #89: the revision-83 update relations stand on revision 81's, so a revision-80 store lacks both.
      for (const trigger of [...Object.keys(IMPORTED_SKILL_UPDATE_TRIGGER_SQL), ...Object.keys(IMPORTED_SKILL_TRIGGER_SQL)]) prior.exec(`DROP TRIGGER ${trigger}`);
      for (const table of [...Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL), ...Object.keys(IMPORTED_SKILL_SCHEMA_SQL)].reverse()) prior.exec(`DROP TABLE ${table}`);
      execPre74Fixture(prior, 'PRAGMA user_version = 80');
      before = prior.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
      expect(String(prior.prepare("SELECT sql FROM sqlite_schema WHERE name = 'native_artifact_installations'").get()?.sql)).toBe(NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL);
    } finally { prior.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const after = new DatabaseSync(path, { readOnly: true });
      try {
        expect(Number(after.prepare('PRAGMA user_version').get()?.user_version)).toBe(LATEST_SCHEMA_VERSION);
        expect(IMPORTED_SKILL_UPDATE_SCHEMA_VERSION).toBe(83);
        const added = new Set([...Object.keys(IMPORTED_SKILL_SCHEMA_SQL), ...Object.keys(IMPORTED_SKILL_TRIGGER_SQL), ...Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL), ...Object.keys(IMPORTED_SKILL_UPDATE_TRIGGER_SQL)]);
        expect(pre82SchemaRows(after.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<{ type: string; name: string; sql: string }>).filter((row) => !added.has(String(row.name)))).toEqual(before!);
        for (const table of [...Object.keys(IMPORTED_SKILL_SCHEMA_SQL), ...Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL)]) expect(MERGE_TABLE_POLICY[table as keyof typeof MERGE_TABLE_POLICY]).toBe('house');
      } finally { after.close(); }
      // Acquisition discloses and keeps nothing; keeping is the editor's separate act (ADR 0090 §2).
      const disclosed = await store.importSkillPackage({ path: resolve('tests/fixtures/skills/plain'), keep: null });
      expect(disclosed.revision).toBeNull();
      expect(store.inspectImportedSkills(null, null).skills).toEqual([]);
      const keptPackage = await store.importSkillPackage({ path: null, keep: disclosed.acquisition.acquisitionId });
      await expect(store.importSkillPackage({ path: null, keep: disclosed.acquisition.acquisitionId })).rejects.toMatchObject({ code: 'SKILL_ACQUISITION_GONE' });
      const imported = keptPackage.revision!;
      expect(imported.snapshotSha256).toBe(disclosed.acquisition.contentSha256);
      const validated = store.validateImportedSkill(imported.revisionId);
      const installed = store.installImportedSkill(validated.revisionId, validated.previewDigest);
      const enabled = store.enableImportedSkill(installed.revisionId, bookId, installed.previewDigest);
      expect(enabled.enabledBooks).toEqual([bookId]);
      const writes = new DatabaseSync(path, { readOnly: true });
      const counts = (): unknown[] => writes.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map((row) => [row.name, writes.prepare(`SELECT count(*) AS n FROM "${String(row.name).replaceAll('"', '""')}"`).get()?.n]);
      try {
        const priorCounts = counts();
        const recommendation = store.recommendProcedures({ bookId, goal: '合成审阅', taskKind: 'review-run', scope: 'whole', categoryIds: [] });
        expect(recommendation.status).toBe('none');
        expect(recommendation.excludedSkillReason).toContain('没有执行器');
        expect(recommendation.candidates).toEqual([]);
        expect(counts()).toEqual(priorCounts);
      } finally { writes.close(); }
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.inspectImportedSkills(enabled.revisionId, null).revision).toEqual(enabled);
    } finally { store.markCleanShutdown(); store.close(); }
  });

  it('refuses a store at 81 or later without its imported Skill relations rather than giving them anew (Reviewer, #66)', async () => {
    roots = await createServiceTestRoots('ai7-imported-skill-refusal-');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const planted = new DatabaseSync(path);
    try {
      expect(Number(planted.prepare('PRAGMA user_version').get()?.user_version)).toBe(98);
      for (const trigger of [...Object.keys(IMPORTED_SKILL_UPDATE_TRIGGER_SQL), ...Object.keys(IMPORTED_SKILL_TRIGGER_SQL)]) planted.exec(`DROP TRIGGER ${trigger}`);
      for (const table of [...Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL), ...Object.keys(IMPORTED_SKILL_SCHEMA_SQL)].reverse()) planted.exec(`DROP TABLE ${table}`);
    } finally { planted.close(); }
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toMatchObject({ code: 'SCHEMA_MIGRATION_FAILED' });
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect(after.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'imported_skill%'").all()).toEqual([]);
    } finally { after.close(); }
  });
});
