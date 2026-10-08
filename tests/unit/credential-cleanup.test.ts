import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Issue #649: the synthetic-credential cleanup every credential-saving Journey needs lives in one module, and its store
// version pin moves with the service's terminal schema revision. `e2e/*.mjs` is runner infrastructure outside the typed
// program, so the module is loaded through a runtime specifier and typed here.
type Recovered = { kind: 'not-started' } | { kind: 'removed' } | { kind: 'reference'; credentialReference: string };
const cleanup = (await import(new URL('../../e2e/credential-cleanup.mjs', import.meta.url).href)) as {
  CREDENTIAL_CLEANUP_SCHEMA_VERSION: number;
  assertSecretsAbsentFromDataRoot(journey: string, root: string, secrets: readonly string[], name?: string): Promise<void>;
  recoverSyntheticCredentialCleanupState(journey: string, dataRoot: string, runRoot: string): Promise<Recovered>;
};

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const E2E = resolve(ROOT, 'e2e');
const REFERENCE = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function runRoot(): Promise<{ runRoot: string; dataRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), 'ai7-credential-cleanup-'));
  roots.push(root);
  const dataRoot = resolve(root, 'data');
  await mkdir(resolve(dataRoot, 'store'), { recursive: true });
  return { runRoot: root, dataRoot };
}

function plantStore(dataRoot: string, version: number, state: string | null): void {
  const database = new DatabaseSync(resolve(dataRoot, 'store', 'ai7.sqlite'));
  try {
    database.exec(`CREATE TABLE model_service_connections (
      connection_id TEXT, role_id TEXT, connection_name TEXT, provider_id TEXT, model_id TEXT, adapter_revision INTEGER,
      configuration_revision INTEGER, approved_fallback_chain TEXT, credential_slot TEXT, credential_reference TEXT,
      credential_operation_state TEXT)`);
    database.exec(`PRAGMA user_version = ${version}`);
    if (state !== null) {
      database.prepare('INSERT INTO model_service_connections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        'main-editorial-deepseek-v4-pro', 'main-editorial', '主编辑模型', 'deepseek-open-platform', 'deepseek-v4-pro', 1, 1,
        '[]', 'deepseek-api-key', REFERENCE, state,
      );
    }
  } finally {
    database.close();
  }
}

describe('the store version the metadata fallback reads', () => {
  it('is the terminal schema revision the service stamps', () => {
    const source = readFileSync(resolve(ROOT, 'src', 'service', 'task-authorization.ts'), 'utf8');
    const revisions = [...source.matchAll(/^export const \w+_SCHEMA_VERSION = (\d+);$/gmu)].map((match) => Number(match[1]));
    expect(revisions.length).toBeGreaterThan(40);
    expect(cleanup.CREDENTIAL_CLEANUP_SCHEMA_VERSION).toBe(Math.max(...revisions));
  });
});

describe('every Journey uses the one shared cleanup', () => {
  const runners = readdirSync(E2E).filter((file) => /^run-j\d\d\.mjs$/u.test(file) || file === 'package-export-readiness.mjs');
  const users = ['run-j03.mjs', 'run-j04.mjs', 'run-j09.mjs', 'run-j10.mjs', 'run-j11.mjs', 'run-j12.mjs', 'run-j13.mjs', 'run-j16.mjs'];

  it('no runner keeps its own copy of the cleanup or a store version pin of its own', () => {
    for (const file of runners) {
      const source = readFileSync(resolve(E2E, file), 'utf8');
      for (const copy of [
        /function\s+(assertSecretsAbsentFromDataRoot|removeSyntheticCredentialWithElectron|recoverSyntheticCredentialCleanupState)\b/u,
        /CREDENTIAL_CLEANUP_SCRIPT/u,
        /@napi-rs\/keyring/u,
        /deleteCredential\(/u,
        /credential-cleanup-metadata/u,
        /user_version\s*===\s*\d/u,
        /schemaRevision\s*===\s*\d/u,
      ]) {
        expect(source, `${file} ${copy.source}`).not.toMatch(copy);
      }
    }
  });

  it('each runner that saves the synthetic credential imports the shared module', () => {
    for (const file of users) {
      const source = readFileSync(resolve(E2E, file), 'utf8');
      expect(source, file).toMatch(/from '\.\/credential-cleanup\.mjs';/u);
      expect(source, file).toMatch(/recoverSyntheticCredentialCleanupState\('J-\d\d', /u);
      expect(source, file).toMatch(/removeSyntheticCredentialWithElectron\(\s*'J-\d\d',/u);
    }
    for (const file of runners.filter((name) => !users.includes(name))) {
      expect(readFileSync(resolve(E2E, file), 'utf8'), file).not.toMatch(/window\.ai7\.removeModelServiceCredential\(/u);
    }
  });
});

describe('the metadata fallback', () => {
  it('reads nothing started when no store exists yet', async () => {
    const { runRoot: run, dataRoot } = await runRoot();
    await expect(cleanup.recoverSyntheticCredentialCleanupState('J-99', dataRoot, run)).resolves.toEqual({ kind: 'not-started' });
  });

  it('reads the reference to remove, an already removed credential, and no connection', async () => {
    const version = cleanup.CREDENTIAL_CLEANUP_SCHEMA_VERSION;
    const ready = await runRoot();
    plantStore(ready.dataRoot, version, 'ready');
    await expect(cleanup.recoverSyntheticCredentialCleanupState('J-99', ready.dataRoot, ready.runRoot))
      .resolves.toEqual({ kind: 'reference', credentialReference: REFERENCE });
    const removed = await runRoot();
    plantStore(removed.dataRoot, version, 'missing');
    await expect(cleanup.recoverSyntheticCredentialCleanupState('J-99', removed.dataRoot, removed.runRoot)).resolves.toEqual({ kind: 'removed' });
    const empty = await runRoot();
    plantStore(empty.dataRoot, version, null);
    await expect(cleanup.recoverSyntheticCredentialCleanupState('J-99', empty.dataRoot, empty.runRoot)).resolves.toEqual({ kind: 'not-started' });
  });

  it('refuses a store at any other revision, under the calling Journey', async () => {
    const { runRoot: run, dataRoot } = await runRoot();
    plantStore(dataRoot, cleanup.CREDENTIAL_CLEANUP_SCHEMA_VERSION - 1, 'ready');
    await expect(cleanup.recoverSyntheticCredentialCleanupState('J-99', dataRoot, run))
      .rejects.toThrow(/^J-99\/credential-cleanup-metadata-version$/u);
  });

  it('refuses a data root outside the run root', async () => {
    const { runRoot: run } = await runRoot();
    await expect(cleanup.recoverSyntheticCredentialCleanupState('J-98', resolve(run, 'other'), run))
      .rejects.toThrow(/^J-98\/credential-cleanup-metadata-root$/u);
  });
});

describe('the secret scan', () => {
  it('passes a data root without the secret and fails one holding it in any recorded encoding', async () => {
    const secret = 'sk-synthetic-not-a-real-key';
    const { dataRoot } = await runRoot();
    await writeFile(resolve(dataRoot, 'store', 'note.txt'), 'nothing here');
    await expect(cleanup.assertSecretsAbsentFromDataRoot('J-99', dataRoot, [secret])).resolves.toBeUndefined();
    await writeFile(resolve(dataRoot, 'store', 'leak.bin'), Buffer.from(secret, 'utf16le'));
    await expect(cleanup.assertSecretsAbsentFromDataRoot('J-99', dataRoot, [secret]))
      .rejects.toThrow(/^J-99\/secret-absent-from-product-data$/u);
    await expect(cleanup.assertSecretsAbsentFromDataRoot('J-99', dataRoot, [secret], 'model-secret-absent'))
      .rejects.toThrow(/^J-99\/model-secret-absent$/u);
  });
});
