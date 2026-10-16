/** Fixed-height, bounded Change Navigator. Only visible rows and overscan enter the DOM. */
export interface WindowedList<T> {
  setItems(items: ReadonlyArray<T>, activeIndex?: number): void;
  activate(index: number, focus?: boolean): void;
  destroy(): void;
}

export function windowedRange(count: number, scrollTop: number, height: number, rowHeight: number, overscan: number): { start: number; end: number } {
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan);
  return { start: Math.min(count, start), end: Math.min(count, start + Math.ceil(height / rowHeight) + overscan * 2 + 1) };
}

export function mountWindowedList<T>(options: {
  root: HTMLElement;
  rowHeight: number;
  viewportHeight: number;
  overscan?: number;
  label: string;
  key(item: T): string;
  render(item: T, index: number): HTMLElement;
  onActivate(item: T, index: number): void;
}): WindowedList<T> {
  const { root, rowHeight, viewportHeight } = options;
  if (!(rowHeight > 0 && viewportHeight > 0)) throw new Error('Invalid windowed list dimensions');
  const overscan = Math.max(0, Math.min(10, options.overscan ?? 3));
  let items: ReadonlyArray<T> = [];
  let active = -1;
  const canvas = document.createElement('div');
  canvas.style.position = 'relative';
  root.style.overflowY = 'auto';
  root.style.height = `${viewportHeight}px`;
  root.tabIndex = 0;
  root.setAttribute('role', 'listbox');
  root.setAttribute('aria-label', options.label);
  root.append(canvas);

  function paint(): void {
    canvas.style.height = `${items.length * rowHeight}px`;
    const { start, end } = windowedRange(items.length, root.scrollTop, viewportHeight, rowHeight, overscan);
    const rows: HTMLElement[] = [];
    for (let index = start; index < end; index += 1) {
      const item = items[index]!;
      const row = options.render(item, index);
      row.id = `windowed-${options.key(item)}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === active));
      row.setAttribute('aria-posinset', String(index + 1));
      row.setAttribute('aria-setsize', String(items.length));
      row.dataset['windowedIndex'] = String(index);
      row.style.position = 'absolute';
      row.style.top = `${index * rowHeight}px`;
      row.style.height = `${rowHeight}px`;
      row.style.left = '0';
      row.style.right = '0';
      row.addEventListener('click', () => activate(index, false));
      rows.push(row);
    }
    canvas.replaceChildren(...rows);
    if (active >= 0) root.setAttribute('aria-activedescendant', `windowed-${options.key(items[active]!)}`);
    else root.removeAttribute('aria-activedescendant');
  }

  function activate(index: number, focus = true): void {
    if (items.length === 0) return;
    active = Math.max(0, Math.min(items.length - 1, index));
    const top = active * rowHeight;
    if (top < root.scrollTop) root.scrollTop = top;
    else if (top + rowHeight > root.scrollTop + viewportHeight) root.scrollTop = top + rowHeight - viewportHeight;
    paint();
    if (focus) root.focus();
    options.onActivate(items[active]!, active);
  }
  function keydown(event: KeyboardEvent): void {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const page = Math.max(1, Math.floor(viewportHeight / rowHeight));
    const index = event.key === 'ArrowDown' ? active + 1 : event.key === 'ArrowUp' ? active - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : event.key === 'PageDown' ? active + page : event.key === 'PageUp' ? active - page : null;
    if (index === null) return;
    event.preventDefault();
    activate(index);
  }
  root.addEventListener('scroll', paint);
  root.addEventListener('keydown', keydown);
  return {
    setItems(next, activeIndex = 0) {
      items = next;
      active = next.length === 0 ? -1 : Math.max(0, Math.min(next.length - 1, activeIndex));
      root.scrollTop = active < 0 ? 0 : active * rowHeight;
      paint();
    },
    activate,
    destroy() {
      root.removeEventListener('scroll', paint);
      root.removeEventListener('keydown', keydown);
      canvas.remove();
      root.removeAttribute('aria-activedescendant');
    },
  };
}
