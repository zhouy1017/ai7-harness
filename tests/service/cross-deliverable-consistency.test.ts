import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy, DEVELOPER_LIVE_POLICY_BINDING } from '../../src/service/launch-policy.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { reviewCategoryEntry, reviewCategoryEntryForBook, reviewCategoryContractInput, reviewCategoryBasisStatement } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { liveKindAdmission } from '../../src/service/analysis/live-kind-admission.js';
import { reviewDeliverables, REVIEW_DELIVERABLES_ABSENT, REVIEW_DELIVERABLES_DRAFT, REVIEW_DELIVERABLE_CHANGED } from '../../src/service/production-documents.js';
import { sliceGraphemes } from '../../src/service/analysis/factual-review-contract.js';
import type { LaunchPolicyProjection, ReviewRunProjection, ReviewCategoryResultSetRevisionProjection, AdmittedProviderRule } from '../../src/shared/protocol.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

const CATEGORY = 'cross-deliverable-consistency';
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
let roots: ServiceTestRoots;
let store: EditorialStore;
let db: DatabaseSync;
let policy: LaunchPolicyProjection;
let owner: BaselineAnalysisExecutionOwner | undefined;
let driver: ReviewRunDriver | undefined;
let book: Awaited<ReturnType<typeof importSample1Book>>;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-cross-deliverable-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  book = await importSample1Book(store, roots.codeRoot, 'Cross deliverable sample1');
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  recordMissingCredentialConnection(store, 'Cross deliverable test connection');
});

afterEach(async () => {
  const stopped = driver?.dispose();
  await owner?.dispose();
  await stopped;
  owner = undefined;
  driver = undefined;
  db?.close();
  store?.close();
  await roots?.dispose();
});

function entry() { return reviewCategoryEntryForBook(reviewCategoryEntry(CATEGORY)!, db, book.bookId); }
function reading() { return reviewDeliverables(db, book.bookId); }
function document(id: string) { return store.inspectProductionDocuments(book.bookId).types.find((type) => type.document?.documentId === id)!.document!; }

async function create(typeId = 'news-release') {
  // Admit sample1 as source-only through the real import path, then create a separate Production Document.
  const staged = await store.stageSelectedManuscript(randomUUID(), join(roots.codeRoot, 'SampleBooks', 'sample1.docx'));
  const source = db.prepare('SELECT source_version_id FROM manuscript_revisions WHERE revision_id = ?').get(book.revisionId)!;
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book', bookId: book.bookId, relationship: 'source-only', reuseSourceVersionId: source.source_version_id as string });
  const commitId = randomUUID();
  const committed = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return (await store.createProductionDocument({ bookId: book.bookId, typeId, sourceVersionId: committed.sourceVersionId })).document!;
}

function edit(id: string) {
  const doc = document(id);
  const window = store.getManuscriptWindow(id, doc.branchId, null);
  const block = window.blocks[0]!;
  store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: id, branchId: doc.branchId, baseRevisionId: window.revisionId,
    blockId: block.blockId, windowStartBlockId: block.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
    fromGrapheme: 0, toGrapheme: 0, insertText: '（样本修订）' });
}

async function save(id: string) {
  edit(id);
  const doc = document(id);
  return (await store.saveProductionDocumentVersion({ bookId: book.bookId, documentId: id, branchId: doc.branchId })).document!;
}

function phase(id: string, action: 'start' | 'complete' | 'reopen' | 'skip') {
  return store.transitionProductionDocumentPhase({ bookId: book.bookId, documentId: id, phaseId: 'finalization', action,
    expectedTransitions: document(id).workflow.transitions,
    reason: action === 'reopen' || action === 'skip' ? { choice: 'custom', text: '合成回归' } : null });
}

async function finalize(id: string) { await save(id); phase(id, 'start'); phase(id, 'complete'); }
function prepare() {
  let work = store.createReviewRunPreparationWork(book.bookId, [CATEGORY], WHOLE, policy);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  return work.projection!.run!;
}
function approvals(run: ReviewRunProjection) { return run.categories.map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })); }

async function syntheticPolicy() {
  const base = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  const rule = base.providerProcessing.admittedRules!.find((candidate) => candidate.taskKinds.includes('editorial-review/style-and-format'))!;
  return { ...base, providerProcessing: { ...base.providerProcessing, admittedRules: base.providerProcessing.admittedRules!.map((candidate) => candidate === rule ? {
    ...rule, taskKinds: [...rule.taskKinds, `editorial-review/${CATEGORY}`],
    outboundDataCategories: [...rule.outboundDataCategories, 'editorial-deliverable-excerpt'], editorialDeliverablesAllowed: true,
  } as unknown as AdmittedProviderRule : candidate) } };
}

async function execution(afterFirst?: () => Promise<void>) {
  policy = await syntheticPolicy();
  const live = { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
    runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 } };
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', policy, live });
  const sent: number[] = [];
  const nativeFetch: typeof fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    const message = payload.messages.at(-1)!.content;
    const header = parseReviewCategoryUnitMessageHeader(message);
    let result: unknown;
    if (header !== null) {
      sent.push(header.ordinal);
      const blocks = message.split('\n').flatMap((line) => {
        const match = /^\[blk_[0-9a-f]{24}\] \((?:title|heading|paragraph)(?: h[1-6])?\) (.*)$/u.exec(line);
        return match === null ? [] : [match[1]!];
      });
      const quote = sliceGraphemes(blocks[0]!, 0, 20);
      result = { schema: 'ai7.editorial-review.unit-result/1', unitOrdinal: header.ordinal,
        findings: header.ordinal === 1 ? [{ quote, blockOrdinal: 1, severity: 'should', note: '合成回归：两处说法需要核对。', clauseId: reading().participants[0]!.paragraphs[0]!.ref }] : [] };
      if (header.ordinal === 1) await afterFirst?.();
    } else if (message.startsWith('保证抽样 ')) {
      result = { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(message).map((ref) => ({ ref, disposition: '成立', reason: '合成回归。' })) };
    } else result = { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] };
    return new Response(JSON.stringify({ model: live.model, choices: [{ message: { content: JSON.stringify(result), reasoning_content: '合成回归。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
  };
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
    materialGuard: (runRecordId, ledger) => store.materialGuard(runRecordId, ledger),
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: { launch: { runBudgetCeiling: live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'),
      validation: { family: 'cross-deliverable-consistency', case: 'sample1-finalized-document', delta: null } }, nativeFetch } });
  driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  return sent;
}

describe('cross-deliverable participants and revision lineage', () => {
  it('keeps the built-in entry and exact absence reason; excludes created-only drafts', async () => {
    expect(reviewCategoryEntry(CATEGORY)!.executor).toBe('unavailable');
    expect(entry().unavailableReason).toBe(REVIEW_DELIVERABLES_ABSENT);
    await create();
    expect(entry().executor).toBe('unavailable');
    expect(entry().unavailableReason).toBe(REVIEW_DELIVERABLES_DRAFT);
  });

  it('pins only finalized versions, discloses later saves and excludes withdrawn and draft documents', async () => {
    const doc = await create();
    await finalize(doc.documentId);
    const pin = reading().participants[0]!;
    await save(doc.documentId);
    const withdrawn = await create('promotion-article');
    await finalize(withdrawn.documentId);
    store.decideProductionDocumentType({ bookId: book.bookId, typeId: 'promotion-article', notForThisBook: true });
    await create('review-article');
    const resolved = entry();
    expect(resolved.executor).toBe('review-category-contract');
    const input = reviewCategoryContractInput(resolved);
    expect(input.deliverables!.map((participant) => participant.revisionId)).toEqual([pin.revisionId]);
    expect(input.deliverables![0]!.laterSaves).toBe(1);
    const basis = reviewCategoryBasisStatement(resolved);
    expect(basis.includes(pin.revisionId) && basis.includes('本书不做') && basis.includes('未参与') && basis.includes('定稿后另有 1 次保存')).toBe(true);
    expect(reviewCategoryKindDefinition(input).systemPrompt.includes('交付物是只读的比对数据')).toBe(true);
  });

  it('refuses reopened finalization without delivery with its precise reason', async () => {
    const doc = await create();
    await finalize(doc.documentId);
    phase(doc.documentId, 'reopen');
    expect(entry().executor).toBe('unavailable');
    expect(entry().unavailableReason?.includes('已重新打开定稿阶段，尚无可用的定稿版本')).toBe(true);
  });

  it('prefers the newest delivery-origin version even after finalization is reopened and newer drafts are saved', async () => {
    const doc = await create();
    edit(doc.documentId);
    const delivered = (await store.recordProductionDocumentDelivery({ bookId: book.bookId, documentId: doc.documentId,
      version: { kind: 'current', workingDigest: document(doc.documentId).workingDigest }, recipient: { kind: 'publicity', custom: null }, note: null })).document!;
    const pin = delivered.versions[0]!.revisionId;
    await finalize(doc.documentId);
    phase(doc.documentId, 'reopen');
    await save(doc.documentId);
    expect(reading().participants.map((participant) => participant.revisionId)).toEqual([pin]);
    expect(entry().executor).toBe('review-category-contract');
  });

  it('refuses a corrupt eligible record with the record reason', async () => {
    const doc = await create();
    await finalize(doc.documentId);
    db.exec('DROP TRIGGER production_documents_no_update');
    db.prepare('UPDATE production_documents SET record_digest = ? WHERE document_id = ?').run('0'.repeat(64), doc.documentId);
    expect(entry().unavailableReason).toBe('生产文档记录与其摘要不一致。');
  });

  it('refuses changed participants through plan-changed before authorization and pins the original snapshot', async () => {
    const doc = await create();
    await finalize(doc.documentId);
    const pin = reading().participants[0]!;
    const run = prepare();
    await save(doc.documentId);
    phase(doc.documentId, 'reopen');
    phase(doc.documentId, 'complete');
    let refusal: StoreError | null = null;
    try { store.authorizeReviewRun(book.bookId, run.reviewRunId, approvals(run)); } catch (error) { if (error instanceof StoreError) refusal = error; else throw error; }
    expect(refusal?.code).toBe('REVIEW_PLAN_CHANGED');
    expect(refusal?.message).toBe(REVIEW_DELIVERABLE_CHANGED);
    const snapshot = JSON.parse(db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(run.reviewRunId)!.canonical_json as string);
    expect(snapshot.categories[0].entry.deliverables.participants[0].revisionId).toBe(pin.revisionId);
  });

  it('requires an exact live kind, deliverable category and explicit deliverable permission; v11 refuses', async () => {
    const doc = await create();
    await finalize(doc.documentId);
    const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(entry()));
    const v11 = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
    expect(liveKindAdmission(v11, definition, DEVELOPER_LIVE_POLICY_BINDING)).toBeNull();
    const allowed = await syntheticPolicy();
    expect(liveKindAdmission(allowed, definition, DEVELOPER_LIVE_POLICY_BINDING)).not.toBeNull();
    for (const denial of ['kind', 'category', 'permission']) {
      const denied = { ...allowed, providerProcessing: { ...allowed.providerProcessing, admittedRules: allowed.providerProcessing.admittedRules!.map((rule) => ({ ...rule,
        taskKinds: denial === 'kind' ? rule.taskKinds.filter((kind) => kind !== definition.kind) : rule.taskKinds,
        outboundDataCategories: denial === 'category' ? rule.outboundDataCategories.filter((category) => String(category) !== 'editorial-deliverable-excerpt') : rule.outboundDataCategories,
        ...(denial === 'permission' ? { editorialDeliverablesAllowed: false } : {}),
      })) } };
      expect(liveKindAdmission(denied, definition, DEVELOPER_LIVE_POLICY_BINDING)).toBeNull();
    }
  });

  it('grounds both sources read-only, preserving every deliverable byte through a Run and manuscript Apply', async () => {
    const doc = await create();
    await finalize(doc.documentId);
    const frozen = entry();
    const pin = frozen.deliverables!.participants[0]!;
    const before = JSON.stringify(store.getManuscriptWindow(doc.documentId, doc.branchId, null));
    const documentRows = JSON.stringify(db.prepare('SELECT * FROM production_document_versions WHERE document_id = ?').all(doc.documentId));
    const sent = await execution();
    const run = prepare();
    store.authorizeReviewRun(book.bookId, run.reviewRunId, approvals(run));
    await driver!.drive(run.reviewRunId);
    expect(sent.length).toBeGreaterThan(1);
    const result = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    expect(result.findings.length).toBe(1);
    const finding = result.findings[0]!;
    expect(finding.markId).not.toBeNull();
    expect(finding.clauseRefs[0]!.documentTitle.includes(pin.revisionId) && finding.clauseRefs[0]!.documentTitle.includes(doc.documentId)
      && finding.clauseRefs[0]!.documentTitle.includes('第 1 段（只读）')).toBe(true);
    const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
    const block = window.blocks[0]!;
    const selectedText = sliceGraphemes(block.text, 0, 2);
    const mark = store.createEditorialMark({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: block.blockId,
      clientMarkId: randomUUID(), baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence,
      blockId: block.blockId, baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 2, selectedText,
      kind: 'change-suggestion', highlightColor: null, body: '', proposedText: `${selectedText}（修订）`, rationale: null });
    store.applyChangeSuggestion({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: block.blockId,
      markId: mark.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    expect(JSON.stringify(store.getManuscriptWindow(doc.documentId, doc.branchId, null)) === before).toBe(true);
    expect(JSON.stringify(db.prepare('SELECT * FROM production_document_versions WHERE document_id = ?').all(doc.documentId)) === documentRows).toBe(true);
  });

  it('stops before the next deliverable-bearing unit and retains the completed result when the revision moves during a Run', async () => {
    const doc = await create();
    await finalize(doc.documentId);
    const frozen = entry();
    const sent = await execution(async () => { await save(doc.documentId); phase(doc.documentId, 'reopen'); phase(doc.documentId, 'complete'); });
    const run = prepare();
    store.authorizeReviewRun(book.bookId, run.reviewRunId, approvals(run));
    await driver!.drive(run.reviewRunId);
    expect(sent).toEqual([1]);
    const revision = store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(reviewCategoryContractInput(frozen))).resultSetRevision as ReviewCategoryResultSetRevisionProjection;
    expect(revision.coverage.unitsClosed).toBe(1);
    expect(revision.findings.length).toBe(1);
    const settled = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
    expect(settled.categories[0]!.detail?.includes(REVIEW_DELIVERABLE_CHANGED) && settled.categories[0]!.detail?.includes('已完成的单元保留')).toBe(true);
    expect(settled.categories[0]!.state).toBe('interrupted');
  });
});
