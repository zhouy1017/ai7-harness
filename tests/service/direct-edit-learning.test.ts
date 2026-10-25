import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BoundedManuscriptStore,
  BoundedStoreError,
  type CommandEvidenceMember,
  type ManualCommandRequestPin,
  type ManualCommandSource,
  type ManualCommandSourceCursor,
  type ManualCommandSourcePage,
} from '../../src/service/bounded-manuscript.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_GRAPHEMES,
  MAX_EDIT_CODE_UNITS,
  MAX_EDIT_GRAPHEMES,
  MAX_FRAME_BYTES,
  type JournalAcknowledgement,
  type JournalEditInput,
} from '../../src/shared/protocol.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for Issue #1140's first phase: the exact source of an original manual command, read
// from the real journal owners on a temporary Agent Data Root with exact `sample1`. Books are made and imported through
// the real Store, which is then shut down cleanly and closed before one SQLite connection and one BoundedManuscriptStore
// drive the editor's own freehand flush, manual Search/Replace, undo and redo; AI7 Apply runs through the reopened
// Store. Nothing is captured as learning yet: these tests prove the reader, and that reading writes nothing. SQL here only
// locates real records, recomputes their digests independently, or damages a disposable store for a refusal. Manuscript
// text is compared by boolean, digest, count and position only, and never printed.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-direct-edit-');
  await requireExactSample1(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

interface Book { bookId: string; manuscriptId: string; branchId: string }
interface Owners { db: DatabaseSync; bounded: BoundedManuscriptStore; lifetime: string }
type Row = Record<string, SQLOutputValue>;

/** Raw text the tests author: a decomposed and a non-composing accent, a quote, a backslash and two astral scalars. */
const RAW = 'e\u0301q\u0301"\\😀𠀀';
/** The manual replacement: NFC-stable, with JSON escapes and astral and combining graphemes. */
const REPLACEMENT = '"\\q\u0301😀';
/** Graphemes the maximum-size member is filled from. */
const FILL = ['"', '\\', '😀', 'q\u0301', 'e\u0301', '𠀀'];
const TRACKED = ['edit_journal_entries', 'manuscript_command_groups', 'manuscript_command_edits', 'learning_signals', 'global_editorial_memory_items'] as const;

function text(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('expected a text column');
  return value;
}

function int(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number') throw new Error('expected an integer column');
  return value;
}

function only(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): Row {
  const rows = db.prepare(sql).all(...params);
  expect(rows.length).toBe(1);
  return rows[0]!;
}

function counts(db: DatabaseSync): Record<string, number> {
  return Object.fromEntries(TRACKED.map((table) => [table, int(only(db, `SELECT count(*) total FROM ${table}`).total)]));
}

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof BoundedStoreError || error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

// The test's own canonical form of the flat evidence objects: keys in code-unit order, values as JSON writes them.
function canonical(value: Record<string, unknown>): string {
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${JSON.stringify(value[key])}`).join(',')}}`;
}

function sha256(...parts: string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function evidenceDigestOf(header: ManualCommandSourcePage['header'], members: ReadonlyArray<CommandEvidenceMember>): string {
  return sha256(canonical({ ...header }), ...members.map((member) => canonical({ ...member })));
}

function workingDigestOf(previous: string, sequence: number, action: string, groupId: string, evidenceDigest: string): string {
  return sha256(canonical({ schema: 'ai7.recovery-working-digest/1', previous, sequence, action, groupId, evidenceDigest }));
}

/** A command group's evidence digest recomputed here from its stored rows, independently of the product's reader. */
function storedEvidence(db: DatabaseSync, groupId: string): { digest: string; members: number } {
  const group = only(db, 'SELECT branch_id, ordinal, kind, source_group_id FROM manuscript_command_groups WHERE command_group_id = ?', groupId);
  const rows = db.prepare(
    `SELECT position, block_id, before_text, before_digest, after_text, after_digest
     FROM manuscript_command_edits WHERE command_group_id = ? ORDER BY position`,
  ).all(groupId);
  const digest = sha256(
    canonical({
      schema: 'ai7.recovery-command-evidence/1', groupId, branchId: text(group.branch_id), ordinal: int(group.ordinal),
      kind: text(group.kind), sourceGroupId: group.source_group_id === null ? null : text(group.source_group_id),
    }),
    ...rows.map((row) => canonical({
      position: int(row.position), blockId: text(row.block_id), beforeText: text(row.before_text),
      beforeDigest: text(row.before_digest), afterText: text(row.after_text), afterDigest: text(row.after_digest),
    })),
  );
  return { digest, members: rows.length };
}

/** Every journal entry of the branch recomputed into the working digest it records, over independently recomputed evidence. */
function verifiedChain(db: DatabaseSync, branchId: string): number {
  const entries = db.prepare(
    `SELECT e.sequence, e.command_kind, e.command_group_id, e.resulting_working_digest, g.before_working_digest
     FROM edit_journal_entries e JOIN manuscript_command_groups g ON g.command_group_id = e.command_group_id
     WHERE e.branch_id = ? ORDER BY e.sequence`,
  ).all(branchId);
  let previous: string | null = null;
  for (const entry of entries) {
    const groupId = text(entry.command_group_id);
    const recomputed = workingDigestOf(
      previous ?? text(entry.before_working_digest), int(entry.sequence), text(entry.command_kind), groupId, storedEvidence(db, groupId).digest,
    );
    expect(recomputed === text(entry.resulting_working_digest)).toBe(true);
    previous = recomputed;
  }
  return entries.length;
}

function commandKindOf(value: SQLOutputValue | undefined): 'edit' | 'replacement' {
  if (value === 'edit' || value === 'replacement') return value;
  throw new Error('expected an original command kind');
}

/** A source named from a real journal entry and the producer request a test retained, with an independently recomputed digest. */
function sourceOf(db: DatabaseSync, journalEntryId: string, request: ManualCommandRequestPin): ManualCommandSource {
  const entry = only(db,
    `SELECT e.sequence, e.client_edit_id, e.request_fingerprint, e.durable_at, e.manuscript_id, e.branch_id,
            e.base_revision_id, e.command_group_id, m.book_id
     FROM edit_journal_entries e JOIN manuscripts m ON m.manuscript_id = e.manuscript_id WHERE e.journal_entry_id = ?`,
    journalEntryId);
  const commandGroupId = text(entry.command_group_id);
  const group = only(db, 'SELECT kind, ordinal, before_working_digest, after_working_digest FROM manuscript_command_groups WHERE command_group_id = ?', commandGroupId);
  const evidence = storedEvidence(db, commandGroupId);
  return {
    bookId: text(entry.book_id), manuscriptId: text(entry.manuscript_id), branchId: text(entry.branch_id),
    baseRevisionId: text(entry.base_revision_id), journalEntryId, journalSequence: int(entry.sequence),
    clientEditId: text(entry.client_edit_id), requestFingerprint: text(entry.request_fingerprint), durableAt: text(entry.durable_at),
    commandGroupId, commandKind: commandKindOf(group.kind), commandOrdinal: int(group.ordinal), sourceGroupId: null,
    beforeWorkingDigest: text(group.before_working_digest), afterWorkingDigest: text(group.after_working_digest),
    evidenceDigest: evidence.digest, memberCount: evidence.members, request,
  };
}

function entryAt(db: DatabaseSync, branchId: string, sequence: number): string {
  return text(only(db, 'SELECT journal_entry_id FROM edit_journal_entries WHERE branch_id = ? AND sequence = ?', branchId, sequence).journal_entry_id);
}

function entryOfEdit(db: DatabaseSync, clientEditId: string): string {
  return text(only(db, 'SELECT journal_entry_id FROM edit_journal_entries WHERE client_edit_id = ?', clientEditId).journal_entry_id);
}

/** Every page of a source, following each page's own cursor. */
function readAll(bounded: BoundedManuscriptStore, source: ManualCommandSource, budget: number): ManualCommandSourcePage[] {
  const pages: ManualCommandSourcePage[] = [];
  let cursor: ManualCommandSourceCursor | null = null;
  do {
    const page = bounded.readManualCommandSource(source, cursor, budget);
    pages.push(page);
    cursor = page.next;
  } while (cursor !== null && pages.length <= source.memberCount);
  return pages;
}

/** The pages put back together: their members in order, and whether they rebuild the source's exact evidence. */
function reassembled(source: ManualCommandSource, pages: ReadonlyArray<ManualCommandSourcePage>): { members: CommandEvidenceMember[]; exact: boolean } {
  const members = pages.flatMap((page) => page.members);
  const exact = members.length === source.memberCount &&
    members.every((member, index) => member.position === index + 1) &&
    pages.every((page) => page.evidenceDigest === source.evidenceDigest && page.memberCount === source.memberCount) &&
    evidenceDigestOf(pages[0]!.header, members) === source.evidenceDigest;
  return { members, exact };
}

async function withStore<T>(work: (store: EditorialStore) => Promise<T> | T): Promise<T> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    const result = await work(store);
    store.markCleanShutdown();
    return result;
  } finally {
    store.close();
  }
}

/** One connection and one journal owner over the closed Store, for one service lifetime. */
function withOwners<T>(work: (owners: Owners) => T): T {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
    const bounded = new BoundedManuscriptStore(db);
    const lifetime = randomUUID();
    bounded.startServiceLifetime(lifetime, new Date().toISOString());
    const result = work({ db, bounded, lifetime });
    bounded.markServiceLifetimeClean(lifetime, new Date().toISOString());
    return result;
  } finally {
    db.close();
  }
}

async function createBooks(): Promise<{ empty: string; book: Book }> {
  return withStore(async (store) => {
    const creation = store.prepareBookCreation('空白之书', null);
    const empty = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
    const imported = await importSample1Book(store, roots.codeRoot, '直接编辑样书');
    return { empty, book: { bookId: imported.bookId, manuscriptId: imported.manuscriptId, branchId: imported.branchId } };
  });
}

/** The editor's own typing: one flush against a window that holds the block, as the renderer sends it. */
function typeInto(owners: Owners, book: Book, blockId: string, from: number, to: number, insertText: string): { input: JournalEditInput; ack: JournalAcknowledgement } {
  const window = owners.bounded.getWindow(book.manuscriptId, book.branchId, { kind: 'block', blockId });
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  const input: JournalEditInput = {
    clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
    blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence, fromGrapheme: from, toGrapheme: to, insertText,
  };
  return { input, ack: owners.bounded.flushJournalEdit(input, owners.lifetime) };
}

function blockText(db: DatabaseSync, branchId: string, blockId: string): string {
  return text(only(db, 'SELECT text FROM working_blocks WHERE branch_id = ? AND block_id = ?', branchId, blockId).text);
}

function paragraphs(db: DatabaseSync, branchId: string): Array<{ blockId: string; length: number }> {
  return db.prepare(
    "SELECT block_id, grapheme_length FROM working_blocks WHERE branch_id = ? AND kind = 'paragraph' ORDER BY position",
  ).all(branchId).map((row) => ({ blockId: text(row.block_id), length: int(row.grapheme_length) }));
}

/** The one grapheme found in the most blocks whose replacement keeps every such block inside its bounds. */
function frequentGrapheme(db: DatabaseSync, branchId: string): { query: string; blocks: number } {
  const replacementUnits = REPLACEMENT.length;
  const replacementGraphemes = graphemesOf(REPLACEMENT).length;
  const coverage = new Map<string, number>();
  const unsafe = new Set<string>();
  for (const row of db.prepare('SELECT text FROM working_blocks WHERE branch_id = ? ORDER BY position').all(branchId)) {
    const blockText = text(row.text);
    const parts = graphemesOf(blockText);
    const tally = new Map<string, number>();
    for (const part of parts) tally.set(part, (tally.get(part) ?? 0) + 1);
    for (const [part, times] of tally) {
      coverage.set(part, (coverage.get(part) ?? 0) + 1);
      if (blockText.length + times * (replacementUnits - part.length) > MAX_BLOCK_CODE_UNITS ||
        parts.length + times * (replacementGraphemes - 1) > MAX_BLOCK_GRAPHEMES) unsafe.add(part);
    }
  }
  let best: { query: string; blocks: number } = { query: '', blocks: 0 };
  for (const [part, blocks] of coverage) {
    if (unsafe.has(part) || part.trim() !== part || part.normalize('NFC') !== part || REPLACEMENT.includes(part)) continue;
    if (blocks > best.blocks) best = { query: part, blocks };
  }
  expect(best.blocks).toBeGreaterThan(1);
  return best;
}

/** The manual Search/Replace the editor runs: search, prepare, freeze, validate and commit every match. */
function replaceAll(owners: Owners, book: Book, query: string, replacement: string): { previewId: string; journalSequence: number; committed: number } {
  const search = owners.bounded.createSearch(book.manuscriptId, book.branchId, query);
  while (!owners.bounded.advanceSearch(search.searchId).done) { /* bounded search */ }
  const preview = owners.bounded.prepareReplacement(search.searchId, replacement, []);
  while (!owners.bounded.advanceReplacementWork(preview.previewId).done) { /* prepare */ }
  owners.bounded.freezeReplacement(preview.previewId, []);
  while (!owners.bounded.advanceReplacementWork(preview.previewId).done) { /* validate */ }
  const commit = owners.bounded.commitReplacement(preview.previewId, owners.lifetime);
  return { previewId: preview.previewId, journalSequence: commit.journalSequence, committed: commit.committedCount };
}

/** A preview the editor prepares and cancels: it leaves the manuscript alone and ages older terminal previews out. */
function cancelledPreview(owners: Owners, book: Book, query: string): void {
  const search = owners.bounded.createSearch(book.manuscriptId, book.branchId, query);
  while (!owners.bounded.advanceSearch(search.searchId).done) { /* bounded search */ }
  const preview = owners.bounded.prepareReplacement(search.searchId, 'x', []);
  expect(owners.bounded.cancelReplacement(preview.previewId)).toBe(true);
}

describe('the exact source of an original manual command (Issue #1140, first phase)', () => {
  it('names no source in an empty or imported Book, resolves a freehand flush exactly, and keeps its retry semantics', async () => {
    const { empty, book } = await createBooks();
    const firstRead = withOwners(({ db, bounded, lifetime }) => {
      // An empty Book has no manuscript and so no journal; an import writes no journal and no command either.
      expect(int(only(db, 'SELECT count(*) total FROM manuscripts WHERE book_id = ?', empty).total)).toBe(0);
      expect(int(only(db, 'SELECT count(*) total FROM edit_journal_entries WHERE branch_id = ?', book.branchId).total)).toBe(0);
      expect(int(only(db, 'SELECT count(*) total FROM manuscript_command_groups WHERE branch_id = ?', book.branchId).total)).toBe(0);
      const before = counts(db);
      expect(before.learning_signals).toBe(0);

      const [target, other] = paragraphs(db, book.branchId);
      const { input, ack } = typeInto({ db, bounded, lifetime }, book, target!.blockId, 1, 1, RAW);
      expect(ack.sequence).toBe(input.expectedJournalSequence + 1);
      // An exact retry is the same entry; another request under the same client edit is refused.
      const retried = bounded.flushJournalEdit(input, lifetime);
      expect({ sequence: retried.sequence, digest: retried.resultingWorkingDigest, at: retried.durableAt })
        .toEqual({ sequence: ack.sequence, digest: ack.resultingWorkingDigest, at: ack.durableAt });
      expect(code(() => bounded.flushJournalEdit({ ...input, insertText: 'x' }, lifetime))).toBe('IDEMPOTENCY_CONFLICT');
      const afterEdit = counts(db);
      expect(afterEdit).toEqual({
        ...before,
        edit_journal_entries: before.edit_journal_entries! + 1,
        manuscript_command_groups: before.manuscript_command_groups! + 1,
        manuscript_command_edits: before.manuscript_command_edits! + 1,
      });

      // The source is the real entry named by the retained request, and its digest is the one the working chain holds.
      const source = sourceOf(db, entryOfEdit(db, input.clientEditId), { origin: 'journal-edit', windowStartBlockId: input.windowStartBlockId });
      expect(source).toMatchObject({
        bookId: book.bookId, manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: input.baseRevisionId,
        clientEditId: input.clientEditId, journalSequence: ack.sequence, durableAt: ack.durableAt,
        afterWorkingDigest: ack.resultingWorkingDigest, commandKind: 'edit', memberCount: 1,
      });
      expect(workingDigestOf(source.beforeWorkingDigest, ack.sequence, 'edit', source.commandGroupId, source.evidenceDigest)).toBe(ack.resultingWorkingDigest);

      const page = bounded.readManualCommandSource(source, null, MAX_FRAME_BYTES);
      expect(page.header).toEqual({
        schema: 'ai7.recovery-command-evidence/1', groupId: source.commandGroupId, branchId: book.branchId,
        ordinal: source.commandOrdinal, kind: 'edit', sourceGroupId: null,
      });
      expect(reassembled(source, [page]).exact).toBe(true);
      expect(page.next).toBeNull();
      const member = page.members[0]!;
      // The raw request text is kept as typed: not normalized, every escape and astral scalar intact.
      expect(member.blockId).toBe(input.blockId);
      expect(member.afterText.includes(RAW) && member.afterText.normalize('NFC') !== member.afterText).toBe(true);
      expect(member.afterText === blockText(db, book.branchId, input.blockId)).toBe(true);
      expect(page.current).toEqual([{ position: 1, block: 'recorded-after' }]);
      expect(page.history).toMatchObject({
        journalSequence: ack.sequence, workingDigest: ack.resultingWorkingDigest, boundaryCrossed: false, groupStatus: 'applied',
        lastAction: { kind: 'edit', journalEntryId: source.journalEntryId, sequence: ack.sequence }, restoration: null,
      });

      // Only the exact original binding proves itself.
      expect(code(() => bounded.readManualCommandSource({ ...source, bookId: empty }, null, MAX_FRAME_BYTES))).toBe('MANUAL_SOURCE_MISMATCH');
      expect(code(() => bounded.readManualCommandSource({ ...source, journalEntryId: randomUUID() }, null, MAX_FRAME_BYTES))).toBe('MANUAL_SOURCE_MISMATCH');
      const wrongWindow = [other!.blockId, target!.blockId].find((blockId) => blockId !== input.windowStartBlockId)!;
      expect(code(() => bounded.readManualCommandSource(
        { ...source, request: { origin: 'journal-edit', windowStartBlockId: wrongWindow } }, null, MAX_FRAME_BYTES,
      ))).toBe('MANUAL_SOURCE_MISMATCH');
      expect(code(() => bounded.readManualCommandSource({ ...source, evidenceDigest: 'f'.repeat(64) }, null, MAX_FRAME_BYTES))).toBe('MANUAL_SOURCE_MISMATCH');
      expect(code(() => bounded.readManualCommandSource(
        { ...source, commandKind: 'replacement', request: { origin: 'manual-search-replacement', previewId: randomUUID() } }, null, MAX_FRAME_BYTES,
      ))).toBe('MANUAL_SOURCE_MISMATCH');
      // A reference arrives as parsed data: an unknown origin or field is refused before any record is read.
      const forged: ManualCommandSource = JSON.parse(JSON.stringify({ ...source, request: { origin: 'apply', applyCommandGroupId: source.commandGroupId } }));
      expect(code(() => bounded.readManualCommandSource(forged, null, MAX_FRAME_BYTES))).toBe('MANUAL_SOURCE_INVALID');
      const widened = { ...source, decisionId: null };
      expect(code(() => bounded.readManualCommandSource(widened, null, MAX_FRAME_BYTES))).toBe('MANUAL_SOURCE_INVALID');
      expect(code(() => bounded.readManualCommandSource({ ...source, commandKind: 'replacement' }, null, MAX_FRAME_BYTES))).toBe('MANUAL_SOURCE_INVALID');

      // A lost acknowledgement retried after a later edit stays the existing drift refusal; the source is unchanged by it.
      const later = typeInto({ db, bounded, lifetime }, book, other!.blockId, 0, 0, '乙');
      expect(code(() => bounded.flushJournalEdit(input, lifetime))).toBe('JOURNAL_ACK_FAILED');
      const laterSource = sourceOf(db, entryOfEdit(db, later.input.clientEditId), { origin: 'journal-edit', windowStartBlockId: later.input.windowStartBlockId });
      // The later entry cannot stand in for the first one's group.
      expect(code(() => bounded.readManualCommandSource({ ...laterSource, commandGroupId: source.commandGroupId }, null, MAX_FRAME_BYTES))).toBe('MANUAL_SOURCE_MISMATCH');
      const again = bounded.readManualCommandSource(source, null, MAX_FRAME_BYTES);
      expect(again.evidenceDigest).toBe(page.evidenceDigest);
      expect(again.history).toMatchObject({ journalSequence: later.ack.sequence, lastAction: { kind: 'edit', sequence: ack.sequence } });
      expect(again.history.digest).not.toBe(page.history.digest);

      // The largest member a block supports: one block filled by flushes to its bound, read back whole.
      const shortest = paragraphs(db, book.branchId).filter((candidate) => candidate.blockId !== target!.blockId && candidate.blockId !== other!.blockId)
        .sort((left, right) => left.length - right.length)[0]!;
      let filled: { input: JournalEditInput; ack: JournalAcknowledgement } | undefined;
      let flushes = 0;
      for (;;) {
        const current = blockText(db, book.branchId, shortest.blockId);
        let units = current.length;
        let graphemes = graphemesOf(current).length;
        const chunk: string[] = [];
        let chunkUnits = 0;
        for (let index = 0; chunk.length < MAX_EDIT_GRAPHEMES && graphemes < MAX_BLOCK_GRAPHEMES; index += 1) {
          const fits = (part: string): boolean => chunkUnits + part.length <= MAX_EDIT_CODE_UNITS && units + part.length <= MAX_BLOCK_CODE_UNITS;
          const part = [FILL[(flushes + index) % FILL.length]!, '"'].find(fits);
          if (part === undefined) break;
          chunk.push(part);
          chunkUnits += part.length;
          units += part.length;
          graphemes += 1;
        }
        if (chunk.length === 0) break;
        filled = typeInto({ db, bounded, lifetime }, book, shortest.blockId, graphemesOf(current).length, graphemesOf(current).length, chunk.join(''));
        flushes += 1;
      }
      expect(flushes).toBeGreaterThan(1);
      const largest = sourceOf(db, entryOfEdit(db, filled!.input.clientEditId), { origin: 'journal-edit', windowStartBlockId: filled!.input.windowStartBlockId });
      const largestPage = bounded.readManualCommandSource(largest, null, MAX_FRAME_BYTES);
      const pair = largestPage.members[0]!;
      expect(reassembled(largest, [largestPage]).exact).toBe(true);
      expect(pair.afterText.length === MAX_BLOCK_CODE_UNITS || graphemesOf(pair.afterText).length === MAX_BLOCK_GRAPHEMES).toBe(true);
      expect(pair.afterText === blockText(db, book.branchId, shortest.blockId)).toBe(true);
      // JSON writes a UTF-16 unit as at most six bytes, so even a worst-case pair is a small part of one frame.
      const worstPair = 2 * (2 + 6 * MAX_BLOCK_CODE_UNITS) + 1_024;
      expect(bytes(pair)).toBeLessThanOrEqual(worstPair);
      expect(worstPair * 8).toBeLessThan(MAX_FRAME_BYTES);
      expect(bytes(largestPage)).toBeLessThanOrEqual(MAX_FRAME_BYTES);

      // Reading created nothing, and no learning signal exists: capture is not wired in this phase.
      const settled = counts(db);
      for (let read = 0; read < 3; read += 1) bounded.readManualCommandSource(source, null, MAX_FRAME_BYTES);
      expect(counts(db)).toEqual(settled);
      expect(settled.learning_signals).toBe(0);
      expect(verifiedChain(db, book.branchId)).toBe(2 + flushes);
      return { source, digest: page.evidenceDigest, settled };
    });

    // The reopened Store accepts the history whole, and the source still reads the same with nothing added.
    await withStore(() => undefined);
    withOwners(({ db, bounded }) => {
      const reread = bounded.readManualCommandSource(firstRead.source, null, MAX_FRAME_BYTES);
      expect(reread.evidenceDigest).toBe(firstRead.digest);
      expect(reassembled(firstRead.source, [reread]).exact).toBe(true);
      expect(counts(db)).toEqual(firstRead.settled);
    });
  }, 180_000);

  it('reads a many-block manual Search/Replace whole after its preview is pruned, in complete pages within a byte budget', async () => {
    const { empty, book } = await createBooks();
    withOwners((owners) => {
      const { db, bounded, lifetime } = owners;
      const { query, blocks } = frequentGrapheme(db, book.branchId);
      const replaced = replaceAll(owners, book, query, REPLACEMENT);
      expect(replaced.committed).toBeGreaterThanOrEqual(blocks);
      const committedCounts = counts(db);
      // A committed preview cannot be committed again, before or after it is pruned.
      expect(code(() => bounded.commitReplacement(replaced.previewId, lifetime))).toBe('REPLACEMENT_NOT_READY');
      for (let cycle = 0; cycle < 10 && int(only(db, 'SELECT count(*) total FROM manuscript_replacement_previews WHERE preview_id = ?', replaced.previewId).total) > 0; cycle += 1) {
        cancelledPreview(owners, book, '😀');
      }
      expect(int(only(db, 'SELECT count(*) total FROM manuscript_replacement_previews WHERE preview_id = ?', replaced.previewId).total)).toBe(0);
      expect(code(() => bounded.commitReplacement(replaced.previewId, lifetime))).toBe('REPLACEMENT_NOT_FOUND');
      expect(counts(db)).toEqual(committedCounts);

      // The pruned preview's identity still proves the commit manual; the evidence is one source of every replaced block.
      const source = sourceOf(db, entryAt(db, book.branchId, replaced.journalSequence), { origin: 'manual-search-replacement', previewId: replaced.previewId });
      expect(source.commandKind).toBe('replacement');
      expect(source.memberCount).toBe(blocks);
      expect(workingDigestOf(source.beforeWorkingDigest, source.journalSequence, 'replacement', source.commandGroupId, source.evidenceDigest)).toBe(source.afterWorkingDigest);
      const whole = readAll(bounded, source, MAX_FRAME_BYTES);
      const complete = reassembled(source, whole);
      expect(complete.exact).toBe(true);
      expect(complete.members.every((member) => member.afterText.includes(REPLACEMENT) &&
        !graphemesOf(member.afterText).includes(query) && graphemesOf(member.beforeText).includes(query))).toBe(true);
      const states = whole.flatMap((page) => page.current);
      expect(states.every((state, index) => state.position === index + 1 && state.block === 'recorded-after')).toBe(true);
      expect(whole.every((page) => bytes(page) <= MAX_FRAME_BYTES)).toBe(true);

      // A smaller budget splits the same evidence into several pages, each packed with whole members up to its budget.
      const first = whole[0]!;
      const worstNext = { commandGroupId: source.commandGroupId, evidenceDigest: source.evidenceDigest, afterPosition: source.memberCount, historyDigest: first.history.digest };
      const sizes = complete.members.map((member, index) => bytes(member) + bytes(states[index]) + 2);
      const budget = bytes({ ...first, members: [], current: [], next: worstNext }) + 3 * Math.max(...sizes);
      const paged = readAll(bounded, source, budget);
      expect(paged.length).toBeGreaterThan(2);
      const split = reassembled(source, paged);
      expect(split.exact).toBe(true);
      expect(split.members.every((member, index) => bytes(member) === bytes(complete.members[index]) && member.afterDigest === complete.members[index]!.afterDigest)).toBe(true);
      for (const page of paged) {
        expect(bytes(page)).toBeLessThanOrEqual(budget);
        if (page.next === null) continue;
        const following = page.next.afterPosition;
        expect(bytes({ ...page, next: worstNext }) + sizes[following]! > budget).toBe(true);
      }
      const pagedCounts = counts(db);

      // A cursor binds its source, an exclusive position inside it and, by default, the history it was read against.
      const cursor = paged[0]!.next!;
      expect(cursor).toMatchObject({ commandGroupId: source.commandGroupId, evidenceDigest: source.evidenceDigest, historyDigest: paged[0]!.history.digest });
      for (const wrong of [
        { ...cursor, afterPosition: source.memberCount }, { ...cursor, afterPosition: -1 }, { ...cursor, afterPosition: 1.5 },
        { ...cursor, evidenceDigest: 'f'.repeat(64) }, { ...cursor, commandGroupId: randomUUID() }, { ...cursor, page: 2 },
      ]) {
        expect(code(() => bounded.readManualCommandSource(source, wrong, budget))).toBe('MANUAL_SOURCE_INVALID');
      }
      for (const wrongBudget of [0, MAX_FRAME_BYTES + 1, 256]) {
        expect(code(() => bounded.readManualCommandSource(source, null, wrongBudget))).toBe('MANUAL_SOURCE_INVALID');
      }
      expect(code(() => bounded.readManualCommandSource({ ...source, request: { origin: 'manual-search-replacement', previewId: randomUUID() } }, null, budget))).toBe('MANUAL_SOURCE_MISMATCH');
      expect(code(() => bounded.readManualCommandSource({ ...source, memberCount: source.memberCount + 1 }, null, budget))).toBe('MANUAL_SOURCE_MISMATCH');
      expect(code(() => bounded.readManualCommandSource({ ...source, bookId: empty }, null, budget))).toBe('MANUAL_SOURCE_MISMATCH');
      expect(code(() => bounded.readManualCommandSource(
        { ...source, commandKind: 'edit', request: { origin: 'journal-edit', windowStartBlockId: complete.members[0]!.blockId } }, null, budget,
      ))).toBe('MANUAL_SOURCE_MISMATCH');

      // Editing a replaced block changes the history: a pinned cursor refuses, an unpinned one reads the same evidence.
      const touched = complete.members[0]!.blockId;
      typeInto(owners, book, touched, 0, 0, '丙');
      expect(code(() => bounded.readManualCommandSource(source, cursor, budget))).toBe('MANUAL_SOURCE_HISTORY_CHANGED');
      const unpinned = bounded.readManualCommandSource(source, { ...cursor, historyDigest: null }, budget);
      expect(unpinned.members.length).toBeGreaterThan(0);
      expect(unpinned.members.every((member, index) => member.position === cursor.afterPosition + 1 + index &&
        member.afterDigest === complete.members[cursor.afterPosition + index]!.afterDigest)).toBe(true);
      expect(unpinned.next?.historyDigest ?? null).toBeNull();
      const refreshed = bounded.readManualCommandSource(source, null, budget);
      expect(refreshed.evidenceDigest).toBe(source.evidenceDigest);
      expect(refreshed.history.journalSequence).toBe(source.journalSequence + 1);
      expect(refreshed.history.lastAction).toEqual({ kind: 'replacement', journalEntryId: source.journalEntryId, sequence: source.journalSequence });
      expect(refreshed.current[0]).toEqual({ position: 1, block: 'other-text' });
      expect(counts(db)).toEqual({
        ...pagedCounts,
        edit_journal_entries: pagedCounts.edit_journal_entries! + 1,
        manuscript_command_groups: pagedCounts.manuscript_command_groups! + 1,
        manuscript_command_edits: pagedCounts.manuscript_command_edits! + 1,
      });
      expect(verifiedChain(db, book.branchId)).toBe(2);

      // Damage after the first page still refuses the first page: every page reads the whole group.
      const lastPosition = source.memberCount;
      const original = text(only(db, 'SELECT after_text FROM manuscript_command_edits WHERE command_group_id = ? AND position = ?', source.commandGroupId, lastPosition).after_text);
      db.prepare('UPDATE manuscript_command_edits SET after_text = ? WHERE command_group_id = ? AND position = ?').run(`${original}丁`, source.commandGroupId, lastPosition);
      expect(code(() => bounded.readManualCommandSource(source, null, budget))).toBe('HISTORY_CORRUPT');
      db.prepare('UPDATE manuscript_command_edits SET after_text = ? WHERE command_group_id = ? AND position = ?').run(original, source.commandGroupId, lastPosition);
      expect(bounded.readManualCommandSource(source, null, budget).evidenceDigest).toBe(source.evidenceDigest);
      db.prepare('DELETE FROM manuscript_command_edits WHERE command_group_id = ? AND position = ?').run(source.commandGroupId, lastPosition);
      expect(code(() => bounded.readManualCommandSource(source, null, budget))).toBe('HISTORY_CORRUPT');
      expect(counts(db).learning_signals).toBe(0);
    });
  }, 180_000);

  it('keeps one identity through undo and redo, reports redo-tail and Apply boundaries as history, and refuses Apply and undo as manual', async () => {
    const { book } = await createBooks();
    const local = withOwners((owners) => {
      const { db, bounded, lifetime } = owners;
      const [first, second] = paragraphs(db, book.branchId);
      const typed = typeInto(owners, book, first!.blockId, 0, 0, '甲');
      const freehand = sourceOf(db, entryOfEdit(db, typed.input.clientEditId), { origin: 'journal-edit', windowStartBlockId: typed.input.windowStartBlockId });
      const { query } = frequentGrapheme(db, book.branchId);
      const replaced = replaceAll(owners, book, query, REPLACEMENT);
      const manual = sourceOf(db, entryAt(db, book.branchId, replaced.journalSequence), { origin: 'manual-search-replacement', previewId: replaced.previewId });
      const created = bounded.readManualCommandSource(manual, null, MAX_FRAME_BYTES);
      const workingDigest = (): string => bounded.getWindow(book.manuscriptId, book.branchId, { kind: 'start' }).workingDigest;

      // Undo and redo move the same group's history; its evidence and identity do not move.
      const undone = bounded.undo(book.manuscriptId, book.branchId, workingDigest(), lifetime);
      expect(undone.commandGroupId).toBe(manual.commandGroupId);
      const afterUndo = readAll(bounded, manual, MAX_FRAME_BYTES);
      expect(reassembled(manual, afterUndo).exact).toBe(true);
      expect(afterUndo[0]!.history).toMatchObject({
        groupStatus: 'undone', boundaryCrossed: false,
        lastAction: { kind: 'undo', journalEntryId: entryAt(db, book.branchId, undone.journalSequence), sequence: undone.journalSequence },
      });
      expect(afterUndo.flatMap((page) => page.current).every((state) => state.block === 'other-text')).toBe(true);
      // The undo entry is not the group's creation, however the rest of the reference reads.
      expect(code(() => bounded.readManualCommandSource({ ...manual, journalEntryId: entryAt(db, book.branchId, undone.journalSequence) }, null, MAX_FRAME_BYTES)))
        .toBe('MANUAL_SOURCE_MISMATCH');
      expect(code(() => bounded.readManualCommandSource(
        sourceOf(db, entryAt(db, book.branchId, undone.journalSequence), manual.request), null, MAX_FRAME_BYTES,
      ))).toBe('MANUAL_SOURCE_MISMATCH');
      const redone = bounded.redo(book.manuscriptId, book.branchId, workingDigest(), lifetime);
      const afterRedo = bounded.readManualCommandSource(manual, null, MAX_FRAME_BYTES);
      expect(afterRedo.evidenceDigest).toBe(created.evidenceDigest);
      expect(afterRedo.history).toMatchObject({ groupStatus: 'applied', lastAction: { kind: 'redo', sequence: redone.journalSequence } });
      expect(afterRedo.current.every((state) => state.block === 'recorded-after')).toBe(true);

      // New typing after an undo discards the redo tail: the group is superseded, though no history boundary crossed it.
      bounded.undo(book.manuscriptId, book.branchId, workingDigest(), lifetime);
      typeInto(owners, book, second!.blockId, 0, 0, '乙');
      expect(code(() => bounded.redo(book.manuscriptId, book.branchId, workingDigest(), lifetime))).toBe('NOTHING_TO_REDO');
      const tail = bounded.readManualCommandSource(manual, null, MAX_FRAME_BYTES);
      expect(tail.evidenceDigest).toBe(created.evidenceDigest);
      expect(tail.history).toMatchObject({ groupStatus: 'superseded', boundaryCrossed: false, lastAction: { kind: 'undo' } });
      expect(bounded.readManualCommandSource(freehand, null, MAX_FRAME_BYTES).history).toMatchObject({ groupStatus: 'applied', boundaryCrossed: false });
      expect(verifiedChain(db, book.branchId)).toBe(6);
      return { freehand, manual, tail: tail.history, counts: counts(db) };
    });

    // AI7 Apply and its reversal run through the real Store, on a Change Suggestion the editor makes there.
    const applied = await withStore((store) => {
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 12)!;
      const binding = { ...book, windowStartBlockId: window.blocks[0]!.blockId };
      const mark = store.createEditorialMark({
        manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId, clientMarkId: randomUUID(),
        baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence, blockId: block.blockId,
        baseBlockDigest: block.digest, fromGrapheme: 4, toGrapheme: 8, selectedText: graphemesOf(block.text).slice(4, 8).join(''),
        kind: 'change-suggestion', highlightColor: null, body: '', proposedText: '〔建议〕', rationale: null,
      });
      const apply = store.applyChangeSuggestion({
        manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: binding.windowStartBlockId, markId: mark.markId,
        clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      const reverse = store.reverseAppliedChangeSuggestion({
        manuscriptId: book.manuscriptId, branchId: book.branchId,
        windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId,
        markId: mark.markId, clientEffectId: randomUUID(),
      });
      return { apply: apply.application.after.journalSequence, reverse: reverse.application.after.journalSequence };
    });

    withOwners(({ db, bounded }) => {
      // An Apply and its reversal journal `replacement` too, but no preview proves either manual.
      for (const sequence of [applied.apply, applied.reverse]) {
        const entry = entryAt(db, book.branchId, sequence);
        expect(code(() => bounded.readManualCommandSource(sourceOf(db, entry, local.manual.request), null, MAX_FRAME_BYTES))).toBe('MANUAL_SOURCE_MISMATCH');
        expect(code(() => bounded.readManualCommandSource(
          sourceOf(db, entry, { origin: 'manual-search-replacement', previewId: randomUUID() }), null, MAX_FRAME_BYTES,
        ))).toBe('MANUAL_SOURCE_MISMATCH');
      }
      // The Apply is a history boundary: it supersedes the earlier typing and is reported apart from the redo tail.
      const crossed = bounded.readManualCommandSource(local.freehand, null, MAX_FRAME_BYTES);
      expect(reassembled(local.freehand, [crossed]).exact).toBe(true);
      expect(crossed.history).toMatchObject({ groupStatus: 'superseded', boundaryCrossed: true, lastAction: { kind: 'edit', sequence: local.freehand.journalSequence } });
      const manual = readAll(bounded, local.manual, MAX_FRAME_BYTES);
      expect(reassembled(local.manual, manual).exact).toBe(true);
      expect(manual[0]!.history).toMatchObject({ groupStatus: 'superseded', boundaryCrossed: true, lastAction: { kind: 'undo' } });
      expect(local.tail).toMatchObject({ groupStatus: 'superseded', boundaryCrossed: false });
      // The shared evidence still proves every entry of the branch, Apply and reversal included, and reading added nothing.
      expect(verifiedChain(db, book.branchId)).toBe(8);
      expect(local.counts.learning_signals).toBe(0);
      expect({ ...counts(db), learning_signals: 0 }).toEqual({
        ...local.counts,
        edit_journal_entries: local.counts.edit_journal_entries! + 2,
        manuscript_command_groups: local.counts.manuscript_command_groups! + 2,
        manuscript_command_edits: local.counts.manuscript_command_edits! + 2,
      });
      // The accepted Change Suggestion records its own Proposal Decision signal; no signal names a manual command.
      const signals = db.prepare('SELECT canonical_json FROM learning_signals').all().map((row) => text(row.canonical_json));
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((json) => typeof JSON.parse(json).source?.decisionId === 'string')).toBe(true);
      expect(signals.every((json) => [local.manual, local.freehand].every((source) =>
        !json.includes(source.commandGroupId) && !json.includes(source.journalEntryId)))).toBe(true);
    });
  }, 180_000);
});
