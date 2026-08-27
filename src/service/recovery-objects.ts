import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, open, opendir, rm, stat } from 'node:fs/promises';
import { basename, posix } from 'node:path';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_GRAPHEMES,
  MAX_WINDOW_BLOCKS,
  type ManuscriptBlockProjection,
  type RecoveryWindowTarget,
} from '../shared/protocol.js';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../shared/data-root.js';
import type {
  RecoverySnapshotBlock,
  RecoverySnapshotObjectMetadata,
  RecoverySnapshotPlan,
  RecoverySnapshotRecord,
  VerifiedRecoverySnapshot,
} from './bounded-manuscript.js';

const FORMAT = 'ai7.recovery-snapshot/1';
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const OBJECT_NAME_PATTERN = /^([0-9a-f]{64})\.snapshot$/;
const PARTIAL_NAME_PATTERN = /^\.partial-[0-9a-f-]{36}$/i;
const WRITE_BATCH = 256;
const MAX_OBJECT_LINE_BYTES = MAX_BLOCK_CODE_UNITS * 6 + 2_048;

function canonicalJson(value: unknown): string {
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new Error('RECOVERY_OBJECT_INVALID');
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('RECOVERY_OBJECT_INVALID');
  return encoded;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function blockDigest(block: Pick<RecoverySnapshotBlock, 'kind' | 'level' | 'text'>): string {
  return sha256(canonicalJson({ kind: block.kind, level: block.level, text: block.text }));
}

function manifestLine(block: RecoverySnapshotBlock): string {
  return `${canonicalJson({
    blockId: block.blockId,
    digest: block.digest,
    graphemeLength: block.graphemeLength,
    kind: block.kind,
    level: block.level,
    position: block.position,
  })}\n`;
}

function objectLine(value: unknown): string {
  return `${canonicalJson(value)}\n`;
}

type ParsedObject = {
  blocks: ReadonlyArray<RecoverySnapshotBlock>;
  nextPosition: number | null;
};

export class RecoveryObjectStore {
  readonly #dataRoot: string;
  readonly #root: string;

  private constructor(dataRoot: string, root: string) {
    this.#dataRoot = dataRoot;
    this.#root = root;
  }

  static async open(dataRoot: string): Promise<RecoveryObjectStore> {
    const root = await ensureCanonicalDataDirectory(dataRoot, 'recovery-objects', 'v1');
    return new RecoveryObjectStore(dataRoot, root);
  }

  async form(
    plan: RecoverySnapshotPlan,
    load: (afterPosition: number) => ReadonlyArray<RecoverySnapshotBlock>,
  ): Promise<RecoverySnapshotObjectMetadata> {
    const partialName = `.partial-${randomUUID()}`;
    const inspected = await inspectCanonicalDataFile(this.#dataRoot, this.#root, partialName);
    const handle = await open(inspected.path, 'wx', 0o600);
    const objectHash = createHash('sha256');
    const manifestHash = createHash('sha256');
    let byteLength = 0;
    let blockCount = 0;
    let totalGraphemes = 0;
    let promotedPath: string | undefined;
    let promotedByThisCall = false;
    const append = async (line: string): Promise<void> => {
      const bytes = Buffer.from(line, 'utf8');
      const written = await handle.write(bytes);
      if (written.bytesWritten !== bytes.byteLength) throw new Error('RECOVERY_OBJECT_INCOMPLETE');
      objectHash.update(bytes);
      byteLength += bytes.byteLength;
    };
    try {
      await append(objectLine({
        type: 'header', schema: FORMAT, snapshotId: plan.snapshotId, bookId: plan.bookId,
        manuscriptId: plan.manuscriptId, branchId: plan.branchId, revisionId: plan.revisionId,
        revisionLabel: plan.revisionLabel, revisionDigest: plan.expectedWorkingDigest,
        journalSequence: plan.expectedJournalSequence, expectedBlockCount: plan.blockCount,
        expectedTotalGraphemes: plan.totalGraphemes, createdAt: plan.createdAt,
      }));
      let afterPosition = 0;
      while (true) {
        const blocks = load(afterPosition);
        if (blocks.length === 0) break;
        if (blocks.length > WRITE_BATCH) throw new Error('RECOVERY_OBJECT_UNBOUNDED');
        for (const block of blocks) {
          if (block.position !== afterPosition + 1 || block.text.length > MAX_BLOCK_CODE_UNITS ||
              block.graphemeLength > MAX_BLOCK_GRAPHEMES || blockDigest(block) !== block.digest) {
            throw new Error('RECOVERY_OBJECT_INVALID');
          }
          const manifest = manifestLine(block);
          manifestHash.update(manifest);
          await append(objectLine({ type: 'block', ...block }));
          afterPosition = block.position;
          blockCount += 1;
          totalGraphemes += block.graphemeLength;
        }
        if (blocks.length < WRITE_BATCH) break;
      }
      if (blockCount !== plan.blockCount || totalGraphemes !== plan.totalGraphemes) {
        throw new Error('RECOVERY_OBJECT_INCOMPLETE');
      }
      const manifestDigest = manifestHash.digest('hex');
      await append(objectLine({ type: 'footer', manifestDigest, blockCount, totalGraphemes }));
      await handle.sync();
      await handle.close();
      const objectDigest = objectHash.digest('hex');
      const finalName = `${objectDigest}.snapshot`;
      const final = await inspectCanonicalDataFile(this.#dataRoot, this.#root, finalName);
      try {
        await link(inspected.path, final.path);
        promotedByThisCall = true;
        promotedPath = final.path;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      await rm(inspected.path, { force: true });
      const finalHandle = await open(final.path, 'r');
      try { await finalHandle.sync(); } finally { await finalHandle.close(); }
      const metadata = {
        objectDigest, manifestDigest, objectRelativeKey: posix.join('v1', finalName),
        byteLength, blockCount, verifiedAt: new Date().toISOString(), newlyPromoted: promotedByThisCall,
      } satisfies RecoverySnapshotObjectMetadata;
      const provisional: RecoverySnapshotRecord = {
        snapshotId: plan.snapshotId, bookId: plan.bookId, manuscriptId: plan.manuscriptId,
        branchId: plan.branchId, revisionId: plan.revisionId, revisionLabel: plan.revisionLabel,
        revisionDigest: plan.expectedWorkingDigest, journalSequence: plan.expectedJournalSequence,
        totalGraphemes: plan.totalGraphemes, createdAt: plan.createdAt, ...metadata,
      };
      const verified = await this.verify(provisional);
      if (verified.state !== 'eligible') throw new Error('RECOVERY_OBJECT_VERIFY_FAILED');
      return metadata;
    } catch (error) {
      try { await handle.close(); } catch { /* already closed */ }
      await rm(inspected.path, { force: true });
      if (promotedByThisCall && promotedPath !== undefined) await rm(promotedPath, { force: true });
      throw error;
    }
  }

  async verify(record: RecoverySnapshotRecord | null): Promise<VerifiedRecoverySnapshot> {
    if (record === null) return { state: 'none' };
    const located = await this.#locate(record);
    if (located === null) {
      return { state: 'unavailable', snapshotId: record.snapshotId, verification: '对象缺失', limitation: '恢复快照对象缺失，不能选择该证据。' };
    }
    const metadata = await stat(located);
    if (metadata.size !== record.byteLength) {
      return { state: 'unavailable', snapshotId: record.snapshotId, verification: '摘要不匹配', limitation: '恢复快照对象摘要不匹配，不能选择该证据。' };
    }
    try {
      await this.#parse(record, located, null);
      return { state: 'eligible', record };
    } catch (error) {
      if (error instanceof Error && error.message === 'RECOVERY_OBJECT_DIGEST_MISMATCH') {
        return { state: 'unavailable', snapshotId: record.snapshotId, verification: '摘要不匹配', limitation: '恢复快照对象摘要不匹配，不能选择该证据。' };
      }
      return { state: 'unavailable', snapshotId: record.snapshotId, verification: '对象不完整', limitation: '恢复快照对象结构或清单不完整，不能选择该证据。' };
    }
  }

  async readWindow(
    record: RecoverySnapshotRecord,
    target: RecoveryWindowTarget,
  ): Promise<{ blocks: ReadonlyArray<ManuscriptBlockProjection>; nextTarget: RecoveryWindowTarget | null }> {
    const located = await this.#locate(record);
    if (located === null) throw new Error('RECOVERY_OBJECT_MISSING');
    const start = target.kind === 'start' ? 1 : target.position + 1;
    const parsed = await this.#parse(record, located, { start, limit: MAX_WINDOW_BLOCKS });
    if (parsed.blocks.length === 0) throw new Error('RECOVERY_WINDOW_NOT_FOUND');
    return {
      blocks: parsed.blocks.map(({ graphemeLength: _ignored, ...block }) => block),
      nextTarget: parsed.nextPosition === null ? null : { kind: 'after', position: parsed.nextPosition },
    };
  }

  async forEachBatch(record: RecoverySnapshotRecord, consume: (blocks: ReadonlyArray<RecoverySnapshotBlock>) => void): Promise<void> {
    const located = await this.#locate(record);
    if (located === null) throw new Error('RECOVERY_OBJECT_MISSING');
    await this.#parse(record, located, { start: 1, limit: Number.MAX_SAFE_INTEGER, consume });
  }

  async cleanup(isReferenced: (relativeKey: string) => boolean): Promise<void> {
    const directory = await opendir(this.#root);
    for await (const entry of directory) {
      if (!entry.isFile()) continue;
      if (PARTIAL_NAME_PATTERN.test(entry.name)) {
        await rm((await inspectCanonicalDataFile(this.#dataRoot, this.#root, entry.name)).path, { force: true });
      } else if (OBJECT_NAME_PATTERN.test(entry.name) && !isReferenced(posix.join('v1', entry.name))) {
        await rm((await inspectCanonicalDataFile(this.#dataRoot, this.#root, entry.name)).path, { force: true });
      }
    }
  }

  async removeUnreferenced(metadata: RecoverySnapshotObjectMetadata, referenced: boolean): Promise<void> {
    if (referenced || metadata.newlyPromoted !== true) return;
    const name = basename(metadata.objectRelativeKey);
    if (OBJECT_NAME_PATTERN.test(name)) {
      const located = await inspectCanonicalDataFile(this.#dataRoot, this.#root, name);
      if (located.exists) await rm(located.path, { force: true });
    }
  }

  async #locate(record: RecoverySnapshotRecord): Promise<string | null> {
    if (!DIGEST_PATTERN.test(record.objectDigest) || !DIGEST_PATTERN.test(record.manifestDigest) ||
        record.objectRelativeKey !== posix.join('v1', `${record.objectDigest}.snapshot`)) return null;
    const inspected = await inspectCanonicalDataFile(this.#dataRoot, this.#root, `${record.objectDigest}.snapshot`);
    return inspected.exists ? inspected.path : null;
  }

  async #parse(
    record: RecoverySnapshotRecord,
    path: string,
    window: null | { start: number; limit: number; consume?: (blocks: ReadonlyArray<RecoverySnapshotBlock>) => void },
  ): Promise<ParsedObject> {
    const objectHash = createHash('sha256');
    const manifest = createHash('sha256');
    const visible: RecoverySnapshotBlock[] = [];
    let batch: RecoverySnapshotBlock[] = [];
    let headerSeen = false;
    let footerSeen = false;
    let position = 0;
    let totalGraphemes = 0;
    let nextPosition: number | null = null;
    for await (const line of this.#boundedLines(path, objectHash)) {
      if (line.length === 0) throw new Error('RECOVERY_OBJECT_INVALID');
      const value = JSON.parse(line) as Record<string, unknown>;
      if (!headerSeen) {
        if (value.type !== 'header' || value.schema !== FORMAT || value.snapshotId !== record.snapshotId ||
            value.bookId !== record.bookId || value.manuscriptId !== record.manuscriptId || value.branchId !== record.branchId ||
            value.revisionId !== record.revisionId || value.revisionLabel !== record.revisionLabel ||
            value.revisionDigest !== record.revisionDigest || value.journalSequence !== record.journalSequence ||
            value.expectedBlockCount !== record.blockCount || value.expectedTotalGraphemes !== record.totalGraphemes ||
            value.createdAt !== record.createdAt) throw new Error('RECOVERY_OBJECT_INVALID');
        headerSeen = true;
        continue;
      }
      if (value.type === 'footer') {
        if (footerSeen || value.manifestDigest !== manifest.digest('hex') || value.manifestDigest !== record.manifestDigest ||
            value.blockCount !== position || value.blockCount !== record.blockCount ||
            value.totalGraphemes !== totalGraphemes || value.totalGraphemes !== record.totalGraphemes) {
          throw new Error('RECOVERY_OBJECT_INCOMPLETE');
        }
        footerSeen = true;
        continue;
      }
      if (footerSeen || value.type !== 'block') throw new Error('RECOVERY_OBJECT_INVALID');
      const block = value as unknown as RecoverySnapshotBlock & { type: 'block' };
      if (block.position !== position + 1 || typeof block.blockId !== 'string' ||
          !['title', 'heading', 'paragraph'].includes(block.kind) ||
          !(block.level === null || (Number.isSafeInteger(block.level) && block.level! >= 1 && block.level! <= 6)) ||
          typeof block.text !== 'string' || !block.text.isWellFormed() || block.text.length > MAX_BLOCK_CODE_UNITS ||
          !Number.isSafeInteger(block.graphemeLength) || block.graphemeLength < 0 || block.graphemeLength > MAX_BLOCK_GRAPHEMES ||
          typeof block.digest !== 'string' || blockDigest(block) !== block.digest) throw new Error('RECOVERY_OBJECT_INVALID');
      const normalized = { blockId: block.blockId, position: block.position, kind: block.kind, level: block.level,
        text: block.text, digest: block.digest, graphemeLength: block.graphemeLength } satisfies RecoverySnapshotBlock;
      manifest.update(manifestLine(normalized));
      position = normalized.position;
      totalGraphemes += normalized.graphemeLength;
      if (window !== null && position >= window.start) {
        if (window.consume) {
          batch.push(normalized);
          if (batch.length === WRITE_BATCH) { window.consume(batch); batch = []; }
        } else if (visible.length < window.limit) visible.push(normalized);
        else if (nextPosition === null) nextPosition = visible.at(-1)!.position;
      }
    }
    if (batch.length > 0 && window?.consume) window.consume(batch);
    if (!headerSeen || !footerSeen || position !== record.blockCount || totalGraphemes !== record.totalGraphemes) {
      throw new Error('RECOVERY_OBJECT_INCOMPLETE');
    }
    if (objectHash.digest('hex') !== record.objectDigest) throw new Error('RECOVERY_OBJECT_DIGEST_MISMATCH');
    return { blocks: visible, nextPosition };
  }

  async *#boundedLines(path: string, objectHash: ReturnType<typeof createHash>): AsyncGenerator<string> {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let pending = Buffer.alloc(0);
    for await (const value of createReadStream(path, { highWaterMark: MAX_OBJECT_LINE_BYTES + 1 })) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      objectHash.update(chunk);
      let start = 0;
      while (start < chunk.length) {
        const newline = chunk.indexOf(0x0a, start);
        const end = newline === -1 ? chunk.length : newline;
        const segmentLength = end - start;
        if (pending.length + segmentLength > MAX_OBJECT_LINE_BYTES) throw new Error('RECOVERY_OBJECT_LINE_TOO_LARGE');
        if (segmentLength > 0) pending = Buffer.concat([pending, chunk.subarray(start, end)], pending.length + segmentLength);
        if (newline === -1) break;
        if (pending.length > 0 && pending.at(-1) === 0x0d) throw new Error('RECOVERY_OBJECT_INVALID');
        yield decoder.decode(pending);
        pending = Buffer.alloc(0);
        start = newline + 1;
      }
    }
    if (pending.length !== 0) throw new Error('RECOVERY_OBJECT_INCOMPLETE');
  }
}
