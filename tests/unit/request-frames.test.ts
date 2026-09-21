import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION } from '../../src/service/review/category-configuration.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  MAX_EDIT_CODE_UNITS,
  MAX_MILESTONE_PURPOSE_CODE_UNITS,
  MAX_REPLACEMENT_EXCLUSIONS,
  MAX_REVIEW_FINDING_REASON_CHARACTERS,
  MAX_REVIEW_RUN_CATEGORIES,
} from '../../src/shared/protocol.js';

const encoder = new TextEncoder();

/** The built-in configuration's categories, in its order; the frame bound must admit all of them at once. */
const BUILTIN_CATEGORY_IDS = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.map((entry) => entry.categoryId);
const WHOLE_SCOPE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
const CHAPTER_BLOCK = `blk_${'1'.repeat(24)}`;
const FINDING_ID = `rvf_${'0'.repeat(24)}`;

function frameOf(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function rejectionFor(frame: Uint8Array): ProtocolError {
  try {
    decodeRequest(frame);
  } catch (error) {
    if (error instanceof ProtocolError) return error;
    throw error;
  }
  throw new Error('expected decodeRequest to reject this frame');
}

function flushJournalEditInput(insertText: string): Record<string, unknown> {
  return {
    clientEditId: randomUUID(),
    manuscriptId: randomUUID(),
    branchId: randomUUID(),
    baseRevisionId: randomUUID(),
    blockId: `blk_${'0'.repeat(24)}`,
    windowStartBlockId: `blk_${'0'.repeat(24)}`,
    baseBlockDigest: 'a'.repeat(64),
    expectedJournalSequence: 3,
    fromGrapheme: 0,
    toGrapheme: 2,
    insertText,
  };
}

describe('decodeRequest accepts well-formed frames', () => {
  it('accepts an operation that takes no input', () => {
    const request = { id: randomUUID(), op: 'ready', input: {} };
    expect(decodeRequest(frameOf(request))).toEqual(request);
  });

  it('accepts each shape of a discriminated input', () => {
    const bookRoute = { id: randomUUID(), op: 'resolveBookWorkbenchRoute', input: { kind: 'book', bookId: randomUUID() } };
    const revisionRoute = {
      id: randomUUID(),
      op: 'resolveBookWorkbenchRoute',
      input: { kind: 'revision', revisionId: randomUUID() },
    };
    expect(decodeRequest(frameOf(bookRoute))).toEqual(bookRoute);
    expect(decodeRequest(frameOf(revisionRoute))).toEqual(revisionRoute);
  });

  it('accepts a nullable cursor', () => {
    const request = {
      id: randomUUID(),
      op: 'getHistoricalRevision',
      input: { revisionId: randomUUID(), cursor: null },
    };
    expect(decodeRequest(frameOf(request))).toEqual(request);
  });

  it('accepts a foreground-boundary inspection that names a Book and a Run record', () => {
    const request = {
      id: randomUUID(),
      op: 'inspectForegroundExecutionBoundary',
      input: { bookId: randomUUID(), runRecordId: randomUUID() },
    };
    expect(decodeRequest(frameOf(request))).toEqual(request);
  });

  it('accepts the three baseline-analysis operations with their exact inputs', () => {
    const inspect = { id: randomUUID(), op: 'inspectBaselineAnalysis', input: { bookId: randomUUID(), revisionId: null } };
    const inspectRevision = { id: randomUUID(), op: 'inspectBaselineAnalysis', input: { bookId: randomUUID(), revisionId: randomUUID() } };
    const prepare = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false } };
    const sync = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_MODE_GOALS['sync-current'], update: { mode: 'sync-current', selectedRange: null }, reconfirm: false } };
    const range = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'], update: { mode: 'reanalyze-range', selectedRange: { startPosition: 26, endPosition: 43 } }, reconfirm: true } };
    const whole = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], update: { mode: 'reanalyze-book', selectedRange: null }, reconfirm: false } };
    const authorize = {
      id: randomUUID(),
      op: 'authorizeBaselineAnalysis',
      input: { bookId: randomUUID(), taskIntentId: randomUUID(), planEnvelopeDigest: 'a'.repeat(64) },
    };
    for (const request of [inspect, inspectRevision, prepare, sync, range, whole, authorize]) {
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
  });

  it('accepts the seven 审阅 operations with their exact inputs', () => {
    const bookId = randomUUID();
    const reviewRunId = randomUUID();
    const inputs: ReadonlyArray<{ op: string; input: Record<string, unknown> }> = [
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId } },
      // The page cursor and the four filters of the results are each optional, and `null` is none.
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId, findingsAfterOrdinal: 300 } },
      {
        op: 'inspectReviewWorkspace',
        input: { bookId, reviewRunId, findingsAfterOrdinal: null, categoryId: 'typos-and-usage', severity: 'must', status: 'pending', chapterBlockId: CHAPTER_BLOCK },
      },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, categoryId: null, severity: null, status: 'ignored', chapterBlockId: null } },
      { op: 'prepareReviewRun', input: { bookId, categoryIds: ['typos-and-usage'], scope: WHOLE_SCOPE } },
      { op: 'prepareReviewRun', input: { bookId, categoryIds: ['typos-and-usage', 'plot-consistency'], scope: { kind: 'chapters', fromChapterBlockId: CHAPTER_BLOCK, toChapterBlockId: `blk_${'2'.repeat(24)}` } } },
      { op: 'prepareReviewRun', input: { bookId, categoryIds: ['literary-expression'], scope: { kind: 'changed', fromChapterBlockId: null, toChapterBlockId: null } } },
      // 当前选区 is a well-formed request; the store is the one to say why it cannot be read yet.
      { op: 'prepareReviewRun', input: { bookId, categoryIds: ['style-and-format'], scope: { kind: 'selection', fromChapterBlockId: null, toChapterBlockId: null } } },
      // A Run of the leads alone has no Task, so its one approval names no plan.
      { op: 'authorizeReviewRun', input: { bookId, reviewRunId, planDigests: [] } },
      {
        op: 'authorizeReviewRun',
        input: {
          bookId,
          reviewRunId,
          planDigests: [{ categoryId: 'typos-and-usage', planEnvelopeDigest: 'a'.repeat(64) }, { categoryId: 'factual-review', planEnvelopeDigest: 'b'.repeat(64) }],
        },
      },
      { op: 'continueReviewRun', input: { bookId, reviewRunId } },
      { op: 'recordReviewFindingDisposition', input: { bookId, reviewRunId, findingId: FINDING_ID, disposition: 'ignored', reason: '与本书体例一致' } },
      { op: 'generateReviewReport', input: { bookId, reviewRunId } },
      { op: 'inspectReviewFindingOfMark', input: { bookId, markId: randomUUID() } },
    ];
    for (const { op, input } of inputs) {
      const request = { id: randomUUID(), op, input };
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
    expect(new Set(inputs.map((entry) => entry.op)).size).toBe(7);
  });

  it('accepts a milestone save with a frozen purpose and no words, and with 自行输入 and the editor\'s words', () => {
    const binding = { manuscriptId: randomUUID(), branchId: randomUUID(), label: '二审前', note: '' };
    for (const purposeKind of ['stage-archive', 'review-candidate', 'delivery-candidate', 'other']) {
      const request = { id: randomUUID(), op: 'saveMilestone', input: { ...binding, purposeKind, purpose: null } };
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
    const own = { id: randomUUID(), op: 'saveMilestone', input: { ...binding, purposeKind: 'custom', purpose: '途'.repeat(MAX_MILESTONE_PURPOSE_CODE_UNITS), note: '说明' } };
    expect(decodeRequest(frameOf(own))).toEqual(own);
  });
});

describe('decodeRequest enforces size limits', () => {
  it('accepts an edit at the code-unit bound and rejects one past it', () => {
    const id = randomUUID();
    const atBound = { id, op: 'flushJournalEdit', input: flushJournalEditInput('x'.repeat(MAX_EDIT_CODE_UNITS)) };
    expect(decodeRequest(frameOf(atBound))).toEqual(atBound);

    const pastBound = { id, op: 'flushJournalEdit', input: flushJournalEditInput('x'.repeat(MAX_EDIT_CODE_UNITS + 1)) };
    expect(rejectionFor(frameOf(pastBound)).requestId).toBe(id);
  });

  it('accepts an empty edit, which the bound explicitly allows', () => {
    const request = { id: randomUUID(), op: 'flushJournalEdit', input: flushJournalEditInput('') };
    expect(decodeRequest(frameOf(request))).toEqual(request);
  });

  it('accepts the exclusion list at its bound and rejects one entry past it', () => {
    const id = randomUUID();
    const exclusion = `hit_${'0'.repeat(24)}`;
    const atBound = {
      id,
      op: 'prepareReplacement',
      input: {
        searchId: randomUUID(),
        replacement: '替换文本',
        excludedMatchIds: Array.from({ length: MAX_REPLACEMENT_EXCLUSIONS }, () => exclusion),
      },
    };
    expect(decodeRequest(frameOf(atBound))).toEqual(atBound);

    const pastBound = {
      id,
      op: 'prepareReplacement',
      input: {
        searchId: randomUUID(),
        replacement: '替换文本',
        excludedMatchIds: Array.from({ length: MAX_REPLACEMENT_EXCLUSIONS + 1 }, () => exclusion),
      },
    };
    expect(rejectionFor(frameOf(pastBound)).requestId).toBe(id);
  });

  it('admits every category of the built-in configuration in one Review Run and refuses one more', () => {
    expect(BUILTIN_CATEGORY_IDS).toHaveLength(MAX_REVIEW_RUN_CATEGORIES);
    const id = randomUUID();
    const bookId = randomUUID();
    const all = { id, op: 'prepareReviewRun', input: { bookId, categoryIds: BUILTIN_CATEGORY_IDS, scope: WHOLE_SCOPE } };
    expect(decodeRequest(frameOf(all))).toEqual(all);
    const oneMore = { id, op: 'prepareReviewRun', input: { bookId, categoryIds: [...BUILTIN_CATEGORY_IDS, 'house-category'], scope: WHOLE_SCOPE } };
    expect(rejectionFor(frameOf(oneMore)).requestId).toBe(id);
    const approvals = BUILTIN_CATEGORY_IDS.map((categoryId) => ({ categoryId, planEnvelopeDigest: 'c'.repeat(64) }));
    const approveAll = { id, op: 'authorizeReviewRun', input: { bookId, reviewRunId: randomUUID(), planDigests: approvals } };
    expect(decodeRequest(frameOf(approveAll))).toEqual(approveAll);
    const approveOneMore = { ...approveAll, input: { ...approveAll.input, planDigests: [...approvals, { categoryId: 'house-category', planEnvelopeDigest: 'c'.repeat(64) }] } };
    expect(rejectionFor(frameOf(approveOneMore)).requestId).toBe(id);
  });

  it('accepts a reason of 忽略并说明 at its character bound, however it is padded or encoded, and refuses one past it', () => {
    const id = randomUUID();
    const bookId = randomUUID();
    const reviewRunId = randomUUID();
    const dispose = (reason: string) => ({
      id,
      op: 'recordReviewFindingDisposition',
      input: { bookId, reviewRunId, findingId: FINDING_ID, disposition: 'ignored', reason },
    });
    for (const reason of [
      '理'.repeat(MAX_REVIEW_FINDING_REASON_CHARACTERS),
      `  ${'理'.repeat(MAX_REVIEW_FINDING_REASON_CHARACTERS)}\n`,
      // Characters outside the Basic Multilingual Plane count once each, as the store counts them.
      '𠀀'.repeat(MAX_REVIEW_FINDING_REASON_CHARACTERS),
    ]) {
      const request = dispose(reason);
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
    expect(rejectionFor(frameOf(dispose('理'.repeat(MAX_REVIEW_FINDING_REASON_CHARACTERS + 1)))).requestId).toBe(id);
    expect(rejectionFor(frameOf(dispose('𠀀'.repeat(MAX_REVIEW_FINDING_REASON_CHARACTERS + 1)))).requestId).toBe(id);
  });
});

describe('decodeRequest rejects malformed frames', () => {
  it('reports one protocol error code and message for every rejection', () => {
    const failure = rejectionFor(encoder.encode('not json'));
    expect(failure.code).toBe('PROTOCOL_INVALID');
    expect(failure.name).toBe('ProtocolError');
    expect(failure.message).toBe('服务请求格式无效。');
  });

  it('rejects bytes that are not valid UTF-8 without a request id', () => {
    expect(rejectionFor(Uint8Array.from([0xc3, 0x28])).requestId).toBe('invalid');
  });

  it('rejects a frame that is not a JSON object', () => {
    expect(rejectionFor(frameOf('a string')).requestId).toBe('invalid');
    expect(rejectionFor(frameOf([1, 2, 3])).requestId).toBe('invalid');
    expect(rejectionFor(frameOf(null)).requestId).toBe('invalid');
  });

  it('echoes a syntactically usable id and falls back to invalid otherwise', () => {
    expect(rejectionFor(frameOf({ id: 'not-a-uuid', op: 'ready', input: {} })).requestId).toBe('not-a-uuid');
    expect(rejectionFor(frameOf({ id: 42, op: 'ready', input: {} })).requestId).toBe('invalid');
    expect(rejectionFor(frameOf({ id: 'x'.repeat(65), op: 'ready', input: {} })).requestId).toBe('invalid');
    expect(rejectionFor(frameOf({ id: '', op: 'ready', input: {} })).requestId).toBe('invalid');
  });

  it('rejects missing and extra top-level keys', () => {
    const id = randomUUID();
    expect(rejectionFor(frameOf({ id, op: 'ready' })).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'ready', input: {}, extra: 1 })).requestId).toBe(id);
    expect(rejectionFor(frameOf({ op: 'ready', input: {} })).requestId).toBe('invalid');
  });

  it('rejects an operation that is not a string and one that is unknown', () => {
    const id = randomUUID();
    expect(rejectionFor(frameOf({ id, op: 7, input: {} })).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'thisOperationDoesNotExist', input: {} })).requestId).toBe(id);
  });

  it('rejects an input that does not match its operation', () => {
    const id = randomUUID();
    expect(rejectionFor(frameOf({ id, op: 'ready', input: { unexpected: true } })).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'ready', input: null })).requestId).toBe(id);
    expect(
      rejectionFor(frameOf({ id, op: 'resolveBookWorkbenchRoute', input: { kind: 'book', bookId: 'not-a-uuid' } }))
        .requestId,
    ).toBe(id);
    expect(
      rejectionFor(frameOf({ id, op: 'resolveBookWorkbenchRoute', input: { kind: 'unknown', bookId: randomUUID() } }))
        .requestId,
    ).toBe(id);
    expect(
      rejectionFor(frameOf({ id, op: 'getHistoricalRevision', input: { revisionId: randomUUID(), cursor: 7 } }))
        .requestId,
    ).toBe(id);
  });

  it('rejects a baseline-analysis preparation whose goal, mode, or range is inconsistent, or whose digest is malformed', () => {
    const id = randomUUID();
    const bookId = randomUUID();
    const prepare = (goal: string, update: unknown, reconfirm: unknown = false) => frameOf({ id, op: 'prepareBaselineAnalysis', input: { bookId, goal, update, reconfirm } });
    expect(rejectionFor(prepare('其他目标', null)).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'prepareBaselineAnalysis', input: { bookId, goal: BASELINE_ANALYSIS_TASK_GOAL } })).requestId).toBe(id);
    // `reconfirm` is required and boolean: a frame without it or with a non-boolean is refused.
    expect(rejectionFor(frameOf({ id, op: 'prepareBaselineAnalysis', input: { bookId, goal: BASELINE_ANALYSIS_TASK_GOAL, update: null } })).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_TASK_GOAL, null, 'yes')).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_TASK_GOAL, null, 1)).requestId).toBe(id);
    // A goal that names another mode than `update.mode`, a range for a non-range mode, a missing range, and an inverted range.
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_MODE_GOALS['sync-current'], null)).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_TASK_GOAL, { mode: 'sync-current', selectedRange: null })).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], { mode: 'sync-current', selectedRange: null })).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_MODE_GOALS['sync-current'], { mode: 'sync-current', selectedRange: { startPosition: 1, endPosition: 2 } })).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'], { mode: 'reanalyze-range', selectedRange: null })).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'], { mode: 'reanalyze-range', selectedRange: { startPosition: 5, endPosition: 4 } })).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'], { mode: 'reanalyze-range', selectedRange: { startPosition: 0, endPosition: 4 } })).requestId).toBe(id);
    expect(rejectionFor(prepare(BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], { mode: 'reanalyze-book' })).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'authorizeBaselineAnalysis', input: { bookId, taskIntentId: randomUUID(), planEnvelopeDigest: 'short' } })).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'inspectBaselineAnalysis', input: { bookId, extra: 1 } })).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'inspectBaselineAnalysis', input: { bookId } })).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'inspectBaselineAnalysis', input: { bookId, revisionId: 'not-a-uuid' } })).requestId).toBe(id);
  });

  it('rejects a 审阅 workspace inspection, continuation, report or mark lookup whose identities or key set are wrong', () => {
    const id = randomUUID();
    const bookId = randomUUID();
    const refused: ReadonlyArray<{ op: string; input: unknown }> = [
      { op: 'inspectReviewWorkspace', input: { bookId } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: 'not-a-uuid' } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, extra: 1 } },
      { op: 'inspectReviewWorkspace', input: { bookId: 'not-a-uuid', reviewRunId: null } },
      // The page cursor is a finding ordinal, and each filter names what a finding can be.
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, findingsAfterOrdinal: 0 } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, findingsAfterOrdinal: 1.5 } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, findingsAfterOrdinal: '300' } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, categoryId: 'Typos' } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, severity: '必须处理' } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, status: 'open' } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, chapterBlockId: 'blk_short' } },
      { op: 'inspectReviewWorkspace', input: { bookId, reviewRunId: null, filter: { severity: 'must' } } },
      // Only inspecting opens "the latest" Run; every other operation names its Run.
      { op: 'continueReviewRun', input: { bookId, reviewRunId: null } },
      { op: 'continueReviewRun', input: { reviewRunId: randomUUID() } },
      { op: 'generateReviewReport', input: { bookId, reviewRunId: null } },
      { op: 'generateReviewReport', input: { bookId, reviewRunId: randomUUID(), version: 2 } },
      { op: 'inspectReviewFindingOfMark', input: { bookId, markId: 'not-a-uuid' } },
      // The service is asked within the Book only; the manuscript capability is the main process's to check.
      { op: 'inspectReviewFindingOfMark', input: { bookId, markId: randomUUID(), manuscriptId: randomUUID() } },
    ];
    for (const { op, input } of refused) {
      expect(rejectionFor(frameOf({ id, op, input })).requestId).toBe(id);
    }
  });

  it('rejects a Review Run preparation whose categories or scope are malformed', () => {
    const id = randomUUID();
    const bookId = randomUUID();
    const prepare = (categoryIds: unknown, scope: unknown) => frameOf({ id, op: 'prepareReviewRun', input: { bookId, categoryIds, scope } });
    // No category, a repeated one, one that is not a category identity, and a list that is not a list.
    expect(rejectionFor(prepare([], WHOLE_SCOPE)).requestId).toBe(id);
    expect(rejectionFor(prepare(['typos-and-usage', 'typos-and-usage'], WHOLE_SCOPE)).requestId).toBe(id);
    expect(rejectionFor(prepare(['Typos'], WHOLE_SCOPE)).requestId).toBe(id);
    expect(rejectionFor(prepare(['editorial-review/typos-and-usage'], WHOLE_SCOPE)).requestId).toBe(id);
    expect(rejectionFor(prepare(['x'.repeat(49)], WHOLE_SCOPE)).requestId).toBe(id);
    expect(rejectionFor(prepare('typos-and-usage', WHOLE_SCOPE)).requestId).toBe(id);
    // 选章 names both chapters by their first blocks; every other scope names neither, and the key set is exact.
    const categories = ['typos-and-usage'];
    expect(rejectionFor(prepare(categories, { kind: 'chapters', fromChapterBlockId: null, toChapterBlockId: null })).requestId).toBe(id);
    expect(rejectionFor(prepare(categories, { kind: 'chapters', fromChapterBlockId: CHAPTER_BLOCK, toChapterBlockId: 'blk_short' })).requestId).toBe(id);
    expect(rejectionFor(prepare(categories, { kind: 'whole', fromChapterBlockId: CHAPTER_BLOCK, toChapterBlockId: CHAPTER_BLOCK })).requestId).toBe(id);
    expect(rejectionFor(prepare(categories, { kind: 'selection', fromChapterBlockId: CHAPTER_BLOCK, toChapterBlockId: null })).requestId).toBe(id);
    expect(rejectionFor(prepare(categories, { kind: 'everything', fromChapterBlockId: null, toChapterBlockId: null })).requestId).toBe(id);
    expect(rejectionFor(prepare(categories, { kind: 'whole' })).requestId).toBe(id);
    expect(rejectionFor(prepare(categories, null)).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'prepareReviewRun', input: { bookId, categoryIds: categories } })).requestId).toBe(id);
  });

  it('rejects a Review Run approval whose plan digests are malformed, repeated or not a list', () => {
    const id = randomUUID();
    const authorize = (planDigests: unknown) =>
      frameOf({ id, op: 'authorizeReviewRun', input: { bookId: randomUUID(), reviewRunId: randomUUID(), planDigests } });
    const approval = { categoryId: 'typos-and-usage', planEnvelopeDigest: 'a'.repeat(64) };
    expect(rejectionFor(authorize([{ ...approval, planEnvelopeDigest: 'short' }])).requestId).toBe(id);
    expect(rejectionFor(authorize([{ ...approval, planEnvelopeDigest: 'A'.repeat(64) }])).requestId).toBe(id);
    expect(rejectionFor(authorize([approval, { ...approval, planEnvelopeDigest: 'b'.repeat(64) }])).requestId).toBe(id);
    expect(rejectionFor(authorize([{ ...approval, categoryId: 'Typos' }])).requestId).toBe(id);
    expect(rejectionFor(authorize([{ ...approval, taskIntentId: randomUUID() }])).requestId).toBe(id);
    expect(rejectionFor(authorize([{ categoryId: 'typos-and-usage' }])).requestId).toBe(id);
    expect(rejectionFor(authorize(['a'.repeat(64)])).requestId).toBe(id);
    expect(rejectionFor(authorize(approval)).requestId).toBe(id);
    expect(rejectionFor(authorize(null)).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'authorizeReviewRun', input: { bookId: randomUUID(), planDigests: [] } })).requestId).toBe(id);
  });

  it('rejects 忽略并说明 without a reason, with another disposition, or for an identity that is not a review finding', () => {
    const id = randomUUID();
    const dispose = (input: Record<string, unknown>) => frameOf({
      id,
      op: 'recordReviewFindingDisposition',
      input: { bookId: randomUUID(), reviewRunId: randomUUID(), findingId: FINDING_ID, disposition: 'ignored', reason: '已人工核对', ...input },
    });
    for (const reason of ['', '   ', '\n\t', '\uD800', 42, null]) {
      expect(rejectionFor(dispose({ reason })).requestId).toBe(id);
    }
    expect(rejectionFor(dispose({ disposition: 'reopened' })).requestId).toBe(id);
    expect(rejectionFor(dispose({ disposition: 'handled' })).requestId).toBe(id);
    // The kind-level identities a finding is derived from are not the Review Run's own finding identity.
    for (const findingId of [`rfd_${'0'.repeat(24)}`, `fnd_${'0'.repeat(24)}`, `lead_${'0'.repeat(24)}`, `rvf_${'0'.repeat(23)}`, `rvf_${'G'.repeat(24)}`]) {
      expect(rejectionFor(dispose({ findingId })).requestId).toBe(id);
    }
    expect(rejectionFor(frameOf({
      id,
      op: 'recordReviewFindingDisposition',
      input: { bookId: randomUUID(), reviewRunId: randomUUID(), findingId: FINDING_ID, reason: '已人工核对' },
    })).requestId).toBe(id);
  });

  it('rejects a milestone save whose purpose kind is not a purpose, whose words do not match its kind, or that uses the old key set', () => {
    const id = randomUUID();
    const binding = { manuscriptId: randomUUID(), branchId: randomUUID(), label: '二审前', note: '' };
    const refused: ReadonlyArray<Record<string, unknown>> = [
      // The key set before the kinds: a purpose without its kind.
      { ...binding, purpose: '确认结构复核后的状态' },
      { ...binding, purposeKind: 'final', purpose: null },
      { ...binding, purposeKind: '阶段留档', purpose: null },
      { ...binding, purposeKind: null, purpose: '确认结构复核后的状态' },
      // A frozen purpose carries no words; 自行输入 carries words within the bound.
      { ...binding, purposeKind: 'stage-archive', purpose: '阶段留档' },
      { ...binding, purposeKind: 'other', purpose: '' },
      { ...binding, purposeKind: 'custom', purpose: null },
      { ...binding, purposeKind: 'custom', purpose: '' },
      { ...binding, purposeKind: 'custom', purpose: '途'.repeat(MAX_MILESTONE_PURPOSE_CODE_UNITS + 1) },
      { ...binding, purposeKind: 'custom', purpose: '\uD800' },
      { ...binding, purposeKind: 'custom', purpose: '确认', extra: 1 },
    ];
    for (const input of refused) {
      expect(rejectionFor(frameOf({ id, op: 'saveMilestone', input })).requestId).toBe(id);
    }
  });

  it('rejects a foreground-boundary inspection whose Run identity or key set is wrong', () => {
    const id = randomUUID();
    expect(
      rejectionFor(
        frameOf({ id, op: 'inspectForegroundExecutionBoundary', input: { bookId: randomUUID(), runRecordId: 'not-a-uuid' } }),
      ).requestId,
    ).toBe(id);
    expect(
      rejectionFor(
        frameOf({
          id,
          op: 'inspectForegroundExecutionBoundary',
          input: { bookId: randomUUID(), runRecordId: randomUUID(), extra: 1 },
        }),
      ).requestId,
    ).toBe(id);
  });
});
