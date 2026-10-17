import { createHash, randomUUID } from 'node:crypto';
import { open, rm, type FileHandle } from 'node:fs/promises';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { fixedArchiveTime } from '../shared/archive-time.js';
import { stagedPathFor } from './manuscript-export.js';

const MAX_ZIP_BYTES = 0xffff_ffff;
const CHUNK_BYTES = 1 << 20;

function archiveEntry(name: string, compressed: boolean): ZipPassThrough | ZipDeflate {
  if (compressed) {
    const entry = new ZipDeflate(name, { level: 6 });
    entry.mtime = fixedArchiveTime();
    return entry;
  }
  const entry = new ZipPassThrough(name);
  entry.mtime = fixedArchiveTime();
  return entry;
}

/** The database-export ZIP pattern, with back pressure between input chunks and no ZIP64. */
export class BookDeliveryPackageArchiveWriter {
  readonly path: string;
  readonly #handle: FileHandle;
  readonly #hash = createHash('sha256');
  readonly #zip: Zip;
  #pending: Promise<void> = Promise.resolve();
  #error: unknown;
  #bytes = 0;
  #members = 0;

  private constructor(path: string, handle: FileHandle) {
    this.path = path;
    this.#handle = handle;
    this.#zip = new Zip((error, chunk) => {
      if (error) { this.#error = error; return; }
      this.#bytes += chunk.byteLength;
      if (this.#bytes > MAX_ZIP_BYTES) { this.#error = new Error('数据超过 4 GB'); return; }
      this.#hash.update(chunk);
      this.#pending = this.#pending.then(async () => { await this.#handle.writeFile(chunk); });
      // Keep a rejection observed even before the current push returns.
      void this.#pending.catch((failure: unknown) => { this.#error = failure; });
    });
  }

  static async create(destination: string, exportId: string): Promise<BookDeliveryPackageArchiveWriter> {
    const path = stagedPathFor(destination, exportId, randomUUID());
    return new BookDeliveryPackageArchiveWriter(path, await open(path, 'wx', 0o600));
  }

  async add(name: string, bytes: Uint8Array, compressed: boolean, checkCancelled?: () => void): Promise<void> {
    checkCancelled?.();
    if (++this.#members > 65_534 || bytes.byteLength > MAX_ZIP_BYTES) throw new Error('数据超过 4 GB');
    const entry = archiveEntry(name, compressed);
    this.#zip.add(entry);
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      checkCancelled?.();
      const end = Math.min(bytes.length, offset + CHUNK_BYTES);
      entry.push(bytes.subarray(offset, end), end === bytes.length);
      await this.#flush();
    }
    if (bytes.length === 0) entry.push(bytes, true);
    await this.#flush();
  }

  async finish(): Promise<{ path: string; bytes: number; sha256: string }> {
    this.#zip.end();
    await this.#flush();
    await this.#handle.sync();
    return { path: this.path, bytes: this.#bytes, sha256: this.#hash.digest('hex') };
  }

  async dispose(): Promise<void> {
    this.#zip.terminate();
    try { await this.#pending; } catch { /* The caller records the classified failure. */ }
    await this.#handle.close();
    await rm(this.path, { force: true });
  }

  async #flush(): Promise<void> {
    await this.#pending;
    if (this.#error !== undefined) throw this.#error;
  }
}
