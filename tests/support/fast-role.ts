import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { EditorialStore } from '../../src/service/store.js';
import {
  EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST,
  EDITORIAL_POLISH_RESULT_SCHEMA,
  editorialPolishContextDigest,
  editorialPolishRequestDigest,
  editorialPolishSelectionDigest,
} from '../../src/service/fast-role/polish-contract.js';
import {
  CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST,
  CONFLICT_REGENERATE_RESULT_SCHEMA,
  conflictRegenerateRegionDigest,
  conflictRegenerateRequestDigest,
} from '../../src/service/fast-role/conflict-regenerate-contract.js';
import { polishWordsOf, regenerationRegionOf } from '../../src/service/fast-role/fast-role-suggestions.js';
import { fixtureEntryKey, type ModelFixtureEntry, type ModelFixtureResponse, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { DialogueSelectionInput, ManuscriptWindowProjection, ProposalConflictProjection } from '../../src/shared/protocol.js';

/**
 * 润色这段 and 基于当前稿件重新生成建议 on exact `sample1` (Issue #842; ADR 0043, ADR 0079 §5). The selection is one sentence of
 * the block that holds the passage the authored review fixture already corrects (「比较特别卜算」); the conflict is constructed
 * from tester edits of that same passage, the J-06 composition pattern: a 修改建议 on the words, then the editor's own typing
 * inside them. The fragments named here are short quotations of the admitted SampleBook; every other text is authored.
 */
export const POLISH_SENTENCE_START = '当然，也不是所有男人';
export const POLISH_SENTENCE_END = '都是众人眼里的有福之人。';
export const TYPO = '比较特别卜算';

/** The authored polish answer: two anchored replacements and one whose words are not in the selection. */
export const AUTHORED_POLISH_SUGGESTIONS = [
  { original: TYPO, replacement: '比较特别的卜算', reason: '「特别」与「卜算」之间缺少结构助词「的」。' },
  { original: '都是众人眼里的有福之人', replacement: '都被众人视为有福之人', reason: '改用「被……视为」，说法更凝练。' },
  { original: '这一句并不在所选文字之中', replacement: '这一句也不在', reason: '用来验证不在所选文字中的建议会被拦下。' },
] as const;

export const AUTHORED_POLISH_ANSWER = JSON.stringify({ schema: EDITORIAL_POLISH_RESULT_SCHEMA, suggestions: AUTHORED_POLISH_SUGGESTIONS });

/** The conflict: the suggestion's words, what it proposes and why, and what the editor typed over part of them afterwards. */
export const CONFLICT_PROPOSED = '比较特别的卜算';
export const CONFLICT_RATIONALE = '补上结构助词「的」。';
export const CONFLICT_TYPED_FROM = '卜算';
export const CONFLICT_TYPED = '占卜';
/** The authored regenerated words: the proposal's intent carried onto the edited manuscript. */
export const AUTHORED_REGENERATION = '比较特别的占卜';
export const AUTHORED_REGENERATION_ANSWER = JSON.stringify({ schema: CONFLICT_REGENERATE_RESULT_SCHEMA, text: AUTHORED_REGENERATION });

export interface Sample1Book {
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
}

function windowAt(store: EditorialStore, book: Sample1Book, blockId: string | null): ManuscriptWindowProjection {
  return blockId === null
    ? store.getManuscriptWindow(book.manuscriptId, book.branchId, null)
    : store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId });
}

/** The block of `sample1` that holds the typo, as the working state holds it now. */
export function typoBlock(store: EditorialStore, book: Sample1Book): { window: ManuscriptWindowProjection; block: ManuscriptWindowProjection['blocks'][number] } {
  let cursor: string | null = null;
  for (;;) {
    const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, cursor);
    const block = window.blocks.find((candidate) => candidate.text.includes(POLISH_SENTENCE_START));
    if (block !== undefined) return { window: windowAt(store, book, block.blockId), block };
    if (window.nextCursor === null) throw new Error('sample1 holds no block with the polish sentence');
    cursor = window.nextCursor;
  }
}

function graphemeOffset(text: string, at: number): number {
  return graphemesOf(text.slice(0, at)).length;
}

/** 润色这段's selection on `sample1`: the one sentence, exactly as the editor would select it. */
export function polishSelectionOf(store: EditorialStore, book: Sample1Book): DialogueSelectionInput {
  const { window, block } = typoBlock(store, book);
  const start = block.text.indexOf(POLISH_SENTENCE_START);
  const end = block.text.indexOf(POLISH_SENTENCE_END, start) + POLISH_SENTENCE_END.length;
  const fromGrapheme = graphemeOffset(block.text, start);
  const toGrapheme = graphemeOffset(block.text, end);
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme,
    toGrapheme,
    selectedText: graphemesOf(block.text).slice(fromGrapheme, toGrapheme).join(''),
  };
}

/** The request digest the deterministic adapter answers 润色这段 on that selection by. */
export function polishRequestDigestOf(store: EditorialStore, book: Sample1Book): string {
  const selection = polishSelectionOf(store, book);
  const { block } = typoBlock(store, book);
  const words = polishWordsOf(block.text, selection.fromGrapheme, selection.toGrapheme);
  return editorialPolishRequestDigest(EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST, editorialPolishSelectionDigest(words.text),
    editorialPolishContextDigest(words.before, words.after));
}

/** The editor's own typing: one journal edit of one block, against the window as it stands now. */
export function typeInto(store: EditorialStore, book: Sample1Book, blockId: string, from: number, to: number, insertText: string): void {
  const now = windowAt(store, book, blockId);
  store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: now.revisionId, blockId,
    windowStartBlockId: now.blocks[0]!.blockId, baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest,
    expectedJournalSequence: now.journalSequence, fromGrapheme: from, toGrapheme: to, insertText,
  });
}

/**
 * A Three-way Proposal Conflict constructed from tester edits of `sample1` (J-06's pattern): a 修改建议 on the typo's words, then
 * the editor's typing over part of them, which drifts the suggestion's anchor. Its comparison has exactly one `conflict` unit.
 */
export function constructSample1Conflict(store: EditorialStore, book: Sample1Book): { markId: string; blockId: string } {
  const { window, block } = typoBlock(store, book);
  const at = block.text.indexOf(TYPO);
  const from = graphemeOffset(block.text, at);
  const to = from + graphemesOf(TYPO).length;
  const markId = store.createEditorialMark({
    manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId, clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest,
    fromGrapheme: from, toGrapheme: to, selectedText: TYPO, kind: 'change-suggestion', highlightColor: null, body: '',
    proposedText: CONFLICT_PROPOSED, rationale: CONFLICT_RATIONALE,
  }).markId;
  const typedAt = from + graphemesOf(TYPO.slice(0, TYPO.indexOf(CONFLICT_TYPED_FROM))).length;
  typeInto(store, book, block.blockId, typedAt, typedAt + graphemesOf(CONFLICT_TYPED_FROM).length, CONFLICT_TYPED);
  return { markId, blockId: block.blockId };
}

export function conflictOf(store: EditorialStore, book: Sample1Book, markId: string): ProposalConflictProjection {
  return store.inspectProposalConflict({ manuscriptId: book.manuscriptId, branchId: book.branchId, markId });
}

/** The index of the conflict's one `conflict` unit. */
export function conflictUnitIndex(conflict: ProposalConflictProjection): number {
  const indices = conflict.units.flatMap((unit, index) => unit.kind === 'conflict' ? [index] : []);
  expect(indices).toHaveLength(1);
  return indices[0]!;
}

/** The request digest the deterministic adapter answers that unit's regeneration by. */
export function regenerationRequestDigestOf(conflict: ProposalConflictProjection, unitIndex: number): string {
  return conflictRegenerateRequestDigest(CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST, conflictRegenerateRegionDigest(regenerationRegionOf(conflict, unitIndex)));
}

/** A one-entry synthetic fixture held in memory, answering one request digest under ordinal 0. */
export function inMemoryFixture(identity: string, requestDigest: string, response: ModelFixtureResponse): ResolvedModelFixture {
  const entry: ModelFixtureEntry = { unitOrdinal: 0, requestDigest, attempt: null, contentDigest: null, response };
  return {
    identity,
    description: `${identity}（测试内存夹具）`,
    provenance: 'authored',
    lineage: [{ identity, sha256: sha256Hex(identity) }],
    entries: new Map([[fixtureEntryKey(0, requestDigest), entry]]),
    sha256: sha256Hex(`${identity}:${requestDigest}`),
  };
}

export function unitResult(text: string): ModelFixtureResponse {
  return { kind: 'unit-result', text, usage: { inputTokens: 320, outputTokens: 60 } };
}
