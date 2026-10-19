import { longSettledAnalysis } from '../support/long-baseline-analysis.js';
import { analysisOverviewText, baselineAnalysisOutbound, serializedBytes } from '../../src/service/analysis/baseline-analysis-wire.js';
import { manifestDigestIsExact } from '../../src/service/analysis/coverage-manifest.js';
import { baselineAnalysisWire } from '../../src/service/analysis/baseline-analysis-wire.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BASELINE_ANALYSIS_TASK_GOAL, MAX_FRAME_BYTES } from '../../src/shared/protocol.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { writeSyntheticDocx } from '../support/synthetic-docx.js';

// Observed bug #988: a generated long Book must prepare without the frame guard replacing its answer.
it('keeps the prepared long-book reply below the frame budget', async () => {
  const roots = await createServiceTestRoots('ai7-analysis-wire-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false, baselineAnalysisRoute: null,
  });
  try {
    const path = join(roots.inputRoot, 'generated-long.docx');
    await writeSyntheticDocx(path, { paragraphs: Array.from({ length: 6_000 }, (_, index) => ({
      text: `生成段落${index}：${'甲乙丙丁戊己庚辛壬癸'.repeat(7)}`,
    })) });
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '生成长书' }, false);
    const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
      reviewDigest: review.reviewDigest!, commitId: randomUUID() });
    const connection = store.saveModelServiceConnection('generated local setup', null, 'needs-attention', 'opencode-go');
    const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0], credentialReference: connection.credentialReference };
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding);
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy, live: { ...binding, scope: 'ordinary-production', runBudgetCeiling: 'unset' } });
    await store.installEditorialWorkspaceProfile(commit.bookId);
    await store.enableEditorialWorkspaceProfile(commit.bookId);
    let work = store.createBaselineAnalysisPreparationWork(commit.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
    while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
    const full = work.projection!;
    expect(full.coverageManifest!.totalBlocks).toBeGreaterThanOrEqual(6_000);
    expect(full.coverageManifest!.units.length).toBeGreaterThanOrEqual(330);
    const members = [];
    let cursor: number | null = 0;
    do {
      const page = store.getCoverageManifestUnits({ bookId: commit.bookId, taskIntentId: full.taskIntent!.taskIntentId, afterOrdinal: cursor });
      expect(page.manifestDigest).toBe(full.coverageManifest!.digest);
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
      members.push(...page.units);
      cursor = page.next;
    } while (cursor !== null);
    expect(members).toEqual(full.coverageManifest!.units);
    expect(Buffer.byteLength(JSON.stringify({ id: 1, ok: true, op: 'inspectBaselineAnalysis', result: baselineAnalysisWire(full) })))
      .toBeLessThanOrEqual(MAX_FRAME_BYTES - 64 * 1024);
    expect(manifestDigestIsExact({ ...full.coverageManifest!, units: members })).toBe(true);
    const ops = ['inspectBaselineAnalysis', 'authorizeBaselineAnalysis', 'startBaselineAnalysisWhenOnline',
      'cancelWaitingBaselineAnalysis', 'cancelBaselineAnalysisRun', 'pauseBaselineAnalysisRun', 'resumeBaselineAnalysisRun',
      'editBaselineAnalysisPlan', 'answerBaselineAnalysisClarification', 'quickStartBaselineAnalysis', 'pollServiceJob'];
    for (const [state, projection] of Object.entries({ prepared: full, settled: longSettledAnalysis(full), history: longSettledAnalysis(full, 12) })) {
      const sizes = ops.map((op) => {
        const result = op === 'pollServiceJob' ? { kind: 'baseline-analysis-preparation', result: projection }
          : op === 'quickStartBaselineAnalysis' ? { outcome: 'fell-back', reasons: [], projection } : projection;
        const response = { id: '00000000-0000-4000-8000-000000000000', ok: true, op, result };
        const after = serializedBytes(baselineAnalysisOutbound(response));
        expect(after).toBeLessThanOrEqual(MAX_FRAME_BYTES - 64 * 1024);
        return { op, before: serializedBytes(response), after };
      });
      console.info('ANALYSIS_REPLY_BYTES', state, JSON.stringify(sizes));
    }
    // Inject only the synthetic settled result at the ledger read seam. Import, preparation,
    // manifest storage, paging ownership and outbound serialization remain the real implementations.
    const settled = longSettledAnalysis(full);
    const revision = settled.resultSetRevision!;
    const inspect = vi.spyOn(store.baselineAnalysisLedger, 'inspect').mockImplementation(() => ({ ...settled,
      inspectedRevision: { revision, current: true, readOnly: true } }));
    try {
      const detailUnits = [];
      let afterOrdinal: number | null = 0;
      do {
        const page = store.getAnalysisRevisionUnits({ bookId: full.bookId, revisionId: revision.revisionId, afterOrdinal });
        expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
        detailUnits.push(...page.units);
        afterOrdinal = page.next;
      } while (afterOrdinal !== null);
      expect(detailUnits).toEqual(revision.units);
      const text = [];
      let afterIndex: number | null = 0;
      do {
        const page = store.getAnalysisRevisionOverview({ bookId: full.bookId, revisionId: revision.revisionId, afterIndex });
        expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
        text.push(page.text);
        afterIndex = page.next;
      } while (afterIndex !== null);
      expect(text.join('')).toBe(analysisOverviewText(revision));
      const rows = [];
      afterOrdinal = 0;
      do {
        const page = store.getAnalysisRunReportRows({ bookId: full.bookId, taskIntentId: full.taskIntent!.taskIntentId, afterOrdinal });
        expect(serializedBytes(page)).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
        rows.push(...page.rows);
        afterOrdinal = page.next;
      } while (afterOrdinal !== null);
      expect(rows).toEqual(settled.taskOutcome!.report!.unitRows);
    } finally { inspect.mockRestore(); }
  } finally {
    store.close();
    await roots.dispose();
  }
}, 60_000);
