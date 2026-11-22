import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createUpgradeSample1 } from '../support/upgrade-sample1.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { readDataVersionMarker, storeRevisionOnDisk } from '../../src/service/data-version.js';
import { beginUpgrade, beginUpgradeRollback, resumeUpgrade, upgradePreflight } from '../../src/service/in-app-upgrade.js';
import { EditorialStore } from '../../src/service/store.js';
import { backupLocationFor } from '../../src/service/scheduled-backups.js';

let roots: ServiceTestRoots;
beforeAll(async () => {
  roots = await createServiceTestRoots('ai7-upgrade-');
  await createUpgradeSample1(roots.dataRoot,roots.codeRoot);
});
afterAll(async () => { await roots.dispose(); });

it('resumes each phase, imports the older package and recovers missing old files from its backup',async () => {
  const root = join(roots.inputRoot,'library');
  await cp(roots.dataRoot,root,{recursive:true});
  await expect(upgradePreflight(root,0)).rejects.toMatchObject({code:'UPGRADE_SPACE'});
  expect(existsSync(join(root,'store.upgrading'))).toBe(false);
  await beginUpgrade(root);
  const stopped = new Set<string>();
  const run = () => resumeUpgrade(root,'0.8.0',stage => {
    if (!stopped.has(stage)) { stopped.add(stage); throw Error('interrupted '+stage); }
  });
  for (const stage of ['backup','convert','verify','save-old','publish','record']) {
    await expect(run()).rejects.toThrow('interrupted '+stage);
    await expect(EditorialStore.open(root,roots.codeRoot)).rejects.toMatchObject({code:'UPGRADE_PENDING'});
  }
  expect(await run()).toMatchObject({restored:false});
  const converted = await EditorialStore.open(root,roots.codeRoot);
  try {
    expect(converted.listBooks(null).items.length).toBe(2);
    expect(converted.inspectDataVersion().upgrades[0]?.fromDataVersion).toBe(1);
  } finally { converted.markCleanShutdown(); converted.close(); }
  const db = new DatabaseSync(join(root,'store','ai7.sqlite'),{readOnly:true});
  try {
    expect(db.prepare("SELECT count(*) n FROM manuscript_revisions WHERE revision_label='升级时的稿件'").get()?.n).toBe(2);
    expect(db.prepare('SELECT count(*) n FROM editor_steps').get()?.n).toBe(0);
  } finally { db.close(); }
  const other = join(roots.inputRoot,'import');
  const target = await EditorialStore.open(other,roots.codeRoot);
  try {
    const location = backupLocationFor(root);
    const archive = (await readdir(location)).find(f=>f.endsWith('.ai7db'))!;
    const preview = await target.inspectDatabaseImport(join(location,archive));
    expect(preview.compatibility).toBe('compatible');
    await target.prepareDatabaseReplacement(preview.previewId,new Date());
  } finally { target.markCleanShutdown(); target.close(); }
  const opened = await EditorialStore.open(other,roots.codeRoot);
  try { expect(opened.listBooks(null).items.length).toBe(2); }
  finally { opened.markCleanShutdown(); opened.close(); }
  await rm(join(root,'objects'),{recursive:true});
  await mkdir(join(root,'objects'));
  await beginUpgradeRollback(root);
  for (const stage of ['restore','save-new','publish-old']) await expect(run()).rejects.toThrow('interrupted '+stage);
  expect(await run()).toMatchObject({restored:true});
  expect(storeRevisionOnDisk(join(root,'store','ai7.sqlite'))).toBe(116);
  expect((await readDataVersionMarker(root))?.dataVersion).toBe(1);
  await upgradePreflight(root);
},180_000);
