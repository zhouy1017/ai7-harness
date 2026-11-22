import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
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
import { verifyDatabasePackage } from '../../src/service/database-package-reader.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { ImportedSkills, acquireSkillPackage } from '../../src/service/imported-skills.js';
import { ImportedSkillUpdates } from '../../src/service/imported-skill-updates.js';
import { IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION } from '../../src/service/imported-skill-schema.js';

let roots: ServiceTestRoots;
let legacy: Awaited<ReturnType<typeof createUpgradeSample1>>;
beforeAll(async () => {
  roots = await createServiceTestRoots('ai7-upgrade-');
  legacy = await createUpgradeSample1(roots.dataRoot, roots.codeRoot);
  const old = await legacy.openLegacy(roots.dataRoot);
  try {
    // The captured SampleBook library already has this channel's opaque reference.
    old.selectBothRoleModels('opencode-go','glm-5.3-flash');
  } finally { old.markCleanShutdown(); old.close(); }
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
    expect(converted.getModelRoles().map(role => role.binding?.modelId)).toEqual(Array(4).fill('glm-5.3-flash'));
    expect(converted.inspectDataVersion().upgrades[0]?.fromDataVersion).toBe(1);
  } finally { converted.markCleanShutdown(); converted.close(); }
  const db = new DatabaseSync(join(root, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    expect(db.prepare('SELECT count(*) n FROM manuscript_revisions WHERE upgrade_snapshot=1').get()?.n).toBe(2);
    expect(db.prepare('SELECT count(*) n FROM editor_steps').get()?.n).toBe(0);
  } finally { db.close(); }
  const editor = await EditorialStore.open(root, roots.codeRoot);
  try {
    const { manuscriptId, branchId } = legacy.binding;
    const current = () => editor.getManuscriptWindow(manuscriptId, branchId, null);
    const view = current();
    const before = view.workingDigest;
    const query = view.blocks.find(block => block.text.length >= 4)!.text.slice(0,4);
    const search = editor.createSearch(manuscriptId,branchId,query);
    while (!editor.advanceSearch(search.searchId).done) { /* advance a bounded search page */ }
    expect(editor.getSearchResults(search.searchId,null).totalMatches).toBeGreaterThan(0);
    const scope = { bookId: view.bookId, manuscriptId, branchId };
    expect(() => editor.undoManuscript(manuscriptId, branchId, before)).toThrow(expect.objectContaining({code:'NOTHING_TO_UNDO'}));
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
  const backupFolder = backupLocationFor(root);
  const backup = (await readdir(backupFolder)).find(name => name.endsWith('.ai7db'))!;
  const members = async (archive: string) => (await verifyDatabasePackage(archive,{dataRoot:root})).manifest.members.filter(member => member.path !== 'store/ai7.sqlite');
  const original = await members(join(backupFolder,backup));
  const newObject = (await fileDigest(join(roots.inputRoot,'sample1-edited.docx')))!.sha256;
  const newKey = join('objects','sha256',newObject.slice(0,2),newObject+'.docx');
  expect(existsSync(join(root,newKey))).toBe(true);
  await rm(join(root,original.find(member => member.path.startsWith('objects/'))!.path));
  await beginUpgradeRollback(root);
  const interruptedCopy = join(root,'store','payloads');
  await mkdir(interruptedCopy,{recursive:true});
  await writeFile(join(interruptedCopy,'previous-copy.partial'),'');
  for (const stage of ['restore', 'save-new', 'save-new-renamed', 'publish-old', 'publish-old-renamed']) await expect(run()).rejects.toThrow('interrupted ' + stage);
  // NTFS can retain the last new-only live entry after the old database rename is durable.
  await cp(join(roots.inputRoot,'sample1-edited.docx'),join(root,newKey));
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
  expect(await members(oldExport)).toEqual(original);
  expect(existsSync(join(root,newKey))).toBe(false);
  const firstSaved = (await readdir(join(root,'shell'))).find(name => name.startsWith('store-after-0.8.0-'))!;
  expect((await fileDigest(join(root,'shell',firstSaved,'payloads',newKey)))?.sha256).toBe(newObject);
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
  await expect(resumeUpgrade(root,'0.8.0',stage => { if(stage === 'publish') throw Error('power loss'); })).rejects.toThrow('power loss');
  const phase = join(root,'shell','storage-upgrade.json');
  const journal = JSON.parse(await readFile(phase,'utf8'));
  await writeFile(phase,JSON.stringify({...journal,stage:'record'}));
  await resumeUpgrade(root, '0.8.0');
  const upgraded = await EditorialStore.open(root,roots.codeRoot);
  try { await upgraded.stageSelectedManuscript(randomUUID(),join(roots.inputRoot,'sample1-edited.docx')); }
  finally { upgraded.markCleanShutdown(); upgraded.close(); }
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
  await expect(resumeUpgrade(root,'0.8.0',stage => { if(stage === 'save-new') throw Error('power loss'); })).rejects.toThrow('power loss');
  const kept = (await readdir(root)).find(name => name.startsWith('store-before-0.8.0-'))!;
  const away = join(roots.inputRoot,'old-library-away');
  await rename(join(root,kept),away);
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toBeDefined();
  expect(existsSync(phase)).toBe(false);
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
  await rename(away,join(root,kept));
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.8.0',stage => { if(stage === 'publish-old') throw Error('power loss'); })).rejects.toThrow('power loss');
  expect(existsSync(join(root,'store'))).toBe(false);
  await rename(join(root,kept),away);
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toBeDefined();
  expect(existsSync(phase)).toBe(false);
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
  expect((await fileDigest(join(root,newKey)))?.sha256).toBe(newObject);
  await rename(away,join(root,kept));
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root, '0.8.0')).toMatchObject({ restored: true });
  const saved = (await readdir(join(root,'shell'))).filter(name => name.startsWith('store-after-0.8.0-'));
  expect(saved).toHaveLength(2);
  expect((await fileDigest(join(root,'shell',saved.find(name => name !== firstSaved)!,'payloads',newKey)))?.sha256).toBe(newObject);
  const direct = await legacy.openLegacy(root);
  const directPackage = join(roots.inputRoot,'direct-rollback.ai7db');
  try {
    const prep = await direct.prepareDatabaseExport(directPackage,true);
    await direct.approveDatabaseExport(prep.preparationId,true);
  } finally { direct.markCleanShutdown(); direct.close(); }
  expect(await members(directPackage)).toEqual(original);
}, 180_000);

it('accepts only the unlink order authorized by an abandoned old import', async () => {
  const root = join(roots.inputRoot, 'abandoned');
  await cp(roots.dataRoot, root, { recursive: true });
  const store = join(root, 'store', 'ai7.sqlite');
  const db = new DatabaseSync(store);
  const now = new Date().toISOString();
  const original = Buffer.from(String(db.prepare("SELECT text FROM working_blocks WHERE length(text)>0 LIMIT 1").get()!.text));
  const selected = join(roots.inputRoot,'sample1.txt');
  await writeFile(selected,original);
  const old = await legacy.openLegacy(root);
  let draft: string;
  try { draft = (await old.stageSelectedManuscript(randomUUID(),selected)).draftId; }
  finally { old.markCleanShutdown(); old.close(); }
  const held = db.prepare(`SELECT d.object_digest, o.relative_key, w.object_digest working_digest, w.relative_key working_key
    FROM import_drafts d JOIN content_objects o ON o.object_digest=d.object_digest JOIN content_objects w ON w.object_digest=d.working_object_digest
    WHERE d.draft_id=?`).get(draft)!;
  const source = { digest:String(held.object_digest), key:String(held.relative_key), bytes:original };
  const docx = { digest:String(held.working_digest), key:String(held.working_key) };
  try {
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
    const partial = join(roots.inputRoot,'partly-abandoned');
    await cp(root,partial,{recursive:true});
    await beginUpgrade(partial);
    expect(await resumeUpgrade(partial,'0.8.0')).toMatchObject({restored:false});
    const recovered = await EditorialStore.open(partial,roots.codeRoot);
    try { expect(recovered.listBooks(null).items).toHaveLength(2); }
    finally { recovered.markCleanShutdown(); recovered.close(); }
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
  try {
    expect(opened.listBooks(null).items).toHaveLength(2);
    await opened.stageSelectedManuscript(randomUUID(),selected);
  }
  finally { opened.markCleanShutdown(); opened.close(); }
  expect((await fileDigest(join(root,'objects',source.key)))?.sha256).toBe(source.digest);
  await rm(backupLocationFor(root),{recursive:true});
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root,'0.8.0')).toMatchObject({restored:true});
  const saved = (await readdir(join(root,'shell'))).find(name => name.startsWith('store-after-0.8.0-'))!;
  expect((await fileDigest(join(root,'shell',saved,'payloads','objects',source.key)))?.sha256).toBe(source.digest);
  expect(existsSync(join(root,'objects',source.key))).toBe(false);
}, 180_000);

it.each(['save-old','publish','record'] as const)('catches lost payloads at %s and preserves the old library and verified backup', async stage => {
  const root = join(roots.inputRoot,'lost-payload-'+stage);
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  await expect(resumeUpgrade(root,'0.8.0',phase => { if(phase === stage) throw Error('power loss'); })).rejects.toThrow('power loss');
  const missing = (await databasePackageSources(root)).find(member => member.member.startsWith('objects/'))!;
  await rm(missing.path);
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(116);
  expect(existsSync(join(root,'shell','storage-upgrade.json'))).toBe(false);
  const location = backupLocationFor(root);
  const archive = (await readdir(location)).find(name => name.endsWith('.ai7db'))!;
  const {manifest} = await verifyDatabasePackage(join(location,archive),{dataRoot:root});
  expect(manifest.members.some(member => member.path === missing.member)).toBe(true);
},180_000);
