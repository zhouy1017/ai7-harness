import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createUpgradeSample1, historicalUpgradeService, legacySampleService, upgradeWithEarlierOrigin } from '../support/upgrade-sample1.js';
import { reimportVersion } from '../support/reimport-version.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { readDataVersionMarker, storeRevisionOnDisk } from '../../src/service/data-version.js';
import { beginUpgrade, beginUpgradeRollback, resumeUpgrade, rollbackDataPeak, upgradePreflight, upgradeSpaceShortfall } from '../../src/service/in-app-upgrade.js';
import { extractReplacement, replacementStagingFor } from '../../src/service/database-replacement.js';
import * as replacement from '../../src/service/database-replacement.js';
import { EditorialStore } from '../../src/service/store.js';
import { backupLocationFor } from '../../src/service/scheduled-backups.js';
import { databasePackageSources, verifyCopiedPayloads, type DatabasePackageMember } from '../../src/service/database-exports.js';
import * as packageWriter from '../../src/service/database-exports.js';
import { fileDigest } from '../../src/service/manuscript-export.js';
import { inventoryStore } from '../../src/service/store-inventory.js';
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

async function verifyLibraryFiles(root: string, revision: number): Promise<void> {
  const files = await Promise.all((await databasePackageSources(root)).map(async file => ({
    path:file.member,...(await fileDigest(file.path))!
  })));
  await verifyCopiedPayloads(join(root,'store','ai7.sqlite'),files,revision);
}

interface TestInventory {upgradeId:string;rollbackAttempt:string;sha256:string;members:DatabasePackageMember[]}

function withMembers(record: TestInventory,members: DatabasePackageMember[]): string {
  return JSON.stringify({...record,sha256:createHash('sha256').update(JSON.stringify(members)).digest('hex'),members});
}

it('keeps the original version in retained store names after resuming with a newer build', async () => {
  const root = join(roots.inputRoot, 'version-label');
  await cp(roots.dataRoot, root, { recursive: true });
  await beginUpgrade(root);
  await expect(resumeUpgrade(root, '0.7.10', (stage, renamed) => {
    if (stage === 'save-old' && renamed) throw Error('interrupted');
  })).rejects.toThrow('interrupted');
  expect((await readdir(root)).filter(name => name.startsWith('store-before-')))
    .toEqual([expect.stringMatching(/^store-before-0\.7\.10-/u)]);
  expect(await resumeUpgrade(root, '0.7.11')).toMatchObject({ restored: false });
  expect((await databasePackageSources(root)).some(file => file.member.startsWith('store-before-'))).toBe(false);
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root, '0.7.11', (stage, renamed) => {
    if (stage === 'save-new' && renamed) throw Error('interrupted');
  })).rejects.toThrow('interrupted');
  expect(await resumeUpgrade(root, '0.7.11')).toMatchObject({ restored: true });
  expect((await readdir(join(root, 'shell'))).filter(name => name.startsWith('store-after-')))
    .toEqual([expect.stringMatching(/^store-after-0\.7\.10-/u)]);
}, 90_000);

it('resumes each phase, imports the older package and recovers missing old files from its backup', async () => {
  const root = join(roots.inputRoot, 'library');
  await cp(roots.dataRoot, root, { recursive: true });
  await expect(upgradePreflight(root, 0)).rejects.toMatchObject({ code: 'UPGRADE_SPACE' });
  const { tables } = JSON.parse(inventoryStore(join(root, 'store', 'ai7.sqlite')));
  await expect(upgradePreflight(root)).resolves.toEqual({
    books: tables.books, manuscripts: tables.manuscripts, marks: tables.editorial_marks,
    reports: tables.review_reports, materials: tables.library_materials,
  });
  expect(existsSync(join(root, 'store.upgrading'))).toBe(false);
  await beginUpgrade(root);
  const stopped = new Set<string>();
  const run = () => resumeUpgrade(root, '0.7.9', (stage, renamed) => {
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
    expect(converted.getModelRoles().map(role => [role.roleId, role.binding?.modelId, role.source])).toEqual([
      ['foreground-pro', 'glm-5.3-flash', 'pro-tier'],
      ['foreground-flash', 'glm-5.3-flash', 'flash-tier'],
      ['underlying-pro', 'glm-5.3-flash', 'pro-tier'],
      ['underlying-flash', 'deepseek-v4.1-flash', 'channel-recommended-flash'],
    ]);
    expect(converted.inspectDataVersion().upgrades[0]?.fromDataVersion).toBe(1);
  } finally { converted.markCleanShutdown(); converted.close(); }
  const db = new DatabaseSync(join(root, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    expect(db.prepare('SELECT role_id, model_id FROM model_role_choices ORDER BY role_id').all()).toEqual([
      { role_id: 'foreground-flash', model_id: 'glm-5.3-flash' },
      { role_id: 'foreground-pro', model_id: 'glm-5.3-flash' },
    ]);
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
  const incomplete = join(roots.inputRoot,'incomplete-current');
  await cp(root,incomplete,{recursive:true});
  await rm(join(incomplete,newKey));
  await beginUpgradeRollback(incomplete);
  await expect(resumeUpgrade(incomplete,'0.7.9')).rejects.toMatchObject({code:'DATABASE_PACKAGE_INCOMPLETE'});
  expect(storeRevisionOnDisk(join(incomplete,'store','ai7.sqlite'))).toBe(117);
  expect(existsSync(join(incomplete,'shell','storage-upgrade.json'))).toBe(true);
  await cp(join(roots.inputRoot,'sample1-edited.docx'),join(incomplete,newKey));
  expect(await resumeUpgrade(incomplete,'0.7.9')).toMatchObject({restored:true});
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
  const firstSaved = (await readdir(join(root,'shell'))).find(name => name.startsWith('store-after-0.7.9-'))!;
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
  await expect(resumeUpgrade(root,'0.7.9',stage => { if(stage === 'publish') throw Error('power loss'); })).rejects.toThrow('power loss');
  const phase = join(root,'shell','storage-upgrade.json');
  const journal = JSON.parse(await readFile(phase,'utf8'));
  await writeFile(phase,JSON.stringify({...journal,stage:'record'}));
  await resumeUpgrade(root, '0.7.9');
  const upgraded = await EditorialStore.open(root,roots.codeRoot);
  try { await upgraded.stageSelectedManuscript(randomUUID(),join(roots.inputRoot,'sample1-edited.docx')); }
  finally { upgraded.markCleanShutdown(); upgraded.close(); }
  const lost = join(roots.inputRoot,'lost-sources');
  await cp(root,lost,{recursive:true});
  for (const entry of await readdir(lost)) if (entry.startsWith('store-before-0.7.9-')) {
    await rm(join(lost,entry),{recursive:true});
  }
  await expect(beginUpgradeRollback(lost)).rejects.toMatchObject({code:'UPGRADE_BACKUP_FAILED'});
  expect(existsSync(join(lost,'shell','storage-upgrade.json'))).toBe(false);
  const healthy = await EditorialStore.open(lost,roots.codeRoot);
  try { expect(healthy.listBooks(null).items).toHaveLength(2); }
  finally { healthy.markCleanShutdown(); healthy.close(); }
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.7.9',stage => { if(stage === 'save-new') throw Error('power loss'); })).rejects.toThrow('power loss');
  const kept = (await readdir(root)).find(name => name.startsWith('store-before-0.7.9-'))!;
  const away = join(roots.inputRoot,'old-library-away');
  // The post-upgrade snapshot already exists, but the current database has not moved.
  await rm(join(root,newKey));
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
  expect((await fileDigest(join(root,newKey)))?.sha256).toBe(newObject);
  expect(existsSync(phase)).toBe(false);
  // This retry must use the previous snapshot to recover an object created only in revision 117.
  await rm(join(root,newKey));
  const shared = original.find(member => member.path.startsWith('objects/'))!;
  await rm(join(root,shared.path));
  const offline = join(roots.inputRoot,'offline-backups');
  await rename(backupFolder,offline);
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.7.9',stage => { if(stage === 'save-new') throw Error('power loss'); })).rejects.toThrow('power loss');
  expect(JSON.parse(await readFile(phase,'utf8')).fallback).toBe(false);
  expect((await fileDigest(join(root,shared.path)))?.sha256).toBe(shared.sha256);
  await rename(offline,backupFolder);
  expect((await fileDigest(join(root,newKey)))?.sha256).toBe(newObject);
  await verifyLibraryFiles(root,117);
  // A damaged snapshot must not prevent opening the intact, independently verifiable live library.
  await writeFile(join(root,'store','payloads',newKey),Buffer.alloc(0));
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
  expect(existsSync(phase)).toBe(false);
  await verifyLibraryFiles(root,117);
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.7.9',stage => { if(stage === 'save-new') throw Error('power loss'); })).rejects.toThrow('power loss');
  await rename(join(root,kept),away);
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
  expect(existsSync(phase)).toBe(false);
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
  expect((await fileDigest(join(root,newKey)))?.sha256).toBe(newObject);
  const recoveredCurrent = await EditorialStore.open(root,roots.codeRoot);
  try { expect(recoveredCurrent.listBooks(null).items).toHaveLength(2); }
  finally { recoveredCurrent.markCleanShutdown(); recoveredCurrent.close(); }
  await rename(away,join(root,kept));
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.7.9',stage => { if(stage === 'publish-old') throw Error('power loss'); })).rejects.toThrow('power loss');
  expect(existsSync(join(root,'store'))).toBe(false);
  await rename(join(root,kept),away);
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
  expect(existsSync(phase)).toBe(false);
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
  expect((await fileDigest(join(root,newKey)))?.sha256).toBe(newObject);
  await rename(away,join(root,kept));
  await beginUpgradeRollback(root);
  const staleRestore = await readFile(phase);
  await expect(resumeUpgrade(root,'0.7.9',stage => { if(stage === 'publish-old') throw Error('power loss'); })).rejects.toThrow('power loss');
  const {id} = JSON.parse(staleRestore.toString('utf8'));
  const moved = join(root,'shell','store-after-0.7.9-'+id);
  const note = join(root,'shell','upgrade-'+id);
  await rm(join(moved,'rollback-ready.json'));
  await rm(join(note,'rollback-ready.json'));
  await rename(join(note,'current-database'),join(note,'prepared-database'));
  await rm(join(note,'current-files.json'));
  await writeFile(join(note,'prepared-database','files.json'),'[]');
  await rm(join(moved,'ai7.sqlite'));
  await writeFile(join(moved,'payloads',newKey),Buffer.alloc(0));
  await writeFile(phase,staleRestore);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:false});
  await verifyLibraryFiles(root,117);
  const reopenedCurrent = await EditorialStore.open(root,roots.codeRoot);
  try { expect(reopenedCurrent.listBooks(null).items).toHaveLength(2); }
  finally { reopenedCurrent.markCleanShutdown(); reopenedCurrent.close(); }
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root, '0.7.9')).toMatchObject({ restored: true });
  const saved = (await readdir(join(root,'shell'))).filter(name => name.startsWith('store-after-0.7.9-'));
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
    expect(await resumeUpgrade(partial,'0.7.9')).toMatchObject({restored:false});
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
  expect(await resumeUpgrade(root, '0.7.9')).toMatchObject({ restored: false });
  const opened = await EditorialStore.open(root, roots.codeRoot);
  try {
    expect(opened.listBooks(null).items).toHaveLength(2);
    await opened.stageSelectedManuscript(randomUUID(),selected);
  }
  finally { opened.markCleanShutdown(); opened.close(); }
  expect((await fileDigest(join(root,'objects',source.key)))?.sha256).toBe(source.digest);
  await rm(backupLocationFor(root),{recursive:true});
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  const saved = (await readdir(join(root,'shell'))).find(name => name.startsWith('store-after-0.7.9-'))!;
  expect((await fileDigest(join(root,'shell',saved,'payloads','objects',source.key)))?.sha256).toBe(source.digest);
  expect(existsSync(join(root,'objects',source.key))).toBe(false);
}, 180_000);

it.each(['convert','verify','save-old','publish','record'] as const)('catches missing or damaged payloads at %s and restores a usable old library', async stage => {
  const root = join(roots.inputRoot,'lost-payload-'+stage);
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  await expect(resumeUpgrade(root,'0.7.9',phase => { if(phase === stage) throw Error('power loss'); })).rejects.toThrow('power loss');
  const journal = JSON.parse(await readFile(join(root,'shell','storage-upgrade.json'),'utf8'));
  const note = join(root,'shell','upgrade-'+journal.id);
  if (stage === 'convert' || stage === 'publish') await rm(join(note,'payloads.json'));
  const copies = join(note,'copies');
  await mkdir(copies,{recursive:true});
  await writeFile(join(copies,'next-file.partial'),Buffer.alloc(16));
  const missing = (await databasePackageSources(root)).find(member => member.member.startsWith('objects/'))!;
  if (stage === 'verify' || stage === 'record') await writeFile(missing.path,Buffer.alloc(0));
  else await rm(missing.path);
  const firstError = stage === 'convert' || stage === 'verify' ? 'DATABASE_PACKAGE_INCOMPLETE' : 'UPGRADE_FILES_INVALID';
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:firstError});
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(116);
  expect(existsSync(join(root,'shell','storage-upgrade.json'))).toBe(false);
  const location = backupLocationFor(root);
  const archive = (await readdir(location)).find(name => name.endsWith('.ai7db'))!;
  const {manifest} = await verifyDatabasePackage(join(location,archive),{dataRoot:root});
  const repaired = await fileDigest(missing.path);
  expect(repaired?.sha256).toBe(manifest.members.find(member => member.path === missing.member)!.sha256);
  const old = await legacy.openLegacy(root);
  try { expect(old.listBooks(null).items).toHaveLength(2); } finally { old.markCleanShutdown(); old.close(); }
  expect((await databasePackageSources(root)).some(file => file.member.endsWith('.partial'))).toBe(false);
},180_000);

it.each(['database','marker'] as const)('refuses an altered revision 117 %s before final publication',async defect => {
  const root = join(roots.inputRoot,'altered-conversion-'+defect);
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  await expect(resumeUpgrade(root,'0.7.9',phase => { if (phase === 'record') throw Error('interrupted'); })).rejects.toThrow('interrupted');
  if (defect === 'database') {
    const db = new DatabaseSync(join(root,'store','ai7.sqlite'));
    try { db.exec('CREATE TABLE unexpected_change(id INTEGER)'); } finally { db.close(); }
  } else {
    const marker = join(root,'store','ai7-data-version.json');
    await writeFile(marker,JSON.stringify({...JSON.parse(await readFile(marker,'utf8')),dataVersion:1}));
  }
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(116);
});

it('rebuilds the original manifest from the backup across both sides of the old directory rename',async () => {
  const root = join(roots.inputRoot,'recover-original-manifest');
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  const phase = join(root,'shell','storage-upgrade.json');
  const stop = (at: string) => resumeUpgrade(root,'0.7.9',stage => { if (stage === at) throw Error('interrupted'); });
  const beforeBackup = await readFile(phase);
  const operationId = JSON.parse(beforeBackup.toString('utf8')).id;
  const location = backupLocationFor(root);
  const attempt = join(location,'.upgrade-'+operationId);
  await mkdir(attempt,{recursive:true});
  await writeFile(join(attempt,'package.ai7db.partial.store'),Buffer.alloc(1024));
  await writeFile(join(attempt,'package.ai7db.partial'),Buffer.alloc(1024));
  const otherBackup = join(location,'unrelated.ai7db');
  await writeFile(otherBackup,Buffer.alloc(64));
  await expect(stop('convert')).rejects.toThrow('interrupted');
  const stale = JSON.parse(await readFile(phase,'utf8'));
  expect(existsSync(attempt)).toBe(false);
  const archive = join(location,stale.backup.backup.fileName);
  const archiveDigest = await fileDigest(archive);
  await mkdir(join(attempt,'store'),{recursive:true});
  await rename(join(root,'shell','upgrade-'+operationId,'store','upgrade-pending.json'),join(attempt,'store','upgrade-pending.json'));
  await rename(archive,join(attempt,'package.ai7db.partial'));
  await writeFile(phase,beforeBackup);
  const abandonedConversion = join(root,'shell','upgrade-'+operationId,'converted');
  await mkdir(abandonedConversion,{recursive:true});
  await writeFile(join(abandonedConversion,'unfinished-copy'),Buffer.alloc(4096));
  await expect(resumeUpgrade(root,'0.7.9',undefined,0)).rejects.toMatchObject({code:'UPGRADE_SPACE'});
  expect(existsSync(abandonedConversion)).toBe(false);
  expect(JSON.parse(await readFile(phase,'utf8')).stage).toBe('backup');
  expect(await fileDigest(archive)).toEqual(archiveDigest);
  await expect(stop('convert')).rejects.toThrow('interrupted');
  expect(await fileDigest(archive)).toEqual(archiveDigest);
  expect((await fileDigest(otherBackup))?.bytes).toBe(64);
  expect(existsSync(attempt)).toBe(false);
  const manifest = join(root,'shell','upgrade-'+stale.id,'payloads.json');
  const original = await fileDigest(manifest);
  const ownScratch = join(root,'shell','upgrade-'+stale.id,'archive-verification','export-staging');
  const unrelated = join(root,'export-staging','other-export.tmp');
  await mkdir(ownScratch,{recursive:true});
  await mkdir(join(root,'export-staging'),{recursive:true});
  await writeFile(join(ownScratch,'interrupted.store'),Buffer.alloc(16));
  await writeFile(unrelated,Buffer.alloc(16));
  await rm(manifest);
  await expect(stop('publish')).rejects.toThrow('interrupted');
  expect(await fileDigest(manifest)).toEqual(original);
  expect(existsSync(ownScratch)).toBe(false);
  expect(existsSync(unrelated)).toBe(true);
  expect(existsSync(join(root,'store'))).toBe(false);
  await rm(manifest);
  await writeFile(phase,JSON.stringify(stale));
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:false});
  expect(await fileDigest(manifest)).toEqual(original);
  const verified = await EditorialStore.open(root,roots.codeRoot);
  try { expect(verified.listBooks(null).items).toHaveLength(2); } finally { verified.markCleanShutdown(); verified.close(); }
},180_000);

it.runIf(process.platform === 'win32')('recovers from a locked fallback directory and a subsequently damaged published old store',async () => {
  const root = join(roots.inputRoot,'locked-fallback');
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  await resumeUpgrade(root,'0.7.9');
  const phase = join(root,'shell','storage-upgrade.json');
  const location = backupLocationFor(root);
  const originalPackage = join(location,(await readdir(location)).find(name => name.endsWith('.ai7db'))!);
  const originalMembers = (await verifyDatabasePackage(originalPackage,{dataRoot:root})).manifest.members;
  const kept = (await readdir(root)).find(name => name.startsWith('store-before-0.7.9-'))!;
  const away = join(roots.inputRoot,'locked-fallback-original');
  await rename(join(root,kept),away);
  const missing = (await databasePackageSources(root)).find(member => member.member.startsWith('objects/'))!;
  const digest = await fileDigest(missing.path);
  await rm(missing.path);
  await beginUpgradeRollback(root);
  const start = JSON.parse(await readFile(phase,'utf8'));
  const retryArea = join(root,'shell','upgrade-'+start.id,'restore');
  const priorExtraction = replacementStagingFor(retryArea);
  await mkdir(priorExtraction,{recursive:true});
  await writeFile(join(priorExtraction,'interrupted.partial'),Buffer.alloc(4096));
  await rm(join(root,'shell','upgrade-'+start.id,'payloads.json'));
  const stop = (point: string, after = false) => resumeUpgrade(root,'0.7.9',(stage,renamed) => {
    if (stage === point && Boolean(renamed) === after) throw Error('interrupted');
  });
  await expect(stop('publish-old')).rejects.toThrow('interrupted');
  expect(existsSync(join(priorExtraction,'interrupted.partial'))).toBe(false);
  const {id} = JSON.parse(await readFile(phase,'utf8'));
  await rm(join(root,'shell','upgrade-'+id,'current-files.json'));
  // The store rename survived while the journal's restore -> save-new -> publish-old updates did not.
  await writeFile(phase,JSON.stringify(start));
  const incoming = join(replacementStagingFor(join(root,'shell','upgrade-'+id,'restore')),'incoming','store');
  // A Windows process holds its working directory against rename until it exits.
  const lock = spawn(process.execPath,['-e',"process.stdout.write('ready');process.stdin.resume()"],{cwd:incoming,windowsHide:true,stdio:['pipe','pipe','ignore']});
  try {
    await once(lock.stdout,'data');
    await expect(resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
    expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
    expect(await fileDigest(missing.path)).toEqual(digest);
    expect(existsSync(phase)).toBe(false);
    expect(existsSync(join(root,'store.upgrading'))).toBe(false);
  } finally {
    const ended = once(lock,'exit');
    lock.stdin.end();
    await ended;
  }
  await rename(away,join(root,kept));
  await beginUpgradeRollback(root);
  await expect(stop('publish-old',true)).rejects.toThrow('interrupted');
  await rm(join(root,'store','ai7.sqlite'));
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
  const healthy = await EditorialStore.open(root,roots.codeRoot);
  try { expect(healthy.listBooks(null).items).toHaveLength(2); } finally { healthy.markCleanShutdown(); healthy.close(); }
  await beginUpgradeRollback(root);
  await expect(stop('publish-old',true)).rejects.toThrow('interrupted');
  const savedJournal = await readFile(phase);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  // Simulate a stale journal deletion after temporary extraction files disappeared.
  await writeFile(phase,savedJournal);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  await writeFile(phase,savedJournal);
  await writeFile(missing.path,Buffer.alloc(0));
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
  expect(await fileDigest(missing.path)).toEqual(digest);
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  const openPrevious = await legacySampleService(root,roots.codeRoot,'da44971a048719e18cbaa7f59436f3ea477d8309');
  const previous = await openPrevious(root);
  const archive = join(roots.inputRoot,'rollback-integration-074.ai7db');
  try {
    const prep = await previous.prepareDatabaseExport(archive,true);
    await previous.approveDatabaseExport(prep.preparationId,true);
  } finally { previous.markCleanShutdown(); previous.close(); }
  const members = (await verifyDatabasePackage(archive,{dataRoot:root})).manifest.members;
  expect(members.map(member => member.path)).toEqual(originalMembers.map(member => member.path));
  expect(members.filter(member => member.path !== 'store/ai7.sqlite')).toEqual(originalMembers.filter(member => member.path !== 'store/ai7.sqlite'));
  await beginUpgrade(root);
  await expect(stop('publish')).rejects.toThrow('interrupted');
  const forward = JSON.parse(await readFile(phase,'utf8'));
  const candidate = join(root,'shell','upgrade-'+forward.id,'converted');
  const forwardLock = spawn(process.execPath,['-e',"process.stdout.write('ready');process.stdin.resume()"],{cwd:candidate,windowsHide:true,stdio:['pipe','pipe','ignore']});
  try {
    await once(forwardLock.stdout,'data');
    await expect(resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
    expect(existsSync(phase)).toBe(false);
    expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(116);
    const old = await openPrevious(root);
    const lockedExport = join(roots.inputRoot,'locked-forward.ai7db');
    try {
      const prep = await old.prepareDatabaseExport(lockedExport,true);
      await old.approveDatabaseExport(prep.preparationId,true);
    } finally { old.markCleanShutdown(); old.close(); }
    const verified = (await verifyDatabasePackage(lockedExport,{dataRoot:root})).manifest.members;
    expect(verified.map(member => member.path)).toEqual(originalMembers.map(member => member.path));
    expect(verified.filter(member => member.path !== 'store/ai7.sqlite')).toEqual(originalMembers.filter(member => member.path !== 'store/ai7.sqlite'));
  } finally {
    const ended = once(forwardLock,'exit');
    forwardLock.stdin.end();
    await ended;
  }
  await beginUpgrade(root);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:false});
},180_000);

it('reserves the peak on the writing volume during backup fallback',() => {
  expect(upgradeSpaceShortfall(400,900,500,1300,1300,true)).toBe(900);
  expect(upgradeSpaceShortfall(400,900,500,1300,1300,false)).toBe(0);
  expect(upgradeSpaceShortfall(400,900,500,1300,1100,false)).toBe(200);
  expect(upgradeSpaceShortfall(400,900,500,1100,1300,false)).toBe(200);
  expect(rollbackDataPeak(100,{archive:900,store:400,files:300})-rollbackDataPeak(0)).toBe(2000);
  expect(rollbackDataPeak(2000,{archive:50,store:100,files:300})-rollbackDataPeak(0)).toBe(3000);
});

it.each(['removed','changed'] as const)('retains an openable revision 117 library when its saved SQLite is %s',async defect => {
  const root = join(roots.inputRoot,'retained-sqlite-'+defect);
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  await resumeUpgrade(root,'0.7.9');
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.7.9',stage => { if (stage === 'publish-old') throw Error('interrupted'); })).rejects.toThrow('interrupted');
  const {id} = JSON.parse(await readFile(join(root,'shell','storage-upgrade.json'),'utf8'));
  const saved = join(root,'shell','store-after-0.7.9-'+id);
  const path = join(saved,'ai7.sqlite');
  const expected = await fileDigest(path);
  const note = join(root,'shell','upgrade-'+id);
  const external = (await databasePackageSources(root)).find(file => file.member.startsWith('objects/'))!;
  await writeFile(join(saved,'payloads',external.member),Buffer.alloc(0));
  await rm(join(note,'current-files.json'));
  await writeFile(join(note,'current-database','files.json'),'[]');
  if (defect === 'removed') await rm(path);
  else {
    const altered = new DatabaseSync(path);
    try { altered.exec('CREATE TABLE unexpected_change(id INTEGER)'); } finally { altered.close(); }
  }
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  expect(await fileDigest(path)).toEqual(expected);
  await verifyLibraryFiles(root,116);
  const old = await legacy.openLegacy(root);
  try { expect(old.listBooks(null).items).toHaveLength(2); } finally { old.markCleanShutdown(); old.close(); }
  const recovered = join(roots.inputRoot,'open-retained-'+defect);
  await cp(join(saved,'payloads'),recovered,{recursive:true});
  await cp(saved,join(recovered,'store'),{recursive:true,filter:entry => entry !== join(saved,'payloads')});
  await verifyLibraryFiles(recovered,117);
  const current = await EditorialStore.open(recovered,roots.codeRoot);
  try { expect(current.listBooks(null).items).toHaveLength(2); } finally { current.markCleanShutdown(); current.close(); }
},180_000);

it('recovers files across the rename and preserves both a WAL-only committed draft and the reusable original',async () => {
  const seed = join(roots.inputRoot,'wal-seed');
  const root = join(roots.inputRoot,'wal-library');
  await cp(roots.dataRoot,seed,{recursive:true});
  const deleted = 'removed-after-upgrade.bin';
  const changed = 'changed-after-upgrade.bin';
  const unchanged = 'unchanged-after-upgrade.bin';
  const oldBytes = Buffer.from([1,116]);
  const newBytes = Buffer.from([2,117,8]);
  await writeFile(join(seed,deleted),oldBytes);
  await writeFile(join(seed,changed),oldBytes);
  await writeFile(join(seed,unchanged),oldBytes);
  await beginUpgrade(seed);
  await resumeUpgrade(seed,'0.7.9');
  await rm(join(seed,deleted));
  await writeFile(join(seed,changed),newBytes);
  const unreferenced = 'wal-library-extra.bin';
  await writeFile(join(seed,unreferenced),Buffer.from([2,117]));
  const extraDigest = await fileDigest(join(seed,unreferenced));
  const sample = join(roots.inputRoot,'sample1-wal.docx');
  await composeManuscriptDocx(sample,{source:ADMITTED_BASELINE_DOCX,startBlock:2,blocks:13,title:'sample1'});
  const digest = (await fileDigest(sample))!.sha256;
  const key = join('objects','sha256',digest.slice(0,2),digest+'.docx');
  const app = await EditorialStore.open(seed,roots.codeRoot);
  const reader = new DatabaseSync(join(seed,'store','ai7.sqlite'),{readOnly:true});
  let draftId: string;
  try {
    reader.exec('BEGIN');
    reader.prepare('SELECT count(*) FROM import_drafts').get();
    draftId = (await app.stageSelectedManuscript(randomUUID(),sample)).draftId;
    // Keep the reader's old snapshot while copying the committed WAL, exactly as on a stopped writer.
    await cp(seed,root,{recursive:true,filter:entry => !entry.endsWith('ai7.sqlite-shm')});
  } finally { reader.close(); app.markCleanShutdown(); app.close(); }
  const hasDraft = (path: string) => {
    const db = new DatabaseSync(path,{readOnly:true});
    try { return Boolean(db.prepare('SELECT 1 FROM import_drafts WHERE draft_id=?').get(draftId)); } finally { db.close(); }
  };
  const sql = join(root,'store','ai7.sqlite');
  const mainOnly = join(roots.inputRoot,'main-without-committed-wal.sqlite');
  await cp(sql,mainOnly);
  expect((await fileDigest(sql+'-wal'))!.bytes).toBeGreaterThan(32);
  expect(hasDraft(mainOnly)).toBe(false);
  expect(hasDraft(sql)).toBe(true);
  expect(existsSync(backupLocationFor(root))).toBe(false);
  const origin = JSON.parse(await readFile(join(root,'store','upgrade-origin.json'),'utf8'));
  const extractedFromSeed = join(root,'shell','upgrade-'+origin.id,'restore');
  await mkdir(extractedFromSeed,{recursive:true});
  await extractReplacement(extractedFromSeed,join(backupLocationFor(seed),origin.backup.backup.fileName),origin.backup.backup.sha256);
  await beginUpgradeRollback(root);
  const phase = join(root,'shell','storage-upgrade.json');
  const stale = await readFile(phase);
  const {id} = JSON.parse(stale.toString('utf8'));
  const saved = join(root,'shell','store-after-0.7.9-'+id);
  const pause = (after: boolean) => resumeUpgrade(root,'0.7.9',(stage,renamed) => {
    if (stage === 'publish-old' && Boolean(renamed) === after) throw Error('interrupted');
  });
  await expect(pause(false)).rejects.toThrow('interrupted');
  await writeFile(join(saved,'payloads',key),Buffer.alloc(0));
  await expect(pause(true)).rejects.toThrow('interrupted');
  expect((await fileDigest(join(saved,'payloads',key)))?.sha256).toBe(digest);
  await rm(join(saved,'rollback-ready.json'));
  await rm(join(root,'shell','upgrade-'+id,'rollback-ready.json'));
  const independent = join(root,'shell','upgrade-'+id,'current-database');
  const commitment = await readFile(join(independent,'rollback-ready.json'));
  await writeFile(join(independent,'rollback-ready.json'),'{');
  await writeFile(phase,stale);
  const parkedWal = join(saved,'ai7.sqlite-wal');
  const copyWal = join(independent,'ai7.sqlite-wal');
  await rename(parkedWal,parkedWal+'.held');
  await rename(copyWal,copyWal+'.held');
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  expect(await readFile(phase)).toEqual(stale);
  expect(storeRevisionOnDisk(sql)).toBe(116);
  await rename(parkedWal+'.held',parkedWal);
  await rename(copyWal+'.held',copyWal);
  const inventory: TestInventory = JSON.parse(await readFile(join(independent,'files.json'),'utf8'));
  const allFiles = inventory.members;
  const shortened = allFiles.filter(file => file.path !== unreferenced);
  expect(shortened.length).toBeGreaterThan(0);
  expect(shortened.length).toBe(allFiles.length-1);
  await writeFile(join(independent,'files.json'),withMembers(inventory,shortened));
  await writeFile(phase,stale);
  expect(await readFile(join(root,changed))).toEqual(oldBytes);
  expect(existsSync(join(root,deleted))).toBe(true);
  const savedPayload = join(saved,'payloads');
  const held = join(roots.inputRoot,'held-wal-object.docx');
  await rename(join(savedPayload,key),held);
  await writeFile(join(savedPayload,changed),oldBytes);
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
  expect(await readFile(phase)).toEqual(stale);
  expect(storeRevisionOnDisk(sql)).toBe(116);
  await rename(held,join(savedPayload,key));
  await writeFile(join(savedPayload,changed),newBytes);
  // 116 and 117 both exported this unreferenced file. Only the independent 117 inventory now proves that 117 kept it.
  await rm(join(savedPayload,unchanged));
  const remembered = join(root,'shell','upgrade-'+id,'current-files.json');
  const shortJson = withMembers(inventory,allFiles.filter(file => ![unchanged,changed,unreferenced].includes(file.path)));
  await writeFile(remembered,shortJson);
  const sealed = join(independent,'files.json');
  await writeFile(sealed,JSON.stringify(inventory));
  const read = replacement.readSmallFile;
  const unavailable = vi.spyOn(replacement,'readSmallFile').mockImplementation(async (path,maxBytes) => {
    if (path === sealed) throw Object.assign(Error('busy'),{code:'EBUSY'});
    return read(path,maxBytes);
  });
  try { await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'EBUSY'}); } finally { unavailable.mockRestore(); }
  expect(await readFile(phase)).toEqual(stale);
  expect(await readFile(remembered,'utf8')).toBe(shortJson);
  expect(await readFile(join(root,unchanged))).toEqual(oldBytes);
  expect(existsSync(join(savedPayload,unchanged))).toBe(false);
  expect(storeRevisionOnDisk(sql)).toBe(116);
  await rm(sealed);
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  expect(await readFile(phase)).toEqual(stale);
  expect(await readFile(remembered,'utf8')).toBe(shortJson);
  await writeFile(sealed,JSON.stringify(inventory));
  // This complete list and committed WAL jointly prove that 117 deliberately removed an old member.
  await expect(resumeUpgrade(root,'0.7.9',stage => { if (stage === 'return-new') throw Error('verified'); })).rejects.toThrow('verified');
  expect(JSON.parse(await readFile(phase,'utf8')).currentManifestDigest).toBe(JSON.parse(commitment.toString('utf8')).currentManifestDigest);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:false});
  await verifyLibraryFiles(root,117);
  expect(hasDraft(sql)).toBe(true);
  expect(await fileDigest(join(root,unreferenced))).toEqual(extraDigest);
  expect(existsSync(join(root,deleted))).toBe(false);
  expect(await readFile(join(root,changed))).toEqual(newBytes);
  const reopened = await EditorialStore.open(root,roots.codeRoot);
  const exported = join(roots.inputRoot,'recovered-wal.ai7db');
  try {
    expect(reopened.listBooks(null).items).toHaveLength(2);
    const prep = await reopened.prepareDatabaseExport(exported,true);
    await reopened.approveDatabaseExport(prep.preparationId,true);
  } finally { reopened.markCleanShutdown(); reopened.close(); }
  const pkg = await verifyDatabasePackage(exported,{dataRoot:root});
  expect(pkg.manifest.members.find(file => file.path === unreferenced)).toEqual({path:unreferenced,...extraDigest});
  expect(pkg.manifest.members.some(file => file.path === deleted)).toBe(false);
  expect(pkg.manifest.members.find(file => file.path === unchanged)?.sha256).toBe(createHash('sha256').update(oldBytes).digest('hex'));
  expect(pkg.manifest.members.find(file => file.path === changed)?.sha256).toBe(createHash('sha256').update(newBytes).digest('hex'));
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  await verifyLibraryFiles(root,116);
  expect(hasDraft(sql)).toBe(false);
  const old = await legacy.openLegacy(root);
  try { expect(old.listBooks(null).items).toHaveLength(2); } finally { old.markCleanShutdown(); old.close(); }
},180_000);

it('keeps the independent database when another valid 117 store or a conflicting startup marker is present',async () => {
  const root = join(roots.inputRoot,'identity');
  const other = join(roots.inputRoot,'another-upgrade');
  for (const dir of [root,other]) {
    await cp(roots.dataRoot,dir,{recursive:true});
    await beginUpgrade(dir);
    await resumeUpgrade(dir,'0.7.9');
  }
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.7.9',stage => { if(stage === 'save-new') throw Error('interrupted'); })).rejects.toThrow('interrupted');
  const phase = join(root,'shell','storage-upgrade.json');
  const state = JSON.parse(await readFile(phase,'utf8'));
  const retained = join(root,'store-before-0.7.9-'+state.id);
  const away = join(roots.inputRoot,'identity-original');
  await rename(retained,away);
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
  await rename(away,retained);
  const db = join(root,'store','ai7.sqlite');
  const spare = join(root,'shell','upgrade-'+state.id,'current-database','ai7.sqlite');
  const expected = await fileDigest(spare);
  const marker = join(root,'store','ai7-data-version.json');
  const validMarker = await readFile(marker);
  const current = join(roots.inputRoot,'original-identity.sqlite');
  await cp(db,current);
  await cp(join(other,'store','ai7.sqlite'),db);
  await expect(beginUpgradeRollback(root)).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  expect(existsSync(phase)).toBe(false);
  expect(await fileDigest(spare)).toEqual(expected);
  await cp(current,db);
  await writeFile(marker,JSON.stringify({...JSON.parse(validMarker.toString('utf8')),dataVersion:1}));
  await expect(beginUpgradeRollback(root)).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  expect(existsSync(phase)).toBe(false);
  expect(await fileDigest(spare)).toEqual(expected);
  await writeFile(marker,validMarker);
  const altered = new DatabaseSync(db);
  try { altered.exec('PRAGMA user_version=118'); } finally { altered.close(); }
  await expect(beginUpgradeRollback(root)).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  await cp(current,db);
  const origin = join(root,'store','upgrade-origin.json');
  const legacyOrigin = JSON.parse(await readFile(origin,'utf8'));
  delete legacyOrigin.upgradeRecordId;
  await writeFile(origin,JSON.stringify(legacyOrigin));
  await beginUpgradeRollback(root);
  expect(JSON.parse(await readFile(phase,'utf8')).upgradeRecordId).toBeTruthy();
  await cp(join(other,'store','ai7.sqlite'),db);
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  expect(existsSync(phase)).toBe(false);
  expect(await fileDigest(spare)).toEqual(expected);
  await cp(current,db);
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  await verifyLibraryFiles(root,116);
},180_000);

it('reclaims the interrupted backup attempt on a changed source while preserving other backups',async () => {
  const root = join(roots.inputRoot,'changed-source-backup');
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  const phase = join(root,'shell','storage-upgrade.json');
  const {id} = JSON.parse(await readFile(phase,'utf8'));
  const location = backupLocationFor(root);
  const area = join(location,'.upgrade-'+id);
  await mkdir(area,{recursive:true});
  await writeFile(join(area,'package.ai7db.partial.store'),Buffer.alloc(1024));
  const other = join(location,'unrelated-backup.ai7db');
  await writeFile(other,Buffer.alloc(64));
  const sample = join(roots.inputRoot,'changed-source.docx');
  await composeManuscriptDocx(sample,{source:ADMITTED_BASELINE_DOCX,startBlock:2,blocks:8,title:'sample1'});
  const old = await legacy.openLegacy(root);
  try { await old.stageSelectedManuscript(randomUUID(),sample); } finally { old.markCleanShutdown(); old.close(); }
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_SOURCE_CHANGED'});
  expect(existsSync(area)).toBe(false);
  expect(existsSync(phase)).toBe(false);
  expect((await fileDigest(other))?.bytes).toBe(64);
  await verifyLibraryFiles(root,116);
},180_000);

it.each(['416adb15a9dcf76b2f49e202775597645286c18e','19d26391cab7393251fea4b8dfeb9c3492569459'])('restores from the archive recorded by historical converter %s',async revision => {
  const root = join(roots.inputRoot,'earlier-upgrade-'+revision.slice(0,8));
  await cp(roots.dataRoot,root,{recursive:true});
  await upgradeWithEarlierOrigin(root,roots.codeRoot,revision,'0.7.9');
  const origin = JSON.parse(await readFile(join(root,'store','upgrade-origin.json'),'utf8'));
  expect(origin.backupStoreDigest).toBeUndefined();
  if (revision.startsWith('416adb15')) {
    expect(origin.backupStoreBytes).toBeUndefined();
    expect(origin.backupPayloadBytes).toBeUndefined();
    expect(origin.upgradeRecordId).toBeUndefined();
  } else {
    expect(origin.backupStoreBytes).toBeGreaterThan(0);
    expect(origin.backupPayloadBytes).toBeGreaterThan(0);
  }
  const archivePath = join(backupLocationFor(root),origin.backup.backup.fileName);
  const archive = await verifyDatabasePackage(archivePath,{dataRoot:root});
  const snapshot = archive.manifest.members.find(file => file.path === 'store/ai7.sqlite')!;
  expect(createHash('sha256').update(snapshot.sha256).digest('hex')).not.toBe(origin.sourceDigest);
  await rm(join(root,'store-before-0.7.9-'+origin.id),{recursive:true});
  await beginUpgradeRollback(root);
  if (revision.startsWith('19d26391')) {
    const marker = join(replacementStagingFor(join(root,'shell','upgrade-'+origin.id,'restore')),'incoming','store','ai7-data-version.json');
    const write = replacement.writeAtomic;
    const lock = vi.spyOn(replacement,'writeAtomic').mockImplementation(async (path,text) => {
      if (path === marker) throw Object.assign(Error('busy'),{code:'EBUSY'});
      await write(path,text);
    });
    try { await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'EBUSY'}); } finally { lock.mockRestore(); }
    expect(existsSync(join(root,'shell','storage-upgrade.json'))).toBe(false);
    await verifyLibraryFiles(root,117);
    await rm(archivePath);
    await beginUpgradeRollback(root);
  }
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  expect((await readDataVersionMarker(root))?.dataVersion).toBe(1);
  await verifyLibraryFiles(root,116);
  const old = await legacy.openLegacy(root);
  try { expect(old.listBooks(null).items).toHaveLength(2); } finally { old.markCleanShutdown(); old.close(); }
},180_000);

it.each(['write','read'] as const)('keeps the backup phase retryable after a native SQLite FULL during %s',async side => {
  const root = join(roots.inputRoot,'sqlite-full-'+side);
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  const db = new DatabaseSync(':memory:');
  let full: unknown;
  try {
    db.exec('PRAGMA page_size=512; PRAGMA max_page_count=2; CREATE TABLE capacity(bytes BLOB)');
    try { db.exec('INSERT INTO capacity VALUES(zeroblob(4096))'); } catch (error) { full = error; }
  } finally { db.close(); }
  expect(full).toMatchObject({errcode:13});
  const openStore = packageWriter.openPackageStore;
  let readFault = false;
  const fault = side === 'write' ? vi.spyOn(packageWriter,'writeDatabasePackage').mockRejectedValueOnce(full)
    : vi.spyOn(packageWriter,'openPackageStore').mockImplementation(path => {
      if (/\.[0-9a-f-]{36}\.ai7db\.store$/u.test(path)) { readFault = true; throw full; }
      return openStore(path);
    });
  try { await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_SPACE'}); }
  finally { fault.mockRestore(); }
  if (side === 'read') expect(readFault).toBe(true);
  expect(JSON.parse(await readFile(join(root,'shell','storage-upgrade.json'),'utf8')).stage).toBe('backup');
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:false});
  await verifyLibraryFiles(root,117);
},180_000);

it.each(['old-payloads','incoming','archive','unavailable','short-sealed','shared-read'] as const)('preserves the complete inventory with an unreferenced member across %s',async source => {
  const root = join(roots.inputRoot,'retained-inventory-'+source);
  await cp(roots.dataRoot,root,{recursive:true});
  const member = 'retained-entry.bin';
  const contents = Buffer.from([23,117,2]);
  await writeFile(join(root,member),contents);
  await beginUpgrade(root);
  await resumeUpgrade(root,'0.7.9');
  await writeFile(join(root,'new-entry.bin'),Buffer.from([8,0]));
  await beginUpgradeRollback(root);
  const phase = join(root,'shell','storage-upgrade.json');
  const stale = await readFile(phase);
  const {id,backup} = JSON.parse(stale.toString('utf8'));
  const note = join(root,'shell','upgrade-'+id);
  const parked = join(root,'shell','store-after-0.7.9-'+id);
  await expect(resumeUpgrade(root,'0.7.9',(stage,moved) => { if (stage === 'publish-old' && Boolean(moved) === (source === 'shared-read')) throw Error('interrupted'); })).rejects.toThrow('interrupted');
  await rm(join(parked,'rollback-ready.json'));
  await rm(join(note,'rollback-ready.json'));
  const manifest = join(note,'current-files.json');
  const complete: TestInventory = JSON.parse(await readFile(manifest,'utf8'));
  const shortened = withMembers(complete,complete.members.filter(file => file.path !== member));
  if (source === 'short-sealed') {
    await writeFile(join(note,'current-database','rollback-ready.json'),'{');
    await writeFile(join(note,'current-database','files.json'),shortened);
  } else await writeFile(manifest,shortened);
  if (source === 'shared-read') await rm(join(note,'current-database','rollback-ready.json'));
  if (source !== 'archive') await rm(join(backupLocationFor(root),backup.backup.fileName));
  if (source === 'old-payloads' || source === 'incoming') {
    const dir = source === 'incoming' ? join(replacementStagingFor(join(note,'restore')),'incoming') : join(note,source);
    await mkdir(dir,{recursive:true});
    await rename(join(root,member),join(dir,member));
  } else if (source !== 'short-sealed' && source !== 'shared-read') await rm(join(root,member));
  if (source !== 'short-sealed') await rm(join(parked,'payloads',member));
  await writeFile(phase,stale);
  if (source === 'shared-read') {
    const sealed = join(note,'current-database','files.json');
    const read = replacement.readSmallFile;
    const busy = vi.spyOn(replacement,'readSmallFile').mockImplementation(async (path,maxBytes) => {
      if (path === sealed) throw Object.assign(Error('busy'),{code:'EBUSY'});
      return read(path,maxBytes);
    });
    try { await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'EBUSY'}); } finally { busy.mockRestore(); }
    expect(await readFile(phase)).toEqual(stale);
    expect(await readFile(manifest,'utf8')).toBe(shortened);
    expect(await readFile(join(root,member))).toEqual(contents);
    expect(existsSync(join(parked,'payloads',member))).toBe(false);
  }
  if (source === 'unavailable') {
    await writeFile(join(note,'current-database','files.json'),shortened);
    const foreign = join(roots.inputRoot,'foreign117');
    await cp(roots.dataRoot,foreign,{recursive:true});
    await beginUpgrade(foreign);
    await resumeUpgrade(foreign,'0.7.9');
    const copies = [join(parked,'ai7.sqlite'),join(note,'current-database','ai7.sqlite')];
    for (const path of copies) {
      await rename(path,path+'.held');
      await cp(join(foreign,'store','ai7.sqlite'),path);
    }
    await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
    expect(await readFile(phase)).toEqual(stale);
    for (const path of copies) await rename(path+'.held',path);
    await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
    expect(await readFile(phase)).toEqual(stale);
    await writeFile(join(root,member),contents);
  }
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:false});
  expect(await readFile(join(root,member))).toEqual(contents);
  expect(await readFile(join(root,'new-entry.bin'))).toEqual(Buffer.from([8,0]));
  await verifyLibraryFiles(root,117);
  const opened = await EditorialStore.open(root,roots.codeRoot);
  try {
    expect(opened.listBooks(null).items).toHaveLength(2);
    if (source === 'shared-read') {
      const path = join(roots.inputRoot,'shared-read.ai7db');
      const prep = await opened.prepareDatabaseExport(path,true);
      await opened.approveDatabaseExport(prep.preparationId,true);
      const pkg = await verifyDatabasePackage(path,{dataRoot:root});
      expect(pkg.manifest.members.find(file => file.path === member)?.sha256).toBe(createHash('sha256').update(contents).digest('hex'));
    }
  } finally { opened.markCleanShutdown(); opened.close(); }
},180_000);

async function verifyRollbackExport(root: string,exported: string,expected: DatabasePackageMember[]): Promise<void> {
  await verifyLibraryFiles(root,117);
  const reopened = await EditorialStore.open(root,roots.codeRoot);
  try {
    expect(reopened.listBooks(null).items).toHaveLength(2);
    const prep = await reopened.prepareDatabaseExport(exported,true);
    await reopened.approveDatabaseExport(prep.preparationId,true);
  } finally { reopened.markCleanShutdown(); reopened.close(); }
  const pkg = await verifyDatabasePackage(exported,{dataRoot:root});
  const byPath = (files: DatabasePackageMember[]) => new Map(files.map(file => [file.path,file]));
  expect(byPath(pkg.manifest.members.filter(file => file.path !== 'store/ai7.sqlite'))).toEqual(byPath(expected));
}

it.each([['historical','removed','receipt'],['historical','added','receipt'],['current','removed','saved'],['current','added','saved'],
  ['current','removed','live'],['current','added','live']] as const)(
  'recovers the %s rollback when its identical SQLite is held by a previous attempt and a member was %s (%s)',async (format,change,source) => {
  // The real backup verifier appends its own scratch directories. Leave room under the default Windows path limit.
  const area = join(roots.inputRoot,[format,change,source].map(value => value.charAt(0)).join(''));
  await mkdir(area);
  const root = join(area,'library');
  await cp(roots.dataRoot,root,{recursive:true});
  const member = 'between-attempts.bin';
  const contents = Buffer.from([1,7]);
  if (change === 'removed') await writeFile(join(root,member),contents);
  await beginUpgrade(root);
  await resumeUpgrade(root,'0.7.9');
  const {id} = JSON.parse(await readFile(join(root,'store','upgrade-origin.json'),'utf8'));
  const phase = join(root,'shell','storage-upgrade.json');
  const note = join(root,'shell','upgrade-'+id);
  const old = join(root,'store-before-0.7.9-'+id);
  const parked = join(root,'shell','store-after-0.7.9-'+id);
  const independent = join(note,'current-database');
  const prepared = join(note,'prepared-database');
  const receipt = 'rollback-ready.json';
  const writer = format === 'historical' ? await historicalUpgradeService(root,roots.codeRoot,'2a49562074529baf25f5073a22d561d6eaecf132','0.7.9') : {beginUpgradeRollback,resumeUpgrade};
  const pause = (point: string,moved = false) => writer.resumeUpgrade(root,'0.7.9',(stage,afterRename) => {
    if (point === stage && Boolean(afterRename) === moved) throw Error('interrupted');
  });

  await writer.beginUpgradeRollback(root);
  await expect(pause('save-new')).rejects.toThrow('interrupted');
  const first = await readFile(join(independent,receipt));
  const firstManifest = await readFile(join(independent,'files.json'));
  const copyA = join(area,'attempt-a');
  await cp(independent,copyA,{recursive:true});
  const away = join(area,'first-old-away');
  await rename(old,away);
  await expect(writer.resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
  expect(existsSync(phase)).toBe(false);
  await rename(away,old);
  if (change === 'removed') await rm(join(root,member));
  else await writeFile(join(root,member),contents);

  await writer.beginUpgradeRollback(root);
  const stale = await readFile(phase);
  await expect(pause('publish-old',true)).rejects.toThrow('interrupted');
  const second = JSON.parse(await readFile(join(independent,receipt),'utf8'));
  const secondManifest = await readFile(join(independent,'files.json'));
  const inventory = JSON.parse(secondManifest.toString('utf8'));
  const expected: DatabasePackageMember[] = Array.isArray(inventory) ? inventory : inventory.members;
  const earlier = JSON.parse(first.toString('utf8'));
  expect(second.currentDigest).toBe(earlier.currentDigest);
  expect(second.rollbackAttempt).not.toBe(earlier.rollbackAttempt);
  expect(second.currentManifestDigest).not.toBe(earlier.currentManifestDigest);
  expect(existsSync(join(root,member))).toBe(change === 'removed');
  const preparedFiles = join(note,'prepared-payloads');
  if (change === 'added') {
    await mkdir(preparedFiles,{recursive:true});
    await rename(join(parked,'payloads',member),join(preparedFiles,member));
  }
  // The old publication survived, but the journal and the independent directory renames did not all persist.
  const copyB = join(area,'attempt-b');
  await rename(independent,copyB);
  await rename(copyA,independent);
  await rm(join(parked,receipt));
  await writeFile(join(note,receipt),first);
  await writeFile(join(note,'current-files.json'),firstManifest);
  const parkedMember = join(parked,'payloads',member);
  if (format === 'current' && change === 'removed') await writeFile(parkedMember,contents);
  await writeFile(phase,stale);
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  expect(await readFile(phase)).toEqual(stale);
  expect(await readFile(join(note,'current-files.json'))).toEqual(firstManifest);
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(116);
  await rm(join(independent,receipt));
  await rm(join(note,receipt));
  await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:format === 'current' ? 'UPGRADE_MISMATCH' : 'UPGRADE_FILES_INVALID'});
  expect(await readFile(phase)).toEqual(stale);
  expect(existsSync(join(root,member))).toBe(change === 'removed');
  if (change === 'added') expect(await readFile(join(preparedFiles,member))).toEqual(contents);
  await writeFile(join(independent,receipt),first);
  await writeFile(join(note,receipt),first);
  if (format === 'current') {
    // Only the parked directory now carries the matching complete pair. All inventory records still belong to A.
    if (change === 'added') await rename(join(preparedFiles,member),parkedMember);
    else await rm(parkedMember);
    await expect(resumeUpgrade(root,'0.7.9',stage => { if (stage === 'return-new') throw Error('verified'); })).rejects.toThrow('verified');
    expect(JSON.parse(await readFile(phase,'utf8')).currentManifestDigest).toBe(second.currentManifestDigest);
    await writeFile(phase,stale);
    await writeFile(join(note,'current-files.json'),firstManifest);
    if (change === 'added') await rename(parkedMember,join(preparedFiles,member));
    else await writeFile(parkedMember,contents);
  }
  await rename(copyB,prepared);
  await rm(join(prepared,'ai7.sqlite'));
  let shuffled = secondManifest;
  if (format === 'current') {
    const record: TestInventory = JSON.parse(secondManifest.toString('utf8'));
    shuffled = Buffer.from(withMembers(record,[...record.members].reverse()));
    await rm(join(prepared,receipt));
    await writeFile(join(prepared,'files.json'),shuffled);
  }
  await expect(resumeUpgrade(root,'0.7.9',stage => { if (stage === 'return-new') throw Error('interrupted'); })).rejects.toThrow('interrupted');
  const boundJournal = await readFile(phase);
  const bound = JSON.parse(boundJournal.toString('utf8'));
  expect(bound.currentDigest).toBe(second.currentDigest);
  expect(bound.currentManifestDigest).toBe(second.currentManifestDigest);
  await rm(join(prepared,receipt),{force:true});
  if (change === 'added') {
    // B's only complete inventory is published at current-files before its adjacent A receipt is replaced.
    const only = join(note,'current-files.json');
    await rm(join(prepared,'files.json'));
    await writeFile(only,firstManifest);
    await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
    expect(await readFile(phase)).toEqual(boundJournal);
    await rm(only);
    await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
    await writeFile(only,secondManifest);
    const unbound = {...bound};
    delete unbound.currentManifestDigest;
    for (const incomplete of [...(format === 'historical' ? [unbound] : []),{...bound,currentManifestDigest:'0'.repeat(64)}]) {
      const unchanged = JSON.stringify(incomplete);
      await writeFile(phase,unchanged);
      await expect(resumeUpgrade(root,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
      expect(await readFile(phase,'utf8')).toBe(unchanged);
      expect(await readFile(only)).toEqual(secondManifest);
      expect(await readFile(join(preparedFiles,member))).toEqual(contents);
      expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(116);
    }
    await writeFile(phase,boundJournal);
    expect(await readFile(join(note,receipt))).toEqual(first);
  }
  await rm(join(parked,'ai7.sqlite'));
  await expect(resumeUpgrade(root,'0.7.9',(stage,renamed) => {
    if (stage === 'return-new' && renamed) throw Error('interrupted');
  })).rejects.toThrow('interrupted');
  expect(existsSync(parked)).toBe(false);
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
  expect(existsSync(join(root,member))).toBe(change === 'removed');
  const incomplete = {...bound};
  delete incomplete.currentManifestDigest;
  const missingCommitment = JSON.stringify(incomplete);
  await writeFile(join(prepared,receipt),first);
  const savedMember = join(root,'store','payloads',member);
  const isolatedMember = join(area,'held-b-member');
  if (format === 'current') {
    // Pair B's SQLite with A's inventory and members. Neither state matches B's start commitment.
    await writeFile(join(note,'current-files.json'),firstManifest);
    await writeFile(join(prepared,'files.json'),firstManifest);
    if (change === 'added') await rename(savedMember,isolatedMember);
    else await writeFile(savedMember,contents);
  }
  for (const replay of [Buffer.from(missingCommitment),stale]) {
    await writeFile(phase,replay);
    await expect(resumeUpgrade(root,'0.7.9')).rejects.toBeDefined();
    expect(await readFile(phase)).toEqual(replay);
    expect(existsSync(join(root,member))).toBe(change === 'removed');
    expect(existsSync(savedMember)).toBe(format === 'current' ? change === 'removed' : change === 'added');
    expect(await readFile(join(note,receipt))).toEqual(first);
  }
  // Historical writers need their receipt. A current writer can prove the exact pair without one.
  if (format === 'current') {
    // Replay a real pre-normalization journal when only the equal, originally ordered inventory survives.
    const priorRoot = join(area,'p');
    await cp(root,priorRoot,{recursive:true});
    const priorStore = join(priorRoot,'store');
    const priorSaved = join(priorStore,'payloads',member);
    const priorNote = join(priorRoot,'shell','upgrade-'+id);
    const priorPhase = join(priorRoot,'shell','storage-upgrade.json');
    const priorInventory = join(priorNote,'prepared-database','files.json');
    await writeFile(priorInventory,shuffled);
    if (change === 'added') await cp(isolatedMember,priorSaved);
    else await rm(priorSaved);
    const priorWriter = await historicalUpgradeService(priorRoot,roots.codeRoot,'75b616b3d9979cacebc419c573fa264d73782457','0.7.9');
    await expect(priorWriter.resumeUpgrade(priorRoot,'0.7.9',stage => { if (stage === 'return-new') throw Error('verified'); })).rejects.toThrow('verified');
    const earlierJournal = await readFile(priorPhase);
    const previousState = JSON.parse(earlierJournal.toString('utf8'));
    expect(previousState.currentManifestDigest).toBe(JSON.parse(shuffled.toString('utf8')).sha256);
    expect(previousState.currentManifestDigest).not.toBe(second.currentManifestDigest);
    let priorSnapshot = priorStore;
    if (source === 'saved') {
      priorSnapshot = join(priorRoot,'shell','store-after-0.7.9-'+id);
      await rename(priorStore,priorSnapshot);
      await rename(join(priorRoot,'store-before-0.7.9-'+id),priorStore);
    }
    const priorMember = join(priorSnapshot,'payloads',member);
    await writeFile(join(priorNote,'current-files.json'),firstManifest);
    await writeFile(priorInventory,firstManifest);
    if (change === 'added') await rm(priorMember);
    else await writeFile(priorMember,contents);
    await expect(resumeUpgrade(priorRoot,'0.7.9')).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
    expect(await readFile(priorPhase)).toEqual(earlierJournal);
    if (change === 'added') await cp(isolatedMember,priorMember);
    else await rm(priorMember);
    await writeFile(priorInventory,secondManifest);
    expect(await resumeUpgrade(priorRoot,'0.7.9')).toMatchObject({restored:false});
    await verifyRollbackExport(priorRoot,join(area,'p.ai7db'),expected);
    if (source === 'live') {
      // The online export root alone matches consent, but the 117 startup marker did not survive.
      if (change === 'added') await rename(isolatedMember,join(root,member));
      else await rm(join(root,member));
    } else {
      if (change === 'added') await rename(isolatedMember,savedMember);
      else await rm(savedMember);
      await writeFile(join(prepared,'files.json'),shuffled);
    }
    expect(await readFile(phase)).toEqual(stale);
  } else {
    await writeFile(phase,change === 'added' ? missingCommitment : stale);
    await writeFile(join(root,'store',receipt),JSON.stringify(second));
  }
  // The live SQLite has the correct bytes, while only an independent database has a valid startup marker.
  const marker = join(root,'store','ai7-data-version.json');
  await rm(marker);
  expect(existsSync(join(independent,'ai7-data-version.json'))).toBe(true);
  expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:false});
  if (source === 'live') {
    // Earlier recoveries could finish installing B and leave a journal bound to its permuted on-disk spelling.
    await writeFile(phase,JSON.stringify({...bound,currentManifestDigest:JSON.parse(shuffled.toString('utf8')).sha256}));
    expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:false});
    expect(existsSync(phase)).toBe(false);
  }
  expect((await readDataVersionMarker(root))?.dataVersion).toBe(2);
  expect(existsSync(join(root,member))).toBe(change === 'added');
  await verifyRollbackExport(root,join(area,'b.ai7db'),expected);
  const kept = expected.find(file => file.path === member);
  if (change === 'added') expect(kept).toEqual({path:member,bytes:contents.length,sha256:createHash('sha256').update(contents).digest('hex')});
  else expect(kept).toBeUndefined();
},180_000);

it.each(['original','extracted'] as const)('reuses extracted offline payloads with the %s database and budgets simultaneous copies',async source => {
  const root = join(roots.inputRoot,'offline-extraction-'+source);
  await cp(roots.dataRoot,root,{recursive:true});
  const oldOnly = join(root,'old-only.bin');
  await writeFile(oldOnly,Buffer.alloc(64*1024*1024,117));
  const originalFile = (await fileDigest(oldOnly))!;
  await beginUpgrade(root);
  await resumeUpgrade(root,'0.7.9');
  await rm(oldOnly);
  const {id,backup} = JSON.parse(await readFile(join(root,'store','upgrade-origin.json'),'utf8'));
  const note = join(root,'shell','upgrade-'+id);
  const archive = join(backupLocationFor(root),backup.backup.fileName);
  const area = join(note,'restore');
  await mkdir(area,{recursive:true});
  await extractReplacement(area,archive,backup.backup.sha256);
  await rm(archive);
  if (source === 'extracted') await rm(join(root,'store-before-0.7.9-'+id),{recursive:true});
  const manifest = join(note,'payloads.json');
  await rm(manifest);
  const prepared = join(note,'prepared-payloads');
  await mkdir(prepared,{recursive:true});
  const partial = join(prepared,'partial.bin');
  await writeFile(partial,Buffer.alloc(4096));
  const write = replacement.writeAtomic;
  let reclaimed = false;
  const disk = vi.spyOn(replacement,'writeAtomic').mockImplementation(async (path,contents) => {
    if (path === manifest) {
      if (existsSync(partial)) throw Object.assign(Error('disk full'),{code:'ENOSPC'});
      reclaimed = true;
    }
    await write(path,contents);
  });
  try {
    await beginUpgradeRollback(root);
    const sql = join(root,'store','ai7.sqlite');
    const sqlBytes = (await fileDigest(sql))!.bytes + ((await fileDigest(sql+'-wal'))?.bytes ?? 0);
    const currentBytes = (await databasePackageSources(root)).reduce((bytes,file) => bytes + file.bytes,sqlBytes);
    const base = rollbackDataPeak(currentBytes);
    const free = source === 'original' ? base + Math.floor(originalFile.bytes*1.5) : base;
    if (source === 'extracted') expect(originalFile.bytes).toBeGreaterThan(free);
    await expect(resumeUpgrade(root,'0.7.9',undefined,free)).rejects.toMatchObject({code:'UPGRADE_SPACE',message:expect.stringContaining('回退的临时文件空间不足')});
    expect(reclaimed).toBe(true);
    expect(existsSync(partial)).toBe(false);
    expect(storeRevisionOnDisk(sql)).toBe(117);
    expect(JSON.parse(await readFile(join(root,'shell','storage-upgrade.json'),'utf8')).stage).toBe('restore');
    expect(existsSync(oldOnly)).toBe(false);
    expect(existsSync(join(note,'old-payloads','old-only.bin'))).toBe(false);
    expect(await resumeUpgrade(root,'0.7.9')).toMatchObject({restored:true});
  } finally { disk.mockRestore(); }
  expect(reclaimed).toBe(true);
  expect(await fileDigest(oldOnly)).toEqual(originalFile);
  await verifyLibraryFiles(root,116);
  const opened = await legacy.openLegacy(root);
  try { expect(opened.listBooks(null).items).toHaveLength(2); } finally { opened.markCleanShutdown(); opened.close(); }
},180_000);
