import { markDrafts, type DraftScope, type DraftPlace } from './mark-drafts.js';

type ComposerPlace = Extract<DraftPlace, { range: unknown }>;
/** Only folded rows reserve presentation space. Open forms retain the editor's existing overlay behaviour. */
export function createDraftComposers(host: {
  scope(): DraftScope;
  block(id: string): HTMLElement | null;
  layer: HTMLElement;
  scroll: HTMLElement;
  place(node: HTMLElement, blockId: string, offset?: number): void;
  expand(place: ComposerPlace): void;
  closed(): void;
}) {
  let open: { place: ComposerPlace; node: HTMLElement; submitBlur?: HTMLButtonElement | undefined; } | undefined;
  let dead = false;
  const rows = new Map<string, HTMLButtonElement>();
  const sheet = new CSSStyleSheet();
  document.adoptedStyleSheets.push(sheet);
  const surfaceId = crypto.randomUUID();
  host.layer.dataset['markDraftSurface'] = surfaceId;
  let appliedRules = '';
  const setRules = (rules: string): void => {
    if (rules !== appliedRules) { sheet.replaceSync(rules); appliedRules = rules; }
  };
  const clearRows = (): void => {
    for (const row of rows.values()) row.remove();
    rows.clear();
    setRules('');
  };
  const samePlace = (a: ComposerPlace, b: ComposerPlace): boolean => JSON.stringify(a) === JSON.stringify(b);
  const restore = (): void => {
    if (dead) return;
    const top = host.scroll.scrollTop;
    const shown = new Set<string>();
    const used = new Map<HTMLElement, number>();
    const positions: Array<{ row: HTMLButtonElement; blockId: string; offset: number }> = [];
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
      const count = used.get(block) ?? 0;
      positions.push({ row, blockId: place.range.blockId, offset: count * 40 });
      used.set(block, count + 1);

    }
    setRules([...used].map(([block, count]) =>
      `:has(> [data-mark-draft-surface="${CSS.escape(surfaceId)}"]) [data-block-id="${CSS.escape(block.dataset['blockId']!)}"] { margin-bottom: ${40 * count}px; }`).join('\n'));
    for (const position of positions) host.place(position.row, position.blockId, position.offset);
    for (const [key, row] of rows) if (!shown.has(key)) { row.remove(); rows.delete(key); }
    if (host.scroll.scrollTop !== top) host.scroll.scrollTop = top;
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
    submitStarted(button: HTMLButtonElement): void {
      if (open?.node.contains(button)) open.submitBlur = document.activeElement === button ? button : undefined;
    },
    isOpen(place: ComposerPlace): boolean { return open !== undefined && samePlace(open.place, place); },
    owns(node: HTMLElement | undefined): boolean { return open?.node === node && node !== undefined; },
    attach(node: HTMLElement, place: ComposerPlace): void {
      open = { node, place };
      restore();
      node.addEventListener('focusin', () => { if (open?.node === node) open.submitBlur = undefined; });
      node.addEventListener('focusout', (event) => {
        // Chromium briefly reports BODY while focus moves between descendants. The destination is authoritative.
        if (event.relatedTarget instanceof HTMLElement && node.contains(event.relatedTarget)) return;
        const settle = (): void => {
          // Only disabling the focused Submit owns this blur, even if the answer re-enabled it before delivery.
          const submittingBlur = open?.submitBlur !== undefined && event.target === open.submitBlur && document.activeElement === document.body;
          if (!dead && open?.node === node && !node.contains(document.activeElement) && !submittingBlur) fold();
        };
        if (event.relatedTarget === null || event.relatedTarget === undefined) requestAnimationFrame(settle);
        else queueMicrotask(settle);
      });
    },
    destroy(): void {
      dead = true; open = undefined; clearRows();
      const index = document.adoptedStyleSheets.indexOf(sheet);
      if (index >= 0) document.adoptedStyleSheets.splice(index, 1);
      delete host.layer.dataset['markDraftSurface'];
    },
  };
}
