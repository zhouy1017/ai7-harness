import {
  CREDENTIAL_REFERENCE_PATTERN,
  PROTECTED_SECRET_SERVICE_NAME,
  protectedSecretEntryName,
  protectedSecretNativeOverridePresent,
} from '../../shared/protected-secret-identity.js';
import type { SecretResolver } from './credential-broker.js';

/**
 * The product secret resolver: the service reads the OS Protected Secret Store directly through the
 * exact pinned `@napi-rs/keyring` carrier, read-only, under the same identity Electron main writes.
 * This is the narrowest supported mechanism the brief allows: no value crosses the renderer, the main
 * process, or the service protocol; the module loads lazily and only when the broker asks.
 */
type KeyringEntry = { getPassword(): Promise<string | null | undefined> };
type KeyringEntryConstructor = new (service: string, username: string) => KeyringEntry;

export function createKeyringSecretResolver(): SecretResolver {
  return {
    async resolve(credentialReference: string): Promise<string | null> {
      if (protectedSecretNativeOverridePresent()) throw new Error('PROTECTED_SECRET_NATIVE_OVERRIDE_DENIED');
      if (!CREDENTIAL_REFERENCE_PATTERN.test(credentialReference)) throw new Error('PROTECTED_SECRET_REFERENCE_INVALID');
      const platform = process.platform;
      const architecture = process.arch;
      if (!((platform === 'win32' && architecture === 'x64') || (platform === 'darwin' && architecture === 'arm64'))) {
        throw new Error('PROTECTED_SECRET_PLATFORM_UNSUPPORTED');
      }
      const module = await import('@napi-rs/keyring');
      const Entry = module.AsyncEntry as unknown as KeyringEntryConstructor;
      if (typeof Entry !== 'function') throw new Error('PROTECTED_SECRET_NATIVE_CARRIER_INVALID');
      const value = await new Entry(PROTECTED_SECRET_SERVICE_NAME, protectedSecretEntryName(credentialReference)).getPassword();
      return typeof value === 'string' && value.length > 0 ? value : null;
    },
  };
}
