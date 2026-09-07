/**
 * The one OS-protected-store identity AI7 uses for Model Service credentials. Electron main writes
 * and removes entries under it; the service's Credential Broker may only read an entry under it, and
 * only inside the final Provider adapter's transmit step.
 */
export const PROTECTED_SECRET_SERVICE_NAME = 'io.github.zhouy1017.ai7.model-service';
export const CREDENTIAL_REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The fixed development Credential Reference of the `opencode-go` slot (ADR 0067). Unlike a product
 * Model Service Connection, whose reference is generated per connection row, the developer-live route
 * has no row: one constant is shared by the enrollment helper, the Credential Broker, the keyring
 * resolver, and the v4 Provider Resolution Plan, so all four name the same keyring entry without any
 * store change. It identifies an entry; it is never itself a secret.
 */
export const DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE = 'a7c0de00-5040-4f27-9e13-6b1f2c8d4a55';

/** The exact keyring account name for one opaque Credential Reference. */
export function protectedSecretEntryName(credentialReference: string): string {
  if (!CREDENTIAL_REFERENCE_PATTERN.test(credentialReference)) throw new Error('PROTECTED_SECRET_REFERENCE_INVALID');
  return `credential-reference:${credentialReference}`;
}

/** A native-library override selector makes the protected store untrustworthy; both processes refuse it. */
export function protectedSecretNativeOverridePresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NAPI_RS_NATIVE_LIBRARY_PATH !== undefined || env.NAPI_RS_FORCE_WASI !== undefined;
}
