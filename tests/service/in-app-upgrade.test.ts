import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createUpgradeSample1 } from '../support/upgrade-sample1.js';
import { reimportVersion } from '../support/reimport-version.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { readDataVersionMarker, storeRevisionOnDisk } from '../../src/service/data-version.js';
import { beginUpgrade, beginUpgradeRollback, resumeUpgrade, upgradePreflight } from '../../src/service/in-app-upgrade.js';
import { EditorialStore } from '../../src/service/store.js';
import { backupLocationFor } from '../../src/service/scheduled-backups.js';
import { databasePackageSources, verifyCopiedPayloads } from '../../src/service/database-exports.js';
import { fileDigest } from '../../src/service/manuscript-export.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { ImportedSkills, acquireSkillPackage } from '../../src/service/imported-skills.js';
import { ImportedSkillUpdates } from '../../src/service/imported-skill-updates.js';
import { IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION } from '../../src/service/imported-skill-schema.js';

let roots: ServiceTestRoots;
let legacy: Awaited<ReturnType<typeof createUpgradeSample1>>;
beforeAll(async () => {
  roots = await createServiceTestRoots('ai7-upgrade-');
  legacy = await createUpgradeSample1(roots.dataRoot, roots.codeRoot);
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try {
    const skills = new ImportedSkills(db);
    const updates = new ImportedSkillUpdates(db, skills);
    const acquire = (name: string) => acquireSkillPackage(join(roots.codeRoot, 'tests', 'fixtures', 'skills', name));
    const skill = skills.keep(await acquire('plain'));
    updates.createRule(skill.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    expect(updates.keep(skill.skillId, await acquire('plain-v2-text'), randomUUID()).candidate?.adoptedBy).toBe('rule');
    updates.revokeRule(skill.skillId);
  } finally { db.close(); }
});
afterAll(async () => { await roots.dispose(); });

it('resumes each phase, imports the older package and recovers missing old files from its backup', async () => {
  const root = join(roots.inputRoot, 'library');
  await cp(roots.dataRoot, root, { recursive: true });
  await expect(upgradePreflight(root, 0)).rejects.toMatchObject({ code: 'UPGRADE_SPACE' });
  expect(existsSync(join(root, 'store.upgrading'))).toBe(false);
  await beginUpgrade(root);
  const stopped = new Set<string>();
  const run = () => resumeUpgrade(root, '0.8.0', (stage, renamed) => {
    const point = renamed ? stage + '-renamed' : stage;
    if (!stopped.has(point)) { stopped.add(point); throw Error('interrupted ' + point); }
  });
  for (const stage of ['backup', 'convert', 'verify', 'save-old', 'save-old-renamed', 'publish', 'publish-renamed', 'record']) {
    await expect(run()).rejects.toThrow('interrupted ' + stage);
    await expect(EditorialStore.open(root, roots.codeRoot)).rejects.toMatchObject({ code: 'UPGRADE_PENDING' });
  }
  expect(await run()).toMatchObject({ restored: false });
  const converted = await EditorialStore.open(root, roots.codeRoot);
  try {
    expect(converted.listBooks(null).items.length).toBe(2);
    expect(converted.inspectDataVersion().upgrades[0]?.fromDataVersion).toBe(1);
  } finally { converted.markCleanShutdown(); converted.close(); }
  const db = new DatabaseSync(join(root, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    expect(db.prepare("SELECT count(*) n FROM manuscript_revisions WHERE revision_label='升级时的稿件'").get()?.n).toBe(2);
    expect(db.prepare('SELECT count(*) n FROM editor_steps').get()?.n).toBe(0);
  } finally { db.close(); }
  const editor = await EditorialStore.open(root, roots.codeRoot);
  try {
    const { manuscriptId, branchId } = legacy.binding;
    const current = () => editor.getManuscriptWindow(manuscriptId, branchId, null);
    const view = current();
    const before = view.workingDigest;
    const scope = { bookId: view.bookId, manuscriptId, branchId };
    expect(editor.undoManuscript(manuscriptId, branchId, before).canUndo).toBe(false);
    editor.reverseAppliedChangeSuggestion({ ...legacy.binding, windowStartBlockId: view.blocks[0]!.blockId, markId: legacy.markId, clientEffectId: randomUUID() });
    expect(current().workingDigest === before).toBe(false);
    await editor.saveMilestone(manuscriptId, branchId, '新版本', 'stage-archive', null, '');
    const restored = editor.restoreBookVersion({ ...scope, revisionId: view.revisionId, expectedBase: current().revisionId, expectedDigest: current().workingDigest });
    expect(restored.stepId).toBeTruthy();
    expect(current().workingDigest === before || current().blocks.every((block, i) => block.text === view.blocks[i]?.text)).toBe(true);
    const path = join(roots.inputRoot, 'sample1-edited.docx');
    await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 2, blocks: 14, title: 'sample1' });
    await reimportVersion(editor, view.bookId, path, false);
  } finally { editor.markCleanShutdown(); editor.close(); }
  const other = join(roots.inputRoot, 'import');
  const target = await EditorialStore.open(other, roots.codeRoot);
  try {
    const location = backupLocationFor(root);
    const archive = (await readdir(location)).find(f => f.endsWith('.ai7db'))!;
    const preview = await target.inspectDatabaseImport(join(location, archive));
    expect(preview.compatibility).toBe('compatible');
    await target.prepareDatabaseReplacement(preview.previewId, new Date());
  } finally { target.markCleanShutdown(); target.close(); }
  const opened = await EditorialStore.open(other, roots.codeRoot);
  try { expect(opened.listBooks(null).items.length).toBe(2); }
  finally { opened.markCleanShutdown(); opened.close(); }
  await rm(join(root, 'objects'), { recursive: true });
  await mkdir(join(root, 'objects'));
  await beginUpgradeRollback(root);
  for (const stage of ['restore', 'save-new', 'save-new-renamed', 'publish-old', 'publish-old-renamed']) await expect(run()).rejects.toThrow('interrupted ' + stage);
  expect(await run()).toMatchObject({ restored: true });
  expect(storeRevisionOnDisk(join(root, 'store', 'ai7.sqlite'))).toBe(116);
  expect((await readDataVersionMarker(root))?.dataVersion).toBe(1);
  await upgradePreflight(root);
  const oldAgain = await legacy.openLegacy(root);
  const oldExport = join(roots.inputRoot, 'after-rollback.ai7db');
  try {
    const prep = await oldAgain.prepareDatabaseExport(oldExport, true);
    await oldAgain.approveDatabaseExport(prep.preparationId, true);
  } finally { oldAgain.markCleanShutdown(); oldAgain.close(); }
  const mergeRoot = join(roots.inputRoot, 'merge');
  const merger = await EditorialStore.open(mergeRoot, roots.codeRoot);
  try {
    const preview = await merger.inspectDatabaseImport(oldExport);
    expect(preview.compatibility).toBe('compatible');
    await merger.prepareDatabaseMerge(preview.previewId);
  } finally { merger.markCleanShutdown(); merger.close(); }
  const merged = await EditorialStore.open(mergeRoot, roots.codeRoot);
  try { expect(merged.listBooks(null).items).toHaveLength(2); }
  finally { merged.markCleanShutdown(); merged.close(); }
  await beginUpgrade(root);
  await resumeUpgrade(root, '0.8.0');
  const lost = join(roots.inputRoot,'lost-sources');
  await cp(root,lost,{recursive:true});
  for (const entry of await readdir(lost)) if (entry.startsWith('store-before-0.8.0-')) {
    await rm(join(lost,entry),{recursive:true});
  }
  await expect(beginUpgradeRollback(lost)).rejects.toMatchObject({code:'UPGRADE_BACKUP_FAILED'});
  expect(existsSync(join(lost,'shell','storage-upgrade.json'))).toBe(false);
  const healthy = await EditorialStore.open(lost,roots.codeRoot);
  try { expect(healthy.listBooks(null).items).toHaveLength(2); }
  finally { healthy.markCleanShutdown(); healthy.close(); }
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root, '0.8.0')).toMatchObject({ restored: true });
  expect((await readdir(join(root, 'shell'))).filter(name => name.startsWith('store-after-0.8.0-'))).toHaveLength(2);
}, 180_000);

it('accepts only the unlink order authorized by an abandoned old import', async () => {
  const root = join(roots.inputRoot, 'abandoned');
  await cp(roots.dataRoot, root, { recursive: true });
  const store = join(root, 'store', 'ai7.sqlite');
  const db = new DatabaseSync(store);
  const draft = randomUUID();
  const now = new Date().toISOString();
  const working = await composeManuscriptDocx(join(roots.inputRoot, 'working.docx'), { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 3, title: 'sample1' });
  const sample = db.prepare("SELECT text FROM working_blocks WHERE length(text)>0 LIMIT 1").get()!;
  const original = Buffer.from(String(sample.text));
  const objects = [original, working].map((bytes, i) => {
    const digest = createHash('sha256').update(bytes).digest('hex');
    const key = `sha256/${digest.slice(0, 2)}/${digest}.${i ? 'docx' : 'txt'}`;
    return { digest, key, bytes };
  });
  const [source, docx] = objects as [typeof objects[number], typeof objects[number]];
  try {
    for (const obj of objects) {
      db.prepare('INSERT INTO content_objects VALUES(?,?,?,?)').run(obj.digest, obj.key, obj.bytes.length, now);
      await mkdir(join(root, 'objects', 'sha256', obj.digest.slice(0, 2)), { recursive: true });
      await writeFile(join(root, 'objects', obj.key), obj.bytes);
    }
    db.prepare(`INSERT INTO import_drafts(draft_id,selection_token,state,draft_version,display_name,object_digest,source_format,working_object_digest,converter_identity,staged_at)
      VALUES (?,?,'staged',1,'sample1.txt',?,'TXT',?,'sample1',?)`).run(draft, randomUUID(), source.digest, docx.digest, now);
    const verify = async () => {
      const members = await Promise.all((await databasePackageSources(root)).map(async file => ({ path: file.member, ...(await fileDigest(file.path))! })));
      await verifyCopiedPayloads(store, members, 116);
    };
    await rm(join(root, 'objects', source.key));
    // Identical missing bytes without a recorded cleanup must stop the backup.
    await expect(verify()).rejects.toMatchObject({ code: 'DATABASE_PACKAGE_INCOMPLETE' });
    db.prepare(`INSERT INTO import_abandonment_cleanup_intents(draft_id,object_digest,expected_draft_version,relative_key,state,requested_at,working_object_digest)
      VALUES (?,?,1,?,'prepared',?,?)`).run(draft, source.digest, source.key, now, docx.digest);
    await verify(); // original removed, working DOCX still present
    await rm(join(root, 'objects', docx.key));
    await verify(); // both removed before the state update
    await writeFile(join(root, 'objects', source.key), source.bytes);
    await expect(verify()).rejects.toMatchObject({ code: 'DATABASE_PACKAGE_INCOMPLETE' });
    await rm(join(root, 'objects', source.key));
    db.prepare("UPDATE import_abandonment_cleanup_intents SET state='bytes-removed', bytes_removed_at=? WHERE draft_id=?").run(now, draft);
    await verify();
  } finally { db.close(); }
  await beginUpgrade(root);
  expect(await resumeUpgrade(root, '0.8.0')).toMatchObject({ restored: false });
  const opened = await EditorialStore.open(root, roots.codeRoot);
  try { expect(opened.listBooks(null).items).toHaveLength(2); }
  finally { opened.markCleanShutdown(); opened.close(); }
}, 180_000);
