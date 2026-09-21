// The generator of the authored fixture `sample1-review-authored` (Issue #417). The findings below are
// the authored part: each was written after reading one Analysis Unit of exact `sample1` (ADR 0043), and
// each quotation is a verbatim substring of the block it names, except the four that are meant not to
// anchor. Everything else in the fixture — every request digest, and the answers to the assurance sample
// and the Run Report reflection those Runs send — depends on the three categories' frozen contracts and
// on the findings themselves, so it is derived by driving the real path until no Run asks anything new.
//
// It never runs in the Local Verification Ladder or in CI. After a clause, a label or the 工序 of one of
// the three built-in categories changes, regenerate the fixture with
//   AI7_REGENERATE_REVIEW_FIXTURE=1 pnpm exec vitest run tests/service/review-fixture-generator.test.ts
// and review the fixture's diff like any other change.
import { randomUUID } from 'node:crypto';
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
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, type ReviewUnitFinding } from '../../src/service/review/review-category-contract.js';
import { fixtureEntryKey, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { CoverageManifestProjection, LaunchPolicyProjection, ReviewCategoryProjection, ReviewCategoryTaskRequest } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { LITERARY_EXPRESSION, STYLE_AND_FORMAT, TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';

const FIXTURE_PATH = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), 'sample1-review-authored.json');
const J04_EDIT_SUFFIX = '，J-04 结果集形成后的确认编辑';
const ZERO = '一九九○年代';

const NOTE_ZERO = '汉字数字中的零应写作“〇”，不用圆圈符号“○”。';
const NOTE_SERIAL = '章节序号单独成段但未设为标题样式，与全书的标题层级体例不一致。';
const NOTE_WEEK = '对话中的时间表述需与全书的数字和时间用法保持一致。';
const NOTE_LAKE = '句末可以更凝练，收束更有余味。';

type Authored = Record<string, Record<number, ReviewUnitFinding[]>>;
const AUTHORED: Authored = {
  'typos-and-usage': {
    1: [
      { quote: '比较特别卜算', blockOrdinal: 10, severity: 'must', note: '“特别”与“卜算”之间缺少结构助词“的”。', replacement: '比较特别的卜算', clauseId: 'typos-and-usage/1' },
      { quote: ZERO, blockOrdinal: 15, severity: 'should', note: NOTE_ZERO, replacement: '一九九〇年代', clauseId: 'typos-and-usage/3' },
    ],
    2: [
      { quote: ZERO, blockOrdinal: 1, severity: 'should', note: NOTE_ZERO, replacement: '一九九〇年代', clauseId: 'typos-and-usage/3' },
      { quote: '一九八○年代', blockOrdinal: 7, severity: 'should', note: NOTE_ZERO, replacement: '一九八〇年代', clauseId: 'typos-and-usage/3' },
    ],
    3: [
      { quote: '邮证法', blockOrdinal: 18, severity: 'must', note: '“邮证法”应为“邮政法”。', replacement: '邮政法', clauseId: 'typos-and-usage/1' },
      { quote: '古怪', blockOrdinal: 18, severity: 'note', note: '同一段内“古怪”重复出现，可酌情替换其一。', replacement: '奇怪' },
    ],
    4: [{ quote: '马跃之上第一次谈恋爱', blockOrdinal: 14, severity: 'must', note: '“上”字多余，疑为衍文。', replacement: '马跃之第一次谈恋爱', clauseId: 'typos-and-usage/1' }],
    5: [{ quote: '一路上与好好聊聊天', blockOrdinal: 6, severity: 'must', note: '介词“与”后缺少宾语，句子成分残缺。', replacement: '一路上与曾本之好好聊聊天', clauseId: 'typos-and-usage/2' }],
    6: [], 7: [], 8: [],
  },
  'style-and-format': {
    1: [
      { quote: '《青铜重器》之一', blockOrdinal: 2, severity: 'note', note: '丛书名与序次的著录格式需与版权页、封面保持一致。', clauseId: 'style-and-format/3' },
      { quote: '壹', blockOrdinal: 4, severity: 'should', note: NOTE_SERIAL, clauseId: 'style-and-format/1' },
    ],
    2: [{ quote: '周一下午四点十分', blockOrdinal: 8, severity: 'note', note: '时间表述的数字用法（汉字或阿拉伯数字）需在全书范围内统一。', clauseId: 'style-and-format/2' }],
    3: [],
    4: [
      { quote: '拯之承启！', blockOrdinal: 6, severity: 'note', note: '甲骨文释文的呈现方式（是否加引号或改用其他字体）全书需统一。', clauseId: 'style-and-format/3' },
      { quote: '贰', blockOrdinal: 9, severity: 'should', note: NOTE_SERIAL, clauseId: 'style-and-format/1' },
      { quote: '上个星期', blockOrdinal: 17, severity: 'note', note: NOTE_WEEK, clauseId: 'style-and-format/2' },
    ],
    5: [{ quote: '上个星期', blockOrdinal: 1, severity: 'note', note: NOTE_WEEK, clauseId: 'style-and-format/2' }],
    6: [],
    7: [
      { quote: '一九七八年出土', blockOrdinal: 2, severity: 'note', note: '年份的数字用法需与全书体例统一。', clauseId: 'style-and-format/2' },
      { quote: '一九六六年', blockOrdinal: 17, severity: 'note', note: '年份的数字用法需与全书体例统一。', clauseId: 'style-and-format/2' },
    ],
    8: [],
  },
  'literary-expression': {
    1: [],
    2: [
      { quote: '极端少数之人', blockOrdinal: 2, severity: 'should', note: '“极端少数之人”搭配生硬，可改为更自然的说法。', replacement: '极少数人', clauseId: 'literary-expression/1' },
      { quote: '悄无声息地沉入湖底', blockOrdinal: 11, severity: 'note', note: NOTE_LAKE, replacement: '悄然沉入湖底', clauseId: 'literary-expression/2' },
    ],
    3: [
      { quote: '悄无声息地沉入湖底', blockOrdinal: 1, severity: 'note', note: NOTE_LAKE, replacement: '悄然沉入湖底', clauseId: 'literary-expression/2' },
      { quote: '秀色诱人的湖水', blockOrdinal: 2, severity: 'note', note: '“秀色诱人”略显俗套，可换用更贴合春日湖景的说法。', replacement: '波光潋滟的湖水', clauseId: 'literary-expression/2' },
    ],
    4: [],
    5: [{ quote: '更难的难题', blockOrdinal: 5, severity: 'should', note: '“更难的难题”用词重复。', replacement: '更棘手的难题', clauseId: 'literary-expression/1' }],
    6: [
      { quote: '像风一样流畅', blockOrdinal: 5, severity: 'note', note: '比喻可以更具体。', replacement: '像风一样轻快', clauseId: 'literary-expression/2' },
      { quote: '有诗意很优雅地戳着', blockOrdinal: 5, severity: 'should', note: '两个状语并列缺少连接，节奏不顺。', replacement: '既有诗意又很优雅地戳着', clauseId: 'literary-expression/1' },
    ],
    7: [{ quote: '不敢笑,又不能不笑', blockOrdinal: 18, severity: 'note', note: '此处应使用全角逗号。', replacement: '不敢笑，又不能不笑' }],
    8: [{ quote: '原样退出来', blockOrdinal: 2, severity: 'note', note: '“退出来”可改为更贴切的动词。', replacement: '原样抽出来', clauseId: 'literary-expression/1' }],
  },
};

/** What each authored quotation is meant to be once Reference Integrity has looked: `unique` unless stated. */
const EXPECTED_STATE: Record<string, 'not-found' | 'ambiguous'> = {
  'typos-and-usage:3:1': 'not-found',
  'typos-and-usage:3:2': 'ambiguous',
  'style-and-format:7:1': 'not-found',
  'literary-expression:6:1': 'not-found',
};

const DEFINITIONS = [TYPOS_AND_USAGE, STYLE_AND_FORMAT, LITERARY_EXPRESSION].map((input) => ({ input, definition: reviewCategoryKindDefinition(input) }));
const byCategory = new Map(DEFINITIONS.map((entry) => [entry.input.categoryId, entry.definition] as const));

interface Labelled { entry: ModelFixtureEntry; group: number; order: string }
const entries = new Map<string, Labelled>();
let additions = 0;

function add(entry: ModelFixtureEntry, group: number, order: string): void {
  const key = fixtureEntryKey(entry.unitOrdinal, entry.requestDigest);
  if (entries.has(key)) return;
  entries.set(key, { entry, group, order });
  fixture.entries.set(key, entry);
  additions += 1;
}

const fixture: ResolvedModelFixture & { entries: Map<string, ModelFixtureEntry> } = {
  identity: 'sample1-review-authored',
  description: 'generator',
  provenance: 'authored',
  lineage: [{ identity: 'sample1-review-authored', sha256: 'e'.repeat(64) }],
  entries: new Map(),
  sha256: 'f'.repeat(64),
};

function unitEntry(categoryIndex: number, categoryId: string, definition: AnalysisKindDefinition, unitOrdinal: number, unitDigest: string, variant: string): void {
  const findings = AUTHORED[categoryId]![unitOrdinal]!;
  add({
    unitOrdinal,
    requestDigest: definition.requestDigest(unitOrdinal, unitDigest),
    attempt: null,
    contentDigest: null,
    response: {
      kind: 'unit-result',
      text: JSON.stringify({ schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal, findings }),
      usage: { inputTokens: 1400 + unitOrdinal * 30, outputTokens: 60 + findings.length * 70 },
    },
  }, categoryIndex * 10, `${variant}:${String(unitOrdinal).padStart(2, '0')}`);
}

function manifestEntries(manifest: CoverageManifestProjection, variant: string): void {
  DEFINITIONS.forEach(({ input, definition }, index) => {
    for (const unit of manifest.units) unitEntry(index, input.categoryId, definition, unit.ordinal, unit.digest, variant);
  });
}

const SAMPLING_REASON = '引文经引文完整性逐字定位于其所声明的内容块，内容块按原样支持该发现的提法与定位。';
const REFLECTION_TEXT = JSON.stringify({
  schema: 'ai7.analysis.run-report-reflection-result/1',
  items: [
    { suggestion: '下一次运行可以维持当前的单元预算不变，本次没有任何单元因预算而失败。', basis: '账目中没有适配器失败或契约无效的缺口，计划内调整次数为 0。' },
    { suggestion: '未能形成发现的条目下一轮可要求模型给出更短、在内容块内唯一的引文，而不是重审整个单元。', basis: '账目按排除原因分别记录了未能定位的条数，已定位的发现按严重度分别计数。' },
    { suggestion: '稿件变化后优先只审改动过的单元，未改动的已审单元按血缘复用即可。', basis: '账目记录了本次提交、复用与未进入范围的单元数，复用单元不产生模型用量。' },
  ],
});

function harvest(categoryIndex: number, definition: AnalysisKindDefinition, settled: ReviewCategoryProjection, label: string): { closed: boolean } {
  const revision = settled.resultSetRevision!;
  const manifest = settled.coverageManifest!;
  const candidates = definition.assurance!.candidates({ components: { findings: revision.findings } } as unknown as AnalysisReductionResult);
  expect(candidates.length).toBeLessThanOrEqual(30);
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
    }, categoryIndex * 10 + 1, `${label}:${String(unitOrdinal).padStart(2, '0')}`);
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
      response: { kind: 'unit-result', text: REFLECTION_TEXT, usage: { inputTokens: 900, outputTokens: 210 } },
    }, categoryIndex * 10 + 2, label);
  }
  return { closed: sampleFinal && report.ifRedone.state === 'closed' };
}

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-s69-generate-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});
afterEach(async () => { await roots.dispose(); });

async function withBook<T>(body: (context: { store: EditorialStore; owner: BaselineAnalysisExecutionOwner; bookId: string; manuscriptId: string; branchId: string; revisionId: string }) => Promise<T>): Promise<T> {
  const scenarioRoots = await createServiceTestRoots('ai7-s69-generate-scenario-');
  const store = await EditorialStore.open(scenarioRoots.dataRoot, scenarioRoots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const imported = await importSample1Book(store, scenarioRoots.codeRoot, 'S69 夹具生成');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'S69 主编辑连接');
    const result = await body({ store, owner, ...imported });
    store.markCleanShutdown();
    return result;
  } finally {
    await owner.dispose();
    store.close();
    await scenarioRoots.dispose();
  }
}

async function run(
  context: { store: EditorialStore; owner: BaselineAnalysisExecutionOwner; bookId: string },
  categoryId: string,
  request: ReviewCategoryTaskRequest,
  label: string,
  variant: string,
): Promise<{ settled: ReviewCategoryProjection; closed: boolean }> {
  const definition = byCategory.get(categoryId)!;
  const categoryIndex = DEFINITIONS.findIndex((entry) => entry.input.categoryId === categoryId);
  let progress = context.store.createReviewCategoryPreparationWork(context.bookId, definition, request, launchPolicy);
  while (!progress.done) progress = context.store.advanceReviewCategoryPreparationWork(definition, progress.workId!);
  const prepared = progress.projection!;
  manifestEntries(prepared.coverageManifest!, variant);
  const authorized = context.store.authorizeReviewCategory(context.bookId, definition, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(authorized.dispatchRunRecordId).not.toBeNull();
  context.owner.admitAndDispatch(authorized.dispatchRunRecordId!, context.store.reviewCategoryLedger(definition));
  await context.owner.whenIdle();
  const settled = context.store.inspectReviewCategory(context.bookId, definition);
  expect(settled.state).toBe('settled');
  return { settled, ...harvest(categoryIndex, definition, settled, label) };
}

function appendToFirstBlock(store: EditorialStore, manuscriptId: string, branchId: string): void {
  const window = store.getManuscriptWindow(manuscriptId, branchId, null);
  const block = window.blocks[0]!;
  const graphemes = store.baselineAnalysisLedger.readWorkingBlocks(branchId).find((entry) => entry.blockId === block.blockId)!.graphemes;
  store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId, branchId, baseRevisionId: window.revisionId, blockId: block.blockId,
    windowStartBlockId: block.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
    fromGrapheme: graphemes, toGrapheme: graphemes, insertText: J04_EDIT_SUFFIX,
  });
}

async function pass(): Promise<boolean> {
  let allClosed = true;
  const note = (closed: boolean): void => { allClosed = allClosed && closed; };
  // S1: typos — first whole review, an acknowledged edit, then only what changed.
  await withBook(async (context) => {
    const first = await run(context, 'typos-and-usage', { mode: 'review-first', selectedRange: null }, 'a-first', 'a');
    note(first.closed);
    // Every authored quotation is what it is meant to be against the committed blocks.
    const blocks = new Map(context.store.baselineAnalysisLedger.readRevisionBlocks(context.manuscriptId, context.revisionId).map((block) => [block.blockId, block] as const));
    const manifest = first.settled.coverageManifest!;
    for (const [categoryId, units] of Object.entries(AUTHORED)) {
      for (const [unitOrdinal, findings] of Object.entries(units)) {
        const unit = manifest.units[Number(unitOrdinal) - 1]!;
        const ids = [...unit.overlapBlockIds, ...unit.blockIds];
        findings.forEach((finding, index) => {
          const state = locateQuotation(blocks.get(ids[finding.blockOrdinal - 1]!)!.text, finding.quote).state;
          const expected = EXPECTED_STATE[`${categoryId}:${unitOrdinal}:${index + 1}`] ?? 'verified';
          expect(state, `${categoryId} unit ${unitOrdinal} finding ${index + 1}`).toBe(expected);
        });
      }
    }
    appendToFirstBlock(context.store, context.manuscriptId, context.branchId);
    note((await run(context, 'typos-and-usage', { mode: 'review-sync', selectedRange: null }, 'b-sync', 'b')).closed);
    // The two other categories over the edited manuscript too, so each has its edited unit 1.
    note((await run(context, 'style-and-format', { mode: 'review-first', selectedRange: null }, 'c-first-after-edit', 'b')).closed);
    note((await run(context, 'literary-expression', { mode: 'review-first', selectedRange: null }, 'c-first-after-edit', 'b')).closed);
  });
  // S2: literary — a first review of one range, then another range that carries the first forward.
  await withBook(async (context) => {
    note((await run(context, 'literary-expression', { mode: 'review-first-range', selectedRange: { startPosition: 16, endPosition: 43 } }, 'd-first-range', 'a')).closed);
    note((await run(context, 'literary-expression', { mode: 'review-range', selectedRange: { startPosition: 60, endPosition: 75 } }, 'e-range', 'a')).closed);
  });
  // S3: style — a whole first review and the whole manuscript again; literary whole as well.
  await withBook(async (context) => {
    note((await run(context, 'style-and-format', { mode: 'review-first', selectedRange: null }, 'a-first', 'a')).closed);
    note((await run(context, 'style-and-format', { mode: 'review-again', selectedRange: null }, 'f-again', 'a')).closed);
    note((await run(context, 'literary-expression', { mode: 'review-first', selectedRange: null }, 'a-first', 'a')).closed);
  });
  return allClosed;
}

it.runIf(process.env['AI7_REGENERATE_REVIEW_FIXTURE'] === '1')('generates the authored review fixture', async () => {
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
    identity: 'sample1-review-authored',
    description: "编辑审阅契约 v1 的人工撰写夹具：逐单元阅读 sample1（ADR 0043 收录的 Public SampleBook）后写成，回答内置审阅类别配置中的三个类别——错别字与规范用语、体例与格式、文学性与表达改进——在全书审阅、只审改动过的章、全书重新审阅、所选范围审阅与所选范围重新审阅下发出的单元请求，也覆盖 J-04 在结果集形成后确认的编辑所改变的单元 1。每条引文都是其所声明内容块的逐字子串；另有四条故意不能唯一定位（三条找不到，一条多处出现），用来证明排除附录，并有三组引文与替换文字都相同的发现出现在相邻单元的重叠内容块中，用来证明合并。unitOrdinal 为 0 的条目回答这些运行发起的保证抽样与运行反思：抽样判定一律为「成立」，理由只说明引文经引文完整性逐字定位于其所声明的内容块，这是这一步能据本单元内容块作出的全部判断。本夹具叠加在 sample1-baseline-transient-retry 之上：同一次启动既能运行基线分析——审阅「情节逻辑与前后一致」的线索来自它——也能运行这三个审阅类别；两者的请求摘要互不相同，叠加不改变任何条目的键。",
    // Layered over the baseline's J-04 fixture (Issue #417, Stage B): one launch bound to this fixture
    // runs the baseline analysis the plot-consistency leads come from and the categories beside it.
    // `basedOn` changes no request digest, so the generator never needs the base's entries.
    basedOn: 'sample1-baseline-transient-retry',
    provenance: 'authored',
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: ordered.map(({ entry }) => ({ unitOrdinal: entry.unitOrdinal, requestDigest: entry.requestDigest, response: entry.response })),
  };
  await writeFile(FIXTURE_PATH, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`wrote ${ordered.length} entries: ${ordered.map((entry) => `${entry.group}/${entry.order}`).join(' ')}`);
}, 600_000);
