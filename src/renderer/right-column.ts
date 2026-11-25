/** The surfaces that can temporarily replace the 批注栏 in the one right-hand column. */
export type RightColumnReplacer = 'navigation' | 'analysis' | 'drawer';

export interface RightColumnState {
  /** The 批注栏 is explicitly open (the stored preference), not merely visible. */
  readonly commentsOpen: boolean;
  /** Which surface, if any, temporarily replaced the 批注栏. */
  readonly commentsReplacedBy: RightColumnReplacer | null;
}

export interface RightColumn {
  state(): RightColumnState;
  /** Whether the 批注栏 is on screen now: explicitly open and not temporarily replaced. */
  commentsVisible(): boolean;
  /** `replacer` is open but a later column temporarily replaced it in turn. */
  suspended(replacer: RightColumnReplacer): boolean;
  /** The editor opens or closes the pane themself: the one path that changes the stored preference. */
  setCommentsOpen(open: boolean): void;
  /** Another column opens and temporarily replaces the pane. No preference is written. */
  replaceComments(replacer: RightColumnReplacer): void;
  /** The replacing column closed: bring the pane back when that column was the one that replaced it. */
  restoreComments(replacer: RightColumnReplacer): void;
}

export function createRightColumn(commentsOpenInitially: boolean): RightColumn {
  let open = commentsOpenInitially;
  let stack: RightColumnReplacer[] = [];
  return {
    state: () => ({ commentsOpen: open, commentsReplacedBy: stack.at(-1) ?? null }),
    commentsVisible: () => open && stack.length === 0,
    suspended: (replacer) => stack.includes(replacer) && stack.at(-1) !== replacer,
    setCommentsOpen(next) {
      open = next;
      stack = [];
    },
    replaceComments(replacer) {
      if (stack.at(-1) !== replacer) { stack = stack.filter(item => item !== replacer); stack.push(replacer); }
    },
    restoreComments(replacer) {
      stack = stack.filter(item => item !== replacer);
    },
  };
}

/** Keep layout state in memory; widths and the minimum measure belong to the stylesheet. */
export function mountColumnMeasure(workspace: HTMLElement, editor: HTMLElement): { destroy(): void; ownsScroll(): boolean } {
  const root = document.documentElement;
  const pixels = (value: string, rem: number): number => parseFloat(value) * (value.trim().endsWith('rem') ? rem : 1);
  // The block the editor is on: the selection's paragraph while it is in view, else the one across the middle of the text — or,
  // when the middle falls in the space between two paragraphs, the one just below it (the last one at the end of the text).
  const readingBlock = (): HTMLElement | null => {
    const view = editor.getBoundingClientRect(), middle = (view.top + view.bottom) / 2;
    const focus = document.getSelection?.()?.focusNode ?? null;
    const selected = (focus?.nodeType === 1 ? focus as Element : focus?.parentElement)?.closest<HTMLElement>('[data-block-id]');
    if (selected && editor.contains(selected)) { const r = selected.getBoundingClientRect(); if (r.bottom > view.top && r.top < view.bottom) return selected; }
    const blocks = [...editor.querySelectorAll<HTMLElement>('[data-block-id]')];
    return blocks.find((block) => block.getBoundingClientRect().bottom >= middle) ?? blocks.at(-1) ?? null;
  };
  // A new state changes the sidebar's form and the text's gutters, so the text reflows; the browser keeps no scroll anchor across a
  // width or padding change of the text's own ancestors. Put the reading block back where it was once the shell has applied the form
  // (its observer runs in the microtask queued before this one). The first state of a screen has nothing to keep.
  // Where that correction rests is this measure's own scroll for the next two frames: at an edge of the loaded text it is not
  // the reader asking for the next page.
  let placed: { top: number } | undefined;
  const apply = (next: string): void => {
    const previous = root.dataset['rightColumn'];
    if (previous === next) return;
    const block = previous === undefined ? null : readingBlock(), before = block?.getBoundingClientRect().top;
    root.dataset['rightColumn'] = next;
    if (block && before !== undefined) queueMicrotask(() => {
      if (!block.isConnected) return;
      editor.scrollTop += block.getBoundingClientRect().top - before;
      const mark = { top: editor.scrollTop };
      placed = mark;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (placed === mark) placed = undefined; }));
    });
  };
  const update = (): void => {
    const style = getComputedStyle(root), rem = parseFloat(style.fontSize);
    const drawer = document.body.dataset['taskDrawer'] === 'open';
    const panel = workspace.querySelector<HTMLElement>(':scope > .manuscript-comments-pane:not([hidden]), :scope > .manuscript-navigator:not([hidden])');
    if (!drawer && !panel) { apply('none'); return; }
    const padding = getComputedStyle(editor);
    const minimum = parseFloat(style.getPropertyValue('--manuscript-min-measure')) * parseFloat(getComputedStyle(editor.querySelector('.ProseMirror') ?? editor).fontSize)
      + parseFloat(padding.paddingLeft) + parseFloat(padding.paddingRight);
    const column = drawer ? pixels(style.getPropertyValue('--task-drawer-width'), rem) : panel!.classList.contains('manuscript-navigator') ? pixels(style.getPropertyValue('--supporting-surface-width') || '21rem', rem) : panel!.getBoundingClientRect().width;
    const edge = workspace.querySelector('.editor-edge')!.getBoundingClientRect().width;
    const full = pixels(style.getPropertyValue('--sidebar-full-width'), rem);
    const icons = pixels(style.getPropertyValue('--sidebar-icons-width'), rem);
    const page = getComputedStyle(document.body);
    const area = workspace.getBoundingClientRect().width + parseFloat(page.paddingLeft) + parseFloat(page.paddingRight);
    const available = area - edge - column - minimum;
    const next = available >= full ? 'wide' : available >= icons ? 'icons' : 'overlay';
    apply(next);
  };
  const resize = new ResizeObserver(update);
  resize.observe(workspace); resize.observe(editor);
  const mutation = new MutationObserver(update);
  // Only the columns' own `hidden` matters; a subtree watch would also fire on every scroll and card relayout.
  for (const column of workspace.querySelectorAll(':scope > :is(.manuscript-comments-pane, .manuscript-navigator)')) mutation.observe(column, { attributes: true, attributeFilter: ['hidden'] });
  mutation.observe(document.body, { attributes: true, attributeFilter: ['data-task-drawer', 'style'] });
  mutation.observe(root, { attributes: true, attributeFilter: ['style'] });
  window.addEventListener('resize', update);
  update();
  return { ownsScroll: () => placed !== undefined && editor.scrollTop === placed.top, destroy: () => { resize.disconnect(); mutation.disconnect(); window.removeEventListener('resize', update); delete root.dataset['rightColumn']; } };
}
