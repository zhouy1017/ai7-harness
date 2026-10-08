// The generator of the authored fixture `sample1-series-consistency-authored` (Issue #64, plan slice S29a). The findings below
// are the authored part: each was written after reading one Analysis Unit of exact `sample1` (ADR 0043) against the one clause
// J-13's Series Knowledge gives 书系一致性 — 地点「海边小城」, whose name the trilogy writes as its first book does — and each
// quotation is a verbatim substring, unique in the block it names. Everything else — every request digest, and the answers to
// the assurance sample and the Run Report reflection the Run sends — depends on the clause and on the findings, so it is
// derived by driving the real path, a Review Run of 书系一致性 over the Book's Series Knowledge, until no Run asks anything new.
//
// It never runs in the Local Verification Ladder or in CI. After the clause building of `series-consistency.ts`, the
// category's 工序 or J-13's knowledge changes, regenerate the fixture with
//   AI7_REGENERATE_SERIES_CONSISTENCY_FIXTURE=1 pnpm exec vitest run tests/service/series-consistency-fixture-generator.test.ts
// and review the fixture's diff like any other change.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  assuranceSampleDigest,
  assuranceSamplingRequestDigest,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import type { AnalysisKindDefinition, AnalysisReductionResult } from '../../src/service/analysis/kind-definition.js';
import { locateQuotation } from '../../src/service/analysis/factual-review-contract.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, type ReviewUnitFinding } from '../../src/service/review/review-category-contract.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { seriesConsistencyEntry, seriesConsistencyFromSources } from '../../src/service/review/series-consistency.js';
import { fixtureEntryKey, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection, ReviewCategoryProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { J13_EDITOR_WORDS, J13_PLACE, J13_SERIES_TITLE, makeJ13Series } from '../support/series-consistency.js';

const IDENTITY = 'sample1-series-consistency-authored';
const FIXTURE_PATH = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), `${IDENTITY}.json`);
const CLAUSE = 'series-knowledge/1';

/** Findings by unit: place names whose spelling the Series fixes by its first book. */
const AUTHORED: Record<number, ReviewUnitFinding[]> = {
  1: [],
  2: [{ quote: '东湖公园', blockOrdinal: 8, severity: 'should', note: '书系知识规定三部曲里的地名以第一部的写法为准；「东湖公园」在本书首次出现，请与第一部核对写法后再定。', clauseId: CLAUSE }],
  3: [],
  4: [{ quote: '水果湖一家银行', blockOrdinal: 14, severity: 'note', note: '「水果湖」在本书多处出现，作为地名请与书系第一部的写法保持一致。', clauseId: CLAUSE }],
  5: [],
  6: [{ quote: '武珞路', blockOrdinal: 6, severity: 'note', note: '街道名「武珞路」请按书系第一部的写法核对，书系内各书统一。', clauseId: CLAUSE }],
  7: [],
  8: [],
};

/**
 * The definition J-13's Review Run executes: the house's 书系一致性 resolved from the one Series and item J-13 holds. The
 * identities are placeholders, since the clauses never carry them; the suite checks this is the contract the store froze.
 */
function definitionOfJ13(): AnalysisKindDefinition {
  const house = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => entry.categoryId === 'series-consistency')!;
  const resolution = seriesConsistencyFromSources([{ seriesId: 'series', title: J13_SERIES_TITLE }], [{
    seriesId: 'series',
    title: J13_SERIES_TITLE,
    items: [{ itemId: 'item', subject: J13_PLACE, knowledgeClass: 'places', revisionId: 'revision', ordinal: 2, content: J13_EDITOR_WORDS }],
  }]);
  return reviewCategoryKindDefinition(reviewCategoryContractInput(seriesConsistencyEntry(house, resolution)));
}

const DEFINITION = definitionOfJ13();

interface Labelled { entry: ModelFixtureEntry; group: number; order: string }
const entries = new Map<string, Labelled>();
let additions = 0;

const fixture: ResolvedModelFixture & { entries: Map<string, ModelFixtureEntry> } = {
  identity: IDENTITY,
  description: 'generator',
  provenance: 'authored',
  lineage: [{ identity: IDENTITY, sha256: 'e'.repeat(64) }],
  entries: new Map(),
  sha256: 'f'.repeat(64),
};

function add(entry: ModelFixtureEntry, group: number, order: string): void {
  const key = fixtureEntryKey(entry.unitOrdinal, entry.requestDigest);
  if (entries.has(key)) return;
  entries.set(key, { entry, group, order });
  fixture.entries.set(key, entry);
  additions += 1;
}

const SAMPLING_REASON = '引文经引文完整性逐字定位于其所声明的内容块，内容块按原样支持该发现的提法与定位。';
const REFLECTION_TEXT = JSON.stringify({
  schema: 'ai7.analysis.run-report-reflection-result/1',
  items: [
    { suggestion: '下一次运行可以维持当前的单元预算不变，本次没有任何单元因预算而失败。', basis: '账目中没有适配器失败或契约无效的缺口，计划内调整次数为 0。' },
    { suggestion: '书系知识纳入新的版本后，书系一致性审阅的依据随之改变，应重新审阅全书而不是复用旧的单元结果。', basis: '账目记录了本次提交与复用的单元数；依据条款改变时，没有单元可以复用。' },
  ],
});

function harvest(settled: ReviewCategoryProjection): boolean {
  const revision = settled.resultSetRevision!;
  const manifest = settled.coverageManifest!;
  const candidates = DEFINITION.assurance!.candidates({ components: { findings: revision.findings } } as unknown as AnalysisReductionResult);
  const byUnit = new Map<number, typeof candidates[number][]>();
  for (const candidate of candidates) byUnit.set(candidate.unitOrdinal, [...(byUnit.get(candidate.unitOrdinal) ?? []), candidate]);
  for (const [unitOrdinal, listed] of [...byUnit].sort(([left], [right]) => left - right)) {
    const unit = manifest.units[unitOrdinal - 1]!;
    add({
      unitOrdinal: 0,
      requestDigest: assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, unitOrdinal, unit.digest, assuranceSampleDigest(listed)),
      attempt: null,
      contentDigest: null,
      response: {
        kind: 'unit-result',
        text: JSON.stringify({
          schema: 'ai7.analysis.assurance-sampling-result/1',
          dispositions: listed.map((_candidate, index) => ({ ref: `{{ref:${index + 1}}}`, disposition: '成立', reason: SAMPLING_REASON })),
        }),
        usage: { inputTokens: 1600 + unitOrdinal * 30, outputTokens: 40 + listed.length * 60 },
      },
    }, 1, String(unitOrdinal).padStart(2, '0'));
  }
  const sample = revision.assuranceSample;
  const sampleFinal = sample.state === 'closed' || (sample.state === 'not-run' && candidates.length === 0);
  const report = settled.taskOutcome!.report!;
  if (sampleFinal) {
    add({
      unitOrdinal: 0,
      requestDigest: runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, report.accountingDigest),
      attempt: null,
      contentDigest: null,
      response: { kind: 'unit-result', text: REFLECTION_TEXT, usage: { inputTokens: 900, outputTokens: 180 } },
    }, 2, 'reflection');
  }
  return sampleFinal && report.ifRedone.state === 'closed';
}

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-s29-generate-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});
afterEach(async () => { await roots.dispose(); });

/** J-13's member Book reviewed for 书系一致性 through a Review Run, from 先看计划 to its findings on the manuscript. */
async function pass(): Promise<boolean> {
  const scenarioRoots = await createServiceTestRoots('ai7-s29-generate-scenario-');
  const store = await EditorialStore.open(scenarioRoots.dataRoot, scenarioRoots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  try {
    const { bookId, manuscriptId, revisionId } = await importSample1Book(store, scenarioRoots.codeRoot, '星河之三');
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    recordMissingCredentialConnection(store, 'S29 主编辑连接');
    makeJ13Series(store, bookId);
    let progress = store.createReviewRunPreparationWork(bookId, ['series-consistency'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, launchPolicy);
    while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
    const run = progress.projection!.run!;
    // The Task the Run froze is this definition's: the same contract, so the same request digests.
    const prepared = store.inspectReviewCategory(bookId, DEFINITION);
    expect(prepared.taskIntent?.taskIntentId).toBe(run.categories[0]!.taskIntentId);
    expect(prepared.planEnvelope?.promptContractDigest).toBe(DEFINITION.promptContractDigest);
    const manifest = prepared.coverageManifest!;
    const blocks = new Map(store.baselineAnalysisLedger.readRevisionBlocks(manuscriptId, revisionId).map((block) => [block.blockId, block] as const));
    for (const unit of manifest.units) {
      const findings = AUTHORED[unit.ordinal]!;
      const ids = [...unit.overlapBlockIds, ...unit.blockIds];
      findings.forEach((finding, index) => {
        expect(locateQuotation(blocks.get(ids[finding.blockOrdinal - 1]!)!.text, finding.quote).state, `unit ${unit.ordinal} finding ${index + 1}`).toBe('verified');
      });
      add({
        unitOrdinal: unit.ordinal,
        requestDigest: DEFINITION.requestDigest(unit.ordinal, unit.digest),
        attempt: null,
        contentDigest: null,
        response: {
          kind: 'unit-result',
          text: JSON.stringify({ schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, findings }),
          usage: { inputTokens: 1400 + unit.ordinal * 30, outputTokens: 60 + findings.length * 70 },
        },
      }, 0, String(unit.ordinal).padStart(2, '0'));
    }
    store.authorizeReviewRun(bookId, run.reviewRunId, [{ categoryId: 'series-consistency', planEnvelopeDigest: run.categories[0]!.planEnvelopeDigest! }]);
    await driver.drive(run.reviewRunId);
    const settled = store.inspectReviewCategory(bookId, DEFINITION);
    expect(settled.state).toBe('settled');
    const closed = harvest(settled);
    store.markCleanShutdown();
    return closed;
  } finally {
    await driver.dispose();
    await owner.dispose();
    store.close();
    await scenarioRoots.dispose();
  }
}

it.runIf(process.env['AI7_REGENERATE_SERIES_CONSISTENCY_FIXTURE'] === '1')('generates the authored series-consistency fixture', async () => {
  await requireExactSample1(roots.codeRoot);
  let closed = false;
  for (let index = 0; index < 6 && !closed; index += 1) {
    additions = 0;
    closed = await pass();
    // eslint-disable-next-line no-console
    console.log(`pass ${index + 1}: +${additions} entries, all closed: ${closed}`);
    if (additions > 0) closed = false;
  }
  expect(closed).toBe(true);
  const ordered = [...entries.values()].sort((left, right) => left.group - right.group || (left.order < right.order ? -1 : left.order > right.order ? 1 : 0));
  const body = {
    schema: 'ai7.model-fixture/1',
    identity: IDENTITY,
    description: '编辑审阅契约 v1 下「书系一致性」的人工撰写夹具：逐单元阅读 sample1（ADR 0043 收录的 Public SampleBook）后写成，对照 J-13 的书系知识——书系「星河三部曲」的地点「海边小城」，三部曲里的地名以第一部的写法为准——这一条依据（series-knowledge/1），回答这本书在全书审阅下发出的八个单元请求。三条发现都指出本书中需要与书系第一部核对写法的地名，每条引文都是其所声明内容块的逐字子串并在块内唯一；其余单元没有发现。unitOrdinal 为 0 的条目回答这次运行发起的保证抽样与运行反思：抽样判定一律为「成立」，理由只说明引文经引文完整性逐字定位于其所声明的内容块，这是这一步能据本单元内容块作出的全部判断。',
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
