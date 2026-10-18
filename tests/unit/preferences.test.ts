import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPreferenceStore, PreferenceError, type PreferenceFileSystem } from '../../src/main/preferences.js';
import {
  MAX_RECENT_BOOKS,
  PREFERENCE_ERRORS,
  PREFERENCE_KEYS,
  PREFERENCES_FILE_NAME,
  PREFERENCES_NOTICES,
  preferenceDefaults,
  type PreferencesRendererApi,
} from '../../src/shared/preferences.js';
import { ShellPreferences } from '../../src/renderer/shell.js';

// Unit suite for the local preferences owner (Issue #934, wave 11 slice 11a; seam map §2): one file, written whole and
// atomically, keys and values validated against the shared registry, a damaged file read as defaults with a line to
// disclose — and pinning a Book reaching that file and nothing else: no service operation, no database byte.

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-preferences-test-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

const BOOK = { bookId: '6f1c2c1e-0f9f-4a63-9a43-0a4d0d5c1b11', title: 'sample1' } as const;

async function stored(): Promise<unknown> {
  return JSON.parse(await readFile(join(sandbox, PREFERENCES_FILE_NAME), 'utf8'));
}

function refusal(operation: () => unknown): PreferenceError {
  try {
    operation();
  } catch (error) {
    if (error instanceof PreferenceError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('the preferences registry', () => {
  it('persists every notification switch in the existing preference file across restart', () => {
    const store = createPreferenceStore(sandbox);
    const keys = ['notifications.enabled', 'notifications.completions', 'notifications.sound', 'notifications.bookName'] as const;
    for (const key of keys) store.save({ key, value: true });
    const restarted = createPreferenceStore(sandbox);
    for (const key of keys) expect(restarted.read().values[key]).toBe(true);
  });
  it('declares the shell keys with their defaults, and each default passes its own validator', () => {
    expect(Object.keys(PREFERENCE_KEYS)).toEqual(['usage.unitPrices', 'keyboard.bindings', 'shell.sidebarCollapsed', 'shell.pinnedBooks', 'shell.recentBooks', 'appearance.theme',
      'notifications.enabled', 'notifications.completions', 'notifications.sound', 'notifications.bookName', 'editor.density', 'editor.typography', 'layout.regions', 'analysis.lastViewedRevision', 'onboarding.state']);
    expect(preferenceDefaults()).toEqual({ 'usage.unitPrices': {}, 'keyboard.bindings': {}, 'shell.sidebarCollapsed': false, 'shell.pinnedBooks': [], 'shell.recentBooks': [], 'appearance.theme': 'system',
      'notifications.enabled': false, 'notifications.completions': false, 'notifications.sound': false, 'notifications.bookName': false,
      'editor.density': 'standard',
      'editor.typography': { preset: 'editing', fontFamily: 'serif', fontSize: 17, lineHeight: 1.9, columnWidth: 38, alignment: 'start' },
      'layout.regions': { supportingWidth: null, drawerWidth: null, hidden: [] }, 'analysis.lastViewedRevision': {}, 'onboarding.state': null });
    for (const definition of Object.values(PREFERENCE_KEYS)) expect(definition.validate(definition.default)).toBe(true);
  });

  it('refuses malformed Book lists: extra fields, duplicates, unknown sections and too many recent Books', () => {
    const pinned = PREFERENCE_KEYS['shell.pinnedBooks'];
    const recent = PREFERENCE_KEYS['shell.recentBooks'];
    expect(pinned.validate([BOOK])).toBe(true);
    expect(pinned.validate([{ ...BOOK, extra: 1 }])).toBe(false);
    expect(pinned.validate([BOOK, BOOK])).toBe(false);
    expect(pinned.validate([{ bookId: '', title: 'x' }])).toBe(false);
    expect(recent.validate([{ ...BOOK, section: 'manuscript' }])).toBe(true);
    expect(recent.validate([{ ...BOOK, section: 'elsewhere' }])).toBe(false);
    const many = Array.from({ length: MAX_RECENT_BOOKS + 1 }, (_, index) => ({ bookId: `book-${index}`, title: `第 ${index} 本`, section: 'overview' }));
    expect(recent.validate(many)).toBe(false);
    expect(recent.validate(many.slice(0, MAX_RECENT_BOOKS))).toBe(true);
  });
});

describe('createPreferenceStore', () => {
  it('reads defaults with nothing to disclose before the first save', () => {
    const store = createPreferenceStore(sandbox);
    expect(store.read()).toEqual({ version: 1, values: preferenceDefaults(), notice: null });
  });

  it('writes the versioned envelope whole, through a staged file renamed over the file', async () => {
    const store = createPreferenceStore(sandbox);
    const saved = store.save({ key: 'shell.sidebarCollapsed', value: true });
    expect(saved.values['shell.sidebarCollapsed']).toBe(true);
    expect(await stored()).toEqual({ version: 1, values: { ...preferenceDefaults(), 'shell.sidebarCollapsed': true } });
    // Nothing staged is left beside it.
    expect(await readdir(sandbox)).toEqual([PREFERENCES_FILE_NAME]);
    // A second store over the same directory reads what the first wrote.
    expect(createPreferenceStore(sandbox).read().values['shell.sidebarCollapsed']).toBe(true);
  });

  it('keeps the old file whole when the write fails before the rename', async () => {
    const store = createPreferenceStore(sandbox);
    store.save({ key: 'shell.pinnedBooks', value: [BOOK] });
    const before = await readFile(join(sandbox, PREFERENCES_FILE_NAME), 'utf8');
    const removed: string[] = [];
    const failing: PreferenceFileSystem = {
      readFile: (path) => { throw Object.assign(new Error(path), { code: 'ENOENT' }); },
      writeDurably: () => { throw new Error('disk full'); },
      rename: () => { throw new Error('never reached'); },
      remove: (path) => removed.push(path),
    };
    const broken = createPreferenceStore(sandbox, failing);
    const error = refusal(() => broken.save({ key: 'shell.sidebarCollapsed', value: true }));
    expect(error.code).toBe(PREFERENCE_ERRORS.writeFailed.code);
    expect(removed).toHaveLength(1);
    expect(await readFile(join(sandbox, PREFERENCES_FILE_NAME), 'utf8')).toBe(before);
    expect(broken.read().values['shell.sidebarCollapsed']).toBe(false);
  });

  it('refuses an unknown key and an invalid value, and writes nothing for either', async () => {
    const store = createPreferenceStore(sandbox);
    expect(refusal(() => store.save({ key: 'shell.unknown', value: true })).code).toBe(PREFERENCE_ERRORS.unknownKey.code);
    expect(refusal(() => store.save({ key: 'toString', value: true })).code).toBe(PREFERENCE_ERRORS.unknownKey.code);
    expect(refusal(() => store.save({ key: 'shell.sidebarCollapsed', value: 'yes' })).code).toBe(PREFERENCE_ERRORS.invalidValue.code);
    expect(refusal(() => store.save({ key: 'shell.pinnedBooks', value: [{ bookId: BOOK.bookId }] })).code).toBe(PREFERENCE_ERRORS.invalidValue.code);
    expect(refusal(() => store.save(null)).code).toBe(PREFERENCE_ERRORS.unknownKey.code);
    expect(await readdir(sandbox)).toEqual([]);
    expect(store.read().values).toEqual(preferenceDefaults());
  });

  it('reads a corrupted file as defaults and discloses it, until the next save rewrites it', async () => {
    await writeFile(join(sandbox, PREFERENCES_FILE_NAME), '{"version": 1, "values": {', 'utf8');
    const store = createPreferenceStore(sandbox);
    expect(store.read()).toEqual({ version: 1, values: preferenceDefaults(), notice: PREFERENCES_NOTICES.unreadable });
    const saved = store.save({ key: 'shell.sidebarCollapsed', value: true });
    expect(saved.notice).toBeNull();
    expect(await stored()).toEqual({ version: 1, values: { ...preferenceDefaults(), 'shell.sidebarCollapsed': true } });
  });

  it('discloses unknown stored keys and never returns them to the renderer', async () => {
    await writeFile(join(sandbox, PREFERENCES_FILE_NAME), JSON.stringify({ version: 1, values: { 'unknown.setting': true } }), 'utf8');
    const reading = createPreferenceStore(sandbox).read();
    expect(reading.values).toEqual(preferenceDefaults());
    expect(reading.notice).toBe(PREFERENCES_NOTICES.partlyInvalid);
  });

  it('reads an envelope of another version as defaults, and keeps the valid keys of a partly invalid one', async () => {
    await writeFile(join(sandbox, PREFERENCES_FILE_NAME), JSON.stringify({ version: 2, values: { 'shell.sidebarCollapsed': true } }), 'utf8');
    expect(createPreferenceStore(sandbox).read()).toEqual({ version: 1, values: preferenceDefaults(), notice: PREFERENCES_NOTICES.unreadable });
    await writeFile(join(sandbox, PREFERENCES_FILE_NAME), JSON.stringify({
      version: 1,
      values: { 'shell.sidebarCollapsed': true, 'shell.pinnedBooks': 'not a list', 'later.slice': { kept: false } },
    }), 'utf8');
    const reading = createPreferenceStore(sandbox).read();
    expect(reading.values).toEqual({ ...preferenceDefaults(), 'shell.sidebarCollapsed': true });
    expect(reading.notice).toBe(PREFERENCES_NOTICES.partlyInvalid);
  });
});

describe('pinning and recency through ShellPreferences', () => {
  it('reach only the two preference members: the database is byte-identical and no service operation is called', async () => {
    const shellDirectory = join(sandbox, 'shell');
    await (await import('node:fs/promises')).mkdir(shellDirectory);
    const databasePath = join(sandbox, 'ai7.sqlite');
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE books (book_id TEXT PRIMARY KEY, title TEXT NOT NULL); INSERT INTO books VALUES ('6f1c2c1e-0f9f-4a63-9a43-0a4d0d5c1b11', 'sample1');");
    database.close();
    const before = await readFile(databasePath);

    const store = createPreferenceStore(shellDirectory);
    const called: string[] = [];
    const preferencesApi: PreferencesRendererApi = {
      getPreferences: async () => { called.push('getPreferences'); return store.read(); },
      savePreference: async (input) => { called.push('savePreference'); return store.save(input); },
    };
    // Every other member of the renderer API is a service operation; touching any one of them fails the case.
    const api = new Proxy(preferencesApi, {
      get: (target, property) => {
        if (property === 'getPreferences' || property === 'savePreference' || property === 'then') return Reflect.get(target, property);
        throw new Error(`service operation called: ${String(property)}`);
      },
    });
    const shell = new ShellPreferences(api);
    await shell.load();
    await shell.togglePin(BOOK, 20);
    await shell.visit({ ...BOOK, section: 'manuscript' });
    await shell.visit({ ...BOOK, section: 'manuscript' });
    await shell.togglePin(BOOK, 20);
    await shell.togglePin(BOOK, 20);
    await shell.setCollapsed(true);

    expect(new Set(called)).toEqual(new Set(['getPreferences', 'savePreference']));
    expect(await readFile(databasePath)).toEqual(before);
    expect(shell.current).toEqual({
      ...preferenceDefaults(),
      'shell.sidebarCollapsed': true,
      'shell.pinnedBooks': [BOOK],
      'shell.recentBooks': [{ ...BOOK, section: 'manuscript' }],
      'appearance.theme': 'system',
    });
    expect(store.read().values).toEqual(shell.current);
    // The repeated visit to the same place wrote nothing more: five saves for five changes.
    expect(called.filter((name) => name === 'savePreference')).toHaveLength(5);
  });

  it('writes a list from the latest stored list, so another window\'s visit is kept', async () => {
    const store = createPreferenceStore(sandbox);
    const api: PreferencesRendererApi = { getPreferences: async () => store.read(), savePreference: async (input) => store.save(input) };
    const first = new ShellPreferences(api);
    const second = new ShellPreferences(api);
    await first.load();
    await second.load();
    await first.visit({ bookId: 'book-a', title: '甲', section: 'review' });
    await second.visit({ bookId: 'book-b', title: '乙', section: 'overview' });
    expect(store.read().values['shell.recentBooks'].map((entry) => entry.bookId)).toEqual(['book-b', 'book-a']);
  });

  it('remembers only an actually viewed analysis revision, keeps other Books and never moves backwards', async () => {
    const store = createPreferenceStore(sandbox);
    const api: PreferencesRendererApi = { getPreferences: async () => store.read(), savePreference: async (input) => store.save(input) };
    const first = new ShellPreferences(api);
    const second = new ShellPreferences(api);
    await first.load(); await second.load();
    await first.viewAnalysis('book-a', { revisionId: 'revision-2', ordinal: 2 });
    await second.viewAnalysis('book-b', { revisionId: 'revision-1', ordinal: 1 });
    await second.viewAnalysis('book-a', { revisionId: 'revision-1', ordinal: 1 });
    expect(store.read().values['analysis.lastViewedRevision']).toEqual({
      'book-a': { revisionId: 'revision-2', ordinal: 2 }, 'book-b': { revisionId: 'revision-1', ordinal: 1 },
    });
    const restarted = new ShellPreferences(api); await restarted.load();
    expect(restarted.current['analysis.lastViewedRevision']).toEqual(store.read().values['analysis.lastViewedRevision']);
  });
});
