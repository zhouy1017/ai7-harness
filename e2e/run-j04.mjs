import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// Supported-journey scenario: J-04 covered baseline manuscript analysis (Issue #92, bounded S36 slice)
// extended in place by Issue #93 (S37): after the acknowledged edit, the three Analysis Update
// Controls each append a successor Result Set Revision through the same real path, and the Analysis
// Result Revision History keeps every earlier revision reachable, immutable, and bound to its pin.
// Inputs: exact ADR 0043 SampleBooks/sample1.docx plus the hand-written synthetic model fixtures under
// tests/fixtures/model/. The product executes every Run over the in-process ai7-local-deterministic route;
// the remote DeepSeek binding stays denied under Provider Processing v1 and no socket is opened.
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const SAMPLE1_BLOCKS = 97;
const SAMPLE1_UNITS = 8;
const SAMPLE1_UNIT_RANGES = [[1, 15], [16, 25], [26, 43], [44, 59], [60, 68], [69, 75], [76, 92], [93, 97]];
const SIDECAR_REVISION_2_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
const NATIVE_CARRIER_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
const PROMPT_CONTRACT_DIGEST = '4ba25b2f848b99213336f67dc2b7960c942bfbcf6213a0d3fd91c427efb57eb5';
const TASK_GOAL = '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。';
const SYNC_GOAL = '将基线稿件分析同步到当前稿件：复用内容一致的兼容单元，仅重算失效闭包，追加一个结果集修订版。';
const RANGE_GOAL = '重新分析所选范围：绕过所选内容块范围及其重叠闭包的既有模型结果，复用其余兼容单元，追加一个结果集修订版。';
const BOOK_GOAL = '重新分析全书：绕过全部既有模型结果，按当前覆盖清单重算每个分析单元，追加一个结果集修订版。';
const REUSE_PLAN_SCHEMA = 'ai7.baseline-manuscript-analysis.reuse-plan/1';
/** Every button the settled card may carry: navigation, the three update controls, history, and the hidden cancel. */
const ANALYSIS_ACTIONS = ['return-to-range', 'sync-current', 'reanalyze-range', 'reanalyze-book', 'open-revision', 'close-revision', 'cancel-preparation'];
const ONLY_ANALYSIS_ACTIONS = `Array.from(card.querySelectorAll('button')).every((button)=>${JSON.stringify(ANALYSIS_ACTIONS)}.includes(button.dataset.analysisAction))`;
const ASSURANCE_STATEMENT = '仅为模型输出的结构化归纳；不构成事实判定、编辑评审或稿件变更。';
const FIXTURES_ROOT = resolve(ROOT, 'tests', 'fixtures', 'model');
const FIXTURE_IDENTITY = 'sample1-baseline-one-unit-failure';
const FIXTURE_BASE_IDENTITY = 'sample1-baseline-happy';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const CREDENTIAL_CLEANUP_TIMEOUT_MS = 15_000;
const FORCE_EXIT_TIMEOUT_MS = 5_000;
const BROWSER_CLOSE_TIMEOUT = new Error('J-04/browser-close-timeout');
const CREDENTIAL_CLEANUP_TIMEOUT = new Error('J-04/credential-cleanup-timeout');
let location = 'entry';
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-04', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-04/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-04', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-04' };
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

/** The product pins the resolved fixture as sha256 over its lineage lines, leaf first; recompute it from the tracked files. */
async function expectedFixtureDigest() {
  const line = async (identity) => `${identity}:${await digestFile(resolve(FIXTURES_ROOT, `${identity}.json`))}`;
  const lineage = [await line(FIXTURE_IDENTITY), await line(FIXTURE_BASE_IDENTITY)];
  return createHash('sha256').update(lineage.join('\n'), 'utf8').digest('hex');
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
    throw new Error('J-04/credential-cleanup-metadata');
  }
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && (await realpath(databasePath)) === databasePath,
    'credential-cleanup-metadata-file');
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
  } catch {
    throw new Error('J-04/credential-cleanup-metadata');
  }
  try {
    database.exec('PRAGMA query_only = ON;');
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 16, 'credential-cleanup-metadata-version');
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
    if (error instanceof Error && error.message.startsWith('J-04/')) throw error;
    throw new Error('J-04/credential-cleanup-metadata');
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
    server.once('error', () => rejectListen(new Error('J-04/loopback-listen')));
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
    if (response.error) completion.reject(new Error('J-04/renderer-cdp-response'));
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
          rejectResponse(new Error('J-04/renderer-cdp-timeout'));
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
    throw new Error('J-04/renderer-window');
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

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-04/${name}`);
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
  await fill(renderer, '#book-title', 'J-04 sample1 基线稿件分析', 'import-title');
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

function sameRange(unit, expected) {
  return unit.startPosition === expected[0] && unit.endPosition === expected[1] && unit.blockIds.length === expected[1] - expected[0] + 1;
}

/** Flat-record equality independent of key order; projections arrive with canonical (sorted) keys. */
function sameRecord(actual, expected) {
  if (actual === null || typeof actual !== 'object') return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every((key) => actual[key] === expected[key]);
}

function requireRevisionShape(revision, prepared, attempt, fixtureDigest, name) {
  const checkpoint = prepared.checkpoint;
  const manifest = prepared.coverageManifest;
  requireJourney(UUID_PATTERN.test(revision?.resultSetId) && UUID_PATTERN.test(revision?.revisionId) && revision?.ordinal === 1 &&
    DIGEST_PATTERN.test(revision?.digest) && revision?.contractVersion === 'ai7.baseline-manuscript-analysis/1' &&
    revision?.manuscriptPin?.revisionId === checkpoint.revisionId && revision?.manuscriptPin?.revisionDigest === checkpoint.revisionDigest &&
    revision?.manuscriptPin?.bookId === prepared.bookId && revision?.coverageManifestDigest === manifest.digest &&
    DIGEST_PATTERN.test(revision?.schemaDigest) && DIGEST_PATTERN.test(revision?.reducerDigest) &&
    revision?.adapterPin?.route === 'ai7-local-deterministic' && revision?.adapterPin?.model === 'ai7-deterministic-fixture' &&
    revision?.adapterPin?.fixtureIdentity === FIXTURE_IDENTITY && revision?.adapterPin?.fixtureSha256 === fixtureDigest &&
    revision?.bindingPin?.attemptId === attempt.attemptId && revision?.bindingPin?.bindingDigest === attempt.executionBinding.bindingDigest &&
    revision?.bindingPin?.harnessSessionId === attempt.executionBinding.harnessSessionId &&
    revision?.bindingPin?.promptContractDigest === PROMPT_CONTRACT_DIGEST &&
    sameRecord(revision?.policyPin, { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v3', liveTransmissions: 0 }) &&
    revision?.provenance?.taskIntentId === prepared.taskIntent.taskIntentId && revision?.provenance?.attemptId === attempt.attemptId &&
    revision?.usage?.requests === SAMPLE1_UNITS, `${name}-identity`, { fixtureDigest, revision: revision === null || revision === undefined ? revision : { ...revision, units: undefined, sections: undefined, synthesis: undefined } });
  requireJourney(revision.coverage?.axis === 'coverage' && revision.coverage?.state === 'partial' && revision.coverage?.unitsTotal === SAMPLE1_UNITS &&
    revision.coverage?.unitsClosed === SAMPLE1_UNITS - 1 && revision.coverage?.gapCount === 1 && typeof revision.coverage?.label === 'string' &&
    revision.reducerClosure?.axis === 'reducer-closure' && revision.reducerClosure?.state === 'closed-with-gaps' &&
    JSON.stringify(revision.reducerClosure?.stages?.map((stage) => stage.stage)) === JSON.stringify(['unit-validation', 'section-reduction', 'contradiction-continuity', 'book-synthesis']) &&
    revision.freshness?.axis === 'freshness' && revision.freshness?.boundRevisionId === checkpoint.revisionId &&
    revision.freshness?.boundRevisionDigest === checkpoint.revisionDigest && revision.freshness?.comparison === 'local-deterministic' &&
    revision.assurance?.axis === 'assurance' && revision.assurance?.state === 'qualified-with-open-conflicts' &&
    revision.assurance?.unresolvedConflictCount === revision.conflicts?.length && revision.assurance?.statement === ASSURANCE_STATEMENT &&
    !JSON.stringify(revision).includes('"complete":'), `${name}-axes`, { coverage: revision.coverage, reducerClosure: revision.reducerClosure, freshness: revision.freshness, assurance: revision.assurance });
  requireJourney(revision.gaps?.length === 1 && revision.gaps[0].unitOrdinal === 2 && revision.gaps[0].code === 'adapter-failure' &&
    revision.gaps[0].startPosition === SAMPLE1_UNIT_RANGES[1][0] && revision.gaps[0].endPosition === SAMPLE1_UNIT_RANGES[1][1] &&
    revision.gaps[0].blockIds.length === SAMPLE1_UNIT_RANGES[1][1] - SAMPLE1_UNIT_RANGES[1][0] + 1 &&
    JSON.stringify(revision.gaps[0].blockIds) === JSON.stringify(manifest.units[1].blockIds) &&
    JSON.stringify(revision.conflicts?.map((conflict) => conflict.kind)) === JSON.stringify(['unit-reported', 'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence']) &&
    revision.conflicts.every((conflict) => conflict.sourceRanges.every((range) => manifest.units.some((unit) => unit.blockIds.includes(range.blockId)))) &&
    JSON.stringify(revision.units?.map((unit) => unit.state)) === JSON.stringify(['closed', 'gap', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']) &&
    revision.units.every((unit, index) => unit.unitOrdinal === index + 1 && DIGEST_PATTERN.test(unit.requestDigest)) &&
    revision.sections?.length === 1 && JSON.stringify(revision.sections[0].gapUnitOrdinals) === JSON.stringify([2]) &&
    revision.synthesis?.entities?.some((entity) => entity.name === '合成之城'), `${name}-content`, { gaps: revision.gaps, conflictKinds: revision.conflicts?.map((conflict) => conflict.kind), unitStates: revision.units?.map((unit) => unit.state), sections: revision.sections?.map((section) => section.gapUnitOrdinals) });
}

/** The product's content-exact, position-independent unit key, recomputed here from the manifest alone. */
function unitContentKeys(manifest) {
  return manifest.units.map((unit, index) => {
    const previous = index === 0 ? null : manifest.units[index - 1];
    const overlapBlockDigests = unit.overlapBlockIds.map((blockId) => previous.blockDigests[previous.blockIds.indexOf(blockId)]);
    return createHash('sha256').update(JSON.stringify({ blockDigests: unit.blockDigests, overlapBlockDigests }), 'utf8').digest('hex');
  });
}

/**
 * The runner's own derivation of the reuse plan from the two manifests and the predecessor's unit
 * states: reused only when a closed predecessor unit shares the key and the mode does not bypass it;
 * 重新分析所选范围 bypasses the intersecting units plus their overlap dependants; 重新分析全书 bypasses all.
 */
function deriveExpectedPlan(previous, previousStates, next, mode, range) {
  const previousKeys = unitContentKeys(previous);
  const nextKeys = unitContentKeys(next);
  const closedByKey = new Map();
  previous.units.forEach((unit, index) => {
    if (previousStates[index] !== 'closed') return;
    closedByKey.set(previousKeys[index], [...(closedByKey.get(previousKeys[index]) ?? []), unit.ordinal]);
  });
  const intersecting = new Set(range === null ? [] : next.units.filter((unit) => unit.endPosition >= range.startPosition && unit.startPosition <= range.endPosition).map((unit) => unit.ordinal));
  const closure = new Set(intersecting);
  for (const unit of next.units) {
    if (unit.overlapBlockIds.length === 0) continue;
    if (next.units.some((candidate) => intersecting.has(candidate.ordinal) && unit.overlapBlockIds.every((id) => candidate.blockIds.includes(id)))) closure.add(unit.ordinal);
  }
  const consumed = new Map();
  const dispositions = next.units.map((unit, index) => {
    const candidate = (closedByKey.get(nextKeys[index]) ?? []).find((ordinal) => !consumed.has(ordinal)) ?? null;
    const bypassed = mode === 'reanalyze-book' || (mode === 'reanalyze-range' && closure.has(unit.ordinal));
    if (candidate !== null) consumed.set(candidate, bypassed ? 'bypassed' : 'reused');
    return candidate !== null && !bypassed ? 'reused' : 'recomputed';
  });
  return {
    counts: {
      reused: dispositions.filter((item) => item === 'reused').length,
      recomputed: dispositions.filter((item) => item === 'recomputed').length,
      invalidated: previous.units.length - consumed.size,
      bypassed: Array.from(consumed.values()).filter((item) => item === 'bypassed').length,
    },
    dispositions,
    recomputed: next.units.filter((_unit, index) => dispositions[index] === 'recomputed').map((unit) => unit.ordinal),
    closure: Array.from(closure).sort((left, right) => left - right),
  };
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

/** Records read back from canonical JSON carry sorted keys, so a range compares by fields, never by text. */
function sameNullableRecord(actual, expected) {
  return actual === null || expected === null ? actual === expected : sameRecord(actual, expected);
}

/** A successor revision: the same Result Set, the next ordinal, the exact update facts and per-unit lineage, usage for recomputed units only. */
function requireSuccessorShape(revision, expected, attempt, fixtureDigest, name) {
  const unitLineageExact = (unit, index) => unit.unitOrdinal === index + 1 && unit.lineage?.kind === expected.lineage[index] &&
    (unit.lineage.kind === 'recomputed' || (unit.lineage.revisionId === expected.predecessor.revisionId &&
      unit.lineage.revisionOrdinal === expected.predecessor.ordinal && unit.lineage.unitOrdinal === index + 1));
  requireJourney(UUID_PATTERN.test(revision?.revisionId) && revision?.resultSetId === expected.resultSetId && revision?.ordinal === expected.ordinal &&
    DIGEST_PATTERN.test(revision?.digest) && revision?.contractVersion === 'ai7.baseline-manuscript-analysis/1' &&
    revision?.manuscriptPin?.revisionId === expected.boundRevisionId && revision?.coverageManifestDigest === expected.manifestDigest &&
    revision?.adapterPin?.fixtureIdentity === FIXTURE_IDENTITY && revision?.adapterPin?.fixtureSha256 === fixtureDigest &&
    revision?.bindingPin?.attemptId === attempt.attemptId && revision?.bindingPin?.bindingDigest === attempt.executionBinding.bindingDigest &&
    revision?.bindingPin?.promptContractDigest === PROMPT_CONTRACT_DIGEST &&
    sameRecord(revision?.policyPin, { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v3', liveTransmissions: 0 }) &&
    revision?.update?.mode === expected.mode && revision?.update?.modeLabel === expected.modeLabel &&
    sameRecord(revision?.update?.predecessor, expected.predecessor) && revision?.update?.reusePlanDigest === expected.reusePlanDigest &&
    sameRecord(revision?.update?.counts, expected.counts) && sameNullableRecord(revision?.update?.selectedRange ?? null, expected.selectedRange) &&
    JSON.stringify(revision?.lineage?.map((entry) => entry.kind)) === JSON.stringify(expected.lineage) &&
    revision?.units?.length === SAMPLE1_UNITS && revision.units.every(unitLineageExact) &&
    revision?.usage?.requests === expected.counts.recomputed &&
    revision?.coverage?.unitsTotal === SAMPLE1_UNITS && revision?.coverage?.unitsClosed === SAMPLE1_UNITS - 1 &&
    revision?.coverage?.unitsReused === expected.counts.reused && revision?.coverage?.gapCount === 1 &&
    revision?.freshness?.state === expected.freshness && revision?.freshness?.boundRevisionId === expected.boundRevisionId &&
    revision?.assurance?.state === 'qualified-with-open-conflicts' && revision?.gaps?.length === 1 && revision.gaps[0].unitOrdinal === 2 &&
    JSON.stringify(revision?.conflicts?.map((conflict) => conflict.kind)) === JSON.stringify(['unit-reported', 'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence']) &&
    JSON.stringify(revision?.units?.map((unit) => unit.state)) === JSON.stringify(['closed', 'gap', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']),
  `${name}-successor`, { expected, revision: revision === null || revision === undefined ? revision : { ...revision, units: undefined, sections: undefined, synthesis: undefined } });
}

async function settleAuthorizedRun(renderer, name) {
  await click(renderer, '授权并派发运行', `${name}-authorize-click`);
  await waitFor(renderer, `['settled','failed','interrupted'].includes(document.querySelector('.baseline-analysis-card')?.dataset.analysisState)`, `${name}-settled`, 180_000);
  await assertRenderer(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, `${name}-settled-state`);
  return renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
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
      throw new Error('J-04/browser-close-unconfirmed');
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
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-04/browser-cleanup-failed');
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        credentialCleanupFailure ??= error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        const closedForRetry = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-04/browser-cleanup-failed');
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
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-04/browser-cleanup-failed');
        const closedForFallback = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? new Error('J-04/browser-cleanup-failed');
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
    if (browserCloseRejected) throw cleanupFailure ?? new Error('J-04/browser-cleanup-failed');
    const browserClosed = await closeOwnedBrowserForCleanup();
    if (!browserClosed) throw cleanupFailure ?? new Error('J-04/browser-cleanup-failed');
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    try { await ownedLoopback?.close(); } catch (error) { cleanupFailure ??= error; }
    loopback = undefined;
    if (credentialMutationReached && !credentialRemoved) {
      throw credentialCleanupFailure ?? new Error('J-04/credential-cleanup-failed');
    }
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        try { await assertSecretsAbsentFromDataRoot(dataRoot, [syntheticSecret]); } catch (error) { cleanupFailure ??= error; }
      }
      try {
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j04-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j04-e2e-'));
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
      '--j04-picker-path', SAMPLE1_PATH, '--j04-model-adapter', FIXTURE_IDENTITY,
    ];
    requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
    launchForCleanup = async (forCleanup = false) => {
      if (!forCleanup) cancellation.throwIfRequested();
      const acquisition = chromium.launch({
        executablePath: executable,
        headless: false,
        ignoreDefaultArgs: true,
        args,
        env: productEnvironment(executable),
        timeout: 60_000,
      });
      browserAcquisition = acquisition;
      const acquiredBrowser = await acquisition;
      attachProductOutput('J-04', acquiredBrowser, forCleanup ? 'cleanup' : 'launch');
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
    const fixtureDigest = await expectedFixtureDigest();
    await launchForCleanup();
    cancellation.throwIfRequested();

    at('renderer-ready');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'ready');
    at('renderer-api-boundary');
    await assertRenderer(renderer, `typeof globalThis.process==='undefined' && typeof globalThis.require==='undefined'`, 'renderer-isolation');
    at('renderer-analysis-api');
    await assertRenderer(renderer, `typeof window.ai7.inspectBaselineAnalysis==='function' &&
      typeof window.ai7.prepareBaselineAnalysis==='function' &&
      typeof window.ai7.authorizeBaselineAnalysis==='function'`, 'renderer-analysis-api');
    at('renderer-zero-execution-api');
    await assertRenderer(renderer, `!Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key))`, 'renderer-zero-execution-api');

    at('sample1-import');
    cancellation.throwIfRequested();
    const imported = await importSample1(renderer, cancellation);
    cancellation.throwIfRequested();

    at('analysis-prerequisites-unavailable');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card[data-analysis-state="unavailable"]')`, 'analysis-unavailable-before-prerequisites');
    await assertRenderer(renderer, `!document.querySelector('[data-analysis-action]') && !Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='开始基线稿件分析')`, 'analysis-no-premature-prepare');

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
    await fill(renderer, '#main-editorial-connection-name', 'J-04 主编辑连接', 'model-name');
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

    at('book-reopen');
    cancellation.throwIfRequested();
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'book-reopen');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'book-reopened');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card[data-analysis-state="available"]')`, 'analysis-available');
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const goal=card?.querySelector('#j04-analysis-goal'); const start=card?.querySelector('[data-analysis-action="prepare"]'); return goal instanceof HTMLInputElement && goal.readOnly && goal.value===${JSON.stringify(TASK_GOAL)} && start instanceof HTMLButtonElement && !start.disabled && start.textContent==='开始基线稿件分析' && !card.querySelector('[data-analysis-action="authorize"]'); })()`, 'analysis-available-surface');

    at('j14-reflow-forced-colors');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(renderer, `document.documentElement.scrollWidth<=document.documentElement.clientWidth+2 && getComputedStyle(document.querySelector('.baseline-analysis-card')).overflowX!=='scroll'`, 'zoom-reflow');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.baseline-analysis-card')).boxShadow==='none' && getComputedStyle(document.querySelector('.baseline-analysis-card .analysis-state')).borderStyle!=='none'`, 'forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('coverage-manifest');
    cancellation.throwIfRequested();
    await click(renderer, '开始基线稿件分析', 'prepare-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, 'prepared', 120_000);
    cancellation.throwIfRequested();
    const prepared = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const manifest = prepared?.coverageManifest;
    requireJourney(prepared?.state === 'prepared' && prepared.bookId === imported.bookId && prepared.kind === 'baseline-manuscript-analysis' &&
      prepared.contractVersion === 'ai7.baseline-manuscript-analysis/1' && UUID_PATTERN.test(prepared.taskIntent?.taskIntentId) &&
      prepared.taskIntent?.goal === TASK_GOAL && prepared.checkpoint?.revisionId === imported.revisionId &&
      prepared.checkpoint?.revisionLabel === 'r1' && prepared.checkpoint?.createdForDirtyJournal === false && prepared.checkpoint?.journalSequence === 0 &&
      prepared.checkpoint?.purpose === 'Task Input / 任务输入' && DIGEST_PATTERN.test(prepared.checkpoint?.revisionDigest) &&
      prepared.manuscriptPin?.revisionId === prepared.checkpoint.revisionId && prepared.manuscriptPin?.sourceVersionId === imported.sourceVersionId &&
      prepared.manuscriptPin?.sourceDigest === SAMPLE1_SHA256 && prepared.artifactPin?.nativeCarrierSha256 === NATIVE_CARRIER_DIGEST &&
      prepared.artifactPin?.sidecarRevision === 2 && prepared.artifactPin?.sidecarSha256 === SIDECAR_REVISION_2_DIGEST &&
      prepared.runSourceScope?.bookId === imported.bookId && prepared.runSourceScope?.taskInputRevision?.revisionId === prepared.checkpoint.revisionId,
    'prepared-exact-pins', prepared);
    requireJourney(manifest?.schema === 'ai7.coverage-manifest/1' && manifest.manuscript?.revisionId === prepared.checkpoint.revisionId &&
      manifest.manuscript?.revisionDigest === prepared.checkpoint.revisionDigest && manifest.parameters?.unitBudgetGraphemes === 1200 &&
      manifest.parameters?.overlapBlocks === 1 && manifest.totalBlocks === SAMPLE1_BLOCKS && manifest.sectionCount === 1 &&
      manifest.units?.length === SAMPLE1_UNITS && DIGEST_PATTERN.test(manifest.digest) &&
      manifest.units.every((unit, index) => unit.ordinal === index + 1 && sameRange(unit, SAMPLE1_UNIT_RANGES[index]) &&
        unit.graphemes <= manifest.parameters.unitBudgetGraphemes && DIGEST_PATTERN.test(unit.digest) &&
        unit.overlapBlockIds.length === (index === 0 ? 0 : 1) &&
        (index === 0 || unit.overlapBlockIds[0] === manifest.units[index - 1].blockIds.at(-1))) &&
      new Set(manifest.units.flatMap((unit) => unit.blockIds)).size === SAMPLE1_BLOCKS,
    'coverage-manifest-exact', manifest);
    const plan = prepared.providerResolutionPlan;
    requireJourney(plan?.role === 'Main Editorial Role' && plan.capabilities?.length === 0 &&
      plan.remoteBinding?.providerId === 'deepseek-open-platform' && plan.remoteBinding?.modelId === 'deepseek-v4-pro' &&
      plan.remoteBinding?.adapterRevision === 1 && plan.remoteBinding?.configurationRevision === 1 && plan.remoteBinding?.approvedFallbackChain?.length === 0 &&
      plan.remoteBinding?.credentialSlot === 'deepseek-api-key' && plan.remoteBinding?.credentialReference === readyConnection.credentialReference &&
      plan.remoteBinding?.credentialReadiness === 'missing' &&
      sameRecord(plan.remoteBinding?.providerProcessing, { operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 }) &&
      plan.executionRoute?.kind === 'ai7-local-deterministic' && plan.executionRoute?.model === 'ai7-deterministic-fixture' &&
      plan.executionRoute?.fixtureIdentity === FIXTURE_IDENTITY && plan.executionRoute?.fixtureSha256 === fixtureDigest &&
      JSON.stringify(plan.executionRoute?.fixtureLineage?.map((link) => link.identity)) === JSON.stringify([FIXTURE_IDENTITY, FIXTURE_BASE_IDENTITY]) &&
      plan.outboundDataCategory === 'public-or-synthetic' && plan.runBudgetCeiling === 'unset' &&
      prepared.executionPlan?.effects?.length === 0 && prepared.executionPlan?.unitCount === SAMPLE1_UNITS &&
      prepared.planEnvelope?.dispatchAllowed === true && prepared.planEnvelope?.providerStatus === 'remote-denied-local-deterministic' &&
      DIGEST_PATTERN.test(prepared.planEnvelope?.digest) && prepared.planEnvelope?.promptContractDigest === PROMPT_CONTRACT_DIGEST &&
      DIGEST_PATTERN.test(prepared.planEnvelope?.behaviorCompositionDigest) &&
      prepared.authorization === null && prepared.run === null && prepared.resultSetRevision === null && prepared.taskOutcome === null &&
      prepared.actions?.canPrepare === false && prepared.actions?.canAuthorize === true,
    'prepared-exact-envelope', { fixtureDigest, plan, executionPlan: prepared.executionPlan, planEnvelope: prepared.planEnvelope, actions: prepared.actions });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const authorize=card?.querySelector('[data-analysis-action="authorize"]'); return card?.dataset.coverageManifestDigest===${JSON.stringify(manifest.digest)} && card.dataset.analysisUnits===${JSON.stringify(String(SAMPLE1_UNITS))} && card.dataset.planEnvelopeDigest===${JSON.stringify(prepared.planEnvelope.digest)} && card.querySelectorAll('[data-manifest-unit]').length===${SAMPLE1_UNITS} && card.textContent.includes(${JSON.stringify(manifest.digest)}) && card.textContent.includes(${JSON.stringify(FIXTURE_IDENTITY)}) && card.textContent.includes('0 次实时传输') && authorize instanceof HTMLButtonElement && !authorize.disabled && authorize.textContent==='授权并派发运行' && !card.querySelector('[data-analysis-action="prepare"]'); })()`, 'prepared-preview');

    at('authorize-dispatch');
    cancellation.throwIfRequested();
    await click(renderer, '授权并派发运行', 'authorize-click');
    await waitFor(renderer, `['settled','failed','interrupted'].includes(document.querySelector('.baseline-analysis-card')?.dataset.analysisState)`, 'run-settled', 180_000);
    await assertRenderer(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'run-settled-state');
    cancellation.throwIfRequested();

    at('result-set-revision');
    const settled = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(settled?.state === 'settled' && settled.stateLabel === '已形成结果集修订版' && settled.taskIntent?.taskIntentId === prepared.taskIntent.taskIntentId &&
      settled.checkpoint?.revisionId === prepared.checkpoint.revisionId && settled.planEnvelope?.digest === prepared.planEnvelope.digest &&
      UUID_PATTERN.test(settled.authorization?.authorizationId) && settled.authorization?.origin === 'standard-direct' &&
      settled.authorization?.authority === 'standard-direct-dispatch' && settled.authorization?.planEnvelopeDigest === prepared.planEnvelope.digest &&
      UUID_PATTERN.test(settled.run?.runRecordId) && settled.run?.state === 'completed-with-gaps' && settled.run?.stateLabel === '已完成 · 保留缺口' &&
      JSON.stringify(settled.run?.transitions?.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'completed-with-gaps']) &&
      settled.run?.blockedReasons === null && settled.actions?.canPrepare === false && settled.actions?.canAuthorize === false,
    'settled-run-record', { state: settled?.state, stateLabel: settled?.stateLabel, authorization: settled?.authorization, run: settled?.run, actions: settled?.actions });
    const attempt = settled.run.attempt;
    requireJourney(UUID_PATTERN.test(attempt?.attemptId) &&
      sameRecord(attempt?.credentialReadinessCheck, { slot: 'deepseek-api-key', readiness: 'missing', valueReleased: false }) &&
      attempt?.executionBinding?.attemptId === attempt.attemptId && DIGEST_PATTERN.test(attempt.executionBinding?.bindingDigest) &&
      UUID_PATTERN.test(attempt.executionBinding?.harnessSessionId) && attempt.executionBinding?.route === 'ai7-local-deterministic' &&
      attempt.executionBinding?.model === 'ai7-deterministic-fixture' && attempt.executionBinding?.fixtureIdentity === FIXTURE_IDENTITY &&
      attempt.executionBinding?.fixtureSha256 === fixtureDigest && attempt.executionBinding?.promptContractDigest === PROMPT_CONTRACT_DIGEST &&
      attempt.executionBinding?.planEnvelopeDigest === prepared.planEnvelope.digest && attempt.executionBinding?.coverageManifestDigest === manifest.digest &&
      attempt.executionBinding?.behaviorCompositionDigest === prepared.planEnvelope.behaviorCompositionDigest &&
      attempt.executionBinding?.nativeCarrierSha256 === NATIVE_CARRIER_DIGEST && attempt.executionBinding?.sidecarRevision === 2 &&
      attempt.spans?.length === SAMPLE1_UNITS &&
      JSON.stringify(attempt.spans.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]) &&
      attempt.spans.every((span) => span.harnessSessionId === attempt.executionBinding.harnessSessionId && span.endSeq > span.startSeq),
    'settled-execution-binding', { fixtureDigest, attempt });
    const revision = settled.resultSetRevision;
    requireRevisionShape(revision, prepared, attempt, fixtureDigest, 'revision');
    requireJourney(revision.freshness.state === 'current' && revision.freshness.currentRevisionId === prepared.checkpoint.revisionId &&
      revision.freshness.currentJournalSequence === 0 && revision.provenance.runRecordId === settled.run.runRecordId, 'revision-current');
    requireJourney(UUID_PATTERN.test(settled.taskOutcome?.outcomeId) && settled.taskOutcome?.classification === 'completed-with-gaps' &&
      settled.taskOutcome?.label === '任务结果：已完成（保留缺口）' && settled.taskOutcome?.resultSetRevisionId === revision.revisionId &&
      typeof settled.taskOutcome?.safeNextAction === 'string' && settled.taskOutcome.safeNextAction.length > 0, 'settled-task-outcome', settled.taskOutcome);
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      if(!card) return false;
      const axis=(name)=>card.querySelector('[data-analysis-axis='+JSON.stringify(name)+']')?.dataset.axisState;
      const buttons=Array.from(card.querySelectorAll('button'));
      return card.dataset.runState==='completed-with-gaps' && card.dataset.resultRevisionId===${JSON.stringify(revision.revisionId)} &&
        card.dataset.resultRevisionDigest===${JSON.stringify(revision.digest)} && card.dataset.taskOutcomeId===${JSON.stringify(settled.taskOutcome.outcomeId)} &&
        card.dataset.freshnessState==='current' && card.dataset.gapCount==='1' && card.dataset.conflictCount==='4' &&
        card.querySelectorAll('[data-analysis-axis]').length===4 && axis('coverage')==='partial' && axis('reducer-closure')==='closed-with-gaps' &&
        axis('freshness')==='current' && axis('assurance')==='qualified-with-open-conflicts' &&
        card.querySelectorAll('[data-analysis-gap-unit]').length===1 && card.querySelector('[data-analysis-gap-unit="2"][data-analysis-gap-code="adapter-failure"]')!==null &&
        card.querySelectorAll('[data-analysis-conflict-kind]').length===4 && card.querySelector('[data-analysis-conflict-kind="alias-collision"]')!==null &&
        card.querySelectorAll('[data-analysis-unit]').length===${SAMPLE1_UNITS} && card.querySelector('[data-analysis-unit="2"][data-analysis-unit-state="gap"]')!==null &&
        card.querySelectorAll('[data-analysis-unit][data-analysis-unit-state="closed"]').length===${SAMPLE1_UNITS - 1} &&
        card.textContent.includes(${JSON.stringify(ASSURANCE_STATEMENT)}) && card.textContent.includes(${JSON.stringify(revision.revisionId)}) &&
        card.textContent.includes(${JSON.stringify(revision.digest)}) && card.textContent.includes('任务结果：已完成（保留缺口）') &&
        buttons.length>0 && buttons.some((button)=>button.dataset.analysisAction==='return-to-range') && ${ONLY_ANALYSIS_ACTIONS} &&
        card.querySelector('[data-update-action="sync-current"][data-update-available="false"]')!==null &&
        card.querySelector('[data-update-action="reanalyze-book"][data-update-available="true"]')!==null &&
        card.querySelector('.analysis-history')?.dataset.historyCount==='1' &&
        !card.querySelector('[data-analysis-action="prepare"], [data-analysis-action="authorize"]');
    })()`, 'settled-overview-surface');

    at('return-to-range');
    cancellation.throwIfRequested();
    const gapBlockId = revision.gaps[0].blockIds[0];
    await assertRenderer(renderer, `(() => { const button=document.querySelector('[data-analysis-gap-unit="2"] [data-analysis-action="return-to-range"]'); if(!(button instanceof HTMLButtonElement)||button.disabled||button.dataset.analysisBlockId!==${JSON.stringify(gapBlockId)})return false; button.click(); return true; })()`, 'return-to-range-click');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] [data-block-id=${JSON.stringify(gapBlockId)}]')`, 'return-to-range-editor', 120_000);
    cancellation.throwIfRequested();
    await click(renderer, '返回图书工作概览', 'return-to-range-back');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]') && document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'return-to-range-overview');
    const afterReturn = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(afterReturn) === JSON.stringify(settled), 'return-to-range-read-only');

    at('restart-immutable');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'restart-open-book');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'restart-record-visible');
    const restarted = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(restarted) === JSON.stringify(settled), 'restart-record-immutable');
    cancellation.throwIfRequested();

    at('acknowledged-edit-stale');
    await saveEditorSuffix(renderer, '，J-04 结果集形成后的确认编辑', 1, cancellation);
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled' && document.querySelector('.baseline-analysis-card')?.dataset.freshnessState==='stale'`, 'stale-after-edit');
    const stale = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const staleRevision = stale?.resultSetRevision;
    requireRevisionShape(staleRevision, prepared, attempt, fixtureDigest, 'stale-revision');
    requireJourney(stale.checkpoint?.revisionId === settled.checkpoint.revisionId && stale.checkpoint?.revisionDigest === settled.checkpoint.revisionDigest &&
      stale.run?.runRecordId === settled.run.runRecordId && stale.taskOutcome?.outcomeId === settled.taskOutcome.outcomeId &&
      staleRevision.revisionId === revision.revisionId && staleRevision.digest === revision.digest &&
      staleRevision.freshness.state === 'stale' && staleRevision.freshness.boundRevisionId === revision.freshness.boundRevisionId &&
      staleRevision.freshness.boundRevisionDigest === revision.freshness.boundRevisionDigest &&
      staleRevision.freshness.currentJournalSequence === 1 && staleRevision.freshness.currentWorkingDigest !== revision.freshness.currentWorkingDigest &&
      JSON.stringify(staleRevision.coverage) === JSON.stringify(revision.coverage) &&
      JSON.stringify(staleRevision.reducerClosure) === JSON.stringify(revision.reducerClosure) &&
      JSON.stringify(staleRevision.assurance) === JSON.stringify(revision.assurance) &&
      JSON.stringify(staleRevision.gaps) === JSON.stringify(revision.gaps) && JSON.stringify(staleRevision.conflicts) === JSON.stringify(revision.conflicts) &&
      stale.actions?.canPrepare === false && stale.actions?.canAuthorize === false,
    'stale-independent-axis', { checkpoint: stale?.checkpoint, freshness: staleRevision?.freshness, previousFreshness: revision.freshness, actions: stale?.actions });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const axis=(name)=>card?.querySelector('[data-analysis-axis='+JSON.stringify(name)+']')?.dataset.axisState; return axis('freshness')==='stale' && axis('coverage')==='partial' && axis('reducer-closure')==='closed-with-gaps' && axis('assurance')==='qualified-with-open-conflicts' && card.dataset.resultRevisionId===${JSON.stringify(revision.revisionId)}; })()`, 'stale-overview-surface');

    at('update-controls-disclosed');
    cancellation.throwIfRequested();
    const controlsStale = stale.updateControls;
    requireJourney(controlsStale?.target?.revisionId === revision.revisionId && controlsStale.target.ordinal === 1 && controlsStale.target.digest === revision.digest &&
      controlsStale.target.freshness === 'stale' && controlsStale.blockedByActiveRun === false &&
      controlsStale.working?.totalBlocks === SAMPLE1_BLOCKS && controlsStale.working?.unitCount === SAMPLE1_UNITS && controlsStale.working?.sectionCount === 1 &&
      controlsStale.working?.journalSequence === 1 && controlsStale.working?.branchId === settled.checkpoint.branchId &&
      controlsStale.working?.workingDigest === staleRevision.freshness.currentWorkingDigest &&
      controlsStale.actions?.['sync-current']?.available === true && controlsStale.actions['sync-current'].unavailableReason === null &&
      controlsStale.actions['sync-current'].goal === SYNC_GOAL && controlsStale.actions['sync-current'].label === '同步到当前稿件' &&
      sameRecord(controlsStale.actions['sync-current'].expected, { reused: 6, recomputed: 2, invalidated: 2, bypassed: 0 }) &&
      controlsStale.actions['reanalyze-range']?.available === true && controlsStale.actions['reanalyze-range'].expected === null &&
      controlsStale.actions['reanalyze-range'].goal === RANGE_GOAL && controlsStale.actions['reanalyze-range'].options?.length === SAMPLE1_UNITS &&
      controlsStale.actions['reanalyze-range'].options.every((option, index) => option.unitOrdinal === index + 1 &&
        option.startPosition === SAMPLE1_UNIT_RANGES[index][0] && option.endPosition === SAMPLE1_UNIT_RANGES[index][1] && option.sectionOrdinal === 1 &&
        typeof option.label === 'string' && option.expected.recomputed >= 2) &&
      // Against revision 1 the edited unit 1 and the gap unit 2 recompute in every mode; a range over unit 3 adds units 3 and 4.
      sameRecord(controlsStale.actions['reanalyze-range'].options[2].expected, { reused: 4, recomputed: 4, invalidated: 2, bypassed: 2 }) &&
      controlsStale.actions['reanalyze-book']?.available === true && controlsStale.actions['reanalyze-book'].goal === BOOK_GOAL &&
      sameRecord(controlsStale.actions['reanalyze-book'].expected, { reused: 0, recomputed: 8, invalidated: 2, bypassed: 6 }) &&
      controlsStale.providerConsequence.includes('0 次实时传输') && controlsStale.providerConsequence.includes('public-or-synthetic') &&
      controlsStale.successorBehavior.includes('后继修订版'),
    'update-controls-projection', controlsStale);
    await assertRenderer(renderer, `(() => {
      const section=document.querySelector('.baseline-analysis-card .analysis-update-controls');
      if(!section) return false;
      const action=(mode)=>section.querySelector('[data-update-action='+JSON.stringify(mode)+']');
      const sync=action('sync-current'), range=action('reanalyze-range'), whole=action('reanalyze-book');
      const radios=Array.from(section.querySelectorAll('input[name="analysis-range"]'));
      return section.dataset.updateTargetOrdinal==='1' && section.dataset.updateTargetRevisionId===${JSON.stringify(revision.revisionId)} &&
        section.dataset.updateTargetFreshness==='stale' && section.dataset.updateBlocked==='false' && section.dataset.workingUnits==='8' && section.dataset.workingBlocks==='97' &&
        sync?.dataset.updateAvailable==='true' && sync.dataset.expectedReused==='6' && sync.dataset.expectedRecomputed==='2' && sync.dataset.expectedInvalidated==='2' && sync.dataset.expectedBypassed==='0' &&
        sync.querySelector('[data-analysis-action="sync-current"]') instanceof HTMLButtonElement && !sync.querySelector('[data-analysis-action="sync-current"]').disabled &&
        range?.dataset.updateAvailable==='true' && radios.length===8 && radios.every((radio)=>!radio.checked && !radio.disabled) && !range.dataset.selectedRange &&
        range.querySelector('[data-analysis-action="reanalyze-range"]')?.disabled===true && range.querySelectorAll('.analysis-range-option label').length===8 &&
        whole?.dataset.updateAvailable==='true' && whole.dataset.expectedReused==='0' && whole.dataset.expectedRecomputed==='8' && whole.dataset.expectedInvalidated==='2' && whole.dataset.expectedBypassed==='6' &&
        !whole.querySelector('[data-analysis-action="reanalyze-book"]').disabled &&
        section.textContent.includes('0 次实时传输') && section.textContent.includes('public-or-synthetic') && section.textContent.includes(${JSON.stringify(revision.revisionId)}) &&
        section.textContent.includes(${JSON.stringify(SYNC_GOAL)}) && section.textContent.includes(${JSON.stringify(RANGE_GOAL)}) && section.textContent.includes(${JSON.stringify(BOOK_GOAL)}) &&
        section.textContent.includes('后继修订版') && !document.querySelector('[data-analysis-action="prepare"], [data-analysis-action="authorize"]');
    })()`, 'update-controls-surface');

    at('sync-current-prepare');
    cancellation.throwIfRequested();
    await click(renderer, '同步到当前稿件', 'sync-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, 'sync-prepared', 120_000);
    const preparedSync = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const syncManifest = preparedSync?.coverageManifest;
    const syncExpected = deriveExpectedPlan(manifest, revision.units.map((unit) => unit.state), syncManifest, 'sync-current', null);
    const syncPlan = preparedSync?.update?.reusePlan;
    requireJourney(preparedSync?.state === 'prepared' && preparedSync.taskIntent?.mode === 'sync-current' && preparedSync.taskIntent?.goal === SYNC_GOAL &&
      preparedSync.taskIntent?.taskIntentId !== prepared.taskIntent.taskIntentId && preparedSync.checkpoint?.revisionId !== prepared.checkpoint.revisionId &&
      syncManifest?.totalBlocks === SAMPLE1_BLOCKS && syncManifest.units?.length === SAMPLE1_UNITS && syncManifest.manuscript?.revisionId === preparedSync.checkpoint.revisionId &&
      syncManifest.digest !== manifest.digest && syncManifest.units[0].digest !== manifest.units[0].digest &&
      syncManifest.units.slice(1).every((unit, index) => unit.digest === manifest.units[index + 1].digest && sameRange(unit, SAMPLE1_UNIT_RANGES[index + 1])) &&
      sameRecord(syncExpected.counts, { reused: 6, recomputed: 2, invalidated: 2, bypassed: 0 }) &&
      preparedSync.update?.mode === 'sync-current' && preparedSync.update.modeLabel === '同步到当前稿件' && preparedSync.update.predecessorCurrent === true && preparedSync.update.selectedRange === null &&
      preparedSync.update.predecessor?.revisionId === revision.revisionId && preparedSync.update.predecessor.ordinal === 1 && preparedSync.update.predecessor.digest === revision.digest &&
      preparedSync.update.predecessor.manuscriptPin?.revisionId === revision.manuscriptPin.revisionId &&
      DIGEST_PATTERN.test(preparedSync.update.reusePlanDigest) && syncPlan?.schema === REUSE_PLAN_SCHEMA && syncPlan.mode === 'sync-current' &&
      syncPlan.coverageManifestDigest === syncManifest.digest && syncPlan.predecessor?.revisionId === revision.revisionId && syncPlan.predecessor.coverageManifestDigest === manifest.digest &&
      sameRecord(syncPlan.counts, syncExpected.counts) && sameRecord(syncPlan.counts, controlsStale.actions['sync-current'].expected) &&
      JSON.stringify(syncPlan.units.map((unit) => unit.disposition)) === JSON.stringify(syncExpected.dispositions) &&
      syncPlan.units[0].reason === 'no-compatible-predecessor' && syncPlan.units[1].reason === 'predecessor-gap' &&
      syncPlan.units.slice(2).every((unit, index) => unit.reason === 'compatible' && unit.reusedFrom?.revisionId === revision.revisionId && unit.reusedFrom?.revisionOrdinal === 1 && unit.reusedFrom?.unitOrdinal === index + 3) &&
      JSON.stringify(syncPlan.predecessorUnits.map((unit) => unit.disposition)) === JSON.stringify(['invalidated', 'invalidated', 'reused', 'reused', 'reused', 'reused', 'reused', 'reused']) &&
      JSON.stringify(preparedSync.runSourceScope?.unitScope?.recomputedUnitOrdinals) === JSON.stringify(syncExpected.recomputed) &&
      JSON.stringify(preparedSync.runSourceScope?.unitScope?.reusedUnitOrdinals) === JSON.stringify([3, 4, 5, 6, 7, 8]) &&
      preparedSync.executionPlan?.unitCount === SAMPLE1_UNITS && preparedSync.executionPlan?.recomputedUnitCount === syncExpected.counts.recomputed &&
      preparedSync.executionPlan?.reusedUnitCount === syncExpected.counts.reused &&
      preparedSync.planEnvelope?.digest !== prepared.planEnvelope.digest && preparedSync.planEnvelope?.dispatchAllowed === true &&
      preparedSync.planEnvelope?.promptContractDigest === PROMPT_CONTRACT_DIGEST && preparedSync.planEnvelope?.behaviorCompositionDigest === prepared.planEnvelope.behaviorCompositionDigest &&
      preparedSync.providerResolutionPlan?.executionRoute?.fixtureIdentity === FIXTURE_IDENTITY && preparedSync.providerResolutionPlan?.executionRoute?.fixtureSha256 === fixtureDigest &&
      preparedSync.providerResolutionPlan?.remoteBinding?.providerProcessing?.decision === 'deny' &&
      preparedSync.resultSetRevision?.revisionId === revision.revisionId && preparedSync.authorization === null && preparedSync.run === null && preparedSync.taskOutcome === null &&
      preparedSync.actions?.canPrepare === false && preparedSync.actions?.canAuthorize === true,
    'sync-prepared-plan', { syncExpected, update: preparedSync?.update, unitScope: preparedSync?.runSourceScope?.unitScope, executionPlan: preparedSync?.executionPlan, actions: preparedSync?.actions });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.planUpdateMode==='sync-current' && card.dataset.planReused==='6' && card.dataset.planRecomputed==='2' && card.dataset.planInvalidated==='2' && card.dataset.planBypassed==='0' && card.dataset.reusePlanDigest===${JSON.stringify(preparedSync.update.reusePlanDigest)} && card.dataset.planEnvelopeDigest===${JSON.stringify(preparedSync.planEnvelope.digest)} && card.dataset.coverageManifestDigest===${JSON.stringify(syncManifest.digest)} && card.querySelectorAll('[data-reuse-plan-unit]').length===8 && card.querySelector('[data-reuse-plan-unit="1"][data-reuse-disposition="recomputed"][data-reuse-reason="no-compatible-predecessor"]')!==null && card.querySelector('[data-reuse-plan-unit="2"][data-reuse-disposition="recomputed"][data-reuse-reason="predecessor-gap"]')!==null && card.querySelector('[data-reuse-plan-unit="3"][data-reuse-disposition="reused"][data-reuse-reason="compatible"]')!==null && card.querySelectorAll('[data-reuse-predecessor-disposition="invalidated"]').length===2 && card.querySelectorAll('[data-reuse-predecessor-disposition="reused"]').length===6 && card.textContent.includes(${JSON.stringify(SYNC_GOAL)}) && card.textContent.includes('Revision 1') && card.querySelector('[data-analysis-action="authorize"]') instanceof HTMLButtonElement && !card.querySelector('[data-analysis-action="authorize"]').disabled && !card.querySelector('[data-analysis-action="prepare"]'); })()`, 'sync-plan-preview');

    at('sync-current-dispatch');
    cancellation.throwIfRequested();
    const settledSync = await settleAuthorizedRun(renderer, 'sync');

    at('sync-current-revision');
    const revision2 = settledSync?.resultSetRevision;
    const attemptSync = settledSync?.run?.attempt;
    requireJourney(settledSync?.state === 'settled' && settledSync.taskIntent?.taskIntentId === preparedSync.taskIntent.taskIntentId &&
      settledSync.run?.state === 'completed-with-gaps' && settledSync.run.runRecordId !== settled.run.runRecordId &&
      JSON.stringify(settledSync.run.transitions?.map((transition) => transition.state)) === JSON.stringify(['authorized', 'admitted', 'executing', 'completed-with-gaps']) &&
      JSON.stringify(attemptSync?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify(syncExpected.recomputed) &&
      attemptSync.executionBinding?.planEnvelopeDigest === preparedSync.planEnvelope.digest && attemptSync.executionBinding?.coverageManifestDigest === syncManifest.digest &&
      attemptSync.executionBinding?.harnessSessionId !== attempt.executionBinding.harnessSessionId &&
      settledSync.taskOutcome?.resultSetRevisionId === revision2?.revisionId && settledSync.taskOutcome?.classification === 'completed-with-gaps' &&
      settledSync.update?.reusePlanDigest === preparedSync.update.reusePlanDigest,
    'sync-settled-run', { run: settledSync?.run, taskOutcome: settledSync?.taskOutcome });
    requireSuccessorShape(revision2, {
      resultSetId: revision.resultSetId, ordinal: 2, mode: 'sync-current', modeLabel: '同步到当前稿件',
      predecessor: { revisionId: revision.revisionId, ordinal: 1, digest: revision.digest }, reusePlanDigest: preparedSync.update.reusePlanDigest,
      counts: syncExpected.counts, selectedRange: null, lineage: syncExpected.dispositions, boundRevisionId: preparedSync.checkpoint.revisionId,
      manifestDigest: syncManifest.digest, freshness: 'current',
    }, attemptSync, fixtureDigest, 'sync-revision');
    // A reused unit is the predecessor's result copied by lineage; a recomputed unit carries a new request digest.
    requireJourney(JSON.stringify(withoutKey(revision2.units[2], 'lineage')) === JSON.stringify(withoutKey(revision.units[2], 'lineage')) &&
      revision2.units[0].requestDigest !== revision.units[0].requestDigest && revision2.units[2].requestDigest === revision.units[2].requestDigest &&
      revision2.freshness.currentRevisionId === preparedSync.checkpoint.revisionId && revision2.manuscriptPin.revisionDigest === staleRevision.freshness.currentWorkingDigest &&
      revision2.usage.inputTokens < revision.usage.inputTokens, 'sync-reused-unit-copy', { reused: revision2.units[2], usage: revision2.usage });
    // The predecessor is unchanged and reachable read-only while the latest stays the latest.
    const olderView = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis({ revisionId: ${JSON.stringify(revision.revisionId)} })`);
    requireJourney(olderView?.inspectedRevision?.readOnly === true && olderView.inspectedRevision.current === false &&
      olderView.inspectedRevision.revision?.freshness?.state === 'superseded' && olderView.inspectedRevision.revision.freshness.boundRevisionId === revision.manuscriptPin.revisionId &&
      JSON.stringify(withoutKey(olderView.inspectedRevision.revision, 'freshness')) === JSON.stringify(withoutKey(revision, 'freshness')) &&
      olderView.resultSetRevision?.revisionId === revision2.revisionId && olderView.history?.entries?.length === 2,
    'sync-predecessor-immutable', { inspected: olderView?.inspectedRevision === undefined ? undefined : { ...olderView.inspectedRevision, revision: { ...olderView.inspectedRevision.revision, units: undefined, sections: undefined, synthesis: undefined } } });
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const axis=(name)=>card?.querySelector('[data-analysis-axis='+JSON.stringify(name)+']')?.dataset.axisState;
      const history=card?.querySelector('.analysis-history');
      return card?.dataset.resultRevisionOrdinal==='2' && card.dataset.resultRevisionId===${JSON.stringify(revision2.revisionId)} && card.dataset.resultRevisionDigest===${JSON.stringify(revision2.digest)} &&
        card.dataset.updateMode==='sync-current' && card.dataset.reusedCount==='6' && card.dataset.recomputedCount==='2' && card.dataset.invalidatedCount==='2' && card.dataset.bypassedCount==='0' &&
        card.dataset.freshnessState==='current' && card.dataset.gapCount==='1' && card.dataset.conflictCount==='4' && axis('freshness')==='current' && axis('coverage')==='partial' &&
        card.querySelectorAll('[data-analysis-unit]').length===8 && card.querySelector('[data-analysis-unit="3"][data-analysis-unit-lineage="reused"][data-analysis-unit-reused-from="1/3"]')!==null &&
        card.querySelector('[data-analysis-unit="1"][data-analysis-unit-lineage="recomputed"]')!==null && card.querySelectorAll('[data-analysis-unit-lineage="reused"]').length===6 &&
        card.textContent.includes('后继于 Revision 1') && card.textContent.includes('复用 6') && card.textContent.includes(${JSON.stringify(preparedSync.update.reusePlanDigest)}) &&
        history?.dataset.historyCount==='2' && history.dataset.historyLatestOrdinal==='2' &&
        history.querySelector('[data-history-ordinal="1"][data-history-current="false"][data-history-freshness="superseded"][data-history-mode="first-baseline"]')!==null &&
        history.querySelector('[data-history-ordinal="2"][data-history-current="true"][data-history-freshness="current"][data-history-mode="sync-current"][data-history-predecessor-ordinal="1"]')!==null &&
        card.querySelector('[data-update-action="sync-current"][data-update-available="false"]')!==null && ${ONLY_ANALYSIS_ACTIONS};
    })()`, 'sync-overview-surface');

    at('reanalyze-range-select');
    cancellation.throwIfRequested();
    const rangeOption = settledSync.updateControls?.actions?.['reanalyze-range']?.options?.[2];
    requireJourney(settledSync.updateControls?.target?.ordinal === 2 && settledSync.updateControls.target.revisionId === revision2.revisionId &&
      settledSync.updateControls.target.freshness === 'current' && settledSync.updateControls.actions['sync-current'].available === false &&
      rangeOption?.unitOrdinal === 3 && rangeOption.startPosition === SAMPLE1_UNIT_RANGES[2][0] && rangeOption.endPosition === SAMPLE1_UNIT_RANGES[2][1] &&
      sameRecord(rangeOption.expected, { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 }), 'range-option', settledSync.updateControls);
    const selectedRange = { startPosition: rangeOption.startPosition, endPosition: rangeOption.endPosition };
    await assertRenderer(renderer, `(() => {
      const block=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"]');
      const radios=Array.from(block?.querySelectorAll('input[name="analysis-range"]')??[]);
      const radio=block?.querySelector('#analysis-range-3');
      const start=block?.querySelector('[data-analysis-action="reanalyze-range"]');
      if(!(radio instanceof HTMLInputElement)||radios.length!==8||radios.some((item)=>item.checked)||!(start instanceof HTMLButtonElement)||!start.disabled||block.dataset.selectedRange) return false;
      radio.click();
      return radio.checked && radios.filter((item)=>item.checked).length===1 && block.dataset.selectedRange===${JSON.stringify(`${selectedRange.startPosition}-${selectedRange.endPosition}`)} &&
        block.dataset.expectedReused==='5' && block.dataset.expectedRecomputed==='3' && block.dataset.expectedInvalidated==='1' && block.dataset.expectedBypassed==='2' && !start.disabled &&
        block.textContent.includes(${JSON.stringify(`内容块 ${selectedRange.startPosition}–${selectedRange.endPosition}`)});
    })()`, 'range-select');

    at('reanalyze-range-prepare');
    cancellation.throwIfRequested();
    await click(renderer, '重新分析所选范围', 'range-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, 'range-prepared', 120_000);
    const preparedRange = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const rangeManifest = preparedRange?.coverageManifest;
    const rangeExpected = deriveExpectedPlan(syncManifest, revision2.units.map((unit) => unit.state), rangeManifest, 'reanalyze-range', selectedRange);
    const rangePlan = preparedRange?.update?.reusePlan;
    requireJourney(preparedRange?.state === 'prepared' && preparedRange.taskIntent?.mode === 'reanalyze-range' && preparedRange.taskIntent?.goal === RANGE_GOAL &&
      rangeManifest?.digest === syncManifest.digest && preparedRange.checkpoint?.revisionId === preparedSync.checkpoint.revisionId &&
      sameRecord(preparedRange.update?.selectedRange, selectedRange) && preparedRange.update.predecessor?.revisionId === revision2.revisionId &&
      preparedRange.update.predecessor.ordinal === 2 && preparedRange.update.predecessor.digest === revision2.digest && preparedRange.update.predecessorCurrent === true &&
      sameRecord(rangeExpected.counts, { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 }) && JSON.stringify(rangeExpected.closure) === JSON.stringify([3, 4]) &&
      rangePlan?.mode === 'reanalyze-range' && sameRecord(rangePlan.selectedRange, selectedRange) && JSON.stringify(rangePlan.recomputeClosure) === JSON.stringify(rangeExpected.closure) &&
      sameRecord(rangePlan.counts, rangeExpected.counts) && sameRecord(rangePlan.counts, rangeOption.expected) &&
      JSON.stringify(rangePlan.units.map((unit) => unit.disposition)) === JSON.stringify(rangeExpected.dispositions) &&
      JSON.stringify(rangePlan.units.map((unit) => unit.reason)) === JSON.stringify(['compatible', 'predecessor-gap', 'bypassed-selected-range', 'bypassed-selected-range', 'compatible', 'compatible', 'compatible', 'compatible']) &&
      rangePlan.units[0].reusedFrom?.revisionId === revision2.revisionId && rangePlan.units[0].reusedFrom?.unitOrdinal === 1 &&
      JSON.stringify(rangePlan.predecessorUnits.map((unit) => unit.disposition)) === JSON.stringify(['reused', 'invalidated', 'bypassed', 'bypassed', 'reused', 'reused', 'reused', 'reused']) &&
      JSON.stringify(preparedRange.runSourceScope?.unitScope?.recomputedUnitOrdinals) === JSON.stringify(rangeExpected.recomputed) &&
      preparedRange.executionPlan?.recomputedUnitCount === 3 && preparedRange.executionPlan?.reusedUnitCount === 5 &&
      preparedRange.planEnvelope?.digest !== preparedSync.planEnvelope.digest && preparedRange.actions?.canAuthorize === true,
    'range-prepared-plan', { rangeExpected, update: preparedRange?.update, unitScope: preparedRange?.runSourceScope?.unitScope });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.planUpdateMode==='reanalyze-range' && card.dataset.planReused==='5' && card.dataset.planRecomputed==='3' && card.dataset.planInvalidated==='1' && card.dataset.planBypassed==='2' && card.querySelector('[data-reuse-plan-unit="3"][data-reuse-disposition="recomputed"][data-reuse-reason="bypassed-selected-range"]')!==null && card.querySelector('[data-reuse-plan-unit="4"][data-reuse-disposition="recomputed"][data-reuse-reason="bypassed-selected-range"]')!==null && card.querySelector('[data-reuse-plan-unit="1"][data-reuse-disposition="reused"]')!==null && card.querySelectorAll('[data-reuse-predecessor-disposition="bypassed"]').length===2 && card.textContent.includes(${JSON.stringify(`内容块 ${selectedRange.startPosition}–${selectedRange.endPosition}`)}) && card.querySelector('[data-analysis-action="authorize"]') instanceof HTMLButtonElement; })()`, 'range-plan-preview');

    at('reanalyze-range-dispatch');
    cancellation.throwIfRequested();
    const settledRange = await settleAuthorizedRun(renderer, 'range');

    at('reanalyze-range-revision');
    const revision3 = settledRange?.resultSetRevision;
    const attemptRange = settledRange?.run?.attempt;
    requireJourney(settledRange?.state === 'settled' && settledRange.run?.state === 'completed-with-gaps' &&
      JSON.stringify(attemptRange?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify(rangeExpected.recomputed) &&
      settledRange.taskOutcome?.resultSetRevisionId === revision3?.revisionId, 'range-settled-run', settledRange?.run);
    requireSuccessorShape(revision3, {
      resultSetId: revision.resultSetId, ordinal: 3, mode: 'reanalyze-range', modeLabel: '重新分析所选范围',
      predecessor: { revisionId: revision2.revisionId, ordinal: 2, digest: revision2.digest }, reusePlanDigest: preparedRange.update.reusePlanDigest,
      counts: rangeExpected.counts, selectedRange, lineage: rangeExpected.dispositions, boundRevisionId: preparedSync.checkpoint.revisionId,
      manifestDigest: rangeManifest.digest, freshness: 'current',
    }, attemptRange, fixtureDigest, 'range-revision');
    requireJourney(JSON.stringify(withoutKey(revision3.units[0], 'lineage')) === JSON.stringify(withoutKey(revision2.units[0], 'lineage')) &&
      revision3.units[2].requestDigest === revision2.units[2].requestDigest && revision3.manuscriptPin.revisionId === revision2.manuscriptPin.revisionId &&
      JSON.stringify(revision3.synthesis) === JSON.stringify(revision2.synthesis), 'range-reused-and-recomputed-content');
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const history=card?.querySelector('.analysis-history'); return card?.dataset.resultRevisionOrdinal==='3' && card.dataset.updateMode==='reanalyze-range' && card.dataset.reusedCount==='5' && card.dataset.recomputedCount==='3' && card.dataset.invalidatedCount==='1' && card.dataset.bypassedCount==='2' && card.dataset.freshnessState==='current' && card.querySelector('[data-analysis-unit="1"][data-analysis-unit-lineage="reused"][data-analysis-unit-reused-from="2/1"]')!==null && card.querySelector('[data-analysis-unit="3"][data-analysis-unit-lineage="recomputed"]')!==null && card.textContent.includes(${JSON.stringify(`内容块 ${selectedRange.startPosition}–${selectedRange.endPosition}`)}) && history?.dataset.historyCount==='3' && history.querySelector('[data-history-ordinal="3"][data-history-current="true"][data-history-mode="reanalyze-range"][data-history-predecessor-ordinal="2"]')!==null && history.querySelector('[data-history-ordinal="2"][data-history-current="false"][data-history-freshness="superseded"]')!==null && ${ONLY_ANALYSIS_ACTIONS}; })()`, 'range-overview-surface');

    at('reanalyze-book-prepare');
    cancellation.throwIfRequested();
    await assertRenderer(renderer, `(() => { const whole=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-book"]'); return whole?.dataset.updateAvailable==='true' && whole.dataset.expectedReused==='0' && whole.dataset.expectedRecomputed==='8' && whole.dataset.expectedInvalidated==='1' && whole.dataset.expectedBypassed==='7' && !whole.querySelector('[data-analysis-action="reanalyze-book"]').disabled; })()`, 'book-control');
    await click(renderer, '重新分析全书', 'book-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, 'book-prepared', 120_000);
    const preparedBook = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const bookManifest = preparedBook?.coverageManifest;
    const bookExpected = deriveExpectedPlan(rangeManifest, revision3.units.map((unit) => unit.state), bookManifest, 'reanalyze-book', null);
    const bookPlan = preparedBook?.update?.reusePlan;
    requireJourney(preparedBook?.state === 'prepared' && preparedBook.taskIntent?.mode === 'reanalyze-book' && preparedBook.taskIntent?.goal === BOOK_GOAL &&
      bookManifest?.digest === rangeManifest.digest && preparedBook.update?.predecessor?.revisionId === revision3.revisionId && preparedBook.update.predecessor.ordinal === 3 &&
      preparedBook.update.selectedRange === null && sameRecord(bookExpected.counts, { reused: 0, recomputed: 8, invalidated: 1, bypassed: 7 }) &&
      bookPlan?.mode === 'reanalyze-book' && sameRecord(bookPlan.counts, bookExpected.counts) &&
      bookPlan.units.every((unit) => unit.disposition === 'recomputed' && unit.reason === 'bypassed-whole-book' && unit.reusedFrom === null) &&
      JSON.stringify(bookPlan.predecessorUnits.map((unit) => unit.disposition)) === JSON.stringify(['bypassed', 'invalidated', 'bypassed', 'bypassed', 'bypassed', 'bypassed', 'bypassed', 'bypassed']) &&
      JSON.stringify(preparedBook.runSourceScope?.unitScope?.recomputedUnitOrdinals) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]) &&
      preparedBook.executionPlan?.recomputedUnitCount === 8 && preparedBook.executionPlan?.reusedUnitCount === 0 && preparedBook.actions?.canAuthorize === true,
    'book-prepared-plan', { bookExpected, update: preparedBook?.update });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.planUpdateMode==='reanalyze-book' && card.dataset.planReused==='0' && card.dataset.planRecomputed==='8' && card.dataset.planInvalidated==='1' && card.dataset.planBypassed==='7' && card.querySelectorAll('[data-reuse-plan-unit][data-reuse-disposition="recomputed"][data-reuse-reason="bypassed-whole-book"]').length===8 && card.querySelectorAll('[data-reuse-predecessor-disposition="bypassed"]').length===7; })()`, 'book-plan-preview');

    at('reanalyze-book-dispatch');
    cancellation.throwIfRequested();
    const settledBook = await settleAuthorizedRun(renderer, 'book');

    at('reanalyze-book-revision');
    const revision4 = settledBook?.resultSetRevision;
    const attemptBook = settledBook?.run?.attempt;
    requireJourney(settledBook?.state === 'settled' && settledBook.run?.state === 'completed-with-gaps' &&
      JSON.stringify(attemptBook?.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]) &&
      settledBook.taskOutcome?.resultSetRevisionId === revision4?.revisionId, 'book-settled-run', settledBook?.run);
    requireSuccessorShape(revision4, {
      resultSetId: revision.resultSetId, ordinal: 4, mode: 'reanalyze-book', modeLabel: '重新分析全书',
      predecessor: { revisionId: revision3.revisionId, ordinal: 3, digest: revision3.digest }, reusePlanDigest: preparedBook.update.reusePlanDigest,
      counts: bookExpected.counts, selectedRange: null, lineage: bookExpected.dispositions, boundRevisionId: preparedSync.checkpoint.revisionId,
      manifestDigest: bookManifest.digest, freshness: 'current',
    }, attemptBook, fixtureDigest, 'book-revision');
    // No mode mutated the manuscript: every successor pins the working state the acknowledged edit produced.
    requireJourney(JSON.stringify(revision4.synthesis) === JSON.stringify(revision3.synthesis) && revision4.usage.requests === SAMPLE1_UNITS &&
      revision4.manuscriptPin.revisionId === revision2.manuscriptPin.revisionId && revision4.manuscriptPin.revisionDigest === staleRevision.freshness.currentWorkingDigest &&
      settledBook.updateControls?.working?.workingDigest === staleRevision.freshness.currentWorkingDigest && settledBook.updateControls.working.totalBlocks === SAMPLE1_BLOCKS,
    'book-no-manuscript-mutation', { pin: revision4.manuscriptPin, working: settledBook?.updateControls?.working });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.resultRevisionOrdinal==='4' && card.dataset.updateMode==='reanalyze-book' && card.dataset.reusedCount==='0' && card.dataset.recomputedCount==='8' && card.dataset.bypassedCount==='7' && card.querySelectorAll('[data-analysis-unit-lineage="recomputed"]').length===8 && card.querySelectorAll('[data-analysis-unit-lineage="reused"]').length===0 && ${ONLY_ANALYSIS_ACTIONS}; })()`, 'book-overview-surface');

    at('revision-history');
    const history = settledBook.history;
    requireJourney(history?.resultSetId === revision.resultSetId && history.kind === 'baseline-manuscript-analysis' && history.latestOrdinal === 4 && history.entries?.length === 4 &&
      JSON.stringify(history.entries.map((entry) => [entry.ordinal, entry.mode, entry.modeLabel, entry.current, entry.freshness, entry.predecessor?.ordinal ?? null, entry.usage.requests, entry.gapCount, entry.conflictCount, entry.unitsClosed])) ===
        JSON.stringify([[1, 'first-baseline', '首次基线分析', false, 'superseded', null, 8, 1, 4, 7], [2, 'sync-current', '同步到当前稿件', false, 'superseded', 1, 2, 1, 4, 7], [3, 'reanalyze-range', '重新分析所选范围', false, 'superseded', 2, 3, 1, 4, 7], [4, 'reanalyze-book', '重新分析全书', true, 'current', 3, 8, 1, 4, 7]]) &&
      JSON.stringify(history.entries.map((entry) => entry.revisionId)) === JSON.stringify([revision.revisionId, revision2.revisionId, revision3.revisionId, revision4.revisionId]) &&
      JSON.stringify(history.entries.map((entry) => entry.digest)) === JSON.stringify([revision.digest, revision2.digest, revision3.digest, revision4.digest]) &&
      history.entries.every((entry, index) => sameRecord(entry.counts, [revision.update.counts, syncExpected.counts, rangeExpected.counts, bookExpected.counts][index])) &&
      JSON.stringify(history.entries.map((entry) => entry.reusePlanDigest)) === JSON.stringify([null, preparedSync.update.reusePlanDigest, preparedRange.update.reusePlanDigest, preparedBook.update.reusePlanDigest]) &&
      history.entries[0].manuscriptPin.revisionId === revision.manuscriptPin.revisionId && history.entries[0].manuscriptPin.revisionLabel === 'r1' &&
      history.entries.slice(1).every((entry) => entry.manuscriptPin.revisionId === revision2.manuscriptPin.revisionId) &&
      history.entries.every((entry) => UUID_PATTERN.test(entry.producingRun?.runRecordId) && entry.producingRun.classification === 'completed-with-gaps' &&
        DIGEST_PATTERN.test(entry.manuscriptPin.revisionDigest) && DIGEST_PATTERN.test(entry.coverageManifestDigest) && typeof entry.freshnessLabel === 'string') &&
      history.entries[1].producingRun.runRecordId === settledSync.run.runRecordId && history.entries[3].producingRun.attemptId === attemptBook.attemptId,
    'history-projection', history);
    await assertRenderer(renderer, `(() => {
      const section=document.querySelector('.baseline-analysis-card .analysis-history');
      const entries=Array.from(section?.querySelectorAll('[data-history-ordinal]')??[]);
      return section?.dataset.historyCount==='4' && section.dataset.historyLatestOrdinal==='4' && section.dataset.historyResultSetId===${JSON.stringify(revision.resultSetId)} &&
        entries.map((entry)=>entry.dataset.historyOrdinal).join(',')==='1,2,3,4' && entries.map((entry)=>entry.dataset.historyMode).join(',')==='first-baseline,sync-current,reanalyze-range,reanalyze-book' &&
        entries.map((entry)=>entry.dataset.historyCurrent).join(',')==='false,false,false,true' && entries.map((entry)=>entry.dataset.historyFreshness).join(',')==='superseded,superseded,superseded,current' &&
        entries.map((entry)=>entry.dataset.historyPredecessorOrdinal).join(',')===',1,2,3' &&
        entries.every((entry)=>entry.querySelector('[data-analysis-action="open-revision"]') instanceof HTMLButtonElement && !entry.querySelector('[data-analysis-action="open-revision"]').disabled) &&
        section.textContent.includes(${JSON.stringify(revision.revisionId)}) && section.textContent.includes(${JSON.stringify(revision4.digest)}) && section.textContent.includes('首次基线分析') && section.textContent.includes('已被取代 · 按原始 pin 保留') &&
        !section.querySelector('[data-analysis-action="close-revision"]');
    })()`, 'history-surface');

    at('history-open-read-only');
    cancellation.throwIfRequested();
    await assertRenderer(renderer, `(() => { const button=document.querySelector('[data-analysis-action="open-revision"][data-analysis-revision-ordinal="1"]'); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, 'history-open-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.inspectedRevisionOrdinal==='1'`, 'history-open-rendered');
    const historical = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis({ revisionId: ${JSON.stringify(revision.revisionId)} })`);
    requireJourney(historical?.inspectedRevision?.readOnly === true && historical.inspectedRevision.current === false &&
      historical.inspectedRevision.revision?.ordinal === 1 && historical.inspectedRevision.revision.digest === revision.digest &&
      historical.inspectedRevision.revision.freshness.state === 'superseded' && historical.inspectedRevision.revision.freshness.boundRevisionId === revision.manuscriptPin.revisionId &&
      JSON.stringify(withoutKey(historical.inspectedRevision.revision, 'freshness')) === JSON.stringify(withoutKey(revision, 'freshness')) &&
      historical.resultSetRevision?.ordinal === 4 && historical.history?.entries?.length === 4, 'history-open-projection');
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const axis=(name)=>card?.querySelector('[data-analysis-axis='+JSON.stringify(name)+']')?.dataset.axisState;
      return card?.dataset.inspectedRevisionOrdinal==='1' && card.dataset.inspectedRevisionId===${JSON.stringify(revision.revisionId)} && card.dataset.inspectedCurrent==='false' &&
        card.dataset.resultRevisionOrdinal==='4' && card.dataset.resultRevisionId===${JSON.stringify(revision4.revisionId)} && card.dataset.updateMode==='first-baseline' &&
        card.querySelectorAll('[data-analysis-axis]').length===4 && axis('freshness')==='superseded' && axis('coverage')==='partial' && axis('reducer-closure')==='closed-with-gaps' && axis('assurance')==='qualified-with-open-conflicts' &&
        card.querySelectorAll('[data-analysis-unit]').length===8 && card.querySelectorAll('[data-analysis-unit-lineage="recomputed"]').length===8 &&
        card.querySelector('[data-analysis-gap-unit="2"] [data-analysis-action="return-to-range"]') instanceof HTMLButtonElement &&
        card.textContent.includes('历史修订版 Revision 1（只读）') && card.textContent.includes('已被后续修订版取代') && card.textContent.includes(${JSON.stringify(revision.digest)}) &&
        card.querySelector('[data-analysis-action="close-revision"]') instanceof HTMLButtonElement &&
        card.querySelector('[data-analysis-action="open-revision"][data-analysis-revision-ordinal="1"]')?.disabled===true && ${ONLY_ANALYSIS_ACTIONS};
    })()`, 'history-open-surface');
    // 回到稿件范围 from the historical view opens the ordinary editor at the referenced block; the Overview then returns to the latest.
    await assertRenderer(renderer, `(() => { const button=document.querySelector('[data-analysis-gap-unit="2"] [data-analysis-action="return-to-range"]'); if(!(button instanceof HTMLButtonElement)||button.disabled||button.dataset.analysisBlockId!==${JSON.stringify(gapBlockId)})return false; button.click(); return true; })()`, 'history-return-to-range-click');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] [data-block-id=${JSON.stringify(gapBlockId)}]')`, 'history-return-to-range-editor', 120_000);
    cancellation.throwIfRequested();
    await click(renderer, '返回图书工作概览', 'history-return-back');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]') && document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'history-return-overview');
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return !card?.dataset.inspectedRevisionOrdinal && card?.dataset.resultRevisionOrdinal==='4'; })()`, 'history-latest-restored');
    // Opening another revision and closing it explicitly returns to the latest as well.
    await assertRenderer(renderer, `(() => { const button=document.querySelector('[data-analysis-action="open-revision"][data-analysis-revision-ordinal="2"]'); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, 'history-open-second-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.inspectedRevisionOrdinal==='2' && document.querySelector('.baseline-analysis-card')?.dataset.updateMode==='sync-current'`, 'history-open-second-rendered');
    await click(renderer, '返回最新修订版', 'history-close-click');
    await waitFor(renderer, `!document.querySelector('.baseline-analysis-card')?.dataset.inspectedRevisionOrdinal && document.querySelector('.baseline-analysis-card')?.dataset.resultRevisionOrdinal==='4' && document.querySelector('.baseline-analysis-card')?.dataset.updateMode==='reanalyze-book'`, 'history-closed');
    const afterHistory = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(afterHistory) === JSON.stringify(settledBook), 'history-read-only');

    at('restart-history');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-history-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'restart-history-open-book');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled' && document.querySelector('.baseline-analysis-card')?.dataset.resultRevisionOrdinal==='4'`, 'restart-history-visible');
    const restartedHistory = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(restartedHistory) === JSON.stringify(settledBook), 'restart-history-immutable');
    for (const [ordinal, expectedRevision] of [[1, revision], [2, revision2], [3, revision3]]) {
      const reopened = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis({ revisionId: ${JSON.stringify(expectedRevision.revisionId)} })`);
      requireJourney(reopened?.inspectedRevision?.revision?.ordinal === ordinal && reopened.inspectedRevision.current === false &&
        reopened.inspectedRevision.revision.freshness.state === 'superseded' &&
        JSON.stringify(withoutKey(reopened.inspectedRevision.revision, 'freshness')) === JSON.stringify(withoutKey(expectedRevision, 'freshness')),
      `restart-history-revision-${ordinal}`);
    }
    await assertRenderer(renderer, `document.querySelector('.baseline-analysis-card .analysis-history')?.dataset.historyCount==='4'`, 'restart-history-surface');
    cancellation.throwIfRequested();

    at('zero-activity');
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.analysisState==='settled' && card.dataset.resultRevisionOrdinal==='4' && ${ONLY_ANALYSIS_ACTIONS} && !document.querySelector('[data-analysis-action="prepare"], [data-analysis-action="authorize"]') && !Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress|effect|enrol|apply|export/i.test(key)); })()`, 'no-execution-surface');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-network-provider-session');
  } finally {
    finalCleanupRequested = true;
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch((error) => {
  reportJourneyFailure('J-04', location, error);
  if (runnerLifecycleIncomplete) process.stderr.write('', () => process.exit(1));
});
