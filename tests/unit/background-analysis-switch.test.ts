import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { mountBackgroundAnalysis } from '../../src/renderer/background-analysis.js';
import { BACKGROUND_CEILING_DEFAULT, BACKGROUND_SWITCH_NOTE, BACKGROUND_SWITCH_STATE } from '../../src/renderer/background-analysis-labels.js';
import type { BackgroundAnalysisEnrollmentProjection } from '../../src/shared/protocol.js';

// Issue #1531 (review #1541, review S6): in ordinary mode, when the block offers a single kind, its select and 登记 become one
// switch with one sentence — and nothing else is taken away: 暂停 / 继续, the scope, the usage level and the starting point
// stay under 选项 with the form's defaults, and a suspended setting has its way out. Synthetic projections only.

const BOOK = 'synthetic-book';
type State = BackgroundAnalysisEnrollmentProjection['state'];
const kinds = (enabled: ReadonlyArray<string>): NonNullable<BackgroundAnalysisEnrollmentProjection['kinds']> => ['baseline-analysis', 'material-index'].map((kind) => ({
  kind, label: kind === 'baseline-analysis' ? '基线分析' : '资料索引', enabled: enabled.includes(kind), reason: enabled.includes(kind) ? null : '当前模型服务策略未开放这一项的空闲时自动更新。',
}));
const base = (state: State, enabled: ReadonlyArray<string> = ['baseline-analysis']): BackgroundAnalysisEnrollmentProjection => {
  const enrolled = state === 'active' || state === 'paused' || state === 'suspended';
  return {
    kinds: kinds(enabled),
    bookId: BOOK, bookTitle: '合成书', state, stateLabel: enrolled ? '已登记' : '未登记', statement: '',
    enrollment: enrolled ? {
      enrollmentId: 'enrollment', enrollmentVersionId: 'version', ordinal: 1, name: '后台处理登记 · 第 1 版', startingPoint: 'prospective',
      startingPointLabel: '只分析登记之后的改动', enrolledBy: '本机编辑', enrolledAt: '2026-11-16T04:00:00.000Z', stateRecordedAt: '2026-11-16T04:00:00.000Z',
      binds: [], ceilingTokens: 100000, shareTokens: 100000, scope: { kind: 'book', label: '《合成书》这一本书', books: [], position: 1 },
    } : null,
    history: [], historyCount: 0, skipped: [], next: { kind: 'none', reason: '没有要做的。' }, lastLook: null, lastNotStarted: null,
    startedRuns: [], startedRunCount: 0,
    offer: {
      canEnroll: state !== 'active' && state !== 'paused' && enabled.length > 0, reason: null, disclosureDigest: 'd'.repeat(64), scope: '《合成书》这一本书',
      scopes: [{ kind: 'book', seriesId: null, label: '《合成书》这一本书', books: [] }, { kind: 'series', seriesId: 'series', label: '书系《乙》的 2 本书', books: [{ bookId: 'a', title: '甲' }, { bookId: 'b', title: '乙' }] }],
      what: '基线分析', when: '空闲时', binds: [],
      startingPoints: [{ value: 'prospective', label: '只分析之后的改动', note: '' }, { value: 'backfill', label: '从现在的稿件开始', note: '' }],
      notGranted: [], ceilingRule: '',
    },
    hold: { canPause: state === 'active', canResume: state === 'paused' },
    revoke: { canRevoke: enrolled, consequences: [] },
  };
};

/** A setting made with the series scope, the 较多 level and 从现在的稿件开始. */
const seriesWide = (projection: BackgroundAnalysisEnrollmentProjection): BackgroundAnalysisEnrollmentProjection => ({ ...projection,
  enrollment: { ...projection.enrollment!, startingPoint: 'backfill', ceilingTokens: 200000, shareTokens: 100000,
    scope: { kind: 'series', label: '书系《乙》的 2 本书', books: [{ bookId: 'a', title: '甲' }, { bookId: 'b', title: '乙' }], position: 1 } } });

let restore: () => void;
beforeEach(() => {
  restore = installMiniDom();
  vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined });
  setTechnicalLayerVisible(false);
});
afterEach(() => { vi.unstubAllGlobals(); restore(); setTechnicalLayerVisible(false); });

const flush = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };
type Api = Parameters<typeof mountBackgroundAnalysis>[0]['api'];
async function mount(api: Partial<Record<keyof Api, unknown>>): Promise<{ root: ReturnType<typeof miniDocument.createElement>; status: ReturnType<typeof vi.fn> }> {
  const root = miniDocument.createElement('section');
  root.dataset['bookId'] = BOOK;
  miniDocument.body.append(root);
  const status = vi.fn();
  mountBackgroundAnalysis({ root: root as unknown as HTMLElement, api: { enrollBackgroundAnalysis: vi.fn(), revokeBackgroundAnalysisEnrollment: vi.fn(),
    holdBackgroundAnalysisEnrollment: vi.fn(), ...api } as unknown as Api, setStatus: status, errorMessage: (_error, fallback) => fallback, onRunStarted: () => undefined });
  await flush();
  return { root, status };
}
const toggle = (root: ReturnType<typeof miniDocument.createElement>) => root.querySelector('[data-background-action="switch"]') as unknown as HTMLInputElement;
const flip = (control: HTMLInputElement, checked: boolean): void => {
  control.checked = checked;
  (control as unknown as { dispatchEvent(event: { type: string }): void }).dispatchEvent({ type: 'change' });
};

describe('the 空闲时自动更新分析 switch in ordinary mode', () => {
  it('shows one switch and one sentence, turns on with the choices under 选项, and off by revoking', async () => {
    const enroll = vi.fn(async () => base('active'));
    const revoke = vi.fn(async () => base('none'));
    const { root } = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('none')), enrollBackgroundAnalysis: enroll, revokeBackgroundAnalysisEnrollment: revoke });
    expect([root.querySelector('select'), root.querySelector('[data-background-action="enroll-open"]')]).toEqual([null, null]);
    expect(root.querySelector('h3')?.textContent).toBe('空闲时自动更新分析');
    expect(root.querySelector('.background-analysis-statement')?.textContent).toBe(BACKGROUND_SWITCH_NOTE);
    expect([toggle(root).getAttribute('role'), toggle(root).checked, toggle(root).disabled]).toEqual(['switch', false, false]);
    // 选项: the series scope and the 较多 level and 从现在的稿件开始 instead of the defaults.
    for (const [name, value] of [['scope', '1'], ['ceiling', '200000'], ['starting-point', 'backfill']] as const) {
      const radio = root.querySelectorAll(`[data-background-option="${name}"]`).find((node) => (node as unknown as HTMLInputElement).value === value) as unknown as HTMLInputElement;
      flip(radio, true);
    }
    flip(toggle(root), true);
    await flush();
    expect(enroll).toHaveBeenCalledWith({ kind: 'baseline-analysis', disclosureDigest: 'd'.repeat(64), startingPoint: 'backfill',
      scope: { kind: 'series', seriesId: 'series' }, ceilingTokens: 200000 });
    expect(toggle(root).checked).toBe(true);
    expect(root.querySelector('.background-analysis-statement')?.textContent).toBe(BACKGROUND_SWITCH_STATE.active);
    expect(root.querySelector('[data-background-action="pause"]')).not.toBeNull();
    flip(toggle(root), false);
    await flush();
    expect(revoke).toHaveBeenCalledWith({ enrollmentId: 'enrollment' });
  });

  it('turns on with the form\'s defaults when nothing under 选项 was changed', async () => {
    const enroll = vi.fn(async () => base('active'));
    const { root } = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('none')), enrollBackgroundAnalysis: enroll });
    flip(toggle(root), true);
    await flush();
    expect(enroll).toHaveBeenCalledWith({ kind: 'baseline-analysis', disclosureDigest: 'd'.repeat(64), startingPoint: 'prospective',
      scope: { kind: 'book', seriesId: null }, ceilingTokens: Number(BACKGROUND_CEILING_DEFAULT) });
  });

  it('says paused beside the switch and offers 继续', async () => {
    const { root } = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('paused')) });
    expect([toggle(root).checked, root.querySelector('.background-analysis-statement')?.textContent]).toEqual([true, BACKGROUND_SWITCH_STATE.paused]);
    expect(root.querySelector('[data-background-action="resume"]')?.textContent).toBe('继续');
  });

  it('reads an open setting\'s own scope, level and starting point under 选项, locked (review N5)', async () => {
    const { root } = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => seriesWide(base('active'))) });
    const checked = (name: string) => (root.querySelectorAll(`[data-background-option="${name}"]`) as unknown as HTMLInputElement[]).filter((radio) => radio.checked).map((radio) => [radio.value, radio.disabled]);
    expect([checked('scope'), checked('ceiling'), checked('starting-point')]).toEqual([[['1', true]], [['200000', true]], [['backfill', true]]]);
    expect(root.querySelector('.background-analysis-enrollment')?.textContent).toContain('只分析打开之后的改动');
  });

  it('offers a suspended setting its way out: 重新打开 with its own options, open to change, or the switch turned off', async () => {
    const enroll = vi.fn(async (_input: unknown) => base('active'));
    const { root } = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => seriesWide(base('suspended'))), enrollBackgroundAnalysis: enroll });
    expect([toggle(root).checked, toggle(root).disabled, root.querySelector('.background-analysis-statement')?.textContent]).toEqual([true, false, BACKGROUND_SWITCH_STATE.suspended]);
    expect((root.querySelectorAll('[data-background-option="scope"]') as unknown as HTMLInputElement[]).every((radio) => !radio.disabled)).toBe(true);
    (root.querySelector('[data-background-action="reopen"]') as unknown as { click(): void }).click();
    await flush();
    expect(enroll).toHaveBeenCalledWith({ kind: 'baseline-analysis', disclosureDigest: 'd'.repeat(64), startingPoint: 'backfill', scope: { kind: 'series', seriesId: 'series' }, ceilingTokens: 200000 });
  });

  it('puts the switch back and says why when turning it on or off fails', async () => {
    const { root, status } = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('none')), enrollBackgroundAnalysis: vi.fn(async () => { throw new Error('x'); }) });
    flip(toggle(root), true);
    await flush();
    expect([toggle(root).checked, toggle(root).disabled]).toEqual([false, false]);
    expect(status).toHaveBeenLastCalledWith('无法打开空闲时自动更新分析。', 'error');
    const off = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('active')), revokeBackgroundAnalysisEnrollment: vi.fn(async () => { throw new Error('x'); }) });
    const control = toggle(off.root);
    flip(control, false);
    await flush();
    expect([control.checked, control.disabled]).toEqual([true, false]);
    expect(off.status).toHaveBeenLastCalledWith('无法关闭空闲时自动更新分析。', 'error');
  });

  it('reads the one kind on offer whichever it is, and disables the switch with why when none is', async () => {
    const inspect = vi.fn(async (input: { kind: string }) => base('none', input.kind === 'material-index' ? ['material-index'] : ['material-index']));
    const enroll = vi.fn(async (_input: { kind: string }) => base('active', ['material-index']));
    const { root } = await mount({ inspectBackgroundAnalysisEnrollment: inspect, enrollBackgroundAnalysis: enroll });
    expect(inspect).toHaveBeenLastCalledWith({ kind: 'material-index' });
    flip(toggle(root), true);
    await flush();
    expect(enroll.mock.calls[0]?.[0]).toMatchObject({ kind: 'material-index' });
    const none = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('none', [])) });
    expect(toggle(none.root).disabled).toBe(true);
    expect(none.root.querySelector('.background-analysis-unavailable')?.textContent).toBe('当前模型服务策略未开放这一项的空闲时自动更新。');
  });

  it('keeps the select, 登记… and 暂停 in developer mode', async () => {
    setTechnicalLayerVisible(true);
    const { root } = await mount({ inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('none')) });
    expect(root.querySelector('select')).not.toBeNull();
    expect(root.querySelector('[data-background-action="enroll-open"]')?.textContent).toBe('登记后台处理…');
    expect(root.querySelector('[data-background-action="switch"]')).toBeNull();
  });
});
