import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const SAMPLE1_BYTES = 29_550;
const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
let diagnosticLocation = 'entry';
let electronExecutable;

function at(location) {
  diagnosticLocation = location;
}

function requireJourney(condition, location) {
  if (!condition) throw new Error(`J-01/${location}`);
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
    !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())),
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
  const rootSession = await browser.newBrowserCDPSession();
  const deadline = Date.now() + 30_000;
  let pageTarget;
  while (Date.now() < deadline) {
    const { targetInfos } = await rootSession.send('Target.getTargets');
    const pages = targetInfos.filter((target) => target.type === 'page');
    if (pages.length === 1) {
      pageTarget = pages[0];
      break;
    }
    requireJourney(pages.length === 0, 'renderer-target-count');
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  requireJourney(pageTarget, 'renderer-target-timeout');
  const { sessionId } = await rootSession.send('Target.attachToTarget', {
    targetId: pageTarget.targetId,
    flatten: false,
  });
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
    if (response.error) completion.reject(new Error('J-01/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectResponse(new Error('J-01/renderer-cdp-timeout'));
      }, 30_000);
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
    await rootSession.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({ id, method, params }),
    });
    return response;
  };
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    requireJourney(!response.exceptionDetails, 'renderer-evaluate');
    return response.result.value;
  };
  await send('Runtime.enable');
  return { evaluate };
}

async function waitFor(renderer, expression, location) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-01/${location}`);
}

async function assertRenderer(renderer, expression, location) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), location);
}

async function clickExactButton(renderer, label, location) {
  await assertRenderer(
    renderer,
    `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!button) return false; button.click(); return true; })()`,
    location,
  );
}

async function runJourney(renderer, expectExactMatch) {
  at('renderer-ready');
  await waitFor(
    renderer,
    `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
    'renderer-ready',
  );
  await assertRenderer(
    renderer,
    `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && Object.keys(window.ai7).sort().join(',') === 'cancelServiceJob,commitNewBookImport,commitReplacement,flushJournalEdit,freezeReplacement,getManuscriptWindow,getManuscriptWindowAt,getOutline,getSearchResults,listPriorWork,platform,pollServiceJob,prepareNewBookReview,prepareReplacement,redoManuscript,saveMilestone,selectAndStageDocx,startReplacementCommit,startSearch,undoManuscript'`,
    'renderer-isolation',
  );
  await assertRenderer(
    renderer,
    `(async () => { try { await fetch('http://127.0.0.1:9/ai7-j01-denial-probe'); return false; } catch { return true; } })()`,
    'renderer-network-denial',
  );
  at('landing');
  await clickExactButton(renderer, '导入稿件', 'stage-click');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'stage-target');
  if (expectExactMatch) {
    await assertRenderer(
      renderer,
      `document.querySelector('[data-exact-match-class="immutable-original"]')?.textContent.includes('精确原始文件身份')`,
      'exact-original-identity-disclosed',
    );
    await assertRenderer(
      renderer,
      `document.querySelector('[data-exact-match-class="parsed-content-structure"]')?.textContent.includes('精确解析内容与结构身份')`,
      'exact-parsed-content-structure-disclosed',
    );
    await assertRenderer(
      renderer,
      `(() => { const match = document.querySelector('.exact-match-disclosure'); const radio = document.querySelector('input[aria-label="新建图书（作为不同作品）"]'); return match?.textContent.includes('匹配图书') && match.textContent.includes('来源材料版本') && match.textContent.includes('稿件导入记录') && match.textContent.includes('不会选择目标或关系') && match.textContent.includes('不授予去重、覆盖或重新导入权限') && radio && !radio.checked; })()`,
      'exact-match-records-and-distinct-work-unselected',
    );
  }
  const targetLabel = expectExactMatch ? '新建图书（作为不同作品）' : '新建图书';
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
  await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, 'target-title');
  await assertRenderer(
    renderer,
    `document.querySelector('#book-title')?.value.length > 0 && Array.from(document.querySelectorAll('.field-note')).some((note) => note.textContent.includes('建议来源：')) && document.querySelector('[data-source-sha256]')?.textContent === ${JSON.stringify(SAMPLE1_SHA256)} && document.querySelector('[data-source-bytes]')?.textContent === ${JSON.stringify(String(SAMPLE1_BYTES))} && document.querySelectorAll('[data-fidelity-category]').length === 8`,
    'title-contract',
  );
  if (expectExactMatch) {
    await assertRenderer(
      renderer,
      `(() => { const title = document.querySelector('#book-title'); if (!title) return false; title.value = title.value + '（不同作品）'; title.dispatchEvent(new Event('input', { bubbles: true })); return title.value.endsWith('（不同作品）') && Array.from(document.querySelectorAll('.field-note')).some((note) => note.textContent.includes('建议来源：') && note.textContent.includes('可编辑建议')); })()`,
      'distinct-work-title-edited',
    );
  }
  await clickExactButton(renderer, '确认书名并复核', 'review-click');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'review-screen');
  at('review');
  if (expectExactMatch) {
    await assertRenderer(
      renderer,
      `(() => { const summary = document.querySelector('.review-exact-match-summary'); return summary?.textContent.includes('精确原始文件身份') && summary.textContent.includes('精确解析内容与结构身份') && summary.textContent.includes('本次选择：新建图书（作为不同作品）') && summary.textContent.includes('匹配不授予目标、关系、去重、覆盖或重新导入权限') && document.querySelector('[data-screen="review"] h3')?.textContent.endsWith('（不同作品）'); })()`,
      'review-binds-exact-match-and-distinct-work',
    );
  }
  await assertRenderer(
    renderer,
    `document.querySelector('[data-screen="review"] [data-source-sha256]')?.textContent === ${JSON.stringify(SAMPLE1_SHA256)} && document.querySelector('[data-screen="review"] [data-source-bytes]')?.textContent === ${JSON.stringify(String(SAMPLE1_BYTES))} && Array.from(document.querySelectorAll('[data-screen="review"] dd')).some((item) => item.textContent === '按上述降级方式新建图书并导入稿件')`,
    'review-source-and-action',
  );
  await assertRenderer(
    renderer,
    `(() => { const rows = Array.from(document.querySelectorAll('[data-fidelity-category]')); const expected = [['inline-styles',266,'status-degraded'],['comments-revisions',0,'status-preserved'],['notes',0,'status-preserved'],['tables',0,'status-preserved'],['images-captions',0,'status-preserved'],['sections',1,'status-degraded'],['headers-footers',0,'status-preserved'],['round-trip-export',0,'status-unsupported']]; return rows.length === expected.length && rows.every((row, index) => row.dataset.fidelityCategory === expected[index][0] && row.querySelector('.count')?.textContent.includes('· ' + expected[index][1] + ' 项') && row.querySelector('.status-pill')?.classList.contains(expected[index][2])); })()`,
    'review-fidelity-exact',
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
  await assertRenderer(
    renderer,
    `document.querySelector('[data-fidelity-category="round-trip-export"]')?.textContent.includes('不提供往返保证') && document.querySelector('[data-fidelity-category="round-trip-export"]')?.textContent.includes('不阻止本次符合范围的文本导入')`,
    'review-roundtrip-non-effect',
  );
  await assertRenderer(
    renderer,
    `(() => { const sections = Array.from(document.querySelectorAll('.review-section')); const exact = (heading, expected) => { const section = sections.find((item) => item.querySelector('h3')?.textContent === heading); const actual = Array.from(section?.querySelectorAll('li') ?? [], (item) => item.textContent); return actual.length === expected.length && actual.every((item, index) => item === expected[index]); }; return exact('将创建的记录', ['图书与稳定标识','图书编辑维度集（8 项）','源材料版本与来源记录','导入保真审阅','导入降级决定','主稿件','稿件分支','稿件修订版 r1 与有序稳定内容块','工作流程实例与精确方案版本绑定','稿件导入记录']) && exact('明确不会发生', ['不创建书系或书系成员关系','不创建编辑学习准入决定','不授予或执行模型提供方传输','不创建发稿版本','不创建公开发布许可或公开发布事实','不导出、不发送、不交付、不发布','不承诺 DOCX 往返或版式复原']); })()`,
    'review-exact-effects',
  );
  await assertRenderer(
    renderer,
    `!/(?:J-01|tracer|clean|Review Before Import)/.test(document.body.textContent)`,
    'product-language',
  );
  await clickExactButton(renderer, '按上述降级方式新建图书并导入稿件', 'commit-click');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'imported');
  await assertRenderer(
    renderer,
    `Array.from(document.querySelectorAll('h2')).some((heading) => heading.textContent === '稿件已导入')`,
    'import-completion',
  );
  await clickExactButton(renderer, '查看导入记录', 'record-open');
  await assertRenderer(
    renderer,
    `(() => { const record = document.querySelector('.record-detail'); const items = Array.from(record?.querySelectorAll('[data-degradation-category]') ?? []); return record?.textContent.includes('含已接受的降级') && record?.textContent.includes('导入保真审阅') && record?.textContent.includes('导入降级决定') && record?.textContent.includes('查看受影响类别、示例与导出后果') && record?.textContent.includes('rFonts') && record?.textContent.includes('文档网格') && record?.textContent.includes('后续导出无法恢复') && items.length === 2 && items[0].dataset.degradationCategory === 'inline-styles' && items[0].dataset.degradationCount === '266' && items[1].dataset.degradationCategory === 'sections' && items[1].dataset.degradationCount === '1'; })()`,
    'import-record-degradation',
  );
  await clickExactButton(renderer, '打开稿件', 'editor-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'editor-screen');
  at('editor');
  await assertRenderer(
    renderer,
    `(() => { const forward = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '向后浏览'); return document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length === 32 && document.querySelector('.editor-meta')?.textContent.includes('全稿 0.000%') && forward && !forward.disabled; })()`,
    'bounded-window',
  );
  await assertRenderer(
    renderer,
    `(() => { const block = document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')[3]; if (!block) return false; block.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return document.execCommand('insertText', false, '，新增编辑'); })()`,
    'bounded-edit',
  );
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑')?.disabled`, 'edit-dirty');
  await assertRenderer(
    renderer,
    `(() => { const status = document.querySelector('#persistence-status'); const editor = document.querySelector('[data-testid="manuscript-editor"]'); if (!status || !editor) return false; globalThis.__ai7JournalProbe = new Promise((resolve) => { let busy = status.textContent.includes('正在写入修订日志'); const observer = new MutationObserver(() => { busy ||= status.textContent.includes('正在写入修订日志'); if (status.textContent.includes('已写入修订日志')) { observer.disconnect(); resolve({ busy, durable: true }); } }); observer.observe(status, { childList: true, subtree: true, characterData: true }); setTimeout(() => { observer.disconnect(); resolve({ busy, durable: false }); }, 30000); }); const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: ${process.platform === 'darwin' ? 'false' : 'true'}, metaKey: ${process.platform === 'darwin' ? 'true' : 'false'}, bubbles: true, cancelable: true }); editor.dispatchEvent(event); return event.defaultPrevented; })()`,
    'save-shortcut',
  );
  const persisted = await renderer.evaluate('globalThis.__ai7JournalProbe');
  requireJourney(persisted?.busy === true && persisted?.durable === true, 'durable-journal-ack');
  await assertRenderer(
    renderer,
    `document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r1') && document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 1') && !document.querySelector('.editor-meta')?.textContent.includes('稿件修订版 r1')`,
    'r1-journal-sequence',
  );
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
  const { chromium } = await import('playwright-core');
  const tempParent = await realpath(tmpdir());
  const checkoutRoot = await realpath(ROOT);
  requireJourney(
    !pathIsInside(checkoutRoot, tempParent) && !pathIsInside(tempParent, checkoutRoot),
    'temp-parent-boundary',
  );
  let runRoot;
  let browser;
  try {
    runRoot = await mkdtemp(join(tempParent, 'ai7-j01-e2e-'));
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j01-e2e-'), 'temp-root');
    requireJourney((await realpath(runRoot)) === runRoot, 'temp-root');
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkoutRoot);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
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
    const executable = electronExecutable();
    const entry = resolve(ROOT, 'dist', 'main', 'index.cjs');
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
      '--j01-picker-path',
      docx,
    ];
    requireJourney(
      isAbsolute(dataRoot) &&
        isAbsolute(docx) &&
        !productArgs.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)),
      'pipe-only-product-transport',
    );
    at('launch');
    const launchJourney = async (expectExactMatch) => {
      browser = await chromium.launch({
        executablePath: executable,
        headless: false,
        ignoreDefaultArgs: true,
        args: productArgs,
        env: productEnvironment(executable),
        timeout: 30_000,
      });
      const renderer = await attachRendererTarget(browser);
      await runJourney(renderer, expectExactMatch);
      await browser.close();
      browser = undefined;
    };
    await launchJourney(false);
    await launchJourney(true);
  } finally {
    await browser?.close().catch(() => undefined);
    if (runRoot !== undefined) {
      requireJourney(
        dirname(runRoot) === tempParent &&
          basename(runRoot).startsWith('ai7-j01-e2e-') &&
          (await realpath(runRoot)) === runRoot,
        'cleanup-target',
      );
      await rm(runRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error && error.message.startsWith('J-01/') ? error.message : `J-01/${diagnosticLocation}`;
  console.error(message);
  process.exitCode = 1;
});
