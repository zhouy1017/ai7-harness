import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// J-11 (Issue #431, plan slice S83): a Book's 作者, 责编 and 相关人 — the attribution dimensions later feedback and learning
// records name. Two empty Books are created through 新建图书, so this Journey reads no manuscript and composes no input:
// the people are what it proves, recorded on 工作概览, shown on 书库's cards, found by 书名, 作者 and 责编, and kept across a
// restart. Every name is an authored stand-in. Later J-11 slices (S38, S26, S27) add the feedback and learning records
// that attribute by them.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRST = Object.freeze({ title: '人员旅程甲' });
const SECOND = Object.freeze({ title: '人员旅程乙' });
const PEOPLE = Object.freeze({ authors: '周一、吴二', editors: '郑三', relatedRole: 'proofreader', relatedName: '王四' });
const PEOPLE_NOTE = '作者与责编用于标注和查找这本书，也是之后反馈与学习记录的归属；它们不是账号，也不决定谁能做什么。';
let location = 'entry';
let electronExecutable;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-11', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-11/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-11', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-11' };
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

async function createLoopbackSentinel() {
  let observedRequests = 0;
  let runtimeFault = false;
  let closed = false;
  const server = createServer((_request, response) => {
    observedRequests += 1;
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Length': '21', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('AI7_LOOPBACK_SENTINEL');
  });
  server.on('error', () => { runtimeFault = true; });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(new Error('J-11/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' &&
      Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-11/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j11-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(new Error('J-11/loopback-close')) : resolveClose());
      });
      requireJourney(!runtimeFault, 'loopback-runtime');
    },
  };
}

async function attachRenderer(browser) {
  const guard = (request) => settleOnBrowserDisconnect(browser, request);
  const root = await guard(browser.newBrowserCDPSession());
  const deadline = Date.now() + 60_000;
  let target;
  while (Date.now() < deadline) {
    const pages = (await guard(root.send('Target.getTargets'))).targetInfos.filter((item) => item.type === 'page');
    if (pages.length === 1) { target = pages[0]; break; }
    requireJourney(pages.length === 0, 'renderer-target-count');
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  requireJourney(target, 'renderer-target-timeout');
  const { sessionId } = await guard(root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }));
  let nextId = 1;
  const pending = new Map();
  root.on('Target.receivedMessageFromTarget', ({ sessionId: incoming, message }) => {
    if (incoming !== sessionId) return;
    let response;
    try { response = JSON.parse(message); } catch { return; }
    if (typeof response.id !== 'number') return;
    const completion = pending.get(response.id);
    if (!completion) return;
    pending.delete(response.id);
    if (response.error) completion.reject(new Error('J-11/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-11/renderer-cdp-timeout')); }, 60_000);
      timeout.unref();
      pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
        reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
      });
    });
    await guard(root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }));
    return response;
  };
  await send('Runtime.enable');
  return {
    send,
    evaluate: async (expression) => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      requireJourney(!response.exceptionDetails, 'renderer-evaluate');
      return response.result.value;
    },
  };
}

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-11/${name}`);
}
async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`), name);
}
async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function clickSelector(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const button = document.querySelector(${JSON.stringify(selector)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); return input.value === ${JSON.stringify(value)}; })()`, name);
}
/** Enter as a keyboard sends it: only a key that carries its text activates the focused control or submits its form. */
async function pressEnter(renderer) {
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, text: '\r', unmodifiedText: '\r' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
}
async function pressEscape(renderer) {
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...escape });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape });
}
async function choose(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const select = document.querySelector(${JSON.stringify(selector)}); if (!(select instanceof HTMLSelectElement)) return false; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value === ${JSON.stringify(value)}; })()`, name);
}
const status = `(document.querySelector('#persistence-status')?.textContent ?? '')`;
const peopleSection = '[data-screen="book-overview"] .book-people-slot > section.book-people';

/** 新建图书 with a title, through its review, onto the new Book's 工作概览; the Book's identity. */
async function createBook(renderer, title, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await click(renderer, '新建图书', `${name}-open`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, `${name}-form`);
  await fill(renderer, '#empty-book-title', title, `${name}-title`);
  await click(renderer, '复核创建', `${name}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, `${name}-review-ready`);
  await click(renderer, '新建图书', `${name}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-manuscript-state="empty"]') && document.querySelector(${JSON.stringify(peopleSection)})`, `${name}-overview`);
  const bookId = await renderer.evaluate(`document.querySelector('[data-screen="book-overview"] .book-overview')?.dataset.bookId ?? null`);
  requireJourney(UUID_PATTERN.test(bookId ?? ''), `${name}-identity`);
  return bookId;
}

/** 返回图书列表 from 工作概览: the landing with 书库's list. */
async function backToLibrary(renderer, name) {
  await click(renderer, '返回图书列表', `${name}-back`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, `${name}-library`);
}

const CARDS = `Array.from(document.querySelectorAll('[data-screen="landing"] section.recent-work article.book-summary-item'), (card) => ({
  bookId: card.querySelector('button[data-book-id]')?.dataset.bookId ?? null,
  title: card.querySelector('button[data-book-id]')?.textContent ?? '',
  people: card.querySelector('.book-people-line')?.textContent ?? null,
  related: card.querySelector('.book-related-line')?.textContent ?? null,
}))`;

/** 查找图书 by one field: 查找 pressed, or — from the keyboard — Enter in the words. */
async function search(renderer, field, text, name, keyboard = false) {
  await choose(renderer, '#book-filter-field', field, `${name}-field`);
  await fill(renderer, '#book-filter-text', text, `${name}-text`);
  if (keyboard) {
    await assertRenderer(renderer, `(() => { const input = document.querySelector('#book-filter-text'); input?.focus(); return input !== null && document.activeElement === input; })()`, `${name}-focused`);
    await pressEnter(renderer);
  } else await clickSelector(renderer, '[data-book-filter-action="find"]', `${name}-find`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work')?.dataset.bookFilter === ${JSON.stringify(field)} && ${status} === '已列出找到的图书'`, `${name}-found`);
  return renderer.evaluate(CARDS);
}

async function main() {
  parseJourney();
  let loopback;
  let loopbackAcquisition;
  let runRoot;
  let runRootAcquisition;
  let browser;
  let browserAcquisition;
  let tempParent;
  let journeyCompleted = false;
  const closeOwnedBrowser = async () => {
    const ownedBrowser = browser ?? (browserAcquisition === undefined ? undefined : await browserAcquisition.catch(() => undefined));
    await ownedBrowser?.close().catch(() => undefined);
    browser = undefined;
  };
  const cancellation = installJourneyCancellationCleanup(async () => {
    await closeOwnedBrowser();
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    await ownedLoopback?.close().catch(() => undefined);
    loopback = undefined;
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j11-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
      await rm(ownedRoot, { recursive: true, force: true });
      runRoot = undefined;
    }
  }, closeOwnedBrowser);
  try {
    at('controller-loopback-sentinel');
    cancellation.throwIfRequested();
    loopbackAcquisition = createLoopbackSentinel();
    loopback = await loopbackAcquisition;
    cancellation.throwIfRequested();

    at('controller-imports');
    const denial = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
    requireJourney(existsSync(denial), 'controller-network-denial-carrier');
    (await import(pathToFileURL(denial).href)).installNodeNetworkDenial();
    ({ electronExecutable } = await import('../tools/electron-runtime.mjs'));
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    cancellation.throwIfRequested();
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j11-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j11-e2e-'), 'temp-root');
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
      attachProductOutput('J-11', browser, 'launch');
      cancellation.throwIfRequested();
      return attachRenderer(browser);
    };
    const close = async () => { await browser.close(); browser = undefined; };

    at('renderer-api-boundary');
    let renderer = await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true'`, 'product-ready');
    // The renderer gains the one people command and nothing named like an account, a role grant or a permission.
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && typeof window.ai7.updateBookPeople === 'function' && !Object.keys(window.ai7).some((key) => /account|permission|login|grant/i.test(key))`, 'renderer-api-boundary');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'renderer-network-denial');
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }

    at('first-book-created');
    const firstId = await createBook(renderer, FIRST.title, 'first-book');

    at('people-empty');
    // A new Book has no people yet: each field reads 未填写, and the section says what the people are for.
    await assertRenderer(renderer, `(() => {
      const section = document.querySelector(${JSON.stringify(peopleSection)});
      const values = Array.from(section.querySelectorAll('dd[data-people-field]'), (dd) => dd.dataset.peopleField + ':' + dd.textContent);
      return section.querySelector('h3')?.textContent === '人员' && section.dataset.peopleVersion === '0' &&
        JSON.stringify(values) === '["authors:未填写","editors:未填写","related:未填写"]' &&
        section.querySelector('.book-people-recorded')?.textContent === '尚未填写作者、责编和相关人。' &&
        section.querySelector('.book-people-note')?.textContent === ${JSON.stringify(PEOPLE_NOTE)} &&
        section.querySelector('[data-people-action="edit"]')?.textContent === '编辑人员…';
    })()`, 'people-empty-section');

    at('j14-people-keyboard');
    // Without a pointer: Enter on 编辑人员… opens the form at 作者, and Escape closes it with nothing saved and the focus
    // back on 编辑人员….
    const editButton = `${peopleSection} [data-people-action="edit"]`;
    const authorsInput = `${peopleSection} input[data-people-field="authors"]`;
    await assertRenderer(renderer, `(() => { const edit = document.querySelector(${JSON.stringify(editButton)}); if (!(edit instanceof HTMLButtonElement) || edit.disabled) return false; edit.focus(); return document.activeElement === edit; })()`, 'keyboard-edit-focused');
    await pressEnter(renderer);
    await waitFor(renderer, `document.activeElement === document.querySelector(${JSON.stringify(authorsInput)})`, 'keyboard-form-open', 10_000);
    await renderer.send('Input.insertText', { text: '临时' });
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(authorsInput)})?.value === '临时'`, 'keyboard-typed');
    await pressEscape(renderer);
    await waitFor(renderer, `document.querySelector(${JSON.stringify(`${peopleSection} form`)}) === null && document.activeElement === document.querySelector(${JSON.stringify(editButton)})`, 'keyboard-form-closed', 10_000);
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '0' && document.querySelector(${JSON.stringify(`${peopleSection} dd[data-people-field="authors"]`)})?.textContent === '未填写'`, 'keyboard-nothing-saved');

    at('people-form');
    // 编辑人员… opens the whole set in one form; a 相关人 row waits for both its role and its name.
    await clickSelector(renderer, editButton, 'people-edit');
    // Escape kept nothing: the form opens fresh from the saved set, at 作者.
    await waitFor(renderer, `document.querySelector(${JSON.stringify(authorsInput)})?.value === '' && document.activeElement === document.querySelector(${JSON.stringify(authorsInput)})`, 'people-form-fresh');
    await fill(renderer, authorsInput, PEOPLE.authors, 'people-authors');
    await fill(renderer, `${peopleSection} input[data-people-field="editors"]`, PEOPLE.editors, 'people-editors');
    await clickSelector(renderer, `${peopleSection} [data-people-action="addRelated"]`, 'people-add-related');
    await waitFor(renderer, `document.activeElement === document.querySelector(${JSON.stringify(`${peopleSection} .book-people-related-row[data-related-index="0"] select`)})`, 'people-related-row');
    await assertRenderer(renderer, `(() => {
      const save = document.querySelector(${JSON.stringify(`${peopleSection} [data-people-action="save"]`)});
      const reason = document.getElementById(save?.getAttribute('aria-describedby') ?? '');
      const options = Array.from(document.querySelectorAll(${JSON.stringify(`${peopleSection} .book-people-related-row select option`)}), (option) => option.textContent);
      return save instanceof HTMLButtonElement && save.disabled && reason?.textContent === '每位相关人都要选角色、填名字。' &&
        JSON.stringify(options) === '["选择角色","校对","美编","译者","外审专家","作者经纪","营销","其他"]';
    })()`, 'people-related-needs-role-and-name');
    await choose(renderer, `${peopleSection} .book-people-related-row[data-related-index="0"] select`, PEOPLE.relatedRole, 'people-related-role');
    await fill(renderer, `${peopleSection} .book-people-related-row[data-related-index="0"] input[data-people-field="related-name"]`, PEOPLE.relatedName, 'people-related-name');
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(`${peopleSection} [data-people-action="save"]`)})?.disabled === false`, 'people-save-ready');

    at('j14-people-zoom-200-reflow');
    // At 200% the form, its fields, its 相关人 group and row reflow into the width: nothing scrolls sideways.
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [document.querySelector(${JSON.stringify(peopleSection)}), ...document.querySelectorAll(${JSON.stringify(`${peopleSection} .book-people-field, ${peopleSection} .book-people-related, ${peopleSection} .book-people-related-row`)})]; return parts.length === 5 && parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'people-reflow-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-people-forced-colors');
    // Without colour the 相关人 group keeps its rule, the card its plain edge, and 保存人员 its outline.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const section = document.querySelector(${JSON.stringify(peopleSection)});
      const related = section?.querySelector('.book-people-related');
      const save = section?.querySelector('[data-people-action="save"]');
      return section instanceof HTMLElement && getComputedStyle(section).boxShadow === 'none' && getComputedStyle(section).borderTopStyle === 'solid' &&
        related instanceof HTMLElement && getComputedStyle(related).borderTopStyle === 'solid' && parseFloat(getComputedStyle(related).borderTopWidth) >= 1 &&
        save instanceof HTMLButtonElement && getComputedStyle(save).borderTopStyle === 'solid';
    })()`, 'people-rules-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });

    at('people-saved');
    await clickSelector(renderer, `${peopleSection} [data-people-action="save"]`, 'people-save');
    await waitFor(renderer, `${status} === '人员已保存' && document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '1'`, 'people-recorded');
    await assertRenderer(renderer, `(() => {
      const section = document.querySelector(${JSON.stringify(peopleSection)});
      const values = Array.from(section.querySelectorAll('dd[data-people-field]'), (dd) => dd.dataset.peopleField + ':' + dd.textContent);
      return JSON.stringify(values) === '["authors:周一、吴二","editors:郑三","related:校对 王四"]' && section.querySelector('form') === null &&
        (section.querySelector('.book-people-recorded')?.textContent ?? '').startsWith('第 1 次保存 · ') &&
        document.activeElement === section.querySelector('[data-people-action="edit"]');
    })()`, 'people-shown');
    const saved = await renderer.evaluate(`window.ai7.getBookOverview({ bookId: ${JSON.stringify(firstId)}, historyCursor: null }).then((overview) => overview.people)`);
    requireJourney(JSON.stringify([saved?.version, saved?.authors, saved?.editors, saved?.related]) === JSON.stringify([1, ['周一', '吴二'], ['郑三'], [{ roleId: 'proofreader', roleLabel: '校对', name: '王四' }]]), 'people-service-agrees', saved);

    at('people-unchanged');
    // The same set again records nothing and says so.
    await clickSelector(renderer, `${peopleSection} [data-people-action="edit"]`, 'people-edit-again');
    await clickSelector(renderer, `${peopleSection} [data-people-action="save"]`, 'people-save-again');
    await waitFor(renderer, `${status} === '人员没有变化' && document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '1'`, 'people-unchanged-said');
    // Read here, while this window shows the Book, so the read binds nothing new.
    const peopleBefore = await renderer.evaluate(`window.ai7.getBookOverview({ bookId: ${JSON.stringify(firstId)}, historyCursor: null }).then((overview) => JSON.stringify(overview.people))`);
    requireJourney(typeof peopleBefore === 'string' && peopleBefore === JSON.stringify(saved), 'people-unchanged-recorded-nothing');

    at('second-book-created');
    await backToLibrary(renderer, 'first-book');
    const secondId = await createBook(renderer, SECOND.title, 'second-book');
    await backToLibrary(renderer, 'second-book');

    at('library-cards');
    // 书库's cards: the first Book names its 作者, 责编 and 相关人; the second, with none, names nobody.
    const cards = await renderer.evaluate(CARDS);
    requireJourney(JSON.stringify(cards) === JSON.stringify([
      { bookId: secondId, title: `${SECOND.title} · 尚无稿件`, people: null, related: null },
      { bookId: firstId, title: `${FIRST.title} · 尚无稿件`, people: '作者：周一、吴二 · 责编：郑三', related: '相关人：校对 王四' },
    ]), 'library-cards-name-the-people', cards);

    at('library-search');
    // 查找图书 by 作者, by 责编 and by 书名: the service keeps only the Books that hold the words.
    const byAuthor = await search(renderer, 'author', '吴二', 'search-author');
    requireJourney(JSON.stringify(byAuthor.map((card) => card.bookId)) === JSON.stringify([firstId]), 'search-by-author', byAuthor);
    await assertRenderer(renderer, `document.querySelector('.book-filter-line')?.textContent === '按作者查找「吴二」' && document.activeElement === document.querySelector('#book-filter-text')`, 'search-by-author-line');
    const byEditor = await search(renderer, 'editor', '郑三', 'search-editor', true);
    requireJourney(JSON.stringify(byEditor.map((card) => card.bookId)) === JSON.stringify([firstId]), 'search-by-editor', byEditor);
    const byTitle = await search(renderer, 'title', '乙', 'search-title');
    requireJourney(JSON.stringify(byTitle.map((card) => card.bookId)) === JSON.stringify([secondId]), 'search-by-title', byTitle);
    await choose(renderer, '#book-filter-field', 'author', 'search-none-field');
    await fill(renderer, '#book-filter-text', '无此人', 'search-none-text');
    await clickSelector(renderer, '[data-book-filter-action="find"]', 'search-none-find');
    await waitFor(renderer, `document.querySelector('.book-filter-none')?.textContent === '没有找到符合的图书。' && document.querySelectorAll('[data-screen="landing"] section.recent-work article.book-summary-item').length === 0`, 'search-none');
    await clickSelector(renderer, '[data-book-filter-action="clear"]', 'search-clear');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work')?.dataset.bookFilter === 'none' && document.querySelectorAll('[data-screen="landing"] section.recent-work article.book-summary-item').length === 2 && ${status} === '已显示全部图书'`, 'search-cleared');

    at('restart-keeps-people');
    // A restart moves nothing: the cards and the 工作概览 read the people exactly as saved.
    const booksBefore = await renderer.evaluate(`window.ai7.listBooks({ after: null }).then((page) => JSON.stringify(page))`);
    await close();
    renderer = await launch();
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, 'restart-library');
    const booksAfter = await renderer.evaluate(`window.ai7.listBooks({ after: null }).then((page) => JSON.stringify(page))`);
    requireJourney(typeof booksBefore === 'string' && booksAfter === booksBefore, 'restart-library-moved-nothing');
    requireJourney(JSON.stringify(await renderer.evaluate(CARDS)) === JSON.stringify(cards), 'restart-cards');
    await clickSelector(renderer, `[data-screen="landing"] section.recent-work article.book-summary-item button[data-book-id="${firstId}"]`, 'restart-open-first');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '1'`, 'restart-overview');
    await assertRenderer(renderer, `JSON.stringify(Array.from(document.querySelectorAll(${JSON.stringify(`${peopleSection} dd[data-people-field]`)}), (dd) => dd.textContent)) === '["周一、吴二","郑三","校对 王四"]'`, 'restart-overview-people');
    const peopleAfter = await renderer.evaluate(`window.ai7.getBookOverview({ bookId: ${JSON.stringify(firstId)}, historyCursor: null }).then((overview) => JSON.stringify(overview.people))`);
    requireJourney(peopleAfter === peopleBefore, 'restart-people-moved-nothing');

    at('zero-loopback-requests');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-loopback-requests');

    at('completion-browser-close');
    await close();
    await loopback.close();
    journeyCompleted = true;
  } finally {
    try {
      // Only a Journey that finished names its cleanup; one that failed keeps the stage it failed at.
      if (journeyCompleted) at('completion-cleanup');
      await cancellation.cleanup();
    } finally {
      cancellation.dispose();
    }
  }
}

main().catch((error) => reportJourneyFailure('J-11', location, error));
