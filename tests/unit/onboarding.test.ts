import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPreferenceStore } from '../../src/main/preferences.js';
import { showOnboardingCard, showSampleGuidance } from '../../src/shared/preferences.js';
import { resolveDevelopmentSampleBook } from '../../src/shared/data-root.js';

describe('first-run guidance', () => {
  it('appears only in an empty library with no saved choice', () => {
    expect(showOnboardingCard(false, null)).toBe(true);
    for (const state of [null, 'skipped', 'completed'] as const) {
      expect(showOnboardingCard(true, state)).toBe(false);
      if (state !== null) expect(showOnboardingCard(false, state)).toBe(false);
    }
  });

  it.each(['skipped', 'completed'] as const)('remembers %s across restart and refuses to reset it', async (state) => {
    const directory = await mkdtemp(join(tmpdir(), 'ai7-onboarding-'));
    try {
      const store = createPreferenceStore(directory);
      expect(store.read().values['onboarding.state']).toBeNull();
      store.save({ key: 'onboarding.state', value: state });
      const restarted = createPreferenceStore(directory);
      expect(restarted.read().values['onboarding.state']).toBe(state);
      expect(() => restarted.save({ key: 'onboarding.state', value: null })).toThrow();
      expect(showOnboardingCard(false, restarted.read().values['onboarding.state'])).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps sample guidance until a baseline exists and onboarding is dismissed', () => {
    expect(showSampleGuidance(false, null, false)).toBe(false);
    expect(showSampleGuidance(true, null, true)).toBe(true);
    for (const state of ['skipped', 'completed'] as const) {
      expect(showSampleGuidance(true, state, false)).toBe(true);
      expect(showSampleGuidance(true, state, true)).toBe(false);
    }
  });
});

describe('development-only sample import', () => {
  const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
  it('admits exactly the reviewed sample1 bytes in the source checkout', async () => {
    expect(await resolveDevelopmentSampleBook(codeRoot, 'source-checkout')).toBe(join(codeRoot, 'SampleBooks', 'sample1.docx'));
  });
  it('refuses packaged or unknown runtime forms before touching files', async () => {
    for (const runtime of ['packaged', '', 'development']) {
      await expect(resolveDevelopmentSampleBook(codeRoot, runtime)).rejects.toThrow('AI7_DATA_ROOT_BOUNDARY_INVALID');
    }
  });
});
