import { randomUUID } from 'node:crypto';
import { ModelRequestGovernor, BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { EditorialStore } from '../../src/service/store.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { DialogueExecutionOwner, productionDialogueRoute } from '../../src/service/dialogue/dialogue-execution.js';
import { prepareGlobalAgentDisclosure, startGlobalAgentTurn } from '../../src/service/dialogue/global-agent-session.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import type { PrepareGlobalAgentTurnInput } from '../../src/shared/protocol.js';
import { createServiceTestRoots } from './temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from './sample1-baseline.js';

/**
 * What the AI 助手 lists and sends over one ordinary-production store built from `SampleBooks/sample1` (Issue #1655 review): its
 * items and source candidates, and the exact request bodies of one question and its regeneration. Only store calls the base
 * (`34389e13c`) already had are used, so the same text captures the base's expectation and the head's answer.
 */
export interface GlobalAgentCapture {
  items: Array<{ itemId: string; revisionId: string; kind: string; state: string; text: string }>;
  sourceCandidates: Array<{ itemId: string; revisionId: string; kind: string; title: string; text: string }>;
  requests: string[];
}

const binding = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((entry) => entry.route === 'opencode-go')!;
const encoder = new TextEncoder();
const sse = (value: unknown): Uint8Array => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);
function answer(): Response {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(sse({ model: binding.model, choices: [{ index: 0, delta: { content: '合成回答。' } }] }));
    controller.enqueue(sse({ model: binding.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
    controller.enqueue(sse({ model: binding.model, choices: [], usage: { prompt_tokens: 20, completion_tokens: 5 } }));
    controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
}
const review: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
  const message = body.messages.findLast((entry) => entry.role === 'user')!.content;
  const header = parseReviewCategoryUnitMessageHeader(message);
  const content = header !== null ? JSON.stringify({ schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: header.ordinal,
    findings: header.ordinal !== 1 ? [] : message.split('\n').flatMap((line) => {
      const match = /^\[([1-9][0-9]*)\] \[blk_[0-9a-f]{24}\] \((?:title|heading|paragraph)(?: h[1-6])?\) (.*)$/u.exec(line);
      return match === null || match[2]!.length < 10 || match[2]!.length > 80 ? [] : [{ quote: match[2]!, blockOrdinal: Number(match[1]),
        severity: 'should', note: '合成审阅来源。', replacement: `${match[2]}合成` }];
    }).slice(0, 3) }) : message.startsWith('保证抽样 ') ? JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1',
      dispositions: parseAssuranceSamplingListedRefs(message).map((ref) => ({ ref, disposition: '成立', reason: '合成回归。' })) })
      : JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] });
  return new Response(JSON.stringify({ model: binding.model, choices: [{ message: { content, reasoning_content: '合成推理。' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
};

/**
 * Builds the store (accepted memory A, accepted-then-stopped memory B, an editor's rule, an explicit direction), captures what
 * the AI 助手 lists and sends, then with `reenable` (the head only) re-enables B and captures again with the same question. Run it
 * in a fresh interpreter with a fixed clock and identity sequence (`tests/service/global-agent-request-bytes.test.ts`), so every
 * id, pin and digest is the same at the base and at the head.
 */
export async function captureGlobalAgentRequests(reenable: boolean):
  Promise<{ before: GlobalAgentCapture; after: GlobalAgentCapture | null; stoppedItemId: string }> {
  const governor = new ModelRequestGovernor();
  const roots = await createServiceTestRoots('ai7-global-agent-capture-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const calls: string[] = [];
  let owner: DialogueExecutionOwner | undefined;
  try {
    const connection = store.saveModelServiceConnection('合成助手连接', null, 'ready', binding.route);
    store.selectModelServiceRoute(binding.route);
    const selected = { ...binding, credentialReference: connection.credentialReference };
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', selected, selected);
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy, live: { scope: 'ordinary-production', ...selected, runBudgetCeiling: 'unset' } });
    const book = await importSample1Book(store, roots.codeRoot, '合成助手来源');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    const reviewOwner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
      production: { scope: 'ordinary-production', nativeFetch: review }, secretResolver: { resolve: async () => 'synthetic-test-placeholder' },
      productionPolicyFor: (current) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', current, current) });
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, reviewOwner);
    try {
      let work = store.createReviewRunPreparationWork(book.bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
      while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      const run = work.projection!.run!;
      store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories.filter((entry) => entry.planEnvelopeDigest !== null)
        .map((entry) => ({ categoryId: entry.categoryId, planEnvelopeDigest: entry.planEnvelopeDigest! })));
      await driver.drive(run.reviewRunId);
      const reviewed = store.inspectReviewWorkspace(book.bookId, run.reviewRunId).run!;
      for (const finding of reviewed.findings) store.recordChangeSuggestionDecision({ manuscriptId: book.manuscriptId, branchId: book.branchId,
        windowStartBlockId: finding.blockId, markId: finding.markId!, clientDecisionId: randomUUID(), disposition: 'accepted-with-edit',
        editedText: '合成编辑改写', reason: '统一合成术语。' });
    } finally { const stopped = driver.dispose(); await reviewOwner.dispose(); await stopped; }
    const signals = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals;
    const memory = (signalId: string, title: string) => {
      store.createEditorialMemory({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(), signalIds: [signalId],
        applicability: { kind: 'house' }, editorialDimension: 'typos-and-usage', title, confidence: 0.7 });
      const proposed = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items[0]!.current;
      store.acceptEditorialMemory({ itemId: proposed.itemId, expectedVersionId: proposed.versionId, actionId: randomUUID() });
      return store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: proposed.itemId }).items[0]!.current;
    };
    memory(signals[0]!.signalId, '保持合成术语一致。');
    const stopped = memory(signals[1]!.signalId, '合成停用后的记忆。');
    store.deactivateEditorialMemory({ itemId: stopped.itemId, expectedVersionId: stopped.versionId, actionId: randomUUID() });
    store.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'style-and-format', text: '保留合成短句。', effect: 'guide' });
    store.recordLearningSupervision({ operation: 'supervise', targets: [], scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '先分清合成用语。', effect: 'guide' });
    owner = new DialogueExecutionOwner({ requestGovernor: governor, records: store, fixture: null, sessionLogRoot: store.harnessSessionLogRoot,
      live: productionDialogueRoute({ scope: 'ordinary-production', nativeFetch: (async (_url: string, init: { body: string }) => { calls.push(init.body); return answer(); }) as unknown as typeof fetch },
        () => policy, () => connection.credentialReference, { resolve: async () => 'synthetic-test-placeholder' }) });
    const settle = async (dialogueId: string, count: number) => {
      const until = Date.now() + 15_000;
      while (store.inspectGlobalAgentDialogue(dialogueId, (id) => owner!.liveText(id)).attempts.filter((attempt) => attempt.state === 'completed').length < count) {
        if (Date.now() > until) throw new Error('AI 助手 did not settle');
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    };
    const turn = async (input: PrepareGlobalAgentTurnInput, dialogueId: string | null, count: number) => {
      const disclosure = prepareGlobalAgentDisclosure(store, owner!, policy, input);
      const started = startGlobalAgentTurn(store, owner!, () => policy, input, disclosure.sha256);
      await settle(dialogueId ?? started.dialogueId, count);
      return started;
    };
    const capture = async (): Promise<GlobalAgentCapture> => {
      const global = store.inspectGlobalAgent();
      const sent = calls.length;
      const question = await turn({ kind: 'ask', question: '这些偏好各自适用于哪里？', sources: global.sourceCandidates!.map(({ itemId, revisionId }) => ({ itemId, revisionId })) }, null, 1);
      await turn({ kind: 'regenerate', dialogueId: question.dialogueId, attemptId: question.attemptId }, question.dialogueId, 2);
      return { items: global.items.map(({ itemId, revisionId, kind, state, text }) => ({ itemId, revisionId, kind, state, text })),
        sourceCandidates: global.sourceCandidates!.map(({ itemId, revisionId, kind, title, text }) => ({ itemId, revisionId, kind, title, text })),
        requests: calls.slice(sent) };
    };
    const before = await capture();
    if (!reenable) return { before, after: null, stoppedItemId: stopped.itemId };
    const pin = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: stopped.itemId }).items[0]!.current.versionId;
    store.reviewPreferenceLifecycle({ itemId: stopped.itemId, expectedRevisionId: pin, actionId: randomUUID() }, 'reactivate');
    return { before, after: await capture(), stoppedItemId: stopped.itemId };
  } finally {
    await owner?.dispose(); governor.close(); await governor.whenIdle(); store.close(); await roots.dispose();
  }
}
