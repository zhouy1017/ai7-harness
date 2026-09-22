import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const SIDECAR_REVISION_2_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
const NATIVE_CARRIER_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
const TASK_GOAL = '分析当前书稿的结构与叙事连贯性，列出供编辑复核的重点。';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const CREDENTIAL_CLEANUP_TIMEOUT_MS = 15_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;
const BROWSER_CLOSE_TIMEOUT = new Error('J-03/browser-close-timeout');
const CREDENTIAL_CLEANUP_TIMEOUT = new Error('J-03/credential-cleanup-timeout');
let location = 'entry';
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-03', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-03/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-03', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-03' };
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
    throw new Error('J-03/credential-cleanup-metadata');
  }
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(databasePath)) === databasePath,
    'credential-cleanup-metadata-file');
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    throw new Error('J-03/credential-cleanup-metadata');
  }
  try {
    database.exec('PRAGMA query_only = ON;');
    // Synchronized delta with Issues #467, #407, #408, #417 and #414: schema revision 21 added the
    // manuscript entry-position relation, revision 22 the editorial-mark relations, revision 23 the
    // manuscript-effect relations, revision 24 rebuilt the three kind-coupled analysis relations for the
    // review-category kind family, and revision 25 added the Publication Version relations, so this pin
    // moves with the terminal version the service stamps (`PUBLICATION_VERSION_SCHEMA_VERSION`).
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 25, 'credential-cleanup-metadata-version');
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
    if (error instanceof Error && error.message.startsWith('J-03/')) throw error;
    throw new Error('J-03/credential-cleanup-metadata');
  } finally {
    database.close();
  }
}

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
    server.once('error', () => rejectListen(new Error('J-03/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  server.unref();
  return {
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
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
    if (response.error) completion.reject(new Error('J-03/renderer-cdp-response'));
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
          rejectResponse(new Error('J-03/renderer-cdp-timeout'));
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
  return async () => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const targets = (await guard(root.send('Target.getTargets'))).targetInfos.filter((item) => item.type === 'page');
      const current = await Promise.all(targets.map(attach));
      if (current.length === 1) return current[0];
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    throw new Error('J-03/renderer-window');
  };
}

async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`), name);
}

async function click(renderer, label, name) {
  await assertRenderer(
    renderer,
    `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>item.textContent===${JSON.stringify(label)}); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`,
    name,
  );
}

async function fill(renderer, selector, value, name) {
  await assertRenderer(
    renderer,
    `(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!(input instanceof HTMLInputElement))return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`,
    name,
  );
}

/** Press one button by its selector, refusing one that is missing or disabled. */
async function clickSelector(renderer, selector, name) {
  await assertRenderer(
    renderer,
    `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`,
    name,
  );
}

const TAB_KEY = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
const ENTER_KEY = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
const ESCAPE_KEY = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };

/** One real key press through the renderer's input pipeline; Enter carries its text so it activates a button. */
async function pressKey(renderer, descriptor) {
  const text = descriptor === ENTER_KEY ? { text: '\r', unmodifiedText: '\r' } : {};
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor, ...text });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...descriptor });
}

/**
 * The Task Drawer as an editor reads it (Issue #418, S72): its state, the goal block, the five rows of
 * 精简 or the six sections of 完整, the two columns, every exact identity of 查看技术详情 by its key, the
 * controls with their state, and the mode this renderer remembers.
 */
async function readDrawer(renderer) {
  return renderer.evaluate(`(() => {
    const drawer=document.querySelector('#task-drawer');
    if(!(drawer instanceof HTMLElement))return null;
    const pairs=(selector,key)=>Object.fromEntries(Array.from(drawer.querySelectorAll(selector)).map((node)=>[node.dataset[key],node.textContent]));
    const texts=(selector)=>Array.from(drawer.querySelectorAll(selector)).map((node)=>node.textContent);
    const pill=drawer.querySelector('.task-drawer-pill');
    let stored;
    try { stored=localStorage.getItem('ai7.taskDrawer.mode'); } catch { stored='unavailable'; }
    return {
      hidden:drawer.hidden, open:drawer.dataset.taskDrawer, shell:document.body.dataset.taskDrawer,
      kind:drawer.dataset.taskPlanKind, ref:drawer.dataset.taskPlanRef, state:drawer.dataset.taskPlanState,
      version:drawer.dataset.taskPlanVersion??null, mode:drawer.dataset.taskDrawerMode, stored,
      title:drawer.querySelector('#task-drawer-title')?.textContent, pill:pill?.textContent, pillShape:pill?.dataset.pillShape,
      sentence:drawer.querySelector('.task-plan-sentence-text')?.textContent,
      chips:pairs('[data-task-plan-chip]','taskPlanChip'), saved:drawer.querySelector('.task-plan-saved')?.textContent??null,
      drift:drawer.querySelector('[data-task-plan-drift]')?.dataset.taskPlanDrift??null,
      rows:pairs('[data-task-plan-row]','taskPlanRow'), terms:pairs('[data-task-plan-term]','taskPlanTerm'),
      sections:texts('[data-task-plan-section] > h3'),
      steps:Array.from(drawer.querySelectorAll('.task-plan-steps > li')).map((item)=>item.querySelector('.task-plan-step')?.textContent+' '+item.querySelector('.task-plan-step-result')?.textContent),
      participation:texts('.task-plan-participation > li'), outcomes:texts('[data-task-plan-term="可能产生"] li'), notDo:texts('.task-plan-not-do > li'),
      columns:texts('.task-plan-boundary h4'), adaptable:texts('[data-task-plan-boundary="adaptable"] li'), askFirst:texts('[data-task-plan-boundary="ask-first"] li'),
      technical:pairs('[data-task-plan-technical]','taskPlanTechnical'),
      controls:Object.fromEntries(Array.from(drawer.querySelectorAll('[data-task-drawer-control]')).map((node)=>[node.dataset.taskDrawerControl,{text:node.textContent,disabled:node instanceof HTMLButtonElement?node.disabled:null,pressed:node.getAttribute('aria-pressed')}])),
      footer:drawer.querySelector('.task-drawer-footer')?.textContent,
      focus:document.activeElement?.id||document.activeElement?.dataset?.taskDrawerControl||null,
    };
  })()`);
}

async function importSample1(renderer, cancellation) {
  await click(renderer, '导入稿件', 'import-open');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'import-target');
  at('sample1-import-target');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, 'import-target-explicit');
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, 'import-relationship-screen');
  at('sample1-import-relationship');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, 'import-relationship-explicit');
  await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, 'import-title-screen');
  at('sample1-import-title');
  await assertRenderer(renderer, `document.querySelector('[data-source-sha256]')?.textContent===${JSON.stringify(SAMPLE1_SHA256)} && document.querySelector('[data-source-bytes]')?.textContent===${JSON.stringify(String(SAMPLE1_BYTES))}`, 'import-exact-source');
  await fill(renderer, '#book-title', 'J-03 sample1 任务授权', 'import-title');
  cancellation.throwIfRequested();
  await click(renderer, '确认书名并复核', 'import-review');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'import-review-ready');
  at('sample1-import-review');
  cancellation.throwIfRequested();
  await assertRenderer(renderer, `(() => { const acceptance=document.querySelector('#accept-import-degradation'); if(!(acceptance instanceof HTMLInputElement)||acceptance.checked)return false; acceptance.click(); return acceptance.checked; })()`, 'import-degradation-explicit');
  await waitFor(renderer, `Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='按上述降级方式新建图书并导入稿件'&&!button.disabled)`, 'import-degradation-accepted');
  cancellation.throwIfRequested();
  await click(renderer, '按上述降级方式新建图书并导入稿件', 'import-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"] .book-overview[data-manuscript-state="populated"]')`, 'import-completed', 180_000);
  at('sample1-import-completed');
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, 'import-acknowledged', 180_000);
  const identity = await renderer.evaluate(`(() => ({
    bookId:document.querySelector('.book-overview')?.dataset.bookId,
    sourceVersionId:document.querySelector('button[data-record-kind="source"]')?.dataset.recordId,
    revisionId:document.querySelector('button[data-record-kind="revision"]')?.dataset.recordId
  }))()`);
  requireJourney(UUID_PATTERN.test(identity?.bookId) && UUID_PATTERN.test(identity?.sourceVersionId) && UUID_PATTERN.test(identity?.revisionId), 'import-identities');
  return identity;
}

async function createEmptyBook(renderer, cancellation) {
  await click(renderer, '新建图书', 'cross-book-open');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, 'cross-book-form');
  await fill(renderer, '#empty-book-title', 'J-03 路由边界图书', 'cross-book-title');
  await fill(renderer, '#empty-book-number', 'J03-ROUTE-BOUNDARY', 'cross-book-number');
  await click(renderer, '复核创建', 'cross-book-review');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, 'cross-book-review-ready');
  cancellation.throwIfRequested();
  await click(renderer, '新建图书', 'cross-book-commit');
  await waitFor(renderer, `document.querySelector('.book-overview[data-manuscript-state="empty"]')`, 'cross-book-created');
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId`);
  requireJourney(UUID_PATTERN.test(bookId), 'cross-book-id');
  await click(renderer, '返回图书列表', 'cross-book-return');
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'cross-book-returned');
  return bookId;
}

async function saveEditorSuffix(renderer, suffix, expectedSequence, cancellation) {
  cancellation.throwIfRequested();
  await click(renderer, '打开稿件', 'edit-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, 'edit-ready');
  cancellation.throwIfRequested();
  await assertRenderer(renderer, `(() => { const block=document.querySelector('[data-testid="manuscript-editor"] [data-block-id]'); if(!(block instanceof HTMLElement))return false; block.focus(); const range=document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText',false,${JSON.stringify(suffix)}); return block.textContent?.endsWith(${JSON.stringify(suffix)}); })()`, 'edit-inserted');
  cancellation.throwIfRequested();
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='保存当前编辑')?.disabled`, 'edit-dirty');
  cancellation.throwIfRequested();
  await click(renderer, '保存当前编辑', 'edit-save');
  await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='success' && document.querySelector('#persistence-status')?.textContent.includes('修订日志')`, 'edit-durable', 120_000);
  cancellation.throwIfRequested();
  await assertRenderer(renderer, `document.querySelector('.editor-meta')?.textContent.includes(${JSON.stringify(`修订日志序号 ${expectedSequence}`)})`, 'edit-sequence');
  await click(renderer, '返回图书工作概览', 'edit-return');
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'edit-returned');
}

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-03/${name}`);
}

async function repeatPreparationWithForeignBook(renderer, crossBookId, cancellation) {
  cancellation.throwIfRequested();
  let job = await renderer.evaluate(
    `window.ai7.prepareTaskAuthorization({goal:${JSON.stringify(TASK_GOAL)},bookId:${JSON.stringify(crossBookId)}})`,
  );
  const deadline = Date.now() + 120_000;
  while (job?.state === 'queued' || job?.state === 'running') {
    cancellation.throwIfRequested();
    requireJourney(UUID_PATTERN.test(job.jobId) && Date.now() < deadline, 'cross-book-prepare-bounded');
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    cancellation.throwIfRequested();
    job = await renderer.evaluate(`window.ai7.pollServiceJob({jobId:${JSON.stringify(job.jobId)}})`);
  }
  cancellation.throwIfRequested();
  return job;
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
      throw new Error('J-03/browser-close-unconfirmed');
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
      requireJourney(credentialReferenceForCleanup === undefined || credentialReferenceForCleanup === state.credentialReference,
        'credential-cleanup-reference');
      credentialReferenceForCleanup = state.credentialReference;
    }
    if (state === null || state.credentialOperationState === 'missing') {
      credentialRemoved = true;
      return true;
    }
    await renderer.evaluate(`window.ai7.removeModelServiceCredential()`);
    const after = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`);
    if (UUID_PATTERN.test(after?.credentialReference)) {
      requireJourney(credentialReferenceForCleanup === undefined || credentialReferenceForCleanup === after.credentialReference,
        'credential-cleanup-reference');
      credentialReferenceForCleanup = after.credentialReference;
    }
    credentialRemoved = after === null || after.credentialOperationState === 'missing';
    requireJourney(credentialRemoved, 'credential-cleanup-state');
    return true;
  };
  const cleanup = () => (cleanupPromise ??= (async () => {
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-03/browser-cleanup-failed');
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        credentialCleanupFailure ??= error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        const closedForRetry = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-03/browser-cleanup-failed');
        if (closedForRetry) {
          try {
            await launchForCleanup(true);
            await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true'`, 'credential-cleanup-ready');
            await removeCredentialThroughProduct();
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
      }
      if (!credentialRemoved) {
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-03/browser-cleanup-failed');
        const closedForFallback = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-03/browser-cleanup-failed');
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
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-03/browser-cleanup-failed');
    const browserClosed = await closeOwnedBrowserForCleanup();
    if (!browserClosed) throw cleanupFailure ?? new Error('J-03/browser-cleanup-failed');
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    try { await ownedLoopback?.close(); } catch (error) { cleanupFailure ??= error; }
    loopback = undefined;
    if (credentialMutationReached && !credentialRemoved) {
      throw credentialCleanupFailure ?? new Error('J-03/credential-cleanup-failed');
    }
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        try { await assertSecretsAbsentFromDataRoot(dataRoot, [syntheticSecret]); } catch (error) { cleanupFailure ??= error; }
      }
      try {
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j03-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    cancellation.throwIfRequested();
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j03-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    const args = [
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
      '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
      resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      '--j03-picker-path', SAMPLE1_PATH,
    ];
    const foregroundInterruptionArgs = [
      ...args,
      '--j03-foreground-execution-control', 'interrupt-before-foreground-boundary-response',
    ];
    requireJourney(!foregroundInterruptionArgs.some((argument) =>
      /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
    launchForCleanup = async (forCleanup = false, interruptBeforeForegroundBoundaryResponse = false) => {
      if (!forCleanup) cancellation.throwIfRequested();
      const acquisition = chromium.launch({
        executablePath: executable,
        headless: false,
        ignoreDefaultArgs: true,
        args: interruptBeforeForegroundBoundaryResponse ? foregroundInterruptionArgs : args,
        env: productEnvironment(executable),
        timeout: 60_000,
      });
      browserAcquisition = acquisition;
      const acquiredBrowser = await acquisition;
      attachProductOutput('J-03', acquiredBrowser, forCleanup ? 'cleanup' : 'launch');
      if (browserAcquisition === acquisition) {
        browser = acquiredBrowser;
        browserAcquisition = undefined;
      }
      if (!forCleanup) cancellation.throwIfRequested();
      renderer = await (await createRendererManager(acquiredBrowser))();
      if (!forCleanup) cancellation.throwIfRequested();
      return renderer;
    };

    at('exact-sample1');
    const sample = await lstat(SAMPLE1_PATH);
    requireJourney(sample.isFile() && !sample.isSymbolicLink() && sample.size === SAMPLE1_BYTES &&
      (await digestFile(SAMPLE1_PATH)) === SAMPLE1_SHA256, 'sample1-identity');
    await launchForCleanup();
    cancellation.throwIfRequested();

    at('renderer-ready');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'ready');
    at('renderer-api-boundary');
    await assertRenderer(renderer, `typeof globalThis.process==='undefined' && typeof globalThis.require==='undefined'`, 'renderer-isolation');
    at('renderer-task-api');
    // Synchronized delta with Issue #418: the Task Drawer reads one Task's plan through its own member.
    await assertRenderer(renderer, `typeof window.ai7.inspectTaskAuthorization==='function' &&
      typeof window.ai7.prepareTaskAuthorization==='function' &&
      typeof window.ai7.authorizeTaskAuthorization==='function' &&
      typeof window.ai7.inspectTaskPlan==='function'`, 'renderer-task-api');
    at('renderer-zero-execution-api');
    await assertRenderer(renderer, `!Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key))`, 'renderer-zero-execution-api');

    at('sample1-import');
    cancellation.throwIfRequested();
    const imported = await importSample1(renderer, cancellation);
    cancellation.throwIfRequested();

    at('task-prerequisites-unavailable');
    await waitFor(renderer, `document.querySelector('.task-authorization-card[data-task-authorization-state="unavailable"]')`, 'task-unavailable-before-prerequisites');
    // Synchronized delta with Issue #418 (editor-surfaces §10): 准备任务授权计划 reads 准备任务.
    await assertRenderer(renderer, `!document.querySelector('[data-task-authorization-action="prepare"]') && !Array.from(document.querySelectorAll('.task-authorization-card button')).some((button)=>button.textContent==='准备任务') && document.querySelector('#task-drawer')?.hidden===true`, 'task-no-premature-prepare');

    at('artifact-revision2');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="install-disabled"]')`, 'artifact-install-ready');
    at('artifact-install');
    cancellation.throwIfRequested();
    await click(renderer, '获取并安装（保持停用）', 'artifact-install');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'artifact-enable-ready');
    at('artifact-enable');
    cancellation.throwIfRequested();
    await click(renderer, '审阅并为本图书启用 Revision 2', 'artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'artifact-enabled');
    at('artifact-enabled');
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.native-artifact-card'); return card?.dataset.nativeArtifactState==='enabled-for-book' && card.textContent.includes(${JSON.stringify(SIDECAR_REVISION_2_DIGEST)}); })()`, 'artifact-exact-revision2');

    at('model-setup-remove');
    await click(renderer, '返回图书列表', 'model-return-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'model-library');
    await click(renderer, '模型服务', 'model-open');
    await waitFor(renderer, `document.querySelector('[data-screen="model-service"] [data-model-role="main-editorial"]')`, 'model-ready');
    at('model-settings-ready');
    cancellation.throwIfRequested();
    syntheticSecret = randomBytes(48).toString('base64url');
    await fill(renderer, '#main-editorial-connection-name', 'J-03 主编辑连接', 'model-name');
    cancellation.throwIfRequested();
    await fill(renderer, '#main-editorial-credential', syntheticSecret, 'model-secret');
    cancellation.throwIfRequested();
    credentialMutationReached = true;
    await click(renderer, '保护并保存', 'model-save');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('[data-credential-state="ready"]')`, 'model-saved');
    at('model-credential-saved');
    const readyConnection = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(UUID_PATTERN.test(readyConnection?.credentialReference) && readyConnection?.credentialOperationState === 'ready', 'model-ready-reference');
    credentialReferenceForCleanup = readyConnection.credentialReference;
    cancellation.throwIfRequested();
    await click(renderer, '移除', 'model-remove');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='setup-required' && document.querySelector('[data-credential-state="missing"]')`, 'model-removed');
    at('model-credential-removed');
    const missingConnection = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(missingConnection?.credentialReference === readyConnection.credentialReference && missingConnection?.credentialOperationState === 'missing', 'model-missing-stable-reference');
    credentialRemoved = true;
    cancellation.throwIfRequested();
    await click(renderer, '返回', 'model-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'model-back-library');
    cancellation.throwIfRequested();
    const crossBookId = await createEmptyBook(renderer, cancellation);
    cancellation.throwIfRequested();
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'book-reopen');
    // Synchronized delta with Issue #405: the Book route enters the manuscript now (V2-UX-RET-002),
    // and 工作概览 is reached back through the manuscript's 资料与记录 group (V2-UX-IA-012).
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'book-reopened-manuscript');
    await click(renderer, '返回图书工作概览', 'book-reopened-to-overview');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'book-reopened');

    at('acknowledged-edit');
    cancellation.throwIfRequested();
    await saveEditorSuffix(renderer, '，J-03 授权前已确认编辑', 1, cancellation);
    cancellation.throwIfRequested();
    await waitFor(renderer, `document.querySelector('.task-authorization-card[data-task-authorization-state="available"]')`, 'task-available');

    at('j14-ime-focus');
    await assertRenderer(renderer, `(async()=>{ const input=document.querySelector('#j03-task-goal'); const card=document.querySelector('.task-authorization-card'); if(!(input instanceof HTMLInputElement)||!card)return false; const before=card.dataset.taskAuthorizationState; input.focus(); input.dispatchEvent(new CompositionEvent('compositionstart',{data:'分析',bubbles:true})); const enter=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true,cancelable:true}); input.dispatchEvent(enter); input.dispatchEvent(new CompositionEvent('compositionend',{data:'分析',bubbles:true})); await new Promise((resolve)=>setTimeout(resolve,75)); return document.activeElement===input && input.value===${JSON.stringify(TASK_GOAL)} && card.dataset.taskAuthorizationState===before && !document.querySelector('[data-service-job-id]'); })()`, 'ime-enter-no-submit');
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab' });
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
    await assertRenderer(renderer, `document.activeElement?.dataset.taskAuthorizationAction==='prepare' && document.activeElement.matches(':focus-visible')`, 'keyboard-focus-prepare');

    at('j14-reflow-forced-colors');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(renderer, `document.documentElement.scrollWidth<=document.documentElement.clientWidth+2 && getComputedStyle(document.querySelector('.task-authorization-card')).overflowX!=='scroll'`, 'zoom-reflow');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.task-authorization-card')).boxShadow==='none' && getComputedStyle(document.querySelector('.task-authorization-status')).borderStyle!=='none'`, 'forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('plan-prepared');
    cancellation.throwIfRequested();
    await click(renderer, '准备任务', 'prepare-click');
    await waitFor(renderer, `document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='prepared'`, 'prepared', 120_000);
    cancellation.throwIfRequested();
    const prepared = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(prepared?.state === 'prepared' && prepared.taskIntent?.goal === TASK_GOAL &&
      prepared.checkpoint?.revisionLabel === 'r2' && prepared.checkpoint?.createdForDirtyJournal === true &&
      prepared.checkpoint?.journalSequence === 1 && prepared.checkpoint?.purpose === 'Task Input / 任务输入' &&
      DIGEST_PATTERN.test(prepared.checkpoint?.revisionDigest) && prepared.manuscriptPin?.revisionId === prepared.checkpoint.revisionId &&
      prepared.manuscriptPin?.revisionDigest === prepared.checkpoint.revisionDigest &&
      prepared.manuscriptPin?.sourceVersionId === imported.sourceVersionId && prepared.manuscriptPin?.sourceDigest === SAMPLE1_SHA256 &&
      prepared.runSourceScope?.bookId === imported.bookId && prepared.runSourceScope?.manuscriptId === prepared.manuscriptPin.manuscriptId &&
      prepared.runSourceScope?.taskInputRevision?.revisionId === prepared.checkpoint.revisionId &&
      prepared.runSourceScope?.taskInputRevision?.revisionDigest === prepared.checkpoint.revisionDigest &&
      JSON.stringify(prepared.runSourceScope?.readableScopeKinds) === JSON.stringify(['current-book-primary-manuscript-revision']) &&
      prepared.runSourceScope?.sourceVersionEvidence?.sourceVersionId === imported.sourceVersionId && prepared.runSourceScope?.sourceVersionEvidence?.readable === false &&
      prepared.artifactPin?.nativeCarrierSha256 === NATIVE_CARRIER_DIGEST &&
      prepared.artifactPin?.sidecarRevision === 2 && prepared.artifactPin?.sidecarSha256 === SIDECAR_REVISION_2_DIGEST &&
      prepared.providerResolutionPlan?.role === 'Main Editorial Role' && prepared.providerResolutionPlan?.capabilities?.length === 0 &&
      prepared.providerResolutionPlan?.providerId === 'deepseek-open-platform' && prepared.providerResolutionPlan?.modelId === 'deepseek-v4-pro' &&
      prepared.providerResolutionPlan?.adapterRevision === 1 && prepared.providerResolutionPlan?.configurationRevision === 1 &&
      prepared.providerResolutionPlan?.approvedFallbackChain?.length === 0 && prepared.providerResolutionPlan?.credentialReference === readyConnection.credentialReference &&
      prepared.providerResolutionPlan?.credentialReadiness === 'missing' && prepared.providerResolutionPlan?.outboundDataCategory === 'public-or-synthetic' &&
      prepared.providerResolutionPlan?.runBudgetCeiling === 'unset' && prepared.providerResolutionPlan?.providerProcessing?.decision === 'deny' &&
      prepared.providerResolutionPlan?.providerProcessing?.authorizedLiveTransmissionCount === 0 &&
      prepared.executionPlan?.effects?.length === 0 && prepared.planEnvelope?.dispatchAllowed === false &&
      prepared.planEnvelope?.providerStatus === 'denied' && DIGEST_PATTERN.test(prepared.planEnvelope?.digest) &&
      prepared.actions?.canAuthorize === true && prepared.authorization === null && prepared.runRecord === null,
    'prepared-exact-envelope');
    // Synchronized delta with Issue #418 (S72 D4): the card keeps one line naming the plan, 查看计划 and the
    // recording action, which stays here until S74; the plan itself — every identity the card's preview
    // used to show included — opens in the Task Drawer, where the stages below read it.
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.task-authorization-card'); const open=card?.querySelector('[data-task-authorization-action="view-plan"]'); const button=card?.querySelector('[data-task-authorization-action="authorize-no-dispatch"]'); return card?.querySelector('.task-plan-summary-line')?.textContent==='计划：固定任务 · 全书 · 任务输入修订版 r2 · 不发送任何内容' && open instanceof HTMLButtonElement && !open.disabled && open.textContent==='查看计划' && open.dataset.taskPlanOpen==='fixed-task' && open.getAttribute('aria-controls')==='task-drawer' && !card.querySelector('dl.task-authorization-facts, .task-authorization-non-effects') && !card.textContent.includes('空（无）') && button?.textContent==='记录本次运行授权（不派发）'; })()`, 'prepared-preview');

    at('drawer-plan-compact');
    // Preparing opened the plan it froze beside the card, in 精简, with focus on the drawer's title.
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready' && document.activeElement?.id==='task-drawer-title'`, 'drawer-opened-on-prepare');
    const compact = await readDrawer(renderer);
    const selectedCount = /^已选 ([\d,]+) 字$/u.exec(compact?.chips?.selected ?? '')?.[1];
    requireJourney(compact?.hidden === false && compact.open === 'open' && compact.shell === 'open' && compact.kind === 'fixed-task' &&
      compact.ref === prepared.taskIntent.taskIntentId && compact.version === null && compact.mode === 'compact' && compact.stored === null &&
      compact.title === '任务计划' && compact.pill === '尚未开始' && compact.pillShape === 'ring' && compact.sentence === TASK_GOAL &&
      selectedCount !== undefined &&
      JSON.stringify(compact.chips) === JSON.stringify({ book: 'J-03 sample1 任务授权', position: '全书', selected: `已选 ${selectedCount} 字`, revision: '任务输入修订版 r2', procedure: '工序「固定任务」' }) &&
      compact.saved === '已为任务保存修订版 r2，之后的编辑不影响这项任务。' && compact.drift === null &&
      JSON.stringify(compact.rows) === JSON.stringify({
        处理: `《J-03 sample1 任务授权》全书 · ${selectedCount} 字 · 任务输入修订版 r2`,
        发送: '本环境不连接模型服务，不会发送任何内容 · 用量：不发送，没有模型用量 · 未设置任务预算上限',
        会得到: '一条运行记录：只记录这次运行授权，不派发，不产出重点清单',
        不会: '不会开始运行（只记录） · 不会直接修改稿件 · 不导出或发布 · 不存里程碑版本 · 不读这本书以外的内容',
        中途: '预计无需中途参与',
      }) &&
      compact.sections.length === 0 && Object.keys(compact.technical).length === 0 &&
      compact.controls.tasks?.text === '← 任务' && compact.controls.tasks.disabled === true &&
      compact.controls.edit?.text === '修改' && compact.controls.edit.disabled === true &&
      compact.controls['mode-compact']?.text === '精简' && compact.controls['mode-compact'].pressed === 'true' &&
      compact.controls['mode-full']?.text === '完整' && compact.controls['mode-full'].pressed === 'false' &&
      compact.controls['full-link']?.text === '完整计划（6 段）' && compact.controls.close?.text === '关闭' &&
      compact.footer === '计划说明，不是运行授权', 'drawer-compact-plan', compact);

    at('drawer-plan-full');
    // 完整: the six sections, PLAN-012's two columns, and every identity the card's preview used to show,
    // each exactly as the prepared plan froze it, one step away in 查看技术详情 (LAYER-001, LAYER-007).
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="full-link"]', 'drawer-full-link');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerMode==='full' && document.activeElement?.dataset.taskDrawerControl==='mode-full'`, 'drawer-full-mode');
    const full = await readDrawer(renderer);
    requireJourney(full?.stored === 'full' && full.controls['mode-full']?.pressed === 'true' && full.controls['mode-compact']?.pressed === 'false' &&
      JSON.stringify(full.sections) === JSON.stringify(['1要做什么 · 会得到什么', '2处理哪些内容 · 参考什么', '3怎么做', '4你会参与的地方', '5预计与限制', '6会得到 / 不会做']) &&
      full.terms['做什么'] === TASK_GOAL && full.terms['要处理'] === compact.rows['处理'] && full.terms['允许参考'] === '不参考其他材料' &&
      full.terms['可能发送'] === '不发送任何内容' && full.terms['不会读'] === '其他图书；来源材料（来源版本仅作血缘证据，不属于可读范围）' &&
      JSON.stringify(full.steps) === JSON.stringify(['准备任务输入 → 任务输入修订版 r2', '记录运行（不派发） → 运行记录']) &&
      JSON.stringify(full.participation) === JSON.stringify(['预计无需中途参与']) &&
      full.terms['模型角色'] === '主编辑角色' && full.terms['提供方'] === 'DeepSeek 开放平台 · deepseek-v4-pro' &&
      full.terms['提供方状态'] === '远程模型服务被拒绝（development-ci · v1：0 次实时传输）；这项任务只记录，不派发' &&
      full.terms['会发送'] === '本环境不连接模型服务，不会发送任何内容' && full.terms['发送内容类别'] === '公开或合成材料' &&
      full.terms['用量上限'] === '不发送，没有模型用量' && full.terms['所需时间'] === '暂无可靠估计' &&
      full.terms['预算上限'] === '未设置任务预算上限' && full.terms['账户限额'] === '未知 · 提供方未返回' &&
      JSON.stringify(full.outcomes) === JSON.stringify(['一条运行记录：只记录这次运行授权，不派发，不产出重点清单']) &&
      JSON.stringify(full.notDo) === JSON.stringify(['不会开始运行（只记录）', '不会直接修改稿件', '不导出或发布', '不存里程碑版本', '不读这本书以外的内容']) &&
      JSON.stringify(full.columns) === JSON.stringify(['运行中 AI7 可以自己调整', '这些一变就先停下来问你']) &&
      JSON.stringify(full.adaptable) === JSON.stringify(['无']) &&
      JSON.stringify(full.askFirst) === JSON.stringify(['固定要做的事、处理范围、参考范围与所用工序', '固定模型服务、发送内容类别、预算上限', '固定结果类型、受控动作']) &&
      full.controls['default-rule']?.text === '设为快速开始默认…' && full.controls['default-rule'].disabled === true &&
      full.controls.technical?.text === '查看技术详情' && full.footer === '计划说明，不是运行授权', 'drawer-full-plan', full);
    const technical = full.technical;
    requireJourney(technical['task-intent'] === prepared.taskIntent.taskIntentId &&
      technical['task-input-revision'] === `r2 · ${prepared.checkpoint.revisionId} · ${prepared.checkpoint.revisionDigest}` &&
      technical['readable-scope'] === `仅图书 ${imported.bookId} · 主稿件 ${prepared.manuscriptPin.manuscriptId} · 任务输入修订版 ${prepared.checkpoint.revisionId} · ${prepared.checkpoint.revisionDigest}` &&
      technical['source-evidence'] === `${imported.sourceVersionId} · 仅血缘证据，不属于可读范围` && technical['source-digest'] === SAMPLE1_SHA256 &&
      technical['native-artifact']?.endsWith(` · ${NATIVE_CARRIER_DIGEST}`) && technical['authority-sidecar']?.endsWith(` · Revision 2 · ${SIDECAR_REVISION_2_DIGEST}`) &&
      technical['provider-binding'] === `${prepared.providerResolutionPlan.providerId} · ${prepared.providerResolutionPlan.modelId} · adapter r${prepared.providerResolutionPlan.adapterRevision} · config r${prepared.providerResolutionPlan.configurationRevision}` &&
      technical.capabilities === '未声明' && technical['fallback-chain'] === '未声明' && technical.effects === '未声明' &&
      technical['credential-reference'] === readyConnection.credentialReference && technical['credential-readiness'] === 'readiness missing' &&
      technical['outbound-category'] === 'public-or-synthetic' && technical['run-budget-ceiling'] === 'unset' &&
      technical['provider-processing'] === 'development-ci · v1 · 拒绝 · 0 次实时传输' && technical['plan-envelope'] === prepared.planEnvelope.digest &&
      technical['not-do'] === prepared.namedNonEffects.join('；') && technical.authorization === undefined && technical['run-record'] === undefined,
    'drawer-technical-identities', technical);

    at('drawer-keyboard');
    // Esc closes the drawer from inside it and focus returns to the 查看计划 that raised it; Enter there
    // opens it again, in the mode the editor chose, with focus on its title.
    await pressKey(renderer, ESCAPE_KEY);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden===true && document.body.dataset.taskDrawer==='closed' && document.activeElement?.dataset.taskAuthorizationAction==='view-plan'`, 'drawer-escape-returns-focus');
    await pressKey(renderer, ENTER_KEY);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready' && document.querySelector('#task-drawer')?.dataset.taskDrawerMode==='full' && document.activeElement?.id==='task-drawer-title'`, 'drawer-enter-reopens');
    // Tab reaches the two modes (the disabled ← 任务 is passed over), Enter switches them, and 关闭 is next.
    await pressKey(renderer, TAB_KEY);
    await assertRenderer(renderer, `document.activeElement?.dataset.taskDrawerControl==='mode-compact' && document.activeElement.matches(':focus-visible')`, 'drawer-tab-compact');
    await pressKey(renderer, ENTER_KEY);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerMode==='compact' && document.querySelectorAll('#task-drawer [data-task-plan-row]').length===5 && document.activeElement?.dataset.taskDrawerControl==='mode-compact' && document.activeElement.getAttribute('aria-pressed')==='true'`, 'drawer-enter-compact');
    await pressKey(renderer, TAB_KEY);
    await assertRenderer(renderer, `document.activeElement?.dataset.taskDrawerControl==='mode-full'`, 'drawer-tab-full');
    await pressKey(renderer, ENTER_KEY);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerMode==='full' && document.querySelectorAll('#task-drawer [data-task-plan-section]').length===6 && document.activeElement?.getAttribute('aria-pressed')==='true'`, 'drawer-enter-full');
    await pressKey(renderer, TAB_KEY);
    await assertRenderer(renderer, `document.activeElement?.dataset.taskDrawerControl==='close'`, 'drawer-tab-close');
    await pressKey(renderer, ENTER_KEY);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden===true && document.activeElement?.dataset.taskAuthorizationAction==='view-plan'`, 'drawer-close-returns-focus');
    await pressKey(renderer, ENTER_KEY);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready' && document.activeElement?.id==='task-drawer-title'`, 'drawer-reopened');

    at('drawer-push-overlay');
    // At 1120 px and wider the page makes room for the drawer, which is a column beside it; below, the
    // drawer lies over the page and the page keeps its width (editor-surfaces §0.3).
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); const page=document.querySelector('#screen'); const status=document.querySelector('#persistence-status'); if(!(drawer instanceof HTMLElement)||drawer.hidden||!page||!status)return false; const box=drawer.getBoundingClientRect(); const viewport=document.documentElement; return innerWidth===1180 && Math.abs(box.right-viewport.clientWidth)<=1 && box.top<=0.5 && box.bottom>=viewport.clientHeight-0.5 && Math.abs(parseFloat(getComputedStyle(document.body).paddingRight)-box.width)<=1 && page.getBoundingClientRect().right<=box.left+0.5 && status.getBoundingClientRect().right<=box.left+0.5; })()`, 'drawer-push-column');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 820, deviceScaleFactor: 1, mobile: false });
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); const page=document.querySelector('#screen'); if(!(drawer instanceof HTMLElement)||drawer.hidden||!page)return false; const box=drawer.getBoundingClientRect(); return innerWidth===1000 && getComputedStyle(document.body).paddingRight==='0px' && getComputedStyle(drawer).position==='fixed' && page.getBoundingClientRect().right>box.left+100 && box.width<=document.documentElement.clientWidth; })()`, 'drawer-overlay-below-1120');
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('drawer-reflow-forced-colors');
    // At 200% the drawer's header, content and every exact identity wrap inside it: nothing scrolls
    // sideways. Without colour, the drawer keeps its edge, the pill its outline and the chosen mode its own.
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(renderer, `(() => { const details=document.querySelector('#task-drawer details.task-plan-technical'); if(!(details instanceof HTMLDetailsElement))return false; details.open=true; return true; })()`, 'drawer-technical-open');
    await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); const body=drawer?.querySelector('.task-drawer-body'); const head=drawer?.querySelector('.task-drawer-head'); if(!(drawer instanceof HTMLElement)||drawer.hidden||!body||!head)return false; const viewport=document.documentElement; return viewport.scrollWidth<=viewport.clientWidth+2 && body.scrollWidth<=body.clientWidth+2 && head.scrollWidth<=head.clientWidth+2 && drawer.getBoundingClientRect().width<=viewport.clientWidth && getComputedStyle(document.body).paddingRight==='0px'; })()`, 'drawer-zoom-reflow');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); const pill=drawer?.querySelector('.task-drawer-pill'); const chosen=drawer?.querySelector('[data-task-drawer-mode][aria-pressed="true"]'); return matchMedia('(forced-colors: active)').matches && drawer instanceof HTMLElement && getComputedStyle(drawer).boxShadow==='none' && getComputedStyle(drawer).borderLeftStyle!=='none' && pill instanceof HTMLElement && getComputedStyle(pill).borderStyle!=='none' && chosen instanceof HTMLElement && getComputedStyle(chosen).outlineStyle!=='none'; })()`, 'drawer-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('drawer-one-slot-with-navigation');
    // The drawer stays beside the manuscript of the same Book (D3); 导航 opening takes the one side slot
    // and closes it (IA). The manuscript's 任务 entry waits for the 任务 panel (S77).
    cancellation.throwIfRequested();
    await click(renderer, '打开稿件', 'drawer-manuscript-open');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]') && document.querySelector('#task-drawer')?.dataset.taskDrawer==='open' && document.querySelector('#task-drawer')?.dataset.taskPlanKind==='fixed-task' && document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready' && document.querySelector('#manuscript-navigation-panel')?.hidden===true`, 'drawer-beside-manuscript');
    await clickSelector(renderer, '[data-edge-entry="navigation"]', 'drawer-navigation-open');
    await waitFor(renderer, `document.querySelector('#manuscript-navigation-panel')?.hidden===false && document.querySelector('#task-drawer')?.hidden===true && document.body.dataset.taskDrawer==='closed'`, 'drawer-one-slot');
    await assertRenderer(renderer, `document.querySelector('[data-edge-entry="tasks"]')?.disabled===true`, 'drawer-tasks-entry-waits');
    await click(renderer, '返回图书工作概览', 'drawer-manuscript-return');
    await waitFor(renderer, `document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='prepared' && document.querySelector('#task-drawer')?.hidden===true`, 'drawer-manuscript-returned');

    at('cross-book-route-guard');
    const crossBookPreparation = await repeatPreparationWithForeignBook(renderer, crossBookId, cancellation);
    requireJourney(crossBookPreparation?.state === 'completed' && crossBookPreparation.result?.bookId === imported.bookId &&
      crossBookPreparation.result?.checkpoint?.revisionId === prepared.checkpoint.revisionId &&
      crossBookPreparation.result?.planEnvelope?.digest === prepared.planEnvelope.digest,
    'prepare-sender-owned-book-route-idempotent');
    await assertRenderer(renderer, `document.querySelector('.book-overview')?.dataset.bookId===${JSON.stringify(imported.bookId)} && document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='prepared'`, 'prepare-route-remained-current-book');

    at('authorization-recorded');
    cancellation.throwIfRequested();
    // The plan is open beside the card while the recording action, still the card's, is taken.
    await clickSelector(renderer, '[data-task-plan-open="fixed-task"]', 'authorize-drawer-open');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready' && document.querySelector('#task-drawer')?.dataset.taskDrawerMode==='full'`, 'authorize-drawer-ready');
    await click(renderer, '记录本次运行授权（不派发）', 'authorize-click');
    await waitFor(renderer, `document.querySelector('[data-task-authorization-terminal="recorded-not-dispatched"]')?.textContent==='已记录授权 · 未派发'`, 'authorized');
    const authorized = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(authorized?.state === 'authorized' && UUID_PATTERN.test(authorized.authorization?.authorizationId) &&
      authorized.authorization?.origin === 'standard-direct' && authorized.authorization?.planEnvelopeDigest === prepared.planEnvelope.digest &&
      UUID_PATTERN.test(authorized.runRecord?.runRecordId) && authorized.runRecord?.state === 'recorded-not-dispatched' &&
      authorized.runRecord?.dispatched === false && authorized.runRecord?.terminalLabel === '已记录授权 · 未派发' &&
      authorized.actions?.canPrepare === false && authorized.actions?.canAuthorize === false &&
      authorized.namedNonEffects?.length === 6, 'authorized-terminal');
    const repeatedAuthorization = await renderer.evaluate(`window.ai7.authorizeTaskAuthorization({taskIntentId:${JSON.stringify(authorized.taskIntent.taskIntentId)},planEnvelopeDigest:${JSON.stringify(authorized.planEnvelope.digest)},bookId:${JSON.stringify(crossBookId)}})`);
    requireJourney(repeatedAuthorization?.authorization?.authorizationId === authorized.authorization.authorizationId && repeatedAuthorization?.runRecord?.runRecordId === authorized.runRecord.runRecordId, 'authorization-idempotent');
    cancellation.throwIfRequested();

    at('drawer-authorization-refresh');
    // The drawer reads the plan again once the card recorded the authorization: it states the record, and
    // it still holds no action of its own that records anything (PLAN-007).
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='recorded'`, 'drawer-recorded');
    const recordedDrawer = await readDrawer(renderer);
    requireJourney(recordedDrawer?.ref === authorized.taskIntent.taskIntentId && recordedDrawer.pill === '已记录 · 未派发' && recordedDrawer.pillShape === 'dash' &&
      recordedDrawer.technical.authorization?.startsWith(`${authorized.authorization.authorizationId} · standard-direct · `) &&
      recordedDrawer.technical['run-record']?.startsWith(`${authorized.runRecord.runRecordId} · recorded-not-dispatched · `) &&
      recordedDrawer.technical['plan-envelope'] === authorized.planEnvelope.digest && recordedDrawer.footer === '计划说明，不是运行授权',
    'drawer-recorded-plan', recordedDrawer);
    await assertRenderer(renderer, `!document.querySelector('#task-drawer [data-task-authorization-action]') && Array.from(document.querySelectorAll('#task-drawer button')).filter((button)=>!button.disabled).map((button)=>button.dataset.taskDrawerControl).sort().join(',')==='close,mode-compact,mode-full'`, 'drawer-records-nothing');

    at('foreground-boundary-check');
    await assertRenderer(renderer, `document.querySelector('[data-task-authorization-action="inspect-foreground-boundary"]')?.textContent==='核对前台执行边界（不派发）'`, 'foreground-boundary-action-visible');
    await click(renderer, '核对前台执行边界（不派发）', 'foreground-boundary-click');
    await waitFor(renderer, `document.querySelector('[data-foreground-execution-state="blocked-before-dispatch"]')?.textContent.includes('前台执行已拒绝 · 未启动')`, 'foreground-boundary-blocked');
    await assertRenderer(renderer, `(() => { const result=document.querySelector('[data-foreground-execution-state="blocked-before-dispatch"]'); return result?.textContent.includes('record-only-no-dispatch') && result.textContent.includes('development-ci · Provider Processing v1 · 0 次实时传输') && result.textContent.includes('生产或录制尝试必须创建新 Plan Envelope 并重新记录 Run Authorization'); })()`, 'foreground-boundary-visible-reasons');

    const blockedBoundary = await renderer.evaluate(`window.ai7.inspectForegroundExecutionBoundary({runRecordId:${JSON.stringify(authorized.runRecord.runRecordId)},bookId:${JSON.stringify(crossBookId)}})`);
    requireJourney(blockedBoundary?.state === 'blocked-before-dispatch' && blockedBoundary?.terminalLabel === '前台执行已拒绝 · 未启动' &&
      blockedBoundary?.bookId === imported.bookId && blockedBoundary?.taskIntentId === authorized.taskIntent.taskIntentId &&
      blockedBoundary?.planEnvelopeDigest === authorized.planEnvelope.digest && blockedBoundary?.authorizationId === authorized.authorization.authorizationId &&
      blockedBoundary?.runRecordId === authorized.runRecord.runRecordId && blockedBoundary?.runAuthority === 'record-only-no-dispatch' &&
      blockedBoundary?.launchPolicy?.integrityState === 'verified' && blockedBoundary?.launchPolicy?.operationalScope === 'development-ci' &&
      blockedBoundary?.launchPolicy?.providerProcessing?.version === 'v1' && blockedBoundary?.launchPolicy?.providerProcessing?.decision === 'deny' &&
      blockedBoundary?.launchPolicy?.providerProcessing?.authorizedLiveTransmissionCount === 0 &&
      blockedBoundary?.launchPolicy?.providerProcessing?.liveTransmissionAllowed === false &&
      blockedBoundary?.requiresNewPlanEnvelope === true && blockedBoundary?.requiresRenewedRunAuthorization === true &&
      JSON.stringify(blockedBoundary?.reasons) === JSON.stringify([
        '现有 Run 权限仅为 record-only-no-dispatch，不能派发。',
        '当前可信启动范围为 development-ci，Provider Processing v1 允许 0 次实时传输。',
        '生产或录制尝试必须创建新 Plan Envelope 并重新记录 Run Authorization。',
      ]), 'foreground-boundary-exact-denial');
    const afterBoundary = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(JSON.stringify(afterBoundary) === JSON.stringify(authorized), 'foreground-boundary-read-only');
    cancellation.throwIfRequested();

    at('post-authorization-edit');
    await saveEditorSuffix(renderer, '，J-03 授权后继续编辑', 2, cancellation);
    await waitFor(renderer, `document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='authorized'`, 'post-edit-record');
    const afterEdit = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(afterEdit?.checkpoint?.revisionId === authorized.checkpoint.revisionId &&
      afterEdit?.checkpoint?.revisionDigest === authorized.checkpoint.revisionDigest &&
      afterEdit?.authorization?.authorizationId === authorized.authorization.authorizationId &&
      afterEdit?.runRecord?.runRecordId === authorized.runRecord.runRecordId, 'post-edit-immutable');
    await assertRenderer(renderer, `document.querySelector('[data-task-authorization-action="inspect-foreground-boundary"]')?.textContent==='核对前台执行边界（不派发）'`, 'post-edit-foreground-boundary-visible');
    // TASK-039/040: the drawer stayed open across the manuscript and back, and the plan it reads still names
    // the revision saved for the Task; the later edit did not touch it.
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='recorded' && document.querySelector('#task-drawer [data-task-plan-chip="revision"]')?.textContent==='任务输入修订版 r2'`, 'post-edit-drawer-r2');
    cancellation.throwIfRequested();

    at('restart-immutable');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'restart-open-book');
    // Synchronized delta with Issue #405: the Book route enters the manuscript now
    // (V2-UX-RET-002); this card lives on 工作概览, reached back through 资料与记录 (V2-UX-IA-012).
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'restart-open-book-manuscript');
    await click(renderer, '返回图书工作概览', 'restart-open-book-to-overview');
    await waitFor(renderer, `document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='authorized'`, 'restart-record-visible');
    const restarted = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(restarted?.taskIntent?.taskIntentId === authorized.taskIntent.taskIntentId &&
      restarted?.checkpoint?.revisionId === authorized.checkpoint.revisionId && restarted?.planEnvelope?.digest === authorized.planEnvelope.digest &&
      restarted?.authorization?.authorizationId === authorized.authorization.authorizationId &&
      restarted?.runRecord?.runRecordId === authorized.runRecord.runRecordId && restarted?.runRecord?.dispatched === false,
    'restart-record-immutable');
    await click(renderer, '核对前台执行边界（不派发）', 'restart-foreground-boundary-click');
    await waitFor(renderer, `document.querySelector('[data-foreground-execution-state="blocked-before-dispatch"]')?.textContent.includes('前台执行已拒绝 · 未启动')`, 'restart-foreground-boundary-blocked');
    const restartedBoundary = await renderer.evaluate(`window.ai7.inspectForegroundExecutionBoundary({runRecordId:${JSON.stringify(authorized.runRecord.runRecordId)}})`);
    requireJourney(restartedBoundary?.bookId === blockedBoundary.bookId && restartedBoundary?.taskIntentId === blockedBoundary.taskIntentId &&
      restartedBoundary?.planEnvelopeDigest === blockedBoundary.planEnvelopeDigest && restartedBoundary?.authorizationId === blockedBoundary.authorizationId &&
      restartedBoundary?.runRecordId === blockedBoundary.runRecordId && restartedBoundary?.state === blockedBoundary.state &&
      JSON.stringify(restartedBoundary?.reasons) === JSON.stringify(blockedBoundary.reasons),
    'restart-foreground-boundary-immutable');

    at('drawer-restart-mode');
    // The mode the editor chose is remembered across the restart (PLAN-010), and the plan is the recorded one.
    await clickSelector(renderer, '[data-task-plan-open="fixed-task"]', 'restart-drawer-open');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='recorded' && document.activeElement?.id==='task-drawer-title'`, 'restart-drawer-ready');
    const restartedDrawer = await readDrawer(renderer);
    requireJourney(restartedDrawer?.mode === 'full' && restartedDrawer.stored === 'full' && restartedDrawer.controls['mode-full']?.pressed === 'true' &&
      restartedDrawer.sections.length === 6 && restartedDrawer.pill === '已记录 · 未派发' && restartedDrawer.chips.revision === '任务输入修订版 r2' &&
      restartedDrawer.technical.authorization?.startsWith(`${authorized.authorization.authorizationId} · standard-direct · `) &&
      restartedDrawer.technical['run-record']?.startsWith(`${authorized.runRecord.runRecordId} · recorded-not-dispatched · `),
    'drawer-mode-remembered', restartedDrawer);

    at('zero-activity');
    // Synchronized delta with Issue #418: 查看计划 is the card's one other control, and the drawer beside it
    // holds nothing but its own view controls.
    await assertRenderer(renderer, `document.querySelector('[data-task-authorization-terminal="recorded-not-dispatched"]')?.textContent==='已记录授权 · 未派发' &&
      document.querySelector('[data-foreground-execution-state="blocked-before-dispatch"]')?.textContent.includes('前台执行已拒绝 · 未启动') &&
      !Array.from(document.querySelectorAll('.task-authorization-card button')).some((button)=>!['inspect-foreground-boundary','view-plan'].includes(button.dataset.taskAuthorizationAction)) &&
      Array.from(document.querySelectorAll('#task-drawer button')).filter((button)=>!button.disabled).map((button)=>button.dataset.taskDrawerControl).sort().join(',')==='close,mode-compact,mode-full' &&
      !Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key))`, 'no-execution-surface');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-network-provider-session');

    at('foreground-boundary-check');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await launchForCleanup(false, true);
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'interruption-restart-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'interruption-open-book');
    // Synchronized delta with Issue #405: the Book route enters the manuscript now
    // (V2-UX-RET-002); this card lives on 工作概览, reached back through 资料与记录 (V2-UX-IA-012).
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'interruption-open-book-manuscript');
    await click(renderer, '返回图书工作概览', 'interruption-open-book-to-overview');
    await waitFor(renderer, `document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='authorized'`, 'interruption-record-visible');
    await clickSelector(renderer, '[data-task-plan-open="fixed-task"]', 'interruption-drawer-open');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState==='recorded'`, 'interruption-drawer-ready');
    await click(renderer, '核对前台执行边界（不派发）', 'interruption-boundary-click');
    await waitFor(renderer, `document.documentElement.dataset.ai7ServiceState==='interrupted' &&
      document.querySelector('#persistence-status')?.dataset.tone==='error' &&
      document.querySelector('#persistence-status')?.textContent==='本地业务服务已停止。'`, 'interruption-boundary-settled');
    await assertRenderer(renderer, `(() => { const action=document.querySelector('[data-task-authorization-action="inspect-foreground-boundary"]'); const controls=Array.from(document.querySelectorAll('#screen button, #screen input')); return action instanceof HTMLButtonElement && action.isConnected && action.disabled && controls.length>0 && controls.every((control)=>control.disabled) && document.querySelector('[data-task-authorization-terminal="recorded-not-dispatched"]')?.textContent==='已记录授权 · 未派发' && !document.querySelector('[data-foreground-execution-state]'); })()`, 'interruption-remains-fail-closed');
    // The drawer beside the card fails closed with the rest of the window (Issue #418).
    await assertRenderer(renderer, `(() => { const controls=Array.from(document.querySelectorAll('#task-drawer button')); return document.querySelector('#task-drawer')?.hidden===false && controls.length>0 && controls.every((control)=>control.disabled); })()`, 'interruption-drawer-fail-closed');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'interruption-zero-network');
  } finally {
    finalCleanupRequested = true;
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch((error) => {
  reportJourneyFailure('J-03', location, error);
  if (runnerLifecycleIncomplete) process.stderr.write('', () => process.exit(1));
});
