import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import { BASELINE_ANALYSIS_MODE_GOALS, BASELINE_ANALYSIS_TASK_GOAL, MAX_EDIT_CODE_UNITS, MAX_REPLACEMENT_EXCLUSIONS } from '../../src/shared/protocol.js';

const encoder = new TextEncoder();

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
    const prepare = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null } };
    const sync = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_MODE_GOALS['sync-current'], update: { mode: 'sync-current', selectedRange: null } } };
    const range = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_MODE_GOALS['reanalyze-range'], update: { mode: 'reanalyze-range', selectedRange: { startPosition: 26, endPosition: 43 } } } };
    const whole = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], update: { mode: 'reanalyze-book', selectedRange: null } } };
    const authorize = {
      id: randomUUID(),
      op: 'authorizeBaselineAnalysis',
      input: { bookId: randomUUID(), taskIntentId: randomUUID(), planEnvelopeDigest: 'a'.repeat(64) },
    };
    for (const request of [inspect, inspectRevision, prepare, sync, range, whole, authorize]) {
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
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
    const prepare = (goal: string, update: unknown) => frameOf({ id, op: 'prepareBaselineAnalysis', input: { bookId, goal, update } });
    expect(rejectionFor(prepare('其他目标', null)).requestId).toBe(id);
    expect(rejectionFor(frameOf({ id, op: 'prepareBaselineAnalysis', input: { bookId, goal: BASELINE_ANALYSIS_TASK_GOAL } })).requestId).toBe(id);
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
