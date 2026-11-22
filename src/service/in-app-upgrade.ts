import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, rename, rm, statfs } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../shared/data-root.js';
import { DATA_VERSION_MARKER_FILE, DataVersionLedger, readDataVersionMarker, readUpgrade, SCHEMA_REVISION_CLASSES,
  storeRevisionOnDisk, writeDataVersionMarker, type DataVersionUpgrade } from './data-version.js';
import { databasePackageSources, openPackageStore, verifyCopiedPayloads } from './database-exports.js';
import { extractReplacement, readSmallFile, replacementStagingFor, writeAtomic } from './database-replacement.js';
import { fileDigest } from './manuscript-export.js';
import { backupLocationFor } from './scheduled-backups.js';
import { requireStore } from './store-records.js';
import { backUpBeforeUpgrade, readPendingUpgrade } from './upgrade-backup.js';
import { convertUpgradeStore, requireUpgradeSource, verifyUpgradeStore } from './upgrade-store.js';

const stages = ['backup','convert','verify','save-old','publish','record','restore','save-new','publish-old'] as const;
type Stage = typeof stages[number];
interface UpgradeState {
  id: string;
  stage: Stage;
  backup: DataVersionUpgrade | null;
  comparison: string;
  fallback: boolean;
}
const journal = (root: string) => join(root, 'shell', 'storage-upgrade.json');
const originFile = 'upgrade-origin.json';
const database = (directory: string) => join(directory, 'ai7.sqlite');

async function readState(path: string): Promise<UpgradeState | null> {
  const raw = await readSmallFile(path, 16384);
  if (raw === null) return null;
  const state = JSON.parse(raw);
  requireStore(state && /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(state.id) &&
    stages.includes(state.stage) && typeof state.fallback === 'boolean' && typeof state.comparison === 'string' &&
    (state.comparison === '' || /^升级前后均为 \d+ 本书、\d+ 份稿件、\d+ 条批注和 \d+ 份审阅报告。$/u.test(state.comparison)),
  'UPGRADE_STATE_INVALID', '上次升级的记录无法读取。');
  return { ...state, backup: state.backup === null ? null : readUpgrade(state.backup, 2) };
}

async function checkedStore(root: string, dir: string): Promise<string> {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = await inspectCanonicalDataFile(root, dir, 'ai7.sqlite'+suffix);
    if (suffix === '') requireStore(file.exists, 'UPGRADE_STORE_MISSING', '没有找到待核对的数据库。');
  }
  return database(dir);
}

export async function upgradePreflight(root: string, freeBytes?: number): Promise<void> {
  const source = await checkedStore(root, join(root,'store'));
  const marker = await readDataVersionMarker(root);
  requireStore(!marker || (marker.dataVersion === 1 && marker.schemaRevision === 116),
    'UPGRADE_SOURCE_INVALID', '旧数据的版本标记不一致。请先用 0.7.4 打开。');
  const db = openPackageStore(source);
  try { requireUpgradeSource(db); } finally { db.close(); }
  const payload = (await databasePackageSources(root)).reduce((sum, row) => sum + row.bytes, 0);
  const size = (await lstat(source)).size + (existsSync(source+'-wal') ? (await lstat(source+'-wal')).size : 0);
  const disk = await statfs(root);
  // Online backup holds a SQLite snapshot beside the package. Conversion also installs the word lists and saved versions.
  const missing = Math.ceil(Math.max(2 * size + payload, 3 * size + 32 * 1024 * 1024) - (freeBytes ?? disk.bavail * disk.bsize));
  requireStore(missing <= 0, 'UPGRADE_SPACE', `磁盘空间不足，还差 ${Math.ceil(missing/1048576)} MB。释放空间后再升级。`);
}

async function verifyFiles(root: string, db: string): Promise<void> {
  const files = [];
  for (const src of await databasePackageSources(root)) {
    const held = await fileDigest(src.path);
    requireStore(held !== null, 'UPGRADE_FILES_INVALID', '需要的数据文件缺失。');
    files.push({ path: src.member, ...held });
  }
  await verifyCopiedPayloads(db, files, 116);
}

async function restorePayloads(root: string, incoming: string): Promise<void> {
  for (const src of await databasePackageSources(incoming)) {
    const parts = src.member.split('/');
    const name = parts.pop()!;
    const dir = parts.length ? await ensureCanonicalDataDirectory(root, ...parts) : root;
    if (dir !== root) await inspectCanonicalDataFile(root, dir, name);
    const destination = join(dir,name);
    const temp = destination + '.' + randomUUID() + '.partial';
    try {
      await copyFile(src.path,temp);
      await rename(temp,destination);
    } finally { await rm(temp,{force:true}); }
  }
}

export async function beginUpgrade(root: string): Promise<void> {
  await upgradePreflight(root);
  await ensureCanonicalDataDirectory(root,'shell');
  requireStore(await readState(journal(root)) === null && !existsSync(join(root,'store.upgrading')),
    'UPGRADE_STATE_INVALID','已有升级等待继续。');
  await writeAtomic(journal(root),JSON.stringify({ id: Date.now()+'-'+randomUUID(), stage:'backup', backup:null, comparison:'',fallback:false }));
}

export async function beginUpgradeRollback(root: string): Promise<void> {
  const state = await readState(join(root,'store',originFile));
  requireStore(state?.backup && await readState(journal(root)) === null,'UPGRADE_STATE_INVALID','找不到本次升级的备份记录。');
  await writeAtomic(journal(root),JSON.stringify({ ...state,stage:'restore' }));
}

export async function resumeUpgrade(root: string, softwareVersion: string, before?: (stage: Stage) => void): Promise<{ restored: boolean; message: string } | null> {
  const state = await readState(journal(root));
  if (!state) return null;
  const store = join(root,'store');
  const staging = join(root,'store.upgrading');
  const old = join(root,'store-before-0.8.0-'+state.id);
  const newer = join(root,'store-after-0.8.0-'+state.id);
  const note = join(root,'shell','upgrade-'+state.id);
  const advance = async (stage: Stage) => {
    state.stage = stage;
    await writeAtomic(journal(root),JSON.stringify(state));
  };
  for (;;) {
    before?.(state.stage);
    switch (state.stage) {
      case 'backup': {
        await ensureCanonicalDataDirectory(root,'shell',basename(note),'store');
        const pending = await readPendingUpgrade(note);
        if (pending !== null) state.backup = pending.upgrade;
        else {
          const db = openPackageStore(await checkedStore(root, store));
          try {
            const result = await backUpBeforeUpgrade(db,root,{ terminalRevision:117, classes:SCHEMA_REVISION_CLASSES,
              softwareVersion, now:new Date(), noteRoot:note });
            state.backup = result.upgrade;
          } finally { db.close(); }
        }
        requireStore(state.backup !== null,'UPGRADE_BACKUP_FAILED','未能建立升级前备份。');
        await advance('convert');
        break;
      }
      case 'convert':
        await rm(staging,{recursive:true,force:true});
        await ensureCanonicalDataDirectory(root,'store.upgrading');
        convertUpgradeStore(await checkedStore(root,store),database(staging));
        await advance('verify');
        break;
      case 'verify':
        state.comparison = verifyUpgradeStore(await checkedStore(root,store),await checkedStore(root,staging));
        await verifyFiles(root,database(staging));
        await writeAtomic(join(staging,DATA_VERSION_MARKER_FILE),JSON.stringify({ dataVersion:2,schemaRevision:117,softwareVersion,writtenAt:new Date().toISOString() }));
        await advance('save-old');
        break;
      case 'save-old':
        if (existsSync(store)) await rename(store,old);
        await advance('publish');
        break;
      case 'publish':
        if (existsSync(staging)) await rename(staging,store);
        await advance('record');
        break;
      case 'record': {
        const db = new DatabaseSync(await checkedStore(root,store));
        try { new DataVersionLedger(db).recordOpen({dataVersion:2,schemaRevision:117,softwareVersion,upgrade:state.backup}); }
        finally { db.close(); }
        await writeAtomic(join(store,originFile),JSON.stringify(state));
        await rm(journal(root));
        return { restored:false,message:state.comparison };
      }
      case 'restore': {
        const backup = state.backup!;
        let ready = old;
        try {
          const path = await checkedStore(root,old);
          const db = openPackageStore(path);
          try {
            requireUpgradeSource(db);
            requireStore(db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok','UPGRADE_FILES_INVALID','旧数据库完整性核对失败。');
          } finally { db.close(); }
          await verifyFiles(root,path);
        } catch {
          const archiveRoot = join(note,'restore');
          await ensureCanonicalDataDirectory(root,'shell',basename(note),'restore');
          await extractReplacement(archiveRoot,join(backupLocationFor(root),backup.backup.fileName),backup.backup.sha256);
          const incoming = join(replacementStagingFor(archiveRoot),'incoming');
          await verifyFiles(incoming,database(join(incoming,'store')));
          await restorePayloads(root,incoming);
          ready = join(incoming,'store');
          await rm(staging,{recursive:true,force:true});
          await rename(ready,staging);
          ready = staging;
          state.fallback = true;
        }
        await writeAtomic(join(ready,DATA_VERSION_MARKER_FILE),JSON.stringify({dataVersion:1,schemaRevision:116,
          softwareVersion:backup.fromSoftwareVersion ?? '0.7.4',writtenAt:new Date().toISOString()}));
        await advance('save-new');
        break;
      }
      case 'save-new':
        if (existsSync(store)) await rename(store,newer);
        await advance('publish-old');
        break;
      case 'publish-old':
        if (!existsSync(store)) await rename(state.fallback ? staging : old,store);
        requireStore(storeRevisionOnDisk(database(store)) === 116,'UPGRADE_STATE_INVALID','旧数据库未能就位。');
        await rm(journal(root));
        return { restored:true,message:'升级前的数据已就位，请使用上一版 AI7 打开。' };
    }
  }
}
