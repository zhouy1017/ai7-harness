import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADMITTED_BASELINE_DOCX, composeAdmittedDocx } from './composed-docx.mjs';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// J-07 (Issue #414, plan slice S65): ⑥ 发稿. An editor saves Milestone Versions of the manuscript — each
// purpose chosen from an unselected card set, never typed and never preselected — finds them on 交付物 with
// 自「标签」后有修改 once the manuscript changes, and designates one exact milestone 发稿版本 with a 发稿范围
// and a 依据, the fixed sentence on screen before the confirm. An identical repeat records nothing, an edit
// raises the change notice, a newer designation is a separate record that leaves the older one as it was,
// and a restart moves nothing. Nothing is exported, sent or published, and no page says anything was.
//
// The input is composed at run time from the one admitted Public SampleBook under the content rule in
// docs/agents/ci-test-boundaries.md; every string this runner types is authored here, and the only
// manuscript text it touches — the paragraph it appends to — stays inside the page. 交付物's service
// projection is read through `window.ai7.inspectDeliverables()` only to cross-check what the page shows;
// the runner never reads the product database.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const EXCERPT = Object.freeze({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '发稿旅程甲' });
const FIRST = Object.freeze({ label: '一审稿', purpose: 'stage-archive', purposeLabel: '阶段留档', note: '一审完成后留档' });
const SECOND = Object.freeze({ label: '二审稿', purpose: 'review-candidate', purposeLabel: '送审候选', note: '' });
const FIRST_EDIT = '〔发稿前改动〕';
const SECOND_EDIT = '〔发稿后改动〕';
const PRINT = Object.freeze({ scope: '纸质版首印', basis: '三审通过，社里同意付印。' });
const EBOOK = Object.freeze({ scope: '电子版首发', basis: '电子版沿用一审稿的文字。' });
const KEYBOARD = Object.freeze({ scope: '键盘可达校验', basis: '只用键盘填写，随后取消，不做记录。' });
// The service's own words (`src/shared/protocol.ts`), pinned against it by tests/unit/deliverables-labels.test.ts.
const STATEMENT = '仅表示此版本可用于上述发稿范围；AI7 不会发布或发送';
const FORBIDDEN_WORDS = Object.freeze(['已发布', '已发送', '已交付', '已确认送达']);
const ACTUALS_PROMPT = '录入定价与首印 · 随评估功能提供';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 导出's four members (Issue #413): the only renderer members named like an export, and none publishes or sends.
const EXPORT_MEMBERS = Object.freeze(['approveManuscriptExport', 'chooseManuscriptExportDestination', 'revealManuscriptExport', 'reviewManuscriptExport']);
const EXPORT_MEMBERS_ONLY = `JSON.stringify(Object.keys(window.ai7).filter((key) => /export|publish|send/i.test(key)).sort()) === ${JSON.stringify(JSON.stringify(EXPORT_MEMBERS))}`;

let location = 'entry';
let electronExecutable;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-07', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-07/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-07', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-07' };
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
    server.once('error', () => rejectListen(new Error('J-07/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' &&
      Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-07/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j07-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(new Error('J-07/loopback-close')) : resolveClose());
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
    if (response.error) completion.reject(new Error('J-07/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-07/renderer-cdp-timeout')); }, 60_000);
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
  throw new Error(`J-07/${name}`);
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
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); return input.value === ${JSON.stringify(value)}; })()`, name);
}
const KEYS = Object.freeze({
  Tab: Object.freeze({ key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }),
  ArrowDown: Object.freeze({ key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }),
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

// What the page needs to read 交付物 the way an editor does: the block, its lists and its form by their
// data attributes, the status line, the journal sequence the manuscript shows, and the block's visible
// words apart from its closed technical layers.
const PAGE_HELPERS = `(() => {
  if (window.__j07) return true;
  const block = () => document.querySelector('[data-screen="book-deliverables"] section.deliverables-publication');
  window.__j07 = {
    block,
    items: () => Array.from(block()?.querySelectorAll('ol.milestone-list > li') ?? []),
    versions: () => Array.from(block()?.querySelectorAll('ol.publication-versions > li') ?? []),
    form: () => block()?.querySelector('form.publication-designate') ?? null,
    action: (name) => block()?.querySelector('[data-publication-action="' + name + '"]') ?? null,
    field: (name) => block()?.querySelector('form.publication-designate [data-publication-field="' + name + '"]') ?? null,
    radios: () => Array.from(block()?.querySelectorAll('form.publication-designate input[type="radio"][name="publication-milestone"]') ?? []),
    summary: () => Array.from(block()?.querySelectorAll('form.publication-designate dl.publication-designate-summary > dd') ?? []).map((value) => value.textContent ?? ''),
    status: () => document.querySelector('#persistence-status')?.textContent ?? '',
    tone: () => document.querySelector('#persistence-status')?.dataset.tone ?? '',
    journal: () => {
      const node = Array.from(document.querySelectorAll('.editor-meta > span')).find((item) => (item.textContent ?? '').startsWith('修订日志序号 '));
      return node === undefined ? null : Number((node.textContent ?? '').slice('修订日志序号 '.length));
    },
    milestoneSave: () => Array.from(document.querySelectorAll('details.milestone-section button')).find((item) => item.textContent === '保存里程碑版本') ?? null,
    decisionText: () => {
      const clone = block()?.cloneNode(true);
      if (!clone) return '';
      for (const layer of clone.querySelectorAll('details.technical-details')) layer.remove();
      return clone.textContent ?? '';
    },
  };
  return true;
})()`;

/** 交付物 as the service answers it, reduced to what the page is checked against: identities, words and states. */
const READ_PUBLICATION = `window.ai7.inspectDeliverables().then((deliverables) => ({
  bookId: deliverables.bookId,
  milestones: deliverables.publication.milestones.map((item) => ({ milestoneId: item.milestoneId, label: item.label, purposeKind: item.purposeKind, revisionLabel: item.revisionLabel, changedSince: item.changedSince, changedSinceLabel: item.changedSinceLabel, designated: item.designation !== null })),
  designations: deliverables.publication.designations.map((item) => ({ publicationVersionId: item.publicationVersionId, ordinal: item.ordinal, current: item.current, milestoneId: item.milestoneId, revisionLabel: item.revisionLabel, scope: item.scope, basis: item.basis, createdAt: item.createdAt })),
  designate: deliverables.publication.designate,
  notice: deliverables.publication.changeNotice,
  prompt: deliverables.publication.actualsPrompt === null ? null : deliverables.publication.actualsPrompt.label + ' · ' + deliverables.publication.actualsPrompt.stateLabel,
}))`;

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

/** 交付物 from the manuscript: the 工作 group holds 审阅 and then 交付物, and leaving settles the manuscript first. */
async function openDeliverables(renderer, name) {
  await assertRenderer(renderer, `(() => { const group = document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]'); const entries = Array.from(group?.querySelectorAll('button[data-work-destination]') ?? []).map((item) => item.dataset.workDestination + ':' + item.textContent); const open = group?.querySelector('button[data-work-destination="deliverables"]'); if (entries.join('|') !== 'review:审阅|deliverables:交付物' || !(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, `${name}-entry`);
  await waitForDeliverables(renderer, name);
}
async function waitForDeliverables(renderer, name) {
  await waitFor(renderer, `(() => { const block = window.__j07.block(); return block instanceof HTMLElement && block.dataset.publicationState !== undefined; })()`, `${name}-destination`);
  await assertRenderer(renderer, `window.__j07.block().dataset.publicationState !== 'unavailable'`, `${name}-readable`);
}
/** The destination's own way back: 打开稿件 in its persistent actions. */
async function openManuscript(renderer, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('[data-screen="book-deliverables"] .workbench-actions button')).find((item) => item.textContent === '打开稿件'); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, `${name}-open-manuscript`);
  await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]') && document.querySelector('[data-testid="manuscript-editor"]')?.getAttribute('contenteditable') === 'true'`, `${name}-editor`);
}

/** The milestone form lives in the 导航 panel, which opens on demand (Issue #409). */
async function openMilestoneForm(renderer, name) {
  await assertRenderer(renderer, `(() => { const entry = document.querySelector('[data-edge-entry="navigation"]'); const panel = document.querySelector('#manuscript-navigation-panel'); if (!(entry instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return false; if (entry.getAttribute('aria-expanded') !== 'true') entry.click(); return entry.getAttribute('aria-expanded') === 'true' && !panel.hidden; })()`, `${name}-navigation`);
  await assertRenderer(renderer, `(() => { const details = document.querySelector('details.milestone-section'); if (!(details instanceof HTMLDetailsElement)) return false; details.open = true; return details.open; })()`, `${name}-details`);
}
async function choosePurpose(renderer, kind, name) {
  await assertRenderer(renderer, `(() => { const radio = document.querySelector('details.milestone-section input[type="radio"][name="milestone-purpose"][value=${JSON.stringify(kind)}]'); if (!(radio instanceof HTMLInputElement) || radio.disabled) return false; radio.click(); return radio.checked; })()`, name);
}
/** 保存里程碑版本 once the form is filled, answered with `已保存里程碑版本「标签」 · rN`. */
async function saveMilestone(renderer, milestone, revisionLabel, name) {
  await assertRenderer(renderer, `(() => { const save = window.__j07.milestoneSave(); if (!(save instanceof HTMLButtonElement) || save.disabled) return false; save.click(); return true; })()`, `${name}-save`);
  const completion = `已保存里程碑版本「${milestone.label}」 · ${revisionLabel}`;
  await waitFor(renderer, `window.__j07.status().includes(${JSON.stringify(completion)}) && window.__j07.tone() === 'success'`, `${name}-completion`, 120_000);
}

/**
 * One edit the journal acknowledges: authored text appended to the manuscript's first paragraph, saved the
 * way a hand would with 保存当前编辑 unless the editor already wrote it, and waited for until the journal
 * sequence moved on and nothing is left pending.
 */
async function acknowledgedEdit(renderer, text, name) {
  const before = await renderer.evaluate(`window.__j07.journal()`);
  requireJourney(Number.isSafeInteger(before), `${name}-journal-before`);
  const typed = await renderer.evaluate(`(() => {
    const editor = document.querySelector('[data-testid="manuscript-editor"]');
    const block = editor?.querySelector(':scope > p[data-block-id]');
    if (!(editor instanceof HTMLElement) || !(block instanceof HTMLElement) || editor.getAttribute('contenteditable') !== 'true') return false;
    const original = block.textContent ?? '';
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return document.execCommand('insertText', false, ${JSON.stringify(text)}) && (block.textContent ?? '') === original + ${JSON.stringify(text)};
  })()`);
  requireJourney(typed === true, `${name}-typed`);
  await waitFor(renderer, `(() => { const save = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '保存当前编辑'); return (save instanceof HTMLButtonElement && !save.disabled) || window.__j07.journal() > ${before}; })()`, `${name}-dirty`, 30_000);
  await renderer.evaluate(`(() => { const save = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '保存当前编辑'); if (save instanceof HTMLButtonElement && !save.disabled) save.click(); return true; })()`);
  await waitFor(renderer, `(() => { const save = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '保存当前编辑'); return window.__j07.journal() > ${before} && save instanceof HTMLButtonElement && save.disabled && document.documentElement.dataset.ai7CloseRisk !== 'true' && window.__j07.tone() === 'success'; })()`, `${name}-acknowledged`, 120_000);
}

async function openDesignateForm(renderer, name) {
  await clickSelector(renderer, '[data-screen="book-deliverables"] [data-publication-action="designate"]', `${name}-open`);
  await waitFor(renderer, `window.__j07.form() !== null && window.__j07.radios().length > 0 && window.__j07.radios().every((radio) => !radio.checked)`, `${name}-form`, 10_000);
}
async function chooseDesignation(renderer, milestoneId, name) {
  await assertRenderer(renderer, `(() => { const radio = window.__j07.radios().find((item) => item.value === ${JSON.stringify(milestoneId)}); if (!(radio instanceof HTMLInputElement) || radio.disabled) return false; radio.click(); return radio.checked; })()`, name);
}
/** Confirm only with the fixed sentence on screen beside the action (V2-UX-PUB-004). */
async function confirmWithStatement(renderer, completion, name) {
  await assertRenderer(renderer, `(() => { const statement = window.__j07.form()?.querySelector('.publication-statement'); const confirm = window.__j07.action('confirm'); if (!(statement instanceof HTMLElement) || statement.textContent !== ${JSON.stringify(STATEMENT)} || !statement.checkVisibility() || statement.getBoundingClientRect().height === 0) return false; if (!(confirm instanceof HTMLButtonElement) || confirm.disabled) return false; confirm.click(); return true; })()`, `${name}-confirm`);
  await waitFor(renderer, `window.__j07.status() === ${JSON.stringify(completion)} && window.__j07.tone() === 'success' && window.__j07.form() === null`, `${name}-completion`, 60_000);
}
async function designate(renderer, { milestoneId, scope, basis }, completion, name) {
  await openDesignateForm(renderer, name);
  await chooseDesignation(renderer, milestoneId, `${name}-choose`);
  await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', scope, `${name}-scope`);
  await fill(renderer, 'form.publication-designate [data-publication-field="basis"]', basis, `${name}-basis`);
  await confirmWithStatement(renderer, completion, name);
}

/** V2-UX-PUB-009: neither the page nor the record it reads ever says published, sent, delivered or received. */
async function assertNoForbiddenWords(renderer, name) {
  await assertRenderer(renderer, `(async () => { const words = ${JSON.stringify(FORBIDDEN_WORDS)}; const page = document.body.textContent ?? ''; const record = JSON.stringify(await window.ai7.inspectDeliverables()); return words.every((word) => !page.includes(word) && !record.includes(word)); })()`, name);
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
      requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j07-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j07-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j07-e2e-'), 'temp-root');
    const inputs = resolve(runRoot, 'composed-inputs');
    await mkdir(inputs);
    const manuscript = resolve(inputs, 'publication.docx');
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
      if (picker) args.push('--j07-picker-path', picker);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-07', browser, 'launch');
      cancellation.throwIfRequested();
      return attachRenderer(browser);
    };
    const close = async () => { await browser.close(); browser = undefined; };

    at('import-and-open');
    let renderer = await launch({ picker: manuscript });
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true'`, 'product-ready');
    // The renderer holds the two 交付物 members and 导出's four, and nothing that could publish or send.
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && typeof window.ai7.inspectDeliverables === 'function' && typeof window.ai7.designatePublicationVersion === 'function' && ${EXPORT_MEMBERS_ONLY}`, 'renderer-api-boundary');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'renderer-network-denial');
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }
    await importAndOpen(renderer, EXCERPT.title);
    await assertRenderer(renderer, PAGE_HELPERS, 'page-helpers');
    const bookId = await renderer.evaluate(`document.querySelector('.editor-shell')?.dataset.bookId ?? null`);
    requireJourney(UUID_PATTERN.test(bookId ?? ''), 'book-identity');
    cancellation.throwIfRequested();

    at('deliverables-before-milestone');
    // Before any milestone 设为发稿版本 is there, unavailable, with its reason in words beside it (PUB-002).
    await openDeliverables(renderer, 'before-milestone');
    await assertRenderer(renderer, `(() => {
      const page = document.querySelector('[data-screen="book-deliverables"] > .book-deliverables');
      const block = window.__j07.block();
      const designate = window.__j07.action('designate');
      const reason = document.getElementById(designate?.getAttribute('aria-describedby') ?? '');
      const actions = Array.from(page?.querySelectorAll(':scope > .workbench-actions button') ?? []).map((item) => item.textContent);
      return page?.dataset.bookId === ${JSON.stringify(bookId)} && page.querySelector(':scope > .section-label')?.textContent === '工作 · 交付物' &&
        page.querySelector(':scope > h2')?.textContent === ${JSON.stringify(EXCERPT.title)} && page.lastElementChild?.classList.contains('workbench-actions') &&
        JSON.stringify(actions) === '["打开稿件","工作概览"]' && block.querySelector(':scope > h3')?.textContent === '发稿 · 稿件' &&
        block.dataset.publicationState === 'no-milestone' && window.__j07.items().length === 0 && block.querySelector('.milestone-list-empty') !== null &&
        designate instanceof HTMLButtonElement && designate.disabled && designate.textContent === '设为发稿版本…' && reason?.textContent === '先保存里程碑版本' &&
        window.__j07.form() === null && window.__j07.versions().length === 0 && block.querySelector('.publication-actuals-prompt') === null &&
        block.querySelector('.publication-change-notice') === null && !/生产文档|图书交付包/.test(page.textContent ?? '');
    })()`, 'designate-unavailable-before-a-milestone');
    const nothing = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(nothing?.bookId === bookId && nothing.milestones.length === 0 && nothing.designations.length === 0 &&
      nothing.designate?.available === false && nothing.designate.unavailableReason === '先保存里程碑版本' && nothing.notice === null && nothing.prompt === null,
    'service-agrees-nothing-to-designate', nothing);
    await openManuscript(renderer, 'before-milestone');

    at('milestone-needs-a-purpose');
    // 标签 / 用途 / 说明（可选）: the purpose is five unselected cards, and 保存里程碑版本 waits for a label and a
    // purpose with its reason beside it (V2-UX-MILE-003); 自行输入 asks for the editor's own words.
    await openMilestoneForm(renderer, 'first');
    await assertRenderer(renderer, `(() => {
      const section = document.querySelector('details.milestone-section');
      const radios = Array.from(section.querySelectorAll('input[type="radio"][name="milestone-purpose"]'));
      const custom = section.querySelector('#milestone-purpose-custom');
      const save = window.__j07.milestoneSave();
      return section.querySelector('label[for="milestone-label"]')?.textContent === '标签' &&
        section.querySelector('fieldset.milestone-purpose-options > legend')?.textContent === '用途' &&
        section.querySelector('label[for="milestone-note"]')?.textContent === '说明（可选）' &&
        radios.map((radio) => radio.closest('label')?.textContent).join('|') === '阶段留档|送审候选|交付候选|其他|自行输入' &&
        radios.every((radio) => !radio.checked) && custom instanceof HTMLInputElement && custom.hidden &&
        save instanceof HTMLButtonElement && save.disabled;
    })()`, 'milestone-form-starts-unselected');
    await fill(renderer, '#milestone-label', FIRST.label, 'first-label');
    await assertRenderer(renderer, `(() => { const save = window.__j07.milestoneSave(); const reason = document.getElementById(save?.getAttribute('aria-describedby') ?? ''); return save?.disabled === true && (reason?.textContent ?? '').includes('选择用途'); })()`, 'milestone-save-waits-for-a-purpose');
    await choosePurpose(renderer, 'custom', 'first-purpose-custom');
    await assertRenderer(renderer, `(() => { const custom = document.querySelector('#milestone-purpose-custom'); const save = window.__j07.milestoneSave(); return custom instanceof HTMLInputElement && !custom.hidden && save?.disabled === true; })()`, 'milestone-custom-asks-for-words');
    await choosePurpose(renderer, FIRST.purpose, 'first-purpose');
    await assertRenderer(renderer, `(() => { const custom = document.querySelector('#milestone-purpose-custom'); const save = window.__j07.milestoneSave(); return custom instanceof HTMLInputElement && custom.hidden && save?.disabled === false; })()`, 'milestone-save-ready-with-a-purpose');

    at('milestone-first-saved');
    await fill(renderer, '#milestone-note', FIRST.note, 'first-note');
    // Nothing changed since the import, so the milestone designates r1 as it stands.
    await saveMilestone(renderer, FIRST, 'r1', 'first');
    await assertRenderer(renderer, `(() => { const radios = Array.from(document.querySelectorAll('details.milestone-section input[name="milestone-purpose"]')); return document.querySelector('#milestone-label')?.value === '' && document.querySelector('#milestone-note')?.value === '' && radios.every((radio) => !radio.checked) && window.__j07.milestoneSave()?.disabled === true; })()`, 'milestone-form-starts-again-unselected');

    at('milestone-changed-since');
    // One acknowledged edit: the manuscript is newer than 一审稿 (V2-UX-MILE-007).
    await acknowledgedEdit(renderer, FIRST_EDIT, 'first-edit');
    await openDeliverables(renderer, 'changed-since');
    await assertRenderer(renderer, `(() => { const items = window.__j07.items(); return items.length === 1 && items[0].querySelector('.milestone-label')?.textContent === '「一审稿」' && items[0].dataset.changedSince === 'true' && items[0].querySelector('.milestone-changed-since')?.textContent === '自「一审稿」后有修改' && window.__j07.action('designate')?.disabled === false; })()`, 'milestone-shows-changed-since');
    const changed = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(changed?.milestones?.length === 1 && changed.milestones[0].changedSince === true && changed.milestones[0].changedSinceLabel === '自「一审稿」后有修改' &&
      changed.designate?.available === true, 'service-agrees-changed-since', changed);

    at('milestone-second-saved');
    // The second milestone freezes the edit as r2.
    await openManuscript(renderer, 'second');
    await openMilestoneForm(renderer, 'second');
    await fill(renderer, '#milestone-label', SECOND.label, 'second-label');
    await choosePurpose(renderer, SECOND.purpose, 'second-purpose');
    await saveMilestone(renderer, SECOND, 'r2', 'second');

    at('milestones-listed');
    await openDeliverables(renderer, 'listed');
    const listed = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(Array.isArray(listed?.milestones) && listed.milestones.length === 2 &&
      listed.milestones[0].label === SECOND.label && listed.milestones[0].purposeKind === SECOND.purpose && listed.milestones[0].revisionLabel === 'r2' && listed.milestones[0].changedSince === false &&
      listed.milestones[1].label === FIRST.label && listed.milestones[1].purposeKind === FIRST.purpose && listed.milestones[1].revisionLabel === 'r1' && listed.milestones[1].changedSince === true &&
      listed.milestones.every((item) => UUID_PATTERN.test(item.milestoneId) && item.designated === false) && listed.designations.length === 0,
    'service-lists-two-milestones', listed);
    const second = listed.milestones[0].milestoneId;
    const first = listed.milestones[1].milestoneId;
    // Newest first, each with its purpose, exact version, actor and time, note and later changes (MILE-008).
    await assertRenderer(renderer, `(() => {
      const items = window.__j07.items();
      const read = (item) => [item.dataset.milestoneId, item.querySelector('.milestone-label')?.textContent, item.dataset.purposeKind, item.dataset.revisionLabel, item.dataset.changedSince, item.dataset.publicationCurrent].join('|');
      return JSON.stringify(items.map(read)) === ${JSON.stringify(JSON.stringify([
        [second, `「${SECOND.label}」`, SECOND.purpose, 'r2', 'false', 'false'].join('|'),
        [first, `「${FIRST.label}」`, FIRST.purpose, 'r1', 'true', 'false'].join('|'),
      ]))} &&
        (items[0].querySelector('.milestone-meta')?.textContent ?? '').startsWith(${JSON.stringify(`用途：${SECOND.purposeLabel} · 修订版 r2 · 本机编辑 · `)}) &&
        (items[1].querySelector('.milestone-meta')?.textContent ?? '').startsWith(${JSON.stringify(`用途：${FIRST.purposeLabel} · 修订版 r1 · 本机编辑 · `)}) &&
        items[0].querySelector('.milestone-note') === null && items[1].querySelector('.milestone-note')?.textContent === ${JSON.stringify(`说明：${FIRST.note}`)} &&
        items[0].querySelector('.milestone-changed-since') === null && items[1].querySelector('.milestone-changed-since')?.textContent === '自「一审稿」后有修改';
    })()`, 'two-milestones-listed-newest-first');
    // None is final and none designated: no mark, no current item, no word that ranks one above the other.
    await assertRenderer(renderer, `window.__j07.items().every((item) => item.dataset.publicationCurrent === 'false' && !item.hasAttribute('aria-current') && item.querySelector('.publication-version-mark') === null && !/最终|终稿|最新/.test(item.textContent ?? '')) && window.__j07.versions().length === 0 && window.__j07.form() === null`, 'none-final-none-designated');
    // Every identity stays in a closed 查看技术详情, one step below the words it belongs to (LAYER-001).
    await assertRenderer(renderer, `(() => { const text = window.__j07.decisionText(); const layers = Array.from(window.__j07.block().querySelectorAll('details.technical-details')); return !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text) && !/[0-9a-f]{64}/.test(text) && layers.length === 3 && layers.every((layer) => !layer.open && layer.querySelector('summary')?.textContent === '查看技术详情'); })()`, 'identities-in-closed-technical-layers');

    at('designate-form');
    await clickSelector(renderer, '[data-screen="book-deliverables"] [data-publication-action="designate"]', 'designate-open');
    await waitFor(renderer, `window.__j07.form() !== null && document.activeElement === window.__j07.radios()[0]`, 'designate-form-open', 10_000);
    // Every milestone as a choice and none chosen; what will be recorded; the two fields; the fixed sentence
    // beside the action, on screen from the start; and the confirm unavailable with its reason in words.
    await assertRenderer(renderer, `(() => {
      const form = window.__j07.form();
      const radios = window.__j07.radios();
      const statement = form.querySelector('.publication-statement');
      const confirm = window.__j07.action('confirm');
      const cancel = window.__j07.action('cancel');
      const scope = window.__j07.field('scope');
      const basis = window.__j07.field('basis');
      const terms = Array.from(form.querySelectorAll('dl.publication-designate-summary > dt')).map((term) => term.textContent);
      const reason = form.querySelector('.publication-confirm-reason');
      return JSON.stringify(radios.map((radio) => radio.value)) === ${JSON.stringify(JSON.stringify([second, first]))} && radios.every((radio) => !radio.checked) &&
        form.querySelector('fieldset > legend')?.textContent === '选择里程碑版本' &&
        statement?.textContent === ${JSON.stringify(STATEMENT)} && statement.checkVisibility() && statement.getBoundingClientRect().height > 0 &&
        JSON.stringify(terms) === '["图书","稿件","里程碑版本","与当前稿件","操作人","时间"]' &&
        scope instanceof HTMLInputElement && scope.required && scope.closest('label')?.querySelector('.publication-field-label')?.textContent === '发稿范围' &&
        basis instanceof HTMLTextAreaElement && basis.required && basis.closest('label')?.querySelector('.publication-field-label')?.textContent === '依据' &&
        confirm instanceof HTMLButtonElement && confirm.disabled && confirm.textContent === '设为发稿版本' &&
        cancel instanceof HTMLButtonElement && !cancel.disabled && cancel.textContent === '取消' &&
        reason instanceof HTMLElement && !reason.hidden && (reason.textContent ?? '').startsWith('还需要选择一个里程碑版本');
    })()`, 'designate-form-states-everything-and-preselects-nothing');
    await chooseDesignation(renderer, second, 'designate-choose-second');
    await assertRenderer(renderer, `(() => { const values = window.__j07.summary(); return values[0] === ${JSON.stringify(EXCERPT.title)} && values[1].startsWith('主稿件 · 当前修订版 r2') && values[2].startsWith(${JSON.stringify(`「${SECOND.label}」 · r2 · `)}) && values[3] === '与当前稿件一致' && values[4] === '本机编辑' && values[5] === '确认时记录'; })()`, 'designate-summary-names-the-exact-version');
    // 发稿范围 counts characters as the service does: 81 CJK characters are too many, while 80 characters
    // outside the Basic Multilingual Plane — 160 UTF-16 units, past any HTML maxLength of 80 — are not.
    await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', '范'.repeat(81), 'designate-scope-too-long');
    await assertRenderer(renderer, `(() => { const scope = window.__j07.field('scope'); const problem = scope.closest('label').querySelector('.publication-field-problem'); return scope.getAttribute('aria-invalid') === 'true' && !problem.hidden && problem.textContent === '发稿范围最多 80 个字符，现在 81 个。' && window.__j07.action('confirm').disabled; })()`, 'designate-scope-bound-refuses-81');
    await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', '𠀀'.repeat(80), 'designate-scope-supplementary');
    await assertRenderer(renderer, `(() => { const scope = window.__j07.field('scope'); return scope.value.length === 160 && scope.getAttribute('aria-invalid') === 'false' && scope.closest('label').querySelector('.publication-field-problem').hidden; })()`, 'designate-scope-bound-counts-characters');
    await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', PRINT.scope, 'designate-scope');
    await fill(renderer, 'form.publication-designate [data-publication-field="basis"]', PRINT.basis, 'designate-basis');
    await assertRenderer(renderer, `window.__j07.action('confirm')?.disabled === false && window.__j07.form().querySelector('.publication-confirm-reason')?.hidden === true`, 'designate-ready');

    at('designate-confirmed');
    await confirmWithStatement(renderer, `已设为发稿版本 · 「${SECOND.label}」 · r2 · ${PRINT.scope}`, 'designate');
    // 发稿版本 on the chosen milestone and on no other; one record with its scope, basis and time; the pending
    // 录入定价与首印 line with no action; no change notice, because the manuscript is exactly r2.
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.block();
      const current = window.__j07.items().filter((item) => item.dataset.publicationCurrent === 'true');
      const marks = Array.from(block.querySelectorAll('.publication-version-mark'));
      const versions = window.__j07.versions();
      const prompt = block.querySelector('.publication-actuals-prompt');
      return current.length === 1 && current[0].dataset.milestoneId === ${JSON.stringify(second)} && marks.length === 1 && current[0].contains(marks[0]) && marks[0].textContent === '发稿版本' &&
        versions.length === 1 && versions[0].dataset.publicationCurrent === 'true' && versions[0].dataset.designatedMilestoneId === ${JSON.stringify(second)} &&
        versions[0].querySelector('.publication-version-title')?.textContent === ${JSON.stringify(`第 1 次设为发稿版本 · 「${SECOND.label}」 · r2`)} &&
        versions[0].querySelector('.publication-scope')?.textContent === ${JSON.stringify(`发稿范围：${PRINT.scope}`)} &&
        versions[0].querySelector('.publication-basis')?.textContent === ${JSON.stringify(`依据：${PRINT.basis}`)} &&
        (versions[0].querySelector('.publication-recorded')?.textContent ?? '').startsWith('本机编辑 · ') &&
        prompt?.textContent === ${JSON.stringify(ACTUALS_PROMPT)} && prompt.querySelectorAll('button, a, input, select, textarea').length === 0 &&
        block.querySelector('.publication-change-notice') === null && block.dataset.changeNotice === 'false' &&
        document.activeElement === window.__j07.action('designate');
    })()`, 'designated-on-the-chosen-milestone');
    const once = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(once?.designations?.length === 1 && once.designations[0].ordinal === 1 && once.designations[0].current === true &&
      once.designations[0].milestoneId === second && once.designations[0].revisionLabel === 'r2' && once.designations[0].scope === PRINT.scope &&
      once.designations[0].basis === PRINT.basis && UUID_PATTERN.test(once.designations[0].publicationVersionId) &&
      once.milestones.filter((item) => item.designated).map((item) => item.milestoneId).join('|') === second && once.notice === null && once.prompt === ACTUALS_PROMPT,
    'service-agrees-designated', once);
    const printVersion = once.designations[0];
    await assertRenderer(renderer, `window.__j07.versions()[0]?.dataset.publicationVersionId === ${JSON.stringify(printVersion.publicationVersionId)}`, 'history-is-the-service-record');
    await assertNoForbiddenWords(renderer, 'designated-without-forbidden-words');

    at('designate-repeat-unchanged');
    // The same milestone, scope and basis again: nothing is appended, and the status says so.
    await designate(renderer, { milestoneId: second, ...PRINT }, `已是当前发稿版本 · 「${SECOND.label}」 · r2 · ${PRINT.scope}`, 'repeat');
    const repeated = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(repeated?.designations?.length === 1 && JSON.stringify(repeated.designations[0]) === JSON.stringify(printVersion), 'repeat-recorded-nothing', repeated);
    await assertRenderer(renderer, `window.__j07.versions().length === 1 && window.__j07.versions()[0].dataset.publicationVersionId === ${JSON.stringify(printVersion.publicationVersionId)}`, 'repeat-history-unchanged');

    at('change-notice-after-edit');
    // An acknowledged edit after the designation: the Publication Version Change Notice names the version it
    // was set on, and the designation itself stays where it was (PUB-006).
    await openManuscript(renderer, 'notice');
    await acknowledgedEdit(renderer, SECOND_EDIT, 'second-edit');
    await openDeliverables(renderer, 'notice');
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.block();
      const notice = block.querySelector('.publication-change-notice');
      const current = window.__j07.items().find((item) => item.dataset.publicationCurrent === 'true');
      return block.dataset.changeNotice === 'true' && notice?.querySelector('strong')?.textContent === '自发稿版本后有修改' && (notice.textContent ?? '').includes('发稿版本定在 r2') &&
        current?.dataset.milestoneId === ${JSON.stringify(second)} && current.querySelector('.publication-version-mark')?.textContent === '发稿版本' &&
        current.querySelector('.milestone-changed-since')?.textContent === '自「二审稿」后有修改' && window.__j07.versions().length === 1;
    })()`, 'change-notice-names-the-designated-version');
    const noticed = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(noticed?.notice?.label === '自发稿版本后有修改' && noticed.notice.publicationVersionId === printVersion.publicationVersionId &&
      noticed.notice.revisionLabel === 'r2' && JSON.stringify(noticed.designations) === JSON.stringify([printVersion]), 'service-agrees-change-notice', noticed);

    at('designate-older-milestone');
    // A newer designation is a separate manual one (PUB-007): the older milestone, chosen exactly — not the
    // latest — with its relation to the current manuscript stated before the confirm.
    await openDesignateForm(renderer, 'older');
    await chooseDesignation(renderer, first, 'older-choose');
    await assertRenderer(renderer, `(() => { const values = window.__j07.summary(); return values[2].startsWith(${JSON.stringify(`「${FIRST.label}」 · r1 · `)}) && values[3] === '自「一审稿」后有修改'; })()`, 'older-summary-states-the-relation');
    await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', EBOOK.scope, 'older-scope');
    await fill(renderer, 'form.publication-designate [data-publication-field="basis"]', EBOOK.basis, 'older-basis');
    await confirmWithStatement(renderer, `已设为发稿版本 · 「${FIRST.label}」 · r1 · ${EBOOK.scope}`, 'older');
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.block();
      const current = window.__j07.items().filter((item) => item.dataset.publicationCurrent === 'true');
      const versions = window.__j07.versions();
      return current.length === 1 && current[0].dataset.milestoneId === ${JSON.stringify(first)} && block.querySelectorAll('.publication-version-mark').length === 1 &&
        versions.map((item) => item.dataset.publicationOrdinal + ':' + item.dataset.publicationCurrent + ':' + item.dataset.designatedMilestoneId).join('|') === ${JSON.stringify(`2:true:${first}|1:false:${second}`)} &&
        versions[1].dataset.publicationVersionId === ${JSON.stringify(printVersion.publicationVersionId)} &&
        versions[1].querySelector('.publication-scope')?.textContent === ${JSON.stringify(`发稿范围：${PRINT.scope}`)} &&
        versions[0].querySelector('.publication-current-mark')?.textContent === '当前发稿版本' && versions[1].querySelector('.publication-current-mark') === null &&
        block.querySelector('.publication-change-notice') !== null;
    })()`, 'newer-designation-is-a-separate-record');
    const twice = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(twice?.designations?.length === 2 && twice.designations[0].ordinal === 2 && twice.designations[0].current === true &&
      twice.designations[0].milestoneId === first && twice.designations[0].revisionLabel === 'r1' && twice.designations[0].scope === EBOOK.scope &&
      twice.designations[0].basis === EBOOK.basis && twice.designations[1].current === false &&
      JSON.stringify({ ...twice.designations[1], current: true }) === JSON.stringify(printVersion) && twice.notice?.revisionLabel === 'r1',
    'older-designation-kept-as-it-was', twice);
    cancellation.throwIfRequested();

    at('restart-keeps-everything');
    // A restart moves nothing: 交付物 answers byte for byte as before, and 工作概览 reads it as one line.
    const beforeRestart = await renderer.evaluate(`window.ai7.inspectDeliverables().then((deliverables) => JSON.stringify(deliverables))`);
    requireJourney(typeof beforeRestart === 'string' && beforeRestart.length > 0, 'restart-read-before');
    await close();
    renderer = await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]') && document.querySelector('.recent-work-item button')`, 'restart-prior-work');
    await assertRenderer(renderer, PAGE_HELPERS, 'restart-page-helpers');
    await assertRenderer(renderer, `(() => { document.querySelector('.recent-work-item button').click(); return true; })()`, 'restart-open');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]')`, 'restart-editor');
    await click(renderer, '返回图书工作概览', 'restart-overview');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-deliverables-summary[data-deliverables-state="designated"] [data-deliverables-action="open"]')`, 'restart-overview-line');
    await assertRenderer(renderer, `(() => { const line = document.querySelector('[data-screen="book-overview"] .book-deliverables-summary'); const open = line.querySelector('[data-deliverables-action="open"]'); return line.dataset.deliverablesBookId === ${JSON.stringify(bookId)} && line.querySelector('h3')?.textContent === '交付物' && line.querySelector('p')?.textContent === ${JSON.stringify(`发稿 · 里程碑版本 2 个 · 发稿版本「${FIRST.label}」 · r1 · ${EBOOK.scope} · 自发稿版本后有修改`)} && open instanceof HTMLButtonElement && open.textContent === '打开交付物'; })()`, 'overview-line-reads-the-publication');
    await clickSelector(renderer, '[data-screen="book-overview"] .book-deliverables-summary [data-deliverables-action="open"]', 'overview-opens-deliverables');
    await waitForDeliverables(renderer, 'restart');
    const afterRestart = await renderer.evaluate(`window.ai7.inspectDeliverables().then((deliverables) => JSON.stringify(deliverables))`);
    requireJourney(afterRestart === beforeRestart, 'restart-moved-nothing');
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.block();
      const items = window.__j07.items();
      const versions = window.__j07.versions();
      return JSON.stringify(items.map((item) => item.dataset.milestoneId + ':' + item.dataset.publicationCurrent)) === ${JSON.stringify(JSON.stringify([`${second}:false`, `${first}:true`]))} &&
        JSON.stringify(versions.map((item) => item.dataset.publicationVersionId)) === ${JSON.stringify(JSON.stringify([twice.designations[0].publicationVersionId, printVersion.publicationVersionId]))} &&
        block.dataset.changeNotice === 'true' && block.querySelector('.publication-actuals-prompt') !== null;
    })()`, 'restart-page-unmoved');

    at('actuals-prompt-and-words');
    // The 录入定价与首印 line is recorded and pending, with no action until the evaluation features take it up;
    // nothing anywhere says published, sent, delivered or received; and nothing exports, publishes or sends.
    await assertRenderer(renderer, `(() => { const prompt = window.__j07.block().querySelector('.publication-actuals-prompt'); return prompt?.textContent === ${JSON.stringify(ACTUALS_PROMPT)} && prompt.querySelectorAll('button, a, input, select, textarea, [tabindex]').length === 0 && prompt.closest('button, a') === null; })()`, 'actuals-prompt-pending-without-action');
    await assertNoForbiddenWords(renderer, 'restart-without-forbidden-words');
    // The only controls that name 导出 are 导出… of each version (Issue #413); nothing publishes or sends.
    await assertRenderer(renderer, `(() => { const controls = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"]')); const actions = Array.from(window.__j07.block().querySelectorAll('[data-publication-action]')).map((node) => node.dataset.publicationAction); return !controls.some((node) => /发布|发送/.test(node.textContent ?? '')) && controls.filter((node) => /导出/.test(node.textContent ?? '')).every((node) => node.dataset.exportAction === 'open' && node.textContent === '导出…') && JSON.stringify(actions) === '["designate"]' && ${EXPORT_MEMBERS_ONLY}; })()`, 'no-publish-or-send-action');

    at('j14-designate-keyboard');
    // The form without a pointer: Enter on 设为发稿版本… opens it on its first choice, an arrow chooses, Tab
    // reaches 发稿范围, 依据, the confirm and 取消 with visible focus, and Enter on 取消 closes it with focus back
    // on the opener and nothing recorded.
    await assertRenderer(renderer, `(() => { const open = window.__j07.action('designate'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.focus(); return document.activeElement === open; })()`, 'keyboard-opener-focused');
    await pressEnter(renderer);
    await waitFor(renderer, `(() => { const radios = window.__j07.radios(); return window.__j07.form() !== null && radios.length === 2 && document.activeElement === radios[0] && radios.every((radio) => !radio.checked); })()`, 'keyboard-form-opens-on-its-first-choice', 10_000);
    await press(renderer, 'ArrowDown');
    await waitFor(renderer, `(() => { const radios = window.__j07.radios(); return document.activeElement === radios[1] && radios[1].checked && !radios[0].checked; })()`, 'keyboard-arrow-chooses', 10_000);
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.field('scope') && document.activeElement.matches(':focus-visible')`, 'keyboard-scope-reached', 10_000);
    await renderer.send('Input.insertText', { text: KEYBOARD.scope });
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.field('basis') && document.activeElement.matches(':focus-visible')`, 'keyboard-basis-reached', 10_000);
    await renderer.send('Input.insertText', { text: KEYBOARD.basis });
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.action('confirm') && !window.__j07.action('confirm').disabled && document.activeElement.matches(':focus-visible')`, 'keyboard-confirm-reached', 10_000);
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.action('cancel') && document.activeElement.matches(':focus-visible')`, 'keyboard-cancel-reached', 10_000);
    await pressEnter(renderer);
    await waitFor(renderer, `window.__j07.form() === null && document.activeElement === window.__j07.action('designate')`, 'keyboard-cancel-returns-focus', 10_000);
    const afterKeyboard = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(afterKeyboard?.designations?.length === 2 && afterKeyboard.designations[0].publicationVersionId === twice.designations[0].publicationVersionId, 'keyboard-recorded-nothing', afterKeyboard);

    at('j14-deliverables-zoom-200-reflow');
    // At 200% the lists, the open form and the persistent actions reflow into the width: no sideways scroll.
    await openDesignateForm(renderer, 'zoom');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const block = window.__j07.block(); const parts = [block, block?.querySelector('ol.milestone-list'), block?.querySelector('ol.publication-versions'), window.__j07.form(), document.querySelector('[data-screen="book-deliverables"] .workbench-actions')]; const statement = window.__j07.form()?.querySelector('.publication-statement'); return parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2 && statement instanceof HTMLElement && statement.getBoundingClientRect().width > 0; })()`, 'deliverables-reflow-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-deliverables-forced-colors');
    // Without colour the 发稿版本 mark keeps its outline, the item it marks a heavier border than the others,
    // and the change notice and the fixed sentence their lines.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const block = window.__j07.block();
      const style = (node) => getComputedStyle(node);
      const current = block.querySelector('ol.milestone-list > li[data-publication-current="true"]');
      const other = block.querySelector('ol.milestone-list > li[data-publication-current="false"]');
      const mark = current?.querySelector('.publication-version-mark');
      const notice = block.querySelector('.publication-change-notice');
      const statement = window.__j07.form()?.querySelector('.publication-statement');
      return style(block).boxShadow === 'none' && mark instanceof HTMLElement && style(mark).borderTopStyle === 'solid' && parseFloat(style(mark).borderTopWidth) >= 2 &&
        other instanceof HTMLElement && parseFloat(style(current).borderTopWidth) > parseFloat(style(other).borderTopWidth) &&
        notice instanceof HTMLElement && style(notice).borderTopStyle === 'solid' && statement instanceof HTMLElement && style(statement).borderLeftStyle === 'solid';
    })()`, 'marks-speak-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await clickSelector(renderer, '[data-screen="book-deliverables"] [data-publication-action="cancel"]', 'forced-colors-form-cancel');
    await waitFor(renderer, `window.__j07.form() === null`, 'forced-colors-form-closed', 10_000);

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

main().catch((error) => reportJourneyFailure('J-07', location, error));
