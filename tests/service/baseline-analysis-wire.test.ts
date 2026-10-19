import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, it } from 'vitest';
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
    expect(Buffer.byteLength(JSON.stringify({ id: 1, ok: true, op: 'inspectBaselineAnalysis', result: full })))
      .toBeLessThanOrEqual(MAX_FRAME_BYTES - 64 * 1024);
  } finally {
    store.close();
    await roots.dispose();
  }
}, 60_000);
