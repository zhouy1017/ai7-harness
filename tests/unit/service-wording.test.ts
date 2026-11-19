import { readFileSync } from 'node:fs';
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
import { activeRunReason } from '../../src/service/analysis/run-state.js';
import {
  backgroundCeilingTooLowReason, backgroundDriftReason, backgroundRunReportLines, backgroundScopeLabel, backgroundScopeMemberActiveReason,
  backgroundScopeMemberUnreadableReason,
} from '../../src/service/background-analysis-enrollments.js';
import { KNOWN_RAW, NOT_SHOWN, SERVICE_SENTENCE_RULES, backgroundSwitchWords, ordinaryServiceWords, serviceGoalWords, serviceWords, stateWords } from '../../src/renderer/service-wording.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { taskBarView, taskPlanLastEdit, taskPlanWording, TASK_BAR_WAITING_SLOT_NOTE } from '../../src/renderer/task-drawer-labels.js';
import { rendererErrorMessage } from '../../src/renderer/error-words.js';
import { taskPlanFixture } from '../support/task-plan-fixture.js';

// Issue #1531 (review N1–N3, B1): service-authored sentences are reworded for ordinary mode by whole-sentence rules only — a
// title, a name, a heading, a destination, the editor's goal and a model's words never change. Every sentence with a banned
// term in the eight modules the renderer shows stands, by its `file:line`, in exactly one place: a rule (its samples made by
// the service's own functions), NOT_SHOWN or KNOWN_RAW (#1616). Synthetic sentences only.

type Span = { kind: string; found: string };
const banned = (text: string): string[] => (findTerms(text) as Span[]).filter((span) => span.kind === 'banned').map((span) => span.found);
const outside = (text: string): string => text.replace(/《[^》]*》|「[^」]*」/gu, '');

const MODULES = ['task-plan.ts', 'task-overview.ts', 'bounded-manuscript.ts', 'review/review-run-state.ts',
  'book-delivery-packages.ts', 'background-analysis-enrollments.ts', 'book-findings.ts', 'analysis/run-state.ts'];

/** The fragments of string text the scan sees in one service file, by line. */
const cache = new Map<string, string[][]>();
function fragmentsOf(file: string): string[][] {
  if (!cache.has(file)) {
    cache.set(file, (maskSource(readFileSync(`src/service/${file}`, 'utf8')).text as string).split('\n')
      .map((line) => line.split(/\s{3,}/u).map((text) => text.trim()).filter((text) => text !== '')));
  }
  return cache.get(file)!;
}
const at = (key: string): string[] => { const [file, line] = key.split(':'); return fragmentsOf(file!)[Number(line) - 1] ?? []; };

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
 * Each family's samples, by its first line, made by the service's own functions; where the sentence is composed inside a plan
 * builder (an internal template), its variable parts come from the service's helpers and its text is checked against the
 * source line by the coverage test.
 */
const PRODUCED: Readonly<Record<string, () => ReadonlyArray<string>>> = {
  'task-plan.ts:330': () => [resendDisclosure([2, 3]), resendDisclosure([4])],
  'task-plan.ts:338': () => [categoryResendDisclosure([{ category: '事实核查', units: [4] }, { category: '体例与格式', units: [1, 2] }])],
  'task-plan.ts:413': () => [budgetCeilingLabel({ kind: 'tokens', maxTotalTokens: 80000 }), `任务运行预算上限：${groupedCount(240000)} tokens（2 类合计）`,
    `任务运行预算上限：${groupedCount(240000)} tokens；各成员的模型阶段按工序份额分用`],
  'task-plan.ts:1043': () => [`《合成书》${where(null)} · ${chars(null)} 字 · 8 个阅读范围`,
    `《合成书》${where({ startPosition: 2, endPosition: 4 })} · ${chars({ startPosition: 2, endPosition: 4 })} 字 · 重新分析 2 个阅读范围（${where({ startPosition: 3, endPosition: 4 })}），沿用 6 个`,
    `《合成书》${where({ startPosition: 2, endPosition: 6 })} · ${chars({ startPosition: 2, endPosition: 6 })} 字 · 重新分析 2 个阅读范围，沿用 6 个`],
  'task-plan.ts:1048': () => [`所读阅读范围的稿件正文（${where({ startPosition: 3, endPosition: 4 })}），以及所选工序中的编辑任务说明和豁免规则`,
    '全书各阅读范围的稿件正文（8 个），以及汇总时各项依据的说明', '全书各阅读范围的稿件正文（8 个）与定稿的评估记录，以及汇总时各处段落的说明',
    '全书各阅读范围的稿件正文（8 个）、上面列出的参考材料——其中包括其他图书的范例原文与资料库资料原文——与你写的受众、渠道和要求，以及汇总时各处段落的说明',
    '全书各阅读范围的稿件正文（8 个）与这一版评估的评分和评语，以及汇总时各项依据的说明',
    `所读范围内的稿件正文（${where({ startPosition: 2, endPosition: 4 })}）和所选类别的规范条款，以及上面列出的资料库资料原文，以及本社审阅偏好的摘录`,
    `所读范围内的稿件正文（${where({ startPosition: 2, endPosition: 4 })}）和所选类别的规范条款，以及本社审阅偏好的摘录，以及本社审阅偏好 v2的摘录，发往 模型（tokens-pro）`],
  'task-plan.ts:1055': () => ['逐章读取（重新读取 2 个阅读范围，沿用 6 个）', `逐章读取（重新读取 ${where({ startPosition: 3, endPosition: 4 })}，沿用其余 6 个阅读范围）`],
  'task-plan.ts:1083': () => [`达到 ${groupedCount(80000)} tokens 后不再发送新的请求（8 个阅读范围）`],
  'task-plan.ts:2696': () => [`至多 ${groupedCount(240000)} tokens（各成员按工序份额分用）`, `至多 ${groupedCount(240000)} tokens（2 类合计）`],
  'task-plan.ts:1674': () => [writingReferenceLines({ synopsis: null, evaluation: { conclusion: '缺口在第二章', strengths: ['甲', '乙', '丙'], market: null },
    type: { label: '审稿意见' }, exemplars: [], book: { title: '合成书', authors: [], editors: [], series: [] }, audience: '编辑部', channel: '内部', requirements: null } as never)[1]!],
  'task-plan.ts:1628': () => [writingMaterialReferenceLine({ source: { title: '出版社经验谈', characters: 3000 }, refusal: { code: 'OTHER' } } as never, true)],
  'task-plan.ts:2038': () => [CLARIFICATION_WHY],
  'task-plan.ts:2064': () => [clarificationQuestion(3)],
  'task-plan.ts:2186': () => [
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
  'task-plan.ts:2234': () => baselineCancellationImpact(run('executing', progress()), update, { unitsSettled: 5, unitsTotal: 10, bindingHolds: true,
    waiting: [{ unitOrdinal: 6, answered: false }, { unitOrdinal: 7, answered: true }], unconfirmed: [4] }).slice(0, 1),
  'task-plan.ts:2235': () => baselineCancellationImpact(run('paused', null), null, { unitsSettled: 5, unitsTotal: 10, bindingHolds: true,
    waiting: [{ unitOrdinal: 6, answered: false }, { unitOrdinal: 7, answered: true }], unconfirmed: [4] }).slice(1),
  'task-plan.ts:2333': () => [redoGoalSentence({ reused: 2, recomputed: 6, invalidated: 0, bypassed: 0 })],
  'task-plan.ts:2382': () => ['然后准备一项新任务：沿用这 2 个阅读范围的结果，接着读其余 6 个；开始之前可以先改计划。',
    '然后准备一项新任务：沿用其中有结果的 2 个阅读范围，其余 6 个（含留下缺口的 1 个）重新读；开始之前可以先改计划。'],
  'task-plan.ts:2389': () => ['这项任务会在这里停下并取消；它还没有读完任何阅读范围，不会形成结果集修订版。',
    '这项任务会在这里停下并取消；已读完的 3 个阅读范围保留在一份新的结果集修订版里，没读到的记为未尝试。',
    '这项任务会在这里停下并取消；执行绑定已经变化，已读完的 3 个阅读范围不能沿用，不会形成结果集修订版。'],
  'task-plan.ts:2635': () => ['文字与表达：参考本社审阅偏好', '事实核查：参考本社审阅偏好 v2'],
  'task-plan.ts:440': () => [defaultRuleBindingRows({ providerBinding: { providerId: 'opencode-go', modelId: 'tokens-pro', credentialReference: 'ref-1' },
    artifactPin: { identity: '基线分析', version: 'v1', sidecarRevision: 1 }, runBudgetCeiling: 'unset', outboundDataCategory: 'x', expectedOutcome: 'y' } as never)[0]!.value],
  'analysis/run-state.ts:332': () => (['proxy-unreachable', 'model-service-unreachable', 'outcome-unknown', 'shutdown'] as const).map((why) => activeRunReason('resumable', undefined, why)),
  'analysis/run-state.ts:334': () => [activeRunReason('authorized'), activeRunReason('authorized', 'review-run')],
  'background-analysis-enrollments.ts:963': () => [backgroundCeilingTooLowReason(3)],
  'background-analysis-enrollments.ts:979': () => [...backgroundRunReportLines({ ordinal: 1, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: null, usedTokens: 0, reached: false }),
    ...backgroundRunReportLines({ ordinal: null, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: null, usedTokens: 0, reached: false })],
  'background-analysis-enrollments.ts:982': () => [backgroundRunReportLines({ ordinal: 1, scopeLabel: backgroundScopeLabel('series', '乙', 3), ceilingTokens: 1000, shareTokens: 334, frozenTokens: null, usedTokens: 0, reached: false })[1]!,
    backgroundRunReportLines({ ordinal: 1, scopeLabel: backgroundScopeLabel('book', '甲', 1), ceilingTokens: 1000, shareTokens: 1000, frozenTokens: null, usedTokens: 0, reached: false })[1]!],
  'background-analysis-enrollments.ts:987': () => [backgroundRunReportLines({ ordinal: 1, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: 334, usedTokens: 334, reached: true })[1]!,
    backgroundRunReportLines({ ordinal: 1, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: 334, usedTokens: 120, reached: false })[1]!],
  'background-analysis-enrollments.ts:880': () => [backgroundDriftReason(['模型服务', '工序'])],
  'background-analysis-enrollments.ts:953': () => [backgroundScopeMemberActiveReason('乙')],
  'background-analysis-enrollments.ts:958': () => [backgroundScopeMemberUnreadableReason('乙')],
};
const samplesOf = (rule: (typeof SERVICE_SENTENCE_RULES)[number]): ReadonlyArray<string> => rule.exact !== undefined ? [rule.exact] : PRODUCED[rule.lines[0]!]?.() ?? [];
const wordsOf = (rule: (typeof SERVICE_SENTENCE_RULES)[number], sample: string): string => rule.underSwitch === true ? backgroundSwitchWords(sample) : ordinaryServiceWords(sample);

beforeEach(() => setTechnicalLayerVisible(false));
afterEach(() => setTechnicalLayerVisible(false));

describe('the service-authored sentences of the eight modules', () => {
  it('stand, by file:line, in exactly one of a rule, NOT_SHOWN and KNOWN_RAW — a new sentence or a stale key fails by file:line', () => {
    const owners = (key: string, text: string): string[] => [
      ...(SERVICE_SENTENCE_RULES.some((rule) => rule.lines.includes(key) && samplesOf(rule).some((sample) => text.split(/\s{2,}/u).every((piece) => sample.includes(piece)))) ? ['rule'] : []),
      ...(NOT_SHOWN.some((entry) => entry.line === key) ? ['NOT_SHOWN'] : []),
      ...(KNOWN_RAW.some((entry) => entry.line === key) ? ['KNOWN_RAW'] : []),
    ];
    const misplaced = MODULES.flatMap((file) => fragmentsOf(file).flatMap((line, index) => line.filter((text) => banned(text).length > 0)
      .map((text) => ({ key: `${file}:${index + 1}`, text }))))
      .map(({ key, text }) => ({ key, text, owners: owners(key, text) })).filter((entry) => entry.owners.length !== 1)
      .map(({ key, text, owners: found }) => `${key} 「${text}」 in ${found.length === 0 ? 'none' : found.join(' and ')}`);
    expect(misplaced).toEqual([]);
    // A key whose line no longer holds what it names.
    const stale = [
      ...SERVICE_SENTENCE_RULES.flatMap((rule) => rule.lines.filter((key) => !at(key).some((text) => rule.exact !== undefined ? text === rule.exact
        : samplesOf(rule).some((sample) => text.split(/\s{2,}/u).every((piece) => sample.includes(piece))))).map((key) => `rule ${key}`)),
      ...[...NOT_SHOWN, ...KNOWN_RAW].filter((entry) => !at(entry.line).some((text) => banned(text).length > 0)).map((entry) => `key ${entry.line}`),
    ];
    expect(stale).toEqual([]);
    expect(KNOWN_RAW.every((entry) => entry.issue === '#1616')).toBe(true);
  });

  it('every family has samples the service made, and each reads in the table\'s words and differs from the service\'s', () => {
    expect(SERVICE_SENTENCE_RULES.filter((rule) => samplesOf(rule).length === 0).map((rule) => rule.lines[0])).toEqual([]);
    expect(SERVICE_SENTENCE_RULES.flatMap((rule) => samplesOf(rule).map((sample) => ({ rule, sample, words: wordsOf(rule, sample) })))
      .filter(({ sample, words }) => words === sample || banned(outside(words)).length > 0)
      .map(({ rule, words }) => `${rule.lines[0]}: ${words}`)).toEqual([]);
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
    // A sentence no rule was written for is shown as it is, even when it holds a banned word; so are the storage errors (S10).
    expect(ordinaryServiceWords('这项任务现在不能续行，请等待运行名额。。')).toBe('这项任务现在不能续行，请等待运行名额。。');
    expect(ordinaryServiceWords('后台处理登记版本指向的登记不存在。')).toBe('后台处理登记版本指向的登记不存在。');
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
