import { SHELL_LABELS } from '../../src/renderer/shell-labels.js';
import { navigation } from '../../src/renderer/navigation-generation.js';
import { appendFirstRunSteps, firstReviewBook, firstRunModelConnected } from '../../src/renderer/onboarding-steps.js';
import { installMiniDom } from '../support/mini-dom.js';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { transpileModule } from 'typescript';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createPreferenceStore } from '../../src/main/preferences.js';
import { readSampleGuidance, showOnboardingCard, showSampleGuidance } from '../../src/shared/preferences.js';
import { resolveDevelopmentSampleBook } from '../../src/shared/data-root.js';
import { FIRST_RUN_CARD_LABELS, SAMPLE_GUIDANCE_LABELS } from '../../src/renderer/onboarding-labels.js';
import { decodeRequest } from '../../src/service/request-frames.js';

describe('first-run guidance', () => {
  it('keeps sample navigation available before analysis prerequisites are configured', async () => {
    await expect(readSampleGuidance(true, 'completed', async () => { throw new Error('ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED'); })).resolves.toBe(true);
    await expect(readSampleGuidance(true, 'completed', async () => false)).resolves.toBe(true);
    await expect(readSampleGuidance(true, 'completed', async () => true)).resolves.toBe(false);
    await expect(readSampleGuidance(true, 'skipped', async () => true)).resolves.toBe(false);
    await expect(readSampleGuidance(true, null, async () => true)).resolves.toBe(true);
    let reads = 0;
    await expect(readSampleGuidance(false, null, async () => { reads += 1; return false; })).resolves.toBe(false);
    expect(reads).toBe(0);
  });
  it('names the model service requirement and links the four existing surfaces in order', () => {
    expect(FIRST_RUN_CARD_LABELS.modelStep).toBe('① 连接模型服务');
    expect(FIRST_RUN_CARD_LABELS.modelNote).toBe('AI 审阅需要');

    expect(SAMPLE_GUIDANCE_LABELS.steps.map((step) => `${step.label}:${step.section}`))
      .toEqual(['分析:analysis', '审阅:review', '标记:manuscript', '导出:deliverables']);
  });
  it('limits first use to zero or one Book unless skipped, including a completed first import', () => {
    for (const state of [null, 'completed', 'skipped'] as const) {
      for (const count of [0, 1, 2, 20]) expect(showOnboardingCard(count, state)).toBe(count <= 1 && state !== 'skipped');
    }
  });

  it.each(['skipped', 'completed'] as const)('remembers %s across restart and refuses to reset it', async (state) => {
    const directory = await mkdtemp(join(tmpdir(), 'ai7-onboarding-'));
    try {
      const store = createPreferenceStore(directory);
      expect(store.read().values['onboarding.state']).toBeNull();
      store.save({ key: 'onboarding.state', value: state });
      const restarted = createPreferenceStore(directory);
      expect(restarted.read().values['onboarding.state']).toBe(state);
      expect(() => restarted.save({ key: 'onboarding.state', value: null })).toThrow();
      expect(showOnboardingCard(1, restarted.read().values['onboarding.state'])).toBe(state !== 'skipped');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps sample guidance until a baseline exists and onboarding is dismissed', () => {
    expect(showSampleGuidance(false, null, false)).toBe(false);
    expect(showSampleGuidance(true, null, true)).toBe(true);
    for (const state of ['skipped', 'completed'] as const) {
      expect(showSampleGuidance(true, state, false)).toBe(true);
      expect(showSampleGuidance(true, state, true)).toBe(false);
    }
  });
});

describe('development-only sample import', () => {
  const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
  it('admits exactly the reviewed sample1 bytes in the source checkout', async () => {
    expect(await resolveDevelopmentSampleBook(codeRoot, 'source-checkout')).toBe(join(codeRoot, 'SampleBooks', 'sample1.docx'));
  });
  it('refuses packaged or unknown runtime forms before touching files', async () => {
    for (const runtime of ['packaged', '', 'development']) {
      await expect(resolveDevelopmentSampleBook(codeRoot, runtime)).rejects.toThrow('AI7_DATA_ROOT_BOUNDARY_INVALID');
    }
  });
  it('accepts only the bounded absolute-path service frame supplied by main', () => {
    const frame = (input: unknown) => new TextEncoder().encode(JSON.stringify({ id: randomUUID(), op: 'importBundledSampleBook', input }));
    const input = { selectionToken: randomUUID(), selectedPath: join(codeRoot, 'SampleBooks', 'sample1.docx') };
    expect(decodeRequest(frame(input)).input).toEqual(input);
    for (const invalid of [{}, { ...input, selectedPath: 'relative' }, { ...input, selectionToken: 'bad' }, { ...input, extra: true }]) {
      expect(() => decodeRequest(frame(invalid))).toThrow();
    }
  });
});

it('offers review only with a manuscript, and every active step runs its own action', () => {
  const restore = installMiniDom();
  try {
    const element = <K extends keyof HTMLElementTagNameMap>(tag: K, _className?: string, text?: string) => {
      const node = document.createElement(tag); node.textContent = text ?? ''; return node;
    };
    const button = (label: string, _style: string, action: () => void) => {
      const node = element('button', undefined, label); node.addEventListener('click', action); return node;
    };
    const model = vi.fn(), intake = vi.fn(), review = vi.fn();
    for (const ready of [false, true]) {
      const steps = element('ol');
      appendFirstRunSteps(steps, element, button, { model, import: intake, review: ready ? review : null, ...(ready ? { bookTitle: '第一本' } : {}) });
      if (ready) expect(steps.textContent).toContain('审阅《第一本》');
      const buttons = [...steps.querySelectorAll('button')];
      expect(buttons.map(node => node.textContent)).toEqual(ready ? ['设置模型服务', '导入稿件', '新建审阅'] : ['设置模型服务', '导入稿件']);
      buttons.forEach(node => node.click());
    }
    const done = element('ol');
    appendFirstRunSteps(done, element, button, { model: null, import: intake, review: null });
    expect(done.textContent).toContain('已连接');
    expect([...done.querySelectorAll('button')].map(node => node.textContent)).toEqual(['导入稿件']);
    expect(model).toHaveBeenCalledTimes(2); expect(intake).toHaveBeenCalledTimes(2); expect(review).toHaveBeenCalledOnce();
  } finally { restore(); }
});

it.each(['book-overview', 'imported', 'derivative'])('handles a non-DOCX drop on %s', (surface) => {
  const source = readFileSync(new URL('../../src/renderer/library-screen.ts', import.meta.url), 'utf8');
  const install = source.slice(source.indexOf('function installDropHandlers()'), source.indexOf('function renderImported('));
  const handlers = new Map<string, (event: unknown) => void>();
  const setStatus = vi.fn(), stageDroppedManuscript = vi.fn(), preventDefault = vi.fn();
  runInContext(transpileModule(install + '\ninstallDropHandlers();', {}).outputText, createContext({
    screen: { dataset: { screen: surface === 'derivative' ? 'editor' : surface }, querySelector: () => surface === 'derivative' ? {} : null, addEventListener: (type: string, listener: (event: unknown) => void) => handlers.set(type, listener) },
    setStatus, api: { stageDroppedManuscript },
  }));
  handlers.get('drop')!({ dataTransfer: { files: [{ name: 'notes.pdf' }] }, preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(surface === 'imported' ? 0 : 1);
  if (surface === 'book-overview') expect(setStatus).toHaveBeenCalledWith('请拖入 DOCX 格式的稿件。', 'error');
  else expect(setStatus).not.toHaveBeenCalled();
  expect(stageDroppedManuscript).not.toHaveBeenCalled();
});

it('chooses only the first, sole Book with a manuscript for review', () => {
  const empty = { bookId: 'empty', title: '空书', manuscriptState: 'empty' as const };
  const populated = { bookId: 'first', title: '第一本', manuscriptState: 'populated' as const };
  expect(firstReviewBook([])).toBeNull(); expect(firstReviewBook([empty])).toBeNull();
  expect(firstReviewBook([populated])).toBe(populated);
  expect(firstReviewBook([empty, populated])).toBeNull();
  expect(firstReviewBook([populated, populated])).toBeNull();
});

it('paints the first-use card once, with both location warnings and the existing settings action', async () => {
  const restore = installMiniDom();
  try {
    const preference = Promise.withResolvers<object>();
    const paint = vi.fn(), dataSettings = vi.fn();
    const element = (tag: string, className?: string, text?: string) => {
      const node = document.createElement(tag); node.className = className ?? ''; node.textContent = text ?? ''; return node;
    };
    const button = (label: string, style: string, action: () => void) => { const node = element('button', style, label); node.addEventListener('click', action); return node; };
    const source = readFileSync(new URL('../../src/renderer/library-screen.ts', import.meta.url), 'utf8');
    const landing = source.slice(source.indexOf('async function renderLanding('), source.indexOf('function installDropHandlers('));
    const context = createContext({ element, button, navigation, panel: () => element('section'),
      showOnboardingCard, appendFirstRunSteps, firstReviewBook, firstRunModelConnected, FIRST_RUN_CARD_LABELS, SHELL_LABELS,
      technicalLayerVisible: false, renderBookCreationForm: vi.fn(), appendRecoveryReturnAction: vi.fn(), setStatus: vi.fn(),
      replaceScreen: paint, state: { renderDataAndStorage: dataSettings },
      api: { getPreferences: () => preference.promise, getModelServiceSettings: async () => ({ roles: [] }),
        getProductDataLocation: async () => ({ dataLocationException: 'portable-folder-unwritable', channelDescription: '便携文件夹不可写。', syncWarning: '此位置可能由同步或备份服务复制。' }) },
    });
    runInContext(transpileModule(landing, { compilerOptions: { target: 9 } }).outputText, context);
    const pending = runInContext("renderLanding([], undefined, { items: [], nextCursor: null })", context);
    expect(paint).not.toHaveBeenCalled();
    preference.resolve({ values: { 'onboarding.state': null } }); await pending;
    expect(paint).toHaveBeenCalledOnce();
    const content = paint.mock.calls[0]![1] as HTMLElement;
    expect(content.textContent).toContain('便携文件夹不可写；此位置可能由同步或备份服务复制。');
    const open = [...content.querySelectorAll('button')].find(node => node.textContent === '查看数据与存储')!;
    open.click(); expect(dataSettings).toHaveBeenCalledOnce();
    expect(content.textContent).not.toContain('① 数据位置');
  } finally { restore(); }
});

it('marks only a ready main model connection as done', () => {
  expect(firstRunModelConnected([])).toBe(false);
  expect(firstRunModelConnected([{ roleId: 'main-editorial', status: 'available', connection: null }])).toBe(false);
  expect(firstRunModelConnected([{ roleId: 'fast-interaction', status: 'available', connection: { credentialOperationState: 'ready' } }])).toBe(false);
  expect(firstRunModelConnected([{ roleId: 'main-editorial', status: 'needs-attention', connection: { credentialOperationState: 'ready' } }])).toBe(false);
  expect(firstRunModelConnected([{ roleId: 'main-editorial', status: 'available', connection: { credentialOperationState: 'ready' } }])).toBe(true);
});
