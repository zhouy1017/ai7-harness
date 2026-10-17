import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  PREFERENCE_DEFAULTS,
  PREFERENCE_KEYS,
  parsePreferenceValue,
  type PreferenceKey,
  type PreferenceValues,
  type PreferencesProjection,
  type SavePreferenceInput,
} from '../shared/preferences.js';

const ENVELOPE_VERSION = 1;

export class PreferencesError extends Error {
  constructor(readonly code: 'PREFERENCE_KEY_UNKNOWN' | 'PREFERENCE_VALUE_INVALID') {
    super(code);
  }
}

/**
 * The owner of `<userData>/preferences.json` (wave 11 seam map §2): local view/input configuration, one versioned envelope
 * `{ version: 1, values: {...} }`, written atomically. A value that does not validate for its key is dropped on read and refused
 * on save, so a damaged file reads as the defaults rather than failing the window.
 */
export class PreferencesStore {
  readonly #path: string;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async read(): Promise<PreferencesProjection> {
    return { values: await this.#load() };
  }

  /** Saves one key and answers the whole projection; writes are applied one after another. */
  save(input: SavePreferenceInput): Promise<PreferencesProjection> {
    if (input === null || typeof input !== 'object' || !(PREFERENCE_KEYS as readonly unknown[]).includes((input as { key: unknown }).key)) {
      return Promise.reject(new PreferencesError('PREFERENCE_KEY_UNKNOWN'));
    }
    const key = input.key as PreferenceKey;
    const value = parsePreferenceValue(key, input.value);
    if (value === null) return Promise.reject(new PreferencesError('PREFERENCE_VALUE_INVALID'));
    const run = this.#queue.then(async () => {
      const values = { ...(await this.#load()), [key]: value } as PreferenceValues;
      await this.#write(values);
      return { values } satisfies PreferencesProjection;
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #load(): Promise<PreferenceValues> {
    let text: string;
    try {
      text = await readFile(this.#path, 'utf8');
    } catch {
      return { ...PREFERENCE_DEFAULTS };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ...PREFERENCE_DEFAULTS };
    }
    const stored = parsed !== null && typeof parsed === 'object' && (parsed as { version?: unknown }).version === ENVELOPE_VERSION
      ? (parsed as { values?: unknown }).values
      : undefined;
    const source = stored !== null && typeof stored === 'object' ? stored as Record<string, unknown> : {};
    const values: Record<string, unknown> = { ...PREFERENCE_DEFAULTS };
    for (const key of PREFERENCE_KEYS) {
      if (!(key in source)) continue;
      const value = parsePreferenceValue(key, source[key]);
      if (value !== null) values[key] = value;
    }
    return values as unknown as PreferenceValues;
  }

  async #write(values: PreferenceValues): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify({ version: ENVELOPE_VERSION, values })}\n`, 'utf8');
      await rename(temporary, this.#path);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}
