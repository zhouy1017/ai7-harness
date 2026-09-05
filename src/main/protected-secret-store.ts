import {
  PROTECTED_SECRET_SERVICE_NAME,
  protectedSecretEntryName,
  protectedSecretNativeOverridePresent,
} from '../shared/protected-secret-identity.js';

type KeyringEntry = {
  setPassword(password: string): Promise<void>;
  getPassword(): Promise<string | null | undefined>;
  deleteCredential(): Promise<boolean>;
};

type KeyringEntryConstructor = new (service: string, username: string) => KeyringEntry;

export interface ProtectedSecretStore {
  readonly backend: 'windows-credential-manager' | 'macos-keychain';
  set(credentialReference: string, secret: string): Promise<void>;
  has(credentialReference: string): Promise<boolean>;
  remove(credentialReference: string): Promise<void>;
}

abstract class KeyringProtectedSecretStore implements ProtectedSecretStore {
  abstract readonly backend: 'windows-credential-manager' | 'macos-keychain';

  constructor(private readonly Entry: KeyringEntryConstructor) {}

  #entry(credentialReference: string): KeyringEntry {
    return new this.Entry(PROTECTED_SECRET_SERVICE_NAME, protectedSecretEntryName(credentialReference));
  }

  async set(credentialReference: string, secret: string): Promise<void> {
    if (!secret.isWellFormed() || secret.length < 1 || secret.length > 16_384) {
      throw new Error('PROTECTED_SECRET_INPUT_INVALID');
    }
    await this.#entry(credentialReference).setPassword(secret);
  }

  async has(credentialReference: string): Promise<boolean> {
    const secret = await this.#entry(credentialReference).getPassword();
    return typeof secret === 'string' && secret.length > 0;
  }

  async remove(credentialReference: string): Promise<void> {
    const removed = await this.#entry(credentialReference).deleteCredential();
    if (removed !== true) throw new Error('PROTECTED_SECRET_REMOVE_UNCONFIRMED');
  }
}

class WindowsCredentialManagerStore extends KeyringProtectedSecretStore {
  readonly backend = 'windows-credential-manager' as const;
}

class MacOsKeychainStore extends KeyringProtectedSecretStore {
  readonly backend = 'macos-keychain' as const;
}

/** Opens the one native OS store supported by this exact source-checkout runtime. */
export async function openProtectedSecretStore(): Promise<ProtectedSecretStore> {
  if (protectedSecretNativeOverridePresent()) {
    throw new Error('PROTECTED_SECRET_NATIVE_OVERRIDE_DENIED');
  }
  const platform = process.platform;
  const architecture = process.arch;
  if (!((platform === 'win32' && architecture === 'x64') || (platform === 'darwin' && architecture === 'arm64'))) {
    throw new Error('PROTECTED_SECRET_PLATFORM_UNSUPPORTED');
  }
  const module = await import('@napi-rs/keyring');
  const Entry = module.AsyncEntry as KeyringEntryConstructor;
  if (typeof Entry !== 'function') throw new Error('PROTECTED_SECRET_NATIVE_CARRIER_INVALID');
  return platform === 'win32'
    ? new WindowsCredentialManagerStore(Entry)
    : new MacOsKeychainStore(Entry);
}
