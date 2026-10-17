import type { GlobalAttentionTarget } from './protocol.js';

// Local view and input configuration (Issue #934, wave 11 slice 11a; seam map §2, decision T0-1): how this machine shows
// the workbench — the sidebar's collapsed state, the pinned and recently opened Books, and what later slices of the wave
// add (appearance, shortcut remaps, notification switches, usage unit prices). It is not a business record: the main
// process keeps it in `<userData>/preferences.json`, never in the database, and it travels in no manuscript, package or
// export, 导出数据库 included (KEY-012, VIS-009).
//
// `PREFERENCE_KEYS` is the one registry of keys, and it is append-only: a later slice adds its keys here with their
// validators and defaults, and never changes or removes one another slice declared.

/** One declared key: what a stored value must be, and the value read when none is stored or the stored one is invalid. */
export interface PreferenceDefinition<Value> {
  validate(value: unknown): value is Value;
  readonly default: Value;
}

function preference<Value>(validate: (value: unknown) => value is Value, fallback: Value): PreferenceDefinition<Value> {
  return Object.freeze({ validate, default: fallback });
}

/** The Book sections of the sidebar's current-Book groups (IA-012): where a recently opened Book was last seen. */
export const SHELL_BOOK_SECTIONS = Object.freeze([
  'manuscript',
  'review',
  'evaluation',
  'deliverables',
  'findings',
  'analysis',
  'sources',
  'overview',
  'history',
] as const);
export type ShellBookSection = (typeof SHELL_BOOK_SECTIONS)[number];

/** A pinned Book: its identity and the title it was pinned under. */
export interface ShellBookEntry {
  readonly bookId: string;
  readonly title: string;
}

/** A recently opened Book: as pinned, with the section it was last seen in, its one-line state. */
export interface ShellRecentBookEntry extends ShellBookEntry {
  readonly section: ShellBookSection;
}

export const MAX_PINNED_BOOKS = 20;
export const MAX_RECENT_BOOKS = 8;
/** A stored Book id is the service's identifier: short, plain text. */
export const MAX_SHELL_BOOK_ID_CHARACTERS = 64;
export const MAX_SHELL_BOOK_TITLE_CHARACTERS = 200;

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isBookEntry(value: unknown, keys: ReadonlyArray<string>): value is ShellBookEntry {
  if (!isPlainObject(value)) return false;
  if (Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return false;
  const { bookId, title } = value;
  return typeof bookId === 'string' && bookId.length > 0 && bookId.length <= MAX_SHELL_BOOK_ID_CHARACTERS && bookId.trim() === bookId &&
    typeof title === 'string' && title.length > 0 && title.length <= MAX_SHELL_BOOK_TITLE_CHARACTERS;
}

function isBookList<Entry extends ShellBookEntry>(limit: number, entry: (value: unknown) => value is Entry) {
  return (value: unknown): value is ReadonlyArray<Entry> =>
    Array.isArray(value) && value.length <= limit && value.every(entry) && new Set(value.map((item: Entry) => item.bookId)).size === value.length;
}

const isPinnedEntry = (value: unknown): value is ShellBookEntry => isBookEntry(value, ['bookId', 'title']);
const isRecentEntry = (value: unknown): value is ShellRecentBookEntry =>
  isBookEntry(value, ['bookId', 'title', 'section']) && (SHELL_BOOK_SECTIONS as ReadonlyArray<unknown>).includes((value as { section?: unknown }).section);

export const PREFERENCE_KEYS = Object.freeze({
  // 11a: the sidebar shows icons only while collapsed (IA-010); remembered across sessions.
  'shell.sidebarCollapsed': preference(isBoolean, false),
  // 11a: 置顶 Books, in the order they were pinned (IA-009); pinning changes no business record.
  'shell.pinnedBooks': preference(isBookList(MAX_PINNED_BOOKS, isPinnedEntry), [] as ReadonlyArray<ShellBookEntry>),
  // 11a: 最近打开 Books, most recent first, at most eight (IA-009); recency changes no business record.
  'shell.recentBooks': preference(isBookList(MAX_RECENT_BOOKS, isRecentEntry), [] as ReadonlyArray<ShellRecentBookEntry>),
  'notifications.enabled': preference(isBoolean, false),
  'notifications.completions': preference(isBoolean, false),
  'notifications.sound': preference(isBoolean, false),
  'notifications.bookName': preference(isBoolean, false),
});

export type PreferenceKey = keyof typeof PREFERENCE_KEYS;
export type PreferenceValue<Key extends PreferenceKey> = (typeof PREFERENCE_KEYS)[Key] extends PreferenceDefinition<infer Value> ? Value : never;
export type PreferenceValues = { readonly [Key in PreferenceKey]: PreferenceValue<Key> };

export const PREFERENCES_FILE_NAME = 'preferences.json';
export const PREFERENCES_ENVELOPE_VERSION = 1;

/** The stored file: `{ version: 1, values }`, the values keyed as declared. */
export interface PreferencesEnvelope {
  readonly version: typeof PREFERENCES_ENVELOPE_VERSION;
  readonly values: Partial<Record<PreferenceKey, unknown>>;
}

/** What the renderer reads: every declared key with its value, and a line to disclose when the stored file was not usable. */
export interface PreferencesProjection {
  readonly version: typeof PREFERENCES_ENVELOPE_VERSION;
  readonly values: PreferenceValues;
  readonly notice: string | null;
}

export interface SavePreferenceInput<Key extends PreferenceKey = PreferenceKey> {
  readonly key: Key;
  readonly value: PreferenceValue<Key>;
}

/** The two preload members (`window.ai7.getPreferences()` / `savePreference({ key, value })`), main-owned, no service op. */
export interface PreferencesRendererApi {
  getPreferences(): Promise<PreferencesProjection>;
  savePreference<Key extends PreferenceKey>(input: SavePreferenceInput<Key>): Promise<PreferencesProjection>;
}

/** Main-only notification navigation; no service protocol operation or record mutation. */
export interface NotificationsRendererApi {
  notify(input: { bookId: string | null; eventId: string }): Promise<void>;
  onNotificationNavigate(listener: (target: NotificationNavigation) => void): () => void;
}

export interface NotificationNavigation {
  readonly bookId: string | null;
  readonly eventId: string | null;
  /** Captured from the authoritative projection, so a single record still opens after leaving recent attention. */
  readonly target?: GlobalAttentionTarget;
}

/** The main process's IPC channels for the two members; they are not service operations and carry no protocol number. */
export const PREFERENCE_IPC_CHANNELS = Object.freeze({
  getPreferences: 'ai7:preferences:get',
  savePreference: 'ai7:preferences:save',
});

export { PREFERENCE_ERRORS, PREFERENCES_NOTICES } from './preferences-labels.js';

export function isPreferenceKey(key: unknown): key is PreferenceKey {
  return typeof key === 'string' && Object.hasOwn(PREFERENCE_KEYS, key);
}

export function preferenceDefaults(): PreferenceValues {
  return Object.fromEntries(Object.entries(PREFERENCE_KEYS).map(([key, definition]) => [key, definition.default])) as unknown as PreferenceValues;
}

/**
 * The values a stored envelope holds: each declared key's value when it validates, its default otherwise. A key the file
 * holds and the registry does not declare is not read. `damaged` says whether anything stored was dropped.
 */
export function readPreferenceEnvelope(stored: unknown): { values: PreferenceValues; damaged: boolean } {
  const values: Record<string, unknown> = { ...preferenceDefaults() };
  if (!isPlainObject(stored) || stored['version'] !== PREFERENCES_ENVELOPE_VERSION || !isPlainObject(stored['values'])) {
    return { values: values as unknown as PreferenceValues, damaged: true };
  }
  const held = stored['values'];
  let damaged = Object.keys(held).some((key) => !isPreferenceKey(key));
  for (const [key, definition] of Object.entries(PREFERENCE_KEYS) as Array<[PreferenceKey, PreferenceDefinition<unknown>]>) {
    if (!Object.hasOwn(held, key)) continue;
    if (definition.validate(held[key])) values[key] = held[key];
    else damaged = true;
  }
  return { values: values as unknown as PreferenceValues, damaged };
}
