import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// J-09 (Issue #424, plan slice S78): 待我处理 — a cross-Book attention view (editor-surfaces §8.1, V2-UX-ATTN-001
// to 009, IA-007). Two Books are made from the one admitted input, exact `sample1`, through the product's own
// UI: on the first, a launch with no executable route records a baseline analysis Run that is blocked before
// dispatch; on the second, a launch bound to the J-04 model adapter completes one, then prepares a range update
// twice with two ranges, so a pending Plan Revision waits for 重新确认计划. The header's 待我处理 then counts
// exactly the first two groups, and its screen lists the four groups in their fixed order: the blocked Run
// under 异常与结果待确认, the Plan Revision under 等待你的决定, 运行中与已暂停 empty with its quiet line, and the
// completion under 最近完成. Each item opens its own record in the window that asked; reading the view moves no
// stored byte; and the view is reached, read and left by keyboard, reflows at 200% and keeps its shapes and
// rules in forced colours. Concurrency (#49) and Enrollment (#95) are not this Journey's.
//
// The runner reads the service's projection through `window.ai7.inspectGlobalAttention()` only to cross-check
// what the page shows, and opens the product database read-only only to digest every relation before and
// after the view is read — never as the oracle of what the view says.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
/** The J-04 model adapter's base fixture: every unit, the reduction and the sample of exact `sample1` answered. */
const FIXTURE_IDENTITY = 'sample1-baseline-happy';
const FIRST = Object.freeze({ title: '待我处理旅程甲' });
const SECOND = Object.freeze({ title: '待我处理旅程乙' });
const GROUP_ORDER = Object.freeze(['exceptions', 'decisions', 'active', 'recent']);
const GROUP_LABELS = Object.freeze(['异常与结果待确认', '等待你的决定', '运行中与已暂停', '最近完成']);
// The screen's own words (`src/renderer/global-attention-labels.ts`), pinned there by its unit suite.
const REASON_BLOCKED = '授权已记录，派发前阻止：当前启动没有可执行的路由。';
const REASON_PLAN_REVISION = '计划冻结之后，它的关键内容已经变化；原计划不能再开始。';
const ACTIVE_EMPTY = '没有正在运行或中途停止的任务。';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const CREDENTIAL_CLEANUP_TIMEOUT_MS = 15_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;
const BROWSER_CLOSE_TIMEOUT = new Error('J-09/browser-close-timeout');
const CREDENTIAL_CLEANUP_TIMEOUT = new Error('J-09/credential-cleanup-timeout');

let location = 'entry';
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-09', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-09/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-09', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-09' };
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
    throw new Error('J-09/credential-cleanup-metadata');
  }
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(databasePath)) === databasePath,
    'credential-cleanup-metadata-file');
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    throw new Error('J-09/credential-cleanup-metadata');
  }
  try {
    database.exec('PRAGMA query_only = ON;');
    // The terminal version the service stamps (`BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION`, as J-04 reads it): 待我处理
    // adds no relation, so this pin moves only with a revision some other slice takes.
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 39, 'credential-cleanup-metadata-version');
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
    if (error instanceof Error && error.message.startsWith('J-09/')) throw error;
    throw new Error('J-09/credential-cleanup-metadata');
  } finally {
    database.close();
  }
}

/**
 * Every row of every relation of the product database, as one digest per relation, read while the product
 * runs through a separate read-only connection: what a read must leave exactly as it found it. It is never
 * the oracle of what 待我处理 says — the page and the service's own projection are.
 */
function storeDigest(dataRoot) {
  const database = new DatabaseSync(resolve(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    database.exec('PRAGMA query_only = ON;');
    const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map((row) => row.name);
    return Object.fromEntries(tables.map((table) => {
      const rows = database.prepare(`SELECT * FROM "${table}"`).all()
        .map((row) => JSON.stringify(row, (_key, value) => value instanceof Uint8Array ? Buffer.from(value).toString('hex') : value))
        .sort();
      return [table, createHash('sha256').update(rows.join('\n')).digest('hex')];
    }));
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
    server.once('error', () => rejectListen(new Error('J-09/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' && Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-09/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j09-network-probe`,
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
    if (response.error) completion.reject(new Error('J-09/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-09/renderer-cdp-timeout')); }, 60_000);
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
  throw new Error(`J-09/${name}`);
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
/** Enter as a keyboard sends it: only a key that carries its text activates the focused control. */
async function pressEnter(renderer) {
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, text: '\r', unmodifiedText: '\r' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
}

// ---- the product's own ways to the records J-09 needs ----------------------------------------------------

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
  await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='available'`, `${name}-available`);
  await clickSelector(renderer, '.baseline-analysis-card [data-analysis-action="prepare"]', `${name}-prepare`);
  await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, `${name}-prepared`, 120_000);
  const showing = await renderer.evaluate(`(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawer==='open' && drawer.dataset.taskPlanKind==='baseline-analysis' && drawer.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId; })()`);
  if (!showing) await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', `${name}-open-plan`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanKind==='baseline-analysis' && document.querySelector('#task-drawer')?.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId && document.querySelector('#task-drawer')?.dataset.taskPlanStart===${JSON.stringify(readiness)} && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, `${name}-bar-ready`);
  await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', `${name}-start`);
}

/**
 * 重新分析所选范围 with one range, under 历史与更新: the range is chosen, the mode's own button opens the two
 * ways to begin, and 先看计划 prepares the Task (the quick start waits for a Default Execution Rule).
 */
async function prepareRange(renderer, unitOrdinal, name) {
  await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const tab=card?.querySelector('[role="tab"][data-analysis-tab="history"]'); if(!(tab instanceof HTMLButtonElement))return false; tab.click(); return tab.getAttribute('aria-selected')==='true'; })()`, `${name}-history-tab`);
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"] #analysis-range-${unitOrdinal}'); if(!(radio instanceof HTMLInputElement)||radio.disabled)return false; if(!radio.checked)radio.click(); return radio.checked; })()`, `${name}-range`);
  await assertRenderer(renderer, `(() => { const chooser=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"] [data-analysis-action="choose-reanalyze-range"]'); if(!(chooser instanceof HTMLButtonElement)||chooser.disabled)return false; if(chooser.getAttribute('aria-expanded')!=='true')chooser.click(); return chooser.getAttribute('aria-expanded')==='true'; })()`, `${name}-choose`);
  await assertRenderer(renderer, `(() => { const block=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"]'); const choice=block?.querySelector('.analysis-update-choice'); const plan=choice?.querySelector('[data-analysis-action="reanalyze-range"]'); if(!(choice instanceof HTMLElement)||choice.hidden||!(plan instanceof HTMLButtonElement)||plan.disabled||plan.textContent!=='先看计划')return false; plan.click(); return true; })()`, `${name}-plan-first`);
}

/** Press the enabled button with exactly these words inside one region of the screen. */
async function clickIn(renderer, scope, label, name) {
  await assertRenderer(renderer, `(() => { const button=Array.from(document.querySelectorAll(${JSON.stringify(`${scope} button`)})).find((item)=>item.textContent===${JSON.stringify(label)}); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, name);
}

/** 待我处理 from the shell's header: the screen opens in the library state and paints the service's answer. */
async function openAttention(renderer, name) {
  await clickSelector(renderer, '#global-attention-entry', `${name}-entry`);
  await waitAttentionPainted(renderer, name);
}
async function waitAttentionPainted(renderer, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="global-attention"] .global-attention-host')?.dataset.attentionCount !== undefined && document.querySelectorAll('[data-screen="global-attention"] section.global-attention-group').length === 4`, `${name}-painted`);
}

/** The page as an editor reads it: each group's key, heading, count line, empty line, and each item's words. */
const READ_PAGE = `(() => {
  const host = document.querySelector('[data-screen="global-attention"] .global-attention-host');
  return {
    count: host?.dataset.attentionCount ?? null,
    running: host?.dataset.attentionRunning ?? null,
    groups: Array.from(host?.querySelectorAll(':scope > section.global-attention-group') ?? []).map((group) => ({
      key: group.dataset.attentionGroup,
      counted: group.dataset.attentionCounted,
      total: group.dataset.attentionTotal,
      heading: group.querySelector('.global-attention-group-label')?.textContent ?? null,
      countLine: group.querySelector('.global-attention-group-count')?.textContent ?? '',
      empty: group.querySelector('.global-attention-empty')?.textContent ?? null,
      items: Array.from(group.querySelectorAll('ol.global-attention-items > li.global-attention-item')).map((item) => ({
        itemId: item.dataset.attentionItem,
        state: item.dataset.attentionState,
        blocked: item.dataset.attentionBlocked,
        target: item.dataset.attentionTarget,
        bookId: item.dataset.bookId ?? null,
        book: item.querySelector('.global-attention-book')?.textContent ?? null,
        object: item.querySelector('button.global-attention-open')?.textContent ?? null,
        openName: item.querySelector('button.global-attention-open')?.getAttribute('aria-label') ?? null,
        pill: item.querySelector('.global-attention-pill')?.textContent ?? null,
        shape: item.querySelector('.global-attention-pill')?.dataset.pillShape ?? null,
        reason: item.querySelector('.global-attention-reason')?.textContent ?? null,
        next: item.querySelector('.global-attention-next')?.textContent ?? null,
        time: item.querySelector('.global-attention-time')?.textContent ?? null,
        technical: item.querySelector('details.technical-details')?.open ?? null,
      })),
    })),
  };
})()`;

/** The service's own answer, reduced to what the page is checked against. */
const READ_SERVICE = `window.ai7.inspectGlobalAttention().then((projection) => ({
  count: projection.actionableCount,
  running: projection.running,
  groups: projection.groups.map((group) => ({ key: group.key, total: group.total, items: group.items.map((item) => ({ itemId: item.itemId, state: item.state, nextStep: item.nextStep, target: item.target, bookId: item.book.bookId, title: item.book.title })) })),
}))`;

/** The service's answer once no Run is in flight — a completed Run's last step may still hold the slot. */
async function readSettledAttention(renderer) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const answer = await renderer.evaluate(READ_SERVICE);
    if (answer?.running === false || Date.now() > deadline) return answer;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

/** Open one item by its own control; the caller waits for the record it names. */
async function openItem(renderer, itemId, name) {
  const selector = `[data-screen="global-attention"] button.global-attention-open[data-attention-open=${JSON.stringify(itemId)}]`;
  await waitFor(renderer, `document.querySelector(${JSON.stringify(selector)})?.disabled===false`, `${name}-listed`, 30_000);
  await clickSelector(renderer, selector, `${name}-open`);
}

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
      throw new Error('J-09/browser-close-unconfirmed');
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
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-09/browser-cleanup-failed');
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        credentialCleanupFailure ??= error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        const closedForRetry = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-09/browser-cleanup-failed');
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
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-09/browser-cleanup-failed');
        const closedForFallback = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-09/browser-cleanup-failed');
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
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-09/browser-cleanup-failed');
    const browserClosed = await closeOwnedBrowserForCleanup();
    if (!browserClosed) throw cleanupFailure ?? new Error('J-09/browser-cleanup-failed');
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    try { await ownedLoopback?.close(); } catch (error) { cleanupFailure ??= error; }
    loopback = undefined;
    if (credentialMutationReached && !credentialRemoved) {
      throw credentialCleanupFailure ?? new Error('J-09/credential-cleanup-failed');
    }
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        try { await assertSecretsAbsentFromDataRoot(dataRoot, [syntheticSecret]); } catch (error) { cleanupFailure ??= error; }
      }
      try {
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j09-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j09-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j09-e2e-'), 'temp-root');
    dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    // Each launch names the picker's file and, for the second, the J-04 model adapter this Journey may bind.
    let launchControls = { picker: true, adapter: false };
    const launchArgs = ({ forCleanup }) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      if (!forCleanup && launchControls.picker) args.push('--j09-picker-path', SAMPLE1_PATH);
      if (!forCleanup && launchControls.adapter) args.push('--j04-model-adapter', FIXTURE_IDENTITY);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      return args;
    };
    launchForCleanup = async ({ forCleanup = false } = {}) => {
      if (!forCleanup) cancellation.throwIfRequested();
      const acquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args: launchArgs({ forCleanup }), env: productEnvironment(executable), timeout: 60_000 });
      browserAcquisition = acquisition;
      const acquiredBrowser = await acquisition;
      attachProductOutput('J-09', acquiredBrowser, forCleanup ? 'cleanup' : 'launch');
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

    // ---- the first launch: no executable route ---------------------------------------------------------
    at('renderer-api-boundary');
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'product-ready');
    // One read member of its own, named like nothing that executes, sends, grants or exports.
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && typeof window.ai7.inspectGlobalAttention === 'function' && !Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key)) && !Object.keys(window.ai7).some((key)=>/attention/i.test(key) && key !== 'inspectGlobalAttention')`, 'renderer-api-boundary');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'renderer-network-denial');
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }

    at('entry-in-the-header');
    // 待我处理 sits in the shell's header of every window, with no number while nothing needs the editor.
    await waitFor(renderer, `(() => { const entry=document.querySelector('header.app-header nav.app-destinations #global-attention-entry'); const badge=entry?.querySelector('.global-attention-badge'); return entry instanceof HTMLButtonElement && !entry.disabled && entry.querySelector('.global-attention-entry-label')?.textContent==='待我处理' && entry.dataset.attentionCount==='0' && badge instanceof HTMLElement && badge.hidden && entry.getAttribute('aria-label')==='待我处理'; })()`, 'entry-without-a-number');

    at('first-book-import');
    const bookA = await importSample1(renderer, FIRST.title, false, 'first-import');

    at('first-book-prerequisites');
    // The analysis's prerequisites through the product's own setup: the editorial workspace profile at
    // Revision 2 for this Book, and one Main Editorial Role connection whose synthetic credential is saved and
    // removed again, so the route's credential is `missing` and only its reference is recorded.
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
    await fill(renderer, '#main-editorial-connection-name', 'J-09 主编辑连接', 'model-name');
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

    at('first-book-blocked-run');
    // Nothing can execute a Run in this launch: 开始任务 records it, and it is blocked before dispatch.
    await openAnalysisOf(renderer, bookA, 'first-analysis');
    await startFirstBaseline(renderer, 'no-route', 'first-baseline');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='authorized-blocked'`, 'first-run-blocked', 60_000);
    const blockedA = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(blockedA?.bookId === bookA && blockedA.run?.state === 'blocked-before-dispatch' && UUID_PATTERN.test(blockedA.taskIntent?.taskIntentId ?? ''), 'first-run-blocked-record', { state: blockedA?.state, run: blockedA?.run?.state });

    at('count-after-blocked');
    // The header's number follows the screens: going on to 工作概览, one item needs the editor, said in words
    // and in a badge with its own outline.
    await clickIn(renderer, '[data-screen="book-analysis"] .workbench-actions', '工作概览', 'count-overview');
    await waitFor(renderer, `document.querySelector('#global-attention-entry')?.dataset.attentionCount==='1' && document.querySelector('#global-attention-entry .global-attention-badge')?.textContent==='1' && !document.querySelector('#global-attention-entry .global-attention-badge').hidden && document.querySelector('#global-attention-entry')?.getAttribute('aria-label')==='待我处理，1 项需要你处理'`, 'count-one', 30_000);
    await closeOwnedBrowser();
    cancellation.throwIfRequested();

    // ---- the second launch: the J-04 model adapter executes Runs --------------------------------------------
    at('second-book-launch');
    launchControls = { picker: true, adapter: true };
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'second-ready');
    await waitFor(renderer, `document.querySelector('#global-attention-entry')?.dataset.attentionCount==='1'`, 'second-count-one', 30_000);

    at('second-book-import');
    const bookB = await importSample1(renderer, SECOND.title, true, 'second-import');
    requireJourney(bookB !== bookA, 'two-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'second-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'second-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'second-artifact-enabled');
    await click(renderer, '返回图书列表', 'second-return-library');

    at('second-book-completed-run');
    await openAnalysisOf(renderer, bookB, 'second-analysis');
    await startFirstBaseline(renderer, 'ready', 'second-baseline');
    await waitFor(renderer, `['settled','failed','interrupted'].includes(document.querySelector('.baseline-analysis-card')?.dataset.analysisState)`, 'second-run-settled', 180_000);
    const settledB = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(settledB?.bookId === bookB && settledB.state === 'settled' && ['completed', 'completed-with-gaps'].includes(settledB.run?.state) && settledB.taskOutcome !== null, 'second-run-completed', { state: settledB?.state, run: settledB?.run?.state });

    at('second-book-plan-revision');
    // A range update prepared with one range and then another: the first plan version is superseded by a
    // pending Plan Revision that 重新确认计划 settles.
    await prepareRange(renderer, 3, 'range-first');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared' && document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId!==${JSON.stringify(settledB.taskIntent.taskIntentId)}`, 'range-first-prepared', 120_000);
    await prepareRange(renderer, 8, 'range-second');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.planRevisionPending==='true'`, 'range-revision-pending', 120_000);
    const pendingB = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(pendingB?.planRevision?.state === 'pending' && pendingB.actions?.canReconfirmPlan === true && UUID_PATTERN.test(pendingB.taskIntent?.taskIntentId ?? ''), 'range-revision-record', { planRevision: pendingB?.planRevision?.state, actions: pendingB?.actions });

    at('attention-groups');
    await openAttention(renderer, 'attention');
    // The service's answer once nothing is in flight, and the page come to say exactly it: the screen paints
    // the reader's last answer at once and the fresh one as soon as it arrives.
    const service = await readSettledAttention(renderer);
    const serviceIds = JSON.stringify(service?.groups?.map((group) => group.items.map((item) => item.itemId)) ?? null);
    await waitFor(renderer, `(() => { const page=${READ_PAGE}; return page.count===${JSON.stringify(String(service?.count))} && JSON.stringify(page.groups.map((group)=>group.items.map((item)=>item.itemId)))===${JSON.stringify(serviceIds)}; })()`, 'attention-page-current', 30_000);
    const page = await renderer.evaluate(READ_PAGE);
    const pageGroups = page?.groups ?? [];
    const exceptions = pageGroups[0]?.items ?? [];
    const decisions = pageGroups[1]?.items ?? [];
    const recent = pageGroups[3]?.items ?? [];
    // The four groups in their fixed order, each keeping its heading; 运行中与已暂停 says it is empty; and every
    // item's identities wait one deliberate step below its words, in a closed 查看技术详情.
    requireJourney(JSON.stringify(pageGroups.map((group) => group.key)) === JSON.stringify(GROUP_ORDER) &&
      JSON.stringify(pageGroups.map((group) => group.heading)) === JSON.stringify(GROUP_LABELS) &&
      JSON.stringify(pageGroups.map((group) => group.counted)) === '["true","true","false","false"]' &&
      pageGroups[2].items.length === 0 && pageGroups[2].empty === ACTIVE_EMPTY && pageGroups[2].countLine === '' &&
      pageGroups.every((group) => group.items.every((entry) => entry.technical === false)),
    'four-groups-in-order', pageGroups.map((group) => ({ key: group.key, heading: group.heading, items: group.items.length, empty: group.empty })));
    // 异常与结果待确认: the first Book's Run, blocked before dispatch — its Book, object, exact state, reason and step.
    const blockedItem = exceptions[0];
    requireJourney(exceptions.length === 1 && blockedItem?.itemId === `analysis:${blockedA.taskIntent.taskIntentId}` && blockedItem.state === 'analysis-blocked' &&
      blockedItem.blocked === 'true' && blockedItem.target === 'analysis' && blockedItem.bookId === bookA && blockedItem.book === `《${FIRST.title}》` &&
      blockedItem.object === '基线分析 · 首次基线分析' && blockedItem.openName === `《${FIRST.title}》 · 基线分析 · 首次基线分析` &&
      blockedItem.pill === '派发前已阻止' && blockedItem.shape === 'diamond' && blockedItem.reason === REASON_BLOCKED &&
      blockedItem.next === '安全的下一步：查看运行' && (blockedItem.time ?? '').startsWith('记录于 ') && blockedItem.technical === false,
    'blocked-run-item', blockedItem);
    // 等待你的决定: the second Book's Plan Revision, named as itself, with 重新确认计划 as its step.
    const decisionItem = decisions[0];
    requireJourney(decisions.length === 1 && decisionItem?.itemId === `analysis:${pendingB.taskIntent.taskIntentId}` && decisionItem.state === 'analysis-plan-revision' &&
      decisionItem.target === 'analysis-plan' && decisionItem.bookId === bookB && decisionItem.book === `《${SECOND.title}》` &&
      decisionItem.object === '基线分析 · 重新分析所选范围' && decisionItem.pill === '计划修订' && decisionItem.reason === REASON_PLAN_REVISION &&
      decisionItem.next === '安全的下一步：重新确认计划',
    'plan-revision-item', decisionItem);
    // 最近完成: the second Book's completed analysis, newest first, its time a completion.
    const completionItem = recent[0];
    requireJourney(recent.length === 1 && completionItem?.itemId === `analysis-outcome:${settledB.taskOutcome.outcomeId}` &&
      ['analysis-completed', 'analysis-completed-with-gaps'].includes(completionItem.state) && completionItem.bookId === bookB &&
      completionItem.target === 'analysis' && completionItem.reason?.startsWith('已形成第 1 份基线分析') === true &&
      completionItem.next === '安全的下一步：查看运行' && (completionItem.time ?? '').startsWith('完成于 '),
    'completion-item', completionItem);
    // The page is the service's answer, item for item.
    requireJourney(service?.count === 2 && service.running === false &&
      JSON.stringify(service.groups.map((group) => group.items.map((item) => item.itemId))) === JSON.stringify(pageGroups.map((group) => group.items.map((item) => item.itemId))) &&
      JSON.stringify(service.groups.map((group) => group.items.map((item) => item.state))) === JSON.stringify(pageGroups.map((group) => group.items.map((item) => item.state))) &&
      service.groups[0].items[0].nextStep === 'view-run' && service.groups[1].items[0].nextStep === 'reconfirm-plan' &&
      JSON.stringify(service.groups[1].items[0].target) === JSON.stringify({ kind: 'analysis-plan', bookId: bookB, taskIntentId: pendingB.taskIntent.taskIntentId }),
    'page-is-the-service-answer', service);
    // Nothing here grants anything: no 待审批 or 批准, no control carries 授权, and no item claims a pause.
    await assertRenderer(renderer, `(() => { const screen=document.querySelector('[data-screen="global-attention"]'); const text=screen?.textContent??''; return !/待审批|批准/u.test(text) && !Array.from(screen.querySelectorAll('button')).some((button)=>/授权/u.test(button.textContent??'')) && !Array.from(screen.querySelectorAll('.global-attention-pill')).some((pill)=>/已暂停/u.test(pill.textContent??'')); })()`, 'no-authority-words');

    at('attention-count');
    // The number is the first two groups' and no other: one blocked Run and one Plan Revision.
    requireJourney(page.count === '2' && pageGroups[0].countLine === '1 项需要你处理' && pageGroups[1].countLine === '1 项需要你处理' &&
      pageGroups[3].countLine === '1 项' && Number(pageGroups[0].total) + Number(pageGroups[1].total) === Number(page.count), 'count-is-the-first-two-groups', page);
    await waitFor(renderer, `document.querySelector('#global-attention-entry')?.dataset.attentionCount==='2' && document.querySelector('#global-attention-entry .global-attention-badge')?.textContent==='2' && document.querySelector('#global-attention-entry')?.getAttribute('aria-label')==='待我处理，2 项需要你处理'`, 'entry-count-two', 30_000);

    at('attention-writes-nothing');
    // Read again and again — the window regaining focus, the entry pressed again, the service asked directly —
    // and not one stored byte moves.
    const before = storeDigest(dataRoot);
    await renderer.evaluate(`(() => { window.dispatchEvent(new Event('focus')); return true; })()`);
    await openAttention(renderer, 'attention-again');
    await renderer.evaluate(`Promise.all([window.ai7.inspectGlobalAttention(), window.ai7.inspectGlobalAttention(), window.ai7.inspectGlobalAttention()]).then(() => true)`);
    await waitAttentionPainted(renderer, 'attention-again-read');
    const after = storeDigest(dataRoot);
    requireJourney(JSON.stringify(after) === JSON.stringify(before), 'store-digest-unchanged',
      Object.keys(before).filter((table) => before[table] !== after[table]));
    const again = await renderer.evaluate(READ_SERVICE);
    requireJourney(JSON.stringify(again) === JSON.stringify(service), 'reading-again-answers-the-same');

    at('open-blocked-run');
    // An item opens its own record in the window that asked: the first Book's 分析 with the blocked Run.
    await openItem(renderer, blockedItem.itemId, 'blocked');
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(bookA)}] .baseline-analysis-card')?.dataset.analysisState==='authorized-blocked'`, 'blocked-record', 30_000);
    const routeA = await renderer.evaluate(`window.ai7.getBookWorkbenchRoute()`);
    requireJourney(routeA?.bookId === bookA, 'blocked-record-route', routeA);

    at('open-plan-revision');
    // The Plan Revision opens ②A of its Book with the plan in the Task Drawer, where 重新确认计划 is: the view
    // decides nothing itself.
    await openAttention(renderer, 'plan-revision');
    await openItem(renderer, decisionItem.itemId, 'plan-revision');
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(bookB)}]') && document.querySelector('#task-drawer')?.dataset.taskDrawer==='open' && document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(pendingB.taskIntent.taskIntentId)} && document.querySelector('#task-drawer')?.dataset.taskPlanState==='changed' && document.querySelector('#task-drawer [data-task-drawer-control="reconfirm-plan"]')?.textContent==='重新确认计划'`, 'plan-revision-record', 30_000);
    const stillPending = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(stillPending?.planRevision?.state === 'pending' && stillPending.taskIntent?.taskIntentId === pendingB.taskIntent.taskIntentId, 'plan-revision-untouched');

    at('open-completion');
    await openAttention(renderer, 'completion');
    await openItem(renderer, completionItem.itemId, 'completion');
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(bookB)}] .baseline-analysis-card')`, 'completion-record', 30_000);

    at('j14-attention-keyboard');
    // Without a pointer: Enter on the header's 待我处理 opens the screen with its heading focused, Tab reaches the
    // first item's way in with visible focus, and Enter opens that item's record.
    await assertRenderer(renderer, `(() => { const entry=document.querySelector('#global-attention-entry'); if(!(entry instanceof HTMLButtonElement)||entry.disabled)return false; entry.focus(); return document.activeElement===entry; })()`, 'keyboard-entry-focused');
    await pressEnter(renderer);
    await waitAttentionPainted(renderer, 'keyboard');
    await waitFor(renderer, `document.activeElement === document.querySelector('[data-screen="global-attention"] h2.global-attention-title')`, 'keyboard-heading-focused', 10_000);
    await pressTab(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.attentionOpen === ${JSON.stringify(blockedItem.itemId)} && document.activeElement.matches(':focus-visible')`, 'keyboard-first-item-reached', 10_000);
    await pressEnter(renderer);
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(bookA)}]')`, 'keyboard-item-opened', 30_000);

    at('j14-attention-zoom-200-reflow');
    // At 200% the header, the four groups and every item reflow into the width: nothing scrolls sideways.
    await openAttention(renderer, 'zoom');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[document.querySelector('header.app-header'), ...document.querySelectorAll('[data-screen="global-attention"] section.global-attention-group, [data-screen="global-attention"] li.global-attention-item')]; return parts.length === 8 && parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2 && document.querySelector('#global-attention-entry').getBoundingClientRect().width > 0; })()`, 'reflow-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-attention-forced-colors');
    // Without colour a state keeps its pill's shape, blocked work its heavier left rule, and the number its outline.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const style = (node, pseudo) => getComputedStyle(node, pseudo);
      const blocked = document.querySelector('[data-screen="global-attention"] li.global-attention-item[data-attention-blocked="true"]');
      const open = document.querySelector('[data-screen="global-attention"] li.global-attention-item[data-attention-blocked="false"]');
      const pill = blocked?.querySelector('.global-attention-pill');
      const badge = document.querySelector('#global-attention-entry .global-attention-badge');
      const group = document.querySelector('[data-screen="global-attention"] section.global-attention-group');
      return blocked instanceof HTMLElement && open instanceof HTMLElement && parseFloat(style(blocked).borderLeftWidth) > parseFloat(style(open).borderLeftWidth) &&
        style(blocked).borderLeftStyle === 'solid' && pill instanceof HTMLElement && pill.dataset.pillShape === 'diamond' && style(pill, '::before').content !== 'none' &&
        badge instanceof HTMLElement && !badge.hidden && style(badge).borderTopStyle === 'solid' && parseFloat(style(badge).borderTopWidth) >= 2 &&
        group instanceof HTMLElement && style(group).boxShadow === 'none';
    })()`, 'shapes-and-rules-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });

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
  reportJourneyFailure('J-09', location, error);
  if (runnerLifecycleIncomplete) process.stderr.write('', () => process.exit(1));
});
