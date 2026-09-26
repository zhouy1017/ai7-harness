import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { writeDatabasePackage } from '../../src/service/database-exports.js';
import { isPackageMemberPath, verifyDatabasePackage } from '../../src/service/database-package-reader.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

// Unit suite for reading a database package (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.4): a package the writer
// made is read back whole and verified member by member; a flipped byte is damage; anything that is not a package — no
// manifest, a member outside the Agent Data Root or in a place a package never carries, a manifest the entries do not match —
// is refused before anything is taken from it.

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ai7-database-package-reader-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const contents = { books: 1, sourceVersions: 1, libraryMaterials: 0, series: 0 };

async function writtenPackage(): Promise<string> {
  const dataRoot = join(root, 'data');
  mkdirSync(join(dataRoot, 'objects', 'sha256'), { recursive: true });
  writeFileSync(join(dataRoot, 'objects', 'sha256', 'one.docx'), 'a stored manuscript object');
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT; INSERT INTO books VALUES (\'b\'); PRAGMA user_version = 55;');
    const path = join(root, 'written.ai7db');
    await writeDatabasePackage(database, dataRoot, path, () => ({
      dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 55, createdAt: '2026-09-25T02:00:00.000Z', origin: 'database-export', contents,
    }));
    return path;
  } finally {
    database.close();
  }
}

/** A package made by hand: the given members and a manifest naming `named` (by default, exactly them). */
function craftedPackage(members: Record<string, Uint8Array>, named?: Array<{ path: string; bytes: number; sha256: string }>): string {
  const manifest = canonicalRecord({
    schema: 'ai7.database-package/1', dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 55, createdAt: '2026-09-25T02:00:00.000Z',
    origin: 'database-export', contents, credentials: 'excluded',
    members: named ?? Object.entries(members).map(([path, bytes]) => ({ path, bytes: bytes.byteLength, sha256: digest(bytes) })),
  });
  const path = join(root, `crafted-${Object.keys(members).length}-${Math.random().toString(16).slice(2)}.ai7db`);
  writeFileSync(path, zipSync({ ...members, 'manifest.json': strToU8(manifest.json) }, { mtime: fixedArchiveTime() }));
  return path;
}

async function refusal(path: string): Promise<unknown> {
  return verifyDatabasePackage(path).then(() => null, (error: unknown) => (error as { code?: string }).code ?? error);
}

describe('reading a database package', () => {
  it('reads back a package the writer made, member by member, each verified', async () => {
    const path = await writtenPackage();
    const visited: Array<{ path: string; bytes: number }> = [];
    let current: { path: string; bytes: number } | null = null;
    const verified = await verifyDatabasePackage(path, {
      begin: async (member) => { current = { path: member.path, bytes: 0 }; },
      data: async (chunk) => { current!.bytes += chunk.byteLength; },
      end: async () => { visited.push(current!); },
    });
    expect(verified.manifest).toMatchObject({ dataVersion: 1, schemaRevision: 55, origin: 'database-export', contents });
    expect(verified.sha256).toBe(digest(readFileSync(path)));
    expect(visited.map((member) => member.path)).toEqual(['store/ai7.sqlite', 'objects/sha256/one.docx']);
    expect(visited[1]!.bytes).toBe('a stored manuscript object'.length);
  });

  it('refuses a flipped byte as damage', async () => {
    const path = await writtenPackage();
    const bytes = readFileSync(path);
    const at = bytes.indexOf(Buffer.from('a stored manuscript object'));
    expect(at).toBeGreaterThan(0);
    bytes[at] = bytes[at]! ^ 0xff;
    writeFileSync(path, bytes);
    expect(await refusal(path)).toBe('DATABASE_PACKAGE_DAMAGED');
  });

  it('refuses what is not a package, before anything is taken from it', async () => {
    const store = strToU8('a store');
    // No manifest, not a ZIP, a directory.
    const noManifest = join(root, 'no-manifest.ai7db');
    writeFileSync(noManifest, zipSync({ 'store/ai7.sqlite': store }, { mtime: fixedArchiveTime() }));
    expect(await refusal(noManifest)).toBe('DATABASE_PACKAGE_INVALID');
    const notZip = join(root, 'not-zip.ai7db');
    writeFileSync(notZip, 'just some words');
    expect(await refusal(notZip)).toBe('DATABASE_PACKAGE_INVALID');
    expect(await refusal(root)).toBe('DATABASE_PACKAGE_INVALID');
    // A manifest that names a member outside the Agent Data Root, or in a place a package never carries.
    for (const bad of ['../outside.txt', '/absolute.txt', 'objects\\windows.txt', 'shell/Preferences', 'export-staging/x.ai7db']) {
      expect(await refusal(craftedPackage({ 'store/ai7.sqlite': store, [bad]: strToU8('x') }))).toBe('DATABASE_PACKAGE_INVALID');
    }
    // A manifest the entries do not match: a member missing, or one the manifest does not name.
    expect(await refusal(craftedPackage({ 'store/ai7.sqlite': store }, [
      { path: 'store/ai7.sqlite', bytes: store.byteLength, sha256: digest(store) },
      { path: 'objects/missing.docx', bytes: 1, sha256: 'a'.repeat(64) },
    ]))).toBe('DATABASE_PACKAGE_INVALID');
    expect(await refusal(craftedPackage({ 'store/ai7.sqlite': store, 'objects/extra.docx': strToU8('extra') }, [
      { path: 'store/ai7.sqlite', bytes: store.byteLength, sha256: digest(store) },
    ]))).toBe('DATABASE_PACKAGE_INVALID');
    // Without the store's copy it is no database.
    expect(await refusal(craftedPackage({ 'objects/only.docx': strToU8('only') }))).toBe('DATABASE_PACKAGE_INVALID');
    // Two members Windows or macOS would write as one file.
    expect(await refusal(craftedPackage({ 'store/ai7.sqlite': store, 'objects/A.docx': strToU8('a'), 'objects/a.docx': strToU8('b') })))
      .toBe('DATABASE_PACKAGE_INVALID');
    // A crafted package that is whole is read.
    expect((await verifyDatabasePackage(craftedPackage({ 'store/ai7.sqlite': store }))).manifest.members).toHaveLength(1);
  });

  it('names the member paths a package may carry', () => {
    expect(['store/ai7.sqlite', 'objects/sha256/ab/x.docx', 'library-objects/a', 'recovery-objects/v1/r'].map(isPackageMemberPath)).toEqual([true, true, true, true]);
    expect(['store/ai7.sqlite-wal', 'shell/x', 'export-staging/x', 'manifest.json', '../x', 'a/../b', '/x', 'a\\b', 'C:/x', 'a//b', ' a/b', '']
      .map(isPackageMemberPath)).toEqual(Array(12).fill(false));
    // Compared without regard to case, as Windows and macOS compare names; and never a name Windows would not write as named.
    expect(['Store/ai7.sqlite', 'STORE/x', 'Shell/Preferences', 'Export-Staging/x', 'MANIFEST.JSON', 'objects/CON', 'objects/nul.txt', 'objects/Com1',
      'objects/a.', 'objects/./a'].map(isPackageMemberPath)).toEqual(Array(10).fill(false));
    expect(['objects/console.txt', 'objects/a.b', 'objects/nullable'].map(isPackageMemberPath)).toEqual([true, true, true]);
  });
});
