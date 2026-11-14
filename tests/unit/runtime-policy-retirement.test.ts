import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, readRetainedBoundAnalysisPolicySync } from '../../src/service/launch-policy.js';
import { isResultSetPolicyPin, selectedPolicyIdentityOf } from '../../src/shared/protocol.js';

describe('runtime processing without policy locks (#1453)', () => {
  const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0]!, model: 'editor-custom-model',
    credentialReference: '11111111-1111-4111-8111-111111111111' };

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
