import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
// The generator of the authored fixture `sample1-custom-analysis-authored` (Issue #922, slice 7f). The rows below are the
// authored part: one synthetic 自定义分析维度 — 「单元开篇」, asking each unit where it begins — answered for each Analysis Unit of
// exact `sample1` (ADR 0043) after reading the unit's opening blocks; each quotation is a verbatim substring of the block it
// names, except the one that is meant not to be found. Everything else in the fixture — every request digest, and the answer
// to the Run Report reflection the Run sends — depends on the dimension's frozen contract and on the rows themselves, so it is
// derived by driving the real path until no Run asks anything new.
//
// It never runs in the Local Verification Ladder or in CI. After the dimension's words or the contract change, regenerate with
//   AI7_REGENERATE_CUSTOM_ANALYSIS_FIXTURE=1 pnpm exec vitest run tests/service/custom-analysis-fixture-generator.test.ts
// and review the fixture's diff like any other change.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import { CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA, type CustomAnalysisUnitRow } from '../../src/service/analysis/custom-analysis-contract.js';
import { customAnalysisKindDefinition } from '../../src/service/analysis/custom-analysis-kind.js';
import { locateQuotation } from '../../src/service/analysis/factual-review-contract.js';
import { fixtureEntryKey, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CUSTOM_DIMENSION_TEMPLATE, CUSTOM_DIMENSION_TITLE } from '../support/custom-analysis.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

const FIXTURE_PATH = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), 'sample1-custom-analysis-authored.json');

/** Each unit's rows: the block ordinal counts the overlap block first, as the unit message lists it. */
const AUTHORED: Record<number, CustomAnalysisUnitRow[]> = {
  1: [{ answer: '本单元先列出书名、丛书序次与作者，再以章节序号「壹」进入正文。', blockOrdinal: 2, quote: '《青铜重器》之一', confidenceNote: '开篇几段是署名与序号，判断明确。' }],
  2: [{ answer: '本单元从曾本之收到一封信写起，先交代他坚持用书信与人往来的习惯。', blockOrdinal: 3, quote: '曾本之刚刚收到一封信。', confidenceNote: '开篇直接点出收信一事，依据充分。' }],
  3: [
    { answer: '本单元从湖边一声春雷写起，转入曾本之反复梦见甲骨文的情形。', blockOrdinal: 2, quote: '湖面上刚刚响过一声春雷', confidenceNote: '雷声与梦境在开篇两段相继出现，依据充分。' },
    { answer: '开篇的雷声与梦中的雷声前后呼应。', blockOrdinal: 2, quote: '湖心岛上雷雨大作', confidenceNote: '这条引文是概括性的改写，原文中可能找不到逐字对应。' },
  ],
  4: [{ answer: '本单元从曾本之琢磨那封甲骨文书信写起，信上只写了四个字。', blockOrdinal: 3, quote: '甲骨文书信上只竖着写了四个字。', confidenceNote: '开篇两段都在写这封信，依据充分。' }],
  5: [{ answer: '本单元从马跃之与安静的电话玩笑写起，引出曾、马两家的旧交。', blockOrdinal: 4, quote: '曾本之在电话这边笑，马跃之在电话那边笑。', confidenceNote: '电话场景贯穿开篇几段，依据充分。' }],
  6: [{ answer: '本单元从马跃之转述下午的会议写起，郑雄在会上恭维新上任的省长。', blockOrdinal: 2, quote: '这是新省长上任后的第一个会', confidenceNote: '开篇交代了会议的由来，依据充分。' }],
  7: [{ answer: '本单元从曾本之对着尊盘照片出神写起，随后女儿和外孙到家。', blockOrdinal: 2, quote: '对着墙上那幅精心装饰的曾侯乙尊盘照片呆坐了一阵', confidenceNote: '开篇一段写照片，下一段转入家人到来，判断明确。' }],
  8: [{ answer: '本单元从深夜的书房写起，曾本之放下照片，端详一片刻有甲骨文的龟甲。', blockOrdinal: 2, quote: '盯着一片半个巴掌大小、上面有一串甲骨文的龟甲', confidenceNote: '开篇一段写书房里的龟甲，依据充分。' }],
};
/** The one row meant not to anchor: its quotation is not in the block it names. */
const NOT_FOUND = new Set(['3:2']);

const REFLECTION_TEXT = JSON.stringify({
  schema: 'ai7.analysis.run-report-reflection-result/1',
  items: [
    { suggestion: '下一次运行可以维持当前的单元预算不变，本次没有任何单元因预算而失败。', basis: '账目中没有适配器失败或契约无效的缺口，计划内调整次数为 0。' },
    { suggestion: '未能定位的回答下一轮可要求模型给出更短、在所指段落中唯一的引文。', basis: '账目按引文是否定位分别记录了回答条数。' },
    { suggestion: '稿件变化后优先同步到当前稿件，未改动的单元按血缘复用即可。', basis: '账目记录了本次提交与复用的单元数，复用单元不产生模型用量。' },
  ],
});

const entries = new Map<string, ModelFixtureEntry>();
let additions = 0;

const fixture: ResolvedModelFixture & { entries: Map<string, ModelFixtureEntry> } = {
  identity: 'sample1-custom-analysis-authored',
  description: 'generator',
  provenance: 'authored',
  lineage: [{ identity: 'sample1-custom-analysis-authored', sha256: 'e'.repeat(64) }],
  entries: new Map(),
  sha256: 'f'.repeat(64),
};

function add(entry: ModelFixtureEntry): void {
  const key = fixtureEntryKey(entry.unitOrdinal, entry.requestDigest);
  if (entries.has(key)) return;
  entries.set(key, entry);
  fixture.entries.set(key, entry);
  additions += 1;
}

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-922-generate-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});
afterEach(async () => { await roots.dispose(); });

/** J-04's scenario: a fresh, unedited sample1 Book; the dimension defined and enabled; its first Run. */
async function pass(): Promise<boolean> {
  const scenarioRoots = await createServiceTestRoots('ai7-922-generate-scenario-');
  const store = await EditorialStore.open(scenarioRoots.dataRoot, scenarioRoots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const book = await importSample1Book(store, scenarioRoots.codeRoot, '7f 夹具生成');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, '7f 主编辑连接');
    const saved = store.saveCustomAnalysisDimension({ dimensionId: null, title: CUSTOM_DIMENSION_TITLE, questionTemplate: CUSTOM_DIMENSION_TEMPLATE });
    const dimension = saved.dimensions[0]!;
    const version = dimension.versions[0]!;
    store.enableCustomAnalysisDimension(version.versionId);
    const definition = customAnalysisKindDefinition({
      dimensionId: dimension.dimensionId, versionId: version.versionId, version: version.version, documentDigest: version.documentDigest,
      questionTemplate: version.questionTemplate, title: version.title,
    });
    const prepared = store.prepareCustomAnalysis({ bookId: book.bookId, dimensionId: dimension.dimensionId, update: null }, launchPolicy);
    const task = store.inspectAnalysisTask(book.bookId, prepared.taskIntentId);
    const manifest = task.coverageManifest!;
    // Every authored quotation is what it is meant to be against the committed blocks.
    const blocks = new Map(store.baselineAnalysisLedger.readRevisionBlocks(book.manuscriptId, book.revisionId).map((block) => [block.blockId, block] as const));
    for (const unit of manifest.units) {
      const rows = AUTHORED[unit.ordinal]!;
      const ids = [...unit.overlapBlockIds, ...unit.blockIds];
      rows.forEach((row, index) => {
        const state = locateQuotation(blocks.get(ids[row.blockOrdinal - 1]!)!.text, row.quote).state;
        expect(state, `unit ${unit.ordinal} row ${index + 1}`).toBe(NOT_FOUND.has(`${unit.ordinal}:${index + 1}`) ? 'not-found' : 'verified');
      });
      add({
        unitOrdinal: unit.ordinal,
        requestDigest: definition.requestDigest(unit.ordinal, unit.digest),
        attempt: null,
        contentDigest: null,
        response: {
          kind: 'unit-result',
          text: JSON.stringify({ schema: CUSTOM_ANALYSIS_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, rows }),
          usage: { inputTokens: 1300 + unit.ordinal * 25, outputTokens: 80 + rows.length * 60 },
        },
      });
    }
    const authorized = store.authorizeBaselineAnalysis(book.bookId, prepared.taskIntentId, task.planEnvelope!.digest);
    expect(authorized.dispatchRunRecordId).not.toBeNull();
    owner.admitAndDispatch(authorized.dispatchRunRecordId!, authorized.ledger);
    await owner.whenIdle();
    const settled = store.inspectAnalysisTask(book.bookId, prepared.taskIntentId);
    expect(settled.state).toBe('settled');
    const report = settled.taskOutcome!.report!;
    add({
      unitOrdinal: 0,
      requestDigest: runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, report.accountingDigest),
      attempt: null,
      contentDigest: null,
      response: { kind: 'unit-result', text: REFLECTION_TEXT, usage: { inputTokens: 900, outputTokens: 200 } },
    });
    store.markCleanShutdown();
    return report.ifRedone.state === 'closed';
  } finally {
    await owner.dispose();
    store.close();
    await scenarioRoots.dispose();
  }
}

it.runIf(process.env['AI7_REGENERATE_CUSTOM_ANALYSIS_FIXTURE'] === '1')('generates the authored custom analysis fixture', async () => {
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
  const ordered = [...entries.values()].sort((left, right) => (left.unitOrdinal === 0 ? 99 : left.unitOrdinal) - (right.unitOrdinal === 0 ? 99 : right.unitOrdinal));
  const body = {
    schema: 'ai7.model-fixture/1',
    identity: 'sample1-custom-analysis-authored',
    description: '自定义分析契约 v1 的人工撰写夹具：为一个合成的自定义分析维度「单元开篇」（每个单元从哪里开始写）逐单元阅读 sample1（ADR 0043 收录的 Public SampleBook）的开篇段落后写成，回答该维度第 1 版在未经编辑的 sample1 上的首次运行。每条引文都是其所声明段落的逐字子串，另有一条故意找不到，用来证明未定位的回答仍被保留并标明。unitOrdinal 为 0 的条目回答这次运行发起的运行反思。本夹具叠加在 sample1-baseline-happy 之上：「自定义」分页与运行无需先完成基线分析；两者的请求摘要互不相同，叠加不改变任何条目的键。',
    // Layering preserves baseline compatibility; J-04 runs this dimension before any baseline on its Book.
    basedOn: 'sample1-baseline-happy',
    provenance: 'authored',
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: ordered.map((entry) => ({ unitOrdinal: entry.unitOrdinal, requestDigest: entry.requestDigest, response: entry.response })),
  };
  await writeFile(FIXTURE_PATH, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`wrote ${ordered.length} entries`);
}, 600_000);
