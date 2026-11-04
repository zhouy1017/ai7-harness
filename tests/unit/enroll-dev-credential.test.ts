import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  CREDENTIAL_REFERENCE_PATTERN,
  DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
  PROTECTED_SECRET_SERVICE_NAME,
  protectedSecretEntryName,
} from '../../src/shared/protected-secret-identity.js';
import { CONFIGURED_CREDENTIAL_SLOTS, CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES, CONFIGURED_DEVELOPMENT_SLOTS } from '../../src/shared/provider-configuration.generated.js';

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
  serveGuestEnrollment: (nonce: string, references: Array<{slot:string;credentialReference:string;ephemeral?:boolean}>, deps: Record<string,unknown>) => Promise<()=>Promise<void>>;
  parseEnrollmentArguments: (argv: string[]) => { mode: 'store' | 'check'; slot: string; credentialReference: string; fromFile: string | null };
  continuousIntegrationPresent: (env?: NodeJS.ProcessEnv) => boolean;
  resolveCheckReading: (credentialReference: string, deps?: CheckDependencies) => Promise<'present' | 'absent' | 'unavailable'>;
  storeEnrollment: (argv: string[], deps: {
    env: NodeJS.ProcessEnv; platform: NodeJS.Platform; architecture: string;
    readSecret: (path: string) => Promise<string>;
    spawn?: (...args: unknown[]) => unknown;
    readStdinSecret?: () => Promise<string>;
    importKeyring: () => Promise<{ AsyncEntry: new (service: string, account: string) => { setPassword: (value: string) => Promise<void> } }>;
  }) => Promise<void>;
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
    expect(SLOT_LIST.map(([slot]) => slot)).toEqual([...CONFIGURED_DEVELOPMENT_SLOTS]);
    // The production connection's slot has no development reference: its reference is per connection row.
    expect(CONFIGURED_CREDENTIAL_SLOTS).toContain('deepseek-api-key');
    expect(SLOT_LIST.map(([slot]) => slot)).not.toContain('deepseek-api-key');
    // The helper says, where it is read, which enrolment is authorized: opencode-go, and the five search evaluation slots
    // under the ADR 0067 amendment clause of Issue #883.
    expect(source).toContain('**Authorized enrolment: `opencode-go` (ADR 0067), and the five search backend evaluation slots**');
    expect(source).toContain('amendment clause of Issue #883');
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

  it('enrolls admitted search keys under a disposable production reference for Beta measurement', () => {
    const reference = randomUUID();
    for (const slot of ['search-bochaai', 'search-brave', 'search-tinyfish', 'search-parallel', 'search-deepseek']) {
      expect(helper.parseEnrollmentArguments(['--slot', slot, '--credential-reference', reference, '--from-file', ABSOLUTE]))
        .toEqual({ mode: 'store-named', slot, credentialReference: reference, fromFile: ABSOLUTE });
    }
    expect(() => helper.parseEnrollmentArguments(['--slot', 'search-brave', '--credential-reference',
      CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES['search-brave']!, '--from-file', ABSOLUTE])).toThrow();
  });

  it('relays a nonce-scoped guest enrollment into the interactive carrier and rejects unrelated references', async () => {
    if (process.platform !== 'win32') return;
    const oldGuest=process.env.COMPUTERNAME;
    process.env.COMPUTERNAME='AI7-TESTBED-02';
    const nonce=randomUUID(), ref=randomUUID(), probe=randomUUID();
    const setPassword=vi.fn(async(_value:string)=>{});
    let close:(()=>Promise<void>)|undefined;
    try{
      const values=new Map<string,string>();
      close=await helper.serveGuestEnrollment(nonce,[{slot:'search-brave',credentialReference:ref},{slot:'opencode-go',credentialReference:probe,ephemeral:true}],{env:{},...SUPPORTED_HOST,
        importKeyring:async()=>({AsyncEntry:class{
          constructor(_service:string,private readonly account:string){}
          async setPassword(value:string){setPassword(value);values.set(this.account,value);}
          async getPassword(){return values.get(this.account);}
          async deleteCredential(){values.delete(this.account);}
        }})});
      const deps={env:{},...SUPPORTED_HOST,readSecret:vi.fn(),readStdinSecret:async()=>'synthetic-carrier-value',importKeyring:vi.fn()};
      await helper.storeEnrollment(['--slot','search-brave','--credential-reference',ref,'--from-stdin','--guest-session',nonce],deps);
      expect(setPassword).toHaveBeenCalledExactlyOnceWith('synthetic-carrier-value');
      await expect(helper.storeEnrollment(['--slot','search-brave','--credential-reference',randomUUID(),'--from-stdin','--guest-session',nonce],deps)).rejects.toThrow();
      expect(setPassword).toHaveBeenCalledTimes(1);
      await helper.storeEnrollment(['--slot','opencode-go','--credential-reference',probe,'--from-stdin','--guest-session',nonce],deps);
      expect(values.has(protectedSecretEntryName(probe))).toBe(false);
      expect(values.has(protectedSecretEntryName(ref))).toBe(true);
      expect(deps.importKeyring).not.toHaveBeenCalled();
    }finally{await close?.();if(oldGuest===undefined)delete process.env.COMPUTERNAME;else process.env.COMPUTERNAME=oldGuest;}
  });

  it('carries a guest enrollment only in encrypted SSH stdin, with output closed', async () => {
    let received = '';
    const child = Object.assign(new EventEmitter(), { stdin: new Writable({
      write(chunk, _encoding, done) { received += chunk.toString(); done(); },
      final(done) { done(); queueMicrotask(() => child.emit('exit', 0)); },
    }) });
    const start = vi.fn(() => child);
    await helper.storeEnrollment(['--slot', 'opencode-go', '--credential-reference', randomUUID(),
      '--from-file', ABSOLUTE, '--to-guest', 'ai7-testbed-02-nat'], {
      env: {}, ...SUPPORTED_HOST, readSecret: async () => 'synthetic-test-value', spawn: start,
      importKeyring: async () => { throw new Error('Remote enrollment must not open the host store'); },
    });
    expect(received).toBe('synthetic-test-value');
    expect(JSON.stringify(start.mock.calls)).not.toContain(received);
    expect(start.mock.calls[0]).toEqual(['ssh.exe', expect.arrayContaining(['ai7-testbed-02-nat', '--from-stdin']),
      { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] }]);
    expect(() => helper.parseEnrollmentArguments(['--slot', 'opencode-go', '--credential-reference', randomUUID(),
      '--from-file', ABSOLUTE, '--to-guest', 'arbitrary-host'])).toThrow();
  });

  it('accepts stdin only for a named connection and keeps it separate from file/check modes', async () => {
    const write = vi.fn(async () => {});
    const read = vi.fn(async () => 'synthetic-pipe-value');
    await helper.storeEnrollment(['--slot', 'search-brave', '--credential-reference', randomUUID(), '--from-stdin'], {
      env: {}, ...SUPPORTED_HOST, readSecret: async () => { throw new Error('No file read'); }, readStdinSecret: read,
      importKeyring: async () => ({ AsyncEntry: class { setPassword = write; } }),
    });
    expect(read).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith('synthetic-pipe-value');
    for (const flags of [['--from-stdin', '--from-file', ABSOLUTE], ['--from-stdin', '--check'], ['--delete', '--from-stdin']]) {
      expect(() => helper.parseEnrollmentArguments(['--slot', 'opencode-go', '--credential-reference', randomUUID(), ...flags])).toThrow();
    }
    expect(() => helper.parseEnrollmentArguments(['--slot', 'opencode-go', '--from-stdin'])).toThrow();
  });

  it('admits every configured slot under the reference its document fixes, and only those', () => {
    for (const [slot, reference] of SLOT_LIST) {
      expect(helper.parseEnrollmentArguments(['--slot', slot, '--check'])).toEqual({ mode: 'check', slot, credentialReference: reference, fromFile: null });
    }
    // A slot no document declares, and the production slot that has no development reference, are refused exactly
    // as a malformed argument is.
    expect(() => helper.parseEnrollmentArguments(['--slot', 'bytedance-doubao', '--check'])).toThrowError(/AI7_ENROLLMENT_INVALID/u);
    expect(() => helper.parseEnrollmentArguments(['--slot', 'deepseek-api-key', '--check'])).toThrowError(/AI7_ENROLLMENT_INVALID/u);
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

describe('named production enrollment refusals', () => {
  it('stops blocked named enrollments before either injected carrier or file reader is reached', async () => {
    for (const env of [{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }, { AI7_E2E_JOURNEY: 'J-12' },
      { NAPI_RS_NATIVE_LIBRARY_PATH: 'refused' }, { NAPI_RS_FORCE_WASI: '1' }]) {
      const importKeyring = vi.fn(async () => { throw new Error('carrier must not open'); });
      const readSecret = vi.fn(async () => { throw new Error('file must not open'); });
      await expect(helper.storeEnrollment(['--slot', 'deepseek-api-key', '--credential-reference', randomUUID(), '--from-file', ABSOLUTE],
        { env, ...SUPPORTED_HOST, importKeyring, readSecret })).rejects.toThrowError('AI7_ENROLLMENT_INVALID');
      expect(importKeyring).not.toHaveBeenCalled();
      expect(readSecret).not.toHaveBeenCalled();
    }
  });

  it('writes the named reference only to an injected carrier and returns no value', async () => {
    const reference = randomUUID();
    const accounts: string[] = [];
    const setPassword = vi.fn(async (_value: string) => undefined);
    const result = await helper.storeEnrollment(['--slot', 'deepseek-api-key', '--credential-reference', reference, '--from-file', ABSOLUTE], {
      env: {}, ...SUPPORTED_HOST, readSecret: async () => 'synthetic-enrollment-value',
      importKeyring: async () => ({ AsyncEntry: class {
        constructor(_service: string, account: string) { accounts.push(account); }
        setPassword = setPassword;
      } }),
    });
    expect(accounts).toEqual([protectedSecretEntryName(reference)]);
    expect(setPassword).toHaveBeenCalledExactlyOnceWith('synthetic-enrollment-value');
    expect(result).toBeUndefined();
  });

  it('refuses CI, Journey and native override launches silently before reading a file or opening a real store', () => {
    for (const blocked of [{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }, { AI7_E2E_JOURNEY: 'J-12' },
      { NAPI_RS_NATIVE_LIBRARY_PATH: 'refused-native-override' }, { NAPI_RS_FORCE_WASI: '1' }]) {
      const env = { ...process.env };
      for (const key of ['CI', 'GITHUB_ACTIONS', 'AI7_E2E_JOURNEY', 'NAPI_RS_NATIVE_LIBRARY_PATH', 'NAPI_RS_FORCE_WASI']) delete env[key];
      Object.assign(env, blocked);
      const result = spawnSync(process.execPath, [HELPER_PATH, '--slot', 'deepseek-api-key', '--credential-reference', randomUUID(),
        '--from-file', 'nonexistent-enrollment-input'], { env, encoding: 'utf8', windowsHide: true, timeout: 10_000 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    }
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
