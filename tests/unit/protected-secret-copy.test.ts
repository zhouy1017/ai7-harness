import { afterEach, expect, it, vi } from 'vitest';
import { openProtectedSecretStore } from '../../src/main/protected-secret-store.js';

const values = vi.hoisted(() => new Map<string, string>());
vi.mock('@napi-rs/keyring', () => ({ AsyncEntry: class {
  constructor(_service: string, readonly account: string) {}
  async setPassword(value: string) { values.set(this.account, value); }
  async getPassword() { return values.get(this.account) ?? null; }
  async deleteCredential() { return values.delete(this.account); }
} }));
afterEach(() => { values.clear(); vi.unstubAllGlobals(); });

it('copies a model key entirely within the protected store and independently removes the search copy', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32', arch: 'x64' });
  const store = await openProtectedSecretStore();
  const model = '11111111-1111-4111-8111-111111111111', search = '22222222-2222-4222-8222-222222222222';
  await store.set(model, 'synthetic-test-key');
  await store.copy(model, search);
  expect(await store.has(search)).toBe(true);
  await store.remove(search);
  expect(await store.has(search)).toBe(false);
  expect(await store.has(model)).toBe(true);
  await expect(store.copy(search, model)).rejects.toThrow('PROTECTED_SECRET_SOURCE_MISSING');
  expect(await store.has(model)).toBe(true);
});
