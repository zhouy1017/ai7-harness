import { createHash } from 'node:crypto';
import { cp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { canonicalJson } from '../../src/service/analysis/canonical.js';
import { inventoryStore } from '../../src/service/store-inventory.js';
import { databasePackageSources } from '../../src/service/database-exports.js';
import { storeRevisionOnDisk } from '../../src/service/data-version.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type HistoricalRevisionProjection, type ManuscriptExportTargetInput, type ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { buildMaintenance } from '../support/upgrade-maintenance.js';
import { importRehearsalDocx, writeLegacyLibrary } from '../support/upgrade-rehearsal.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

const releases = [
  ['0.7.3', '3031f87a1b7cf01899ff25e99fba94867d4ad31c'],
  ['0.7.2', '790acbcbde8ca268217b152194f83241d1f13d10'],
] as const;

const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const database = (root: string) => join(root, 'store', 'ai7.sqlite');
const inventory = (root: string) => JSON.parse(inventoryStore(database(root)));
const bytesDigest = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');

function manuscript(store: EditorialStore, manuscriptId: string, branchId: string, revisionId?: string) {
  const blocks = new Map<number, [string, number | null, string]>();
  let cursor: string | null = null;
  do {
    const window: ManuscriptWindowProjection | HistoricalRevisionProjection = revisionId === undefined ? store.getManuscriptWindow(manuscriptId, branchId, cursor) :
      store.getHistoricalRevision(revisionId, cursor);
    for (const { position, kind, level, text } of window.blocks) blocks.set(position, [kind, level, text]);
    if (window.nextCursor === null) expect(blocks.size).toBe(window.position.totalBlocks);
    cursor = window.nextCursor;
  } while (cursor !== null);
  return digest([...blocks].sort(([left], [right]) => left - right));
}

function marks(store: EditorialStore, manuscriptId: string, branchId: string) {
  const cards = new Map();
  let cursor: string | null = null;
  do {
    const window = store.getManuscriptWindow(manuscriptId, branchId, cursor);
    expect(window.marksTruncated).toBe(false);
    for (const { markId } of window.marks) cards.set(markId, store.getEditorialMarkCard(manuscriptId, branchId, markId));
    cursor = window.nextCursor;
  } while (cursor !== null);
  return [...cards].sort(([left], [right]) => left.localeCompare(right));
}

async function payloads(root: string) {
  return Promise.all((await databasePackageSources(root)).filter(file => file.member.startsWith('objects/')).map(async file => {
    const bytes = await readFile(file.path);
    return [file.member, bytes.length, createHash('sha256').update(bytes).digest('hex')];
  }));
}

type Library = Awaited<ReturnType<typeof writeLegacyLibrary>>;
function readBusinessRecords(store: EditorialStore, { book, derivative, illustrated, milestone, reviewRunId }: Library) {
  const { bookId, manuscriptId, branchId } = book;
  const baseline = store.inspectBaselineAnalysis(bookId);
  const review = store.inspectReviewWorkspace(bookId, reviewRunId).run!;
  const evaluation = store.inspectEvaluation(bookId, null);
  const memory = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
  const backup = store.inspectScheduledBackups();
  const production = store.inspectProductionDocuments(bookId).types.flatMap(type => type.documents)
    .find(item => item.documentId === derivative.documentId)!;
  expect(production.versions.some(version => version.revisionId === derivative.revisionId)).toBe(true);
  return {
    main: manuscript(store, manuscriptId, branchId),
    illustrated: manuscript(store, illustrated.manuscriptId, illustrated.branchId),
    derivative: manuscript(store, derivative.documentId, derivative.branchId),
    derivativeVersions: digest(production.versions),
    milestone: manuscript(store, manuscriptId, branchId, milestone.revisionId),
    marks: digest([marks(store, manuscriptId, branchId), marks(store, illustrated.manuscriptId, illustrated.branchId)]),
    analysis: [baseline.resultSetRevision!.digest, baseline.taskOutcome!.report!.reportDigest],
    review: digest([review.report, review.synthesis?.summary]),
    evaluation: digest([evaluation.initial.latest, evaluation.record]),
    memory: digest(memory.items.map(item => item.current)),
    connections: digest(store.getModelServiceConnections().map(({ connectionId, credentialReference, connectionName, credentialOperationState, binding }) =>
      ({ connectionId, credentialReference, connectionName, credentialOperationState, binding }))),
    backup: [backup.enabled, backup.ordinal],
  };
}

async function exportDocx(store: EditorialStore, bookId: string, target: ManuscriptExportTargetInput, destination: string) {
  const options = { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, includeAnnotations: false, includeSuggestions: false };
  const reviewed = await store.reviewManuscriptExport({ bookId, target, options }, true);
  const ready = await store.prepareManuscriptExport({ bookId, target, options, destination,
    revisionId: reviewed.target.revisionId, reviewDigest: reviewed.reviewDigest }, true);
  expect((await store.approveManuscriptExport({ bookId, preparationId: ready.preparationId }, true)).outcome).toBe('created');
}

async function media(path: string) {
  return Object.entries(unzipSync(await readFile(path), { filter: file => file.name.startsWith('word/media/') }))
    .map(([, bytes]) => createHash('sha256').update(bytes).digest('hex')).sort();
}

async function testRoundTrip(store: EditorialStore, library: Library, inputRoot: string, codeRoot: string, oldDerivativeMedia: string[]) {
  const { book, derivative, illustrated } = library;
  const main = join(inputRoot, 'main-export.docx');
  const derived = join(inputRoot, 'derivative-export.docx');
  await exportDocx(store, illustrated.bookId, { kind: 'current' }, main);
  await exportDocx(store, book.bookId, { kind: 'document', documentId: derivative.documentId, revisionId: derivative.revisionId }, derived);
  const image = await media(derivative.sourcePath);
  expect(image).toHaveLength(1);
  expect(await media(main)).toEqual(image);
  expect(await media(derived)).toEqual(oldDerivativeMedia);
  const reimported = await EditorialStore.open(join(inputRoot, 'round-trip'), codeRoot);
  try {
    const mainImported = await importRehearsalDocx(reimported, main, '主稿往返');
    const derivedImported = await importRehearsalDocx(reimported, derived, '衍生稿往返');
    expect(manuscript(reimported, mainImported.manuscriptId, mainImported.branchId)).toBe(manuscript(store, illustrated.manuscriptId, illustrated.branchId));
    expect(manuscript(reimported, derivedImported.manuscriptId, derivedImported.branchId)).toBe(manuscript(store, derivative.documentId, derivative.branchId));
  } finally {
    reimported.markCleanShutdown();
    reimported.close();
  }
}

function testRestore(store: EditorialStore, { book, milestone }: Library, before: ReturnType<typeof readBusinessRecords>) {
  const versions = store.listBookVersions({ ...book, offset: 0 }).rows;
  expect(versions).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: expect.stringContaining('升级时的稿件'), kind: 'revision' }),
    expect.objectContaining({ label: expect.stringContaining(milestone.label), kind: 'milestone', revisionId: milestone.revisionId }),
  ]));
  const view = () => store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const initial = view();
  const scope = { bookId: book.bookId, manuscriptId: book.manuscriptId, branchId: book.branchId };
  expect(() => store.undoManuscript(book.manuscriptId, book.branchId, initial.workingDigest)).toThrow(expect.objectContaining({ code: 'NOTHING_TO_UNDO' }));
  const restore = (revisionId: string) => store.restoreBookVersion({ ...scope, revisionId, expectedBase: view().revisionId, expectedDigest: view().workingDigest });
  restore(milestone.revisionId);
  expect(before.milestone).not.toBe(before.main);
  expect(manuscript(store, book.manuscriptId, book.branchId)).toBe(before.milestone);
  restore(initial.revisionId);
  expect(manuscript(store, book.manuscriptId, book.branchId)).toBe(before.main);
}

async function assertOldUnchanged(root: string, original: string) {
  const kept = (await readdir(root)).find(name => name.startsWith('store-before-0.8.0-'));
  const path = kept === undefined ? database(root) : join(root, kept, 'ai7.sqlite');
  expect(await bytesDigest(path)).toBe(original);
}

const forward = ['backup', 'convert', 'verify', 'save-old', 'save-old-renamed', 'publish', 'publish-renamed', 'record'] as const;
const back = ['restore', 'save-new', 'save-new-renamed', 'publish-old', 'publish-old-renamed'] as const;

async function crashAndResume(run: Awaited<ReturnType<typeof buildMaintenance>>, root: string, original: string, stages: readonly string[],
  action: 'upgrade' | 'rollback') {
  for (const [index, stage] of stages.entries()) {
    expect(await run(index === 0 ? action : 'resume', root, stage)).toEqual({ stopped: stage });
    await assertOldUnchanged(root, original);
  }
  expect(await run('resume', root)).toMatchObject({ ok: true, restored: action === 'rollback' });
}

async function rehearseRecovery(run: Awaited<ReturnType<typeof buildMaintenance>>, root: string, original: string,
  before: ReturnType<typeof inventory>, after: ReturnType<typeof inventory>) {
  const failed = root + '-refused';
  await cp(root, failed, { recursive: true });
  expect(await run('upgrade', failed, 'return-old')).toEqual({ stopped: 'return-old' });
  await assertOldUnchanged(failed, original);
  expect(await run('resume', failed)).toMatchObject({ ok: true, restored: true });
  expect(inventory(failed)).toEqual(before);
  expect(await run('upgrade', failed)).toMatchObject({ ok: true, restored: false });
  expect(inventory(failed)).toEqual(after);
  expect(await run('rollback', failed, 'return-new')).toEqual({ stopped: 'return-new' });
  await assertOldUnchanged(failed, original);
  expect(await run('resume', failed, 'return-new-renamed')).toEqual({ stopped: 'return-new-renamed' });
  expect(await run('resume', failed)).toMatchObject({ ok: true, restored: false });
  expect(inventory(failed)).toEqual(after);
  expect(await run('rollback', failed)).toMatchObject({ ok: true, restored: true });
  expect(inventory(failed)).toEqual(before);
}

function assertInventory(before: ReturnType<typeof inventory>, after: ReturnType<typeof inventory>) {
  expect(after.entities).toEqual({ ...before.entities, library: { tables: 4, versions: 4, entries: 68507, sourceFiles: 0 } });
  expect(before.tables).toMatchObject({ books: 2, manuscripts: 3, review_reports: 1, evaluation_records: 1 });
  expect(before.tables.global_editorial_memory_item_versions).toBeGreaterThan(0);
  expect(before.tables.analysis_result_set_revisions).toBeGreaterThan(0);
  expect(after.tables).toEqual({
    ...before.tables,
    manuscript_revisions: before.tables.manuscript_revisions + 3,
    manuscript_block_versions: before.tables.manuscript_block_versions + before.tables.working_blocks,
    store_versions: before.tables.store_versions + 1,
    standard_tables: 4, standard_table_versions: 4, standard_table_entries: 68507,
    working_pages: 3, model_role_choices: 2,
  });
}

async function readLegacyBaseline(root: string, inputRoot: string, library: Library) {
  const old = await library.open(root);
  try {
    const path = join(inputRoot, 'legacy-derivative.docx');
    const { documentId, revisionId } = library.derivative;
    await exportDocx(old, library.book.bookId, { kind: 'document', documentId, revisionId }, path);
    return { records: readBusinessRecords(old, library), oldDerivativeMedia: await media(path) };
  } finally {
    old.markCleanShutdown();
    old.close();
  }
}

it.each(releases)('preserves D7 business records written by released AI7 %s', async (version, revision) => {
  const roots = await createServiceTestRoots('ai7-upgrade-rehearsal-');
  try {
    const library = await writeLegacyLibrary(roots, revision);
    const maintenance = await buildMaintenance(roots);
    const { records, oldDerivativeMedia } = await readLegacyBaseline(roots.dataRoot, roots.inputRoot, library);
    const before = inventory(roots.dataRoot);
    const original = await bytesDigest(database(roots.dataRoot));
    const objects = await payloads(roots.dataRoot);
    expect(objects.length).toBeGreaterThan(0);
    expect(storeRevisionOnDisk(database(roots.dataRoot))).toBe(116);
    const retry = join(roots.inputRoot, 'interrupted');
    if (version === '0.7.3') await cp(roots.dataRoot, retry, { recursive: true });
    expect(await maintenance('preflight', roots.dataRoot)).toMatchObject({ ok: true });
    expect(await maintenance('upgrade', roots.dataRoot)).toMatchObject({ ok: true, restored: false });
    expect(storeRevisionOnDisk(database(roots.dataRoot))).toBe(117);
    const after = inventory(roots.dataRoot);
    assertInventory(before, after);
    expect(await payloads(roots.dataRoot)).toEqual(objects);
    const upgraded = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(readBusinessRecords(upgraded, library)).toEqual(records);
      await testRoundTrip(upgraded, library, roots.inputRoot, roots.codeRoot, oldDerivativeMedia);
      testRestore(upgraded, library, records);
    } finally {
      upgraded.markCleanShutdown();
      upgraded.close();
    }
    if (version === '0.7.3') {
      await rehearseRecovery(maintenance, retry, original, before, after);
      await crashAndResume(maintenance, retry, original, forward, 'upgrade');
      expect(inventory(retry)).toEqual(after);
      expect(await payloads(retry)).toEqual(objects);
      await crashAndResume(maintenance, retry, original, back, 'rollback');
      expect(inventory(retry)).toEqual(before);
      const reopened = await library.open(retry);
      try { expect(readBusinessRecords(reopened, library)).toEqual(records); }
      finally { reopened.markCleanShutdown(); reopened.close(); }
    }
  } finally {
    await roots.dispose();
  }
}, 90_000);
