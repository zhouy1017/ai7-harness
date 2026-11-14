import { createWriteStream, existsSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DIRECT_EDIT, CAPTURE_JOURNAL_EDIT, journalEditPersisted, milestonePersisted, manuscriptBoundary, attachProductOutput, awaitWithinDeadline, installJourneyCancellationCleanup, journeyCheckFailure, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect, SIDEBAR, sidebarNavigate, SIDEBAR_LIBRARY_READY, runJ14DarkPass } from './controller.mjs';
import { CREDENTIAL_CLEANUP_SCHEMA_VERSION, assertSecretsAbsentFromDataRoot, recoverSyntheticCredentialCleanupState, removeSyntheticCredentialWithElectron } from './credential-cleanup.mjs';
import { fixedArchiveTime } from './composed-docx.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CDP_OPERATION_TIMEOUT_MS = 60_000;
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const LOOPBACK_CLOSE_TIMEOUT_MS = 5_000;
const BROWSER_CLOSE_TIMEOUT = journeyCheckFailure('J-12', 'browser-close-timeout');
const BROWSER_DISCONNECTED = journeyCheckFailure('J-12', 'browser-disconnected');
const RENDERER_CDP_FAILURE = journeyCheckFailure('J-12', 'renderer-cdp-response');
const RENDERER_CDP_TIMEOUT = journeyCheckFailure('J-12', 'renderer-cdp-timeout');
const RENDERER_SESSION_CLOSED = journeyCheckFailure('J-12', 'renderer-session-closed');
const LOOPBACK_CLOSE_TIMEOUT = journeyCheckFailure('J-12', 'loopback-close-timeout');
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
  const error = journeyCheckFailure('J-12', name);
  if (detail !== undefined) error.detail = detail;
  throw error;
}
function inside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

/** Seed synthetic author metadata through the real mark owner while Electron is closed; never edit ledger rows. */
async function seedModelAuthor(dataRoot, runRoot, book) {
  const { build } = await import('esbuild');
  const outfile = resolve(runRoot, 'model-author-store.mjs');
  await build({ entryPoints: [resolve(ROOT, 'src/service/store.ts')], outfile, bundle: true, platform: 'node',
    format: 'esm', target: 'node24', logLevel: 'silent', plugins: [{ name: 'runner-packages', setup(builder) {
      builder.onResolve({ filter: /^[^./]/ }, ({ path }) => isAbsolute(path) ? undefined
        : { path: import.meta.resolve(path), external: true });
    } }] });
  const { EditorialStore } = await import(pathToFileURL(outfile).href);
  const store = await EditorialStore.open(dataRoot, await realpath(ROOT));
  try {
    const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
    const block = window.blocks.find((entry) => entry.kind === 'paragraph' && Array.from(entry.text).length >= 4);
    requireJourney(block !== undefined, 'model-author-seed-anchor');
    const markId = store.createProducedEditorialMark({ ...book, blockId: block.blockId, fromGrapheme: 0, toGrapheme: 4,
      pinnedText: Array.from(block.text).slice(0, 4).join(''), kind: 'annotation', body: '公开合成模型批注',
      proposedText: null, rationale: null, atomicGroupId: null, basis: [],
      source: { kind: 'ai7', origin: 'task', label: '公开合成任务', taskId: randomUUID() },
      sourceModelBinding: { route: 'openai-platform', model: 'gpt-6-luna', reasoningEffort: 'high' } });
    store.markCleanShutdown();
    return markId;
  } finally { store.close(); }
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
    server.once('error', () => rejectListen(journeyCheckFailure('J-12', 'loopback-listen')));
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
    if (await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`).catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-12', name);
}

async function waitForRendererCount(manager, count, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const renderers = await manager.list();
    if (renderers.length === count) return renderers;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-12', name);
}

async function findRenderer(manager, expression, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const renderer of await manager.list()) {
      if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return renderer;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-12', name);
}

/**
 * What would name a configured provider a Model Role cannot bind (ADR 0073 §3), read from the checked-in provider
 * documents: each provider's and route's display name, each route id and each endpoint host — everything but the two
 * documents whose routes the Main Editorial Role may be configured to (Issue #811: DeepSeek official and OpenCode Go). Their
 * provider display names are what the 尚未支持 list may name, and nothing else on the screen.
 */
async function configuredUnboundProviderNames() {
  const directory = resolve(ROOT, 'config', 'providers');
  const names = new Set();
  const listed = new Set();
  const routes = new Set();
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.json') && !name.endsWith('.schema.json')).sort()) {
    const document = JSON.parse(await readFile(join(directory, file), 'utf8'));
    // The six Model Service routes are bound (Issue #1225 adds OpenCode Zen, Claude 官方 and Gemini 官方); every other provider is not.
    if (['deepseek-open-platform', 'opencode-go', 'openai-platform', 'opencode-zen', 'anthropic-claude', 'google-gemini'].includes(document.providerId)) continue;
    names.add(document.displayName);
    listed.add(document.displayName);
    for (const route of document.routes) {
      for (const name of [route.displayName, route.routeId, new URL(route.endpoint).hostname]) {
        names.add(name);
        routes.add(name);
      }
    }
  }
  return { names: [...names], listed: [...listed], routes: [...routes] };
}

async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), name);
}

/** #1376: exercise the actual progressive controls against browser-native form/select behavior. */
async function assertProgressiveSelect(renderer) {
  requireJourney(await renderer.evaluate(`(async () => {
    const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const form=document.createElement('form'), fieldset=document.createElement('fieldset');
    const label=document.createElement('label'); label.textContent='公开合成选项'; label.htmlFor='j12-native-select';
    const select=document.createElement('select'); select.id='j12-native-select'; select.name='choice';
    select.dataset.contract='native'; select.setAttribute('aria-label','公开合成选项'); select.required=true;
    for(let index=0;index<150;index++)select.add(new Option('选项 '+String(index).padStart(3,'0'),'v'+index,index===4,index===4));
    const status=document.createElement('p');status.setAttribute('role','status');
    fieldset.append(label,select); form.append(fieldset,status); document.querySelector('.model-service-settings').append(form); select.focus();
    let changes=0; form.addEventListener('change',()=>changes++);
    const untouched=document.createElement('select');
    const originalDescriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
    try {
      await frame();
      const trigger=select.nextElementSibling, popup=trigger?.nextElementSibling, list=popup?.querySelector('[role="listbox"]'), filter=popup?.querySelector('input');
      if(form.querySelector('[role="status"]')!==status)return false;
      if(!trigger?.matches('.ui-select-trigger')||document.activeElement!==trigger||!list||!filter||select.id!=='j12-native-select'||select.name!=='choice'||select.dataset.contract!=='native'||select.getAttribute('aria-label')!=='公开合成选项'||select.options.length!==150||select.value!=='v4'||select.tabIndex!==-1||select.getAttribute('aria-hidden')!=='true')return false;
      select.value='v13'; if(!trigger.textContent.includes('013')||changes)return false;
      select.selectedIndex=17; if(!trigger.textContent.includes('017'))return false;
      select.options[18].selected=true; if(select.value!=='v18'||!trigger.textContent.includes('018'))return false;
      select.options[18].text='更新后的选项'; select.remove(149); select.add(new Option('新增选项','added'));
      select.options[113].disabled=true; await frame();
      if(!trigger.textContent.includes('更新后的选项')||select.options.length!==150)return false;
      trigger.scrollIntoView({block:'center',behavior:'instant'}); await frame();
      trigger.click(); await frame();
      if(popup.hidden||filter.hidden||list.querySelectorAll('[role="option"]').length!==150||list.scrollHeight<=list.clientHeight||list.clientHeight>321)return false;
      if(list.querySelector('[aria-selected="true"]')?.lastElementChild?.textContent!=='✓')return false;
      const rect=popup.getBoundingClientRect(); if(rect.left<0||rect.right>innerWidth+1||rect.top<0||rect.bottom>innerHeight+1)return false;
      filter.value='013'; filter.dispatchEvent(new Event('input',{bubbles:true}));
      if(list.querySelectorAll('[role="option"]').length!==1||select.value!=='v18')return false;
      filter.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      if(select.value!=='v13'||changes!==1||!popup.hidden||document.activeElement!==trigger)return false;
      trigger.click(); filter.value='113'; filter.dispatchEvent(new Event('input',{bubbles:true}));
      list.querySelector('[role="option"]').click(); if(select.value!=='v13'||changes!==1||popup.hidden)return false;
      filter.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      if(!popup.hidden||document.activeElement!==trigger)return false;
      trigger.click();
      filter.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
      filter.value='选项 09'; filter.dispatchEvent(new Event('input',{bubbles:true}));
      filter.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
      if(select.value!=='v13'||popup.hidden||changes!==1)return false;
      filter.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
      if(list.querySelectorAll('[role="option"]').length!==10)return false;
      filter.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
      filter.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      if(select.value!=='v91'||changes!==2||!popup.hidden)return false;
      form.reset(); await frame(); if(select.value!=='v4'||!trigger.textContent.includes('004')||changes!==2)return false;
      trigger.click(); select.disabled=true; if(!trigger.disabled||!popup.hidden)return false;
      select.disabled=false; fieldset.disabled=true; await frame(); if(!trigger.disabled)return false;
      fieldset.disabled=false; await frame(); if(trigger.disabled)return false;
      select.replaceChildren(new Option('甲','a',true,true),new Option('乙','b'),new Option('丙','c'));
      await frame(); trigger.click(); if(!filter.hidden)return false;
      trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
      trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      if(select.value!=='c'||changes!==3)return false;
      trigger.click(); trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
      trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
      trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
      trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      if(select.value!=='a'||changes!==4||new FormData(form).get('choice')!=='a')return false;
      select.selectedIndex=-1; if(form.checkValidity()||document.activeElement!==trigger)return false;
      select.value='b'; select.dispatchEvent(new Event('change',{bubbles:true}));
      if(changes!==5||!trigger.textContent.includes('乙'))return false;
      trigger.click(); document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); if(!popup.hidden)return false;
      if(Object.hasOwn(untouched,'value')||Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set!==originalDescriptor.set)return false;
      form.remove(); await frame();
      return !trigger.isConnected && !popup.isConnected && !Object.hasOwn(select,'value') && !Object.hasOwn(select,'selectedIndex') && select.getAttribute('aria-hidden')===null && select.tabIndex===0;
    } finally { form.remove(); }
  })()`), 'select-native-progressive-contract');
}

/** #1372: complete ordinary settings may scroll vertically; controls must remain visible and usable at supported sizes. */
async function assertOrdinaryModelReachability(renderer) {
  const native = await renderer.evaluate(`({width:innerWidth,height:innerHeight,outerWidth,outerHeight})`);
  if (localDebugEnabled()) recordDebugDetail('J-12', `model-layout-native ${JSON.stringify(native)}`);
  for (const viewport of [native, { width: 1280, height: 800 }, { width: 1008, height: 681 }, { width: 640, height: 681 }]) {
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
    await waitFor(renderer, `innerWidth===${viewport.width} && innerHeight===${viewport.height}`, 'ordinary-model-supported-viewport');
    const geometry = await renderer.evaluate(`(async () => {
      const selectors=['select[aria-label="渠道"]','.model-credential-form input[type="password"]','[data-action="save-channel-credential"]','[data-action="retry-model-list"]','[data-action="remove-model-service-credential"]','input[aria-label="筛选模型"]','select[aria-label="AI7 使用的模型"]','input[aria-label="主编辑思考强度"]', 'input[aria-label="快速交互思考强度"]','[data-favorite-model]','[data-action="select-main-role-model"]','[data-action="select-fast-role-model"]','[data-action="use-model-for-both-roles"]','[data-action="test-flow-connection"]','[data-model-role="main-editorial"]','[data-model-role="fast-interaction"]'];
      const controls=[];
      for (const [index,selector] of selectors.entries()) {
        const native=document.querySelector(selector);
        const node=native instanceof HTMLSelectElement && native.classList.contains('ui-select-native') ? native.nextElementSibling : native;
        if(!(node instanceof HTMLElement))return {ok:false,width:innerWidth,height:innerHeight,missing:index,controls};
        node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
        const focusable=node.matches('input,select,button')&&!node.disabled;
        if(focusable)node.focus();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const box=node.getBoundingClientRect(), hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
        const header=document.querySelector('#context-header').getBoundingClientRect(), sidebar=document.querySelector('#app-sidebar').getBoundingClientRect();
        const visible=box.width>0&&box.height>0&&box.top>=header.bottom&&box.bottom<=innerHeight&&box.left>=sidebar.right&&box.right<=innerWidth&&!node.closest('[hidden],[aria-hidden="true"],[inert]')&&(hit===node||node.contains(hit));
        const focused=!focusable||(node.tabIndex>=0&&document.activeElement===node);
        controls.push({index,top:Math.round(box.top),bottom:Math.round(box.bottom),left:Math.round(box.left),right:Math.round(box.right),disabled:Number(Boolean(node.disabled)),visible:Number(visible),focused:Number(focused)});
        if(!visible||!focused)return {ok:false,width:innerWidth,height:innerHeight,controls};
      }
      return {ok:document.documentElement.scrollWidth<=innerWidth+1,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,controls};
    })()`);
    if (localDebugEnabled()) recordDebugDetail('J-12', `model-layout-reachability ${JSON.stringify(geometry)}`);
    requireJourney(geometry.ok, 'ordinary-model-controls-reachable', geometry);
  }
  await renderer.send('Emulation.clearDeviceMetricsOverride');
  await renderer.evaluate(`(() => { document.activeElement?.blur(); window.scrollTo({top:0,left:0,behavior:'instant'}); })()`);
}

async function dispatchTab(renderer) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
}

/** #1453: role defaults are saved by the visible action, then survive leaving and reopening settings. */
async function assertModelEffortDefaults(renderer) {
  const original = await renderer.evaluate(`window.ai7.getModelServiceSettings().then(settings => Object.fromEntries(settings.roles.filter(role => ['main-editorial','fast-interaction'].includes(role.roleId)).map(role => [role.roleId,role.binding?.reasoningEffort ?? 'off'])))`);
  const save = async (role, effort) => {
    await assertRenderer(renderer, `(() => { const input=document.querySelector('input[data-reasoning-effort="${role}"]'); if(!(input instanceof HTMLInputElement)||input.disabled)return false; input.focus(); input.value=${JSON.stringify(effort === 'off' ? '' : effort)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, 'model-effort-enter');
    const point = await renderer.evaluate(`(async () => { const button=document.querySelector('[data-action="select-${role}-role-model"]'); if(!(button instanceof HTMLButtonElement)||button.disabled)return null; button.scrollIntoView({block:'center',behavior:'instant'}); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); if(!button.isConnected)return null; const box=button.getBoundingClientRect(); const x=box.left+box.width/2,y=box.top+box.height/2; return {x,y,visible:box.top>=document.querySelector('#context-header').getBoundingClientRect().bottom && box.bottom<=innerHeight && document.elementFromPoint(x,y)===button}; })()`);
    requireJourney(point?.visible === true, 'model-effort-save-visible');
    await renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    const roleId = role === 'main' ? 'main-editorial' : 'fast-interaction';
    await waitFor(renderer, `window.ai7.getModelServiceSettings().then(settings => (settings.roles.find(role => role.roleId===${JSON.stringify(roleId)})?.binding?.reasoningEffort ?? 'off')===${JSON.stringify(effort)})`, 'model-effort-saved');
    await waitFor(renderer, `document.querySelector('[data-model-role="${roleId}"]')?.textContent.includes(${JSON.stringify(effort === 'off' ? '服务默认' : '@' + effort)})`, 'model-effort-role-label');
  };
  try {
    for (const [width, height] of [[1280,800],[1008,681]]) {
      if (width === 1280) at('model-effort-defaults-wide');
      else at('model-effort-defaults-gate');
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await waitFor(renderer, `innerWidth===${width} && innerHeight===${height}`, 'model-effort-viewport');
      await save('main', 'high');
      await save('fast', 'low');
      await assertRenderer(renderer, sidebarNavigate(SIDEBAR.settings), 'model-effort-leave');
      await waitFor(renderer, `document.querySelector('[data-screen="settings"]')`, 'model-effort-settings-ready');
      await click(renderer, '模型服务', 'model-effort-reopen');
      await waitFor(renderer, `document.querySelector('input[aria-label="主编辑思考强度"]')?.value==='high' && document.querySelector('input[aria-label="快速交互思考强度"]')?.value==='low' && document.querySelector('[data-model-role="main-editorial"]')?.textContent.includes('@high') && document.querySelector('[data-model-role="fast-interaction"]')?.textContent.includes('@low')`, 'model-effort-reopened-defaults');
      await save('fast', 'low');
      await waitFor(renderer, `window.ai7.getModelServiceSettings().then(settings => settings.roles.find(role=>role.roleId==='main-editorial')?.binding?.reasoningEffort==='high')`, 'model-effort-other-role-kept');
      await save('main', original['main-editorial']);
      await save('fast', original['fast-interaction']);
    }
  } finally {
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await renderer.evaluate(`document.activeElement?.blur(); window.scrollTo({top:0,left:0,behavior:'instant'})`);
  }
  at('model-service-first-save');
}

async function tabUntil(renderer, expression, name, maximumTabs = 12) {
  for (let count = 0; count < maximumTabs; count += 1) {
    await dispatchTab(renderer);
    if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return;
  }
  throw journeyCheckFailure('J-12', name);
}

async function click(renderer, label, name) {
  if (label === '向前浏览' || label === '向后浏览') await assertRenderer(renderer, manuscriptBoundary(label), name);
  if (label === '预览替换') await renderer.evaluate(`Array.from(document.querySelectorAll('.navigation-modes button')).find(button => button.textContent === '替换')?.click()`);
  if (label === '保存') { await renderer.evaluate(`document.querySelector('[data-testid="manuscript-editor"]').dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }))`); return; }
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>(item.textContent===${JSON.stringify(label)}||item.getAttribute('aria-label')===${JSON.stringify(label)})); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
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
  await click(renderer, '新建图书', 'empty-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-manuscript-state="empty"]')`, 'empty-created', 120_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId`);
  requireJourney(UUID_PATTERN.test(bookId), 'empty-book-id');
  return bookId;
}

async function importBook(renderer, title, bundled = false) {
  await click(renderer, bundled ? '导入示例书' : '导入稿件', 'import-open');
  await waitFor(renderer, `document.querySelector('[data-import-target-choices]')`, 'import-target');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if(!(radio instanceof HTMLInputElement))return false; radio.click(); return radio.checked; })()`, 'import-new-book');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement))return false; radio.click(); return radio.checked; })()`, 'import-relationship');
  await fill(renderer, '#book-title', title, 'import-title');
  await click(renderer, '查看导入详情', 'import-review');
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
  await waitFor(renderer, `document.querySelector('[data-import-relationship-choices]')`, 'existing-relationship');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement))return false; radio.click(); return radio.checked; })()`, 'existing-first-relationship');
  await click(renderer, '查看导入详情', 'existing-review');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'existing-review-ready');
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='导入为首份稿件'||item.textContent==='按上述降级方式导入为首份稿件'); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, 'existing-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"] .book-overview[data-book-id=${JSON.stringify(bookId)}][data-manuscript-state="populated"]')`, 'existing-imported', 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, 'existing-acknowledged', 180_000);
}

async function saveEdit(renderer, suffix) {
  const before = await renderer.evaluate(CAPTURE_JOURNAL_EDIT);
  requireJourney(before !== null, 'edit-scope');
  const inserted = await renderer.evaluate(`(() => { const editor=document.querySelector('[data-testid="manuscript-editor"]'); const block=editor?.querySelector('[data-block-id]'); if(!(block instanceof HTMLElement))return false; block.focus(); const range=document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); ${DIRECT_EDIT} && document.execCommand('insertText',false,${JSON.stringify(suffix)}); return block.textContent?.endsWith(${JSON.stringify(suffix)}); })()`);
  requireJourney(inserted === true, 'edit-inserted');
  await waitFor(renderer, `!(document.querySelector('[data-editor-persistence]')?.dataset.editorPersistence === 'confirmed')`, 'edit-dirty');
  await click(renderer, '保存', 'edit-save');
  await waitFor(renderer, journalEditPersisted(before, suffix), 'edit-durable', 120_000);
}

async function saveMilestone(renderer) {
  const before = await renderer.evaluate(CAPTURE_JOURNAL_EDIT);
  requireJourney(before !== null, 'milestone-scope');
  // Synchronized delta with Issue #409: the milestone form lives in the 导航 panel, which opens on demand.
  await assertRenderer(renderer, `(() => { const entry=document.querySelector('[data-edge-entry="navigation"]'); const panel=document.querySelector('#manuscript-navigation-panel'); if(!(entry instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return false; if(entry.getAttribute('aria-expanded')!=='true') entry.click(); return entry.getAttribute('aria-expanded')==='true' && !panel.hidden; })()`, 'milestone-navigation');
  await assertRenderer(renderer, `(() => { const menu=document.querySelector('[data-save-menu="manuscript"]'),details=document.querySelector('.milestone-section'); if(!(menu instanceof HTMLDetailsElement)||!(details instanceof HTMLDetailsElement))return false; menu.open=true; details.open=true; return true; })()`, 'milestone-open');
  await fill(renderer, '#milestone-label', 'J12 后续修订版', 'milestone-label');
  // Synchronized delta with Issue #414: a purpose is chosen from the unselected cards, not typed.
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('.milestone-section input[type="radio"][name="milestone-purpose"][value="stage-archive"]'); if(!(radio instanceof HTMLInputElement)||radio.disabled)return false; radio.click(); return radio.checked; })()`, 'milestone-purpose');
  await fill(renderer, '#milestone-note', '本地且离线。', 'milestone-note');
  // #1376 review F3: a valid, enabled save action must leave the arrow order when its subsection is collapsed.
  await assertRenderer(renderer, `(() => {
    const menu=document.querySelector('[data-save-menu="manuscript"]'),section=menu?.querySelector('.milestone-section'),outer=menu?.querySelector('summary'),summary=section?.querySelector('summary');
    const save=section?.querySelector('button'),exportAction=menu?.querySelector('.editor-save-menu-body > button');
    if(!section||!outer||!summary||!save||save.disabled||!exportAction)return false;
    section.open=false; outer.focus();
    const key=(value)=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
    key('ArrowDown');if(document.activeElement!==summary)return false;
    key('ArrowDown');if(document.activeElement!==exportAction)return false;
    key('ArrowDown');if(document.activeElement!==summary)return false;
    key('End');if(document.activeElement!==exportAction)return false;
    key('Home');if(document.activeElement!==summary)return false;
    key('ArrowUp');if(document.activeElement!==exportAction)return false;
    key('Home');summary.click();return section.open&&!save.disabled&&document.activeElement===summary;
  })()`, 'milestone-collapsed-menu-keyboard');
  await click(renderer, '保存里程碑版本', 'milestone-save');
  await waitFor(renderer, milestonePersisted(before, 'r2'), 'milestone-saved', 120_000);
  await assertRenderer(renderer, `document.querySelector('.editor-meta')?.textContent.includes('修订版 2')`, 'milestone-revision-caption');
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
    // The house offset's disclosure (Issue #429, EVAL-011a): computed or waiting, its method, and what 停用 does.
    offset: root.querySelector('.calibration-offset')?.dataset.calibrationOffset ?? null,
    offsetWaiting: root.querySelector('.calibration-offset-waiting')?.textContent ?? null,
    method: root.querySelector('.calibration-method')?.textContent ?? null,
    offEffect: root.querySelector('.calibration-off-effect')?.textContent ?? null,
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
  const error = journeyCheckFailure('J-12', name);
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
  let openAiCredentialMutationReached = false;
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
              const recovered = await recoverSyntheticCredentialCleanupState('J-12', dataRootForCleanup, runRoot);
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
                'J-12',
                electronExecutableForCleanup,
                productEnvironment(electronExecutableForCleanup),
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
      if (openAiCredentialMutationReached && dataRootForCleanup !== undefined && runRoot !== undefined) {
        try {
          const recovered = await recoverSyntheticCredentialCleanupState('J-12', dataRootForCleanup, runRoot, 'openai-platform');
          if (recovered.kind === 'reference') await removeSyntheticCredentialWithElectron('J-12', electronExecutableForCleanup,
            productEnvironment(electronExecutableForCleanup), recovered.credentialReference);
        } catch (error) { credentialCleanupFailure ??= error; }
      }
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
        throw credentialCleanupFailure ?? journeyCheckFailure('J-12', 'credential-cleanup-failed');
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
    const diagnosticsDestination = resolve(runRoot, 'diagnostics-export');
    await mkdir(diagnosticsDestination);
    await mkdir(resolve(shellRoot, 'crashes'));
    await writeFile(resolve(shellRoot, 'crashes', '2026-10-17T00-00-00.000Z-render-process-gone.json'), JSON.stringify({
      instant: '2026-10-17T00:00:00.000Z', kind: 'render-process-gone', reason: 'crashed', exitCode: 1,
      appVersion: '0.1.0', schemaRevision: 94, protocol: 188, platform: process.platform, arch: process.arch,
      electron: '43.4.1', uptimeSeconds: 1, stack: '    at <redacted-path>:12:3',
    }), { flag: 'wx' });
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    const launch = async (picker, savePath, startupDataRoot = dataRoot) => {
      const startupShellRoot = await ensureCanonicalDataDirectory(startupDataRoot, 'shell');
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${startupShellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', startupDataRoot,
        '--j12-observe-reveal', 'true', '--launcher-pid', String(process.pid),
        '--j12-diagnostics-folder', diagnosticsDestination,
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

    at('first-run-card');
    const onboardingRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'onboarding-data'), checkout);
    let onboardingManager = await launch(syntheticDocx, undefined, onboardingRoot);
    let [onboardingPage] = await waitForRendererCount(onboardingManager, 1, 'onboarding-initial-window');
    await waitFor(onboardingPage, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"] [data-onboarding-card="first-run"]')`, 'first-run-card-visible');
    await assertRenderer(onboardingPage, `(() => { const card=document.querySelector('[data-onboarding-card]'); const labels=Array.from(document.querySelectorAll('button')).map(node=>node.textContent); return labels.includes('新建图书') && labels.includes('导入稿件') && card.textContent.includes('本地编辑与恢复不依赖模型服务') && card.querySelector('.onboarding-data-location')?.textContent===${JSON.stringify(onboardingRoot)}; })()`, 'first-run-actions-and-location');
    at('first-run-skip-persists');
    await click(onboardingPage, '跳过引导', 'first-run-skip');
    await waitFor(onboardingPage, `!document.querySelector('[data-onboarding-card]')`, 'first-run-skip-hidden');
    await close();
    onboardingManager = await launch(undefined, undefined, onboardingRoot);
    [onboardingPage] = await waitForRendererCount(onboardingManager, 1, 'onboarding-restart-window');
    await waitFor(onboardingPage, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'onboarding-restart-ready');
    await requireJourney(await onboardingPage.evaluate(`(async () => (await window.ai7.getPreferences()).values['onboarding.state']==='skipped' && !document.querySelector('[data-onboarding-card]'))()`), 'first-run-skip-remembered');
    await close();
    at('sample-book-import');
    const sampleRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'sample-onboarding-data'), checkout);
    onboardingManager = await launch(undefined, undefined, sampleRoot);
    [onboardingPage] = await waitForRendererCount(onboardingManager, 1, 'sample-onboarding-window');
    await waitFor(onboardingPage, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"] [data-onboarding-card="first-run"]')`, 'sample-onboarding-ready');
    const sampleBook = await importBook(onboardingPage, 'J12 示例图书', true);
    const onboardingSampleDigest = createHash('sha256').update(await readFile(resolve(ROOT, 'SampleBooks', 'sample1.docx'))).digest('hex');
    await requireJourney(await onboardingPage.evaluate(`(async () => { const overview=await window.ai7.getBookOverview({bookId:${JSON.stringify(sampleBook.bookId)},historyCursor:null}); return overview.records.some(record=>record.kind==='source' && record.sourceDigest===${JSON.stringify(onboardingSampleDigest)}) && (await window.ai7.getPreferences()).values['onboarding.state']==='completed'; })()`), 'sample-admitted-source-and-completion');
    at('guided-strip');
    await waitFor(onboardingPage, `document.querySelector('[data-onboarding-guidance="sample-book"]')`, 'guided-strip-visible');
    await requireJourney(await onboardingPage.evaluate(`(async () => { const labels=Array.from(document.querySelectorAll('[data-onboarding-step]')).map(node=>node.textContent); const tasks=await window.ai7.inspectBookTasks(); return labels.join(',')==='分析,审阅,标记,导出' && !tasks.running && tasks.groups.every(group=>group.total===0 && group.items.length===0); })()`), 'guided-strip-navigation-only');
    await assertRenderer(onboardingPage, `(() => { const link=document.querySelector('[data-onboarding-guidance="sample-book"] button[data-onboarding-step="analysis"]'); if(!(link instanceof HTMLButtonElement)||link.disabled)return false; link.click(); return true; })()`, 'guided-analysis-link');
    await waitFor(onboardingPage, `document.querySelector('[data-screen="book-analysis"]')`, 'guided-analysis-page');
    await waitFor(onboardingPage, `document.querySelector('[data-screen="book-analysis"] .baseline-analysis-card[data-analysis-state="unavailable"]')`, 'guided-analysis-prerequisite');
    await requireJourney(await onboardingPage.evaluate(`(async () => { const tasks=await window.ai7.inspectBookTasks(); return !tasks.running && tasks.groups.every(group=>group.total===0 && group.items.length===0); })()`), 'guided-analysis-not-started');
    await close();

    at('offline-empty-and-import');
    let manager = await launch(syntheticDocx);
    let [primary] = await waitForRendererCount(manager, 1, 'initial-window');
    await waitFor(primary, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'initial-ready');
    // The live processing indicator (ADR 0096 §3, #1177) replaces the static 「本地处理 · 未联网」: this launch sends nothing.
    await waitFor(primary, `(() => { const node=document.querySelector('#processing-indicator'); return node instanceof HTMLElement && !node.hidden && node.dataset.processingState==='local' && node.textContent==='本地处理' && node.getAttribute('aria-label')==='处理方式：本地处理' && !document.querySelector('#context-header').textContent.includes('未联网'); })()`, 'processing-indicator-local');
    await assertRenderer(primary, SIDEBAR_LIBRARY_READY, 'sidebar-library-entry');
    await assertRenderer(primary, `(() => { const links=Array.from(document.querySelectorAll('.sidebar-link')); return links.length>0 && links.every((link)=>link.querySelector('svg[data-icon] use') && link.title) && !document.querySelector('button:not([class]), button[class=""]') && Array.from(document.querySelectorAll('button')).every((button)=>button.classList.contains('btn')); })()`, 'shared-svg-and-buttons');
    // #1315 synchronized delta: use the one Help switch, verify its persisted ordinary mode, then restore development mode.
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'technical-mode-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'technical-mode-settings-ready');
    // #1376 / #1382: the persisted switch is one step from Settings Local.
    await waitFor(primary, `document.querySelector('.help-developer-mode input')?.checked===true && document.querySelector('.help-developer-mode input')?.disabled===false`, 'technical-mode-default-on');
    await assertRenderer(primary, `(() => { const input=document.querySelector('.help-developer-mode input'); if(!(input instanceof HTMLInputElement)||input.disabled)return false; input.click(); return true; })()`, 'technical-mode-off');
    await waitFor(primary, `document.documentElement.dataset.technicalLayerVisible==='false' && !document.querySelector('.help-about') && localStorage.getItem('ai7.technicalLayerVisible')==='false'`, 'technical-mode-off-applied');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'ordinary-settings-hub');
    await waitFor(primary, `document.querySelectorAll('[data-screen="settings"] [data-settings-entry]').length===6 && !document.querySelector('[data-settings-entry="usage"]') && !document.querySelector('[data-settings-entry="evaluation-calibration"]') && !document.querySelector('[data-settings-entry="diagnostics"]')`, 'ordinary-settings-six-rows');
    await click(primary, '键盘与无障碍', 'ordinary-keyboard-entry');
    await waitFor(primary, `document.querySelectorAll('[data-keyboard-command]').length>0 && !document.querySelector('[data-keyboard-change]') && !document.querySelector('[data-keyboard-reset-all]') && document.querySelector('input[data-reduced-motion]')`, 'ordinary-keyboard-read-only');
    await assertRenderer(primary, `(() => { const input=document.querySelector('input[data-reduced-motion]'); if(!(input instanceof HTMLInputElement)||input.disabled)return false; input.click(); return true; })()`, 'ordinary-reduced-motion');
    await waitFor(primary, `document.documentElement.dataset.reducedMotion==='true' && localStorage.getItem('ai7.reducedMotion')==='true'`, 'ordinary-reduced-motion-applied');
    await assertRenderer(primary, `(() => { const input=document.querySelector('input[data-reduced-motion]'); if(!(input instanceof HTMLInputElement)||input.disabled)return false; input.click(); return true; })()`, 'ordinary-reduced-motion-reset');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'ordinary-model-settings-hub');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'ordinary-model-settings-ready');
    await click(primary, '模型服务', 'ordinary-model-entry');
    await waitFor(primary, `document.querySelector('[data-screen="model-service"] select[aria-label="渠道"]') && document.querySelector('select[aria-label="AI7 使用的模型"]') && document.querySelector('[data-action="select-main-role-model"]') && document.querySelector('[data-action="select-fast-role-model"]') && !document.querySelector('[data-custom-model-id]') && document.querySelector('.model-service-current-roles') && document.querySelectorAll('[data-search-backend]').length===5`, 'ordinary-model-single-view');
    await assertOrdinaryModelReachability(primary);
    // #1370: both configuration sections are directly mounted in ordinary mode. CI has no search keys;
    // credential save/test success is covered by the ordinary-production renderer/service tests, never a live provider.
    await assertRenderer(primary, `(() => {
      const search=document.querySelector('[data-search-backends="true"]'); const proxy=document.querySelector('[data-model-service-proxy]');
      return search instanceof HTMLElement && proxy instanceof HTMLElement && search.parentElement===proxy.parentElement && !proxy.closest('details') &&
        search.textContent.includes('当前生效来源：') && !search.querySelector('h3[data-developer-only]');
    })()`, 'ordinary-search-proxy-visible');
    await assertRenderer(primary, `!/https?:[/][/]|配置摘要|deepseek-direct-search|openai-responses-web-search|anthropic-messages-web-search/u.test(document.querySelector('[data-search-backends="true"]').textContent)`, 'ordinary-search-no-technical-identifiers');
    // The 未实测 disclosure names hit rates; detailed measurement labels and numeric values remain technical-only.
    await assertRenderer(primary, `!/评测参考|p50|中文命中率|国际命中率|命中率[ ：:]*[0-9]/u.test(document.querySelector('[data-search-backends="true"]').textContent)`, 'ordinary-search-no-detailed-measurements');
    await assertRenderer(primary, `document.querySelectorAll('[data-search-backends="true"] [data-action="probe-search-candidate"]').length===3`, 'ordinary-search-candidate-connection-controls');
    // #1371: ordinary mode keeps the native source explanation and unmeasured disclosure, with five manual cards.
    // Production admission/request construction is exercised by composed ordinary-production service tests; this Journey sends nothing.
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then(settings => settings.launchPolicy.activePolicySetVersion==='no-policy-lock' && settings.launchPolicy.providerProcessing.version==='v1')`), 'ordinary-search-selected-set');
    await assertRenderer(primary, `document.querySelectorAll('[data-search-backend]').length===5 && ['openai-native-search-v1','anthropic-native-search-v1'].every(id => { const card=document.querySelector('[data-search-candidate="'+id+'"]'); return card?.textContent.includes('未实测') && card.textContent.includes('自动用于随渠道检索') && !card.textContent.includes('不能用于任务'); })`, 'ordinary-native-source-disclosure');

    await assertRenderer(primary, `(() => { const choice=document.querySelector('[data-action="always-use-selected-search-backend"]'); if(!(choice instanceof HTMLInputElement)||choice.checked)return false; choice.click(); return true; })()`, 'ordinary-search-source-change');
    await waitFor(primary, `document.querySelector('[data-action="always-use-selected-search-backend"]')?.checked===true && document.querySelector('#persistence-status')?.textContent==='联网检索来源偏好已保存。'`, 'ordinary-search-source-saved');
    await assertRenderer(primary, `(() => { const mode=document.querySelector('select[aria-label="网络代理方式"]'); const address=document.querySelector('input[aria-label="代理 URL"]'); if(!(mode instanceof HTMLSelectElement)||!(address instanceof HTMLInputElement))return false; mode.value='proxy'; mode.dispatchEvent(new Event('change')); address.value='http://127.0.0.1:1'; return !address.disabled; })()`, 'ordinary-proxy-configure');
    // #1375: ordinary native controls and an unsent proxy draft survive the settings follow clock.
    await click(primary, '保存网络代理', 'ordinary-proxy-save');
    await waitFor(primary, `document.querySelector('[data-model-service-proxy="proxy"]') && !document.querySelector('.model-service-proxy-form button')?.disabled`, 'ordinary-proxy-saved');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'ordinary-search-roundtrip-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'ordinary-search-roundtrip-ready');
    await click(primary, '模型服务', 'ordinary-search-roundtrip-return');
    await waitFor(primary, `document.querySelector('[data-action="always-use-selected-search-backend"]')?.checked===true && document.querySelector('select[aria-label="网络代理方式"]')?.value==='proxy' && document.querySelector('input[aria-label="代理 URL"]')?.value==='http://127.0.0.1:1'`, 'ordinary-search-proxy-roundtrip-restored');
    await assertRenderer(primary, `(() => { document.querySelector('[data-action="always-use-selected-search-backend"]').click(); return true; })()`, 'ordinary-search-source-reset');
    await waitFor(primary, `document.querySelector('[data-action="always-use-selected-search-backend"]')?.checked===false && document.querySelector('[data-action="always-use-selected-search-backend"]')?.disabled===false`, 'ordinary-search-source-reset-saved');
    await assertRenderer(primary, `(() => { const mode=document.querySelector('select[aria-label="网络代理方式"]'); mode.value='direct'; mode.dispatchEvent(new Event('change')); return true; })()`, 'ordinary-proxy-reset');
    await click(primary, '保存网络代理', 'ordinary-proxy-reset-save');
    await waitFor(primary, `document.querySelector('[data-model-service-proxy="direct"]')`, 'ordinary-proxy-reset-saved');
    // The deliberately unused loopback proxy reports a persistent error. Dismiss it through the UI
    // after restoring direct mode so the following page can expose its own ordinary status.
    await assertRenderer(primary, `(() => {
      const status=document.querySelector('#persistence-status'); const dismiss=status?.querySelector('button[aria-label="关闭错误提示"]');
      if(!(status instanceof HTMLElement)||status.dataset.tone!=='error'||!status.textContent.includes('代理不可达')||!(dismiss instanceof HTMLButtonElement))return false;
      dismiss.click(); return status.hidden;
    })()`, 'ordinary-proxy-probe-error-dismissed');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('knowledge')), 'ordinary-knowledge-entry');
    await waitFor(primary, `document.querySelectorAll('[data-screen="knowledge-base"] [data-knowledge-category]').length===4 && Array.from(document.querySelectorAll('[data-screen="knowledge-base"] [data-knowledge-category]'), node=>node.getAttribute('aria-label')).join('、')==='审阅规范文件、本社审阅偏好、范例、资料库'`, 'ordinary-knowledge-four-categories');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('quality')), 'ordinary-quality-entry');
    await waitFor(primary, `Array.from(document.querySelectorAll('[data-screen="quality-learning"] [role="tab"]'), node=>node.textContent).join('|')==='审阅偏好|反馈记录' && document.querySelector('#quality-tab-preferences')?.getAttribute('aria-selected')==='true'`, 'ordinary-quality-two-views');
    await waitFor(primary, `document.querySelector('#persistence-status')?.textContent==='审阅偏好已打开' && document.querySelector('[data-learning-enabled]') && !document.querySelector('[data-memory-candidate-form]')`, 'ordinary-quality-loaded');
    await assertRenderer(primary, `!document.querySelector('#persistence-status')?.textContent.includes('该页在开发者模式下显示') && !document.body.textContent.includes('该页在开发者模式下显示')`, 'ordinary-quality-no-shelved-notice');
    // #1408: an editor's own rule is an active rule the moment it is saved. Ordinary mode, public synthetic text; the rule is
    // created, edited as the same rule, then stopped, so this stage leaves no active preference behind.
    const preferenceText = 'J12 合成偏好：保留有意使用的短句。';
    const editedPreferenceText = 'J12 合成偏好：短句保持原样，不机械合并。';
    const memorySection = `document.querySelector('[data-screen="quality-learning"] [data-editorial-memory]')`;
    const preferenceRow = (itemId) => `${memorySection}.querySelector('[data-review-preference="${itemId}"]')`;
    const preferenceState = (text) => `window.ai7.inspectGlobalAgent().then(state=>({
      directives: state.directives.length,
      label: state.categories.find(category=>category.categoryId==='style-and-format')?.label ?? null,
      items: state.items.filter(item=>item.text===${JSON.stringify(text)}).map(item=>({itemId:item.itemId,kind:item.kind,state:item.state,bookId:item.bookId,categoryId:item.categoryId})),
    }))`;
    const directivesBeforePreference = await primary.evaluate(`window.ai7.inspectGlobalAgent().then(state=>state.directives.length)`);
    await assertRenderer(primary, `(() => {
      const section=${memorySection}; const form=section?.querySelector('[data-preference-editor="new"]');
      if(!form||document.documentElement.dataset.technicalLayerVisible!=='false')return false;
      const category=form.querySelector('select[aria-label="适用维度"]'), scope=form.querySelector('select[aria-label="适用范围"]');
      const text=form.querySelector('textarea[aria-label="一句话偏好规则"]');
      const save=Array.from(form.querySelectorAll('button')).find(node=>node.textContent==='新增并启用偏好');
      return Boolean(category&&scope&&text&&save)&&save.type==='submit'&&!save.disabled&&text.required&&text.value===''&&
        Array.from(category.options).some(option=>option.value==='style-and-format')&&
        scope.options[0].value===''&&scope.options[0].textContent==='全社'&&
        Array.from(scope.options).slice(1).every(option=>option.textContent.startsWith('本书：《'));
    })()`, 'ordinary-preference-editor-shape');
    await assertRenderer(primary, `(() => {
      const form=${memorySection}.querySelector('[data-preference-editor="new"]');
      form.querySelector('select[aria-label="适用维度"]').value='style-and-format';
      form.querySelector('select[aria-label="适用范围"]').value='';
      const text=form.querySelector('textarea[aria-label="一句话偏好规则"]');
      text.value=${JSON.stringify(preferenceText)}; text.dispatchEvent(new Event('input',{bubbles:true}));
      Array.from(form.querySelectorAll('button')).find(node=>node.textContent==='新增并启用偏好').click();
      return true;
    })()`, 'ordinary-preference-create');
    await waitFor(primary, `Array.from(${memorySection}.querySelectorAll('[data-review-preference]')).some(row=>row.querySelector('p')?.textContent===${JSON.stringify(preferenceText)})`, 'ordinary-preference-created-row');
    const createdPreference = await primary.evaluate(preferenceState(preferenceText));
    const createdRule = createdPreference.items[0];
    requireJourney(createdPreference.items.length === 1 && createdRule.kind === 'preference' && createdRule.state === 'active' &&
      createdRule.bookId === null && createdRule.categoryId === 'style-and-format' && typeof createdRule.itemId === 'string' &&
      typeof createdPreference.label === 'string' && createdPreference.directives === directivesBeforePreference + 1, 'ordinary-preference-created-active');
    // The saved rule reads as active and whole-house on the page, with its two controls, and the editor starts empty again.
    await waitFor(primary, `(() => {
      const row=${preferenceRow(createdRule.itemId)}; const section=${memorySection};
      const names=Array.from(row?.querySelectorAll('.preference-actions > button')??[], node=>node.textContent+(node.disabled?':disabled':''));
      const fresh=section?.querySelector('[data-preference-editor="new"] textarea');
      return Boolean(row)&&row.querySelectorAll('p')[1]?.textContent===${JSON.stringify(`${createdPreference.label} · 本社 · 已启用`)}&&
        names.join(',')==='停用,编辑偏好'&&fresh?.value===''&&section.querySelector('[role="status"]')?.textContent==='学习记录已更新。'&&
        !/ordinary-production|developer-live|查看技术详情|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/u.test(section.textContent);
    })()`, 'ordinary-preference-active-row');
    await assertRenderer(primary, `(() => { const edit=Array.from(${preferenceRow(createdRule.itemId)}.querySelectorAll('.preference-actions > button')).find(node=>node.textContent==='编辑偏好'); if(!edit||edit.disabled)return false; edit.click(); return true; })()`, 'ordinary-preference-edit-open');
    await waitFor(primary, `(() => {
      const form=${preferenceRow(createdRule.itemId)}?.querySelector('[data-preference-editor="${createdRule.itemId}"]');
      if(!form)return false;
      const category=form.querySelector('select[aria-label="适用维度"]'), scope=form.querySelector('select[aria-label="适用范围"]');
      const text=form.querySelector('textarea[aria-label="一句话偏好规则"]');
      const save=Array.from(form.querySelectorAll('button')).find(node=>node.textContent==='保存偏好');
      // An edit changes the sentence of the same rule; its dimension and scope are the rule's and stay fixed.
      return Boolean(category&&scope&&text&&save)&&category.value==='style-and-format'&&category.disabled&&scope.value===''&&scope.disabled&&
        text.value===${JSON.stringify(preferenceText)}&&!save.disabled&&form.parentElement.children.length===1;
    })()`, 'ordinary-preference-edit-fields');
    await assertRenderer(primary, `(() => {
      const form=${preferenceRow(createdRule.itemId)}.querySelector('[data-preference-editor="${createdRule.itemId}"]');
      const text=form.querySelector('textarea[aria-label="一句话偏好规则"]');
      text.value=${JSON.stringify(editedPreferenceText)}; text.dispatchEvent(new Event('input',{bubbles:true}));
      Array.from(form.querySelectorAll('button')).find(node=>node.textContent==='保存偏好').click();
      return true;
    })()`, 'ordinary-preference-edit-save');
    await waitFor(primary, `(() => { const row=${preferenceRow(createdRule.itemId)}; return Boolean(row)&&!row.querySelector('form')&&row.querySelector('p')?.textContent===${JSON.stringify(editedPreferenceText)}&&row.querySelectorAll('p')[1]?.textContent===${JSON.stringify(`${createdPreference.label} · 本社 · 已启用`)}; })()`, 'ordinary-preference-edited-row');
    const editedPreference = await primary.evaluate(preferenceState(editedPreferenceText));
    const replacedPreference = await primary.evaluate(preferenceState(preferenceText));
    requireJourney(editedPreference.items.length === 1 && editedPreference.items[0].itemId === createdRule.itemId && editedPreference.items[0].state === 'active' &&
      editedPreference.items[0].bookId === null && editedPreference.items[0].categoryId === 'style-and-format' &&
      replacedPreference.items.every((item) => item.state !== 'active') && editedPreference.directives === directivesBeforePreference + 2, 'ordinary-preference-edited-same-rule');
    await assertRenderer(primary, `(() => { const stop=Array.from(${preferenceRow(createdRule.itemId)}.querySelectorAll('.preference-actions > button')).find(node=>node.textContent==='停用'); if(!stop||stop.disabled)return false; stop.click(); return true; })()`, 'ordinary-preference-stop');
    await waitFor(primary, `(() => { const row=${preferenceRow(createdRule.itemId)}; return !row||(row.querySelectorAll('p')[1]?.textContent.endsWith('已停用')&&!Array.from(row.querySelectorAll('.preference-actions > button')).some(node=>node.textContent==='停用'||node.textContent==='编辑偏好')); })()`, 'ordinary-preference-stopped-row');
    const stoppedPreference = await primary.evaluate(preferenceState(editedPreferenceText));
    requireJourney(stoppedPreference.items.every((item) => item.state !== 'active') && stoppedPreference.directives === directivesBeforePreference + 3, 'ordinary-preference-stopped');
    const directivesAfterPreference = stoppedPreference.directives;
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('global-agent')), 'ordinary-agent-entry');
    await waitFor(primary, `document.querySelector('[data-screen="global-agent"]')`, 'ordinary-agent-ready');
    await assertRenderer(primary, `!/查看技术详情|（第 \\d+ 版）|\\bv\\d{1,3}\\b|ordinary-production|developer-live|gpt-|claude-|deepseek-|gemini-|[0-9a-f]{8,}|主分支|\\d+\\.\\d{3}%/u.test(document.body.textContent)`, 'ordinary-agent-no-technical-text');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'technical-mode-restore-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'technical-mode-restore-settings-ready');
    await click(primary, '帮助', 'technical-mode-restore-help');
    await assertRenderer(primary, `(() => { const input=document.querySelector('.help-developer-mode input'); if(!(input instanceof HTMLInputElement)||input.disabled)return false; input.click(); return true; })()`, 'technical-mode-on');
    await waitFor(primary, `document.documentElement.dataset.technicalLayerVisible==='true' && document.querySelector('.help-about') && localStorage.getItem('ai7.technicalLayerVisible')==='true'`, 'technical-mode-on-applied');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'developer-keyboard-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'developer-keyboard-settings-ready');
    await click(primary, '键盘与无障碍', 'developer-keyboard-entry');
    await waitFor(primary, `document.querySelector('[data-keyboard-change]') && Array.from(document.querySelectorAll('.keyboard-table th[data-developer-only="true"]')).some(node=>getComputedStyle(node,'::after').content.includes('开发者'))`, 'developer-keyboard-badge');

    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('global-agent')), 'global-agent-entry');
    await waitFor(primary, `document.querySelector('[data-screen="global-agent"] [data-global-agent-policy]')?.textContent.includes('暂时无法提问')`, 'global-agent-policy-disclosed');
    await requireJourney(await primary.evaluate(`(async () => { const state = await window.ai7.inspectGlobalAgent(); return state.history.length === 0 && state.directives.length === ${directivesAfterPreference} && document.querySelector('#context-title')?.textContent === '全域智能体'; })()`), 'global-agent-entry-no-work');
    await assertRenderer(primary, `document.querySelector('#context-title')?.textContent==='全域智能体' && document.querySelector('#processing-indicator')?.textContent==='本地处理' && !document.querySelector('#context-header').textContent.includes('模型')`, 'agent-header-title-and-processing');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'global-agent-return-library');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'global-agent-library-ready');
    await primary.send('Page.setBypassCSP', { enabled: true });
    const fetchRejected = await primary.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
    await primary.send('Page.setBypassCSP', { enabled: false });
    requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'offline-product');
    const bookB = await createEmptyBook(primary, 'J12 空图书乙');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'empty-return');
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
    await assertRenderer(primary, `document.querySelector('[data-toast]') !== null`, 'entry-toast-exists');
    await assertRenderer(primary, `document.querySelector('[data-toast]')?.hidden === false`, 'entry-toast-visible');
    await assertRenderer(primary, `getComputedStyle(document.querySelector('[data-toast]')).position === 'fixed'`, 'entry-toast-fixed');
    await assertRenderer(primary, `(() => {
      const toast=document.querySelector('[data-toast]');
      const notice=toast?.querySelector('span');
      return toast instanceof HTMLElement && !toast.hidden && notice instanceof HTMLElement &&
        notice.textContent==='从稿件开头打开；这本图书还没有记录上次位置。' &&
        getComputedStyle(toast).position==='fixed';
    })()`, 'entry-notice-without-remembered-position');
    // It goes without any editor action (V2-UX-COPY-015).
    await waitFor(primary, `document.querySelector('[data-toast]')?.hidden === true`, 'entry-notice-self-dismissed');
    // Wave 23 #1286: entering the global destination closes the book-only drawer and releases its column.
    await assertRenderer(primary, `(() => { const entry=document.querySelector('[data-edge-entry="tasks"]'); if(!(entry instanceof HTMLButtonElement)||entry.disabled)return false; entry.click(); return true; })()`, 'global-agent-book-drawer-open');
    await waitFor(primary, `document.querySelector('#task-drawer')?.hidden===false`, 'global-agent-book-drawer-ready');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('global-agent')), 'global-agent-from-book');
    await waitFor(primary, `(() => {
      const root=document.querySelector('[data-global-agent="destination"]');
      const submit=root?.querySelector('[data-global-agent-question-form] button[type="submit"]');
      return root instanceof HTMLElement && getComputedStyle(root).display==='grid' &&
        getComputedStyle(root.querySelector('.global-agent-composer')).borderTopStyle==='solid' &&
        submit?.textContent==='发送问题' && submit.classList.contains('primary') &&
        document.querySelector('#task-drawer')?.hidden===true && document.body.dataset.taskDrawer==='closed' &&
        getComputedStyle(document.body).paddingRight==='0px';
    })()`, 'global-agent-styled-drawer-closed');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'global-agent-return-to-library');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'global-agent-library-before-book');
    await clickBook(primary, bookA, 'global-agent-reopen-book');
    await waitFor(primary, `document.querySelector('[data-screen="editor"]') && document.querySelector('#task-drawer')?.hidden===true`, 'global-agent-book-return-closed');


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
    const beforeRiskEdit = await primary.evaluate(CAPTURE_JOURNAL_EDIT);
    requireJourney(beforeRiskEdit !== null, 'close-risk-edit-scope');
    const routeRiskSuffix = '，J12 路由风险保护';
    const riskyEditInserted = await primary.evaluate(`(() => { const editor=document.querySelector('[data-testid="manuscript-editor"]'); const block=editor?.querySelector('[data-block-id]'); if(!(block instanceof HTMLElement))return false; block.focus(); const range=document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); ${DIRECT_EDIT} && document.execCommand('insertText',false,${JSON.stringify(routeRiskSuffix)}); return block.textContent?.endsWith(${JSON.stringify(routeRiskSuffix)}); })()`);
    requireJourney(riskyEditInserted === true, 'close-risk-edit-inserted');
    await waitFor(primary, `document.documentElement.dataset.ai7CloseRisk==='true' && !(document.querySelector('[data-editor-persistence]')?.dataset.editorPersistence === 'confirmed')`, 'close-risk-advertised');
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
    await click(primary, '保存', 'background-risk-edit-save');
    await waitFor(primary, journalEditPersisted(beforeRiskEdit, routeRiskSuffix), 'background-risk-edit-durable', 120_000);
    await assertRenderer(primary, `document.documentElement.dataset.ai7CloseRisk==='false'`, 'background-risk-cleared');
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
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.section('overview')), 'back-overview');
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
    await assertRenderer(primary, `(() => { const view=document.querySelector('.historical-revision-viewer'); const blocks=document.querySelectorAll('.historical-revision-blocks>[data-block-id]'); return view?.dataset.bookId===${JSON.stringify(bookA)} && Number(view.dataset.blockCount)===blocks.length && blocks.length>0 && blocks.length<=32 && !view.textContent.includes(${JSON.stringify(editSuffix)}) && !document.querySelector('[data-testid="manuscript-editor"]') && !document.querySelector('[contenteditable="true"]') && !Array.from(view.querySelectorAll('button')).some((item)=>['保存','撤销','重做','保存为里程碑版本','保存里程碑版本'].includes(item.textContent??'')) && view.querySelector('.lede')?.textContent.endsWith(' · 只读') === true; })()`, 'immutable-readonly-reconstruction');
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
    // somewhere to go, and the moved-to window is what is remembered. Issue #1481: hosted
    // diagnosis observed a cursor load and persisted position 9 while the arrival announcement was
    // absent from the status line. Wait for the durable position the restart actually consumes.
    await click(primary, '向后浏览', 'page-away-from-start');
    await waitFor(primary, `window.ai7.getBookOverview({bookId:${JSON.stringify(bookA)},historyCursor:null}).then((overview)=>Number.isSafeInteger(overview.manuscriptAnchor?.entry?.blockPosition) && overview.manuscriptAnchor.entry.blockPosition>1)`, 'paged-away-from-start');
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
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.section('overview')), 'draft-a-to-overview');
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
    // A refusal's code is the product's; the label names it only from this closed set (Issue #652).
    const searchRefusal = searchJobCall?.code === 'AI7_EDITOR_ROUTE_INVALID' ? 'route-invalid'
      : searchJobCall?.code === 'AI7_EDITOR_CAPABILITY_INVALID' ? 'capability-invalid'
        : searchJobCall?.code === undefined ? 'unknown' : 'other';
    requireJourney(searchJobCall?.ok === true, `book-b-search-${searchRefusal}`, { code: searchJobCall?.code });
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
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.section('overview')), 'preflight-a-to-overview');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-a-overview');
    await click(primary, '打开另一本图书', 'preflight-open-other');
    await waitFor(primary, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'preflight-chooser');
    await clickBook(primary, bookB, 'preflight-open-b');
    await waitForRendererCount(manager, 2, 'preflight-two-books');
    // Synchronized delta with Issue #405: 乙 has had a primary Manuscript since
    // `sender-owned-editor-capabilities-import-b`, so by now its Book route enters the manuscript as 甲's
    // does; the overview this stage later works from is reached back through `资料与记录`.
    const bookBRendererForPreflight = await findRenderer(manager, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookB)}]')`, 'preflight-b-window');
    await assertRenderer(bookBRendererForPreflight, sidebarNavigate(SIDEBAR.section('overview')), 'preflight-b-to-overview');
    await waitFor(bookBRendererForPreflight, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookB)}]')`, 'preflight-b-overview');
    await click(primary, '返回当前图书', 'preflight-return-a');
    await waitFor(primary, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-a-returned');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'preflight-release-a');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'preflight-library-window');
    await click(bookBRendererForPreflight, '打开另一本图书', 'preflight-b-open-other');
    await waitFor(bookBRendererForPreflight, `document.querySelector('[data-screen="book-workbench-chooser"]')`, 'preflight-b-chooser');
    await clickBook(bookBRendererForPreflight, bookA, 'preflight-b-open-a');
    await waitForRendererCount(manager, 3, 'preflight-library-and-two-books');
    // Synchronized delta with Issue #405: 甲's re-registered window entered the manuscript.
    const registeredBookA = await findRenderer(manager, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'preflight-registered-a');
    const sourceRecordsBefore = await registeredBookA.evaluate(`(async()=>{ const overview=await window.ai7.getBookOverview({bookId:${JSON.stringify(bookA)},historyCursor:null}); return overview.records.filter((record)=>record.kind==='source-import-record').length; })()`);
    await click(primary, '导入稿件', 'preflight-stage-source');
    await waitFor(primary, `document.querySelector('[data-import-target-choices]')`, 'preflight-source-target');
    await assertRenderer(primary, `(() => { const target=document.querySelector('input[data-import-target-choice="existing-book"][data-book-id=${JSON.stringify(bookA)}]'); if(!(target instanceof HTMLInputElement))return false; target.click(); return target.checked; })()`, 'preflight-select-a');
    await assertRenderer(primary, `(() => { const source=document.querySelector('input[data-import-relationship="source-only"]'); if(!(source instanceof HTMLInputElement))return false; source.click(); return source.checked; })()`, 'preflight-source-only');
    await waitFor(primary, `document.querySelector('[data-source-version-reuse-choices]')`, 'preflight-reuse-required');
    // Issue #1410 item 32B: the same-Book match is chosen to begin with.
    await assertRenderer(primary, `(() => { const reuse=document.querySelector('[data-reuse-source-version-id]'); return reuse instanceof HTMLInputElement && reuse.checked; })()`, 'preflight-reuse-source');
    await click(primary, '查看导入详情', 'preflight-prepare-source');
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
    const modelAuthorMark = await seedModelAuthor(dataRoot, runRoot, bookAWork);
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
      const notice=document.querySelector('[data-toast]:not([hidden]) span')?.textContent??'';
      return notice === '回到上次位置。';
    })()`, 'restart-entry-notice-returns-to-remembered-position');
    // #1402: both actual card consumers show the executing model with the recorded effort in ordinary mode.
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-author-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-author-settings-ready');
    await click(primary, '帮助', 'model-author-help');
    await assertRenderer(primary, `(() => { const toggle=document.querySelector('.help-developer-mode input'); if(!toggle)return false; if(toggle.checked)toggle.click(); return true; })()`, 'model-author-ordinary-toggle');
    await waitFor(primary, `document.documentElement.dataset.technicalLayerVisible==='false'`, 'model-author-ordinary-mode');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'model-author-library');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'model-author-library-ready');
    await clickBook(primary, bookA, 'model-author-book');
    await waitFor(primary, `document.querySelector('[data-testid="manuscript-editor"] [data-mark-id="${modelAuthorMark}"]')`, 'model-author-anchor');
    await assertRenderer(primary, `(() => { document.querySelector('[data-testid="manuscript-editor"] [data-mark-id="${modelAuthorMark}"]').scrollIntoView({block:'center'}); const entry=document.querySelector('[data-edge-entry="comments"]'); if(entry.getAttribute('aria-expanded')!=='true')entry.click(); return true; })()`, 'model-author-comments');
    await waitFor(primary, `document.querySelector('[data-comment-card="${modelAuthorMark}"] [data-mark-source]')?.textContent==='gpt-6-luna@high'`, 'model-author-comments-label');
    await assertRenderer(primary, `(() => { const card=document.querySelector('[data-comment-card="${modelAuthorMark}"]'); card.focus(); card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); return true; })()`, 'model-author-open-full-card');
    await waitFor(primary, `document.querySelector('.editorial-mark-layer [data-mark-card="${modelAuthorMark}"] [data-mark-source]')?.textContent.startsWith('gpt-6-luna@high · ') && document.documentElement.dataset.technicalLayerVisible==='false'`, 'model-author-full-card-label');
    await assertRenderer(primary, `(() => { document.querySelector('.editorial-mark-layer [data-mark-action="close"]').click(); document.querySelector('[data-edge-entry="comments"]').click(); return true; })()`, 'model-author-close-cards');
    // #1401: the first factual review offers ranges before any whole-book result; no review is started here. This launch has
    // no model adapter, route or search source, so whether 事实核查 can start is the service's own verdict: it is read and
    // told truthfully below, never forced, bypassed or required (true first-range prepare/execute/out-of-scope is J-04's).
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.section('review')), 'factual-first-scope-review');
    await waitFor(primary, `document.querySelector('[data-screen="book-review"] .review-workspace-card')?.dataset.reviewState==='empty' && document.documentElement.dataset.technicalLayerVisible==='false'`, 'factual-first-scope-empty');
    const factualVerdict = await primary.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(workspace=>{
      const factual=workspace.categories.find(category=>category.categoryId==='factual-review');
      const blocked=factual?.networkUnavailable===true;
      return {
        empty: workspace.runs.length===0 && workspace.run===null,
        // One verdict, said the same way everywhere: a category that cannot start names why on itself and on every scope it offers.
        consistent: factual!==undefined && factual.available===(factual.unavailableReason===null) &&
          (factual.available || Object.values(factual.scopes).every(scope=>!scope.available && scope.unavailableReason===factual.unavailableReason)) &&
          (!blocked || (!factual.available && factual.unavailableReason!=='')),
        networkUnavailable: blocked,
        // The sheet's scope choices are the manuscript's: 全书 and 选章 are offered, 当前选区 needs a real selection.
        scopeChoices: workspace.scopeOptions.whole.available && workspace.scopeOptions.chapters.available && !workspace.scopeOptions.selection.available,
        // Choosable now (it may still wait for 联网检索), or refused for a reason of its own that the sheet must tell.
        factualChoosable: factual?.available === true || blocked,
        factualReason: factual?.unavailableReason ?? null,
      };
    })`);
    requireJourney(factualVerdict?.empty === true && factualVerdict.consistent === true, 'factual-first-scope-verdict');
    requireJourney(factualVerdict.scopeChoices === true, 'factual-first-scope-choices');
    const factualNetworkUnavailable = factualVerdict.networkUnavailable === true;
    const factualChoosable = factualVerdict.factualChoosable === true;
    // A refused 事实核查 (here: a Book outside the admitted public SampleBooks under the provider-free launch) stays on the sheet,
    // disabled and saying the service's own reason; the range round trip is then made with the category this Book can choose.
    const rangeCategory = factualChoosable ? 'factual-review' : 'local-text-check';
    const factualReasonLine = factualVerdict.factualReason === null ? null : `${String(factualVerdict.factualReason).split(/[；。]/u)[0]}。`;
    const tasksBeforeFactualSheet = await primary.evaluate(`window.ai7.inspectBookTasks().then(tasks=>JSON.stringify(tasks))`);
    requireJourney(typeof tasksBeforeFactualSheet === 'string', 'factual-first-scope-tasks-before');
    await assertRenderer(primary, `(() => { const open=document.querySelector('[data-review-action="new-review"]'); if(!open||open.disabled)return false; open.click(); return true; })()`, 'factual-first-scope-new');
    await waitFor(primary, `document.querySelector('dialog.review-sheet')?.open===true`, 'factual-first-scope-sheet');
    // The first unmet step is recorded as the failure detail (step names only, no page content).
    const factualRoundtrip = await primary.evaluate(`(() => {
      const sheet=document.querySelector('dialog.review-sheet');
      // A category toggle redraws the whole sheet, so every control is read fresh and none is held across a change.
      const scope=kind=>sheet.querySelector('input[name="review-scope"][value="'+kind+'"]');
      const factual=()=>sheet.querySelector('input[name="review-category"][value="factual-review"]');
      const chosen=()=>sheet.querySelector('input[name="review-category"][value=${JSON.stringify(rangeCategory)}]');
      const factualReason=()=>factual().closest('label').querySelector('.review-category-reason');
      const chapter=which=>sheet.querySelector('[data-review-chapter="'+which+'"]');
      const checkedIds=()=>Array.from(sheet.querySelectorAll('input[name="review-category"]:checked'), input=>input.value);
      for(let step=0; step<20 && sheet.querySelector('input[name="review-category"]:checked'); step++)sheet.querySelector('input[name="review-category"]:checked').click();
      if(checkedIds().length!==0)return 'cleared';
      if(!factual()||!chosen())return 'offered-missing';
      if(${JSON.stringify(!factualChoosable)}){
        const why=factualReason();
        if(!factual().disabled||factual().checked||factual().dataset.unavailableReason!==${JSON.stringify(factualVerdict.factualReason)}||!why||why.hidden||why.textContent!==${JSON.stringify(factualReasonLine)})return 'refused-told';
      }
      if(chosen().disabled)return 'offered-disabled';
      for(const kind of ['whole','chapters']){ if(!scope(kind))return 'offered-'+kind+'-missing'; if(scope(kind).disabled)return 'offered-'+kind+'-disabled'; }
      // 当前选区 is handed over from the manuscript; with none, it stays disabled with its reason.
      if(!scope('selection')||!scope('selection').disabled||!scope('selection').dataset.unavailableReason)return 'selection-held';
      chosen().click(); scope('whole').click();
      if(!chosen().checked||chosen().disabled||!scope('whole').checked)return 'whole-chosen';
      scope('chapters').click();
      if(!chosen().checked||chosen().disabled||!chapter('from')||!chapter('to')||chapter('from').disabled||chapter('to').disabled||chapter('from').options.length<3)return 'chapters-offered';
      const range=chapter('from').options[2].value;
      chapter('from').value=range; chapter('from').dispatchEvent(new Event('change',{bubbles:true}));
      chapter('to').value=range; chapter('to').dispatchEvent(new Event('change',{bubbles:true}));
      const kept=()=>checkedIds().join(',')===${JSON.stringify(rangeCategory)}&&!chosen().disabled&&chapter('from').value===range&&chapter('to').value===range;
      if(!kept())return 'range-chosen';
      scope('whole').click();
      if(!scope('whole').checked||!kept())return 'whole-kept';
      scope('chapters').click();
      if(!scope('chapters').checked||!kept()||document.documentElement.dataset.technicalLayerVisible!=='false')return 'chapters-kept';
      // The chosen factual review is told as the service's verdict reads it, and nothing is started either way.
      const blocked=${JSON.stringify(factualNetworkUnavailable)};
      const reason=factualReason();
      const notice=sheet.querySelector('.review-network-notice');
      const start=sheet.querySelector('[data-review-action="start"]'), prepare=sheet.querySelector('[data-review-action="prepare"]');
      if(!reason||!notice||!start||!prepare)return 'controls';
      if(blocked){
        if(reason.hidden||reason.textContent!=='此类别需要联网检索。')return 'blocked-reason';
        if(notice.hidden||notice.textContent!=='联网检索尚未就绪，请到设置中配置后再开始。')return 'blocked-notice';
        return start.disabled&&prepare.disabled ? 'ok' : 'blocked-actions';
      }
      if(${JSON.stringify(!factualChoosable)})return factual().disabled&&!factual().checked&&notice.hidden ? 'ok' : 'refused-kept';
      return reason.hidden&&notice.hidden ? 'ok' : 'open-reason-or-notice';
    })()`);
    requireJourney(factualRoundtrip === 'ok', 'factual-first-category-range-roundtrip',
      { step: factualRoundtrip, verdict: factualNetworkUnavailable ? 'network-blocked' : factualChoosable ? 'open' : 'refused' });
    await assertRenderer(primary, `(() => { document.querySelector('dialog.review-sheet [data-review-action="close-sheet"]').click(); return true; })()`, 'factual-first-scope-close');
    await waitFor(primary, `document.querySelector('dialog.review-sheet')?.open===false`, 'factual-first-scope-closed');
    requireJourney(await primary.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(workspace=>workspace.runs.length===0&&workspace.run===null)`), 'factual-first-scope-no-run');
    requireJourney(await primary.evaluate(`window.ai7.inspectBookTasks().then(tasks=>JSON.stringify(tasks))`) === tasksBeforeFactualSheet, 'factual-first-scope-no-task');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-author-restore-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-author-restore-settings-ready');
    await click(primary, '帮助', 'model-author-restore-help');
    await assertRenderer(primary, `(() => { const toggle=document.querySelector('.help-developer-mode input'); if(!toggle.checked)toggle.click(); return true; })()`, 'model-author-restore-development');
    await waitFor(primary, `document.documentElement.dataset.technicalLayerVisible==='true'`, 'model-author-development-mode');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'model-author-return-library');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'model-author-return-library-ready');
    await clickBook(primary, bookA, 'model-author-return-book');
    await waitFor(primary, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'model-author-return-editor');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.section('overview')), 'restart-back-overview');
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
        anchorSection.querySelector('.button-row button')?.textContent==='继续编辑稿件' &&
        ['exact','nearest-anchor'].includes(anchorSection.dataset.manuscriptAnchor??'') &&
        readings[1].includes('个段落') && !readings.some((reading)=>/blk_[0-9a-f]{24}/.test(reading));
    })()`, 'overview-leads-with-the-manuscript-anchor');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'restart-return-library');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'restart-library');
    // Identifiers in the technical layer (ADR 0096 §3, #1177): a 书库 card prints no Book identity inline; its 图书 ID and 稳定标识
    // sit behind a closed 查看技术详情.
    await waitFor(primary, `(() => { const cards=Array.from(document.querySelectorAll('[data-screen="landing"] article.book-summary-item')); return cards.length>0 && cards.every((card)=>{ const details=Array.from(document.querySelectorAll('details[data-technical-layer]')).find(node=>node.textContent.includes(card.querySelector('button[data-book-id]')?.dataset.bookId)); const bookId=card.querySelector('button[data-book-id]')?.dataset.bookId; if(!(details instanceof HTMLDetailsElement)||(details.open&&!details.hidden)||!bookId||!details.textContent.includes(bookId))return false; const visible=Array.from(card.childNodes).filter((node)=>node!==details).map((node)=>node.textContent??'').join(''); return !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(visible) && ['查看技术详情','记录信息'].includes(details.querySelector('summary')?.textContent); }); })()`, 'library-card-identity-disclosed');
    at('screen-return-origins');
    // Global destinations return to the exact Book subpage that opened them; settings children return to Settings.
    await clickBook(primary, bookA, 'return-book-open');
    await waitFor(primary, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookA)}]')`, 'return-book-editor-ready');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.section('review')), 'return-book-review');
    await waitFor(primary, `document.querySelector('[data-screen="book-review"]')`, 'return-book-review-ready');
    for (const [destination, state] of [['knowledge','knowledge-base'], ['quality','quality-learning'], ['series','series-list']]) {
      await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination(destination)), `return-${destination}-open`);
      await waitFor(primary, `document.querySelector('[data-screen="${state}"]')`, `return-${destination}-ready`);
      await click(primary, '返回', `return-${destination}-back`);
      await waitFor(primary, `document.querySelector('[data-screen="book-review"]')`, `return-${destination}-source`);
    }
    for (const [label, state] of [['数据与存储','data-storage'], ['模型服务','model-service'], ['评估校准与预测','evaluation-calibration']]) {
      await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), `return-${state}-settings`);
      await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, `return-${state}-settings-ready`);
      await click(primary, label, `return-${state}-open`);
      await waitFor(primary, `document.querySelector('[data-screen="${state}"]')`, `return-${state}-ready`);
      await click(primary, '返回', `return-${state}-back`);
      await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, `return-${state}-source`);
    }
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'return-library');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'return-library-ready');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'data-storage-open-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'data-storage-open-settings-hub');
    await click(primary, '数据与存储', 'data-storage-open');
    await waitFor(primary, `document.querySelector('[data-screen="data-storage"]')`, 'data-storage-ready');
    await assertRenderer(primary, `(() => { const view=document.querySelector('.data-storage-summary'); return view?.dataset.platform===${JSON.stringify(process.platform === 'win32' ? 'windows' : 'macos')} && view.dataset.runtimeForm==='source-checkout' && view.dataset.channel==='source-checkout' && [...view.querySelectorAll('dt')].find((term)=>term.textContent==='分发渠道')?.nextElementSibling?.textContent==='源码检出' &&view.dataset.footprintMaximumEntries==='128' && document.querySelector('[data-product-data-root]')?.textContent===${JSON.stringify(dataRoot)} && view.textContent.includes('产品数据位置') && view.textContent.includes('凭据与产品数据分开') && view.textContent.includes(${JSON.stringify(process.platform === 'win32' ? 'Windows 凭据管理器' : 'macOS 钥匙串')}) && !Object.keys(window.ai7).some((key)=>key.toLowerCase().includes('path')); })()`, 'truthful-data-location');
    // 版本 (Issue #433, S85a; DSTO-016): the software version and the Data Version apart. The same software reopened the data
    // after the restart, so the store keeps its one version record and has seen no software update.
    const packageVersion = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')).version;
    await waitFor(primary, `document.querySelector('.data-version')?.dataset.dataVersion === '1'`, 'data-version-read');
    const versionSection = await primary.evaluate(`(() => { const section = document.querySelector('.data-version'); const text = (selector) => section?.querySelector(selector)?.textContent ?? null; return [text('.data-version-software'), text('.data-version-data'), text('.data-version-state'), text('.data-version-update'), text('.data-version-history > summary'), section?.dataset.frozen ?? null]; })()`);
    // Synchronized delta with Issue #967: Data Version 1 is frozen at the 1.0.0 development milestone boundary, and the data
    // root carries the version marker this open wrote (ADR 0023), never a path.
    requireJourney(JSON.stringify(versionSection) === JSON.stringify([packageVersion, '1', '数据版本 1 已冻结。',
      '这份数据还没有经历过软件更新。', '版本记录（1）', 'true']), 'data-version-words', versionSection);
    const versionMarker = await primary.evaluate(`window.ai7.inspectDataVersion().then((version) => version.marker)`);
    requireJourney(versionMarker?.present === true && versionMarker.softwareVersion === packageVersion && typeof versionMarker.writtenAt === 'string' &&
      !JSON.stringify(versionMarker).includes(JSON.stringify(dataRoot).slice(1, -1)), 'data-version-marker', versionMarker);
    const markerFile = JSON.parse(await readFile(resolve(dataRoot, 'store', 'ai7-data-version.json'), 'utf8'));
    requireJourney(markerFile.dataVersion === 1 && markerFile.schemaRevision === CREDENTIAL_CLEANUP_SCHEMA_VERSION && markerFile.softwareVersion === packageVersion &&
      Object.keys(markerFile).sort().join(',') === 'dataVersion,schemaRevision,softwareVersion,writtenAt', 'data-version-marker-file', markerFile);
    await primary.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab' });
    await primary.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab' });
    await assertRenderer(primary, `document.activeElement instanceof HTMLButtonElement && document.activeElement.matches(':focus-visible')`, 'j14-keyboard-visible-focus');
    await click(primary, '查看数据位置', 'reveal-data');
    await waitFor(primary, `document.querySelector('.data-storage-summary')?.dataset.revealRequested==='requested'`, 'reveal-requested');
    await assertRenderer(primary, `document.querySelector('.data-storage-summary')?.dataset.nativeRevealSuppressedForE2e==='true'`, 'main-owned-zero-argument-reveal');

    at('diagnostics-bundle-export');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'data-storage-return');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'diagnostics-landing');
    // 设置 › 本机 › 诊断 replaces 11a's 即将提供 row (Issue #938 restack onto #934).
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'diagnostics-open-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'diagnostics-open-settings-hub');
    await assertRenderer(primary, `(() => { const row=document.querySelector('[data-settings-group="local"] [data-settings-entry="diagnostics"]'); const entry=row?.querySelector('[data-settings-route="diagnostics"]'); return entry instanceof HTMLButtonElement && !entry.disabled && entry.getAttribute('aria-label')==='诊断' && row.dataset.settingsAvailability===undefined && !row.querySelector('.settings-coming-soon'); })()`, 'diagnostics-settings-row');
    await click(primary, '诊断', 'diagnostics-open');
    await waitFor(primary, `document.querySelector('[data-screen="diagnostics"] [data-crash-list-ready="true"]')`, 'diagnostics-ready');
    await assertRenderer(primary, `document.querySelector('#context-title')?.textContent==='设置' && document.querySelector('#context-position')?.textContent==='本机 · 诊断' && document.querySelector('#app-sidebar [data-nav-settings]')?.getAttribute('aria-current')==='page'`, 'diagnostics-settings-place');
    await assertRenderer(primary, `document.querySelector('[data-screen="diagnostics"]')?.textContent.includes('本机崩溃记录')`, 'diagnostics-crash-heading');
    await assertRenderer(primary, `document.querySelector('[data-crash-list]')?.textContent.includes('2026-10-17T00:00:00.000Z') && document.querySelector('[data-crash-list]')?.textContent.includes('界面进程退出')`, 'diagnostics-crash-record');
    await primary.evaluate(`Array.from(document.querySelectorAll('[data-crash-list] .source-card')).find((item) => item.textContent.includes('2026-10-17T00:00:00.000Z')).querySelector('details').open = true`);
    await assertRenderer(primary, `document.querySelector('[data-crash-list] details[open] pre')?.textContent.includes('<redacted-path>') && !document.querySelector('[data-crash-list] [contenteditable]')`, 'diagnostics-read-only-record');
    await click(primary, '导出诊断包…', 'diagnostics-export');
    await waitFor(primary, `document.querySelector('[data-export-state="exported"]')`, 'diagnostics-exported');
    const diagnosticsFolders = await readdir(diagnosticsDestination);
    requireJourney(diagnosticsFolders.length === 1 && diagnosticsFolders[0].startsWith('AI7 诊断 '), 'diagnostics-folder');
    const diagnosticsBundle = resolve(diagnosticsDestination, diagnosticsFolders[0]);
    requireJourney((await readdir(diagnosticsBundle)).sort().join(',') === 'README.txt,crashes,summary.json', 'diagnostics-allowed-files');
    const diagnosticsSummary = JSON.parse(await readFile(resolve(diagnosticsBundle, 'summary.json'), 'utf8'));
    // 数据版本 and 数据库修订 named apart (Issue #967): the Data Version is 1, the schema revision the store's own.
    requireJourney(diagnosticsSummary.appVersion === packageVersion && diagnosticsSummary.dataVersion === 1 && diagnosticsSummary.schemaRevision === CREDENTIAL_CLEANUP_SCHEMA_VERSION && diagnosticsSummary.protocol === 202 &&
      diagnosticsSummary.policySetVersion === 'no-policy-lock' && diagnosticsSummary.logs === '无日志文件', 'diagnostics-summary');
    requireJourney((await readFile(resolve(diagnosticsBundle, 'README.txt'), 'utf8')).includes('不含数据库、书稿'), 'diagnostics-exclusions');
    await click(primary, '查看诊断位置', 'diagnostics-reveal');
    await waitFor(primary, `document.querySelector('[data-reveal-state="requested"]')`, 'diagnostics-revealed');
    await click(primary, '返回', 'diagnostics-return');

    at('model-service-first-save');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'model-service-landing');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-service-open-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-service-open-settings-hub');
    await click(primary, '模型服务', 'model-service-open');
    await waitFor(primary, `document.querySelector('[data-screen="model-service"]')`, 'model-service-ready');
    // J-14 dark pass (#935): 深色 through 设置 › 外观, this screen checked, then 跟随系统 again; back through the sidebar.
    await runJ14DarkPass({ renderer: primary, journey: 'J-12', at, representative: '#screen[data-screen="model-service"] > .settings-layout > .model-service-settings.page-content', returnToScreen: async () => {
      await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'dark-pass-return-settings');
      await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'dark-pass-return-settings-hub');
      // 设置 paints its hub after the click, so the 模型服务 row is waited for and followed once it is there (#935).
      await waitFor(primary, `(() => { const node=Array.from(document.querySelectorAll('#screen[data-screen="settings"] button')).find((item)=>item.textContent==='模型服务'); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, 'dark-pass-return-model-service');
    } });
    await waitFor(primary, `document.querySelector('[data-screen="model-service"]')`, 'model-service-ready-after-dark-pass');
    await assertRenderer(primary, `(() => {
      const screen=document.querySelector('.model-service-settings');
      const roles=Array.from(screen.querySelectorAll('[data-model-role]'));
      const technical=screen.querySelector('.model-service-technical');
      return roles.length===2 && roles.every(node=>['main-editorial','fast-interaction'].includes(node.dataset.modelRole)) &&
        !screen.querySelector('.model-role-grid') && screen.querySelectorAll('[data-model-route]').length===1 &&
        technical instanceof HTMLDetailsElement && (!technical.open || technical.hidden) && ['查看技术详情','记录信息'].includes(technical.querySelector('summary')?.textContent) &&
        technical.querySelector('[data-policy-integrity-state="verified"]') && screen.dataset.providerTransmissionCount==='0';
    })()`, 'inline-model-flow-no-legacy-cards');
    // ADR 0073 §3 and V2-UX-MSET-007 (Issue #435): a configured provider appears as a connection only when a Model Role
    // can bind to it. Since Issue #811 the two production routes are bindable; every other configured provider is named once,
    // in the 尚未支持 list, offers nothing to choose or fill in, and its routes and hosts are named nowhere. Since Issue #1215
    // the one flow (`[data-model-service-flow]`) also names the six channels of ADR 0094 §1 — never a route, route id or host —
    // and a channel without a credential slot shows each declared model with its disposition by name and nothing to choose.
    const unbound = await configuredUnboundProviderNames();
    requireJourney(unbound.names.length > 0 && unbound.listed.length > 0, 'model-service-configured-providers-read');
    await assertRenderer(primary, `(() => {
      const screen=document.querySelector('[data-screen="model-service"]');
      const list=screen?.querySelector('[data-unsupported-providers]');
      const flow=screen?.querySelector('[data-model-service-flow]');
      if(!(screen instanceof HTMLElement)||!(list instanceof HTMLElement)||!(flow instanceof HTMLElement)||!screen.textContent?.includes('DeepSeek 开放平台（官方）'))return false;
      const outside=screen.cloneNode(true);
      outside.querySelector('[data-unsupported-providers]')?.remove();
      outside.querySelector('[data-model-service-flow]')?.remove();
      const listed=list.textContent??'';
      return ${JSON.stringify(unbound.names)}.every((name)=>!outside.textContent.includes(name)) &&
        ${JSON.stringify(unbound.routes)}.every((name)=>!flow.textContent.includes(name)) &&
        ${JSON.stringify(unbound.listed)}.every((name)=>listed.includes(name)) &&
        list.querySelectorAll('input,button,select,textarea,a').length===0 &&
        Array.from(list.querySelectorAll('li')).every((item)=>item.textContent.endsWith('尚未支持'));
    })()`, 'model-service-unbound-provider-absent');
    await assertRenderer(primary, `(() => {
      const flow=document.querySelector('[data-model-service-flow]');
      const mainRole=flow?.querySelector('[data-action="select-main-role-model"]');
      const searchHeading=document.querySelector('[data-search-backends] h3');
      if(!(mainRole instanceof HTMLButtonElement)||mainRole.hasAttribute('data-developer-only')||
        !(searchHeading instanceof HTMLElement)||searchHeading.hasAttribute('data-developer-only'))return false;
      const channels=Array.from(flow?.querySelectorAll('[data-model-channel]')??[]).map((node)=>node.dataset.modelChannel);
      const zen=flow?.querySelector('[data-model-channel="opencode-zen"] input');
      if(JSON.stringify(channels)!==JSON.stringify(['opencode-go','deepseek-open-platform','openai-platform','anthropic-claude','google-gemini','opencode-zen'])||!(zen instanceof HTMLInputElement))return false;
      zen.click();
      const items=Array.from(flow.querySelectorAll('.model-service-flow-ineligible li'));
      // Issue #1225: Zen now offers its credential entry; with no credential saved, no model it lists can be chosen.
      const shown=flow.dataset.flowChannel==='opencode-zen' && Array.from(flow.querySelectorAll('[data-model-choice]')).every((node)=>node.disabled) &&
        flow.querySelector('[data-action="save-channel-credential"]')?.textContent==='保存并获取模型' && flow.querySelector('input[type="password"]') instanceof HTMLInputElement && !flow.querySelector('[data-action="enter-channel-credential"]') && flow.querySelector('[data-action="use-model-for-both-roles"]')?.disabled===true &&
        items.length===0 && flow.querySelectorAll('[data-model-choice]').length>0 &&
        ${JSON.stringify(unbound.routes)}.every((name)=>!flow.textContent.includes(name));
      flow.querySelector('[data-model-channel="opencode-go"] input').click();
      flow.querySelector('[data-model-channel="deepseek-open-platform"] input').click();
      return shown && flow.dataset.flowChannel==='deepseek-open-platform' && flow.querySelector('[data-model-choice="deepseek-flash"]')?.disabled===true;
    })()`, 'model-service-flow-dispositions');
    await tabUntil(primary, `document.activeElement?.id==='main-editorial-connection-name' && document.activeElement.matches(':focus-visible')`, 'model-settings-keyboard-connection', 16);
    await dispatchTab(primary);
    await assertRenderer(primary, `document.activeElement?.id==='main-editorial-credential' && document.activeElement.matches(':focus-visible')`, 'model-settings-keyboard-credential');
    await assertRenderer(primary, `document.querySelector('[data-action="save-channel-credential"]')?.disabled===true`, 'model-settings-empty-credential-disabled');
    const secretOne = randomBytes(48).toString('base64url');
    const secretTwo = randomBytes(48).toString('base64url');
    await fill(primary, '#main-editorial-connection-name', 'J12 主编辑连接', 'model-connection-name');
    await fill(primary, '#main-editorial-credential', secretOne, 'model-credential-first');
    credentialMutationReached = true;
    await click(primary, '保存并获取模型', 'model-credential-save');
    await waitFor(primary, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('[data-credential-state="ready"]')`, 'model-credential-ready');
    // #1304: development-ci never performs account discovery; saving succeeds while discovery reports its failure.
    await waitFor(primary, `document.querySelector('#persistence-status')?.dataset.tone==='error' && document.querySelector('#persistence-status')?.textContent.includes('凭据已保存，但无法获取模型列表：模型服务不可达，请检查网络或网络代理设置') && document.querySelector('.model-service-technical:not([open]) [data-model-discovery-code="MODEL_SERVICE_UNREACHABLE"]')`, 'model-save-discovery-failure-visible');
    await assertRenderer(primary, `(() => { const input=document.querySelector('#main-editorial-credential'); return input instanceof HTMLInputElement && input.type==='password' && input.autocomplete==='off' && input.value==='' && !document.body.textContent.includes(${JSON.stringify(secretOne)}); })()`, 'model-secret-not-redisplayed');
    // The one flow (Issue #1215) offers the saved channel's model to both roles, already the choice both hold: nothing to apply.
    await assertRenderer(primary, `(() => {
      const flow=document.querySelector('[data-model-service-flow]');
      const official=flow?.querySelector('[data-model-channel="deepseek-open-platform"]');
      if(!(official instanceof HTMLElement)||official.dataset.channelCredential!=='ready')return false;
      official.querySelector('input').click();
      const model=flow.querySelector('[data-model-choice="deepseek-flash"]');
      const use=flow.querySelector('[data-action="use-model-for-both-roles"]');
      const test=flow.querySelector('[data-action="test-flow-connection"]');
      return flow.dataset.flowChannel==='deepseek-open-platform' && model instanceof HTMLInputElement && model.checked && !model.disabled &&
        model.closest('label')?.textContent.includes('当前使用中') && use instanceof HTMLButtonElement && use.disabled && test instanceof HTMLButtonElement && !test.disabled;
    })()`, 'model-service-flow-current-choice');
    // #1374: clearing a manually entered ID restores the selected catalogue radio and its effective actions.
    await assertRenderer(primary, `(() => { const flow=document.querySelector('[data-model-service-flow]'); const radio=flow.querySelector('[data-model-choice="deepseek-flash"]'); const custom=flow.querySelector('[data-custom-model-id]'); if(!(custom instanceof HTMLInputElement)||!radio.checked)return false; custom.value='j12-temporary-manual'; custom.dispatchEvent(new Event('input',{bubbles:true})); if(radio.checked)return false; custom.value=''; custom.dispatchEvent(new Event('input',{bubbles:true})); return radio.checked && !flow.querySelector('[data-action="test-flow-connection"]').disabled && flow.querySelector('[data-action="use-model-for-both-roles"]').disabled; })()`, 'model-manual-id-round-trip');
    // Ordinary mode uses the same remembered catalogue choice; channel round trips restore the selection through the owner.
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-memory-ordinary-mode-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-memory-ordinary-mode-settings-ready');
    await click(primary, '帮助', 'model-memory-ordinary-mode-help');
    await waitFor(primary, `document.querySelector('.help-developer-mode input')?.checked===true && document.querySelector('.help-developer-mode input')?.disabled===false`, 'model-memory-ordinary-mode-toggle-ready');
    await assertRenderer(primary, `(() => { const toggle=document.querySelector('.help-developer-mode input'); if(!(toggle instanceof HTMLInputElement)||toggle.disabled)return false; toggle.click(); return true; })()`, 'model-memory-ordinary-mode-toggle');
    await waitFor(primary, `document.documentElement.dataset.technicalLayerVisible==='false' && localStorage.getItem('ai7.technicalLayerVisible')==='false'`, 'model-memory-ordinary-mode');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-memory-ordinary-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-memory-ordinary-settings-ready');
    await click(primary, '模型服务', 'model-memory-ordinary-entry');
    await waitFor(primary, `document.querySelector('select[aria-label="渠道"]')`, 'model-memory-ordinary-ready');
    await assertRenderer(primary, `(() => { const channel=document.querySelector('select[aria-label="渠道"]'); const choose=(value)=>{channel.value=value;channel.dispatchEvent(new Event('change',{bubbles:true}));}; choose('deepseek-open-platform'); const selected=document.querySelector('select[aria-label="AI7 使用的模型"]').value; choose('openai-platform'); choose('deepseek-open-platform'); const model=document.querySelector('select[aria-label="AI7 使用的模型"]'); return selected==='deepseek-flash' && model.value===selected && !model.disabled; })()`, 'model-ordinary-catalogue-round-trip');
    // #1431 item 97: a manual model ID is the developer layer's; ordinary settings keep the searchable catalogue choice.
    await assertRenderer(primary, `(() => { const flow=document.querySelector('[data-model-service-flow]'); const select=flow.querySelector('select[aria-label="AI7 使用的模型"]'); return flow.querySelector('[data-custom-model-id]')===null && select.value==='deepseek-flash' && !flow.querySelector('[data-action="test-flow-connection"]').disabled && flow.querySelector('[data-action="use-model-for-both-roles"]').disabled; })()`, 'model-ordinary-manual-id-hidden');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-memory-development-restored-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-memory-development-restored-settings-ready');
    await click(primary, '帮助', 'model-memory-development-restored-help');
    await waitFor(primary, `document.querySelector('.help-developer-mode input')?.checked===false && document.querySelector('.help-developer-mode input')?.disabled===false`, 'model-memory-development-restored-toggle-ready');
    await assertRenderer(primary, `(() => { const toggle=document.querySelector('.help-developer-mode input'); if(!(toggle instanceof HTMLInputElement)||toggle.disabled)return false; toggle.click(); return true; })()`, 'model-memory-development-restored-toggle');
    await waitFor(primary, `document.documentElement.dataset.technicalLayerVisible==='true' && localStorage.getItem('ai7.technicalLayerVisible')==='true'`, 'model-memory-development-restored');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-memory-return-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-memory-return-settings-ready');
    await click(primary, '模型服务', 'model-memory-return-models');
    await waitFor(primary, `document.querySelector('[data-model-channel="deepseek-open-platform"] input')`, 'model-memory-return-models-ready');
    await primary.evaluate(`document.querySelector('[data-model-channel="deepseek-open-platform"] input').click()`);
    // #1282: model IDs and roles are configurable without running a diagnostic; refresh stays provider-free here.
    await requireJourney(await primary.evaluate(`(async () => {
      const refreshed=await window.ai7.refreshModelServiceModels({route:'deepseek-open-platform'});
      if(refreshed.modelDiscovery?.status!=='failure'||refreshed.modelDiscovery.code!=='MODEL_SERVICE_UNREACHABLE'||
        !refreshed.routeChoice.routes.find(route=>route.route==='deepseek-open-platform')?.models.some(model=>model.modelId==='deepseek-flash'))return false;
      let settings=await window.ai7.selectMainRoleModel({route:'deepseek-open-platform',modelId:'j12-custom-main'});
      const binding=(id)=>settings.roles.find(role=>role.roleId===id)?.binding;
      if(binding('main-editorial')?.modelId!=='j12-custom-main'||binding('fast-interaction')?.modelId!=='deepseek-flash')return false;
      settings=await window.ai7.selectFastRoleModel({route:'deepseek-open-platform',modelId:'j12-custom-fast'});
      if(binding('main-editorial')?.modelId!=='j12-custom-main'||binding('fast-interaction')?.modelId!=='j12-custom-fast')return false;
      settings=await window.ai7.selectBothRoleModels({route:'deepseek-open-platform',modelId:'deepseek-flash'});
      return binding('main-editorial')?.modelId==='deepseek-flash'&&binding('fast-interaction')?.modelId==='deepseek-flash';
    })()`), 'independent-role-models-without-test');
    await assertRenderer(primary, `(() => { const refresh=document.querySelector('[data-action="retry-model-list"]'); if(!(refresh instanceof HTMLButtonElement)||refresh.disabled||refresh.textContent!=='刷新模型列表')return false; refresh.click(); return true; })()`, 'model-refresh-click');
    await waitFor(primary, `document.querySelector('#persistence-status')?.dataset.tone==='error' && document.querySelector('#persistence-status')?.textContent==='模型服务不可达，请检查网络或网络代理设置' && document.querySelector('.model-service-technical:not([open]) [data-model-discovery-code="MODEL_SERVICE_UNREACHABLE"]')`, 'model-refresh-discovery-failure-visible');
    await assertRenderer(primary, `document.querySelector('[data-action="test-flow-connection"]')?.disabled===false && document.querySelector('.model-service-flow-feedback')?.textContent.includes('尚未测试')`, 'inline-model-connection-test-surface');
    // #1372: ordinary-mode configuration uses the same role, refresh, filter and persisted favourite operations.
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'ordinary-catalogue-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'ordinary-catalogue-settings-ready');
    await click(primary, '帮助', 'ordinary-catalogue-help');
    await assertRenderer(primary, `(() => { const toggle=document.querySelector('.help-developer-mode input'); if(!toggle||toggle.disabled)return false; toggle.click(); return true; })()`, 'ordinary-catalogue-mode');
    await waitFor(primary, `document.documentElement.dataset.technicalLayerVisible==='false'`, 'ordinary-catalogue-mode-ready');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'ordinary-catalogue-return-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'ordinary-catalogue-return-ready');
    await click(primary, '模型服务', 'ordinary-catalogue-entry');
    await waitFor(primary, `document.querySelector('[data-model-service-mode="ordinary"]') && document.querySelectorAll('[data-model-role]').length===2`, 'ordinary-catalogue-roles');
    await assertProgressiveSelect(primary);
    await primary.evaluate(`globalThis.__j12PollOriginalRole=document.querySelector('[data-model-role="main-editorial"]').textContent`);
    for (let cycle=0;cycle<2;cycle++) {
      await assertRenderer(primary, `(() => {const heading=document.querySelector('[data-search-backends] h3');heading.focus();globalThis.__j12PollSettings=document.querySelector('.model-service-settings');globalThis.__j12PollRole=document.querySelector('[data-model-role="main-editorial"]').textContent;return document.documentElement.dataset.technicalLayerVisible==='false';})()`, 'ordinary-poll-catalogue-focus');
      await primary.evaluate(`window.ai7.selectMainRoleModel({route:'deepseek-open-platform',modelId:${JSON.stringify('j12-poll-main-'+cycle)}})`);
      await new Promise(resolve=>setTimeout(resolve,2200));
      await waitFor(primary, `document.querySelector('.model-service-settings')!==globalThis.__j12PollSettings && document.querySelector('[data-model-role="main-editorial"]')?.textContent!==globalThis.__j12PollRole && document.activeElement===document.querySelector('[data-search-backends] h3')`, 'ordinary-poll-catalogue-changed-paint');
    }
    await primary.evaluate(`window.ai7.selectMainRoleModel({route:'deepseek-open-platform',modelId:'deepseek-flash'})`);
    await waitFor(primary, `document.querySelector('[data-model-role="main-editorial"]')?.textContent===globalThis.__j12PollOriginalRole`, 'ordinary-poll-catalogue-restored');
    // #1376 review F2: use the real model control, augmenting only its options with public synthetic labels.
    requireJourney(await primary.evaluate(`(async()=>{
      const owner=document.querySelector('.model-service-settings'),select=owner?.querySelector('select[aria-label="AI7 使用的模型"]');
      if(!(select instanceof HTMLSelectElement))return false;
      for(let i=0;i<150;i++)select.add(new Option('公开选项 '+i,'option-'+i));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const trigger=select.nextElementSibling,popup=trigger?.nextElementSibling,filter=popup?.querySelector('input'),list=popup?.querySelector('[role="listbox"]');
      if(!trigger?.matches('.ui-select-trigger')||!filter||!list)return false;
      trigger.scrollIntoView({block:'center',behavior:'instant'});trigger.click();filter.value='公开';filter.dispatchEvent(new Event('input',{bubbles:true}));filter.focus();filter.setSelectionRange(0,1);list.scrollTop=128;
      globalThis.__j12OpenSelect={owner,select,trigger,popup,filter,list,value:select.value};return !popup.hidden;
    })()`), 'ordinary-select-poll-open');
    for(let cycle=0;cycle<2;cycle++) {
      const reads=await primary.evaluate(`Number(globalThis.__j12OpenSelect.owner.dataset.changedCataloguePolls)`);
      await primary.evaluate(`window.ai7.selectMainRoleModel({route:'deepseek-open-platform',modelId:${JSON.stringify('j12-popup-poll-'+cycle)}})`);
      await waitFor(primary, `Number(globalThis.__j12OpenSelect.owner.dataset.changedCataloguePolls)>${reads}`, 'ordinary-select-actual-changed-poll');
      await assertRenderer(primary, `(()=>{const s=globalThis.__j12OpenSelect;return s.owner===document.querySelector('.model-service-settings')&&s.select.isConnected&&!s.popup.hidden&&s.trigger.getAttribute('aria-expanded')==='true'&&s.filter.value==='公开'&&document.activeElement===s.filter&&s.filter.selectionStart===0&&s.filter.selectionEnd===1&&s.list.scrollTop===128&&s.select.value===s.value;})()`, 'ordinary-select-filter-caret-scroll-poll-survival');
    }
    await assertRenderer(primary, `(()=>{const s=globalThis.__j12OpenSelect;s.filter.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return s.popup.hidden&&document.activeElement===s.trigger;})()`, 'ordinary-select-escape-trigger-focus');
    await waitFor(primary, `(()=>{const s=globalThis.__j12OpenSelect,owner=document.querySelector('.model-service-settings'),native=owner?.querySelector('select[aria-label="AI7 使用的模型"]'),trigger=native?.nextElementSibling;return owner!==s.owner&&native?.value===s.value&&trigger?.matches('.ui-select-trigger')&&document.activeElement===trigger&&trigger.getAttribute('aria-expanded')==='false'&&document.querySelector('[data-model-role="main-editorial"]')?.textContent.includes('J12 Popup Poll 1');})()`, 'ordinary-select-latest-projection-trigger-focus');
    await primary.evaluate(`globalThis.__j12AfterCloseOwner=document.querySelector('.model-service-settings')`);
    await primary.evaluate(`window.ai7.selectMainRoleModel({route:'deepseek-open-platform',modelId:'deepseek-flash'})`);
    await waitFor(primary, `(()=>{const native=document.querySelector('select[aria-label="AI7 使用的模型"]');return document.querySelector('.model-service-settings')!==globalThis.__j12AfterCloseOwner&&document.querySelector('[data-model-role="main-editorial"]')?.textContent===globalThis.__j12PollOriginalRole&&native?.value===globalThis.__j12OpenSelect.value&&document.activeElement===native?.nextElementSibling;})()`, 'ordinary-select-poll-role-restored');
    await primary.evaluate(`delete globalThis.__j12OpenSelect;delete globalThis.__j12AfterCloseOwner`);
    await assertRenderer(primary, `(() => {const mode=document.querySelector('select[aria-label="网络代理方式"]');mode.value='proxy';mode.dispatchEvent(new Event('change',{bubbles:true}));const input=document.querySelector('input[aria-label="代理 URL"]');input.value='http://127.0.0.1:1';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange(7,12,'backward');globalThis.__j12PollDraft=input;return true;})()`, 'ordinary-poll-draft-focus');
    for (let cycle=0;cycle<2;cycle++) {
      await primary.evaluate(`window.ai7.selectMainRoleModel({route:'deepseek-open-platform',modelId:${JSON.stringify('j12-poll-draft-'+cycle)}})`);
      await new Promise(resolve=>setTimeout(resolve,2200));
      await assertRenderer(primary, `(() => {const input=document.querySelector('input[aria-label="代理 URL"]');return input===globalThis.__j12PollDraft && document.activeElement===input && input.value==='http://127.0.0.1:1' && input.selectionStart===7 && input.selectionEnd===12;})()`, 'ordinary-draft-during-changed-catalogue');
    }
    await primary.evaluate(`window.ai7.selectMainRoleModel({route:'deepseek-open-platform',modelId:'deepseek-flash'})`);
    // Changing channels only repaints the model controls. Leave settings to discard the unsaved proxy draft.
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'ordinary-poll-discard-proxy-draft');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'ordinary-poll-draft-settings-ready');
    await click(primary, '模型服务', 'ordinary-poll-draft-reopen');
    await waitFor(primary, `document.querySelector('select[aria-label="网络代理方式"]')?.value==='direct' && document.querySelector('select[aria-label="AI7 使用的模型"]')?.value==='deepseek-flash'`, 'ordinary-poll-draft-cleared');
    await assertOrdinaryModelReachability(primary);
    await assertModelEffortDefaults(primary);
    await assertRenderer(primary, `(() => {
      const select=document.querySelector('select[aria-label="AI7 使用的模型"]');
      const filter=document.querySelector('input[aria-label="筛选模型"]');
      if(!(select instanceof HTMLSelectElement)||select.value!=='deepseek-flash'||!(filter instanceof HTMLInputElement))return false;
      filter.value='no-matching-model'; filter.dispatchEvent(new Event('input',{bubbles:true}));
      if(select.value!=='deepseek-flash')return false;
      const channel=document.querySelector('select[aria-label="渠道"]');
      for(const value of ['opencode-go','deepseek-open-platform']) { channel.value=value; channel.dispatchEvent(new Event('change',{bubbles:true})); }
      return document.querySelector('select[aria-label="AI7 使用的模型"]').value==='deepseek-flash' && document.querySelector('input[aria-label="筛选模型"]').value==='no-matching-model';
    })()`, 'ordinary-catalogue-filter-roundtrip');
    await assertRenderer(primary, `(() => { const star=document.querySelector('[data-favorite-model="deepseek-flash"]'); if(!(star instanceof HTMLButtonElement)||star.disabled)return false; star.click(); return true; })()`, 'ordinary-catalogue-favourite');
    await waitFor(primary, `document.querySelector('[data-favorite-model="deepseek-flash"]')?.getAttribute('aria-pressed')==='true'`, 'ordinary-catalogue-favourite-saved');
    await assertRenderer(primary, `(() => { const refresh=document.querySelector('[data-action="retry-model-list"]'); if(refresh.disabled)return false; refresh.click(); return true; })()`, 'ordinary-catalogue-refresh');
    // #1445: the editor leaves 模型服务 while its refresh is still answering. Effects run one at a time, so a second refresh answers
    // only after the editor's; once it has, the editor's late answer has landed and must not have brought 模型服务 back.
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'catalogue-restore-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'catalogue-restore-settings-ready');
    requireJourney(await primary.evaluate(`window.ai7.refreshModelServiceModels({route:'deepseek-open-platform'})
      .then(()=>new Promise((resolve)=>setTimeout(resolve,250)))
      .then(()=>document.querySelector('#screen')?.dataset.screen==='settings' && document.querySelector('.model-service-settings')===null)`), 'late-refresh-stays-away');
    await click(primary, '帮助', 'catalogue-restore-help');
    await assertRenderer(primary, `(() => { const toggle=document.querySelector('.help-developer-mode input'); if(!toggle||toggle.disabled)return false; toggle.click(); return true; })()`, 'catalogue-restore-developer');
    await waitFor(primary, `document.documentElement.dataset.technicalLayerVisible==='true'`, 'catalogue-developer-ready');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'catalogue-developer-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'catalogue-developer-settings-ready');
    await click(primary, '模型服务', 'catalogue-developer-entry');
    await waitFor(primary, `document.querySelector('[data-model-service-mode="developer"]')`, 'catalogue-developer-entry-ready');
    // A manual model ID per role is the developer layer's (#1431 item 97): the role assignments run here, in developer mode.
    await fill(primary, '[data-custom-model-id]', 'j12-ordinary-main', 'ordinary-custom-model');
    await assertRenderer(primary, `(() => { const button=document.querySelector('[data-action="select-main-role-model"]'); if(button.disabled)return false; button.click(); return true; })()`, 'ordinary-main-role');
    await waitFor(primary, `document.querySelector('[data-model-role="main-editorial"]')?.textContent.match(/J12 Ordinary Main|j12-ordinary-main/u)`, 'ordinary-main-visible');
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then(settings=>settings.roles.find(role=>role.roleId==='main-editorial')?.binding?.modelId==='j12-ordinary-main' && settings.roles.find(role=>role.roleId==='fast-interaction')?.binding?.modelId==='deepseek-flash')`), 'ordinary-main-independent');
    await fill(primary, '[data-custom-model-id]', 'j12-ordinary-fast', 'ordinary-fast-model');
    await assertRenderer(primary, `(() => { document.querySelector('[data-action="select-fast-role-model"]').click(); return true; })()`, 'ordinary-fast-role');
    await waitFor(primary, `document.querySelector('[data-model-role="fast-interaction"]')?.textContent.match(/J12 Ordinary Fast|j12-ordinary-fast/u)`, 'ordinary-fast-visible');
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then(settings=>settings.roles.find(role=>role.roleId==='main-editorial')?.binding?.modelId==='j12-ordinary-main' && settings.roles.find(role=>role.roleId==='fast-interaction')?.binding?.modelId==='j12-ordinary-fast')`), 'ordinary-fast-independent');
    await fill(primary, '[data-custom-model-id]', 'deepseek-flash', 'ordinary-shared-model');
    await assertRenderer(primary, `(() => { document.querySelector('[data-action="use-model-for-both-roles"]').click(); return true; })()`, 'ordinary-shared-role');
    await waitFor(primary, `document.querySelector('.model-service-current-roles') && !document.querySelector('.model-service-current-roles').textContent.match(/J12 Ordinary|j12-ordinary/u)`, 'ordinary-shared-role-visible');
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then(settings=>settings.roles.filter(role=>['main-editorial','fast-interaction'].includes(role.roleId)).every(role=>role.binding?.modelId==='deepseek-flash'))`), 'ordinary-shared-role-saved');
    await assertProgressiveSelect(primary);
    at('model-service-search-backends');
    const searchSettings = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.searchBackends)`);
    requireJourney(searchSettings.selectedBackendId === 'search-tinyfish' && JSON.stringify(searchSettings.backends.map((entry)=>entry.backendId)) === JSON.stringify(['search-tinyfish','search-deepseek','search-brave','search-parallel','search-bochaai']), 'search-backend-ranking-default');
    await assertRenderer(primary, `document.querySelector('[data-search-backends]')?.textContent.includes('联网检索') && document.querySelector('[data-search-backend="search-tinyfish"]')?.textContent.includes('30 次/分钟') && document.querySelector('[data-search-backend="search-brave"]')?.textContent.includes('间歇性')`, 'search-backend-measured-profile');
    await assertRenderer(primary, `Array.from(document.querySelectorAll('[data-search-backend]')).every(card=>card.dataset.selected==='false'&&card.textContent.includes('未配置密钥')&&!card.textContent.includes('已选择')&&Array.from(card.querySelectorAll('button')).find(node=>node.textContent==='测试检索').disabled)`, 'search-keyless-not-ready');
    // The CI fixture path is called directly; keyless settings controls stay disabled.
    for (const id of ['search-tinyfish','search-deepseek','search-brave','search-parallel','search-bochaai']) {
      requireJourney(await primary.evaluate(`window.ai7.probeSearchBackend({backendId:'${id}'}).then(result=>result.reachable&&result.results.length<=3&&result.results.every(hit=>hit.url.startsWith('https://')&&hit.title.length<=120))`), 'search-probe-fixed-public-stub');
    }
    await primary.evaluate(`window.ai7.selectSearchBackend({backendId:'search-brave'})`);
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.searchBackends.selectedBackendId==='search-brave')`), 'search-backend-selection-saved');
    const unknownSearchBackend = await primary.evaluate(`window.ai7.selectSearchBackend({backendId:'search-kimi'}).then(()=>false,(error)=>error.code==='SEARCH_BACKEND_NOT_SHIPPED')`);
    requireJourney(unknownSearchBackend, 'unshipped-search-backend-refused');
    // The 备用来源 (Issue #1226): one per ranked card, offered only for a backend whose key is saved and that is not the default —
    // under development-ci no key is saved, so every control is disabled; the default, a keyless backend and the direct-search
    // candidate are refused, and clearing succeeds. Choosing a keyed fallback is composed service evidence (tests/service/search-fallback.test.ts).
    await assertRenderer(primary, `(() => { const cards=Array.from(document.querySelectorAll('[data-search-backend]'));
      return cards.length===5 && cards.every((card)=>{ const control=card.querySelector('[data-action="select-search-fallback"]'); return control instanceof HTMLButtonElement && control.textContent==='设为备用来源' && control.disabled && card.dataset.fallback==='false'; }) &&
        document.querySelector('[data-search-backends]').textContent.includes('未实测候选不可选') &&
        document.querySelector('[data-search-backends]').textContent.includes('设置备用来源后') &&
        document.querySelector('[data-search-backends]').textContent.includes('余额或套餐额度不足时，直接切换一次') &&
        document.querySelector('[data-search-backends]').textContent.includes('其他认证错误不会切换');
    })()`, 'search-fallback-control');
    const fallbackRefusals = await primary.evaluate(`Promise.all([
      window.ai7.selectSearchBackend({backendId:'search-brave',role:'fallback'}).then(()=>null,(error)=>error.code),
      window.ai7.selectSearchBackend({backendId:'search-parallel',role:'fallback'}).then(()=>null,(error)=>error.code),
      window.ai7.selectSearchBackend({backendId:'deepseek-direct-search-v1',role:'fallback'}).then(()=>null,(error)=>error.code),
      window.ai7.selectSearchBackend({backendId:'search-deepseek',candidateId:'deepseek-direct-search-v1',role:'fallback'}).then(()=>null,(error)=>error.code),
    ])`);
    requireJourney(fallbackRefusals[0] === 'SEARCH_FALLBACK_IS_DEFAULT' && fallbackRefusals[1] === 'SEARCH_CREDENTIAL_MISSING' &&
      fallbackRefusals.slice(2).every((code) => typeof code === 'string' && code.length > 0), 'search-fallback-refusals');
    requireJourney(await primary.evaluate(`window.ai7.selectSearchBackend({backendId:null,role:'fallback'}).then((settings)=>settings.searchBackends.fallbackBackendId===null)`), 'search-fallback-cleared');
    // The DeepSeek direct-search candidate (Issue #1055 into W22-S10a #1181): disclosed as 未实测 beside the ranked backends, not
    // selectable, its one explicit 测试连接 refused under development-ci before any credential or transport; closed identifiers only.
    const candidateSettings = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.searchBackends.candidates)`);
    requireJourney(candidateSettings.length === 3 && candidateSettings[0].candidateId === 'deepseek-direct-search-v1' && candidateSettings[0].backendId === 'search-deepseek' &&
      candidateSettings[0].measurement === 'not-measured' && candidateSettings[0].selectable === false && candidateSettings[0].endpoint === 'https://api.deepseek.com/v1/tools/search', 'search-candidate-declared');
    requireJourney(candidateSettings.every((candidate) => candidate.measurement === 'not-measured' && candidate.selectable === false), 'search-native-candidates-unmeasured');
    await assertRenderer(primary, `['openai-native-search-v1','anthropic-native-search-v1'].every(id => {
      const card=document.querySelector('[data-search-candidate="'+id+'"]');
      return card?.textContent.includes('未实测') && card.textContent.includes('不作为独立排名默认后端或备用来源') && card.querySelector('[data-action="probe-search-candidate"]')?.disabled===true;
    })`, 'search-native-candidates-disclosed');
    await assertRenderer(primary, `document.querySelector('[data-action="always-use-selected-search-backend"]')?.checked===false`, 'search-native-follow-default');
    requireJourney(await primary.evaluate(`window.ai7.selectSearchBackend({backendId:'search-brave',alwaysUseSelectedBackend:true}).then(settings=>settings.searchBackends.alwaysUseSelectedBackend===true)`), 'search-source-override-saved');
    await assertRenderer(primary, `(() => { const card=document.querySelector('[data-search-candidate="deepseek-direct-search-v1"]');
      const labels=Array.from(card?.querySelectorAll('button')??[]).map((node)=>node.textContent);
      return card?.dataset.measurement==='not-measured' && card.textContent.includes('未实测') && card.textContent.includes('不作为独立排名默认后端或备用来源') && card.textContent.includes('USD 0.75') &&
        card.textContent.includes('不承诺直连调用免费') && JSON.stringify(labels)==='["测试连接"]' && card.querySelector('[data-search-candidate-probe]').textContent==='';
    })()`, 'search-candidate-disclosed-unselectable');
    await assertRenderer(primary, `document.querySelector('[data-action="probe-search-candidate"]')?.disabled===true && !document.querySelector('[data-search-candidate]').textContent.includes('2026-11-01')`, 'search-candidate-keyless-disabled');
    const candidateRefusals = await primary.evaluate(`Promise.all([
      window.ai7.probeSearchBackend({backendId:'search-deepseek',candidateId:'deepseek-direct-search-v1'}).then(()=>null,(error)=>error.code),
      window.ai7.probeSearchBackend({backendId:'search-brave',candidateId:'deepseek-direct-search-v1'}).then(()=>null,(error)=>error.code),
      window.ai7.probeSearchBackend({backendId:'search-deepseek',candidateId:'deepseek-direct-search-v2'}).then(()=>null,(error)=>error.code),
      window.ai7.probeSearchBackend({backendId:'search-deepseek',candidateId:'deepseek-direct-search-v1',query:'manuscript'}).then(()=>null,(error)=>error.code),
      window.ai7.selectSearchBackend({backendId:'deepseek-direct-search-v1'}).then(()=>null,(error)=>error.code),
    ])`);
    requireJourney(candidateRefusals[0] === 'SEARCH_CANDIDATE_PROBE_SCOPE_REFUSED' && candidateRefusals[1] === 'SEARCH_CANDIDATE_UNKNOWN' &&
      candidateRefusals.slice(2).every((code) => typeof code === 'string' && code.length > 0), 'search-candidate-closed-identifiers');
    // Leaving the screen and coming back clears the result: it lives only in that painted section.
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'search-candidate-leave');
    await waitFor(primary, `(() => { const node=Array.from(document.querySelectorAll('#screen[data-screen="settings"] button')).find((item)=>item.textContent==='模型服务'); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, 'search-candidate-return');
    await waitFor(primary, `document.querySelector('[data-search-candidate-probe="deepseek-direct-search-v1"]')?.textContent===''`, 'search-candidate-result-cleared-on-navigation');
    at('model-service-first-save');
    const firstConnection = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>({
      roles:settings.roles.length,
      roleIds:settings.roles.map((role)=>role.roleId),
      connection:settings.roles.find((role)=>role.roleId==='main-editorial')?.connection,
      binding:settings.roles.find((role)=>role.roleId==='main-editorial')?.binding,
      routes:settings.routeChoice.routes,
      unsupported:settings.routeChoice.unsupportedProviders,
      policy:settings.launchPolicy,
    }))`);
    requireJourney(
      firstConnection?.roles === 4 &&
        JSON.stringify(firstConnection.roleIds) === JSON.stringify(['fast-interaction','main-editorial','difficult-escalation','frontier']) &&
        UUID_PATTERN.test(firstConnection.connection?.credentialReference) &&
        firstConnection.connection?.connectionName === 'J12 主编辑连接' &&
        firstConnection.connection?.credentialOperationState === 'ready' &&
        firstConnection.binding?.providerId === 'deepseek-open-platform' &&
        firstConnection.binding?.modelId === 'deepseek-flash' &&
        firstConnection.connection?.selected === true &&
        JSON.stringify(firstConnection.routes?.map((route) => [route.route, route.isDefault, route.inUse, route.status])) ===
          JSON.stringify([['opencode-go', true, false, 'setup-required'], ['deepseek-open-platform', false, true, 'available'], ['openai-platform', false, false, 'setup-required'],
            ['opencode-zen', false, false, 'setup-required'], ['anthropic-claude', false, false, 'setup-required'], ['google-gemini', false, false, 'setup-required']]) &&
        firstConnection.unsupported?.length > 0 && firstConnection.unsupported.every((provider) => provider.statusLabel === '尚未支持') &&
        firstConnection.binding?.adapterRevision === 1 &&
        firstConnection.binding?.configurationRevision === 1 &&
        firstConnection.binding?.credentialSlot === 'deepseek-api-key' &&
        firstConnection.binding?.approvedFallbackChain?.length === 0 &&
        firstConnection.policy?.operationalScope === 'development-ci' &&
        // Synchronized delta with Issue #1408: selected active set v26; new local Plans use Provider Processing v1.
        firstConnection.policy?.activePolicySetVersion === 'no-policy-lock' &&
        firstConnection.policy?.providerProcessing?.version === 'v1' &&
        firstConnection.policy?.providerProcessing?.authorizedLiveTransmissionCount === 0 &&
        firstConnection.policy?.externalExport?.version === 'v2' &&
        firstConnection.policy?.externalExport?.policyEligibilityIsEffectApproval === false &&
        firstConnection.policy?.publicReleasePermission?.present === false,
      'model-first-nonsecret-projection',
    );
    credentialReferenceForCleanup = firstConnection.connection.credentialReference;
    at('model-service-openai-text-contract');
    openAiCredentialMutationReached = true;
    const openAiSecret = randomBytes(48).toString('base64url');
    await primary.evaluate(`document.querySelector('[data-model-channel="openai-platform"] input').click()`);
    await fill(primary, '#main-editorial-openai-platform-connection-name', 'J12 OpenAI text', 'openai-connection-name');
    await fill(primary, '#main-editorial-openai-platform-credential', openAiSecret, 'openai-synthetic-credential');
    await click(primary, '保存并获取模型', 'openai-protected-save');
    await waitFor(primary, `document.querySelector('[data-model-route="openai-platform"] [data-credential-state="ready"]')`, 'openai-protected-save-ready');
    await assertRenderer(primary, `(() => { const card=document.querySelector('[data-model-route="openai-platform"]'); return document.querySelector('.model-service-flow-feedback').textContent.includes('尚未测试') && card.querySelector('input[type="password"]').value==='' && document.querySelector('[data-action="test-flow-connection"]') instanceof HTMLButtonElement; })()`, 'openai-explicit-test-surface');
    // #1281: channel credentials enable all models without a per-model connection-test gate; this CI launch sends no live probe.
    await assertRenderer(primary, `(() => { const flow=document.querySelector('[data-model-service-flow]'); flow.querySelector('[data-model-channel="openai-platform"] input').click();
      const choices=Array.from(flow.querySelectorAll('[data-model-choice]'));
      const shown=flow.dataset.flowChannel==='openai-platform' && choices.some((node)=>node.dataset.modelChoice==='gpt-5.6-sol') && choices.some((node)=>node.dataset.modelChoice==='gpt-5.6-luna') &&
        choices.every((node)=>!node.disabled&&!node.closest('label').textContent.includes('需先测试连接')) &&
        flow.querySelector('[data-action="test-flow-connection"]')?.disabled===false && flow.querySelector('[data-action="use-model-for-both-roles"]')?.disabled===false;
      flow.querySelector('[data-model-channel="deepseek-open-platform"] input').click();
      return shown && flow.dataset.flowChannel==='deepseek-open-platform'; })()`, 'openai-main-choice-without-test');
    await primary.evaluate(`window.ai7.selectFastRoleModel({route:'deepseek-open-platform',modelId:'deepseek-flash'})`);
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>{
      const route=settings.routeChoice.routes.find((item)=>item.route==='openai-platform');
      return route.connection.credentialOperationState==='ready' && route.connection.connectionTest===null &&
        route.models.map((model)=>model.modelId).join(',')==='gpt-5.6-luna,gpt-5.6-sol' &&
        settings.roles.find((role)=>role.roleId==='main-editorial').connection.selected===true &&
        settings.roles.find((role)=>role.roleId==='fast-interaction').connection.fastSelected===true;
    })`), 'openai-saved-is-untested-models-independent-fast');
    requireJourney(await primary.evaluate(`window.ai7.testModelServiceConnection({route:'openai-platform',modelId:'gpt-5.6-sol'}).then(()=>false,(error)=>error.code==='MODEL_CONNECTION_TEST_UNAVAILABLE')`), 'connection-test-ci-scope-denied');
    requireJourney(await primary.evaluate(`window.ai7.selectFastRoleModel({route:'openai-platform',modelId:'account-new-model'}).then(()=>true,()=>false)`), 'dynamic-model-selection-without-test');
    await primary.evaluate(`window.ai7.selectFastRoleModel({route:'deepseek-open-platform',modelId:'deepseek-flash'})`);
    at('model-service-first-save');

    await primary.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await primary.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    const modelZoom = await primary.evaluate(`(() => ({
      viewportFits: document.documentElement.scrollWidth<=document.documentElement.clientWidth+2,
      credentialFormSingleColumn: getComputedStyle(document.querySelector('.model-credential-form')).gridTemplateColumns.split(' ').length===1,
      candidateCardsFit: Array.from(document.querySelectorAll('[data-search-candidate]')).every(card=>card.scrollWidth<=card.clientWidth+2)
    }))()`);
    requireJourney(modelZoom.viewportFits && modelZoom.credentialFormSingleColumn && modelZoom.candidateCardsFit, 'model-settings-zoom-reflow', modelZoom);
    await primary.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(primary, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.model-role-card')).boxShadow==='none' && getComputedStyle(document.querySelector('.model-credential-form input')).borderStyle!=='none'`, 'model-settings-forced-colors');
    await primary.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await primary.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await primary.send('Emulation.clearDeviceMetricsOverride');
    await close();
    // Audit only after Electron releases its data-root file locks, as for the existing credential checks below.
    await assertSecretsAbsentFromDataRoot('J-12', dataRoot, [openAiSecret], 'openai-secret-absent-from-data-root');
    await assertSecretsAbsentFromDataRoot('J-12', dataRoot, [secretOne], 'model-first-secret-absent-from-data-root');

    at('model-service-restart-and-replace');
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'model-restart-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'model-restart-landing');
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.searchBackends.selectedBackendId==='search-brave'&&settings.searchBackends.alwaysUseSelectedBackend===true)`), 'search-backend-selection-survives-restart');
    const restartedConnection = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial'))`);
    requireJourney(
      restartedConnection?.status === 'available' &&
        restartedConnection.connection?.credentialReference === firstConnection.connection.credentialReference &&
        restartedConnection.connection?.credentialOperationState === 'ready',
      'model-credential-restart-ready-same-reference',
    );
    requireJourney(await primary.evaluate(`window.ai7.getPreferences().then(preferences=>preferences.values['model.favourites']['deepseek-open-platform']?.includes('deepseek-flash'))`), 'catalogue-favourite-survives-restart');
    at('model-service-openai-restart-removal');
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>{
      const route=settings.routeChoice.routes.find((item)=>item.route==='openai-platform');
      return route.connection.connectionName==='J12 OpenAI text' && route.connection.connectionTest===null &&
        route.connection.credentialOperationState==='ready' && settings.roles.find((role)=>role.roleId==='fast-interaction').binding.providerId==='deepseek-open-platform';
    })`), 'openai-untested-restart-independent-fast');
    await primary.evaluate(`window.ai7.removeModelServiceCredential({route:'openai-platform'})`);
    requireJourney(await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.routeChoice.routes.find((item)=>item.route==='openai-platform').connection.credentialOperationState==='missing')`), 'openai-removal-state');
    at('model-service-restart-and-replace');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-replace-open-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-replace-open-settings-hub');
    await click(primary, '模型服务', 'model-replace-open');
    await waitFor(primary, `document.querySelector('[data-screen="model-service"]')`, 'model-replace-ready');
    await assertRenderer(primary, `(() => { const input=document.querySelector('#main-editorial-credential'); return input instanceof HTMLInputElement && input.value==='' && !document.body.textContent.includes(${JSON.stringify(secretOne)}); })()`, 'model-restart-no-redisplay');
    const replacementCatalogue = await primary.evaluate(`window.ai7.getModelServiceSettings().then(settings=>settings.routeChoice.routes.find(route=>route.route==='deepseek-open-platform').models.map(model=>model.modelId).sort().join(','))`);
    await fill(primary, '#main-editorial-credential', secretTwo, 'model-credential-replacement');
    await click(primary, '保存并获取模型', 'model-credential-replace');
    await waitFor(primary, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('#main-editorial-credential')?.value==='' && document.querySelector('#persistence-status')?.dataset.tone==='error' && document.querySelector('#persistence-status')?.textContent.includes('凭据已保存，但无法获取模型列表：模型服务不可达，请检查网络或网络代理设置') && document.querySelector('.model-service-technical:not([open]) [data-model-discovery-code="MODEL_SERVICE_UNREACHABLE"]') && document.querySelector('.model-service-settings')?.dataset.providerTransmissionCount==='0'`, 'model-replacement-ready');
    requireJourney(replacementCatalogue.split(',').includes('deepseek-flash') && await primary.evaluate(`window.ai7.getModelServiceSettings().then(settings=>settings.routeChoice.routes.find(route=>route.route==='deepseek-open-platform').models.map(model=>model.modelId).sort().join(',')===${JSON.stringify(replacementCatalogue)})`), 'model-replacement-catalogue-retained');
    const replacedConnection = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(
      replacedConnection?.credentialReference === firstConnection.connection.credentialReference &&
        replacedConnection?.credentialOperationState === 'ready',
      'model-replacement-stable-reference',
    );
    await close();
    await assertSecretsAbsentFromDataRoot('J-12', dataRoot, [secretOne, secretTwo], 'model-replacement-secrets-absent-from-data-root');

    at('database-export');
    // 导出数据库 (Issue #434, S86a; DSTO-017; ADR 0079 §1.6): with the replacement credential protected, the one file the editor
    // approves holds every Book, says its Data Version, and holds neither credential in any of its members.
    const databaseExportPath = resolve(runRoot, 'database-export', 'AI7 数据库.ai7db');
    await mkdir(dirname(databaseExportPath), { recursive: true });
    manager = await launch(undefined, databaseExportPath);
    [primary] = await waitForRendererCount(manager, 1, 'database-export-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-export-landing');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'database-export-open-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'database-export-open-settings-hub');
    await click(primary, '数据与存储', 'database-export-open');
    await waitFor(primary, `document.querySelector('.database-export [data-database-export-action="choose"]') && document.querySelector('.database-export-records summary')`, 'database-export-ready');
    // Issue #1410 item 2: the destination chosen in the save dialog is written at once; there is no 按上述方式导出 step. The
    // Books the export holds are this library's, read from the service before the write.
    const booksShown = await primary.evaluate(`window.ai7.listBooks({ after: null }).then((page) => page.nextCursor === null ? page.items.length : null)`);
    requireJourney(Number.isSafeInteger(booksShown) && booksShown >= 1, 'database-export-books-known', booksShown);
    await click(primary, '导出数据库…', 'database-export-choose');
    await waitFor(primary, `document.querySelector('.database-export-prepared')?.dataset.outcome === 'created'`, 'database-export-created');
    // The outcome line is drawn with the outcome; 导出记录 and its count follow one read later, and only then are the export's
    // controls released and focus moved to 导出数据库…. On a slow runner the one-shot check landed between the two (#656), and a
    // switch turned before the release would lose its focus to 导出数据库…, so the stage waits, bounded, for all of it.
    await waitFor(primary, `document.querySelector('.database-export-outcome')?.textContent === '已导出到所选位置：已新建「AI7 数据库.ai7db」。' && document.querySelector('.database-export')?.dataset.databaseExports === '1' && document.querySelector('.database-export-records summary') !== null && document.querySelector('.database-export [data-database-export-action="choose"]')?.disabled === false && document.activeElement === document.querySelector('.database-export [data-database-export-action="choose"]')`, 'database-export-outcome-words', 30_000);
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
      manifest.schema === 'ai7.database-package/1' && manifest.dataVersion === 1 && manifest.schemaRevision === CREDENTIAL_CLEANUP_SCHEMA_VERSION &&
        manifest.credentials === 'excluded' && manifest.contents?.books === booksShown && Object.keys(packaged)[0] === 'store/ai7.sqlite',
      'database-export-manifest',
      { schema: manifest.schema, dataVersion: manifest.dataVersion, schemaRevision: manifest.schemaRevision, contents: manifest.contents },
    );
    // The package format is unchanged (Issue #967, brief revision 2): its manifest is its own version marker, and the data root's
    // marker beside the store is never exported — no store member but the store's copy.
    const storeMembers = Object.keys(packaged).filter((name) => name.toLowerCase().startsWith('store/'));
    requireJourney(JSON.stringify(storeMembers) === JSON.stringify(['store/ai7.sqlite']), 'database-export-store-members', storeMembers);
    const membersWithSecret = Object.entries(packaged).filter(([, bytes]) => [secretOne, secretTwo].some((secret) =>
      Buffer.from(bytes).includes(Buffer.from(secret, 'utf8')) || Buffer.from(bytes).includes(Buffer.from(secret, 'utf16le')))).map(([name]) => name);
    requireJourney(membersWithSecret.length === 0, 'database-export-no-credential', membersWithSecret);
    const backupFiles = (await readdir(backupLocation)).filter((name) => name.endsWith('.ai7db'));
    requireJourney(backupFiles.length === 1 && backupFiles[0].startsWith('AI7 自动备份 '), 'scheduled-backup-file', backupFiles);
    const backupPackage = unzipSync(await readFile(resolve(backupLocation, backupFiles[0])));
    const backupManifest = JSON.parse(strFromU8(backupPackage['manifest.json']));
    requireJourney(backupManifest.origin === 'scheduled-backup' && backupManifest.schemaRevision === CREDENTIAL_CLEANUP_SCHEMA_VERSION && backupManifest.credentials === 'excluded',
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
      await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), `${name}-open-settings`);
      await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, `${name}-open-settings-hub`);
      await click(primary, '数据与存储', `${name}-open`);
      await waitFor(primary, `document.querySelector('.database-import [data-database-import-action="choose"]') && document.querySelector('.database-import')?.dataset.pending === 'false'`, `${name}-ready`);
    };
    manager = await launch(databaseExportPath);
    [primary] = await waitForRendererCount(manager, 1, 'database-import-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-import-landing');
    const preReplacementBook = await createEmptyBook(primary, 'J12 替换前的图书');
    requireJourney(await primary.evaluate(`(async () => {
      const before = await window.ai7.inspectEditorialLearning({signalOffset:0,itemOffset:0});
      const excluded = await window.ai7.changeEditorialLearning({kind:'book',bookId:${JSON.stringify(preReplacementBook)},excluded:true,expectedEntries:before.controlEntries});
      const off = await window.ai7.changeEditorialLearning({kind:'switch',enabled:false,expectedEntries:excluded.controlEntries});
      return !off.enabled && off.excludedBooks.some(book=>book.bookId===${JSON.stringify(preReplacementBook)});
    })()`), 'database-backup-book-learning-excluded');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('library')), 'database-import-book-return');
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
    const replaceBackup = /^已准备好用「AI7 数据库\.ai7db」替换本机全部数据；本机现在的数据已备份为「(AI7 替换前备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db)」，放在备份位置。$/u.exec(Array.isArray(pendingLines) ? pendingLines[0] ?? '' : '')?.[1];
    requireJourney(
      Array.isArray(pendingLines) && pendingLines.length === 2 && replaceBackup !== undefined && pendingLines[1] === 'AI7 下次启动时完成替换；在此之前不能再做修改，要继续修改请先取消替换。',
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
    await assertRenderer(primary, `(() => { const line = document.querySelector('.database-replacement-record')?.textContent ?? ''; return line.endsWith(${JSON.stringify(` · 已用「AI7 数据库.ai7db」替换本机全部数据 · 替换前备份「${replaceBackup}」`)}); })()`, 'database-replaced-words');
    await close();

    at('database-import-merge');
    // 只导入其中的图书 (Issue #434, S86d; ADR 0079 §1.5): the backup the replacement made holds the Book it took away. Merged,
    // that Book comes back with its records, the Books already here are not taken again, and nothing else of the data changes.
    manager = await launch(resolve(backupLocation, replaceBackup));
    [primary] = await waitForRendererCount(manager, 1, 'database-merge-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-merge-landing');
    // The data replaced from the export never turned learning off, so the file's 本机学习 off can be seen not to travel.
    const destinationLearningEnabled = await primary.evaluate(`window.ai7.inspectEditorialLearning({signalOffset:0,itemOffset:0}).then(page=>page.enabled)`);
    requireJourney(destinationLearningEnabled === true, 'database-merge-destination-learning-on', destinationLearningEnabled);
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
    const mergeBackup = /本机现在的数据已备份为「(AI7 合并前备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db)」，放在备份位置。$/u.exec(Array.isArray(mergeLines) ? mergeLines[0] ?? '' : '')?.[1];
    requireJourney(
      Array.isArray(mergeLines) && mergeLines[0]?.startsWith(`已准备好把「${replaceBackup}」里的 1 本图书合并到本机；`) && mergeBackup !== undefined &&
        mergeLines[1] === 'AI7 下次启动时完成合并；在此之前做的修改都会保留。',
      'database-merge-pending-words',
      mergeLines,
    );
    await quitThroughProduct('database-merge');
    manager = await launch();
    [primary] = await waitForRendererCount(manager, 1, 'database-merged-window');
    await waitFor(primary, `document.querySelector('[data-screen="landing"]')`, 'database-merged-landing');
    const titlesMerged = await bookTitles();
    requireJourney(JSON.stringify(titlesMerged) === JSON.stringify(titlesBeforeReplace), 'database-merged-titles', titlesMerged);
    requireJourney(await primary.evaluate(`(async () => {
      const page = await window.ai7.inspectEditorialLearning({signalOffset:0,itemOffset:0});
      const books = await window.ai7.listBooks({after:null});
      return page.enabled===${JSON.stringify(destinationLearningEnabled)} &&
        page.excludedBooks.some(book=>book.bookId===${JSON.stringify(preReplacementBook)} && book.title==='J12 替换前的图书') &&
        books.items.some(book=>book.bookId===${JSON.stringify(preReplacementBook)} && book.title==='J12 替换前的图书');
    })()`), 'database-merged-book-learning-exclusion');
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.destination('knowledge')), 'database-merged-learning-knowledge');
    await click(primary, '社级编辑记忆', 'database-merged-learning-memory');
    await waitFor(primary, `(() => {
      const exclusions = Array.from(document.querySelectorAll('[data-editorial-memory] details'))
        .find(panel => panel.querySelector(':scope > summary')?.textContent === '学习排除范围');
      return exclusions?.textContent.includes('已排除《J12 替换前的图书》') &&
        document.querySelector('[data-learning-enabled]')?.checked===${JSON.stringify(destinationLearningEnabled)};
    })()`, 'database-merged-learning-display');
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
    const rollBackBackup = /本机现在的数据已备份为「(AI7 替换前备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db)」，放在备份位置。$/u.exec(Array.isArray(rollBackLines) ? rollBackLines[0] ?? '' : '')?.[1];
    requireJourney(
      Array.isArray(rollBackLines) && rollBackLines[0]?.startsWith(`已准备好回退到「${replaceBackup}」；`) && rollBackBackup !== undefined && rollBackBackup !== replaceBackup &&
        rollBackLines[1] === 'AI7 下次启动时完成回退；在此之前不能再做修改，要继续修改请先取消回退。',
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
      requireJourney(replacedManifest.origin === (name === mergeBackup ? 'pre-merge-backup' : 'pre-replace-backup') && replacedManifest.schemaRevision === CREDENTIAL_CLEANUP_SCHEMA_VERSION &&
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
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'model-remove-open-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'model-remove-open-settings-hub');
    await click(primary, '模型服务', 'model-remove-open');
    await waitFor(primary, `document.querySelector('[data-credential-state="ready"]')`, 'model-remove-ready');
    await click(primary, '移除凭据', 'model-remove');
    await waitFor(primary, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='setup-required' && document.querySelector('[data-credential-state="missing"]')`, 'model-removed');
    const removedConnection = await primary.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(
      removedConnection?.credentialReference === firstConnection.connection.credentialReference &&
        removedConnection?.credentialOperationState === 'missing',
      'model-removed-stable-reference',
    );
    productCredentialCleanupSucceeded = true;
    await close();
    await assertSecretsAbsentFromDataRoot('J-12', dataRoot, [secretOne, secretTwo], 'model-removed-secrets-absent-from-data-root');
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
    // 设置 › 评估校准与预测 (Issue #430, plan slice S82; EVAL-010, EVAL-011, EVAL-014): calibration counts the Books whose AI7 初评
    // the editor adjusted (Issue #429, S81b1 — nothing says it is not connected any more) and waits for ten
    // of the editor's adjustments and touches only AI7's starting scores; turning it off is recorded and reads back, and on
    // again; the prediction switch stays closed until thirty published Books carry actuals; and with no Book yet published
    // the central entry says where the actuals come from.
    await assertRenderer(primary, sidebarNavigate(SIDEBAR.settings), 'calibration-open-settings');
    await waitFor(primary, `document.querySelector('[data-screen="settings"]')`, 'calibration-open-settings-hub');
    await click(primary, '评估校准与预测', 'calibration-open');
    const calibrationPage = await readCalibration(primary, () => true, 'calibration-page');
    requireJourney(calibrationPage.calibration === '调分记录 0 / 10 本 · 满 10 本后生效' &&
      calibrationPage.waiting === null &&
      // The house offset (Issue #429, EVAL-011a): its method stated, waiting below ten 调分记录, nothing said of 停用 while on.
      calibrationPage.offset === 'waiting' && calibrationPage.offsetWaiting === '校准偏移尚未计算：满 10 本调分记录后，按校准方法得出，新版本从 AI7 初评开始时按偏移调整起始分数。' &&
      calibrationPage.method === '校准偏移 = 各本书最新一次从 AI7 初评开始并定稿的评估里，你的定稿分数减去 AI7 初评分数的平均值，取到半分；每次读取时重新计算，不另存。' &&
      calibrationPage.offEffect === null &&
      calibrationPage.prediction === '已录入实际数据的已发稿图书 0 / 30 本 · 满 30 本后才能打开' &&
      JSON.stringify(calibrationPage.switches) === JSON.stringify({ calibration: [true, false], prediction: [false, true] }) &&
      calibrationPage.empty === '尚无已发稿图书，设为发稿版本后可在此录入定价和首印。' && calibrationPage.books.length === 0,
    'calibration-page-words', calibrationPage);
    const toggle = (name) => primary.evaluate(`(() => { const input = document.querySelector('[data-calibration-switch="${name}"]'); if (!(input instanceof HTMLInputElement) || input.disabled) return false; input.click(); return true; })()`);
    requireJourney(await toggle('calibration'), 'calibration-off-click');
    const calibrationOff = await readCalibration(primary, (page) => page.calibration === '调分记录 0 / 10 本 · 已关闭', 'calibration-off');
    requireJourney(JSON.stringify(calibrationOff.switches.calibration) === JSON.stringify([false, false]) && calibrationOff.focus === 'calibration' &&
      // Off says what a new version does instead, and that the switch stays reversible (EVAL-011; EVAL-011a).
      calibrationOff.offEffect === '新版本从 AI7 初评开始时直接用原始分数；随时可打开，开关都有记录。' && calibrationOff.offset === 'waiting',
    'calibration-off-words', calibrationOff);
    const offService = await primary.evaluate(`window.ai7.inspectEvaluationCalibration().then((answer) => [answer.calibration.enabled, answer.calibration.active, answer.preferenceEntries, answer.prediction.enabled])`);
    requireJourney(JSON.stringify(offService) === JSON.stringify([false, false, 1, false]), 'calibration-off-service', offService);
    requireJourney(await toggle('calibration'), 'calibration-on-click');
    await readCalibration(primary, (page) => page.calibration === '调分记录 0 / 10 本 · 满 10 本后生效' && page.switches.calibration?.[0] === true && page.offEffect === null, 'calibration-on');
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
