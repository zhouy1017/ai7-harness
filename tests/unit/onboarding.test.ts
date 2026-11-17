import { appendFirstRunSteps } from '../../src/renderer/onboarding-steps.js';
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
    await expect(readSampleGuidance(true, 'completed', async () => { throw new Error('ANALYSIS_PREREQUISITE_REQUIRED'); })).resolves.toBe(true);
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
    expect(FIRST_RUN_CARD_LABELS.sampleUnavailable).toBe('示例书尚未提供。');
    expect(SAMPLE_GUIDANCE_LABELS.steps.map((step) => `${step.label}:${step.section}`))
      .toEqual(['分析:analysis', '审阅:review', '标记:manuscript', '导出:deliverables']);
  });
  it('appears only in an empty library with no saved choice', () => {
    expect(showOnboardingCard(false, null)).toBe(true);
    for (const state of [null, 'skipped', 'completed'] as const) {
      expect(showOnboardingCard(true, state)).toBe(false);
      if (state !== null) expect(showOnboardingCard(false, state)).toBe(false);
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
      expect(showOnboardingCard(false, restarted.read().values['onboarding.state'])).toBe(false);
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
      appendFirstRunSteps(steps, element, button, { model, import: intake, review: ready ? review : null });
      const buttons = [...steps.querySelectorAll('button')];
      expect(buttons.map(node => node.textContent)).toEqual(ready ? ['设置模型服务', '导入稿件', '新建审阅'] : ['设置模型服务', '导入稿件']);
      buttons.forEach(node => node.click());
    }
    expect(model).toHaveBeenCalledTimes(2); expect(intake).toHaveBeenCalledTimes(2); expect(review).toHaveBeenCalledOnce();
  } finally { restore(); }
});

it('explains a non-DOCX drop without staging it', () => {
  const source = readFileSync(new URL('../../src/renderer/library-screen.ts', import.meta.url), 'utf8');
  const install = source.slice(source.indexOf('function installDropHandlers()'), source.indexOf('function renderImported('));
  const handlers = new Map<string, (event: unknown) => void>();
  const setStatus = vi.fn(), stageDroppedManuscript = vi.fn(), preventDefault = vi.fn();
  runInContext(transpileModule(install + '\ninstallDropHandlers();', {}).outputText, createContext({
    screen: { dataset: { screen: 'book-overview' }, addEventListener: (type: string, listener: (event: unknown) => void) => handlers.set(type, listener) },
    setStatus, api: { stageDroppedManuscript },
  }));
  handlers.get('drop')!({ dataTransfer: { files: [{ name: 'notes.pdf' }] }, preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(setStatus).toHaveBeenCalledWith('请拖入 DOCX 格式的稿件。', 'error');
  expect(stageDroppedManuscript).not.toHaveBeenCalled();
});
