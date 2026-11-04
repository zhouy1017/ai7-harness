/** Non-modal: no backdrop, focus trap, inert page or scroll lock. */
export function createSheet(className: string): HTMLDialogElement {
  const sheet = document.createElement('dialog');
  sheet.className = `sheet ${className}`;
  sheet.dataset['sheet'] = '';
  sheet.setAttribute('aria-modal', 'false');
  sheet.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    const cancel = new Event('cancel', { cancelable: true });
    if (sheet.dispatchEvent(cancel)) sheet.close();
  });
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
