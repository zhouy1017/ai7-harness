import { createWriteStream, existsSync, statSync } from 'node:fs';
import { lstat, mkdtemp, opendir, realpath, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { attachProductOutput, installJourneyCancellationCleanup, journeyCheckFailure, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect, SIDEBAR_LIBRARY_READY, sidebarBookCurrent, SIDEBAR, sidebarNavigate, runJ14DarkPass } from './controller.mjs';
import { fixedArchiveTime } from './composed-docx.mjs';
import { measureCpuShares } from './readiness-trace.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHARACTER_COUNT = 10_000_000;
const BLOCK_COUNT = 50_000;
const BLOCK_LENGTH = CHARACTER_COUNT / BLOCK_COUNT;
const INTERIOR_POSITION_RAIL = 750_013;
const INTERIOR_GLOBAL_CHARACTER = Math.floor(CHARACTER_COUNT * INTERIOR_POSITION_RAIL / 1_000_000);
const INTERIOR_BLOCK_POSITION = Math.floor(INTERIOR_GLOBAL_CHARACTER / BLOCK_LENGTH) + 1;
const INTERIOR_FOCUS_GRAPHEME = INTERIOR_GLOBAL_CHARACTER % BLOCK_LENGTH;
const INTERIOR_POSITION_LABEL = `${(INTERIOR_GLOBAL_CHARACTER / CHARACTER_COUNT * 100).toFixed(3)}%`;
const SEARCH_TEXT = '星河校准';
const REPLACEMENT_TEXT = '星海校准';
const EXPECTED_MATCHES = 25;
const OVERLAP_SOURCE_TEXT = '哈哈哈';
const OVERLAP_QUERY = '哈哈';
const EXCLUSION_TEXT = '边界排除校验';
const EXPECTED_EXCLUSION_MATCHES = 1_001;
const MILESTONE_RECOVERY_SNAPSHOT_TIMEOUT = 10 * 60_000;
// Staging parses and snapshots the whole ten-million-character file, and the commit re-parses it and writes it whole.
// Since #690 these long waits — staging, the commit and its acknowledgement — are bounded by the import's progress, read
// from the store every few seconds, rather than by a wall clock: one that shows no change for IMPORT_STALL has stopped, and
// one still moving is waited for up to the product's own deadline for the request, src/main/service-client.ts
// LONG_REQUEST_TIMEOUT_MS, past which the product stops its service itself. The commit's write transaction shows the
// store no change while it works, so it is bounded by that deadline alone. Hosted Windows runners have spent more than the
// former fixed 8 min on staging (#621, 2026-10-08) and more than 300 s on the commit (2026-10-09).
const PRODUCT_LONG_REQUEST_TIMEOUT = 10 * 60_000;
const IMPORT_WAIT_MARGIN = 30_000;
const IMPORT_SAMPLE_INTERVAL = 5_000;
// The commit's re-parse can finish within a few seconds on a fast host, so the commit wait reads the store every second.
const IMPORT_COMMIT_SAMPLE_INTERVAL = 1_000;
const IMPORT_STALL = 3 * 60_000;
// The product's own startup readiness deadline, src/main/service-client.ts STARTUP_READY_TIMEOUT_MS.
const PRODUCT_STARTUP_READY_TIMEOUT = 2 * 60_000;
// Margin for the renderer paint and the landing screen's service IPC, which follow the main process's readiness signal.
const RENDERER_READY_MARGIN = 15_000;
const RENDERER_READY_TIMEOUT = PRODUCT_STARTUP_READY_TIMEOUT + RENDERER_READY_MARGIN;
const RECOVERY_PARTIAL_PATTERN = /^\.partial-[0-9a-f-]{36}$/i;
const RECOVERY_OBJECT_PATTERN = /^[0-9a-f]{64}\.snapshot$/;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const CJK_BASE = 0x4e00;
const CJK_SPAN = 0x1000;
const RENDERER_TARGET_QUERY_ABANDONED = new Error('renderer-target query abandoned after the browser disconnected');
// Editing Protection Mode (Issue #951, wave 12 slice 12a): the product's exact words, and the journal's one-edit bound
// (src/shared/protocol.ts MAX_EDIT_GRAPHEMES) that says how many entries a buffered run of text lands as.
const PROTECTION_HEADLINE = '本地写入中断 · 当前更改尚未持久保存';
const PROTECTION_READ_ONLY_HEADLINE = '保护性只读 · 本地写入中断 · 当前更改尚未持久保存';
const PROTECTION_CLOSE_BLOCKED = '窗口未关闭：仍有未持久保存的内容。请先重试写入；或复制受影响内容后，待写入恢复再关闭。';
const PENDING_BUFFER_REFUSED = '尚待确认的编辑已达到单次安全上限，这次输入未被接收；请等待写入确认后分段输入。';
const JOURNAL_EDIT_GRAPHEMES = 256;
const PROTECTION_CJK_BASE = 0x7000;
const STARTUP_FAILURE_MARKERS = Object.freeze([
  Object.freeze(['AI7_STARTUP_FAILED/runtime', 'launch-restart-renderer-target-query-startup-runtime']),
  Object.freeze(['AI7_STARTUP_FAILED/arguments', 'launch-restart-renderer-target-query-startup-arguments']),
  Object.freeze(['AI7_STARTUP_FAILED/data-root', 'launch-restart-renderer-target-query-startup-data-root']),
  Object.freeze(['AI7_STARTUP_FAILED/shell-root', 'launch-restart-renderer-target-query-startup-shell-root']),
  Object.freeze(['AI7_STARTUP_FAILED/single-instance', 'launch-restart-renderer-target-query-single-instance-lock']),
  Object.freeze(['AI7_STARTUP_FAILED/single-instance-lock', 'launch-restart-renderer-target-query-single-instance-lock']),
  Object.freeze(['AI7_STARTUP_FAILED/electron-ready', 'launch-restart-renderer-target-query-startup-electron-ready']),
  Object.freeze(['AI7_STARTUP_FAILED/service-ready', 'launch-restart-renderer-target-query-startup-service-ready']),
  Object.freeze(['AI7_STARTUP_FAILED/renderer-first-paint', 'launch-restart-renderer-target-query-startup-renderer-first-paint']),
  Object.freeze(['AI7_STARTUP_FAILED/readiness-signal', 'launch-restart-renderer-target-query-startup-readiness-signal']),
]);
let diagnosticLocation = 'entry';
let launchStartedAt;
let electronExecutable;
let Zip;
let ZipPassThrough;
let strToU8;

function at(location) {
  diagnosticLocation = location;
  if (localDebugEnabled()) recordDebugDetail('J-02', `at ${location}`);
}

function requireJourney(condition, location, detail) {
  if (condition) return;
  const error = journeyCheckFailure('J-02', location);
  if (detail !== undefined) error.detail = detail;
  throw error;
}

function pathIsInside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function parseJourney() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-02', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-02' };
  const names = process.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
    : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) if (process.env[name] !== undefined) selected[name] = process.env[name];
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireJourney(systemRoot !== undefined && isAbsolute(systemRoot), 'product-environment');
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else {
    selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
  return selected;
}

function blockText(position) {
  const characters = Array.from(
    { length: BLOCK_LENGTH },
    (_, index) => String.fromCodePoint(CJK_BASE + ((position * 17 + index) % CJK_SPAN)),
  );
  if (position % 2_000 === 0) characters.splice(97, SEARCH_TEXT.length, ...SEARCH_TEXT);
  if (position === 1_000) characters.splice(41, OVERLAP_SOURCE_TEXT.length, ...OVERLAP_SOURCE_TEXT);
  if (position <= EXPECTED_EXCLUSION_MATCHES) characters.splice(151, EXCLUSION_TEXT.length, ...EXCLUSION_TEXT);
  return characters.join('');
}

async function createSyntheticDocx(path) {
  requireJourney(Number.isSafeInteger(BLOCK_LENGTH) && BLOCK_COUNT >= 50_000 && BLOCK_COUNT <= 100_000, 'fixture-shape');
  const output = createWriteStream(path, { flags: 'wx' });
  let pendingDrain;
  const waitForPendingDrain = async () => {
    const drain = pendingDrain;
    if (!drain) return;
    try {
      await drain;
    } finally {
      if (pendingDrain === drain) pendingDrain = undefined;
    }
  };
  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    output.once('finish', resolveCompletion);
    output.once('error', rejectCompletion);
  });
  const zip = new Zip((error, data, final) => {
    if (error) {
      output.destroy(error);
      return;
    }
    if (!output.write(data) && pendingDrain === undefined) {
      pendingDrain = once(output, 'drain').then(() => undefined);
    }
    if (final) output.end();
  });
  const pushEntry = async (name, value) => {
    const entry = new ZipPassThrough(name);
    entry.mtime = fixedArchiveTime();
    zip.add(entry);
    entry.push(strToU8(value), true);
    await waitForPendingDrain();
  };
  await pushEntry(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
  );
  await pushEntry(
    'docProps/core.xml',
    '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>千万字有界编辑校验</dc:title></cp:coreProperties>',
  );
  const document = new ZipPassThrough('word/document.xml');
  document.mtime = fixedArchiveTime();
  zip.add(document);
  document.push(strToU8('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'), false);
  await waitForPendingDrain();
  let generatedCharacters = 0;
  for (let position = 1; position <= BLOCK_COUNT; position += 1) {
    const text = blockText(position);
    generatedCharacters += Array.from(text).length;
    const style = position === 1
      ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>'
      : position % 500 === 0
        ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
        : '';
    document.push(strToU8(`<w:p>${style}<w:r><w:t>${text}</w:t></w:r></w:p>`), false);
    if (position % 128 === 0) await waitForPendingDrain();
  }
  requireJourney(generatedCharacters === CHARACTER_COUNT, 'fixture-character-count');
  document.push(strToU8('</w:body></w:document>'), true);
  await waitForPendingDrain();
  zip.end();
  await completion;
  const metadata = await lstat(path);
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > CHARACTER_COUNT, 'fixture-file');
}

async function attachRendererTarget(browser, launchScenario) {
  at(`launch-${launchScenario}-renderer-cdp-session`);
  const guard = (request, options) => settleOnBrowserDisconnect(browser, request, options);
  const rootSession = await guard(browser.newBrowserCDPSession());
  const deadline = Date.now() + 60_000;
  let pageTarget;
  while (Date.now() < deadline) {
    at(`launch-${launchScenario}-renderer-target-query`);
    let targetInfos;
    if (launchScenario === 'restart') {
      let sessionClosed = false;
      const observeSessionClose = () => { sessionClosed = true; };
      rootSession.once('close', observeSessionClose);
      try {
        ({ targetInfos } = await guard(rootSession.send('Target.getTargets'), {
          disconnectError: RENDERER_TARGET_QUERY_ABANDONED,
        }));
      } catch (error) {
        const startupLocations = new Set(
          error instanceof Error
            ? STARTUP_FAILURE_MARKERS
              .filter(([token]) => error.message.includes(token))
              .map(([, location]) => location)
            : [],
        );
        if (startupLocations.size === 1) {
          at(startupLocations.values().next().value);
        } else if (startupLocations.size > 1) {
          at('launch-restart-renderer-target-query-browser-disconnected-multiple-startup-markers');
        } else if (!browser.isConnected()) {
          at('launch-restart-renderer-target-query-browser-disconnected-no-startup-marker');
        } else if (sessionClosed) {
          at('launch-restart-renderer-target-query-session-closed-connected');
        } else {
          at('launch-restart-renderer-target-query-rejected-connected');
        }
        throw error;
      } finally {
        rootSession.off('close', observeSessionClose);
      }
    } else {
      ({ targetInfos } = await guard(rootSession.send('Target.getTargets')));
    }
    at(`launch-${launchScenario}-renderer-target-classification`);
    const pages = targetInfos.filter((target) => target.type === 'page');
    at(`launch-${launchScenario}-renderer-target-cardinality`);
    if (pages.length === 1) {
      pageTarget = pages[0];
      break;
    }
    requireJourney(pages.length === 0, 'renderer-target-count');
    at(`launch-${launchScenario}-renderer-target-wait`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  at(`launch-${launchScenario}-renderer-target-timeout`);
  requireJourney(pageTarget, 'renderer-target-timeout');
  at(`launch-${launchScenario}-renderer-target-attach`);
  const { sessionId } = await guard(rootSession.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: false }));
  let nextId = 1;
  const pending = new Map();
  const executionContexts = new Set();
  rootSession.on('Target.receivedMessageFromTarget', ({ sessionId: incoming, message }) => {
    if (incoming !== sessionId) return;
    let response;
    try { response = JSON.parse(message); } catch { return; }
    if (response.method === 'Runtime.executionContextCreated' && Number.isSafeInteger(response.params?.context?.id)) {
      executionContexts.add(response.params.context.id);
      return;
    }
    if (response.method === 'Runtime.executionContextDestroyed' && Number.isSafeInteger(response.params?.executionContextId)) {
      executionContexts.delete(response.params.executionContextId);
      return;
    }
    if (response.method === 'Runtime.executionContextsCleared') {
      executionContexts.clear();
      return;
    }
    if (typeof response.id !== 'number') return;
    const completion = pending.get(response.id);
    if (!completion) return;
    pending.delete(response.id);
    if (response.error) completion.reject(journeyCheckFailure('J-02', 'renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectResponse(journeyCheckFailure('J-02', 'renderer-cdp-timeout'));
      }, 60_000);
      timeout.unref();
      pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
        reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
      });
    });
    await guard(rootSession.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }));
    return response;
  };
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    requireJourney(!response.exceptionDetails, 'renderer-evaluate', response.exceptionDetails);
    return response.result.value;
  };
  const observeIpc = async () => {
    for (const contextId of executionContexts) {
      try {
        const response = await send('Runtime.evaluate', {
          expression: `globalThis.__ai7J02IpcObservation?.snapshot?.()`,
          contextId,
          awaitPromise: true,
          returnByValue: true,
        });
        if (!response.exceptionDetails && response.result?.value?.counts && Array.isArray(response.result.value.events)) {
          return response.result.value;
        }
      } catch {
        executionContexts.delete(contextId);
      }
    }
    throw journeyCheckFailure('J-02', 'preload-ipc-observation');
  };
  // Issue #951 (T0-1): the Edit Journal write-failure injection, set through the preload's J-02-only global.
  const setJournalFault = async (mode) => {
    for (const contextId of executionContexts) {
      try {
        const response = await send('Runtime.evaluate', {
          expression: `globalThis.__ai7J02JournalFault?.set(${JSON.stringify(mode)})`,
          contextId,
          awaitPromise: true,
          returnByValue: true,
        });
        if (!response.exceptionDetails && response.result?.value?.mode === mode) return response.result.value;
      } catch {
        executionContexts.delete(contextId);
      }
    }
    throw journeyCheckFailure('J-02', 'preload-journal-fault');
  };
  at(`launch-${launchScenario}-renderer-runtime-enable`);
  await send('Runtime.enable');
  return { evaluate, observeIpc, setJournalFault, send };
}

async function waitFor(renderer, expression, location, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-02', location);
}

async function waitForChecks(renderer, expression, location, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let failed = ['diagnostic-unavailable'];
  while (Date.now() < deadline) {
    const checks = await renderer.evaluate(expression);
    if (checks && typeof checks === 'object' && !Array.isArray(checks)) {
      const entries = Object.entries(checks);
      if (entries.length > 0) {
        failed = entries.filter(([, passed]) => passed !== true).map(([name]) => name);
        if (failed.length === 0) return;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-02', location, { failed });
}

/**
 * The initial-launch readiness wait. Both halves of readiness are polled separately so an expiry names the one that
 * was still missing — the preload's `ai7ProductReady` flag or the landing screen the flag precedes — instead of a bare
 * marker. The deadline follows the product's own startup readiness deadline plus a fixed margin, so a slow but healthy
 * host that the product itself still tolerates does not fail the Journey. A wait that succeeds prints nothing.
 */
async function waitForRendererReady(renderer) {
  const deadline = Date.now() + RENDERER_READY_TIMEOUT;
  let flag = false;
  let landing = false;
  while (Date.now() < deadline) {
    const checks = await renderer.evaluate(
      `({ flag: document.documentElement.dataset.ai7ProductReady === 'true', landing: Boolean(document.querySelector('[data-screen="landing"]')) })`,
    );
    if (checks && typeof checks === 'object' && !Array.isArray(checks)) {
      flag = checks.flag === true;
      landing = checks.landing === true;
      if (flag && landing) return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const location = flag ? 'renderer-ready-landing' : 'renderer-ready-flag';
  at(location);
  requireJourney(false, location, {
    waited_ms: RENDERER_READY_TIMEOUT,
    elapsed_since_launch_ms: launchStartedAt === undefined ? null : Date.now() - launchStartedAt,
    product_ready_flag: flag,
    landing_screen: landing,
  });
}

async function assertRenderer(renderer, expression, location) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), location);
}

async function editThenInvokeOnDirty(renderer, suffix, actionLabels, location) {
  const started = await renderer.evaluate(
    `(async () => {
      const editor = document.querySelector('[data-testid="manuscript-editor"]');
      const block = editor?.lastElementChild;
      const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑');
      const actionLabels = ${JSON.stringify(actionLabels)};
      const actions = actionLabels.map((label) => Array.from(document.querySelectorAll('button')).find((button) => button.textContent === label));
      if (!(editor instanceof HTMLElement) || !(block instanceof HTMLElement) || !(save instanceof HTMLButtonElement) ||
          actions.some((action) => !(action instanceof HTMLButtonElement)) || !save.disabled ||
          actions.some((action) => action !== save && action.disabled)) return false;
      const blockId = block.dataset.blockId;
      const before = block.textContent;
      if (!blockId || before === null) return false;
      const dirtyReady = new Promise((resolve) => {
        let settled = false;
        let timeout;
        const finish = (dirty) => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          clearTimeout(timeout);
          resolve(dirty);
        };
        const observer = new MutationObserver(() => {
          if (!save.disabled) finish(true);
        });
        observer.observe(save, { attributes: true, attributeFilter: ['disabled'] });
        timeout = setTimeout(() => finish(false), 250);
        if (!save.disabled) finish(true);
      });
      block.focus();
      const range = document.createRange();
      range.selectNodeContents(block);
      range.collapse(false);
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand('insertText', false, ${JSON.stringify(suffix)})) return false;
      const dirty = await dirtyReady;
      const liveBlock = Array.from(editor.children).find((item) => item.getAttribute('data-block-id') === blockId);
      if (!dirty || save.disabled || !(liveBlock instanceof HTMLElement) || liveBlock.textContent !== before + ${JSON.stringify(suffix)} ||
          actions.some((action) => action.disabled)) return false;
      for (const action of actions) action.click();
      return true;
    })()`,
  );
  requireJourney(started === true, location);
}

/**
 * Synchronized delta with Issue #409: the outline, the search and the milestone form are one 导航 panel
 * that opens on demand from the right edge and is closed when the manuscript opens. The rail stays
 * visible either way, and the panel is first seen closed.
 */
async function openNavigation(renderer, location) {
  // A screen reopened after the J-14 dark pass paints in more than one step on a hosted runner, so the first sight of the
  // closed panel and its rail is waited for, not read once (#935).
  await waitFor(renderer, `(() => { const entry = document.querySelector('[data-edge-entry="navigation"]'); const panel = document.querySelector('#manuscript-navigation-panel'); const rail = document.querySelector('.rail-track .position-rail'); return entry?.getAttribute('aria-expanded') === 'false' && panel?.hidden === true && rail instanceof HTMLInputElement && rail.getBoundingClientRect().height > rail.getBoundingClientRect().width; })()`, `${location}-closed-with-rail`, 30_000);
  await assertRenderer(renderer, `(() => { const entry = document.querySelector('[data-edge-entry="navigation"]'); const panel = document.querySelector('#manuscript-navigation-panel'); if (!(entry instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return false; if (entry.getAttribute('aria-expanded') !== 'true') entry.click(); return entry.getAttribute('aria-expanded') === 'true' && !panel.hidden; })()`, location);
  // The rail draws the manuscript's chapters as ticks, bounded however long the manuscript is, and says
  // when the bound cut them; the pane's own scrollbar shows only while the pane scrolls (V2-UX-ED-059).
  await waitFor(renderer, `(() => { const track = document.querySelector('.rail-track'); const chapters = Number(track?.dataset.railChapters); return chapters > 0 && chapters <= 400 && track.querySelectorAll('.rail-tick').length === chapters && track.dataset.railAnalysed === 'false' && track.querySelectorAll('.rail-marker').length === 0; })()`, `${location}-rail-ticks`, 30_000);
  // The pane marks itself scrolling for 900 ms after any scroll event, including the ones a re-render makes; the bar is
  // at rest once that mark is gone, and only then does the Journey scroll it itself (the hosted failure of #935).
  await waitFor(renderer, `(() => { const pane = document.querySelector('.editor-window'); return pane instanceof HTMLElement && pane.dataset.scrolling === undefined; })()`, `${location}-scrollbar-at-rest`, 15_000);
  await assertRenderer(renderer, `(() => { const pane = document.querySelector('.editor-window'); if (pane.dataset.scrolling !== undefined) return false; pane.scrollTop += 24; return true; })()`, `${location}-scrollbar-scroll`);
  await waitFor(renderer, `document.querySelector('.editor-window').dataset.scrolling === 'true'`, `${location}-scrollbar-while-scrolling`, 5_000);
  await waitFor(renderer, `document.querySelector('.editor-window').dataset.scrolling === undefined`, `${location}-scrollbar-rests-again`, 5_000);
  await assertRenderer(renderer, `(() => { const pane = document.querySelector('.editor-window'); pane.scrollTop = 0; return true; })()`, `${location}-scroll-back`);
}

async function clickButton(renderer, label, location) {
  await assertRenderer(
    renderer,
    `(() => { const item = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === ${JSON.stringify(label)}); if (!item || item.disabled) return false; item.click(); return true; })()`,
    location,
  );
}

async function fill(renderer, selector, value, location) {
  await assertRenderer(
    renderer,
    `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) return false; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    location,
  );
}

async function press(renderer, key, modifiers = 0) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
}

/** Choose one of the milestone form's purpose cards (Issue #414): the four frozen purposes or 自行输入. */
async function choosePurpose(renderer, kind, location) {
  await assertRenderer(
    renderer,
    `(() => { const radio = document.querySelector('.milestone-section input[type="radio"][name="milestone-purpose"][value=${JSON.stringify(kind)}]'); if (!(radio instanceof HTMLInputElement) || radio.disabled) return false; radio.click(); return radio.checked; })()`,
    location,
  );
}

/**
 * Where staging stood when its bound passed (#621), read from the store the service writes: still reading the archive
 * (no block parsed yet), parsing it into blocks (the parse commits them in batches, so their count shows how far it had
 * come), recording the draft (every block parsed, the draft not yet written), or done with the target screen not shown.
 * `unreadable` when the store could not be read at that moment.
 */
function importStagePhase(dataRoot) {
  let database;
  try {
    database = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    const count = (sql) => Number(database.prepare(sql).get()?.total ?? 0);
    if (count('SELECT count(*) AS total FROM import_drafts') > 0) return { phase: 'screen', blocks: BLOCK_COUNT };
    const blocks = count('SELECT count(*) AS total FROM import_ingest_blocks');
    return { phase: blocks >= BLOCK_COUNT ? 'recording' : blocks > 0 ? 'parsing' : 'reading', blocks };
  } catch {
    return { phase: 'unreadable', blocks: null };
  } finally {
    database?.close();
  }
}

/**
 * How far the import has come, as the store the service writes shows it (#621, #690): the drafts staged, the blocks a parse
 * has committed so far (staging's own, or the commit's re-parse of the same file), the commit attempts prepared (one is
 * written once the commit's re-parse has proven the file, just before its write transaction), the imports committed, and
 * the bytes of the store and its write-ahead log. Counts and sizes only; `null` when the store could not be read at that
 * moment. The commit's write is one transaction: until it commits, none of these need change, since the main file grows
 * only at a checkpoint and the log is reused from its start rather than grown.
 */
function importProgress(dataRoot) {
  const size = (name) => {
    try {
      return statSync(join(dataRoot, 'store', name)).size;
    } catch {
      return 0;
    }
  };
  let database;
  try {
    database = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    const count = (sql) => Number(database.prepare(sql).get()?.total ?? 0);
    return {
      drafts: count('SELECT count(*) AS total FROM import_drafts'),
      blocks: count('SELECT count(*) AS total FROM import_ingest_blocks'),
      attempts: count('SELECT count(*) AS total FROM import_commit_attempts'),
      commits: count('SELECT count(*) AS total FROM import_commits'),
      bytes: size('ai7.sqlite') + size('ai7.sqlite-wal'),
    };
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

/**
 * Wait for one of the import's long steps by its progress rather than by a wall clock (#621, #690). `expression` reads the
 * renderer as `done`, `refused` (the product answered without reaching the next screen) or `waiting`. While it waits, the
 * store is read every `interval`, and any change in what it shows counts as the import moving. The wait ends `stalled` once
 * the store has shown no change for IMPORT_STALL, and `progressing` only at the product's own deadline for the request,
 * past which the product stops its service itself: a slow runner whose import keeps moving is waited for, and one that
 * stopped is named quickly. Once `quietPhase(progress)` has been seen — a phase that shows no change while it works, the
 * commit's single write transaction — the stall rule no longer applies, and the product's deadline ends the wait as
 * `quiet`. The outcome carries the last reading, the most blocks any reading showed, and whether the quiet phase was seen.
 */
async function watchImportStep(renderer, dataRoot, expression, { interval = IMPORT_SAMPLE_INTERVAL, quietPhase = () => false } = {}) {
  const started = Date.now();
  const deadline = started + PRODUCT_LONG_REQUEST_TIMEOUT + IMPORT_WAIT_MARGIN;
  let sampledAt = 0;
  let signature = null;
  let progressedAt = started;
  let progress = null;
  let mostBlocks = 0;
  let quiet = false;
  const sample = () => {
    progress = importProgress(dataRoot);
    sampledAt = Date.now();
    if (progress === null) return;
    mostBlocks = Math.max(mostBlocks, progress.blocks);
    if (!quiet && quietPhase(progress)) quiet = true;
    const next = `${progress.drafts}/${progress.blocks}/${progress.attempts}/${progress.commits}/${progress.bytes}`;
    if (next !== signature) {
      signature = next;
      progressedAt = sampledAt;
    }
  };
  const ended = (outcome) => {
    const result = { outcome, progress, mostBlocks, quiet, quietMs: Date.now() - progressedAt, elapsedMs: Date.now() - started };
    if (localDebugEnabled()) recordDebugDetail('J-02', `import step ${diagnosticLocation} ended ${JSON.stringify(result)}`);
    return result;
  };
  sample();
  for (;;) {
    const state = await renderer.evaluate(expression);
    if (state === 'done') return ended('done');
    if (state === 'refused') {
      sample();
      return ended('refused');
    }
    if (Date.now() - sampledAt >= interval) sample();
    if (!quiet && Date.now() - progressedAt >= IMPORT_STALL) return ended('stalled');
    if (Date.now() >= deadline) return ended(quiet ? 'quiet' : 'progressing');
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}

/** A share of CPU as a check label's word: under `low` is `idle`, under `high` is `some`, and the rest is `busy`. */
function cpuShareWord(share, low, high) {
  if (share < low) return 'idle';
  if (share < high) return 'some';
  return 'busy';
}

/**
 * How busy the product and the host were as an import step passed its bound, over five seconds, for a check label (#621):
 * `product-<word>` is the product's processes as a share of one core (under 0.1 idle, under 0.8 some), and `host-<word>`
 * every process on the host as a share of all its cores (under a quarter idle, under three quarters some). A product
 * working while its import stands still is slow; an idle one beside a busy host is starved by something else; both idle is
 * a product waiting on something. `cpu-unsampled` when the host's processes could not be read.
 */
async function importCpuWords() {
  const shares = await measureCpuShares(process.pid);
  if (shares === null) return 'cpu-unsampled';
  return `product-${cpuShareWord(shares.product, 0.1, 0.8)}-host-${cpuShareWord(shares.host, 0.25, 0.75)}`;
}

/** The tenths of the file a parse had committed, for a check label. */
function parsedTenths(blocks) {
  return Math.min(10, Math.floor((blocks ?? 0) * 10 / BLOCK_COUNT));
}

/**
 * Wait for the target screen staging leads to. A staging the product refused ends the wait on its error screen. Otherwise
 * the stage names where staging stood (`import-stage-<phase>`) and the check says whether it was refused, had stalled or
 * was still moving at the product's own deadline, with how far the parse had come in tenths, or that the draft was staged
 * and the screen never shown. Only fixed words and a count leave the run.
 */
async function waitForStagedTarget(renderer, dataRoot) {
  const watched = await watchImportStep(
    renderer,
    dataRoot,
    `document.querySelector('[data-screen="target"]') ? 'done' : document.querySelector('[data-screen="error"]') ? 'refused' : 'waiting'`,
  );
  if (watched.outcome === 'done') return;
  const stood = importStagePhase(dataRoot);
  at(`import-stage-${stood.phase}`);
  const tenths = parsedTenths(stood.phase === 'screen' ? BLOCK_COUNT : watched.mostBlocks);
  requireJourney(watched.outcome !== 'refused', `stage-target-refused-at-${Number(tenths)}-tenths`);
  requireJourney(stood.phase !== 'screen', 'stage-target-staged-not-shown');
  const cpu = await importCpuWords();
  requireJourney(watched.outcome !== 'progressing', `stage-target-progressing-at-${Number(tenths)}-tenths-${cpu}`);
  requireJourney(false, `stage-target-stalled-at-${Number(tenths)}-tenths-${cpu}`);
}

/**
 * Wait for the commit's `imported` screen, then for its completion to be acknowledged (#690). The commit re-parses the
 * staged file to prove it unchanged, prepares its attempt, then writes the Book and its manuscript in one transaction that
 * shows the store no change until it commits. So the stall rule holds only until the attempt is prepared: after that the
 * write is bounded by the product's own deadline, and reaching it is `quiet`, not `stalled`. The store is read every second
 * here, so a quick re-parse is still seen. A check names how far the commit had come: `preparing` (nothing re-parsed yet),
 * `revalidating-<n>-tenths`, `writing` (the attempt prepared, the transaction under way), or `committed` with the screen
 * not shown.
 */
async function waitForImportCommitted(renderer, dataRoot) {
  const commitButton = JSON.stringify('新建图书并导入稿件');
  const committed = await watchImportStep(
    renderer,
    dataRoot,
    `(() => { const state = document.querySelector('#screen')?.dataset.screen; if (state === 'imported') return 'done'; if (state !== 'review') return 'refused'; const commit = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === ${commitButton}); return commit instanceof HTMLButtonElement && !commit.disabled ? 'refused' : 'waiting'; })()`,
    { interval: IMPORT_COMMIT_SAMPLE_INTERVAL, quietPhase: (progress) => progress.attempts > 0 },
  );
  if (committed.outcome !== 'done') {
    const progress = committed.progress;
    requireJourney(progress === null || progress.commits === 0, 'imported-committed-not-shown');
    const outcome = committed.outcome === 'refused'
      ? 'refused'
      : committed.outcome === 'stalled' ? 'stalled' : committed.outcome === 'quiet' ? 'quiet' : 'progressing';
    requireJourney(outcome !== 'refused' || !committed.quiet, 'imported-refused-at-writing');
    requireJourney(outcome !== 'refused' || committed.mostBlocks === 0, `imported-refused-at-revalidating-${Number(parsedTenths(committed.mostBlocks))}-tenths`);
    requireJourney(outcome !== 'refused', 'imported-refused-at-preparing');
    // A commit that ran out of its bound also says how busy the product and the host were then (#621).
    const cpu = await importCpuWords();
    requireJourney(!committed.quiet, `imported-${outcome}-at-writing-${cpu}`);
    requireJourney(committed.mostBlocks === 0, `imported-${outcome}-at-revalidating-${Number(parsedTenths(committed.mostBlocks))}-tenths-${cpu}`);
    requireJourney(false, `imported-${outcome}-at-preparing-${cpu}`);
  }
  const acknowledged = await watchImportStep(
    renderer,
    dataRoot,
    `(() => { if (document.querySelector('#screen')?.dataset.screen !== 'imported') return 'refused'; const open = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '打开稿件'); return document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true' && open instanceof HTMLButtonElement && !open.disabled ? 'done' : 'waiting'; })()`,
  );
  if (acknowledged.outcome === 'done') return;
  if (acknowledged.outcome === 'refused') requireJourney(false, 'completion-acknowledged-before-open-refused');
  const cpu = await importCpuWords();
  if (acknowledged.outcome === 'stalled') requireJourney(false, `completion-acknowledged-before-open-stalled-${cpu}`);
  requireJourney(false, `completion-acknowledged-before-open-progressing-${cpu}`);
}

async function importAndOpen(renderer, dataRoot) {
  at('renderer-ready');
  await waitForRendererReady(renderer);
  await assertRenderer(renderer, SIDEBAR_LIBRARY_READY, 'sidebar-library-entry');
  await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined'`, 'renderer-isolation');
  requireJourney(await renderer.evaluate(`(async () => { try { await fetch('http://127.0.0.1:9/j02-denial'); return false; } catch { return true; } })()`), 'renderer-network-denial');
  // The import is three long waits over a ten-million-character file; under the one name
  // `renderer-ready` a hosted runner that ran out of one of them read as a product that never started
  // (the queue run of 2026-09-19 lost 240 s here on Windows). Each wait now has its own stage (#474).
  at('import-stage');
  await clickButton(renderer, '导入稿件', 'stage-click');
  await waitForStagedTarget(renderer, dataRoot);
  await assertRenderer(renderer, `document.querySelector('.source-card')?.textContent.includes('${BLOCK_COUNT} 个可编辑内容块')`, 'exact-block-count');
  await assertRenderer(renderer, `(() => { const radio = document.querySelector('input[aria-label="新建图书"]'); if (!radio) return false; radio.click(); return true; })()`, 'target-select');
  await assertRenderer(renderer, `(() => { const radio = document.querySelector('input[aria-label="作为首份稿件导入"]'); if (!radio || radio.checked) return false; radio.click(); return true; })()`, 'relationship-select');
  at('import-review');
  await waitFor(renderer, `document.querySelector('#book-title')`, 'title');
  await fill(renderer, '#book-title', '千万字有界编辑校验', 'title-fill');
  await clickButton(renderer, '确认书名并复核', 'review-click');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'review');
  await assertRenderer(renderer, `!document.querySelector('#accept-import-degradation') && Array.from(document.querySelectorAll('[data-fidelity-category]')).every((row) => row.dataset.fidelityCategory === 'round-trip-export' || row.querySelector('.status-preserved'))`, 'clean-fidelity');
  at('import-commit');
  await clickButton(renderer, '新建图书并导入稿件', 'commit-click');
  await waitForImportCommitted(renderer, dataRoot);
  at('import-editor-open');
  await assertRenderer(renderer, sidebarNavigate(SIDEBAR.section('manuscript')), 'editor-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'editor');
  // J-14 dark pass (#935): 深色 through 设置 › 外观, this screen checked, then 跟随系统 again; back through the sidebar.
  await runJ14DarkPass({ renderer, journey: 'J-02', at, representative: '#screen[data-screen="editor"] .editor-window', returnTo: SIDEBAR.section('manuscript') });
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'editor-after-dark-pass');
  await openNavigation(renderer, 'editor-navigation-open');
}

async function milestoneObjectTimeoutCategory(dataRoot) {
  let directory;
  try {
    directory = await opendir(join(dataRoot, 'recovery-objects', 'v1'));
  } catch (error) {
    if (error?.code === 'ENOENT') return 'recovery-object-absent';
    throw journeyCheckFailure('J-02', 'milestone-r2-object-inspection');
  }
  let promoted = false;
  for await (const entry of directory) {
    if (!entry.isFile()) continue;
    if (RECOVERY_PARTIAL_PATTERN.test(entry.name)) return 'partial-object-present';
    if (RECOVERY_OBJECT_PATTERN.test(entry.name)) promoted = true;
  }
  return promoted ? 'promoted-object-present' : 'recovery-object-absent';
}

async function milestoneIpcTimeoutCategory(renderer, beforeObservation) {
  let afterObservation;
  try {
    afterObservation = await renderer.observeIpc();
  } catch {
    return 'ipc-diagnostic-unavailable';
  }

  if (!Array.isArray(beforeObservation?.events) || !Array.isArray(afterObservation?.events)) {
    return 'ipc-diagnostic-unavailable';
  }

  const boundaryOrdinal = beforeObservation.events.at(-1)?.ordinal ?? 0;
  if (!Number.isSafeInteger(boundaryOrdinal)) {
    return 'ipc-diagnostic-unavailable';
  }

  const events = [];
  for (const event of afterObservation.events) {
    if (event === null || typeof event !== 'object') continue;
    const { operation, ordinal, phase } = event;
    if (
      !Number.isSafeInteger(ordinal) ||
      ordinal <= boundaryOrdinal ||
      (operation !== 'flushJournalEdit' && operation !== 'saveMilestone') ||
      (phase !== 'invoke' && phase !== 'result' && phase !== 'error')
    ) {
      continue;
    }
    events.push({ operation, ordinal, phase });
  }
  events.sort((left, right) => left.ordinal - right.ordinal);

  const flushInvoke = events.find(
    (event) => event.operation === 'flushJournalEdit' && event.phase === 'invoke',
  );
  if (!flushInvoke) return 'no-flush-invoke';

  const flushTerminal = events.find(
    (event) =>
      event.ordinal > flushInvoke.ordinal &&
      event.operation === 'flushJournalEdit' &&
      (event.phase === 'result' || event.phase === 'error'),
  );
  if (!flushTerminal) return 'flush-pending';
  if (flushTerminal.phase === 'error') return 'flush-error';

  const saveInvoke = events.find(
    (event) =>
      event.ordinal > flushTerminal.ordinal &&
      event.operation === 'saveMilestone' &&
      event.phase === 'invoke',
  );
  if (!saveInvoke) return 'flush-result-no-save-invoke';

  const saveTerminal = events.find(
    (event) =>
      event.ordinal > saveInvoke.ordinal &&
      event.operation === 'saveMilestone' &&
      (event.phase === 'result' || event.phase === 'error'),
  );
  if (!saveTerminal) return 'save-pending';
  if (saveTerminal.phase === 'error') return 'save-error';
  return 'save-result-renderer-not-r2';
}

async function runWorkspaceJourney(renderer, dataRoot) {
  at('bounded-workspace');
  await assertRenderer(renderer, `document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length === 32`, 'renderer-block-ceiling');
  await assertRenderer(renderer, `document.querySelector('#manuscript-position')?.max === '1000000' && document.querySelector('.editor-meta')?.textContent.includes('全稿 0.000%')`, 'whole-manuscript-position');
  // Synchronized delta with Issue #414: the purpose is an unselected card set — the four frozen purposes and
  // 自行输入, whose own field keeps the service's 120-unit bound and shows only once 自行输入 is chosen.
  await assertRenderer(renderer, `(() => { const radios = Array.from(document.querySelectorAll('.milestone-section input[type="radio"][name="milestone-purpose"]')); const custom = document.querySelector('#milestone-purpose-custom'); return document.querySelector('#milestone-label')?.maxLength === 80 && radios.map((radio) => radio.value).join(',') === 'stage-archive,review-candidate,delivery-candidate,other,custom' && radios.every((radio) => !radio.checked) && custom instanceof HTMLInputElement && custom.maxLength === 120 && custom.hidden && document.querySelector('#milestone-note')?.maxLength === 500; })()`, 'milestone-ui-service-bounds');
  await renderer.evaluate(`globalThis.__ai7FirstBlock = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId`);

  const positionJump = `(() => { const rail = document.querySelector('#manuscript-position'); rail.value = '${INTERIOR_POSITION_RAIL}'; rail.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`;
  await assertRenderer(renderer, positionJump, 'position-jump');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('${INTERIOR_POSITION_LABEL}')`, 'position-jump-resolved');
  await assertRenderer(renderer, `document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32`, 'position-window-bounded');
  await assertRenderer(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const blocks = Array.from(editor?.querySelectorAll(':scope > [data-block-id]') ?? []); const selection = window.getSelection(); const focusBlock = selection?.anchorNode?.parentElement?.closest('[data-block-id]'); return blocks.length === 32 && focusBlock === blocks[16] && selection?.isCollapsed === true && selection.anchorOffset === ${INTERIOR_FOCUS_GRAPHEME} && selection.focusOffset === ${INTERIOR_FOCUS_GRAPHEME} && focusBlock?.textContent?.length === ${BLOCK_LENGTH}; })()`,
    'position-interior-exact-dom-focus',
  );
  requireJourney(INTERIOR_BLOCK_POSITION === 37_501 && INTERIOR_FOCUS_GRAPHEME === 130, 'position-interior-fixture-truth');
  await renderer.evaluate(`globalThis.__ai7BeforeForward = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId`);
  const continuityPrepared = await renderer.evaluate(
    `(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const editor = document.querySelector('[data-testid="manuscript-editor"]');
      const surface = document.querySelector('.editor-window');
      const blocks = Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]'));
      const block = blocks[4];
      const text = block?.firstChild;
      if (!(editor instanceof HTMLElement) || !(surface instanceof HTMLElement) || !(block instanceof HTMLElement) || !(text instanceof Text) || text.length < 4) return false;
      editor.focus();
      block.scrollIntoView({ block: 'center' });
      const selection = window.getSelection();
      if (!selection) return false;
      selection.setBaseAndExtent(text, 3, text, 1);
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const containerTop = surface.getBoundingClientRect().top;
      const visible = blocks.find((candidate) => candidate.getBoundingClientRect().bottom >= containerTop);
      globalThis.__ai7WindowContinuity = { blockId: block.dataset.blockId, text: selection.toString(), anchor: 3, head: 1, scrollBlockId: visible?.dataset.blockId, scrollOffset: visible?.getBoundingClientRect().top - containerTop };
      return document.activeElement === editor && selection.anchorOffset === 3 && selection.focusOffset === 1;
    })()`,
  );
  requireJourney(continuityPrepared === true, 'window-continuity-prepare');
  await press(renderer, 'PageDown');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId !== globalThis.__ai7BeforeForward`, 'forward-window-resolved');
  await assertRenderer(renderer, `(() => { const expected = globalThis.__ai7WindowContinuity; const editor = document.querySelector('[data-testid="manuscript-editor"]'); if (!(editor instanceof HTMLElement)) return false; globalThis.__ai7DeferredWindowText = editor.textContent; globalThis.__ai7DeferredJournal = document.querySelector('.editor-meta')?.textContent; return editor.getAttribute('contenteditable') === 'false' && editor.getAttribute('aria-readonly') === 'true' && document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32 && !document.querySelector('[data-block-id="' + expected.blockId + '"]') && !document.querySelector('[data-block-id="' + expected.scrollBlockId + '"]'); })()`, 'forward-non-overlap-readonly-endpoints-unrendered');
  await waitFor(renderer, `document.activeElement === document.querySelector('[data-testid="manuscript-editor"]')`, 'forward-non-overlap-focus-continuity');
  await renderer.send('Input.insertText', { text: '拒' });
  await assertRenderer(renderer, `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); return editor?.getAttribute('contenteditable') === 'false' && editor.getAttribute('aria-readonly') === 'true' && editor.textContent === globalThis.__ai7DeferredWindowText && document.querySelector('.editor-meta')?.textContent === globalThis.__ai7DeferredJournal && document.activeElement === editor; })()`, 'forward-non-overlap-insert-blocked');
  await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await press(renderer, 'PageUp');
  await waitForChecks(
    renderer,
    `(() => { const expected = globalThis.__ai7WindowContinuity; if (!expected) return { expected: false }; const editor = document.querySelector('[data-testid="manuscript-editor"]'); const selection = window.getSelection(); const surface = document.querySelector('.editor-window'); const anchorBlock = selection?.anchorNode?.parentElement?.closest('[data-block-id]'); const headBlock = selection?.focusNode?.parentElement?.closest('[data-block-id]'); const scrollBlock = document.querySelector('[data-block-id="' + expected.scrollBlockId + '"]'); return { contenteditable: editor?.getAttribute('contenteditable') === 'true', ariaReadonly: editor?.getAttribute('aria-readonly') === 'false', windowBounded: document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32, anchorBlock: anchorBlock?.dataset.blockId === expected.blockId, headBlock: headBlock?.dataset.blockId === expected.blockId, anchorOffset: selection?.anchorOffset === expected.anchor, focusOffset: selection?.focusOffset === expected.head, backward: Boolean(selection && selection.anchorOffset > selection.focusOffset), selectedText: selection?.toString() === expected.text, surface: surface instanceof HTMLElement, scrollBlock: scrollBlock instanceof HTMLElement, scrollOffset: surface instanceof HTMLElement && scrollBlock instanceof HTMLElement && Math.abs((scrollBlock.getBoundingClientRect().top - surface.getBoundingClientRect().top) - expected.scrollOffset) <= 3 }; })()`,
    'back-non-overlap-selection-continuity',
  );
  await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await assertRenderer(renderer, `document.querySelectorAll('.outline-list button').length === 64 && !Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '下一组结构')?.hidden`, 'outline-first-page-bounded');
  await clickButton(renderer, '下一组结构', 'outline-next-page');
  await waitFor(renderer, `document.querySelectorAll('.outline-list button').length > 0 && document.querySelectorAll('.outline-list button').length <= 64 && !Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '上一组结构')?.hidden`, 'outline-next-page-bounded');
  await clickButton(renderer, '上一组结构', 'outline-previous-page');
  await waitFor(renderer, `document.querySelectorAll('.outline-list button').length === 64`, 'outline-previous-page-bounded');
  await clickButton(renderer, '下一组结构', 'outline-last-page');
  await waitFor(
    renderer,
    `(() => { const items = document.querySelectorAll('.outline-list button'); const buttons = Array.from(document.querySelectorAll('button')); const previous = buttons.find((button) => button.textContent === '上一组结构'); const next = buttons.find((button) => button.textContent === '下一组结构'); return items.length > 0 && items.length <= 64 && previous instanceof HTMLButtonElement && !previous.hidden && next instanceof HTMLButtonElement && next.hidden; })()`,
    'outline-last-page-bounded',
  );
  await assertRenderer(renderer, `(() => { const items = document.querySelectorAll('.outline-list button'); const target = items[items.length - 1]; if (!target) return false; target.click(); return true; })()`, 'outline-jump');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('99.998%')`, 'outline-exact-resolve');
  at('cooperative-position-stabilize');
  await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await assertRenderer(renderer, `document.querySelector('.editor-meta')?.textContent.includes('99.998%')`, 'outline-exact-stable');

  at('cooperative-position-input');
  await assertRenderer(
    renderer,
    `(() => { const rail = document.querySelector('#manuscript-position'); if (!(rail instanceof HTMLInputElement)) return false; rail.value = '0'; rail.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
    'near-start-position-jump',
  );
  at('cooperative-position-resolve');
  try {
    await waitFor(
      renderer,
      `document.querySelector('.editor-meta')?.textContent.includes('0.000%') && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId === globalThis.__ai7FirstBlock && document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32`,
      'near-start-position-resolved',
    );
  } catch (error) {
    const checks = await renderer.evaluate(
      `(() => ({
        percent: document.querySelector('.editor-meta')?.textContent.includes('0.000%') === true,
        firstBlock: document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId === globalThis.__ai7FirstBlock,
        windowBound: document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32,
      }))()`,
    );
    if (checks?.percent !== true) at('cooperative-position-percent');
    else if (checks?.firstBlock !== true) at('cooperative-position-first-block');
    else if (checks?.windowBound !== true) at('cooperative-position-window-bound');
    else at('cooperative-position-late');
    throw error;
  }
  at('cooperative-search-start');
  await fill(renderer, '#manuscript-search', '天', 'common-search-fill');
  const commonSearchObservation = await renderer.observeIpc();
  await assertRenderer(
    renderer,
    `(() => { const search = document.querySelector('#manuscript-search'); const start = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '查找全稿'); const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作'); if (!(search instanceof HTMLInputElement) || !start || !cancel || search.disabled || start.disabled || !cancel.hidden || cancel.dataset.serviceJobId) return false; start.click(); const pendingGap = search.disabled && start.disabled && cancel.hidden && cancel.dataset.serviceJobId === ''; search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return pendingGap && cancel.hidden && cancel.dataset.serviceJobId === ''; })()`,
    'single-service-job-start-promise-gap-reentry',
  );
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作')?.hidden`, 'common-search-running');
  at('cooperative-search-reentry');
  await assertRenderer(renderer, `(() => { const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作'); const search = document.querySelector('#manuscript-search'); if (!cancel?.dataset.serviceJobId || !(search instanceof HTMLInputElement)) return false; globalThis.__ai7ServiceJobId = cancel.dataset.serviceJobId; search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '查找全稿')?.click(); return cancel.dataset.serviceJobId === globalThis.__ai7ServiceJobId && document.querySelectorAll('button[data-service-job-id="' + globalThis.__ai7ServiceJobId + '"]').length === 1; })()`, 'single-service-job-reentry');
  const afterSearchReentryObservation = await renderer.observeIpc();
  const commonSearchEvents = afterSearchReentryObservation.events.filter(
    (event) => event.ordinal > (commonSearchObservation.events.at(-1)?.ordinal ?? 0) &&
      event.operation === 'startSearch' && event.phase === 'invoke',
  );
  requireJourney(
    (afterSearchReentryObservation.counts.startSearch ?? 0) - (commonSearchObservation.counts.startSearch ?? 0) === 1 &&
      commonSearchEvents.length === 1,
    'single-service-job-gap-actual-start-ipc',
  );
  at('cooperative-edit-during-search');
  const firstCooperativeEdit = '协作'.repeat(150);
  const secondCooperativeEdit = '续写';
  await assertRenderer(
    renderer,
    `(() => {
      const editor = document.querySelector('[data-testid="manuscript-editor"]');
      const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑');
      const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作');
      const blocks = Array.from(editor?.querySelectorAll(':scope > [data-block-id]') ?? []);
      const first = blocks[0];
      const second = blocks[1];
      if (!(editor instanceof HTMLElement) || editor.dataset.operationLocked !== 'false' || editor.getAttribute('contenteditable') !== 'true' ||
          editor.getAttribute('aria-readonly') !== 'false' || !(save instanceof HTMLButtonElement) || !save.disabled ||
          !(cancel instanceof HTMLButtonElement) || cancel.hidden || !cancel.dataset.serviceJobId ||
          cancel.dataset.serviceJobId !== globalThis.__ai7ServiceJobId ||
          document.querySelectorAll('button[data-service-job-id="' + cancel.dataset.serviceJobId + '"]').length !== 1 ||
          !(first instanceof HTMLElement) || !(second instanceof HTMLElement) || !first.dataset.blockId || !second.dataset.blockId ||
          first.dataset.blockId === second.dataset.blockId || first.textContent === null || second.textContent === null) return false;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(first);
      range.collapse(false);
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      globalThis.__ai7CooperativeEdit = {
        jobId: cancel.dataset.serviceJobId,
        first: { blockId: first.dataset.blockId, before: first.textContent },
        second: { blockId: second.dataset.blockId, before: second.textContent },
      };
      return document.activeElement === editor && selection.isCollapsed && first.contains(selection.anchorNode);
    })()`,
    'sustained-first-block-selection-ready',
  );
  await renderer.send('Input.insertText', { text: firstCooperativeEdit });
  await waitForChecks(
    renderer,
    `(() => {
      const state = globalThis.__ai7CooperativeEdit;
      const editor = document.querySelector('[data-testid="manuscript-editor"]');
      const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑');
      const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作');
      const blocks = Array.from(editor?.querySelectorAll(':scope > [data-block-id]') ?? []);
      const first = blocks.find((block) => block.getAttribute('data-block-id') === state?.first?.blockId);
      const second = blocks.find((block) => block.getAttribute('data-block-id') === state?.second?.blockId);
      return {
        rootPresent: editor instanceof HTMLElement,
        operationUnlocked: editor?.dataset.operationLocked === 'false',
        editorWritable: editor?.getAttribute('contenteditable') === 'true',
        ariaWritable: editor?.getAttribute('aria-readonly') === 'false',
        editorFocused: document.activeElement === editor,
        firstIdentity: first instanceof HTMLElement && first.dataset.blockId === state?.first?.blockId,
        firstText: first?.textContent === state?.first?.before + ${JSON.stringify(firstCooperativeEdit)},
        secondIdentity: second instanceof HTMLElement && second.dataset.blockId === state?.second?.blockId,
        secondTextUnchanged: second?.textContent === state?.second?.before,
        distinctBlocks: first instanceof HTMLElement && second instanceof HTMLElement && first !== second,
        dirty: save instanceof HTMLButtonElement && !save.disabled,
        sameRunningSearchJob: cancel instanceof HTMLButtonElement && !cancel.hidden && cancel.dataset.serviceJobId === state?.jobId && state?.jobId === globalThis.__ai7ServiceJobId,
        singleServiceJob: typeof state?.jobId === 'string' && document.querySelectorAll('button[data-service-job-id="' + state.jobId + '"]').length === 1,
      };
    })()`,
    'sustained-first-block-effect',
  );
  await assertRenderer(
    renderer,
    `(() => {
      const state = globalThis.__ai7CooperativeEdit;
      const editor = document.querySelector('[data-testid="manuscript-editor"]');
      const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑');
      const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作');
      const blocks = Array.from(editor?.querySelectorAll(':scope > [data-block-id]') ?? []);
      const first = blocks.find((block) => block.getAttribute('data-block-id') === state?.first?.blockId);
      const second = blocks.find((block) => block.getAttribute('data-block-id') === state?.second?.blockId);
      if (!(editor instanceof HTMLElement) || editor.dataset.operationLocked !== 'false' || editor.getAttribute('contenteditable') !== 'true' ||
          editor.getAttribute('aria-readonly') !== 'false' || !(save instanceof HTMLButtonElement) || save.disabled ||
          !(cancel instanceof HTMLButtonElement) || cancel.hidden || cancel.dataset.serviceJobId !== state?.jobId ||
          state?.jobId !== globalThis.__ai7ServiceJobId || typeof state?.jobId !== 'string' ||
          document.querySelectorAll('button[data-service-job-id="' + state.jobId + '"]').length !== 1 ||
          !(first instanceof HTMLElement) || first.textContent !== state?.first?.before + ${JSON.stringify(firstCooperativeEdit)} ||
          !(second instanceof HTMLElement) || second.textContent !== state?.second?.before || first === second) return false;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(second);
      range.collapse(false);
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      return document.activeElement === editor && selection.isCollapsed && second.contains(selection.anchorNode);
    })()`,
    'sustained-second-block-selection-ready',
  );
  await renderer.send('Input.insertText', { text: secondCooperativeEdit });
  await waitForChecks(
    renderer,
    `(() => {
      const state = globalThis.__ai7CooperativeEdit;
      const editor = document.querySelector('[data-testid="manuscript-editor"]');
      const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑');
      const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作');
      const blocks = Array.from(editor?.querySelectorAll(':scope > [data-block-id]') ?? []);
      const first = blocks.find((block) => block.getAttribute('data-block-id') === state?.first?.blockId);
      const second = blocks.find((block) => block.getAttribute('data-block-id') === state?.second?.blockId);
      return {
        rootPresent: editor instanceof HTMLElement,
        operationUnlocked: editor?.dataset.operationLocked === 'false',
        editorWritable: editor?.getAttribute('contenteditable') === 'true',
        ariaWritable: editor?.getAttribute('aria-readonly') === 'false',
        editorFocused: document.activeElement === editor,
        firstIdentity: first instanceof HTMLElement && first.dataset.blockId === state?.first?.blockId,
        firstText: first?.textContent === state?.first?.before + ${JSON.stringify(firstCooperativeEdit)},
        secondIdentity: second instanceof HTMLElement && second.dataset.blockId === state?.second?.blockId,
        secondText: second?.textContent === state?.second?.before + ${JSON.stringify(secondCooperativeEdit)},
        distinctBlocks: first instanceof HTMLElement && second instanceof HTMLElement && first !== second,
        dirty: save instanceof HTMLButtonElement && !save.disabled,
        sameRunningSearchJob: cancel instanceof HTMLButtonElement && !cancel.hidden && cancel.dataset.serviceJobId === state?.jobId && state?.jobId === globalThis.__ai7ServiceJobId,
        singleServiceJob: typeof state?.jobId === 'string' && document.querySelectorAll('button[data-service-job-id="' + state.jobId + '"]').length === 1,
      };
    })()`,
    'sustained-multiblock-edit-during-search',
  );
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑')?.disabled`, 'concurrent-edit-dirty');
  at('cooperative-journal-ack');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 3') && Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑')?.disabled`, 'automatic-serialized-durable-ack', 120_000);
  at('cooperative-cursor-continuity');
  await renderer.evaluate(`globalThis.__ai7AfterAckFirst = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId`);
  await clickButton(renderer, '向后浏览', 'fresh-cursor-after-ack');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId !== globalThis.__ai7AfterAckFirst`, 'fresh-cursor-after-ack-resolved');
  await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await clickButton(renderer, '向前浏览', 'fresh-return-cursor-after-ack');
  await waitFor(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); return editor?.firstElementChild?.getAttribute('data-block-id') === globalThis.__ai7AfterAckFirst && editor.getAttribute('contenteditable') === 'true' && editor.getAttribute('aria-readonly') === 'false'; })()`,
    'fresh-return-cursor-after-ack-resolved',
  );
  at('cooperative-search-close');
  await waitFor(renderer, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作')?.hidden`, 'stale-search-closed');

  at('authoritative-mutation-drain');
  const dirtyHistoryObservation = await renderer.observeIpc();
  await editThenInvokeOnDirty(renderer, '稳', ['保存当前编辑', '撤销'], 'dirty-saving-undo-start');
  await waitForChecks(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const journal = Array.from(document.querySelectorAll('.editor-meta [data-editor-technical]')).find((item) => item.textContent?.startsWith('修订日志序号 ')); const undo = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '撤销'); const retry = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '重试权威刷新'); return { journalSequence5: journal?.textContent === '修订日志序号 5', operationUnlocked: editor?.dataset.operationLocked === 'false', editorWritable: editor?.getAttribute('contenteditable') === 'true', ariaWritable: editor?.getAttribute('aria-readonly') === 'false', continuityResolved: editor instanceof HTMLElement && !editor.hasAttribute('tabindex'), authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', authoritativeStartCleared: undo instanceof HTMLButtonElement && !undo.disabled, recoveryNotRequired: retry instanceof HTMLButtonElement && retry.hidden }; })()`,
    'dirty-saving-undo-drained-and-unlocked',
    120_000,
  );
  const dirtyHistoryCompleted = await renderer.observeIpc();
  const dirtyHistoryEvents = dirtyHistoryCompleted.events.filter((event) => event.ordinal > (dirtyHistoryObservation.events.at(-1)?.ordinal ?? 0));
  const dirtyFlushInvoke = dirtyHistoryEvents.find((event) => event.operation === 'flushJournalEdit' && event.phase === 'invoke');
  const dirtyUndoInvoke = dirtyHistoryEvents.find((event) => event.operation === 'undoManuscript' && event.phase === 'invoke');
  requireJourney(
    (dirtyHistoryCompleted.counts.flushJournalEdit ?? 0) - (dirtyHistoryObservation.counts.flushJournalEdit ?? 0) === 1 &&
      (dirtyHistoryCompleted.counts.undoManuscript ?? 0) - (dirtyHistoryObservation.counts.undoManuscript ?? 0) === 1 &&
      dirtyFlushInvoke?.ordinal < dirtyUndoInvoke?.ordinal,
    'dirty-saving-authoritative-ipc-order',
  );
  const redoObservation = await renderer.observeIpc();
  await clickButton(renderer, '重做', 'dirty-history-redo');
  await waitForChecks(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const journal = Array.from(document.querySelectorAll('.editor-meta [data-editor-technical]')).find((item) => item.textContent?.startsWith('修订日志序号 ')); const searchInput = document.querySelector('#manuscript-search'); const search = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '查找全稿'); const retry = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '重试权威刷新'); return { journalSequence6: journal?.textContent === '修订日志序号 6', authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', operationUnlocked: editor?.dataset.operationLocked === 'false', editorWritable: editor?.getAttribute('contenteditable') === 'true', ariaWritable: editor?.getAttribute('aria-readonly') === 'false', searchInputReady: searchInput instanceof HTMLInputElement && !searchInput.disabled, searchStartReady: search instanceof HTMLButtonElement && !search.disabled, recoveryNotRequired: retry instanceof HTMLButtonElement && retry.hidden }; })()`,
    'dirty-history-redo-durable',
    120_000,
  );
  const redoCompleted = await renderer.observeIpc();
  requireJourney((redoCompleted.counts.redoManuscript ?? 0) - (redoObservation.counts.redoManuscript ?? 0) === 1, 'dirty-history-redo-actual-ipc');

  await fill(renderer, '#manuscript-search', '地', 'cancel-search-fill');
  await clickButton(renderer, '查找全稿', 'cancel-search-start');
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作')?.hidden`, 'cancel-search-running');
  const cancelTargetJobId = await renderer.evaluate(`(() => { const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作'); if (!cancel?.dataset.serviceJobId) return null; globalThis.__ai7CancelTargetJobId = cancel.dataset.serviceJobId; return cancel.dataset.serviceJobId; })()`);
  requireJourney(typeof cancelTargetJobId === 'string' && /^[0-9a-f-]{36}$/i.test(cancelTargetJobId), 'cancel-search-target-captured');
  await clickButton(renderer, '取消当前操作', 'cancel-search');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('已取消')`, 'cancel-business-readable');
  await assertRenderer(renderer, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作')?.dataset.cancellationTargetJobId === globalThis.__ai7CancelTargetJobId`, 'cancel-search-target-stable');
  const cancelObservation = await renderer.observeIpc();
  const cancelInvoke = cancelObservation.events.findLast((event) => event.operation === 'cancelServiceJob' && event.phase === 'invoke');
  const cancelResult = cancelObservation.events.findLast((event) => event.operation === 'cancelServiceJob' && event.phase === 'result');
  requireJourney(
    cancelInvoke?.jobId === cancelTargetJobId && cancelResult?.jobId === cancelTargetJobId &&
      cancelResult.kind === 'search' && cancelResult.state === 'cancelled',
    'cancel-search-exact-ipc-terminal',
  );
  // 已取消 is drawn from the cancel's own answer while the search's job is still the active one: 查找全稿 and the query
  // field stay disabled until that job's poll has read the terminal state and let go of it, which on a slow runner comes
  // after the next click (#665). The search says 查找已取消 only once it has let go.
  await waitForChecks(
    renderer,
    `(() => { const search = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '查找全稿'); const cancel = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作'); const input = document.querySelector('#manuscript-search'); return { searchSettledCancelled: document.querySelector('.search-section .field-note')?.textContent === '查找已取消；当前本地编辑不受影响。', cancelReleased: cancel instanceof HTMLButtonElement && cancel.hidden && cancel.dataset.serviceJobId === '', searchInputReady: input instanceof HTMLInputElement && !input.disabled, searchStartReady: search instanceof HTMLButtonElement && !search.disabled }; })()`,
    'cancel-search-settled',
    30_000,
  );

  await fill(renderer, '#manuscript-search', OVERLAP_QUERY, 'overlap-search-fill');
  await clickButton(renderer, '查找全稿', 'overlap-search-start');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 1 处')`, 'overlap-leftmost-nonoverlap', 120_000);
  await fill(renderer, '#manuscript-replacement', '界', 'dismiss-preview-fill');
  await clickButton(renderer, '预览替换', 'dismiss-preview-start');
  await waitFor(renderer, `!document.querySelector('.replacement-review')?.hidden && document.querySelector('.search-results')?.dataset.inclusionLocked === 'true'`, 'dismiss-preview-reviewing');
  await clickButton(renderer, '取消并关闭替换预览', 'dismiss-preview');
  await waitFor(renderer, `document.querySelector('.replacement-review')?.hidden && document.querySelector('.search-results')?.dataset.inclusionLocked === 'false' && document.querySelector('#persistence-status')?.textContent.includes('稿件未发生替换')`, 'dismiss-preview-reclaimed');

  at('bounded-exclusions');
  await fill(renderer, '#manuscript-search', EXCLUSION_TEXT, 'exclusion-search-fill');
  await clickButton(renderer, '查找全稿', 'exclusion-search-start');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 ${EXPECTED_EXCLUSION_MATCHES.toLocaleString('zh-CN')} 处')`, 'exclusion-search-ready', 120_000);
  let excludedCount = 0;
  while (excludedCount < 1_000) {
    const pageTake = Math.min(24, 1_000 - excludedCount);
    await assertRenderer(
      renderer,
      `(() => { const controls = Array.from(document.querySelectorAll('.match-inclusion input[type="checkbox"]')); if (controls.length < ${pageTake}) return false; for (const control of controls.slice(0, ${pageTake})) { if (!control.checked) return false; control.click(); } return controls.slice(0, ${pageTake}).every((control) => !control.checked); })()`,
      `exclusion-select-${excludedCount}`,
    );
    excludedCount += pageTake;
    if (excludedCount < 1_000) {
      await renderer.evaluate(`globalThis.__ai7ExclusionPageFirst = document.querySelector('.match-inclusion input')?.dataset.matchId`);
      await clickButton(renderer, '下一组结果', `exclusion-next-${excludedCount}`);
      await waitFor(renderer, `document.querySelector('.match-inclusion input')?.dataset.matchId !== globalThis.__ai7ExclusionPageFirst`, `exclusion-next-ready-${excludedCount}`);
    }
  }
  await assertRenderer(
    renderer,
    `(() => { const controls = Array.from(document.querySelectorAll('.match-inclusion input[type="checkbox"]')); const remaining = controls.find((control) => control.checked); if (!remaining) return false; remaining.click(); return remaining.checked && document.querySelector('.replacement-exclusion-summary')?.dataset.excludedCount === '1000' && document.querySelector('.replacement-exclusion-summary')?.textContent.includes('至少保留 1 处') && controls.length <= 24; })()`,
    'exclusion-cap-and-retain-one',
  );
  await fill(renderer, '#manuscript-replacement', '边界保留校验', 'exclusion-replacement-fill');
  await clickButton(renderer, '预览替换', 'exclusion-preview');
  await waitFor(renderer, `!document.querySelector('.replacement-review')?.hidden && document.querySelector('.replacement-review')?.textContent.includes('纳入 1 处') && document.querySelector('.replacement-review')?.textContent.includes('排除 1000 处')`, 'exclusion-preview-exact', 120_000);
  await clickButton(renderer, '取消并关闭替换预览', 'exclusion-preview-dismiss');
  await waitFor(renderer, `document.querySelector('.replacement-review')?.hidden`, 'exclusion-preview-dismissed');

  at('search-replace');
  await fill(renderer, '#manuscript-search', SEARCH_TEXT, 'search-fill');
  await clickButton(renderer, '查找全稿', 'search-start');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 ${EXPECTED_MATCHES} 处')`, 'search-results', 120_000);
  await assertRenderer(renderer, `document.querySelectorAll('.search-result').length === 24 && !Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '下一组结果')?.hidden`, 'search-virtualized');
  await assertRenderer(renderer, `(() => { const encoded = (value) => new TextEncoder().encode(JSON.stringify(value)).length; const rows = Array.from(document.querySelectorAll('.search-result')); const ids = rows.map((row) => row.querySelector('input')?.dataset.matchId); return rows.length === 24 && new Set(ids).size === ids.length && rows.every((row) => { const heading = row.querySelector('.field-note')?.textContent ?? ''; const context = row.querySelector('button')?.textContent ?? ''; return encoded(heading) <= 2048 && encoded(context) <= 2048; }); })()`, 'search-display-frame-bounded-and-identities-unique');
  await assertRenderer(renderer, `(() => { const surface = document.querySelector('.editor-window'); const blocks = Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')); const block = blocks[5]; const text = block?.firstChild; if (!(surface instanceof HTMLElement) || !(block instanceof HTMLElement) || !(text instanceof Text) || text.length < 5) return false; block.scrollIntoView({ block: 'center' }); const containerTop = surface.getBoundingClientRect().top; const visible = blocks.find((candidate) => candidate.getBoundingClientRect().bottom >= containerTop); const selection = window.getSelection(); selection.setBaseAndExtent(text, 4, text, 1); globalThis.__ai7SearchReturn = { meta: document.querySelector('.editor-meta')?.textContent, blockId: block.dataset.blockId, text: selection.toString(), anchor: 4, head: 1, scrollBlockId: visible?.dataset.blockId, scrollOffset: visible?.getBoundingClientRect().top - containerTop }; return true; })()`, 'search-return-prepare');
  await assertRenderer(renderer, `(() => { const open = document.querySelector('.search-result button'); if (!open) return false; open.click(); return true; })()`, 'search-jump');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent !== globalThis.__ai7SearchReturn.meta`, 'search-jump-resolved');
  await waitFor(renderer, `window.getSelection()?.toString() === ${JSON.stringify(SEARCH_TEXT)}`, 'search-exact-range');
  await clickButton(renderer, '返回查找前位置', 'search-return');
  await waitFor(renderer, `(() => { const expected = globalThis.__ai7SearchReturn; const selection = window.getSelection(); const surface = document.querySelector('.editor-window'); const scrollBlock = document.querySelector('[data-block-id="' + expected.scrollBlockId + '"]'); return document.querySelector('.editor-meta')?.textContent === expected.meta && selection?.anchorNode?.parentElement?.closest('[data-block-id]')?.dataset.blockId === expected.blockId && selection.anchorOffset === expected.anchor && selection.focusOffset === expected.head && selection.toString() === expected.text && surface instanceof HTMLElement && scrollBlock instanceof HTMLElement && Math.abs((scrollBlock.getBoundingClientRect().top - surface.getBoundingClientRect().top) - expected.scrollOffset) <= 3; })()`, 'search-return-exact-selection-scroll');
  await clickButton(renderer, '下一组结果', 'search-next');
  await waitFor(renderer, `document.querySelectorAll('.search-result').length === 1`, 'search-next-results');
  await clickButton(renderer, '上一组结果', 'search-previous');
  await waitFor(renderer, `document.querySelectorAll('.search-result').length === 24`, 'search-previous-results');
  await assertRenderer(renderer, `(() => { const result = document.querySelector('.search-result'); const include = result?.querySelector('input[type="checkbox"]'); const context = result?.querySelector('button')?.textContent; if (!include || !context || !include.dataset.matchId) return false; globalThis.__ai7ExcludedContext = context; globalThis.__ai7ExcludedMatchId = include.dataset.matchId; include.click(); return !include.checked; })()`, 'replacement-exclusion');
  await fill(renderer, '#manuscript-replacement', REPLACEMENT_TEXT, 'replacement-fill');
  await clickButton(renderer, '预览替换', 'replacement-preview');
  await waitFor(renderer, `!document.querySelector('.replacement-review')?.hidden && document.querySelector('.replacement-review')?.textContent.includes('纳入 24 处') && document.querySelector('.replacement-review')?.textContent.includes('排除 1 处') && document.querySelector('.replacement-review')?.textContent.includes(globalThis.__ai7ExcludedMatchId) && !document.querySelector('.replacement-review ul')?.textContent.includes(globalThis.__ai7ExcludedContext) && document.querySelector('.replacement-review')?.textContent.includes('绑定修订版 r1') && document.querySelector('.replacement-review')?.textContent.includes('重叠时保留最早匹配')`, 'replacement-preview-exact-inclusion');
  await clickButton(renderer, '冻结并重新验证', 'replacement-freeze');
  await waitFor(renderer, `document.querySelector('.replacement-review')?.textContent.includes('已冻结替换集') && document.querySelector('.replacement-review')?.textContent.includes('纳入 24 处') && document.querySelector('.replacement-review')?.textContent.includes('排除 1 处') && !document.querySelector('.replacement-review')?.textContent.includes(globalThis.__ai7ExcludedContext)`, 'replacement-frozen-included-contexts');
  await assertRenderer(renderer, `(() => { const controls = Array.from(document.querySelectorAll('.match-inclusion input[type="checkbox"]')); const before = controls.map((control) => control.checked); controls[0]?.click(); return document.querySelector('.search-results')?.dataset.inclusionLocked === 'true' && controls.length === 24 && controls.every((control, index) => control.disabled && control.checked === before[index]) && document.querySelector('.replacement-review')?.textContent.includes('匹配集已冻结；纳入控件保持锁定'); })()`, 'replacement-frozen-visible-inclusion-lock');
  await clickButton(renderer, '原子提交替换', 'replacement-commit');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')?.dataset.operationLocked === 'true' && document.querySelector('[data-testid="manuscript-editor"]')?.getAttribute('contenteditable') === 'false'`, 'replacement-editor-locked');
  await assertRenderer(renderer, `(() => { const block = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]'); if (!block) return false; const before = block.textContent; block.focus(); document.execCommand('insertText', false, '竞态'); return block.textContent === before; })()`, 'replacement-typing-blocked');
  await waitFor(renderer, `document.querySelector('#persistence-status')?.textContent.includes('已原子替换 24 处')`, 'replacement-atomic', 120_000);
  await assertRenderer(renderer, `document.querySelector('[data-testid="manuscript-editor"]')?.dataset.operationLocked === 'false' && document.querySelector('[data-testid="manuscript-editor"]')?.getAttribute('contenteditable') === 'true'`, 'replacement-editor-unlocked-after-refresh');
  await assertRenderer(renderer, `document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 7')`, 'replacement-journal');

  await fill(renderer, '#manuscript-search', REPLACEMENT_TEXT, 'milestone-stale-search-fill');
  await clickButton(renderer, '查找全稿', 'milestone-stale-search-start');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 24 处')`, 'milestone-stale-search-ready', 120_000);
  await assertRenderer(renderer, `(() => { const row = document.querySelector('.search-result'); const include = row?.querySelector('input[type="checkbox"]'); const open = row?.querySelector('button'); if (!include || !open) return false; include.click(); open.click(); return !include.checked; })()`, 'milestone-stale-search-state');
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '返回查找前位置')?.hidden`, 'milestone-stale-return-visible');
  await waitFor(renderer, `window.getSelection()?.toString() === ${JSON.stringify(REPLACEMENT_TEXT)}`, 'milestone-stale-search-jump');
  await fill(renderer, '#manuscript-replacement', '临时预览', 'milestone-stale-preview-fill');
  await clickButton(renderer, '预览替换', 'milestone-stale-preview-start');
  await waitFor(renderer, `!document.querySelector('.replacement-review')?.hidden && document.querySelector('.search-results')?.dataset.inclusionLocked === 'true'`, 'milestone-stale-preview-ready');

  at('milestone-form');
  await assertRenderer(renderer, `(() => { const menu = document.querySelector('#context-actions details[data-save-menu="manuscript"]'); const details = menu?.querySelector('.milestone-section'); const status = document.querySelector('#persistence-status'); if (!(menu instanceof HTMLDetailsElement) || !(details instanceof HTMLDetailsElement) || status?.getAttribute('role') !== 'button' || document.querySelector('#manuscript-navigation-panel .milestone-section') || !menu.querySelector('summary')?.textContent.startsWith('已写入修订日志')) return false; status.click(); details.open = true; return menu.open && details.open; })()`, 'milestone-open');
  await fill(renderer, '#milestone-label', '结构复核完成', 'milestone-label');
  // Synchronized delta with Issue #414: a purpose is chosen from the cards, not typed.
  await choosePurpose(renderer, 'stage-archive', 'milestone-purpose');
  await fill(renderer, '#milestone-note', '本地里程碑，不表示导出或发布。', 'milestone-note');
  at('milestone-save-dispatch');
  const milestoneDrainObservation = await renderer.observeIpc();
  await editThenInvokeOnDirty(renderer, '碑', ['保存里程碑版本'], 'dirty-milestone-save');
  try {
    at('milestone-r2-resolution');
    await waitFor(
      renderer,
      `document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r2')`,
      'milestone-r2',
      MILESTONE_RECOVERY_SNAPSHOT_TIMEOUT,
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'J-02/milestone-r2') throw error;
    const ipcCategory = await milestoneIpcTimeoutCategory(renderer, milestoneDrainObservation);
    const objectCategory = await milestoneObjectTimeoutCategory(dataRoot);
    // Both categories are closed literals; expose no IPC payload, file name or manuscript text.
    at(`milestone-r2-${ipcCategory}-${objectCategory}`);
    throw journeyCheckFailure('J-02', `milestone-r2-${ipcCategory}-${objectCategory}`);
  }
  at('milestone-save-ipc-order');
  const milestoneDrainCompleted = await renderer.observeIpc();
  const milestoneDrainEvents = milestoneDrainCompleted.events.filter((event) => event.ordinal > (milestoneDrainObservation.events.at(-1)?.ordinal ?? 0));
  const milestoneFlushInvoke = milestoneDrainEvents.find((event) => event.operation === 'flushJournalEdit' && event.phase === 'invoke');
  const milestoneSaveInvoke = milestoneDrainEvents.find((event) => event.operation === 'saveMilestone' && event.phase === 'invoke');
  requireJourney(
    (milestoneDrainCompleted.counts.flushJournalEdit ?? 0) - (milestoneDrainObservation.counts.flushJournalEdit ?? 0) === 1 &&
      (milestoneDrainCompleted.counts.saveMilestone ?? 0) - (milestoneDrainObservation.counts.saveMilestone ?? 0) === 1 &&
      milestoneFlushInvoke?.ordinal < milestoneSaveInvoke?.ordinal,
    'dirty-milestone-authoritative-ipc-order',
  );
  at('milestone-search-state-stale');
  // Synchronized delta with Issue #1177 (ADR 0096 §3): the result set is marked stale, not discarded — its rows stay, read as
  // past, with every jump and inclusion control disabled until 查找全稿 runs again; the preview and the way back are gone.
  await waitFor(renderer, `(() => { const results = document.querySelector('.search-results'); const rows = Array.from(results?.querySelectorAll('.search-result') ?? []); return rows.length > 0 && results.dataset.searchStale === 'true' && results.dataset.inclusionLocked === 'true' && rows.every((row) => Array.from(row.querySelectorAll('button, input')).every((control) => control.disabled)) && document.querySelector('.replacement-review')?.hidden && Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '返回查找前位置')?.hidden && Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '预览替换')?.disabled && document.querySelector('.search-section .field-note')?.textContent.startsWith('稿件已变化；以下结果已过时，请重新查找。') && document.querySelector('.search-section .field-note')?.textContent.includes('稿件修订版已变化'); })()`, 'milestone-revision-stales-all-search-state');
  at('milestone-authoritative-ready');
  await waitForChecks(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const undo = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '撤销'); return { authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', operationUnlocked: editor?.dataset.operationLocked === 'false', undoReady: undo instanceof HTMLButtonElement && !undo.disabled }; })()`,
    'milestone-authoritative-ready',
  );
  at('milestone-undo-drain');
  await clickButton(renderer, '撤销', 'undo');
  await waitForChecks(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const journal = Array.from(document.querySelectorAll('.editor-meta [data-editor-technical]')).find((item) => item.textContent?.startsWith('修订日志序号 ')); const retry = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '重试权威刷新'); return { journalSequence9: journal?.textContent === '修订日志序号 9', authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', operationUnlocked: editor?.dataset.operationLocked === 'false', editorWritable: editor?.getAttribute('contenteditable') === 'true', ariaWritable: editor?.getAttribute('aria-readonly') === 'false', recoveryNotRequired: retry instanceof HTMLButtonElement && retry.hidden, closeRiskCleared: document.documentElement.dataset.ai7CloseRisk === 'false' }; })()`,
    'undo-drained-before-close',
    120_000,
  );
  at('milestone-close-risk-stable');
  await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await assertRenderer(renderer, `document.documentElement.dataset.ai7CloseRisk === 'false'`, 'undo-close-risk-stable');
}

async function runRestartJourney(renderer) {
  at('restart-reopen');
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]') && document.querySelector('.recent-work-item')`, 'prior-work');
  await assertRenderer(renderer, `document.querySelector('.recent-work-item')?.textContent.includes('10,000,303 字符') && document.querySelector('.recent-work-item')?.textContent.includes('结构复核完成')`, 'prior-work-exact');
  await assertRenderer(renderer, `(() => { const open = document.querySelector('.recent-work-item button'); if (!open) return false; open.click(); return true; })()`, 'prior-work-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r2')`, 'reopened-r2');
  // A Book with a primary Manuscript is entered at 稿件, which the sidebar marks under the Book's 工作 (RET-002).
  await assertRenderer(renderer, sidebarBookCurrent(null, 'manuscript'), 'reopened-sidebar-manuscript');
  await assertRenderer(renderer, `document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32`, 'restart-window-bounded');
  await clickButton(renderer, '重做', 'restart-redo');
  await waitForChecks(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const journal = Array.from(document.querySelectorAll('.editor-meta [data-editor-technical]')).find((item) => item.textContent?.startsWith('修订日志序号 ')); const searchInput = document.querySelector('#manuscript-search'); const search = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '查找全稿'); const retry = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '重试权威刷新'); return { journalSequence10: journal?.textContent === '修订日志序号 10', authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', operationUnlocked: editor?.dataset.operationLocked === 'false', editorWritable: editor?.getAttribute('contenteditable') === 'true', ariaWritable: editor?.getAttribute('aria-readonly') === 'false', searchInputReady: searchInput instanceof HTMLInputElement && !searchInput.disabled, searchStartReady: search instanceof HTMLButtonElement && !search.disabled, recoveryNotRequired: retry instanceof HTMLButtonElement && retry.hidden }; })()`,
    'restart-redo-durable',
    120_000,
  );
  await fill(renderer, '#manuscript-search', REPLACEMENT_TEXT, 'redo-search-fill');
  await clickButton(renderer, '查找全稿', 'redo-search');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 24 处')`, 'redo-state-exact', 120_000);
}

/** Issue #1127: after the durable r2 checkpoint and all fixed sequence assertions. */
async function runScreenLifecycleJourney(renderer) {
  at('screen-lifecycle-place');
  // `assertRenderer` reads its expression synchronously and would pass an async one unawaited, so the async steps here go
  // through `renderer.evaluate`; the place the screen is left from is held by the runner, not by the page it leaves.
  const place = await renderer.evaluate(`(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const editor = document.querySelector('[data-testid="manuscript-editor"]');
    const block = editor?.children[16];
    const text = block?.firstChild;
    const selection = window.getSelection();
    if (!(editor instanceof HTMLElement) || !(block instanceof HTMLElement) || !(text instanceof Text) || text.length < 4 || !selection) return null;
    editor.focus({ preventScroll: true });
    block.scrollIntoView({ block: 'center' });
    // Existing workbench entry opens the remembered block at its start; no selected-range restoration is introduced.
    selection.setBaseAndExtent(text, 0, text, 0);
    if (!selection.isCollapsed || selection.anchorNode !== text || selection.anchorOffset !== 0) return null;
    return { bookId: document.querySelector('.editor-shell')?.dataset.bookId ?? null, blockId: block.dataset.blockId ?? null, grapheme: 0, before: block.textContent };
  })()`);
  requireJourney(typeof place?.bookId === 'string' && typeof place.blockId === 'string' && typeof place.before === 'string', 'screen-lifecycle-place');
  const journalBefore = await renderer.evaluate(JOURNAL_SEQUENCE_PROBE);
  requireJourney(Number.isSafeInteger(journalBefore), 'screen-lifecycle-journal-before');
  at('screen-lifecycle-leave');
  await assertRenderer(renderer, sidebarNavigate(SIDEBAR.section('overview')), 'screen-lifecycle-leave');
  await waitForChecks(renderer, `(() => {
    const status = document.querySelector('#persistence-status');
    return { overview: document.querySelector('#screen')?.dataset.screen === 'book-overview', editorGone: document.querySelector('[data-testid="manuscript-editor"]') === null,
      modesGone: document.querySelector('#context-view [data-view-command]') === null, protectionGone: document.querySelector('#editing-protection') === null,
      saveMenuGone: document.querySelector('#manuscript-save-menu') === null, statusRole: status?.getAttribute('role') === 'status',
      statusNoActivation: !status?.hasAttribute('tabindex') && !status?.hasAttribute('aria-controls') && !status?.hasAttribute('aria-expanded') };
  })()`, 'screen-lifecycle-departed');
  requireJourney(await renderer.evaluate(`(async () => { const overview = await window.ai7.getBookOverview({ bookId: ${JSON.stringify(place.bookId)}, historyCursor: null }); return overview.manuscriptAnchor?.entry?.blockId === ${JSON.stringify(place.blockId)} && overview.manuscriptAnchor.entry.grapheme === ${place.grapheme}; })()`) === true, 'screen-lifecycle-remembered-entry');
  at('screen-lifecycle-reopen');
  await assertRenderer(renderer, sidebarNavigate(SIDEBAR.section('manuscript')), 'screen-lifecycle-reopen');
  await waitForChecks(renderer, `(() => {
    const selection = window.getSelection();
    const block = selection?.anchorNode?.parentElement?.closest('[data-block-id]');
    return { editorOnce: document.querySelectorAll('[data-testid="manuscript-editor"]').length === 1, modesOnce: document.querySelectorAll('#context-view [data-view-command="focus-mode"]').length === 1 && document.querySelectorAll('#context-view [data-view-command="menu"]').length === 1,
      protectionOnce: document.querySelectorAll('#editing-protection').length === 1, saveMenuOnce: document.querySelectorAll('#manuscript-save-menu').length === 1,
      rememberedBlock: block?.dataset.blockId === ${JSON.stringify(place.blockId)}, rememberedCaret: selection?.isCollapsed === true && selection.anchorOffset === ${place.grapheme},
      journalUnchanged: ${JOURNAL_SEQUENCE_PROBE} === ${journalBefore}, navigationClosed: document.querySelector('[data-edge-entry="navigation"]')?.getAttribute('aria-expanded') === 'false', statusButton: document.querySelector('#persistence-status')?.getAttribute('role') === 'button' };
  })()`, 'screen-lifecycle-reopened');
  await assertRenderer(renderer, sidebarBookCurrent(null, 'manuscript'), 'screen-lifecycle-current-manuscript');
  await assertRenderer(renderer, `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const block = Array.from(editor?.children ?? []).find((item) => item.getAttribute('data-block-id') === ${JSON.stringify(place.blockId)}); const text = block?.firstChild; const selection = window.getSelection(); if (!(text instanceof Text) || text.length < 3 || !selection || !(editor instanceof HTMLElement)) return false; editor.focus({ preventScroll: true }); selection.setBaseAndExtent(text, 1, text, 3); if (selection.toString().length !== 2) return false; selection.collapse(text, ${place.grapheme}); return selection.isCollapsed; })()`, 'screen-lifecycle-selection-usable');
  at('screen-lifecycle-one-edit');
  const beforeEdit = await renderer.observeIpc();
  await renderer.send('Input.insertText', { text: '续' });
  await waitForChecks(renderer, `(() => { const block = Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')).find((item) => item.getAttribute('data-block-id') === ${JSON.stringify(place.blockId)}); const save = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '保存当前编辑'); return { oneEntry: ${JOURNAL_SEQUENCE_PROBE} === ${journalBefore + 1}, exactEdit: block?.textContent === ${JSON.stringify(place.before.slice(0, place.grapheme) + '续' + place.before.slice(place.grapheme))}, saved: save instanceof HTMLButtonElement && save.disabled, closeRiskClear: document.documentElement.dataset.ai7CloseRisk === 'false' }; })()`, 'screen-lifecycle-one-durable-edit', 120_000);
  const afterEdit = await renderer.observeIpc();
  requireJourney((afterEdit.counts.flushJournalEdit ?? 0) - (beforeEdit.counts.flushJournalEdit ?? 0) === 1, 'screen-lifecycle-one-flush');
}

async function runAccessibilityJourney(renderer) {
  // One `at()` per step: the hosted marker names only `at()` stages, and a stage that holds eight
  // assertions behind one name cannot say which of them a hosted runner failed (#474).
  const modifier = process.platform === 'darwin' ? 4 : 2;
  at('j14-composition-focus');
  await assertRenderer(renderer, `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); if (!(editor instanceof HTMLElement)) return false; editor.focus({ preventScroll: true }); return document.activeElement === editor; })()`, 'composition-focus');
  at('j14-ime-command-guard');
  await renderer.send('Input.imeSetComposition', { text: '编', selectionStart: 1, selectionEnd: 1, replacementStart: 0, replacementEnd: 0 });
  // The guard can only be judged against a composition that exists, so what the composition did is
  // read before the key is pressed, and a failure names the precondition that was missing (#474).
  const composed = await renderer.evaluate(`(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); return { windowFocused: document.hasFocus(), editorFocused: document.activeElement === editor, composed: editor?.textContent.includes('编') === true }; })()`);
  await press(renderer, 'f', modifier);
  const guarded = await renderer.evaluate(`({ commandRan: document.activeElement?.id === 'manuscript-search', status: document.querySelector('#persistence-status')?.textContent.includes('输入法组合尚未结束') === true })`);
  if (guarded?.commandRan !== false || guarded?.status !== true) {
    if (composed?.windowFocused !== true) at('j14-ime-command-guard-window-unfocused');
    else if (composed?.editorFocused !== true) at('j14-ime-command-guard-editor-unfocused');
    else if (composed?.composed !== true) at('j14-ime-command-guard-composition-absent');
    else if (guarded?.commandRan === true) at('j14-ime-command-guard-command-ran');
    else at('j14-ime-command-guard-status-missing');
    requireJourney(false, 'ime-command-guard', { composed, guarded });
  }
  at('j14-keyboard-search-focus');
  await renderer.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0, replacementStart: 0, replacementEnd: 1 });
  // ⌘F is pressed only once its precondition holds: the composition the step before left open has ended in the editor, the
  // window has focus and focus is still in the text. #579 suspected a key that reached the renderer before the composition's
  // end, which the guard just proven refuses; the wait rules that out rather than assuming it. A failure names the
  // precondition that was missing, or what this key press did instead (#474's pattern).
  const readiness = `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); return { compositionEnded: editor?.dataset.composing === 'false', windowFocused: document.hasFocus(), editorFocused: document.activeElement === editor }; })()`;
  let ready = null;
  const readyBy = Date.now() + 10_000;
  while (Date.now() < readyBy) {
    ready = await renderer.evaluate(readiness);
    if (ready?.compositionEnded === true && ready.windowFocused === true && ready.editorFocused === true) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  if (ready?.compositionEnded !== true || ready.windowFocused !== true || ready.editorFocused !== true) {
    if (ready?.compositionEnded !== true) at('j14-keyboard-search-focus-composition-open');
    else if (ready.windowFocused !== true) at('j14-keyboard-search-focus-window-unfocused');
    else at('j14-keyboard-search-focus-editor-unfocused');
    requireJourney(false, 'keyboard-search-focus-precondition', { ready });
  }
  // What this one press did is recorded as it happens: whether its keydown reached the page, with which modifiers and in
  // what composition state, and whether the guard announced a refusal after it. The status line still holds the refusal
  // the step before proved, so its words alone cannot say what this press did; setStatus replaces the line's text, so an
  // observer sees a refusal even in the same words.
  await renderer.evaluate(`(() => { const status = document.querySelector('#persistence-status'); const editor = document.querySelector('[data-testid="manuscript-editor"]'); const probe = { keydown: null, guardAnnounced: false }; const onKeydown = (event) => { if (probe.keydown === null && event.key.toLowerCase() === 'f') probe.keydown = { isComposing: event.isComposing, composing: editor?.dataset.composing ?? null, metaKey: event.metaKey, ctrlKey: event.ctrlKey }; }; const observer = new MutationObserver(() => { if (status?.textContent.includes('输入法组合尚未结束')) probe.guardAnnounced = true; }); if (status) observer.observe(status, { childList: true, characterData: true, subtree: true }); window.addEventListener('keydown', onKeydown, true); probe.stop = () => { observer.disconnect(); window.removeEventListener('keydown', onKeydown, true); }; globalThis.__ai7SearchKeyProbe = probe; return true; })()`);
  await press(renderer, 'f', modifier);
  let moved = false;
  const movedBy = Date.now() + 60_000;
  while (Date.now() < movedBy && !moved) {
    moved = await renderer.evaluate(`document.activeElement?.id === 'manuscript-search'`) === true;
    if (!moved) await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const after = await renderer.evaluate(`(() => { const probe = globalThis.__ai7SearchKeyProbe; probe?.stop(); return { keydown: probe?.keydown ?? null, guardAnnounced: probe?.guardAnnounced === true, active: document.activeElement?.id || document.activeElement?.tagName || null }; })()`);
  if (!moved) {
    // The hosted marker names only the location (#591): whether the keydown reached the page, and with the platform's
    // modifier, is told apart here rather than in the detail only a local debug run writes.
    const platformModifier = modifier === 4 ? 'metaKey' : 'ctrlKey';
    if (after?.guardAnnounced === true) at('j14-keyboard-search-focus-guard-announced');
    else if ((after?.keydown ?? null) === null) at('j14-keyboard-search-focus-key-not-received');
    else if (after.keydown[platformModifier] !== true) at('j14-keyboard-search-focus-modifier-missing');
    else at('j14-keyboard-search-focus-no-focus-move');
    requireJourney(false, 'keyboard-search-focus', { ready, after });
  }
  at('j14-visible-focus');
  await assertRenderer(renderer, `(() => { const input = document.querySelector('#manuscript-search'); return input?.matches(':focus-visible') && getComputedStyle(input).outlineStyle !== 'none'; })()`, 'visible-focus');
  at('j14-keyboard-focus-keeps-window');
  // Focus that enters the text makes the browser reveal the caret. With the pane scrolled away from a
  // caret that stands at the window's start — every manuscript reopened after a restart — the reveal
  // rests the pane at its top, and that is not the reader asking for the window before (#485). The pane
  // is put between its edges the way a reader scrolls it, and the stop before the text takes focus
  // without moving anything, so the one Tab below is the only thing that can move the pane. The document's
  // selection is cleared first: a selection the steps before left inside the text is restored on focus
  // without a reveal, and where they leave it varies from run to run, which left this step with nothing
  // to prove (#493). The editor keeps a selection of its own, too, and writes it back into the page when it
  // takes focus whatever the page's selection says, so one left mid-text by the steps before could still
  // meet the focus there (#619). The caret is therefore put at the window's start through the editor itself
  // first: the text takes focus without scrolling, the page's caret is set at its start, and the editor
  // reads it as it reads a caret the reader places. ProseMirror treats a DOM caret at the start within 200 ms
  // of focus as a browser reset and restores its old selection, so wait past that pinned guard first. Blur,
  // clear and refocus then prove that the editor itself restores the start before the Tab being tested.
  const windowProbe = `(() => { const pane = document.querySelector('.editor-window'); const editor = document.querySelector('[data-testid="manuscript-editor"]'); return { top: Math.round(pane.scrollTop), first: editor?.firstElementChild?.dataset.blockId ?? null, position: Number(document.querySelector('#manuscript-position')?.value), inText: document.activeElement === editor }; })()`;
  const stopBeforeText = await renderer.evaluate(`(async () => { const pane = document.querySelector('.editor-window'); const editor = document.querySelector('[data-testid="manuscript-editor"]'); const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); editor.focus({ preventScroll: true }); await new Promise((resolve) => setTimeout(resolve, 250)); const start = document.createRange(); start.setStart(document.createTreeWalker(editor, NodeFilter.SHOW_TEXT).nextNode() ?? editor, 0); start.collapse(true); document.getSelection().removeAllRanges(); document.getSelection().addRange(start); await frames(); editor.blur(); document.getSelection().removeAllRanges(); editor.focus({ preventScroll: true }); await frames(); const restored = document.getSelection(); const before = document.createRange(); before.setStart(editor, 0); if (!restored?.isCollapsed || !editor.contains(restored.anchorNode)) return { caretAtStart: false }; before.setEnd(restored.anchorNode, restored.anchorOffset); if (before.toString().length !== 0) return { caretAtStart: false }; document.getSelection().removeAllRanges(); await frames(); pane.scrollTop = Math.floor((pane.scrollHeight - pane.clientHeight) / 2); await frames(); const stops = Array.from(document.querySelectorAll('button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]')).filter((stop) => stop === editor || (!stop.disabled && stop.tabIndex >= 0 && stop.offsetParent !== null)); const index = stops.indexOf(editor); for (let before = index - 1; before >= 0; before -= 1) { stops[before].focus({ preventScroll: true }); if (document.activeElement === stops[before]) return true; } return { index, stops: stops.length }; })()`);
  const beforeFocus = await renderer.evaluate(windowProbe);
  if (stopBeforeText !== true || !(beforeFocus?.top > 0) || !(beforeFocus?.position > 0) || beforeFocus.inText !== false) {
    at('j14-keyboard-focus-keeps-window-precondition');
    requireJourney(false, 'keyboard-focus-precondition', { stopBeforeText, beforeFocus });
  }
  // Every scroll of the pane from here on is recorded, so a reveal the pane took back is told from none (#604).
  await renderer.evaluate(`(() => { const pane = document.querySelector('.editor-window'); const probe = { tops: [] }; const onScroll = () => probe.tops.push(Math.round(pane.scrollTop)); pane.addEventListener('scroll', onScroll); probe.stop = () => pane.removeEventListener('scroll', onScroll); globalThis.__ai7RevealProbe = probe; return true; })()`);
  // Tab walks forward from that stop until it enters the text; no stop on the way is inside the pane,
  // so the pane stays where it was put until the focus that is under test arrives.
  const walked = [];
  let entered = null;
  for (let tabs = 0; tabs < 12; tabs += 1) {
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const stop = await renderer.evaluate(`(() => { const active = document.activeElement; const editor = document.querySelector('[data-testid="manuscript-editor"]'); return active === editor ? 'TEXT' : (active?.id || active?.className || active?.tagName || 'none') + ':' + (active?.textContent ?? '').slice(0, 12) + '@' + Math.round(document.querySelector('.editor-window').scrollTop); })()`);
    walked.push(stop);
    if (stop === 'TEXT') {
      // What the focus found as it entered the text (#604): whether the window had focus, and where the caret stood —
      // at the text's start, as the cleared selection leaves it, or elsewhere, as #493's restored selection did.
      entered = await renderer.evaluate(`(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const selection = document.getSelection(); let caret = 'none'; if (selection && selection.rangeCount > 0) { if (!editor.contains(selection.anchorNode)) caret = 'outside'; else { const before = document.createRange(); before.setStart(editor, 0); before.setEnd(selection.anchorNode, selection.anchorOffset); caret = before.toString().length === 0 ? 'at-start' : 'elsewhere'; } } return { hasFocus: document.hasFocus(), caret }; })()`);
      break;
    }
  }
  if (localDebugEnabled()) recordDebugDetail('J-02', `tab walk ${JSON.stringify(walked)}`);
  if (walked.at(-1) !== 'TEXT') {
    at('j14-keyboard-focus-keeps-window-precondition');
    requireJourney(false, 'keyboard-focus-in-text', { walked });
  }
  // A window paged away arrives a few frames after the scroll that asked for it; this wait is long
  // enough for it to show on the slowest hosted runner.
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
  const afterFocus = await renderer.evaluate(windowProbe);
  const scrolled = await renderer.evaluate(`(() => { const probe = globalThis.__ai7RevealProbe; probe?.stop(); globalThis.__ai7RevealProbe = undefined; return probe?.tops ?? []; })()`);
  if (afterFocus?.first !== beforeFocus.first || afterFocus?.position !== beforeFocus.position) {
    at('j14-keyboard-focus-keeps-window-paged');
    requireJourney(false, 'keyboard-focus-keeps-window', { beforeFocus, afterFocus });
  }
  if (afterFocus.top === beforeFocus.top) {
    // The browser revealed nothing, so nothing was proven: say so rather than pass on it. A hosted run prints only the
    // location (#604), so it tells the facts apart: the window without focus, a caret the focus found away from the
    // text's start, or a pane that moved and came back; the plain name is left for none of them.
    if (entered?.hasFocus !== true) at('j14-keyboard-focus-keeps-window-no-reveal-window-unfocused');
    // Where the caret stood, told apart at the hosted marker too (#619): elsewhere in the text, outside it, or absent.
    else if (entered.caret === 'elsewhere') at('j14-keyboard-focus-keeps-window-no-reveal-caret-elsewhere');
    else if (entered.caret === 'outside') at('j14-keyboard-focus-keeps-window-no-reveal-caret-outside');
    else if (entered.caret !== 'at-start') at('j14-keyboard-focus-keeps-window-no-reveal-caret-none');
    else if (Array.isArray(scrolled) && scrolled.some((top) => top !== beforeFocus.top)) at('j14-keyboard-focus-keeps-window-no-reveal-moved-back');
    else at('j14-keyboard-focus-keeps-window-no-reveal');
    requireJourney(false, 'keyboard-focus-reveal', { beforeFocus, afterFocus, entered, scrolled });
  }
  at('j14-top-edge-pages-back-once');
  // The reader's own scroll to the top edge still asks for the window before — once: the pane then
  // rests at that window's end, and resting there is not the reader asking to come back.
  await renderer.evaluate(`(async () => { const pane = document.querySelector('.editor-window'); const editor = document.querySelector('[data-testid="manuscript-editor"]'); const seen = [editor.firstElementChild?.dataset.blockId]; globalThis.__ai7WindowsSeen = seen; const watch = () => { if (globalThis.__ai7WindowsSeen !== seen) return; const first = editor.firstElementChild?.dataset.blockId; if (first !== seen[seen.length - 1]) seen.push(first); if (seen.length < 8) requestAnimationFrame(watch); }; requestAnimationFrame(watch); pane.scrollTop = Math.floor((pane.scrollHeight - pane.clientHeight) / 2); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); pane.scrollTop = 0; })()`);
  await waitFor(renderer, `globalThis.__ai7WindowsSeen.length >= 2`, 'top-edge-pages-back', 30_000);
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
  const pagedBack = await renderer.evaluate(`(() => { const seen = globalThis.__ai7WindowsSeen; globalThis.__ai7WindowsSeen = undefined; return { windows: seen.length, position: Number(document.querySelector('#manuscript-position')?.value) }; })()`);
  if (pagedBack?.windows !== 2) {
    at('j14-top-edge-pages-back-once-bounced');
    requireJourney(false, 'top-edge-pages-back-once', { pagedBack, beforeFocus });
  }
  await assertRenderer(renderer, `Number(document.querySelector('#manuscript-position')?.value) < ${beforeFocus.position}`, 'top-edge-paged-to-an-earlier-window');
  at('j14-keyboard-window-crossing');
  // The caret returns to the text the way a hand puts it there: without moving the pane. A plain
  // `focus()` scrolls the pane to the editor's top, which the surface rightly reads as the reader
  // reaching the top edge and answers by paging back — the PageDown under test was then refused, and
  // this step passed on a navigation it never asked for (found while building Issue #409).
  await renderer.evaluate(`(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); editor?.focus({ preventScroll: true }); globalThis.__ai7BeforePageKey = editor?.firstElementChild?.dataset.blockId; globalThis.__ai7BeforePagePosition = Number(document.querySelector('.position-rail')?.value); })()`);
  await press(renderer, 'PageDown');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId !== globalThis.__ai7BeforePageKey`, 'keyboard-window-crossing');
  // PageDown moves forward: the window that answered is a later one, not the one before. The rail's
  // value is the whole-manuscript position in millionths, so the direction is a plain comparison.
  const crossed = await renderer.evaluate(`({ before: globalThis.__ai7BeforePagePosition, after: Number(document.querySelector('.position-rail')?.value) })`);
  if (!(crossed?.after > crossed?.before)) {
    at('j14-keyboard-window-crossing-went-backward');
    requireJourney(false, 'keyboard-window-crossing-forward', crossed);
  }
  at('j14-fine-scroll-window-crossing');
  await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await renderer.evaluate(`(async () => { const surface = document.querySelector('.editor-window'); globalThis.__ai7BeforeFineScroll = document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId; surface.scrollTop = Math.floor((surface.scrollHeight - surface.clientHeight) / 2); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); surface.scrollTop = surface.scrollHeight; })()`);
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId !== globalThis.__ai7BeforeFineScroll`, 'fine-scroll-window-crossing');
  at('j14-zoom-200-reflow');
  await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
  await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  // Synchronized delta with Issue #409: at 200% the manuscript keeps the narrow rail beside it — the one
  // persistent whole-manuscript control — the 导航 panel lies over the manuscript instead of beside it, and
  // nothing scrolls sideways.
  await assertRenderer(renderer, `(() => { const columns = getComputedStyle(document.querySelector('.editor-workspace')).gridTemplateColumns.split(' '); const edge = document.querySelector('.editor-edge').getBoundingClientRect(); const panel = document.querySelector('#manuscript-navigation-panel'); return columns.length === 2 && edge.width <= 64 && getComputedStyle(panel).position === 'absolute' && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2; })()`, 'zoom-200-reflow');
  at('j14-forced-colors');
  await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.editor-shell')).boxShadow === 'none' && getComputedStyle(document.querySelector('button')).borderStyle !== 'none'`, 'forced-colors');
}

/** Synthetic fullwidth characters (Issue #951): never manuscript text; distinct from the fixture's own blocks. */
function protectionText(length, offset = 0) {
  return Array.from({ length }, (_, index) => String.fromCodePoint(PROTECTION_CJK_BASE + ((offset + index) * 13) % 0x800)).join('');
}

const JOURNAL_SEQUENCE_PROBE = `Number(Array.from(document.querySelectorAll('.editor-meta [data-editor-technical]')).find((item) => item.textContent?.startsWith('修订日志序号 '))?.textContent.slice(7))`;

/** Type at the end of the window's last block through the editor's own input path, as a hand would. */
async function typeAtWindowEnd(renderer, text, location) {
  const typed = await renderer.evaluate(`(async () => {
    const editor = document.querySelector('[data-testid="manuscript-editor"]');
    const block = editor?.lastElementChild;
    if (!(editor instanceof HTMLElement) || !(block instanceof HTMLElement)) return false;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const inserted = document.execCommand('insertText', false, ${JSON.stringify(text)});
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return inserted;
  })()`);
  requireJourney(typed === true, location);
}

const PROTECTION_PROBE = `(() => {
  const banner = document.querySelector('#editing-protection');
  const fact = (name) => banner?.querySelector('[data-protection-fact="' + name + '"]');
  const editor = document.querySelector('[data-testid="manuscript-editor"]');
  return {
    shown: banner instanceof HTMLElement && !banner.hidden,
    headline: banner?.querySelector('.editing-protection-headline')?.textContent ?? null,
    readOnly: banner?.dataset.protectionReadOnly ?? null,
    lastDurable: fact('last-durable')?.textContent ?? null,
    atRisk: Number(fact('at-risk')?.dataset.atRiskCharacters ?? -1),
    retry: fact('retry')?.textContent ?? null,
    attempts: Number(fact('retry')?.dataset.retryAttempts ?? -1),
    softLimit: Number(banner?.dataset.bufferSoftLimit ?? -1),
    capacity: Number(banner?.dataset.bufferCapacity ?? -1),
    document: document.documentElement.dataset.editingProtection ?? null,
    writable: editor?.getAttribute('contenteditable') === 'true' && editor.getAttribute('aria-readonly') === 'false',
    composing: editor?.dataset.composing ?? null,
    closeRisk: document.documentElement.dataset.ai7CloseRisk ?? null,
    journal: ${JOURNAL_SEQUENCE_PROBE},
    screen: document.querySelector('#screen')?.dataset.screen ?? null,
  };
})()`;

async function protectionChecks(renderer, checks, location, timeout = 30_000) {
  await waitForChecks(renderer, `(() => { const p = ${PROTECTION_PROBE}; return ${checks}; })()`, location, timeout);
}

/**
 * Issue #951 (ED-004, ED-058, VIEW-005): 专注模式 from the context header hides the sidebar, the supporting surfaces and the
 * task entries while the manuscript, the persistence status and a visible restore control stay, and Esc leaves it; the
 * manuscript is set in the editing preset's reading typography.
 */
async function runEditorModesJourney(renderer) {
  at('view-emulation-reset');
  await renderer.send('Emulation.setEmulatedMedia', { features: [] });
  await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await renderer.send('Emulation.clearDeviceMetricsOverride');
  await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  at('typography-defaults');
  await waitForChecks(renderer, `(() => { const text = document.querySelector('[data-testid="manuscript-editor"]'); const style = text ? getComputedStyle(text) : null; return { fontSize: style?.fontSize === '17px', lineHeight: Math.abs(parseFloat(style?.lineHeight ?? '0') - 17 * 1.9) < 0.6, column: Math.abs(parseFloat(style?.maxWidth ?? '0') - (38 * 17 + 16)) < 1.5, preset: document.documentElement.dataset.readingPreset === 'editing', density: document.documentElement.dataset.density === 'standard' }; })()`, 'typography-defaults', 15_000);
  at('focus-mode-enter');
  await assertRenderer(renderer, `(() => { document.querySelector('[data-edge-entry="analysis"]')?.click(); const panel = document.querySelector('#paragraph-analysis-panel'); const separator = document.querySelector('.editor-workspace > .region-separator'); return panel instanceof HTMLElement && !panel.hidden && panel.getBoundingClientRect().width > 0 && separator instanceof HTMLElement && getComputedStyle(separator).display !== 'none'; })()`, 'analysis-region-open');
  await assertRenderer(renderer, `(() => { const toggle = document.querySelector('[data-view-command="focus-mode"]'); if (!(toggle instanceof HTMLButtonElement) || toggle.getAttribute('aria-pressed') !== 'false') return false; toggle.focus(); toggle.click(); return true; })()`, 'focus-mode-toggle');
  await waitForChecks(renderer, `(() => { const hidden = (selector) => { const node = document.querySelector(selector); return node === null || getComputedStyle(node).display === 'none'; }; const status = document.querySelector('#persistence-status'); const toggle = document.querySelector('[data-view-command="focus-mode"]'); return { modeOn: document.documentElement.dataset.focusMode === 'on', sidebarHidden: hidden('#app-sidebar'), navigationHidden: hidden('#manuscript-navigation-panel'), analysisHidden: hidden('#paragraph-analysis-panel'), saveMenuShown: !hidden('#manuscript-save-menu') && document.querySelector('#context-actions #manuscript-save-menu') !== null, edgeEntriesHidden: hidden('.edge-entries'), drawerHidden: hidden('#task-drawer'), manuscriptShown: (document.querySelector('[data-testid="manuscript-editor"]')?.getBoundingClientRect().width ?? 0) > 0, statusShown: status instanceof HTMLElement && getComputedStyle(status).display !== 'none', restoreControl: toggle?.getAttribute('aria-pressed') === 'true' && toggle.textContent === '退出专注（Esc）' && toggle.getBoundingClientRect().width > 0 }; })()`, 'focus-mode-entered', 15_000);
  at('focus-mode-esc');
  await renderer.evaluate(`document.querySelector('[data-testid="manuscript-editor"]')?.focus({ preventScroll: true })`);
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitForChecks(renderer, `({ modeOff: document.documentElement.dataset.focusMode === 'off', sidebarShown: getComputedStyle(document.querySelector('#app-sidebar')).display !== 'none', edgeShown: getComputedStyle(document.querySelector('.edge-entries')).display !== 'none', analysisRestored: document.querySelector('#paragraph-analysis-panel')?.hidden === false && document.querySelector('#paragraph-analysis-panel').getBoundingClientRect().width > 0 })`, 'focus-mode-left', 15_000);
  await renderer.evaluate(`document.querySelector('[data-edge-entry="analysis"]')?.click()`);
}

/**
 * Issue #951 (DUR-001 to DUR-012, ED-055, ED-056; T0-1): with the journal's acknowledgement made unavailable, the context
 * header says so with the Last Durable Edit Boundary, the At-risk Edit Extent and the automatic retry; leaving and closing
 * are refused with the reason; automatic retries add no entry; 重试写入 lands the exact buffered sequence and clears the mode;
 * and the buffer keeps room for an input-method composition, then enters the Protective Read-only State.
 */
async function runProtectionJourney(renderer) {
  at('protection-arm');
  // A window reached by paging holds its caret until the reader places one (the editor's deferred continuity): the caret is
  // placed with a key, as a reader does, before anything is typed.
  await renderer.evaluate(`document.querySelector('[data-testid="manuscript-editor"]')?.focus({ preventScroll: true })`);
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  await protectionChecks(renderer, `({ bannerHidden: !p.shown, noProtection: p.document === null, writable: p.writable, closeRiskClear: p.closeRisk === 'false', journal: Number.isSafeInteger(p.journal) })`, 'protection-idle');
  const durable = await renderer.evaluate(JOURNAL_SEQUENCE_PROBE);
  at('protection-initial-bound');
  // Even the input before the first unavailable acknowledgement must fit the declared reserve; a large paste is refused intact.
  const initialLength = await renderer.evaluate(`document.querySelector('[data-testid="manuscript-editor"]')?.lastElementChild?.textContent.length`);
  const initialLimit = await renderer.evaluate(`Number(document.querySelector('#editing-protection')?.dataset.bufferSoftLimit)`);
  requireJourney(Number.isSafeInteger(initialLimit) && initialLimit > 0, 'protection-initial-bound');
  await assertRenderer(renderer, `(() => { const status = document.querySelector('#persistence-status'); return status instanceof HTMLElement && status.textContent !== ${JSON.stringify(PENDING_BUFFER_REFUSED)}; })()`, 'protection-initial-bound');
  await typeAtWindowEnd(renderer, protectionText(initialLimit + 1, 8_000), 'protection-initial-bound-type');
  await protectionChecks(renderer, `({ refused: document.querySelector('#persistence-status')?.textContent === ${JSON.stringify(PENDING_BUFFER_REFUSED)} && document.querySelector('#persistence-status')?.dataset.tone === 'error', noInput: document.querySelector('[data-testid="manuscript-editor"]')?.lastElementChild?.textContent.length === ${initialLength}, noProtection: !p.shown, noEntry: p.journal === ${durable} })`, 'protection-initial-bound');
  requireJourney((await renderer.setJournalFault('fail-all'))?.mode === 'fail-all', 'protection-arm');
  at('protection-enter');
  await typeAtWindowEnd(renderer, protectionText(12), 'protection-enter-type');
  await protectionChecks(renderer, `({ shown: p.shown, headline: p.headline === ${JSON.stringify(PROTECTION_HEADLINE)}, boundary: p.lastDurable?.startsWith(${JSON.stringify(`最后确认写入：修订日志序号 ${durable.toLocaleString('zh-CN')} · `)}) === true, atRisk: p.atRisk === 12, retry: p.retry?.startsWith('自动重试：') === true, active: p.document === 'active' && p.readOnly === 'none', writable: p.writable, closeRisk: p.closeRisk === 'true', noEntry: p.journal === ${durable} })`, 'protection-entered');
  at('protection-blocked-action');
  await assertRenderer(renderer, `(() => { const back = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '返回图书工作概览'); if (!(back instanceof HTMLButtonElement) || back.disabled) return false; back.focus(); back.click(); return true; })()`, 'protection-blocked-action-click');
  await waitForChecks(renderer, `(() => { const back = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '返回图书工作概览'); const note = back?.nextElementSibling; return { stayed: document.querySelector('#screen')?.dataset.screen === 'editor', reason: note instanceof HTMLElement && note.dataset.protectionBlocked === '返回图书工作概览' && note.textContent.includes('暂不能执行「返回图书工作概览」'), noEntry: ${JOURNAL_SEQUENCE_PROBE} === ${durable} }; })()`, 'protection-blocked-action', 30_000);
  at('protection-blocked-close');
  // The product's own close request (现在关闭 AI7) meets the close guard as the window's close button does; a page script's
  // `window.close()` is not one — Electron may close a page that asks for it without the preventable close event.
  const closeAnswer = await renderer.evaluate(`window.ai7.quitApplication().then((answer) => answer.outcome, () => 'refused')`);
  requireJourney(closeAnswer === 'blocked', 'protection-close-request-blocked');
  await waitForChecks(renderer, `(() => { const options = document.querySelector('#editing-protection-options'); return { stayed: document.querySelector('#screen')?.dataset.screen === 'editor', optionsOpen: options instanceof HTMLElement && !options.hidden, reason: options?.querySelector('.editing-protection-reason')?.textContent === ${JSON.stringify(PROTECTION_CLOSE_BLOCKED)}, retryOffered: options?.querySelector('[data-protection-action="retry"]')?.textContent === '重试写入', copyOffered: options?.querySelector('[data-protection-action="copy"]')?.textContent === '复制受影响内容', closeStateConsumed: document.documentElement.dataset.ai7CloseState === undefined }; })()`, 'protection-blocked-close', 30_000);
  at('protection-auto-retry');
  await protectionChecks(renderer, `({ retried: p.attempts >= 1, stillProtected: p.shown && p.document === 'active', noEntry: p.journal === ${durable}, atRisk: p.atRisk === 12 })`, 'protection-auto-retry', 45_000);
  at('protection-retry-recovery');
  requireJourney((await renderer.setJournalFault('off'))?.mode === 'off', 'protection-fault-off');
  await assertRenderer(renderer, `(() => { const retry = document.querySelector('#editing-protection-options [data-protection-action="retry"]'); if (!(retry instanceof HTMLButtonElement)) return false; if (retry.disabled) return true; retry.click(); return true; })()`, 'protection-retry-click');
  await protectionChecks(renderer, `({ cleared: !p.shown && p.document === null, oneEntry: p.journal === ${durable + 1}, writable: p.writable, closeRisk: p.closeRisk === 'false', status: document.querySelector('#persistence-status')?.textContent === '已写入修订日志', optionsClosed: document.querySelector('#editing-protection-options')?.hidden === true, reasonsGone: document.querySelector('.editing-protection-blocked') === null })`, 'protection-retry-recovered', 60_000);
  at('protection-reversed-input');
  requireJourney((await renderer.setJournalFault('fail-all'))?.mode === 'fail-all', 'protection-reversed-arm');
  await typeAtWindowEnd(renderer, protectionText(12, 7_000), 'protection-reversed-type');
  await protectionChecks(renderer, `({ shown: p.shown, atRisk: p.atRisk === 12 })`, 'protection-reversed-start');
  await renderer.evaluate(`(async () => {
    const editor = document.querySelector('[data-testid="manuscript-editor"]');
    editor.focus({ preventScroll: true });
    const range = document.createRange(); range.selectNodeContents(editor.lastElementChild); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    for (let index = 0; index < 12; index += 1) selection.modify('extend', 'backward', 'character');
    document.execCommand('delete');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  await protectionChecks(renderer, `({ pendingCommandRetained: p.atRisk === 12, stillProtected: p.shown && p.closeRisk === 'true', reverted: document.querySelector('[data-testid="manuscript-editor"]')?.lastElementChild?.textContent.length === ${initialLength + 12}, noEntry: p.journal === ${durable + 1} })`, 'protection-reversed-pending');
  at('protection-reversed-recovery');
  requireJourney((await renderer.setJournalFault('off'))?.mode === 'off', 'protection-reversed-off');
  // First acknowledge the exact outstanding command, then its reversal; neither is duplicated or silently discarded.
  await protectionChecks(renderer, `({ cleared: !p.shown && p.document === null, twoEntries: p.journal === ${durable + 3}, exactVisibleLength: document.querySelector('[data-testid="manuscript-editor"]')?.lastElementChild?.textContent.length === ${initialLength + 12}, writable: p.writable, closeRisk: p.closeRisk === 'false' })`, 'protection-reversed-recovered', 60_000);
  at('protection-capacity-fill');
  const softLimit = await renderer.evaluate(`Number(document.querySelector('#editing-protection')?.dataset.bufferSoftLimit)`);
  const capacity = await renderer.evaluate(`Number(document.querySelector('#editing-protection')?.dataset.bufferCapacity)`);
  requireJourney(Number.isSafeInteger(softLimit) && Number.isSafeInteger(capacity) && softLimit > 200 && capacity - softLimit >= 100, 'protection-buffer-limits');
  requireJourney((await renderer.setJournalFault('fail-all'))?.mode === 'fail-all', 'protection-rearm');
  const filled = softLimit - 60;
  await typeAtWindowEnd(renderer, protectionText(10, 100), 'protection-capacity-first');
  await protectionChecks(renderer, `({ shown: p.shown && p.document === 'active', atRisk: p.atRisk === 10 })`, 'protection-capacity-entered');
  for (let typed = 10; typed < filled;) {
    const chunk = Math.min(240, filled - typed);
    await typeAtWindowEnd(renderer, protectionText(chunk, 200 + typed), 'protection-capacity-type');
    typed += chunk;
  }
  await protectionChecks(renderer, `({ atRisk: p.atRisk === ${filled}, writable: p.writable, readOnly: p.readOnly === 'none', noEntry: p.journal === ${durable + 3} })`, 'protection-capacity-filled');
  at('protection-ime-reserve');
  // A composition that crosses the soft limit is taken into the reserve and never cut short (DUR-008).
  const composition = protectionText(100, 4_000);
  await renderer.evaluate(`(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const block = editor?.lastElementChild; editor?.focus({ preventScroll: true }); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return true; })()`);
  await renderer.send('Input.imeSetComposition', { text: composition, selectionStart: composition.length, selectionEnd: composition.length });
  await protectionChecks(renderer, `({ composing: p.composing === 'true', notReadOnly: p.readOnly === 'none', writable: p.writable })`, 'protection-ime-composing', 15_000);
  await renderer.send('Input.insertText', { text: composition });
  at('protection-read-only');
  await protectionChecks(renderer, `({ ended: p.composing === 'false', kept: p.atRisk === ${filled + 100}, readOnly: p.readOnly === 'capacity' && p.document === 'read-only', headline: p.headline === ${JSON.stringify(PROTECTION_READ_ONLY_HEADLINE)}, refused: !p.writable, withinCapacity: p.atRisk <= p.capacity, noEntry: p.journal === ${durable + 3} })`, 'protection-read-only', 30_000);
  // The read-only text takes nothing more, and its options still offer 重试写入 and 复制受影响内容 (DUR-009).
  await renderer.evaluate(`(async () => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); editor?.focus({ preventScroll: true }); document.execCommand('insertText', false, ${JSON.stringify(protectionText(5, 9_000))}); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); document.querySelector('#editing-protection [data-protection-action="options"]')?.click(); return true; })()`);
  await waitForChecks(renderer, `(() => { const p = ${PROTECTION_PROBE}; const options = document.querySelector('#editing-protection-options'); return { unchanged: p.atRisk === ${filled + 100}, optionsOpen: options instanceof HTMLElement && !options.hidden, retryOffered: options?.querySelector('[data-protection-action="retry"]') instanceof HTMLButtonElement, copyOffered: options?.querySelector('[data-protection-action="copy"]') instanceof HTMLButtonElement, readOnlyReason: options?.querySelector('.editing-protection-read-only')?.hidden === false }; })()`, 'protection-read-only-options', 15_000);
  at('protection-read-only-recovery');
  requireJourney((await renderer.setJournalFault('off'))?.mode === 'off', 'protection-fault-off-again');
  await assertRenderer(renderer, `(() => { const retry = document.querySelector('#editing-protection-options [data-protection-action="retry"]'); if (!(retry instanceof HTMLButtonElement)) return false; if (!retry.disabled) retry.click(); return true; })()`, 'protection-read-only-retry-click');
  // The exact buffered sequence lands in order, one entry per bounded edit, and nothing more (DUR-006, DUR-012).
  // The first ten characters are the edit the retries hold; what was typed after lands as bounded edits behind it.
  const entries = 1 + Math.ceil((filled - 10 + 100) / JOURNAL_EDIT_GRAPHEMES);
  await protectionChecks(renderer, `({ cleared: !p.shown && p.document === null, exactEntries: p.journal === ${durable + 3 + entries}, writable: p.writable, closeRisk: p.closeRisk === 'false' })`, 'protection-read-only-recovered', 90_000);
}

/** The bounded window's block ceiling, owned by MAX_WINDOW_BLOCKS in src/shared/protocol.ts. */
const MAX_RENDERER_BLOCKS = 32;

/** The manuscript's last block and its block count, read through the public window at its end. */
const MANUSCRIPT_TAIL_PROBE = `(async () => { const work = (await window.ai7.listPriorWork())[0]; const page = await window.ai7.getManuscriptWindowAt({ manuscriptId: work.manuscriptId, branchId: work.branchId, target: { kind: 'proportion', proportion: 1 } }); const last = page.blocks.at(-1); return { blockId: last.blockId, position: last.position, totalBlocks: page.position.totalBlocks }; })()`;

/** What the window shows of the structure paragraph: its text and the paragraph after it, the window size, and the journal. */
const STRUCTURE_PROBE = `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const s = window.__j02Structure; const block = editor?.querySelector('[data-block-id="' + s.blockId + '"]'); const next = block?.nextElementSibling; return { text: block?.textContent ?? null, nextId: next?.dataset.blockId ?? null, nextText: next?.textContent ?? null, blocks: editor?.children.length ?? 0, journal: ${JOURNAL_SEQUENCE_PROBE}, closeRisk: document.documentElement.dataset.ai7CloseRisk, unlocked: editor?.parentElement?.dataset.authoritativeMutation === 'false', redoReady: Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '重做' && !button.disabled) }; })()`;

async function pressStructureKey(renderer, key) {
  const descriptor = key === 'Enter'
    ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }
    : { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...descriptor });
}

/** A collapsed caret `offset` code units into a block of the window, placed the way a click places it. */
async function placeStructureCaret(renderer, blockId, offset, location) {
  await assertRenderer(renderer, `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const block = editor?.querySelector('[data-block-id=' + JSON.stringify(${JSON.stringify(blockId)}) + ']'); const text = block?.firstChild; if (!editor || !block) return false; editor.focus({ preventScroll: true }); const range = document.createRange(); if (text) range.setStart(text, ${offset}); else range.setStart(block, 0); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return true; })()`, location);
  await new Promise((resolveWait) => setTimeout(resolveWait, 150));
}

/**
 * Issue #1175 (ADR 0096 §1): Enter at the caret splits a paragraph of the 50,000-block manuscript and Backspace at the new
 * paragraph's start merges it back, each shown at once in the bounded window and written as one journal entry, while every
 * later block's position moves; 撤销 and 重做 take each back and forth as one step, and the window never holds more than 32 blocks.
 */
async function runStructureJourney(renderer) {
  at('structure-split');
  const chosen = await renderer.evaluate(`(() => { const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }); const blocks = Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > p[data-block-id]')); const found = blocks.slice(1, -2).find((node) => node.childNodes.length === 1 && Array.from(segmenter.segment((node.textContent ?? '').slice(0, 24))).length === 24); if (!found) return false; window.__j02Structure = { blockId: found.dataset.blockId, text: found.textContent, journal: ${JOURNAL_SEQUENCE_PROBE} }; return true; })()`);
  requireJourney(chosen === true, 'structure-paragraph');
  const tail = await renderer.evaluate(MANUSCRIPT_TAIL_PROBE);
  requireJourney(tail.position === tail.totalBlocks && tail.totalBlocks >= BLOCK_COUNT, 'structure-tail-before');
  const blockId = await renderer.evaluate('window.__j02Structure.blockId');
  await placeStructureCaret(renderer, blockId, 12, 'structure-split-caret');
  await pressStructureKey(renderer, 'Enter');
  await waitForChecks(renderer, `(() => { const p = ${STRUCTURE_PROBE}; const s = window.__j02Structure; window.__j02Split = p.nextId; return { head: p.text === s.text.slice(0, 12), tail: p.nextText === s.text.slice(12), newIdentity: p.nextId !== null && p.nextId !== s.blockId, bounded: p.blocks <= ${MAX_RENDERER_BLOCKS} }; })()`, 'structure-split-shown', 10_000);
  await waitForChecks(renderer, `(() => { const p = ${STRUCTURE_PROBE}; return { oneEntry: p.journal === window.__j02Structure.journal + 1, settled: p.closeRisk === 'false' }; })()`, 'structure-split-written', 30_000);
  const shifted = await renderer.evaluate(MANUSCRIPT_TAIL_PROBE);
  requireJourney(shifted.blockId === tail.blockId && shifted.position === tail.position + 1 && shifted.totalBlocks === tail.totalBlocks + 1, 'structure-tail-shifted');

  at('structure-undo-redo');
  await clickButton(renderer, '撤销', 'structure-undo-split');
  await waitForChecks(renderer, `(() => { const p = ${STRUCTURE_PROBE}; const s = window.__j02Structure; return { whole: p.text === s.text, gone: p.nextId !== window.__j02Split, oneStep: p.journal === s.journal + 2, bounded: p.blocks <= ${MAX_RENDERER_BLOCKS}, redoReady: p.unlocked && p.redoReady }; })()`, 'structure-undo-is-one-step', 30_000);
  await clickButton(renderer, '重做', 'structure-redo-split');
  await waitForChecks(renderer, `(() => { const p = ${STRUCTURE_PROBE}; const s = window.__j02Structure; return { head: p.text === s.text.slice(0, 12), again: p.nextId === window.__j02Split, oneStep: p.journal === s.journal + 3, unlocked: p.unlocked }; })()`, 'structure-redo-is-one-step', 30_000);

  at('structure-merge');
  await placeStructureCaret(renderer, await renderer.evaluate('window.__j02Split'), 0, 'structure-merge-caret');
  await pressStructureKey(renderer, 'Backspace');
  await waitForChecks(renderer, `(() => { const p = ${STRUCTURE_PROBE}; const s = window.__j02Structure; return { whole: p.text === s.text, merged: p.nextId !== window.__j02Split, bounded: p.blocks <= ${MAX_RENDERER_BLOCKS} }; })()`, 'structure-merge-shown', 10_000);
  await waitForChecks(renderer, `(() => { const p = ${STRUCTURE_PROBE}; return { oneEntry: p.journal === window.__j02Structure.journal + 4, settled: p.closeRisk === 'false' }; })()`, 'structure-merge-written', 30_000);
  const merged = await renderer.evaluate(MANUSCRIPT_TAIL_PROBE);
  requireJourney(merged.blockId === tail.blockId && merged.position === tail.position && merged.totalBlocks === tail.totalBlocks, 'structure-tail-restored');
}

async function main() {
  parseJourney();
  const networkDenialEntry = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
  requireJourney(existsSync(networkDenialEntry), 'controller-network-denial-carrier');
  const { installNodeNetworkDenial } = await import(pathToFileURL(networkDenialEntry).href);
  installNodeNetworkDenial();
  ({ Zip, ZipPassThrough, strToU8 } = await import('fflate'));
  ({ electronExecutable } = await import('../tools/electron-runtime.mjs'));
  const dataRootEntry = resolve(ROOT, 'dist', 'shared', 'data-root.mjs');
  requireJourney(existsSync(dataRootEntry), 'controller-data-root-carrier');
  const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(dataRootEntry).href);
  const { chromium } = await import('playwright-core');
  const tempParent = await realpath(tmpdir());
  const checkoutRoot = await realpath(ROOT);
  requireJourney(!pathIsInside(checkoutRoot, tempParent) && !pathIsInside(tempParent, checkoutRoot), 'temp-parent-boundary');
  let runRoot;
  let runRootAcquisition;
  let browser;
  let browserAcquisition;
  let journeyCompleted = false;
  const closeOwnedBrowser = async () => {
    const ownedBrowser = browser ?? (browserAcquisition === undefined ? undefined : await browserAcquisition.catch(() => undefined));
    await ownedBrowser?.close().catch(() => undefined);
    browser = undefined;
  };
  const cancellation = installJourneyCancellationCleanup(async () => {
    await closeOwnedBrowser();
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      requireJourney(dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j02-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
      await rm(ownedRoot, { recursive: true, force: true });
      runRoot = undefined;
    }
  }, closeOwnedBrowser);
  try {
    cancellation.throwIfRequested();
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j02-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j02-e2e-'), 'temp-root');
    const docx = resolve(runRoot, 'public-synthetic-10000000.docx');
    await createSyntheticDocx(docx);
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkoutRoot);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const productArgs = [
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
      '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
      resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid), '--j02-picker-path', docx,
      // Issue #951 (T0-1): arms the Edit Journal write-failure injection, which every other launch refuses.
      '--j02-journal-fault-control', 'armed',
    ];
    requireJourney(isAbsolute(dataRoot) && isAbsolute(docx) && !productArgs.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
    const launch = async (launchScenario) => {
      launchStartedAt = Date.now();
      at(`launch-${launchScenario}-browser-acquisition`);
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args: productArgs, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-02', browser, launchScenario);
      at(`launch-${launchScenario}-post-acquisition-cancellation`);
      cancellation.throwIfRequested();
      return attachRendererTarget(browser, launchScenario);
    };
    let renderer = await launch('initial');
    await importAndOpen(renderer, dataRoot);
    await runWorkspaceJourney(renderer, dataRoot);
    at('restart-browser-close');
    await browser.close();
    browser = undefined;
    renderer = await launch('restart');
    await runRestartJourney(renderer);
    await runScreenLifecycleJourney(renderer);
    await runAccessibilityJourney(renderer);
    // Issue #951: 专注模式, the reading typography and Editing Protection Mode, after every pinned stage above.
    await runEditorModesJourney(renderer);
    await runProtectionJourney(renderer);
    // Issue #1175: Enter splits and Backspace merges inside the bounded window, after every pinned stage above.
    await runStructureJourney(renderer);
    // The close and what follows it are their own stages: left under the last j14 step, a failure to
    // shut the product down or to clear the run root would read as an accessibility failure (#474).
    at('completion-browser-close');
    await browser.close();
    browser = undefined;
    at('completion-fixture-survived');
    requireJourney((await stat(docx)).size > CHARACTER_COUNT, 'fixture-survived-until-completion');
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

main().catch((error) => reportJourneyFailure('J-02', diagnosticLocation, error));
