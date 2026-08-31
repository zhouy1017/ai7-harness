import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installJourneyCancellationCleanup, reportJourneyFailure } from './controller.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PROFILE_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
const PROFILE_BYTES = 263;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let location = 'entry';

function at(next) { location = next; }
function requireJourney(condition, name) { if (!condition) throw new Error(`J-15/${name}`); }
function inside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function parseJourney() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-15', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(!Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-15' };
  const names = process.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
    : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) if (process.env[name] !== undefined) selected[name] = process.env[name];
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireJourney(systemRoot && isAbsolute(systemRoot), 'product-environment');
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else {
    selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
  return selected;
}

async function createLoopbackSentinel() {
  let observedRequests = 0;
  let runtimeFault = false;
  let closed = false;
  const server = createServer((_request, response) => {
    observedRequests += 1;
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '21' });
    response.end('AI7_LOOPBACK_SENTINEL');
  });
  server.on('error', () => { runtimeFault = true; });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(new Error('J-15/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  requireJourney(address && typeof address === 'object' && address.address === '127.0.0.1' && address.port > 0, 'loopback-address');
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j15-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
      requireJourney(!runtimeFault, 'loopback-runtime');
    },
  };
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
    if (response.error) completion.reject(new Error('J-15/renderer-cdp-response'));
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
          rejectResponse(new Error('J-15/renderer-cdp-timeout'));
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
      send,
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
  return {
    list: async () => {
      const targets = (await root.send('Target.getTargets')).targetInfos.filter((item) => item.type === 'page');
      return Promise.all(targets.map(attach));
    },
  };
}

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-15/${name}`);
}

async function waitForRenderer(manager, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const renderers = await manager.list();
    if (renderers.length === 1) return renderers[0];
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-15/${name}`);
}

async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), name);
}

async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>item.textContent===${JSON.stringify(label)}); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function clickBook(renderer, bookId, name) {
  await assertRenderer(renderer, `(() => { const node=document.querySelector('button[data-book-id=${JSON.stringify(bookId)}]'); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!(input instanceof HTMLInputElement))return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, name);
}

async function createEmptyBook(renderer, title) {
  await click(renderer, '新建图书', 'empty-open');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, 'empty-form');
  await fill(renderer, '#empty-book-title', title, 'empty-title');
  await click(renderer, '复核创建', 'empty-review');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, 'empty-review-ready');
  await click(renderer, '新建图书', 'empty-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-manuscript-state="empty"]')`, 'empty-created', 120_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId`);
  requireJourney(UUID_PATTERN.test(bookId), 'empty-book-id');
  return bookId;
}

async function focusAction(renderer, action, name) {
  await renderer.evaluate(`(() => { const active=document.activeElement; if(active instanceof HTMLElement)active.blur(); return true; })()`);
  for (let count = 0; count < 40; count += 1) {
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab' });
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
    if (await renderer.evaluate(`document.activeElement?.dataset.nativeArtifactAction===${JSON.stringify(action)} && document.activeElement.matches(':focus-visible')`).catch(() => false)) return;
  }
  throw new Error(`J-15/${name}`);
}

async function activateFocused(renderer, key) {
  const descriptor = key === 'Enter'
    ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: process.platform === 'darwin' ? 36 : 13, text: '\r', unmodifiedText: '\r' }
    : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: process.platform === 'darwin' ? 49 : 32, text: ' ', unmodifiedText: ' ' };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor });
  const { text: _text, unmodifiedText: _unmodifiedText, ...released } = descriptor;
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...released });
}

async function requireRetainedCarrier(dataRoot) {
  let current = dataRoot;
  for (const segment of ['native-artifacts', 'sha256', PROFILE_DIGEST.slice(0, 2), PROFILE_DIGEST]) {
    current = resolve(current, segment);
    const metadata = await lstat(current);
    requireJourney(metadata.isDirectory() && !metadata.isSymbolicLink() && (await realpath(current)) === current, 'retained-directory');
  }
  const carrier = resolve(current, 'package.json');
  const metadata = await lstat(carrier);
  const bytes = await readFile(carrier);
  requireJourney(
    metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(carrier)) === carrier &&
      bytes.length === PROFILE_BYTES && createHash('sha256').update(bytes).digest('hex') === PROFILE_DIGEST,
    'retained-carrier',
  );
}

async function main() {
  parseJourney();
  let loopback;
  let loopbackAcquisition;
  let browser;
  let browserAcquisition;
  let runRoot;
  let runRootAcquisition;
  let tempParent;
  let cleanupPromise;
  let finalCleanupRequested = false;
  const closeBrowser = async () => {
    let owned = browser;
    if (owned === undefined && browserAcquisition !== undefined) owned = await browserAcquisition.catch(() => undefined);
    if (owned !== undefined) await owned.close();
    browser = undefined;
    browserAcquisition = undefined;
  };
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      await closeBrowser();
      const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
      await ownedLoopback?.close().catch(() => undefined);
      loopback = undefined;
      const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
      if (ownedRoot !== undefined) {
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j15-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
        await rm(ownedRoot, { recursive: true, force: true });
        runRoot = undefined;
      }
    })();
    return cleanupPromise;
  };
  const cancellation = installJourneyCancellationCleanup(cleanup, async () => {
    if (!finalCleanupRequested) await closeBrowser();
  });
  try {
    at('controller-loopback');
    cancellation.throwIfRequested();
    loopbackAcquisition = createLoopbackSentinel();
    loopback = await loopbackAcquisition;
    cancellation.throwIfRequested();

    at('controller-imports');
    const denial = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
    (await import(pathToFileURL(denial).href)).installNodeNetworkDenial();
    const { electronExecutable } = await import('../tools/electron-runtime.mjs');
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j15-e2e-'));
    runRoot = await runRootAcquisition;
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j15-e2e-'), 'temp-root');
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const launch = async () => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      cancellation.throwIfRequested();
      return createRendererManager(browser);
    };

    at('initial-empty-book');
    let manager = await launch();
    let renderer = await waitForRenderer(manager, 'initial-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'initial-ready');
    // Product readiness is emitted only after ServiceClient accepts the exact dormant-Harness
    // handshake, including zero configured agents, agents, sessions, Providers, tools, and assembled tools.
    await assertRenderer(renderer, `document.documentElement.dataset.ai7ProductReady==='true'`, 'exact-service-readiness-zero-harness');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
    await renderer.send('Page.setBypassCSP', { enabled: false });
    requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'offline-product');
    const bookA = await createEmptyBook(renderer, 'J15 空图书甲');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-state="available-to-install"]')`, 'available-card');
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.native-artifact-card');
      const text=card?.textContent??'';
      return card?.dataset.nativeArtifactIdentity==='@ai7/editorial-workspace-profile' &&
        text.includes('DSH Profile') && text.includes('1.0.0') && text.includes('仓库内置') && text.includes('AI7 root license') &&
        text.includes('config/native-artifact-sources/editorial-workspace-profile/package.json') && text.includes('263 bytes') &&
        text.includes(${JSON.stringify(PROFILE_DIGEST)}) && text.includes('声明式 · Provider-free · 兼容') &&
        text.includes('Main Editorial Role') && ['Capability','Readable Scope','Provider Binding','Credential','Network','Effect','Enrollment','Apply'].every((label)=>text.includes(label)) &&
        (text.match(/空（无）/g)?.length??0)===8 &&
        text.includes('不创建 Task、Plan、Run 或 Session') && text.includes('不读取图书、稿件或来源内容') &&
        text.includes('不授予 Provider、凭据、网络、Effect、Enrollment 或 Apply 权限') &&
        Boolean(card.querySelector('[data-native-artifact-action="install-disabled"]')) && !card.querySelector('[data-native-artifact-action="enable-current-book"]') &&
        window.ai7.inspectEditorialWorkspaceProfile.length===0 && window.ai7.installEditorialWorkspaceProfile.length===0 && window.ai7.enableEditorialWorkspaceProfile.length===0 &&
        !Object.keys(window.ai7).some((key)=>/provider|session/i.test(key));
    })()`, 'exact-authority-card');

    at('install-disabled');
    await focusAction(renderer, 'install-disabled', 'install-keyboard-focus');
    await activateFocused(renderer, 'Enter');
    await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='busy' || document.querySelector('[data-native-artifact-state="installed-disabled"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'install-keyboard-activation', 5_000);
    at('install-effect');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-state="installed-disabled"] [data-native-artifact-action="enable-current-book"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'installed-disabled-settled', 120_000);
    await assertRenderer(renderer, `Boolean(document.querySelector('[data-native-artifact-state="installed-disabled"] [data-native-artifact-action="enable-current-book"]'))`, 'installed-disabled');
    await assertRenderer(renderer, `!document.querySelector('[data-native-artifact-action="install-disabled"]')`, 'separate-enable-only-after-install');
    await requireRetainedCarrier(dataRoot);

    at('enable-current-book');
    await focusAction(renderer, 'enable-current-book', 'enable-keyboard-focus');
    await activateFocused(renderer, ' ');
    await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='busy' || document.querySelector('[data-native-artifact-state="enabled-for-book"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'enable-keyboard-activation', 5_000);
    at('enable-effect');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-state="enabled-for-book"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'enabled-book-a-settled', 120_000);
    await assertRenderer(renderer, `Boolean(document.querySelector('[data-native-artifact-state="enabled-for-book"]'))`, 'enabled-book-a');
    await assertRenderer(renderer, `!document.querySelector('.native-artifact-actions button') && document.querySelector('.native-artifact-card')?.textContent.includes('已安装 · 已为本图书启用')`, 'enabled-no-repeat-action');
    await closeBrowser();

    at('restart-persistence');
    manager = await launch();
    renderer = await waitForRenderer(manager, 'restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    at('restart-open-book-a');
    await clickBook(renderer, bookA, 'open-book-a-after-restart');
    await waitFor(
      renderer,
      `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`,
      'book-a-route-after-restart',
      120_000,
    );
    await assertRenderer(renderer, `Boolean(document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]'))`, 'book-a-overview-after-restart');
    at('restart-enabled-book-a');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}] [data-native-artifact-state]')`, 'book-a-after-restart');
    const restartedLifecycle = await renderer.evaluate(`document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}] [data-native-artifact-state]')?.dataset.nativeArtifactState`);
    if (restartedLifecycle !== 'enabled-for-book') {
      at(restartedLifecycle === 'installed-disabled' ? 'restart-book-a-disabled' : 'restart-book-a-unavailable');
      requireJourney(false, 'book-a-enabled-after-restart');
    }
    await click(renderer, '返回图书列表', 'return-after-book-a');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'landing-before-book-b');

    at('second-book-disabled');
    const bookB = await createEmptyBook(renderer, 'J15 空图书乙');
    requireJourney(bookB !== bookA, 'distinct-books');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}] [data-native-artifact-state="installed-disabled"]')`, 'book-b-disabled-after-restart');
    await assertRenderer(renderer, `Boolean(document.querySelector('[data-native-artifact-action="enable-current-book"]')) && !document.querySelector('[data-native-artifact-action="install-disabled"]')`, 'book-b-separate-enablement');

    at('accessibility-reflow-forced-colors');
    await focusAction(renderer, 'enable-current-book', 'book-b-keyboard-focus');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(renderer, `document.documentElement.scrollWidth<=document.documentElement.clientWidth+2 && getComputedStyle(document.querySelector('.native-artifact-facts')).gridTemplateColumns.split(' ').length===1`, 'zoom-reflow');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.native-artifact-card')).boxShadow==='none' && getComputedStyle(document.querySelector('.native-artifact-card')).borderStyle!=='none' && getComputedStyle(document.querySelector('.native-artifact-status')).borderStyle!=='none'`, 'forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('zero-activity');
    await assertRenderer(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && !Object.keys(window.ai7).some((key)=>/provider|session/i.test(key))`, 'exact-service-readiness-remained-zero');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-network-provider-session');
    await closeBrowser();
    await loopback.close();
  } finally {
    finalCleanupRequested = true;
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch(() => reportJourneyFailure('J-15', location));
