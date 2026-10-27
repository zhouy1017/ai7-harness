import { ANALYSIS_LEDGER_SCHEMA_SQL, IDLE_RUN_AUTHORIZATIONS_SQL } from '../../src/service/task-authorization.js';
import { join, resolve } from 'node:path';
import { cp } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import {
  IMPORTED_SKILL_SCHEMA_SQL, IMPORTED_SKILL_TRIGGER_SQL, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION, IMPORTED_SKILL_UPDATE_SCHEMA_SQL, IMPORTED_SKILL_UPDATE_TRIGGER_SQL,
} from '../../src/service/imported-skill-schema.js';
import { IMPORTED_SKILL_UPDATE_SCHEMA_VERSION, LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { execPre74Fixture, IMPORTED_SKILL_UPDATE_RELATIONS, pre82SchemaRows } from '../support/pre74-schema.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

let roots: ServiceTestRoots | undefined;
afterEach(async () => { await roots?.dispose(); roots = undefined; });

const fixture = (name: string) => resolve('tests/fixtures/skills', name);
const databasePath = (): string => join(roots!.dataRoot, 'store', 'ai7.sqlite');
/** Every table of the store with its row count: what a step is shown to leave alone. */
function counts(): Record<string, number> {
  const db = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map((row) => [String(row.name), Number(db.prepare(`SELECT count(*) AS n FROM "${String(row.name)}"`).get()?.n)]));
  } finally { db.close(); }
}
async function open(): Promise<EditorialStore> {
  roots ??= await createServiceTestRoots('ai7-imported-skill-update-');
  return EditorialStore.open(roots.dataRoot, roots.codeRoot);
}
async function importPlain(store: EditorialStore) {
  const disclosed = await store.importSkillPackage({ path: fixture('plain'), keep: null });
  return (await store.importSkillPackage({ path: null, keep: disclosed.acquisition.acquisitionId })).revision!;
}
async function check(store: EditorialStore, skillId: string, name: string) {
  const disclosed = await store.checkImportedSkillUpdate({ skillId, path: fixture(name), keep: null });
  return { disclosed, kept: () => store.checkImportedSkillUpdate({ skillId, path: null, keep: disclosed.acquisition.acquisitionId }) };
}

describe('foreign Skill updates over the real store (ADR 0090 §3; REUSE-032 to REUSE-035)', () => {
  it('checks an update from a file as an inert candidate, adopts it explicitly into a revision never enabled, and returns without restoring enablement', async () => {
    let store = await open();
    const creation = store.prepareBookCreation('合成更新测试图书', null);
    const bookId = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
    const first = await importPlain(store);
    const validated = store.validateImportedSkill(first.revisionId);
    const installed = store.installImportedSkill(validated.revisionId, validated.previewDigest);
    const enabled = store.enableImportedSkill(installed.revisionId, bookId, installed.previewDigest);
    expect(enabled).toMatchObject({ state: 'enabled', enabledBooks: [bookId] });

    // Disclosure reads the package and keeps nothing; keeping records exactly a snapshot and a candidate.
    const before = counts();
    const { disclosed, kept } = await check(store, first.skillId, 'plain-v2-text');
    expect(disclosed).toMatchObject({ skillId: first.skillId, relation: 'newer', candidate: null });
    expect(disclosed.acquisition).toMatchObject({ name: 'synthetic-style-review', sourceRevision: '1.1.0', keepable: true });
    expect(counts()).toEqual(before);
    const { candidate } = await kept();
    expect(candidate).toMatchObject({ disposition: 'clean', status: 'open', stale: false, conflicts: [], authorityChanges: [], acceptItems: [] });
    expect(counts()).toEqual({ ...before, imported_skill_snapshots: before.imported_skill_snapshots! + 1, imported_skill_update_candidates: before.imported_skill_update_candidates! + 1 });
    const page = store.inspectImportedSkills(first.revisionId, null);
    expect(page.revision).toEqual(enabled);
    expect(page.candidates).toEqual([expect.objectContaining({ candidateId: candidate!.candidateId, status: 'open', disposition: 'clean' })]);
    expect(page.history).toEqual([expect.objectContaining({ revisionId: first.revisionId, current: true, origin: 'import', selectedReason: 'import' })]);
    expect(store.inspectImportedSkillUpdate(candidate!.candidateId)).toEqual(candidate);

    // Adoption is the editor's reviewed act: a new revision at 待验证, current, never enabled.
    const afterCheck = counts();
    const adopted = store.adoptImportedSkillUpdate({ candidateId: candidate!.candidateId, reviewDigest: candidate!.reviewDigest, acceptItems: [], upstreamPaths: [] });
    expect(adopted).toMatchObject({ status: 'adopted', adoptedBy: 'editor' });
    expect(counts()).toEqual({
      ...afterCheck, imported_skill_revisions: afterCheck.imported_skill_revisions! + 1, imported_skill_update_candidates: afterCheck.imported_skill_update_candidates! + 1,
      imported_skill_current_selections: afterCheck.imported_skill_current_selections! + 1,
    });
    const second = store.inspectImportedSkills(adopted.adoptedRevisionId, null);
    expect(second.revision).toMatchObject({ ordinal: 2, previousRevisionId: first.revisionId, state: 'pending-validation', enabledBooks: [] });
    expect(second.skills.map((skill) => skill.revisionId)).toEqual([adopted.adoptedRevisionId]);
    expect(second.history.map((entry) => [entry.ordinal, entry.current, entry.origin])).toEqual([[2, true, 'adopt'], [1, false, 'import']]);
    expect(second.candidates[0]).toMatchObject({ status: 'adopted', adoptedBy: 'editor' });
    // The existing stages carry the new revision on, and only the current one.
    expect(() => store.validateImportedSkill(first.revisionId)).toThrow(/不是当前修订/u);
    expect(store.validateImportedSkill(adopted.adoptedRevisionId!)).toMatchObject({ state: 'validated', enabledBooks: [] });

    // Nothing the revisions' pins, rules or Runs hold moves: only the update ledgers and the revision relations grew.
    const beforeReturn = counts();
    const returned = store.rollbackImportedSkill(first.skillId, first.revisionId);
    expect(returned).toMatchObject({ revisionId: first.revisionId, state: 'installed-disabled', enabledBooks: [] });
    expect(counts()).toEqual({ ...beforeReturn, imported_skill_current_selections: beforeReturn.imported_skill_current_selections! + 1 });
    expect(store.inspectImportedSkills(first.revisionId, null).history.map((entry) => [entry.ordinal, entry.current, entry.selectedReason]))
      .toEqual([[2, false, null], [1, true, 'rollback']]);
    expect(() => store.rollbackImportedSkill(first.skillId, first.revisionId)).toThrow(/已经是当前修订/u);

    // History and the current selection survive a restart; enablement is the editor's again, explicitly.
    store.markCleanShutdown(); store.close();
    store = await open();
    try {
      const reread = store.inspectImportedSkills(first.revisionId, null);
      expect(reread.revision).toMatchObject({ state: 'installed-disabled', enabledBooks: [] });
      expect(reread.history.map((entry) => [entry.ordinal, entry.current])).toEqual([[2, false], [1, true]]);
      expect(store.enableImportedSkill(first.revisionId, bookId, reread.revision!.previewDigest)).toMatchObject({ state: 'enabled', enabledBooks: [bookId] });
      // 工序推荐 neither recommends nor writes anything for a Skill, current or not.
      const priorCounts = counts();
      const recommendation = store.recommendProcedures({ bookId, goal: '合成审阅', taskKind: 'review-run', scope: 'whole', categoryIds: [] });
      expect(recommendation.candidates).toEqual([]);
      expect(counts()).toEqual(priorCounts);
    } finally { store.markCleanShutdown(); store.close(); }
  });

  it('refuses a package that is not the same Skill, and one that is not a Skill, leaving nothing staged or recorded', async () => {
    const store = await open();
    try {
      const first = await importPlain(store);
      const before = counts();
      await expect(store.checkImportedSkillUpdate({ skillId: first.skillId, path: fixture('other-skill'), keep: null })).rejects.toMatchObject({ code: 'SKILL_UPDATE_IDENTITY_DIFFERS', message: '这不是同一个 Skill 的新版本。' });
      await expect(store.checkImportedSkillUpdate({ skillId: first.skillId, path: fixture('malformed'), keep: null })).rejects.toMatchObject({ code: 'SKILL_UPDATE_IDENTITY_DIFFERS' });
      await expect(store.checkImportedSkillUpdate({ skillId: first.skillId, path: null, keep: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ code: 'SKILL_ACQUISITION_GONE' });
      expect(counts()).toEqual(before);
      // The very version the Skill was kept from is no update, and one kept before is the history's to return to.
      await expect(check(store, first.skillId, 'plain')).resolves.toMatchObject({ disclosed: { relation: 'same-as-current' } });
      const { kept } = await check(store, first.skillId, 'plain');
      await expect(kept()).rejects.toMatchObject({ code: 'SKILL_UPDATE_NOT_NEWER' });
      expect(counts()).toEqual(before);
    } finally { store.markCleanShutdown(); store.close(); }
  });

  it('shows each finding of a candidate that is not clean, and adopts it only when each is named back', async () => {
    const store = await open();
    try {
      const first = await importPlain(store);
      const scripts = (await (await check(store, first.skillId, 'plain-v2-scripts')).kept()).candidate!;
      expect(scripts).toMatchObject({ disposition: 'authority-change', validator: { state: 'restricted' } });
      expect(scripts.files.map((entry) => [entry.path, entry.change])).toEqual([['SKILL.md', 'upstream'], ['scripts/marker.sh', 'upstream']]);
      expect(scripts.acceptItems.length).toBeGreaterThanOrEqual(2);
      const input = { candidateId: scripts.candidateId, reviewDigest: scripts.reviewDigest, acceptItems: scripts.acceptItems, upstreamPaths: [] };
      expect(() => store.adoptImportedSkillUpdate({ ...input, acceptItems: [] })).toThrow(/逐项确认/u);
      const adopted = store.adoptImportedSkillUpdate(input);
      // The adopted revision carries the script as an inert file the validator then restricts; it is never run.
      const revision = store.inspectImportedSkills(adopted.adoptedRevisionId, null).revision!;
      expect(revision.workingFiles.map((entry) => entry.path)).toEqual(['SKILL.md', 'scripts/marker.sh']);
      expect(store.validateImportedSkill(revision.revisionId)).toMatchObject({ state: 'restricted' });
      expect(() => store.installImportedSkill(revision.revisionId, store.inspectImportedSkills(revision.revisionId, null).revision!.previewDigest)).toThrow(/先验证通过/u);
      // 忽略 on another keeps the record and nothing else.
      const malformed = (await (await check(store, first.skillId, 'plain-v2-malformed')).kept()).candidate!;
      expect(malformed).toMatchObject({ disposition: 'validator-failed', status: 'open', stale: false });
      expect(store.dismissImportedSkillUpdate(malformed.candidateId)).toMatchObject({ status: 'dismissed' });
    } finally { store.markCleanShutdown(); store.close(); }
  });

  it('adopts a clean update by the Skill\'s own rule only, enabling nothing, and stops when the rule is revoked', async () => {
    const store = await open();
    try {
      const first = await importPlain(store);
      const rulesBefore = counts();
      expect(() => store.createImportedSkillUpdateRule(first.skillId, '好')).toThrow(/确认规则的说明/u);
      const rule = store.createImportedSkillUpdateRule(first.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
      expect(rule).toMatchObject({ active: true, confirmation: IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION });
      // The rule has its own ledger: the default execution rules are not touched.
      expect(counts()).toEqual({ ...rulesBefore, imported_skill_update_rules: rulesBefore.imported_skill_update_rules! + 1 });
      expect(counts().default_execution_rules).toBe(rulesBefore.default_execution_rules);
      const auto = (await (await check(store, first.skillId, 'plain-v2-text')).kept()).candidate!;
      expect(auto).toMatchObject({ disposition: 'clean', status: 'adopted', adoptedBy: 'rule' });
      const adopted = store.inspectImportedSkills(auto.adoptedRevisionId, null);
      expect(adopted.revision).toMatchObject({ ordinal: 2, state: 'pending-validation', enabledBooks: [] });
      expect(adopted.history[0]).toMatchObject({ origin: 'rule', current: true, selectedReason: 'rule' });
      expect(adopted.rule).toMatchObject({ active: true, ruleId: rule.ruleId });
      // Anything short of clean returns to the editor.
      const risky = (await (await check(store, first.skillId, 'plain-v2-scripts')).kept()).candidate!;
      expect(risky).toMatchObject({ status: 'open', adoptedBy: null });
      expect(risky.disposition).not.toBe('clean');
      // Revoked, a clean update waits for the editor again.
      const revoked = store.revokeImportedSkillUpdateRule(first.skillId);
      expect(revoked).toMatchObject({ active: false, history: [{ action: 'create' }, { action: 'revoke' }] });
      const waiting = (await (await check(store, first.skillId, 'plain-v3-text')).kept()).candidate!;
      expect(waiting).toMatchObject({ disposition: 'clean', status: 'open', adoptedBy: null });
      expect(store.inspectImportedSkills(auto.adoptedRevisionId, null).history.map((entry) => entry.ordinal)).toEqual([2, 1]);
    } finally { store.markCleanShutdown(); store.close(); }
  });
});

describe('import and update stay distinct at the shared acquisition seam', () => {
  it('binds a disclosure to import or update of the exact Skill, without consuming it on refusal', async () => {
    const store = await open();
    try {
      const first = await importPlain(store);
      const update = (await check(store, first.skillId, 'plain-v2-text')).disclosed;
      const before = counts();
      await expect(store.importSkillPackage({ path: null, keep: update.acquisition.acquisitionId }))
        .rejects.toMatchObject({ code: 'SKILL_ACQUISITION_PURPOSE_DIFFERS' });
      await expect(store.checkImportedSkillUpdate({ skillId: randomUUID(), path: null, keep: update.acquisition.acquisitionId }))
        .rejects.toMatchObject({ code: 'SKILL_ACQUISITION_PURPOSE_DIFFERS' });
      const imported = await store.importSkillPackage({ path: fixture('plain-v3-text'), keep: null });
      await expect(store.checkImportedSkillUpdate({ skillId: first.skillId, path: null, keep: imported.acquisition.acquisitionId }))
        .rejects.toMatchObject({ code: 'SKILL_ACQUISITION_PURPOSE_DIFFERS' });
      expect(counts()).toEqual(before);
      const kept = await store.checkImportedSkillUpdate({ skillId: first.skillId, path: null, keep: update.acquisition.acquisitionId });
      expect(kept.candidate).toMatchObject({ status: 'open', adoptedRevisionId: null });
      expect(store.inspectImportedSkills(first.revisionId, null).skills[0]!.revisionId).toBe(first.revisionId);
    } finally { store.markCleanShutdown(); store.close(); }
  });

  it('cannot import an inert candidate snapshot to bypass reviewed adoption, and identical history stays idempotent', async () => {
    const store = await open();
    try {
      const first = await importPlain(store);
      const candidate = (await (await check(store, first.skillId, 'plain-v2-text')).kept()).candidate!;
      const disclosed = await store.importSkillPackage({ path: fixture('plain-v2-text'), keep: null });
      const before = counts();
      await expect(store.importSkillPackage({ path: null, keep: disclosed.acquisition.acquisitionId }))
        .rejects.toMatchObject({ code: 'SKILL_IMPORT_REQUIRES_UPDATE', message: expect.stringContaining('检查更新（从文件）…') });
      expect(counts()).toEqual(before);
      expect(store.inspectImportedSkillUpdate(candidate.candidateId).status).toBe('open');
      const adopted = store.adoptImportedSkillUpdate({ candidateId: candidate.candidateId, reviewDigest: candidate.reviewDigest, acceptItems: [], upstreamPaths: [] });
      store.rollbackImportedSkill(first.skillId, first.revisionId);
      const after = counts();
      // Re-importing the same already-kept bytes returns that exact revision, without selecting it again.
      const repeat = await store.importSkillPackage({ path: null, keep: disclosed.acquisition.acquisitionId });
      expect(repeat.revision!.revisionId).toBe(adopted.adoptedRevisionId);
      const original = await store.importSkillPackage({ path: fixture('plain'), keep: null });
      expect((await store.importSkillPackage({ path: null, keep: original.acquisition.acquisitionId })).revision!.revisionId).toBe(first.revisionId);
      expect(counts()).toEqual(after);
      expect(store.inspectImportedSkills(first.revisionId, null).skills[0]!.revisionId).toBe(first.revisionId);
    } finally { store.markCleanShutdown(); store.close(); }
  });

  it('preserves repair of an identityless rejected source but requires update review once it has an identity', async () => {
    const store = await open();
    try {
      const source = join(roots!.dataRoot, 'synthetic-skill');
      await cp(fixture('malformed'), source, { recursive: true });
      const importSource = async () => {
        const read = await store.importSkillPackage({ path: source, keep: null });
        return (await store.importSkillPackage({ path: null, keep: read.acquisition.acquisitionId })).revision!;
      };
      const bad = await importSource();
      expect(store.validateImportedSkill(bad.revisionId).state).toBe('rejected');
      await cp(fixture('plain'), source, { recursive: true });
      const repaired = await importSource();
      expect(repaired).toMatchObject({ skillId: bad.skillId, ordinal: 2, previousRevisionId: bad.revisionId, state: 'pending-validation' });
      await cp(fixture('plain-v2-text'), source, { recursive: true });
      const before = counts();
      await expect(importSource()).rejects.toMatchObject({ code: 'SKILL_IMPORT_REQUIRES_UPDATE' });
      expect(counts()).toEqual(before);
    } finally { store.markCleanShutdown(); store.close(); }
  });
});

describe('revision 83 over earlier stores', () => {
  it.each([81, 82])('adds its three relations empty to a revision-%i store and reads a Skill kept before as on its latest revision', async (predecessor) => {
    let store = await open();
    const first = await importPlain(store);
    store.markCleanShutdown(); store.close();
    const planted = new DatabaseSync(databasePath());
    let before: unknown[];
    try {
      // The shared predecessor fixture undoes revision 83 (and 81, 80 … for an earlier stamp); at 81 only revision 83 is missing.
      execPre74Fixture(planted, `PRAGMA user_version = ${predecessor}`);
      before = planted.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
      for (const table of IMPORTED_SKILL_UPDATE_RELATIONS) expect(planted.prepare('SELECT 1 FROM sqlite_schema WHERE name = ?').get(table)).toBeUndefined();
      expect(planted.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE 'imported_skill%'").get()?.n)
        .toBe(Object.keys(IMPORTED_SKILL_SCHEMA_SQL).length + Object.keys(IMPORTED_SKILL_TRIGGER_SQL).length);
    } finally { planted.close(); }
    store = await open();
    try {
      const after = new DatabaseSync(databasePath(), { readOnly: true });
      try {
        expect(Number(after.prepare('PRAGMA user_version').get()?.user_version)).toBe(LATEST_SCHEMA_VERSION);
        expect(IMPORTED_SKILL_UPDATE_SCHEMA_VERSION).toBe(83);
        const added = new Set([...Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL), ...Object.keys(IMPORTED_SKILL_UPDATE_TRIGGER_SQL)]);
        const rows = after.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<{ type: string; name: string; sql: string }>;
        // At 81 the predecessor also traverses 7f's admitted Result Set rebuild; at 82 every pre-existing schema row is exact.
        expect((predecessor < 82 ? pre82SchemaRows(rows) : rows.map((row) => row.name === 'analysis_task_intents'
          ? { ...row, sql: ANALYSIS_LEDGER_SCHEMA_SQL.analysis_task_intents } : row.name === 'analysis_run_authorizations'
            ? { ...row, sql: IDLE_RUN_AUTHORIZATIONS_SQL } : row)).filter((row) => !added.has(String(row.name)))).toEqual(before!);
        for (const table of IMPORTED_SKILL_UPDATE_RELATIONS) {
          expect(after.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBe(0);
          expect(MERGE_TABLE_POLICY[table as keyof typeof MERGE_TABLE_POLICY]).toBe('house');
        }
      } finally { after.close(); }
      // The Skill kept at 81 has no selection; it is on its latest revision, and a new one is kept beside it.
      const page = store.inspectImportedSkills(first.revisionId, null);
      expect(page.skills.map((skill) => skill.revisionId)).toEqual([first.revisionId]);
      expect(page.history).toEqual([expect.objectContaining({ revisionId: first.revisionId, current: true, selectedReason: null })]);
      const candidate = (await (await check(store, first.skillId, 'plain-v2-text')).kept()).candidate!;
      const adopted = store.adoptImportedSkillUpdate({ candidateId: candidate.candidateId, reviewDigest: candidate.reviewDigest, acceptItems: [], upstreamPaths: [] });
      expect(store.inspectImportedSkills(adopted.adoptedRevisionId, null).history.map((entry) => [entry.ordinal, entry.current])).toEqual([[2, true], [1, false]]);
    } finally { store.markCleanShutdown(); store.close(); }
  });

  it('refuses a revision-83 store without its update relations rather than giving them anew', async () => {
    const store = await open();
    store.markCleanShutdown(); store.close();
    const planted = new DatabaseSync(databasePath());
    try {
      expect(Number(planted.prepare('PRAGMA user_version').get()?.user_version)).toBe(97);
      for (const trigger of Object.keys(IMPORTED_SKILL_UPDATE_TRIGGER_SQL)) planted.exec(`DROP TRIGGER ${trigger}`);
      for (const table of Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL).reverse()) planted.exec(`DROP TABLE ${table}`);
    } finally { planted.close(); }
    await expect(EditorialStore.open(roots!.dataRoot, roots!.codeRoot)).rejects.toMatchObject({ code: 'SCHEMA_MIGRATION_FAILED' });
    const after = new DatabaseSync(databasePath(), { readOnly: true });
    try {
      expect(after.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'imported_skill_update%' OR name LIKE 'imported_skill_current%'").all()).toEqual([]);
    } finally { after.close(); }
  });
});
