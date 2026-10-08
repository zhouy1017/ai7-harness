// The generator of the authored fixture `sample1-readers-report-authored` (Issue #429, plan slice S81c). The passages and the
// five sections below are the authored part: each passage was written after reading one Analysis Unit of exact `sample1`
// (ADR 0043) and cites, by its position in the unit message, the blocks it rests on; the sections are a 给作者的修改意见 written
// from J-11's 定稿 version and those passages alone. Everything else in the fixture — every request digest, and the answer to
// the Run Report reflection the Run sends — depends on the frozen reader's report contract (the template and the version's
// words) and on the authored part, so it is derived by driving the real path until no Run asks anything new.
//
// It never runs in the Local Verification Ladder or in CI. After the contract, the built-in profile, the evaluation fixture or
// J-11's 定稿 words change, regenerate the fixture with
//   AI7_REGENERATE_READERS_REPORT_FIXTURE=1 pnpm exec vitest run tests/service/readers-report-fixture-generator.test.ts
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
  READERS_REPORT_UNIT_RESULT_SCHEMA,
  readersReportPassageSetDigest,
  readersReportRequestDigest,
  readersReportSynthesisRequestDigest,
} from '../../src/service/evaluation/readers-report-contract.js';
import { fixtureEntryKey, loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { AUTHORED_PASSAGES, AUTHORED_SECTIONS, READERS_REPORT_FIXTURE_IDENTITY, finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const FIXTURE_PATH = resolve(FIXTURES_ROOT, `${READERS_REPORT_FIXTURE_IDENTITY}.json`);


const REFLECTION_TEXT = JSON.stringify({
  schema: 'ai7.analysis.run-report-reflection-result/1',
  items: [
    { suggestion: '下一次起草审稿意见可以维持当前的单元预算不变，本次没有任何阅读范围因预算而失败。', basis: '账目中没有适配器失败或契约无效的缺口，计划内调整次数为 0。' },
    { suggestion: '没有找到可引用段落的阅读范围较少，起草时可以照常读全书。', basis: '账目按段落的类别分别计数。' },
  ],
});

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let base: ResolvedModelFixture;
const entries = new Map<string, { entry: ModelFixtureEntry; order: string }>();
let additions = 0;

const fixture: ResolvedModelFixture & { entries: Map<string, ModelFixtureEntry> } = {
  identity: READERS_REPORT_FIXTURE_IDENTITY,
  description: 'generator',
  provenance: 'authored',
  lineage: [{ identity: READERS_REPORT_FIXTURE_IDENTITY, sha256: 'e'.repeat(64) }],
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
  roots = await createServiceTestRoots('ai7-s81c-generate-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  // The 初评 the 定稿 version begins from runs on the evaluation fixture this one is layered over.
  base = await loadModelFixture(FIXTURES_ROOT, 'sample1-evaluation-authored');
  for (const [key, entry] of base.entries) fixture.entries.set(key, entry);
});
afterEach(async () => { await roots.dispose(); });

/** One pass of J-11's 审稿意见: a fresh import of exact sample1, its 初评, J-11's 定稿 version, and the draft run to its end. */
async function pass(): Promise<boolean> {
  const scenario = await createServiceTestRoots('ai7-s81c-generate-pass-');
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
    const imported = await importSample1Book(store, scenario.codeRoot, 'S81c 夹具生成');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'S81c 主编辑连接');
    await runInitialEvaluationToEnd(store, owner, imported.bookId, launchPolicy);
    finalizeAsJ11(store, imported.bookId);
    let progress = store.createReadersReportPreparationWork(imported.bookId, 'author', launchPolicy);
    while (!progress.done) progress = store.advanceReadersReportPreparationWork(progress.workId!);
    const prepared = progress.projection!;
    const manifest = prepared.coverageManifest!;
    const contract = prepared.planEnvelope!.promptContractDigest;
    expect(manifest.units.length).toBe(Object.keys(AUTHORED_PASSAGES).length);
    for (const unit of manifest.units) {
      const passages = AUTHORED_PASSAGES[unit.ordinal]!;
      add({
        unitOrdinal: unit.ordinal,
        requestDigest: readersReportRequestDigest(contract, unit.ordinal, unit.digest),
        attempt: null,
        contentDigest: null,
        response: {
          kind: 'unit-result',
          text: JSON.stringify({ schema: READERS_REPORT_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, passages }),
          usage: { inputTokens: 2100 + unit.ordinal * 40, outputTokens: 60 + passages.length * 50 },
        },
      }, `a:${String(unit.ordinal).padStart(2, '0')}`);
    }
    const closed = manifest.units.map((unit) => ({
      unitOrdinal: unit.ordinal,
      result: { schema: READERS_REPORT_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, passages: AUTHORED_PASSAGES[unit.ordinal]! },
    }));
    add({
      unitOrdinal: 0,
      requestDigest: readersReportSynthesisRequestDigest(contract, readersReportPassageSetDigest(closed)),
      attempt: null,
      contentDigest: null,
      response: { kind: 'unit-result', text: JSON.stringify(AUTHORED_SECTIONS), usage: { inputTokens: 3200, outputTokens: 640 } },
    }, 'b:synthesis');
    const authorized = store.authorizeReadersReport(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!, authorized.ledger);
    await owner.whenIdle();
    const settled = store.inspectReadersReport(imported.bookId)!;
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
    return settled.resultSetRevision!.readersReport.synthesis.state === 'closed' && report.ifRedone.state === 'closed';
  } finally {
    await owner.dispose();
    store.close();
    await scenario.dispose();
  }
}

it.runIf(process.env['AI7_REGENERATE_READERS_REPORT_FIXTURE'] === '1')('generates the authored readers report fixture', async () => {
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
    identity: READERS_REPORT_FIXTURE_IDENTITY,
    description: '审稿意见契约 v1 的人工撰写夹具：逐单元阅读 sample1（ADR 0043 收录的 Public SampleBook）后写成，回答「给作者的修改意见」模板下、从 J-11 第 14 版定稿评估（AI7 初评开始，读者与市场潜力调为 10 分，修改后再议）起草审稿意见时发出的八个单元请求与一次全书综合。每处段落都按其在单元消息中的位置引用它所依据的内容块，分为印证优点、显出问题与需要修改三类；全书综合只依据定稿的评估记录与这些段落写出总体评价、主要优点、主要问题、修改建议与结论五个部分，结论与编辑选定的「修改后再议」一致。本社暂无审稿意见范例，契约写明本次不参考范例。unitOrdinal 为 0 的条目回答全书综合与这次运行的运行反思。本夹具叠加在 sample1-evaluation-authored 之上：同一次启动既能运行基线分析与 AI7 初评，也能起草审稿意见；各自的请求摘要互不相同，叠加不改变任何条目的键。',
    basedOn: 'sample1-evaluation-authored',
    provenance: 'authored',
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: ordered.map(({ entry }) => ({ unitOrdinal: entry.unitOrdinal, requestDigest: entry.requestDigest, response: entry.response })),
  };
  await writeFile(FIXTURE_PATH, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`wrote ${ordered.length} entries`);
}, 600_000);
