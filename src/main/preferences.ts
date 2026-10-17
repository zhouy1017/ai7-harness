import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isPreferenceKey,
  PREFERENCE_ERRORS,
  PREFERENCE_KEYS,
  PREFERENCES_ENVELOPE_VERSION,
  PREFERENCES_FILE_NAME,
  PREFERENCES_NOTICES,
  preferenceDefaults,
  readPreferenceEnvelope,
  type PreferenceDefinition,
  type PreferencesEnvelope,
  type PreferencesProjection,
  type PreferenceValues,
} from '../shared/preferences.js';

// The owner of local view and input configuration (Issue #934, wave 11 slice 11a; seam map §2): one JSON file beside the
// shell's own data, `<userData>/preferences.json`, read once and rewritten whole on every change. It holds no business
// record and no secret, the service never reads it, and nothing exports it — 导出数据库 reads the database only.

/** A refusal the renderer is told in words: the IPC envelope carries `code` and `message` as they are. */
export class PreferenceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PreferenceError';
  }
}

export interface PreferenceStore {
  read(): PreferencesProjection;
  /** Validate one key's value and write the whole file atomically; nothing changes when either refuses. */
  save(input: unknown): PreferencesProjection;
}

/** The file system the store writes through; a test replaces a step to see a failed write leave the file as it was. */
export interface PreferenceFileSystem {
  readFile(path: string): string;
  writeDurably(path: string, text: string): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
}

const NODE_FILE_SYSTEM: PreferenceFileSystem = {
  readFile: (path) => readFileSync(path, 'utf8'),
  writeDurably: (path, text) => {
    const descriptor = openSync(path, 'wx');
    try {
      writeFileSync(descriptor, text, 'utf8');
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  },
  rename: (from, to) => renameSync(from, to),
  remove: (path) => rmSync(path, { force: true }),
};

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

export function createPreferenceStore(directory: string, files: PreferenceFileSystem = NODE_FILE_SYSTEM): PreferenceStore {
  const path = join(directory, PREFERENCES_FILE_NAME);
  let writes = 0;
  let current: { values: PreferenceValues; notice: string | null } | null = null;

  const load = (): { values: PreferenceValues; notice: string | null } => {
    if (current !== null) return current;
    let text: string | null = null;
    try {
      text = files.readFile(path);
    } catch (error) {
      // No file yet is the first launch: every key at its default, nothing to disclose. Any other failure is disclosed.
      current = { values: preferenceDefaults(), notice: isMissing(error) ? null : PREFERENCES_NOTICES.unreadable };
      return current;
    }
    let stored: unknown;
    try {
      stored = JSON.parse(text);
    } catch {
      current = { values: preferenceDefaults(), notice: PREFERENCES_NOTICES.unreadable };
      return current;
    }
    const reading = readPreferenceEnvelope(stored);
    const wholeEnvelopeLost = reading.damaged && !(typeof stored === 'object' && stored !== null && (stored as { version?: unknown }).version === PREFERENCES_ENVELOPE_VERSION);
    current = {
      values: reading.values,
      notice: !reading.damaged ? null : wholeEnvelopeLost ? PREFERENCES_NOTICES.unreadable : PREFERENCES_NOTICES.partlyInvalid,
    };
    return current;
  };

  const projection = (state: { values: PreferenceValues; notice: string | null }): PreferencesProjection =>
    Object.freeze({ version: PREFERENCES_ENVELOPE_VERSION, values: state.values, notice: state.notice });

  return {
    read: () => projection(load()),
    save: (input) => {
      const { key, value } = (typeof input === 'object' && input !== null ? input : {}) as { key?: unknown; value?: unknown };
      if (!isPreferenceKey(key)) throw new PreferenceError(PREFERENCE_ERRORS.unknownKey.code, PREFERENCE_ERRORS.unknownKey.message);
      const definition: PreferenceDefinition<unknown> = PREFERENCE_KEYS[key];
      if (!definition.validate(value)) throw new PreferenceError(PREFERENCE_ERRORS.invalidValue.code, PREFERENCE_ERRORS.invalidValue.message);
      const values = { ...load().values, [key]: value } as PreferenceValues;
      const envelope: PreferencesEnvelope = { version: PREFERENCES_ENVELOPE_VERSION, values };
      // Written beside the file and renamed over it: a reader sees the old file or the new one, never a part of either.
      writes += 1;
      const staged = `${path}.${process.pid}.${writes}.tmp`;
      try {
        files.writeDurably(staged, `${JSON.stringify(envelope, null, 2)}\n`);
        files.rename(staged, path);
      } catch {
        try {
          files.remove(staged);
        } catch {
          // The staged file is only ever renamed or removed; one left behind is never read.
        }
        throw new PreferenceError(PREFERENCE_ERRORS.writeFailed.code, PREFERENCE_ERRORS.writeFailed.message);
      }
      current = { values, notice: null };
      return projection(current);
    },
  };
}
