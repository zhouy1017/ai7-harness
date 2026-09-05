import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// Supported-journey scenario: J-04 covered baseline manuscript analysis (Issue #92, bounded S36 slice).
// Inputs: exact ADR 0043 SampleBooks/sample1.docx plus the hand-written synthetic model fixtures under
// tests/fixtures/model/. The product executes the Run over the in-process ai7-local-deterministic route;
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
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 15, 'credential-cleanup-metadata-version');
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
        buttons.length>0 && buttons.every((button)=>button.dataset.analysisAction==='return-to-range') &&
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

    at('zero-activity');
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.analysisState==='settled' && Array.from(card.querySelectorAll('button')).every((button)=>button.dataset.analysisAction==='return-to-range') && !document.querySelector('[data-analysis-action="prepare"], [data-analysis-action="authorize"]') && !Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key)); })()`, 'no-execution-surface');
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
