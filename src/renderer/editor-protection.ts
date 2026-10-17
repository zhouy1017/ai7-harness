import {
  PROTECTION_CLOSE_OPTIONS,
  PROTECTION_COPIED,
  PROTECTION_COPY_ACTION,
  PROTECTION_COPY_FAILED,
  PROTECTION_HEADLINE,
  PROTECTION_MARKER,
  PROTECTION_OPTIONS_ACTION,
  PROTECTION_OPTIONS_TITLE,
  PROTECTION_READ_ONLY_HEADLINE,
  PROTECTION_RESTART_PROMISE,
  PROTECTION_RETRY_ACTION,
  PROTECTION_SALVAGE_UNAVAILABLE,
  atRiskLine,
  blockedActionLine,
  lastDurableLine,
  readOnlyLine,
  retryLine,
  type ProtectionCause,
  type ProtectionReadOnlyReason,
} from './editor-protection-labels.js';

// Editing Protection Mode and the Protective Read-only State (Issue #951, wave 12 slice 12a; V2-UX-DUR-001 to DUR-012,
// ED-055, ED-056, ED-058). The editor (editor.ts) owns the state — it alone knows what the journal has acknowledged — and
// this module owns the bounded safety buffer's arithmetic, how a failed write is read, and the protection surface the
// context header shows. The buffer is the editor's own unacknowledged text in the window: process-local, never an Edit
// Journal, Recovery Snapshot or durability guarantee (DUR-002), and bounded by a constant, never by the manuscript's length.

/** The safe capacity of the Bounded Edit Safety Buffer, in characters (graphemes): a constant, whatever the manuscript's size. */
export const SAFETY_BUFFER_CAPACITY = 2_000;
/** Room kept back so an active Chinese IME composition always finishes under the input method's control (DUR-008). */
export const IME_COMPOSITION_RESERVE = 256;
/** Past this, no new input is taken outside a composition, and the Protective Read-only State begins once none is open. */
export const SAFETY_BUFFER_SOFT_LIMIT = SAFETY_BUFFER_CAPACITY - IME_COMPOSITION_RESERVE;
/** The automatic retry's waits, in milliseconds; the last repeats (DUR-006). */
export const PROTECTION_RETRY_DELAYS_MS: ReadonlyArray<number> = Object.freeze([1_000, 2_000, 4_000, 8_000]);

/**
 * A refusal that says the target moved — the binding, the journal position or the block the edit was made against — or that
 * the exact edit cannot be bound to it (DUR-007). Anything else is the acknowledgement being unavailable, which a retry of
 * the same exact edit may cure.
 */
const DRIFT_CODES: ReadonlySet<string> = new Set([
  'EDIT_BINDING_CHANGED',
  'EDIT_SEQUENCE_CHANGED',
  'EDIT_BLOCK_CHANGED',
  'EDIT_RANGE_INVALID',
  'IDEMPOTENCY_CONFLICT',
  'AI7_EDITOR_CAPABILITY_INVALID',
  'EDITOR_ACK_MISMATCH',
  'JOURNAL_ACK_FAILED',
]);

export type JournalFailureKind = 'unavailable' | 'drift';

export function classifyJournalFailure(error: unknown): JournalFailureKind {
  const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null;
  return code !== null && DRIFT_CODES.has(code) ? 'drift' : 'unavailable';
}

export function retryDelayMs(attempt: number): number {
  const index = Math.max(0, Math.min(PROTECTION_RETRY_DELAYS_MS.length - 1, attempt));
  return PROTECTION_RETRY_DELAYS_MS[index]!;
}

/** Whether a candidate state of the buffer may be taken: within the soft limit, or within capacity while a composition is open. */
export function bufferAdmits(characters: number, composing: boolean): boolean {
  return characters <= (composing ? SAFETY_BUFFER_CAPACITY : SAFETY_BUFFER_SOFT_LIMIT);
}

/** Whether the buffer has reached the point where input pauses: at the soft limit with no composition open (DUR-008). */
export function bufferReachedLimit(characters: number, composing: boolean): boolean {
  return !composing && characters >= SAFETY_BUFFER_SOFT_LIMIT;
}

/**
 * How many characters a block's unacknowledged text differs from its acknowledged text: what the shared prefix and suffix
 * leave, removed plus inserted. The work follows the block's length, which the window bounds.
 */
export function changedCharacters(acknowledged: ReadonlyArray<string>, current: ReadonlyArray<string>): number {
  let prefix = 0;
  while (prefix < acknowledged.length && prefix < current.length && acknowledged[prefix] === current[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < acknowledged.length - prefix &&
    suffix < current.length - prefix &&
    acknowledged[acknowledged.length - 1 - suffix] === current[current.length - 1 - suffix]
  ) suffix += 1;
  return (acknowledged.length - prefix - suffix) + (current.length - prefix - suffix);
}

/** An unacknowledged command may already be durable even if the editor has since undone its visible text. */
export function unacknowledgedCharacters(
  acknowledged: ReadonlyArray<string>, current: ReadonlyArray<string>,
  pending?: { readonly fromGrapheme: number; readonly toGrapheme: number; readonly inserted: ReadonlyArray<string> },
): number {
  const visible = changedCharacters(acknowledged, current);
  if (!pending) return visible;
  const written = [...acknowledged.slice(0, pending.fromGrapheme), ...pending.inserted, ...acknowledged.slice(pending.toGrapheme)];
  return Math.max(visible, changedCharacters(acknowledged, written), changedCharacters(written, current));
}

/** The At-risk Edit Extent (DUR-004): where, in the manuscript's own numbering, and how much. */
export interface AtRiskExtent {
  readonly characters: number;
  readonly blocks: number;
  /** The manuscript-wide position of the first block holding unacknowledged text, or `null` when none does. */
  readonly firstBlockPosition: number | null;
  readonly location: string | null;
}

/** What the editor tells the surface about protection; `null` while every change is acknowledged. */
export interface ProtectionView {
  readonly cause: ProtectionCause;
  readonly readOnly: ProtectionReadOnlyReason | null;
  readonly lastDurable: { readonly sequence: number; readonly durableAt: string };
  readonly atRisk: AtRiskExtent;
  readonly retrying: boolean;
  readonly attempts: number;
  /** When the next automatic retry runs (epoch ms), or `null` when none is scheduled. */
  readonly nextRetryAt: number | null;
  /** DUR-009: exact local salvage export needs the service to reconstruct and receipt the payload. */
  readonly salvageExport: 'available' | 'unavailable';
}

/** The document attribute other surfaces key on (12b's save menu drops its saved styling while it is set). */
export function protectionAttribute(view: ProtectionView | null): 'active' | 'read-only' | null {
  if (view === null) return null;
  return view.readOnly === null ? 'active' : 'read-only';
}

export interface ProtectionSurfaceOptions {
  /** The slot in the context header the banner stands in. */
  readonly host: HTMLElement;
  readonly root: HTMLElement;
  retry(): void;
  affectedContent(): string;
  writeClipboard(text: string): Promise<void>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
}

export interface ProtectionSurface {
  update(view: ProtectionView | null): void;
  /** Open 查看保护选项, with a line saying why when a guarded action or a close request opened it (DUR-005, DUR-010). */
  openOptions(reason?: string): void;
  /** Say beside an attempted action why it was refused (DUR-005). */
  blockAction(action: HTMLElement | null): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionName(action: HTMLElement | null): string | null {
  if (action === null) return null;
  const label = action.getAttribute('aria-label') ?? action.textContent ?? '';
  const trimmed = label.trim().slice(0, 40);
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * The protection surface: a banner in the context header while protection is in force — headline, Last Durable Edit
 * Boundary, At-risk Edit Extent, automatic retry state and one 查看保护选项 (DUR-003) — and the options it opens, which
 * always offer 重试写入 and 复制受影响内容 (DUR-009). It stays visible in 专注模式 (ED-058) and cannot be hidden from `视图`.
 */
export function mountProtectionSurface(options: ProtectionSurfaceOptions): ProtectionSurface {
  let view: ProtectionView | null = null;
  let countdown: number | undefined;
  const banner = el('section', 'editing-protection');
  banner.id = 'editing-protection';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-label', PROTECTION_HEADLINE);
  banner.hidden = true;
  // The buffer's declared limits, stated where a Journey or an assistive reading can find them.
  banner.dataset['bufferSoftLimit'] = String(SAFETY_BUFFER_SOFT_LIMIT);
  banner.dataset['bufferCapacity'] = String(SAFETY_BUFFER_CAPACITY);
  const marker = el('span', 'editing-protection-marker', PROTECTION_MARKER);
  marker.setAttribute('aria-hidden', 'true');
  const headline = el('strong', 'editing-protection-headline', PROTECTION_HEADLINE);
  const facts = el('dl', 'editing-protection-facts');
  const boundary = el('dd');
  const extent = el('dd');
  const retryState = el('dd');
  boundary.dataset['protectionFact'] = 'last-durable';
  extent.dataset['protectionFact'] = 'at-risk';
  retryState.dataset['protectionFact'] = 'retry';
  facts.append(boundary, extent, retryState);
  const openButton = el('button', 'secondary', PROTECTION_OPTIONS_ACTION);
  openButton.type = 'button';
  openButton.dataset['protectionAction'] = 'options';
  banner.append(marker, headline, facts, openButton);
  options.host.append(banner);

  const dialog = el('section', 'editing-protection-options');
  dialog.id = 'editing-protection-options';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'false');
  dialog.setAttribute('aria-labelledby', 'editing-protection-options-title');
  dialog.hidden = true;
  const dialogTitle = el('h2', undefined, PROTECTION_OPTIONS_TITLE);
  dialogTitle.id = 'editing-protection-options-title';
  dialogTitle.tabIndex = -1;
  const dialogReason = el('p', 'editing-protection-reason');
  dialogReason.setAttribute('role', 'status');
  dialogReason.hidden = true;
  const dialogState = el('p', 'editing-protection-state');
  const dialogReadOnly = el('p', 'editing-protection-read-only');
  const dialogSalvage = el('p', 'field-note', PROTECTION_SALVAGE_UNAVAILABLE);
  const dialogPromise = el('p', 'field-note', PROTECTION_RESTART_PROMISE);
  const retryButton = el('button', 'primary', PROTECTION_RETRY_ACTION);
  retryButton.type = 'button';
  retryButton.dataset['protectionAction'] = 'retry';
  const copyButton = el('button', 'secondary', PROTECTION_COPY_ACTION);
  copyButton.type = 'button';
  copyButton.dataset['protectionAction'] = 'copy';
  const closeButton = el('button', 'quiet', PROTECTION_CLOSE_OPTIONS);
  closeButton.type = 'button';
  closeButton.dataset['protectionAction'] = 'close';
  const actions = el('div', 'button-row');
  actions.append(retryButton, copyButton, closeButton);
  const copied = el('p', 'field-note');
  copied.setAttribute('role', 'status');
  dialog.append(dialogTitle, dialogReason, dialogState, dialogReadOnly, actions, copied, dialogSalvage, dialogPromise);
  options.host.append(dialog);

  const blockNotes = new Set<HTMLElement>();
  const clearBlockNotes = (): void => {
    for (const note of blockNotes) note.remove();
    blockNotes.clear();
  };

  const paint = (): void => {
    if (countdown !== undefined) window.clearTimeout(countdown);
    countdown = undefined;
    const current = view;
    const state = current === null ? null : protectionAttribute(current);
    if (state === null) delete options.root.dataset['editingProtection'];
    else options.root.dataset['editingProtection'] = state;
    banner.hidden = current === null;
    if (current === null) {
      dialog.hidden = true;
      clearBlockNotes();
      return;
    }
    banner.dataset['protectionCause'] = current.cause;
    banner.dataset['protectionReadOnly'] = current.readOnly ?? 'none';
    headline.textContent = current.readOnly === null ? PROTECTION_HEADLINE : PROTECTION_READ_ONLY_HEADLINE;
    boundary.textContent = lastDurableLine(current.lastDurable.sequence, current.lastDurable.durableAt);
    extent.textContent = atRiskLine(current.atRisk.location, current.atRisk.characters);
    extent.dataset['atRiskCharacters'] = String(current.atRisk.characters);
    const seconds = current.nextRetryAt === null ? null : Math.max(0, Math.ceil((current.nextRetryAt - Date.now()) / 1_000));
    retryState.textContent = retryLine(current.cause, current.retrying, current.attempts, seconds);
    retryState.dataset['retryAttempts'] = String(current.attempts);
    dialogState.textContent = `${boundary.textContent}；${extent.textContent}。`;
    dialogReadOnly.hidden = current.readOnly === null;
    dialogReadOnly.textContent = current.readOnly === null ? '' : readOnlyLine(current.readOnly);
    dialogSalvage.hidden = current.salvageExport === 'available';
    retryButton.disabled = current.retrying;
    // The countdown is read again each second while a retry waits, so the header never states a stale wait.
    if (seconds !== null && seconds > 0) countdown = window.setTimeout(paint, 1_000);
  };

  openButton.addEventListener('click', () => {
    dialogReason.hidden = true;
    dialog.hidden = false;
    dialogTitle.focus();
  });
  retryButton.addEventListener('click', () => options.retry());
  copyButton.addEventListener('click', () => {
    const text = options.affectedContent();
    void options.writeClipboard(text).then(
      () => { copied.textContent = PROTECTION_COPIED; options.setStatus(PROTECTION_COPIED); },
      () => { copied.textContent = PROTECTION_COPY_FAILED; options.setStatus(PROTECTION_COPY_FAILED, 'error'); },
    );
  });
  closeButton.addEventListener('click', () => {
    dialog.hidden = true;
    openButton.focus();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    dialog.hidden = true;
    openButton.focus();
  });

  return {
    update: (next) => {
      view = next;
      paint();
    },
    openOptions: (reason) => {
      if (view === null) return;
      dialogReason.hidden = reason === undefined;
      dialogReason.textContent = reason ?? '';
      dialog.hidden = false;
      dialogTitle.focus();
    },
    blockAction: (action) => {
      const line = blockedActionLine(actionName(action));
      options.setStatus(line, 'error');
      if (action === null || action.parentElement === null) return;
      const existing = action.nextElementSibling;
      if (existing instanceof HTMLElement && existing.dataset['protectionBlocked'] !== undefined) {
        existing.textContent = line;
        return;
      }
      const note = el('span', 'editing-protection-blocked', line);
      note.dataset['protectionBlocked'] = actionName(action) ?? '';
      note.setAttribute('role', 'status');
      action.after(note);
      blockNotes.add(note);
    },
    destroy: () => {
      if (countdown !== undefined) window.clearTimeout(countdown);
      clearBlockNotes();
      banner.remove();
      dialog.remove();
      delete options.root.dataset['editingProtection'];
    },
  };
}
