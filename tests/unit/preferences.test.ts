import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PreferencesError, PreferencesStore } from '../../src/main/preferences.js';
import { PREFERENCE_DEFAULTS, parseKeyboardBindings, parseUnitPrices } from '../../src/shared/preferences.js';

// Unit suite for the local preferences owner and its two slice-11c keys (Issue #936; wave 11 seam map §2): a versioned
// envelope written atomically, values validated on the way in and on the way out, a damaged file read as the defaults.

let root: string;
let path: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai7-preferences-'));
  path = join(root, 'preferences.json');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const price = { inputPerMillion: 2, outputPerMillion: 8, currency: 'CNY', enteredAt: '2026-10-17' };

describe('PreferencesStore', () => {
  it('reads the defaults before anything was saved', async () => {
    expect(await new PreferencesStore(path).read()).toEqual({ values: PREFERENCE_DEFAULTS });
  });

  it('saves one key at a time into a versioned envelope and reads it back after a restart', async () => {
    const store = new PreferencesStore(path);
    await store.save({ key: 'usage.unitPrices', value: { 'opencode-go': price } });
    const saved = await store.save({ key: 'keyboard.bindings', value: { 'nav.library': 'Mod+Shift+L' } });
    expect(saved.values).toEqual({ 'usage.unitPrices': { 'opencode-go': price }, 'keyboard.bindings': { 'nav.library': 'Mod+Shift+L' } });
    const file = JSON.parse(await readFile(path, 'utf8')) as { version: number; values: unknown };
    expect(file).toEqual({ version: 1, values: saved.values });
    expect((await new PreferencesStore(path).read()).values).toEqual(saved.values);
  });

  it('refuses an unknown key and a value that does not fit its key, leaving the file as it was', async () => {
    const store = new PreferencesStore(path);
    await store.save({ key: 'keyboard.bindings', value: { 'nav.library': 'Mod+Shift+L' } });
    const before = await readFile(path, 'utf8');
    await expect(store.save({ key: 'appearance' as never, value: 'dark' as never })).rejects.toMatchObject({ code: 'PREFERENCE_KEY_UNKNOWN' });
    await expect(store.save({ key: 'usage.unitPrices', value: { 'opencode-go': { ...price, outputPerMillion: -1 } } })).rejects.toBeInstanceOf(PreferencesError);
    await expect(store.save({ key: 'keyboard.bindings', value: { 'nav.library': 'not a chord' } })).rejects.toMatchObject({ code: 'PREFERENCE_VALUE_INVALID' });
    expect(await readFile(path, 'utf8')).toBe(before);
  });

  it('reads a damaged file, a foreign version and an invalid value as the defaults', async () => {
    await writeFile(path, '{not json', 'utf8');
    expect((await new PreferencesStore(path).read()).values).toEqual(PREFERENCE_DEFAULTS);
    await writeFile(path, JSON.stringify({ version: 2, values: { 'keyboard.bindings': { 'nav.library': 'Mod+L' } } }), 'utf8');
    expect((await new PreferencesStore(path).read()).values).toEqual(PREFERENCE_DEFAULTS);
    await writeFile(path, JSON.stringify({ version: 1, values: { 'keyboard.bindings': { 'nav.library': 'x y z' }, 'usage.unitPrices': { 'opencode-go': price } } }), 'utf8');
    expect((await new PreferencesStore(path).read()).values).toEqual({ ...PREFERENCE_DEFAULTS, 'usage.unitPrices': { 'opencode-go': price } });
  });

  it('applies concurrent saves one after another without losing a key', async () => {
    const store = new PreferencesStore(path);
    await Promise.all([
      store.save({ key: 'usage.unitPrices', value: { 'opencode-go': price } }),
      store.save({ key: 'keyboard.bindings', value: { 'nav.series': 'Mod+Shift+U' } }),
    ]);
    expect((await store.read()).values).toEqual({ 'usage.unitPrices': { 'opencode-go': price }, 'keyboard.bindings': { 'nav.series': 'Mod+Shift+U' } });
  });
});

describe('the slice-11c preference values', () => {
  it('accepts only exact unit-price entries: non-negative bounded numbers, an ISO currency and a real day', () => {
    expect(parseUnitPrices({ 'opencode-go': price })).toEqual({ 'opencode-go': price });
    expect(parseUnitPrices({})).toEqual({});
    for (const bad of [
      { ...price, currency: 'cny' }, { ...price, currency: 'RMB1' }, { ...price, inputPerMillion: Number.NaN },
      { ...price, inputPerMillion: 1_000_001 }, { ...price, enteredAt: '2026-02-30' }, { ...price, enteredAt: '2026-10-17T00:00:00Z' },
      { ...price, extra: 1 }, { inputPerMillion: 1, outputPerMillion: 1, currency: 'CNY' },
    ]) expect(parseUnitPrices({ 'opencode-go': bad }), JSON.stringify(bad)).toBeNull();
    expect(parseUnitPrices({ 'Bad Route': price })).toBeNull();
    expect(parseUnitPrices([price])).toBeNull();
  });

  it('accepts only chord sequences of one or two steps, keyed by a command id', () => {
    expect(parseKeyboardBindings({ 'nav.library': 'Mod+Alt+Shift+L', 'search.next': 'F3', 'nav.series': 'Mod+K Mod+B' })).not.toBeNull();
    for (const bad of ['', 'Mod+', 'Shift+Mod+L', 'Mod+L Mod+K Mod+B', 'Mod+L+K', 'mod+l ']) {
      expect(parseKeyboardBindings({ 'nav.library': bad }), bad).toBeNull();
    }
    expect(parseKeyboardBindings({ 'Nav Library': 'Mod+L' })).toBeNull();
    expect(parseKeyboardBindings({ 'nav.library': 5 })).toBeNull();
  });
});
