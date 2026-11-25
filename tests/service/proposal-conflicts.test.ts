import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { KEEP_CURRENT_REASON, PROPOSAL_CONFLICT_SCHEMA_SQL } from '../../src/service/proposal-conflicts.js';
import { conflictUnits, initialResolutions, type ConflictUnitResolution } from '../../src/shared/conflict-units.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection, ProposalConflictProjection } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 稿件冲突 of a single 修改建议 (Issue #57, plan slice S22; ADR 0085). It
// drives the real `EditorialStore` on a temporary Agent Data Root. The manuscript is composed from the one
// admitted SampleBook; every string written into it is authored here, and manuscript text is compared by
// equality, length and offset only.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '冲突组稿' };
const PROPOSED = '〔建议〕';
const TYPED = '〔改〕';
const EDITED = '〔合并〕';
const LEDGER = Object.keys(PROPOSAL_CONFLICT_SCHEMA_SQL);

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, EXCERPT);
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
  return { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

function windowOf(store: EditorialStore, book: Imported): ManuscriptWindowProjection {
  return store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
}

/** Two paragraphs long enough to hold a suggestion with room on both sides of it. */
function paragraphs(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'] {
  const found = window.blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 60);
  if (found.length < 3) throw new Error('the composed window holds fewer than three paragraphs of 60 graphemes');
  return found;
}

function blockText(store: EditorialStore, book: Imported, blockId: string): string {
  return windowOf(store, book).blocks.find((block) => block.blockId === blockId)!.text;
}

function binding(store: EditorialStore, book: Imported): Imported & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: windowOf(store, book).blocks[0]!.blockId };
}

function suggest(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, proposedText = PROPOSED, rationale: string | null = null): string {
  const window = windowOf(store, book);
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  return store.createEditorialMark({
    ...book,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText,
    rationale,
  }).markId;
}

/** The editor's own typing: one journal edit of one block, against the window as it stands now. */
function typeInto(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, insertText: string): void {
  const now = windowOf(store, book);
  store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: from, toGrapheme: to, insertText,
  });
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
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

function ledgerCounts(): Record<string, number> {
  return withDatabase(true, (database) => Object.fromEntries(LEDGER.map((table) => [
    table,
    (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total,
  ])));
}

function anchorConflict(store: EditorialStore, book: Imported, markId: string): string | null | undefined {
  return windowOf(store, book).marks.find((mark) => mark.markId === markId)?.conflict;
}

/** Every changed unit resolved one way, the same unit kinds staying `null`. */
function resolveEvery(conflict: ProposalConflictProjection, entry: ConflictUnitResolution): ConflictUnitResolution[] {
  return conflict.units.map((unit) => (unit.kind === 'same' ? { resolution: null, text: null } : entry));
}

interface Suggested {
  book: Imported;
  blockId: string;
  markId: string;
  pinned: string;
  /** The block's text before anything was typed into it. */
  original: string;
}

/** A 修改建议 over graphemes [20, 26) of the first long paragraph, whose own words the editor then edits. */
async function driftedSuggestion(store: EditorialStore): Promise<Suggested & { current: string }> {
  const book = await importBook(store);
  const block = paragraphs(windowOf(store, book))[0]!;
  const original = block.text;
  const markId = suggest(store, book, block.blockId, 20, 26, PROPOSED, '理由：语气更准');
  const pinned = graphemesOf(original).slice(20, 26).join('');
  typeInto(store, book, block.blockId, 23, 23, TYPED);
  return { book, blockId: block.blockId, markId, pinned, original, current: graphemesOf(blockText(store, book, block.blockId)).slice(20, 26 + graphemesOf(TYPED).length).join('') };
}

describe('稿件冲突 of a single 修改建议 (ADR 0085)', () => {
  it('saves the Resolution Draft on its basis, repeats nothing, refuses a stale or ill-fitting draft, and restores it after a restart', async () => {
    let book: Imported;
    let markId: string;
    let basis: string;
    let saved: ReturnType<EditorialStore['saveProposalConflictDraft']>;
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const made = await driftedSuggestion(first);
      book = made.book;
      markId = made.markId;
      const conflict = first.inspectProposalConflict({ ...book, markId });
      basis = conflict.basisDigest;
      const textBefore = blockText(first, book, made.blockId);
      const units = resolveEvery(conflict, { resolution: 'edited', text: EDITED });
      saved = first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units });
      expect(saved).toMatchObject({ markId, basisDigest: basis, draft: { ordinal: 1, resolutions: units, text: EDITED, complete: true } });
      // The same draft again appends nothing; another one is the next ordinal.
      expect(first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units }).draft.draftId).toBe(saved.draft.draftId);
      const partial = first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: initialResolutions(conflict.units) });
      expect(partial.draft).toMatchObject({ ordinal: 2, complete: false, text: made.current });
      saved = first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units });
      expect(saved.draft.ordinal).toBe(3);
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 3, proposal_conflict_deferrals: 0, proposal_conflict_outcomes: 0 });
      // A draft for another basis, of another shape, or with an unbounded edit is refused whole.
      expect(refusal(() => first.saveProposalConflictDraft({ ...book, markId, basisDigest: 'f'.repeat(64), units }))).toBe('PROPOSAL_CONFLICT_STALE');
      expect(refusal(() => first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: [...units, { resolution: 'current', text: null }] })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_INVALID');
      expect(refusal(() => first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: resolveEvery(conflict, { resolution: 'edited', text: null }) })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_INVALID');
      expect(refusal(() => first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: resolveEvery(conflict, { resolution: 'edited', text: '长'.repeat(4_001) }) })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_INVALID');
      expect(ledgerCounts().proposal_conflict_drafts).toBe(3);
      expect(blockText(first, book, made.blockId)).toBe(textBefore);
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const restored = second.inspectProposalConflict({ ...book, markId });
      expect(restored.basisDigest).toBe(basis);
      expect(restored.draft).toEqual(saved.draft);
      // A change anywhere in the paragraph is a new basis: the draft is kept, not loaded, and the old basis is refused.
      const blockId = restored.blockId;
      typeInto(second, book, blockId, 0, 0, TYPED);
      const moved = second.inspectProposalConflict({ ...book, markId });
      expect(moved.basisDigest).not.toBe(basis);
      expect(moved.draft).toBeNull();
      expect(moved.draftOnEarlierBasis).toBe(true);
      expect(refusal(() => second.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: saved.draft.resolutions }))).toBe('PROPOSAL_CONFLICT_STALE');
      expect(refusal(() => second.resolveProposalConflict({ ...book, markId, basisDigest: basis, outcome: 'new-version', draftOrdinal: 3 }))).toBe('PROPOSAL_CONFLICT_STALE');
      // Undoing that change brings the basis back, and with it the draft saved on it.
      second.undoManuscript(book.manuscriptId, book.branchId, windowOf(second, book).workingDigest);
      expect(second.inspectProposalConflict({ ...book, markId }).draft).toEqual(saved.draft);
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);

  it('defers a conflict with a record, keeps it listed, blocking and its draft kept, across a restart', async () => {
    let book: Imported;
    let markId: string;
    let draftId: string;
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const made = await driftedSuggestion(first);
      book = made.book;
      markId = made.markId;
      const conflict = first.inspectProposalConflict({ ...book, markId });
      draftId = first.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'proposed', text: null }) }).draft.draftId;
      const deferred = first.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'defer', draftOrdinal: null });
      expect(deferred).toMatchObject({ markId, outcome: 'defer', newMarkId: null });
      const card = first.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card.conflict).toEqual({ kind: 'suggestion', state: 'deferred', deferredAt: deferred.recordedAt, outcome: null, newMarkId: null, resolvedAt: null });
      expect(card.status).toBe('open');
      expect(card.suggestion?.decision).toBeNull();
      expect(anchorConflict(first, book, markId)).toBe('deferred');
      expect(refusal(() => first.applyChangeSuggestion({
        ...binding(first, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      }))).toBe('APPLY_TARGET_DRIFTED');
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const reopened = second.inspectProposalConflict({ ...book, markId });
      expect(reopened.deferral).not.toBeNull();
      expect(reopened.draft?.draftId).toBe(draftId);
      expect(reopened.navigator.entries).toEqual([{ markId, blockId: reopened.blockId, conflictKind: 'suggestion', deferred: true }]);
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 1, proposal_conflict_deferrals: 1, proposal_conflict_outcomes: 0 });
      // A deferred conflict is still resolved later like any other.
      second.resolveProposalConflict({ ...book, markId, basisDigest: reopened.basisDigest, outcome: 'new-version', draftOrdinal: reopened.draft!.ordinal });
      expect(ledgerCounts().proposal_conflict_outcomes).toBe(1);
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);

  it('keeps its records immutable, and refuses to show one whose columns no longer match what was written', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { book, markId } = await driftedSuggestion(store);
      const conflict = store.inspectProposalConflict({ ...book, markId });
      store.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'edited', text: EDITED }) });
      store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'defer', draftOrdinal: null });
      // A second conflict, kept as it is, so every one of the three relations holds a row.
      const second = paragraphs(windowOf(store, book))[1]!;
      const keptId = suggest(store, book, second.blockId, 10, 16);
      typeInto(store, book, second.blockId, 12, 12, TYPED);
      const kept = store.inspectProposalConflict({ ...book, markId: keptId });
      store.resolveProposalConflict({ ...book, markId: keptId, basisDigest: kept.basisDigest, outcome: 'keep-current', draftOrdinal: null });
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 1, proposal_conflict_deferrals: 1, proposal_conflict_outcomes: 1 });
      withDatabase(false, (database) => {
        for (const table of LEDGER) {
          expect(() => database.exec(`UPDATE ${table} SET actor = actor`)).toThrow(/PROPOSAL_CONFLICT_LEDGER_IMMUTABLE/);
          expect(() => database.exec(`DELETE FROM ${table}`)).toThrow(/PROPOSAL_CONFLICT_LEDGER_IMMUTABLE/);
        }
      });
      // Only by lifting the ledger's own guard can a row change; the read then refuses rather than show it.
      const guard = withDatabase(true, (database) =>
        (database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'proposal_conflict_drafts_no_update'").get() as { sql: string }).sql);
      withDatabase(false, (database) => database.exec(`DROP TRIGGER proposal_conflict_drafts_no_update;
        UPDATE proposal_conflict_drafts SET draft_text = '〔篡改〕';
        ${guard};`));
      expect(refusal(() => store.inspectProposalConflict({ ...book, markId }))).toBe('PROPOSAL_CONFLICT_RECORD_INVALID');
      const deferralGuard = withDatabase(true, (database) =>
        (database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'proposal_conflict_deferrals_no_update'").get() as { sql: string }).sql);
      withDatabase(false, (database) => database.exec(`DROP TRIGGER proposal_conflict_deferrals_no_update;
        UPDATE proposal_conflict_deferrals SET created_at = '2000-01-01T00:00:00.000Z';
        ${deferralGuard};`));
      expect(refusal(() => store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId))).toBe('PROPOSAL_CONFLICT_RECORD_INVALID');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

});
