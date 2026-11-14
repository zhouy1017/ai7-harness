import { retainPollInteraction, pollControlEngaged } from './poll-interaction.js';
import { identityWords, technicalLayerVisible } from './technical-layer.js';
import { showToast } from './components/toast.js';
import type { GlobalAttentionItemProjection, GlobalAttentionProjection, RendererApi } from '../shared/protocol.js';
import {
  GLOBAL_ATTENTION_HEADING,
  GLOBAL_ATTENTION_LEDE,
  GLOBAL_ATTENTION_SECTION_LABEL,
  GLOBAL_ATTENTION_STATUS_LINES,
  GLOBAL_ATTENTION_TECHNICAL_ITEM,
  globalAttentionEntryView,
  globalAttentionGroupCounts,
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
 * each time the window gains focus, and every two seconds even while idle. Reading grants and changes nothing
 * (V2-UX-ATTN-008): opening
 * an item is only navigation, and every decision is still the record's.
 */

/** Keep new and changed items following while the service is available. */
export const GLOBAL_ATTENTION_POLL_MS = 2_000;

type AttentionApi = Pick<RendererApi, 'inspectGlobalAttention'>;

/** Ordinary attention counts only the reachable items in this bounded reading, like a Book-filtered list. */
export function visibleGlobalAttention(projection: GlobalAttentionProjection, developerMode: boolean): GlobalAttentionProjection {
  if (developerMode) return projection;
  const groups = projection.groups.map((group) => {
    const items = group.items.filter((item) => item.target.kind !== 'learning-materials');
    return { ...group, items, total: items.length };
  });
  return { ...projection, groups, actionableCount: groups.reduce((count, group) => count + (globalAttentionGroupCounts(group.key) ? group.total : 0), 0) };
}

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
    // Follow newly queued work as well as runs already in flight.
    if (!interrupted) {
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
  if (text !== undefined) node.textContent = identityWords(text, className);
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

let identities = 0;
// Reading is window-local view state; navigating away does not undo it or decide an item.
const readAttentionItems = new Set<string>();
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
    if (reading.kind === 'projection') paint(visibleGlobalAttention(reading.projection, technicalLayerVisible).actionableCount);
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
  openTasks?(): void;
  /** The screen's panel: the surface appends its heading and groups, and the caller its persistent actions after them. */
  readonly root: HTMLElement;
  readonly reader: GlobalAttentionReader;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** Open the model-service settings surface for an attention item whose next step is network remediation. */
  openNetworkProxySettings(): Promise<void> | void;
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
  const readItems = readAttentionItems;

  const heading = el('h2', 'global-attention-title', GLOBAL_ATTENTION_HEADING);
  heading.tabIndex = -1;
  heading.id = uid('title');
  const host = el('div', 'global-attention-host');
  host.setAttribute('aria-busy', 'true');
  const loading = el('span', 'global-attention-loading', ` · ${GLOBAL_ATTENTION_STATUS_LINES.loading}`);
  loading.setAttribute('role', 'status');
  heading.append(loading);
  options.root.setAttribute('aria-labelledby', heading.id);
  options.root.append(
    el('p', 'section-label', GLOBAL_ATTENTION_SECTION_LABEL),
    heading,
    el('p', 'lede', GLOBAL_ATTENTION_LEDE),
    host,
  );
  const readAll = el('button', 'quiet', '全部标记已读'); readAll.type = 'button'; readAll.dataset['attentionReadAll'] = '';
  readAll.addEventListener('click', () => {
    const before = new Set(readItems);
    for (const item of byItem.values()) readItems.add(`${item.itemId}:${item.state}:${item.at}`);
    for (const node of host.querySelectorAll<HTMLElement>('[data-attention-item]')) node.dataset['read'] = 'true';
    options.setStatus('已标记为已读，待处理的决定仍会保留。', 'success');
    showToast('已全部标记为已读。', { action: { label: '撤销', run: () => { readItems.clear(); for (const id of before) readItems.add(id); painted = ''; options.reader.refresh(); } } });
  });
  options.root.append(readAll);

  function fact(term: string, value: string): HTMLElement[] {
    return [el('dt', undefined, term), el('dd', 'technical-identity', value)];
  }

  function itemNode(view: GlobalAttentionItemView, projection: GlobalAttentionItemProjection): HTMLElement {
    const node = el('li', 'global-attention-item');
    node.dataset['attentionItem'] = view.itemId;
    node.dataset['attentionState'] = view.state;
    node.dataset['attentionBlocked'] = projection.blocked ? 'true' : 'false';
    node.dataset['attentionTarget'] = projection.target.kind;
    node.dataset['read'] = String(readItems.has(`${projection.itemId}:${projection.state}:${projection.at}`));
    if (projection.book.bookId !== null) node.dataset['bookId'] = projection.book.bookId;
    const reasonId = uid('reason');
    const stateId = uid('state');
    const open = el('button', 'global-attention-open global-attention-next', view.nextStep);
    open.type = 'button';
    open.dataset['attentionOpen'] = view.itemId;
    open.setAttribute('aria-label', `${view.nextStep} · ${view.openName}`);
    open.setAttribute('aria-describedby', `${stateId} ${reasonId}`);
    open.addEventListener('click', () => void openItem(view.itemId, open));
    const title = el('h4', 'global-attention-object');
    title.append(el('span', 'global-attention-book', view.book), ' · ', el('span', 'global-attention-object-name', view.object));
    const pill = el('span', `state-term status-pill review-pill review-pill-${view.pill.tone} global-attention-pill`, view.stateLabel);
    pill.id = stateId;
    pill.dataset['pillTone'] = view.pill.tone;
    pill.dataset['pillShape'] = view.pill.shape;
    title.append(' · ', pill);
    if (projection.modelLabel) title.append(' · ', el('span', 'global-attention-model', projection.modelLabel));
    title.title = `${view.openName} · ${view.stateLabel}`;
    open.title = view.time;
    const reason = el('p', 'global-attention-reason', view.reason);
    reason.id = reasonId;
    reason.title = view.reason;
    const body = el('div', 'global-attention-body');
    body.append(title, reason);
    node.append(body, open);
    if (technicalLayerVisible) node.append(
      options.technicalDetails(
        'global-attention-facts',
        ...fact('时间', view.time),
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
    if (view.truncated !== null) groupHeading.append(el('span', 'global-attention-truncated', view.countLine.length > 0 ? view.truncated.replace(/^共 \d+ 项，/u, '') : view.truncated));
    section.setAttribute('aria-labelledby', headingId);
    section.append(groupHeading);
    if (view.empty !== null) {
      section.append(el('p', 'global-attention-empty', view.empty));
      return section;
    }
    const list = el('ol', 'global-attention-items');
    for (const item of view.key === 'active' ? view.items.slice(0, 3) : view.items) {
      const entry = group?.items.find((candidate) => candidate.itemId === item.itemId);
      if (entry !== undefined) list.append(itemNode(item, entry));
    }
    section.append(list);
    if (view.key === 'active') { const all = el('button', 'quiet', '在任务总览里看全部'); all.addEventListener('click', () => options.openTasks?.()); section.append(all); }
    return section;
  }

  function paint(reading: GlobalAttentionProjection): void {
    if (pollControlEngaged(host, false)) return;
    const projection = visibleGlobalAttention(reading, technicalLayerVisible);
    const key = JSON.stringify(projection);
    if (key === painted) return;
    painted = key;
    const restoreInteraction = retainPollInteraction(host);
    byItem.clear();
    for (const group of projection.groups) for (const item of group.items) byItem.set(item.itemId, item);
    host.dataset['attentionCount'] = String(projection.actionableCount);
    host.dataset['attentionRunning'] = projection.running ? 'true' : 'false';
    host.removeAttribute('aria-busy');
    loading.remove();
    host.replaceChildren(...globalAttentionView(projection).map((view) => groupNode(view, projection)));
    if (opening) for (const button of host.querySelectorAll<HTMLButtonElement>('button.global-attention-open')) button.disabled = true;
    restoreInteraction();
  }

  function paintUnavailable(error: unknown): void {
    if (painted !== '') {
      options.setStatus(options.errorMessage(error, GLOBAL_ATTENTION_STATUS_LINES.refreshFailed), 'error');
      return;
    }
    host.removeAttribute('aria-busy');
    loading.remove();
    host.replaceChildren(el('p', 'attention-note global-attention-unavailable', options.errorMessage(error, GLOBAL_ATTENTION_STATUS_LINES.unavailable)));
  }

  async function openItem(itemId: string, button: HTMLButtonElement): Promise<void> {
    const item = byItem.get(itemId);
    if (item === undefined || opening || destroyed) return;
    opening = true;
    for (const node of host.querySelectorAll<HTMLButtonElement>('button.global-attention-open')) node.disabled = true;
    options.setStatus(GLOBAL_ATTENTION_STATUS_LINES.opening, 'busy');
    try {
      if (item.nextStep === 'open-network-proxy') await options.openNetworkProxySettings();
      else await options.open(item);
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
