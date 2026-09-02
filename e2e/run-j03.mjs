import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installJourneyCancellationCleanup, reportJourneyFailure } from './controller.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
let location = 'entry';

function at(next) { location = next; }
function requireJourney(condition, name) { if (!condition) throw new Error(`J-03/${name}`); }
function inside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function parseJourney() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-03', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(!Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-03' };
  const names = process.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
    : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) if (process.env[name] !== undefined) selected[name] = process.env[name];
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireJourney(systemRoot && isAbsolute(systemRoot), 'product-environment');
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  return selected;
}

async function createRendererManager(browser) {
  const root = await browser.newBrowserCDPSession();
  const renderers = new Map();
  const pending = new Map();
  let nextId = 1;
  root.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    let response;
    try { response = JSON.parse(message); } catch { return; }
    if (typeof response.id !== 'number') return;
    const key = `${sessionId}:${response.id}`;
    const completion = pending.get(key);
    if (!completion) return;
    pending.delete(key);
    if (response.error) completion.reject(new Error('J-03/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const attach = async (target) => {
    if (renderers.has(target.targetId)) return renderers.get(target.targetId);
    const { sessionId } = await root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    const send = async (method, params = {}) => {
      const id = nextId++;
      const key = `${sessionId}:${id}`;
      const response = new Promise((resolveResponse, rejectResponse) => {
        const timeout = setTimeout(() => {
          pending.delete(key);
          rejectResponse(new Error('J-03/renderer-cdp-timeout'));
        }, 60_000);
        timeout.unref();
        pending.set(key, {
          resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
          reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
        });
      });
      await root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
      return response;
    };
    const renderer = {
      evaluate: async (expression) => {
        const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        requireJourney(!response.exceptionDetails, `renderer-evaluate-${location}`);
        return response.result.value;
      },
    };
    renderers.set(target.targetId, renderer);
    await send('Runtime.enable');
    return renderer;
  };
  return async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const targets = (await root.send('Target.getTargets')).targetInfos.filter((item) => item.type === 'page');
      const current = await Promise.all(targets.map(attach));
      if (current.length === 1) return current[0];
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    throw new Error('J-03/renderer-window');
  };
}

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-03/${name}`);
}

async function main() {
  parseJourney();
  let browser;
  let runRoot;
  let tempParent;
  let cleanupPromise;
  const cleanup = () => (cleanupPromise ??= (async () => {
    await browser?.close().catch(() => undefined);
    browser = undefined;
    if (runRoot !== undefined) {
      requireJourney(tempParent !== undefined && dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j03-e2e-') && (await realpath(runRoot)) === runRoot, 'cleanup-target');
      await rm(runRoot, { recursive: true, force: true });
      runRoot = undefined;
    }
  })());
  const cancellation = installJourneyCancellationCleanup(cleanup);
  try {
    at('controller-imports');
    const denial = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
    (await import(pathToFileURL(denial).href)).installNodeNetworkDenial();
    const { electronExecutable } = await import('../tools/electron-runtime.mjs');
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    runRoot = await mkdtemp(join(tempParent, 'ai7-j03-e2e-'));
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const args = [
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
      '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
      resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
    ];
    requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
    browser = await chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
    const renderer = await (await createRendererManager(browser))();

    at('renderer-ready');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'ready');
    at('task-authorization-workbench');
    requireJourney(
      await renderer.evaluate(`typeof window.ai7.inspectTaskAuthorization==='function' && typeof window.ai7.prepareTaskAuthorization==='function' && typeof window.ai7.authorizeTaskAuthorization==='function'`),
      'task-authorization-api',
    );
  } finally {
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch(() => reportJourneyFailure('J-03', location));
