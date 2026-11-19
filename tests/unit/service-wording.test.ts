import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { findTerms, maskSource } from '../../tools/words-report.mjs';
import { NOT_SHOWN, SERVICE_SENTENCE_RULES, ordinaryServiceWords, serviceGoalWords, serviceWords } from '../../src/renderer/service-wording.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { taskBarView, taskPlanLastEdit, taskPlanWording, TASK_BAR_WAITING_SLOT_NOTE } from '../../src/renderer/task-drawer-labels.js';
import { rendererErrorMessage } from '../../src/renderer/error-words.js';
import { taskPlanFixture } from '../support/task-plan-fixture.js';

// Issue #1531, review N1–N3: service-authored sentences are reworded for ordinary mode by whole-sentence rules only — a
// title, a name, a quotation, the editor's goal and a model's words never change — and every sentence of the modules the
// renderer shows that holds a banned term has a rule (its sample) or is named as never shown. Synthetic sentences only.

type Span = { kind: string; found: string };
const banned = (text: string): string[] => (findTerms(text) as Span[]).filter((span) => span.kind === 'banned').map((span) => span.found);

const MODULES = ['src/service/task-plan.ts', 'src/service/task-overview.ts', 'src/service/bounded-manuscript.ts', 'src/service/review/review-run-state.ts',
  'src/service/book-delivery-packages.ts', 'src/service/background-analysis-enrollments.ts', 'src/service/book-findings.ts', 'src/service/analysis/run-state.ts'];

/** The fragments of string text the scan sees in one module, with their line. */
function fragments(file: string): Array<{ line: number; text: string }> {
  return (maskSource(readFileSync(file, 'utf8')).text as string).split('\n').flatMap((line, index) =>
    line.split(/\s{3,}/u).map((text) => text.trim()).filter((text) => text !== '').map((text) => ({ line: index + 1, text })));
}

beforeEach(() => setTechnicalLayerVisible(false));
afterEach(() => setTechnicalLayerVisible(false));

describe('the service-authored sentences the renderer shows', () => {
  it('have a rule for every sentence with a banned term, or are named as never shown — a new one fails by name', () => {
    const samples = SERVICE_SENTENCE_RULES.flatMap((rule) => rule.samples);
    // A fragment's pieces around an interpolation must each stand in one sample of a rule.
    const covered = (text: string): boolean => samples.some((sample) => text.split(/\s{2,}/u).every((piece) => sample.includes(piece)));
    const uncovered = MODULES.flatMap((file) => fragments(file).filter(({ text }) => banned(text).length > 0)
      .filter(({ text }) => !covered(text) && !NOT_SHOWN.some((entry) => entry.text === text))
      .map(({ line, text }) => `${file}:${line} 「${text}」`));
    expect(uncovered).toEqual([]);
  });

  it('read every rule\'s sample in the table\'s words, and no rule leaves its sentence as it was', () => {
    // Material in 《》 and 「」 is the Book's, a file's or a category's own name: it is never reworded, so it is not scanned here.
    const outside = (text: string): string => text.replace(/《[^》]*》|「[^」]*」/gu, '');
    expect(SERVICE_SENTENCE_RULES.flatMap((rule) => rule.samples.map((sample) => ({ rule, sample })))
      .filter(({ sample }) => banned(outside(ordinaryServiceWords(sample))).length > 0 || ordinaryServiceWords(sample) === sample)
      .map(({ rule, sample }) => `${rule.source}: ${ordinaryServiceWords(sample)}`)).toEqual([]);
  });

  it('keep a title, a name, the editor\'s goal and a model\'s words exactly as they are (review N1)', () => {
    expect(ordinaryServiceWords('《全社会动员》全书 · 120,000 字 · 8 个阅读范围')).toBe('《全社会动员》全书 · 120,000 字 · 8 个部分');
    expect(serviceGoalWords('检查资金缺口的数据，全社会的统计口径再做一次核对')).toBe('检查资金缺口的数据，全社会的统计口径再做一次核对');
    expect(ordinaryServiceWords('资料《出版社经验谈》')).toBe('资料《出版社经验谈》');
    expect(ordinaryServiceWords('资料库资料《出版社经验谈》：已提取 3,000 字，按计划冻结的索引版本读取（只参照，不照抄）——这份资料现已不可用；已有的草稿仍可查看，再次起草需用「新建文档…」重新准备'))
      .toBe('资料库资料《出版社经验谈》：已提取 3,000 字，按计划冻结的索引版本读取（只参照，不照抄）——这份资料现已不可用；已有的草稿仍可查看，再次起草需用「新建衍生稿件…」另做一份计划');
    expect(ordinaryServiceWords('你选了「资金缺口」')).toBe('你选了「资金缺口」');
    // A sentence no rule was written for is shown as it is, even when it holds a banned word.
    expect(ordinaryServiceWords('这项任务现在不能续行，请等待运行名额。。')).toBe('这项任务现在不能续行，请等待运行名额。。');
  });

  it('read the sentences the term rules broke as correct sentences (review N1)', () => {
    expect(ordinaryServiceWords('请在「评估」里重新准备 AI7 初评。')).toBe('请在「评估」里为评估报告另做一份计划。');
    expect(ordinaryServiceWords('审阅没有计划修订：请在「审阅」里点「返回修改」重新准备这次审阅。')).toBe('审阅没有计划修订：请在「审阅」里点「返回修改」为这次审阅另做一份计划。');
    expect(ordinaryServiceWords('撤销范围或文字与原应用凭据不一致。')).toBe('撤销范围或文字与原来的修改记录不一致。');
    expect(ordinaryServiceWords('找不到这次应用的凭据。')).toBe('找不到这次应用的凭据。');
  });

  it('are shown as the service wrote them in developer mode', () => {
    setTechnicalLayerVisible(true);
    expect(serviceWords('请在「评估」里重新准备 AI7 初评。')).toBe('请在「评估」里重新准备 AI7 初评。');
  });
});

describe('the fields that carry them, as the page shows them in ordinary mode (review N3)', () => {
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
