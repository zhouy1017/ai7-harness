import { describe, expect, it } from 'vitest';
import { decodeRequest } from '../../src/service/request-frames.js';

// The service's frame decoder for 润色这段 and 基于当前稿件重新生成建议 (Issue #842): each of the four operations takes exactly its
// own input, and anything beside it is a protocol error before the service reads it.

const BOOK = '00000000-0000-4000-8000-000000000001';
const MANUSCRIPT = '00000000-0000-4000-8000-000000000002';
const MARK = '00000000-0000-4000-8000-000000000003';
const REQUEST = '00000000-0000-4000-8000-000000000004';
const selection = {
  manuscriptId: MANUSCRIPT, branchId: MANUSCRIPT, windowStartBlockId: `blk_${'a'.repeat(24)}`, baseRevisionId: MANUSCRIPT, expectedJournalSequence: 0,
  blockId: `blk_${'a'.repeat(24)}`, baseBlockDigest: 'b'.repeat(64), fromGrapheme: 0, toGrapheme: 4, selectedText: '四个字儿',
};
const unit = { manuscriptId: MANUSCRIPT, branchId: MANUSCRIPT, markId: MARK, basisDigest: 'c'.repeat(64), unitIndex: 1 };
const frame = (op: string, input: unknown): Buffer => Buffer.from(JSON.stringify({ id: '00000000-0000-4000-8000-0000000000f2', op, input }), 'utf8');

describe('the fast-role operations as the service decodes them', () => {
  it('accepts exactly the four operations\' inputs and refuses anything beside them', () => {
    for (const [op, input] of [
      ['inspectFastInteractionRoutes', { bookId: BOOK }],
      ['polishSelection', { bookId: BOOK, selection }],
      ['inspectFastInteractionRequest', { bookId: BOOK, requestId: REQUEST }],
      ['regenerateProposalConflictUnit', unit],
    ] as const) {
      expect(decodeRequest(frame(op, input))).toMatchObject({ op, input });
    }
    for (const [op, input] of [
      ['inspectFastInteractionRoutes', { bookId: 'bad' }],
      ['inspectFastInteractionRoutes', { bookId: BOOK, extra: true }],
      ['polishSelection', { bookId: BOOK, selection: null }],
      ['polishSelection', { bookId: BOOK, selection: { ...selection, extra: 1 } }],
      ['polishSelection', { bookId: BOOK, selection, question: '多余' }],
      ['inspectFastInteractionRequest', { bookId: BOOK, requestId: 'bad' }],
      ['regenerateProposalConflictUnit', { ...unit, unitIndex: -1 }],
      ['regenerateProposalConflictUnit', { ...unit, basisDigest: 'short' }],
      ['regenerateProposalConflictUnit', { ...unit, text: '多余' }],
    ] as const) {
      expect(() => decodeRequest(frame(op, input))).toThrowError();
    }
  });
});
