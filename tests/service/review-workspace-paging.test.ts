import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { ReviewRunDriver, type ReviewRunExecutionOwner } from '../../src/service/review/review-run-driver.js';
import { serializedBytes } from '../../src/service/analysis/baseline-analysis-wire.js';
import { reviewWorkspaceWire, taskPlanOutbound } from '../../src/service/task-plan.js';
import { encodeServiceResponse } from '../../src/service/request-frames.js';
import { appendTaskPlanPage } from '../../src/renderer/analysis-paging.js';
import { MAX_FRAME_BYTES, type ReviewFindingProjection, type ReviewWorkspaceProjection, type ServiceResponse } from '../../src/shared/protocol.js';
import type { LocalCheckOptions } from '../../src/shared/protocol/procedures.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book } from '../support/sample1-baseline.js';

// #1592: exact admitted sample1 with a tester's edit — 1,024 ellipsis variants — checked provider-free by 本地文字检查.
const OPTIONS: LocalCheckOptions = { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [] };
const REPLY_BUDGET = MAX_FRAME_BYTES - 72 * 1024;
const NO_FILTERS = { categoryId: null, severity: null, status: null, chapterBlockId: null };
const ID = '00000000-0000-4000-8000-000000000000';
let roots: ServiceTestRoots;
let store: EditorialStore;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-review-paging-'); });
afterEach(async () => { store?.close(); await roots.dispose(); });
const noModel = (): ReviewRunExecutionOwner => ({ get busy(): boolean { throw new Error('local stage consulted model governor'); },
  admitAndDispatch() { throw new Error('local stage dispatched a model'); }, whenPlaceFree() { throw new Error('local stage requested model permit'); },
  whenDone() { throw new Error('local stage awaited a model'); } });

function crossing(workspace: ReviewWorkspaceProjection): ReviewWorkspaceProjection {
  const wire = taskPlanOutbound(workspace) as ReviewWorkspaceProjection;
  expect(serializedBytes(wire)).toBeLessThanOrEqual(REPLY_BUDGET);
  expect(encodeServiceResponse({ id: ID, ok: true, op: 'inspectReviewWorkspace', result: wire } as ServiceResponse).length).toBeLessThanOrEqual(MAX_FRAME_BYTES + 4);
  return wire;
}

it('reads a settled Run of 1,024 findings and its report within the reply budget, every page exactly once (#1592)', async () => {
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const book = await importSample1Book(store, roots.codeRoot, '审阅分页公开样书');
  const paragraphs = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.filter((block) => block.kind === 'paragraph').slice(0, 32);
  for (const target of [...paragraphs, ...paragraphs]) {
    const window = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: target.blockId });
    const block = window.blocks.find((entry) => entry.blockId === target.blockId)!;
    store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
      blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
      fromGrapheme: 0, toGrapheme: 0, insertText: '停住…又望。'.repeat(16) });
  }
  let work = store.createReviewRunPreparationWork(book.bookId, ['local-text-check'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null },
    policy, null, [], null, null, null, OPTIONS);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const runId = work.projection!.run!.reviewRunId;
  store.authorizeReviewRun(book.bookId, runId, store.inspectTaskPlan({ bookId: book.bookId, kind: 'review-run', ref: runId }).start.categoryDigests);
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, noModel());
  await driver.drive(runId); await driver.dispose();

  const whole = store.inspectReviewWorkspace(book.bookId, runId);
  expect(whole.run!.state).toBe('settled');
  expect(whole.run!.findingsTotal).toBe(1024);
  expect(whole.run!.report).not.toBeNull();
  expect(serializedBytes(whole)).toBeGreaterThan(REPLY_BUDGET);

  // The first answer: a first page of findings and every growing list of the report paged, with its facts.
  let wire = crossing(whole);
  expect(wire.run!.findings.length).toBeGreaterThan(0);
  const paged = Object.entries(wire.listPages!).filter(([, meta]) => meta.nextOrdinal !== null).map(([path]) => path);
  expect(paged).toContain('run.report.record.findings.entries');
  for (const path of paged) {
    while (wire.listPages![path]!.nextOrdinal !== null) {
      const meta = wire.listPages![path]!;
      const page = store.getTaskPlanPage({ bookId: book.bookId, kind: 'review-run', ref: runId, path, afterOrdinal: meta.nextOrdinal!, digest: meta.digest });
      expect(encodeServiceResponse({ id: ID, ok: true, op: 'getTaskPlanPage', result: page } as ServiceResponse).length).toBeLessThanOrEqual(MAX_FRAME_BYTES + 4);
      wire = appendTaskPlanPage(wire, page);
    }
  }
  expect(wire.run!.report).toEqual(whole.run!.report);
  expect(wire.scopeOptions).toEqual(whole.scopeOptions);

  // The findings page by their own cursor; a reply that cannot hold the domain's page shortens it and says so.
  for (const budget of [REPLY_BUDGET, 192 * 1024]) {
    const findings: ReviewFindingProjection[] = [];
    let after: number | null = null;
    for (;;) {
      const answer = reviewWorkspaceWire(store.inspectReviewWorkspace(book.bookId, runId, undefined, { findingsAfterOrdinal: after, ...NO_FILTERS }), budget);
      expect(serializedBytes(answer)).toBeLessThanOrEqual(budget);
      expect(answer.run!.findings.length).toBeGreaterThan(0);
      findings.push(...answer.run!.findings);
      if (!answer.run!.findingsTruncated) break;
      after = answer.run!.findings.at(-1)!.ordinal;
    }
    expect(new Set(findings.map((finding) => finding.findingId)).size).toBe(1024);
    expect(findings).toHaveLength(1024);
    expect(findings.every((finding, index) => index === 0 || finding.ordinal > findings[index - 1]!.ordinal)).toBe(true);
    if (budget < REPLY_BUDGET) expect(reviewWorkspaceWire(whole, budget).run!.findings.length).toBeLessThan(whole.run!.findings.length);
  }

  // A report that changed between pages is refused by its digest, as a changed chapter list is.
  const stale = crossing(whole).listPages!['run.report.record.findings.entries']!;
  store.recordReviewFindingDisposition(book.bookId, runId, whole.run!.findings[0]!.findingId, '保留作者的省略号写法');
  crossing(store.generateReviewReport(book.bookId, runId));
  expect(() => store.getTaskPlanPage({ bookId: book.bookId, kind: 'review-run', ref: runId, path: 'run.report.record.findings.entries',
    afterOrdinal: stale.nextOrdinal!, digest: stale.digest })).toThrow(/审阅结果已变化/u);
}, 300_000);
