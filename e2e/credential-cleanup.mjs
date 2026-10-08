import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { journeyCheckFailure } from './controller.mjs';

// Issue #649: the one synthetic credential a Journey saves through the product, and the cleanup that removes it again when
// the product could not. J-03, J-04, J-09, J-10, J-11, J-12, J-13 and J-16 each carried their own copy of this block; a
// schema slice that missed one copy's version pin broke that Journey only after it had already failed, because only a
// failed product cleanup reaches the fallback. Every check here is built with `journeyCheckFailure` for the calling
// Journey and a constant label, as a runner's own checks are (`tests/unit/journey-check-markers.test.ts`).

/**
 * The terminal schema revision the service stamps on the Agent Data Root store, which the metadata fallback reads, and
 * which J-12 reads in the database packages it makes.
 * `tests/unit/credential-cleanup.test.ts` holds it equal to the highest `*_SCHEMA_VERSION` in
 * `src/service/task-authorization.ts`, so a schema slice moves it in the same pull request or a unit test fails.
 */
export const CREDENTIAL_CLEANUP_SCHEMA_VERSION = 60;

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREDENTIAL_CLEANUP_TIMEOUT_MS = 15_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;

function requireCleanup(journey, condition, name) {
  if (!condition) throw journeyCheckFailure(journey, name);
}

function inside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function hasErrorCode(error, code) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}

async function awaitFixedOperation(operation, timeoutMs, timeoutError) {
  operation.catch(() => undefined);
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(timeoutError), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fails `name` when any file under `root` holds one of `secrets`, its SHA-256 digest, or that digest in hex, upper-case
 * hex, base64 or base64url, each as UTF-8 or UTF-16LE.
 */
export async function assertSecretsAbsentFromDataRoot(journey, root, secrets, name = 'secret-absent-from-product-data') {
  const needles = secrets.flatMap((secret) => {
    const raw = Buffer.from(secret, 'utf8');
    const digest = createHash('sha256').update(raw).digest();
    const encoded = [
      secret,
      digest.toString('hex'),
      digest.toString('hex').toUpperCase(),
      digest.toString('base64'),
      digest.toString('base64url'),
    ];
    return [
      raw,
      digest,
      ...encoded.flatMap((value) => [Buffer.from(value, 'utf8'), Buffer.from(value, 'utf16le')]),
    ];
  });
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const metadata = await lstat(path);
      requireCleanup(journey, !metadata.isSymbolicLink(), `${name}-symlink`);
      if (metadata.isDirectory()) await visit(path);
      else if (metadata.isFile()) {
        const bytes = await readFile(path);
        requireCleanup(journey, !needles.some((needle) => bytes.includes(needle)), name);
      }
    }
  };
  await visit(root);
}

const CREDENTIAL_CLEANUP_SCRIPT = `
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (input.length > 128) process.exit(2);
});
process.stdin.once('end', async () => {
  try {
    const value = JSON.parse(input);
    if (value === null || typeof value !== 'object' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.credentialReference)) {
      process.exit(2);
    }
    const { pathToFileURL } = require('node:url');
    const { resolve } = require('node:path');
    const denial = await import(pathToFileURL(resolve('dist/shared/network-denial.mjs')).href);
    denial.installNodeNetworkDenial();
    const { AsyncEntry } = require('@napi-rs/keyring');
    const removed = await new AsyncEntry(
      'io.github.zhouy1017.ai7.model-service',
      'credential-reference:' + value.credentialReference,
    ).deleteCredential();
    process.exit(removed === true ? 0 : 3);
  } catch {
    process.exit(4);
  }
});
`;

/**
 * Removes the synthetic credential `credentialReference` from the OS credential store directly, through the product's
 * own Electron executable run as Node with `environment` (the runner's product environment) and network denial installed.
 */
export async function removeSyntheticCredentialWithElectron(journey, executable, environment, credentialReference) {
  requireCleanup(journey, isAbsolute(executable), 'credential-direct-cleanup-executable');
  requireCleanup(journey, UUID_PATTERN.test(credentialReference), 'credential-direct-cleanup-reference');
  requireCleanup(
    journey,
    process.env.NAPI_RS_NATIVE_LIBRARY_PATH === undefined && process.env.NAPI_RS_FORCE_WASI === undefined,
    'credential-direct-cleanup-override',
  );
  const timedOut = journeyCheckFailure(journey, 'credential-cleanup-timeout');
  const child = spawn(executable, ['-e', CREDENTIAL_CLEANUP_SCRIPT], {
    cwd: ROOT,
    env: { ...environment, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  });
  child.stdin.on('error', () => undefined);
  const terminal = new Promise((resolveTerminal, rejectTerminal) => {
    child.once('error', rejectTerminal);
    child.once('exit', (code, signal) => resolveTerminal({ code, signal }));
  });
  terminal.catch(() => undefined);
  child.stdin.end(JSON.stringify({ credentialReference }));
  let result;
  try {
    result = await awaitFixedOperation(terminal, CREDENTIAL_CLEANUP_TIMEOUT_MS, timedOut);
  } catch (error) {
    try { child.kill('SIGKILL'); } catch {
      // The bounded terminal observation below remains authoritative.
    }
    try {
      await awaitFixedOperation(terminal, FORCE_EXIT_TIMEOUT_MS, timedOut);
    } catch {
      child.unref();
    }
    throw error;
  }
  requireCleanup(journey, result.code === 0 && result.signal === null, 'credential-direct-cleanup-unconfirmed');
}

/**
 * Reads, without writing, what the store under `dataRoot` records of the one Main Editorial Role connection: nothing yet
 * (`not-started`), its credential already removed (`removed`), or the reference the direct cleanup must remove.
 */
export async function recoverSyntheticCredentialCleanupState(journey, dataRoot, runRoot) {
  requireCleanup(journey, dataRoot === resolve(runRoot, 'data') && inside(runRoot, dataRoot), 'credential-cleanup-metadata-root');
  const databasePath = resolve(dataRoot, 'store', 'ai7.sqlite');
  let metadata;
  try {
    metadata = await lstat(databasePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { kind: 'not-started' };
    throw journeyCheckFailure(journey, 'credential-cleanup-metadata');
  }
  requireCleanup(journey, metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(databasePath)) === databasePath,
    'credential-cleanup-metadata-file');
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    throw journeyCheckFailure(journey, 'credential-cleanup-metadata');
  }
  try {
    database.exec('PRAGMA query_only = ON;');
    requireCleanup(
      journey,
      database.prepare('PRAGMA user_version').get()?.user_version === CREDENTIAL_CLEANUP_SCHEMA_VERSION,
      'credential-cleanup-metadata-version',
    );
    const rows = database.prepare(
      `SELECT connection_id, role_id, connection_name, provider_id, model_id,
              adapter_revision, configuration_revision, approved_fallback_chain,
              credential_slot, credential_reference, credential_operation_state
       FROM model_service_connections
       LIMIT 2`,
    ).all();
    requireCleanup(journey, rows.length <= 1, 'credential-cleanup-metadata-cardinality');
    if (rows.length === 0) return { kind: 'not-started' };
    const row = rows[0];
    requireCleanup(
      journey,
      row.connection_id === 'main-editorial-deepseek-v4-pro' && row.role_id === 'main-editorial' &&
      typeof row.connection_name === 'string' && row.connection_name.isWellFormed() &&
      row.connection_name.trim().length >= 1 && row.connection_name.trim().length <= 80 &&
      row.provider_id === 'deepseek-open-platform' && row.model_id === 'deepseek-v4-pro' &&
      row.adapter_revision === 1 && row.configuration_revision === 1 && row.approved_fallback_chain === '[]' &&
      row.credential_slot === 'deepseek-api-key' && typeof row.credential_reference === 'string' &&
      UUID_PATTERN.test(row.credential_reference) && ['ready', 'missing', 'needs-attention'].includes(row.credential_operation_state),
      'credential-cleanup-metadata-binding',
    );
    return row.credential_operation_state === 'missing'
      ? { kind: 'removed' }
      : { kind: 'reference', credentialReference: row.credential_reference };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${journey}/`)) throw error;
    throw journeyCheckFailure(journey, 'credential-cleanup-metadata');
  } finally {
    database.close();
  }
}
