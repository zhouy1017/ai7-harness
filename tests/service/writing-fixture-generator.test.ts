// The generator of the authored fixture `sample1-writing-authored` (Issue #432, plan slice S84a). The passages and the draft below
// (`tests/support/writing-task.ts`) are the authored part: each passage was written after reading one Analysis Unit of exact
// `sample1` (ADR 0043) and cites, by its position in the unit message, the blocks it rests on; the draft is
// a 宣传文章 written from J-07's audience and channel and those passages alone. Everything else in the fixture — every request
// digest, and the answer to the Run Report reflection the Run sends — depends on the frozen writing contract (the type, the
// editor's words and the reference set) and on the authored part, so it is derived by driving the real path until no Run asks
// anything new.
//
// It never runs in the Local Verification Ladder or in CI. After the contract, the type configuration or J-07's words change,
// regenerate the fixture with
//   AI7_REGENERATE_WRITING_FIXTURE=1 pnpm exec vitest run tests/service/writing-fixture-generator.test.ts
// and review the fixture's diff like any other change. `AI7_WRITING_FIXTURE_LAYOUT=1` prints each unit's paragraphs instead, for
// the author.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import {
  WRITING_UNIT_RESULT_SCHEMA,
  writingMessageBlockIds,
  writingPassageSetDigest,
  writingRequestDigest,
  writingSynthesisRequestDigest,
} from '../../src/service/writing/writing-contract.js';
import { fixtureEntryKey, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import {
  AUTHORED_WRITING_DRAFT,
  AUTHORED_WRITING_PASSAGES,
  WRITING_BOOK_TITLE,
  WRITING_FIXTURE_IDENTITY,
  WRITING_REQUEST,
} from '../support/writing-task.js';

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const FIXTURE_PATH = resolve(FIXTURES_ROOT, `${WRITING_FIXTURE_IDENTITY}.json`);

const REFLECTION_TEXT = JSON.stringify({
  schema: 'ai7.analysis.run-report-reflection-result/1',
  items: [
    { suggestion: '下一次起草宣传文章可以维持当前的单元预算不变，本次没有任何阅读范围因预算而失败。', basis: '账目中没有适配器失败或契约无效的缺口，计划内调整次数为 0。' },
    { suggestion: '本社还没有宣传文章范例，交付后的宣传文章归入范例，以后起草可以参照。', basis: '本次计划写明不参考范例。' },
  ],
});

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
const entries = new Map<string, { entry: ModelFixtureEntry; order: string }>();
let additions = 0;

const fixture: ResolvedModelFixture & { entries: Map<string, ModelFixtureEntry> } = {
  identity: WRITING_FIXTURE_IDENTITY,
  description: 'generator',
  provenance: 'authored',
  lineage: [{ identity: WRITING_FIXTURE_IDENTITY, sha256: 'e'.repeat(64) }],
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
  roots = await createServiceTestRoots('ai7-s84-generate-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});
afterEach(async () => { await roots.dispose(); });

/** One pass of J-07's 写作任务: a fresh import of exact sample1, the Task prepared, and the draft run to its end. */
async function pass(layout: boolean): Promise<boolean> {
  const scenario = await createServiceTestRoots('ai7-s84-generate-pass-');
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
    const { bookId } = await importSample1Book(store, scenario.codeRoot, WRITING_BOOK_TITLE);
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    recordMissingCredentialConnection(store, 'S84 主编辑连接');
    let progress = store.createWritingPreparationWork(bookId, WRITING_REQUEST, launchPolicy);
    while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
    const prepared = progress.projection!;
    const manifest = prepared.coverageManifest!;
    const contract = prepared.planEnvelope!.promptContractDigest;
    if (layout) {
      for (const unit of manifest.units) {
        // eslint-disable-next-line no-console
        console.log(`unit ${unit.ordinal}: message blocks ${writingMessageBlockIds(unit).length} (overlap ${unit.overlapBlockIds.length}), own ${unit.blockIds.length}, positions ${unit.startPosition}-${unit.endPosition}`);
      }
      return true;
    }
    expect(manifest.units.length).toBe(Object.keys(AUTHORED_WRITING_PASSAGES).length);
    for (const unit of manifest.units) {
      const passages = AUTHORED_WRITING_PASSAGES[unit.ordinal]!;
      add({
        unitOrdinal: unit.ordinal,
        requestDigest: writingRequestDigest(contract, unit.ordinal, unit.digest),
        attempt: null,
        contentDigest: null,
        response: {
          kind: 'unit-result',
          text: JSON.stringify({ schema: WRITING_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, passages }),
          usage: { inputTokens: 1600 + unit.ordinal * 40, outputTokens: 60 + passages.length * 50 },
        },
      }, `a:${String(unit.ordinal).padStart(2, '0')}`);
    }
    const closed = manifest.units.map((unit) => ({
      unitOrdinal: unit.ordinal,
      result: { schema: WRITING_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, passages: AUTHORED_WRITING_PASSAGES[unit.ordinal]! },
    }));
    add({
      unitOrdinal: 0,
      requestDigest: writingSynthesisRequestDigest(contract, writingPassageSetDigest(closed)),
      attempt: null,
      contentDigest: null,
      response: { kind: 'unit-result', text: JSON.stringify(AUTHORED_WRITING_DRAFT), usage: { inputTokens: 2600, outputTokens: 720 } },
    }, 'b:synthesis');
    const authorized = store.authorizeWriting(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!, authorized.ledger);
    await owner.whenIdle();
    const settled = store.inspectWriting(bookId)!;
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
    return settled.resultSetRevision!.writing.synthesis.state === 'closed' && report.ifRedone.state === 'closed';
  } finally {
    await owner.dispose();
    store.close();
    await scenario.dispose();
  }
}

it.runIf(process.env['AI7_WRITING_FIXTURE_LAYOUT'] === '1')('prints the writing units of J-07\'s second Book', async () => {
  await requireExactSample1(roots.codeRoot);
  expect(await pass(true)).toBe(true);
}, 600_000);

it.runIf(process.env['AI7_REGENERATE_WRITING_FIXTURE'] === '1')('generates the authored writing fixture', async () => {
  await requireExactSample1(roots.codeRoot);
  let closed = false;
  for (let index = 0; index < 4 && !closed; index += 1) {
    additions = 0;
    closed = await pass(false);
    // eslint-disable-next-line no-console
    console.log(`pass ${index + 1}: +${additions} entries, closed: ${closed}`);
    if (additions > 0) closed = false;
  }
  expect(closed).toBe(true);
  const ordered = [...entries.values()].sort((left, right) => (left.order < right.order ? -1 : left.order > right.order ? 1 : 0));
  const body = {
    schema: 'ai7.model-fixture/1',
    identity: WRITING_FIXTURE_IDENTITY,
    description: '写作契约 v1 的人工撰写夹具：逐单元阅读 sample1（ADR 0043 收录的 Public SampleBook）后写成，回答 J-07 为第二本书「写作旅程乙」起草宣传文章时发出的单元请求与一次全书综合。受众「喜欢历史与悬疑小说的读者」，渠道「出版社微信公众号」，没有其他要求；这本书没有基线分析、没有定稿的评估、没有作者与书系信息，本社也没有宣传文章范例，契约逐项写明本次不参考。每处段落都按其在单元消息中的位置引用它所依据的内容块，分为看点、人物与主题三类；全书综合只依据这些段落与参考信息写出文档的标题与各部分。unitOrdinal 为 0 的条目回答全书综合与这次运行的运行反思。',
    basedOn: null,
    provenance: 'authored',
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: ordered.map(({ entry }) => ({ unitOrdinal: entry.unitOrdinal, requestDigest: entry.requestDigest, response: entry.response })),
  };
  await writeFile(FIXTURE_PATH, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`wrote ${ordered.length} entries`);
}, 600_000);
