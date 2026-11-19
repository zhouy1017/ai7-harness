import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { rendererErrorMessage } from '../../src/renderer/error-words.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { mountTaskOverview } from '../../src/renderer/tasks-overview.js';
import type { RendererApi } from '../../src/shared/protocol.js';

beforeEach(() => setTechnicalLayerVisible(false));
afterEach(() => setTechnicalLayerVisible(true));

describe('the one error helper (#1519)', () => {
  it('shows a bridge error\'s own sentence and never its code', () => {
    expect(rendererErrorMessage({ code: 'TASK_NOT_FOUND', message: '这项任务已经不在队列里。' }, '任务操作未能完成。')).toBe('这项任务已经不在队列里。');
  });

  it('falls back when a bridge error has no sentence', () => {
    expect(rendererErrorMessage({ code: 'TASK_NOT_FOUND', message: '' }, '任务操作未能完成。')).toBe('任务操作未能完成。');
  });

  it('shows the Chinese fallback for a renderer Error that carries a code, English, or both with Chinese', () => {
    expect(rendererErrorMessage(new Error('AI7_RENDERER_BOOTSTRAP_INVALID'), '任务操作未能完成。')).toBe('任务操作未能完成。');
    expect(rendererErrorMessage(new TypeError('Cannot read properties of null'), '无法读取问题。')).toBe('无法读取问题。');
    expect(rendererErrorMessage(new Error('保存 failed ECONNRESET'), '无法保存。')).toBe('无法保存。');
    expect(rendererErrorMessage('boom', '任务总览暂时无法读取。')).toBe('任务总览暂时无法读取。');
  });

  it('keeps a renderer Error that is itself a sentence written for the editor', () => {
    expect(rendererErrorMessage(new Error('修订保存后无法读取稿件。'), '无法保存。')).toBe('修订保存后无法读取稿件。');
    expect(rendererErrorMessage(new Error('先在 AI7 里选好图书。'), '无法保存。')).toBe('先在 AI7 里选好图书。');
  });

  it('keeps the raw detail after the fallback in developer mode only', () => {
    setTechnicalLayerVisible(true);
    expect(rendererErrorMessage(new Error('Cannot read properties of null'), '无法读取问题。')).toBe('无法读取问题。（Cannot read properties of null）');
    expect(rendererErrorMessage({ code: 'TASK_NOT_FOUND', message: '' }, '任务操作未能完成。')).toBe('任务操作未能完成。（TASK_NOT_FOUND）');
    expect(rendererErrorMessage({ code: 'TASK_NOT_FOUND', message: '这项任务已经不在队列里。' }, '任务操作未能完成。')).toBe('这项任务已经不在队列里。');
  });

  it('keeps the 暂不可用 prefix for a search source that is not ready', () => {
    expect(rendererErrorMessage({ code: 'SEARCH_CREDENTIAL_MISSING', message: '尚未填写密钥。' }, '无法检索。')).toBe('暂不可用 · 尚未填写密钥。');
  });

  it('serves all five task-page paths, with no instanceof Error left in the task page', () => {
    const source = readFileSync(new URL('../../src/renderer/tasks-overview.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/instanceof Error/u);
    expect(source.match(/rendererErrorMessage\(error, '/gu)).toHaveLength(5);
  });

  it.each([
    ['a bridge error object', { code: 'SERVICE_STOPPED', message: '本地业务服务已停止。' }, '本地业务服务已停止。'],
    ['a thrown renderer Error', new Error('read failed'), '任务总览暂时无法读取。'],
  ])('the task page reading fails with %s', async (_name, failure, shown) => {
    const restore = installMiniDom();
    vi.stubGlobal('window', { setInterval, clearInterval });
    vi.stubGlobal('localStorage', { getItem: () => null });
    const root = document.createElement('section'); miniDocument.body.append(root as never);
    const setStatus = vi.fn();
    const surface = mountTaskOverview({ root, api: { inspectTaskOverview: async () => { throw failure; } } as unknown as RendererApi,
      setStatus, openTarget: vi.fn(), openBook: vi.fn(), openResult: vi.fn() });
    try {
      await vi.waitFor(() => expect(setStatus).toHaveBeenCalledExactlyOnceWith(shown, 'error'));
    } finally { surface.destroy(); vi.unstubAllGlobals(); restore(); }
  });
});
