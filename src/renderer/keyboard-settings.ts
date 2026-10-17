import type { KeyboardBindings } from '../shared/preferences.js';
import type { RendererApi } from '../shared/protocol.js';
import {
  COMMANDS,
  COMMAND_CONTEXT_NAMES,
  COMMAND_GROUP_NAMES,
  FIXED_COMMANDS,
  captureChord,
  checkBinding,
  chordText,
  commandPlatform,
  defaultBindings,
  isCustomized,
  refreshShortcutLabels,
  sequenceLabel,
  shortcutLabel,
  withBinding,
  withoutBinding,
  validatedBindings,
  type Chord,
  type CommandDefinition,
} from './commands.js';
import { bindingRefusalLabel } from './commands-labels.js';
import {
  KEYBOARD_ALWAYS_ON,
  KEYBOARD_CAPTURE_ADD_STEP,
  KEYBOARD_CAPTURE_APPLY,
  KEYBOARD_CAPTURE_CANCEL,
  KEYBOARD_CAPTURE_PROMPT,
  KEYBOARD_CAPTURE_SECOND,
  KEYBOARD_CHANGE,
  KEYBOARD_COLUMNS,
  KEYBOARD_CUSTOM_MARK,
  KEYBOARD_FIXED_HEADING,
  KEYBOARD_LEDE,
  KEYBOARD_RESET_ALL,
  KEYBOARD_RESET_ONE,
  KEYBOARD_SHORTCUTS_HEADING,
  KEYBOARD_STATUS_LINES,
  keyboardCapturedLine,
  keyboardResetLine,
  keyboardSavedLine,
  keyboardCaptureName,
  keyboardChangeName,
  keyboardResetName,
} from './keyboard-labels.js';

/**
 * 设置 › 本机 › 键盘与无障碍 › 快捷键 (Issue #936, plan slice 11c; V2-UX-KEY-002, KEY-003, KEY-011, KEY-013): the declared
 * navigation, search and view commands with the chord each answers to, 修改 capturing the next chord, a refusal that names
 * the reserved key or the command and contexts it would make ambiguous, 恢复默认 per command and for the whole section.
 * A saved change reaches every shown chord at once through `onChanged`.
 */

type Status = (message: string, tone?: 'busy' | 'success' | 'error') => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface MountKeyboardSettingsOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'getPreferences' | 'savePreference'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  /** Called with the bindings the preference now holds, so every label and the dispatcher follow at once. */
  readonly onChanged: (bindings: KeyboardBindings) => void;
}

export function mountKeyboardSettings(options: MountKeyboardSettingsOptions): () => void {
  const { root, api, setStatus, errorMessage, onChanged } = options;
  const platform = commandPlatform();
  root.classList.add('keyboard-settings');
  let bindings: KeyboardBindings = {};
  let busy = false;
  /** Ends the capture in progress, if any, without changing anything. */
  let stopCapture: (() => void) | null = null;

  const table = el('div', 'keyboard-table-host');
  const resetAll = el('button', 'secondary', KEYBOARD_RESET_ALL);
  resetAll.type = 'button';
  resetAll.dataset['keyboardResetAll'] = 'true';

  const save = async (next: KeyboardBindings, done: string): Promise<boolean> => {
    if (busy) return false;
    busy = true;
    try {
      const saved = await api.savePreference({ key: 'keyboard.bindings', value: next });
      bindings = saved.values['keyboard.bindings'];
      onChanged(bindings);
      paint();
      refreshShortcutLabels(root);
      setStatus(done, 'success');
      return true;
    } catch (error) {
      setStatus(errorMessage(error, KEYBOARD_STATUS_LINES.saveFailed), 'error');
      return false;
    } finally {
      busy = false;
    }
  };

  const endCapture = (): void => {
    stopCapture?.();
    stopCapture = null;
  };

  const beginCapture = (command: CommandDefinition, host: HTMLElement, rowButton: HTMLButtonElement): void => {
    endCapture();
    const panel = el('div', 'keyboard-capture');
    panel.dataset['keyboardCapture'] = command.id;
    const prompt = el('p', undefined, KEYBOARD_CAPTURE_PROMPT);
    const target = el('div', 'keyboard-capture-target');
    target.tabIndex = 0;
    target.setAttribute('role', 'textbox');
    target.setAttribute('aria-readonly', 'true');
    target.setAttribute('aria-label', keyboardCaptureName(command.name));
    const shown = el('p', 'keyboard-capture-chords');
    shown.setAttribute('aria-live', 'polite');
    const refusal = el('p', 'attention-note keyboard-refusal');
    refusal.setAttribute('role', 'alert');
    refusal.hidden = true;
    const actions = el('div', 'button-row');
    const apply = el('button', 'primary', KEYBOARD_CAPTURE_APPLY);
    apply.type = 'button';
    apply.disabled = true;
    const addStep = el('button', 'secondary', KEYBOARD_CAPTURE_ADD_STEP);
    addStep.type = 'button';
    addStep.disabled = true;
    const cancel = el('button', 'quiet', KEYBOARD_CAPTURE_CANCEL);
    cancel.type = 'button';
    actions.append(apply, addStep, cancel);
    panel.append(prompt, target, shown, refusal, actions);
    host.append(panel);

    let chords: Chord[] = [];
    let addStepPending = false;
    const currentText = (): string => chords.map(chordText).join(' ');
    const showRefusal = (message: string | null): void => {
      refusal.hidden = message === null;
      refusal.textContent = message ?? '';
    };
    const refresh = (): void => {
      shown.textContent = chords.length === 0 ? '' : keyboardCapturedLine(sequenceLabel(currentText(), platform));
      apply.disabled = chords.length === 0;
      addStep.disabled = chords.length === 0 || chords.length >= 2;
    };
    const listener = (event: KeyboardEvent): void => {
      if (document.activeElement !== target) return;
      if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) return;
      if (event.isComposing || event.keyCode === 229) {
        showRefusal(bindingRefusalLabel('ime-reserved', null, []));
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        finish(false);
        return;
      }
      const captured = captureChord(event, platform);
      if (captured === null) return;
      if ('refused' in captured) {
        showRefusal(bindingRefusalLabel(captured.refused, null, [], undefined));
        return;
      }
      const next = [...chords.slice(0, addStepPending ? 1 : 0), captured.chord];
      const check = checkBinding(command.id, next.map(chordText).join(' '), bindings, platform);
      // A single chord's own reservation is said at once; a conflict is said when the whole sequence is offered.
      if (!check.ok && (check.reason === 'editable-text' || check.reason === 'os-reserved' || check.reason === 'ime-reserved' || check.reason === 'unsupported-key')) {
        showRefusal(check.message);
        return;
      }
      showRefusal(null);
      chords = next;
      addStepPending = false;
      refresh();
    };
    window.addEventListener('keydown', listener, true);
    const close = (): void => {
      window.removeEventListener('keydown', listener, true);
      stopCapture = null;
      panel.remove();
      rowButton.disabled = false;
    };
    const finish = (applyIt: boolean): void => {
      close();
      if (applyIt) return;
      setStatus(KEYBOARD_STATUS_LINES.cancelled, 'success');
      rowButton.focus();
    };
    stopCapture = close;
    apply.addEventListener('click', () => {
      const text = currentText();
      const check = checkBinding(command.id, text, bindings, platform);
      if (!check.ok) {
        showRefusal(check.message);
        setStatus(check.message, 'error');
        target.focus();
        return;
      }
      void save(withBinding(bindings, command.id, text, platform), keyboardSavedLine(command.name, sequenceLabel(text, platform))).then((saved) => {
        if (saved) {
          finish(true);
          root.querySelector<HTMLButtonElement>(`[data-keyboard-change="${command.id}"]`)?.focus();
        }
        else target.focus();
      });
    });
    addStep.addEventListener('click', () => {
      addStepPending = true;
      showRefusal(null);
      shown.textContent = `${shown.textContent ?? ''} · ${KEYBOARD_CAPTURE_SECOND}`;
      target.focus();
    });
    cancel.addEventListener('click', () => finish(false));
    rowButton.disabled = true;
    setStatus(KEYBOARD_STATUS_LINES.capturing, 'busy');
    target.focus();
  };

  const commandRows = (body: HTMLElement, group: CommandDefinition['group']): void => {
    const heading = el('tr', 'keyboard-group');
    const headingCell = el('th', undefined, COMMAND_GROUP_NAMES[group]);
    headingCell.colSpan = 4;
    headingCell.scope = 'colgroup';
    heading.append(headingCell);
    body.append(heading);
    for (const command of COMMANDS.filter((entry) => entry.group === group)) {
      const row = el('tr');
      row.dataset['keyboardCommand'] = command.id;
      const name = el('th', undefined, command.name);
      name.scope = 'row';
      const chord = el('td', 'keyboard-chord');
      const label = el('kbd');
      label.dataset['shortcutCommand'] = command.id;
      label.dataset['shortcutText'] = 'true';
      label.textContent = shortcutLabel(command.id) ?? '';
      chord.append(label);
      if (isCustomized(command.id, bindings, platform)) chord.append(el('span', 'field-note keyboard-custom', ` ${KEYBOARD_CUSTOM_MARK}`));
      const actions = el('td');
      const change = el('button', 'secondary', KEYBOARD_CHANGE);
      change.type = 'button';
      change.dataset['keyboardChange'] = command.id;
      change.setAttribute('aria-label', keyboardChangeName(command.name));
      const reset = el('button', 'quiet', KEYBOARD_RESET_ONE);
      reset.type = 'button';
      reset.dataset['keyboardReset'] = command.id;
      reset.setAttribute('aria-label', keyboardResetName(command.name));
      reset.disabled = !isCustomized(command.id, bindings, platform);
      const captureHost = el('div', 'keyboard-capture-host');
      change.addEventListener('click', () => beginCapture(command, captureHost, change));
      reset.addEventListener('click', () => {
        endCapture();
        const next = withoutBinding(bindings, command.id);
        const check = checkBinding(command.id, command.defaults[platform], next, platform);
        if (!check.ok) {
          setStatus(check.message, 'error');
          return;
        }
        void save(next, keyboardResetLine(command.name, sequenceLabel(command.defaults[platform], platform)));
      });
      actions.append(change, reset, captureHost);
      row.append(name, el('td', undefined, COMMAND_CONTEXT_NAMES[command.context]), chord, actions);
      body.append(row);
    }
  };

  const paint = (): void => {
    endCapture();
    const grid = el('table', 'keyboard-table');
    const header = el('thead');
    const headerRow = el('tr');
    for (const heading of KEYBOARD_COLUMNS) {
      const cell = el('th', undefined, heading);
      cell.scope = 'col';
      headerRow.append(cell);
    }
    header.append(headerRow);
    const body = el('tbody');
    for (const group of ['navigation', 'search', 'view'] as const) commandRows(body, group);
    grid.append(el('caption', 'visually-hidden', KEYBOARD_SHORTCUTS_HEADING), header, body);
    const fixed = el('section', 'keyboard-fixed');
    fixed.append(el('h4', undefined, KEYBOARD_FIXED_HEADING));
    const list = el('ul');
    for (const entry of FIXED_COMMANDS) {
      const item = el('li');
      const label = el('kbd');
      label.dataset['shortcutCommand'] = entry.id;
      label.dataset['shortcutText'] = 'true';
      label.textContent = shortcutLabel(entry.id) ?? '';
      item.append(`${entry.name} · `, label);
      list.append(item);
    }
    fixed.append(list);
    table.replaceChildren(grid, fixed);
    resetAll.disabled = Object.keys(bindings).length === 0;
  };

  resetAll.addEventListener('click', () => {
    endCapture();
    void save(defaultBindings(), KEYBOARD_STATUS_LINES.savedAll);
  });

  const heading = el('h3', undefined, KEYBOARD_SHORTCUTS_HEADING);
  const actions = el('div', 'button-row');
  actions.append(resetAll);
  root.append(el('p', 'field-note keyboard-always-on', KEYBOARD_ALWAYS_ON), heading, el('p', 'field-note', KEYBOARD_LEDE), actions, table);
  void (async () => {
    setStatus(KEYBOARD_STATUS_LINES.loading, 'busy');
    try {
      bindings = validatedBindings((await api.getPreferences()).values['keyboard.bindings'], platform);
      // What the preference holds is what every label and the dispatcher read from here on.
      onChanged(bindings);
      paint();
      setStatus(KEYBOARD_STATUS_LINES.loaded, 'success');
    } catch (error) {
      setStatus(errorMessage(error, KEYBOARD_STATUS_LINES.loadFailed), 'error');
    }
  })();
  return endCapture;
}
