import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
let diagnosticLocation = 'entry';
let electronExecutable;
let strToU8;
let zipSync;

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

function xmlText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function createSyntheticDocx(runRoot) {
  const paragraphs = [
    { style: 'Title', text: '公共合成书稿' },
    { style: 'Heading1', text: '第一部分' },
    ...Array.from({ length: 24 }, (_, index) => ({ text: `公共合成段落${index + 1}，用于验证本地导入与稳定内容块。` })),
    { style: 'Heading1', text: '第二部分' },
    ...Array.from({ length: 24 }, (_, index) => ({ text: `公共合成段落${index + 25}，不含真实稿件或私人材料。` })),
  ];
  requireJourney(paragraphs.length === 51, 'synthetic-block-count');
  const documentBody = paragraphs
    .map(({ style, text }) => {
      const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
      return `<w:p>${properties}<w:r><w:t>${xmlText(text)}</w:t></w:r></w:p>`;
    })
    .join('');
  const archive = zipSync(
    {
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
          '</Types>',
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
          '</Relationships>',
      ),
      'docProps/core.xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
          '<dc:title>公共合成书稿</dc:title></cp:coreProperties>',
      ),
      'word/document.xml': strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          `<w:body>${documentBody}<w:sectPr/></w:body></w:document>`,
      ),
    },
    { level: 6 },
  );
  const path = resolve(runRoot, 'public-synthetic-j01.docx');
  await writeFile(path, archive, { flag: 'wx' });
  return path;
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

async function runJourney(renderer) {
  at('renderer-ready');
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'renderer-ready');
  await assertRenderer(
    renderer,
    `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && Object.keys(window.ai7).sort().join(',') === 'commitNewBookImport,flushJournalEdit,getManuscriptWindow,platform,prepareNewBookReview,selectAndStageDocx'`,
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
  await assertRenderer(
    renderer,
    `!document.querySelector('input[aria-label="新建图书"]').checked && !document.querySelector('#book-title')`,
    'no-preselection',
  );
  await assertRenderer(
    renderer,
    `(() => { const radio = document.querySelector('input[aria-label="新建图书"]'); if (!radio) return false; radio.click(); return true; })()`,
    'target-select',
  );
  await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, 'target-title');
  await assertRenderer(
    renderer,
    `document.querySelector('#book-title')?.value.length > 0 && Array.from(document.querySelectorAll('.field-note')).some((note) => note.textContent.includes('建议来源：DOCX 标题元数据')) && document.querySelectorAll('[data-fidelity-category]').length === 8`,
    'title-contract',
  );
  await clickExactButton(renderer, '确认书名并复核', 'review-click');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'review-screen');
  at('review');
  await assertRenderer(
    renderer,
    `(() => { const rows = Array.from(document.querySelectorAll('[data-fidelity-category]')); const expected = [['inline-styles','status-preserved'],['comments-revisions','status-preserved'],['notes','status-preserved'],['tables','status-preserved'],['images-captions','status-preserved'],['sections','status-preserved'],['headers-footers','status-preserved'],['round-trip-export','status-unsupported']]; return rows.length === expected.length && rows.every((row, index) => row.dataset.fidelityCategory === expected[index][0] && row.querySelector('.count')?.textContent.includes('· 0 项') && row.querySelector('.status-pill')?.classList.contains(expected[index][1])); })()`,
    'review-fidelity-exact',
  );
  await assertRenderer(
    renderer,
    `document.querySelector('[data-fidelity-category="round-trip-export"]')?.textContent.includes('不提供往返保证') && document.querySelector('[data-fidelity-category="round-trip-export"]')?.textContent.includes('不阻止本次符合范围的文本导入')`,
    'review-roundtrip-non-effect',
  );
  await assertRenderer(
    renderer,
    `(() => { const sections = Array.from(document.querySelectorAll('.review-section')); const exact = (heading, expected) => { const section = sections.find((item) => item.querySelector('h3')?.textContent === heading); const actual = Array.from(section?.querySelectorAll('li') ?? [], (item) => item.textContent); return actual.length === expected.length && actual.every((item, index) => item === expected[index]); }; return exact('将创建的记录', ['图书与稳定标识','图书编辑维度集（8 项）','源材料版本与来源记录','导入保真审阅','主稿件','稿件分支','稿件修订版 r1 与有序稳定内容块','工作流程实例与精确方案版本绑定','稿件导入记录']) && exact('明确不会发生', ['不创建书系或书系成员关系','不创建编辑学习准入决定','不授予或执行模型提供方传输','不创建发稿版本','不创建公开发布许可或公开发布事实','不导出、不发送、不交付、不发布','不承诺 DOCX 往返或版式复原','符合当前范围的导入不创建导入降级决定']); })()`,
    'review-exact-effects',
  );
  await assertRenderer(
    renderer,
    `!/(?:J-01|tracer|clean|Review Before Import)/.test(document.body.textContent)`,
    'product-language',
  );
  await clickExactButton(renderer, '新建图书并导入稿件', 'commit-click');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'imported');
  await assertRenderer(
    renderer,
    `Array.from(document.querySelectorAll('h2')).some((heading) => heading.textContent === '稿件已导入')`,
    'import-completion',
  );
  await clickExactButton(renderer, '打开稿件', 'editor-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'editor-screen');
  at('editor');
  await assertRenderer(
    renderer,
    `document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length === 32 && /1\\D+32\\D+51/.test(document.querySelector('.editor-meta')?.textContent ?? '')`,
    'bounded-window',
  );
  await assertRenderer(
    renderer,
    `(() => { const block = document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')[3]; if (!block) return false; block.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return document.execCommand('insertText', false, '，新增合成编辑'); })()`,
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
  ({ strToU8, zipSync } = await import('fflate'));
  const { chromium } = await import('playwright-core');
  const tempParent = await realpath(tmpdir());
  const checkoutRoot = await realpath(ROOT);
  requireJourney(
    !pathIsInside(checkoutRoot, tempParent) && !pathIsInside(tempParent, checkoutRoot),
    'temp-parent-boundary',
  );
  const runRoot = await realpath(await mkdtemp(join(tempParent, 'ai7-j01-e2e-')));
  requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j01-e2e-'), 'temp-root');
  const dataRoot = resolve(runRoot, 'data');
  const docx = await createSyntheticDocx(runRoot);
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
  let browser;
  try {
    at('launch');
    browser = await chromium.launch({
      executablePath: executable,
      headless: false,
      ignoreDefaultArgs: true,
      args: productArgs,
      env: productEnvironment(executable),
      timeout: 30_000,
    });
    const renderer = await attachRendererTarget(browser);
    await runJourney(renderer);
    await browser.close();
    browser = undefined;
  } finally {
    await browser?.close().catch(() => undefined);
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j01-e2e-'), 'cleanup-target');
    await rm(runRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error && error.message.startsWith('J-01/') ? error.message : `J-01/${diagnosticLocation}`;
  console.error(message);
  process.exitCode = 1;
});
