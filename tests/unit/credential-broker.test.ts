import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CredentialBroker, CredentialBrokerError, type CredentialSlotBinding, type SecretResolver } from '../../src/service/provider/credential-broker.js';
import type { TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { protectedSecretEntryName, protectedSecretNativeOverridePresent } from '../../src/shared/protected-secret-identity.js';

// A fake resolver stands in for the OS Protected Secret Store: no real secret value exists in any test.

function fakeResolver(values: Record<string, string>): SecretResolver & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    resolve: async (reference) => {
      reads.push(reference);
      return values[reference] ?? null;
    },
  };
}

const binding: CredentialSlotBinding = {
  bindingDigest: 'a'.repeat(64),
  modelRole: 'Main Editorial Role',
  slot: 'deepseek-api-key',
  credentialReference: randomUUID(),
};

const ticket: TransmitTicket = { decision: 'transmit-remote', bindingDigest: binding.bindingDigest, payloadDigest: 'b'.repeat(64) };

describe('CredentialBroker', () => {
  it('reports readiness as presence only and never returns the value', async () => {
    const resolver = fakeResolver({ [binding.credentialReference]: 'placeholder-secret' });
    const broker = new CredentialBroker(resolver);
    await expect(broker.checkReadiness(binding)).resolves.toBe('present');
    await expect(broker.checkReadiness({ ...binding, credentialReference: randomUUID() })).resolves.toBe('missing');
    expect(broker.releaseCount).toBe(0);
    expect(resolver.reads).toHaveLength(2);
  });

  it('releases the value to one consumer only against a transmit-remote ticket for the same binding', async () => {
    const broker = new CredentialBroker(fakeResolver({ [binding.credentialReference]: 'placeholder-secret' }));
    const seen: string[] = [];
    await expect(broker.releaseTo(binding, ticket, async (value) => { seen.push(value); return 'consumed'; })).resolves.toBe('consumed');
    expect(seen).toEqual(['placeholder-secret']);
    expect(broker.releaseCount).toBe(1);
    await expect(broker.releaseTo(binding, null, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    await expect(broker.releaseTo(binding, { ...ticket, bindingDigest: 'c'.repeat(64) }, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    expect(broker.releaseCount).toBe(1);
  });

  it('fails closed when the store holds no value and on an invalid slot binding', async () => {
    const broker = new CredentialBroker(fakeResolver({}));
    await expect(broker.releaseTo(binding, ticket, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_MISSING' });
    await expect(broker.checkReadiness({ ...binding, slot: 'other' as 'deepseek-api-key' })).rejects.toBeInstanceOf(CredentialBrokerError);
    await expect(broker.checkReadiness({ ...binding, credentialReference: 'not-a-reference' })).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_INVALID' });
    // The two Model Roles a slot may be bound for (Issue #52, S17c): the Main Editorial Role and the Fast Interaction Role.
    await expect(broker.checkReadiness({ ...binding, modelRole: 'Frontier Model Role' as 'Main Editorial Role' })).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_INVALID' });
  });

  it('refuses a stale attempt before reading or releasing a replaced credential (#1044)', async () => {
    let current = true;
    let reads = 0;
    let consumed = false;
    const broker = new CredentialBroker({ resolve: async () => {
      reads += 1;
      current = false;
      return 'public-synthetic-replacement';
    } });
    const frozen = { ...binding, isCurrent: () => current };
    await expect(broker.releaseTo(frozen, ticket, async () => { consumed = true; })).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_STALE' });
    expect(reads).toBe(1);
    expect(consumed).toBe(false);
    expect(broker.releaseCount).toBe(0);
    await expect(broker.checkReadiness(frozen)).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_STALE' });
    await expect(broker.releaseTo(frozen, ticket, async () => { consumed = true; })).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_STALE' });
    expect(reads).toBe(1);
  });

  it('binds a slot for the Fast Interaction Role the dialogue runs on, releasing only against its own ticket (Issue #52, S17c)', async () => {
    const broker = new CredentialBroker(fakeResolver({ [binding.credentialReference]: 'placeholder-secret' }));
    const fast: CredentialSlotBinding = { ...binding, modelRole: 'Fast Interaction Role' };
    await expect(broker.checkReadiness(fast)).resolves.toBe('present');
    await expect(broker.releaseTo(fast, null, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    await expect(broker.releaseTo(fast, ticket, async (value) => value.length)).resolves.toBe('placeholder-secret'.length);
    expect(broker.releaseCount).toBe(1);
  });

  it('reads a plan\'s credential readiness before any binding exists, releasing nothing (Issue #420, S74a A3)', async () => {
    const reference = randomUUID();
    const resolver = fakeResolver({ [reference]: 'placeholder-secret' });
    const broker = new CredentialBroker(resolver);
    await expect(broker.checkPlanReadiness('opencode-go', reference)).resolves.toBe('present');
    await expect(broker.checkPlanReadiness('opencode-go', randomUUID())).resolves.toBe('missing');
    await expect(broker.checkPlanReadiness('other' as 'opencode-go', reference)).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_INVALID' });
    await expect(broker.checkPlanReadiness('deepseek-api-key', 'not-a-reference')).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_INVALID' });
    // Two reads resolved and discarded; the invalid slot and reference never reached the store.
    expect(resolver.reads).toHaveLength(2);
    expect(broker.releaseCount).toBe(0);
  });
});

describe('protected secret identity', () => {
  it('names the keyring entry exactly as Electron main writes it and refuses native overrides', () => {
    const reference = randomUUID();
    expect(protectedSecretEntryName(reference)).toBe(`credential-reference:${reference}`);
    expect(() => protectedSecretEntryName('bad')).toThrowError(/PROTECTED_SECRET_REFERENCE_INVALID/u);
    expect(protectedSecretNativeOverridePresent({})).toBe(false);
    expect(protectedSecretNativeOverridePresent({ NAPI_RS_FORCE_WASI: '1' })).toBe(true);
    expect(protectedSecretNativeOverridePresent({ NAPI_RS_NATIVE_LIBRARY_PATH: 'x' })).toBe(true);
  });
});
