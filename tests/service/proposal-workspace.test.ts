import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { dropFactualVerificationRelations, restoreTaskIntentDraftPredecessor } from '../support/pre74-schema.js';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { MAX_FRAME_BYTES, applyReceiptState, legacyApplyOutcome, type ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { applyOnce } from '../../src/renderer/manuscript-apply.js';
import { readProposalWorkspace } from '../../src/renderer/proposal-workspace.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { EDITORIAL_MARK_TRIGGER_SQL, PROPOSAL_ITEM_DECISIONS_PRE77_SQL, PROPOSAL_REVIEW_SCHEMA_SQL } from '../../src/service/editorial-marks.js';
import { readApplyOutcomeAttention } from '../../src/service/global-attention.js';

// Service-integration suite (L2) for AI7 Apply on Change Suggestions (Issue #408). The manuscript is
// composed from the one admitted SampleBook; every string written into it is authored here, and
// manuscript text is compared by boolean, length and offset only.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '应用组稿' };
const PROPOSED = '〔建议〕';
const EDITED = '〔编辑改定〕';
const EFFECT_RELATIONS = ['manuscript_effect_receipts', 'manuscript_effect_dispatches', 'manuscript_effect_approvals', 'manuscript_effect_targets', 'manuscript_effect_intents'];

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, 'apply.docx');
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

function paragraphs(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'] {
  const found = window.blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 40);
  if (found.length < 2) throw new Error('the composed window holds fewer than two paragraphs of 40 graphemes');
  return found;
}

function blockText(store: EditorialStore, book: Imported, blockId: string): string {
  return store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.blockId === blockId)!.text;
}

function suggest(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, proposedText = PROPOSED, rationale: string | null = null): { markId: string; pinned: string } {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  const made = store.createEditorialMark({
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
  });
  return { markId: made.markId, pinned: made.card!.pinnedText };
}

function binding(store: EditorialStore, book: Imported): Imported & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId };
}

function storeError(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

/** The editor's own typing: one journal edit of one block, against the window as it stands now. */
function typeInto(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, insertText: string): ManuscriptWindowProjection {
  const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  return store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: from, toGrapheme: to, insertText,
  }).window;
}

describe('Proposal decision workspace', () => {
  it('recovers a lost acknowledgement once, adapts settled states both ways and prepares a linked reversal', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const markId = suggest(store, book, block.blockId, 0, 2).markId;
      const clientEffectId = randomUUID();
      const input = { ...book, clientEffectId, recovery: 'settled' as const };
      const empty = store.inspectApplyReceipt(input);
      expect(empty.state).toBe('not-applied'); expect(empty.safeRetry).toBe(true);
      expect(legacyApplyOutcome(empty)).toEqual(store.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, clientEffectId));
      let sends = 0; const states: string[] = [];
      const result = await applyOnce(book, async (id) => { sends++; store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: [markId], clientEffectId: id }); throw new Error('synthetic lost acknowledgement'); },
        async (target) => store.getManuscriptApplyOutcome(target.manuscriptId, target.branchId, target.clientEffectId), () => clientEffectId,
        async (_id, state) => { states.push(state); store.inspectApplyReceipt({ ...input, recovery: state }); });
      expect(sends).toBe(1); expect(states).toEqual(['confirming']); expect(result.acknowledged).toBe(false);
      const receipt = store.inspectApplyReceipt(input);
      expect(receipt.state).toBe('applied'); expect(receipt.safeRetry).toBe(false);
      expect(applyReceiptState(store.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, clientEffectId))).toBe('applied');
      expect(legacyApplyOutcome(receipt)).toEqual(store.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, clientEffectId));
      const preparation = store.prepareReverseApply({ ...book, markId });
      expect(preparation.ready).toBe(true);
      expect(preparation.originalEffectId).toBe(receipt.application!.effectId);
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      const before = database.prepare('SELECT * FROM manuscript_effect_receipts ORDER BY rowid').all();
      const reversed = store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID() });
      expect(reversed.application.reversesEffectId).toBe(receipt.application!.effectId);
      expect(database.prepare('SELECT * FROM manuscript_effect_receipts ORDER BY rowid').all().slice(0, 1)).toEqual(before); database.close();
      store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.inspectApplyReceipt(input).state).toBe('applied');
    } finally { store.close(); }
  });

  it('persists an unprovable recovery, lists it in attention, refuses retry and never adapts it as settled', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const markId = suggest(store, book, block.blockId, 0, 2).markId;
      const input = { ...book, clientEffectId: randomUUID(), recovery: 'settled' as const };
      let sends = 0; const states: string[] = [];
      const result = await applyOnce(book, async () => { sends++; throw new Error('synthetic acknowledgement unavailable'); }, async () => { throw new Error('synthetic authority read unavailable'); }, () => input.clientEffectId,
        async (_id, state) => { states.push(state); store.inspectApplyReceipt({ ...input, recovery: state }); });
      expect(sends).toBe(1); expect(states).toEqual(['confirming', 'unresolved']); expect(result.acknowledged).toBe(false);
      const receipt = store.inspectApplyReceipt(input);
      expect(receipt.state).toBe('unresolved'); expect(receipt.safeRetry).toBe(false); expect(legacyApplyOutcome(receipt)).toBeNull();
      expect(legacyApplyOutcome({ ...receipt, state: 'confirming' })).toBeNull();
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      expect(readApplyOutcomeAttention(db, 50).map((item) => item.state)).toEqual(['apply-outcome-unresolved']); db.close();
      expect(storeError(() => store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: [markId], clientEffectId: input.clientEffectId }))).toBe('APPLY_OUTCOME_UNRESOLVED');
      expect(storeError(() => store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: [markId], clientEffectId: randomUUID() }))).toBe('APPLY_OUTCOME_UNRESOLVED');
      store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.inspectApplyReceipt(input).state).toBe('unresolved');
      // The way out (#902 rev 6): the editor's re-check reads the records by the same identity and dispatches nothing.
      const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
      const counts = (): unknown => { const read = new DatabaseSync(path, { readOnly: true }); try {
        return EFFECT_RELATIONS.map((table) => read.prepare(`SELECT count(*) total FROM ${table}`).get()!.total);
      } finally { read.close(); } };
      const before = counts();
      const journal = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).journalSequence;
      const rechecked = store.inspectApplyReceipt({ ...input, recovery: 'recheck' });
      expect(rechecked.state).toBe('not-applied'); expect(rechecked.safeRetry).toBe(true); expect(rechecked.reason).toContain('重新核对');
      expect(counts()).toEqual(before);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).journalSequence).toBe(journal);
      const log = new DatabaseSync(path);
      expect(log.prepare('SELECT ordinal, state FROM manuscript_outcome_recovery WHERE client_effect_id = ? ORDER BY ordinal').all(input.clientEffectId))
        .toEqual([{ ordinal: 1, state: 'confirming' }, { ordinal: 2, state: 'unresolved' }, { ordinal: 3, state: 'not-applied' }]);
      expect(() => log.exec("UPDATE manuscript_outcome_recovery SET state = 'confirming'")).toThrow(/IMMUTABLE/u);
      expect(() => log.exec('DELETE FROM manuscript_outcome_recovery')).toThrow(/IMMUTABLE/u);
      expect(readApplyOutcomeAttention(log, 50)).toEqual([]); log.close();
      expect(store.inspectApplyReceipt(input).state).toBe('not-applied');
      expect(store.inspectApplyReceipt({ ...input, recovery: 'recheck' }).state).toBe('not-applied');
      expect(counts()).toEqual(before);
      // A proven non-commit admits a new prepared Effect identity with its own approval; the old identity never replays.
      expect(store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: [markId], clientEffectId: randomUUID() }).application.changeCount).toBe(1);
    } finally { store.close(); }
  });

  it('re-checks 结果待确认 to 已应用 only on a verified receipt and keeps an intent without its receipt chain unresolved', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const markId = suggest(store, book, block.blockId, 0, 2).markId;
      const committed = randomUUID();
      store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: [markId], clientEffectId: committed });
      const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
      const db = new DatabaseSync(path);
      // A surface reported 结果待确认 for an identity whose receipt it never read.
      db.prepare("INSERT INTO manuscript_outcome_recovery(client_effect_id, ordinal, manuscript_id, branch_id, state, recorded_at) VALUES (?, 1, ?, ?, 'unresolved', '2026-10-16T00:00:00.000Z')")
        .run(committed, book.manuscriptId, book.branchId);
      const dispatches = (): unknown => db.prepare('SELECT count(*) total FROM manuscript_effect_dispatches').get()!.total;
      const before = dispatches();
      const applied = store.inspectApplyReceipt({ ...book, clientEffectId: committed, recovery: 'recheck' });
      expect(applied.state).toBe('applied'); expect(applied.safeRetry).toBe(false); expect(applied.application?.changeCount).toBe(1);
      expect(db.prepare('SELECT state FROM manuscript_outcome_recovery WHERE client_effect_id = ? ORDER BY ordinal').all(committed).map((row) => row.state)).toEqual(['unresolved', 'applied']);
      expect(readApplyOutcomeAttention(db, 50)).toEqual([]);
      // An intent that no approval, dispatch or receipt follows proves neither outcome: the re-check leaves 结果待确认.
      const orphan = randomUUID();
      const columns = db.prepare("SELECT name FROM pragma_table_info('manuscript_effect_intents') ORDER BY cid").all().map((row) => String(row.name));
      db.prepare(`INSERT INTO manuscript_effect_intents(${columns.join(', ')}) SELECT ${columns.map((name) => name === 'effect_id' ? '?' : name === 'idempotency_key' ? '?' : name).join(', ')} FROM manuscript_effect_intents WHERE idempotency_key = ?`)
        .run(randomUUID(), orphan, committed);
      const unresolved = store.inspectApplyReceipt({ ...book, clientEffectId: orphan, recovery: 'recheck' });
      expect(unresolved.state).toBe('unresolved'); expect(unresolved.safeRetry).toBe(false); expect(legacyApplyOutcome(unresolved)).toBeNull();
      expect(store.inspectApplyReceipt({ ...book, clientEffectId: orphan, recovery: 'recheck' }).state).toBe('unresolved');
      expect(db.prepare('SELECT state FROM manuscript_outcome_recovery WHERE client_effect_id = ? ORDER BY ordinal').all(orphan).map((row) => row.state)).toEqual(['unresolved']);
      expect(readApplyOutcomeAttention(db, 50).map((item) => item.state)).toEqual(['apply-outcome-unresolved']);
      expect(dispatches()).toBe(before);
      expect(storeError(() => store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID() }))).toBe('APPLY_OUTCOME_UNRESOLVED');
      db.close();
    } finally { store.close(); }
  });

  it('migrates a real pre-77 CHECK with every existing value and rowid unchanged', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const markId = suggest(store, book, block.blockId, 0, 2).markId;
      store.recordChangeSuggestionDecision({ ...binding(store, book), markId, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: '合成原因' });
      store.markCleanShutdown(); store.close();
      const db = new DatabaseSync(path); db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
      // Restore the exact predecessor tables before claiming its version.
      restoreTaskIntentDraftPredecessor(db); // Synchronized delta with Issue #423 (slice 7a): a predecessor of revision 80 has no drafts and the narrower Task Intents.
      dropFactualVerificationRelations(db); // Synchronized delta: revision 78's relations cannot stand in a pre-77 fixture.
      for (const table of Object.keys(PROPOSAL_REVIEW_SCHEMA_SQL).reverse()) db.exec(`DROP TABLE ${table}`);
      const columns = db.prepare("SELECT name FROM pragma_table_info('proposal_item_decisions') ORDER BY cid").all().map((row) => String(row.name)).join(', ');
      db.exec('CREATE TEMP TABLE saved_decisions AS SELECT rowid AS old_rowid, * FROM proposal_item_decisions; DROP TABLE proposal_item_decisions');
      db.exec(PROPOSAL_ITEM_DECISIONS_PRE77_SQL);
      db.exec(`INSERT INTO proposal_item_decisions(rowid, ${columns}) SELECT old_rowid, ${columns} FROM saved_decisions ORDER BY old_rowid; DROP TABLE saved_decisions`);
      for (const [name, sql] of Object.entries(EDITORIAL_MARK_TRIGGER_SQL)) if (name.startsWith('proposal_item_decisions_')) db.exec(sql);
      const before = db.prepare('SELECT rowid, * FROM proposal_item_decisions ORDER BY rowid').all();
      execPre74Fixture(db, 'PRAGMA user_version = 76; COMMIT'); db.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const read = new DatabaseSync(path);
      expect(read.prepare('SELECT rowid, * FROM proposal_item_decisions ORDER BY rowid').all()).toEqual(before);
      expect(read.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(read.prepare('PRAGMA user_version').get()!.user_version).toBe(LATEST_SCHEMA_VERSION);
      expect(() => read.exec("UPDATE proposal_item_decisions SET actor = 'editor'")).toThrow(/IMMUTABLE/u);
      const input = { ...book, resultId: null }; const workspace = store.inspectProposalWorkspace(input);
      const drafted = store.saveProposalDecisionDraft({ ...input, markIds: [markId], disposition: 'deferred', atomicGroupId: null, expectedScopeDigest: workspace.scopeDigest });
      expect(store.recordProposalDecision({ ...input, expectedScopeDigest: drafted.scopeDigest, clientDecisionId: randomUUID() }).decision!.items[0]!.disposition).toBe('deferred');
      read.close();
    } finally { store.close(); }
  });
  it('offers the workspace only above 20, keeps drafts reversible, records and supersedes pinned partial decisions', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = paragraphs(window)[0]!;
      const marks = Array.from({ length: 20 }, () => suggest(store, book, block.blockId, 0, 2).markId);
      const input = { ...book, resultId: null };
      expect(store.inspectProposalWorkspace(input).offerWorkspace).toBe(false);
      marks.push(suggest(store, book, block.blockId, 3, 5).markId);
      let work = store.inspectProposalWorkspace(input);
      expect(work.offerWorkspace).toBe(true);
      const sequence = work.journalSequence;
      work = store.saveProposalDecisionDraft({ ...input, markIds: [marks[0]!], atomicGroupId: null, disposition: 'accepted', expectedScopeDigest: work.scopeDigest });
      expect(work.items.find((item) => item.markId === marks[0])?.draft).toBe('accepted');
      work = store.saveProposalDecisionDraft({ ...input, markIds: [marks[0]!], atomicGroupId: null, disposition: null, expectedScopeDigest: work.scopeDigest });
      expect(work.items.find((item) => item.markId === marks[0])?.draft).toBeNull();
      work = store.saveProposalDecisionDraft({ ...input, markIds: [marks[0]!], atomicGroupId: null, disposition: 'deferred', expectedScopeDigest: work.scopeDigest });
      work = store.recordProposalDecision({ ...input, expectedScopeDigest: work.scopeDigest, clientDecisionId: randomUUID() });
      expect(work.decision?.items[0]?.disposition).toBe('deferred');
      expect(work.decision?.unresolved).toHaveLength(21);
      const old = work.decision!.decisionId;
      work = store.saveProposalDecisionDraft({ ...input, markIds: [marks[0]!], atomicGroupId: null, disposition: 'rejected', expectedScopeDigest: work.scopeDigest });
      work = store.recordProposalDecision({ ...input, expectedScopeDigest: work.scopeDigest, clientDecisionId: randomUUID() });
      expect(work.decision?.supersedes).toBe(old);
      expect(work.journalSequence).toBe(sequence);
      const position = { blockId: block.blockId, activeMarkId: marks[0]!, comparison: 'side-by-side' as const, review: 'reviewed' as const, chapterBlockId: null, changeType: null, expanded: true };
      expect(store.inspectProposalWorkspace({ ...input, returnPosition: position }).returnPosition).toEqual(position);
      store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.inspectProposalWorkspace(input).returnPosition).toEqual(position);
      expect(store.inspectProposalWorkspace(input).items.find((item) => item.markId === marks[0])?.draft).toBe('rejected');
      expect(store.inspectProposalWorkspace(input).decision?.supersedes).toBe(old);
    } finally { store.close(); }
  });
});
