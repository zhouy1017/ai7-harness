import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { mountDialogue, type DialogueSurfaceOptions } from '../../src/renderer/dialogue.js';
import type { DialogueProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { uninstall(); vi.unstubAllGlobals(); });

const projection = (): DialogueProjection => ({
  dialogueId: 'dialogue', bookId: 'book', manuscriptId: 'manuscript', branchId: 'branch', question: '如何改写？', selection: '原文',
  range: { blockId: 'block', fromGrapheme: 0, toGrapheme: 2 }, askedAt: 'now',
  attempts: [{ attemptId: 'first', ordinal: 1, kind: 'ask', state: 'completed', fragments: [{ text: '建议改为：“改写内容”。', breakAfter: false }],
    fragmentsFrom: 0, fragmentTotal: 1, source: 'ledger', causeCode: null, startedAt: 'now', settledAt: 'now', convertedMarkIds: [] }],
  actions: { stop: false, continue: false, regenerate: true, convert: true },
});

function mount(next = projection()) {
  const follow = vi.fn(async () => next);
  const options: DialogueSurfaceOptions = {
    api: { inspectDialogue: async () => next, continueDialogueAnswer: follow, stopDialogueAnswer: async () => next,
      regenerateDialogueAnswer: async () => next, convertDialogueToChangeSuggestion: vi.fn(), promoteAnswerToTaskIntentDraft: vi.fn() },
    setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, jump: vi.fn(), onConverted: vi.fn(), onChanged: vi.fn(), onPromoted: vi.fn(),
  };
  const surface = mountDialogue(options);
  const root = surface.element as unknown as MiniElement;
  miniDocument.body.append(root);
  surface.show(next.dialogueId);
  return { surface, root, follow, options };
}

describe('the dialogue drawer', () => {
  it('sends a follow-up from the current conversation and prefills the extracted rewrite', async () => {
    const { root, follow, surface } = mount();
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    root.querySelector('[data-dialogue-action="convert-edit"]')!.click();
    expect(root.querySelectorAll('textarea').find((node) => node.name === 'proposedText')!.value).toBe('改写内容');
    root.querySelector('[data-dialogue-action="convert-cancel"]')!.click();
    expect(miniDocument.activeElement === root.querySelector('.dialogue-convert-menu summary')).toBe(true);
    root.querySelector('[data-dialogue-follow-up]')!.value = '再简洁一些。';
    root.querySelector('.dialogue-follow-up')!.dispatchEvent({ type: 'submit', bubbles: true });
    await vi.waitFor(() => expect(follow).toHaveBeenCalledWith({ dialogueId: 'dialogue', attemptId: 'first', question: '再简洁一些。' }));
    expect(root.querySelector('[data-dialogue-follow-up]')!.value).toBe('');
    surface.stop();
  });

  it('converts the extracted rewrite in one click (Issue #1410 item 10)', async () => {
    const next = projection();
    const { root, surface, options } = mount(next);
    const convert = vi.fn(async () => ({ dialogue: next, markId: 'mark', completionLabel: '已转为修改建议' }));
    Object.assign(options.api, { convertDialogueToChangeSuggestion: convert });
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    root.querySelector('[data-dialogue-action="convert"]')!.click();
    await vi.waitFor(() => expect(options.onConverted).toHaveBeenCalledWith(next, 'mark'));
    expect(convert).toHaveBeenCalledWith({ dialogueId: 'dialogue', attemptId: 'first', proposedText: '改写内容', rationale: '' });
    expect(root.querySelector('.dialogue-convert')).toBeNull();
    surface.stop();
  });

  it('folds earlier attempts and places the follow-up after the latest answer', async () => {
    setTechnicalLayerVisible(false);
    const next = projection(); const attempts = [...next.attempts, { ...next.attempts[0]!, attemptId: 'second', ordinal: 2, kind: 'regenerate' as const }];
    const { root, surface } = mount({ ...next, attempts });
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    expect(root.querySelectorAll('.dialogue-attempt').map(node => node.open)).toEqual([false, true]);
    expect(root.children.indexOf(root.querySelector('.dialogue-attempts')!)).toBeLessThan(root.children.indexOf(root.querySelector('.dialogue-follow-up')!));
    expect(root.querySelector('.dialogue-follow-up')!.className).not.toContain('editorial-mark-composer');
    expect(root.querySelector('.dialogue-authority') === null).toBe(true); surface.stop();
  });

  it('numbers clickable citations and their matching jump buttons', async () => {
    const id = 'a'.repeat(64); const next = projection();
    const { root, options, surface } = mount({ ...next, anchors: [{ candidateId: id, sourceKind: 'manuscript', sourceId: 'manuscript', revisionOrIndexDigest: id, anchor: { blockId: 'quoted', start: 0, end: 2 }, score: 1, preview: '' }],
      attempts: [{ ...next.attempts[0]!, fragments: [{ text: `参考[retrieval:${id}]。`, breakAfter: false }] }] });
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    expect(root.querySelector('.dialogue-citation')!.textContent).toBe('〔1〕');
    expect(root.querySelector('[data-dialogue-retrieval-anchor]')!.textContent).toContain('〔1〕');
    root.querySelector('.dialogue-citation')!.click();
    expect(options.jump).toHaveBeenCalledWith({ manuscriptId: 'manuscript', blockId: 'quoted' }); surface.stop();
  });

  it('updates the disclaimer when developer mode changes after mount', async () => {
    setTechnicalLayerVisible(false); const { root, surface } = mount();
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    expect(root.querySelector('.dialogue-authority') === null).toBe(true);
    setTechnicalLayerVisible(true); surface.show('dialogue');
    await vi.waitFor(() => expect(root.querySelectorAll('.dialogue-authority').length).toBe(1));
    setTechnicalLayerVisible(false); surface.show('dialogue');
    await vi.waitFor(() => expect(root.querySelectorAll('.dialogue-authority').length).toBe(0)); surface.stop();
  });

  it('uses incoming streaming anchors and leaves unlisted citations neutral', async () => {
    const id = 'a'.repeat(64); const next = projection();
    const first = { ...next.attempts[0]!, state: 'answering' as const, fragments: [{ text: `[retrieval:${'b'.repeat(64)}]`, breakAfter: false }] };
    const { root, options, surface } = mount({ ...next, anchors: [], attempts: [first] });
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    expect(root.querySelector('.dialogue-answer')!.textContent).toBe('〔稿件引用〕');
    options.api.inspectDialogue = async () => ({ ...next, anchors: [{ candidateId: id, sourceKind: 'manuscript', sourceId: 'manuscript', revisionOrIndexDigest: id, anchor: { blockId: 'quoted', start: 0, end: 2 }, score: 1, preview: '' }],
      attempts: [{ ...first, fragmentsFrom: 1, fragmentTotal: 2, fragments: [{ text: `[retrieval:${id}]`, breakAfter: false }] }] });
    // Right after the append, before the next poll repaints everything: the appended fragment already names its citation.
    await vi.waitFor(() => expect(root.querySelectorAll('.dialogue-fragment').length).toBe(2));
    expect(root.querySelectorAll('.dialogue-citation').length).toBe(1);
    root.querySelector('.dialogue-citation')!.click(); expect(options.jump).toHaveBeenCalledWith({ manuscriptId: 'manuscript', blockId: 'quoted' }); surface.stop();
  });

  it('keeps an opened earlier answer and its focus while the next answer is awaited', async () => {
    const next = projection();
    const waiting = { ...next.attempts[0]!, attemptId: 'second', ordinal: 2, kind: 'ask' as const, state: 'answering' as const, fragments: [], fragmentsFrom: 0, fragmentTotal: 0 };
    let current: DialogueProjection = { ...next, attempts: [next.attempts[0]!, waiting], actions: { stop: true, continue: false, regenerate: false, convert: false } };
    const { root, options, surface } = mount(current);
    const inspect = vi.fn(async () => current);
    options.api.inspectDialogue = inspect;
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    const earlier = () => root.querySelectorAll('.dialogue-attempt').find((node) => node.dataset['dialogueAttempt'] === 'first')!;
    expect(earlier().open).toBe(false);
    earlier().open = true; earlier().querySelector('summary')!.focus();
    const before = inspect.mock.calls.length;
    await vi.waitFor(() => expect(inspect.mock.calls.length).toBeGreaterThanOrEqual(before + 2));
    expect(earlier().open).toBe(true);
    expect(miniDocument.activeElement === earlier().querySelector('summary')).toBe(true);
    current = { ...current, attempts: [next.attempts[0]!, { ...waiting, state: 'completed', fragments: [{ text: '好。', breakAfter: false }], fragmentTotal: 1 }], actions: next.actions };
    await vi.waitFor(() => expect(root.querySelector('[data-dialogue-answer="second"]')!.textContent).toBe('好。'));
    expect(earlier().open).toBe(true);
    expect(miniDocument.activeElement === earlier().querySelector('summary')).toBe(true);
    surface.stop();
  });

  it('puts the menus under the shared menu class and returns focus to the convert menu after a submit', async () => {
    const next = projection();
    const { root, options, surface } = mount(next);
    Object.assign(options.api, { convertDialogueToChangeSuggestion: vi.fn(async () => ({ dialogue: next, markId: 'mark', completionLabel: '已转为修改建议' })) });
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    expect(root.querySelector('.dialogue-convert-menu')!.className).toContain('ui-disclosure-menu');
    expect(root.querySelector('.dialogue-more')!.className).toContain('ui-disclosure-menu');
    root.querySelector('[data-dialogue-action="convert-edit"]')!.click();
    root.querySelector('.dialogue-convert')!.dispatchEvent({ type: 'submit', bubbles: true });
    await vi.waitFor(() => expect(options.onConverted).toHaveBeenCalled());
    expect(miniDocument.activeElement === root.querySelector('.dialogue-convert-menu summary')).toBe(true);
    surface.stop();
  });

  it('focuses the first menu summary, never a button inside a closed menu, after an action', async () => {
    const next = projection();
    const { root, options, surface } = mount(next);
    Object.assign(options.api, { regenerateDialogueAnswer: vi.fn(async () => next) });
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    root.querySelector('[data-dialogue-action="regenerate"]')!.click();
    await vi.waitFor(() => expect(options.api.regenerateDialogueAnswer).toHaveBeenCalled());
    await vi.waitFor(() => expect(miniDocument.activeElement === root.querySelector('.dialogue-convert-menu summary')).toBe(true));
    surface.stop();
  });

  it('omits unavailable answer actions', async () => {
    const { root, surface } = mount({ ...projection(), actions: { stop: false, continue: false, convert: false, regenerate: false } });
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    expect(root.querySelectorAll('[data-dialogue-action="regenerate"]').length).toBe(0); surface.stop();
  });

  it('does not render internal workspace JSON even if an origin-tagged response contains fragments', async () => {
    const next = projection();
    const { root, surface } = mount({ ...next, origin: 'agent-workspace', attempts: [{ ...next.attempts[0]!,
      fragments: [{ text: '{"schema":"ai7.agent-workspace.change-set/1","items":[]}', breakAfter: false }] }] });
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    expect(root.textContent).not.toContain('ai7.agent-workspace.change-set');
    expect(root.querySelector('.dialogue-follow-up')!.hidden).toBe(true);
    surface.stop();
  });
});
