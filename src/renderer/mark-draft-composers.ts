import { markDrafts, type DraftScope, type DraftPlace } from './mark-drafts.js';

type ComposerPlace = Extract<DraftPlace, { range: unknown }>;
/** Only folded rows reserve presentation space. Open forms retain the editor's existing overlay behaviour. */
export function createDraftComposers(host: {
  scope(): DraftScope;
  block(id: string): HTMLElement | null;
  layer: HTMLElement;
  scroll: HTMLElement;
  place(node: HTMLElement, blockId: string): void;
  expand(place: ComposerPlace): void;
  closed(): void;
}) {
  let open: { place: ComposerPlace; node: HTMLElement; } | undefined;
  let dead = false;
  const rows = new Map<string, HTMLButtonElement>();
  const margins = new Map<HTMLElement, string>();
  const clearRows = (): void => {
    for (const row of rows.values()) row.remove();
    rows.clear();
    for (const [block, margin] of margins) block.style.marginBottom = margin;
    margins.clear();
  };
  const samePlace = (a: ComposerPlace, b: ComposerPlace): boolean => JSON.stringify(a) === JSON.stringify(b);
  const restore = (): void => {
    if (dead) return;
    const top = host.scroll.scrollTop;
    for (const [block, margin] of margins) block.style.marginBottom = margin;
    margins.clear();
    const shown = new Set<string>();
    const used = new Map<HTMLElement, number>();
    for (const draft of markDrafts.list(host.scope())) {
      if (draft.place.kind === 'reply' || (open && samePlace(open.place, draft.place))) continue;
      const place = draft.place, block = host.block(place.range.blockId);
      if (!block) continue;
      const key = JSON.stringify([place.kind, place.range.blockId, place.range.blockDigest, place.range.fromGrapheme, place.range.toGrapheme, place.range.text]);
      shown.add(key);
      let row = rows.get(key);
      if (!row) {
      row = document.createElement('button');
      row.type = 'button';
      row.className = 'editorial-mark-draft-row btn quiet';
      row.dataset['markDraftRow'] = place.kind;
      row.textContent = place.kind === 'annotation' ? '未发送的批注 · 展开' : '未发送的备注 · 展开';
      row.addEventListener('click', () => host.expand(place));
      host.layer.append(row);
      rows.set(key, row);
      }
      host.place(row, place.range.blockId);
      const count = used.get(block) ?? 0;
      row.style.top = `${Number.parseFloat(row.style.top) + count * 40}px`;
      used.set(block, count + 1);
      if (!margins.has(block)) margins.set(block, block.style.marginBottom);
      block.style.marginBottom = `${40 * (count + 1)}px`;
    }
    for (const [key, row] of rows) if (!shown.has(key)) { row.remove(); rows.delete(key); }
    host.scroll.scrollTop = top;
  };
  const fold = (): boolean => {
    if (!open) return false;
    const current = open;
    open = undefined;
    current.node.remove();
    host.closed();
    restore();
    return true;
  };
  return {
    restore, fold,
    isOpen(place: ComposerPlace): boolean { return open !== undefined && samePlace(open.place, place); },
    owns(node: HTMLElement | undefined): boolean { return open?.node === node && node !== undefined; },
    attach(node: HTMLElement, place: ComposerPlace): void {
      open = { node, place };
      restore();
      node.addEventListener('focusout', () => queueMicrotask(() => {
        if (!dead && open?.node === node && !node.contains(document.activeElement)) fold();
      }));
    },
    destroy(): void { dead = true; open = undefined; clearRows(); },
  };
}
