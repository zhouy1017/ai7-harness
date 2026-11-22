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
import { databasePackageSources, openPackageStore, verifyCopiedPayloads } from './database-exports.js';
import { extractReplacement, readSmallFile, replacementStagingFor, writeAtomic } from './database-replacement.js';
import { fileDigest } from './manuscript-export.js';
import { backupLocationFor } from './scheduled-backups.js';
import { requireStore } from './store-records.js';
import { backUpBeforeUpgrade, readPendingUpgrade } from './upgrade-backup.js';
import { convertUpgradeStore, requireUpgradeSource, verifyUpgradeStore } from './upgrade-store.js';

const stages = ['backup', 'convert', 'verify', 'save-old', 'publish', 'record', 'restore', 'save-new', 'publish-old'] as const;
type Stage = typeof stages[number];
interface UpgradeState {
  id: string;
  stage: Stage;
  backup: DataVersionUpgrade | null;
  comparison: string;
  fallback: boolean;
  sourceDigest: string;
  targetDigest?: string;
  rollbackDigest?: string;
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
  const packageBytes = size + payload + 1048576;
  const newStoreBytes = size * 2 + 32 * 1024 * 1024;
  const missing = Math.ceil(dataInfo.dev === backupInfo.dev
    ? packageBytes + Math.max(size, newStoreBytes) - Math.min(dataFree, backupFree)
    : Math.max(newStoreBytes - dataFree, packageBytes + size - backupFree));
  requireStore(missing <= 0, 'UPGRADE_SPACE', `磁盘空间不足，还差 ${Math.ceil(missing / 1048576)} MB。释放空间后再升级。`);
}

async function verifyFiles(root: string, db: string): Promise<void> {
  const files = [];
  for (const src of await databasePackageSources(root)) {
    const held = await fileDigest(src.path);
    requireStore(held !== null, 'UPGRADE_FILES_INVALID', '需要的数据文件缺失。');
    files.push({ path: src.member, ...held });
  }
  const revision = storeRevisionOnDisk(db);
  requireStore(revision !== null, 'UPGRADE_STORE_MISSING', '找不到待核对的数据库。');
  await verifyCopiedPayloads(db, files, revision);
}

async function restorePayloads(root: string, incoming: string): Promise<void> {
  for (const src of await databasePackageSources(incoming)) {
    const parts = src.member.split('/');
    const name = parts.pop()!;
    const dir = parts.length ? await ensureCanonicalDataDirectory(root, ...parts) : root;
    if (dir !== root) await inspectCanonicalDataFile(root, dir, name);
    const destination = join(dir, name);
    const temp = destination + '.' + randomUUID() + '.partial';
    try {
      await copyFile(src.path, temp);
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
  await writeAtomic(journal(root), JSON.stringify({ id: Date.now() + '-' + randomUUID(), stage: 'backup', backup: null, comparison: '', fallback: false, sourceDigest }));
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
  await verifyFiles(root, path);
  return old;
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

async function moveStore(root: string, from: string, to: string, verify: (directory: string) => Promise<void>): Promise<void> {
  const pending = existsSync(from);
  requireStore(pending !== existsSync(to), 'UPGRADE_STATE_INVALID', '不能确认切换中的两个书库目录。');
  await verify(pending ? from : to);
  if (pending) await rename(from, to);
  // Windows does not expose directory fsync through Node. An interrupted rename is reconciled by identity on resume.
  if (process.platform !== 'win32') for (const directory of new Set([dirname(from), dirname(to), root])) {
    const handle = await open(directory, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
}

export async function hasLocalUpgradeSource(root: string): Promise<boolean> {
  try {
    const state = await readState(join(root, 'store', originFile));
    if (!state?.backup) return false;
    const old = join(root, 'store-before-0.8.0-' + state.id);
    return existsSync(database(old)) || existsSync(join(backupLocationFor(root), state.backup.backup.fileName));
  } catch { return false; }
}

export async function beginUpgradeRollback(root: string): Promise<void> {
  const state = await readState(join(root, 'store', originFile));
  requireStore(state?.backup && await readState(journal(root)) === null, 'UPGRADE_STATE_INVALID', '找不到本次升级的备份记录。');
  await verifyOld(root, state).catch(() => verifyBackup(root, state));
  await writeAtomic(journal(root), JSON.stringify({ ...state, stage: 'restore' }));
}

type UpgradeHook = (stage: Stage, afterRename?: boolean) => void;
export async function resumeUpgrade(root: string, softwareVersion: string, before?: UpgradeHook): Promise<{ restored: boolean; message: string } | null> {
  const state = await readState(journal(root));
  if (!state) return null;
  const store = join(root, 'store');
  const staging = join(root, 'store.upgrading');
  const old = join(root, 'store-before-0.8.0-' + state.id);
  // 0.7.x excludes shell from exports. Its own packager cannot know a new set-aside directory name.
  const newer = join(root, 'shell', 'store-after-0.8.0-' + state.id);
  const note = join(root, 'shell', 'upgrade-' + state.id);
  const advance = async (stage: Stage) => {
    state.stage = stage;
    await writeAtomic(journal(root), JSON.stringify(state));
  };
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
        await advance('convert');
        break;
      }
      case 'convert':
        await rm(staging, { recursive: true, force: true });
        await ensureCanonicalDataDirectory(root, 'store.upgrading');
        convertUpgradeStore(await checkedStore(root, store), database(staging));
        await advance('verify');
        break;
      case 'verify':
        state.comparison = verifyUpgradeStore(await checkedStore(root, store), await checkedStore(root, staging));
        await verifyFiles(root, database(staging));
        await writeAtomic(join(staging, DATA_VERSION_MARKER_FILE), JSON.stringify({ dataVersion: 2, schemaRevision: 117, softwareVersion, writtenAt: new Date().toISOString() }));
        state.targetDigest = await sourceFingerprint(root, staging);
        await writeAtomic(join(staging, originFile), JSON.stringify(state));
        await advance('save-old');
        break;
      case 'save-old':
        await verifyBackup(root, state);
        requireStore(await sourceFingerprint(root, staging) === state.targetDigest, 'UPGRADE_MISMATCH', '新书库核对失败。');
        await moveStore(root, store, old, async dir => {
          requireStore(await sourceFingerprint(root, dir) === state.sourceDigest, 'UPGRADE_SOURCE_CHANGED', '升级期间旧书库发生了变化，请重新升级。');
        });
        before?.(state.stage, true);
        await advance('publish');
        break;
      case 'publish':
        requireStore(await sourceFingerprint(root, old) === state.sourceDigest, 'UPGRADE_SOURCE_CHANGED', '旧书库核对失败。');
        await moveStore(root, staging, store, async dir => {
          requireStore((await readState(join(dir, originFile)))?.id === state.id && await sourceFingerprint(root, dir) === state.targetDigest,
            'UPGRADE_MISMATCH', '新书库核对失败。');
        });
        before?.(state.stage, true);
        await advance('record');
        break;
      case 'record': {
        requireStore((await readState(join(store, originFile)))?.id === state.id && storeRevisionOnDisk(database(store)) === 117,
          'UPGRADE_MISMATCH', '当前书库与本次升级不一致。');
        const db = new DatabaseSync(await checkedStore(root, store));
        try { new DataVersionLedger(db).recordOpen({ dataVersion: 2, schemaRevision: 117, softwareVersion, upgrade: state.backup }); }
        finally { db.close(); }
        await writeAtomic(join(store, originFile), JSON.stringify(state));
        await rm(journal(root));
        return { restored: false, message: state.comparison };
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
          const archiveRoot = join(note, 'restore');
          await ensureCanonicalDataDirectory(root, 'shell', basename(note), 'restore');
          await extractReplacement(archiveRoot, archive, backup.backup.sha256);
          const incoming = join(replacementStagingFor(archiveRoot), 'incoming');
          await verifyFiles(incoming, database(join(incoming, 'store')));
          // Payloads are installed after the current database is set aside.
          ready = join(incoming, 'store');
          await rm(staging, { recursive: true, force: true });
          await rename(ready, staging);
          ready = staging;
          state.fallback = true;
        }
        await writeAtomic(join(ready, DATA_VERSION_MARKER_FILE), JSON.stringify({
dataVersion: 1, schemaRevision: 116,
          softwareVersion: backup.fromSoftwareVersion ?? '0.7.4', writtenAt: new Date().toISOString()
}));
        state.rollbackDigest = await sourceFingerprint(root, ready);
        await advance('save-new');
        break;
      }
      case 'save-new':
        await moveStore(root, store, newer, async dir => {
          requireStore((await readState(join(dir, originFile)))?.id === state.id && storeRevisionOnDisk(database(dir)) === 117,
            'UPGRADE_MISMATCH', '当前书库与本次回退不一致。');
        });
        if (state.fallback) {
          for (const file of await databasePackageSources(root)) {
            const saved = join(newer, 'payloads', file.member);
            await mkdir(dirname(saved), { recursive: true });
            await rename(file.path, saved);
          }
        }
        before?.(state.stage, true);
        await advance('publish-old');
        break;
      case 'publish-old':
        if (state.fallback) {
          const incoming = join(replacementStagingFor(join(note, 'restore')), 'incoming');
          await restorePayloads(root, incoming);
          await verifyFiles(root, database(existsSync(store) ? store : staging));
        }
        await moveStore(root, state.fallback ? staging : old, store, async dir => {
          requireStore(await sourceFingerprint(root, dir) === state.rollbackDigest && storeRevisionOnDisk(database(dir)) === 116,
            'UPGRADE_MISMATCH', '待发布的旧书库与恢复记录不一致。');
        });
        before?.(state.stage, true);
        if (state.fallback && existsSync(old)) await rename(old, join(root, 'shell', basename(old)));
        requireStore(storeRevisionOnDisk(database(store)) === 116, 'UPGRADE_STATE_INVALID', '旧数据库未能就位。');
        await rm(journal(root));
        await rm(note, { recursive: true, force: true }).catch(() => undefined);
        return { restored: true, message: '升级前的数据已就位，请使用上一版 AI7 打开。' };
    }
  }
}
