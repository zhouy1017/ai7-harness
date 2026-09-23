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

// J-10 (Issue #422, plan slice S76a): 取消任务 on a Run under way — the first of J-10's operations told apart by
// their consequence (V2-UX-AUTH-010, AUTH-011, CTRL-004 to CTRL-009). One Book is made from the one admitted
// input, exact `sample1`, through the product's own UI, and its first baseline analysis runs on the J-04 model
// adapter. J-10's unit hold keeps the third reading range in flight once two have settled, so the Journey can
// watch a Run under way: the Task Drawer's activity card names the phase, the range in flight, the time, the
// attempt, the last update and the milestones, and its bar offers 暂停 and 改计划重做 with why they wait, and
// 取消任务. 取消任务 opens one inline Cancellation Impact Summary and records nothing; 继续运行 closes it; confirming
// records 正在取消 at once, which holds while the range in flight finishes — a sent turn is never cut off — and
// 已取消 follows only once that range is done and the terminal state is recorded: three ranges kept in a partial
// Result Set Revision, five named not attempted, and nothing sent after them. 续行, 重试, 回退运行方向, 重做 and 重放
// are J-10's later operations, not this slice's.
//
// The runner writes J-10's unit-hold file, and reads the service's projections through `window.ai7` only to
// cross-check what the drawer and ②A show — never as the oracle of what they say.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
/** The J-04 model adapter's base fixture: every unit, the reduction and the sample of exact `sample1` answered. */
const FIXTURE_IDENTITY = 'sample1-baseline-happy';
const BOOK = Object.freeze({ title: '取消任务旅程' });
/** Exact `sample1`'s reading ranges, and how many J-10 lets settle before it cancels with the next in flight. */
const SAMPLE1_UNITS = 8;
const SETTLED_BEFORE_CANCEL = 2;
// The drawer's own words (`src/renderer/task-drawer-labels.ts` and `src/service/task-plan.ts`), pinned there by
// their unit suites.
const PAUSE_REASON = '暂停与续行随后提供';
const REDO_REASON = '改计划重做随计划编辑提供';
const CANCELLING_NOTE = '已记下你的取消；正在进行的这一步完成后停止，此后不会再发送任何内容';
const IMPACT = Object.freeze([
  `正在读的第 3 个阅读范围读完后停止；其余 ${SAMPLE1_UNITS - 3} 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。`,
  '已读完的 2 个阅读范围和正在读的这一个的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
  '这项分析不改稿，没有需要撤回的受控动作。',
  '正在等待的那一轮模型回答不会被中途切断，它的结果照常计入。',
]);
const REFLECTION_CANCELLED = '运行已按你的要求取消，运行反思未发起。';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const CREDENTIAL_CLEANUP_TIMEOUT_MS = 15_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;
const BROWSER_CLOSE_TIMEOUT = new Error('J-10/browser-close-timeout');
const CREDENTIAL_CLEANUP_TIMEOUT = new Error('J-10/credential-cleanup-timeout');

let location = 'entry';
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-10', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-10/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-10', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-10' };
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
    throw new Error('J-10/credential-cleanup-metadata');
  }
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(databasePath)) === databasePath,
    'credential-cleanup-metadata-file');
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    throw new Error('J-10/credential-cleanup-metadata');
  }
  try {
    database.exec('PRAGMA query_only = ON;');
    // The terminal version the service stamps (`RUN_CONTINUATION_SCHEMA_VERSION`, as J-04 reads it): 暂停 and 续行's
    // revision, and after it this pin moves with whatever revision a later slice takes.
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 33, 'credential-cleanup-metadata-version');
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
    if (error instanceof Error && error.message.startsWith('J-10/')) throw error;
    throw new Error('J-10/credential-cleanup-metadata');
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
    server.once('error', () => rejectListen(new Error('J-10/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' && Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-10/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j10-network-probe`,
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
    if (response.error) completion.reject(new Error('J-10/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-10/renderer-cdp-timeout')); }, 60_000);
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
  throw new Error(`J-10/${name}`);
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

// ---- the product's own ways to the records J-10 needs ----------------------------------------------------

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
 * The Task Drawer as the editor sees it: its state, pill, bar and the actions it offers — each with the reason in
 * words beside it when it is not offered — the activity card's rows, and the Cancellation Impact Summary when open.
 */
const READ_DRAWER = `(() => {
  const drawer = document.querySelector('#task-drawer');
  if (!(drawer instanceof HTMLElement) || drawer.dataset.taskDrawer !== 'open') return null;
  const text = (node) => node?.textContent ?? null;
  const activity = drawer.querySelector('.task-plan-activity');
  const impact = drawer.querySelector('#task-drawer-cancel-impact');
  return {
    kind: drawer.dataset.taskPlanKind ?? null,
    ref: drawer.dataset.taskPlanRef ?? null,
    state: drawer.dataset.taskPlanState ?? null,
    start: drawer.dataset.taskPlanStart ?? null,
    pill: text(drawer.querySelector('.task-drawer-pill')),
    status: text(drawer.querySelector('.task-bar-status')),
    note: text(drawer.querySelector('.task-bar-note')),
    actions: Array.from(drawer.querySelectorAll('.task-bar-actions button[data-task-drawer-control]')).map((button) => {
      const described = button.getAttribute('aria-describedby');
      return [button.dataset.taskDrawerControl, button.textContent, button.disabled ? 'disabled' : 'enabled', described === null ? null : text(document.getElementById(described))];
    }),
    activity: activity === null ? null : {
      state: activity.dataset.taskPlanActivity ?? null,
      title: text(activity.querySelector('.task-plan-activity-title')),
      rows: Object.fromEntries(Array.from(activity.querySelectorAll('dd[data-task-plan-activity-row]')).map((cell) => [cell.dataset.taskPlanActivityRow, cell.textContent])),
    },
    impact: impact === null ? null : {
      heading: text(impact.querySelector('h4')),
      lines: Array.from(impact.querySelectorAll('li')).map((line) => line.textContent),
      confirm: text(impact.querySelector('[data-task-drawer-control="confirm-cancel-run"]')),
      keep: text(impact.querySelector('[data-task-drawer-control="keep-running"]')),
    },
  };
})()`;

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
      throw new Error('J-10/browser-close-unconfirmed');
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
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-10/browser-cleanup-failed');
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        credentialCleanupFailure ??= error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        const closedForRetry = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-10/browser-cleanup-failed');
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
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-10/browser-cleanup-failed');
        const closedForFallback = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-10/browser-cleanup-failed');
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
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-10/browser-cleanup-failed');
    const browserClosed = await closeOwnedBrowserForCleanup();
    if (!browserClosed) throw cleanupFailure ?? new Error('J-10/browser-cleanup-failed');
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    try { await ownedLoopback?.close(); } catch (error) { cleanupFailure ??= error; }
    loopback = undefined;
    if (credentialMutationReached && !credentialRemoved) {
      throw credentialCleanupFailure ?? new Error('J-10/credential-cleanup-failed');
    }
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        try { await assertSecretsAbsentFromDataRoot(dataRoot, [syntheticSecret]); } catch (error) { cleanupFailure ??= error; }
      }
      try {
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j10-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j10-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j10-e2e-'), 'temp-root');
    dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    // The one launch names the picker's file, the J-04 model adapter and J-10's unit hold; a cleanup launch none.
    const holdPath = resolve(runRoot, 'j10-unit-hold.txt');
    const launchArgs = ({ forCleanup }) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      if (!forCleanup) args.push('--j10-picker-path', SAMPLE1_PATH, '--j04-model-adapter', FIXTURE_IDENTITY, '--j10-unit-hold-path', holdPath);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      return args;
    };
    launchForCleanup = async ({ forCleanup = false } = {}) => {
      if (!forCleanup) cancellation.throwIfRequested();
      const acquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args: launchArgs({ forCleanup }), env: productEnvironment(executable), timeout: 60_000 });
      browserAcquisition = acquisition;
      const acquiredBrowser = await acquisition;
      attachProductOutput('J-10', acquiredBrowser, forCleanup ? 'cleanup' : 'launch');
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

    // ---- one launch, bound to the J-04 model adapter and J-10's unit hold -----------------------------------
    at('renderer-api-boundary');
    // Two reading ranges may settle; the third waits, in flight, until the Journey writes the next number.
    await writeFile(holdPath, String(SETTLED_BEFORE_CANCEL), 'utf8');
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'product-ready');
    // One member of its own for 取消任务, and nothing that pauses, resumes, redoes, retries, replays or rewinds a Run yet
    // (the manuscript's own `redoManuscript` is the editor's undo and redo, not a Run's).
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && typeof window.ai7.cancelBaselineAnalysisRun === 'function' && !Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key)) && !Object.keys(window.ai7).some((key)=>/(pause|resume|redo|retry|replay|rewind)[A-Za-z]*(Run|Analysis|Task)$/i.test(key))`, 'renderer-api-boundary');
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
    await fill(renderer, '#main-editorial-connection-name', 'J-10 主编辑连接', 'model-name');
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

    at('run-under-way');
    // 开始任务 from the drawer: the drawer follows the Run, two ranges settle, and the third stays in flight.
    await openAnalysisOf(renderer, bookId, 'analysis');
    await startFirstBaseline(renderer, 'ready', 'baseline');
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); const activity=drawer?.querySelector('.task-plan-activity'); return drawer?.dataset.taskDrawer==='open' && drawer.dataset.taskPlanState==='running' && activity?.dataset.taskPlanActivity==='running' && activity.dataset.taskPlanActivityProgress===${JSON.stringify(`${SETTLED_BEFORE_CANCEL}/${SAMPLE1_UNITS}`)} && activity.dataset.taskPlanActivityUnit==='3'; })()`, 'third-range-in-flight', 180_000);
    const executing = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const taskIntentId = executing?.taskIntent?.taskIntentId ?? '';
    requireJourney(UUID_PATTERN.test(taskIntentId) && executing.bookId === bookId && executing.state === 'executing' && executing.run?.state === 'executing' &&
      executing.run.progress?.unitsSettled === SETTLED_BEFORE_CANCEL && executing.run.progress.currentUnitOrdinal === 3 && executing.run.progress.unitsTotal === SAMPLE1_UNITS,
    'run-executing-record', { state: executing?.state, run: executing?.run?.state, progress: executing?.run?.progress });
    const running = await renderer.evaluate(READ_DRAWER);
    requireJourney(running?.ref === taskIntentId && running.kind === 'baseline-analysis' && running.start === 'started' && running.pill === '运行中' && running.status === '运行中', 'drawer-follows-the-run', running);

    at('activity-card');
    // AUTH-011: the phase, the range in flight, the time on it and since the Run began, the attempt, the last
    // update and the milestones, each a fact the Run holds; nothing is estimated.
    const rows = running.activity?.rows ?? {};
    requireJourney(running.activity?.title === '运行动态' && rows['阶段'] === '正在逐个阅读范围分析' && rows['当前'] === `第 3 个阅读范围（共 ${SAMPLE1_UNITS} 个）` &&
      /^本步 \d\d:\d\d · 运行 \d\d:\d\d$/u.test(rows['用时'] ?? '') && rows['尝试'] === '已派发' && typeof rows['上次更新'] === 'string' && rows['上次更新'].length > 0 &&
      rows['进展'] === `已读完 ${SETTLED_BEFORE_CANCEL} / ${SAMPLE1_UNITS} 个阅读范围 · 已完成模型回合 ${SETTLED_BEFORE_CANCEL} 次`,
    'activity-card-rows', running.activity);
    // LIVE-003's own words once the held step has run longer than this Run's own steps did.
    await waitFor(renderer, `document.querySelector('#task-drawer .task-plan-activity')?.dataset.runLiveness==='stale' && document.querySelector('#task-drawer .task-plan-activity .attention-note')?.textContent==='本步骤用时已超过通常水平'`, 'activity-step-stale', 30_000);

    at('run-controls');
    // AUTH-010: 暂停 and 改计划重做 say why they wait, beside 取消任务 and the way to the Run's surface.
    requireJourney(JSON.stringify(running.actions) === JSON.stringify([
      ['pause', '暂停', 'disabled', PAUSE_REASON],
      ['cancel-run', '取消任务', 'enabled', null],
      ['redo', '改计划重做', 'disabled', REDO_REASON],
      ['run-link', '查看运行', 'enabled', null],
    ]) && running.impact === null, 'run-controls', running.actions);

    at('cancel-impact-summary');
    // CTRL-004: 取消任务 opens one inline Cancellation Impact Summary, focus on it, and records nothing.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="cancel-run"]', 'open-impact');
    await waitFor(renderer, `document.activeElement !== null && document.activeElement === document.querySelector('#task-drawer-cancel-impact h4')`, 'impact-focused', 10_000);
    const summary = await renderer.evaluate(READ_DRAWER);
    const planned = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(taskIntentId)} })`);
    requireJourney(summary?.impact?.heading === '取消影响摘要' && JSON.stringify(summary.impact.lines) === JSON.stringify(IMPACT) &&
      JSON.stringify(planned?.runControl?.cancel?.impact) === JSON.stringify(IMPACT) && summary.impact.confirm === '确认取消任务' && summary.impact.keep === '继续运行',
    'impact-summary', summary?.impact);
    const unrecorded = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(unrecorded?.run?.state === 'executing' && unrecorded.run.transitions.length === executing.run.transitions.length, 'summary-records-nothing');

    at('cancel-keep-running');
    // 继续运行 closes the summary and returns focus to 取消任务; the Run never noticed.
    await clickSelector(renderer, '#task-drawer-cancel-impact [data-task-drawer-control="keep-running"]', 'keep-running');
    await waitFor(renderer, `document.querySelector('#task-drawer-cancel-impact') === null && document.activeElement === document.querySelector('#task-drawer [data-task-drawer-control="cancel-run"]')`, 'summary-closed', 10_000);
    const kept = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(kept?.run?.state === 'executing' && kept.run.transitions.length === executing.run.transitions.length, 'keep-running-records-nothing');

    at('j14-cancel-keyboard');
    // Without a pointer: Enter on 取消任务 opens the summary with its heading focused, Tab reaches 确认取消任务 with
    // visible focus, and Enter confirms it.
    await pressEnter(renderer);
    await waitFor(renderer, `document.activeElement !== null && document.activeElement === document.querySelector('#task-drawer-cancel-impact h4')`, 'keyboard-impact-focused', 10_000);
    await pressTab(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.taskDrawerControl === 'confirm-cancel-run' && document.activeElement.matches(':focus-visible')`, 'keyboard-confirm-reached', 10_000);

    at('cancel-confirmed');
    // CTRL-005: confirming records 正在取消 at once; nothing more is offered while the range in flight finishes.
    await pressEnter(renderer);
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskPlanState==='cancelling' && drawer.querySelector('.task-drawer-pill')?.textContent==='正在取消' && drawer.querySelector('.task-bar-status')?.textContent==='正在取消' && drawer.querySelector('.task-plan-activity')?.dataset.taskPlanActivity==='cancelling'; })()`, 'cancelling-shown', 30_000);
    const cancellingDrawer = await renderer.evaluate(READ_DRAWER);
    requireJourney(cancellingDrawer?.note === CANCELLING_NOTE && JSON.stringify(cancellingDrawer.actions) === JSON.stringify([['run-link', '查看运行', 'enabled', null]]) &&
      cancellingDrawer.impact === null, 'cancelling-bar', cancellingDrawer);
    const cancelling = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(cancelling?.state === 'cancelling' && cancelling.stateLabel === '正在取消' && cancelling.run?.state === 'cancelling' &&
      JSON.stringify(cancelling.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'cancelling']) &&
      cancelling.run.progress?.unitsSettled === SETTLED_BEFORE_CANCEL && cancelling.run.progress.currentUnitOrdinal === 3,
    'cancelling-record', { state: cancelling?.state, run: cancelling?.run?.state, progress: cancelling?.run?.progress });
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='正在取消'`, 'cancelling-card-label', 30_000);
    // 待我处理 names it as well, wherever the editor looks, until it has stopped.
    const attention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(attention?.groups?.find((group) => group.key === 'active')?.items?.some((item) => item.book?.bookId === bookId && item.state === 'analysis-cancelling') === true,
      'cancelling-in-attention', attention?.groups?.map((group) => ({ key: group.key, states: group.items.map((item) => item.state) })));

    at('cancelling-holds');
    // 已取消 is never claimed early: while the range in flight has not finished, the Run stays 正在取消.
    await new Promise((settle) => setTimeout(settle, 2_000));
    const held = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(held?.run?.state === 'cancelling' && held.run.attempt?.spans?.length === SETTLED_BEFORE_CANCEL &&
      (await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanState`)) === 'cancelling', 'cancelling-holds', { run: held?.run?.state, spans: held?.run?.attempt?.spans?.length });

    at('j14-cancelling-forced-colors');
    // Without colour 正在取消 keeps its pill's shape and the activity card its heavier edge.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const pill = document.querySelector('#task-drawer .task-drawer-pill');
      const card = document.querySelector('#task-drawer .task-plan-activity[data-task-plan-activity="cancelling"]');
      return pill instanceof HTMLElement && pill.dataset.pillShape === 'half' && getComputedStyle(pill, '::before').content !== 'none' &&
        card instanceof HTMLElement && parseFloat(getComputedStyle(card).borderTopWidth) >= 2 && getComputedStyle(card).borderTopStyle === 'solid';
    })()`, 'cancelling-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });

    at('cancel-settled');
    // The range in flight finishes; the Run stops at the boundary after it and reads 已取消.
    await writeFile(holdPath, String(SETTLED_BEFORE_CANCEL + 1), 'utf8');
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskPlanState==='cancelled-after-start' && drawer.querySelector('.task-drawer-pill')?.textContent==='已取消' && drawer.querySelector('.task-bar-status')?.textContent==='已取消' && drawer.querySelector('.task-plan-activity')===null; })()`, 'cancelled-shown', 60_000);
    const cancelledDrawer = await renderer.evaluate(READ_DRAWER);
    requireJourney(JSON.stringify(cancelledDrawer?.actions) === JSON.stringify([['run-link', '查看运行', 'enabled', null]]) && cancelledDrawer.note === null, 'cancelled-bar', cancelledDrawer);
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='cancelled' && document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='已取消'`, 'cancelled-card-label', 30_000);

    at('partial-revision-kept');
    // CTRL-006: the three ranges it read are kept in a partial revision, the five it never reached named not
    // attempted, and its outcome and report say it was cancelled — never 已中断.
    const cancelled = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const revision = cancelled?.resultSetRevision;
    const report = cancelled?.taskOutcome?.report;
    requireJourney(cancelled?.state === 'cancelled' && cancelled.stateLabel === '已取消' && cancelled.run?.stateLabel === '已取消' &&
      JSON.stringify(cancelled.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'cancelling', 'cancelled']) &&
      cancelled.run.attempt?.spans?.length === SETTLED_BEFORE_CANCEL + 1 &&
      cancelled.taskOutcome?.classification === 'cancelled' && cancelled.taskOutcome.label === '任务结果：已取消' &&
      revision?.coverage?.unitsTotal === SAMPLE1_UNITS && revision.coverage.unitsClosed === SETTLED_BEFORE_CANCEL + 1 &&
      cancelled.taskOutcome.resultSetRevisionId === revision.revisionId &&
      JSON.stringify(revision.gaps.map((gap) => [gap.unitOrdinal, gap.code])) === JSON.stringify([4, 5, 6, 7, 8].map((ordinal) => [ordinal, 'not-attempted'])) &&
      report?.classification === 'cancelled' && report.ifRedone?.reason === REFLECTION_CANCELLED &&
      JSON.stringify(report.stages.map((stage) => [stage.stage, stage.state])) === JSON.stringify([['units', 'closed-with-gaps'], ['cross-unit-reduction', 'not-run'], ['assurance-sampling', 'not-run'], ['reduction', 'closed']]),
    'partial-revision', { state: cancelled?.state, run: cancelled?.run?.state, outcome: cancelled?.taskOutcome?.classification, closed: revision?.coverage?.unitsClosed, gaps: revision?.gaps?.length });

    at('nothing-sent-after');
    // Nothing more is recorded or sent once the Run has stopped.
    await new Promise((settle) => setTimeout(settle, 1_000));
    const after = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(after?.run?.state === 'cancelled' && after.run.attempt?.spans?.length === SETTLED_BEFORE_CANCEL + 1 &&
      JSON.stringify(after.run.transitions) === JSON.stringify(cancelled.run.transitions), 'nothing-sent-after');

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
  reportJourneyFailure('J-10', location, error);
  if (runnerLifecycleIncomplete) process.stderr.write('', () => process.exit(1));
});
