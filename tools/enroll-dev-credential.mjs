import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_CREDENTIAL_SLOTS } from './provider-credential-slots.generated.mjs';

/**
 * The developer-host enrollment helper for the development credentials (ADR 0067, ADR 0073 §4).
 *
 * **Only `opencode-go` enrolment is authorized** (ADR 0067). The helper accepts every slot a provider
 * document fixes a development Credential Reference for, because ADR 0073 §4 makes its slot list
 * generated from the documents; but such a slot is a place for a key, not a permission to enrol one.
 * ADR 0073 §5 authorizes no credential and ADR 0080 §5 defers keys (「先支持后添加key」): no other
 * slot is enrolled until a record names it.
 *
 * It is the only thing that ever reads the Owner's key file, and it exists so that no agent, prompt,
 * log, or repository file has to. It writes the value straight into the OS Protected Secret Store
 * under the same service name and the same `credential-reference:<uuid>` entry name Electron main
 * uses, through the same pinned `@napi-rs/keyring` carrier, and then says nothing:
 *
 *   node tools/enroll-dev-credential.mjs --slot opencode-go --from-file <path>   (silent; exit 0)
 *   node tools/enroll-dev-credential.mjs --slot opencode-go --check              (prints `present`, `absent`, or `unavailable`)
 *   node tools/enroll-dev-credential.mjs --slot <slot> --credential-reference <uuid> --from-file <path>   (silent; exit 0)
 *
 * The third form (Issue #811 brief item 5, an ADR 0067 extension recorded there) writes one Owner-supplied development key
 * under a production connection's own Credential Reference — the one the product minted when its 模型服务 connection was
 * configured on a throwaway data root — so one live evidence Task can run through the ordinary-production path. It accepts
 * only the two slots an ordinary-production binding configures, a well-formed reference, and never a reference any provider
 * document fixes for development; it refuses CI and a native-carrier override exactly as the other two forms do, and it is
 * silent exactly as the store form is. The product never invokes this helper.
 *
 * Silence is the contract on the store path: it prints nothing on stdout and nothing on stderr,
 * because anything it printed would be one process away from the value itself, and a failure there
 * is an exit code and nothing more. `--check` prints exactly one of three words, always, on every
 * path, and never the value, its length, or its age. `unavailable` means the check itself could not
 * be performed — carrier unresolvable, unsupported platform or architecture, a native-carrier
 * override, or a CI host — and never means the credential is missing; the missing case is `absent`,
 * exit 0. `unavailable` exits non-zero. The helper refuses to run under CI, refuses a native-carrier
 * override, and refuses any slot whose provider document fixes no development Credential Reference
 * (the production connection's `deepseek-api-key` among them), so it cannot become a general
 * secret-writing tool: its slot list is generated from `config/providers/` (ADR 0073 §4), one slot per
 * configured provider whose document fixes a development Credential Reference, each under that reference.
 *
 * The keyring service name below is deliberately duplicated from
 * `src/shared/protected-secret-identity.ts`: this file is plain ESM run by `node` directly, before
 * and outside any TypeScript build, so it cannot import it. The slot list is the generated plain-ESM
 * twin of the TypeScript configuration. `tests/unit/enroll-dev-credential.test.ts` pins both equal to
 * the owning modules.
 */
const PROTECTED_SECRET_SERVICE_NAME = 'io.github.zhouy1017.ai7.model-service';

const SLOTS = new Map(DEVELOPMENT_CREDENTIAL_SLOTS);
/** Every development Credential Reference a document fixes: the named-reference form never writes under one of these. */
const DEVELOPMENT_REFERENCES = new Set([...SLOTS.values()].map((reference) => reference.toLowerCase()));
/**
 * The slots an ordinary-production binding configures (Issue #811): Go and DeepSeek 开放平台（官方）. Duplicated from the
 * service's allowed bindings because this file runs before any build; `tests/unit/enroll-dev-credential.test.ts` pins them equal.
 */
export const PRODUCTION_CONNECTION_SLOTS = Object.freeze(['opencode-go', 'deepseek-api-key']);
const CREDENTIAL_REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    requireEnrollment(key === '--slot' || key === '--from-file' || key === '--credential-reference');
    const value = argv[index + 1];
    requireEnrollment(typeof value === 'string' && value.length > 0 && !values.has(key));
    values.set(key, value);
    index += 1;
  }
  const slot = values.get('--slot');
  const named = values.get('--credential-reference');
  if (named !== undefined) {
    // The named-reference form: a production connection's own reference, never a development one, and only a store.
    const fromFile = values.get('--from-file');
    requireEnrollment(!check && typeof fromFile === 'string' && typeof slot === 'string' && PRODUCTION_CONNECTION_SLOTS.includes(slot) &&
      CREDENTIAL_REFERENCE_PATTERN.test(named) && !DEVELOPMENT_REFERENCES.has(named.toLowerCase()));
    return { mode: 'store-named', slot, credentialReference: named.toLowerCase(), fromFile: resolve(fromFile) };
  }
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
