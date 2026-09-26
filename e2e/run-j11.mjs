import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
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
//
// Since #429 (S81a) J-11 also walks ②C 评估 on a third Book made from the one admitted input, exact `sample1`, through the
// product's own import: the editor's scores out of each item's 满分, a 不评 with its reason, the risk items capping 推荐出版,
// 保存评估 and 定稿, and 重新评估 compared with the version before — then 知识库 › 评估方案 counting its use. Every score and
// word is the Journey's own; nothing of the manuscript is read.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRST = Object.freeze({ title: '人员旅程甲' });
const SECOND = Object.freeze({ title: '人员旅程乙' });
const PEOPLE = Object.freeze({ authors: '周一、吴二', editors: '郑三', relatedRole: 'proofreader', relatedName: '王四' });
const PEOPLE_NOTE = '作者与责编用于标注和查找这本书，也是之后反馈与学习记录的归属；它们不是账号，也不决定谁能做什么。';
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const THIRD = Object.freeze({ title: '评估旅程丙' });
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

/** Exact `sample1` through the import flow, as a new Book with its first manuscript; the Book's identity. */
async function importSample1(renderer, title, sample1, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await click(renderer, '导入稿件', `${name}-start`);
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${name}-target`);
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-target-explicit`);
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, `${name}-relationship`);
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-relationship-explicit`);
  await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, `${name}-title-screen`);
  await assertRenderer(renderer, `document.querySelector('[data-source-sha256]')?.textContent===${JSON.stringify(sample1.sha256)} && document.querySelector('[data-source-bytes]')?.textContent===${JSON.stringify(String(sample1.bytes))}`, `${name}-exact-source`);
  await fill(renderer, '#book-title', title, `${name}-title`);
  await click(renderer, '确认书名并复核', `${name}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, `${name}-review-ready`);
  await waitFor(renderer, `!document.querySelector('#accept-import-degradation')&&Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='新建图书并导入稿件'&&!button.disabled)`, `${name}-review-clean`);
  await click(renderer, '新建图书并导入稿件', `${name}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="imported"] .book-overview[data-manuscript-state="populated"]')`, `${name}-completed`, 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, `${name}-acknowledged`, 180_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId ?? null`);
  requireJourney(UUID_PATTERN.test(bookId ?? ''), `${name}-book-identity`);
  return bookId;
}

/** ②C 评估 as the editor reads it: its versions, the version on show, its form and its conclusion, and where focus is. */
const READ_EVALUATION = `(() => {
  const host = document.querySelector('[data-screen="book-evaluation"] .evaluation');
  if (!(host instanceof HTMLElement)) return null;
  const record = host.querySelector('.evaluation-record');
  const active = document.activeElement;
  return {
    state: host.dataset.evaluation ?? null,
    empty: host.querySelector('.evaluation-empty')?.textContent ?? null,
    start: host.querySelector('[data-evaluation-action="start"]')?.textContent ?? null,
    startReason: host.querySelector('.evaluation-start-reason')?.textContent ?? null,
    versions: Array.from(host.querySelectorAll('.evaluation-version-list button'), (button) => button.textContent),
    refusal: host.querySelector('.evaluation-refusal')?.textContent ?? null,
    record: record === null ? null : {
      state: record.dataset.evaluationState,
      entries: record.dataset.entries,
      heading: record.querySelector('h3')?.textContent ?? null,
      revision: record.querySelector('.evaluation-revision')?.textContent ?? null,
      finalized: record.querySelector('.evaluation-finalized')?.textContent ?? null,
      ai7: record.querySelector('.evaluation-ai7')?.textContent ?? null,
      total: record.querySelector('.evaluation-total')?.textContent ?? null,
      comparison: record.querySelector('.evaluation-comparison') === null ? null
        : [record.querySelector('.evaluation-comparison h4')?.textContent ?? null, ...Array.from(record.querySelectorAll('.evaluation-comparison li'), (item) => item.textContent)],
      items: Array.from(record.querySelectorAll('.evaluation-item'), (item) => {
        const band = item.querySelector('.evaluation-band');
        return [item.dataset.itemId, item.querySelector('legend')?.textContent ?? null, item.querySelector('[data-evaluation-field="score"]')?.value ?? null,
          band instanceof HTMLElement && !band.hidden ? band.textContent : null, item.querySelector('[data-evaluation-field="not-rated"]')?.checked ?? null];
      }),
      conclusions: Array.from(record.querySelectorAll('.evaluation-conclusion [data-conclusion]'), (choice) => [choice.dataset.conclusion, choice.querySelector('input')?.checked ?? null, choice.querySelector('input')?.disabled ?? null]),
      blocked: record.querySelector('.evaluation-recommend-blocked')?.hidden === false,
      allDisabled: Array.from(record.querySelectorAll('input, textarea')).every((control) => control.disabled),
      actions: Array.from(record.querySelectorAll('.evaluation-actions button'), (button) => button.textContent),
    },
    focus: active instanceof HTMLElement ? (active.tagName === 'H3' ? 'heading' : active.dataset.evaluationAction ?? active.dataset.evaluationField ?? active.tagName) : null,
  };
})()`;
async function readEvaluation(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_EVALUATION).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = new Error(`J-11/${name}`);
  error.detail = page;
  throw error;
}
/** Click a checkbox or a radio of the form, as a pointer would. */
async function tick(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement) || input.disabled) return false; input.click(); return true; })()`, name);
}
const item = (itemId) => `[data-screen="book-evaluation"] .evaluation-item[data-item-id="${itemId}"]`;
const risk = (riskId) => `[data-screen="book-evaluation"] .evaluation-risk[data-risk-id="${riskId}"]`;
const ITEM_LEGENDS = ['文学品质与作者声音 · 满分 20', '主题、价值与社会文化语境 · 满分 20', '结构、叙事逻辑与连贯 · 满分 20', '中文语言与表达 · 满分 20', '读者与市场潜力 · 满分 20'];

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
    const sample1Bytes = await readFile(SAMPLE1_PATH);
    const sample1 = { sha256: createHash('sha256').update(sample1Bytes).digest('hex'), bytes: sample1Bytes.length };
    const launch = async () => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
        // J-11's picker imports the manuscript its 评估 evaluates (Issue #429, S81a): one choice per window.
        '--j11-picker-path', SAMPLE1_PATH,
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

    // ---- ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012) --------
    at('evaluation-book-imported');
    // A third Book from exact sample1: its 工作概览 says it has no 评估 yet, one step from the destination.
    await click(renderer, '返回图书列表', 'evaluation-library');
    const thirdId = await importSample1(renderer, THIRD.title, sample1, 'evaluation-import');
    await waitFor(renderer, `document.querySelector('.book-evaluation-summary')?.dataset.evaluationState === 'empty'`, 'evaluation-summary-empty');
    await assertRenderer(renderer, `(() => { const summary = document.querySelector('.book-evaluation-summary'); return summary?.querySelector('h3')?.textContent === '评估' && summary.querySelector('p')?.textContent === '还没有评估。' && summary.querySelector('[data-evaluation-action="open"]')?.textContent === '打开评估'; })()`, 'evaluation-summary-words');

    at('evaluation-open');
    await clickSelector(renderer, '.book-evaluation-summary [data-evaluation-action="open"]', 'evaluation-open');
    const opened = await readEvaluation(renderer, (page) => page.state === 'ready', 'evaluation-ready');
    requireJourney(opened.empty === '这本书还没有评估。开始评估后，按本社评估方案逐项打分，定稿后留作记录。' && opened.start === '开始评估' &&
      opened.versions.length === 0 && opened.record === null, 'evaluation-empty', opened);

    at('evaluation-start');
    // 开始评估: version 1 on r1, AI7's 初评 not yet there, every item unscored and no conclusion chosen.
    await clickSelector(renderer, '[data-evaluation-action="start"]', 'evaluation-start');
    const started = await readEvaluation(renderer, (page) => page.record !== null && page.focus === 'heading', 'evaluation-started');
    requireJourney(started.record.heading === '第 1 版 · 编辑评分中' && started.record.revision === '评估的是修订版 r1' &&
      started.record.ai7 === 'AI7 初评尚未接通：这一版由你打分。' && started.record.total === '总分 0 / 100 · 还有 5 项没有打分' &&
      JSON.stringify(started.record.items.map(([, legend, score]) => [legend, score])) === JSON.stringify(ITEM_LEGENDS.map((legend) => [legend, ''])) &&
      started.record.conclusions.every(([, checked]) => checked === false) && JSON.stringify(started.record.actions) === JSON.stringify(['保存评估', '定稿']) &&
      started.startReason === '第 1 版还没有定稿；定稿后才能重新评估。', 'evaluation-started-words', started);
    await waitFor(renderer, `${status} === '已开始第 1 版评估。'`, 'evaluation-started-status', 10_000);

    at('evaluation-score');
    // Four items scored, half points allowed; the fifth 不评 with its reason, leaving the total out of 80; each band shown.
    for (const [itemId, score] of [['literary-quality', '18'], ['theme-and-context', '16.5'], ['structure-and-coherence', '15'], ['chinese-language', '17']]) {
      await fill(renderer, `${item(itemId)} [data-evaluation-field="score"]`, score, `evaluation-score-${itemId}`);
    }
    await tick(renderer, `${item('readers-and-market')} [data-evaluation-field="not-rated"]`, 'evaluation-not-rated');
    await fill(renderer, `${item('readers-and-market')} [data-evaluation-field="not-rated-reason"]`, '市场资料尚未收集。', 'evaluation-not-rated-reason');
    const scoredPage = await readEvaluation(renderer, (page) => page.record?.total === '总分 66.5 / 80 · 优秀（1 项不评）', 'evaluation-total');
    requireJourney(JSON.stringify(scoredPage.record.items.map(([, , score, band, notRated]) => [score, band, notRated])) === JSON.stringify([
      ['18', '卓越', false], ['16.5', '优秀', false], ['15', '优秀', false], ['17', '优秀', false], ['', null, true],
    ]), 'evaluation-bands', scoredPage.record.items);
    // A 高 risk nobody reviewed keeps 推荐出版 closed, with why; a person's review opens it.
    await tick(renderer, `${risk('facts-and-sources')} input[value="low"]`, 'evaluation-risk-facts');
    await tick(renderer, `${risk('law-rights-ethics-policy')} input[value="high"]`, 'evaluation-risk-legal');
    await fill(renderer, `${risk('law-rights-ethics-policy')} [data-evaluation-field="statement"]`, '书中写到真实人物，需要法务看过。', 'evaluation-risk-statement');
    const capped = await readEvaluation(renderer, (page) => page.record?.blocked === true, 'evaluation-capped');
    requireJourney(JSON.stringify(capped.record.conclusions) === JSON.stringify([['recommend', false, true], ['revise', false, false], ['defer', false, false], ['reject', false, false]]),
      'evaluation-recommend-waits', capped.record.conclusions);
    await tick(renderer, `${risk('law-rights-ethics-policy')} [data-evaluation-field="reviewed"]`, 'evaluation-risk-reviewed');
    const reviewed = await readEvaluation(renderer, (page) => page.record?.blocked === false, 'evaluation-uncapped');
    requireJourney(reviewed.record.conclusions[0][2] === false, 'evaluation-recommend-open', reviewed.record.conclusions);
    await tick(renderer, '[data-screen="book-evaluation"] .evaluation-conclusion [data-conclusion="revise"] input', 'evaluation-conclusion');
    await fill(renderer, '[data-screen="book-evaluation"] .evaluation-lists [data-evaluation-field="readiness"]', '第三章结尾需要重写', 'evaluation-readiness');
    await clickSelector(renderer, '[data-evaluation-action="save"]', 'evaluation-save');
    await waitFor(renderer, `${status} === '评估已保存。'`, 'evaluation-saved-status');
    const savedPage = await readEvaluation(renderer, (page) => page.record?.entries === '2', 'evaluation-saved');
    requireJourney(JSON.stringify(savedPage.versions) === JSON.stringify(['第 1 版 · 编辑评分中 · 修订版 r1 · 总分 66.5 / 80 · 优秀（1 项不评） · 修改后再议']) &&
      savedPage.record.conclusions[1][1] === true && savedPage.focus === 'save', 'evaluation-saved-words', savedPage);

    at('evaluation-finalize');
    await clickSelector(renderer, '[data-evaluation-action="finalize"]', 'evaluation-missing-low-statement');
    await waitFor(renderer, `${status} === '定稿前，要写明「事实与来源」的风险说明。'`, 'evaluation-low-statement-refused');
    await readEvaluation(renderer, (page) => page.record?.state === 'editing' && page.record.entries === '2', 'evaluation-refusal-keeps-draft');
    await fill(renderer, `${risk('facts-and-sources')} [data-evaluation-field="statement"]`, '已核对事实和来源，未发现未解决问题。', 'evaluation-low-risk-statement');
    // 定稿: the version reads as it was, with the actor and the time, and 重新评估 begins the next.
    await clickSelector(renderer, '[data-evaluation-action="finalize"]', 'evaluation-finalize');
    await waitFor(renderer, `${status} === '第 1 版评估已定稿。'`, 'evaluation-finalized-status');
    const finalizedPage = await readEvaluation(renderer, (page) => page.record?.state === 'finalized', 'evaluation-finalized');
    requireJourney(finalizedPage.record.heading === '第 1 版 · 定稿' && (finalizedPage.record.finalized ?? '').startsWith('定稿 · 本机编辑 · ') &&
      finalizedPage.record.allDisabled === true && finalizedPage.record.actions.length === 0 && finalizedPage.start === '重新评估' &&
      finalizedPage.record.total === '总分 66.5 / 80 · 优秀（1 项不评）', 'evaluation-finalized-words', finalizedPage.record);

    at('evaluation-from-manuscript');
    // 评估 is one of the manuscript's 工作 destinations (IA-012, editor-surfaces §0.3): from 评估's own 打开稿件, the manuscript's
    // 工作 group reads 审阅 · 评估 · 交付物, and its 评估 opens the version just finalized.
    await assertRenderer(renderer, `(() => { const open = Array.from(document.querySelectorAll('[data-screen="book-evaluation"] .workbench-actions button')).find((button) => button.textContent === '打开稿件'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'evaluation-open-manuscript');
    await waitFor(renderer, `document.querySelector('.editor-shell [data-testid="manuscript-editor"] > [data-block-id]') !== null && document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]') !== null`, 'evaluation-manuscript-ready', 60_000);
    await assertRenderer(renderer, `(() => { const group = document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]'); const entries = Array.from(group?.querySelectorAll('button[data-work-destination]') ?? []).map((item) => item.dataset.workDestination + ':' + item.textContent); const open = group?.querySelector('button[data-work-destination="evaluation"]'); if (entries.join('|') !== 'review:审阅|evaluation:评估|deliverables:交付物' || !(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'evaluation-work-group-entry');
    const returned = await readEvaluation(renderer, (page) => page.state === 'ready' && page.record?.state === 'finalized', 'evaluation-from-manuscript-ready');
    requireJourney(returned.record.heading === '第 1 版 · 定稿' && returned.start === '重新评估' && returned.versions.length === 1, 'evaluation-from-manuscript-words', returned);

    at('evaluation-reevaluate');
    // 重新评估: version 2 begins from 定稿's scores but not its conclusion, which the editor decides again for this text; one
    // moved item shows against version 1.
    await clickSelector(renderer, '[data-evaluation-action="start"]', 'evaluation-again');
    const again = await readEvaluation(renderer, (page) => page.record?.heading === '第 2 版 · 编辑评分中', 'evaluation-again-started');
    requireJourney(JSON.stringify(again.record.items.map(([, , score]) => score)) === JSON.stringify(['18', '16.5', '15', '17', '']) &&
      JSON.stringify(again.record.comparison) === JSON.stringify(['与第 1 版相比', '总分：66.5 / 80 → 66.5 / 80', '结论：修改后再议 → 结论未定']), 'evaluation-again-seeded', again.record);
    await fill(renderer, `${item('literary-quality')} [data-evaluation-field="score"]`, '19', 'evaluation-again-score');
    await clickSelector(renderer, '[data-evaluation-action="save"]', 'evaluation-again-save');
    const compared = await readEvaluation(renderer, (page) => page.record?.entries === '2' && page.record.comparison?.length === 4, 'evaluation-compared');
    requireJourney(JSON.stringify(compared.record.comparison) === JSON.stringify(['与第 1 版相比', '文学品质与作者声音：18 → 19', '总分：66.5 / 80 → 67.5 / 80', '结论：修改后再议 → 结论未定']) &&
      compared.versions.length === 2 && compared.versions[1] === '第 1 版 · 定稿 · 修订版 r1 · 总分 66.5 / 80 · 优秀（1 项不评） · 修改后再议', 'evaluation-compared-words', compared);

    at('j14-evaluation-reflow-forced-colors');
    // At 200% the version, its items and risks reflow into the width; under forced colours each keeps its border.
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [document.querySelector('.evaluation-record'), ...document.querySelectorAll('.evaluation-item, .evaluation-risk, .evaluation-conclusion')]; return parts.length === 9 && parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'evaluation-reflow', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const parts = [document.querySelector('.evaluation-record'), document.querySelector('.evaluation-item'), document.querySelector('.evaluation-risk'), document.querySelector('.evaluation-conclusion')];
      return parts.every((part) => part instanceof HTMLElement && getComputedStyle(part).borderTopStyle === 'solid');
    })()`, 'evaluation-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });

    at('evaluation-overview-and-profile');
    // 工作概览 names the version on show in one line; 知识库 › 评估方案 names the profile and counts its use.
    await assertRenderer(renderer, `(() => { const open = Array.from(document.querySelectorAll('[data-screen="book-evaluation"] .workbench-actions button')).find((button) => button.textContent === '工作概览'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'evaluation-overview');
    await waitFor(renderer, `document.querySelector('.book-evaluation-summary')?.dataset.evaluationState === 'editing' && document.querySelector('.book-evaluation-summary p')?.textContent === '第 2 版 · 编辑评分中 · 修订版 r1 · 总分 67.5 / 80 · 优秀（1 项不评）'`, 'evaluation-overview-line');
    await click(renderer, '返回图书列表', 'evaluation-profile-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'evaluation-profile-landing');
    await click(renderer, '知识库', 'evaluation-profile-knowledge');
    await waitFor(renderer, `document.querySelector('[data-screen="knowledge-base"] .knowledge-base')`, 'evaluation-profile-knowledge-open');
    await click(renderer, '评估方案', 'evaluation-profile-tab');
    await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab === 'evaluation' && document.querySelector('.evaluation-profile') !== null`, 'evaluation-profile-painted');
    const profile = await renderer.evaluate(`(() => { const card = document.querySelector('.evaluation-profile'); return { title: card.querySelector('h3')?.textContent, pill: card.querySelector('.evaluation-profile-pill')?.textContent, use: card.querySelector('.evaluation-profile-use')?.textContent, items: Array.from(card.querySelectorAll('.evaluation-profile-items li'), (item) => item.textContent), bands: card.querySelectorAll('.evaluation-profile-bands li').length, risks: card.querySelector('.evaluation-profile-risks')?.textContent, conclusions: card.querySelector('.evaluation-profile-conclusions')?.textContent }; })()`);
    requireJourney(JSON.stringify(profile) === JSON.stringify({
      title: '审稿评估方案', pill: '第 1 版 · AI7 内置默认', use: '已用于 1 本书的 2 版评估', items: ITEM_LEGENDS, bands: 5,
      risks: '事实与来源、法律、权利、伦理与出版政策', conclusions: '推荐出版 · 修改后再议 · 暂缓 · 不推荐',
    }), 'evaluation-profile-words', profile);
    const service = await renderer.evaluate(`window.ai7.inspectEvaluationProfiles().then((projection) => projection.profiles.map((entry) => [entry.records, entry.books]))`);
    requireJourney(JSON.stringify(service) === JSON.stringify([[2, 1]]) && typeof thirdId === 'string', 'evaluation-profile-service', service);

    at('evaluation-reevaluate');
    await click(renderer, '返回', 'evaluation-pages-return');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'evaluation-pages-library');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id="${thirdId}"]`, 'evaluation-pages-book');
    await waitFor(renderer, `document.querySelector('.editor-shell [data-work-destination="evaluation"]')`, 'evaluation-pages-manuscript');
    await clickSelector(renderer, '.editor-shell [data-work-destination="evaluation"]', 'evaluation-pages-open');
    await readEvaluation(renderer, (page) => page.record?.heading === '第 2 版 · 编辑评分中', 'evaluation-pages-second');
    for (let ordinal = 2; ordinal <= 12; ordinal += 1) {
      await tick(renderer, '[data-screen="book-evaluation"] .evaluation-conclusion [data-conclusion="revise"] input', 'evaluation-pages-conclusion');
      await clickSelector(renderer, '[data-evaluation-action="finalize"]', 'evaluation-pages-finalize');
      await readEvaluation(renderer, (page) => page.record?.heading === `第 ${ordinal} 版 · 定稿`, 'evaluation-pages-finalized');
      await clickSelector(renderer, '[data-evaluation-action="start"]', 'evaluation-pages-next');
      await readEvaluation(renderer, (page) => page.record?.heading === `第 ${ordinal + 1} 版 · 编辑评分中`, 'evaluation-pages-started');
    }
    await tick(renderer, `${risk('law-rights-ethics-policy')} input[value="low"]`, 'evaluation-pages-low-risk');
    await assertRenderer(renderer, `(() => {
      const original=Promise.prototype.then;
      const held={release:null}; window.__j11HeldEvaluationPage=held;
      try {
        Promise.prototype.then=function(success,failure) {
          Promise.prototype.then=original;
          return original.call(this,
            (value)=>new Promise((resolve)=>{held.release=()=>resolve(success(value));}),
            (error)=>new Promise((_resolve,reject)=>{held.release=()=>reject(error);}));
        };
        document.querySelector('[data-evaluation-action="versions-older"]').click();
      } finally { Promise.prototype.then=original; }
      return true;
    })()`, 'evaluation-pages-hold-completion');
    await waitFor(renderer, `typeof window.__j11HeldEvaluationPage?.release==='function'`, 'evaluation-pages-completion-held');
    await fill(renderer, `${item('literary-quality')} [data-evaluation-field="score"]`, '17.5', 'evaluation-pages-unsaved');
    await assertRenderer(renderer, `(() => { window.__j11HeldEvaluationPage.release(); delete window.__j11HeldEvaluationPage; return true; })()`, 'evaluation-pages-release');
    await waitFor(renderer, `document.querySelectorAll('.evaluation-version-list li').length===3 && document.querySelector('.evaluation-version-list button')?.textContent.startsWith('第 3 版') && document.activeElement===document.querySelector('.evaluation-versions h3')`, 'evaluation-pages-oldest');
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(`${item('literary-quality')} [data-evaluation-field="score"]`)})?.value==='17.5' && document.querySelector('.evaluation-record')?.dataset.entries==='1' && document.querySelector('.evaluation-conclusion [data-conclusion="recommend"] input')?.disabled===false`, 'evaluation-pages-kept-input');
    await clickSelector(renderer, '[data-evaluation-action="versions-latest"]', 'evaluation-pages-latest');
    await waitFor(renderer, `document.querySelectorAll('.evaluation-version-list li').length===10 && document.querySelector('.evaluation-version-list button')?.textContent.startsWith('第 13 版') && document.activeElement===document.querySelector('.evaluation-versions h3')`, 'evaluation-pages-latest-focus');
    await clickSelector(renderer, '[data-evaluation-action="save"]', 'evaluation-pages-save-input');
    await readEvaluation(renderer, (page) => page.record?.entries === '2' && page.record.items[0][2] === '17.5', 'evaluation-pages-saved-input');

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
