import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, readRetainedBoundAnalysisPolicySync } from '../../src/service/launch-policy.js';
import { isResultSetPolicyPin, isRecordedProviderProcessingVersion, selectedPolicyIdentityOf, type TrustedOperationalScope } from '../../src/shared/protocol.js';
import defaults from '../../config/runtime-execution-defaults.json' with { type: 'json' };
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';

describe('runtime processing without policy locks (#1453)', () => {
  const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0]!, model: 'editor-custom-model',
    credentialReference: '11111111-1111-4111-8111-111111111111' };

  it('denies an unknown launch scope before supplying any runtime or binding', async () => {
    const denied = await resolveSourceCheckoutLaunchPolicy('/absent', 'unknown' as TrustedOperationalScope, binding);
    expect(denied).toMatchObject({ integrityState: 'denied', denialReason: 'launch-scope-not-selectable', operationalScope: null,
      providerProcessing: { liveTransmissionAllowed: false, admittedRules: [] } });
  });

  it('keeps every configured search backend usable in each runtime tool recipe and fallback set', () => {
    const expected = SEARCH_BACKENDS.filter((backend) => backend.support === 'supported')
      .map(({ id, host, credentialSlot }) => ({ id, host, credentialSlot })).sort((a, b) => a.id.localeCompare(b.id));
    for (const index of new Set(defaults.ordinary.flatMap((recipe) => typeof recipe.platformTools === 'number' ? [recipe.platformTools] : []))) {
      const tools = defaults.platformTools[index]!;
      expect([...tools.websearch.backends].sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected);
    }
    expect([...defaults.searchFallback.eligibleBackendIds].sort())
      .toEqual(SEARCH_BACKENDS.filter((backend) => backend.shipped).map((backend) => backend.id).sort());
  });

  it.each(['absent', 'altered'])('launches a connected custom model with the export policy %s', async (state) => {
    const root = await mkdtemp(join(tmpdir(), 'ai7-unlocked-'));
    try {
      if (state === 'altered') {
        await mkdir(join(root, 'docs/policies'), { recursive: true });
        await writeFile(join(root, 'docs/policies/external-export-policy.v2.json'), '{}');
      }
      const launch = await resolveSourceCheckoutLaunchPolicy(root, 'ordinary-production', binding);
      expect(launch.integrityState).toBe('verified');
      expect(launch.activePolicySetVersion).toBe('no-policy-lock');
      expect(launch.providerProcessing.liveTransmissionAllowed).toBe(true);
      expect(launch.providerProcessing.admittedRules.every((recipe) => recipe.model === binding.model)).toBe(true);
      expect(selectedPolicyIdentityOf(launch.selectedPolicyIdentity)).toEqual(launch.selectedPolicyIdentity);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('reads historical result pins and resumes retained analysis without documents', () => {
    const pin = { operationalScope: 'ordinary-production', providerProcessingVersion: 'v27', activePolicySetVersion: 'v19',
      liveTransmissions: 'bounded-by-run' } as const;
    expect(isResultSetPolicyPin(pin)).toBe(true);
    const retained = readRetainedBoundAnalysisPolicySync('/absent-policy-root', pin, binding);
    expect(retained?.integrityState).toBe('verified');
    expect(retained?.activePolicySetVersion).toBe(pin.activePolicySetVersion);
    expect(isResultSetPolicyPin({ ...pin, providerProcessingVersion: 'v35', activePolicySetVersion: 'no-policy-lock' })).toBe(true);
  });
});

// Independently enumerate every tuple actually persisted by predecessor launches, not a cross-product.
const recorded: Record<TrustedOperationalScope, Array<[string, string]>> = {
  'development-ci': [...[3,4,5,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23,24,25,26].map((set): [string,string] => ['v1', `v${set}`]), ['v29','v21']],
  'developer-live': [['v4','v4'],['v5','v5'],['v9','v7'],['v10','v8'],['v11','v9'],['v12','v10'],['v14','v11'],['v16','v12'],['v18','v13'],['v20','v14'],['v22','v15'],
    ...[16,17,18,19,21,22,23,24,25,26].map((set): [string,string] => ['v24',`v${set}`])],
  'ordinary-production': [['v13','v10'],['v15','v11'],['v17','v12'],['v19','v13'],['v21','v14'],['v23','v15'],['v23','v16'],['v25','v17'],['v26','v18'],['v27','v19'],
    ['v30','v21'],['v31','v22'],['v32','v23'],['v33','v24'],['v34','v25'],['v35','v26']],
};
describe('historical policy identity readers', () => {
  it.each(Object.entries(recorded).flatMap(([scope, tuples]) => tuples.map(([version, set]) => [scope, version, set])))
    ('reads the recorded %s / %s / %s pin without policy files', (scope, version, set) => {
      const pin = { operationalScope: scope, providerProcessingVersion: version, activePolicySetVersion: set,
        liveTransmissions: scope === 'development-ci' ? 0 : 'bounded-by-run' };
      expect(isResultSetPolicyPin(pin)).toBe(true);
      expect(isRecordedProviderProcessingVersion(scope, version)).toBe(true);
      if (scope === 'ordinary-production') {
        if (!isResultSetPolicyPin(pin)) throw new Error('invalid historical test pin');
        const retained = readRetainedBoundAnalysisPolicySync('/absent', pin,
          { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0]!, credentialReference: '11111111-1111-4111-8111-111111111111' });
        expect(retained).toMatchObject({ activePolicySetVersion: set, providerProcessing: { version } });
      }
      expect(isResultSetPolicyPin({ ...pin, liveTransmissions: scope === 'development-ci' ? 'bounded-by-run' : 0 })).toBe(false);
      expect(isResultSetPolicyPin({ ...pin, extra: true })).toBe(false);
    });
  it.each([['development-ci','v1','v21'],['development-ci','v29','v19'],['ordinary-production','v30','v19'],
    ['ordinary-production','v27','v21'],['developer-live','v24','v7'],['developer-live','v4','v5'],['developer-live','v8','v6'],
    ['development-ci','v29','v20'],['ordinary-production','v28','v20'],['ordinary-production','v6','v5'],['development-ci','v1','v2'],['fixture-recording','v2','v19']])
    ('refuses the never-recorded cross-product %s / %s / %s', (scope, version, set) => {
      expect(isResultSetPolicyPin({ operationalScope: scope, providerProcessingVersion: version, activePolicySetVersion: set,
        liveTransmissions: scope === 'development-ci' ? 0 : 'bounded-by-run' })).toBe(false);
    });
});
