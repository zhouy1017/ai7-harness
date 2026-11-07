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
