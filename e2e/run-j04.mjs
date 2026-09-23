import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
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
// Issue #48 (S13) extends it again: the product relaunches with a second fixture identity so one unit's
// transient first-attempt failure is retried once in-envelope as a recorded `safe-retry` Plan
// Adaptation, and a prepared `重新分析所选范围` Task whose range changes before authorization is
// superseded by a Plan Revision, refuses its stale version, takes the way back to the version it froze,
// and is reconfirmed as version 2.
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
/** Every button the settled card may carry: navigation, the three update controls, history, the plan-revision controls, and the hidden cancel. */
// Synchronized delta (#406): ②A's tabs, the four sentences' shortcuts to the tab their next action is
// taken on, and each update mode's own button with the two ways to begin behind it.
// Synchronized delta with Issue #417: 可信程度's pointer at 审阅 is a working `打开审阅` now (V2-UX-REV-011).
// Synchronized delta with Issue #418 (S72 D4): the plan is one line and `查看计划`, which opens the Task Drawer.
// Synchronized delta with Issue #420 (S74a A4, A5): `查看计划修订` and `重新确认计划` moved into the drawer's
// authorization bar with the start itself, so the card never carries them again.
const ANALYSIS_ACTIONS = ['return-to-range', 'sync-current', 'reanalyze-range', 'reanalyze-book', 'open-revision', 'close-revision', 'cancel-preparation',
  'select-tab', 'go-history', 'go-chapters', 'choose-sync-current', 'choose-reanalyze-range', 'choose-reanalyze-book', 'quick-sync-current', 'quick-reanalyze-range', 'quick-reanalyze-book',
  'open-review', 'view-plan'];
/** Every button on screen and in the drawer whose words name 授权: AUTH-002 keeps the word off every start (ADR 0077). */
const AUTHORIZE_LABELED_BUTTONS = `Array.from(document.querySelectorAll('#screen button, #task-drawer button')).filter((button)=>/授权/u.test(button.textContent??'')).length`;
/** The words the authorization bar says before every start (AUTH-003 as ADR 0077 revised it). */
const BAR_STATEMENT = '只是让 AI7 按这份计划做这一次；接受修改建议、批准受控动作、保存里程碑版本、设为发稿版本都仍由你另行决定';
// Synchronized delta with Issue #408: the renderer now carries exactly one Apply surface — AI7 Apply for
// a Change Suggestion on the manuscript — and the analysis still gains none. Anything else named like an
// execution, effect, apply or export member remains a failure here.
// Synchronized delta with Issue #417: the batch confirmation strip of 审阅's results gives the batch
// Apply its renderer member, `applyChangeSuggestionBatch` — 确认应用 over exactly the suggestions the
// strip listed, one Effect, all or none. It is the same Apply surface, so it joins this allow-list.
const CHANGE_SUGGESTION_APPLY_MEMBERS = ['applyChangeSuggestion', 'applyChangeSuggestionBatch', 'getManuscriptApplyOutcome'];
// Synchronized delta with Issue #413: 交付物's four 导出 members, the only ones named like an export. They reach
// no Provider, session or scheduler: a local file the system dialog chose, approved per file.
const EXPORT_MEMBERS = ['reviewManuscriptExport', 'chooseManuscriptExportDestination', 'approveManuscriptExport', 'revealManuscriptExport'];
// Synchronized delta with Issue #417: 审阅's seven members. None is named like an execution, effect,
// apply or export member, so the two pins below hold them without an exception.
const REVIEW_MEMBERS = ['inspectReviewWorkspace', 'prepareReviewRun', 'authorizeReviewRun', 'continueReviewRun',
  'recordReviewFindingDisposition', 'generateReviewReport', 'inspectReviewFindingOfMark'];
const ONLY_ANALYSIS_ACTIONS = `Array.from(card.querySelectorAll('button')).every((button)=>${JSON.stringify(ANALYSIS_ACTIONS)}.includes(button.dataset.analysisAction))`;
/** The 分析 destination's own persistent actions, in the order it builds them (#406, V2-UX-LAYER-005). */
const ANALYSIS_DESTINATION_ACTIONS = ['打开稿件', '工作概览'];
/** ②A's seven tabs in the specification's order (editor-surfaces §3). */
const ANALYSIS_TAB_LABELS = ['梗概', '人物与名称', '事件', '关系', '设定', '各章', '历史与更新'];
/** The four sentences' headings in the order V2-UX-ANALYSIS-025 fixes. */
const ANALYSIS_SENTENCE_HEADINGS = ['覆盖范围', '全书综合', '与当前稿件', '可信程度'];
const ASSURANCE_STATEMENT = '仅为模型输出的结构化归纳；不构成事实判定、编辑评审或稿件变更。';
/**
 * The reducer stages in the order the Run performs them. Synchronized delta (#274): the model-driven
 * `cross-unit-reduction` sits between the deterministic contradiction pass it post-filters and the
 * synthesis it precedes. Synchronized delta (#275): `assurance-sampling` closes the list, because the
 * sample is drawn over what the reduction and the synthesis already produced.
 */
const REDUCER_STAGES = ['unit-validation', 'section-reduction', 'contradiction-continuity', 'cross-unit-reduction', 'book-synthesis', 'assurance-sampling'];
/**
 * Synchronized delta (#275): every Run of this Journey performs exactly one assurance sampling turn.
 * Both cross-unit findings are anchored in unit 1 — a finding's anchor is its first side's unit — and
 * exact `sample1` is one structural section, so the sample is one stratum drawn to one turn.
 */
const SAMPLING_TURNS = 1;

/**
 * The service's canonical JSON form and its digest, restated here on purpose. The Journey recomputes
 * the sample's seed from what the revision itself discloses — its manifest digest and its own findings
 * — rather than from the product's own function, which is the only way the assertion means anything.
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}
/** The four typed cross-unit finding kinds; this fixture reports the two the deterministic pass cannot reach. */
const CROSS_UNIT_FINDING_KINDS = ['contradiction', 'continuity-break', 'alias-identity-divergence', 'chronology-conflict'];
/**
 * The Decision Layer's label for every conflict kind this fixture reports, keyed by the reducer token the
 * record keeps. Synchronized delta with Issue #417: ②A no longer lists the conflicts; these are the words
 * a lead 批注 of 审阅's 情节逻辑与前后一致 names its kind in (`【线索 · <label>】`), for the 审阅 stages.
 */
const CONFLICT_KIND_LABELS = {
  'unit-reported': '单元内报告',
  'alias-collision': '别名冲突',
  'entity-kind-divergence': '实体类别分歧',
  'setting-claim-divergence': '设定声明分歧',
};
const FIXTURES_ROOT = resolve(ROOT, 'tests', 'fixtures', 'model');
const FIXTURE_IDENTITY = 'sample1-baseline-one-unit-failure';
const FIXTURE_BASE_IDENTITY = 'sample1-baseline-happy';
/** The Issue #48 variant: unit 5's first attempt answers a transient PROVIDER_ERROR 503; layered over the one-unit-failure fixture. */
const RETRY_FIXTURE_IDENTITY = 'sample1-baseline-transient-retry';
// The authored review fixture (Issue #417) layers over the transient-retry fixture: one launch answers
// every request the earlier stages froze and the review categories' requests over the manuscript as this
// Journey leaves it — both of its edits in the first block.
const REVIEW_FIXTURE_IDENTITY = 'sample1-review-authored';
/** The material fields of the Plan Boundary Split, in the order the canonical envelope lists them. */
const PLAN_MATERIAL_FIELDS = [
  'providerBinding.providerId', 'providerBinding.modelId', 'providerBinding.adapterRevision', 'providerBinding.configurationRevision', 'providerBinding.credentialReference',
  'artifactPin.identity', 'artifactPin.version', 'artifactPin.nativeCarrierSha256', 'artifactPin.sidecarRevision', 'artifactPin.sidecarSha256',
  'selectedRange', 'predecessorRevision', 'runBudgetCeiling', 'outboundDataCategory', 'expectedOutcome',
];
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
async function expectedFixtureDigest(identities = [FIXTURE_IDENTITY, FIXTURE_BASE_IDENTITY]) {
  const line = async (identity) => `${identity}:${await digestFile(resolve(FIXTURES_ROOT, `${identity}.json`))}`;
  const lineage = [];
  for (const identity of identities) lineage.push(await line(identity));
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
    // Synchronized delta with Issue #467: this reads the same Agent Data Root store J-03 and J-12
    // read, so the pin moves with the terminal version the service stamps
    // (`CONNECTIVITY_WAIT_SCHEMA_VERSION` since Issue #502). It read 19 until #467 — one revision
    // behind, because only a failed product cleanup reaches this fallback, so revision 20 never met it.
    requireJourney(database.prepare('PRAGMA user_version').get()?.user_version === 30, 'credential-cleanup-metadata-version');
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

/**
 * Synchronized delta (#406): the analysis is its own destination under the manuscript's 资料与记录
 * group (editor-surfaces §3); 工作概览 no longer hosts the card, it names the analysis in one line.
 */
async function openAnalysisDestination(renderer, name) {
  await assertRenderer(renderer, `(() => { const group=document.querySelector('.editor-shell nav.book-records-group'); const open=group?.querySelector('button[data-records-destination="analysis"]'); if(!(open instanceof HTMLButtonElement)||open.disabled||open.textContent!=='分析')return false; open.click(); return true; })()`, name);
  await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis .baseline-analysis-card')`, `${name}-destination`);
}

/**
 * Synchronized delta (#406): a mode's own button opens the two ways to begin. 先看计划 prepares the Task
 * and shows its plan; the quick start is a Default Execution Rule's to give (S75), so until one exists
 * it is shown disabled with the reason, and no Run starts behind a plan nobody has seen.
 */
async function startUpdate(renderer, mode, label, name) {
  // The three modes live under 历史与更新, so the editor goes there first, as they would.
  await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const tab=card?.querySelector('[role="tab"][data-analysis-tab="history"]'); if(!(tab instanceof HTMLButtonElement))return false; tab.click(); return tab.getAttribute('aria-selected')==='true' && !card.querySelector('[data-analysis-panel="history"]').hidden; })()`, `${name}-history-tab`);
  await click(renderer, label, `${name}-choose`);
  await assertRenderer(renderer, `(() => {
    const block=document.querySelector('.baseline-analysis-card [data-update-action=${JSON.stringify(mode)}]');
    const chooser=block?.querySelector('[data-analysis-action=${JSON.stringify(`choose-${mode}`)}]');
    const choice=block?.querySelector('.analysis-update-choice');
    const quick=choice?.querySelector('[data-analysis-action=${JSON.stringify(`quick-${mode}`)}]');
    const plan=choice?.querySelector('[data-analysis-action=${JSON.stringify(mode)}]');
    if(!(chooser instanceof HTMLButtonElement)||!(choice instanceof HTMLElement)||!(quick instanceof HTMLButtonElement)||!(plan instanceof HTMLButtonElement)) return false;
    if(choice.hidden||chooser.getAttribute('aria-expanded')!=='true'||!quick.disabled||plan.disabled||plan.textContent!=='先看计划'||!choice.textContent.includes('快速开始默认')) return false;
    plan.click();
    return true;
  })()`, name);
}

/**
 * Reach 审阅 the way an editor does from the manuscript: the 工作 group's entry (Issue #417,
 * editor-surfaces §0.3 — 审阅 is 工作, not 资料与记录). The destination answers with its card once the
 * workspace has been read.
 */
async function openReviewDestination(renderer, name) {
  await assertRenderer(renderer, `(() => { const group=document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]'); const button=group?.querySelector('button[data-work-destination="review"]'); if(!(button instanceof HTMLButtonElement)||button.disabled||button.textContent!=='审阅')return false; button.click(); return true; })()`, `${name}-entry`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-review"] .book-review .review-workspace-card')`, `${name}-card`);
}

/** Press one 审阅 action by its data attribute, refusing one that is missing or disabled. */
async function reviewAction(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const button=document.querySelector(${JSON.stringify(selector)}); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, name);
}

/**
 * The Task Drawer as an editor reads it (Issue #418, S72): its state, the goal block, the rows of 精简 or
 * the sections of 完整, the two columns, a changed plan's diff, every exact identity of 查看技术详情 by
 * its key, and the mode this renderer remembers. Since Issue #420 (S74a) it also reads the authorization
 * bar in the footer: its state, summary, statement, note and status, and each action with whether it is
 * available and, when it is not, the reason it names.
 */
async function readDrawer(renderer) {
  return renderer.evaluate(`(() => {
    const drawer=document.querySelector('#task-drawer');
    if(!(drawer instanceof HTMLElement))return null;
    const pairs=(selector,key)=>Object.fromEntries(Array.from(drawer.querySelectorAll(selector)).map((node)=>[node.dataset[key],node.textContent]));
    const texts=(selector)=>Array.from(drawer.querySelectorAll(selector)).map((node)=>node.textContent);
    const pill=drawer.querySelector('.task-drawer-pill');
    const drift=drawer.querySelector('[data-task-plan-drift]');
    let stored;
    try { stored=localStorage.getItem('ai7.taskDrawer.mode'); } catch { stored='unavailable'; }
    return {
      hidden:drawer.hidden, kind:drawer.dataset.taskPlanKind, ref:drawer.dataset.taskPlanRef, state:drawer.dataset.taskPlanState,
      version:drawer.dataset.taskPlanVersion??null, mode:drawer.dataset.taskDrawerMode, stored, pill:pill?.textContent,
      sentence:drawer.querySelector('.task-plan-sentence-text')?.textContent,
      chips:pairs('[data-task-plan-chip]','taskPlanChip'), saved:drawer.querySelector('.task-plan-saved')?.textContent??null,
      drift:drift===null?null:{
        kind:drift.dataset.taskPlanDrift, heading:drift.querySelector('h3')?.textContent,
        text:Array.from(drift.querySelectorAll(':scope > p')).map((node)=>node.textContent),
        rows:Array.from(drift.querySelectorAll('tr[data-drift-field]')).map((row)=>[row.dataset.driftField,row.dataset.driftMateriality,...Array.from(row.cells).map((cell)=>cell.textContent)]),
        tableHidden:drift.querySelector('table')?.hidden??null,
      },
      rows:pairs('[data-task-plan-row]','taskPlanRow'), terms:pairs('[data-task-plan-term]','taskPlanTerm'),
      references:texts('[data-task-plan-term="允许参考"] li'), sections:texts('[data-task-plan-section] > h3'),
      steps:Array.from(drawer.querySelectorAll('.task-plan-steps > li')).map((item)=>item.querySelector('.task-plan-step')?.textContent+' '+item.querySelector('.task-plan-step-result')?.textContent),
      participation:texts('.task-plan-participation > li'), outcomes:texts('[data-task-plan-term="可能产生"] li'), notDo:texts('.task-plan-not-do > li'),
      columns:texts('.task-plan-boundary h4'), adaptable:texts('[data-task-plan-boundary="adaptable"] li'), askFirst:texts('[data-task-plan-boundary="ask-first"] li'),
      technical:pairs('[data-task-plan-technical]','taskPlanTechnical'), footer:drawer.querySelector('.task-drawer-footer')?.textContent,
      actions:drawer.querySelectorAll('[data-analysis-action], [data-review-action], [data-task-authorization-action]').length,
      bar:(() => {
        const bar=drawer.querySelector('.task-drawer-bar');
        if(!(bar instanceof HTMLElement)||bar.hidden)return null;
        const text=(selector)=>bar.querySelector(selector)?.textContent??null;
        return {
          state:bar.dataset.taskBar, start:drawer.dataset.taskPlanStart??null,
          summary:text('.task-bar-summary'), statement:text('.task-bar-statement'), note:text('.task-bar-note'),
          status:text('.task-bar-status'), refusal:text('.task-bar-refusal'),
          actions:Array.from(bar.querySelectorAll('button[data-task-drawer-control]')).map((node)=>{
            const described=node.getAttribute('aria-describedby');
            return { name:node.dataset.taskDrawerControl, text:node.textContent, disabled:node.disabled, reason:described===null?null:(document.getElementById(described)?.textContent??null) };
          }),
        };
      })(),
    };
  })()`);
}

/** The bar's actions by name, text and availability, as `readDrawer` reads them. */
function barActions(drawer) {
  return (drawer?.bar?.actions ?? []).map((action) => `${action.name}:${action.text}:${action.disabled ? 'disabled' : 'enabled'}`).join('|');
}

/**
 * Start the prepared baseline Task from the drawer's authorization bar (Issue #420, S74a A2): the drawer
 * shows the Task the preparation opened it for, and the card's 查看计划并开始 opens it when it does not. One
 * activation of 开始任务 records the authorization and the Run and hands the Run to the one slot.
 */
async function startFromBar(renderer, name) {
  const showing = await renderer.evaluate(`(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawer==='open' && drawer.dataset.taskPlanKind==='baseline-analysis' && drawer.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId; })()`);
  if (!showing) await reviewAction(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', `${name}-open-plan`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanStart==='ready' && document.querySelector('#task-drawer')?.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, `${name}-bar-ready`);
  await reviewAction(renderer, '#task-drawer [data-task-drawer-control="start"]', `${name}-start-click`);
}

/** Wait for the drawer to show one Task's plan in one state, then read it. */
async function drawerShowing(renderer, ref, state, name) {
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(ref)} && document.querySelector('#task-drawer')?.dataset.taskPlanState===${JSON.stringify(state)}`, name);
  return readDrawer(renderer);
}

/** A count with its thousands grouped, as the drawer writes it. */
function groupedCount(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/** One reuse plan as 查看技术详情 names it: the digest, then every unit's disposition and reason. */
function reusePlanReading(digest, plan) {
  return `${digest} · ${plan.units.map((unit) => `单元 ${unit.unitOrdinal} ${unit.disposition}（${unit.reason}）`).join('；')}`;
}

function predecessorUnitsReading(plan) {
  return plan.predecessorUnits.map((unit) => `单元 ${unit.unitOrdinal} ${unit.disposition}`).join('；');
}

/** The editor's words for the one adaptation class the analysis envelopes declare, and the three locked groups. */
const SAFE_RETRY_ADAPTATION = '模型服务暂时出错时，同一个阅读范围安全地再试一次';
const LOCKED_BOUNDARY = ['固定要做的事、处理范围、参考范围与所用工序', '固定模型服务、发送内容类别、预算上限', '固定结果类型、受控动作'];

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
  // Synchronized delta with Issue #410 (ADR 0086): sample1's inline styles and its one section are
  // retained with the file, so its review asks for no Import Degradation Decision.
  await waitFor(renderer, `!document.querySelector('#accept-import-degradation')&&Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='新建图书并导入稿件'&&!button.disabled)`, 'import-review-clean');
  cancellation.throwIfRequested();
  await click(renderer, '新建图书并导入稿件', 'import-commit');
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
  await openAnalysisDestination(renderer, 'edit-return');
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
    sameRecord(revision?.policyPin, { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v5', liveTransmissions: 0 }) &&
    revision?.provenance?.taskIntentId === prepared.taskIntent.taskIntentId && revision?.provenance?.attemptId === attempt.attemptId &&
    // Synchronized delta (#274, #275): eight unit turns, the reduction's, and the sample's.
    revision?.usage?.requests === SAMPLE1_UNITS + 1 + SAMPLING_TURNS, `${name}-identity`, { fixtureDigest, revision: revision === null || revision === undefined ? revision : { ...revision, units: undefined, sections: undefined, synthesis: undefined } });
  requireJourney(revision.coverage?.axis === 'coverage' && revision.coverage?.state === 'partial' && revision.coverage?.unitsTotal === SAMPLE1_UNITS &&
    revision.coverage?.unitsClosed === SAMPLE1_UNITS - 1 && revision.coverage?.gapCount === 1 && typeof revision.coverage?.label === 'string' &&
    revision.reducerClosure?.axis === 'reducer-closure' && revision.reducerClosure?.state === 'closed-with-gaps' &&
    JSON.stringify(revision.reducerClosure?.stages?.map((stage) => stage.stage)) === JSON.stringify(REDUCER_STAGES) &&
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
    sameRecord(revision?.policyPin, { operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v5', liveTransmissions: 0 }) &&
    revision?.update?.mode === expected.mode && revision?.update?.modeLabel === expected.modeLabel &&
    sameRecord(revision?.update?.predecessor, expected.predecessor) && revision?.update?.reusePlanDigest === expected.reusePlanDigest &&
    sameRecord(revision?.update?.counts, expected.counts) && sameNullableRecord(revision?.update?.selectedRange ?? null, expected.selectedRange) &&
    JSON.stringify(revision?.lineage?.map((entry) => entry.kind)) === JSON.stringify(expected.lineage) &&
    revision?.units?.length === SAMPLE1_UNITS && revision.units.every(unitLineageExact) &&
    // Synchronized delta (#274, #275): the recomputed units, the reduction's turn, and the sample's.
    revision?.usage?.requests === expected.counts.recomputed + 1 + SAMPLING_TURNS &&
    revision?.coverage?.unitsTotal === SAMPLE1_UNITS && revision?.coverage?.unitsClosed === SAMPLE1_UNITS - 1 &&
    revision?.coverage?.unitsReused === expected.counts.reused && revision?.coverage?.gapCount === 1 &&
    revision?.freshness?.state === expected.freshness && revision?.freshness?.boundRevisionId === expected.boundRevisionId &&
    revision?.assurance?.state === 'qualified-with-open-conflicts' && revision?.gaps?.length === 1 && revision.gaps[0].unitOrdinal === 2 &&
    // Synchronized delta (#274): every successor Run reduces across its own complete new unit set —
    // reused units included — so the reduction closes here too, over the same seven closed units.
    JSON.stringify(revision?.reducerClosure?.stages?.map((stage) => stage.stage)) === JSON.stringify(REDUCER_STAGES) &&
    sameRecord(revision?.reducerClosure?.stages?.[3], { stage: 'cross-unit-reduction', state: 'closed', inputCount: SAMPLE1_UNITS - 1 }) &&
    revision?.crossUnitReduction?.state === 'closed' && revision?.crossUnitReduction?.reason === null &&
    revision?.crossUnitFindings?.length === revision?.crossUnitReduction?.findingCount &&
    revision?.assurance?.crossUnitFindingCount === revision?.crossUnitFindings?.length &&
    // Synchronized delta (#275): the sample closes in every successor Run too, over that Run's own
    // findings, and its dispositions never move one of them.
    revision?.assuranceSample?.state === 'closed' && revision?.assuranceSample?.size === revision?.crossUnitFindings?.length &&
    sameRecord(revision?.reducerClosure?.stages?.[5], { stage: 'assurance-sampling', state: 'closed', inputCount: revision?.crossUnitFindings?.length }) &&
    JSON.stringify(revision?.conflicts?.map((conflict) => conflict.kind)) === JSON.stringify(['unit-reported', 'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence']) &&
    JSON.stringify(revision?.units?.map((unit) => unit.state)) === JSON.stringify(['closed', 'gap', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']),
  `${name}-successor`, { expected, revision: revision === null || revision === undefined ? revision : { ...revision, units: undefined, sections: undefined, synthesis: undefined } });
}

/**
 * Synchronized delta with Issue #420 (S74a): every Run starts from the drawer's bar, and once it settles the
 * same region of the bar reads `已完成` beside the way to the Run's surface — nothing that starts it again.
 */
async function settleAuthorizedRun(renderer, name) {
  await startFromBar(renderer, name);
  await waitFor(renderer, `['settled','failed','interrupted'].includes(document.querySelector('.baseline-analysis-card')?.dataset.analysisState)`, `${name}-settled`, 180_000);
  await assertRenderer(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, `${name}-settled-state`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' && document.querySelector('#task-drawer .task-bar-status')?.textContent==='已完成' && document.querySelector('#task-drawer [data-task-drawer-control="run-link"]')?.textContent==='查看运行' && !document.querySelector('#task-drawer [data-task-drawer-control="start"]')`, `${name}-bar-settled`);
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
    // The bound fixture identity is a launch control; the Issue #48 stages relaunch with the transient-retry variant.
    let modelAdapterIdentity = FIXTURE_IDENTITY;
    // J-04's connectivity control (Issue #502): the service reads this file's word as the device's connectivity, and
    // the deterministic route as one that reaches its model over the network. Absent, the reading is online, so
    // every stage before Connectivity Wait's reads exactly as it always has.
    const connectivityPath = resolve(runRoot, 'connectivity');
    const launchArgs = () => [
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
      '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
      resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      '--j04-picker-path', SAMPLE1_PATH, '--j04-model-adapter', modelAdapterIdentity, '--j04-connectivity-path', connectivityPath,
    ];
    requireJourney(!launchArgs().some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
    launchForCleanup = async (forCleanup = false) => {
      if (!forCleanup) cancellation.throwIfRequested();
      const acquisition = chromium.launch({
        executablePath: executable,
        headless: false,
        ignoreDefaultArgs: true,
        args: launchArgs(),
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
      typeof window.ai7.authorizeBaselineAnalysis==='function' &&
      typeof window.ai7.inspectTaskPlan==='function' &&
      ${JSON.stringify(REVIEW_MEMBERS)}.every((key)=>typeof window.ai7[key]==='function')`, 'renderer-analysis-api');
    at('renderer-zero-execution-api');
    await assertRenderer(renderer, `!Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key))`, 'renderer-zero-execution-api');

    at('sample1-import');
    cancellation.throwIfRequested();
    const imported = await importSample1(renderer, cancellation);
    cancellation.throwIfRequested();

    at('analysis-prerequisites-unavailable');
    // Synchronized delta (#406): on 工作概览 the analysis is one line, not the card.
    await waitFor(renderer, `document.querySelector('.book-overview .book-analysis-summary[data-analysis-state="unavailable"]') && !document.querySelector('.baseline-analysis-card')`, 'analysis-unavailable-before-prerequisites');
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
    // Synchronized delta (#334), by addition: the artifact card folds each ceiling's empty fields into one
    // row, lists the pin history, and moves a revision that is neither in force nor on offer into one
    // counted disclosure. Every assertion above survives that unchanged, so this addition is what pins the
    // new readings and, per V2-UX-LAYER-008, that the folded revision's ceiling digest and each pin's
    // exact instant are still in the record one step away.
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.native-artifact-card');
      const sidecar=card?.querySelector(':scope > .native-artifact-authority');
      const facts=(root)=>{
        const result={};
        for(const term of root?.querySelectorAll(':scope > dl.native-artifact-facts > dt, :scope > details.technical-details > dl > dt')??[]){
          result[term.textContent??'']=term.nextElementSibling?.textContent??'';
        }
        return result;
      };
      const pins=(selector)=>Array.from(sidecar?.querySelectorAll(selector)??[],(item)=>item.textContent??'');
      const decisionPins=pins(':scope > dl.native-artifact-facts li[data-sidecar-pin]');
      const exactPins=pins(':scope > details.technical-details li[data-sidecar-pin]');
      const active=card?.querySelector('[data-authority-sidecar-revision="2"]');
      const superseded=card?.querySelector('[data-authority-sidecar-revision="1"]');
      const past=superseded?.closest('details');
      const activeFacts=facts(active);
      const supersededFacts=facts(superseded);
      return active?.parentElement===sidecar && past?.parentElement===sidecar &&
        past.querySelector(':scope > summary')?.textContent==='其他 Revision（1）' &&
        activeFacts['模型角色']==='Main Editorial Role' &&
        activeFacts['可读范围']==='current-book-primary-manuscript-revision、current-book-source-version' &&
        activeFacts['未声明']==='AI7 能力、模型提供方绑定、凭据访问、网络访问、受控动作、后台分析登记、AI7 正式应用' &&
        activeFacts['SHA-256']===${JSON.stringify(SIDECAR_REVISION_2_DIGEST)} &&
        supersededFacts['模型角色']==='Main Editorial Role' &&
        supersededFacts['权限上限']==='未声明任何权限（8 项均为空）' && supersededFacts['未声明']===undefined &&
        /^[0-9a-f]{64}$/.test(supersededFacts['SHA-256']) &&
        supersededFacts['SHA-256']!==${JSON.stringify(SIDECAR_REVISION_2_DIGEST)} &&
        !active.textContent.includes('空（无）') && !superseded.textContent.includes('空（无）') &&
        decisionPins.length===1 && decisionPins[0].startsWith('Revision 2 · ') &&
        !decisionPins[0].includes(${JSON.stringify(SIDECAR_REVISION_2_DIGEST)}) &&
        exactPins.length===1 && exactPins[0].startsWith('Revision 2 · ' + ${JSON.stringify(SIDECAR_REVISION_2_DIGEST)} + ' · ') &&
        exactPins[0].endsWith('Z') &&
        card.lastElementChild?.classList.contains('native-artifact-actions');
    })()`, 'artifact-card-layer-surface');

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
    // Synchronized delta with Issue #405: the Book route enters the manuscript now (V2-UX-RET-002),
    // and 工作概览 is reached back through the manuscript's 资料与记录 group (V2-UX-IA-012).
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'book-reopened-manuscript');
    // Synchronized delta (#406): 工作概览 still opens from 资料与记录 and now names the analysis in one
    // line that leads to its destination; the card itself is reached through 分析.
    await click(renderer, '返回图书工作概览', 'book-reopened-to-overview');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(imported.bookId)}] .book-analysis-summary[data-analysis-state="available"] [data-analysis-action="open-analysis"]') && !document.querySelector('.baseline-analysis-card')`, 'book-reopened');
    await click(renderer, '打开分析', 'book-reopened-open-analysis');
    await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'book-reopened-analysis');
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
    // Synchronized delta with Issue #418 (S72 D4): ②A names the plan in one line. The eight manifest units,
    // the manifest digest, the fixture route and the policy reading the card used to list read in the Task
    // Drawer the preparation opened, asserted in the next stage. Synchronized delta with Issue #420 (S74a
    // A5): the start left the card for the drawer's bar, so the card's one action reads 查看计划并开始, and
    // the plan versions are its closed technical layer.
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const open=card?.querySelector('.analysis-plan-summary [data-analysis-action="view-plan"]'); const versions=card?.querySelector('details.analysis-plan-versions-technical'); return card?.dataset.coverageManifestDigest===${JSON.stringify(manifest.digest)} && card.dataset.analysisUnits===${JSON.stringify(String(SAMPLE1_UNITS))} && card.dataset.planEnvelopeDigest===${JSON.stringify(prepared.planEnvelope.digest)} && card.querySelector('.analysis-plan-summary .task-plan-summary-line')?.textContent===${JSON.stringify(`计划：首次基线分析 · 全书 · ${SAMPLE1_UNITS} 个阅读范围 · 任务输入修订版 r1 · 计划版本 1`)} && open instanceof HTMLButtonElement && !open.disabled && open.textContent==='查看计划并开始' && open.dataset.taskPlanOpen==='baseline-analysis' && !card.querySelector('[data-manifest-unit], [data-reuse-plan-unit], .analysis-plan-boundary') && !card.querySelector('[data-analysis-action="authorize"], [data-analysis-action="prepare"]') && versions instanceof HTMLDetailsElement && !versions.open && versions.querySelector('.analysis-plan-versions [data-plan-version-ordinal="1"][data-plan-version-state="current"]')!==null && ${AUTHORIZE_LABELED_BUTTONS}===0; })()`, 'prepared-preview');

    at('analysis-plan-drawer');
    // The plan the preparation froze, in the drawer beside ②A: 精简 first, then 完整, whose 查看技术详情
    // holds each identity the card used to list, exactly as the plan froze it (Issue #418, S72 D5-D7).
    const bookName = 'J-04 sample1 基线稿件分析';
    const wholeCount = groupedCount(manifest.totalGraphemes);
    const firstDrawer = await drawerShowing(renderer, prepared.taskIntent.taskIntentId, 'ready', 'analysis-drawer-opened');
    requireJourney(firstDrawer?.hidden === false && firstDrawer.kind === 'baseline-analysis' && firstDrawer.version === '1' && firstDrawer.mode === 'compact' &&
      firstDrawer.stored === null && firstDrawer.pill === '尚未开始' && firstDrawer.sentence === '为这本书做基线分析：梗概、人物与名称、事件、关系、设定和各章' &&
      JSON.stringify(firstDrawer.chips) === JSON.stringify({ book: bookName, position: '全书', selected: `已选 ${wholeCount} 字`, revision: '任务输入修订版 r1', procedure: '工序「基线分析」' }) &&
      firstDrawer.saved === null && firstDrawer.drift === null &&
      JSON.stringify(firstDrawer.rows) === JSON.stringify({
        处理: `《${bookName}》全书 · ${wholeCount} 字 · ${SAMPLE1_UNITS} 个阅读范围`,
        发送: '本环境不连接模型服务，不会发送任何内容 · 用量：不发送，没有模型用量 · 未设置任务预算上限',
        会得到: '一份基线分析：梗概、人物与名称、事件、关系、设定和各章；这次运行的运行报告',
        不会: '不会直接修改稿件 · 不导出或发布 · 不存里程碑版本 · 不读这本书以外的内容 · 不作事实判定',
        中途: '预计无需中途参与',
      }) && firstDrawer.actions === 0 && firstDrawer.footer === '计划说明，不是运行授权', 'analysis-drawer-compact', firstDrawer);
    await reviewAction(renderer, '#task-drawer [data-task-drawer-control="mode-full"]', 'analysis-drawer-full');
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskDrawerMode==='full' && document.querySelectorAll('#task-drawer [data-task-plan-section]').length===6`, 'analysis-drawer-full-mode');
    const firstFull = await readDrawer(renderer);
    const firstTechnical = firstFull?.technical ?? {};
    requireJourney(firstFull?.stored === 'full' &&
      JSON.stringify(firstFull.steps) === JSON.stringify(['逐章读取 → 各章摘要', '汇总全书 → 梗概与人物、事件、关系、设定', '核对与抽检 → 可信程度说明']) &&
      firstFull.terms['提供方'] === 'DeepSeek 开放平台 · deepseek-v4-pro' &&
      firstFull.terms['提供方状态'] === '远程模型服务被拒绝（development-ci · v1：0 次实时传输）；由 AI7 本地确定性模型适配器执行' &&
      firstFull.terms['用量上限'] === '不发送，没有模型用量' && firstFull.terms['预算上限'] === '未设置任务预算上限' && firstFull.terms['账户限额'] === '未知 · 提供方未返回' &&
      JSON.stringify(firstFull.columns) === JSON.stringify(['运行中 AI7 可以自己调整', '这些一变就先停下来问你']) &&
      JSON.stringify(firstFull.adaptable) === JSON.stringify([SAFE_RETRY_ADAPTATION]) && JSON.stringify(firstFull.askFirst) === JSON.stringify(LOCKED_BOUNDARY) &&
      firstTechnical.goal === TASK_GOAL && firstTechnical.mode === '首次基线分析 · first-baseline' &&
      firstTechnical['coverage-manifest'] === `${SAMPLE1_UNITS} 个分析单元 · 1 个结构段 · ${SAMPLE1_BLOCKS} 个内容块 · ${manifest.totalGraphemes} 字素 · ${manifest.digest}` &&
      firstTechnical['manifest-units'] === manifest.units.map((unit) => `单元 ${unit.ordinal} · 内容块 ${unit.startPosition}–${unit.endPosition} · ${unit.graphemes} 字素`).join('；') &&
      firstTechnical['execution-route'] === `ai7-local-deterministic · ai7-deterministic-fixture · 夹具 ${FIXTURE_IDENTITY} · ${fixtureDigest}` &&
      firstTechnical['provider-binding'] === 'deepseek-open-platform · deepseek-v4-pro · adapter r1 · config r1 · 凭据 missing' &&
      firstTechnical['credential-reference'] === readyConnection.credentialReference &&
      firstTechnical['provider-processing'] === 'development-ci · v1 · 拒绝 · 0 次实时传输' &&
      firstTechnical['prompt-contract'] === PROMPT_CONTRACT_DIGEST && firstTechnical['plan-envelope'] === prepared.planEnvelope.digest &&
      firstTechnical['material-fields'] === PLAN_MATERIAL_FIELDS.join('、') &&
      firstTechnical['plan-versions'] === `版本 1 · current · ${prepared.planEnvelope.digest}` &&
      firstTechnical['not-do'] === prepared.namedNonEffects.join('；') &&
      firstTechnical['selected-range'] === undefined && firstTechnical['reuse-plan'] === undefined,
    'analysis-drawer-full-plan', firstFull);

    at('analysis-bar-ready');
    // Issue #420 (S74a): the drawer's footer is the authorization bar. The deterministic route sends nothing,
    // so the credential this Book holds — `missing` since the model setup above — is not needed: 开始任务 is
    // offered. The summary names the plan version, and the word 授权 is on no button anywhere.
    requireJourney(missingConnection?.credentialOperationState === 'missing' && firstFull?.bar?.state === 'ready' && firstFull.bar.start === 'ready' &&
      firstFull.bar.summary === `《${bookName}》 · 全书 · 计划版本 1 · 主编辑角色 · 未设置任务预算上限 · 产出：一份基线分析 · 不改稿` &&
      firstFull.bar.statement === BAR_STATEMENT && firstFull.bar.note === null && firstFull.bar.status === null && firstFull.bar.refusal === null &&
      barActions(firstFull) === 'start:开始任务:enabled|revise:返回修改:disabled|save-draft:保存草稿:enabled' &&
      firstFull.bar.actions[1]?.reason === '随计划编辑提供', 'analysis-bar-ready', firstFull?.bar);
    await assertRenderer(renderer, `${AUTHORIZE_LABELED_BUTTONS}===0`, 'analysis-bar-no-authorize-label');

    at('authorize-dispatch');
    cancellation.throwIfRequested();
    // Synchronized delta with Issue #420 (S74a A2): one activation of the bar's 开始任务 records the
    // authorization and the Run and hands it to the one slot; ②A beside the drawer follows the Run.
    await startFromBar(renderer, 'authorize');
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
    // Synchronized delta with Issue #418: the drawer beside ②A followed the Task to its end, reading the
    // plan again as the Run moved, and now states the authorization and the Run it bound.
    const settledDrawer = await drawerShowing(renderer, prepared.taskIntent.taskIntentId, 'settled', 'analysis-drawer-settled');
    requireJourney(settledDrawer?.pill === '已完成' && settledDrawer.version === '1' &&
      settledDrawer.technical.authorization?.startsWith(`${settled.authorization.authorizationId} · standard-direct · standard-direct-dispatch · `) &&
      settledDrawer.technical['run-record']?.startsWith(`${settled.run.runRecordId} · completed-with-gaps · `) &&
      settledDrawer.technical['plan-versions'] === `版本 1 · bound · ${prepared.planEnvelope.digest}`, 'analysis-drawer-settled-plan', settledDrawer);
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
        !card.querySelector('.analysis-conflict-list, .analysis-unresolved-list, [data-analysis-conflict-kind]') &&
        card.querySelector('[data-analysis-axis="assurance"] button[data-analysis-action="open-review"]')?.textContent==='打开审阅' &&
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

    // Synchronized delta (#406), V2-UX-ANALYSIS-025 and V2-UX-LAYER-008: the settled revision reads as
    // ②A's seven tabs with 梗概 selected, four sentences in editorial Chinese under their fixed
    // headings, and the contradictions counted and pointed at 审阅 rather than listed. The decision
    // layer of 梗概 carries no block identifier, digest or unit name; the technical layer, closed, still
    // carries every exact value the assertion above pins. It stays inside `result-set-revision`:
    // reading the settled revision's own surface is what that stage already is.
    // Synchronized delta with Issue #417 (V2-UX-REV-011): the leads are listed in neither layer any more —
    // 审阅's 情节逻辑与前后一致 makes each one a 批注 — and ②A keeps their counts: the card's
    // data-conflict-count, the 可信程度 sentence, the technical assurance row, and a working 打开审阅.
    const leads = revision.assurance.unresolvedConflictCount + revision.assurance.crossUnitFindingCount;
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const tabs=Array.from(card?.querySelectorAll('[role="tablist"] > [role="tab"]')??[]);
      const panels=Array.from(card?.querySelectorAll('[role="tabpanel"]')??[]);
      if(JSON.stringify(tabs.map((tab)=>tab.textContent))!==${JSON.stringify(JSON.stringify(ANALYSIS_TAB_LABELS))} || panels.length!==7) return false;
      if(tabs.filter((tab)=>tab.getAttribute('aria-selected')==='true').length!==1 || tabs[0].getAttribute('aria-selected')!=='true' || card.dataset.analysisTab!=='synopsis') return false;
      if(panels.filter((panel)=>!panel.hidden).length!==1 || panels[0].hidden || tabs.some((tab,index)=>tab.getAttribute('aria-controls')!==panels[index].id || (tab.tabIndex===0)!==(index===0))) return false;
      const synopsis=card.querySelector('[data-analysis-panel="synopsis"]');
      const axes=Array.from(synopsis.querySelectorAll('[data-analysis-axis]'));
      if(JSON.stringify(axes.map((axis)=>axis.querySelector('h5')?.textContent))!==${JSON.stringify(JSON.stringify(ANALYSIS_SENTENCE_HEADINGS))}) return false;
      const sentence=(axis)=>axes.find((item)=>item.dataset.analysisAxis===axis)?.querySelector('.analysis-axis-sentence')?.textContent??'';
      const technical=synopsis.querySelector('details.analysis-revision-technical');
      if(!(technical instanceof HTMLDetailsElement) || technical.open) return false;
      const decision=synopsis.cloneNode(true);
      for(const details of decision.querySelectorAll('details')) details.remove();
      return sentence('coverage')===${JSON.stringify(`全稿分成 ${revision.coverage.unitsTotal} 个阅读范围，已读完 ${revision.coverage.unitsClosed} 个；还有 ${revision.coverage.gapCount} 个没有读成，在「各章」里标为尚未分析。`)} &&
        sentence('freshness')===${JSON.stringify(`这份分析读的是 ${revision.manuscriptPin.revisionLabel}，稿件此后没有改动。`)} &&
        sentence('reducer-closure').includes('没有读成的范围不在其中') &&
        sentence('assurance').startsWith(${JSON.stringify(ASSURANCE_STATEMENT)}) &&
        sentence('assurance').includes(${JSON.stringify(`另有 ${leads} 处前后不一致的线索、${revision.assurance.unresolvedItemCount} 项未决事项，归入审阅的「情节逻辑与前后一致」`)}) &&
        axes.every((axis)=>axis.querySelector('.analysis-axis-next')?.textContent.startsWith('下一步：')) &&
        decision.querySelector('.analysis-synopsis')?.textContent===${JSON.stringify(revision.synthesis.synopsis)} &&
        !/blk_|[0-9a-f]{64}/u.test(decision.textContent) && !/单元|Revision|归约|reducer|摘要/u.test(axes.map((axis)=>axis.textContent).join('')) &&
        !decision.querySelector('.analysis-conflict-list, .analysis-unresolved-list, [data-analysis-conflict-kind]') &&
        !technical.querySelector('.analysis-conflict-list, .analysis-unresolved-list, [data-analysis-conflict-kind]') &&
        technical.textContent.includes(${JSON.stringify(`${revision.assurance.unresolvedConflictCount} 处未解决冲突 · ${revision.assurance.unresolvedItemCount} 项未解决事项`)}) &&
        axes.find((axis)=>axis.dataset.analysisAxis==='assurance')?.querySelector('button[data-analysis-action="open-review"]')?.textContent==='打开审阅' &&
        technical.textContent.includes(${JSON.stringify(revision.digest)}) && technical.textContent.includes(${JSON.stringify(revision.coverageManifestDigest)}) &&
        card.querySelectorAll('[data-analysis-panel="chapters"] [data-analysis-unit] > h5').length===${SAMPLE1_UNITS} &&
        card.querySelector('[data-analysis-panel="chapters"] [data-analysis-unit="2"] .attention-note')?.textContent.startsWith('尚未分析：') &&
        card.querySelectorAll('[data-analysis-panel="events"] .analysis-event-list > li').length===${revision.synthesis.events.length || 1} &&
        card.querySelectorAll('[data-analysis-panel="relationships"] .analysis-relationship-list > li').length===${revision.synthesis.relationships.length || 1} &&
        card.querySelectorAll('[data-analysis-panel="settings"] .analysis-setting-list > li').length===${revision.synthesis.settingClaims.length || 1};
    })()`, 'analysis-decision-layer-surface');

    // A tab is chosen with the keyboard as a tab list is (arrow keys, one tab stop), and the choice
    // survives the card's next re-render; the first tab is restored so the rest of the Journey reads
    // the card exactly as an editor who never touched the tabs would.
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const first=card?.querySelector('[role="tab"][data-analysis-tab="synopsis"]');
      if(!(first instanceof HTMLButtonElement)) return false;
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
      const second=card.querySelector('[role="tab"][data-analysis-tab="entities"]');
      const moved=document.activeElement===second && second.getAttribute('aria-selected')==='true' && card.dataset.analysisTab==='entities' &&
        !card.querySelector('[data-analysis-panel="entities"]').hidden && card.querySelector('[data-analysis-panel="synopsis"]').hidden;
      second.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
      return moved && document.activeElement===first && card.dataset.analysisTab==='synopsis';
    })()`, 'analysis-tabs-keyboard');

    // V2-UX-LAYER-006 and 008 on the card's provenance lists (#333). The Decision Layer reads an entity's
    // provenance as its units and a block count, so no identifier wall interrupts the list; the exact
    // ranges are still carried, unabridged, in the one disclosure the list closes with. Synchronized
    // delta with Issue #417 (V2-UX-REV-011): the conflict list this assertion also read is gone from ②A —
    // each conflict is a lead 批注 of 审阅's 情节逻辑与前后一致 now, whose body names its kind in the
    // same CONFLICT_KIND_LABELS words — so only the entity half remains here.
    const provenanceEntity = revision.synthesis.entities.find((entity) => entity.sourceRanges.length > 0);
    const provenanceBlockId = provenanceEntity?.sourceRanges[0]?.blockId;
    const provenanceUnits = [...new Set(provenanceEntity?.unitOrdinals ?? [])].sort((left, right) => left - right).join('、');
    const provenanceBlocks = new Set((provenanceEntity?.sourceRanges ?? []).map((range) => range.blockId)).size;
    requireJourney(provenanceEntity !== undefined && provenanceUnits.length > 0 && revision.conflicts.length > 0,
      'provenance-projection', { entity: provenanceEntity, conflict: revision.conflicts[0] });
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const entityList=card?.querySelector('[data-analysis-panel="entities"] .analysis-entity-list');
      const entity=Array.from(entityList?.children??[]).find((item)=>item.textContent.startsWith(${JSON.stringify(`${provenanceEntity.name}（`)}));
      const entityExact=entityList?.nextElementSibling;
      if(!(entity instanceof HTMLElement) || !(entityExact instanceof HTMLDetailsElement)) return false;
      return entity.querySelector('span')?.textContent.trimEnd().endsWith(${JSON.stringify(`）· 来自单元 ${provenanceUnits} · ${provenanceBlocks} 个内容块`)}) &&
        !entity.textContent.includes('person') && entity.textContent.includes('（') &&
        !entityList.textContent.includes('blk_') && !entityExact.open &&
        entityExact.querySelector('dl > dd.technical-identity')!==null &&
        entityExact.textContent.includes(${JSON.stringify(provenanceBlockId)}) &&
        !card.querySelector('.analysis-conflict-list, [data-analysis-conflict-kind]');
    })()`, 'analysis-provenance-surface');

    // V2-UX-LAYER-005, asserted where the rule is hardest to keep: the settled result set is the
    // longest thing this workbench ever renders, and the workbench's own way out must survive it. The
    // three actions are read by label, enabled state and container — never by document position — and
    // the region is asserted to be genuinely sticky rather than merely to carry the class.
    await assertRenderer(renderer, `(() => {
      const region=document.querySelector('.book-analysis .workbench-actions');
      if(!region) return false;
      const buttons=Array.from(region.querySelectorAll(':scope > button'));
      return JSON.stringify(buttons.map((button)=>button.textContent))===JSON.stringify(${JSON.stringify(ANALYSIS_DESTINATION_ACTIONS)}) &&
        buttons.every((button)=>!button.disabled) &&
        getComputedStyle(region).position==='sticky';
    })()`, 'workbench-actions-persistent');

    // The Run Liveness Signal, asserted where this Journey is deterministic: after settlement. While
    // the card is `executing` the runner may see the signal line, but a deterministic Run settles too
    // fast to require catching it, so the pass never depends on that. What must hold once the Run has
    // stopped is that the signal ended with it, that no status toast still claims the Run entered the
    // scheduler, and that the Run Record answers "when" in local time with the exact instant beside it.
    // It stays inside the `result-set-revision` stage: `e2e/controller.mjs` pins this Journey's stage
    // names, and reading the settled Run's own surface is what that stage already is.
    const lastTransition = settled.run.transitions[settled.run.transitions.length - 1];
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      if(!card) return false;
      const row=card.querySelector('[data-run-last-transition-at]');
      const exact=row?.querySelector('.technical-identity');
      if(!(row instanceof HTMLElement) || !(exact instanceof HTMLElement)) return false;
      const decision=row.textContent.replace(exact.textContent,'');
      return !card.querySelector('.analysis-progress') &&
        !(document.querySelector('#persistence-status')?.textContent ?? '').includes('已进入调度器') &&
        row.dataset.runLastTransitionAt===${JSON.stringify(lastTransition.recordedAt)} &&
        exact.textContent===${JSON.stringify(lastTransition.recordedAt)} &&
        decision!==${JSON.stringify(lastTransition.recordedAt)} &&
        /^\\d{4}\\/\\d{2}\\/\\d{2}\\s\\d{2}:\\d{2}:\\d{2}\\s·\\s${lastTransition.state}$/u.test(decision);
    })()`, 'run-liveness-settled-surface');

    // V2-UX-LAYER-004 on the Run timeline, asserted on both layers as V2-UX-LAYER-008 requires: every
    // entry reads as local date and time, and the exact instant it was recorded at is still carried
    // beside it in the technical layer. Transition entries are filtered by kind and stay in sequence
    // order, because the timeline sorts by recorded instant and breaks ties by sequence.
    await assertRenderer(renderer, `(() => {
      const items=Array.from(document.querySelectorAll('.analysis-timeline [data-timeline-kind="transition"]'));
      const exact=${JSON.stringify(settled.run.transitions.map((transition) => transition.recordedAt))};
      if(items.length!==exact.length) return false;
      return items.every((item,index)=>{
        const instant=item.querySelector('.technical-identity');
        if(!(instant instanceof HTMLElement) || instant.textContent!==exact[index]) return false;
        const decision=item.textContent.replace(instant.textContent,'');
        return /\\d{4}\\/\\d{2}\\/\\d{2}\\s\\d{2}:\\d{2}:\\d{2}/u.test(decision) && !decision.includes(exact[index]);
      });
    })()`, 'run-timeline-local-time-with-exact-instant');

    at('analysis-bar-started');
    // Issue #420 (S74a, AUTH-007): once started, the bar is the Run's state — `已完成` now — with the way to
    // the Run's surface and nothing that would start it again; the status line never claims a state the
    // Run has left (V2-UX-LIVE-004).
    const startedDrawer = await drawerShowing(renderer, prepared.taskIntent.taskIntentId, 'settled', 'analysis-bar-started-drawer');
    requireJourney(startedDrawer?.bar?.state === 'started' && startedDrawer.bar.start === 'started' && startedDrawer.bar.status === '已完成' &&
      startedDrawer.bar.statement === null && barActions(startedDrawer) === 'run-link:查看运行:enabled' && startedDrawer.actions === 0,
    'analysis-bar-started', startedDrawer?.bar);
    await assertRenderer(renderer, `!['正在开始任务…','已进入调度器'].some((text)=>(document.querySelector('#persistence-status')?.textContent??'').includes(text))`, 'analysis-bar-status-settled');

    // Synchronized delta (#274): after the unit stage, the same Run asked the model once more about
    // the whole book and recorded typed cross-unit findings beside the three deterministic kinds. The
    // Overview's rendering of them is S42b, so everything asserted here is at the projection level.
    at('cross-unit-reduction');
    cancellation.throwIfRequested();
    requireJourney(revision.crossUnitReduction?.state === 'closed' && revision.crossUnitReduction?.reason === null &&
      DIGEST_PATTERN.test(revision.crossUnitReduction?.requestDigest) &&
      revision.crossUnitReduction?.usage?.inputTokens > 0 && revision.crossUnitReduction?.usage?.outputTokens > 0 &&
      revision.crossUnitFindings?.length === revision.crossUnitReduction.findingCount && revision.crossUnitFindings.length > 0 &&
      revision.assurance?.crossUnitFindingCount === revision.crossUnitFindings.length,
    'cross-unit-reduction-closed', { crossUnitReduction: revision.crossUnitReduction, findingCount: revision.crossUnitFindings?.length });
    // The stage is the fourth of five, closed over the seven units that closed, and the deterministic
    // pass before it kept its three kinds in their order.
    requireJourney(JSON.stringify(revision.reducerClosure.stages.map((stage) => stage.stage)) === JSON.stringify(REDUCER_STAGES) &&
      sameRecord(revision.reducerClosure.stages[3], { stage: 'cross-unit-reduction', state: 'closed', inputCount: SAMPLE1_UNITS - 1 }) &&
      JSON.stringify(revision.conflicts.map((conflict) => conflict.kind)) === JSON.stringify(['unit-reported', 'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence']) &&
      revision.assurance.unresolvedConflictCount === revision.conflicts.length,
    'cross-unit-reduction-stage', { stages: revision.reducerClosure.stages, conflictKinds: revision.conflicts.map((conflict) => conflict.kind) });
    // Every finding is one of the four kinds, names two distinct units of this manifest, and cites only
    // blocks those units own — the fixture wrote positions, and the Run resolved this import's identities.
    const crossUnitUnits = new Set();
    requireJourney(revision.crossUnitFindings.every((finding) => {
      if (!CROSS_UNIT_FINDING_KINDS.includes(finding.kind) || typeof finding.description !== 'string' || finding.description.length === 0) return false;
      if (!['high', 'medium', 'low'].includes(finding.confidence)) return false;
      const sideUnits = finding.sides.map((side) => side.unitOrdinal);
      if (finding.sides.length < 2 || new Set(sideUnits).size < 2) return false;
      if (JSON.stringify(finding.unitOrdinals) !== JSON.stringify(Array.from(new Set(sideUnits)).sort((left, right) => left - right))) return false;
      for (const side of finding.sides) {
        const unit = manifest.units[side.unitOrdinal - 1];
        if (unit === undefined || !revision.units.some((item) => item.unitOrdinal === side.unitOrdinal && item.state === 'closed')) return false;
        if (side.sourceRanges.length === 0 || !side.sourceRanges.every((range) => unit.blockIds.includes(range.blockId))) return false;
        crossUnitUnits.add(side.unitOrdinal);
      }
      return true;
    }) && crossUnitUnits.size >= 2 && !revision.crossUnitFindings.some((finding) => JSON.stringify(finding).includes('{{unit:')),
    'cross-unit-finding-lineage', { findings: revision.crossUnitFindings });
    // A model-driven finding never joined the conflict list and never touched a unit result: the two
    // readings stay separate records of separate passes.
    requireJourney(revision.conflicts.every((conflict) => !CROSS_UNIT_FINDING_KINDS.includes(conflict.kind)) &&
      revision.units.every((unit) => !JSON.stringify(unit).includes('crossUnit')), 'cross-unit-findings-are-not-conflicts');

    // Synchronized delta (#275): after the reduction the same Run re-read each of its findings against
    // the blocks of the unit that finding is anchored in, and recorded a disposition for each. The
    // Overview's rendering of them is S42b, so everything asserted here is at the projection level.
    at('assurance-sampling');
    cancellation.throwIfRequested();
    // The findings as they stand before the sampling component is considered at all; the sample must
    // leave them byte-identical, which is ADR 0066's "never edits, deletes, or reorders findings".
    const findingsBeforeSampling = JSON.stringify(revision.crossUnitFindings);
    const assuranceSample = revision.assuranceSample;
    requireJourney(assuranceSample?.state === 'closed' && assuranceSample?.reason === null && DIGEST_PATTERN.test(assuranceSample?.seed) &&
      assuranceSample?.size === revision.crossUnitFindings.length && assuranceSample?.candidateCount === revision.crossUnitFindings.length &&
      assuranceSample?.usage?.inputTokens > 0 && assuranceSample?.usage?.outputTokens > 0 &&
      sameRecord(revision.reducerClosure.stages[5], { stage: 'assurance-sampling', state: 'closed', inputCount: assuranceSample.candidateCount }),
      'assurance-sample-closed', { assuranceSample, stages: revision.reducerClosure.stages });

    // The seed is reproducible from content alone — the manifest's unit content digests in ordinal
    // order and the revision's own findings at their positions, never a minted identity or a `ref`
    // (revision 3). An editor holding only what the revision discloses can redraw the identical sample
    // and check that this is the set that was asked about.
    const unitDigests = manifest.units.map((unit) => unit.digest);
    const candidates = revision.crossUnitFindings.map((finding, index) => ({
      position: index + 1, unitOrdinal: finding.sides[0].unitOrdinal, tier: finding.confidence, text: finding.description,
    }));
    const findingsDigest = sha256Hex(canonicalJson(candidates));
    requireJourney(assuranceSample.seed === sha256Hex(canonicalJson({ unitDigests, findingsDigest })) &&
      !JSON.stringify(candidates).includes('blk_'),
      'assurance-sample-seed-redrawn', { seed: assuranceSample.seed, unitDigests, findingsDigest });

    // Exact sample1 is one structural section, so the stratum is one; every section holding a finding
    // contributes at least one disposition, and here that is the whole sample.
    const sections = new Set(revision.crossUnitFindings.map((finding) => manifest.units[finding.sides[0].unitOrdinal - 1].sectionOrdinal));
    requireJourney(assuranceSample.strata.length === sections.size &&
      assuranceSample.strata.every((stratum) => sections.has(stratum.sectionOrdinal) && stratum.sampled >= 1 && stratum.sampled <= stratum.candidates) &&
      assuranceSample.strata.reduce((total, stratum) => total + stratum.sampled, 0) === assuranceSample.size &&
      [...sections].every((sectionOrdinal) => assuranceSample.dispositions.some((entry) =>
        manifest.units[entry.unitOrdinal - 1].sectionOrdinal === sectionOrdinal)),
      'assurance-sample-strata', { strata: assuranceSample.strata, sections: [...sections] });

    // One disposition per drawn finding, each naming its finding by `ref` at that finding's own anchor
    // unit and tier, and exactly one of them is the fixture-driven `需降级` with a stated reason.
    const downgraded = assuranceSample.dispositions.filter((entry) => entry.disposition === '需降级');
    requireJourney(assuranceSample.dispositions.length === assuranceSample.size &&
      new Set(assuranceSample.dispositions.map((entry) => entry.ref)).size === assuranceSample.size &&
      assuranceSample.dispositions.every((entry) => {
        const finding = revision.crossUnitFindings[Number(entry.ref)];
        if (finding === undefined || !['成立', '需降级', '应删除'].includes(entry.disposition)) return false;
        if (typeof entry.reason !== 'string' || entry.reason.length === 0) return false;
        return entry.unitOrdinal === finding.sides[0].unitOrdinal && entry.tier === finding.confidence;
      }) &&
      downgraded.length === 1 && downgraded[0].reason.length > 0 &&
      revision.crossUnitFindings[Number(downgraded[0].ref)]?.kind === 'continuity-break',
      'assurance-sample-dispositions', { dispositions: assuranceSample.dispositions });

    // Estimated precision per tier of the sampled set: upheld over sampled, `成立` only, two decimals.
    requireJourney(assuranceSample.precision.length > 0 &&
      assuranceSample.precision.every((entry) => {
        const ofTier = assuranceSample.dispositions.filter((disposition) => disposition.tier === entry.tier);
        const upheld = ofTier.filter((disposition) => disposition.disposition === '成立').length;
        return entry.sampled === ofTier.length && entry.upheld === upheld &&
          entry.estimate === Math.round((upheld / ofTier.length) * 100) / 100;
      }) &&
      assuranceSample.precision.reduce((total, entry) => total + entry.sampled, 0) === assuranceSample.size &&
      revision.assurance.sampledPrecision?.size === assuranceSample.size &&
      revision.assurance.sampledPrecision?.upheld === assuranceSample.dispositions.filter((entry) => entry.disposition === '成立').length &&
      revision.assurance.label.includes(`· 抽样 ${assuranceSample.size} 条 · 估计精度 ${revision.assurance.sampledPrecision.estimate.toFixed(2)}`),
      'assurance-sample-precision', { precision: assuranceSample.precision, sampledPrecision: revision.assurance.sampledPrecision, label: revision.assurance.label });

    // No finding was edited, deleted, reordered, or re-ranked by a disposition, and the axis state the
    // reducers gave this Run is untouched: a sample is evidence about findings, never a verdict.
    const revisionAgain = (await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`)).resultSetRevision;
    requireJourney(JSON.stringify(revisionAgain.crossUnitFindings) === findingsBeforeSampling &&
      revisionAgain.assurance.state === 'qualified-with-open-conflicts' &&
      revisionAgain.assurance.crossUnitFindingCount === revision.crossUnitFindings.length &&
      revisionAgain.assurance.unresolvedConflictCount === revision.conflicts.length &&
      !JSON.stringify(revisionAgain.crossUnitFindings).includes('disposition') &&
      revisionAgain.units.every((unit) => !JSON.stringify(unit).includes('assurance')),
      'assurance-sample-edits-nothing', { crossUnitFindings: revisionAgain.crossUnitFindings });

    // Synchronized delta (#276): the same Run left one durable Run Report inside its Task Outcome.
    // Opening it from the Overview and the Task Outcome is S44b, so everything asserted here is at the
    // projection level. No request-count pin moves: the reflection turn dispatches after the revision
    // is persisted, so `revision.usage.requests` stays at SAMPLE1_UNITS + 1 + SAMPLING_TURNS.
    at('run-report');
    cancellation.throwIfRequested();
    const report = settled.taskOutcome?.report;
    requireJourney(report?.schema === 'ai7.analysis.run-report/1' && settled.taskOutcome?.reportAbsentReason === null &&
      report.runRecordId === settled.run.runRecordId && report.taskIntentId === settled.taskIntent.taskIntentId &&
      report.attemptId === attempt.attemptId && report.resultSetRevisionId === revision.revisionId &&
      report.classification === 'completed-with-gaps' && typeof report.recordedAt === 'string',
      'run-report-bound', { report: report === undefined ? null : { ...report, unitRows: undefined } });

    // The four declared stages, each with the instants the execution owner itself took. Nothing here
    // comes from the Harness Session Ledger, which is the boundary this slice's stop condition draws.
    requireJourney(canonicalJson(report.stages.map((stage) => stage.stage)) ===
        canonicalJson(['units', 'cross-unit-reduction', 'assurance-sampling', 'reduction']) &&
      canonicalJson(report.stages.map((stage) => stage.state)) ===
        canonicalJson(['closed-with-gaps', 'closed', 'closed', 'closed']) &&
      report.stages.every((stage) => Number.isInteger(stage.wallMs) && stage.wallMs >= 0 &&
        typeof stage.startedAt === 'string' && typeof stage.settledAt === 'string'),
      'run-report-stages', { stages: report.stages });

    // Usage per stage reconciles with the revision field by field, and the reflection's own sits beside
    // it rather than inside it: the revision was persisted before that turn was ever dispatched.
    const summedUsage = ['units', 'cross-unit-reduction', 'assurance-sampling'].reduce((total, stage) => ({
      requests: total.requests + report.usagePerStage[stage].requests,
      inputTokens: total.inputTokens + report.usagePerStage[stage].inputTokens,
      outputTokens: total.outputTokens + report.usagePerStage[stage].outputTokens,
    }), { requests: 0, inputTokens: 0, outputTokens: 0 });
    requireJourney(sameRecord(summedUsage, {
      requests: revision.usage.requests, inputTokens: revision.usage.inputTokens, outputTokens: revision.usage.outputTokens,
    }) &&
      revision.usage.requests === SAMPLE1_UNITS + 1 + SAMPLING_TURNS &&
      report.usagePerStage.units.requests === SAMPLE1_UNITS &&
      report.usagePerStage['cross-unit-reduction'].requests === 1 &&
      report.usagePerStage['assurance-sampling'].requests === SAMPLING_TURNS &&
      report.usagePerStage['run-report-reflection'].requests === 1,
      'run-report-usage-reconciles', { usagePerStage: report.usagePerStage, revisionUsage: revision.usage });

    // The unit accounting is the revision's own coverage and lineage, counted rather than restated.
    const reusedUnits = revision.lineage.filter((entry) => entry.kind === 'reused').length;
    requireJourney(sameRecord(report.units, {
      submitted: SAMPLE1_UNITS, reused: reusedUnits, recomputed: SAMPLE1_UNITS - reusedUnits,
      gaps: revision.gaps.length, retried: 0,
    }) &&
      report.units.reused === revision.coverage.unitsReused && report.units.gaps === revision.coverage.gapCount &&
      report.unitRows.length === revision.coverage.unitsTotal &&
      canonicalJson(report.unitRows.map((row) => [row.unitOrdinal, row.state, row.lineage])) ===
        canonicalJson(revision.units.map((unit, index) => [unit.unitOrdinal, unit.state, revision.lineage[index].kind])),
      'run-report-unit-accounting', { units: report.units, coverage: revision.coverage, unitRows: report.unitRows });

    // Every gap the revision carries appears exactly once, named by its stage and its classified code.
    requireJourney(canonicalJson(report.failures) ===
      canonicalJson(revision.gaps.map((gap) => ({ stage: 'units', code: gap.code, reason: gap.reason }))),
      'run-report-failures', { failures: report.failures, gaps: revision.gaps });

    // The assurance section is a copy of the revision's own sample, never a second draw.
    requireJourney(report.assurance.state === assuranceSample.state && report.assurance.seed === assuranceSample.seed &&
      report.assurance.size === assuranceSample.size && report.assurance.candidateCount === assuranceSample.candidateCount &&
      canonicalJson(report.assurance.precision) === canonicalJson(assuranceSample.precision) &&
      report.assurance.upheld === assuranceSample.dispositions.filter((entry) => entry.disposition === '成立').length,
      'run-report-assurance', { assurance: report.assurance, sample: assuranceSample });

    // The `if redone` list closed from its fixture entry, and names no block, no finding, and no
    // quotation — the message it answered carried none of the three, only counts and codes.
    requireJourney(report.ifRedone.state === 'closed' && report.ifRedone.reason === null &&
      report.ifRedone.items.length >= 1 && report.ifRedone.items.length <= 10 &&
      report.ifRedone.items.every((item) => typeof item.suggestion === 'string' && item.suggestion.length > 0 &&
        typeof item.basis === 'string' && item.basis.length > 0 &&
        !/blk_[0-9a-f]{24}/u.test(`${item.suggestion}${item.basis}`) &&
        revision.crossUnitFindings.every((finding) =>
          !item.suggestion.includes(finding.description) && !item.basis.includes(finding.description))),
      'run-report-if-redone', { ifRedone: report.ifRedone });

    // The report's own digest is over its own canonical JSON, wall times and instants included. The
    // accounting digest beside it is over the stable part alone — and the proof that the clocks are
    // out of it is that the reflection closed at all: the fixture entry was keyed by a digest minted
    // from a different Run, on a different host, whose wall times were not these.
    const { reportDigest, ...reportBody } = report;
    const reportJson = canonicalJson(reportBody);
    requireJourney(DIGEST_PATTERN.test(reportDigest) && reportDigest === sha256Hex(reportJson) &&
      DIGEST_PATTERN.test(report.accountingDigest) && report.accountingDigest !== reportDigest &&
      reportJson.includes('"wallMs"') && reportJson.includes('"startedAt"') && reportJson.includes('"settledAt"'),
      'run-report-digests', { reportDigest, accountingDigest: report.accountingDigest });

    // Synchronized delta (#406): the report is no longer readable only through the service. The Task
    // Outcome opens it under 历史与更新: closed by default, its decision layer in the editor's words —
    // the four stages by name and state, the reading ranges as one sentence of the record's own counts,
    // the sample, the failures, the adjustments and the `if redone` list — and its technical layer, one
    // step further, carrying both digests, the instants, the usage per stage and every per-range row.
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const outcome=card?.querySelector('[data-analysis-panel="history"] .analysis-outcome');
      const opened=outcome?.querySelector(':scope > details.analysis-run-report');
      if(!(opened instanceof HTMLDetailsElement) || opened.open) return false;
      const exact=opened.querySelector(':scope > details.technical-details');
      if(!(exact instanceof HTMLDetailsElement) || exact.open) return false;
      const decision=opened.cloneNode(true);
      for(const details of decision.querySelectorAll('details')) details.remove();
      const stages=Array.from(opened.querySelectorAll('[data-run-report-stage]'));
      return opened.dataset.runReportDigest===${JSON.stringify(reportDigest)} && opened.dataset.runReportRun===${JSON.stringify(report.runRecordId)} &&
        opened.dataset.runReportClassification==='completed-with-gaps' &&
        opened.querySelector(':scope > summary')?.textContent.startsWith('查看运行报告 · 已完成，保留了没读成的部分 · ') &&
        JSON.stringify(stages.map((stage)=>[stage.dataset.runReportStage, stage.dataset.runReportStageState]))===${JSON.stringify(JSON.stringify(report.stages.map((stage) => [stage.stage, stage.state])))} &&
        stages[0].textContent.startsWith('逐个阅读范围分析：完成，有没读成的部分') && stages[1].textContent.startsWith('跨范围比对：完成') &&
        opened.querySelector('.analysis-run-report-units')?.textContent===${JSON.stringify(`共 ${report.units.submitted} 个阅读范围：沿用上一份 ${report.units.reused} 个，重新分析 ${report.units.recomputed} 个，其中 ${report.units.gaps} 个没有读成，${report.units.retried} 个安全重试过。`)} &&
        opened.querySelector('[data-run-report-if-redone]')?.dataset.runReportIfRedone===${JSON.stringify(report.ifRedone.state)} &&
        !/[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-|T\\d{2}:\\d{2}:\\d{2}/u.test(decision.textContent) &&
        exact.textContent.includes(${JSON.stringify(reportDigest)}) && exact.textContent.includes(${JSON.stringify(report.accountingDigest)}) &&
        exact.textContent.includes(${JSON.stringify(report.recordedAt)}) && exact.textContent.includes(${JSON.stringify(report.runRecordId)}) &&
        exact.textContent.includes(${JSON.stringify(`${report.usagePerStage.units.requests} 次模型请求 · 输入 ${report.usagePerStage.units.inputTokens} · 输出 ${report.usagePerStage.units.outputTokens}`)}) &&
        !outcome.querySelector(':scope > p.technical-identity') &&
        outcome.querySelector(':scope > details.technical-details')?.textContent.includes(${JSON.stringify(settled.taskOutcome.outcomeId)});
    })()`, 'run-report-surface');

    at('return-to-range');
    cancellation.throwIfRequested();
    const gapBlockId = revision.gaps[0].blockIds[0];
    await assertRenderer(renderer, `(() => { const button=document.querySelector('[data-analysis-gap-unit="2"] [data-analysis-action="return-to-range"]'); if(!(button instanceof HTMLButtonElement)||button.disabled||button.dataset.analysisBlockId!==${JSON.stringify(gapBlockId)})return false; button.click(); return true; })()`, 'return-to-range-click');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] [data-block-id=${JSON.stringify(gapBlockId)}]')`, 'return-to-range-editor', 120_000);
    // Synchronized delta with Issue #409: the manuscript's position rail marks the range this analysis left
    // unread, on the chapter side of the track, and says why; a Book never analysed shows no such lane.
    await waitFor(renderer, `(() => { const track = document.querySelector('.rail-track'); const gaps = Array.from(track?.querySelectorAll('.rail-gap[data-rail-gap="uncovered"]') ?? []); return track?.dataset.railAnalysed === 'true' && gaps.length === 1 && gaps[0].title.startsWith('分析未覆盖：') && gaps[0].getBoundingClientRect().height >= 3; })()`, 'rail-marks-the-unread-range', 30_000);
    cancellation.throwIfRequested();
    await openAnalysisDestination(renderer, 'return-to-range-back');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'return-to-range-overview');
    const afterReturn = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(afterReturn) === JSON.stringify(settled), 'return-to-range-read-only');

    at('restart-immutable');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'restart-open-book');
    // Synchronized delta with Issue #405: the Book route enters the manuscript now
    // (V2-UX-RET-002); since #406 this card lives on 资料与记录 › 分析, reached from the manuscript.
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'restart-open-book-manuscript');
    await openAnalysisDestination(renderer, 'restart-open-book-to-overview');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'restart-record-visible');
    const restarted = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(restarted) === JSON.stringify(settled), 'restart-record-immutable');
    // Synchronized delta (#276): the Run Report is durable state, not a live computation, so it reads
    // back byte for byte — its own digest included — after the product has been closed and reopened.
    const restartedReport = restarted.taskOutcome?.report;
    requireJourney(restartedReport !== undefined && restartedReport !== null &&
      canonicalJson({ ...restartedReport, reportDigest: undefined }) === reportJson &&
      restartedReport.reportDigest === reportDigest && restarted.taskOutcome?.reportAbsentReason === null,
      'restart-run-report-identical', { reportDigest: restartedReport?.reportDigest, expected: reportDigest });
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
    await startUpdate(renderer, 'sync-current', '同步到当前稿件', 'sync-click');
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
    // Synchronized delta with Issue #418 (S72 D4): the card keeps the reuse plan's counts and digests as its
    // own data and names the plan in one line; the plan unit by unit, the goal and the predecessor it names
    // read in the Task Drawer, which opened in 完整 — the mode chosen before the restart (PLAN-010).
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.planUpdateMode==='sync-current' && card.dataset.planReused==='6' && card.dataset.planRecomputed==='2' && card.dataset.planInvalidated==='2' && card.dataset.planBypassed==='0' && card.dataset.reusePlanDigest===${JSON.stringify(preparedSync.update.reusePlanDigest)} && card.dataset.planEnvelopeDigest===${JSON.stringify(preparedSync.planEnvelope.digest)} && card.dataset.coverageManifestDigest===${JSON.stringify(syncManifest.digest)} && card.querySelector('.analysis-plan-summary .task-plan-summary-line')?.textContent===${JSON.stringify(`计划：同步到当前稿件 · 全书 · 重新分析 2 个阅读范围，沿用 6 个 · 任务输入修订版 ${preparedSync.checkpoint.revisionLabel} · 计划版本 1`)} && card.querySelector('[data-task-plan-open="baseline-analysis"]')?.textContent==='查看计划并开始' && !card.querySelector('[data-analysis-action="authorize"], [data-analysis-action="prepare"]'); })()`, 'sync-plan-preview');
    const syncDrawer = await drawerShowing(renderer, preparedSync.taskIntent.taskIntentId, 'ready', 'sync-drawer');
    requireJourney(syncDrawer?.mode === 'full' && syncDrawer.stored === 'full' && syncDrawer.chips.position === '全书' &&
      syncDrawer.chips.revision === `任务输入修订版 ${preparedSync.checkpoint.revisionLabel}` &&
      syncDrawer.saved === (preparedSync.checkpoint.createdForDirtyJournal ? `已为任务保存修订版 ${preparedSync.checkpoint.revisionLabel}，之后的编辑不影响这项任务。` : null) &&
      syncDrawer.sentence === '把基线分析同步到当前稿件：只重新分析改动过的阅读范围，其余沿用上一份' &&
      syncDrawer.terms['要处理'] === `《${bookName}》全书 · ${groupedCount(syncManifest.totalGraphemes)} 字 · 重新分析 2 个阅读范围，沿用 6 个` &&
      JSON.stringify(syncDrawer.references) === JSON.stringify([`上一份基线分析（第 1 份，读的是 ${revision.manuscriptPin.revisionLabel}）`]) &&
      syncDrawer.steps[0] === '逐章读取（重新读取 2 个阅读范围，沿用 6 个） → 各章摘要' &&
      JSON.stringify(syncDrawer.outcomes) === JSON.stringify(['新的一份基线分析，接在第 1 份之后；之前的每一份原样保留', '这次运行的运行报告']) &&
      syncDrawer.technical.goal === SYNC_GOAL && syncDrawer.technical.predecessor === `Revision 1 · ${revision.revisionId} · ${revision.digest}` &&
      syncDrawer.technical['reuse-plan'] === reusePlanReading(preparedSync.update.reusePlanDigest, syncPlan) &&
      syncDrawer.technical['reuse-plan-predecessors'] === predecessorUnitsReading(syncPlan) &&
      predecessorUnitsReading(syncPlan) === '单元 1 invalidated；单元 2 invalidated；单元 3 reused；单元 4 reused；单元 5 reused；单元 6 reused；单元 7 reused；单元 8 reused' &&
      syncDrawer.technical['plan-envelope'] === preparedSync.planEnvelope.digest && syncDrawer.actions === 0,
    'sync-drawer-plan', syncDrawer);

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
    await startUpdate(renderer, 'reanalyze-range', '重新分析所选范围', 'range-click');
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
    // Synchronized delta with Issue #418 (S72 D4, D5): the plan names the range as the paragraphs it holds;
    // the exact block range and the plan unit by unit read in the drawer's 查看技术详情.
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.planUpdateMode==='reanalyze-range' && card.dataset.planReused==='5' && card.dataset.planRecomputed==='3' && card.dataset.planInvalidated==='1' && card.dataset.planBypassed==='2' && card.querySelector('.analysis-plan-summary .task-plan-summary-line')?.textContent===${JSON.stringify(`计划：重新分析所选范围 · 第 ${selectedRange.startPosition}–${selectedRange.endPosition} 段 · 重新分析 3 个阅读范围，沿用 5 个 · 任务输入修订版 ${preparedRange.checkpoint.revisionLabel} · 计划版本 1`)} && card.querySelector('[data-task-plan-open="baseline-analysis"]')?.textContent==='查看计划并开始' && !card.querySelector('[data-analysis-action="authorize"]'); })()`, 'range-plan-preview');
    const rangeDrawer = await drawerShowing(renderer, preparedRange.taskIntent.taskIntentId, 'ready', 'range-drawer');
    requireJourney(rangeDrawer?.chips.position === `第 ${selectedRange.startPosition}–${selectedRange.endPosition} 段` && /^已选 [\d,]+ 字$/u.test(rangeDrawer.chips.selected ?? '') &&
      rangeDrawer.sentence === '重新分析所选范围，其余阅读范围沿用上一份' && rangeDrawer.technical.goal === RANGE_GOAL &&
      rangeDrawer.technical['selected-range'] === `内容块 ${selectedRange.startPosition}–${selectedRange.endPosition}` &&
      rangeDrawer.technical['reuse-plan'] === reusePlanReading(preparedRange.update.reusePlanDigest, rangePlan) &&
      rangeDrawer.technical['reuse-plan-predecessors'] === predecessorUnitsReading(rangePlan) &&
      predecessorUnitsReading(rangePlan) === '单元 1 reused；单元 2 invalidated；单元 3 bypassed；单元 4 bypassed；单元 5 reused；单元 6 reused；单元 7 reused；单元 8 reused' &&
      rangeDrawer.notDo.includes('不重新读取所选范围以外的正文') && rangeDrawer.technical.predecessor === `Revision 2 · ${revision2.revisionId} · ${revision2.digest}`,
    'range-drawer-plan', rangeDrawer);

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
    await startUpdate(renderer, 'reanalyze-book', '重新分析全书', 'book-click');
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
    // Synchronized delta with Issue #418 (S72 D4): the plan unit by unit reads in the drawer.
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.planUpdateMode==='reanalyze-book' && card.dataset.planReused==='0' && card.dataset.planRecomputed==='8' && card.dataset.planInvalidated==='1' && card.dataset.planBypassed==='7' && card.querySelector('.analysis-plan-summary .task-plan-summary-line')?.textContent===${JSON.stringify(`计划：重新分析全书 · 全书 · 重新分析 8 个阅读范围，沿用 0 个 · 任务输入修订版 ${preparedBook.checkpoint.revisionLabel} · 计划版本 1`)}; })()`, 'book-plan-preview');
    const bookDrawer = await drawerShowing(renderer, preparedBook.taskIntent.taskIntentId, 'ready', 'book-drawer');
    requireJourney(bookDrawer?.chips.position === '全书' && bookDrawer.sentence === '重新分析全书，不沿用以前的结果' && bookDrawer.technical.goal === BOOK_GOAL &&
      bookDrawer.technical['reuse-plan'] === reusePlanReading(preparedBook.update.reusePlanDigest, bookPlan) &&
      bookPlan.units.every((unit) => unit.disposition === 'recomputed' && unit.reason === 'bypassed-whole-book') &&
      bookDrawer.technical['reuse-plan-predecessors'] === predecessorUnitsReading(bookPlan) &&
      predecessorUnitsReading(bookPlan) === '单元 1 bypassed；单元 2 invalidated；单元 3 bypassed；单元 4 bypassed；单元 5 bypassed；单元 6 bypassed；单元 7 bypassed；单元 8 bypassed',
    'book-drawer-plan', bookDrawer);

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
    // Synchronized delta (#274, #275): eight recomputed units, the reduction's turn, and the sample's.
    requireJourney(JSON.stringify(revision4.synthesis) === JSON.stringify(revision3.synthesis) && revision4.usage.requests === SAMPLE1_UNITS + 1 + SAMPLING_TURNS &&
      revision4.manuscriptPin.revisionId === revision2.manuscriptPin.revisionId && revision4.manuscriptPin.revisionDigest === staleRevision.freshness.currentWorkingDigest &&
      settledBook.updateControls?.working?.workingDigest === staleRevision.freshness.currentWorkingDigest && settledBook.updateControls.working.totalBlocks === SAMPLE1_BLOCKS,
    'book-no-manuscript-mutation', { pin: revision4.manuscriptPin, working: settledBook?.updateControls?.working });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.resultRevisionOrdinal==='4' && card.dataset.updateMode==='reanalyze-book' && card.dataset.reusedCount==='0' && card.dataset.recomputedCount==='8' && card.dataset.bypassedCount==='7' && card.querySelectorAll('[data-analysis-unit-lineage="recomputed"]').length===8 && card.querySelectorAll('[data-analysis-unit-lineage="reused"]').length===0 && ${ONLY_ANALYSIS_ACTIONS}; })()`, 'book-overview-surface');

    at('revision-history');
    const history = settledBook.history;
    requireJourney(history?.resultSetId === revision.resultSetId && history.kind === 'baseline-manuscript-analysis' && history.latestOrdinal === 4 && history.entries?.length === 4 &&
      JSON.stringify(history.entries.map((entry) => [entry.ordinal, entry.mode, entry.modeLabel, entry.current, entry.freshness, entry.predecessor?.ordinal ?? null, entry.usage.requests, entry.gapCount, entry.conflictCount, entry.unitsClosed])) ===
        // Synchronized delta (#274, #275): every Run's request count carries its one cross-unit
        // reduction turn and its one assurance sampling turn beside its unit turns.
        JSON.stringify([[1, 'first-baseline', '首次基线分析', false, 'superseded', null, 10, 1, 4, 7], [2, 'sync-current', '同步到当前稿件', false, 'superseded', 1, 4, 1, 4, 7], [3, 'reanalyze-range', '重新分析所选范围', false, 'superseded', 2, 5, 1, 4, 7], [4, 'reanalyze-book', '重新分析全书', true, 'current', 3, 10, 1, 4, 7]]) &&
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
        section.textContent.includes(${JSON.stringify(revision.revisionId)}) && section.textContent.includes(${JSON.stringify(revision4.digest)}) && section.textContent.includes('首次基线分析') && section.textContent.includes('已被后来的分析取代 · 按原样保留') &&
        !section.querySelector('[data-analysis-action="close-revision"]');
    })()`, 'history-surface');

    // V2-UX-LAYER-001 and 008 on the history (#333): how many revisions there are, which is latest,
    // what each one is and what it cost stay at full rank, while each entry's two identity lines and
    // the set's own identity each sit in exactly one disclosure — still exact, still in the DOM, one
    // step below the entry they belong to (V2-UX-LAYER-007).
    await assertRenderer(renderer, `(() => {
      const section=document.querySelector('.baseline-analysis-card .analysis-history');
      const entries=Array.from(section?.querySelectorAll('[data-history-ordinal]')??[]);
      const setExact=section?.querySelector(':scope > details.technical-details');
      const first=entries[0];
      if(entries.length!==4 || !(setExact instanceof HTMLDetailsElement) || !(first instanceof HTMLElement)) return false;
      const firstExact=first.querySelector('details.technical-details');
      if(!(firstExact instanceof HTMLDetailsElement)) return false;
      return !section.querySelector('.field-note.technical-identity') &&
        section.querySelectorAll(':scope > details.technical-details').length===1 && !setExact.open &&
        setExact.textContent.includes(${JSON.stringify(revision.resultSetId)}) && setExact.textContent.includes('baseline-manuscript-analysis') &&
        Array.from(section.querySelectorAll(':scope > p')).some((line)=>line.textContent==='共 4 份分析 · 最新的是第 4 份') &&
        // Synchronized delta (#406): an entry's two readings speak of 份 and 阅读范围; Revision ordinals,
        // lineage counts and the exact creation instant are in the entry's own disclosure.
        entries.every((entry)=>{ const lines=Array.from(entry.querySelectorAll(':scope > p')); const exact=entry.querySelector(':scope > details.technical-details'); return lines[0].textContent.startsWith('第 '+entry.dataset.historyOrdinal+' 份 · ') && !/Revision|单元|pin/u.test(lines[0].textContent+lines[1].textContent) && exact.textContent.includes('Revision '+entry.dataset.historyOrdinal+' · ') && exact.textContent.includes('复用 '); }) &&
        entries.every((entry)=>entry.querySelectorAll(':scope > details.technical-details').length===1 && entry.querySelectorAll(':scope > p').length===2) &&
        // Synchronized delta (#406): each entry also opens the report of the Run that produced it — its
        // own Run's, bound to its own revision, closed by default — so the entry's own identity
        // disclosure is counted as a direct child and the report's is its own.
        entries.every((entry)=>{ const opened=entry.querySelector(':scope > details.analysis-run-report'); return opened instanceof HTMLDetailsElement && !opened.open && /^[0-9a-f]{64}$/u.test(opened.dataset.runReportDigest??'') && opened.querySelector('details.technical-details')?.textContent.includes(entry.dataset.historyRevisionId); }) &&
        new Set(entries.map((entry)=>entry.querySelector(':scope > details.analysis-run-report')?.dataset.runReportDigest)).size===entries.length &&
        firstExact.textContent.includes(${JSON.stringify(revision.revisionId)}) && firstExact.textContent.includes(${JSON.stringify(revision.digest)}) &&
        !first.querySelector(':scope > p').textContent.includes(${JSON.stringify(revision.revisionId)});
    })()`, 'history-identity-disclosure-surface');

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
    await openAnalysisDestination(renderer, 'history-return-back');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'history-return-overview');
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return !card?.dataset.inspectedRevisionOrdinal && card?.dataset.resultRevisionOrdinal==='4'; })()`, 'history-latest-restored');
    // Opening another revision and closing it explicitly returns to the latest as well.
    await assertRenderer(renderer, `(() => { const button=document.querySelector('[data-analysis-action="open-revision"][data-analysis-revision-ordinal="2"]'); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, 'history-open-second-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.inspectedRevisionOrdinal==='2' && document.querySelector('.baseline-analysis-card')?.dataset.updateMode==='sync-current'`, 'history-open-second-rendered');
    // Synchronized delta (#406): the action speaks of 份, as the history it sits under does.
    await click(renderer, '返回最新的一份', 'history-close-click');
    await waitFor(renderer, `!document.querySelector('.baseline-analysis-card')?.dataset.inspectedRevisionOrdinal && document.querySelector('.baseline-analysis-card')?.dataset.resultRevisionOrdinal==='4' && document.querySelector('.baseline-analysis-card')?.dataset.updateMode==='reanalyze-book'`, 'history-closed');
    const afterHistory = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(afterHistory) === JSON.stringify(settledBook), 'history-read-only');

    at('restart-history');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-history-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'restart-history-open-book');
    // Synchronized delta with Issue #405: the Book route enters the manuscript now
    // (V2-UX-RET-002); since #406 this card lives on 资料与记录 › 分析, reached from the manuscript.
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'restart-history-open-book-manuscript');
    await openAnalysisDestination(renderer, 'restart-history-open-book-to-overview');
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

    // ---- Issue #48: the Plan Envelope as an authority-bearing boundary --------------------------------
    at('safe-retry-relaunch');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    modelAdapterIdentity = RETRY_FIXTURE_IDENTITY;
    const retryFixtureDigest = await expectedFixtureDigest([RETRY_FIXTURE_IDENTITY, FIXTURE_IDENTITY, FIXTURE_BASE_IDENTITY]);
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'safe-retry-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'safe-retry-open-book');
    // Synchronized delta with Issue #405: the Book route enters the manuscript now
    // (V2-UX-RET-002); since #406 this card lives on 资料与记录 › 分析, reached from the manuscript.
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'safe-retry-open-book-manuscript');
    await openAnalysisDestination(renderer, 'safe-retry-open-book-to-overview');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled' && document.querySelector('.baseline-analysis-card')?.dataset.resultRevisionOrdinal==='4'`, 'safe-retry-book-visible');
    const relaunched = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(JSON.stringify(relaunched) === JSON.stringify(settledBook), 'safe-retry-relaunch-immutable');

    at('safe-retry-prepare');
    cancellation.throwIfRequested();
    // 重新分析所选范围 over unit 5 against revision 4: its closure [5, 6] plus the predecessor gap unit 2 recompute.
    const retryOption = settledBook.updateControls?.actions?.['reanalyze-range']?.options?.[4];
    requireJourney(retryOption?.unitOrdinal === 5 && retryOption.startPosition === SAMPLE1_UNIT_RANGES[4][0] && retryOption.endPosition === SAMPLE1_UNIT_RANGES[4][1] &&
      sameRecord(retryOption.expected, { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 }), 'safe-retry-option', settledBook.updateControls);
    const retryRange = { startPosition: retryOption.startPosition, endPosition: retryOption.endPosition };
    await assertRenderer(renderer, `(() => { const radio=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"] #analysis-range-5'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, 'safe-retry-range-select');
    await startUpdate(renderer, 'reanalyze-range', '重新分析所选范围', 'safe-retry-range-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, 'safe-retry-prepared', 120_000);
    const preparedRetry = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const retryBoundary = preparedRetry?.planEnvelope?.boundary;
    requireJourney(preparedRetry?.state === 'prepared' && preparedRetry.taskIntent?.mode === 'reanalyze-range' && sameRecord(preparedRetry.update?.selectedRange, retryRange) &&
      preparedRetry.update?.predecessor?.revisionId === revision4.revisionId && sameRecord(preparedRetry.update?.reusePlan?.counts, retryOption.expected) &&
      preparedRetry.providerResolutionPlan?.executionRoute?.fixtureIdentity === RETRY_FIXTURE_IDENTITY && preparedRetry.providerResolutionPlan?.executionRoute?.fixtureSha256 === retryFixtureDigest &&
      JSON.stringify(preparedRetry.providerResolutionPlan?.executionRoute?.fixtureLineage?.map((link) => link.identity)) === JSON.stringify([RETRY_FIXTURE_IDENTITY, FIXTURE_IDENTITY, FIXTURE_BASE_IDENTITY]) &&
      preparedRetry.planEnvelope?.planVersion === 1 && preparedRetry.planVersion?.ordinal === 1 && preparedRetry.planVersion?.state === 'current' && preparedRetry.planVersion?.planRevisionId === null &&
      preparedRetry.planVersion?.planEnvelopeDigest === preparedRetry.planEnvelope.digest && preparedRetry.planVersions?.length === 1 && preparedRetry.planRevisions?.length === 0 && preparedRetry.planRevision === null &&
      JSON.stringify(retryBoundary?.adaptable?.map((entry) => entry.adaptationClass)) === JSON.stringify(['safe-retry']) &&
      JSON.stringify(retryBoundary?.material?.map((entry) => entry.field)) === JSON.stringify(PLAN_MATERIAL_FIELDS) &&
      retryBoundary?.participation?.expected === false && retryBoundary.participation.statement === '预计无需中途参与' &&
      sameRecord(preparedRetry.planVersion?.materialInputs?.selectedRange, retryRange) && preparedRetry.planVersion?.materialInputs?.predecessorRevision?.revisionId === revision4.revisionId &&
      preparedRetry.planVersion?.materialInputs?.providerBinding?.credentialReference === readyConnection.credentialReference &&
      preparedRetry.planVersion?.materialInputs?.runBudgetCeiling === 'unset' && preparedRetry.planVersion?.materialInputs?.outboundDataCategory === 'public-or-synthetic' &&
      preparedRetry.actions?.canAuthorize === true && preparedRetry.actions?.canReconfirmPlan === false,
    'safe-retry-prepared-plan', { update: preparedRetry?.update, planVersion: preparedRetry?.planVersion, boundary: retryBoundary, route: preparedRetry?.providerResolutionPlan?.executionRoute, actions: preparedRetry?.actions });
    // Synchronized delta with Issue #418 (S72 D6, PLAN-012): the Plan Boundary Split reads in the drawer as
    // its two columns — what AI7 may adjust during the Run, and what makes it stop and ask, each locked —
    // with the fifteen fields whose change suspends the plan and the fixture route in 查看技术详情.
    // Synchronized delta with Issue #420 (S74a A4, A5): the plan versions are ②A's closed technical layer,
    // and the start is the drawer bar's, so the card's one action reads 查看计划并开始.
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const open=card?.querySelector('[data-task-plan-open="baseline-analysis"]');
      const versions=card?.querySelector('details.analysis-plan-versions-technical');
      return card?.dataset.planVersion==='1' && card.dataset.planVersionCount==='1' && card.dataset.planRevisionPending==='false' &&
        !card.querySelector('.analysis-plan-boundary') && versions instanceof HTMLDetailsElement && !versions.open &&
        versions.querySelector('.analysis-plan-versions')?.dataset.planVersionCount==='1' && card.querySelector('[data-plan-version-ordinal="1"][data-plan-version-state="current"]')!==null &&
        !card.querySelector('.analysis-plan-drift-note') && !card.querySelector('[data-analysis-action="view-plan-revision"], [data-analysis-action="reconfirm-plan"], [data-analysis-action="authorize"]') &&
        open instanceof HTMLButtonElement && !open.disabled && open.textContent==='查看计划并开始';
    })()`, 'safe-retry-plan-preview');
    const retryDrawer = await drawerShowing(renderer, preparedRetry.taskIntent.taskIntentId, 'ready', 'safe-retry-drawer');
    requireJourney(retryDrawer?.version === '1' && JSON.stringify(retryDrawer.columns) === JSON.stringify(['运行中 AI7 可以自己调整', '这些一变就先停下来问你']) &&
      JSON.stringify(retryDrawer.adaptable) === JSON.stringify([SAFE_RETRY_ADAPTATION]) && JSON.stringify(retryDrawer.askFirst) === JSON.stringify(LOCKED_BOUNDARY) &&
      JSON.stringify(retryDrawer.participation) === JSON.stringify(['预计无需中途参与']) && retryDrawer.footer === '计划说明，不是运行授权' &&
      retryDrawer.technical['material-fields'] === PLAN_MATERIAL_FIELDS.join('、') &&
      retryDrawer.technical['execution-route'] === `ai7-local-deterministic · ai7-deterministic-fixture · 夹具 ${RETRY_FIXTURE_IDENTITY} · ${retryFixtureDigest}` &&
      retryDrawer.technical['plan-versions'] === `版本 1 · current · ${preparedRetry.planEnvelope.digest}` && retryDrawer.actions === 0,
    'safe-retry-drawer-plan', retryDrawer);

    at('safe-retry-dispatch');
    cancellation.throwIfRequested();
    const settledRetry = await settleAuthorizedRun(renderer, 'safe-retry');

    at('safe-retry-adaptation');
    const revision5 = settledRetry?.resultSetRevision;
    const attemptRetry = settledRetry?.run?.attempt;
    const adaptation = settledRetry?.run?.adaptations?.[0];
    const retrySpans = attemptRetry?.spans ?? [];
    requireJourney(settledRetry?.state === 'settled' && settledRetry.run?.state === 'completed-with-gaps' &&
      settledRetry.authorization?.planEnvelopeDigest === preparedRetry.planEnvelope.digest && settledRetry.authorization?.planVersionOrdinal === 1 &&
      settledRetry.planVersion?.state === 'bound' &&
      JSON.stringify(retrySpans.map((span) => [span.unitOrdinal, span.attemptIndex])) === JSON.stringify([[2, 1], [5, 1], [5, 2], [6, 1]]) &&
      retrySpans.every((span) => DIGEST_PATTERN.test(span.payloadDigest) && span.harnessSessionId === attemptRetry.executionBinding.harnessSessionId) &&
      retrySpans[1].payloadDigest !== retrySpans[2].payloadDigest &&
      settledRetry.run.adaptations?.length === 1 && adaptation?.unitOrdinal === 5 && adaptation.adaptationClass === 'safe-retry' && adaptation.attemptIndex === 2 && adaptation.ordinal === 1 &&
      adaptation.failureCode === 'PROVIDER_ERROR' && adaptation.failureStatus === 503 && adaptation.failureClass === 'adapter-failure' && adaptation.classifiedReason.includes('PROVIDER_ERROR') &&
      adaptation.label === `计划内调整 · 单元 5 安全重试 1 次 · ${adaptation.classifiedReason}` &&
      adaptation.planEnvelopeDigest === preparedRetry.planEnvelope.digest && adaptation.bindingDigest === attemptRetry.executionBinding.bindingDigest &&
      adaptation.attemptId === attemptRetry.attemptId && adaptation.runRecordId === settledRetry.run.runRecordId && adaptation.firstPayloadDigest === retrySpans[1].payloadDigest &&
      UUID_PATTERN.test(adaptation.adaptationId) && DIGEST_PATTERN.test(adaptation.requestDigest) && typeof adaptation.recordedAt === 'string' &&
      // Synchronized delta (#274, #275): three recomputed units, unit 5's safe retry, the reduction's
      // turn, and the sample's.
      revision5?.ordinal === 5 && revision5.usage?.requests === 5 + SAMPLING_TURNS && revision5.units?.[4]?.state === 'closed' && revision5.units[4].lineage?.kind === 'recomputed' &&
      revision5.units[1]?.state === 'gap' && revision5.gaps?.length === 1 && revision5.gaps[0].unitOrdinal === 2 && !revision5.gaps[0].reason.includes('安全重试') &&
      JSON.stringify(revision5.provenance?.adaptations) === JSON.stringify({ count: 1, unitOrdinals: [5] }) && revision5.provenance?.planVersion === 1 &&
      revision5.provenance?.runRecordId === settledRetry.run.runRecordId && revision5.bindingPin?.bindingDigest === attemptRetry.executionBinding.bindingDigest &&
      revision5.adapterPin?.fixtureIdentity === RETRY_FIXTURE_IDENTITY && revision5.adapterPin?.fixtureSha256 === retryFixtureDigest &&
      sameRecord(revision5.update?.counts, retryOption.expected) && revision5.coverage?.unitsClosed === SAMPLE1_UNITS - 1 && revision5.coverage?.gapCount === 1 &&
      // Synchronized delta (#276): this Run's report counts the adaptation, and its reflection closed
      // from the fixture entry keyed by this Run's own accounting.
      settledRetry.taskOutcome?.report?.units?.retried === 1 && settledRetry.taskOutcome?.report?.ifRedone?.state === 'closed',
    'safe-retry-record', { run: settledRetry?.run === undefined ? undefined : { ...settledRetry.run, attempt: undefined }, adaptation, spans: retrySpans, provenance: revision5?.provenance, usage: revision5?.usage });
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const timeline=card?.querySelector('.analysis-timeline');
      const entry=timeline?.querySelector('[data-timeline-kind="adaptation"][data-adaptation-unit="5"][data-adaptation-class="safe-retry"]');
      return card?.dataset.resultRevisionOrdinal==='5' && card.dataset.adaptationCount==='1' && card.querySelector('.analysis-run')?.dataset.runAdaptations==='1' &&
        timeline?.dataset.timelineAdaptations==='1' && timeline.querySelectorAll('[data-timeline-kind="transition"]').length===4 && entry!==null &&
        entry.textContent.includes(${JSON.stringify(adaptation.label)}) && entry.textContent.includes(${JSON.stringify(adaptation.bindingDigest)}) &&
        card.querySelector('[data-analysis-adaptation-unit="5"][data-analysis-adaptation-class="safe-retry"]')?.textContent===${JSON.stringify(adaptation.label)} &&
        card.querySelector('[data-analysis-unit="5"][data-analysis-unit-state="closed"][data-analysis-unit-adaptations="1"]')!==null &&
        card.querySelectorAll('[data-analysis-unit-adaptations]').length===1 && card.textContent.includes('计划版本 1') && ${ONLY_ANALYSIS_ACTIONS};
    })()`, 'safe-retry-overview-surface');

    at('plan-revision-prepare');
    cancellation.throwIfRequested();
    // A new 重新分析所选范围 Task (the previous one has a Run) over unit 3 against revision 5; unit 8 is the later material change.
    const driftOptionA = settledRetry.updateControls?.actions?.['reanalyze-range']?.options?.[2];
    const driftOptionB = settledRetry.updateControls?.actions?.['reanalyze-range']?.options?.[7];
    requireJourney(driftOptionA?.unitOrdinal === 3 && sameRecord(driftOptionA.expected, { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 }) &&
      driftOptionB?.unitOrdinal === 8 && sameRecord(driftOptionB.expected, { reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 }), 'plan-revision-options', settledRetry.updateControls);
    const rangeA = { startPosition: driftOptionA.startPosition, endPosition: driftOptionA.endPosition };
    const rangeB = { startPosition: driftOptionB.startPosition, endPosition: driftOptionB.endPosition };
    await assertRenderer(renderer, `(() => { const radio=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"] #analysis-range-3'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, 'plan-revision-select-a');
    await startUpdate(renderer, 'reanalyze-range', '重新分析所选范围', 'plan-revision-prepare-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared' && document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId!==${JSON.stringify(preparedRetry.taskIntent.taskIntentId)}`, 'plan-revision-prepared', 120_000);
    const preparedDrift = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const v1Digest = preparedDrift?.planEnvelope?.digest;
    requireJourney(preparedDrift?.state === 'prepared' && preparedDrift.taskIntent?.taskIntentId !== preparedRetry.taskIntent.taskIntentId && sameRecord(preparedDrift.update?.selectedRange, rangeA) &&
      preparedDrift.update?.predecessor?.revisionId === revision5.revisionId && DIGEST_PATTERN.test(v1Digest) && preparedDrift.planVersion?.ordinal === 1 && preparedDrift.planVersion?.state === 'current' &&
      preparedDrift.planRevision === null && preparedDrift.planVersions?.length === 1 && preparedDrift.actions?.canAuthorize === true && preparedDrift.actions?.canReconfirmPlan === false &&
      sameRecord(preparedDrift.update?.reusePlan?.counts, driftOptionA.expected),
    'plan-revision-prepared-plan', { update: preparedDrift?.update, planVersion: preparedDrift?.planVersion, actions: preparedDrift?.actions });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const open=card?.querySelector('[data-task-plan-open="baseline-analysis"]'); return card?.dataset.planVersion==='1' && card.dataset.planRevisionPending==='false' && open instanceof HTMLButtonElement && open.textContent==='查看计划并开始' && !card.querySelector('.analysis-plan-drift-note, [data-analysis-action="view-plan-revision"], [data-analysis-action="reconfirm-plan"], [data-analysis-action="authorize"]'); })()`, 'plan-revision-preview-current');

    at('plan-revision-drift');
    cancellation.throwIfRequested();
    // The material change before authorization: the selected range moves to unit 8 and the same prepared Task is prepared again.
    await assertRenderer(renderer, `(() => { const radio=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"] #analysis-range-8'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, 'plan-revision-select-b');
    await startUpdate(renderer, 'reanalyze-range', '重新分析所选范围', 'plan-revision-drift-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.planRevisionPending==='true'`, 'plan-revision-pending', 120_000);
    const drifted = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    // Rebound by the revert stage below, which settles this revision and drifts the plan again.
    let pendingRevision = drifted?.planRevision;
    requireJourney(drifted?.taskIntent?.taskIntentId === preparedDrift.taskIntent.taskIntentId && drifted.state === 'prepared' && drifted.planEnvelope?.digest === v1Digest &&
      drifted.planVersion?.ordinal === 1 && drifted.planVersion?.state === 'superseded' && drifted.planVersions?.length === 1 && drifted.planRevisions?.length === 1 &&
      UUID_PATTERN.test(pendingRevision?.planRevisionId) && pendingRevision.priorOrdinal === 1 && pendingRevision.nextOrdinal === null && pendingRevision.resolved === false && pendingRevision.trigger === 'prepare' &&
      JSON.stringify(pendingRevision.changedFields) === JSON.stringify(['selectedRange', 'reusePlan.counts']) &&
      pendingRevision.diff?.length === 2 && pendingRevision.diff[0].field === 'selectedRange' && pendingRevision.diff[0].materiality === 'material' &&
      sameRecord(pendingRevision.diff[0].prior, rangeA) && sameRecord(pendingRevision.diff[0].proposed, rangeB) &&
      pendingRevision.diff[1].field === 'reusePlan.counts' && pendingRevision.diff[1].materiality === 'derived' &&
      sameRecord(pendingRevision.diff[1].prior, driftOptionA.expected) && sameRecord(pendingRevision.diff[1].proposed, driftOptionB.expected) &&
      sameRecord(pendingRevision.proposed?.selectedRange, rangeB) && pendingRevision.label === '计划修订 · 版本 1 → 2（待重新确认） · selectedRange、reusePlan.counts' &&
      sameRecord(drifted.update?.selectedRange, rangeA) && drifted.authorization === null && drifted.run === null &&
      drifted.actions?.canAuthorize === false && drifted.actions?.canReconfirmPlan === true,
    'plan-revision-diff', { planRevision: pendingRevision, planVersion: drifted?.planVersion, actions: drifted?.actions });
    // The stale preview keeps no start action (AUTH-006). Synchronized delta with Issue #420 (S74a A4): ②A says
    // in one line that the plan changed, and the diff, 查看计划修订 and 重新确认计划 are the drawer's — the
    // next stages read them there; the pending revision stays in ②A's technical layer, exactly identified.
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const note=card?.querySelector('.analysis-plan-summary .analysis-plan-drift-note');
      const open=card?.querySelector('[data-task-plan-open="baseline-analysis"]');
      return note instanceof HTMLElement && note.dataset.planRevisionState==='pending' && note.dataset.planRevisionPrior==='1' && note.dataset.planRevisionFields==='selectedRange,reusePlan.counts' &&
        note.textContent==='计划的关键内容已变化：原计划不能再开始；在任务计划里查看计划修订并重新确认计划后，新的计划版本才能开始。' &&
        open instanceof HTMLButtonElement && open.textContent==='查看计划并开始' &&
        !card.querySelector('.analysis-plan-revision, [data-analysis-action="authorize"], [data-analysis-action="view-plan-revision"], [data-analysis-action="reconfirm-plan"]') &&
        card.dataset.planVersion==='1' && card.dataset.planRevisionPending==='true' && card.querySelector('[data-plan-version-ordinal="1"][data-plan-version-state="superseded"]')!==null &&
        card.querySelector('.analysis-plan-versions [data-plan-revision-prior="1"][data-plan-revision-resolved="false"]')!==null &&
        card.querySelector('.analysis-plan-versions [data-plan-revision-resolved="false"]')?.textContent.includes(${JSON.stringify(pendingRevision.label)}) === true && ${ONLY_ANALYSIS_ACTIONS};
    })()`, 'plan-revision-surface');

    at('plan-revision-drawer-diff');
    // S72 D8: the drawer beside ②A reads the same drift in the editor's words, by field key — 处理范围 and
    // 重新分析与沿用的阅读范围, 关键内容 and 随之变化 — with each range as the paragraphs and characters it
    // holds. The chips still name the range the superseded version froze.
    const driftDrawer = await drawerShowing(renderer, preparedDrift.taskIntent.taskIntentId, 'changed', 'plan-revision-drawer');
    const priorCount = /^已选 ([\d,]+) 字$/u.exec(driftDrawer?.chips?.selected ?? '')?.[1];
    // Synchronized delta with Issue #420 (S74a A4): 重新确认计划 is the drawer's own action now, so the
    // resolution no longer sends the editor to ②A.
    requireJourney(driftDrawer?.pill === '计划已变化' && driftDrawer.version === '1' && priorCount !== undefined &&
      driftDrawer.chips.position === `第 ${rangeA.startPosition}–${rangeA.endPosition} 段` &&
      driftDrawer.drift?.kind === 'diff' && driftDrawer.drift.heading === '计划的关键内容已变化' && driftDrawer.drift.tableHidden === true &&
      JSON.stringify(driftDrawer.drift.text) === JSON.stringify(['计划冻结之后，它的关键内容已经变化；原计划不能再开始。', '重新确认计划后，新的计划版本才能开始。']) &&
      driftDrawer.actions === 0, 'plan-revision-drawer-diff', driftDrawer);
    await reviewAction(renderer, '#task-drawer [data-task-drawer-control="view-plan-revision"]', 'plan-revision-drawer-view');
    const driftTable = (await readDrawer(renderer))?.drift;
    const driftRange = driftTable?.rows?.[0];
    const proposedCount = /^第 \d+–\d+ 段 · ([\d,]+) 字$/u.exec(driftRange?.[4] ?? '')?.[1];
    requireJourney(driftTable?.tableHidden === false && driftTable.rows.length === 2 && proposedCount !== undefined &&
      JSON.stringify(driftRange) === JSON.stringify(['selectedRange', 'material', '处理范围', `第 ${rangeA.startPosition}–${rangeA.endPosition} 段 · ${priorCount} 字`, `第 ${rangeB.startPosition}–${rangeB.endPosition} 段 · ${proposedCount} 字`, '关键内容']) &&
      JSON.stringify(driftTable.rows[1]) === JSON.stringify(['reusePlan.counts', 'derived', '重新分析与沿用的阅读范围', `重新分析 ${driftOptionA.expected.recomputed} 个，沿用 ${driftOptionA.expected.reused} 个`, `重新分析 ${driftOptionB.expected.recomputed} 个，沿用 ${driftOptionB.expected.reused} 个`, '随之变化']),
    'plan-revision-drawer-rows', driftTable);

    at('plan-revision-bar');
    // Issue #420 (S74a, AUTH-006): the bar of a changed plan offers no start at all — 重新确认计划 and
    // 查看计划修订 (whose table is open now) take its place, with the resolution beside them.
    const driftBar = await readDrawer(renderer);
    requireJourney(driftBar?.bar?.state === 'changed' && driftBar.bar.start === 'changed' && driftBar.bar.statement === BAR_STATEMENT &&
      driftBar.bar.note === '重新确认计划后，新的计划版本才能开始。' && driftBar.bar.status === null &&
      barActions(driftBar) === 'reconfirm-plan:重新确认计划:enabled|view-plan-revision:查看计划修订:enabled|revise:返回修改:disabled|save-draft:保存草稿:enabled' &&
      driftBar.drift?.tableHidden === false, 'plan-revision-bar', driftBar?.bar);
    await assertRenderer(renderer, `!document.querySelector('#task-drawer [data-task-drawer-control="start"]') && document.querySelector('#task-drawer [data-task-drawer-control="view-plan-revision"]')?.getAttribute('aria-expanded')==='true' && document.querySelector('#task-drawer [data-task-drawer-control="view-plan-revision"]')?.getAttribute('aria-controls')===document.querySelector('#task-drawer .task-plan-drift-table')?.id`, 'plan-revision-bar-no-start');

    at('plan-revision-stale-authorize');
    cancellation.throwIfRequested();
    // Authorizing the stale version through the renderer API is refused with the safe reason and creates no Run Record.
    const refusal = await renderer.evaluate(`window.ai7.authorizeBaselineAnalysis({ taskIntentId: ${JSON.stringify(preparedDrift.taskIntent.taskIntentId)}, planEnvelopeDigest: ${JSON.stringify(v1Digest)} }).then(()=>null,(error)=>({ code: error?.code ?? null, message: String(error?.message ?? error) }))`);
    requireJourney(refusal !== null && refusal.code === 'ANALYSIS_PLAN_REVISION_REQUIRED' && refusal.message.includes('plan-revision-required'), 'plan-revision-refusal', refusal);
    const afterRefusal = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(afterRefusal?.authorization === null && afterRefusal.run === null && afterRefusal.planRevision?.planRevisionId === pendingRevision.planRevisionId &&
      afterRefusal.planVersions?.length === 1 && afterRefusal.planEnvelope?.digest === v1Digest, 'plan-revision-no-run');

    at('plan-revision-revert');
    cancellation.throwIfRequested();
    // (iv) The way back (Issue #281). Preparing again at the range version 1 froze records the revert
    // as its own append-only revision, settles the pending one, and returns 开始任务 to the version that was
    // never replaced: the same envelope digest, still one plan version, nothing rewritten.
    await assertRenderer(renderer, `(() => { const radio=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"] #analysis-range-3'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, 'plan-revision-revert-select-a');
    await startUpdate(renderer, 'reanalyze-range', '重新分析所选范围', 'plan-revision-revert-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.planRevisionPending==='false'`, 'plan-revision-reverted', 120_000);
    const reverted = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const supersededRevision = reverted?.planRevisions?.[0];
    const revertRevision = reverted?.planRevisions?.[1];
    requireJourney(reverted?.taskIntent?.taskIntentId === preparedDrift.taskIntent.taskIntentId && reverted.state === 'prepared' && reverted.planEnvelope?.digest === v1Digest &&
      reverted.planVersions?.length === 1 && reverted.planVersion?.ordinal === 1 && reverted.planVersion?.state === 'current' && reverted.planRevisions?.length === 2 &&
      supersededRevision?.planRevisionId === pendingRevision.planRevisionId && supersededRevision.state === 'superseded' && supersededRevision.resolved === true &&
      supersededRevision.nextOrdinal === null && supersededRevision.detectedAt === pendingRevision.detectedAt &&
      JSON.stringify(supersededRevision.diff) === JSON.stringify(pendingRevision.diff) &&
      JSON.stringify(supersededRevision.proposed) === JSON.stringify(pendingRevision.proposed) &&
      supersededRevision.label === '计划修订 · 版本 1 → 2（已被后一次修订取代） · selectedRange、reusePlan.counts' &&
      revertRevision?.state === 'reverted' && revertRevision.resolved === true && revertRevision.trigger === 'prepare' && revertRevision.priorOrdinal === 1 && revertRevision.nextOrdinal === 1 &&
      UUID_PATTERN.test(revertRevision.planRevisionId) && JSON.stringify(revertRevision.supersedes) === JSON.stringify([pendingRevision.planRevisionId]) &&
      JSON.stringify(revertRevision.changedFields) === JSON.stringify(['selectedRange', 'reusePlan.counts']) &&
      sameRecord(revertRevision.diff?.[0]?.prior, rangeB) && sameRecord(revertRevision.diff[0].proposed, rangeA) &&
      sameRecord(revertRevision.diff?.[1]?.prior, driftOptionB.expected) && sameRecord(revertRevision.diff[1].proposed, driftOptionA.expected) &&
      revertRevision.label === '计划修订 · 版本 1 → 1（已回退） · selectedRange、reusePlan.counts' &&
      reverted.planRevision === null && sameRecord(reverted.update?.selectedRange, rangeA) && reverted.authorization === null && reverted.run === null &&
      reverted.actions?.canAuthorize === true && reverted.actions?.canReconfirmPlan === false,
    'plan-revision-revert-record', { planRevisions: reverted?.planRevisions, planVersions: reverted?.planVersions, actions: reverted?.actions });
    // The 计划已被取代 note is gone, both revisions read as settled, and the start is back — in the drawer's bar
    // since Issue #420 (S74a), with the card's one action reading 查看计划并开始 again.
    await assertRenderer(renderer, `(() => {
      const card=document.querySelector('.baseline-analysis-card');
      const open=card?.querySelector('[data-task-plan-open="baseline-analysis"]');
      return card?.dataset.planVersion==='1' && card.dataset.planVersionCount==='1' && card.dataset.planRevisionPending==='false' &&
        card.dataset.planEnvelopeDigest===${JSON.stringify(v1Digest)} && card.querySelector('[data-plan-version-ordinal="1"][data-plan-version-state="current"]')!==null &&
        card.querySelector('.analysis-plan-versions')?.dataset.planRevisionCount==='2' &&
        card.querySelectorAll('.analysis-plan-revision-list li').length===2 &&
        card.querySelectorAll('.analysis-plan-versions [data-plan-revision-resolved="true"]').length===2 &&
        card.querySelector('.analysis-plan-versions [data-plan-revision-prior="1"][data-plan-revision-next="1"][data-plan-revision-resolved="true"]')!==null &&
        card.querySelectorAll('.analysis-plan-revision-list li')[1]?.textContent.includes(${JSON.stringify(revertRevision.label)})===true &&
        !card.querySelector('.analysis-plan-drift-note, [data-analysis-action="authorize"], [data-analysis-action="view-plan-revision"], [data-analysis-action="reconfirm-plan"]') &&
        open instanceof HTMLButtonElement && !open.disabled && open.textContent==='查看计划并开始';
    })()`, 'plan-revision-revert-surface');
    // The drawer follows the way back: the plan version 1 froze is the plan again, nothing reads as changed,
    // and its bar offers 开始任务 again.
    const revertedDrawer = await drawerShowing(renderer, preparedDrift.taskIntent.taskIntentId, 'ready', 'plan-revision-revert-drawer');
    requireJourney(revertedDrawer?.drift === null && revertedDrawer.version === '1' && revertedDrawer.pill === '尚未开始' &&
      revertedDrawer.chips.position === `第 ${rangeA.startPosition}–${rangeA.endPosition} 段` && revertedDrawer.chips.selected === `已选 ${priorCount} 字` &&
      revertedDrawer.bar?.state === 'ready' && barActions(revertedDrawer) === 'start:开始任务:enabled|revise:返回修改:disabled|save-draft:保存草稿:enabled',
    'plan-revision-revert-drawer-plan', revertedDrawer);
    // Back to the change this Task means to confirm: the same range drift, pending on its own again.
    await assertRenderer(renderer, `(() => { const radio=document.querySelector('.baseline-analysis-card [data-update-action="reanalyze-range"] #analysis-range-8'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, 'plan-revision-revert-select-b');
    await startUpdate(renderer, 'reanalyze-range', '重新分析所选范围', 'plan-revision-redrift-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.planRevisionPending==='true'`, 'plan-revision-redrift-pending', 120_000);
    const redrifted = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    pendingRevision = redrifted?.planRevision;
    requireJourney(redrifted?.planRevisions?.length === 3 && UUID_PATTERN.test(pendingRevision?.planRevisionId) &&
      pendingRevision.planRevisionId !== supersededRevision.planRevisionId && pendingRevision.planRevisionId !== revertRevision.planRevisionId &&
      pendingRevision.state === 'pending' && pendingRevision.resolved === false && pendingRevision.trigger === 'prepare' &&
      JSON.stringify(pendingRevision.supersedes) === JSON.stringify([]) && sameRecord(pendingRevision.proposed?.selectedRange, rangeB) &&
      pendingRevision.label === '计划修订 · 版本 1 → 2（待重新确认） · selectedRange、reusePlan.counts' &&
      redrifted.planVersions?.length === 1 && redrifted.planEnvelope?.digest === v1Digest &&
      redrifted.actions?.canAuthorize === false && redrifted.actions?.canReconfirmPlan === true,
    'plan-revision-redrift', { planRevisions: redrifted?.planRevisions, actions: redrifted?.actions });

    at('plan-revision-reconfirm');
    cancellation.throwIfRequested();
    // Synchronized delta with Issue #420 (S74a A4): 重新确认计划 is the drawer bar's; the re-drift opened the
    // drawer on the changed plan, and ②A beside it reads version 2 once it is frozen.
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(preparedDrift.taskIntent.taskIntentId)} && document.querySelector('#task-drawer')?.dataset.taskPlanStart==='changed' && document.querySelector('#task-drawer [data-task-drawer-control="reconfirm-plan"]')?.disabled===false`, 'plan-revision-reconfirm-ready');
    await reviewAction(renderer, '#task-drawer [data-task-drawer-control="reconfirm-plan"]', 'plan-revision-reconfirm-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.planVersion==='2'`, 'plan-revision-version-2', 120_000);
    const reconfirmed = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const v2Digest = reconfirmed?.planEnvelope?.digest;
    requireJourney(reconfirmed?.taskIntent?.taskIntentId === preparedDrift.taskIntent.taskIntentId && reconfirmed.state === 'prepared' && DIGEST_PATTERN.test(v2Digest) && v2Digest !== v1Digest &&
      reconfirmed.planEnvelope?.planVersion === 2 && reconfirmed.planVersion?.ordinal === 2 && reconfirmed.planVersion?.state === 'current' && reconfirmed.planVersion?.planRevisionId === pendingRevision.planRevisionId &&
      JSON.stringify(reconfirmed.planVersions?.map((version) => [version.ordinal, version.state, version.planEnvelopeDigest])) === JSON.stringify([[1, 'superseded', v1Digest], [2, 'current', v2Digest]]) &&
      reconfirmed.planRevisions?.length === 3 && reconfirmed.planRevisions[2].planRevisionId === pendingRevision.planRevisionId && reconfirmed.planRevisions[2].resolved === true && reconfirmed.planRevisions[2].nextOrdinal === 2 &&
      reconfirmed.planRevisions[2].state === 'resolved' && reconfirmed.planRevisions.every((entry) => entry.resolved === true) &&
      reconfirmed.planRevisions[2].label === '计划修订 · 版本 1 → 2 · selectedRange、reusePlan.counts' && reconfirmed.planRevision === null &&
      sameRecord(reconfirmed.update?.selectedRange, rangeB) && sameRecord(reconfirmed.update?.reusePlan?.counts, driftOptionB.expected) &&
      reconfirmed.coverageManifest?.digest === preparedDrift.coverageManifest.digest && reconfirmed.checkpoint?.revisionId === preparedDrift.checkpoint.revisionId &&
      JSON.stringify(reconfirmed.runSourceScope?.unitScope?.recomputedUnitOrdinals) === JSON.stringify([2, 8]) &&
      reconfirmed.authorization === null && reconfirmed.actions?.canAuthorize === true && reconfirmed.actions?.canReconfirmPlan === false,
    'plan-revision-reconfirmed', { planVersion: reconfirmed?.planVersion, planVersions: reconfirmed?.planVersions, planRevisions: reconfirmed?.planRevisions, update: reconfirmed?.update });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const open=card?.querySelector('[data-task-plan-open="baseline-analysis"]'); return card?.dataset.planVersion==='2' && card.dataset.planVersionCount==='2' && card.dataset.planRevisionPending==='false' && card.dataset.planEnvelopeDigest===${JSON.stringify(v2Digest)} && card.dataset.planReused==='6' && card.dataset.planRecomputed==='2' && card.querySelector('[data-plan-version-ordinal="1"][data-plan-version-state="superseded"]')!==null && card.querySelector('[data-plan-version-ordinal="2"][data-plan-version-state="current"]')!==null && card.querySelector('.analysis-plan-versions [data-plan-revision-prior="1"][data-plan-revision-next="2"][data-plan-revision-resolved="true"]')!==null && !card.querySelector('.analysis-plan-drift-note, [data-analysis-action="authorize"]') && open instanceof HTMLButtonElement && !open.disabled && open.textContent==='查看计划并开始' && card.textContent.includes(${JSON.stringify(`内容块 ${rangeB.startPosition}–${rangeB.endPosition}`)}); })()`, 'plan-revision-version-2-surface');

    at('plan-revision-drawer-range');
    // #288's visible half: once version 2 is the plan, the range it names is the one version 2 froze —
    // unit 8's — in the drawer's chips, in its 查看技术详情, and in ②A's one line; never the range the Task
    // was first prepared with (the L2 suite pins that the Task Intent row keeps that one).
    const v2Drawer = await drawerShowing(renderer, preparedDrift.taskIntent.taskIntentId, 'ready', 'plan-revision-v2-drawer');
    requireJourney(v2Drawer?.version === '2' && v2Drawer.drift === null &&
      v2Drawer.chips.position === `第 ${rangeB.startPosition}–${rangeB.endPosition} 段` && v2Drawer.chips.selected === `已选 ${proposedCount} 字` &&
      v2Drawer.terms['要处理']?.includes(`第 ${rangeB.startPosition}–${rangeB.endPosition} 段 · ${proposedCount} 字 · 重新分析 ${driftOptionB.expected.recomputed} 个阅读范围，沿用 ${driftOptionB.expected.reused} 个`) &&
      v2Drawer.technical['selected-range'] === `内容块 ${rangeB.startPosition}–${rangeB.endPosition}` &&
      v2Drawer.technical['plan-versions'] === `版本 1 · superseded · ${v1Digest}；版本 2 · current · ${v2Digest}` &&
      v2Drawer.technical['plan-envelope'] === v2Digest &&
      // Issue #420 (S74a): version 2 is startable from the bar, whose summary names it.
      v2Drawer.bar?.state === 'ready' && v2Drawer.bar.summary?.includes(' · 计划版本 2 · ') === true &&
      barActions(v2Drawer) === 'start:开始任务:enabled|revise:返回修改:disabled|save-draft:保存草稿:enabled',
    'plan-revision-drawer-range', v2Drawer);
    await assertRenderer(renderer, `document.querySelector('.baseline-analysis-card .analysis-plan-summary .task-plan-summary-line')?.textContent===${JSON.stringify(`计划：重新分析所选范围 · 第 ${rangeB.startPosition}–${rangeB.endPosition} 段 · 重新分析 ${driftOptionB.expected.recomputed} 个阅读范围，沿用 ${driftOptionB.expected.reused} 个 · 任务输入修订版 ${reconfirmed.checkpoint.revisionLabel} · 计划版本 2`)}`, 'plan-revision-summary-range');

    at('plan-revision-dispatch');
    cancellation.throwIfRequested();
    const settledDrift = await settleAuthorizedRun(renderer, 'plan-revision');
    const revision6 = settledDrift?.resultSetRevision;
    const attemptDrift = settledDrift?.run?.attempt;
    requireJourney(settledDrift?.state === 'settled' && settledDrift.run?.state === 'completed-with-gaps' &&
      settledDrift.authorization?.planEnvelopeDigest === v2Digest && settledDrift.authorization?.planVersionOrdinal === 2 &&
      JSON.stringify(settledDrift.planVersions?.map((version) => version.state)) === JSON.stringify(['superseded', 'bound']) &&
      attemptDrift?.executionBinding?.planEnvelopeDigest === v2Digest && JSON.stringify(attemptDrift.spans?.map((span) => span.unitOrdinal)) === JSON.stringify([2, 8]) &&
      settledDrift.run.adaptations?.length === 0 &&
      revision6?.ordinal === 6 && revision6.update?.mode === 'reanalyze-range' && sameRecord(revision6.update?.selectedRange, rangeB) && sameRecord(revision6.update?.counts, driftOptionB.expected) &&
      revision6.update?.predecessor?.revisionId === revision5.revisionId && revision6.provenance?.planVersion === 2 && JSON.stringify(revision6.provenance?.adaptations) === JSON.stringify({ count: 0, unitOrdinals: [] }) &&
      // Synchronized delta (#274, #275): two recomputed units, the reduction's turn, and the sample's.
      revision6.usage?.requests === 3 + SAMPLING_TURNS && revision6.adapterPin?.fixtureSha256 === retryFixtureDigest && revision6.gaps?.length === 1 && revision6.gaps[0].unitOrdinal === 2 &&
      // Synchronized delta (#276): this Run adapted nothing, and its reflection closed from the
      // fixture entry keyed by its own accounting.
      settledDrift.taskOutcome?.report?.units?.retried === 0 && settledDrift.taskOutcome?.report?.ifRedone?.state === 'closed',
    'plan-revision-settled', { authorization: settledDrift?.authorization, planVersions: settledDrift?.planVersions, provenance: revision6?.provenance, update: revision6?.update });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); const history=card?.querySelector('.analysis-history'); return card?.dataset.resultRevisionOrdinal==='6' && card.dataset.adaptationCount==='0' && card.dataset.planVersion==='2' && card.querySelector('[data-plan-version-ordinal="2"][data-plan-version-state="bound"]')!==null && card.querySelector('.analysis-plan-versions [data-plan-revision-next="2"][data-plan-revision-resolved="true"]')!==null && card.textContent.includes('计划版本 2') && card.querySelector('.analysis-timeline')?.dataset.timelineAdaptations==='0' && history?.dataset.historyCount==='6' && ${ONLY_ANALYSIS_ACTIONS}; })()`, 'plan-revision-overview-surface');

    at('plan-revision-edit-unchanged');
    // (iii) An acknowledged manuscript edit after the checkpoint changes no plan version, no revision, and no binding.
    const nextSequence = settledDrift.updateControls.working.journalSequence + 1;
    await saveEditorSuffix(renderer, '，J-04 计划版本形成后的确认编辑', nextSequence, cancellation);
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled' && document.querySelector('.baseline-analysis-card')?.dataset.freshnessState==='stale'`, 'plan-revision-edit-stale');
    const afterEdit = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(afterEdit?.taskIntent?.taskIntentId === preparedDrift.taskIntent.taskIntentId && afterEdit.planEnvelope?.digest === v2Digest &&
      JSON.stringify(afterEdit.planVersions?.map((version) => [version.ordinal, version.state])) === JSON.stringify([[1, 'superseded'], [2, 'bound']]) &&
      afterEdit.planRevisions?.length === 3 && afterEdit.planRevision === null && afterEdit.authorization?.planEnvelopeDigest === v2Digest &&
      afterEdit.run?.attempt?.executionBinding?.bindingDigest === attemptDrift.executionBinding.bindingDigest && afterEdit.run?.runRecordId === settledDrift.run.runRecordId &&
      afterEdit.resultSetRevision?.revisionId === revision6.revisionId && afterEdit.resultSetRevision?.freshness?.state === 'stale' && afterEdit.resultSetRevision?.freshness?.currentJournalSequence === nextSequence &&
      afterEdit.checkpoint?.revisionId === settledDrift.checkpoint.revisionId,
    'plan-revision-edit-unchanged', { planVersions: afterEdit?.planVersions, freshness: afterEdit?.resultSetRevision?.freshness, nextSequence });
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.planVersion==='2' && card.dataset.planVersionCount==='2' && card.dataset.planRevisionPending==='false' && card.dataset.planEnvelopeDigest===${JSON.stringify(v2Digest)} && card.dataset.freshnessState==='stale' && card.dataset.resultRevisionOrdinal==='6'; })()`, 'plan-revision-edit-surface');
    cancellation.throwIfRequested();

    // ---- 联网后开始任务 (Issue #502, plan slice S74b; editor-surfaces §6 离线 / 等待网络; V2-UX-AUTH-002, AUTH-004,
    // AUTH-007, OFF-004 to OFF-010). The device goes offline through J-04's control; the stale manuscript gives
    // 同步到当前稿件 something to read.
    at('connectivity-offline-bar');
    await writeFile(connectivityPath, 'offline');
    await startUpdate(renderer, 'sync-current', '同步到当前稿件', 'offline-sync-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, 'offline-sync-prepared', 120_000);
    const preparedOffline = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(preparedOffline?.state === 'prepared' && preparedOffline.taskIntent?.mode === 'sync-current' && preparedOffline.actions?.canAuthorize === true &&
      preparedOffline.authorization === null && preparedOffline.run === null, 'offline-sync-plan', { state: preparedOffline?.state, mode: preparedOffline?.taskIntent?.mode });
    const offlineIntent = preparedOffline.taskIntent.taskIntentId;
    const offlineDrawer = await drawerShowing(renderer, offlineIntent, 'offline', 'offline-drawer');
    // Two start actions are never shown ambiguously: 离线 offers 联网后开始任务 beside 仅保存任务草稿, and neither is
    // preselected — focus is not on either when the drawer opens (AUTH-002, OFF-004).
    requireJourney(offlineDrawer?.pill === '离线' && offlineDrawer.bar?.state === 'offline' && offlineDrawer.bar.start === 'offline' &&
      offlineDrawer.bar.statement === '只是让 AI7 按这份计划做这一次；接受修改建议、批准受控动作、保存里程碑版本、设为发稿版本都仍由你另行决定' &&
      offlineDrawer.bar.note === '离线：这份计划要连到模型服务，而这台设备现在没有网络。联网后开始任务会先记录这次授权，联网后自动开始；在此之前不会发送任何内容' &&
      barActions(offlineDrawer) === 'start-when-online:联网后开始任务:enabled|save-draft:仅保存任务草稿:enabled|revise:返回修改:disabled' &&
      offlineDrawer.bar.status === null && offlineDrawer.bar.refusal === null,
    'offline-bar', offlineDrawer?.bar);
    await assertRenderer(renderer, `(() => { const bar=document.querySelector('#task-drawer .task-drawer-bar'); return bar instanceof HTMLElement && !bar.contains(document.activeElement) && bar.querySelector('[autofocus]')===null && [...bar.querySelectorAll('button')].every((button)=>!button.textContent.includes('授权')); })()`, 'offline-bar-nothing-preselected');

    at('connectivity-start-when-online');
    cancellation.throwIfRequested();
    await reviewAction(renderer, '#task-drawer [data-task-drawer-control="start-when-online"]', 'offline-start-when-online');
    const waitingDrawer = await drawerShowing(renderer, offlineIntent, 'waiting', 'waiting-drawer');
    requireJourney(waitingDrawer?.pill === '等待网络' && waitingDrawer.bar?.state === 'started' && waitingDrawer.bar.status === '等待网络' &&
      waitingDrawer.bar.note === '已记录这次授权。联网、并确认计划没有变化后会自动开始；在此之前不会发送任何内容' &&
      barActions(waitingDrawer) === 'cancel-wait:取消:enabled|run-link:查看运行:enabled' && waitingDrawer.bar.statement === null,
    'waiting-bar', waitingDrawer?.bar);
    const waitingAnalysis = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    // The exact authorization 开始任务 records, and a Run that has sent nothing: no attempt, no binding, no usage.
    requireJourney(waitingAnalysis?.state === 'waiting' && waitingAnalysis.authorization?.origin === 'standard-direct' &&
      waitingAnalysis.authorization?.authority === 'standard-direct-dispatch' && waitingAnalysis.run?.state === 'awaiting-connectivity' &&
      waitingAnalysis.run.stateLabel === '等待网络 · 未启动' && waitingAnalysis.run.attempt === null && waitingAnalysis.run.progress === null &&
      JSON.stringify(waitingAnalysis.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'awaiting-connectivity']),
    'waiting-run', { state: waitingAnalysis?.state, run: waitingAnalysis?.run });
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='waiting'`, 'waiting-card');

    at('connectivity-cancel');
    cancellation.throwIfRequested();
    await reviewAction(renderer, '#task-drawer [data-task-drawer-control="cancel-wait"]', 'waiting-cancel');
    const cancelledDrawer = await drawerShowing(renderer, offlineIntent, 'cancelled', 'cancelled-drawer');
    requireJourney(cancelledDrawer?.pill === '已取消' && cancelledDrawer.bar?.status === '已取消 · 未发送任何内容' &&
      barActions(cancelledDrawer) === 'run-link:查看运行:enabled', 'cancelled-bar', cancelledDrawer?.bar);
    const cancelledAnalysis = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    // Terminal, before any dispatch, without provider work — and never 已中断, which OFF-012 keeps for a Run that can resume.
    requireJourney(cancelledAnalysis?.state === 'cancelled' && cancelledAnalysis.run?.state === 'cancelled' && cancelledAnalysis.run.stateLabel === '已取消 · 未启动' &&
      cancelledAnalysis.run.attempt === null && cancelledAnalysis.taskOutcome === null &&
      JSON.stringify(cancelledAnalysis.run.transitions.map((transition) => transition.state)) === JSON.stringify(['authorized', 'awaiting-connectivity', 'cancelled']),
    'cancelled-run', { state: cancelledAnalysis?.state, run: cancelledAnalysis?.run });

    at('connectivity-wait-again');
    cancellation.throwIfRequested();
    // Cancelling freed the Book: the same mode is prepared again, and started again to wait for the network.
    await startUpdate(renderer, 'sync-current', '同步到当前稿件', 'again-sync-click');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, 'again-sync-prepared', 120_000);
    const preparedAgain = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    requireJourney(preparedAgain?.state === 'prepared' && preparedAgain.taskIntent?.taskIntentId !== offlineIntent, 'again-sync-plan');
    const againIntent = preparedAgain.taskIntent.taskIntentId;
    await drawerShowing(renderer, againIntent, 'offline', 'again-offline-drawer');
    await reviewAction(renderer, '#task-drawer [data-task-drawer-control="start-when-online"]', 'again-start-when-online');
    await drawerShowing(renderer, againIntent, 'waiting', 'again-waiting-drawer');

    at('connectivity-online-dispatch');
    cancellation.throwIfRequested();
    // The network returns. The drawer showing the waiting Run asks Reconnect Preflight on its own clock; the plan it
    // bound still stands, so the Run enters the one slot and runs to its end (OFF-008).
    await writeFile(connectivityPath, 'online');
    await waitFor(renderer, `['settled','failed','interrupted'].includes(document.querySelector('.baseline-analysis-card')?.dataset.analysisState)`, 'online-settled', 180_000);
    const onlineSettled = await renderer.evaluate(`window.ai7.inspectBaselineAnalysis()`);
    const onlineStates = onlineSettled?.run?.transitions?.map((transition) => transition.state) ?? [];
    requireJourney(onlineSettled?.state === 'settled' && onlineSettled.taskIntent?.taskIntentId === againIntent &&
      JSON.stringify(onlineStates.slice(0, 4)) === JSON.stringify(['authorized', 'awaiting-connectivity', 'admitted', 'executing']) &&
      onlineSettled.run?.attempt !== null && onlineSettled.taskOutcome?.resultSetRevisionId === onlineSettled.resultSetRevision?.revisionId,
    'online-settled-run', { state: onlineSettled?.state, transitions: onlineStates });
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' && document.querySelector('#task-drawer .task-bar-status')?.textContent==='已完成' && document.querySelector('#task-drawer [data-task-drawer-control="run-link"]')?.textContent==='查看运行' && !document.querySelector('#task-drawer [data-task-drawer-control="cancel-wait"]')`, 'online-bar-settled');

    // ---- 审阅 (Issue #417, plan slice S69; editor-surfaces §4; V2-UX-REV-001 to REV-013, MARK-010) ----
    at('review-relaunch');
    await closeOwnedBrowser();
    cancellation.throwIfRequested();
    modelAdapterIdentity = REVIEW_FIXTURE_IDENTITY;
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'review-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'review-open-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'review-open-book-manuscript');

    at('review-destination');
    await openReviewDestination(renderer, 'review-destination');
    // Nothing reviewed yet: every category the model reads is 未审阅, and the two whose basis does not exist
    // yet are 不可用 with their reason (V2-UX-REV-007, REV-013).
    await assertRenderer(renderer, `(() => { const rows=Array.from(document.querySelectorAll('table.review-coverage tbody tr[data-review-category]')); const state=Object.fromEntries(rows.map((row)=>[row.dataset.reviewCategory, row.dataset.coverage])); return rows.length===9 && document.querySelector('.review-workspace-card')?.dataset.reviewState==='empty' && state['series-consistency']==='unavailable' && state['cross-deliverable-consistency']==='unavailable' && ['typos-and-usage','style-and-format','academic-integrity','publication-risk','literary-expression'].every((id)=>state[id]==='never'); })()`, 'review-coverage-never');

    at('review-sheet');
    await reviewAction(renderer, '[data-review-action="new-review"]', 'review-new');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true`, 'review-sheet-open');
    // Nine categories and none preselected, the unavailable two saying why; four scopes and none
    // preselected; the four consequence lines; the quick start waits for a Default Execution Rule.
    await assertRenderer(renderer, `(() => { const sheet=document.querySelector('dialog.review-sheet'); const boxes=Array.from(sheet.querySelectorAll('input[type=checkbox][name="review-category"]')); const scopes=Array.from(sheet.querySelectorAll('input[name="review-scope"]')); const disabled=boxes.filter((box)=>box.disabled); const quick=sheet.querySelector('[data-review-action="quick-start"]'); const terms=Array.from(sheet.querySelectorAll('dl.review-consequences dt')).map((term)=>term.textContent); return boxes.length===9 && boxes.every((box)=>!box.checked) && JSON.stringify(disabled.map((box)=>box.value).sort())===JSON.stringify(['cross-deliverable-consistency','series-consistency']) && disabled.every((box)=>(box.dataset.unavailableReason??'').length>0) && scopes.length===4 && scopes.every((scope)=>!scope.checked) && quick instanceof HTMLButtonElement && quick.disabled && (sheet.querySelector('.review-quick-start-reason')?.textContent??'').includes('快速开始默认') && JSON.stringify(terms)===JSON.stringify(['会读取','会发送','不会做','费用']); })()`, 'review-sheet-contract');

    at('review-prepare');
    await assertRenderer(renderer, `(() => { const sheet=document.querySelector('dialog.review-sheet'); for (const id of ['typos-and-usage','style-and-format','plot-consistency']) { const box=sheet.querySelector('input[name="review-category"][value="'+id+'"]'); if(!(box instanceof HTMLInputElement)||box.disabled)return false; box.click(); } const whole=sheet.querySelector('input[name="review-scope"][value="whole"]'); if(!(whole instanceof HTMLInputElement)||whole.disabled)return false; whole.click(); const prepare=sheet.querySelector('[data-review-action="prepare"]'); if(!(prepare instanceof HTMLButtonElement)||prepare.disabled)return false; prepare.click(); return true; })()`, 'review-prepare-start');
    // Synchronized delta with Issue #418 (S72 D4): the prepared Run is one line on ②B; its plan opens in the
    // Task Drawer. Synchronized delta with Issue #420 (S74a A5): the Run's one approval left ②B for the
    // drawer's bar, so ②B offers 查看计划并开始 beside 返回修改 and no authorization button.
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='prepared' && document.querySelector('section.review-plans')?.dataset.reviewCategories==='typos-and-usage,style-and-format,plot-consistency'`, 'review-prepared', 120_000);
    const preparedReview = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
    const taskBacked = (preparedReview?.categories ?? []).filter((category) => (category.planEnvelopeDigest ?? '').length === 64);
    requireJourney(preparedReview?.state === 'prepared' && UUID_PATTERN.test(preparedReview.reviewRunId) &&
      JSON.stringify(preparedReview.categories.map((category) => category.categoryId)) === JSON.stringify(['typos-and-usage', 'style-and-format', 'plot-consistency']) &&
      JSON.stringify(taskBacked.map((category) => category.categoryId)) === JSON.stringify(['typos-and-usage', 'style-and-format']), 'review-prepared-run', preparedReview?.categories);
    await assertRenderer(renderer, `(() => { const plans=document.querySelector('section.review-plans'); const open=plans?.querySelector('[data-review-action="view-plan"]'); return plans?.querySelector('.task-plan-summary-line')?.textContent===${JSON.stringify(`计划：3 个类别，授权一次后逐类审阅 · ${preparedReview.scope.label} · 任务输入修订版 ${preparedReview.manuscript.revisionLabel}`)} && open instanceof HTMLButtonElement && open.textContent==='查看计划并开始' && open.dataset.taskPlanOpen==='review-run' && plans.querySelector('[data-review-action="revise"]')?.textContent==='返回修改' && document.querySelectorAll('[data-review-action="authorize"]').length===0 && !plans.querySelector('.review-authorize-note') && ${AUTHORIZE_LABELED_BUTTONS}===0 && document.querySelector('dialog.review-sheet')?.open!==true; })()`, 'review-plans');
    // One step per category — the leads read the baseline and freeze no model plan — and 汇总; each
    // model-read category's own frozen plan one step away in 查看技术详情 (S72 D7).
    const reviewDrawer = await drawerShowing(renderer, preparedReview.reviewRunId, 'ready', 'review-drawer');
    requireJourney(reviewDrawer?.kind === 'review-run' && reviewDrawer.pill === '尚未开始' && reviewDrawer.version === null &&
      reviewDrawer.chips.position === '全书' && reviewDrawer.steps.length === 4 &&
      reviewDrawer.steps[0].startsWith('逐章审读：') && reviewDrawer.steps[1].startsWith('逐章审读：') &&
      reviewDrawer.steps[2].startsWith('读取基线分析的线索：') && reviewDrawer.steps[3] === '汇总 → 审阅报告' &&
      taskBacked.every((category) => reviewDrawer.technical[`category:${category.categoryId}`]?.includes(`计划权限边界 ${category.planEnvelopeDigest}`)) &&
      reviewDrawer.technical['category:plot-consistency']?.endsWith('直接读取基线分析的线索，没有任务') &&
      JSON.stringify(reviewDrawer.participation) === JSON.stringify(['预计无需中途参与', '结束后：每一类完成后，它的发现立即可以处理：修改建议由你接受并应用，批注由你标记为已处理或忽略并说明']) &&
      reviewDrawer.actions === 0 && reviewDrawer.footer === '计划说明，不是运行授权', 'review-drawer-plan', reviewDrawer);

    at('review-bar-ready');
    // Issue #420 (S74a): the Run's one approval is the bar's 开始任务; the categories' deterministic route
    // needs no credential, so it is offered while the Book's credential stays `missing`.
    requireJourney(reviewDrawer.bar?.state === 'ready' && reviewDrawer.bar.start === 'ready' &&
      reviewDrawer.bar.summary === `《${bookName}》 · 全书 · 主编辑角色 · 未设置任务预算上限 · 产出：审阅发现与审阅报告 · 不改稿` &&
      reviewDrawer.bar.statement === BAR_STATEMENT && reviewDrawer.bar.note === null &&
      barActions(reviewDrawer) === 'start:开始任务:enabled|revise:返回修改:disabled|save-draft:保存草稿:enabled',
    'review-bar-ready', reviewDrawer.bar);

    at('review-authorize');
    // Synchronized delta with Issue #420 (S74a A2): one activation of the bar's 开始任务 records the Run's one
    // approval and hands it to its drive loop; ②B beside the drawer follows the Run to its end.
    await reviewAction(renderer, '#task-drawer [data-task-drawer-control="start"]', 'review-authorize-click');
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='settled'`, 'review-settled', 180_000);
    const reviewed = await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`);
    const reviewedCategories = reviewed?.run?.categories ?? [];
    // Each category settled on its own; a quotation that could not be anchored stays out of the marks, and
    // every other finding of a model-read category became a mark on the manuscript (V2-UX-REV-008, MARK-010).
    requireJourney(reviewed?.run?.state === 'settled' &&
      reviewedCategories.map((category) => `${category.categoryId}:${category.state}`).join('|') === 'typos-and-usage:settled|style-and-format:settled|plot-consistency:settled' &&
      reviewedCategories[0].findingsCount > 0 && reviewedCategories[0].excludedCount === 2 && reviewedCategories[1].findingsCount > 0 && reviewedCategories[1].excludedCount === 1 &&
      reviewed.run.findings.filter((finding) => finding.categoryId !== 'plot-consistency').every((finding) => finding.markId !== null && finding.status === 'pending') &&
      reviewed.run.findings.filter((finding) => finding.categoryId === 'typos-and-usage').every((finding) => finding.output === 'change-suggestion' && finding.replacement !== null),
    'review-run-settled', { state: reviewed?.run?.state, categories: reviewedCategories.map((category) => [category.categoryId, category.state, category.findingsCount, category.excludedCount]) });
    await assertRenderer(renderer, `document.querySelectorAll('ol.review-progress > li[data-category-state="settled"]').length===3 && document.querySelectorAll('section.review-group[data-review-category]').length>=2`, 'review-groups');
    // The drawer beside ②B read the plan again as the Run moved; it now states the Run's end.
    const settledReviewDrawer = await drawerShowing(renderer, preparedReview.reviewRunId, 'settled', 'review-drawer-settled');
    requireJourney(settledReviewDrawer?.pill === '已完成' && settledReviewDrawer.drift === null && typeof settledReviewDrawer.technical.authorization === 'string' &&
      settledReviewDrawer.bar?.state === 'started' && settledReviewDrawer.bar.status === '已完成' && barActions(settledReviewDrawer) === 'run-link:查看审阅:enabled',
      'review-drawer-settled-plan', settledReviewDrawer);

    at('review-marks-on-manuscript');
    // A finding of 审阅 is the mark on the manuscript: 回到原文 opens the text at it with its card, which
    // names the category that produced it (MARK-008, MARK-010).
    const typosFinding = reviewed.run.findings.find((finding) => finding.categoryId === 'typos-and-usage' && finding.markId !== null);
    requireJourney(typosFinding !== undefined, 'review-typos-finding-marked');
    await reviewAction(renderer, `article.review-finding[data-finding-id="${typosFinding.findingId}"] [data-review-action="go-to-text"]`, 'review-go-to-text');
    await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"] [data-mark-id="${typosFinding.markId}"]')?.dataset.markSource==='ai7' && (document.querySelector('[data-mark-card]')?.textContent??'').includes('AI7 · 审阅「错别字与规范用语」')`, 'review-mark-and-card', 30_000);
    await openReviewDestination(renderer, 'review-destination-again');
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='settled'`, 'review-destination-again-settled');

    at('review-batch-apply');
    // 错别字与规范用语 in one confirmation: the strip states the exact write scope before 确认应用, and one
    // Effect writes every listed suggestion (V2-UX-REV-006, PDEC-012, EAPP-003).
    const beforeBatch = await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`);
    const batchable = beforeBatch.run.findings.filter((finding) => finding.categoryId === 'typos-and-usage' && finding.status === 'pending' && finding.markStatus === 'open' && finding.anchorState === 'exact');
    requireJourney(batchable.length > 1, 'review-batch-candidates', { count: batchable.length });
    await reviewAction(renderer, 'section.review-group[data-review-category="typos-and-usage"] [data-review-action="batch-prepare"]', 'review-batch-prepare');
    await waitFor(renderer, `document.querySelector('section.review-batch-strip[data-review-category="typos-and-usage"]')?.dataset.reviewBatchState==='ready'`, 'review-batch-ready');
    await assertRenderer(renderer, `(() => { const strip=document.querySelector('section.review-batch-strip'); const count=Number(strip?.dataset.reviewBatchCount); return count===${batchable.length} && strip.querySelectorAll('ol.review-batch-items > li[data-finding-id]').length===count && (strip.querySelector('.review-batch-scope')?.textContent??'').startsWith('将把 '+count+' 条修改建议写入稿件') && strip.querySelector('[data-review-action="batch-confirm"]')?.textContent==='确认应用'; })()`, 'review-batch-scope');
    await reviewAction(renderer, 'section.review-batch-strip [data-review-action="batch-confirm"]', 'review-batch-confirm');
    await waitFor(renderer, `(() => { const ids=${JSON.stringify(batchable.map((finding) => finding.findingId))}; return ids.every((id)=>document.querySelector('article.review-finding[data-finding-id="'+id+'"]')?.dataset.status==='handled'); })()`, 'review-batch-handled', 60_000);
    const afterBatch = await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`);
    requireJourney(afterBatch?.manuscript?.journalSequence === beforeBatch.manuscript.journalSequence + 1 &&
      batchable.every((finding) => afterBatch.run.findings.find((after) => after.findingId === finding.findingId)?.markStatus === 'applied'),
    'review-batch-one-effect', { before: beforeBatch.manuscript.journalSequence, after: afterBatch?.manuscript?.journalSequence });

    at('review-ignore-with-reason');
    // 忽略并说明 needs a reason, recorded as a Quality Signal, and the finding reads 已忽略 (V2-UX-REV-004).
    const ignorable = afterBatch.run.findings.find((finding) => finding.categoryId === 'style-and-format' && finding.status === 'pending');
    requireJourney(ignorable !== undefined, 'review-ignorable');
    const ignoreReason = '体例由编辑部统一处理，这一处保留作者原样。';
    await reviewAction(renderer, `article.review-finding[data-finding-id="${ignorable.findingId}"] [data-review-action="ignore"]`, 'review-ignore');
    await assertRenderer(renderer, `(() => { const field=document.querySelector('article.review-finding[data-finding-id="${ignorable.findingId}"] textarea[data-review-field="ignore-reason"]'); if(!(field instanceof HTMLTextAreaElement))return false; field.value=${JSON.stringify(ignoreReason)}; field.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, 'review-ignore-reason');
    await reviewAction(renderer, `article.review-finding[data-finding-id="${ignorable.findingId}"] [data-review-action="ignore-confirm"]`, 'review-ignore-confirm');
    await waitFor(renderer, `document.querySelector('article.review-finding[data-finding-id="${ignorable.findingId}"]')?.dataset.status==='ignored'`, 'review-ignored');
    const afterIgnore = await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`);
    const ignored = afterIgnore?.run?.findings?.find((finding) => finding.findingId === ignorable.findingId);
    requireJourney(ignored?.status === 'ignored' && ignored.ignoreReason === ignoreReason && ignored.markStatus === 'removed', 'review-ignored-recorded', { status: ignored?.status, markStatus: ignored?.markStatus });

    at('review-report');
    // The versioned 审阅报告 with its four parts; export belongs to the deliverables (V2-UX-REV-009).
    await reviewAction(renderer, '[data-review-action="generate-report"]', 'review-report-generate');
    await waitFor(renderer, `document.querySelector('section.review-report')?.dataset.reportVersion==='1'`, 'review-report-version');
    await assertRenderer(renderer, `(() => { const report=document.querySelector('section.review-report'); const parts=Array.from(report.querySelectorAll('section.review-report-part[data-report-part] > h6')).map((heading)=>heading.textContent); const exporter=report.querySelector('[data-review-action="export"]'); return JSON.stringify(parts)===JSON.stringify(['概览表','必须处理的事项','各类别摘要','附录']) && exporter instanceof HTMLButtonElement && exporter.disabled; })()`, 'review-report-parts');

    at('review-coverage-moves');
    // The batch wrote the manuscript, so what those two categories read is no longer the current text and
    // both need review; the row offers only what changed (V2-UX-REV-007).
    await assertRenderer(renderer, `(() => { const row=(id)=>document.querySelector('table.review-coverage tbody tr[data-review-category="'+id+'"]'); return row('typos-and-usage')?.dataset.coverage==='needs-review' && row('style-and-format')?.dataset.coverage==='needs-review' && row('typos-and-usage').querySelector('[data-review-action="rereview-changed"]')?.textContent==='只审改动过的章'; })()`, 'review-coverage-needs-review');

    at('review-return-to-analysis');
    await assertRenderer(renderer, `(() => { const button=Array.from(document.querySelectorAll('[data-screen="book-review"] .workbench-actions button')).find((item)=>item.textContent==='打开稿件'); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, 'review-open-manuscript');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'review-manuscript');
    await openAnalysisDestination(renderer, 'review-return-analysis');
    cancellation.throwIfRequested();

    at('zero-activity');
    // Synchronized delta with Issue #418: the Task Drawer, open beside ②A since 审阅, holds no action of
    // the surfaces that raise a Task — the plan authorizes nothing (PLAN-007). Synchronized delta with Issue
    // #420: its only start is its own bar's, and no card anywhere carries one.
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.baseline-analysis-card'); return card?.dataset.analysisState==='settled' && card.dataset.resultRevisionOrdinal==='6' && ${ONLY_ANALYSIS_ACTIONS} && !document.querySelector('[data-analysis-action="prepare"], [data-analysis-action="authorize"]') && !document.querySelector('#task-drawer [data-analysis-action], #task-drawer [data-review-action], #task-drawer [data-task-authorization-action]') && !Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress|effect|enrol|apply|export/i.test(key) && ![...${JSON.stringify(CHANGE_SUGGESTION_APPLY_MEMBERS)}, ...${JSON.stringify(EXPORT_MEMBERS)}].includes(key)); })()`, 'no-execution-surface');
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
