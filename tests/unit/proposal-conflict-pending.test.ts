import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountProposalConflict } from '../../src/renderer/proposal-conflict.js';
import type { ProposalConflictProjection, ProposalConflictRegenerationProjection } from '../../src/shared/protocol.js';

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

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the conflict surface while regeneration is pending', () => {
  it.each(['drafted', 'failed'] as const)('protects the draft until the %s answer settles, then restores the controls', async (outcome) => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag), activeElement: null });
    vi.stubGlobal('HTMLElement', Element);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
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
