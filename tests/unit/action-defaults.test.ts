import { afterEach, expect, it, vi } from 'vitest';
import { readActionDefaults, readEvidenceAssuranceLevel, rememberActionDefaults, rememberEvidenceAssuranceLevel } from '../../src/renderer/action-defaults.js';
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

it.each([['quick', 'quick'], ['strict', 'strict'], ['highest', 'standard'], [undefined, 'standard'], [3, 'standard']])('reads the remembered 核查力度 %s as %s', async (stored, expected) => {
  vi.stubGlobal('window', { ai7: { getPreferences: async () => ({ values: { 'review.evidenceAssuranceLevel': stored } }) } });
  expect(await readEvidenceAssuranceLevel()).toBe(expected);
});

it('writes the 核查力度 after an action-defaults write that is still in flight, and keeps the chain alive after a failed write', async () => {
  const order: string[] = [];
  let failNext = true;
  const savePreference = vi.fn(async ({ key }: { key: string }) => {
    order.push(key);
    if (key === 'review.evidenceAssuranceLevel' && failNext) { failNext = false; throw new Error('synthetic write failure'); }
  });
  vi.stubGlobal('window', { ai7: { getPreferences: async () => ({ values: { 'actions.defaults': DEFAULT_QUICK_ACTIONS } }), savePreference } });
  const first = rememberActionDefaults({ reviewScope: 'chapters' });
  const second = rememberEvidenceAssuranceLevel('strict');
  await first;
  await expect(second).rejects.toThrow('synthetic write failure');
  await rememberEvidenceAssuranceLevel('quick');
  expect(order).toEqual(['actions.defaults', 'review.evidenceAssuranceLevel', 'review.evidenceAssuranceLevel']);
  expect(savePreference).toHaveBeenLastCalledWith({ key: 'review.evidenceAssuranceLevel', value: 'quick' });
});
