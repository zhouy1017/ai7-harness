import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, open, rename, rm, statfs } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { requireBaselineSchema } from './baseline-schema.js';
import { canonicalJson } from './analysis/canonical.js';
import { isSoftwareVersion } from '../shared/build-identity.js';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile, isStorageFullError } from '../shared/data-root.js';
import {
  DATA_VERSION_MARKER_FILE, DataVersionLedger, readDataVersionMarker, readDataVersionMarkerText, readUpgrade, SCHEMA_REVISION_CLASSES,
  storeRevisionOnDisk, type DataVersionUpgrade
} from './data-version.js';
import { DATABASE_PACKAGE_STORE_MEMBER, databasePackageSources, openPackageStore, verifyCopiedPayloads, type DatabasePackageMember } from './database-exports.js';
import { MAX_DIRECTORY_BYTES, MAX_MANIFEST_BYTES, isDatabasePackageMember, readKnownPackageManifest, verifyDatabasePackage } from './database-package-reader.js';
import { extractReplacement, readSmallFile, replacementStagingFor, writeAtomic } from './database-replacement.js';
import { fileDigest } from './manuscript-export.js';
import { backupLocationFor, ensureBackupLocation } from './scheduled-backups.js';
import { requireStore } from './store-records.js';
import { backUpBeforeUpgrade, prepareUpgradeBackupAttempt, readPendingUpgrade } from './upgrade-backup.js';
import { convertUpgradeStore, requireUpgradeSource, verifyUpgradeStore } from './upgrade-store.js';

const stages = ['backup', 'convert', 'verify', 'save-old', 'publish', 'record', 'return-old', 'restore', 'save-new', 'publish-old', 'return-new'] as const;
type Stage = typeof stages[number];
interface UpgradeState {
  id: string;
  stage: Stage;
  softwareVersion?: string;
  backup: DataVersionUpgrade | null;
  comparison: string;
  fallback: boolean;
  sourceDigest: string;
  payloadManifestDigest?: string;
  targetDigest?: string;
  rollbackDigest?: string;
  currentDigest?: string;
  currentManifestDigest?: string;
  currentManifestEncoding?: 'export-order';
  rollbackAttempt?: string;
  inventoryFormat?: 1;
  rollbackStartFingerprint?: string;
  upgradeRecordId?: string;
  backupStoreBytes?: number;
  backupStoreDigest?: string;
  backupPayloadBytes?: number;
}
const journal = (root: string) => join(root, 'shell', 'storage-upgrade.json');
const originFile = 'upgrade-origin.json';
const database = (directory: string) => join(directory, 'ai7.sqlite');

async function readState(path: string): Promise<UpgradeState | null> {
  const raw = await readSmallFile(path, 16384);
  if (raw === null) return null;
  return parseState(raw);
}

function parseState(raw: string): UpgradeState {
  const state = JSON.parse(raw);
  requireStore(state && /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(state.id) &&
    stages.includes(state.stage) && (state.inventoryFormat === undefined || (state.inventoryFormat === 1 && typeof state.rollbackAttempt === 'string')) &&
    (isSoftwareVersion(state.softwareVersion) || (state.stage === 'backup' && state.softwareVersion === undefined)) &&
    /^[a-f0-9]{64}$/u.test(state.sourceDigest) && typeof state.fallback === 'boolean' && typeof state.comparison === 'string' &&
    (state.comparison === '' || /^升级前后均为 \d+ 本书、\d+ 份稿件、\d+ 条批注和 \d+ 份审阅报告。$/u.test(state.comparison)),
    'UPGRADE_STATE_INVALID', '上次升级的记录无法读取。');
  return { ...state, backup: state.backup === null ? null : readUpgrade(state.backup, 2) };
}

async function recoveryReceipt(path: string): Promise<UpgradeState | null> {
  const raw = await readSmallFile(path,16384);
  if (raw === null) return null;
  try { return parseState(raw); } catch { return null; }
}

function sameRollbackAttempt(receipt: UpgradeState,state: UpgradeState): boolean {
  return receipt.id === state.id && receipt.softwareVersion === state.softwareVersion &&
    receipt.rollbackAttempt === state.rollbackAttempt && receipt.stage === 'save-new';
}

function inventoryText(state: UpgradeState,files: DatabasePackageMember[],digest: string): string {
  if (state.inventoryFormat !== 1) return JSON.stringify(files);
  return JSON.stringify({upgradeId:state.id,rollbackAttempt:state.rollbackAttempt,sha256:digest,members:files});
}

// Match the export walk's component-by-component order and the member layout written by readMembers.
// A stored array can have a different order while still describing exactly the same exported files.
function packageInventoryJson(files: DatabasePackageMember[]): string {
  const entries = files.map(({path,bytes,sha256}) => ({key:path.replaceAll('/','\0'),member:{path,bytes,sha256}}));
  entries.sort((a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  return JSON.stringify(entries.map(entry => entry.member));
}

async function readInventory(path: string) {
  const text = await readSmallFile(path,MAX_MANIFEST_BYTES + 512);
  if (text === null) return null;
  let record;
  try { record = JSON.parse(text); } catch { return null; }
  const legacy = Array.isArray(record);
  if (!legacy && !Array.isArray(record?.members)) return null;
  const json = legacy ? text : JSON.stringify(record.members);
  const digest = createHash('sha256').update(json).digest('hex');
  return {record,json,digest,legacy,members:legacy ? record : record.members};
}

async function attemptManifest(directory: string,name: string,state: UpgradeState): Promise<string | null | undefined> {
  const bound = state.currentManifestDigest;
  // These files are published independently. A trusted content digest authenticates the member list
  // even if the adjacent receipt's rename did not persist or its directory belonged to an earlier attempt.
  const receipt = bound ? null : await recoveryReceipt(join(directory,'rollback-ready.json'));
  if (receipt && !sameRollbackAttempt(receipt,state)) return undefined;
  const inventory = await readInventory(join(directory,name));
  if (!inventory) return null;
  const {record,json,digest,legacy} = inventory;
  if (bound) {
    if (digest === bound) return json;
    if (!inventory.members.every(isDatabasePackageMember)) return null;
    const ordered = packageInventoryJson(inventory.members);
    return createHash('sha256').update(ordered).digest('hex') === bound ? ordered : null;
  }
  if (legacy || record.upgradeId !== state.id || record.rollbackAttempt !== state.rollbackAttempt) return undefined;
  return digest === record.sha256 && (!receipt?.currentManifestDigest || receipt.currentManifestDigest === digest) ? json : null;
}

async function checkedStore(root: string, dir: string): Promise<string> {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = await inspectCanonicalDataFile(root, dir, 'ai7.sqlite' + suffix);
    if (suffix === '') requireStore(file.exists, 'UPGRADE_STORE_MISSING', '没有找到待核对的数据库。');
  }
  return database(dir);
}

export async function upgradePreflight(root: string, freeBytes?: number) {
  const source = await checkedStore(root, join(root, 'store'));
  const marker = await readDataVersionMarker(root);
  requireStore(!marker || (marker.dataVersion === 1 && marker.schemaRevision === 116),
    'UPGRADE_SOURCE_INVALID', '旧数据的版本标记不一致。请先用 0.7.3 打开。');
  const db = openPackageStore(source);
  let counts: Record<'books' | 'manuscripts' | 'marks' | 'reports' | 'materials', number>;
  try {
    requireUpgradeSource(db);
    counts = db.prepare(`SELECT
      (SELECT count(*) FROM books) AS books,
      (SELECT count(*) FROM manuscripts) AS manuscripts,
      (SELECT count(*) FROM editorial_marks) AS marks,
      (SELECT count(*) FROM review_reports) AS reports,
      (SELECT count(*) FROM library_materials) AS materials`).get() as typeof counts;
  } finally { db.close(); }
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
  return counts;
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

async function requireRollbackSpace(root: string, state: UpgradeState, fallback: boolean, files: DatabasePackageMember[], repairBytes: number, oldOnlyBytes: number, freeDataBytes?: number): Promise<void> {
  const db = await checkedStore(root,join(root,'store'));
  const sqlBytes = (await lstat(db)).size + (existsSync(db+'-wal') ? (await lstat(db+'-wal')).size : 0);
  const currentBytes = files.reduce((n,member) => n + member.bytes,sqlBytes + 2 * repairBytes + oldOnlyBytes);
  const volume = await statfs(root);
  const peak = rollbackDataPeak(currentBytes,fallback ? {
    archive: state.backup!.backup.byteLength, store: state.backupStoreBytes!, files: state.backupPayloadBytes!
  } : undefined);
  const missing = peak - (freeDataBytes ?? volume.bavail * volume.bsize);
  requireStore(missing <= 0,'UPGRADE_SPACE',`回退的临时文件空间不足，还差 ${Math.ceil(missing / 1048576)} MB。`);
}

function manifestFile(root: string, state: UpgradeState): string {
  return join(root,'shell','upgrade-'+state.id,'payloads.json');
}

async function backupMembers(root: string, state: UpgradeState, verifyContents = true): Promise<DatabasePackageMember[]> {
  const archive = await verifyBackup(root,state);
  let manifest;
  if (verifyContents) {
    const note = await ensureCanonicalDataDirectory(root,'shell','upgrade-'+state.id);
    const scratch = join(note,'archive-verification');
    await rm(scratch,{recursive:true,force:true});
    await ensureCanonicalDataDirectory(note,'archive-verification');
    try { ({manifest} = await verifyDatabasePackage(archive,{dataRoot:scratch,expectedSha256:state.backup!.backup.sha256})); }
    finally { await rm(scratch,{recursive:true,force:true}); }
  } else manifest = await readKnownPackageManifest(archive,state.backup!.backup);
  const files = manifest.members.filter(member => member.path !== DATABASE_PACKAGE_STORE_MEMBER);
  const store = manifest.members.find(member => member.path === DATABASE_PACKAGE_STORE_MEMBER)!;
  state.backupStoreBytes = store.bytes;
  state.backupStoreDigest = createHash('sha256').update(store.sha256).digest('hex');
  state.backupPayloadBytes = files.reduce((total,member) => total + member.bytes,0);
  return files;
}

async function rememberMembers(root: string, state: UpgradeState): Promise<void> {
  const json = JSON.stringify(await backupMembers(root,state));
  state.payloadManifestDigest = createHash('sha256').update(json).digest('hex');
  await writeAtomic(manifestFile(root,state),json);
}

async function originalMembers(root: string, state: UpgradeState, rebuild = true, beforeCache?: (files: DatabasePackageMember[]) => Promise<void>): Promise<DatabasePackageMember[]> {
  const path = manifestFile(root,state);
  let json = await readSmallFile(path,MAX_MANIFEST_BYTES).catch(() => null);
  const cached = json !== null && createHash('sha256').update(json).digest('hex') === state.payloadManifestDigest;
  if (!cached) {
    requireStore(rebuild,'UPGRADE_FILES_INVALID','升级前的文件清单需要从备份恢复。');
    const incoming = join(replacementStagingFor(join(dirname(path),'restore')),'incoming');
    json = existsSync(incoming) ? canonicalJson(await readMembers(incoming)) : null;
    if (json === null || createHash('sha256').update(json).digest('hex') !== state.payloadManifestDigest)
      json = JSON.stringify(await backupMembers(root,state,false));
    requireStore(createHash('sha256').update(json).digest('hex') === state.payloadManifestDigest,
      'UPGRADE_FILES_INVALID','升级前的文件清单与备份不符。');
  }
  const files: DatabasePackageMember[] = JSON.parse(json!);
  await beforeCache?.(files);
  if (!cached) await writeAtomic(path,json!);
  return files;
}

async function verifyMembers(directory: string, expected: DatabasePackageMember[], exact: boolean): Promise<void> {
  const actual = new Map((await readMembers(directory)).map(member => [member.path, member]));
  requireStore((!exact || actual.size === expected.length) && expected.every(member => {
    const found = actual.get(member.path);
    return found?.sha256 === member.sha256 && found.bytes === member.bytes;
  }),'UPGRADE_FILES_INVALID','升级前的文件清单与实际文件不符。');
}

async function collectMembers(expected: DatabasePackageMember[],sources: string[],copy?: {root:string;note:string}): Promise<void> {
  const needed = new Map(expected.map(member => [member.path,member]));
  for (const source of sources) {
    if (!needed.size || !existsSync(source)) continue;
    const verified = new Set<string>();
    for (const file of await databasePackageSources(source)) {
      const want = needed.get(file.member);
      if (!want || file.bytes !== want.bytes || (await fileDigest(file.path))?.sha256 !== want.sha256) continue;
      needed.delete(file.member);
      verified.add(file.member);
    }
    if (copy && source !== copy.root) await copyPayloads(copy.root,source,verified,copy.note);
  }
  requireStore(!needed.size,'UPGRADE_FILES_INVALID','各份书库中仍有文件与核对清单不符。');
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

async function verifyCurrentIdentity(root: string,dir: string,state?: UpgradeState): Promise<void> {
  if (state) requireStore((await readState(join(dir,originFile)))?.id === state.id,'UPGRADE_MISMATCH','当前书库与升级记录不一致。');
  const marker = readDataVersionMarkerText(await readSmallFile(join(dir,DATA_VERSION_MARKER_FILE),4096) ?? '');
  requireStore(marker.dataVersion === 2 && marker.schemaRevision === 117,'UPGRADE_MISMATCH','新版书库的启动标记不一致。');
  const sql = await checkedStore(root,dir);
  const db = openPackageStore(sql);
  try {
    requireBaselineSchema(db);
    requireStore(db.prepare('PRAGMA user_version').get()?.user_version === 117,'UPGRADE_MISMATCH','数据库修订号与新版标记不一致。');
    const ledger = new DataVersionLedger(db).standing();
    requireStore(ledger.latest?.dataVersion === 2 && ledger.latest.schemaRevision === 117,'UPGRADE_MISMATCH','新版数据库的版本记录不一致。');
    if (state) {
      const matching = ledger.upgrades.filter(entry => entry.upgrade && canonicalJson(entry.upgrade) === canonicalJson(state.backup));
      requireStore(matching.length === 1 && (!state.upgradeRecordId || matching[0]!.recordId === state.upgradeRecordId),
        'UPGRADE_MISMATCH','新版数据库的升级记录与保留的书库不一致。');
      state.upgradeRecordId = matching[0]!.recordId;
    }
    requireStore(db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok' && !db.prepare('PRAGMA foreign_key_check').get(),
      'UPGRADE_MISMATCH','当前书库未通过完整性核对。');
  } finally { db.close(); }
}

async function verifyCurrentLibrary(root: string,dir: string,state: UpgradeState,files: DatabasePackageMember[]): Promise<void> {
  await verifyCurrentIdentity(root,dir,state);
  await verifyCopiedPayloads(database(dir),files,117);
}

function rollbackInventoryFingerprint(store: string,files: Iterable<DatabasePackageMember>): string {
  const members = [...files].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return createHash('sha256').update(canonicalJson({store,members})).digest('hex');
}

async function rollbackStartFingerprint(root: string): Promise<string> {
  const store = join(root,'store');
  const files = await readMembers(root);
  const intended = new Map(files.map(file => [file.path,file]));
  // Repairs to 117 references during preparation must reproduce the same starting inventory.
  await verifyCopiedPayloads(database(store),files,117,undefined,undefined,(path,sha256,bytes) => {
    intended.set(path,{path,sha256,bytes}); return true;
  });
  return rollbackInventoryFingerprint(await sourceFingerprint(root,store),intended.values());
}

async function canPrepareRollback(root: string,state: UpgradeState): Promise<boolean> {
  if (state.rollbackStartFingerprint) {
    try {
      await verifyCurrentIdentity(root,join(root,'store'),state);
      return await rollbackStartFingerprint(root) === state.rollbackStartFingerprint;
    } catch { return false; }
  }
  const note = join(root,'shell','upgrade-'+state.id);
  const retained = [join(root,'store','payloads'),join(root,'store','rollback-ready.json'),join(note,'rollback-ready.json'),
    join(note,'current-files.json'),join(note,'previous-payloads'),
    join(note,'prepared-payloads'),...independentDirectories(note)];
  // An old restore journal can survive both directory moves. The live files may still be from 116.
  return !retained.some(path => existsSync(path));
}

async function differentOpenableLibrary(root: string,state: UpgradeState): Promise<boolean> {
  const dir = join(root,'store');
  try {
    await verifyCurrentIdentity(root,dir);
    const db = openPackageStore(database(dir));
    try {
      if (new DataVersionLedger(db).standing().upgrades.some(entry => entry.upgrade && canonicalJson(entry.upgrade) === canonicalJson(state.backup))) return false;
    } finally { db.close(); }
    await verifyFiles(root,database(dir));
    return true;
  } catch { return false; }
}

async function liveCurrentIsComplete(root: string,state: UpgradeState): Promise<boolean> {
  if (!state.currentDigest || !state.currentManifestDigest) return false;
  try {
    const dir = join(root,'store');
    const files = await readMembers(root);
    // Older recoveries could bind a differently ordered spelling of this same inventory.
    // The joint commitment proves every live byte directly, including the SQLite/WAL identity checked below.
    if (state.rollbackStartFingerprint) {
      if (rollbackInventoryFingerprint(state.currentDigest,files) !== state.rollbackStartFingerprint) return false;
    } else if (createHash('sha256').update(JSON.stringify(files)).digest('hex') !== state.currentManifestDigest) return false;
    if (await sourceFingerprint(root,dir) !== state.currentDigest) return false;
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

function independentDirectories(note: string): string[] {
  return [join(note,'current-database'),join(note,'prepared-database')];
}

async function bindRollbackStart(root: string,store: string,note: string,state: UpgradeState): Promise<void> {
  const copies = independentDirectories(note);
  const databases = new Set<string>();
  for (const dir of [store,...copies]) {
    const digest = await sourceFingerprint(root,dir).catch(() => null);
    if (digest && (!state.currentDigest || state.currentDigest === digest)) databases.add(digest);
  }
  const inventories: Array<() => Promise<{members:unknown[]} | null>> =
    [join(note,'current-files.json'),...copies.map(dir => join(dir,'files.json'))].map(path => () => readInventory(path));
  for (const dir of [join(store,'payloads'),root]) inventories.push(async () => ({members:await readMembers(dir)}));
  let unreadable: unknown;
  for (const read of inventories) {
    const candidate = await read().catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') unreadable = error;
      return null;
    });
    if (!candidate || !candidate.members.every(isDatabasePackageMember)) continue;
    const manifestDigest = createHash('sha256').update(packageInventoryJson(candidate.members)).digest('hex');
    if (state.currentManifestEncoding && state.currentManifestDigest && state.currentManifestDigest !== manifestDigest) continue;
    for (const digest of databases) {
      if (rollbackInventoryFingerprint(digest,candidate.members) !== state.rollbackStartFingerprint) continue;
      // This pair matches consent even if the independent renames left either half beside an old receipt.
      // The caller still verifies the database identity, references and every physical member before publishing.
      state.currentDigest = digest;
      state.currentManifestDigest = manifestDigest;
      state.currentManifestEncoding = 'export-order';
      return;
    }
  }
  if (unreadable) throw unreadable;
  requireStore(false,'UPGRADE_MISMATCH','保存的数据库与完整文件清单无法共同核对回退开始时的书库。');
}

async function databaseCopyAtDigest(root: string,state: UpgradeState,expected: string,locations: string[]): Promise<string> {
  for (const dir of locations) {
    try {
      if (await sourceFingerprint(root,dir) !== expected) continue;
      await verifyCurrentIdentity(root,dir,state);
      return dir;
    } catch { /* The other physical spelling may contain the verified copy. */ }
  }
  requireStore(false,'UPGRADE_MISMATCH','无法核对本次回退保留的新版数据库副本。');
}

async function independentDatabase(root: string,note: string,state: UpgradeState,parkedDigest: string | null) {
  const locations = independentDirectories(note);
  const eligible: string[] = [];
  const proofs: UpgradeState[] = [];
  let unreadable: unknown;
  for (const dir of locations) {
    let proof;
    try { proof = await recoveryReceipt(join(dir,'rollback-ready.json')); }
    catch (error) { unreadable = error; continue; }
    if (proof && !sameRollbackAttempt(proof,state)) continue;
    eligible.push(dir);
    if (proof) proofs.push(proof);
  }
  const matching = proofs[0] ?? null;
  const boundDigest = state.currentDigest ?? matching?.currentDigest;
  if (unreadable && !boundDigest) throw unreadable;
  const expected = boundDigest ?? parkedDigest;
  requireStore(expected && proofs.every(proof => proof.currentDigest === expected &&
    proof.currentManifestDigest === matching?.currentManifestDigest && proof.rollbackDigest === matching?.rollbackDigest),
    'UPGRADE_MISMATCH','本次回退的数据库回执不一致。');
  // A prior attempt's database bytes can match this commitment exactly without its file inventory belonging to this attempt.
  const dir = await databaseCopyAtDigest(root,state,expected,boundDigest ? locations : eligible);
  return {dir,digest:expected,proof:matching};
}

async function recoverCurrentDatabase(root: string,dir: string,note: string,state: UpgradeState): Promise<void> {
  const intact = await sourceFingerprint(root,dir).catch(() => null) === state.currentDigest;
  if (intact && await verifyCurrentIdentity(root,dir,state).then(() => true,() => false)) return;
  requireStore(typeof state.currentDigest === 'string' &&
    (intact || (await readState(join(dir,originFile)))?.id === state.id),'UPGRADE_MISMATCH','无法核对保留的新版数据库。');
  const spare = await databaseCopyAtDigest(root,state,state.currentDigest,independentDirectories(note));
  const damaged = await ensureCanonicalDataDirectory(note,'damaged-sqlite-'+randomUUID());
  if (!intact) {
    for (const suffix of ['','-wal','-shm','-journal']) {
      const found = await inspectCanonicalDataFile(root,dir,'ai7.sqlite'+suffix);
      if (found.exists) await rename(found.path,join(damaged,'ai7.sqlite'+suffix));
    }
    await copyCurrentDatabase(root,spare,dir);
  }
  for (const name of [originFile,DATA_VERSION_MARKER_FILE]) {
    const found = await inspectCanonicalDataFile(root,dir,name);
    if (found.exists) await copyFile(found.path,join(damaged,name));
    await writeAtomic(found.path,(await readSmallFile(join(spare,name),16384))!);
  }
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
  const old = keptOldStore(root, state);
  const digest = await sourceFingerprint(root,old);
  requireStore(digest === state.sourceDigest || digest === state.backupStoreDigest, 'UPGRADE_SOURCE_CHANGED', '原书库已变化。');
  const path = database(old);
  const db = openPackageStore(path);
  try {
    requireUpgradeSource(db);
    requireStore(db.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok', 'UPGRADE_FILES_INVALID', '旧数据库完整性核对失败。');
  } finally { db.close(); }
  const expected = await originalMembers(root,state,rebuild);
  const note = join(root,'shell','upgrade-'+state.id);
  await collectMembers(expected,[root,join(root,'store','payloads'),join(note,'old-payloads'),join(note,'previous-payloads'),join(note,'prepared-payloads'),
    join(replacementStagingFor(join(note,'restore')),'incoming')]);
  await verifyCopiedPayloads(path,expected,116);
  return old;
}

async function verifyExtractedBackup(root: string,state: UpgradeState,incoming: string): Promise<void> {
  const dir = join(incoming,'store');
  const digest = await sourceFingerprint(root,dir);
  requireStore(digest === state.backupStoreDigest || digest === state.sourceDigest,'UPGRADE_MISMATCH','解出的旧书库与备份不符。');
  const files = await readMembers(incoming);
  requireStore(createHash('sha256').update(canonicalJson(files)).digest('hex') === state.payloadManifestDigest,
    'UPGRADE_FILES_INVALID','解出的旧文件与备份清单不符。');
  const db = openPackageStore(database(dir));
  try { requireUpgradeSource(db); } finally { db.close(); }
  await verifyCopiedPayloads(database(dir),files,116);
}

async function currentMembers(root: string,note: string,state: UpgradeState,snapshot: string,recovery?: {database: string; verify: (files: DatabasePackageMember[]) => Promise<void>}): Promise<DatabasePackageMember[]> {
  const path = join(note,'current-files.json');
  const bound = state.currentManifestDigest;
  requireStore(bound || (state.inventoryFormat === 1 && recovery),'UPGRADE_FILES_INVALID','缺少证明旧格式文件清单属于本次回退的摘要。');
  const recorded = await attemptManifest(note,'current-files.json',state).catch(error => {
    if (!bound) throw error;
    return undefined;
  });
  const sealed = independentDirectories(note).map(dir => () => attemptManifest(dir,'files.json',state));
  const remembered = async () => recorded;
  const manifests = [remembered,...sealed];
  const candidates = [...manifests,...(bound ? [snapshot,root] : [snapshot]).map(dir => async () => JSON.stringify(await readMembers(dir)))];
  const agreed = new Map<string,string>();
  const identifiedFiles = new Map<string,string>();
  let verifiedInventory = false;
  let selected: {json: string; digest: string; files: DatabasePackageMember[]} | undefined;
  for (const read of candidates) {
    const json = await read().catch(error => {
      if (bound || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if (json === null || json === undefined) continue;
    const digest = createHash('sha256').update(json).digest('hex');
    if (bound && digest !== bound) continue;
    let files: unknown;
    try { files = JSON.parse(json); } catch { continue; }
    if (!Array.isArray(files) || !files.every(isDatabasePackageMember) ||
      files.some(file => file.path === DATABASE_PACKAGE_STORE_MEMBER) || new Set(files.map(file => file.path.toLowerCase())).size !== files.length) continue;
    if (!bound) {
      requireStore(recovery,'UPGRADE_FILES_INVALID','缺少可核对的文件清单。');
      // Every surviving member of the parked 117 copy is evidence, even when that copy is incomplete.
      for (const file of files) {
        const earlier = agreed.get(file.path);
        requireStore(earlier === undefined || earlier === file.sha256,'UPGRADE_FILES_INVALID','各份新版清单记载的文件内容不一致。');
        agreed.set(file.path,file.sha256);
      }
    }
    if (recovery) {
      try { await recovery.verify(files); }
      catch (error) {
        if (isStorageFullError(error)) throw error;
        continue;
      }
    }
    if (bound) { selected = {json,digest,files}; break; }
    if (manifests.includes(read)) {
      verifiedInventory = true;
      for (const file of files) identifiedFiles.set(file.path,file.sha256);
    }
    if (!selected || files.length > selected.files.length) selected = {json,digest,files};
  }
  requireStore(selected && (bound || (verifiedInventory && selected.files.length === agreed.size)),'UPGRADE_FILES_INVALID','回退前的完整文件清单核对失败。');
  if (state.currentDigest && state.rollbackStartFingerprint) {
    requireStore(rollbackInventoryFingerprint(state.currentDigest,selected.files) === state.rollbackStartFingerprint,
      'UPGRADE_MISMATCH','数据库与完整文件清单和回退开始时的记录不一致。');
  }
  if (!bound) {
    const parked = existsSync(snapshot) ? await readMembers(snapshot) : [];
    const current = new Map(parked.map(file => [file.path,file.sha256]));
    // Both written inventories identify their rollback attempt in the same record as their members.
    for (const [path,digest] of identifiedFiles) current.set(path,digest);
    await verifyCopiedPayloads(database(recovery!.database),parked,117,undefined,undefined,(path,digest) => {
      current.set(path,digest); return true;
    });
    requireStore(selected.files.every(file => current.get(file.path) === file.sha256),'UPGRADE_FILES_INVALID','无法确认所有文件属于回退前的新版书库。');
    // Once 116 is published, its files cannot define what 117 kept. Explain any other live bytes
    // using the verified original inventory, or stop before touching either library.
    const liveOnly = (await readMembers(root)).filter(file => agreed.get(file.path) !== file.sha256);
    if (liveOnly.length) {
      const active = await sourceFingerprint(root,join(root,'store')).catch(() => null);
      requireStore(active && [state.sourceDigest,state.backupStoreDigest,state.rollbackDigest].includes(active),
        'UPGRADE_FILES_INVALID','无法确认在线文件属于已发布的旧书库。');
      const old = new Map((await originalMembers(root,state)).map(file => [file.path,file.sha256]));
      requireStore(liveOnly.every(file => old.get(file.path) === file.sha256),'UPGRADE_FILES_INVALID','在线文件与旧书库的记录不符。');
      // An absent path is indistinguishable from the same omission in shortened 117 records.
      // Only a bound inventory may remove an otherwise unexplained file from the live export root.
      requireStore(liveOnly.every(file => agreed.has(file.path)),'UPGRADE_FILES_INVALID','缺少确认新版已移除旧文件所需的清单摘要。');
    }
  }
  if (selected.json !== recorded && recorded !== undefined) await writeAtomic(path,inventoryText(state,selected.files,selected.digest));
  state.currentManifestDigest = selected.digest;
  return selected.files;
}

async function installMembers(root: string, sources: string[], expected: DatabasePackageMember[], note: string, preserved: DatabasePackageMember[]): Promise<void> {
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
  await collectMembers(expected.filter(member => needed.has(member.path)),sources,{root,note});
  await verifyMembers(root,expected,false);
  // Every current file was independently copied and verified before any live path was touched.
  for (const extra of extras) await rm(extra);
  await verifyMembers(root,expected,true);
}

async function withRecoverySources(root: string,saved: string,note: string,state: UpgradeState,use: (sources: string[]) => Promise<void>): Promise<void> {
  const sources = [saved,root,join(note,'old-payloads'),join(note,'previous-payloads'),join(note,'prepared-payloads'),join(replacementStagingFor(join(note,'restore')),'incoming')];
  try { await use(sources); }
  catch (error) {
    if ((error as {code?:string}).code !== 'UPGRADE_FILES_INVALID') throw error;
    const archive = await verifyBackup(root,state);
    const area = await ensureCanonicalDataDirectory(note,'recover-files');
    const extraction = replacementStagingFor(area);
    await extractReplacement(area,archive,state.backup!.backup.sha256);
    try { await use([...sources,join(extraction,'incoming')]); }
    finally { for (const path of [extraction,area]) await rm(path,{recursive:true,force:true}); }
  }
}

async function reconcileSavedFiles(root: string,dir: string,note: string,state: UpgradeState,current: DatabasePackageMember[]): Promise<void> {
  const saved = await ensureCanonicalDataDirectory(dir,'payloads');
  try { await verifyMembers(saved,current,true); return; } catch { /* reconcile from verified members below */ }
  await withRecoverySources(root,saved,note,state,sources => installMembers(saved,sources,current,note,[]));
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

const keptOldStore = (root: string, state: UpgradeState) => join(root, `store-before-${state.softwareVersion}-${state.id}`);
// Older AI7 excludes shell from exports, including the newer store parked by rollback.
const parkedNewStore = (root: string, state: UpgradeState) => join(root, 'shell', `store-after-${state.softwareVersion}-${state.id}`);

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
  await verifyCurrentIdentity(root,join(root,'store'),state);
  try { await verifyOld(root,state,false); }
  catch {
    const incoming = join(replacementStagingFor(join(dirname(manifestFile(root,state)),'restore')),'incoming');
    if (existsSync(join(incoming,'store'))) {
      try { await verifyExtractedBackup(root,state,incoming); return state; }
      catch (error) { if (isStorageFullError(error)) throw error; }
    }
    await verifyBackup(root,state);
  }
  return state;
}

export async function beginUpgradeRollback(root: string): Promise<void> {
  const state = await checkUpgradeRollback(root);
  await writePhase(root, { ...state, stage: 'restore', rollbackAttempt: randomUUID(), inventoryFormat:1,
    rollbackStartFingerprint:await rollbackStartFingerprint(root) });
}

type UpgradeHook = (stage: Stage, afterRename?: boolean) => void;
export async function resumeUpgrade(root: string, softwareVersion: string, before?: UpgradeHook, freeDataBytes?: number, onStage?: (stage: Stage) => void): Promise<{ restored: boolean; message: string } | null> {
  try {
    return await runUpgrade(root, softwareVersion, before, freeDataBytes, onStage);
  } catch (error) {
    if ((error as {code?:string})?.code === 'UPGRADE_SPACE') throw error;
    requireStore(!isStorageFullError(error),'UPGRADE_SPACE','磁盘空间不足。释放空间后重新打开 AI7 即可继续。');
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
      const newer = parkedNewStore(root, state);
      const live = !existsSync(newer) && existsSync(active) && await liveCurrentIsComplete(root,state);
      if (live) {
        await rm(journal(root),{force:true});
      } else if (!existsSync(newer) && state.stage === 'restore' && !state.currentDigest && await canPrepareRollback(root,state)) {
        // Nothing switched. An independently openable library can be released even if it belongs to another upgrade.
        await verifyCurrentIdentity(root,active);
        await verifyFiles(root,database(active));
        await rm(journal(root),{force:true});
      } else if (state.currentDigest && (existsSync(newer) || state.stage === 'save-new')) {
        await writePhase(root,{...state,stage:'return-new'});
        await runUpgrade(root,softwareVersion);
      }
    }
    throw error;
  }
}

async function runUpgrade(root: string, softwareVersion: string, before?: UpgradeHook, freeDataBytes?: number, onStage?: (stage: Stage) => void): Promise<{ restored: boolean; message: string } | null> {
  const state = await readState(journal(root));
  if (!state) return null;
  if (state.softwareVersion === undefined) {
    requireStore(isSoftwareVersion(softwareVersion), 'UPGRADE_STATE_INVALID', '无法确认本次升级的软件版本。');
    state.softwareVersion = softwareVersion;
    await writePhase(root, state);
  }
  const store = join(root, 'store');
  const old = keptOldStore(root, state);
  const newer = parkedNewStore(root, state);
  const note = join(root, 'shell', 'upgrade-' + state.id);
  // Both versions exclude shell from exports. Even a locked staging directory stays private to this attempt.
  const staging = join(note, 'converted');
  const archiveRoot = join(note,'restore');
  const legacyFiles = join(note,'old-payloads');
  const extraction = replacementStagingFor(archiveRoot);
  const incoming = join(extraction,'incoming');
  for (const scratch of [join(note,'archive-verification'),join(note,'recover-files'),replacementStagingFor(join(note,'recover-files'))]) {
    await rm(scratch,{recursive:true,force:true});
  }
  const rollbackSource = () => state.fallback ? join(incoming,'store') : old;
  const advance = async (stage: Stage) => {
    state.stage = stage;
    await writePhase(root,state);
  };
  if (state.stage === 'restore') {
    const currentStore = existsSync(newer) ? newer : store;
    const receipt = 'rollback-ready.json';
    const paths = [join(currentStore,receipt),join(note,receipt)];
    if (!existsSync(newer)) paths.push(join(note,'prepared-database',receipt),join(note,'current-database',receipt));
    for (const path of paths) {
      const ready = await recoveryReceipt(path);
      if (!ready || !sameRollbackAttempt(ready,state)) continue;
      Object.assign(state,ready);
      if (existsSync(newer)) await advance('publish-old');
      else await advance(await liveCurrentIsComplete(root,state) ? 'save-new' : 'return-new');
      break;
    }
  }
  const ambiguousRestore = state.stage === 'restore' && !existsSync(newer) && !await canPrepareRollback(root,state);
  if (ambiguousRestore && await differentOpenableLibrary(root,state)) {
    await rm(journal(root));
    requireStore(false,'UPGRADE_MISMATCH','当前书库与本次回退记录不一致。');
  }
  // Earlier interrupted recoveries hashed the array in the order it happened to be read.
  // Rebind only from the exact database and members committed together at rollback consent.
  const needsCommitment = () => !state.currentDigest || !state.currentManifestDigest ||
    (state.rollbackStartFingerprint && state.currentManifestEncoding !== 'export-order');
  if ((state.stage === 'restore' && (existsSync(newer) || ambiguousRestore)) ||
      (state.stage === 'return-new' && needsCommitment())) {
    // The 117 directory may already be back on line while the exported files still belong to 116.
    const currentStore = existsSync(newer) ? newer : store;
    if ((state.stage === 'return-new' || state.rollbackStartFingerprint) && (!state.currentDigest || !state.currentManifestDigest)) {
      let unreadable: unknown;
      for (const dir of [currentStore,note,...independentDirectories(note)]) {
        let ready;
        try { ready = await recoveryReceipt(join(dir,'rollback-ready.json')); }
        catch (error) { unreadable = error; continue; }
        if (!ready || !sameRollbackAttempt(ready,state) || !ready.currentDigest || !ready.currentManifestDigest) continue;
        requireStore((!state.currentDigest || ready.currentDigest === state.currentDigest) &&
          (!state.currentManifestDigest || ready.currentManifestDigest === state.currentManifestDigest),
          'UPGRADE_MISMATCH','回退前的书库回执不一致。');
        state.currentDigest ??= ready.currentDigest;
        state.currentManifestDigest ??= ready.currentManifestDigest;
        if (ready.currentManifestEncoding === 'export-order') state.currentManifestEncoding = ready.currentManifestEncoding;
        if (!state.rollbackDigest && ready.rollbackDigest) {
          state.rollbackDigest = ready.rollbackDigest;
          state.fallback = ready.fallback;
        }
        break;
      }
      if (unreadable && !state.rollbackStartFingerprint && (!state.currentDigest || !state.currentManifestDigest)) throw unreadable;
    }
    if (state.rollbackStartFingerprint && needsCommitment()) {
      await bindRollbackStart(root,currentStore,note,state);
    }
    const liveDigest = await sourceFingerprint(root,currentStore).catch(() => null);
    const spare = state.currentDigest && (state.stage === 'return-new' || state.currentManifestDigest)
      ? {dir:await databaseCopyAtDigest(root,state,state.currentDigest,[currentStore,...independentDirectories(note)]),digest:state.currentDigest,proof:null}
      : await independentDatabase(root,note,state,liveDigest);
    state.currentDigest = spare.digest;
    if (!state.currentManifestDigest && spare.proof?.currentManifestDigest) state.currentManifestDigest = spare.proof.currentManifestDigest;
    if (spare.proof?.rollbackDigest) {
      state.rollbackDigest = spare.proof.rollbackDigest;
      state.fallback = spare.proof.fallback;
    }
    const authenticate = async (expected: DatabasePackageMember[]) => {
      await verifyCurrentLibrary(root,spare.dir,state,expected);
      await withRecoverySources(root,join(currentStore,'payloads'),note,state,sources => collectMembers(expected,sources));
    };
    await currentMembers(root,note,state,join(currentStore,'payloads'),{database:spare.dir,verify:authenticate});
    // Commit the independently established identity before attempting any filesystem repair.
    await advance('return-new');
  }
  if (['backup','convert','verify'].includes(state.stage) && existsSync(old)) {
    // A stale pre-switch journal can survive either forward rename. The conversion carries its own verified record.
    const candidate = existsSync(staging) ? staging : store;
    const ready = await readState(join(candidate,originFile));
    requireStore(ready?.id === state.id && ready.softwareVersion === state.softwareVersion && ready.sourceDigest === state.sourceDigest && ready.backup !== null,
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
    if (existsSync(backupLocationFor(root))) {
      const location = await ensureBackupLocation(root);
      await rm(join(location,'.upgrade-'+state.id),{recursive:true,force:true});
    }
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    await rm(journal(root));
    requireStore(false, 'UPGRADE_SOURCE_CHANGED', '旧书库已变化。请重新启动 AI7，为当前数据重新备份和升级。');
  }
  for (; ;) {
    before?.(state.stage);
    onStage?.(state.stage);
    switch (state.stage) {
      case 'backup': {
        // The active 116 store is still in place. Any uncommitted conversion under this attempt can be rebuilt.
        await rm(staging,{recursive:true,force:true});
        await ensureCanonicalDataDirectory(root, 'shell', basename(note), 'store');
        const attemptArea = await prepareUpgradeBackupAttempt(root,note,state.id);
        const pending = await readPendingUpgrade(note);
        if (pending !== null) {
          state.backup = pending.upgrade;
          const sql = await checkedStore(root,store);
          const size = (await lstat(sql)).size + (existsSync(sql+'-wal') ? (await lstat(sql+'-wal')).size : 0);
          const volume = await statfs(root);
          const missing = Math.max(state.backup.backup.byteLength + size, 2 * size + 32 * 1024 * 1024) - (freeDataBytes ?? volume.bavail * volume.bsize);
          requireStore(missing <= 0,'UPGRADE_SPACE',`磁盘空间不足，还差 ${Math.ceil(missing / 1048576)} MB。释放空间后再继续升级。`);
        }
        else {
          await upgradePreflight(root);
          const db = openPackageStore(await checkedStore(root, store));
          try {
            const result = await backUpBeforeUpgrade(db, root, {
              terminalRevision: 117, classes: SCHEMA_REVISION_CLASSES,
              softwareVersion, now: new Date(), noteRoot: note, attemptArea
            });
            state.backup = result.upgrade;
          } finally { db.close(); }
        }
        requireStore(state.backup !== null, 'UPGRADE_BACKUP_FAILED', '未能建立升级前备份。');
        await rememberMembers(root,state);
        await rm(attemptArea,{recursive:true,force:true});
        await advance('convert');
        break;
      }
      case 'convert': {
        await rm(staging, { recursive: true, force: true });
        await ensureCanonicalDataDirectory(root, 'shell', basename(note), 'converted');
        convertUpgradeStore(await checkedStore(root, store), database(staging));
        const db = new DatabaseSync(await checkedStore(root,staging));
        try {
          const ledger = new DataVersionLedger(db);
          ledger.recordOpen({ dataVersion: 2, schemaRevision: 117, softwareVersion, upgrade: state.backup });
          state.upgradeRecordId = ledger.standing().latest!.recordId;
        }
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
        await verifyCurrentIdentity(root,store,state);
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
        await verifyCurrentIdentity(root,store,state);
        const archive = await verifyBackup(root,state).catch(() => null);
        // Only discard an extraction when its complete original can still be read. The previous and active payload snapshots remain.
        await rm(join(note,'copies'),{recursive:true,force:true});
        if (archive) for (const area of [extraction,archiveRoot]) await rm(area,{recursive:true,force:true});
        await rm(join(note,'prepared-database'),{recursive:true,force:true});
        let current = await readMembers(root);
        const needed = new Map<string,{sha256:string;bytes:number}>();
        await verifyCopiedPayloads(database(store),current,117,undefined,undefined,(path,digest,bytes) => {
          needed.set(path,{sha256:digest,bytes});
          return true;
        });
        const repairBytes = [...needed.values()].reduce((total,file) => total + file.bytes,0);
        const live = new Map(current.map(file => [file.path,file.sha256]));
        const original = await originalMembers(root,state,true,async files => {
          if (!existsSync(prepared)) return;
          const wantedOld = new Map(files.filter(file => !archive && live.get(file.path) !== file.sha256).map(file => [file.path,file]));
          if (!needed.size && !wantedOld.size) { await rm(prepared,{recursive:true,force:true}); return; }
          for (const file of await databasePackageSources(prepared)) {
            const choices = [needed.get(file.member),wantedOld.get(file.member)];
            const digest = await fileDigest(file.path);
            if (!choices.some(want => want && want.bytes === file.bytes && want.sha256 === digest?.sha256)) await rm(file.path);
          }
        });
        const missingOld = original.filter(file => live.get(file.path) !== file.sha256);
        const oldBytes = missingOld.reduce((total,file) => total + file.bytes,0);
        let ready = old;
        try {
          await verifyOld(root, state);
        } catch (error) {
          if (isStorageFullError(error)) throw error;
          if (archive) {
            const originPath = join(store,originFile);
            const origin = await readState(originPath);
            requireStore(origin?.id === state.id && canonicalJson(origin.backup) === canonicalJson(backup),'UPGRADE_MISMATCH','当前书库的备份记录不一致。');
            if (!origin.backupStoreDigest || !state.backupStoreDigest || ![state.backupStoreBytes,state.backupPayloadBytes].every(bytes => typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0)) {
              await backupMembers(root,state,false);
              // Releasing a failed rollback clears its journal. A later attempt still needs the verified backup identity.
              await writeAtomic(originPath,JSON.stringify({...origin,backupStoreDigest:state.backupStoreDigest,backupStoreBytes:state.backupStoreBytes,backupPayloadBytes:state.backupPayloadBytes}));
            }
            await requireRollbackSpace(root,state,true,current,repairBytes,0,freeDataBytes);
            // A subsequent restart may have only the completed extraction and this journal.
            await writePhase(root,state);
            await ensureCanonicalDataDirectory(root, 'shell', basename(note), 'restore');
            await extractReplacement(archiveRoot, archive, backup.backup.sha256);
          } else {
            requireStore(existsSync(join(incoming,'store')),'UPGRADE_BACKUP_FAILED','升级前备份缺失或已变化。');
            await requireRollbackSpace(root,state,false,current,repairBytes,oldBytes,freeDataBytes);
          }
          await verifyExtractedBackup(root,state,incoming);
          ready = join(incoming, 'store');
          state.fallback = true;
        }
        if (!state.fallback) {
          const alreadySaved = new Map(existsSync(legacyFiles) ? (await readMembers(legacyFiles)).map(file => [file.path,file.sha256]) : []);
          const copyBytes = missingOld.reduce((total,file) => total + (alreadySaved.get(file.path) === file.sha256 ? 0 : file.bytes),0);
          await requireRollbackSpace(root,state,false,current,repairBytes,oldBytes+copyBytes,freeDataBytes);
          if (missingOld.length) {
            await ensureCanonicalDataDirectory(note,'old-payloads');
            await collectMembers(missingOld,[legacyFiles,saved,previous,prepared,incoming],{root:legacyFiles,note});
          }
        }
        await writeAtomic(join(ready, DATA_VERSION_MARKER_FILE), JSON.stringify({
          dataVersion: 1, schemaRevision: 116,
          softwareVersion: backup.fromSoftwareVersion ?? '0.7.3', writtenAt: new Date().toISOString()
        }));
        for (const source of [saved,previous,prepared,legacyFiles,...(state.fallback ? [incoming] : [])]) {
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
        state.currentManifestEncoding = 'export-order';
        const inventory = inventoryText(state,current,state.currentManifestDigest);
        await writeAtomic(join(note,'current-files.json'),inventory);
        state.currentDigest = await sourceFingerprint(root,store);
        const sqlCopy = await ensureCanonicalDataDirectory(note,'prepared-database');
        await copyCurrentDatabase(root,store,sqlCopy);
        for (const file of [originFile,DATA_VERSION_MARKER_FILE]) await copyFile(join(store,file),join(sqlCopy,file));
        await verifyCurrentLibrary(root,sqlCopy,state,current);
        requireStore(await sourceFingerprint(root,sqlCopy) === state.currentDigest,'UPGRADE_MISMATCH','回退前的数据库副本与原库不符。');
        state.rollbackDigest = await sourceFingerprint(root, ready);
        const receipt = JSON.stringify({...state,stage:'save-new'});
        await writeAtomic(join(sqlCopy,'files.json'),inventory);
        await writeAtomic(join(sqlCopy,'rollback-ready.json'),receipt);
        await syncDirectory(sqlCopy);
        await rm(join(note,'current-database'),{recursive:true,force:true});
        await rename(sqlCopy,join(note,'current-database'));
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
        const payloads = state.fallback ? [incoming] : [saved,legacyFiles];
        requireStore(await sourceFingerprint(root,ready) === state.rollbackDigest,'UPGRADE_MISMATCH','待恢复的旧书库已变化。');
        await collectMembers(await originalMembers(root,state),payloads);
        const current = await currentMembers(root,note,state,saved);
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
        const payloads = state.fallback ? [incoming] : [saved,legacyFiles];
        const expected = await originalMembers(root,state);
        const current = await currentMembers(root,note,state,saved);
        await recoverCurrentDatabase(root,newer,note,state);
        await reconcileSavedFiles(root,newer,note,state,current);
        await verifyCurrentLibrary(root,newer,state,current);
        await moveStore(root,rollbackSource(),store,async dir => {
          requireStore(await sourceFingerprint(root,dir) === state.rollbackDigest && storeRevisionOnDisk(database(dir)) === 116,
            'UPGRADE_MISMATCH','待发布的旧书库与恢复记录不一致。');
        });
        // A completed switch may replay after temporary extraction files were reclaimed.
        try { await verifyMembers(root,expected,true); }
        catch {
          await collectMembers(expected,payloads);
          await installMembers(root,payloads,expected,note,current);
        }
        await verifyFiles(root,database(store));
        before?.(state.stage, true);
        requireStore(await sourceFingerprint(root,newer) === state.currentDigest,'UPGRADE_MISMATCH','保留的新版数据库已变化。');
        await verifyMembers(saved,current,true);
        if (state.fallback && existsSync(old)) await rename(old, join(root, 'shell', basename(old)));
        requireStore(await sourceFingerprint(root,store) === state.rollbackDigest, 'UPGRADE_STATE_INVALID', '旧数据库未能就位。');
        const marker = await readDataVersionMarker(root);
        requireStore(marker?.dataVersion === 1 && marker.schemaRevision === 116,'UPGRADE_MISMATCH','旧书库的启动标记不一致。');
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
        const current = await currentMembers(root,note,state,join(currentStore,'payloads'));
        requireStore((await readState(join(currentStore,originFile)))?.id === state.id &&
          await sourceFingerprint(root,currentStore) === state.currentDigest,'UPGRADE_MISMATCH','当前书库核对失败。');
        await reconcileSavedFiles(root,currentStore,note,state,current);
        await verifyCurrentLibrary(root,currentStore,state,current);
        if (existsSync(store) && existsSync(newer)) {
          // Preserve even a damaged or replaced old directory outside the old exporter's scope.
          const identity = await sourceFingerprint(root,store).catch(() => null);
          const original = identity !== null && (identity === state.sourceDigest || identity === state.backupStoreDigest);
          const destination = original ? old : rollbackSource();
          if (original && existsSync(old)) {
            const prior = await sourceFingerprint(root,old).catch(() => null);
            if (prior !== state.sourceDigest && prior !== state.backupStoreDigest) await rename(old,join(root,'shell','unpublished-old-'+randomUUID()));
          }
          const matches = existsSync(dirname(destination)) && !existsSync(destination) && (original || identity === state.rollbackDigest);
          await rename(store,matches ? destination : join(root,'shell','unpublished-old-'+randomUUID()));
        }
        await moveStore(root,newer,store,async dir => {
          requireStore((await readState(join(dir,originFile)))?.id === state.id && await sourceFingerprint(root,dir) === state.currentDigest,
            'UPGRADE_MISMATCH','当前书库核对失败。');
        });
        before?.('return-new',true);
        await installMembers(root,[join(store,'payloads')],current,note,current);
        requireStore(await liveCurrentIsComplete(root,state),'UPGRADE_FILES_INVALID','恢复后的书库与回退前的完整记录不符。');
        await rm(journal(root));
        return {restored:false,message:'回退未完成，已恢复升级后的书库。'};
      }
    }
  }
}
