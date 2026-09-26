import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// J-13 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012): 书系 as a stable global destination. Three empty Books; 新建书系
// with a name refused past its bound; one Series' 成员与共享范围; 加入书系 through the four-part Series Membership Impact Preview
// whose only committing action is exactly `加入书系`; a preview another change moved past, refused and read again; 书库's
// search by 书系; each Book's own 书系 records on its 工作概览; 移出书系 as prospective; a restart that keeps everything; and the
// preview by keyboard, at 200% and under forced colours. The Books are empty and every name is the runner's own: no
// manuscript, no credential, no Provider.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRST = '星河之一';
const SECOND = '星河之二';
const OUTSIDE = '书系之外';
const SERIES = '星河三部曲';
const NOTE = '同一个宇宙里的三部长篇。';
const SERIES_LEDE = '书系把相关的图书放在一起。加入书系只让以后的任务可以明确选用书系的范围：不会让一本书读到另一本书的原文，也不会自动授权任何任务。';
const SCOPE_NOTE = '成员只表示以后的任务可以明确选用这个书系的范围；这里不汇总、也不打开成员图书的原文。';
const STALE = '预览之后，书系成员或相关记录有了变化；请重新查看影响，再决定。';
const GROUPS = [['future-tasks', '未来任务'], ['runs', '已授权或正在运行'], ['knowledge-learning', '书系知识与学习'], ['history', '历史记录']];
let location = 'entry';

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-13', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-13/${name}`);
  if (detail !== undefined) error.detail = detail;
  throw error;
}
function inside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function parseJourney() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-13', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-13' };
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
    server.once('error', () => rejectListen(new Error('J-13/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  requireJourney(address && typeof address === 'object' && address.address === '127.0.0.1' && address.port > 0, 'loopback-address');
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j13-network-probe`,
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
  const guard = (request) => settleOnBrowserDisconnect(browser, request);
  const root = await guard(browser.newBrowserCDPSession());
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
    if (response.error) completion.reject(new Error('J-13/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const attach = async (target) => {
    if (renderers.has(target.targetId)) return renderers.get(target.targetId);
    const { sessionId } = await guard(root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }));
    const send = async (method, params = {}) => {
      const id = nextId++;
      const key = `${sessionId}:${id}`;
      const response = new Promise((resolveResponse, rejectResponse) => {
        const timeout = setTimeout(() => {
          pending.delete(key);
          rejectResponse(new Error('J-13/renderer-cdp-timeout'));
        }, 60_000);
        timeout.unref();
        pending.set(key, {
          resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
          reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
        });
      });
      await guard(root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }));
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
      const targets = (await guard(root.send('Target.getTargets'))).targetInfos.filter((item) => item.type === 'page');
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
  throw new Error(`J-13/${name}`);
}

async function waitForRenderer(manager, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const renderers = await manager.list();
    if (renderers.length === 1) return renderers[0];
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-13/${name}`);
}

async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), name);
}

async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>item.textContent===${JSON.stringify(label)}); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function clickSelector(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!(node instanceof HTMLElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!(input instanceof HTMLInputElement)&&!(input instanceof HTMLTextAreaElement))return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return input.value===${JSON.stringify(value)}; })()`, name);
}

async function choose(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const select=document.querySelector(${JSON.stringify(selector)}); if(!(select instanceof HTMLSelectElement))return false; select.value=${JSON.stringify(value)}; select.dispatchEvent(new Event('change',{bubbles:true})); return select.value===${JSON.stringify(value)}; })()`, name);
}

const KEYS = Object.freeze({
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
});
async function press(renderer, key) {
  const descriptor = KEYS[key];
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor });
  const { text: _text, unmodifiedText: _unmodifiedText, ...released } = descriptor;
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...released });
}

const status = `(document.querySelector('#persistence-status')?.textContent ?? '')`;

async function createEmptyBook(renderer, title) {
  await click(renderer, '新建图书', `${title}-open`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, `${title}-form`);
  await fill(renderer, '#empty-book-title', title, `${title}-title`);
  await click(renderer, '复核创建', `${title}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, `${title}-review-ready`);
  await click(renderer, '新建图书', `${title}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-manuscript-state="empty"]')`, `${title}-created`, 120_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId`);
  requireJourney(UUID_PATTERN.test(bookId), `${title}-book-id`);
  return bookId;
}

async function backToLibrary(renderer, name) {
  await click(renderer, '返回图书列表', `${name}-back`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, `${name}-library`);
}

/** Where focus stands inside a page: an action by name, a field by its id or name, or the preview's heading. */
const FOCUS = `(() => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active.classList.contains('series-preview-heading')) return 'preview-heading';
  return active.dataset.seriesAction ?? (active.id || active.getAttribute('name') || active.tagName);
})()`;

/** 书系's list as the editor reads it: each Series' entry, the empty line, the form and any refusal, and where focus is. */
const READ_SERIES_LIST = `(() => {
  const screen = document.querySelector('[data-screen="series-list"]');
  const root = screen?.querySelector('.series-list-page');
  if (!(root instanceof HTMLElement) || root.dataset.seriesCount === undefined) return null;
  const create = root.querySelector('[data-series-action="create"]');
  return {
    lede: screen.querySelector('.series-lede')?.textContent ?? null,
    empty: root.querySelector('.series-empty')?.textContent ?? null,
    items: Array.from(root.querySelectorAll('li.series-item'), (item) => [item.dataset.seriesId ?? null, item.querySelector('[data-series-action="open"]')?.textContent ?? null, item.querySelector('.series-item-note')?.textContent ?? null]),
    form: root.querySelector('form.series-create-form') !== null,
    createDisabled: create instanceof HTMLButtonElement ? create.disabled : null,
    refusal: root.querySelector('.series-refusal')?.textContent ?? null,
    focus: root.contains(document.activeElement) ? ${FOCUS} : null,
  };
})()`;

/** One Series' 成员与共享范围 as the editor reads it: members, the chooser, the preview, any refusal, the records, and focus. */
const READ_SERIES = `(() => {
  const screen = document.querySelector('[data-screen="series"]');
  const root = screen?.querySelector('.series-page');
  if (!(root instanceof HTMLElement) || root.dataset.seriesId === undefined) return null;
  const preview = root.querySelector('.series-preview');
  const addOpen = root.querySelector('[data-series-action="add-open"]');
  const look = root.querySelector('[data-series-action="preview"]');
  return {
    seriesId: root.dataset.seriesId,
    heading: screen.querySelector('h2')?.textContent ?? null,
    note: screen.querySelector('.series-note')?.textContent ?? null,
    scopeNote: root.querySelector('.series-scope-note')?.textContent ?? null,
    membersEmpty: root.querySelector('.series-members-empty')?.textContent ?? null,
    members: Array.from(root.querySelectorAll('table.series-member-table tbody tr'), (row) => [row.dataset.bookId ?? null, ...Array.from(row.children, (cell) => cell.textContent ?? '')]),
    columns: Array.from(root.querySelectorAll('table.series-member-table thead th'), (cell) => cell.textContent ?? ''),
    addOpen: addOpen instanceof HTMLButtonElement ? !addOpen.disabled : null,
    addNone: root.querySelector('.series-add-none')?.textContent ?? null,
    chooser: root.querySelector('.series-add-chooser') === null ? null : Array.from(root.querySelectorAll('input[name="series-add-book"]'), (radio) => [radio.value, radio.checked, radio.parentElement?.textContent ?? '']),
    lookDisabled: look instanceof HTMLButtonElement ? look.disabled : null,
    preview: preview === null ? null : {
      kind: preview.dataset.previewKind ?? null,
      bookId: preview.dataset.bookId ?? null,
      heading: preview.querySelector('.series-preview-heading')?.textContent ?? null,
      identity: preview.querySelector('.series-preview-identity')?.textContent ?? null,
      groups: Array.from(preview.querySelectorAll(':scope > .series-impact-group'), (group) => [group.dataset.impactGroup ?? null, group.querySelector('h5')?.textContent ?? null,
        Array.from(group.querySelectorAll('.series-impact-changes li'), (line) => line.textContent ?? ''), Array.from(group.querySelectorAll('.series-impact-unchanged li'), (line) => line.textContent ?? '')]),
      actions: Array.from(preview.querySelectorAll('[data-series-action]'), (node) => [node.dataset.seriesAction ?? null, node.textContent ?? '']),
    },
    refusal: root.querySelector('.series-refusal')?.textContent ?? null,
    historyEmpty: root.querySelector('.series-history-empty')?.textContent ?? null,
    history: Array.from(root.querySelectorAll('ol.series-history > li'), (item) => [item.dataset.changeKind ?? null, item.dataset.bookId ?? null, item.querySelector('.series-change-line')?.textContent ?? null, item.querySelectorAll('.series-impact-group').length]),
    focus: root.contains(document.activeElement) ? ${FOCUS} : null,
  };
})()`;

/** A Book's own 书系 on its 工作概览: the Series it is in and its membership records. */
const READ_BOOK_SERIES = `(() => {
  const section = document.querySelector('[data-screen="book-overview"] section.book-series');
  if (!(section instanceof HTMLElement) || section.dataset.seriesCount === undefined) return null;
  return {
    bookId: section.dataset.bookId ?? null,
    none: section.querySelector('.book-series-none')?.textContent ?? null,
    memberships: Array.from(section.querySelectorAll('.book-series-membership'), (line) => [line.dataset.seriesId ?? null, line.textContent ?? '']),
    summary: section.querySelector('details.book-series-history > summary')?.textContent ?? null,
    history: Array.from(section.querySelectorAll('details.book-series-history li.series-change'), (item) => [item.dataset.changeKind ?? null, item.querySelector('.series-change-line')?.textContent ?? null]),
  };
})()`;

async function readUntil(renderer, reader, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(reader).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = new Error(`J-13/${name}`);
  error.detail = page;
  throw error;
}
const readSeriesList = (renderer, predicate, name) => readUntil(renderer, READ_SERIES_LIST, predicate, name);
const readSeries = (renderer, predicate, name) => readUntil(renderer, READ_SERIES, predicate, name);
const readBookSeries = (renderer, predicate, name) => readUntil(renderer, READ_BOOK_SERIES, predicate, name);

/** From the landing, 书系 and then one Series' page. */
async function openSeries(renderer, seriesId, name) {
  await click(renderer, '书系', `${name}-list`);
  await readSeriesList(renderer, (page) => page.items.some(([id]) => id === seriesId), `${name}-listed`);
  await clickSelector(renderer, `[data-screen="series-list"] [data-series-id="${seriesId}"] [data-series-action="open"]`, `${name}-open`);
  return readSeries(renderer, (page) => page.seriesId === seriesId, `${name}-page`);
}

/** From a Series' page, back through 书系 to the landing's list. */
async function leaveSeries(renderer, name) {
  await click(renderer, '返回书系', `${name}-list`);
  await waitFor(renderer, `document.querySelector('[data-screen="series-list"] .series-list-page')?.dataset.seriesCount !== undefined`, `${name}-listed`);
  await click(renderer, '返回', `${name}-landing`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, `${name}-library`);
}

/** A Book's 工作概览 from the landing's list, and its 书系 section once it has read. */
async function bookSide(renderer, bookId, name) {
  await clickSelector(renderer, `[data-screen="landing"] button[data-book-id="${bookId}"]`, `${name}-open`);
  return readBookSeries(renderer, (side) => side.bookId === bookId, `${name}-series`);
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
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j13-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j13-e2e-'));
    runRoot = await runRootAcquisition;
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j13-e2e-'), 'temp-root');
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
      attachProductOutput('J-13', browser, 'launch');
      cancellation.throwIfRequested();
      return createRendererManager(browser);
    };

    at('empty-books');
    // Three empty Books; each 工作概览 says its Book is in no Series.
    let manager = await launch();
    let renderer = await waitForRenderer(manager, 'initial-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'initial-ready');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
    await renderer.send('Page.setBypassCSP', { enabled: false });
    requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'offline-product');
    const first = await createEmptyBook(renderer, FIRST);
    const firstNone = await readBookSeries(renderer, (side) => side.bookId === first, 'first-overview-series');
    requireJourney(firstNone.none === '不在任何书系中。' && firstNone.memberships.length === 0 && firstNone.summary === null, 'first-in-no-series', firstNone);
    await backToLibrary(renderer, 'first');
    const second = await createEmptyBook(renderer, SECOND);
    await backToLibrary(renderer, 'second');
    const outside = await createEmptyBook(renderer, OUTSIDE);
    await backToLibrary(renderer, 'outside');

    at('series-empty');
    // 书系 is one of the landing's destinations; before any Series it says so and offers 新建书系….
    await click(renderer, '书系', 'series-destination');
    const empty = await readSeriesList(renderer, () => true, 'series-empty-page');
    requireJourney(empty.lede === SERIES_LEDE && empty.empty === '还没有书系。' && empty.items.length === 0 && !empty.form, 'series-empty-words', empty);
    requireJourney(JSON.stringify(await renderer.evaluate('window.ai7.inspectSeriesList()')) === JSON.stringify({ series: [], nextCursor: null }), 'series-empty-service');

    at('series-create');
    // 新建书系: the form opens at its name with the action unavailable until there is one; a name past its bound is refused in
    // place; the Series is then created, listed with no member, and takes focus.
    await clickSelector(renderer, '[data-series-action="create-open"]', 'series-create-open');
    const form = await readSeriesList(renderer, (page) => page.form && page.focus === 'series-title', 'series-create-form');
    requireJourney(form.createDisabled === true, 'series-create-waits', form);
    await fill(renderer, '#series-title', '星'.repeat(41), 'series-title-too-long');
    await clickSelector(renderer, '[data-series-action="create"]', 'series-create-too-long');
    const tooLong = await readSeriesList(renderer, (page) => page.refusal !== null, 'series-title-refused');
    requireJourney(tooLong.refusal === '书系名称要 1–40 个字，写在一行里。' && tooLong.focus === 'series-title' && tooLong.items.length === 0, 'series-title-refused-words', tooLong);
    await fill(renderer, '#series-title', SERIES, 'series-title');
    await fill(renderer, '#series-note', NOTE, 'series-note');
    await clickSelector(renderer, '[data-series-action="create"]', 'series-create');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已新建书系「${SERIES}」`)}`, 'series-created-status');
    const created = await readSeriesList(renderer, (page) => page.items.length === 1 && !page.form, 'series-created');
    const seriesId = created.items[0][0];
    requireJourney(UUID_PATTERN.test(seriesId ?? '') && created.items[0][1] === `书系「${SERIES}」 · 成员 0 本` && created.items[0][2] === NOTE && created.focus === 'open', 'series-created-words', created);
    const listed = await renderer.evaluate('window.ai7.inspectSeriesList().then((answer) => answer.series.map((entry) => [entry.seriesId, entry.title, entry.note, entry.memberCount]))');
    requireJourney(JSON.stringify(listed) === JSON.stringify([[seriesId, SERIES, NOTE, 0]]), 'series-created-service', listed);

    at('series-open');
    // 成员与共享范围: what membership means, no member yet, 加入书系… and no change recorded.
    await clickSelector(renderer, `[data-series-id="${seriesId}"] [data-series-action="open"]`, 'series-open-entry');
    const page = await readSeries(renderer, (read) => read.seriesId === seriesId, 'series-page');
    requireJourney(page.heading === `书系「${SERIES}」` && page.note === NOTE && page.scopeNote === SCOPE_NOTE && page.membersEmpty === '书系里还没有图书。' &&
      page.members.length === 0 && page.addOpen === true && page.historyEmpty === '还没有成员变更。' && page.history.length === 0 && page.preview === null, 'series-page-words', page);

    at('membership-add-preview');
    // 加入书系…: every Book offered and none chosen; 查看影响 shows the exact Book and Series, then the four groups in their
    // order, what changes and what stays, and exactly `加入书系` to commit. Nothing is recorded by looking.
    await clickSelector(renderer, '[data-series-action="add-open"]', 'add-open');
    const chooser = await readSeries(renderer, (read) => read.chooser !== null && read.focus === 'series-add-book', 'add-chooser');
    requireJourney(JSON.stringify(chooser.chooser) === JSON.stringify([[outside, false, `《${OUTSIDE}》`], [first, false, `《${FIRST}》`], [second, false, `《${SECOND}》`]]) &&
      chooser.lookDisabled === true && chooser.addOpen === false, 'add-chooser-words', chooser);
    await clickSelector(renderer, `input[name="series-add-book"][value="${first}"]`, 'add-choose-first');
    await clickSelector(renderer, '[data-series-action="preview"]', 'add-preview');
    const preview = await readSeries(renderer, (read) => read.preview?.heading !== null && read.preview?.heading !== undefined && read.focus === 'preview-heading', 'add-preview-shown');
    requireJourney(preview.chooser === null && preview.preview.kind === 'add' && preview.preview.bookId === first && preview.preview.heading === '加入书系的影响' &&
      preview.preview.identity === `图书《${FIRST}》 · 书系「${SERIES}」` &&
      JSON.stringify(preview.preview.groups.map(([key, title]) => [key, title])) === JSON.stringify(GROUPS) &&
      JSON.stringify(preview.preview.groups[0][2]) === JSON.stringify([`以后新建任务时，可以明确选用书系「${SERIES}」的范围，其中会包括《${FIRST}》。`]) &&
      preview.preview.groups[1][2].length === 0 && preview.preview.groups[1][3][0] === `现在没有使用书系「${SERIES}」范围、已授权或正在运行的任务。` &&
      preview.preview.groups[2][2].length === 0 && preview.preview.groups[2][3][0] === `《${FIRST}》还没有学习材料。` &&
      JSON.stringify(preview.preview.groups[3][2]) === JSON.stringify(['追加一条书系成员变更记录，书系和图书两边都能查看。']) &&
      JSON.stringify(preview.preview.actions) === JSON.stringify([['commit', '加入书系'], ['preview-cancel', '取消']]), 'add-preview-words', preview);
    const nothingYet = await renderer.evaluate(`window.ai7.inspectSeries({ seriesId: ${JSON.stringify(seriesId)} }).then((answer) => [answer.members.length, answer.history.length])`);
    requireJourney(JSON.stringify(nothingYet) === JSON.stringify([0, 0]), 'add-preview-recorded-nothing', nothingYet);

    at('membership-added');
    // 加入书系: the member row with its people, when it joined and 尚未审阅, focus on its 移出书系…, and one record that keeps
    // the four groups it showed; the service and the Book's own side agree.
    await clickSelector(renderer, '[data-series-action="commit"]', 'add-commit');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已加入书系「${SERIES}」：《${FIRST}》`)}`, 'added-status');
    const added = await readSeries(renderer, (read) => read.members.length === 1 && read.preview === null, 'added');
    requireJourney(JSON.stringify(added.columns) === JSON.stringify(['图书', '作者', '责编', '加入时间', '书系一致性审阅', '操作']) &&
      added.members[0][0] === first && added.members[0][1] === `《${FIRST}》` && added.members[0][2] === '未填写' && added.members[0][3] === '未填写' &&
      added.members[0][4].length > 0 && added.members[0][5] === '尚未审阅' && added.members[0][6] === '移出书系…' && added.focus === 'remove-open' &&
      JSON.stringify(added.history) === JSON.stringify([['add', first, `加入书系 · 《${FIRST}》`, 4]]), 'added-words', added);
    const addedService = await renderer.evaluate(`Promise.all([window.ai7.inspectSeries({ seriesId: ${JSON.stringify(seriesId)} }), window.ai7.inspectBookSeries({ bookId: ${JSON.stringify(first)} })])
      .then(([series, side]) => [series.members.map((member) => member.bookId), series.history.map((change) => [change.kind, change.bookId, change.priorMember, change.newMember, change.impact.length]),
        side.memberships.map((membership) => membership.seriesId), side.history.length])`);
    requireJourney(JSON.stringify(addedService) === JSON.stringify([[first], [['add', first, false, true, 4]], [seriesId], 1]), 'added-service', addedService);

    at('membership-stale-preview');
    // The same membership changes elsewhere while the editor reads a preview — 星河之二 added and removed again. The preview's
    // 加入书系 is refused and withdrawn, 重新查看影响 reads it again, and only then does 加入书系 go through.
    await clickSelector(renderer, '[data-series-action="add-open"]', 'stale-add-open');
    // The chooser reads its Books when it opens (Issue #63 review): wait for them, not only for the chooser.
    const remaining = await readSeries(renderer, (read) => read.chooser !== null && read.chooser.length === 2, 'stale-chooser');
    requireJourney(JSON.stringify(remaining.chooser) === JSON.stringify([[outside, false, `《${OUTSIDE}》`], [second, false, `《${SECOND}》`]]), 'stale-chooser-words', remaining);
    await clickSelector(renderer, `input[name="series-add-book"][value="${second}"]`, 'stale-choose-second');
    await clickSelector(renderer, '[data-series-action="preview"]', 'stale-preview');
    await readSeries(renderer, (read) => read.preview?.bookId === second && read.preview.heading !== null, 'stale-preview-shown');
    const elsewhere = await renderer.evaluate(`(async () => {
      const seriesId = ${JSON.stringify(seriesId)};
      const bookId = ${JSON.stringify(second)};
      const add = await window.ai7.previewSeriesMembershipChange({ seriesId, bookId, kind: 'add' });
      await window.ai7.changeSeriesMembership({ seriesId, bookId, kind: 'add', previewDigest: add.previewDigest });
      const remove = await window.ai7.previewSeriesMembershipChange({ seriesId, bookId, kind: 'remove' });
      await window.ai7.changeSeriesMembership({ seriesId, bookId, kind: 'remove', previewDigest: remove.previewDigest });
      // A change answers with its record alone (Issue #63 review): the Series is read again for its records.
      return (await window.ai7.inspectSeries({ seriesId })).history.length;
    })()`);
    requireJourney(elsewhere === 3, 'stale-elsewhere', elsewhere);
    await clickSelector(renderer, '[data-series-action="commit"]', 'stale-commit');
    const stale = await readSeries(renderer, (read) => read.refusal !== null, 'stale-refused');
    requireJourney(stale.refusal === STALE && stale.focus === 'refresh' && stale.preview?.heading === null && stale.preview.groups.length === 0 &&
      JSON.stringify(stale.preview.actions) === JSON.stringify([['refresh', '重新查看影响'], ['preview-cancel', '取消']]) &&
      JSON.stringify(stale.members.map(([id]) => id)) === JSON.stringify([first]) && stale.history.length === 3, 'stale-refused-words', stale);
    await clickSelector(renderer, '[data-series-action="refresh"]', 'stale-refresh');
    const refreshed = await readSeries(renderer, (read) => read.preview?.heading === '加入书系的影响' && read.refusal === null, 'stale-refreshed');
    requireJourney(refreshed.preview.bookId === second && refreshed.focus === 'preview-heading' &&
      JSON.stringify(refreshed.preview.actions) === JSON.stringify([['commit', '加入书系'], ['preview-cancel', '取消']]), 'stale-refreshed-words', refreshed);
    await clickSelector(renderer, '[data-series-action="commit"]', 'stale-commit-again');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已加入书系「${SERIES}」：《${SECOND}》`)}`, 'stale-added-status');
    const both = await readSeries(renderer, (read) => read.members.length === 2 && read.preview === null, 'stale-added');
    // Members newest joined first (Issue #63 review): the Book just added heads the table.
    requireJourney(JSON.stringify(both.members.map(([id]) => id)) === JSON.stringify([second, first]) &&
      JSON.stringify(both.history.map(([kind, bookId]) => [kind, bookId])) === JSON.stringify([['add', second], ['remove', second], ['add', second], ['add', first]]),
    'stale-added-words', both);

    at('library-by-series');
    // 书库 finds the Books now in the Series by its name, and not the Book outside it.
    await leaveSeries(renderer, 'library');
    await choose(renderer, '#book-filter-field', 'series', 'library-field');
    await fill(renderer, '#book-filter-text', SERIES, 'library-text');
    await clickSelector(renderer, '[data-book-filter-action="find"]', 'library-find');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work')?.dataset.bookFilter === 'series' && ${status} === '已列出找到的图书'`, 'library-found');
    const found = await renderer.evaluate(`[document.querySelector('.book-filter-line')?.textContent ?? null, Array.from(document.querySelectorAll('[data-screen="landing"] article.book-summary-item button[data-book-id]'), (button) => button.dataset.bookId)]`);
    requireJourney(JSON.stringify(found) === JSON.stringify([`按书系查找「${SERIES}」`, [first, second]]), 'library-found-words', found);
    await clickSelector(renderer, '[data-book-filter-action="clear"]', 'library-clear');
    await waitFor(renderer, `document.querySelectorAll('[data-screen="landing"] article.book-summary-item').length === 3`, 'library-cleared');

    at('book-series-records');
    // Each Book's 工作概览 lists the Series it is in and its own membership records, newest first.
    const firstSide = await bookSide(renderer, first, 'first-side');
    requireJourney(firstSide.none === null && firstSide.memberships.length === 1 && firstSide.memberships[0][0] === seriesId &&
      firstSide.memberships[0][1].startsWith(`书系「${SERIES}」 · `) && firstSide.memberships[0][1].endsWith(' 加入') &&
      firstSide.summary === '书系成员变更记录（1）' && JSON.stringify(firstSide.history) === JSON.stringify([['add', `加入书系「${SERIES}」`]]), 'first-side-words', firstSide);
    await backToLibrary(renderer, 'first-side');
    const secondSide = await bookSide(renderer, second, 'second-side');
    requireJourney(secondSide.memberships.length === 1 && secondSide.summary === '书系成员变更记录（3）' &&
      JSON.stringify(secondSide.history) === JSON.stringify([['add', `加入书系「${SERIES}」`], ['remove', `移出书系「${SERIES}」`], ['add', `加入书系「${SERIES}」`]]), 'second-side-words', secondSide);
    await backToLibrary(renderer, 'second-side');
    const outsideSide = await bookSide(renderer, outside, 'outside-side');
    requireJourney(outsideSide.none === '不在任何书系中。' && outsideSide.summary === null, 'outside-side-words', outsideSide);
    await backToLibrary(renderer, 'outside-side');

    at('membership-remove');
    // 移出书系… from the member's row: its own preview, prospective, then exactly `移出书系`; focus returns to 加入书系….
    await openSeries(renderer, seriesId, 'remove-series');
    await clickSelector(renderer, `tr[data-book-id="${first}"] [data-series-action="remove-open"]`, 'remove-open');
    const leave = await readSeries(renderer, (read) => read.preview?.kind === 'remove' && read.focus === 'preview-heading', 'remove-preview');
    requireJourney(leave.preview.heading === '移出书系的影响' && leave.preview.identity === `图书《${FIRST}》 · 书系「${SERIES}」` &&
      JSON.stringify(leave.preview.groups.map(([key, title]) => [key, title])) === JSON.stringify(GROUPS) &&
      JSON.stringify(leave.preview.groups[0][2]) === JSON.stringify([`以后新建任务时，书系「${SERIES}」的范围不再包括《${FIRST}》。`]) &&
      leave.preview.groups[1][3].includes('已经冻结的任务范围不会因移出而改变，任务也不会被取消。') &&
      JSON.stringify(leave.preview.actions) === JSON.stringify([['commit', '移出书系'], ['preview-cancel', '取消']]), 'remove-preview-words', leave);
    await clickSelector(renderer, '[data-series-action="commit"]', 'remove-commit');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已移出书系「${SERIES}」：《${FIRST}》`)}`, 'removed-status');
    const removed = await readSeries(renderer, (read) => read.members.length === 1 && read.preview === null, 'removed');
    requireJourney(removed.members[0][0] === second && removed.focus === 'add-open' && removed.history.length === 5 &&
      JSON.stringify(removed.history[0]) === JSON.stringify(['remove', first, `移出书系 · 《${FIRST}》`, 4]), 'removed-words', removed);
    await click(renderer, '返回书系', 'removed-list');
    const count = await readSeriesList(renderer, (list) => list.items.length === 1 && list.focus === 'open', 'removed-listed');
    requireJourney(count.items[0][1] === `书系「${SERIES}」 · 成员 1 本`, 'removed-count', count);

    at('series-restart');
    // After a restart the Series, its member and its five records read as before, and 星河之一 is in no Series with both records.
    await closeBrowser();
    manager = await launch();
    renderer = await waitForRenderer(manager, 'restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, 'restart-ready');
    const after = await openSeries(renderer, seriesId, 'restart-series');
    requireJourney(JSON.stringify(after.members.map(([id]) => id)) === JSON.stringify([second]) &&
      JSON.stringify(after.history.map(([kind, bookId]) => [kind, bookId])) === JSON.stringify([['remove', first], ['add', second], ['remove', second], ['add', second], ['add', first]]),
    'restart-series-words', after);
    await leaveSeries(renderer, 'restart-series');
    const firstAfter = await bookSide(renderer, first, 'restart-first');
    requireJourney(firstAfter.none === '不在任何书系中。' && firstAfter.summary === '书系成员变更记录（2）' &&
      JSON.stringify(firstAfter.history.map(([kind]) => kind)) === JSON.stringify(['remove', 'add']), 'restart-first-words', firstAfter);
    await backToLibrary(renderer, 'restart-first');

    at('j14-series-keyboard');
    // Without a pointer: Enter on 加入书系… opens the chooser at its first Book, an arrow chooses the next, Tab reaches 查看影响,
    // Enter shows the preview with focus on its heading, and Escape closes it — and the chooser — with focus back on the opener
    // and nothing recorded.
    await openSeries(renderer, seriesId, 'keyboard-series');
    await assertRenderer(renderer, `(() => { const open=document.querySelector('[data-series-action="add-open"]'); if(!(open instanceof HTMLButtonElement)||open.disabled)return false; open.focus(); return document.activeElement===open; })()`, 'keyboard-opener');
    await press(renderer, 'Enter');
    const keyboardChooser = await readSeries(renderer, (read) => read.chooser !== null && read.focus === 'series-add-book', 'keyboard-chooser');
    requireJourney(JSON.stringify(keyboardChooser.chooser.map(([id, checked]) => [id, checked])) === JSON.stringify([[outside, false], [first, false]]), 'keyboard-chooser-words', keyboardChooser);
    await press(renderer, 'Escape');
    await readSeries(renderer, (read) => read.chooser === null && read.focus === 'add-open', 'keyboard-chooser-escaped');
    await press(renderer, 'Enter');
    await readSeries(renderer, (read) => read.chooser !== null && read.focus === 'series-add-book', 'keyboard-chooser-again');
    await press(renderer, 'ArrowDown');
    await readSeries(renderer, (read) => JSON.stringify(read.chooser?.map(([id, checked]) => [id, checked])) === JSON.stringify([[outside, false], [first, true]]) && read.lookDisabled === false, 'keyboard-arrow-chooses');
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement?.dataset.seriesAction === 'preview' && document.activeElement.matches(':focus-visible')`, 'keyboard-preview-reached', 10_000);
    await press(renderer, 'Enter');
    await readSeries(renderer, (read) => read.preview?.bookId === first && read.focus === 'preview-heading', 'keyboard-preview-shown');
    await press(renderer, 'Escape');
    const escaped = await readSeries(renderer, (read) => read.preview === null && read.chooser === null && read.focus === 'add-open', 'keyboard-preview-escaped');
    requireJourney(escaped.history.length === 5 && escaped.members.length === 1, 'keyboard-recorded-nothing', escaped);

    at('j14-series-reflow-forced-colors');
    // At 200% the member table stacks and the preview's groups wrap within the width; under forced colours the preview keeps
    // its border.
    await clickSelector(renderer, `tr[data-book-id="${second}"] [data-series-action="remove-open"]`, 'reflow-preview-open');
    await readSeries(renderer, (read) => read.preview?.kind === 'remove' && read.preview.heading !== null, 'reflow-preview');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[document.querySelector('.series-preview'), document.querySelector('table.series-member-table'), document.querySelector('ol.series-history')]; return parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2 && getComputedStyle(document.querySelector('table.series-member-table tbody tr')).display==='block'; })()`, 'series-reflow', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const preview = document.querySelector('.series-preview');
      return preview instanceof HTMLElement && getComputedStyle(preview).borderTopStyle === 'solid';
    })()`, 'series-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await clickSelector(renderer, '[data-series-action="preview-cancel"]', 'reflow-cancel');
    const cancelled = await readSeries(renderer, (read) => read.preview === null && read.focus === 'remove-open', 'reflow-cancelled');
    requireJourney(cancelled.members.length === 1 && cancelled.history.length === 5, 'reflow-recorded-nothing', cancelled);

    at('series-bounded-pages');
    // Real membership changes beyond one Book's history page, followed through the visible controls.
    await assertRenderer(renderer, `(async () => {
      for (let index = 0; index < 10; index += 1) for (const kind of ['add', 'remove']) {
        const input = { seriesId: ${JSON.stringify(seriesId)}, bookId: ${JSON.stringify(first)}, kind };
        const preview = await window.ai7.previewSeriesMembershipChange(input);
        await window.ai7.changeSeriesMembership({ ...input, previewDigest: preview.previewDigest });
      }
      return true;
    })()`, 'history-seed');
    await leaveSeries(renderer, 'history-pages');
    await bookSide(renderer, first, 'history-pages');
    await assertRenderer(renderer, `(() => { document.querySelector('details.book-series-history').open = true; return true; })()`, 'history-expand');
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await clickSelector(renderer, '[data-series-action="book-history-more"]', 'book-history-next');
      await waitFor(renderer, `document.querySelectorAll('details.book-series-history li.series-change').length === 2 && document.activeElement?.tagName === 'SUMMARY'`, 'book-history-bounded');
      await clickSelector(renderer, '[data-series-action="book-history-first"]', 'book-history-reset');
      await waitFor(renderer, `document.querySelectorAll('details.book-series-history li.series-change').length === 20`, 'book-history-first-page');
    }
    await backToLibrary(renderer, 'history-pages');
    // Empty runner-authored Books and Series through the real service; no fixture database or mocked page response.
    const pageBooks = await renderer.evaluate(`(async () => {
      const books = [];
      for (let index = 0; index < 51; index += 1) {
        const suffix = String(index).padStart(3, '0');
        await window.ai7.createSeries({ title: '分页书系' + suffix, note: '' });
        const review = await window.ai7.prepareBookCreation({ title: '分页图书' + suffix, internalNumber: null });
        const created = await window.ai7.commitBookCreation({ ...review.proposed, reviewDigest: review.reviewDigest });
        books.push(created.overview.book.bookId);
      }
      return books;
    })()`);
    requireJourney(pageBooks.length === 51 && pageBooks.every((id) => UUID_PATTERN.test(id)), 'page-books-created');
    await click(renderer, '书系', 'paged-series-list');
    await readSeriesList(renderer, (page) => page.items.length === 50, 'list-first-page');
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await clickSelector(renderer, '[data-series-action="list-more"]', 'list-next');
      await readSeriesList(renderer, (page) => page.items.length === 2 && page.focus === 'open', 'list-bounded');
      await clickSelector(renderer, '[data-series-action="list-first"]', 'list-reset');
      await readSeriesList(renderer, (page) => page.items.length === 50 && page.focus === 'open', 'list-reset-bounded');
    }
    await clickSelector(renderer, '[data-series-action="list-more"]', 'list-target-page');
    await readSeriesList(renderer, (page) => page.items.some(([id]) => id === seriesId), 'list-target-visible');
    await clickSelector(renderer, `[data-series-id="${seriesId}"] [data-series-action="open"]`, 'paged-series-open');
    await readSeries(renderer, (page) => page.seriesId === seriesId, 'paged-series-ready');
    await clickSelector(renderer, '[data-series-action="add-open"]', 'paged-chooser');
    await readSeries(renderer, (page) => page.chooser?.length === 50, 'chooser-first-page');
    await assertRenderer(renderer, `(() => { const radio = document.querySelector('input[name="series-add-book"]'); if (!(radio instanceof HTMLInputElement)) return false; radio.click(); return radio.checked; })()`, 'chooser-select');
    await clickSelector(renderer, '[data-series-action="add-more"]', 'chooser-next');
    await readSeries(renderer, (page) => page.chooser?.length === 4 && page.chooser.filter(([, checked]) => checked).length === 1 && page.lookDisabled === false, 'chooser-bounded-selection');
    await clickSelector(renderer, '[data-series-action="add-first"]', 'chooser-reset');
    await readSeries(renderer, (page) => page.chooser?.length === 50 && page.chooser.every(([, checked]) => !checked), 'chooser-reset-bounded');
    await clickSelector(renderer, '[data-series-action="add-more"]', 'chooser-next-again');
    await readSeries(renderer, (page) => page.chooser?.length === 3, 'chooser-last-page');
    await clickSelector(renderer, '[data-series-action="add-cancel"]', 'chooser-close');
    await assertRenderer(renderer, `(async () => {
      for (const bookId of ${JSON.stringify(pageBooks)}) {
        const input = { seriesId: ${JSON.stringify(seriesId)}, bookId, kind: 'add' };
        const preview = await window.ai7.previewSeriesMembershipChange(input);
        await window.ai7.changeSeriesMembership({ ...input, previewDigest: preview.previewDigest });
      }
      return true;
    })()`, 'member-pages-seed');
    await click(renderer, '返回书系', 'members-reload-list');
    await readSeriesList(renderer, (page) => page.items.length === 50, 'members-reload-first');
    await clickSelector(renderer, '[data-series-action="list-more"]', 'members-reload-target');
    await readSeriesList(renderer, (page) => page.items.some(([id]) => id === seriesId), 'members-target-visible');
    await clickSelector(renderer, `[data-series-id="${seriesId}"] [data-series-action="open"]`, 'members-reload');
    await readSeries(renderer, (page) => page.members.length === 50 && page.history.length === 20, 'members-first');
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await clickSelector(renderer, '[data-series-action="members-more"]', 'members-next');
      await readSeries(renderer, (page) => page.members.length === 2 && page.focus === 'remove-open', 'members-bounded');
      await clickSelector(renderer, '[data-series-action="members-first"]', 'members-reset');
      await readSeries(renderer, (page) => page.members.length === 50, 'members-reset-bounded');
      for (let next = 0; next < 3; next += 1) {
        await clickSelector(renderer, '[data-series-action="history-more"]', 'series-history-next');
        await waitFor(renderer, `document.querySelectorAll('ol.series-history > li').length === ${next === 2 ? 16 : 20} && document.activeElement?.matches('.series-history-section h3')`, 'series-history-bounded');
      }
      await clickSelector(renderer, '[data-series-action="history-first"]', 'series-history-reset');
      await readSeries(renderer, (page) => page.history.length === 20, 'series-history-reset-bounded');
    }

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

main().catch((error) => reportJourneyFailure('J-13', location, error));
