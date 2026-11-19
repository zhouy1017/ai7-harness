import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { mountBackgroundAnalysis } from '../../src/renderer/background-analysis.js';
import { BACKGROUND_CEILING_DEFAULT, BACKGROUND_SWITCH_NOTE } from '../../src/renderer/background-analysis-labels.js';
import type { BackgroundAnalysisEnrollmentProjection } from '../../src/shared/protocol.js';

// Issue #1531 (review #1541): in ordinary mode, when the block offers a single kind, its select and 登记 become one switch
// with one sentence. Turning it on sends the request 登记 sends with the form's first choices; turning it off revokes.
// Synthetic projections only.

const BOOK = 'synthetic-book';
const base = (state: BackgroundAnalysisEnrollmentProjection['state']): BackgroundAnalysisEnrollmentProjection => ({
  kinds: [
    { kind: 'baseline-analysis', label: '基线分析', enabled: true, reason: null },
    { kind: 'material-index', label: '资料索引', enabled: false, reason: '当前模型服务策略未开放这一项的空闲时自动更新。' },
  ],
  bookId: BOOK, bookTitle: '合成书', state, stateLabel: state === 'active' ? '已登记' : '未登记', statement: '',
  enrollment: state === 'active' ? {
    enrollmentId: 'enrollment', enrollmentVersionId: 'version', ordinal: 1, name: '后台处理登记 · 第 1 版', startingPoint: 'prospective',
    startingPointLabel: '只分析登记之后的改动', enrolledBy: '本机编辑', enrolledAt: '2026-11-16T04:00:00.000Z', stateRecordedAt: '2026-11-16T04:00:00.000Z',
    binds: [], ceilingTokens: 100000, shareTokens: 100000, scope: { kind: 'book', label: '《合成书》这一本书', books: [], position: 1 },
  } : null,
  history: [], historyCount: 0, skipped: [], next: { kind: 'none', reason: '没有要做的。' }, lastLook: null, lastNotStarted: null,
  startedRuns: [], startedRunCount: 0,
  offer: {
    canEnroll: state !== 'active', reason: null, disclosureDigest: 'd'.repeat(64), scope: '《合成书》这一本书',
    scopes: [{ kind: 'book', seriesId: null, label: '《合成书》这一本书', books: [] }], what: '基线分析', when: '空闲时', binds: [],
    startingPoints: [{ value: 'prospective', label: '只分析之后的改动', note: '' }, { value: 'backfill', label: '从现在的稿件开始', note: '' }],
    notGranted: [], ceilingRule: '',
  },
  hold: { canPause: state === 'active', canResume: false },
  revoke: { canRevoke: state === 'active', consequences: [] },
});

let restore: () => void;
beforeEach(() => {
  restore = installMiniDom();
  vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined });
  setTechnicalLayerVisible(false);
});
afterEach(() => { vi.unstubAllGlobals(); restore(); setTechnicalLayerVisible(false); });

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

it('shows one switch and one sentence where a single kind is on offer, and turns on with the form\'s first choices', async () => {
  const enroll = vi.fn(async () => base('active'));
  const revoke = vi.fn(async () => base('none'));
  const api = { inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('none')), enrollBackgroundAnalysis: enroll,
    revokeBackgroundAnalysisEnrollment: revoke, holdBackgroundAnalysisEnrollment: vi.fn() };
  const root = miniDocument.createElement('section');
  root.dataset['bookId'] = BOOK;
  miniDocument.body.append(root);
  const status = vi.fn();
  mountBackgroundAnalysis({ root: root as unknown as HTMLElement, api, setStatus: status, errorMessage: (_error, fallback) => fallback, onRunStarted: () => undefined });
  await flush();
  expect(root.querySelector('select')).toBeNull();
  expect(root.querySelector('[data-background-action="enroll-open"]')).toBeNull();
  expect(root.querySelector('h3')?.textContent).toBe('空闲时自动更新分析');
  expect(root.querySelector('.background-analysis-statement')?.textContent).toBe(BACKGROUND_SWITCH_NOTE);
  const toggle = root.querySelector('[data-background-action="switch"]') as unknown as HTMLInputElement;
  expect([toggle.getAttribute('role'), toggle.checked, toggle.disabled]).toEqual(['switch', false, false]);
  toggle.checked = true;
  (toggle as unknown as { dispatchEvent(event: { type: string }): void }).dispatchEvent({ type: 'change' });
  await flush();
  expect(enroll).toHaveBeenCalledWith({ kind: 'baseline-analysis', disclosureDigest: 'd'.repeat(64), startingPoint: 'prospective',
    scope: { kind: 'book', seriesId: null }, ceilingTokens: Number(BACKGROUND_CEILING_DEFAULT) });
  const on = root.querySelector('[data-background-action="switch"]') as unknown as HTMLInputElement;
  expect([on.checked, root.querySelector('[data-background-action="pause"]'), root.querySelector('[data-background-action="revoke"]')]).toEqual([true, null, null]);
  on.checked = false;
  (on as unknown as { dispatchEvent(event: { type: string }): void }).dispatchEvent({ type: 'change' });
  await flush();
  expect(revoke).toHaveBeenCalledWith({ enrollmentId: 'enrollment' });
});

it('keeps the select, 登记… and 暂停 in developer mode', async () => {
  setTechnicalLayerVisible(true);
  const api = { inspectBackgroundAnalysisEnrollment: vi.fn(async () => base('none')), enrollBackgroundAnalysis: vi.fn(),
    revokeBackgroundAnalysisEnrollment: vi.fn(), holdBackgroundAnalysisEnrollment: vi.fn() };
  const root = miniDocument.createElement('section');
  root.dataset['bookId'] = BOOK;
  miniDocument.body.append(root);
  mountBackgroundAnalysis({ root: root as unknown as HTMLElement, api, setStatus: () => undefined, errorMessage: (_error, fallback) => fallback, onRunStarted: () => undefined });
  await flush();
  expect(root.querySelector('select')).not.toBeNull();
  expect(root.querySelector('[data-background-action="enroll-open"]')).not.toBeNull();
  expect(root.querySelector('[data-background-action="switch"]')).toBeNull();
});
