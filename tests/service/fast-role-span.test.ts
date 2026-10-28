import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FastRoleExecutionOwner } from '../../src/service/fast-role/fast-role-execution.js';
import { FastRoleRequests, polishWordsOf } from '../../src/service/fast-role/fast-role-suggestions.js';
import {
  EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST,
  EDITORIAL_POLISH_RESULT_SCHEMA,
  editorialPolishContextDigest,
  editorialPolishRequestDigest,
  editorialPolishSelectionDigest,
} from '../../src/service/fast-role/polish-contract.js';
import { EditorialStore } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { readSelectionSpan } from '../../src/shared/selection-span.js';
import type { DialogueSelectionInput, EditorialPolishProjection, FastInteractionRequestProjection, ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';
import { inMemoryFixture, typeInto, unitResult, type Sample1Book } from '../support/fast-role.js';

// Service-integration suite (L2) for 润色这段 over a cross-paragraph selection (Issue #1176, W22-S5): the real store and the
// deterministic route under development-ci, answered by one-entry fixtures held in memory, over exact `sample1` (ADR 0043).
// The span is the processing target, read with its first paragraph's words before it and its last's after it; a suggestion
// across a paragraph break is one atomic group applied as one Effect. Manuscript text is compared by equality only.

let requestGovernor: ModelRequestGovernor;
let roots: ServiceTestRoots;
let store: EditorialStore;
let book: Sample1Book;

beforeEach(async () => {
  requestGovernor = new ModelRequestGovernor();
  roots = await createServiceTestRoots('ai7-service-fast-role-span-');
  await requireExactSample1(roots.codeRoot);
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  book = await importSample1Book(store, roots.codeRoot, '跨段润色');
});

afterEach(async () => {
  try { store.close(); } catch { /* closed by its test */ }
  requestGovernor.close();
  await requestGovernor.whenIdle();
  await roots.dispose();
});

type Block = ManuscriptWindowProjection['blocks'][number];

/** Three contiguous paragraphs A, B and C of the first window, and the selection from A's third grapheme to C's fourth. */
function acrossThree(): { window: ManuscriptWindowProjection; blocks: [Block, Block, Block]; selection: DialogueSelectionInput } {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const at = window.blocks.findIndex((_, index) => window.blocks.slice(index, index + 3).length === 3 &&
    window.blocks.slice(index, index + 3).every((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 16));
  const blocks = window.blocks.slice(at, at + 3) as [Block, Block, Block];
  const reading = readSelectionSpan(blocks, 2, 4);
  if (reading.kind !== 'span') throw new Error('sample1 holds no three contiguous paragraphs');
  const first = reading.pins[0]!;
  return { window, blocks, selection: {
    manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId, baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence, blockId: first.blockId, baseBlockDigest: first.blockDigest, fromGrapheme: first.fromGrapheme,
    toGrapheme: first.toGrapheme, selectedText: reading.text, span: reading.pins,
  } };
}

/** The request digest of 润色这段 on a span: its words, the first paragraph's before them and the last's after them. */
function spanRequestDigest(blocks: [Block, Block, Block], selection: DialogueSelectionInput): string {
  const before = polishWordsOf(blocks[0].text, 2, graphemesOf(blocks[0].text).length).before;
  const after = polishWordsOf(blocks[2].text, 0, 4).after;
  return editorialPolishRequestDigest(EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST, editorialPolishSelectionDigest(selection.selectedText), editorialPolishContextDigest(before, after));
}

function polishOn(answer: ReadonlyArray<{ original: string; replacement: string; reason: string }>, digest: string): FastRoleRequests {
  const fixture = inMemoryFixture('polish-span', digest, unitResult(JSON.stringify({ schema: EDITORIAL_POLISH_RESULT_SCHEMA, suggestions: answer })));
  return new FastRoleRequests(new FastRoleExecutionOwner({ requestGovernor, fixture, live: null }), store, () => new Date('2026-10-29T00:00:00.000Z'));
}

async function settled(requests: FastRoleRequests, projection: EditorialPolishProjection): Promise<EditorialPolishProjection> {
  await requests.settled();
  return (requests.inspect(book.bookId, projection.taskId) as Extract<FastInteractionRequestProjection, { kind: 'editorial-polish' }>).polish;
}

const tail = (text: string, count: number): string => graphemesOf(text).slice(-count).join('');
const head = (text: string, count: number): string => graphemesOf(text).slice(0, count).join('');
const textOf = (blockId: string): string => store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.blockId === blockId)!.text;
const binding = () => ({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId });

describe('润色这段 across paragraphs', () => {
  it('places a suggestion inside one paragraph alone, one across a break as one atomic group, and withholds one that would merge paragraphs', async () => {
    const { blocks, selection } = acrossThree();
    const [a, b] = blocks;
    const inside = graphemesOf(b.text).slice(6, 9).join('');
    const across = `${tail(a.text, 2)}\n${head(b.text, 2)}`;
    const merging = `${tail(b.text, 2)}\n${head(blocks[2].text, 2)}`;
    const requests = polishOn([
      { original: across, replacement: '〔甲〕\n〔乙〕', reason: '跨段的连贯' },
      { original: inside, replacement: '〔丙〕', reason: '段内' },
      { original: merging, replacement: '〔合〕', reason: '合并' },
    ], spanRequestDigest(blocks, selection));
    const polish = await settled(requests, requests.polish(book.bookId, { selection }));
    expect(polish).toMatchObject({ state: 'suggested', withheld: [{ ordinal: 3, reason: '替换后的文字会合并或拆分段落' }] });
    expect(polish.markIds).toHaveLength(3);
    const cards = polish.markIds.map((markId) => store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId));
    expect(cards.map((card) => [card.blockId, card.pinnedText, card.suggestion?.proposedText])).toEqual([
      [a.blockId, tail(a.text, 2), '〔甲〕'], [b.blockId, head(b.text, 2), '〔乙〕'], [b.blockId, inside, '〔丙〕']]);
    const items = store.inspectProposalWorkspace({ manuscriptId: book.manuscriptId, branchId: book.branchId, resultId: null }).items;
    const groupOf = (markId: string) => items.find((item) => item.markId === markId)!.atomicGroupId;
    expect(groupOf(polish.markIds[0]!)).not.toBeNull();
    expect(groupOf(polish.markIds[1]!)).toBe(groupOf(polish.markIds[0]!));
    expect(groupOf(polish.markIds[2]!)).toBeNull();
  }, 300_000);

  it('applies the group as one Effect across its paragraphs, which 撤销 steps over and the governed reversal takes back whole', async () => {
    const { blocks, selection } = acrossThree();
    const [a, b, c] = blocks;
    const requests = polishOn([{ original: `${tail(a.text, 2)}\n${head(b.text, 2)}`, replacement: '〔甲〕\n〔乙〕', reason: '跨段' }], spanRequestDigest(blocks, selection));
    const [first, second] = (await settled(requests, requests.polish(book.bookId, { selection }))).markIds as [string, string];
    expect(() => store.applyChangeSuggestion({ ...binding(), markId: first, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null }))
      .toThrow(expect.objectContaining({ code: 'PROPOSAL_ATOMIC_SCOPE' }));
    // An edit of another paragraph before the Apply, so 撤销 has something of its own to take back.
    const later = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.kind === 'paragraph' && block.position > c.position)!;
    typeInto(store, book, later.blockId, 0, 0, '〔前〕');
    const applied = store.applyChangeSuggestionBatch({ ...binding(), markIds: [first, second], clientEffectId: randomUUID() });
    expect(applied.application).toMatchObject({ kind: 'apply', changeCount: 2 });
    expect(applied.application.after.journalSequence).toBe(applied.application.before.journalSequence + 1);
    expect([textOf(a.blockId).endsWith('〔甲〕'), textOf(b.blockId).startsWith('〔乙〕'), textOf(c.blockId) === c.text]).toEqual([true, true, true]);
    store.undoManuscript(book.manuscriptId, book.branchId, store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest);
    expect(textOf(later.blockId)).toBe(later.text);
    expect([textOf(a.blockId).endsWith('〔甲〕'), textOf(b.blockId).startsWith('〔乙〕')]).toEqual([true, true]);
    const reversed = store.reverseAppliedChangeSuggestion({ ...binding(), markId: second, clientEffectId: randomUUID() });
    expect(reversed.application).toMatchObject({ kind: 'reverse-apply', changeCount: 2, reversesEffectId: applied.application.effectId });
    expect([textOf(a.blockId), textOf(b.blockId)]).toEqual([a.text, b.text]);
  }, 300_000);

  it('refuses a span whose interior paragraph was edited since, by its place, before anything is sent', async () => {
    const { blocks, selection } = acrossThree();
    const requests = polishOn([], spanRequestDigest(blocks, selection));
    typeInto(store, book, blocks[1].blockId, 3, 3, '改');
    expect(() => requests.polish(book.bookId, { selection }))
      .toThrow(expect.objectContaining({ code: 'SELECTION_SPAN_STALE', message: '所选文字的第 2 段已改动、拆分或合并；请重新选择。' }));
    await requests.settled();
  }, 300_000);
});
