/**
 * Local view/input preferences (wave 11 seam map §2): configuration the main process keeps in `<userData>/preferences.json` and
 * the window reads through `window.ai7.getPreferences()` / `window.ai7.savePreference({ key, value })`. A preference is not a
 * business record: it travels in no manuscript, Delivery Package or export (V2-UX-KEY-012, V2-UX-VIS-009).
 *
 * The key registry is append-only: each slice adds its own keys here and a validator for the value it stores. Slice 11c (Issue
 * #936) owns `usage.unitPrices` and `keyboard.bindings`.
 */

export const PREFERENCE_KEYS = ['usage.unitPrices', 'keyboard.bindings'] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

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

export interface PreferenceValues {
  'usage.unitPrices': UnitPrices;
  'keyboard.bindings': KeyboardBindings;
}

export const PREFERENCE_DEFAULTS: PreferenceValues = {
  'usage.unitPrices': {},
  'keyboard.bindings': {},
};

export interface PreferencesProjection {
  values: PreferenceValues;
}

export type SavePreferenceInput = {
  [K in PreferenceKey]: { key: K; value: PreferenceValues[K] };
}[PreferenceKey];

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

export function isPreferenceKey(value: unknown): value is PreferenceKey {
  return typeof value === 'string' && (PREFERENCE_KEYS as readonly string[]).includes(value);
}

/** The value a key holds when it is well-formed for that key; `null` when it is not (the caller refuses or falls back). */
export function parsePreferenceValue<K extends PreferenceKey>(key: K, value: unknown): PreferenceValues[K] | null {
  switch (key) {
    case 'usage.unitPrices':
      return parseUnitPrices(value) as PreferenceValues[K] | null;
    case 'keyboard.bindings':
      return parseKeyboardBindings(value) as PreferenceValues[K] | null;
    default:
      return null;
  }
}
