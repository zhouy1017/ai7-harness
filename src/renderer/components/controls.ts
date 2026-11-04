import { icon } from './icon-sprite.js';

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
