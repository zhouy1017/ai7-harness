import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installJourneyCancellationCleanup, reportJourneyFailure } from './controller.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const SIDECAR_REVISION_2_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
const TASK_GOAL = '分析当前书稿的结构与叙事连贯性，列出供编辑复核的重点。';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
let location = 'entry';

function at(next) { location = next; }
function requireJourney(condition, name) { if (!condition) throw new Error(`J-03/${name}`); }
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
  requireJourney(!Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
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

async function createLoopbackSentinel() {
  let observedRequests = 0;
  let runtimeFault = false;
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
    close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
  };
}

async function createRendererManager(browser) {
  const root = await browser.newBrowserCDPSession();
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
    const { sessionId } = await root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
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
      await root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
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
      const targets = (await root.send('Target.getTargets')).targetInfos.filter((item) => item.type === 'page');
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

async function importSample1(renderer) {
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
  await click(renderer, '确认书名并复核', 'import-review');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'import-review-ready');
  at('sample1-import-review');
  await assertRenderer(renderer, `(() => { const acceptance=document.querySelector('#accept-import-degradation'); if(!(acceptance instanceof HTMLInputElement)||acceptance.checked)return false; acceptance.click(); return acceptance.checked; })()`, 'import-degradation-explicit');
  await waitFor(renderer, `Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='按上述降级方式新建图书并导入稿件'&&!button.disabled)`, 'import-degradation-accepted');
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

async function saveEditorSuffix(renderer, suffix, expectedSequence) {
  await click(renderer, '打开稿件', 'edit-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, 'edit-ready');
  await assertRenderer(renderer, `(() => { const block=document.querySelector('[data-testid="manuscript-editor"] [data-block-id]'); if(!(block instanceof HTMLElement))return false; block.focus(); const range=document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText',false,${JSON.stringify(suffix)}); return block.textContent?.endsWith(${JSON.stringify(suffix)}); })()`, 'edit-inserted');
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='保存当前编辑')?.disabled`, 'edit-dirty');
  await click(renderer, '保存当前编辑', 'edit-save');
  await waitFor(renderer, `document.querySelector('#persistence-status')?.dataset.tone==='success' && document.querySelector('#persistence-status')?.textContent.includes('修订日志')`, 'edit-durable', 120_000);
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

async function main() {
  parseJourney();
  let browser;
  let renderer;
  let loopback;
  let runRoot;
  let tempParent;
  let dataRoot;
  let launchForCleanup;
  let credentialMutationReached = false;
  let credentialRemoved = false;
  let syntheticSecret;
  let cleanupPromise;
  const cleanup = () => (cleanupPromise ??= (async () => {
    let cleanupFailure;
    const removeCredentialThroughProduct = async () => {
      if (!credentialMutationReached || credentialRemoved || renderer === undefined) return credentialRemoved;
      const state = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`);
      if (state === null || state.credentialOperationState === 'missing') {
        credentialRemoved = true;
        return true;
      }
      await renderer.evaluate(`window.ai7.removeModelServiceCredential()`);
      const after = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`);
      credentialRemoved = after === null || after.credentialOperationState === 'missing';
      return credentialRemoved;
    };
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        cleanupFailure = error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        await browser?.close().catch(() => undefined);
        browser = undefined;
        renderer = undefined;
        try {
          await launchForCleanup();
          await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true'`, 'credential-cleanup-ready');
          await removeCredentialThroughProduct();
          cleanupFailure = undefined;
        } catch (error) {
          cleanupFailure = error;
        }
      }
    }
    await browser?.close().catch((error) => { cleanupFailure ??= error; });
    browser = undefined;
    renderer = undefined;
    await loopback?.close().catch(() => undefined);
    loopback = undefined;
    if (runRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        await assertSecretsAbsentFromDataRoot(dataRoot, [syntheticSecret]).catch((error) => { cleanupFailure ??= error; });
      }
      requireJourney(tempParent !== undefined && dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j03-e2e-') && (await realpath(runRoot)) === runRoot, 'cleanup-target');
      await rm(runRoot, { recursive: true, force: true });
      runRoot = undefined;
    }
    if (credentialMutationReached) requireJourney(credentialRemoved, 'credential-cleanup');
    if (cleanupFailure !== undefined) throw cleanupFailure;
  })());
  const cancellation = installJourneyCancellationCleanup(cleanup);
  try {
    at('controller-loopback');
    loopback = await createLoopbackSentinel();
    at('controller-imports');
    const denial = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
    (await import(pathToFileURL(denial).href)).installNodeNetworkDenial();
    const { electronExecutable } = await import('../tools/electron-runtime.mjs');
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    runRoot = await mkdtemp(join(tempParent, 'ai7-j03-e2e-'));
    dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const args = [
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
      '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
      resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      '--j03-picker-path', SAMPLE1_PATH,
    ];
    requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
    launchForCleanup = async () => {
      browser = await chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      renderer = await (await createRendererManager(browser))();
      return renderer;
    };

    at('exact-sample1');
    const sample = await lstat(SAMPLE1_PATH);
    requireJourney(sample.isFile() && !sample.isSymbolicLink() && sample.size === SAMPLE1_BYTES &&
      (await digestFile(SAMPLE1_PATH)) === SAMPLE1_SHA256, 'sample1-identity');
    await launchForCleanup();

    at('renderer-ready');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'ready');
    at('renderer-api-boundary');
    await assertRenderer(renderer, `typeof globalThis.process==='undefined' && typeof globalThis.require==='undefined'`, 'renderer-isolation');
    at('renderer-task-api');
    await assertRenderer(renderer, `typeof window.ai7.inspectTaskAuthorization==='function' &&
      typeof window.ai7.prepareTaskAuthorization==='function' &&
      typeof window.ai7.authorizeTaskAuthorization==='function'`, 'renderer-task-api');
    at('renderer-zero-execution-api');
    await assertRenderer(renderer, `!Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key))`, 'renderer-zero-execution-api');

    at('sample1-import');
    const imported = await importSample1(renderer);

    at('artifact-revision2');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="install-disabled"]')`, 'artifact-install-ready');
    at('artifact-install');
    await click(renderer, '获取并安装（保持停用）', 'artifact-install');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'artifact-enable-ready');
    at('artifact-enable');
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
    syntheticSecret = randomBytes(48).toString('base64url');
    await fill(renderer, '#main-editorial-connection-name', 'J-03 主编辑连接', 'model-name');
    await fill(renderer, '#main-editorial-credential', syntheticSecret, 'model-secret');
    credentialMutationReached = true;
    await click(renderer, '保护并保存', 'model-save');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('[data-credential-state="ready"]')`, 'model-saved');
    at('model-credential-saved');
    const readyConnection = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(UUID_PATTERN.test(readyConnection?.credentialReference) && readyConnection?.credentialOperationState === 'ready', 'model-ready-reference');
    await click(renderer, '移除', 'model-remove');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='setup-required' && document.querySelector('[data-credential-state="missing"]')`, 'model-removed');
    at('model-credential-removed');
    const missingConnection = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(missingConnection?.credentialReference === readyConnection.credentialReference && missingConnection?.credentialOperationState === 'missing', 'model-missing-stable-reference');
    credentialRemoved = true;
    await click(renderer, '返回', 'model-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'model-back-library');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'book-reopen');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(imported.bookId)}]')`, 'book-reopened');

    at('acknowledged-edit');
    await saveEditorSuffix(renderer, '，J-03 授权前已确认编辑', 1);
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
    await click(renderer, '准备任务授权计划', 'prepare-click');
    await waitFor(renderer, `document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='prepared'`, 'prepared', 120_000);
    const prepared = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(prepared?.state === 'prepared' && prepared.taskIntent?.goal === TASK_GOAL &&
      prepared.checkpoint?.revisionLabel === 'r2' && prepared.checkpoint?.createdForDirtyJournal === true &&
      prepared.checkpoint?.journalSequence === 1 && prepared.checkpoint?.purpose === 'Task Input / 任务输入' &&
      DIGEST_PATTERN.test(prepared.checkpoint?.revisionDigest) && prepared.manuscriptPin?.revisionId === prepared.checkpoint.revisionId &&
      prepared.manuscriptPin?.revisionDigest === prepared.checkpoint.revisionDigest &&
      prepared.manuscriptPin?.sourceVersionId === imported.sourceVersionId && prepared.manuscriptPin?.sourceDigest === SAMPLE1_SHA256 &&
      JSON.stringify(prepared.runSourceScope?.readableScopeKinds) === JSON.stringify(['current-book-primary-manuscript-revision']) &&
      prepared.runSourceScope?.sourceVersionEvidence?.sourceVersionId === imported.sourceVersionId && prepared.runSourceScope?.sourceVersionEvidence?.readable === false &&
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
    await assertRenderer(renderer, `(() => { const card=document.querySelector('.task-authorization-card'); const button=card?.querySelector('[data-task-authorization-action="authorize-no-dispatch"]'); return card?.textContent.includes('仅血缘证据，不属于可读范围') && card.textContent.includes('空（无）') && card.textContent.includes('development-ci · v1 · 拒绝 · 0 次实时传输') && button?.textContent==='记录本次运行授权（不派发）'; })()`, 'prepared-preview');
    const repeatedPreparation = await renderer.evaluate(`window.ai7.prepareTaskAuthorization({goal:${JSON.stringify(TASK_GOAL)}})`);
    requireJourney(repeatedPreparation?.state === 'completed' && repeatedPreparation.result?.checkpoint?.revisionId === prepared.checkpoint.revisionId && repeatedPreparation.result?.planEnvelope?.digest === prepared.planEnvelope.digest, 'prepared-idempotent-no-empty-revision');

    at('authorization-recorded');
    await click(renderer, '记录本次运行授权（不派发）', 'authorize-click');
    await waitFor(renderer, `document.querySelector('[data-task-authorization-terminal="recorded-not-dispatched"]')?.textContent==='已记录授权 · 未派发'`, 'authorized');
    const authorized = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(authorized?.state === 'authorized' && UUID_PATTERN.test(authorized.authorization?.authorizationId) &&
      authorized.authorization?.origin === 'standard-direct' && authorized.authorization?.planEnvelopeDigest === prepared.planEnvelope.digest &&
      UUID_PATTERN.test(authorized.runRecord?.runRecordId) && authorized.runRecord?.state === 'recorded-not-dispatched' &&
      authorized.runRecord?.dispatched === false && authorized.runRecord?.terminalLabel === '已记录授权 · 未派发' &&
      authorized.actions?.canPrepare === false && authorized.actions?.canAuthorize === false &&
      authorized.namedNonEffects?.length === 6, 'authorized-terminal');
    const repeatedAuthorization = await renderer.evaluate(`window.ai7.authorizeTaskAuthorization({taskIntentId:${JSON.stringify(authorized.taskIntent.taskIntentId)},planEnvelopeDigest:${JSON.stringify(authorized.planEnvelope.digest)}})`);
    requireJourney(repeatedAuthorization?.authorization?.authorizationId === authorized.authorization.authorizationId && repeatedAuthorization?.runRecord?.runRecordId === authorized.runRecord.runRecordId, 'authorization-idempotent');

    at('post-authorization-edit');
    await saveEditorSuffix(renderer, '，J-03 授权后继续编辑', 2);
    await waitFor(renderer, `document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='authorized'`, 'post-edit-record');
    const afterEdit = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(afterEdit?.checkpoint?.revisionId === authorized.checkpoint.revisionId &&
      afterEdit?.checkpoint?.revisionDigest === authorized.checkpoint.revisionDigest &&
      afterEdit?.authorization?.authorizationId === authorized.authorization.authorizationId &&
      afterEdit?.runRecord?.runRecordId === authorized.runRecord.runRecordId, 'post-edit-immutable');

    at('restart-immutable');
    await browser.close();
    browser = undefined;
    renderer = undefined;
    await launchForCleanup();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    await assertRenderer(renderer, `(() => { const button=document.querySelector('button[data-book-id=${JSON.stringify(imported.bookId)}]'); if(!(button instanceof HTMLButtonElement))return false; button.click(); return true; })()`, 'restart-open-book');
    await waitFor(renderer, `document.querySelector('.task-authorization-card')?.dataset.taskAuthorizationState==='authorized'`, 'restart-record-visible');
    const restarted = await renderer.evaluate(`window.ai7.inspectTaskAuthorization()`);
    requireJourney(restarted?.taskIntent?.taskIntentId === authorized.taskIntent.taskIntentId &&
      restarted?.checkpoint?.revisionId === authorized.checkpoint.revisionId && restarted?.planEnvelope?.digest === authorized.planEnvelope.digest &&
      restarted?.authorization?.authorizationId === authorized.authorization.authorizationId &&
      restarted?.runRecord?.runRecordId === authorized.runRecord.runRecordId && restarted?.runRecord?.dispatched === false,
    'restart-record-immutable');

    at('zero-activity');
    await assertRenderer(renderer, `document.querySelector('[data-task-authorization-terminal="recorded-not-dispatched"]')?.textContent==='已记录授权 · 未派发' &&
      !document.querySelector('.task-authorization-card button') &&
      !Object.keys(window.ai7).some((key)=>/provider|session|scheduler|payload|egress/i.test(key))`, 'no-execution-surface');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-network-provider-session');
  } finally {
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch(() => reportJourneyFailure('J-03', location));
