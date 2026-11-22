import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { KEEP_CURRENT_REASON, PROPOSAL_CONFLICT_SCHEMA_SQL } from '../../../../src/service/proposal-conflicts.js';
import { conflictUnits, initialResolutions, type ConflictUnitResolution } from '../../../../src/shared/conflict-units.js';
import { graphemesOf } from '../../../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection, ProposalConflictProjection } from '../../../../src/shared/protocol.js';
import { manuscriptMarksBook } from '../../../support/domain/manuscript-marks.js';
import { domainOf, refusal, type Imported } from '../../../support/domain/manuscript-marks-drive.js';

// 稿件冲突 of a single 修改建议 (Issue #57, plan slice S22; ADR 0085), moved from tests/service/proposal-conflicts.test.ts
// (Issue #1536): the same claims and bodies, driven through the real exported operations over a sample1 Book on
// `:memory:`. Restart, migration and ledger-immutability cases stay in tests/service.

const PROPOSED = '〔建议〕';
const TYPED = '〔改〕';
const EDITED = '〔合并〕';
const LEDGER = Object.keys(PROPOSAL_CONFLICT_SCHEMA_SQL);

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

function windowOf(store: Store, book: Imported): ManuscriptWindowProjection {
  return store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
}

/** Two paragraphs long enough to hold a suggestion with room on both sides of it. */
function paragraphs(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'] {
  const found = window.blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 60);
  if (found.length < 3) throw new Error('the sample1 window holds fewer than three paragraphs of 60 graphemes');
  return found;
}

function blockText(store: Store, book: Imported, blockId: string): string {
  return windowOf(store, book).blocks.find((block) => block.blockId === blockId)!.text;
}

function binding(store: Store, book: Imported): Imported & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: windowOf(store, book).blocks[0]!.blockId };
}

function suggest(store: Store, book: Imported, blockId: string, from: number, to: number, proposedText = PROPOSED, rationale: string | null = null): string {
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
function typeInto(store: Store, book: Imported, blockId: string, from: number, to: number, insertText: string): void {
  const now = windowOf(store, book);
  store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: from, toGrapheme: to, insertText,
  });
}

/** The case's own `:memory:` database, where the on-disk suite opened the store's file. */
function withDatabase<T>(_readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  return operation(current!.db);
}

function ledgerCounts(): Record<string, number> {
  return withDatabase(true, (database) => Object.fromEntries(LEDGER.map((table) => [
    table,
    (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total,
  ])));
}

/** Every relation with its exact `CREATE` text and a digest over its whole content (row count and hex digest). */
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

function anchorConflict(store: Store, book: Imported, markId: string): string | null | undefined {
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
async function driftedSuggestion(store: Store): Promise<Suggested & { current: string }> {
  const book = await importBook(store);
  const block = paragraphs(windowOf(store, book))[0]!;
  const original = block.text;
  const markId = suggest(store, book, block.blockId, 20, 26, PROPOSED, '理由：语气更准');
  const pinned = graphemesOf(original).slice(20, 26).join('');
  typeInto(store, book, block.blockId, 23, 23, TYPED);
  return { book, blockId: block.blockId, markId, pinned, original, current: graphemesOf(blockText(store, book, block.blockId)).slice(20, 26 + graphemesOf(TYPED).length).join('') };
}

describe('稿件冲突 of a single 修改建议 (ADR 0085)', () => {
  it('reads a suggestion whose own words were edited as one conflict with its three exact texts, and changes nothing', async () => {
    const store = await open();
    try {
      const { book, blockId, markId, pinned, current } = await driftedSuggestion(store);
      const textBefore = blockText(store, book, blockId);
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card.anchorState).toBe('drifted');
      expect(card.changedElsewhere).toBe(false);
      expect(card.conflict).toEqual({ kind: 'suggestion', state: 'unresolved', deferredAt: null, outcome: null, newMarkId: null, resolvedAt: null });
      expect(anchorConflict(store, book, markId)).toBe('unresolved');

      const conflict = store.inspectProposalConflict({ ...book, markId });
      expect(conflict).toMatchObject({
        markId, conflictKind: 'suggestion', deferral: null, blockId, fromGrapheme: 20, toGrapheme: 26 + graphemesOf(TYPED).length,
        base: pinned, current, proposed: PROPOSED, draft: null, draftOnEarlierBasis: false,
        newVersion: { available: true, blocker: null },
        suggestion: { rationale: '理由：语气更准', source: { kind: 'editor', origin: null, label: null, taskId: null } },
      });
      expect(conflict.basisDigest).toMatch(/^[0-9a-f]{64}$/);
      // The one conflict unit, exactly the three texts; the context is the current paragraph's, at most 30 graphemes a side.
      expect(conflict.units).toEqual(conflictUnits(pinned, current, PROPOSED));
      expect(conflict.units).toEqual([{ kind: 'conflict', base: pinned, current, proposed: PROPOSED }]);
      const parts = graphemesOf(textBefore);
      expect(conflict.context.before).toBe(parts.slice(0, 20).join(''));
      expect(conflict.context.after).toBe(parts.slice(conflict.toGrapheme, conflict.toGrapheme + 30).join(''));
      expect(conflict.navigator).toEqual({ entries: [{ markId, blockId, conflictKind: 'suggestion', deferred: false }], truncated: false });
      // Reading it again reads the same basis; nothing was written anywhere.
      expect(store.inspectProposalConflict({ ...book, markId }).basisDigest).toBe(conflict.basisDigest);
      expect(blockText(store, book, blockId)).toBe(textBefore);
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 0, proposal_conflict_deferrals: 0, proposal_conflict_outcomes: 0 });
      // The Apply stays refused: the conflict blocks it.
      expect(refusal(() => store.applyChangeSuggestion({
        ...binding(store, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      }))).toBe('APPLY_TARGET_DRIFTED');
    } finally {
      store.close();
    }
  });

  it('says a change elsewhere in the paragraph did not touch the words, keeps 接受并应用 available, and applies only the range', async () => {
    const store = await open();
    try {
      const book = await importBook(store);
      const block = paragraphs(windowOf(store, book))[1]!;
      const markId = suggest(store, book, block.blockId, 30, 36);
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).changedElsewhere).toBe(false);
      typeInto(store, book, block.blockId, 5, 5, TYPED);
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card).toMatchObject({ anchorState: 'exact', changedElsewhere: true, conflict: null, fromGrapheme: 30 + graphemesOf(TYPED).length });
      expect(anchorConflict(store, book, markId)).toBeNull();
      expect(refusal(() => store.inspectProposalConflict({ ...book, markId }))).toBe('PROPOSAL_CONFLICT_NONE');
      // Undoing the edit elsewhere puts the paragraph back as the suggestion was made in.
      const undone = store.undoManuscript({ manuscriptId: book.manuscriptId, branchId: book.branchId, expectedWorkingDigest: windowOf(store, book).workingDigest });
      expect(undone).toBeDefined();
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).changedElsewhere).toBe(false);
      typeInto(store, book, block.blockId, 5, 5, TYPED);
      const before = graphemesOf(blockText(store, book, block.blockId));
      const applied = store.applyChangeSuggestion({
        ...binding(store, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      const after = graphemesOf(blockText(store, book, block.blockId));
      const at = 30 + graphemesOf(TYPED).length;
      expect(after.slice(0, at)).toEqual(before.slice(0, at));
      expect(after.slice(at, at + graphemesOf(PROPOSED).length).join('')).toBe(PROPOSED);
      expect(after.slice(at + graphemesOf(PROPOSED).length)).toEqual(before.slice(at + 6));
      expect(applied.card?.changedElsewhere).toBe(false);
    } finally {
      store.close();
    }
  });

  it('saves a complete draft as the next version of the 修改建议 — not accepted, not applied — which 接受并应用 then writes', async () => {
    const store = await open();
    try {
      const { book, blockId, markId, current } = await driftedSuggestion(store);
      const conflict = store.inspectProposalConflict({ ...book, markId });
      const textBefore = blockText(store, book, blockId);
      // Nothing is saved yet; a draft that resolves nothing, or resolves to the current words, is refused.
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: 1 })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_INVALID');
      store.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: initialResolutions(conflict.units) });
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: 1 })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_INCOMPLETE');
      store.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'current', text: null }) });
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: 2 })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_UNCHANGED');
      const draft = store.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'both-current-first', text: null }) });
      expect(draft.draft.text).toBe(current + PROPOSED);

      const resolved = store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: draft.draft.ordinal });
      expect(resolved).toMatchObject({ markId, outcome: 'new-version', blockId });
      const newMarkId = resolved.newMarkId!;
      expect(newMarkId).not.toBe(markId);
      // The old suggestion is retired; its conflict is resolved and gone from the navigator.
      expect(refusal(() => store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId))).toBe('MARK_NOT_FOUND');
      expect(refusal(() => store.inspectProposalConflict({ ...book, markId }))).toBe('PROPOSAL_CONFLICT_RESOLVED');
      expect(windowOf(store, book).marks.some((mark) => mark.markId === markId)).toBe(false);
      // The new one stands exactly on the current words, proposes the draft, and is the editor's, undecided.
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, newMarkId);
      expect(card).toMatchObject({
        kind: 'change-suggestion', status: 'open', anchorState: 'exact', blockId, fromGrapheme: conflict.fromGrapheme, toGrapheme: conflict.toGrapheme,
        pinnedText: current, changedElsewhere: false, conflict: null,
        source: { kind: 'editor', origin: null, label: null, taskId: null },
        convertedFrom: { markId, kind: 'change-suggestion', sourceKind: 'editor' },
        resolvedFrom: { markId, conflictKind: 'suggestion' },
        suggestion: { currentText: current, proposedText: current + PROPOSED, rationale: '理由：语气更准', decision: null, application: null },
      });
      expect(anchorConflict(store, book, newMarkId)).toBeNull();
      expect(blockText(store, book, blockId)).toBe(textBefore);
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 3, proposal_conflict_deferrals: 0, proposal_conflict_outcomes: 1 });
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'keep-current', draftOrdinal: null })))
        .toBe('PROPOSAL_CONFLICT_RESOLVED');

      // 接受并应用 on the new version writes it all or none, over exactly its range.
      const before = graphemesOf(blockText(store, book, blockId));
      store.applyChangeSuggestion({
        ...binding(store, book), markId: newMarkId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      const after = graphemesOf(blockText(store, book, blockId));
      expect(after.slice(0, conflict.fromGrapheme)).toEqual(before.slice(0, conflict.fromGrapheme));
      expect(after.slice(conflict.fromGrapheme, conflict.fromGrapheme + graphemesOf(current + PROPOSED).length).join('')).toBe(current + PROPOSED);
      expect(after.slice(conflict.fromGrapheme + graphemesOf(current + PROPOSED).length)).toEqual(before.slice(conflict.toGrapheme));
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, newMarkId).status).toBe('applied');
    } finally {
      store.close();
    }
  });

  it('keeps the current manuscript: the rejection with its reason and the outcome in one transaction, final, and nothing written', async () => {
    const store = await open();
    try {
      const { book, blockId, markId } = await driftedSuggestion(store);
      const conflict = store.inspectProposalConflict({ ...book, markId });
      const textBefore = blockText(store, book, blockId);
      const kept = store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'keep-current', draftOrdinal: null });
      expect(kept).toMatchObject({ markId, outcome: 'keep-current', newMarkId: null, blockId });
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card.status).toBe('resolved');
      expect(card.suggestion?.decision).toMatchObject({ disposition: 'rejected', reason: KEEP_CURRENT_REASON, reasonSource: 'suggested' });
      expect(card.conflict).toMatchObject({ kind: 'suggestion', state: 'resolved', outcome: 'keep-current', newMarkId: null });
      expect(anchorConflict(store, book, markId)).toBe('resolved');
      expect(blockText(store, book, blockId)).toBe(textBefore);
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 0, proposal_conflict_deferrals: 0, proposal_conflict_outcomes: 1 });
      // The resolution is final: the rejection it recorded is not withdrawn, and the conflict is not resolved twice.
      expect(refusal(() => store.recordChangeSuggestionDecision({
        ...binding(store, book), markId, clientDecisionId: randomUUID(), disposition: 'withdrawn', editedText: null, reason: null,
      }))).toBe('MARK_DECISION_INVALID');
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'defer', draftOrdinal: null })))
        .toBe('PROPOSAL_CONFLICT_RESOLVED');
    } finally {
      store.close();
    }
  });

  it('compares an accepted edit not yet applied by the words it settled on, and keeping the current manuscript supersedes that decision', async () => {
    const store = await open();
    try {
      const book = await importBook(store);
      const block = paragraphs(windowOf(store, book))[2]!;
      const markId = suggest(store, book, block.blockId, 10, 16);
      store.recordChangeSuggestionDecision({
        ...binding(store, book), markId, clientDecisionId: randomUUID(), disposition: 'accepted-with-edit', editedText: EDITED, reason: null,
      });
      typeInto(store, book, block.blockId, 12, 12, TYPED);
      const conflict = store.inspectProposalConflict({ ...book, markId });
      expect(conflict).toMatchObject({ conflictKind: 'suggestion', proposed: EDITED });
      store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'keep-current', draftOrdinal: null });
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card.suggestion?.decision).toMatchObject({ disposition: 'rejected', reason: KEEP_CURRENT_REASON, editedText: null });
      const decisions = withDatabase(true, (database) => database.prepare(
        `SELECT d.ordinal, d.disposition, d.supersedes_decision_id IS NOT NULL superseding FROM proposal_item_decisions d
         JOIN proposal_change_items i ON i.item_id = d.item_id WHERE i.mark_id = ? ORDER BY d.ordinal`,
      ).all(markId));
      expect(decisions).toEqual([
        { ordinal: 1, disposition: 'accepted-with-edit', superseding: 0 },
        { ordinal: 2, disposition: 'rejected', superseding: 1 },
      ]);
    } finally {
      store.close();
    }
  });

  it('offers no new version where the words were deleted, and keeps the other two paths', async () => {
    const store = await open();
    try {
      const book = await importBook(store);
      const block = paragraphs(windowOf(store, book))[0]!;
      const markId = suggest(store, book, block.blockId, 20, 26);
      typeInto(store, book, block.blockId, 20, 26, '');
      const conflict = store.inspectProposalConflict({ ...book, markId });
      expect(conflict).toMatchObject({ current: '', fromGrapheme: 20, toGrapheme: 20, newVersion: { available: false, blocker: 'target-deleted' } });
      expect(conflict.units).toEqual([{ kind: 'conflict', base: conflict.base, current: '', proposed: PROPOSED }]);
      store.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'proposed', text: null }) });
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: 1 })))
        .toBe('PROPOSAL_CONFLICT_TARGET_DELETED');
      store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'keep-current', draftOrdinal: null });
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).conflict?.outcome).toBe('keep-current');
    } finally {
      store.close();
    }
  });

  it('offers no Correction Proposal where an edit took the point an applied deletion left, and keeps 保留当前稿件 (Issue #533)', async () => {
    const store = await open();
    try {
      const book = await importBook(store);
      const block = paragraphs(windowOf(store, book))[0]!;
      const deleted = graphemesOf(block.text).slice(20, 26).join('');
      const markId = suggest(store, book, block.blockId, 20, 26, '');
      store.applyChangeSuggestion({
        ...binding(store, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      // The editor deletes a grapheme on each side of the point the deletion left. Its reversal has nothing where it stood
      // to write the words back over — unlike a pending insertion, whose point has no words of its own — so the words'
      // place is gone, and only 保留当前稿件 or 暂不处理 remain.
      typeInto(store, book, block.blockId, 19, 21, '');
      const conflict = store.inspectProposalConflict({ ...book, markId });
      expect(conflict).toMatchObject({
        conflictKind: 'reversal', base: '', current: '', proposed: deleted, fromGrapheme: 19, toGrapheme: 19,
        newVersion: { available: false, blocker: 'target-deleted' },
      });
      store.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'proposed', text: null }) });
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: 1 })))
        .toBe('PROPOSAL_CONFLICT_TARGET_DELETED');
      store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'keep-current', draftOrdinal: null });
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId))
        .toMatchObject({ status: 'applied', conflict: { kind: 'reversal', state: 'resolved', outcome: 'keep-current' } });
    } finally {
      store.close();
    }
  });

  it('routes reversing an Apply whose words were edited through the conflict, where a new version is a Correction Proposal', async () => {
    const store = await open();
    try {
      const book = await importBook(store);
      const [first, second] = paragraphs(windowOf(store, book));
      const original = graphemesOf(first!.text).slice(20, 26).join('');
      const markId = suggest(store, book, first!.blockId, 20, 26);
      store.applyChangeSuggestion({
        ...binding(store, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      // The editor edits the applied words: reversing now meets later work.
      typeInto(store, book, first!.blockId, 21, 21, TYPED);
      expect(refusal(() => store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID() }))).toBe('APPLY_TARGET_DRIFTED');
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card).toMatchObject({ status: 'applied', anchorState: 'drifted', conflict: { kind: 'reversal', state: 'unresolved' } });
      const current = graphemesOf(blockText(store, book, first!.blockId)).slice(20, 20 + graphemesOf(PROPOSED + TYPED).length).join('');
      const conflict = store.inspectProposalConflict({ ...book, markId });
      expect(conflict).toMatchObject({ conflictKind: 'reversal', base: PROPOSED, current, proposed: original });

      const draft = store.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'proposed', text: null }) });
      const textBefore = blockText(store, book, first!.blockId);
      const resolved = store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: draft.draft.ordinal });
      const correction = store.getEditorialMarkCard(book.manuscriptId, book.branchId, resolved.newMarkId!);
      expect(correction).toMatchObject({
        status: 'open', anchorState: 'exact', pinnedText: current, convertedFrom: null, resolvedFrom: { markId, conflictKind: 'reversal' },
        suggestion: { currentText: current, proposedText: original, decision: null },
      });
      // The Apply stays in force, its conflict resolved by the Correction Proposal; nothing was written.
      const applied = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(applied).toMatchObject({ status: 'applied', conflict: { kind: 'reversal', state: 'resolved', outcome: 'new-version', newMarkId: resolved.newMarkId } });
      expect(anchorConflict(store, book, markId)).toBe('resolved');
      expect(blockText(store, book, first!.blockId)).toBe(textBefore);
      store.applyChangeSuggestion({
        ...binding(store, book), markId: resolved.newMarkId!, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      expect(graphemesOf(blockText(store, book, first!.blockId)).slice(20, 20 + graphemesOf(original).length).join('')).toBe(original);

      // Keeping the current manuscript over a reversal conflict records the outcome only: the Apply stays.
      const otherId = suggest(store, book, second!.blockId, 20, 26);
      store.applyChangeSuggestion({
        ...binding(store, book), markId: otherId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      typeInto(store, book, second!.blockId, 21, 21, TYPED);
      const other = store.inspectProposalConflict({ ...book, markId: otherId });
      store.resolveProposalConflict({ ...book, markId: otherId, basisDigest: other.basisDigest, outcome: 'keep-current', draftOrdinal: null });
      const kept = store.getEditorialMarkCard(book.manuscriptId, book.branchId, otherId);
      expect(kept).toMatchObject({ status: 'applied', conflict: { kind: 'reversal', state: 'resolved', outcome: 'keep-current' } });
      expect(kept.suggestion?.decision?.disposition).toBe('accepted');
      const outcome = withDatabase(true, (database) => database.prepare('SELECT decision_id, new_mark_id, draft_id FROM proposal_conflict_outcomes WHERE mark_id = ?').get(otherId));
      expect(outcome).toEqual({ decision_id: null, new_mark_id: null, draft_id: null });
    } finally {
      store.close();
    }
  });

  it('lists the manuscript\'s unresolved conflicts in reading order and refuses what is none of them', async () => {
    const store = await open();
    try {
      const book = await importBook(store);
      const [first, second] = paragraphs(windowOf(store, book));
      const later = suggest(store, book, second!.blockId, 10, 16);
      const earlier = suggest(store, book, first!.blockId, 10, 16);
      const exact = suggest(store, book, first!.blockId, 40, 46);
      typeInto(store, book, second!.blockId, 12, 12, TYPED);
      typeInto(store, book, first!.blockId, 12, 12, TYPED);
      const conflict = store.inspectProposalConflict({ ...book, markId: later });
      expect(conflict.navigator.entries.map((entry) => entry.markId)).toEqual([earlier, later]);
      expect(refusal(() => store.inspectProposalConflict({ ...book, markId: exact }))).toBe('PROPOSAL_CONFLICT_NONE');
      expect(refusal(() => store.inspectProposalConflict({ ...book, markId: randomUUID() }))).toBe('MARK_NOT_FOUND');
      expect(refusal(() => store.inspectProposalConflict({ ...book, markId: 'not-a-mark' }))).toBe('PROPOSAL_CONFLICT_INVALID');
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId: later, basisDigest: conflict.basisDigest, outcome: 'defer', draftOrdinal: 1 })))
        .toBe('PROPOSAL_CONFLICT_INVALID');
      expect(refusal(() => store.resolveProposalConflict({ ...book, markId: later, basisDigest: conflict.basisDigest, outcome: 'new-version', draftOrdinal: null })))
        .toBe('PROPOSAL_CONFLICT_INVALID');
    } finally {
      store.close();
    }
  });
});
