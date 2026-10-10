import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADMITTED_BASELINE_DOCX, composeRevisedAdmittedDocx } from './composed-docx.mjs';
import { attachProductOutput, installJourneyCancellationCleanup, journeyCheckFailure, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';
import { assertSecretsAbsentFromDataRoot, recoverSyntheticCredentialCleanupState, removeSyntheticCredentialWithElectron } from './credential-cleanup.mjs';


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
// Since S77b the selection menu's 就这段发起任务… opens a composer anchored to the paragraph, offering the Tasks that read a range:
// 审阅这段 in 情节逻辑与前后一致 is prepared on 当前选区, waits in 等你处理 as 审阅 · 第 1 次 · 所选段落, runs from its plan
// and marks that paragraph alone; from the lead's 批注 the same composer opens on the marked words and stays open, and
// 重新分析这段 prepares an analysis update over that one block and waits.
//
// The runner writes J-16's unit-hold file, and reads the service's projections through `window.ai7` only to cross-check
// what the panel shows — never as the oracle of what it says.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
/**
 * The J-04 model adapter's fixture: `sample1-baseline-happy` — every unit, the reduction and the sample of exact `sample1`
 * answered — with the one dialogue question J-16 asks answered over it (Issue #52, S17a).
 */
const FIXTURE_IDENTITY = 'sample1-dialogue';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const BROWSER_CLOSE_TIMEOUT = journeyCheckFailure('J-16', 'browser-close-timeout');

let location = 'entry';
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-16', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = journeyCheckFailure('J-16', name);
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
    server.once('error', () => rejectListen(journeyCheckFailure('J-16', 'loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' && Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw journeyCheckFailure('J-16', 'loopback-address');
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
    if (response.error) completion.reject(journeyCheckFailure('J-16', 'renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(journeyCheckFailure('J-16', 'renderer-cdp-timeout')); }, 60_000);
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
  throw journeyCheckFailure('J-16', name);
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
/**
 * Wait until the open manuscript's Position Rail has drawn a marker of `kind` (Issue #690). The rail reads its places from
 * the service once the editor has mounted, so a manuscript just opened shows its text before its markers: a hosted runner
 * clicked a marker of a replacement editor whose rail had not answered yet. A timeout names what was still missing — the
 * rail's track, its first drawing, any mark on it, or a marker of this kind.
 */
async function waitForRailMarker(renderer, kind, name, timeout = 60_000) {
  const marker = JSON.stringify(`.rail-marker[data-rail-kind="${kind}"]`);
  const read = `(() => { const track = document.querySelector('[data-screen="editor"] .rail-track'); if (!(track instanceof HTMLElement)) return 'track'; if (track.dataset.railJournal === undefined) return 'drawing'; if (track.querySelector(${marker}) instanceof HTMLButtonElement) return 'ready'; return Number(track.dataset.railMarks) > 0 ? 'kind' : 'marks'; })()`;
  const deadline = Date.now() + timeout;
  let missing = null;
  while (Date.now() < deadline) {
    missing = await renderer.evaluate(read).catch(() => null);
    if (missing === 'ready') return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (missing === 'track') requireJourney(false, `${name}-track-missing`);
  if (missing === 'drawing') requireJourney(false, `${name}-not-drawn`);
  if (missing === 'marks') requireJourney(false, `${name}-no-marks`);
  if (missing === 'kind') requireJourney(false, `${name}-kind-missing`);
  requireJourney(false, `${name}-unreadable`);
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

// ---- J-16's own: the Book, the hold, and the 任务 panel as the editor reads it ------------------------------------

const BOOK = Object.freeze({ title: '任务面旅程' });
const SAMPLE1_UNITS = 8;
/** Exact sample1's paragraphs, as `composed-docx.mjs` records them: the reimport that drops one paragraph is composed from the other 96. */
const SAMPLE1_BLOCKS = 97;
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

// ---- 就这段提问… (Issue #52, plan slice S17a): a selection, its question, and the dialogue as the editor reads it ---------

/** The one question J-16 asks; `sample1-dialogue` answers it, and only it. */
const DIALOGUE_QUESTION = '这段的叙述视角是否一致？';
/** The fixture's three sentences, the second cut in two between its first two deltas, the third with no end mark. */
const ANSWER_FIRST = '这段一直用第三人称限知视角叙述。';
const ANSWER_SECOND = '人物的心理只写到主人公为止，没有越界。';
const ANSWER_TAIL = '唯一可以斟酌的是末句的语气，略显突兀，可以改得更平缓些';
const ANSWER_BROKEN = '人物的心理只写到';
/** What the selected words become in the 修改建议 made of the answer: the Journey's own words. */
const DIALOGUE_PROPOSAL = '〔依据回答改得更平缓的一句〕';

/**
 * A hand on the manuscript, as J-11 has one: put a selection into a block by offset, right-click the way a pointer does,
 * and act on the floating Mark surface by its data attributes.
 */
const MARK_HELPERS = `(() => {
  if (window.__j16) return true;
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
  window.__j16 = {
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
    rightClick: (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: rect.left + Math.min(10, rect.width / 2), clientY: rect.top + Math.min(24, rect.height / 2) };
      element.dispatchEvent(new MouseEvent('mousedown', init));
      element.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
      element.dispatchEvent(new MouseEvent('contextmenu', { ...init, buttons: 0 }));
      return true;
    },
    block,
    menu: () => document.querySelector('.editorial-mark-menu-layer [data-mark-menu]'),
    item: (action) => document.querySelector('.editorial-mark-menu-layer [data-mark-menu] [data-mark-action="' + action + '"]'),
    card: () => layer()?.querySelector('[data-mark-card]') ?? null,
    composer: () => layer()?.querySelector('[data-mark-composer]') ?? null,
    act: (action) => {
      const control = layer()?.querySelector('[data-mark-composer] [data-mark-action="' + action + '"]');
      if (!(control instanceof HTMLButtonElement) || control.disabled) return false;
      control.click();
      return true;
    },
  };
  return true;
})()`;

/** A menu opened with the pointer: the editor reads a selection a tick after the page sets it, so it is asked again until it shows. */
async function openSelectionMenu(renderer, blockId, from, to, name) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await assertRenderer(renderer, `window.__j16.place(${JSON.stringify(blockId)}, ${from}, ${to})`, `${name}-place`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await assertRenderer(renderer, `window.__j16.rightClick(window.__j16.block(${JSON.stringify(blockId)}))`, `${name}-right-click`);
    if (await renderer.evaluate(`window.__j16.menu()?.dataset.markMenu === 'selection' && window.__j16.menu().textContent.includes('已选 ${to - from} 字')`)) return;
    await pressEscape(renderer);
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  throw journeyCheckFailure('J-16', name);
}

/**
 * The dialogue in the side slot as the editor reads it: the slot's view and title, the selected words and the question, each
 * attempt's heading, state, fragments and incomplete line, and the actions with whether each can be pressed.
 */
const READ_DIALOGUE = `(() => {
  const drawer = document.querySelector('#task-drawer');
  const dialogue = drawer?.querySelector('.dialogue');
  if (!(drawer instanceof HTMLElement) || drawer.hidden || drawer.dataset.taskDrawerView !== 'dialogue' || !(dialogue instanceof HTMLElement)) return null;
  const text = (node) => node?.textContent ?? null;
  return {
    state: dialogue.dataset.dialogue ?? null,
    dialogueId: dialogue.dataset.dialogueId ?? null,
    title: text(drawer.querySelector('#task-drawer-title')),
    selection: text(dialogue.querySelector('.dialogue-selection')),
    question: text(dialogue.querySelector('.dialogue-question')),
    attempts: Array.from(dialogue.querySelectorAll('section.dialogue-attempt')).map((attempt) => ({
      kind: attempt.dataset.dialogueKind ?? null,
      state: attempt.dataset.dialogueState ?? null,
      heading: text(attempt.querySelector('.dialogue-attempt-heading')),
      label: text(attempt.querySelector('[data-dialogue-state-label]')),
      fragments: Array.from(attempt.querySelectorAll('[data-dialogue-fragment]')).map((fragment) => fragment.textContent),
      answer: text(attempt.querySelector('.dialogue-answer')),
      incomplete: text(attempt.querySelector('.dialogue-incomplete')),
      converted: text(attempt.querySelector('.dialogue-converted')),
    })),
    actions: Array.from(dialogue.querySelectorAll('.dialogue-actions [data-dialogue-action]')).map((button) => [button.dataset.dialogueAction, button.textContent, button.disabled ? 'disabled' : 'enabled']),
    note: text(dialogue.querySelector('.dialogue-authority')),
  };
})()`;

async function waitForDialogue(renderer, check, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await renderer.evaluate(READ_DIALOGUE).catch(() => null);
    if (last !== null && check(last)) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  requireJourney(false, name, last);
}

async function dialogueAction(renderer, action, name) {
  await clickSelector(renderer, `#task-drawer .dialogue [data-dialogue-action=${JSON.stringify(action)}]`, name);
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
      throw journeyCheckFailure('J-16', 'browser-close-unconfirmed');
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
    if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-16', 'browser-cleanup-failed');
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        credentialCleanupFailure ??= error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        const closedForRetry = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-16', 'browser-cleanup-failed');
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
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-16', 'browser-cleanup-failed');
        const closedForFallback = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-16', 'browser-cleanup-failed');
        if (closedForFallback && credentialReferenceForCleanup === undefined && dataRoot !== undefined && runRoot !== undefined) {
          try {
            const recovered = await recoverSyntheticCredentialCleanupState('J-16', dataRoot, runRoot);
            if (recovered.kind === 'not-started' || recovered.kind === 'removed') credentialRemoved = true;
            else credentialReferenceForCleanup = recovered.credentialReference;
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
        if (closedForFallback && !credentialRemoved && credentialReferenceForCleanup !== undefined) {
          try {
            requireJourney(electronExecutableForCleanup !== undefined, 'credential-direct-cleanup-executable');
            await removeSyntheticCredentialWithElectron('J-16', electronExecutableForCleanup, productEnvironment(electronExecutableForCleanup), credentialReferenceForCleanup);
            credentialRemoved = true;
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
      }
    }
    if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-16', 'browser-cleanup-failed');
    const browserClosed = await closeOwnedBrowserForCleanup();
    if (!browserClosed) throw cleanupFailure ?? journeyCheckFailure('J-16', 'browser-cleanup-failed');
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    try { await ownedLoopback?.close(); } catch (error) { cleanupFailure ??= error; }
    loopback = undefined;
    if (credentialMutationReached && !credentialRemoved) {
      throw credentialCleanupFailure ?? journeyCheckFailure('J-16', 'credential-cleanup-failed');
    }
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        try { await assertSecretsAbsentFromDataRoot('J-16', dataRoot, [syntheticSecret]); } catch (error) { cleanupFailure ??= error; }
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
    // J-16's answer hold (Issue #52, S17a): how many text deltas a dialogue answer may stream before it waits.
    const answerHoldPath = resolve(runRoot, 'j16-answer-hold.txt');
    const writeAnswerHold = (count) => writeFile(answerHoldPath, String(count), 'utf8');
    // The J-04 adapter's fixture: the happy one until the fourth Book's launch (Issue #422, S76d).
    let adapterFixture = FIXTURE_IDENTITY;
    // The picker's file: exact sample1, until the last launch reimports the Book from a composed DOCX without one paragraph.
    let pickerPath = SAMPLE1_PATH;
    const launchArgs = ({ forCleanup }) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      if (!forCleanup) args.push('--j16-picker-path', pickerPath, '--j04-model-adapter', adapterFixture, '--j10-unit-hold-path', holdPath, '--j16-answer-hold-path', answerHoldPath);
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
    // The 任务 panel is one read; a dialogue (Issue #52, S17a) is asked about a selection and read, stopped, answered again or
    // converted by its own operations — no chat, conversation or stream is exposed to the renderer.
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && typeof window.ai7.inspectBookTasks === 'function' && typeof window.ai7.askAboutSelection === 'function' && Object.keys(window.ai7).filter((key)=>/dialog/i.test(key)).sort().join(',') === 'continueDialogueAnswer,convertDialogueToChangeSuggestion,inspectDialogue,regenerateDialogueAnswer,stopDialogueAnswer' && !Object.keys(window.ai7).some((key)=>/chat|conversation|stream/i.test(key))`, 'renderer-api-boundary');
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
    // The exact-key navigation hint survives a renderer restart without reconstructing every Book's positions.
    await closeOwnedBrowser();
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'chip-restart-ready');
    await openManuscriptOf(renderer, bookId, 'chip-restart');
    await waitFor(renderer, `${CHIP}?.dataset.returnChip === ${JSON.stringify(chip.blockId)}`, 'chip-restart-retained');

    at('chip-return');
    // 回到<位置>: the manuscript is back where the editor was reading before the jump, and the chip is gone.
    await renderer.evaluate(`(() => {
      const original = window.requestAnimationFrame;
      const held = [];
      globalThis.__j16ReleaseFrames = () => {
        window.requestAnimationFrame = original;
        for (const callback of held) original.call(window, callback);
        delete globalThis.__j16ReleaseFrames;
      };
      window.requestAnimationFrame = (callback) => { held.push(callback); return 1; };
      const rail = document.querySelector('#manuscript-position');
      rail.value = '500000';
      rail.dispatchEvent(new Event('change'));
    })()`);
    // The real navigation sets its guard synchronously, before awaiting the window read.
    await clickSelector(renderer, '[data-screen="editor"] .return-chip-host [data-return-chip]', 'chip-use');
    await renderer.evaluate(`globalThis.__j16ReleaseFrames()`);
    try {
      await waitFor(renderer, `${CHIP} === null && ${blockInView(chip.blockId)} && (document.querySelector('#persistence-status')?.textContent ?? '').startsWith('已回到')`, 'chip-returned', 60_000);
    } catch (error) {
      // Failure-only closed state: never emit manuscript text, identifiers or arbitrary status words.
      const state = await renderer.evaluate(`(() => { const chip = ${CHIP}; return {
        present: chip !== null, disabled: chip?.disabled === true, target: ${blockInView(chip.blockId)},
        arrived: (document.querySelector('#persistence-status')?.textContent ?? '').startsWith('已回到'),
      }; })()`).catch(() => null);
      if (state === null) at('chip-return-state-unavailable');
      else if (state.present && state.disabled) at('chip-return-retained-busy');
      else if (state.present) at('chip-return-retained-ready');
      else if (!state.target) at('chip-return-target-missing');
      else if (!state.arrived) at('chip-return-status-replaced');
      else at('chip-return-late-completion');
      throw error;
    }
    await waitForRailMarker(renderer, 'annotation', 'mark-rail-ready');
    // A storage failure must refuse the jump, rather than lose the editor's way back.
    await renderer.evaluate(`(() => {
      globalThis.__j16Transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(names, mode, options) {
        if (this.name === 'ai7-reading-return' && mode === 'readwrite') throw new DOMException('', 'QuotaExceededError');
        return globalThis.__j16Transaction.call(this, names, mode, options);
      };
    })()`);
    await clickSelector(renderer, '.rail-marker[data-rail-kind="annotation"]', 'mark-rail-storage-failure');
    await waitFor(renderer, `(document.querySelector('#persistence-status')?.textContent ?? '').startsWith('无法保存或读取返回位置')`, 'mark-rail-storage-refused');
    await assertRenderer(renderer, `${CHIP} === null && ${blockInView(chip.blockId)}`, 'mark-rail-storage-keeps-position');
    await renderer.evaluate(`(() => { IDBDatabase.prototype.transaction = globalThis.__j16Transaction; delete globalThis.__j16Transaction; })()`);
    // Hold the real committed storage completion, replace the editor, then release the old click.
    await renderer.evaluate(`(() => {
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(names, mode, options) {
        const transaction = original.call(this, names, mode, options);
        if (this.name === 'ai7-reading-return' && mode === 'readwrite') {
          IDBDatabase.prototype.transaction = original;
          Object.defineProperty(transaction, 'oncomplete', { set(callback) {
            transaction.addEventListener('complete', (event) => { globalThis.__j16ReleaseReturn = () => callback.call(transaction, event); });
          } });
        }
        return transaction;
      };
    })()`);
    await clickSelector(renderer, '.rail-marker[data-rail-kind="annotation"]', 'mark-rail-delayed-storage');
    await waitFor(renderer, `typeof globalThis.__j16ReleaseReturn === 'function'`, 'mark-rail-storage-held');
    await click(renderer, '返回图书工作概览', 'mark-rail-held-leave');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'mark-rail-held-overview');
    await click(renderer, '打开稿件', 'mark-rail-held-reopen');
    await waitFor(renderer, `${blockInView(chip.blockId)} && ${CHIP} !== null`, 'mark-rail-replacement-editor');
    await renderer.evaluate(`(() => { globalThis.__j16ReleaseReturn(); delete globalThis.__j16ReleaseReturn; return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`);
    await assertRenderer(renderer, `${blockInView(chip.blockId)}`, 'mark-rail-old-click-cannot-move-replacement');
    // The replacement editor's rail is drawn from its own read of the service, after its text: wait for its marker.
    await waitForRailMarker(renderer, 'annotation', 'mark-rail-replacement-ready');
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
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .baseline-analysis-card')?.dataset.inspectedRevisionOrdinal === '1'`, 'leave-analysis-exact-historical-result', 60_000);
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

    // ---- 就这段提问… (Issue #52, plan slice S17a; UI ADR 0014; DIALOG-001 to 016, TASK-044, TASK-046) ---------------------
    at('dialogue-ask');
    // The selection menu's 就这段提问… opens a small composer that says plainly what is sent; asking needs no plan and no
    // 开始任务 (the Owner, 2026-10-07). The answer hold lets two deltas through: a whole sentence and half of the next.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'dialogue-drawer-close');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden === true`, 'dialogue-drawer-closed');
    await assertRenderer(renderer, MARK_HELPERS, 'dialogue-page-helpers');
    const askBlock = await renderer.evaluate(`(() => { const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }); return Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > p[data-block-id]')).find((node) => { const head = (node.textContent ?? '').slice(0, 30); return head.length === 30 && Array.from(segmenter.segment(head)).length === 30 && node.querySelector('.editorial-mark') === null; })?.dataset.blockId ?? null; })()`);
    requireJourney(/^blk_[0-9a-f]{24}$/.test(askBlock ?? ''), 'dialogue-block');
    const selectedWords = await renderer.evaluate(`(window.__j16.block(${JSON.stringify(askBlock)})?.textContent ?? '').slice(2, 22)`);
    requireJourney(typeof selectedWords === 'string' && selectedWords.length === 20, 'dialogue-selected-words');
    await writeAnswerHold(2);
    await openSelectionMenu(renderer, askBlock, 2, 22, 'dialogue-menu');
    await assertRenderer(renderer, `(() => { const item = window.__j16.item('ask-on-selection'); return item instanceof HTMLButtonElement && !item.disabled && item.textContent.startsWith('就这段提问…') && item.textContent.includes('对话，不改稿件'); })()`, 'dialogue-menu-item');
    await assertRenderer(renderer, `(() => { const item = window.__j16.item('ask-on-selection'); item.click(); return true; })()`, 'dialogue-menu-choose');
    await waitFor(renderer, `window.__j16.composer()?.dataset.markComposer === 'ask-about-selection'`, 'dialogue-composer');
    await assertRenderer(renderer, `(() => { const composer = window.__j16.composer(); return composer.getAttribute('aria-label') === '就这段提问' && composer.querySelector('.editorial-mark-quote')?.textContent === ${JSON.stringify(selectedWords)} && composer.querySelector('[data-mark-form-note]')?.textContent === '只发送所选文字和你的问题，不改稿件。' && composer.querySelector('[data-mark-action="submit"]')?.textContent === '提问'; })()`, 'dialogue-composer-words');

    at('j14-dialogue-ime');
    // An input method's composition owns Escape and Enter while it is open: an Escape that ends a composition in the
    // question closes nothing, an Enter asks nothing, and the words stay as they were.
    await assertRenderer(renderer, `(() => { const input = window.__j16.composer()?.querySelector('[data-mark-field="question"]'); if (!(input instanceof HTMLTextAreaElement)) return false; input.focus(); input.value = ${JSON.stringify(DIALOGUE_QUESTION)}; input.dispatchEvent(new Event('input', { bubbles: true })); return document.activeElement === input; })()`, 'dialogue-question-written');
    await assertRenderer(renderer, `(async () => { const composer = window.__j16.composer(); const input = composer?.querySelector('[data-mark-field="question"]'); if (!(input instanceof HTMLTextAreaElement)) return false; input.dispatchEvent(new CompositionEvent('compositionstart', { data: '视角', bubbles: true })); for (const key of ['Escape', 'Enter']) input.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, isComposing: true, bubbles: true, cancelable: true })); input.dispatchEvent(new CompositionEvent('compositionend', { data: '视角', bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 100)); return window.__j16.composer() === composer && composer.isConnected && input.value === ${JSON.stringify(DIALOGUE_QUESTION)} && document.querySelector('#task-drawer')?.hidden === true; })()`, 'dialogue-ime-composition-kept');
    await assertRenderer(renderer, `window.__j16.act('submit')`, 'dialogue-ask-submit');

    at('dialogue-streaming-held');
    // The dialogue comes to the foreground in the side slot. Held after two deltas, the first sentence shows and the second,
    // cut in two, does not: nothing appears by token or with a broken tail (DIALOG-006).
    const held = await waitForDialogue(renderer, (dialogue) => dialogue.state === 'ready' && dialogue.attempts.length === 1 && dialogue.attempts[0].fragments.length === 1, 'dialogue-held');
    requireJourney(held.title === '对话' && held.selection === selectedWords && held.question === DIALOGUE_QUESTION &&
      held.attempts[0].kind === 'ask' && held.attempts[0].state === 'answering' && held.attempts[0].heading === '第 1 次 · 回答' &&
      held.attempts[0].label === '正在回答 · 内容尚未完成' && JSON.stringify(held.attempts[0].fragments) === JSON.stringify([ANSWER_FIRST]) &&
      !held.attempts[0].answer.includes(ANSWER_BROKEN) && JSON.stringify(held.actions) === JSON.stringify([['stop', '停止回答', 'enabled']]) &&
      held.note === '回答是生成的内容，只供参考：它不改稿件，也不是事实结论或修改建议。', 'dialogue-held-words', held);
    const dialogueId = held.dialogueId;
    requireJourney(UUID_PATTERN.test(dialogueId ?? ''), 'dialogue-identity');
    const recorded = await renderer.evaluate(`window.ai7.inspectDialogue({ dialogueId: ${JSON.stringify(dialogueId)}, afterFragment: 0 })`);
    requireJourney(recorded?.bookId === bookId && recorded.range.blockId === askBlock && recorded.range.fromGrapheme === 2 && recorded.range.toGrapheme === 22 &&
      recorded.attempts.length === 1 && recorded.attempts[0].state === 'answering' && recorded.attempts[0].fragmentTotal === 1, 'dialogue-recorded', recorded);
    const workingDigest = () => renderer.evaluate(`window.ai7.getManuscriptWindow({ manuscriptId: ${JSON.stringify(recorded.manuscriptId)}, branchId: ${JSON.stringify(recorded.branchId)}, cursor: null }).then((window) => window.workingDigest)`);
    const digestBefore = await workingDigest();
    requireJourney(/^[0-9a-f]{64}$/.test(digestBefore ?? ''), 'dialogue-working-digest');
    // Held, it stays held: a moment later the same one fragment.
    await new Promise((resolveWait) => setTimeout(resolveWait, 800));
    const stillHeld = await renderer.evaluate(READ_DIALOGUE);
    requireJourney(JSON.stringify(stillHeld?.attempts[0]?.fragments) === JSON.stringify([ANSWER_FIRST]), 'dialogue-still-held', stillHeld);

    at('dialogue-background');
    // `← 任务` puts the dialogue in the background: its card in 进行中 says only 等待回答 and offers 打开对话 (DIALOG-010). Two
    // more deltas arrive meanwhile — the second sentence completes — and the panel shows nothing of them, nor moves focus.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'dialogue-leave');
    const background = await waitForPanel(renderer, (panel) => cardsOf(panel, 'running').some((card) => card.state === 'dialogue-answering'), 'dialogue-background-card');
    const backgroundCard = cardsOf(background, 'running').find((card) => card.state === 'dialogue-answering');
    requireJourney(backgroundCard.kind === '对话任务 · 就所选文字提问' && backgroundCard.title === `提问 · 「${DIALOGUE_QUESTION}」` && backgroundCard.pill === '等待回答' &&
      backgroundCard.reason === '回答在后台继续；打开对话可以看到已经收到的完整内容。' &&
      JSON.stringify(backgroundCard.actions) === JSON.stringify([['next', '打开对话', 'enabled']]), 'dialogue-background-words', backgroundCard);
    await assertRenderer(renderer, `(() => { const title = document.querySelector('#task-drawer-title'); title.focus(); return document.activeElement === title; })()`, 'dialogue-background-focus');
    await writeAnswerHold(4);
    await waitFor(renderer, `window.ai7.inspectDialogue({ dialogueId: ${JSON.stringify(dialogueId)}, afterFragment: 0 }).then((dialogue) => dialogue.attempts[0].fragmentTotal === 2 && dialogue.attempts[0].state === 'answering')`, 'dialogue-background-arrived', 30_000);
    await new Promise((resolveWait) => setTimeout(resolveWait, 600));
    await assertRenderer(renderer, `document.activeElement === document.querySelector('#task-drawer-title') && document.querySelector('#task-drawer')?.dataset.taskDrawerView === 'panel' && document.querySelector('#task-drawer .dialogue') === null && document.querySelectorAll('[data-dialogue-fragment]').length === 0`, 'dialogue-background-quiet');

    at('dialogue-return');
    // 打开对话 brings it back: every complete fragment received meanwhile, and the answer still in flight (DIALOG-011).
    await cardAction(renderer, 'dialogue-answering', 'next', 'dialogue-open');
    const returned = await waitForDialogue(renderer, (dialogue) => dialogue.state === 'ready' && dialogue.attempts[0]?.fragments.length === 2, 'dialogue-returned');
    requireJourney(returned.dialogueId === dialogueId && returned.attempts[0].state === 'answering' &&
      JSON.stringify(returned.attempts[0].fragments) === JSON.stringify([ANSWER_FIRST, ANSWER_SECOND]) && !returned.attempts[0].answer.includes('唯一可以斟酌'), 'dialogue-returned-words', returned);

    at('dialogue-stop');
    // 停止回答 keeps the complete fragments only, labelled incomplete; it cannot be made a 修改建议 (DIALOG-012, 013).
    await dialogueAction(renderer, 'stop', 'dialogue-stop');
    const stopped = await waitForDialogue(renderer, (dialogue) => dialogue.attempts[0]?.state === 'stopped', 'dialogue-stopped');
    requireJourney(stopped.attempts[0].label === '回答已停止 · 内容不完整' && stopped.attempts[0].incomplete === '你停止了回答；只保留了完整的句子。' &&
      JSON.stringify(stopped.attempts[0].fragments) === JSON.stringify([ANSWER_FIRST, ANSWER_SECOND]) &&
      JSON.stringify(stopped.actions) === JSON.stringify([['continue', '继续回答', 'enabled'], ['regenerate', '重新回答', 'enabled'], ['convert', '转为修改建议', 'disabled']]), 'dialogue-stopped-words', stopped);
    await assertRenderer(renderer, `document.querySelector('#task-drawer .dialogue [data-dialogue-action="convert"]')?.title === '内容不完整的回答不能转为修改建议。'`, 'dialogue-stopped-convert-why');

    at('dialogue-regenerate');
    // 重新回答 is a new attempt linked to the one before, asking the same question about the same words again (DIALOG-014).
    await writeAnswerHold(99);
    await dialogueAction(renderer, 'regenerate', 'dialogue-regenerate');
    const regenerated = await waitForDialogue(renderer, (dialogue) => dialogue.attempts.length === 2 && dialogue.attempts[1].state === 'completed', 'dialogue-regenerated', 60_000);
    requireJourney(regenerated.attempts[0].state === 'stopped' && JSON.stringify(regenerated.attempts[0].fragments) === JSON.stringify([ANSWER_FIRST, ANSWER_SECOND]) &&
      regenerated.attempts[1].kind === 'regenerate' && regenerated.attempts[1].heading === '第 2 次 · 重新回答' && regenerated.attempts[1].label === '回答完成' &&
      JSON.stringify(regenerated.attempts[1].fragments) === JSON.stringify([ANSWER_FIRST, ANSWER_SECOND, ANSWER_TAIL]) && regenerated.attempts[1].incomplete === null &&
      JSON.stringify(regenerated.actions) === JSON.stringify([['continue', '继续回答', 'disabled'], ['regenerate', '重新回答', 'enabled'], ['convert', '转为修改建议', 'enabled']]), 'dialogue-regenerated-words', regenerated);
    const attempts = await renderer.evaluate(`window.ai7.inspectDialogue({ dialogueId: ${JSON.stringify(dialogueId)}, afterFragment: 0 }).then((dialogue) => dialogue.attempts.map((attempt) => [attempt.ordinal, attempt.kind, attempt.state, attempt.source]))`);
    requireJourney(JSON.stringify(attempts) === JSON.stringify([[1, 'ask', 'stopped', 'ledger'], [2, 'regenerate', 'completed', 'ledger']]), 'dialogue-attempts-linked', attempts);

    at('dialogue-panel-answer');
    // In 最近完成 the card says 已回答 and offers 回答 and 打开对话 (TASK-044); 回答 shows the latest answer in the window.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'dialogue-to-panel');
    const answeredPanel = await waitForPanel(renderer, (panel) => cardsOf(panel, 'recent')[0]?.state === 'dialogue-answered', 'dialogue-answered-card');
    requireJourney(JSON.stringify(cardsOf(answeredPanel, 'recent')[0].actions) === JSON.stringify([['answer', '回答', 'enabled'], ['next', '打开对话', 'enabled']]) &&
      cardsOf(answeredPanel, 'recent')[0].pill === '已回答', 'dialogue-answered-card-words', answeredPanel);
    await cardAction(renderer, 'dialogue-answered', 'answer', 'dialogue-answer-open');
    await waitFor(renderer, `(() => { const win = document.querySelector('.task-result-window'); return win?.dataset.taskResult === 'ready' && win.dataset.taskResultKind === 'dialogue' && win.querySelector('.task-result-dialogue-answer')?.textContent === ${JSON.stringify(ANSWER_FIRST + ANSWER_SECOND + ANSWER_TAIL)} && win.querySelector('[data-dialogue-state]')?.textContent === '回答完成'; })()`, 'dialogue-answer-window', 30_000);
    await clickSelector(renderer, '.task-result-window [data-task-result-action="close"]', 'dialogue-answer-close');
    await waitForPanel(renderer, (panel) => panel.state === 'ready', 'dialogue-answer-closed');

    at('j14-dialogue-keyboard');
    // Without a pointer: Enter on the card's 打开对话 opens the dialogue at its title, Tab reaches its actions with visible
    // focus, and Escape closes the slot.
    await assertRenderer(renderer, `(() => { const open = document.querySelector('#task-drawer li.task-card[data-task-state="dialogue-answered"] [data-task-action="next"]'); if (!(open instanceof HTMLButtonElement)) return false; open.focus(); return document.activeElement === open; })()`, 'dialogue-keyboard-focus');
    await pressEnter(renderer);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerView === 'dialogue' && document.activeElement === document.querySelector('#task-drawer-title') && document.querySelector('#task-drawer .dialogue')?.dataset.dialogue === 'ready'`, 'dialogue-keyboard-open', 10_000);
    let reached = false;
    for (let presses = 0; presses < 12 && !reached; presses += 1) {
      await pressTab(renderer);
      reached = await renderer.evaluate(`document.activeElement?.matches('#task-drawer .dialogue-actions [data-dialogue-action]:focus-visible') === true`);
    }
    requireJourney(reached, 'dialogue-keyboard-actions');
    await pressEscape(renderer);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden === true`, 'dialogue-keyboard-closed', 10_000);

    at('j14-dialogue-zoom-200-reflow');
    // At 200% the dialogue — its words, each attempt and its actions — reflows into the slot without sideways scroll.
    await openPanel(renderer, 'dialogue-reflow');
    await cardAction(renderer, 'dialogue-answered', 'next', 'dialogue-reflow-open');
    await waitForDialogue(renderer, (dialogue) => dialogue.state === 'ready' && dialogue.attempts.length === 2, 'dialogue-reflow-ready');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [...document.querySelectorAll('#task-drawer .dialogue, #task-drawer .dialogue-attempt, #task-drawer .dialogue-actions, #task-drawer .dialogue-context')]; return parts.length >= 5 && parts.every((part) => part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'dialogue-reflow-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-dialogue-forced-colors');
    // Without colour each answer keeps its left rule — heavier once incomplete — and its state in words.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => { if (!matchMedia('(forced-colors: active)').matches) return false; const [first, second] = document.querySelectorAll('#task-drawer section.dialogue-attempt'); if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) return false; const width = (node) => parseFloat(getComputedStyle(node).borderLeftWidth); return getComputedStyle(first).borderLeftStyle === 'solid' && width(first) > width(second) && width(second) >= 2 && first.querySelector('[data-dialogue-state-label]')?.textContent === '回答已停止 · 内容不完整'; })()`, 'dialogue-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    const dialogueBefore = await renderer.evaluate(`window.ai7.inspectDialogue({ dialogueId: ${JSON.stringify(dialogueId)}, afterFragment: 0 }).then((dialogue) => JSON.stringify(dialogue))`);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'dialogue-before-restart-close');

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
    await waitForPanel(renderer, (panel) => statesOf(panel, 'recent').join() === 'dialogue-answered,analysis-cancelled,analysis-completed', 'restart-panel');
    await cardAction(renderer, 'analysis-completed', 'result', 'restart-result-open');
    await waitFor(renderer, `document.querySelector('.task-result-window')?.dataset.taskResult === 'ready' && document.querySelectorAll('.task-result-window tr[data-task-result-unit]').length === ${SAMPLE1_UNITS}`, 'restart-result', 30_000);
    await clickSelector(renderer, '.task-result-window [data-task-result-action="close"]', 'restart-result-close');

    at('dialogue-history-recovered');
    // After the restart the dialogue is joined again from its records to the Harness Session Ledger, the DSH Session log
    // under the Agent Data Root: both attempts, every fragment and each state exactly as before. AI7's own store holds no
    // copy of the question or of any answer; the ledger's files hold them.
    const dialogueAfter = await renderer.evaluate(`window.ai7.inspectDialogue({ dialogueId: ${JSON.stringify(dialogueId)}, afterFragment: 0 }).then((dialogue) => JSON.stringify(dialogue))`);
    requireJourney(typeof dialogueBefore === 'string' && dialogueAfter === dialogueBefore, 'dialogue-history-unmoved');
    await cardAction(renderer, 'dialogue-answered', 'next', 'dialogue-recovered-open');
    const recoveredDialogue = await waitForDialogue(renderer, (dialogue) => dialogue.state === 'ready' && dialogue.attempts.length === 2, 'dialogue-recovered');
    const shape = (dialogue) => JSON.stringify([dialogue.question, dialogue.selection, dialogue.attempts.map((attempt) => [attempt.kind, attempt.state, attempt.label, attempt.fragments, attempt.incomplete])]);
    requireJourney(shape(recoveredDialogue) === shape(regenerated), 'dialogue-recovered-words', recoveredDialogue);
    const storeBytes = [];
    for (const name of ['ai7.sqlite', 'ai7.sqlite-wal']) {
      const path = resolve(dataRoot, 'store', name);
      if (existsSync(path)) storeBytes.push(await readFile(path));
    }
    requireJourney(storeBytes.length >= 1 && [DIALOGUE_QUESTION, ANSWER_FIRST, ANSWER_SECOND, ANSWER_TAIL].every((words) => storeBytes.every((bytes) => !bytes.includes(Buffer.from(words, 'utf8')))), 'dialogue-no-transcript-copy');
    const ledgerFiles = (await readdir(resolve(dataRoot, 'harness-sessions'))).filter((name) => name.endsWith('.jsonl'));
    requireJourney(ledgerFiles.length === 2, 'dialogue-ledger-sessions', ledgerFiles);
    const ledgerText = (await Promise.all(ledgerFiles.map((name) => readFile(resolve(dataRoot, 'harness-sessions', name), 'utf8')))).join('\n');
    requireJourney(ledgerText.includes(DIALOGUE_QUESTION) && ledgerText.includes(ANSWER_TAIL.slice(-12)), 'dialogue-ledger-holds-history');

    at('dialogue-convert');
    // 转为修改建议 on the completed answer (DIALOG-016): a 修改建议 on the selected words, from AI7 and the dialogue Task, which
    // the editor still decides; the manuscript is exactly as it was.
    await dialogueAction(renderer, 'convert', 'dialogue-convert-open');
    await waitFor(renderer, `(() => { const form = document.querySelector('#task-drawer .dialogue-convert'); const proposed = form?.querySelector('textarea[name="proposedText"]'); const rationale = form?.querySelector('textarea[name="rationale"]'); return proposed instanceof HTMLTextAreaElement && document.activeElement === proposed && rationale?.value === '' && form.querySelector('.editorial-mark-quote')?.textContent === ${JSON.stringify(selectedWords)}; })()`, 'dialogue-convert-form', 10_000);
    // An Escape that ends an input method's composition in the form closes neither the form nor the side slot (J-14).
    await assertRenderer(renderer, `(async () => { const form = document.querySelector('#task-drawer .dialogue-convert'); const proposed = form?.querySelector('textarea[name="proposedText"]'); if (!(proposed instanceof HTMLTextAreaElement)) return false; proposed.dispatchEvent(new CompositionEvent('compositionstart', { data: '平缓', bubbles: true })); proposed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true, bubbles: true, cancelable: true })); proposed.dispatchEvent(new CompositionEvent('compositionend', { data: '平缓', bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 100)); return form.isConnected && document.querySelector('#task-drawer')?.hidden === false && document.querySelector('#task-drawer')?.dataset.taskDrawerView === 'dialogue'; })()`, 'dialogue-convert-ime-escape');
    await assertRenderer(renderer, `(() => { const proposed = document.querySelector('#task-drawer .dialogue-convert textarea[name="proposedText"]'); proposed.value = ${JSON.stringify(DIALOGUE_PROPOSAL)}; proposed.dispatchEvent(new Event('input', { bubbles: true })); return proposed.value === ${JSON.stringify(DIALOGUE_PROPOSAL)}; })()`, 'dialogue-convert-write');
    await clickSelector(renderer, '#task-drawer .dialogue-convert [data-dialogue-action="convert-submit"]', 'dialogue-convert-submit');
    await waitFor(renderer, `(() => { const card = document.querySelector('.editorial-mark-layer [data-mark-card]'); return card instanceof HTMLElement && card.dataset.markKind === 'change-suggestion' && (card.querySelector('.editorial-mark-source')?.textContent ?? '').startsWith('AI7 · 任务「对话回答」'); })()`, 'dialogue-converted-card', 60_000);
    const converted = await renderer.evaluate(`window.ai7.inspectDialogue({ dialogueId: ${JSON.stringify(dialogueId)}, afterFragment: 0 })`);
    const markId = converted?.attempts?.[1]?.convertedMarkIds?.[0] ?? null;
    requireJourney(UUID_PATTERN.test(markId ?? '') && converted.attempts[1].convertedMarkIds.length === 1 && converted.attempts[0].convertedMarkIds.length === 0, 'dialogue-conversion-recorded', converted);
    const markCard = await renderer.evaluate(`window.ai7.getEditorialMarkCard({ manuscriptId: ${JSON.stringify(recorded.manuscriptId)}, branchId: ${JSON.stringify(recorded.branchId)}, markId: ${JSON.stringify(markId)} })`);
    requireJourney(markCard?.kind === 'change-suggestion' && markCard.source?.kind === 'ai7' && markCard.source.origin === 'task' && markCard.source.label === '对话回答' &&
      markCard.source.taskId === dialogueId && markCard.suggestion?.currentText === selectedWords && markCard.suggestion.proposedText === DIALOGUE_PROPOSAL &&
      markCard.suggestion.decision === null && markCard.suggestion.application === null, 'dialogue-mark', markCard);
    requireJourney((await workingDigest()) === digestBefore, 'dialogue-manuscript-unchanged');
    await waitForDialogue(renderer, (dialogue) => dialogue.attempts[1]?.converted === '已从这次回答新建 1 条修改建议。', 'dialogue-converted-line');

    // ---- 就这段发起任务… (Issue #423, plan slice S77b; TASK-001 to 004, TASK-044, TASK-046) -------------------------------
    at('selection-task-menu');
    // The paragraph is one the Book's latest analysis anchors a lead on, so 审阅这段 · 「情节逻辑与前后一致」 has something to mark
    // there: the runner reads the anchors from ②A's projection, and ②A's 回到稿件范围 brings the paragraph into the window.
    await assertRenderer(renderer, `(() => { document.querySelector('#task-drawer [data-task-drawer-control="close"]')?.click(); return true; })()`, 'selection-task-drawer-close');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden === true`, 'selection-task-drawer-closed');
    const leadAnchors = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis().then((analysis) => { const revision = analysis.resultSetRevision; if (revision === null) return []; const first = (ranges) => ranges?.[0]?.blockId ?? null; const anchors = [...revision.conflicts.map((conflict) => first(conflict.sourceRanges)), ...revision.crossUnitFindings.map((finding) => first(finding.sides.flatMap((side) => side.sourceRanges))), ...[...revision.sections.flatMap((section) => section.unresolved), ...revision.synthesis.unresolved].map((item) => first(item.sourceRanges))].filter((blockId) => blockId !== null); const units = analysis.coverageManifest?.units ?? []; return [...new Set(anchors)].map((blockId) => ({ blockId, unit: units.find((unit) => unit.blockIds.includes(blockId))?.ordinal ?? null })).filter((anchor) => anchor.unit !== null); })`);
    requireJourney(Array.isArray(leadAnchors) && leadAnchors.length > 0, 'selection-task-lead-anchors', leadAnchors);
    let taskBlock = null;
    for (const anchor of leadAnchors.slice(0, 6)) {
      await clickSelector(renderer, '[data-edge-entry="analysis"]', 'selection-task-analysis-open');
      await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .baseline-analysis-card')`, 'selection-task-analysis-screen', 60_000);
      await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] button[data-analysis-tab="chapters"]') instanceof HTMLButtonElement`, 'selection-task-analysis-chapters-ready', 60_000);
      await clickSelector(renderer, '[data-screen="book-analysis"] button[data-analysis-tab="chapters"]', 'selection-task-analysis-chapters');
      await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] li.analysis-unit[data-analysis-unit="${anchor.unit}"] [data-analysis-action="return-to-range"]') instanceof HTMLButtonElement`, 'selection-task-analysis-return-ready', 60_000);
      await clickSelector(renderer, `[data-screen="book-analysis"] li.analysis-unit[data-analysis-unit="${anchor.unit}"] [data-analysis-action="return-to-range"]`, 'selection-task-analysis-return');
      await waitFor(renderer, `document.querySelector('[data-screen="editor"] .ProseMirror [data-block-id]') !== null`, 'selection-task-editor', 60_000);
      await assertRenderer(renderer, MARK_HELPERS, 'selection-task-helpers');
      // Any block of the manuscript will do — a heading as well as a paragraph — once it holds a few single-unit characters.
      const fits = await renderer.evaluate(`(() => { const node = window.__j16.block(${JSON.stringify(anchor.blockId)}); if (!(node instanceof HTMLElement)) return false; const head = (node.textContent ?? '').slice(0, 10); return head.length >= 4 && Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(head)).length === head.length; })()`);
      if (fits) {
        taskBlock = anchor.blockId;
        break;
      }
    }
    requireJourney(/^blk_[0-9a-f]{24}$/.test(taskBlock ?? ''), 'selection-task-block', leadAnchors);
    const taskWords = await renderer.evaluate(`(window.__j16.block(${JSON.stringify(taskBlock)})?.textContent ?? '').slice(0, 10)`);
    requireJourney(typeof taskWords === 'string' && taskWords.length >= 4, 'selection-task-words');
    const wordsTo = taskWords.length;
    const paragraphText = () => renderer.evaluate(`window.__j16.block(${JSON.stringify(taskBlock)})?.textContent ?? null`);
    const paragraphBefore = await paragraphText();
    const windowLoads = () => renderer.evaluate(`document.querySelector('[data-screen="editor"] [data-window-loads]')?.dataset.windowLoads ?? ''`);
    // On a selection of that paragraph the menu's 就这段发起任务… acts; the house's 可复用工序 would be listed here (S77 deferred item a,
    // J-13's) — this house has none, which the group says once its read answers — 润色这段 alone waits with its reason, the other two
    // prototype presets are gone, and 再选一段加入 is refused in words.
    await openSelectionMenu(renderer, taskBlock, 0, wordsTo, 'selection-task-open-menu');
    await assertRenderer(renderer, `(() => { const item = window.__j16.item('task-on-selection'); const polish = window.__j16.item('preset-polish'); return item instanceof HTMLButtonElement && !item.disabled && item.textContent.startsWith('就这段发起任务…') && polish instanceof HTMLButtonElement && polish.disabled && polish.title === '润色这段尚未接通：要有一项生成修改建议的润色工序' && window.__j16.item('preset-names') === null && window.__j16.item('preset-continuity') === null && window.__j16.menu().textContent.includes('不提供「再选一段加入」'); })()`, 'selection-task-menu-items');
    await waitFor(renderer, `window.__j16.menu()?.textContent.includes('本社还没有启用的可复用工序。') && window.__j16.menu().querySelectorAll('[data-mark-action^="procedure:"]').length === 0 && window.__j16.item('task-on-selection') instanceof HTMLButtonElement`, 'selection-task-menu-procedures-none', 15_000);
    await assertRenderer(renderer, `(() => { window.__j16.item('task-on-selection').click(); return true; })()`, 'selection-task-choose');

    at('selection-task-composer');
    // The composer is anchored to the paragraph and holds only it: the selected words, the Book, the revision and journal position
    // it stands at, how much is selected and where (TASK-002), the Tasks that read a range now, and what is handed over.
    await waitFor(renderer, `window.__j16.composer()?.dataset.markComposer === 'task-on-selection'`, 'selection-task-composer-open', 30_000);
    const composer = await renderer.evaluate(`(() => { const composer = window.__j16.composer(); const select = composer?.querySelector('select[data-mark-field="procedure"]'); return composer === null || !(select instanceof HTMLSelectElement) ? null : { label: composer.getAttribute('aria-label'), quote: composer.querySelector('.editorial-mark-quote')?.textContent ?? null, field: select.closest('label')?.firstElementChild?.textContent ?? null, hint: select.closest('label')?.querySelector('small')?.textContent ?? null, options: Array.from(select.options).map((option) => [option.value, option.textContent]), chosen: select.value, note: composer.querySelector('[data-mark-form-note]')?.textContent ?? null, submit: composer.querySelector('[data-mark-action="submit"]')?.textContent ?? null }; })()`);
    const context = /^《(.+)》 · 修订版 (r\d+) · 修订日志序号 (\d+) · 已选 (\d+) 字 · 第 (\d+) 个内容块$/u.exec(composer?.hint ?? '');
    const position = context?.[5] ?? null;
    const offered = new Map(composer?.options ?? []);
    requireJourney(composer?.label === '就这段发起任务' && composer.quote === taskWords && composer.field === '工序' && context !== null && context[1] === BOOK.title && Number(context[4]) === wordsTo &&
      composer.chosen === '' && offered.get('') === '请选择' && offered.get('reanalyze-range') === '重新分析这段' &&
      offered.get('review:plot-consistency') === '审阅这段 · 「情节逻辑与前后一致」' && !offered.has('review:factual-review') && composer.submit === '准备任务' &&
      composer.note === '只把所选文字所在的这一段交给任务：按包含它的阅读范围读取，计划里写明读哪些范围；审阅只在这一段上标出发现。准备任务先打开计划，由你开始；就选区发起的任务没有快速开始。',
    'selection-task-composer-words', composer);
    // Nothing is prepared before a Task is chosen.
    await assertRenderer(renderer, `window.__j16.act('submit')`, 'selection-task-submit-empty');
    await waitFor(renderer, `window.__j16.composer()?.querySelector('.editorial-mark-problem')?.textContent === '请填写「工序」。' && document.querySelector('#task-drawer')?.hidden === true`, 'selection-task-pick-first', 10_000);

    at('selection-task-review-prepare');
    // 审阅这段 · 「情节逻辑与前后一致」: 准备任务 prepares a 审阅 of 当前选区 — that one paragraph, kept by its identity — and its plan
    // opens in the side slot beside the manuscript, which is unchanged; the composer closes.
    await assertRenderer(renderer, `(() => { const select = window.__j16.composer()?.querySelector('select[data-mark-field="procedure"]'); if (!(select instanceof HTMLSelectElement)) return false; select.value = 'review:plot-consistency'; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value === 'review:plot-consistency'; })()`, 'selection-task-review-choose');
    await assertRenderer(renderer, `window.__j16.act('submit')`, 'selection-task-review-submit');
    await waitFor(renderer, `(() => { const drawer = document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawerView === 'plan' && drawer.dataset.taskPlanKind === 'review-run' && drawer.dataset.taskPlanStart === 'ready' && window.__j16.composer() === null && (drawer.textContent ?? '').includes('按 1 类审阅所选段落：情节逻辑与前后一致') && (drawer.textContent ?? '').includes('只在所选段落上标出发现'); })()`, 'selection-task-review-plan', 120_000);
    const selectionRun = await renderer.evaluate(`window.ai7.inspectReviewWorkspace({ reviewRunId: null }).then((workspace) => workspace.run === null ? null : { reviewRunId: workspace.run.reviewRunId, state: workspace.run.state, scope: workspace.run.scope, categories: workspace.run.categories.map((category) => category.categoryId) })`);
    requireJourney(UUID_PATTERN.test(selectionRun?.reviewRunId ?? '') && selectionRun.state === 'prepared' && JSON.stringify(selectionRun.categories) === JSON.stringify(['plot-consistency']) &&
      selectionRun.scope?.kind === 'selection' && selectionRun.scope.label === `当前选区 · 内容块 ${position}–${position}` &&
      selectionRun.scope.selectedRange?.startPosition === Number(position) && selectionRun.scope.selectedRange.endPosition === Number(position) &&
      selectionRun.scope.selection?.fromBlockId === taskBlock && selectionRun.scope.selection.toBlockId === taskBlock,
    'selection-task-review-recorded', selectionRun);
    requireJourney((await paragraphText()) === paragraphBefore, 'selection-task-manuscript-unchanged');

    at('selection-task-review-card');
    // `← 任务`: the 审阅 waits in 等你处理 and its card names the paragraph it marks.
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'selection-task-review-back');
    const selectionPanel = await waitForPanel(renderer, (panel) => statesOf(panel, 'waiting').includes('review-prepared'), 'selection-task-review-waiting');
    const selectionCard = cardsOf(selectionPanel, 'waiting').find((card) => card.state === 'review-prepared');
    requireJourney(selectionCard.kind === '审阅任务 · 不需要对话' && selectionCard.title === '审阅 · 第 1 次 · 所选段落' && selectionCard.pill === '计划已准备 · 等你开始' &&
      JSON.stringify(selectionCard.actions) === JSON.stringify([['next', '查看计划并开始', 'enabled'], ['jump', '跳到所选文字', 'enabled']]), 'selection-task-review-card-words', selectionCard);

    at('selection-task-jump');
    // 跳到所选文字 (S77 deferred item d): with the caret put on the window's first paragraph, the card's jump moves it to the paragraph
    // the Task was started on — the panel stays beside the text.
    const awayBlock = await renderer.evaluate(`Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')).find((node) => (node.textContent ?? '').length > 0 && node.dataset.blockId !== ${JSON.stringify(taskBlock)})?.dataset.blockId ?? null`);
    requireJourney(/^blk_[0-9a-f]{24}$/.test(awayBlock ?? ''), 'selection-task-jump-away-block');
    await assertRenderer(renderer, `window.__j16.place(${JSON.stringify(awayBlock)}, 0, 0)`, 'selection-task-jump-caret-away');
    await cardAction(renderer, 'review-prepared', 'jump', 'selection-task-jump-click');
    await waitFor(renderer, `(() => { const anchor = getSelection()?.anchorNode ?? null; const block = document.querySelector(${JSON.stringify(`[data-testid="manuscript-editor"] [data-block-id="${taskBlock}"]`)}); return block !== null && anchor !== null && block.contains(anchor) && document.querySelector('#task-drawer')?.dataset.taskDrawerView === 'panel'; })()`, 'selection-task-jumped', 30_000);

    at('selection-task-review-run');
    // Started from its plan, the 审阅 puts the baseline's leads on that paragraph — at least one, every one there — sends
    // nothing, and stands in 最近完成 with 查看结果 under the same name.
    await cardAction(renderer, 'review-prepared', 'next', 'selection-task-review-open-plan');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerView === 'plan' && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled === false`, 'selection-task-review-plan-ready', 60_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'selection-task-review-start');
    await waitFor(renderer, `window.ai7.inspectReviewWorkspace({ reviewRunId: ${JSON.stringify(selectionRun.reviewRunId)} }).then((workspace) => workspace.run?.state === 'settled')`, 'selection-task-review-settled', 120_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'selection-task-review-done-back');
    const reviewedPanel = await waitForPanel(renderer, (panel) => cardsOf(panel, 'recent')[0]?.state === 'review-completed', 'selection-task-review-completed', 60_000);
    const reviewedCard = cardsOf(reviewedPanel, 'recent')[0];
    requireJourney(reviewedCard.title === '审阅 · 第 1 次 · 所选段落' && JSON.stringify(reviewedCard.actions) === JSON.stringify([['result', '查看结果', 'enabled'], ['jump', '跳到所选文字', 'enabled']]), 'selection-task-review-completed-words', reviewedCard);
    const reviewedFindings = await renderer.evaluate(`window.ai7.inspectReviewWorkspace({ reviewRunId: ${JSON.stringify(selectionRun.reviewRunId)} }).then((workspace) => workspace.run.findings.map((finding) => [finding.blockId, finding.markId !== null]))`);
    requireJourney(Array.isArray(reviewedFindings) && reviewedFindings.length > 0 && reviewedFindings.every(([blockId, marked]) => blockId === taskBlock && marked), 'selection-task-review-in-paragraph', reviewedFindings);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'selection-task-review-close');
    // The manuscript on screen reads its window again in place once the 审阅 settles (review P2-6): the lead's mark is on the
    // paragraph the editor started from, without leaving it, and the editor names that load.
    await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden === true && document.querySelector(${JSON.stringify(`[data-screen="editor"] [data-block-id="${taskBlock}"] .editorial-mark[data-mark-source="ai7"]`)}) !== null`, 'selection-task-lead-marked', 60_000);
    // The window on screen was the window the 审阅 read, so only its marks were set on it — nothing open over the text is closed
    // (review P2-7); the editor names that in `data-marks-refreshed`.
    const marksRefreshed = await renderer.evaluate(`document.querySelector('[data-screen="editor"] [data-marks-refreshed]')?.dataset.marksRefreshed ?? ''`);
    requireJourney(marksRefreshed.split(',').includes('review-settled'), 'selection-task-review-settled-marks', { marksRefreshed, loads: await windowLoads() });
    await assertRenderer(renderer, MARK_HELPERS, 'selection-task-mark-helpers');

    at('selection-task-from-mark');
    // From the lead's own 批注: its menu's 就这段发起任务… selects the marked words and opens the same composer, quoting them. While
    // the composer is open nothing pages or reloads it away: it is still there a moment later, and every window load the editor
    // took meanwhile is named in its `data-window-loads`.
    const markWords = await renderer.evaluate(`document.querySelector(${JSON.stringify(`[data-screen="editor"] [data-block-id="${taskBlock}"] .editorial-mark[data-mark-source="ai7"]`)})?.textContent ?? null`);
    requireJourney(typeof markWords === 'string' && markWords.length > 0, 'selection-task-mark-words');
    let markMenu = false;
    for (let attempt = 0; attempt < 20 && !markMenu; attempt += 1) {
      await assertRenderer(renderer, `window.__j16.place(${JSON.stringify(taskBlock)}, 0, 0)`, 'selection-task-mark-caret');
      await new Promise((resolveWait) => setTimeout(resolveWait, 80));
      await assertRenderer(renderer, `window.__j16.rightClick(document.querySelector(${JSON.stringify(`[data-screen="editor"] [data-block-id="${taskBlock}"] .editorial-mark[data-mark-source="ai7"]`)}))`, 'selection-task-mark-right-click');
      markMenu = await renderer.evaluate(`(() => { const menu = window.__j16.menu(); return menu !== null && menu.dataset.markMenu !== 'selection' && window.__j16.item('task-on-selection') instanceof HTMLButtonElement && !window.__j16.item('task-on-selection').disabled; })()`);
      if (!markMenu) {
        await pressEscape(renderer);
        await new Promise((resolveWait) => setTimeout(resolveWait, 120));
      }
    }
    requireJourney(markMenu, 'selection-task-mark-menu');
    await assertRenderer(renderer, `(() => { window.__j16.item('task-on-selection').click(); return true; })()`, 'selection-task-mark-choose');
    await waitFor(renderer, `window.__j16.composer()?.dataset.markComposer === 'task-on-selection' && window.__j16.composer().querySelector('.editorial-mark-quote')?.textContent === ${JSON.stringify(markWords)}`, 'selection-task-mark-composer', 30_000);
    // With 重新分析这段 chosen, a real window load — 全稿位置 asked for the window the editor is on — keeps the composer below its
    // paragraph, with its choice and its words (review P2-5); the load is named in `data-window-loads`.
    await assertRenderer(renderer, `(() => { const select = window.__j16.composer()?.querySelector('select[data-mark-field="procedure"]'); if (!(select instanceof HTMLSelectElement)) return false; select.value = 'reanalyze-range'; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value === 'reanalyze-range'; })()`, 'selection-task-mark-choose-procedure');
    const loadsBefore = await windowLoads();
    await assertRenderer(renderer, `(() => { const rail = document.querySelector('[data-screen="editor"] input#manuscript-position'); if (!(rail instanceof HTMLInputElement)) return false; rail.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`, 'selection-task-rail-load');
    await waitFor(renderer, `(document.querySelector('[data-screen="editor"] [data-window-loads]')?.dataset.windowLoads ?? '') !== ${JSON.stringify(loadsBefore)}`, 'selection-task-load-happened', 30_000);
    const loadsAfter = await windowLoads();
    const kept = await renderer.evaluate(`(() => { const composer = window.__j16.composer(); const block = window.__j16.block(${JSON.stringify(taskBlock)}); if (composer === null || block === null) return null; return { kind: composer.dataset.markComposer, choice: composer.querySelector('select[data-mark-field="procedure"]')?.value ?? null, quote: composer.querySelector('.editorial-mark-quote')?.textContent ?? null, below: composer.getBoundingClientRect().top >= block.getBoundingClientRect().bottom - 1 }; })()`);
    requireJourney(loadsAfter.split(',').at(-1) === 'navigation-proportion' && loadsAfter.split(',').length === Math.min(12, loadsBefore.split(',').filter((entry) => entry.length > 0).length + 1) &&
      kept?.kind === 'task-on-selection' && kept.choice === 'reanalyze-range' && kept.quote === markWords && kept.below === true,
    'selection-task-composer-survives-load', { loadsBefore, loadsAfter, kept });
    // With the composer open, the pane scrolled to an edge that has a window beyond it pages nothing: no window is loaded while a
    // composer is open or asked for (review P3-4: the edge chosen is one 向后浏览 or 向前浏览 says can page).
    const edge = await renderer.evaluate(`(() => { const enabled = (label) => Array.from(document.querySelectorAll('[data-screen="editor"] .window-actions button')).some((button) => button.textContent === label && !button.disabled); return enabled('向后浏览') ? 'end' : enabled('向前浏览') ? 'start' : null; })()`);
    requireJourney(edge === 'end' || edge === 'start', 'selection-task-pane-edge-pageable', edge);
    await assertRenderer(renderer, `(() => { const pane = document.querySelector('[data-screen="editor"] .editor-window'); if (!(pane instanceof HTMLElement)) return false; pane.scrollTop = ${JSON.stringify(edge)} === 'end' ? pane.scrollHeight : 0; pane.dispatchEvent(new Event('scroll')); return true; })()`, 'selection-task-pane-edge');
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
    requireJourney((await windowLoads()) === loadsAfter && await renderer.evaluate(`window.__j16.composer()?.dataset.markComposer === 'task-on-selection'`) === true,
      'selection-task-no-paging-under-composer', { loadsAfter, now: await windowLoads() });

    at('selection-task-reanalyze');
    // 重新分析这段 prepares an analysis update over that paragraph, named by its block identity, its plan opened in the slot naming
    // the ranges it reads again; it waits in 等你处理 as 基线分析 · 重新分析所选范围, and nothing starts behind the editor's back.
    await assertRenderer(renderer, `(() => { const select = window.__j16.composer()?.querySelector('select[data-mark-field="procedure"]'); if (!(select instanceof HTMLSelectElement)) return false; select.value = 'reanalyze-range'; select.dispatchEvent(new Event('change', { bubbles: true })); return window.__j16.act('submit'); })()`, 'selection-task-reanalyze-submit');
    await waitFor(renderer, `(() => { const drawer = document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawerView === 'plan' && drawer.dataset.taskPlanKind === 'baseline-analysis' && drawer.dataset.taskPlanStart === 'ready' && window.__j16.composer() === null && /重新分析 [0-9]+ 个阅读范围（内容块 [0-9]/u.test(drawer.textContent ?? ''); })()`, 'selection-task-reanalyze-plan', 120_000);
    const rangeTask = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis().then((analysis) => ({ mode: analysis.taskIntent?.mode ?? null, run: analysis.run, update: analysis.update === null ? null : { mode: analysis.update.mode, selectedRange: analysis.update.selectedRange } }))`);
    requireJourney(rangeTask?.mode === 'reanalyze-range' && rangeTask.run === null &&
      rangeTask.update?.mode === 'reanalyze-range' && rangeTask.update.selectedRange?.startPosition === Number(position) &&
      rangeTask.update.selectedRange.endPosition === Number(position), 'selection-task-reanalyze-recorded', rangeTask);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="tasks"]', 'selection-task-reanalyze-back');
    const rangePanel = await waitForPanel(renderer, (panel) => statesOf(panel, 'waiting').includes('analysis-prepared'), 'selection-task-reanalyze-waiting');
    const rangeCard = cardsOf(rangePanel, 'waiting').find((card) => card.state === 'analysis-prepared');
    requireJourney(rangeCard.title === '基线分析 · 重新分析所选范围' && JSON.stringify(rangeCard.actions) === JSON.stringify([['next', '查看计划并开始', 'enabled']]) &&
      statesOf(rangePanel, 'running').length === 0, 'selection-task-reanalyze-card', rangePanel);
    requireJourney((await paragraphText()) === paragraphBefore, 'selection-task-reanalyze-manuscript-unchanged');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'selection-task-panel-close');

    at('selection-task-gone');
    // 跳到所选文字 on a paragraph the manuscript no longer holds (Issue #423 review, P2-1). The bounded editor keeps every
    // paragraph, so the one product path that drops one is a reimport: the Book is reimported from a DOCX composed of exact
    // sample1's paragraphs without the Task's, through the import flow as J-01 drives a reimport. The selection Task's card
    // then says the paragraph is gone, in its own words; nothing moves — no window is loaded and no 回到 chip appears.
    const removedPosition = Number(position);
    requireJourney(Number.isInteger(removedPosition) && removedPosition >= 1 && removedPosition <= SAMPLE1_BLOCKS, 'selection-task-gone-position', position);
    // A standing 回到 chip — the unused return an earlier jump left — is used now, while every paragraph it could name still stands
    // (a reimport re-identifies rewritten paragraphs), so the checks after the reimport tell a return place kept by the refused
    // jump from none (review P3-A).
    if (await renderer.evaluate(`${CHIP} !== null`)) {
      await clickSelector(renderer, '[data-screen="editor"] .return-chip-host [data-return-chip]', 'selection-task-gone-chip-use');
      await waitFor(renderer, `${CHIP} === null && (document.querySelector('#persistence-status')?.textContent ?? '').startsWith('已回到')`, 'selection-task-gone-chip-used', 60_000);
    }
    const composedInputs = resolve(runRoot, 'composed-inputs');
    await mkdir(composedInputs, { recursive: true });
    const withoutParagraph = resolve(composedInputs, 'sample1-without-paragraph.docx');
    await composeRevisedAdmittedDocx(withoutParagraph, {
      source: ADMITTED_BASELINE_DOCX, title: BOOK.title,
      paragraphs: Array.from({ length: SAMPLE1_BLOCKS }, (_, index) => index + 1).filter((block) => block !== removedPosition).map((block) => ({ runs: [{ text: { block } }] })),
    });
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    pickerPath = withoutParagraph;
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'selection-task-gone-ready');
    await click(renderer, '导入稿件', 'selection-task-gone-import');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'selection-task-gone-target');
    await assertRenderer(renderer, `(() => { const target = document.querySelector('[data-import-target-choice="existing-book"][data-book-id=${JSON.stringify(bookId)}]'); if (!target) return false; target.click(); return true; })()`, 'selection-task-gone-target-book');
    await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, 'selection-task-gone-relationship');
    await assertRenderer(renderer, `(() => { const reimport = document.querySelector('[data-import-relationship="reimport"]'); if (!reimport) return false; reimport.click(); return true; })()`, 'selection-task-gone-reimport');
    await waitFor(renderer, `document.querySelector('[data-reimport-lineage="unconfirmed"]')`, 'selection-task-gone-lineage-choices');
    await assertRenderer(renderer, `(() => { const lineage = document.querySelector('[data-reimport-lineage="unconfirmed"]'); if (!lineage) return false; lineage.click(); return true; })()`, 'selection-task-gone-lineage');
    await waitFor(renderer, `document.querySelector('[data-create-source-version="true"]')`, 'selection-task-gone-source-choice');
    await assertRenderer(renderer, `(() => { const source = document.querySelector('[data-create-source-version="true"]'); if (!source) return false; source.click(); return true; })()`, 'selection-task-gone-source');
    await waitFor(renderer, `document.querySelector('[data-prepare-manuscript-reimport=${JSON.stringify(bookId)}]')`, 'selection-task-gone-prepare-ready');
    await click(renderer, '准备稿件重新导入比较', 'selection-task-gone-prepare');
    await waitFor(renderer, `document.querySelector('[data-screen="review"] [data-import-review-kind="reimport"]') || document.querySelector('#persistence-status')?.dataset.tone === 'error'`, 'selection-task-gone-review', 180_000);
    requireJourney(await renderer.evaluate(`document.querySelector('#persistence-status')?.dataset.tone !== 'error'`), 'selection-task-gone-review-valid', await renderer.evaluate(`document.querySelector('#persistence-status')?.textContent ?? null`));
    // Every change group the comparison found is decided as J-01 decides them — 改写与新增 where the row has new paragraphs, else
    // 删除 — and a degradation accepted when the composed file asks for one, until the commit is ready. The removed paragraph's
    // group is a 删除.
    const reviewVersion = () => renderer.evaluate(`document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion ?? null`);
    for (let round = 0; round < 80; round += 1) {
      await waitFor(renderer, `document.querySelector('[data-reimport-mappings="failed"]') || (document.querySelector('[data-reimport-mappings="ready"]') && (document.querySelector('[data-accept-reimport-degradation]:not(:disabled)') || document.querySelector('[data-reimport-verb-choice]:not(:disabled)') || document.querySelector('[data-reimport-next-page]:not(:disabled)') || document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportCommitReady === 'true'))`, 'selection-task-gone-mapping-page', 120_000);
      requireJourney(await renderer.evaluate(`document.querySelector('[data-reimport-mappings="failed"]') === null`), 'selection-task-gone-mappings-valid');
      if (await renderer.evaluate(`Boolean(document.querySelector('[data-accept-reimport-degradation]:not(:disabled)'))`)) {
        const before = await reviewVersion();
        await click(renderer, '明确接受完整降级集合', 'selection-task-gone-degradation');
        await waitFor(renderer, `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion !== ${JSON.stringify(before)}`, 'selection-task-gone-degradation-persisted', 60_000);
        continue;
      }
      const row = await renderer.evaluate(`(() => { const row = document.querySelector('article.reimport-group[data-reimport-group-verb=""]'); return row ? { groupId: row.dataset.reimportGroupId, verbs: Array.from(row.querySelectorAll('[data-reimport-verb-choice]'), (choice) => choice.dataset.reimportVerbChoice) } : null; })()`);
      if (row === null) {
        if (await renderer.evaluate(`document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportCommitReady === 'true'`)) break;
        const firstGroup = await renderer.evaluate(`document.querySelector('article.reimport-group')?.dataset.reimportGroupId ?? null`);
        await assertRenderer(renderer, `(() => { const next = document.querySelector('[data-reimport-next-page]:not(:disabled)'); if (!next) return false; next.click(); return true; })()`, 'selection-task-gone-next-page');
        await waitFor(renderer, `document.querySelector('[data-reimport-mappings="ready"]') && document.querySelector('article.reimport-group')?.dataset.reimportGroupId !== ${JSON.stringify(firstGroup)}`, 'selection-task-gone-next-page-ready', 60_000);
        continue;
      }
      const verb = row.verbs.includes('rewrite') ? 'rewrite' : 'delete';
      requireJourney(row.verbs.includes(verb), 'selection-task-gone-row-verb', row);
      const before = await reviewVersion();
      await assertRenderer(renderer, `(() => { const choose = document.querySelector('[data-reimport-verb-choice=${JSON.stringify(verb)}][data-reimport-group-id=${JSON.stringify(row.groupId)}]:not(:disabled)'); if (!choose) return false; choose.click(); return true; })()`, 'selection-task-gone-resolve');
      await waitFor(renderer, `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion !== ${JSON.stringify(before)} || document.querySelector('#persistence-status')?.dataset.tone === 'error'`, 'selection-task-gone-resolution-persisted', 60_000);
      requireJourney(await renderer.evaluate(`document.querySelector('#persistence-status')?.dataset.tone !== 'error'`), 'selection-task-gone-resolution-valid');
    }
    await waitFor(renderer, `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportCommitReady === 'true'`, 'selection-task-gone-commit-ready', 60_000);
    await assertRenderer(renderer, `(() => { const commit = document.querySelector('[data-commit-manuscript-reimport=${JSON.stringify(bookId)}]'); if (!(commit instanceof HTMLButtonElement) || commit.disabled) return false; commit.click(); return true; })()`, 'selection-task-gone-commit');
    // A reimport lands in the manuscript (Issue #412).
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookId)}] .ProseMirror [data-block-id]') !== null`, 'selection-task-gone-landed', 180_000);
    requireJourney(await renderer.evaluate(`document.querySelector('#persistence-status')?.dataset.tone !== 'error'`), 'selection-task-gone-committed', await renderer.evaluate(`document.querySelector('#persistence-status')?.textContent ?? null`));
    // The Task's paragraph is gone from the working manuscript: the service has no window at it.
    const goneAnchor = await renderer.evaluate(`window.ai7.getBookOverview({ bookId: ${JSON.stringify(bookId)}, historyCursor: null }).then((overview) => overview.manuscriptAnchor)`);
    const goneCode = await renderer.evaluate(`window.ai7.getManuscriptWindowAt({ manuscriptId: ${JSON.stringify(goneAnchor?.manuscriptId ?? '')}, branchId: ${JSON.stringify(goneAnchor?.branchId ?? '')}, target: { kind: 'block', blockId: ${JSON.stringify(taskBlock)} } }).then(() => 'present', (error) => error?.code ?? 'unknown')`);
    requireJourney(goneCode === 'WINDOW_NOT_FOUND', 'selection-task-gone-paragraph-gone', goneCode);
    await assertRenderer(renderer, MARK_HELPERS, 'selection-task-gone-helpers');
    // No chip stands and the return store holds no entry for this manuscript — read from the page by the exact key
    // `preserveReturnPlace` writes — before the click, so what the click leaves is the refused jump's alone (review P3-A).
    const READ_RETURN_ENTRY = `new Promise((settle) => { let open; try { open = indexedDB.open('ai7-reading-return', 1); } catch { settle('error'); return; } open.onerror = () => settle('error'); open.onupgradeneeded = () => open.result.createObjectStore('returns'); open.onsuccess = () => { const db = open.result; let entry; let tx; try { tx = db.transaction('returns', 'readonly'); } catch { db.close(); settle('error'); return; } const get = tx.objectStore('returns').get(${JSON.stringify(`${goneAnchor?.manuscriptId ?? ''}\n${goneAnchor?.branchId ?? ''}`)}); get.onsuccess = () => { entry = get.result; }; tx.oncomplete = () => { db.close(); settle(entry === undefined ? null : (entry?.blockId ?? 'malformed')); }; tx.onerror = () => { db.close(); settle('error'); }; }; })`;
    requireJourney(await renderer.evaluate(`${CHIP} === null`), 'selection-task-gone-no-chip-before');
    const returnBefore = await renderer.evaluate(READ_RETURN_ENTRY);
    requireJourney(returnBefore === null, 'selection-task-gone-no-return-before', returnBefore);
    const goneLoadsBefore = await windowLoads();
    const gonePanel = await openPanel(renderer, 'selection-task-gone');
    const goneCard = cardsOf(gonePanel, 'recent').find((card) => card.state === 'review-completed');
    requireJourney(goneCard !== undefined && goneCard.title === '审阅 · 第 1 次 · 所选段落' && goneCard.actions.some(([key, label, state]) => key === 'jump' && label === '跳到所选文字' && state === 'enabled'), 'selection-task-gone-card', gonePanel);
    await cardAction(renderer, 'review-completed', 'jump', 'selection-task-gone-jump');
    await waitFor(renderer, `(document.querySelector('#persistence-status')?.textContent ?? '') === '所选文字所在的段落已不在当前稿件中，无法跳到。' && document.querySelector('#persistence-status')?.dataset.tone === 'error'`, 'selection-task-gone-said', 30_000);
    const goneAfter = await renderer.evaluate(`(() => ({ chip: ${CHIP}?.dataset.returnChip ?? null, loads: document.querySelector('[data-screen="editor"] [data-window-loads]')?.dataset.windowLoads ?? '', panel: document.querySelector('#task-drawer')?.dataset.taskDrawerView ?? null }))()`);
    const returnAfter = await renderer.evaluate(READ_RETURN_ENTRY);
    requireJourney(goneAfter.chip === null && returnAfter === null && goneAfter.loads === goneLoadsBefore && goneAfter.panel === 'panel', 'selection-task-gone-nothing-moved', { loadsBefore: goneLoadsBefore, returnAfter, after: goneAfter });
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'selection-task-gone-panel-close');

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
