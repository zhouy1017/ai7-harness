import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountLibraryMaterials, type MountLibraryMaterialsOptions } from '../../src/renderer/library-materials.js';
import { similarMaterialsField } from '../../src/renderer/task-material-selection.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { LibraryMaterialProjection, MaterialIndexProjection, MaterialTranslationProjection, RetrievalAssistMode } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// 资料库 as ordinary mode renders it (0.7.9 Owner review): 「暂不使用」 is recorded for a new item (BUG-03), 来源译文 says how it
// stands (BUG-19), and 相似段落检索 says what a search may send and what this one sent (2.3).

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); vi.useFakeTimers(); });
afterEach(() => { miniDocument.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });
const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

const BUILT: MaterialIndexProjection = {
  state: 'complete', reason: null, builtAt: '2026-11-25T01:00:00.000Z', digest: 'c'.repeat(64), translation: null,
  metadata: { documentTitle: null, language: 'other', paragraphs: 10, headings: 0, sentences: 30, characters: 900, pages: null },
  layers: { original: 'complete', metadata: 'complete', text: 'complete', recognition: 'not-needed', translation: 'not-needed', segments: 'complete' },
};
const ARRIVED: LibraryMaterialProjection = {
  materialId: 'm', title: '新到的资料', kind: 'document', recordedAt: '2026-11-25T01:00:00.000Z', digest: 'b'.repeat(64),
  source: { displayName: 'sample1.docx', format: 'DOCX', bytes: 29_550, sha256: 'a'.repeat(64) },
  attribution: null, eligibility: null, eligibilityReset: false, reference: { state: 'pending' }, decisionCount: 0, decisions: [], index: BUILT,
};
const translating = (translation: Partial<MaterialTranslationProjection>): LibraryMaterialProjection => {
  const now: MaterialTranslationProjection = { state: 'not-built', translated: 0, total: 10, model: null, request: { available: true, reason: null }, lastFailure: null, ...translation };
  return { ...ARRIVED, index: { ...BUILT, translation: now, layers: { ...BUILT.layers, translation: now.state } } };
};

async function mount(material: LibraryMaterialProjection, api: Partial<MountLibraryMaterialsOptions['api']> = {}) {
  const root = document.createElement('section');
  miniDocument.body.append(root as unknown as MiniElement);
  const status: string[] = [];
  await mountLibraryMaterials({
    root, focusMaterialId: null, setStatus: (message) => { status.push(message); }, errorMessage: (_error, fallback) => fallback,
    technicalDetails: () => document.createElement('details'),
    api: { inspectLibraryMaterials: async () => ({ materials: [material], nextCursor: null }), inspectLibraryMaterial: async () => material,
      listBooks: async () => ({ items: [], nextCursor: null }), ...api } as MountLibraryMaterialsOptions['api'],
  }).load();
  return { root, status };
}
const press = (root: Element, action: string): void => root.querySelector<HTMLButtonElement>(`[data-library-action="${action}"]`)!.click();

describe('资料库「暂不使用」 (0.7.9 review BUG-03)', () => {
  it('records 暂不使用 for a new item with no attribution, and the card then reads 暂不使用', async () => {
    // What the service answers for `not-used` on an item nobody was named for: it stands, and nothing waits for the editor.
    const decided: LibraryMaterialProjection = { ...ARRIVED, decisionCount: 1, notUsed: { decidedAt: '2026-11-25T02:00:00.000Z' } };
    const decide = vi.fn(async () => decided);
    const { root, status } = await mount(ARRIVED, { decideLibraryMaterial: decide });
    expect(root.querySelector('.knowledge-file-summary')!.textContent).toContain('还不能参考：先选给谁用');
    press(root, 'use'); await settle();
    const later = root.querySelector<HTMLInputElement>('.library-use-chooser [data-library-choice="deferred"]')!;
    expect(later.closest('label')!.textContent).toBe('暂不使用');
    later.checked = true; (later as unknown as MiniElement).dispatchEvent({ type: 'change' });
    press(root, 'confirm-use'); await settle();
    expect(decide.mock.calls).toEqual([[{ materialId: 'm', expectedDecisions: 0, decision: { kind: 'not-used' } }]]);
    const card = root.querySelector<HTMLElement>('article.library-material')!;
    expect([root.querySelector('.library-use-chooser'), card.dataset['decisions'], card.querySelector('.knowledge-file-summary')!.textContent!.startsWith('暂不使用')])
      .toEqual([null, '1', true]);
    expect(status.at(-1)).toBe('已记录「新到的资料」的决定：暂不使用。');
  });
});

describe('来源译文 in ordinary mode (0.7.9 review BUG-19)', () => {
  it.each([
    [{ state: 'building' as const, translated: 3 }, '来源译文：正在生成… 已译 3 / 10 段'],
    [{ state: 'complete' as const, translated: 10, model: 'route / model' }, '来源译文：已生成 10 段 AI 译文，只供对照'],
    [{ state: 'partial' as const, translated: 4, lastFailure: '来源译文没有完成（PROVIDER_TIMEOUT）；不会自动重发。' }, '来源译文：已生成 4 / 10 段；来源译文没有完成；不会自动重发。'],
    [{ state: 'not-built' as const, lastFailure: '结果待确认：本次来源译文可能已计费，没有完整结果；不会自动重发。' }, '来源译文：未生成：结果待确认：本次来源译文可能已计费，没有完整结果；不会自动重发。'],
  ])('says how 来源译文 stands: %j', async (translation, line) => {
    const { root } = await mount(translating(translation));
    const progress = root.querySelector<HTMLElement>('.material-index .material-translation-progress')!;
    expect([progress.textContent, progress.dataset['translationState']]).toEqual([line, translation.state]);
    // The layered index stays the developer layer's.
    expect(root.querySelector('.material-index-layers')).toBeNull();
  });

  it('draws the progress again as the translation moves, and shows no line for an item that needs none', async () => {
    let now = translating({ state: 'building', translated: 3 });
    const { root } = await mount(now, { inspectLibraryMaterial: async () => now });
    now = translating({ state: 'building', translated: 7 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(root.querySelector('.material-translation-progress')!.textContent).toBe('来源译文：正在生成… 已译 7 / 10 段');
    root.remove();
    expect((await mount(ARRIVED)).root.querySelector('.material-translation-progress')).toBeNull();
  });
});

describe('相似段落检索 says what leaves the machine (0.7.9 review 2.3)', () => {
  const NOTE = '已连接较轻模型时，检索词和候选片段会发给它做扩展和重排；没有连接或连不上时，只在本机按字面检索。';
  const MODES: ReadonlyArray<[RetrievalAssistMode, string]> = [
    ['fast-model', '本次：较轻模型参与了扩展和重排。'],
    ['fast-model-unused', '本次：已发给较轻模型，但没有用上，结果按本机字面检索。'],
    ['local', '本次：没有发送，只在本机按字面检索。'],
  ];

  it.each(MODES)('资料库: the field says what may be sent, and the %s answer what was', async (assist, line) => {
    const query = vi.fn(async () => ({ materialId: 'm', indexDigest: 'c'.repeat(64), assist, candidates: [{ ordinal: 2, page: null, pageParagraph: null, score: 1, preview: '河边的老人' }] }));
    const { root } = await mount(ARRIVED, { queryMaterialVectors: query });
    const search = root.querySelector('.material-vector-search')!;
    expect(search.querySelector('.material-vector-note')!.textContent).toBe(`结果仅供参考，原文以分段为准。${NOTE}`);
    expect(search.querySelector('[data-retrieval-assist]')).toBeNull();
    search.querySelector<HTMLInputElement>('[data-library-field="vector-query"]')!.value = '老人';
    press(root, 'vector-search'); await settle();
    const mode = search.querySelector<HTMLElement>('.material-vector-results [data-retrieval-assist]')!;
    expect([mode.dataset['retrievalAssist'], mode.textContent]).toEqual([assist, line]);
  });

  it.each(MODES)('a task\'s reference search: the field says what may be sent, and the %s answer what was', async (assist, line) => {
    vi.stubGlobal('window', { getSelection: () => null });
    const field = similarMaterialsField({ searchReferableMaterials: async () => ({ candidates: [], assist }) }, 'book', [], new Set(), () => undefined);
    miniDocument.body.append(field as unknown as MiniElement);
    expect(field.querySelector('.similar-materials-note')!.textContent).toBe(NOTE);
    const mode = field.querySelector<HTMLElement>('.similar-materials-mode')!;
    expect(mode.hidden).toBe(true);
    field.querySelector('textarea')!.value = '老人';
    Array.from(field.querySelectorAll('button')).find((button) => button.textContent === '检索相似段落')!.click();
    // While it searches, nothing claims where the search runs.
    expect(field.querySelector('[role="status"]')!.textContent).toBe(' · 正在检索…');
    await settle();
    expect([mode.hidden, mode.dataset['retrievalAssist'], mode.textContent]).toEqual([false, assist, line]);
  });
});
