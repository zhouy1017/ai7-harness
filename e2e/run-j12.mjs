import { createWriteStream, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, awaitWithinDeadline, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';
import { fixedArchiveTime } from './composed-docx.mjs';

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

async function awaitCdpOperation(operation, deadline) {
  return awaitWithinDeadline(operation, deadline, {
    timeoutError: RENDERER_CDP_TIMEOUT,
    onDeadlineExpired: () => requireJourney(false, 'renderer-cdp-timeout'),
  });
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
    entry.mtime = fixedArchiveTime();
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
  const withBrowserConnection = (operation) =>
    settleOnBrowserDisconnect(browser, operation, {
      disconnectError: BROWSER_DISCONNECTED,
      coerceRejectionAfterDisconnect: true,
    });
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
    // Synchronized delta with Issues #467, #407, #408, #417, #414, #57, #410, #411, #413, #502, #421, #422 (twice), #412, #415 (twice) and #416: schema revision 21
    // added the manuscript entry-position relation, revision 22 the editorial-mark relations, revision 23 the
    // manuscript-effect relations, revision 24 rebuilt the three kind-coupled analysis relations for the
    // review-category kind family, revision 25 added the Publication Version relations, revision 26 the
    // proposal-conflict relations, revision 27 the import-retention relations, revision 28 the staged
    // imported marks, revision 29 the export ledger, revision 30 widens the Run states for Connectivity Wait,
    // revision 31 adds the default-execution-rule ledger, revision 32 widens the Run states and the Task Outcomes
    // for 取消任务, revision 33 widens the Run states again and adds the unit checkpoints for 暂停 and 续行, revision 34
    // widens the Plan Revisions for 更新计划, revision 35 widens the Run states once more and adds the Clarification
    // Requests and answers, revision 36 adds the chapter-level reimport rows, revision 37 rebuilds `manuscripts` for
    // Production Documents beside their ledgers, revision 38 adds their Delivery Records and revision 39 the Book's
    // 图书交付包 versions, so this pin moves with the terminal version the service stamps
    // (`BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION`).
    requireJourney(version?.user_version === 58, 'credential-cleanup-metadata-version');
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
  // Synchronized delta with Issue #409: the milestone form lives in the 导航 panel, which opens on demand.
  await assertRenderer(renderer, `(() => { const entry=document.querySelector('[data-edge-entry="navigation"]'); const panel=document.querySelector('#manuscript-navigation-panel'); if(!(entry instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return false; if(entry.getAttribute('aria-expanded')!=='true') entry.click(); return entry.getAttribute('aria-expanded')==='true' && !panel.hidden; })()`, 'milestone-navigation');
  await assertRenderer(renderer, `(() => { const details=document.querySelector('.milestone-section'); if(!(details instanceof HTMLDetailsElement))return false; details.open=true; return true; })()`, 'milestone-open');
  await fill(renderer, '#milestone-label', 'J12 后续修订版', 'milestone-label');
  // Synchronized delta with Issue #414: a purpose is chosen from the unselected cards, not typed.
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('.milestone-section input[type="radio"][name="milestone-purpose"][value="stage-archive"]'); if(!(radio instanceof HTMLInputElement)||radio.disabled)return false; radio.click(); return radio.checked; })()`, 'milestone-purpose');
  await fill(renderer, '#milestone-note', '本地且离线。', 'milestone-note');
  await click(renderer, '保存里程碑版本', 'milestone-save');
  await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='success' && document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r2')`, 'milestone-saved', 120_000);
}

/**
 * 设置 › 评估校准与预测 as the editor reads it (Issue #430, S82): each section's progress line and notes, the two switches'
 * state, each published Book's line and whether its form is open, any refusal, and where focus is.
 */
const READ_CALIBRATION = `(() => {
  const root = document.querySelector('[data-screen="evaluation-calibration"] .evaluation-calibration');
  if (!(root instanceof HTMLElement) || root.querySelector('.calibration-calibration') === null) return null;
  const switchOf = (name) => { const input = root.querySelector('[data-calibration-switch="' + name + '"]'); return input instanceof HTMLInputElement ? [input.checked, input.disabled] : null; };
  const active = document.activeElement;
  return {
    calibration: root.querySelector('.calibration-calibration .calibration-progress')?.textContent ?? null,
    waiting: root.querySelector('.calibration-waiting')?.textContent ?? null,
    prediction: root.querySelector('.calibration-prediction .calibration-progress')?.textContent ?? null,
    switches: { calibration: switchOf('calibration'), prediction: switchOf('prediction') },
    empty: root.querySelector('.calibration-actuals-empty')?.textContent ?? null,
    books: Array.from(root.querySelectorAll('li.calibration-book'), (item) => [item.dataset.bookId ?? null, item.dataset.actualsState ?? null, item.querySelector('.calibration-book-line')?.textContent ?? null, item.querySelector('.calibration-form') !== null]),
    refusal: root.querySelector('.calibration-refusal')?.textContent ?? null,
    focus: active instanceof HTMLElement && root.contains(active) ? (active.dataset.calibrationField ?? active.dataset.calibrationAction ?? active.dataset.calibrationSwitch ?? active.tagName) : null,
  };
})()`;
async function readCalibration(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_CALIBRATION).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = new Error(`J-12/${name}`);
  error.detail = page;
  throw error;
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
    const launch = async (picker, savePath) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot,
        '--j12-observe-reveal', 'true', '--launcher-pid', String(process.pid),
      ];
      if (picker) args.splice(args.length - 4, 0, '--j12-picker-path', picker);
      // 导出数据库's Save dialog, answered once (Issue #434, S86a).
      if (savePath) args.splice(args.length - 4, 0, '--j12-save-path', savePath);
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
    // Synchronized delta with Issue #405: 甲 has a primary Manuscript, so its Book route enters the
    // manuscript rather than the overview (V2-UX-RET-002, IA-012); 乙 has none, so it still enters the
    // overview, which is where 导入首份稿件 is. A window is found by the Book it holds either way.
    primary = await findRenderer(manager, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'book-a-reused');
    await waitFor(primary, `document.hasFocus() && document.visibilityState==='visible'`, 'book-a-reused-focused');
    await waitFor(primary, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, 'book-a-entered-manuscript');
    // Nothing has been remembered for 甲 yet, so the one transient notice says the manuscript opened at
    // its start instead of claiming a return. It floats rather than taking a row from the manuscript,
    // and both readings are taken in one pass because the notice is on its way out while they are read.
    await assertRenderer(primary, `(() => {
      const notice=document.querySelector('[data-entry-notice]');
      return notice instanceof HTMLElement &&
        notice.textContent==='从稿件开头打开；这本图书还没有记录上次位置。' &&
        getComputedStyle(notice).position==='absolute';
    })()`, 'entry-notice-without-remembered-position');
    // It goes without any editor action (V2-UX-COPY-015).
    await waitFor(primary, `!document.querySelector('[data-entry-notice]')`, 'entry-notice-self-dismissed');

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
    // Synchronized delta with Issue #405: the Book route already arrived in the manuscript, so there is
    // no `打开稿件` step left to take here — the entry is the surface. That click did one other thing
    // the close-risk stages below still need, and the raw `openBookWorkbench` calls above cannot do it
    // because they never render the route they request: assigning a route clears the window's manuscript
    // capabilities, so the capability the entry took is gone by now and this window takes it again under
    // the generation in force, exactly as a renderer does when it renders the route it was handed. Both
    // halves are asserted, because the second is what gives `close-risk-capability-preservation` its
    // subject: a *rejected* route request must preserve what a successful one clears.
    await waitFor(primary, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, 'editor-ready');
    const bookAWork = await primary.evaluate(`(async()=>{ const item=(await window.ai7.listPriorWork()).find((entry)=>entry.bookId===${JSON.stringify(bookA)}); return item ? {manuscriptId:item.manuscriptId,branchId:item.branchId} : null; })()`);
    requireJourney(UUID_PATTERN.test(bookAWork?.manuscriptId) && UUID_PATTERN.test(bookAWork?.branchId), 'book-a-manuscript-route-identity');
    const clearedByRouteAssignment = await primary.evaluate(`window.ai7.getOutline({manuscriptId:${JSON.stringify(bookAWork.manuscriptId)},branchId:${JSON.stringify(bookAWork.branchId)},cursor:null}).then(()=>null,(error)=>error?.code??null)`);
    requireJourney(clearedByRouteAssignment === 'AI7_EDITOR_CAPABILITY_INVALID', 'route-assignment-cleared-the-entry-capability');
    const retakenCapability = await primary.evaluate(`window.ai7.getManuscriptWindow({manuscriptId:${JSON.stringify(bookAWork.manuscriptId)},branchId:${JSON.stringify(bookAWork.branchId)},cursor:null}).then((page)=>page.bookId,()=>null)`);
    requireJourney(retakenCapability === bookA, 'book-a-editor-capability-retaken-under-the-current-route');
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
    await assertRenderer(primary, `(() => { const view=document.querySelector('.historical-revision-viewer'); const blocks=document.querySelectorAll('.historical-revision-blocks>[data-block-id]'); return view?.dataset.bookId===${JSON.stringify(bookA)} && Number(view.dataset.blockCount)===blocks.length && blocks.length>0 && blocks.length<=32 && !view.textContent.includes(${JSON.stringify(editSuffix)}) && !document.querySelector('[data-testid="manuscript-editor"]') && !document.querySelector('[contenteditable="true"]') && !Array.from(view.querySelectorAll('button')).some((item)=>['保存当前编辑','撤销','重做','保存为里程碑版本','保存里程碑版本'].includes(item.textContent??'')) && view.textContent.includes('不提供写入'); })()`, 'immutable-readonly-reconstruction');
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
    // Synchronized delta with Issue #405: move the editor off the manuscript's start, so that what the
    // restart below returns to is a position this editor chose rather than the place every manuscript
    // opens at. The 40-block synthetic manuscript is longer than one window, so paging forward has
    // somewhere to go, and the moved-to window is what is remembered. `已到达` is written after the
    // position is durable, so reading it is enough to know the product may be closed; the overview is
    // then asked what it would enter at, because that is what the restart below has to match.
    await click(primary, '向后浏览', 'page-away-from-start');
    await waitFor(primary, `document.querySelector('#persistence-status')?.textContent.startsWith('已到达')`, 'paged-away-from-start');
    const pagedAwayPosition = await primary.evaluate(`window.ai7.getBookOverview({bookId:${JSON.stringify(bookA)},historyCursor:null}).then((overview)=>overview.manuscriptAnchor?.entry?.blockPosition??null,()=>null)`);
    requireJourney(Number.isSafeInteger(pagedAwayPosition) && pagedAwayPosition > 1, 'paged-away-position-remembered-off-the-start');

    at('sender-owned-import-draft');
    await close();
    manager = await launch(syntheticDocx);
    [primary] = await waitForRendererCount(manager, 1, 'draft-initial-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'draft-landing');
    await clickBook(primary, bookA, 'draft-open-a');
    // Synchronized delta with Issue #405: 甲 enters the manuscript, and 工作概览 is reached from the
    // manuscript's `资料与记录` group (V2-UX-IA-012) — this is where that way back is exercised.
    await waitFor(primary, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'draft-a-manuscript');
    // The editor arrives *at* the remembered block, not merely in the window that contains it: the caret
    // sits on that block and the block is not the window's first, which is what the position paged away
    // to above. Entering without landing on it would also overwrite the memory with the window's start,
    // so this reads the position back afterwards and finds it unmoved.
    const landedOnRemembered = await primary.evaluate(`(async()=>{
      const entry=(await window.ai7.getBookOverview({bookId:${JSON.stringify(bookA)},historyCursor:null})).manuscriptAnchor?.entry??null;
      const selection=getSelection();
      const node=selection&&selection.anchorNode
        ?(selection.anchorNode.nodeType===1?selection.anchorNode:selection.anchorNode.parentElement)
        :null;
      const caret=node?node.closest('[data-block-id]'):null;
      const first=document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]');
      return {
        remembered:entry===null?null:entry.blockPosition,
        caretOnRemembered:entry!==null&&caret?.dataset.blockId===entry.blockId,
        rememberedIsNotTheWindowStart:entry!==null&&first?.dataset.blockId!==entry.blockId,
      };
    })()`);
    requireJourney(
      landedOnRemembered?.remembered === pagedAwayPosition &&
        landedOnRemembered.caretOnRemembered === true &&
        landedOnRemembered.rememberedIsNotTheWindowStart === true,
      'entry-lands-on-the-remembered-block',
    );
    await click(primary, '返回图书工作概览', 'draft-a-to-overview');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'draft-a-overview');
    await click(primary, '打开另一本图书', 'draft-open-other');
    await waitFor(primary, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'draft-chooser');
    await clickBook(primary, bookB, 'draft-open-b');
    await waitForRendererCount(manager, 2, 'draft-two-windows');
    const draftBookBRenderer = await findRenderer(manager, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}]')`, 'draft-b-window');
    const stagedDraft = await primary.evaluate(`window.ai7.selectAndStageManuscript()`);
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
    // Synchronized delta with Issue #405: 甲's window entered the manuscript, so it is found by the Book
    // it holds. What this stage reads from it is capability behavior, which its surface does not change.
    const bookARenderer = await findRenderer(manager, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'capability-a-window');
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
    // Synchronized delta with Issue #405: the Book route enters the manuscript; the overview this stage
    // works from is reached back through `资料与记录`.
    await waitFor(primary, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-a-manuscript');
    await click(primary, '返回图书工作概览', 'preflight-a-to-overview');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-a-overview');
    await click(primary, '打开另一本图书', 'preflight-open-other');
    await waitFor(primary, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'preflight-chooser');
    await clickBook(primary, bookB, 'preflight-open-b');
    await waitForRendererCount(manager, 2, 'preflight-two-books');
    // Synchronized delta with Issue #405: 乙 has had a primary Manuscript since
    // `sender-owned-editor-capabilities-import-b`, so by now its Book route enters the manuscript as 甲's
    // does; the overview this stage later works from is reached back through `资料与记录`.
    const bookBRendererForPreflight = await findRenderer(manager, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookB)}]')`, 'preflight-b-window');
    await click(bookBRendererForPreflight, '返回图书工作概览', 'preflight-b-to-overview');
    await waitFor(bookBRendererForPreflight, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}]')`, 'preflight-b-overview');
    await click(primary, '返回当前图书', 'preflight-return-a');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-a-returned');
    await click(primary, '返回图书列表', 'preflight-release-a');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'preflight-library-window');
    await click(bookBRendererForPreflight, '打开另一本图书', 'preflight-b-open-other');
    await waitFor(bookBRendererForPreflight, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'preflight-b-chooser');
    await clickBook(bookBRendererForPreflight, bookA, 'preflight-b-open-a');
    await waitForRendererCount(manager, 3, 'preflight-library-and-two-books');
    // Synchronized delta with Issue #405: 甲's re-registered window entered the manuscript.
    const registeredBookA = await findRenderer(manager, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-registered-a');
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
    // Synchronized delta with Issue #405. This is V2-UX-RET-002's own proof: the product was closed and
    // reopened, and 书库 › 甲 comes back to the manuscript at the position the editor left it at, with no
    // `打开稿件` step in between. The notice names the return rather than an opening at the start
    // (V2-UX-COPY-015), and the position it names carries no block identity (V2-UX-LAYER-001).
    await waitFor(primary, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'restart-a-manuscript');
    await waitFor(primary, `document.querySelector('[data-testid="manuscript-editor"]')?.textContent.includes(${JSON.stringify(editSuffix)})`, 'restart-persisted-edit');
    await assertRenderer(primary, `(() => {
      const notice=document.querySelector('[data-entry-notice]')?.textContent??'';
      const place=/第 (\\d+) \\/ (\\d+) 个内容块/.exec(notice);
      return notice.startsWith('回到上次位置 · ') && place!==null &&
        Number(place[1])===${JSON.stringify(pagedAwayPosition)} && Number(place[1])<=Number(place[2]) &&
        !/blk_[0-9a-f]{24}/.test(notice);
    })()`, 'restart-entry-notice-returns-to-remembered-position');
    await click(primary, '返回图书工作概览', 'restart-back-overview');
    await waitFor(primary, `document.querySelector('[data-screen="book-overview"]')`, 'restart-overview');
    // V2-UX-BOOK-001: the overview leads with the manuscript anchor — 修订版 · 上次位置 · 保存状态 —
    // above the Book's own identity and every record it lists, and it is a destination reached from the
    // manuscript rather than the way in (V2-UX-IA-012).
    await assertRenderer(primary, `(() => {
      const overview=document.querySelector('.book-overview');
      const anchorSection=overview?.querySelector('.manuscript-anchor');
      const records=overview?.querySelector('.record-navigation');
      if(!(anchorSection instanceof HTMLElement)||!(records instanceof HTMLElement))return false;
      const labels=Array.from(anchorSection.querySelectorAll(':scope > dl > dt'),(node)=>node.textContent);
      const readings=Array.from(anchorSection.querySelectorAll(':scope > dl > dd'),(node)=>node.textContent??'');
      return JSON.stringify(labels)===JSON.stringify(['修订版','上次位置','保存状态']) &&
        (anchorSection.compareDocumentPosition(records)&Node.DOCUMENT_POSITION_FOLLOWING)!==0 &&
        (anchorSection.compareDocumentPosition(overview.querySelector('.workbench-actions'))&Node.DOCUMENT_POSITION_FOLLOWING)!==0 &&
        ['exact','nearest-anchor'].includes(anchorSection.dataset.manuscriptAnchor??'') &&
        readings[1].includes('个内容块') && !readings.some((reading)=>/blk_[0-9a-f]{24}/.test(reading));
    })()`, 'overview-leads-with-the-manuscript-anchor');
    await click(primary, '返回图书列表', 'restart-return-library');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'restart-library');
    await click(primary, '数据与存储', 'data-storage-open');
    await waitFor(primary, `document.querySelector('[data-screen="data-storage"]')`, 'data-storage-ready');
    await assertRenderer(primary, `(() => { const view=document.querySelector('.data-storage-summary'); return view?.dataset.platform===${JSON.stringify(process.platform === 'win32' ? 'windows' : 'macos')} && view.dataset.runtimeForm==='source-checkout' && view.dataset.footprintMaximumEntries==='128' && document.querySelector('[data-product-data-root]')?.textContent===${JSON.stringify(dataRoot)} && view.textContent.includes('产品数据位置') && view.textContent.includes('凭据与产品数据分开') && view.textContent.includes(${JSON.stringify(process.platform === 'win32' ? 'Windows 凭据管理器' : 'macOS 钥匙串')}) && !Object.keys(window.ai7).some((key)=>key.toLowerCase().includes('path')); })()`, 'truthful-data-location');
    // 版本 (Issue #433, S85a; DSTO-016): the software version and the Data Version apart. The same software reopened the data
    // after the restart, so the store keeps its one version record and has seen no software update.
    const packageVersion = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')).version;
    await waitFor(primary, `document.querySelector('.data-version')?.dataset.dataVersion === '1'`, 'data-version-read');
    const versionSection = await primary.evaluate(`(() => { const section = document.querySelector('.data-version'); const text = (selector) => section?.querySelector(selector)?.textContent ?? null; return [text('.data-version-software'), text('.data-version-data'), text('.data-version-state'), text('.data-version-update'), text('.data-version-history > summary'), section?.dataset.frozen ?? null]; })()`);
    requireJourney(JSON.stringify(versionSection) === JSON.stringify([packageVersion, '1', '开发阶段：首个正式发布时冻结为数据版本 1；在那之前，开发中的数据可以重建。',
      '这份数据还没有经历过软件更新。', '版本记录（1）', 'false']), 'data-version-words', versionSection);
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
        firstConnection.policy?.activePolicySetVersion === 'v5' &&
        firstConnection.policy?.providerProcessing?.version === 'v1' &&
        firstConnection.policy?.providerProcessing?.authorizedLiveTransmissionCount === 0 &&
        firstConnection.policy?.externalExport?.version === 'v2' &&
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

    at('database-export');
    // 导出数据库 (Issue #434, S86a; DSTO-017; ADR 0079 §1.6): with the replacement credential protected, the one file the editor
    // approves holds every Book, says its Data Version, and holds neither credential in any of its members.
    const databaseExportPath = resolve(runRoot, 'database-export', 'AI7 数据库.ai7db');
    await mkdir(dirname(databaseExportPath), { recursive: true });
    manager = await launch(undefined, databaseExportPath);
    [primary] = await waitForRendererCount(manager, 1, 'database-export-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-export-landing');
    await click(primary, '数据与存储', 'database-export-open');
    await waitFor(primary, `document.querySelector('.database-export [data-database-export-action="choose"]') && document.querySelector('.database-export-records summary')`, 'database-export-ready');
    await click(primary, '导出数据库…', 'database-export-choose');
    await waitFor(primary, `document.querySelector('.database-export-prepared')?.dataset.preparationId !== undefined`, 'database-export-prepared');
    const preparedRows = await primary.evaluate(`Array.from(document.querySelectorAll('.database-export-prepared dt')).map((term) => [term.textContent, term.nextElementSibling?.textContent ?? null])`);
    const booksShown = Number(/^(\d+) 本图书/u.exec(Array.isArray(preparedRows) ? preparedRows.find((row) => row[0] === '内容')?.[1] ?? '' : '')?.[1]);
    requireJourney(
      Array.isArray(preparedRows) && preparedRows.length === 5 &&
        JSON.stringify(preparedRows.map((row) => row[0])) === JSON.stringify(['文件', '位置', '方式', '内容', '版本']) &&
        preparedRows[0][1].startsWith('「AI7 数据库.ai7db」 · ') && preparedRows[1][1] === databaseExportPath && preparedRows[2][1] === '新建文件' &&
        Number.isSafeInteger(booksShown) && booksShown >= 1 && /^数据版本 1 · 软件 \d+\.\d+\.\d+/u.test(preparedRows[4][1]),
      'database-export-prepared-words',
      preparedRows,
    );
    await click(primary, '按上述方式导出', 'database-export-approve');
    await waitFor(primary, `document.querySelector('.database-export-prepared')?.dataset.outcome === 'created'`, 'database-export-created');
    await assertRenderer(primary, `document.querySelector('.database-export-outcome')?.textContent === '已导出到所选位置：已新建「AI7 数据库.ai7db」。' && document.querySelector('.database-export')?.dataset.databaseExports === '1'`, 'database-export-outcome-words');
    // 定期自动备份 (Issue #434, S86b; DSTO-018): off by default; turned on, it backs up at once into the fixed location beside
    // the data; turned off, it keeps what it made.
    const backupLocation = `${dataRoot}-backups`;
    const turnBackup = (on) => primary.evaluate(`(() => { const input = document.querySelector('[data-scheduled-backup-switch]'); if (!(input instanceof HTMLInputElement) || input.disabled || input.checked === ${on}) return false; input.click(); return true; })()`);
    await waitFor(primary, `document.querySelector('.scheduled-backup')?.dataset.enabled === 'false' && document.querySelector('.scheduled-backup-location')?.textContent === ${JSON.stringify(backupLocation)}`, 'scheduled-backup-off-by-default');
    requireJourney(await turnBackup(true), 'scheduled-backup-turn-on');
    await waitFor(primary, `document.querySelector('.scheduled-backup')?.dataset.enabled === 'true' && document.querySelector('.scheduled-backup')?.dataset.backups === '1'`, 'scheduled-backup-made');
    await assertRenderer(primary, `document.querySelector('.scheduled-backup-state')?.textContent === '已打开 · 每天一次 · 保留 14 天' && document.activeElement instanceof HTMLInputElement && document.activeElement.matches('[data-scheduled-backup-switch]')`, 'scheduled-backup-words');
    requireJourney(await turnBackup(false), 'scheduled-backup-turn-off');
    await waitFor(primary, `document.querySelector('.scheduled-backup')?.dataset.enabled === 'false' && document.querySelector('.scheduled-backup')?.dataset.backups === '1' && document.querySelector('.scheduled-backup-state')?.textContent === '已关闭'`, 'scheduled-backup-off-keeps');
    await close();
    const packaged = unzipSync(await readFile(databaseExportPath));
    const manifest = JSON.parse(strFromU8(packaged['manifest.json']));
    requireJourney(
      manifest.schema === 'ai7.database-package/1' && manifest.dataVersion === 1 && manifest.schemaRevision === 58 &&
        manifest.credentials === 'excluded' && manifest.contents?.books === booksShown && Object.keys(packaged)[0] === 'store/ai7.sqlite',
      'database-export-manifest',
      { schema: manifest.schema, dataVersion: manifest.dataVersion, schemaRevision: manifest.schemaRevision, contents: manifest.contents },
    );
    const membersWithSecret = Object.entries(packaged).filter(([, bytes]) => [secretOne, secretTwo].some((secret) =>
      Buffer.from(bytes).includes(Buffer.from(secret, 'utf8')) || Buffer.from(bytes).includes(Buffer.from(secret, 'utf16le')))).map(([name]) => name);
    requireJourney(membersWithSecret.length === 0, 'database-export-no-credential', membersWithSecret);
    const backupFiles = (await readdir(backupLocation)).filter((name) => name.endsWith('.ai7db'));
    requireJourney(backupFiles.length === 1 && backupFiles[0].startsWith('AI7 自动备份 '), 'scheduled-backup-file', backupFiles);
    const backupPackage = unzipSync(await readFile(resolve(backupLocation, backupFiles[0])));
    const backupManifest = JSON.parse(strFromU8(backupPackage['manifest.json']));
    requireJourney(backupManifest.origin === 'scheduled-backup' && backupManifest.schemaRevision === 58 && backupManifest.credentials === 'excluded',
      'scheduled-backup-manifest', { origin: backupManifest.origin, schemaRevision: backupManifest.schemaRevision });
    const backupMembersWithSecret = Object.entries(backupPackage).filter(([, bytes]) => [secretOne, secretTwo].some((secret) =>
      Buffer.from(bytes).includes(Buffer.from(secret, 'utf8')) || Buffer.from(bytes).includes(Buffer.from(secret, 'utf16le')))).map(([name]) => name);
    requireJourney(backupMembersWithSecret.length === 0, 'scheduled-backup-no-credential', backupMembersWithSecret);

    at('database-import-replace');
    // 导入数据库 (Issue #434, S86c; DSTO-017; ADR 0079 §1.3, §1.4): the file exported above is read and verified whole before
    // anything is chosen; 替换本机全部数据 — never preselected — backs the data up first and completes at AI7's next start, when
    // the data is the file's; and 回退到替换前的数据 brings back what it replaced, the data it replaces backed up first as well.
    // `现在关闭 AI7` closes AI7 itself, so the runner waits for it to go before it starts AI7 again.
    const quitThroughProduct = async (name) => {
      await click(primary, '现在关闭 AI7', `${name}-quit`);
      const deadline = Date.now() + 30_000;
      while (browser?.isConnected() && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      requireJourney(browser !== undefined && !browser.isConnected(), `${name}-closed-itself`);
      browser = undefined;
      browserAcquisition = undefined;
      managerForCleanup = undefined;
    };
    const bookTitles = async () => JSON.parse(await primary.evaluate(`window.ai7.listBooks({ after: null }).then((page) => JSON.stringify(page.items.map((book) => book.title).sort()))`));
    const openDataAndStorage = async (name) => {
      await click(primary, '数据与存储', `${name}-open`);
      await waitFor(primary, `document.querySelector('.database-import [data-database-import-action="choose"]') && document.querySelector('.database-import')?.dataset.pending === 'false'`, `${name}-ready`);
    };
    manager = await launch(databaseExportPath);
    [primary] = await waitForRendererCount(manager, 1, 'database-import-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-import-landing');
    await createEmptyBook(primary, 'J12 替换前的图书');
    await click(primary, '返回图书列表', 'database-import-book-return');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-import-book-returned');
    const titlesBeforeReplace = await bookTitles();
    requireJourney(titlesBeforeReplace.length === booksShown + 1 && titlesBeforeReplace.includes('J12 替换前的图书'), 'database-import-titles-before', titlesBeforeReplace);
    await openDataAndStorage('database-import');
    await assertRenderer(primary, `document.querySelector('.database-import')?.dataset.replacements === '0' && document.querySelector('.database-import-records summary')?.textContent === '导入记录（0）'`, 'database-import-no-records');
    await click(primary, '导入数据库…', 'database-import-choose');
    await waitFor(primary, `document.querySelector('.database-import-preview')?.dataset.previewId !== undefined`, 'database-import-previewed');
    const previewRows = await primary.evaluate(`Array.from(document.querySelectorAll('.database-import-preview dt')).map((term) => [term.textContent, term.nextElementSibling?.textContent ?? null])`);
    requireJourney(
      Array.isArray(previewRows) && JSON.stringify(previewRows.map((row) => row[0])) === JSON.stringify(['文件', '来源', '版本', '内容', '完整性']) &&
        previewRows[0][1].startsWith('「AI7 数据库.ai7db」 · ') && previewRows[1][1].startsWith('导出数据库 · ') &&
        /^数据版本 1 · 与本机相同 · 软件 \d+\.\d+\.\d+/u.test(previewRows[2][1]) && previewRows[3][1].startsWith(`${booksShown} 本图书 · `) &&
        /^已逐项核对 \d+ 个文件，完整$/u.test(previewRows[4][1]),
      'database-import-preview-words',
      previewRows,
    );
    // Neither choice is preselected: `按所选方式导入` waits for the editor's, and what it will do is said once it is made.
    await assertRenderer(primary, `(() => { const choice = document.querySelector('input[name="database-import-choice"]'); const confirm = document.querySelector('[data-database-import-action="confirm"]'); return choice instanceof HTMLInputElement && !choice.checked && document.activeElement === choice && confirm instanceof HTMLButtonElement && confirm.disabled && document.querySelector('.database-import-consequence')?.hidden === true; })()`, 'database-import-not-preselected');
    await assertRenderer(primary, `(() => { const choice = document.querySelector('input[name="database-import-choice"][value="replace"]'); if (!(choice instanceof HTMLInputElement)) return false; choice.click(); return choice.checked && document.querySelector('.database-import-consequence')?.hidden === false && !document.querySelector('[data-database-import-action="confirm"]').disabled; })()`, 'database-import-choose-replace');
    await click(primary, '按所选方式导入', 'database-import-confirm');
    await waitFor(primary, `document.querySelector('.database-import-pending')?.dataset.replacementId !== undefined && document.querySelector('.database-import')?.dataset.pending === 'true'`, 'database-import-pending');
    const pendingLines = await primary.evaluate(`Array.from(document.querySelectorAll('.database-import-pending p')).map((line) => line.textContent)`);
    const replaceBackup = /^本机现在的数据已备份为「(AI7 替换前备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db)」，放在备份位置。$/u.exec(Array.isArray(pendingLines) ? pendingLines[1] ?? '' : '')?.[1];
    requireJourney(
      Array.isArray(pendingLines) && pendingLines.length === 3 && pendingLines[0] === '已准备好用「AI7 数据库.ai7db」替换本机全部数据。' &&
        replaceBackup !== undefined && pendingLines[2] === 'AI7 下次启动时完成替换；在此之前不能再做修改，要继续修改请先取消替换。',
      'database-import-pending-words',
      pendingLines,
    );
    await assertRenderer(primary, `document.activeElement?.dataset.databaseImportAction === 'quit' && document.querySelector('[data-database-import-action="choose"]').disabled && document.querySelector('.database-import-preview').hidden`, 'database-import-quit-focused');
    // Nothing more is written while the replacement waits (Issue #434 review): a change is refused in those words, and a read
    // still answers.
    const whileWaiting = await primary.evaluate(`window.ai7.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }).then(() => null, (error) => [error?.code ?? null, error?.message ?? null])`);
    requireJourney(Array.isArray(whileWaiting) && whileWaiting[0] === 'DATABASE_REPLACEMENT_WAITING' &&
      whileWaiting[1] === '本机数据正在等 AI7 重新启动后被替换；在此之前不能再做修改。要继续修改，请先取消替换。', 'database-import-writes-refused', whileWaiting);
    requireJourney(JSON.stringify(await bookTitles()) === JSON.stringify(titlesBeforeReplace), 'database-import-reads-while-waiting');
    const replacementId = await primary.evaluate(`document.querySelector('.database-import-pending').dataset.replacementId`);
    await quitThroughProduct('database-import');

    // The next start brings the file's data in: the Book made after the export is gone, and the replacement is recorded there.
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'database-replaced-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-replaced-landing');
    const titlesReplaced = await bookTitles();
    requireJourney(titlesReplaced.length === booksShown && !titlesReplaced.includes('J12 替换前的图书') &&
      titlesReplaced.every((title) => titlesBeforeReplace.includes(title)), 'database-replaced-titles', titlesReplaced);
    await openDataAndStorage('database-replaced');
    await waitFor(primary, `document.querySelector('.database-import')?.dataset.replacements === '1' && document.querySelector('.database-import')?.dataset.rollBackOf === ${JSON.stringify(replacementId)}`, 'database-replaced-recorded');
    await assertRenderer(primary, `(() => { const line = document.querySelector('.database-replacement-record')?.textContent ?? ''; return line.endsWith(${JSON.stringify(` · 已用「AI7 数据库.ai7db」替换本机全部数据 · 替换前备份「${replaceBackup}」`)}) && document.querySelector('.database-import-roll-back p')?.textContent === ${JSON.stringify(`上次用「AI7 数据库.ai7db」替换了本机全部数据；替换前的数据在「${replaceBackup}」里。`)}; })()`, 'database-replaced-words');
    await close();

    at('database-import-merge');
    // 只导入其中的图书 (Issue #434, S86d; ADR 0079 §1.5): the backup the replacement made holds the Book it took away. Merged,
    // that Book comes back with its records, the Books already here are not taken again, and nothing else of the data changes.
    manager = await launch(resolve(backupLocation, replaceBackup));
    [primary] = await waitForRendererCount(manager, 1, 'database-merge-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-merge-landing');
    await openDataAndStorage('database-merge');
    await click(primary, '导入数据库…', 'database-merge-choose');
    await waitFor(primary, `document.querySelector('.database-import-preview')?.dataset.previewId !== undefined`, 'database-merge-previewed');
    // Neither choice is preselected; the merge names each Book of the file as it would take it.
    await assertRenderer(primary, `(() => { const choices = Array.from(document.querySelectorAll('input[name="database-import-choice"]')); return choices.length === 2 && choices.every((choice) => !choice.checked && !choice.disabled) && document.querySelector('[data-database-import-action="confirm"]').disabled && document.querySelector('.database-merge-plan')?.hidden === true; })()`, 'database-merge-not-preselected');
    await assertRenderer(primary, `(() => { const choice = document.querySelector('input[name="database-import-choice"][value="merge"]'); if (!(choice instanceof HTMLInputElement)) return false; choice.click(); return choice.checked && document.querySelector('.database-merge-plan')?.hidden === false && document.querySelector('.database-import-consequence[data-choice="replace"]')?.hidden === true && !document.querySelector('[data-database-import-action="confirm"]').disabled; })()`, 'database-merge-choose-merge');
    const planned = await primary.evaluate(`Array.from(document.querySelectorAll('.database-merge-book')).map((item) => [item.dataset.status, item.textContent])`);
    requireJourney(
      Array.isArray(planned) && planned.length === titlesBeforeReplace.length &&
        planned.filter((entry) => entry[0] === 'new').map((entry) => entry[1]).join('|') === '《J12 替换前的图书》 · 将导入' &&
        planned.filter((entry) => entry[0] === 'present').length === titlesBeforeReplace.length - 1,
      'database-merge-plan-words',
      planned,
    );
    await click(primary, '按所选方式导入', 'database-merge-confirm');
    await waitFor(primary, `document.querySelector('.database-import-pending')?.dataset.kind === 'merge'`, 'database-merge-pending');
    const mergeLines = await primary.evaluate(`Array.from(document.querySelectorAll('.database-import-pending p')).map((line) => line.textContent)`);
    const mergeBackup = /^本机现在的数据已备份为「(AI7 合并前备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db)」，放在备份位置。$/u.exec(Array.isArray(mergeLines) ? mergeLines[1] ?? '' : '')?.[1];
    requireJourney(
      Array.isArray(mergeLines) && mergeLines[0] === `已准备好把「${replaceBackup}」里的 1 本图书合并到本机。` && mergeBackup !== undefined &&
        mergeLines[2] === 'AI7 下次启动时完成合并；在此之前做的修改都会保留。',
      'database-merge-pending-words',
      mergeLines,
    );
    await quitThroughProduct('database-merge');
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'database-merged-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-merged-landing');
    const titlesMerged = await bookTitles();
    requireJourney(JSON.stringify(titlesMerged) === JSON.stringify(titlesBeforeReplace), 'database-merged-titles', titlesMerged);
    await openDataAndStorage('database-merged');
    // The merge is recorded beside the replacement, and 回退 still offers the replacement's backup.
    await waitFor(primary, `document.querySelector('.database-import')?.dataset.replacements === '2' && document.querySelector('.database-import')?.dataset.rollBackOf === ${JSON.stringify(replacementId)} && (document.querySelector('.database-replacement-record')?.textContent ?? '').endsWith(${JSON.stringify(` · 已从「${replaceBackup}」合并 1 本图书：《J12 替换前的图书》 · 合并前备份「${mergeBackup}」`)})`, 'database-merged-recorded');
    at('database-import-roll-back');
    // 回退到替换前的数据…, confirmed on its own: `不回退` holds the focus until the editor chooses.
    await click(primary, '回退到替换前的数据…', 'database-roll-back-open');
    await assertRenderer(primary, `document.activeElement?.dataset.databaseImportAction === 'keep' && document.querySelector('.database-import-roll-back-confirm .attention-note')?.textContent === ${JSON.stringify(`回退会用「${replaceBackup}」替换本机现在的全部数据。AI7 先把现在的数据也备份一次；回退在 AI7 下次启动时完成。`)}`, 'database-roll-back-confirmation');
    await click(primary, '确认回退', 'database-roll-back-confirm');
    await waitFor(primary, `document.querySelector('.database-import-pending')?.dataset.kind === 'roll-back'`, 'database-roll-back-pending');
    const rollBackLines = await primary.evaluate(`Array.from(document.querySelectorAll('.database-import-pending p')).map((line) => line.textContent)`);
    const rollBackBackup = /^本机现在的数据已备份为「(AI7 替换前备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db)」，放在备份位置。$/u.exec(Array.isArray(rollBackLines) ? rollBackLines[1] ?? '' : '')?.[1];
    requireJourney(
      Array.isArray(rollBackLines) && rollBackLines[0] === `已准备好回退到「${replaceBackup}」。` && rollBackBackup !== undefined && rollBackBackup !== replaceBackup &&
        rollBackLines[2] === 'AI7 下次启动时完成回退；在此之前不能再做修改，要继续修改请先取消回退。',
      'database-roll-back-pending-words',
      rollBackLines,
    );
    await quitThroughProduct('database-roll-back');

    // The next start brings back the data the replacement took: the Book made before it is there again.
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'database-rolled-back-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-rolled-back-landing');
    const titlesRolledBack = await bookTitles();
    requireJourney(JSON.stringify(titlesRolledBack) === JSON.stringify(titlesBeforeReplace), 'database-rolled-back-titles', titlesRolledBack);
    await openDataAndStorage('database-rolled-back');
    await waitFor(primary, `document.querySelector('.database-import')?.dataset.replacements === '1' && document.querySelector('.database-import')?.dataset.rollBackOf === undefined && (document.querySelector('.database-replacement-record')?.textContent ?? '').endsWith(${JSON.stringify(` · 已回退到「${replaceBackup}」 · 回退前备份「${rollBackBackup}」`)})`, 'database-rolled-back-recorded');
    await close();
    // Both backups wait in the backup location, each the database package of the data it replaced, neither with a credential.
    // The replacement's and the roll-back's backups each hold the Book made before the replacement — the roll-back's because
    // the merge brought it back — and the merge's holds the data it merged into.
    const replaceBackups = (await readdir(backupLocation)).filter((name) => name.startsWith('AI7 替换前备份 ') || name.startsWith('AI7 合并前备份 ')).sort();
    requireJourney(JSON.stringify(replaceBackups) === JSON.stringify([replaceBackup, rollBackBackup, mergeBackup].sort()), 'database-replace-backups', replaceBackups);
    for (const name of replaceBackups) {
      const replacedPackage = unzipSync(await readFile(resolve(backupLocation, name)));
      const replacedManifest = JSON.parse(strFromU8(replacedPackage['manifest.json']));
      requireJourney(replacedManifest.origin === (name === mergeBackup ? 'pre-merge-backup' : 'pre-replace-backup') && replacedManifest.schemaRevision === 58 &&
        replacedManifest.credentials === 'excluded' && replacedManifest.contents?.books === (name === mergeBackup ? booksShown : booksShown + 1),
      'database-replace-backup-manifest', { name, contents: replacedManifest.contents });
      const withSecret = Object.entries(replacedPackage).filter(([, bytes]) => [secretOne, secretTwo].some((secret) =>
        Buffer.from(bytes).includes(Buffer.from(secret, 'utf8')) || Buffer.from(bytes).includes(Buffer.from(secret, 'utf16le')))).map(([member]) => member);
      requireJourney(withSecret.length === 0, 'database-replace-backup-no-credential', withSecret);
    }
    requireJourney(!existsSync(`${dataRoot}-replacing`), 'database-replacement-staging-gone');

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
    at('evaluation-calibration-settings');
    // 设置 › 评估校准与预测 (Issue #430, plan slice S82; EVAL-010, EVAL-011, EVAL-014): calibration waits for AI7's 初评 and ten
    // of the editor's adjustments and touches only AI7's starting scores; turning it off is recorded and reads back, and on
    // again; the prediction switch stays closed until thirty published Books carry actuals; and with no Book yet published
    // the central entry says where the actuals come from.
    await click(primary, '评估校准与预测', 'calibration-open');
    const calibrationPage = await readCalibration(primary, () => true, 'calibration-page');
    requireJourney(calibrationPage.calibration === '调分记录 0 / 10 本 · 满 10 本后生效' &&
      calibrationPage.waiting === 'AI7 初评尚未接通：你改过 AI7 的初评分数后，调分记录才开始累积。' &&
      calibrationPage.prediction === '已录入实际数据的已发稿图书 0 / 30 本 · 满 30 本后才能打开' &&
      JSON.stringify(calibrationPage.switches) === JSON.stringify({ calibration: [true, false], prediction: [false, true] }) &&
      calibrationPage.empty === '还没有已发稿的图书。设为发稿版本后，在这里录入它的定价与首印。' && calibrationPage.books.length === 0,
    'calibration-page-words', calibrationPage);
    const toggle = (name) => primary.evaluate(`(() => { const input = document.querySelector('[data-calibration-switch="${name}"]'); if (!(input instanceof HTMLInputElement) || input.disabled) return false; input.click(); return true; })()`);
    requireJourney(await toggle('calibration'), 'calibration-off-click');
    const calibrationOff = await readCalibration(primary, (page) => page.calibration === '调分记录 0 / 10 本 · 已关闭', 'calibration-off');
    requireJourney(JSON.stringify(calibrationOff.switches.calibration) === JSON.stringify([false, false]) && calibrationOff.focus === 'calibration', 'calibration-off-words', calibrationOff);
    const offService = await primary.evaluate(`window.ai7.inspectEvaluationCalibration().then((answer) => [answer.calibration.enabled, answer.calibration.active, answer.preferenceEntries, answer.prediction.enabled])`);
    requireJourney(JSON.stringify(offService) === JSON.stringify([false, false, 1, false]), 'calibration-off-service', offService);
    requireJourney(await toggle('calibration'), 'calibration-on-click');
    await readCalibration(primary, (page) => page.calibration === '调分记录 0 / 10 本 · 满 10 本后生效' && page.switches.calibration?.[0] === true, 'calibration-on');
    // The closed switch cannot be clicked open, and the service refuses it as well.
    requireJourney(await toggle('prediction') === false, 'prediction-closed');
    const refusedPrediction = await primary.evaluate(`window.ai7.setEvaluationPreferences({ expectedEntries: 2, predictionEnabled: true, calibrationEnabled: true }).then(() => ({ recorded: true }), (error) => ({ code: error?.code ?? null, message: error?.message ?? null }))`);
    requireJourney(refusedPrediction?.code === 'PREDICTION_UNAVAILABLE' && refusedPrediction.message === '至少 30 本已发稿图书录入实际数据后，才能打开定价与首印预测。', 'prediction-refused', refusedPrediction);

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
