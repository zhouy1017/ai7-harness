import type { DialogueSelectionInput, ManuscriptWindowProjection, RendererApi } from '../shared/protocol.js';
import type { SelectionSpanBlockPin } from '../shared/protocol/selection-span.js';
import {
  MAX_SCOPED_AI_EDIT_INSTRUCTION_CHARACTERS,
  type AiEditLockTarget,
  type AiEditLocksProjection,
  type ScopedAiEditProjection,
  type ScopedAiEditScope,
} from '../shared/protocol/scoped-edit.js';

/**
 * 就选中部分让 AI 修改 and 🔒 锁定（AI 不修改）(Issue #1412) as the manuscript surface mounts them, for the Book's manuscript and
 * every derivative document alike. This module owns the composer, its scope choice and its request; the lock calls; and the
 * lock badge. The surface owns where they are drawn, the selection, and the window: it decorates `aiLockedBlockIds` with
 * `data-ai-locked="true"`, and reloads its window and marks when `refresh` is called, so the applied cards and their ✎ 已改
 * badges show. What the service applies is already guarded there; nothing here decides what may change.
 */
export const SCOPED_AI_EDIT_MENU_LABEL = '就选中部分让 AI 修改…';
export const AI_LOCK_SELECTION_LABEL = '🔒 锁定所选范围（AI 不修改）';
export const AI_UNLOCK_SELECTION_LABEL = '解锁所选范围';
export const AI_LOCK_SECTION_LABEL = '🔒 锁定本节';
export const AI_UNLOCK_SECTION_LABEL = '解锁本节';
export const AI_LOCK_TOOLTIP = '已锁定：AI 生成或改写时此段保持原样';
export const AI_LOCK_BADGE_UNLOCK = '点击解锁';

export const SCOPED_AI_EDIT_WORDS = {
  title: '让 AI 修改',
  scope: '修改范围',
  selected: '仅修改所选部分',
  section: '本节未锁定的段落',
  document: '全文未锁定的段落',
  instruction: '修改要求',
  placeholder: '例如：把这几段改得更紧凑，保留核心数据',
  submit: '让 AI 修改',
  cancel: '取消',
  note: '只有修改范围内、未锁定的文字会被改动；其余段落保持原样。改动会作为已应用的修订卡片留在稿件里，可以逐段撤销。',
  requesting: '正在让 AI 修改…',
  empty: '请写下修改要求。',
  tooLong: `修改要求最多 ${MAX_SCOPED_AI_EDIT_INSTRUCTION_CHARACTERS} 个字。`,
  failed: 'AI 局部修改没有完成。',
  unreadable: '暂时读不到这次修改的结果；已应用的修改仍在稿件里。',
  lockFailed: '锁定没有保存。',
  locked: (count: number) => `已锁定 ${count} 段：AI 修改时保持原样`,
  unlocked: (count: number) => `已解锁 ${count} 段`,
  sectionLocked: '已锁定本节：AI 修改时保持原样',
  sectionUnlocked: '已解锁本节',
} as const;

/** How long the composer waits before reading a request again. */
const READ_AGAIN_MS = 800;

type Tone = 'busy' | 'success' | 'error' | undefined;

/** What the manuscript surface gives the composer and the lock calls. */
export interface ScopedAiEditHost {
  readonly api: Pick<RendererApi, 'startScopedAiEdit' | 'inspectScopedAiEdit' | 'setAiEditLocks' | 'inspectAiEditLocks'>;
  /** Write the editor's own pending typing first, so the base the request names is the text on screen. */
  flush(): Promise<void>;
  /** The window on screen now. */
  current(): ManuscriptWindowProjection;
  /** Reload the window and its marks: after an applied scoped edit (its result), or a lock change (`null`). */
  refresh(result: ScopedAiEditProjection | null): Promise<void>;
  setStatus(text: string, tone?: Tone): void;
  errorMessage(error: unknown, fallback: string): string;
}

/** The exact selected words as the pins a scoped edit names: one block's range, or every block of a cross-paragraph span. */
export function selectionPins(selection: DialogueSelectionInput): SelectionSpanBlockPin[] {
  if (selection.span !== undefined && selection.span.length > 0) return selection.span.map((pin) => ({ ...pin }));
  return [{ blockId: selection.blockId, blockDigest: selection.baseBlockDigest, fromGrapheme: selection.fromGrapheme, toGrapheme: selection.toGrapheme }];
}

/** Whether a block of the window is AI-locked now. */
export function isAiLocked(window: Pick<ManuscriptWindowProjection, 'aiLockedBlockIds'>, blockId: string): boolean {
  return window.aiLockedBlockIds?.includes(blockId) ?? false;
}

/** Whether every block a selection touches is locked: the selection menu then offers 解锁 instead of 锁定. */
export function selectionLocked(window: Pick<ManuscriptWindowProjection, 'aiLockedBlockIds'>, selection: DialogueSelectionInput): boolean {
  return selectionPins(selection).every((pin) => isAiLocked(window, pin.blockId));
}

/** The lock-set digest the next request names: the window's, or read when the window does not carry it. */
async function locksDigest(host: ScopedAiEditHost): Promise<string> {
  const window = host.current();
  if (window.aiLocksDigest !== undefined) return window.aiLocksDigest;
  return (await host.api.inspectAiEditLocks({ manuscriptId: window.manuscriptId, branchId: window.branchId })).digest;
}

/**
 * 🔒 锁定 / 解锁: the blocks of a selection, one block, or a section, against the lock set on screen; the window is reloaded so
 * the badges follow. `null` once the reason was said.
 */
export async function setAiLocks(host: ScopedAiEditHost, targets: ReadonlyArray<AiEditLockTarget>, locked: boolean): Promise<AiEditLocksProjection | null> {
  if (targets.length === 0) return null;
  try {
    await host.flush();
    const window = host.current();
    const result = await host.api.setAiEditLocks({ manuscriptId: window.manuscriptId, branchId: window.branchId, targets, locked, expectedLocksDigest: await locksDigest(host) });
    await host.refresh(null);
    const sections = targets.filter((target) => target.kind === 'section').length;
    host.setStatus(sections > 0 && sections === targets.length
      ? (locked ? SCOPED_AI_EDIT_WORDS.sectionLocked : SCOPED_AI_EDIT_WORDS.sectionUnlocked)
      : (locked ? SCOPED_AI_EDIT_WORDS.locked(targets.length) : SCOPED_AI_EDIT_WORDS.unlocked(targets.length)), 'success');
    return result;
  } catch (error) {
    host.setStatus(host.errorMessage(error, SCOPED_AI_EDIT_WORDS.lockFailed), 'error');
    return null;
  }
}

/** The lock targets of a selection: each block it touches. */
export function selectionLockTargets(selection: DialogueSelectionInput): AiEditLockTarget[] {
  return selectionPins(selection).map((pin) => ({ kind: 'block', blockId: pin.blockId }));
}

/** The 🔒 badge beside a locked block: it says what the lock does, and clicking it unlocks the block. */
export function aiLockBadge(onUnlock: () => void): HTMLButtonElement {
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'ai-lock-badge';
  badge.textContent = '🔒';
  badge.title = `${AI_LOCK_TOOLTIP}（${AI_LOCK_BADGE_UNLOCK}）`;
  badge.setAttribute('aria-label', `${AI_LOCK_TOOLTIP}；${AI_LOCK_BADGE_UNLOCK}`);
  badge.dataset['aiLockAction'] = 'unlock';
  badge.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onUnlock();
  });
  return badge;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface ScopedAiEditComposerOptions {
  /** The selected words, or `null` with nothing selected: only the unlocked-range choices are offered then. */
  readonly selection: DialogueSelectionInput | null;
  /** The words to quote above the field. */
  readonly quote?: string;
  /** The heading of the section the selection or caret is in, when there is one: 本节未锁定的段落 is offered. */
  readonly sectionHeadingBlockId?: string | null;
  /** Where the composer is placed; the surface positions it. */
  readonly mount: HTMLElement;
  /** Called once the request settled (or was refused) and the composer closed. */
  readonly onSettled?: (result: ScopedAiEditProjection | null) => void;
}

/**
 * The composer: the scope — 仅修改所选部分, 本节未锁定的段落 or 全文未锁定的段落 — and the instruction. 让 AI 修改 writes the editor's
 * typing first, sends the request on the window's base and lock set, reads it again until it settles, and then has the
 * surface reload so the applied cards show. The result line says how many paragraphs changed and that the rest stayed.
 */
export function openScopedAiEditComposer(host: ScopedAiEditHost, options: ScopedAiEditComposerOptions): { element: HTMLElement; close(): void } {
  const form = el('form', 'scoped-ai-edit-composer');
  form.dataset['scopedAiEdit'] = 'composer';
  form.setAttribute('aria-label', SCOPED_AI_EDIT_WORDS.title);
  form.append(el('h3', undefined, SCOPED_AI_EDIT_WORDS.title));
  if (options.quote !== undefined && options.quote.length > 0) {
    const quote = el('blockquote', 'scoped-ai-edit-quote', [...options.quote].length > 160 ? `${[...options.quote].slice(0, 160).join('')}…` : options.quote);
    form.append(quote);
  }
  const choices: Array<{ value: 'selected' | 'section' | 'document'; label: string }> = [
    ...(options.selection === null ? [] : [{ value: 'selected' as const, label: SCOPED_AI_EDIT_WORDS.selected }]),
    ...(options.sectionHeadingBlockId == null ? [] : [{ value: 'section' as const, label: SCOPED_AI_EDIT_WORDS.section }]),
    { value: 'document', label: SCOPED_AI_EDIT_WORDS.document },
  ];
  const scope = el('fieldset', 'scoped-ai-edit-scope');
  scope.append(el('legend', undefined, SCOPED_AI_EDIT_WORDS.scope));
  const radios: HTMLInputElement[] = [];
  choices.forEach((choice, index) => {
    const label = el('label');
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'scoped-ai-edit-scope';
    radio.value = choice.value;
    radio.checked = index === 0;
    radio.dataset['scopedAiEditScope'] = choice.value;
    radios.push(radio);
    label.append(radio, el('span', undefined, choice.label));
    scope.append(label);
  });
  form.append(scope);
  const field = el('label', 'scoped-ai-edit-field');
  field.append(el('span', undefined, SCOPED_AI_EDIT_WORDS.instruction));
  const instruction = el('textarea');
  instruction.name = 'instruction';
  instruction.rows = 3;
  instruction.maxLength = MAX_SCOPED_AI_EDIT_INSTRUCTION_CHARACTERS;
  instruction.placeholder = SCOPED_AI_EDIT_WORDS.placeholder;
  instruction.dataset['scopedAiEdit'] = 'instruction';
  field.append(instruction);
  form.append(field, el('small', 'muted', SCOPED_AI_EDIT_WORDS.note));
  const actions = el('div', 'button-row');
  const submit = el('button', 'btn primary', SCOPED_AI_EDIT_WORDS.submit);
  submit.type = 'submit';
  submit.dataset['scopedAiEdit'] = 'submit';
  const cancel = el('button', 'btn quiet', SCOPED_AI_EDIT_WORDS.cancel);
  cancel.type = 'button';
  cancel.dataset['scopedAiEdit'] = 'cancel';
  actions.append(submit, cancel);
  form.append(actions);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    form.remove();
  };
  cancel.addEventListener('click', () => { close(); options.onSettled?.(null); });
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); options.onSettled?.(null); }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void run();
  });
  const chosen = (): ScopedAiEditScope => {
    const value = radios.find((radio) => radio.checked)?.value ?? choices[0]!.value;
    if (value === 'selected' && options.selection !== null) return { mode: 'selected-only', span: selectionPins(options.selection) };
    if (value === 'section' && options.sectionHeadingBlockId != null) return { mode: 'unlocked-only', range: { kind: 'section', headingBlockId: options.sectionHeadingBlockId } };
    return { mode: 'unlocked-only', range: { kind: 'document' } };
  };
  const run = async (): Promise<void> => {
    const words = instruction.value.trim();
    if (words.length === 0) { host.setStatus(SCOPED_AI_EDIT_WORDS.empty, 'error'); instruction.focus(); return; }
    if ([...words].length > MAX_SCOPED_AI_EDIT_INSTRUCTION_CHARACTERS) { host.setStatus(SCOPED_AI_EDIT_WORDS.tooLong, 'error'); return; }
    submit.disabled = cancel.disabled = instruction.disabled = true;
    let settled: ScopedAiEditProjection;
    try {
      await host.flush();
      const window = host.current();
      host.setStatus(SCOPED_AI_EDIT_WORDS.requesting, 'busy');
      settled = await host.api.startScopedAiEdit({
        manuscriptId: window.manuscriptId, branchId: window.branchId, baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence,
        expectedLocksDigest: await locksDigest(host), instruction: words, scope: chosen(),
      });
    } catch (error) {
      host.setStatus(host.errorMessage(error, SCOPED_AI_EDIT_WORDS.failed), 'error');
      submit.disabled = cancel.disabled = instruction.disabled = false;
      return;
    }
    close();
    try {
      while (settled.state === 'requesting') {
        await new Promise((resolve) => window.setTimeout(resolve, READ_AGAIN_MS));
        settled = await host.api.inspectScopedAiEdit({ requestId: settled.requestId });
      }
    } catch (error) {
      host.setStatus(host.errorMessage(error, SCOPED_AI_EDIT_WORDS.unreadable), 'error');
      options.onSettled?.(null);
      return;
    }
    if (settled.markIds.length > 0) await host.refresh(settled);
    host.setStatus(settled.label, settled.state === 'applied' || settled.state === 'unchanged' ? 'success' : 'error');
    options.onSettled?.(settled);
  };
  options.mount.append(form);
  instruction.focus();
  return { element: form, close };
}
