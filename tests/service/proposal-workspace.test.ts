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

function suggest(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, proposedText = PROPOSED): { markId: string; pinned: string } {
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
    rationale: null,
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
  it('pages 501 navigator records with long group reasons below the response bound and reconstructs one scope', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const groupId = randomUUID();
      store.createProducedEditorialMarks(Array.from({ length: 501 }, () => ({ ...book, blockId: block.blockId, fromGrapheme: 0, toGrapheme: 2,
        pinnedText: graphemesOf(block.text).slice(0, 2).join(''), kind: 'change-suggestion' as const, body: '', proposedText: PROPOSED, rationale: null,
        atomicGroupId: groupId, atomicReason: '合成依赖'.repeat(400), source: { kind: 'ai7' as const, origin: 'task' as const, taskId: null, label: '合成测试' }, basis: [] })), (ids) => ids);
      const input = { ...book, resultId: null };
      let pages = 0;
      const read = await readProposalWorkspace({ inspectProposalWorkspace: async (request) => {
        const page = store.inspectProposalWorkspace(request); pages++;
        expect(page.items.length).toBeLessThanOrEqual(50);
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(MAX_FRAME_BYTES - 1024);
        return page;
      } }, input);
      expect(pages).toBe(11); expect(read.items).toHaveLength(501); expect(new Set(read.items.map((item) => item.markId)).size).toBe(501);
      let offset: number | null = 0; let excluded = 0;
      while (offset !== null) {
        const page = store.batchProposalDecisionDraft({ ...input, offset, scope: 'filter', markIds: [], chapterBlockId: null, changeType: null, review: 'all', disposition: 'accepted', confirmDigest: null });
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(MAX_FRAME_BYTES - 1024);
        expect(page.scopeDigest).toMatch(/^[a-f0-9]{64}$/u); excluded += page.excluded.length; offset = page.nextOffset;
      }
      expect(excluded).toBe(501);
    } finally { store.close(); }
  });
  it('freezes the preview, excludes every unsafe scope, and refuses a stale confirmation', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const good = suggest(store, book, block.blockId, 0, 2).markId;
      const conflict = suggest(store, book, block.blockId, 5, 8).markId;
      typeInto(store, book, block.blockId, 6, 7, '改');
      const absent = randomUUID();
      const old = suggest(store, book, block.blockId, 12, 14).markId;
      const detached = suggest(store, book, block.blockId, 16, 18).markId;
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      db.prepare("UPDATE editorial_marks SET status = 'converted' WHERE mark_id = ?").run(old);
      // A reimport that could not map a mark detaches it: its stale base is not yet classified as safe or conflicting.
      db.prepare("UPDATE editorial_marks SET anchor_state = 'detached' WHERE mark_id = ?").run(detached);
      const request = { ...book, resultId: null, scope: 'selection' as const, markIds: [good, conflict, absent, old, detached], chapterBlockId: null, changeType: null, review: 'all' as const, disposition: 'accepted' as const, confirmDigest: null };
      const preview = store.batchProposalDecisionDraft(request);
      expect(preview.included).toEqual([good]);
      // 原文已变 is a classified Three-way Proposal Conflict (ADR 0085) even though its base is stale.
      expect(preview.excluded).toEqual(expect.arrayContaining([{ markId: conflict, reason: 'conflict' }, { markId: detached, reason: 'unclassified-stale' }, { markId: absent, reason: 'unloaded' }, { markId: old, reason: 'other-version' }]));
      expect(preview.excluded).toHaveLength(4);
      expect(preview.saved).toBe(false);
      expect(preview.workspace.items.every((item) => item.draft === null)).toBe(true);
      const saved = store.batchProposalDecisionDraft({ ...request, confirmDigest: preview.scopeDigest });
      expect(saved.workspace.items.find((item) => item.markId === good)?.draft).toBe('accepted');
      expect(storeError(() => store.batchProposalDecisionDraft({ ...request, confirmDigest: preview.scopeDigest }))).toBe('PROPOSAL_SCOPE_MOVED');
      // Same-revision drift has a conflict exclusion even without a stale revision pin.
      db.prepare('UPDATE editorial_marks SET pinned_journal_sequence = ? WHERE mark_id = ?').run(saved.workspace.journalSequence, conflict);
      expect(store.batchProposalDecisionDraft(request).excluded).toContainEqual({ markId: conflict, reason: 'conflict' });
      db.close();
    } finally { store.close(); }
  });

  it('keeps an atomic producer group indivisible through drafts, decisions and Apply', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const groupId = randomUUID();
      const produce = (from: number) => store.createProducedEditorialMark({ ...book, blockId: block.blockId, fromGrapheme: from, toGrapheme: from + 2,
        pinnedText: graphemesOf(block.text).slice(from, from + 2).join(''), kind: 'change-suggestion', body: '', proposedText: PROPOSED, rationale: null,
        atomicGroupId: groupId, atomicReason: '两个称谓必须同时一致；只改一个会留下内部矛盾。', source: { kind: 'ai7', origin: 'task', taskId: null, label: '合成测试' }, basis: [] });
      const ids = [produce(0), produce(5)];
      const input = { ...book, resultId: null };
      let workspace = store.inspectProposalWorkspace(input);
      expect(workspace.items.every((item) => item.atomicGroupId === groupId && item.atomicReason !== null)).toBe(true);
      const draft = { ...input, markIds: ids, atomicGroupId: groupId, disposition: 'accepted' as const, expectedScopeDigest: workspace.scopeDigest };
      expect(storeError(() => store.saveProposalDecisionDraft({ ...draft, markIds: ids.slice(0, 1) }))).toBe('PROPOSAL_ATOMIC_SCOPE');
      expect(storeError(() => store.saveProposalDecisionDraft({ ...draft, atomicGroupId: null }))).toBe('PROPOSAL_ATOMIC_SCOPE');
      expect(storeError(() => store.recordChangeSuggestionDecision({ ...binding(store, book), markId: ids[0]!, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: null }))).toBe('PROPOSAL_ATOMIC_SCOPE');
      expect(store.batchProposalDecisionDraft({ ...input, scope: 'filter', markIds: [], chapterBlockId: null, changeType: null, review: 'all', disposition: 'accepted', confirmDigest: null }).excluded.map((item) => item.reason)).toEqual(['atomic-group', 'atomic-group']);
      workspace = store.saveProposalDecisionDraft(draft);
      expect(storeError(() => produce(10))).toBe('PROPOSAL_ATOMIC_SCOPE');
      workspace = store.recordProposalDecision({ ...input, expectedScopeDigest: workspace.scopeDigest, clientDecisionId: randomUUID() });
      expect(workspace.decision?.items.map((item) => item.disposition)).toEqual(['accepted', 'accepted']);
      expect(storeError(() => store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: ids.slice(0, 1), clientEffectId: randomUUID() }))).toBe('PROPOSAL_ATOMIC_SCOPE');
      expect(store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: ids, clientEffectId: randomUUID() }).application.changeCount).toBe(2);
      expect(store.prepareReverseApply({ ...book, markId: ids[0]! }).reason).toContain('2 项');
      expect(store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId: ids[0]!, clientEffectId: randomUUID() }).application.changeCount).toBe(2);
      expect(ids.every((markId) => store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).status === 'open')).toBe(true);
    } finally { store.close(); }
  });

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
      db.exec('PRAGMA user_version = 76; COMMIT'); db.close();
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

  it('reads, pages, filters, previews and compares without any decision, draft, Effect or manuscript change', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const marks = Array.from({ length: 21 }, (_, index) => suggest(store, book, block.blockId, index % 2 === 0 ? 0 : 3, index % 2 === 0 ? 2 : 5).markId);
      const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
      const ledgers = ['proposal_decisions', 'proposal_item_decisions', 'proposal_decision_drafts', ...EFFECT_RELATIONS];
      const counts = (): unknown => { const read = new DatabaseSync(path, { readOnly: true }); try {
        return ledgers.map((table) => read.prepare(`SELECT count(*) total FROM ${table}`).get()!.total);
      } finally { read.close(); } };
      const before = counts();
      const journal = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).journalSequence;
      const input = { ...book, resultId: null };
      const read = await readProposalWorkspace({ inspectProposalWorkspace: async (request) => store.inspectProposalWorkspace(request) }, input);
      expect(read.items).toHaveLength(21); expect(read.offerWorkspace).toBe(true);
      const position = { blockId: block.blockId, activeMarkId: marks[3]!, comparison: 'inline' as const, review: 'unreviewed' as const, chapterBlockId: null, changeType: 'replace' as const, expanded: false };
      store.inspectProposalWorkspace({ ...input, returnPosition: position });
      store.inspectProposalWorkspace({ ...input, returnPosition: position });
      store.inspectProposalWorkspace({ ...input, returnPosition: { ...position, comparison: 'side-by-side' } });
      for (const scope of ['selection', 'chapter', 'change-type', 'filter'] as const) {
        for (const review of ['all', 'unreviewed', 'reviewed', 'stale', 'conflicting'] as const) {
          const preview = store.batchProposalDecisionDraft({ ...input, scope, markIds: marks.slice(0, 4), chapterBlockId: read.items[0]!.chapterBlockId, changeType: 'replace', review, disposition: 'accepted', confirmDigest: null });
          expect(preview.saved).toBe(false);
        }
      }
      for (const markId of marks.slice(0, 3)) store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: block.blockId });
      expect(counts()).toEqual(before);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).journalSequence).toBe(journal);
      expect(store.inspectProposalWorkspace(input).items.every((item) => item.draft === null && item.decisionId === null)).toBe(true);
      // Return Position is append-only and an unchanged position is not appended again.
      const log = new DatabaseSync(path, { readOnly: true });
      expect(log.prepare('SELECT ordinal FROM proposal_review_positions ORDER BY ordinal').all().map((row) => row.ordinal)).toEqual([1, 2]);
      log.close();
    } finally { store.close(); }
  });

  it('采纳全部无冲突项 drafts only exact conflict-free items of the visible filter and names every exclusion first', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const [block, other] = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null));
      const good = suggest(store, book, block!.blockId, 0, 2).markId;
      const conflict = suggest(store, book, block!.blockId, 5, 8).markId;
      typeInto(store, book, block!.blockId, 6, 7, '改');
      const detached = suggest(store, book, block!.blockId, 12, 14).markId;
      const unloaded = suggest(store, book, block!.blockId, 16, 18).markId;
      const superseded = suggest(store, book, block!.blockId, 20, 22).markId;
      const groupId = randomUUID();
      const group = [24, 28].map((from) => store.createProducedEditorialMark({ ...book, blockId: other!.blockId, fromGrapheme: from, toGrapheme: from + 2,
        pinnedText: graphemesOf(other!.text).slice(from, from + 2).join(''), kind: 'change-suggestion', body: '', proposedText: PROPOSED, rationale: null,
        atomicGroupId: groupId, atomicReason: '两处称谓必须同时一致。', source: { kind: 'ai7', origin: 'task', taskId: null, label: '合成测试' }, basis: [] }));
      // Synthetic states only reachable through other owners (reimport, conflict resolution): written directly, references unchecked.
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { enableForeignKeyConstraints: false });
      db.prepare("UPDATE editorial_marks SET anchor_state = 'detached' WHERE mark_id = ?").run(detached);
      // Outside every loaded window: its paragraph is not in the working state the comparison would read.
      db.prepare("UPDATE editorial_marks SET block_id = ? WHERE mark_id = ?").run(`blk_${'f'.repeat(24)}`, unloaded);
      // A different Proposal version: superseded by a resolution's new version, so it is not in the result at all.
      db.prepare("UPDATE editorial_marks SET status = 'converted' WHERE mark_id = ?").run(superseded);
      db.close();
      const request = { ...book, resultId: null, scope: 'filter' as const, markIds: [], chapterBlockId: null, changeType: null, review: 'all' as const, disposition: 'accepted' as const, confirmDigest: null };
      const preview = store.batchProposalDecisionDraft(request);
      expect(preview.included).toEqual([good]);
      expect(new Map(preview.excluded.map((item) => [item.markId, item.reason]))).toEqual(new Map([
        [conflict, 'conflict'], [detached, 'unclassified-stale'], [unloaded, 'unloaded'], [group[0]!, 'atomic-group'], [group[1]!, 'atomic-group'],
      ]));
      expect([...preview.included, ...preview.excluded.map((item) => item.markId)]).not.toContain(superseded);
      expect(preview.workspace.items.every((item) => item.draft === null)).toBe(true);
      const saved = store.batchProposalDecisionDraft({ ...request, confirmDigest: preview.scopeDigest });
      expect(saved.workspace.items.filter((item) => item.draft !== null).map((item) => [item.markId, item.draft])).toEqual([[good, 'accepted']]);
    } finally { store.close(); }
  });
});
