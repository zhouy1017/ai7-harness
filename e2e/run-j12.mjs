import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure } from './controller.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CDP_OPERATION_TIMEOUT_MS = 60_000;
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const LOOPBACK_CLOSE_TIMEOUT_MS = 5_000;
const CREDENTIAL_CLEANUP_TIMEOUT_MS = 15_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;
const BROWSER_CLOSE_TIMEOUT = new Error('J-12/browser-close-timeout');
const BROWSER_DISCONNECTED = new Error('J-12/browser-disconnected');
const RENDERER_CDP_FAILURE = new Error('J-12/renderer-cdp-response');
const RENDERER_CDP_TIMEOUT = new Error('J-12/renderer-cdp-timeout');
const RENDERER_SESSION_CLOSED = new Error('J-12/renderer-session-closed');
const LOOPBACK_CLOSE_TIMEOUT = new Error('J-12/loopback-close-timeout');
const CREDENTIAL_CLEANUP_TIMEOUT = new Error('J-12/credential-cleanup-timeout');
let location = 'entry';
let Zip;
let ZipPassThrough;
let strToU8;
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-12', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-12/${name}`);
  if (detail !== undefined) error.detail = detail;
  throw error;
}
function inside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function createBrowserDisconnectBoundary(browser) {
  let rejectDisconnected;
  const disconnected = new Promise((_, reject) => {
    rejectDisconnected = reject;
  });
  disconnected.catch(() => undefined);
  const onDisconnected = () => rejectDisconnected(BROWSER_DISCONNECTED);
  browser.once('disconnected', onDisconnected);
  if (!browser.isConnected()) {
    browser.off('disconnected', onDisconnected);
    onDisconnected();
  }
  return async (operation) => {
    operation.catch(() => undefined);
    try {
      return await Promise.race([operation, disconnected]);
    } catch (error) {
      if (!browser.isConnected()) throw BROWSER_DISCONNECTED;
      throw error;
    }
  };
}

async function awaitCdpOperation(operation, deadline) {
  operation.catch(() => undefined);
  const remaining = deadline - Date.now();
  requireJourney(remaining > 0, 'renderer-cdp-timeout');
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(RENDERER_CDP_TIMEOUT), remaining);
        timeout.unref();
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
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

function parseJourney() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-12', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-12' };
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
    server.once('error', () => rejectListen(new Error('J-12/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  requireJourney(address && typeof address === 'object' && address.address === '127.0.0.1' && address.port > 0, 'loopback-address');
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j12-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      const close = new Promise((resolveClose, rejectClose) =>
        server.close((error) => error ? rejectClose(error) : resolveClose()));
      try {
        await awaitFixedOperation(close, LOOPBACK_CLOSE_TIMEOUT_MS, LOOPBACK_CLOSE_TIMEOUT);
      } catch (error) {
        runnerLifecycleIncomplete = true;
        server.closeAllConnections();
        throw error;
      }
      requireJourney(!runtimeFault, 'loopback-runtime');
    },
  };
}

async function createSyntheticDocx(path) {
  const output = createWriteStream(path, { flags: 'wx' });
  let pendingDrain;
  const drain = async () => {
    const pending = pendingDrain;
    if (!pending) return;
    try { await pending; } finally { if (pendingDrain === pending) pendingDrain = undefined; }
  };
  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    output.once('finish', resolveCompletion);
    output.once('error', rejectCompletion);
  });
  const zip = new Zip((error, data, final) => {
    if (error) { output.destroy(error); return; }
    if (!output.write(data) && pendingDrain === undefined) pendingDrain = once(output, 'drain').then(() => undefined);
    if (final) output.end();
  });
  const push = async (name, text) => {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    entry.push(strToU8(text), true);
    await drain();
  };
  await push('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  await push('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>J12 公开合成图书</dc:title></cp:coreProperties>');
  const paragraphs = Array.from({ length: 40 }, (_, index) =>
    `<w:p>${index === 0 ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>' : index % 10 === 0 ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''}<w:r><w:t>J12 公开合成段落 ${index + 1}，仅用于本地工作台路由校验。</w:t></w:r></w:p>`).join('');
  await push('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`);
  zip.end();
  await completion;
  const metadata = await lstat(path);
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 1_000, 'synthetic-docx');
}

async function createRendererManager(browser) {
  const rootDeadline = Date.now() + CDP_OPERATION_TIMEOUT_MS;
  const withBrowserConnection = createBrowserDisconnectBoundary(browser);
  const root = await awaitCdpOperation(
    withBrowserConnection(browser.newBrowserCDPSession()),
    rootDeadline,
  );
  const renderers = new Map();
  const pending = new Map();
  const detachedSessions = new Set();
  let nextId = 1;
  const sendRoot = (method, params = {}, deadline = Date.now() + CDP_OPERATION_TIMEOUT_MS) =>
    awaitCdpOperation(withBrowserConnection(root.send(method, params)), deadline);
  root.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    let response;
    try { response = JSON.parse(message); } catch { return; }
    if (typeof response.id !== 'number') return;
    const key = `${sessionId}:${response.id}`;
    const completion = pending.get(key);
    if (!completion) return;
    pending.delete(key);
    if (response.error) completion.reject(RENDERER_CDP_FAILURE);
    else completion.resolve(response.result);
  });
  root.on('Target.detachedFromTarget', ({ sessionId }) => {
    detachedSessions.add(sessionId);
    for (const [key, completion] of pending) {
      if (!key.startsWith(`${sessionId}:`)) continue;
      pending.delete(key);
      completion.reject(RENDERER_SESSION_CLOSED);
    }
  });
  const attach = async (target) => {
    if (renderers.has(target.targetId)) return renderers.get(target.targetId);
    const attached = (async () => {
      const attachDeadline = Date.now() + CDP_OPERATION_TIMEOUT_MS;
      const { sessionId } = await sendRoot(
        'Target.attachToTarget',
        { targetId: target.targetId, flatten: false },
        attachDeadline,
      );
      const send = async (method, params = {}, deadline = Date.now() + CDP_OPERATION_TIMEOUT_MS) => {
        if (detachedSessions.has(sessionId)) throw RENDERER_SESSION_CLOSED;
        const id = nextId++;
        const key = `${sessionId}:${id}`;
        const remaining = deadline - Date.now();
        requireJourney(remaining > 0, 'renderer-cdp-timeout');
        const response = new Promise((resolveResponse, rejectResponse) => {
          const timeout = setTimeout(() => {
            pending.delete(key);
            rejectResponse(RENDERER_CDP_TIMEOUT);
          }, remaining);
          timeout.unref();
          pending.set(key, {
            resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
            reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
          });
        });
        const dispatch = sendRoot(
          'Target.sendMessageToTarget',
          { sessionId, message: JSON.stringify({ id, method, params }) },
          deadline,
        );
        const [, result] = await Promise.all([dispatch, withBrowserConnection(response)]);
        return result;
      };
      const renderer = {
        targetId: target.targetId,
        send,
        evaluate: async (expression) => {
          const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
          requireJourney(!response.exceptionDetails, `renderer-evaluate-${location}`);
          return response.result.value;
        },
      };
      await send('Runtime.enable', {}, attachDeadline);
      return renderer;
    })();
    renderers.set(target.targetId, attached);
    try {
      return await attached;
    } catch (error) {
      renderers.delete(target.targetId);
      throw error;
    }
  };
  return {
    list: async () => {
      const targets = (await sendRoot('Target.getTargets')).targetInfos.filter((item) => item.type === 'page');
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
  throw new Error(`J-12/${name}`);
}

async function waitForRendererCount(manager, count, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const renderers = await manager.list();
    if (renderers.length === count) return renderers;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-12/${name}`);
}

async function findRenderer(manager, expression, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const renderer of await manager.list()) {
      if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return renderer;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-12/${name}`);
}

async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), name);
}

async function dispatchTab(renderer) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
}

async function tabUntil(renderer, expression, name, maximumTabs = 12) {
  for (let count = 0; count < maximumTabs; count += 1) {
    await dispatchTab(renderer);
    if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return;
  }
  throw new Error(`J-12/${name}`);
}

async function assertSecretsAbsentFromDataRoot(root, secrets, name) {
  const needles = secrets.flatMap((secret) => {
    const raw = Buffer.from(secret, 'utf8');
    const digest = createHash('sha256').update(raw).digest();
    const encoded = [
      secret,
      digest.toString('hex'),
      digest.toString('hex').toUpperCase(),
      digest.toString('base64'),
      digest.toString('base64url'),
    ];
    return [
      raw,
      Buffer.from(secret, 'utf16le'),
      digest,
      ...encoded.flatMap((value) => [Buffer.from(value, 'utf8'), Buffer.from(value, 'utf16le')]),
    ];
  });
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const metadata = await lstat(path);
      requireJourney(!metadata.isSymbolicLink(), `${name}-symlink`);
      if (metadata.isDirectory()) await visit(path);
      else if (metadata.isFile()) {
        const bytes = await readFile(path);
        requireJourney(!needles.some((needle) => bytes.includes(needle)), name);
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
    result = await awaitFixedOperation(
      terminal,
      CREDENTIAL_CLEANUP_TIMEOUT_MS,
      CREDENTIAL_CLEANUP_TIMEOUT,
    );
  } catch (error) {
    try {
      child.kill('SIGKILL');
    } catch {
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
  requireJourney(
    dataRoot === resolve(runRoot, 'data') && inside(runRoot, dataRoot),
    'credential-cleanup-metadata-root',
  );
  const databasePath = resolve(dataRoot, 'store', 'ai7.sqlite');
  let metadata;
  try {
    metadata = await lstat(databasePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { kind: 'not-started' };
    throw new Error('J-12/credential-cleanup-metadata');
  }
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink(), 'credential-cleanup-metadata-file');
  requireJourney((await realpath(databasePath)) === databasePath, 'credential-cleanup-metadata-file');
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    throw new Error('J-12/credential-cleanup-metadata');
  }
  try {
    database.exec('PRAGMA query_only = ON;');
    const version = database.prepare('PRAGMA user_version').get();
    requireJourney(version?.user_version === 14, 'credential-cleanup-metadata-version');
    const rows = database.prepare(
      `SELECT connection_id, role_id, connection_name, provider_id, model_id,
              adapter_revision, configuration_revision, approved_fallback_chain,
              credential_slot, credential_reference, credential_operation_state
       FROM model_service_connections
       LIMIT 2`,
    ).all();
    requireJourney(rows.length <= 1, 'credential-cleanup-metadata-cardinality');
    if (rows.length === 0) return { kind: 'not-started' };
    const row = rows[0];
    requireJourney(
      row.connection_id === 'main-editorial-deepseek-v4-pro' &&
        row.role_id === 'main-editorial' &&
        typeof row.connection_name === 'string' && row.connection_name.isWellFormed() &&
        row.connection_name.trim().length >= 1 && row.connection_name.trim().length <= 80 &&
        row.provider_id === 'deepseek-open-platform' &&
        row.model_id === 'deepseek-v4-pro' &&
        row.adapter_revision === 1 && row.configuration_revision === 1 &&
        row.approved_fallback_chain === '[]' &&
        row.credential_slot === 'deepseek-api-key' &&
        typeof row.credential_reference === 'string' && UUID_PATTERN.test(row.credential_reference) &&
        ['ready', 'missing', 'needs-attention'].includes(row.credential_operation_state),
      'credential-cleanup-metadata-binding',
    );
    return row.credential_operation_state === 'missing'
      ? { kind: 'removed' }
      : { kind: 'reference', credentialReference: row.credential_reference };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('J-12/')) throw error;
    throw new Error('J-12/credential-cleanup-metadata');
  } finally {
    database.close();
  }
}

async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>item.textContent===${JSON.stringify(label)}); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function clickBook(renderer, bookId, name) {
  await assertRenderer(renderer, `(() => { const node=document.querySelector('button[data-book-id=${JSON.stringify(bookId)}]'); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!(input instanceof HTMLInputElement))return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, name);
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

async function importBook(renderer, title) {
  await click(renderer, '导入稿件', 'import-open');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'import-target');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if(!(radio instanceof HTMLInputElement))return false; radio.click(); return radio.checked; })()`, 'import-new-book');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement))return false; radio.click(); return radio.checked; })()`, 'import-relationship');
  await fill(renderer, '#book-title', title, 'import-title');
  await click(renderer, '确认书名并复核', 'import-review');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'import-review-ready');
  await click(renderer, '新建图书并导入稿件', 'import-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'imported', 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, 'import-acknowledged', 180_000);
  const identity = await renderer.evaluate(`(() => ({ bookId: document.querySelector('.book-overview')?.dataset.bookId, revisionId: document.querySelector('button[data-record-kind="revision"]')?.dataset.recordId }))()`);
  requireJourney(UUID_PATTERN.test(identity?.bookId) && UUID_PATTERN.test(identity?.revisionId), 'import-identities');
  return identity;
}

async function importFirstManuscript(renderer, bookId) {
  await clickBook(renderer, bookId, 'existing-open-empty');
  await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookId)}][data-manuscript-state="empty"]')`, 'existing-empty-overview');
  await click(renderer, '导入首份稿件', 'existing-import-first');
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, 'existing-relationship');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement))return false; radio.click(); return radio.checked; })()`, 'existing-first-relationship');
  await click(renderer, '复核导入到所选图书', 'existing-review');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'existing-review-ready');
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='导入为首份稿件'||item.textContent==='按上述降级方式导入为首份稿件'); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, 'existing-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"] .book-overview[data-book-id=${JSON.stringify(bookId)}][data-manuscript-state="populated"]')`, 'existing-imported', 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, 'existing-acknowledged', 180_000);
}

async function saveEdit(renderer, suffix) {
  const inserted = await renderer.evaluate(`(() => { const editor=document.querySelector('[data-testid="manuscript-editor"]'); const block=editor?.querySelector('[data-block-id]'); if(!(block instanceof HTMLElement))return false; block.focus(); const range=document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText',false,${JSON.stringify(suffix)}); return block.textContent?.endsWith(${JSON.stringify(suffix)}); })()`);
  requireJourney(inserted === true, 'edit-inserted');
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='保存当前编辑')?.disabled`, 'edit-dirty');
  await click(renderer, '保存当前编辑', 'edit-save');
  await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='success' && document.querySelector('#persistence-status')?.textContent.includes('修订日志')`, 'edit-durable', 120_000);
}

async function saveMilestone(renderer) {
  await assertRenderer(renderer, `(() => { const details=document.querySelector('.milestone-section'); if(!(details instanceof HTMLDetailsElement))return false; details.open=true; return true; })()`, 'milestone-open');
  await fill(renderer, '#milestone-label', 'J12 后续修订版', 'milestone-label');
  await fill(renderer, '#milestone-purpose', '验证不可变历史读取', 'milestone-purpose');
  await fill(renderer, '#milestone-note', '本地且离线。', 'milestone-note');
  await click(renderer, '保存为里程碑版本', 'milestone-save');
  await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='success' && document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r2')`, 'milestone-saved', 120_000);
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
  let dataRootForCleanup;
  let electronExecutableForCleanup;
  let launchForCleanup;
  let managerForCleanup;
  let credentialMutationReached = false;
  let credentialReferenceForCleanup;
  let productCredentialCleanupSucceeded = false;
  let credentialCleanupFailure;
  let cleanupFailure;
  let cleanupPromise;
  let finalCleanupRequested = false;
  let activeBrowserClose;
  const closeBrowserBounded = async (ownedBrowser) => {
    if (activeBrowserClose !== undefined) return activeBrowserClose;
    if (ownedBrowser === undefined) return;
    if (!ownedBrowser.isConnected()) {
      runnerLifecycleIncomplete = true;
      throw BROWSER_DISCONNECTED;
    }
    const closePromise = ownedBrowser.close();
    closePromise.catch(() => undefined);
    let timeout;
    const boundedClose = Promise.race([
      closePromise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(BROWSER_CLOSE_TIMEOUT), BROWSER_CLOSE_TIMEOUT_MS);
      }),
    ]);
    activeBrowserClose = boundedClose;
    try {
      await boundedClose;
    } catch (error) {
      runnerLifecycleIncomplete = true;
      throw error;
    } finally {
      clearTimeout(timeout);
      if (activeBrowserClose === boundedClose) activeBrowserClose = undefined;
    }
  };
  const closeOwnedBrowser = async () => {
    const ownedBrowser = browser;
    const ownedAcquisition = browserAcquisition;
    browser = undefined;
    browserAcquisition = undefined;
    managerForCleanup = undefined;
    const acquiredBrowser =
      ownedBrowser ??
      (ownedAcquisition === undefined
        ? undefined
        : await ownedAcquisition.catch(() => undefined));
    await closeBrowserBounded(acquiredBrowser);
  };
  const closeOwnedBrowserForCleanup = async () => {
    try {
      await closeOwnedBrowser();
      return true;
    } catch (error) {
      runnerLifecycleIncomplete = true;
      cleanupFailure ??= error;
      return false;
    }
  };
  const removeSyntheticCredentialThroughProduct = async () => {
    if (managerForCleanup === undefined) return false;
    const renderers = await managerForCleanup.list();
    const cleanupRenderer = renderers[0];
    if (cleanupRenderer === undefined) return false;
    const before = await cleanupRenderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`);
    if (UUID_PATTERN.test(before?.credentialReference)) {
      requireJourney(
        credentialReferenceForCleanup === undefined || credentialReferenceForCleanup === before.credentialReference,
        'credential-cleanup-reference',
      );
      credentialReferenceForCleanup = before.credentialReference;
      if (before.credentialOperationState === 'missing') return true;
    }
    await cleanupRenderer.evaluate(`window.ai7.removeModelServiceCredential()`);
    const after = await cleanupRenderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`);
    if (UUID_PATTERN.test(after?.credentialReference)) {
      requireJourney(
        credentialReferenceForCleanup === undefined || credentialReferenceForCleanup === after.credentialReference,
        'credential-cleanup-reference',
      );
      credentialReferenceForCleanup = after.credentialReference;
    }
    requireJourney(
      after === null || after.credentialOperationState === 'missing',
      'credential-cleanup-state',
    );
    return true;
  };
  const runCleanupOnce = () => {
    cleanupPromise ??= (async () => {
      if (credentialMutationReached && !productCredentialCleanupSucceeded) {
        try {
          productCredentialCleanupSucceeded = await removeSyntheticCredentialThroughProduct();
        } catch (error) {
          credentialCleanupFailure ??= error;
        }
        if (!productCredentialCleanupSucceeded && launchForCleanup !== undefined && runRoot !== undefined) {
          const closedForProductRetry = await closeOwnedBrowserForCleanup();
          if (closedForProductRetry) {
            try {
              const cleanupManager = await launchForCleanup();
              const [cleanupRenderer] = await waitForRendererCount(cleanupManager, 1, 'credential-cleanup-window');
              await waitFor(cleanupRenderer, `document.querySelector('[data-screen="landing"]')`, 'credential-cleanup-ready');
              productCredentialCleanupSucceeded = await removeSyntheticCredentialThroughProduct();
            } catch (error) {
              credentialCleanupFailure ??= error;
            }
          }
        }
        if (!productCredentialCleanupSucceeded) {
          await closeOwnedBrowserForCleanup();
          if (credentialReferenceForCleanup === undefined && dataRootForCleanup !== undefined && runRoot !== undefined) {
            try {
              const recovered = await recoverSyntheticCredentialCleanupState(dataRootForCleanup, runRoot);
              if (recovered.kind === 'not-started' || recovered.kind === 'removed') {
                productCredentialCleanupSucceeded = true;
              } else {
                credentialReferenceForCleanup = recovered.credentialReference;
              }
            } catch (error) {
              credentialCleanupFailure ??= error;
            }
          }
          if (!productCredentialCleanupSucceeded && credentialReferenceForCleanup !== undefined) {
            try {
              requireJourney(
                electronExecutableForCleanup !== undefined,
                'credential-direct-cleanup-executable',
              );
              await removeSyntheticCredentialWithElectron(
                electronExecutableForCleanup,
                credentialReferenceForCleanup,
              );
              productCredentialCleanupSucceeded = true;
            } catch (error) {
              credentialCleanupFailure ??= error;
            }
          }
        }
      }
      await closeOwnedBrowserForCleanup();
      const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
      try {
        await ownedLoopback?.close();
      } catch (error) {
        cleanupFailure ??= error;
      }
      loopback = undefined;
      const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
      if (ownedRoot !== undefined) {
        try {
          requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j12-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
          await rm(ownedRoot, { recursive: true, force: true });
          runRoot = undefined;
        } catch (error) {
          cleanupFailure ??= error;
        }
      }
      if (credentialMutationReached && !productCredentialCleanupSucceeded) {
        throw credentialCleanupFailure ?? new Error('J-12/credential-cleanup-failed');
      }
      if (cleanupFailure !== undefined) throw cleanupFailure;
    })();
    return cleanupPromise;
  };
  const interruptOwnedBrowser = async () => {
    if (finalCleanupRequested) return;
    await closeOwnedBrowser();
  };
  const cancellation = installJourneyCancellationCleanup(runCleanupOnce, interruptOwnedBrowser);
  try {
    at('controller-loopback');
    cancellation.throwIfRequested();
    loopbackAcquisition = createLoopbackSentinel();
    loopback = await loopbackAcquisition;
    cancellation.throwIfRequested();
    at('controller-imports');
    const denial = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
    (await import(pathToFileURL(denial).href)).installNodeNetworkDenial();
    ({ Zip, ZipPassThrough, strToU8 } = await import('fflate'));
    const { electronExecutable } = await import('../tools/electron-runtime.mjs');
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    cancellation.throwIfRequested();
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j12-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j12-e2e-'), 'temp-root');
    const inputs = resolve(runRoot, 'synthetic-inputs');
    await mkdir(inputs);
    const syntheticDocx = resolve(inputs, 'public-j12-workbench.docx');
    await createSyntheticDocx(syntheticDocx);
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    dataRootForCleanup = dataRoot;
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    const launch = async (picker) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot,
        '--j12-observe-reveal', 'true', '--launcher-pid', String(process.pid),
      ];
      if (picker) args.splice(args.length - 4, 0, '--j12-picker-path', picker);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-12', browser, 'launch');
      cancellation.throwIfRequested();
      managerForCleanup = await createRendererManager(browser);
      return managerForCleanup;
    };
    launchForCleanup = launch;
    const close = closeOwnedBrowser;

    at('offline-empty-and-import');
    let manager = await launch(syntheticDocx);
    let [primary] = await waitForRendererCount(manager, 1, 'initial-window');
    await waitFor(primary, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'initial-ready');
    await primary.send('Page.setBypassCSP', { enabled: true });
    const fetchRejected = await primary.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
    await primary.send('Page.setBypassCSP', { enabled: false });
    requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'offline-product');
    const bookB = await createEmptyBook(primary, 'J12 空图书乙');
    await click(primary, '返回图书列表', 'empty-return');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'empty-returned');
    const { bookId: bookA, revisionId: revisionOne } = await importBook(primary, 'J12 公开合成图书甲');
    await click(primary, '来源版本与来源记录', 'source-record');
    await assertRenderer(primary, `document.querySelector('.record-detail[data-record-kind="source"]')?.textContent.includes('本机文件选择器') && document.querySelector('.record-detail[data-record-kind="source"]')?.textContent.includes('本地 · 未调用 Provider') && !document.body.textContent.includes(${JSON.stringify(syntheticDocx)}) && !Object.keys(window.ai7).some((key)=>key.toLowerCase().includes('path'))`, 'native-picker-provenance');

    at('distinct-and-duplicate-book-routing');
    await click(primary, '打开另一本图书', 'open-other-from-a');
    await waitFor(primary, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'chooser-a');
    await clickBook(primary, bookB, 'choose-b');
    const pages = await waitForRendererCount(manager, 2, 'two-book-windows');
    const bookBRenderer = await findRenderer(manager, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}]')`, 'book-b-window');
    await waitFor(bookBRenderer, `document.hasFocus() && document.visibilityState==='visible'`, 'book-b-focused');
    await click(bookBRenderer, '打开另一本图书', 'open-other-from-b');
    await waitFor(bookBRenderer, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'chooser-b');
    await clickBook(bookBRenderer, bookA, 'duplicate-open-a');
    requireJourney((await manager.list()).length === pages.length && pages.length === 2, 'duplicate-reused-no-third-window');
    primary = await findRenderer(manager, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'book-a-reused');
    await waitFor(primary, `document.hasFocus() && document.visibilityState==='visible'`, 'book-a-reused-focused');

    at('serialized-newest-route-wins');
    const racedRoutes = await primary.evaluate(`Promise.allSettled([
      window.ai7.openBookWorkbench({ kind: 'book', bookId: ${JSON.stringify(bookA)} }),
      window.ai7.openBookWorkbench({ kind: 'revision', revisionId: ${JSON.stringify(revisionOne)} }),
    ]).then(([older, newer]) => ({
      older: older.status === 'rejected' ? { status: older.status, code: older.reason?.code } : { status: older.status },
      newer: newer.status === 'fulfilled'
        ? { status: newer.status, target: newer.value.target, route: newer.value.route }
        : { status: newer.status, code: newer.reason?.code },
    }))`);
    requireJourney(
      racedRoutes?.older?.status === 'rejected' &&
        racedRoutes.older.code === 'AI7_SERVICE_ROUTE_STALE' &&
        racedRoutes.newer?.status === 'fulfilled' &&
        racedRoutes.newer.target === 'requesting-window' &&
        racedRoutes.newer.route?.kind === 'revision' &&
        racedRoutes.newer.route.revisionId === revisionOne,
      'newest-serialized-route-wins-with-typed-stale-result',
    );
    const restoredBookRoute = await primary.evaluate(`window.ai7.openBookWorkbench({ kind: 'book', bookId: ${JSON.stringify(bookA)} })`);
    requireJourney(
      restoredBookRoute?.target === 'requesting-window' &&
        restoredBookRoute.route?.kind === 'book' &&
        restoredBookRoute.route.bookId === bookA,
      'serialized-route-restored-to-current-book',
    );

    at('background-state-no-focus-and-later-revision');
    await click(primary, '打开稿件', 'open-editor');
    await waitFor(primary, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, 'editor-ready');
    const bookAWork = await primary.evaluate(`(async()=>{ const item=(await window.ai7.listPriorWork()).find((entry)=>entry.bookId===${JSON.stringify(bookA)}); return item ? {manuscriptId:item.manuscriptId,branchId:item.branchId} : null; })()`);
    requireJourney(UUID_PATTERN.test(bookAWork?.manuscriptId) && UUID_PATTERN.test(bookAWork?.branchId), 'book-a-manuscript-route-identity');
    at('close-risk-route-preservation');
    const routeRiskSuffix = '，J12 路由风险保护';
    const riskyEditInserted = await primary.evaluate(`(() => { const editor=document.querySelector('[data-testid="manuscript-editor"]'); const block=editor?.querySelector('[data-block-id]'); if(!(block instanceof HTMLElement))return false; block.focus(); const range=document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText',false,${JSON.stringify(routeRiskSuffix)}); return block.textContent?.endsWith(${JSON.stringify(routeRiskSuffix)}); })()`);
    requireJourney(riskyEditInserted === true, 'close-risk-edit-inserted');
    await waitFor(primary, `document.documentElement.dataset.ai7CloseRisk==='true' && !Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='保存当前编辑')?.disabled`, 'close-risk-advertised');
    at('close-risk-same-window-request');
    const sameWindowRisk = await primary.evaluate(`(async()=>{ const active=document.activeElement; const result=await window.ai7.openBookWorkbench({kind:'revision',revisionId:${JSON.stringify(revisionOne)}}).then(value=>({accepted:true,value}),error=>({accepted:false,code:error?.code,message:error?.message})); return {result,route:await window.ai7.getBookWorkbenchRoute(),activePreserved:active===document.activeElement,dirty:document.documentElement.dataset.ai7CloseRisk==='true'&&document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.textContent.endsWith(${JSON.stringify(routeRiskSuffix)})}; })()`);
    requireJourney(
      sameWindowRisk?.result?.accepted === false &&
        sameWindowRisk.result.code === 'AI7_WORKBENCH_CLOSE_RISK' &&
        sameWindowRisk.result.message?.startsWith('未切换、未聚焦') &&
        sameWindowRisk.route?.kind === 'book' &&
        sameWindowRisk.route.bookId === bookA &&
        sameWindowRisk.activePreserved === true &&
        sameWindowRisk.dirty === true,
      'same-window-risk-route-rejected-without-mutation',
    );
    const routeEventBeforeRisk = await primary.evaluate(`document.documentElement.dataset.ai7BookWorkbenchRouteGeneration??null`);
    at('close-risk-cross-window-focus');
    const focusedBookB = await bookBRenderer.evaluate(`window.ai7.openBookWorkbench({kind:'book',bookId:${JSON.stringify(bookB)}})`);
    requireJourney(
      focusedBookB?.target === 'requesting-window' &&
        focusedBookB.route?.kind === 'book' &&
        focusedBookB.route.bookId === bookB,
      'risk-book-b-public-focus-route',
    );
    await waitFor(bookBRenderer, `document.hasFocus() && document.visibilityState==='visible'`, 'risk-book-b-focused');
    await assertRenderer(primary, `!document.hasFocus()`, 'risk-book-a-not-focused');
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    at('close-risk-cross-window-request');
    const crossWindowRisk = await bookBRenderer.evaluate(`window.ai7.openBookWorkbench({kind:'revision',revisionId:${JSON.stringify(revisionOne)}}).then(value=>({accepted:true,value}),error=>({accepted:false,code:error?.code,message:error?.message}))`);
    requireJourney(
      crossWindowRisk?.accepted === false &&
        crossWindowRisk.code === 'AI7_WORKBENCH_CLOSE_RISK' &&
        crossWindowRisk.message?.startsWith('未切换、未聚焦'),
      'cross-window-risk-route-rejected',
    );
    at('close-risk-capability-preservation');
    const riskPreserved = await primary.evaluate(`(async()=>{ const outline=await window.ai7.getOutline({manuscriptId:${JSON.stringify(bookAWork.manuscriptId)},branchId:${JSON.stringify(bookAWork.branchId)},cursor:null}); return {route:await window.ai7.getBookWorkbenchRoute(),routeEvent:document.documentElement.dataset.ai7BookWorkbenchRouteGeneration??null,dirty:document.documentElement.dataset.ai7CloseRisk==='true'&&document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.textContent.endsWith(${JSON.stringify(routeRiskSuffix)}),outlineIdentity:outline.manuscriptId===${JSON.stringify(bookAWork.manuscriptId)}&&outline.branchId===${JSON.stringify(bookAWork.branchId)}}; })()`);
    const riskFocus = await Promise.all([
      primary.evaluate(`document.hasFocus()`),
      bookBRenderer.evaluate(`document.hasFocus()`),
      bookBRenderer.evaluate(`window.ai7.getBookWorkbenchRoute()`),
    ]);
    requireJourney(
      riskPreserved?.route?.kind === 'book' &&
        riskPreserved.route.bookId === bookA &&
        riskPreserved.routeEvent === routeEventBeforeRisk &&
        riskPreserved.dirty === true &&
        riskPreserved.outlineIdentity === true &&
        riskFocus[0] === false &&
        riskFocus[1] === true &&
        riskFocus[2]?.kind === 'book' &&
        riskFocus[2].bookId === bookB,
      'cross-window-risk-preserved-route-capability-content-and-focus',
    );
    at('background-journal-non-focus-steal');
    await click(primary, '保存当前编辑', 'background-risk-edit-save');
    await waitFor(primary, `document.querySelector('#persistence-status')?.dataset.tone==='success' && document.querySelector('#persistence-status')?.textContent.includes('修订日志') && document.documentElement.dataset.ai7CloseRisk==='false'`, 'background-risk-edit-durable', 120_000);
    await assertRenderer(bookBRenderer, `document.hasFocus() && document.visibilityState==='visible'`, 'background-journal-kept-book-b-focus');
    await assertRenderer(primary, `!document.hasFocus()`, 'background-journal-did-not-focus-book-a');
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    const clearedRiskReuse = await bookBRenderer.evaluate(`window.ai7.openBookWorkbench({kind:'revision',revisionId:${JSON.stringify(revisionOne)}})`);
    requireJourney(
      clearedRiskReuse?.target === 'existing-window' &&
        clearedRiskReuse.route?.kind === 'revision' &&
        clearedRiskReuse.route.revisionId === revisionOne,
      'cleared-risk-existing-window-reused',
    );
    await waitFor(primary, `document.hasFocus() && document.querySelector('[data-screen="historical-revision"] [data-revision-id=${JSON.stringify(revisionOne)}]')`, 'cleared-risk-revision-focused');
    await click(primary, '返回当前工作状态', 'cleared-risk-return-current');
    await waitFor(primary, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')?.textContent.includes(${JSON.stringify(routeRiskSuffix)})`, 'cleared-risk-current-restored');
    const editableTextBeforeRace = await primary.evaluate(`document.querySelector('[data-testid="manuscript-editor"]')?.textContent`);
    const editableReadRace = await primary.evaluate(`Promise.allSettled([
      window.ai7.getManuscriptWindowAt({manuscriptId:${JSON.stringify(bookAWork.manuscriptId)},branchId:${JSON.stringify(bookAWork.branchId)},target:{kind:'start'}}),
      window.ai7.openBookWorkbench({kind:'revision',revisionId:${JSON.stringify(revisionOne)}}),
    ]).then(([older,newer])=>({
      older:older.status==='rejected'?{status:older.status,code:older.reason?.code}:{status:older.status},
      newer:newer.status==='fulfilled'?{status:newer.status,route:newer.value.route}:{status:newer.status,code:newer.reason?.code},
      route:window.ai7.getBookWorkbenchRoute(),
      editorText:document.querySelector('[data-testid="manuscript-editor"]')?.textContent,
    })).then(async(result)=>({...result,route:await result.route}))`);
    requireJourney(
      editableReadRace?.older?.status === 'rejected' &&
        editableReadRace.older.code === 'AI7_SERVICE_ROUTE_STALE' &&
        editableReadRace.newer?.status === 'fulfilled' &&
        editableReadRace.newer.route?.kind === 'revision' &&
        editableReadRace.newer.route.revisionId === revisionOne &&
        editableReadRace.route?.kind === 'revision' &&
        editableReadRace.route.revisionId === revisionOne &&
        editableReadRace.editorText === editableTextBeforeRace,
      'stale-editable-read-rejected-before-paint',
    );
    const returnedToBookAfterRace = await primary.evaluate(`(async()=>{ const opened=await window.ai7.openBookWorkbench({kind:'book',bookId:${JSON.stringify(bookA)}}); const page=await window.ai7.getManuscriptWindowAt({manuscriptId:${JSON.stringify(bookAWork.manuscriptId)},branchId:${JSON.stringify(bookAWork.branchId)},target:{kind:'start'}}); return {opened,pageBookId:page.bookId}; })()`);
    requireJourney(
      returnedToBookAfterRace?.opened?.target === 'requesting-window' &&
        returnedToBookAfterRace.opened.route?.kind === 'book' &&
        returnedToBookAfterRace.opened.route.bookId === bookA &&
        returnedToBookAfterRace.pageBookId === bookA,
      'editable-route-restored-after-stale-read',
    );
    const editSuffix = '，J12 当前工作状态';
    await saveEdit(primary, editSuffix);
    requireJourney((await manager.list()).length === 2, 'background-no-window-created');
    await assertRenderer(primary, `document.hasFocus() && document.visibilityState==='visible'`, 'background-no-focus-steal');
    const imeGuarded = await primary.evaluate(`(() => { const editor=document.querySelector('[data-testid="manuscript-editor"]'); if(!(editor instanceof HTMLElement))return false; editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'组合'})); const command=new KeyboardEvent('keydown',{key:'f',ctrlKey:${process.platform === 'darwin' ? 'false' : 'true'},metaKey:${process.platform === 'darwin' ? 'true' : 'false'},isComposing:true,bubbles:true,cancelable:true}); editor.dispatchEvent(command); editor.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'组合'})); return command.defaultPrevented && document.activeElement!==document.querySelector('#manuscript-search'); })()`);
    requireJourney(imeGuarded === true, 'j14-ime-command-guard');
    await saveMilestone(primary);
    await click(primary, '返回图书工作概览', 'back-overview');
    await waitFor(primary, `document.querySelector('[data-screen="book-overview"] .book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'overview-r2');
    await assertRenderer(primary, `document.querySelectorAll('button[data-record-kind="revision"]').length>=2`, 'revision-history-visible');

    at('exact-immutable-history');
    await assertRenderer(primary, `(() => { const node=document.querySelector('button[data-record-kind="revision"][data-record-id=${JSON.stringify(revisionOne)}]'); if(!(node instanceof HTMLButtonElement))return false; node.click(); return true; })()`, 'open-r1-record');
    await click(primary, '打开此历史修订版', 'route-r1');
    await waitFor(primary, `document.querySelector('[data-screen="historical-revision"] [data-revision-id=${JSON.stringify(revisionOne)}][data-read-only="true"]')`, 'historical-r1');
    requireJourney((await manager.list()).length === 2, 'revision-route-reused-no-third-window');
    const historicalRoute = await primary.evaluate(`window.ai7.getBookWorkbenchRoute()`);
    requireJourney(
      historicalRoute?.kind === 'revision' &&
        historicalRoute.bookId === bookA &&
        historicalRoute.revisionId === revisionOne,
      'historical-exact-route-owned',
    );
    await assertRenderer(primary, `(() => { const view=document.querySelector('.historical-revision-viewer'); const blocks=document.querySelectorAll('.historical-revision-blocks>[data-block-id]'); return view?.dataset.bookId===${JSON.stringify(bookA)} && Number(view.dataset.blockCount)===blocks.length && blocks.length>0 && blocks.length<=32 && !view.textContent.includes(${JSON.stringify(editSuffix)}) && !document.querySelector('[data-testid="manuscript-editor"]') && !document.querySelector('[contenteditable="true"]') && !Array.from(view.querySelectorAll('button')).some((item)=>['保存当前编辑','撤销','重做','保存为里程碑版本'].includes(item.textContent??'')) && view.textContent.includes('不提供写入'); })()`, 'immutable-readonly-reconstruction');
    await primary.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await primary.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(primary, `document.documentElement.scrollWidth<=document.documentElement.clientWidth+2 && document.querySelector('[data-return-to-current-revision]')!==null`, 'j14-zoom-200-reflow');
    await primary.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(primary, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.historical-revision-viewer')).boxShadow==='none' && getComputedStyle(document.querySelector('button')).borderStyle!=='none'`, 'j14-forced-colors');
    await primary.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await primary.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await primary.send('Emulation.clearDeviceMetricsOverride');
    await click(primary, '返回当前工作状态', 'return-current');
    await waitFor(primary, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, 'current-editable');
    await assertRenderer(primary, `document.querySelector('[data-testid="manuscript-editor"]')?.textContent.includes(${JSON.stringify(editSuffix)}) && document.querySelector('[data-testid="manuscript-editor"]')?.getAttribute('contenteditable')==='true'`, 'current-state-editable');

    at('sender-owned-import-draft');
    await close();
    manager = await launch(syntheticDocx);
    [primary] = await waitForRendererCount(manager, 1, 'draft-initial-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'draft-landing');
    await clickBook(primary, bookA, 'draft-open-a');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'draft-a-overview');
    await click(primary, '打开另一本图书', 'draft-open-other');
    await waitFor(primary, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'draft-chooser');
    await clickBook(primary, bookB, 'draft-open-b');
    await waitForRendererCount(manager, 2, 'draft-two-windows');
    const draftBookBRenderer = await findRenderer(manager, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}]')`, 'draft-b-window');
    const stagedDraft = await primary.evaluate(`window.ai7.selectAndStageDocx()`);
    requireJourney(stagedDraft?.status === 'staged' && UUID_PATTERN.test(stagedDraft.staged?.draftId), 'draft-native-selection');
    const foreignImportStartup = await draftBookBRenderer.evaluate(`window.ai7.getImportStartup().then(()=>({accepted:true}),error=>({accepted:false,code:error?.code}))`);
    requireJourney(
      foreignImportStartup?.accepted === false && foreignImportStartup.code === 'AI7_IMPORT_DRAFT_CAPABILITY_INVALID',
      'draft-global-startup-reacquisition-rejected',
    );
    const foreignDraft = await draftBookBRenderer.evaluate(`window.ai7.continueImportDraft({draftId:${JSON.stringify(stagedDraft.staged.draftId)},expectedDraftVersion:${JSON.stringify(stagedDraft.staged.draftVersion)}}).then(()=>({accepted:true}),error=>({accepted:false,code:error?.code}))`);
    requireJourney(foreignDraft?.accepted === false && foreignDraft.code === 'AI7_IMPORT_DRAFT_CAPABILITY_INVALID', 'draft-cross-window-rejected');
    const abandonedDraft = await primary.evaluate(`window.ai7.abandonImportDraft({draftId:${JSON.stringify(stagedDraft.staged.draftId)},expectedDraftVersion:${JSON.stringify(stagedDraft.staged.draftVersion)}})`);
    const draftRoutes = await Promise.all([
      primary.evaluate(`window.ai7.getBookWorkbenchRoute()`),
      draftBookBRenderer.evaluate(`window.ai7.getBookWorkbenchRoute()`),
    ]);
    requireJourney(
      abandonedDraft?.state === 'none' &&
        draftRoutes[0] === null &&
        draftRoutes[1]?.kind === 'book' &&
        draftRoutes[1].bookId === bookB,
      'draft-rejection-left-routes-and-durable-state-unchanged',
    );

    at('sender-owned-editor-capabilities');
    await close();
    manager = await launch(syntheticDocx);
    [primary] = await waitForRendererCount(manager, 1, 'capability-initial-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'capability-landing');
    at('sender-owned-editor-capabilities-import-b');
    await importFirstManuscript(primary, bookB);
    at('sender-owned-editor-capabilities-seed-b');
    const bookBWork = await primary.evaluate(`(async()=>{ const item=(await window.ai7.listPriorWork()).find((entry)=>entry.bookId===${JSON.stringify(bookB)}); return item ? {manuscriptId:item.manuscriptId,branchId:item.branchId} : null; })()`);
    requireJourney(UUID_PATTERN.test(bookBWork?.manuscriptId) && UUID_PATTERN.test(bookBWork?.branchId), 'book-b-manuscript-route-identity');
    const bookBPage = await primary.evaluate(`window.ai7.getManuscriptWindowAt({manuscriptId:${JSON.stringify(bookBWork.manuscriptId)},branchId:${JSON.stringify(bookBWork.branchId)},target:{kind:'start'}})`);
    requireJourney(bookBPage?.bookId === bookB && bookBPage.blocks?.length > 0, 'book-b-capability-seeded');
    const bookBBefore = {
      workingDigest: bookBPage.workingDigest,
      blockText: bookBPage.blocks[0].text,
    };
    await click(primary, '打开另一本图书', 'capability-open-other');
    await waitFor(primary, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'capability-chooser');
    await clickBook(primary, bookA, 'capability-open-a');
    await waitForRendererCount(manager, 2, 'capability-two-windows');
    const bookARenderer = await findRenderer(manager, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'capability-a-window');
    const bookBReseeded = await primary.evaluate(`window.ai7.getManuscriptWindowAt({manuscriptId:${JSON.stringify(bookBWork.manuscriptId)},branchId:${JSON.stringify(bookBWork.branchId)},target:{kind:'start'}})`);
    requireJourney(bookBReseeded?.bookId === bookB, 'book-b-capability-reseeded-after-explicit-route-request');
    at('sender-owned-editor-capabilities-foreign-manuscript');
    const foreignManuscript = await bookARenderer.evaluate(`(async()=>{
      const read=await window.ai7.getManuscriptWindowAt({manuscriptId:${JSON.stringify(bookBWork.manuscriptId)},branchId:${JSON.stringify(bookBWork.branchId)},target:{kind:'start'}}).then(()=>({accepted:true}),error=>({accepted:false,code:error?.code}));
      const write=await window.ai7.flushJournalEdit(${JSON.stringify({
        clientEditId: '00000000-0000-4000-8000-000000001212',
        manuscriptId: bookBWork.manuscriptId,
        branchId: bookBWork.branchId,
        baseRevisionId: bookBPage.revisionId,
        blockId: bookBPage.blocks[0].blockId,
        windowStartBlockId: bookBPage.blocks[0].blockId,
        baseBlockDigest: bookBPage.blocks[0].digest,
        expectedJournalSequence: bookBPage.journalSequence,
        fromGrapheme: 0,
        toGrapheme: 0,
        insertText: '禁止跨窗口写入',
      })}).then(()=>({accepted:true}),error=>({accepted:false,code:error?.code}));
      return {read,write,route:await window.ai7.getBookWorkbenchRoute()};
    })()`);
    requireJourney(
      foreignManuscript?.read?.accepted === false &&
        foreignManuscript.read.code === 'AI7_EDITOR_ROUTE_INVALID' &&
        foreignManuscript.write?.accepted === false &&
        foreignManuscript.write.code === 'AI7_EDITOR_CAPABILITY_INVALID' &&
        foreignManuscript.route?.kind === 'book' &&
        foreignManuscript.route.bookId === bookA,
      'cross-book-manuscript-read-write-rejected',
    );
    at('sender-owned-editor-capabilities-start-search');
    const searchJobCall = await primary.evaluate(`window.ai7.startSearch({manuscriptId:${JSON.stringify(bookBWork.manuscriptId)},branchId:${JSON.stringify(bookBWork.branchId)},query:'J12'}).then(job=>({ok:true,job}),error=>({ok:false,code:error?.code}))`);
    requireJourney(searchJobCall?.ok === true, `book-b-search-${searchJobCall?.code ?? 'unknown'}`);
    const searchJob = searchJobCall.job;
    requireJourney(UUID_PATTERN.test(searchJob?.jobId) && searchJob.kind === 'search', 'book-b-search-job');
    at('sender-owned-editor-capabilities-foreign-job');
    const foreignJob = await bookARenderer.evaluate(`window.ai7.pollServiceJob({jobId:${JSON.stringify(searchJob.jobId)}}).then(()=>({accepted:true}),error=>({accepted:false,code:error?.code}))`);
    requireJourney(foreignJob?.accepted === false && foreignJob.code === 'AI7_EDITOR_CAPABILITY_INVALID', 'cross-window-job-rejected');
    at('sender-owned-editor-capabilities-complete-search');
    const completedSearch = await primary.evaluate(`(async()=>{ let job=${JSON.stringify(searchJob)}; for(let index=0;index<80&&job.state!=='completed';index+=1){ job=await window.ai7.pollServiceJob({jobId:job.jobId}); if(job.state!=='completed')await new Promise(resolve=>setTimeout(resolve,10)); } return job; })()`);
    requireJourney(completedSearch?.state === 'completed' && UUID_PATTERN.test(completedSearch.result?.searchId), 'book-b-search-completed');
    at('sender-owned-editor-capabilities-foreign-search');
    const foreignSearch = await bookARenderer.evaluate(`window.ai7.getSearchResults({searchId:${JSON.stringify(completedSearch.result.searchId)},cursor:null}).then(()=>({accepted:true}),error=>({accepted:false,code:error?.code}))`);
    requireJourney(foreignSearch?.accepted === false && foreignSearch.code === 'AI7_EDITOR_CAPABILITY_INVALID', 'cross-window-search-rejected');
    at('sender-owned-editor-capabilities-preview');
    const replacementPreview = await primary.evaluate(`window.ai7.prepareReplacement({searchId:${JSON.stringify(completedSearch.result.searchId)},replacement:'J12',excludedMatchIds:[]})`);
    requireJourney(UUID_PATTERN.test(replacementPreview?.previewId), 'book-b-preview-created');
    at('sender-owned-editor-capabilities-foreign-preview');
    const foreignPreview = await bookARenderer.evaluate(`window.ai7.freezeReplacement({previewId:${JSON.stringify(replacementPreview.previewId)},excludedMatchIds:[]}).then(()=>({accepted:true}),error=>({accepted:false,code:error?.code}))`);
    requireJourney(foreignPreview?.accepted === false && foreignPreview.code === 'AI7_EDITOR_CAPABILITY_INVALID', 'cross-window-preview-rejected');
    at('sender-owned-editor-capabilities-final');
    await primary.evaluate(`window.ai7.dismissReplacementPreview({previewId:${JSON.stringify(replacementPreview.previewId)}})`);
    const bookBAfter = await primary.evaluate(`window.ai7.getManuscriptWindowAt({manuscriptId:${JSON.stringify(bookBWork.manuscriptId)},branchId:${JSON.stringify(bookBWork.branchId)},target:{kind:'start'}})`);
    const capabilityRoutes = await Promise.all([
      primary.evaluate(`window.ai7.getBookWorkbenchRoute()`),
      bookARenderer.evaluate(`window.ai7.getBookWorkbenchRoute()`),
    ]);
    requireJourney(
      bookBAfter?.workingDigest === bookBBefore.workingDigest &&
        bookBAfter.blocks?.[0]?.text === bookBBefore.blockText &&
        capabilityRoutes[0]?.kind === 'book' &&
        capabilityRoutes[0].bookId === bookB &&
        capabilityRoutes[1]?.kind === 'book' &&
        capabilityRoutes[1].bookId === bookA,
      'cross-window-rejections-preserved-target-content-and-routes',
    );
    at('effect-before-route-arrival-order');
    const effectSuffix = '，J12 队列效果';
    const effectRouteRace = await primary.evaluate(`Promise.allSettled([
      window.ai7.flushJournalEdit(${JSON.stringify({
        clientEditId: '00000000-0000-4000-8000-000000001213',
        manuscriptId: bookBWork.manuscriptId,
        branchId: bookBWork.branchId,
        baseRevisionId: bookBReseeded.revisionId,
        blockId: bookBReseeded.blocks[0].blockId,
        windowStartBlockId: bookBReseeded.blocks[0].blockId,
        baseBlockDigest: bookBReseeded.blocks[0].digest,
        expectedJournalSequence: bookBReseeded.journalSequence,
        fromGrapheme: Array.from(bookBReseeded.blocks[0].text).length,
        toGrapheme: Array.from(bookBReseeded.blocks[0].text).length,
        insertText: effectSuffix,
      })}),
      window.ai7.openBookWorkbench({kind:'revision',revisionId:${JSON.stringify(bookBPage.revisionId)}}),
    ]).then(async([effect,route])=>({
      effect:effect.status==='fulfilled'?{status:effect.status,sequence:effect.value.sequence,label:effect.value.completionLabel}:{status:effect.status,code:effect.reason?.code},
      route:route.status==='fulfilled'?{status:route.status,target:route.value.target,route:route.value.route}:{status:route.status,code:route.reason?.code},
      finalRoute:await window.ai7.getBookWorkbenchRoute(),
    }))`);
    requireJourney(
      effectRouteRace?.effect?.status === 'fulfilled' &&
        effectRouteRace.effect.sequence === bookBReseeded.journalSequence + 1 &&
        effectRouteRace.effect.label === '已写入修订日志' &&
        effectRouteRace.route?.status === 'fulfilled' &&
        effectRouteRace.route.target === 'requesting-window' &&
        effectRouteRace.route.route?.kind === 'revision' &&
        effectRouteRace.route.route.revisionId === bookBPage.revisionId &&
        effectRouteRace.finalRoute?.kind === 'revision' &&
        effectRouteRace.finalRoute.revisionId === bookBPage.revisionId,
      'effect-classified-success-before-later-route',
    );
    const effectPersisted = await primary.evaluate(`(async()=>{ const opened=await window.ai7.openBookWorkbench({kind:'book',bookId:${JSON.stringify(bookB)}}); const page=await window.ai7.getManuscriptWindowAt({manuscriptId:${JSON.stringify(bookBWork.manuscriptId)},branchId:${JSON.stringify(bookBWork.branchId)},target:{kind:'start'}}); return {opened,text:page.blocks[0]?.text,route:await window.ai7.getBookWorkbenchRoute()}; })()`);
    requireJourney(
      effectPersisted?.opened?.target === 'requesting-window' &&
        effectPersisted.opened.route?.kind === 'book' &&
        effectPersisted.opened.route.bookId === bookB &&
        effectPersisted.text === `${bookBBefore.blockText}${effectSuffix}` &&
        effectPersisted.route?.kind === 'book' &&
        effectPersisted.route.bookId === bookB,
      'effect-durable-and-route-restored',
    );

    at('existing-book-source-commit-preflight');
    await close();
    manager = await launch(syntheticDocx);
    [primary] = await waitForRendererCount(manager, 1, 'preflight-initial-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'preflight-landing');
    await clickBook(primary, bookA, 'preflight-open-a');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-a-overview');
    await click(primary, '打开另一本图书', 'preflight-open-other');
    await waitFor(primary, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'preflight-chooser');
    await clickBook(primary, bookB, 'preflight-open-b');
    await waitForRendererCount(manager, 2, 'preflight-two-books');
    const bookBRendererForPreflight = await findRenderer(manager, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}]')`, 'preflight-b-window');
    await click(primary, '返回当前图书', 'preflight-return-a');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-a-returned');
    await click(primary, '返回图书列表', 'preflight-release-a');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'preflight-library-window');
    await click(bookBRendererForPreflight, '打开另一本图书', 'preflight-b-open-other');
    await waitFor(bookBRendererForPreflight, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'preflight-b-chooser');
    await clickBook(bookBRendererForPreflight, bookA, 'preflight-b-open-a');
    await waitForRendererCount(manager, 3, 'preflight-library-and-two-books');
    const registeredBookA = await findRenderer(manager, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-registered-a');
    const sourceRecordsBefore = await registeredBookA.evaluate(`(async()=>{ const overview=await window.ai7.getBookOverview({bookId:${JSON.stringify(bookA)},historyCursor:null}); return overview.records.filter((record)=>record.kind==='source-import-record').length; })()`);
    await click(primary, '导入稿件', 'preflight-stage-source');
    await waitFor(primary, `document.querySelector('[data-screen="target"]')`, 'preflight-source-target');
    await assertRenderer(primary, `(() => { const target=document.querySelector('input[data-import-target-choice="existing-book"][data-book-id=${JSON.stringify(bookA)}]'); if(!(target instanceof HTMLInputElement))return false; target.click(); return target.checked; })()`, 'preflight-select-a');
    await assertRenderer(primary, `(() => { const source=document.querySelector('input[data-import-relationship="source-only"]'); if(!(source instanceof HTMLInputElement))return false; source.click(); return source.checked; })()`, 'preflight-source-only');
    await waitFor(primary, `document.querySelector('[data-source-version-reuse-choices]')`, 'preflight-reuse-required');
    await assertRenderer(primary, `(() => { const reuse=document.querySelector('[data-reuse-source-version-id]'); if(!(reuse instanceof HTMLInputElement))return false; reuse.click(); return reuse.checked; })()`, 'preflight-reuse-source');
    await click(primary, '复核来源材料导入', 'preflight-prepare-source');
    await waitFor(primary, `document.querySelector('[data-screen="review"] [data-import-review-kind="source-only"]')`, 'preflight-source-review');
    await click(primary, '导入来源材料到所选图书', 'preflight-commit-source');
    await waitFor(primary, `document.querySelector('#persistence-status')?.dataset.tone==='error' && document.querySelector('#persistence-status')?.textContent.includes('已显示这本图书现有的工作台') && document.querySelector('#persistence-status')?.textContent.includes('来源材料未提交') && !document.querySelector('[data-commit-source-import]')?.disabled`, 'preflight-duplicate-rejected');
    await waitFor(registeredBookA, `document.hasFocus() && document.visibilityState==='visible'`, 'preflight-existing-a-focused');
    const sourceRecordsAfter = await registeredBookA.evaluate(`(async()=>{ const overview=await window.ai7.getBookOverview({bookId:${JSON.stringify(bookA)},historyCursor:null}); return overview.records.filter((record)=>record.kind==='source-import-record').length; })()`);
    requireJourney(sourceRecordsBefore === sourceRecordsAfter && (await manager.list()).length === 3, 'preflight-no-durable-commit-or-window');
    await click(primary, '取消导入', 'preflight-abandon-source');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'preflight-abandoned');

    at('restart-and-data-location');
    await close();
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'restart-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'restart-landing');
    await clickBook(primary, bookA, 'restart-open-a');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'restart-a-overview');
    await click(primary, '打开稿件', 'restart-open-editor');
    await waitFor(primary, `document.querySelector('[data-testid="manuscript-editor"]')?.textContent.includes(${JSON.stringify(editSuffix)})`, 'restart-persisted-edit');
    await click(primary, '返回图书工作概览', 'restart-back-overview');
    await waitFor(primary, `document.querySelector('[data-screen="book-overview"]')`, 'restart-overview');
    await click(primary, '返回图书列表', 'restart-return-library');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'restart-library');
    await click(primary, '数据与存储', 'data-storage-open');
    await waitFor(primary, `document.querySelector('[data-screen="data-storage"]')`, 'data-storage-ready');
    await assertRenderer(primary, `(() => { const view=document.querySelector('.data-storage-summary'); return view?.dataset.platform===${JSON.stringify(process.platform === 'win32' ? 'windows' : 'macos')} && view.dataset.runtimeForm==='source-checkout' && view.dataset.footprintMaximumEntries==='128' && document.querySelector('[data-product-data-root]')?.textContent===${JSON.stringify(dataRoot)} && view.textContent.includes('Product Data Location') && view.textContent.includes('凭据与产品数据分开') && view.textContent.includes(${JSON.stringify(process.platform === 'win32' ? 'Windows 凭据管理器' : 'macOS 钥匙串')}) && !Object.keys(window.ai7).some((key)=>key.toLowerCase().includes('path')); })()`, 'truthful-data-location');
    await primary.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab' });
    await primary.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
    await assertRenderer(primary, `document.activeElement instanceof HTMLButtonElement && document.activeElement.matches(':focus-visible')`, 'j14-keyboard-visible-focus');
    await click(primary, '查看数据位置', 'reveal-data');
    await waitFor(primary, `document.querySelector('.data-storage-summary')?.dataset.revealRequested==='requested'`, 'reveal-requested');
    await assertRenderer(primary, `document.querySelector('.data-storage-summary')?.dataset.nativeRevealSuppressedForE2e==='true'`, 'main-owned-zero-argument-reveal');

    at('model-service-first-save');
    await click(primary, '返回', 'data-storage-return');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'model-service-landing');
    await click(primary, '模型服务', 'model-service-open');
    await waitFor(primary, `document.querySelector('[data-screen="model-service"]')`, 'model-service-ready');
    await assertRenderer(primary, `(() => {
      const roles=Array.from(document.querySelectorAll('[data-model-role]'));
      const ids=roles.map((node)=>node.dataset.modelRole);
      const main=document.querySelector('[data-model-role="main-editorial"]');
      const statuses=Array.from(document.querySelectorAll('[data-model-role] [role="status"]'));
      const integrity=document.querySelector('[data-policy-integrity-state="verified"]');
      return roles.length===4 &&
        JSON.stringify(ids)===JSON.stringify(['fast-interaction','main-editorial','difficult-escalation','frontier']) &&
        main?.dataset.modelRoleStatus==='setup-required' &&
        main.textContent.includes('DeepSeek 开放平台（官方）') && main.textContent.includes('DeepSeek V4 Pro High') &&
        main.textContent.includes('已批准备用链') && main.textContent.includes('无') &&
        roles.filter((node)=>node.dataset.modelRole!=='main-editorial').every((node)=>node.dataset.modelRoleStatus==='setup-required'&&!node.textContent.includes('DeepSeek')) &&
        statuses.length===4 && statuses.every((node)=>node.getAttribute('aria-label')?.includes(node.textContent??'')) &&
        document.querySelector('.model-service-settings')?.dataset.policyIntegrity==='verified' &&
        document.querySelector('.model-service-settings')?.dataset.providerTransmissionCount==='0' &&
        integrity?.textContent.includes('策略完整性：已验证') &&
        integrity.textContent.includes('零次实时传输') &&
        document.body.textContent.includes('公开发布许可：不存在');
    })()`, 'four-role-first-policy-semantics');
    await tabUntil(primary, `document.activeElement?.id==='main-editorial-connection-name' && document.activeElement.matches(':focus-visible')`, 'model-settings-keyboard-connection');
    await dispatchTab(primary);
    await assertRenderer(primary, `document.activeElement?.id==='main-editorial-credential' && document.activeElement.matches(':focus-visible')`, 'model-settings-keyboard-credential');
    await dispatchTab(primary);
    await assertRenderer(primary, `document.activeElement instanceof HTMLButtonElement && document.activeElement.type==='submit' && document.activeElement.textContent==='保护并保存' && document.activeElement.matches(':focus-visible')`, 'model-settings-keyboard-action');
    const secretOne = randomBytes(48).toString('base64url');
    const secretTwo = randomBytes(48).toString('base64url');
    await fill(primary, '#main-editorial-connection-name', 'J12 主编辑连接', 'model-connection-name');
    await fill(primary, '#main-editorial-credential', secretOne, 'model-credential-first');
    credentialMutationReached = true;
    await click(primary, '保护并保存', 'model-credential-save');
    await waitFor(primary, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('[data-credential-state="ready"]')`, 'model-credential-ready');
    await assertRenderer(primary, `(() => { const input=document.querySelector('#main-editorial-credential'); return input instanceof HTMLInputElement && input.type==='password' && input.autocomplete==='off' && input.value==='' && !document.body.textContent.includes(${JSON.stringify(secretOne)}); })()`, 'model-secret-not-redisplayed');
    const firstConnection = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>({
      roles:settings.roles.length,
      roleIds:settings.roles.map((role)=>role.roleId),
      connection:settings.roles.find((role)=>role.roleId==='main-editorial')?.connection,
      binding:settings.roles.find((role)=>role.roleId==='main-editorial')?.binding,
      policy:settings.launchPolicy,
    }))`);
    requireJourney(
      firstConnection?.roles === 4 &&
        JSON.stringify(firstConnection.roleIds) === JSON.stringify(['fast-interaction','main-editorial','difficult-escalation','frontier']) &&
        UUID_PATTERN.test(firstConnection.connection?.credentialReference) &&
        firstConnection.connection?.connectionName === 'J12 主编辑连接' &&
        firstConnection.connection?.credentialOperationState === 'ready' &&
        firstConnection.binding?.providerId === 'deepseek-open-platform' &&
        firstConnection.binding?.modelId === 'deepseek-v4-pro' &&
        firstConnection.binding?.adapterRevision === 1 &&
        firstConnection.binding?.configurationRevision === 1 &&
        firstConnection.binding?.credentialSlot === 'deepseek-api-key' &&
        firstConnection.binding?.approvedFallbackChain?.length === 0 &&
        firstConnection.policy?.operationalScope === 'development-ci' &&
        firstConnection.policy?.activePolicySetVersion === 'v3' &&
        firstConnection.policy?.providerProcessing?.version === 'v1' &&
        firstConnection.policy?.providerProcessing?.authorizedLiveTransmissionCount === 0 &&
        firstConnection.policy?.externalExport?.version === 'v1' &&
        firstConnection.policy?.externalExport?.policyEligibilityIsEffectApproval === false &&
        firstConnection.policy?.publicReleasePermission?.present === false,
      'model-first-nonsecret-projection',
    );
    credentialReferenceForCleanup = firstConnection.connection.credentialReference;
    await primary.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await primary.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(primary, `document.documentElement.scrollWidth<=document.documentElement.clientWidth+2 && getComputedStyle(document.querySelector('.model-role-grid')).gridTemplateColumns.split(' ').length===1`, 'model-settings-zoom-reflow');
    await primary.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(primary, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.model-role-card')).boxShadow==='none' && getComputedStyle(document.querySelector('[data-model-role] [role="status"]')).borderStyle!=='none'`, 'model-settings-forced-colors');
    await primary.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await primary.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await primary.send('Emulation.clearDeviceMetricsOverride');
    await close();
    await assertSecretsAbsentFromDataRoot(dataRoot, [secretOne], 'model-first-secret-absent-from-data-root');

    at('model-service-restart-and-replace');
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'model-restart-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'model-restart-landing');
    const restartedConnection = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial'))`);
    requireJourney(
      restartedConnection?.status === 'available' &&
        restartedConnection.connection?.credentialReference === firstConnection.connection.credentialReference &&
        restartedConnection.connection?.credentialOperationState === 'ready',
      'model-credential-restart-ready-same-reference',
    );
    await click(primary, '模型服务', 'model-replace-open');
    await waitFor(primary, `document.querySelector('[data-screen="model-service"]')`, 'model-replace-ready');
    await assertRenderer(primary, `(() => { const input=document.querySelector('#main-editorial-credential'); return input instanceof HTMLInputElement && input.value==='' && !document.body.textContent.includes(${JSON.stringify(secretOne)}); })()`, 'model-restart-no-redisplay');
    await fill(primary, '#main-editorial-credential', secretTwo, 'model-credential-replacement');
    await click(primary, '重新输入', 'model-credential-replace');
    await waitFor(primary, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('#main-editorial-credential')?.value==='' && document.querySelector('#persistence-status')?.dataset.tone==='success' && document.querySelector('#persistence-status')?.textContent.includes('连接名称与凭据保护状态已更新')`, 'model-replacement-ready');
    const replacedConnection = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(
      replacedConnection?.credentialReference === firstConnection.connection.credentialReference &&
        replacedConnection?.credentialOperationState === 'ready',
      'model-replacement-stable-reference',
    );
    await close();
    await assertSecretsAbsentFromDataRoot(dataRoot, [secretOne, secretTwo], 'model-replacement-secrets-absent-from-data-root');

    at('model-service-remove-and-restart');
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'model-remove-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'model-remove-landing');
    await click(primary, '模型服务', 'model-remove-open');
    await waitFor(primary, `document.querySelector('[data-credential-state="ready"]')`, 'model-remove-ready');
    await click(primary, '移除', 'model-remove');
    await waitFor(primary, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='setup-required' && document.querySelector('[data-credential-state="missing"]')`, 'model-removed');
    const removedConnection = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(
      removedConnection?.credentialReference === firstConnection.connection.credentialReference &&
        removedConnection?.credentialOperationState === 'missing',
      'model-removed-stable-reference',
    );
    productCredentialCleanupSucceeded = true;
    await close();
    await assertSecretsAbsentFromDataRoot(dataRoot, [secretOne, secretTwo], 'model-removed-secrets-absent-from-data-root');
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'model-final-restart-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'model-final-restart-landing');
    const finalModelState = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial'))`);
    requireJourney(
      finalModelState?.status === 'setup-required' &&
        finalModelState.connection?.credentialReference === firstConnection.connection.credentialReference &&
        finalModelState.connection?.credentialOperationState === 'missing',
      'model-removal-survived-restart',
    );
    requireJourney(loopback.observedRequests() === 0, 'zero-sentinel-requests');
    await close();
    await loopback.close();
  } finally {
    finalCleanupRequested = true;
    try {
      await cancellation.cleanup();
    } finally {
      cancellation.dispose();
    }
  }
}

main().catch((error) => {
  reportJourneyFailure('J-12', location, error);
  if (runnerLifecycleIncomplete) process.stderr.write('', () => process.exit(1));
});
