/** Retain editor interaction when a polled projection replaces its DOM (#1375). */
const RECORD_KEYS = ['data-task-item', 'data-attention-item', 'data-finding-id', 'data-dimension-id', 'data-row-id', 'data-record-id', 'data-model-channel'];
const CONTROL_KEYS = ['data-task-action', 'data-task-drawer-control', 'data-task-plan-edit', 'data-analysis-tab', 'data-analysis-action', 'data-action', 'data-model-choice', 'data-favorite-model', 'data-evaluation-action', 'data-custom-action', 'data-filter-value', 'data-findings-filter', 'data-task-compose-action', 'data-task-composer-field', 'aria-label', 'name'];
type Part = { tag: string; attribute: string | null; value: string; index: number };
type Address = { record: [string, string] | null; path: Part[] };

function part(node: HTMLElement): Omit<Part, 'index'> {
  const attribute = CONTROL_KEYS.find((key) => node.hasAttribute(key)) ?? null;
  return { tag: node.tagName, attribute, value: attribute === null ? node.className.split(/\s+/u)[0] ?? '' : node.getAttribute(attribute)! };
}
function same(node: HTMLElement, key: Omit<Part, 'index'>): boolean {
  const candidate = part(node);
  return candidate.tag === key.tag && candidate.attribute === key.attribute && candidate.value === key.value;
}
function address(root: HTMLElement, node: HTMLElement): Address {
  const path: Part[] = [];
  for (let current = node; current !== root && current.parentElement; current = current.parentElement) {
    const recordKey = RECORD_KEYS.find((key) => current.hasAttribute(key));
    if (recordKey) return { record: [recordKey, current.getAttribute(recordKey)!], path };
    const key = part(current);
    path.unshift({ ...key, index: Array.from(current.parentElement.children).filter((child) => same(child as HTMLElement, key)).indexOf(current) });
  }
  return { record: null, path };
}
function resolve(root: HTMLElement, location: Address): HTMLElement | null {
  let node: HTMLElement | undefined = location.record === null ? root
    : Array.from(root.querySelectorAll<HTMLElement>(`[${location.record[0]}]`)).find((item) => item.getAttribute(location.record![0]) === location.record![1]);
  for (const key of location.path) node = node && Array.from(node.children).filter((child) => same(child as HTMLElement, key))[key.index] as HTMLElement | undefined;
  return node ?? null;
}

/** Capture immediately before replacement and restore immediately after; never persist drafts or read password fields. */
export function retainPollInteraction(root: HTMLElement, drafts = true): (replacement?: HTMLElement) => void {
  const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
  const focus = active === null ? null : address(root, active);
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  const disclosures = nodes.filter((node) => node.tagName === 'DETAILS').map((node) => ({ at: address(root, node), open: (node as HTMLDetailsElement).open }));
  const fields = (drafts ? nodes : []).filter((node) => node.tagName === 'TEXTAREA' || node.tagName === 'INPUT' && !['password', 'checkbox', 'radio', 'hidden', 'submit', 'button'].includes((node as HTMLInputElement).type))
    .map((node) => { const field = node as HTMLInputElement | HTMLTextAreaElement; return { at: address(root, node), value: field.value, start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection }; });
  const scroll = nodes.filter((node) => node.scrollTop || node.scrollLeft).map((node) => ({ at: address(root, node), top: node.scrollTop, left: node.scrollLeft }));
  const ancestors: { node: HTMLElement; top: number; left: number }[] = [];
  for (let node = root.parentElement; node; node = node.parentElement) ancestors.push({ node, top: node.scrollTop, left: node.scrollLeft });
  return (replacement = root) => {
    for (const saved of disclosures) { const node = resolve(replacement, saved.at) as HTMLDetailsElement | null; if (node) node.open = saved.open; }
    for (const saved of fields) {
      const node = resolve(replacement, saved.at) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!node) continue;
      node.value = saved.value;
      if (saved.start != null && saved.end != null && typeof node.setSelectionRange === 'function') node.setSelectionRange(saved.start, saved.end, saved.direction ?? undefined);
    }
    if (focus) {
      const node = active && replacement.contains(active) ? active : resolve(replacement, focus);
      if (node && !(node as HTMLButtonElement).disabled) node.focus({ preventScroll: true });
    }
    for (const saved of scroll) { const node = resolve(replacement, saved.at); if (node) { node.scrollTop = saved.top; node.scrollLeft = saved.left; } }
    for (const saved of ancestors) { saved.node.scrollTop = saved.top; saved.node.scrollLeft = saved.left; }
  };
}

/** Native selects and future progressive popovers must keep their actual DOM while open. */
export function pollControlEngaged(root: HTMLElement, textFields = true): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && root.contains(active) && (textFields ? ['INPUT', 'TEXTAREA', 'SELECT'] : ['SELECT']).includes(active.tagName)
    || Array.from(root.querySelectorAll<HTMLElement>('[aria-expanded="true"], [popover], [role="listbox"]')).some((node) => node.getAttribute('aria-expanded') === 'true' || node.matches(':popover-open') || node.getAttribute('role') === 'listbox' && !node.hidden);
}
