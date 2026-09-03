import { createWriteStream, existsSync } from 'node:fs';
import { lstat, mkdtemp, opendir, realpath, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installJourneyCancellationCleanup, reportJourneyFailure } from './controller.mjs';

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
const RECOVERY_PARTIAL_PATTERN = /^\.partial-[0-9a-f-]{36}$/i;
const RECOVERY_OBJECT_PATTERN = /^[0-9a-f]{64}\.snapshot$/;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const CJK_BASE = 0x4e00;
const CJK_SPAN = 0x1000;
let diagnosticLocation = 'entry';
let electronExecutable;
let Zip;
let ZipPassThrough;
let strToU8;

function at(location) {
  diagnosticLocation = location;
}

function requireJourney(condition, location) {
  if (!condition) throw new Error(`J-02/${location}`);
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
  requireJourney(!Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
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
  const rootSession = await browser.newBrowserCDPSession();
  const deadline = Date.now() + 60_000;
  let pageTarget;
  while (Date.now() < deadline) {
    at(`launch-${launchScenario}-renderer-target-query`);
    const { targetInfos } = await rootSession.send('Target.getTargets');
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
  const { sessionId } = await rootSession.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: false });
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
    if (response.error) completion.reject(new Error('J-02/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectResponse(new Error('J-02/renderer-cdp-timeout'));
      }, 60_000);
      timeout.unref();
      pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
        reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
      });
    });
    await rootSession.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
    return response;
  };
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    requireJourney(!response.exceptionDetails, 'renderer-evaluate');
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
    throw new Error('J-02/preload-ipc-observation');
  };
  at(`launch-${launchScenario}-renderer-runtime-enable`);
  await send('Runtime.enable');
  return { evaluate, observeIpc, send };
}

async function waitFor(renderer, expression, location, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-02/${location}`);
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
  throw new Error(`J-02/${location}:${failed.join(',')}`);
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

async function importAndOpen(renderer) {
  at('renderer-ready');
  await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'renderer-ready');
  await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined'`, 'renderer-isolation');
  requireJourney(await renderer.evaluate(`(async () => { try { await fetch('http://127.0.0.1:9/j02-denial'); return false; } catch { return true; } })()`), 'renderer-network-denial');
  await clickButton(renderer, '导入稿件', 'stage-click');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'stage-target', 240_000);
  await assertRenderer(renderer, `document.querySelector('.source-card')?.textContent.includes('${BLOCK_COUNT} 个可编辑内容块')`, 'exact-block-count');
  await assertRenderer(renderer, `(() => { const radio = document.querySelector('input[aria-label="新建图书"]'); if (!radio) return false; radio.click(); return true; })()`, 'target-select');
  await assertRenderer(renderer, `(() => { const radio = document.querySelector('input[aria-label="作为首份稿件导入"]'); if (!radio || radio.checked) return false; radio.click(); return true; })()`, 'relationship-select');
  await waitFor(renderer, `document.querySelector('#book-title')`, 'title');
  await fill(renderer, '#book-title', '千万字有界编辑校验', 'title-fill');
  await clickButton(renderer, '确认书名并复核', 'review-click');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'review');
  await assertRenderer(renderer, `!document.querySelector('#accept-import-degradation') && Array.from(document.querySelectorAll('[data-fidelity-category]')).every((row) => row.dataset.fidelityCategory === 'round-trip-export' || row.querySelector('.status-preserved'))`, 'clean-fidelity');
  await clickButton(renderer, '新建图书并导入稿件', 'commit-click');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'imported', 300_000);
  await waitFor(
    renderer,
    `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true' && !Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '打开稿件')?.disabled`,
    'completion-acknowledged-before-open',
    300_000,
  );
  await clickButton(renderer, '打开稿件', 'editor-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'editor');
}

async function milestoneObjectTimeoutCategory(dataRoot) {
  let directory;
  try {
    directory = await opendir(join(dataRoot, 'recovery-objects', 'v1'));
  } catch (error) {
    if (error?.code === 'ENOENT') return 'recovery-object-absent';
    throw new Error('J-02/milestone-r2-object-inspection');
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
  await assertRenderer(renderer, `document.querySelector('#milestone-label')?.maxLength === 80 && document.querySelector('#milestone-purpose')?.maxLength === 120 && document.querySelector('#milestone-note')?.maxLength === 500`, 'milestone-ui-service-bounds');
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
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const journal = Array.from(document.querySelectorAll('.editor-meta > span')).find((item) => item.textContent?.startsWith('修订日志序号 ')); const undo = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '撤销'); const retry = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '重试权威刷新'); return { journalSequence5: journal?.textContent === '修订日志序号 5', operationUnlocked: editor?.dataset.operationLocked === 'false', editorWritable: editor?.getAttribute('contenteditable') === 'true', ariaWritable: editor?.getAttribute('aria-readonly') === 'false', continuityResolved: editor instanceof HTMLElement && !editor.hasAttribute('tabindex'), authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', authoritativeStartCleared: undo instanceof HTMLButtonElement && !undo.disabled, recoveryNotRequired: retry instanceof HTMLButtonElement && retry.hidden }; })()`,
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
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const journal = Array.from(document.querySelectorAll('.editor-meta > span')).find((item) => item.textContent?.startsWith('修订日志序号 ')); const searchInput = document.querySelector('#manuscript-search'); const search = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '查找全稿'); const retry = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '重试权威刷新'); return { journalSequence6: journal?.textContent === '修订日志序号 6', authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', operationUnlocked: editor?.dataset.operationLocked === 'false', editorWritable: editor?.getAttribute('contenteditable') === 'true', ariaWritable: editor?.getAttribute('aria-readonly') === 'false', searchInputReady: searchInput instanceof HTMLInputElement && !searchInput.disabled, searchStartReady: search instanceof HTMLButtonElement && !search.disabled, recoveryNotRequired: retry instanceof HTMLButtonElement && retry.hidden }; })()`,
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
  await assertRenderer(renderer, `(() => { const details = document.querySelector('.milestone-section'); details.open = true; return true; })()`, 'milestone-open');
  await fill(renderer, '#milestone-label', '结构复核完成', 'milestone-label');
  await fill(renderer, '#milestone-purpose', '确认千万字编辑与替换状态', 'milestone-purpose');
  await fill(renderer, '#milestone-note', '本地里程碑，不表示导出或发布。', 'milestone-note');
  at('milestone-save-dispatch');
  const milestoneDrainObservation = await renderer.observeIpc();
  await editThenInvokeOnDirty(renderer, '碑', ['保存为里程碑版本'], 'dirty-milestone-save');
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
    throw new Error(`J-02/milestone-r2-${ipcCategory}-${objectCategory}`);
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
  await waitFor(renderer, `document.querySelector('.search-results')?.childElementCount === 0 && document.querySelector('.replacement-review')?.hidden && document.querySelector('.search-results')?.dataset.inclusionLocked === 'false' && Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '返回查找前位置')?.hidden && document.querySelector('.search-section .field-note')?.textContent.includes('稿件修订版已变化')`, 'milestone-revision-stales-all-search-state');
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
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const journal = Array.from(document.querySelectorAll('.editor-meta > span')).find((item) => item.textContent?.startsWith('修订日志序号 ')); const retry = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '重试权威刷新'); return { journalSequence9: journal?.textContent === '修订日志序号 9', authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', operationUnlocked: editor?.dataset.operationLocked === 'false', editorWritable: editor?.getAttribute('contenteditable') === 'true', ariaWritable: editor?.getAttribute('aria-readonly') === 'false', recoveryNotRequired: retry instanceof HTMLButtonElement && retry.hidden, closeRiskCleared: document.documentElement.dataset.ai7CloseRisk === 'false' }; })()`,
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
  await assertRenderer(renderer, `document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32`, 'restart-window-bounded');
  await clickButton(renderer, '重做', 'restart-redo');
  await waitForChecks(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const host = editor?.parentElement; const journal = Array.from(document.querySelectorAll('.editor-meta > span')).find((item) => item.textContent?.startsWith('修订日志序号 ')); const searchInput = document.querySelector('#manuscript-search'); const search = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '查找全稿'); const retry = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '重试权威刷新'); return { journalSequence10: journal?.textContent === '修订日志序号 10', authoritativeMutationCleared: host?.dataset.authoritativeMutation === 'false', operationUnlocked: editor?.dataset.operationLocked === 'false', editorWritable: editor?.getAttribute('contenteditable') === 'true', ariaWritable: editor?.getAttribute('aria-readonly') === 'false', searchInputReady: searchInput instanceof HTMLInputElement && !searchInput.disabled, searchStartReady: search instanceof HTMLButtonElement && !search.disabled, recoveryNotRequired: retry instanceof HTMLButtonElement && retry.hidden }; })()`,
    'restart-redo-durable',
    120_000,
  );
  await fill(renderer, '#manuscript-search', REPLACEMENT_TEXT, 'redo-search-fill');
  await clickButton(renderer, '查找全稿', 'redo-search');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 24 处')`, 'redo-state-exact', 120_000);
}

async function runAccessibilityJourney(renderer) {
  at('j14-behavior');
  const modifier = process.platform === 'darwin' ? 4 : 2;
  await assertRenderer(renderer, `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); if (!(editor instanceof HTMLElement)) return false; editor.focus(); return document.activeElement === editor; })()`, 'composition-focus');
  await renderer.send('Input.imeSetComposition', { text: '编', selectionStart: 1, selectionEnd: 1, replacementStart: 0, replacementEnd: 0 });
  await press(renderer, 'f', modifier);
  await assertRenderer(renderer, `document.activeElement?.id !== 'manuscript-search' && document.querySelector('#persistence-status')?.textContent.includes('输入法组合尚未结束')`, 'ime-command-guard');
  await renderer.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0, replacementStart: 0, replacementEnd: 1 });
  await press(renderer, 'f', modifier);
  await waitFor(renderer, `document.activeElement?.id === 'manuscript-search'`, 'keyboard-search-focus');
  await assertRenderer(renderer, `(() => { const input = document.querySelector('#manuscript-search'); return input?.matches(':focus-visible') && getComputedStyle(input).outlineStyle !== 'none'; })()`, 'visible-focus');
  await renderer.evaluate(`(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); editor?.focus(); globalThis.__ai7BeforePageKey = editor?.firstElementChild?.dataset.blockId; })()`);
  await press(renderer, 'PageDown');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId !== globalThis.__ai7BeforePageKey`, 'keyboard-window-crossing');
  await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await renderer.evaluate(`(() => { const surface = document.querySelector('.editor-window'); globalThis.__ai7BeforeFineScroll = document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId; surface.scrollTop = surface.scrollHeight; })()`);
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId !== globalThis.__ai7BeforeFineScroll`, 'fine-scroll-window-crossing');
  await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
  await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await assertRenderer(renderer, `getComputedStyle(document.querySelector('.editor-workspace')).gridTemplateColumns.split(' ').length === 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2`, 'zoom-200-reflow');
  await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.editor-shell')).boxShadow === 'none' && getComputedStyle(document.querySelector('button')).borderStyle !== 'none'`, 'forced-colors');
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
    ];
    requireJourney(isAbsolute(dataRoot) && isAbsolute(docx) && !productArgs.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
    const launch = async (launchScenario) => {
      at(`launch-${launchScenario}-browser-acquisition`);
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args: productArgs, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      at(`launch-${launchScenario}-post-acquisition-cancellation`);
      cancellation.throwIfRequested();
      return attachRendererTarget(browser, launchScenario);
    };
    let renderer = await launch('initial');
    await importAndOpen(renderer);
    await runWorkspaceJourney(renderer, dataRoot);
    at('restart-browser-close');
    await browser.close();
    browser = undefined;
    renderer = await launch('restart');
    await runRestartJourney(renderer);
    await runAccessibilityJourney(renderer);
    await browser.close();
    browser = undefined;
    requireJourney((await stat(docx)).size > CHARACTER_COUNT, 'fixture-survived-until-completion');
  } finally {
    try {
      await cancellation.cleanup();
    } finally {
      cancellation.dispose();
    }
  }
}

main().catch(() => reportJourneyFailure('J-02', diagnosticLocation));
