import { mountLaunchBar, type LaunchBar, type TaskLaunchRequest } from '../../src/renderer/components/launch-bar.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountEvaluation, type MountEvaluationOptions } from '../../src/renderer/evaluation.js';
import { mountTaskDrawer } from '../../src/renderer/task-drawer.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { BUILTIN_EVALUATION_PROFILE, emptyEvaluationContent } from '../../src/service/evaluation-records.js';
import type { EvaluationWorkspaceProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { copyPlainText } from '../../src/renderer/clipboard-text.js';
import { readFileSync } from 'node:fs';
import { activeRunReason } from '../../src/service/analysis/run-state.js';
import { INITIAL_EVALUATION_KIND } from '../../src/shared/protocol.js';

vi.mock('../../src/renderer/clipboard-text.js', () => ({ copyPlainText: vi.fn(async () => undefined) }));

// 评估 leads with AI7's full report (Issue #1406, #1407) in ordinary mode: an unfinished empty version never hides it, and
// 修改报告 hands it to the editor as their version. Public synthetic words only.

let uninstall: () => void;
const bars: LaunchBar[] = [];
function mountLaunch(request: TaskLaunchRequest, launch = vi.fn(async () => ({ taskIntentId: 'task', runRecordId: 'run' }))) {
  const api = { [request.operation]: launch, getPreferences: async () => ({ values: preferenceDefaults() }),
    getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }), inspectEvaluation: async () => page };
  const bar = mountLaunchBar({ api: api as never, request, errorMessage: (_error, fallback) => fallback, setStatus: vi.fn(), settle: async () => true, onRecorded: vi.fn(), openRun: vi.fn(), interrupted: false });
  bars.push(bar); request.mount!.append(...bar.bar);
}
beforeEach(() => { vi.clearAllMocks(); uninstall = installMiniDom(); setTechnicalLayerVisible(false); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { for (const bar of bars.splice(0)) bar.dispose(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); });
vi.mock('../../src/renderer/task-panel.js', () => ({ mountTaskPanel: () => ({ element: document.createElement('div'), stop: vi.fn() }), mountTaskComposer: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
vi.mock('../../src/renderer/dialogue.js', () => ({ mountDialogue: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: async () => ({}), rememberActionDefaults: async () => undefined }));
const details = (className: string | undefined, ...rows: HTMLElement[]) => { const node = document.createElement('details'); node.className = className ?? 'technical-details'; node.append(...rows); return node; };

const profile = BUILTIN_EVALUATION_PROFILE;
const total = { score: 70, fullMarks: 100, notRated: 0, unscored: 0 };
const latest = {
  modelLabel: 'chosen-model@high',
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
    openLaunch: mountLaunch, technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
  await surface.load();
  expect(root.dataset['evaluationView']).toBe('report');
  expect(root.querySelector('.evaluation-record')).toBeNull();
  const report = root.querySelector('.evaluation-report')!;
  expect(root.children[1]).toBe(report);
  expect(report.querySelector('h3')!.textContent).toBe('评估报告');
  expect(report.querySelector('[data-evaluation-action="edit-report"]')!.textContent).toBe('修改评估报告');
  expect(report.querySelector('.evaluation-report-model')!.textContent).toBe('模型 chosen-model@高');
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
  expect(root.children[1]).toBe(root.querySelector('.evaluation-record'));
  expect(root.querySelector('.evaluation-record h3')!.textContent).toMatch(/^评估报告 · /u);
  expect(root.querySelector('.evaluation-record .evaluation-report-model')!.textContent).toBe('评估报告模型 chosen-model@高');
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
    openLaunch: mountLaunch, technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
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
    openLaunch: mountLaunch, technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
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
  const launch = vi.fn(async () => ({ taskIntentId: 'task', runRecordId: 'run' }));
  const openLaunch = vi.fn((request: TaskLaunchRequest) => mountLaunch(request, launch));
  const api = { inspectEvaluation: async () => page, startEvaluation: async () => editing, saveEvaluation: vi.fn(saveEvaluation), prepareEvaluationRewrite, inspectTaskPlan, authorizeEvaluationRewrite };
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api, bookId: 'book', technicalDetails: details, setStatus: vi.fn(), errorMessage: (_error: unknown, fallback: string) => fallback,
    awaitServiceJob: async () => ({ state: 'completed', kind: 'evaluation-rewrite-preparation', result: prepared }), openRewritePlan, openLaunch } as unknown as MountEvaluationOptions);
  return { root, surface, api, editing, openRewritePlan, openLaunch, launch };
}
async function typeVerdict(root: ReturnType<typeof miniDocument.createElement>, words: string): Promise<void> {
  root.querySelector('[data-evaluation-action="edit-report"]')!.click();
  await vi.waitFor(() => expect(root.dataset['evaluationView']).toBe('record'));
  const verdict = root.querySelector('.evaluation-lists [data-evaluation-field="verdict"]')!;
  verdict.value = words; verdict.dispatchEvent({ type: 'input', bubbles: true });
}

it('saves the edits still in the form before opening the regeneration start bar', async () => {
  let view!: ReturnType<typeof rewriting>;
  view = rewriting(async (input) => ({ ...view.editing, record: { ...record, entries: 2, content: { ...record.content, verdict: input.content.verdict ?? null } } }));
  await view.surface.load();
  await typeVerdict(view.root, '按编辑意见收紧中段。');
  const bar = view.root.querySelector('.evaluation-record .evaluation-action-bar')!;
  expect(bar.querySelector('[data-evaluation-action="save"]')).not.toBeNull();
  expect(bar.querySelector('[data-evaluation-action="copy-report"]')).not.toBeNull();
  expect(bar.querySelector('[data-evaluation-action="prepare-rewrite"]')!.textContent).toBe('按我的修改重新生成评估报告');
  const css = readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.evaluation-action-bar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/u);
  await vi.waitFor(() => expect(view.root.querySelector('[data-evaluation-action="prepare-rewrite"]')!.disabled).toBe(false));
  view.root.querySelector('[data-evaluation-action="prepare-rewrite"]')!.click();
  await vi.waitFor(() => expect(view.launch).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'report' })));
  expect(view.api.saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'report', finalize: false, content: expect.objectContaining({ verdict: '按编辑意见收紧中段。' }) }));
  expect(view.api.saveEvaluation.mock.invocationCallOrder[0]!).toBeLessThan(view.launch.mock.invocationCallOrder[0]!);
  expect(view.api.prepareEvaluationRewrite).not.toHaveBeenCalled();
  expect(view.api.authorizeEvaluationRewrite).not.toHaveBeenCalled();
  expect(view.openRewritePlan).not.toHaveBeenCalled();
});

it('copies the report including its evidence and market section directly from the page', async () => {
  const view = rewriting(async () => view.editing);
  await view.surface.load();
  view.root.querySelector('[data-evaluation-action="copy-report"]')!.click();
  await vi.waitFor(() => expect(copyPlainText).toHaveBeenCalledOnce());
  const text = vi.mocked(copyPlainText).mock.calls[0]![1];
  for (const line of ['公开合成书 · 评估报告', '模型 chosen-model@高', '第 1 项的评语。', '原文依据：第 1 项的依据。', '悬疑读者', '双线叙事', '线上书店']) expect(text).toContain(line);
  expect(text).not.toContain('复制评估报告');
  expect(view.api.saveEvaluation).not.toHaveBeenCalled();
});

it('copies current edits without saving or starting a regeneration', async () => {
  const view = rewriting(async () => view.editing);
  await view.surface.load();
  await typeVerdict(view.root, '当前编辑总评。');
  view.root.querySelector('.evaluation-action-bar [data-evaluation-action="copy-report"]')!.click();
  await vi.waitFor(() => expect(copyPlainText).toHaveBeenCalledOnce());
  expect(vi.mocked(copyPlainText).mock.calls[0]![1]).toContain('包含尚未保存的修改');
  expect(vi.mocked(copyPlainText).mock.calls[0]![1]).toContain('当前编辑总评。');
  expect(view.api.saveEvaluation).not.toHaveBeenCalled();
  expect(view.launch).not.toHaveBeenCalled();
});

it('starts nothing when the save before regenerating is refused, and keeps the typed words', async () => {
  const view = rewriting(async () => { throw new Error('refused'); });
  await view.surface.load();
  await typeVerdict(view.root, '按编辑意见收紧中段。');
  await vi.waitFor(() => expect(view.root.querySelector('[data-evaluation-action="prepare-rewrite"]')!.disabled).toBe(false));
  view.root.querySelector('[data-evaluation-action="prepare-rewrite"]')!.click();
  await vi.waitFor(() => expect(view.api.saveEvaluation).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(view.root.querySelector('.evaluation-refusal')).not.toBeNull());
  expect(view.api.prepareEvaluationRewrite).not.toHaveBeenCalled();
  expect(view.api.authorizeEvaluationRewrite).not.toHaveBeenCalled();
  expect(view.launch).not.toHaveBeenCalled();
  expect(view.root.querySelector('.evaluation-lists [data-evaluation-field="verdict"]')!.value).toBe('按编辑意见收紧中段。');
});

it('says why a new 评估报告 cannot be prepared in the words of the editor (Issue #1531, review B1)', async () => {
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const blocked = { ...page, initial: { ...page.initial, prepare: { allowed: false, reason: activeRunReason('authorized', INITIAL_EVALUATION_KIND) } } } as unknown as EvaluationWorkspaceProjection;
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api: { inspectEvaluation: async () => blocked }, bookId: 'book',
    technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
  await surface.load();
  expect(root.querySelector('.evaluation-initial-reason')!.textContent).toBe('有一项评估任务在排队；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的评估任务。');
});

it('keeps 查看计划 of a prepared regeneration beside its start (Issue #1407)', async () => {
  const view = rewriting(async () => view.editing);
  (view.editing as { rewrite: unknown }).rewrite = { ...view.editing.rewrite, task: { taskIntentId: 'rewrite-task', recordId: 'report', state: 'prepared', label: '尚未开始' } };
  await view.surface.load();
  view.root.querySelector('[data-evaluation-action="edit-report"]')!.click();
  await vi.waitFor(() => expect(view.root.dataset['evaluationView']).toBe('record'));
  const open = view.root.querySelector('[data-evaluation-action="open-rewrite-plan"]')!;
  expect(open.textContent).toBe('查看计划');
  expect(view.root.querySelector('[data-evaluation-action="open-rewrite-task"]')).toBeNull();
  open.click();
  expect(view.openRewritePlan).toHaveBeenCalledWith('rewrite-task');
});

// 审稿意见's bar (#1526 review): bound and labelled to one template that may start now; a row's 起草 starts its own template; no
// bar where no template may start; the bar's start is disabled while the page is busy.
type ReportTemplate = { template: 'author' | 'editorial'; label: string; prepare: { allowed: true; mode: 'readers-report-first' } | { allowed: false; reason: string };
  drafted: null | { revisionId: string; recordOrdinal: number; createdAt: string }; draft: null };
const allowed = { allowed: true, mode: 'readers-report-first' } as const;
function readersReportPage(templates: ReportTemplate[]): EvaluationWorkspaceProjection {
  return { ...page, readersReport: { basis: { recordId: 'report', ordinal: 2, revisionLabel: 'r2', finalizedAt: 'x' }, exemplars: { count: 0, statement: '本社暂无审稿意见范例。' }, task: null, templates } } as unknown as EvaluationWorkspaceProjection;
}
async function mountReadersReport(current: EvaluationWorkspaceProjection, extra: Record<string, unknown> = {}) {
  const launchReadersReport = vi.fn(async () => ({ taskIntentId: 'report-task', runRecordId: 'run' }));
  vi.stubGlobal('window', { setTimeout, clearTimeout, localStorage: { getItem: () => 'full', setItem: vi.fn() } });
  const drawerRoot = miniDocument.createElement('aside'); miniDocument.body.append(drawerRoot);
  const drawer = mountTaskDrawer({ root: drawerRoot, shell: document.body, onOpen: vi.fn(), onRecorded: vi.fn(), setStatus: vi.fn(), errorCode: () => null, settle: async () => true,
    errorMessage: (_error: unknown, fallback: string) => fallback, technicalDetails: () => document.createElement('details'),
    api: { launchReadersReport, inspectEvaluation: async () => current, inspectTaskPlan: () => new Promise(() => undefined),
      getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }), getPreferences: async () => ({ values: preferenceDefaults() }) } } as never);
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api: { inspectEvaluation: async () => current, ...extra }, bookId: 'book', technicalDetails: details,
    setStatus: vi.fn(), errorMessage: (_error: unknown, fallback: string) => fallback, openLaunch: drawer.openLaunch, openReadersReportPlan: vi.fn(), openDraft: vi.fn() } as unknown as MountEvaluationOptions);
  await surface.load();
  const launch = () => root.querySelector('.evaluation-readers-report-launch [data-task-drawer-control="launch"]');
  return { root, launch, launchReadersReport, drawer };
}

it('binds 审稿意见\'s bar to a template that may start, and a row\'s 起草 starts that row\'s template', async () => {
  const view = await mountReadersReport(readersReportPage([
    { template: 'author', label: '给作者的修改意见', prepare: allowed, drafted: null, draft: null },
    { template: 'editorial', label: '给编辑部 / 选题会的审读报告', prepare: allowed, drafted: null, draft: null }]));
  await vi.waitFor(() => expect(view.launch()?.disabled).toBe(false));
  expect(view.launch()!.textContent).toBe('起草给作者的修改意见');
  view.root.querySelector('li[data-template="editorial"] [data-readers-report-action="prepare"]')!.click();
  await vi.waitFor(() => expect(view.launchReadersReport).toHaveBeenCalledOnce());
  expect(view.launchReadersReport).toHaveBeenCalledWith(expect.objectContaining({ template: 'editorial' }));
  view.drawer.close(false);
});

it('offers no 审稿意见 start where no template may start, and binds the bar past a refused first template', async () => {
  const refused = { allowed: false, reason: '需要先有定稿的评估版本。' } as const;
  const none = await mountReadersReport(readersReportPage([
    { template: 'author', label: '给作者的修改意见', prepare: refused, drafted: null, draft: null },
    { template: 'editorial', label: '给编辑部 / 选题会的审读报告', prepare: refused, drafted: null, draft: null }]));
  expect(none.root.querySelector('.evaluation-readers-report')).not.toBeNull();
  expect(none.launch()).toBeNull();
  none.drawer.close(false);
  const second = await mountReadersReport(readersReportPage([
    { template: 'author', label: '给作者的修改意见', prepare: allowed, drafted: { revisionId: 'drafted', recordOrdinal: 2, createdAt: 'x' }, draft: null },
    { template: 'editorial', label: '给编辑部 / 选题会的审读报告', prepare: allowed, drafted: null, draft: null }]));
  await vi.waitFor(() => expect(second.launch()?.disabled).toBe(false));
  expect(second.launch()!.textContent).toBe('起草给编辑部 / 选题会的审读报告');
  second.drawer.close(false);
});

it('disables 审稿意见\'s start while the page is busy opening a draft', async () => {
  let open!: () => void;
  const createReadersReportDraft = vi.fn(() => new Promise(resolve => { open = () => resolve(readersReportPage([])); }));
  const view = await mountReadersReport(readersReportPage([
    { template: 'author', label: '给作者的修改意见', prepare: allowed, drafted: { revisionId: 'drafted', recordOrdinal: 2, createdAt: 'x' }, draft: null },
    { template: 'editorial', label: '给编辑部 / 选题会的审读报告', prepare: allowed, drafted: null, draft: null }]), { createReadersReportDraft });
  await vi.waitFor(() => expect(view.launch()?.disabled).toBe(false));
  view.root.querySelector('li[data-template="author"] [data-readers-report-action="create-draft"]')!.click();
  await vi.waitFor(() => expect(createReadersReportDraft).toHaveBeenCalledOnce());
  expect(view.launch()!.disabled).toBe(true);
  view.launch()!.click();
  expect(view.launchReadersReport).not.toHaveBeenCalled();
  open();
  view.drawer.close(false);
});
