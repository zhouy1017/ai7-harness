import { afterEach, expect, it, vi } from 'vitest';
import { readActionDefaults, rememberActionDefaults } from '../../src/renderer/action-defaults.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';

afterEach(() => vi.unstubAllGlobals());

it('remembers scope kind without carrying chapter ids across Books or reimports', async () => {
  let defaults = { ...DEFAULT_QUICK_ACTIONS, reviewScope: 'chapters' as const,
    reviewFrom: 'old-book-chapter', reviewTo: 'old-import-chapter' };
  const savePreference = vi.fn(async ({ value }) => { defaults = value; });
  vi.stubGlobal('window', { ai7: { getPreferences: async () => ({ values: { 'actions.defaults': defaults } }), savePreference } });
  expect(await readActionDefaults()).toMatchObject({ reviewScope: 'chapters', reviewFrom: null, reviewTo: null });
  await rememberActionDefaults({ reviewFrom: 'another-book-chapter', reviewTo: 'another-import-chapter' });
  expect(savePreference).toHaveBeenCalledWith({ key: 'actions.defaults', value: {
    ...DEFAULT_QUICK_ACTIONS, reviewScope: 'chapters', reviewFrom: null, reviewTo: null,
  } });
});
