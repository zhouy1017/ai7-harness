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
export function mountColumnMeasure(workspace: HTMLElement, editor: HTMLElement): { destroy(): void } {
  const root = document.documentElement;
  const pixels = (value: string, rem: number): number => parseFloat(value) * (value.trim().endsWith('rem') ? rem : 1);
  const update = (): void => {
    const style = getComputedStyle(root), rem = parseFloat(style.fontSize);
    const drawer = document.body.dataset['taskDrawer'] === 'open';
    const panel = workspace.querySelector<HTMLElement>(':scope > aside:not([hidden])');
    if (!drawer && !panel) { root.dataset['rightColumn'] = 'none'; return; }
    const padding = getComputedStyle(editor);
    const minimum = parseFloat(style.getPropertyValue('--manuscript-min-measure')) * parseFloat(getComputedStyle(editor.querySelector('.ProseMirror') ?? editor).fontSize)
      + parseFloat(padding.paddingLeft) + parseFloat(padding.paddingRight);
    const column = drawer ? pixels(style.getPropertyValue('--task-drawer-width'), rem) : panel!.classList.contains('manuscript-navigator') ? pixels(style.getPropertyValue('--supporting-surface-width') || '21rem', rem) : panel!.getBoundingClientRect().width;
    const edge = workspace.querySelector('.editor-edge')!.getBoundingClientRect().width;
    const full = pixels(style.getPropertyValue('--sidebar-full-width'), rem);
    const icons = pixels(style.getPropertyValue('--sidebar-icons-width'), rem);
    const available = innerWidth - edge - column - minimum;
    const next = available >= full ? 'wide' : available >= icons ? 'icons' : 'overlay';
    if (root.dataset['rightColumn'] !== next) root.dataset['rightColumn'] = next;
  };
  const resize = new ResizeObserver(update);
  resize.observe(workspace); resize.observe(editor);
  const mutation = new MutationObserver(update);
  mutation.observe(workspace, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  mutation.observe(document.body, { attributes: true, attributeFilter: ['data-task-drawer', 'style'] });
  mutation.observe(root, { attributes: true, attributeFilter: ['style'] });
  window.addEventListener('resize', update);
  update();
  return { destroy: () => { resize.disconnect(); mutation.disconnect(); window.removeEventListener('resize', update); delete root.dataset['rightColumn']; } };
}
