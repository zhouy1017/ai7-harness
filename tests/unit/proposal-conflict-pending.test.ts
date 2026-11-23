import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountProposalConflict } from '../../src/renderer/proposal-conflict.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { ProposalConflictProjection, ProposalConflictRegenerationProjection } from '../../src/shared/protocol.js';
import { installMiniDom } from '../support/mini-dom.js';

// A minimal element tree for this renderer's event boundary. No browser or Electron is started by L1.
class Element extends EventTarget {
  readonly dataset: Record<string, string> = {};
  children: Element[] = [];
  parent: Element | null = null;
  disabled = false;
  checked = false;
  value = '';
  constructor(readonly tag: string) { super(); }
  get isConnected(): boolean { return this.parent !== null; }
  append(...nodes: Element[]): void { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes: Element[]): void {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.append(...nodes);
  }
  replaceWith(node: Element): void {
    const parent = this.parent!;
    parent.children[parent.children.indexOf(this)] = node;
    node.parent = parent;
    this.parent = null;
  }
  setAttribute(): void {}
  focus(): void {}
  contains(node: Element | null): boolean { return node === this || this.children.some((child) => child.contains(node)); }
  all(): Element[] { return this.children.flatMap((child) => [child, ...child.all()]); }
  querySelectorAll(tag: string): Element[] { return this.all().filter((node) => node.tag === tag); }
}

const conflict: ProposalConflictProjection = {
  markId: 'mark', manuscriptId: 'manuscript', branchId: 'branch', bookId: 'book', conflictKind: 'suggestion', deferral: null,
  blockId: 'block', fromGrapheme: 0, toGrapheme: 2, basisDigest: 'a'.repeat(64), base: '原文', current: '当前', proposed: '提议',
  context: { before: '', after: '' }, units: [{ kind: 'conflict', base: '原文', current: '当前', proposed: '提议' }],
  draft: null, draftOnEarlierBasis: false, newVersion: { available: true, blocker: null },
  suggestion: { itemId: 'item', rationale: '', source: { kind: 'editor', origin: null, label: null, taskId: null } },
  navigator: { entries: [{ markId: 'mark', blockId: 'block', conflictKind: 'suggestion', deferred: false }], truncated: false },
};

afterEach(() => { setTechnicalLayerVisible(false); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the conflict surface while regeneration is pending', () => {
  it.each(['drafted', 'failed'] as const)('protects the draft until the %s answer settles, then restores the controls', async (outcome) => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag), activeElement: null });
    vi.stubGlobal('HTMLElement', Element);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    setTechnicalLayerVisible(true);
    const root = new Element('main');
    const find = (predicate: (node: Element) => boolean): Element => {
      const found = root.all().find(predicate);
      expect(found).toBeDefined();
      return found!;
    };
    const paths = () => find((node) => node.dataset['conflictPaths'] === 'true');
    const choose = (value: string): void => {
      const radio = find((node) => node.tag === 'input' && node.value === value);
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    };
    const pending: ProposalConflictRegenerationProjection = {
      requestId: 'request', bookId: 'book', manuscriptId: 'manuscript', branchId: 'branch', markId: 'mark', unitIndex: 0,
      outcome: 'requesting', outcomeUnknown: false, label: '等待',
    };
    let finish!: (result: ProposalConflictRegenerationProjection) => void;
    const answer = new Promise<ProposalConflictRegenerationProjection>((resolve) => { finish = resolve; });
    const inspectConflict = vi.fn().mockResolvedValue(conflict);
    const inspectRequest = vi.fn(async () => ({ kind: 'conflict-regenerate' as const, regeneration: await answer }));
    const save = vi.fn();
    const status = vi.fn();
    const surface = mountProposalConflict({
      root: root as unknown as HTMLElement, manuscriptId: 'manuscript', branchId: 'branch', markId: 'mark', bookTitle: '合成测试', platform: 'win32',
      api: {
        inspectProposalConflict: inspectConflict,
        inspectFastInteractionRoutes: vi.fn().mockResolvedValue({ bookId: 'book', conflictRegenerate: { available: true, reason: null } }),
        regenerateProposalConflictUnit: vi.fn().mockResolvedValue(pending), inspectFastInteractionRequest: inspectRequest,
        saveProposalConflictDraft: save, resolveProposalConflict: vi.fn(),
      },
      technicalDetails: () => new Element('details') as unknown as HTMLElement, setStatus: status,
      errorMessage: (_error, fallback) => fallback, errorCode: () => null, returnToManuscript: vi.fn(), openConflict: vi.fn(),
    });
    surface.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(paths().disabled).toBe(false);
    choose('regenerate');
    find((node) => node.dataset['conflictAction'] === 'regenerate-unit').dispatchEvent(new Event('click'));
    await vi.advanceTimersByTimeAsync(400);
    expect(inspectRequest).toHaveBeenCalledOnce();
    expect(paths().disabled).toBe(true);
    // Even a queued change event cannot open a local editor that completion would replace.
    choose('edit-draft');
    expect(find((node) => node.dataset['conflictPathDetail'] !== undefined).dataset['conflictPathDetail']).toBe('regenerate');
    expect(save).not.toHaveBeenCalled();
    finish({ ...pending, outcome, label: '完成' });
    await vi.advanceTimersByTimeAsync(0);
    expect(paths().disabled).toBe(false);
    expect(find((node) => node.dataset['conflictPathDetail'] !== undefined).dataset['conflictPathDetail']).toBe(outcome === 'drafted' ? 'edit-draft' : 'regenerate');
    expect(status).toHaveBeenLastCalledWith('完成', outcome === 'drafted' ? 'success' : 'error');
    surface.destroy();
  });
});

it('opens ordinary conflicts at the text choices and saves the chosen writing without a path-selection ceremony', async () => {
  const restore = installMiniDom();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const root = document.createElement('main'); document.body.append(root);
  const save = vi.fn().mockResolvedValue({ markId: 'mark', basisDigest: conflict.basisDigest, draft: { ordinal: 1 } });
  const resolve = vi.fn().mockResolvedValue({ markId: 'mark', blockId: 'block', newMarkId: 'new-mark' });
  const returnToManuscript = vi.fn();
  const surface = mountProposalConflict({ root, manuscriptId: 'manuscript', branchId: 'branch', markId: 'mark', bookTitle: '合成测试', platform: 'win32',
    api: { inspectProposalConflict: vi.fn().mockResolvedValue(conflict), inspectFastInteractionRoutes: vi.fn().mockResolvedValue({ conflictRegenerate: { available: false, reason: '尚未配置模型' } }),
      saveProposalConflictDraft: save, resolveProposalConflict: resolve, regenerateProposalConflictUnit: vi.fn(), inspectFastInteractionRequest: vi.fn() },
    technicalDetails: () => document.createElement('details'), setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, errorCode: () => null,
    returnToManuscript, openConflict: vi.fn() });
  try {
    surface.start();
    await vi.waitFor(() => expect(root.querySelector('[data-conflict-draft]')).not.toBeNull());
    expect(root.querySelector('input[type="radio"]')).toBeNull();
    expect(root.textContent).not.toMatch(/解决草稿|提案|权威|三方|合并结果/u);
    expect([...root.querySelectorAll('.proposal-conflict-reference dt')].map((node) => node.textContent)).toEqual(['原文', '当前稿件', '修改建议']);
    expect(save).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    root.querySelector<HTMLElement>('[data-conflict-action="take-proposed"]')!.click();
    const finish = root.querySelector<HTMLButtonElement>('[data-conflict-action="save-version"]')!;
    expect(finish.textContent).toBe('保存修改建议');
    expect(finish.disabled).toBe(false);
    finish.click();
    await vi.waitFor(() => expect(returnToManuscript).toHaveBeenCalledWith({ blockId: 'block', markId: 'new-mark' }, expect.any(String)));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ units: [{ resolution: 'proposed', text: null }] }));
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'new-version', draftOrdinal: 1, basisDigest: conflict.basisDigest }));
  } finally { surface.destroy(); restore(); }
});
