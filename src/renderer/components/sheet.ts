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
    const cancel = new Event('cancel', { cancelable: true });
    if (sheet.dispatchEvent(cancel)) sheet.close();
  };
  sheet.show = () => {
    if (sheet.open) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    show();
    document.addEventListener('keydown', escape);
    // Some callers load the controls asynchronously after show().
    const focusFirst = (): void => {
      if (!sheet.open) return;
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
    contentObserver?.disconnect();
    close(value);
    document.removeEventListener('keydown', escape);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
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
