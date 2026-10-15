import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The local ordinary-production launch (Issue #811): a thin wrapper over `start-built` that binds the trusted
// `ordinary-production` scope, resolves the default data location when `--data-root` is omitted, says once where the
// data lives, and refuses every development-only argument. `development-ci` stays the bare default of `start-built`.
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const START_BUILT = resolve(ROOT, 'tools', 'start-built.mjs');
/** The arguments that belong to developer-live alone (ADR 0065, Issue #808); a production launch never carries one. */
export const DEVELOPMENT_ONLY_ARGUMENTS = ['--run-budget-ceiling', '--provider-cache-root', '--validation-case', '--validation-delta'];

function requireLaunch(condition) {
  if (!condition) throw new Error('AI7_PRODUCTION_LAUNCH_INVALID');
}

/**
 * The default data location of this platform: `%LOCALAPPDATA%/ai7/production` on Windows and
 * `~/Library/Application Support/ai7/production` on macOS. Any other platform names none.
 */
export function defaultProductionDataRoot({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA;
    requireLaunch(typeof localAppData === 'string' && isAbsolute(localAppData));
    return resolve(localAppData, 'ai7', 'production');
  }
  requireLaunch(platform === 'darwin' && isAbsolute(home));
  return resolve(home, 'Library', 'Application Support', 'ai7', 'production');
}

/**
 * Parse the production form: nothing, or exactly `--data-root <absolute path>`. The scope is this wrapper's to bind, so a
 * scope argument is refused like the four development-only ones.
 */
export function parseProductionLaunchArguments(args, defaults = {}) {
  requireLaunch(Array.isArray(args));
  const rest = args[0] === '--' ? args.slice(1) : args;
  requireLaunch(!rest.some((arg) => DEVELOPMENT_ONLY_ARGUMENTS.includes(arg) || arg === '--trusted-operational-scope'));
  if (rest.length === 0) return { dataRoot: defaultProductionDataRoot(defaults), defaulted: true };
  requireLaunch(rest.length === 2 && rest[0] === '--data-root' && typeof rest[1] === 'string' && isAbsolute(rest[1]));
  return { dataRoot: resolve(rest[1]), defaulted: false };
}

/** The `start-built` arguments this launch forwards. */
export function startBuiltArguments(dataRoot) {
  return ['--data-root', dataRoot, '--trusted-operational-scope', 'ordinary-production'];
}

async function main() {
  const launch = parseProductionLaunchArguments(process.argv.slice(2));
  process.stdout.write(`AI7 本机正式使用 · 产品数据位置：${launch.dataRoot}\n`);
  const child = spawn(process.execPath, [START_BUILT, ...startBuiltArguments(launch.dataRoot)], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });
  const forward = () => child.kill();
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);
  process.exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(() => {
    console.error('AI7_START_FAILED/production-arguments');
    process.exitCode = 1;
  });
}
