import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/**
 * The Research Snapshot Cache (ADR 0074 §3, ADR 0080 §7.4, Issue #473 S87-f3a): the bytes a platform tool brought back —
 * one search service answer or one fetched public page — kept in protected local staging beside the Provider Result Cache,
 * keyed by the canonical-argument digest of the call that produced them. A query is sent once and answered from here
 * across Runs; a fetched page is retrieved once. The root is the Provider Result Cache's own root, which the launch form
 * already holds outside every checkout; nothing here is logged, uploaded, projected, or committed, and the bytes reach the
 * repository only through the reviewed fixture-generation tool.
 */
export const RESEARCH_SNAPSHOT_DIRECTORY = 'research-snapshots';

/** One captured result: where the bytes came from, when, their digest and size, the raw bytes, and the text the model saw. */
export interface ResearchSnapshot {
  readonly kind: 'search-call' | 'fetch';
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

  /** The entry of one (kind, canonical-argument digest) pair, joined through canonical JSON as the result cache joins its key. */
  #entryPath(kind: ResearchSnapshot['kind'], argumentsDigest: string): string {
    if (!DIGEST.test(argumentsDigest)) {
      throw new ResearchSnapshotCacheError('RESEARCH_SNAPSHOT_KEY_INVALID', 'Research Snapshot Cache 的键必须是参数摘要。');
    }
    const key = createHash('sha256').update(JSON.stringify([kind, argumentsDigest]), 'utf8').digest('hex');
    return join(this.#root, `${key}.json`);
  }

  /** The snapshot of an identical call, or `null`. A hit means nothing leaves the host. */
  async lookup(kind: ResearchSnapshot['kind'], argumentsDigest: string): Promise<ResearchSnapshot | null> {
    try {
      const entry = JSON.parse(await readFile(this.#entryPath(kind, argumentsDigest), 'utf8')) as ResearchSnapshot;
      return entry.kind === kind && entry.argumentsDigest === argumentsDigest ? entry : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /** Keep one result. The response digest must be the digest of the bytes kept, or nothing is written. */
  async store(snapshot: ResearchSnapshot): Promise<void> {
    const bytes = Buffer.from(snapshot.bodyBase64, 'base64');
    if (bytes.byteLength !== snapshot.responseBytes || createHash('sha256').update(bytes).digest('hex') !== snapshot.responseDigest) {
      throw new ResearchSnapshotCacheError('RESEARCH_SNAPSHOT_DIGEST_MISMATCH', 'Research Snapshot Cache 记录的摘要与字节不一致。');
    }
    await writeFile(this.#entryPath(snapshot.kind, snapshot.argumentsDigest), `${JSON.stringify(snapshot)}\n`, 'utf8');
  }
}
