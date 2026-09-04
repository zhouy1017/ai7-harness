import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecoveryObjectStore } from '../../src/service/recovery-objects.js';
import { createCanonicalExternalDataRoot } from '../../src/shared/data-root.js';
import { MAX_WINDOW_BLOCKS } from '../../src/shared/protocol.js';
import type {
  RecoverySnapshotBlock,
  RecoverySnapshotObjectMetadata,
  RecoverySnapshotPlan,
  RecoverySnapshotRecord,
} from '../../src/service/bounded-manuscript.js';

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

let sandbox: string;
let dataRoot: string;
let objectDirectory: string;

function graphemeCount(value: string): number {
  return Array.from(segmenter.segment(value)).length;
}

function blockDigest(kind: RecoverySnapshotBlock['kind'], level: number | null, text: string): string {
  const canonical =
    `{"kind":${JSON.stringify(kind)},"level":${level === null ? 'null' : String(level)},"text":${JSON.stringify(text)}}`;
  return createHash('sha256').update(canonical).digest('hex');
}

function makeBlock(position: number, text: string): RecoverySnapshotBlock {
  return {
    blockId: `blk_${createHash('sha256').update(`${position}\u0000${text}`).digest('hex').slice(0, 24)}`,
    position,
    kind: 'paragraph',
    level: null,
    text,
    digest: blockDigest('paragraph', null, text),
    graphemeLength: graphemeCount(text),
  };
}

function makePlan(blocks: readonly RecoverySnapshotBlock[]): RecoverySnapshotPlan {
  return {
    snapshotId: randomUUID(),
    milestoneId: randomUUID(),
    signoffRecordId: randomUUID(),
    bookId: randomUUID(),
    manuscriptId: randomUUID(),
    branchId: randomUUID(),
    expectedBaseRevisionId: randomUUID(),
    expectedJournalSequence: 7,
    expectedWorkingDigest: 'a'.repeat(64),
    revisionId: randomUUID(),
    revisionLabel: '第 1 版',
    sourceVersionId: randomUUID(),
    blockCount: blocks.length,
    totalGraphemes: blocks.reduce((total, block) => total + block.graphemeLength, 0),
    label: '里程碑',
    purpose: '恢复证据',
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeRecord(plan: RecoverySnapshotPlan, metadata: RecoverySnapshotObjectMetadata): RecoverySnapshotRecord {
  return {
    ...metadata,
    snapshotId: plan.snapshotId,
    bookId: plan.bookId,
    manuscriptId: plan.manuscriptId,
    branchId: plan.branchId,
    revisionId: plan.revisionId,
    revisionLabel: plan.revisionLabel,
    revisionDigest: plan.expectedWorkingDigest,
    journalSequence: plan.expectedJournalSequence,
    totalGraphemes: plan.totalGraphemes,
    createdAt: plan.createdAt,
  };
}

function loaderFor(blocks: readonly RecoverySnapshotBlock[]): (afterPosition: number) => ReadonlyArray<RecoverySnapshotBlock> {
  return (afterPosition) => blocks.slice(afterPosition);
}

async function formObject(
  blocks: readonly RecoverySnapshotBlock[],
): Promise<{ store: RecoveryObjectStore; plan: RecoverySnapshotPlan; metadata: RecoverySnapshotObjectMetadata; record: RecoverySnapshotRecord }> {
  const store = await RecoveryObjectStore.open(dataRoot);
  const plan = makePlan(blocks);
  const metadata = await store.form(plan, loaderFor(blocks));
  return { store, plan, metadata, record: makeRecord(plan, metadata) };
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-recovery-objects-test-'));
  const codeRoot = join(sandbox, 'checkout');
  await mkdir(codeRoot);
  dataRoot = await createCanonicalExternalDataRoot(join(sandbox, 'data'), codeRoot);
  objectDirectory = join(dataRoot, 'recovery-objects', 'v1');
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('RecoveryObjectStore.form and verify', () => {
  it('writes one promoted object and verifies it as eligible', async () => {
    const blocks = [makeBlock(1, '甲乙丙'), makeBlock(2, '第二段。'), makeBlock(3, '第三段。')];
    const { store, metadata, record } = await formObject(blocks);

    expect(metadata.objectDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(metadata.manifestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(metadata.objectRelativeKey).toBe(`v1/${metadata.objectDigest}.snapshot`);
    expect(metadata.blockCount).toBe(3);
    expect(metadata.byteLength).toBeGreaterThan(0);
    expect(metadata.newlyPromoted).toBe(true);

    await expect(store.verify(record)).resolves.toEqual({ state: 'eligible', record });
    await expect(store.verify(null)).resolves.toEqual({ state: 'none' });
  });

  it('is content addressed, so re-forming the same blocks does not promote a second object', async () => {
    const blocks = [makeBlock(1, '稳定内容。')];
    const first = await formObject(blocks);
    const store = await RecoveryObjectStore.open(dataRoot);
    const second = await store.form(first.plan, loaderFor(blocks));

    expect(second.objectDigest).toBe(first.metadata.objectDigest);
    expect(second.newlyPromoted).toBe(false);
    await expect(readdir(objectDirectory)).resolves.toEqual([`${first.metadata.objectDigest}.snapshot`]);
  });

  it('refuses a plan whose counts do not match the loaded blocks and leaves no partial behind', async () => {
    const blocks = [makeBlock(1, '一段。')];
    const store = await RecoveryObjectStore.open(dataRoot);
    const plan = { ...makePlan(blocks), blockCount: 2 };

    await expect(store.form(plan, loaderFor(blocks))).rejects.toThrow('RECOVERY_OBJECT_INCOMPLETE');
    await expect(readdir(objectDirectory)).resolves.toEqual([]);
  });

  it('refuses a block whose digest does not match its content', async () => {
    const store = await RecoveryObjectStore.open(dataRoot);
    const tampered = { ...makeBlock(1, '一段。'), digest: 'b'.repeat(64) };
    const plan = makePlan([tampered]);

    await expect(store.form(plan, loaderFor([tampered]))).rejects.toThrow('RECOVERY_OBJECT_INVALID');
    await expect(readdir(objectDirectory)).resolves.toEqual([]);
  });
});

describe('RecoveryObjectStore.verify on a damaged object', () => {
  it('reports a digest mismatch when the object length changed', async () => {
    const { store, metadata, record } = await formObject([makeBlock(1, '甲乙丙')]);
    await appendFile(join(objectDirectory, `${metadata.objectDigest}.snapshot`), ' ');

    await expect(store.verify(record)).resolves.toMatchObject({
      state: 'unavailable',
      verification: '摘要不匹配',
    });
  });

  it('reports an incomplete object when a block was altered in place', async () => {
    const { store, metadata, record } = await formObject([makeBlock(1, '甲乙丙')]);
    const path = join(objectDirectory, `${metadata.objectDigest}.snapshot`);
    const altered = (await readFile(path, 'utf8')).replace('甲乙丙', '丁乙丙');
    expect(altered).not.toBe(await readFile(path, 'utf8'));
    await writeFile(path, altered);

    await expect(store.verify(record)).resolves.toMatchObject({
      state: 'unavailable',
      verification: '对象不完整',
    });
  });

  it('reports a missing object', async () => {
    const { store, metadata, record } = await formObject([makeBlock(1, '甲乙丙')]);
    await rm(join(objectDirectory, `${metadata.objectDigest}.snapshot`));

    await expect(store.verify(record)).resolves.toMatchObject({
      state: 'unavailable',
      verification: '对象缺失',
    });
    await expect(store.readWindow(record, { kind: 'start' })).rejects.toThrow('RECOVERY_OBJECT_MISSING');
  });
});

describe('RecoveryObjectStore.readWindow and forEachBatch', () => {
  it('returns one bounded window at a time and reports the next target', async () => {
    const blocks = Array.from({ length: MAX_WINDOW_BLOCKS + 3 }, (_ignored, index) =>
      makeBlock(index + 1, `第 ${index + 1} 段。`),
    );
    const { store, record } = await formObject(blocks);

    const first = await store.readWindow(record, { kind: 'start' });
    expect(first.blocks).toHaveLength(MAX_WINDOW_BLOCKS);
    expect(first.blocks[0]?.position).toBe(1);
    expect(first.blocks[0]).not.toHaveProperty('graphemeLength');
    expect(first.nextTarget).toEqual({ kind: 'after', position: MAX_WINDOW_BLOCKS });

    const second = await store.readWindow(record, first.nextTarget!);
    expect(second.blocks.map((block) => block.position)).toEqual([
      MAX_WINDOW_BLOCKS + 1,
      MAX_WINDOW_BLOCKS + 2,
      MAX_WINDOW_BLOCKS + 3,
    ]);
    expect(second.nextTarget).toBeNull();
  });

  it('rejects a window that starts past the last block', async () => {
    const { store, record } = await formObject([makeBlock(1, '唯一段。')]);
    await expect(store.readWindow(record, { kind: 'after', position: 5 })).rejects.toThrow(
      'RECOVERY_WINDOW_NOT_FOUND',
    );
  });

  it('streams every block in order through forEachBatch', async () => {
    const blocks = [makeBlock(1, '甲'), makeBlock(2, '乙'), makeBlock(3, '丙')];
    const { store, record } = await formObject(blocks);

    const seen: RecoverySnapshotBlock[] = [];
    await store.forEachBatch(record, (batch) => seen.push(...batch));
    expect(seen).toEqual(blocks);
  });
});

describe('RecoveryObjectStore cleanup', () => {
  it('removes partial leftovers and unreferenced objects while keeping referenced ones', async () => {
    const { store, metadata } = await formObject([makeBlock(1, '甲乙丙')]);
    const partialName = `.partial-${randomUUID()}`;
    await writeFile(join(objectDirectory, partialName), 'leftover');

    await store.cleanup((relativeKey) => relativeKey === metadata.objectRelativeKey);
    await expect(readdir(objectDirectory)).resolves.toEqual([`${metadata.objectDigest}.snapshot`]);

    await store.cleanup(() => false);
    await expect(readdir(objectDirectory)).resolves.toEqual([]);
  });

  it('removes a newly promoted object only when it stayed unreferenced', async () => {
    const referenced = await formObject([makeBlock(1, '保留对象。')]);
    await referenced.store.removeUnreferenced(referenced.metadata, true);
    await expect(readdir(objectDirectory)).resolves.toEqual([
      `${referenced.metadata.objectDigest}.snapshot`,
    ]);

    await referenced.store.removeUnreferenced(referenced.metadata, false);
    await expect(readdir(objectDirectory)).resolves.toEqual([]);
  });
});
