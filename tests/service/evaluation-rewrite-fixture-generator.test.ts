// The generator of the authored fixture `sample1-evaluation-rewrite-authored` (Issue #429, plan slice S81b2). The observations
// and the rewritten words in `tests/support/evaluation-rewrite.ts` are the authored part: each observation rests on blocks the
// authored 初评 and 审稿意见 fixtures cite — themselves written after reading exact `sample1` (ADR 0043) — and the words rewrite the
// 评语 and the 总评 to J-11's 第 15 版 scores from those observations alone. Everything else in the fixture — every request digest,
// and the answer to the Run Report reflection the Run sends — depends on the frozen rewrite contract (the version's words) and on
// the authored part, so it is derived by driving the real path until no Run asks anything new.
//
// It never runs in the Local Verification Ladder or in CI. After the contract, the built-in profile, the fixtures it is layered
// over or J-11's 第 15 版 words change, regenerate the fixture with
//   AI7_REGENERATE_EVALUATION_REWRITE_FIXTURE=1 pnpm exec vitest run tests/service/evaluation-rewrite-fixture-generator.test.ts
// and review the fixture's diff like any other change.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import {
  EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
  evaluationRewriteObservationSetDigest,
  evaluationRewriteRequestDigest,
  evaluationRewriteSynthesisRequestDigest,
} from '../../src/service/evaluation/evaluation-rewrite-contract.js';
import { fixtureEntryKey, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { AUTHORED_REWRITE_OBSERVATIONS, AUTHORED_REWRITE_WORDS, EVALUATION_REWRITE_FIXTURE_IDENTITY, beginRewriteAsJ11 } from '../support/evaluation-rewrite.js';

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const FIXTURE_PATH = resolve(FIXTURES_ROOT, `${EVALUATION_REWRITE_FIXTURE_IDENTITY}.json`);

const REFLECTION_TEXT = JSON.stringify({
  schema: 'ai7.analysis.run-report-reflection-result/1',
  items: [
    { suggestion: '下一次重写评语可以维持当前的单元预算不变，本次没有任何阅读范围因预算而失败。', basis: '账目中没有适配器失败或契约无效的缺口，计划内调整次数为 0。' },
    { suggestion: '没有找到依据的评分项，重写时只按编辑的分数与调分原因措辞。', basis: '账目按评分项分别计数了依据。' },
  ],
});

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let base: ResolvedModelFixture;
const entries = new Map<string, { entry: ModelFixtureEntry; order: string }>();
let additions = 0;

const fixture: ResolvedModelFixture & { entries: Map<string, ModelFixtureEntry> } = {
  identity: EVALUATION_REWRITE_FIXTURE_IDENTITY,
  description: 'generator',
  provenance: 'authored',
  lineage: [{ identity: EVALUATION_REWRITE_FIXTURE_IDENTITY, sha256: 'e'.repeat(64) }],
  entries: new Map(),
  sha256: 'f'.repeat(64),
};

function add(entry: ModelFixtureEntry, order: string): void {
  const key = fixtureEntryKey(entry.unitOrdinal, entry.requestDigest);
  if (entries.has(key)) return;
  entries.set(key, { entry, order });
  fixture.entries.set(key, entry);
  additions += 1;
}

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-s81b2-generate-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  // The 初评 the version begins from runs on the fixtures this one is layered over.
  base = await loadModelFixture(FIXTURES_ROOT, 'sample1-readers-report-authored');
  for (const [key, entry] of base.entries) fixture.entries.set(key, entry);
});
afterEach(async () => { await roots.dispose(); });

/** One pass of J-11's rewrite: a fresh import of exact sample1, its 初评, a 定稿 version, J-11's 第 15 版 words, and the rewrite. */
async function pass(): Promise<boolean> {
  const scenario = await createServiceTestRoots('ai7-s81b2-generate-pass-');
  const store = await EditorialStore.open(scenario.dataRoot, scenario.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const imported = await importSample1Book(store, scenario.codeRoot, 'S81b2 夹具生成');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'S81b2 主编辑连接');
    await runInitialEvaluationToEnd(store, owner, imported.bookId, launchPolicy);
    finalizeAsJ11(store, imported.bookId);
    const record = beginRewriteAsJ11(store, imported.bookId);
    let progress = store.createEvaluationRewritePreparationWork(imported.bookId, record.recordId, launchPolicy);
    while (!progress.done) progress = store.advanceEvaluationRewritePreparationWork(progress.workId!);
    const prepared = progress.projection!;
    const manifest = prepared.coverageManifest!;
    const contract = prepared.planEnvelope!.promptContractDigest;
    expect(manifest.units.length).toBe(Object.keys(AUTHORED_REWRITE_OBSERVATIONS).length);
    for (const unit of manifest.units) {
      const observations = AUTHORED_REWRITE_OBSERVATIONS[unit.ordinal]!;
      add({
        unitOrdinal: unit.ordinal,
        requestDigest: evaluationRewriteRequestDigest(contract, unit.ordinal, unit.digest),
        attempt: null,
        contentDigest: null,
        response: {
          kind: 'unit-result',
          text: JSON.stringify({ schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, observations }),
          usage: { inputTokens: 1900 + unit.ordinal * 40, outputTokens: 60 + observations.length * 50 },
        },
      }, `a:${String(unit.ordinal).padStart(2, '0')}`);
    }
    const closed = manifest.units.map((unit) => ({
      unitOrdinal: unit.ordinal,
      result: { schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, observations: AUTHORED_REWRITE_OBSERVATIONS[unit.ordinal]! },
    }));
    add({
      unitOrdinal: 0,
      requestDigest: evaluationRewriteSynthesisRequestDigest(contract, evaluationRewriteObservationSetDigest(closed)),
      attempt: null,
      contentDigest: null,
      response: { kind: 'unit-result', text: JSON.stringify(AUTHORED_REWRITE_WORDS), usage: { inputTokens: 2600, outputTokens: 560 } },
    }, 'b:synthesis');
    const authorized = store.authorizeEvaluationRewrite(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!, authorized.ledger);
    await owner.whenIdle();
    const settled = store.inspectEvaluationRewrite(imported.bookId)!;
    expect(settled.state).toBe('settled');
    const report = settled.taskOutcome!.report!;
    add({
      unitOrdinal: 0,
      requestDigest: runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, report.accountingDigest),
      attempt: null,
      contentDigest: null,
      response: { kind: 'unit-result', text: REFLECTION_TEXT, usage: { inputTokens: 900, outputTokens: 180 } },
    }, 'c:reflection');
    store.markCleanShutdown();
    return settled.resultSetRevision!.rewrite.synthesis.state === 'closed' && report.ifRedone.state === 'closed';
  } finally {
    await owner.dispose();
    store.close();
    await scenario.dispose();
  }
}

it.runIf(process.env['AI7_REGENERATE_EVALUATION_REWRITE_FIXTURE'] === '1')('generates the authored evaluation rewrite fixture', async () => {
  await requireExactSample1(roots.codeRoot);
  let closed = false;
  for (let index = 0; index < 4 && !closed; index += 1) {
    additions = 0;
    closed = await pass();
    // eslint-disable-next-line no-console
    console.log(`pass ${index + 1}: +${additions} entries, closed: ${closed}`);
    if (additions > 0) closed = false;
  }
  expect(closed).toBe(true);
  const ordered = [...entries.values()].sort((left, right) => (left.order < right.order ? -1 : left.order > right.order ? 1 : 0));
  const body = {
    schema: 'ai7.model-fixture/1',
    identity: EVALUATION_REWRITE_FIXTURE_IDENTITY,
    description: '评语重写契约 v1 的人工撰写夹具：回答 J-11 第 15 版评估（从 AI7 初评开始，结构、叙事逻辑与连贯调为 13 分、打分偏高，读者与市场潜力调为 10 分、依据不足，保存一次）按编辑评分重写评语时发出的八个单元请求与一次全书综合。每条依据都引用 sample1（ADR 0043 收录的 Public SampleBook）的初评与审稿意见夹具已经引用过的内容块，说明它如何印证编辑所给的分数；「读者与市场潜力」在书稿中没有依据。全书综合只依据这一版的评分、调分原因、现有评语与这些依据，为五个已打分的评分项各重写一段评语并写出总评，不写任何分数。unitOrdinal 为 0 的条目回答全书综合与这次运行的运行反思。本夹具叠加在 sample1-readers-report-authored 之上：同一次启动既能运行基线分析、AI7 初评与审稿意见，也能重写评语；各自的请求摘要互不相同，叠加不改变任何条目的键。',
    basedOn: 'sample1-readers-report-authored',
    provenance: 'authored',
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: ordered.map(({ entry }) => ({ unitOrdinal: entry.unitOrdinal, requestDigest: entry.requestDigest, response: entry.response })),
  };
  await writeFile(FIXTURE_PATH, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`wrote ${ordered.length} entries`);
}, 600_000);
