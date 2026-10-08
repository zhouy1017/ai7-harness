import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/**
 * The Research Snapshot Cache (ADR 0074 §3, ADR 0080 §7.4, Issue #473 S87-f3a): the bytes a platform tool brought back —
 * one search service answer or one fetched public page — kept in protected local staging beside the Provider Result Cache,
 * keyed by where the call went and the canonical-argument digest of the call. A query is sent once and answered from here
 * across Runs; a fetched page is retrieved once. The root is the Provider Result Cache's own root, which the launch form
 * already holds outside every checkout; nothing here is logged, uploaded, projected, or committed, and the bytes reach the
 * repository only through the reviewed fixture-generation tool.
 *
 * An entry is written whole or not at all (a temporary file renamed into place), and read back only when it is intact: an
 * unreadable, torn, or tampered entry is a miss, which the next call answers live and overwrites — never a failure that
 * holds every later Run.
 */
export const RESEARCH_SNAPSHOT_DIRECTORY = 'research-snapshots';

/** One captured result: where the bytes came from, when, their digest and size, the raw bytes, and the text the model saw. */
export interface ResearchSnapshot {
  readonly kind: 'search-call' | 'fetch';
  /**
   * Where the call went, as the rule named it: the search service and its host for a search (a later rule naming another
   * service or host never replays this one), the fetch tool for a page (whose URL is in its arguments).
   */
  readonly origin: string;
  readonly argumentsDigest: string;
  readonly url: string;
  readonly retrievedAt: string;
  readonly status: number;
  readonly contentType: string | null;
  /** SHA-256 over the raw response bytes. */
  readonly responseDigest: string;
  readonly responseBytes: number;
  /** The raw response bytes, base64; bounded by the tool's own cap before they are kept. */
  readonly bodyBase64: string;
  /** The text the tool returned to the model, after extraction or conversion and its character cap. */
  readonly text: string;
}

export class ResearchSnapshotCacheError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ResearchSnapshotCacheError';
  }
}

const DIGEST = /^[0-9a-f]{64}$/u;

/** Whether the bytes an entry keeps are the bytes its digest and size name. */
function bytesMatch(snapshot: Pick<ResearchSnapshot, 'bodyBase64' | 'responseBytes' | 'responseDigest'>): boolean {
  const bytes = Buffer.from(snapshot.bodyBase64, 'base64');
  return bytes.byteLength === snapshot.responseBytes && createHash('sha256').update(bytes).digest('hex') === snapshot.responseDigest;
}

/** Whether a parsed entry is a whole, untampered snapshot of exactly this key. */
function intactEntry(entry: unknown, kind: ResearchSnapshot['kind'], origin: string, argumentsDigest: string): entry is ResearchSnapshot {
  if (entry === null || typeof entry !== 'object') return false;
  const value = entry as Record<string, unknown>;
  return value['kind'] === kind && value['origin'] === origin && value['argumentsDigest'] === argumentsDigest &&
    typeof value['url'] === 'string' && typeof value['retrievedAt'] === 'string' && Number.isSafeInteger(value['status']) &&
    (value['contentType'] === null || typeof value['contentType'] === 'string') && typeof value['text'] === 'string' &&
    typeof value['bodyBase64'] === 'string' && typeof value['responseDigest'] === 'string' && DIGEST.test(value['responseDigest']) &&
    Number.isSafeInteger(value['responseBytes']) &&
    bytesMatch(value as unknown as Pick<ResearchSnapshot, 'bodyBase64' | 'responseBytes' | 'responseDigest'>);
}

export class ResearchSnapshotCache {
  readonly #root: string;

  constructor(providerCacheRoot: string) {
    if (!isAbsolute(providerCacheRoot)) {
      throw new ResearchSnapshotCacheError('RESEARCH_SNAPSHOT_ROOT_INVALID', 'Research Snapshot Cache 根目录必须是绝对路径。');
    }
    this.#root = join(providerCacheRoot, RESEARCH_SNAPSHOT_DIRECTORY);
  }

  get root(): string {
    return this.#root;
  }

  async open(): Promise<void> {
    await mkdir(this.#root, { recursive: true });
  }

  /** The entry of one (kind, origin, canonical-argument digest), joined through canonical JSON as the result cache joins its key. */
  entryPath(kind: ResearchSnapshot['kind'], origin: string, argumentsDigest: string): string {
    if (!DIGEST.test(argumentsDigest) || origin.length === 0) {
      throw new ResearchSnapshotCacheError('RESEARCH_SNAPSHOT_KEY_INVALID', 'Research Snapshot Cache 的键必须是来源与参数摘要。');
    }
    const key = createHash('sha256').update(JSON.stringify([kind, origin, argumentsDigest]), 'utf8').digest('hex');
    return join(this.#root, `${key}.json`);
  }

  /** The intact snapshot of an identical call, or `null` — absent, unreadable, torn, and tampered entries all read as a miss. */
  async lookup(kind: ResearchSnapshot['kind'], origin: string, argumentsDigest: string): Promise<ResearchSnapshot | null> {
    const path = this.entryPath(kind, origin, argumentsDigest);
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      // Absent, or unreadable however (a directory in its place, a permission, a lock): a miss, never a failure that
      // holds every later Run; the next call answers live and its store replaces the entry.
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    return intactEntry(parsed, kind, origin, argumentsDigest) ? parsed : null;
  }

  /** Keep one result, whole: written beside its place and renamed into it. Bytes that do not match their digest are refused. */
  async store(snapshot: ResearchSnapshot): Promise<void> {
    if (!bytesMatch(snapshot)) {
      throw new ResearchSnapshotCacheError('RESEARCH_SNAPSHOT_DIGEST_MISMATCH', 'Research Snapshot Cache 记录的摘要与字节不一致。');
    }
    const path = this.entryPath(snapshot.kind, snapshot.origin, snapshot.argumentsDigest);
    const staging = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(staging, `${JSON.stringify(snapshot)}\n`, 'utf8');
      try {
        await rename(staging, path);
      } catch {
        // Whatever occupies the entry's place and could not be read is replaced, once.
        await rm(path, { recursive: true, force: true });
        await rename(staging, path);
      }
    } catch (error) {
      await rm(staging, { force: true });
      throw error;
    }
  }
}
