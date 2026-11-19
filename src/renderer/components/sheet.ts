const shownSheets: HTMLDialogElement[] = [];

/** Non-modal: no backdrop, focus trap, inert page or scroll lock. */
export function createSheet(className: string): HTMLDialogElement {
  const sheet = document.createElement('dialog');
  sheet.className = `sheet ${className}`;
  sheet.dataset['sheet'] = '';
  sheet.setAttribute('aria-modal', 'false');
  let opener: HTMLElement | null = null;
  let contentObserver: MutationObserver | undefined;
  sheet.tabIndex = -1;
  const show = sheet.show.bind(sheet);
  const close = sheet.close.bind(sheet);
  const escape = (event: KeyboardEvent): void => {
    if (!sheet.open || event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    const cancel = new Event('cancel', { cancelable: true });
    if (sheet.dispatchEvent(cancel)) sheet.close();
  };
  const outsideEscape = (event: KeyboardEvent): void => {
    if (!sheet.isConnected) {
      document.removeEventListener('keydown', outsideEscape);
      contentObserver?.disconnect();
      return;
    }
    if (!sheet.open) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('dialog[data-sheet][open]')) return;
    if (shownSheets.filter(item => item.open && item.isConnected).at(-1) === sheet) escape(event);
  };
  sheet.addEventListener('keydown', escape);
  sheet.show = () => {
    if (sheet.open) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    show();
    for (let index = shownSheets.length - 1; index >= 0; index--) if (!shownSheets[index]!.isConnected) shownSheets.splice(index, 1);
    shownSheets.push(sheet);
    document.addEventListener('keydown', outsideEscape);
    // Some callers load the controls asynchronously after show().
    const focusFirst = (): void => {
      if (!sheet.open) return;
      const active = document.activeElement;
      if (active !== sheet && sheet.contains(active)) { contentObserver?.disconnect(); return; }
      if (active !== document.body && active !== opener && active !== sheet) { contentObserver?.disconnect(); return; }
      const first = Array.from(sheet.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [tabindex]'))
        .find(node => !node.matches(':disabled, [tabindex="-1"]') && !node.closest('[hidden], [inert]') && (typeof node.getClientRects !== 'function' || node.getClientRects().length > 0));
      if (first) { first.focus({ preventScroll: true }); contentObserver?.disconnect(); }
      else sheet.focus({ preventScroll: true });
    };
    if (typeof MutationObserver === 'function') {
      contentObserver = new MutationObserver(focusFirst);
      contentObserver.observe(sheet, { childList: true, subtree: true });
    }
    queueMicrotask(focusFirst);
  };
  sheet.close = (value?: string) => {
    const returnFocus = document.activeElement === document.body || sheet.contains(document.activeElement);
    contentObserver?.disconnect();
    close(value);
    document.removeEventListener('keydown', outsideEscape);
    const index = shownSheets.indexOf(sheet);
    if (index >= 0) shownSheets.splice(index, 1);
    if (returnFocus && opener?.isConnected) {
      let destination = opener;
      if (destination.getClientRects().length === 0) {
        for (let menu = opener.closest('details'); menu; menu = menu.parentElement?.closest('details') ?? null) {
          const summary = menu.querySelector('summary');
          if (summary instanceof HTMLElement && summary.getClientRects().length > 0) { destination = summary; break; }
        }
      }
      if (destination.getClientRects().length > 0) destination.focus({ preventScroll: true });
    }
    opener = null;
  };
  return sheet;
}

/** Keep form ownership intact while giving every initiator the same three slots. */
export function sheetContent(sheet: HTMLDialogElement, bar: HTMLElement, body: ReadonlyArray<HTMLElement>, foot: HTMLElement, form?: HTMLFormElement): void {
  const header = document.createElement('header');
  header.className = 'sheet-bar';
  header.append(bar);
  const content = document.createElement('div');
  content.className = 'sheet-body';
  content.append(...body);
  foot.classList.add('sheet-foot');
  if (form) {
    form.replaceChildren(header, content, foot);
    sheet.replaceChildren(form);
  } else sheet.replaceChildren(header, content, foot);
}
