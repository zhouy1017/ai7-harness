import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The developer-host enrollment helper for the `opencode-go` development credential (ADR 0067).
 *
 * It is the only thing that ever reads the Owner's key file, and it exists so that no agent, prompt,
 * log, or repository file has to. It writes the value straight into the OS Protected Secret Store
 * under the same service name and the same `credential-reference:<uuid>` entry name Electron main
 * uses, through the same pinned `@napi-rs/keyring` carrier, and then says nothing:
 *
 *   node tools/enroll-dev-credential.mjs --slot opencode-go --from-file <path>   (silent; exit 0)
 *   node tools/enroll-dev-credential.mjs --slot opencode-go --check              (prints `present`, `absent`, or `unavailable`)
 *
 * Silence is the contract on the store path: it prints nothing on stdout and nothing on stderr,
 * because anything it printed would be one process away from the value itself, and a failure there
 * is an exit code and nothing more. `--check` prints exactly one of three words, always, on every
 * path, and never the value, its length, or its age. `unavailable` means the check itself could not
 * be performed — carrier unresolvable, unsupported platform or architecture, a native-carrier
 * override, or a CI host — and never means the credential is missing; the missing case is `absent`,
 * exit 0. `unavailable` exits non-zero. The helper refuses to run under CI, refuses a native-carrier
 * override, and refuses any slot but `opencode-go`, so it cannot become a general secret-writing tool.
 *
 * The two keyring identity literals below are deliberately duplicated from
 * `src/shared/protected-secret-identity.ts`: this file is plain ESM run by `node` directly, before
 * and outside any TypeScript build, so it cannot import them. `tests/unit/enroll-dev-credential.test.ts`
 * pins the duplicates equal to the owning module's constants.
 */
const PROTECTED_SECRET_SERVICE_NAME = 'io.github.zhouy1017.ai7.model-service';
const DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE = 'a7c0de00-5040-4f27-9e13-6b1f2c8d4a55';

const SLOTS = new Map([['opencode-go', DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE]]);
const MAX_SECRET_BYTES = 16_384;

class EnrollmentError extends Error {}

function requireEnrollment(condition) {
  if (!condition) throw new EnrollmentError('AI7_ENROLLMENT_INVALID');
}

/** Parse the exact argument form; anything else, including an unknown slot or a mixed mode, refuses. */
export function parseEnrollmentArguments(argv) {
  requireEnrollment(Array.isArray(argv));
  const values = new Map();
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--check') {
      requireEnrollment(!check);
      check = true;
      continue;
    }
    requireEnrollment(key === '--slot' || key === '--from-file');
    const value = argv[index + 1];
    requireEnrollment(typeof value === 'string' && value.length > 0 && !values.has(key));
    values.set(key, value);
    index += 1;
  }
  const slot = values.get('--slot');
  requireEnrollment(typeof slot === 'string' && SLOTS.has(slot));
  const fromFile = values.get('--from-file');
  requireEnrollment(check ? fromFile === undefined : typeof fromFile === 'string');
  return {
    mode: check ? 'check' : 'store',
    slot,
    credentialReference: SLOTS.get(slot),
    fromFile: fromFile === undefined ? null : resolve(fromFile),
  };
}

/** CI is never a developer host: the credential is human-attended by construction (ADR 0065, ADR 0067). */
export function continuousIntegrationPresent(env = process.env) {
  return env.CI !== undefined || env.GITHUB_ACTIONS !== undefined || env.AI7_E2E_JOURNEY !== undefined;
}

function nativeOverridePresent(env = process.env) {
  return env.NAPI_RS_NATIVE_LIBRARY_PATH !== undefined || env.NAPI_RS_FORCE_WASI !== undefined;
}

async function openEntry(credentialReference, {
  env = process.env,
  platform = process.platform,
  architecture = process.arch,
  importKeyring = () => import('@napi-rs/keyring'),
} = {}) {
  requireEnrollment(!nativeOverridePresent(env));
  requireEnrollment((platform === 'win32' && architecture === 'x64') || (platform === 'darwin' && architecture === 'arm64'));
  const module = await importKeyring();
  const Entry = module.AsyncEntry;
  requireEnrollment(typeof Entry === 'function');
  return new Entry(PROTECTED_SECRET_SERVICE_NAME, `credential-reference:${credentialReference}`);
}

/**
 * The entire `--check` reading, collapsed to its three-word result. Every precondition failure —
 * CI, a native-carrier override, an unsupported platform or architecture, or an unresolvable
 * carrier — and any store-access failure below it are indistinguishable from one another on
 * purpose: `unavailable` says only that the check could not run, never why, and never `absent`.
 * The dependencies are injectable so a test can prove the unresolvable-carrier path without ever
 * opening a real OS keyring.
 */
export async function resolveCheckReading(credentialReference, deps = {}) {
  const { env = process.env } = deps;
  try {
    requireEnrollment(!continuousIntegrationPresent(env));
    const entry = await openEntry(credentialReference, deps);
    const value = await entry.getPassword();
    return typeof value === 'string' && value.length > 0 ? 'present' : 'absent';
  } catch {
    return 'unavailable';
  }
}

/**
 * Read one credential value from a file the Owner names. The file is read as UTF-8 and trimmed of
 * surrounding whitespace only, so a trailing newline from an editor cannot corrupt the value; the
 * value itself is never inspected, measured aloud, or returned to any caller but the store.
 */
async function readSecret(path) {
  requireEnrollment(isAbsolute(path));
  const raw = await readFile(path, 'utf8');
  const secret = raw.trim();
  requireEnrollment(secret.length > 0 && secret.length <= MAX_SECRET_BYTES && secret.isWellFormed());
  return secret;
}

async function main() {
  const argv = process.argv.slice(2);
  const request = parseEnrollmentArguments(argv);
  if (request.mode === 'check') {
    const reading = await resolveCheckReading(request.credentialReference);
    process.stdout.write(`${reading}\n`);
    if (reading === 'unavailable') process.exitCode = 1;
    return;
  }
  requireEnrollment(!continuousIntegrationPresent());
  const entry = await openEntry(request.credentialReference);
  await entry.setPassword(await readSecret(request.fromFile));
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  // No diagnostic, ever: a failure is an exit code, because the only interesting local state is the value.
  main().catch(() => {
    process.exitCode = 1;
  });
}
