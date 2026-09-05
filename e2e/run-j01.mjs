import { copyFile, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { attachProductOutput, awaitWithinDeadline, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRODUCT_RENDERER_URL = pathToFileURL(resolve(ROOT, 'dist', 'renderer', 'index.html')).href;
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const BROWSER_LAUNCH_TIMEOUT_MS = 35_000;
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const BROWSER_LAUNCH_TIMEOUT = new Error('J-01/browser-launch-timeout');
const BROWSER_CLOSE_TIMEOUT = new Error('J-01/browser-close-timeout');
const BROWSER_DISCONNECTED = new Error('J-01/browser-disconnected');
const RENDERER_CDP_FAILURE = new Error('J-01/renderer-cdp-response');
const RENDERER_CDP_TIMEOUT = new Error('J-01/renderer-cdp-timeout');
const RENDERER_SESSION_CLOSED = new Error('J-01/renderer-session-closed');
let diagnosticLocation = 'entry';
let electronExecutable;
let browserLifecycleIncomplete = false;

function at(location) {
  diagnosticLocation = location;
  if (localDebugEnabled()) recordDebugDetail('J-01', `at ${location}`);
}

function requireJourney(condition, location, detail) {
  if (condition) return;
  const error = new Error(`J-01/${location}`);
  if (detail !== undefined) error.detail = detail;
  throw error;
}

async function awaitCdpOperation(operation, deadline) {
  return awaitWithinDeadline(operation, deadline, {
    timeoutError: RENDERER_CDP_TIMEOUT,
    onDeadlineExpired: () => requireJourney(false, 'renderer-cdp-timeout'),
  });
}

function pathIsInside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

async function digestFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function createSyntheticDocx(path, variant) {
  let paragraphs;
  if (variant === 'paged-base' || variant === 'paged-reimport') {
    paragraphs = Array.from({ length: 260 }, (_, index) =>
      `有界内容块 ${String(index + 1).padStart(3, '0')} ${'边界'.repeat(1_000)}`);
    if (variant === 'paged-reimport') {
      const moved = paragraphs.splice(34, 1)[0];
      paragraphs.splice(1, 0, moved);
      const edited = paragraphs.findIndex((text) => text.startsWith('有界内容块 002'));
      paragraphs[edited] = paragraphs[edited].replace('有界内容块 002', '有界内容块 002（已编辑）');
      paragraphs.splice(paragraphs.findIndex((text) => text.startsWith('有界内容块 030')), 1);
      paragraphs.splice(2, 0, `明确新增内容块 ${'新增'.repeat(1_000)}`);
    }
  } else if (variant === 'repeated-base' || variant === 'repeated-reimport') {
    paragraphs = Array.from({ length: 260 }, () => '重复内容最坏情况。');
    if (variant === 'repeated-reimport') paragraphs.push('重复内容后的明确新增块。');
  } else if (variant === 'ambiguous-base' || variant === 'ambiguous-reimport') {
    paragraphs = ['重复结构身份内容。', '重复结构身份内容。'];
  } else {
    paragraphs = [
      '公共合成导入身份测试',
      variant === 'c'
        ? '重新导入后的明确变化内容。'
        : '相同内容和结构。',
    ];
  }
  const paragraphXml = paragraphs.map((text) =>
    `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`,
  ).join('');
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paragraphXml +
    '<w:sectPr/>' +
    '</w:body></w:document>';
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';
  const entries = {
    '[Content_Types].xml': strToU8(contentTypes),
    'word/document.xml': strToU8(documentXml),
    ...(variant === 'b' || variant === 'ambiguous-reimport'
      ? { 'docProps/app.xml': strToU8(`<Properties><Application>AI7 J-01 ${variant}</Application></Properties>`) }
      : {}),
  };
  await writeFile(path, zipSync(entries, { level: 6, mtime: new Date('2026-01-01T00:00:00.000Z') }));
}

function parseJourney() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-01', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(
    localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())),
    'debug-environment',
  );
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-01' };
  const names =
    process.platform === 'win32'
      ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
      : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) selected[name] = value;
  }
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireJourney(systemRoot !== undefined && isAbsolute(systemRoot), 'product-environment');
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else {
    selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
  return selected;
}

async function attachRendererTarget(browser) {
  const deadline = Date.now() + 30_000;
  const withBrowserConnection = (operation) =>
    settleOnBrowserDisconnect(browser, operation, {
      disconnectError: BROWSER_DISCONNECTED,
      coerceRejectionAfterDisconnect: true,
    });
  const rootSession = await awaitCdpOperation(
    withBrowserConnection(browser.newBrowserCDPSession()),
    deadline,
  );
  const sendRoot = (method, params = {}, operationDeadline = Date.now() + 30_000) =>
    awaitCdpOperation(withBrowserConnection(rootSession.send(method, params)), operationDeadline);
  let pageTarget;
  while (Date.now() < deadline) {
    const { targetInfos } = await sendRoot('Target.getTargets', {}, deadline);
    const pages = targetInfos.filter((target) => target.type === 'page');
    requireJourney(pages.length <= 1, 'renderer-target-count');
    const candidate = pages[0];
    if (candidate?.url === PRODUCT_RENDERER_URL) {
      pageTarget = pages[0];
      break;
    }
    requireJourney(
      candidate === undefined || candidate.url === '' || candidate.url === 'about:blank',
      'renderer-target-url',
    );
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  requireJourney(pageTarget, 'renderer-target-timeout');
  const { sessionId } = await sendRoot(
    'Target.attachToTarget',
    {
      targetId: pageTarget.targetId,
      flatten: false,
    },
    deadline,
  );
  let nextId = 1;
  const pending = new Map();
  rootSession.on('Target.receivedMessageFromTarget', ({ sessionId: incomingSessionId, message }) => {
    if (incomingSessionId !== sessionId) return;
    let response;
    try {
      response = JSON.parse(message);
    } catch {
      return;
    }
    if (typeof response.id !== 'number') return;
    const completion = pending.get(response.id);
    if (!completion) return;
    pending.delete(response.id);
    if (response.error) completion.reject(RENDERER_CDP_FAILURE);
    else completion.resolve(response.result);
  });
  rootSession.on('Target.detachedFromTarget', ({ sessionId: detachedSessionId }) => {
    if (detachedSessionId !== sessionId) return;
    for (const completion of pending.values()) completion.reject(RENDERER_SESSION_CLOSED);
    pending.clear();
  });
  const send = async (method, params = {}, operationDeadline = Date.now() + 30_000) => {
    const id = nextId++;
    const remaining = operationDeadline - Date.now();
    requireJourney(remaining > 0, 'renderer-carrier-timeout');
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectResponse(RENDERER_CDP_TIMEOUT);
      }, remaining);
      timeout.unref();
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolveResponse(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectResponse(error);
        },
      });
    });
    const dispatch = sendRoot('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id, method, params }),
    }, operationDeadline);
    const [, result] = await Promise.all([dispatch, withBrowserConnection(response)]);
    return result;
  };
  const evaluate = async (expression, operationDeadline) => {
    const response = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      operationDeadline,
    );
    requireJourney(!response.exceptionDetails, 'renderer-evaluate', response.exceptionDetails);
    return response.result.value;
  };
  await send('Runtime.enable', {}, deadline);
  let latestCarrierError;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(
        `location.href === ${JSON.stringify(PRODUCT_RENDERER_URL)} && typeof window.ai7 === 'object' && document.querySelector('#screen') !== null`,
        deadline,
      )) {
        at('renderer-ready');
        return { evaluate };
      }
      latestCarrierError = undefined;
    } catch (error) {
      if (
        error === BROWSER_DISCONNECTED ||
        error === RENDERER_CDP_TIMEOUT ||
        error === RENDERER_SESSION_CLOSED
      ) {
        throw error;
      }
      latestCarrierError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (latestCarrierError !== undefined) {
    throw new Error('J-01/renderer-carrier-timeout', { cause: latestCarrierError });
  }
  throw new Error('J-01/renderer-carrier-timeout');
}

async function createRendererManager(browser) {
  const rootDeadline = Date.now() + 30_000;
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
  const sendRoot = (method, params = {}, deadline = Date.now() + 30_000) =>
    awaitCdpOperation(withBrowserConnection(root.send(method, params)), deadline);
  root.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    let response;
    try {
      response = JSON.parse(message);
    } catch {
      return;
    }
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
      const carrierDeadline = Date.now() + 30_000;
      const { sessionId } = await sendRoot('Target.attachToTarget', { targetId: target.targetId, flatten: false });
      const send = async (method, params = {}, deadline = Date.now() + 30_000) => {
        if (detachedSessions.has(sessionId)) throw RENDERER_SESSION_CLOSED;
        const id = nextId++;
        const key = `${sessionId}:${id}`;
        const remaining = deadline - Date.now();
        requireJourney(remaining > 0, 'renderer-carrier-timeout');
        const response = new Promise((resolveResponse, rejectResponse) => {
          const timeout = setTimeout(() => {
            pending.delete(key);
            rejectResponse(RENDERER_CDP_TIMEOUT);
          }, remaining);
          timeout.unref();
          pending.set(key, {
            resolve: (value) => {
              clearTimeout(timeout);
              resolveResponse(value);
            },
            reject: (error) => {
              clearTimeout(timeout);
              rejectResponse(error);
            },
          });
        });
        const dispatch = sendRoot('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        }, deadline);
        const [, result] = await Promise.all([dispatch, withBrowserConnection(response)]);
        return result;
      };
      const renderer = {
        targetId: target.targetId,
        evaluate: async (expression) => {
          const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
          requireJourney(!response.exceptionDetails, 'renderer-evaluate', response.exceptionDetails);
          return response.result.value;
        },
      };
      await send('Runtime.enable', {}, carrierDeadline);
      let latestCarrierError;
      while (Date.now() < carrierDeadline) {
        try {
          const response = await send('Runtime.evaluate', {
            expression: `location.href === ${JSON.stringify(PRODUCT_RENDERER_URL)} && typeof window.ai7 === 'object' && document.querySelector('#screen') !== null`,
            awaitPromise: true,
            returnByValue: true,
          }, carrierDeadline);
          requireJourney(!response.exceptionDetails, 'renderer-evaluate', response.exceptionDetails);
          if (response.result.value === true) return renderer;
          latestCarrierError = undefined;
        } catch (error) {
          if (
            error === BROWSER_DISCONNECTED ||
            error === RENDERER_CDP_TIMEOUT ||
            error === RENDERER_SESSION_CLOSED
          ) {
            throw error;
          }
          latestCarrierError = error;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      }
      if (latestCarrierError !== undefined) {
        throw new Error('J-01/renderer-carrier-timeout', { cause: latestCarrierError });
      }
      throw new Error('J-01/renderer-carrier-timeout');
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
      const pages = (await sendRoot('Target.getTargets')).targetInfos.filter((target) => target.type === 'page');
      requireJourney(
        pages.every((target) =>
          target.url === PRODUCT_RENDERER_URL || target.url === '' || target.url === 'about:blank'),
        'renderer-target-url',
      );
      return Promise.all(pages.filter((target) => target.url === PRODUCT_RENDERER_URL).map(attach));
    },
    close: (targetId) => sendRoot('Target.closeTarget', { targetId }),
  };
}

async function waitForRendererCount(manager, count, location) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const renderers = await manager.list();
    if (renderers.length === count) return renderers;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-01/${location}`);
}

async function waitFor(renderer, expression, location) {
  const deadline = Date.now() + 30_000;
  let latestEvaluationError;
  while (Date.now() < deadline) {
    try {
      const matched = await renderer.evaluate(`Boolean(${expression})`);
      latestEvaluationError = undefined;
      if (matched) return;
    } catch (error) {
      if (
        error === BROWSER_DISCONNECTED ||
        error === RENDERER_CDP_FAILURE ||
        error === RENDERER_CDP_TIMEOUT ||
        error === RENDERER_SESSION_CLOSED
      ) {
        if (error === BROWSER_DISCONNECTED) browserLifecycleIncomplete = true;
        throw error;
      }
      latestEvaluationError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (latestEvaluationError !== undefined) {
    throw new Error(`J-01/${location}`, { cause: latestEvaluationError });
  }
  throw new Error(`J-01/${location}`);
}

async function waitForTransientControl(renderer, expression, location) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2));
  }
  throw new Error(`J-01/${location}`);
}

async function assertRenderer(renderer, expression, location) {
  requireJourney(await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`), location);
}

async function clickExactButton(renderer, label, location) {
  await assertRenderer(
    renderer,
    `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!button) return false; button.click(); return true; })()`,
    location,
  );
}

async function prepareSourceImportReview(renderer, expectation) {
  const {
    sourceSha256,
    sourceBytes,
    targetBookId = null,
    targetManuscriptState = 'empty',
    expectedReuseSourceVersionId = null,
    scenario = 'source',
  } = expectation;
  await waitFor(
    renderer,
    `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
    'source-landing',
  );
  await assertRenderer(
    renderer,
    `typeof window.ai7.prepareSourceImportReview === 'function' && typeof window.ai7.commitSourceImport === 'function'`,
    'source-renderer-api',
  );
  await clickExactButton(renderer, '导入稿件', 'source-stage');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${scenario}-target`);
  await assertRenderer(
    renderer,
    `document.querySelectorAll('input[name="import-target"]:checked').length === 0 && !document.querySelector('input[name="import-relationship"]:checked')`,
    'source-target-unselected',
  );
  await assertRenderer(
    renderer,
    targetBookId === null
      ? `(() => { const target = document.querySelector('[data-import-target-choice="new-book"]'); if (!target) return false; target.click(); return true; })()`
      : `(() => { const target = document.querySelector('[data-import-target-choice="existing-book"][data-book-id=${JSON.stringify(targetBookId)}]'); if (!target) return false; target.click(); return true; })()`,
    'source-target-select',
  );
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, 'source-relationship');
  await assertRenderer(
    renderer,
    `(() => { const source = document.querySelector('[data-import-relationship="source-only"]'); const manuscript = document.querySelector('[data-import-relationship="first-manuscript"]'); const reimport = document.querySelector('[data-import-relationship="reimport"]'); return source && !source.checked && ${targetBookId !== null && targetManuscriptState === 'populated' ? '!manuscript && reimport && !reimport.checked' : 'manuscript && !manuscript.checked && !reimport'}; })()`,
    'source-relationship-unselected',
  );
  await assertRenderer(
    renderer,
    `(() => { const source = document.querySelector('[data-import-relationship="source-only"]'); if (!source) return false; source.click(); return true; })()`,
    'source-relationship-select',
  );
  if (targetBookId === null) {
    await waitFor(renderer, `document.querySelector('[data-screen="title"] #book-title')`, 'source-new-book-title');
    await assertRenderer(
      renderer,
      `!document.querySelector('[data-fidelity-category]') && document.querySelector('#book-title')?.value.length > 0`,
      'source-new-book-no-fidelity',
    );
    await clickExactButton(renderer, '确认书名并复核', 'source-new-book-review');
  } else if (expectedReuseSourceVersionId !== null) {
    await waitFor(renderer, `document.querySelector('[data-source-version-reuse-choices]')`, 'source-reuse-required');
    await assertRenderer(
      renderer,
      `(() => { const reuse = document.querySelector('[data-reuse-source-version-id=${JSON.stringify(expectedReuseSourceVersionId)}]'); return reuse && !reuse.checked && !document.querySelector('[data-prepare-source-import-review]'); })()`,
      'source-reuse-unselected',
    );
    await assertRenderer(
      renderer,
      `(() => { const reuse = document.querySelector('[data-reuse-source-version-id=${JSON.stringify(expectedReuseSourceVersionId)}]'); if (!reuse) return false; reuse.click(); return true; })()`,
      'source-reuse-select',
    );
    await waitFor(renderer, `document.querySelector('[data-prepare-source-import-review=${JSON.stringify(targetBookId)}]')`, 'source-reuse-review-action');
    await clickExactButton(renderer, '复核来源材料导入', 'source-reuse-review');
  } else {
    await waitFor(renderer, `document.querySelector('[data-prepare-source-import-review=${JSON.stringify(targetBookId)}]')`, 'source-existing-review-action');
    await assertRenderer(
      renderer,
      `!document.querySelector('[data-source-version-reuse-choices]')`,
      'source-cross-book-no-reuse',
    );
    await clickExactButton(renderer, '复核来源材料导入', 'source-existing-review');
  }
  await waitFor(renderer, `document.querySelector('[data-screen="review"] [data-import-review-kind="source-only"]')`, 'source-review');
  await assertRenderer(
    renderer,
    `(() => { const review = document.querySelector('[data-import-review-kind="source-only"]'); const target = review?.querySelector('[data-source-review-target]'); return target?.dataset.bookId && target.dataset.stableIdentity === 'book:' + target.dataset.bookId && review.querySelector('[data-source-sha256]')?.textContent === ${JSON.stringify(sourceSha256)} && review.querySelector('[data-source-bytes]')?.textContent === ${JSON.stringify(String(sourceBytes))}; })()`,
    'source-review-target-boundary',
  );
  await assertRenderer(
    renderer,
    `(() => { const review = document.querySelector('[data-import-review-kind="source-only"]'); const contentDigest = review?.querySelector('[data-content-digest]')?.textContent ?? ''; const structureDigest = review?.querySelector('[data-structure-digest]')?.textContent ?? ''; const acquiredAt = review?.querySelector('[data-acquired-at]')?.dataset.acquiredAt ?? ''; return /^[0-9a-f]{64}$/.test(contentDigest) && /^[0-9a-f]{64}$/.test(structureDigest) && acquiredAt.length >= 20 && acquiredAt.includes('T') && acquiredAt.endsWith('Z'); })()`,
    'source-review-digests-acquisition',
  );
  await assertRenderer(
    renderer,
    `(() => { const review = document.querySelector('[data-import-review-kind="source-only"]'); const effects = Array.from(review?.querySelectorAll('.review-section') ?? []).find((section) => section.querySelector('h3')?.textContent === '明确不会发生')?.textContent ?? ''; return review?.textContent.includes('来源导入记录') && effects.includes('不创建稿件') && effects.includes('不创建稿件修订版') && effects.includes('不创建工作流实例') && effects.includes('不创建运行来源范围') && effects.includes('不创建事实状态或事实核查结论') && effects.includes('不创建书系或书系成员关系') && effects.includes('不创建编辑学习准入决定') && effects.includes('不授予或执行模型提供方传输') && effects.includes('不创建发稿版本、公开发布许可或公开发布事实') && effects.includes('不导出、不发送、不交付、不发布'); })()`,
    'source-review-effects',
  );
  await assertRenderer(
    renderer,
    `(() => { const review = document.querySelector('[data-import-review-kind="source-only"]'); return !review?.querySelector('[data-fidelity-category]') && !review?.textContent.includes('固定工作流程方案') && !review?.textContent.includes('原生 Profile'); })()`,
    'source-review-no-manuscript-objects',
  );
  if (targetBookId !== null) {
    await assertRenderer(
      renderer,
      `document.querySelector('[data-source-review-target]')?.dataset.bookId === ${JSON.stringify(targetBookId)}`,
      'source-review-exact-existing-target',
    );
  }
  return renderer.evaluate(`(() => { const target = document.querySelector('[data-source-review-target]'); return { bookId: target?.dataset.bookId, stableIdentity: target?.dataset.stableIdentity, disposition: document.querySelector('[data-source-version-disposition]')?.dataset.sourceVersionDisposition }; })()`);
}

async function commitPreparedSourceImport(renderer, expectation = {}) {
  const { expectInterruption = false, holdCompletionPaint = false } = expectation;
  if (holdCompletionPaint) {
    await assertRenderer(
      renderer,
      `(() => { let frameId = 0; globalThis.__ai7HeldCompletionFrames = []; globalThis.requestAnimationFrame = (callback) => { globalThis.__ai7HeldCompletionFrames.push(callback); frameId += 1; return frameId; }; return true; })()`,
      'source-completion-paint-held',
    );
  }
  await assertRenderer(
    renderer,
    `(() => { const commit = document.querySelector('[data-commit-source-import]'); if (!commit) return false; commit.click(); return true; })()`,
    'source-commit',
  );
  if (expectInterruption) {
    await waitFor(renderer, `document.documentElement.dataset.ai7ServiceState === 'interrupted'`, 'source-commit-interrupted');
    await assertRenderer(renderer, `!document.querySelector('[data-screen="imported"]')`, 'source-no-optimistic-completion');
    return null;
  }
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'source-imported');
  if (holdCompletionPaint) {
    await waitFor(renderer, `globalThis.__ai7HeldCompletionFrames?.length === 1`, 'source-completion-awaits-paint');
    return null;
  }
  await waitFor(
    renderer,
    `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`,
    'source-completion-acknowledged',
  );
  await assertRenderer(
    renderer,
    `(() => { const screen = document.querySelector('[data-screen="imported"]'); const source = screen?.querySelector('[data-view-source-version-id]'); const record = screen?.querySelector('[data-view-source-import-record-id]'); const actions = source?.closest('.button-row'); const labels = Array.from(actions?.querySelectorAll(':scope > button') ?? [], (button) => button.textContent); return screen?.textContent.includes('来源材料已导入') && source && !source.disabled && record && !record.disabled && actions === record.closest('.button-row') && labels[0] === '查看来源材料' && labels[1] === '查看来源导入记录'; })()`,
    'source-completion-actions',
  );
  const identities = await renderer.evaluate(`(() => {
    const overview = document.querySelector('[data-screen="imported"] .book-overview');
    const source = document.querySelector('[data-view-source-version-id]');
    const record = document.querySelector('[data-view-source-import-record-id]');
    return { bookId: overview?.dataset.bookId, commitId: overview?.dataset.importCommitId, sourceVersionId: source?.dataset.viewSourceVersionId, sourceImportRecordId: record?.dataset.viewSourceImportRecordId };
  })()`);
  requireJourney(
    /^[0-9a-f-]{36}$/i.test(identities?.bookId ?? '') &&
      /^[0-9a-f-]{36}$/i.test(identities?.commitId ?? '') &&
      /^[0-9a-f-]{36}$/i.test(identities?.sourceVersionId ?? '') &&
      /^[0-9a-f-]{36}$/i.test(identities?.sourceImportRecordId ?? ''),
    'source-completion-identities',
  );
  await assertRenderer(
    renderer,
    `(() => { const button = document.querySelector('[data-view-source-version-id]'); if (!button) return false; button.click(); return true; })()`,
    'source-view-source',
  );
  await assertRenderer(
    renderer,
    `document.querySelector('.record-detail[data-record-kind="source"]')?.textContent.includes(${JSON.stringify(identities.sourceVersionId)})`,
    'source-version-inspection',
  );
  await assertRenderer(
    renderer,
    `(() => { const button = document.querySelector('[data-view-source-import-record-id]'); if (!button) return false; button.click(); return true; })()`,
    'source-view-import-record',
  );
  const record = await renderer.evaluate(`(() => { const detail = document.querySelector('.record-detail[data-record-kind="source-import-record"]'); const values = {}; for (const label of detail?.querySelectorAll('dt') ?? []) values[label.textContent] = label.nextElementSibling?.textContent; return values; })()`);
  requireJourney(
    record?.['来源导入记录 ID'] === identities.sourceImportRecordId &&
      record?.['原子提交 ID'] === identities.commitId &&
      record?.['所属图书 ID'] === identities.bookId &&
      record?.['来源版本 ID'] === identities.sourceVersionId &&
      /^[0-9a-f-]{36}$/i.test(record?.['来源记录 ID'] ?? '') &&
      record?.['保留字节数'] === String(SAMPLE1_BYTES) &&
      record?.['保留文件 SHA-256'] === SAMPLE1_SHA256 &&
      /^[0-9a-f]{64}$/.test(record?.['保留内容摘要'] ?? '') &&
      /^[0-9a-f]{64}$/.test(record?.['保留结构摘要'] ?? '') &&
      /^[0-9a-f]{64}$/.test(record?.['记录摘要'] ?? ''),
    'source-import-record-inspection',
  );
  return { ...identities, provenanceId: record['来源记录 ID'] };
}

async function prepareManuscriptReimportReview(renderer, expectation) {
  const {
    targetBookId,
    lineageStatus,
    lineageSourceVersionId = null,
    expectedReuseSourceVersionId = null,
    changed,
    degraded = false,
    dirtyCheckpoint = false,
    cancelPreparationOnce = false,
    start = 'landing',
    scenario,
  } = expectation;
  requireJourney(start === 'landing' || start === 'target', `${scenario}-start`);
  at('reimport-pre-review');
  if (start === 'landing') {
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${scenario}-landing`);
    await clickExactButton(renderer, '导入稿件', `${scenario}-stage`);
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${scenario}-target`);
  } else {
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${scenario}-target`);
  }
  await assertRenderer(
    renderer,
    `(() => { const target = document.querySelector('[data-import-target-choice="existing-book"][data-book-id=${JSON.stringify(targetBookId)}]'); if (!target) return false; target.click(); return true; })()`,
    `${scenario}-target-select`,
  );
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, `${scenario}-relationship`);
  await assertRenderer(
    renderer,
    `(() => { const source = document.querySelector('[data-import-relationship="source-only"]'); const reimport = document.querySelector('[data-import-relationship="reimport"]'); return source && !source.checked && reimport && !reimport.checked && !document.querySelector('[data-import-relationship="first-manuscript"]'); })()`,
    `${scenario}-relationship-unselected`,
  );
  await assertRenderer(
    renderer,
    `(() => { const reimport = document.querySelector('[data-import-relationship="reimport"]'); if (!reimport) return false; reimport.click(); return true; })()`,
    `${scenario}-relationship-select`,
  );
  await waitFor(renderer, `document.querySelector('[data-reimport-lineage-choices]') && document.querySelector('[data-reimport-source-version-choices]')`, `${scenario}-choices`);
  await assertRenderer(
    renderer,
    `!document.querySelector('input[name="reimport-lineage"]:checked') && !document.querySelector('input[name="reimport-source-version"]:checked') && !document.querySelector('[data-prepare-manuscript-reimport]')`,
    `${scenario}-choices-unselected`,
  );
  const lineageSelector = lineageStatus === 'verified'
    ? `[data-reimport-lineage="verified-source-version"][data-source-version-id=${JSON.stringify(lineageSourceVersionId)}]`
    : '[data-reimport-lineage="unconfirmed"]';
  await assertRenderer(
    renderer,
    `(() => { const lineage = document.querySelector(${JSON.stringify(lineageSelector)}); if (!lineage) return false; lineage.click(); return true; })()`,
    `${scenario}-lineage-select`,
  );
  const sourceSelector = expectedReuseSourceVersionId === null
    ? '[data-create-source-version="true"]'
    : `[data-reuse-source-version-id=${JSON.stringify(expectedReuseSourceVersionId)}]`;
  await waitFor(renderer, `document.querySelector(${JSON.stringify(sourceSelector)})`, `${scenario}-source-choice`);
  await assertRenderer(
    renderer,
    `(() => { const source = document.querySelector(${JSON.stringify(sourceSelector)}); if (!source || source.checked) return false; source.click(); return true; })()`,
    `${scenario}-source-select`,
  );
  const stagedSourceIdentity = await renderer.evaluate(`(() => ({
    sha256: document.querySelector('[data-source-sha256]')?.textContent,
    bytes: document.querySelector('[data-source-bytes]')?.textContent,
  }))()`);
  await waitFor(renderer, `document.querySelector('[data-prepare-manuscript-reimport=${JSON.stringify(targetBookId)}]')`, `${scenario}-prepare-action`);
  await clickExactButton(renderer, '准备稿件重新导入比较', `${scenario}-prepare`);
  if (cancelPreparationOnce) {
    await waitForTransientControl(
      renderer,
      `(() => { const cancel = document.querySelector('[data-cancel-reimport-preparation]:not([hidden])'); const completed = Number(cancel?.dataset.jobProgressCompleted); const total = Number(cancel?.dataset.jobProgressTotal); return Boolean(cancel) && completed > 0 && completed < total; })()`,
      `${scenario}-prepare-progress`,
    );
    const progress = await renderer.evaluate(`(() => { const cancel = document.querySelector('[data-cancel-reimport-preparation]:not([hidden])'); return { completed: Number(cancel?.dataset.jobProgressCompleted), total: Number(cancel?.dataset.jobProgressTotal) }; })()`);
    requireJourney(progress?.completed > 0 && progress.completed < progress.total, `${scenario}-prepare-progress-running`);
    await waitForTransientControl(
      renderer,
      `(() => { const cancel = document.querySelector('[data-cancel-reimport-preparation]:not([hidden])'); const completed = Number(cancel?.dataset.jobProgressCompleted); const total = Number(cancel?.dataset.jobProgressTotal); return completed >= ${progress.completed} && completed < total; })()`,
      `${scenario}-prepare-progress-monotonic`,
    );
    await assertRenderer(
      renderer,
      `(() => { const cancel = document.querySelector('[data-cancel-reimport-preparation]:not([hidden]):not(:disabled)'); if (!cancel) return false; cancel.click(); return true; })()`,
      `${scenario}-prepare-cancel`,
    );
    await waitFor(
      renderer,
      `document.querySelector('#persistence-status')?.textContent.includes('准备已取消') && !document.querySelector('[data-import-review-kind="reimport"]') && !document.querySelector('[data-prepare-manuscript-reimport]')?.disabled`,
      `${scenario}-prepare-cancelled`,
    );
    await assertRenderer(
      renderer,
      `document.querySelector(${JSON.stringify(lineageSelector)})?.checked && document.querySelector(${JSON.stringify(sourceSelector)})?.checked`,
      `${scenario}-prepare-cancel-preserves-selection`,
    );
    await clickExactButton(renderer, '准备稿件重新导入比较', `${scenario}-prepare-retry`);
  }
  await waitFor(renderer, `document.querySelector('[data-screen="review"] [data-import-review-kind="reimport"]') || document.querySelector('#persistence-status')?.dataset.tone === 'error'`, `${scenario}-review`);
  const preparationFailure = await renderer.evaluate(`document.querySelector('#persistence-status')?.dataset.tone === 'error' ? document.querySelector('#persistence-status')?.textContent : null`);
  requireJourney(preparationFailure === null, `${scenario}-review-valid`);
  await waitFor(renderer, `document.querySelector('[data-reimport-mappings="ready"]')`, `${scenario}-mappings`);
  await assertRenderer(
    renderer,
    `(() => { const review = document.querySelector('[data-import-review-kind="reimport"]'); const text = review?.textContent ?? ''; const changedMappings = review?.querySelectorAll('[data-reimport-mapping-state="unresolved"]').length ?? 0; const values = Object.fromEntries(Array.from(review?.querySelectorAll('dt') ?? [], (label) => [label.textContent, label.nextElementSibling?.textContent])); const exactSource = review?.querySelector('[data-reimport-source-sha256]'); const lineageExact = ${lineageStatus === 'verified' ? `values['来源关系版本 ID'] === ${JSON.stringify(lineageSourceVersionId)} && /^[0-9a-f-]{36}$/i.test(values['来源关系修订版 ID'] ?? '')` : `values['来源关系版本 ID'] === undefined && values['来源关系修订版 ID'] === undefined`}; return review?.dataset.reimportLineageStatus === ${JSON.stringify(lineageStatus)} && review.dataset.reimportComparisonKind === ${JSON.stringify(lineageStatus === 'verified' ? 'three-way' : 'two-way')} && /^[0-9a-f-]{36}$/i.test(values['当前固定点修订版 ID'] ?? '') && /^[0-9a-f]{64}$/.test(values['当前固定点修订版摘要'] ?? '') && lineageExact && exactSource?.dataset.reimportSourceSha256 === ${JSON.stringify(stagedSourceIdentity.sha256)} && exactSource.dataset.reimportSourceBytes === ${JSON.stringify(stagedSourceIdentity.bytes)} && text.includes(${JSON.stringify(lineageStatus === 'verified' ? '来源关系已确认' : '来源关系未确认')}) && text.includes(${JSON.stringify(dirtyCheckpoint ? '已为未固定修订日志创建专用安全固定点' : '当前稿件已经位于持久固定点')}) && text.includes('不执行模糊匹配或通用合并') && text.includes('不创建第二份主稿件') && text.includes('工作流程实例') && text.includes('不授予或执行模型提供方传输') && text.includes('不导出、不发送、不交付、不发布') && ${changed ? 'changedMappings > 0 && review.dataset.reimportCommitReady === "false"' : `changedMappings === 0 && review.dataset.reimportCommitReady === "${degraded ? 'false' : 'true'}" && text.includes("未发现稿件变化")`} && ${degraded ? "Boolean(review.querySelector('[data-accept-reimport-degradation]')) && text.includes('必须明确接受完整降级集合')" : "!review.querySelector('[data-accept-reimport-degradation]')"}; })()`,
    `${scenario}-review-contract`,
  );
  at('review');
}

async function manuscriptReimportReviewProof(renderer, scenario) {
  await waitFor(renderer, `document.querySelector('[data-reimport-mappings="ready"]')`, `${scenario}-proof-mappings`);
  const proof = await renderer.evaluate(`(() => {
    const review = document.querySelector('[data-import-review-kind="reimport"]');
    const values = Object.fromEntries(Array.from(review?.querySelectorAll('dt') ?? [], (label) => [label.textContent, label.nextElementSibling?.textContent]));
    return {
      draftId: review?.dataset.reimportDraftId,
      draftVersion: review?.dataset.reimportDraftVersion,
      reviewDigest: review?.dataset.reimportReviewDigest,
      commitAttemptId: review?.dataset.reimportCommitAttemptId,
      lineageStatus: review?.dataset.reimportLineageStatus,
      comparisonKind: review?.dataset.reimportComparisonKind,
      commitReady: review?.dataset.reimportCommitReady,
      comparisonDigest: review?.querySelector('[data-comparison-digest]')?.dataset.comparisonDigest,
      checkpointRevisionId: values['当前固定点修订版 ID'],
      checkpointRevisionDigest: values['当前固定点修订版摘要'],
      lineageSourceVersionId: values['来源关系版本 ID'],
      lineageRevisionId: values['来源关系修订版 ID'],
      sourceSha256: review?.querySelector('[data-reimport-source-sha256]')?.dataset.reimportSourceSha256,
      sourceBytes: review?.querySelector('[data-reimport-source-sha256]')?.dataset.reimportSourceBytes,
      mappingIds: Array.from(review?.querySelectorAll('[data-reimport-mapping-id]') ?? [], (row) => row.dataset.reimportMappingId),
    };
  })()`);
  requireJourney(
    /^[0-9a-f-]{36}$/i.test(proof?.draftId ?? '') && /^\d+$/.test(proof?.draftVersion ?? '') &&
      /^[0-9a-f]{64}$/.test(proof?.reviewDigest ?? '') &&
      (proof?.commitAttemptId === '' || /^[0-9a-f-]{36}$/i.test(proof?.commitAttemptId ?? '')) &&
      /^(verified|unconfirmed)$/.test(proof?.lineageStatus ?? '') &&
      /^(three-way|two-way)$/.test(proof?.comparisonKind ?? '') &&
      /^[0-9a-f]{64}$/.test(proof?.comparisonDigest ?? '') &&
      /^[0-9a-f-]{36}$/i.test(proof?.checkpointRevisionId ?? '') &&
      /^[0-9a-f]{64}$/.test(proof?.checkpointRevisionDigest ?? '') &&
      /^[0-9a-f]{64}$/.test(proof?.sourceSha256 ?? '') &&
      /^\d+$/.test(proof?.sourceBytes ?? '') &&
      Array.isArray(proof?.mappingIds) && proof.mappingIds.length > 0 && proof.mappingIds.length <= 4,
    `${scenario}-proof-valid`,
  );
  return proof;
}

async function assertBoundedHistoryGraph(renderer, expectedRevisionCount, expectedRecordCount, scenario) {
  const page = async () => renderer.evaluate(`(() => ({
    items: Array.from(document.querySelectorAll('.book-overview button[data-record-kind="revision"], .book-overview button[data-record-kind="source-import-record"], .book-overview button[data-record-kind="manuscript-reimport-record"]'), (button) => ({
      id: button.dataset.recordId,
      kind: button.dataset.recordKind,
    })),
    older: Boolean(document.querySelector('.book-overview [data-book-history-previous]')),
    newer: Boolean(document.querySelector('.book-overview [data-book-history-next]')),
  }))()`);
  const latest = await page();
  requireJourney(Array.isArray(latest?.items) && latest.items.length > 0 && latest.items.length <= 8,
    `${scenario}-history-latest-bounded`);
  const seen = new Map();
  let current = latest;
  while (true) {
    for (const item of current.items) {
      requireJourney(typeof item.id === 'string' && !seen.has(item.id), `${scenario}-history-no-duplicate`);
      seen.set(item.id, item.kind);
    }
    if (!current.older) break;
    const priorIds = current.items.map((item) => item.id);
    await assertRenderer(renderer, `(() => { const older = document.querySelector('.book-overview [data-book-history-previous]:not(:disabled)'); if (!older) return false; older.click(); return true; })()`, `${scenario}-history-older`);
    await waitFor(renderer, `JSON.stringify(Array.from(document.querySelectorAll('.book-overview button[data-record-kind="revision"], .book-overview button[data-record-kind="source-import-record"], .book-overview button[data-record-kind="manuscript-reimport-record"]'), (button) => button.dataset.recordId)) !== ${JSON.stringify(JSON.stringify(priorIds))}`, `${scenario}-history-older-ready`);
    current = await page();
    requireJourney(current.items.length > 0 && current.items.length <= 8, `${scenario}-history-page-bounded`);
  }
  requireJourney(
    Array.from(seen.values()).filter((kind) => kind === 'revision').length === expectedRevisionCount &&
      Array.from(seen.values()).filter((kind) => kind === 'manuscript-reimport-record').length === expectedRecordCount,
    `${scenario}-history-exact-graph-counts`,
  );
  while (current.newer) {
    const priorIds = current.items.map((item) => item.id);
    await assertRenderer(renderer, `(() => { const newer = document.querySelector('.book-overview [data-book-history-next]:not(:disabled)'); if (!newer) return false; newer.click(); return true; })()`, `${scenario}-history-newer`);
    await waitFor(renderer, `JSON.stringify(Array.from(document.querySelectorAll('.book-overview button[data-record-kind="revision"], .book-overview button[data-record-kind="source-import-record"], .book-overview button[data-record-kind="manuscript-reimport-record"]'), (button) => button.dataset.recordId)) !== ${JSON.stringify(JSON.stringify(priorIds))}`, `${scenario}-history-newer-ready`);
    current = await page();
  }
  requireJourney(JSON.stringify(current.items.map((item) => item.id)) === JSON.stringify(latest.items.map((item) => item.id)),
    `${scenario}-history-roundtrip-exact-latest`);
}

async function assertCommittedManuscriptReimport(renderer, expectation) {
  const { changed, lineageStatus, degraded = false, expectedRevisionCount, expectedRecordCount, scenario } = expectation;
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, `${scenario}-imported`);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`, `${scenario}-acknowledged`);
  await assertRenderer(
    renderer,
    `(() => { const screen = document.querySelector('[data-screen="imported"]'); const history = screen?.querySelectorAll('[data-record-kind="revision"], [data-record-kind="source-import-record"], [data-record-kind="manuscript-reimport-record"]') ?? []; return screen?.textContent.includes(${JSON.stringify(changed ? '稿件已重新导入' : '未发现稿件变化')}) && history.length > 0 && history.length <= 8 && Boolean(screen.querySelector('[data-view-reimport-record-id]')); })()`,
    `${scenario}-result-counts`,
  );
  const identities = await renderer.evaluate(`(() => { const overview = document.querySelector('[data-screen="imported"] .book-overview'); const direct = document.querySelector('[data-view-reimport-record-id]'); return { bookId: overview?.dataset.bookId, commitId: overview?.dataset.importCommitId, reimportRecordId: direct?.dataset.viewReimportRecordId }; })()`);
  requireJourney(
    /^[0-9a-f-]{36}$/i.test(identities?.bookId ?? '') && /^[0-9a-f-]{36}$/i.test(identities?.commitId ?? '') &&
      /^[0-9a-f-]{36}$/i.test(identities?.reimportRecordId ?? ''),
    `${scenario}-identities`,
  );
  const route = await renderer.evaluate(`window.ai7.getBookWorkbenchRoute()`);
  requireJourney(
    route?.kind === 'book' && route.bookId === identities.bookId,
    `${scenario}-exact-book-route-owned`,
  );
  await assertRenderer(
    renderer,
    `(() => { const direct = document.querySelector('[data-view-reimport-record-id]'); if (!direct || direct.disabled) return false; direct.click(); const detail = document.querySelector('.record-detail[data-record-kind="manuscript-reimport-record"]'); const values = Object.fromEntries(Array.from(detail?.querySelectorAll('dt') ?? [], (label) => [label.textContent, label.nextElementSibling?.textContent])); const revisionIdentityValid = ${changed ? "/^[0-9a-f-]{36}$/i.test(values['结果修订版 ID'] ?? '')" : "values['结果修订版 ID'] === '—'"}; const fidelityItems = detail?.querySelectorAll('details.degradation-disclosure:first-of-type li').length ?? 0; const degradationValid = ${degraded ? "/^[0-9a-f-]{36}$/i.test(values['导入降级决定 ID'] ?? '') && values['保真结果']?.includes('含已接受的降级')" : "values['导入降级决定 ID'] === '—' && values['保真结果']?.includes('完整保留')"}; return values['稿件重新导入记录 ID'] === ${JSON.stringify(identities.reimportRecordId)} && values['原子提交 ID'] === ${JSON.stringify(identities.commitId)} && values['来源关系'] === ${JSON.stringify(lineageStatus === 'verified' ? '来源关系已确认' : '来源关系未确认')} && values['比较方式'] === ${JSON.stringify(lineageStatus === 'verified' ? '三方比较' : '两方比较')} && values['结果'] === ${JSON.stringify(changed ? '稿件已重新导入' : '未发现稿件变化')} && revisionIdentityValid && fidelityItems === 8 && degradationValid && /^[0-9a-f]{64}$/.test(values['比较摘要'] ?? '') && /^[0-9a-f]{64}$/.test(values['解决摘要'] ?? '') && /^[0-9a-f]{64}$/.test(values['记录摘要'] ?? ''); })()`,
    `${scenario}-direct-record-inspection`,
  );
  const recordIdentity = await renderer.evaluate(`(() => { const values = Object.fromEntries(Array.from(document.querySelectorAll('.record-detail[data-record-kind="manuscript-reimport-record"] dt'), (label) => [label.textContent, label.nextElementSibling?.textContent])); return { sourceVersionId: values['来源版本 ID'], resultingRevisionId: values['结果修订版 ID'] }; })()`);
  requireJourney(/^[0-9a-f-]{36}$/i.test(recordIdentity?.sourceVersionId ?? ''), `${scenario}-source-version`);
  await assertBoundedHistoryGraph(renderer, expectedRevisionCount, expectedRecordCount, scenario);
  return { ...identities, ...recordIdentity };
}

async function resolveAndCommitManuscriptReimport(renderer, expectation) {
  const { changed, scenario, expectInterruption = false, cancelCommitOnce = false } = expectation;
  while (true) {
    await waitFor(
      renderer,
      `document.querySelector('[data-reimport-mappings="failed"]') || (document.querySelector('[data-reimport-mappings="ready"]') && (document.querySelector('[data-accept-reimport-degradation]:not(:disabled)') || document.querySelector('[data-resolve-reimport-mapping]:not(:disabled)') || document.querySelector('[data-reimport-next-page]:not(:disabled)') || document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportCommitReady === 'true'))`,
      `${scenario}-mapping-page`,
    );
    const mappingFailure = await renderer.evaluate(`document.querySelector('[data-reimport-mappings="failed"]')?.textContent ?? null`);
    requireJourney(mappingFailure === null, `${scenario}-mapping-page-valid`);
    const degradationRequired = await renderer.evaluate(`Boolean(document.querySelector('[data-accept-reimport-degradation]:not(:disabled)'))`);
    if (degradationRequired) {
      const acceptingVersion = await renderer.evaluate(`document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion`);
      await clickExactButton(renderer, '明确接受完整降级集合', `${scenario}-accept-degradation`);
      await waitFor(
        renderer,
        `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion !== ${JSON.stringify(acceptingVersion)} || document.querySelector('#persistence-status')?.dataset.tone === 'error'`,
        `${scenario}-degradation-persisted`,
      );
      continue;
    }
    const unresolved = await renderer.evaluate(`document.querySelectorAll('[data-resolve-reimport-mapping]').length`);
    if (unresolved === 0) {
      const nextPage = await renderer.evaluate(`document.querySelector('[data-reimport-next-page]')?.dataset.reimportNextPage ?? null`);
      if (nextPage === null) break;
      const firstMapping = await renderer.evaluate(`document.querySelector('[data-reimport-mapping-id]')?.dataset.reimportMappingId ?? null`);
      await assertRenderer(renderer, `(() => { const next = document.querySelector('[data-reimport-next-page]:not(:disabled)'); if (!next) return false; next.click(); return true; })()`, `${scenario}-next-mapping-page`);
      await waitFor(renderer, `document.querySelector('[data-reimport-mappings="ready"]') && document.querySelector('[data-reimport-mapping-id]')?.dataset.reimportMappingId !== ${JSON.stringify(firstMapping)}`, `${scenario}-next-mapping-page-ready`);
      continue;
    }
    const resolvingVersion = await renderer.evaluate(`document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion`);
    await assertRenderer(
      renderer,
      `(() => { const resolve = document.querySelector('[data-resolve-reimport-mapping]:not(:disabled)'); if (!resolve) return false; resolve.click(); return true; })()`,
      `${scenario}-resolve-mapping`,
    );
    await waitFor(
      renderer,
      `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion !== ${JSON.stringify(resolvingVersion)} || document.querySelector('#persistence-status')?.dataset.tone === 'error'`,
      `${scenario}-resolution-persisted`,
    );
    const resolutionFailure = await renderer.evaluate(`document.querySelector('#persistence-status')?.dataset.tone === 'error' ? document.querySelector('#persistence-status')?.textContent : null`);
    requireJourney(resolutionFailure === null, `${scenario}-resolution-valid`);
  }
  await assertRenderer(
    renderer,
    `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportCommitReady === 'true'`,
    `${scenario}-commit-ready`,
  );
  const commitProof = await manuscriptReimportReviewProof(renderer, `${scenario}-commit-input`);
  const beforeCommitCancellationProof = cancelCommitOnce
    ? await manuscriptReimportReviewProof(renderer, `${scenario}-commit-cancel-before`)
    : null;
  await clickExactButton(renderer, changed ? '提交稿件重新导入' : '记录未发现稿件变化', `${scenario}-commit`);
  if (cancelCommitOnce) {
    await waitForTransientControl(
      renderer,
      `(() => { const cancel = document.querySelector('[data-cancel-reimport-commit]:not([hidden])'); const completed = Number(cancel?.dataset.jobProgressCompleted); const total = Number(cancel?.dataset.jobProgressTotal); return Boolean(cancel) && completed > 0 && completed < total; })()`,
      `${scenario}-commit-progress-running`,
    );
    const progress = await renderer.evaluate(`(() => { const cancel = document.querySelector('[data-cancel-reimport-commit]:not([hidden])'); return { completed: Number(cancel?.dataset.jobProgressCompleted), total: Number(cancel?.dataset.jobProgressTotal) }; })()`);
    requireJourney(progress?.completed > 0 && progress.completed < progress.total,
      `${scenario}-commit-progress-valid`);
    await assertRenderer(
      renderer,
      `(() => { const cancel = document.querySelector('[data-cancel-reimport-commit]:not(:disabled)'); if (!cancel) return false; cancel.click(); return true; })()`,
      `${scenario}-commit-cancel`,
    );
    await waitFor(
      renderer,
      `document.querySelector('#persistence-status')?.textContent.includes('提交已取消') && !document.querySelector('[data-cancel-reimport-commit]:not([hidden])') && document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportCommitReady === 'true'`,
      `${scenario}-commit-cancelled`,
    );
    const afterCommitCancellationProof = await manuscriptReimportReviewProof(renderer, `${scenario}-commit-cancel-after`);
    requireJourney(JSON.stringify(afterCommitCancellationProof) === JSON.stringify(beforeCommitCancellationProof),
      `${scenario}-commit-cancel-preserves-review`);
    await clickExactButton(renderer, changed ? '提交稿件重新导入' : '记录未发现稿件变化', `${scenario}-commit-retry`);
  }
  if (expectInterruption) {
    await waitFor(renderer, `document.documentElement.dataset.ai7ServiceState === 'interrupted'`, `${scenario}-interrupted`);
    await assertRenderer(renderer, `!document.querySelector('[data-screen="imported"]')`, `${scenario}-no-optimistic-success`);
    return null;
  }
  const committed = await assertCommittedManuscriptReimport(renderer, expectation);
  return {
    ...committed,
    replayInput: {
      draftId: commitProof.draftId,
      expectedDraftVersion: Number(commitProof.draftVersion),
      reviewDigest: commitProof.reviewDigest,
      commitAttemptId: committed.commitId,
    },
  };
}

async function createDurableJournalEdit(renderer) {
  await clickExactButton(renderer, '打开稿件', 'reimport-dirty-open-editor');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'reimport-dirty-editor');
  await assertRenderer(
    renderer,
    `(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); const block = editor?.querySelector('[data-block-id]'); if (!(block instanceof HTMLElement)) return false; block.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText', false, '，重新导入前本地编辑'); return block.textContent?.endsWith('，重新导入前本地编辑'); })()`,
    'reimport-dirty-edit',
  );
  await waitFor(renderer, `Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '保存当前编辑' && !button.disabled)`, 'reimport-dirty-save-ready');
  await clickExactButton(renderer, '保存当前编辑', 'reimport-dirty-save');
  await waitFor(renderer, `document.querySelector('#persistence-status')?.textContent.includes('已写入修订日志')`, 'reimport-dirty-durable');
  await assertRenderer(renderer, `document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 1')`, 'reimport-dirty-sequence');
}

async function importInitialManuscriptForReimport(renderer, sourceSha256, sourceBytes, scenario) {
  await runJourney(renderer, { sourceSha256, sourceBytes, degraded: false });
  const bookId = await renderer.evaluate(`document.querySelector('[data-screen="imported"] .book-overview')?.dataset.bookId`);
  const lineageSourceVersionId = await renderer.evaluate(`document.querySelector('[data-screen="imported"] [data-record-kind="source"]')?.dataset.recordId`);
  requireJourney(
    /^[0-9a-f-]{36}$/i.test(bookId ?? '') && /^[0-9a-f-]{36}$/i.test(lineageSourceVersionId ?? ''),
    `${scenario}-initial-identities`,
  );
  return { bookId, lineageSourceVersionId };
}

async function collectEditorBlockIdentities(renderer, scenario, openEditor = true) {
  if (openEditor) {
    await clickExactButton(renderer, '打开稿件', `${scenario}-open-editor`);
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, `${scenario}-editor`);
  } else {
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, `${scenario}-editor-already-open`);
  }
  const identities = {};
  for (;;) {
    const page = await renderer.evaluate(`Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] [data-block-id]'), (block) => ({ id: block.dataset.blockId, text: block.textContent }))`);
    requireJourney(Array.isArray(page) && page.length > 0 && page.length <= 32, `${scenario}-bounded-editor-page`);
    for (const block of page) {
      const label = /^(?:有界内容块 \d{3}(?:（已编辑）)?|明确新增内容块)/.exec(block.text)?.[0] ?? block.text;
      identities[label] = block.id;
    }
    const nextDisabled = await renderer.evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '向后浏览')?.disabled !== false`);
    if (nextDisabled) break;
    const firstBlockId = page[0].id;
    await clickExactButton(renderer, '向后浏览', `${scenario}-next-editor-page`);
    await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.dataset.blockId !== ${JSON.stringify(firstBlockId)}`, `${scenario}-next-editor-page-ready`);
    await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  }
  return identities;
}

async function collectEditorBlockIdentitySequence(renderer, scenario) {
  await clickExactButton(renderer, '打开稿件', `${scenario}-open-editor`);
  await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]')`, `${scenario}-editor`);
  const identities = [];
  for (;;) {
    const page = await renderer.evaluate(`Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] [data-block-id]'), (block) => ({ id: block.dataset.blockId, text: block.textContent }))`);
    requireJourney(Array.isArray(page) && page.length > 0 && page.length <= 32, `${scenario}-bounded-editor-page`);
    identities.push(...page);
    const nextDisabled = await renderer.evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '向后浏览')?.disabled !== false`);
    if (nextDisabled) break;
    const firstBlockId = page[0].id;
    await clickExactButton(renderer, '向后浏览', `${scenario}-next-editor-page`);
    await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.dataset.blockId !== ${JSON.stringify(firstBlockId)}`, `${scenario}-next-editor-page-ready`);
    await renderer.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  }
  return identities;
}

async function resolveAmbiguousIdentitiesAsNoChange(renderer, currentIdentities, scenario) {
  requireJourney(
    currentIdentities.length === 2 &&
      currentIdentities.every(({ id, text }) => /^blk_[0-9a-f]{24}$/.test(id) && text === '重复结构身份内容。') &&
      currentIdentities[0].id !== currentIdentities[1].id,
    `${scenario}-initial-distinct-identities`,
  );
  for (const current of currentIdentities) {
    const draftVersion = await renderer.evaluate(`document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion`);
    await assertRenderer(
      renderer,
      `(() => { const row = Array.from(document.querySelectorAll('[data-reimport-mapping-id]')).find((candidate) => candidate.dataset.reimportChangeKind === 'insert' && candidate.dataset.reimportMappingState === 'unresolved' && candidate.dataset.stagedText === '重复结构身份内容。'); const choose = Array.from(row?.querySelectorAll('button') ?? []).find((button) => button.textContent === '选择要保留的当前结构身份'); if (!choose) return false; choose.click(); return true; })()`,
      `${scenario}-open-candidate-${current.id}`,
    );
    await waitFor(renderer, `Boolean(document.querySelector('button[data-current-block-id=${JSON.stringify(current.id)}]'))`, `${scenario}-candidate-${current.id}`);
    await assertRenderer(
      renderer,
      `(() => { const preserve = document.querySelector('button[data-current-block-id=${JSON.stringify(current.id)}]'); if (!preserve) return false; preserve.click(); return true; })()`,
      `${scenario}-preserve-${current.id}`,
    );
    await waitFor(
      renderer,
      `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion !== ${JSON.stringify(draftVersion)} || document.querySelector('#persistence-status')?.dataset.tone === 'error'`,
      `${scenario}-preserve-persisted-${current.id}`,
    );
    const failure = await renderer.evaluate(`document.querySelector('#persistence-status')?.dataset.tone === 'error' ? document.querySelector('#persistence-status')?.textContent : null`);
    requireJourney(failure === null, `${scenario}-preserve-valid-${current.id}:${failure}`);
    await waitFor(renderer, `document.querySelector('[data-reimport-mappings="ready"]')`, `${scenario}-mapping-reloaded-${current.id}`);
  }
  await assertRenderer(
    renderer,
    `(() => { const review = document.querySelector('[data-import-review-kind="reimport"]'); return review?.dataset.reimportCommitReady === 'true' && review.textContent.includes('未发现稿件变化') && !review.querySelector('[data-resolve-reimport-mapping]') && Array.from(review.querySelectorAll('button')).some((button) => button.textContent === '记录未发现稿件变化'); })()`,
    `${scenario}-resolved-final-state-no-change`,
  );
}

async function assertBoundedReimportPageReplacement(renderer, scenario) {
  const first = await renderer.evaluate(`(() => { const host = document.querySelector('[data-reimport-mappings="ready"]'); return { count: Number(host?.dataset.reimportPageItemCount), ids: Array.from(host?.querySelectorAll('[data-reimport-mapping-id]') ?? [], (row) => row.dataset.reimportMappingId), next: host?.querySelector('[data-reimport-next-page]')?.dataset.reimportNextPage ?? null }; })()`);
  requireJourney(first?.count === 4 && first.ids?.length === 4 && first.next !== null, `${scenario}-first-page-bounded`);
  await assertRenderer(renderer, `(() => { const next = document.querySelector('[data-reimport-next-page]:not(:disabled)'); if (!next) return false; next.click(); return true; })()`, `${scenario}-page-next`);
  await waitFor(renderer, `document.querySelector('[data-reimport-mappings="ready"]') && !${JSON.stringify(first.ids)}.includes(document.querySelector('[data-reimport-mapping-id]')?.dataset.reimportMappingId)`, `${scenario}-page-next-ready`);
  await assertRenderer(
    renderer,
    `(() => { const host = document.querySelector('[data-reimport-mappings="ready"]'); const rows = Array.from(host?.querySelectorAll('[data-reimport-mapping-id]') ?? []); return rows.length > 0 && rows.length <= 4 && rows.every((row) => !${JSON.stringify(first.ids)}.includes(row.dataset.reimportMappingId)) && Boolean(host?.querySelector('[data-reimport-previous-page]')); })()`,
    `${scenario}-page-replaced-not-accumulated`,
  );
  await assertRenderer(renderer, `(() => { const previous = document.querySelector('[data-reimport-previous-page]:not(:disabled)'); if (!previous) return false; previous.click(); return true; })()`, `${scenario}-page-previous`);
  await waitFor(renderer, `document.querySelector('[data-reimport-mappings="ready"] [data-reimport-mapping-id]')?.dataset.reimportMappingId === ${JSON.stringify(first.ids[0])}`, `${scenario}-page-previous-ready`);
}

async function resolvePagedIdentityConsequences(renderer, initialIdentities, scenario) {
  await assertRenderer(
    renderer,
    `(() => { const moved = Array.from(document.querySelectorAll('[data-reimport-mapping-id]')).find((row) => row.dataset.stagedText?.startsWith('有界内容块 035')); const inserted = Array.from(document.querySelectorAll('[data-reimport-mapping-id]')).find((row) => row.dataset.stagedText?.startsWith('明确新增内容块')); const edited = Array.from(document.querySelectorAll('[data-reimport-mapping-id]')).find((row) => row.dataset.stagedText?.startsWith('有界内容块 002（已编辑）')); return moved?.dataset.reimportChangeKind === 'move' && moved.dataset.reimportMappingState === 'resolved' && moved.dataset.currentBlockId === ${JSON.stringify(initialIdentities['有界内容块 035'])} && inserted?.dataset.reimportChangeKind === 'insert' && inserted.dataset.reimportMappingState === 'unresolved' && inserted.dataset.currentBlockId === '' && edited?.dataset.reimportChangeKind === 'insert' && edited.dataset.reimportMappingState === 'unresolved' && edited.dataset.currentBlockId === ''; })()`,
    `${scenario}-move-and-insert-not-positional`,
  );
  const editedVersion = await renderer.evaluate(`document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion`);
  const beforeCancellationProof = await manuscriptReimportReviewProof(renderer, `${scenario}-resolution-cancel-before`);
  await assertRenderer(
    renderer,
    `(() => { const row = Array.from(document.querySelectorAll('[data-reimport-mapping-id]')).find((candidate) => candidate.dataset.stagedText?.startsWith('有界内容块 002（已编辑）')); const choose = Array.from(row?.querySelectorAll('button') ?? []).find((button) => button.textContent === '选择要保留的当前结构身份'); if (!choose) return false; choose.click(); return true; })()`,
    `${scenario}-open-identity-candidates`,
  );
  await waitFor(renderer, `Boolean(document.querySelector('button[data-current-block-id=${JSON.stringify(initialIdentities['有界内容块 002'])}]'))`, `${scenario}-identity-candidate`);
  await assertRenderer(renderer, `(() => { const preserve = document.querySelector('button[data-current-block-id=${JSON.stringify(initialIdentities['有界内容块 002'])}]'); if (!preserve) return false; preserve.click(); return true; })()`, `${scenario}-preserve-edited-identity`);
  await waitForTransientControl(
    renderer,
    `(() => { const cancel = document.querySelector('[data-cancel-reimport-resolution]'); const completed = Number(cancel?.dataset.jobProgressCompleted); const total = Number(cancel?.dataset.jobProgressTotal); return Boolean(cancel) && completed > 0 && completed < total; })()`,
    `${scenario}-resolution-progress`,
  );
  const resolutionProgress = await renderer.evaluate(`(() => { const cancel = document.querySelector('[data-cancel-reimport-resolution]'); return { completed: Number(cancel?.dataset.jobProgressCompleted), total: Number(cancel?.dataset.jobProgressTotal) }; })()`);
  requireJourney(resolutionProgress?.completed > 0 && resolutionProgress.completed < resolutionProgress.total,
    `${scenario}-resolution-progress-running`);
  await waitForTransientControl(
    renderer,
    `(() => { const cancel = document.querySelector('[data-cancel-reimport-resolution]'); const completed = Number(cancel?.dataset.jobProgressCompleted); const total = Number(cancel?.dataset.jobProgressTotal); return completed >= ${resolutionProgress.completed} && completed < total; })()`,
    `${scenario}-resolution-progress-monotonic`,
  );
  await assertRenderer(
    renderer,
    `(() => { const cancel = document.querySelector('[data-cancel-reimport-resolution]:not(:disabled)'); if (!cancel) return false; cancel.click(); return true; })()`,
    `${scenario}-resolution-cancel`,
  );
  await waitFor(
    renderer,
    `document.querySelector('#persistence-status')?.textContent.includes('结构身份解决已取消') && !document.querySelector('[data-cancel-reimport-resolution]') && document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion === ${JSON.stringify(editedVersion)}`,
    `${scenario}-resolution-cancelled`,
  );
  const afterCancellationProof = await manuscriptReimportReviewProof(renderer, `${scenario}-resolution-cancel-after`);
  requireJourney(JSON.stringify(afterCancellationProof) === JSON.stringify(beforeCancellationProof),
    `${scenario}-resolution-cancel-preserves-review`);
  await assertRenderer(renderer, `(() => { const preserve = document.querySelector('button[data-current-block-id=${JSON.stringify(initialIdentities['有界内容块 002'])}]:not(:disabled)'); if (!preserve) return false; preserve.click(); return true; })()`, `${scenario}-preserve-edited-identity-retry`);
  await waitFor(renderer, `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion !== ${JSON.stringify(editedVersion)} || document.querySelector('#persistence-status')?.dataset.tone === 'error'`, `${scenario}-preserve-edited-identity-persisted`);
  const preserveFailure = await renderer.evaluate(`document.querySelector('#persistence-status')?.dataset.tone === 'error' ? document.querySelector('#persistence-status')?.textContent : null`);
  requireJourney(preserveFailure === null, `${scenario}-preserve-edited-identity-valid:${preserveFailure}`);
  await waitFor(renderer, `document.querySelector('[data-reimport-mappings="ready"]')`, `${scenario}-preserve-edited-page`);
  const insertedVersion = await renderer.evaluate(`document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion`);
  await assertRenderer(
    renderer,
    `(() => { const row = Array.from(document.querySelectorAll('[data-reimport-mapping-id]')).find((candidate) => candidate.dataset.stagedText?.startsWith('明确新增内容块')); const create = row?.querySelector('[data-identity-resolution="create-new-identity"]'); if (!create) return false; create.click(); return true; })()`,
    `${scenario}-create-inserted-identity`,
  );
  await waitFor(renderer, `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion !== ${JSON.stringify(insertedVersion)}`, `${scenario}-create-inserted-identity-persisted`);
}

async function runJourney(
  renderer,
  expectation,
  options = {},
) {
  const {
    sourceSha256,
    sourceBytes,
    identityClass = null,
    identityLabel = null,
    identityFindingCount = 0,
    degraded,
    exerciseEditor = false,
  } = expectation;
  const {
    start = 'landing',
    expectInterruption = false,
    editAfterCommit = exerciseEditor,
    stopAfterAcceptedReview = false,
    holdCompletionPaint = false,
    diagnosticReviewLocation = 'review',
  } = options;
  const usePrimaryReviewDiagnostics = diagnosticReviewLocation === 'review';
  const atPrimaryReviewStage = (location) => {
    if (usePrimaryReviewDiagnostics) at(location);
  };
  const hasIdentityFinding = identityClass !== null;
  const expectedNonEffects = degraded
    ? [
        '不创建书系或书系成员关系',
        '不创建编辑学习准入决定',
        '不授予或执行模型提供方传输',
        '不创建发稿版本',
        '不创建公开发布许可或公开发布事实',
        '不导出、不发送、不交付、不发布',
        '不承诺 DOCX 往返或版式复原',
      ]
    : [
        '不创建书系或书系成员关系',
        '不创建编辑学习准入决定',
        '不授予或执行模型提供方传输',
        '不创建发稿版本',
        '不创建公开发布许可或公开发布事实',
        '不导出、不发送、不交付、不发布',
        '不承诺 DOCX 往返或版式复原',
        '符合当前范围的导入不创建导入降级决定',
      ];
  const initialScreen = start === 'accepted-review' ? 'review' : start;
  await waitFor(
    renderer,
    `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen=${JSON.stringify(initialScreen)}]')`,
    'renderer-ready',
  );
  await assertRenderer(
    renderer,
    `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && Object.keys(window.ai7).sort().join(',') === 'abandonImportDraft,acceptReimportDegradation,acknowledgeImportCompletion,authorizeTaskAuthorization,cancelServiceJob,commitBookCreation,commitManuscriptReimport,commitNewBookImport,commitReplacement,commitSourceImport,continueImportDraft,deferRecovery,dismissReplacementPreview,enableEditorialWorkspaceProfile,flushJournalEdit,freezeReplacement,getBookOverview,getBookWorkbenchRoute,getHistoricalRevision,getImportStartup,getManuscriptWindow,getManuscriptWindowAt,getModelServiceSettings,getOutline,getProductDataLocation,getRecoveryComparison,getReimportIdentityCandidatePage,getReimportLineageSourceVersionPage,getReimportMappingPage,getSearchResults,getStartup,inspectEditorialWorkspaceProfile,inspectTaskAuthorization,installEditorialWorkspaceProfile,leaveBookWorkbench,listBooks,listPriorWork,openBookWorkbench,platform,pollServiceJob,prepareBookCreation,prepareManuscriptReimport,prepareNewBookReview,prepareReplacement,prepareSourceImportReview,prepareTaskAuthorization,redoManuscript,removeModelServiceCredential,reselectImportDraft,resolveReimportMapping,restoreRecovery,revealProductDataLocation,saveMilestone,saveModelServiceCredential,selectAndStageDocx,startReplacementCommit,startSearch,undoManuscript,viewRecoveryCandidate'`,
    'renderer-isolation',
  );
  await assertRenderer(
    renderer,
    `(async () => { try { await fetch('http://127.0.0.1:9/ai7-j01-denial-probe'); return false; } catch { return true; } })()`,
    'renderer-network-denial',
  );
  if (start === 'landing') {
    at('landing-action-ready');
    await waitFor(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="landing"]'); const actions = Array.from(screen?.querySelectorAll('button') ?? []).filter((button) => button.textContent === '导入稿件'); return actions.length === 1 && !actions[0].disabled; })()`,
      'landing-action-ready',
    );
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="landing"]'); const actions = Array.from(screen?.querySelectorAll('button') ?? []).filter((button) => button.textContent === '导入稿件'); if (actions.length !== 1 || actions[0].disabled) return false; actions[0].click(); return true; })()`,
      'landing-action-ready',
    );
    at('landing-target-transition');
    await waitFor(
      renderer,
      `document.querySelector('[data-screen="target"]')`,
      'landing-target-transition',
    );
    at('review');
  }
  if (start !== 'accepted-review') {
    if (hasIdentityFinding) {
      await assertRenderer(
        renderer,
        `(() => { const findings = Array.from(document.querySelectorAll('[data-import-identity-class]')); const disclosure = document.querySelector('.identity-finding-disclosure'); const radio = document.querySelector('input[aria-label="新建图书（作为不同作品）"]'); return findings.length === ${identityFindingCount} && findings.every((item) => item.dataset.importIdentityClass === ${JSON.stringify(identityClass)} && item.textContent.includes(${JSON.stringify(identityLabel)})) && disclosure?.textContent.includes('匹配图书') && disclosure.textContent.includes('来源材料版本') && disclosure.textContent.includes('稿件导入记录') && disclosure.textContent.includes('不会选择目标或关系') && disclosure.textContent.includes('不授予去重、覆盖或重新导入权限') && radio && !radio.checked; })()`,
        'identity-finding-disclosed-and-distinct-work-unselected',
      );
    }
  const targetLabel = hasIdentityFinding ? '新建图书（作为不同作品）' : '新建图书';
  await assertRenderer(
    renderer,
    `!document.querySelector('input[aria-label=${JSON.stringify(targetLabel)}]').checked && !document.querySelector('#book-title')`,
    'no-preselection',
  );
  await assertRenderer(
    renderer,
    `(() => { const radio = document.querySelector('input[aria-label=${JSON.stringify(targetLabel)}]'); if (!radio) return false; radio.click(); return true; })()`,
    'target-select',
  );
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, 'target-relationship');
  await assertRenderer(
    renderer,
    `(() => { const relationship = document.querySelector('input[aria-label="作为首份稿件导入"]'); const source = document.querySelector('input[aria-label="作为来源材料导入"]'); if (!relationship || !source || relationship.checked || source.checked) return false; relationship.click(); return true; })()`,
    'relationship-select',
  );
  await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, 'target-title');
  await assertRenderer(
    renderer,
    `document.querySelector('#book-title')?.value.length > 0 && Array.from(document.querySelectorAll('.field-note')).some((note) => note.textContent.includes('建议来源：')) && document.querySelector('[data-source-sha256]')?.textContent === ${JSON.stringify(sourceSha256)} && document.querySelector('[data-source-bytes]')?.textContent === ${JSON.stringify(String(sourceBytes))} && document.querySelectorAll('[data-fidelity-category]').length === 8`,
    'title-contract',
  );
  if (hasIdentityFinding) {
    await assertRenderer(
      renderer,
      `(() => { const title = document.querySelector('#book-title'); if (!title) return false; title.value = title.value + '（不同作品）'; title.dispatchEvent(new Event('input', { bubbles: true })); return title.value.endsWith('（不同作品）') && Array.from(document.querySelectorAll('.field-note')).some((note) => note.textContent.includes('建议来源：') && note.textContent.includes('可编辑建议')); })()`,
      'distinct-work-title-edited',
    );
  }
  await clickExactButton(renderer, '确认书名并复核', 'review-click');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'review-screen');
  at(diagnosticReviewLocation);
  atPrimaryReviewStage('review-contract');
  if (hasIdentityFinding) {
    await assertRenderer(
      renderer,
      `(() => { const findings = Array.from(document.querySelectorAll('[data-import-identity-class]')); const summary = document.querySelector('.review-identity-finding-summary'); return findings.length === ${identityFindingCount} && findings.every((item) => item.dataset.importIdentityClass === ${JSON.stringify(identityClass)} && item.textContent.includes(${JSON.stringify(identityLabel)})) && summary?.textContent.includes('本次选择：新建图书（作为不同作品）') && summary.textContent.includes('身份提示不授予目标、关系、去重、覆盖或重新导入权限') && document.querySelector('[data-screen="review"] h3')?.textContent.endsWith('（不同作品）'); })()`,
      'review-binds-identity-finding-and-distinct-work',
    );
  }
  await assertRenderer(
    renderer,
    `document.querySelector('[data-screen="review"] [data-source-sha256]')?.textContent === ${JSON.stringify(sourceSha256)} && document.querySelector('[data-screen="review"] [data-source-bytes]')?.textContent === ${JSON.stringify(String(sourceBytes))} && Array.from(document.querySelectorAll('[data-screen="review"] dd')).some((item) => item.textContent === ${JSON.stringify(degraded ? '按上述降级方式新建图书并导入稿件' : '新建图书并导入稿件')})`,
    'review-source-and-action',
  );
  if (degraded) {
    await assertRenderer(
      renderer,
      `(() => { const rows = Array.from(document.querySelectorAll('[data-fidelity-category]')); const expected = [['inline-styles',266,'status-degraded'],['comments-revisions',0,'status-preserved'],['notes',0,'status-preserved'],['tables',0,'status-preserved'],['images-captions',0,'status-preserved'],['sections',1,'status-degraded'],['headers-footers',0,'status-preserved'],['round-trip-export',0,'status-unsupported']]; return rows.length === expected.length && rows.every((row, index) => row.dataset.fidelityCategory === expected[index][0] && row.querySelector('.count')?.textContent.includes('· ' + expected[index][1] + ' 项') && row.querySelector('.status-pill')?.classList.contains(expected[index][2])); })()`,
      'review-fidelity-degraded',
    );
    await assertRenderer(
      renderer,
      `(() => { const acceptance = document.querySelector('#accept-import-degradation'); const commit = Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('新建图书并导入稿件')); return acceptance && !acceptance.checked && (!commit || commit.disabled); })()`,
      'degradation-initially-unselected',
    );
    await assertRenderer(
      renderer,
      `(() => { const items = Array.from(document.querySelectorAll('[data-degradation-category]')); const expected = [['inline-styles','266'],['sections','1']]; return items.length === expected.length && items.every((item, index) => item.dataset.degradationCategory === expected[index][0] && item.dataset.degradationCount === expected[index][1]); })()`,
      'degradation-complete-server-set',
    );
    atPrimaryReviewStage('review-acceptance');
    await assertRenderer(
      renderer,
      `(() => { const acceptance = document.querySelector('#accept-import-degradation'); if (!acceptance) return false; acceptance.click(); return true; })()`,
      'degradation-accept',
    );
    await waitFor(
      renderer,
      `document.querySelector('#accept-import-degradation')?.checked && Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '按上述降级方式新建图书并导入稿件' && !button.disabled)`,
      'degradation-accepted-review',
    );
  } else {
    await assertRenderer(
      renderer,
      `(() => { const rows = Array.from(document.querySelectorAll('[data-fidelity-category]')); return rows.length === 8 && rows.every((row) => row.dataset.fidelityCategory === 'round-trip-export' ? row.querySelector('.status-pill')?.classList.contains('status-unsupported') : row.querySelector('.count')?.textContent.includes('· 0 项') && row.querySelector('.status-pill')?.classList.contains('status-preserved')) && !document.querySelector('#accept-import-degradation'); })()`,
      'review-fidelity-clean',
    );
  }
  await assertRenderer(
    renderer,
    `document.querySelector('[data-fidelity-category="round-trip-export"]')?.textContent.includes('不提供往返保证') && document.querySelector('[data-fidelity-category="round-trip-export"]')?.textContent.includes('不阻止本次符合范围的文本导入')`,
    'review-roundtrip-non-effect',
  );
  await assertRenderer(
    renderer,
    `(() => { const sections = Array.from(document.querySelectorAll('.review-section')); const exact = (heading, expected) => { const section = sections.find((item) => item.querySelector('h3')?.textContent === heading); const actual = Array.from(section?.querySelectorAll('li') ?? [], (item) => item.textContent); return actual.length === expected.length && actual.every((item, index) => item === expected[index]); }; return exact('将创建的记录', ${JSON.stringify(degraded ? ['图书与稳定标识','图书编辑维度集（8 项）','源材料版本与来源记录','导入保真审阅','导入降级决定','主稿件','稿件分支','稿件修订版 r1 与有序稳定内容块','工作流程实例与精确方案版本绑定','稿件导入记录'] : ['图书与稳定标识','图书编辑维度集（8 项）','源材料版本与来源记录','导入保真审阅','主稿件','稿件分支','稿件修订版 r1 与有序稳定内容块','工作流程实例与精确方案版本绑定','稿件导入记录'])}) && exact('明确不会发生', ${JSON.stringify(expectedNonEffects)}); })()`,
    'review-exact-effects',
  );
  await assertRenderer(
    renderer,
    `!/(?:J-01|tracer|clean|Review Before Import)/.test(document.body.textContent)`,
    'product-language',
  );
  }
  if (start === 'accepted-review') {
    at(diagnosticReviewLocation);
    await assertRenderer(
      renderer,
      `document.querySelector('[data-screen="review"] [data-source-sha256]')?.textContent === ${JSON.stringify(sourceSha256)} && document.querySelector('[data-screen="review"] [data-source-bytes]')?.textContent === ${JSON.stringify(String(sourceBytes))} && Array.from(document.querySelectorAll('button')).some((button) => button.textContent === ${JSON.stringify(degraded ? '按上述降级方式新建图书并导入稿件' : '新建图书并导入稿件')} && !button.disabled)`,
      'restored-review-source-and-action',
    );
    if (hasIdentityFinding) {
      await assertRenderer(
        renderer,
        `(() => { const findings = Array.from(document.querySelectorAll('[data-import-identity-class]')); const summary = document.querySelector('.review-identity-finding-summary'); return findings.length === ${identityFindingCount} && findings.every((item) => item.dataset.importIdentityClass === ${JSON.stringify(identityClass)} && item.textContent.includes(${JSON.stringify(identityLabel)})) && summary?.textContent.includes('本次选择：新建图书（作为不同作品）') && summary.textContent.includes('身份提示不授予目标、关系、去重、覆盖或重新导入权限'); })()`,
        'restored-review-retains-identity-findings',
      );
    }
  }
  if (stopAfterAcceptedReview) return;
  if (holdCompletionPaint) {
    await assertRenderer(
      renderer,
      `(() => {
        let frameId = 0;
        globalThis.__ai7HeldCompletionFrames = [];
        globalThis.__ai7HeldCompletionOriginalAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis);
        globalThis.__ai7HeldCompletionOriginalCancelAnimationFrame = globalThis.cancelAnimationFrame.bind(globalThis);
        globalThis.requestAnimationFrame = (callback) => {
          frameId += 1;
          globalThis.__ai7HeldCompletionFrames.push({ id: frameId, callback });
          return frameId;
        };
        globalThis.cancelAnimationFrame = (cancelledId) => {
          const frames = globalThis.__ai7HeldCompletionFrames;
          const index = frames.findIndex((frame) => frame.id === cancelledId);
          if (index >= 0) frames.splice(index, 1);
          else globalThis.__ai7HeldCompletionOriginalCancelAnimationFrame(cancelledId);
        };
        return true;
      })()`,
      'completion-paint-held',
    );
  }
  atPrimaryReviewStage('commit');
  await clickExactButton(
    renderer,
    degraded ? '按上述降级方式新建图书并导入稿件' : '新建图书并导入稿件',
    'commit-click',
  );
  if (expectInterruption) {
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ServiceState === 'interrupted'`,
      'commit-interruption-visible',
    );
    await assertRenderer(renderer, `!document.querySelector('[data-screen="imported"]')`, 'no-optimistic-import-success');
    return;
  }
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'imported');
  atPrimaryReviewStage('completion');
  await assertRenderer(
    renderer,
    `document.querySelector('[data-screen="imported"]')?.textContent.includes('稿件已导入') && document.querySelector('[data-screen="imported"]')?.textContent.includes('图书工作概览')`,
    'import-completion',
  );
  if (holdCompletionPaint) {
    await waitFor(renderer, `globalThis.__ai7HeldCompletionFrames?.length === 1`, 'completion-awaits-first-paint');
    await assertRenderer(
      renderer,
      `document.documentElement.dataset.ai7ImportCompletionPainted === undefined && document.documentElement.dataset.ai7ImportCompletionAcknowledged === undefined && Boolean(document.querySelector('[data-screen="imported"] [data-import-commit-id]'))`,
      'completion-unacknowledged-before-paint',
    );
    return;
  }
  await waitFor(
    renderer,
    `document.visibilityState === 'visible' && document.documentElement.dataset.ai7ProductReady === 'true' && document.documentElement.dataset.ai7ImportCompletionPainted === 'true' && document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true' && Boolean(document.querySelector('[data-screen="imported"] [data-import-commit-id]'))`,
    'completion-observed-durable',
  );
  if (!editAfterCommit) return;
  await clickExactButton(renderer, '稿件导入记录', 'record-open');
  await assertRenderer(
    renderer,
    `(() => { const record = document.querySelector('.record-detail[data-record-kind="import-record"]'); const buttons = Array.from(document.querySelectorAll('.record-navigation button'), (button) => button.textContent); const exact = ['图书','主稿件','修订版 r1','来源版本与来源记录','工作流实例与精确 Profile 绑定','稿件导入记录']; const items = Array.from(record?.querySelectorAll('[data-degradation-category]') ?? []); return record?.textContent.includes('稿件导入记录 ID') && record.textContent.includes('导入保真审阅 ID') && record.textContent.includes('导入降级决定 ID') && record.textContent.includes('查看受影响类别、示例与导出后果') && record.textContent.includes('rFonts') && record.textContent.includes('文档网格') && record.textContent.includes('后续导出无法恢复') && items.length === 2 && items[0].dataset.degradationCategory === 'inline-styles' && items[0].dataset.degradationCount === '266' && items[1].dataset.degradationCategory === 'sections' && items[1].dataset.degradationCount === '1' && buttons.length === exact.length && buttons.every((label, index) => label === exact[index]); })()`,
    'exact-record-navigation',
  );
  await clickExactButton(renderer, '打开稿件', 'editor-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'editor-screen');
  at('editor');
  await assertRenderer(
    renderer,
    `(() => { const forward = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '向后浏览'); return document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length === 32 && document.querySelector('.editor-meta')?.textContent.includes('全稿 0.000%') && forward && !forward.disabled; })()`,
    'bounded-window',
  );
  const editAndShortcut = await renderer.evaluate(
    `(async () => {
      const status = document.querySelector('#persistence-status');
      const editor = document.querySelector('[data-testid="manuscript-editor"]');
      const block = editor?.children[3];
      const save = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑');
      if (!(status instanceof HTMLElement) || !(editor instanceof HTMLElement) || !(block instanceof HTMLElement) || !(save instanceof HTMLButtonElement)) return false;
      const blockId = block.dataset.blockId;
      const before = block.textContent;
      if (!blockId || before === null) return false;
      const isBusy = () => status.dataset.tone === 'busy' && status.textContent.includes('写入修订日志');
      const isDurable = () => status.dataset.tone === 'success' && status.textContent.includes('已写入修订日志');
      let busy = isBusy();
      globalThis.__ai7JournalProbe = new Promise((resolve) => {
        let settled = false;
        let timeout;
        const finish = (durable) => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          clearTimeout(timeout);
          resolve({ busy, durable });
        };
        const observer = new MutationObserver(() => {
          busy ||= isBusy();
          if (isDurable()) finish(true);
        });
        observer.observe(status, { attributes: true, attributeFilter: ['data-tone'], childList: true, subtree: true, characterData: true });
        timeout = setTimeout(() => finish(false), 30000);
      });
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
      const suffix = '，新增编辑';
      block.focus();
      const range = document.createRange();
      range.selectNodeContents(block);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, suffix);
      const dirty = await dirtyReady;
      const liveBlock = Array.from(editor.children).find((item) => item.getAttribute('data-block-id') === blockId);
      if (!dirty || !(liveBlock instanceof HTMLElement) || liveBlock.textContent !== before + suffix) return false;
      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: ${process.platform === 'darwin' ? 'false' : 'true'}, metaKey: ${process.platform === 'darwin' ? 'true' : 'false'}, bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      busy ||= isBusy();
      return event.defaultPrevented && busy;
    })()`,
  );
  requireJourney(editAndShortcut === true, 'bounded-edit-and-save-shortcut');
  const persisted = await renderer.evaluate('globalThis.__ai7JournalProbe');
  requireJourney(persisted?.busy === true && persisted?.durable === true, 'durable-journal-ack');
  await assertRenderer(
    renderer,
    `document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r1') && document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 1') && !document.querySelector('.editor-meta')?.textContent.includes('稿件修订版 r1')`,
    'r1-journal-sequence',
  );
}

async function runEmptyBookFirstImport(renderer, expectation, restartReviewedImport) {
  const title = 'sample1 空图书首稿路径';
  const internalNumber = 'J01-EMPTY-BOOK-001';
  await waitFor(
    renderer,
    `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
    'empty-book-landing',
  );
  await clickExactButton(renderer, '新建图书', 'empty-book-create-open');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, 'empty-book-form');
  await clickExactButton(renderer, '复核创建', 'empty-book-missing-title');
  await assertRenderer(
    renderer,
    `(() => { const title = document.querySelector('#empty-book-title'); const error = document.querySelector('#empty-book-title-error'); const number = document.querySelector('#empty-book-number'); return title?.getAttribute('aria-invalid') === 'true' && title.getAttribute('aria-describedby') === error?.id && error?.textContent.includes('请输入书名') && document.activeElement === title && title.value === '' && number?.value === ''; })()`,
    'empty-book-title-field-error',
  );
  await assertRenderer(
    renderer,
    `(() => { const title = document.querySelector('#empty-book-title'); const number = document.querySelector('#empty-book-number'); if (!title || !number) return false; title.value = ${JSON.stringify(title)}; title.dispatchEvent(new Event('input')); number.value = 'BAD' + String.fromCharCode(1); number.dispatchEvent(new Event('input')); return true; })()`,
    'empty-book-invalid-number-values',
  );
  await clickExactButton(renderer, '复核创建', 'empty-book-invalid-number');
  await assertRenderer(
    renderer,
    `(() => { const title = document.querySelector('#empty-book-title'); const number = document.querySelector('#empty-book-number'); const error = document.querySelector('#empty-book-number-error'); return number?.getAttribute('aria-invalid') === 'true' && number.getAttribute('aria-describedby') === error?.id && error?.textContent.includes('内部编号') && document.activeElement === number && title?.value === ${JSON.stringify(title)} && number.value.length === 4; })()`,
    'empty-book-number-field-error',
  );
  await assertRenderer(
    renderer,
    `(() => { const number = document.querySelector('#empty-book-number'); if (!number) return false; number.value = ${JSON.stringify(internalNumber)}; number.dispatchEvent(new Event('input')); return !number.hasAttribute('aria-invalid'); })()`,
    'empty-book-form-values',
  );
  await clickExactButton(renderer, '复核创建', 'empty-book-review-click');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, 'empty-book-review');
  await assertRenderer(
    renderer,
    `(() => { const screen = document.querySelector('[data-screen="book-create-review"]'); return screen?.textContent.includes(${JSON.stringify(title)}) && screen.textContent.includes(${JSON.stringify(internalNumber)}) && screen.textContent.includes('拟用稳定标识') && screen.textContent.includes('图书编辑维度集 · 8 项') && screen.textContent.includes('不创建稿件、来源、修订版、工作流实例或导入记录'); })()`,
    'empty-book-review-contract',
  );
  await clickExactButton(renderer, '新建图书', 'empty-book-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-manuscript-state="empty"]')`, 'empty-book-overview');
  await assertRenderer(
    renderer,
    `(() => { const screen = document.querySelector('[data-screen="book-overview"]'); const buttons = Array.from(screen?.querySelectorAll('.record-navigation button') ?? [], (button) => button.textContent); return screen?.textContent.includes('尚无稿件') && screen.textContent.includes('图书已创建') && buttons.length === 1 && buttons[0] === '图书' && Array.from(screen.querySelectorAll('button')).some((button) => button.textContent === '导入首份稿件'); })()`,
    'empty-book-only-authority',
  );
  const bookId = await renderer.evaluate(`document.querySelector('[data-screen="book-overview"] .book-overview')?.dataset.bookId`);
  requireJourney(typeof bookId === 'string' && /^[0-9a-f-]{36}$/i.test(bookId), 'empty-book-id');
  await clickExactButton(renderer, '图书', 'empty-book-record-open');
  const beforeIdentity = await renderer.evaluate(`(() => {
    const values = Array.from(document.querySelectorAll('.record-detail dd'), (item) => item.textContent);
    return { stableIdentity: values[1], dimensionSetId: values[5], dimensionSetDigest: values[6] };
  })()`);
  requireJourney(
    beforeIdentity?.stableIdentity === `book:${bookId}` &&
      typeof beforeIdentity.dimensionSetId === 'string' &&
      typeof beforeIdentity.dimensionSetDigest === 'string',
    'empty-book-exact-identity',
  );

  await clickExactButton(renderer, '返回图书列表', 'empty-book-return-library');
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'empty-book-library');
  await assertRenderer(
    renderer,
    `(() => { const row = document.querySelector('[data-screen="landing"] [data-book-id=${JSON.stringify(bookId)}]')?.closest('.book-summary-item'); return row?.textContent.includes(${JSON.stringify(title)}) && row.textContent.includes('尚无稿件') && row.textContent.includes(${JSON.stringify(internalNumber)}) && row.textContent.includes(${JSON.stringify(bookId)}) && row.textContent.includes(${JSON.stringify(`book:${bookId}`)}) && !Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '加载更多图书'); })()`,
    'compact-book-summary-exact-identity',
  );
  await clickExactButton(renderer, '新建图书', 'duplicate-number-create-open');
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, 'duplicate-number-form');
  await assertRenderer(
    renderer,
    `(() => { const title = document.querySelector('#empty-book-title'); const number = document.querySelector('#empty-book-number'); if (!title || !number) return false; title.value = '另一本书'; title.dispatchEvent(new Event('input')); number.value = ${JSON.stringify(internalNumber)}; number.dispatchEvent(new Event('input')); return true; })()`,
    'duplicate-number-values',
  );
  await clickExactButton(renderer, '复核创建', 'duplicate-number-review');
  await waitFor(
    renderer,
    `(() => { const title = document.querySelector('#empty-book-title'); const number = document.querySelector('#empty-book-number'); const error = document.querySelector('#empty-book-number-error'); return number?.getAttribute('aria-invalid') === 'true' && number.getAttribute('aria-describedby') === error?.id && error?.textContent.includes('内部编号') && document.activeElement === number && title?.value === '另一本书' && number.value === ${JSON.stringify(internalNumber)}; })()`,
    'duplicate-number-adjacent-field-error',
  );
  await clickExactButton(renderer, '取消', 'duplicate-number-cancel');
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'duplicate-number-return-library');
  await assertRenderer(
    renderer,
    `(() => { const open = document.querySelector('[data-screen="landing"] [data-book-id=${JSON.stringify(bookId)}]'); if (!(open instanceof HTMLButtonElement)) return false; open.click(); return true; })()`,
    'compact-book-summary-open-exact',
  );
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-book-id=${JSON.stringify(bookId)}]')`, 'empty-book-reopened-from-summary');

  await clickExactButton(renderer, '导入首份稿件', 'empty-book-import-first');
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, 'existing-book-target-selected');
  await assertRenderer(
    renderer,
    `(() => { const selectedTarget = document.querySelector('input[name="import-target"]:checked'); const relationship = document.querySelector('input[aria-label="作为首份稿件导入"]'); const newBook = document.querySelector('input[aria-label="新建图书"]'); const label = selectedTarget?.getAttribute('aria-label') ?? ''; return selectedTarget?.value === ${JSON.stringify(`existing-book:${bookId}`)} && label.includes(${JSON.stringify(title)}) && label.includes(${JSON.stringify(internalNumber)}) && label.includes(${JSON.stringify(bookId)}) && relationship && !relationship.checked && document.activeElement === relationship && newBook && !newBook.checked && !Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '复核导入到所选图书'); })()`,
    'existing-target-and-relationship-independent',
  );
  await assertRenderer(
    renderer,
    `(() => { const relationship = document.querySelector('input[aria-label="作为首份稿件导入"]'); if (!relationship) return false; relationship.click(); return true; })()`,
    'first-manuscript-relationship-select',
  );
  await waitFor(
    renderer,
    `Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '复核导入到所选图书')`,
    'existing-book-review-action',
  );
  await assertRenderer(
    renderer,
    `(() => { const review = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '复核导入到所选图书'); return document.activeElement === review && document.querySelector('#persistence-status')?.textContent.includes(${JSON.stringify(bookId)}); })()`,
    'existing-book-relationship-review-focus',
  );
  await clickExactButton(renderer, '复核导入到所选图书', 'existing-book-review-click');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'existing-book-review');
  await assertRenderer(
    renderer,
    `(() => { const screen = document.querySelector('[data-screen="review"]'); const effects = Array.from(screen?.querySelectorAll('.review-section') ?? []).find((section) => section.querySelector('h3')?.textContent === '将创建的记录'); const items = Array.from(effects?.querySelectorAll('li') ?? [], (item) => item.textContent); const reviewed = screen?.querySelector('[data-reviewed-book-id]'); return screen?.textContent.includes(${JSON.stringify(title)}) && screen.textContent.includes('作为首份稿件导入') && screen.textContent.includes('manuscript-editorial@1.0.0') && reviewed?.textContent === ${JSON.stringify(bookId)} && reviewed.dataset.reviewedBookId === ${JSON.stringify(bookId)} && screen.textContent.includes(${JSON.stringify(`book:${bookId}`)}) && screen.textContent.includes(${JSON.stringify(internalNumber)}) && items.length === 8 && !items.includes('图书与稳定标识') && !items.includes('图书编辑维度集（8 项）'); })()`,
    'existing-book-review-preserves-book',
  );
  await assertRenderer(
    renderer,
    `document.querySelector('[data-screen="review"] [data-source-sha256]')?.textContent === ${JSON.stringify(expectation.sourceSha256)} && document.querySelector('[data-screen="review"] [data-source-bytes]')?.textContent === ${JSON.stringify(String(expectation.sourceBytes))}`,
    'existing-book-sample1-identity',
  );
  await assertRenderer(
    renderer,
    `(() => { const acceptance = document.querySelector('#accept-import-degradation'); if (!acceptance) return false; acceptance.click(); return true; })()`,
    'existing-book-degradation-accept',
  );
  await waitFor(
    renderer,
    `Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '按上述降级方式导入为首份稿件')`,
    'existing-book-accepted-review',
  );
  if (restartReviewedImport) renderer = await restartReviewedImport({ bookId, title });
  await clickExactButton(renderer, '按上述降级方式导入为首份稿件', 'existing-book-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"] .book-overview[data-manuscript-state="populated"]')`, 'existing-book-imported');
  await waitFor(
    renderer,
    `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`,
    'existing-book-completion-acknowledged',
  );
  await assertRenderer(
    renderer,
    `(() => { const screen = document.querySelector('[data-screen="imported"]'); const overview = screen?.querySelector('.book-overview'); const buttons = Array.from(screen?.querySelectorAll('.record-navigation [data-record-kind]') ?? [], (button) => button.textContent); const exact = ['图书','主稿件','修订版 r1','来源版本与来源记录','工作流实例与精确 Profile 绑定','稿件导入记录']; return overview?.dataset.bookId === ${JSON.stringify(bookId)} && screen.textContent.includes('稿件已导入') && screen.textContent.includes('已有主稿件') && buttons.length === exact.length && buttons.every((label, index) => label === exact[index]); })()`,
    'existing-book-result-overview',
  );
  const importedRoute = await renderer.evaluate(`window.ai7.getBookWorkbenchRoute()`);
  requireJourney(
    importedRoute?.kind === 'book' && importedRoute.bookId === bookId,
    'existing-book-imported-exact-route-owned',
  );
  await clickExactButton(renderer, '图书', 'existing-book-result-book-record');
  const afterIdentity = await renderer.evaluate(`(() => {
    const values = Array.from(document.querySelectorAll('.record-detail dd'), (item) => item.textContent);
    return { stableIdentity: values[1], dimensionSetId: values[5], dimensionSetDigest: values[6] };
  })()`);
  requireJourney(JSON.stringify(afterIdentity) === JSON.stringify(beforeIdentity), 'existing-book-identity-and-dimensions-preserved');
  for (const [label, kind, exactField] of [
    ['主稿件', 'manuscript', '稿件 ID'],
    ['修订版 r1', 'revision', '修订版 ID'],
    ['来源版本与来源记录', 'source', '来源记录 ID'],
    ['稿件导入记录', 'import-record', '稿件导入记录 ID'],
  ]) {
    await clickExactButton(renderer, label, `existing-book-${kind}-record`);
    await assertRenderer(
      renderer,
      `(() => { const record = document.querySelector('.record-detail[data-record-kind=${JSON.stringify(kind)}]'); return record?.textContent.includes(${JSON.stringify(exactField)}) && record.querySelectorAll('.technical-identity').length > 0; })()`,
      `existing-book-${kind}-exact-presentation`,
    );
  }
  await clickExactButton(renderer, '工作流实例与精确 Profile 绑定', 'existing-book-workflow-record');
  await assertRenderer(
    renderer,
    `(() => { const record = document.querySelector('.record-detail[data-record-kind="workflow"]'); return record?.textContent.includes('ai7.manuscript.editorial.zh-CN@2.0.0') && record.textContent.includes('d9c36f1a80f8461001e028bca9b8fc44723e44d1558dfc6f8863af4e47a5b03f') && record.textContent.includes('manuscript-editorial@1.0.0') && record.textContent.includes('fc337a46d41a88a6f4d7bad7fc7b6846fe4b973e84776722ec126906a7b1d3ff'); })()`,
    'existing-book-exact-profile-pins',
  );
  await clickExactButton(renderer, '稿件导入记录', 'existing-book-import-record-degradation');
  await assertRenderer(
    renderer,
    `(() => { const record = document.querySelector('.record-detail[data-record-kind="import-record"]'); const items = Array.from(record?.querySelectorAll('[data-degradation-category]') ?? []); return record?.textContent.includes('查看受影响类别、示例与导出后果') && record.textContent.includes('rFonts') && record.textContent.includes('文档网格') && record.textContent.includes('后续导出无法恢复') && items.length === 2 && items[0].dataset.degradationCategory === 'inline-styles' && items[0].dataset.degradationCount === '266' && items[1].dataset.degradationCategory === 'sections' && items[1].dataset.degradationCount === '1'; })()`,
    'existing-book-import-degradation-disclosure',
  );
  return bookId;
}

async function main() {
  at('cli');
  parseJourney();
  at('controller-network-denial');
  const networkDenialEntry = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
  requireJourney(existsSync(networkDenialEntry), 'controller-network-denial-carrier');
  const { installNodeNetworkDenial } = await import(pathToFileURL(networkDenialEntry).href);
  installNodeNetworkDenial();
  at('controller-imports');
  ({ electronExecutable } = await import('../tools/electron-runtime.mjs'));
  const dataRootEntry = resolve(ROOT, 'dist', 'shared', 'data-root.mjs');
  requireJourney(existsSync(dataRootEntry), 'controller-data-root-carrier');
  const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(
    pathToFileURL(dataRootEntry).href
  );
  const {
    chromium,
    errors: { TimeoutError: PlaywrightTimeoutError },
  } = await import('playwright-core');
  const isBrowserLaunchTimeout = (error) =>
    error === BROWSER_LAUNCH_TIMEOUT || error instanceof PlaywrightTimeoutError;
  const tempParent = await realpath(tmpdir());
  const checkoutRoot = await realpath(ROOT);
  requireJourney(
    !pathIsInside(checkoutRoot, tempParent) && !pathIsInside(tempParent, checkoutRoot),
    'temp-parent-boundary',
  );
  let runRoot;
  let runRootAcquisition;
  let browser;
  let browserAcquisition;
  let activeBrowserClose;
  const closeBrowserBounded = async (ownedBrowser) => {
    if (activeBrowserClose !== undefined) return activeBrowserClose;
    if (ownedBrowser === undefined) return;
    if (!ownedBrowser.isConnected()) {
      browserLifecycleIncomplete = true;
      throw BROWSER_DISCONNECTED;
    }
    const closePromise = ownedBrowser.close();
    closePromise.catch(() => undefined);
    let timeout;
    const boundedClose = Promise.race([
      closePromise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(BROWSER_CLOSE_TIMEOUT);
        }, BROWSER_CLOSE_TIMEOUT_MS);
      }),
    ]);
    activeBrowserClose = boundedClose;
    try {
      await boundedClose;
    } catch (error) {
      browserLifecycleIncomplete = true;
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
    const acquiredBrowser =
      ownedBrowser ??
      (ownedAcquisition === undefined
        ? undefined
        : await ownedAcquisition.catch(() => undefined));
    await closeBrowserBounded(acquiredBrowser);
  };
  const cancellation = installJourneyCancellationCleanup(async () => {
    try {
      await closeOwnedBrowser();
    } finally {
      const ownedRoot =
        runRoot ??
        (runRootAcquisition === undefined
          ? undefined
          : await runRootAcquisition.catch(() => undefined));
      if (ownedRoot !== undefined) {
        requireJourney(
          dirname(ownedRoot) === tempParent &&
            basename(ownedRoot).startsWith('ai7-j01-e2e-') &&
            (await realpath(ownedRoot)) === ownedRoot,
          'cleanup-target',
        );
        await rm(ownedRoot, { recursive: true, force: true });
        runRoot = undefined;
      }
    }
  }, closeOwnedBrowser);
  try {
    cancellation.throwIfRequested();
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j01-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j01-e2e-'), 'temp-root');
    requireJourney((await realpath(runRoot)) === runRoot, 'temp-root');
    const docx = SAMPLE1_PATH;
    const sampleInfo = await lstat(docx);
    requireJourney(
      sampleInfo.isFile() &&
        !sampleInfo.isSymbolicLink() &&
        sampleInfo.size === SAMPLE1_BYTES &&
        (await realpath(docx)) === docx &&
        (await digestFile(docx)) === SAMPLE1_SHA256,
      'sample1-identity',
    );
    const syntheticRoot = resolve(runRoot, 'synthetic-inputs');
    await mkdir(syntheticRoot);
    const syntheticAPath = resolve(syntheticRoot, 'sample1.docx');
    const syntheticBPath = resolve(syntheticRoot, 'same-content-other-container.docx');
    const syntheticCPath = resolve(syntheticRoot, 'reimport-changed.docx');
    const syntheticPagedBasePath = resolve(syntheticRoot, 'reimport-paged-base.docx');
    const syntheticPagedChangedPath = resolve(syntheticRoot, 'reimport-paged-changed.docx');
    const syntheticRepeatedBasePath = resolve(syntheticRoot, 'reimport-repeated-base.docx');
    const syntheticRepeatedChangedPath = resolve(syntheticRoot, 'reimport-repeated-changed.docx');
    const syntheticAmbiguousBasePath = resolve(syntheticRoot, 'reimport-ambiguous-base.docx');
    const syntheticAmbiguousReimportPath = resolve(syntheticRoot, 'reimport-ambiguous-same-content.docx');
    await createSyntheticDocx(syntheticAPath, 'a');
    await createSyntheticDocx(syntheticBPath, 'b');
    await createSyntheticDocx(syntheticCPath, 'c');
    await createSyntheticDocx(syntheticPagedBasePath, 'paged-base');
    await createSyntheticDocx(syntheticPagedChangedPath, 'paged-reimport');
    await createSyntheticDocx(syntheticRepeatedBasePath, 'repeated-base');
    await createSyntheticDocx(syntheticRepeatedChangedPath, 'repeated-reimport');
    await createSyntheticDocx(syntheticAmbiguousBasePath, 'ambiguous-base');
    await createSyntheticDocx(syntheticAmbiguousReimportPath, 'ambiguous-reimport');
    const syntheticAInfo = await lstat(syntheticAPath);
    const syntheticBInfo = await lstat(syntheticBPath);
    const syntheticCInfo = await lstat(syntheticCPath);
    const syntheticPagedBaseInfo = await lstat(syntheticPagedBasePath);
    const syntheticPagedChangedInfo = await lstat(syntheticPagedChangedPath);
    const syntheticRepeatedBaseInfo = await lstat(syntheticRepeatedBasePath);
    const syntheticRepeatedChangedInfo = await lstat(syntheticRepeatedChangedPath);
    const syntheticAmbiguousBaseInfo = await lstat(syntheticAmbiguousBasePath);
    const syntheticAmbiguousReimportInfo = await lstat(syntheticAmbiguousReimportPath);
    const syntheticASha256 = await digestFile(syntheticAPath);
    const syntheticBSha256 = await digestFile(syntheticBPath);
    const syntheticCSha256 = await digestFile(syntheticCPath);
    const syntheticPagedBaseSha256 = await digestFile(syntheticPagedBasePath);
    const syntheticPagedChangedSha256 = await digestFile(syntheticPagedChangedPath);
    const syntheticRepeatedBaseSha256 = await digestFile(syntheticRepeatedBasePath);
    const syntheticRepeatedChangedSha256 = await digestFile(syntheticRepeatedChangedPath);
    const syntheticAmbiguousBaseSha256 = await digestFile(syntheticAmbiguousBasePath);
    const syntheticAmbiguousReimportSha256 = await digestFile(syntheticAmbiguousReimportPath);
    requireJourney(
      syntheticAInfo.isFile() &&
        syntheticBInfo.isFile() &&
        !syntheticAInfo.isSymbolicLink() &&
        !syntheticBInfo.isSymbolicLink() &&
        (await realpath(syntheticAPath)) === syntheticAPath &&
        (await realpath(syntheticBPath)) === syntheticBPath &&
        syntheticCInfo.isFile() && !syntheticCInfo.isSymbolicLink() &&
        syntheticPagedBaseInfo.isFile() && syntheticPagedChangedInfo.isFile() &&
        !syntheticPagedBaseInfo.isSymbolicLink() &&
        !syntheticPagedChangedInfo.isSymbolicLink() &&
        syntheticRepeatedBaseInfo.isFile() && syntheticRepeatedChangedInfo.isFile() &&
        !syntheticRepeatedBaseInfo.isSymbolicLink() &&
        !syntheticRepeatedChangedInfo.isSymbolicLink() &&
        syntheticAmbiguousBaseInfo.isFile() && syntheticAmbiguousReimportInfo.isFile() &&
        !syntheticAmbiguousBaseInfo.isSymbolicLink() &&
        !syntheticAmbiguousReimportInfo.isSymbolicLink() &&
        (await realpath(syntheticCPath)) === syntheticCPath &&
        (await realpath(syntheticPagedBasePath)) === syntheticPagedBasePath &&
        (await realpath(syntheticPagedChangedPath)) === syntheticPagedChangedPath &&
        (await realpath(syntheticRepeatedBasePath)) === syntheticRepeatedBasePath &&
        (await realpath(syntheticRepeatedChangedPath)) === syntheticRepeatedChangedPath &&
        (await realpath(syntheticAmbiguousBasePath)) === syntheticAmbiguousBasePath &&
        (await realpath(syntheticAmbiguousReimportPath)) === syntheticAmbiguousReimportPath &&
        syntheticASha256 !== SAMPLE1_SHA256 &&
        syntheticBSha256 !== SAMPLE1_SHA256 &&
        syntheticCSha256 !== SAMPLE1_SHA256 && syntheticASha256 !== syntheticBSha256 &&
        syntheticASha256 !== syntheticCSha256 && syntheticBSha256 !== syntheticCSha256 &&
        syntheticPagedBaseSha256 !== syntheticPagedChangedSha256 &&
        syntheticRepeatedBaseSha256 !== syntheticRepeatedChangedSha256 &&
        syntheticAmbiguousBaseSha256 !== syntheticAmbiguousReimportSha256,
      'synthetic-input-identities',
    );
    const executable = electronExecutable();
    const entry = resolve(ROOT, 'dist', 'main', 'index.cjs');
    const launchProduct = async ({ dataRoot, pickerPath, importControl, launchScenario }) => {
      requireJourney(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(launchScenario), 'launch-scenario');
      const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
      const productArgs = [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
        '--remote-debugging-pipe',
        `--user-data-dir=${shellRoot}`,
        entry,
        '--data-root',
        dataRoot,
        '--launcher-pid',
        String(process.pid),
      ];
      if (pickerPath) productArgs.push('--j01-picker-path', pickerPath);
      if (importControl) productArgs.push('--j01-import-control', importControl);
      requireJourney(
        isAbsolute(dataRoot) &&
          (!pickerPath ||
            (isAbsolute(pickerPath) && (pickerPath === docx || pathIsInside(runRoot, pickerPath)))) &&
          !productArgs.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)),
        'pipe-only-product-transport',
      );
      cancellation.throwIfRequested();
      at(`launch-${launchScenario}-browser-acquisition`);
      const launchPromise = chromium.launch({
        executablePath: executable,
        headless: false,
        ignoreDefaultArgs: true,
        args: productArgs,
        env: productEnvironment(executable),
        timeout: 30_000,
      });
      launchPromise.catch(() => undefined);
      let launchTimeout;
      const acquisition = Promise.race([
        launchPromise,
        new Promise((_, reject) => {
          launchTimeout = setTimeout(() => {
            reject(BROWSER_LAUNCH_TIMEOUT);
          }, BROWSER_LAUNCH_TIMEOUT_MS);
        }),
      ]);
      browserAcquisition = acquisition;
      try {
        browser = await acquisition;
        attachProductOutput('J-01', browser, launchScenario);
      } catch (error) {
        if (isBrowserLaunchTimeout(error)) browserLifecycleIncomplete = true;
        throw error;
      } finally {
        clearTimeout(launchTimeout);
        if (browserAcquisition === acquisition) browserAcquisition = undefined;
      }
      cancellation.throwIfRequested();
      at(`launch-${launchScenario}-renderer-target`);
      return attachRendererTarget(browser);
    };
    const closeProduct = async () => {
      at('window-close');
      const ownedBrowser = browser;
      browser = undefined;
      browserAcquisition = undefined;
      if (ownedBrowser?.isConnected() !== true) browserLifecycleIncomplete = true;
      requireJourney(ownedBrowser?.isConnected() === true, 'browser-close-connection');
      try {
        await closeBrowserBounded(ownedBrowser);
      } catch (error) {
        if (ownedBrowser.isConnected() && browser === undefined) browser = ownedBrowser;
        throw error;
      }
    };
    const sample1Expectation = {
      sourceSha256: SAMPLE1_SHA256,
      sourceBytes: SAMPLE1_BYTES,
      degraded: true,
    };
    const exactSample1Expectation = {
      ...sample1Expectation,
      identityClass: 'immutable-original',
      identityLabel: '精确原始文件身份',
      identityFindingCount: 1,
    };
    const syntheticAExpectation = {
      sourceSha256: syntheticASha256,
      sourceBytes: syntheticAInfo.size,
      identityClass: 'filename-collision',
      identityLabel: '名称相同，内容不同',
      identityFindingCount: 2,
      degraded: false,
    };
    const syntheticBExpectation = {
      sourceSha256: syntheticBSha256,
      sourceBytes: syntheticBInfo.size,
      identityClass: 'parsed-content-structure',
      identityLabel: '发现相同内容',
      identityFindingCount: 1,
      degraded: false,
    };
    const syntheticCExpectation = {
      sourceSha256: syntheticCSha256,
      sourceBytes: syntheticCInfo.size,
      degraded: false,
    };

    let renderer;
    const runIssue178WindowCloseRegression = async () => {
      // Issue #178 / nearest supported Journey J-01: closing one Book workspace must leave another
      // workspace usable and let the closed Book reopen with unique routing, without a JavaScript Error.
      at('window-close');
      const windowCloseRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'window-close-data'), checkoutRoot);
      renderer = await launchProduct({ dataRoot: windowCloseRoot, launchScenario: 'window-close' });
      at('window-close');
      await waitFor(
        renderer,
        `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
        'issue-178-product-ready',
      );
      const windowCloseBooks = await renderer.evaluate(`(async()=>{
        const createBook = async (title, internalNumber) => {
          const review = await window.ai7.prepareBookCreation({title, internalNumber});
          const committed = await window.ai7.commitBookCreation({...review.proposed, reviewDigest:review.reviewDigest});
          await window.ai7.leaveBookWorkbench();
          return committed.overview.book.bookId;
        };
        return {
          survivingBookId: await createBook('窗口关闭存活图书', 'WINDOW-CLOSE-SURVIVOR'),
          closedBookId: await createBook('窗口关闭目标图书', 'WINDOW-CLOSE-TARGET'),
        };
      })()`);
      requireJourney(
        /^[0-9a-f-]{36}$/i.test(windowCloseBooks?.survivingBookId ?? '') &&
          /^[0-9a-f-]{36}$/i.test(windowCloseBooks?.closedBookId ?? '') &&
          windowCloseBooks.survivingBookId !== windowCloseBooks.closedBookId,
        'issue-178-two-book-identities',
      );
      const openedSurvivingBook = await renderer.evaluate(
        `window.ai7.openBookWorkbench({kind:'book',bookId:${JSON.stringify(windowCloseBooks.survivingBookId)}})`,
      );
      requireJourney(
        openedSurvivingBook?.target === 'requesting-window' &&
          openedSurvivingBook.route?.kind === 'book' &&
          openedSurvivingBook.route.bookId === windowCloseBooks.survivingBookId,
        'issue-178-open-surviving-book-workspace',
      );
      const openedSecondBook = await renderer.evaluate(
        `window.ai7.openBookWorkbench({kind:'book',bookId:${JSON.stringify(windowCloseBooks.closedBookId)}})`,
      );
      requireJourney(
        openedSecondBook?.target === 'new-window' &&
          openedSecondBook.route?.kind === 'book' &&
          openedSecondBook.route.bookId === windowCloseBooks.closedBookId,
        'issue-178-open-secondary-book-workspace',
      );
      const windowManager = await createRendererManager(browser);
      const twoBookWindows = await waitForRendererCount(windowManager, 2, 'issue-178-two-book-windows');
      const initialRoutes = await Promise.all(
        twoBookWindows.map((item) => item.evaluate(`window.ai7.getBookWorkbenchRoute()`)),
      );
      requireJourney(
        initialRoutes.filter((route) => route?.kind === 'book' && route.bookId === windowCloseBooks.survivingBookId).length === 1 &&
          initialRoutes.filter((route) => route?.kind === 'book' && route.bookId === windowCloseBooks.closedBookId).length === 1,
        'issue-178-initial-unique-routes',
      );
      const initialSurvivingRenderer = twoBookWindows[
        initialRoutes.findIndex((route) => route?.kind === 'book' && route.bookId === windowCloseBooks.survivingBookId)
      ];
      const secondaryRenderer = twoBookWindows[
        initialRoutes.findIndex((route) => route?.kind === 'book' && route.bookId === windowCloseBooks.closedBookId)
      ];
      requireJourney(
        initialSurvivingRenderer !== undefined &&
          secondaryRenderer !== undefined &&
          initialSurvivingRenderer.targetId !== secondaryRenderer.targetId,
        'issue-178-initial-unique-targets',
      );
      requireJourney((await windowManager.close(secondaryRenderer.targetId)).success === true, 'issue-178-close-secondary-target');
      const [survivingRenderer] = await waitForRendererCount(windowManager, 1, 'issue-178-one-book-window');
      requireJourney(
        survivingRenderer.targetId === initialSurvivingRenderer.targetId,
        'issue-178-surviving-target',
      );
      const survivingRoundTrip = await survivingRenderer.evaluate(
        `(async()=>({books:await window.ai7.listBooks({after:null}),route:await window.ai7.getBookWorkbenchRoute()}))()`,
      );
      requireJourney(
        Array.isArray(survivingRoundTrip?.books?.items) &&
          survivingRoundTrip.books.items.some((book) => book.bookId === windowCloseBooks.survivingBookId) &&
          survivingRoundTrip.books.items.some((book) => book.bookId === windowCloseBooks.closedBookId) &&
          survivingRoundTrip.route?.kind === 'book' &&
          survivingRoundTrip.route.bookId === windowCloseBooks.survivingBookId,
        'issue-178-surviving-workspace-ipc',
      );
      const reopenedSecondBook = await survivingRenderer.evaluate(
        `window.ai7.openBookWorkbench({kind:'book',bookId:${JSON.stringify(windowCloseBooks.closedBookId)}})`,
      );
      requireJourney(
        reopenedSecondBook?.target === 'new-window' &&
          reopenedSecondBook.route?.kind === 'book' &&
          reopenedSecondBook.route.bookId === windowCloseBooks.closedBookId,
        'issue-178-reopen-closed-book',
      );
      const reopenedBookWindows = await waitForRendererCount(windowManager, 2, 'issue-178-reopened-two-book-windows');
      const reopenedRoutes = await Promise.all(
        reopenedBookWindows.map((item) => item.evaluate(`window.ai7.getBookWorkbenchRoute()`)),
      );
      const retainedSurvivingRenderer = reopenedBookWindows[
        reopenedRoutes.findIndex((route) => route?.kind === 'book' && route.bookId === windowCloseBooks.survivingBookId)
      ];
      const reopenedRenderer = reopenedBookWindows[
        reopenedRoutes.findIndex((route) => route?.kind === 'book' && route.bookId === windowCloseBooks.closedBookId)
      ];
      requireJourney(
        retainedSurvivingRenderer !== undefined &&
          reopenedRenderer !== undefined &&
          retainedSurvivingRenderer.targetId !== reopenedRenderer.targetId,
        'issue-178-unique-reopened-targets',
      );
      const [retainedSurvivingRoute, reopenedRoute] = await Promise.all([
        retainedSurvivingRenderer.evaluate(`window.ai7.getBookWorkbenchRoute()`),
        reopenedRenderer.evaluate(`window.ai7.getBookWorkbenchRoute()`),
      ]);
      requireJourney(
        retainedSurvivingRoute?.kind === 'book' &&
          retainedSurvivingRoute.bookId === windowCloseBooks.survivingBookId &&
          reopenedRoute?.kind === 'book' &&
          reopenedRoute.bookId === windowCloseBooks.closedBookId,
        'issue-178-unique-reopened-route',
      );
      requireJourney(
        (await windowManager.close(reopenedRenderer.targetId)).success === true,
        'issue-178-close-reopened-secondary-target',
      );
      const [finalSurvivingRenderer] = await waitForRendererCount(
        windowManager,
        1,
        'issue-178-final-one-book-window',
      );
      requireJourney(
        finalSurvivingRenderer.targetId === retainedSurvivingRenderer.targetId,
        'issue-178-final-surviving-target',
      );
      const finalSurvivingRoute = await finalSurvivingRenderer.evaluate(`window.ai7.getBookWorkbenchRoute()`);
      requireJourney(
        finalSurvivingRoute?.kind === 'book' &&
          finalSurvivingRoute.bookId === windowCloseBooks.survivingBookId,
        'issue-178-final-surviving-route',
      );
      await closeProduct();
    };

    const emptyBookRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'empty-book-first-import-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: emptyBookRoot, pickerPath: docx, launchScenario: 'empty-book-first-import' });
    const populatedBookId = await runEmptyBookFirstImport(renderer, sample1Expectation, async ({ bookId, title }) => {
      await closeProduct();
      const relaunched = await launchProduct({ dataRoot: emptyBookRoot, launchScenario: 'empty-book-review-recovery' });
      await waitFor(relaunched, `document.querySelector('[data-screen="import-recovery"]')`, 'existing-book-review-recovery');
      await assertRenderer(
        relaunched,
        `(() => { const screen = document.querySelector('[data-screen="import-recovery"]'); return screen?.textContent.includes('导入前复核') && screen.textContent.includes(${JSON.stringify(title)}) && screen.textContent.includes(${JSON.stringify(bookId)}) && screen.textContent.includes('作为首份稿件导入') && Array.from(screen.querySelectorAll('button')).some((button) => button.textContent === '继续导入'); })()`,
        'existing-book-recovery-target-relationship',
      );
      await clickExactButton(relaunched, '继续导入', 'existing-book-recovery-continue');
      await waitFor(relaunched, `document.querySelector('[data-screen="review"]')`, 'existing-book-revalidated-review');
      await assertRenderer(
        relaunched,
        `(() => { const screen = document.querySelector('[data-screen="review"]'); const reviewed = screen?.querySelector('[data-reviewed-book-id]'); return screen?.textContent.includes(${JSON.stringify(title)}) && screen.textContent.includes('作为首份稿件导入') && screen.textContent.includes('manuscript-editorial@1.0.0') && reviewed?.dataset.reviewedBookId === ${JSON.stringify(bookId)} && Array.from(screen.querySelectorAll('button')).some((button) => button.textContent === '按上述降级方式导入为首份稿件'); })()`,
        'existing-book-revalidation-preserves-review',
      );
      return relaunched;
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: emptyBookRoot, pickerPath: docx, launchScenario: 'populated-book-open-before-source' });
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'populated-book-source-landing');
    await assertRenderer(
      renderer,
      `(() => { const button = document.querySelector('[data-screen="landing"] [data-book-id=${JSON.stringify(populatedBookId)}]'); if (!button) return false; button.click(); return true; })()`,
      'populated-book-open-before-source',
    );
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'populated-book-overview-before-source');
    const populatedBefore = await renderer.evaluate(`Array.from(document.querySelectorAll('.record-navigation button[data-record-kind]'), (button) => ({ kind: button.dataset.recordKind, id: button.dataset.recordId }))`);
    const populatedSourceVersionId = populatedBefore.find((record) => record.kind === 'source')?.id;
    requireJourney(
      populatedBefore.length === 6 && /^[0-9a-f-]{36}$/i.test(populatedSourceVersionId ?? ''),
      'populated-book-before-source-records',
    );
    await assertRenderer(
      renderer,
      `(() => { const source = document.querySelector('[data-record-kind="source"]'); if (!source) return false; source.click(); return true; })()`,
      'populated-source-record-before',
    );
    const populatedProvenanceBefore = await renderer.evaluate(`(() => { const labels = Array.from(document.querySelectorAll('.record-detail dt')); return labels.find((item) => item.textContent === '来源记录 ID')?.nextElementSibling?.textContent; })()`);
    await clickExactButton(renderer, '返回图书列表', 'populated-book-return-before-source');
    const populatedReview = await prepareSourceImportReview(renderer, {
      ...sample1Expectation,
      targetBookId: populatedBookId,
      targetManuscriptState: 'populated',
      expectedReuseSourceVersionId: populatedSourceVersionId,
      scenario: 'source-populated-reuse',
    });
    requireJourney(populatedReview.disposition === 'reused-same-book', 'populated-source-reuse-review');
    const populatedSourceResult = await commitPreparedSourceImport(renderer);
    requireJourney(
      populatedSourceResult.bookId === populatedBookId &&
        populatedSourceResult.sourceVersionId === populatedSourceVersionId &&
        populatedSourceResult.provenanceId !== populatedProvenanceBefore,
      'populated-source-reuse-result',
    );
    const populatedAfter = await renderer.evaluate(`Array.from(document.querySelectorAll('.record-navigation button[data-record-kind]'), (button) => ({ kind: button.dataset.recordKind, id: button.dataset.recordId }))`);
    await assertRenderer(
      renderer,
      `document.querySelector('[data-screen="imported"] .book-overview')?.dataset.manuscriptState === 'populated' && !document.body.textContent.includes('创建主稿件、r1、稿件导入记录与工作流程实例。')`,
      'populated-source-completion-state',
    );
    requireJourney(
      populatedAfter.length === 7 &&
        populatedBefore.every((before) => populatedAfter.some((after) => after.kind === before.kind && after.id === before.id)) &&
        populatedAfter.filter((record) => record.kind === 'manuscript').length === 1 &&
        populatedAfter.filter((record) => record.kind === 'revision').length === 1 &&
        populatedAfter.filter((record) => record.kind === 'workflow').length === 1 &&
        populatedAfter.filter((record) => record.kind === 'source-import-record').length === 1,
      'populated-source-preserves-manuscript-graph',
    );
    await closeProduct();

    const sourceRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'source-import-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: sourceRoot, pickerPath: docx, launchScenario: 'source-bound-new' });
    const sourceBoundReview = await prepareSourceImportReview(renderer, { ...sample1Expectation, scenario: 'source-bound-new' });
    requireJourney(
      sourceBoundReview.disposition === 'created' && sourceBoundReview.stableIdentity === `book:${sourceBoundReview.bookId}`,
      'source-bound-new-book-review-identity',
    );
    const sourceBoundResult = await commitPreparedSourceImport(renderer);
    requireJourney(sourceBoundResult.bookId === sourceBoundReview.bookId, 'source-bound-new-book-result');
    const sourceBoundRecords = await renderer.evaluate(`Array.from(document.querySelectorAll('.record-navigation button[data-record-kind]'), (button) => button.dataset.recordKind)`);
    requireJourney(
      JSON.stringify(sourceBoundRecords) === JSON.stringify(['book', 'source', 'source-import-record']) &&
        (await renderer.evaluate(`document.querySelector('[data-screen="imported"] .book-overview')?.dataset.manuscriptState`)) === 'empty',
      'source-bound-zero-manuscript-book',
    );
    await closeProduct();

    renderer = await launchProduct({ dataRoot: sourceRoot, pickerPath: docx, launchScenario: 'source-same-book-reuse' });
    const sameBookReview = await prepareSourceImportReview(renderer, {
      ...sample1Expectation,
      targetBookId: sourceBoundResult.bookId,
      expectedReuseSourceVersionId: sourceBoundResult.sourceVersionId,
      scenario: 'source-same-book-reuse',
    });
    requireJourney(sameBookReview.disposition === 'reused-same-book', 'source-same-book-reuse-review');
    const sameBookResult = await commitPreparedSourceImport(renderer);
    requireJourney(
      sameBookResult.bookId === sourceBoundResult.bookId &&
        sameBookResult.sourceVersionId === sourceBoundResult.sourceVersionId &&
        sameBookResult.sourceImportRecordId !== sourceBoundResult.sourceImportRecordId &&
        sameBookResult.provenanceId !== sourceBoundResult.provenanceId,
      'source-same-book-reuse-result',
    );
    const sameBookKinds = await renderer.evaluate(`Array.from(document.querySelectorAll('.record-navigation button[data-record-kind]'), (button) => button.dataset.recordKind)`);
    requireJourney(
      sameBookKinds.filter((kind) => kind === 'source').length === 1 &&
        sameBookKinds.filter((kind) => kind === 'source-import-record').length === 2,
      'source-same-book-record-counts',
    );
    await clickExactButton(renderer, '返回图书列表', 'source-return-for-empty-book');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'source-returned-for-empty-book');
    await clickExactButton(renderer, '新建图书', 'source-create-empty-book');
    await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, 'source-empty-book-form');
    await assertRenderer(
      renderer,
      `(() => { const title = document.querySelector('#empty-book-title'); const number = document.querySelector('#empty-book-number'); if (!title || !number) return false; title.value = '来源材料现有空图书'; title.dispatchEvent(new Event('input')); number.value = 'SRC-EMPTY-39'; number.dispatchEvent(new Event('input')); return true; })()`,
      'source-empty-book-fields',
    );
    await clickExactButton(renderer, '复核创建', 'source-empty-book-review');
    await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, 'source-empty-book-review-screen');
    await clickExactButton(renderer, '新建图书', 'source-empty-book-commit');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'source-empty-book-overview');
    const sourceEmptyBookId = await renderer.evaluate(`document.querySelector('[data-screen="book-overview"] .book-overview')?.dataset.bookId`);
    requireJourney(/^[0-9a-f-]{36}$/i.test(sourceEmptyBookId ?? ''), 'source-empty-book-id');
    await closeProduct();
    renderer = await launchProduct({ dataRoot: sourceRoot, pickerPath: docx, launchScenario: 'source-empty-cross-book' });
    const crossBookEmptyReview = await prepareSourceImportReview(renderer, {
      ...sample1Expectation,
      targetBookId: sourceEmptyBookId,
      scenario: 'source-empty-cross-book',
    });
    requireJourney(crossBookEmptyReview.disposition === 'created', 'source-empty-cross-book-review');
    await closeProduct();
    renderer = await launchProduct({ dataRoot: sourceRoot, launchScenario: 'source-reviewed-restart' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'source-reviewed-restart');
    await assertRenderer(
      renderer,
      `(() => { const recovery = document.querySelector('[data-screen="import-recovery"]'); return recovery?.textContent.includes('导入前复核') && recovery.textContent.includes('作为来源材料导入') && recovery.textContent.includes(${JSON.stringify(sourceEmptyBookId)}) && Array.from(recovery.querySelectorAll('button')).some((button) => button.textContent === '继续导入'); })()`,
      'source-reviewed-restart-summary',
    );
    await clickExactButton(renderer, '继续导入', 'source-reviewed-restart-continue');
    await waitFor(renderer, `document.querySelector('[data-screen="review"] [data-import-review-kind="source-only"]')`, 'source-reviewed-restart-review');
    const crossBookEmptyResult = await commitPreparedSourceImport(renderer);
    requireJourney(
      crossBookEmptyResult.bookId === sourceEmptyBookId &&
        crossBookEmptyResult.sourceVersionId !== sourceBoundResult.sourceVersionId,
      'source-empty-cross-book-result',
    );
    const crossBookEmptyKinds = await renderer.evaluate(`Array.from(document.querySelectorAll('.record-navigation button[data-record-kind]'), (button) => button.dataset.recordKind)`);
    requireJourney(
      JSON.stringify(crossBookEmptyKinds) === JSON.stringify(['book', 'source', 'source-import-record']),
      'source-empty-cross-book-zero-manuscript',
    );
    await closeProduct();

    renderer = await launchProduct({ dataRoot: sourceRoot, pickerPath: syntheticBPath, launchScenario: 'source-populated-cross-book-import' });
    await runJourney(renderer, { sourceSha256: syntheticBSha256, sourceBytes: syntheticBInfo.size, degraded: false });
    const crossBookPopulatedId = await renderer.evaluate(`document.querySelector('[data-screen="imported"] .book-overview')?.dataset.bookId`);
    const crossBookPopulatedBefore = await renderer.evaluate(`Array.from(document.querySelectorAll('.record-navigation button[data-record-kind]'), (button) => ({ kind: button.dataset.recordKind, id: button.dataset.recordId }))`);
    requireJourney(
      /^[0-9a-f-]{36}$/i.test(crossBookPopulatedId ?? '') && crossBookPopulatedBefore.length === 6,
      'source-populated-cross-book-before',
    );
    await closeProduct();
    renderer = await launchProduct({ dataRoot: sourceRoot, pickerPath: docx, launchScenario: 'source-populated-cross-book-review' });
    const crossBookPopulatedReview = await prepareSourceImportReview(renderer, {
      ...sample1Expectation,
      targetBookId: crossBookPopulatedId,
      targetManuscriptState: 'populated',
      scenario: 'source-populated-cross-book',
    });
    requireJourney(crossBookPopulatedReview.disposition === 'created', 'source-populated-cross-book-review');
    const crossBookPopulatedResult = await commitPreparedSourceImport(renderer);
    requireJourney(
      crossBookPopulatedResult.bookId === crossBookPopulatedId &&
        crossBookPopulatedResult.sourceVersionId !== sourceBoundResult.sourceVersionId,
      'source-populated-cross-book-result',
    );
    const crossBookPopulatedAfter = await renderer.evaluate(`Array.from(document.querySelectorAll('.record-navigation button[data-record-kind]'), (button) => ({ kind: button.dataset.recordKind, id: button.dataset.recordId }))`);
    requireJourney(
      crossBookPopulatedAfter.length === 8 &&
        crossBookPopulatedBefore.every((before) => crossBookPopulatedAfter.some((after) => after.kind === before.kind && after.id === before.id)) &&
        crossBookPopulatedAfter.filter((record) => record.kind === 'manuscript').length === 1 &&
        crossBookPopulatedAfter.filter((record) => record.kind === 'revision').length === 1 &&
        crossBookPopulatedAfter.filter((record) => record.kind === 'workflow').length === 1 &&
        crossBookPopulatedAfter.filter((record) => record.kind === 'source').length === 2 &&
        crossBookPopulatedAfter.filter((record) => record.kind === 'source-import-record').length === 1,
      'source-populated-cross-book-preserves-manuscript-graph',
    );
    await closeProduct();

    const sourceAfterCommitRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'source-after-commit-data'), checkoutRoot);
    renderer = await launchProduct({
      dataRoot: sourceAfterCommitRoot,
      pickerPath: docx,
      importControl: 'legacy-result-json-without-receipt',
      launchScenario: 'source-after-commit-import',
    });
    await prepareSourceImportReview(renderer, { ...sample1Expectation, scenario: 'source-after-commit' });
    await commitPreparedSourceImport(renderer, { expectInterruption: true });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: sourceAfterCommitRoot, launchScenario: 'source-after-commit-recovered' });
    await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'source-after-commit-recovered');
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`,
      'source-after-commit-recovered-acknowledged',
    );
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="imported"]'); const kinds = Array.from(screen?.querySelectorAll('.record-navigation button[data-record-kind]') ?? [], (button) => button.dataset.recordKind); return screen?.textContent.includes('来源材料已导入') && screen.querySelector('[data-view-source-version-id]') && screen.querySelector('[data-view-source-import-record-id]') && JSON.stringify(kinds) === JSON.stringify(['book','source','source-import-record']); })()`,
      'source-after-commit-exact-completion',
    );
    const sourceRecoveredBookId = await renderer.evaluate(`document.querySelector('[data-screen="imported"] .book-overview')?.dataset.bookId`);
    const sourceRecoveredRoute = await renderer.evaluate(`window.ai7.getBookWorkbenchRoute()`);
    requireJourney(
      /^[0-9a-f-]{36}$/i.test(sourceRecoveredBookId ?? '') &&
        sourceRecoveredRoute?.kind === 'book' &&
        sourceRecoveredRoute.bookId === sourceRecoveredBookId,
      'source-after-commit-recovered-exact-route-owned',
    );
    await closeProduct();

    const sourceUncertainRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'source-uncertain-data'), checkoutRoot);
    renderer = await launchProduct({
      dataRoot: sourceUncertainRoot,
      pickerPath: docx,
      importControl: 'uncertain-reconciliation',
      launchScenario: 'source-uncertain-import',
    });
    await prepareSourceImportReview(renderer, { ...sample1Expectation, scenario: 'source-uncertain' });
    await commitPreparedSourceImport(renderer, { expectInterruption: true });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: sourceUncertainRoot, importControl: 'uncertain-reconciliation', launchScenario: 'source-uncertain-recovered' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-uncertain"]')`, 'source-uncertain-recovered');
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-uncertain"]'); const labels = Array.from(screen?.querySelectorAll('button') ?? [], (button) => button.textContent); return screen?.textContent.includes('导入提交结果待确认') && screen.textContent.includes('COMMIT_PROOF_INCONCLUSIVE') && !labels.some((label) => ['继续导入','放弃','复核来源材料导入','新建图书并导入来源材料','导入来源材料到所选图书','取消导入'].includes(label)); })()`,
      'source-uncertain-no-retry-cancel-commit',
    );
    await closeProduct();

    const reimportRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'manuscript-reimport-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: reimportRoot, pickerPath: syntheticAPath, launchScenario: 'reimport-initial' });
    const {
      bookId: reimportBookId,
      lineageSourceVersionId: initialLineageSourceVersionId,
    } = await importInitialManuscriptForReimport(
      renderer,
      syntheticASha256,
      syntheticAInfo.size,
      'reimport',
    );
    await createDurableJournalEdit(renderer);
    await closeProduct();

    renderer = await launchProduct({ dataRoot: reimportRoot, pickerPath: syntheticCPath, launchScenario: 'reimport-verified-changed' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportBookId,
      lineageStatus: 'verified',
      lineageSourceVersionId: initialLineageSourceVersionId,
      expectedReuseSourceVersionId: null,
      changed: true,
      dirtyCheckpoint: true,
      scenario: 'reimport-verified-changed',
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportRoot, launchScenario: 'reimport-reviewed-restart' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'reimport-reviewed-restart');
    await assertRenderer(
      renderer,
      `(() => { const recovery = document.querySelector('[data-screen="import-recovery"]'); return recovery?.textContent.includes('重新导入主稿件') && recovery.textContent.includes(${JSON.stringify(reimportBookId)}) && Array.from(recovery.querySelectorAll('button')).some((button) => button.textContent === '继续导入'); })()`,
      'reimport-reviewed-restart-summary',
    );
    await clickExactButton(renderer, '继续导入', 'reimport-reviewed-restart-continue');
    await waitFor(renderer, `document.querySelector('[data-screen="review"] [data-import-review-kind="reimport"]')`, 'reimport-reviewed-restart-review');
    const verifiedChanged = await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'verified',
      expectedRevisionCount: 3,
      expectedRecordCount: 1,
      scenario: 'reimport-verified-changed',
    });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: reimportRoot, pickerPath: syntheticCPath, launchScenario: 'reimport-verified-no-change' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportBookId,
      lineageStatus: 'verified',
      lineageSourceVersionId: verifiedChanged.sourceVersionId,
      expectedReuseSourceVersionId: verifiedChanged.sourceVersionId,
      changed: false,
      scenario: 'reimport-verified-no-change',
    });
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: false,
      lineageStatus: 'verified',
      expectedRevisionCount: 3,
      expectedRecordCount: 2,
      scenario: 'reimport-verified-no-change',
    });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: reimportRoot, pickerPath: syntheticAPath, launchScenario: 'reimport-unconfirmed-changed' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportBookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: initialLineageSourceVersionId,
      changed: true,
      scenario: 'reimport-unconfirmed-changed',
    });
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 4,
      expectedRecordCount: 3,
      scenario: 'reimport-unconfirmed-changed',
    });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: reimportRoot, pickerPath: syntheticBPath, launchScenario: 'reimport-unconfirmed-no-change' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportBookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: false,
      scenario: 'reimport-unconfirmed-no-change',
    });
    const unconfirmedNoChange = await resolveAndCommitManuscriptReimport(renderer, {
      changed: false,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 4,
      expectedRecordCount: 4,
      scenario: 'reimport-unconfirmed-no-change',
    });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: reimportRoot, pickerPath: syntheticBPath, launchScenario: 'reimport-no-change-lineage' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportBookId,
      lineageStatus: 'verified',
      lineageSourceVersionId: unconfirmedNoChange.sourceVersionId,
      expectedReuseSourceVersionId: unconfirmedNoChange.sourceVersionId,
      changed: false,
      scenario: 'reimport-no-change-lineage',
    });
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: false,
      lineageStatus: 'verified',
      expectedRevisionCount: 4,
      expectedRecordCount: 5,
      scenario: 'reimport-no-change-lineage',
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportRoot, launchScenario: 'reimport-no-change-lineage-restart' });
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'reimport-no-change-lineage-restart');
    await assertRenderer(
      renderer,
      `(() => { const book = document.querySelector('[data-screen="landing"] [data-book-id=${JSON.stringify(reimportBookId)}]'); if (!book) return false; book.click(); return true; })()`,
      'reimport-no-change-lineage-restart-open',
    );
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'reimport-no-change-lineage-restart-overview');
    await assertRenderer(
      renderer,
      `(() => { const overview = document.querySelector('[data-screen="book-overview"]'); const history = overview?.querySelectorAll('[data-record-kind="revision"], [data-record-kind="source-import-record"], [data-record-kind="manuscript-reimport-record"]') ?? []; return history.length === 8 && Boolean(overview.querySelector('[data-book-history-previous]')) && !overview.querySelector('[data-book-history-next]'); })()`,
      'reimport-no-change-lineage-restart-records',
    );
    const latestHistoryIds = await renderer.evaluate(`Array.from(document.querySelectorAll('[data-screen="book-overview"] [data-record-kind="revision"], [data-screen="book-overview"] [data-record-kind="source-import-record"], [data-screen="book-overview"] [data-record-kind="manuscript-reimport-record"]'), (button) => button.dataset.recordId)`);
    await assertRenderer(renderer, `(() => { const older = document.querySelector('[data-book-history-previous]'); if (!older) return false; older.click(); return true; })()`, 'reimport-history-older');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] [data-book-history-next]')`, 'reimport-history-older-page');
    await assertRenderer(
      renderer,
      `(() => { const history = Array.from(document.querySelectorAll('[data-screen="book-overview"] [data-record-kind="revision"], [data-screen="book-overview"] [data-record-kind="source-import-record"], [data-screen="book-overview"] [data-record-kind="manuscript-reimport-record"]')); const prior = new Set(${JSON.stringify(latestHistoryIds)}); return history.length > 0 && history.length <= 8 && history.every((button) => !prior.has(button.dataset.recordId)); })()`,
      'reimport-history-page-replaces',
    );
    await assertRenderer(renderer, `(() => { const newer = document.querySelector('[data-book-history-next]'); if (!newer) return false; newer.click(); return true; })()`, 'reimport-history-newer');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] [data-book-history-previous]') && !document.querySelector('[data-screen="book-overview"] [data-book-history-next]')`, 'reimport-history-roundtrip');
    await assertRenderer(
      renderer,
      `JSON.stringify(Array.from(document.querySelectorAll('[data-screen="book-overview"] [data-record-kind="revision"], [data-screen="book-overview"] [data-record-kind="source-import-record"], [data-screen="book-overview"] [data-record-kind="manuscript-reimport-record"]'), (button) => button.dataset.recordId)) === ${JSON.stringify(JSON.stringify(latestHistoryIds))}`,
      'reimport-history-roundtrip-exact-ids',
    );
    await closeProduct();

    const reimportDegradedRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-degraded-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportDegradedRoot, pickerPath: syntheticAPath, launchScenario: 'reimport-degraded-initial' });
    const reimportDegradedInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticASha256,
      syntheticAInfo.size,
      'reimport-degraded',
    );
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportDegradedRoot, pickerPath: docx, launchScenario: 'reimport-degraded-review' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportDegradedInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      degraded: true,
      scenario: 'reimport-degraded',
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportDegradedRoot, launchScenario: 'reimport-degraded-restart-required' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'reimport-degraded-restart-required');
    await clickExactButton(renderer, '继续导入', 'reimport-degraded-restart-required-continue');
    await waitFor(renderer, `document.querySelector('[data-accept-reimport-degradation]')`, 'reimport-degraded-required-restored');
    await assertRenderer(renderer, `(() => { const review = document.querySelector('[data-import-review-kind="reimport"]'); const values = Object.fromEntries(Array.from(review?.querySelectorAll('dt') ?? [], (label) => [label.textContent, label.nextElementSibling?.textContent])); return /^[0-9a-f-]{36}$/i.test(values['当前固定点修订版 ID'] ?? '') && /^[0-9a-f]{64}$/.test(values['当前固定点修订版摘要'] ?? '') && review?.querySelector('[data-reimport-source-sha256]')?.dataset.reimportSourceSha256 === ${JSON.stringify(SAMPLE1_SHA256)} && review.querySelector('[data-reimport-source-sha256]').dataset.reimportSourceBytes === ${JSON.stringify(String(SAMPLE1_BYTES))}; })()`, 'reimport-degraded-restart-exact-authorities');
    const degradationVersion = await renderer.evaluate(`document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion`);
    await clickExactButton(renderer, '明确接受完整降级集合', 'reimport-degraded-accept');
    await waitFor(renderer, `document.querySelector('[data-import-review-kind="reimport"]')?.dataset.reimportDraftVersion !== ${JSON.stringify(degradationVersion)} && document.querySelector('[data-import-review-kind="reimport"]')?.textContent.includes('已明确接受完整降级集合')`, 'reimport-degraded-accept-persisted');
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportDegradedRoot, launchScenario: 'reimport-degraded-restart-accepted' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'reimport-degraded-restart-accepted');
    await clickExactButton(renderer, '继续导入', 'reimport-degraded-restart-accepted-continue');
    await waitFor(renderer, `document.querySelector('[data-import-review-kind="reimport"]')?.textContent.includes('已明确接受完整降级集合') && !document.querySelector('[data-accept-reimport-degradation]')`, 'reimport-degraded-acceptance-restored');
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      degraded: true,
      scenario: 'reimport-degraded',
    });
    await closeProduct();

    const reimportPagedRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-paged-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportPagedRoot, pickerPath: syntheticPagedBasePath, launchScenario: 'reimport-paged-initial' });
    const reimportPagedInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticPagedBaseSha256,
      syntheticPagedBaseInfo.size,
      'reimport-paged',
    );
    await createDurableJournalEdit(renderer);
    const initialPagedIdentities = await collectEditorBlockIdentities(renderer, 'reimport-paged-initial', false);
    requireJourney(Object.keys(initialPagedIdentities).length === 260, 'reimport-paged-initial-identities');
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportPagedRoot, pickerPath: syntheticPagedChangedPath, launchScenario: 'reimport-paged-review' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportPagedInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      dirtyCheckpoint: true,
      cancelPreparationOnce: true,
      scenario: 'reimport-paged',
    });
    await assertBoundedReimportPageReplacement(renderer, 'reimport-paged');
    await resolvePagedIdentityConsequences(renderer, initialPagedIdentities, 'reimport-paged');
    const reimportPagedCommit = await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 3,
      expectedRecordCount: 1,
      cancelCommitOnce: true,
      scenario: 'reimport-paged',
    });
    const resultingPagedIdentities = await collectEditorBlockIdentities(renderer, 'reimport-paged-result');
    requireJourney(
      Object.keys(resultingPagedIdentities).length === 260 &&
        resultingPagedIdentities['有界内容块 035'] === initialPagedIdentities['有界内容块 035'] &&
        resultingPagedIdentities['有界内容块 002（已编辑）'] === initialPagedIdentities['有界内容块 002'] &&
        !Object.values(initialPagedIdentities).includes(resultingPagedIdentities['明确新增内容块']) &&
        resultingPagedIdentities['有界内容块 030'] === undefined,
      'reimport-paged-identity-consequences',
    );
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportPagedRoot, launchScenario: 'reimport-paged-replay' });
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'reimport-paged-replay-restart');
    const invalidReplayInput = {
      ...reimportPagedCommit.replayInput,
      reviewDigest: `${reimportPagedCommit.replayInput.reviewDigest.startsWith('0') ? '1' : '0'}${reimportPagedCommit.replayInput.reviewDigest.slice(1)}`,
    };
    const invalidReplay = await renderer.evaluate(`window.ai7.commitManuscriptReimport(${JSON.stringify(invalidReplayInput)}).then(()=>({accepted:true}),error=>({accepted:false,code:error?.code}))`);
    requireJourney(
      invalidReplay?.accepted === false && invalidReplay.code === 'COMMIT_REPLAY_INVALID' &&
        (await renderer.evaluate(`window.ai7.getBookWorkbenchRoute()`)) === null,
      'reimport-paged-invalid-replay-left-route-and-cache-unchanged',
    );
    let replayJob = await renderer.evaluate(`window.ai7.commitManuscriptReimport(${JSON.stringify(reimportPagedCommit.replayInput)})`);
    requireJourney(replayJob?.kind === 'reimport-commit' && replayJob.state === 'queued' &&
      replayJob.progress.completed === 0 && replayJob.progress.total > 0,
    'reimport-paged-cache-miss-replay-queued');
    let replayProgress = replayJob.progress.completed;
    while (replayJob.state === 'queued' || replayJob.state === 'running') {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      replayJob = await renderer.evaluate(`window.ai7.pollServiceJob({ jobId: ${JSON.stringify(replayJob.jobId)} })`);
      requireJourney(replayJob.progress.completed >= replayProgress &&
        replayJob.progress.completed <= replayJob.progress.total,
      'reimport-paged-cache-miss-replay-monotonic');
      replayProgress = replayJob.progress.completed;
    }
    requireJourney(replayJob.state === 'completed' && replayJob.progress.completed === replayJob.progress.total &&
      replayJob.result?.reimportRecordId === reimportPagedCommit.reimportRecordId,
    'reimport-paged-cache-miss-replay-exact-receipt');
    for (let replay = 0; replay < 35; replay += 1) {
      const immediate = await renderer.evaluate(`window.ai7.commitManuscriptReimport(${JSON.stringify(reimportPagedCommit.replayInput)})`);
      requireJourney(immediate?.kind === 'reimport-commit' && immediate.state === 'completed' &&
        immediate.progress.completed === 1 && immediate.progress.total === 1 &&
        immediate.result?.reimportRecordId === reimportPagedCommit.reimportRecordId,
      `reimport-paged-cache-hit-replay-${replay}`);
    }
    await closeProduct();

    const reimportRepeatedRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-repeated-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportRepeatedRoot, pickerPath: syntheticRepeatedBasePath, launchScenario: 'reimport-repeated-initial' });
    const reimportRepeatedInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticRepeatedBaseSha256,
      syntheticRepeatedBaseInfo.size,
      'reimport-repeated',
    );
    await createDurableJournalEdit(renderer);
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportRepeatedRoot, pickerPath: syntheticRepeatedChangedPath, launchScenario: 'reimport-repeated-review' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportRepeatedInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      dirtyCheckpoint: true,
      cancelPreparationOnce: true,
      scenario: 'reimport-repeated',
    });
    await assertRenderer(
      renderer,
      `(() => { const review = document.querySelector('[data-import-review-kind="reimport"]'); const page = review?.querySelector('[data-reimport-mappings="ready"]'); return review?.textContent.includes('521 个位置 · 521 个未解决') && Number(page?.dataset.reimportPageItemCount) === 4 && page.querySelectorAll('[data-reimport-mapping-id]').length === 4; })()`,
      'reimport-repeated-cooperative-exact-mappings',
    );
    await closeProduct();

    const reimportAmbiguousRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-ambiguous-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportAmbiguousRoot, pickerPath: syntheticAmbiguousBasePath, launchScenario: 'reimport-ambiguous-initial' });
    const reimportAmbiguousInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticAmbiguousBaseSha256,
      syntheticAmbiguousBaseInfo.size,
      'reimport-ambiguous',
    );
    const initialAmbiguousIdentities = await collectEditorBlockIdentitySequence(renderer, 'reimport-ambiguous-initial');
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportAmbiguousRoot, pickerPath: syntheticAmbiguousReimportPath, launchScenario: 'reimport-ambiguous-review' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportAmbiguousInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      scenario: 'reimport-ambiguous',
    });
    await resolveAmbiguousIdentitiesAsNoChange(renderer, initialAmbiguousIdentities, 'reimport-ambiguous');
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: false,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 1,
      expectedRecordCount: 1,
      scenario: 'reimport-ambiguous',
    });
    const resultingAmbiguousIdentities = await collectEditorBlockIdentitySequence(renderer, 'reimport-ambiguous-result');
    requireJourney(
      JSON.stringify(resultingAmbiguousIdentities) === JSON.stringify(initialAmbiguousIdentities),
      'reimport-ambiguous-no-empty-revision-and-identities-preserved',
    );
    await closeProduct();

    let reimportTamperRejected = false;
    let reimportTamperProductCarrierAttached = false;
    try {
      renderer = await launchProduct({
        dataRoot: reimportPagedRoot,
        importControl: 'tamper-reimport-proof-before-validation',
        launchScenario: 'reimport-tamper-proof',
      });
      reimportTamperProductCarrierAttached = true;
      await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true'`, 'reimport-tamper-must-not-start');
    } catch (error) {
      if (
        isBrowserLaunchTimeout(error) ||
        reimportTamperProductCarrierAttached ||
        error !== BROWSER_DISCONNECTED
      ) {
        throw error;
      }
      browser = undefined;
      reimportTamperRejected = true;
    }
    await closeOwnedBrowser();
    requireJourney(reimportTamperRejected, 'reimport-tamper-startup-fail-closed');

    const reimportBeforeCommitRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-before-commit-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportBeforeCommitRoot, pickerPath: syntheticAPath, launchScenario: 'reimport-before-commit-initial' });
    const reimportBeforeCommitInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticASha256,
      syntheticAInfo.size,
      'reimport-before-commit',
    );
    await closeProduct();
    renderer = await launchProduct({
      dataRoot: reimportBeforeCommitRoot,
      pickerPath: syntheticCPath,
      importControl: 'before-commit',
      launchScenario: 'reimport-before-commit-interruption',
    });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportBeforeCommitInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      scenario: 'reimport-before-commit',
    });
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      scenario: 'reimport-before-commit',
      expectInterruption: true,
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportBeforeCommitRoot, launchScenario: 'reimport-before-commit-recovery' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'reimport-before-commit-recovery');
    await assertRenderer(
      renderer,
      `(() => { const recovery = document.querySelector('[data-screen="import-recovery"]'); const labels = Array.from(recovery?.querySelectorAll('button') ?? [], (button) => button.textContent); return recovery?.textContent.includes('重新导入主稿件') && recovery.textContent.includes('已持久化提交尝试，尚未证明提交') && labels.includes('继续导入'); })()`,
      'reimport-before-commit-proven-uncommitted',
    );
    await clickExactButton(renderer, '继续导入', 'reimport-before-commit-continue');
    await waitFor(renderer, `document.querySelector('[data-screen="review"] [data-import-review-kind="reimport"]')`, 'reimport-before-commit-review');
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      scenario: 'reimport-before-commit-retry',
    });
    await closeProduct();

    const reimportAfterCommitRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-after-commit-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportAfterCommitRoot, pickerPath: syntheticAPath, launchScenario: 'reimport-after-commit-initial' });
    const reimportAfterCommitInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticASha256,
      syntheticAInfo.size,
      'reimport-after-commit',
    );
    await closeProduct();
    renderer = await launchProduct({
      dataRoot: reimportAfterCommitRoot,
      pickerPath: syntheticCPath,
      importControl: 'legacy-result-json-without-receipt',
      launchScenario: 'reimport-after-commit-interruption',
    });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportAfterCommitInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      scenario: 'reimport-after-commit',
    });
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      scenario: 'reimport-after-commit',
      expectInterruption: true,
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportAfterCommitRoot, launchScenario: 'reimport-after-commit-recovery' });
    await assertCommittedManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      scenario: 'reimport-after-commit-recovered',
    });
    await closeProduct();

    const reimportUncertainRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-uncertain-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportUncertainRoot, pickerPath: syntheticAPath, launchScenario: 'reimport-uncertain-initial' });
    const reimportUncertainInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticASha256,
      syntheticAInfo.size,
      'reimport-uncertain',
    );
    await closeProduct();
    renderer = await launchProduct({
      dataRoot: reimportUncertainRoot,
      pickerPath: syntheticCPath,
      importControl: 'uncertain-reconciliation',
      launchScenario: 'reimport-uncertain-interruption',
    });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportUncertainInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      scenario: 'reimport-uncertain',
    });
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      scenario: 'reimport-uncertain',
      expectInterruption: true,
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportUncertainRoot, importControl: 'uncertain-reconciliation', launchScenario: 'reimport-uncertain-recovery' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-uncertain"]')`, 'reimport-uncertain-recovered');
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-uncertain"]'); const labels = Array.from(screen?.querySelectorAll('button') ?? [], (button) => button.textContent); return screen?.textContent.includes('导入提交结果待确认') && screen.textContent.includes('COMMIT_PROOF_INCONCLUSIVE') && !screen.querySelector('[data-record-kind="manuscript-reimport-record"]') && !labels.some((label) => ['继续导入','放弃','提交稿件重新导入','记录未发现稿件变化','取消导入'].includes(label)); })()`,
      'reimport-uncertain-no-retry-cancel-commit',
    );
    await closeProduct();

    const reimportPathLossRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-source-path-loss-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportPathLossRoot, pickerPath: syntheticAPath, launchScenario: 'reimport-path-loss-initial' });
    const reimportPathLossInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticASha256,
      syntheticAInfo.size,
      'reimport-path-loss',
    );
    await closeProduct();
    const reimportPathLossInputRoot = resolve(runRoot, 'reimport-path-loss-input');
    await mkdir(reimportPathLossInputRoot);
    const reimportPathLossInput = resolve(reimportPathLossInputRoot, 'one-time-reimport.docx');
    await copyFile(syntheticCPath, reimportPathLossInput);
    requireJourney(
      (await realpath(reimportPathLossInput)) === reimportPathLossInput &&
        (await digestFile(reimportPathLossInput)) === syntheticCSha256,
      'reimport-path-loss-input-identity',
    );
    renderer = await launchProduct({ dataRoot: reimportPathLossRoot, pickerPath: reimportPathLossInput, launchScenario: 'reimport-path-loss-review' });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportPathLossInitial.bookId,
      lineageStatus: 'verified',
      lineageSourceVersionId: reimportPathLossInitial.lineageSourceVersionId,
      expectedReuseSourceVersionId: null,
      changed: true,
      scenario: 'reimport-path-loss',
    });
    const reimportPathLossProof = await manuscriptReimportReviewProof(renderer, 'reimport-path-loss');
    await closeProduct();
    await rm(reimportPathLossInput, { force: true });
    requireJourney(!existsSync(reimportPathLossInput), 'reimport-path-loss-input-removed');
    renderer = await launchProduct({ dataRoot: reimportPathLossRoot, launchScenario: 'reimport-path-loss-recovery' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'reimport-path-loss-recovery');
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-recovery"]'); const labels = Array.from(screen?.querySelectorAll('button') ?? [], (button) => button.textContent); return screen?.textContent.includes('完整暂存快照') && screen.textContent.includes('原始所选文件已无法访问') && screen.textContent.includes('重新导入主稿件') && labels.includes('继续导入') && labels.includes('放弃') && !labels.includes('重新选择原文件'); })()`,
      'reimport-path-loss-complete-snapshot',
    );
    await clickExactButton(renderer, '继续导入', 'reimport-path-loss-continue');
    await waitFor(renderer, `document.querySelector('[data-screen="review"] [data-import-review-kind="reimport"]')`, 'reimport-path-loss-review-restored');
    const restoredReimportPathLossProof = await manuscriptReimportReviewProof(renderer, 'reimport-path-loss-restored');
    requireJourney(
      JSON.stringify(restoredReimportPathLossProof) === JSON.stringify(reimportPathLossProof),
      'reimport-path-loss-exact-review-restored',
    );
    await assertRenderer(
      renderer,
      `document.querySelector('.recovery-notice')?.textContent.includes('不会从原路径读取或替换暂存内容')`,
      'reimport-path-loss-staged-snapshot-authority',
    );
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'verified',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      scenario: 'reimport-path-loss',
    });
    await closeProduct();

    const reimportReselectionRoot = await createCanonicalExternalDataRoot(
      resolve(runRoot, 'reimport-staged-object-loss-data'),
      checkoutRoot,
    );
    renderer = await launchProduct({ dataRoot: reimportReselectionRoot, pickerPath: syntheticAPath, launchScenario: 'reimport-reselection-initial' });
    const reimportReselectionInitial = await importInitialManuscriptForReimport(
      renderer,
      syntheticASha256,
      syntheticAInfo.size,
      'reimport-reselection',
    );
    await closeProduct();
    renderer = await launchProduct({
      dataRoot: reimportReselectionRoot,
      pickerPath: syntheticCPath,
      importControl: 'before-commit',
      launchScenario: 'reimport-reselection-interruption',
    });
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportReselectionInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      scenario: 'reimport-reselection',
    });
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      scenario: 'reimport-reselection',
      expectInterruption: true,
    });
    await closeProduct();
    const lostReimportObject = resolve(
      reimportReselectionRoot,
      'objects',
      'sha256',
      syntheticCSha256.slice(0, 2),
      `${syntheticCSha256}.docx`,
    );
    requireJourney((await lstat(lostReimportObject)).isFile(), 'reimport-reselection-object-before-loss');
    await rm(lostReimportObject, { force: true });
    requireJourney(!existsSync(lostReimportObject), 'reimport-reselection-object-removed');
    renderer = await launchProduct({ dataRoot: reimportReselectionRoot, pickerPath: syntheticBPath, launchScenario: 'reimport-reselection-required' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'reimport-reselection-required');
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-recovery"]'); const labels = Array.from(screen?.querySelectorAll('button') ?? [], (button) => button.textContent); return screen?.textContent.includes('暂存不完整或损坏') && screen.textContent.includes('已持久化提交尝试，尚未证明提交') && labels.includes('重新选择原文件') && labels.includes('放弃') && !labels.includes('继续导入'); })()`,
      'reimport-reselection-only-safe-actions',
    );
    await clickExactButton(renderer, '重新选择原文件', 'reimport-reselection-mismatch');
    await waitFor(renderer, `document.querySelector('[data-screen="error"]')`, 'reimport-reselection-mismatch-rejected');
    await assertRenderer(
      renderer,
      `document.querySelector('.error-panel')?.textContent.includes('重选文件与原暂存来源身份不一致') && !document.querySelector('[data-screen="imported"]')`,
      'reimport-reselection-mismatch-no-authority-change',
    );
    await closeProduct();
    renderer = await launchProduct({ dataRoot: reimportReselectionRoot, pickerPath: syntheticCPath, launchScenario: 'reimport-reselection-preserved' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'reimport-reselection-preserved');
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-recovery"]'); const labels = Array.from(screen?.querySelectorAll('button') ?? [], (button) => button.textContent); return screen?.textContent.includes('已持久化提交尝试，尚未证明提交') && labels.includes('重新选择原文件') && !labels.includes('继续导入'); })()`,
      'reimport-reselection-mismatch-recovery-preserved',
    );
    await clickExactButton(renderer, '重新选择原文件', 'reimport-reselection-exact');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'reimport-reselection-target-reset');
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="target"]'); const notice = screen?.querySelector('.recovery-notice')?.textContent ?? ''; return Boolean(screen) && !screen.querySelector('input:checked') && !screen.querySelector('[data-commit-manuscript-reimport]') && !screen.querySelector('[data-import-review-kind="reimport"]') && notice.includes('请重新确认全部决定'); })()`,
      'reimport-reselection-old-authority-invalidated',
    );
    await prepareManuscriptReimportReview(renderer, {
      targetBookId: reimportReselectionInitial.bookId,
      lineageStatus: 'unconfirmed',
      expectedReuseSourceVersionId: null,
      changed: true,
      start: 'target',
      scenario: 'reimport-reselection-new-review',
    });
    await resolveAndCommitManuscriptReimport(renderer, {
      changed: true,
      lineageStatus: 'unconfirmed',
      expectedRevisionCount: 2,
      expectedRecordCount: 1,
      scenario: 'reimport-reselection-new-review',
    });
    await closeProduct();

    const continuityRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'continuity-data'), checkoutRoot);
    const selectedRoot = resolve(runRoot, 'selected-input');
    await mkdir(selectedRoot);
    const selectedCopy = resolve(selectedRoot, 'sample1.docx');
    await copyFile(docx, selectedCopy);
    requireJourney((await realpath(selectedCopy)) === selectedCopy, 'selected-copy-identity');

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: selectedCopy, launchScenario: 'restart-before-review' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'restart-before-review-landing',
    );
    await clickExactButton(renderer, '导入稿件', 'restart-before-review-stage');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'restart-before-review-target');
    await closeProduct();
    await rm(selectedCopy, { force: true });

    renderer = await launchProduct({ dataRoot: continuityRoot, launchScenario: 'path-loss-recovery' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="import-recovery"]')`,
      'path-loss-recovery',
    );
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-recovery"]'); const labels = Array.from(screen?.querySelectorAll('button') ?? [], (button) => button.textContent); return screen?.textContent.includes('完整暂存快照') && screen.textContent.includes('原始所选文件已无法访问') && labels.includes('继续导入') && labels.includes('放弃') && !screen.querySelector('input:checked'); })()`,
      'path-loss-recovery-unselected',
    );
    await clickExactButton(renderer, '继续导入', 'path-loss-continue');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'path-loss-target');
    await assertRenderer(
      renderer,
      `document.querySelector('.recovery-notice')?.textContent.includes('不会从原路径读取或替换暂存内容')`,
      'path-loss-snapshot-disclosure',
    );
    await runJourney(
      renderer,
      { ...sample1Expectation, exerciseEditor: true },
      { start: 'target', diagnosticReviewLocation: 'continuity-review' },
    );
    await closeProduct();

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: docx, launchScenario: 'continuity-exact-sample' });
    await runJourney(renderer, exactSample1Expectation, { diagnosticReviewLocation: 'continuity-review' });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: syntheticAPath, launchScenario: 'continuity-synthetic-a' });
    await runJourney(renderer, syntheticAExpectation, {
      stopAfterAcceptedReview: true,
      diagnosticReviewLocation: 'continuity-review',
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: continuityRoot, launchScenario: 'continuity-identity-review-recovery' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="import-recovery"]')`,
      'identity-review-recovery',
    );
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-recovery"]'); return screen?.textContent.includes('导入前复核') && screen.textContent.includes('新建图书（作为不同作品）') && Array.from(screen.querySelectorAll('button')).some((button) => button.textContent === '继续导入'); })()`,
      'identity-review-recovery-boundary',
    );
    await clickExactButton(renderer, '继续导入', 'identity-review-continue');
    await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'identity-review-restored');
    await assertRenderer(
      renderer,
      `document.querySelector('.recovery-notice')?.textContent.includes('已重新校验完整暂存快照')`,
      'identity-review-revalidated',
    );
    await runJourney(renderer, syntheticAExpectation, {
      start: 'accepted-review',
      diagnosticReviewLocation: 'continuity-review',
    });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: syntheticBPath, launchScenario: 'continuity-synthetic-b' });
    await runJourney(renderer, syntheticBExpectation, { diagnosticReviewLocation: 'continuity-review' });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: docx, launchScenario: 'abandon-stage' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'abandon-stage-landing',
    );
    await clickExactButton(renderer, '导入稿件', 'abandon-stage-click');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'abandon-stage-target');
    await closeProduct();
    renderer = await launchProduct({ dataRoot: continuityRoot, launchScenario: 'abandon-recovery' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'abandon-recovery');
    await clickExactButton(renderer, '放弃', 'abandon-explicit');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'abandon-landing');
    const sharedObject = resolve(
      continuityRoot,
      'objects',
      'sha256',
      SAMPLE1_SHA256.slice(0, 2),
      `${SAMPLE1_SHA256}.docx`,
    );
    const sharedObjectInfo = await lstat(sharedObject);
    requireJourney(sharedObjectInfo.isFile() && sharedObjectInfo.size === SAMPLE1_BYTES, 'abandon-shared-object-reference');
    await closeProduct();

    const legacyReviewRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'legacy-reviewed-data'), checkoutRoot);
    renderer = await launchProduct({
      dataRoot: legacyReviewRoot,
      pickerPath: docx,
      importControl: 'legacy-reviewed-v2',
      launchScenario: 'legacy-review-initial',
    });
    await runJourney(renderer, sample1Expectation, {
      stopAfterAcceptedReview: true,
      diagnosticReviewLocation: 'legacy-review',
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: legacyReviewRoot, launchScenario: 'legacy-review-recovery' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="import-recovery"]')`,
      'legacy-review-recovery',
    );
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-recovery"]'); return screen?.textContent.includes('上次完成位置') && screen.textContent.includes('导入前复核') && !screen.textContent.includes('已复核目标') && Array.from(screen.querySelectorAll('button')).some((button) => button.textContent === '继续导入'); })()`,
      'legacy-review-recovered-without-authority',
    );
    await clickExactButton(renderer, '继续导入', 'legacy-review-continue');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'legacy-review-invalidated');
    await assertRenderer(
      renderer,
      `document.querySelector('.recovery-notice')?.textContent.includes('旧复核已失效') && !Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '按上述降级方式新建图书并导入稿件')`,
      'legacy-review-requires-v4-rereview',
    );
    await runJourney(renderer, sample1Expectation, {
      start: 'target',
      diagnosticReviewLocation: 'legacy-review',
    });
    await closeProduct();

    const beforePaintRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'before-paint-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: beforePaintRoot, pickerPath: docx, launchScenario: 'before-paint-initial' });
    await runJourney(renderer, sample1Expectation, {
      holdCompletionPaint: true,
      diagnosticReviewLocation: 'before-paint-review',
    });
    // Issue #47 / nearest supported Journey J-01: import completion acknowledgement must settle
    // before the ancillary Task authorization inspection/card settles.
    at('completion-visibility-transition');
    await waitFor(
      renderer,
      `document.querySelector('[data-native-artifact-state]')`,
      'completion-pre-ack-artifact-inspection-settled',
    );
    await assertRenderer(
      renderer,
      `(async () => { await new Promise((resolveWait) => setTimeout(resolveWait, 0)); return Boolean(document.querySelector('[data-task-authorization-book-id]')) && !document.querySelector('[data-task-authorization-state]') && document.documentElement.dataset.ai7ImportCompletionPainted === undefined && document.documentElement.dataset.ai7ImportCompletionAcknowledged === undefined; })()`,
      'completion-defers-task-authorization-inspection',
    );
    // Issue #178 / nearest supported Journey J-01: a visible imported result must reject a
    // frame pair crossed by a hidden interval and must not acknowledge an obsolete screen/commit.
    await assertRenderer(
      renderer,
      `(() => { const frame = globalThis.__ai7HeldCompletionFrames?.shift(); if (typeof frame?.callback !== 'function') return false; frame.callback(performance.now()); return true; })()`,
      'completion-visibility-first-frame',
    );
    await waitFor(
      renderer,
      `globalThis.__ai7HeldCompletionFrames?.length === 1`,
      'completion-visibility-second-frame-held',
    );
    await assertRenderer(
      renderer,
      `(async () => {
        const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
        if (descriptor?.configurable !== true || typeof descriptor.get !== 'function') return false;
        const pendingFrameId = globalThis.__ai7HeldCompletionFrames?.[0]?.id;
        if (typeof pendingFrameId !== 'number') return false;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise((resolveWait) => setTimeout(resolveWait, 0));
        const pendingFrameCancelled = globalThis.__ai7HeldCompletionFrames?.length === 0;
        globalThis.__ai7CancelledCompletionFrameId = pendingFrameId;
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
        delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
        return pendingFrameCancelled && document.visibilityState === 'visible' &&
          document.documentElement.dataset.ai7ImportCompletionPainted === undefined &&
          document.documentElement.dataset.ai7ImportCompletionAcknowledged === undefined;
      })()`,
      'completion-visibility-cancels-stalled-frame',
    );
    await waitFor(
      renderer,
      `globalThis.__ai7HeldCompletionFrames?.length === 1 && globalThis.__ai7HeldCompletionFrames[0].id !== globalThis.__ai7CancelledCompletionFrameId && document.documentElement.dataset.ai7ImportCompletionPainted === undefined && document.documentElement.dataset.ai7ImportCompletionAcknowledged === undefined`,
      'completion-visibility-restarts-two-frame-proof',
    );
    await assertRenderer(
      renderer,
      `(() => { const frame = globalThis.__ai7HeldCompletionFrames?.shift(); if (typeof frame?.callback !== 'function') return false; frame.callback(performance.now()); return true; })()`,
      'completion-presentation-retry-first-frame',
    );
    await waitFor(
      renderer,
      `globalThis.__ai7HeldCompletionFrames?.length === 1`,
      'completion-presentation-retry-second-frame-held',
    );
    await assertRenderer(
      renderer,
      `(async () => {
        const frames = globalThis.__ai7HeldCompletionFrames;
        const screen = document.querySelector('#screen');
        const commit = screen?.querySelector('[data-import-commit-id]');
        const commitId = commit?.dataset.importCommitId;
        if (!screen || !commitId || frames?.length !== 1) return false;
        screen.dataset.screen = 'review';
        screen.dataset.screen = 'imported';
        commit.dataset.importCommitId = 'obsolete-completion-presentation';
        commit.dataset.importCommitId = commitId;
        await new Promise((resolveWait) => setTimeout(resolveWait, 0));
        const valid = screen.dataset.screen === 'imported' && commit.dataset.importCommitId === commitId &&
          frames.length === 0 && document.documentElement.dataset.ai7ImportCompletionPainted === undefined &&
          document.documentElement.dataset.ai7ImportCompletionAcknowledged === undefined;
        if (globalThis.__ai7HeldCompletionOriginalAnimationFrame) {
          globalThis.requestAnimationFrame = globalThis.__ai7HeldCompletionOriginalAnimationFrame;
        }
        if (globalThis.__ai7HeldCompletionOriginalCancelAnimationFrame) {
          globalThis.cancelAnimationFrame = globalThis.__ai7HeldCompletionOriginalCancelAnimationFrame;
        }
        delete globalThis.__ai7HeldCompletionOriginalAnimationFrame;
        delete globalThis.__ai7HeldCompletionOriginalCancelAnimationFrame;
        delete globalThis.__ai7CancelledCompletionFrameId;
        delete globalThis.__ai7HeldCompletionFrames;
        return valid;
      })()`,
      'completion-obsolete-presentation-not-acknowledged',
    );
    await closeProduct();
    renderer = await launchProduct({ dataRoot: beforePaintRoot, launchScenario: 'before-paint-recovery' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="imported"]')`,
      'before-paint-completion-recovered',
    );
    await assertRenderer(
      renderer,
      `document.querySelector('[data-screen="imported"]')?.textContent.includes('稿件已导入')`,
      'before-paint-exact-completion',
    );
    await waitFor(
      renderer,
      `document.visibilityState === 'visible' && document.documentElement.dataset.ai7ImportCompletionPainted === 'true' && document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true' && Boolean(document.querySelector('[data-task-authorization-state]'))`,
      'before-paint-recovery-acknowledged',
    );
    await closeProduct();

    const abandonFailureRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'abandon-failure-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: abandonFailureRoot, pickerPath: docx, launchScenario: 'abandon-failure-stage' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'abandon-failure-stage-landing',
    );
    await clickExactButton(renderer, '导入稿件', 'abandon-failure-stage-click');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'abandon-failure-stage-target');
    await closeProduct();
    const abandonFailureObject = resolve(
      abandonFailureRoot,
      'objects',
      'sha256',
      SAMPLE1_SHA256.slice(0, 2),
      `${SAMPLE1_SHA256}.docx`,
    );
    renderer = await launchProduct({
      dataRoot: abandonFailureRoot,
      importControl: 'abandon-object-delete-failure',
      launchScenario: 'abandon-failure-interruption',
    });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'abandon-failure-recovery');
    await clickExactButton(renderer, '放弃', 'abandon-failure-explicit');
    await waitFor(renderer, `document.querySelector('[data-screen="error"]')`, 'abandon-failure-error');
    await assertRenderer(
      renderer,
      `document.querySelector('.error-panel')?.textContent.includes('持久放弃清理意图与导入草稿仍保留') && !document.querySelector('[data-screen="landing"]')`,
      'abandon-failure-no-false-success',
    );
    requireJourney(existsSync(abandonFailureObject), 'abandon-failure-object-preserved');
    await clickExactButton(renderer, '重新开始', 'abandon-failure-retry-startup');
    await waitFor(renderer, `document.querySelector('[data-screen="import-cleanup"]')`, 'abandon-failure-authority-recovered');
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-cleanup"]'); const buttons = Array.from(screen?.querySelectorAll('button') ?? [], (button) => button.textContent); return screen?.textContent.includes('放弃意图已经持久化') && screen.textContent.includes('ABANDON_CLEANUP_PENDING') && buttons.includes('重试放弃清理') && !buttons.some((label) => ['继续导入','重新选择原文件','放弃'].includes(label)); })()`,
      'abandon-failure-intent-preserved',
    );
    await clickExactButton(renderer, '重试放弃清理', 'abandon-failure-repeat');
    await waitFor(renderer, `document.querySelector('[data-screen="error"]')`, 'abandon-failure-repeat-error');
    await assertRenderer(
      renderer,
      `document.querySelector('.error-panel')?.textContent.includes('持久放弃清理意图与导入草稿仍保留') && !document.querySelector('[data-screen="landing"]')`,
      'abandon-failure-repeat-no-false-success',
    );
    await closeProduct();
    renderer = await launchProduct({ dataRoot: abandonFailureRoot, launchScenario: 'abandon-failure-retry' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'abandon-retry-finalized',
    );
    requireJourney(!existsSync(abandonFailureObject), 'abandon-retry-unshared-object-removed');
    await closeProduct();

    const abandonInterruptionRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'abandon-interruption-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: abandonInterruptionRoot, pickerPath: docx, launchScenario: 'abandon-interruption-stage' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'abandon-interruption-stage-landing',
    );
    await clickExactButton(renderer, '导入稿件', 'abandon-interruption-stage-click');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'abandon-interruption-stage-target');
    await closeProduct();
    const interruptedAbandonObject = resolve(
      abandonInterruptionRoot,
      'objects',
      'sha256',
      SAMPLE1_SHA256.slice(0, 2),
      `${SAMPLE1_SHA256}.docx`,
    );
    renderer = await launchProduct({
      dataRoot: abandonInterruptionRoot,
      importControl: 'after-abandon-object-delete-before-finalize',
      launchScenario: 'abandon-interruption-interruption',
    });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'abandon-interruption-recovery');
    await clickExactButton(renderer, '放弃', 'abandon-interruption-explicit');
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ServiceState === 'interrupted'`,
      'abandon-interruption-visible',
    );
    await assertRenderer(renderer, `!document.querySelector('[data-screen="landing"]')`, 'abandon-interruption-no-success');
    requireJourney(!existsSync(interruptedAbandonObject), 'abandon-interruption-object-removed');
    await closeProduct();
    renderer = await launchProduct({ dataRoot: abandonInterruptionRoot, pickerPath: docx, launchScenario: 'abandon-interruption-retry' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'abandon-interruption-finalized-on-restart',
    );
    requireJourney(!existsSync(interruptedAbandonObject), 'abandon-interruption-authority-finalized');
    await clickExactButton(renderer, '导入稿件', 'abandon-interruption-restage');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'abandon-interruption-reference-unblocked');
    requireJourney(existsSync(interruptedAbandonObject), 'abandon-interruption-object-reactivated');
    await clickExactButton(renderer, '取消导入', 'abandon-interruption-restage-cancel');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'abandon-interruption-restage-cleaned');
    requireJourney(!existsSync(interruptedAbandonObject), 'abandon-interruption-restage-object-cleaned');
    await closeProduct();

    const beforeCommitRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'before-commit-data'), checkoutRoot);
    renderer = await launchProduct({
      dataRoot: beforeCommitRoot,
      pickerPath: docx,
      importControl: 'before-commit',
      launchScenario: 'before-commit-initial',
    });
    await runJourney(renderer, sample1Expectation, {
      expectInterruption: true,
      diagnosticReviewLocation: 'before-commit-review',
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: beforeCommitRoot, launchScenario: 'before-commit-recovery' });
    await waitFor(renderer, `document.querySelector('[data-screen="import-recovery"]')`, 'before-commit-recovery');
    await assertRenderer(
      renderer,
      `document.querySelector('[data-screen="import-recovery"]')?.textContent.includes('已持久化提交尝试，尚未证明提交') && Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '继续导入')`,
      'before-commit-proven-uncommitted',
    );
    await clickExactButton(renderer, '继续导入', 'before-commit-continue');
    await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'before-commit-review');
    await assertRenderer(
      renderer,
      `document.querySelector('.recovery-notice')?.textContent.includes('已重新校验完整暂存快照')`,
      'before-commit-review-revalidated',
    );
    await runJourney(renderer, sample1Expectation, {
      start: 'accepted-review',
      diagnosticReviewLocation: 'before-commit-review',
    });
    await closeProduct();

    const afterCommitRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'after-commit-data'), checkoutRoot);
    renderer = await launchProduct({
      dataRoot: afterCommitRoot,
      pickerPath: docx,
      importControl: 'after-commit-before-response',
      launchScenario: 'after-commit-initial',
    });
    await runJourney(renderer, sample1Expectation, {
      expectInterruption: true,
      diagnosticReviewLocation: 'after-commit-review',
    });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: afterCommitRoot, launchScenario: 'after-commit-recovery' });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="imported"]')`,
      'after-commit-completion-recovered',
    );
    await assertRenderer(
      renderer,
      `document.querySelector('[data-screen="imported"]')?.textContent.includes('稿件已导入') && !document.body.textContent.includes('导入提交结果待确认')`,
      'after-commit-exact-completion',
    );
    await waitFor(
      renderer,
      `document.visibilityState === 'visible' && document.documentElement.dataset.ai7ProductReady === 'true' && document.documentElement.dataset.ai7ImportCompletionPainted === 'true' && document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true' && Boolean(document.querySelector('[data-screen="imported"] [data-import-commit-id]'))`,
      'after-commit-completion-acknowledged',
    );
    await closeProduct();

    const uncertainRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'uncertain-data'), checkoutRoot);
    renderer = await launchProduct({
      dataRoot: uncertainRoot,
      pickerPath: docx,
      importControl: 'uncertain-reconciliation',
      launchScenario: 'uncertain-initial',
    });
    await runJourney(renderer, sample1Expectation, {
      expectInterruption: true,
      diagnosticReviewLocation: 'uncertain-review',
    });
    await closeProduct();
    renderer = await launchProduct({
      dataRoot: uncertainRoot,
      importControl: 'uncertain-reconciliation',
      launchScenario: 'uncertain-recovery',
    });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="import-uncertain"]')`,
      'uncertain-reconciliation',
    );
    await assertRenderer(
      renderer,
      `(() => { const screen = document.querySelector('[data-screen="import-uncertain"]'); const buttons = Array.from(screen?.querySelectorAll('button') ?? [], (button) => button.textContent); return screen?.textContent.includes('导入提交结果待确认') && screen.textContent.includes('COMMIT_PROOF_INCONCLUSIVE') && screen.textContent.includes('阻止重试、放弃和暂存清理') && !buttons.some((label) => ['继续导入','放弃','新建图书并导入稿件','按上述降级方式新建图书并导入稿件'].includes(label)); })()`,
      'uncertain-fail-closed',
    );
    await closeProduct();

    // Keep the observed-bug regression terminal so its deliberate multi-window lifecycle cannot
    // influence unrelated J-01 import/recovery scenarios on either supported desktop platform.
    await runIssue178WindowCloseRegression();
  } finally {
    try {
      await cancellation.cleanup();
    } finally {
      cancellation.dispose();
    }
  }
}

main().catch((error) => {
  reportJourneyFailure('J-01', diagnosticLocation, error);
  if (browserLifecycleIncomplete) process.stderr.write('', () => process.exit(1));
});
