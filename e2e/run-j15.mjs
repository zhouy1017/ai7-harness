import { launchReviewFromSheet } from './launch-review-sheet.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { ADMITTED_BASELINE_DOCX, composeRevisedAdmittedDocx, fixedArchiveTime } from './composed-docx.mjs';
import { attachProductOutput, installJourneyCancellationCleanup, journeyCheckFailure, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect, SIDEBAR, sidebarNavigate, SIDEBAR_LIBRARY_READY, SIDEBAR_ICONS_ONLY, runJ14DarkPass } from './controller.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PROFILE_DIGEST = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
const PROFILE_BYTES = 263;
const SIDECAR_ID = 'ai7.editorial-workspace-profile.authority';
const SIDECAR_REVISION_1_DIGEST = '887067fc716261fc5f41772a295faa326f6bf2818573daae29ffdb7388e9e48d';
const SIDECAR_REVISION_2_DIGEST = '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
const FUTURE_SKEWED_ENABLED_AT = '9999-12-31T23:59:59.999Z';
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let location = 'entry';

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-15', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = journeyCheckFailure('J-15', name);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-15', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-15' };
  const names = process.platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
    : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) if (process.env[name] !== undefined) selected[name] = process.env[name];
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireJourney(systemRoot && isAbsolute(systemRoot), 'product-environment');
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else {
    selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
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
    server.once('error', () => rejectListen(journeyCheckFailure('J-15', 'loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  requireJourney(address && typeof address === 'object' && address.address === '127.0.0.1' && address.port > 0, 'loopback-address');
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j15-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
      requireJourney(!runtimeFault, 'loopback-runtime');
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
    if (response.error) completion.reject(journeyCheckFailure('J-15', 'renderer-cdp-response'));
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
          rejectResponse(journeyCheckFailure('J-15', 'renderer-cdp-timeout'));
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
  return {
    list: async () => {
      const targets = (await guard(root.send('Target.getTargets'))).targetInfos.filter((item) => item.type === 'page');
      return Promise.all(targets.map(attach));
    },
  };
}

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-15', name);
}

async function waitForRenderer(manager, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const renderers = await manager.list();
    if (renderers.length === 1) return renderers[0];
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-15', name);
}

async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), name);
}

async function click(renderer, label, name) {
  if (label === '保存') { await renderer.evaluate(`document.querySelector('[data-testid="manuscript-editor"]').dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }))`); return; }
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>(item.textContent===${JSON.stringify(label)}||item.getAttribute('aria-label')===${JSON.stringify(label)})); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function clickBook(renderer, bookId, name) {
  await assertRenderer(renderer, `(() => { const node=document.querySelector('button[data-book-id=${JSON.stringify(bookId)}]'); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!(input instanceof HTMLInputElement)&&!(input instanceof HTMLTextAreaElement))return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, name);
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

// 知识库 › 审阅规范文件 (Issue #427, plan slice S79a): the house's own next version of 文字规范条款, written by the runner —
// AI7's own words, never a manuscript — and handed to the product through J-15's picker control.
const HOUSE_GUIDELINE_NAME = '本社文字规范.txt';
const HOUSE_GUIDELINE = ['本社文字规范（J-15）', '', '1. 指出错字、别字、多字与漏字，给出改正后的文字。', '2. 指出成分残缺与搭配不当，给出通顺的改法。',
  '3. 数字与标点按本社体例手册统一，', '体例手册未写到的，按国家现行规范。', '4. 专名在全书前后写法一致。', '5. 引文与原文核对后再改，不凭记忆改动。'].join('\n');
const KNOWLEDGE_TABS = ['审阅规范文件', '评估方案', '工序与规则', '社级编辑记忆', '范例', '资料库', '外部来源留存'];
const GUIDELINE_TITLES = ['文字规范条款', '体例条款', '线索条款', '事实核查契约', '引用与学术规范条款', '出版风险提示条款', '表达改进条款'];
// 事实核查契约 remains fixed; current plot-consistency reads clauses as well as pinned baseline leads (#1167).
const GUIDELINE_FIXED = new Map([
  [3, '「事实核查」按 AI7 固定的事实核查契约执行，不读取这里的条款。这是 AI7 的固定说明，不能导入新版本。'],
]);
/** The 知识库 page as an editor reads it: its tabs, the chosen one, and each guideline card's words. */
const READ_KNOWLEDGE = `(() => {
  const page = document.querySelector('[data-screen="knowledge-base"] .knowledge-base');
  if (!(page instanceof HTMLElement)) return null;
  return {
    tab: page.dataset.knowledgeTab ?? null,
    tabs: Array.from(page.querySelectorAll('[role="tab"]'), (tab) => [tab.textContent, tab.getAttribute('aria-selected')]),
    pending: page.querySelector('.knowledge-pending')?.textContent ?? null,
    housePreference: page.querySelector('[data-house-review-preference]')?.textContent ?? null,
    guidelines: page.querySelector('.review-guidelines')?.dataset.guidelines ?? null,
    cards: Array.from(page.querySelectorAll('.guideline-card'), (card) => ({
      id: card.dataset.guidelineDocument,
      title: card.querySelector('h3')?.textContent ?? null,
      pill: card.querySelector('.guideline-version-pill')?.textContent ?? null,
      applied: card.querySelector('.guideline-applied')?.textContent ?? null,
      clauses: Array.from(card.querySelectorAll('.guideline-clauses li'), (item) => [item.dataset.clauseId, item.querySelector('.guideline-citations')?.textContent ?? null]),
      versions: Array.from(card.querySelectorAll('.guideline-version-list li'), (item) => item.textContent),
      older: card.querySelector('.guideline-older')?.textContent ?? null,
      fixed: card.querySelector('.guideline-fixed')?.textContent ?? null,
      importable: card.querySelector('[data-guideline-action="import"]') instanceof HTMLButtonElement,
      preview: card.querySelector('.guideline-preview h4')?.firstChild?.textContent ?? null,
      changes: card.querySelector('.guideline-preview-changes')?.textContent ?? null,
      previewClauses: card.querySelectorAll('.guideline-preview li').length,
      refusal: card.querySelector('.guideline-refusal')?.textContent ?? null,
    })),
  };
})()`;
async function readKnowledge(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_KNOWLEDGE).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-15', name);
  error.detail = page;
  throw error;
}
// 知识库 › 资料库 (Issue #427, plan slice S79c): the admitted Public SampleBook `sample1`, collected by the editor as a reference
// book, handed to 放入资料… through the picker control of the relaunched window.
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
// Issue #1410 item 29: a file goes into 资料库 under its own suggested title, as 资料 when no kind is suggested.
const LIBRARY_TITLE = 'sample1';
const LIBRARY_EMPTY = '暂无资料，放入后可供任务参考。';
/** 资料库 as an editor reads it: the arrival form, and each item's words, decisions and open choice. */
const READ_LIBRARY = `(() => {
  const root = document.querySelector('[data-screen="knowledge-base"] .library-materials');
  if (!(root instanceof HTMLElement)) return null;
  const preview = root.querySelector('.library-preview');
  const active = document.activeElement;
  return {
    state: root.dataset.library ?? null,
    count: root.dataset.materialCount ?? null,
    empty: root.querySelector('.library-empty')?.textContent ?? null,
    refusal: root.querySelector('.library-refusal')?.textContent ?? null,
    preview: preview === null ? null : {
      heading: preview.querySelector('h3')?.firstChild?.textContent ?? null,
      facts: preview.querySelector('.library-preview-facts')?.textContent ?? null,
      title: preview.querySelector('[data-library-field="title"]')?.value ?? null,
      kinds: Array.from(preview.querySelectorAll('[data-library-choice]'), (input) => [input.value, input.checked]),
      confirmDisabled: preview.querySelector('[data-library-action="confirm-add"]')?.disabled ?? null,
    },
    cards: Array.from(root.querySelectorAll('article.library-material'), (card) => {
      const chooser = card.querySelector('.library-chooser');
      const consequence = card.querySelector('.library-house-consequence');
      return {
        id: card.dataset.materialId,
        attribution: card.dataset.attribution,
        eligibility: card.dataset.eligibility,
        reference: card.dataset.reference,
        decisions: card.dataset.decisions,
        title: card.querySelector('h3')?.textContent ?? null,
        kind: card.querySelector('.library-kind')?.textContent ?? null,
        attributionLine: card.querySelector('.library-attribution')?.textContent ?? null,
        eligibilityLine: card.querySelector('.library-eligibility')?.textContent ?? null,
        referenceLine: card.querySelector('.library-reference')?.textContent ?? null,
        chooser: chooser === null ? null : {
          kind: chooser.classList.contains('library-attribution-chooser') ? 'attribution' : 'eligibility',
          choices: Array.from(chooser.querySelectorAll('[data-library-choice]'), (input) => [input.value, input.checked, input.disabled, input.closest('label')?.textContent ?? null]),
          consequenceShown: consequence instanceof HTMLElement ? !consequence.hidden : null,
          confirmDisabled: chooser.querySelector('[data-library-action^="confirm-"]')?.disabled ?? null,
        },
        history: Array.from(card.querySelectorAll('.library-decision-list > li'), (item) => item.textContent),
        index: card.querySelector('section.material-index')?.dataset.indexState ?? null,
        indexLine: card.querySelector('.material-index-state')?.textContent ?? null,
        layers: Array.from(card.querySelectorAll('.material-index-layer'), (line) => [line.dataset.indexLayer, line.dataset.layerState, line.textContent]),
        layerActions: (() => {
          const build = card.querySelector('[data-library-action="build-vectors"]');
          const request = card.querySelector('[data-library-action="request-translation"]');
          return {
            build: build instanceof HTMLButtonElement ? build.disabled : null,
            translation: request instanceof HTMLButtonElement ? request.disabled : null,
            translationNote: card.querySelector('.material-translation-note')?.textContent ?? null,
            described: request instanceof HTMLElement ? request.getAttribute('aria-describedby') === card.querySelector('.material-translation-note')?.id : null,
          };
        })(),
        vectorSearch: (() => {
          const section = card.querySelector('.material-vector-search');
          if (!(section instanceof HTMLElement)) return null;
          return {
            heading: section.querySelector('.material-vector-results-heading')?.textContent ?? null,
            candidates: Array.from(section.querySelectorAll('.material-vector-candidate'), (item) => [item.dataset.candidateOrdinal, item.querySelector('.material-anchor')?.textContent ?? null]),
          };
        })(),
        segments: (() => {
          const reader = card.querySelector('.material-segments');
          if (!(reader instanceof HTMLElement) || reader.dataset.segmentsFrom === undefined) return null;
          return {
            from: reader.dataset.segmentsFrom,
            total: reader.dataset.segmentsTotal,
            heading: reader.querySelector('.material-segments-heading')?.textContent ?? null,
            items: Array.from(reader.querySelectorAll('.material-segment'), (item) => [item.dataset.segmentOrdinal,
              Array.from(item.querySelectorAll('.material-sentence'), (sentence) => [sentence.dataset.anchor, sentence.querySelector('.material-anchor')?.getAttribute('aria-label') ?? null])]),
            next: reader.querySelector('[data-library-action="segments-next"]') !== null,
            previous: reader.querySelector('[data-library-action="segments-previous"]') !== null,
          };
        })(),
      };
    }),
    focus: active instanceof HTMLElement ? { tag: active.tagName, action: active.dataset.libraryAction ?? null, choice: active.dataset.libraryChoice ?? null } : null,
  };
})()`;
/**
 * A synthetic two-page PDF in the runner's own words, never a manuscript (Issue #892): Chinese text in a Type0 font whose
 * ToUnicode map is the identity, three paragraphs over two pages, and the document's own title in its information.
 */
function syntheticPdf() {
  const hex = (text) => Array.from({ length: text.length }, (_, index) => text.charCodeAt(index).toString(16).padStart(4, '0')).join('');
  const stream = (content) => `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  const page = (paragraphs) => {
    const operations = ['BT /F1 12 Tf'];
    let y = 760;
    for (const line of paragraphs) {
      operations.push(`1 0 0 1 72 ${y} Tm <${hex(line)}> Tj`);
      y -= 28;
    }
    operations.push('ET');
    return stream(operations.join('\n'));
  };
  const toUnicode = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0000> <FFFF> <0000> endbfrange endcmap CMapName currentdict /CMap defineresource pop end end';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [8 0 R 10 0 R] /Count 2 >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /AI7Synthetic /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 5 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AI7Synthetic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 6 0 R /DW 500 >>',
    stream(toUnicode),
    '<< /Type /FontDescriptor /FontName /AI7Synthetic /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>',
    page(['运行器自己写的第一页第一段。', '第一页第二段，有两句。这是第二句。']),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>',
    page(['第二页只有一段。']),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 9 0 R >>',
    `<< /Title <FEFF${hex('合成 PDF')}> >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 11 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
/**
 * A synthetic EPUB in the runner's own words, never a manuscript (Issue #428): two chapters in reading order, the second
 * placed first in the manifest, and the book's own title in its package metadata.
 */
function syntheticEpub() {
  const chapter = (body) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>章</title></head><body>${body}</body></html>`;
  return zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': strToU8('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>合成电子书</dc:title></metadata>' +
      '<manifest><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest>' +
      '<spine><itemref idref="one"/><itemref idref="two"/></spine></package>'),
    'OEBPS/one.xhtml': strToU8(chapter('<h1>第一章</h1><p>这是运行器自己写的一句话。第二句也是。</p><script>不读</script>')),
    'OEBPS/two.xhtml': strToU8(chapter('<p>第二章只有一句。</p>')),
  }, { mtime: fixedArchiveTime() });
}
async function readLibrary(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_LIBRARY).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-15', name);
  error.detail = page;
  throw error;
}
async function clickSelector(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!(node instanceof HTMLElement)||node.disabled)return false; const more=node.closest('.knowledge-file-more'); if(more instanceof HTMLDetailsElement&&!more.open)more.querySelector(':scope > summary').click(); node.click(); return true; })()`, name);
}
async function pressKey(renderer, key) {
  const codes = { ArrowRight: 39, ArrowLeft: 37, Enter: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: codes[key] });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: codes[key] });
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
  let cleanupPromise;
  let finalCleanupRequested = false;
  const closeBrowser = async () => {
    let owned = browser;
    if (owned === undefined && browserAcquisition !== undefined) owned = await browserAcquisition.catch(() => undefined);
    if (owned !== undefined) await owned.close();
    browser = undefined;
    browserAcquisition = undefined;
  };
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      await closeBrowser();
      const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
      await ownedLoopback?.close().catch(() => undefined);
      loopback = undefined;
      const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
      if (ownedRoot !== undefined) {
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j15-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
        await rm(ownedRoot, { recursive: true, force: true });
        runRoot = undefined;
      }
    })();
    return cleanupPromise;
  };
  const cancellation = installJourneyCancellationCleanup(cleanup, async () => {
    if (!finalCleanupRequested) await closeBrowser();
  });
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j15-e2e-'));
    runRoot = await runRootAcquisition;
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j15-e2e-'), 'temp-root');
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const guidelinePath = resolve(runRoot, HOUSE_GUIDELINE_NAME);
    await writeFile(guidelinePath, HOUSE_GUIDELINE, 'utf8');
    const launch = async (pickerPath = guidelinePath) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
        // J-15's picker serves 导入新版本 of a review guideline document (Issue #427, S79a), and in the window relaunched after
        // it 放入资料… (Issue #427, S79c): one choice per window.
        '--j15-picker-path', pickerPath,
      ];
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-15', browser, 'launch');
      cancellation.throwIfRequested();
      return createRendererManager(browser);
    };

    at('initial-empty-book');
    let manager = await launch();
    let renderer = await waitForRenderer(manager, 'initial-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'initial-ready');
    await assertRenderer(renderer, SIDEBAR_LIBRARY_READY, 'sidebar-library-entry');
    // Product readiness is emitted only after ServiceClient accepts the exact dormant-Harness
    // handshake, including zero configured agents, agents, sessions, Providers, tools, and assembled tools.
    await assertRenderer(renderer, `document.documentElement.dataset.ai7ProductReady==='true'`, 'exact-service-readiness-zero-harness');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
    await renderer.send('Page.setBypassCSP', { enabled: false });
    requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'offline-product');
    const bookA = await createEmptyBook(renderer, 'J15 空图书甲');
    await assertRenderer(renderer, `document.querySelector('.native-artifact-card') === null && document.querySelector('[data-agent-workspace-entry="available"] [data-agent-workspace-action="open"]') instanceof HTMLButtonElement`, 'book-capabilities-without-install');
    const freshWorkspace = await renderer.evaluate(`window.ai7.inspectAgentWorkspace()`);
    requireJourney(freshWorkspace.available === true && freshWorkspace.proposal === null, 'fresh-book-workspace-available');
    await closeBrowser();
    at('restart-persistence');
    manager = await launch(); renderer = await waitForRenderer(manager, 'restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'restart-ready');
    at('restart-open-book-a');
    await clickBook(renderer, bookA, 'open-book-a-after-restart');
    await waitFor(renderer, `document.querySelector('.book-overview[data-book-id=${JSON.stringify(bookA)}]')`, 'book-a-overview-after-restart');
    await assertRenderer(renderer, `document.querySelector('.native-artifact-card') === null && document.querySelector('[data-agent-workspace-entry="available"]') !== null`, 'book-a-capabilities-after-restart');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'return-after-book-a');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'landing-before-book-b');
    at('second-book-disabled');
    const bookB = await createEmptyBook(renderer, 'J15 空图书乙');
    requireJourney(bookB !== bookA, 'distinct-books');
    await assertRenderer(renderer, `document.querySelector('[data-agent-workspace-entry="available"]') !== null`, 'second-book-capabilities');

    // ---- 知识库 › 审阅规范文件 (Issue #427, plan slice S79a; editor-surfaces §8.4, V2-UX-KB-001 to KB-003) ------------------
    at('knowledge-guidelines');
    // 知识库 from 书库: its seven classes as tabs, opening at 审阅规范文件 — every guideline document the review categories apply,
    // at AI7's built-in first version, with its numbered clauses and a version no review has used yet.
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'knowledge-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'knowledge-landing');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'knowledge-open');
    await waitFor(renderer, `document.querySelector('[data-knowledge-home-ready=true]') && document.querySelectorAll('[data-knowledge-category]').length===7`, 'knowledge-category-home');
    await assertRenderer(renderer, `document.querySelectorAll('.guideline-card, .library-material').length===0 && document.querySelector('.knowledge-recent') !== null`, 'knowledge-home-has-no-files');
    await click(renderer, '审阅规范文件', 'knowledge-open-category');
    const opened = await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'knowledge-guidelines-ready');
    // J-14 dark pass (#935): 深色 through 设置 › 外观, this screen checked, then 跟随系统 again; back through the sidebar.
    await runJ14DarkPass({ renderer, journey: 'J-15', at, representative: '#screen[data-screen="knowledge-base"] > .page-content', returnTo: SIDEBAR.destination('knowledge') });
    await waitFor(renderer, `document.querySelector('[data-knowledge-category=guidelines]')`, 'knowledge-home-after-dark-pass');
    await click(renderer, '审阅规范文件', 'knowledge-category-after-dark-pass');
    await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'knowledge-guidelines-ready-after-dark-pass');
    await assertRenderer(renderer, `Array.from(document.querySelectorAll('.guideline-card')).every((card)=>card.querySelector('.knowledge-file-more') instanceof HTMLDetailsElement && !card.querySelector('.knowledge-file-more').open)`, 'knowledge-file-details-collapsed');
    requireJourney(opened.tab === 'guidelines' && JSON.stringify(opened.tabs) === JSON.stringify(KNOWLEDGE_TABS.map((label, index) => [label, String(index === 0)])) &&
      JSON.stringify(opened.cards.map((card) => card.title)) === JSON.stringify(GUIDELINE_TITLES) && opened.cards.every((card) => card.pill === '第 1 版 · AI7 内置默认') &&
      opened.cards[0].applied === '用于：错别字与规范用语' && opened.cards[0].clauses.length === 4 &&
      opened.cards[0].clauses.every(([clauseId, citations], index) => clauseId === `typos-and-usage/${index + 1}` && citations === '未被引用') &&
      JSON.stringify(opened.cards[0].versions) === JSON.stringify(['第 1 版 · AI7 内置默认 · 内置 · 4 条 · 还没有审阅用过']) && opened.cards.every((card) => card.older === null) &&
      opened.cards.every((card, index) => card.fixed === (GUIDELINE_FIXED.get(index) ?? null) && card.importable === !GUIDELINE_FIXED.has(index)),
    'knowledge-guidelines-cards', opened);
    // #911 synchronized delta: the memory tab exposes the local preference record and explicit rebuild.
    await click(renderer, '社级编辑记忆', 'knowledge-memory-tab');
    const memory = await readKnowledge(renderer, (page) => page.tab === 'memory' && page.housePreference !== null, 'knowledge-memory-tab-open');
    requireJourney(memory.pending === null && memory.housePreference.includes('本社审阅偏好') && memory.housePreference.includes('更新本社审阅偏好') &&
      memory.housePreference.includes('尚无符合学习准入的审阅反馈。') && memory.cards.length === 0, 'knowledge-pending', memory);
    await click(renderer, '审阅规范文件', 'knowledge-back-to-guidelines');
    await readKnowledge(renderer, (page) => page.tab === 'guidelines' && page.guidelines === 'ready', 'knowledge-guidelines-again');

    at('knowledge-guideline-import');
    await assertRenderer(renderer, `(() => { const summary=document.querySelector('[data-guideline-document="ai7-builtin/typos-and-usage"] .knowledge-file-more > summary'); if(!summary)return false; summary.click(); return true; })()`, 'knowledge-file-open');
    // 导入新版本… on 文字规范条款 (Issue #1410 item 25): the file picked in the system dialog is imported at once as 第 2 版,
    // issued by the house; version 1 stays listed beneath it.
    await assertRenderer(renderer, `(() => { const start=document.querySelector('[data-guideline-document="ai7-builtin/typos-and-usage"] [data-guideline-action="import"]'); if(!(start instanceof HTMLButtonElement)||start.disabled||start.textContent!=='导入新版本…')return false; start.click(); return true; })()`, 'knowledge-import-start');
    const importedPage = await readKnowledge(renderer, (page) => page.cards[0]?.pill === '第 2 版 · 本社', 'knowledge-imported');
    requireJourney(importedPage.cards[0].preview === null && importedPage.cards[0].clauses.length === 5 && importedPage.cards[0].versions.length === 2 &&
      importedPage.cards[0].versions[0].startsWith('第 2 版 · 本社 · 导入于 ') && importedPage.cards[0].versions[0].endsWith(` · ${HOUSE_GUIDELINE_NAME} · 5 条 · 还没有审阅用过`) &&
      importedPage.cards[0].versions[1] === '第 1 版 · AI7 内置默认 · 内置 · 4 条 · 还没有审阅用过' &&
      importedPage.cards.slice(1).every((card) => card.pill === '第 1 版 · AI7 内置默认'), 'knowledge-imported-card', importedPage.cards[0]);
    await waitFor(renderer, `(document.querySelector('#persistence-status')?.textContent ?? '')==='已导入《文字规范条款》第 2 版；新准备的审阅按第 2 版；已准备的审阅仍用原版本。'`, 'knowledge-imported-status', 10_000);
    const service = await renderer.evaluate(`window.ai7.inspectReviewGuidelines().then((projection)=>projection.documents.map((document)=>[document.documentId, document.currentOrdinal, document.issuer]))`);
    requireJourney(JSON.stringify(service?.[0]) === JSON.stringify(['ai7-builtin/typos-and-usage', 2, '本社']) && service.slice(1).every(([, ordinal]) => ordinal === 1), 'knowledge-imported-service', service);

    at('j14-knowledge-keyboard');
    // Without a pointer: the chosen tab takes focus, ArrowRight and ArrowLeft move between the classes, and each moved to is
    // chosen with its focus visible.
    await assertRenderer(renderer, `(() => { const tab=document.querySelector('#knowledge-tab-guidelines'); if(!(tab instanceof HTMLButtonElement))return false; tab.focus(); return document.activeElement===tab; })()`, 'knowledge-tab-focus');
    await pressKey(renderer, 'ArrowRight');
    await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab==='evaluation' && document.activeElement?.id==='knowledge-tab-evaluation' && document.activeElement.getAttribute('aria-selected')==='true'`, 'knowledge-arrow-right', 10_000);
    await pressKey(renderer, 'ArrowLeft');
    await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab==='guidelines' && document.activeElement?.id==='knowledge-tab-guidelines' && document.querySelector('.review-guidelines')?.dataset.guidelines==='ready'`, 'knowledge-arrow-left', 10_000);

    at('j14-knowledge-reflow-forced-colors');
    // At 200% the tabs, the cards and their clauses reflow into the width; under forced colours a card keeps its border and the
    // chosen tab its heavier underline.
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    // The sidebar shows icons only at this width, every row keeping its name (Issue #934; §0.3).
    await waitFor(renderer, SIDEBAR_ICONS_ONLY, 'sidebar-icons-only', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[document.querySelector('.knowledge-tabs'), ...document.querySelectorAll('.guideline-card')]; return parts.length===8 && parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2; })()`, 'knowledge-reflow', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const card = document.querySelector('.guideline-card');
      const chosen = document.querySelector('#knowledge-tab-guidelines');
      const other = document.querySelector('#knowledge-tab-evaluation');
      return card instanceof HTMLElement && getComputedStyle(card).borderTopStyle === 'solid' &&
        chosen instanceof HTMLElement && other instanceof HTMLElement && parseFloat(getComputedStyle(chosen).borderBottomWidth) >= 3 &&
        parseFloat(getComputedStyle(chosen).borderBottomWidth) > parseFloat(getComputedStyle(other).borderBottomWidth);
    })()`, 'knowledge-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('knowledge-guideline-restart');
    // A restart keeps the house's version; keep this window's picker for the subsequent guideline imports.
    await closeBrowser();
    manager = await launch();
    renderer = await waitForRenderer(manager, 'knowledge-restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'knowledge-restart-ready');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'knowledge-restart-open');
    await click(renderer, '审阅规范文件', 'knowledge-restart-open-category');
    const restarted = await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'knowledge-restart-ready-page');
    requireJourney(restarted.cards[0].pill === '第 2 版 · 本社' && restarted.cards[0].versions.length === 2 && restarted.cards[0].clauses.length === 5, 'knowledge-restart-kept', restarted.cards[0]);

    at('knowledge-guideline-import');
    await assertRenderer(renderer, `(() => { const summary=document.querySelector('[data-guideline-document="ai7-builtin/typos-and-usage"] .knowledge-file-more > summary'); if(!summary)return false; summary.click(); return true; })()`, 'knowledge-file-open');
    // Real picker/service/UI pages: later clauses remain reachable after import; history reaches version 1.
    const cardSelector = '[data-guideline-document="ai7-builtin/typos-and-usage"]';
    const activateGuideline = async (selector, name) => assertRenderer(renderer, `(() => {
      const button=document.querySelector(${JSON.stringify(`${cardSelector} ${selector}`)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      const more=button.closest('.knowledge-file-more');
      if(more instanceof HTMLDetailsElement && !more.open) more.querySelector(':scope > summary').click();
      button.focus(); button.click(); return true;
    })()`, name);
    for (let version = 3; version <= 8; version += 1) {
      await writeFile(guidelinePath, Array.from({ length: 9 }, (_, index) => `${index + 1}. 检查第 ${version} 版的第 ${index + 1} 项规范。`).join('\n'), 'utf8');
      // The existing picker control supplies one choice per window; restart rather than adding a repeatable bypass.
      if (version > 3) {
        await closeBrowser();
        manager = await launch();
        renderer = await waitForRenderer(manager, 'knowledge-page-window');
        await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'knowledge-page-ready');
        await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'knowledge-page-open');
        await click(renderer, '审阅规范文件', 'knowledge-page-open-category');
        await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'knowledge-page-loaded');
      }
      // The picked file imports at once (Issue #1410 item 25); the clause paging is proven on the imported version below.
      await activateGuideline('[data-guideline-action="import"]', 'knowledge-page-import-start');
      await waitFor(renderer, `document.querySelector(${JSON.stringify(cardSelector)})?.dataset.guidelineVersion==='${version}' && !document.querySelector(${JSON.stringify(`${cardSelector} .guideline-preview`)})`, 'knowledge-page-imported');
    }
    await assertRenderer(renderer, `(() => { const card=document.querySelector(${JSON.stringify(cardSelector)}); card.querySelector('.guideline-clauses').open=true; card.querySelector('.guideline-versions').open=true; return card.querySelectorAll('.guideline-version-list li').length===5; })()`, 'knowledge-pages-open');
    await activateGuideline('.guideline-clauses [data-guideline-action="clauses-next"]', 'knowledge-clauses-next');
    await waitFor(renderer, `(() => { const area=document.querySelector(${JSON.stringify(`${cardSelector} .guideline-clauses`)}); return area?.open && area.querySelectorAll('li').length===1 && area.querySelector('li')?.value===9 && document.activeElement===area.querySelector('summary'); })()`, 'knowledge-clauses-last-focus');
    await activateGuideline('[data-guideline-action="versions-older"]', 'knowledge-versions-older');
    await waitFor(renderer, `(() => { const area=document.querySelector(${JSON.stringify(`${cardSelector} .guideline-versions`)}); return area?.open && area.querySelector('[data-guideline-version-row="1"]') && area.querySelectorAll('.guideline-version-list li').length===3 && document.activeElement===area.querySelector('summary'); })()`, 'knowledge-versions-oldest-focus');
    await activateGuideline('[data-guideline-action="versions-latest"]', 'knowledge-versions-latest');
    await waitFor(renderer, `(() => { const area=document.querySelector(${JSON.stringify(`${cardSelector} .guideline-versions`)}); return area?.querySelector('[data-guideline-version-row="8"]') && area.querySelectorAll('.guideline-version-list li').length===5 && document.activeElement===area.querySelector('summary'); })()`, 'knowledge-versions-latest-focus');

    at('knowledge-procedures');
    // 工序与规则 (Issue #427, S79d; since Issue #1081, F-26a, the pre-installed procedure library): the nine review categories'
    // 工序 and baseline analysis by what each does, and since Issue #1164 确定性检查 at version 3 (local-text-check@3) as the
    // eleventh, plus factual claim stages, four editorial procedures (#1170) and, seventeenth and last, the composite 全文审校 v1 (#1173),
    // each 已启用 drawn solid with its version and its stages in order — none used
    // in this Journey — the review-only predecessor named above 可复用工序, and the 方案
    // in the house's words, 本社方案 v2, installed and enabled for the one Book that enabled it. Both layers (LAYER-008): the
    // words carry no identifier, and 查看技术详情, closed, holds the carrier's and the 权限侧车's identities and each 工序's id.
    await click(renderer, '工序与规则', 'knowledge-procedures-tab');
    await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab==='rules' && document.querySelector('.knowledge-procedures')?.dataset.procedureCount==='17' && document.querySelectorAll('.knowledge-procedure-list > li').length===17 && document.querySelector('[data-procedure-field=template]')`, 'knowledge-procedures-painted');
    const procedures = await renderer.evaluate(`(() => {
      const section = document.querySelector('.knowledge-procedures');
      const details = section?.querySelector(':scope > details.technical-details') ?? null;
      const decision = Array.from(section?.children ?? []).filter((child) => child !== details).map((child) => child.textContent).join('\\n');
      return {
        states: Array.from(document.querySelectorAll('.knowledge-procedure-list > li'), (item) => {
          const pill = item.querySelector('.status-pill');
          return [item.dataset.procedureState, pill?.textContent ?? null, item.dataset.procedureRuns, pill instanceof HTMLElement ? getComputedStyle(pill).borderTopStyle : null];
        }),
        first: document.querySelector('.knowledge-procedure-list > li')?.textContent ?? null,
        reasons: Array.from(document.querySelectorAll('.knowledge-procedure-list .procedure-reason'), (reason) => reason.textContent),
        artifact: document.querySelector('.knowledge-artifact-list > li')?.textContent ?? null,
        identifierInWords: /1\\.0\\.0|@ai7\\/|[0-9a-f]{64}|ai7-review-procedure|ai7-procedure\\//u.test(decision),
        detailsOpen: details === null ? null : details.open,
        summary: details?.querySelector('summary')?.textContent ?? null,
        technical: Array.from(details?.querySelectorAll(':scope > dl > dt') ?? [], (term) => [term.textContent, term.nextElementSibling?.textContent ?? null]),
      };
    })()`);
    const library = await renderer.evaluate(`({ stages: Array.from(document.querySelectorAll('.procedure-stages'), (node) => node.textContent), catalogs: document.querySelectorAll('.knowledge-procedure-list').length, baseline: document.querySelector('[data-procedure-id="ai7-procedure/baseline-analysis"]')?.textContent })`);
    requireJourney(library.stages.length === 17 && library.stages.every((value) => value.length > 0) && library.catalogs === 1 && library.baseline?.includes('跨单元归并与跨章一致性'), 'preinstalled-procedure-library', library);
    await assertRenderer(renderer, `(() => { const entries=document.querySelectorAll('.procedure-library li[data-procedure-version="2"]'); if(entries.length!==7)return false; return Array.from(entries).every((entry) => { const history=entry.querySelector('details.procedure-previous-versions'); if(!(history instanceof HTMLDetailsElement))return false; history.open=true; const row=history.querySelector('[data-procedure-previous-version="1"]'); return row?.textContent.startsWith('第 1 版 · ') === true && /^[0-9a-f]{64}$/u.test(row.dataset.procedureDigest ?? '') && !/[0-9a-f]{64}/u.test(row.textContent); }); })()`, 'preinstalled-review-v2-with-v1-history');
    await assertRenderer(renderer, `(() => {
      return [['style-and-format', '3', ['1', '2']], ['plot-consistency', '2', ['1']]].every(([category, version, previous]) => {
        const entry=document.querySelector('.procedure-library [data-procedure-id="ai7-procedure/review-'+category+'"]');
        const history=entry?.querySelector('details.procedure-previous-versions');
        if(entry?.dataset.procedureVersion!==version || !(history instanceof HTMLDetailsElement))return false;
        history.open=true;
        const rows=Array.from(history.querySelectorAll('[data-procedure-previous-version]'));
        return entry.querySelector('.procedure-stages')?.textContent.includes('跨单元归并与跨章一致性 → 跨章一致性') &&
          JSON.stringify(rows.map((row)=>row.dataset.procedurePreviousVersion))===JSON.stringify(previous) &&
          rows.every((row)=>row.textContent.startsWith('第 '+row.dataset.procedurePreviousVersion+' 版 · ') &&
            /^[0-9a-f]{64}$/u.test(row.dataset.procedureDigest ?? '') && !/[0-9a-f]{64}/u.test(row.textContent));
      });
    })()`, 'preinstalled-cross-chapter-history');
    requireJourney(JSON.stringify(procedures?.states) === JSON.stringify(Array(17).fill(['enabled', '已启用', '0', 'solid'])) &&
      procedures.first.includes('错别字与规范用语审阅工序 · 第 2 版') && JSON.stringify(procedures.reasons) === '[]' && procedures.artifact === null,
      'knowledge-procedures-list', procedures);
    // #1287: captured review procedures share the editable catalog; an empty captured section adds no second empty list.
    // Developer proposals keep their own empty state. Capturing/running/stopping a procedure remains covered by J-13.
    await waitFor(renderer, `document.querySelector('.knowledge-captured-procedures')?.dataset.procedureCount==='0' && document.querySelector('.knowledge-developer-proposals')?.dataset.proposalCount==='0'`, 'knowledge-captured-painted');
    const captured = await renderer.evaluate(`(() => { const section=document.querySelector('.procedure-library .knowledge-captured-procedures'); return [section?.dataset.procedureCount ?? null, section?.querySelector('.captured-procedures-empty')?.textContent ?? null, document.querySelector('.knowledge-developer-proposals .developer-proposals-empty')?.textContent ?? null, section?.querySelectorAll('[data-procedure-action]').length ?? null, document.querySelectorAll('.knowledge-procedure-list').length]; })()`);
    requireJourney(JSON.stringify(captured) === JSON.stringify(['0', null, '还没有开发建议。', 0, 1]),
      'knowledge-captured-empty', captured);

    // #1170: the editor creates and revises an immutable definition; incompatible dependency order is refused by name.
    at('knowledge-procedures');
    await assertRenderer(renderer, `(() => { document.querySelector('[data-procedure-field="template"]').value='ai7-procedure/baseline-analysis'; return true; })()`, 'editable-template-choice');
    await click(renderer, '新建工序', 'editable-create-open');
    await fill(renderer, '[data-procedure-editor] [data-procedure-field="title"]', 'J15 可编辑工序', 'editable-title');
    await fill(renderer, '[data-procedure-editor] [data-procedure-field="instruction"]', '保留作者短句。', 'editable-instruction');
    await fill(renderer, '[data-procedure-editor] ol li:first-child textarea', '语境明确时允许省略主语。', 'editable-exemption');
    await assertRenderer(renderer, `(() => { const rows=document.querySelectorAll('[data-procedure-editor] ol li'); rows[0].querySelector('input').value='60'; rows[0].querySelector('input').dispatchEvent(new Event('input')); rows[1].querySelector('input').value='40'; rows[1].querySelector('input').dispatchEvent(new Event('input')); Array.from(rows[0].querySelectorAll('button')).find(b=>b.textContent==='下移').click(); return true; })()`, 'editable-budget-and-order');
    await click(renderer, '保存为新版本', 'editable-incompatible-save');
    await waitFor(renderer, `document.querySelector('.procedure-library [role=status]')?.textContent.includes('阶段须为')`, 'editable-incompatible-order-named');
    await assertRenderer(renderer, `(() => { Array.from(document.querySelector('[data-procedure-editor] ol li').querySelectorAll('button')).find(b=>b.textContent==='下移').click(); return true; })()`, 'editable-restore-compatible-order');
    await click(renderer, '保存为新版本', 'editable-save-v1');
    await waitFor(renderer, `Array.from(document.querySelectorAll('.knowledge-procedure-list > li')).some(li=>li.querySelector('h4')?.textContent==='J15 可编辑工序 · 第 1 版')`, 'editable-created-v1');
    const editableV1 = await renderer.evaluate(`window.ai7.procedureLibrary({action:'inspect'}).then(page=>page.procedures.find(p=>p.document.title==='J15 可编辑工序'))`);
    requireJourney(editableV1?.document.editorInstruction==='保留作者短句。' && editableV1.document.stages[0].budgetShare===0.6 && editableV1.document.stages[0].exemptionRules[0]==='语境明确时允许省略主语。', 'editable-version-settings');
    await assertRenderer(renderer, `(() => { const card=document.querySelector('[data-procedure-id="${editableV1.procedureId}"]'); Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='改写为新版本').click(); return true; })()`, 'editable-edit-v1');
    await fill(renderer, '[data-procedure-editor] [data-procedure-field="instruction"]', '关注时间线。', 'editable-instruction-v2');
    await click(renderer, '保存为新版本', 'editable-save-v2');
    await waitFor(renderer, `document.querySelector('[data-procedure-id="${editableV1.procedureId}"]')?.dataset.procedureVersion==='2'`, 'editable-created-v2');
    await assertRenderer(renderer, `(async()=>{const p=(await window.ai7.procedureLibrary({action:'inspect'})).procedures.find(p=>p.procedureId==='${editableV1.procedureId}');return p.versions.length===2&&p.versions[1].digest==='${editableV1.digest}'&&p.documents[1].editorInstruction==='保留作者短句。'&&p.document.editorInstruction==='关注时间线。';})()`, 'editable-v1-unchanged');

    // ---- 知识库 › 资料库 (Issue #427, plan slice S79c; editor-surfaces §8.4, V2-UX-KB-007, ATTN-009, LEARN-004 to LEARN-007) ----
    at('knowledge-library-add');
    // Guideline imports consumed their picker; library intake owns a separate launch and picker answer.
    await closeBrowser();
    manager = await launch(SAMPLE1_PATH);
    renderer = await waitForRenderer(manager, 'library-picker-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'library-picker-ready');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'library-picker-knowledge');
    await click(renderer, '审阅规范文件', 'library-picker-knowledge-category');
    await readKnowledge(renderer, (page) => page.guidelines === 'ready', 'library-picker-knowledge-ready');
    // 放入资料… with sample1 as a book the editor collected: the file as it will arrive, named and said to be a 图书 by the
    // editor, then kept whole — deciding nothing: no attribution, no eligibility, and no Task may list it under 允许参考 yet.
    await click(renderer, '资料库', 'library-tab');
    const emptyLibrary = await readLibrary(renderer, (page) => page.state === 'ready', 'library-ready');
    requireJourney(emptyLibrary.count === '0' && emptyLibrary.empty === LIBRARY_EMPTY && emptyLibrary.cards.length === 0 && emptyLibrary.preview === null,
      'library-empty', emptyLibrary);
    const sample1 = await readFile(SAMPLE1_PATH);
    const sample1Digest = createHash('sha256').update(sample1).digest('hex');
    const libraryObjects = resolve(dataRoot, 'library-objects');
    await clickSelector(renderer, '[data-library-action="add"]', 'library-add');
    const libraryAdded = await readLibrary(renderer, (page) => page.preview === null && page.cards.length === 1, 'library-added');
    const [libraryCard] = libraryAdded.cards;
    requireJourney(libraryCard.title === LIBRARY_TITLE && libraryCard.kind === '资料' && libraryCard.attribution === 'house' && libraryCard.eligibility === 'house' && libraryCard.reference === 'available' && libraryCard.decisions === '2', 'library-added-card', libraryCard);
    await waitFor(renderer, `(document.querySelector('#persistence-status')?.textContent ?? '')===${JSON.stringify(`已放入资料库：「${LIBRARY_TITLE}」；已允许任务参考。`)}`, 'library-added-status', 10_000);
    // The original is kept byte for byte under its digest in the Agent Data Root, and the service reads it as the page does.
    const libraryKept = await readFile(resolve(libraryObjects, 'sha256', sample1Digest.slice(0, 2), `${sample1Digest}.docx`));
    requireJourney(libraryKept.equals(sample1), 'library-original-kept-whole');
    const materialId = libraryCard.id;
    const libraryService = await renderer.evaluate(`window.ai7.inspectLibraryMaterial({materialId:${JSON.stringify(materialId)}}).then((material)=>[material.source.sha256, material.attribution?.scope, material.eligibility?.choice, material.reference.state])`);
    requireJourney(JSON.stringify(libraryService) === JSON.stringify([sample1Digest, 'house', 'house', 'available']), 'library-added-service', libraryService);
    at('knowledge-library-attention');
    const immediateAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention().then((projection)=>projection.groups.flatMap((group)=>group.items).filter((item)=>item.object.kind==='library-material').length)`);
    requireJourney(immediateAttention === 0, 'library-no-pending-authorization', immediateAttention);
    at('knowledge-library-decide');
    // Existing attribution controls remain optional. Reassign this fixture to Book A for the following index and Series checks.
    await renderer.evaluate(`(async()=>{await window.ai7.decideLibraryMaterial({materialId:${JSON.stringify(materialId)},expectedDecisions:2,decision:{kind:'attribution',attribution:{scope:'book',bookId:${JSON.stringify(bookA)}}}});await window.ai7.decideLibraryMaterial({materialId:${JSON.stringify(materialId)},expectedDecisions:3,decision:{kind:'eligibility',choice:'book',reason:'责编确认可作本书参考。'}});})()`);
    await click(renderer, '审阅规范文件', 'library-refresh-guidelines');
    await click(renderer, '资料库', 'library-refresh');
    await readLibrary(renderer, (page) => page.cards[0]?.attribution === 'book' && page.cards[0]?.reference === 'available', 'library-decided');

    // ---- 资料索引 (Issue #428, plan slice S80a; editor-surfaces §8.4, V2-UX-KB-009, ATTN-009) ----------------------------
    at('knowledge-library-index');
    // Built on this machine as it arrived, nothing asked: four layers read — recognition is not needed for a Word file, sample1
    // is Chinese so it needs no 来源译文, and similarity vectors wait for the editor to ask (Issue #892), never built on open.
    // The anchors are positions: a Word file has no page numbers.
    const libraryIndexed = await readLibrary(renderer, (page) => page.cards[0]?.index === 'complete', 'library-index-built');
    const layers = new Map(libraryIndexed.cards[0].layers.map(([layer, state, line]) => [layer, [state, line]]));
    await assertRenderer(renderer, `(() => { const card=document.querySelector('article.library-material'); const warning=card?.querySelector(':scope > .knowledge-file-summary .knowledge-file-index'); return warning?.textContent==='索引：已在本机建好' && !warning.closest('.knowledge-file-more'); })()`, 'library-folded-index-warning');
    requireJourney(libraryIndexed.cards[0].indexLine === '已在本机建好' && layers.size === 7 &&
      JSON.stringify(layers.get('original')) === JSON.stringify(['complete', '已原样保存在本机']) &&
      layers.get('metadata')?.[0] === 'complete' && /^中文 · \d+ 段 · \d+ 个标题/u.test(layers.get('metadata')?.[1] ?? '') &&
      layers.get('text')?.[0] === 'complete' && /^已提取 \d+ 字$/u.test(layers.get('text')?.[1] ?? '') &&
      JSON.stringify(layers.get('recognition')) === JSON.stringify(['not-needed', '不需要：文件里就是文字']) &&
      JSON.stringify(layers.get('translation')) === JSON.stringify(['not-needed', '不需要：中文资料']) &&
      layers.get('segments')?.[0] === 'complete' && /^\d+ 段 · \d+ 句；每句可按「第 n 段第 m 句」引用（这种格式没有页码，锚点是位置）$/u.test(layers.get('segments')?.[1] ?? '') &&
      JSON.stringify(layers.get('vectors')) === JSON.stringify(['not-built', '未构建：可以「构建相似索引」（在本机建立，不发送任何内容）']) &&
      libraryIndexed.cards[0].layerActions.build === false && libraryIndexed.cards[0].layerActions.translation === null && libraryIndexed.cards[0].vectorSearch === null,
    'library-index-layers', libraryIndexed.cards[0].layers);
    const indexService = await renderer.evaluate(`window.ai7.inspectLibraryMaterial({ materialId: ${JSON.stringify(materialId)} }).then((material)=>[material.index.state, material.index.reason, /^[0-9a-f]{64}$/u.test(material.index.digest ?? ''), material.index.metadata?.language ?? null, material.index.metadata?.paragraphs ?? 0])`);
    requireJourney(indexService[0] === 'complete' && indexService[1] === null && indexService[2] === true && indexService[3] === 'zh' && indexService[4] > 16,
      'library-index-service', indexService);
    // 查看分段: sixteen paragraphs a page, each sentence with its position anchor, read-only.
    await clickSelector(renderer, `article.library-material[data-material-id="${materialId}"] [data-library-action="segments"]`, 'library-segments-open');
    const firstSegments = await readLibrary(renderer, (page) => page.cards[0]?.segments?.from === '1', 'library-segments-page');
    const firstPage = firstSegments.cards[0].segments;
    requireJourney(firstPage.items.length === 16 && firstPage.items[0][0] === '1' && firstPage.items.every(([ordinal, sentences], index) =>
      ordinal === String(index + 1) && sentences.length > 0 && sentences.every(([anchor, label], at) => anchor === `${ordinal}.${at + 1}` && label === `第 ${ordinal} 段第 ${at + 1} 句`)) &&
      firstPage.heading === `分段：第 1–16 段，共 ${firstPage.total} 段` && firstPage.total === String(indexService[4]) && firstPage.next === true && firstPage.previous === false,
    'library-segments-anchors', firstPage);
    await waitFor(renderer, `document.activeElement === document.querySelector('.material-segments-heading')`, 'library-segments-focus', 10_000);
    await clickSelector(renderer, '[data-library-action="segments-next"]', 'library-segments-next');
    const secondSegments = await readLibrary(renderer, (page) => page.cards[0]?.segments?.from === '17', 'library-segments-second');
    requireJourney(secondSegments.cards[0].segments.items[0][0] === '17' && secondSegments.cards[0].segments.previous === true, 'library-segments-second-page', secondSegments.cards[0].segments);
    await clickSelector(renderer, '[data-library-action="segments-previous"]', 'library-segments-previous');
    await readLibrary(renderer, (page) => page.cards[0]?.segments?.from === '1', 'library-segments-back');
    await clickSelector(renderer, '[data-library-action="segments-close"]', 'library-segments-close');
    await waitFor(renderer, `document.querySelector('.material-segments [data-library-action="segments"]') === document.activeElement`, 'library-segments-closed', 10_000);
    // 索引完成 sits in 最近完成, names the item and asks nothing: the count stays the decisions'.
    const indexItem = `library-index:${materialId}`;
    const indexSelector = `[data-screen="global-attention"] li.global-attention-item[data-attention-item=${JSON.stringify(indexItem)}]`;
    const indexAttention = await renderer.evaluate(`window.ai7.inspectGlobalAttention().then((projection)=>{ const group=projection.groups.find((entry)=>entry.items.some((item)=>item.itemId===${JSON.stringify(indexItem)})); const item=group?.items.find((entry)=>entry.itemId===${JSON.stringify(indexItem)}); return [group?.key ?? null, item?.state ?? null, item?.nextStep ?? null, item?.object.kind ?? null, item?.object.outcome ?? null, projection.actionableCount]; })`);
    requireJourney(JSON.stringify(indexAttention) === JSON.stringify(['recent', 'indexing-completed', 'view-material-index', 'library-index', 'complete', 0]), 'library-index-attention', indexAttention);
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('attention')), 'library-index-attention-entry');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(indexSelector)}) !== null`, 'library-index-attention-listed', 30_000);
    const indexListed = await renderer.evaluate(`(() => { const item=document.querySelector(${JSON.stringify(indexSelector)}); return { group: item.closest('section.global-attention-group')?.dataset.attentionGroup ?? null, pill: item.querySelector('.global-attention-pill')?.textContent ?? null, object: item.querySelector('.global-attention-object-name')?.textContent ?? null, next: item.querySelector('.global-attention-next')?.textContent ?? null }; })()`);
    requireJourney(indexListed.group === 'recent' && indexListed.pill === '索引完成' && indexListed.object === `资料索引 · 资料「${LIBRARY_TITLE}」` &&
      indexListed.next === '查看索引', 'library-index-attention-words', indexListed);
    await clickSelector(renderer, `${indexSelector} button.global-attention-open`, 'library-index-attention-open');
    await readLibrary(renderer, (page) => page.state === 'ready' && page.cards.some((card) => card.id === materialId && card.index === 'complete'), 'library-index-attention-opened');

    // 相似段落检索 (Issue #892): built on this machine only when the editor asks, by the built-in provider on this guest, then
    // searched with the runner's own words. Only anchors are read back here, never the paragraphs' words.
    at('knowledge-library-index-vectors');
    const vectorCard = `article.library-material[data-material-id="${materialId}"]`;
    await clickSelector(renderer, `${vectorCard} [data-library-action="build-vectors"]`, 'library-vectors-build');
    const vectorsBuilt = await readLibrary(renderer, (page) => page.cards.find((card) => card.id === materialId)?.layers.some(([layer, state]) => layer === 'vectors' && state === 'complete') === true, 'library-vectors-built');
    const vectorsLayer = vectorsBuilt.cards.find((card) => card.id === materialId).layers.find(([layer]) => layer === 'vectors');
    requireJourney(vectorsLayer[2] === `已构建：${indexService[4]} 段 · 本机内置相似向量（按字词相近）`, 'library-vectors-layer', vectorsLayer);
    const vectorsService = await renderer.evaluate(`window.ai7.inspectLibraryMaterial({ materialId: ${JSON.stringify(materialId)} }).then((material)=>[material.index.vectors?.state ?? null, material.index.vectors?.embedding ?? null, material.index.vectors?.built ?? null, material.index.vectors?.total ?? null])`);
    requireJourney(vectorsService[0] === 'complete' && vectorsService[1] === 'ai7-embedding/stub-1' && vectorsService[2] === indexService[4] && vectorsService[3] === indexService[4],
      'library-vectors-service', vectorsService);
    await fill(renderer, `${vectorCard} [data-library-field="vector-query"]`, '他们说话', 'library-vectors-query');
    await clickSelector(renderer, `${vectorCard} [data-library-action="vector-search"]`, 'library-vectors-search');
    const vectorsFound = await readLibrary(renderer, (page) => (page.cards.find((card) => card.id === materialId)?.vectorSearch?.candidates.length ?? 0) > 0, 'library-vectors-found');
    const search = vectorsFound.cards.find((card) => card.id === materialId).vectorSearch;
    requireJourney(/^相近段落：[1-5] 条（按相近程度排序；原文以分段为准）$/u.test(search.heading ?? '') && search.candidates.length <= 5 &&
      search.candidates.every(([ordinal, anchor]) => /^\d+$/u.test(ordinal ?? '') && anchor === `第 ${ordinal} 段`), 'library-vectors-candidates', search);

    at('j14-library-reflow-forced-colors');
    // At 200% the item, its decisions and an open choice reflow into the width; under forced colours the card and the choice keep
    // their borders.
    await clickSelector(renderer, '[data-library-action="attribute"]', 'library-reflow-chooser');
    await readLibrary(renderer, (page) => page.cards[0]?.chooser?.kind === 'attribution', 'library-reflow-chooser-open');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    // The sidebar shows icons only at this width, every row keeping its name (Issue #934; §0.3).
    await waitFor(renderer, SIDEBAR_ICONS_ONLY, 'sidebar-icons-only', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[document.querySelector('article.library-material'), document.querySelector('.library-chooser'), document.querySelector('.library-facts')]; return parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2; })()`, 'library-reflow', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const card = document.querySelector('article.library-material');
      const chooser = document.querySelector('.library-chooser');
      return card instanceof HTMLElement && getComputedStyle(card).borderTopStyle === 'solid' && chooser instanceof HTMLElement && getComputedStyle(chooser).borderTopStyle === 'solid';
    })()`, 'library-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await clickSelector(renderer, '[data-library-action="cancel-decision"]', 'library-reflow-cancel');
    await readLibrary(renderer, (page) => page.cards[0]?.chooser === null && page.focus?.action === 'attribute', 'library-reflow-cancelled');

    at('knowledge-library-bounded-readers');
    const longReason = '👨‍👩‍👧‍👦'.repeat(300);
    await clickSelector(renderer, '[data-library-action="eligibility"]', 'library-long-note-open');
    await readLibrary(renderer, (page) => page.cards[0]?.chooser?.kind === 'eligibility', 'library-long-note-ready');
    await clickSelector(renderer, '.library-eligibility-chooser [data-library-choice="book"]', 'library-long-note-choice');
    await fill(renderer, '[data-library-field="reason"]', longReason, 'library-long-note');
    await clickSelector(renderer, '[data-library-action="confirm-eligibility"]', 'library-long-note-save');
    await readLibrary(renderer, (page) => page.cards[0]?.decisions === '5' && page.cards[0].chooser === null, 'library-long-note-saved');
    const reader = 'article.library-material > .knowledge-file-more > .library-reason-reader';
    await clickSelector(renderer, `${reader} [data-library-action="read-reason"]`, 'library-full-note-open');
    let reconstructed = '';
    for (let part = 0; part < 4; part += 1) {
      await waitFor(renderer, `document.querySelector(${JSON.stringify(reader)})?.dataset.reasonOffset === '${part * 1024}' && document.querySelector(${JSON.stringify(`${reader} .library-reason-text`)}) === document.activeElement`, 'library-note-fragment-focus');
      const fragment = await renderer.evaluate(`(() => { const root=document.querySelector(${JSON.stringify(reader)}); return {text:root.querySelector('.library-reason-text').textContent,next:root.querySelector('[data-library-action="reason-next"]')!==null}; })()`);
      reconstructed += fragment.text;
      if (!fragment.next) break;
      await clickSelector(renderer, `${reader} [data-library-action="reason-next"]`, 'library-note-next');
    }
    requireJourney(reconstructed === longReason, 'library-complete-note-readable');
    await clickSelector(renderer, `${reader} [data-library-action="reason-close"]`, 'library-note-close');
    await waitFor(renderer, `document.activeElement === document.querySelector(${JSON.stringify(`${reader} [data-library-action="read-reason"]`)})`, 'library-note-close-focus');

    // These are the runner's reference-file labels, never manuscript content. Every arrival goes through the real picker,
    // review and commit; each launch grants exactly one picker choice. Twenty more arrivals cross the twenty-card boundary.
    for (let index = 0; index < 20; index += 1) {
      await closeBrowser();
      const referencePath = resolve(runRoot, `library-reference-${index}.txt`);
      await writeFile(referencePath, `AI7 library paging reference ${index}`, 'utf8');
      manager = await launch(referencePath);
      renderer = await waitForRenderer(manager, 'library-page-window');
      await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'library-page-ready');
      await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'library-page-knowledge');
      await click(renderer, '资料库', 'library-page-tab');
      await readLibrary(renderer, (page) => page.state === 'ready', 'library-page-loaded');
      await clickSelector(renderer, '[data-library-action="add"]', 'library-page-add');
      await readLibrary(renderer, (page) => page.preview === null && page.cards.length === Math.min(index + 2, 20), 'library-page-arrival');
    }
    for (let repeat = 0; repeat < 2; repeat += 1) {
      // The pager is released once the page's own read settles after the arrivals.
      await waitFor(renderer, `(() => { const more = document.querySelector('[data-library-action="more"]'); if (!(more instanceof HTMLButtonElement) || more.disabled) return false; more.click(); return true; })()`, 'library-page-next');
      await readLibrary(renderer, (page) => page.cards.length === 1 && page.cards[0].id === materialId && page.focus?.tag === 'H3', 'library-page-oldest');
      await waitFor(renderer, `(() => { const first = document.querySelector('[data-library-action="first"]'); if (!(first instanceof HTMLButtonElement) || first.disabled) return false; first.click(); return true; })()`, 'library-page-first');
      await readLibrary(renderer, (page) => page.cards.length === 20 && page.focus?.tag === 'H3', 'library-page-newest');
    }

    // 资料索引 of a non-Chinese reference (Issue #428; Issue #892): it offers 生成来源译文, which this guest's rule set does not
    // name — so the action is shown disabled, with 「当前策略未开放来源译文」 beside it, and nothing is ever made up. The newest
    // arrival is the runner's own English label.
    at('knowledge-library-index-translation');
    const englishIndexed = await readLibrary(renderer, (page) => page.cards[0]?.index === 'complete', 'library-index-english-built');
    const englishLayers = new Map(englishIndexed.cards[0].layers.map(([layer, state, line]) => [layer, [state, line]]));
    requireJourney(JSON.stringify(englishLayers.get('translation')) === JSON.stringify(['not-built', '未生成：非中文资料可以「生成来源译文」（每次至多 1,000 段）']) &&
      /^非中文 · 1 段/u.test(englishLayers.get('metadata')?.[1] ?? '') && englishLayers.get('segments')?.[0] === 'complete' &&
      englishIndexed.cards[0].layerActions.translation === true && englishIndexed.cards[0].layerActions.translationNote === '当前策略未开放来源译文' &&
      englishIndexed.cards[0].layerActions.described === true,
    'library-index-translation-not-admitted', englishIndexed.cards[0].layers);
    const translationService = await renderer.evaluate(`window.ai7.requestMaterialTranslation({ materialId: ${JSON.stringify(englishIndexed.cards[0].id)} }).then(() => 'requested', (error) => String(error?.code ?? error?.message ?? 'refused'))`);
    requireJourney(translationService !== 'requested', 'library-index-translation-refused', translationService);

    // 资料索引 of an EPUB (Issue #428): the runner's synthetic book arrives through the real picker, review and commit, and its
    // chapters are read on this machine in reading order into paragraphs with sentence anchors, under the book's own title.
    at('knowledge-library-index-formats');
    await closeBrowser();
    const epubPath = resolve(runRoot, 'library-reference-book.epub');
    await writeFile(epubPath, syntheticEpub());
    manager = await launch(epubPath);
    renderer = await waitForRenderer(manager, 'library-epub-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'library-epub-ready');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'library-epub-knowledge');
    await click(renderer, '资料库', 'library-epub-tab');
    await readLibrary(renderer, (page) => page.state === 'ready', 'library-epub-loaded');
    await clickSelector(renderer, '[data-library-action="add"]', 'library-epub-add');
    const epubIndexed = await readLibrary(renderer, (page) => page.cards[0]?.title === 'library-reference-book' && page.cards[0].index === 'complete', 'library-epub-indexed');
    const epubLayers = new Map(epubIndexed.cards[0].layers.map(([layer, state, line]) => [layer, [state, line]]));
    requireJourney(epubLayers.get('metadata')?.[1] === '中文 · 3 段 · 1 个标题 · 文件自带标题「合成电子书」' &&
      JSON.stringify(epubLayers.get('text')) === JSON.stringify(['complete', '已提取 30 字']) &&
      JSON.stringify(epubLayers.get('segments')) === JSON.stringify(['complete', '3 段 · 4 句；每句可按「第 n 段第 m 句」引用（这种格式没有页码，锚点是位置）']),
    'library-epub-layers', epubIndexed.cards[0].layers);
    const epubCard = `article.library-material[data-material-id="${epubIndexed.cards[0].id}"]`;
    await clickSelector(renderer, `${epubCard} [data-library-action="segments"]`, 'library-epub-segments-open');
    const epubSegments = await readLibrary(renderer, (page) => page.cards[0]?.segments?.from === '1', 'library-epub-segments');
    requireJourney(JSON.stringify(epubSegments.cards[0].segments.items) === JSON.stringify([
      ['1', [['1.1', '第 1 段第 1 句']]],
      ['2', [['2.1', '第 2 段第 1 句'], ['2.2', '第 2 段第 2 句']]],
      ['3', [['3.1', '第 3 段第 1 句']]],
    ]), 'library-epub-anchors', epubSegments.cards[0].segments);
    await clickSelector(renderer, `${epubCard} [data-library-action="segments-close"]`, 'library-epub-segments-close');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(`${epubCard} .material-segments [data-library-action="segments"]`)}) === document.activeElement`, 'library-epub-segments-closed', 10_000);
    // 资料索引 of a PDF (Issue #892): the runner's synthetic two-page PDF arrives through the real picker, review and commit; its
    // text layer is read on this machine into paragraphs, each cited by its page and its place on that page.
    await closeBrowser();
    const pdfPath = resolve(runRoot, 'library-reference.pdf');
    await writeFile(pdfPath, syntheticPdf());
    manager = await launch(pdfPath);
    renderer = await waitForRenderer(manager, 'library-pdf-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'library-pdf-ready');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'library-pdf-knowledge');
    await click(renderer, '资料库', 'library-pdf-tab');
    await readLibrary(renderer, (page) => page.state === 'ready', 'library-pdf-loaded');
    await clickSelector(renderer, '[data-library-action="add"]', 'library-pdf-add');
    const pdfIndexed = await readLibrary(renderer, (page) => page.cards[0]?.title === 'library-reference' && page.cards[0].index === 'complete', 'library-pdf-indexed');
    const pdfLayers = new Map(pdfIndexed.cards[0].layers.map(([layer, state, line]) => [layer, [state, line]]));
    requireJourney(pdfLayers.get('metadata')?.[1] === '中文 · 3 段 · 0 个标题 · 文件自带标题「合成 PDF」' && pdfLayers.get('text')?.[0] === 'complete' &&
      JSON.stringify(pdfLayers.get('recognition')) === JSON.stringify(['not-needed', '不需要：文件里就是文字']) &&
      JSON.stringify(pdfLayers.get('segments')) === JSON.stringify(['complete', '3 段 · 4 句 · 2 页；每句可按「第 p 页第 m 段第 s 句」引用']),
    'library-pdf-layers', pdfIndexed.cards[0].layers);
    const pdfCard = `article.library-material[data-material-id="${pdfIndexed.cards[0].id}"]`;
    await clickSelector(renderer, `${pdfCard} [data-library-action="segments"]`, 'library-pdf-segments-open');
    const pdfSegments = await readLibrary(renderer, (page) => page.cards[0]?.segments?.from === '1', 'library-pdf-segments');
    requireJourney(JSON.stringify(pdfSegments.cards[0].segments.items) === JSON.stringify([
      ['1', [['1.1', '第 1 页第 1 段第 1 句']]],
      ['2', [['2.1', '第 1 页第 2 段第 1 句'], ['2.2', '第 1 页第 2 段第 2 句']]],
      ['3', [['3.1', '第 2 页第 1 段第 1 句']]],
    ]), 'library-pdf-anchors', pdfSegments.cards[0].segments);
    await clickSelector(renderer, `${pdfCard} [data-library-action="segments-close"]`, 'library-pdf-segments-close');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(`${pdfCard} .material-segments [data-library-action="segments"]`)}) === document.activeElement`, 'library-pdf-segments-closed', 10_000);
    at('knowledge-library-bounded-readers');

    // Populate the Book chooser through the ordinary creation form, then retain one explicit choice across replacement pages.
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'library-books-landing');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'library-books-landed');
    for (let index = 0; index < 19; index += 1) {
      await createEmptyBook(renderer, `J15 分页图书${String(index).padStart(2, '0')}`);
      await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'library-books-return');
      await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'library-books-returned');
    }
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'library-books-knowledge');
    await click(renderer, '资料库', 'library-books-tab');
    await readLibrary(renderer, (page) => page.state === 'ready', 'library-books-ready');
    await clickSelector(renderer, 'article.library-material [data-library-action="attribute"]', 'library-books-open');
    await waitFor(renderer, `document.querySelectorAll('.library-attribution-chooser [data-library-choice^="book:"]').length===20`, 'library-books-first-page');
    const picked = await renderer.evaluate(`document.querySelector('.library-attribution-chooser [data-library-choice^="book:"]').value`);
    await clickSelector(renderer, `.library-attribution-chooser [data-library-choice="${picked}"]`, 'library-books-select');
    await clickSelector(renderer, '[data-library-action="more-books"]', 'library-books-next');
    await waitFor(renderer, `document.querySelectorAll('.library-attribution-chooser [data-library-choice^="book:"]').length===2 && document.querySelector('.library-attribution-chooser [data-library-choice="${picked}"]')?.checked===true`, 'library-books-retained');
    await clickSelector(renderer, '[data-library-action="first-books"]', 'library-books-first');
    await waitFor(renderer, `document.querySelectorAll('.library-attribution-chooser [data-library-choice^="book:"]').length===20 && document.querySelector('.library-attribution-chooser [data-library-choice="${picked}"]')?.checked===true`, 'library-books-first-retained');
    await clickSelector(renderer, '[data-library-action="confirm-attribution"]', 'library-books-commit');
    await readLibrary(renderer, (page) => page.cards[0]?.attribution === 'book' && page.cards[0].chooser === null, 'library-books-committed');

    at('knowledge-earlier-exemplar-import');
    await closeBrowser();
    const exemplarPath = resolve(runRoot, 'earlier-exemplar.txt');
    await writeFile(exemplarPath, '用于验证以前图书范例导入的虚构新闻稿。', 'utf8');
    manager = await launch(exemplarPath);
    renderer = await waitForRenderer(manager, 'earlier-exemplar-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'earlier-exemplar-ready');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.settings), 'exemplar-ordinary-settings');
    await waitFor(renderer, `document.querySelector('[data-screen="settings"]')`, 'exemplar-ordinary-settings-ready');
    await click(renderer, '帮助', 'exemplar-ordinary-help');
    await waitFor(renderer, `document.querySelector('.help-developer-mode input')?.disabled===false`, 'exemplar-mode-ready');
    await assertRenderer(renderer, `(() => { const input=document.querySelector('.help-developer-mode input'); if(!(input instanceof HTMLInputElement)||input.disabled) return false; if(input.checked) input.click(); return document.documentElement.dataset.technicalLayerVisible==='false' && localStorage.getItem('ai7.technicalLayerVisible')==='false'; })()`, 'exemplar-ordinary-mode');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'earlier-exemplar-knowledge');
    await waitFor(renderer, `document.querySelector('.knowledge-category[data-knowledge-category="exemplars"]')?.textContent.includes('不含图书原稿')`, 'exemplar-category-copy');
    await click(renderer, '范例', 'earlier-exemplar-tab');
    await waitFor(renderer, `document.querySelector('[data-exemplar-action="import"]')`, 'earlier-exemplar-open-ready');
    await click(renderer, '导入以前图书的范例', 'earlier-exemplar-open');
    await fill(renderer, '.exemplar-import-form label:nth-child(1) input', '以前出版的测试图书', 'earlier-exemplar-title');
    await fill(renderer, '.exemplar-import-form label:nth-child(2) input', '测试作者', 'earlier-exemplar-author');
    await fill(renderer, '.exemplar-import-form label:nth-child(3) input', '测试责编', 'earlier-exemplar-editor');
    await click(renderer, '选择文件', 'earlier-exemplar-file');
    await waitFor(renderer, `document.querySelector('.exemplar-import-form select')?.disabled===false`, 'earlier-exemplar-preview');
    // No type is preselected and 导入范例 waits for the editor's choice (Issue #778); the choice is made as the editor makes it.
    await assertRenderer(renderer, `(() => { const form = document.querySelector('.exemplar-import-form'); const select = form?.querySelector('select'); const submit = Array.from(form?.querySelectorAll('button') ?? []).find((button) => button.textContent === '导入范例'); return select?.value === '' && select.options[0]?.textContent === '请选择文档类型' && submit?.disabled === true; })()`, 'earlier-exemplar-type-unchosen');
    await assertRenderer(renderer, `(() => { const select = document.querySelector('.exemplar-import-form select'); select.value='news-release'; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value==='news-release'; })()`, 'earlier-exemplar-type');
    await waitFor(renderer, `Array.from(document.querySelectorAll('.exemplar-import-form button')).find((button) => button.textContent === '导入范例')?.disabled === false`, 'earlier-exemplar-type-chosen');
    await click(renderer, '导入范例', 'earlier-exemplar-confirm');
    await waitFor(renderer, `document.querySelector('.exemplar-book .exemplar-designation')?.textContent.startsWith('以前出版的图书 · 导入于')`, 'earlier-exemplar-imported');
    await assertRenderer(renderer, `(() => {
      const card = document.querySelector('.exemplar-book');
      return card.querySelector('.exemplar-title')?.textContent==='《以前出版的测试图书》新闻稿' &&
        card.querySelector('.exemplar-kind-badge')?.textContent==='工作文档 · 新闻稿' &&
        card.querySelector('.exemplar-context')?.textContent.startsWith('来自《以前出版的测试图书》') &&
        !card.querySelector('.knowledge-file-more') &&
        card.querySelector('.exemplar-attribution')?.textContent==='作者：测试作者 · 责编：测试责编' &&
        card.querySelector('[data-exemplar-type="news-release"]')?.textContent.includes('版本 1') &&
        card.querySelector('[data-exemplar-type="news-release"]')?.textContent.includes('仅本社');
    })()`, 'earlier-exemplar-grouped');
    await assertRenderer(renderer, `(() => { const select = document.querySelector('.exemplar-items select'); select.value='excluded'; return true; })()`, 'earlier-exemplar-exclude');
    await clickSelector(renderer, '.exemplar-items [data-exemplar-action="record-eligibility"]', 'earlier-exemplar-eligibility');
    await waitFor(renderer, `document.querySelector('.exemplar-items li')?.textContent.includes('学习准入：明确排除')`, 'earlier-exemplar-excluded');
    await clickSelector(renderer, '[data-exemplar-filter="kind"] [data-filter-value="news-release"]', 'exemplar-type-filter');
    await clickSelector(renderer, '[data-exemplar-filter="book"] button:nth-child(2)', 'exemplar-book-filter');
    await assertRenderer(renderer, `document.documentElement.dataset.technicalLayerVisible==='false' && document.querySelectorAll('.exemplar-entry').length===1 && document.querySelector('[data-exemplar-filter="kind"]').dataset.value==='news-release' && document.querySelector('.exemplar-kind-badge').textContent==='工作文档 · 新闻稿'`, 'exemplar-combined-filters');
    await clickSelector(renderer, '[data-exemplar-filter="kind"] [data-filter-value=""]', 'exemplar-type-return');
    await assertRenderer(renderer, `document.querySelectorAll('.exemplar-entry').length===1 && document.querySelector('[data-exemplar-filter="book"]').dataset.value!==''`, 'exemplar-book-selection-survives');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.settings), 'exemplar-restore-settings');
    await waitFor(renderer, `document.querySelector('[data-screen="settings"]')`, 'exemplar-restore-settings-ready');
    await click(renderer, '帮助', 'exemplar-restore-help');
    await waitFor(renderer, `document.querySelector('.help-developer-mode input')?.disabled===false`, 'exemplar-restore-mode-ready');
    await assertRenderer(renderer, `(() => { const input=document.querySelector('.help-developer-mode input'); if(!(input instanceof HTMLInputElement)||input.disabled) return false; if(!input.checked) input.click(); return document.documentElement.dataset.technicalLayerVisible==='true' && localStorage.getItem('ai7.technicalLayerVisible')==='true'; })()`, 'exemplar-restore-developer');

    // ---- 外部 Skill 的更新 (Issue #89, S33; ADR 0090 §3, ADR 0045 § Update and rollback; REUSE-032 to REUSE-035) ----
    // Synthetic Skill packages only: tests/fixtures/skills/plain (and its v2/v3 variants). The picker answers one choice per
    // window, so each package is read in a window launched with it; the native dialog is not driven. Nothing here fetches or runs.
    const SKILLS = resolve(ROOT, 'tests', 'fixtures', 'skills');
    const openSkills = async (label) => {
      await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, `${label}-ready`);
      await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), `${label}-knowledge`);
      await click(renderer, '工序与规则', `${label}-rules`);
      await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab==='rules' && document.querySelector('[data-skill-action="import"]')`, `${label}-skills`);
    };
    const relaunchWith = async (pickerPath, name) => {
      await closeBrowser();
      manager = await launch(pickerPath);
      renderer = await waitForRenderer(manager, `${name}-window`);
      await openSkills(name);
    };

    at('skill-update-seed');
    await relaunchWith(resolve(SKILLS, 'plain'), 'skill-update-seed');
    // Issue #1410 item 27: the picked package is kept, validated and installed in one step, with the Books offered.
    await clickSelector(renderer, '[data-skill-action="import"]', 'skill-seed-pick');
    await waitFor(renderer, `document.querySelector('[data-skill-detail]')?.dataset.skillState==='installed-disabled' && document.querySelectorAll('[data-skill-field="book"] option').length>1`, 'skill-seed-installed');
    const skillId = await renderer.evaluate(`document.querySelector('[data-skill-detail]')?.dataset.skillOwner`);
    const firstRevision = await renderer.evaluate(`document.querySelector('[data-skill-detail]')?.dataset.skillDetail`);
    requireJourney(/^[0-9a-f-]{36}$/u.test(skillId ?? '') && /^[0-9a-f-]{36}$/u.test(firstRevision ?? ''), 'skill-seed-identities', { skillId, firstRevision });
    await assertRenderer(renderer, `(() => { const select=document.querySelector('[data-skill-field="book"]'); select.value=select.options[1].value; select.dispatchEvent(new Event('change',{bubbles:true})); return select.value!==''; })()`, 'skill-seed-book-chosen');
    await clickSelector(renderer, '[data-skill-action="enable"]', 'skill-seed-enable');
    await waitFor(renderer, `document.querySelector('[data-skill-detail]')?.dataset.skillState==='enabled'`, 'skill-seed-enabled');

    at('skill-update-check-from-file');
    await relaunchWith(resolve(SKILLS, 'plain-v2-text'), 'skill-update-check');
    await clickSelector(renderer, '[data-skill-action="inspect"]', 'skill-check-open-card');
    await waitFor(renderer, `document.querySelector('[data-skill-detail]')?.dataset.skillCurrent==='true' && document.querySelector('[data-skill-action="check-update"]')`, 'skill-check-card');
    await clickSelector(renderer, '[data-skill-action="check-update"]', 'skill-check-pick');
    // A newer update is kept the moment it is read (Issue #1410 item 27): one inert candidate, nothing else changed.

    at('skill-update-candidate-inert');
    await waitFor(renderer, `document.querySelector('[data-skill-candidate]')?.dataset.skillDisposition==='clean' && document.querySelector('[data-skill-candidate]')?.dataset.skillCandidateStatus==='open'`, 'skill-check-candidate');
    // One inert candidate: the three-way summary and its per-file list; the revision, its state and its enablement are as they were.
    await assertRenderer(renderer, `(async () => {
      const card=document.querySelector('[data-skill-candidate]'); const text=card?.textContent??'';
      const read=await window.ai7.inspectImportedSkills({revisionId:${JSON.stringify(firstRevision)},before:null});
      return text.includes('三方对照') && text.includes('之前的来源快照') && text.includes('当前工作修订') && text.includes('新的来源快照') && text.includes('无冲突、校验通过、未扩权') &&
        card.querySelector('[data-skill-file="SKILL.md"]')?.dataset.skillFileChange==='upstream' && read.candidates.length===1 && read.candidates[0].status==='open' &&
        read.history.length===1 && read.history[0].current && read.history[0].revisionId===${JSON.stringify(firstRevision)} && read.revision.state==='enabled' && read.revision.enabledBooks.length===1 &&
        read.rule.active===false && read.skills[0].revisionId===${JSON.stringify(firstRevision)};
    })()`, 'skill-check-nothing-else-changed');

    at('skill-update-adopt');
    await clickSelector(renderer, '[data-skill-action="adopt"]', 'skill-adopt');
    await waitFor(renderer, `document.querySelector('[data-skill-detail]')?.dataset.skillState==='pending-validation' && document.querySelector('[data-skill-detail]')?.dataset.skillCurrent==='true' && document.querySelector('[data-skill-detail]')?.dataset.skillDetail!==${JSON.stringify(firstRevision)}`, 'skill-adopted-new-revision');
    const secondRevision = await renderer.evaluate(`document.querySelector('[data-skill-detail]')?.dataset.skillDetail`);

    at('skill-update-new-revision-not-enabled');
    // The adopted revision is first 待验证 and not enabled; the earlier one keeps its own ledger and is no longer current.
    await assertRenderer(renderer, `(async () => {
      const detail=document.querySelector('[data-skill-detail]');
      const now=await window.ai7.inspectImportedSkills({revisionId:${JSON.stringify(secondRevision)},before:null});
      const earlier=await window.ai7.inspectImportedSkills({revisionId:${JSON.stringify(firstRevision)},before:null});
      return !detail.querySelector('[data-skill-action="install"], [data-skill-action="enable"]') && now.revision.ordinal===2 && now.revision.enabledBooks.length===0 &&
        now.revision.previousRevisionId===${JSON.stringify(firstRevision)} && now.history.length===2 && now.history[0].current && now.history[0].origin==='adopt' && !now.history[1].current &&
        earlier.revision.state==='enabled' && earlier.revision.enabledBooks.length===1 && now.candidates[0].status==='adopted' && now.candidates[0].adoptedBy==='editor' &&
        document.querySelector('[data-skill-updates]')?.textContent.includes('当前');
    })()`, 'skill-adopted-not-enabled');
    await clickSelector(renderer, '[data-skill-action="validate"]', 'skill-adopted-validate');
    await waitFor(renderer, `document.querySelector('[data-skill-detail]')?.dataset.skillState==='validated'`, 'skill-adopted-validated');

    at('skill-update-rule-create');
    // Creating the rule is its confirmation (Issue #1410 item 27); what it does is said beside 创建.
    await waitFor(renderer, `document.querySelector('[data-skill-action="rule-create"]')?.disabled===false && !document.querySelector('[data-skill-field="rule-confirm"]')`, 'skill-rule-ready');
    await clickSelector(renderer, '[data-skill-action="rule-create"]', 'skill-rule-create');
    await waitFor(renderer, `document.querySelector('[data-skill-rule]')?.dataset.skillRule==='active'`, 'skill-rule-active');
    await assertRenderer(renderer, `(async () => {
      const read=await window.ai7.inspectImportedSkills({revisionId:${JSON.stringify(secondRevision)},before:null});
      return read.rule.active===true && read.rule.history.length===1 && read.revision.enabledBooks.length===0 && document.querySelector('[data-skill-rule]').textContent.includes('不会安装或启用任何东西');
    })()`, 'skill-rule-recorded');

    at('skill-update-rule-clean-auto-adopt');
    await relaunchWith(resolve(SKILLS, 'plain-v3-text'), 'skill-update-rule');
    await clickSelector(renderer, '[data-skill-action="inspect"]', 'skill-rule-open-card');
    await waitFor(renderer, `document.querySelector('[data-skill-detail]')?.dataset.skillDetail===${JSON.stringify(secondRevision)} && document.querySelector('[data-skill-rule]')?.dataset.skillRule==='active'`, 'skill-rule-survived-restart');
    await clickSelector(renderer, '[data-skill-action="check-update"]', 'skill-rule-pick');
    await waitFor(renderer, `document.querySelector('[data-skill-candidate]')?.dataset.skillCandidateStatus==='adopted' && document.querySelector('[data-skill-detail]')?.dataset.skillState==='pending-validation'`, 'skill-rule-adopted');
    const thirdRevision = await renderer.evaluate(`document.querySelector('[data-skill-detail]')?.dataset.skillDetail`);
    requireJourney(/^[0-9a-f-]{36}$/u.test(thirdRevision ?? '') && thirdRevision !== secondRevision && thirdRevision !== firstRevision, 'skill-rule-new-revision', { thirdRevision });
    await assertRenderer(renderer, `(async () => {
      const read=await window.ai7.inspectImportedSkills({revisionId:${JSON.stringify(thirdRevision)},before:null});
      return read.revision.ordinal===3 && read.revision.enabledBooks.length===0 && read.history.length===3 && read.history[0].current && read.history[0].origin==='rule' &&
        read.candidates[0].adoptedBy==='rule' && read.candidates[0].disposition==='clean' && !document.querySelector('[data-skill-detail] [data-skill-action="enable"]');
    })()`, 'skill-rule-auto-adopted-clean-only');

    at('skill-update-rollback-current-selection');
    await clickSelector(renderer, `[data-skill-revision="${firstRevision}"] [data-skill-action="rollback"]`, 'skill-rollback');
    await waitFor(renderer, `document.querySelector('[data-skill-detail]')?.dataset.skillDetail===${JSON.stringify(firstRevision)} && document.querySelector('[data-skill-detail]')?.dataset.skillCurrent==='true'`, 'skill-rolled-back');
    // History is whole; the revision returned to stands at 已安装（未启用）: its earlier enablement is not restored.
    await assertRenderer(renderer, `(async () => {
      const read=await window.ai7.inspectImportedSkills({revisionId:${JSON.stringify(firstRevision)},before:null});
      return document.querySelector('[data-skill-detail]').dataset.skillState==='installed-disabled' && read.revision.enabledBooks.length===0 && read.history.length===3 &&
        read.history.find((entry)=>entry.current)?.revisionId===${JSON.stringify(firstRevision)} && read.history.find((entry)=>entry.current)?.selectedReason==='rollback' &&
        read.skills[0].revisionId===${JSON.stringify(firstRevision)};
    })()`, 'skill-rollback-selection-not-enablement');
    await closeBrowser();
    manager = await launch();
    renderer = await waitForRenderer(manager, 'skill-rollback-restart-window');
    await openSkills('skill-rollback-restart');
    await assertRenderer(renderer, `(async () => {
      const read=await window.ai7.inspectImportedSkills({revisionId:null,before:null});
      return read.skills.length===1 && read.skills[0].revisionId===${JSON.stringify(firstRevision)} && read.skills[0].state==='installed-disabled' && document.querySelector('.imported-skill-list li')?.dataset.skillState==='installed-disabled';
    })()`, 'skill-rollback-survives-restart');

    at('word-persisted-source-lineage');
    const wordPath = resolve(runRoot, 'word-persisted-lineage.docx');
    await composeRevisedAdmittedDocx(wordPath, { source: ADMITTED_BASELINE_DOCX, title: 'Word 来源沿袭旅程', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } },
        { text: { block: 9, from: 0, to: 5 }, revision: { kind: 'del', author: '作者甲', date: '2026-10-25T00:00:00Z' } },
        { text: { block: 10, from: 0, to: 6 }, revision: { kind: 'ins', author: '作者乙', date: '2026-10-25T00:00:01Z' } }] },
    ] });
    await closeBrowser(); manager = await launch(wordPath);
    renderer = await waitForRenderer(manager, 'word-lineage-window');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'word-lineage-landing');
    await click(renderer, '导入稿件', 'word-lineage-pick');
    await waitFor(renderer, `document.querySelector('[data-import-target-choice="new-book"]')`, 'word-lineage-target');
    await assertRenderer(renderer, `(() => { const input=document.querySelector('[data-import-target-choice="new-book"]');if(!(input instanceof HTMLInputElement))return false;input.click();return true;})()`, 'word-lineage-new-book');
    await waitFor(renderer, `document.querySelector('[data-import-relationship="first-manuscript"]')`, 'word-lineage-relationship');
    await assertRenderer(renderer, `(() => { const input=document.querySelector('[data-import-relationship="first-manuscript"]');if(!(input instanceof HTMLInputElement))return false;input.click();return true;})()`, 'word-lineage-first-manuscript');
    await waitFor(renderer, `document.querySelector('[data-word-import-controls="ready"]')`, 'word-lineage-controls');
    await assertRenderer(renderer, `(() => {const mode=document.querySelector('[data-word-import-mode="accepted-baseline"]');if(!(mode instanceof HTMLInputElement)||mode.disabled)return false;mode.click();/* Issue #1410 item 32A: choosing 定稿基线 is its confirmation. */return mode.checked&&!document.querySelector('[data-word-accepted-baseline-confirmation]')&&document.querySelector('[data-word-learn-from-edits]')?.checked===true;})()`, 'word-lineage-explicit-accepted-choice');
    await click(renderer, '查看导入详情', 'word-lineage-prepare');
    await waitFor(renderer, `document.querySelector('[data-word-reviewed-mode="accepted-baseline"][data-word-reviewed-learning="true"]')`, 'word-lineage-reviewed');
    await click(renderer, '新建图书并导入稿件', 'word-lineage-commit');
    await waitFor(renderer, `document.querySelector('[data-screen="imported"]')&&document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, 'word-lineage-committed');
    const wordSignal = await renderer.evaluate(`window.ai7.inspectEditorialLearning({signalOffset:0,itemOffset:0}).then(page=>page.signals.find(signal=>signal.kind==='word-tracked-edit'))`);
    requireJourney(wordSignal?.currentEligibility==='house'&&wordSignal.memoryCandidate===null, 'word-lineage-real-admission');
    const wordRead = `(async()=>{const lineage=await window.ai7.inspectLearningLineage({bookId:${JSON.stringify(wordSignal.source.bookId)},materialKey:${JSON.stringify(wordSignal.source.materialKey)}});const detail=await window.ai7.inspectWordTrackedEditSample({bookId:${JSON.stringify(wordSignal.source.bookId)},sampleId:${JSON.stringify(wordSignal.source.sampleId)},sampleDigest:${JSON.stringify(wordSignal.source.sampleDigest)},after:null});return {lineage,detail};})()`;
    const wordBefore = await renderer.evaluate(wordRead);
    requireJourney(wordBefore.lineage.automaticAdmission?.choice==='house'&&wordBefore.lineage.decisions.length===0&&
      wordBefore.detail.sourceVersionId===wordSignal.source.sourceVersionId&&wordBefore.detail.sourceDigest===wordSignal.source.sourceDigest, 'word-lineage-exact-source-before-restart');
    await closeBrowser(); manager = await launch();
    renderer = await waitForRenderer(manager, 'word-lineage-restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true'&&document.querySelector('[data-screen="landing"]')`, 'word-lineage-restart-product-ready');
    // 书库 renders the landing again after its own startup reads; mark the startup landing so paging begins on that new
    // render, which would otherwise replace pages appended meanwhile (Issue #1156 rev 2).
    await assertRenderer(renderer, `(() => { const node=document.querySelector('[data-screen="landing"]')?.firstElementChild; if(!(node instanceof HTMLElement))return false; node.dataset.j15StartupLanding='true'; return true; })()`, 'word-lineage-restart-mark-landing');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('library')), 'word-lineage-restart-library');
    await waitFor(renderer, `(() => { const node=document.querySelector('[data-screen="landing"]')?.firstElementChild; return node instanceof HTMLElement && node.dataset.j15StartupLanding!=='true'; })()`, 'word-lineage-restart-ready');
    while (!(await renderer.evaluate(`Boolean(document.querySelector('button[data-book-id="${wordSignal.source.bookId}"]'))`))) {
      const shownBooks = await renderer.evaluate(`document.querySelectorAll('[data-screen="landing"] .book-summary-item').length`);
      await click(renderer, '加载更多图书', 'word-lineage-restart-more-books');
      await waitFor(renderer, `document.querySelectorAll('[data-screen="landing"] .book-summary-item').length > ${shownBooks}`,
        'word-lineage-restart-next-books');
    }
    await clickBook(renderer, wordSignal.source.bookId, 'word-lineage-restart-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id="${wordSignal.source.bookId}"] [data-testid="manuscript-editor"] > [data-block-id]')`, 'word-lineage-restart-book-ready');
    const wordAfter = await renderer.evaluate(wordRead);
    requireJourney(JSON.stringify(wordAfter)===JSON.stringify(wordBefore), 'word-lineage-and-full-source-survive-restart');

    // Select an editable deterministic version, execute the admitted public Book offline, then capture the completed Run.
    at('knowledge-procedures');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'editable-run-knowledge');
    await waitFor(renderer, `document.querySelector('.knowledge-base')`, 'editable-run-knowledge-ready');
    await click(renderer, '工序与规则', 'editable-run-rules');
    await waitFor(renderer, `document.querySelector('[data-procedure-field="template"]')`, 'editable-run-library-ready');
    await assertRenderer(renderer, `(() => { document.querySelector('[data-procedure-field="template"]').value='ai7-procedure/local-text-check'; return true; })()`, 'editable-local-template');
    await click(renderer, '新建工序', 'editable-local-create');
    await fill(renderer, '[data-procedure-editor] [data-procedure-field="title"]', 'J15 离线工序', 'editable-local-title');
    await assertRenderer(renderer, `document.querySelector('[data-procedure-editor] [data-procedure-field="instruction"]')?.disabled===true`, 'editable-local-no-language-interpreter');
    await click(renderer, '保存为新版本', 'editable-local-save');
    await waitFor(renderer, `Array.from(document.querySelectorAll('.knowledge-procedure-list h4')).some(h=>h.textContent==='J15 离线工序 · 第 1 版')`, 'editable-local-saved');
    const localProcedure = await renderer.evaluate(`window.ai7.procedureLibrary({action:'inspect'}).then(page=>page.procedures.find(p=>p.document.title==='J15 离线工序'))`);
    await assertRenderer(renderer, `(() => { const card=document.querySelector('[data-procedure-id="${localProcedure.procedureId}"]'); Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='运行此工序…').click(); return true; })()`, 'editable-local-run-choice');
    await waitFor(renderer, `document.querySelector('[data-procedure-field="book"]')?.options.length>0`, 'editable-local-books');
    await assertRenderer(renderer, `(() => { const select=document.querySelector('[data-procedure-field="book"]'); select.value='${wordSignal.source.bookId}'; return select.value==='${wordSignal.source.bookId}'; })()`, 'editable-local-book-pin');
    await click(renderer, '打开任务', 'editable-local-open-task');
    await waitFor(renderer, `document.querySelector('[data-review-action="new-local-check"]')?.disabled===false`, 'editable-local-entry');
    await assertRenderer(renderer, `(() => { document.querySelector('[data-review-action="new-local-check"]').click(); return true; })()`, 'editable-local-options');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true`, 'editable-local-options-ready');
    await waitFor(renderer, `document.querySelector('[data-procedure-definition="${localProcedure.procedureId}@1"]') && document.querySelector('dialog.review-sheet input[name="review-category"][value="local-text-check"]')?.checked===true && document.querySelector('dialog.review-sheet [data-review-action="prepare"]')?.disabled===false`, 'editable-local-definition-ready');
    await assertRenderer(renderer, `(() => { const sheet=document.querySelector('dialog.review-sheet'); if(sheet.querySelector('[data-local-check-prose]')?.checked!==true)return false; const button=sheet.querySelector('[data-review-action="prepare"]'); if(button.disabled)return false; button.click(); return true; })()`, 'editable-local-prepare');
    await launchReviewFromSheet(renderer, waitFor);
    const localRun = await renderer.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(p=>p.run)`);
    requireJourney(localRun.preinstalledProcedures.some(p=>p.procedure.procedureId===localProcedure.procedureId&&p.procedure.digest===localProcedure.digest), 'editable-run-exact-pin');
    await waitFor(renderer, `document.querySelector('[data-local-check="materialized"]') && document.querySelector('.review-workspace-card')?.dataset.reviewState==='settled'`, 'editable-local-completed');
    await assertRenderer(renderer, sidebarNavigate(SIDEBAR.destination('knowledge')), 'editable-capture-knowledge');
    await waitFor(renderer, `document.querySelector('.knowledge-base')`, 'editable-capture-knowledge-ready');
    await click(renderer, '工序与规则', 'editable-capture-rules');
    await waitFor(renderer, `document.querySelector('[data-procedure-field="capture-run"]')`, 'editable-capture-available');
    await assertRenderer(renderer, `(() => { const select=document.querySelector('[data-procedure-field="capture-run"]'); select.value='${localRun.reviewRunId}'; return select.value==='${localRun.reviewRunId}'; })()`, 'editable-capture-source');
    await click(renderer, '从本次运行捕获', 'editable-capture-open');
    await fill(renderer, '[data-procedure-editor] [data-procedure-field="title"]', 'J15 已完成运行工序', 'editable-capture-title');
    await click(renderer, '保存为新版本', 'editable-capture-save');
    await waitFor(renderer, `Array.from(document.querySelectorAll('.knowledge-procedure-list h4')).some(h=>h.textContent==='J15 已完成运行工序 · 第 1 版')`, 'editable-capture-saved');
    await assertRenderer(renderer, `(async()=>{const page=await window.ai7.procedureLibrary({action:'inspect'});const p=page.procedures.find(p=>p.document.title==='J15 已完成运行工序');const old=page.procedures.find(p=>p.procedureId==='${editableV1.procedureId}');return p.sourceRunId==='${localRun.reviewRunId}'&&p.executorKind==='local-text-check'&&old.version===2&&old.versions[1].digest==='${editableV1.digest}';})()`, 'editable-capture-and-history-retained');

    at('zero-activity');
    await assertRenderer(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && !Object.keys(window.ai7).some((key)=>/provider|session/i.test(key))`, 'exact-service-readiness-remained-zero');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-network-provider-session');
    await closeBrowser();
    await loopback.close();
  } finally {
    finalCleanupRequested = true;
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch((error) => reportJourneyFailure('J-15', location, error));
