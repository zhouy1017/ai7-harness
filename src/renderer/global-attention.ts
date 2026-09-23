import type { GlobalAttentionItemProjection, GlobalAttentionProjection, RendererApi } from '../shared/protocol.js';
import {
  GLOBAL_ATTENTION_FINDINGS_NOTE,
  GLOBAL_ATTENTION_HEADING,
  GLOBAL_ATTENTION_LEDE,
  GLOBAL_ATTENTION_SECTION_LABEL,
  GLOBAL_ATTENTION_STATUS_LINES,
  GLOBAL_ATTENTION_TECHNICAL_ITEM,
  globalAttentionEntryView,
  globalAttentionView,
  type GlobalAttentionGroupView,
  type GlobalAttentionItemView,
} from './global-attention-labels.js';

/**
 * 待我处理 (Issue #424, plan slice S78; editor-surfaces §8.1, V2-UX-ATTN-001 to 009, IA-007): the shell's
 * entry with its number, in the header of every window, and the screen it opens in the library state — the
 * four groups in their fixed order, each item naming its Book, object, exact state or decision, reason and
 * safe next step, and opening its own record in the window that asked. Every word is in
 * `global-attention-labels.ts`.
 *
 * One reader serves both: the entry and the screen paint the same answer. It reads on each screen change and
 * each time the window gains focus, and slowly on its own only while a Run is in flight (the projection's
 * `running`), so a quiet library costs nothing. Reading grants and changes nothing (V2-UX-ATTN-008): opening
 * an item is only navigation, and every decision is still the record's.
 */

/** How often the reader reads again on its own, and only while a Run is in flight. */
export const GLOBAL_ATTENTION_POLL_MS = 5_000;

type AttentionApi = Pick<RendererApi, 'inspectGlobalAttention'>;

export type GlobalAttentionReading =
  | { readonly kind: 'projection'; readonly projection: GlobalAttentionProjection }
  | { readonly kind: 'error'; readonly error: unknown };

export interface GlobalAttentionReader {
  /** Read now; a request while a read is in flight is answered by one more read after it. */
  refresh(): void;
  /** Hear every answer, the latest first; returns the way to stop hearing them. */
  subscribe(listener: (reading: GlobalAttentionReading) => void): () => void;
  /** The local service is gone: nothing more is read. */
  interrupt(): void;
}

export function createGlobalAttentionReader(api: AttentionApi): GlobalAttentionReader {
  const listeners = new Set<(reading: GlobalAttentionReading) => void>();
  let latest: GlobalAttentionReading | null = null;
  let inFlight = false;
  let again = false;
  let interrupted = false;
  let pollTimer: number | undefined;

  function clearPoll(): void {
    if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    pollTimer = undefined;
  }

  function publish(reading: GlobalAttentionReading): void {
    latest = reading;
    for (const listener of listeners) listener(reading);
    clearPoll();
    // A slow poll only while a Run is in flight: the view follows it to its end, and stops when it ends.
    if (!interrupted && reading.kind === 'projection' && reading.projection.running) {
      pollTimer = window.setTimeout(() => {
        pollTimer = undefined;
        refresh();
      }, GLOBAL_ATTENTION_POLL_MS);
    }
  }

  function refresh(): void {
    if (interrupted) return;
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    void api.inspectGlobalAttention().then(
      (projection) => publish({ kind: 'projection', projection }),
      (error: unknown) => publish({ kind: 'error', error }),
    ).finally(() => {
      inFlight = false;
      if (again) {
        again = false;
        refresh();
      }
    });
  }

  return {
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      if (latest !== null) listener(latest);
      return () => listeners.delete(listener);
    },
    interrupt() {
      interrupted = true;
      clearPoll();
    },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `global-attention-${prefix}-${identities}`;
}

// ---- the entry in the shell's header (IA-007) ---------------------------------------------------------

/**
 * The header's 待我处理: its name, and the Actionable Attention Count in a badge — a number with its own
 * outline, never a colour alone — only while the first two groups hold anything (V2-UX-ATTN-006). The number
 * is also in the control's name in words. An answer that could not be read keeps the last number shown.
 */
export function mountGlobalAttentionEntry(options: { button: HTMLButtonElement; reader: GlobalAttentionReader; open(): void }): void {
  const { button } = options;
  const name = el('span', 'global-attention-entry-label');
  const badge = el('span', 'global-attention-badge');
  badge.setAttribute('aria-hidden', 'true');
  button.replaceChildren(name, badge);
  button.type = 'button';
  button.dataset['globalAttentionEntry'] = 'true';
  const paint = (count: number | null): void => {
    const view = globalAttentionEntryView(count);
    name.textContent = view.text;
    badge.textContent = view.badge ?? '';
    badge.hidden = view.badge === null;
    button.setAttribute('aria-label', view.accessibleName);
    button.dataset['attentionCount'] = String(count ?? 0);
  };
  paint(null);
  options.reader.subscribe((reading) => {
    if (reading.kind === 'projection') paint(reading.projection.actionableCount);
  });
  button.addEventListener('click', () => options.open());
}

// ---- the screen ---------------------------------------------------------------------------------------------

export interface GlobalAttentionSurface {
  /** Paint the latest answer and read again; called once the screen is on the page. */
  start(): void;
  /** Stop painting: the screen is being replaced. */
  destroy(): void;
}

export interface MountGlobalAttentionOptions {
  /** The screen's panel: the surface appends its heading and groups, and the caller its persistent actions after them. */
  readonly root: HTMLElement;
  readonly reader: GlobalAttentionReader;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** Open the item's own record in this window; a refusal is the caller's to report. */
  open(item: GlobalAttentionItemProjection): Promise<void>;
}

export function mountGlobalAttention(options: MountGlobalAttentionOptions): GlobalAttentionSurface {
  let destroyed = false;
  let painted = '';
  let opening = false;
  let unsubscribe: (() => void) | null = null;
  let focusHeading = true;
  const byItem = new Map<string, GlobalAttentionItemProjection>();

  const heading = el('h2', 'global-attention-title', GLOBAL_ATTENTION_HEADING);
  heading.tabIndex = -1;
  heading.id = uid('title');
  const host = el('div', 'global-attention-host');
  host.setAttribute('aria-busy', 'true');
  host.append(el('p', 'field-note global-attention-loading', GLOBAL_ATTENTION_STATUS_LINES.loading));
  options.root.setAttribute('aria-labelledby', heading.id);
  options.root.append(
    el('p', 'section-label', GLOBAL_ATTENTION_SECTION_LABEL),
    heading,
    el('p', 'lede', GLOBAL_ATTENTION_LEDE),
    el('p', 'field-note global-attention-findings-note', GLOBAL_ATTENTION_FINDINGS_NOTE),
    host,
  );

  function fact(term: string, value: string): HTMLElement[] {
    return [el('dt', undefined, term), el('dd', 'technical-identity', value)];
  }

  function itemNode(view: GlobalAttentionItemView, projection: GlobalAttentionItemProjection): HTMLElement {
    const node = el('li', 'global-attention-item');
    node.dataset['attentionItem'] = view.itemId;
    node.dataset['attentionState'] = view.state;
    node.dataset['attentionBlocked'] = projection.blocked ? 'true' : 'false';
    node.dataset['attentionTarget'] = projection.target.kind;
    if (projection.book.bookId !== null) node.dataset['bookId'] = projection.book.bookId;
    const reasonId = uid('reason');
    const nextId = uid('next');
    const stateId = uid('state');
    const open = el('button', 'global-attention-open', view.object);
    open.type = 'button';
    open.dataset['attentionOpen'] = view.itemId;
    open.setAttribute('aria-label', view.openName);
    open.setAttribute('aria-describedby', `${stateId} ${reasonId} ${nextId}`);
    open.addEventListener('click', () => void openItem(view.itemId, open));
    const title = el('h4', 'global-attention-object');
    title.append(open);
    const pill = el('span', `status-pill review-pill review-pill-${view.pill.tone} global-attention-pill`, view.stateLabel);
    pill.id = stateId;
    pill.dataset['pillTone'] = view.pill.tone;
    pill.dataset['pillShape'] = view.pill.shape;
    const stateLine = el('p', 'global-attention-state');
    stateLine.append(pill, el('span', 'global-attention-time', view.time));
    const reason = el('p', 'global-attention-reason', view.reason);
    reason.id = reasonId;
    const next = el('p', 'global-attention-next', view.nextStep);
    next.id = nextId;
    node.append(
      el('p', 'global-attention-book', view.book),
      title,
      stateLine,
      reason,
      next,
      options.technicalDetails(
        'global-attention-facts',
        ...fact(GLOBAL_ATTENTION_TECHNICAL_ITEM, view.itemId),
        ...projection.technical.flatMap((row) => fact(row.label, row.value)),
      ),
    );
    return node;
  }

  function groupNode(view: GlobalAttentionGroupView, projection: GlobalAttentionProjection): HTMLElement {
    const section = el('section', 'global-attention-group');
    section.dataset['attentionGroup'] = view.key;
    section.dataset['attentionCounted'] = view.counted ? 'true' : 'false';
    const group = projection.groups.find((entry) => entry.key === view.key);
    section.dataset['attentionTotal'] = String(group?.total ?? 0);
    const headingId = uid('group');
    const groupHeading = el('h3', 'global-attention-group-heading');
    groupHeading.id = headingId;
    groupHeading.append(el('span', 'global-attention-group-label', view.heading));
    if (view.countLine.length > 0) groupHeading.append(el('span', 'global-attention-group-count', view.countLine));
    section.setAttribute('aria-labelledby', headingId);
    section.append(groupHeading);
    if (view.empty !== null) {
      section.append(el('p', 'global-attention-empty', view.empty));
      return section;
    }
    const list = el('ol', 'global-attention-items');
    for (const item of view.items) {
      const entry = group?.items.find((candidate) => candidate.itemId === item.itemId);
      if (entry !== undefined) list.append(itemNode(item, entry));
    }
    section.append(list);
    if (view.truncated !== null) section.append(el('p', 'field-note global-attention-truncated', view.truncated));
    return section;
  }

  function paint(projection: GlobalAttentionProjection): void {
    const key = JSON.stringify(projection);
    if (key === painted) return;
    painted = key;
    const active = document.activeElement;
    const restore = active instanceof HTMLElement && host.contains(active) ? active.dataset['attentionOpen'] ?? null : null;
    byItem.clear();
    for (const group of projection.groups) for (const item of group.items) byItem.set(item.itemId, item);
    host.dataset['attentionCount'] = String(projection.actionableCount);
    host.dataset['attentionRunning'] = projection.running ? 'true' : 'false';
    host.removeAttribute('aria-busy');
    host.replaceChildren(...globalAttentionView(projection).map((view) => groupNode(view, projection)));
    if (opening) for (const button of host.querySelectorAll<HTMLButtonElement>('button.global-attention-open')) button.disabled = true;
    if (restore !== null) {
      const again = Array.from(host.querySelectorAll<HTMLButtonElement>('button.global-attention-open')).find((button) => button.dataset['attentionOpen'] === restore);
      if (again !== undefined) again.focus();
    }
  }

  function paintUnavailable(error: unknown): void {
    if (painted !== '') {
      options.setStatus(options.errorMessage(error, GLOBAL_ATTENTION_STATUS_LINES.refreshFailed), 'error');
      return;
    }
    host.removeAttribute('aria-busy');
    host.replaceChildren(el('p', 'attention-note global-attention-unavailable', options.errorMessage(error, GLOBAL_ATTENTION_STATUS_LINES.unavailable)));
  }

  async function openItem(itemId: string, button: HTMLButtonElement): Promise<void> {
    const item = byItem.get(itemId);
    if (item === undefined || opening || destroyed) return;
    opening = true;
    for (const node of host.querySelectorAll<HTMLButtonElement>('button.global-attention-open')) node.disabled = true;
    options.setStatus(GLOBAL_ATTENTION_STATUS_LINES.opening, 'busy');
    try {
      await options.open(item);
    } catch (error) {
      options.setStatus(options.errorMessage(error, GLOBAL_ATTENTION_STATUS_LINES.openFailed), 'error');
    } finally {
      opening = false;
      if (!destroyed && button.isConnected) {
        for (const node of host.querySelectorAll<HTMLButtonElement>('button.global-attention-open')) node.disabled = false;
        button.focus();
      }
    }
  }

  return {
    start() {
      if (destroyed || unsubscribe !== null) return;
      unsubscribe = options.reader.subscribe((reading) => {
        if (destroyed) return;
        if (reading.kind === 'projection') paint(reading.projection);
        else paintUnavailable(reading.error);
        if (focusHeading && painted !== '') {
          focusHeading = false;
          heading.focus();
        }
      });
      options.reader.refresh();
    },
    destroy() {
      destroyed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
