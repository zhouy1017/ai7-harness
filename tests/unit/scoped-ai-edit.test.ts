import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AI_LOCK_TOOLTIP,
  aiLockBadge,
  openScopedAiEditComposer,
  selectionLocked,
  selectionPins,
  setAiLocks,
  type ScopedAiEditHost,
} from '../../src/renderer/scoped-ai-edit.js';
import type { DialogueSelectionInput, ManuscriptWindowProjection, ScopedAiEditProjection, StartScopedAiEditInput } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

// 就选中部分让 AI 修改 and 🔒 锁定 as the manuscript surface mounts them (Issue #1412): the composer names the window's base and
// lock set and the exact selected pins, reads the request again until it settles and has the surface reload; the lock calls
// name the lock set on screen. Synthetic words only.

let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); vi.stubGlobal('window', { setTimeout: (run: () => void) => setTimeout(run, 0), clearTimeout }); });
afterEach(() => { vi.unstubAllGlobals(); uninstall(); });

const LOCKS = 'a'.repeat(64);
const window0 = { bookId: 'book', manuscriptId: 'doc', branchId: 'branch', revisionId: 'rev', journalSequence: 7, aiLocksDigest: LOCKS,
  aiLockedBlockIds: ['blk_b'], blocks: [] } as unknown as ManuscriptWindowProjection;
const span: DialogueSelectionInput = {
  manuscriptId: 'doc', branchId: 'branch', windowStartBlockId: 'blk_a', baseRevisionId: 'rev', expectedJournalSequence: 7, blockId: 'blk_a',
  baseBlockDigest: 'd1', fromGrapheme: 2, toGrapheme: 9, selectedText: '甲乙丙 丁',
  span: [{ blockId: 'blk_a', blockDigest: 'd1', fromGrapheme: 2, toGrapheme: 9 }, { blockId: 'blk_b', blockDigest: 'd2', fromGrapheme: 0, toGrapheme: 3 }],
};

function host(overrides: Partial<ScopedAiEditHost['api']> = {}) {
  const statuses: Array<[string, string | undefined]> = [];
  const refreshed: Array<ScopedAiEditProjection | null> = [];
  const flushed = vi.fn(async () => undefined);
  const value: ScopedAiEditHost = {
    api: {
      startScopedAiEdit: vi.fn(), inspectScopedAiEdit: vi.fn(), setAiEditLocks: vi.fn(),
      inspectAiEditLocks: vi.fn(async () => ({ manuscriptId: 'doc', branchId: 'branch', blockIds: [], sectionHeadingBlockIds: [], digest: LOCKS, label: '' })),
      ...overrides,
    } as ScopedAiEditHost['api'],
    flush: flushed,
    current: () => window0,
    refresh: async (result) => { refreshed.push(result); },
    setStatus: (text, tone) => { statuses.push([text, tone]); },
    errorMessage: (_error, fallback) => fallback,
  };
  return { value, statuses, refreshed, flushed };
}

const projection = (state: ScopedAiEditProjection['state'], markIds: string[] = []): ScopedAiEditProjection => ({
  bookId: 'book', requestId: 'req', manuscriptId: 'doc', branchId: 'branch', state,
  label: state === 'applied' ? '已局部更新所选的 1 个段落（其余 9 个未选中/已锁定段落保持原样）。' : '正在让 AI 修改…',
  changedBlockIds: markIds.length > 0 ? ['blk_a'] : [], markIds, keptBlockCount: 9, droppedCount: 0, outcomeUnknown: false,
});

it('reads a cross-paragraph selection as its exact pins and knows when all of it is locked', () => {
  expect(selectionPins(span)).toEqual(span.span);
  const { span: _pins, ...single } = span;
  expect(selectionPins(single)).toEqual([{ blockId: 'blk_a', blockDigest: 'd1', fromGrapheme: 2, toGrapheme: 9 }]);
  expect(selectionLocked(window0, span)).toBe(false);
  expect(selectionLocked({ aiLockedBlockIds: ['blk_a', 'blk_b'] }, span)).toBe(true);
});

it('sends the selected pins on the window base and lock set, reads the request until it settles and has the surface reload', async () => {
  let started: StartScopedAiEditInput | undefined;
  const reads = [projection('requesting'), projection('applied', ['mark-1'])];
  const { value, statuses, refreshed, flushed } = host({
    startScopedAiEdit: vi.fn(async (input: StartScopedAiEditInput) => { started = input; return projection('requesting'); }),
    inspectScopedAiEdit: vi.fn(async () => reads.shift()!),
  });
  const settled = new Promise<ScopedAiEditProjection | null>((resolve) => {
    openScopedAiEditComposer(value, { selection: span, quote: span.selectedText, sectionHeadingBlockId: 'blk_h', mount: miniDocument.body as unknown as HTMLElement, onSettled: resolve });
  });
  const form = miniDocument.querySelector('[data-scoped-ai-edit="composer"]')!;
  expect(form.querySelectorAll('[data-scoped-ai-edit-scope]').map((radio) => radio.dataset['scopedAiEditScope'])).toEqual(['selected', 'section', 'document']);
  miniDocument.querySelector('[data-scoped-ai-edit="instruction"]')!.value = '  改得更紧凑  ';
  form.dispatchEvent({ type: 'submit' });
  const result = await settled;
  expect(flushed).toHaveBeenCalled();
  expect(started).toEqual({ manuscriptId: 'doc', branchId: 'branch', baseRevisionId: 'rev', expectedJournalSequence: 7, expectedLocksDigest: LOCKS,
    instruction: '改得更紧凑', scope: { mode: 'selected-only', span: span.span } });
  expect(result?.state).toBe('applied');
  expect(refreshed).toEqual([result]);
  expect(statuses.at(-1)).toEqual([result!.label, 'success']);
  expect(miniDocument.querySelector('[data-scoped-ai-edit="composer"]')).toBeNull();
});

it('offers only the unlocked ranges with nothing selected, and sends the chosen section', async () => {
  let started: StartScopedAiEditInput | undefined;
  const { value } = host({
    startScopedAiEdit: vi.fn(async (input: StartScopedAiEditInput) => { started = input; return projection('unchanged'); }),
  });
  const settled = new Promise((resolve) => openScopedAiEditComposer(value, { selection: null, sectionHeadingBlockId: 'blk_h', mount: miniDocument.body as unknown as HTMLElement, onSettled: resolve }));
  const radios = miniDocument.body.querySelectorAll('[data-scoped-ai-edit-scope]');
  expect(radios.map((radio) => radio.dataset['scopedAiEditScope'])).toEqual(['section', 'document']);
  miniDocument.querySelector('[data-scoped-ai-edit="instruction"]')!.value = '再精炼';
  miniDocument.querySelector('[data-scoped-ai-edit="composer"]')!.dispatchEvent({ type: 'submit' });
  await settled;
  expect(started?.scope).toEqual({ mode: 'unlocked-only', range: { kind: 'section', headingBlockId: 'blk_h' } });
});

it('locks a selection against the lock set on screen, reloads, and the badge unlocks', async () => {
  const setAiEditLocks = vi.fn(async () => ({ manuscriptId: 'doc', branchId: 'branch', blockIds: ['blk_a', 'blk_b'], sectionHeadingBlockIds: [], digest: 'b'.repeat(64), label: '' }));
  const { value, refreshed, statuses } = host({ setAiEditLocks });
  await setAiLocks(value, [{ kind: 'block', blockId: 'blk_a' }, { kind: 'block', blockId: 'blk_b' }], true);
  expect(setAiEditLocks).toHaveBeenCalledWith({ manuscriptId: 'doc', branchId: 'branch', targets: [{ kind: 'block', blockId: 'blk_a' }, { kind: 'block', blockId: 'blk_b' }], locked: true, expectedLocksDigest: LOCKS });
  expect(refreshed).toEqual([null]);
  expect(statuses.at(-1)).toEqual(['已锁定 2 段：AI 修改时保持原样', 'success']);
  const unlock = vi.fn();
  const badge = aiLockBadge(unlock);
  expect(badge.title).toContain(AI_LOCK_TOOLTIP);
  badge.click();
  expect(unlock).toHaveBeenCalledOnce();
});
