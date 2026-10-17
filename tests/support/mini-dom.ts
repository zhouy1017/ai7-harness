/**
 * A minimal DOM for renderer unit tests that run in Node (Issue #423, slice 7a): elements with attributes, `dataset`, children,
 * form-control properties, bubbling events, focus and a small selector engine (tag, `.class`, `[attr]`, `[attr="value"]`,
 * descendant combinators and comma lists). It is enough to mount one renderer surface and drive it by its data attributes; it
 * lays nothing out and runs no styles. No dependency is added: the suite stays in vitest's `node` environment.
 */

type Listener = (event: MiniEvent) => void;

export interface MiniEvent {
  readonly type: string;
  readonly bubbles?: boolean;
  readonly detail?: unknown;
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  target?: MiniElement;
  defaultPrevented?: boolean;
  preventDefault?(): void;
  stopPropagation?(): void;
}

const camelToData = (key: string): string => `data-${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`;
const dataToCamel = (name: string): string => name.slice(5).replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());

export class MiniElement {
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  readonly children: MiniElement[] = [];
  parentElement: MiniElement | null = null;
  #text = '';
  #listeners = new Map<string, Listener[]>();
  hidden = false;
  disabled = false;
  checked = false;
  readOnly = false;
  required = false;
  value = '';
  type = '';
  name = '';
  placeholder = '';
  title = '';
  rows = 0;
  maxLength = -1;
  tabIndex = 0;
  readonly dataset: Record<string, string>;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
    const element = this;
    this.dataset = new Proxy({} as Record<string, string>, {
      get: (_target, key) => typeof key === 'string' ? element.attributes.get(camelToData(key)) : undefined,
      set: (_target, key, value) => {
        if (typeof key === 'string') element.attributes.set(camelToData(key), String(value));
        return true;
      },
      deleteProperty: (_target, key) => {
        if (typeof key === 'string') element.attributes.delete(camelToData(key));
        return true;
      },
      has: (_target, key) => typeof key === 'string' && element.attributes.has(camelToData(key)),
      ownKeys: () => Array.from(element.attributes.keys()).filter((name) => name.startsWith('data-')).map(dataToCamel),
      getOwnPropertyDescriptor: (_target, key) => typeof key === 'string' && element.attributes.has(camelToData(key))
        ? { enumerable: true, configurable: true, value: element.attributes.get(camelToData(key)) } : undefined,
    });
  }

  get className(): string { return this.attributes.get('class') ?? ''; }
  set className(value: string) { this.attributes.set('class', value); }
  get classList(): { contains(name: string): boolean; add(...names: string[]): void } {
    return {
      contains: (name) => this.className.split(/\s+/u).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/u).filter(Boolean), ...names])].join(' '); },
    };
  }
  get id(): string { return this.attributes.get('id') ?? ''; }
  set id(value: string) { this.attributes.set('id', value); }
  get htmlFor(): string { return this.attributes.get('for') ?? ''; }
  set htmlFor(value: string) { this.attributes.set('for', value); }

  get textContent(): string {
    return this.children.length === 0 ? this.#text : this.#text + this.children.map((child) => child.textContent).join('');
  }
  set textContent(value: string | null) {
    for (const child of this.children) child.parentElement = null;
    this.children.length = 0;
    this.#text = value ?? '';
  }

  get isConnected(): boolean {
    let node: MiniElement | null = this;
    while (node !== null) {
      if (node === miniDocument.body) return true;
      node = node.parentElement;
    }
    return false;
  }

  setAttribute(name: string, value: string): void { this.attributes.set(name, String(value)); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  hasAttribute(name: string): boolean { return this.attributes.has(name); }

  append(...nodes: Array<MiniElement | string>): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const text = new MiniElement('#text');
        text.#text = node;
        this.#adopt(text);
      } else {
        this.#adopt(node);
      }
    }
  }
  replaceChildren(...nodes: Array<MiniElement | string>): void {
    for (const child of this.children) child.parentElement = null;
    this.children.length = 0;
    this.#text = '';
    this.append(...nodes);
  }
  remove(): void {
    const parent = this.parentElement;
    if (parent === null) return;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parentElement = null;
  }
  #adopt(node: MiniElement): void {
    node.remove();
    node.parentElement = this;
    this.children.push(node);
  }
  contains(node: unknown): boolean {
    let current = node instanceof MiniElement ? node : null;
    while (current !== null) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }
  closest(selector: string): MiniElement | null {
    let current: MiniElement | null = this;
    while (current !== null) {
      if (matches(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelectorAll(selector: string): MiniElement[] {
    const found: MiniElement[] = [];
    const walk = (node: MiniElement): void => {
      for (const child of node.children) {
        if (child.tagName !== '#TEXT' && matches(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector: string): MiniElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  addEventListener(type: string, listener: Listener): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }
  removeEventListener(type: string, listener: Listener): void {
    this.#listeners.set(type, (this.#listeners.get(type) ?? []).filter((entry) => entry !== listener));
  }
  dispatchEvent(event: MiniEvent): boolean {
    let stopped = false;
    const dispatched: MiniEvent = Object.assign(event, {
      target: event.target ?? this,
      defaultPrevented: event.defaultPrevented ?? false,
      preventDefault() { dispatched.defaultPrevented = true; },
      stopPropagation() { stopped = true; },
    });
    let node: MiniElement | null = this;
    while (node !== null) {
      for (const listener of node.#listeners.get(event.type) ?? []) listener(dispatched);
      if (!event.bubbles || stopped) break;
      node = node.parentElement;
    }
    return !dispatched.defaultPrevented;
  }
  click(): void {
    if (this.disabled) return;
    this.dispatchEvent({ type: 'click', bubbles: true });
  }
  focus(): void { miniDocument.activeElement = this; }
  scrollIntoView(): void { /* nothing lays out */ }
}

export class MiniButton extends MiniElement {}
export class MiniInput extends MiniElement {}
export class MiniTextArea extends MiniElement {}

/** Whether `element` matches a selector list of compound selectors joined by descendant combinators. */
function matches(element: MiniElement, selector: string): boolean {
  return splitList(selector).some((complex) => {
    const parts = complex.trim().split(/\s+(?![^[]*\])/u).filter(Boolean);
    if (!compound(element, parts.at(-1)!)) return false;
    let ancestor = element.parentElement;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      while (ancestor !== null && !compound(ancestor, parts[index]!)) ancestor = ancestor.parentElement;
      if (ancestor === null) return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  });
}

function splitList(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of selector) {
    if (character === '[') depth += 1;
    if (character === ']') depth -= 1;
    if (character === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  out.push(current);
  return out;
}

function compound(element: MiniElement, part: string): boolean {
  const pattern = /([a-zA-Z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:="((?:[^"\\]|\\.)*)")?\]|(:[\w-]+(?:\([^)]*\))?)/gu;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = pattern.exec(part)) !== null) {
    consumed += match[0].length;
    const [, tag, className, attribute, value, pseudo] = match;
    if (tag !== undefined && element.tagName !== tag.toUpperCase()) return false;
    if (className !== undefined && !element.className.split(/\s+/u).includes(className)) return false;
    if (attribute !== undefined) {
      const actual = element.getAttribute(attribute);
      if (actual === null) return false;
      if (value !== undefined && actual !== value.replace(/\\(.)/gu, '$1')) return false;
    }
    if (pseudo === ':disabled' && !element.disabled) return false;
    if (pseudo === ':not(:disabled)' && element.disabled) return false;
  }
  if (consumed !== part.length) throw new Error(`mini-dom cannot read the selector part "${part}"`);
  return true;
}

export const miniDocument = {
  body: new MiniElement('body'),
  activeElement: null as MiniElement | null,
  createElement(tag: string): MiniElement {
    if (tag === 'button') return new MiniButton(tag);
    if (tag === 'input') return new MiniInput(tag);
    if (tag === 'textarea') return new MiniTextArea(tag);
    return new MiniElement(tag);
  },
};

/** Install the minimal DOM as the globals a renderer module reads; answers how to take them away again. */
export function installMiniDom(): () => void {
  const globals = globalThis as Record<string, unknown>;
  const saved = ['document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'CSS'].map((key) => [key, globals[key]] as const);
  miniDocument.body.replaceChildren();
  miniDocument.activeElement = null;
  globals['document'] = miniDocument;
  globals['HTMLElement'] = MiniElement;
  globals['HTMLButtonElement'] = MiniButton;
  globals['HTMLInputElement'] = MiniInput;
  globals['HTMLTextAreaElement'] = MiniTextArea;
  globals['CSS'] = { escape: (value: string) => value.replace(/["\\]/gu, '\\$&') };
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete globals[key];
      else globals[key] = value;
    }
  };
}
