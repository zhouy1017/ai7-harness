/**
 * The one OS-protected-store identity AI7 uses for Model Service credentials. Electron main writes
 * and removes entries under it; the service's Credential Broker may only read an entry under it, and
 * only inside the final Provider adapter's transmit step.
 */
export const PROTECTED_SECRET_SERVICE_NAME = 'io.github.zhouy1017.ai7.model-service';
export const CREDENTIAL_REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The exact keyring account name for one opaque Credential Reference. */
export function protectedSecretEntryName(credentialReference: string): string {
  if (!CREDENTIAL_REFERENCE_PATTERN.test(credentialReference)) throw new Error('PROTECTED_SECRET_REFERENCE_INVALID');
  return `credential-reference:${credentialReference}`;
}

/** A native-library override selector makes the protected store untrustworthy; both processes refuse it. */
export function protectedSecretNativeOverridePresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NAPI_RS_NATIVE_LIBRARY_PATH !== undefined || env.NAPI_RS_FORCE_WASI !== undefined;
}
