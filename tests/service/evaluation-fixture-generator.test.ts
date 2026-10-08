// The generator of the authored fixture `sample1-evaluation-authored` (Issue #429, plan slice S81b1). The observations and the
// synthesis below are the authored part: each observation was written after reading one Analysis Unit of exact `sample1` (ADR
// 0043) and cites, by its position in the unit message, the blocks it rests on; the synthesis scores the five items of the
// built-in Evaluation Profile from those observations alone. Everything else in the fixture — every request digest, and the
// answer to the Run Report reflection the Run sends — depends on the frozen evaluation contract and on the authored part, so it
// is derived by driving the real path until no Run asks anything new.
//
// It never runs in the Local Verification Ladder or in CI. After the evaluation contract or the built-in profile changes,
// regenerate the fixture with
//   AI7_REGENERATE_EVALUATION_FIXTURE=1 pnpm exec vitest run tests/service/evaluation-fixture-generator.test.ts
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
  INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
  INITIAL_EVALUATION_UNIT_RESULT_SCHEMA,
  initialEvaluationObservationSetDigest,
  initialEvaluationSynthesisRequestDigest,
  type InitialEvaluationObservation,
  type InitialEvaluationSynthesisResult,
} from '../../src/service/evaluation/initial-evaluation-contract.js';
import { fixtureEntryKey, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';

const FIXTURE_IDENTITY = 'sample1-evaluation-authored';
const FIXTURE_PATH = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)), `${FIXTURE_IDENTITY}.json`);

const observe = (itemId: string, note: string, ...blockOrdinals: number[]): InitialEvaluationObservation => ({ itemId, note, blockOrdinals });

/**
 * One unit's observations each. `读者与市场潜力` is never observed — nothing in what AI7 reads speaks to readers or a market —
 * so its 依据充分度 reads `不足`; `主题、价值与社会文化语境` is observed in three of the eight ranges, `一般`; the other three in
 * most of them, `充分`.
 */
export const AUTHORED_OBSERVATIONS: Readonly<Record<number, ReadonlyArray<InitialEvaluationObservation>>> = {
  1: [
    observe('literary-quality', '开篇以两句对仗的题辞起笔，语义相反相成，立即确立全书的思辨气质。', 5, 6),
    observe('literary-quality', '写信又撕信的细节反复出现，以动作写心事，含蓄而有张力。', 8, 14),
    observe('structure-and-coherence', '以一封写不成的信引出两位弟子的悬念，并用八年前弟子被带走埋下伏笔。', 13, 14),
    observe('chinese-language', '叙述语言凝练，长句中夹用俗语，节奏从容。', 10),
    observe('theme-and-context', '借七十小寿与“老省长”的评价，写学界与官场之间的人情往来。', 10, 11),
  ],
  2: [
    observe('structure-and-coherence', '甲骨文来信与写信人早已去世的设定构成核心悬念，推动后续情节。', 6, 7),
    observe('literary-quality', '收信地址写得极其具体，以细节制造诡异感。', 8, 9),
    observe('chinese-language', '打水漂一段写得生动，但个别比喻略显俗套。', 11),
  ],
  3: [
    observe('literary-quality', '东湖春景与甲骨文梦境交织，写景与写心相互映照。', 2, 3),
    observe('structure-and-coherence', '邮递员递信的场景节奏紧凑，对白推动情节，拆信时才揭示四个甲骨文字。', 7, 8, 11, 15),
    observe('chinese-language', '对白口语自然，人物各有声口。', 19),
  ],
  4: [
    observe('structure-and-coherence', '揭示信的内容与落款印章，回应开篇消失的弟子，第一章在此收束。', 6, 7, 8),
    observe('literary-quality', '两位学者互相调侃的段落写出各自的性情。', 14, 15, 16),
    observe('chinese-language', '第二章开头两句格言式短句与第一章的题辞呼应。', 10, 11),
  ],
  5: [
    observe('literary-quality', '电话中三人斗嘴，人物关系在笑谈中显出亲疏。', 2, 3, 4),
    observe('chinese-language', '个别句子成分残缺，介词之后缺少宾语，需要校改。', 6),
    observe('structure-and-coherence', '宁波之行的安排在此敲定，为后文外出埋下线索。', 6, 9),
  ],
  6: [
    observe('theme-and-context', '以新省长与楚庄王的比附引出史评，触及学人与权力的关系。', 3, 4),
    observe('literary-quality', '以越王勾践剑作比，写出话语的锋利。', 5),
    observe('structure-and-coherence', '主人公决定暂不向女婿提及来信，人物关系的裂隙由此加深。', 8),
  ],
  7: [
    observe('literary-quality', '放大镜察看尊盘照片的细节与家庭场景交替，节奏张弛有度。', 2, 4),
    observe('theme-and-context', '翁婿对话把“青铜重器成为当代重器”的说法摆上台面，点出学术与名利的冲突。', 16, 17),
    observe('structure-and-coherence', '悬而未决的考古问题被一一提出，扩展了故事的纵深。', 17),
    observe('chinese-language', '家常对白生动，孩子的童言为紧张的气氛提供缓冲。', 7, 8),
  ],
  8: [
    observe('literary-quality', '入夜后家中声音渐次消失，以静写人物内心的不安。', 3, 6),
    observe('structure-and-coherence', '以放大镜细看来信收束本章，与章首撕信遥相呼应。', 6),
    observe('chinese-language', '对称谓的交代简洁地写出家庭中的分寸。', 4),
  ],
};

/** The synthesis over those observations: a score in whole or half points within each item's 满分, and the rest. */
export const AUTHORED_SYNTHESIS: InitialEvaluationSynthesisResult = {
  schema: INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA,
  items: [
    { itemId: 'literary-quality', score: 16.5, comment: '细节与意象运用纯熟，写景与写心相互映照，人物各有性情；个别比喻略显俗套。' },
    { itemId: 'theme-and-context', score: 15, comment: '触及学界与权力、学术与名利的关系，但在所读部分只在三个阅读范围中展开。' },
    { itemId: 'structure-and-coherence', score: 15.5, comment: '以甲骨文来信设置核心悬念，伏笔与呼应清楚，章节收束有力。' },
    { itemId: 'chinese-language', score: 14, comment: '叙述凝练、对白自然；个别句子成分残缺，需要逐句校改。' },
    { itemId: 'readers-and-market', score: 12, comment: '所读内容中没有关于目标读者与市场的依据，这一项依据不足，分数只作参考。' },
  ],
  strengths: ['以甲骨文来信设置悬念，开篇即抓住读者。', '人物对白各具声口，学者间的调侃写出性情。'],
  weaknesses: ['个别句子成分残缺，需要逐句校改。', '比喻偶有俗套，可以更贴切。'],
  nextStep: '先校改残句与俗套的比喻，再补充目标读者与同类书的资料，以便判断市场潜力。',
  suggestedConclusion: 'revise',
  // The market section (Issue #429, S81b2; EVAL-009): only what the observations above say of the Book itself — no sales figure,
  // no other house's book, no award record — so 市场回报 is 暂无法预测 and 评奖可能性 states its in-book basis.
  market: {
    readers: ['对考古、青铜器与古文字题材有兴趣的成年读者。', '关注学界人情、学术与名利之争的知识分子读者。'],
    sellingPoints: ['以一封甲骨文来信开篇设下悬念，学术悬疑贯穿始终。', '学者之间的对白各具声口，写出学界中人的性情与分寸。'],
    channels: ['可从书中的考古与青铜器话题切入，面向文史爱好者推介。', '以学术与名利的冲突为话题，组织书评与读书会讨论。'],
    marketReturn: null,
    awards: {
      statement: '有参评文学奖的潜力，但确定性低。',
      basis: '所读部分叙述凝练、意象运用纯熟，并触及学术与权力的主题；没有对比任何获奖作品。',
    },
  },
};

const REFLECTION_TEXT = JSON.stringify({
  schema: 'ai7.analysis.run-report-reflection-result/1',
  items: [
    { suggestion: '下一次初评可以维持当前的单元预算不变，本次没有任何阅读范围因预算而失败。', basis: '账目中没有适配器失败或契约无效的缺口，计划内调整次数为 0。' },
    { suggestion: '依据不足的评分项可在补充资料后重新初评，而不是只调整综合的分数。', basis: '账目按依据充分度分别计数了各评分项。' },
  ],
});

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
const entries = new Map<string, { entry: ModelFixtureEntry; order: string }>();
let additions = 0;

const fixture: ResolvedModelFixture & { entries: Map<string, ModelFixtureEntry> } = {
  identity: FIXTURE_IDENTITY,
  description: 'generator',
  provenance: 'authored',
  lineage: [{ identity: FIXTURE_IDENTITY, sha256: 'e'.repeat(64) }],
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
  roots = await createServiceTestRoots('ai7-s81b-generate-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});
afterEach(async () => { await roots.dispose(); });

/** One pass of J-11's 初评: a fresh import of exact sample1, its first 初评 run to its end on what the fixture holds so far. */
async function pass(): Promise<boolean> {
  const scenario = await createServiceTestRoots('ai7-s81b-generate-pass-');
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
    const imported = await importSample1Book(store, scenario.codeRoot, 'S81b 夹具生成');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'S81b 主编辑连接');
    let progress = store.createInitialEvaluationPreparationWork(imported.bookId, launchPolicy);
    while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
    const prepared = progress.projection!;
    const manifest = prepared.coverageManifest!;
    const definition = store.initialEvaluationLedger.definition;
    expect(manifest.units.length).toBe(Object.keys(AUTHORED_OBSERVATIONS).length);
    for (const unit of manifest.units) {
      const observations = AUTHORED_OBSERVATIONS[unit.ordinal]!;
      add({
        unitOrdinal: unit.ordinal,
        requestDigest: definition.requestDigest(unit.ordinal, unit.digest),
        attempt: null,
        contentDigest: null,
        response: {
          kind: 'unit-result',
          text: JSON.stringify({ schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, observations }),
          usage: { inputTokens: 1500 + unit.ordinal * 40, outputTokens: 80 + observations.length * 60 },
        },
      }, `a:${String(unit.ordinal).padStart(2, '0')}`);
    }
    const closed = manifest.units.map((unit) => ({
      unitOrdinal: unit.ordinal,
      result: { schema: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, observations: AUTHORED_OBSERVATIONS[unit.ordinal]! },
    }));
    add({
      unitOrdinal: 0,
      requestDigest: initialEvaluationSynthesisRequestDigest(definition.promptContractDigest, initialEvaluationObservationSetDigest(closed)),
      attempt: null,
      contentDigest: null,
      response: { kind: 'unit-result', text: JSON.stringify(AUTHORED_SYNTHESIS), usage: { inputTokens: 2400, outputTokens: 520 } },
    }, 'b:synthesis');
    const authorized = store.authorizeInitialEvaluation(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.initialEvaluationLedger);
    await owner.whenIdle();
    const settled = store.inspectInitialEvaluation(imported.bookId);
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
    return settled.resultSetRevision!.evaluation.synthesis.state === 'closed' && report.ifRedone.state === 'closed';
  } finally {
    await owner.dispose();
    store.close();
    await scenario.dispose();
  }
}

it.runIf(process.env['AI7_REGENERATE_EVALUATION_FIXTURE'] === '1')('generates the authored evaluation fixture', async () => {
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
    identity: FIXTURE_IDENTITY,
    description: '评估契约 v1 的人工撰写夹具：逐单元阅读 sample1（ADR 0043 收录的 Public SampleBook）后写成，回答内置评估方案（审稿评估方案第 1 版）下 AI7 初评发出的八个单元请求与一次全书综合。每条依据都按其在单元消息中的位置引用它所依据的内容块；「读者与市场潜力」在所读内容中没有任何依据，「主题、价值与社会文化语境」只在三个阅读范围中有依据，用来证明依据充分度的三档。全书综合只依据这些依据给出五个评分项的整数或半分初评分数、评语、主要优点、主要问题、下一步建议与建议结论「修改后再议」，并写出市场部分：目标读者、差异化卖点、渠道与策略各两条，市场回报暂无法预测，评奖可能性只说明它在书稿内的依据。unitOrdinal 为 0 的条目回答全书综合与这次运行的运行反思。本夹具叠加在 sample1-baseline-happy 之上：同一次启动既能运行基线分析，也能运行 AI7 初评；两者的请求摘要互不相同，叠加不改变任何条目的键。',
    basedOn: 'sample1-baseline-happy',
    provenance: 'authored',
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: ordered.map(({ entry }) => ({ unitOrdinal: entry.unitOrdinal, requestDigest: entry.requestDigest, response: entry.response })),
  };
  await writeFile(FIXTURE_PATH, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`wrote ${ordered.length} entries`);
}, 600_000);
