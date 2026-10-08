import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, journeyCheckFailure, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PROFILE_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
const PROFILE_BYTES = 263;
const SIDECAR_ID = 'ai7.editorial-workspace-profile.authority';
const SIDECAR_REVISION_1_DIGEST = '887067fc716261fc5f41772a295faa326f6bf2818573daae29ffdb7388e9e48d';
const SIDECAR_REVISION_2_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
const FUTURE_SKEWED_ENABLED_AT = '9999-12-31T23:59:59.999Z';
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let location = 'entry';

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-15', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = journeyCheckFailure('J-15', name);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-15', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-15' };
  const names = process.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
    : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) if (process.env[name] !== undefined) selected[name] = process.env[name];
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireJourney(systemRoot && isAbsolute(systemRoot), 'product-environment');
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else {
    selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
  return selected;
}

async function createLoopbackSentinel() {
  let observedRequests = 0;
  let runtimeFault = false;
  let closed = false;
  const server = createServer((_request, response) => {
    observedRequests += 1;
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '21' });
    response.end('AI7_LOOPBACK_SENTINEL');
  });
  server.on('error', () => { runtimeFault = true; });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(journeyCheckFailure('J-15', 'loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  requireJourney(address && typeof address === 'object' && address.address === '127.0.0.1' && address.port > 0, 'loopback-address');
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j15-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
      requireJourney(!runtimeFault, 'loopback-runtime');
    },
  };
}

async function createRendererManager(browser) {
  const guard = (request) => settleOnBrowserDisconnect(browser, request);
  const root = await guard(browser.newBrowserCDPSession());
  const renderers = new Map();
  const pending = new Map();
  let nextId = 1;
  root.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    let response;
    try { response = JSON.parse(message); } catch { return; }
    if (typeof response.id !== 'number') return;
    const key = `${sessionId}:${response.id}`;
    const completion = pending.get(key);
    if (!completion) return;
    pending.delete(key);
    if (response.error) completion.reject(journeyCheckFailure('J-15', 'renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const attach = async (target) => {
    if (renderers.has(target.targetId)) return renderers.get(target.targetId);
    const { sessionId } = await guard(root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }));
    const send = async (method, params = {}) => {
      const id = nextId++;
      const key = `${sessionId}:${id}`;
      const response = new Promise((resolveResponse, rejectResponse) => {
        const timeout = setTimeout(() => {
          pending.delete(key);
          rejectResponse(journeyCheckFailure('J-15', 'renderer-cdp-timeout'));
        }, 60_000);
        timeout.unref();
        pending.set(key, {
          resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
          reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
        });
      });
      await guard(root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }));
      return response;
    };
    const renderer = {
      send,
      evaluate: async (expression) => {
        const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        requireJourney(!response.exceptionDetails, `renderer-evaluate-${location}`);
        return response.result.value;
      },
    };
    renderers.set(target.targetId, renderer);
    await send('Runtime.enable');
    return renderer;
  };
  return {
    list: async () => {
      const targets = (await guard(root.send('Target.getTargets'))).targetInfos.filter((item) => item.type === 'page');
      return Promise.all(targets.map(attach));
    },
  };
}

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-15', name);
}

async function waitForRenderer(manager, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const renderers = await manager.list();
    if (renderers.length === 1) return renderers[0];
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-15', name);
}

async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), name);
}

async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>item.textContent===${JSON.stringify(label)}); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function clickBook(renderer, bookId, name) {
  await assertRenderer(renderer, `(() => { const node=document.querySelector('button[data-book-id=${JSON.stringify(bookId)}]'); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!(input instanceof HTMLInputElement)&&!(input instanceof HTMLTextAreaElement))return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, name);
}

async function createEmptyBook(renderer, title) {
  await click(renderer, '新建图书', 'empty-open');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, 'empty-form');
  await fill(renderer, '#empty-book-title', title, 'empty-title');
  await click(renderer, '复核创建', 'empty-review');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, 'empty-review-ready');
  await click(renderer, '新建图书', 'empty-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-manuscript-state="empty"]')`, 'empty-created', 120_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId`);
  requireJourney(UUID_PATTERN.test(bookId), 'empty-book-id');
  return bookId;
}

// 知识库 › 审阅规范文件 (Issue #427, plan slice S79a): the house's own next version of 文字规范条款, written by the runner —
// AI7's own words, never a manuscript — and handed to the product through J-15's picker control.
const HOUSE_GUIDELINE_NAME = '本社文字规范.txt';
const HOUSE_GUIDELINE = ['本社文字规范（J-15）', '', '1. 指出错字、别字、多字与漏字，给出改正后的文字。', '2. 指出成分残缺与搭配不当，给出通顺的改法。',
  '3. 数字与标点按本社体例手册统一，', '体例手册未写到的，按国家现行规范。', '4. 专名在全书前后写法一致。', '5. 引文与原文核对后再改，不凭记忆改动。'].join('\n');
const KNOWLEDGE_TABS = ['审阅规范文件', '评估方案', '工序与规则', '社级编辑记忆', '范例', '资料库', '外部来源留存'];
const GUIDELINE_TITLES = ['文字规范条款', '体例条款', '线索条款', '事实核查契约', '引用与学术规范条款', '出版风险提示条款', '表达改进条款'];
// 线索条款 and 事实核查契约 are AI7's fixed statements (Issue #427 review): their categories read no clause of theirs, so
// they say so where the others offer 导入新版本….
const GUIDELINE_FIXED = new Map([
  [2, '「情节逻辑与前后一致」把基线分析里的线索变成批注，不按这里的条款找问题。这是 AI7 的固定说明，不能导入新版本。'],
  [3, '「事实核查」按 AI7 固定的事实核查契约执行，不读取这里的条款。这是 AI7 的固定说明，不能导入新版本。'],
]);
/** The 知识库 page as an editor reads it: its tabs, the chosen one, and each guideline card's words. */
const READ_KNOWLEDGE = `(() => {
  const page = document.querySelector('[data-screen="knowledge-base"] .knowledge-base');
  if (!(page instanceof HTMLElement)) return null;
  return {
    tab: page.dataset.knowledgeTab ?? null,
    tabs: Array.from(page.querySelectorAll('[role="tab"]'), (tab) => [tab.textContent, tab.getAttribute('aria-selected')]),
    pending: page.querySelector('.knowledge-pending')?.textContent ?? null,
    guidelines: page.querySelector('.review-guidelines')?.dataset.guidelines ?? null,
    cards: Array.from(page.querySelectorAll('.guideline-card'), (card) => ({
      id: card.dataset.guidelineDocument,
      title: card.querySelector('h3')?.textContent ?? null,
      pill: card.querySelector('.guideline-version-pill')?.textContent ?? null,
      applied: card.querySelector('.guideline-applied')?.textContent ?? null,
      clauses: Array.from(card.querySelectorAll('.guideline-clauses li'), (item) => [item.dataset.clauseId, item.querySelector('.guideline-citations')?.textContent ?? null]),
      versions: Array.from(card.querySelectorAll('.guideline-version-list li'), (item) => item.textContent),
      older: card.querySelector('.guideline-older')?.textContent ?? null,
      fixed: card.querySelector('.guideline-fixed')?.textContent ?? null,
      importable: card.querySelector('[data-guideline-action="import"]') instanceof HTMLButtonElement,
      preview: card.querySelector('.guideline-preview h4')?.textContent ?? null,
      changes: card.querySelector('.guideline-preview-changes')?.textContent ?? null,
      previewClauses: card.querySelectorAll('.guideline-preview li').length,
      refusal: card.querySelector('.guideline-refusal')?.textContent ?? null,
    })),
  };
})()`;
async function readKnowledge(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_KNOWLEDGE).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-15', name);
  error.detail = page;
  throw error;
}
// 知识库 › 资料库 (Issue #427, plan slice S79c): the admitted Public SampleBook `sample1`, collected by the editor as a reference
// book, handed to 放入资料… through the picker control of the relaunched window.
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const LIBRARY_TITLE = '样书一';
const LIBRARY_EMPTY = '资料库里还没有资料。放进来以后，先定归属与学习准入，任务才能把它列进「允许参考」。';
/** 资料库 as an editor reads it: the arrival form, and each item's words, decisions and open choice. */
const READ_LIBRARY = `(() => {
  const root = document.querySelector('[data-screen="knowledge-base"] .library-materials');
  if (!(root instanceof HTMLElement)) return null;
  const preview = root.querySelector('.library-preview');
  const active = document.activeElement;
  return {
    state: root.dataset.library ?? null,
    count: root.dataset.materialCount ?? null,
    empty: root.querySelector('.library-empty')?.textContent ?? null,
    refusal: root.querySelector('.library-refusal')?.textContent ?? null,
    preview: preview === null ? null : {
      heading: preview.querySelector('h3')?.textContent ?? null,
      facts: preview.querySelector('.library-preview-facts')?.textContent ?? null,
      title: preview.querySelector('[data-library-field="title"]')?.value ?? null,
      kinds: Array.from(preview.querySelectorAll('[data-library-choice]'), (input) => [input.value, input.checked]),
      confirmDisabled: preview.querySelector('[data-library-action="confirm-add"]')?.disabled ?? null,
    },
    cards: Array.from(root.querySelectorAll('article.library-material'), (card) => {
      const chooser = card.querySelector('.library-chooser');
      const consequence = card.querySelector('.library-house-consequence');
      return {
        id: card.dataset.materialId,
        attribution: card.dataset.attribution,
        eligibility: card.dataset.eligibility,
        reference: card.dataset.reference,
        decisions: card.dataset.decisions,
        title: card.querySelector('h3')?.textContent ?? null,
        kind: card.querySelector('.library-kind')?.textContent ?? null,
        attributionLine: card.querySelector('.library-attribution')?.textContent ?? null,
        eligibilityLine: card.querySelector('.library-eligibility')?.textContent ?? null,
        referenceLine: card.querySelector('.library-reference')?.textContent ?? null,
        chooser: chooser === null ? null : {
          kind: chooser.classList.contains('library-attribution-chooser') ? 'attribution' : 'eligibility',
          choices: Array.from(chooser.querySelectorAll('[data-library-choice]'), (input) => [input.value, input.checked, input.disabled, input.closest('label')?.textContent ?? null]),
          consequenceShown: consequence instanceof HTMLElement ? !consequence.hidden : null,
          confirmDisabled: chooser.querySelector('[data-library-action^="confirm-"]')?.disabled ?? null,
        },
        history: Array.from(card.querySelectorAll('.library-decision-list > li'), (item) => item.textContent),
      };
    }),
    focus: active instanceof HTMLElement ? { tag: active.tagName, action: active.dataset.libraryAction ?? null, choice: active.dataset.libraryChoice ?? null } : null,
  };
})()`;
async function readLibrary(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_LIBRARY).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-15', name);
  error.detail = page;
  throw error;
}
async function clickSelector(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!(node instanceof HTMLElement)||node.disabled)return false; node.click(); return true; })()`, name);
}
async function pressKey(renderer, key) {
  const codes = { ArrowRight: 39, ArrowLeft: 37, Enter: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: codes[key] });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: codes[key] });
}

async function focusAction(renderer, action, name) {
  await renderer.evaluate(`(() => { const active=document.activeElement; if(active instanceof HTMLElement)active.blur(); return true; })()`);
  for (let count = 0; count < 40; count += 1) {
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab' });
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
    if (await renderer.evaluate(`document.activeElement?.dataset.nativeArtifactAction===${JSON.stringify(action)} && document.activeElement.matches(':focus-visible')`).catch(() => false)) return;
  }
  throw journeyCheckFailure('J-15', name);
}

async function activateFocused(renderer, key) {
  const descriptor = key === 'Enter'
    ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: process.platform === 'darwin' ? 36 : 13, text: '\r', unmodifiedText: '\r' }
    : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: process.platform === 'darwin' ? 49 : 32, text: ' ', unmodifiedText: ' ' };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor });
  const { text: _text, unmodifiedText: _unmodifiedText, ...released } = descriptor;
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...released });
}


// ---- 可复用工序 (Issue #65, plan slice S30; ADR 0087) ----------------------------------------------------------------------
// The capture branch needs a finished Review Run, so it imports the admitted Public SampleBook `sample1` (ADR 0043) through the
// picker into two Books and runs the review categories on the J-04 model adapter over the authored fixture — the local
// deterministic route, no Provider. Its prerequisites are the product's own, as J-13 makes them: the 方案 enabled for each Book,
// and one Main Editorial Role connection whose synthetic credential is saved and removed again, so only its reference is
// recorded. J-15 therefore owns that one credential and its cleanup, through the product while it answers and directly by its
// reference as the last resort.
const REVIEW_FIXTURE_IDENTITY = 'sample1-review-authored';
// Titled to sort before the other Books, so each stands on the library's first page (书库 orders by title).
const CAPTURE_SOURCE_TITLE = 'J15 1 工序来源';
const CAPTURE_TARGET_TITLE = 'J15 2 工序运行';
const PROCEDURE_TITLE = '体例复核';
const PROPOSAL_TITLE = '图注核对';
const PROPOSAL_FILE_NAME = '开发建议.md';
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const CREDENTIAL_CLEANUP_TIMEOUT_MS = 15_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;
const CREDENTIAL_CLEANUP_TIMEOUT = journeyCheckFailure('J-15', 'credential-cleanup-timeout');

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
    throw journeyCheckFailure('J-15', 'credential-cleanup-metadata');
  }
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(databasePath)) === databasePath,
    'credential-cleanup-metadata-file');
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    throw journeyCheckFailure('J-15', 'credential-cleanup-metadata');
  }
  try {
    database.exec('PRAGMA query_only = ON;');
    // The terminal version the service stamps, as J-13 reads it; this pin moves with whatever revision a later slice takes.
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 63, 'credential-cleanup-metadata-version');
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
    if (error instanceof Error && error.message.startsWith('J-15/')) throw error;
    throw journeyCheckFailure('J-15', 'credential-cleanup-metadata');
  } finally {
    database.close();
  }
}

/**
 * Exact `sample1` through the import flow, as a new Book with its first manuscript; the Book's identity. The second import names
 * the new Book as a distinct intended work, as J-09 does: the same source is already a Book here.
 */
async function importSample1(renderer, title, distinct, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await click(renderer, '导入稿件', `${name}-start`);
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${name}-target`);
  const target = distinct ? '新建图书（作为不同作品）' : '新建图书';
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label=${JSON.stringify(target)}]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-target-explicit`);
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, `${name}-relationship`);
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-relationship-explicit`);
  await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, `${name}-title-screen`);
  await assertRenderer(renderer, `document.querySelector('[data-source-sha256]')?.textContent===${JSON.stringify(SAMPLE1_SHA256)}`, `${name}-exact-source`);
  await fill(renderer, '#book-title', title, `${name}-title`);
  await click(renderer, '确认书名并复核', `${name}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, `${name}-review-ready`);
  await waitFor(renderer, `!document.querySelector('#accept-import-degradation')&&Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='新建图书并导入稿件'&&!button.disabled)`, `${name}-review-clean`);
  await click(renderer, '新建图书并导入稿件', `${name}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="imported"] .book-overview[data-manuscript-state="populated"]')`, `${name}-completed`, 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, `${name}-acknowledged`, 180_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId ?? null`);
  requireJourney(UUID_PATTERN.test(bookId ?? ''), `${name}-book-identity`);
  return bookId;
}

/** A Book's ②B 审阅 from the library: its manuscript first, then 工作 › 审阅, as the editor reaches it. */
async function openBookReview(renderer, bookId, name) {
  await clickBook(renderer, bookId, `${name}-book`);
  await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookId)}]')`, `${name}-manuscript`, 120_000);
  await assertRenderer(renderer, `(() => { const button=document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"] button[data-work-destination="review"]'); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, `${name}-entry`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-review"] .book-review .review-workspace-card')`, `${name}-card`, 60_000);
}

/** From ②B 审阅 back to 书库: its 工作概览, then the library. */
async function leaveReviewToLibrary(renderer, name) {
  await click(renderer, '工作概览', `${name}-overview`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview')`, `${name}-overview-ready`);
  await click(renderer, '返回图书列表', `${name}-library`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
}

/** The 方案 enabled for one Book on its 工作概览, as every Book a Review Run executes for has it. */
async function enableProfileForBook(renderer, bookId, name) {
  await clickBook(renderer, bookId, `${name}-book`);
  await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookId)}]')`, `${name}-manuscript`, 120_000);
  await click(renderer, '返回图书工作概览', `${name}-overview`);
  await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, `${name}-enable-ready`);
  await click(renderer, '审阅并为本图书启用 Revision 2', `${name}-enable`);
  await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, `${name}-enabled`, 60_000);
  await click(renderer, '返回图书列表', `${name}-library`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
}

/** Prepare a Review Run on the open 审阅 sheet, start it from the drawer, and wait for it to settle; its projection. */
async function startPreparedReview(renderer, name) {
  await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='prepared'`, `${name}-prepared`, 180_000);
  const prepared = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
  requireJourney(prepared?.state === 'prepared' && UUID_PATTERN.test(prepared.reviewRunId ?? ''), `${name}-prepared-run`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(prepared.reviewRunId)} && document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready'`, `${name}-drawer`);
  await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', `${name}-start`);
  await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='settled'`, `${name}-settled`, 300_000);
  await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', `${name}-drawer-close`);
  await waitFor(renderer, `document.body.dataset.taskDrawer !== 'open'`, `${name}-drawer-closed`);
  return (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
}

/** The capture sheet as an editor reads it. */
const READ_CAPTURE = `(() => {
  const dialog = document.querySelector('dialog.procedure-capture');
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return null;
  return {
    kind: dialog.dataset.captureKind ?? null,
    kept: dialog.dataset.captureKept ?? null,
    steps: Array.from(dialog.querySelectorAll('[data-capture-step]'), (label) => [label.dataset.captureStep, label.dataset.captureEligible, label.querySelector('input')?.checked ?? null, label.querySelector('.procedure-capture-step-text')?.textContent ?? null]),
    kinds: Array.from(dialog.querySelectorAll('[data-capture-kind]'), (label) => [label.dataset.captureKind, label.querySelector('input')?.disabled ?? null, label.querySelector('input')?.checked ?? null]),
    why: dialog.querySelector('.procedure-capture-why p')?.textContent ?? null,
    extract: Array.from(dialog.querySelectorAll('.procedure-capture-extract li'), (item) => item.textContent),
    notSaved: Array.from(dialog.querySelectorAll('.procedure-capture-not-saved li'), (item) => item.textContent),
    procedureShown: !dialog.querySelector('.procedure-capture-procedure')?.hidden,
    proposalShown: !dialog.querySelector('.procedure-capture-proposal')?.hidden,
    affected: dialog.querySelector('[data-capture-field="affected-procedure"]')?.value ?? null,
    focused: document.activeElement === dialog.querySelector('h3'),
  };
})()`;

/** 知识库 › 工序与规则's 可复用工序 and 开发建议 as an editor reads them. */
const READ_PROCEDURES = `(() => {
  const procedures = document.querySelector('.knowledge-captured-procedures');
  const proposals = document.querySelector('.knowledge-developer-proposals');
  if (!(procedures instanceof HTMLElement) || !(proposals instanceof HTMLElement)) return null;
  return {
    count: procedures.dataset.procedureCount ?? null,
    proposalCount: proposals.dataset.proposalCount ?? null,
    procedures: Array.from(procedures.querySelectorAll('article.captured-procedure'), (card) => ({
      id: card.dataset.procedureId,
      runnable: card.dataset.procedureRunnable,
      title: card.querySelector('h4')?.textContent ?? null,
      versions: Array.from(card.querySelectorAll('li.captured-procedure-version'), (item) => {
        const pill = item.querySelector('.status-pill');
        return {
          version: item.dataset.version, state: item.dataset.versionState, pill: pill?.textContent ?? null,
          pillBorder: pill instanceof HTMLElement ? getComputedStyle(pill).borderTopStyle : null,
          steps: Array.from(item.querySelectorAll('.captured-procedure-steps li'), (step) => step.textContent),
          source: item.querySelector('.captured-procedure-source')?.textContent ?? null,
          runs: item.querySelector('.captured-procedure-runs')?.textContent ?? null,
          validation: item.querySelector('.captured-procedure-validation')?.dataset.validationPasses ?? null,
          guidelines: Array.from(item.querySelectorAll('.captured-procedure-guideline'), (line) => line.textContent),
          actions: Array.from(item.querySelectorAll('.captured-procedure-version-actions [data-procedure-action]'), (button) => button.dataset.procedureAction),
        };
      }),
      run: card.querySelector('[data-procedure-action="run"]') instanceof HTMLButtonElement,
    })),
    proposals: Array.from(proposals.querySelectorAll('article.developer-proposal'), (card) => ({
      title: card.querySelector('h4')?.textContent ?? null,
      versions: Array.from(card.querySelectorAll('li.developer-proposal-version'), (item) => [item.dataset.proposalVersion, item.dataset.proposalFiles]),
    })),
  };
})()`;
async function readProcedures(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_PROCEDURES).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-15', name);
  error.detail = page;
  throw error;
}
async function readCapture(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_CAPTURE).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-15', name);
  error.detail = page;
  throw error;
}
async function openProcedures(renderer, name) {
  await click(renderer, '知识库', `${name}-knowledge`);
  await readKnowledge(renderer, (page) => page.guidelines === 'ready', `${name}-knowledge-ready`);
  await click(renderer, '工序与规则', `${name}-rules`);
}
const STATUS_TEXT = `(document.querySelector('#persistence-status')?.textContent ?? '')`;

async function requireRetainedCarrier(dataRoot) {
  let current = dataRoot;
  for (const segment of ['native-artifacts', 'sha256', PROFILE_DIGEST.slice(0, 2), PROFILE_DIGEST]) {
    current = resolve(current, segment);
    const metadata = await lstat(current);
    requireJourney(metadata.isDirectory() && !metadata.isSymbolicLink() && (await realpath(current)) === current, 'retained-directory');
  }
  const carrier = resolve(current, 'package.json');
  const metadata = await lstat(carrier);
  const bytes = await readFile(carrier);
  requireJourney(
    metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(carrier)) === carrier &&
      bytes.length === PROFILE_BYTES && createHash('sha256').update(bytes).digest('hex') === PROFILE_DIGEST,
    'retained-carrier',
  );
}

async function constructPredecessorV12(dataRoot, bookId) {
  const databasePath = resolve(dataRoot, 'store', 'ai7.sqlite');
  const metadata = await lstat(databasePath);
  requireJourney(
    metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(databasePath)) === databasePath,
    'predecessor-v12-database',
  );
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN IMMEDIATE;
      DROP TABLE developer_capability_proposal_exports;
      DROP TABLE developer_capability_proposals;
      DROP TABLE review_run_procedure_pins;
      DROP TABLE captured_procedure_states;
      DROP TABLE captured_procedure_versions;
      DROP TABLE captured_procedures;
      DROP TABLE dialogue_conversions;
      DROP TABLE dialogue_attempt_outcomes;
      DROP TABLE dialogue_harness_spans;
      DROP TABLE dialogue_execution_bindings;
      DROP TABLE dialogue_attempts;
      DROP TABLE dialogue_tasks;
      DROP TABLE evaluation_initial_drafts;
      DROP TABLE database_merge_books;
      DROP TABLE database_merges;
      DROP TABLE database_replacements;
      DROP TABLE scheduled_backup_removals;
      DROP TABLE scheduled_backups;
      DROP TABLE backup_preferences;
      DROP TABLE database_export_receipts;
      DROP TABLE database_export_approvals;
      DROP TABLE database_export_preparations;
      DROP TABLE store_versions;
      DROP TABLE series_knowledge_conflicts;
      DROP TABLE series_knowledge_promotions;
      DROP TABLE series_knowledge_revisions;
      DROP TABLE series_knowledge_candidates;
      DROP TABLE series_knowledge_items;
      DROP TABLE series_membership_changes;
      DROP TABLE series;
      DROP TABLE evaluation_preferences;
      DROP TABLE publication_actuals;
      DROP TABLE learning_eligibility_decisions;
      DROP TABLE proposal_decision_feedback;
      DROP TABLE analysis_feedback_signals;
      DROP TABLE evaluation_record_entries;
      DROP TABLE evaluation_records;
      DROP TABLE library_material_decisions;
      DROP TABLE library_materials;
      DROP TABLE review_guideline_versions;
      DROP TABLE book_people_versions;
      DROP TABLE maintenance_case_revisions;
      DROP TABLE maintenance_errata_versions;
      DROP TABLE maintenance_cases;
      DROP TABLE production_document_origin_readings;
      DROP TABLE book_delivery_package_export_files;
      DROP TABLE book_delivery_package_exports;
      DROP TABLE production_document_phase_transitions;
      DROP TABLE production_document_workflow_instances;
      DROP TABLE book_delivery_package_versions;
      DROP TABLE production_document_deliveries;
      DROP TABLE production_document_type_decisions;
      DROP TABLE production_document_versions;
      DROP TABLE production_documents;
      DROP TABLE manuscript_reimport_mark_outcomes;
      DROP TABLE manuscript_reimport_group_resolutions;
      DROP TABLE manuscript_reimport_group_members;
      DROP TABLE manuscript_reimport_groups;
      DROP TABLE manuscript_reimport_group_sets;
      DROP TABLE analysis_clarification_answers;
      DROP TABLE analysis_clarification_requests;
      DROP TABLE analysis_unit_checkpoints;
      DROP TABLE default_execution_rule_states;
      DROP TABLE default_execution_rule_versions;
      DROP TABLE default_execution_rules;
      DROP TABLE export_receipts;
      DROP TABLE export_approvals;
      DROP TABLE export_preparations;
      DROP TABLE staged_import_marks;
      DROP TABLE manuscript_block_sources;
      DROP TABLE staged_import_text_box_paragraphs;
      DROP TABLE staged_import_block_sources;
      DROP TABLE import_fidelity_choices;
      DROP TABLE proposal_conflict_outcomes;
      DROP TABLE proposal_conflict_deferrals;
      DROP TABLE proposal_conflict_drafts;
      DROP TABLE publication_events;
      DROP TABLE public_release_permissions;
      DROP TABLE publication_versions;
      DROP TABLE review_reports;
      DROP TABLE quality_signals;
      DROP TABLE review_finding_dispositions;
      DROP TABLE review_findings;
      DROP TABLE review_run_category_events;
      DROP TABLE review_run_authorizations;
      DROP TABLE review_runs;
      DROP TABLE manuscript_effect_receipts;
      DROP TABLE manuscript_effect_dispatches;
      DROP TABLE manuscript_effect_approvals;
      DROP TABLE manuscript_effect_targets;
      DROP TABLE manuscript_effect_intents;
      DROP TABLE proposal_decision_reasons;
      DROP TABLE proposal_item_decisions;
      DROP TABLE proposal_change_items;
      DROP TABLE editorial_mark_replies;
      DROP TABLE editorial_marks;
      DROP TABLE manuscript_entry_positions;
      DROP TABLE analysis_task_outcomes;
      DROP TABLE analysis_unit_results;
      DROP TABLE analysis_result_set_revisions;
      DROP TABLE analysis_result_sets;
      DROP TABLE analysis_plan_adaptations;
      DROP TABLE analysis_harness_spans;
      DROP TABLE analysis_execution_bindings;
      DROP TABLE analysis_execution_attempts;
      DROP TABLE analysis_run_states;
      DROP TABLE analysis_run_records;
      DROP TABLE analysis_run_authorizations;
      DROP TABLE analysis_plan_revisions;
      DROP TABLE analysis_plan_versions;
      DROP TABLE analysis_plan_records;
      DROP TABLE analysis_task_input_checkpoints;
      DROP TABLE analysis_task_intents;
      DROP TABLE run_records;
      DROP TABLE run_authorizations;
      DROP TABLE plan_envelopes;
      DROP TABLE execution_plans;
      DROP TABLE provider_resolution_plans;
      DROP TABLE run_source_scopes;
      DROP TABLE task_artifact_pins;
      DROP TABLE task_manuscript_pins;
      DROP TABLE task_input_checkpoints;
      DROP TABLE task_intents;
      DROP TABLE editorial_workspace_profile_book_pins;
      DROP TABLE editorial_workspace_profile_sidecar_revisions;
    `);
    const skewed = database.prepare(
      `UPDATE native_artifact_book_enablements SET enabled_at = ?
       WHERE book_id = ? AND artifact_id = '@ai7/editorial-workspace-profile'`,
    ).run(FUTURE_SKEWED_ENABLED_AT, bookId);
    requireJourney(skewed.changes === 1, 'predecessor-v12-future-clock-skew');
    database.exec(`
      PRAGMA user_version = 12;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  } finally {
    database.close();
  }
}

async function main() {
  parseJourney();
  let loopback;
  let loopbackAcquisition;
  let browser;
  let browserAcquisition;
  let runRoot;
  let runRootAcquisition;
  let tempParent;
  let dataRoot;
  let electronExecutableForCleanup;
  let cleanupPromise;
  let finalCleanupRequested = false;
  // 可复用工序's Review Runs need a Main Editorial Role connection (Issue #65, S30), so J-15 owns the one synthetic credential
  // and its cleanup as J-13 does: through the product while it answers, and directly by its reference as the last resort.
  let credentialRenderer;
  let credentialMutationReached = false;
  let credentialRemoved = false;
  let credentialReferenceForCleanup;
  let syntheticSecret;
  const closeBrowser = async () => {
    let owned = browser;
    if (owned === undefined && browserAcquisition !== undefined) owned = await browserAcquisition.catch(() => undefined);
    if (owned !== undefined) await owned.close();
    browser = undefined;
    browserAcquisition = undefined;
  };
  const READ_CONNECTION = `window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`;
  const removeCredentialThroughProduct = async () => {
    if (credentialRenderer === undefined || browser === undefined || !browser.isConnected()) return;
    const state = await credentialRenderer.evaluate(READ_CONNECTION);
    if (UUID_PATTERN.test(state?.credentialReference ?? '')) credentialReferenceForCleanup = state.credentialReference;
    if (state === null || state.credentialOperationState === 'missing') {
      credentialRemoved = true;
      return;
    }
    await credentialRenderer.evaluate(`window.ai7.removeModelServiceCredential()`);
    const after = await credentialRenderer.evaluate(READ_CONNECTION);
    credentialRemoved = after === null || after.credentialOperationState === 'missing';
  };
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      let failure;
      if (credentialMutationReached && !credentialRemoved) {
        try { await removeCredentialThroughProduct(); } catch (error) { failure ??= error; }
      }
      await closeBrowser();
      if (credentialMutationReached && !credentialRemoved) {
        try {
          if (credentialReferenceForCleanup === undefined && dataRoot !== undefined && runRoot !== undefined) {
            const recovered = await recoverSyntheticCredentialCleanupState(dataRoot, runRoot);
            if (recovered.kind === 'not-started' || recovered.kind === 'removed') credentialRemoved = true;
            else credentialReferenceForCleanup = recovered.credentialReference;
          }
          if (!credentialRemoved && credentialReferenceForCleanup !== undefined) {
            requireJourney(electronExecutableForCleanup !== undefined, 'credential-direct-cleanup-executable');
            await removeSyntheticCredentialWithElectron(electronExecutableForCleanup, credentialReferenceForCleanup);
            credentialRemoved = true;
          }
        } catch (error) {
          failure ??= error;
        }
      }
      const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
      await ownedLoopback?.close().catch(() => undefined);
      loopback = undefined;
      if (credentialMutationReached && !credentialRemoved) throw failure ?? journeyCheckFailure('J-15', 'credential-cleanup-failed');
      const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
      if (ownedRoot !== undefined) {
        if (syntheticSecret !== undefined && dataRoot !== undefined) {
          try { await assertSecretsAbsentFromDataRoot(dataRoot, [syntheticSecret]); } catch (error) { failure ??= error; }
        }
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j15-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
        await rm(ownedRoot, { recursive: true, force: true });
        runRoot = undefined;
      }
      if (failure !== undefined) throw failure;
    })();
    return cleanupPromise;
  };
  const cancellation = installJourneyCancellationCleanup(cleanup, async () => {
    if (!finalCleanupRequested) await closeBrowser();
  });
  try {
    at('controller-loopback');
    cancellation.throwIfRequested();
    loopbackAcquisition = createLoopbackSentinel();
    loopback = await loopbackAcquisition;
    cancellation.throwIfRequested();

    at('controller-imports');
    const denial = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
    (await import(pathToFileURL(denial).href)).installNodeNetworkDenial();
    const { electronExecutable } = await import('../tools/electron-runtime.mjs');
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j15-e2e-'));
    runRoot = await runRootAcquisition;
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j15-e2e-'), 'temp-root');
    dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    const guidelinePath = resolve(runRoot, HOUSE_GUIDELINE_NAME);
    await writeFile(guidelinePath, HOUSE_GUIDELINE, 'utf8');
    // `extra` carries the capture branch's launch controls (Issue #65, S30): the J-04 model adapter and the Save dialog's answer.
    const launch = async (pickerPath = guidelinePath, extra = []) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
        // J-15's picker serves 导入新版本 of a review guideline document (Issue #427, S79a), and in the window relaunched after
        // it 放入资料… (Issue #427, S79c): one choice per window.
        '--j15-picker-path', pickerPath,
        ...extra,
      ];
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-15', browser, 'launch');
      cancellation.throwIfRequested();
      return createRendererManager(browser);
    };

    at('initial-empty-book');
    let manager = await launch();
    let renderer = await waitForRenderer(manager, 'initial-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'initial-ready');
    // Product readiness is emitted only after ServiceClient accepts the exact dormant-Harness
    // handshake, including zero configured agents, agents, sessions, Providers, tools, and assembled tools.
    await assertRenderer(renderer, `document.documentElement.dataset.ai7ProductReady==='true'`, 'exact-service-readiness-zero-harness');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
    await renderer.send('Page.setBypassCSP', { enabled: false });
    requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'offline-product');
    const bookA = await createEmptyBook(renderer, 'J15 空图书甲');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-state="available-to-install"]')`, 'available-card');
    // Synchronized delta (#332): each of these sections now states its decision rows in its own dl and
    // its digests in a second dl inside one closed 查看技术详情, so reading only the section's
    // direct-child dl would miss 侧车身份 and every SHA-256. The helper below reads both layers, which
    // is what V2-UX-LAYER-008 asks of a Journey: assert the decision reading, and assert that the
    // technical layer still carries the exact value.
    // Synchronized delta (#334): a ceiling's empty fields no longer cost a row each, so `Readable Scope`
    // and the seven other foldable fields are read by their absence and by the one row that names them —
    // `权限上限` when a revision declares none of the eight, `未声明` when it declares some. `Model Role`
    // is not one of the eight and stays at full rank. Neither Revision is in force or on offer here, so
    // nothing is past and both sections render in place.
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.native-artifact-card');
      const text=card?.textContent??'';
      const facts=(root)=>{
        const result={};
        for(const term of root?.querySelectorAll(':scope > dl.native-artifact-facts > dt, :scope > details.technical-details > dl > dt')??[]){
          result[term.textContent??'']=term.nextElementSibling?.textContent??'';
        }
        return result;
      };
      const sidecar=card?.querySelector(':scope > .native-artifact-authority');
      const revision1=card?.querySelector('[data-authority-sidecar-revision="1"]');
      const revision2=card?.querySelector('[data-authority-sidecar-revision="2"]');
      const sidecarFacts=facts(sidecar);
      const revision1Facts=facts(revision1);
      const revision2Facts=facts(revision2);
      return card?.dataset.nativeArtifactIdentity==='@ai7/editorial-workspace-profile' &&
        card.dataset.authoritySidecarIdentity===${JSON.stringify(SIDECAR_ID)} &&
        !card.dataset.authoritySidecarActiveRevision && !card.dataset.authoritySidecarOfferedRevision &&
        text.includes('DSH Profile') && text.includes('1.0.0') && text.includes('仓库内置') && text.includes('AI7 root license') &&
        text.includes('config/native-artifact-sources/editorial-workspace-profile/package.json') && text.includes('263 bytes') &&
        text.includes(${JSON.stringify(PROFILE_DIGEST)}) && text.includes('声明式 · Provider-free · 兼容') &&
        sidecarFacts['侧车身份']===${JSON.stringify(SIDECAR_ID)} && sidecarFacts['当前生效 Revision']==='空（本图书未启用）' &&
        sidecarFacts['可审阅后继']==='空（无）' && sidecarFacts['本图书 pin 历史']==='空（无）' &&
        revision1Facts['规范字节']==='588 bytes' && revision1Facts['SHA-256']===${JSON.stringify(SIDECAR_REVISION_1_DIGEST)} &&
        revision1Facts['模型角色']==='Main Editorial Role' &&
        revision1Facts['权限上限']==='未声明任何权限（8 项均为空）' && revision1Facts['未声明']===undefined &&
        revision1Facts['AI7 能力']===undefined && revision1Facts['可读范围']===undefined &&
        revision1Facts['AI7 正式应用']===undefined && !revision1.textContent.includes('空（无）') &&
        revision2Facts['规范字节']==='660 bytes' && revision2Facts['SHA-256']===${JSON.stringify(SIDECAR_REVISION_2_DIGEST)} &&
        revision2Facts['模型角色']==='Main Editorial Role' &&
        revision2Facts['可读范围']==='current-book-primary-manuscript-revision、current-book-source-version' &&
        revision2Facts['未声明']==='AI7 能力、模型提供方绑定、凭据访问、网络访问、受控动作、后台分析登记、AI7 正式应用' &&
        revision2Facts['权限上限']===undefined && revision2Facts['AI7 能力']===undefined &&
        !revision2.textContent.includes('空（无）') &&
        revision1.parentElement===sidecar && revision2.parentElement===sidecar && !text.includes('其他 Revision') &&
        text.includes('不创建 Task、Plan、Run 或 Session') && text.includes('不读取图书、稿件或来源内容') &&
        text.includes('Revision 2 仅扩大可请求范围，不创建实际读取或运行权限') &&
        text.includes('不授予 Provider、凭据、网络、Effect、Enrollment 或 Apply 权限') &&
        Boolean(card.querySelector('[data-native-artifact-action="install-disabled"]')) && !card.querySelector('[data-native-artifact-action="enable-current-book"]') &&
        window.ai7.inspectEditorialWorkspaceProfile.length===0 && window.ai7.installEditorialWorkspaceProfile.length===0 && window.ai7.enableEditorialWorkspaceProfile.length===0 &&
        !Object.keys(window.ai7).some((key)=>/provider|session/i.test(key));
    })()`, 'exact-authority-card');

    at('install-disabled');
    await focusAction(renderer, 'install-disabled', 'install-keyboard-focus');
    await activateFocused(renderer, 'Enter');
    await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='busy' || document.querySelector('[data-native-artifact-state="installed-disabled"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'install-keyboard-activation', 5_000);
    at('install-effect');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-state="installed-disabled"] [data-native-artifact-action="enable-current-book"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'installed-disabled-settled', 120_000);
    await assertRenderer(renderer, `Boolean(document.querySelector('[data-native-artifact-state="installed-disabled"] [data-native-artifact-action="enable-current-book"]'))`, 'installed-disabled');
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('[data-native-artifact-state="installed-disabled"]');
      return !document.querySelector('[data-native-artifact-action="install-disabled"]') &&
        !card?.dataset.authoritySidecarActiveRevision && card?.dataset.authoritySidecarOfferedRevision==='2' &&
        card.querySelector('[data-native-artifact-action="enable-current-book"]')?.textContent==='审阅并为本图书启用 Revision 2';
    })()`, 'separate-enable-only-after-install');
    await requireRetainedCarrier(dataRoot);

    at('enable-current-book');
    await focusAction(renderer, 'enable-current-book', 'enable-keyboard-focus');
    await activateFocused(renderer, ' ');
    await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='busy' || document.querySelector('[data-native-artifact-state="enabled-for-book"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'enable-keyboard-activation', 5_000);
    at('enable-effect');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-state="enabled-for-book"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'enabled-book-a-settled', 120_000);
    await assertRenderer(renderer, `Boolean(document.querySelector('[data-native-artifact-state="enabled-for-book"]'))`, 'enabled-book-a');
    // Synchronized delta (#334): the pin history is a list in both layers, one `li` per pin, and the
    // digest that used to ride in the decision reading now sits beside its exact instant in the
    // disclosure. Reading the two lists asserts the same fact the joined string did — this Book pinned
    // Revision 2 and nothing else — and that the digest is still there, per pin, to copy.
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.native-artifact-card');
      const sidecar=card?.querySelector(':scope > .native-artifact-authority');
      const pins=(selector)=>Array.from(sidecar?.querySelectorAll(selector)??[],(item)=>item.textContent??'');
      const decisionPins=pins(':scope > dl.native-artifact-facts li[data-sidecar-pin]');
      const exactPins=pins(':scope > details.technical-details li[data-sidecar-pin]');
      return !document.querySelector('.native-artifact-actions button') && card?.textContent.includes('已安装 · 已为本图书启用') &&
        card.dataset.authoritySidecarActiveRevision==='2' && !card.dataset.authoritySidecarOfferedRevision &&
        decisionPins.length===1 && decisionPins[0].startsWith('Revision 2 · ') &&
        !decisionPins[0].includes(${JSON.stringify(SIDECAR_REVISION_2_DIGEST)}) &&
        exactPins.length===1 && exactPins[0].startsWith('Revision 2 · ' + ${JSON.stringify(SIDECAR_REVISION_2_DIGEST)} + ' · ') &&
        exactPins[0].endsWith('Z');
    })()`, 'enabled-no-repeat-action');
    await closeBrowser();

    at('restart-persistence');
    await constructPredecessorV12(dataRoot, bookA);
    manager = await launch();
    renderer = await waitForRenderer(manager, 'restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    at('restart-open-book-a');
    await clickBook(renderer, bookA, 'open-book-a-after-restart');
    await waitFor(
      renderer,
      `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}] [data-authority-sidecar-active-revision="1"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`,
      'book-a-v12-migration',
      120_000,
    );
    at('restart-enabled-book-a');
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}] .native-artifact-card');
      const sidecar=card?.querySelector(':scope > .native-artifact-authority');
      const pins=(selector)=>Array.from(sidecar?.querySelectorAll(selector)??[],(item)=>item.textContent??'');
      const decisionPins=pins(':scope > dl.native-artifact-facts li[data-sidecar-pin]');
      const exactPins=pins(':scope > details.technical-details li[data-sidecar-pin]');
      return card?.dataset.nativeArtifactState==='enabled-for-book' &&
        card.dataset.authoritySidecarActiveRevision==='1' && card.dataset.authoritySidecarOfferedRevision==='2' &&
        decisionPins.length===1 && decisionPins[0].startsWith('Revision 1 · ') &&
        exactPins.length===1 && exactPins[0].startsWith('Revision 1 · ' + ${JSON.stringify(SIDECAR_REVISION_1_DIGEST)} + ' · ') &&
        exactPins[0].endsWith('Z') && !card.textContent.includes('其他 Revision') &&
        card.querySelector('[data-native-artifact-action="enable-current-book"]')?.textContent==='审阅并追加 Revision 2' &&
        card.lastElementChild?.classList.contains('native-artifact-actions');
    })()`, 'book-a-v12-migrated-revision-1');

    at('enable-current-book');
    await focusAction(renderer, 'enable-current-book', 'successor-keyboard-focus');
    await activateFocused(renderer, 'Enter');
    await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='busy' || document.querySelector('[data-authority-sidecar-active-revision="2"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'successor-keyboard-activation', 5_000);
    at('enable-effect');
    await waitFor(renderer, `document.querySelector('[data-authority-sidecar-active-revision="2"]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`, 'successor-settled', 120_000);
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.native-artifact-card');
      const sidecar=card?.querySelector(':scope > .native-artifact-authority');
      const pins=(selector)=>Array.from(sidecar?.querySelectorAll(selector)??[],(item)=>item.textContent??'');
      const decisionPins=pins(':scope > dl.native-artifact-facts li[data-sidecar-pin]');
      const exactPins=pins(':scope > details.technical-details li[data-sidecar-pin]');
      // Synchronized delta (#334): both pins read as list items in each layer, in the order this Book
      // pinned them, and Revision 1 — neither in force nor on offer any more — is one step away inside
      // the counted disclosure, with its ceiling and its digest still in the record.
      const past=card?.querySelector('[data-authority-sidecar-revision="1"]')?.closest('details');
      return card?.dataset.authoritySidecarActiveRevision==='2' && !card.dataset.authoritySidecarOfferedRevision &&
        !card.querySelector('.native-artifact-actions button') &&
        decisionPins.length===2 && decisionPins[0].startsWith('Revision 1 · ') && decisionPins[1].startsWith('Revision 2 · ') &&
        exactPins.length===2 &&
        exactPins[0].startsWith('Revision 1 · ' + ${JSON.stringify(SIDECAR_REVISION_1_DIGEST)} + ' · ') &&
        exactPins[1].startsWith('Revision 2 · ' + ${JSON.stringify(SIDECAR_REVISION_2_DIGEST)} + ' · ') &&
        exactPins.every((line)=>line.endsWith('Z')) &&
        card.querySelector('[data-authority-sidecar-revision="2"]')?.parentElement===sidecar &&
        past?.parentElement===sidecar && past.querySelector(':scope > summary')?.textContent==='其他 Revision（1）' &&
        past.querySelector('[data-authority-sidecar-revision="1"] .technical-identity')?.textContent===${JSON.stringify(SIDECAR_REVISION_1_DIGEST)};
    })()`, 'successor-preserves-revision-1');
    await closeBrowser();

    at('restart-persistence');
    manager = await launch();
    renderer = await waitForRenderer(manager, 'restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    at('restart-open-book-a');
    await clickBook(renderer, bookA, 'open-book-a-after-restart');
    await waitFor(
      renderer,
      `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]') || document.querySelector('#persistence-status')?.dataset.tone==='error'`,
      'book-a-route-after-restart',
      120_000,
    );
    await assertRenderer(renderer, `Boolean(document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]'))`, 'book-a-overview-after-restart');
    at('restart-enabled-book-a');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}] [data-native-artifact-state]')`, 'book-a-after-restart');
    const restartedLifecycle = await renderer.evaluate(`document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}] [data-native-artifact-state]')?.dataset.nativeArtifactState`);
    if (restartedLifecycle !== 'enabled-for-book') {
      at(restartedLifecycle === 'installed-disabled' ? 'restart-book-a-disabled' : 'restart-book-a-unavailable');
      requireJourney(false, 'book-a-enabled-after-restart');
    }
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}] .native-artifact-card');
      const sidecar=card?.querySelector(':scope > .native-artifact-authority');
      const pins=(selector)=>Array.from(sidecar?.querySelectorAll(selector)??[],(item)=>item.textContent??'');
      const decisionPins=pins(':scope > dl.native-artifact-facts li[data-sidecar-pin]');
      const exactPins=pins(':scope > details.technical-details li[data-sidecar-pin]');
      return card?.dataset.authoritySidecarActiveRevision==='2' && !card.dataset.authoritySidecarOfferedRevision &&
        decisionPins.length===2 && decisionPins[0].startsWith('Revision 1 · ') && decisionPins[1].startsWith('Revision 2 · ') &&
        exactPins.length===2 &&
        exactPins[0].includes(${JSON.stringify(SIDECAR_REVISION_1_DIGEST)}) &&
        exactPins[1].includes(${JSON.stringify(SIDECAR_REVISION_2_DIGEST)});
    })()`, 'book-a-sidecar-history-after-restart');
    await click(renderer, '返回图书列表', 'return-after-book-a');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'landing-before-book-b');

    at('second-book-disabled');
    const bookB = await createEmptyBook(renderer, 'J15 空图书乙');
    requireJourney(bookB !== bookA, 'distinct-books');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}] [data-native-artifact-state="installed-disabled"]')`, 'book-b-disabled-after-restart');
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}] .native-artifact-card');
      return Boolean(card?.querySelector('[data-native-artifact-action="enable-current-book"]')) &&
        !card.querySelector('[data-native-artifact-action="install-disabled"]') &&
        !card.dataset.authoritySidecarActiveRevision && card.dataset.authoritySidecarOfferedRevision==='2' &&
        card.querySelector('[data-native-artifact-action="enable-current-book"]')?.textContent==='审阅并为本图书启用 Revision 2';
    })()`, 'book-b-separate-enablement');

    at('accessibility-reflow-forced-colors');
    await focusAction(renderer, 'enable-current-book', 'book-b-keyboard-focus');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(renderer, `document.documentElement.scrollWidth<=document.documentElement.clientWidth+2 && getComputedStyle(document.querySelector('.native-artifact-facts')).gridTemplateColumns.split(' ').length===1`, 'zoom-reflow');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.native-artifact-card')).boxShadow==='none' && getComputedStyle(document.querySelector('.native-artifact-card')).borderStyle!=='none' && getComputedStyle(document.querySelector('.native-artifact-status')).borderStyle!=='none'`, 'forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    // ---- 知识库 › 审阅规范文件 (Issue #427, plan slice S79a; editor-surfaces §8.4, V2-UX-KB-001 to KB-003) ------------------
    at('knowledge-guidelines');
    // 知识库 from 书库: its seven classes as tabs, opening at 审阅规范文件 — every guideline document the review categories apply,
    // at AI7's built-in first version, with its numbered clauses and a version no review has used yet.
    await click(renderer, '返回图书列表', 'knowledge-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'knowledge-landing');
    await click(renderer, '知识库', 'knowledge-open');
    const opened = await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'knowledge-guidelines-ready');
    requireJourney(opened.tab === 'guidelines' && JSON.stringify(opened.tabs) === JSON.stringify(KNOWLEDGE_TABS.map((label, index) => [label, String(index === 0)])) &&
      JSON.stringify(opened.cards.map((card) => card.title)) === JSON.stringify(GUIDELINE_TITLES) && opened.cards.every((card) => card.pill === '第 1 版 · AI7 内置默认') &&
      opened.cards[0].applied === '用于：错别字与规范用语' && opened.cards[0].clauses.length === 4 &&
      opened.cards[0].clauses.every(([clauseId, citations], index) => clauseId === `typos-and-usage/${index + 1}` && citations === '未被引用') &&
      JSON.stringify(opened.cards[0].versions) === JSON.stringify(['第 1 版 · AI7 内置默认 · 内置 · 4 条 · 还没有审阅用过']) && opened.cards.every((card) => card.older === null) &&
      opened.cards.every((card, index) => card.fixed === (GUIDELINE_FIXED.get(index) ?? null) && card.importable === !GUIDELINE_FIXED.has(index)),
    'knowledge-guidelines-cards', opened);
    // A class a later slice brings says what it will hold and that it is not there yet.
    await click(renderer, '社级编辑记忆', 'knowledge-memory-tab');
    const memory = await readKnowledge(renderer, (page) => page.tab === 'memory', 'knowledge-memory-tab-open');
    requireJourney(memory.pending === '尚未提供：社级编辑记忆还没有接通。' && memory.cards.length === 0, 'knowledge-pending', memory);
    await click(renderer, '审阅规范文件', 'knowledge-back-to-guidelines');
    await readKnowledge(renderer, (page) => page.tab === 'guidelines' && page.guidelines === 'ready', 'knowledge-guidelines-again');

    at('knowledge-guideline-import');
    // 导入新版本… on 文字规范条款: the picker's file is read as the next version would read it — five clauses, how they differ —
    // and 确认导入 records 第 2 版, issued by the house; version 1 stays listed beneath it.
    await assertRenderer(renderer, `(() => { const start=document.querySelector('[data-guideline-document="ai7-builtin/typos-and-usage"] [data-guideline-action="import"]'); if(!(start instanceof HTMLButtonElement)||start.disabled||start.textContent!=='导入新版本…')return false; start.click(); return true; })()`, 'knowledge-import-start');
    const previewed = await readKnowledge(renderer, (page) => page.cards[0]?.preview !== null, 'knowledge-import-preview');
    requireJourney(previewed.cards[0].preview === '将导入为《文字规范条款》第 2 版' &&
      previewed.cards[0].changes === `${HOUSE_GUIDELINE_NAME} · 5 条 · 与第 1 版相比：改动 4 条，新增 1 条，删去 0 条` && previewed.cards[0].previewClauses === 5 &&
      previewed.cards[0].pill === '第 1 版 · AI7 内置默认', 'knowledge-import-preview-words', previewed.cards[0]);
    await waitFor(renderer, `document.activeElement === document.querySelector('[data-guideline-document="ai7-builtin/typos-and-usage"] .guideline-preview h4')`, 'knowledge-import-preview-focused', 10_000);
    await assertRenderer(renderer, `(() => { const confirm=document.querySelector('[data-guideline-document="ai7-builtin/typos-and-usage"] [data-guideline-action="confirm"]'); if(!(confirm instanceof HTMLButtonElement)||confirm.disabled)return false; confirm.click(); return true; })()`, 'knowledge-import-confirm');
    const importedPage = await readKnowledge(renderer, (page) => page.cards[0]?.pill === '第 2 版 · 本社', 'knowledge-imported');
    requireJourney(importedPage.cards[0].preview === null && importedPage.cards[0].clauses.length === 5 && importedPage.cards[0].versions.length === 2 &&
      importedPage.cards[0].versions[0].startsWith('第 2 版 · 本社 · 导入于 ') && importedPage.cards[0].versions[0].endsWith(` · ${HOUSE_GUIDELINE_NAME} · 5 条 · 还没有审阅用过`) &&
      importedPage.cards[0].versions[1] === '第 1 版 · AI7 内置默认 · 内置 · 4 条 · 还没有审阅用过' &&
      importedPage.cards.slice(1).every((card) => card.pill === '第 1 版 · AI7 内置默认'), 'knowledge-imported-card', importedPage.cards[0]);
    await waitFor(renderer, `(document.querySelector('#persistence-status')?.textContent ?? '')==='已导入《文字规范条款》第 2 版；新准备的审阅按第 2 版；已准备的审阅仍用原版本。'`, 'knowledge-imported-status', 10_000);
    const service = await renderer.evaluate(`window.ai7.inspectReviewGuidelines().then((projection)=>projection.documents.map((document)=>[document.documentId, document.currentOrdinal, document.issuer]))`);
    requireJourney(JSON.stringify(service?.[0]) === JSON.stringify(['ai7-builtin/typos-and-usage', 2, '本社']) && service.slice(1).every(([, ordinal]) => ordinal === 1), 'knowledge-imported-service', service);

    at('j14-knowledge-keyboard');
    // Without a pointer: the chosen tab takes focus, ArrowRight and ArrowLeft move between the classes, and each moved to is
    // chosen with its focus visible.
    await assertRenderer(renderer, `(() => { const tab=document.querySelector('#knowledge-tab-guidelines'); if(!(tab instanceof HTMLButtonElement))return false; tab.focus(); return document.activeElement===tab; })()`, 'knowledge-tab-focus');
    await pressKey(renderer, 'ArrowRight');
    await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab==='evaluation' && document.activeElement?.id==='knowledge-tab-evaluation' && document.activeElement.getAttribute('aria-selected')==='true'`, 'knowledge-arrow-right', 10_000);
    await pressKey(renderer, 'ArrowLeft');
    await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab==='guidelines' && document.activeElement?.id==='knowledge-tab-guidelines' && document.querySelector('.review-guidelines')?.dataset.guidelines==='ready'`, 'knowledge-arrow-left', 10_000);

    at('j14-knowledge-reflow-forced-colors');
    // At 200% the tabs, the cards and their clauses reflow into the width; under forced colours a card keeps its border and the
    // chosen tab its heavier underline.
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[document.querySelector('.knowledge-tabs'), ...document.querySelectorAll('.guideline-card')]; return parts.length===8 && parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2; })()`, 'knowledge-reflow', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const card = document.querySelector('.guideline-card');
      const chosen = document.querySelector('#knowledge-tab-guidelines');
      const other = document.querySelector('#knowledge-tab-evaluation');
      return card instanceof HTMLElement && getComputedStyle(card).borderTopStyle === 'solid' &&
        chosen instanceof HTMLElement && other instanceof HTMLElement && parseFloat(getComputedStyle(chosen).borderBottomWidth) >= 3 &&
        parseFloat(getComputedStyle(chosen).borderBottomWidth) > parseFloat(getComputedStyle(other).borderBottomWidth);
    })()`, 'knowledge-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('knowledge-guideline-restart');
    // A restart keeps the house's version; keep this window's picker for the subsequent guideline imports.
    await closeBrowser();
    manager = await launch();
    renderer = await waitForRenderer(manager, 'knowledge-restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'knowledge-restart-ready');
    await click(renderer, '知识库', 'knowledge-restart-open');
    const restarted = await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'knowledge-restart-ready-page');
    requireJourney(restarted.cards[0].pill === '第 2 版 · 本社' && restarted.cards[0].versions.length === 2 && restarted.cards[0].clauses.length === 5, 'knowledge-restart-kept', restarted.cards[0]);

    at('knowledge-guideline-import');
    // Real picker/service/UI pages: later clauses remain reachable in preview and after import; history reaches version 1.
    const cardSelector = '[data-guideline-document="ai7-builtin/typos-and-usage"]';
    const activateGuideline = async (selector, name) => assertRenderer(renderer, `(() => {
      const button=document.querySelector(${JSON.stringify(`${cardSelector} ${selector}`)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.focus(); button.click(); return true;
    })()`, name);
    for (let version = 3; version <= 8; version += 1) {
      await writeFile(guidelinePath, Array.from({ length: 9 }, (_, index) => `${index + 1}. 检查第 ${version} 版的第 ${index + 1} 项规范。`).join('\n'), 'utf8');
      // The existing picker control supplies one choice per window; restart rather than adding a repeatable bypass.
      if (version > 3) {
        await closeBrowser();
        manager = await launch();
        renderer = await waitForRenderer(manager, 'knowledge-page-window');
        await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'knowledge-page-ready');
        await click(renderer, '知识库', 'knowledge-page-open');
        await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'knowledge-page-loaded');
      }
      await activateGuideline('[data-guideline-action="import"]', 'knowledge-page-import-start');
      await waitFor(renderer, `document.querySelector(${JSON.stringify(`${cardSelector} .guideline-preview`)})?.dataset.guidelinePreview==='${version}'`, 'knowledge-page-preview');
      if (version === 8) {
        await activateGuideline('.guideline-preview [data-guideline-action="clauses-next"]', 'knowledge-preview-next');
        await waitFor(renderer, `(() => { const area=document.querySelector(${JSON.stringify(`${cardSelector} .guideline-preview`)}); return area?.querySelectorAll('li').length===1 && area.querySelector('li')?.value===9 && document.activeElement===area.querySelector('h4'); })()`, 'knowledge-preview-last-focus');
        await activateGuideline('.guideline-preview [data-guideline-action="clauses-previous"]', 'knowledge-preview-previous');
        await waitFor(renderer, `(() => { const area=document.querySelector(${JSON.stringify(`${cardSelector} .guideline-preview`)}); return area?.querySelectorAll('li').length===8 && document.activeElement===area.querySelector('h4'); })()`, 'knowledge-preview-first-focus');
      }
      await activateGuideline('[data-guideline-action="confirm"]', 'knowledge-page-import-confirm');
      await waitFor(renderer, `document.querySelector(${JSON.stringify(cardSelector)})?.dataset.guidelineVersion==='${version}' && !document.querySelector(${JSON.stringify(`${cardSelector} .guideline-preview`)})`, 'knowledge-page-imported');
    }
    await assertRenderer(renderer, `(() => { const card=document.querySelector(${JSON.stringify(cardSelector)}); card.querySelector('.guideline-clauses').open=true; card.querySelector('.guideline-versions').open=true; return card.querySelectorAll('.guideline-version-list li').length===5; })()`, 'knowledge-pages-open');
    await activateGuideline('.guideline-clauses [data-guideline-action="clauses-next"]', 'knowledge-clauses-next');
    await waitFor(renderer, `(() => { const area=document.querySelector(${JSON.stringify(`${cardSelector} .guideline-clauses`)}); return area?.open && area.querySelectorAll('li').length===1 && area.querySelector('li')?.value===9 && document.activeElement===area.querySelector('summary'); })()`, 'knowledge-clauses-last-focus');
    await activateGuideline('[data-guideline-action="versions-older"]', 'knowledge-versions-older');
    await waitFor(renderer, `(() => { const area=document.querySelector(${JSON.stringify(`${cardSelector} .guideline-versions`)}); return area?.open && area.querySelector('[data-guideline-version-row="1"]') && area.querySelectorAll('.guideline-version-list li').length===3 && document.activeElement===area.querySelector('summary'); })()`, 'knowledge-versions-oldest-focus');
    await activateGuideline('[data-guideline-action="versions-latest"]', 'knowledge-versions-latest');
    await waitFor(renderer, `(() => { const area=document.querySelector(${JSON.stringify(`${cardSelector} .guideline-versions`)}); return area?.querySelector('[data-guideline-version-row="8"]') && area.querySelectorAll('.guideline-version-list li').length===5 && document.activeElement===area.querySelector('summary'); })()`, 'knowledge-versions-latest-focus');

    at('knowledge-procedures');
    // 工序与规则 (Issue #427, S79d): the nine review 工序 by what each does — eight 已启用 drawn solid (书系一致性检查 since
    // Issue #64, S29a), the one whose basis does not exist yet 尚未接通 drawn dashed, with why said of the house — none used by
    // a review in this Journey, and the 方案
    // in the house's words, 本社方案 v2, installed and enabled for the one Book that enabled it. Both layers (LAYER-008): the
    // words carry no identifier, and 查看技术详情, closed, holds the carrier's and the 权限侧车's identities and each 工序's id.
    await click(renderer, '工序与规则', 'knowledge-procedures-tab');
    await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab==='rules' && document.querySelector('.knowledge-procedures')?.dataset.procedureCount==='9'`, 'knowledge-procedures-painted');
    const procedures = await renderer.evaluate(`(() => {
      const section = document.querySelector('.knowledge-procedures');
      const details = section?.querySelector(':scope > details.technical-details') ?? null;
      const decision = Array.from(section?.children ?? []).filter((child) => child !== details).map((child) => child.textContent).join('\\n');
      return {
        states: Array.from(document.querySelectorAll('.knowledge-procedure-list > li'), (item) => {
          const pill = item.querySelector('.status-pill');
          return [item.dataset.procedureState, pill?.textContent ?? null, item.dataset.procedureRuns, pill instanceof HTMLElement ? getComputedStyle(pill).borderTopStyle : null];
        }),
        first: document.querySelector('.knowledge-procedure-list > li')?.textContent ?? null,
        reasons: Array.from(document.querySelectorAll('.knowledge-procedure-list .procedure-reason'), (reason) => reason.textContent),
        artifact: document.querySelector('.knowledge-artifact-list > li')?.textContent ?? null,
        identifierInWords: /1\\.0\\.0|@ai7\\/|[0-9a-f]{64}|ai7-review-procedure/u.test(decision),
        detailsOpen: details === null ? null : details.open,
        summary: details?.querySelector('summary')?.textContent ?? null,
        technical: Array.from(details?.querySelectorAll(':scope > dl > dt') ?? [], (term) => [term.textContent, term.nextElementSibling?.textContent ?? null]),
      };
    })()`);
    const technical = new Map(procedures?.technical ?? []);
    requireJourney(JSON.stringify(procedures?.states) === JSON.stringify([...Array(8).fill(['enabled', '已启用', '0', 'solid']), ['unavailable', '尚未接通', '0', 'dashed']]) &&
      procedures.first === '已启用 错别字与规范用语审阅工序 · 第 1 版 · 内置 · 用于「错别字与规范用语」 · 还没有审阅用过' &&
      JSON.stringify(procedures.reasons) === JSON.stringify([' · 生产文档之间的一致性核对还没有接通。']) &&
      procedures.artifact === '本社方案 v2 · 已安装 · 已为 1 本书启用' && procedures.identifierInWords === false &&
      procedures.detailsOpen === false && procedures.summary === '查看技术详情' &&
      technical.get('原生载体身份') === '@ai7/editorial-workspace-profile' && technical.get('原生载体版本') === '1.0.0' &&
      /^[0-9a-f]{64}$/u.test(technical.get('SHA-256') ?? '') && technical.get('权限侧车') === 'ai7.editorial-workspace-profile.authority' &&
      /^[0-9a-f]{64}$/u.test(technical.get('权限侧车 SHA-256') ?? '') && procedures.technical.length === 5 + 9 &&
      procedures.technical.slice(5).every(([, procedureId]) => /^ai7-review-procedure\//u.test(procedureId ?? '')),
    'knowledge-procedures-list', procedures);

    // ---- 知识库 › 资料库 (Issue #427, plan slice S79c; editor-surfaces §8.4, V2-UX-KB-007, ATTN-009, LEARN-004 to LEARN-007) ----
    at('knowledge-library-add');
    // Guideline imports consumed their picker; library intake owns a separate launch and picker answer.
    await closeBrowser();
    manager = await launch(SAMPLE1_PATH);
    renderer = await waitForRenderer(manager, 'library-picker-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'library-picker-ready');
    await click(renderer, '知识库', 'library-picker-knowledge');
    await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'library-picker-knowledge-ready');
    // 放入资料… with sample1 as a book the editor collected: the file as it will arrive, named and said to be a 图书 by the
    // editor, then kept whole — deciding nothing: no attribution, no eligibility, and no Task may list it under 允许参考 yet.
    await click(renderer, '资料库', 'library-tab');
    const emptyLibrary = await readLibrary(renderer, (page) => page.state === 'ready', 'library-ready');
    requireJourney(emptyLibrary.count === '0' && emptyLibrary.empty === LIBRARY_EMPTY && emptyLibrary.cards.length === 0 && emptyLibrary.preview === null,
      'library-empty', emptyLibrary);
    const sample1 = await readFile(SAMPLE1_PATH);
    const sample1Digest = createHash('sha256').update(sample1).digest('hex');
    const libraryObjects = resolve(dataRoot, 'library-objects');
    await clickSelector(renderer, '[data-library-action="add"]', 'library-add');
    const libraryPreview = await readLibrary(renderer, (page) => page.preview !== null, 'library-preview');
    requireJourney(libraryPreview.preview.heading === '放入资料库：sample1.docx' &&
      libraryPreview.preview.facts === `Word · ${(sample1.length / 1024).toFixed(1)} KB · 原件原样保存在本机，不会改动` && libraryPreview.preview.title === 'sample1' &&
      JSON.stringify(libraryPreview.preview.kinds) === JSON.stringify([['book', false], ['paper', false], ['document', false], ['web', false]]) &&
      libraryPreview.preview.confirmDisabled === true, 'library-preview-words', libraryPreview.preview);
    await waitFor(renderer, `document.activeElement === document.querySelector('.library-preview h3')`, 'library-preview-focused', 10_000);
    requireJourney(await lstat(libraryObjects).then(() => false, () => true), 'library-preview-keeps-nothing');
    await fill(renderer, '.library-preview [data-library-field="title"]', LIBRARY_TITLE, 'library-title');
    await clickSelector(renderer, '.library-preview [data-library-choice="book"]', 'library-kind-book');
    await waitFor(renderer, `document.querySelector('[data-library-action="confirm-add"]')?.disabled === false`, 'library-confirm-enabled', 10_000);
    await clickSelector(renderer, '[data-library-action="confirm-add"]', 'library-confirm');
    const libraryAdded = await readLibrary(renderer, (page) => page.preview === null && page.cards.length === 1, 'library-added');
    const [libraryCard] = libraryAdded.cards;
    requireJourney(libraryCard.title === LIBRARY_TITLE && libraryCard.kind === '图书' && libraryCard.attribution === 'none' && libraryCard.eligibility === 'none' &&
      libraryCard.reference === 'pending' && libraryCard.decisions === '0' && libraryCard.attributionLine === '尚未定归属' && libraryCard.eligibilityLine === '尚未定' &&
      libraryCard.referenceLine === '定了归属与学习准入，任务才能把它列进「允许参考」。' && libraryCard.history.length === 0, 'library-added-card', libraryCard);
    await waitFor(renderer, `(document.querySelector('#persistence-status')?.textContent ?? '')===${JSON.stringify(`已放入资料库：「${LIBRARY_TITLE}」；请定归属与学习准入。`)} && document.activeElement === document.querySelector('article.library-material h3')`, 'library-added-status', 10_000);
    // The original is kept byte for byte under its digest in the Agent Data Root, and the service reads it as the page does.
    const libraryKept = await readFile(resolve(libraryObjects, 'sha256', sample1Digest.slice(0, 2), `${sample1Digest}.docx`));
    requireJourney(libraryKept.equals(sample1), 'library-original-kept-whole');
    const materialId = libraryCard.id;
    const libraryService = await renderer.evaluate(`window.ai7.inspectLibraryMaterials().then((projection)=>projection.materials.map((material)=>[material.materialId, material.title, material.kind, material.source.format, material.source.sha256, material.attribution, material.eligibility]))`);
    requireJourney(JSON.stringify(libraryService) === JSON.stringify([[materialId, LIBRARY_TITLE, 'book', 'DOCX', sample1Digest, null, null]]), 'library-added-service', libraryService);

    at('knowledge-library-attention');
    // 待我处理 lists it in 等待你的决定, under no Book yet, with the decision it waits for; opening it returns to 资料库 with that
    // decision in focus.
    const libraryItem = `library-material:${materialId}`;
    const itemSelector = `[data-screen="global-attention"] li.global-attention-item[data-attention-item=${JSON.stringify(libraryItem)}]`;
    await clickSelector(renderer, '#global-attention-entry', 'library-attention-entry');
    await waitFor(renderer, `document.querySelectorAll('[data-screen="global-attention"] section.global-attention-group').length === 4 && document.querySelector(${JSON.stringify(itemSelector)}) !== null`, 'library-attention-listed', 30_000);
    const libraryListed = await renderer.evaluate(`(() => { const item=document.querySelector(${JSON.stringify(itemSelector)}); return { group: item.closest('section.global-attention-group')?.dataset.attentionGroup ?? null, state: item.dataset.attentionState, book: item.querySelector('.global-attention-book')?.textContent ?? null, object: item.querySelector('button.global-attention-open')?.textContent ?? null, pill: item.querySelector('.global-attention-pill')?.textContent ?? null, next: item.querySelector('.global-attention-next')?.textContent ?? null, count: document.querySelector('#global-attention-entry')?.dataset.attentionCount ?? null }; })()`);
    requireJourney(libraryListed.group === 'decisions' && libraryListed.state === 'library-attribution-pending' && libraryListed.book === '尚未定归属' &&
      libraryListed.object === `资料库 · 图书「${LIBRARY_TITLE}」` && libraryListed.pill === '资料库归属待定' && libraryListed.next === '安全的下一步：定归属…' && libraryListed.count === '1',
    'library-attention-words', libraryListed);
    await clickSelector(renderer, `${itemSelector} button.global-attention-open`, 'library-attention-open');
    const libraryReopened = await readLibrary(renderer, (page) => page.state === 'ready' && page.focus?.action === 'attribute', 'library-attention-opened');
    requireJourney(libraryReopened.cards.length === 1 && libraryReopened.cards[0].id === materialId && libraryReopened.cards[0].attribution === 'none', 'library-attention-card', libraryReopened);

    at('knowledge-library-decide');
    // 定归属 to the first Book — a Series cannot be named until Series exist — then 定学习准入 under it: the choices start
    // unselected, the house's states its consequence where it is chosen, and the Book's own with the editor's note is recorded.
    await clickSelector(renderer, '[data-library-action="attribute"]', 'library-attribute');
    const libraryAttributing = await readLibrary(renderer, (page) => page.cards[0]?.chooser?.kind === 'attribution', 'library-attribution-chooser');
    // The Books by title as 书库 orders them (乙 before 甲 by code point), a Series not yet there, and the house; the first
    // choice takes focus and none is chosen.
    requireJourney(JSON.stringify(libraryAttributing.cards[0].chooser.choices) === JSON.stringify([
      [`book:${bookB}`, false, false, '《J15 空图书乙》'], [`book:${bookA}`, false, false, '《J15 空图书甲》'], ['series', false, true, '书系'], ['house', false, false, '社级'],
    ]) && libraryAttributing.cards[0].chooser.confirmDisabled === true && libraryAttributing.focus?.choice === `book:${bookB}`, 'library-attribution-choices', libraryAttributing.cards[0].chooser);
    await clickSelector(renderer, `.library-attribution-chooser [data-library-choice="book:${bookA}"]`, 'library-attribution-book-a');
    await waitFor(renderer, `document.querySelector('[data-library-action="confirm-attribution"]')?.disabled === false`, 'library-attribution-confirm-enabled', 10_000);
    await clickSelector(renderer, '[data-library-action="confirm-attribution"]', 'library-attribution-confirm');
    const libraryAttributed = await readLibrary(renderer, (page) => page.cards[0]?.attribution === 'book' && page.cards[0].chooser === null, 'library-attributed');
    requireJourney(libraryAttributed.cards[0].attributionLine === '《J15 空图书甲》' && libraryAttributed.cards[0].eligibility === 'none' && libraryAttributed.cards[0].reference === 'pending' &&
      libraryAttributed.focus?.action === 'eligibility' && libraryAttributed.cards[0].history.length === 1, 'library-attributed-card', libraryAttributed.cards[0]);
    await waitFor(renderer, `(document.querySelector('#persistence-status')?.textContent ?? '')===${JSON.stringify(`已记录归属：「${LIBRARY_TITLE}」归到《J15 空图书甲》。`)}`, 'library-attributed-status', 10_000);
    await clickSelector(renderer, '[data-library-action="eligibility"]', 'library-eligibility');
    const libraryChoosing = await readLibrary(renderer, (page) => page.cards[0]?.chooser?.kind === 'eligibility', 'library-eligibility-chooser');
    requireJourney(JSON.stringify(libraryChoosing.cards[0].chooser.choices) === JSON.stringify([
      ['book', false, false, '仅纳入《J15 空图书甲》建议'], ['series', false, true, '纳入当前书系'], ['house', false, false, '纳入出版社经验'],
      ['excluded', false, false, '明确排除'], ['deferred', false, false, '稍后决定'],
    ]) && libraryChoosing.cards[0].chooser.consequenceShown === false && libraryChoosing.cards[0].chooser.confirmDisabled === true && libraryChoosing.focus?.choice === 'book',
    'library-eligibility-unselected', libraryChoosing.cards[0].chooser);
    await clickSelector(renderer, '.library-eligibility-chooser [data-library-choice="house"]', 'library-eligibility-house');
    await readLibrary(renderer, (page) => page.cards[0]?.chooser?.consequenceShown === true, 'library-house-consequence');
    await clickSelector(renderer, '.library-eligibility-chooser [data-library-choice="book"]', 'library-eligibility-book');
    await readLibrary(renderer, (page) => page.cards[0]?.chooser?.consequenceShown === false && page.cards[0].chooser.confirmDisabled === false, 'library-eligibility-book-chosen');
    await assertRenderer(renderer, `(() => { const text=document.querySelector('.library-eligibility-chooser [data-library-field="reason"]'); if(!(text instanceof HTMLTextAreaElement))return false; text.value='责编确认可作本书参考。'; text.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, 'library-eligibility-reason');
    await clickSelector(renderer, '[data-library-action="confirm-eligibility"]', 'library-eligibility-confirm');
    const libraryDecided = await readLibrary(renderer, (page) => page.cards[0]?.eligibility === 'book' && page.cards[0].chooser === null, 'library-decided');
    requireJourney(libraryDecided.cards[0].eligibilityLine === '仅纳入《J15 空图书甲》（说明：责编确认可作本书参考。）' && libraryDecided.cards[0].reference === 'available' &&
      libraryDecided.cards[0].referenceLine === '《J15 空图书甲》的任务可以把它列进「允许参考」。' && libraryDecided.cards[0].history.length === 2, 'library-decided-card', libraryDecided.cards[0]);
    await waitFor(renderer, `(document.querySelector('#persistence-status')?.textContent ?? '')===${JSON.stringify(`已记录学习准入：「${LIBRARY_TITLE}」 · 仅纳入《J15 空图书甲》。`)}`, 'library-decided-status', 10_000);
    // 待我处理 lets it go once both are decided.
    const attentionAfter = await renderer.evaluate(`window.ai7.inspectGlobalAttention().then((projection)=>[projection.actionableCount, projection.groups.flatMap((group)=>group.items).filter((item)=>item.object.kind==='library-material').length])`);
    requireJourney(JSON.stringify(attentionAfter) === JSON.stringify([0, 0]), 'library-attention-resolved', attentionAfter);

    at('j14-library-reflow-forced-colors');
    // At 200% the item, its decisions and an open choice reflow into the width; under forced colours the card and the choice keep
    // their borders.
    await clickSelector(renderer, '[data-library-action="attribute"]', 'library-reflow-chooser');
    await readLibrary(renderer, (page) => page.cards[0]?.chooser?.kind === 'attribution', 'library-reflow-chooser-open');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[document.querySelector('article.library-material'), document.querySelector('.library-chooser'), document.querySelector('.library-facts')]; return parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2; })()`, 'library-reflow', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const card = document.querySelector('article.library-material');
      const chooser = document.querySelector('.library-chooser');
      return card instanceof HTMLElement && getComputedStyle(card).borderTopStyle === 'solid' && chooser instanceof HTMLElement && getComputedStyle(chooser).borderTopStyle === 'solid';
    })()`, 'library-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await clickSelector(renderer, '[data-library-action="cancel-decision"]', 'library-reflow-cancel');
    await readLibrary(renderer, (page) => page.cards[0]?.chooser === null && page.focus?.action === 'attribute', 'library-reflow-cancelled');

    at('knowledge-library-bounded-readers');
    const longReason = '👨‍👩‍👧‍👦'.repeat(300);
    await clickSelector(renderer, '[data-library-action="eligibility"]', 'library-long-note-open');
    await readLibrary(renderer, (page) => page.cards[0]?.chooser?.kind === 'eligibility', 'library-long-note-ready');
    await clickSelector(renderer, '.library-eligibility-chooser [data-library-choice="book"]', 'library-long-note-choice');
    await fill(renderer, '[data-library-field="reason"]', longReason, 'library-long-note');
    await clickSelector(renderer, '[data-library-action="confirm-eligibility"]', 'library-long-note-save');
    await readLibrary(renderer, (page) => page.cards[0]?.decisions === '3' && page.cards[0].chooser === null, 'library-long-note-saved');
    const reader = 'article.library-material > .library-reason-reader';
    await clickSelector(renderer, `${reader} [data-library-action="read-reason"]`, 'library-full-note-open');
    let reconstructed = '';
    for (let part = 0; part < 4; part += 1) {
      await waitFor(renderer, `document.querySelector(${JSON.stringify(reader)})?.dataset.reasonOffset === '${part * 1024}' && document.querySelector(${JSON.stringify(`${reader} .library-reason-text`)}) === document.activeElement`, 'library-note-fragment-focus');
      const fragment = await renderer.evaluate(`(() => { const root=document.querySelector(${JSON.stringify(reader)}); return {text:root.querySelector('.library-reason-text').textContent,next:root.querySelector('[data-library-action="reason-next"]')!==null}; })()`);
      reconstructed += fragment.text;
      if (!fragment.next) break;
      await clickSelector(renderer, `${reader} [data-library-action="reason-next"]`, 'library-note-next');
    }
    requireJourney(reconstructed === longReason, 'library-complete-note-readable');
    await clickSelector(renderer, `${reader} [data-library-action="reason-close"]`, 'library-note-close');
    await waitFor(renderer, `document.activeElement === document.querySelector(${JSON.stringify(`${reader} [data-library-action="read-reason"]`)})`, 'library-note-close-focus');

    // These are the runner's reference-file labels, never manuscript content. Every arrival goes through the real picker,
    // review and commit; each launch grants exactly one picker choice. Twenty more arrivals cross the twenty-card boundary.
    for (let index = 0; index < 20; index += 1) {
      await closeBrowser();
      const referencePath = resolve(runRoot, `library-reference-${index}.txt`);
      await writeFile(referencePath, `AI7 library paging reference ${index}`, 'utf8');
      manager = await launch(referencePath);
      renderer = await waitForRenderer(manager, 'library-page-window');
      await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'library-page-ready');
      await click(renderer, '知识库', 'library-page-knowledge');
      await click(renderer, '资料库', 'library-page-tab');
      await readLibrary(renderer, (page) => page.state === 'ready', 'library-page-loaded');
      await clickSelector(renderer, '[data-library-action="add"]', 'library-page-add');
      await readLibrary(renderer, (page) => page.preview !== null, 'library-page-preview');
      await fill(renderer, '[data-library-field="title"]', `分页资料${index}`, 'library-page-title');
      await clickSelector(renderer, '[data-library-choice="document"]', 'library-page-kind');
      await clickSelector(renderer, '[data-library-action="confirm-add"]', 'library-page-confirm');
      await readLibrary(renderer, (page) => page.preview === null && page.cards.length === Math.min(index + 2, 20), 'library-page-arrival');
    }
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await clickSelector(renderer, '[data-library-action="more"]', 'library-page-next');
      await readLibrary(renderer, (page) => page.cards.length === 1 && page.cards[0].id === materialId && page.focus?.tag === 'H3', 'library-page-oldest');
      await clickSelector(renderer, '[data-library-action="first"]', 'library-page-first');
      await readLibrary(renderer, (page) => page.cards.length === 20 && page.focus?.tag === 'H3', 'library-page-newest');
    }

    // Populate the Book chooser through the ordinary creation form, then retain one explicit choice across replacement pages.
    await click(renderer, '返回', 'library-books-landing');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'library-books-landed');
    for (let index = 0; index < 19; index += 1) {
      await createEmptyBook(renderer, `J15 分页图书${String(index).padStart(2, '0')}`);
      await click(renderer, '返回图书列表', 'library-books-return');
      await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'library-books-returned');
    }
    await click(renderer, '知识库', 'library-books-knowledge');
    await click(renderer, '资料库', 'library-books-tab');
    await readLibrary(renderer, (page) => page.state === 'ready', 'library-books-ready');
    await clickSelector(renderer, 'article.library-material [data-library-action="attribute"]', 'library-books-open');
    await waitFor(renderer, `document.querySelectorAll('.library-attribution-chooser [data-library-choice^="book:"]').length===20`, 'library-books-first-page');
    const picked = await renderer.evaluate(`document.querySelector('.library-attribution-chooser [data-library-choice^="book:"]').value`);
    await clickSelector(renderer, `.library-attribution-chooser [data-library-choice="${picked}"]`, 'library-books-select');
    await clickSelector(renderer, '[data-library-action="more-books"]', 'library-books-next');
    await waitFor(renderer, `document.querySelectorAll('.library-attribution-chooser [data-library-choice^="book:"]').length===2 && document.querySelector('.library-attribution-chooser [data-library-choice="${picked}"]')?.checked===true`, 'library-books-retained');
    await clickSelector(renderer, '[data-library-action="first-books"]', 'library-books-first');
    await waitFor(renderer, `document.querySelectorAll('.library-attribution-chooser [data-library-choice^="book:"]').length===20 && document.querySelector('.library-attribution-chooser [data-library-choice="${picked}"]')?.checked===true`, 'library-books-first-retained');
    await clickSelector(renderer, '[data-library-action="confirm-attribution"]', 'library-books-commit');
    await readLibrary(renderer, (page) => page.cards[0]?.attribution === 'book' && page.cards[0].chooser === null, 'library-books-committed');

    // ---- 可复用工序 (Issue #65, plan slice S30; ADR 0087; V2-UX-REUSE-001 to 020, 029 to 031, 063 to 066, KB-010) ---------
    at('capture-prerequisites');
    // A window whose picker serves exact sample1 and whose service binds the J-04 model adapter over the authored review
    // fixture, and whose Save dialog answers the 开发建议's 导出为文件… once.
    const proposalPath = resolve(runRoot, PROPOSAL_FILE_NAME);
    await closeBrowser();
    manager = await launch(SAMPLE1_PATH, ['--j04-model-adapter', REVIEW_FIXTURE_IDENTITY, '--j15-save-path', proposalPath]);
    renderer = await waitForRenderer(manager, 'capture-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'capture-ready');
    const sourceBook = await importSample1(renderer, CAPTURE_SOURCE_TITLE, false, 'capture-source-import');
    await click(renderer, '返回图书列表', 'capture-source-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'capture-source-landing');
    await enableProfileForBook(renderer, sourceBook, 'capture-source-profile');
    await click(renderer, '模型服务', 'capture-model-open');
    await waitFor(renderer, `document.querySelector('[data-screen="model-service"] [data-model-role="main-editorial"]')`, 'capture-model-ready');
    cancellation.throwIfRequested();
    syntheticSecret = randomBytes(48).toString('base64url');
    credentialRenderer = renderer;
    await fill(renderer, '#main-editorial-connection-name', 'J-15 主编辑连接', 'capture-model-name');
    await fill(renderer, '#main-editorial-credential', syntheticSecret, 'capture-model-secret');
    cancellation.throwIfRequested();
    credentialMutationReached = true;
    await click(renderer, '保护并保存', 'capture-model-save');
    at('model-credential-saved');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('[data-credential-state="ready"]')`, 'capture-model-saved');
    const readyConnection = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(UUID_PATTERN.test(readyConnection?.credentialReference ?? '') && readyConnection?.credentialOperationState === 'ready', 'capture-model-ready-reference');
    credentialReferenceForCleanup = readyConnection.credentialReference;
    await click(renderer, '移除', 'capture-model-remove');
    at('model-credential-removed');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='setup-required' && document.querySelector('[data-credential-state="missing"]')`, 'capture-model-removed');
    credentialRemoved = true;
    await click(renderer, '返回', 'capture-model-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'capture-model-landing');

    at('capture-source-review');
    // A Review Run of 体例与格式 and 文学性与表达改进 over the whole book, approved in the drawer and run to the end; a Run
    // chosen by hand pins no procedure, and once finished it offers the capture beside its report.
    await openBookReview(renderer, sourceBook, 'capture-source-review');
    await clickSelector(renderer, '[data-review-action="new-review"]', 'capture-source-new-review');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true && document.querySelector('[data-review-field="procedure"]')`, 'capture-source-sheet');
    await assertRenderer(renderer, `(() => { const sheet=document.querySelector('dialog.review-sheet'); for (const id of ['style-and-format','literary-expression']) { const box=sheet.querySelector('input[name="review-category"][value="'+id+'"]'); if(!(box instanceof HTMLInputElement)||box.disabled)return false; box.click(); } const whole=sheet.querySelector('input[name="review-scope"][value="whole"]'); if(!(whole instanceof HTMLInputElement)||whole.disabled)return false; whole.click(); const prepare=sheet.querySelector('[data-review-action="prepare"]'); if(!(prepare instanceof HTMLButtonElement)||prepare.disabled)return false; prepare.click(); return true; })()`, 'capture-source-prepare');
    const sourceRun = await startPreparedReview(renderer, 'capture-source-run');
    requireJourney(sourceRun?.state === 'settled' && sourceRun.procedure === null && sourceRun.capture?.available === true &&
      JSON.stringify(sourceRun.categories.map((category) => [category.categoryId, category.state])) === JSON.stringify([['style-and-format', 'settled'], ['literary-expression', 'settled']]),
    'capture-source-settled', { state: sourceRun?.state, capture: sourceRun?.capture });

    at('capture-source-set');
    // 将以上工序保存为可复用工序: the source set — both categories, each kept — the classification it recommends and why, what
    // extraction keeps and what it never saves. Removing a step changes what it keeps; nothing can be added or reordered.
    await clickSelector(renderer, 'section.review-report [data-review-action="capture"]', 'capture-open');
    const sheet = await readCapture(renderer, (read) => read.steps.length === 2 && read.focused, 'capture-sheet');
    requireJourney(JSON.stringify(sheet.steps.map(([id, eligible, checked]) => [id, eligible, checked])) === JSON.stringify([['style-and-format', 'true', true], ['literary-expression', 'true', true]]) &&
      sheet.steps[0][3] === '体例与格式 · 体例与格式审阅工序（第 1 版） · 输出批注 · 调用模型 · 不使用搜索引擎' &&
      JSON.stringify(sheet.kinds) === JSON.stringify([['captured-procedure', false, true], ['developer-proposal', false, false], ['skill-draft', true, false], ['workflow-draft', true, false], ['default-rule', true, false]]) &&
      sheet.kind === 'captured-procedure' && sheet.procedureShown && !sheet.proposalShown && sheet.notSaved.length === 6 &&
      sheet.notSaved[0] === '稿件文字、书名与这本书的身份、章节与书系' && (sheet.why ?? '').startsWith('这次审阅的每一步都是 AI7 已有的审阅类别') &&
      sheet.extract[1] === '步骤（按顺序）：体例与格式 → 文学性与表达改进' && sheet.extract[2] === '参数：审阅范围「全书」',
    'capture-sheet-words', sheet);
    await clickSelector(renderer, 'dialog.procedure-capture input[name="capture-step"][value="literary-expression"]', 'capture-remove-step');
    await fill(renderer, 'dialog.procedure-capture [data-capture-field="title"]', PROCEDURE_TITLE, 'capture-title');
    const trimmed = await readCapture(renderer, (read) => read.kept === 'style-and-format', 'capture-step-removed');
    requireJourney(trimmed.extract[0] === `用途：《${PROCEDURE_TITLE}》` && trimmed.extract[1] === '步骤（按顺序）：体例与格式' &&
      trimmed.extract[3] === '输出：批注', 'capture-extract-words', trimmed.extract);

    at('capture-save');
    // 保存为可复用工序: version 1, 待验证 — nothing runs, and the document holds nothing of the Book.
    await clickSelector(renderer, 'dialog.procedure-capture [data-capture-action="save"]', 'capture-save');
    await waitFor(renderer, `!document.querySelector('dialog.procedure-capture') && ${STATUS_TEXT}===${JSON.stringify(`已保存《${PROCEDURE_TITLE}》第 1 版 · 待验证；在知识库「工序与规则」里验证并启用后才能运行。`)}`, 'capture-saved');
    const savedProcedures = await renderer.evaluate(`window.ai7.inspectCapturedProcedures()`);
    const procedureId = savedProcedures?.procedures?.[0]?.procedureId;
    requireJourney(savedProcedures?.procedures?.length === 1 && UUID_PATTERN.test(procedureId ?? '') &&
      savedProcedures.procedures[0].versions[0].state === 'pending-validation' && savedProcedures.procedures[0].versions[0].source.bookId === sourceBook &&
      JSON.stringify(savedProcedures.procedures[0].versions[0].steps.map((step) => step.categoryId)) === JSON.stringify(['style-and-format']),
    'capture-saved-service', savedProcedures?.procedures?.[0]?.versions?.[0]);
    const storedDocument = (() => {
      const database = new DatabaseSync(resolve(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try { return database.prepare('SELECT document_json FROM captured_procedure_versions').all().map((row) => row.document_json); } finally { database.close(); }
    })();
    requireJourney(storedDocument.length === 1 && !storedDocument[0].includes(sourceBook) && !storedDocument[0].includes(CAPTURE_SOURCE_TITLE) &&
      !storedDocument[0].includes(sourceRun.reviewRunId) && JSON.parse(storedDocument[0]).schema === 'ai7.captured-procedure/1', 'capture-document-holds-no-book');

    at('capture-developer-proposal');
    // The same capture as a 开发建议: kept only here, its affected 工序 named by the steps, never sent.
    await clickSelector(renderer, 'section.review-report [data-review-action="capture"]', 'proposal-open');
    await readCapture(renderer, (read) => read.focused, 'proposal-sheet');
    await clickSelector(renderer, 'dialog.procedure-capture input[name="capture-kind"][value="developer-proposal"]', 'proposal-kind');
    const proposalSheet = await readCapture(renderer, (read) => read.kind === 'developer-proposal', 'proposal-kind-chosen');
    requireJourney(proposalSheet.proposalShown && !proposalSheet.procedureShown && proposalSheet.affected === '体例与格式、文学性与表达改进', 'proposal-sheet-words', proposalSheet);
    await fill(renderer, 'dialog.procedure-capture [data-capture-field="proposal-title"]', PROPOSAL_TITLE, 'proposal-title');
    await fill(renderer, 'dialog.procedure-capture [data-capture-field="missing-capability"]', '核对图注与正文图号是否一致。', 'proposal-capability');
    await clickSelector(renderer, 'dialog.procedure-capture [data-capture-action="save"]', 'proposal-save');
    await waitFor(renderer, `!document.querySelector('dialog.procedure-capture') && ${STATUS_TEXT}===${JSON.stringify(`已保存开发建议《${PROPOSAL_TITLE}》第 1 版；只记在本机，AI7 不会发送它。`)}`, 'proposal-saved');

    at('capture-validate-enable');
    // 知识库 › 工序与规则 lists it apart from the built-in 工序: version 1 待验证, dashed. 验证并启用… previews it — today's
    // guideline the same as the source Run's — and 确认启用 makes it 已启用, solid, runnable.
    await leaveReviewToLibrary(renderer, 'validate-leave');
    await openProcedures(renderer, 'validate');
    const pending = await readProcedures(renderer, (page) => page.count === '1' && page.proposalCount === '1', 'validate-listed');
    requireJourney(pending.procedures[0].title === `《${PROCEDURE_TITLE}》` && pending.procedures[0].runnable === 'false' && !pending.procedures[0].run &&
      pending.procedures[0].versions[0].state === 'pending-validation' && pending.procedures[0].versions[0].pill === '待验证' &&
      pending.procedures[0].versions[0].pillBorder === 'dashed' && pending.procedures[0].versions[0].source.startsWith(`来自《${CAPTURE_SOURCE_TITLE}》第 1 次审阅`) &&
      JSON.stringify(pending.procedures[0].versions[0].actions) === JSON.stringify(['validate', 'stop']) &&
      pending.proposals[0].title === `《${PROPOSAL_TITLE}》` && JSON.stringify(pending.proposals[0].versions) === JSON.stringify([['1', '0']]),
    'validate-pending', pending);
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-version="1"] [data-procedure-action="validate"]`, 'validate-open');
    const validationPreview = await readProcedures(renderer, (page) => page.procedures[0]?.versions[0]?.validation === 'true', 'validate-preview');
    requireJourney(JSON.stringify(validationPreview.procedures[0].versions[0].guidelines) === JSON.stringify(["体例条款（AI7 内置默认）第 1 版 · 与来源审阅相同"]), "validate-preview-words", validationPreview.procedures[0].versions[0]);
    await waitFor(renderer, `document.activeElement === document.querySelector('.captured-procedure-validation h5')`, 'validate-preview-focused', 10_000);
    await clickSelector(renderer, '.captured-procedure-validation [data-procedure-action="confirm-enable"]', 'validate-confirm');
    const enabled = await readProcedures(renderer, (page) => page.procedures[0]?.versions[0]?.state === 'enabled', 'validate-enabled');
    requireJourney(enabled.procedures[0].runnable === 'true' && enabled.procedures[0].run && enabled.procedures[0].versions[0].pill === '已启用' &&
      enabled.procedures[0].versions[0].pillBorder === 'solid' && enabled.procedures[0].versions[0].validation === null, 'validate-enabled-card', enabled.procedures[0]);
    await waitFor(renderer, `${STATUS_TEXT}===${JSON.stringify(`已启用《${PROCEDURE_TITLE}》第 1 版；在一本书的新建审阅里可以按它运行。`)}`, 'validate-enabled-status', 10_000);

    at('capture-run-second-book');
    // A second Book from sample1 (the picker serves one choice per window, so a new window), its 方案 enabled. 运行此工序… in
    // 知识库 opens its 审阅 with 新建审阅 filled from version 1 — 体例与格式, the whole book — and the ordinary plan and
    // 开始任务 run it; the Run pins version 1.
    await closeBrowser();
    manager = await launch(SAMPLE1_PATH, ['--j04-model-adapter', REVIEW_FIXTURE_IDENTITY, '--j15-save-path', proposalPath]);
    renderer = await waitForRenderer(manager, 'run-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'run-ready');
    const targetBook = await importSample1(renderer, CAPTURE_TARGET_TITLE, true, 'run-import');
    await click(renderer, '返回图书列表', 'run-import-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'run-import-landing');
    await enableProfileForBook(renderer, targetBook, 'run-profile');
    await openProcedures(renderer, 'run');
    await readProcedures(renderer, (page) => page.procedures[0]?.run === true, 'run-listed');
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-procedure-action="run"]`, 'run-open');
    await waitFor(renderer, `document.querySelector('[data-procedure-field="run-book"]')`, 'run-chooser');
    await assertRenderer(renderer, `(() => { const select=document.querySelector('[data-procedure-field="run-book"]'); if(!(select instanceof HTMLSelectElement))return false; const values=Array.from(select.options, (option)=>option.value); if(!values.includes(${JSON.stringify(targetBook)}) || !values.includes(${JSON.stringify(sourceBook)}) || values.length!==2)return false; select.value=${JSON.stringify(targetBook)}; select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`, 'run-choose-book');
    await clickSelector(renderer, '[data-procedure-action="open-run"]', 'run-open-review');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true && document.querySelector('.review-sheet-procedure')?.dataset.procedureVersion==='1'`, 'run-sheet-filled', 60_000);
    const filled = await renderer.evaluate(`(() => {
      const sheet=document.querySelector('dialog.review-sheet');
      return {
        procedure: sheet.querySelector('[data-review-field="procedure"]')?.value ?? null,
        checked: Array.from(sheet.querySelectorAll('input[name="review-category"]:checked'), (input) => input.value),
        enabled: Array.from(sheet.querySelectorAll('input[name="review-category"]:not(:disabled)'), (input) => input.value),
        scope: sheet.querySelector('input[name="review-scope"]:checked')?.value ?? null,
        lines: Array.from(sheet.querySelectorAll('.review-sheet-procedure-line'), (line) => line.textContent),
        book: document.querySelector('.book-review')?.dataset.bookId ?? null,
      };
    })()`);
    requireJourney(filled.procedure === procedureId && JSON.stringify(filled.checked) === JSON.stringify(['style-and-format']) && filled.enabled.length === 0 &&
      filled.scope === 'whole' && filled.book === targetBook &&
      JSON.stringify(filled.lines) === JSON.stringify([`按《${PROCEDURE_TITLE}》第 1 版：体例与格式；范围「全书」。类别已按它选好，计划照常先看。`]), 'run-sheet-words', filled);
    await clickSelector(renderer, 'dialog.review-sheet [data-review-action="prepare"]', 'run-prepare');
    const ran = await startPreparedReview(renderer, 'run-review');
    requireJourney(ran?.state === 'settled' && JSON.stringify(ran.categories.map((category) => category.categoryId)) === JSON.stringify(['style-and-format']) &&
      ran.procedure?.procedureId === procedureId && ran.procedure.version === 1 && ran.procedure.stopped === false && ran.procedure.leftOut.length === 0,
    'run-pinned', ran?.procedure);
    await assertRenderer(renderer, `document.querySelector('.review-procedure-pin .review-procedure-line')?.textContent===${JSON.stringify(`按可复用工序《${PROCEDURE_TITLE}》第 1 版`)}`, 'run-pin-shown');

    at('capture-stop');
    // 停用 is final for version 1: it is never offered to run again, and the Run that pinned it keeps naming it.
    await leaveReviewToLibrary(renderer, 'stop-leave');
    await openProcedures(renderer, 'stop');
    const beforeStop = await readProcedures(renderer, (page) => page.procedures[0]?.versions[0]?.state === 'enabled', 'stop-listed');
    requireJourney(beforeStop.procedures[0].versions[0].runs === '按这一版运行过 1 次审阅', 'stop-runs-before', beforeStop.procedures[0].versions[0]);
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-version="1"] [data-procedure-action="stop"]`, 'stop-version');
    const stopped = await readProcedures(renderer, (page) => page.procedures[0]?.versions[0]?.state === 'stopped', 'stop-stopped');
    requireJourney(stopped.procedures[0].runnable === 'false' && !stopped.procedures[0].run && stopped.procedures[0].versions[0].pill === '已停用' &&
      stopped.procedures[0].versions[0].pillBorder === 'dotted' && stopped.procedures[0].versions[0].actions.length === 0 &&
      stopped.procedures[0].versions[0].runs === '按这一版运行过 1 次审阅', 'stop-card', stopped.procedures[0]);
    await click(renderer, '返回', 'stop-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'stop-back-landing');
    await openBookReview(renderer, targetBook, 'stop-review');
    await waitFor(renderer, `document.querySelector('.review-procedure-pin')?.dataset.procedureStopped==='true'`, 'stop-pin-kept', 30_000);
    await leaveReviewToLibrary(renderer, 'stop-review-leave');

    at('capture-proposal-file');
    // 导出为文件…: the platform Save dialog (this window's launch control answers it once); the file is the proposal in words
    // with its digest, and only its name is recorded. Nothing of either Book is in it.
    await openProcedures(renderer, 'proposal-file');
    await readProcedures(renderer, (page) => page.proposals.length === 1, 'proposal-file-listed');
    await clickSelector(renderer, '.developer-proposal [data-procedure-action="proposal-file"]', 'proposal-file-save');
    await waitFor(renderer, `${STATUS_TEXT}===${JSON.stringify(`已导出为文件「${PROPOSAL_FILE_NAME}」；AI7 不会发送它。`)}`, 'proposal-file-status', 30_000);
    const proposalFile = await readFile(proposalPath, 'utf8');
    requireJourney(proposalFile.startsWith(`# 开发建议：${PROPOSAL_TITLE}\n`) && proposalFile.includes('核对图注与正文图号是否一致。') &&
      proposalFile.includes('AI7 不会发送这份开发建议') && !proposalFile.includes(CAPTURE_SOURCE_TITLE) && !proposalFile.includes(sourceBook),
    'proposal-file-content');
    await readProcedures(renderer, (page) => JSON.stringify(page.proposals[0]?.versions) === JSON.stringify([['1', '1']]), 'proposal-file-recorded');

    at('capture-restart');
    // A restart keeps every version, its state and use, and the proposal's file record.
    await closeBrowser();
    manager = await launch();
    renderer = await waitForRenderer(manager, 'capture-restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'capture-restart-ready');
    await openProcedures(renderer, 'capture-restart');
    const restartedProcedures = await readProcedures(renderer, (page) => page.count === '1', 'capture-restart-listed');
    requireJourney(restartedProcedures.procedures[0].versions[0].state === 'stopped' && restartedProcedures.procedures[0].versions[0].runs === '按这一版运行过 1 次审阅' &&
      JSON.stringify(restartedProcedures.proposals[0].versions) === JSON.stringify([['1', '1']]), 'capture-restart-kept', restartedProcedures);

    at('j14-capture-keyboard-reflow-forced-colors');
    // Without a pointer: Tab reaches 修改… with its focus visible, and Enter opens the next version's form with focus on its title.
    await renderer.evaluate(`(() => { const active=document.activeElement; if(active instanceof HTMLElement)active.blur(); return true; })()`);
    let reached = false;
    for (let count = 0; count < 120 && !reached; count += 1) {
      await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab' });
      await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
      reached = await renderer.evaluate(`document.activeElement?.dataset.procedureAction==='revise-proposal' && document.activeElement.matches(':focus-visible')`).catch(() => false);
    }
    requireJourney(reached, 'capture-keyboard-focus');
    await activateFocused(renderer, 'Enter');
    await waitFor(renderer, `document.activeElement === document.querySelector('.developer-proposal-form [data-proposal-field="title"]')`, 'capture-keyboard-form', 10_000);
    await clickSelector(renderer, '.developer-proposal-form [data-procedure-action="cancel-proposal"]', 'capture-keyboard-cancel');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[...document.querySelectorAll('article.captured-procedure, article.developer-proposal, li.captured-procedure-version')]; return parts.length===3 && parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2; })()`, 'capture-reflow', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const card = document.querySelector('article.captured-procedure');
      const proposal = document.querySelector('article.developer-proposal');
      const pill = document.querySelector('.captured-procedure-state-stopped');
      return card instanceof HTMLElement && getComputedStyle(card).borderTopStyle === 'solid' && proposal instanceof HTMLElement &&
        getComputedStyle(proposal).borderTopStyle === 'solid' && pill instanceof HTMLElement && getComputedStyle(pill).borderTopStyle === 'dotted';
    })()`, 'capture-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('zero-activity');
    await assertRenderer(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && !Object.keys(window.ai7).some((key)=>/provider|session/i.test(key))`, 'exact-service-readiness-remained-zero');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-network-provider-session');
    await closeBrowser();
    await loopback.close();
  } finally {
    finalCleanupRequested = true;
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch((error) => reportJourneyFailure('J-15', location, error));
