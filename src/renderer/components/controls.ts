import { icon } from './icon-sprite.js';

export interface EnhancedSelect {
  readonly trigger: HTMLButtonElement;
  sync(): void;
  destroy(): void;
}

const enhancedSelects = new WeakMap<HTMLSelectElement, EnhancedSelect>();
const nativeFallbacks = new WeakSet<HTMLSelectElement>();
let selectSequence = 0;

/** Observe only this element's native setters, never a shared DOM prototype. */
function observeProperty(node: object, key: string, changed: () => void): (() => void) | null {
  const own = Object.getOwnPropertyDescriptor(node, key);
  if (own && !own.configurable) return null;
  let prototype = Object.getPrototypeOf(node) as object | null;
  let descriptor = own;
  while (!descriptor && prototype) {
    descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  if (!descriptor?.get || !descriptor.set) return null;
  const { get, set } = descriptor;
  const wrapped = function(this: object, value: unknown): void { set.call(this, value); changed(); };
  Object.defineProperty(node, key, { configurable: true, enumerable: descriptor.enumerable ?? true, get, set: wrapped });
  return () => {
    if (Object.getOwnPropertyDescriptor(node, key)?.set !== wrapped) return;
    if (own) Object.defineProperty(node, key, own);
    else Reflect.deleteProperty(node, key);
  };
}

/** The original single select remains the form/API owner; enhancement is disposable presentation. */
export function enhanceSelect(select: HTMLSelectElement): EnhancedSelect | null {
  const existing = enhancedSelects.get(select);
  if (existing) return existing;
  const doc = select.ownerDocument;
  const view = doc?.defaultView;
  if (nativeFallbacks.has(select) || !view || typeof view.MutationObserver !== 'function' || typeof view.getComputedStyle !== 'function'
    || typeof view.Event !== 'function' || typeof view.addEventListener !== 'function' || typeof doc.addEventListener !== 'function' || typeof select.getBoundingClientRect !== 'function'
    || !select.parentElement || !select.options || select.multiple || select.size > 1) return null;
  const wasFocused = doc.activeElement === select;

  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ui-select-trigger';
  trigger.id = `ui-select-${++selectSequence}`;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const text = doc.createElement('span');
  const arrow = icon('i-back');
  arrow.classList.add('ui-select-arrow');
  trigger.append(text, arrow);
  const popup = doc.createElement('div');
  popup.className = 'ui-select-popover';
  popup.hidden = true;
  const topLayer = typeof popup.showPopover === 'function';
  if (topLayer) popup.setAttribute('popover', 'manual');
  const filter = doc.createElement('input');
  filter.type = 'search';
  filter.className = 'ui-select-filter';
  filter.placeholder = '筛选选项…';
  filter.setAttribute('aria-label', '筛选选项');
  filter.setAttribute('autocomplete', 'off');
  const list = doc.createElement('div');
  list.className = 'ui-select-options';
  list.hidden = true;
  list.id = `${trigger.id}-options`;
  list.setAttribute('role', 'listbox');
  trigger.setAttribute('aria-controls', list.id);
  filter.setAttribute('aria-controls', list.id);
  const empty = doc.createElement('p');
  empty.className = 'field-note';
  empty.textContent = '没有匹配的选项';
  // Announce filtering without shadowing the owning form's existing status region.
  empty.setAttribute('aria-live', 'polite');
  empty.setAttribute('aria-atomic', 'true');
  popup.append(filter, list, empty);
  const validation = doc.createElement('span');
  validation.id = `${trigger.id}-error`;
  validation.className = 'ui-select-error';
  validation.setAttribute('role', 'alert');
  validation.hidden = true;
  const originalTabIndex = select.getAttribute('tabindex');
  const originalAriaHidden = select.getAttribute('aria-hidden');
  const hadClass = select.classList.contains('ui-select-native');
  const restorers: (() => void)[] = [];
  const optionRestorers = new Map<HTMLOptionElement, () => void>();
  let disposed = false, open = false, composing = false, active = -1;
  let typeahead = '', typedAt = 0, signature = '';
  let form: HTMLFormElement | null = null;
  const reset = (): void => { queueMicrotask(sync); };
  let visible: number[] = [];
  let rows: HTMLElement[] = [];
  const listeners: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, callback: EventListener, capture = false): void => {
    target.addEventListener(type, callback, capture);
    listeners.push(() => target.removeEventListener(type, callback, capture));
  };
  const disabled = (): boolean => select.matches(':disabled');
  const optionDisabled = (option: HTMLOptionElement): boolean => option.disabled || option.parentElement?.tagName === 'OPTGROUP' && (option.parentElement as HTMLOptGroupElement).disabled;
  const setActive = (index: number, scroll = true): void => {
    active = index;
    for (const row of rows) row.dataset['active'] = String(Number(row.dataset['index']) === active);
    const row = rows.find((item) => Number(item.dataset['index']) === active);
    for (const control of [trigger, filter]) {
      if (row && open) control.setAttribute('aria-activedescendant', row.id);
      else control.removeAttribute('aria-activedescendant');
    }
    if (scroll) row?.scrollIntoView?.({ block: 'nearest' });
  };
  const position = (): void => {
    if (!open) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = view.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? view.innerWidth, height = viewport?.height ?? view.innerHeight;
    const below = top + height - rect.bottom - 12, above = rect.top - top - 12;
    const upwards = below < 180 && above > below;
    const room = Math.max(48, Math.min(380, upwards ? above : below));
    const popupWidth = Math.max(0, Math.min(Math.max(rect.width, 200), width - 16));
    popup.style.width = `${popupWidth}px`;
    popup.style.maxHeight = `${room}px`;
    popup.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - popupWidth - 8))}px`;
    const popupHeight = Math.min(room, popup.scrollHeight);
    const desiredTop = upwards ? rect.top - popupHeight - 4 : rect.bottom + 4;
    popup.style.top = `${Math.max(top + 8, Math.min(desiredTop, top + height - popupHeight - 8))}px`;
  };
  const close = (focus = false): void => {
    if (!open) return;
    open = false;
    if (topLayer && popup.matches(':popover-open')) popup.hidePopover();
    popup.hidden = true;
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    setActive(-1, false);
    doc.removeEventListener('pointerdown', outside, true);
    doc.removeEventListener('focusin', outsideFocus, true);
    view.removeEventListener('resize', position);
    doc.removeEventListener('scroll', position, true);
    view.visualViewport?.removeEventListener('resize', position);
    view.visualViewport?.removeEventListener('scroll', position);
    if (focus && !disabled()) trigger.focus({ preventScroll: true });
    // Flush deferred poll owners after the popup stops engaging the native control.
    trigger.dispatchEvent(new view.Event('toggle', { bubbles: true }));
  };
  const outside = (event: Event): void => { if (!popup.contains(event.target as Node) && !trigger.contains(event.target as Node)) close(); };
  const outsideFocus = (event: Event): void => { if (!popup.contains(event.target as Node) && event.target !== trigger && event.target !== select) close(); };
  const choose = (index: number): void => {
    const option = select.options[index];
    if (!option || disabled() || optionDisabled(option)) return;
    select.selectedIndex = index;
    close(true);
    select.dispatchEvent(new view.Event('change', { bubbles: true }));
  };
  const renderOptions = (): void => {
    const options = Array.from(select.options);
    const query = filter.value.trim().toLocaleLowerCase();
    const nextSignature = JSON.stringify([query, ...options.map((option) => [option.text, option.value, option.selected, optionDisabled(option), option.hidden, option.parentElement?.hidden])]);
    if (nextSignature === signature) return;
    signature = nextSignature;
    const scrollTop = list.scrollTop;
    visible = []; rows = [];
    list.replaceChildren();
    options.forEach((option, index) => {
      if (option.hidden || option.parentElement?.hidden || !option.text.toLocaleLowerCase().includes(query)) return;
      const row = doc.createElement('div');
      row.className = 'ui-select-option';
      row.id = `${list.id}-${index}`;
      row.dataset['index'] = String(index);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.selected));
      row.setAttribute('aria-disabled', String(optionDisabled(option)));
      const label = doc.createElement('span'); label.textContent = option.text;
      const check = doc.createElement('span'); check.textContent = option.selected ? '✓' : ''; check.setAttribute('aria-hidden', 'true');
      row.append(label, check);
      row.addEventListener('pointerdown', (event) => event.preventDefault());
      row.addEventListener('click', (event) => { event.preventDefault(); choose(index); });
      row.addEventListener('pointermove', () => { if (!optionDisabled(option)) setActive(index, false); });
      if (!optionDisabled(option)) visible.push(index);
      rows.push(row); list.append(row);
    });
    empty.hidden = rows.length > 0;
    if (!visible.includes(active)) active = visible.includes(select.selectedIndex) ? select.selectedIndex : visible[0] ?? -1;
    setActive(active, false);
    list.scrollTop = scrollTop;
    position();
  };
  const sync = (): void => {
    if (disposed) return;
    if (select.multiple || select.size > 1) { destroy(); return; }
    if (form !== select.form) {
      form?.removeEventListener('reset', reset);
      form = select.form;
      form?.addEventListener('reset', reset);
    }
    const options = new Set(Array.from(select.options));
    for (const [option, restore] of optionRestorers) if (!options.has(option)) { restore(); optionRestorers.delete(option); }
    for (const option of options) if (!optionRestorers.has(option)) {
      const restore = observeProperty(option, 'selected', sync);
      if (!restore) { nativeFallbacks.add(select); destroy(); return; }
      optionRestorers.set(option, restore);
    }
    const selected = select.options[select.selectedIndex];
    text.textContent = selected?.text ?? '请选择';
    trigger.disabled = disabled();
    trigger.hidden = select.hidden || originalAriaHidden === 'true' || select.closest('[hidden], [inert]') !== null || view.getComputedStyle(select).display === 'none';
    trigger.tabIndex = originalTabIndex === null ? 0 : Number(originalTabIndex);
    const labelText = (node: Node): string => node === select || node === trigger || node === popup || node === validation ? ''
      : node.nodeType === 3 ? node.textContent ?? '' : Array.from(node.childNodes).map(labelText).join('');
    const label = select.getAttribute('aria-label') || Array.from(select.labels ?? []).map((item) => labelText(item).trim()).join(' ') || select.name;
    const labelledBy = select.getAttribute('aria-labelledby');
    if (labelledBy) trigger.setAttribute('aria-labelledby', labelledBy);
    else trigger.removeAttribute('aria-labelledby');
    trigger.setAttribute('aria-label', label || text.textContent);
    list.setAttribute('aria-label', label || '选项');
    for (const attribute of ['aria-describedby', 'aria-required', 'aria-invalid']) {
      const value = select.getAttribute(attribute);
      if (value !== null) trigger.setAttribute(attribute, value); else trigger.removeAttribute(attribute);
    }
    if (select.required) trigger.setAttribute('aria-required', 'true');
    if (select.validity.valid) { validation.hidden = true; trigger.removeAttribute('aria-errormessage'); }
    else if (!validation.hidden) trigger.setAttribute('aria-invalid', 'true');
    if (trigger.disabled || trigger.hidden) close();
    filter.hidden = select.options.length <= 12;
    if (open) renderOptions();
  };
  const show = (last = false): void => {
    sync();
    if (disposed || disabled() || open) return;
    open = true; filter.value = ''; signature = '';
    popup.hidden = false;
    list.hidden = false;
    if (topLayer) popup.showPopover();
    trigger.setAttribute('aria-expanded', 'true');
    renderOptions();
    setActive(last ? visible.at(-1) ?? -1 : visible.includes(select.selectedIndex) ? select.selectedIndex : visible[0] ?? -1);
    position();
    if (!filter.hidden) filter.focus({ preventScroll: true });
    doc.addEventListener('pointerdown', outside, true);
    doc.addEventListener('focusin', outsideFocus, true);
    view.addEventListener('resize', position);
    doc.addEventListener('scroll', position, true);
    view.visualViewport?.addEventListener('resize', position);
    view.visualViewport?.addEventListener('scroll', position);
  };
  const keydown = (event: KeyboardEvent): void => {
    if (event.isComposing || composing || event.keyCode === 229) return;
    const inFilter = event.target === filter;
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Enter' && open) { event.preventDefault(); event.stopPropagation(); choose(active); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key) || !inFilter && ['Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (!open) { show(event.key === 'End'); return; }
      const current = visible.indexOf(active);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1
        : Math.max(0, Math.min(visible.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
      setActive(visible[index] ?? -1); return;
    }
    if (!inFilter && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      event.preventDefault();
      const now = Date.now(); typeahead = now - typedAt > 700 ? event.key : typeahead + event.key; typedAt = now;
      if (!open) show();
      if (!filter.hidden) { filter.value = typeahead; renderOptions(); }
      else {
        const match = visible.find((index) => select.options[index]!.text.toLocaleLowerCase().startsWith(typeahead.toLocaleLowerCase()));
        if (match !== undefined) setActive(match);
      }
    }
  };
  function destroy(): void {
    if (disposed) return;
    close(); disposed = true; observer.disconnect();
    for (const off of listeners) off();
    for (const restore of restorers) restore();
    for (const restore of optionRestorers.values()) restore();
    form?.removeEventListener('reset', reset);
    optionRestorers.clear();
    trigger.remove(); popup.remove(); validation.remove();
    if (!hadClass) select.classList.remove('ui-select-native');
    if (originalTabIndex === null) select.removeAttribute('tabindex'); else select.setAttribute('tabindex', originalTabIndex);
    if (originalAriaHidden === null) select.removeAttribute('aria-hidden'); else select.setAttribute('aria-hidden', originalAriaHidden);
    enhancedSelects.delete(select);
  }
  // A minimal DOM without native accessors must keep the original control untouched.
  for (const key of ['value', 'selectedIndex', 'disabled']) {
    const restore = observeProperty(select, key, sync);
    if (!restore) { for (const off of restorers) off(); return null; }
    restorers.push(restore);
  }
  const restoreOptionsIndex = observeProperty(select.options, 'selectedIndex', sync);
  if (!restoreOptionsIndex) { for (const restore of restorers) restore(); return null; }
  restorers.push(restoreOptionsIndex);
  select.classList.add('ui-select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(trigger, popup, validation);
  const observer = new view.MutationObserver(sync);
  observer.observe(select, { subtree: true, childList: true, characterData: true, attributes: true });
  listen(trigger, 'click', () => { if (open) close(true); else show(); });
  listen(trigger, 'keydown', (event) => keydown(event as KeyboardEvent));
  listen(popup, 'keydown', (event) => keydown(event as KeyboardEvent));
  listen(filter, 'input', () => { if (!composing) renderOptions(); });
  listen(filter, 'compositionstart', () => { composing = true; });
  listen(filter, 'compositionend', () => { composing = false; renderOptions(); });
  listen(select, 'change', sync); listen(select, 'input', sync);
  listen(select, 'focus', () => { if (!disabled()) trigger.focus(); });
  listen(select, 'invalid', (event) => {
    event.preventDefault();
    validation.textContent = select.validationMessage; validation.hidden = false;
    trigger.setAttribute('aria-invalid', 'true'); trigger.setAttribute('aria-errormessage', validation.id); trigger.focus();
  });
  const control = { trigger, sync, destroy };
  enhancedSelects.set(select, control);
  sync();
  if (wasFocused && !disposed && !trigger.disabled && !trigger.hidden) trigger.focus({ preventScroll: true });
  return control;
}

/** Poll focus addresses belong to the stable native control, before its disposable trigger exists. */
export function nativeSelectForTrigger(node: HTMLElement): HTMLSelectElement | null {
  if (!node.classList.contains('ui-select-trigger') || !node.parentElement) return null;
  const siblings = Array.from(node.parentElement.children);
  const native = siblings[siblings.indexOf(node) - 1];
  return native?.tagName === 'SELECT' && native.classList.contains('ui-select-native') ? native as HTMLSelectElement : null;
}

/** One application-owned observer covers inserted native selects and releases removed controls. */
export function mountSelectControls(root: HTMLElement): () => void {
  const view = root.ownerDocument?.defaultView;
  if (!view || typeof view.MutationObserver !== 'function') return () => {};
  const controls = new Map<HTMLSelectElement, EnhancedSelect>();
  const scan = (node: HTMLElement): void => {
    const selects = [...(node.tagName === 'SELECT' ? [node as HTMLSelectElement] : []), ...node.querySelectorAll<HTMLSelectElement>('select')];
    for (const select of selects) if (root.contains(select)) {
      const previous = controls.get(select);
      if (previous && (previous.trigger.parentElement !== select.parentElement || select.nextElementSibling !== previous.trigger)) previous.destroy();
      const control = enhanceSelect(select);
      if (control) { control.sync(); if (enhancedSelects.get(select) === control) controls.set(select, control); else controls.delete(select); }
      else controls.delete(select);
    }
  };
  scan(root);
  const observer = new view.MutationObserver((records) => {
    for (const [select, control] of controls) if (!root.contains(select)) { control.destroy(); controls.delete(select); }
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof view.HTMLElement) scan(node);
      if (record.type === 'attributes' && record.target instanceof view.HTMLElement) {
        if (record.target.tagName === 'SELECT') scan(record.target);
        else for (const select of record.target.querySelectorAll<HTMLSelectElement>('select')) controls.get(select)?.sync();
      }
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'multiple', 'size', 'hidden', 'inert', 'class', 'style'] });
  return () => { observer.disconnect(); for (const control of controls.values()) control.destroy(); controls.clear(); };
}

/** Shared keyboard/focus behavior for the existing disclosure menus, with one application lifecycle. */
export function mountMenuControls(root: HTMLElement): () => void {
  const view = root.ownerDocument?.defaultView;
  if (!view || typeof view.MutationObserver !== 'function') return () => {};
  const selector = 'details.edit-method-menu, details.derivative-menu, details.task-overview-more, details.view-menu, details.editor-save-menu, details.export-menu, details.review-more, details.evaluation-more';
  const menus = (): HTMLDetailsElement[] => Array.from(root.querySelectorAll<HTMLDetailsElement>(selector));
  const panelOf = (menu: HTMLElement): HTMLElement | null => menu.querySelector('.ui-menu-panel, .view-menu-list, .editor-save-menu-body, .export-menu-body');
  const position = (): void => {
    for (const menu of menus().filter((item) => item.open)) {
      const panel = panelOf(menu), summary = menu.querySelector('summary');
      if (!panel || !summary) continue;
      const rect = summary.getBoundingClientRect();
      const width = Math.min(panel.offsetWidth, view.innerWidth - 16);
      panel.style.position = 'fixed'; panel.style.margin = '0'; panel.style.right = 'auto';
      panel.style.left = `${Math.max(8, Math.min(rect.right - width, view.innerWidth - width - 8))}px`;
      const below = view.innerHeight - rect.bottom - 12;
      const upwards = below < Math.min(panel.scrollHeight, 200) && rect.top > below;
      panel.style.maxHeight = `${Math.max(48, (upwards ? rect.top : below) - 8)}px`;
      const panelHeight = Math.min(panel.scrollHeight, Number.parseFloat(panel.style.maxHeight));
      panel.style.top = `${Math.max(8, Math.min(upwards ? rect.top - panelHeight - 4 : rect.bottom + 4, view.innerHeight - panelHeight - 8))}px`;
    }
  };
  const close = (menu: HTMLDetailsElement, focus = false): void => { menu.open = false; if (focus) menu.querySelector('summary')?.focus(); };
  const keydown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.keyCode === 229) return;
    const target = event.target as HTMLElement;
    const menu = target.closest<HTMLDetailsElement>(selector);
    if (!menu) return;
    if (event.key === 'Escape' && menu.open) { event.preventDefault(); event.stopPropagation(); close(menu, true); return; }
    if (target.matches('input, textarea, select, [role="combobox"]')) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    menu.open = true; position();
    const panel = panelOf(menu);
    const items = panel ? menuDestinations(panel) : [];
    const at = items.indexOf(target);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : at < 0 ? event.key === 'ArrowUp' ? items.length - 1 : 0 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  };
  const outside = (event: Event): void => { for (const menu of menus()) if (menu.open && !menu.contains(event.target as Node)) close(menu); };
  const toggle = (): void => { position(); };
  root.addEventListener('keydown', keydown, true);
  root.addEventListener('toggle', toggle, true);
  root.ownerDocument.addEventListener('pointerdown', outside, true);
  view.addEventListener('resize', position);
  root.ownerDocument.addEventListener('scroll', position, true);
  return () => {
    root.removeEventListener('keydown', keydown, true); root.removeEventListener('toggle', toggle, true);
    root.ownerDocument.removeEventListener('pointerdown', outside, true); view.removeEventListener('resize', position); root.ownerDocument.removeEventListener('scroll', position, true);
  };
}

export function menuDestinations(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('button, summary')).filter((item) => {
    if (item.matches(':disabled')) return false;
    for (let node: HTMLElement | null = item; node && panel.contains(node); node = node.parentElement) {
      if (node.hidden || node.hasAttribute('inert')) return false;
      if (node.tagName === 'DETAILS' && !(node as HTMLDetailsElement).open) {
        const summary = Array.from(node.children).find((child) => child.tagName === 'SUMMARY');
        if (!summary?.contains(item)) return false;
      }
    }
    return typeof item.getClientRects !== 'function' || item.getClientRects().length > 0;
  });
}

/** Build the panel before insertion so poll focus addresses stay stable across synchronous paints. */
export function menuPanel(...children: HTMLElement[]): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'ui-menu-panel';
  panel.append(...children);
  return panel;
}

/** Shared controls for the editor surfaces (Owner #1314, A4 #1318). */
export function createButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  return button;
}

export type StateTone = 'good' | 'attention' | 'blocked' | 'progress' | 'neutral';
export function stateTerm(label: string, tone: StateTone = 'neutral'): HTMLSpanElement {
  const term = document.createElement('span');
  term.className = 'state-term';
  term.dataset['pillTone'] = tone;
  term.textContent = label;
  return term;
}

/** Button choices keep filters visible and keyboard reachable, with no native select. */
export function filterChoices(options: {
  label: string;
  choices: ReadonlyArray<readonly [string, string]>;
  value: string;
  disabled?: boolean;
  change(value: string): void;
}): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'filter-choices';
  group.tabIndex = -1;
  group.dataset['value'] = options.value;
  group.dataset['disabled'] = String(options.disabled ?? false);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', options.label);
  for (const [value, label] of options.choices) {
    const button = createButton();
    button.classList.add('small');
    button.dataset['filterValue'] = value;
    button.textContent = label;
    button.disabled = options.disabled ?? false;
    button.setAttribute('aria-pressed', String(value === options.value));
    button.addEventListener('click', () => {
      group.dataset['value'] = value;
      for (const item of group.querySelectorAll<HTMLButtonElement>('button')) item.setAttribute('aria-pressed', String(item === button));
      options.change(value);
    });
    group.append(button);
  }
  return group;
}

/** The same bounded position control as the manuscript rail, over list windows. */
export function listPosition(options: {
  offset: number; total: number; pageSize: number; label: string;
  change(offset: number): void;
}): HTMLElement {
  const label = document.createElement('label');
  label.className = 'list-position';
  const text = document.createElement('span');
  text.textContent = options.total === 0 ? '0 / 0' : `${options.offset + 1}–${Math.min(options.total, options.offset + options.pageSize)} / ${options.total}`;
  const rail = document.createElement('input');
  rail.type = 'range';
  rail.className = 'list-position-rail';
  rail.dataset['listPosition'] = '';
  rail.setAttribute('aria-label', options.label);
  rail.min = '0';
  rail.max = String(Math.max(0, Math.ceil(options.total / options.pageSize) - 1));
  rail.step = '1';
  rail.value = String(Math.floor(options.offset / options.pageSize));
  rail.disabled = options.total <= options.pageSize;
  rail.setAttribute('aria-valuetext', text.textContent);
  rail.addEventListener('change', () => options.change(Number(rail.value) * options.pageSize));
  label.append(text, rail);
  return label;
}

/** Cursor-backed lists keep a bounded window and browse it with the rail's arrow controls. */
export function windowStep(button: HTMLButtonElement, direction: 'before' | 'after', label: string): HTMLButtonElement {
  button.classList.add('btn', 'small', 'window-step');
  button.dataset['windowStep'] = direction;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.replaceChildren(icon('i-back'));
  return button;
}

/** Shared tab semantics; the caller owns the active panel and selection. */
export function tabButton(options: { label: string; id: string; panel: string; selected: boolean; activate(): void }): HTMLButtonElement {
  const button = createButton();
  button.classList.add('tab');
  button.id = options.id;
  button.textContent = options.label;
  button.dataset['tab'] = options.id;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-controls', options.panel);
  button.setAttribute('aria-selected', String(options.selected));
  button.tabIndex = options.selected ? 0 : -1;
  button.addEventListener('click', options.activate);
  button.addEventListener('keydown', (event) => {
    const tabs = Array.from(button.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const index = tabs.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  });
  return button;
}
