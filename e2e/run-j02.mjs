import { createWriteStream, existsSync } from 'node:fs';
import { lstat, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHARACTER_COUNT = 10_000_000;
const BLOCK_COUNT = 50_000;
const BLOCK_LENGTH = CHARACTER_COUNT / BLOCK_COUNT;
const SEARCH_TEXT = '星河校准';
const REPLACEMENT_TEXT = '星海校准';
const EXPECTED_MATCHES = 25;
const OVERLAP_SOURCE_TEXT = '哈哈哈';
const OVERLAP_QUERY = '哈哈';
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const CJK_BASE = 0x4e00;
const CJK_SPAN = 0x1000;
let diagnosticLocation = 'entry';
let electronExecutable;
let Zip;
let ZipPassThrough;
let strToU8;

function at(location) {
  diagnosticLocation = location;
}

function requireJourney(condition, location) {
  if (!condition) throw new Error(`J-02/${location}`);
}

function pathIsInside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function parseJourney() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-02', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(!Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-02' };
  const names = process.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
    : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) if (process.env[name] !== undefined) selected[name] = process.env[name];
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireJourney(systemRoot !== undefined && isAbsolute(systemRoot), 'product-environment');
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else {
    selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
  return selected;
}

function blockText(position) {
  const characters = Array.from(
    { length: BLOCK_LENGTH },
    (_, index) => String.fromCodePoint(CJK_BASE + ((position * 17 + index) % CJK_SPAN)),
  );
  if (position % 2_000 === 0) characters.splice(97, SEARCH_TEXT.length, ...SEARCH_TEXT);
  if (position === 1_000) characters.splice(41, OVERLAP_SOURCE_TEXT.length, ...OVERLAP_SOURCE_TEXT);
  return characters.join('');
}

async function createSyntheticDocx(path) {
  requireJourney(Number.isSafeInteger(BLOCK_LENGTH) && BLOCK_COUNT >= 50_000 && BLOCK_COUNT <= 100_000, 'fixture-shape');
  const output = createWriteStream(path, { flags: 'wx' });
  let pendingDrain = Promise.resolve();
  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    output.once('finish', resolveCompletion);
    output.once('error', rejectCompletion);
  });
  const zip = new Zip((error, data, final) => {
    if (error) {
      output.destroy(error);
      return;
    }
    if (!output.write(data)) pendingDrain = once(output, 'drain').then(() => undefined);
    if (final) output.end();
  });
  const pushEntry = async (name, value) => {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    entry.push(strToU8(value), true);
    await pendingDrain;
  };
  await pushEntry(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
  );
  await pushEntry(
    'docProps/core.xml',
    '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>千万字有界编辑校验</dc:title></cp:coreProperties>',
  );
  const document = new ZipPassThrough('word/document.xml');
  zip.add(document);
  document.push(strToU8('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'), false);
  await pendingDrain;
  let generatedCharacters = 0;
  for (let position = 1; position <= BLOCK_COUNT; position += 1) {
    const text = blockText(position);
    generatedCharacters += Array.from(text).length;
    const style = position === 1
      ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>'
      : position % 500 === 0
        ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
        : '';
    document.push(strToU8(`<w:p>${style}<w:r><w:t>${text}</w:t></w:r></w:p>`), false);
    if (position % 128 === 0) await pendingDrain;
  }
  requireJourney(generatedCharacters === CHARACTER_COUNT, 'fixture-character-count');
  document.push(strToU8('</w:body></w:document>'), true);
  await pendingDrain;
  zip.end();
  await completion;
  const metadata = await lstat(path);
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > CHARACTER_COUNT, 'fixture-file');
}

async function attachRendererTarget(browser) {
  const rootSession = await browser.newBrowserCDPSession();
  const deadline = Date.now() + 60_000;
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
  const { sessionId } = await rootSession.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: false });
  let nextId = 1;
  const pending = new Map();
  rootSession.on('Target.receivedMessageFromTarget', ({ sessionId: incoming, message }) => {
    if (incoming !== sessionId) return;
    let response;
    try { response = JSON.parse(message); } catch { return; }
    if (typeof response.id !== 'number') return;
    const completion = pending.get(response.id);
    if (!completion) return;
    pending.delete(response.id);
    if (response.error) completion.reject(new Error('J-02/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectResponse(new Error('J-02/renderer-cdp-timeout'));
      }, 60_000);
      timeout.unref();
      pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
        reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
      });
    });
    await rootSession.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
    return response;
  };
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    requireJourney(!response.exceptionDetails, 'renderer-evaluate');
    return response.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, send };
}

async function waitFor(renderer, expression, location, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-02/${location}`);
}

async function assertRenderer(renderer, expression, location) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), location);
}

async function clickButton(renderer, label, location) {
  await assertRenderer(
    renderer,
    `(() => { const item = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === ${JSON.stringify(label)}); if (!item || item.disabled) return false; item.click(); return true; })()`,
    location,
  );
}

async function fill(renderer, selector, value, location) {
  await assertRenderer(
    renderer,
    `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) return false; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    location,
  );
}

async function press(renderer, key, modifiers = 0) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
}

async function importAndOpen(renderer) {
  at('renderer-ready');
  await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'renderer-ready');
  await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined'`, 'renderer-isolation');
  requireJourney(await renderer.evaluate(`(async () => { try { await fetch('http://127.0.0.1:9/j02-denial'); return false; } catch { return true; } })()`), 'renderer-network-denial');
  await clickButton(renderer, '导入稿件', 'stage-click');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'stage-target', 240_000);
  await assertRenderer(renderer, `document.querySelector('.source-card')?.textContent.includes('${BLOCK_COUNT} 个可编辑内容块')`, 'exact-block-count');
  await assertRenderer(renderer, `(() => { const radio = document.querySelector('input[aria-label="新建图书"]'); if (!radio) return false; radio.click(); return true; })()`, 'target-select');
  await waitFor(renderer, `document.querySelector('#book-title')`, 'title');
  await fill(renderer, '#book-title', '千万字有界编辑校验', 'title-fill');
  await clickButton(renderer, '确认书名并复核', 'review-click');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'review');
  await assertRenderer(renderer, `!document.querySelector('#accept-import-degradation') && Array.from(document.querySelectorAll('[data-fidelity-category]')).every((row) => row.dataset.fidelityCategory === 'round-trip-export' || row.querySelector('.status-preserved'))`, 'clean-fidelity');
  await clickButton(renderer, '新建图书并导入稿件', 'commit-click');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'imported', 300_000);
  await clickButton(renderer, '打开稿件', 'editor-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'editor');
}

async function runWorkspaceJourney(renderer) {
  at('bounded-workspace');
  await assertRenderer(renderer, `document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length === 32`, 'renderer-block-ceiling');
  await assertRenderer(renderer, `document.querySelector('#manuscript-position')?.max === '1000000' && document.querySelector('.editor-meta')?.textContent.includes('全稿 0.000%')`, 'whole-manuscript-position');
  await renderer.evaluate(`globalThis.__ai7FirstBlock = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId`);

  const positionJump = `(() => { const rail = document.querySelector('#manuscript-position'); rail.value = '750000'; rail.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`;
  await assertRenderer(renderer, positionJump, 'position-jump');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('75.000%')`, 'position-jump-resolved');
  await assertRenderer(renderer, `document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32`, 'position-window-bounded');
  await renderer.evaluate(`globalThis.__ai7BeforeForward = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId`);
  await assertRenderer(
    renderer,
    `(() => { const surface = document.querySelector('.editor-window'); const blocks = Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')); const block = blocks[20]; const text = block?.firstChild; if (!(surface instanceof HTMLElement) || !(block instanceof HTMLElement) || !(text instanceof Text) || text.length < 4) return false; block.scrollIntoView({ block: 'center' }); const containerTop = surface.getBoundingClientRect().top; const visible = blocks.find((candidate) => candidate.getBoundingClientRect().bottom >= containerTop); const selection = window.getSelection(); selection.setBaseAndExtent(text, 3, text, 1); globalThis.__ai7WindowContinuity = { blockId: block.dataset.blockId, text: selection.toString(), anchor: 3, head: 1, scrollBlockId: visible?.dataset.blockId, scrollOffset: visible?.getBoundingClientRect().top - containerTop }; return selection.anchorOffset === 3 && selection.headOffset === 1; })()`,
    'window-continuity-prepare',
  );
  await clickButton(renderer, '向后浏览', 'forward-window');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId !== globalThis.__ai7BeforeForward`, 'forward-window-resolved');
  await waitFor(renderer, `(() => { const expected = globalThis.__ai7WindowContinuity; const selection = window.getSelection(); const anchorBlock = selection?.anchorNode?.parentElement?.closest('[data-block-id]'); const headBlock = selection?.focusNode?.parentElement?.closest('[data-block-id]'); const surface = document.querySelector('.editor-window'); const scrollBlock = document.querySelector('[data-block-id="' + expected.scrollBlockId + '"]'); return anchorBlock?.dataset.blockId === expected.blockId && headBlock?.dataset.blockId === expected.blockId && selection.anchorOffset === expected.anchor && selection.focusOffset === expected.head && selection.toString() === expected.text && surface instanceof HTMLElement && scrollBlock instanceof HTMLElement && Math.abs((scrollBlock.getBoundingClientRect().top - surface.getBoundingClientRect().top) - expected.scrollOffset) <= 3; })()`, 'forward-selection-continuity');
  await clickButton(renderer, '向前浏览', 'back-window');
  await waitFor(renderer, `(() => { const expected = globalThis.__ai7WindowContinuity; const selection = window.getSelection(); return document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32 && selection?.anchorNode?.parentElement?.closest('[data-block-id]')?.dataset.blockId === expected.blockId && selection.anchorOffset === expected.anchor && selection.focusOffset === expected.head; })()`, 'back-selection-continuity');
  await assertRenderer(renderer, `document.querySelectorAll('.outline-list button').length === 64 && !Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '下一组结构')?.hidden`, 'outline-first-page-bounded');
  await clickButton(renderer, '下一组结构', 'outline-next-page');
  await waitFor(renderer, `document.querySelectorAll('.outline-list button').length > 0 && document.querySelectorAll('.outline-list button').length <= 64 && !Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '上一组结构')?.hidden`, 'outline-next-page-bounded');
  await clickButton(renderer, '上一组结构', 'outline-previous-page');
  await waitFor(renderer, `document.querySelectorAll('.outline-list button').length === 64`, 'outline-previous-page-bounded');
  await clickButton(renderer, '下一组结构', 'outline-last-page');
  await waitFor(renderer, `document.querySelectorAll('.outline-list button').length > 0 && document.querySelectorAll('.outline-list button').length <= 64`, 'outline-last-page-bounded');
  await assertRenderer(renderer, `(() => { const items = document.querySelectorAll('.outline-list button'); const target = items[items.length - 1]; if (!target) return false; target.click(); return true; })()`, 'outline-jump');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('99.998%')`, 'outline-exact-resolve');

  at('cooperative-edit');
  await fill(renderer, '#manuscript-search', '天', 'common-search-fill');
  await clickButton(renderer, '查找全稿', 'common-search-start');
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作')?.hidden`, 'common-search-running');
  await assertRenderer(
    renderer,
    `(() => { const blocks = document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]'); const edit = (block, text) => { if (!block) return false; block.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return document.execCommand('insertText', false, text); }; return edit(blocks[0], '协作'.repeat(150)) && edit(blocks[1], '续写'); })()`,
    'sustained-multiblock-edit-during-search',
  );
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑')?.disabled`, 'concurrent-edit-dirty');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 3') && Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '保存当前编辑')?.disabled`, 'automatic-serialized-durable-ack', 120_000);
  await renderer.evaluate(`globalThis.__ai7AfterAckFirst = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId`);
  await clickButton(renderer, '向前浏览', 'fresh-cursor-after-ack');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.dataset.blockId !== globalThis.__ai7AfterAckFirst`, 'fresh-cursor-after-ack-resolved');
  await clickButton(renderer, '向后浏览', 'fresh-return-cursor-after-ack');
  await waitFor(renderer, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作')?.hidden`, 'stale-search-closed');
  await fill(renderer, '#manuscript-search', '地', 'cancel-search-fill');
  await clickButton(renderer, '查找全稿', 'cancel-search-start');
  await waitFor(renderer, `!Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '取消当前操作')?.hidden`, 'cancel-search-running');
  await clickButton(renderer, '取消当前操作', 'cancel-search');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('已取消')`, 'cancel-business-readable');

  await fill(renderer, '#manuscript-search', OVERLAP_QUERY, 'overlap-search-fill');
  await clickButton(renderer, '查找全稿', 'overlap-search-start');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 1 处')`, 'overlap-leftmost-nonoverlap', 120_000);

  at('search-replace');
  await fill(renderer, '#manuscript-search', SEARCH_TEXT, 'search-fill');
  await clickButton(renderer, '查找全稿', 'search-start');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 ${EXPECTED_MATCHES} 处')`, 'search-results', 120_000);
  await assertRenderer(renderer, `document.querySelectorAll('.search-result').length === 24 && !Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '下一组结果')?.hidden`, 'search-virtualized');
  await assertRenderer(renderer, `(() => { const surface = document.querySelector('.editor-window'); const blocks = Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')); const block = blocks[5]; const text = block?.firstChild; if (!(surface instanceof HTMLElement) || !(block instanceof HTMLElement) || !(text instanceof Text) || text.length < 5) return false; block.scrollIntoView({ block: 'center' }); const containerTop = surface.getBoundingClientRect().top; const visible = blocks.find((candidate) => candidate.getBoundingClientRect().bottom >= containerTop); const selection = window.getSelection(); selection.setBaseAndExtent(text, 4, text, 1); globalThis.__ai7SearchReturn = { meta: document.querySelector('.editor-meta')?.textContent, blockId: block.dataset.blockId, text: selection.toString(), anchor: 4, head: 1, scrollBlockId: visible?.dataset.blockId, scrollOffset: visible?.getBoundingClientRect().top - containerTop }; return true; })()`, 'search-return-prepare');
  await assertRenderer(renderer, `(() => { const open = document.querySelector('.search-result button'); if (!open) return false; open.click(); return true; })()`, 'search-jump');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent !== globalThis.__ai7SearchReturn.meta`, 'search-jump-resolved');
  await waitFor(renderer, `window.getSelection()?.toString() === ${JSON.stringify(SEARCH_TEXT)}`, 'search-exact-range');
  await clickButton(renderer, '返回查找前位置', 'search-return');
  await waitFor(renderer, `(() => { const expected = globalThis.__ai7SearchReturn; const selection = window.getSelection(); const surface = document.querySelector('.editor-window'); const scrollBlock = document.querySelector('[data-block-id="' + expected.scrollBlockId + '"]'); return document.querySelector('.editor-meta')?.textContent === expected.meta && selection?.anchorNode?.parentElement?.closest('[data-block-id]')?.dataset.blockId === expected.blockId && selection.anchorOffset === expected.anchor && selection.focusOffset === expected.head && selection.toString() === expected.text && surface instanceof HTMLElement && scrollBlock instanceof HTMLElement && Math.abs((scrollBlock.getBoundingClientRect().top - surface.getBoundingClientRect().top) - expected.scrollOffset) <= 3; })()`, 'search-return-exact-selection-scroll');
  await clickButton(renderer, '下一组结果', 'search-next');
  await waitFor(renderer, `document.querySelectorAll('.search-result').length === 1`, 'search-next-results');
  await clickButton(renderer, '上一组结果', 'search-previous');
  await waitFor(renderer, `document.querySelectorAll('.search-result').length === 24`, 'search-previous-results');
  await assertRenderer(renderer, `(() => { const result = document.querySelector('.search-result'); const include = result?.querySelector('input[type="checkbox"]'); const context = result?.querySelector('button')?.textContent; if (!include || !context) return false; globalThis.__ai7ExcludedContext = context; include.click(); return !include.checked; })()`, 'replacement-exclusion');
  await fill(renderer, '#manuscript-replacement', REPLACEMENT_TEXT, 'replacement-fill');
  await clickButton(renderer, '预览替换', 'replacement-preview');
  await waitFor(renderer, `!document.querySelector('.replacement-review')?.hidden && document.querySelector('.replacement-review')?.textContent.includes('纳入 25 处') && document.querySelector('.replacement-review')?.textContent.includes('排除 0 处') && document.querySelector('.replacement-review')?.textContent.includes('绑定修订版 r1') && document.querySelector('.replacement-review')?.textContent.includes('重叠时保留最早匹配')`, 'replacement-preview-bound');
  await clickButton(renderer, '冻结并重新验证', 'replacement-freeze');
  await waitFor(renderer, `document.querySelector('.replacement-review')?.textContent.includes('已冻结替换集') && document.querySelector('.replacement-review')?.textContent.includes('纳入 24 处') && document.querySelector('.replacement-review')?.textContent.includes('排除 1 处') && !document.querySelector('.replacement-review')?.textContent.includes(globalThis.__ai7ExcludedContext)`, 'replacement-frozen-included-contexts');
  await clickButton(renderer, '原子提交替换', 'replacement-commit');
  await waitFor(renderer, `document.querySelector('#persistence-status')?.textContent.includes('已原子替换 24 处')`, 'replacement-atomic', 120_000);
  await assertRenderer(renderer, `document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 4')`, 'replacement-journal');

  at('milestone-history');
  await assertRenderer(renderer, `(() => { const details = document.querySelector('.milestone-section'); details.open = true; return true; })()`, 'milestone-open');
  await fill(renderer, '#milestone-label', '结构复核完成', 'milestone-label');
  await fill(renderer, '#milestone-purpose', '确认千万字编辑与替换状态', 'milestone-purpose');
  await fill(renderer, '#milestone-note', '本地里程碑，不表示导出或发布。', 'milestone-note');
  await clickButton(renderer, '保存为里程碑版本', 'milestone-save');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r2')`, 'milestone-r2', 180_000);
  await clickButton(renderer, '撤销', 'undo');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 5')`, 'undo-durable', 120_000);
}

async function runRestartJourney(renderer) {
  at('restart-reopen');
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]') && document.querySelector('.recent-work-item')`, 'prior-work');
  await assertRenderer(renderer, `document.querySelector('.recent-work-item')?.textContent.includes('10,000,302 字符') && document.querySelector('.recent-work-item')?.textContent.includes('结构复核完成')`, 'prior-work-exact');
  await assertRenderer(renderer, `(() => { const open = document.querySelector('.recent-work-item button'); if (!open) return false; open.click(); return true; })()`, 'prior-work-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r2')`, 'reopened-r2');
  await assertRenderer(renderer, `document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]').length <= 32`, 'restart-window-bounded');
  await clickButton(renderer, '重做', 'restart-redo');
  await waitFor(renderer, `document.querySelector('.editor-meta')?.textContent.includes('修订日志序号 6')`, 'restart-redo-durable', 120_000);
  await fill(renderer, '#manuscript-search', REPLACEMENT_TEXT, 'redo-search-fill');
  await clickButton(renderer, '查找全稿', 'redo-search');
  await waitFor(renderer, `document.querySelector('.search-section .field-note')?.textContent.includes('共 24 处')`, 'redo-state-exact', 120_000);
}

async function runAccessibilityJourney(renderer) {
  at('j14-behavior');
  const modifier = process.platform === 'darwin' ? 4 : 2;
  await assertRenderer(renderer, `(() => { const block = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]'); block?.focus(); return document.activeElement?.closest('[data-testid="manuscript-editor"]') !== null; })()`, 'composition-focus');
  await renderer.send('Input.imeSetComposition', { text: '编', selectionStart: 1, selectionEnd: 1, replacementStart: 0, replacementEnd: 0 });
  await press(renderer, 'f', modifier);
  await assertRenderer(renderer, `document.activeElement?.id !== 'manuscript-search' && document.querySelector('#persistence-status')?.textContent.includes('输入法组合尚未结束')`, 'ime-command-guard');
  await renderer.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0, replacementStart: 0, replacementEnd: 1 });
  await press(renderer, 'f', modifier);
  await waitFor(renderer, `document.activeElement?.id === 'manuscript-search'`, 'keyboard-search-focus');
  await assertRenderer(renderer, `(() => { const input = document.querySelector('#manuscript-search'); return input?.matches(':focus-visible') && getComputedStyle(input).outlineStyle !== 'none'; })()`, 'visible-focus');
  await renderer.evaluate(`(() => { const editor = document.querySelector('[data-testid="manuscript-editor"]'); editor?.focus(); globalThis.__ai7BeforePageKey = editor?.firstElementChild?.dataset.blockId; })()`);
  await press(renderer, 'PageDown');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId !== globalThis.__ai7BeforePageKey`, 'keyboard-window-crossing');
  await renderer.evaluate(`(() => { const surface = document.querySelector('.editor-window'); globalThis.__ai7BeforeFineScroll = document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId; surface.scrollTop = surface.scrollHeight; })()`);
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')?.firstElementChild?.dataset.blockId !== globalThis.__ai7BeforeFineScroll`, 'fine-scroll-window-crossing');
  await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
  await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await assertRenderer(renderer, `getComputedStyle(document.querySelector('.editor-workspace')).gridTemplateColumns.split(' ').length === 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2`, 'zoom-200-reflow');
  await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.editor-shell')).boxShadow === 'none' && getComputedStyle(document.querySelector('button')).borderStyle !== 'none'`, 'forced-colors');
}

async function main() {
  parseJourney();
  const networkDenialEntry = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
  requireJourney(existsSync(networkDenialEntry), 'controller-network-denial-carrier');
  const { installNodeNetworkDenial } = await import(pathToFileURL(networkDenialEntry).href);
  installNodeNetworkDenial();
  ({ Zip, ZipPassThrough, strToU8 } = await import('fflate'));
  ({ electronExecutable } = await import('../tools/electron-runtime.mjs'));
  const dataRootEntry = resolve(ROOT, 'dist', 'shared', 'data-root.mjs');
  requireJourney(existsSync(dataRootEntry), 'controller-data-root-carrier');
  const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(dataRootEntry).href);
  const { chromium } = await import('playwright-core');
  const tempParent = await realpath(tmpdir());
  const checkoutRoot = await realpath(ROOT);
  requireJourney(!pathIsInside(checkoutRoot, tempParent) && !pathIsInside(tempParent, checkoutRoot), 'temp-parent-boundary');
  let runRoot;
  let browser;
  try {
    runRoot = await mkdtemp(join(tempParent, 'ai7-j02-e2e-'));
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j02-e2e-'), 'temp-root');
    const docx = resolve(runRoot, 'public-synthetic-10000000.docx');
    await createSyntheticDocx(docx);
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkoutRoot);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const productArgs = [
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
      '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
      resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid), '--j02-picker-path', docx,
    ];
    requireJourney(isAbsolute(dataRoot) && isAbsolute(docx) && !productArgs.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
    const launch = async () => {
      browser = await chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args: productArgs, env: productEnvironment(executable), timeout: 60_000 });
      return attachRendererTarget(browser);
    };
    let renderer = await launch();
    await importAndOpen(renderer);
    await runWorkspaceJourney(renderer);
    await browser.close();
    browser = undefined;
    renderer = await launch();
    await runRestartJourney(renderer);
    await runAccessibilityJourney(renderer);
    await browser.close();
    browser = undefined;
    requireJourney((await stat(docx)).size > CHARACTER_COUNT, 'fixture-survived-until-completion');
  } finally {
    await browser?.close().catch(() => undefined);
    if (runRoot !== undefined) {
      requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j02-e2e-') && (await realpath(runRoot)) === runRoot, 'cleanup-target');
      await rm(runRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error && error.message.startsWith('J-02/') ? error.message : `J-02/${diagnosticLocation}`;
  console.error(message);
  process.exitCode = 1;
});
