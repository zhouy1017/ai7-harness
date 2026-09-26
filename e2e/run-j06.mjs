import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADMITTED_BASELINE_DOCX, composeAdmittedDocx } from './composed-docx.mjs';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// J-06 (Issue #57, plan slice S22; ADR 0085): 稿件冲突 of a single 修改建议. An editor types inside the words
// a suggestion would replace; the suggestion says 原文已变, 接受并应用 is blocked, and 解决冲突… opens 稿件冲突
// with 提案基准, 当前权威稿件 and 提议内容 exactly, nothing preselected and regenerating unavailable with its
// reason. A change elsewhere in a paragraph is no conflict and the card says so (§2). The Resolution Draft's
// quick actions, undo and redo and an edited unit are saved as they happen and come back after a restart;
// 保存为新提案版本 puts a new 修改建议 on the current words that 接受并应用 then writes all or none. 保留当前稿件
// records the rejection with its reason, 暂不处理 records a deferral that keeps the conflict listed and
// blocking, and reversing an Apply whose words were edited goes through the same surface to a Correction
// Proposal. Keyboard, 200% zoom and forced colours are walked through, and a restart keeps every record.
//
// The input is composed at run time from the one admitted Public SampleBook under the content rule in
// docs/agents/ci-test-boundaries.md; every string this runner types is authored here, and manuscript text
// is compared inside the page by equality only. The conflict and the cards are read through `window.ai7`
// only to cross-check what the page shows; the runner never reads the product database.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const EXCERPT = Object.freeze({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '冲突旅程甲' });
const FIRST_SUGGESTION = '〔建议甲〕';
const FIRST_RATIONALE = '与全书用法统一。';
const SECOND_SUGGESTION = '〔建议乙〕';
const THIRD_SUGGESTION = '〔建议丙〕';
const TYPED_INSIDE = '改';
const TYPED_ELSEWHERE = '补';
const MERGED = '〔合并结果〕';
/** One suggestion's words in each paragraph, where the editor types inside them, and where elsewhere. */
const RANGE = Object.freeze([26, 32]);
const INSIDE = 28;
const ELSEWHERE = 2;
// The page's own words (`src/renderer/proposal-conflict-labels.ts`, `src/renderer/editorial-mark-labels.ts`),
// pinned against them by tests/unit/proposal-conflict-labels.test.ts.
const TITLE = '稿件冲突';
const CLASSIFICATION = '需要解决冲突';
const REVERSAL_LINE = '撤销这次应用时遇到冲突：应用后的文字又改过';
const REVERSAL_PROPOSED_LABEL = '提议内容 · 撤销后会恢复的原文';
const CONTEXT_NOTE = '前后文为当前稿件';
const REGENERATE_REASON = '重新生成建议尚未接通';
const RESOLVE_CONFLICT = '解决冲突…';
const SAFE_MERGE = '本段后来改过别处，没有碰到这条建议的原文';
const DRAFT_SAVED = '草稿已保存';
const UNRESOLVED_REASON = '还有 1 处未解决；每一处都选定后才能保存为新提案版本。';
const UNCHANGED_REASON = '解决结果与当前稿件相同，请选「保留当前稿件」。';
const NEW_VERSION_DONE = '已保存为新提案版本 · 尚未应用';
const KEEP_CURRENT_DONE = '已保留当前稿件；稿件没有改动。';
const DEFER_DONE = '已记下暂不处理；这处冲突仍未解决。';
const KEPT_STATE = '已拒绝 · 保留当前稿件';
const NEW_VERSION_SOURCE = '由冲突解决生成的新版本';
const CORRECTION_SOURCE = '由撤销冲突生成的更正建议';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let location = 'entry';
let electronExecutable;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-06', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-06/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-06', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-06' };
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

/** An OS-assigned loopback listener the controller owns for the whole Journey: it must never hear a request. */
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
    server.once('error', () => rejectListen(new Error('J-06/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' &&
      Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-06/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j06-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(new Error('J-06/loopback-close')) : resolveClose());
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
    if (response.error) completion.reject(new Error('J-06/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-06/renderer-cdp-timeout')); }, 60_000);
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
  throw new Error(`J-06/${name}`);
}
async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`), name);
}
async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, name);
}
const KEYS = Object.freeze({
  Tab: Object.freeze({ key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }),
  ArrowDown: Object.freeze({ key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }),
  Escape: Object.freeze({ key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }),
});
async function press(renderer, name) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEYS[name] });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...KEYS[name] });
}
/** Enter as a keyboard sends it: only a key that carries its text activates the focused control. */
async function pressEnter(renderer) {
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, text: '\r', unmodifiedText: '\r' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
}
/** The draft's own undo and redo keys: Ctrl on Windows, Command on macOS (CDP modifiers 2 and 4; Shift is 8). */
async function pressShortcut(renderer, letter, shift = false) {
  const modifiers = (process.platform === 'darwin' ? 4 : 2) | (shift ? 8 : 0);
  const key = shift ? letter.toUpperCase() : letter;
  const code = `Key${letter.toUpperCase()}`;
  const windowsVirtualKeyCode = letter.toUpperCase().charCodeAt(0);
  await renderer.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode, modifiers });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
}

// Everything the page needs to act like a hand: read a block's durable text (a preview's words are not the
// manuscript's), put a selection or a caret into it by offset, right-click the way a pointer does, act on
// the Mark surface by its data attributes, and read and act on 稿件冲突 by its own.
const PAGE_HELPERS = `(() => {
  if (window.__j06) return true;
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
  const conflict = () => document.querySelector('[data-screen="proposal-conflict"] section.proposal-conflict');
  const draft = () => conflict()?.querySelector('[data-conflict-draft]') ?? null;
  const press = (control) => {
    if (!(control instanceof HTMLButtonElement) || control.disabled) return false;
    control.click();
    return true;
  };
  window.__j06 = {
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
    mark: (kind, id) => Array.from(block(id)?.querySelectorAll('.editorial-mark[data-mark-kind="' + kind + '"]') ?? []),
    markById: (markId) => editor()?.querySelector('.editorial-mark[data-mark-id="' + markId + '"]') ?? null,
    menu: () => document.querySelector('.editorial-mark-menu-layer [data-mark-menu]'),
    item: (action) => document.querySelector('.editorial-mark-menu-layer [data-mark-menu] [data-mark-action="' + action + '"]'),
    card: () => layer()?.querySelector('[data-mark-card]') ?? null,
    composer: () => layer()?.querySelector('[data-mark-composer]') ?? null,
    act: (action) => press(layer()?.querySelector('[data-mark-card] [data-mark-action="' + action + '"], [data-mark-composer] [data-mark-action="' + action + '"]')),
    write: (field, value) => {
      const input = layer()?.querySelector('[data-mark-field="' + field + '"]');
      if (!(input instanceof HTMLTextAreaElement)) return false;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    graphemes: (words) => Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(words), (part) => part.segment),
    status: () => document.querySelector('#persistence-status')?.textContent ?? '',
    tone: () => document.querySelector('#persistence-status')?.dataset.tone ?? '',
    conflict,
    conflictAct: (action) => press(conflict()?.querySelector('[data-conflict-action="' + action + '"]')),
    path: (name) => conflict()?.querySelector('[data-conflict-path="' + name + '"] input[type="radio"]') ?? null,
    choosePath: (name) => { const radio = window.__j06.path(name); if (!(radio instanceof HTMLInputElement) || radio.disabled) return false; radio.click(); return radio.checked; },
    units: () => Array.from(conflict()?.querySelectorAll('.proposal-conflict-unit') ?? []),
    pane: (pane) => window.__j06.units().map((unit) => unit.querySelector('[data-conflict-pane="' + pane + '"] [data-conflict-words]')?.dataset.conflictWords ?? '').join(''),
    draft,
    draftUnits: () => Array.from(draft()?.querySelectorAll('li[data-draft-unit]') ?? []),
    draftAct: (action) => press(draft()?.querySelector('[data-draft-toolbar] [data-conflict-action="' + action + '"]')),
    unitAct: (action) => { const units = window.__j06.draftUnits(); return units.length > 0 && units.every((unit) => press(unit.querySelector('[data-conflict-action="' + action + '"]'))); },
    resolutions: () => window.__j06.draftUnits().map((unit) => unit.dataset.unitResolution).join('|'),
    draftText: () => draft()?.querySelector('[data-conflict-draft-text]')?.textContent ?? null,
    draftSave: () => draft()?.querySelector('[data-conflict-draft-status]')?.dataset.draftSave ?? null,
    draftStatus: () => draft()?.querySelector('[data-conflict-draft-status]')?.textContent ?? null,
    saveVersion: () => draft()?.querySelector('[data-conflict-action="save-version"]') ?? null,
    saveReason: () => draft()?.querySelector('[data-conflict-save-reason]') ?? null,
  };
  return true;
})()`;

/**
 * A SHA-256 of words the page holds, so that a comparison across a restart never carries manuscript text
 * out of the page; `null` when the expression is not words.
 */
function digestOf(expression) {
  return `(async () => { const words = ${expression}; if (typeof words !== 'string') return null; const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(words)); return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''); })()`;
}

/** The page's binding for `window.ai7`: the Book's primary Manuscript and branch, by its title. */
const BINDING = `(async () => { const work = (await window.ai7.listPriorWork()).find((entry) => entry.bookTitle === ${JSON.stringify(EXCERPT.title)}); return { manuscriptId: work.manuscriptId, branchId: work.branchId }; })()`;

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

/** Wait until nothing typed is waiting for the journal, and no command is in flight. */
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
    await assertRenderer(renderer, `window.__j06.rightClick(${target})`, `${name}-right-click`);
    if (await renderer.evaluate(`Boolean(${ready})`)) return;
    await press(renderer, 'Escape');
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  throw new Error(`J-06/${name}`);
}

/** A 修改建议 over RANGE of a paragraph, made through the selection menu and its composer. */
async function suggest(renderer, blockId, proposedText, rationale, name) {
  await rightClickUntil(
    renderer,
    `window.__j06.place(${JSON.stringify(blockId)}, ${RANGE[0]}, ${RANGE[1]})`,
    `window.__j06.block(${JSON.stringify(blockId)})`,
    `window.__j06.menu()?.dataset.markMenu === 'selection' && window.__j06.menu().textContent.includes('已选 ${RANGE[1] - RANGE[0]} 字')`,
    `${name}-menu`,
  );
  await assertRenderer(renderer, `(() => { const item = window.__j06.item('add-change-suggestion'); if (!(item instanceof HTMLButtonElement) || item.disabled) return false; item.click(); return true; })()`, `${name}-choose`);
  await waitFor(renderer, `window.__j06.composer()?.dataset.markComposer === 'create-change-suggestion'`, `${name}-composer`);
  await assertRenderer(renderer, `window.__j06.write('proposedText', ${JSON.stringify(proposedText)}) && (${JSON.stringify(rationale)} === '' || window.__j06.write('rationale', ${JSON.stringify(rationale)})) && window.__j06.act('submit')`, `${name}-submit`);
  await waitFor(renderer, `window.__j06.mark('change-suggestion', ${JSON.stringify(blockId)}).length > 0 && window.__j06.composer() === null`, `${name}-drawn`);
  const markId = await renderer.evaluate(`window.__j06.mark('change-suggestion', ${JSON.stringify(blockId)})[0]?.dataset.markId ?? null`);
  requireJourney(UUID_PATTERN.test(markId ?? ''), `${name}-identity`);
  return markId;
}

/** The editor's own typing at one offset of a paragraph, settled through the journal. */
async function typeAt(renderer, blockId, offset, text, name) {
  if (await renderer.evaluate(`window.__j06.card() !== null || window.__j06.menu() !== null`)) await press(renderer, 'Escape');
  await waitFor(renderer, `window.__j06.card() === null && window.__j06.menu() === null`, `${name}-card-closed`, 10_000);
  await assertRenderer(renderer, `window.__j06.place(${JSON.stringify(blockId)}, ${offset}, ${offset}) && document.execCommand('insertText', false, ${JSON.stringify(text)})`, `${name}-typed`);
  await settled(renderer, `${name}-settled`);
}

/**
 * Open one mark's card by its identity. A pointer puts the caret down before its click arrives, and the
 * editor reads that caret a tick later; a click made by the page is asked again until the editor has.
 */
async function openCard(renderer, markId, blockId, name) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`window.__j06.card()?.dataset.markCard === ${JSON.stringify(markId)}`)) return;
    await assertRenderer(renderer, `window.__j06.markById(${JSON.stringify(markId)}) !== null && window.__j06.place(${JSON.stringify(blockId)}, 0, 0)`, `${name}-caret`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await assertRenderer(renderer, `window.__j06.markById(${JSON.stringify(markId)}).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })) || true`, `${name}-click`);
    const settle = Date.now() + 1_500;
    while (Date.now() < settle) {
      if (await renderer.evaluate(`window.__j06.card()?.dataset.markCard === ${JSON.stringify(markId)}`)) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  throw new Error(`J-06/${name}-card`);
}

/** 解决冲突… on an open card, and 稿件冲突 on screen for that mark. */
async function openConflict(renderer, markId, name) {
  await assertRenderer(renderer, `(() => { const control = window.__j06.card()?.querySelector('[data-mark-action="resolve-conflict"]'); if (!(control instanceof HTMLButtonElement) || control.disabled || control.textContent !== ${JSON.stringify(RESOLVE_CONFLICT)}) return false; control.click(); return true; })()`, `${name}-resolve-conflict`);
  await waitFor(renderer, `window.__j06.conflict()?.dataset.conflictMarkId === ${JSON.stringify(markId)} && window.__j06.units().length > 0`, `${name}-workspace`);
}

/** 返回稿件, and the manuscript back with `markId`'s card open again. */
async function returnToManuscript(renderer, markId, name) {
  await assertRenderer(renderer, `window.__j06.conflictAct('return')`, `${name}-return`);
  await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]') && window.__j06.card()?.dataset.markCard === ${JSON.stringify(markId)}`, `${name}-returned`);
}

/** Choose 自行编辑解决草稿 and wait for the Resolution Draft. */
async function openDraft(renderer, name) {
  await assertRenderer(renderer, `window.__j06.choosePath('edit-draft')`, `${name}-choose-draft`);
  await waitFor(renderer, `window.__j06.draft() !== null && window.__j06.draftUnits().length > 0`, `${name}-draft`, 10_000);
}

/** The draft on record is the one on screen: the page says so, and the service holds exactly these resolutions. */
async function draftSaved(renderer, markId, resolutions, name) {
  await waitFor(renderer, `window.__j06.draftSave() === 'saved' && window.__j06.draftStatus() === ${JSON.stringify(DRAFT_SAVED)}`, `${name}-saved`, 15_000);
  const held = await renderer.evaluate(`(async () => { const binding = await ${BINDING}; const conflict = await window.ai7.inspectProposalConflict({ ...binding, markId: ${JSON.stringify(markId)} }); return conflict.draft === null ? null : conflict.draft.resolutions.map((entry) => entry.resolution + ':' + (entry.text ?? '')).join('|'); })()`);
  requireJourney(held === resolutions, `${name}-on-record`, held);
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
      requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j06-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j06-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j06-e2e-'), 'temp-root');
    const inputs = resolve(runRoot, 'composed-inputs');
    await mkdir(inputs);
    const manuscript = resolve(inputs, 'conflicts.docx');
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
      if (picker) args.push('--j06-picker-path', picker);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-06', browser, 'launch');
      cancellation.throwIfRequested();
      return attachRenderer(browser);
    };
    const close = async () => { await browser.close(); browser = undefined; };
    /** After a relaunch: the Book from the prior-work list, its manuscript open, and the page helpers in place. */
    const reopen = async (name) => {
      await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]') && document.querySelector('.recent-work-item button')`, `${name}-prior-work`);
      await assertRenderer(renderer, `(() => { document.querySelector('.recent-work-item button').click(); return true; })()`, `${name}-open`);
      await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] .editorial-mark')`, `${name}-editor-with-marks`);
      await assertRenderer(renderer, PAGE_HELPERS, `${name}-page-helpers`);
    };

    at('import-and-open');
    let renderer = await launch({ picker: manuscript });
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true'`, 'product-ready');
    // The renderer holds the three 稿件冲突 members and nothing that could reach a model or send anything.
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && ['inspectProposalConflict', 'saveProposalConflictDraft', 'resolveProposalConflict'].every((key) => typeof window.ai7[key] === 'function') && !Object.keys(window.ai7).some((key) => /provider|session|scheduler|payload|egress/i.test(key))`, 'renderer-api-boundary');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'renderer-network-denial');
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }
    await importAndOpen(renderer, EXCERPT.title);
    await assertRenderer(renderer, PAGE_HELPERS, 'page-helpers');
    // Three paragraphs long enough to hold a suggestion with room on both sides, whose first 60 code units are 60 graphemes.
    const blocks = await renderer.evaluate(`(() => { const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }); return Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > p[data-block-id]')).filter((node) => { const head = (node.textContent ?? '').slice(0, 60); return head.length === 60 && Array.from(segmenter.segment(head)).length === 60; }).slice(0, 3).map((node) => node.dataset.blockId); })()`);
    requireJourney(Array.isArray(blocks) && blocks.length === 3 && blocks.every((id) => /^blk_[0-9a-f]{24}$/.test(id)), 'markable-paragraphs');
    const [first, second, third] = blocks;
    await assertRenderer(renderer, `(() => { window.__j06Original = { first: window.__j06.text(${JSON.stringify(first)}), second: window.__j06.text(${JSON.stringify(second)}), third: window.__j06.text(${JSON.stringify(third)}) }; return typeof window.__j06Original.first === 'string' && document.querySelectorAll('.editorial-mark').length === 0; })()`, 'original-text-kept');
    cancellation.throwIfRequested();

    at('conflict-open');
    // The editor types inside the words a suggestion would replace: 原文已变, 接受并应用 blocked, and 解决冲突… beside it.
    const firstId = await suggest(renderer, first, FIRST_SUGGESTION, FIRST_RATIONALE, 'first-suggestion');
    await typeAt(renderer, first, INSIDE, TYPED_INSIDE, 'first-inside');
    // The three texts, kept in the page: 提案基准, 当前权威稿件, and the paragraph around them now.
    await assertRenderer(renderer, `(() => { const original = window.__j06Original.first; const now = window.__j06.text(${JSON.stringify(first)}); window.__j06Texts = { base: original.slice(${RANGE[0]}, ${RANGE[1]}), current: original.slice(${RANGE[0]}, ${INSIDE}) + ${JSON.stringify(TYPED_INSIDE)} + original.slice(${INSIDE}, ${RANGE[1]}), now }; return now === original.slice(0, ${INSIDE}) + ${JSON.stringify(TYPED_INSIDE)} + original.slice(${INSIDE}); })()`, 'first-typed-inside-its-words');
    await openCard(renderer, firstId, first, 'first-drifted');
    await assertRenderer(renderer, `(() => {
      const card = window.__j06.card();
      const accept = card.querySelector('[data-mark-action="accept-and-apply"]');
      const resolve = card.querySelector('[data-mark-action="resolve-conflict"]');
      return card.dataset.markAnchor === 'drifted' && card.querySelector('[data-mark-state]')?.textContent === '待你处理 · 原文已变' &&
        accept instanceof HTMLButtonElement && accept.disabled && (document.getElementById(accept.getAttribute('aria-describedby') ?? '')?.textContent ?? '').includes('原文已变') &&
        resolve instanceof HTMLButtonElement && !resolve.disabled && resolve.textContent === ${JSON.stringify(RESOLVE_CONFLICT)} && resolve.classList.contains('primary') &&
        card.querySelector('[data-mark-safe-merge]') === null;
    })()`, 'drifted-card-offers-resolve-conflict');
    await openConflict(renderer, firstId, 'first-conflict');

    at('conflict-three-texts');
    // 稿件冲突: where it is, what it is, the three texts exactly and persistently labelled, the current paragraph's
    // context, the four paths unselected, and regenerating unavailable with its reason.
    await assertRenderer(renderer, `(() => {
      const section = window.__j06.conflict();
      const texts = window.__j06Texts;
      const headings = Array.from(section.querySelectorAll('[data-conflict-pane-heading]')).map((node) => node.dataset.conflictPaneHeading + ':' + node.textContent);
      const units = window.__j06.units();
      const radios = ['keep-current', 'edit-draft', 'regenerate', 'defer'].map((name) => window.__j06.path(name));
      const regenerate = section.querySelector('[data-conflict-unavailable="regenerate"]');
      const after = section.querySelector('[data-conflict-context="after"]')?.textContent ?? '';
      return section.dataset.conflictKind === 'suggestion' && section.dataset.conflictState === 'unresolved' &&
        section.querySelector('h2')?.textContent === ${JSON.stringify(TITLE)} &&
        section.querySelector('[data-conflict-position]')?.textContent === '第 1 处，共 1 处未解决' &&
        section.querySelector('[data-conflict-classification] strong')?.textContent === ${JSON.stringify(CLASSIFICATION)} &&
        JSON.stringify(headings) === '["base:提案基准","current:当前权威稿件","proposed:提议内容"]' &&
        units.length === 1 && units[0].dataset.unitKind === 'conflict' &&
        units.every((unit) => Array.from(unit.querySelectorAll('.proposal-conflict-cell-label')).map((label) => label.textContent).join('|') === '提案基准|当前权威稿件|提议内容') &&
        window.__j06.pane('base') === texts.base && window.__j06.pane('current') === texts.current && window.__j06.pane('proposed') === ${JSON.stringify(FIRST_SUGGESTION)} &&
        section.querySelector('[data-conflict-context-note]')?.textContent === ${JSON.stringify(CONTEXT_NOTE)} &&
        section.querySelector('[data-conflict-context="before"]')?.textContent === '前文：' + window.__j06.graphemes(texts.now).slice(0, ${RANGE[0]}).join('') &&
        after === '后文：' + window.__j06.graphemes(texts.now).slice(${RANGE[1] + TYPED_INSIDE.length}, ${RANGE[1] + TYPED_INSIDE.length + 30}).join('') &&
        radios.every((radio) => radio instanceof HTMLInputElement && !radio.checked) && radios[2].disabled && !radios[0].disabled && !radios[1].disabled && !radios[3].disabled &&
        regenerate?.textContent === ${JSON.stringify(REGENERATE_REASON)} && section.querySelector('[data-conflict-path-detail]')?.dataset.conflictPathDetail === 'none' &&
        window.__j06.draft() === null;
    })()`, 'three-texts-exact-and-nothing-preselected');
    const read = await renderer.evaluate(`(async () => { const binding = await ${BINDING}; const conflict = await window.ai7.inspectProposalConflict({ ...binding, markId: ${JSON.stringify(firstId)} }); return { kind: conflict.conflictKind, base: conflict.base === window.__j06Texts.base, current: conflict.current === window.__j06Texts.current, proposed: conflict.proposed, units: conflict.units.length, draft: conflict.draft, deferral: conflict.deferral, newVersion: conflict.newVersion, navigator: conflict.navigator.entries.map((entry) => entry.markId) }; })()`);
    requireJourney(read?.kind === 'suggestion' && read.base === true && read.current === true && read.proposed === FIRST_SUGGESTION && read.units === 1 &&
      read.draft === null && read.deferral === null && read.newVersion?.available === true && JSON.stringify(read.navigator) === JSON.stringify([firstId]), 'service-agrees-three-texts', read);
    // Nothing was written: the paragraph is what the editor typed, and the card is where it was.
    await returnToManuscript(renderer, firstId, 'first-look');
    await assertRenderer(renderer, `window.__j06.text(${JSON.stringify(first)}) === window.__j06Texts.now`, 'looking-wrote-nothing');
    cancellation.throwIfRequested();

    at('safe-merge-line');
    // A change elsewhere in a paragraph does not touch a suggestion's words: no conflict, 接受并应用 stays, and the card says why.
    const secondId = await suggest(renderer, second, SECOND_SUGGESTION, '', 'second-suggestion');
    await typeAt(renderer, second, ELSEWHERE, TYPED_ELSEWHERE, 'second-elsewhere');
    await openCard(renderer, secondId, second, 'second-safe');
    await assertRenderer(renderer, `(() => {
      const card = window.__j06.card();
      const accept = card.querySelector('[data-mark-action="accept-and-apply"]');
      const line = card.querySelector('[data-mark-safe-merge]');
      return card.dataset.markAnchor === 'exact' && card.querySelector('[data-mark-state]')?.textContent === '待你处理' &&
        accept instanceof HTMLButtonElement && !accept.disabled && line?.textContent === ${JSON.stringify(SAFE_MERGE)} &&
        card.querySelector('[data-mark-action="resolve-conflict"]') === null;
    })()`, 'safe-merge-line-beside-an-available-apply');
    const safe = await renderer.evaluate(`(async () => { const binding = await ${BINDING}; const card = await window.ai7.getEditorialMarkCard({ ...binding, markId: ${JSON.stringify(secondId)} }); return { changedElsewhere: card.changedElsewhere, conflict: card.conflict, anchorState: card.anchorState }; })()`);
    requireJourney(safe?.changedElsewhere === true && safe.conflict === null && safe.anchorState === 'exact', 'service-agrees-safe-merge', safe);

    at('draft-quick-actions');
    // 自行编辑解决草稿: one changed unit, unresolved; each quick action is saved as it happens, and 保存为新提案版本
    // waits with its reason in words until the draft is complete and says something the manuscript does not.
    await openCard(renderer, firstId, first, 'draft-card');
    await openConflict(renderer, firstId, 'draft-conflict');
    await openDraft(renderer, 'draft');
    await assertRenderer(renderer, `(() => { const save = window.__j06.saveVersion(); return window.__j06.resolutions() === 'unresolved' && window.__j06.draftUnits()[0].dataset.unitKind === 'conflict' && save instanceof HTMLButtonElement && save.disabled && save.dataset.saveBlocker === 'unresolved' && window.__j06.saveReason()?.textContent === ${JSON.stringify(UNRESOLVED_REASON)} && window.__j06.draft().querySelector('[data-conflict-action="include-non-conflicting"]') === null && window.__j06.draftText() === window.__j06Texts.current; })()`, 'draft-starts-unresolved');
    await assertRenderer(renderer, `window.__j06.unitAct('take-current')`, 'take-current');
    await draftSaved(renderer, firstId, 'current:', 'take-current');
    await assertRenderer(renderer, `(() => { const save = window.__j06.saveVersion(); return window.__j06.resolutions() === 'current' && window.__j06.draftText() === window.__j06Texts.current && save.disabled && save.dataset.saveBlocker === 'unchanged' && window.__j06.saveReason()?.textContent === ${JSON.stringify(UNCHANGED_REASON)}; })()`, 'current-alone-is-no-new-version');

    at('draft-undo-redo');
    // Undo and redo are the draft's own, by button and by key.
    await assertRenderer(renderer, `window.__j06.draftAct('undo')`, 'undo-button');
    await draftSaved(renderer, firstId, 'unresolved:', 'undo-button');
    await assertRenderer(renderer, `window.__j06.draftAct('redo')`, 'redo-button');
    await draftSaved(renderer, firstId, 'current:', 'redo-button');
    await assertRenderer(renderer, `(() => { const control = window.__j06.draftUnits()[0].querySelector('[data-conflict-action="take-proposed"]'); control.focus(); return document.activeElement === control; })()`, 'focus-inside-draft');
    await pressShortcut(renderer, 'z');
    await waitFor(renderer, `window.__j06.resolutions() === 'unresolved' && window.__j06.draft().contains(document.activeElement)`, 'undo-key', 10_000);
    await pressShortcut(renderer, 'z', true);
    await waitFor(renderer, `window.__j06.resolutions() === 'current'`, 'redo-shift-key', 10_000);
    await pressShortcut(renderer, 'z');
    await waitFor(renderer, `window.__j06.resolutions() === 'unresolved'`, 'undo-key-again', 10_000);
    await pressShortcut(renderer, 'y');
    await waitFor(renderer, `window.__j06.resolutions() === 'current'`, 'redo-y-key', 10_000);
    await draftSaved(renderer, firstId, 'current:', 'keys');
    // 两者都保留 asks for the order and keeps both in it.
    await assertRenderer(renderer, `window.__j06.unitAct('keep-both')`, 'keep-both-open');
    await waitFor(renderer, `window.__j06.draftUnits()[0].querySelector('[data-conflict-action="keep-both-proposed-first"]') !== null && window.__j06.draftUnits()[0].querySelector('[data-conflict-action="keep-both"]')?.getAttribute('aria-expanded') === 'true'`, 'keep-both-asks-order', 10_000);
    await assertRenderer(renderer, `window.__j06.unitAct('keep-both-proposed-first')`, 'keep-both-proposed-first');
    await draftSaved(renderer, firstId, 'both-proposed-first:', 'keep-both');
    await assertRenderer(renderer, `window.__j06.draftText() === ${JSON.stringify(FIRST_SUGGESTION)} + window.__j06Texts.current && window.__j06.saveVersion()?.disabled === false && window.__j06.saveReason()?.hidden === true`, 'keep-both-in-the-chosen-order');

    at('draft-edited-unit');
    // 编辑合并结果: the editor's own words, typed into the unit's field as a keyboard would, saved once typing rests.
    await assertRenderer(renderer, `window.__j06.unitAct('edit-unit')`, 'edit-unit-open');
    await waitFor(renderer, `(() => { const field = window.__j06.draftUnits()[0].querySelector('textarea[data-draft-unit-editor]'); return field instanceof HTMLTextAreaElement && document.activeElement === field && field.value === ${JSON.stringify(FIRST_SUGGESTION)} + window.__j06Texts.current; })()`, 'edit-unit-field-focused', 10_000);
    await assertRenderer(renderer, `(() => { const field = document.activeElement; field.select(); return field.selectionStart === 0 && field.selectionEnd === field.value.length; })()`, 'edit-unit-select-all');
    await renderer.send('Input.insertText', { text: MERGED });
    await waitFor(renderer, `document.activeElement instanceof HTMLTextAreaElement && document.activeElement.value === ${JSON.stringify(MERGED)} && window.__j06.draftText() === ${JSON.stringify(MERGED)}`, 'edit-unit-typed', 10_000);
    await draftSaved(renderer, firstId, `edited:${MERGED}`, 'edited');
    await assertRenderer(renderer, `window.__j06.unitAct('done-editing')`, 'edit-unit-done');
    await waitFor(renderer, `window.__j06.resolutions() === 'edited' && (window.__j06.draftUnits()[0].querySelector('[data-draft-unit-heading]')?.textContent ?? '').endsWith('已编辑合并结果') && window.__j06.saveVersion()?.disabled === false`, 'edited-unit-resolved', 10_000);
    cancellation.throwIfRequested();

    at('draft-restart');
    // A relaunch keeps the draft exactly, and nothing of it reached the manuscript: the paragraph is the one the
    // editor left, compared across the restart by its digest.
    const paragraphBefore = await renderer.evaluate(digestOf('window.__j06Texts.now'));
    requireJourney(/^[0-9a-f]{64}$/.test(paragraphBefore ?? ''), 'draft-restart-digest-before');
    await close();
    renderer = await launch();
    await reopen('draft-restart');
    const paragraphAfter = await renderer.evaluate(digestOf(`window.__j06.text(${JSON.stringify(first)})`));
    requireJourney(paragraphAfter === paragraphBefore, 'draft-restart-manuscript-unchanged');
    await assertRenderer(renderer, `(() => { window.__j06Texts = { now: window.__j06.text(${JSON.stringify(first)}) }; return typeof window.__j06Texts.now === 'string'; })()`, 'draft-restart-now');
    await openCard(renderer, firstId, first, 'draft-restart-card');
    await openConflict(renderer, firstId, 'draft-restart-conflict');
    await assertRenderer(renderer, `(() => { const section = window.__j06.conflict(); window.__j06Texts.base = window.__j06.pane('base'); window.__j06Texts.current = window.__j06.pane('current'); return section.querySelector('[data-conflict-rebased]') === null && window.__j06.units().length === 1 && window.__j06Texts.now.slice(${RANGE[0]}, ${RANGE[1] + TYPED_INSIDE.length}) === window.__j06Texts.current; })()`, 'draft-restart-same-basis');
    await openDraft(renderer, 'draft-restart');
    await assertRenderer(renderer, `window.__j06.resolutions() === 'edited' && window.__j06.draftText() === ${JSON.stringify(MERGED)} && window.__j06.draftSave() === 'saved' && window.__j06.draftStatus() === ${JSON.stringify(DRAFT_SAVED)} && window.__j06.saveVersion()?.disabled === false`, 'draft-restored-exactly');
    await draftSaved(renderer, firstId, `edited:${MERGED}`, 'draft-restart');

    at('new-version');
    // 保存为新提案版本: a new 修改建议 on the current words, not accepted and not applied; the old one is retired
    // and the manuscript is unchanged. The card of the new version opens where the old one was.
    await assertRenderer(renderer, `(() => { const save = window.__j06.saveVersion(); if (!(save instanceof HTMLButtonElement) || save.disabled) return false; save.click(); return true; })()`, 'save-new-version');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]') && window.__j06.card() !== null && window.__j06.card().dataset.markCard !== ${JSON.stringify(firstId)} && window.__j06.status().includes(${JSON.stringify(NEW_VERSION_DONE)})`, 'new-version-card', 60_000);
    const versionId = await renderer.evaluate(`window.__j06.card().dataset.markCard`);
    requireJourney(UUID_PATTERN.test(versionId ?? ''), 'new-version-identity');
    await assertRenderer(renderer, `(() => {
      const card = window.__j06.card();
      const accept = card.querySelector('[data-mark-action="accept-and-apply"]');
      return card.dataset.markKind === 'change-suggestion' && card.dataset.markAnchor === 'exact' && card.querySelector('[data-mark-state]')?.textContent === '待你处理' &&
        (card.querySelector('[data-mark-source]')?.textContent ?? '').includes(${JSON.stringify(NEW_VERSION_SOURCE)}) &&
        card.querySelector('[data-mark-region="content"] del')?.textContent === window.__j06Texts.current &&
        card.querySelector('[data-mark-region="content"] ins')?.textContent === ${JSON.stringify(MERGED)} &&
        (card.querySelector('[data-mark-region="rationale"]')?.textContent ?? '').includes(${JSON.stringify(FIRST_RATIONALE)}) &&
        accept instanceof HTMLButtonElement && !accept.disabled && card.querySelector('[data-mark-action="resolve-conflict"]') === null &&
        card.querySelector('[data-mark-application]') === null && window.__j06.markById(${JSON.stringify(firstId)}) === null &&
        window.__j06.text(${JSON.stringify(first)}) === window.__j06Texts.now;
    })()`, 'new-version-exact-and-not-applied');
    const versioned = await renderer.evaluate(`(async () => { const binding = await ${BINDING}; const card = await window.ai7.getEditorialMarkCard({ ...binding, markId: ${JSON.stringify(versionId)} }); const old = await window.ai7.getEditorialMarkCard({ ...binding, markId: ${JSON.stringify(firstId)} }).then(() => 'live', () => 'gone'); return { status: card.status, resolvedFrom: card.resolvedFrom, convertedFrom: card.convertedFrom?.markId ?? null, decision: card.suggestion?.decision ?? null, proposed: card.suggestion?.proposedText, old }; })()`);
    requireJourney(versioned?.status === 'open' && versioned.resolvedFrom?.markId === firstId && versioned.resolvedFrom.conflictKind === 'suggestion' &&
      versioned.convertedFrom === firstId && versioned.decision === null && versioned.proposed === MERGED && versioned.old === 'gone', 'service-agrees-new-version', versioned);

    at('new-version-applied');
    // 接受并应用 on the new version writes its words over exactly its range, all or none.
    await assertRenderer(renderer, `window.__j06.act('accept-and-apply')`, 'new-version-accept-and-apply');
    await waitFor(renderer, `window.__j06.card()?.querySelector('[data-mark-application]') && window.__j06.text(${JSON.stringify(first)}) === window.__j06Texts.now.slice(0, ${RANGE[0]}) + ${JSON.stringify(MERGED)} + window.__j06Texts.now.slice(${RANGE[1] + TYPED_INSIDE.length})`, 'new-version-written', 60_000);
    await assertRenderer(renderer, `window.__j06.card().querySelector('[data-mark-state]')?.textContent === '已应用' && window.__j06.markById(${JSON.stringify(versionId)})?.dataset.markStatus === 'applied'`, 'new-version-applied-with-its-receipt');
    await assertRenderer(renderer, `(() => { window.__j06Applied = window.__j06.text(${JSON.stringify(first)}); window.__j06Replaced = window.__j06Texts.current; return true; })()`, 'applied-text-kept');
    cancellation.throwIfRequested();

    at('keep-current');
    // 保留当前稿件 over a suggestion conflict: its rejection with the reason 保留当前稿件, final, and nothing written.
    const thirdId = await suggest(renderer, third, THIRD_SUGGESTION, '', 'third-suggestion');
    await typeAt(renderer, third, INSIDE, TYPED_INSIDE, 'third-inside');
    await assertRenderer(renderer, `(() => { window.__j06Third = window.__j06.text(${JSON.stringify(third)}); return typeof window.__j06Third === 'string'; })()`, 'third-text-kept');
    await openCard(renderer, thirdId, third, 'third-drifted');
    await openConflict(renderer, thirdId, 'third-conflict');
    await assertRenderer(renderer, `window.__j06.choosePath('keep-current')`, 'choose-keep-current');
    await waitFor(renderer, `window.__j06.conflict().querySelector('[data-conflict-path-detail]')?.dataset.conflictPathDetail === 'keep-current' && window.__j06.conflict().querySelector('[data-conflict-action="confirm-keep-current"]')?.textContent === '确认保留当前稿件'`, 'keep-current-states-its-consequence', 10_000);
    await assertRenderer(renderer, `window.__j06.conflictAct('confirm-keep-current')`, 'confirm-keep-current');
    await waitFor(renderer, `window.__j06.card()?.dataset.markCard === ${JSON.stringify(thirdId)} && window.__j06.status().includes(${JSON.stringify(KEEP_CURRENT_DONE)})`, 'keep-current-returns', 60_000);
    await assertRenderer(renderer, `(() => {
      const card = window.__j06.card();
      return card.querySelector('[data-mark-state]')?.textContent === ${JSON.stringify(KEPT_STATE)} && card.querySelector('[data-mark-decision]')?.textContent === ${JSON.stringify(KEPT_STATE)} &&
        card.querySelector('[data-mark-reason]')?.textContent === '你的原因：保留当前稿件' && card.querySelector('[data-mark-reason]').dataset.markReason === 'suggested' &&
        card.querySelector('[data-mark-action="withdraw"]') === null && card.querySelector('[data-mark-action="resolve-conflict"]') === null &&
        window.__j06.text(${JSON.stringify(third)}) === window.__j06Third;
    })()`, 'kept-as-the-manuscript-is');

    at('defer');
    // 暂不处理: a deferral; the conflict stays unresolved, listed and blocking, and its card says since when.
    await typeAt(renderer, second, RANGE[0] + TYPED_ELSEWHERE.length + 2, TYPED_INSIDE, 'second-inside');
    await openCard(renderer, secondId, second, 'second-drifted');
    await openConflict(renderer, secondId, 'second-conflict');
    await assertRenderer(renderer, `window.__j06.conflict().querySelector('[data-conflict-position]')?.textContent === '第 1 处，共 1 处未解决'`, 'only-this-one-unresolved');
    await assertRenderer(renderer, `window.__j06.choosePath('defer')`, 'choose-defer');
    await assertRenderer(renderer, `window.__j06.conflictAct('confirm-defer')`, 'confirm-defer');
    await waitFor(renderer, `window.__j06.card()?.dataset.markCard === ${JSON.stringify(secondId)} && window.__j06.status().includes(${JSON.stringify(DEFER_DONE)})`, 'defer-returns', 60_000);
    await assertRenderer(renderer, `(() => {
      const card = window.__j06.card();
      const accept = card.querySelector('[data-mark-action="accept-and-apply"]');
      return (card.querySelector('[data-mark-state]')?.textContent ?? '').startsWith('待你处理 · 原文已变 · 暂不处理 · ') && accept instanceof HTMLButtonElement && accept.disabled &&
        card.querySelector('[data-mark-action="resolve-conflict"]') !== null && window.__j06.markById(${JSON.stringify(secondId)})?.dataset.markAnchor === 'drifted';
    })()`, 'deferred-still-blocks-and-says-since-when');
    await openConflict(renderer, secondId, 'deferred-conflict');
    await assertRenderer(renderer, `(() => { const section = window.__j06.conflict(); return section.dataset.conflictState === 'deferred' && (section.querySelector('[data-conflict-deferred]')?.textContent ?? '').endsWith('暂不处理；这处冲突仍未解决。') && section.querySelector('[data-conflict-position]')?.textContent === '第 1 处，共 1 处未解决'; })()`, 'deferred-is-counted-unresolved');
    await returnToManuscript(renderer, secondId, 'deferred-look');
    cancellation.throwIfRequested();

    at('attention-conflict-row');
    // 待我处理 (Issue #424; V2-UX-ATTN-002): the conflict put aside is 异常与结果待确认's — blocking, from the moment 暂不处理
    // was recorded — and its 解决冲突… opens 稿件冲突 of exactly that suggestion.
    await assertRenderer(renderer, `(() => { const entry = document.querySelector('#global-attention-entry'); if (!(entry instanceof HTMLButtonElement) || entry.disabled) return false; entry.click(); return true; })()`, 'attention-entry');
    await waitFor(renderer, `document.querySelector('[data-screen="global-attention"] .global-attention-host')?.dataset.attentionCount !== undefined && document.querySelectorAll('[data-screen="global-attention"] section.global-attention-group').length === 4`, 'attention-painted');
    const conflictRow = await renderer.evaluate(`(() => {
      const item = document.querySelector('[data-screen="global-attention"] li.global-attention-item[data-attention-item=${JSON.stringify(`conflict:${secondId}`)}]');
      if (!(item instanceof HTMLElement)) return null;
      return {
        group: item.closest('section.global-attention-group')?.dataset.attentionGroup ?? null, state: item.dataset.attentionState, blocked: item.dataset.attentionBlocked,
        target: item.dataset.attentionTarget, pill: item.querySelector('.global-attention-pill')?.textContent ?? null,
        object: item.querySelector('button.global-attention-open')?.textContent ?? null, reason: item.querySelector('.global-attention-reason')?.textContent ?? null,
        next: item.querySelector('.global-attention-next')?.textContent ?? null,
      };
    })()`);
    requireJourney(conflictRow?.group === 'exceptions' && conflictRow.state === 'manuscript-conflict-deferred' && conflictRow.blocked === 'true' &&
      conflictRow.target === 'manuscript-conflict' && conflictRow.pill === '需要解决冲突 · 暂不处理' && conflictRow.object === '修改建议 · 稿件冲突' &&
      conflictRow.reason === '建议所依据的原文已经改过；在解决之前不能接受或应用这条建议。已记下暂不处理，这处冲突仍未解决。' &&
      conflictRow.next === '安全的下一步：解决冲突…', 'attention-conflict-row', conflictRow);
    await assertRenderer(renderer, `(() => { const open = document.querySelector('[data-screen="global-attention"] button.global-attention-open[data-attention-open=${JSON.stringify(`conflict:${secondId}`)}]'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'attention-conflict-open');
    await waitFor(renderer, `window.__j06.conflict()?.dataset.conflictMarkId === ${JSON.stringify(secondId)} && window.__j06.conflict().dataset.conflictState === 'deferred' && window.__j06.units().length > 0`, 'attention-conflict-workspace');
    await returnToManuscript(renderer, secondId, 'attention-conflict-return');
    cancellation.throwIfRequested();

    at('reversal');
    // The words an Apply wrote are edited afterwards: reversing it is blocked, and 解决冲突… compares them with the
    // words the Apply replaced. A new version there is a Correction Proposal that 接受并应用 writes.
    await typeAt(renderer, first, RANGE[0] + 2, TYPED_INSIDE, 'applied-inside');
    await assertRenderer(renderer, `(() => { window.__j06Reversal = { now: window.__j06.text(${JSON.stringify(first)}) }; return window.__j06Reversal.now === window.__j06Applied.slice(0, ${RANGE[0] + 2}) + ${JSON.stringify(TYPED_INSIDE)} + window.__j06Applied.slice(${RANGE[0] + 2}); })()`, 'applied-words-edited');
    await openCard(renderer, versionId, first, 'reversal-card');
    await assertRenderer(renderer, `(() => {
      const card = window.__j06.card();
      const reverse = card.querySelector('[data-mark-action="prepare-reverse"]');
      return card.querySelector('[data-mark-state]')?.textContent === '已应用 · 之后又改过' && reverse instanceof HTMLButtonElement && reverse.disabled &&
        card.querySelector('[data-mark-action="resolve-conflict"]') !== null;
    })()`, 'reversal-blocked-and-offers-resolve-conflict');
    await openConflict(renderer, versionId, 'reversal-conflict');
    await assertRenderer(renderer, `(() => {
      const section = window.__j06.conflict();
      const proposedLabel = section.querySelector('[data-conflict-pane-heading="proposed"]')?.textContent;
      return section.dataset.conflictKind === 'reversal' && (section.querySelector('[data-conflict-classification]')?.textContent ?? '').includes(${JSON.stringify(REVERSAL_LINE)}) &&
        proposedLabel === ${JSON.stringify(REVERSAL_PROPOSED_LABEL)} && window.__j06.pane('base') === ${JSON.stringify(MERGED)} &&
        window.__j06.pane('current') === window.__j06Reversal.now.slice(${RANGE[0]}, ${RANGE[0] + 1 + [...MERGED].length}) && window.__j06.pane('proposed') === window.__j06Replaced;
    })()`, 'reversal-compares-with-the-replaced-words');
    await openDraft(renderer, 'reversal');
    await assertRenderer(renderer, `window.__j06.unitAct('take-proposed')`, 'reversal-take-proposed');
    await draftSaved(renderer, versionId, 'proposed:', 'reversal');
    await assertRenderer(renderer, `(() => { const save = window.__j06.saveVersion(); if (!(save instanceof HTMLButtonElement) || save.disabled) return false; save.click(); return true; })()`, 'reversal-save-new-version');
    await waitFor(renderer, `window.__j06.card() !== null && window.__j06.card().dataset.markCard !== ${JSON.stringify(versionId)} && window.__j06.status().includes(${JSON.stringify(NEW_VERSION_DONE)})`, 'correction-card', 60_000);
    const correctionId = await renderer.evaluate(`window.__j06.card().dataset.markCard`);
    requireJourney(UUID_PATTERN.test(correctionId ?? ''), 'correction-identity');
    await assertRenderer(renderer, `(() => {
      const card = window.__j06.card();
      return (card.querySelector('[data-mark-source]')?.textContent ?? '').includes(${JSON.stringify(CORRECTION_SOURCE)}) && card.querySelector('[data-mark-state]')?.textContent === '待你处理' &&
        card.querySelector('[data-mark-region="content"] ins')?.textContent === window.__j06Replaced && window.__j06.text(${JSON.stringify(first)}) === window.__j06Reversal.now;
    })()`, 'correction-proposal-not-applied');
    const corrected = await renderer.evaluate(`(async () => { const binding = await ${BINDING}; const applied = await window.ai7.getEditorialMarkCard({ ...binding, markId: ${JSON.stringify(versionId)} }); const correction = await window.ai7.getEditorialMarkCard({ ...binding, markId: ${JSON.stringify(correctionId)} }); return { applied: applied.status, conflict: applied.conflict, resolvedFrom: correction.resolvedFrom, convertedFrom: correction.convertedFrom }; })()`);
    requireJourney(corrected?.applied === 'applied' && corrected.conflict?.state === 'resolved' && corrected.conflict.outcome === 'new-version' && corrected.conflict.newMarkId === correctionId &&
      corrected.resolvedFrom?.markId === versionId && corrected.resolvedFrom.conflictKind === 'reversal' && corrected.convertedFrom === null, 'service-agrees-correction', corrected);

    at('reversal-correction-applied');
    await assertRenderer(renderer, `window.__j06.act('accept-and-apply')`, 'correction-accept-and-apply');
    await waitFor(renderer, `window.__j06.card()?.querySelector('[data-mark-application]') && window.__j06.text(${JSON.stringify(first)}) === window.__j06Reversal.now.slice(0, ${RANGE[0]}) + window.__j06Replaced + window.__j06Reversal.now.slice(${RANGE[0] + 1 + [...MERGED].length})`, 'correction-written', 60_000);
    await press(renderer, 'Escape');
    cancellation.throwIfRequested();

    at('j14-conflict-keyboard');
    // Without a pointer: an arrow chooses 自行编辑解决草稿, Tab reaches the draft with visible focus, Enter acts,
    // the draft's own keys undo and redo, and Enter on 返回稿件 leaves.
    await openCard(renderer, secondId, second, 'keyboard-card');
    await openConflict(renderer, secondId, 'keyboard-conflict');
    await assertRenderer(renderer, `(() => { const radio = window.__j06.path('keep-current'); radio.focus(); return document.activeElement === radio && !radio.checked; })()`, 'keyboard-first-path-focused');
    await press(renderer, 'ArrowDown');
    await waitFor(renderer, `window.__j06.path('edit-draft')?.checked === true && document.activeElement === window.__j06.path('edit-draft') && window.__j06.draft() !== null`, 'keyboard-arrow-chooses-draft', 10_000);
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement?.dataset.conflictAction === 'previous-unresolved' && document.activeElement.matches(':focus-visible')`, 'keyboard-reaches-the-draft', 10_000);
    await pressEnter(renderer);
    await waitFor(renderer, `document.activeElement?.dataset.draftUnitHeading === 'true'`, 'keyboard-unresolved-unit-in-view', 10_000);
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement?.dataset.conflictAction === 'take-current' && document.activeElement.matches(':focus-visible')`, 'keyboard-reaches-a-quick-action', 10_000);
    await pressEnter(renderer);
    await waitFor(renderer, `window.__j06.resolutions() === 'current' && document.activeElement?.dataset.conflictAction === 'take-current'`, 'keyboard-quick-action', 10_000);
    await pressShortcut(renderer, 'z');
    await waitFor(renderer, `window.__j06.resolutions() === 'unresolved' && window.__j06.draft().contains(document.activeElement)`, 'keyboard-undo', 10_000);
    await pressShortcut(renderer, 'y');
    await waitFor(renderer, `window.__j06.resolutions() === 'current'`, 'keyboard-redo', 10_000);
    await draftSaved(renderer, secondId, 'current:', 'keyboard');
    await assertRenderer(renderer, `(() => { const back = window.__j06.conflict().querySelector('[data-conflict-action="return"]'); back.focus(); return document.activeElement === back; })()`, 'keyboard-return-focused');
    await pressEnter(renderer);
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]') && window.__j06.card()?.dataset.markCard === ${JSON.stringify(secondId)}`, 'keyboard-returns', 60_000);

    at('j14-conflict-zoom-200-reflow');
    // At 200% the three panes stack, every cell keeps its pane's label, and nothing scrolls sideways.
    await openConflict(renderer, secondId, 'zoom-conflict');
    await openDraft(renderer, 'zoom');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => {
      const root = document.documentElement;
      const section = window.__j06.conflict();
      const parts = [section, section?.querySelector('.proposal-conflict-panes'), section?.querySelector('[data-conflict-paths]'), window.__j06.draft(), section?.querySelector('.workbench-actions')];
      const labels = Array.from(section?.querySelectorAll('.proposal-conflict-cell-label') ?? []);
      const cells = Array.from(section?.querySelectorAll('.proposal-conflict-unit [data-conflict-pane]') ?? []);
      return parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2 &&
        labels.length === 3 && labels.every((label) => getComputedStyle(label).display !== 'none') &&
        cells.length === 3 && new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().left))).size === 1;
    })()`, 'conflict-reflows-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-conflict-forced-colors');
    // Without colour a conflict unit keeps its heavier left border, the chosen path its heavier frame, and the
    // classification its dashed line: nothing here is said by colour alone.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const style = (node) => getComputedStyle(node);
      const unit = window.__j06.units()[0];
      const chosen = window.__j06.path('edit-draft').closest('label');
      const other = window.__j06.path('keep-current').closest('label');
      const classification = window.__j06.conflict().querySelector('[data-conflict-classification]');
      return unit.dataset.unitKind === 'conflict' && style(unit).borderLeftStyle === 'solid' && parseFloat(style(unit).borderLeftWidth) > parseFloat(style(unit).borderTopWidth) &&
        parseFloat(style(chosen).borderTopWidth) > parseFloat(style(other).borderTopWidth) && style(classification).borderTopStyle === 'dashed' &&
        style(window.__j06.draft()).borderTopStyle === 'dashed';
    })()`, 'conflict-speaks-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await returnToManuscript(renderer, secondId, 'forced-colors');
    await press(renderer, 'Escape');
    await settled(renderer, 'before-restart-settled');
    cancellation.throwIfRequested();

    at('restart-keeps-every-record');
    // A restart keeps every record: the new version and the Correction Proposal applied, the kept suggestion
    // rejected with its reason, and the deferred conflict deferred with its draft.
    // The records are read whole in the page; what leaves it is their digest and the facts the stage checks,
    // never the words they hold.
    const SNAPSHOT = `(async () => {
      const binding = await ${BINDING};
      const card = async (markId) => {
        const read = await window.ai7.getEditorialMarkCard({ ...binding, markId });
        return { markId: read.markId, status: read.status, anchorState: read.anchorState, pinnedText: read.pinnedText, conflict: read.conflict, resolvedFrom: read.resolvedFrom,
          convertedFrom: read.convertedFrom, decision: read.suggestion?.decision ?? null, currentText: read.suggestion?.currentText ?? null, proposedText: read.suggestion?.proposedText ?? null,
          applied: read.suggestion?.application?.effectId ?? null };
      };
      const deferred = await window.ai7.inspectProposalConflict({ ...binding, markId: ${JSON.stringify(secondId)} });
      const old = await window.ai7.getEditorialMarkCard({ ...binding, markId: ${JSON.stringify(firstId)} }).then(() => 'live', () => 'gone');
      const records = { version: await card(${JSON.stringify(versionId)}), correction: await card(${JSON.stringify(correctionId)}), kept: await card(${JSON.stringify(thirdId)}),
        deferredCard: await card(${JSON.stringify(secondId)}), deferral: deferred.deferral, draft: deferred.draft, basis: deferred.basisDigest, old };
      return {
        digest: await ${digestOf('JSON.stringify(records)')},
        facts: {
          kept: [records.kept.status, records.kept.decision?.disposition ?? null, records.kept.decision?.reason ?? null, records.kept.decision?.reasonSource ?? null, records.kept.conflict?.outcome ?? null],
          deferred: [records.deferredCard.conflict?.state ?? null, records.deferral !== null, records.draft?.resolutions?.map((entry) => entry.resolution).join('|') ?? null],
          applied: [records.version.status, records.version.conflict?.outcome ?? null, records.correction.status, records.correction.resolvedFrom?.conflictKind ?? null],
          old,
        },
      };
    })()`;
    const beforeRestart = await renderer.evaluate(SNAPSHOT);
    requireJourney(/^[0-9a-f]{64}$/.test(beforeRestart?.digest ?? '') && JSON.stringify(beforeRestart.facts) === JSON.stringify({
      kept: ['resolved', 'rejected', '保留当前稿件', 'suggested', 'keep-current'],
      deferred: ['deferred', true, 'current'],
      applied: ['applied', 'new-version', 'applied', 'reversal'],
      old: 'gone',
    }), 'records-before-restart', beforeRestart?.facts);
    await close();
    renderer = await launch();
    await reopen('restart');
    const afterRestart = await renderer.evaluate(SNAPSHOT);
    requireJourney(afterRestart?.digest === beforeRestart.digest && JSON.stringify(afterRestart.facts) === JSON.stringify(beforeRestart.facts), 'restart-moved-nothing', afterRestart?.facts);
    await openCard(renderer, thirdId, third, 'restart-kept-card');
    await assertRenderer(renderer, `window.__j06.card().querySelector('[data-mark-state]')?.textContent === ${JSON.stringify(KEPT_STATE)}`, 'restart-kept-still-kept');
    await press(renderer, 'Escape');
    await openCard(renderer, secondId, second, 'restart-deferred-card');
    await assertRenderer(renderer, `(window.__j06.card().querySelector('[data-mark-state]')?.textContent ?? '').includes(' · 暂不处理 · ') && window.__j06.card().querySelector('[data-mark-action="resolve-conflict"]') !== null`, 'restart-deferred-still-deferred');
    await press(renderer, 'Escape');

    at('zero-activity');
    // Nothing here reached a model or the network: the controller's loopback listener heard nothing.
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

main().catch((error) => reportJourneyFailure('J-06', location, error));
