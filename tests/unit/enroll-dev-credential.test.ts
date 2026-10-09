import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_REFERENCE_PATTERN,
  DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
  PROTECTED_SECRET_SERVICE_NAME,
  protectedSecretEntryName,
} from '../../src/shared/protected-secret-identity.js';
import { CONFIGURED_CREDENTIAL_SLOTS, CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../src/shared/provider-configuration.generated.js';

// The helper is the only reader of the Owner's key file. Nothing here supplies, reads, or writes a
// real credential: the tests exercise argument parsing, the CI refusal, and the duplicated identity
// literals, and never open the Protected Secret Store.

const HELPER_PATH = fileURLToPath(new URL('../../tools/enroll-dev-credential.mjs', import.meta.url));

type CheckDependencies = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  architecture?: string;
  importKeyring?: () => Promise<{ AsyncEntry: new (service: string, account: string) => { getPassword: () => Promise<string | undefined> } }>;
};

type Helper = {
  parseEnrollmentArguments: (argv: string[]) => { mode: 'store' | 'check'; slot: string; credentialReference: string; fromFile: string | null };
  continuousIntegrationPresent: (env?: NodeJS.ProcessEnv) => boolean;
  resolveCheckReading: (credentialReference: string, deps?: CheckDependencies) => Promise<'present' | 'absent' | 'unavailable'>;
};

const SUPPORTED_HOST: Required<Pick<CheckDependencies, 'platform' | 'architecture'>> =
  process.platform === 'win32' ? { platform: 'win32', architecture: 'x64' } : { platform: 'darwin', architecture: 'arm64' };

function fakeCarrier(password: string | undefined) {
  return async () => ({
    AsyncEntry: class {
      async getPassword() {
        return password;
      }
    },
  });
}

// @ts-expect-error tools/*.mjs carry no declarations; the helper is exercised as the plain module it is.
const helper = (await import('../../tools/enroll-dev-credential.mjs')) as unknown as Helper;
// @ts-expect-error tools/*.mjs carry no declarations; the generated slot list is read as the plain module it is.
const SLOT_LIST = ((await import('../../tools/provider-credential-slots.generated.mjs')) as unknown as {
  DEVELOPMENT_CREDENTIAL_SLOTS: ReadonlyArray<readonly [string, string]>;
}).DEVELOPMENT_CREDENTIAL_SLOTS;
const ABSOLUTE = process.platform === 'win32' ? 'C:\\keys\\opencode.key.txt' : '/keys/opencode.key.txt';

describe('enrol-dev-credential identity', () => {
  it('duplicates the keyring service name and reads the generated slot list the TypeScript configuration declares', async () => {
    const source = await readFile(HELPER_PATH, 'utf8');
    expect(source).toContain(`const PROTECTED_SECRET_SERVICE_NAME = '${PROTECTED_SECRET_SERVICE_NAME}';`);
    expect(source).toContain("import { DEVELOPMENT_CREDENTIAL_SLOTS } from './provider-credential-slots.generated.mjs';");
    // The plain-ESM slot list and the TypeScript configuration are generated from the same documents
    // and say the same thing: every configured slot, each under its document's development reference.
    expect(new Map(SLOT_LIST)).toEqual(new Map(Object.entries(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)));
    expect(SLOT_LIST.map(([slot]) => slot)).toEqual([...CONFIGURED_CREDENTIAL_SLOTS]);
    expect(new Map(SLOT_LIST).get('opencode-go')).toBe(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE);
    for (const [, reference] of SLOT_LIST) expect(CREDENTIAL_REFERENCE_PATTERN.test(reference)).toBe(true);
    // The helper composes the same entry name the store writes and the resolver reads.
    expect(source).toContain('`credential-reference:${credentialReference}`');
    expect(protectedSecretEntryName(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE))
      .toBe(`credential-reference:${DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE}`);
    expect(CREDENTIAL_REFERENCE_PATTERN.test(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE)).toBe(true);
  });

  it('writes no diagnostic on the store path: the only output in the file is the one check line', async () => {
    const source = await readFile(HELPER_PATH, 'utf8');
    const writes = source.match(/process\.(stdout|stderr)\.write\([^)]*\)/gu) ?? [];
    expect(writes).toEqual(['process.stdout.write(`${reading}\\n`)']);
    expect(source).not.toMatch(/console\.(log|error|warn|info)/u);
  });
});

describe('parseEnrollmentArguments', () => {
  it('accepts exactly the store form and the check form for the developer-live slot', () => {
    expect(helper.parseEnrollmentArguments(['--slot', 'opencode-go', '--from-file', ABSOLUTE])).toEqual({
      mode: 'store', slot: 'opencode-go', credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, fromFile: ABSOLUTE,
    });
    expect(helper.parseEnrollmentArguments(['--slot', 'opencode-go', '--check'])).toEqual({
      mode: 'check', slot: 'opencode-go', credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, fromFile: null,
    });
    expect(helper.parseEnrollmentArguments(['--check', '--slot', 'opencode-go']).mode).toBe('check');
  });

  it('admits every configured slot under the reference its document fixes, and only those', () => {
    for (const [slot, reference] of SLOT_LIST) {
      expect(helper.parseEnrollmentArguments(['--slot', slot, '--check'])).toEqual({ mode: 'check', slot, credentialReference: reference, fromFile: null });
    }
    // A slot no document declares is refused exactly as a malformed argument is.
    expect(() => helper.parseEnrollmentArguments(['--slot', 'bytedance-doubao', '--check'])).toThrowError(/AI7_ENROLLMENT_INVALID/u);
  });

  it('refuses an unconfigured slot, a mixed mode, a missing file, a repeat, and an unknown argument', () => {
    for (const argv of [
      [],
      ['--slot', 'unconfigured-provider', '--from-file', ABSOLUTE],
      ['--slot', 'opencode-go'],
      ['--slot', 'opencode-go', '--from-file', ABSOLUTE, '--check'],
      ['--slot', 'opencode-go', '--slot', 'opencode-go', '--from-file', ABSOLUTE],
      ['--slot', 'opencode-go', '--from-file'],
      ['--slot', 'opencode-go', '--from-file', ABSOLUTE, '--secret', 'x'],
      ['--from-file', ABSOLUTE],
    ]) {
      expect(() => helper.parseEnrollmentArguments(argv), argv.join(' ')).toThrowError(/AI7_ENROLLMENT_INVALID/u);
    }
  });

  it('treats CI and a Journey launch as never a developer host', () => {
    expect(helper.continuousIntegrationPresent({})).toBe(false);
    expect(helper.continuousIntegrationPresent({ CI: 'true' })).toBe(true);
    expect(helper.continuousIntegrationPresent({ GITHUB_ACTIONS: 'true' })).toBe(true);
    expect(helper.continuousIntegrationPresent({ AI7_E2E_JOURNEY: 'J-04' })).toBe(true);
  });
});

describe('resolveCheckReading', () => {
  it('reads present when the carrier resolves and the store holds a non-empty value', async () => {
    const reading = await helper.resolveCheckReading(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, {
      env: {},
      ...SUPPORTED_HOST,
      importKeyring: fakeCarrier('a-secret'),
    });
    expect(reading).toBe('present');
  });

  it('reads absent when the carrier resolves but the store holds nothing', async () => {
    const reading = await helper.resolveCheckReading(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, {
      env: {},
      ...SUPPORTED_HOST,
      importKeyring: fakeCarrier(undefined),
    });
    expect(reading).toBe('absent');
  });

  it('reads unavailable, never absent, when the carrier is unresolvable', async () => {
    const reading = await helper.resolveCheckReading(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, {
      env: {},
      ...SUPPORTED_HOST,
      importKeyring: async () => {
        throw new Error('module not found: @napi-rs/keyring');
      },
    });
    expect(reading).toBe('unavailable');
    expect(reading).not.toBe('absent');
  });

  it('reads unavailable on an unsupported platform or architecture', async () => {
    const reading = await helper.resolveCheckReading(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, {
      env: {},
      platform: 'linux',
      architecture: 'x64',
      importKeyring: fakeCarrier('a-secret'),
    });
    expect(reading).toBe('unavailable');
  });

  it('reads unavailable when a native-carrier override is present', async () => {
    const reading = await helper.resolveCheckReading(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, {
      env: { NAPI_RS_FORCE_WASI: '1' },
      ...SUPPORTED_HOST,
      importKeyring: fakeCarrier('a-secret'),
    });
    expect(reading).toBe('unavailable');
  });

  it('reads unavailable when CI is detected', async () => {
    const reading = await helper.resolveCheckReading(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, {
      env: { CI: 'true' },
      ...SUPPORTED_HOST,
      importKeyring: fakeCarrier('a-secret'),
    });
    expect(reading).toBe('unavailable');
  });
});
