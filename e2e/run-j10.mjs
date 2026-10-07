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

// J-10 (Issue #422, plan slices S76a to S76d; Issue #51, S16a and S16b): the operations on a Run under way, told apart by
// their consequence (V2-UX-AUTH-010, AUTH-011, CTRL-001 to CTRL-009, CONT-013 to CONT-015, CLAR-001 to CLAR-007, MODEL-013
// to MODEL-018). Books are made from the one
// admitted input, exact `sample1`, through the product's own UI, and their analyses run on the J-04 model adapter.
// J-10's unit hold keeps a reading range in flight once the Journey's number of ranges have settled, so the Journey
// can watch and steer a Run under way.
//
// On the first Book: the Task Drawer's activity card names the phase, the range in flight, the time, the attempt,
// the last update and the milestones, and its bar offers 暂停, 取消任务, 改计划重做 with why it waits, and 查看运行.
// 暂停 is one click: 正在暂停 holds while the range in flight finishes, and 已暂停 follows with three ranges kept and
// the slot free. 续行 goes on in the same Run from the fourth range, and with the sixth in flight 取消任务 opens one
// inline Cancellation Impact Summary that records nothing; 继续运行 closes it; confirming — by keyboard alone — records
// 正在取消, which holds while that range finishes, and 已取消 follows with six ranges kept in a partial Result Set
// Revision, two named not attempted, and nothing sent after them. 改计划重做 then sits beside 查看运行: it prepares a
// new Task that carries those six ranges and reads the other two, and opens it in its editing; the editor leaves
// 核对与抽检 out, updates the plan and starts it, and it runs to its end.
//
// On the second Book: AI7 closes while a range is in flight, and on the next launch the Run reads
// 任务已中断 · 可续行 with what it had read kept and nothing dispatched; 续行 goes on in the same Run and attempt to
// its end.
//
// On the third Book, paused with two ranges kept: 改计划重做 opens one inline summary of what stops, what is kept and
// what the new Task does, which records nothing, and 先不重做 closes it; confirming it by keyboard alone cancels the
// Run into its partial revision, and the new Task, carrying those two ranges, opens in its editing without running.
//
// On the fourth Book, launched over the transient-retry fixture — unit 2 fails for good, unit 5's first attempt fails
// retry-safe — the safe retry is moved into 先问你 before the Run starts. Unit 5 then asks instead of retrying: the
// question card says only that step waits while the others are read, 暂不回答 sets it aside recording nothing, and once
// the rest are read the Run waits, 任务等待你的说明, holding nothing. The question outlives AI7 closing; answered by
// keyboard alone — 再试一次 with a note — the Run goes on, retrying unit 5 as its second attempt, to its end.
//
// On the fifth Book, launched over the happy fixture again, 设置上限… in the plan's ⑤ refuses what is not a count of tokens
// and takes 5,000, which 更新计划 freezes into version 2. The Run spends 6,620 tokens on four ranges and stops before the
// fifth: 已停止 · 预算已达上限, with what it read and used, 调整预算并重做 and 查看部分结果 — never 续行 or 重试 — and 待我处理
// holds it as an exception. 查看部分结果 shows ②A's partial revision; 调整预算并重做 opens a new Task carrying the four
// ranges, focused on 设置上限…, where the keyboard alone raises the ceiling to 20,000, and the Task runs to its end.
//
// On the sixth Book, launched over the account-limit fixture, the model service refuses unit 4 on the account's limit. The
// Run stops there — 模型服务账户限额, never 任务已中断 · 可续行 — keeping three ranges and holding nothing, with 处理模型服务
// and 续行, and 待我处理 holds it as an exception. 处理模型服务 opens 设置 › 模型服务 and moves nothing; 续行 then goes on
// in the same Run and attempt from unit 4, whose second turn the fixture serves, to its end.
// 重试, 回退运行方向 and 重放 are J-10's later operations, not these slices'.
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
const SECOND_BOOK = Object.freeze({ title: '续行旅程' });
const THIRD_BOOK = Object.freeze({ title: '改计划重做旅程' });
const FOURTH_BOOK = Object.freeze({ title: '澄清旅程' });
const FIFTH_BOOK = Object.freeze({ title: '预算上限旅程' });
/** The fifth Book's ceilings (Issue #51, S16a): four ranges spend 6,620 tokens under 5,000; the redo reads the rest under 20,000. */
const BUDGET = Object.freeze({ kind: 'tokens', maxTotalTokens: 5000 });
const RAISED = Object.freeze({ kind: 'tokens', maxTotalTokens: 20000 });
const BUDGET_NOTE = '用量和费用仍受所选模型服务的账户控制与计费条款约束。';
const BUDGET_INVALID = '请填一个大于 0 的整数，单位是 tokens。';
const BUDGET_STOP_NOTE = '已读完 4 / 8 个阅读范围，结果都已保留；这次运行用了 6,620 tokens，达到了预算上限 5,000 tokens';
const BUDGET_RUN_LABEL = '任务运行预算已达上限 · 已保留部分结果';
const BUDGET_REDO_GOAL = '改计划重做：沿用已读完的 4 个阅读范围，接着读其余 4 个';
const SIXTH_BOOK = Object.freeze({ title: '账户限额旅程' });
/** The sixth Book's launch (Issue #51, S16b): unit 4's first turn is refused on the account's limit, its second is served. */
const ACCOUNT_LIMIT_FIXTURE_IDENTITY = 'sample1-baseline-account-limit';
const ACCOUNT_LIMIT_NOTE = '模型服务按账户限额拒绝了第 4 个阅读范围。已读完 3 / 8 个阅读范围，结果都已保存；处理好模型服务、限额解除后点「续行」从第 4 个接着读';
/** The fourth Book's launch: unit 2 fails for good, and unit 5's first attempt fails retry-safe (Issue #422, S76d). */
const TRANSIENT_FIXTURE_IDENTITY = 'sample1-baseline-transient-retry';
/** Five ranges may settle before the fourth Book's Run is held: 1 to 4 do, 5 asks, 6 settles, and 7 is in flight. */
const QUESTION_HOLD = 5;
const ASK_FIRST_STATEMENT = '模型服务暂时出错时，先问你要不要把这个阅读范围安全地再试一次；只有等你回答的这一步会停下。';
const QUESTION = '第 5 个阅读范围：模型服务暂时出错，这一次没有读成。要安全地再试一次吗？';
const SCOPE_CONTINUING = '该步骤等待说明 · 其他步骤仍在继续';
const SCOPE_WAITING = '任务等待你的说明';
const QUESTION_NOTE = '服务刚才在维护';
/** Exact `sample1`'s reading ranges. */
const SAMPLE1_UNITS = 8;
/** Two ranges settle before 暂停 with the third in flight; after 续行, five have settled before 取消任务 with the sixth. */
const FIRST_HOLD = 2;
const RESUMED_HOLD = 5;
const THIRD_HOLD = 1;
// The drawer's own words (`src/renderer/task-drawer-labels.ts` and `src/service/task-plan.ts`), pinned there by
// their unit suites.
const REDO_REASON = '先暂停，再改计划重做';
const CANCELLING_NOTE = '已记下你的取消；正在进行的这一步完成后停止，此后不会再发送任何内容';
const PAUSING_NOTE = '已记下你的暂停；正在进行的这一步完成后停下，已完成的部分都会保存';
const PAUSED_NOTE = '已读完 3 / 8 个阅读范围，结果都已保存；续行时从第 4 个接着读，不重复已读完的部分';
const RESUMABLE_NOTE = '已读完 2 / 8 个阅读范围，结果都已保存；续行时从第 3 个接着读，不重复已读完的部分';
const THIRD_PAUSED_NOTE = '已读完 2 / 8 个阅读范围，结果都已保存；续行时从第 3 个接着读，不重复已读完的部分';
/** 改计划重做's summary on the third Book, paused with two ranges kept (Issue #422, S76c). */
const REDO_SUMMARY = Object.freeze([
  '这项任务会在这里停下并取消；已读完的 2 个阅读范围保留在一份新的结果集修订版里，没读到的记为未尝试。',
  '然后准备一项新任务：沿用这 2 个阅读范围的结果，接着读其余 6 个；开始之前可以先改计划。',
  '这项分析不改稿，没有需要撤回的受控动作。',
  '新任务由你开始，不会自己运行。',
]);
/** The redo Task's own sentence: what it carries from the Run it redoes, and what it reads. */
const REDO_GOAL_FIRST = '改计划重做：沿用已读完的 6 个阅读范围，接着读其余 2 个';
const REDO_GOAL_THIRD = '改计划重做：沿用已读完的 2 个阅读范围，接着读其余 6 个';
const IMPACT = Object.freeze([
  `正在读的第 6 个阅读范围读完后停止；其余 ${SAMPLE1_UNITS - 6} 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。`,
  '已读完的 5 个阅读范围和正在读的这一个的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
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
    // The terminal version the service stamps (`BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION`, as J-04 reads it): the 图书交付包
    // revision since Issue #416 (S67a), and after it this pin moves with whatever revision a later slice takes.
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 54, 'credential-cleanup-metadata-version');
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

/**
 * The questions the drawer shows (Issue #422, S76d): each open card's question, scope, choices — chosen or not, 推荐 on
 * which — and its two actions; a card set aside with 暂不回答 as its one quiet line.
 */
const READ_QUESTIONS = `Array.from(document.querySelectorAll('#task-drawer .task-drawer-questions [data-task-plan-clarification]')).map((card) => ({
  state: card.dataset.clarificationState ?? null,
  heading: card.querySelector('h4')?.textContent ?? null,
  question: card.querySelector('legend')?.textContent ?? null,
  scope: card.querySelector('[data-clarification-scope]')?.textContent ?? null,
  options: Array.from(card.querySelectorAll('[data-clarification-option]')).map((option) => [
    option.dataset.clarificationOption, option.querySelector('.task-plan-choice-label')?.textContent ?? null,
    option.querySelector('.task-plan-choice-recommended')?.textContent ?? null, option.querySelector('input')?.checked === true,
  ]),
  submit: (() => { const button = card.querySelector('[data-task-drawer-control^="clarification-submit:"]'); return button === null ? null : [button.textContent, button.disabled]; })(),
  defer: card.querySelector('[data-task-drawer-control^="clarification-defer:"]')?.textContent ?? null,
  line: card.dataset.clarificationState === 'deferred' ? card.textContent : null,
}))`;


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
  const redo = drawer.querySelector('#task-drawer-redo-summary');
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
    redo: redo === null ? null : {
      heading: text(redo.querySelector('h4')),
      lines: Array.from(redo.querySelectorAll('li')).map((line) => line.textContent),
      confirm: text(redo.querySelector('[data-task-drawer-control="confirm-redo"]')),
      keep: text(redo.querySelector('[data-task-drawer-control="keep-plan"]')),
    },
  };
})()`;

/** The drawer following a Run under way with `settled` reading ranges read and the next one in flight. */
function runningWith(settled) {
  return `(() => { const drawer=document.querySelector('#task-drawer'); const activity=drawer?.querySelector('.task-plan-activity'); return drawer?.dataset.taskDrawer==='open' && drawer.dataset.taskPlanState==='running' && activity?.dataset.taskPlanActivity==='running' && activity.dataset.taskPlanActivityProgress===${JSON.stringify(`${settled}/${SAMPLE1_UNITS}`)} && activity.dataset.taskPlanActivityUnit===${JSON.stringify(String(settled + 1))}; })()`;
}
/** The bar of a Run under way (AUTH-010): 暂停 and 取消任务 act on it, 改计划重做 says it waits for 暂停. */
const RUNNING_ACTIONS = Object.freeze([
  ['pause', '暂停', 'enabled', null],
  ['cancel-run', '取消任务', 'enabled', null],
  ['redo', '改计划重做', 'disabled', REDO_REASON],
  ['run-link', '查看运行', 'enabled', null],
]);
/** The bar of a stopped Run that can go on (CONT-015): 续行 first, then 取消任务, 改计划重做 and the way to the Run. */
const STOPPED_ACTIONS = Object.freeze([
  ['resume', '续行', 'enabled', null],
  ['cancel-run', '取消任务', 'enabled', null],
  ['redo', '改计划重做', 'enabled', null],
  ['run-link', '查看运行', 'enabled', null],
]);

/**
 * Wait until the drawer's bar reads exactly what the editor should see — its state, pill, status, note and actions —
 * and fail with the last reading, since a bar that is a moment behind the Run settles on its next read.
 */
async function waitForBar(renderer, expected, name, timeout = 60_000) {
  const view = `(() => { const drawer=${READ_DRAWER}; return drawer === null ? null : JSON.stringify({ state: drawer.state, pill: drawer.pill, status: drawer.status, note: drawer.note, actions: drawer.actions }); })()`;
  const want = JSON.stringify({ state: expected.state, pill: expected.pill, status: expected.status, note: expected.note, actions: expected.actions });
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await renderer.evaluate(view).catch(() => null);
    if (last === want) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  requireJourney(false, name, last);
}
/**
 * The redo Task open in the drawer (Issue #422, S76c): a Task other than the one it redoes, not yet started, in its
 * editing — 完整, focused on 核对与抽检's ×, the first thing that can change.
 */
function redoOpenedFrom(redoneIntentId) {
  return `(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawer==='open' && drawer.dataset.taskPlanKind==='baseline-analysis' && typeof drawer.dataset.taskPlanRef==='string' && drawer.dataset.taskPlanRef!==${JSON.stringify(redoneIntentId)} && drawer.dataset.taskPlanState==='ready' && drawer.dataset.taskPlanVersion==='1' && drawer.dataset.taskDrawerMode==='full' && document.activeElement?.dataset?.taskPlanEdit==='remove' && document.activeElement.closest('[data-task-plan-item]')?.dataset.taskPlanItem==='assurance-sampling'; })()`;
}
/** Whether 待我处理 names the Book's analysis among what is under way, in the given state. */
async function attentionNames(renderer, bookId, state) {
  const attention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
  return {
    named: attention?.groups?.find((group) => group.key === 'active')?.items?.some((item) => item.book?.bookId === bookId && item.state === state) === true,
    groups: attention?.groups?.map((group) => ({ key: group.key, states: group.items.map((item) => item.state) })),
  };
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
    // Every Journey launch names the picker's file, the J-04 model adapter and J-10's unit hold; a cleanup launch none.
    const holdPath = resolve(runRoot, 'j10-unit-hold.txt');
    // The J-04 adapter's fixture: the happy one until the fourth Book's launch (Issue #422, S76d).
    let adapterFixture = FIXTURE_IDENTITY;
    const launchArgs = ({ forCleanup }) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      if (!forCleanup) args.push('--j10-picker-path', SAMPLE1_PATH, '--j04-model-adapter', adapterFixture, '--j10-unit-hold-path', holdPath);
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

    // ---- the first launch, bound to the J-04 model adapter and J-10's unit hold -----------------------------
    at('renderer-api-boundary');
    // Two reading ranges may settle; the third waits, in flight, until the Journey writes the next number.
    await writeFile(holdPath, String(FIRST_HOLD), 'utf8');
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'product-ready');
    // One member each for 取消任务, 暂停, 续行 and 提交回答, and nothing that redoes, retries, replays or rewinds a Run: 改计划重做
    // prepares a new Task through `prepareBaselineAnalysis`, naming the Run it redoes (the manuscript's own
    // `redoManuscript` is the editor's undo and redo, not a Run's).
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && ['cancelBaselineAnalysisRun', 'pauseBaselineAnalysisRun', 'resumeBaselineAnalysisRun', 'answerBaselineAnalysisClarification'].every((key)=>typeof window.ai7[key] === 'function') && !Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key)) && !Object.keys(window.ai7).some((key)=>/(redo|retry|replay|rewind)[A-Za-z]*(Run|Analysis|Task)$/i.test(key))`, 'renderer-api-boundary');
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
    await waitFor(renderer, runningWith(FIRST_HOLD), 'third-range-in-flight', 180_000);
    const executing = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const taskIntentId = executing?.taskIntent?.taskIntentId ?? '';
    requireJourney(UUID_PATTERN.test(taskIntentId) && executing.bookId === bookId && executing.state === 'executing' && executing.run?.state === 'executing' &&
      executing.run.progress?.unitsSettled === FIRST_HOLD && executing.run.progress.currentUnitOrdinal === FIRST_HOLD + 1 && executing.run.progress.unitsTotal === SAMPLE1_UNITS,
    'run-executing-record', { state: executing?.state, run: executing?.run?.state, progress: executing?.run?.progress });
    const running = await renderer.evaluate(READ_DRAWER);
    requireJourney(running?.ref === taskIntentId && running.kind === 'baseline-analysis' && running.start === 'started' && running.pill === '运行中' && running.status === '运行中', 'drawer-follows-the-run', running);

    at('activity-card');
    // AUTH-011: the phase, the range in flight, the time on it and since the Run began, the attempt, the last
    // update and the milestones, each a fact the Run holds; nothing is estimated.
    const rows = running.activity?.rows ?? {};
    requireJourney(running.activity?.title === '运行动态' && rows['阶段'] === '正在逐个阅读范围分析' && rows['当前'] === `第 3 个阅读范围（共 ${SAMPLE1_UNITS} 个）` &&
      /^本步 \d\d:\d\d · 运行 \d\d:\d\d$/u.test(rows['用时'] ?? '') && rows['尝试'] === '已派发' && typeof rows['上次更新'] === 'string' && rows['上次更新'].length > 0 &&
      rows['进展'] === `已读完 ${FIRST_HOLD} / ${SAMPLE1_UNITS} 个阅读范围 · 已完成模型回合 ${FIRST_HOLD} 次`,
    'activity-card-rows', running.activity);
    // LIVE-003's own words once the held step has run longer than this Run's own steps did.
    await waitFor(renderer, `document.querySelector('#task-drawer .task-plan-activity')?.dataset.runLiveness==='stale' && document.querySelector('#task-drawer .task-plan-activity .attention-note')?.textContent==='本步骤用时已超过通常水平'`, 'activity-step-stale', 30_000);

    at('run-controls');
    // AUTH-010: 暂停 and 取消任务 act on the Run, 改计划重做 says why it waits, and the way to the Run's surface.
    requireJourney(JSON.stringify(running.actions) === JSON.stringify(RUNNING_ACTIONS) && running.impact === null, 'run-controls', running.actions);

    // ---- 暂停 and 续行 (Issue #422, S76b; CTRL-001, CONT-015) ----------------------------------------------
    at('pause-requested');
    // CTRL-001: 暂停 is one click and asks nothing. 正在暂停 is recorded at once, and nothing more is offered while
    // the range in flight finishes.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="pause"]', 'pause');
    await waitForBar(renderer, { state: 'pausing', pill: '正在暂停', status: '正在暂停', note: PAUSING_NOTE, actions: [['run-link', '查看运行', 'enabled', null]] }, 'pausing-bar', 30_000);
    await assertRenderer(renderer, `document.querySelector('#task-drawer .task-plan-activity')?.dataset.taskPlanActivity==='pausing' && document.querySelector('#task-drawer-cancel-impact')===null`, 'pausing-activity');
    const pausing = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(pausing?.state === 'pausing' && pausing.stateLabel === '正在暂停' && pausing.run?.state === 'pausing' &&
      JSON.stringify(pausing.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'pausing']) &&
      pausing.run.progress?.unitsSettled === FIRST_HOLD && pausing.run.progress.currentUnitOrdinal === FIRST_HOLD + 1,
    'pausing-record', { state: pausing?.state, run: pausing?.run?.state, progress: pausing?.run?.progress });
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='正在暂停'`, 'pausing-card-label', 30_000);
    const pausingAttention = await attentionNames(renderer, bookId, 'analysis-pausing');
    requireJourney(pausingAttention.named, 'pausing-in-attention', pausingAttention.groups);

    at('pause-holds');
    // 已暂停 is never claimed early: while the range in flight has not finished, the Run stays 正在暂停.
    await new Promise((settle) => setTimeout(settle, 2_000));
    const pauseHeld = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(pauseHeld?.run?.state === 'pausing' && pauseHeld.run.attempt?.spans?.length === FIRST_HOLD &&
      (await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanState`)) === 'pausing', 'pause-holds', { run: pauseHeld?.run?.state, spans: pauseHeld?.run?.attempt?.spans?.length });

    at('paused');
    // The range in flight finishes and is kept; the Run waits at the boundary after it, holding nothing, and reads
    // 已暂停 with where 续行 will go on — and 续行 is offered, since nothing else holds the slot.
    await writeFile(holdPath, String(FIRST_HOLD + 1), 'utf8');
    await waitForBar(renderer, { state: 'paused', pill: '已暂停', status: '已暂停', note: PAUSED_NOTE, actions: STOPPED_ACTIONS }, 'paused-bar');
    await assertRenderer(renderer, `(() => { const activity=document.querySelector('#task-drawer .task-plan-activity'); return activity?.dataset.taskPlanActivity==='stopped' && activity.dataset.taskPlanActivityProgress===${JSON.stringify(`${FIRST_HOLD + 1}/${SAMPLE1_UNITS}`)} && activity.querySelector('.field-note')?.textContent===${JSON.stringify(PAUSED_NOTE)}; })()`, 'paused-activity');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='paused' && document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='已暂停'`, 'paused-card-label', 30_000);
    const paused = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const pausedAttempt = paused?.run?.attempt;
    requireJourney(paused?.state === 'paused' && paused.stateLabel === '已暂停' && paused.run?.state === 'paused' && paused.run.runRecordId === executing.run.runRecordId &&
      JSON.stringify(paused.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'pausing', 'paused']) &&
      UUID_PATTERN.test(pausedAttempt?.attemptId ?? '') && JSON.stringify(pausedAttempt.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3]) &&
      (paused.taskOutcome ?? null) === null && (paused.resultSetRevision ?? null) === null,
    'paused-record', { state: paused?.state, run: paused?.run?.state, spans: pausedAttempt?.spans?.map((span) => span.unitOrdinal), outcome: paused?.taskOutcome ?? null });
    const pausedAttention = await attentionNames(renderer, bookId, 'analysis-paused');
    requireJourney(pausedAttention.named, 'paused-in-attention', pausedAttention.groups);

    at('resumed');
    // CONT-015: 续行 goes on in the same Run and attempt from the fourth range, reading none of the first three again;
    // two more settle, and the sixth stays in flight.
    await writeFile(holdPath, String(RESUMED_HOLD), 'utf8');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="resume"]', 'resume');
    await waitFor(renderer, runningWith(RESUMED_HOLD), 'sixth-range-in-flight', 120_000);
    const resumed = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(resumed?.state === 'executing' && resumed.run?.runRecordId === executing.run.runRecordId && resumed.run.state === 'executing' &&
      JSON.stringify(resumed.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'pausing', 'paused', 'admitted', 'executing']) &&
      resumed.run.progress?.unitsSettled === RESUMED_HOLD && resumed.run.progress.currentUnitOrdinal === RESUMED_HOLD + 1 &&
      resumed.run.attempt?.attemptId === pausedAttempt.attemptId &&
      JSON.stringify(resumed.run.attempt.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4, 5]),
    'resumed-record', { state: resumed?.state, run: resumed?.run?.state, progress: resumed?.run?.progress, spans: resumed?.run?.attempt?.spans?.map((span) => span.unitOrdinal) });
    await waitForBar(renderer, { state: 'running', pill: '运行中', status: '运行中', note: null, actions: RUNNING_ACTIONS }, 'resumed-bar', 30_000);
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='executing'`, 'resumed-card', 30_000);

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
    requireJourney(unrecorded?.run?.state === 'executing' && unrecorded.run.transitions.length === resumed.run.transitions.length, 'summary-records-nothing');

    at('cancel-keep-running');
    // 继续运行 closes the summary and returns focus to 取消任务; the Run never noticed.
    await clickSelector(renderer, '#task-drawer-cancel-impact [data-task-drawer-control="keep-running"]', 'keep-running');
    await waitFor(renderer, `document.querySelector('#task-drawer-cancel-impact') === null && document.activeElement === document.querySelector('#task-drawer [data-task-drawer-control="cancel-run"]')`, 'summary-closed', 10_000);
    const kept = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(kept?.run?.state === 'executing' && kept.run.transitions.length === resumed.run.transitions.length, 'keep-running-records-nothing');

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
      JSON.stringify(cancelling.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'pausing', 'paused', 'admitted', 'executing', 'cancelling']) &&
      cancelling.run.progress?.unitsSettled === RESUMED_HOLD && cancelling.run.progress.currentUnitOrdinal === RESUMED_HOLD + 1,
    'cancelling-record', { state: cancelling?.state, run: cancelling?.run?.state, progress: cancelling?.run?.progress });
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='正在取消'`, 'cancelling-card-label', 30_000);
    // 待我处理 names it as well, wherever the editor looks, until it has stopped.
    const cancellingAttention = await attentionNames(renderer, bookId, 'analysis-cancelling');
    requireJourney(cancellingAttention.named, 'cancelling-in-attention', cancellingAttention.groups);

    at('cancelling-holds');
    // 已取消 is never claimed early: while the range in flight has not finished, the Run stays 正在取消.
    await new Promise((settle) => setTimeout(settle, 2_000));
    const held = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(held?.run?.state === 'cancelling' && held.run.attempt?.spans?.length === RESUMED_HOLD &&
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
    await writeFile(holdPath, String(RESUMED_HOLD + 1), 'utf8');
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskPlanState==='cancelled-after-start' && drawer.querySelector('.task-drawer-pill')?.textContent==='已取消' && drawer.querySelector('.task-bar-status')?.textContent==='已取消' && drawer.querySelector('.task-plan-activity')===null; })()`, 'cancelled-shown', 60_000);
    const cancelledDrawer = await renderer.evaluate(READ_DRAWER);
    // 改计划重做 is offered beside the way to the Run, now that it has stopped (Issue #422, S76c).
    requireJourney(JSON.stringify(cancelledDrawer?.actions) === JSON.stringify([['redo', '改计划重做', 'enabled', null], ['run-link', '查看运行', 'enabled', null]]) && cancelledDrawer.note === null, 'cancelled-bar', cancelledDrawer);
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='cancelled' && document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='已取消'`, 'cancelled-card-label', 30_000);

    at('partial-revision-kept');
    // CTRL-006: the six ranges it read across both executions are kept in a partial revision, the two it never
    // reached named not attempted, and its outcome and report say it was cancelled — never 已中断.
    const cancelled = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const revision = cancelled?.resultSetRevision;
    const report = cancelled?.taskOutcome?.report;
    requireJourney(cancelled?.state === 'cancelled' && cancelled.stateLabel === '已取消' && cancelled.run?.stateLabel === '已取消' &&
      JSON.stringify(cancelled.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'pausing', 'paused', 'admitted', 'executing', 'cancelling', 'cancelled']) &&
      cancelled.run.attempt?.attemptId === pausedAttempt.attemptId &&
      JSON.stringify(cancelled.run.attempt.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4, 5, 6]) &&
      cancelled.taskOutcome?.classification === 'cancelled' && cancelled.taskOutcome.label === '任务结果：已取消' &&
      revision?.coverage?.unitsTotal === SAMPLE1_UNITS && revision.coverage.unitsClosed === RESUMED_HOLD + 1 &&
      cancelled.taskOutcome.resultSetRevisionId === revision.revisionId &&
      JSON.stringify(revision.gaps.map((gap) => [gap.unitOrdinal, gap.code])) === JSON.stringify([7, 8].map((ordinal) => [ordinal, 'not-attempted'])) &&
      report?.classification === 'cancelled' && report.ifRedone?.reason === REFLECTION_CANCELLED &&
      JSON.stringify(report.stages.map((stage) => [stage.stage, stage.state])) === JSON.stringify([['units', 'closed-with-gaps'], ['cross-unit-reduction', 'not-run'], ['assurance-sampling', 'not-run'], ['reduction', 'closed']]),
    'partial-revision', { state: cancelled?.state, run: cancelled?.run?.state, outcome: cancelled?.taskOutcome?.classification, closed: revision?.coverage?.unitsClosed, gaps: revision?.gaps?.length });

    at('nothing-sent-after');
    // Nothing more is recorded or sent once the Run has stopped.
    await new Promise((settle) => setTimeout(settle, 1_000));
    const after = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(after?.run?.state === 'cancelled' && after.run.attempt?.spans?.length === RESUMED_HOLD + 1 &&
      JSON.stringify(after.run.transitions) === JSON.stringify(cancelled.run.transitions), 'nothing-sent-after');

    // ---- 改计划重做 (Issue #422, S76c; V2-UX-AUTH-010, CONT-013) ----------------------------------------------
    at('redo-from-cancelled');
    // A Run cancelled after it began offers 改计划重做 beside 查看运行 and asks nothing more: the redo is a new Task —
    // its own intent, plan and envelope — that carries the six ranges the Run read and reads the two it did not. The
    // drawer opens it in its editing, and nothing runs until the editor starts it. Nothing is held from here on.
    await writeFile(holdPath, 'release', 'utf8');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="redo"]', 'redo');
    await waitFor(renderer, redoOpenedFrom(taskIntentId), 'redo-opened', 120_000);
    const redone = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const redoIntentId = redone?.taskIntent?.taskIntentId ?? '';
    const redoCounts = redone?.update?.reusePlan?.counts;
    requireJourney(UUID_PATTERN.test(redoIntentId) && redoIntentId !== taskIntentId && redone.bookId === bookId && redone.state === 'prepared' && (redone.run ?? null) === null &&
      redone.taskIntent.mode === 'sync-current' && redone.taskIntent.redoOf?.runRecordId === executing.run.runRecordId && redone.taskIntent.redoOf.taskIntentId === taskIntentId &&
      redoCounts?.reused === RESUMED_HOLD + 1 && redoCounts.recomputed === SAMPLE1_UNITS - RESUMED_HOLD - 1 &&
      redone.update.predecessor?.revisionId === revision.revisionId && redone.resultSetRevision?.revisionId === revision.revisionId && redone.planVersion?.ordinal === 1 &&
      (await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanRef`)) === redoIntentId,
    'redo-task', { state: redone?.state, run: redone?.run?.state ?? null, intent: redone?.taskIntent, counts: redoCounts, predecessor: redone?.update?.predecessor?.revisionId ?? null });
    // The drawer says what the new Task does and names the Run it redoes; ②A's card holds it, prepared.
    const redoOfWords = `运行 ${executing.run.runRecordId} · 任务意图 ${taskIntentId}`;
    await assertRenderer(renderer, `document.querySelector('#task-drawer .task-plan-sentence-text')?.textContent===${JSON.stringify(REDO_GOAL_FIRST)} && document.querySelector('#task-drawer [data-task-plan-technical="redo-of"]')?.textContent===${JSON.stringify(redoOfWords)}`, 'redo-task-words');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared' && document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId===${JSON.stringify(redoIntentId)}`, 'redo-task-card', 30_000);

    at('redo-plan-edit');
    // The redo is the editor's to change before it starts: × leaves 核对与抽检 out, and 更新计划 makes that version 2.
    await clickSelector(renderer, '#task-drawer [data-task-plan-item="assurance-sampling"] [data-task-plan-edit="remove"]', 'redo-remove-sampling');
    await waitFor(renderer, `document.querySelector('#task-drawer .task-bar-note')?.textContent==='你改了 1 处' && document.querySelector('#task-drawer [data-task-drawer-control="update-plan"]')?.disabled===false`, 'redo-edit-pending', 10_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="update-plan"]', 'redo-update-plan');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanVersion==='2' && document.querySelector('#task-drawer')?.dataset.taskPlanStart==='ready' && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, 'redo-plan-version-2', 60_000);
    const redoEdited = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(redoEdited?.taskIntent?.taskIntentId === redoIntentId && redoEdited.state === 'prepared' && redoEdited.planVersion?.ordinal === 2 &&
      JSON.stringify(redoEdited.planVersion.edits?.removedSteps) === JSON.stringify(['assurance-sampling']) && JSON.stringify(redoEdited.planVersion.edits.disallowedAdaptations) === '[]' &&
      redoEdited.planRevisions?.at(-1)?.trigger === 'plan-edit' && (redoEdited.run ?? null) === null,
    'redo-plan-edited', { planVersion: redoEdited?.planVersion ?? null, trigger: redoEdited?.planRevisions?.at(-1)?.trigger ?? null });

    at('redo-run-completed');
    // 开始任务: the redo runs as any Task does — only the two ranges the cancelled Run never reached — to its end,
    // without 核对与抽检, as the editor asked; ②A and the drawer follow it there.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'redo-start');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.taskIntent?.taskIntentId===${JSON.stringify(redoIntentId)} && analysis.run !== null && !['authorized','admitted','executing'].includes(analysis.run.state))`, 'redo-run-ended', 180_000);
    const redoFinished = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const redoRevision = redoFinished?.resultSetRevision;
    requireJourney(redoFinished?.state === 'settled' && redoFinished.run?.state === 'completed' && redoFinished.run.runRecordId !== executing.run.runRecordId &&
      JSON.stringify(redoFinished.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'completed']) &&
      JSON.stringify(redoFinished.run.attempt?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([7, 8]) &&
      redoRevision?.coverage?.unitsTotal === SAMPLE1_UNITS && redoRevision.coverage.unitsClosed === SAMPLE1_UNITS && redoRevision.revisionId !== revision.revisionId &&
      redoRevision.assuranceSample?.state === 'not-run' &&
      redoFinished.taskOutcome?.classification === 'completed' && redoFinished.taskOutcome.resultSetRevisionId === redoRevision.revisionId,
    'redo-run-completed', { state: redoFinished?.state, run: redoFinished?.run?.state, transitions: redoFinished?.run?.transitions?.map((transition) => transition.state), spans: redoFinished?.run?.attempt?.spans?.map((span) => span.unitOrdinal), closed: redoRevision?.coverage?.unitsClosed, sample: redoRevision?.assuranceSample?.state, outcome: redoFinished?.taskOutcome?.classification });
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled' && document.querySelector('#task-drawer')?.dataset.taskPlanState==='settled'`, 'redo-run-shown-settled', 30_000);

    // ---- 任务已中断 · 可续行: AI7 closes under a Run, and the Run goes on after it (CONT-014, CONT-015) ---------
    at('relaunch-for-second-book');
    // One range of the second Book's Run may settle; the second is in flight when AI7 closes.
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await writeFile(holdPath, '1', 'utf8');
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'second-ready');

    at('second-book-import');
    const secondBookId = await importSample1(renderer, SECOND_BOOK.title, true, 'second-import');
    requireJourney(secondBookId !== bookId, 'two-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'second-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'second-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'second-artifact-enabled');
    await click(renderer, '返回图书列表', 'second-return-library');

    at('second-run-held');
    await openAnalysisOf(renderer, secondBookId, 'second-analysis');
    await startFirstBaseline(renderer, 'ready', 'second-baseline');
    await waitFor(renderer, runningWith(1), 'second-range-in-flight', 180_000);
    const beforeClose = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(beforeClose?.bookId === secondBookId && beforeClose.state === 'executing' && beforeClose.run?.state === 'executing' &&
      UUID_PATTERN.test(beforeClose.run.runRecordId ?? '') && beforeClose.run.progress?.unitsSettled === 1 && beforeClose.run.progress.currentUnitOrdinal === 2,
    'second-run-executing', { state: beforeClose?.state, run: beforeClose?.run?.state, progress: beforeClose?.run?.progress });

    at('closed-under-run');
    // AI7 closes with the second range's turn back and not yet settled. A whole turn is kept, never read again, and
    // the Run stops at the boundary after it: 任务已中断 · 可续行, holding nothing.
    await closeOwnedBrowser();
    cancellation.throwIfRequested();

    at('relaunched-resumable');
    // Nothing is held from here on, and nothing may run until the editor says 续行.
    await writeFile(holdPath, 'release', 'utf8');
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'relaunched-ready');
    const resumableAttention = await attentionNames(renderer, secondBookId, 'analysis-resumable');
    requireJourney(resumableAttention.named, 'resumable-in-attention', resumableAttention.groups);
    await openAnalysisOf(renderer, secondBookId, 'relaunched-analysis');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='resumable' && document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='任务已中断 · 可续行'`, 'resumable-card-label', 30_000);
    const resumable = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const resumableAttempt = resumable?.run?.attempt;
    requireJourney(resumable?.bookId === secondBookId && resumable.state === 'resumable' && resumable.stateLabel === '任务已中断 · 可续行' &&
      resumable.run?.state === 'resumable' && resumable.run.runRecordId === beforeClose.run.runRecordId &&
      JSON.stringify(resumable.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'resumable']) &&
      UUID_PATTERN.test(resumableAttempt?.attemptId ?? '') && JSON.stringify(resumableAttempt.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2]) &&
      (resumable.taskOutcome ?? null) === null,
    'resumable-record', { state: resumable?.state, run: resumable?.run?.state, transitions: resumable?.run?.transitions?.map((transition) => transition.state), spans: resumableAttempt?.spans?.map((span) => span.unitOrdinal) });
    await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', 'resumable-open-plan');
    await waitForBar(renderer, { state: 'resumable', pill: '任务已中断 · 可续行', status: '任务已中断 · 可续行', note: RESUMABLE_NOTE, actions: STOPPED_ACTIONS }, 'resumable-bar', 30_000);
    // Nothing was sent since AI7 opened again.
    await new Promise((settle) => setTimeout(settle, 1_000));
    const stillStopped = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(stillStopped?.run?.state === 'resumable' && JSON.stringify(stillStopped.run.transitions) === JSON.stringify(resumable.run.transitions) &&
      stillStopped.run.attempt?.spans?.length === 2, 'resumable-sends-nothing');

    at('resumed-after-restart');
    // 续行 goes on in the same Run and attempt from the third range to the end: eight ranges read once each.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="resume"]', 'restart-resume');
    // Followed by its record to whatever end it comes to — ②A's card reads 可续行 for a moment after the click.
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>(analysis?.run?.transitions?.length ?? 0) > ${resumable.run.transitions.length} && !['admitted','executing'].includes(analysis.run.state))`, 'resumed-run-ended', 180_000);
    const finished = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const finishedRevision = finished?.resultSetRevision;
    requireJourney(finished?.state === 'settled' && finished.run?.runRecordId === beforeClose.run.runRecordId && finished.run.state === 'completed' &&
      JSON.stringify(finished.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'resumable', 'admitted', 'executing', 'completed']) &&
      finished.run.attempt?.attemptId === resumableAttempt.attemptId &&
      JSON.stringify(finished.run.attempt.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]) &&
      finishedRevision?.coverage?.unitsTotal === SAMPLE1_UNITS && finishedRevision.coverage.unitsClosed === SAMPLE1_UNITS &&
      finished.taskOutcome?.classification === 'completed' && finished.taskOutcome.resultSetRevisionId === finishedRevision.revisionId,
    'resumed-run-completed', { state: finished?.state, run: finished?.run?.state, transitions: finished?.run?.transitions?.map((transition) => transition.state), spans: finished?.run?.attempt?.spans?.map((span) => span.unitOrdinal), closed: finishedRevision?.coverage?.unitsClosed, outcome: finished?.taskOutcome?.classification });
    // ②A's card and the drawer follow it there.
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled' && document.querySelector('#task-drawer')?.dataset.taskPlanState==='settled'`, 'resumed-run-shown-settled', 30_000);

    // ---- 改计划重做 from a stopped Run (Issue #422, S76c; V2-UX-AUTH-010, CONT-013) ------------------------------
    at('third-book-import');
    // A third Book, reached from the library by way of 工作概览.
    await assertRenderer(renderer, `(() => { const open=Array.from(document.querySelectorAll('[data-screen="book-analysis"] .workbench-actions button')).find((button)=>button.textContent==='工作概览'); if(!(open instanceof HTMLButtonElement)||open.disabled)return false; open.click(); return true; })()`, 'third-overview');
    await waitFor(renderer, `Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='返回图书列表'&&!button.disabled)`, 'third-overview-ready');
    await click(renderer, '返回图书列表', 'third-library');
    const thirdBookId = await importSample1(renderer, THIRD_BOOK.title, true, 'third-import');
    requireJourney(thirdBookId !== bookId && thirdBookId !== secondBookId, 'three-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'third-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'third-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'third-artifact-enabled');
    await click(renderer, '返回图书列表', 'third-return-library');

    at('third-run-paused');
    // One range may settle and the second is in flight when the editor pauses; it finishes and is kept, and the Run
    // waits at the boundary after it, holding nothing. Nothing is held from here on.
    await writeFile(holdPath, String(THIRD_HOLD), 'utf8');
    await openAnalysisOf(renderer, thirdBookId, 'third-analysis');
    await startFirstBaseline(renderer, 'ready', 'third-baseline');
    await waitFor(renderer, runningWith(THIRD_HOLD), 'third-second-range-in-flight', 180_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="pause"]', 'third-pause');
    await waitForBar(renderer, { state: 'pausing', pill: '正在暂停', status: '正在暂停', note: PAUSING_NOTE, actions: [['run-link', '查看运行', 'enabled', null]] }, 'third-pausing-bar', 30_000);
    await writeFile(holdPath, 'release', 'utf8');
    await waitForBar(renderer, { state: 'paused', pill: '已暂停', status: '已暂停', note: THIRD_PAUSED_NOTE, actions: STOPPED_ACTIONS }, 'third-paused-bar');
    const thirdPaused = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const thirdIntentId = thirdPaused?.taskIntent?.taskIntentId ?? '';
    requireJourney(thirdPaused?.bookId === thirdBookId && UUID_PATTERN.test(thirdIntentId) && thirdPaused.state === 'paused' && thirdPaused.run?.state === 'paused' &&
      JSON.stringify(thirdPaused.run.attempt?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2]) && (thirdPaused.resultSetRevision ?? null) === null,
    'third-paused-record', { state: thirdPaused?.state, run: thirdPaused?.run?.state, spans: thirdPaused?.run?.attempt?.spans?.map((span) => span.unitOrdinal) });

    at('redo-summary');
    // AUTH-010: on a stopped Run 改计划重做 opens one inline summary, focus on it, of what stops, what is kept and what
    // the new Task does — the same four lines `inspectTaskPlan()` answers — and records nothing.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="redo"]', 'open-redo-summary');
    await waitFor(renderer, `document.activeElement !== null && document.activeElement === document.querySelector('#task-drawer-redo-summary h4')`, 'redo-summary-focused', 10_000);
    const redoSummary = await renderer.evaluate(READ_DRAWER);
    const thirdPlan = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(thirdIntentId)} })`);
    requireJourney(redoSummary?.redo?.heading === '改计划重做摘要' && JSON.stringify(redoSummary.redo.lines) === JSON.stringify(REDO_SUMMARY) &&
      JSON.stringify(thirdPlan?.redo?.summary) === JSON.stringify(REDO_SUMMARY) && redoSummary.redo.confirm === '确认改计划重做' && redoSummary.redo.keep === '先不重做' &&
      redoSummary.impact === null,
    'redo-summary', redoSummary?.redo ?? null);
    const unrecordedRedo = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(unrecordedRedo?.taskIntent?.taskIntentId === thirdIntentId && unrecordedRedo.run?.state === 'paused' &&
      unrecordedRedo.run.transitions.length === thirdPaused.run.transitions.length, 'redo-summary-records-nothing');

    at('redo-keep-plan');
    // 先不重做 closes it and returns focus to 改计划重做; the Run stays 已暂停.
    await clickSelector(renderer, '#task-drawer-redo-summary [data-task-drawer-control="keep-plan"]', 'keep-plan');
    await waitFor(renderer, `document.querySelector('#task-drawer-redo-summary') === null && document.activeElement === document.querySelector('#task-drawer [data-task-drawer-control="redo"]')`, 'redo-summary-closed', 10_000);
    const keptPlan = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(keptPlan?.taskIntent?.taskIntentId === thirdIntentId && keptPlan.run?.state === 'paused' &&
      keptPlan.run.transitions.length === thirdPaused.run.transitions.length, 'keep-plan-records-nothing');

    at('j14-redo-keyboard');
    // Without a pointer: Enter on 改计划重做 opens the summary with its heading focused, and Tab reaches 确认改计划重做
    // with visible focus.
    await pressEnter(renderer);
    await waitFor(renderer, `document.activeElement !== null && document.activeElement === document.querySelector('#task-drawer-redo-summary h4')`, 'keyboard-redo-summary-focused', 10_000);
    await pressTab(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.taskDrawerControl === 'confirm-redo' && document.activeElement.matches(':focus-visible')`, 'keyboard-confirm-redo-reached', 10_000);

    at('redo-confirmed');
    // Enter confirms: the Run is cancelled from where it stopped — its two ranges kept in a partial revision, the rest
    // named not attempted — and, once it reads 已取消, the new Task is prepared, carrying those two and reading the
    // other six, and opens in its editing. Nothing runs.
    await pressEnter(renderer);
    await waitFor(renderer, redoOpenedFrom(thirdIntentId), 'redo-confirmed-opened', 120_000);
    const thirdRedo = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const thirdRedoCounts = thirdRedo?.update?.reusePlan?.counts;
    const thirdPartial = thirdRedo?.resultSetRevision;
    requireJourney(thirdRedo?.bookId === thirdBookId && thirdRedo.state === 'prepared' && (thirdRedo.run ?? null) === null &&
      UUID_PATTERN.test(thirdRedo.taskIntent?.taskIntentId ?? '') && thirdRedo.taskIntent.taskIntentId !== thirdIntentId && thirdRedo.taskIntent.mode === 'sync-current' &&
      thirdRedo.taskIntent.redoOf?.runRecordId === thirdPaused.run.runRecordId && thirdRedo.taskIntent.redoOf.taskIntentId === thirdIntentId &&
      thirdRedoCounts?.reused === THIRD_HOLD + 1 && thirdRedoCounts.recomputed === SAMPLE1_UNITS - THIRD_HOLD - 1 &&
      thirdPartial?.coverage?.unitsTotal === SAMPLE1_UNITS && thirdPartial.coverage.unitsClosed === THIRD_HOLD + 1 && thirdRedo.update.predecessor?.revisionId === thirdPartial.revisionId &&
      thirdPartial.provenance?.runRecordId === thirdPaused.run.runRecordId && thirdPartial.provenance.taskIntentId === thirdIntentId &&
      thirdPartial.provenance.attemptId === thirdPaused.run.attempt.attemptId &&
      JSON.stringify(thirdPartial.gaps.map((gap) => [gap.unitOrdinal, gap.code])) === JSON.stringify([3, 4, 5, 6, 7, 8].map((ordinal) => [ordinal, 'not-attempted'])),
    'redo-confirmed-task', { state: thirdRedo?.state, run: thirdRedo?.run?.state ?? null, intent: thirdRedo?.taskIntent, counts: thirdRedoCounts, closed: thirdPartial?.coverage?.unitsClosed, provenance: thirdPartial?.provenance ?? null });
    await assertRenderer(renderer, `document.querySelector('#task-drawer .task-plan-sentence-text')?.textContent===${JSON.stringify(REDO_GOAL_THIRD)}`, 'redo-confirmed-words');
    // 新任务由你开始，不会自己运行: a moment later it is still waiting for the editor.
    await new Promise((settle) => setTimeout(settle, 1_000));
    const stillPrepared = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(stillPrepared?.taskIntent?.taskIntentId === thirdRedo.taskIntent.taskIntentId && stillPrepared.state === 'prepared' && (stillPrepared.run ?? null) === null &&
      (await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanState`)) === 'ready', 'redo-waits-for-the-editor');

    // ---- Clarification Requests (Issue #422, S76d; CLAR-001 to CLAR-007, PLAN-011, PLAN-012) ------------------------
    at('relaunch-for-clarification');
    // A launch over the transient-retry fixture: unit 2 fails for good, and unit 5's first attempt fails retry-safe.
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await writeFile(holdPath, 'release', 'utf8');
    adapterFixture = TRANSIENT_FIXTURE_IDENTITY;
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'clarification-ready');

    at('fourth-book-import');
    const fourthBookId = await importSample1(renderer, FOURTH_BOOK.title, true, 'fourth-import');
    requireJourney(![bookId, secondBookId, thirdBookId].includes(fourthBookId), 'four-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'fourth-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'fourth-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'fourth-artifact-enabled');
    await click(renderer, '返回图书列表', 'fourth-return-library');

    at('ask-first-edit');
    // In 完整 the safe retry offers × (不允许) and 先问你. 先问你 moves it into the right column with 恢复, and 更新计划 makes
    // that version 2, whose plan says where the editor may be asked (PLAN-005).
    await openAnalysisOf(renderer, fourthBookId, 'fourth-analysis');
    await prepareFirstBaseline(renderer, 'ready', 'fourth-baseline');
    const fourthIntentId = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanRef ?? ''`);
    requireJourney(UUID_PATTERN.test(fourthIntentId), 'fourth-task');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="revise"]', 'fourth-revise');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerMode==='full' && document.querySelector('#task-drawer [data-task-plan-boundary="adaptable"] [data-task-plan-item="safe-retry"] [data-task-plan-edit="ask-first"]')?.disabled===false`, 'ask-first-offered', 10_000);
    await assertRenderer(renderer, `document.querySelector('#task-drawer [data-task-plan-item="safe-retry"] [data-task-plan-edit="ask-first"]')?.getAttribute('aria-label')==='改成先问你：模型服务暂时出错时，同一个阅读范围安全地再试一次'`, 'ask-first-named');
    await clickSelector(renderer, '#task-drawer [data-task-plan-item="safe-retry"] [data-task-plan-edit="ask-first"]', 'ask-first-move');
    await waitFor(renderer, `(() => { const item=document.querySelector('#task-drawer [data-task-plan-boundary="ask-first"] [data-task-plan-item="safe-retry"]'); return item!==null && item.querySelector('.task-plan-edit-tag')?.textContent==='你改的 · 先问你' && document.activeElement===item.querySelector('[data-task-plan-edit="restore"]') && document.querySelector('#task-drawer .task-bar-note')?.textContent==='你改了 1 处'; })()`, 'ask-first-moved', 10_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="update-plan"]', 'ask-first-update');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanVersion==='2' && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, 'ask-first-version-2', 60_000);
    const askedPlan = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(askedPlan?.taskIntent?.taskIntentId === fourthIntentId && askedPlan.planVersion?.ordinal === 2 &&
      JSON.stringify(askedPlan.planVersion.edits?.askFirstAdaptations) === JSON.stringify(['safe-retry']) &&
      JSON.stringify(askedPlan.planEnvelope?.boundary?.askFirst?.map((entry) => entry.adaptationClass)) === JSON.stringify(['safe-retry']) &&
      JSON.stringify(askedPlan.planEnvelope.boundary.adaptable) === '[]' && askedPlan.planEnvelope.boundary.participation?.expected === true,
    'ask-first-version', { edits: askedPlan?.planVersion?.edits ?? null, boundary: askedPlan?.planEnvelope?.boundary ?? null });
    await assertRenderer(renderer, `document.querySelector('#task-drawer .task-plan-participation li')?.textContent===${JSON.stringify(ASK_FIRST_STATEMENT)} && document.querySelector('#task-drawer [data-task-plan-boundary="ask-first"] [data-task-plan-item="safe-retry"] .task-plan-edit-tag')?.textContent==='你改的 · 先问你'`, 'ask-first-plan-words');

    at('clarification-raised');
    // 开始任务 with five ranges allowed to settle: unit 5 fails retry-safe and, asked first, asks instead of retrying; 6 is
    // read and 7 held in flight. The card says only that step waits, its choices unchosen, 推荐 on 再试一次.
    await writeFile(holdPath, String(QUESTION_HOLD), 'utf8');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'fourth-start');
    await waitFor(renderer, `(() => { const activity=document.querySelector('#task-drawer .task-plan-activity'); return activity?.dataset.taskPlanActivityProgress==='5/8' && activity.dataset.taskPlanActivityUnit==='7' && document.querySelector('#task-drawer .task-drawer-questions [data-clarification-state="open"]')!==null; })()`, 'question-raised', 180_000);
    const raised = await renderer.evaluate(READ_QUESTIONS);
    requireJourney(JSON.stringify(raised) === JSON.stringify([{
      state: 'open', heading: '需要你回答', question: QUESTION, scope: SCOPE_CONTINUING,
      options: [['retry', '再试一次', '推荐', false], ['record-gap', '不重试，记为缺口', null, false]],
      submit: ['提交回答', true], defer: '暂不回答', line: null,
    }]), 'question-card', raised);
    await waitForBar(renderer, { state: 'running', pill: '运行中', status: '运行中', note: '有 1 个问题等你回答', actions: RUNNING_ACTIONS }, 'question-running-bar', 30_000);
    const asking = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(fourthIntentId)} })`);
    requireJourney(asking?.clarifications?.length === 1 && asking.clarifications[0].unitOrdinal === 5 && asking.clarifications[0].state === 'open' &&
      asking.clarifications[0].answer === null, 'question-record', asking?.clarifications ?? null);
    const askingAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(askingAttention?.groups?.find((group) => group.key === 'decisions')?.items?.some((entry) =>
      entry.book?.bookId === fourthBookId && entry.state === 'analysis-clarification' && entry.blocked === false) === true, 'question-in-attention', askingAttention?.groups ?? null);

    at('clarification-deferred');
    // 暂不回答 sets the card aside as one quiet line with 回答, focus on it, and records nothing (CLAR-007).
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control^="clarification-defer:"]', 'question-defer');
    await waitFor(renderer, `document.activeElement?.dataset?.taskDrawerControl?.startsWith('clarification-reopen:') === true`, 'question-deferred', 10_000);
    const deferred = await renderer.evaluate(READ_QUESTIONS);
    requireJourney(deferred.length === 1 && deferred[0].state === 'deferred' && deferred[0].line === '有 1 个问题等你回答回答', 'question-deferred-line', deferred);
    const unanswered = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(fourthIntentId)} })`);
    requireJourney(unanswered?.clarifications?.[0]?.state === 'open' && unanswered.clarifications[0].answer === null, 'defer-records-nothing');

    at('clarification-waiting');
    // Released, ranges 7 and 8 are read and the Run stops at that boundary: 任务等待你的说明, holding nothing, 等你回答 in
    // the bar with 取消任务 and 改计划重做 beside it, and 待我处理 holds the question as what the Task waits for.
    await writeFile(holdPath, 'release', 'utf8');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.run?.state==='awaiting-clarification')`, 'run-waits', 60_000);
    await waitForBar(renderer, {
      state: 'awaiting-clarification', pill: SCOPE_WAITING, status: '等你回答', note: '已读完 7 / 8 个阅读范围；1 个问题等你回答，回答后接着做',
      actions: [['cancel-run', '取消任务', 'enabled', null], ['redo', '改计划重做', 'enabled', null], ['run-link', '查看运行', 'enabled', null]],
    }, 'waiting-bar', 30_000);
    const waitingRun = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(waitingRun?.state === 'awaiting-clarification' && waitingRun.stateLabel === SCOPE_WAITING &&
      JSON.stringify(waitingRun.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'awaiting-clarification']) &&
      JSON.stringify(waitingRun.run.attempt?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]) &&
      (waitingRun.resultSetRevision ?? null) === null,
    'waiting-record', { state: waitingRun?.state, transitions: waitingRun?.run?.transitions?.map((transition) => transition.state), spans: waitingRun?.run?.attempt?.spans?.map((span) => span.unitOrdinal) });
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='awaiting-clarification'`, 'waiting-card', 30_000);
    const waitingAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(waitingAttention?.groups?.find((group) => group.key === 'decisions')?.items?.some((entry) =>
      entry.book?.bookId === fourthBookId && entry.state === 'analysis-clarification' && entry.blocked === true) === true, 'waiting-in-attention', waitingAttention?.groups ?? null);

    at('clarification-survives-restart');
    // AI7 closes and opens again: the question and the Run's wait are both still there, and nothing was sent since.
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    await openAnalysisOf(renderer, fourthBookId, 'restart-analysis');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='awaiting-clarification' && document.querySelector('.baseline-analysis-card .analysis-state')?.textContent===${JSON.stringify(SCOPE_WAITING)}`, 'restart-card', 30_000);
    await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', 'restart-open-plan');
    await waitFor(renderer, `document.querySelector('#task-drawer .task-drawer-questions [data-clarification-state="open"] [data-clarification-scope]')?.textContent===${JSON.stringify(SCOPE_WAITING)}`, 'question-after-restart', 30_000);
    const restarted = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(restarted?.run?.state === 'awaiting-clarification' && JSON.stringify(restarted.run.transitions) === JSON.stringify(waitingRun.run.transitions), 'nothing-since-restart');

    at('j14-clarification-keyboard');
    // Without a pointer: from the card's heading, Tab reaches 再试一次 and Space chooses it; Tab reaches 自行说明…, and
    // Enter opens the note, which takes the words — Enter there is a new line and submits nothing — and Tab reaches
    // 提交回答 with visible focus.
    await assertRenderer(renderer, `(() => { const heading=document.querySelector('#task-drawer .task-drawer-questions [data-clarification-state="open"] h4'); if(!(heading instanceof HTMLElement))return false; heading.focus(); return document.activeElement===heading; })()`, 'keyboard-question-start');
    await pressTab(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.taskDrawerControl?.endsWith(':retry') === true && document.activeElement.matches(':focus-visible')`, 'keyboard-retry-focused', 10_000);
    await pressSpace(renderer);
    await waitFor(renderer, `document.activeElement instanceof HTMLInputElement && document.activeElement.checked && document.querySelector('#task-drawer [data-task-drawer-control^="clarification-submit:"]')?.disabled===false`, 'keyboard-retry-chosen', 10_000);
    await pressTab(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.taskDrawerControl?.startsWith('clarification-note-toggle:') === true`, 'keyboard-note-toggle', 10_000);
    await pressEnter(renderer);
    await waitFor(renderer, `document.activeElement instanceof HTMLTextAreaElement && document.activeElement.dataset.taskDrawerControl?.startsWith('clarification-note:') === true`, 'keyboard-note-open', 10_000);
    await renderer.send('Input.insertText', { text: QUESTION_NOTE });
    await pressEnter(renderer);
    await new Promise((settle) => setTimeout(settle, 500));
    const stillOpen = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(fourthIntentId)} })`);
    requireJourney(stillOpen?.clarifications?.[0]?.answer === null &&
      (await renderer.evaluate(`document.activeElement instanceof HTMLTextAreaElement && document.activeElement.value===${JSON.stringify(`${QUESTION_NOTE}
`)}`)) === true,
    'enter-writes-a-line');
    await pressTab(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.taskDrawerControl?.startsWith('clarification-submit:') === true && document.activeElement.matches(':focus-visible')`, 'keyboard-submit-reached', 10_000);

    at('clarification-answered');
    // Enter on 提交回答: the answer is recorded — 再试一次 and the note — and the Run goes on inside its unchanged envelope,
    // retrying unit 5 as its second attempt, to its end; the drawer keeps what was asked and answered.
    await pressEnter(renderer);
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>(analysis?.run?.transitions?.length ?? 0) > 4 && !['awaiting-clarification','admitted','executing'].includes(analysis.run.state))`, 'answered-run-ended', 180_000);
    const answeredRun = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const answeredRevision = answeredRun?.resultSetRevision;
    requireJourney(answeredRun?.state === 'settled' && answeredRun.run?.state === 'completed-with-gaps' &&
      JSON.stringify(answeredRun.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'awaiting-clarification', 'admitted', 'executing', 'completed-with-gaps']) &&
      JSON.stringify(answeredRun.run.attempt?.spans?.map((span) => [span.unitOrdinal, span.attemptIndex])) === JSON.stringify([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [5, 2]]) &&
      answeredRevision?.coverage?.unitsClosed === 7 && JSON.stringify(answeredRevision.gaps.map((gap) => gap.unitOrdinal)) === '[2]' &&
      answeredRun.run.adaptations?.length === 1 && answeredRun.run.adaptations[0].unitOrdinal === 5 && typeof answeredRun.run.adaptations[0].clarificationAnswerId === 'string',
    'answered-run', { state: answeredRun?.state, run: answeredRun?.run?.state, transitions: answeredRun?.run?.transitions?.map((transition) => transition.state), closed: answeredRevision?.coverage?.unitsClosed });
    const answeredPlan = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(fourthIntentId)} })`);
    requireJourney(answeredPlan?.clarifications?.[0]?.state === 'answered' && answeredPlan.clarifications[0].answer?.optionId === 'retry' &&
      answeredPlan.clarifications[0].answer.note === QUESTION_NOTE, 'answer-record', answeredPlan?.clarifications ?? null);
    await waitFor(renderer, `document.querySelector('#task-drawer .task-plan-clarification-record li[data-clarification-state="answered"] .task-plan-clarification-answer')?.textContent?.startsWith(${JSON.stringify(`你已回答：再试一次 · 说明：${QUESTION_NOTE}（`)}) === true && document.querySelector('#task-drawer .task-drawer-questions [data-task-plan-clarification]')===null`, 'answer-shown', 30_000);

    // ---- The Run Budget Ceiling (Issue #51, S16a; MODEL-013, MODEL-015 to MODEL-017) ----------------------------------
    at('relaunch-for-budget');
    // A launch over the happy fixture again, whose turns report the tokens a ceiling counts; nothing is held.
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await writeFile(holdPath, 'release', 'utf8');
    adapterFixture = FIXTURE_IDENTITY;
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'budget-ready');

    at('fifth-book-import');
    const fifthBookId = await importSample1(renderer, FIFTH_BOOK.title, true, 'fifth-import');
    requireJourney(![bookId, secondBookId, thirdBookId, fourthBookId].includes(fifthBookId), 'five-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'fifth-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'fifth-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'fifth-artifact-enabled');
    await click(renderer, '返回图书列表', 'fifth-return-library');

    at('budget-set');
    // ⑤ reads 未设置任务预算上限 and what any ceiling leaves to the model service's account (MODEL-013). 设置上限… opens one
    // labelled field: what is not a count of tokens is refused in words, and 5,000 becomes the editor's change, which
    // 更新计划 makes version 2 — the ceiling frozen into the plan, which can still start.
    await openAnalysisOf(renderer, fifthBookId, 'fifth-analysis');
    await prepareFirstBaseline(renderer, 'ready', 'fifth-baseline');
    const fifthIntentId = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanRef ?? ''`);
    requireJourney(UUID_PATTERN.test(fifthIntentId), 'fifth-task');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="revise"]', 'fifth-revise');
    await waitFor(renderer, `(() => { const section=document.querySelector('#task-drawer [data-task-plan-section="5"]'); return document.querySelector('#task-drawer')?.dataset.taskDrawerMode==='full' && section?.querySelector('dd[data-task-plan-term="预算上限"]')?.textContent==='未设置任务预算上限' && section.querySelector('.task-plan-budget-note')?.textContent===${JSON.stringify(BUDGET_NOTE)} && section.querySelector('[data-task-plan-edit="budget"]')?.textContent==='设置上限…' && section.querySelector('[data-task-plan-edit="budget-remove"]')===null; })()`, 'budget-offered', 10_000);
    await clickSelector(renderer, '#task-drawer [data-task-plan-edit="budget"]', 'budget-open');
    await waitFor(renderer, `(() => { const input=document.activeElement; return input instanceof HTMLInputElement && input.dataset.taskDrawerControl==='budget-input' && document.querySelector('#task-drawer label[for="'+input.id+'"]')?.textContent==='预算上限（tokens）' && document.querySelector('#task-drawer [data-task-plan-edit="budget"]')?.getAttribute('aria-expanded')==='true'; })()`, 'budget-input-focused', 10_000);
    await renderer.send('Input.insertText', { text: '五千' });
    await pressEnter(renderer);
    await waitFor(renderer, `(() => { const input=document.activeElement; return input instanceof HTMLInputElement && input.dataset.taskDrawerControl==='budget-input' && input.value==='五千' && input.getAttribute('aria-invalid')==='true' && document.querySelector('#task-drawer .task-plan-budget-error')?.textContent===${JSON.stringify(BUDGET_INVALID)} && document.querySelector('#task-drawer .task-plan-budget-edited')===null; })()`, 'budget-refused', 10_000);
    await assertRenderer(renderer, `(() => { const input=document.activeElement; if(!(input instanceof HTMLInputElement))return false; input.select(); return true; })()`, 'budget-select');
    await renderer.send('Input.insertText', { text: '5,000' });
    await pressEnter(renderer);
    await waitFor(renderer, `(() => { const block=document.querySelector('#task-drawer .task-plan-budget'); return block?.querySelector('.task-plan-budget-edited .task-plan-edit-tag')?.textContent==='你改的 · 预算上限 5,000 tokens' && block.querySelector('.task-plan-budget-form')===null && document.activeElement?.dataset?.taskPlanEdit==='budget' && document.querySelector('#task-drawer .task-bar-note')?.textContent==='你改了 1 处'; })()`, 'budget-pending', 10_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="update-plan"]', 'budget-update');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanVersion==='2' && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, 'budget-version-2', 60_000);
    const budgetPlan = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(budgetPlan?.taskIntent?.taskIntentId === fifthIntentId && budgetPlan.planVersion?.ordinal === 2 &&
      JSON.stringify(budgetPlan.planVersion.edits?.runBudgetCeiling) === JSON.stringify(BUDGET) &&
      JSON.stringify(budgetPlan.planVersion.materialInputs?.runBudgetCeiling) === JSON.stringify(BUDGET) &&
      JSON.stringify(budgetPlan.providerResolutionPlan?.runBudgetCeiling) === JSON.stringify(BUDGET) &&
      (budgetPlan.planRevision ?? null) === null && budgetPlan.planRevisions?.at(-1)?.trigger === 'plan-edit',
    'budget-version', { edits: budgetPlan?.planVersion?.edits ?? null, ceiling: budgetPlan?.providerResolutionPlan?.runBudgetCeiling ?? null, revision: budgetPlan?.planRevision ?? null });
    await assertRenderer(renderer, `(() => { const section=document.querySelector('#task-drawer [data-task-plan-section="5"]'); return section?.querySelector('dd[data-task-plan-term="预算上限"]')?.textContent==='任务运行预算上限：5,000 tokens' && section.querySelector('dd[data-task-plan-term="用量上限"]')?.textContent==='达到 5,000 tokens 后不再发送新的请求（8 个阅读范围）上限，不是预测' && section.querySelector('[data-task-plan-edit="budget-remove"]')?.textContent==='去掉上限' && document.querySelector('#task-drawer .task-plan-edit-record')?.textContent?.endsWith('：预算上限：未设置任务预算上限 → 任务运行预算上限：5,000 tokens')===true; })()`, 'budget-plan-words');

    at('budget-reached');
    // 开始任务: four ranges spend 6,620 tokens and the fifth would pass the ceiling, so it is never sent. The Run stops as
    // 已停止 · 预算已达上限 with what it read and used — 调整预算并重做 and 查看部分结果, never 续行 or 重试 — its partial revision
    // kept, and 待我处理 holds it as an exception whose next step is 调整预算并重做.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'fifth-start');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.taskIntent?.taskIntentId===${JSON.stringify(fifthIntentId)} && analysis.run?.state==='interrupted')`, 'budget-run-stopped', 180_000);
    await waitForBar(renderer, {
      state: 'budget-reached', pill: '已停止 · 预算已达上限', status: '已停止 · 预算已达上限', note: BUDGET_STOP_NOTE,
      actions: [['redo', '调整预算并重做', 'enabled', null], ['run-link', '查看部分结果', 'enabled', null]],
    }, 'budget-bar', 30_000);
    const reached = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const reachedRevision = reached?.resultSetRevision;
    requireJourney(reached?.state === 'interrupted' && reached.stateLabel === BUDGET_RUN_LABEL && reached.run?.stateLabel === BUDGET_RUN_LABEL &&
      JSON.stringify(reached.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'interrupted']) &&
      JSON.stringify(reached.run.attempt?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4]) &&
      reached.taskOutcome?.classification === 'interrupted' && reached.taskOutcome.label === '任务结果：任务运行预算已达上限 · 已保留部分结果' &&
      JSON.stringify(reached.taskOutcome.stop) === JSON.stringify({ reason: 'run-budget-ceiling-reached', maxTotalTokens: 5000, usedTokens: 6620, unitsSettled: 4, unitsTotal: SAMPLE1_UNITS }) &&
      reachedRevision?.coverage?.unitsClosed === 4 && reached.taskOutcome.resultSetRevisionId === reachedRevision.revisionId &&
      JSON.stringify(reachedRevision.gaps.map((gap) => [gap.unitOrdinal, gap.code])) === JSON.stringify([5, 6, 7, 8].map((ordinal) => [ordinal, 'not-attempted'])),
    'budget-reached-record', { state: reached?.state, run: reached?.run?.state, stop: reached?.taskOutcome?.stop ?? null, closed: reachedRevision?.coverage?.unitsClosed });
    const budgetAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(budgetAttention?.groups?.find((group) => group.key === 'exceptions')?.items?.some((entry) =>
      entry.book?.bookId === fifthBookId && entry.state === 'analysis-budget-reached' && entry.nextStep === 'adjust-budget-redo' && entry.blocked === false) === true,
    'budget-in-attention', budgetAttention?.groups ?? null);

    at('budget-partial-results');
    // 查看部分结果 opens ②A on the partial revision; its card names the stop in its own words, never 已中断's.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="run-link"]', 'budget-view-partial');
    await waitFor(renderer, `(() => { const card=document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(fifthBookId)}] .baseline-analysis-card'); return card?.dataset.analysisState==='interrupted' && card.dataset.taskOutcomeClassification==='interrupted' && card.querySelector('.analysis-state')?.textContent===${JSON.stringify(BUDGET_RUN_LABEL)} && document.querySelector('#task-drawer')?.dataset.taskPlanState==='budget-reached'; })()`, 'budget-partial-shown', 30_000);

    at('budget-redo');
    // 调整预算并重做 prepares a new Task that carries the four ranges and begins from the plan's 5,000 tokens; it opens in its
    // editing with focus on 设置上限….
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="redo"]', 'budget-redo');
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawer==='open' && typeof drawer.dataset.taskPlanRef==='string' && drawer.dataset.taskPlanRef!==${JSON.stringify(fifthIntentId)} && drawer.dataset.taskPlanState==='ready' && drawer.dataset.taskPlanVersion==='1' && drawer.dataset.taskDrawerMode==='full' && document.activeElement?.dataset?.taskPlanEdit==='budget'; })()`, 'budget-redo-opened', 120_000);
    const budgetRedo = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const budgetRedoId = budgetRedo?.taskIntent?.taskIntentId ?? '';
    requireJourney(UUID_PATTERN.test(budgetRedoId) && budgetRedoId !== fifthIntentId && budgetRedo.state === 'prepared' && (budgetRedo.run ?? null) === null &&
      budgetRedo.taskIntent.mode === 'sync-current' && budgetRedo.taskIntent.redoOf?.runRecordId === reached.run.runRecordId &&
      budgetRedo.update?.reusePlan?.counts?.reused === 4 && budgetRedo.update.reusePlan.counts.recomputed === SAMPLE1_UNITS - 4 &&
      budgetRedo.update.predecessor?.revisionId === reachedRevision.revisionId &&
      JSON.stringify(budgetRedo.planVersion?.edits?.runBudgetCeiling) === JSON.stringify(BUDGET),
    'budget-redo-task', { state: budgetRedo?.state, intent: budgetRedo?.taskIntent ?? null, counts: budgetRedo?.update?.reusePlan?.counts ?? null, edits: budgetRedo?.planVersion?.edits ?? null });
    await assertRenderer(renderer, `document.querySelector('#task-drawer .task-plan-sentence-text')?.textContent===${JSON.stringify(BUDGET_REDO_GOAL)} && document.querySelector('#task-drawer dd[data-task-plan-term="预算上限"]')?.textContent==='任务运行预算上限：5,000 tokens'`, 'budget-redo-words');

    at('j14-budget-keyboard');
    // Without a pointer: Enter on 设置上限… opens the field with focus in it; the count is typed and Enter sets it, focus back
    // on 设置上限… beside 你改的; Tab reaches 去掉上限.
    await pressEnter(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.taskDrawerControl==='budget-input'`, 'keyboard-budget-input', 10_000);
    await renderer.send('Input.insertText', { text: '20000' });
    await pressEnter(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.taskPlanEdit==='budget' && document.activeElement.matches(':focus-visible') && document.querySelector('#task-drawer .task-plan-budget-edited .task-plan-edit-tag')?.textContent==='你改的 · 预算上限 20,000 tokens' && document.querySelector('#task-drawer .task-bar-note')?.textContent==='你改了 1 处'`, 'keyboard-budget-set', 10_000);
    await pressTab(renderer);
    await waitFor(renderer, `document.activeElement?.dataset?.taskPlanEdit==='budget-remove' && document.activeElement.matches(':focus-visible')`, 'keyboard-budget-remove-reached', 10_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="update-plan"]', 'budget-redo-update');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanVersion==='2' && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, 'budget-redo-version-2', 60_000);
    const raisedPlan = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    // The stored diff line is read field by field: its record's keys come back in canonical order.
    const raisedDiff = raisedPlan?.planRevisions?.at(-1)?.diff ?? [];
    requireJourney(raisedPlan?.taskIntent?.taskIntentId === budgetRedoId && raisedPlan.planVersion?.ordinal === 2 &&
      JSON.stringify(raisedPlan.providerResolutionPlan?.runBudgetCeiling) === JSON.stringify(RAISED) &&
      raisedDiff.length === 1 && raisedDiff[0].field === 'runBudgetCeiling' && raisedDiff[0].materiality === 'edited' &&
      raisedDiff[0].prior?.maxTotalTokens === BUDGET.maxTotalTokens && raisedDiff[0].proposed?.maxTotalTokens === RAISED.maxTotalTokens,
    'budget-raised', { ceiling: raisedPlan?.providerResolutionPlan?.runBudgetCeiling ?? null, diff: raisedDiff });

    at('budget-redo-completed');
    // 开始任务: the redo reads the four ranges left, and the reduction after them, under 20,000 tokens, to its end — the
    // Book's analysis whole again, and 待我处理 no longer naming the stop.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'budget-redo-start');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.taskIntent?.taskIntentId===${JSON.stringify(budgetRedoId)} && analysis.run !== null && !['authorized','admitted','executing'].includes(analysis.run.state))`, 'budget-redo-ended', 180_000);
    const budgetDone = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(budgetDone?.state === 'settled' && budgetDone.run?.state === 'completed' && budgetDone.run.runRecordId !== reached.run.runRecordId &&
      JSON.stringify(budgetDone.run.attempt?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([5, 6, 7, 8]) &&
      budgetDone.resultSetRevision?.coverage?.unitsClosed === SAMPLE1_UNITS && (budgetDone.taskOutcome?.stop ?? null) === null &&
      budgetDone.taskOutcome?.classification === 'completed',
    'budget-redo-completed', { state: budgetDone?.state, run: budgetDone?.run?.state, spans: budgetDone?.run?.attempt?.spans?.map((span) => span.unitOrdinal), closed: budgetDone?.resultSetRevision?.coverage?.unitsClosed });
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='settled'`, 'budget-redo-shown-settled', 30_000);
    const settledAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(settledAttention?.groups?.every((group) => group.items.every((entry) => entry.state !== 'analysis-budget-reached')) === true, 'budget-left-attention', settledAttention?.groups ?? null);

    // ---- 模型服务账户限额 (Issue #51, S16b; MODEL-018, RUN-012) -------------------------------------------------------
    at('relaunch-for-account-limit');
    // A launch over the account-limit fixture: unit 4's first turn is refused on the account's limit, and its next is the
    // happy fixture's result — the provider-side condition clearing.
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    adapterFixture = ACCOUNT_LIMIT_FIXTURE_IDENTITY;
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'account-limit-ready');

    at('sixth-book-import');
    const sixthBookId = await importSample1(renderer, SIXTH_BOOK.title, true, 'sixth-import');
    requireJourney(![bookId, secondBookId, thirdBookId, fourthBookId, fifthBookId].includes(sixthBookId), 'six-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'sixth-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'sixth-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'sixth-artifact-enabled');
    await click(renderer, '返回图书列表', 'sixth-return-library');

    at('account-limit-stop');
    // 开始任务: ranges 1 to 3 are read, and the model service refuses the fourth on the account's limit. The Run stops at that
    // boundary — 模型服务账户限额 in its own words, never 任务已中断 · 可续行's — keeping three ranges and holding nothing:
    // 处理模型服务 and 续行, beside 取消任务, 改计划重做 and 查看运行; ②A's card says the same, and 待我处理 holds it as an
    // exception whose next step is 处理模型服务.
    await openAnalysisOf(renderer, sixthBookId, 'sixth-analysis');
    await startFirstBaseline(renderer, 'ready', 'sixth-baseline');
    const sixthIntentId = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanRef ?? ''`);
    requireJourney(UUID_PATTERN.test(sixthIntentId), 'sixth-task');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.taskIntent?.taskIntentId===${JSON.stringify(sixthIntentId)} && analysis.run?.state==='resumable')`, 'account-limit-stopped', 180_000);
    await waitForBar(renderer, {
      state: 'account-limit', pill: '模型服务账户限额', status: '模型服务账户限额', note: ACCOUNT_LIMIT_NOTE,
      actions: [['connect', '处理模型服务', 'enabled', null], ['resume', '续行', 'enabled', null], ['cancel-run', '取消任务', 'enabled', null], ['redo', '改计划重做', 'enabled', null], ['run-link', '查看运行', 'enabled', null]],
    }, 'account-limit-bar', 30_000);
    const limited = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(limited?.state === 'resumable' && limited.stateLabel === '模型服务账户限额' && limited.run?.stateLabel === '模型服务账户限额' &&
      JSON.stringify(limited.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'resumable']) &&
      JSON.stringify(limited.run.attempt?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4]) &&
      (limited.taskOutcome ?? null) === null && (limited.resultSetRevision ?? null) === null,
    'account-limit-record', { state: limited?.state, label: limited?.stateLabel, transitions: limited?.run?.transitions?.map((transition) => transition.state), spans: limited?.run?.attempt?.spans?.map((span) => span.unitOrdinal) });
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='resumable' && document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='模型服务账户限额'`, 'account-limit-card', 30_000);
    const limitAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(limitAttention?.groups?.find((group) => group.key === 'exceptions')?.items?.some((entry) =>
      entry.book?.bookId === sixthBookId && entry.state === 'analysis-account-limit' && entry.nextStep === 'resolve-model-service' && entry.blocked === true) === true,
    'account-limit-in-attention', limitAttention?.groups ?? null);

    at('account-limit-resolve');
    // 处理模型服务 opens 设置 › 模型服务, where the connection is; nothing about the Run moves. Back in ②A, the plan still reads
    // 模型服务账户限额 with 续行.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="connect"]', 'account-limit-resolve');
    await waitFor(renderer, `document.querySelector('.model-service-settings')!==null`, 'account-limit-settings', 30_000);
    const whileAway = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(whileAway?.run?.state === 'resumable' && JSON.stringify(whileAway.run.transitions) === JSON.stringify(limited.run.transitions), 'account-limit-unmoved');
    await click(renderer, '返回', 'account-limit-settings-back');
    await openAnalysisOf(renderer, sixthBookId, 'account-limit-return');
    await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', 'account-limit-open-plan');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='account-limit' && document.querySelector('#task-drawer [data-task-drawer-control="resume"]')?.disabled===false`, 'account-limit-plan-again', 30_000);

    at('account-limit-resumed');
    // 续行 once the limit cleared: the same Run and attempt go on from the fourth range — its second turn — to the end; the
    // three kept ranges are not read again, and 待我处理 no longer holds the Book.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="resume"]', 'account-limit-resume');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.taskIntent?.taskIntentId===${JSON.stringify(sixthIntentId)} && analysis.run !== null && !['resumable','admitted','executing'].includes(analysis.run.state))`, 'account-limit-run-ended', 180_000);
    const resumedRun = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(resumedRun?.state === 'settled' && resumedRun.run?.state === 'completed' && resumedRun.run.runRecordId === limited.run.runRecordId &&
      JSON.stringify(resumedRun.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'resumable', 'admitted', 'executing', 'completed']) &&
      JSON.stringify(resumedRun.run.attempt?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4, 4, 5, 6, 7, 8]) &&
      resumedRun.run.attempt?.attemptId === limited.run.attempt?.attemptId &&
      resumedRun.resultSetRevision?.coverage?.unitsClosed === SAMPLE1_UNITS && resumedRun.taskOutcome?.classification === 'completed',
    'account-limit-resumed-run', { state: resumedRun?.state, run: resumedRun?.run?.state, transitions: resumedRun?.run?.transitions?.map((transition) => transition.state), spans: resumedRun?.run?.attempt?.spans?.map((span) => span.unitOrdinal) });
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='settled'`, 'account-limit-shown-settled', 30_000);
    const clearedAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(clearedAttention?.groups?.every((group) => group.items.every((entry) => entry.state !== 'analysis-account-limit')) === true, 'account-limit-left-attention', clearedAttention?.groups ?? null);

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
