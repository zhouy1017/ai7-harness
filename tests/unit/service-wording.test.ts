import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { findTerms, maskSource } from '../../tools/words-report.mjs';
import type { ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import type { BaselineAnalysisProjection } from '../../src/shared/protocol.js';
import {
  CLARIFICATION_WHY, baselineCancellationImpact, budgetCeilingLabel, categoryResendDisclosure, clarificationQuestion, defaultRuleBindingRows,
  groupedCount, positionLabel, readRange, redoGoalSentence, resendDisclosure, withResumeBlockers, writingMaterialReferenceLine, writingReferenceLines,
  RESUME_BLOCKED_CONNECTION, RESUME_BLOCKED_OFFLINE,
} from '../../src/service/task-plan.js';
import { activeRunReason, changedModeUnavailableReason } from '../../src/service/analysis/run-state.js';
import { completedWithGapsLabel } from '../../src/shared/analysis-run-summary.js';
import {
  backgroundCeilingTooLowReason, backgroundDriftReason, backgroundRunReportLines, backgroundScopeLabel, backgroundScopeMemberActiveReason,
  backgroundScopeMemberUnreadableReason,
} from '../../src/service/background-analysis-enrollments.js';
import { SERVICE_SENTENCE_RULES, factualLimitationWords, backgroundSwitchWords, ordinaryServiceWords, serviceGoalWords, serviceWords, stateWords } from '../../src/renderer/service-wording.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { taskBarView, taskPlanLastEdit, taskPlanWording, TASK_BAR_WAITING_SLOT_NOTE } from '../../src/renderer/task-drawer-labels.js';
import { rendererErrorMessage } from '../../src/renderer/error-words.js';
import { taskPlanFixture } from '../support/task-plan-fixture.js';
import { KNOWN_RAW, NOT_SHOWN } from './service-wording.buckets.js';
import { pausedDetail, resumableDetail, accountLimitDetail, BUDGET_REACHED_NEXT_ACTION } from '../../src/service/analysis/execution.js';
import { awaitingClarificationDetail } from '../../src/service/analysis/clarifications.js';
import { taskMaterialRefusal, taskMaterialReferenceLine } from '../../src/service/task-material-references.js';
import { WRITING_MATERIALS_STATEMENT } from '../../src/service/writing-tasks.js';
import { coverageAxis } from '../../src/service/analysis/reducers.js';
import { evaluationReportOpenReason } from '../../src/service/evaluation-records.js';
import { seriesScopeChangedReason, SERIES_SCOPE_STOP_SUMMARY } from '../../src/service/series-exclusions.js';
import { createStatusSurface } from '../../src/renderer/notifications.js';
import { evaluationMaterialsField } from '../../src/renderer/evaluation.js';
import { reviewSendConsequence } from '../../src/renderer/review-labels.js';
import { reviewSynthesisNode } from '../../src/renderer/review-synthesis.js';
import { taskMaterialSelectionReason } from '../../src/renderer/task-material-selection.js';
import { installMiniDom } from '../support/mini-dom.js';
import type { ReviewSynthesisProjection } from '../../src/shared/protocol.js';

// Issue #1531 (review N1–N3, B1): service-authored sentences are reworded for ordinary mode by whole-sentence rules only — a
// title, a name, a heading, a destination, the editor's goal and a model's words never change. Every sentence with a banned
// term in all service/shared modules the renderer shows stands, by its file and text (never a line number), in exactly one place: a
// rule (its samples made by the service's own functions), NOT_SHOWN or KNOWN_RAW (#1616). Synthetic sentences only.

type Span = { kind: string; found: string };
const banned = (text: string): string[] => (findTerms(text) as Span[]).filter((span) => span.kind === 'banned').map((span) => span.found);
const outside = (text: string): string => text.replace(/《[^》]*》|「[^」]*」/gu, '');

const MODULES = ['src/service', 'src/shared'].flatMap((directory) => readdirSync(directory, { recursive: true })
  .filter((file): file is string => typeof file === 'string' && file.endsWith('.ts'))
  .map((file) => (directory === 'src/service' ? '' : '../shared/') + file.replaceAll('\\', '/'))).sort();

/** One service file's source lines and, for each, the fragments of string text the scan sees there. */
type Source = ReadonlyArray<{ readonly raw: string; readonly fragments: ReadonlyArray<string> }>;
function sourceOf(text: string): Source {
  const scan = maskSource(text);
  expect(scan.lostSync, 'wording source scanner must parse the complete module').toBe(false);
  const masked = (scan.text as string).split('\n');
  return text.split('\n').map((raw, index) => ({ raw, fragments: (masked[index] ?? '').split(/\s{3,}/u).map((part) => part.trim()).filter((part) => part !== '') }));
}
const read = (file: string): string => readFileSync(`src/service/${file}`, 'utf8');

function block(position: number, kind: ManifestBlockInput['kind'], graphemes: number, text = '合成占位'): ManifestBlockInput {
  return { blockId: `b${String(position).padStart(4, '0')}`, position, kind, level: kind === 'heading' ? 1 : null, text, digest: 'a'.repeat(64), graphemes };
}
const BLOCKS = [block(1, 'title', 4, '合成书名'), block(2, 'heading', 3, '第一章'), block(3, 'paragraph', 1200), block(4, 'paragraph', 800),
  block(5, 'heading', 3, '第二章'), block(6, 'paragraph', 500)];
type Run = NonNullable<BaselineAnalysisProjection['run']>;
const progress = (overrides: Partial<NonNullable<Run['progress']>> = {}): NonNullable<Run['progress']> => ({
  unitsTotal: 8, unitsSettled: 2, currentUnitOrdinal: 3, currentUnitStartedAt: '2026-09-24T01:00:30.000Z', attemptState: 'dispatched',
  completedAttempts: 2, longestSettledUnitMs: 10, stage: 'units', lastTransitionAt: '2026-09-24T01:00:00.000Z', ...overrides });
const run = (state: Run['state'], live: Run['progress']): Run => ({ runRecordId: 'run', state, stateLabel: '', recordedAt: '2026-09-24T01:00:00.000Z',
  transitions: [], adaptations: [], blockedReasons: null, blockedBy: null, progress: live, attempt: null });
const update = { reusedUnits: 1 } as never;
const where = (range: { startPosition: number; endPosition: number } | null): string => positionLabel(readRange(BLOCKS, range));
const chars = (range: { startPosition: number; endPosition: number } | null): string => groupedCount(readRange(BLOCKS, range).graphemes);

/**
 * The families' samples, by service file (`file#n`), made by the service's own functions — a family's samples are those of its
 * file its shape matches; where the sentence is composed inside a plan
 * builder (an internal template), its variable parts come from the service's helpers and its text is checked against the
 * source line by the coverage test.
 */
const PRODUCED: Readonly<Record<string, () => ReadonlyArray<string>>> = {
  'analysis/baseline-analysis-store.ts#1616': () => ["所选文字已扩展为所在的 3 个完整段落；任务按包含这些段落的阅读范围处理。","全书；所选文字已扩展为所在的 3 个完整段落；任务按包含这些段落的阅读范围处理。","计划的关键内容已经变化：模型服务、工序。这次运行不能照原计划续行；请改计划重做。"],
  'review/review-runs.ts#1616': () => ["所选文字已扩展为所在的 3 个完整段落；任务按包含这些段落的阅读范围处理。","全书；所选文字已扩展为所在的 3 个完整段落；任务按包含这些段落的阅读范围处理。","「文字与表达」所依据的书系或书系知识在准备之后有了变化；请重新准备这次审阅。","任务运行预算上限：80,000 tokens","「文字与表达」的计划需要重新准备。","「文字与表达」的计划已经变化；请重新准备这次审阅。","文字与表达（已读 2/8 个阅读范围；未读第 3–8 范围）","基线概述（缺少第 3–8 阅读范围）","本社审阅偏好 v2","已读完 2/8 个阅读范围；部分检查未完成；已完成范围的发现仍可处理。","「文字与表达」参考的本社审阅偏好版本中，有学习材料在这次审阅之后停止今后使用。这次审阅的结果、发现和报告都保持原样；这个标记不表示结果有错。","「文字与表达」参考的本社审阅偏好记录无法读取，无法核对它的学习材料是否已停止今后使用；请重新准备这次审阅。","「文字与表达」参考的本社审阅偏好 v2 中有 3 条学习材料已停止今后使用；请重新准备这次审阅，新的计划不含该影响。"],
  'task-intent-drafts.ts#1616': () => ["所选文字已扩展为所在的 3 个完整段落；任务按包含这些段落的阅读范围处理。","全书；所选文字已扩展为所在的 3 个完整段落；任务按包含这些段落的阅读范围处理。"],
  'analysis/clarifications.ts#1616': () => ["已读完 2 / 8 个阅读范围；第 3 个、第 5 个阅读范围在等你的回答，回答后接着做。"],
  'analysis/execution.ts#1616': () => ["已暂停：全部 8 个阅读范围都已读完，结果都已保存。点「续行」只处理尚未完成的步骤，已保存的步骤不会重做。","已在阅读范围之间暂停：已读完 2 / 8 个阅读范围，结果都已保存。点「续行」从下一个阅读范围接着读。","AI7 关闭时这项任务正在运行：全部 8 个阅读范围都已读完，结果都已保存。点「续行」接着做之后的归纳与抽样；在此之前不会发送任何内容。","AI7 关闭时这项任务正在运行：已读完 2 / 8 个阅读范围，结果都已保存。点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。","模型服务账户限额：模型服务按账户限额拒绝了请求，这项任务已停下。全部 8 个阅读范围都已读完，结果都已保存。处理好模型服务、限额解除后点「续行」接着做之后的归纳与抽样；在此之前不会发送任何内容。","模型服务账户限额：模型服务按账户限额拒绝了请求，这项任务已停下。已读完 2 / 8 个阅读范围，结果都已保存。处理好模型服务、限额解除后点「续行」从下一个阅读范围接着读；在此之前不会发送任何内容。","等待运行的队列已满（最多 8 项）；没有开始这项任务。请等已有任务开始或取消后，再重新准备并开始。","运行名额已满：本实例一次执行 4 个运行。","受保护凭据库中没有你为 主编辑模型 保存的凭据；请在 设置 › 模型服务 重新输入。未发起任何传输。","续行：新的执行区段；已读完的 2 个阅读范围沿用，接着读其余 6 个。","运行终态：cancelled；按你的取消在阅读范围之间停止，已完成的结果与缺口均已保留，没有读到的阅读范围记为未尝试；结果集修订版 revision-1（Revision 2）。"],
  'analysis/factual-review-reducers.ts#1616': () => ["覆盖：部分 · 2/8 单元 · 1 个范围外未核查 · 5 处缺口"],
  'analysis/reducers.ts#1616': () => ["覆盖：部分 · 2/8 单元 · 6 处缺口","覆盖：部分 · 2/8 单元 · 6 处缺口 · 复用 1 单元"],
  'analysis/request-admission-operations.ts#1616': () => ["第 3 个阅读范围的抽样请求已发出而结果无法确认；本次运行不会再次发送。"],
  'analysis/run-report.ts#1616': () => ["第 3 个阅读范围的模型问题：已回答。"],
  'captured-procedures.ts#1616': () => ["这次审阅按可复用工序《合成工序》第 2 版准备，本机没有这一版；请重新准备这次审阅。","这次审阅按可复用工序《合成工序》第 2 版准备，这一版已停用；请重新准备这次审阅。"],
  'evaluation-records.ts#1616': () => ["第 2 版已经是这份 AI7 评估报告，直接在报告上修改即可。"],
  'factual-verification.ts#1616': () => ["锚点已失效：不能在已改动的文字上准备更正提案。"],
  'house-review-preference.ts#1616': () => ["本社审阅偏好 v2（来源：3 条已判定反馈）"],
  'initial-evaluation-operations.ts#1616': () => ["AI7 初评暂不可用：模型未连接。"],
  'manuscript-apply.ts#1616': () => ["将创建一次新的受控应用，撤销 3 项精确修改；原应用凭据保持原样。"],
  'provider/egress-gate.ts#1616': () => ["连接测试只在本机正式使用下发送；当前环境（未知）不读取凭据，也不发送任何内容。"],
  'readers-reports.ts#1616': () => ["本社有 2 份审稿意见范例的学习准入记录已损坏，无法读取，本次不参考范例：《合成范例甲》、《合成范例乙》","另有 1 份范例的学习准入记录已损坏，无法读取，本次不参考：《合成范例》"],
  'series-exclusions.ts#1616': () => ["书系检索范围已变化 · 需要重新确认计划：所依据的书系材料已排除在书系检索之外，运行在下一个阅读范围前停下；已读完的结果保留，已经发给模型服务的内容无法收回。","「文字与表达」：书系检索范围已变化 · 需要重新确认计划——它所依据的《合成书》在这次审阅准备之后被排除在书系检索之外；请重新准备这次审阅。","2 次已准备、尚未授权的审阅不能再授权，需要重新准备。","以后的书系检索重新可以读取《合成书》；要用到它，仍要重新准备计划并授权。","以后的书系检索重新可以读取《合成书》涉及的 2 个书系知识条目；要用到它们，仍要重新准备计划并授权。"],
  'series.ts#1616': () => ["《合成书》有 3 项学习材料，其中 2 项已决定学习准入。"],
  'store.ts#1616': () => ["《合成书》AI7 初评"],
  'task-material-references.ts#1616': () => ["可以在「评估」重新准备计划。","资料已停止使用；已有的结果仍可查看，再次运行需重新准备计划"],
  'writing-task-operations.ts#1616': () => ["第 2 版定稿评估的结论「合成结论」、主要优点（这一版没有 AI7 初评的市场部分）"],
  'writing-tasks.ts#1616': () => ["这次起草参考的资料《合成资料》，计划冻结的索引版本已不在本机，不能再开始；可以用「新建文档…」重新准备。","这次起草参考的资料《合成资料》现在不能列进这本书任务的「允许参考」，不能再开始；可以用「新建文档…」重新准备。","这次起草参考的资料《合成资料》的索引记录已损坏，不能再开始；可以用「新建文档…」重新准备。"],
  '../shared/protocol/series.ts#1616': () => ["所参考的本社审阅偏好已停止使用 · 需要重新确认计划：它参考的偏好版本中有学习材料已停止今后使用，运行在下一个阅读范围前停下；已读完的结果保留，已经发给模型服务的内容无法收回。"],
  'analysis/execution.ts#service-functions': () => [pausedDetail(8, 8), pausedDetail(2, 8), resumableDetail(8, 8), resumableDetail(2, 8), accountLimitDetail(8, 8), accountLimitDetail(2, 8)],
  'analysis/clarifications.ts#service-functions': () => [awaitingClarificationDetail([3, 5], 2, 8)],
  'analysis/reducers.ts#service-functions': () => [coverageAxis({ unitsClosed: 2, unitsTotal: 8, unitsReused: 1, gapCount: 6 }).label],
  'evaluation-records.ts#service-functions': () => [evaluationReportOpenReason(2)],
  'series-exclusions.ts#service-functions': () => [SERIES_SCOPE_STOP_SUMMARY, seriesScopeChangedReason('文字与表达', ['《合成书》'])],
  'task-material-references.ts#composed': () => (['审阅', '评估', '写作'] as const).flatMap((surface) => {
    const refusal = taskMaterialRefusal({ title: '资金缺口与凭据', characters: 3000 } as Parameters<typeof taskMaterialRefusal>[0], 'MATERIAL_INDEX_MOVED', surface);
    return [refusal.refusal!.message, taskMaterialReferenceLine(refusal)];
  }),
  'analysis/execution.ts#composed': () => ['模型服务暂时出错（TEMPORARY_FAILURE）；本社审阅偏好已停止使用，没有再试一次'],
  // Stage-4/5 rework R6: the finished Run's count, the update mode's reason, and the plan preview's composed lines.
  '../shared/analysis-run-summary.ts#rework-r6': () => [completedWithGapsLabel(1, 8)],
  'analysis/run-state.ts#rework-r6': () => [changedModeUnavailableReason('同步到当前稿件')],
  // 0.7.9 wording follow-up: a Task of the same kind under way, the fixed fact-check document in a plan's reference row, and 资料库 reference lines.
  'analysis/run-state.ts#wording-079': () => [activeRunReason('executing'), activeRunReason('executing', 'evaluation'), activeRunReason('executing', 'review-run')],
  'review/category-configuration.ts#wording-079': () => ['事实核查：事实核查契约 · 断言列举与引文定位'],
  'writing-tasks.ts#wording-079': () => [WRITING_MATERIALS_STATEMENT],
  'task-material-references.ts#wording-079': () => [taskMaterialReferenceLine({ source: { title: '合成资料', characters: 3000 }, refusal: null } as Parameters<typeof taskMaterialReferenceLine>[0])],
  'analysis/execution.ts#rework-r6': () => ['未完成：没有单元读成 · 没有收到可用的模型回答。'],
  'task-launch-preview.ts#rework-r6': () => (['允许', '先问我', '不允许'] as const).map((choice) => `模型服务暂时出错时，同一个阅读范围安全地再试一次：${choice}`),
  'task-plan.ts#1': () => [resendDisclosure([2, 3]), resendDisclosure([4])],
  'task-plan.ts#2': () => [categoryResendDisclosure([{ category: '事实核查', units: [4] }, { category: '体例与格式', units: [1, 2] }])],
  'task-plan.ts#3': () => [budgetCeilingLabel({ kind: 'tokens', maxTotalTokens: 80000 }), `任务运行预算上限：${groupedCount(240000)} tokens（2 类合计）`,
    `任务运行预算上限：${groupedCount(240000)} tokens；各成员的模型阶段按工序份额分用`],
  'task-plan.ts#4': () => [`《合成书》${where(null)} · ${chars(null)} 字 · 8 个阅读范围`,
    `《合成书》${where({ startPosition: 2, endPosition: 4 })} · ${chars({ startPosition: 2, endPosition: 4 })} 字 · 重新分析 2 个阅读范围（${where({ startPosition: 3, endPosition: 4 })}），沿用 6 个`,
    `《合成书》${where({ startPosition: 2, endPosition: 6 })} · ${chars({ startPosition: 2, endPosition: 6 })} 字 · 重新分析 2 个阅读范围，沿用 6 个`],
  'task-plan.ts#5': () => [`所读阅读范围的稿件正文（${where({ startPosition: 3, endPosition: 4 })}），以及所选工序中的编辑任务说明和豁免规则`,
    '全书各阅读范围的稿件正文（8 个），以及汇总时各项依据的说明', '全书各阅读范围的稿件正文（8 个）与定稿的评估记录，以及汇总时各处段落的说明',
    '全书各阅读范围的稿件正文（8 个）、上面列出的参考材料——其中包括其他图书的范例原文与资料库资料原文——与你写的受众、渠道和要求，以及汇总时各处段落的说明',
    '全书各阅读范围的稿件正文（8 个）与这一版评估的评分和评语，以及汇总时各项依据的说明',
    `所读范围内的稿件正文（${where({ startPosition: 2, endPosition: 4 })}）和所选类别的规范条款，以及上面列出的资料库资料原文，以及本社审阅偏好的摘录`,
    `所读范围内的稿件正文（${where({ startPosition: 2, endPosition: 4 })}）和所选类别的规范条款，以及本社审阅偏好的摘录，以及本社审阅偏好 v2的摘录，发往 模型（tokens-pro）`],
  'task-plan.ts#6': () => ['逐章读取（重新读取 2 个阅读范围，沿用 6 个）', `逐章读取（重新读取 ${where({ startPosition: 3, endPosition: 4 })}，沿用其余 6 个阅读范围）`],
  'task-plan.ts#7': () => [`达到 ${groupedCount(80000)} tokens 后不再发送新的请求（8 个阅读范围）`],
  'task-plan.ts#8': () => [`至多 ${groupedCount(240000)} tokens（各成员按工序份额分用）`, `至多 ${groupedCount(240000)} tokens（2 类合计）`],
  'task-plan.ts#9': () => [writingReferenceLines({ synopsis: null, evaluation: { conclusion: '缺口在第二章', strengths: ['甲', '乙', '丙'], market: null },
    type: { label: '审稿意见' }, exemplars: [], book: { title: '合成书', authors: [], editors: [], series: [] }, audience: '编辑部', channel: '内部', requirements: null } as never)[1]!],
  'task-plan.ts#10': () => [writingMaterialReferenceLine({ source: { title: '出版社经验谈', characters: 3000 }, refusal: { code: 'OTHER' } } as never, true)],
  'task-plan.ts#11': () => [CLARIFICATION_WHY],
  'task-plan.ts#12': () => [clarificationQuestion(3)],
  'task-plan.ts#13': () => [
    ...baselineCancellationImpact(run('executing', progress()), update, null),
    ...baselineCancellationImpact(run('executing', progress()), null, null),
    ...baselineCancellationImpact(run('executing', progress({ currentUnitOrdinal: null })), null, null),
    ...baselineCancellationImpact(run('executing', progress({ stage: 'cross-unit-reduction', currentUnitOrdinal: null })), null, null),
    ...baselineCancellationImpact(run('paused', null), update, { unitsSettled: 3, unitsTotal: 8, bindingHolds: true }),
    ...baselineCancellationImpact(run('paused', null), null, { unitsSettled: 3, unitsTotal: 8, bindingHolds: false }),
    ...baselineCancellationImpact(run('paused', null), null, { unitsSettled: 0, unitsTotal: 8 }),
    ...baselineCancellationImpact(run('executing', null), null, { unitsSettled: 0, unitsTotal: 8 }),
    ...baselineCancellationImpact(run('paused', null), null, { unitsSettled: 0, unitsTotal: 8, waiting: [], unconfirmed: [] }),
    ...baselineCancellationImpact(run('paused', null), null, { unitsSettled: 3, unitsTotal: 8, waiting: [], unconfirmed: [] }),
    ...baselineCancellationImpact(run('executing', null), null, null),
  ],
  'task-plan.ts#14': () => baselineCancellationImpact(run('executing', progress()), update, { unitsSettled: 5, unitsTotal: 10, bindingHolds: true,
    waiting: [{ unitOrdinal: 6, answered: false }, { unitOrdinal: 7, answered: true }], unconfirmed: [4] }).slice(0, 1),
  'task-plan.ts#15': () => baselineCancellationImpact(run('paused', null), null, { unitsSettled: 5, unitsTotal: 10, bindingHolds: true,
    waiting: [{ unitOrdinal: 6, answered: false }, { unitOrdinal: 7, answered: true }], unconfirmed: [4] }).slice(1),
  'task-plan.ts#16': () => [redoGoalSentence({ reused: 2, recomputed: 6, invalidated: 0, bypassed: 0 })],
  'task-plan.ts#17': () => ['然后准备一项新任务：沿用这 2 个阅读范围的结果，接着读其余 6 个；开始之前可以先改计划。',
    '然后准备一项新任务：沿用其中有结果的 2 个阅读范围，其余 6 个（含留下缺口的 1 个）重新读；开始之前可以先改计划。'],
  'task-plan.ts#18': () => ['这项任务会在这里停下并取消；它还没有读完任何阅读范围，不会形成结果集修订版。',
    '这项任务会在这里停下并取消；已读完的 3 个阅读范围保留在一份新的结果集修订版里，没读到的记为未尝试。',
    '这项任务会在这里停下并取消；执行绑定已经变化，已读完的 3 个阅读范围不能沿用，不会形成结果集修订版。'],
  'task-plan.ts#19': () => ['文字与表达：参考本社审阅偏好', '事实核查：参考本社审阅偏好 v2'],
  'task-plan.ts#20': () => [defaultRuleBindingRows({ providerBinding: { providerId: 'opencode-go', modelId: 'tokens-pro', credentialReference: 'ref-1' },
    artifactPin: { identity: '基线分析', version: 'v1', sidecarRevision: 1 }, runBudgetCeiling: 'unset', outboundDataCategory: 'x', expectedOutcome: 'y' } as never)[0]!.value],
  'analysis/run-state.ts#1': () => (['proxy-unreachable', 'model-service-unreachable', 'outcome-unknown', 'shutdown'] as const).map((why) => activeRunReason('resumable', undefined, why)),
  'analysis/run-state.ts#2': () => [activeRunReason('authorized'), activeRunReason('authorized', 'review-run')],
  'background-analysis-enrollments.ts#1': () => [backgroundCeilingTooLowReason(3)],
  'background-analysis-enrollments.ts#2': () => [...backgroundRunReportLines({ ordinal: 1, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: null, usedTokens: 0, reached: false }),
    ...backgroundRunReportLines({ ordinal: null, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: null, usedTokens: 0, reached: false })],
  'background-analysis-enrollments.ts#3': () => [backgroundRunReportLines({ ordinal: 1, scopeLabel: backgroundScopeLabel('series', '乙', 3), ceilingTokens: 1000, shareTokens: 334, frozenTokens: null, usedTokens: 0, reached: false })[1]!,
    backgroundRunReportLines({ ordinal: 1, scopeLabel: backgroundScopeLabel('book', '甲', 1), ceilingTokens: 1000, shareTokens: 1000, frozenTokens: null, usedTokens: 0, reached: false })[1]!],
  'background-analysis-enrollments.ts#4': () => [backgroundRunReportLines({ ordinal: 1, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: 334, usedTokens: 334, reached: true })[1]!,
    backgroundRunReportLines({ ordinal: 1, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: 334, usedTokens: 120, reached: false })[1]!],
  'background-analysis-enrollments.ts#5': () => [backgroundDriftReason(['模型服务', '工序'])],
  'background-analysis-enrollments.ts#6': () => [backgroundScopeMemberActiveReason('乙')],
  'background-analysis-enrollments.ts#7': () => [backgroundScopeMemberUnreadableReason('乙')],
};
type Rule = (typeof SERVICE_SENTENCE_RULES)[number];
const produced = (file: string): ReadonlyArray<string> => Object.entries(PRODUCED).filter(([name]) => name.split('#')[0] === file).flatMap(([, make]) => make());
const RULE_SAMPLES = new Map(SERVICE_SENTENCE_RULES.map((rule) => [rule, rule.exact !== undefined ? [rule.exact] : produced(rule.file).filter((sample) => rule.family!.test(sample))]));
const samplesOf = (rule: Rule): ReadonlyArray<string> => RULE_SAMPLES.get(rule)!;
const covers = (sample: string, text: string): boolean => text.split(/\s{2,}/u).every((piece) => sample.includes(piece));
const nameOf = (rule: Rule): string => `${rule.file} ${rule.exact ?? String(rule.family)}`;

/**
 * Where each banned fragment of all service/shared modules stands (by file and text): a site an entry of NOT_SHOWN or KNOWN_RAW names
 * by its text is that entry's; every other site must be a rule's. A line number is used for the message only.
 */
function placement(readFile: (file: string) => string): { misplaced: string[]; stale: string[] } {
  const sources = new Map(MODULES.map((file) => [file, sourceOf(readFile(file))]));
  const entries = [...NOT_SHOWN.map((entry) => ({ ...entry, bucket: 'NOT_SHOWN' })), ...KNOWN_RAW.map((entry) => ({ ...entry, bucket: 'KNOWN_RAW' }))];
  const misplaced = MODULES.flatMap((file) => sources.get(file)!.flatMap(({ raw, fragments }, index) => fragments.filter((text) => banned(text).length > 0).map((text) => {
    const named = entries.filter((entry) => entry.file === file && raw.includes(entry.text)).map((entry) => entry.bucket);
    const exactly = SERVICE_SENTENCE_RULES.some((rule) => rule.file === file && rule.exact === text);
    const ruled = SERVICE_SENTENCE_RULES.some((rule) => rule.file === file && samplesOf(rule).some((sample) => covers(sample, text)));
    const owners = named.length > 0 ? [...named, ...(exactly ? ['an exact rule'] : [])] : ruled ? ['rule'] : [];
    return owners.length === 1 ? null : `${file} (now line ${index + 1}) 「${text}」 in ${owners.length === 0 ? 'none' : owners.join(' and ')}`;
  }))).filter((entry): entry is string => entry !== null);
  const fragmentsIn = (file: string): ReadonlyArray<string> => (sources.get(file) ?? sourceOf(readFile(file))).flatMap((line) => line.fragments);
  const stale = [
    ...SERVICE_SENTENCE_RULES.filter((rule) => !fragmentsIn(rule.file).some((text) => rule.exact !== undefined ? text === rule.exact
      : samplesOf(rule).some((sample) => covers(sample, text)))).map((rule) => `rule ${nameOf(rule)}`),
    ...entries.filter((entry) => !(sources.get(entry.file) ?? []).some(({ raw, fragments }) => raw.includes(entry.text) && fragments.some((text) => banned(text).length > 0)))
      .map((entry) => `${entry.bucket} ${entry.file} 「${entry.text}」`),
  ];
  return { misplaced, stale };
}
const wordsOf = (rule: (typeof SERVICE_SENTENCE_RULES)[number], sample: string): string => rule.underSwitch === true ? backgroundSwitchWords(sample) : ordinaryServiceWords(sample);

beforeEach(() => setTechnicalLayerVisible(false));
afterEach(() => setTechnicalLayerVisible(false));

describe('the service-authored sentences of all service/shared modules', () => {
  it('stand, by file and text, in exactly one of a rule, NOT_SHOWN and KNOWN_RAW — a new sentence or a stale entry fails, named', () => {
    expect(placement(read)).toEqual({ misplaced: [], stale: [] });
    expect(KNOWN_RAW).toEqual([]);
    expect(NOT_SHOWN.every((entry) => entry.why.trim().length > 0)).toBe(true);
  });

  it('are placed without a line number: a line shift alone fails nothing', () => {
    expect(placement((file) => `\n\n${read(file).replace(/\n/u, '\n\n')}`)).toEqual({ misplaced: [], stale: [] });
  });

  it('fail by name on a new sentence, and on an entry whose text has gone', () => {
    const added = placement((file) => file === 'task-plan.ts' ? `${read(file)}\nexport const PROBE = '这项任务现在不能续行。';\n` : read(file));
    expect(added.misplaced).toEqual([expect.stringMatching(/^task-plan\.ts \(now line \d+\) 「这项任务现在不能续行。」 in none$/u)]);
    const gone = placement((file) => file === 'background-analysis-enrollments.ts' ? read(file).replace('后台处理登记的预算上限无效。', '预算上限无效。') : read(file));
    expect(gone.stale).toEqual(['rule background-analysis-enrollments.ts 后台处理登记的预算上限无效。']);
    const shared = placement((file) => file === '../shared/report-wording.ts' ? read(file) + "\nexport const PROBE = '尚未取得凭据，不能读取。';\n" : read(file));
    expect(shared.misplaced).toEqual([expect.stringMatching(/^..\/shared\/report-wording\.ts \(now line \d+\) 「尚未取得凭据，不能读取。」 in none$/u)]);
  });

  it('every family has samples the service made, and each reads in the table\'s words and differs from the service\'s', () => {
    expect(SERVICE_SENTENCE_RULES.filter((rule) => samplesOf(rule).length === 0).map(nameOf)).toEqual([]);
    expect(SERVICE_SENTENCE_RULES.flatMap((rule) => samplesOf(rule).map((sample) => ({ rule, sample, words: wordsOf(rule, sample) })))
      .filter(({ sample, words }) => words === sample || banned(outside(words)).length > 0)
      .map(({ rule, words }) => `${nameOf(rule)}: ${words}`)).toEqual([]);
  });

  it('keep a title, a heading, a destination, a category, the editor\'s goal and a model\'s words exactly as they are (review N1, S4, B1 f)', () => {
    expect(ordinaryServiceWords('《全社会动员》全书 · 120,000 字 · 8 个阅读范围')).toBe('《全社会动员》全书 · 120,000 字 · 8 个部分');
    expect(ordinaryServiceWords(`《合成书》「第一章」 · 3,000 字 · 重新分析 2 个阅读范围（第 3–4 段），沿用 6 个`)).toBe('《合成书》「第一章」 · 3,000 字 · 重新分析 2 个部分（第 3–4 段），沿用 6 个');
    expect(ordinaryServiceWords('所读范围内的稿件正文（第 3–4 段）和所选类别的规范条款，以及本社审阅偏好的摘录，发往 模型（tokens-pro）'))
      .toBe('所读范围内的稿件正文（第 3–4 段）和所选类别的规范条款，以及审阅偏好的摘录，发往 模型（tokens-pro）');
    expect(ordinaryServiceWords('缺口检查：参考本社审阅偏好')).toBe('缺口检查：参考审阅偏好');
    expect(serviceGoalWords('检查资金缺口的数据，全社会的统计口径再做一次核对')).toBe('检查资金缺口的数据，全社会的统计口径再做一次核对');
    expect(ordinaryServiceWords('资料《出版社经验谈》')).toBe('资料《出版社经验谈》');
    expect(ordinaryServiceWords('你选了「资金缺口」')).toBe('你选了「资金缺口」');
    expect(ordinaryServiceWords('OpenCode Go · tokens-pro（凭据引用 ref-1）')).toBe('OpenCode Go · tokens-pro');
    // Unknown text is never rewritten speculatively; known service storage errors have exact display rules.
    expect(ordinaryServiceWords('这项任务现在不能续行，请等待运行名额。。')).toBe('这项任务现在不能续行，请等待运行名额。。');
    expect(ordinaryServiceWords('后台处理登记版本指向的登记不存在。')).toBe('自动更新分析设置版本指向的设置不存在。');
  });

  it('read a reason of several sentences sentence by sentence (review B1 g)', () => {
    const plan = withResumeBlockers(taskPlanFixture({ runControl: { ...taskPlanFixture().runControl!, resume: { reason: null } } }), [RESUME_BLOCKED_CONNECTION, RESUME_BLOCKED_OFFLINE]);
    expect(serviceWords(plan.runControl!.resume!.reason)).toBe('模型未连接：继续要发送到模型服务，所需的密钥还没有就绪；连接好之后才能继续。离线：继续要连到模型服务，而这台设备现在没有网络；联网后再继续。');
  });

  it('name the safe retry one way in the plan and in its question (review S9)', () => {
    const step = ordinaryServiceWords('模型服务暂时出错时，同一个阅读范围安全地再试一次');
    expect(ordinaryServiceWords(CLARIFICATION_WHY)).toContain(`「${step}」`);
  });

  it('word 「正在排队」 by the state it is (review S2)', () => {
    expect(stateWords({ key: 'running', label: '正在排队' })).toBe('排队中');
    expect(stateWords({ key: 'waiting', label: '正在排队' })).toBe('等待开始前检查');
  });

  it('are shown as the service wrote them in developer mode', () => {
    setTechnicalLayerVisible(true);
    expect(serviceWords('请在「评估」里重新准备 AI7 初评。')).toBe('请在「评估」里重新准备 AI7 初评。');
    expect(backgroundSwitchWords('已登记')).toBe('已登记');
    for (const rule of SERVICE_SENTENCE_RULES) for (const sample of samplesOf(rule)) {
      expect(rule.underSwitch ? backgroundSwitchWords(sample) : serviceWords(sample), nameOf(rule)).toBe(sample);
    }
  });
});

describe('the fields that carry them, as the page shows them in ordinary mode (review N3, B1)', () => {
  it('the plan\'s scope, run control, redo summary and last edit', () => {
    const plan = taskPlanWording(taskPlanFixture({
      scope: { ...taskPlanFixture().scope, process: '《全社会动员》全书 · 120,000 字 · 8 个阅读范围' },
      redo: { summary: ['改计划重做：沿用已读完的 2 个阅读范围，接着读其余 6 个'], prepare: { kind: 'review-run', ref: 'r', redoOf: 'x' } },
      edit: { ...taskPlanFixture().edit, lastEdit: { ordinal: 2, recordedAt: '2026-11-16T04:00:00.000Z', entries: [{ field: 'evidenceAssuranceLevel', label: '证据保证级别', prior: '标准', proposed: '严格' } as never] } },
    }));
    expect(plan.scope.process).toBe('《全社会动员》全书 · 120,000 字 · 8 个部分');
    expect(plan.redo?.summary).toEqual(['重新开始：沿用已读完的 2 个部分，接着读其余 6 个']);
    expect(taskPlanLastEdit(plan.edit.lastEdit!)).toContain('核查力度：标准 → 严格');
  });

  it('a model question\'s options keep their words, the service\'s consequence of one and the answerable reason are reworded (B1 c, d)', () => {
    const asked = { origin: 'model', state: 'open', question: '缺口要补吗？', why: '模型需要你的决定来处理这个阅读范围。', detail: '', scope: '', after: '',
      answerable: { reason: RESUME_BLOCKED_OFFLINE.replace('续行要连到模型服务', '续行要连到模型服务') },
      options: [{ id: 'model-option-0', label: '补上缺口', consequence: '把这个回答发送给模型，接着处理这个阅读范围。', recommended: null }] };
    const plan = taskPlanWording(taskPlanFixture({ clarifications: [asked as never] }));
    expect(plan.clarifications[0]!.question).toBe('缺口要补吗？');
    expect(plan.clarifications[0]!.options[0]).toMatchObject({ label: '补上缺口', consequence: '把这个回答发送给模型，接着处理这一部分。' });
    expect(plan.clarifications[0]!.answerable.reason).toBe('离线：继续要连到模型服务，而这台设备现在没有网络；联网后再继续。');
  });

  it('the bar decides by the state before it rewords it: online and waiting for a place says so (review N2)', () => {
    const fixture = taskPlanFixture();
    const view = taskBarView(taskPlanWording(taskPlanFixture({ start: { ...fixture.start, readiness: 'started', planEnvelopeDigest: null }, state: { key: 'waiting', label: '已联网 · 名额已满' } })));
    expect([view.status, view.note]).toEqual(['已联网 · 等待开始', TASK_BAR_WAITING_SLOT_NOTE]);
  });

  it('a service error with a rule, and one without', () => {
    expect(rendererErrorMessage({ code: 'X', message: '撤销范围或文字与原应用凭据不一致。' }, '失败')).toBe('撤销范围或文字与原来的修改记录不一致。');
    expect(rendererErrorMessage({ code: 'X', message: '《出版社经验谈》不可用。' }, '失败')).toBe('《出版社经验谈》不可用。');
  });
});


describe('the expanded display boundaries (#1616)', () => {
  it('renders service job progress and settles the same raw service error', () => {
    const restore = installMiniDom();
    try {
      const root = document.createElement('div');
      const live = document.createElement('div');
      const status = createStatusSurface(root, live);
      status('正在为任务保存修订版并整理阅读范围…', 'busy');
      expect(root.textContent).toBe('正在为任务保存修订版并整理要读的部分…');
      status('生产文档记录无效。', 'error');
      expect(root.textContent).toBe('衍生稿件记录无效。');
      status.settle('生产文档记录无效。');
      expect(root.hidden).toBe(true);
      setTechnicalLayerVisible(true);
      status('AI7 初评的任务计划已准备', 'busy');
      expect(root.textContent).toBe('AI7 初评的任务计划已准备');
    } finally { restore(); }
  });

  it('renders review disclosure and synthesis coverage while retaining all model prose', () => {
    const send = reviewSendConsequence([{ label: '资金缺口', modelFree: false }], true);
    expect(banned(send)).toEqual([]);
    expect(send).toContain('覆盖多个部分');
    const restore = installMiniDom();
    try {
      const model = '模型认为存在资金缺口，需重新准备。';
      const value: ReviewSynthesisProjection = { state: 'completed', detail: '已完成。',
        summary: { overallAssessment: model, recurringProblems: [], contextualExplanations: [], priorities: [] },
        evidence: [], missingCategories: ['资金缺口（已读 2/8 个阅读范围；部分检查未完成）', '基线概述（缺少第 3–8 阅读范围）'],
        omissionLabel: null };
      for (const jump of [undefined, () => undefined]) {
        const node = reviewSynthesisNode(value, undefined, jump);
        expect(node.textContent).toContain(model);
        expect(node.textContent).toContain('资金缺口（已读 2/8 个部分；部分检查未完成）');
        expect(node.textContent).toContain('基线概述（缺少第 3–8 部分）');
      }
      expect(value.missingCategories[0]).toContain('阅读范围');
      setTechnicalLayerVisible(true);
      expect(reviewSynthesisNode(value, undefined).textContent).toContain(value.missingCategories[0]);
    } finally { restore(); }
  });

  it('rewrites only the provenance-marked service prefix of factual limitations', () => {
    const source = '这条断言尚未开始联网核查；同一阅读范围内其他断言的证据不代表已核查本条。';
    const limitations = [source, source, '模型的原话：阅读范围存在缺口。'];
    expect(factualLimitationWords({ limitations })).toEqual(limitations);
    expect(factualLimitationWords({ limitations, unattemptedDisclosure: true })).toEqual([
      '这条断言尚未开始联网核查；同一部分内其他断言的证据不代表已核查本条。', source, limitations[2],
    ]);
    expect(limitations[0]).toBe(source);
    setTechnicalLayerVisible(true);
    expect(factualLimitationWords({ limitations, unattemptedDisclosure: true })).toEqual(limitations);
  });

  it('renders the empty evaluation materials statement in the legend', () => {
    const restore = installMiniDom();
    try {
      const statement = '可以在「评估」重新准备计划。';
      const page = { materials: { items: [], more: 0, statement } };
      const render = () => evaluationMaterialsField(page, 'initial', new Set(), true, false, () => undefined);
      expect(render().querySelector('legend')!.textContent).toContain('可以在「评估」另做一份计划。');
      expect(page.materials.statement).toBe(statement);
      setTechnicalLayerVisible(true);
      expect(render().querySelector('legend')!.textContent).toContain(statement);
    } finally { restore(); }
  });

  it('renders a composed reference refusal and preserves its captured title', () => {
    const refusal = taskMaterialRefusal({ title: '资金缺口与凭据', characters: 3000 } as Parameters<typeof taskMaterialRefusal>[0], 'MATERIAL_INDEX_MOVED', '写作');
    const shown = serviceWords(taskMaterialReferenceLine(refusal));
    expect(shown).toContain('《资金缺口与凭据》');
    expect(shown).toContain('可以用「新建衍生稿件…」另做一份计划。');
    expect(banned(outside(shown))).toEqual([]);
    expect(refusal.refusal!.message).toContain('重新准备');
  });

  it('renders material refusal reasons at selection, before composing them with a title', () => {
    const item = { materialId: 'synthetic', title: '资金缺口与凭据', selectable: false,
      reason: '可以在「评估」重新准备计划。', characters: 1 } as Parameters<typeof taskMaterialSelectionReason>[0];
    expect(taskMaterialSelectionReason(item, [item], new Set())).toBe('可以在「评估」另做一份计划。');
    expect(item.title).toBe('资金缺口与凭据');
    expect(item.reason).toBe('可以在「评估」重新准备计划。');
  });

  it.each([
    ['taskOutcome.safeNextAction', BUDGET_REACHED_NEXT_ACTION, '点「调整预算并重做」：在新任务的计划里提高或去掉用量上限，沿用这次已读完的部分接着读其余的；这次运行不能继续或重试。'],
    ['report.modelClarifications.line', '第 3 个阅读范围的模型问题：已回答。', '正文第 3 部分的模型问题：已回答。'],
    ['custom.latest.coverage.label', coverageAxis({ unitsClosed: 2, unitsTotal: 8, unitsReused: 0, gapCount: 6 }).label, '覆盖：部分 · 2/8 个部分 · 6 处未完成'],
    ['evaluation.start.reason', evaluationReportOpenReason(2), '第 2 版已经是这份评估报告，直接在报告上修改即可。'],
    ['dataStorage.separationLabel', '模型服务凭据由操作系统单独保护，不在产品数据中，也不随产品数据复制。', '模型服务密钥由操作系统单独保护，不在产品数据中，也不随产品数据复制。'],
    ['writing.references.evaluation', '第 2 版定稿评估的结论「资金缺口」、主要优点（这一版没有 AI7 初评的市场部分）', '第 2 版定稿评估的结论「资金缺口」、主要优点（这一版没有评估报告的市场部分）'],
    ['review.historicalMarker.detail', '「资金缺口」参考的本社审阅偏好版本中，有学习材料在这次审阅之后停止今后使用。这次审阅的结果、发现和报告都保持原样；这个标记不表示结果有错。', '「资金缺口」参考的审阅偏好版本中，有学习材料在这次审阅之后停止今后使用。这次审阅的结果、发现和报告都保持原样；这个标记不表示结果有错。'],
    ['series.impact.changes', '《资金缺口》有 3 项学习材料，其中 2 项已决定学习准入。', '《资金缺口》有 3 项学习材料，其中 2 项已决定是否可用于学习。'],
    ['seriesExclusion.impact.unchanged', '图书、稿件和来源版本不会被删除或隐藏；书系成员和学习准入都不变。', '图书、稿件和来源版本不会被删除或隐藏；书系成员和是否可用于学习的决定都不变。'],
    ['fact.recommendation.rationale', '已核对来源与原文不符；接受后可以准备更正提案。', '已核对来源与原文不符；接受后可以准备更正建议。'],
    // Stage-4/5 rework R6 (acceptance at 41e76afa): each sentence the editor met, as its page now shows it.
    ['analysis.stateLabel', '已形成结果集修订版', '已形成分析结果'],
    ['analysis.taskOutcome.label', completedWithGapsLabel(1, 8), '已完成 · 8 个部分中有 1 个没有读成'],
    ['analysis.update.unavailableReason', changedModeUnavailableReason('同步到当前稿件'), '分析结果与当前稿件一致；稿件有了已保存的改动之后才可同步到当前稿件。'],
    ['review.coverage.unavailableReason', '主编辑角色缺少固定的凭据引用元数据。', '主编辑模型缺少已保存的密钥信息。'],
    ['review.run.stateLabel', '计划已冻结 · 待授权', '已准备好 · 还没有开始'],
    ['launchPreview.scope', '《合成书》全书 · 8,289 字 · 8 个阅读范围', '《合成书》全书 · 8,289 字 · 8 个部分'],
    ['launchPreview.adaptations', '模型服务暂时出错时，同一个阅读范围安全地再试一次：允许', '模型服务暂时出错时，同一部分安全地再试一次：允许'],
    ['launchPreview.send', '全书各阅读范围的稿件正文（8 个），以及汇总时各项依据的说明；所读范围内的稿件正文发往 合成模型服务', '全书各部分的稿件正文（8 个），以及汇总时各项依据的说明；所读范围内的稿件正文发往 合成模型服务'],
    ['taskPlan.step.result', '全书或多章审阅结束后，若覆盖多个阅读范围且已有模型发现，再向本次选定模型发送一次统合请求，计入本次预算；达到本次预算上限后不再发送新的请求，已发出的请求仍计入用量。发送发现的说明与引文（各最多 80 字）、证据索引及可用的分章概述（每段最多 400 字），不发送这些内容以外的章节正文。最多选取 200 条代表发现与 200 条证据、200 段概述；按出现次数保留可引用的问题组，概述保留独立的容量份额并利用剩余空间，容量不足时先均匀缩短再省略末尾，并说明覆盖缺口、缩短与省略数量。参考资料与编辑记忆沿用同一处理方式；本社审阅偏好、编辑任务说明及豁免规则沿用首个模型审阅类别。各类别规范条款已体现在发现中，统合时不另附原条款。', '全书或多章审阅结束后，若覆盖多个部分且已有模型发现，再向本次选定模型发送一次统合请求，计入本次预算；达到本次预算上限后不再发送新的请求，已发出的请求仍计入用量。发送发现的说明与引文（各最多 80 字）、证据索引及可用的分章概述（每段最多 400 字），不发送这些内容以外的章节正文。最多选取 200 条代表发现与 200 条证据、200 段概述；按出现次数保留可引用的问题组，概述保留独立的容量份额并利用剩余空间，容量不足时先均匀缩短再省略末尾，并说明未完成的部分、缩短与省略数量。参考资料与编辑记忆沿用同一处理方式；审阅偏好、编辑任务说明及豁免规则沿用首个模型审阅类别。各类别规范条款已体现在发现中，统合时不另附原条款。'],
    ['applyReceipt.reason', '权威稿件与应用凭据已确认。', '稿件与修改记录已确认。'],
    // 0.7.9 wording follow-up: the five phrases left open by the stage-4/5 rework, as their pages now show them.
    ['guideline.title', '事实核查契约', '事实核查规则'],
    ['reviewPlan.reference', '事实核查：事实核查契约 · 断言列举与引文定位', '事实核查：事实核查规则 · 断言列举与引文定位'],
    ['evaluation.prepare.reason', activeRunReason('executing', 'evaluation'), '已有一项评估任务正在进行；等它结束后才能准备新的评估任务。'],
    ['writing.materials.statement', WRITING_MATERIALS_STATEMENT, '勾选的资料列进这次计划的「允许参考」，按做计划时的资料内容读取：每份不超过 3,000 字，合计不超过 6,000 字，最多 4 份；只参照，不照抄。'],
    ['plan.reference.material', '资料库资料《按计划冻结的索引版本读取》：已提取 3,000 字，按计划冻结的索引版本读取（只参照，不照抄）', '资料库资料《按计划冻结的索引版本读取》：已提取 3,000 字，按做计划时的资料内容读取（只参照，不照抄）'],
    ['plan.reference.material refused', '资料库资料《合成资料》：已提取 3,000 字，按计划冻结的索引版本读取（只参照，不照抄）——计划冻结的索引版本已不在本机，这次起草不能再开始', '资料库资料《合成资料》：已提取 3,000 字，按做计划时的资料内容读取（只参照，不照抄）——做计划时的资料内容已不在本机，这次起草不能再开始'],
    ['applyReceipt.reason unresolved', '权威记录尚不能证明结果；禁止重试或重复应用。可以重新核对权威记录。', '还不能确认这次修改是否已写入稿件；请不要重试或重复写入，可以重新核对。'],
    ['fact.correction.completionLabel', '已保存为更正提案：它是普通的修改建议，不会自动应用，是否接受由你决定。', '已保存为更正建议：它是普通的修改建议，不会自动写入稿件，是否接受由你决定。'],
  ])('renders %s from service text without mutating the record', (_field, stored, expected) => {
    const record = { sentence: stored };
    expect(serviceWords(record.sentence)).toBe(expected);
    expect(record.sentence).toBe(stored);
    setTechnicalLayerVisible(true);
    expect(serviceWords(record.sentence)).toBe(stored);
  });
});
