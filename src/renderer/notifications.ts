import { serviceWords } from './service-wording.js';
import type { NavigationCheckpoint } from './navigation-generation.js';
import { showToast } from './components/toast.js';
import type { GlobalAttentionItemProjection, GlobalAttentionProjection, TaskOverviewProjection, TaskOverviewItemProjection } from '../shared/protocol.js';
import type { NotificationsRendererApi } from '../shared/preferences.js';
import { ATTENTION_NOTICE_WORDS, attentionKind, attentionLabel, attentionManyLabel, awaySummaryLabel, completionLabel, isCompletion, isOrdinaryOutcome, QUIET_NOTICE_WORDS } from './notification-labels.js';

export const QUIET_NOTICE_MS = 2_500;
/** The key of 设置 › 通知's 「正在看本书时自动显示结果」: the editor's own switch on this device, on unless turned off. */
export const AUTO_RESULT_KEY = 'ai7.task-overview.auto-result';
export function showTransientNotice(message: string): void { showToast(message); }

/**
 * A result the editor should see that settles no standing error — a cancelled dialog, a refusal to open a page, a quick start
 * that fell back to a prepared plan: one toast, said once (the announcer says nothing), a busy line ended, an error left alone.
 */
export function reportResult(setStatus: (message: string) => void, message: string): void {
  setStatus('');
  showTransientNotice(message);
}

export type StatusTone = 'busy' | 'success' | 'error';
export interface StatusSurface {
  (message: string, tone?: StatusTone): void;
  /** A different destination was rendered: an error from the one before it no longer applies. */
  clearError(): void;
  /**
   * The owner of an error says it is over — a page whose later read succeeded (a poll, which raises no success): the standing
   * error ends only while it is still exactly `message`. No toast, nothing announced; another error, or none, is left alone.
   */
  settle(message: string): void;
}

/** The `setStatus` a page receives: a status line, plus `settle` for an error that page raised and has seen recover. */
export type StatusSetter = ((message: string, tone?: StatusTone) => void) & { settle(message: string): void };

/**
 * The one status line. An error and a busy line stand in the bar until replaced, dismissed or (for an error) cleared by the
 * next `success` or a new destination; a `success` is also said once in a toast. A status without a tone is said once by the
 * announcer — a polite live region that is always in the accessibility tree and never on screen — and, while the bar is hidden,
 * its text stays in the bar's element for status readers; it shows no toast and no bar. An empty message shows nothing.
 * One owner per announcement: an update that does not concern the standing error leaves the error's text and its × button
 * the same nodes, so the bar's live region does not say the error again.
 */
export function createStatusSurface(surface: HTMLElement, announcer?: HTMLElement): StatusSurface {
  let error: string | null = null;
  let busy: string | null = null;
  const line = document.createElement('span');
  line.className = 'status-line';
  const errorText = document.createElement('span');
  const busyText = document.createElement('span');
  line.append(errorText, busyText);
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn small quiet status-dismiss';
  dismiss.setAttribute('aria-label', '关闭错误提示');
  dismiss.title = '关闭错误提示';
  // The bar sits on the manuscript page's save menu trigger: closing the error must not toggle that menu.
  dismiss.addEventListener('click', (event) => { event.stopPropagation(); error = null; paint(''); });
  const write = (node: HTMLElement, text: string): void => { if (node.textContent !== text) node.textContent = text; };
  /** `latest` is the line just said, kept in the hidden bar's element with its tone. */
  const paint = (latest: string, tone?: StatusTone): void => {
    if (line.parentElement !== surface) surface.replaceChildren(line);
    write(errorText, serviceWords(error ?? ''));
    write(busyText, busy === null ? (error === null ? serviceWords(latest) : '') : `${error === null ? '' : ' · '}${serviceWords(busy)}`);
    if (error === null) dismiss.remove();
    else if (dismiss.parentElement !== surface) surface.append(dismiss);
    surface.hidden = error === null && busy === null;
    if (!surface.hidden) surface.dataset['tone'] = error !== null ? 'error' : 'busy';
    else if (tone) surface.dataset['tone'] = tone;
    else delete surface.dataset['tone'];
  };
  const update = (message: string, tone?: StatusTone): void => {
    if (message === '') busy = null;
    // A new error is said again even when its words repeat the standing one: the bar's text is replaced.
    else if (tone === 'error') { error = message; busy = null; errorText.textContent = serviceWords(message); }
    else if (tone === 'busy') busy = message;
    else {
      busy = null;
      if (tone === 'success') { error = null; showToast(serviceWords(message), { tone }); }
    }
    paint(message, tone);
    // Said once: a success by its toast, an error or busy line by the bar, any other line by the announcer.
    if (announcer !== undefined) announcer.textContent = tone === undefined ? serviceWords(message) : '';
  };
  return Object.assign(update, {
    clearError: (): void => { if (error !== null) { error = null; paint(''); } },
    settle: (message: string): void => { if (error !== null && error === message) { error = null; paint(''); } },
  });
}

/**
 * The page's bottom controls (#1519): the manuscript's 向后浏览 and technical disclosure, a sticky action bar, and developer
 * mode's fixed technical-details control. The bar is an
 * overlay at the bottom of the content area that reserves nothing while hidden; while it shows it stands above each of these
 * that is in the lower half of the window, and on the manuscript it keeps to the text column (clear of the right edge, the
 * supporting regions and an overlaying Task Drawer). The page publishes that clearance as `--bottom-controls`; the scroll
 * padding that lets a page's last line be scrolled clear of the bar applies only while `data-status-bar="shown"`.
 */
const BOTTOM_CONTROLS = '#screen .commit-bar, #screen .workbench-actions, #screen .task-overview-confirm:not([hidden]), #screen .window-actions .btn:not([hidden]), #screen .editor-identities, .technical-layer-control';
const STATUS_AREA = '#screen .manuscript-surface';

export function followBottomControls(bar: HTMLElement): void {
  const root = document.documentElement;
  let queued = false;
  // The bar's own frame source, taken as it mounts: placing it is not one of the frames a page's paint waits for (J-01 holds
  // those and counts the completion's alone).
  const nextFrame = window.requestAnimationFrame.bind(window);
  const place = (): void => {
    queued = false;
    if (bar.hidden) {
      delete root.dataset['statusBar'];
      for (const name of ['--bottom-controls', '--status-area-right', '--status-bar-height']) root.style.removeProperty(name);
      return;
    }
    const area = document.querySelector(STATUS_AREA)?.getBoundingClientRect();
    let clearance = area === undefined ? 0 : innerHeight - area.bottom;
    for (const control of document.querySelectorAll<HTMLElement>(BOTTOM_CONTROLS)) {
      const box = control.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && box.bottom > innerHeight / 2 && box.top < innerHeight) clearance = Math.max(clearance, innerHeight - box.top);
    }
    root.style.setProperty('--bottom-controls', `${Math.max(0, Math.ceil(clearance))}px`);
    root.style.setProperty('--status-area-right', `${area === undefined ? 0 : Math.max(0, Math.ceil(innerWidth - area.right))}px`);
    root.style.setProperty('--status-bar-height', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    // The first placement adds the scroll padding and the space above a sticky bar, which moves the controls once more.
    const first = root.dataset['statusBar'] !== 'shown';
    root.dataset['statusBar'] = 'shown';
    if (first) schedule();
  };
  // Only while the bar shows (and once more as it hides) is anything measured: once per frame in a visible window, and in a
  // microtask in a background one (it has no frames), so it still places its bar.
  const schedule = (): void => {
    if (queued || (bar.hidden && root.dataset['statusBar'] === undefined)) return;
    queued = true;
    if (document.hidden) queueMicrotask(place);
    else nextFrame(place);
  };
  new MutationObserver(schedule).observe(bar, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
  new ResizeObserver(schedule).observe(bar);
  addEventListener('resize', schedule);
  // A frame asked for just before the window went to the background never comes: place the bar now instead.
  document.addEventListener('visibilitychange', () => { if (queued) place(); });
  // The body's padding eases when the drawer docks or the sidebar folds: the text column's edge is final only when that ends.
  document.body.addEventListener('transitionend', (event) => { if (event.target === document.body) schedule(); });
  document.addEventListener('scroll', schedule, { capture: true, passive: true });
  // A page change, the sidebar folding, the right column changing form (#1542) or the Task Drawer opening moves the controls
  // without a scroll or a resize.
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['data-sidebar', 'data-focus-mode', 'data-right-column'] });
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['data-task-drawer'], childList: true, subtree: true });
}

/**
 * Observe the existing attention projection; history and its count remain owned by that projection. A new ordinary completion and
 * a new task that stops for the editor (`attentionKind`) each say so while the window is focused (`completed`, `attention`) and
 * are collected for the return summary while it is not (`away`). `standing` is every task that needs the editor, at each reading.
 */
export function createNotificationObserver(options: {
  api: Pick<NotificationsRendererApi, 'notify'>;
  focused(): boolean;
  completed(item: GlobalAttentionItemProjection): void;
  attention?(item: GlobalAttentionItemProjection): void;
  away?(item: GlobalAttentionItemProjection, kind: 'completed' | 'attention'): void;
  standing?(items: ReadonlyArray<GlobalAttentionItemProjection>): void;
  startedAt?: number;
}) {
  const startedAt = options.startedAt ?? Date.now();
  const seen = new Set<string>();
  return (projection: GlobalAttentionProjection): void => {
    const standing: GlobalAttentionItemProjection[] = [];
    for (const group of projection.groups) for (const item of group.items) {
      if (!['exceptions', 'decisions', 'recent'].includes(item.group)) continue;
      if (attentionKind(item) !== null) standing.push(item);
      const key = `${item.itemId}:${item.state}:${item.at}`;
      const at = Date.parse(item.at);
      if (!Number.isFinite(at) || at <= startedAt || seen.has(key)) continue;
      seen.add(key);
      if (item.group === 'recent' && !isOrdinaryOutcome(item, projection)) continue;
      void options.api.notify({ bookId: item.book.bookId, eventId: item.itemId }).catch(() => {
        // Notifications are optional; durable attention and the authoritative record remain available.
      });
      // A failed dialogue stays among the tasks that need the editor; a cancelled task is no completion to say.
      const kind = attentionKind(item) !== null ? 'attention' : isCompletion(item) ? 'completed' : null;
      if (kind === null) continue;
      if (!options.focused()) options.away?.(item, kind);
      else if (kind === 'completed') options.completed(item);
      else options.attention?.(item);
    }
    options.standing?.(standing);
  };
}

export interface AttentionNotice {
  /** A task stopped for the editor while the window is focused. */
  raise(item: GlobalAttentionItemProjection): void;
  /** On returning to the window: what finished and what needs the editor meanwhile, said as one line. */
  summarize(finished: ReadonlyArray<GlobalAttentionItemProjection>, needing: ReadonlyArray<GlobalAttentionItemProjection>): void;
  /** The tasks that still need the editor; a task that no longer does leaves the notice. */
  settle(standing: ReadonlySet<string>): void;
}

/**
 * The notice for a task that needs the editor (#1528): it names the Book and the task, stays until it is closed or acted on,
 * and takes no focus. Several collapse into one line; `open` receives what the line stands for. It is its own element, never the
 * transient capsule, so no later toast replaces it. An update that changes no words leaves the line alone, so it is said once.
 */
export function mountAttentionNotice(open: (items: ReadonlyArray<GlobalAttentionItemProjection>) => void): AttentionNotice {
  const needing = new Map<string, GlobalAttentionItemProjection>();
  let finished: ReadonlyArray<GlobalAttentionItemProjection> = [];
  let summary = false;
  /** What the return summary counts: only the tasks that stopped while the window was away. */
  let summaryIds = new Set<string>();
  const host = document.createElement('aside');
  host.className = 'attention-toast';
  host.dataset['attentionToast'] = '';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.hidden = true;
  const text = document.createElement('span');
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn small quiet';
  go.dataset['attentionToastAction'] = '';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn small quiet attention-toast-close';
  close.dataset['attentionToastClose'] = '';
  close.setAttribute('aria-label', ATTENTION_NOTICE_WORDS.close);
  close.title = ATTENTION_NOTICE_WORDS.close;
  close.textContent = '×';
  host.append(text, go, close);
  // A press on its buttons must not take the focus from the page: the caret stays where the editor left it.
  host.addEventListener('mousedown', (event) => event.preventDefault());
  const write = (node: HTMLElement, value: string): void => { if (node.textContent !== value) node.textContent = value; };
  const entries = (): GlobalAttentionItemProjection[] => [...finished, ...needing.values()];
  const clear = (): void => { needing.clear(); finished = []; summary = false; paint(); };
  const paint = (): void => {
    const waiting = [...needing.values()];
    if (waiting.length + finished.length === 0) { host.hidden = true; return; }
    if (!host.isConnected) document.body.append(host);
    const counted = waiting.filter((item) => summaryIds.has(item.itemId)).length;
    // With nothing left to wait for, what finished is all the line can still say.
    if ((summary || waiting.length === 0) && finished.length + counted > 0) {
      write(text, awaySummaryLabel(finished.length, counted));
      write(go, waiting.length > 0 ? ATTENTION_NOTICE_WORDS.go : finished.length === 1 ? QUIET_NOTICE_WORDS.view : ATTENTION_NOTICE_WORDS.view);
    } else {
      write(text, waiting.length === 1 ? attentionLabel(waiting[0]!) : attentionManyLabel(waiting.length));
      write(go, ATTENTION_NOTICE_WORDS.go);
    }
    host.dataset['attentionCount'] = String(waiting.length);
    host.hidden = false;
  };
  go.addEventListener('click', () => { const items = entries(); clear(); open(items); });
  close.addEventListener('click', clear);
  return {
    raise(item) { needing.set(item.itemId, item); summary = false; paint(); },
    summarize(done, waiting) {
      summaryIds = new Set(waiting.map((item) => item.itemId));
      for (const item of waiting) needing.set(item.itemId, item);
      finished = [...finished, ...done];
      summary = true;
      paint();
    },
    settle(standing) {
      let changed = false;
      for (const id of [...needing.keys()]) if (!standing.has(id)) { needing.delete(id); changed = true; }
      if (changed) { if (needing.size === 0 && finished.length === 0) summary = false; paint(); }
    },
  };
}

/** Completion notices share the ordinary transient-message capsule. */
export function mountQuietNotice(open: (item: GlobalAttentionItemProjection) => void): (item: GlobalAttentionItemProjection) => void {
  return (item) => showToast(completionLabel(item), { tone: item.state, action: { label: QUIET_NOTICE_WORDS.view, run: () => open(item) } });
}

/** Automatic results belong to the task surface that received the completion, never a later destination. */
export async function openCurrentBookCompletion(item: GlobalAttentionItemProjection, options: {
  allowed(item: GlobalAttentionItemProjection): boolean; enabled(): boolean; navigation: NavigationCheckpoint;
  read(): Promise<TaskOverviewProjection>; open(entry: TaskOverviewItemProjection): void;
}): Promise<void> {
  const current = (): boolean => item.book.bookId !== null && options.navigation.isCurrent() && options.allowed(item) && options.enabled() &&
    !document.querySelector('[data-testid="manuscript-editor"]')?.contains(document.activeElement);
  if (!current()) return;
  const tasks = await options.read();
  if (!current()) return;
  const entry = tasks.groups.flatMap((group) => group.items).find((entry) => entry.itemId === item.itemId);
  if (entry) options.open(entry);
}
