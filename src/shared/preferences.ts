import type { GlobalAttentionTarget } from './protocol.js';

// Local view and input configuration (Issue #934, wave 11 slice 11a; seam map §2, decision T0-1): how this machine shows
// the workbench — the sidebar's collapsed state, the pinned and recently opened Books, and what later slices of the wave
// add (appearance, shortcut remaps, notification switches, usage unit prices). It is not a business record: the main
// process keeps it in `<userData>/preferences.json`, never in the database, and it travels in no manuscript, package or
// export, 导出数据库 included (KEY-012, VIS-009).
//
// `PREFERENCE_KEYS` is the one registry of keys, and it is append-only: a later slice adds its keys here with their
// validators and defaults, and never changes or removes one another slice declared.

import { isThemePreference, type ThemePreference } from './appearance.js';

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

/** One model route's price, as the editor typed it: never fetched from a Provider (Owner decision 15). */
export interface UnitPriceEntry {
  /** Currency units per one million input tokens. */
  inputPerMillion: number;
  /** Currency units per one million output tokens. */
  outputPerMillion: number;
  /** ISO 4217 code, upper case. */
  currency: string;
  /** The day the editor entered the price, `YYYY-MM-DD`. */
  enteredAt: string;
}

/** Route id → the editor's unit price for it. */
export type UnitPrices = Readonly<Record<string, UnitPriceEntry>>;

/** Command id → the chord sequence the editor chose instead of the default; absent means the default stands. */
export type KeyboardBindings = Readonly<Record<string, string>>;


export const MAX_UNIT_PRICE_ROUTES = 16;
export const MAX_UNIT_PRICE_PER_MILLION = 1_000_000;
export const MAX_KEYBOARD_BINDINGS = 64;

const ROUTE_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const ENTERED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const COMMAND_ID_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;
/** One to two chords: modifiers `Mod`, `Ctrl`, `Alt`, `Shift` in that order, then a key name. */
const CHORD_STEP = '(?:Mod\\+)?(?:Ctrl\\+)?(?:Alt\\+)?(?:Shift\\+)?[A-Za-z0-9]{1,16}';
const CHORD_SEQUENCE_PATTERN = new RegExp(`^${CHORD_STEP}(?: ${CHORD_STEP})?$`, 'u');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !ENTERED_ON_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_UNIT_PRICE_PER_MILLION;
}

/** `usage.unitPrices` as stored: a bounded table of exact entries, or `null` when anything is off. */
export function parseUnitPrices(value: unknown): UnitPrices | null {
  if (!isRecord(value)) return null;
  const routes = Object.keys(value);
  if (routes.length > MAX_UNIT_PRICE_ROUTES) return null;
  const parsed: Record<string, UnitPriceEntry> = {};
  for (const route of routes) {
    const entry = value[route];
    if (!ROUTE_ID_PATTERN.test(route) || !isRecord(entry)) return null;
    const keys = Object.keys(entry).sort().join(',');
    if (keys !== 'currency,enteredAt,inputPerMillion,outputPerMillion') return null;
    if (!validPrice(entry['inputPerMillion']) || !validPrice(entry['outputPerMillion'])) return null;
    if (typeof entry['currency'] !== 'string' || !CURRENCY_PATTERN.test(entry['currency'])) return null;
    if (!validDay(entry['enteredAt'])) return null;
    parsed[route] = {
      inputPerMillion: entry['inputPerMillion'],
      outputPerMillion: entry['outputPerMillion'],
      currency: entry['currency'],
      enteredAt: entry['enteredAt'],
    };
  }
  return parsed;
}

/** `keyboard.bindings` as stored: command id → a one- or two-step chord sequence. Whether a command exists is the registry's to say. */
export function parseKeyboardBindings(value: unknown): KeyboardBindings | null {
  if (!isRecord(value)) return null;
  const commands = Object.keys(value);
  if (commands.length > MAX_KEYBOARD_BINDINGS) return null;
  const parsed: Record<string, string> = {};
  for (const command of commands) {
    const chord = value[command];
    if (!COMMAND_ID_PATTERN.test(command) || typeof chord !== 'string' || !CHORD_SEQUENCE_PATTERN.test(chord)) return null;
    parsed[command] = chord;
  }
  return parsed;
}


// View-only presentation (Issue #951, wave 12 slice 12a; V2-UX-VIEW-001 to VIEW-012): how the workspace is spaced, how the
// manuscript is set for reading, and how wide the supporting regions are. Local rendering only: no value here is written into
// a manuscript, an export or a model context, and none changes what an action does (VIEW-006, VIEW-009).

/** Workspace Density Mode (VIEW-001): `standard` first; `compact` tightens navigation, tables, queues, filters and metadata only. */
export type WorkspaceDensity = 'standard' | 'compact';
/** Manuscript Reading Presets (VIEW-003): an editing rhythm and a reading rhythm, independent of density. */
export type ReadingPreset = 'editing' | 'reading';
/** The supported manuscript faces, each with a stable CJK fallback chain (VIEW-004). */
export type ManuscriptFontFamily = 'serif' | 'kai' | 'fangsong' | 'sans';
export type ManuscriptAlignment = 'start' | 'justify';

export interface ManuscriptTypography {
  readonly preset: ReadingPreset;
  readonly fontFamily: ManuscriptFontFamily;
  /** CSS pixels. */
  readonly fontSize: number;
  readonly lineHeight: number;
  /** Fullwidth characters per line. */
  readonly columnWidth: number;
  readonly alignment: ManuscriptAlignment;
}

/** The readable supported bounds of each adjustment (VIEW-004); a stored value outside them is not read. */
export const TYPOGRAPHY_BOUNDS = Object.freeze({
  fontSize: Object.freeze({ min: 14, max: 24, step: 1 }),
  lineHeight: Object.freeze({ min: 1.5, max: 2.4, step: 0.05 }),
  columnWidth: Object.freeze({ min: 24, max: 48, step: 1 }),
});

/** The two presets' starting values (VIEW-005: a Chinese serif around 17 px, line height 1.9–2.0, 30–38 characters a line). */
export const READING_PRESETS: Readonly<Record<ReadingPreset, Omit<ManuscriptTypography, 'preset'>>> = Object.freeze({
  editing: Object.freeze({ fontFamily: 'serif', fontSize: 17, lineHeight: 1.9, columnWidth: 38, alignment: 'start' }),
  reading: Object.freeze({ fontFamily: 'serif', fontSize: 18, lineHeight: 2, columnWidth: 32, alignment: 'justify' }),
});

export const DEFAULT_TYPOGRAPHY: ManuscriptTypography = Object.freeze({ preset: 'editing', ...READING_PRESETS.editing });

/** A supporting region that may be hidden and restored from `视图` (VIEW-010, VIEW-012); identity and status never are. */
export type OptionalRegion = 'position-rail';
export const OPTIONAL_REGIONS: ReadonlyArray<OptionalRegion> = Object.freeze(['position-rail']);

/** Region sizes in CSS pixels; `null` is the layout's own default, which follows the window as it always has. */
export interface LayoutRegions {
  readonly supportingWidth: number | null;
  readonly drawerWidth: number | null;
  readonly hidden: ReadonlyArray<OptionalRegion>;
}

/** Safe minimum and maximum of each resizable region (VIEW-007), the keyboard step, and the size a first drag starts from. */
export const REGION_BOUNDS = Object.freeze({
  supportingWidth: Object.freeze({ min: 256, max: 560, step: 16, initial: 336 }),
  drawerWidth: Object.freeze({ min: 320, max: 640, step: 16, initial: 416 }),
});

export const DEFAULT_LAYOUT_REGIONS: LayoutRegions = Object.freeze({ supportingWidth: null, drawerWidth: null, hidden: Object.freeze([]) });

function within(value: unknown, bounds: { readonly min: number; readonly max: number }): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= bounds.min && value <= bounds.max;
}

function exactKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function isWorkspaceDensity(value: unknown): value is WorkspaceDensity {
  return value === 'standard' || value === 'compact';
}

export function isManuscriptTypography(value: unknown): value is ManuscriptTypography {
  if (!isPlainObject(value) || !exactKeys(value, ['preset', 'fontFamily', 'fontSize', 'lineHeight', 'columnWidth', 'alignment'])) return false;
  return (value['preset'] === 'editing' || value['preset'] === 'reading') &&
    (value['fontFamily'] === 'serif' || value['fontFamily'] === 'kai' || value['fontFamily'] === 'fangsong' || value['fontFamily'] === 'sans') &&
    within(value['fontSize'], TYPOGRAPHY_BOUNDS.fontSize) && Number.isInteger(value['fontSize']) &&
    within(value['lineHeight'], TYPOGRAPHY_BOUNDS.lineHeight) &&
    within(value['columnWidth'], TYPOGRAPHY_BOUNDS.columnWidth) && Number.isInteger(value['columnWidth']) &&
    (value['alignment'] === 'start' || value['alignment'] === 'justify');
}

export function isLayoutRegions(value: unknown): value is LayoutRegions {
  if (!isPlainObject(value) || !exactKeys(value, ['supportingWidth', 'drawerWidth', 'hidden'])) return false;
  const hidden = value['hidden'];
  return (value['supportingWidth'] === null || (within(value['supportingWidth'], REGION_BOUNDS.supportingWidth) && Number.isInteger(value['supportingWidth']))) &&
    (value['drawerWidth'] === null || (within(value['drawerWidth'], REGION_BOUNDS.drawerWidth) && Number.isInteger(value['drawerWidth']))) &&
    Array.isArray(hidden) && hidden.length <= OPTIONAL_REGIONS.length && new Set(hidden).size === hidden.length &&
    hidden.every((region) => (OPTIONAL_REGIONS as ReadonlyArray<unknown>).includes(region));
}

const isUnitPrices = (value: unknown): value is UnitPrices => parseUnitPrices(value) !== null;
const isKeyboardBindings = (value: unknown): value is KeyboardBindings => parseKeyboardBindings(value) !== null;

export type AnalysisLastViewed = Readonly<Record<string, { revisionId: string; ordinal: number }>>;
const isAnalysisLastViewed = (value: unknown): value is AnalysisLastViewed => isPlainObject(value) && Object.keys(value).length <= 256 &&
  Object.entries(value).every(([bookId, revision]) => bookId.length > 0 && bookId.length <= MAX_SHELL_BOOK_ID_CHARACTERS && isPlainObject(revision) &&
    Object.keys(revision).length === 2 && typeof revision['revisionId'] === 'string' && revision['revisionId'].length > 0 && revision['revisionId'].length <= 64 &&
    Number.isSafeInteger(revision['ordinal']) && (revision['ordinal'] as number) > 0);

export type OnboardingState = null | 'skipped' | 'completed';

export function showOnboardingCard(hasBooks: boolean, state: OnboardingState): boolean {
  return !hasBooks && state === null;
}

export function showSampleGuidance(isSample: boolean, state: OnboardingState, hasBaseline: boolean): boolean {
  return isSample && !(state !== null && hasBaseline);
}

/** The overview reads baseline existence without asking to prepare or authorize analysis. */
export async function readSampleGuidance(isSample: boolean, state: OnboardingState, readBaseline: () => Promise<boolean>): Promise<boolean> {
  if (!isSample) return false;
  try {
    return showSampleGuidance(isSample, state, await readBaseline());
  } catch {
    // A new Book need not have an enabled workflow or model connection just to see navigation.
    return true;
  }
}

export type LearningAskFrequency = 'often' | 'occasionally' | 'off';
export const PREFERENCE_KEYS = Object.freeze({
  'usage.unitPrices': preference(isUnitPrices, {} as UnitPrices),
  'keyboard.bindings': preference(isKeyboardBindings, {} as KeyboardBindings),
  // 11a: the sidebar shows icons only while collapsed (IA-010); remembered across sessions.
  'shell.sidebarCollapsed': preference(isBoolean, false),
  // 11a: 置顶 Books, in the order they were pinned (IA-009); pinning changes no business record.
  'shell.pinnedBooks': preference(isBookList(MAX_PINNED_BOOKS, isPinnedEntry), [] as ReadonlyArray<ShellBookEntry>),
  // 11a: 最近打开 Books, most recent first, at most eight (IA-009); recency changes no business record.
  'shell.recentBooks': preference(isBookList(MAX_RECENT_BOOKS, isRecentEntry), [] as ReadonlyArray<ShellRecentBookEntry>),
  // 11b: 外观 — 跟随系统 (default) / 浅色 / 深色 (VIS-004); decoration only, read by no record, export or model context (VIS-009).
  'appearance.theme': preference(isThemePreference, 'system' as ThemePreference),
  // 11d: 设置 › 本机 › 通知 — four switches, all off by default (decision 16; NOTIF-005 to 007).
  'notifications.enabled': preference(isBoolean, false),
  'notifications.completions': preference(isBoolean, false),
  'notifications.sound': preference(isBoolean, false),
  'notifications.bookName': preference(isBoolean, false),
  // 12a: 设置 › 本机 › 外观 — Workspace Density Mode, 标准 by default (VIEW-001/002); spacing only, never content or authority.
  'editor.density': preference(isWorkspaceDensity, 'standard' as WorkspaceDensity),
  // 12a: the manuscript's reading preset and typography (VIEW-003 to VIEW-006); local rendering only.
  'editor.typography': preference(isManuscriptTypography, DEFAULT_TYPOGRAPHY),
  // 12a: Resizable Workspace Regions and Optional Surface Visibility (VIEW-007 to VIEW-012); 恢复默认布局 returns these defaults.
  'layout.regions': preference(isLayoutRegions, DEFAULT_LAYOUT_REGIONS),
  // 12b: the last analysis panel actually viewed for each Book, local UI state only.
  'analysis.lastViewedRevision': preference(isAnalysisLastViewed, {} as AnalysisLastViewed),
  'onboarding.state': preference((value: unknown): value is OnboardingState => value === null || value === 'skipped' || value === 'completed', null as OnboardingState),
  'learning.askFrequency': preference((value: unknown): value is LearningAskFrequency => value === 'often' || value === 'occasionally' || value === 'off', 'occasionally' as LearningAskFrequency),
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
