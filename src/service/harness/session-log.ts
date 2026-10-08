import { closeSync, existsSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
import type { PersistenceBackend, SessionPersistenceRevision, StoredPrefix } from '@deepseek-ai/dsh-session-persistence';

/**
 * The Harness Session Ledger made durable (Issue #52, plan slice S17a; UI ADR 0014, ADR 0011; the Owner, 2026-10-07): the DSH
 * Session log itself, written under the Agent Data Root through DSH's own persistence seam — `dsh-session-persistence`'s
 * `PersistenceCoordinator` buffers, serializes and drains, and this backend is only its storage primitive, one append-only
 * JSONL file per technical Session. AI7's own records never copy the log: a dialogue's Execution Binding and Harness
 * Execution Span name a Session and a range of its sequence numbers, and its question and answer are read back here.
 *
 * The file's first line is the Session's header and every later line one event, exactly as DSH recorded it. A line is
 * written whole and then synced; a line cut off by a crash has no newline, and a read drops it as the torn tail it is.
 * A complete line that does not parse is damage, and a read refuses it rather than guess.
 *
 * Nothing here imports a DSH runtime value, so the module may load before the service installs network denial; the
 * service that plugs this backend into a Cordis context is built in `primary-agent-harness.ts` after the dynamic imports.
 */
export const HARNESS_SESSION_LOG_DIRECTORY = 'harness-sessions' as const;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
/** The most one log may hold; a dialogue turn is a few hundred events at most. */
const MAX_LOG_BYTES = 32 * 1024 * 1024;

export class HarnessSessionLogError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'HarnessSessionLogError';
  }
}

function requireLog(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new HarnessSessionLogError(code, message);
}

/** One stored event as AI7 reads it back: the envelope DSH wrote, its payload left as recorded. */
export interface StoredHarnessEvent {
  readonly seq: number;
  readonly type: string;
  readonly time: number;
  readonly data: unknown;
}

export interface StoredHarnessLog {
  readonly header: SessionHeader;
  readonly events: ReadonlyArray<StoredHarnessEvent>;
  /** The byte offset a torn final line starts at, when the log ends in one. */
  readonly tornOffset: number | undefined;
  readonly bytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function harnessSessionLogPath(root: string, sessionId: string): string {
  requireLog(isAbsolute(root) && SESSION_ID_PATTERN.test(sessionId), 'HARNESS_SESSION_LOG_INVALID', '技术会话标识无效。');
  return join(root, `${sessionId}.jsonl`);
}

/**
 * A Session log's length, read without reading the log; `null` when there is none. A log is a plain file — never a link or a
 * directory — within its bound, or it is refused as damaged.
 */
export function harnessSessionLogBytes(root: string, sessionId: string): number | null {
  const path = harnessSessionLogPath(root, sessionId);
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    return null;
  }
  requireLog(metadata.isFile() && !metadata.isSymbolicLink(), 'HARNESS_SESSION_LOG_INVALID', '技术会话记录不是普通文件。');
  requireLog(metadata.size <= MAX_LOG_BYTES, 'HARNESS_SESSION_LOG_TOO_LARGE', '技术会话记录超出安全大小。');
  return metadata.size;
}

/**
 * Read one Session's log as it stands: its header, its contiguous events and the torn tail, if any. `null` when the Session
 * has no log here — never written, or a log whose header line itself was cut off, which held nothing.
 */
export function readHarnessSessionLog(root: string, sessionId: string): StoredHarnessLog | null {
  if (harnessSessionLogBytes(root, sessionId) === null) return null;
  const bytes = readFileSync(harnessSessionLogPath(root, sessionId));
  requireLog(bytes.length <= MAX_LOG_BYTES, 'HARNESS_SESSION_LOG_TOO_LARGE', '技术会话记录超出安全大小。');
  const lines: Array<{ text: string; offset: number }> = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    lines.push({ text: bytes.subarray(start, index).toString('utf8'), offset: start });
    start = index + 1;
  }
  const tornOffset = start < bytes.length ? start : undefined;
  if (lines.length === 0) return null;
  let header: unknown;
  try {
    header = JSON.parse(lines[0]!.text) as unknown;
  } catch {
    throw new HarnessSessionLogError('HARNESS_SESSION_LOG_CORRUPT', '技术会话记录的头部已损坏。');
  }
  requireLog(isRecord(header) && header.id === sessionId && typeof header.version === 'number' && typeof header.createdAt === 'number',
    'HARNESS_SESSION_LOG_CORRUPT', '技术会话记录的头部与会话不一致。');
  const events: StoredHarnessEvent[] = [];
  for (const line of lines.slice(1)) {
    let event: unknown;
    try {
      event = JSON.parse(line.text) as unknown;
    } catch {
      throw new HarnessSessionLogError('HARNESS_SESSION_LOG_CORRUPT', '技术会话记录中有一条事件已损坏。');
    }
    requireLog(isRecord(event) && event.seq === events.length && typeof event.type === 'string' && typeof event.time === 'number' && 'data' in event,
      'HARNESS_SESSION_LOG_CORRUPT', '技术会话记录的事件序号不连续。');
    events.push(event as unknown as StoredHarnessEvent);
  }
  return { header: header as unknown as SessionHeader, events, tornOffset, bytes: bytes.length };
}

/** Only a log's header, from its first line: what a listing reads without parsing every event. */
export function readHarnessSessionHeader(root: string, sessionId: string): SessionHeader | null {
  try {
    if (harnessSessionLogBytes(root, sessionId) === null) return null;
  } catch {
    return null;
  }
  const bytes = readFileSync(harnessSessionLogPath(root, sessionId));
  const end = bytes.indexOf(0x0a);
  if (end === -1) return null;
  try {
    const header = JSON.parse(bytes.subarray(0, end).toString('utf8')) as unknown;
    return isRecord(header) && header.id === sessionId ? header as unknown as SessionHeader : null;
  } catch {
    return null;
  }
}

/** Sync a directory's entries, where the system lets a directory be opened for it; Windows does not, and NTFS journals them. */
export function syncDirectory(directory: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(directory, 'r');
    fsyncSync(fd);
  } catch {
    // Nothing to sync on this system.
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function writeAll(fd: number, text: string): void {
  const buffer = Buffer.from(text, 'utf8');
  let written = 0;
  while (written < buffer.length) written += writeSync(fd, buffer, written, buffer.length - written);
}

function lines(values: ReadonlyArray<unknown>): string {
  return values.map((value) => `${JSON.stringify(value)}\n`).join('');
}

/**
 * The storage primitive `PersistenceCoordinator` drives: one JSONL file per Session under `root`. The torn marker is the byte
 * offset the torn line starts at. Every write is synced before it returns, so `append` resolves only once durable.
 */
export class HarnessSessionLogBackend implements PersistenceBackend<number> {
  readonly name = 'ai7-harness-session-log';
  readonly #root: string;

  constructor(root: string) {
    requireLog(isAbsolute(root), 'HARNESS_SESSION_LOG_INVALID', '技术会话记录的位置无效。');
    this.#root = root;
  }

  get root(): string {
    return this.#root;
  }

  #revision(bytes: number): SessionPersistenceRevision {
    // The log only ever grows by whole lines or is cut back at a torn one, so its length names its revision; the root
    // qualifies it, so two stores' logs of one length never compare equal.
    return `${this.#root}\u0000${bytes}` as unknown as SessionPersistenceRevision;
  }

  loadStored(id: SessionId): Promise<StoredPrefix<number> | undefined> {
    try {
      const stored = readHarnessSessionLog(this.#root, id);
      if (stored === null) return Promise.resolve(undefined);
      return Promise.resolve({
        // Fresh, unaliased values: the coordinator freezes and publishes them in place.
        meta: structuredClone(stored.header),
        events: structuredClone(stored.events) as unknown as SessionEvent[],
        revision: this.#revision(stored.bytes),
        ...(stored.tornOffset === undefined ? {} : { tornMarker: stored.tornOffset }),
      });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  readStoredRevision(id: SessionId): Promise<SessionPersistenceRevision | undefined> {
    try {
      const bytes = harnessSessionLogBytes(this.#root, id);
      return Promise.resolve(bytes === null ? undefined : this.#revision(bytes));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  appendBatch(meta: SessionHeader, events: readonly SessionEvent[], isMaterialized: boolean): Promise<void> {
    try {
      mkdirSync(this.#root, { recursive: true });
      const path = harnessSessionLogPath(this.#root, meta.id);
      // The header and the first batch are one write: a crash between them leaves a file whose header line is torn, which
      // reads as no log at all. A log never grows past what a read takes: an append that would is refused, and the Session
      // the attempt ran in is then not persisted further.
      const text = isMaterialized ? lines(events) : lines([meta, ...events]);
      const before = isMaterialized ? harnessSessionLogBytes(this.#root, meta.id) ?? 0 : 0;
      requireLog(before + Buffer.byteLength(text, 'utf8') <= MAX_LOG_BYTES, 'HARNESS_SESSION_LOG_TOO_LARGE', '技术会话记录超出安全大小。');
      const fd = openSync(path, isMaterialized ? 'a' : 'wx');
      try {
        writeAll(fd, text);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      // A new log's name is made durable with its directory, where the system lets a directory be synced.
      if (!isMaterialized) syncDirectory(this.#root);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  commitRepair(meta: SessionHeader, tornMarker: number | undefined, closers: readonly SessionEvent[]): Promise<void> {
    try {
      const fd = openSync(harnessSessionLogPath(this.#root, meta.id), 'r+');
      try {
        if (tornMarker !== undefined) ftruncateSync(fd, tornMarker);
        if (closers.length > 0) {
          const size = fstatSync(fd).size;
          const buffer = Buffer.from(lines(closers), 'utf8');
          let written = 0;
          while (written < buffer.length) written += writeSync(fd, buffer, written, buffer.length - written, size + written);
        }
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  list(): Promise<SessionHeader[]> {
    if (!existsSync(this.#root)) return Promise.resolve([]);
    const headers: SessionHeader[] = [];
    for (const name of readdirSync(this.#root)) {
      const id = name.endsWith('.jsonl') ? name.slice(0, -'.jsonl'.length) : '';
      if (!SESSION_ID_PATTERN.test(id)) continue;
      const header = readHarnessSessionHeader(this.#root, id);
      if (header !== null) headers.push(header);
    }
    return Promise.resolve(headers);
  }

  locate(meta: SessionHeader): { kind: string; path: string } {
    return { kind: 'jsonl', path: harnessSessionLogPath(this.#root, meta.id) };
  }
}
