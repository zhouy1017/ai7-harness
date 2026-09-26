import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';


// J-16 (Issue #423, plan slice S77a): the 任务 panel — the Book's Tasks beside the manuscript (editor-surfaces §1 任务面,
// V2-UX-TASK-001, TASK-044, TASK-045). J-16's subject is the Interactive Editorial Dialogue; its dialogue Tasks, with
// 回答 and 打开对话, come with it (S17, #52). This first slice proves the panel they will live in, and the way back a
// jump leaves. The Book is made from the one admitted input, exact `sample1`, through the product's own UI; its analyses
// run on the J-04 model adapter, and J-16's unit hold keeps a reading range in flight so a Run can be watched and steered
// from its card.
//
// The manuscript's right-edge 任务 opens the panel in the side slot, closing 导航: 发起全书任务 offers the first baseline
// — 准备任务, with why there is no 快速开始 — above 等你处理 · 进行中 · 最近完成, empty. 准备任务 opens the plan in the same
// slot, and `← 任务` comes back to it waiting in 等你处理 as 计划已准备 · 等你开始, which 待我处理 never lists. Started from
// its plan, the Run is 进行中 on its card with how far it has read; 暂停 on the card holds while the range in flight
// finishes and reads 已暂停 with 续行, and 续行 goes on in the same Run to its end: 已完成 in 最近完成, with 查看结果.
// 发起全书任务 then offers the two whole-Book updates; 重新分析全书 is prepared and started from its plan, and the card's
// 取消任务 opens that plan with its Cancellation Impact Summary focused, confirmed by keyboard: 已取消 joins 最近完成, first,
// with the partial revision it formed.
//
// 查看结果 on the completion opens its result in a floating window as wide as the text column, one row per reading range;
// 跳到 the sixth moves the manuscript there and leaves 回到<位置> in its header, which stays through 导航 and through
// leaving the manuscript and coming back, until it is used and returns to where the editor was reading. ②A's
// 回到稿件范围 leaves the same way back. For J-14, Enter on 任务 opens the panel at its title and Escape closes it back to
// 任务; Escape in the result window returns to the panel; at 200% the panel and the window reflow without sideways
// scroll; under forced colours the window keeps its edge, a card its left rule and a count its outline. A restart moves
// nothing the panel shows.
//
// The runner writes J-16's unit-hold file, and reads the service's projections through `window.ai7` only to cross-check
// what the panel shows — never as the oracle of what it says.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
/** The J-04 model adapter's base fixture: every unit, the reduction and the sample of exact `sample1` answered. */
const FIXTURE_IDENTITY = 'sample1-baseline-happy';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const CREDENTIAL_CLEANUP_TIMEOUT_MS = 15_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;
const BROWSER_CLOSE_TIMEOUT = new Error('J-16/browser-close-timeout');
const CREDENTIAL_CLEANUP_TIMEOUT = new Error('J-16/credential-cleanup-timeout');

let location = 'entry';
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-16', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-16/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-16', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-16' };
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

async function digestFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
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

// ---- the one synthetic credential, and its cleanup (J-03 and J-04's ownership, unchanged) ------------------

async function assertSecretsAbsentFromDataRoot(root, secrets) {
  const needles = secrets.flatMap((secret) => {
    const digest = createHash('sha256').update(secret, 'utf8').digest();
    return [
      Buffer.from(secret, 'utf8'),
      Buffer.from(secret, 'utf16le'),
      digest,
      Buffer.from(digest.toString('hex'), 'utf8'),
      Buffer.from(digest.toString('base64'), 'utf8'),
      Buffer.from(digest.toString('base64url'), 'utf8'),
    ];
  });
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const metadata = await lstat(path);
      requireJourney(!metadata.isSymbolicLink(), 'cleanup-data-symlink');
      if (metadata.isDirectory()) await visit(path);
      else if (metadata.isFile()) {
        const bytes = await readFile(path);
        requireJourney(!needles.some((needle) => bytes.includes(needle)), 'secret-absent-from-product-data');
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

async function removeSyntheticCredentialWithElectron(executable, credentialReference) {
  requireJourney(isAbsolute(executable), 'credential-direct-cleanup-executable');
  requireJourney(UUID_PATTERN.test(credentialReference), 'credential-direct-cleanup-reference');
  requireJourney(
    process.env.NAPI_RS_NATIVE_LIBRARY_PATH === undefined && process.env.NAPI_RS_FORCE_WASI === undefined,
    'credential-direct-cleanup-override',
  );
  const child = spawn(executable, ['-e', CREDENTIAL_CLEANUP_SCRIPT], {
    cwd: ROOT,
    env: { ...productEnvironment(executable), ELECTRON_RUN_AS_NODE: '1' },
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
    result = await awaitFixedOperation(terminal, CREDENTIAL_CLEANUP_TIMEOUT_MS, CREDENTIAL_CLEANUP_TIMEOUT);
  } catch (error) {
    try { child.kill('SIGKILL'); } catch {
      // The bounded terminal observation below remains authoritative.
    }
    try {
      await awaitFixedOperation(terminal, FORCE_EXIT_TIMEOUT_MS, CREDENTIAL_CLEANUP_TIMEOUT);
    } catch {
      child.unref();
    }
    throw error;
  }
  requireJourney(result.code === 0 && result.signal === null, 'credential-direct-cleanup-unconfirmed');
}

function hasErrorCode(error, code) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}

async function recoverSyntheticCredentialCleanupState(dataRoot, runRoot) {
  requireJourney(dataRoot === resolve(runRoot, 'data') && inside(runRoot, dataRoot), 'credential-cleanup-metadata-root');
  const databasePath = resolve(dataRoot, 'store', 'ai7.sqlite');
  let metadata;
  try {
    metadata = await lstat(databasePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { kind: 'not-started' };
    throw new Error('J-16/credential-cleanup-metadata');
  }
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(databasePath)) === databasePath,
    'credential-cleanup-metadata-file');
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    throw new Error('J-16/credential-cleanup-metadata');
  }
  try {
    database.exec('PRAGMA query_only = ON;');
    // The terminal version the service stamps (`BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION`, as J-04 reads it): the 图书交付包
    // revision since Issue #416 (S67a), and after it this pin moves with whatever revision a later slice takes.
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 44, 'credential-cleanup-metadata-version');
    const rows = database.prepare(
      `SELECT connection_id, role_id, provider_id, model_id, adapter_revision, configuration_revision,
              approved_fallback_chain, credential_slot, credential_reference, credential_operation_state
       FROM model_service_connections LIMIT 2`,
    ).all();
    requireJourney(rows.length <= 1, 'credential-cleanup-metadata-cardinality');
    if (rows.length === 0) return { kind: 'not-started' };
    const row = rows[0];
    requireJourney(
      row.connection_id === 'main-editorial-deepseek-v4-pro' && row.role_id === 'main-editorial' &&
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
    if (error instanceof Error && error.message.startsWith('J-16/')) throw error;
    throw new Error('J-16/credential-cleanup-metadata');
  } finally {
    database.close();
  }
}

// ---- the controller's own sentinel and the renderer's pipe ------------------------------------------------

/** An OS-assigned loopback listener the controller owns for the whole Journey: it must never hear a request. */
async function createLoopbackSentinel() {
  let observedRequests = 0;
  let runtimeFault = false;
  let closed = false;
  const server = createServer((_request, response) => {
    observedRequests += 1;
    response.writeHead(204);
    response.end();
  });
  server.on('error', () => { runtimeFault = true; });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(new Error('J-16/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' && Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-16/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j16-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
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
    if (response.error) completion.reject(new Error('J-16/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-16/renderer-cdp-timeout')); }, 60_000);
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
      requireJourney(!response.exceptionDetails, `renderer-evaluate-${location}`);
      return response.result.value;
    },
  };
}

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`).catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-16/${name}`);
}
async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`), name);
}
async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
/** Press the one enabled button a selector names, refusing one that is missing or disabled. */
async function clickSelector(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const button = document.querySelector(${JSON.stringify(selector)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) return false; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); return input.value === ${JSON.stringify(value)}; })()`, name);
}
const TAB = Object.freeze({ key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
async function pressTab(renderer) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...TAB });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...TAB });
}
/** Space as a keyboard sends it, which chooses the focused radio. */
async function pressSpace(renderer) {
  const space = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...space, text: ' ', unmodifiedText: ' ' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...space });
}
/** Enter as a keyboard sends it: only a key that carries its text activates the focused control. */
async function pressEnter(renderer) {
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, text: '\r', unmodifiedText: '\r' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
}

// ---- the product's own ways to the records J-16 needs ----------------------------------------------------

/** Exact `sample1` through the import flow; the second import names the new Book as a distinct intended work. */
async function importSample1(renderer, title, distinct, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await click(renderer, '导入稿件', `${name}-start`);
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${name}-target`);
  const target = distinct ? '新建图书（作为不同作品）' : '新建图书';
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label=${JSON.stringify(target)}]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-target-explicit`);
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, `${name}-relationship`);
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-relationship-explicit`);
  await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, `${name}-title-screen`);
  await assertRenderer(renderer, `document.querySelector('[data-source-sha256]')?.textContent===${JSON.stringify(SAMPLE1_SHA256)} && document.querySelector('[data-source-bytes]')?.textContent===${JSON.stringify(String(SAMPLE1_BYTES))}`, `${name}-exact-source`);
  await fill(renderer, '#book-title', title, `${name}-title`);
  await click(renderer, '确认书名并复核', `${name}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, `${name}-review-ready`);
  // Synchronized delta with Issue #410 (ADR 0086): sample1's inline styles and its one section are retained with
  // the file, so its review asks for no Import Degradation Decision.
  await waitFor(renderer, `!document.querySelector('#accept-import-degradation')&&Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='新建图书并导入稿件'&&!button.disabled)`, `${name}-review-clean`);
  await click(renderer, '新建图书并导入稿件', `${name}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="imported"] .book-overview[data-manuscript-state="populated"]')`, `${name}-completed`, 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, `${name}-acknowledged`, 180_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId ?? null`);
  requireJourney(UUID_PATTERN.test(bookId ?? ''), `${name}-book-identity`);
  return bookId;
}

/** Open a Book from the library into its manuscript, then its 分析 (②A) from the 资料与记录 group. */
async function openAnalysisOf(renderer, bookId, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await clickSelector(renderer, `button[data-book-id=${JSON.stringify(bookId)}]`, `${name}-book`);
  await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookId)}]')`, `${name}-manuscript`);
  await assertRenderer(renderer, `(() => { const group=document.querySelector('.editor-shell nav.book-records-group'); const open=group?.querySelector('button[data-records-destination="analysis"]'); if(!(open instanceof HTMLButtonElement)||open.disabled||open.textContent!=='分析')return false; open.click(); return true; })()`, `${name}-analysis-entry`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(bookId)}] .baseline-analysis-card')`, `${name}-analysis`);
}

/**
 * 开始基线稿件分析 prepares the Task and opens its plan in the drawer (the card's 查看计划并开始 opens it when it
 * does not); the bar's 开始任务 records the Run — and, with a route, hands it to the one slot.
 */
async function startFirstBaseline(renderer, readiness, name) {
  await prepareFirstBaseline(renderer, readiness, name);
  await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', `${name}-start`);
}
/** The first baseline prepared and its plan open in the drawer, ready to start or to change first. */
async function prepareFirstBaseline(renderer, readiness, name) {
  await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='available'`, `${name}-available`);
  await clickSelector(renderer, '.baseline-analysis-card [data-analysis-action="prepare"]', `${name}-prepare`);
  await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, `${name}-prepared`, 120_000);
  const showing = await renderer.evaluate(`(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawer==='open' && drawer.dataset.taskPlanKind==='baseline-analysis' && drawer.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId; })()`);
  if (!showing) await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', `${name}-open-plan`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanKind==='baseline-analysis' && document.querySelector('#task-drawer')?.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId && document.querySelector('#task-drawer')?.dataset.taskPlanStart===${JSON.stringify(readiness)} && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, `${name}-bar-ready`);
}

// ---- J-16's own: the Book, the hold, and the 任务 panel as the editor reads it ------------------------------------

const BOOK = Object.freeze({ title: '任务面旅程' });
const SAMPLE1_UNITS = 8;
/** Two reading ranges settle; the third waits, in flight, until the Journey writes the next number. */
const FIRST_HOLD = 2;
const PANEL_NOTE = '这里只列这本书的任务；跨书的待办在「待我处理」。';
/** Authored words typed a moment before a way out of the panel's result window (Issue #423 review). */
const LEAVE_WORDS = '〔离开前刚写下的字〕';

async function pressEscape(renderer) {
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...escape });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape });
}

/**
 * The 任务 panel as the editor sees it: its title, scope and note; 发起全书任务's procedures and actions, with why one is
 * not offered; and each group's heading, count and cards — each card's state, kind, title, pill, reason and actions.
 */
const READ_PANEL = `(() => {
  const drawer = document.querySelector('#task-drawer');
  const panel = drawer?.querySelector('.task-panel');
  if (!(drawer instanceof HTMLElement) || drawer.hidden || drawer.dataset.taskDrawerView !== 'panel' || !(panel instanceof HTMLElement)) return null;
  const text = (node) => node?.textContent ?? null;
  const state = (selector) => { const button = panel.querySelector(selector); return button === null ? null : button.disabled ? 'disabled' : 'enabled'; };
  const why = panel.querySelector('.task-panel-compose-why');
  return {
    state: panel.dataset.taskPanel ?? null,
    running: panel.dataset.taskPanelRunning ?? null,
    title: text(drawer.querySelector('#task-drawer-title')),
    scope: text(panel.querySelector('.task-panel-scope')),
    note: text(panel.querySelector('.task-panel-note')),
    compose: {
      heading: text(panel.querySelector('.task-panel-compose h3')),
      modes: Array.from(panel.querySelectorAll('.task-panel-compose input[name="task-panel-mode"]')).map((input) => [input.value, input.checked, input.disabled]),
      none: text(panel.querySelector('.task-panel-compose-none')),
      quick: state('[data-task-compose-action="quick"]'),
      prepare: state('[data-task-compose-action="prepare"]'),
      why: why === null || why.hidden ? null : why.textContent,
    },
    groups: Object.fromEntries(Array.from(panel.querySelectorAll('.task-panel-group')).map((group) => [group.dataset.taskGroup, {
      heading: group.querySelector('h3')?.firstChild?.textContent ?? null,
      count: text(group.querySelector('.task-panel-count')),
      empty: text(group.querySelector('.task-panel-empty')),
      cards: Array.from(group.querySelectorAll('li.task-card')).map((card) => ({
        state: card.dataset.taskState ?? null,
        blocked: card.dataset.taskBlocked ?? null,
        kind: text(card.querySelector('.task-card-kind')),
        title: text(card.querySelector('.task-card-title')),
        pill: text(card.querySelector('.task-card-pill')),
        reason: text(card.querySelector('.task-card-reason')),
        actions: Array.from(card.querySelectorAll('[data-task-action]')).map((button) => [button.dataset.taskAction, button.textContent, button.disabled ? 'disabled' : 'enabled']),
      })),
    }])),
  };
})()`;

const cardsOf = (panel, group) => panel.groups[group]?.cards ?? [];
const statesOf = (panel, group) => cardsOf(panel, group).map((card) => card.state);

/** Wait until the panel's reading passes `check`, and fail with the last reading: a panel a read behind settles on its next. */
async function waitForPanel(renderer, check, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await renderer.evaluate(READ_PANEL).catch(() => null);
    if (last !== null && check(last)) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  requireJourney(false, name, last);
}

/** The Book's manuscript, opened from the library. */
async function openManuscriptOf(renderer, bookId, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await clickSelector(renderer, `button[data-book-id=${JSON.stringify(bookId)}]`, `${name}-book`);
  await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookId)}] .ProseMirror [data-block-id]')`, `${name}-manuscript`, 120_000);
}

/** 任务 on the manuscript's right edge: the Book's panel in the side slot, read once it is ready. */
async function openPanel(renderer, name) {
  await clickSelector(renderer, '[data-edge-entry="tasks"]', `${name}-entry`);
  return waitForPanel(renderer, (panel) => panel.state === 'ready', `${name}-panel`);
}

/** One card's action, named by the Task's state and the action's key. */
async function cardAction(renderer, state, action, name) {
  await clickSelector(renderer, `#task-drawer .task-panel li.task-card[data-task-state=${JSON.stringify(state)}] [data-task-action=${JSON.stringify(action)}]`, name);
}

const blockInView = (blockId) => `document.querySelector('[data-screen="editor"] .ProseMirror [data-block-id=${JSON.stringify(blockId)}]') !== null`;
const CHIP = `document.querySelector('[data-screen="editor"] .return-chip-host [data-return-chip]')`;

async function main() {
  parseJourney();
  let browser;
  let browserAcquisition;
  let renderer;
  let loopback;
  let loopbackAcquisition;
  let runRoot;
  let runRootAcquisition;
  let tempParent;
  let dataRoot;
  let launchForCleanup;
  let electronExecutableForCleanup;
  let credentialMutationReached = false;
  let credentialRemoved = false;
  let credentialReferenceForCleanup;
  let syntheticSecret;
  let cleanupFailure;
  let credentialCleanupFailure;
  let cleanupPromise;
  let finalCleanupRequested = false;
  let activeBrowserClose;
  let browserCloseRejected = false;
  let journeyCompleted = false;
  const closeBrowserBounded = async (ownedBrowser) => {
    if (ownedBrowser === undefined || !ownedBrowser.isConnected()) return;
    if (activeBrowserClose !== undefined) return activeBrowserClose;
    const closePromise = ownedBrowser.close();
    closePromise.catch(() => undefined);
    const boundedClose = awaitFixedOperation(closePromise, BROWSER_CLOSE_TIMEOUT_MS, BROWSER_CLOSE_TIMEOUT);
    activeBrowserClose = boundedClose;
    try {
      await boundedClose;
    } catch (error) {
      browserCloseRejected = true;
      runnerLifecycleIncomplete = true;
      throw error;
    } finally {
      if (activeBrowserClose === boundedClose) activeBrowserClose = undefined;
    }
    if (ownedBrowser.isConnected()) {
      browserCloseRejected = true;
      runnerLifecycleIncomplete = true;
      throw new Error('J-16/browser-close-unconfirmed');
    }
  };
  const closeOwnedBrowser = async () => {
    const ownedBrowser = browser;
    const ownedAcquisition = browserAcquisition;
    let acquiredBrowser = ownedBrowser;
    if (acquiredBrowser === undefined && ownedAcquisition !== undefined) {
      try {
        acquiredBrowser = await ownedAcquisition;
      } catch {
        if (browserAcquisition === ownedAcquisition) browserAcquisition = undefined;
        renderer = undefined;
        return;
      }
    }
    await closeBrowserBounded(acquiredBrowser);
    if (browser === acquiredBrowser) browser = undefined;
    if (browserAcquisition === ownedAcquisition) browserAcquisition = undefined;
    renderer = undefined;
  };
  const closeOwnedBrowserForCleanup = async () => {
    try {
      await closeOwnedBrowser();
      return true;
    } catch (error) {
      cleanupFailure ??= error;
      return false;
    }
  };
  const removeCredentialThroughProduct = async () => {
    if (!credentialMutationReached || credentialRemoved) return credentialRemoved;
    if (renderer === undefined) return false;
    const state = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`);
    if (UUID_PATTERN.test(state?.credentialReference)) {
      requireJourney(credentialReferenceForCleanup === undefined || credentialReferenceForCleanup === state.credentialReference, 'credential-cleanup-reference');
      credentialReferenceForCleanup = state.credentialReference;
    }
    if (state === null || state.credentialOperationState === 'missing') {
      credentialRemoved = true;
      return true;
    }
    await renderer.evaluate(`window.ai7.removeModelServiceCredential()`);
    const after = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`);
    if (UUID_PATTERN.test(after?.credentialReference)) {
      requireJourney(credentialReferenceForCleanup === undefined || credentialReferenceForCleanup === after.credentialReference, 'credential-cleanup-reference');
      credentialReferenceForCleanup = after.credentialReference;
    }
    credentialRemoved = after === null || after.credentialOperationState === 'missing';
    requireJourney(credentialRemoved, 'credential-cleanup-state');
    return true;
  };
  const cleanup = () => (cleanupPromise ??= (async () => {
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-16/browser-cleanup-failed');
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        credentialCleanupFailure ??= error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        const closedForRetry = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-16/browser-cleanup-failed');
        if (closedForRetry) {
          try {
            await launchForCleanup({ forCleanup: true });
            await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true'`, 'credential-cleanup-ready');
            await removeCredentialThroughProduct();
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
      }
      if (!credentialRemoved) {
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-16/browser-cleanup-failed');
        const closedForFallback = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-16/browser-cleanup-failed');
        if (closedForFallback && credentialReferenceForCleanup === undefined && dataRoot !== undefined && runRoot !== undefined) {
          try {
            const recovered = await recoverSyntheticCredentialCleanupState(dataRoot, runRoot);
            if (recovered.kind === 'not-started' || recovered.kind === 'removed') credentialRemoved = true;
            else credentialReferenceForCleanup = recovered.credentialReference;
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
        if (closedForFallback && !credentialRemoved && credentialReferenceForCleanup !== undefined) {
          try {
            requireJourney(electronExecutableForCleanup !== undefined, 'credential-direct-cleanup-executable');
            await removeSyntheticCredentialWithElectron(electronExecutableForCleanup, credentialReferenceForCleanup);
            credentialRemoved = true;
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
      }
    }
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-16/browser-cleanup-failed');
    const browserClosed = await closeOwnedBrowserForCleanup();
    if (!browserClosed) throw cleanupFailure ?? new Error('J-16/browser-cleanup-failed');
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    try { await ownedLoopback?.close(); } catch (error) { cleanupFailure ??= error; }
    loopback = undefined;
    if (credentialMutationReached && !credentialRemoved) {
      throw credentialCleanupFailure ?? new Error('J-16/credential-cleanup-failed');
    }
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        try { await assertSecretsAbsentFromDataRoot(dataRoot, [syntheticSecret]); } catch (error) { cleanupFailure ??= error; }
      }
      try {
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j16-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
        await rm(ownedRoot, { recursive: true, force: true });
        runRoot = undefined;
      } catch (error) {
        cleanupFailure ??= error;
      }
    }
    if (cleanupFailure !== undefined) throw cleanupFailure;
  })());
  const interruptOwnedBrowser = async () => {
    if (finalCleanupRequested) return;
    await closeOwnedBrowser();
  };
  const cancellation = installJourneyCancellationCleanup(cleanup, interruptOwnedBrowser);
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
    const { electronExecutable } = await import('../tools/electron-runtime.mjs');
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    cancellation.throwIfRequested();
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j16-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j16-e2e-'), 'temp-root');
    dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    // Every Journey launch names the picker's file, the J-04 model adapter and J-16's unit hold; a cleanup launch none.
    const holdPath = resolve(runRoot, 'j16-unit-hold.txt');
    // The J-04 adapter's fixture: the happy one until the fourth Book's launch (Issue #422, S76d).
    let adapterFixture = FIXTURE_IDENTITY;
    const launchArgs = ({ forCleanup }) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      if (!forCleanup) args.push('--j16-picker-path', SAMPLE1_PATH, '--j04-model-adapter', adapterFixture, '--j10-unit-hold-path', holdPath);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      return args;
    };
    launchForCleanup = async ({ forCleanup = false } = {}) => {
      if (!forCleanup) cancellation.throwIfRequested();
      const acquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args: launchArgs({ forCleanup }), env: productEnvironment(executable), timeout: 60_000 });
      browserAcquisition = acquisition;
      const acquiredBrowser = await acquisition;
      attachProductOutput('J-16', acquiredBrowser, forCleanup ? 'cleanup' : 'launch');
      if (browserAcquisition === acquisition) {
        browser = acquiredBrowser;
        browserAcquisition = undefined;
      }
      if (!forCleanup) cancellation.throwIfRequested();
      renderer = await attachRenderer(acquiredBrowser);
      if (!forCleanup) cancellation.throwIfRequested();
      return renderer;
    };

    at('exact-sample1');
    const sample = await lstat(SAMPLE1_PATH);
    requireJourney(sample.isFile() && !sample.isSymbolicLink() && sample.size === SAMPLE1_BYTES && (await digestFile(SAMPLE1_PATH)) === SAMPLE1_SHA256, 'sample1-identity');

    // ---- the first launch, bound to the J-04 model adapter and J-16's unit hold -----------------------------
    at('renderer-api-boundary');
    // Two reading ranges may settle; the third waits, in flight, until the Journey writes the next number.
    await writeFile(holdPath, String(FIRST_HOLD), 'utf8');
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'product-ready');
    // The 任务 panel is one read, and nothing holds a dialogue yet: dialogue Tasks, their answers and their streaming are S17's.
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && typeof window.ai7.inspectBookTasks === 'function' && !Object.keys(window.ai7).some((key)=>/dialog|chat|conversation|stream/i.test(key))`, 'renderer-api-boundary');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'renderer-network-denial');
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }

    at('book-import');
    const bookId = await importSample1(renderer, BOOK.title, false, 'import');

    at('book-prerequisites');
    // The analysis's prerequisites through the product's own setup: the editorial workspace profile at Revision 2
    // for this Book, and one Main Editorial Role connection whose synthetic credential is saved and removed again,
    // so only its reference is recorded — J-04's route sends nothing and needs no credential.
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="install-disabled"]')`, 'artifact-install-ready');
    await click(renderer, '获取并安装（保持停用）', 'artifact-install');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'artifact-enabled');
    await click(renderer, '返回图书列表', 'model-return-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'model-library');
    await click(renderer, '模型服务', 'model-open');
    await waitFor(renderer, `document.querySelector('[data-screen="model-service"] [data-model-role="main-editorial"]')`, 'model-ready');
    cancellation.throwIfRequested();
    syntheticSecret = randomBytes(48).toString('base64url');
    await fill(renderer, '#main-editorial-connection-name', 'J-16 主编辑连接', 'model-name');
    await fill(renderer, '#main-editorial-credential', syntheticSecret, 'model-secret');
    cancellation.throwIfRequested();
    credentialMutationReached = true;
    await click(renderer, '保护并保存', 'model-save');
    at('model-credential-saved');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('[data-credential-state="ready"]')`, 'model-saved');
    const readyConnection = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(UUID_PATTERN.test(readyConnection?.credentialReference) && readyConnection?.credentialOperationState === 'ready', 'model-ready-reference');
    credentialReferenceForCleanup = readyConnection.credentialReference;
    await click(renderer, '移除', 'model-remove');
    at('model-credential-removed');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='setup-required' && document.querySelector('[data-credential-state="missing"]')`, 'model-removed');
    credentialRemoved = true;
    await click(renderer, '返回', 'model-back');

    const writeHold = (settled) => writeFile(holdPath, String(settled), 'utf8');

    at('panel-open');
    // The manuscript's right edge: 任务 opens the Book's panel in the side slot — 发起全书任务 offering the first baseline,
    // and the three groups, each empty.
    await openManuscriptOf(renderer, bookId, 'panel-manuscript');
    const opened = await openPanel(renderer, 'panel-open');
    requireJourney(opened.title === '任务' && opened.scope === '这本书 · 0 项' && opened.note === PANEL_NOTE && opened.compose.heading === '发起全书任务' &&
      JSON.stringify(opened.compose.modes) === JSON.stringify([['first-baseline', true, false]]) && opened.compose.prepare === 'enabled' &&
      opened.compose.quick === 'disabled' && opened.compose.why === '首次基线分析没有快速开始：先看计划再开始。' &&
      JSON.stringify(['waiting', 'running', 'recent'].map((key) => [opened.groups[key]?.heading, opened.groups[key]?.count, opened.groups[key]?.empty, opened.groups[key]?.cards.length])) ===
        JSON.stringify([['等你处理', '0', '没有等你处理的任务。', 0], ['进行中', '0', '没有进行中的任务。', 0], ['最近完成', '0', '还没有完成的任务。', 0]]),
    'panel-empty', opened);
    await assertRenderer(renderer, `document.querySelector('#manuscript-navigation-panel')?.hidden === true && document.body.dataset.taskDrawer === 'open'`, 'panel-one-slot');

    at('panel-prepare');
    // 准备任务 prepares the first baseline as ②A's own does and opens its plan in the same slot; `← 任务` comes back, where the
    // plan waits in 等你处理 — which 待我处理 never lists.
    await clickSelector(renderer, '#task-drawer [data-task-compose-action="prepare"]', 'panel-prepare');
    await waitFor(renderer, `(() => { const drawer = document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawerView === 'plan' && drawer.dataset.taskPlanKind === 'baseline-analysis' && drawer.dataset.taskPlanStart === 'ready' && drawer.querySelector('[data-task-drawer-control="tasks"]')?.hidden === false; })()`, 'panel-plan-opened', 120_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'panel-back');
    const prepared = await waitForPanel(renderer, (panel) => statesOf(panel, 'waiting').join() === 'analysis-prepared', 'panel-prepared');
    const preparedCard = cardsOf(prepared, 'waiting')[0];
    requireJourney(preparedCard.kind === '分析任务 · 不需要对话' && preparedCard.title === '基线分析 · 首次基线分析' && preparedCard.pill === '计划已准备 · 等你开始' &&
      preparedCard.reason === '计划已准备好，还没有开始；查看计划后开始任务。它不会自己开始。' && preparedCard.blocked === 'false' &&
      JSON.stringify(preparedCard.actions) === JSON.stringify([['next', '查看计划并开始', 'enabled']]) && prepared.scope === '这本书 · 1 项',
    'panel-prepared-card', prepared);
    const preparedAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(preparedAttention?.groups?.every((group) => group.items.every((item) => item.state !== 'analysis-prepared')) === true, 'panel-prepared-not-in-attention');

    at('panel-start');
    // 查看计划并开始 opens the plan, whose bar starts it; back in the panel the Run is 进行中 on its card, with how far it has read.
    await cardAction(renderer, 'analysis-prepared', 'next', 'panel-open-plan');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerView === 'plan' && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled === false`, 'panel-plan-ready');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'panel-start');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState === 'running'`, 'panel-started', 120_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'panel-back-running');
    const running = await waitForPanel(renderer, (panel) => statesOf(panel, 'running').join() === 'analysis-running' &&
      cardsOf(panel, 'running')[0].reason === `正在逐个阅读范围分析 · 已完成 ${FIRST_HOLD}/${SAMPLE1_UNITS} 个阅读范围`, 'panel-running', 180_000);
    requireJourney(running.running === 'true' && cardsOf(running, 'running')[0].pill === '运行中' && statesOf(running, 'waiting').length === 0 &&
      JSON.stringify(cardsOf(running, 'running')[0].actions) === JSON.stringify([['pause', '暂停', 'enabled'], ['cancel', '取消任务', 'enabled'], ['plan', '查看计划', 'enabled']]),
    'panel-running-card', running);

    at('panel-pause');
    // 暂停 on the card, as the drawer's bar would: 正在暂停 while the range in flight finishes, then 已暂停 with 续行.
    await cardAction(renderer, 'analysis-running', 'pause', 'panel-pause');
    await waitForPanel(renderer, (panel) => statesOf(panel, 'running').join() === 'analysis-pausing', 'panel-pausing');
    await writeHold(FIRST_HOLD + 1);
    const paused = await waitForPanel(renderer, (panel) => statesOf(panel, 'running').join() === 'analysis-paused', 'panel-paused', 120_000);
    requireJourney(cardsOf(paused, 'running')[0].pill === '已暂停' &&
      JSON.stringify(cardsOf(paused, 'running')[0].actions) === JSON.stringify([['resume', '续行', 'enabled'], ['cancel', '取消任务', 'enabled'], ['plan', '查看计划', 'enabled']]),
    'panel-paused-card', paused);

    at('panel-resume');
    // 续行 on the card: the same Run goes on, and runs to its end — 已完成 in 最近完成, with 查看结果.
    await cardAction(renderer, 'analysis-paused', 'resume', 'panel-resume');
    await waitForPanel(renderer, (panel) => statesOf(panel, 'running').join() === 'analysis-running', 'panel-resumed', 60_000);
    await writeHold(SAMPLE1_UNITS);
    const done = await waitForPanel(renderer, (panel) => statesOf(panel, 'recent').join() === 'analysis-completed' && statesOf(panel, 'running').length === 0, 'panel-completed', 180_000);
    const doneCard = cardsOf(done, 'recent')[0];
    requireJourney(doneCard.pill === '已完成' && doneCard.reason === '已形成第 1 份基线分析。' && JSON.stringify(doneCard.actions) === JSON.stringify([['result', '查看结果', 'enabled']]),
    'panel-completed-card', done);

    at('panel-compose-update');
    // 发起全书任务 now offers the whole-Book updates — 同步到当前稿件 only once the manuscript moved — and 重新分析全书, prepared
    // and started from its plan.
    const composing = await waitForPanel(renderer, (panel) => panel.compose.modes.length === 2, 'panel-compose-modes');
    requireJourney(JSON.stringify(composing.compose.modes.map(([mode, , disabled]) => [mode, disabled])) === JSON.stringify([['sync-current', true], ['reanalyze-book', false]]) &&
      composing.compose.quick === 'disabled', 'panel-compose-update-modes', composing.compose);
    await assertRenderer(renderer, `(() => { const radio = document.querySelector('#task-drawer input[name="task-panel-mode"][value="reanalyze-book"]'); if (!(radio instanceof HTMLInputElement) || radio.disabled) return false; radio.click(); return radio.checked; })()`, 'panel-compose-choose');
    await waitForPanel(renderer, (panel) => panel.compose.prepare === 'enabled', 'panel-compose-ready');
    await writeHold(1);
    await clickSelector(renderer, '#task-drawer [data-task-compose-action="prepare"]', 'panel-compose-prepare');
    await waitFor(renderer, `(() => { const drawer = document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawerView === 'plan' && drawer.dataset.taskPlanStart === 'ready' && drawer.querySelector('[data-task-drawer-control="start"]')?.disabled === false; })()`, 'panel-update-plan', 120_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'panel-update-start');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState === 'running'`, 'panel-update-running', 120_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'panel-update-back');
    await waitForPanel(renderer, (panel) => statesOf(panel, 'running').join() === 'analysis-running' && cardsOf(panel, 'running')[0].title === '基线分析 · 重新分析全书', 'panel-update-card', 180_000);

    at('panel-cancel');
    // 取消任务 on the card opens the plan with its Cancellation Impact Summary focused, where it is confirmed — here by the
    // keyboard alone. What the Run read is kept: 已取消 stands first in 最近完成 with the partial revision it formed.
    await cardAction(renderer, 'analysis-running', 'cancel', 'panel-cancel');
    await waitFor(renderer, `(() => { const drawer = document.querySelector('#task-drawer'); const impact = drawer?.querySelector('#task-drawer-cancel-impact'); return drawer?.dataset.taskDrawerView === 'plan' && impact instanceof HTMLElement && document.activeElement === impact.querySelector('h4'); })()`, 'panel-cancel-summary');
    await assertRenderer(renderer, `(() => { const confirm = document.querySelector('#task-drawer [data-task-drawer-control="confirm-cancel-run"]'); if (!(confirm instanceof HTMLButtonElement) || confirm.disabled) return false; confirm.focus(); return document.activeElement === confirm; })()`, 'panel-cancel-focus');
    await pressEnter(renderer);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState === 'cancelling'`, 'panel-cancelling', 60_000);
    await writeHold(SAMPLE1_UNITS);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState === 'cancelled-after-start'`, 'panel-cancelled', 120_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'panel-cancel-back');
    const cancelled = await waitForPanel(renderer, (panel) => statesOf(panel, 'recent').join() === 'analysis-cancelled,analysis-completed' && statesOf(panel, 'running').length === 0, 'panel-cancelled-card', 60_000);
    const cancelledCard = cardsOf(cancelled, 'recent')[0];
    requireJourney(cancelledCard.pill === '已取消' && cancelledCard.reason === '你取消了这项任务；读完的阅读范围已形成第 2 份基线分析。' &&
      JSON.stringify(cancelledCard.actions) === JSON.stringify([['result', '查看结果', 'enabled']]) && cancelled.scope === '这本书 · 2 项',
    'panel-cancelled-card-words', cancelled);

    at('result-window');
    // 查看结果 on the completion: its result in a floating window as wide as the text column, at the top of its pane, the
    // reading position left where it is — one row per reading range, each with 跳到, and the window's title focused.
    await cardAction(renderer, 'analysis-completed', 'result', 'result-open');
    await waitFor(renderer, `(() => { const win = document.querySelector('.task-result-window'); const text = document.querySelector('[data-screen="editor"] .ProseMirror'); if (!(win instanceof HTMLElement) || !(text instanceof HTMLElement) || win.dataset.taskResult !== 'ready' || win.dataset.taskResultAligned !== 'column') return false; const a = win.getBoundingClientRect(); const b = text.getBoundingClientRect(); return Math.abs(a.left - b.left) <= 2 && Math.abs(a.width - b.width) <= 2 && document.querySelector('#task-drawer')?.hidden === true; })()`, 'result-window-aligned', 60_000);
    const result = await renderer.evaluate(`(() => { const win = document.querySelector('.task-result-window'); const cells = Array.from(win.querySelectorAll('.task-result-meta dd'), (dd) => dd.textContent); return {
      kind: win.querySelector('.task-result-kind')?.textContent ?? null,
      title: win.querySelector('.task-result-title')?.textContent ?? null,
      pill: win.querySelector('.review-pill')?.textContent ?? null,
      rows: Array.from(win.querySelectorAll('.task-result-meta dt'), (dt) => dt.textContent),
      read: /^全书 8 个阅读范围 · 稿件修订版 /u.test(cells[1] ?? ''),
      notDone: cells[2] ?? null,
      units: Array.from(win.querySelectorAll('tr[data-task-result-unit]'), (row) => [row.dataset.taskResultUnit, row.querySelector('[data-task-result-jump]')?.dataset.taskResultJump ?? null]),
      open: win.querySelector('[data-task-result-action="open"]')?.textContent ?? null,
      focused: document.activeElement === win.querySelector('.task-result-title'),
    }; })()`);
    requireJourney(result?.kind === '任务结果' && result.title === '基线分析 · 首次基线分析' && result.pill === '已完成' && JSON.stringify(result.rows) === JSON.stringify(['任务', '读取了', '没有做']) &&
      result.read === true && result.notDone === '没有修改稿件：分析只读稿件。' && result.units.length === SAMPLE1_UNITS &&
      result.units.every(([unit, blockId], index) => unit === String(index + 1) && typeof blockId === 'string' && blockId.length > 0) && result.open === '在分析中打开' && result.focused,
    'result-window-content', { kind: result?.kind, title: result?.title, pill: result?.pill, rows: result?.rows, units: result?.units?.length });

    at('result-jump');
    // 跳到 the sixth range: the window closes, the manuscript stands there, and 回到<位置> is in its header.
    const target = result.units[5][1];
    await clickSelector(renderer, `.task-result-window [data-task-result-jump=${JSON.stringify(target)}]`, 'result-jump');
    await waitFor(renderer, `document.querySelector('.task-result-window') === null && ${blockInView(target)} && ${CHIP} !== null`, 'result-jumped', 60_000);
    const chip = await renderer.evaluate(`(() => { const chip = ${CHIP}; return chip === null ? null : { blockId: chip.dataset.returnChip ?? null, words: chip.textContent.startsWith('回到') && chip.textContent.length > 2, title: chip.title }; })()`);
    requireJourney(typeof chip?.blockId === 'string' && chip.blockId !== target && chip.words === true && chip.title === '回到跳转前的位置', 'result-jump-chip', { found: chip !== null, same: chip?.blockId === target });
    const railTarget = await renderer.evaluate(`(async () => {
      const overview = await window.ai7.getBookOverview({ bookId: ${JSON.stringify(bookId)}, historyCursor: null });
      const anchor = overview.manuscriptAnchor;
      const current = await window.ai7.getManuscriptWindowAt({ manuscriptId: anchor.manuscriptId, branchId: anchor.branchId,
        target: { kind: 'block', blockId: ${JSON.stringify(target)} } });
      const block = current.blocks.find((item) => item.blockId === ${JSON.stringify(target)}) ?? current.blocks.find((item) => item.kind === 'paragraph');
      const first = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(block.text)][0].segment;
      await window.ai7.createEditorialMark({ manuscriptId: current.manuscriptId, branchId: current.branchId, windowStartBlockId: current.blocks[0].blockId,
        clientMarkId: crypto.randomUUID(), baseRevisionId: current.revisionId, expectedJournalSequence: current.journalSequence,
        blockId: block.blockId, baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 1, selectedText: first,
        kind: 'annotation', highlightColor: null, body: '位置返回测试', proposedText: null, rationale: null });
      return block.blockId;
    })()`);

    at('chip-persists');
    // Until it is used the chip stays: across 导航, and across leaving the manuscript and coming back.
    await clickSelector(renderer, '[data-edge-entry="navigation"]', 'chip-navigation-open');
    await waitFor(renderer, `document.querySelector('#manuscript-navigation-panel')?.hidden === false && ${CHIP} !== null`, 'chip-navigation');
    await clickSelector(renderer, '[data-edge-entry="navigation"]', 'chip-navigation-close');
    await click(renderer, '返回图书工作概览', 'chip-leave');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'chip-overview', 60_000);
    await click(renderer, '打开稿件', 'chip-reopen');
    await waitFor(renderer, `${CHIP} !== null && ${CHIP}.dataset.returnChip === ${JSON.stringify(chip.blockId)}`, 'chip-still-there', 60_000);

    at('chip-return');
    // 回到<位置>: the manuscript is back where the editor was reading before the jump, and the chip is gone.
    await clickSelector(renderer, '[data-screen="editor"] .return-chip-host [data-return-chip]', 'chip-use');
    await waitFor(renderer, `${CHIP} === null && ${blockInView(chip.blockId)} && (document.querySelector('#persistence-status')?.textContent ?? '').startsWith('已回到')`, 'chip-returned', 60_000);
    await waitFor(renderer, `document.querySelector('.rail-marker[data-rail-kind="annotation"]') !== null`, 'mark-rail-ready');
    await clickSelector(renderer, '.rail-marker[data-rail-kind="annotation"]', 'mark-rail-jump');
    await waitFor(renderer, `${blockInView(railTarget)} && ${CHIP}?.dataset.returnChip === ${JSON.stringify(chip.blockId)}`, 'mark-rail-return-chip', 60_000);
    await clickSelector(renderer, '[data-screen="editor"] .return-chip-host [data-return-chip]', 'mark-rail-return');
    await waitFor(renderer, `${CHIP} === null && ${blockInView(chip.blockId)}`, 'mark-rail-returned', 60_000);
    // A way out of 查看结果's window leaves the manuscript as its own ways out do (Issue #423 review): words typed a moment
    // before 在分析中打开 are written first, and the manuscript opened again from ②A holds them where they were typed.
    await openPanel(renderer, 'leave');
    await cardAction(renderer, 'analysis-completed', 'result', 'leave-result-open');
    await waitFor(renderer, `document.querySelector('.task-result-window')?.dataset.taskResult === 'ready'`, 'leave-result-window', 30_000);
    await assertRenderer(renderer, `(() => {
      const block = document.querySelector(${JSON.stringify(`[data-screen="editor"] .ProseMirror [data-block-id="${chip.blockId}"]`)});
      if (!(block instanceof HTMLElement)) return false;
      block.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.execCommand('insertText', false, ${JSON.stringify(LEAVE_WORDS)});
      return block.textContent?.endsWith(${JSON.stringify(LEAVE_WORDS)}) === true;
    })()`, 'leave-typed');
    // At once, well inside the half second before the words would write themselves.
    await assertRenderer(renderer, `(() => { const open = document.querySelector('.task-result-window [data-task-result-action="open"]'); if (!(open instanceof HTMLButtonElement)) return false; open.click(); return true; })()`, 'leave-open-analysis');
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .baseline-analysis-card')?.dataset.resultRevisionOrdinal === '1'`, 'leave-analysis-exact-historical-result', 60_000);
    await click(renderer, '打开稿件', 'leave-reopen');
    await waitFor(renderer, `(document.querySelector(${JSON.stringify(`[data-screen="editor"] .ProseMirror [data-block-id="${chip.blockId}"]`)})?.textContent ?? '').endsWith(${JSON.stringify(LEAVE_WORDS)})`, 'leave-words-kept', 60_000);

    at('analysis-jump-chip');
    // A jump from another screen leaves the same way back: ②A's 回到稿件范围 on the seventh range opens the manuscript there,
    // and 回到<位置> goes back to where the editor last read it.
    await clickSelector(renderer, '[data-edge-entry="analysis"]', 'analysis-open');
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .baseline-analysis-card')`, 'analysis-screen', 60_000);
    await clickSelector(renderer, '[data-screen="book-analysis"] [data-analysis-tab="chapters"]', 'analysis-chapters');
    const rangeBlock = await renderer.evaluate(`document.querySelector('[data-screen="book-analysis"] li.analysis-unit[data-analysis-unit="7"] [data-analysis-action="return-to-range"]')?.dataset.analysisBlockId ?? null`);
    requireJourney(typeof rangeBlock === 'string' && rangeBlock.length > 0, 'analysis-range-block');
    await clickSelector(renderer, '[data-screen="book-analysis"] li.analysis-unit[data-analysis-unit="7"] [data-analysis-action="return-to-range"]', 'analysis-return-to-range');
    await waitFor(renderer, `${blockInView(rangeBlock)} && ${CHIP} !== null && ${CHIP}.dataset.returnChip === ${JSON.stringify(chip.blockId)}`, 'analysis-jumped', 60_000);
    await clickSelector(renderer, '[data-screen="editor"] .return-chip-host [data-return-chip]', 'analysis-chip-use');
    await waitFor(renderer, `${CHIP} === null && ${blockInView(chip.blockId)}`, 'analysis-chip-used', 60_000);

    at('j14-panel-keyboard');
    // Without a pointer: Enter on 任务 opens the panel at its title, Tab moves into it with visible focus, and Escape closes
    // it with the focus back on 任务. In 查看结果's window, Escape brings back the panel it came from.
    await assertRenderer(renderer, `(() => { const entry = document.querySelector('[data-edge-entry="tasks"]'); if (!(entry instanceof HTMLButtonElement)) return false; entry.focus(); return document.activeElement === entry; })()`, 'keyboard-entry-focused');
    await pressEnter(renderer);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerView === 'panel' && document.querySelector('#task-drawer .task-panel')?.dataset.taskPanel === 'ready' && document.activeElement === document.querySelector('#task-drawer-title')`, 'keyboard-panel-open', 10_000);
    await pressTab(renderer);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.contains(document.activeElement) && document.activeElement !== document.querySelector('#task-drawer-title') && document.activeElement.matches(':focus-visible')`, 'keyboard-panel-tab', 10_000);
    await pressEscape(renderer);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden === true && document.activeElement === document.querySelector('[data-edge-entry="tasks"]')`, 'keyboard-panel-closed', 10_000);
    await openPanel(renderer, 'keyboard-result');
    await cardAction(renderer, 'analysis-completed', 'result', 'keyboard-result-open');
    await waitFor(renderer, `document.querySelector('.task-result-window')?.dataset.taskResult === 'ready' && document.activeElement === document.querySelector('.task-result-window .task-result-title')`, 'keyboard-result-window', 30_000);
    await pressEscape(renderer);
    await waitFor(renderer, `document.querySelector('.task-result-window') === null && document.querySelector('#task-drawer')?.dataset.taskDrawerView === 'panel' && document.activeElement === document.querySelector('#task-drawer-title')`, 'keyboard-result-closed', 30_000);

    at('j14-panel-zoom-200-reflow');
    // At 200% the panel's groups and cards, and 查看结果's window, reflow into the width: nothing scrolls sideways.
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [...document.querySelectorAll('#task-drawer .task-panel, #task-drawer .task-panel-group, #task-drawer li.task-card')]; return parts.length >= 6 && parts.every((part) => part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'panel-reflow-at-200', 10_000);
    await cardAction(renderer, 'analysis-completed', 'result', 'reflow-result-open');
    await waitFor(renderer, `(() => { const win = document.querySelector('.task-result-window'); if (!(win instanceof HTMLElement) || win.dataset.taskResult !== 'ready') return false; const rect = win.getBoundingClientRect(); const parts = [win, ...win.querySelectorAll('.task-result-body, .task-result-table, .task-result-meta')]; return rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 2 && parts.every((part) => part.scrollWidth <= part.clientWidth + 2) && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2; })()`, 'result-reflow-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-panel-forced-colors');
    // Without colour 查看结果's window keeps its edge, a card its left rule and a group's count its outline.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => { if (!matchMedia('(forced-colors: active)').matches) return false; const win = document.querySelector('.task-result-window'); return win instanceof HTMLElement && getComputedStyle(win).borderTopStyle === 'solid' && getComputedStyle(win).boxShadow === 'none'; })()`, 'result-window-without-colour');
    await clickSelector(renderer, '.task-result-window [data-task-result-action="close"]', 'forced-colors-close-result');
    await waitFor(renderer, `document.querySelector('.task-result-window') === null && document.querySelector('#task-drawer .task-panel')?.dataset.taskPanel === 'ready'`, 'forced-colors-panel', 30_000);
    await assertRenderer(renderer, `(() => { const card = document.querySelector('#task-drawer li.task-card'); const count = document.querySelector('#task-drawer .task-panel-count'); return card instanceof HTMLElement && getComputedStyle(card).borderLeftStyle === 'solid' && parseFloat(getComputedStyle(card).borderLeftWidth) >= 2 && count instanceof HTMLElement && getComputedStyle(count).borderTopStyle === 'solid'; })()`, 'panel-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });

    at('restart-keeps-tasks');
    // A restart moves nothing the panel shows: the same Tasks in the same groups, and 查看结果 still opens the result.
    const tasksBefore = await renderer.evaluate(`window.ai7.inspectBookTasks().then((tasks) => JSON.stringify(tasks))`);
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    await openManuscriptOf(renderer, bookId, 'restart');
    await openPanel(renderer, 'restart');
    const tasksAfter = await renderer.evaluate(`window.ai7.inspectBookTasks().then((tasks) => JSON.stringify(tasks))`);
    requireJourney(typeof tasksBefore === 'string' && tasksAfter === tasksBefore, 'restart-tasks-unmoved');
    await waitForPanel(renderer, (panel) => statesOf(panel, 'recent').join() === 'analysis-cancelled,analysis-completed', 'restart-panel');
    await cardAction(renderer, 'analysis-completed', 'result', 'restart-result-open');
    await waitFor(renderer, `document.querySelector('.task-result-window')?.dataset.taskResult === 'ready' && document.querySelectorAll('.task-result-window tr[data-task-result-unit]').length === ${SAMPLE1_UNITS}`, 'restart-result', 30_000);
    await clickSelector(renderer, '.task-result-window [data-task-result-action="close"]', 'restart-result-close');

    at('zero-loopback-requests');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-loopback-requests');

    at('completion-browser-close');
    await closeOwnedBrowser();
    journeyCompleted = true;
  } finally {
    // Only a Journey that finished names its cleanup; one that failed keeps the stage it failed at.
    if (journeyCompleted) at('completion-cleanup');
    finalCleanupRequested = true;
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch((error) => {
  reportJourneyFailure('J-16', location, error);
  if (runnerLifecycleIncomplete) process.stderr.write('', () => process.exit(1));
});
