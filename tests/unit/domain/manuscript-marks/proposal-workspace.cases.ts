import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { readProposalWorkspace } from '../../../../src/renderer/proposal-workspace.js';
import { graphemesOf } from '../../../../src/shared/mark-anchor.js';
import { MAX_FRAME_BYTES, type ManuscriptWindowProjection } from '../../../../src/shared/protocol.js';
import { manuscriptMarksBook } from '../../../support/domain/manuscript-marks.js';
import { domainOf, refusal as storeError, type Imported } from '../../../support/domain/manuscript-marks-drive.js';

// Proposal decision workspace (Issue #408 and its successors), moved from tests/service/proposal-workspace.test.ts
// (Issue #1536): the same claims and bodies, driven through the real exported operations over a sample1 Book on
// `:memory:`. Restart, lost-acknowledgement recovery, attention and migration cases stay in tests/service.

const PROPOSED = '〔建议〕';
const EDITED = '〔编辑改定〕';
const EFFECT_RELATIONS = ['manuscript_effect_receipts', 'manuscript_effect_dispatches', 'manuscript_effect_approvals', 'manuscript_effect_targets', 'manuscript_effect_intents'];

type Store = ReturnType<typeof domainOf>;
let current: Store | undefined;
afterEach(() => { current?.close(); current = undefined; });

/** The case's Book and its bound operations; the case's `store` is this, not an opened EditorialStore. */
async function open(): Promise<Store> {
  current = domainOf(await manuscriptMarksBook());
  return current;
}

async function importBook(store: Store): Promise<Imported> {
  return store.imported;
}

/**
 * The case's own `:memory:` connection where the on-disk suite opened a second one on the store's file: closing it
 * closes nothing, and a connection opened without foreign-key enforcement turns it off until then.
 */
function fileDatabase(options: { enableForeignKeyConstraints?: boolean } = {}): Pick<DatabaseSync, 'prepare' | 'exec' | 'close'> {
  const db = current!.db;
  if (options.enableForeignKeyConstraints === false) db.exec('PRAGMA foreign_keys = OFF');
  return {
    prepare: (sql: string) => db.prepare(sql),
    exec: (sql: string) => db.exec(sql),
    close: () => { if (options.enableForeignKeyConstraints === false) db.exec('PRAGMA foreign_keys = ON'); },
  };
}

function paragraphs(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'] {
  const found = window.blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 40);
  if (found.length < 2) throw new Error('the sample1 window holds fewer than two paragraphs of 40 graphemes');
  return found;
}

function blockText(store: Store, book: Imported, blockId: string): string {
  return store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.blockId === blockId)!.text;
}

function suggest(store: Store, book: Imported, blockId: string, from: number, to: number, proposedText = PROPOSED, rationale: string | null = null): { markId: string; pinned: string } {
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

function binding(store: Store, book: Imported): Imported & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId };
}

/** The editor's own typing: one journal edit of one block, against the window as it stands now. */
function typeInto(store: Store, book: Imported, blockId: string, from: number, to: number, insertText: string): ManuscriptWindowProjection {
  const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  return store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: from, toGrapheme: to, insertText,
  }).window;
}

describe('Proposal decision workspace', () => {
  it('pages 501 navigator records with long group reasons below the response bound and reconstructs one scope', async () => {
    const store = await open();
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
    const store = await open();
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const good = suggest(store, book, block.blockId, 0, 2).markId;
      const conflict = suggest(store, book, block.blockId, 5, 8).markId;
      typeInto(store, book, block.blockId, 6, 7, '改');
      const absent = randomUUID();
      const old = suggest(store, book, block.blockId, 12, 14).markId;
      const detached = suggest(store, book, block.blockId, 16, 18).markId;
      const db = fileDatabase();
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
    const store = await open();
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

  it('reads, pages, filters, previews and compares without any decision, draft, Effect or manuscript change', async () => {
    const store = await open();
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const marks = Array.from({ length: 21 }, (_, index) => suggest(store, book, block.blockId, index % 2 === 0 ? 0 : 3, index % 2 === 0 ? 2 : 5).markId);
      const ledgers = ['proposal_decisions', 'proposal_item_decisions', 'proposal_decision_drafts', ...EFFECT_RELATIONS];
      const counts = (): unknown => { const read = fileDatabase(); try {
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
      const log = fileDatabase();
      expect(log.prepare('SELECT ordinal FROM proposal_review_positions ORDER BY ordinal').all().map((row) => row.ordinal)).toEqual([1, 2]);
      log.close();
    } finally { store.close(); }
  });

  it('采纳全部无冲突项 drafts only exact conflict-free items of the visible filter and names every exclusion first', async () => {
    const store = await open();
    try {
      const book = await importBook(store);
      const [block, other] = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null));
      const good = suggest(store, book, block!.blockId, 0, 2).markId;
      const conflict = suggest(store, book, block!.blockId, 5, 8).markId;
      typeInto(store, book, block!.blockId, 6, 7, '改');
      const detached = suggest(store, book, block!.blockId, 12, 14).markId;
      const unloaded = suggest(store, book, block!.blockId, 16, 18).markId;
      const superseded = suggest(store, book, block!.blockId, 20, 22).markId;
      const guessed = suggest(store, book, block!.blockId, 32, 34, PROPOSED, '【未联网核查】【未联网核查】【锚点不唯一】合成建议。').markId;
      const groupId = randomUUID();
      const group = [24, 28].map((from) => store.createProducedEditorialMark({ ...book, blockId: other!.blockId, fromGrapheme: from, toGrapheme: from + 2,
        pinnedText: graphemesOf(other!.text).slice(from, from + 2).join(''), kind: 'change-suggestion', body: '', proposedText: PROPOSED, rationale: null,
        atomicGroupId: groupId, atomicReason: '两处称谓必须同时一致。', source: { kind: 'ai7', origin: 'task', taskId: null, label: '合成测试' }, basis: [] }));
      // Synthetic states only reachable through other owners (reimport, conflict resolution): written directly, references unchecked.
      const db = fileDatabase({ enableForeignKeyConstraints: false });
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
        [conflict, 'conflict'], [detached, 'unclassified-stale'], [unloaded, 'unloaded'], [group[0]!, 'atomic-group'], [group[1]!, 'atomic-group'], [guessed, 'guessed-anchor'],
      ]));
      expect(preview.workspace.items.find((item) => item.markId === guessed)!.conflict).toBe(false);
      expect([...preview.included, ...preview.excluded.map((item) => item.markId)]).not.toContain(superseded);
      expect(preview.workspace.items.every((item) => item.draft === null)).toBe(true);
      const saved = store.batchProposalDecisionDraft({ ...request, confirmDigest: preview.scopeDigest });
      expect(saved.workspace.items.filter((item) => item.draft !== null).map((item) => [item.markId, item.draft])).toEqual([[good, 'accepted']]);
    } finally { store.close(); }
  });
});
