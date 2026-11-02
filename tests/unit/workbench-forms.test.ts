import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEditableProcedureLibrary } from '../../src/renderer/procedure-library.js';
import { mountEditorialMemory } from '../../src/renderer/knowledge-base-memory.js';
import { preinstalledProcedureDefinitions } from '../../src/service/procedures/preinstalled.js';
import type { EditorialLearningProjection, RendererApi } from '../../src/shared/protocol.js';
import type { ProcedureLibraryProjection } from '../../src/shared/protocol/procedures.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => {
  restore = installMiniDom();
  vi.stubGlobal('Option', class extends MiniElement { constructor(text: string, value: string) { super('option'); this.textContent = text; this.value = value; } });
  Object.defineProperty(MiniElement.prototype, 'style', { configurable: true, get: () => ({}) });
  Object.defineProperty(MiniElement.prototype, 'prepend', { configurable: true, value(this: MiniElement, ...nodes: MiniElement[]) {
    this.replaceChildren(...nodes, ...this.children);
  } });
});
afterEach(() => {
  Reflect.deleteProperty(MiniElement.prototype, 'style'); Reflect.deleteProperty(MiniElement.prototype, 'prepend');
  vi.unstubAllGlobals(); restore();
});
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('workbench forms (#1287)', () => {
  it('mounts the editable catalog once, then opens a styled book chooser from the same card', async () => {
    const root = new MiniElement('section'); miniDocument.body.append(root);
    const procedures = preinstalledProcedureDefinitions().map((document) => {
      const pin = { procedureId: document.id, version: document.version, digest: 'a'.repeat(64) };
      return { ...pin, document, executorKind: 'review', preInstalled: true, stopped: false, sourceRunId: null, versions: [pin], documents: [document], uses: 2 };
    });
    let resolve!: (value: ProcedureLibraryProjection) => void;
    const projection = new Promise<ProcedureLibraryProjection>((done) => { resolve = done; });
    const book = { bookId: 'book-a', title: '公开合成图书', manuscriptState: 'populated' };
    const api = { procedureLibrary: vi.fn(() => projection), listBooks: vi.fn(async () => ({ items: [book], nextCursor: null })) } as unknown as RendererApi;
    const mounted = mountEditableProcedureLibrary(root as unknown as HTMLElement, api, vi.fn(), (_error, fallback) => fallback);
    expect(root.querySelectorAll('.knowledge-procedure-list').length).toBe(0);
    expect(root.textContent).toContain('正在读取工序');
    resolve({ procedures, completedRuns: [] }); await mounted;
    expect(root.querySelectorAll('.knowledge-procedure-list').length).toBe(1);
    expect(root.querySelectorAll('.knowledge-procedure-list li').length).toBe(17);
    expect(root.textContent).toContain('已使用 2 次');
    expect(root.textContent).not.toContain('审阅专用前身');
    root.querySelectorAll('button').find((button) => button.textContent === '运行此工序…')!.click(); await flush();
    expect(root.querySelectorAll('.procedure-book-chooser').length).toBe(1);
    expect(root.querySelectorAll('.procedure-book-chooser select option').map((option) => option.textContent)).toEqual([book.title]);
    expect(root.textContent).not.toContain('查看计划后再开始');
  });

  it('creates a signal form only on request and cancels without writing a memory', async () => {
    const root = new MiniElement('section'); miniDocument.body.append(root);
    const page = { basis: '公开合成学习记录', enabled: true, controlEntries: 0, excludedBooks: [], excludedMaterials: [], items: [],
      nextExclusionOffset: null, nextItemOffset: null, nextSignalOffset: null,
      signals: [1, 2].map((id) => ({ signalId: `signal-${id}`, bookTitle: '公开合成图书', kind: 'accepted', recordedAt: '2026-11-02',
        attribution: { authors: [], editors: [] }, source: { bookId: 'book-a', decisionId: `decision-${id}`, journalSequence: id },
        eligibility: { decisionId: null }, currentEligibility: 'house', rewriteDistance: null, memoryCandidate: null })) } as unknown as EditorialLearningProjection;
    const create = vi.fn();
    const api = { inspectEditorialLearning: async () => page, createEditorialMemory: create } as unknown as RendererApi;
    await mountEditorialMemory(root as unknown as HTMLElement, api, vi.fn());
    expect(root.querySelectorAll('.learning-material form').length).toBe(0);
    expect(root.querySelectorAll('[data-memory-action="new"]').length).toBe(2);
    root.querySelector('[data-memory-action="new"]')!.click();
    expect(root.querySelectorAll('.memory-create-form').length).toBe(1);
    expect(root.querySelectorAll('.memory-create-form input').length).toBe(3);
    root.querySelectorAll('.memory-create-form button').find((button) => button.textContent === '取消')!.click();
    expect(root.querySelectorAll('.memory-create-form').length).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
});
