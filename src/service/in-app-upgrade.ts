import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, open, rename, rm, statfs } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { requireBaselineSchema } from './baseline-schema.js';
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
  rollbackAttempt?: string;
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
  const missing = upgradeSpaceShortfall(size,packageBytes,newStoreBytes,dataFree,backupFree,dataInfo.dev === backupInfo.dev);
  requireStore(missing <= 0, 'UPGRADE_SPACE', `磁盘空间不足，还差 ${Math.ceil(missing / 1048576)} MB。释放空间后再升级。`);
}

export function upgradeSpaceShortfall(store: number, archive: number, converted: number, dataFree: number, backupFree: number, shared: boolean): number {
  const dataPeak = Math.max(converted,archive + store);
  return Math.ceil(shared ? archive + dataPeak - Math.min(dataFree,backupFree) : Math.max(dataPeak - dataFree,archive + store - backupFree));
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

async function requireRollbackSpace(root: string, state: UpgradeState, fallback: boolean, files: DatabasePackageMember[], repairBytes: number): Promise<void> {
  const db = await checkedStore(root,join(root,'store'));
  const sqlBytes = (await lstat(db)).size + (existsSync(db+'-wal') ? (await lstat(db+'-wal')).size : 0);
  const currentBytes = files.reduce((n,member) => n + member.bytes,sqlBytes + 2 * repairBytes);
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

async function backupMembers(root: string, state: UpgradeState): Promise<DatabasePackageMember[]> {
  const archive = await verifyBackup(root,state);
  const note = await ensureCanonicalDataDirectory(root,'shell','upgrade-'+state.id);
  const scratch = join(note,'archive-verification');
  await rm(scratch,{recursive:true,force:true});
  await ensureCanonicalDataDirectory(note,'archive-verification');
  const {manifest} = await verifyDatabasePackage(archive,{dataRoot:scratch,expectedSha256:state.backup!.backup.sha256})
    .finally(() => rm(scratch,{recursive:true,force:true}));
  const files = manifest.members.filter(member => member.path !== DATABASE_PACKAGE_STORE_MEMBER);
  state.backupStoreBytes = manifest.members.find(member => member.path === DATABASE_PACKAGE_STORE_MEMBER)!.bytes;
  state.backupPayloadBytes = files.reduce((total,member) => total + member.bytes,0);
  return files;
}

async function rememberMembers(root: string, state: UpgradeState): Promise<void> {
  const json = JSON.stringify(await backupMembers(root,state));
  state.payloadManifestDigest = createHash('sha256').update(json).digest('hex');
  await writeAtomic(manifestFile(root,state),json);
}

async function originalMembers(root: string, state: UpgradeState, rebuild = true): Promise<DatabasePackageMember[]> {
  const path = manifestFile(root,state);
  let json = await readSmallFile(path,MAX_MANIFEST_BYTES);
  if (json === null || createHash('sha256').update(json).digest('hex') !== state.payloadManifestDigest) {
    requireStore(rebuild,'UPGRADE_FILES_INVALID','升级前的文件清单需要从备份恢复。');
    const fromArchive = JSON.stringify(await backupMembers(root,state));
    requireStore(createHash('sha256').update(fromArchive).digest('hex') === state.payloadManifestDigest,
      'UPGRADE_FILES_INVALID','升级前的文件清单与备份不符。');
    await writeAtomic(path,fromArchive);
    json = fromArchive;
  }
  return JSON.parse(json);
}

async function verifyMembers(directory: string, expected: DatabasePackageMember[], exact: boolean): Promise<void> {
  const actual = new Map((await readMembers(directory)).map(member => [member.path, member]));
  requireStore((!exact || actual.size === expected.length) && expected.every(member => {
    const found = actual.get(member.path);
    return found?.sha256 === member.sha256 && found.bytes === member.bytes;
  }),'UPGRADE_FILES_INVALID','升级前的文件清单与实际文件不符。');
}

async function copyPayloads(root: string, incoming: string, include: Set<string>, note: string): Promise<void> {
  if (!include.size) return;
  const copyArea = await ensureCanonicalDataDirectory(note,'copies');
  const temp = (await inspectCanonicalDataFile(note,copyArea,'next-file.partial')).path;
  for (const src of await databasePackageSources(incoming)) {
    if (!include.has(src.member)) continue;
    const parts = src.member.split('/');
    const name = parts.pop()!;
    const dir = parts.length ? await ensureCanonicalDataDirectory(root, ...parts) : root;
    if (dir !== root) await inspectCanonicalDataFile(root, dir, name);
    const destination = join(dir, name);

    try {
      await copyFile(src.path, temp);
      const handle = await open(temp,'r+');
      try { await handle.sync(); } finally { await handle.close(); }
      await rename(temp, destination);
      await syncDirectory(dir);
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

async function verifyCurrentLibrary(root: string,dir: string,state: UpgradeState,files: DatabasePackageMember[]): Promise<void> {
  requireStore((await readState(join(dir,originFile)))?.id === state.id,'UPGRADE_MISMATCH','当前书库与升级记录不一致。');
  const sql = await checkedStore(root,dir);
  const db = openPackageStore(sql);
  try {
    requireBaselineSchema(db);
    requireStore(db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok' && !db.prepare('PRAGMA foreign_key_check').get(),
      'UPGRADE_MISMATCH','当前书库未通过完整性核对。');
  } finally { db.close(); }
  await verifyCopiedPayloads(sql,files,117);
}

async function liveCurrentIsComplete(root: string,state: UpgradeState): Promise<boolean> {
  try {
    const dir = join(root,'store');
    const files = await readMembers(root);
    if (state.currentManifestDigest && createHash('sha256').update(JSON.stringify(files)).digest('hex') !== state.currentManifestDigest) return false;
    if (state.currentDigest && await sourceFingerprint(root,dir) !== state.currentDigest) return false;
    await verifyCurrentLibrary(root,dir,state,files);
    return true;
  } catch { return false; }
}

// The service is stopped. Preserve the SQLite file and its committed WAL as one fingerprinted pair.
async function copyCurrentDatabase(root: string,from: string,to: string): Promise<void> {
  await checkedStore(root,from);
  for (const suffix of ['','-wal']) {
    const source = database(from)+suffix;
    const target = await inspectCanonicalDataFile(root,to,'ai7.sqlite'+suffix);
    if (!existsSync(source)) { await rm(target.path,{force:true}); continue; }
    await copyFile(source,target.path);
    const handle = await open(target.path,'r+');
    try { await handle.sync(); } finally { await handle.close(); }
  }
  await syncDirectory(to);
}

async function recoverCurrentDatabase(root: string,dir: string,note: string,state: UpgradeState): Promise<void> {
  if (await sourceFingerprint(root,dir).catch(() => null) === state.currentDigest) return;
  const spare = join(note,'current-database');
  requireStore(typeof state.currentDigest === 'string' && await sourceFingerprint(root,spare) === state.currentDigest &&
    (await readState(join(dir,originFile)))?.id === state.id,'UPGRADE_MISMATCH','无法核对保留的新版数据库。');
  const damaged = await ensureCanonicalDataDirectory(note,'damaged-sqlite-'+randomUUID());
  for (const suffix of ['','-wal','-shm','-journal']) {
    const found = await inspectCanonicalDataFile(root,dir,'ai7.sqlite'+suffix);
    if (found.exists) await rename(found.path,join(damaged,'ai7.sqlite'+suffix));
  }
  await copyCurrentDatabase(root,spare,dir);
  requireStore(await sourceFingerprint(root,dir) === state.currentDigest,'UPGRADE_MISMATCH','新版数据库恢复核对失败。');
}

export async function beginUpgrade(root: string): Promise<void> {
  await upgradePreflight(root);
  await ensureCanonicalDataDirectory(root, 'shell');
  requireStore(await readState(journal(root)) === null && !existsSync(join(root, 'store.upgrading')),
    'UPGRADE_STATE_INVALID', '已有升级等待继续。');
  const sourceDigest = await sourceFingerprint(root, join(root, 'store'));
  await writePhase(root, { id: Date.now() + '-' + randomUUID(), stage: 'backup', backup: null, comparison: '', fallback: false, sourceDigest });
}

async function verifyOld(root: string, state: UpgradeState, rebuild = true): Promise<string> {
  const old = join(root, 'store-before-0.8.0-' + state.id);
  requireStore(await sourceFingerprint(root, old) === state.sourceDigest, 'UPGRADE_SOURCE_CHANGED', '原书库已变化。');
  const path = database(old);
  const db = openPackageStore(path);
  try {
    requireUpgradeSource(db);
    requireStore(db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok', 'UPGRADE_FILES_INVALID', '旧数据库完整性核对失败。');
  } finally { db.close(); }
  const expected = await originalMembers(root,state,rebuild);
  await verifyMembers(root,expected,false);
  await verifyCopiedPayloads(path,expected,116);
  return old;
}

async function currentMembers(note: string,state: UpgradeState,snapshot: string): Promise<DatabasePackageMember[]> {
  const path = join(note,'current-files.json');
  let json = await readSmallFile(path,MAX_MANIFEST_BYTES);
  if (json === null || createHash('sha256').update(json).digest('hex') !== state.currentManifestDigest) {
    // The directory rename can survive without the manifest rename on Windows.
    json = JSON.stringify(await readMembers(snapshot));
    requireStore(createHash('sha256').update(json).digest('hex') === state.currentManifestDigest,
      'UPGRADE_FILES_INVALID','回退前的文件清单核对失败。');
    await writeAtomic(path,json);
  }
  return JSON.parse(json);
}

async function installMembers(root: string, source: string, expected: DatabasePackageMember[], note: string, preserved: DatabasePackageMember[]): Promise<void> {
  const wanted = new Map(expected.map(member => [member.path,member]));
  const stored = new Map(preserved.map(member => [member.path,member.sha256]));
  const needed = new Set(wanted.keys());
  const extras = [];
  const changed: DatabasePackageMember[] = [];
  for (const file of await databasePackageSources(root)) {
    const entry = wanted.get(file.member);
    const actual = await fileDigest(file.path);
    requireStore(actual !== null,'UPGRADE_FILES_INVALID','需要的数据文件缺失。');
    if (!entry) extras.push(file.path);
    else if (actual.sha256 === entry.sha256) needed.delete(file.member);
    if (actual.sha256 !== entry?.sha256 && actual.sha256 !== stored.get(file.member)) changed.push({path:file.member,...actual});
  }
  if (changed.length) {
    const retained = await ensureCanonicalDataDirectory(note,'changed-during-switch-'+randomUUID());
    await copyPayloads(retained,root,new Set(changed.map(member => member.path)),note);
    await verifyMembers(retained,changed,true);
  }
  await copyPayloads(root,source,needed,note);
  await verifyMembers(root,expected,false);
  // Every current file was independently copied and verified before any live path was touched.
  for (const extra of extras) await rm(extra);
  await verifyMembers(root,expected,true);
}

async function repairPayloads(root: string,note: string,incoming: string,live: DatabasePackageMember[],repair: Set<string>): Promise<void> {
  const damaged = live.filter(member => repair.has(member.path));
  if (damaged.length) {
    const retained = await ensureCanonicalDataDirectory(root,'shell',basename(note),'damaged-'+randomUUID());
    await copyPayloads(retained,root,new Set(damaged.map(member => member.path)),note);
    await verifyMembers(retained,damaged,true);
  }
  await copyPayloads(root,incoming,repair,note);
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
  await verifyOld(root, state, false).catch(() => verifyBackup(root, state));
  return state;
}

export async function beginUpgradeRollback(root: string): Promise<void> {
  const state = await checkUpgradeRollback(root);
  await writePhase(root, { ...state, stage: 'restore', rollbackAttempt: randomUUID() });
}

type UpgradeHook = (stage: Stage, afterRename?: boolean) => void;
export async function resumeUpgrade(root: string, softwareVersion: string, before?: UpgradeHook): Promise<{ restored: boolean; message: string } | null> {
  try {
    return await runUpgrade(root, softwareVersion, before);
  } catch (error) {
    const state = await readState(journal(root));
    const active = join(root,'store');
    // A verification refusal before publication releases the old library. A killed process leaves the journal to resume.
    if (state?.backup && !before && ['convert','verify','save-old','publish','record'].includes(state.stage)) {
      await writePhase(root,{...state,stage:'return-old'});
      await runUpgrade(root,softwareVersion);
    } else if (state && !before && state.stage === 'backup') {
      if (existsSync(active) && storeRevisionOnDisk(database(active)) === 116) {
        await rm(join(root,'shell','upgrade-'+state.id,'converted'),{recursive:true,force:true}).catch(() => undefined);
        await rm(journal(root));
      }
    }
    if (!before && state && ['restore','save-new','publish-old'].includes(state.stage)) {
      const newer = join(root,'shell','store-after-0.8.0-'+state.id);
      const live = !existsSync(newer) && existsSync(active) && await liveCurrentIsComplete(root,state);
      if (live) {
        await rm(journal(root),{force:true});
      } else if (state.currentDigest && (existsSync(newer) || state.stage === 'save-new')) {
        await writePhase(root,{...state,stage:'return-new'});
        await runUpgrade(root,softwareVersion);
      }
    }
    throw error;
  }
}

async function runUpgrade(root: string, softwareVersion: string, before?: UpgradeHook): Promise<{ restored: boolean; message: string } | null> {
  const state = await readState(journal(root));
  if (!state) return null;
  const store = join(root, 'store');
  const old = join(root, 'store-before-0.8.0-' + state.id);
  // 0.7.x excludes shell from exports. Its own packager cannot know a new set-aside directory name.
  const newer = join(root, 'shell', 'store-after-0.8.0-' + state.id);
  const note = join(root, 'shell', 'upgrade-' + state.id);
  // Both versions exclude shell from exports. Even a locked staging directory stays private to this attempt.
  const staging = join(note, 'converted');
  const archiveRoot = join(note,'restore');
  const extraction = replacementStagingFor(archiveRoot);
  const incoming = join(extraction,'incoming');
  await rm(join(note,'archive-verification'),{recursive:true,force:true});
  const rollbackSource = () => state.fallback ? join(incoming,'store') : old;
  const advance = async (stage: Stage) => {
    state.stage = stage;
    await writePhase(root,state);
  };
  if (state.stage === 'restore') {
    const currentStore = existsSync(newer) ? newer : store;
    const receipt = 'rollback-ready.json';
    for (const path of [join(currentStore,receipt),join(note,receipt)]) {
      const ready = await readState(path).catch(() => null);
      if (ready?.id !== state.id || ready.rollbackAttempt !== state.rollbackAttempt || ready.stage !== 'save-new') continue;
      Object.assign(state,ready);
      await advance(existsSync(newer) ? 'publish-old' : 'save-new');
      break;
    }
    if (state.stage === 'restore' && existsSync(newer)) {
      // Both receipt renames can be lost. An independent physical copy of SQLite and the actual payloads
      // identify a complete current library without assuming an old publication finished.
      state.currentDigest = await sourceFingerprint(root,newer);
      requireStore(await sourceFingerprint(root,join(note,'current-database')) === state.currentDigest,
        'UPGRADE_MISMATCH','保留的两份新版数据库不一致。');
      const files = await readMembers(join(newer,'payloads'));
      const json = JSON.stringify(files);
      const remembered = await readSmallFile(join(note,'current-files.json'),MAX_MANIFEST_BYTES);
      requireStore(remembered === json || JSON.stringify(await readMembers(root)) === json,'UPGRADE_FILES_INVALID','无法核对回退前的完整文件清单。');
      await verifyCurrentLibrary(root,newer,state,files);
      state.currentManifestDigest = createHash('sha256').update(json).digest('hex');
      await writeAtomic(join(note,'current-files.json'),json);
      await advance('return-new');
    }
  }
  if (['backup','convert','verify'].includes(state.stage) && existsSync(old)) {
    // A stale pre-switch journal can survive either forward rename. The conversion carries its own verified record.
    const candidate = existsSync(staging) ? staging : store;
    const ready = await readState(join(candidate,originFile));
    requireStore(ready?.id === state.id && ready.sourceDigest === state.sourceDigest && ready.backup !== null,
      'UPGRADE_MISMATCH','无法核对切换时保留的书库记录。');
    Object.assign(state,ready);
    await advance('publish');
  }
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
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
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
        await ensureCanonicalDataDirectory(root, 'shell', basename(note), 'converted');
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
        const repair = expected.filter(member => live.get(member.path)?.sha256 !== member.sha256);
        if (repair.length) {
          const area = await ensureCanonicalDataDirectory(root,'shell',basename(note),'restore');
          await extractReplacement(area,await verifyBackup(root,state),state.backup!.backup.sha256);
          await repairPayloads(root,note,incoming,[...live.values()],new Set(repair.map(member => member.path)));
        }
        await verifyMembers(root,expected,false);
        await verifyFiles(root,database(original));
        if (existsSync(old)) {
          if (existsSync(store)) await rename(store,join(root,'shell','unpublished-new-'+randomUUID()));
          await moveStore(root,old,store,async dir => {
            requireStore(await sourceFingerprint(root,dir) === state.sourceDigest,'UPGRADE_SOURCE_CHANGED','旧书库核对失败。');
          });
        }
        await rm(journal(root));
        for (const area of [staging,extraction,archiveRoot,join(note,'copies')]) await rm(area,{recursive:true,force:true}).catch(() => undefined);
        return {restored:true,message:'升级未完成，已核对并恢复升级前的书库。'};
      }
      case 'restore': {
        const backup = state.backup!;
        requireStore(!existsSync(newer) && (await readState(join(store,originFile)))?.id === state.id &&
          storeRevisionOnDisk(database(store)) === 117,'UPGRADE_MISMATCH','回退前的当前书库尚未就位。');
        const saved = join(store,'payloads');
        const prepared = join(note,'prepared-payloads');
        const previous = join(note,'previous-payloads');
        let current = await readMembers(root);
        const needed = new Map<string,{sha256:string;bytes:number}>();
        await verifyCopiedPayloads(database(store),current,117,undefined,undefined,(path,digest,bytes) => {
          needed.set(path,{sha256:digest,bytes});
          return true;
        });
        const repairBytes = [...needed.values()].reduce((total,file) => total + file.bytes,0);
        // Reclaim this attempt's unfinished bytes before estimating either direct or backup rollback.
        for (const area of [extraction,archiveRoot,join(note,'copies')]) await rm(area,{recursive:true,force:true});
        let ready = old;
        try {
          await verifyOld(root, state);
        } catch {
          const archive = await verifyBackup(root, state);
          await requireRollbackSpace(root,state,true,current,repairBytes);
          await ensureCanonicalDataDirectory(root, 'shell', basename(note), 'restore');
          const extracted = await extractReplacement(archiveRoot, archive, backup.backup.sha256);
          const json = JSON.stringify(extracted.manifest.members.filter(member => member.path !== DATABASE_PACKAGE_STORE_MEMBER));
          state.payloadManifestDigest = createHash('sha256').update(json).digest('hex');
          await writeAtomic(manifestFile(root,state),json);
          await verifyFiles(incoming, database(join(incoming, 'store')));
          ready = join(incoming, 'store');
          state.fallback = true;
        }
        if (!state.fallback) await requireRollbackSpace(root,state,false,current,repairBytes);
        await writeAtomic(join(ready, DATA_VERSION_MARKER_FILE), JSON.stringify({
          dataVersion: 1, schemaRevision: 116,
          softwareVersion: backup.fromSoftwareVersion ?? '0.7.4', writtenAt: new Date().toISOString()
        }));
        for (const source of [saved,previous,prepared,...(state.fallback ? [incoming] : [])]) {
          if (!needed.size || !existsSync(source)) continue;
          const repair = new Set<string>();
          for (const file of await readMembers(source)) {
            const want = needed.get(file.path);
            if (want?.sha256 !== file.sha256 || want.bytes !== file.bytes) continue;
            repair.add(file.path);
            needed.delete(file.path);
          }
          if (repair.size) {
            await repairPayloads(root,note,source,current,repair);
            current = await readMembers(root);
          }
        }
        await verifyCurrentLibrary(root,store,state,current);
        // Never discard the last copy of a 117-only object to start a retry.
        await rm(prepared,{recursive:true,force:true});
        await ensureCanonicalDataDirectory(note,'prepared-payloads');
        await copyPayloads(prepared,root,new Set(current.map(member => member.path)),note);
        await verifyMembers(prepared,current,true);
        if (existsSync(saved)) {
          await rm(previous,{recursive:true,force:true});
          await rename(saved,previous);
        }
        await rename(prepared,saved);
        const json = JSON.stringify(current);
        state.currentManifestDigest = createHash('sha256').update(json).digest('hex');
        await writeAtomic(join(note,'current-files.json'),json);
        state.currentDigest = await sourceFingerprint(root,store);
        const sqlCopy = await ensureCanonicalDataDirectory(note,'prepared-database');
        await copyCurrentDatabase(root,store,sqlCopy);
        requireStore(await sourceFingerprint(root,sqlCopy) === state.currentDigest,'UPGRADE_MISMATCH','回退前的数据库副本与原库不符。');
        await rm(join(note,'current-database'),{recursive:true,force:true});
        await rename(sqlCopy,join(note,'current-database'));
        state.rollbackDigest = await sourceFingerprint(root, ready);
        const receipt = JSON.stringify({...state,stage:'save-new'});
        await writeAtomic(join(store,'rollback-ready.json'),receipt);
        await writeAtomic(join(note,'rollback-ready.json'),receipt);
        await rm(previous,{recursive:true,force:true}).catch(() => undefined);
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
        const current = await currentMembers(note,state,saved);
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
        const current = await currentMembers(note,state,saved);
        await recoverCurrentDatabase(root,newer,note,state);
        await verifyMembers(saved,current,true);
        await verifyCurrentLibrary(root,newer,state,current);
        await moveStore(root,rollbackSource(),store,async dir => {
          requireStore(await sourceFingerprint(root,dir) === state.rollbackDigest && storeRevisionOnDisk(database(dir)) === 116,
            'UPGRADE_MISMATCH','待发布的旧书库与恢复记录不一致。');
        });
        // A completed switch may replay after temporary extraction files were reclaimed.
        try { await verifyMembers(root,expected,true); }
        catch {
          await verifyMembers(payloads,expected,state.fallback);
          await installMembers(root,payloads,expected,note,current);
        }
        await verifyFiles(root,database(store));
        before?.(state.stage, true);
        requireStore(await sourceFingerprint(root,newer) === state.currentDigest,'UPGRADE_MISMATCH','保留的新版数据库已变化。');
        await verifyMembers(saved,current,true);
        if (state.fallback && existsSync(old)) await rename(old, join(root, 'shell', basename(old)));
        requireStore(await sourceFingerprint(root,store) === state.rollbackDigest, 'UPGRADE_STATE_INVALID', '旧数据库未能就位。');
        await rm(journal(root));
        // Keep the small manifests for journal replay when NTFS persists cleanup out of order.
        for (const area of [extraction,archiveRoot,join(note,'copies')]) await rm(area, { recursive: true, force: true }).catch(() => undefined);
        return { restored: true, message: '升级前的数据已就位，请使用上一版 AI7 打开。' };
      }
      case 'return-new': {
        // A rollback that could not finish restores the complete current library. This phase also resumes.
        const currentStore = existsSync(newer) ? newer : store;
        if (!existsSync(newer) && await liveCurrentIsComplete(root,state)) {
          await rm(journal(root));
          return {restored:false,message:'回退未完成，已核对升级后的书库。'};
        }
        await recoverCurrentDatabase(root,currentStore,note,state);
        const current = await currentMembers(note,state,join(currentStore,'payloads'));
        requireStore((await readState(join(currentStore,originFile)))?.id === state.id &&
          await sourceFingerprint(root,currentStore) === state.currentDigest,'UPGRADE_MISMATCH','当前书库核对失败。');
        await verifyMembers(join(currentStore,'payloads'),current,true);
        await verifyCurrentLibrary(root,currentStore,state,current);
        if (existsSync(store) && existsSync(newer)) {
          // Preserve even a damaged or replaced old directory outside the old exporter's scope.
          const destination = rollbackSource();
          const matches = existsSync(dirname(destination)) && !existsSync(destination) &&
            (await sourceFingerprint(root,store).catch(() => null)) === state.rollbackDigest;
          await rename(store,matches ? destination : join(root,'shell','unpublished-old-'+randomUUID()));
        }
        await moveStore(root,newer,store,async dir => {
          requireStore((await readState(join(dir,originFile)))?.id === state.id && await sourceFingerprint(root,dir) === state.currentDigest,
            'UPGRADE_MISMATCH','当前书库核对失败。');
        });
        await installMembers(root,join(store,'payloads'),current,note,current);
        await verifyFiles(root,database(store));
        await rm(journal(root));
        return {restored:false,message:'回退未完成，已恢复升级后的书库。'};
      }
    }
  }
}
