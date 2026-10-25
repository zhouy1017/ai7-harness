import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, journeyCheckFailure, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect, SIDEBAR, sidebarNavigate, SIDEBAR_LIBRARY_READY, runJ14DarkPass } from './controller.mjs';
import { assertSecretsAbsentFromDataRoot, recoverSyntheticCredentialCleanupState, removeSyntheticCredentialWithElectron } from './credential-cleanup.mjs';

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
// its place free. 续行 goes on in the same Run from the fourth range, and with the sixth in flight 取消任务 opens one
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
// keyboard alone — 再试一次 with a note — while two other Runs hold every place, the answer stays unapplied. After
// another restart the Run reads 任务已中断 · 可续行 and sends nothing; 续行 retries unit 5 as its second attempt to its end.
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
//
// On the seventh Book (#1080), unit 4's sent request has an unknown result. An explicit pause keeps the checkpoint and
// the cancellation preview still pages it correctly; continuation reads only the remaining units. The Run completes with
// unit 4 as a gap, its revision and outcome recorded, and no resend. The drawer and attention name 该单元结果未知.
//
// On the eighth Book, launched over the reduction fixture (Issue #757), every range is read and the cross-unit reduction's
// request is sent and its answer never comes back whole: the Run completes, and 待我处理 holds it in 异常与结果待确认 with
// 查看未确认的部分 as its next step. That opens ②A with the plan in the drawer, where the reduction is listed; 保留为缺口
// records the editor's determination and nothing else — the revision and the report stay as they were — and 待我处理 no longer
// holds it.
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
const SEVENTH_BOOK = Object.freeze({ title: '结果待确认旅程' });
/** The seventh Book's launch (Issue #51, S16c): unit 4's first request is sent and its answer never comes back whole. */
const OUTCOME_UNKNOWN_FIXTURE_IDENTITY = 'sample1-baseline-outcome-unknown';
const EIGHTH_BOOK = Object.freeze({ title: '归纳结果待确认旅程' });
/** The eighth Book's launch (Issue #757): every range is read, and the reduction's request is sent and never answers whole. */
const REDUCTION_UNKNOWN_FIXTURE_IDENTITY = 'sample1-baseline-reduction-unknown';
const UNCONFIRMED_REASON = '运行已结束，但有请求已发出而回答没有完整传回，无法确认模型服务是否已处理并计费；这些部分记为结果待确认的缺口，AI7 没有自动再发。';
// Only a step is listed, so the statement names no later re-send (#763 review).
const UNCONFIRMED_STATEMENT = '跨单元归纳的请求已发出，但回答没有完整传回，无法确认模型服务是否已处理并计费；运行已结束，这些部分在结果里记为结果待确认的缺口，AI7 没有自动再发。' +
  '保留为缺口只记下你的确认：不发送任何内容，不改变结果。';
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
const CANCELLING_NOTE = '已记下你的取消；正在进行的这一步会被中止，此后不会再发送任何内容';
const PAUSING_NOTE = '已记下你的暂停；正在进行的这一步完成后停下，不再开始下一步，结果与用量都会保存';
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
const IMPACT = Object.freeze([[
  `停在正在读的第 6 个阅读范围；其余 ${SAMPLE1_UNITS - 6} 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。`,
  '已读完的 5 个阅读范围和正在读的这一个的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
  '这项分析不改稿，没有需要撤回的受控动作。',
  '正在等待的那一轮模型请求会被中止；回答已传回的照常计入，否则该阅读范围记为结果未知的缺口，不会再发。',
].join('')]);
const REFLECTION_CANCELLED = '运行已按你的要求取消，运行反思未发起。';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const BROWSER_CLOSE_TIMEOUT = journeyCheckFailure('J-10', 'browser-close-timeout');

let location = 'entry';
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-10', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = journeyCheckFailure('J-10', name);
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
    server.once('error', () => rejectListen(journeyCheckFailure('J-10', 'loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' && Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw journeyCheckFailure('J-10', 'loopback-address');
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
    if (response.error) completion.reject(journeyCheckFailure('J-10', 'renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(journeyCheckFailure('J-10', 'renderer-cdp-timeout')); }, 60_000);
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
  throw journeyCheckFailure('J-10', name);
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
/** A checkbox is an input, not a button; use its native click so checked/change follow the product path. */
async function clickNotificationSwitch(renderer, key, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector('[data-notification-preference="' + ${JSON.stringify(key)} + '"]'); if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox' || input.disabled) return false; input.click(); return true; })()`, name);
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
  await assertRenderer(renderer, SIDEBAR_LIBRARY_READY, 'sidebar-library-entry');
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
  await assertRenderer(renderer, sidebarNavigate(SIDEBAR.section('analysis')), `${name}-analysis-entry`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(bookId)}] .baseline-analysis-card')`, `${name}-analysis`);
}

/** Return through 待我处理 to the library without stopping another Book's Run. */
async function toLibrary(renderer, name) {
  await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('attention')), `${name}-attention`);
  await waitFor(renderer, `document.querySelector('[data-screen="global-attention"] .global-attention-host')`, `${name}-attention-ready`);
  await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), `${name}-library`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
}

/** Reuse an already analysed Book as a holder of one place, using only its own reanalysis controls. */
async function holdReanalysis(renderer, bookId, name) {
  await toLibrary(renderer, name);
  await openAnalysisOf(renderer, bookId, name);
  await clickSelector(renderer, '.baseline-analysis-card [data-analysis-tab="history"]', `${name}-history`);
  await clickSelector(renderer, '.baseline-analysis-card [data-analysis-action="choose-reanalyze-book"]', `${name}-choose`);
  await clickSelector(renderer, '.baseline-analysis-card [data-analysis-action="reanalyze-book"]', `${name}-prepare`);
  await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, `${name}-prepared`);
  const showing = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskDrawer==='open' && document.querySelector('#task-drawer')?.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId`);
  if (!showing) await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', `${name}-open-plan`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId && document.querySelector('#task-drawer')?.dataset.taskPlanStart==='ready' && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, `${name}-ready`);
  await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', `${name}-start`);
  await waitFor(renderer, runningWith(0), `${name}-held`);
  const held = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
  requireJourney(held?.bookId === bookId && held.taskIntent?.mode === 'reanalyze-book' && held.run?.state === 'executing' &&
    held.run.progress?.unitsSettled === 0 && held.run.progress.currentUnitOrdinal === 1 &&
    UUID_PATTERN.test(held.run.runRecordId ?? ''), `${name}-record`);
  return held;
}

/**
 * 开始基线稿件分析 prepares the Task and opens its plan in the drawer (the card's 查看计划并开始 opens it when it
 * does not); the bar's 开始任务 records the Run — and, with a route, hands it to the execution owner's governor.
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
  ['cancel-run', '停止任务', 'enabled', null],
  ['redo', '改计划重做', 'disabled', REDO_REASON],
  ['run-link', '查看运行', 'enabled', null],
]);
/** The bar of a stopped Run that can go on (CONT-015): 续行 first, then 取消任务, 改计划重做 and the way to the Run. */
const STOPPED_ACTIONS = Object.freeze([
  ['resume', '续行', 'enabled', null],
  ['cancel-run', '停止任务', 'enabled', null],
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
      throw journeyCheckFailure('J-10', 'browser-close-unconfirmed');
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
    if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-10', 'browser-cleanup-failed');
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        credentialCleanupFailure ??= error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        const closedForRetry = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-10', 'browser-cleanup-failed');
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
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-10', 'browser-cleanup-failed');
        const closedForFallback = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-10', 'browser-cleanup-failed');
        if (closedForFallback && credentialReferenceForCleanup === undefined && dataRoot !== undefined && runRoot !== undefined) {
          try {
            const recovered = await recoverSyntheticCredentialCleanupState('J-10', dataRoot, runRoot);
            if (recovered.kind === 'not-started' || recovered.kind === 'removed') credentialRemoved = true;
            else credentialReferenceForCleanup = recovered.credentialReference;
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
        if (closedForFallback && !credentialRemoved && credentialReferenceForCleanup !== undefined) {
          try {
            requireJourney(electronExecutableForCleanup !== undefined, 'credential-direct-cleanup-executable');
            await removeSyntheticCredentialWithElectron('J-10', electronExecutableForCleanup, productEnvironment(electronExecutableForCleanup), credentialReferenceForCleanup);
            credentialRemoved = true;
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
      }
    }
    if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-10', 'browser-cleanup-failed');
    const browserClosed = await closeOwnedBrowserForCleanup();
    if (!browserClosed) throw cleanupFailure ?? journeyCheckFailure('J-10', 'browser-cleanup-failed');
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    try { await ownedLoopback?.close(); } catch (error) { cleanupFailure ??= error; }
    loopback = undefined;
    if (credentialMutationReached && !credentialRemoved) {
      throw credentialCleanupFailure ?? journeyCheckFailure('J-10', 'credential-cleanup-failed');
    }
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        try { await assertSecretsAbsentFromDataRoot('J-10', dataRoot, [syntheticSecret]); } catch (error) { cleanupFailure ??= error; }
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

    at('notification-settings');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.settings), 'notification-settings-hub');
    await clickSelector(renderer, '[data-settings-route="notifications"]', 'notification-settings-open');
    await waitFor(renderer, `document.querySelector('[data-screen="notifications"] [data-notification-settings]')`, 'notification-settings-shown');
    await assertRenderer(renderer, `document.querySelector('#context-title')?.textContent==='设置' && document.querySelector('#context-position')?.textContent==='本机 · 通知'`, 'notification-settings-place');
    await assertRenderer(renderer, `(() => { const switches = [...document.querySelectorAll('[data-notification-preference]')]; return switches.length === 4 && switches.every((control) => !control.checked) && document.querySelector('[data-notification-preference="notifications.completions"]').disabled && document.querySelector('[data-nav-settings="hub"]')?.getAttribute('aria-current') === 'page'; })()`, 'notification-settings-defaults');
    await clickNotificationSwitch(renderer, 'notifications.enabled', 'notification-settings-enable');
    await waitFor(renderer, `document.querySelector('[data-notification-preference="notifications.completions"]')?.disabled === false`, 'notification-completions-enabled');
    await assertRenderer(renderer, `window.ai7.getPreferences().then((preferences) => preferences.values['notifications.enabled'] === true)`, 'notification-settings-saved');
    await clickNotificationSwitch(renderer, 'notifications.enabled', 'notification-settings-disable');
    await waitFor(renderer, `document.querySelector('[data-notification-preference="notifications.completions"]')?.disabled === true`, 'notification-completions-disabled');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'notification-return-library');

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
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'model-return-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'model-library');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.settings), 'model-open-settings');
    await waitFor(renderer, `document.querySelector('[data-screen="settings"]')`, 'model-open-settings-hub');
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
    // J-14 dark pass (#935): 深色 through 设置 › 外观, this screen checked, then 跟随系统 again; back through the sidebar.
    await runJ14DarkPass({ renderer, journey: 'J-10', at, representative: '#screen[data-screen="book-analysis"] > .panel', returnTo: SIDEBAR.section('analysis') });
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(bookId)}] .baseline-analysis-card')`, 'analysis-after-dark-pass');
    await startFirstBaseline(renderer, 'ready', 'baseline');
    await waitFor(renderer, runningWith(FIRST_HOLD), 'third-range-in-flight', 180_000);
    const executing = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const taskIntentId = executing?.taskIntent?.taskIntentId ?? '';
    requireJourney(UUID_PATTERN.test(taskIntentId) && executing.bookId === bookId && executing.state === 'executing' && executing.run?.state === 'executing' &&
      executing.run.progress?.unitsSettled === FIRST_HOLD && executing.run.progress.currentUnitOrdinal === FIRST_HOLD + 1 && executing.run.progress.unitsTotal === SAMPLE1_UNITS &&
      executing.run.progress.inFlightUnits === undefined,
    'run-executing-record', { state: executing?.state, run: executing?.run?.state, progress: executing?.run?.progress });
    const running = await renderer.evaluate(READ_DRAWER);
    requireJourney(running?.ref === taskIntentId && running.kind === 'baseline-analysis' && running.start === 'started' && running.pill === '运行中' && running.status === '运行中', 'drawer-follows-the-run', running);

    at('activity-card');
    // AUTH-011: the phase, the range in flight, the time on it and since the Run began, the attempt, the last
    // update and the milestones, each a fact the Run holds; nothing is estimated.
    const rows = running.activity?.rows ?? {};
    // #1131 retains the v1 fixture's six scalar rows. Governed production lists are service-stub proof, not this Journey's authority.
    requireJourney(Object.keys(rows).length === 6 && running.activity?.title === '运行动态' && rows['阶段'] === '正在逐个阅读范围分析' && rows['当前'] === `第 3 个阅读范围（共 ${SAMPLE1_UNITS} 个）` &&
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
      pausing.run.transitions.at(-1)?.detail === '编辑暂停了这项任务；正在进行的这一步完成后停下，不再开始下一步，已完成的结果与用量都会保存。' &&
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
    // 已暂停 with where 续行 will go on — and 续行 is offered, since a place of the governor is free.
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
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'second-return-library');

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
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.section('overview')), 'third-overview');
    await waitFor(renderer, `Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='返回图书列表'&&!button.disabled)`, 'third-overview-ready');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'third-library');
    const thirdBookId = await importSample1(renderer, THIRD_BOOK.title, true, 'third-import');
    requireJourney(thirdBookId !== bookId && thirdBookId !== secondBookId, 'three-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'third-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'third-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'third-artifact-enabled');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'third-return-library');

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
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'fourth-return-library');

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
      actions: [['cancel-run', '停止任务', 'enabled', null], ['redo', '改计划重做', 'enabled', null], ['run-link', '查看运行', 'enabled', null]],
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

    at('clarification-places-held');
    // development-ci has two places. Hold both with existing Books, so answering cannot dispatch the retry. The hold
    // stays in force through closing AI7; there is no capacity override, extra import, or product hook (Issue #779).
    const holdersStartedAt = performance.now();
    await writeFile(holdPath, '0', 'utf8');
    const firstHolder = await holdReanalysis(renderer, bookId, 'clarification-holder-a');
    const secondHolder = await holdReanalysis(renderer, secondBookId, 'clarification-holder-b');
    const holders = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(firstHolder.run.runRecordId !== secondHolder.run.runRecordId && [bookId, secondBookId].every((id) =>
      holders?.groups?.find((group) => group.key === 'active')?.items?.some((item) =>
        item.book?.bookId === id && item.state === 'analysis-running' && item.facts?.progress?.unitsSettled === 0) === true),
    'clarification-every-place-held');
    await toLibrary(renderer, 'clarification-return');
    await openAnalysisOf(renderer, fourthBookId, 'clarification-return');
    await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', 'clarification-return-plan');
    await waitFor(renderer, `document.querySelector('#task-drawer .task-drawer-questions [data-clarification-state="open"]')`, 'clarification-return-question');
    const holdersSetupMs = performance.now() - holdersStartedAt;

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
    // Enter on 提交回答 records 再试一次 and the note while both places are busy; unit 5 is not retried yet.
    await pressEnter(renderer);
    await waitFor(renderer, `window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(fourthIntentId)} }).then((plan)=>plan?.clarifications?.[0]?.state==='answered')`, 'queued-answer-recorded');
    const queuedAnswer = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(fourthIntentId)} })`);
    const queuedRun = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(queuedAnswer.clarifications[0].answer?.optionId === 'retry' && queuedAnswer.clarifications[0].answer.note === QUESTION_NOTE &&
      queuedRun?.run?.runRecordId === waitingRun.run.runRecordId && queuedRun.run.state === 'awaiting-clarification' &&
      JSON.stringify(queuedRun.run.transitions) === JSON.stringify(waitingRun.run.transitions) &&
      JSON.stringify(queuedRun.run.attempt) === JSON.stringify(waitingRun.run.attempt), 'queued-answer-sends-nothing');

    at('answered-clarification-survives-restart');
    const answeredRestartStartedAt = performance.now();
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    // On close both holders stop as resumable. Release the hold before launch, so a forbidden automatic continuation
    // cannot hide behind it: a retry would record a ninth span or finish, failing the checks below.
    await writeFile(holdPath, 'release', 'utf8');
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'answered-restart-ready');
    const stoppedHolders = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney([firstHolder, secondHolder].every((held) => stoppedHolders?.groups?.find((group) => group.key === 'active')?.items?.some((item) =>
      item.itemId === `analysis:${held.taskIntent.taskIntentId}` && item.book?.bookId === held.bookId && item.state === 'analysis-resumable') === true),
    'answered-restart-holders-stopped');
    await openAnalysisOf(renderer, fourthBookId, 'answered-restart');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='resumable' && document.querySelector('.baseline-analysis-card .analysis-state')?.textContent==='任务已中断 · 可续行'`, 'answered-restart-card');
    await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', 'answered-restart-plan');
    await waitForBar(renderer, {
      state: 'resumable', pill: '任务已中断 · 可续行', status: '任务已中断 · 可续行',
      note: '已读完 7 / 8 个阅读范围，结果都已保存；续行时先按你的回答处理第 5 个，再继续未完成的部分，不重复已读完的部分', actions: STOPPED_ACTIONS,
    }, 'answered-restart-bar');
    await waitFor(renderer, `document.querySelector('#task-drawer .task-plan-clarification-record li[data-clarification-state="answered"] .task-plan-clarification-answer')?.textContent?.startsWith(${JSON.stringify(`你已回答：再试一次 · 说明：${QUESTION_NOTE}（`)}) === true && document.querySelector('#task-drawer .task-drawer-questions [data-task-plan-clarification]')===null`, 'answered-restart-answer-shown');
    const answeredRestart = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const keptAnswer = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'baseline-analysis', ref: ${JSON.stringify(fourthIntentId)} })`);
    requireJourney(answeredRestart?.run?.state === 'resumable' && answeredRestart.run.runRecordId === queuedRun.run.runRecordId &&
      JSON.stringify(answeredRestart.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'awaiting-clarification', 'resumable']) &&
      JSON.stringify(answeredRestart.run.attempt) === JSON.stringify(queuedRun.run.attempt) &&
      JSON.stringify(keptAnswer.clarifications[0].answer) === JSON.stringify(queuedAnswer.clarifications[0].answer) &&
      answeredRestart.planEnvelope?.digest === queuedRun.planEnvelope?.digest && (answeredRestart.taskOutcome ?? null) === null,
    'answered-restart-keeps-answer-and-attempt');
    await new Promise((settle) => setTimeout(settle, 500));
    const noSend = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(noSend?.run?.state === 'resumable' && JSON.stringify(noSend.run.transitions) === JSON.stringify(answeredRestart.run.transitions) &&
      JSON.stringify(noSend.run.attempt) === JSON.stringify(queuedRun.run.attempt), 'answered-restart-sends-nothing');
    recordDebugDetail('J-10', `answered-clarification-added-ms ${Math.round(holdersSetupMs + performance.now() - answeredRestartStartedAt)}`);

    at('answered-clarification-resumed');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="resume"]', 'answered-restart-resume');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>(analysis?.run?.transitions?.length ?? 0) > ${answeredRestart.run.transitions.length} && !['resumable','awaiting-clarification','admitted','executing'].includes(analysis.run.state))`, 'answered-run-ended', 180_000);
    const answeredRun = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const answeredRevision = answeredRun?.resultSetRevision;
    requireJourney(answeredRun?.state === 'settled' && answeredRun.run?.state === 'completed-with-gaps' &&
      answeredRun.run.runRecordId === queuedRun.run.runRecordId && answeredRun.run.attempt?.attemptId === queuedRun.run.attempt.attemptId &&
      answeredRun.planEnvelope?.digest === queuedRun.planEnvelope?.digest &&
      JSON.stringify(answeredRun.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'awaiting-clarification', 'resumable', 'admitted', 'executing', 'completed-with-gaps']) &&
      JSON.stringify(answeredRun.run.attempt?.spans?.map((span) => [span.unitOrdinal, span.attemptIndex])) === JSON.stringify([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [5, 2]]) &&
      answeredRevision?.coverage?.unitsClosed === 7 && JSON.stringify(answeredRevision.gaps.map((gap) => gap.unitOrdinal)) === '[2]' &&
      answeredRun.run.adaptations?.length === 1 && answeredRun.run.adaptations[0].unitOrdinal === 5 &&
      answeredRun.run.adaptations[0].failureCode === 'PROVIDER_ERROR' && answeredRun.run.adaptations[0].failureStatus === 503 && typeof answeredRun.run.adaptations[0].clarificationAnswerId === 'string',
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
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'fifth-return-library');

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
    await assertRenderer(renderer, `(() => { const timing=document.querySelector('#task-drawer select[data-task-start-when]'); if(!(timing instanceof HTMLSelectElement)||timing.value!=='now')return false; timing.value='idle'; timing.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`, 'budget-deferred-start-choice');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'fifth-start');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.taskIntent?.taskIntentId===${JSON.stringify(fifthIntentId)} && analysis.run?.state==='interrupted')`, 'budget-run-stopped', 180_000);
    const idleBudgetRun = await renderer.evaluate('window.ai7.inspectBaselineAnalysis()');
    requireJourney(idleBudgetRun.authorization?.startWhen === 'idle' && idleBudgetRun.planVersion?.materialInputs.runBudgetCeiling.maxTotalTokens === BUDGET.maxTotalTokens, 'deferred-budget-still-frozen');
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
    // The quiet completion notice (Issue #937; NOTIF-003): a focused window, and a probe that records each showing and hiding
    // of the one notice, so its six seconds are read from the page and not raced by the steps below.
    await renderer.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const beforeQuietCompletion = await renderer.evaluate(`window.ai7.inspectGlobalAttention().then((projection) => ({ count: projection.actionableCount, stop: projection.groups.some((group) => ['exceptions', 'decisions'].includes(group.key) && group.items.some((item) => item.book.bookId === ${JSON.stringify(fifthBookId)} && item.state === 'analysis-budget-reached')) }))`);
    await waitFor(renderer, `document.querySelector('[data-quiet-completion-notice]')?.hidden === true`, 'quiet-completion-idle', 10_000);
    await assertRenderer(renderer, `(() => { const notice = document.querySelector('[data-quiet-completion-notice]'); if (!notice || !notice.hidden) return false; const probe = { shown: [], hiddenAt: null }; const observer = new MutationObserver(() => { const visible = !notice.hidden; const last = probe.shown.at(-1); if (visible && (last === undefined || last.hiddenAt !== null)) probe.shown.push({ at: performance.now(), hiddenAt: null, noticeClass: notice.dataset.noticeClass ?? null, text: notice.querySelector('[role="status"]')?.textContent ?? null }); if (!visible && last !== undefined && last.hiddenAt === null) last.hiddenAt = performance.now(); }); observer.observe(notice, { attributes: true, childList: true, characterData: true, subtree: true }); globalThis.__j10QuietNotice = { probe, stop: () => observer.disconnect() }; return true; })()`, 'quiet-completion-probe');
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

    at('quiet-completion-notice');
    // One notice, in Task Outcome words (never 任务已完成), dismissed by itself within its six seconds; the completion stays in
    // 最近完成 and adds nothing to the count — it falls only by the stop the redo settled, if that was still counted.
    await waitFor(renderer, `globalThis.__j10QuietNotice.probe.shown.length > 0`, 'quiet-completion-shown', 30_000);
    await waitFor(renderer, `globalThis.__j10QuietNotice.probe.shown.at(-1).hiddenAt !== null`, 'quiet-completion-dismissed', 10_000);
    const quietCompletion = await renderer.evaluate(`window.ai7.inspectGlobalAttention().then((projection) => { const { probe, stop } = globalThis.__j10QuietNotice; stop(); delete globalThis.__j10QuietNotice; return { count: projection.actionableCount, recent: projection.groups.find((group) => group.key === 'recent')?.items.some((item) => item.book.bookId === ${JSON.stringify(fifthBookId)} && item.state === 'analysis-completed') ?? false, notices: document.querySelectorAll('[data-quiet-completion-notice]').length, shown: probe.shown.map((entry) => ({ noticeClass: entry.noticeClass, text: entry.text, ms: Math.round(entry.hiddenAt - entry.at) })) }; })`);
    const quietShown = quietCompletion.shown[0];
    requireJourney(quietCompletion.notices === 1 && quietCompletion.shown.length === 1 && quietShown.noticeClass === 'analysis-completed' && quietShown.text === '任务结果已记录' &&
      quietShown.ms >= 5_500 && quietShown.ms <= 8_000 && quietCompletion.recent === true &&
      quietCompletion.count === beforeQuietCompletion.count - (beforeQuietCompletion.stop ? 1 : 0),
    'quiet-completion-notice', { before: beforeQuietCompletion, after: quietCompletion });
    await renderer.send('Emulation.setFocusEmulationEnabled', { enabled: false });

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
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'sixth-return-library');

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
      actions: [['connect', '处理模型服务', 'enabled', null], ['resume', '续行', 'enabled', null], ['cancel-run', '停止任务', 'enabled', null], ['redo', '改计划重做', 'enabled', null], ['run-link', '查看运行', 'enabled', null]],
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

    // ---- 结果待确认 (Issue #51, S16c; CTRL-007, COPY-009, CONT-016) ---------------------------------------------------------
    at('relaunch-for-outcome-unknown');
    // A launch over the outcome-unknown fixture, which only J-10 may bind: unit 4's first request is sent and its answer
    // never comes back whole, and its next turn is the happy fixture's result.
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    adapterFixture = OUTCOME_UNKNOWN_FIXTURE_IDENTITY;
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'outcome-unknown-ready');

    at('seventh-book-import');
    const seventhBookId = await importSample1(renderer, SEVENTH_BOOK.title, true, 'seventh-import');
    requireJourney(![bookId, secondBookId, thirdBookId, fourthBookId, fifthBookId, sixthBookId].includes(seventhBookId), 'seven-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'seventh-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'seventh-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'seventh-artifact-enabled');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'seventh-return-library');

    at('outcome-unknown-paused-checkpoint');
    // Pause explicitly after the unknown fourth unit; it is kept once and is never read again by continuation.
    await writeFile(holdPath, '4', 'utf8');
    await openAnalysisOf(renderer, seventhBookId, 'seventh-analysis');
    await startFirstBaseline(renderer, 'ready', 'seventh-baseline');
    const seventhIntentId = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanRef ?? ''`);
    requireJourney(UUID_PATTERN.test(seventhIntentId), 'seventh-task');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.run?.progress?.unitsSettled===4 && analysis.run.progress.currentUnitOrdinal===5)`, 'unknown-fifth-in-flight', 180_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="pause"]', 'unknown-pause');
    await writeFile(holdPath, 'release', 'utf8');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='paused'`, 'unknown-explicitly-paused', 30_000);
    const unconfirmed = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(unconfirmed?.run?.state === 'paused' && unconfirmed.run.progress === null &&
      (unconfirmed.taskOutcome ?? null) === null && (unconfirmed.resultSetRevision ?? null) === null,
    'unknown-pause-keeps-checkpoint');

    at('cancel-impact-paging');
    // Force the minimum inline page of this real stopped Run's read-only projection. The built drawer and real
    // getTaskPlanPage remain the subject: no replacement UI, fabricated model result or durable record is installed.
    // Extreme derivation, 50-detail defaults, byte cuts and complete traversal are exercised by task-plan-wire.test.ts.
    const pagingPlan = await renderer.evaluate(`window.ai7.inspectTaskPlan({kind:'baseline-analysis',ref:${JSON.stringify(seventhIntentId)}})`);
    const pagingLines = pagingPlan.runControl.cancel.impact;
    requireJourney(pagingLines.length === 2, 'cancel-paging-two-entries');
    const pagingDigest = createHash('sha256').update(JSON.stringify(pagingLines)).digest('hex');
    await assertRenderer(renderer, `(() => {
      const original = Promise.prototype.then;
      globalThis.__j10RestoreCancelPaging = () => { Promise.prototype.then = original; delete globalThis.__j10RestoreCancelPaging; };
      Promise.prototype.then = function (fulfilled, rejected) {
        return original.call(this, typeof fulfilled !== 'function' ? fulfilled : (value) => {
          if (value?.kind === 'baseline-analysis' && value.ref === ${JSON.stringify(seventhIntentId)} && value.runControl?.cancel?.impact?.length === 2) {
            value = { ...value, runControl: { ...value.runControl, cancel: { ...value.runControl.cancel, impact: value.runControl.cancel.impact.slice(0, 1) } },
              listPages: { ...value.listPages, 'runControl.cancel.impact': { shown: 1, total: 2, nextOrdinal: 1, digest: ${JSON.stringify(pagingDigest)} } } };
          }
          return fulfilled(value);
        }, rejected);
      };
      return true;
    })()`, 'cancel-paging-minimum-wire');
    try {
      for (const attempt of ['first', 'reopened']) {
        await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', `cancel-paging-${attempt}-close`);
        await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', `cancel-paging-${attempt}-open`);
        await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='paused'`, `cancel-paging-${attempt}-ready`);
        await clickSelector(renderer, '#task-drawer [data-task-drawer-control="cancel-run"]', `cancel-paging-${attempt}-impact`);
        await waitFor(renderer, `(() => {
          const impact = document.querySelector('#task-drawer-cancel-impact');
          const more = impact?.querySelector('[data-task-drawer-control="page-runControl-cancel-impact"]');
          return impact?.querySelector('[data-cancel-impact-count]')?.textContent === '取消影响说明 · 已显示 1 / 2 条' &&
            impact.querySelectorAll('li').length === 1 && more?.textContent === '继续读取取消影响说明（已显示 1 / 2）' &&
            impact.querySelector('li').textContent.includes('已读完 4 个阅读范围') &&
            impact.querySelector('li').textContent.includes('结果未知 1 个') &&
            impact.querySelector('li').textContent.includes('没有需要撤回的受控动作') && document.activeElement === impact.querySelector('h4');
        })()`, `cancel-paging-${attempt}-summary`);
        await pressTab(renderer);
        await waitFor(renderer, `document.activeElement?.dataset?.taskDrawerControl === 'page-runControl-cancel-impact' && document.activeElement.matches(':focus-visible')`, `cancel-paging-${attempt}-keyboard`);
        await pressEnter(renderer);
        await waitFor(renderer, `(() => {
          const impact = document.querySelector('#task-drawer-cancel-impact');
          return impact?.querySelector('[data-cancel-impact-count]')?.textContent === '取消影响说明 · 已显示 2 / 2 条' &&
            impact.querySelectorAll('li').length === 2 && impact.querySelectorAll('li')[1].textContent === ${JSON.stringify('第 4 个阅读范围的请求已发出、结果未知；不会再发，在这份修订版里记为结果未知的单元缺口，不记为未尝试。')} &&
            !impact.querySelector('[data-task-drawer-control="page-runControl-cancel-impact"]') && document.activeElement === impact.querySelector('h4');
        })()`, `cancel-paging-${attempt}-complete`);
      }
      await clickSelector(renderer, '#task-drawer [data-task-drawer-control="keep-running"]', 'cancel-paging-leave-confirmation');
    } finally {
      await renderer.evaluate(`globalThis.__j10RestoreCancelPaging?.()`);
    }
    const afterPaging = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(afterPaging.run) === JSON.stringify(unconfirmed.run) &&
      JSON.stringify(afterPaging.authorization) === JSON.stringify(unconfirmed.authorization) &&
      JSON.stringify(afterPaging.planVersions) === JSON.stringify(unconfirmed.planVersions) &&
      afterPaging.taskOutcome === null && afterPaging.resultSetRevision === null, 'cancel-paging-records-nothing');

    at('outcome-unknown-completes-per-unit');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="resume"]', 'unknown-resume-other-units');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='settled'`, 'unknown-run-completed', 180_000);
    const completedUnknown = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(completedUnknown?.state === 'settled' && completedUnknown.run?.state === 'completed-with-gaps' &&
      completedUnknown.taskOutcome?.classification === 'completed-with-gaps' &&
      completedUnknown.resultSetRevision?.coverage?.unitsClosed === 7 &&
      JSON.stringify(completedUnknown.resultSetRevision.gaps.map((gap) => [gap.unitOrdinal, gap.code])) === '[[4,"outcome-unknown"]]' &&
      JSON.stringify(completedUnknown.run.attempt.spans.map((span) => span.unitOrdinal)) === '[1,2,3,4,5,6,7,8]' &&
      completedUnknown.run.adaptations.length === 0,
    'unknown-unit-gap-with-revision-and-outcome');
    await waitFor(renderer, `document.querySelector('#task-drawer .task-plan-unconfirmed h4')?.textContent==='该单元结果未知' && document.querySelector('#task-drawer [data-task-drawer-control="resume"]')===null && document.querySelector('#task-drawer [data-task-drawer-control="cancel-run"]')===null`, 'unknown-unit-ui', 30_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="view-unconfirmed-record"]', 'unknown-unit-view');
    await waitFor(renderer, `document.querySelector('#task-drawer .task-plan-unconfirmed li')?.textContent==='第 4 个阅读范围 · 请求已发出 · 回答没有完整传回'`, 'unknown-unit-listed', 30_000);
    const completedAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(completedAttention.groups.find((group) => group.key === 'exceptions').items.some((entry) =>
      entry.book?.bookId === seventhBookId && entry.state === 'analysis-outcome-unconfirmed' && entry.blocked === false),
    'unknown-unit-attention-does-not-hold-run');

    // ---- 结果待确认 a completed Run left (Issue #757; ATTN-002, NOTIF-004, CTRL-007) ---------------------------------------
    at('relaunch-for-reduction-unknown');
    // A launch over the reduction fixture, which only J-10 may bind: every range is answered, and the reduction over the eight
    // is sent and its answer never comes back whole.
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    adapterFixture = REDUCTION_UNKNOWN_FIXTURE_IDENTITY;
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'reduction-unknown-ready');

    at('eighth-book-import');
    const eighthBookId = await importSample1(renderer, EIGHTH_BOOK.title, true, 'eighth-import');
    requireJourney(![bookId, secondBookId, thirdBookId, fourthBookId, fifthBookId, sixthBookId, seventhBookId].includes(eighthBookId), 'eight-books');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'eighth-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'eighth-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'eighth-artifact-enabled');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'eighth-return-library');

    at('outcome-unconfirmed-completed');
    // 开始任务: the Run reads all eight ranges and completes — no stop, nothing to cancel — its reduction a gap whose request was
    // sent and whose result cannot be known, in its own words, never 被中断. 待我处理 holds it in 异常与结果待确认: counted,
    // never blocking, its next step 查看未确认的部分.
    await openAnalysisOf(renderer, eighthBookId, 'eighth-analysis');
    await startFirstBaseline(renderer, 'ready', 'eighth-baseline');
    const eighthIntentId = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanRef ?? ''`);
    requireJourney(UUID_PATTERN.test(eighthIntentId), 'eighth-task');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then((analysis)=>analysis?.taskIntent?.taskIntentId===${JSON.stringify(eighthIntentId)} && analysis.state==='settled')`, 'reduction-unknown-completed', 180_000);
    const reductionUnknown = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const reductionFailures = reductionUnknown?.taskOutcome?.report?.failures ?? [];
    requireJourney(reductionUnknown?.run?.state?.startsWith('completed') === true && reductionUnknown.resultSetRevision?.coverage?.unitsClosed === SAMPLE1_UNITS &&
      (reductionUnknown.resultSetRevision?.gaps?.length ?? -1) === 0 &&
      reductionFailures.length === 1 && reductionFailures[0].stage === 'cross-unit-reduction' && reductionFailures[0].reason.includes('（AI7_OUTCOME_UNKNOWN）；这次运行不会再发它，结果待确认。'),
    'reduction-unknown-record', { run: reductionUnknown?.run?.state, gaps: reductionUnknown?.resultSetRevision?.gaps?.length ?? null, failures: reductionFailures });
    const unconfirmedItemId = `unconfirmed:${eighthBookId}:baseline-analysis`;
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('attention')), 'unconfirmed-attention-entry');
    await waitFor(renderer, `document.querySelector('[data-screen="global-attention"] li.global-attention-item[data-attention-item=${JSON.stringify(unconfirmedItemId)}]')`, 'unconfirmed-attention-painted', 30_000);
    const unconfirmedRow = await renderer.evaluate(`(() => {
      const item = document.querySelector('[data-screen="global-attention"] li.global-attention-item[data-attention-item=${JSON.stringify(unconfirmedItemId)}]');
      return {
        group: item.closest('section.global-attention-group')?.dataset.attentionGroup ?? null, state: item.dataset.attentionState, blocked: item.dataset.attentionBlocked,
        target: item.dataset.attentionTarget, pill: item.querySelector('.global-attention-pill')?.textContent ?? null,
        object: item.querySelector('button.global-attention-open')?.textContent ?? null, reason: item.querySelector('.global-attention-reason')?.textContent ?? null,
        next: item.querySelector('.global-attention-next')?.textContent ?? null,
      };
    })()`);
    requireJourney(unconfirmedRow?.group === 'exceptions' && unconfirmedRow.state === 'analysis-outcome-unconfirmed' && unconfirmedRow.blocked === 'false' &&
      unconfirmedRow.target === 'task-plan' && unconfirmedRow.pill === '结果待确认' && unconfirmedRow.object === '基线分析 · 跨单元归纳' &&
      unconfirmedRow.reason === UNCONFIRMED_REASON && unconfirmedRow.next === '安全的下一步：查看未确认的部分', 'unconfirmed-attention-row', unconfirmedRow);

    at('outcome-unconfirmed-kept');
    // The item opens ②A with the plan in the drawer, where 结果待确认 says what is known and what is missing. 查看未确认的部分 lists the
    // reduction and sends nothing; 保留为缺口 records the editor's determination and nothing else, and 待我处理 no longer holds it.
    await clickSelector(renderer, `[data-screen="global-attention"] button.global-attention-open[data-attention-open=${JSON.stringify(unconfirmedItemId)}]`, 'unconfirmed-attention-open');
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); const block=drawer?.querySelector('.task-plan-unconfirmed'); return document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(eighthBookId)}]') !== null && drawer?.dataset.taskDrawer==='open' && drawer.dataset.taskPlanRef===${JSON.stringify(eighthIntentId)} && block?.querySelector('h4')?.textContent==='结果待确认' && block.querySelector('.attention-note')?.textContent===${JSON.stringify(UNCONFIRMED_STATEMENT)} && block.querySelector('ul')===null; })()`, 'unconfirmed-plan-opened', 60_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="view-unconfirmed-record"]', 'unconfirmed-view');
    await waitFor(renderer, `(() => { const lines=[...document.querySelectorAll('#task-drawer .task-plan-unconfirmed li')]; return lines.length===1 && lines[0].dataset.unconfirmedStep==='cross-unit-reduction' && lines[0].textContent==='跨单元归纳 · 请求已发出 · 回答没有完整传回' && document.querySelector('#task-drawer [data-task-drawer-control="view-unconfirmed-record"]')?.getAttribute('aria-expanded')==='true'; })()`, 'unconfirmed-list', 30_000);
    const beforeKept = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(beforeKept?.run?.transitions) === JSON.stringify(reductionUnknown.run.transitions) &&
      beforeKept?.taskOutcome?.report?.reportDigest === reductionUnknown.taskOutcome.report.reportDigest, 'unconfirmed-view-unmoved');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="keep-unconfirmed"]', 'unconfirmed-keep');
    await waitFor(renderer, `document.querySelector('#task-drawer .task-plan-unconfirmed')===null && document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(eighthIntentId)}`, 'unconfirmed-kept', 30_000);
    const afterKept = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(afterKept?.run?.transitions) === JSON.stringify(reductionUnknown.run.transitions) &&
      afterKept?.resultSetRevision?.revisionId === reductionUnknown.resultSetRevision.revisionId &&
      afterKept?.taskOutcome?.report?.reportDigest === reductionUnknown.taskOutcome.report.reportDigest, 'unconfirmed-kept-unmoved');
    const keptAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention()`);
    requireJourney(keptAttention?.groups?.every((group) => group.items.every((entry) => entry.itemId !== unconfirmedItemId)) === true, 'unconfirmed-left-attention', keptAttention?.groups ?? null);

    // #866 synchronized delta: the shared drawer controls a category Run inside a multi-category review.
    at('review-controls-prepare');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    adapterFixture = 'sample1-review-authored';
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'review-controls-ready');
    const reviewBookId = await importSample1(renderer, '审阅任务控制旅程', true, 'review-controls-import');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'review-controls-profile');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'review-controls-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'review-controls-enabled');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'review-controls-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] button[data-book-id=${JSON.stringify(reviewBookId)}]')`, 'review-controls-landing');
    await clickSelector(renderer, `button[data-book-id=${JSON.stringify(reviewBookId)}]`, 'review-controls-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(reviewBookId)}]')`, 'review-controls-editor');
    // 审阅 is a 工作 destination, entered as J-04 enters it.
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.section('review')), 'review-controls-destination');
    await waitFor(renderer, `document.querySelector('[data-screen="book-review"] .book-review .review-workspace-card')`, 'review-controls-workspace');
    await clickSelector(renderer, '[data-review-action="new-review"]', 'review-controls-new');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true`, 'review-controls-sheet');
    await assertRenderer(renderer, `(() => { const sheet=document.querySelector('dialog.review-sheet'); for (const id of ['typos-and-usage','style-and-format']) { const box=sheet.querySelector('input[name="review-category"][value="'+id+'"]'); if(!(box instanceof HTMLInputElement)||box.disabled)return false; box.click(); } const whole=sheet.querySelector('input[name="review-scope"][value="whole"]'); if(!(whole instanceof HTMLInputElement)||whole.disabled)return false; whole.click(); const prepare=sheet.querySelector('[data-review-action="prepare"]'); if(!(prepare instanceof HTMLButtonElement)||prepare.disabled)return false; prepare.click(); return true; })()`, 'review-controls-plan');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanKind==='review-run' && document.querySelector('#task-drawer [data-task-drawer-control="start"]')`, 'review-controls-drawer', 120_000);
    const reviewRef = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanRef`);
    requireJourney(UUID_PATTERN.test(reviewRef ?? ''), 'review-controls-ref');
    await writeFile(holdPath, '0', 'utf8');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'review-controls-start');
    await waitFor(renderer, `window.ai7.inspectTaskPlan({kind:'review-run',ref:${JSON.stringify(reviewRef)}}).then((plan)=>plan.runControl?.activity?.currentUnitOrdinal===1)`, 'review-controls-first-unit');
    const reviewStarted = await renderer.evaluate(`window.ai7.inspectTaskPlan({kind:'review-run',ref:${JSON.stringify(reviewRef)}})`);

    at('review-controls-pause-resume');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="pause"]', 'review-controls-pause');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='pausing'`, 'review-controls-pausing');
    await writeFile(holdPath, '1', 'utf8');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='paused'`, 'review-controls-paused');
    const reviewPaused = await renderer.evaluate(`window.ai7.inspectTaskPlan({kind:'review-run',ref:${JSON.stringify(reviewRef)}})`);
    const pausedWorkspace = await renderer.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(reviewRef)}})`);
    requireJourney(reviewPaused.runControl?.runRecordId===reviewStarted.runControl?.runRecordId && reviewPaused.runControl?.continuation?.unitsSettled===1 &&
      pausedWorkspace.run?.categories?.[1]?.state==='waiting', 'review-controls-checkpoint');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="resume"]', 'review-controls-resume');
    await waitFor(renderer, `window.ai7.inspectTaskPlan({kind:'review-run',ref:${JSON.stringify(reviewRef)}}).then((plan)=>plan.runControl?.activity?.currentUnitOrdinal===2 && plan.runControl.runRecordId===${JSON.stringify(reviewStarted.runControl.runRecordId)})`, 'review-controls-same-run');
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); if(drawer?.dataset.taskPlanKind!=='review-run'||drawer.dataset.taskPlanRef!==${JSON.stringify(reviewRef)})return false; const button=drawer.querySelector('[data-task-drawer-control="cancel-run"]'); return button instanceof HTMLButtonElement && !button.disabled; })()`, 'review-controls-cancel-ready');

    at('review-controls-cancel-impact');
    await assertRenderer(renderer, `document.querySelector('#task-drawer [data-task-drawer-control="cancel-run"]')?.textContent==='停止任务'`, 'review-controls-stop-wording');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="cancel-run"]', 'review-controls-impact');
    await waitFor(renderer, `document.querySelector('#task-drawer-cancel-impact') && document.querySelector('#task-drawer [data-task-drawer-control="confirm-cancel-run"]')?.textContent==='确认取消任务'`, 'review-controls-confirm-wording');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="confirm-cancel-run"]', 'review-controls-cancel');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='cancelling'`, 'review-controls-cancelling');
    await writeFile(holdPath, '2', 'utf8');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='cancelled-after-start'`, 'review-controls-cancelled');
    const cancelledReview = await renderer.evaluate(`window.ai7.inspectTaskPlan({kind:'review-run',ref:${JSON.stringify(reviewRef)}})`);
    requireJourney(cancelledReview.redo!==null && cancelledReview.runControl===null, 'review-controls-redo-offered');

    at('review-controls-redo-plan');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="redo"]', 'review-controls-redo');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanKind==='review-run' && document.querySelector('#task-drawer')?.dataset.taskPlanRef!==${JSON.stringify(reviewRef)} && document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready'`, 'review-controls-redo-prepared');

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
