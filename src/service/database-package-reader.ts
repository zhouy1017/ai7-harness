import { createHash } from 'node:crypto';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { Inflate, strFromU8 } from 'fflate';
import type { DatabaseExportContentsProjection } from '../shared/protocol.js';
import { DIGEST_PATTERN, isRecord, parseCanonicalJson } from './analysis/canonical.js';
import {
  DATABASE_PACKAGE_EXCLUDED_ROOTS,
  DATABASE_PACKAGE_MANIFEST_MEMBER,
  DATABASE_PACKAGE_SCHEMA,
  DATABASE_PACKAGE_STORE_MEMBER,
  type DatabasePackageMember,
  type DatabasePackageOrigin,
} from './database-exports.js';

/**
 * Reading a database package (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.4). A package is read through its
 * ZIP central directory, member by member, never whole: its entries are streamed, stored or deflated, so their ends are known
 * only from the directory. Everything is verified before anything is believed: the manifest's shape, each member's path —
 * relative, inside the Agent Data Root, never one of the places a package does not carry — the members exactly the
 * directory's entries, and each member's size and digest. A package that fails any of it is refused, as not a package or as
 * damaged, and nothing is taken from it.
 */

export class DatabasePackageError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DatabasePackageError';
  }
}

const NOT_A_PACKAGE = '这个文件不是 AI7 数据库文件。';
const DAMAGED = '数据库文件已损坏，无法使用。';

function requireShape(condition: unknown): asserts condition {
  if (!condition) throw new DatabasePackageError('DATABASE_PACKAGE_INVALID', NOT_A_PACKAGE);
}

function requireIntact(condition: unknown): asserts condition {
  if (!condition) throw new DatabasePackageError('DATABASE_PACKAGE_DAMAGED', DAMAGED);
}

/** What a package says of itself, verified. */
export interface DatabasePackageManifest {
  readonly schema: typeof DATABASE_PACKAGE_SCHEMA;
  readonly dataVersion: number;
  readonly softwareVersion: string;
  readonly schemaRevision: number;
  readonly createdAt: string;
  readonly origin: DatabasePackageOrigin;
  readonly contents: DatabaseExportContentsProjection;
  readonly members: ReadonlyArray<DatabasePackageMember>;
}

interface ZipEntry {
  readonly name: string;
  readonly method: 0 | 8;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
}

const ORIGINS: ReadonlyArray<string> = ['database-export', 'scheduled-backup', 'pre-replace-backup', 'pre-merge-backup'];
export const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
/**
 * The most a package's central directory may take, checked before it is read (Issue #434 review): 65,534 entries with names of
 * two hundred bytes on average, far past any package AI7 writes.
 */
export const MAX_DIRECTORY_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 1 << 20;
/** How much deflated input is inflated at once, so what one step can produce stays bounded however far the data expands. */
const INFLATE_INPUT_BYTES = 16 * 1024;
/** A member's path: relative segments of ordinary characters, never `.` or `..`. */
const MEMBER_PATH = /^[^/\\:*?"<>|\u0000-\u001f]+(?:\/[^/\\:*?"<>|\u0000-\u001f]+)*$/u;

/** A segment Windows would take as a device, or would change by dropping its trailing dot. */
const UNPORTABLE_SEGMENT = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$|\.$/iu;

/**
 * A member's path is one this package may carry: the store's copy, or a file of the Agent Data Root outside its excluded
 * places — each compared without regard to case, as Windows and macOS compare names — and one every system writes as named.
 */
export function isPackageMemberPath(path: string): boolean {
  const segments = path.split('/');
  if (!MEMBER_PATH.test(path) || segments.some((segment) => segment.trim() !== segment || UNPORTABLE_SEGMENT.test(segment))) return false;
  const folded = path.toLowerCase();
  if (folded === DATABASE_PACKAGE_STORE_MEMBER) return path === DATABASE_PACKAGE_STORE_MEMBER;
  return folded !== DATABASE_PACKAGE_MANIFEST_MEMBER && !DATABASE_PACKAGE_EXCLUDED_ROOTS.has(segments[0]!.toLowerCase());
}

function isContents(value: unknown): value is DatabaseExportContentsProjection {
  return isRecord(value) && Object.keys(value).length === 4 &&
    (['books', 'sourceVersions', 'libraryMaterials', 'series'] as const).every((key) =>
      typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && (value[key] as number) >= 0);
}

function isMember(value: unknown): value is DatabasePackageMember {
  return isRecord(value) && Object.keys(value).length === 3 && typeof value.path === 'string' && isPackageMemberPath(value.path) &&
    typeof value.bytes === 'number' && Number.isSafeInteger(value.bytes) && value.bytes >= 0 &&
    typeof value.sha256 === 'string' && DIGEST_PATTERN.test(value.sha256);
}

function readManifest(bytes: Uint8Array): DatabasePackageManifest {
  let value: unknown;
  try {
    value = parseCanonicalJson(strFromU8(bytes));
  } catch {
    requireShape(false);
  }
  requireShape(isRecord(value));
  requireShape(Object.keys(value).length === 9 && value.schema === DATABASE_PACKAGE_SCHEMA && value.credentials === 'excluded');
  requireShape(typeof value.dataVersion === 'number' && Number.isSafeInteger(value.dataVersion) && value.dataVersion >= 1);
  requireShape(typeof value.schemaRevision === 'number' && Number.isSafeInteger(value.schemaRevision) && value.schemaRevision >= 1);
  requireShape(typeof value.softwareVersion === 'string' && value.softwareVersion.length >= 1 && value.softwareVersion.length <= 64);
  requireShape(typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt)) && new Date(value.createdAt).toISOString() === value.createdAt);
  requireShape(typeof value.origin === 'string' && ORIGINS.includes(value.origin));
  requireShape(isContents(value.contents));
  requireShape(Array.isArray(value.members) && value.members.every(isMember));
  const members = value.members as DatabasePackageMember[];
  // Two members one system would write as one file are not a package.
  requireShape(new Set(members.map((member) => member.path.toLowerCase())).size === members.length &&
    members.some((member) => member.path === DATABASE_PACKAGE_STORE_MEMBER));
  return {
    schema: DATABASE_PACKAGE_SCHEMA,
    dataVersion: value.dataVersion,
    softwareVersion: value.softwareVersion,
    schemaRevision: value.schemaRevision,
    createdAt: value.createdAt,
    origin: value.origin as DatabasePackageOrigin,
    contents: value.contents,
    members,
  };
}

async function readAt(handle: FileHandle, length: number, position: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(buffer, filled, length - filled, position + filled);
    requireIntact(bytesRead > 0);
    filled += bytesRead;
  }
  return buffer;
}

/** The ZIP central directory's entries: every one stored or deflated, none encrypted, none named twice. */
async function readDirectory(handle: FileHandle, fileSize: number): Promise<ZipEntry[]> {
  requireShape(fileSize >= 22);
  const tailSize = Math.min(fileSize, 22 + 0xffff);
  const tail = await readAt(handle, tailSize, fileSize - tailSize);
  let end = -1;
  for (let index = tailSize - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === 0x06054b50) {
      end = index;
      break;
    }
  }
  requireShape(end >= 0);
  const count = tail.readUInt16LE(end + 10);
  const directorySize = tail.readUInt32LE(end + 12);
  const directoryOffset = tail.readUInt32LE(end + 16);
  requireShape(count > 0 && directoryOffset + directorySize <= fileSize);
  // Bounded before it is read: a directory the archive claims is larger is not one of a package's.
  requireShape(directorySize <= MAX_DIRECTORY_BYTES && count * 46 <= directorySize);
  const directory = await readAt(handle, directorySize, directoryOffset);
  const entries: ZipEntry[] = [];
  let position = 0;
  for (let index = 0; index < count; index += 1) {
    requireShape(position + 46 <= directory.length && directory.readUInt32LE(position) === 0x02014b50);
    const flags = directory.readUInt16LE(position + 8);
    const method = directory.readUInt16LE(position + 10);
    const compressedSize = directory.readUInt32LE(position + 20);
    const size = directory.readUInt32LE(position + 24);
    const nameLength = directory.readUInt16LE(position + 28);
    const extraLength = directory.readUInt16LE(position + 30);
    const commentLength = directory.readUInt16LE(position + 32);
    const offset = directory.readUInt32LE(position + 42);
    requireShape(position + 46 + nameLength <= directory.length);
    const name = directory.subarray(position + 46, position + 46 + nameLength).toString('utf8');
    requireShape((flags & 1) === 0 && (method === 0 || method === 8) && compressedSize !== 0xffffffff && size !== 0xffffffff && offset !== 0xffffffff);
    // A stored entry is its own bytes: its two sizes are one.
    requireShape(method === 8 || compressedSize === size);
    requireShape(offset + 30 + compressedSize <= fileSize);
    entries.push({ name, method, compressedSize, size, offset });
    position += 46 + nameLength + extraLength + commentLength;
  }
  requireShape(new Set(entries.map((entry) => entry.name)).size === entries.length);
  return entries;
}

/**
 * Stream one entry's uncompressed bytes, from its local header on, never past the size its entry declares (Issue #434
 * review): deflated data is inflated a little at a time, and an entry that would come to more than it declares — or ends
 * short of it — is damage, refused before any byte past the declared size is kept or handed on.
 */
async function streamEntry(handle: FileHandle, entry: ZipEntry, onData: (chunk: Uint8Array) => Promise<void>): Promise<void> {
  const header = await readAt(handle, 30, entry.offset);
  requireIntact(header.readUInt32LE(0) === 0x04034b50);
  let position = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  let remaining = entry.compressedSize;
  let produced = 0;
  let overflow = false;
  const out: Uint8Array[] = [];
  // What comes past the declared size is not kept: the entry is damage, whatever else it holds.
  const take = (chunk: Uint8Array): void => {
    if (overflow || produced + chunk.byteLength > entry.size) {
      overflow = true;
      return;
    }
    produced += chunk.byteLength;
    out.push(chunk);
  };
  const deliver = async (): Promise<void> => {
    requireIntact(!overflow);
    while (out.length > 0) await onData(out.shift()!);
  };
  let failure: unknown = null;
  const inflater = entry.method === 8 ? new Inflate((chunk) => take(chunk)) : null;
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  if (inflater !== null && remaining === 0) inflater.push(new Uint8Array(0), true);
  while (remaining > 0) {
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, remaining), position);
    requireIntact(bytesRead > 0);
    position += bytesRead;
    remaining -= bytesRead;
    if (inflater === null) {
      take(Uint8Array.from(buffer.subarray(0, bytesRead)));
      await deliver();
      continue;
    }
    for (let start = 0; start < bytesRead; start += INFLATE_INPUT_BYTES) {
      const end = Math.min(bytesRead, start + INFLATE_INPUT_BYTES);
      try {
        inflater.push(Uint8Array.from(buffer.subarray(start, end)), remaining === 0 && end === bytesRead);
      } catch (error) {
        failure = error;
      }
      requireIntact(failure === null);
      await deliver();
    }
  }
  requireIntact(!overflow && produced === entry.size);
}

/** A package verified whole: its own size and digest, and what it says of itself. */
export interface VerifiedDatabasePackage {
  readonly bytes: number;
  readonly sha256: string;
  readonly manifest: DatabasePackageManifest;
}

/**
 * Verify the package at `path`: a regular file, a ZIP whose entries are exactly its manifest and the members it names, each
 * member's size and digest as named. `visit` receives each member's bytes as they are verified, so a caller can take them
 * without reading the package twice; a member is complete only once verification returns.
 */
export async function verifyDatabasePackage(
  path: string,
  visit?: { begin(member: DatabasePackageMember): Promise<void>; data(chunk: Uint8Array): Promise<void>; end(): Promise<void> },
): Promise<VerifiedDatabasePackage> {
  let info;
  try {
    info = await lstat(path);
  } catch {
    throw new DatabasePackageError('DATABASE_PACKAGE_UNREADABLE', '无法读取所选的数据库文件。');
  }
  requireShape(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 0xffffffff);
  let handle: FileHandle;
  try {
    handle = await open(path, 'r');
  } catch {
    throw new DatabasePackageError('DATABASE_PACKAGE_UNREADABLE', '无法读取所选的数据库文件。');
  }
  try {
    const whole = createHash('sha256');
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      whole.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    requireIntact(position === info.size);
    const entries = await readDirectory(handle, info.size);
    const manifestEntry = entries.find((entry) => entry.name === DATABASE_PACKAGE_MANIFEST_MEMBER);
    requireShape(manifestEntry !== undefined && manifestEntry.size <= MAX_MANIFEST_BYTES);
    const manifestChunks: Uint8Array[] = [];
    await streamEntry(handle, manifestEntry, async (chunk) => { manifestChunks.push(chunk); });
    const manifest = readManifest(Buffer.concat(manifestChunks));
    const byName = new Map(entries.filter((entry) => entry !== manifestEntry).map((entry) => [entry.name, entry]));
    requireShape(byName.size === manifest.members.length && manifest.members.every((member) => byName.get(member.path)?.size === member.bytes));
    for (const member of manifest.members) {
      const hash = createHash('sha256');
      let bytes = 0;
      await visit?.begin(member);
      await streamEntry(handle, byName.get(member.path)!, async (chunk) => {
        hash.update(chunk);
        bytes += chunk.byteLength;
        await visit?.data(chunk);
      });
      requireIntact(bytes === member.bytes && hash.digest('hex') === member.sha256);
      await visit?.end();
    }
    return { bytes: info.size, sha256: whole.digest('hex'), manifest };
  } finally {
    await handle.close();
  }
}
