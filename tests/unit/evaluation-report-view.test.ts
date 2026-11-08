import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountEvaluation, type MountEvaluationOptions } from '../../src/renderer/evaluation.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { BUILTIN_EVALUATION_PROFILE, emptyEvaluationContent } from '../../src/service/evaluation-records.js';
import type { EvaluationWorkspaceProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

// 评估 leads with AI7's full report (Issue #1406, #1407) in ordinary mode: an unfinished empty version never hides it, and
// 修改报告 hands it to the editor as their version. Public synthetic words only.

let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); setTechnicalLayerVisible(false); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); });
vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: async () => ({}), rememberActionDefaults: async () => undefined }));
const details = (className: string | undefined, ...rows: HTMLElement[]) => { const node = document.createElement('details'); node.className = className ?? 'technical-details'; node.append(...rows); return node; };

const profile = BUILTIN_EVALUATION_PROFILE;
const total = { score: 70, fullMarks: 100, notRated: 0, unscored: 0 };
const latest = {
  revisionId: 'report-1', ordinal: 1, revisionLabel: 'r1', createdAt: '2026-11-07T00:00:00.000Z', current: true, complete: true, unitsTotal: 2, unreadUnits: [],
  total, strengths: ['悬念清楚'], weaknesses: ['中段拖沓'], nextStep: '压缩中段。', suggestedConclusion: 'revise' as const,
  items: profile.items.map((item, index) => ({ itemId: item.itemId, score: 14, comment: `第 ${index + 1} 项的评语。`, sufficiency: 'sufficient' as const,
    citedBlocks: 1, unitsCited: 1, evidence: [{ unitOrdinal: 1, note: `第 ${index + 1} 项的依据。`, blockIds: ['b1'] }], evidenceCount: 1 })),
  market: { readers: ['悬疑读者'], sellingPoints: ['双线叙事'], channels: ['线上书店'], marketReturn: null, awards: null, withheld: [] },
};
const unavailable = { allowed: false, reason: '尚未就绪' };
const pricing = { booksWithActuals: 0, otherBooksWithActuals: 0, threshold: 10, enabled: false, available: false, unreadable: false, house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: 5 };
const blank = { recordId: 'blank', ordinal: 1, state: 'editing', revisionLabel: 'r1', total, conclusion: null, createdAt: 'x', finalizedAt: null, initial: null };
const page = {
  bookId: 'book', bookTitle: '公开合成书', profile, records: [blank], recordCount: 1, recordsBefore: null, recordsNext: null, unreadableRecords: [], record: blank,
  initial: { task: { taskIntentId: 'task', state: 'settled', label: '已完成' }, latest, prepare: { allowed: true, mode: 'evaluation-again' } },
  start: { allowed: true, kind: 'again', fromInitial: { revisionId: 'report-1', ordinal: 1 }, skipDamaged: null, blankReason: '第 1 版还没有定稿；定稿后才能重新评估。' },
  readersReport: { basis: null, task: null }, rewrite: { task: null, proposal: null, decided: null, prepare: unavailable },
  market: { series: [], comparables: [], comparableCount: 0, seriesUnreadable: false, pricing },
} as unknown as EvaluationWorkspaceProjection;
const record = {
  ...blank, recordId: 'report', ordinal: 2, state: 'draft', revisionId: 'rev', uncheckpointed: false, profile, entries: 1, savedAt: 'x', finalized: null,
  recommendationBlocked: false, comparison: null, initial: latest, calibration: null, ai7WordsNotice: null, skippedRecords: [], seededFrom: 1,
  content: { ...emptyEvaluationContent(profile), items: profile.items.map((item, index) => ({ itemId: item.itemId, score: 14, notRated: null, comment: `第 ${index + 1} 项的评语。`, adjustment: null })), strengths: ['悬念清楚'], weaknesses: ['中段拖沓'] },
};

it('shows the newest report past an unfinished empty version, and 修改报告 opens it as the editor\'s version', async () => {
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const startEvaluation = vi.fn(async () => ({ ...page, records: [record, blank], recordCount: 2, record, start: { allowed: false, reason: '第 2 版还没有定稿；定稿后才能重新评估。' } }));
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api: { inspectEvaluation: async () => page, startEvaluation }, bookId: 'book',
    technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
  await surface.load();
  expect(root.dataset['evaluationView']).toBe('report');
  expect(root.querySelector('.evaluation-record')).toBeNull();
  const report = root.querySelector('.evaluation-report')!;
  expect(report.querySelectorAll('.evaluation-report-comment')).toHaveLength(profile.items.length);
  expect(report.querySelector('.evaluation-report-comment')!.textContent).toBe('第 1 项的评语。');
  expect(report.querySelectorAll('.evaluation-item-ai7-evidence li')).toHaveLength(profile.items.length);
  expect(report.querySelector('[data-report-list="next-step"]')!.textContent).toBe('压缩中段。');
  expect(root.querySelector('.evaluation-market [data-market-list="readers"] li')!.textContent).toBe('悬疑读者');
  // Filling a form in alone waits under 更多, saying why; the report's own action leads.
  expect(root.querySelector('.evaluation-more [data-evaluation-action="start"]')).toBeNull();
  expect(root.querySelector('.evaluation-more .evaluation-start-reason')!.textContent).toBe('第 1 版还没有定稿；定稿后才能重新评估。');
  expect(root.querySelector('[data-evaluation-action="start-initial"]')!.textContent).toBe('重新生成评估报告');
  root.querySelector('[data-evaluation-action="edit-report"]')!.click();
  await vi.waitFor(() => expect(root.dataset['evaluationView']).toBe('record'));
  expect(startEvaluation).toHaveBeenCalledWith({ fromInitial: true, skipDamaged: false });
  expect(root.querySelector('.evaluation-report')).toBeNull();
  expect(root.querySelector('.evaluation-record h3')!.textContent).toContain('详细评估报告');
  expect(root.querySelector('.evaluation-record .evaluation-report-next-step')!.textContent).toBe('下一步建议：压缩中段。');
  // The 评语 field holds AI7's words until the editor changes them; they are not repeated beside it.
  expect(root.querySelectorAll('.evaluation-record .evaluation-item-ai7-comment')).toHaveLength(0);
  expect(root.querySelector('[data-evaluation-action="save"]')!.textContent).toBe('保存修改');
});

it('lets a report that settles after a version begun alone lead the page (Issue #1406)', async () => {
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const before = { ...page, records: [], recordCount: 0, record: null, initial: { ...page.initial, latest: null }, start: { allowed: true, kind: 'first', fromInitial: null, skipDamaged: null } };
  let current: unknown = before;
  const startEvaluation = vi.fn(async () => ({ ...before, records: [blank], recordCount: 1, record: { ...record, recordId: 'blank', ordinal: 1, state: 'editing', initial: null, seededFrom: null }, start: { allowed: false, reason: '第 1 版还没有定稿；定稿后才能重新评估。' } }));
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api: { inspectEvaluation: async () => current, startEvaluation }, bookId: 'book',
    technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
  await surface.load();
  root.querySelector('[data-evaluation-action="start"]')!.click();
  await vi.waitFor(() => expect(root.dataset['evaluationView']).toBe('record'));
  current = page;
  surface.refresh();
  await vi.waitFor(() => expect(root.dataset['evaluationView']).toBe('report'));
  expect(root.querySelector('[data-evaluation-action="edit-report"]')).not.toBeNull();
});

it('locks one dimension and the 总评 with one click each, saving the version at once (Issue #1412)', async () => {
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const editing = { ...page, records: [record, blank], recordCount: 2, record, start: { allowed: false, reason: '尚未定稿' } };
  const saved: unknown[] = [];
  const saveEvaluation = vi.fn(async (input: { content: { aiLocked?: string[] } }) => {
    saved.push(input.content.aiLocked);
    return { ...editing, record: { ...record, entries: record.entries + 1, content: { ...record.content, ...(input.content.aiLocked === undefined ? {} : { aiLocked: input.content.aiLocked }) } } };
  });
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api: { inspectEvaluation: async () => page, startEvaluation: async () => editing, saveEvaluation }, bookId: 'book',
    technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
  await surface.load();
  root.querySelector('[data-evaluation-action="edit-report"]')!.click();
  await vi.waitFor(() => expect(root.dataset['evaluationView']).toBe('record'));
  const first = profile.items[0]!.itemId;
  // Every item and 总评 / 主要优点 / 主要问题 offer the lock; 距离可出版 is no AI-written part and offers none.
  expect(root.querySelectorAll('.evaluation-item [data-evaluation-ai-lock]')).toHaveLength(profile.items.length);
  expect(root.querySelectorAll('.evaluation-lists [data-evaluation-ai-lock]').map((toggle) => toggle.dataset['evaluationAiLock'])).toEqual(['strengths', 'weaknesses', 'verdict']);
  root.querySelector(`[data-evaluation-ai-lock="${first}"]`)!.click();
  await vi.waitFor(() => expect(saved).toEqual([[first]]));
  await vi.waitFor(() => expect(root.querySelector(`[data-evaluation-ai-lock="${first}"]`)!.getAttribute('aria-pressed')).toBe('true'));
  expect(root.querySelector(`[data-evaluation-ai-lock="${first}"]`)!.textContent).toBe('🔒 已锁定');
  root.querySelector('[data-evaluation-ai-lock="verdict"]')!.click();
  await vi.waitFor(() => expect(saved).toEqual([[first], [first, 'verdict']]));
});

// Issue #1410 item 12: 按我的修改重新生成 saves what the form holds first, then prepares and starts the regeneration over it;
// a refused save starts nothing and keeps the form as typed.
function rewriting(saveEvaluation: (input: { content: { verdict?: string | null } }) => Promise<unknown>) {
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const editing = { ...page, records: [record, blank], recordCount: 2, record, start: { allowed: false, reason: '尚未定稿' },
    rewrite: { task: null, proposal: null, decided: null, prepare: { allowed: true, reason: null } } };
  const prepared = { ...editing, rewrite: { ...editing.rewrite, task: { taskIntentId: 'rewrite-task', recordId: 'report', state: 'prepared', label: '尚未开始' } } };
  const prepareEvaluationRewrite = vi.fn(async () => ({ jobId: 'job' }));
  const inspectTaskPlan = vi.fn(async () => ({ kind: 'evaluation-rewrite', start: { readiness: 'ready', planEnvelopeDigest: 'plan', categoryDigests: [] } }));
  const authorizeEvaluationRewrite = vi.fn(async () => undefined);
  const openRewritePlan = vi.fn();
  const api = { inspectEvaluation: async () => page, startEvaluation: async () => editing, saveEvaluation: vi.fn(saveEvaluation), prepareEvaluationRewrite, inspectTaskPlan, authorizeEvaluationRewrite };
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api, bookId: 'book', technicalDetails: details, setStatus: vi.fn(), errorMessage: (_error: unknown, fallback: string) => fallback,
    awaitServiceJob: async () => ({ state: 'completed', kind: 'evaluation-rewrite-preparation', result: prepared }), openRewritePlan } as unknown as MountEvaluationOptions);
  return { root, surface, api, editing, openRewritePlan };
}
async function typeVerdict(root: ReturnType<typeof miniDocument.createElement>, words: string): Promise<void> {
  root.querySelector('[data-evaluation-action="edit-report"]')!.click();
  await vi.waitFor(() => expect(root.dataset['evaluationView']).toBe('record'));
  const verdict = root.querySelector('.evaluation-lists [data-evaluation-field="verdict"]')!;
  verdict.value = words; verdict.dispatchEvent({ type: 'input', bubbles: true });
}

it('saves the edits still in the form, then prepares and starts 按我的修改重新生成 in the same click', async () => {
  let view!: ReturnType<typeof rewriting>;
  view = rewriting(async (input) => ({ ...view.editing, record: { ...record, entries: 2, content: { ...record.content, verdict: input.content.verdict ?? null } } }));
  await view.surface.load();
  await typeVerdict(view.root, '按编辑意见收紧中段。');
  view.root.querySelector('[data-evaluation-action="prepare-rewrite"]')!.click();
  await vi.waitFor(() => expect(view.api.authorizeEvaluationRewrite).toHaveBeenCalledWith({ taskIntentId: 'rewrite-task', planEnvelopeDigest: 'plan' }));
  expect(view.api.saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'report', finalize: false, content: expect.objectContaining({ verdict: '按编辑意见收紧中段。' }) }));
  expect(view.api.saveEvaluation.mock.invocationCallOrder[0]!).toBeLessThan(view.api.prepareEvaluationRewrite.mock.invocationCallOrder[0]!);
  expect(view.api.prepareEvaluationRewrite).toHaveBeenCalledWith({ recordId: 'report' });
  expect(view.openRewritePlan).not.toHaveBeenCalled();
});

it('starts nothing when the save before regenerating is refused, and keeps the typed words', async () => {
  const view = rewriting(async () => { throw new Error('refused'); });
  await view.surface.load();
  await typeVerdict(view.root, '按编辑意见收紧中段。');
  view.root.querySelector('[data-evaluation-action="prepare-rewrite"]')!.click();
  await vi.waitFor(() => expect(view.api.saveEvaluation).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(view.root.querySelector('.evaluation-refusal')).not.toBeNull());
  expect(view.api.prepareEvaluationRewrite).not.toHaveBeenCalled();
  expect(view.api.authorizeEvaluationRewrite).not.toHaveBeenCalled();
  expect(view.root.querySelector('.evaluation-lists [data-evaluation-field="verdict"]')!.value).toBe('按编辑意见收紧中段。');
});
