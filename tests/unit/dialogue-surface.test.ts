import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  return { surface, root, follow };
}

describe('the dialogue drawer', () => {
  it('sends a follow-up from the current conversation and prefills the extracted rewrite', async () => {
    const { root, follow, surface } = mount();
    await vi.waitFor(() => expect(root.dataset['dialogue']).toBe('ready'));
    root.querySelector('[data-dialogue-action="convert"]')!.click();
    expect(root.querySelectorAll('textarea').find((node) => node.name === 'proposedText')!.value).toBe('改写内容');
    root.querySelector('[data-dialogue-action="convert-cancel"]')!.click();
    root.querySelector('[data-dialogue-follow-up]')!.value = '再简洁一些。';
    root.querySelector('.dialogue-follow-up')!.dispatchEvent({ type: 'submit', bubbles: true });
    await vi.waitFor(() => expect(follow).toHaveBeenCalledWith({ dialogueId: 'dialogue', attemptId: 'first', question: '再简洁一些。' }));
    expect(root.querySelector('[data-dialogue-follow-up]')!.value).toBe('');
    surface.stop();
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
