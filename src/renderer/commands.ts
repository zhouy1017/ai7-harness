import type { KeyboardBindings } from '../shared/preferences.js';
import {
  COMMAND_CONTEXT_NAMES,
  COMMAND_GROUP_NAMES,
  COMMAND_NAMES,
  shortcutHintLabel,
  IME_DEFERRED_ANNOUNCEMENT,
  bindingRefusalLabel,
  type BindingRefusalReason,
} from './commands-labels.js';

/**
 * The remappable command set and its one label source (Issue #936, plan slice 11c; V2-UX-KEY-001 to KEY-004, KEY-006, KEY-011,
 * KEY-012). Limited Shortcut Remapping applies only to declared navigation, search and view commands; editable-text,
 * OS-reserved and IME-reserved keys never are. No command here starts, adopts, designates, deletes or otherwise carries
 * authority: a command moves the editor to a place or focuses a control and nothing more (KEY-004).
 *
 * A binding is a sequence of one or two chords written `Mod+Alt+Shift+Key` — `Mod` is Ctrl on Windows and Command on macOS,
 * `Ctrl` is Control on macOS only — and a preference holds only the commands the editor changed; a missing entry stands for
 * the platform default. Everything that shows a chord asks `shortcutLabel`, so a remap is shown everywhere at once.
 */

export type CommandPlatform = 'win32' | 'darwin';
export type CommandContext = 'application' | 'book' | 'manuscript';
export type CommandGroup = 'navigation' | 'search' | 'view';

export interface CommandDefinition {
  readonly id: string;
  /** The exact Chinese action name, as menus and tooltips show it. */
  readonly name: string;
  readonly group: CommandGroup;
  /** Where the command acts; a conflict names these contexts. */
  readonly context: CommandContext;
  readonly defaults: Readonly<Record<CommandPlatform, string>>;
}

const both = (chord: string): Readonly<Record<CommandPlatform, string>> => ({ win32: chord, darwin: chord });

/** The Book sections a Book's window can move between; the order is the order of their default digits. */
export const BOOK_SECTION_COMMANDS = [
  ['nav.book.manuscript', COMMAND_NAMES['nav.book.manuscript'], 'manuscript'],
  ['nav.book.review', COMMAND_NAMES['nav.book.review'], 'review'],
  ['nav.book.evaluation', COMMAND_NAMES['nav.book.evaluation'], 'evaluation'],
  ['nav.book.deliverables', COMMAND_NAMES['nav.book.deliverables'], 'deliverables'],
  ['nav.book.findings', COMMAND_NAMES['nav.book.findings'], 'findings'],
  ['nav.book.analysis', COMMAND_NAMES['nav.book.analysis'], 'analysis'],
  ['nav.book.sources', COMMAND_NAMES['nav.book.sources'], 'sources'],
  ['nav.book.overview', COMMAND_NAMES['nav.book.overview'], 'overview'],
  ['nav.book.history', COMMAND_NAMES['nav.book.history'], 'history'],
] as const;

/** The remappable commands, in the order the settings table lists them. */
export const COMMANDS: readonly CommandDefinition[] = [
  { id: 'nav.attention', name: COMMAND_NAMES['nav.attention'], group: 'navigation', context: 'application', defaults: { win32: 'Alt+1', darwin: 'Mod+Alt+1' } },
  { id: 'nav.library', name: COMMAND_NAMES['nav.library'], group: 'navigation', context: 'application', defaults: { win32: 'Alt+2', darwin: 'Mod+Alt+2' } },
  { id: 'nav.series', name: COMMAND_NAMES['nav.series'], group: 'navigation', context: 'application', defaults: { win32: 'Alt+3', darwin: 'Mod+Alt+3' } },
  { id: 'nav.knowledge', name: COMMAND_NAMES['nav.knowledge'], group: 'navigation', context: 'application', defaults: { win32: 'Alt+4', darwin: 'Mod+Alt+4' } },
  { id: 'nav.quality', name: COMMAND_NAMES['nav.quality'], group: 'navigation', context: 'application', defaults: { win32: 'Alt+5', darwin: 'Mod+Alt+5' } },
  ...BOOK_SECTION_COMMANDS.map(([id, name], index): CommandDefinition => ({
    id, name, group: 'navigation', context: 'book',
    defaults: { win32: `Alt+Shift+${index + 1}`, darwin: `Mod+Alt+Shift+${index + 1}` },
  })),
  { id: 'nav.settings', name: COMMAND_NAMES['nav.settings'], group: 'navigation', context: 'application', defaults: both('Mod+Comma') },
  { id: 'view.toggleSidebar', name: COMMAND_NAMES['view.toggleSidebar'], group: 'view', context: 'application', defaults: both('Mod+Shift+B') },
  { id: 'nav.back', name: COMMAND_NAMES['nav.back'], group: 'navigation', context: 'application', defaults: { win32: 'Alt+ArrowLeft', darwin: 'Mod+BracketLeft' } },
  { id: 'search.find', name: COMMAND_NAMES['search.find'], group: 'search', context: 'manuscript', defaults: both('Mod+F') },
  { id: 'search.next', name: COMMAND_NAMES['search.next'], group: 'search', context: 'manuscript', defaults: { win32: 'F3', darwin: 'Mod+G' } },
  { id: 'search.previous', name: COMMAND_NAMES['search.previous'], group: 'search', context: 'manuscript', defaults: { win32: 'Shift+F3', darwin: 'Mod+Shift+G' } },
  { id: 'view.focusManuscript', name: COMMAND_NAMES['view.focusManuscript'], group: 'view', context: 'manuscript', defaults: both('Mod+Shift+M') },
  { id: 'view.openTasks', name: COMMAND_NAMES['view.openTasks'], group: 'view', context: 'book', defaults: both('Mod+Shift+T') },
  // 专注模式 (Issue #951, wave 12 slice 12a; ED-004): the manuscript's view command; Esc and the header's restore control leave it too.
  { id: 'view.focusMode', name: COMMAND_NAMES['view.focusMode'], group: 'view', context: 'manuscript', defaults: both('Mod+Shift+E') },
];

/**
 * The editing commands the text itself owns. They are shown with their chords and keep them: they take part in conflict
 * detection but are never remapped (KEY-001, KEY-002).
 */
export const FIXED_COMMANDS: readonly { readonly id: string; readonly name: string; readonly chord: Readonly<Record<CommandPlatform, string>> }[] = [
  { id: 'edit.save', name: COMMAND_NAMES['edit.save'], chord: both('Mod+S') },
  { id: 'edit.undo', name: COMMAND_NAMES['edit.undo'], chord: both('Mod+Z') },
  { id: 'edit.redo', name: COMMAND_NAMES['edit.redo'], chord: { win32: 'Mod+Shift+Z', darwin: 'Mod+Shift+Z' } },
  { id: 'edit.replace', name: COMMAND_NAMES['edit.replace'], chord: both('Mod+H') },
  { id: 'edit.previousWindow', name: COMMAND_NAMES['edit.previousWindow'], chord: both('PageUp') },
  { id: 'edit.nextWindow', name: COMMAND_NAMES['edit.nextWindow'], chord: both('PageDown') },
];

const COMMAND_BY_ID = new Map(COMMANDS.map((command) => [command.id, command] as const));
const FIXED_BY_ID = new Map(FIXED_COMMANDS.map((command) => [command.id, command] as const));

export function commandById(id: string): CommandDefinition | undefined {
  return COMMAND_BY_ID.get(id);
}

// ---- chords ----------------------------------------------------------------------------------------------------------

export interface Chord {
  /** Ctrl on Windows, Command on macOS. */
  readonly mod: boolean;
  /** Control on macOS; never set on Windows (Ctrl is `mod` there). */
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly key: string;
}

export function chordText(chord: Chord): string {
  return `${chord.mod ? 'Mod+' : ''}${chord.ctrl ? 'Ctrl+' : ''}${chord.alt ? 'Alt+' : ''}${chord.shift ? 'Shift+' : ''}${chord.key}`;
}

export function parseChord(text: string): Chord | null {
  const parts = text.split('+');
  const key = parts.pop();
  if (key === undefined || !/^[A-Za-z0-9]{1,16}$/u.test(key)) return null;
  if (!/^[A-Z0-9]$/u.test(key) && !/^F(?:[1-9]|1[0-2])$/u.test(key) && !Object.values(NAMED_KEYS).includes(key)) return null;
  const order = ['Mod', 'Ctrl', 'Alt', 'Shift'];
  let last = -1;
  const held = new Set<string>();
  for (const modifier of parts) {
    const at = order.indexOf(modifier);
    if (at <= last) return null;
    last = at;
    held.add(modifier);
  }
  return { mod: held.has('Mod'), ctrl: held.has('Ctrl'), alt: held.has('Alt'), shift: held.has('Shift'), key };
}

/** One or two chords; `null` for anything else. */
export function parseSequence(text: string): Chord[] | null {
  const steps = text.split(' ');
  if (steps.length < 1 || steps.length > 2) return null;
  const chords: Chord[] = [];
  for (const step of steps) {
    const chord = parseChord(step);
    if (chord === null) return null;
    chords.push(chord);
  }
  return chords;
}

export function sequenceText(chords: readonly Chord[]): string {
  return chords.map(chordText).join(' ');
}

/** The keys a chord may name, by `KeyboardEvent.code`; the stored spelling is the value. */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
  PageUp: 'PageUp', PageDown: 'PageDown', Home: 'Home', End: 'End',
  Enter: 'Enter', Escape: 'Escape', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  BracketLeft: 'BracketLeft', BracketRight: 'BracketRight', Comma: 'Comma', Period: 'Period', Slash: 'Slash', Semicolon: 'Semicolon',
  Quote: 'Quote', Minus: 'Minus', Equal: 'Equal', Backquote: 'Backquote', Backslash: 'Backslash',
};

export function keyOfCode(code: string): string | null {
  const letter = /^Key([A-Z])$/u.exec(code);
  if (letter) return letter[1]!;
  const digit = /^Digit([0-9])$/u.exec(code);
  if (digit) return digit[1]!;
  if (/^F(?:[1-9]|1[0-2])$/u.test(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

const MODIFIER_CODES = /^(?:Control|Shift|Alt|Meta|OS|AltGraph)(?:Left|Right)?$/u;

/**
 * The key a press names: its physical `code`, or — for a synthesized event that carries none, as the Journeys' key events do —
 * the `key` it typed. A real keyboard always supplies the code.
 */
function keyOfEvent(event: KeyEventLike): string | null {
  if (event.code !== '') return keyOfCode(event.code);
  if (/^[A-Za-z]$/u.test(event.key)) return event.key.toUpperCase();
  if (/^[0-9]$/u.test(event.key)) return event.key;
  if (event.key === ' ') return 'Space';
  if (/^F(?:[1-9]|1[0-2])$/u.test(event.key)) return event.key;
  return NAMED_KEYS[event.key] ?? null;
}

/** The slice of a keyboard event a chord is read from; a DOM `KeyboardEvent` satisfies it. */
export interface KeyEventLike {
  readonly code: string;
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly repeat?: boolean;
  readonly defaultPrevented?: boolean;
}

export type CapturedChord = { readonly chord: Chord } | { readonly refused: BindingRefusalReason };

/**
 * The chord a key press makes on this platform. A press of a modifier alone is no chord (`null`); the Windows key, a key
 * this registry has no name for, and AltGr are refused with their reason.
 */
export function captureChord(event: KeyEventLike, platform: CommandPlatform): CapturedChord | null {
  if (MODIFIER_CODES.test(event.code) || (event.code === '' && MODIFIER_CODES.test(event.key))) return null;
  const key = keyOfEvent(event);
  if (platform === 'win32' && event.metaKey) return { refused: 'os-reserved' };
  if (key === null) return { refused: 'unsupported-key' };
  const mod = platform === 'darwin' ? event.metaKey : event.ctrlKey;
  const ctrl = platform === 'darwin' ? event.ctrlKey : false;
  return { chord: { mod, ctrl, alt: event.altKey, shift: event.shiftKey, key } };
}

const SYMBOL_KEYS: Readonly<Record<string, string>> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.',
  Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\', Space: 'Space',
};

export function chordLabel(chord: Chord, platform: CommandPlatform): string {
  const parts: string[] = [];
  if (chord.mod) parts.push(platform === 'darwin' ? 'Command' : 'Ctrl');
  if (chord.ctrl) parts.push('Control');
  if (chord.alt) parts.push(platform === 'darwin' ? 'Option' : 'Alt');
  if (chord.shift) parts.push('Shift');
  parts.push(SYMBOL_KEYS[chord.key] ?? chord.key);
  return parts.join('+');
}

export function sequenceLabel(text: string, platform: CommandPlatform): string {
  const chords = parseSequence(text);
  return chords === null ? text : chords.map((chord) => chordLabel(chord, platform)).join(' ');
}

// ---- resolution and the one label source -----------------------------------------------------------------------------

/** The sequence a command answers to: the editor's own choice when they made one, else the platform default. */
export function effectiveSequence(commandId: string, bindings: KeyboardBindings, platform: CommandPlatform): string | null {
  const fixed = FIXED_BY_ID.get(commandId);
  if (fixed !== undefined) return fixed.chord[platform];
  const command = COMMAND_BY_ID.get(commandId);
  if (command === undefined) return null;
  return bindings[commandId] ?? command.defaults[platform];
}

export function isCustomized(commandId: string, bindings: KeyboardBindings, platform: CommandPlatform): boolean {
  const command = COMMAND_BY_ID.get(commandId);
  const chosen = bindings[commandId];
  return command !== undefined && chosen !== undefined && chosen !== command.defaults[platform];
}

/** What the preference keeps after a change: only the commands that differ from the platform default. */
export function normalizedBindings(bindings: KeyboardBindings, platform: CommandPlatform): KeyboardBindings {
  const kept: Record<string, string> = {};
  for (const [id, chosen] of Object.entries(bindings)) {
    const command = COMMAND_BY_ID.get(id);
    if (command !== undefined && chosen !== command.defaults[platform]) kept[id] = chosen;
  }
  return kept;
}

/** A stored preference cannot bypass key reservations or introduce ambiguous dispatch, including after defaults return. */
export function validatedBindings(bindings: KeyboardBindings, platform: CommandPlatform): KeyboardBindings {
  const kept = { ...normalizedBindings(bindings, platform) };
  let changed = true;
  while (changed) {
    changed = false;
    const invalid = Object.entries(kept).filter(([id, chord]) => !checkBinding(id, chord, kept, platform).ok).map(([id]) => id);
    for (const id of invalid) {
      delete kept[id];
      changed = true;
    }
  }
  return kept;
}

/** The label state every chord shown in the window is read from. */
let activePlatform: CommandPlatform = 'win32';
let activeBindings: KeyboardBindings = {};
const labelListeners = new Set<() => void>();

export function configureCommandLabels(platform: CommandPlatform, bindings: KeyboardBindings): void {
  activePlatform = platform;
  activeBindings = validatedBindings(bindings, platform);
  for (const listener of labelListeners) listener();
}

export function activeCommandBindings(): KeyboardBindings {
  return activeBindings;
}

export function commandPlatform(): CommandPlatform {
  return activePlatform;
}

export function onShortcutLabelsChanged(listener: () => void): () => void {
  labelListeners.add(listener);
  return () => labelListeners.delete(listener);
}

/** The chord a command is shown with right now, or `null` for a command that has none. */
export function shortcutLabel(commandId: string, platform: CommandPlatform = activePlatform, bindings: KeyboardBindings = activeBindings): string | null {
  const sequence = effectiveSequence(commandId, bindings, platform);
  return sequence === null ? null : sequenceLabel(sequence, platform);
}

/** A control's own words with its shortcut in the form the window has always used: `快捷键 Ctrl+S`. */
export function shortcutHint(commandId: string): string | null {
  const label = shortcutLabel(commandId);
  return label === null ? null : shortcutHintLabel(label);
}

/**
 * Elements that show a command's chord carry `data-shortcut-command`. `data-shortcut-text` marks a node whose whole text is
 * the chord; otherwise the chord is written into the element's `title`, after the words in `data-shortcut-base` when there
 * are any. Calling this again after a remap is what keeps no stale label beside an active command (KEY-011).
 */
export function refreshShortcutLabels(root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-shortcut-command]')) {
    const id = node.dataset['shortcutCommand'] ?? '';
    const label = shortcutLabel(id);
    if (node.dataset['shortcutText'] !== undefined) {
      node.textContent = label ?? '';
      continue;
    }
    const base = node.dataset['shortcutBase'];
    const hint = shortcutHint(id);
    if (hint === null) {
      if (base !== undefined) node.title = base;
    } else {
      node.title = base === undefined ? hint : `${base}（${hint}）`;
    }
  }
}

// ---- reserved keys and conflicts -------------------------------------------------------------------------------------

/** Keys a Ctrl/Command chord uses on the text itself: select, copy, cut, paste, undo, redo and moving the caret. */
const TEXT_EDITING_KEYS = new Set(['A', 'C', 'X', 'V', 'Y', 'Z', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
/** Keys that type, commit an input method's composition, or leave a field — with any modifier but Alt they stay the text's. */
const TYPING_KEYS = new Set(['Space', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Insert']);
const SYSTEM_FUNCTION_KEYS = new Set(['F1', 'F5', 'F10', 'F11', 'F12']);
const WINDOW_COMMAND_LETTERS = ['W', 'Q', 'N', 'R', 'P', 'O', 'T'];

/** Why a single chord may never be bound, or `null`. Judged on the platform's own conventions. */
export function reservedReason(chord: Chord, platform: CommandPlatform): BindingRefusalReason | null {
  const { mod, ctrl, alt, shift, key } = chord;
  const functionKey = /^F(?:[1-9]|1[0-2])$/u.test(key);
  const letter = key.length === 1 ? key.toUpperCase() : key;
  if (platform === 'win32' && ctrl) return 'unsupported-key';
  if (platform === 'win32' && alt && ['Tab', 'Escape', 'Space'].includes(key)) return 'os-reserved';
  if (platform === 'win32' && mod && key === 'Escape') return 'os-reserved';
  if (platform === 'darwin' && mod && (key === 'Tab' || (alt && key === 'Escape'))) return 'os-reserved';
  // Input-method keys decide how text is composed, whatever else is held.
  if (key === 'Space' && (mod || ctrl || shift)) return 'ime-reserved';
  if (platform === 'win32' && mod && key === 'Period') return 'ime-reserved';
  if (platform === 'win32' && alt && key === 'Backquote') return 'ime-reserved';
  if (functionKey) {
    if (SYSTEM_FUNCTION_KEYS.has(key)) return 'os-reserved';
    if (platform === 'win32' && alt && key === 'F4') return 'os-reserved';
    return null;
  }
  // A key without Ctrl, Command, Control or Alt types, or moves the caret.
  if (!mod && !ctrl && !alt) return 'editable-text';
  if (TYPING_KEYS.has(key) && !alt) return 'editable-text';
  if (mod && !alt && TEXT_EDITING_KEYS.has(letter)) return 'editable-text';
  if (platform === 'darwin' && ctrl && !mod && !alt && ['A', 'B', 'D', 'E', 'F', 'H', 'K', 'N', 'O', 'P', 'T', 'U', 'V', 'W', 'Y'].includes(letter)) return 'editable-text';
  // Ctrl+Alt is AltGr on many Windows keyboards, and Option alone types special characters on macOS.
  if (platform === 'win32' && mod && alt) return 'editable-text';
  if (platform === 'darwin' && alt && !mod && !ctrl && key !== 'Tab' && key !== 'Escape') return 'editable-text';
  if (platform === 'win32') {
    if (alt && (key === 'Tab' || key === 'Escape' || key === 'Space')) return 'os-reserved';
    if (mod && key === 'Escape') return 'os-reserved';
    if (mod && !alt && !shift && WINDOW_COMMAND_LETTERS.includes(letter)) return 'os-reserved';
  } else {
    if (mod && !alt && !shift && ['Q', 'H', 'M', 'W', 'N', 'R', 'P', 'O', 'T', 'Tab', 'Backquote'].includes(letter)) return 'os-reserved';
    if (mod && key === 'Tab') return 'os-reserved';
    if (mod && alt && key === 'Escape') return 'os-reserved';
    if (mod && !alt && shift && ['3', '4', '5'].includes(key)) return 'os-reserved';
    if (ctrl && !mod && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return 'os-reserved';
  }
  // System zoom stays the system's (`缩放不含`).
  if (mod && !alt && ['Equal', 'Minus', '0'].includes(key)) return 'os-reserved';
  return null;
}

/**
 * Whether two commands can be live together. The contexts nest — a manuscript sits inside its Book, and the application
 * around both — so every pair can be, and a conflict always names both contexts.
 */
export function contextsOverlap(_left: CommandContext, _right: CommandContext): boolean {
  return true;
}

export type BindingCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: BindingRefusalReason;
      /** The other command involved, when the refusal is a conflict. */
      readonly with: string | null;
      /** The contexts the refusal affects, named. */
      readonly contexts: readonly string[];
      readonly message: string;
    };

function startsWith(longer: readonly Chord[], shorter: readonly Chord[]): boolean {
  return shorter.length < longer.length && shorter.every((chord, index) => chordText(chord) === chordText(longer[index]!));
}

function equalSequences(left: readonly Chord[], right: readonly Chord[]): boolean {
  return left.length === right.length && left.every((chord, index) => chordText(chord) === chordText(right[index]!));
}

function refusal(reason: BindingRefusalReason, withName: string | null, contexts: readonly CommandContext[], detail?: string): BindingCheck {
  const names = [...new Set(contexts.map((context) => COMMAND_CONTEXT_NAMES[context]))];
  return { ok: false, reason, with: withName, contexts: names, message: bindingRefusalLabel(reason, withName, names, detail) };
}

/**
 * Whether a command may take a sequence: not reserved, not the same as another command's in an overlapping context, and not a
 * prefix of one or prefixed by one — an ambiguous binding is refused, not guessed at (KEY-003).
 */
export function checkBinding(commandId: string, text: string, bindings: KeyboardBindings, platform: CommandPlatform): BindingCheck {
  const command = COMMAND_BY_ID.get(commandId);
  if (command === undefined) return refusal('unknown-command', null, []);
  const sequence = parseSequence(text);
  if (sequence === null) return refusal('unsupported-key', null, [command.context]);
  for (const chord of sequence) {
    const reserved = reservedReason(chord, platform);
    if (reserved !== null) return refusal(reserved, null, [command.context], chordLabel(chord, platform));
  }
  const others: Array<{ name: string; context: CommandContext; sequence: Chord[] }> = [];
  for (const other of COMMANDS) {
    if (other.id === commandId) continue;
    const held = parseSequence(effectiveSequence(other.id, bindings, platform) ?? '');
    if (held !== null) others.push({ name: other.name, context: other.context, sequence: held });
  }
  for (const fixed of FIXED_COMMANDS) {
    const held = parseSequence(fixed.chord[platform]);
    if (held !== null) others.push({ name: fixed.name, context: 'manuscript', sequence: held });
  }
  for (const other of others) {
    if (!contextsOverlap(command.context, other.context)) continue;
    if (equalSequences(sequence, other.sequence)) return refusal('exact-conflict', other.name, [command.context, other.context]);
  }
  for (const other of others) {
    if (!contextsOverlap(command.context, other.context)) continue;
    if (startsWith(sequence, other.sequence) || startsWith(other.sequence, sequence)) {
      return refusal('prefix-conflict', other.name, [command.context, other.context]);
    }
  }
  return { ok: true };
}

/** The bindings after one command takes a sequence; the caller has checked it. */
export function withBinding(bindings: KeyboardBindings, commandId: string, text: string, platform: CommandPlatform): KeyboardBindings {
  return normalizedBindings({ ...bindings, [commandId]: text }, platform);
}

/** `恢复默认` for one command. */
export function withoutBinding(bindings: KeyboardBindings, commandId: string): KeyboardBindings {
  return Object.fromEntries(Object.entries(bindings).filter(([id]) => id !== commandId));
}

/** `恢复默认` for the whole section. */
export function defaultBindings(): KeyboardBindings {
  return {};
}

// ---- dispatch --------------------------------------------------------------------------------------------------------

export type CommandHandler = () => void | Promise<void>;

export interface CommandDispatcherOptions {
  readonly platform: CommandPlatform;
  readonly bindings: () => KeyboardBindings;
  /** Whether an input method's composition is open anywhere in the window (KEY-006). */
  readonly composing: () => boolean;
  readonly announce: (message: string) => void;
  /** How long a first chord waits for its second. */
  readonly sequenceWindowMs?: number;
}

export interface CommandDispatcher {
  /** Handlers by command id; a command with no handler on the current screen does nothing. */
  register(handlers: Readonly<Record<string, CommandHandler>>): () => void;
  /** The listener for the window's `keydown`. */
  handle(event: KeyEventLike & { preventDefault(): void }): void;
}

/**
 * Dispatches the remappable commands from key presses. The IME-safe Command Guard comes first and covers every command: while
 * a composition is open a press that would run (or begin) a command is held back, announced, and left to the input method
 * (KEY-006). A key some other handler already consumed is never dispatched twice, and a press that is no command's is left
 * entirely alone.
 */
export function createCommandDispatcher(options: CommandDispatcherOptions): CommandDispatcher {
  const handlers = new Map<string, CommandHandler>();
  const window_ = options.sequenceWindowMs ?? 1_500;
  let pending: { chord: string; at: number } | null = null;

  const run = (id: string): void => {
    const handler = handlers.get(id);
    if (handler === undefined) return;
    void Promise.resolve(handler()).catch(() => undefined);
  };

  const candidates = (): Array<{ id: string; sequence: Chord[] }> => {
    const bindings = validatedBindings(options.bindings(), options.platform);
    const found: Array<{ id: string; sequence: Chord[] }> = [];
    for (const command of COMMANDS) {
      if (!handlers.has(command.id)) continue;
      const sequence = parseSequence(effectiveSequence(command.id, bindings, options.platform) ?? '');
      if (sequence !== null) found.push({ id: command.id, sequence });
    }
    return found;
  };

  return {
    register(next) {
      const ids = Object.keys(next);
      for (const id of ids) handlers.set(id, next[id]!);
      return () => {
        for (const id of ids) if (handlers.get(id) === next[id]) handlers.delete(id);
      };
    },
    handle(event) {
      if (event.defaultPrevented === true) { pending = null; return; }
      const captured = captureChord(event, options.platform);
      if (captured === null || 'refused' in captured) return;
      const text = chordText(captured.chord);
      const now = Date.now();
      const first = pending !== null && now - pending.at <= window_ ? pending.chord : null;
      pending = null;
      const live = candidates();
      let matched: { id: string; sequence: Chord[] } | undefined;
      let begins = false;
      if (first !== null) {
        matched = live.find((candidate) => candidate.sequence.length === 2 && chordText(candidate.sequence[0]!) === first && chordText(candidate.sequence[1]!) === text);
      } else {
        matched = live.find((candidate) => candidate.sequence.length === 1 && chordText(candidate.sequence[0]!) === text);
        begins = matched === undefined && live.some((candidate) => candidate.sequence.length === 2 && chordText(candidate.sequence[0]!) === text);
      }
      if (matched === undefined && !begins) return;
      if (event.isComposing === true || event.keyCode === 229 || options.composing()) {
        event.preventDefault();
        options.announce(IME_DEFERRED_ANNOUNCEMENT);
        return;
      }
      event.preventDefault();
      if (event.repeat === true) return;
      if (matched !== undefined) run(matched.id);
      else pending = { chord: text, at: now };
    },
  };
}

export { COMMAND_GROUP_NAMES, COMMAND_CONTEXT_NAMES };
