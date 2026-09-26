import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { open as openFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeDatabasePackage } from '../../src/service/database-exports.js';
import { MAX_MANIFEST_BYTES } from '../../src/service/database-package-reader.js';
import {
  DatabaseReplacementError,
  completeReplacement,
  extractReplacement,
  importCompatibility,
  openWithPendingReplacement,
  preReplaceBackupFileName,
  readPendingReplacement,
  readSmallFile,
  replacementStagingFor,
  writeReplacementIntent,
  writeReplacementMembers,
  type ReplacementIntent,
} from '../../src/service/database-replacement.js';

// Unit suite for applying a replacement of the local data (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.3): the
// package extracted and verified into the staging place beside the Agent Data Root; the apply at the next open, which moves the
// data aside, moves the package's in and opens it; an apply interrupted in any step, which resumes where it stopped; data that
// will not open, which is moved out again with the data it would have replaced moved back; and what is not a replacement —
// an interrupted preparation, a phase that does not read, a place AI7 never made — which moves nothing.

let root: string;
let dataRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ai7-database-replacement-'));
  dataRoot = join(root, 'data');
  // The data as it is: the store, a stored object, and the two places a replacement leaves where they are.
  mkdirSync(join(dataRoot, 'store'), { recursive: true });
  writeFileSync(join(dataRoot, 'store', 'ai7.sqlite'), 'the store as it is');
  mkdirSync(join(dataRoot, 'objects'), { recursive: true });
  writeFileSync(join(dataRoot, 'objects', 'marker.txt'), 'original');
  mkdirSync(join(dataRoot, 'recovery-objects', 'v1'), { recursive: true });
  writeFileSync(join(dataRoot, 'recovery-objects', 'v1', 'kept'), 'recovery');
  mkdirSync(join(dataRoot, 'shell'), { recursive: true });
  writeFileSync(join(dataRoot, 'shell', 'Preferences'), '{}');
  mkdirSync(join(dataRoot, 'export-staging'), { recursive: true });
  writeFileSync(join(dataRoot, 'export-staging', 'staged.ai7db'), 'staged');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const T = new Date('2026-09-25T02:00:00.000Z');
let packages = 0;
const contents = { books: 1, sourceVersions: 1, libraryMaterials: 0, series: 0 };

/** A package of other data: its store, and its own stored object. */
async function otherPackage(): Promise<{ path: string; sha256: string }> {
  const other = join(root, 'other');
  mkdirSync(join(other, 'objects'), { recursive: true });
  writeFileSync(join(other, 'objects', 'marker.txt'), 'package');
  writeFileSync(join(other, 'objects', 'only-in-package.txt'), 'new');
  const database = new DatabaseSync(':memory:');
  try {
    database.exec("CREATE TABLE marker (value TEXT) STRICT; INSERT INTO marker VALUES ('package'); PRAGMA user_version = 57;");
    packages += 1;
    const path = join(root, `AI7 数据库 ${packages}.ai7db`);
    const written = await writeDatabasePackage(database, other, path, () => ({
      dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 57, createdAt: T.toISOString(), origin: 'database-export',
    }));
    return { path, sha256: written.sha256 };
  } finally {
    database.close();
  }
}

async function prepared(): Promise<ReplacementIntent> {
  const { path, sha256 } = await otherPackage();
  const { manifest } = await extractReplacement(dataRoot, path, sha256);
  const packageMembersSha256 = await writeReplacementMembers(dataRoot, manifest.members);
  const intent: ReplacementIntent = {
    replacementId: '5f0c3c1e-9a8b-4c2d-8e1f-0a1b2c3d4e5f',
    kind: 'replace',
    packageFileName: 'AI7 数据库.ai7db',
    packageSha256: sha256,
    packageCreatedAt: manifest.createdAt,
    packageOrigin: manifest.origin,
    packageContents: manifest.contents,
    backupFileName: preReplaceBackupFileName(T),
    backupSha256: 'b'.repeat(64),
    preparedAt: T.toISOString(),
    packageMembersSha256,
  };
  await writeReplacementIntent(dataRoot, intent);
  return intent;
}

const staging = (): string => replacementStagingFor(dataRoot);
const marker = (): string => readFileSync(join(dataRoot, 'objects', 'marker.txt'), 'utf8');
const entries = (path: string): string[] => (existsSync(path) ? readdirSync(path).sort() : []);
const setPhase = (phase: string): void => writeFileSync(join(staging(), 'phase.json'), JSON.stringify(phase));
/** The store "opens" when its data is the package's or the original, and reads which one it is. */
const open = async (): Promise<string> => marker();
const refuseThePackage = async (): Promise<string> => {
  if (marker() === 'package') throw new Error('STORE_SCHEMA_INVALID');
  return marker();
};

describe('applying a replacement of the local data', () => {
  it('moves the data aside, moves the package in, opens it, and keeps the places that are not data', async () => {
    const intent = await prepared();
    expect(await readPendingReplacement(dataRoot)).toEqual(intent);
    expect(entries(join(staging(), 'incoming'))).toEqual(['objects', 'store']);

    const { store, replacement } = await openWithPendingReplacement(dataRoot, open);
    expect(store).toBe('package');
    expect(replacement).toEqual({ intent, outcome: 'applied' });
    expect(entries(dataRoot)).toEqual(['export-staging', 'objects', 'shell', 'store']);
    expect(readFileSync(join(dataRoot, 'shell', 'Preferences'), 'utf8')).toBe('{}');
    expect(readFileSync(join(dataRoot, 'export-staging', 'staged.ai7db'), 'utf8')).toBe('staged');
    expect(readFileSync(join(dataRoot, 'objects', 'only-in-package.txt'), 'utf8')).toBe('new');
    // The data moved aside waits until the replacement is recorded; a waiting replacement is no longer pending.
    expect(entries(join(staging(), 'previous'))).toEqual(['objects', 'recovery-objects', 'store']);
    expect(await readPendingReplacement(dataRoot)).toBeNull();
    await completeReplacement(dataRoot);
    expect(existsSync(staging())).toBe(false);
  });

  it('resumes an apply interrupted in any step, and records it once', async () => {
    // Interrupted while moving the data aside: part of it moved, the rest still in place.
    const intent = await prepared();
    setPhase('moving-out');
    mkdirSync(join(staging(), 'previous'));
    renameSync(join(dataRoot, 'objects'), join(staging(), 'previous', 'objects'));
    let opened = await openWithPendingReplacement(dataRoot, open);
    expect([opened.store, opened.replacement?.outcome]).toEqual(['package', 'applied']);
    expect(entries(join(staging(), 'previous'))).toEqual(['objects', 'recovery-objects', 'store']);
    // Interrupted after it opened, before the record: the next open finds it applied, opens it, and names it again.
    opened = await openWithPendingReplacement(dataRoot, open);
    expect([opened.store, opened.replacement]).toEqual(['package', { intent, outcome: 'applied' }]);
    await completeReplacement(dataRoot);
    expect(existsSync(staging())).toBe(false);
    // Nothing waits any more: the data opens as it is.
    expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'package', replacement: null });
  });

  it('resumes an apply interrupted while moving the package in', async () => {
    await prepared();
    setPhase('moving-in');
    mkdirSync(join(staging(), 'previous'));
    for (const entry of ['objects', 'recovery-objects', 'store']) renameSync(join(dataRoot, entry), join(staging(), 'previous', entry));
    renameSync(join(staging(), 'incoming', 'store'), join(dataRoot, 'store'));
    const opened = await openWithPendingReplacement(dataRoot, open);
    expect([opened.store, opened.replacement?.outcome]).toEqual(['package', 'applied']);
    expect(entries(dataRoot)).toEqual(['export-staging', 'objects', 'shell', 'store']);
  });

  it('verifies what waits again when it resumes moving the data aside or the package in, and puts the data back when it changed (Issue #434 review)', async () => {
    // Interrupted while moving the data aside, then a member of the package changed: the data comes back, and nothing moved in.
    let intent = await prepared();
    setPhase('moving-out');
    mkdirSync(join(staging(), 'previous'));
    renameSync(join(dataRoot, 'objects'), join(staging(), 'previous', 'objects'));
    writeFileSync(join(staging(), 'incoming', 'objects', 'marker.txt'), 'changed');
    expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'original', replacement: { intent, outcome: 'failed', failure: 'changed' } });
    expect(entries(dataRoot)).toEqual(['export-staging', 'objects', 'recovery-objects', 'shell', 'store']);
    expect(readFileSync(join(dataRoot, 'store', 'ai7.sqlite'), 'utf8')).toBe('the store as it is');
    await completeReplacement(dataRoot);
    expect(existsSync(staging())).toBe(false);

    // Interrupted while moving the package in, then a file put among what came in: that goes out, and the data comes back.
    intent = await prepared();
    setPhase('moving-in');
    mkdirSync(join(staging(), 'previous'));
    for (const entry of ['objects', 'recovery-objects', 'store']) renameSync(join(dataRoot, entry), join(staging(), 'previous', entry));
    renameSync(join(staging(), 'incoming', 'objects'), join(dataRoot, 'objects'));
    writeFileSync(join(dataRoot, 'objects', 'extra.bin'), 'extra');
    expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'original', replacement: { intent, outcome: 'failed', failure: 'changed' } });
    expect(entries(dataRoot)).toEqual(['export-staging', 'objects', 'recovery-objects', 'shell', 'store']);
    expect(readFileSync(join(dataRoot, 'recovery-objects', 'v1', 'kept'), 'utf8')).toBe('recovery');
    // An open interrupted before the failure was recorded finds it the same, and still moves nothing in.
    expect((await openWithPendingReplacement(dataRoot, open)).replacement).toEqual({ intent, outcome: 'failed', failure: 'changed' });
    await completeReplacement(dataRoot);

    // And a member in both places at once is not what was verified either: each member is read where it stands, once.
    intent = await prepared();
    setPhase('moving-in');
    mkdirSync(join(staging(), 'previous'));
    for (const entry of ['objects', 'recovery-objects', 'store']) renameSync(join(dataRoot, entry), join(staging(), 'previous', entry));
    cpSync(join(staging(), 'incoming', 'store'), join(dataRoot, 'store'), { recursive: true });
    expect((await openWithPendingReplacement(dataRoot, open)).replacement).toEqual({ intent, outcome: 'failed', failure: 'changed' });
    expect(marker()).toBe('original');
    await completeReplacement(dataRoot);

    // A resumed apply whose intent no longer reads cannot be verified, and moves nothing more in either.
    await prepared();
    setPhase('moving-out');
    writeFileSync(join(staging(), 'intent.json'), '{}');
    expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'original', replacement: null });
    expect(marker()).toBe('original');
  });

  it('opens data resumed at its first open only while it is exactly what was verified, and otherwise puts the data back (Issue #434 review)', async () => {
    const movedIn = (): void => {
      setPhase('opening');
      mkdirSync(join(staging(), 'previous'));
      for (const entry of ['objects', 'recovery-objects', 'store']) renameSync(join(dataRoot, entry), join(staging(), 'previous', entry));
      for (const entry of ['objects', 'store']) renameSync(join(staging(), 'incoming', entry), join(dataRoot, entry));
    };
    // Stopped once it was moved in, before anything opened it: the bytes are the verified ones, and it opens.
    let intent = await prepared();
    movedIn();
    expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'package', replacement: { intent, outcome: 'applied' } });
    await completeReplacement(dataRoot);

    // Stopped while it opened: SQLite's journal beside the store, or a changed file, can be an interrupted open's or not — the
    // data goes back either way, and the replacement is recorded as interrupted.
    const interruptions: ReadonlyArray<() => void> = [
      () => writeFileSync(join(dataRoot, 'store', 'ai7.sqlite-wal'), 'written by an open'),
      () => writeFileSync(join(dataRoot, 'objects', 'marker.txt'), 'changed'),
      () => rmSync(join(dataRoot, 'store', 'ai7.sqlite')),
    ];
    for (const interruption of interruptions) {
      rmSync(dataRoot, { recursive: true, force: true });
      mkdirSync(join(dataRoot, 'store'), { recursive: true });
      writeFileSync(join(dataRoot, 'store', 'ai7.sqlite'), 'the store as it is');
      mkdirSync(join(dataRoot, 'objects'), { recursive: true });
      writeFileSync(join(dataRoot, 'objects', 'marker.txt'), 'original');
      mkdirSync(join(dataRoot, 'recovery-objects', 'v1'), { recursive: true });
      writeFileSync(join(dataRoot, 'recovery-objects', 'v1', 'kept'), 'recovery');
      mkdirSync(join(dataRoot, 'shell'), { recursive: true });
      mkdirSync(join(dataRoot, 'export-staging'), { recursive: true });
      intent = await prepared();
      movedIn();
      interruption();
      expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'original', replacement: { intent, outcome: 'failed', failure: 'interrupted' } });
      expect(readFileSync(join(dataRoot, 'store', 'ai7.sqlite'), 'utf8')).toBe('the store as it is');
      expect(existsSync(join(dataRoot, 'store', 'ai7.sqlite-wal'))).toBe(false);
      await completeReplacement(dataRoot);
    }
  });

  it("reads a refusal note only within a note's bound, and takes one that is not AI7's as a refusal still (Issue #434 review)", async () => {
    // A resumed apply put the data back and wrote why; the note it finds at the end is read only as a small file.
    const restoredWith = async (note: (() => void) | null): Promise<unknown> => {
      rmSync(staging(), { recursive: true, force: true });
      const intent = await prepared();
      setPhase('restored');
      note?.();
      return { intent, applied: await openWithPendingReplacement(dataRoot, open) };
    };
    const reasons: unknown[] = [];
    for (const note of [
      null,
      () => writeFileSync(join(staging(), 'refused.json'), JSON.stringify('interrupted')),
      () => writeFileSync(join(staging(), 'refused.json'), ' '.repeat(65)),
      () => mkdirSync(join(staging(), 'refused.json')),
      () => writeFileSync(join(staging(), 'refused.json'), JSON.stringify('sideways')),
    ]) {
      const { applied } = await restoredWith(note) as { applied: Awaited<ReturnType<typeof openWithPendingReplacement<string>>> };
      reasons.push(applied.replacement?.failure);
    }
    expect(reasons).toEqual(['unopenable', 'interrupted', 'changed', 'changed', 'changed']);
  });

  it('reads the list of what waits only within the bound a package manifest has (Issue #434 review)', async () => {
    const intent = await prepared();
    truncateSync(join(staging(), 'members.json'), MAX_MANIFEST_BYTES + 1);
    expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'original', replacement: { intent, outcome: 'failed', failure: 'changed' } });
    expect(marker()).toBe('original');
  });

  it('moves data that will not open out again and the data it would have replaced back, and says the replacement failed', async () => {
    const intent = await prepared();
    const opened = await openWithPendingReplacement(dataRoot, refuseThePackage);
    expect(opened).toEqual({ store: 'original', replacement: { intent, outcome: 'failed', failure: 'unopenable' } });
    expect(entries(dataRoot)).toEqual(['export-staging', 'objects', 'recovery-objects', 'shell', 'store']);
    expect(readFileSync(join(dataRoot, 'store', 'ai7.sqlite'), 'utf8')).toBe('the store as it is');
    expect(entries(join(staging(), 'discarded'))).toEqual(['objects', 'store']);
    await completeReplacement(dataRoot);
    expect(existsSync(staging())).toBe(false);
  });

  it('replaces nothing when what waits is no longer what its preparation verified, and says so (Issue #434 review)', async () => {
    const changes: ReadonlyArray<() => void> = [
      // A member gone, one changed in place, a file it never held, nothing extracted at all, and the members' list rewritten.
      () => rmSync(join(staging(), 'incoming', 'objects'), { recursive: true, force: true }),
      () => {
        const path = join(staging(), 'incoming', 'store', 'ai7.sqlite');
        const bytes = readFileSync(path);
        bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
        writeFileSync(path, bytes);
      },
      () => writeFileSync(join(staging(), 'incoming', 'objects', 'extra.bin'), 'extra'),
      () => rmSync(join(staging(), 'incoming'), { recursive: true, force: true }),
      () => writeFileSync(join(staging(), 'members.json'), '[]'),
    ];
    for (const change of changes) {
      const intent = await prepared();
      change();
      const refused = { store: 'original', replacement: { intent, outcome: 'failed', failure: 'changed' } };
      expect(await openWithPendingReplacement(dataRoot, open)).toEqual(refused);
      expect(entries(dataRoot)).toEqual(['export-staging', 'objects', 'recovery-objects', 'shell', 'store']);
      expect(readFileSync(join(dataRoot, 'store', 'ai7.sqlite'), 'utf8')).toBe('the store as it is');
      // An open interrupted before the failure was recorded finds it refused again, and still moves nothing.
      expect(await openWithPendingReplacement(dataRoot, open)).toEqual(refused);
      expect(marker()).toBe('original');
      await completeReplacement(dataRoot);
      expect(existsSync(staging())).toBe(false);
    }
  });

  it('resumes moving the data back, however far it had come', async () => {
    // Interrupted while moving the package's data out: part of it moved.
    await prepared();
    mkdirSync(join(staging(), 'previous'));
    for (const entry of ['objects', 'recovery-objects', 'store']) renameSync(join(dataRoot, entry), join(staging(), 'previous', entry));
    for (const entry of ['objects', 'store']) renameSync(join(staging(), 'incoming', entry), join(dataRoot, entry));
    setPhase('discarding');
    mkdirSync(join(staging(), 'discarded'));
    renameSync(join(dataRoot, 'objects'), join(staging(), 'discarded', 'objects'));
    let opened = await openWithPendingReplacement(dataRoot, open);
    expect([opened.store, opened.replacement?.outcome]).toEqual(['original', 'failed']);
    expect(entries(dataRoot)).toEqual(['export-staging', 'objects', 'recovery-objects', 'shell', 'store']);

    // Interrupted while moving the data back: part of it back, the rest still aside.
    rmSync(staging(), { recursive: true, force: true });
    await prepared();
    mkdirSync(join(staging(), 'previous'));
    mkdirSync(join(staging(), 'discarded'));
    for (const entry of ['objects', 'recovery-objects', 'store']) renameSync(join(dataRoot, entry), join(staging(), 'previous', entry));
    renameSync(join(staging(), 'previous', 'store'), join(dataRoot, 'store'));
    setPhase('restoring');
    opened = await openWithPendingReplacement(dataRoot, open);
    expect([opened.store, opened.replacement?.outcome]).toEqual(['original', 'failed']);
    expect(entries(dataRoot)).toEqual(['export-staging', 'objects', 'recovery-objects', 'shell', 'store']);
    expect(readFileSync(join(dataRoot, 'recovery-objects', 'v1', 'kept'), 'utf8')).toBe('recovery');
  });

  it('moves nothing for what is not a replacement', async () => {
    // An interrupted preparation: the package taken in, no intent yet. It goes, and the data stays.
    const { path, sha256 } = await otherPackage();
    await extractReplacement(dataRoot, path, sha256);
    expect(await readPendingReplacement(dataRoot)).toBeNull();
    expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'original', replacement: null });
    expect(existsSync(staging())).toBe(false);

    // A phase that does not read is not AI7's: nothing more is moved, and the open is refused.
    await prepared();
    writeFileSync(join(staging(), 'phase.json'), '"sideways"');
    await expect(openWithPendingReplacement(dataRoot, open)).rejects.toMatchObject({ code: 'DATABASE_REPLACEMENT_INTERRUPTED' });
    writeFileSync(join(staging(), 'phase.json'), '{not json');
    await expect(openWithPendingReplacement(dataRoot, open)).rejects.toBeInstanceOf(DatabaseReplacementError);
    expect(marker()).toBe('original');
    expect(entries(join(staging(), 'incoming'))).toEqual(['objects', 'store']);
    // `completeReplacement` leaves a place whose apply has not finished.
    await completeReplacement(dataRoot);
    expect(existsSync(staging())).toBe(true);

    // A place AI7 never made — here a file — is removed as itself, and the data stays.
    rmSync(staging(), { recursive: true, force: true });
    writeFileSync(staging(), 'not a place');
    expect(await openWithPendingReplacement(dataRoot, open)).toEqual({ store: 'original', replacement: null });
    expect(existsSync(staging())).toBe(false);
  });

  it('takes only the package that was previewed, and nothing of one that fails', async () => {
    const { path } = await otherPackage();
    await expect(extractReplacement(dataRoot, path, 'a'.repeat(64))).rejects.toMatchObject({ code: 'DATABASE_REPLACEMENT_STALE' });
    expect(existsSync(staging())).toBe(false);
    writeFileSync(join(root, 'not-a-package.ai7db'), 'words');
    await expect(extractReplacement(dataRoot, join(root, 'not-a-package.ai7db'), 'a'.repeat(64))).rejects.toMatchObject({ code: 'DATABASE_PACKAGE_INVALID' });
    expect(existsSync(staging())).toBe(false);
  });

  it('reads a package against this AI7: the same Data Version, and a schema revision it knows', () => {
    expect(importCompatibility({ dataVersion: 1, schemaRevision: 55 }, 1, 57)).toBe('compatible');
    expect(importCompatibility({ dataVersion: 1, schemaRevision: 57 }, 1, 57)).toBe('compatible');
    expect(importCompatibility({ dataVersion: 1, schemaRevision: 58 }, 1, 57)).toBe('newer-schema');
    expect(importCompatibility({ dataVersion: 2, schemaRevision: 12 }, 1, 57)).toBe('newer-data-version');
    expect(importCompatibility({ dataVersion: 1, schemaRevision: 57 }, 2, 60)).toBe('older-data-version');
    expect(preReplaceBackupFileName(new Date(2026, 8, 25, 22, 30, 5))).toBe('AI7 替换前备份 2026-09-25 22-30-05.ai7db');
  });
});

describe('reading a small file within its bound (Issue #434 review)', () => {
  it('reads a file up to its bound, and nothing past it or that is not a file', async () => {
    const path = join(root, 'note.json');
    expect(await readSmallFile(path, 8)).toBeNull();
    writeFileSync(path, '12345678');
    expect(await readSmallFile(path, 8)).toBe('12345678');
    writeFileSync(path, '123456789');
    await expect(readSmallFile(path, 8)).rejects.toThrow();
    rmSync(path);
    mkdirSync(path);
    await expect(readSmallFile(path, 8)).rejects.toThrow();
  });

  it('never takes more of a file that grows once it was inspected than it had then, and refuses it', async () => {
    const path = join(root, 'note.json');
    writeFileSync(path, JSON.stringify('changed'));
    // The file grows by a mebibyte the moment its handle has been inspected: every read asks for at most one byte more than it
    // had when it was.
    const probe = await openFile(path, 'r');
    const prototype = Object.getPrototypeOf(probe) as FileHandle;
    await probe.close();
    const { stat, read } = prototype;
    const asked: number[] = [];
    const inspected = vi.spyOn(prototype, 'stat').mockImplementation((async function (this: FileHandle, ...args: never[]) {
      const held = await (stat as (...rest: never[]) => Promise<unknown>).apply(this, args);
      appendFileSync(path, Buffer.alloc(1 << 20, 0x20));
      return held;
    }) as never);
    const reading = vi.spyOn(prototype, 'read').mockImplementation((function (this: FileHandle, ...args: never[]) {
      asked.push((args[0] as unknown as Buffer).length);
      return (read as (...rest: never[]) => Promise<unknown>).apply(this, args);
    }) as never);
    try {
      await expect(readSmallFile(path, 64)).rejects.toThrow();
    } finally {
      inspected.mockRestore();
      reading.mockRestore();
    }
    expect(asked.length).toBeGreaterThan(0);
    expect(Math.max(...asked)).toBe(JSON.stringify('changed').length + 1);
  });
});
