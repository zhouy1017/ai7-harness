import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createUpgradeSample1, legacySampleService } from '../support/upgrade-sample1.js';
import { reimportVersion } from '../support/reimport-version.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { readDataVersionMarker, storeRevisionOnDisk } from '../../src/service/data-version.js';
import { beginUpgrade, beginUpgradeRollback, resumeUpgrade, rollbackDataPeak, upgradePreflight, upgradeSpaceShortfall } from '../../src/service/in-app-upgrade.js';
import { replacementStagingFor } from '../../src/service/database-replacement.js';
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

async function verifyLibraryFiles(root: string, revision: number): Promise<void> {
  const files = await Promise.all((await databasePackageSources(root)).map(async file => ({
    path:file.member,...(await fileDigest(file.path))!
  })));
  await verifyCopiedPayloads(join(root,'store','ai7.sqlite'),files,revision);
}

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
  const incomplete = join(roots.inputRoot,'incomplete-current');
  await cp(root,incomplete,{recursive:true});
  await rm(join(incomplete,newKey));
  await beginUpgradeRollback(incomplete);
  await expect(resumeUpgrade(incomplete,'0.8.0')).rejects.toMatchObject({code:'DATABASE_PACKAGE_INCOMPLETE'});
  expect(storeRevisionOnDisk(join(incomplete,'store','ai7.sqlite'))).toBe(117);
  expect(existsSync(join(incomplete,'shell','storage-upgrade.json'))).toBe(true);
  await cp(join(roots.inputRoot,'sample1-edited.docx'),join(incomplete,newKey));
  expect(await resumeUpgrade(incomplete,'0.8.0')).toMatchObject({restored:true});
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
  // The post-upgrade snapshot already exists, but the current database has not moved.
  await rm(join(root,newKey));
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
  expect((await fileDigest(join(root,newKey)))?.sha256).toBe(newObject);
  expect(existsSync(phase)).toBe(false);
  // This retry must use the previous snapshot to recover an object created only in revision 117.
  await rm(join(root,newKey));
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.8.0',stage => { if(stage === 'save-new') throw Error('power loss'); })).rejects.toThrow('power loss');
  expect((await fileDigest(join(root,newKey)))?.sha256).toBe(newObject);
  await verifyLibraryFiles(root,117);
  // A damaged snapshot must not prevent opening the intact, independently verifiable live library.
  await writeFile(join(root,'store','payloads',newKey),Buffer.alloc(0));
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toMatchObject({code:'UPGRADE_FILES_INVALID'});
  expect(existsSync(phase)).toBe(false);
  await verifyLibraryFiles(root,117);
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.8.0',stage => { if(stage === 'save-new') throw Error('power loss'); })).rejects.toThrow('power loss');
  await rename(join(root,kept),away);
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toBeDefined();
  expect(existsSync(phase)).toBe(false);
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
  expect((await fileDigest(join(root,newKey)))?.sha256).toBe(newObject);
  const recoveredCurrent = await EditorialStore.open(root,roots.codeRoot);
  try { expect(recoveredCurrent.listBooks(null).items).toHaveLength(2); }
  finally { recoveredCurrent.markCleanShutdown(); recoveredCurrent.close(); }
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
  const staleRestore = await readFile(phase);
  await expect(resumeUpgrade(root,'0.8.0',stage => { if(stage === 'publish-old') throw Error('power loss'); })).rejects.toThrow('power loss');
  const {id} = JSON.parse(staleRestore.toString('utf8'));
  await rm(join(root,'shell','store-after-0.8.0-'+id,'rollback-ready.json'));
  await rm(join(root,'shell','upgrade-'+id,'rollback-ready.json'));
  await writeFile(phase,staleRestore);
  expect(await resumeUpgrade(root,'0.8.0')).toMatchObject({restored:false});
  await verifyLibraryFiles(root,117);
  const reopenedCurrent = await EditorialStore.open(root,roots.codeRoot);
  try { expect(reopenedCurrent.listBooks(null).items).toHaveLength(2); }
  finally { reopenedCurrent.markCleanShutdown(); reopenedCurrent.close(); }
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

it.each(['convert','verify','save-old','publish','record'] as const)('catches missing or damaged payloads at %s and restores a usable old library', async stage => {
  const root = join(roots.inputRoot,'lost-payload-'+stage);
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  await expect(resumeUpgrade(root,'0.8.0',phase => { if(phase === stage) throw Error('power loss'); })).rejects.toThrow('power loss');
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
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toMatchObject({code:firstError});
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

it('refuses an altered revision 117 store before final publication',async () => {
  const root = join(roots.inputRoot,'altered-conversion');
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  await expect(resumeUpgrade(root,'0.8.0',phase => { if (phase === 'record') throw Error('interrupted'); })).rejects.toThrow('interrupted');
  const db = new DatabaseSync(join(root,'store','ai7.sqlite'));
  try { db.exec('CREATE TABLE unexpected_change(id INTEGER)'); } finally { db.close(); }
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toMatchObject({code:'UPGRADE_MISMATCH'});
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(116);
});

it('rebuilds the original manifest from the backup across both sides of the old directory rename',async () => {
  const root = join(roots.inputRoot,'recover-original-manifest');
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  const phase = join(root,'shell','storage-upgrade.json');
  const stop = (at: string) => resumeUpgrade(root,'0.8.0',stage => { if (stage === at) throw Error('interrupted'); });
  await expect(stop('convert')).rejects.toThrow('interrupted');
  const stale = JSON.parse(await readFile(phase,'utf8'));
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
  expect(await resumeUpgrade(root,'0.8.0')).toMatchObject({restored:false});
  expect(await fileDigest(manifest)).toEqual(original);
  const verified = await EditorialStore.open(root,roots.codeRoot);
  try { expect(verified.listBooks(null).items).toHaveLength(2); } finally { verified.markCleanShutdown(); verified.close(); }
},180_000);

it.runIf(process.platform === 'win32')('recovers from a locked fallback directory and a subsequently damaged published old store',async () => {
  const root = join(roots.inputRoot,'locked-fallback');
  await cp(roots.dataRoot,root,{recursive:true});
  await beginUpgrade(root);
  await resumeUpgrade(root,'0.8.0');
  const phase = join(root,'shell','storage-upgrade.json');
  const location = backupLocationFor(root);
  const originalPackage = join(location,(await readdir(location)).find(name => name.endsWith('.ai7db'))!);
  const originalMembers = (await verifyDatabasePackage(originalPackage,{dataRoot:root})).manifest.members;
  const kept = (await readdir(root)).find(name => name.startsWith('store-before-0.8.0-'))!;
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
  const stop = (point: string, after = false) => resumeUpgrade(root,'0.8.0',(stage,renamed) => {
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
    await expect(resumeUpgrade(root,'0.8.0')).rejects.toBeDefined();
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
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toBeDefined();
  const healthy = await EditorialStore.open(root,roots.codeRoot);
  try { expect(healthy.listBooks(null).items).toHaveLength(2); } finally { healthy.markCleanShutdown(); healthy.close(); }
  await beginUpgradeRollback(root);
  await expect(stop('publish-old',true)).rejects.toThrow('interrupted');
  const savedJournal = await readFile(phase);
  expect(await resumeUpgrade(root,'0.8.0')).toMatchObject({restored:true});
  // Simulate a stale journal deletion after temporary extraction files disappeared.
  await writeFile(phase,savedJournal);
  expect(await resumeUpgrade(root,'0.8.0')).toMatchObject({restored:true});
  await writeFile(phase,savedJournal);
  await writeFile(missing.path,Buffer.alloc(0));
  await expect(resumeUpgrade(root,'0.8.0')).rejects.toBeDefined();
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(117);
  expect(await fileDigest(missing.path)).toEqual(digest);
  await beginUpgradeRollback(root);
  expect(await resumeUpgrade(root,'0.8.0')).toMatchObject({restored:true});
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
    await expect(resumeUpgrade(root,'0.8.0')).rejects.toBeDefined();
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
  expect(await resumeUpgrade(root,'0.8.0')).toMatchObject({restored:false});
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
  await resumeUpgrade(root,'0.8.0');
  await beginUpgradeRollback(root);
  await expect(resumeUpgrade(root,'0.8.0',stage => { if (stage === 'publish-old') throw Error('interrupted'); })).rejects.toThrow('interrupted');
  const {id} = JSON.parse(await readFile(join(root,'shell','storage-upgrade.json'),'utf8'));
  const saved = join(root,'shell','store-after-0.8.0-'+id);
  const path = join(saved,'ai7.sqlite');
  const expected = await fileDigest(path);
  if (defect === 'removed') await rm(path);
  else {
    const altered = new DatabaseSync(path);
    try { altered.exec('CREATE TABLE unexpected_change(id INTEGER)'); } finally { altered.close(); }
  }
  expect(await resumeUpgrade(root,'0.8.0')).toMatchObject({restored:true});
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
