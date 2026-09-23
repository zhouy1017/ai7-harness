import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { PUBLICATION_VERSION_SCHEMA_SQL } from '../../src/service/publication-versions.js';
import { EDITORIAL_REVIEW_SCHEMA_VERSION, PLAN_EDIT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import {
  PUBLICATION_ACTUALS_PROMPT_LABEL,
  PUBLICATION_ACTUALS_PROMPT_STATE,
  PUBLICATION_CHANGE_NOTICE,
  PUBLICATION_FORBIDDEN_WORDS,
  PUBLICATION_NEEDS_MANUSCRIPT,
  PUBLICATION_NEEDS_MILESTONE,
  PUBLICATION_VERSION_LABEL,
  PUBLICATION_VERSION_STATEMENT,
  type DeliverablesProjection,
  type MilestoneProjection,
  type MilestonePurposeKind,
} from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { PUBLICATION_VERSION_RELATIONS_DROP_ORDER } from '../support/publication-versions.js';
import { PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER } from '../support/proposal-conflicts.js';
import { IMPORT_RETENTION_RELATIONS_DROP_ORDER } from '../support/import-retention.js';
import { IMPORTED_MARK_RELATIONS_DROP_ORDER } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for ⑥ 发稿 (Issue #414, plan slice S65): Milestone Versions with their
// purposes, 设为发稿版本 and the 交付物 read, over the real `EditorialStore` on a temporary Agent Data
// Root. The manuscript is composed from the one admitted SampleBook; the one string written into it is
// authored here, and no assertion reads manuscript text back — records are compared by identity, state,
// count and digest.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 24, title: '发稿组稿' };
/** A second Book's manuscript: another excerpt under another title, so it is no second import of the first. */
const OTHER_EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 30, blocks: 24, title: '另一本发稿组稿' };
const EDIT = '〔编辑改动〕';
const LEDGER = Object.keys(PUBLICATION_VERSION_SCHEMA_SQL);
/** Every key a listed milestone carries: none of them marks a milestone final or latest (V2-UX-MILE-006). */
const MILESTONE_ITEM_KEYS = [
  'actor', 'changedSince', 'changedSinceLabel', 'createdAt', 'designation', 'label', 'milestoneId', 'note',
  'purposeKind', 'purposeLabel', 'revisionId', 'revisionLabel', 'technical',
];

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore, excerpt: ComposedManuscriptRequest = EXCERPT): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, excerpt);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(
    staged.draftId,
    staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value },
    false,
  );
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** The editor's own typing: one journal edit at the start of the first paragraph, against the window as it stands now. */
function edit(store: EditorialStore, book: Imported): void {
  const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = now.blocks.find((candidate) => candidate.kind === 'paragraph')!;
  store.flushJournalEdit({
    clientEditId: randomUUID(),
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    baseRevisionId: now.revisionId,
    blockId: block.blockId,
    windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: block.digest,
    expectedJournalSequence: now.journalSequence,
    fromGrapheme: 0,
    toGrapheme: 0,
    insertText: EDIT,
  });
}

function refusal(operation: () => unknown): { code: string; message: string } {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return { code: error.code, message: error.message };
    throw error;
  }
  return { code: 'no-error', message: '' };
}

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath(), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

/** How many rows each of the three Publication Version relations holds. */
function ledgerCounts(): Record<string, number> {
  return withDatabase(true, (database) => Object.fromEntries(LEDGER.map((table) => [
    table,
    (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total,
  ])));
}

/** V2-UX-PUB-009: no answer of 交付物 words a Publication Version as published, sent, delivered or received. */
function expectNoForbiddenWords(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const word of PUBLICATION_FORBIDDEN_WORDS) expect(serialized.includes(word)).toBe(false);
}

/**
 * Every relation the store holds, with its exact `CREATE` text and a digest over its whole content.
 * Relations hold manuscript text, so the content is compared as a row count and a hex digest.
 */
function relationTruth(database: DatabaseSync): Map<string, { sql: string; content: string }> {
  const relations = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name").all() as { name: string; sql: string | null }[];
  return new Map(relations.map((relation) => {
    const rows = database.prepare(`SELECT * FROM "${relation.name}"`).all() as Record<string, SQLOutputValue>[];
    const hash = createHash('sha256');
    for (const row of rows) {
      for (const column of Object.keys(row).sort()) {
        const value = row[column]!;
        hash.update(JSON.stringify([column, value instanceof Uint8Array ? [...value] : typeof value === 'bigint' ? value.toString() : value]));
      }
    }
    return [relation.name, { sql: String(relation.sql), content: `${rows.length}:${hash.digest('hex')}` }];
  }));
}

async function saveMilestone(
  store: EditorialStore,
  book: Imported,
  label: string,
  purposeKind: MilestonePurposeKind,
  purpose: string | null,
  note = '',
): Promise<MilestoneProjection> {
  return store.saveMilestone(book.manuscriptId, book.branchId, label, purposeKind, purpose, note);
}

describe('⑥ 发稿: Milestone Versions and 设为发稿版本', () => {
  it('lists every milestone of the primary Manuscript with its purpose, exact revision and later changes, and marks none final', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const empty = store.inspectDeliverables(book.bookId);
      expect(empty).toMatchObject({ bookId: book.bookId, manuscript: { manuscriptId: book.manuscriptId, branchId: book.branchId, revisionLabel: 'r1' } });
      expect(empty.publication).toEqual({
        milestones: [],
        milestonesTruncated: false,
        designations: [],
        designationsTruncated: false,
        changeNotice: null,
        designate: { available: false, unavailableReason: PUBLICATION_NEEDS_MILESTONE },
        statement: PUBLICATION_VERSION_STATEMENT,
        actualsPrompt: null,
      });

      // Nothing changed since the import, so the milestone designates r1 as it stands.
      const first = await saveMilestone(store, book, '一审稿', 'stage-archive', null, '一审完成后留档');
      expect(first).toMatchObject({ purposeKind: 'stage-archive', purpose: '阶段留档', revisionLabel: 'r1', completionLabel: '已保存里程碑版本「一审稿」 · r1' });
      expect(store.inspectDeliverables(book.bookId).publication.milestones[0]).toMatchObject({ changedSince: false, changedSinceLabel: null });

      // One durable edit: the working state is newer than 一审稿 (V2-UX-MILE-007).
      edit(store, book);
      expect(store.inspectDeliverables(book.bookId).publication.milestones[0]).toMatchObject({
        label: '一审稿',
        changedSince: true,
        changedSinceLabel: '自「一审稿」后有修改',
      });

      // The next milestone freezes the edit as r2; a third on the same state designates r2 again. 自行输入
      // keeps the editor's words, and words that are exactly a frozen purpose are that purpose.
      const second = await saveMilestone(store, book, '二审稿', 'custom', '  送审前自查\n');
      expect(second).toMatchObject({ purposeKind: 'custom', purpose: '送审前自查', revisionLabel: 'r2', note: null });
      const third = await saveMilestone(store, book, '三审稿', 'custom', '交付候选', '三审通过');
      expect(third).toMatchObject({ purposeKind: 'delivery-candidate', purpose: '交付候选', revisionLabel: 'r2' });

      const deliverables = store.inspectDeliverables(book.bookId);
      const list = deliverables.publication.milestones;
      expect(list.map((item) => item.label)).toEqual(['三审稿', '二审稿', '一审稿']);
      expect(list.map((item) => [item.purposeKind, item.purposeLabel])).toEqual([
        ['delivery-candidate', '交付候选'],
        ['custom', '送审前自查'],
        ['stage-archive', '阶段留档'],
      ]);
      expect(list.map((item) => item.revisionLabel)).toEqual(['r2', 'r2', 'r1']);
      expect(list.map((item) => item.revisionId)).toEqual([third.revisionId, second.revisionId, first.revisionId]);
      expect(list.map((item) => item.note)).toEqual(['三审通过', null, '一审完成后留档']);
      expect(list.map((item) => item.changedSince)).toEqual([false, false, true]);
      expect(list.map((item) => item.createdAt)).toEqual([third.createdAt, second.createdAt, first.createdAt]);
      expect(list.map((item) => item.technical.signoffRecordId)).toEqual([third.signoffRecordId, second.signoffRecordId, first.signoffRecordId]);
      for (const item of list) {
        expect(Object.keys(item).sort()).toEqual(MILESTONE_ITEM_KEYS);
        expect(item.actor).toBe('本机编辑');
        expect(item.designation).toBeNull();
      }
      expect(deliverables.manuscript!.revisionLabel).toBe('r2');
      expect(deliverables.publication.designate).toEqual({ available: true, unavailableReason: null });
      expect(deliverables.publication.designations).toEqual([]);
      expectNoForbiddenWords(deliverables);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('refuses 设为发稿版本 without a milestone, for another Book\'s milestone, for a Book without a manuscript, and outside the scope and basis bounds', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const other = await importBook(store, OTHER_EXCERPT);
      const creation = store.prepareBookCreation('空图书', null);
      const emptyBookId = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
      const designate = (bookId: string, milestoneId: string, scope = '纸质版首印', basis = '三审通过，社领导同意') =>
        refusal(() => store.designatePublicationVersion({ bookId, milestoneId, scope, basis }));

      // No milestone yet: 设为发稿版本 designates an existing milestone, never the current text (PUB-002).
      expect(designate(book.bookId, randomUUID())).toEqual({ code: 'PUBLICATION_MILESTONE_REQUIRED', message: PUBLICATION_NEEDS_MILESTONE });
      const foreign = await saveMilestone(store, other, '他书一审稿', 'stage-archive', null);
      const own = await saveMilestone(store, book, '一审稿', 'review-candidate', null);
      // A milestone of another Book's manuscript is none of this Book's, whatever its identity.
      expect(designate(book.bookId, foreign.milestoneId).code).toBe('PUBLICATION_MILESTONE_NOT_FOUND');
      expect(designate(book.bookId, randomUUID()).code).toBe('PUBLICATION_MILESTONE_NOT_FOUND');
      expect(designate(other.bookId, own.milestoneId).code).toBe('PUBLICATION_MILESTONE_NOT_FOUND');
      // A Book without a manuscript has nothing to designate.
      expect(designate(emptyBookId, own.milestoneId)).toEqual({ code: 'PUBLICATION_MILESTONE_REQUIRED', message: PUBLICATION_NEEDS_MANUSCRIPT });
      expect(store.inspectDeliverables(emptyBookId)).toMatchObject({
        bookId: emptyBookId,
        manuscript: null,
        publication: { milestones: [], designations: [], designate: { available: false, unavailableReason: PUBLICATION_NEEDS_MANUSCRIPT } },
      });
      // 发稿范围 1–80 and 依据 1–500 characters once trimmed; both are required.
      expect(designate(book.bookId, own.milestoneId, '   ').code).toBe('PUBLICATION_SCOPE_INVALID');
      expect(designate(book.bookId, own.milestoneId, '范'.repeat(81)).code).toBe('PUBLICATION_SCOPE_INVALID');
      expect(designate(book.bookId, own.milestoneId, '纸质版首印', '').code).toBe('PUBLICATION_BASIS_INVALID');
      expect(designate(book.bookId, own.milestoneId, '纸质版首印', '据'.repeat(501)).code).toBe('PUBLICATION_BASIS_INVALID');
      expect(designate(book.bookId, 'not-a-uuid').code).toBe('PUBLICATION_INVALID');
      expect(designate(randomUUID(), own.milestoneId).code).toBe('BOOK_NOT_FOUND');
      expect(refusal(() => store.inspectDeliverables('not-a-uuid')).code).toBe('BOOK_INVALID');
      expect(refusal(() => store.inspectDeliverables(randomUUID())).code).toBe('BOOK_NOT_FOUND');
      // Nothing any refusal reached was written.
      expect(ledgerCounts()).toEqual({ publication_versions: 0, public_release_permissions: 0, publication_events: 0 });

      // At the bounds, padded, the designation stands; code points are counted, as SQLite counts them.
      const scope = `  ${'𠀀'.repeat(80)}\n`;
      const designated = store.designatePublicationVersion({ bookId: book.bookId, milestoneId: own.milestoneId, scope, basis: '据'.repeat(500) });
      expect(designated.deliverables.publication.designations[0]).toMatchObject({ scope: '𠀀'.repeat(80), basis: '据'.repeat(500) });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('records the designation, its permission and both events in one transaction, and a failure midway records none of them', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const milestone = await saveMilestone(store, book, '一审稿', 'delivery-candidate', null);
      const input = { bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过，社领导同意' };

      // The last record of the interaction is refused: the transaction leaves nothing behind.
      withDatabase(false, (database) => database.exec(`CREATE TRIGGER test_refuse_exemplar_archive
        BEFORE INSERT ON publication_events WHEN NEW.kind = 'exemplar-archive'
        BEGIN SELECT RAISE(ABORT, 'TEST_REFUSED'); END`));
      expect(() => store.designatePublicationVersion(input)).toThrow(/TEST_REFUSED/);
      expect(ledgerCounts()).toEqual({ publication_versions: 0, public_release_permissions: 0, publication_events: 0 });
      withDatabase(false, (database) => database.exec('DROP TRIGGER test_refuse_exemplar_archive'));

      const designated = store.designatePublicationVersion(input);
      expect(designated.outcome).toBe('designated');
      expect(designated.completionLabel).toBe('已设为发稿版本 · 「一审稿」 · r1 · 纸质版首印');
      expect(ledgerCounts()).toEqual({ publication_versions: 1, public_release_permissions: 1, publication_events: 2 });

      const recorded = withDatabase(true, (database) => ({
        version: database.prepare('SELECT * FROM publication_versions').get() as Record<string, SQLOutputValue>,
        permission: database.prepare('SELECT * FROM public_release_permissions').get() as Record<string, SQLOutputValue>,
        events: database.prepare('SELECT * FROM publication_events ORDER BY kind').all() as Record<string, SQLOutputValue>[],
        revisionDigest: (database.prepare('SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?').get(milestone.revisionId) as { revision_digest: string }).revision_digest,
      }));
      // The designation binds the exact milestone, its revision and that revision's digest (MILE-013).
      expect(recorded.version).toMatchObject({
        publication_version_id: designated.publicationVersionId,
        book_id: book.bookId,
        ordinal: 1,
        manuscript_id: book.manuscriptId,
        branch_id: book.branchId,
        milestone_id: milestone.milestoneId,
        revision_id: milestone.revisionId,
        revision_digest: recorded.revisionDigest,
        scope: '纸质版首印',
        basis: '三审通过，社领导同意',
        actor: '本机编辑',
      });
      // The permission is its own record, linked by identity and never merged (PUB-003).
      expect(recorded.permission).toMatchObject({
        publication_version_id: designated.publicationVersionId,
        book_id: book.bookId,
        revision_id: milestone.revisionId,
        revision_digest: recorded.revisionDigest,
        scope: '纸质版首印',
        actor: '本机编辑',
        created_at: recorded.version.created_at,
      });
      expect(recorded.permission.permission_id).not.toBe(designated.publicationVersionId);
      expect(recorded.events.map((event) => [event.kind, event.publication_version_id, event.recorded_at])).toEqual([
        ['actuals-prompt', designated.publicationVersionId, recorded.version.created_at],
        ['exemplar-archive', designated.publicationVersionId, recorded.version.created_at],
      ]);

      const deliverables = designated.deliverables;
      const [current] = deliverables.publication.designations;
      expect(current).toMatchObject({
        publicationVersionId: designated.publicationVersionId,
        ordinal: 1,
        current: true,
        milestoneId: milestone.milestoneId,
        milestoneLabel: '一审稿',
        revisionId: milestone.revisionId,
        revisionLabel: 'r1',
        scope: '纸质版首印',
        basis: '三审通过，社领导同意',
        actor: '本机编辑',
        createdAt: recorded.version.created_at,
        technical: {
          revisionDigest: recorded.revisionDigest,
          digest: recorded.version.sha256,
          permissionId: recorded.permission.permission_id,
          events: [
            { eventId: recorded.events[0]!.event_id, kind: 'actuals-prompt' },
            { eventId: recorded.events[1]!.event_id, kind: 'exemplar-archive' },
          ],
        },
      });
      expect(deliverables.publication.milestones[0]!.designation).toEqual({ publicationVersionId: designated.publicationVersionId, label: PUBLICATION_VERSION_LABEL });
      expect(deliverables.publication.actualsPrompt).toEqual({
        eventId: recorded.events[0]!.event_id,
        publicationVersionId: designated.publicationVersionId,
        label: PUBLICATION_ACTUALS_PROMPT_LABEL,
        stateLabel: PUBLICATION_ACTUALS_PROMPT_STATE,
        recordedAt: recorded.version.created_at,
      });
      expect(deliverables.publication.changeNotice).toBeNull();
      expect(deliverables).toEqual(store.inspectDeliverables(book.bookId));
      expectNoForbiddenWords(designated);

      // Every record of the ledger is immutable.
      withDatabase(false, (database) => {
        for (const table of LEDGER) {
          const column = table === 'publication_events' ? 'recorded_at' : 'created_at';
          expect(() => database.exec(`UPDATE ${table} SET ${column} = ${column}`)).toThrow(/PUBLICATION_LEDGER_IMMUTABLE/);
          expect(() => database.exec(`DELETE FROM ${table}`)).toThrow(/PUBLICATION_LEDGER_IMMUTABLE/);
        }
      });
      expect(ledgerCounts()).toEqual({ publication_versions: 1, public_release_permissions: 1, publication_events: 2 });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('answers an identical repeat with no change, and appends a newer designation beside the older one without retargeting it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const first = await saveMilestone(store, book, '一审稿', 'stage-archive', null);
      edit(store, book);
      const second = await saveMilestone(store, book, '二审稿', 'review-candidate', null);
      const designate = (milestoneId: string, scope: string, basis: string) =>
        store.designatePublicationVersion({ bookId: book.bookId, milestoneId, scope, basis });

      const original = designate(first.milestoneId, '纸质版首印', '三审通过');
      const originalProjection = original.deliverables.publication.designations[0]!;

      // The same milestone, scope and basis — however padded — is the current designation already.
      const repeat = designate(first.milestoneId, ' 纸质版首印 ', '三审通过\n');
      expect(repeat).toMatchObject({ outcome: 'unchanged', publicationVersionId: original.publicationVersionId, completionLabel: '已是当前发稿版本 · 「一审稿」 · r1 · 纸质版首印' });
      expect(ledgerCounts()).toEqual({ publication_versions: 1, public_release_permissions: 1, publication_events: 2 });
      expect(repeat.deliverables).toEqual(original.deliverables);

      // A newer designation is a separate append (PUB-007); the older one stays exactly as recorded.
      const newer = designate(second.milestoneId, '电子版', '二审修订后另发电子版');
      expect(newer).toMatchObject({ outcome: 'designated', completionLabel: '已设为发稿版本 · 「二审稿」 · r2 · 电子版' });
      expect(newer.publicationVersionId).not.toBe(original.publicationVersionId);
      const afterNewer = newer.deliverables.publication;
      expect(afterNewer.designations.map((entry) => [entry.ordinal, entry.current, entry.milestoneLabel, entry.revisionLabel])).toEqual([
        [2, true, '二审稿', 'r2'],
        [1, false, '一审稿', 'r1'],
      ]);
      expect(afterNewer.designations[1]).toEqual({ ...originalProjection, current: false });
      expect(afterNewer.milestones.map((item) => [item.label, item.designation?.publicationVersionId ?? null])).toEqual([
        ['二审稿', newer.publicationVersionId],
        ['一审稿', null],
      ]);
      expect(afterNewer.actualsPrompt!.publicationVersionId).toBe(newer.publicationVersionId);

      // Naming the older milestone again is no repeat of the current designation: it is a third append.
      const third = designate(first.milestoneId, '纸质版首印', '三审通过');
      expect(third.outcome).toBe('designated');
      expect(third.deliverables.publication.designations.map((entry) => [entry.ordinal, entry.current, entry.publicationVersionId])).toEqual([
        [3, true, third.publicationVersionId],
        [2, false, newer.publicationVersionId],
        [1, false, original.publicationVersionId],
      ]);
      expect(third.deliverables.publication.designations[2]).toEqual({ ...originalProjection, current: false });
      expect(ledgerCounts()).toEqual({ publication_versions: 3, public_release_permissions: 3, publication_events: 6 });
      expectNoForbiddenWords(third);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('shows 自发稿版本后有修改 once the manuscript changes after the current designation, and a designation of the current state clears it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const first = await saveMilestone(store, book, '一审稿', 'stage-archive', null);
      const designated = store.designatePublicationVersion({ bookId: book.bookId, milestoneId: first.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      expect(designated.deliverables.publication.changeNotice).toBeNull();

      edit(store, book);
      const changed = store.inspectDeliverables(book.bookId).publication;
      expect(changed.changeNotice).toEqual({ label: PUBLICATION_CHANGE_NOTICE, publicationVersionId: designated.publicationVersionId, revisionLabel: 'r1' });
      expect(changed.milestones[0]).toMatchObject({ label: '一审稿', changedSince: true, changedSinceLabel: '自「一审稿」后有修改' });
      // The designation itself did not move with the text (PUB-006).
      expect(changed.designations[0]).toEqual(designated.deliverables.publication.designations[0]);

      const second = await saveMilestone(store, book, '改后稿', 'other', null);
      expect(second.revisionLabel).toBe('r2');
      const redesignated = store.designatePublicationVersion({ bookId: book.bookId, milestoneId: second.milestoneId, scope: '纸质版首印', basis: '更正后重新确认' });
      expect(redesignated.deliverables.publication.changeNotice).toBeNull();
      expect(redesignated.deliverables.publication.milestones.map((item) => [item.label, item.purposeKind, item.purposeLabel, item.changedSince])).toEqual([
        ['改后稿', 'other', '其他', false],
        ['一审稿', 'stage-archive', '阶段留档', true],
      ]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('refuses to show a designation whose stored columns no longer match the record it was written with', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const milestone = await saveMilestone(store, book, '一审稿', 'stage-archive', null);
      store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      // Only by lifting the ledger's own guard can a row change; the read then refuses rather than show it,
      // and a designation refuses rather than decide against it — neither as a repeat nor as an append.
      const guard = withDatabase(true, (database) =>
        (database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'publication_versions_no_update'").get() as { sql: string }).sql);
      withDatabase(false, (database) => database.exec(`DROP TRIGGER publication_versions_no_update;
        UPDATE publication_versions SET scope = '电子版';
        ${guard};`));
      expect(refusal(() => store.inspectDeliverables(book.bookId)).code).toBe('PUBLICATION_RECORD_INVALID');
      for (const scope of ['电子版', '纸质版首印']) {
        expect(refusal(() => store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope, basis: '三审通过' })).code)
          .toBe('PUBLICATION_RECORD_INVALID');
      }
      expect(ledgerCounts()).toEqual({ publication_versions: 1, public_release_permissions: 1, publication_events: 2 });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('keeps every milestone and designation across a restart, and the current one stays current', async () => {
    let book: Imported;
    let before: DeliverablesProjection;
    let current: { milestoneId: string; scope: string; basis: string };
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      book = await importBook(first);
      const one = await saveMilestone(first, book, '一审稿', 'stage-archive', null, '留档');
      edit(first, book);
      const two = await saveMilestone(first, book, '二审稿', 'custom', '送审前自查');
      first.designatePublicationVersion({ bookId: book.bookId, milestoneId: one.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      current = { milestoneId: two.milestoneId, scope: '电子版', basis: '二审修订后另发电子版' };
      first.designatePublicationVersion({ bookId: book.bookId, ...current });
      edit(first, book);
      before = first.inspectDeliverables(book.bookId);
      expect(before.publication.designations).toHaveLength(2);
      expect(before.publication.changeNotice).not.toBeNull();
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(second.inspectDeliverables(book.bookId)).toEqual(before);
      const repeat = second.designatePublicationVersion({ bookId: book.bookId, ...current });
      expect(repeat.outcome).toBe('unchanged');
      expect(repeat.deliverables).toEqual(before);
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);

  it('migrates a revision-24 store forward, adding the three empty relations and reading the milestones it held', async () => {
    let book: Imported;
    let held: MilestoneProjection[];
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      book = await importBook(first);
      // A revision-24 store held purposes as free words: 自行输入 stores them exactly as it always did.
      held = [
        await saveMilestone(first, book, '旧里程碑', 'custom', '确认结构复核后的状态'),
        await saveMilestone(first, book, '旧留档', 'custom', '阶段留档'),
      ];
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    // Plant revision 24: its relations are exactly the current ones less the three revision 25 adds and
    // the three revision 26 adds.
    const truthBefore = withDatabase(false, (database) => {
      database.exec(`BEGIN IMMEDIATE;
        ${[...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER, ...PUBLICATION_VERSION_RELATIONS_DROP_ORDER].map((relation) => `DROP TABLE ${relation};`).join('\n        ')}
        PRAGMA user_version = ${EDITORIAL_REVIEW_SCHEMA_VERSION};
        COMMIT;`);
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(EDITORIAL_REVIEW_SCHEMA_VERSION);
      expect(database.prepare("SELECT count(*) total FROM sqlite_schema WHERE name LIKE 'publication%' OR name LIKE 'public_release%'").get()).toEqual({ total: 0 });
      return relationTruth(database);
    });

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(PLAN_EDIT_SCHEMA_VERSION);
      const truthAfter = relationTruth(database);
      // Exactly the relations revisions 25 and 26 add appear, each empty; no relation the revision-24 store
      // held changed shape, and the only content that moved is the service lifetime every open appends.
      expect([...truthAfter.keys()]).toEqual([...truthBefore.keys(), ...PUBLICATION_VERSION_RELATIONS_DROP_ORDER, ...PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER].sort());
      for (const relation of [...PUBLICATION_VERSION_RELATIONS_DROP_ORDER, ...PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER]) expect(truthAfter.get(relation)?.content).toMatch(/^0:/);
      expect([...truthBefore].filter(([name, before]) => truthAfter.get(name)!.sql !== before.sql).map(([name]) => name)).toEqual([]);
      expect([...truthBefore].filter(([name, before]) => truthAfter.get(name)!.content !== before.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      expect(database.prepare("SELECT count(*) total FROM sqlite_schema WHERE type = 'trigger' AND tbl_name IN ('publication_versions', 'public_release_permissions', 'publication_events')").get()).toEqual({ total: 6 });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });

    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const deliverables = reopened.inspectDeliverables(book.bookId);
      // The rows saved before the kinds existed read back by the words they hold.
      expect(deliverables.publication.milestones.map((item) => [item.milestoneId, item.purposeKind, item.purposeLabel])).toEqual([
        [held[1]!.milestoneId, 'stage-archive', '阶段留档'],
        [held[0]!.milestoneId, 'custom', '确认结构复核后的状态'],
      ]);
      expect(deliverables.publication.designations).toEqual([]);
      const designated = reopened.designatePublicationVersion({ bookId: book.bookId, milestoneId: held[0]!.milestoneId, scope: '纸质版首印', basis: '迁移后首次设定' });
      expect(designated).toMatchObject({ outcome: 'designated', completionLabel: '已设为发稿版本 · 「旧里程碑」 · r1 · 纸质版首印' });
      expect(ledgerCounts()).toEqual({ publication_versions: 1, public_release_permissions: 1, publication_events: 2 });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);
});
