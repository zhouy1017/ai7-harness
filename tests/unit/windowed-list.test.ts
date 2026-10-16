import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWindowedList } from '../../src/renderer/windowed-list.js';

// The event/DOM boundary, without a browser, Electron, or another dependency.
class Element extends EventTarget {
  children: Element[] = [];
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  scrollTop = 0;
  tabIndex = -1;
  id = '';
  parent: Element | null = null;
  append(child: Element): void { child.parent = this; this.children.push(child); }
  replaceChildren(...children: Element[]): void { this.children = []; for (const child of children) this.append(child); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  focus(): void {}
  remove(): void { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
}
afterEach(() => vi.unstubAllGlobals());

describe('bounded Change Navigator at 500 items', () => {
  it('renders a bounded DOM, scrolls, and navigates exact identities by keyboard', () => {
    vi.stubGlobal('document', { createElement: () => new Element() });
    const root = new Element();
    const activated: number[] = [];
    const list = mountWindowedList({
      root: root as unknown as HTMLElement, rowHeight: 40, viewportHeight: 320, overscan: 3, label: '修改导航',
      key: (item: number) => String(item), render: () => new Element() as unknown as HTMLElement,
      onActivate: (item) => activated.push(item),
    });
    const items = Array.from({ length: 500 }, (_, index) => index);
    list.setItems(items);
    const rows = () => root.children[0]!.children;
    expect(rows().length).toBeLessThanOrEqual(15);
    expect(activated).toEqual([]);
    root.scrollTop = 4000;
    root.dispatchEvent(new Event('scroll'));
    expect(rows().length).toBeLessThanOrEqual(15);
    expect(rows()[0]!.dataset['windowedIndex']).toBe('97');
    const key = (name: string) => {
      const event = new Event('keydown', { cancelable: true });
      Object.defineProperty(event, 'key', { value: name });
      root.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };
    key('End');
    expect(activated.at(-1)).toBe(499);
    expect(root.attributes.get('aria-activedescendant')).toBe('windowed-499');
    expect(rows().some((row) => row.dataset['windowedIndex'] === '499')).toBe(true);
    key('ArrowUp');
    expect(activated.at(-1)).toBe(498);
    key('Home');
    expect(activated.at(-1)).toBe(0);
    key('PageDown');
    expect(activated.at(-1)).toBe(8);
    list.setItems(items.slice(0, 2), 499);
    expect(root.attributes.get('aria-activedescendant')).toBe('windowed-1');
    list.destroy();
    expect(root.children).toHaveLength(0);
  });
});
