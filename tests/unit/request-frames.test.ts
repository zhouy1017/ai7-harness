import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION } from '../../src/service/review/category-configuration.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  MAX_EDIT_CODE_UNITS,
  MAX_EXPORT_DESTINATION_CODE_UNITS,
  MAX_MARK_BODY_CODE_UNITS,
  MAX_MILESTONE_PURPOSE_CODE_UNITS,
  MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS,
  MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS,
  MAX_PROPOSAL_CONFLICT_UNITS,
  MAX_PUBLICATION_BASIS_CHARACTERS,
  MAX_PUBLICATION_SCOPE_CHARACTERS,
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

  it('accepts an import review with each text-box choice (ADR 0086)', () => {
    for (const textBoxDisposition of ['retain', 'merge'] as const) {
      const request = {
        id: randomUUID(),
        op: 'prepareNewBookReview',
        input: {
          draftId: randomUUID(),
          expectedDraftVersion: 2,
          target: { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '书名' },
          acceptDegradation: false,
          textBoxDisposition,
        },
      };
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
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
    // 改计划重做 (Issue #422, S76c): a preparation may name the cancelled Run it redoes, or say plainly that it redoes none.
    const redo = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_MODE_GOALS['sync-current'], update: { mode: 'sync-current', selectedRange: null }, reconfirm: false, redoOf: randomUUID() } };
    const redoNone = { id: randomUUID(), op: 'prepareBaselineAnalysis', input: { bookId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false, redoOf: null } };
    for (const request of [inspect, inspectRevision, prepare, sync, range, whole, authorize, redo, redoNone]) {
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
  });

  it('accepts the three Connectivity Wait operations with their exact inputs, and refuses anything more (Issue #502)', () => {
    const startWhenOnline = {
      id: randomUUID(),
      op: 'startBaselineAnalysisWhenOnline',
      input: { bookId: randomUUID(), taskIntentId: randomUUID(), planEnvelopeDigest: 'b'.repeat(64) },
    };
    const cancel = { id: randomUUID(), op: 'cancelWaitingBaselineAnalysis', input: { bookId: randomUUID(), taskIntentId: randomUUID() } };
    const preflight = { id: randomUUID(), op: 'runReconnectPreflight', input: {} };
    for (const request of [startWhenOnline, cancel, preflight]) expect(decodeRequest(frameOf(request))).toEqual(request);
    // Reconnect Preflight names no Book; a waiting Run is named by its Task Intent; a digest is 64 hex digits.
    expect(rejectionFor(frameOf({ ...preflight, input: { bookId: randomUUID() } }))).toBeInstanceOf(ProtocolError);
    expect(rejectionFor(frameOf({ ...cancel, input: { ...cancel.input, runRecordId: randomUUID() } }))).toBeInstanceOf(ProtocolError);
    expect(rejectionFor(frameOf({ ...cancel, input: { bookId: randomUUID(), taskIntentId: 'not-a-uuid' } }))).toBeInstanceOf(ProtocolError);
    expect(rejectionFor(frameOf({ ...startWhenOnline, input: { ...startWhenOnline.input, planEnvelopeDigest: 'b'.repeat(63) } }))).toBeInstanceOf(ProtocolError);
  });

  it('accepts 取消任务 by the Task Intent within the route\'s Book, and nothing more (Issue #422)', () => {
    const cancel = { id: randomUUID(), op: 'cancelBaselineAnalysisRun', input: { bookId: randomUUID(), taskIntentId: randomUUID() } };
    expect(decodeRequest(frameOf(cancel))).toEqual(cancel);
    expect(rejectionFor(frameOf({ ...cancel, input: { ...cancel.input, runRecordId: randomUUID() } }))).toBeInstanceOf(ProtocolError);
    expect(rejectionFor(frameOf({ ...cancel, input: { bookId: randomUUID(), taskIntentId: 'not-a-uuid' } }))).toBeInstanceOf(ProtocolError);
    expect(rejectionFor(frameOf({ ...cancel, input: { taskIntentId: randomUUID() } }))).toBeInstanceOf(ProtocolError);
  });

  it('accepts 更新计划 with the version read and what the plan leaves out, each a short identity once (Issue #419)', () => {
    const edit = {
      id: randomUUID(),
      op: 'editBaselineAnalysisPlan',
      input: { bookId: randomUUID(), taskIntentId: randomUUID(), planEnvelopeDigest: 'a'.repeat(64), removedSteps: ['assurance-sampling'], disallowedAdaptations: [] },
    };
    expect(decodeRequest(frameOf(edit))).toEqual(edit);
    // The frame carries identities only; which of them a plan can leave out is the ledger's to decide.
    expect(decodeRequest(frameOf({ ...edit, input: { ...edit.input, removedSteps: ['units'] } }))).toMatchObject({ op: 'editBaselineAnalysisPlan' });
    for (const input of [
      { ...edit.input, planEnvelopeDigest: 'A'.repeat(64) },
      { ...edit.input, removedSteps: 'assurance-sampling' },
      { ...edit.input, removedSteps: ['assurance-sampling', 'assurance-sampling'] },
      { ...edit.input, disallowedAdaptations: ['Safe Retry'] },
      { ...edit.input, disallowedAdaptations: Array.from({ length: 9 }, (_, index) => `item-${'x'.repeat(index + 1)}`) },
      { ...edit.input, runRecordId: randomUUID() },
      { bookId: edit.input.bookId, taskIntentId: edit.input.taskIntentId, planEnvelopeDigest: edit.input.planEnvelopeDigest, removedSteps: [] },
      // 先问你 (Issue #422, S76d) is a list of identities too, when it is named.
      { ...edit.input, askFirstAdaptations: 'safe-retry' },
      { ...edit.input, askFirstAdaptations: ['safe-retry', 'safe-retry'] },
      // 设置上限… (Issue #51, S16a): a whole count of tokens from one up, or `null`; nothing else.
      { ...edit.input, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 0 } },
      { ...edit.input, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 1.5 } },
      { ...edit.input, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 1_000_000_000_000 } },
      { ...edit.input, runBudgetCeiling: { kind: 'usd', maxTotalTokens: 5000 } },
      { ...edit.input, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 5000, currency: 'CNY' } },
      { ...edit.input, runBudgetCeiling: 'unset' },
      { ...edit.input, runBudgetCeiling: 5000 },
    ]) {
      expect(rejectionFor(frameOf({ ...edit, input }))).toBeInstanceOf(ProtocolError);
    }
    const asked = { ...edit, input: { ...edit.input, askFirstAdaptations: ['safe-retry'] } };
    expect(decodeRequest(frameOf(asked))).toEqual(asked);
    const bounded = { ...edit, input: { ...edit.input, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 5000 } } };
    expect(decodeRequest(frameOf(bounded))).toEqual(bounded);
    const unbounded = { ...edit, input: { ...edit.input, runBudgetCeiling: null } };
    expect(decodeRequest(frameOf(unbounded))).toEqual(unbounded);
  });

  it('accepts 提交回答 with the question, one option and a note or none, and refuses anything else (Issue #422, S76d)', () => {
    const answer = {
      id: randomUUID(),
      op: 'answerBaselineAnalysisClarification',
      input: { bookId: randomUUID(), taskIntentId: randomUUID(), requestId: randomUUID(), optionId: 'retry', note: null },
    };
    expect(decodeRequest(frameOf(answer))).toEqual(answer);
    const noted = { ...answer, input: { ...answer.input, optionId: 'record-gap', note: '先看看服务状态' } };
    expect(decodeRequest(frameOf(noted))).toEqual(noted);
    for (const input of [
      { ...answer.input, optionId: 'maybe' },
      { ...answer.input, requestId: 'not-a-uuid' },
      { ...answer.input, note: 'x'.repeat(501) },
      { ...answer.input, note: 7 },
      { bookId: answer.input.bookId, taskIntentId: answer.input.taskIntentId, requestId: answer.input.requestId, optionId: 'retry' },
      { ...answer.input, runRecordId: randomUUID() },
    ]) {
      expect(rejectionFor(frameOf({ ...answer, input }))).toBeInstanceOf(ProtocolError);
    }
  });

  it('accepts 暂停 and 续行 by the Task Intent within the route\'s Book, and nothing more (Issue #422, S76b)', () => {
    for (const op of ['pauseBaselineAnalysisRun', 'resumeBaselineAnalysisRun']) {
      const request = { id: randomUUID(), op, input: { bookId: randomUUID(), taskIntentId: randomUUID() } };
      expect(decodeRequest(frameOf(request))).toEqual(request);
      expect(rejectionFor(frameOf({ ...request, input: { ...request.input, runRecordId: randomUUID() } }))).toBeInstanceOf(ProtocolError);
      expect(rejectionFor(frameOf({ ...request, input: { bookId: randomUUID(), taskIntentId: 'not-a-uuid' } }))).toBeInstanceOf(ProtocolError);
      expect(rejectionFor(frameOf({ ...request, input: { taskIntentId: randomUUID() } }))).toBeInstanceOf(ProtocolError);
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

  it('accepts the two 交付物 operations with their exact inputs, 发稿范围 and 依据 at their bounds however padded', () => {
    const bookId = randomUUID();
    const milestoneId = randomUUID();
    const inputs: ReadonlyArray<{ op: string; input: Record<string, unknown> }> = [
      { op: 'inspectDeliverables', input: { bookId } },
      { op: 'designatePublicationVersion', input: { bookId, milestoneId, scope: '纸质版首印', basis: '三审通过，社领导同意' } },
      {
        op: 'designatePublicationVersion',
        input: { bookId, milestoneId, scope: `  ${'范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS)}\n`, basis: '据'.repeat(MAX_PUBLICATION_BASIS_CHARACTERS) },
      },
      // Characters outside the Basic Multilingual Plane count once each, as the store counts them.
      { op: 'designatePublicationVersion', input: { bookId, milestoneId, scope: '𠀀'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS), basis: '𠀀'.repeat(MAX_PUBLICATION_BASIS_CHARACTERS) } },
    ];
    for (const { op, input } of inputs) {
      const request = { id: randomUUID(), op, input };
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
  });

  it('accepts the 生产文档 read and commands with a house type, a material, a document and a delivery by their identities', () => {
    const bookId = randomUUID();
    const delivery = { bookId, documentId: randomUUID(), version: { kind: 'saved', revisionId: randomUUID() } };
    const inputs: ReadonlyArray<{ op: string; input: Record<string, unknown> }> = [
      { op: 'inspectProductionDocuments', input: { bookId } },
      { op: 'createProductionDocument', input: { bookId, typeId: 'news-release', sourceVersionId: randomUUID() } },
      { op: 'decideProductionDocumentType', input: { bookId, typeId: 'marketing-points', notForThisBook: true } },
      { op: 'decideProductionDocumentType', input: { bookId, typeId: 'promotion-article', notForThisBook: false } },
      { op: 'saveProductionDocumentVersion', input: { bookId, documentId: randomUUID(), branchId: randomUUID() } },
      // Issue #415 (S66b): 交付 to a recipient from the house's list or in the editor's own words, with a note or none.
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'publicity', custom: null }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'external-media', custom: null }, note: '发布会前一周。' } },
      // The current text, bound to the working digest the form read (DELIV-003).
      {
        op: 'recordProductionDocumentDelivery',
        input: { ...delivery, version: { kind: 'current', workingDigest: 'a'.repeat(64) }, recipient: { kind: 'other', custom: null }, note: null },
      },
      {
        op: 'recordProductionDocumentDelivery',
        input: { ...delivery, recipient: { kind: 'custom', custom: '𠀀'.repeat(MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS) },
          note: '𠀀'.repeat(MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS) },
      },
    ];
    for (const { op, input } of inputs) {
      const request = { id: randomUUID(), op, input };
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
  });

  it('rejects a 生产文档 read or command whose type, identities, decision, recipient, note or key set is wrong', () => {
    const id = randomUUID();
    const bookId = randomUUID();
    const create = { bookId, typeId: 'news-release', sourceVersionId: randomUUID() };
    const delivery = { bookId, documentId: randomUUID(), version: { kind: 'saved', revisionId: randomUUID() } };
    const refused: ReadonlyArray<{ op: string; input: unknown }> = [
      { op: 'createProductionDocument', input: { ...create, typeId: '' } },
      { op: 'createProductionDocument', input: { ...create, typeId: 'News Release' } },
      { op: 'createProductionDocument', input: { ...create, typeId: 'x'.repeat(65) } },
      { op: 'createProductionDocument', input: { ...create, sourceVersionId: 'latest' } },
      { op: 'createProductionDocument', input: { typeId: 'news-release', sourceVersionId: create.sourceVersionId } },
      { op: 'createProductionDocument', input: { ...create, text: '一段文字' } },
      { op: 'decideProductionDocumentType', input: { bookId, typeId: 'news-release', notForThisBook: 'true' } },
      { op: 'decideProductionDocumentType', input: { bookId, typeId: 'news-release' } },
      { op: 'saveProductionDocumentVersion', input: { bookId, documentId: 'not-a-uuid', branchId: randomUUID() } },
      { op: 'saveProductionDocumentVersion', input: { bookId, documentId: randomUUID() } },
      { op: 'inspectProductionDocuments', input: {} },
      { op: 'inspectProductionDocuments', input: { bookId: 'current' } },
      { op: 'inspectProductionDocuments', input: { bookId, typeId: 'news-release' } },
      // A delivery names one recipient kind; only 自行输入 carries words, within their bound, and a note stays in its own.
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'press', custom: null }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'publicity', custom: '宣传部' }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'custom', custom: null }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'custom', custom: '   ' }, note: null } },
      {
        op: 'recordProductionDocumentDelivery',
        input: { ...delivery, recipient: { kind: 'custom', custom: '字'.repeat(MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS + 1) }, note: null },
      },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'publicity' }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: 'publicity', note: null } },
      {
        op: 'recordProductionDocumentDelivery',
        input: { ...delivery, recipient: { kind: 'publicity', custom: null }, note: '字'.repeat(MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS + 1) },
      },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'publicity', custom: null } } },
      // A version is a saved one by its revision or the current text by its digest, and nothing else.
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, version: { kind: 'saved', revisionId: 'latest' }, recipient: { kind: 'publicity', custom: null }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, version: { kind: 'current' }, recipient: { kind: 'publicity', custom: null }, note: null } },
      {
        op: 'recordProductionDocumentDelivery',
        input: { ...delivery, version: { kind: 'current', workingDigest: 'A'.repeat(64) }, recipient: { kind: 'publicity', custom: null }, note: null },
      },
      {
        op: 'recordProductionDocumentDelivery',
        input: { ...delivery, version: { kind: 'current', workingDigest: 'a'.repeat(64), revisionId: randomUUID() }, recipient: { kind: 'publicity', custom: null }, note: null },
      },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, version: { kind: 'latest' }, recipient: { kind: 'publicity', custom: null }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, version: randomUUID(), recipient: { kind: 'publicity', custom: null }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { bookId, documentId: randomUUID(), revisionId: randomUUID(), recipient: { kind: 'publicity', custom: null }, note: null } },
      { op: 'recordProductionDocumentDelivery', input: { ...delivery, recipient: { kind: 'publicity', custom: null }, note: null, sent: true } },
    ];
    for (const { op, input } of refused) {
      expect(rejectionFor(frameOf({ id, op, input })).requestId).toBe(id);
    }
  });

  it('accepts 待我处理, which reads across every Book and names none', () => {
    const request = { id: randomUUID(), op: 'inspectGlobalAttention', input: {} };
    expect(decodeRequest(frameOf(request))).toEqual(request);
  });

  it('accepts the Task Drawer read for each of the three kinds, naming the Task or the current one', () => {
    const bookId = randomUUID();
    const inputs: ReadonlyArray<Record<string, unknown>> = [
      { bookId, kind: 'fixed-task', ref: null },
      { bookId, kind: 'fixed-task', ref: randomUUID() },
      { bookId, kind: 'baseline-analysis', ref: null },
      { bookId, kind: 'baseline-analysis', ref: randomUUID() },
      { bookId, kind: 'review-run', ref: randomUUID() },
    ];
    for (const input of inputs) {
      const request = { id: randomUUID(), op: 'inspectTaskPlan', input };
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
  });

  it('accepts the four 导出 operations with their exact inputs (Issue #413)', () => {
    const bookId = randomUUID();
    const options = { includeAnnotations: true, includeSuggestions: true, includeEditorNotes: false };
    const milestone = { kind: 'milestone', milestoneId: randomUUID() };
    const destination = process.platform === 'win32' ? 'C:\\导出\\稿件.docx' : '/导出/稿件.docx';
    const inputs: ReadonlyArray<{ op: string; input: Record<string, unknown> }> = [
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'current' }, options } },
      { op: 'reviewManuscriptExport', input: { bookId, target: milestone, options: { ...options, includeEditorNotes: true } } },
      { op: 'prepareManuscriptExport', input: { bookId, revisionId: randomUUID(), target: milestone, options, reviewDigest: 'd'.repeat(64), destination } },
      {
        op: 'prepareManuscriptExport',
        input: { bookId, revisionId: randomUUID(), target: { kind: 'current' }, options, reviewDigest: 'e'.repeat(64),
          destination: `${destination.slice(0, -'稿件.docx'.length)}${'径'.repeat(MAX_EXPORT_DESTINATION_CODE_UNITS - destination.length)}.docx`.slice(0, MAX_EXPORT_DESTINATION_CODE_UNITS) },
      },
      { op: 'approveManuscriptExport', input: { bookId, preparationId: randomUUID() } },
      { op: 'inspectManuscriptExportReceipt', input: { bookId, preparationId: randomUUID() } },
      // Issue #500 (S64b): the format, named or not, and the main process's staging step for a PDF.
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'current' }, options, format: 'pdf' } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'current' }, options, format: 'markdown' } },
      // Issue #500 (S64b part 2): one recorded version of a 审阅报告, in any of the three formats.
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'report', reportId: randomUUID() }, options, format: 'markdown' } },
      { op: 'prepareManuscriptExport', input: { bookId, revisionId: randomUUID(), target: milestone, options, reviewDigest: 'f'.repeat(64), destination, format: 'docx' } },
      { op: 'stageManuscriptExport', input: { bookId, preparationId: randomUUID() } },
      // Issue #415 (S66b): one saved version of a Production Document, named by the document and its revision.
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'document', documentId: randomUUID(), revisionId: randomUUID() }, options } },
      {
        op: 'prepareManuscriptExport',
        input: { bookId, revisionId: randomUUID(), target: { kind: 'document', documentId: randomUUID(), revisionId: randomUUID() }, options,
          reviewDigest: 'c'.repeat(64), destination },
      },
    ];
    for (const { op, input } of inputs) {
      const request = { id: randomUUID(), op, input };
      expect(decodeRequest(frameOf(request))).toEqual(request);
    }
  });

  it('accepts the three 稿件冲突 operations with their exact inputs, and a draft of every resolution at its bounds', () => {
    const conflict = { manuscriptId: randomUUID(), branchId: randomUUID(), markId: randomUUID() };
    const basisDigest = 'b'.repeat(64);
    const units = [
      { resolution: null, text: null },
      { resolution: 'unresolved', text: null },
      { resolution: 'current', text: null },
      { resolution: 'proposed', text: null },
      { resolution: 'both-current-first', text: null },
      { resolution: 'both-proposed-first', text: null },
      { resolution: 'edited', text: '' },
      { resolution: 'edited', text: '合'.repeat(MAX_MARK_BODY_CODE_UNITS) },
    ];
    const inputs: ReadonlyArray<{ op: string; input: Record<string, unknown> }> = [
      { op: 'inspectProposalConflict', input: conflict },
      { op: 'saveProposalConflictDraft', input: { ...conflict, basisDigest, units } },
      { op: 'saveProposalConflictDraft', input: { ...conflict, basisDigest, units: Array.from({ length: MAX_PROPOSAL_CONFLICT_UNITS }, () => ({ resolution: null, text: null })) } },
      { op: 'resolveProposalConflict', input: { ...conflict, basisDigest, outcome: 'keep-current', draftOrdinal: null } },
      { op: 'resolveProposalConflict', input: { ...conflict, basisDigest, outcome: 'defer', draftOrdinal: null } },
      { op: 'resolveProposalConflict', input: { ...conflict, basisDigest, outcome: 'new-version', draftOrdinal: 7 } },
    ];
    for (const { op, input } of inputs) {
      const request = { id: randomUUID(), op, input };
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

  it('rejects an import review without a text-box choice, or with one that is not retain or merge', () => {
    const id = randomUUID();
    const input = {
      draftId: randomUUID(),
      expectedDraftVersion: 2,
      target: { kind: 'existing-book', bookId: randomUUID(), relationship: 'first-manuscript' },
      acceptDegradation: true,
    };
    // The protocol-38 key set, with no choice at all, is refused rather than read as a default.
    expect(rejectionFor(frameOf({ id, op: 'prepareNewBookReview', input })).requestId).toBe(id);
    for (const textBoxDisposition of [null, '', 'keep', 'Retain', true]) {
      expect(rejectionFor(frameOf({ id, op: 'prepareNewBookReview', input: { ...input, textBoxDisposition } })).requestId).toBe(id);
    }
    expect(rejectionFor(frameOf({
      id, op: 'prepareNewBookReview', input: { ...input, textBoxDisposition: 'retain', extra: 1 },
    })).requestId).toBe(id);
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
    // `redoOf` names a Run by its record id, and nothing else joins it.
    for (const redoOf of ['not-a-uuid', 7, '', { runRecordId: randomUUID() }]) {
      expect(rejectionFor(frameOf({ id, op: 'prepareBaselineAnalysis', input: { bookId, goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false, redoOf } })).requestId).toBe(id);
    }
    expect(rejectionFor(frameOf({ id, op: 'prepareBaselineAnalysis', input: { bookId, goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false, redoOf: null, taskIntentId: randomUUID() } })).requestId).toBe(id);
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

  it('rejects a 交付物 read or 设为发稿版本 whose identities, key set, 发稿范围 or 依据 are wrong', () => {
    const id = randomUUID();
    const bookId = randomUUID();
    const designation = { bookId, milestoneId: randomUUID(), scope: '纸质版首印', basis: '三审通过' };
    const refused: ReadonlyArray<{ op: string; input: unknown }> = [
      { op: 'inspectDeliverables', input: {} },
      { op: 'inspectDeliverables', input: { bookId: 'not-a-uuid' } },
      { op: 'inspectDeliverables', input: { bookId, milestoneId: randomUUID() } },
      // The Book is the route's; the milestone is named, never "the latest".
      { op: 'designatePublicationVersion', input: { ...designation, milestoneId: null } },
      { op: 'designatePublicationVersion', input: { ...designation, milestoneId: 'latest' } },
      { op: 'designatePublicationVersion', input: { milestoneId: designation.milestoneId, scope: '纸质版首印', basis: '三审通过' } },
      { op: 'designatePublicationVersion', input: { ...designation, revisionId: randomUUID() } },
      // Both are required, and bounded once trimmed.
      { op: 'designatePublicationVersion', input: { ...designation, scope: '' } },
      { op: 'designatePublicationVersion', input: { ...designation, scope: ' \n\t ' } },
      { op: 'designatePublicationVersion', input: { ...designation, scope: '范'.repeat(MAX_PUBLICATION_SCOPE_CHARACTERS + 1) } },
      { op: 'designatePublicationVersion', input: { ...designation, scope: '\uD800' } },
      { op: 'designatePublicationVersion', input: { ...designation, basis: '' } },
      { op: 'designatePublicationVersion', input: { ...designation, basis: '据'.repeat(MAX_PUBLICATION_BASIS_CHARACTERS + 1) } },
      { op: 'designatePublicationVersion', input: { ...designation, basis: null } },
      { op: 'designatePublicationVersion', input: { ...designation, scope: 42 } },
    ];
    for (const { op, input } of refused) {
      expect(rejectionFor(frameOf({ id, op, input })).requestId).toBe(id);
    }
  });

  it('rejects a Task Drawer read whose kind, Task or key set is wrong, and a review that is not named', () => {
    const id = randomUUID();
    const bookId = randomUUID();
    const refused: ReadonlyArray<unknown> = [
      {},
      { bookId, kind: 'fixed-task' },
      { kind: 'fixed-task', ref: null },
      { bookId: 'not-a-uuid', kind: 'fixed-task', ref: null },
      // A kind with no ledger of its own has no plan to read yet (S72 D1).
      { bookId, kind: 'writing', ref: null },
      { bookId, kind: 'selection-task', ref: null },
      { bookId, kind: null, ref: null },
      { bookId, kind: 'baseline-analysis', ref: 'latest' },
      { bookId, kind: 'baseline-analysis', ref: 42 },
      // A Review Run is always named: there is no "current" review.
      { bookId, kind: 'review-run', ref: null },
      { bookId, kind: 'review-run', ref: randomUUID(), findingsAfterOrdinal: 1 },
    ];
    for (const input of refused) {
      expect(rejectionFor(frameOf({ id, op: 'inspectTaskPlan', input })).requestId).toBe(id);
    }
  });

  it('rejects a 导出 operation whose version, options, digest or destination is not exactly one it can name (Issue #413)', () => {
    const id = randomUUID();
    const bookId = randomUUID();
    const options = { includeAnnotations: true, includeSuggestions: true, includeEditorNotes: false };
    const destination = process.platform === 'win32' ? 'C:\\导出\\稿件.docx' : '/导出/稿件.docx';
    const preparation = { bookId, revisionId: randomUUID(), target: { kind: 'current' }, options, reviewDigest: 'a'.repeat(64), destination };
    const refused: ReadonlyArray<{ op: string; input: unknown }> = [
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'latest' }, options } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'current', milestoneId: randomUUID() }, options } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'milestone', milestoneId: 'first' }, options } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'report', reportId: 'latest' }, options } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'report', reportId: randomUUID(), version: 1 }, options } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'report' }, options } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'document', documentId: randomUUID() }, options } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'document', documentId: randomUUID(), revisionId: '版本 2' }, options } },
      {
        op: 'reviewManuscriptExport',
        input: { bookId, target: { kind: 'document', documentId: randomUUID(), revisionId: randomUUID(), typeId: 'news-release' }, options },
      },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'current' }, options: { ...options, includeHighlights: true } } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'current' }, options: { ...options, includeEditorNotes: 'yes' } } },
      { op: 'reviewManuscriptExport', input: { target: { kind: 'current' }, options } },
      // The renderer never names a path: a relative one, an overlong one, or none is refused.
      { op: 'prepareManuscriptExport', input: { ...preparation, destination: '稿件.docx' } },
      { op: 'prepareManuscriptExport', input: { ...preparation, destination: `${destination}${'径'.repeat(MAX_EXPORT_DESTINATION_CODE_UNITS)}` } },
      { op: 'prepareManuscriptExport', input: { ...preparation, destination: null } },
      { op: 'prepareManuscriptExport', input: { ...preparation, reviewDigest: 'A'.repeat(64) } },
      { op: 'prepareManuscriptExport', input: { ...preparation, revisionId: 'current' } },
      // Issue #500: a format is optional, and only one of the three.
      { op: 'prepareManuscriptExport', input: { ...preparation, format: 'odt' } },
      { op: 'reviewManuscriptExport', input: { bookId, target: { kind: 'current' }, options, format: 'PDF' } },
      { op: 'stageManuscriptExport', input: { bookId, preparationId: 'last' } },
      { op: 'approveManuscriptExport', input: { bookId, preparationId: 'last' } },
      { op: 'approveManuscriptExport', input: { bookId, preparationId: randomUUID(), destination } },
      { op: 'inspectManuscriptExportReceipt', input: { preparationId: randomUUID() } },
    ];
    for (const { op, input } of refused) {
      expect(rejectionFor(frameOf({ id, op, input })).requestId).toBe(id);
    }
  });

  it('rejects a 稿件冲突 operation whose identities, basis, key set, draft or outcome are wrong', () => {
    const id = randomUUID();
    const conflict = { manuscriptId: randomUUID(), branchId: randomUUID(), markId: randomUUID() };
    const basisDigest = 'c'.repeat(64);
    const draft = { ...conflict, basisDigest, units: [{ resolution: 'current', text: null }] };
    const resolution = { ...conflict, basisDigest, outcome: 'keep-current', draftOrdinal: null };
    const refused: ReadonlyArray<{ op: string; input: unknown }> = [
      { op: 'inspectProposalConflict', input: { manuscriptId: conflict.manuscriptId, branchId: conflict.branchId } },
      { op: 'inspectProposalConflict', input: { ...conflict, markId: 'not-a-mark' } },
      { op: 'inspectProposalConflict', input: { ...conflict, windowStartBlockId: `blk_${'0'.repeat(24)}` } },
      // A draft is bound to a basis digest and holds one entry per unit, each exactly a resolution and its words.
      { op: 'saveProposalConflictDraft', input: { ...draft, basisDigest: 'C'.repeat(64) } },
      { op: 'saveProposalConflictDraft', input: { ...draft, basisDigest: 'c'.repeat(63) } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [] } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: Array.from({ length: MAX_PROPOSAL_CONFLICT_UNITS + 1 }, () => ({ resolution: null, text: null })) } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [{ resolution: 'guessed', text: null }] } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [{ resolution: 'current', text: '多余' }] } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [{ resolution: null, text: '' }] } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [{ resolution: 'edited', text: null }] } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [{ resolution: 'edited', text: '合'.repeat(MAX_MARK_BODY_CODE_UNITS + 1) }] } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [{ resolution: 'edited', text: '\uD800' }] } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [{ resolution: 'current' }] } },
      { op: 'saveProposalConflictDraft', input: { ...draft, units: [{ resolution: 'current', text: null, extra: 1 }] } },
      // An outcome is one of three; only a new version names the draft it saves.
      { op: 'resolveProposalConflict', input: { ...resolution, outcome: 'auto-resolve-all' } },
      { op: 'resolveProposalConflict', input: { ...resolution, draftOrdinal: 1 } },
      { op: 'resolveProposalConflict', input: { ...resolution, outcome: 'defer', draftOrdinal: 1 } },
      { op: 'resolveProposalConflict', input: { ...resolution, outcome: 'new-version' } },
      { op: 'resolveProposalConflict', input: { ...resolution, outcome: 'new-version', draftOrdinal: 0 } },
      { op: 'resolveProposalConflict', input: { ...resolution, outcome: 'new-version', draftOrdinal: 1.5 } },
      { op: 'resolveProposalConflict', input: { ...conflict, basisDigest, outcome: 'defer' } },
      { op: 'resolveProposalConflict', input: { ...resolution, basisDigest: null } },
    ];
    for (const { op, input } of refused) {
      expect(rejectionFor(frameOf({ id, op, input })).requestId).toBe(id);
    }
  });

  it('rejects a 待我处理 read that names a Book, a group, a filter or anything else', () => {
    const id = randomUUID();
    const refused: ReadonlyArray<unknown> = [
      // It reads across every Book: a Book, a group or a filter would make it a different read.
      { bookId: randomUUID() },
      { group: 'exceptions' },
      { since: '2026-09-01T00:00:00.000Z' },
      { claim: true },
      null,
      [],
      'all',
    ];
    for (const input of refused) {
      expect(rejectionFor(frameOf({ id, op: 'inspectGlobalAttention', input })).requestId).toBe(id);
    }
    // The input is required, as for every operation.
    expect(rejectionFor(frameOf({ id, op: 'inspectGlobalAttention' })).requestId).toBe(id);
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
