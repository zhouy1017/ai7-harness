import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, open, rename, rm, statfs } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../shared/data-root.js';
import {
  DATA_VERSION_MARKER_FILE, DataVersionLedger, readDataVersionMarker, readUpgrade, SCHEMA_REVISION_CLASSES,
  storeRevisionOnDisk, type DataVersionUpgrade
} from './data-version.js';
import { DATABASE_PACKAGE_STORE_MEMBER, databasePackageSources, openPackageStore, verifyCopiedPayloads, type DatabasePackageMember } from './database-exports.js';
import { MAX_DIRECTORY_BYTES, MAX_MANIFEST_BYTES, verifyDatabasePackage } from './database-package-reader.js';
import { extractReplacement, readSmallFile, replacementStagingFor, writeAtomic } from './database-replacement.js';
import { fileDigest } from './manuscript-export.js';
import { backupLocationFor } from './scheduled-backups.js';
import { requireStore } from './store-records.js';
import { backUpBeforeUpgrade, readPendingUpgrade } from './upgrade-backup.js';
import { convertUpgradeStore, requireUpgradeSource, verifyUpgradeStore } from './upgrade-store.js';

const stages = ['backup', 'convert', 'verify', 'save-old', 'publish', 'record', 'return-old', 'restore', 'save-new', 'publish-old', 'return-new'] as const;
type Stage = typeof stages[number];
interface UpgradeState {
  id: string;
  stage: Stage;
  backup: DataVersionUpgrade | null;
  comparison: string;
  fallback: boolean;
  sourceDigest: string;
  payloadManifestDigest?: string;
  targetDigest?: string;
  rollbackDigest?: string;
  currentDigest?: string;
  currentManifestDigest?: string;
  backupStoreBytes?: number;
  backupPayloadBytes?: number;
}
const journal = (root: string) => join(root, 'shell', 'storage-upgrade.json');
const originFile = 'upgrade-origin.json';
const database = (directory: string) => join(directory, 'ai7.sqlite');

async function readState(path: string): Promise<UpgradeState | null> {
  const raw = await readSmallFile(path, 16384);
  if (raw === null) return null;
  const state = JSON.parse(raw);
  requireStore(state && /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(state.id) &&
    stages.includes(state.stage) && /^[a-f0-9]{64}$/u.test(state.sourceDigest) && typeof state.fallback === 'boolean' && typeof state.comparison === 'string' &&
    (state.comparison === '' || /^升级前后均为 \d+ 本书、\d+ 份稿件、\d+ 条批注和 \d+ 份审阅报告。$/u.test(state.comparison)),
    'UPGRADE_STATE_INVALID', '上次升级的记录无法读取。');
  return { ...state, backup: state.backup === null ? null : readUpgrade(state.backup, 2) };
}

async function checkedStore(root: string, dir: string): Promise<string> {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = await inspectCanonicalDataFile(root, dir, 'ai7.sqlite' + suffix);
    if (suffix === '') requireStore(file.exists, 'UPGRADE_STORE_MISSING', '没有找到待核对的数据库。');
  }
  return database(dir);
}

export async function upgradePreflight(root: string, freeBytes?: number): Promise<void> {
  const source = await checkedStore(root, join(root, 'store'));
  const marker = await readDataVersionMarker(root);
  requireStore(!marker || (marker.dataVersion === 1 && marker.schemaRevision === 116),
    'UPGRADE_SOURCE_INVALID', '旧数据的版本标记不一致。请先用 0.7.4 打开。');
  const db = openPackageStore(source);
  try { requireUpgradeSource(db); } finally { db.close(); }
  const payload = (await databasePackageSources(root)).reduce((sum, row) => sum + row.bytes, 0);
  const size = (await lstat(source)).size + (existsSync(source + '-wal') ? (await lstat(source + '-wal')).size : 0);
  const backupPath = backupLocationFor(root);
  const backupDirectory = existsSync(backupPath) ? backupPath : dirname(backupPath);
  const [dataVolume, backupVolume, dataInfo, backupInfo] = await Promise.all([statfs(root), statfs(backupDirectory), lstat(root), lstat(backupDirectory)]);
  const dataFree = freeBytes ?? dataVolume.bavail * dataVolume.bsize;
  const backupFree = freeBytes ?? backupVolume.bavail * backupVolume.bsize;
  // The online SQLite snapshot and its ZIP coexist on the backup volume. The snapshot is gone during conversion.
  // The reader bounds the central directory and manifest separately. Local headers repeat the names.
  const packageBytes = Math.ceil((size + payload) * 1.002) + 2 * MAX_DIRECTORY_BYTES + MAX_MANIFEST_BYTES;
  const newStoreBytes = size * 2 + 32 * 1024 * 1024;
  // Verification holds a second archive and its extracted SQLite file in the data root.
  const dataPeak = Math.max(newStoreBytes, packageBytes + size);
  const missing = Math.ceil(dataInfo.dev === backupInfo.dev
    ? packageBytes + dataPeak - Math.min(dataFree, backupFree)
    : Math.max(dataPeak - dataFree, packageBytes + size - backupFree));
  requireStore(missing <= 0, 'UPGRADE_SPACE', `磁盘空间不足，还差 ${Math.ceil(missing / 1048576)} MB。释放空间后再升级。`);
}

async function readMembers(root: string): Promise<DatabasePackageMember[]> {
  const files = [];
  for (const src of await databasePackageSources(root)) {
    const held = await fileDigest(src.path);
    requireStore(held !== null, 'UPGRADE_FILES_INVALID', '需要的数据文件缺失。');
    files.push({ path: src.member, ...held });
  }
  return files;
}

async function verifyFiles(root: string, db: string): Promise<void> {
  const files = await readMembers(root);
  const revision = storeRevisionOnDisk(db);
  requireStore(revision !== null, 'UPGRADE_STORE_MISSING', '找不到待核对的数据库。');
  await verifyCopiedPayloads(db, files, revision);
}

/** The archive is read in place. Extraction, repair and the complete rollback snapshot all write to the data volume. */
export function rollbackDataPeak(currentBytes: number, backup?: { archive: number; store: number; files: number }): number {
  if (!backup) return currentBytes + MAX_MANIFEST_BYTES;
  const extracted = backup.store + backup.files;
  const extractionPeak = backup.archive + backup.store + extracted;
  // All original files may need repair and then also belong to the preserved current snapshot.
  const publicationPeak = extracted + currentBytes + 2 * backup.files;
  return Math.max(extractionPeak,publicationPeak) + MAX_MANIFEST_BYTES;
}

async function requireRollbackSpace(root: string, state: UpgradeState, fallback: boolean): Promise<void> {
  const currentBytes = (await databasePackageSources(root)).reduce((n,member) => n + member.bytes,0);
  const volume = await statfs(root);
  const peak = rollbackDataPeak(currentBytes,fallback ? {
    archive: state.backup!.backup.byteLength, store: state.backupStoreBytes!, files: state.backupPayloadBytes!
  } : undefined);
  const missing = peak - volume.bavail * volume.bsize;
  requireStore(missing <= 0,'UPGRADE_SPACE',`回退的临时文件空间不足，还差 ${Math.ceil(missing / 1048576)} MB。`);
}

function manifestFile(root: string, state: UpgradeState): string {
  return join(root,'shell','upgrade-'+state.id,'payloads.json');
}

async function rememberMembers(root: string, state: UpgradeState): Promise<void> {
  const archive = await verifyBackup(root,state);
  const {manifest} = await verifyDatabasePackage(archive,{dataRoot:root,expectedSha256:state.backup!.backup.sha256});
  const files = manifest.members.filter(member => member.path !== DATABASE_PACKAGE_STORE_MEMBER);
  state.backupStoreBytes = manifest.members.find(member => member.path === DATABASE_PACKAGE_STORE_MEMBER)!.bytes;
  state.backupPayloadBytes = files.reduce((total,member) => total + member.bytes,0);
  const json = JSON.stringify(files);
  state.payloadManifestDigest = createHash('sha256').update(json).digest('hex');
  await writeAtomic(manifestFile(root,state),json);
}

async function originalMembers(root: string, state: UpgradeState): Promise<DatabasePackageMember[]> {
  const json = await readSmallFile(manifestFile(root,state),MAX_MANIFEST_BYTES);
  requireStore(json !== null && createHash('sha256').update(json).digest('hex') === state.payloadManifestDigest,
    'UPGRADE_FILES_INVALID','升级前的文件清单缺失或已变化。');
  return JSON.parse(json);
}

async function verifyMembers(directory: string, expected: DatabasePackageMember[], exact: boolean): Promise<void> {
  const actual = new Map((await readMembers(directory)).map(member => [member.path, member]));
  requireStore((!exact || actual.size === expected.length) && expected.every(member => {
    const found = actual.get(member.path);
    return found?.sha256 === member.sha256 && found.bytes === member.bytes;
  }),'UPGRADE_FILES_INVALID','升级前的文件清单与实际文件不符。');
}

async function copyPayloads(root: string, incoming: string, include: Set<string>): Promise<void> {
  for (const src of await databasePackageSources(incoming)) {
    if (!include.has(src.member)) continue;
    const parts = src.member.split('/');
    const name = parts.pop()!;
    const dir = parts.length ? await ensureCanonicalDataDirectory(root, ...parts) : root;
    if (dir !== root) await inspectCanonicalDataFile(root, dir, name);
    const destination = join(dir, name);

    const temp = destination + '.' + randomUUID() + '.partial';
    try {
      await copyFile(src.path, temp);
      const handle = await open(temp,'r+');
      try { await handle.sync(); } finally { await handle.close(); }
      await rename(temp, destination);
    } finally { await rm(temp, { force: true }); }
  }
}

// The main database and any committed WAL survive a read-only backup. SHM is a reader's scratch file.
async function sourceFingerprint(root: string, dir: string): Promise<string> {
  const path = await checkedStore(root, dir);
  const databaseFile = await fileDigest(path);
  const log = existsSync(path + '-wal') ? await fileDigest(path + '-wal') : null;
  requireStore(databaseFile !== null, 'UPGRADE_STORE_MISSING', '找不到待升级的数据库。');
  return createHash('sha256').update(databaseFile.sha256).update(log?.bytes ? log.sha256 : '').digest('hex');
}

export async function beginUpgrade(root: string): Promise<void> {
  await upgradePreflight(root);
  await ensureCanonicalDataDirectory(root, 'shell');
  requireStore(await readState(journal(root)) === null && !existsSync(join(root, 'store.upgrading')),
    'UPGRADE_STATE_INVALID', '已有升级等待继续。');
  const sourceDigest = await sourceFingerprint(root, join(root, 'store'));
  await writePhase(root, { id: Date.now() + '-' + randomUUID(), stage: 'backup', backup: null, comparison: '', fallback: false, sourceDigest });
}

async function verifyOld(root: string, state: UpgradeState): Promise<string> {
  const old = join(root, 'store-before-0.8.0-' + state.id);
  requireStore(await sourceFingerprint(root, old) === state.sourceDigest, 'UPGRADE_SOURCE_CHANGED', '原书库已变化。');
  const path = database(old);
  const db = openPackageStore(path);
  try {
    requireUpgradeSource(db);
    requireStore(db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok', 'UPGRADE_FILES_INVALID', '旧数据库完整性核对失败。');
  } finally { db.close(); }
  const expected = await originalMembers(root,state);
  await verifyMembers(root,expected,false);
  await verifyCopiedPayloads(path,expected,116);
  return old;
}

async function currentMembers(note: string,state: UpgradeState): Promise<DatabasePackageMember[]> {
  const json = await readSmallFile(join(note,'current-files.json'),MAX_MANIFEST_BYTES);
  requireStore(json !== null && createHash('sha256').update(json).digest('hex') === state.currentManifestDigest,
    'UPGRADE_FILES_INVALID','回退前的文件清单核对失败。');
  return JSON.parse(json);
}

async function installMembers(root: string, source: string, expected: DatabasePackageMember[]): Promise<void> {
  const wanted = new Map(expected.map(member => [member.path,member]));
  const needed = new Set(wanted.keys());
  const extras = [];
  for (const file of await databasePackageSources(root)) {
    const entry = wanted.get(file.member);
    if (!entry) extras.push(file.path);
    else if ((await fileDigest(file.path))?.sha256 === entry.sha256) needed.delete(file.member);
  }
  await copyPayloads(root,source,needed);
  await verifyMembers(root,expected,false);
  // Every current file was independently copied and verified before any live path was touched.
  for (const extra of extras) await rm(extra);
  await verifyMembers(root,expected,true);
}

async function verifyBackup(root: string, state: UpgradeState): Promise<string> {
  const backup = state.backup?.backup;
  requireStore(backup !== undefined, 'UPGRADE_BACKUP_FAILED', '找不到升级前备份记录。');
  const archive = join(backupLocationFor(root), backup.fileName);
  const digest = await fileDigest(archive);
  requireStore(digest?.sha256 === backup.sha256 && digest.bytes === backup.byteLength,
    'UPGRADE_BACKUP_FAILED', '升级前备份缺失或已变化。');
  return archive;
}

async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writePhase(root: string, state: UpgradeState): Promise<void> {
  await writeAtomic(journal(root), JSON.stringify(state));
  await syncDirectory(dirname(journal(root)));
}

async function moveStore(root: string, from: string, to: string, verify: (directory: string) => Promise<void>): Promise<void> {
  const pending = existsSync(from);
  requireStore(pending !== existsSync(to), 'UPGRADE_STATE_INVALID', '不能确认切换中的两个书库目录。');
  await verify(pending ? from : to);
  if (pending) await rename(from, to);
  // Windows does not expose directory fsync through Node. An interrupted rename is reconciled by identity on resume.
  for (const directory of new Set([dirname(to), root, ...(pending ? [dirname(from)] : [])])) await syncDirectory(directory);
}

export async function hasLocalUpgradeSource(root: string): Promise<boolean> {
  try { await checkUpgradeRollback(root); return true; } catch { return false; }
}

export async function checkUpgradeRollback(root: string): Promise<UpgradeState> {
  const state = await readState(join(root, 'store', originFile));
  requireStore(state?.backup && await readState(journal(root)) === null, 'UPGRADE_STATE_INVALID', '找不到本次升级的备份记录。');
  await verifyOld(root, state).catch(() => verifyBackup(root, state));
  return state;
}

export async function beginUpgradeRollback(root: string): Promise<void> {
  const state = await checkUpgradeRollback(root);
  await writePhase(root, { ...state, stage: 'restore' });
}

type UpgradeHook = (stage: Stage, afterRename?: boolean) => void;
export async function resumeUpgrade(root: string, softwareVersion: string, before?: UpgradeHook): Promise<{ restored: boolean; message: string } | null> {
  try {
    return await runUpgrade(root, softwareVersion, before);
  } catch (error) {
    const state = await readState(journal(root));
    const active = join(root,'store');
    const old = state && join(root,'store-before-0.8.0-'+state.id);
    // A verification refusal before publication releases the old library. A killed process leaves the journal to resume.
    if (state && old && !before && ['save-old','publish','record'].includes(state.stage)) {
      await writePhase(root,{...state,stage:'return-old'});
      await runUpgrade(root,softwareVersion);
    } else if (state && !before && ['backup','convert','verify'].includes(state.stage)) {
      if (existsSync(active) && storeRevisionOnDisk(database(active)) === 116) {
        await rm(join(root,'store.upgrading'),{recursive:true,force:true});
        await rm(journal(root));
      }
    }
    if (!before && state && ['restore','save-new','publish-old'].includes(state.stage)) {
      const newer = join(root,'shell','store-after-0.8.0-'+state.id);
      if (existsSync(newer)) {
        await writePhase(root,{...state,stage:'return-new'});
        await runUpgrade(root,softwareVersion);
      } else if (existsSync(active) && (await readState(join(active,originFile)))?.id === state.id) {
        await rm(journal(root),{force:true});
      }
    }
    throw error;
  }
}

async function runUpgrade(root: string, softwareVersion: string, before?: UpgradeHook): Promise<{ restored: boolean; message: string } | null> {
  const state = await readState(journal(root));
  if (!state) return null;
  const store = join(root, 'store');
  const staging = join(root, 'store.upgrading');
  const old = join(root, 'store-before-0.8.0-' + state.id);
  // 0.7.x excludes shell from exports. Its own packager cannot know a new set-aside directory name.
  const newer = join(root, 'shell', 'store-after-0.8.0-' + state.id);
  const note = join(root, 'shell', 'upgrade-' + state.id);
  const incoming = join(replacementStagingFor(join(note,'restore')),'incoming');
  const rollbackSource = () => state.fallback ? join(incoming,'store') : old;
  const advance = async (stage: Stage) => {
    state.stage = stage;
    await writePhase(root,state);
  };
  // NTFS can recover a directory rename independently of the journal rename. Replay from the
  // observable database identities, even when the journal is ahead of (or behind) the directory.
  if (['save-old','publish','record'].includes(state.stage)) {
    const active = existsSync(store) ? storeRevisionOnDisk(database(store)) : null;
    if (state.stage !== 'save-old' && active === 116 && !existsSync(old)) await advance('save-old');
    if (state.stage === 'record' && active === null && existsSync(staging)) await advance('publish');
    if (state.stage === 'save-old' && active === 117 && existsSync(old) && !existsSync(staging)) await advance('publish');
  }
  if (state.stage === 'publish-old' && !existsSync(newer) && storeRevisionOnDisk(database(store)) === 117) await advance('save-new');
  if (state.stage === 'save-new' && existsSync(newer) && storeRevisionOnDisk(database(store)) === 116) await advance('publish-old');
  if (['backup', 'convert', 'verify', 'save-old'].includes(state.stage) && existsSync(store) &&
    await sourceFingerprint(root, store) !== state.sourceDigest) {
    // The editor used the old AI7 after an interruption. A fresh consent must back up the new source.
    await rm(staging, { recursive: true, force: true });
    await rm(journal(root));
    requireStore(false, 'UPGRADE_SOURCE_CHANGED', '旧书库已变化。请重新启动 AI7，为当前数据重新备份和升级。');
  }
  for (; ;) {
    before?.(state.stage);
    switch (state.stage) {
      case 'backup': {
        await ensureCanonicalDataDirectory(root, 'shell', basename(note), 'store');
        const pending = await readPendingUpgrade(note);
        if (pending !== null) state.backup = pending.upgrade;
        else {
          const db = openPackageStore(await checkedStore(root, store));
          try {
            const result = await backUpBeforeUpgrade(db, root, {
              terminalRevision: 117, classes: SCHEMA_REVISION_CLASSES,
              softwareVersion, now: new Date(), noteRoot: note
            });
            state.backup = result.upgrade;
          } finally { db.close(); }
        }
        requireStore(state.backup !== null, 'UPGRADE_BACKUP_FAILED', '未能建立升级前备份。');
        await rememberMembers(root,state);
        await advance('convert');
        break;
      }
      case 'convert': {
        await rm(staging, { recursive: true, force: true });
        await ensureCanonicalDataDirectory(root, 'store.upgrading');
        convertUpgradeStore(await checkedStore(root, store), database(staging));
        const db = new DatabaseSync(await checkedStore(root,staging));
        try { new DataVersionLedger(db).recordOpen({ dataVersion: 2, schemaRevision: 117, softwareVersion, upgrade: state.backup }); }
        finally { db.close(); }
        await advance('verify');
        break;
      }
      case 'verify':
        state.comparison = verifyUpgradeStore(await checkedStore(root, store), await checkedStore(root, staging),true);
        await verifyFiles(root, database(staging));
        await verifyMembers(root,await originalMembers(root,state),true);
        await writeAtomic(join(staging, DATA_VERSION_MARKER_FILE), JSON.stringify({ dataVersion: 2, schemaRevision: 117, softwareVersion, writtenAt: new Date().toISOString() }));
        state.targetDigest = await sourceFingerprint(root, staging);
        await writeAtomic(join(staging, originFile), JSON.stringify(state));
        await advance('save-old');
        break;
      case 'save-old':
        await verifyBackup(root, state);
        await verifyMembers(root,await originalMembers(root,state),true);
        requireStore(await sourceFingerprint(root, staging) === state.targetDigest, 'UPGRADE_MISMATCH', '新书库核对失败。');
        await moveStore(root, store, old, async dir => {
          requireStore(await sourceFingerprint(root, dir) === state.sourceDigest, 'UPGRADE_SOURCE_CHANGED', '升级期间旧书库发生了变化，请重新升级。');
        });
        before?.(state.stage, true);
        await advance('publish');
        break;
      case 'publish':
        await verifyBackup(root,state);
        await verifyMembers(root,await originalMembers(root,state),true);
        requireStore(await sourceFingerprint(root, old) === state.sourceDigest, 'UPGRADE_SOURCE_CHANGED', '旧书库核对失败。');
        await moveStore(root, staging, store, async dir => {
          requireStore((await readState(join(dir, originFile)))?.id === state.id && await sourceFingerprint(root, dir) === state.targetDigest,
            'UPGRADE_MISMATCH', '新书库核对失败。');
        });
        before?.(state.stage, true);
        await advance('record');
        break;
      case 'record': {
        await verifyBackup(root,state);
        await verifyMembers(root,await originalMembers(root,state),true);
        requireStore((await readState(join(store, originFile)))?.id === state.id && await sourceFingerprint(root,store) === state.targetDigest,
          'UPGRADE_MISMATCH', '当前书库与本次升级不一致。');
        await writeAtomic(join(store, originFile), JSON.stringify(state));
        await rm(journal(root));
        return { restored: false, message: state.comparison };
      }
      case 'return-old': {
        const original = existsSync(old) ? old : store;
        requireStore(await sourceFingerprint(root,original) === state.sourceDigest,'UPGRADE_SOURCE_CHANGED','保留的旧书库需要重新核对。');
        const expected = await originalMembers(root,state);
        const live = new Map((await readMembers(root)).map(member => [member.path,member]));
        const missing = expected.filter(member => !live.has(member.path));
        if (missing.length) {
          const area = await ensureCanonicalDataDirectory(root,'shell',basename(note),'restore');
          await extractReplacement(area,await verifyBackup(root,state),state.backup!.backup.sha256);
          await copyPayloads(root,incoming,new Set(missing.map(member => member.path)));
        }
        await verifyMembers(root,expected,false);
        await verifyFiles(root,database(original));
        if (existsSync(old)) {
          if (existsSync(store)) await rename(store,join(root,'shell','unpublished-new-'+randomUUID()));
          await moveStore(root,old,store,async dir => {
            requireStore(await sourceFingerprint(root,dir) === state.sourceDigest,'UPGRADE_SOURCE_CHANGED','旧书库核对失败。');
          });
        }
        if (existsSync(staging)) await rename(staging,join(root,'shell','unpublished-new-'+randomUUID()));
        await rm(journal(root));
        return {restored:true,message:'升级未完成，已核对并恢复升级前的书库。'};
      }
      case 'restore': {
        const backup = state.backup!;
        let ready = old;
        try {
          await verifyOld(root, state);
        } catch {
          const archive = await verifyBackup(root, state).catch(async error => {
            // Both sources are gone. Nothing has moved and the current library can still open.
            await rm(journal(root));
            throw error;
          });
          await requireRollbackSpace(root,state,true);
          const archiveRoot = join(note, 'restore');
          await ensureCanonicalDataDirectory(root, 'shell', basename(note), 'restore');
          const extracted = await extractReplacement(archiveRoot, archive, backup.backup.sha256);
          const json = JSON.stringify(extracted.manifest.members.filter(member => member.path !== DATABASE_PACKAGE_STORE_MEMBER));
          state.payloadManifestDigest = createHash('sha256').update(json).digest('hex');
          await writeAtomic(manifestFile(root,state),json);
          await verifyFiles(incoming, database(join(incoming, 'store')));
          ready = join(incoming, 'store');
          state.fallback = true;
        }
        if (!state.fallback) await requireRollbackSpace(root,state,false);
        await writeAtomic(join(ready, DATA_VERSION_MARKER_FILE), JSON.stringify({
          dataVersion: 1, schemaRevision: 116,
          softwareVersion: backup.fromSoftwareVersion ?? '0.7.4', writtenAt: new Date().toISOString()
        }));
        // Rebuild just this disposable copy if the previous attempt stopped during a file copy.
        const saved = join(store,'payloads');
        await rm(saved,{recursive:true,force:true});
        await ensureCanonicalDataDirectory(root,'store','payloads');
        let current = await readMembers(root);
        const prior = new Map((await originalMembers(root,state)).map(member => [member.path,member]));
        const missing = new Set<string>();
        await verifyCopiedPayloads(database(store),current,117,undefined,undefined,(path,digest,bytes) => {
          const available = prior.get(path);
          if (!state.fallback || available?.sha256 !== digest || available.bytes !== bytes) return false;
          missing.add(path);
          return true;
        });
        if (missing.size) {
          await copyPayloads(root,incoming,missing);
          current = await readMembers(root);
          await verifyCopiedPayloads(database(store),current,117);
        }
        await copyPayloads(saved,root,new Set(current.map(member => member.path)));
        await verifyMembers(saved,current,true);
        const json = JSON.stringify(current);
        state.currentManifestDigest = createHash('sha256').update(json).digest('hex');
        await writeAtomic(join(note,'current-files.json'),json);
        state.currentDigest = await sourceFingerprint(root,store);
        state.rollbackDigest = await sourceFingerprint(root, ready);
        await advance('save-new');
        break;
      }
      case 'save-new': {
        const ready = rollbackSource();
        const currentStore = existsSync(store) ? store : newer;
        const saved = join(currentStore,'payloads');
        const payloads = state.fallback ? incoming : saved;
        requireStore(await sourceFingerprint(root,ready) === state.rollbackDigest,'UPGRADE_MISMATCH','待恢复的旧书库已变化。');
        await verifyMembers(payloads,await originalMembers(root,state),state.fallback);
        const current = await currentMembers(note,state);
        await verifyMembers(saved,current,true);
        await verifyMembers(root,current,true);
        await moveStore(root,store,newer,async dir => {
          requireStore((await readState(join(dir,originFile)))?.id === state.id && await sourceFingerprint(root,dir) === state.currentDigest,
            'UPGRADE_MISMATCH','当前书库与本次回退不一致。');
        });
        before?.(state.stage, true);
        await advance('publish-old');
        break;
      }
      case 'publish-old': {
        const saved = join(newer,'payloads');
        const payloads = state.fallback ? incoming : saved;
        const expected = await originalMembers(root,state);
        await verifyMembers(saved,await currentMembers(note,state),true);
        await moveStore(root,rollbackSource(),store,async dir => {
          requireStore(await sourceFingerprint(root,dir) === state.rollbackDigest && storeRevisionOnDisk(database(dir)) === 116,
            'UPGRADE_MISMATCH','待发布的旧书库与恢复记录不一致。');
        });
        // A completed switch may replay after temporary extraction files were reclaimed.
        try { await verifyMembers(root,expected,true); }
        catch {
          await verifyMembers(payloads,expected,state.fallback);
          await installMembers(root,payloads,expected);
        }
        await verifyFiles(root,database(store));
        before?.(state.stage, true);
        if (state.fallback && existsSync(old)) await rename(old, join(root, 'shell', basename(old)));
        requireStore(storeRevisionOnDisk(database(store)) === 116, 'UPGRADE_STATE_INVALID', '旧数据库未能就位。');
        await rm(journal(root));
        // Keep the small manifests for journal replay when NTFS persists cleanup out of order.
        await rm(join(note,'restore'), { recursive: true, force: true }).catch(() => undefined);
        return { restored: true, message: '升级前的数据已就位，请使用上一版 AI7 打开。' };
      }
      case 'return-new': {
        // A rollback that could not finish restores the complete current library. This phase also resumes.
        const currentStore = existsSync(newer) ? newer : store;
        const current = await currentMembers(note,state);
        requireStore((await readState(join(currentStore,originFile)))?.id === state.id &&
          await sourceFingerprint(root,currentStore) === state.currentDigest,'UPGRADE_MISMATCH','当前书库核对失败。');
        await verifyMembers(join(currentStore,'payloads'),current,true);
        await verifyCopiedPayloads(database(currentStore),current,117);
        if (existsSync(store) && existsSync(newer)) {
          // Preserve even a damaged or replaced old directory outside the old exporter's scope.
          const destination = rollbackSource();
          const matches = !existsSync(destination) && (await sourceFingerprint(root,store).catch(() => null)) === state.rollbackDigest;
          await rename(store,matches ? destination : join(root,'shell','unpublished-old-'+randomUUID()));
        }
        await moveStore(root,newer,store,async dir => {
          requireStore((await readState(join(dir,originFile)))?.id === state.id && await sourceFingerprint(root,dir) === state.currentDigest,
            'UPGRADE_MISMATCH','当前书库核对失败。');
        });
        await installMembers(root,join(store,'payloads'),current);
        await rm(journal(root));
        return {restored:false,message:'回退未完成，已恢复升级后的书库。'};
      }
    }
  }
}
