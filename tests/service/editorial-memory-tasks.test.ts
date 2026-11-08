import { FACTUAL_REVIEW_TASK_GOAL } from '../../src/shared/protocol.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { parseUnitMessageHeader } from '../../src/service/analysis/contract.js';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { liveKindAdmission } from '../../src/service/analysis/live-kind-admission.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2 } from '../support/sample1-baseline.js';
import { finalizeAsJ11 } from '../support/readers-report.js';
import { beginRewriteAsJ11 } from '../support/evaluation-rewrite.js';
import { WRITING_REQUEST } from '../support/writing-task.js';
import { CUSTOM_DIMENSION_TEMPLATE } from '../support/custom-analysis.js';

let roots: ServiceTestRoots;
let store: EditorialStore;
let owner: BaselineAnalysisExecutionOwner;
const governor = new ModelRequestGovernor();
afterEach(async () => { await owner?.dispose(); governor.close(); await governor.whenIdle(); store?.close(); await roots?.dispose(); });

it('uses one frozen memory envelope through writing, evaluation, report, rewrite, factual and custom-analysis operations', async () => {
  roots = await createServiceTestRoots('ai7-memory-tasks-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const binding = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((entry) => entry.route === 'opencode-go')!;
  const connection = store.saveModelServiceConnection('合成记忆测试连接', null, 'ready', binding.route);
  store.selectModelServiceRoute(binding.route);
  store.saveSearchBackendCredential('search-tinyfish', null, 'ready');
  store.selectSearchBackend('search-tinyfish');
  const configured = { ...binding, credentialReference: connection.credentialReference };
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
  const launch = { operationalScope: 'ordinary-production' as const, policy, live: { scope: 'ordinary-production' as const,
    ...configured, runBudgetCeiling: 'unset' as const } };
  store.baselineAnalysisLedger.bindLaunch(launch); store.initialEvaluationLedger.bindLaunch(launch); store.factualReviewLedger.bindLaunch(launch);
  const { bookId } = await importSample1Book(store, roots.codeRoot, '合成跨任务记忆');
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  for (const categoryId of ['style-and-format', 'academic-integrity']) store.recordLearningSupervision({ operation: 'create', targets: [],
    scope: { kind: 'house' }, categoryId, text: '保留合成短句并明确证据边界。', effect: 'guide' });
  const fixtureRoot = fileURLToPath(new URL('../fixtures/model/', import.meta.url));
  const contracts = [
    { header: '评估', schema: 'ai7.evaluation', fixture: await loadModelFixture(fixtureRoot, 'sample1-evaluation-authored') },
    { header: '审稿意见', schema: 'ai7.readers-report', fixture: await loadModelFixture(fixtureRoot, 'sample1-readers-report-authored') },
    { header: '评语重写', schema: 'ai7.evaluation-rewrite', fixture: await loadModelFixture(fixtureRoot, 'sample1-evaluation-report-authored') },
  ];
  const seen = new Set<string>();
  let activeKind = '';
  let claimVerifications = 0;
  owner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger, launchPolicy: policy,
    fixture: null, productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', binding), secretResolver: { resolve: async () => 'synthetic-memory-test' }, influenceGuard: (id) => store.learningInfluenceGuard(id),
    production: { scope: 'ordinary-production', nativeFetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content).toContain('保留合成短句并明确证据边界。');
      expect(body.messages[0].content).toContain('不改变本任务要求的输出格式');
      seen.add(activeKind);
      const message = body.messages.at(-1).content as string;
      const header = /^(评估|审稿意见|评语重写)(单元|综合) (\d+)\//u.exec(message);
      let content = JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] });
      if (header !== null) {
        const contract = contracts.find((entry) => entry.header === header[1])!;
        const schema = `${contract.schema}.${header[2] === '综合' ? 'synthesis' : 'unit'}-result/`;
        const answer = [...contract.fixture.entries.values()].find((entry) => entry.unitOrdinal === (header[2] === '综合' ? 0 : Number(header[3])) &&
          entry.response.kind === 'unit-result' && entry.response.text.startsWith(`{"schema":"${schema}`));
        if (answer?.response.kind !== 'unit-result') throw new Error('Missing authored answer');
        content = answer.response.text;
      } else if (message.startsWith('写作单元 ')) content = JSON.stringify({ schema: 'ai7.writing.unit-result/1',
        unitOrdinal: Number(/^写作单元 (\d+)/u.exec(message)![1]), passages: [{ kind: 'highlight', note: '合成看点。', blockOrdinals: [1] }] });
      else if (message.startsWith('写作综合 ')) content = JSON.stringify({ schema: 'ai7.writing.synthesis-result/1', title: '合成文稿', sections: [{ heading: '合成部分', paragraphs: ['保留合成短句。'] }] });
      else if (activeKind.startsWith('custom-analysis/') && parseUnitMessageHeader(message) !== null) content = JSON.stringify({
        schema: 'ai7.custom-analysis.unit-result/1', unitOrdinal: parseUnitMessageHeader(message)!.ordinal, rows: [] });
      else if (activeKind === 'factual-review' && parseFactualReviewUnitMessageHeader(message) !== null) {
        const unit = parseFactualReviewUnitMessageHeader(message)!;
        const blocks = [...message.matchAll(/^\[blk_[0-9a-f]{24}\] \([a-z]+(?: h\d)?\) (.*)$/gmu)];
        const own = message.indexOf('以下为本单元需要核查的内容块');
        const index = blocks.findIndex((block) => block.index! > own && block[1]!.trim().length >= 8);
        const cited = index < 0 ? null : { quote: [...blocks[index]![1]!].slice(0, 8).join(''), blockOrdinal: index + 1 };
        content = JSON.stringify({ schema: 'ai7.factual-claim-extraction/1', unitOrdinal: unit.ordinal,
          assertions: unit.ordinal !== 1 || cited === null ? [] : [{ ...cited,
            assertionClass: 'real-world-fact', category: '机构', severity: 'A', question: '这条合成断言有何依据？', basis: '需要外部核实。' }] });
      } else if (activeKind === 'factual-review' && message.startsWith('{')) {
        const claim = JSON.parse(message); claimVerifications++;
        content = JSON.stringify({ schema: 'ai7.factual-claim-verification-result/1', claimId: claim.claimId, evidenceRelations: [], corrections: [] });
      }
      return new Response(JSON.stringify({ model: binding.model, choices: [{ message: { content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
    } } });
  const execute = async (authorized: { ledger: BaselineAnalysisStore; dispatchRunRecordId: string | null }) => {
    const id = authorized.dispatchRunRecordId!;
    const facts = authorized.ledger.loadExecutionPlan(id);
    const definition = authorized.ledger.definitionForRun(id, facts.promptContractDigest);
    activeKind = definition.kind;
    expect(liveKindAdmission(policy, definition, configured)).not.toBeNull();
    expect(definition.systemPrompt).toContain('保留合成短句并明确证据边界。');
    owner.admitOrQueue(id, authorized.ledger); await owner.whenIdle();
    expect(seen.has(activeKind)).toBe(true);
    expect(authorized.ledger.currentRunState(id)).toBe('completed');
  };
  let initial = store.createInitialEvaluationPreparationWork(bookId, policy);
  while (!initial.done) initial = store.advanceInitialEvaluationPreparationWork(initial.workId!);
  await execute(store.authorizeInitialEvaluation(bookId, initial.projection!.taskIntent!.taskIntentId, initial.projection!.planEnvelope!.digest));
  finalizeAsJ11(store, bookId);
  let report = store.createReadersReportPreparationWork(bookId, 'author', policy);
  while (!report.done) report = store.advanceReadersReportPreparationWork(report.workId!);
  await execute(store.authorizeReadersReport(bookId, report.projection!.taskIntent!.taskIntentId, report.projection!.planEnvelope!.digest));
  const record = beginRewriteAsJ11(store, bookId);
  let rewrite = store.createEvaluationRewritePreparationWork(bookId, record.recordId, policy);
  while (!rewrite.done) rewrite = store.advanceEvaluationRewritePreparationWork(rewrite.workId!);
  await execute(store.authorizeEvaluationRewrite(bookId, rewrite.projection!.taskIntent!.taskIntentId, rewrite.projection!.planEnvelope!.digest));
  let writing = store.createWritingPreparationWork(bookId, WRITING_REQUEST, policy);
  while (!writing.done) writing = store.advanceWritingPreparationWork(writing.workId!);
  await execute(store.authorizeWriting(bookId, writing.projection!.taskIntent!.taskIntentId, writing.projection!.planEnvelope!.digest));
  const dimension = store.saveCustomAnalysisDimension({ dimensionId: null, title: '合成开篇', questionTemplate: CUSTOM_DIMENSION_TEMPLATE }).dimensions[0]!;
  const custom = store.prepareCustomAnalysis({ bookId, dimensionId: dimension.dimensionId, update: null }, policy);
  const task = store.inspectAnalysisTask(bookId, custom.taskIntentId);
  await execute(store.authorizeBaselineAnalysis(bookId, custom.taskIntentId, task.planEnvelope!.digest));
  let factual = store.createFactualReviewPreparationWork(bookId, FACTUAL_REVIEW_TASK_GOAL, policy);
  while (!factual.done) factual = store.advanceFactualReviewPreparationWork(factual.workId!);
  await execute({ ...store.authorizeFactualReview(bookId, factual.projection!.taskIntent!.taskIntentId, factual.projection!.planEnvelope!.digest), ledger: store.factualReviewLedger });
  expect(seen.size).toBe(6);
  expect(claimVerifications).toBeGreaterThan(0);
}, 120_000);
