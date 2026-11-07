import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountEvaluation, type MountEvaluationOptions } from '../../src/renderer/evaluation.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { BUILTIN_EVALUATION_PROFILE, emptyEvaluationContent } from '../../src/service/evaluation-records.js';
import { type EvaluationRecordProjection, type EvaluationWorkspaceProjection, type RendererApi } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { restore(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); });
vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: async () => ({ ...DEFAULT_QUICK_ACTIONS }), rememberActionDefaults: async () => undefined }));

async function mount(successfulSave = false) {
  const profile = { ...BUILTIN_EVALUATION_PROFILE, sha256: 'a'.repeat(64) };
  const content = emptyEvaluationContent(profile);
  const record = { recordId: 'record', ordinal: 1, state: 'draft', revisionLabel: 'Revision 1', revisionId: 'revision', entries: 1,
    profile, content, initial: null, calibration: null, comparison: null, finalized: null, skippedRecords: [], seededFrom: null, ai7WordsNotice: null,
    total: { score: 0, fullMarks: 100, notRated: 0, unscored: 5 } } as unknown as EvaluationRecordProjection;
  const unavailable = { allowed: false, reason: '尚未就绪' };
  const page = { bookId: 'book', bookTitle: '公开合成图书', profile, record, records: [], recordCount: 1, unreadableRecords: [],
    initial: { task: null, latest: null, prepare: unavailable }, readersReport: { basis: null, task: null },
    rewrite: { task: null, proposal: null, decided: null, prepare: unavailable }, start: unavailable,
    market: { series: [], comparables: [], pricing: { enabled: false, booksWithActuals: 0, threshold: 30 } },
  } as unknown as EvaluationWorkspaceProjection;
  const root = new MiniElement('main'); miniDocument.body.append(root);
  const save = vi.fn<RendererApi['saveEvaluation']>(async (input) => {
    if (!successfulSave) throw new Error('synthetic refusal keeps draft');
    return { ...page, record: { ...record, entries: record.entries + 1, content: input.content } };
  });
  let reads = 0;
  const api = { inspectEvaluation: async () => ({ ...page, initial: { ...page.initial, prepare: { allowed: false, reason: `公开合成读取周期${++reads}` } } }), saveEvaluation: save } as unknown as MountEvaluationOptions['api'];
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api, bookId: 'book', setStatus: vi.fn(), errorMessage: (_e, fallback) => fallback,
    technicalDetails: (_key, ...rows) => { const node = new MiniElement('dl'); node.append(...rows as unknown as MiniElement[]); return node as unknown as HTMLElement; },
    awaitServiceJob: async (job) => job, openPlan: vi.fn(), openReadersReportPlan: vi.fn(), openRewritePlan: vi.fn(), openDraft: async () => undefined });
  await surface.load();
  const risk = root.querySelector('.evaluation-risk')!;
  const reviewed = risk.querySelector('[data-evaluation-field="reviewed"]')!;
  const level = (value: string) => { const radios = risk.querySelectorAll('.evaluation-levels input'); for (const input of radios) input.checked = input.value === value; radios.find((input) => input.value === value)!.dispatchEvent({ type: 'change', bubbles: true }); };
  const recommend = root.querySelector('[data-conclusion="recommend"] input')!;
  const submit = async () => { root.querySelector('[data-evaluation-action="save"]')!.click(); await vi.waitFor(() => expect(save).toHaveBeenCalled()); await Promise.resolve(); return save.mock.calls.at(-1)![0].content; };
  const refresh = async () => { const next = reads + 1; surface.refresh(); await vi.waitFor(() => expect(root.textContent).toContain(`公开合成读取周期${next}`)); };
  return { root, risk, reviewed, level, recommend, submit, save, refresh };
}

it('remembers reviewed through a lower risk and submits false while it is inapplicable (#1374)', async () => {
  const view = await mount(); view.level('high');
  view.reviewed.checked = true; view.reviewed.dispatchEvent({ type: 'change' });
  view.level('medium'); expect(view.reviewed.disabled).toBe(true);
  expect((await view.submit()).risks[0]!.reviewed).toBe(false);
  view.level('high'); expect(view.reviewed.disabled).toBe(false); expect(view.reviewed.checked).toBe(true);
  expect((await view.submit()).risks[0]!.reviewed).toBe(true);
});

it('remembers recommend while an unreviewed high risk blocks its effective submission (#1374)', async () => {
  const view = await mount(); view.level('low'); view.recommend.checked = true;
  view.level('high'); expect(view.recommend.disabled).toBe(true);
  await view.refresh(); await view.refresh();
  expect(view.recommend.checked).toBe(true); expect(view.recommend.disabled).toBe(true);
  expect((await view.submit()).conclusion).toBeNull();
  view.reviewed.checked = true; view.reviewed.dispatchEvent({ type: 'change' });
  expect(view.recommend.disabled).toBe(false); expect(view.recommend.checked).toBe(true);
  expect((await view.submit()).conclusion).toBe('recommend');
});

it('starts from saved effective values after an explicit successful save (#1374 / P3-2)', async () => {
  const view = await mount(true); view.level('high');
  view.reviewed.checked = true; view.reviewed.dispatchEvent({ type: 'change' }); view.level('medium');
  view.recommend.checked = true;
  const choose = (risk: MiniElement, value: string) => {
    const radios = risk.querySelectorAll('.evaluation-levels input');
    for (const input of radios) input.checked = input.value === value;
    radios.find((input) => input.value === value)!.dispatchEvent({ type: 'change', bubbles: true });
  };
  choose(view.root.querySelectorAll('.evaluation-risk')[1]!, 'high');
  expect(view.recommend.disabled).toBe(true);
  const saved = await view.submit(); expect(saved.risks[0]!.reviewed).toBe(false); expect(saved.conclusion).toBeNull();
  await vi.waitFor(() => expect(view.root.querySelector('.evaluation-record')!.dataset['entries']).toBe('2'));
  choose(view.root.querySelectorAll('.evaluation-risk')[0]!, 'high');
  expect(view.root.querySelector('[data-evaluation-field="reviewed"]')!.checked).toBe(false);
  choose(view.root.querySelectorAll('.evaluation-risk')[0]!, 'medium');
  choose(view.root.querySelectorAll('.evaluation-risk')[1]!, 'low');
  const recommend = view.root.querySelector('[data-conclusion="recommend"] input')!;
  expect(recommend.disabled).toBe(false); expect(recommend.checked).toBe(false);
});
