import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { FastRoleExecutionOwner } from '../../src/service/fast-role/fast-role-execution.js';
import { prepareScopedEdit, type PreparedScopedEdit } from '../../src/service/fast-role/scoped-edit.js';
import {
  SCOPED_EDIT_PROMPT_CONTRACT_DIGEST,
  SCOPED_EDIT_RESULT_SCHEMA,
  scopedEditInstructionDigest,
  scopedEditRequestDigest,
  scopedEditScopeDigest,
} from '../../src/service/fast-role/scoped-edit-contract.js';
import type { EditorialStore } from '../../src/service/store.js';
import type { StartScopedAiEditInput } from '../../src/shared/protocol.js';
import { inMemoryFixture, polishSelectionOf, unitResult, type Sample1Book } from './fast-role.js';

/**
 * 就选中部分让 AI 修改 on exact `sample1` (Issue #1412; ADR 0043): the one sentence 润色这段's fixture answers, selected inside its
 * paragraph — a partial-block selection — with the Journey's instruction. The request a scoped edit sends is made of words
 * only (the instruction, the selected words, their paragraph's edges and the neighbour paragraphs' edges), never of block
 * identities, so the authored fixture `sample1-scoped-edit-authored` answers it on the Book's manuscript and on a derivative
 * document whose blocks are a copy of `sample1` alike. The replacement is authored; its answer is deliberately adversarial.
 */
export const SCOPED_EDIT_FIXTURE_IDENTITY = 'sample1-scoped-edit-authored';
export const SCOPED_EDIT_JOURNEY_INSTRUCTION = '把这句改得更简洁，保留原意。';
export const SCOPED_EDIT_AUTHORED_REPLACEMENT = '当然，并非每个男人都被众人视为有福之人。';

/** The authored answer: the one target rewritten, plus an id it was never given and a whole-document rewrite, both dropped. */
export const SCOPED_EDIT_AUTHORED_ANSWER = JSON.stringify({
  schema: SCOPED_EDIT_RESULT_SCHEMA,
  targets: [
    { id: 'T1', text: SCOPED_EDIT_AUTHORED_REPLACEMENT },
    { id: 'T2', text: '这一段不是修改目标，越界的改写会被丢弃。' },
  ],
  document: '整篇稿件的重写：不属于任何修改目标，绝不会被读取。',
});

/** The Journey's request on `target` (the Book's manuscript or a copy of it), on the window as it stands now. */
export function scopedEditJourneyInput(store: EditorialStore, book: Sample1Book, locksDigest: string): StartScopedAiEditInput {
  const selection = polishSelectionOf(store, book);
  return {
    manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: selection.baseRevisionId, expectedJournalSequence: selection.expectedJournalSequence,
    expectedLocksDigest: locksDigest, instruction: SCOPED_EDIT_JOURNEY_INSTRUCTION,
    scope: { mode: 'selected-only', span: [{ blockId: selection.blockId, blockDigest: selection.baseBlockDigest, fromGrapheme: selection.fromGrapheme, toGrapheme: selection.toGrapheme }] },
  };
}

/** The scope as the service freezes it, and the request digest the deterministic adapter answers it by. */
export function scopedEditJourneyRequest(store: EditorialStore, bookId: string, input: StartScopedAiEditInput): { prepared: PreparedScopedEdit; requestDigest: string } {
  const governor = new ModelRequestGovernor();
  try {
    const owner = new FastRoleExecutionOwner({ requestGovernor: governor, fixture: inMemoryFixture('scoped-probe', '0'.repeat(64), unitResult('{}')), live: null });
    const prepared = prepareScopedEdit(owner, store, bookId, input);
    return { prepared, requestDigest: scopedEditRequestDigest(SCOPED_EDIT_PROMPT_CONTRACT_DIGEST, scopedEditInstructionDigest(prepared.message.instruction),
      scopedEditScopeDigest(prepared.message.lines)) };
  } finally { governor.close(); }
}
