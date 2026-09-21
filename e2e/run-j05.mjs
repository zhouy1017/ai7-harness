import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADMITTED_BASELINE_DOCX, composeAdmittedDocx } from './composed-docx.mjs';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// J-05, first slice (Issue #407): Editorial Marks on the manuscript. An editor marks exact text with a
// highlight, a 批注, a 备注 and a 修改建议, reads each on its Mark Card with its source, previews a
// suggestion in place without the manuscript changing, records a Proposal Decision apart from any
// change to the text, converts marks along the allowed routes, keeps typing while the marks follow
// the text or disclose 原文已变, and finds everything again after a restart. The Apply half of J-05 —
// 接受并应用, its Effect Approval and Receipt — is Issue #408's.
//
// The input is composed at run time from the one admitted Public SampleBook under the content rule in
// docs/agents/ci-test-boundaries.md; every string this runner types is authored here, and every
// comparison of manuscript text happens inside the page and comes back as a boolean.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const EXCERPT = Object.freeze({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '标记旅程甲' });
const ANNOTATION_BODY = '此处称谓与前文不一致，请核对。';
const ANNOTATION_REPLY = '已与作者确认，沿用此处写法。';
const NOTE_BODY = '备注：这一段留到二校再看。';
const NOTE_EDITED = '备注：这一段二校时与第三章对读。';
const SUGGESTED_TEXT = '〔建议文字〕';
const SUGGESTED_REASON = '与全书用法统一。';
const ACCEPTED_TEXT = '〔编辑改定〕';
const ACCEPTED_REASON = '更贴近作者的语气。';
const CONVERTED_NOTE = '由高亮转来的备注。';
const CONVERTED_SUGGESTION = '〔转换建议〕';
const TYPED_BEFORE = '新增';
const TYPED_INSIDE = '改';
// Four ranges inside one paragraph and one inside another, in graphemes of the durable text. The
// paragraphs are chosen at run time so that in their first 80 code units a grapheme is a code unit.
const RANGES = Object.freeze({ highlight: [2, 8], annotation: [10, 16], note: [18, 24], suggestion: [26, 32], second: [3, 9] });

let location = 'entry';
let electronExecutable;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-05', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-05/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-05', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-05' };
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
    server.once('error', () => rejectListen(new Error('J-05/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' &&
      Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-05/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j05-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(new Error('J-05/loopback-close')) : resolveClose());
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
    if (response.error) completion.reject(new Error('J-05/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-05/renderer-cdp-timeout')); }, 60_000);
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
    if (await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-05/${name}`);
}
async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`), name);
}
/** Ask the page which of a step's named states it is in. */
async function probe(renderer, expression) {
  const state = await renderer.evaluate(expression);
  requireJourney(typeof state === 'string', 'probe-state');
  return state;
}
/** The same question, asked until the page answers 'ready' or the step's patience runs out. */
async function settle(renderer, expression, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let state = await probe(renderer, expression);
  while (state !== 'ready' && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    state = await probe(renderer, expression);
  }
  return state;
}
async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, name);
}
async function press(renderer, key, modifiers = 0) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
}
/** Enter as a keyboard sends it: only a key that carries its text activates the focused control. */
async function pressEnter(renderer) {
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, text: '\r', unmodifiedText: '\r' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
}

// Everything the page needs to act like a hand on the manuscript: read a block's durable text (a
// preview's words are not the manuscript's), put a selection or a caret into it by offset, right-click
// an element the way a pointer does, and act on the floating Mark surface by its data attributes.
const PAGE_HELPERS = `(() => {
  if (window.__j05) return true;
  const editor = () => document.querySelector('[data-testid="manuscript-editor"]');
  const block = (id) => editor()?.querySelector('[data-block-id="' + id + '"]') ?? null;
  const durable = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('[data-mark-preview]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  };
  const point = (root, offset) => {
    let left = offset;
    for (const node of durable(root)) {
      if (left <= node.data.length) return [node, left];
      left -= node.data.length;
    }
    return null;
  };
  const layer = () => document.querySelector('.editorial-mark-layer');
  window.__j05 = {
    text: (id) => { const root = block(id); return root ? durable(root).map((node) => node.data).join('') : null; },
    place: (id, from, to) => {
      const root = block(id);
      if (!root) return false;
      editor().focus();
      const start = point(root, from);
      const end = point(root, to);
      if (!start || !end) return false;
      const range = document.createRange();
      range.setStart(start[0], start[1]);
      range.setEnd(end[0], end[1]);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString().length === to - from;
    },
    rightClick: (element, atRightEdge = false) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: atRightEdge ? rect.right - 4 : rect.left + Math.min(10, rect.width / 2), clientY: rect.top + Math.min(24, rect.height / 2) };
      element.dispatchEvent(new MouseEvent('mousedown', init));
      element.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
      element.dispatchEvent(new MouseEvent('contextmenu', { ...init, buttons: 0 }));
      return true;
    },
    block,
    mark: (kind, id) => Array.from(block(id)?.querySelectorAll('.editorial-mark[data-mark-kind="' + kind + '"]') ?? []),
    markText: (kind, id) => window.__j05.mark(kind, id).map((node) => durable(node).map((part) => part.data).join('')).join(''),
    menu: () => document.querySelector('.editorial-mark-menu-layer [data-mark-menu]'),
    item: (action) => document.querySelector('.editorial-mark-menu-layer [data-mark-menu] [data-mark-action="' + action + '"]'),
    card: () => layer()?.querySelector('[data-mark-card]') ?? null,
    composer: () => layer()?.querySelector('[data-mark-composer]') ?? null,
    act: (action) => {
      const control = layer()?.querySelector('[data-mark-card] [data-mark-action="' + action + '"], [data-mark-composer] [data-mark-action="' + action + '"]');
      if (!(control instanceof HTMLButtonElement) || control.disabled) return false;
      control.click();
      return true;
    },
    write: (field, value) => {
      const input = layer()?.querySelector('[data-mark-field="' + field + '"]');
      if (!(input instanceof HTMLTextAreaElement)) return false;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    status: () => document.querySelector('#persistence-status')?.textContent ?? '',
  };
  return true;
})()`;

async function importAndOpen(renderer, title) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'import-landing');
  await click(renderer, '导入稿件', 'import-start');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'import-target');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if (!(radio instanceof HTMLInputElement)) return false; radio.click(); return radio.checked; })()`, 'import-target-select');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if (!(radio instanceof HTMLInputElement) || radio.checked) return false; radio.click(); return radio.checked; })()`, 'import-relationship-select');
  await fill(renderer, '#book-title', title, 'import-title');
  await click(renderer, '确认书名并复核', 'import-review');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'import-review-ready');
  await click(renderer, '新建图书并导入稿件', 'import-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'import-committed', 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`, 'import-acknowledged', 180_000);
  await click(renderer, '打开稿件', 'import-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')`, 'import-editor');
}

/** Wait until nothing typed is waiting for the journal, and no mark command is in flight. */
async function settled(renderer, name) {
  await waitFor(renderer, `Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '保存当前编辑')?.disabled === true && document.documentElement.dataset.ai7CloseRisk !== 'true'`, name);
}

/**
 * Open a menu with the pointer. The editor reads a selection a tick after the page sets it, and a slow
 * runner makes that tick long, so the menu is asked for again until it shows what was prepared.
 */
async function rightClickUntil(renderer, prepare, target, ready, name) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await assertRenderer(renderer, prepare, `${name}-prepare`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await assertRenderer(renderer, `window.__j05.rightClick(${target})`, `${name}-right-click`);
    if (await renderer.evaluate(`Boolean(${ready})`)) return;
    await press(renderer, 'Escape');
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  throw new Error(`J-05/${name}`);
}

async function openSelectionMenu(renderer, blockId, from, to, name) {
  await rightClickUntil(
    renderer,
    `window.__j05.place(${JSON.stringify(blockId)}, ${from}, ${to})`,
    `window.__j05.block(${JSON.stringify(blockId)})`,
    `window.__j05.menu()?.dataset.markMenu === 'selection' && window.__j05.menu().textContent.includes('已选 ${to - from} 字')`,
    name,
  );
}

async function chooseMenuItem(renderer, action, name) {
  await assertRenderer(renderer, `(() => { const item = window.__j05.item(${JSON.stringify(action)}); if (!(item instanceof HTMLButtonElement) || item.disabled) return false; item.click(); return true; })()`, name);
}

/**
 * A pointer puts the caret down before its click arrives, and the editor reads that caret a tick
 * later; a click made by the page is asked again until the editor has.
 */
async function openMarkCard(renderer, kind, blockId, name) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await assertRenderer(renderer, `window.__j05.mark(${JSON.stringify(kind)}, ${JSON.stringify(blockId)}).length > 0 && window.__j05.place(${JSON.stringify(blockId)}, 0, 0)`, `${name}-caret`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await assertRenderer(renderer, `window.__j05.mark(${JSON.stringify(kind)}, ${JSON.stringify(blockId)})[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })) || true`, `${name}-click`);
    const settle = Date.now() + 1_500;
    while (Date.now() < settle) {
      if (await renderer.evaluate(`window.__j05.card()?.dataset.markKind === ${JSON.stringify(kind)}`)) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  throw new Error(`J-05/${name}-card`);
}

async function openMarkMenu(renderer, kind, blockId, name) {
  await rightClickUntil(
    renderer,
    `window.__j05.place(${JSON.stringify(blockId)}, 0, 0)`,
    `window.__j05.mark(${JSON.stringify(kind)}, ${JSON.stringify(blockId)})[0]`,
    `window.__j05.menu()?.dataset.markMenu === 'mark'`,
    name,
  );
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
      requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j05-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j05-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j05-e2e-'), 'temp-root');
    const inputs = resolve(runRoot, 'composed-inputs');
    await mkdir(inputs);
    const manuscript = resolve(inputs, 'marks.docx');
    await composeAdmittedDocx(manuscript, EXCERPT);
    const metadata = await lstat(manuscript);
    requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 1_000, 'fixture-composed');
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const launch = async ({ picker } = {}) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      if (picker) args.push('--j05-picker-path', picker);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-05', browser, 'launch');
      cancellation.throwIfRequested();
      return attachRenderer(browser);
    };
    const close = async () => { await browser.close(); browser = undefined; };

    at('import-and-open');
    let renderer = await launch({ picker: manuscript });
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true'`, 'product-ready');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'renderer-network-denial');
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }
    await loopback.close();
    await importAndOpen(renderer, EXCERPT.title);
    await assertRenderer(renderer, PAGE_HELPERS, 'page-helpers');
    // Two paragraphs long enough to mark, whose first 80 code units are 80 graphemes.
    const blocks = await renderer.evaluate(`(() => { const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }); return Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > p[data-block-id]')).filter((node) => { const head = (node.textContent ?? '').slice(0, 80); return head.length === 80 && Array.from(segmenter.segment(head)).length === 80; }).slice(0, 2).map((node) => node.dataset.blockId); })()`);
    requireJourney(Array.isArray(blocks) && blocks.length === 2 && blocks.every((id) => /^blk_[0-9a-f]{24}$/.test(id)), 'markable-paragraphs');
    const [first, second] = blocks;
    await assertRenderer(renderer, `document.querySelectorAll('.editorial-mark').length === 0 && document.querySelector('.editorial-mark-layer')?.children.length === 0`, 'no-marks-at-start');
    // What the manuscript held before any mark, kept in the page so later comparisons stay booleans.
    await assertRenderer(renderer, `(() => { window.__j05Original = { first: window.__j05.text(${JSON.stringify(first)}), second: window.__j05.text(${JSON.stringify(second)}) }; return typeof window.__j05Original.first === 'string'; })()`, 'original-text-kept');

    at('selection-menu-empty');
    // With nothing selected the mark entries explain themselves instead of acting, and only paste stands.
    await rightClickUntil(
      renderer,
      `window.__j05.place(${JSON.stringify(first)}, 0, 0)`,
      `window.__j05.block(${JSON.stringify(first)})`,
      `window.__j05.menu()?.dataset.markMenu === 'selection' && window.__j05.menu().textContent.includes('未选中文字')`,
      'empty-menu',
    );
    await assertRenderer(renderer, `(() => { const menu = window.__j05.menu(); const groups = Array.from(menu.querySelectorAll('[role="group"]')).map((group) => group.getAttribute('aria-label')); const disabled = (action) => window.__j05.item(action)?.disabled === true; return groups.length === 3 && groups[0].startsWith('文字处理') && groups[1] === '编辑标记' && groups[2] === 'AI7 任务' && disabled('add-annotation') && disabled('add-editor-note') && disabled('add-change-suggestion') && disabled('add-highlight-1') && disabled('cut') && disabled('copy') && !disabled('paste') && menu.textContent.includes('先选中一段文字'); })()`, 'empty-menu-explains');
    await press(renderer, 'Escape');
    await waitFor(renderer, `window.__j05.menu() === null && document.activeElement === document.querySelector('[data-testid="manuscript-editor"]')`, 'escape-returns-focus', 15_000);

    at('selection-menu-cross-paragraph');
    // A selection across two paragraphs is refused by name: a mark lives inside one paragraph.
    await rightClickUntil(
      renderer,
      `(() => { const a = window.__j05.block(${JSON.stringify(first)}); const b = window.__j05.block(${JSON.stringify(second)}); const range = document.createRange(); range.setStart(a.firstChild, 2); range.setEnd(b.firstChild, 2); document.querySelector('[data-testid="manuscript-editor"]').focus(); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return !selection.isCollapsed; })()`,
      `window.__j05.block(${JSON.stringify(first)})`,
      `window.__j05.menu()?.textContent.includes('同一段落') && window.__j05.item('add-annotation')?.disabled === true && window.__j05.item('copy')?.disabled === false`,
      'cross-paragraph-refused',
    );
    await press(renderer, 'Escape');

    at('selection-menu-groups');
    // The three groups on a real selection; the task entries wait for the task surface and say so.
    await openSelectionMenu(renderer, first, RANGES.highlight[0], RANGES.highlight[1], 'selection-menu-open');
    await assertRenderer(renderer, `(() => { const enabled = (action) => window.__j05.item(action)?.disabled === false; const waiting = ['task-on-selection', 'ask-on-selection', 'preset-polish', 'preset-names', 'preset-continuity'].every((action) => window.__j05.item(action)?.disabled === true); const labels = Array.from(window.__j05.menu().querySelectorAll('[role="menuitem"]')).map((item) => item.firstElementChild?.nextElementSibling?.textContent ?? item.firstElementChild?.textContent); return enabled('cut') && enabled('copy') && enabled('paste') && enabled('paste-plain-text') && enabled('add-change-suggestion') && enabled('add-annotation') && enabled('add-editor-note') && enabled('add-highlight-1') && enabled('add-highlight-3') && waiting && window.__j05.menu().textContent.includes('任务面接通后可用') && !labels.includes('加入任务范围') && !labels.includes('在稿件中搜索') && document.activeElement === window.__j05.item('cut'); })()`, 'selection-menu-groups');

    at('selection-menu-keys');
    await press(renderer, 'ArrowDown');
    await assertRenderer(renderer, `document.activeElement === window.__j05.item('copy')`, 'menu-arrow-moves');
    await press(renderer, 'End');
    await assertRenderer(renderer, `document.activeElement === window.__j05.item('add-highlight-3')`, 'menu-end-skips-disabled');

    at('mark-highlight');
    await chooseMenuItem(renderer, 'add-highlight-2', 'highlight-choose');
    await waitFor(renderer, `window.__j05.mark('personal-highlight', ${JSON.stringify(first)}).length > 0 && window.__j05.status().includes('已加高亮')`, 'highlight-drawn');
    await assertRenderer(renderer, `(() => { const mark = window.__j05.mark('personal-highlight', ${JSON.stringify(first)})[0]; const block = window.__j05.block(${JSON.stringify(first)}); return mark.dataset.markColor === '2' && mark.dataset.markSource === 'editor' && mark.dataset.markAnchor === 'exact' && window.__j05.markText('personal-highlight', ${JSON.stringify(first)}) === window.__j05Original.first.slice(${RANGES.highlight[0]}, ${RANGES.highlight[1]}) && block.dataset.markLine === 'personal-highlight' && getComputedStyle(block).borderLeftWidth === '3px' && getComputedStyle(mark).backgroundColor === 'rgb(255, 224, 194)' && window.__j05.text(${JSON.stringify(first)}) === window.__j05Original.first; })()`, 'highlight-exact-and-colored');
    // A highlight has no card: a click on it opens nothing.
    await assertRenderer(renderer, `window.__j05.place(${JSON.stringify(first)}, 0, 0)`, 'highlight-caret');
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    await assertRenderer(renderer, `window.__j05.mark('personal-highlight', ${JSON.stringify(first)})[0].dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })) || true`, 'highlight-click');
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    await assertRenderer(renderer, `window.__j05.card() === null`, 'highlight-has-no-card');

    at('mark-annotation');
    await openSelectionMenu(renderer, first, RANGES.annotation[0], RANGES.annotation[1], 'annotation-menu');
    await chooseMenuItem(renderer, 'add-annotation', 'annotation-choose');
    await waitFor(renderer, `window.__j05.composer()?.dataset.markComposer === 'create-annotation' && document.activeElement?.dataset.markField === 'body'`, 'annotation-composer');
    await assertRenderer(renderer, `window.__j05.composer().querySelector('[data-mark-quote]')?.textContent === window.__j05Original.first.slice(${RANGES.annotation[0]}, ${RANGES.annotation[1]}) && window.__j05.composer().textContent.includes('批注随稿件导出')`, 'annotation-composer-quotes-selection');
    await assertRenderer(renderer, `window.__j05.act('submit')`, 'annotation-empty-submit');
    await waitFor(renderer, `window.__j05.composer()?.querySelector('[role="alert"]')?.hidden === false && window.__j05.mark('annotation', ${JSON.stringify(first)}).length === 0`, 'annotation-empty-refused');
    await assertRenderer(renderer, `window.__j05.write('body', ${JSON.stringify(ANNOTATION_BODY)}) && window.__j05.act('submit')`, 'annotation-submit');
    await waitFor(renderer, `window.__j05.composer() === null && window.__j05.mark('annotation', ${JSON.stringify(first)}).length > 0`, 'annotation-drawn');
    await assertRenderer(renderer, `window.__j05.block(${JSON.stringify(first)}).dataset.markLine === 'annotation' && window.__j05.markText('annotation', ${JSON.stringify(first)}) === window.__j05Original.first.slice(${RANGES.annotation[0]}, ${RANGES.annotation[1]})`, 'annotation-line-outranks-highlight');
    await openMarkCard(renderer, 'annotation', first, 'annotation-open');
    await assertRenderer(renderer, `(() => { const card = window.__j05.card(); return card.getAttribute('role') === 'dialog' && card.querySelector('[data-mark-source]')?.dataset.markSource === 'editor' && card.querySelector('[data-mark-source]').textContent.startsWith('你 · ') && card.querySelector('[data-mark-body]')?.textContent === ${JSON.stringify(ANNOTATION_BODY)} && card.querySelector('[data-mark-state]')?.textContent === '待你处理' && card.textContent.includes('批注随稿件导出') && !card.querySelector('details.technical-details').open && window.__j05.mark('annotation', ${JSON.stringify(first)})[0].classList.contains('editorial-mark-active'); })()`, 'annotation-card-decision-layer');
    // The card sits below its paragraph and keeps to the text column.
    await assertRenderer(renderer, `(() => { const card = window.__j05.card().getBoundingClientRect(); const block = window.__j05.block(${JSON.stringify(first)}).getBoundingClientRect(); return Math.abs(card.left - block.left) <= 2 && Math.abs(card.width - block.width) <= 2 && card.top >= block.bottom - 1; })()`, 'annotation-card-aligned-to-text-column');
    await assertRenderer(renderer, `window.__j05.act('reply')`, 'annotation-reply-open');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-form="reply"]')`, 'annotation-reply-form');
    await assertRenderer(renderer, `window.__j05.write('body', ${JSON.stringify(ANNOTATION_REPLY)}) && window.__j05.act('submit')`, 'annotation-reply-submit');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-region="replies"]')?.textContent.includes(${JSON.stringify(ANNOTATION_REPLY)})`, 'annotation-replied');
    await assertRenderer(renderer, `window.__j05.act('resolve')`, 'annotation-resolve');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-state]')?.textContent === '已处理' && window.__j05.mark('annotation', ${JSON.stringify(first)})[0]?.dataset.markStatus === 'resolved' && window.__j05.block(${JSON.stringify(first)}).dataset.markLine === 'personal-highlight'`, 'annotation-resolved-leaves-the-margin');
    await assertRenderer(renderer, `window.__j05.act('reopen')`, 'annotation-reopen');
    await waitFor(renderer, `window.__j05.mark('annotation', ${JSON.stringify(first)})[0]?.dataset.markStatus === 'open'`, 'annotation-reopened');
    await press(renderer, 'Escape');
    await waitFor(renderer, `window.__j05.card() === null && document.querySelectorAll('.editorial-mark-active').length === 0`, 'annotation-card-closed');

    at('mark-editor-note');
    await openSelectionMenu(renderer, first, RANGES.note[0], RANGES.note[1], 'note-menu');
    await chooseMenuItem(renderer, 'add-editor-note', 'note-choose');
    await waitFor(renderer, `window.__j05.composer()?.dataset.markComposer === 'create-editor-note'`, 'note-composer');
    await assertRenderer(renderer, `window.__j05.composer().textContent.includes('不会发送给模型') && window.__j05.write('body', ${JSON.stringify(NOTE_BODY)}) && window.__j05.act('submit')`, 'note-submit');
    await waitFor(renderer, `window.__j05.mark('editor-note', ${JSON.stringify(first)}).length > 0 && window.__j05.composer() === null`, 'note-drawn');
    await openMarkCard(renderer, 'editor-note', first, 'note-open');
    await assertRenderer(renderer, `(() => { const card = window.__j05.card(); return card.querySelector('[data-mark-state]').textContent === '仅自己可见' && card.textContent.includes('不随稿件导出，也不会发送给模型') && card.querySelector('[data-mark-action="resolve"]') === null && card.querySelector('[data-mark-action="reply"]') === null; })()`, 'note-is-private');
    await assertRenderer(renderer, `window.__j05.act('edit')`, 'note-edit-open');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-form="edit"] [data-mark-field="body"]')?.value === ${JSON.stringify(NOTE_BODY)}`, 'note-edit-form');
    await assertRenderer(renderer, `window.__j05.write('body', ${JSON.stringify(NOTE_EDITED)}) && window.__j05.act('submit')`, 'note-edit-submit');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-body]')?.textContent === ${JSON.stringify(NOTE_EDITED)} && window.__j05.card().querySelector('[data-mark-form]') === null`, 'note-edited');
    await press(renderer, 'Escape');

    at('mark-change-suggestion');
    await openSelectionMenu(renderer, first, RANGES.suggestion[0], RANGES.suggestion[1], 'suggestion-menu');
    await chooseMenuItem(renderer, 'add-change-suggestion', 'suggestion-choose');
    await waitFor(renderer, `window.__j05.composer()?.dataset.markComposer === 'create-change-suggestion'`, 'suggestion-composer');
    await assertRenderer(renderer, `window.__j05.composer().querySelector('[data-mark-field="proposedText"]').value === window.__j05Original.first.slice(${RANGES.suggestion[0]}, ${RANGES.suggestion[1]}) && window.__j05.write('proposedText', ${JSON.stringify(SUGGESTED_TEXT)}) && window.__j05.write('rationale', ${JSON.stringify(SUGGESTED_REASON)}) && window.__j05.act('submit')`, 'suggestion-submit');
    await waitFor(renderer, `window.__j05.mark('change-suggestion', ${JSON.stringify(first)}).length > 0 && window.__j05.composer() === null`, 'suggestion-drawn');
    await assertRenderer(renderer, `window.__j05.block(${JSON.stringify(first)}).dataset.markLine === 'change-suggestion' && document.querySelector('[data-mark-preview]') === null && window.__j05.text(${JSON.stringify(first)}) === window.__j05Original.first && window.__j05.status().includes('稿件本身未改动')`, 'suggestion-changes-no-text');
    await openMarkCard(renderer, 'change-suggestion', first, 'suggestion-open');
    // 预览 · 未应用: the replacement shows in place, labelled, while the manuscript stays the original.
    await assertRenderer(renderer, `(() => { const preview = document.querySelector('[data-mark-preview]'); const mark = window.__j05.mark('change-suggestion', ${JSON.stringify(first)})[0]; return preview?.querySelector('.editorial-mark-preview-text')?.textContent === ${JSON.stringify(SUGGESTED_TEXT)} && preview.querySelector('.editorial-mark-preview-label')?.textContent === '预览 · 未应用' && preview.contentEditable === 'false' && mark.classList.contains('editorial-mark-previewed') && getComputedStyle(mark).textDecorationLine.includes('line-through') && window.__j05.text(${JSON.stringify(first)}) === window.__j05Original.first; })()`, 'suggestion-previews-in-place');
    await assertRenderer(renderer, `(async () => { const work = (await window.ai7.listPriorWork()).find((entry) => entry.bookTitle === ${JSON.stringify(EXCERPT.title)}); const page = await window.ai7.getManuscriptWindowAt({ manuscriptId: work.manuscriptId, branchId: work.branchId, target: { kind: 'start' } }); window.__j05Journal = page.journalSequence; return page.blocks.find((block) => block.blockId === ${JSON.stringify(first)})?.text === window.__j05Original.first && page.marks.length === 4 && page.marksTruncated === false; })()`, 'suggestion-durable-text-unchanged');
    await assertRenderer(renderer, `(() => { const card = window.__j05.card(); const regions = Array.from(card.querySelectorAll('[data-mark-region]')).map((region) => region.dataset.markRegion + ':' + region.querySelector('h4')?.textContent); const accept = card.querySelector('[data-mark-action="accept-and-apply"]'); return regions.join('|') === 'content:修改内容|rationale:修改理由|basis:依据与核查|disposition:你的处理' && card.querySelector('[data-mark-region="content"] del')?.textContent === window.__j05Original.first.slice(${RANGES.suggestion[0]}, ${RANGES.suggestion[1]}) && card.querySelector('[data-mark-region="content"] ins')?.textContent === ${JSON.stringify(SUGGESTED_TEXT)} && card.querySelector('[data-mark-region="rationale"]').textContent.includes(${JSON.stringify(SUGGESTED_REASON)}) && accept?.disabled === true && accept.textContent === '接受并应用' && document.getElementById(accept.getAttribute('aria-describedby'))?.textContent.includes('尚未接通') && card.querySelector('[data-mark-action="reject"]')?.disabled === false && card.querySelector('[data-mark-action="accept-with-edit"]')?.disabled === false && card.querySelector('[data-mark-decision]') === null && card.querySelector('[data-mark-state]').textContent === '待你处理'; })()`, 'suggestion-card-four-regions');

    // A card that opens below the pane's edge is brought into view, and that scroll is the surface's own:
    // the pane does not take it for the reader reaching the window's end.
    await waitFor(renderer, `(() => { const card = window.__j05.card().getBoundingClientRect(); const pane = document.querySelector('.editor-window').getBoundingClientRect(); return (card.bottom <= pane.bottom + 2 || card.top <= pane.top + 2) && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId !== undefined && window.__j05.block(${JSON.stringify(first)}) !== null; })()`, 'card-brought-into-view', 10_000);

    at('suggestion-decisions');
    await assertRenderer(renderer, `window.__j05.act('reject')`, 'reject');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-decision]')?.dataset.markDecision === 'rejected' && document.querySelector('[data-mark-preview]') === null`, 'rejected-recorded');
    await assertRenderer(renderer, `(() => { const card = window.__j05.card(); const mark = window.__j05.mark('change-suggestion', ${JSON.stringify(first)})[0]; const chips = Array.from(card.querySelectorAll('[data-mark-reason-chip]')); return card.querySelector('[data-mark-decision]').textContent === '已拒绝 · 原文保留' && mark.dataset.markStatus === 'resolved' && mark.dataset.markDisposition === 'rejected' && chips.length >= 2 && chips.every((chip) => chip.getAttribute('aria-pressed') !== 'true') && card.querySelector('[data-mark-action="reason-own"]') !== null && card.querySelector('[data-mark-action="reject"]') === null && window.__j05.block(${JSON.stringify(first)}).dataset.markLine === 'annotation'; })()`, 'rejected-keeps-original-and-offers-reasons');
    await assertRenderer(renderer, `(() => { const chip = window.__j05.card().querySelector('[data-mark-reason-chip="方向不合适"]'); if (!chip) return false; chip.click(); return true; })()`, 'reason-chip');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-reason]')?.dataset.markReason === 'suggested' && window.__j05.card().querySelector('[data-mark-reasons]') === null`, 'reason-recorded-once');
    await assertRenderer(renderer, `window.__j05.act('withdraw')`, 'withdraw');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-decision]') === null && window.__j05.card().querySelector('[data-mark-state]').textContent === '待你处理' && document.querySelector('[data-mark-preview]') !== null`, 'withdrawn-returns-to-undecided');
    await assertRenderer(renderer, `window.__j05.act('accept-with-edit')`, 'accept-with-edit-open');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-form="accept-with-edit"] [data-mark-field="proposedText"]')?.value === ${JSON.stringify(SUGGESTED_TEXT)}`, 'accept-with-edit-form');
    await assertRenderer(renderer, `window.__j05.card().querySelector('[data-mark-form] label:last-of-type span').textContent.startsWith('为什么这样改？（可选') && window.__j05.write('proposedText', ${JSON.stringify(ACCEPTED_TEXT)}) && window.__j05.write('reason', ${JSON.stringify(ACCEPTED_REASON)}) && window.__j05.act('submit')`, 'accept-with-edit-submit');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-decision]')?.dataset.markDecision === 'accepted-with-edit'`, 'accept-with-edit-recorded');
    // A filled 为什么这样改 is the reason: no second prompt follows (V2-UX-FDBK-003).
    await assertRenderer(renderer, `(() => { const card = window.__j05.card(); return card.querySelector('[data-mark-decision]').textContent.includes('尚未写入稿件') && card.querySelector('[data-mark-reason]')?.dataset.markReason === 'reason-field' && card.querySelector('[data-mark-reason]').textContent.includes(${JSON.stringify(ACCEPTED_REASON)}) && card.querySelector('[data-mark-reasons]') === null && card.querySelector('[data-mark-region="content"] ins').textContent === ${JSON.stringify(ACCEPTED_TEXT)} && document.querySelector('[data-mark-preview] .editorial-mark-preview-text')?.textContent === ${JSON.stringify(ACCEPTED_TEXT)} && window.__j05.text(${JSON.stringify(first)}) === window.__j05Original.first; })()`, 'accepted-is-recorded-not-applied');
    await assertRenderer(renderer, `(async () => { const work = (await window.ai7.listPriorWork()).find((entry) => entry.bookTitle === ${JSON.stringify(EXCERPT.title)}); const page = await window.ai7.getManuscriptWindowAt({ manuscriptId: work.manuscriptId, branchId: work.branchId, target: { kind: 'start' } }); return page.journalSequence === window.__j05Journal && page.blocks.find((block) => block.blockId === ${JSON.stringify(first)})?.text === window.__j05Original.first; })()`, 'decisions-wrote-no-manuscript-text');
    await assertRenderer(renderer, `(() => { const details = window.__j05.card().querySelector('details.technical-details'); details.open = true; const terms = Array.from(details.querySelectorAll('dt')).map((term) => term.textContent); return terms.includes('提案修改项') && terms.includes('提案决定') && terms.includes('标记时的修订版'); })()`, 'technical-identities-are-one-step-away');
    await press(renderer, 'Escape');

    at('mark-conversions');
    await openSelectionMenu(renderer, second, RANGES.second[0], RANGES.second[1], 'second-menu');
    await chooseMenuItem(renderer, 'add-highlight-1', 'second-highlight');
    await waitFor(renderer, `window.__j05.mark('personal-highlight', ${JSON.stringify(second)}).length > 0`, 'second-highlight-drawn');
    await openMarkMenu(renderer, 'personal-highlight', second, 'highlight-menu');
    await assertRenderer(renderer, `(() => { const has = (action) => window.__j05.item(action) !== null; return has('recolor-2') && has('recolor-3') && !has('recolor-1') && has('remove') && has('convert-editor-note') && has('convert-annotation') && has('convert-change-suggestion') && has('copy-marked-text') && window.__j05.item('task-on-selection')?.disabled === true; })()`, 'highlight-menu-entries');
    await chooseMenuItem(renderer, 'recolor-3', 'highlight-recolor');
    await waitFor(renderer, `window.__j05.mark('personal-highlight', ${JSON.stringify(second)})[0]?.dataset.markColor === '3'`, 'highlight-recolored');
    await openMarkMenu(renderer, 'personal-highlight', second, 'highlight-menu-again');
    await chooseMenuItem(renderer, 'convert-editor-note', 'highlight-to-note');
    await waitFor(renderer, `window.__j05.composer()?.dataset.markComposer === 'convert-editor-note'`, 'convert-note-composer');
    await assertRenderer(renderer, `window.__j05.write('body', ${JSON.stringify(CONVERTED_NOTE)}) && window.__j05.act('submit')`, 'convert-note-submit');
    await waitFor(renderer, `window.__j05.mark('editor-note', ${JSON.stringify(second)}).length > 0 && window.__j05.mark('personal-highlight', ${JSON.stringify(second)}).length === 0`, 'highlight-became-note');
    await waitFor(renderer, `window.__j05.card()?.dataset.markKind === 'editor-note' && window.__j05.card().querySelector('[data-mark-source]').textContent.includes('由高亮转来')`, 'note-names-its-origin');
    await assertRenderer(renderer, `window.__j05.act('convert-annotation')`, 'note-to-annotation');
    await waitFor(renderer, `window.__j05.card()?.dataset.markKind === 'annotation' && window.__j05.card().querySelector('[data-mark-body]').textContent === ${JSON.stringify(CONVERTED_NOTE)} && window.__j05.mark('editor-note', ${JSON.stringify(second)}).length === 0`, 'note-became-annotation');
    await assertRenderer(renderer, `window.__j05.act('convert-change-suggestion')`, 'annotation-to-suggestion-open');
    await waitFor(renderer, `window.__j05.card()?.querySelector('[data-mark-form="convert-change-suggestion"] [data-mark-field="rationale"]')?.value === ${JSON.stringify(CONVERTED_NOTE)}`, 'annotation-to-suggestion-form');
    await assertRenderer(renderer, `window.__j05.write('proposedText', ${JSON.stringify(CONVERTED_SUGGESTION)}) && window.__j05.act('submit')`, 'annotation-to-suggestion-submit');
    await waitFor(renderer, `window.__j05.card()?.dataset.markKind === 'change-suggestion' && window.__j05.mark('annotation', ${JSON.stringify(second)}).length === 0`, 'annotation-became-suggestion');
    await assertRenderer(renderer, `(() => { const card = window.__j05.card(); return card.querySelector('[data-mark-region="rationale"]').textContent.includes(${JSON.stringify(CONVERTED_NOTE)}) && card.querySelector('[data-mark-source]').textContent.includes('由批注转来') && window.__j05.markText('change-suggestion', ${JSON.stringify(second)}) === window.__j05Original.second.slice(${RANGES.second[0]}, ${RANGES.second[1]}) && window.__j05.text(${JSON.stringify(second)}) === window.__j05Original.second; })()`, 'conversion-keeps-the-pinned-text');
    // An undecided suggestion may go back to a comment that says what it proposed.
    await assertRenderer(renderer, `window.__j05.act('convert-annotation')`, 'suggestion-to-annotation');
    await waitFor(renderer, `window.__j05.card()?.dataset.markKind === 'annotation' && window.__j05.card().querySelector('[data-mark-body]').textContent.includes(${JSON.stringify(CONVERTED_SUGGESTION)})`, 'suggestion-became-annotation');
    await assertRenderer(renderer, `window.__j05.act('remove')`, 'annotation-remove');
    await waitFor(renderer, `window.__j05.card() === null && window.__j05.block(${JSON.stringify(second)}).querySelectorAll('.editorial-mark').length === 0 && window.__j05.block(${JSON.stringify(second)}).dataset.markLine === undefined`, 'second-paragraph-clean-again');

    at('marks-follow-edits');
    // Typing in front of four marks moves all four with their text.
    await assertRenderer(renderer, `window.__j05.place(${JSON.stringify(first)}, 0, 0) && document.execCommand('insertText', false, ${JSON.stringify(TYPED_BEFORE)})`, 'type-before-marks');
    await assertRenderer(renderer, `['personal-highlight', 'annotation', 'editor-note', 'change-suggestion'].every((kind, index) => window.__j05.markText(kind, ${JSON.stringify(first)}) === window.__j05Original.first.slice(...[${JSON.stringify(RANGES.highlight)}, ${JSON.stringify(RANGES.annotation)}, ${JSON.stringify(RANGES.note)}, ${JSON.stringify(RANGES.suggestion)}][index]))`, 'marks-follow-unflushed-typing');
    await settled(renderer, 'type-before-settled');
    await assertRenderer(renderer, `['personal-highlight', 'annotation', 'editor-note', 'change-suggestion'].every((kind, index) => window.__j05.markText(kind, ${JSON.stringify(first)}) === window.__j05Original.first.slice(...[${JSON.stringify(RANGES.highlight)}, ${JSON.stringify(RANGES.annotation)}, ${JSON.stringify(RANGES.note)}, ${JSON.stringify(RANGES.suggestion)}][index])) && Array.from(window.__j05.block(${JSON.stringify(first)}).querySelectorAll('.editorial-mark')).every((mark) => mark.dataset.markAnchor === 'exact')`, 'marks-follow-the-journal');
    // Typing inside the commented text: the comment stays where it was made and says 原文已变.
    await assertRenderer(renderer, `window.__j05.place(${JSON.stringify(first)}, ${RANGES.annotation[0] + TYPED_BEFORE.length + 3}, ${RANGES.annotation[0] + TYPED_BEFORE.length + 3}) && document.execCommand('insertText', false, ${JSON.stringify(TYPED_INSIDE)})`, 'type-inside-annotation');
    await assertRenderer(renderer, `window.__j05.mark('annotation', ${JSON.stringify(first)}).every((mark) => mark.dataset.markAnchor === 'drifted')`, 'drift-shows-before-the-journal-answers');
    await settled(renderer, 'type-inside-settled');
    await assertRenderer(renderer, `window.__j05.mark('annotation', ${JSON.stringify(first)}).every((mark) => mark.dataset.markAnchor === 'drifted') && window.__j05.mark('editor-note', ${JSON.stringify(first)}).every((mark) => mark.dataset.markAnchor === 'exact') && window.__j05.markText('editor-note', ${JSON.stringify(first)}) === window.__j05Original.first.slice(${RANGES.note[0]}, ${RANGES.note[1]})`, 'drift-is-durable-and-local');
    await openMarkCard(renderer, 'annotation', first, 'drifted-open');
    await assertRenderer(renderer, `(() => { const card = window.__j05.card(); return card.dataset.markAnchor === 'drifted' && card.querySelector('[data-mark-drifted]')?.textContent.includes('原文已变') && card.querySelector('[data-mark-drifted]').textContent.includes(window.__j05Original.first.slice(${RANGES.annotation[0]}, ${RANGES.annotation[1]})) && card.querySelector('[data-mark-state]').textContent.includes('原文已变') && card.querySelector('[data-mark-action="convert-change-suggestion"]')?.disabled === true; })()`, 'drift-is-disclosed-never-rematched');
    await press(renderer, 'Escape');
    // Undoing the change puts the commented text back, and the comment is exact on it again.
    await click(renderer, '撤销', 'undo-inside');
    await waitFor(renderer, `window.__j05.mark('annotation', ${JSON.stringify(first)}).length > 0 && window.__j05.mark('annotation', ${JSON.stringify(first)}).every((mark) => mark.dataset.markAnchor === 'exact') && window.__j05.markText('annotation', ${JSON.stringify(first)}) === window.__j05Original.first.slice(${RANGES.annotation[0]}, ${RANGES.annotation[1]})`, 'undo-restores-the-anchor');

    at('clipboard-commands');
    // The page holds no clipboard permission; the window that owns the editor cuts and pastes.
    await assertRenderer(renderer, `navigator.clipboard.readText().then(() => false, () => true)`, 'page-has-no-clipboard-permission');
    await assertRenderer(renderer, `(() => { window.__j05Before = window.__j05.text(${JSON.stringify(second)}); return true; })()`, 'clipboard-before');
    await openSelectionMenu(renderer, second, 12, 16, 'cut-menu');
    await chooseMenuItem(renderer, 'cut', 'cut-choose');
    await waitFor(renderer, `window.__j05.text(${JSON.stringify(second)}) === window.__j05Before.slice(0, 12) + window.__j05Before.slice(16)`, 'cut-removed-the-selection');
    await assertRenderer(renderer, `window.__j05.place(${JSON.stringify(second)}, 12, 12)`, 'paste-caret');
    await new Promise((resolveWait) => setTimeout(resolveWait, 60));
    await assertRenderer(renderer, `window.__j05.rightClick(window.__j05.block(${JSON.stringify(second)}))`, 'paste-right-click');
    await waitFor(renderer, `window.__j05.menu()?.dataset.markMenu === 'selection'`, 'paste-menu');
    await chooseMenuItem(renderer, 'paste-plain-text', 'paste-choose');
    await waitFor(renderer, `window.__j05.text(${JSON.stringify(second)}) === window.__j05Before`, 'paste-put-it-back');
    await settled(renderer, 'clipboard-settled');

    at('j14-marks-zoom-200-reflow');
    await openMarkCard(renderer, 'change-suggestion', first, 'zoom-card');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const card = window.__j05.card(); const pane = document.querySelector('.editor-window'); const block = window.__j05.block(${JSON.stringify(first)}).getBoundingClientRect(); const box = card.getBoundingClientRect(); return card.scrollWidth <= card.clientWidth + 2 && box.right <= pane.getBoundingClientRect().right + 2 && Math.abs(box.left - block.left) <= 2 && box.top >= block.bottom - 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2; })()`, 'card-reflows-at-200', 10_000);
    await press(renderer, 'Escape');

    at('menu-stays-open-at-the-pane-edge');
    // On a narrow window a menu opened at the text column's right edge has nowhere to go but over the
    // pane's edge. It floats over the window, so it neither brings a scrollbar into the pane nor is
    // closed by the pane's own reflow — which is what closed it, the moment it opened, on hosted runners.
    await assertRenderer(renderer, `window.__j05.place(${JSON.stringify(first)}, 0, 0)`, 'edge-caret');
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
    await assertRenderer(renderer, `(() => { window.__j05Pane = document.querySelector('.editor-window').scrollWidth; return window.__j05.rightClick(window.__j05.block(${JSON.stringify(first)}), true); })()`, 'edge-right-click');
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
    await assertRenderer(renderer, `(() => { const menu = window.__j05.menu(); if (menu === null) return false; const box = menu.getBoundingClientRect(); const pane = document.querySelector('.editor-window'); return box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && pane.scrollWidth <= window.__j05Pane && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2; })()`, 'edge-menu-open-and-inside-the-window');
    await press(renderer, 'Escape');
    await waitFor(renderer, `window.__j05.menu() === null`, 'edge-menu-closed', 15_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-marks-forced-colors');
    await openMarkCard(renderer, 'change-suggestion', first, 'forced-colors-card');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    // Without colour, the line under the text says which kind of mark it is.
    await assertRenderer(renderer, `(() => { if (!matchMedia('(forced-colors: active)').matches) return false; const style = (kind) => getComputedStyle(window.__j05.mark(kind, ${JSON.stringify(first)})[0]); const lines = ['change-suggestion', 'annotation', 'editor-note'].map((kind) => style(kind).borderBottomStyle); return new Set(lines).size === 3 && style('personal-highlight').outlineStyle === 'solid' && getComputedStyle(window.__j05.card()).boxShadow === 'none'; })()`, 'kinds-differ-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await press(renderer, 'Escape');

    at('marks-keyboard-menu-open');
    // The menu is reachable without a pointer: the context-menu key on a caret inside a mark. A hosted
    // runner says nothing but a stage name, so each step names the precondition it found missing.
    const windowState = await probe(renderer, `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); if (window.__j05.block(${JSON.stringify(first)}) === null) return 'window-moved'; if (editor.getAttribute('aria-readonly') !== 'false') return 'editor-read-only'; return 'ready'; })()`);
    if (windowState === 'window-moved') at('marks-keyboard-menu-open-window-moved');
    else if (windowState === 'editor-read-only') at('marks-keyboard-menu-open-editor-read-only');
    requireJourney(windowState === 'ready', 'keyboard-window-ready');
    await assertRenderer(renderer, `window.__j05.place(${JSON.stringify(first)}, ${RANGES.note[0] + TYPED_BEFORE.length + 2}, ${RANGES.note[0] + TYPED_BEFORE.length + 2})`, 'keyboard-caret-in-note');
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await press(renderer, 'ContextMenu');
    const opened = await settle(renderer, `(() => { const menu = window.__j05.menu(); if (menu === null) return 'no-menu'; if (menu.dataset.markMenu !== 'mark') return 'selection-menu'; if (!menu.getAttribute('aria-label').startsWith('备注')) return 'other-mark'; return document.activeElement === window.__j05.item('open-card') ? 'ready' : 'unfocused'; })()`);
    if (opened === 'no-menu') at('marks-keyboard-menu-open-no-menu');
    else if (opened === 'selection-menu') at('marks-keyboard-menu-open-selection-menu');
    else if (opened === 'other-mark') at('marks-keyboard-menu-open-other-mark');
    else if (opened === 'unfocused') at('marks-keyboard-menu-open-unfocused');
    requireJourney(opened === 'ready', 'keyboard-opens-the-mark-menu');

    at('marks-keyboard-menu-activate');
    await pressEnter(renderer);
    const activated = await settle(renderer, `(() => { if (window.__j05.card()?.dataset.markKind === 'editor-note') return 'ready'; return window.__j05.menu() === null ? 'no-card' : 'menu-still-open'; })()`);
    if (activated === 'menu-still-open') at('marks-keyboard-menu-activate-menu-still-open');
    else if (activated === 'no-card') at('marks-keyboard-menu-activate-no-card');
    requireJourney(activated === 'ready', 'keyboard-opens-the-card');

    at('marks-keyboard-menu-return');
    await press(renderer, 'Escape');
    const returned = await settle(renderer, `(() => { if (window.__j05.card() !== null) return 'card-still-open'; return document.activeElement === document.querySelector('[data-testid="manuscript-editor"]') ? 'ready' : 'focus-elsewhere'; })()`);
    if (returned === 'card-still-open') at('marks-keyboard-menu-return-card-still-open');
    else if (returned === 'focus-elsewhere') at('marks-keyboard-menu-return-focus-elsewhere');
    requireJourney(returned === 'ready', 'keyboard-returns-to-the-text');

    at('marks-settled-before-restart');
    await settled(renderer, 'before-restart-settled');
    await close();

    at('marks-survive-restart');
    renderer = await launch();
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]') && document.querySelector('.recent-work-item button')`, 'restart-prior-work');
    await assertRenderer(renderer, `(() => { document.querySelector('.recent-work-item button').click(); return true; })()`, 'restart-open');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && document.querySelector('[data-testid="manuscript-editor"] .editorial-mark')`, 'restart-editor-with-marks');
    await assertRenderer(renderer, PAGE_HELPERS, 'restart-page-helpers');
    await assertRenderer(renderer, `(() => { const kinds = ['personal-highlight', 'annotation', 'editor-note', 'change-suggestion']; const block = window.__j05.block(${JSON.stringify(first)}); return kinds.every((kind) => window.__j05.mark(kind, ${JSON.stringify(first)}).length > 0 && window.__j05.mark(kind, ${JSON.stringify(first)}).every((mark) => mark.dataset.markAnchor === 'exact')) && window.__j05.mark('personal-highlight', ${JSON.stringify(first)})[0].dataset.markColor === '2' && window.__j05.mark('change-suggestion', ${JSON.stringify(first)})[0].dataset.markDisposition === 'accepted-with-edit' && block.dataset.markLine === 'change-suggestion' && window.__j05.block(${JSON.stringify(second)}).querySelectorAll('.editorial-mark').length === 0; })()`, 'restart-marks-where-they-were');
    await openMarkCard(renderer, 'change-suggestion', first, 'restart-suggestion');
    await assertRenderer(renderer, `(() => { const card = window.__j05.card(); return card.querySelector('[data-mark-decision]')?.dataset.markDecision === 'accepted-with-edit' && card.querySelector('[data-mark-reason]')?.textContent.includes(${JSON.stringify(ACCEPTED_REASON)}) && card.querySelector('[data-mark-region="content"] ins').textContent === ${JSON.stringify(ACCEPTED_TEXT)} && document.querySelector('[data-mark-preview] .editorial-mark-preview-text')?.textContent === ${JSON.stringify(ACCEPTED_TEXT)}; })()`, 'restart-decision-and-reason-kept');
    await press(renderer, 'Escape');
    await openMarkCard(renderer, 'annotation', first, 'restart-annotation');
    await assertRenderer(renderer, `window.__j05.card().querySelector('[data-mark-region="replies"]')?.textContent.includes(${JSON.stringify(ANNOTATION_REPLY)}) && window.__j05.card().querySelector('[data-mark-body]').textContent === ${JSON.stringify(ANNOTATION_BODY)}`, 'restart-replies-kept');
    await press(renderer, 'Escape');

    at('completion-browser-close');
    await close();
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

main().catch((error) => reportJourneyFailure('J-05', location, error));
