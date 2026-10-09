import { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from './provider-configuration.generated.js';

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
 * has no row: one reference is shared by the enrollment helper, the Credential Broker, the keyring
 * resolver, and the v4 Provider Resolution Plan, so all four name the same keyring entry without any
 * store change. It identifies an entry; it is never itself a secret. Since ADR 0073 §4 (Issue #435)
 * the reference is the one `config/providers/opencode-go.json` fixes, read from the generated
 * configuration; the value is unchanged.
 */
export const DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE: string = CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES['opencode-go'];

/** The exact keyring account name for one opaque Credential Reference. */
export function protectedSecretEntryName(credentialReference: string): string {
  if (!CREDENTIAL_REFERENCE_PATTERN.test(credentialReference)) throw new Error('PROTECTED_SECRET_REFERENCE_INVALID');
  return `credential-reference:${credentialReference}`;
}

/** A native-library override selector makes the protected store untrustworthy; both processes refuse it. */
export function protectedSecretNativeOverridePresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NAPI_RS_NATIVE_LIBRARY_PATH !== undefined || env.NAPI_RS_FORCE_WASI !== undefined;
}
