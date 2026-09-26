import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADMITTED_BASELINE_DOCX, IMPORTED_MARKS_AUTHOR, admittedParagraphShapes, admittedParagraphs, admittedSpanText, composeAdmittedDocx, composeExportAdmittedDocx, readExportedDocx } from './composed-docx.mjs';
import { attachProductOutput, installJourneyCancellationCleanup, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';

// J-07 (Issue #414, plan slice S65): ⑥ 发稿. An editor saves Milestone Versions of the manuscript — each
// purpose chosen from an unselected card set, never typed and never preselected — finds them on 交付物 with
// 自「标签」后有修改 once the manuscript changes, and designates one exact milestone 发稿版本 with a 发稿范围
// and a 依据, the fixed sentence on screen before the confirm. An identical repeat records nothing, an edit
// raises the change notice, a newer designation is a separate record that leaves the older one as it was,
// and a restart moves nothing. Nothing is sent or published, and no page says anything was.
//
// Issue #413 (plan slice S64, E6) extends it with ④ 导出 · DOCX: the input also carries a header, a styled run
// in a paragraph no stage edits, and one comment and one tracked replacement by the file's author; the editor
// adds one 备注. 导出… of the current revision saves the unsaved edits as a revision, reviews its fidelity, takes
// the destination from the Save dialog's launch control, and 按上述方式导出 writes the file, whose receipt 交付物
// lists and a restart keeps. The runner reads the written file itself — the comment and the tracked change by
// their author, the header byte for byte, the untouched paragraph's bold run, and no 备注. Cancelling after the
// destination was chosen writes nothing, and the card is reached by keyboard, reflows at 200% and keeps its
// shapes without colour.
//
// Issue #500 (plan slice S64b) adds the two formats laid out from the manuscript's words. Two more launches, each
// with its own Save-dialog answer, export the same revision as PDF and as the Markdown 备用格式: choosing the format
// reviews again, and the review is the format's own — every class of the file beyond the words named 无法导出, the
// marks kept only as words 降级导出. The PDF is printed by AI7 itself from the page the preparation bound; the runner
// finds a PDF on disk, byte for byte the receipt's, and nothing of the print left in AI7's staging folder. The
// Markdown it reads itself: every paragraph the manuscript's words at its heading level, the author's 批注 a
// footnote under their name, the tracked replacement CriticMarkup, and no 备注.
//
// The input is composed at run time from the one admitted Public SampleBook under the content rule in
// docs/agents/ci-test-boundaries.md; every string this runner types is authored here, and the only
// manuscript text it touches — the paragraph it appends to, and the one it puts a 备注 on — stays inside the
// page, and the exported file is compared with the excerpt by digest only. 交付物's service projection is read
// through `window.ai7.inspectDeliverables()`, and one export review through `window.ai7.reviewManuscriptExport()`,
// only to cross-check what the page shows; the runner never reads the product database.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const EXCERPT = Object.freeze({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '发稿旅程甲' });
const FIRST = Object.freeze({ label: '一审稿', purpose: 'stage-archive', purposeLabel: '阶段留档', note: '一审完成后留档' });
const SECOND = Object.freeze({ label: '二审稿', purpose: 'review-candidate', purposeLabel: '送审候选', note: '' });
const FIRST_EDIT = '〔发稿前改动〕';
const SECOND_EDIT = '〔发稿后改动〕';
const PRINT = Object.freeze({ scope: '纸质版首印', basis: '三审通过，社里同意付印。' });
const EBOOK = Object.freeze({ scope: '电子版首发', basis: '电子版沿用一审稿的文字。' });
const KEYBOARD = Object.freeze({ scope: '键盘可达校验', basis: '只用键盘填写，随后取消，不做记录。' });
// The service's own words (`src/shared/protocol.ts`), pinned against it by tests/unit/deliverables-labels.test.ts.
const STATEMENT = '仅表示此版本可用于上述发稿范围；AI7 不会发布或发送';
const FORBIDDEN_WORDS = Object.freeze(['已发布', '已发送', '已交付', '已确认送达']);
// Issue #413: what the composed input carries beyond the excerpt, every word sample1's own (positions are 1-based
// in the excerpt), and the 备注 the editor adds on a paragraph no stage edits.
const EXPORT_INPUT = Object.freeze({
  header: { sourceBlock: 20 },
  styledRun: { block: 13 },
  comment: { block: 8, from: 10, to: 20, author: IMPORTED_MARKS_AUTHOR, text: { block: 14, from: 0, to: 10 } },
  replacement: { block: 10, from: 5, to: 9, author: IMPORTED_MARKS_AUTHOR, date: '2026-09-01T10:02:00Z', insert: { block: 14, from: 0, to: 6 } },
});
const NOTE = Object.freeze({ block: 15, from: 2, to: 8, body: '备注：导出前再核对这一段。' });
const EXPORT_FILE = '发稿旅程甲.docx';
const CANCELLED_FILE = '取消的导出.docx';
// The review rows of the current revision with the default options: every class present, and the 备注 left out.
const EXPORT_ROWS = Object.freeze(['inline-styles:preserved:1', 'annotations:preserved:1', 'change-suggestions:preserved:1', 'editor-notes:excluded:1', 'sections:preserved:1', 'headers-footers:preserved:1']);
// The service's and the card's own words (`src/service/docx-export.ts`, `src/service/manuscript-export.ts`,
// `src/renderer/manuscript-export-labels.ts`), pinned there by the unit suites.
const EXPORT_LOCAL_LINE = '导出只写到本机你选择的位置；AI7 不会发送、上传或发布这个文件。';
// Three paragraphs are written anew — the edited one and the two that carry the file's marks — and the rest restored.
const EXPORT_RESTORATION_LINE = '未改过、也没有带出标记的 27 段从原文件恢复；其余 3 段按稿件文字重新写出。';
const EXPORT_ABSENT_LINE = '未检测到：脚注与尾注、表格、图片与图注、文本框、域（目录等）、原文件中的修订。';
const EXPORT_NOTE_EXCLUDED = '备注默认不随导出（稿件上 1 条）；勾选「含备注」后作为批注写出，作者为「备注」。';
const EXPORT_DESTINATION_UNCHOSEN = '还没有选择保存位置。所选位置已有同名文件时，由系统的保存对话框询问是否替换。';
const EXPORTED_LABEL = '已导出到所选位置';
// Issue #500 (S64b): the same revision as a PDF and as the Markdown 备用格式, each under a launch of its own.
const PDF_FILE = '发稿旅程甲.pdf';
const MARKDOWN_FILE = '发稿旅程甲.md';
// The review of either: every class the file holds beyond the words left behind, the marks kept only as words.
const TEXT_EXPORT_ROWS = Object.freeze(['inline-styles:unavailable:1', 'annotations:degraded:1', 'change-suggestions:degraded:1', 'editor-notes:excluded:1', 'sections:unavailable:1', 'headers-footers:unavailable:1']);
// The service's and the card's words for each (`src/service/manuscript-export.ts`, `src/renderer/manuscript-export-labels.ts`),
// pinned there by the service and unit suites.
const TEXT_EXPORT_WORDS = Object.freeze({
  pdf: {
    line: 'PDF 是固定版式：按稿件文字排成 A4 页面，适合阅读与打印，不能在 PDF 里继续修改，也不能导回 AI7；稿件本身和稿件上的标记不会因为导出而改变。',
    restoration: '这份 PDF 按稿件文字排版生成：书名、章节标题与段落按稿件写出，不从原文件恢复任何内容。',
    annotations: '在正文中标出编号，连同作者名与回复列在文末。',
  },
  markdown: {
    line: 'Markdown 是备用格式：只写出文字与标题层级，批注写成脚注，修改建议写成 CriticMarkup 标记，其余内容不随导出；稿件本身和稿件上的标记不会因为导出而改变。',
    restoration: '这份 Markdown 按稿件文字生成：标题层级写成 #，段落之间空一行，不从原文件恢复任何内容。',
    annotations: '写成脚注，保留作者名与回复。',
  },
});
const EXPORT_CLOSED = '已关闭导出，没有写入任何文件。';
// The written package: the original's parts, the comments the export writes, and the package relationships it adds.
const EXPORTED_PARTS = Object.freeze(['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/comments.xml', 'word/commentsExtended.xml', 'word/document.xml', 'word/header1.xml']);
const ACTUALS_PROMPT = '录入定价与首印 · 随评估功能提供';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 导出's four members (Issue #413): the only renderer members named like an export, and none publishes or sends.
// Issue #416 (S67b): a 图书交付包 version's export adds its own three, and nothing else that exports, publishes or sends.
const EXPORT_MEMBERS = Object.freeze([
  'approveBookDeliveryPackageExport', 'approveManuscriptExport', 'chooseBookDeliveryPackageExportFolder', 'chooseManuscriptExportDestination',
  'revealManuscriptExport', 'reviewBookDeliveryPackageExport', 'reviewManuscriptExport',
]);
// Issue #415 (S66a): a 新闻稿's draft, composed at run time from exact sample1's paragraphs after the manuscript's own,
// imported as source material and made the Book's 新闻稿; the house's five types in its order; and the document's edit.
const DRAFT = Object.freeze({ source: ADMITTED_BASELINE_DOCX, startBlock: 31, blocks: 3, title: '新闻稿初稿' });
const DRAFT_FILE = '新闻稿初稿.docx';
const DOCUMENT_TYPES = Object.freeze([
  ['news-release', '新闻稿'], ['promotion-article', '宣传文章'], ['review-article', '评论文章'], ['launch-materials', '发布会材料'], ['marketing-points', '营销要点'],
]);
const DOCUMENT_EDIT = '〔文档修订〕';
// Issue #415 (S66c): the editor's own words for 重新打开 起草.
const WORKFLOW_REOPEN_WORDS = '读者反馈后要改开头';
// Issue #415 (S66b): 交付 — 版本 2 to 宣传部 with a note and its file exported under the Save dialog's answer, then an edit
// the card reads as 交付后有修改, and 再交付… of the current text — saved as 版本 3 first — in the editor's own words, its
// export cancelled.
const DELIVERY_NOTE = '发布会前一周交宣传部。';
const DELIVERY_CUSTOM = '出版社发行部';
const DELIVERY_EDIT = '〔交付后修订〕';
const DOCUMENT_EXPORT_FILE = '新闻稿 · 版本 2.docx';
const DELIVERY_STATEMENT = '交付只记录这一版交给了谁；AI7 不会发送，文件由你导出到所选位置后自行交出。';
const DELIVERY_UNSAVED = '有修改尚未保存为版本：交付「现在的文字」会先把它保存为新的版本；也可以交付已保存的版本。';
const DELIVERY_CURRENT_TEXT = '现在的文字（交付时先保存为版本 3）';
// Issue #416 (S67a): 图书交付包 — prepared once with a purpose, again unchanged, and once more with a new purpose.
const PACKAGE_PURPOSE = '交出版社存档';
const PACKAGE_PURPOSE_2 = '交印厂付印';
const PACKAGE_STATEMENT = '图书交付包把已完成的工作放在一起：它不是发稿，也不是交付；准备它不改变任何记录，也不生成文件。';
const OTHER_TYPES = Object.freeze(['promotion-article', 'review-article', 'launch-materials', 'marketing-points']);
// Issue #416 (S67b): a version's export — what it says, the folder it asks for, and the files v2 writes, in order.
const PACKAGE_EXPORT_STATEMENT = '导出只把这些文件写到你选择的文件夹：每个文件都有自己的导出记录，交付包本身不变；AI7 不会发送任何文件。';
const PACKAGE_EXPORT_FOLDER_UNCHOSEN = '还没有选择文件夹。请选择一个空文件夹，或在系统的对话框里新建一个：已有同名文件的文件夹不能使用，导出不会替换任何文件。';
const PACKAGE_MANIFEST_FILE = '交付包清单.md';
const DELIVERY_RECIPIENTS = '["publicity:false:宣传部","editorial:false:编辑部","external-media:false:外部媒体","other:false:其他","custom:false:自行输入"]';
const EXPORT_MEMBERS_ONLY = `JSON.stringify(Object.keys(window.ai7).filter((key) => /export|publish|send/i.test(key)).sort()) === ${JSON.stringify(JSON.stringify(EXPORT_MEMBERS))}`;

let location = 'entry';
let electronExecutable;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-07', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = new Error(`J-07/${name}`);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-07', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-07' };
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

/** An OS-assigned loopback listener the controller owns for the whole Journey: it must never hear a request. */
async function createLoopbackSentinel() {
  let observedRequests = 0;
  let runtimeFault = false;
  let closed = false;
  const server = createServer((_request, response) => {
    observedRequests += 1;
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Length': '21', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('AI7_LOOPBACK_SENTINEL');
  });
  server.on('error', () => { runtimeFault = true; });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(new Error('J-07/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' &&
      Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-07/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j07-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(new Error('J-07/loopback-close')) : resolveClose());
      });
      requireJourney(!runtimeFault, 'loopback-runtime');
    },
  };
}

async function attachRenderer(browser) {
  const guard = (request) => settleOnBrowserDisconnect(browser, request);
  const root = await guard(browser.newBrowserCDPSession());
  const deadline = Date.now() + 60_000;
  let target;
  while (Date.now() < deadline) {
    const pages = (await guard(root.send('Target.getTargets'))).targetInfos.filter((item) => item.type === 'page');
    if (pages.length === 1) { target = pages[0]; break; }
    requireJourney(pages.length === 0, 'renderer-target-count');
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  requireJourney(target, 'renderer-target-timeout');
  const { sessionId } = await guard(root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }));
  let nextId = 1;
  const pending = new Map();
  root.on('Target.receivedMessageFromTarget', ({ sessionId: incoming, message }) => {
    if (incoming !== sessionId) return;
    let response;
    try { response = JSON.parse(message); } catch { return; }
    if (typeof response.id !== 'number') return;
    const completion = pending.get(response.id);
    if (!completion) return;
    pending.delete(response.id);
    if (response.error) completion.reject(new Error('J-07/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-07/renderer-cdp-timeout')); }, 60_000);
      timeout.unref();
      pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
        reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
      });
    });
    await guard(root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }));
    return response;
  };
  await send('Runtime.enable');
  return {
    send,
    evaluate: async (expression) => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      requireJourney(!response.exceptionDetails, 'renderer-evaluate');
      return response.result.value;
    },
  };
}

async function waitFor(renderer, expression, name, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-07/${name}`);
}
async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`), name);
}
async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
/** Press the one enabled button a selector names, refusing one that is missing or disabled. */
async function clickSelector(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const button = document.querySelector(${JSON.stringify(selector)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); return input.value === ${JSON.stringify(value)}; })()`, name);
}
const KEYS = Object.freeze({
  Tab: Object.freeze({ key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }),
  ArrowDown: Object.freeze({ key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }),
  Escape: Object.freeze({ key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }),
});
/** Space as a keyboard sends it: the key that carries its text toggles the focused checkbox. */
async function pressSpace(renderer) {
  const space = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...space, text: ' ', unmodifiedText: ' ' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...space });
}
async function press(renderer, name) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEYS[name] });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...KEYS[name] });
}
/** Enter as a keyboard sends it: only a key that carries its text activates the focused control. */
async function pressEnter(renderer) {
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, text: '\r', unmodifiedText: '\r' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
}

// What the page needs to read 交付物 the way an editor does: the block, its lists and its form by their
// data attributes, the status line, the journal sequence the manuscript shows, and the block's visible
// words apart from its closed technical layers.
const PAGE_HELPERS = `(() => {
  if (window.__j07) return true;
  const block = () => document.querySelector('[data-screen="book-deliverables"] section.deliverables-publication');
  window.__j07 = {
    block,
    items: () => Array.from(block()?.querySelectorAll('ol.milestone-list > li') ?? []),
    versions: () => Array.from(block()?.querySelectorAll('ol.publication-versions > li') ?? []),
    form: () => block()?.querySelector('form.publication-designate') ?? null,
    action: (name) => block()?.querySelector('[data-publication-action="' + name + '"]') ?? null,
    field: (name) => block()?.querySelector('form.publication-designate [data-publication-field="' + name + '"]') ?? null,
    radios: () => Array.from(block()?.querySelectorAll('form.publication-designate input[type="radio"][name="publication-milestone"]') ?? []),
    summary: () => Array.from(block()?.querySelectorAll('form.publication-designate dl.publication-designate-summary > dd') ?? []).map((value) => value.textContent ?? ''),
    status: () => document.querySelector('#persistence-status')?.textContent ?? '',
    tone: () => document.querySelector('#persistence-status')?.dataset.tone ?? '',
    journal: () => {
      const node = Array.from(document.querySelectorAll('.editor-meta > span')).find((item) => (item.textContent ?? '').startsWith('修订日志序号 '));
      return node === undefined ? null : Number((node.textContent ?? '').slice('修订日志序号 '.length));
    },
    milestoneSave: () => Array.from(document.querySelectorAll('details.milestone-section button')).find((item) => item.textContent === '保存里程碑版本') ?? null,
    decisionText: () => {
      const clone = block()?.cloneNode(true);
      if (!clone) return '';
      for (const layer of clone.querySelectorAll('details.technical-details')) layer.remove();
      return clone.textContent ?? '';
    },
    // ④ 导出 (Issue #413): the card in its own slot beside the block, its controls, rows and facts, and the records.
    exportCard: () => document.querySelector('[data-screen="book-deliverables"] .deliverables-export-slot > section.manuscript-export'),
    exportAction: (name) => window.__j07.exportCard()?.querySelector('[data-export-action="' + name + '"]') ?? null,
    exportOption: (key) => window.__j07.exportCard()?.querySelector('input[type="checkbox"][data-export-option="' + key + '"]') ?? null,
    exportOpener: (kind, milestoneId) => block()?.querySelector(kind === 'current'
      ? '[data-export-action="open"][data-export-target="current"]'
      : 'ol.milestone-list > li[data-milestone-id="' + milestoneId + '"] [data-export-action="open"]') ?? null,
    exportRows: () => Array.from(window.__j07.exportCard()?.querySelectorAll('ol.export-fidelity-list > li.export-fidelity-row') ?? [])
      .map((row) => row.dataset.exportFidelity + ':' + row.dataset.exportStatus + ':' + row.dataset.exportCount),
    exportFact: (term) => Array.from(window.__j07.exportCard()?.querySelectorAll('details.technical-details dt') ?? [])
      .find((node) => node.textContent === term)?.nextElementSibling?.textContent ?? null,
    exportRecords: () => Array.from(block()?.querySelectorAll('section.export-records-section ol.export-records > li') ?? []),
    // 交付 · 生产文档 (Issue #415): the block in its own slot, a type's card and a card's action.
    documents: () => document.querySelector('[data-screen="book-deliverables"] .deliverables-documents-slot > section.deliverables-documents'),
    card: (typeId) => window.__j07.documents()?.querySelector('li.production-document-card[data-document-type-id="' + typeId + '"]') ?? null,
    cardAction: (typeId, action) => window.__j07.card(typeId)?.querySelector('[data-document-action="' + action + '"]') ?? null,
    // 交付 (Issue #415, S66b): a card's delivery form and its Delivery Records, newest first.
    delivery: (typeId) => window.__j07.card(typeId)?.querySelector('form.document-delivery') ?? null,
    deliveries: (typeId) => Array.from(window.__j07.card(typeId)?.querySelectorAll('ol.production-document-deliveries > li') ?? []),
    deliveryReason: (typeId) => document.getElementById(window.__j07.cardAction(typeId, 'confirmDeliver')?.getAttribute('aria-describedby') ?? '')?.textContent ?? null,
    // 图书交付包 (Issue #416, S67a): the block in its own slot, one condition row, the prepared versions and 准备's reason.
    pkg: () => document.querySelector('[data-screen="book-deliverables"] .deliverables-package-slot > section.deliverables-package'),
    condition: (id) => window.__j07.pkg()?.querySelector('ol.package-condition-list > li[data-condition-id="' + id + '"]') ?? null,
    packageVersions: () => Array.from(window.__j07.pkg()?.querySelectorAll('ol.package-version-list > li') ?? []),
    packageReason: () => document.getElementById(window.__j07.pkg()?.querySelector('[data-package-action="prepare"]')?.getAttribute('aria-describedby') ?? '')?.textContent ?? null,
    // Its export (Issue #416, S67b): the card below a version, and each file's key, format, words and outcome.
    packageExport: () => window.__j07.pkg()?.querySelector('ol.package-version-list > li > section.package-export') ?? null,
    packageExportFiles: () => Array.from(window.__j07.packageExport()?.querySelectorAll('ol.package-export-files > li') ?? [])
      .map((item) => [item.dataset.packageExportFile, item.dataset.packageExportFormat, item.querySelector('.package-export-file-label')?.textContent ?? '',
        item.querySelector('.package-export-file-name')?.textContent ?? '', item.dataset.packageExportOutcome ?? '', item.querySelector('.package-export-outcome')?.textContent ?? ''].join('|')),
  };
  return true;
})()`;

// What the page needs to put one 备注 on the manuscript as a hand would (the pattern J-05 proves): read a
// paragraph's durable text by its position, select a span of it by offset, right-click it, and act on the
// floating Mark surface by its data attributes.
const MARK_HELPERS = `(() => {
  if (window.__j07m) return true;
  const editor = () => document.querySelector('[data-testid="manuscript-editor"]');
  const blocks = () => Array.from(editor()?.querySelectorAll(':scope > [data-block-id]') ?? []);
  const nth = (position) => blocks()[position - 1] ?? null;
  const durable = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('[data-mark-preview]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  };
  const point = (root, offset) => {
    let left = offset;
    for (const node of durable(root)) {
      if (left <= node.data.length) return [node, left];
      left -= node.data.length;
    }
    return null;
  };
  const layer = () => document.querySelector('.editorial-mark-layer');
  window.__j07m = {
    blocks,
    nth,
    text: (position) => { const root = nth(position); return root ? durable(root).map((node) => node.data).join('') : null; },
    place: (position, from, to) => {
      const root = nth(position);
      if (!root) return false;
      editor().focus();
      const start = point(root, from);
      const end = point(root, to);
      if (!start || !end) return false;
      const range = document.createRange();
      range.setStart(start[0], start[1]);
      range.setEnd(end[0], end[1]);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString().length === to - from;
    },
    rightClick: (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: rect.left + Math.min(10, rect.width / 2), clientY: rect.top + Math.min(24, rect.height / 2) };
      element.dispatchEvent(new MouseEvent('mousedown', init));
      element.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
      element.dispatchEvent(new MouseEvent('contextmenu', { ...init, buttons: 0 }));
      return true;
    },
    marks: () => Array.from(editor()?.querySelectorAll('.editorial-mark') ?? []),
    mark: (kind, position) => Array.from(nth(position)?.querySelectorAll('.editorial-mark[data-mark-kind="' + kind + '"]') ?? []),
    markText: (kind, position) => window.__j07m.mark(kind, position).map((node) => durable(node).map((part) => part.data).join('')).join(''),
    menu: () => document.querySelector('.editorial-mark-menu-layer [data-mark-menu]'),
    item: (action) => document.querySelector('.editorial-mark-menu-layer [data-mark-menu] [data-mark-action="' + action + '"]'),
    composer: () => layer()?.querySelector('[data-mark-composer]') ?? null,
    act: (action) => {
      const control = layer()?.querySelector('[data-mark-composer] [data-mark-action="' + action + '"]');
      if (!(control instanceof HTMLButtonElement) || control.disabled) return false;
      control.click();
      return true;
    },
    write: (field, value) => {
      const input = layer()?.querySelector('[data-mark-field="' + field + '"]');
      if (!(input instanceof HTMLTextAreaElement)) return false;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
  };
  return true;
})()`;

/**
 * Open the selection menu on a span with the pointer. The editor reads a selection a tick after the page sets
 * it, and a slow runner makes that tick long, so the menu is asked for again until it shows the span.
 */
async function openSelectionMenu(renderer, position, from, to, name) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await assertRenderer(renderer, `window.__j07m.place(${position}, ${from}, ${to})`, `${name}-prepare`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await assertRenderer(renderer, `window.__j07m.rightClick(window.__j07m.nth(${position}))`, `${name}-right-click`);
    if (await renderer.evaluate(`window.__j07m.menu()?.dataset.markMenu === 'selection' && window.__j07m.menu().textContent.includes('已选 ${to - from} 字')`)) return;
    await press(renderer, 'Escape');
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  throw new Error(`J-07/${name}`);
}

/** Press a control of the open export card by its action, refusing one that is missing or disabled. */
async function exportAct(renderer, action, name) {
  await clickSelector(renderer, `[data-screen="book-deliverables"] .deliverables-export-slot > section.manuscript-export [data-export-action="${action}"]`, name);
}

/** After a relaunch: the Book from 最近的工作, then 交付物 from its manuscript. */
async function reopenDeliverables(renderer, name) {
  await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]') && document.querySelector('.recent-work-item button')`, `${name}-prior-work`);
  await assertRenderer(renderer, PAGE_HELPERS, `${name}-page-helpers`);
  await assertRenderer(renderer, `(() => { document.querySelector('.recent-work-item button').click(); return true; })()`, `${name}-open-book`);
  await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]')`, `${name}-editor`);
  await openDeliverables(renderer, name);
}

/**
 * Issue #500 (S64b): 导出… of the current revision as a PDF or in the Markdown 备用格式, under this launch's Save-dialog
 * answer. The card opens on DOCX with all three formats offered; choosing another reviews again, and the review is
 * the format's own, its option notes in the format's words. The destination, the approval and the receipt follow as
 * for DOCX. Returns the service's receipt of the export.
 */
async function exportAs(renderer, format, destination, fileName, name) {
  const words = TEXT_EXPORT_WORDS[format];
  const radio = `window.__j07.exportCard()?.querySelector('input[name="export-format"][value="${format}"]')`;
  await clickSelector(renderer, '[data-screen="book-deliverables"] section.deliverables-publication [data-export-action="open"][data-export-target="current"]', `${name}-open`);
  await waitFor(renderer, `(() => { const card = window.__j07.exportCard(); return card?.dataset.exportPhase === 'ready' && card.querySelector('input[name="export-format"]:checked')?.value === 'docx'; })()`, `${name}-opens-on-docx`, 120_000);
  await assertRenderer(renderer, `(() => {
    const formats = Array.from(window.__j07.exportCard().querySelectorAll('input[name="export-format"]'));
    const radio = ${radio};
    if (JSON.stringify(formats.map((item) => item.value + ':' + item.checked + ':' + item.disabled)) !== '["docx:true:false","pdf:false:false","markdown:false:false"]' || !(radio instanceof HTMLInputElement)) return false;
    // Markdown sits under the 备用格式 disclosure only, closed until the editor opens it (EXP-005).
    const fallback = window.__j07.exportCard().querySelector('details.export-fallback-formats');
    if (fallback?.querySelector('summary')?.textContent !== '备用格式' || fallback.open ||
      JSON.stringify(Array.from(fallback.querySelectorAll('input[name="export-format"]')).map((item) => item.value)) !== '["markdown"]') return false;
    if (radio.closest('details.export-fallback-formats') !== null) fallback.open = true;
    radio.click();
    return true;
  })()`, `${name}-choose-format`);
  await waitFor(renderer, `(() => { const card = window.__j07.exportCard(); return card?.dataset.exportPhase === 'ready' && ${radio}?.checked === true && card.querySelector('.export-format-line')?.textContent === ${JSON.stringify(words.line)} && card.querySelector('section.export-fidelity')?.dataset.exportRestoration === 'regenerated'; })()`, `${name}-reviewed`, 120_000);
  await assertRenderer(renderer, `(() => {
    const card = window.__j07.exportCard();
    const fidelity = card.querySelector('section.export-fidelity');
    const pills = Array.from(fidelity.querySelectorAll('li.export-fidelity-row .status-pill')).map((pill) => pill.textContent);
    const note = window.__j07.exportOption('includeAnnotations')?.closest('label')?.querySelector('small.field-note')?.textContent ?? null;
    return JSON.stringify(window.__j07.exportRows()) === ${JSON.stringify(JSON.stringify(TEXT_EXPORT_ROWS))} &&
      JSON.stringify(pills) === ${JSON.stringify(JSON.stringify(TEXT_EXPORT_ROWS.map((row) => row.includes(':unavailable:') ? '⊘ 无法导出' : row.includes(':degraded:') ? '△ 降级导出' : '○ 本次不含')))} &&
      fidelity.dataset.exportDegraded === 'true' && fidelity.querySelector('.export-restoration-line')?.textContent === ${JSON.stringify(words.restoration)} &&
      fidelity.querySelector('.export-absent-line')?.textContent === ${JSON.stringify(EXPORT_ABSENT_LINE)} && fidelity.querySelector('.export-degraded-note') !== null &&
      note === ${JSON.stringify(words.annotations)} && card.querySelector('section.export-destination')?.dataset.exportDestination === 'unchosen';
  })()`, `${name}-review-is-the-formats-own`);
  await exportAct(renderer, 'choose', `${name}-choose`);
  await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'prepared' && window.__j07.status() === '已准备好导出文件，等待你确认。'`, `${name}-prepared`, 120_000);
  await assertRenderer(renderer, `(() => {
    const card = window.__j07.exportCard();
    return card.querySelector('.export-destination-line')?.textContent === ${JSON.stringify(`${destination}（新建文件）`)} && window.__j07.exportAction('approve')?.disabled === false &&
      card.querySelector('.export-actions')?.dataset.exportAcceptsDegradation === 'true' && ${radio}?.checked === true;
  })()`, `${name}-destination-bound`);
  requireJourney(!existsSync(destination), `${name}-nothing-written-before-approval`);
  await exportAct(renderer, 'approve', `${name}-approve`);
  await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'done' && window.__j07.status() === ${JSON.stringify(EXPORTED_LABEL)} && window.__j07.tone() === 'success'`, `${name}-written`, 120_000);
  await assertRenderer(renderer, `(() => {
    const receipt = window.__j07.exportCard().querySelector('.export-receipt');
    return receipt?.dataset.exportOutcome === 'created' && receipt.querySelector('.export-outcome-detail')?.textContent === ${JSON.stringify(`已新建「${fileName}」。`)} &&
      Array.from(window.__j07.exportCard().querySelectorAll('input[name="export-format"]')).every((item) => item.disabled);
  })()`, `${name}-receipt-shown`);
  const records = await renderer.evaluate(`window.ai7.inspectDeliverables().then((deliverables) => deliverables.exports.map((record) => ({ outcome: record.outcome, format: record.format, fileName: record.fileName, destination: record.destination, revisionLabel: record.target.revisionLabel, byteLength: record.byteLength, fileSha256: record.technical.fileSha256 })))`);
  const record = Array.isArray(records) ? records.find((entry) => entry.destination === destination) : undefined;
  requireJourney(record?.outcome === 'created' && record.format === format && record.fileName === fileName && record.revisionLabel === 'r3', `${name}-service-receipt`,
    Array.isArray(records) ? records.map((entry) => `${entry.format}:${entry.outcome}`) : records);
  await exportAct(renderer, 'close', `${name}-close`);
  await waitFor(renderer, `window.__j07.exportCard() === null && document.activeElement === window.__j07.exportOpener('current')`, `${name}-closed`, 10_000);
  return record;
}

// The Markdown 备用格式's escaping (`src/service/text-export.ts`), restated: a character Markdown or CriticMarkup
// reads as syntax is escaped wherever it stands, a line that would open a construct at its start, a leading space
// or tab becomes its character reference, and a paragraph's line break is a hard break.
function markdownWords(text) {
  return text.replace(/[\\`*_[\]<>{}|~&#]/gu, (character) => `\\${character}`);
}
function markdownLine(line) {
  const indent = /^[ \t]+/u.exec(line);
  if (indent !== null) return `${indent[0].replace(/[ \t]/gu, (space) => (space === ' ' ? '&#32;' : '&#9;'))}${line.slice(indent[0].length)}`;
  const list = /^(\d+)([.)])/u.exec(line);
  if (list !== null) return `${list[1]}\\${list[2]}${line.slice(list[0].length)}`;
  return /^[>+=-]/u.test(line) ? `\\${line}` : line;
}
function markdownBlock(shape, markdown) {
  const lines = markdown.split('\n').map(markdownLine);
  if (shape.kind === 'title') return `# ${lines.join(' ')}`;
  if (shape.kind === 'heading') return `${'#'.repeat(Math.min(Math.max(shape.level + 1, 2), 6))} ${lines.join(' ')}`;
  return lines.join('\\\n');
}

/** 交付物 as the service answers it, reduced to what the page is checked against: identities, words and states. */
const READ_PUBLICATION = `window.ai7.inspectDeliverables().then((deliverables) => ({
  bookId: deliverables.bookId,
  milestones: deliverables.publication.milestones.map((item) => ({ milestoneId: item.milestoneId, label: item.label, purposeKind: item.purposeKind, revisionLabel: item.revisionLabel, changedSince: item.changedSince, changedSinceLabel: item.changedSinceLabel, designated: item.designation !== null })),
  designations: deliverables.publication.designations.map((item) => ({ publicationVersionId: item.publicationVersionId, ordinal: item.ordinal, current: item.current, milestoneId: item.milestoneId, revisionLabel: item.revisionLabel, scope: item.scope, basis: item.basis, createdAt: item.createdAt })),
  designate: deliverables.publication.designate,
  notice: deliverables.publication.changeNotice,
  prompt: deliverables.publication.actualsPrompt === null ? null : deliverables.publication.actualsPrompt.label + ' · ' + deliverables.publication.actualsPrompt.stateLabel,
}))`;

async function importAndOpen(renderer, title) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'import-landing');
  await click(renderer, '导入稿件', 'import-start');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'import-target');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if (!(radio instanceof HTMLInputElement)) return false; radio.click(); return radio.checked; })()`, 'import-target-select');
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if (!(radio instanceof HTMLInputElement) || radio.checked) return false; radio.click(); return radio.checked; })()`, 'import-relationship-select');
  await fill(renderer, '#book-title', title, 'import-title');
  await click(renderer, '确认书名并复核', 'import-review');
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'import-review-ready');
  await click(renderer, '新建图书并导入稿件', 'import-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'import-committed', 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`, 'import-acknowledged', 180_000);
  await click(renderer, '打开稿件', 'import-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')`, 'import-editor');
}

/**
 * 导入稿件 → 作为来源材料导入 into the Book (Issue #415): the one file this launch's picker answers with becomes the Book's
 * source material, reviewed and committed like any source import, and the completion lands in 工作概览.
 */
async function importDraftAsSource(renderer, bookId) {
  await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'draft-landing');
  await assertRenderer(renderer, PAGE_HELPERS, 'draft-page-helpers');
  await click(renderer, '导入稿件', 'draft-import');
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'draft-target');
  await assertRenderer(renderer, `(() => { const target = document.querySelector('[data-import-target-choice="existing-book"][data-book-id=${JSON.stringify(bookId)}]'); if (!(target instanceof HTMLInputElement)) return false; target.click(); return target.checked; })()`, 'draft-target-book');
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"] [data-import-relationship="source-only"]')`, 'draft-relationship');
  await assertRenderer(renderer, `(() => { const source = document.querySelector('[data-import-relationship="source-only"]'); if (!(source instanceof HTMLInputElement) || source.checked) return false; source.click(); return source.checked; })()`, 'draft-source-only');
  await waitFor(renderer, `document.querySelector('[data-prepare-source-import-review=${JSON.stringify(bookId)}]')`, 'draft-review-action');
  await click(renderer, '复核来源材料导入', 'draft-review');
  await waitFor(renderer, `document.querySelector('[data-screen="review"] [data-import-review-kind="source-only"] [data-commit-source-import]')`, 'draft-reviewed', 120_000);
  await clickSelector(renderer, '[data-commit-source-import]', 'draft-commit');
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'draft-committed', 120_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true' && document.querySelector('[data-screen="imported"] .book-deliverables-summary [data-deliverables-action="open"]:not(:disabled)')`, 'draft-acknowledged', 120_000);
}

/** 交付物 from the manuscript: the 工作 group holds 审阅 and then 交付物, and leaving settles the manuscript first. */
async function openDeliverables(renderer, name) {
  await assertRenderer(renderer, `(() => { const group = document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]'); const entries = Array.from(group?.querySelectorAll('button[data-work-destination]') ?? []).map((item) => item.dataset.workDestination + ':' + item.textContent); const open = group?.querySelector('button[data-work-destination="deliverables"]'); if (entries.join('|') !== 'review:审阅|deliverables:交付物' || !(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, `${name}-entry`);
  await waitForDeliverables(renderer, name);
}
async function waitForDeliverables(renderer, name) {
  await waitFor(renderer, `(() => { const block = window.__j07.block(); return block instanceof HTMLElement && block.dataset.publicationState !== undefined; })()`, `${name}-destination`);
  await assertRenderer(renderer, `window.__j07.block().dataset.publicationState !== 'unavailable'`, `${name}-readable`);
}
/** The destination's own way back: 打开稿件 in its persistent actions. */
async function openManuscript(renderer, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('[data-screen="book-deliverables"] .workbench-actions button')).find((item) => item.textContent === '打开稿件'); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, `${name}-open-manuscript`);
  await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]') && document.querySelector('[data-testid="manuscript-editor"]')?.getAttribute('contenteditable') === 'true'`, `${name}-editor`);
}

/** The milestone form lives in the 导航 panel, which opens on demand (Issue #409). */
async function openMilestoneForm(renderer, name) {
  await assertRenderer(renderer, `(() => { const entry = document.querySelector('[data-edge-entry="navigation"]'); const panel = document.querySelector('#manuscript-navigation-panel'); if (!(entry instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return false; if (entry.getAttribute('aria-expanded') !== 'true') entry.click(); return entry.getAttribute('aria-expanded') === 'true' && !panel.hidden; })()`, `${name}-navigation`);
  await assertRenderer(renderer, `(() => { const details = document.querySelector('details.milestone-section'); if (!(details instanceof HTMLDetailsElement)) return false; details.open = true; return details.open; })()`, `${name}-details`);
}
async function choosePurpose(renderer, kind, name) {
  await assertRenderer(renderer, `(() => { const radio = document.querySelector('details.milestone-section input[type="radio"][name="milestone-purpose"][value=${JSON.stringify(kind)}]'); if (!(radio instanceof HTMLInputElement) || radio.disabled) return false; radio.click(); return radio.checked; })()`, name);
}
/** 保存里程碑版本 once the form is filled, answered with `已保存里程碑版本「标签」 · rN`. */
async function saveMilestone(renderer, milestone, revisionLabel, name) {
  await assertRenderer(renderer, `(() => { const save = window.__j07.milestoneSave(); if (!(save instanceof HTMLButtonElement) || save.disabled) return false; save.click(); return true; })()`, `${name}-save`);
  const completion = `已保存里程碑版本「${milestone.label}」 · ${revisionLabel}`;
  await waitFor(renderer, `window.__j07.status().includes(${JSON.stringify(completion)}) && window.__j07.tone() === 'success'`, `${name}-completion`, 120_000);
}

/**
 * One edit the journal acknowledges: authored text appended to the manuscript's first paragraph, saved the
 * way a hand would with 保存当前编辑 unless the editor already wrote it, and waited for until the journal
 * sequence moved on and nothing is left pending.
 */
async function acknowledgedEdit(renderer, text, name) {
  const before = await renderer.evaluate(`window.__j07.journal()`);
  requireJourney(Number.isSafeInteger(before), `${name}-journal-before`);
  const typed = await renderer.evaluate(`(() => {
    const editor = document.querySelector('[data-testid="manuscript-editor"]');
    const block = editor?.querySelector(':scope > p[data-block-id]');
    if (!(editor instanceof HTMLElement) || !(block instanceof HTMLElement) || editor.getAttribute('contenteditable') !== 'true') return false;
    const original = block.textContent ?? '';
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return document.execCommand('insertText', false, ${JSON.stringify(text)}) && (block.textContent ?? '') === original + ${JSON.stringify(text)};
  })()`);
  requireJourney(typed === true, `${name}-typed`);
  await waitFor(renderer, `(() => { const save = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '保存当前编辑'); return (save instanceof HTMLButtonElement && !save.disabled) || window.__j07.journal() > ${before}; })()`, `${name}-dirty`, 30_000);
  await renderer.evaluate(`(() => { const save = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '保存当前编辑'); if (save instanceof HTMLButtonElement && !save.disabled) save.click(); return true; })()`);
  await waitFor(renderer, `(() => { const save = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === '保存当前编辑'); return window.__j07.journal() > ${before} && save instanceof HTMLButtonElement && save.disabled && document.documentElement.dataset.ai7CloseRisk !== 'true' && window.__j07.tone() === 'success'; })()`, `${name}-acknowledged`, 120_000);
}

async function openDesignateForm(renderer, name) {
  await clickSelector(renderer, '[data-screen="book-deliverables"] [data-publication-action="designate"]', `${name}-open`);
  await waitFor(renderer, `window.__j07.form() !== null && window.__j07.radios().length > 0 && window.__j07.radios().every((radio) => !radio.checked)`, `${name}-form`, 10_000);
}
async function chooseDesignation(renderer, milestoneId, name) {
  await assertRenderer(renderer, `(() => { const radio = window.__j07.radios().find((item) => item.value === ${JSON.stringify(milestoneId)}); if (!(radio instanceof HTMLInputElement) || radio.disabled) return false; radio.click(); return radio.checked; })()`, name);
}
/** Confirm only with the fixed sentence on screen beside the action (V2-UX-PUB-004). */
async function confirmWithStatement(renderer, completion, name) {
  await assertRenderer(renderer, `(() => { const statement = window.__j07.form()?.querySelector('.publication-statement'); const confirm = window.__j07.action('confirm'); if (!(statement instanceof HTMLElement) || statement.textContent !== ${JSON.stringify(STATEMENT)} || !statement.checkVisibility() || statement.getBoundingClientRect().height === 0) return false; if (!(confirm instanceof HTMLButtonElement) || confirm.disabled) return false; confirm.click(); return true; })()`, `${name}-confirm`);
  await waitFor(renderer, `window.__j07.status() === ${JSON.stringify(completion)} && window.__j07.tone() === 'success' && window.__j07.form() === null`, `${name}-completion`, 60_000);
}
async function designate(renderer, { milestoneId, scope, basis }, completion, name) {
  await openDesignateForm(renderer, name);
  await chooseDesignation(renderer, milestoneId, `${name}-choose`);
  await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', scope, `${name}-scope`);
  await fill(renderer, 'form.publication-designate [data-publication-field="basis"]', basis, `${name}-basis`);
  await confirmWithStatement(renderer, completion, name);
}

/** V2-UX-PUB-009: neither the page nor the record it reads ever says published, sent, delivered or received. */
async function assertNoForbiddenWords(renderer, name) {
  await assertRenderer(renderer, `(async () => { const words = ${JSON.stringify(FORBIDDEN_WORDS)}; const page = document.body.textContent ?? ''; const record = JSON.stringify([await window.ai7.inspectDeliverables(), await window.ai7.inspectProductionDocuments()]); return words.every((word) => !page.includes(word) && !record.includes(word)); })()`, name);
}

async function main() {
  parseJourney();
  let loopback;
  let loopbackAcquisition;
  let runRoot;
  let runRootAcquisition;
  let browser;
  let browserAcquisition;
  let tempParent;
  let journeyCompleted = false;
  const closeOwnedBrowser = async () => {
    const ownedBrowser = browser ?? (browserAcquisition === undefined ? undefined : await browserAcquisition.catch(() => undefined));
    await ownedBrowser?.close().catch(() => undefined);
    browser = undefined;
  };
  const cancellation = installJourneyCancellationCleanup(async () => {
    await closeOwnedBrowser();
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    await ownedLoopback?.close().catch(() => undefined);
    loopback = undefined;
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j07-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
      await rm(ownedRoot, { recursive: true, force: true });
      runRoot = undefined;
    }
  }, closeOwnedBrowser);
  try {
    at('controller-loopback-sentinel');
    cancellation.throwIfRequested();
    loopbackAcquisition = createLoopbackSentinel();
    loopback = await loopbackAcquisition;
    cancellation.throwIfRequested();
    at('controller-imports');
    const denial = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
    requireJourney(existsSync(denial), 'controller-network-denial-carrier');
    (await import(pathToFileURL(denial).href)).installNodeNetworkDenial();
    ({ electronExecutable } = await import('../tools/electron-runtime.mjs'));
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    cancellation.throwIfRequested();
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j07-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j07-e2e-'), 'temp-root');
    const inputs = resolve(runRoot, 'composed-inputs');
    await mkdir(inputs);
    const manuscript = resolve(inputs, 'publication.docx');
    await composeExportAdmittedDocx(manuscript, { ...EXCERPT, ...EXPORT_INPUT });
    const draftPath = resolve(inputs, DRAFT_FILE);
    await composeAdmittedDocx(draftPath, DRAFT);
    // Issue #413: the folder the Save dialog's launch control names, beside the data and outside it.
    const exportsRoot = resolve(runRoot, 'exports');
    await mkdir(exportsRoot);
    const exportPath = resolve(exportsRoot, EXPORT_FILE);
    const cancelledPath = resolve(exportsRoot, CANCELLED_FILE);
    const pdfPath = resolve(exportsRoot, PDF_FILE);
    const markdownPath = resolve(exportsRoot, MARKDOWN_FILE);
    // Issue #415 (S66b): the file of the 新闻稿's delivered version.
    const documentExportPath = resolve(exportsRoot, DOCUMENT_EXPORT_FILE);
    // Issue #416 (S67b): the empty folder the folder dialog's launch control names for the package's export.
    const packageFolder = resolve(runRoot, 'package-export');
    await mkdir(packageFolder);
    const metadata = await lstat(manuscript);
    requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 1_000, 'fixture-composed');
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const launch = async ({ picker, save, folder } = {}) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      if (picker) args.push('--j07-picker-path', picker);
      // Issue #413: the Save dialog's one answer for this launch, in place of the platform's own.
      if (save) args.push('--j07-save-path', save);
      // Issue #416 (S67b): the folder dialog's one answer for this launch.
      if (folder) args.push('--j07-folder-path', folder);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-07', browser, 'launch');
      cancellation.throwIfRequested();
      return attachRenderer(browser);
    };
    const close = async () => { await browser.close(); browser = undefined; };

    at('import-and-open');
    let renderer = await launch({ picker: manuscript, save: exportPath });
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true'`, 'product-ready');
    // The renderer holds the two 交付物 members, 导出's four and the package export's three, and nothing that could publish or send.
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && typeof window.ai7.inspectDeliverables === 'function' && typeof window.ai7.designatePublicationVersion === 'function' && ${EXPORT_MEMBERS_ONLY}`, 'renderer-api-boundary');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'renderer-network-denial');
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }
    await importAndOpen(renderer, EXCERPT.title);
    await assertRenderer(renderer, PAGE_HELPERS, 'page-helpers');
    const bookId = await renderer.evaluate(`document.querySelector('.editor-shell')?.dataset.bookId ?? null`);
    requireJourney(UUID_PATTERN.test(bookId ?? ''), 'book-identity');
    cancellation.throwIfRequested();

    at('deliverables-before-milestone');
    // Before any milestone 设为发稿版本 is there, unavailable, with its reason in words beside it (PUB-002).
    await openDeliverables(renderer, 'before-milestone');
    await assertRenderer(renderer, `(() => {
      const page = document.querySelector('[data-screen="book-deliverables"] > .book-deliverables');
      const block = window.__j07.block();
      const designate = window.__j07.action('designate');
      const reason = document.getElementById(designate?.getAttribute('aria-describedby') ?? '');
      const actions = Array.from(page?.querySelectorAll(':scope > .workbench-actions button') ?? []).map((item) => item.textContent);
      return page?.dataset.bookId === ${JSON.stringify(bookId)} && page.querySelector(':scope > .section-label')?.textContent === '工作 · 交付物' &&
        page.querySelector(':scope > h2')?.textContent === ${JSON.stringify(EXCERPT.title)} && page.lastElementChild?.classList.contains('workbench-actions') &&
        JSON.stringify(actions) === '["打开稿件","工作概览"]' && block.querySelector(':scope > h3')?.textContent === '发稿 · 稿件' &&
        block.dataset.publicationState === 'no-milestone' && window.__j07.items().length === 0 && block.querySelector('.milestone-list-empty') !== null &&
        designate instanceof HTMLButtonElement && designate.disabled && designate.textContent === '设为发稿版本…' && reason?.textContent === '先保存里程碑版本' &&
        window.__j07.form() === null && window.__j07.versions().length === 0 && block.querySelector('.publication-actuals-prompt') === null &&
        block.querySelector('.publication-change-notice') === null &&
        window.__j07.documents()?.querySelector(':scope > h3')?.textContent === '交付 · 生产文档' &&
        Array.from(window.__j07.documents().querySelectorAll('li.production-document-card')).every((card) => {
          const create = card.querySelector('[data-document-action="create"]');
          const reason = document.getElementById(create?.getAttribute('aria-describedby') ?? '');
          return card.dataset.documentState === 'none' && create instanceof HTMLButtonElement && create.disabled &&
            reason?.textContent === '先把文档的初稿作为来源材料导入：导入稿件时选「作为来源材料导入」。';
        });
    })()`, 'designate-unavailable-before-a-milestone');
    // Issue #416 (S67a): 图书交付包 comes last and waits for everything, naming what is missing.
    await waitFor(renderer, `window.__j07.pkg()?.dataset.packageReady === 'false'`, 'package-before-milestone');
    await assertRenderer(renderer, `(() => {
      const bundle = window.__j07.pkg();
      const prepare = bundle.querySelector('[data-package-action="prepare"]');
      return bundle.querySelector(':scope > h3')?.textContent === '图书交付包' && bundle.parentElement?.parentElement?.lastElementChild === bundle.parentElement &&
        window.__j07.condition('publication')?.dataset.conditionMet === 'false' && window.__j07.condition('work-records')?.dataset.conditionMet === 'true' &&
        prepare instanceof HTMLButtonElement && prepare.disabled &&
        window.__j07.packageReason() === '还不能准备：发稿版本、新闻稿、宣传文章、评论文章、发布会材料、营销要点未满足。' && window.__j07.packageVersions().length === 0;
    })()`, 'package-unavailable-before-a-milestone');
    const nothing = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(nothing?.bookId === bookId && nothing.milestones.length === 0 && nothing.designations.length === 0 &&
      nothing.designate?.available === false && nothing.designate.unavailableReason === '先保存里程碑版本' && nothing.notice === null && nothing.prompt === null,
    'service-agrees-nothing-to-designate', nothing);
    await openManuscript(renderer, 'before-milestone');

    at('milestone-needs-a-purpose');
    // 标签 / 用途 / 说明（可选）: the purpose is five unselected cards, and 保存里程碑版本 waits for a label and a
    // purpose with its reason beside it (V2-UX-MILE-003); 自行输入 asks for the editor's own words.
    await openMilestoneForm(renderer, 'first');
    await assertRenderer(renderer, `(() => {
      const section = document.querySelector('details.milestone-section');
      const radios = Array.from(section.querySelectorAll('input[type="radio"][name="milestone-purpose"]'));
      const custom = section.querySelector('#milestone-purpose-custom');
      const save = window.__j07.milestoneSave();
      return section.querySelector('label[for="milestone-label"]')?.textContent === '标签' &&
        section.querySelector('fieldset.milestone-purpose-options > legend')?.textContent === '用途' &&
        section.querySelector('label[for="milestone-note"]')?.textContent === '说明（可选）' &&
        radios.map((radio) => radio.closest('label')?.textContent).join('|') === '阶段留档|送审候选|交付候选|其他|自行输入' &&
        radios.every((radio) => !radio.checked) && custom instanceof HTMLInputElement && custom.hidden &&
        save instanceof HTMLButtonElement && save.disabled;
    })()`, 'milestone-form-starts-unselected');
    await fill(renderer, '#milestone-label', FIRST.label, 'first-label');
    await assertRenderer(renderer, `(() => { const save = window.__j07.milestoneSave(); const reason = document.getElementById(save?.getAttribute('aria-describedby') ?? ''); return save?.disabled === true && (reason?.textContent ?? '').includes('选择用途'); })()`, 'milestone-save-waits-for-a-purpose');
    await choosePurpose(renderer, 'custom', 'first-purpose-custom');
    await assertRenderer(renderer, `(() => { const custom = document.querySelector('#milestone-purpose-custom'); const save = window.__j07.milestoneSave(); return custom instanceof HTMLInputElement && !custom.hidden && save?.disabled === true; })()`, 'milestone-custom-asks-for-words');
    await choosePurpose(renderer, FIRST.purpose, 'first-purpose');
    await assertRenderer(renderer, `(() => { const custom = document.querySelector('#milestone-purpose-custom'); const save = window.__j07.milestoneSave(); return custom instanceof HTMLInputElement && custom.hidden && save?.disabled === false; })()`, 'milestone-save-ready-with-a-purpose');

    at('milestone-first-saved');
    await fill(renderer, '#milestone-note', FIRST.note, 'first-note');
    // Nothing changed since the import, so the milestone designates r1 as it stands.
    await saveMilestone(renderer, FIRST, 'r1', 'first');
    await assertRenderer(renderer, `(() => { const radios = Array.from(document.querySelectorAll('details.milestone-section input[name="milestone-purpose"]')); return document.querySelector('#milestone-label')?.value === '' && document.querySelector('#milestone-note')?.value === '' && radios.every((radio) => !radio.checked) && window.__j07.milestoneSave()?.disabled === true; })()`, 'milestone-form-starts-again-unselected');

    at('milestone-changed-since');
    // One acknowledged edit: the manuscript is newer than 一审稿 (V2-UX-MILE-007).
    await acknowledgedEdit(renderer, FIRST_EDIT, 'first-edit');
    await openDeliverables(renderer, 'changed-since');
    await assertRenderer(renderer, `(() => { const items = window.__j07.items(); return items.length === 1 && items[0].querySelector('.milestone-label')?.textContent === '「一审稿」' && items[0].dataset.changedSince === 'true' && items[0].querySelector('.milestone-changed-since')?.textContent === '自「一审稿」后有修改' && window.__j07.action('designate')?.disabled === false; })()`, 'milestone-shows-changed-since');
    const changed = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(changed?.milestones?.length === 1 && changed.milestones[0].changedSince === true && changed.milestones[0].changedSinceLabel === '自「一审稿」后有修改' &&
      changed.designate?.available === true, 'service-agrees-changed-since', changed);

    at('milestone-second-saved');
    // The second milestone freezes the edit as r2.
    await openManuscript(renderer, 'second');
    await openMilestoneForm(renderer, 'second');
    await fill(renderer, '#milestone-label', SECOND.label, 'second-label');
    await choosePurpose(renderer, SECOND.purpose, 'second-purpose');
    await saveMilestone(renderer, SECOND, 'r2', 'second');

    at('milestones-listed');
    await openDeliverables(renderer, 'listed');
    const listed = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(Array.isArray(listed?.milestones) && listed.milestones.length === 2 &&
      listed.milestones[0].label === SECOND.label && listed.milestones[0].purposeKind === SECOND.purpose && listed.milestones[0].revisionLabel === 'r2' && listed.milestones[0].changedSince === false &&
      listed.milestones[1].label === FIRST.label && listed.milestones[1].purposeKind === FIRST.purpose && listed.milestones[1].revisionLabel === 'r1' && listed.milestones[1].changedSince === true &&
      listed.milestones.every((item) => UUID_PATTERN.test(item.milestoneId) && item.designated === false) && listed.designations.length === 0,
    'service-lists-two-milestones', listed);
    const second = listed.milestones[0].milestoneId;
    const first = listed.milestones[1].milestoneId;
    // Newest first, each with its purpose, exact version, actor and time, note and later changes (MILE-008).
    await assertRenderer(renderer, `(() => {
      const items = window.__j07.items();
      const read = (item) => [item.dataset.milestoneId, item.querySelector('.milestone-label')?.textContent, item.dataset.purposeKind, item.dataset.revisionLabel, item.dataset.changedSince, item.dataset.publicationCurrent].join('|');
      return JSON.stringify(items.map(read)) === ${JSON.stringify(JSON.stringify([
        [second, `「${SECOND.label}」`, SECOND.purpose, 'r2', 'false', 'false'].join('|'),
        [first, `「${FIRST.label}」`, FIRST.purpose, 'r1', 'true', 'false'].join('|'),
      ]))} &&
        (items[0].querySelector('.milestone-meta')?.textContent ?? '').startsWith(${JSON.stringify(`用途：${SECOND.purposeLabel} · 修订版 r2 · 本机编辑 · `)}) &&
        (items[1].querySelector('.milestone-meta')?.textContent ?? '').startsWith(${JSON.stringify(`用途：${FIRST.purposeLabel} · 修订版 r1 · 本机编辑 · `)}) &&
        items[0].querySelector('.milestone-note') === null && items[1].querySelector('.milestone-note')?.textContent === ${JSON.stringify(`说明：${FIRST.note}`)} &&
        items[0].querySelector('.milestone-changed-since') === null && items[1].querySelector('.milestone-changed-since')?.textContent === '自「一审稿」后有修改';
    })()`, 'two-milestones-listed-newest-first');
    // None is final and none designated: no mark, no current item, no word that ranks one above the other.
    await assertRenderer(renderer, `window.__j07.items().every((item) => item.dataset.publicationCurrent === 'false' && !item.hasAttribute('aria-current') && item.querySelector('.publication-version-mark') === null && !/最终|终稿|最新/.test(item.textContent ?? '')) && window.__j07.versions().length === 0 && window.__j07.form() === null`, 'none-final-none-designated');
    // Every identity stays in a closed 查看技术详情, one step below the words it belongs to (LAYER-001).
    await assertRenderer(renderer, `(() => { const text = window.__j07.decisionText(); const layers = Array.from(window.__j07.block().querySelectorAll('details.technical-details')); return !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text) && !/[0-9a-f]{64}/.test(text) && layers.length === 3 && layers.every((layer) => !layer.open && layer.querySelector('summary')?.textContent === '查看技术详情'); })()`, 'identities-in-closed-technical-layers');

    at('designate-form');
    await clickSelector(renderer, '[data-screen="book-deliverables"] [data-publication-action="designate"]', 'designate-open');
    await waitFor(renderer, `window.__j07.form() !== null && document.activeElement === window.__j07.radios()[0]`, 'designate-form-open', 10_000);
    // Every milestone as a choice and none chosen; what will be recorded; the two fields; the fixed sentence
    // beside the action, on screen from the start; and the confirm unavailable with its reason in words.
    await assertRenderer(renderer, `(() => {
      const form = window.__j07.form();
      const radios = window.__j07.radios();
      const statement = form.querySelector('.publication-statement');
      const confirm = window.__j07.action('confirm');
      const cancel = window.__j07.action('cancel');
      const scope = window.__j07.field('scope');
      const basis = window.__j07.field('basis');
      const terms = Array.from(form.querySelectorAll('dl.publication-designate-summary > dt')).map((term) => term.textContent);
      const reason = form.querySelector('.publication-confirm-reason');
      return JSON.stringify(radios.map((radio) => radio.value)) === ${JSON.stringify(JSON.stringify([second, first]))} && radios.every((radio) => !radio.checked) &&
        form.querySelector('fieldset > legend')?.textContent === '选择里程碑版本' &&
        statement?.textContent === ${JSON.stringify(STATEMENT)} && statement.checkVisibility() && statement.getBoundingClientRect().height > 0 &&
        JSON.stringify(terms) === '["图书","稿件","里程碑版本","与当前稿件","操作人","时间"]' &&
        scope instanceof HTMLInputElement && scope.required && scope.closest('label')?.querySelector('.publication-field-label')?.textContent === '发稿范围' &&
        basis instanceof HTMLTextAreaElement && basis.required && basis.closest('label')?.querySelector('.publication-field-label')?.textContent === '依据' &&
        confirm instanceof HTMLButtonElement && confirm.disabled && confirm.textContent === '设为发稿版本' &&
        cancel instanceof HTMLButtonElement && !cancel.disabled && cancel.textContent === '取消' &&
        reason instanceof HTMLElement && !reason.hidden && (reason.textContent ?? '').startsWith('还需要选择一个里程碑版本');
    })()`, 'designate-form-states-everything-and-preselects-nothing');
    await chooseDesignation(renderer, second, 'designate-choose-second');
    await assertRenderer(renderer, `(() => { const values = window.__j07.summary(); return values[0] === ${JSON.stringify(EXCERPT.title)} && values[1].startsWith('主稿件 · 当前修订版 r2') && values[2].startsWith(${JSON.stringify(`「${SECOND.label}」 · r2 · `)}) && values[3] === '与当前稿件一致' && values[4] === '本机编辑' && values[5] === '确认时记录'; })()`, 'designate-summary-names-the-exact-version');
    // 发稿范围 counts characters as the service does: 81 CJK characters are too many, while 80 characters
    // outside the Basic Multilingual Plane — 160 UTF-16 units, past any HTML maxLength of 80 — are not.
    await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', '范'.repeat(81), 'designate-scope-too-long');
    await assertRenderer(renderer, `(() => { const scope = window.__j07.field('scope'); const problem = scope.closest('label').querySelector('.publication-field-problem'); return scope.getAttribute('aria-invalid') === 'true' && !problem.hidden && problem.textContent === '发稿范围最多 80 个字符，现在 81 个。' && window.__j07.action('confirm').disabled; })()`, 'designate-scope-bound-refuses-81');
    await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', '𠀀'.repeat(80), 'designate-scope-supplementary');
    await assertRenderer(renderer, `(() => { const scope = window.__j07.field('scope'); return scope.value.length === 160 && scope.getAttribute('aria-invalid') === 'false' && scope.closest('label').querySelector('.publication-field-problem').hidden; })()`, 'designate-scope-bound-counts-characters');
    await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', PRINT.scope, 'designate-scope');
    await fill(renderer, 'form.publication-designate [data-publication-field="basis"]', PRINT.basis, 'designate-basis');
    await assertRenderer(renderer, `window.__j07.action('confirm')?.disabled === false && window.__j07.form().querySelector('.publication-confirm-reason')?.hidden === true`, 'designate-ready');

    at('designate-confirmed');
    await confirmWithStatement(renderer, `已设为发稿版本 · 「${SECOND.label}」 · r2 · ${PRINT.scope}`, 'designate');
    // 发稿版本 on the chosen milestone and on no other; one record with its scope, basis and time; the pending
    // 录入定价与首印 line with no action; no change notice, because the manuscript is exactly r2.
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.block();
      const current = window.__j07.items().filter((item) => item.dataset.publicationCurrent === 'true');
      const marks = Array.from(block.querySelectorAll('.publication-version-mark'));
      const versions = window.__j07.versions();
      const prompt = block.querySelector('.publication-actuals-prompt');
      return current.length === 1 && current[0].dataset.milestoneId === ${JSON.stringify(second)} && marks.length === 1 && current[0].contains(marks[0]) && marks[0].textContent === '发稿版本' &&
        versions.length === 1 && versions[0].dataset.publicationCurrent === 'true' && versions[0].dataset.designatedMilestoneId === ${JSON.stringify(second)} &&
        versions[0].querySelector('.publication-version-title')?.textContent === ${JSON.stringify(`第 1 次设为发稿版本 · 「${SECOND.label}」 · r2`)} &&
        versions[0].querySelector('.publication-scope')?.textContent === ${JSON.stringify(`发稿范围：${PRINT.scope}`)} &&
        versions[0].querySelector('.publication-basis')?.textContent === ${JSON.stringify(`依据：${PRINT.basis}`)} &&
        (versions[0].querySelector('.publication-recorded')?.textContent ?? '').startsWith('本机编辑 · ') &&
        prompt?.textContent === ${JSON.stringify(ACTUALS_PROMPT)} && prompt.querySelectorAll('button, a, input, select, textarea').length === 0 &&
        block.querySelector('.publication-change-notice') === null && block.dataset.changeNotice === 'false' &&
        document.activeElement === window.__j07.action('designate');
    })()`, 'designated-on-the-chosen-milestone');
    const once = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(once?.designations?.length === 1 && once.designations[0].ordinal === 1 && once.designations[0].current === true &&
      once.designations[0].milestoneId === second && once.designations[0].revisionLabel === 'r2' && once.designations[0].scope === PRINT.scope &&
      once.designations[0].basis === PRINT.basis && UUID_PATTERN.test(once.designations[0].publicationVersionId) &&
      once.milestones.filter((item) => item.designated).map((item) => item.milestoneId).join('|') === second && once.notice === null && once.prompt === ACTUALS_PROMPT,
    'service-agrees-designated', once);
    const printVersion = once.designations[0];
    await assertRenderer(renderer, `window.__j07.versions()[0]?.dataset.publicationVersionId === ${JSON.stringify(printVersion.publicationVersionId)}`, 'history-is-the-service-record');
    await assertNoForbiddenWords(renderer, 'designated-without-forbidden-words');

    at('designate-repeat-unchanged');
    // The same milestone, scope and basis again: nothing is appended, and the status says so.
    await designate(renderer, { milestoneId: second, ...PRINT }, `已是当前发稿版本 · 「${SECOND.label}」 · r2 · ${PRINT.scope}`, 'repeat');
    const repeated = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(repeated?.designations?.length === 1 && JSON.stringify(repeated.designations[0]) === JSON.stringify(printVersion), 'repeat-recorded-nothing', repeated);
    await assertRenderer(renderer, `window.__j07.versions().length === 1 && window.__j07.versions()[0].dataset.publicationVersionId === ${JSON.stringify(printVersion.publicationVersionId)}`, 'repeat-history-unchanged');

    at('change-notice-after-edit');
    // An acknowledged edit after the designation: the Publication Version Change Notice names the version it
    // was set on, and the designation itself stays where it was (PUB-006).
    await openManuscript(renderer, 'notice');
    await acknowledgedEdit(renderer, SECOND_EDIT, 'second-edit');
    await openDeliverables(renderer, 'notice');
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.block();
      const notice = block.querySelector('.publication-change-notice');
      const current = window.__j07.items().find((item) => item.dataset.publicationCurrent === 'true');
      return block.dataset.changeNotice === 'true' && notice?.querySelector('strong')?.textContent === '自发稿版本后有修改' && (notice.textContent ?? '').includes('发稿版本定在 r2') &&
        current?.dataset.milestoneId === ${JSON.stringify(second)} && current.querySelector('.publication-version-mark')?.textContent === '发稿版本' &&
        current.querySelector('.milestone-changed-since')?.textContent === '自「二审稿」后有修改' && window.__j07.versions().length === 1;
    })()`, 'change-notice-names-the-designated-version');
    const noticed = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(noticed?.notice?.label === '自发稿版本后有修改' && noticed.notice.publicationVersionId === printVersion.publicationVersionId &&
      noticed.notice.revisionLabel === 'r2' && JSON.stringify(noticed.designations) === JSON.stringify([printVersion]), 'service-agrees-change-notice', noticed);

    at('designate-older-milestone');
    // A newer designation is a separate manual one (PUB-007): the older milestone, chosen exactly — not the
    // latest — with its relation to the current manuscript stated before the confirm.
    await openDesignateForm(renderer, 'older');
    await chooseDesignation(renderer, first, 'older-choose');
    await assertRenderer(renderer, `(() => { const values = window.__j07.summary(); return values[2].startsWith(${JSON.stringify(`「${FIRST.label}」 · r1 · `)}) && values[3] === '自「一审稿」后有修改'; })()`, 'older-summary-states-the-relation');
    await fill(renderer, 'form.publication-designate [data-publication-field="scope"]', EBOOK.scope, 'older-scope');
    await fill(renderer, 'form.publication-designate [data-publication-field="basis"]', EBOOK.basis, 'older-basis');
    await confirmWithStatement(renderer, `已设为发稿版本 · 「${FIRST.label}」 · r1 · ${EBOOK.scope}`, 'older');
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.block();
      const current = window.__j07.items().filter((item) => item.dataset.publicationCurrent === 'true');
      const versions = window.__j07.versions();
      return current.length === 1 && current[0].dataset.milestoneId === ${JSON.stringify(first)} && block.querySelectorAll('.publication-version-mark').length === 1 &&
        versions.map((item) => item.dataset.publicationOrdinal + ':' + item.dataset.publicationCurrent + ':' + item.dataset.designatedMilestoneId).join('|') === ${JSON.stringify(`2:true:${first}|1:false:${second}`)} &&
        versions[1].dataset.publicationVersionId === ${JSON.stringify(printVersion.publicationVersionId)} &&
        versions[1].querySelector('.publication-scope')?.textContent === ${JSON.stringify(`发稿范围：${PRINT.scope}`)} &&
        versions[0].querySelector('.publication-current-mark')?.textContent === '当前发稿版本' && versions[1].querySelector('.publication-current-mark') === null &&
        block.querySelector('.publication-change-notice') !== null;
    })()`, 'newer-designation-is-a-separate-record');
    const twice = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(twice?.designations?.length === 2 && twice.designations[0].ordinal === 2 && twice.designations[0].current === true &&
      twice.designations[0].milestoneId === first && twice.designations[0].revisionLabel === 'r1' && twice.designations[0].scope === EBOOK.scope &&
      twice.designations[0].basis === EBOOK.basis && twice.designations[1].current === false &&
      JSON.stringify({ ...twice.designations[1], current: true }) === JSON.stringify(printVersion) && twice.notice?.revisionLabel === 'r1',
    'older-designation-kept-as-it-was', twice);
    cancellation.throwIfRequested();

    at('export-note-added');
    // The file's own 批注 and 修改建议 stand where the import put them, open and under the author's name; the
    // editor adds one 备注 on a paragraph no stage edits.
    await openManuscript(renderer, 'note');
    await assertRenderer(renderer, MARK_HELPERS, 'mark-helpers');
    await assertRenderer(renderer, `(() => { const head = window.__j07m.text(${NOTE.block})?.slice(0, ${NOTE.to}) ?? ''; return window.__j07m.blocks().length === ${EXCERPT.blocks} && head.length === ${NOTE.to} && Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(head)).length === ${NOTE.to}; })()`, 'note-paragraph-markable');
    await assertRenderer(renderer, `(() => {
      const annotation = window.__j07m.mark('annotation', ${EXPORT_INPUT.comment.block});
      const suggestion = window.__j07m.mark('change-suggestion', ${EXPORT_INPUT.replacement.block});
      const standing = (nodes) => nodes.length > 0 && nodes.every((node) => node.dataset.markSource === 'imported-author' && node.dataset.markStatus === 'open' && node.dataset.markAnchor === 'exact');
      return standing(annotation) && standing(suggestion) && window.__j07m.marks().length === annotation.length + suggestion.length;
    })()`, 'imported-marks-stand');
    await openSelectionMenu(renderer, NOTE.block, NOTE.from, NOTE.to, 'note-menu');
    await clickSelector(renderer, '.editorial-mark-menu-layer [data-mark-menu] [data-mark-action="add-editor-note"]', 'note-choose');
    await waitFor(renderer, `window.__j07m.composer()?.dataset.markComposer === 'create-editor-note'`, 'note-composer', 15_000);
    await assertRenderer(renderer, `window.__j07m.write('body', ${JSON.stringify(NOTE.body)}) && window.__j07m.act('submit')`, 'note-submit');
    await waitFor(renderer, `window.__j07m.composer() === null && window.__j07m.mark('editor-note', ${NOTE.block}).length > 0`, 'note-drawn', 30_000);
    await assertRenderer(renderer, `window.__j07m.markText('editor-note', ${NOTE.block}) === window.__j07m.text(${NOTE.block}).slice(${NOTE.from}, ${NOTE.to})`, 'note-on-its-words');

    at('export-open-current');
    // 导出… of the current revision: the unsaved edit becomes revision r3 — not a milestone — and the card reviews
    // it with 含批注 and 含修改建议（作为修订） on and 含备注 off, DOCX chosen of the three formats (PDF and the
    // Markdown 备用格式 since Issue #500), focus on it.
    await openDeliverables(renderer, 'export');
    await assertRenderer(renderer, `(() => { const openers = Array.from(document.querySelectorAll('[data-screen="book-deliverables"] [data-export-action="open"]')); return window.__j07.exportCard() === null && openers.every((node) => node.textContent === '导出…' && !node.disabled) && JSON.stringify(openers.map((node) => node.getAttribute('aria-label'))) === ${JSON.stringify(JSON.stringify(['导出当前修订版…', `导出里程碑版本「${SECOND.label}」…`, `导出里程碑版本「${FIRST.label}」…`]))} && window.__j07.block().querySelector('section.export-records-section')?.dataset.exportRecords === '0'; })()`, 'export-openers-name-their-version');
    await clickSelector(renderer, '[data-screen="book-deliverables"] section.deliverables-publication [data-export-action="open"][data-export-target="current"]', 'export-open');
    await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'ready' && window.__j07.exportCard().querySelector('section.export-fidelity') !== null && window.__j07.status() === '导出保真审阅已就绪'`, 'export-reviewed', 120_000);
    await assertRenderer(renderer, `(() => {
      const card = window.__j07.exportCard();
      const formats = Array.from(card.querySelectorAll('input[name="export-format"]'));
      const option = window.__j07.exportOption;
      return card.dataset.exportTarget === 'current' && card.querySelector('h4')?.textContent === '导出 · 当前修订版 r3' &&
        card.querySelector('.export-saved-line')?.textContent === '未保存的修改已为导出保存为修订版 r3；这不是里程碑版本。' &&
        card.querySelector('.export-local-line')?.textContent === ${JSON.stringify(EXPORT_LOCAL_LINE)} &&
        JSON.stringify(formats.map((radio) => radio.value + ':' + radio.checked + ':' + radio.disabled)) === '["docx:true:false","pdf:false:false","markdown:false:false"]' &&
        option('includeAnnotations')?.checked === true && option('includeSuggestions')?.checked === true && option('includeEditorNotes')?.checked === false &&
        document.activeElement === formats[0] && window.__j07.tone() === 'success';
    })()`, 'export-card-states-the-version');
    // The saved revision is the manuscript's current one, and 交付物 reads it so.
    await waitFor(renderer, `(window.__j07.block()?.querySelector('.deliverables-manuscript-line')?.textContent ?? '').startsWith('当前稿件：修订版 r3 · ')`, 'export-saved-revision-is-current', 30_000);

    at('export-fidelity-table');
    // Every class the revision holds, one row each with its count and status in words and shape; the classes
    // found nowhere summarized on one line; nothing degraded, so nothing asks to be accepted.
    await assertRenderer(renderer, `(() => {
      const fidelity = window.__j07.exportCard().querySelector('section.export-fidelity');
      const pills = Array.from(fidelity.querySelectorAll('li.export-fidelity-row .status-pill')).map((pill) => pill.textContent);
      return JSON.stringify(window.__j07.exportRows()) === ${JSON.stringify(JSON.stringify(EXPORT_ROWS))} &&
        JSON.stringify(pills) === ${JSON.stringify(JSON.stringify(EXPORT_ROWS.map((row) => row.includes(':excluded:') ? '○ 本次不含' : '✓ 完整保留')))} &&
        fidelity.querySelector('h5')?.textContent === '导出保真审阅' && fidelity.dataset.exportDegraded === 'false' && fidelity.dataset.exportRestoration === 'from-original' &&
        fidelity.querySelector('.export-restoration-line')?.textContent === ${JSON.stringify(EXPORT_RESTORATION_LINE)} &&
        fidelity.querySelector('.export-absent-line')?.textContent === ${JSON.stringify(EXPORT_ABSENT_LINE)} &&
        fidelity.querySelector('li[data-export-fidelity="editor-notes"] .export-fidelity-detail')?.textContent === ${JSON.stringify(EXPORT_NOTE_EXCLUDED)} &&
        fidelity.querySelector('.export-degraded-note') === null && fidelity.querySelector('.export-fidelity-positions') === null;
    })()`, 'export-review-rows');
    // The page shows the service's review: the same review asked of the service directly — the edits saved
    // already, so nothing is saved again — carries the digest the card's technical layer names.
    const reviewed = await renderer.evaluate(`window.ai7.reviewManuscriptExport({ target: { kind: 'current' }, options: { includeAnnotations: true, includeSuggestions: true, includeEditorNotes: false } }).then((review) => ({ savedForExport: review.savedForExport, revisionLabel: review.target.revisionLabel, reviewDigest: review.reviewDigest, rows: review.fidelity.filter((row) => row.count > 0 || row.status !== 'preserved').map((row) => row.key + ':' + row.status + ':' + row.count), suggestedFileName: review.suggestedFileName }))`);
    requireJourney(reviewed?.savedForExport === false && reviewed.revisionLabel === 'r3' && JSON.stringify(reviewed.rows) === JSON.stringify(EXPORT_ROWS) &&
      /^[0-9a-f]{64}$/.test(reviewed.reviewDigest ?? '') && reviewed.suggestedFileName === `${EXCERPT.title} · r3.docx`, 'service-agrees-review', reviewed);
    await assertRenderer(renderer, `window.__j07.exportFact('保真审阅摘要') === ${JSON.stringify(reviewed.reviewDigest)} && !window.__j07.exportCard().querySelector('details.technical-details').open`, 'export-review-is-the-service-review');

    at('export-save-dialog');
    // 按上述方式导出 waits for the destination with its reason beside it; 选择保存位置… takes it from the system's
    // Save dialog — this launch's control answers for it — and shows it exactly as the dialog returned it, with
    // 按上述方式导出 then available and focused. Nothing is written yet.
    await assertRenderer(renderer, `(() => {
      const card = window.__j07.exportCard();
      const approve = window.__j07.exportAction('approve');
      const reason = card.querySelector('.export-approve-reason');
      const destination = card.querySelector('section.export-destination');
      return destination?.dataset.exportDestination === 'unchosen' && destination.querySelector('.export-destination-line')?.textContent === ${JSON.stringify(EXPORT_DESTINATION_UNCHOSEN)} &&
        window.__j07.exportAction('choose')?.textContent === '选择保存位置…' && !window.__j07.exportAction('choose').disabled &&
        approve instanceof HTMLButtonElement && approve.disabled && approve.textContent === '按上述方式导出' &&
        reason instanceof HTMLElement && !reason.hidden && reason.textContent === '先选择保存位置。' && approve.getAttribute('aria-describedby') === reason.id &&
        window.__j07.exportAction('cancel')?.textContent === '取消';
    })()`, 'export-approve-waits-for-a-destination');
    await exportAct(renderer, 'choose', 'export-choose');
    await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'prepared' && window.__j07.status() === '已准备好导出文件，等待你确认。'`, 'export-prepared', 120_000);
    await assertRenderer(renderer, `(() => {
      const card = window.__j07.exportCard();
      const approve = window.__j07.exportAction('approve');
      const destination = card.querySelector('section.export-destination');
      return destination.dataset.exportDestination === 'create' && destination.querySelector('.export-destination-line')?.textContent === ${JSON.stringify(`${exportPath}（新建文件）`)} &&
        window.__j07.exportAction('choose')?.textContent === '重新选择保存位置…' && approve instanceof HTMLButtonElement && !approve.disabled &&
        document.activeElement === approve && card.querySelector('.export-approve-reason')?.hidden === true && card.querySelector('.export-problem')?.hidden === true;
    })()`, 'export-destination-bound');
    requireJourney(!existsSync(exportPath) && (await readdir(exportsRoot)).length === 0, 'export-nothing-written-before-approval');

    at('export-approved');
    // 按上述方式导出 writes the file at the chosen place and ends at 已导出到所选位置 with its receipt; the choices
    // that made it no longer change.
    await exportAct(renderer, 'approve', 'export-approve');
    await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'done' && window.__j07.status() === ${JSON.stringify(EXPORTED_LABEL)} && window.__j07.tone() === 'success'`, 'export-written', 120_000);
    await assertRenderer(renderer, `(() => {
      const receipt = window.__j07.exportCard().querySelector('.export-receipt');
      const actions = Array.from(receipt?.querySelectorAll('[data-export-action]') ?? []).map((node) => node.dataset.exportAction + ':' + node.textContent);
      return receipt?.dataset.exportOutcome === 'created' && receipt.getAttribute('role') === 'status' &&
        receipt.querySelector('.export-outcome')?.textContent === ${JSON.stringify(EXPORTED_LABEL)} &&
        receipt.querySelector('.export-outcome-detail')?.textContent === ${JSON.stringify(`已新建「${EXPORT_FILE}」。`)} &&
        (receipt.querySelector('.export-receipt-meta')?.textContent ?? '').startsWith(${JSON.stringify(`「${EXPORT_FILE}」 · `)}) &&
        JSON.stringify(actions) === '["reveal:在文件夹中显示","close:完成"]' && document.activeElement === receipt.querySelector('[data-export-action="reveal"]') &&
        window.__j07.exportAction('approve') === null && window.__j07.exportAction('choose') === null &&
        ['includeAnnotations', 'includeSuggestions', 'includeEditorNotes'].every((key) => window.__j07.exportOption(key)?.disabled === true);
    })()`, 'export-receipt-shown');

    at('export-receipt-recorded');
    // 交付物 lists the export with what it came to; the service's receipt names the file on disk byte for byte,
    // and the chosen folder holds that one file and nothing half-written.
    await waitFor(renderer, `window.__j07.block()?.querySelector('section.export-records-section')?.dataset.exportRecords === '1'`, 'export-record-listed', 30_000);
    const recorded = await renderer.evaluate(`window.ai7.inspectDeliverables().then((deliverables) => deliverables.exports.map((record) => ({ preparationId: record.preparationId, outcome: record.outcome, outcomeLabel: record.outcomeLabel, fileName: record.fileName, destination: record.destination, target: record.target, byteLength: record.byteLength, revealAvailable: record.revealAvailable, fileSha256: record.technical.fileSha256 })))`);
    const written = await readFile(exportPath);
    requireJourney(Array.isArray(recorded) && recorded.length === 1 && recorded[0].outcome === 'created' && recorded[0].outcomeLabel === EXPORTED_LABEL &&
      recorded[0].fileName === EXPORT_FILE && recorded[0].destination === exportPath && recorded[0].target?.kind === 'current' && recorded[0].target.milestoneId === null &&
      recorded[0].target.revisionLabel === 'r3' && recorded[0].revealAvailable === true && recorded[0].byteLength === written.length &&
      recorded[0].fileSha256 === createHash('sha256').update(written).digest('hex') && UUID_PATTERN.test(recorded[0].preparationId),
    'service-receipt-names-the-file', Array.isArray(recorded) ? recorded.map((record) => ({ outcome: record.outcome, byteLength: record.byteLength, onDisk: written.length })) : recorded);
    requireJourney(JSON.stringify(await readdir(exportsRoot)) === JSON.stringify([EXPORT_FILE]), 'export-folder-holds-one-file');
    await assertRenderer(renderer, `(() => {
      const records = window.__j07.exportRecords();
      const layer = records[0]?.querySelector('details.technical-details');
      return records.length === 1 && records[0].dataset.preparationId === ${JSON.stringify(recorded[0].preparationId)} && records[0].dataset.exportOutcome === 'created' &&
        (records[0].querySelector('.export-record-line')?.textContent ?? '').startsWith(${JSON.stringify(`${EXPORTED_LABEL} · 「${EXPORT_FILE}」 · 修订版 r3 · `)}) &&
        records[0].querySelector('.export-record-detail')?.textContent === ${JSON.stringify(`已新建「${EXPORT_FILE}」。`)} &&
        layer instanceof HTMLDetailsElement && !layer.open && !/[0-9a-f]{64}/.test(records[0].querySelector('.export-record-line').textContent);
    })()`, 'export-record-reads-the-receipt');

    at('export-file-parsed');
    // The written file read back by the runner: the manuscript's paragraphs as they stand — the two edits in the
    // first — with the untouched paragraph's bold run and the header byte for byte from the original, the author's
    // 批注 and tracked replacement under the author's name, and no 备注.
    const digestOf = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
    const spanDigest = async (span) => digestOf(await admittedSpanText(EXCERPT.source, span));
    const excerpt = await admittedParagraphs(EXCERPT);
    const expectedParagraphs = excerpt.map((text, index) => digestOf(index === 0 ? `${text}${FIRST_EDIT}${SECOND_EDIT}` : text));
    const original = await readExportedDocx(manuscript);
    const exported = await readExportedDocx(exportPath);
    requireJourney(JSON.stringify(exported.paragraphs.map((paragraph) => paragraph.digest)) === JSON.stringify(expectedParagraphs), 'export-paragraphs-as-the-manuscript',
      { paragraphs: exported.paragraphs.length, differing: exported.paragraphs.map((paragraph, index) => paragraph.digest === expectedParagraphs[index] ? 0 : index + 1).filter(Boolean) });
    requireJourney(JSON.stringify(exported.paragraphs.map((paragraph, index) => paragraph.bold ? index + 1 : 0).filter(Boolean)) === JSON.stringify([EXPORT_INPUT.styledRun.block]), 'export-keeps-the-styled-run');
    requireJourney(exported.headerReference === true && typeof exported.parts['word/header1.xml'] === 'string' && exported.parts['word/header1.xml'] === original.parts['word/header1.xml'], 'export-keeps-the-header');
    requireJourney(JSON.stringify(exported.comments) === JSON.stringify([{ author: IMPORTED_MARKS_AUTHOR, digest: await spanDigest(EXPORT_INPUT.comment.text) }]),
      'export-writes-the-annotation-and-no-note', exported.comments.map((comment) => comment.author === IMPORTED_MARKS_AUTHOR ? 'file-author' : comment.author === '备注' ? 'note' : 'other'));
    requireJourney(JSON.stringify(exported.insertions) === JSON.stringify([{ author: IMPORTED_MARKS_AUTHOR, digest: await spanDigest(EXPORT_INPUT.replacement.insert) }]) &&
      JSON.stringify(exported.deletions) === JSON.stringify([{ author: IMPORTED_MARKS_AUTHOR, digest: await spanDigest({ block: EXPORT_INPUT.replacement.block, from: EXPORT_INPUT.replacement.from, to: EXPORT_INPUT.replacement.to }) }]),
    'export-writes-the-suggestion-as-a-revision', { insertions: exported.insertions.length, deletions: exported.deletions.length });
    requireJourney(JSON.stringify(Object.keys(exported.parts).sort()) === JSON.stringify(EXPORTED_PARTS), 'export-package-parts', Object.keys(exported.parts).sort());
    // 完成 closes the card; 交付物 drew its 导出… again after the export, and focus finds the one it came from.
    await exportAct(renderer, 'close', 'export-close');
    await waitFor(renderer, `window.__j07.exportCard() === null && document.activeElement === window.__j07.exportOpener('current')`, 'export-closed-focus-returns', 10_000);

    at('restart-keeps-everything');
    // A restart moves nothing: 交付物 answers byte for byte as before, and 工作概览 reads it as one line.
    const beforeRestart = await renderer.evaluate(`window.ai7.inspectDeliverables().then((deliverables) => JSON.stringify(deliverables))`);
    requireJourney(typeof beforeRestart === 'string' && beforeRestart.length > 0, 'restart-read-before');
    await close();
    renderer = await launch({ save: cancelledPath });
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]') && document.querySelector('.recent-work-item button')`, 'restart-prior-work');
    await assertRenderer(renderer, PAGE_HELPERS, 'restart-page-helpers');
    await assertRenderer(renderer, `(() => { document.querySelector('.recent-work-item button').click(); return true; })()`, 'restart-open');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]')`, 'restart-editor');
    await click(renderer, '返回图书工作概览', 'restart-overview');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-deliverables-summary[data-deliverables-state="designated"] [data-deliverables-action="open"]')`, 'restart-overview-line');
    await assertRenderer(renderer, `(() => { const line = document.querySelector('[data-screen="book-overview"] .book-deliverables-summary'); const open = line.querySelector('[data-deliverables-action="open"]'); return line.dataset.deliverablesBookId === ${JSON.stringify(bookId)} && line.querySelector('h3')?.textContent === '交付物' && line.querySelector('p')?.textContent === ${JSON.stringify(`发稿 · 里程碑版本 2 个 · 发稿版本「${FIRST.label}」 · r1 · ${EBOOK.scope} · 自发稿版本后有修改`)} && open instanceof HTMLButtonElement && open.textContent === '打开交付物'; })()`, 'overview-line-reads-the-publication');
    await clickSelector(renderer, '[data-screen="book-overview"] .book-deliverables-summary [data-deliverables-action="open"]', 'overview-opens-deliverables');
    await waitForDeliverables(renderer, 'restart');
    const afterRestart = await renderer.evaluate(`window.ai7.inspectDeliverables().then((deliverables) => JSON.stringify(deliverables))`);
    requireJourney(afterRestart === beforeRestart, 'restart-moved-nothing');
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.block();
      const items = window.__j07.items();
      const versions = window.__j07.versions();
      return JSON.stringify(items.map((item) => item.dataset.milestoneId + ':' + item.dataset.publicationCurrent)) === ${JSON.stringify(JSON.stringify([`${second}:false`, `${first}:true`]))} &&
        JSON.stringify(versions.map((item) => item.dataset.publicationVersionId)) === ${JSON.stringify(JSON.stringify([twice.designations[0].publicationVersionId, printVersion.publicationVersionId]))} &&
        block.dataset.changeNotice === 'true' && block.querySelector('.publication-actuals-prompt') !== null;
    })()`, 'restart-page-unmoved');

    at('actuals-prompt-and-words');
    // The 录入定价与首印 line is recorded and pending, with no action until the evaluation features take it up;
    // nothing anywhere says published, sent, delivered or received; and nothing exports, publishes or sends.
    await assertRenderer(renderer, `(() => { const prompt = window.__j07.block().querySelector('.publication-actuals-prompt'); return prompt?.textContent === ${JSON.stringify(ACTUALS_PROMPT)} && prompt.querySelectorAll('button, a, input, select, textarea, [tabindex]').length === 0 && prompt.closest('button, a') === null; })()`, 'actuals-prompt-pending-without-action');
    await assertNoForbiddenWords(renderer, 'restart-without-forbidden-words');
    // The only controls that name 导出 are 导出… of each version (Issue #413); nothing publishes or sends.
    await assertRenderer(renderer, `(() => { const controls = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"]')); const actions = Array.from(window.__j07.block().querySelectorAll('[data-publication-action]')).map((node) => node.dataset.publicationAction); return !controls.some((node) => /发布|发送/.test(node.textContent ?? '')) && controls.filter((node) => /导出/.test(node.textContent ?? '')).every((node) => node.dataset.exportAction === 'open' && node.textContent === '导出…') && JSON.stringify(actions) === '["designate"]' && ${EXPORT_MEMBERS_ONLY}; })()`, 'no-publish-or-send-action');

    at('export-cancel-creates-nothing');
    // This launch's Save dialog answers once more. 一审稿's 导出… reviews that milestone exactly as it was saved —
    // nothing to save first — and takes the destination; 取消 then closes the card with focus back on its opener,
    // and nothing is written or recorded.
    await assertRenderer(renderer, `window.__j07.exportCard() === null`, 'cancel-no-card-after-restart');
    await clickSelector(renderer, `[data-screen="book-deliverables"] ol.milestone-list > li[data-milestone-id="${first}"] [data-export-action="open"]`, 'cancel-open');
    await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'ready' && window.__j07.exportCard().querySelector('section.export-fidelity') !== null`, 'cancel-reviewed', 120_000);
    await assertRenderer(renderer, `(() => { const card = window.__j07.exportCard(); return card.dataset.exportTarget === 'milestone' && card.dataset.milestoneId === ${JSON.stringify(first)} && card.querySelector('h4')?.textContent === ${JSON.stringify(`导出 · 里程碑版本「${FIRST.label}」 · r1`)} && card.querySelector('.export-saved-line') === null && card.querySelector('section.export-destination')?.dataset.exportDestination === 'unchosen'; })()`, 'cancel-card-names-the-milestone');
    await exportAct(renderer, 'choose', 'cancel-choose');
    await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'prepared'`, 'cancel-prepared', 120_000);
    await assertRenderer(renderer, `window.__j07.exportCard().querySelector('.export-destination-line')?.textContent === ${JSON.stringify(`${cancelledPath}（新建文件）`)} && window.__j07.exportAction('approve')?.disabled === false`, 'cancel-destination-bound');
    await exportAct(renderer, 'cancel', 'cancel-close');
    await waitFor(renderer, `window.__j07.exportCard() === null && window.__j07.status() === ${JSON.stringify(EXPORT_CLOSED)} && document.activeElement === window.__j07.exportOpener('milestone', ${JSON.stringify(first)})`, 'cancel-closed', 10_000);
    requireJourney(!existsSync(cancelledPath) && JSON.stringify(await readdir(exportsRoot)) === JSON.stringify([EXPORT_FILE]), 'cancel-wrote-nothing');
    const afterCancel = await renderer.evaluate(`window.ai7.inspectDeliverables().then((deliverables) => deliverables.exports.map((record) => record.preparationId))`);
    requireJourney(JSON.stringify(afterCancel) === JSON.stringify([recorded[0].preparationId]) && (await renderer.evaluate(`window.__j07.exportRecords().length`)) === 1, 'cancel-recorded-nothing');

    at('j14-designate-keyboard');
    // The form without a pointer: Enter on 设为发稿版本… opens it on its first choice, an arrow chooses, Tab
    // reaches 发稿范围, 依据, the confirm and 取消 with visible focus, and Enter on 取消 closes it with focus back
    // on the opener and nothing recorded.
    await assertRenderer(renderer, `(() => { const open = window.__j07.action('designate'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.focus(); return document.activeElement === open; })()`, 'keyboard-opener-focused');
    await pressEnter(renderer);
    await waitFor(renderer, `(() => { const radios = window.__j07.radios(); return window.__j07.form() !== null && radios.length === 2 && document.activeElement === radios[0] && radios.every((radio) => !radio.checked); })()`, 'keyboard-form-opens-on-its-first-choice', 10_000);
    await press(renderer, 'ArrowDown');
    await waitFor(renderer, `(() => { const radios = window.__j07.radios(); return document.activeElement === radios[1] && radios[1].checked && !radios[0].checked; })()`, 'keyboard-arrow-chooses', 10_000);
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.field('scope') && document.activeElement.matches(':focus-visible')`, 'keyboard-scope-reached', 10_000);
    await renderer.send('Input.insertText', { text: KEYBOARD.scope });
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.field('basis') && document.activeElement.matches(':focus-visible')`, 'keyboard-basis-reached', 10_000);
    await renderer.send('Input.insertText', { text: KEYBOARD.basis });
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.action('confirm') && !window.__j07.action('confirm').disabled && document.activeElement.matches(':focus-visible')`, 'keyboard-confirm-reached', 10_000);
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.action('cancel') && document.activeElement.matches(':focus-visible')`, 'keyboard-cancel-reached', 10_000);
    await pressEnter(renderer);
    await waitFor(renderer, `window.__j07.form() === null && document.activeElement === window.__j07.action('designate')`, 'keyboard-cancel-returns-focus', 10_000);
    const afterKeyboard = await renderer.evaluate(READ_PUBLICATION);
    requireJourney(afterKeyboard?.designations?.length === 2 && afterKeyboard.designations[0].publicationVersionId === twice.designations[0].publicationVersionId, 'keyboard-recorded-nothing', afterKeyboard);

    at('j14-deliverables-zoom-200-reflow');
    // At 200% the lists, the open form and the persistent actions reflow into the width: no sideways scroll.
    await openDesignateForm(renderer, 'zoom');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const block = window.__j07.block(); const parts = [block, block?.querySelector('ol.milestone-list'), block?.querySelector('ol.publication-versions'), window.__j07.form(), document.querySelector('[data-screen="book-deliverables"] .workbench-actions')]; const statement = window.__j07.form()?.querySelector('.publication-statement'); return parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2 && statement instanceof HTMLElement && statement.getBoundingClientRect().width > 0; })()`, 'deliverables-reflow-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-deliverables-forced-colors');
    // Without colour the 发稿版本 mark keeps its outline, the item it marks a heavier border than the others,
    // and the change notice and the fixed sentence their lines.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const block = window.__j07.block();
      const style = (node) => getComputedStyle(node);
      const current = block.querySelector('ol.milestone-list > li[data-publication-current="true"]');
      const other = block.querySelector('ol.milestone-list > li[data-publication-current="false"]');
      const mark = current?.querySelector('.publication-version-mark');
      const notice = block.querySelector('.publication-change-notice');
      const statement = window.__j07.form()?.querySelector('.publication-statement');
      return style(block).boxShadow === 'none' && mark instanceof HTMLElement && style(mark).borderTopStyle === 'solid' && parseFloat(style(mark).borderTopWidth) >= 2 &&
        other instanceof HTMLElement && parseFloat(style(current).borderTopWidth) > parseFloat(style(other).borderTopWidth) &&
        notice instanceof HTMLElement && style(notice).borderTopStyle === 'solid' && statement instanceof HTMLElement && style(statement).borderLeftStyle === 'solid';
    })()`, 'marks-speak-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await clickSelector(renderer, '[data-screen="book-deliverables"] [data-publication-action="cancel"]', 'forced-colors-form-cancel');
    await waitFor(renderer, `window.__j07.form() === null`, 'forced-colors-form-closed', 10_000);

    at('j14-export-keyboard');
    // The card without a pointer: Enter on 导出… opens it on its first choice; Tab reaches the closed 备用格式 disclosure,
    // then each option with visible focus, and Space on 含备注 reviews again — the 备注 now written under 「备注」 — with focus kept; Tab reaches
    // 选择保存位置…, left alone because this launch's Save dialog has answered, and 取消, whose Enter closes the
    // card with focus back on the opener and nothing written.
    await assertRenderer(renderer, `(() => { const open = window.__j07.exportOpener('current'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.focus(); return document.activeElement === open; })()`, 'export-keyboard-opener-focused');
    await pressEnter(renderer);
    await waitFor(renderer, `(() => { const card = window.__j07.exportCard(); const docx = card?.querySelector('input[name="export-format"][value="docx"]'); return card?.dataset.exportPhase === 'ready' && docx instanceof HTMLInputElement && docx.checked && document.activeElement === docx; })()`, 'export-keyboard-opens-on-its-first-choice', 60_000);
    await assertRenderer(renderer, `window.__j07.exportCard().querySelector('h4')?.textContent === '导出 · 当前修订版 r3' && window.__j07.exportCard().querySelector('.export-saved-line') === null`, 'export-keyboard-nothing-to-save');
    await press(renderer, 'Tab');
    await waitFor(renderer, `(() => { const summary = window.__j07.exportCard()?.querySelector('details.export-fallback-formats > summary'); return document.activeElement === summary && summary.textContent === '备用格式' && summary.matches(':focus-visible') && summary.parentElement.open === false; })()`, 'export-keyboard-fallback-formats-reached', 10_000);
    for (const key of ['includeAnnotations', 'includeSuggestions', 'includeEditorNotes']) {
      await press(renderer, 'Tab');
      await waitFor(renderer, `document.activeElement === window.__j07.exportOption(${JSON.stringify(key)}) && document.activeElement.matches(':focus-visible')`, `export-keyboard-${key}-reached`, 10_000);
    }
    await pressSpace(renderer);
    await waitFor(renderer, `(() => { const box = window.__j07.exportOption('includeEditorNotes'); return window.__j07.exportCard()?.dataset.exportPhase === 'ready' && box?.checked === true && document.activeElement === box && window.__j07.exportRows().includes('editor-notes:preserved:1') && !window.__j07.exportRows().some((row) => row.includes(':excluded:')); })()`, 'export-keyboard-space-includes-the-note', 60_000);
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.exportAction('choose') && document.activeElement.matches(':focus-visible')`, 'export-keyboard-choose-reached', 10_000);
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement === window.__j07.exportAction('cancel') && document.activeElement.matches(':focus-visible') && window.__j07.exportAction('approve')?.disabled === true`, 'export-keyboard-cancel-reached', 10_000);
    await pressEnter(renderer);
    await waitFor(renderer, `window.__j07.exportCard() === null && window.__j07.status() === ${JSON.stringify(EXPORT_CLOSED)} && document.activeElement === window.__j07.exportOpener('current')`, 'export-keyboard-cancel-returns-focus', 10_000);
    requireJourney(JSON.stringify(await readdir(exportsRoot)) === JSON.stringify([EXPORT_FILE]), 'export-keyboard-wrote-nothing');

    at('j14-export-zoom-200-reflow');
    // At 200% the card, its review, its destination and actions, and the export records reflow into the width.
    await clickSelector(renderer, '[data-screen="book-deliverables"] section.deliverables-publication [data-export-action="open"][data-export-target="current"]', 'export-zoom-open');
    await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'ready' && window.__j07.exportCard().querySelector('section.export-fidelity') !== null`, 'export-zoom-reviewed', 60_000);
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => {
      const root = document.documentElement;
      const card = window.__j07.exportCard();
      const parts = [card, card?.querySelector('fieldset.export-options'), card?.querySelector('section.export-fidelity'), card?.querySelector('ol.export-fidelity-list'),
        ...Array.from(card?.querySelectorAll('li.export-fidelity-row') ?? []), card?.querySelector('section.export-destination'), card?.querySelector('.export-actions'),
        window.__j07.block()?.querySelector('section.export-records-section'), ...window.__j07.exportRecords()];
      return parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2;
    })()`, 'export-reflow-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-export-forced-colors');
    // Without colour the card and every export record keep their frames, a chosen option a heavier border than
    // one left off, and every status its shape and words.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const style = (node) => getComputedStyle(node);
      const card = window.__j07.exportCard();
      const on = window.__j07.exportOption('includeAnnotations')?.closest('label');
      const off = window.__j07.exportOption('includeEditorNotes')?.closest('label');
      const pills = Array.from(card?.querySelectorAll('li.export-fidelity-row .status-pill') ?? []);
      const records = window.__j07.exportRecords();
      return card instanceof HTMLElement && style(card).borderTopStyle === 'solid' && style(card).boxShadow === 'none' &&
        on instanceof HTMLElement && off instanceof HTMLElement && parseFloat(style(on).borderTopWidth) > parseFloat(style(off).borderTopWidth) &&
        pills.length === ${EXPORT_ROWS.length} && pills.every((pill) => style(pill).borderTopStyle === 'solid' && /^[✓△⊘○] \\S/.test(pill.textContent ?? '')) &&
        new Set(pills.map((pill) => (pill.textContent ?? '').slice(0, 1))).size === 2 &&
        records.length === 1 && records.every((record) => style(record).borderTopStyle === 'solid');
    })()`, 'export-speaks-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await exportAct(renderer, 'cancel', 'export-forced-colors-cancel');
    await waitFor(renderer, `window.__j07.exportCard() === null`, 'export-forced-colors-closed', 10_000);

    at('export-pdf');
    // Issue #500 (S64b): a launch whose Save dialog answers with a PDF. The same revision, PDF chosen: AI7 prints the
    // page the preparation bound and writes it; the file on disk is a PDF, byte for byte the receipt's, and AI7's
    // staging folder keeps nothing of the print.
    await close();
    renderer = await launch({ save: pdfPath });
    await reopenDeliverables(renderer, 'pdf');
    const pdfRecord = await exportAs(renderer, 'pdf', pdfPath, PDF_FILE, 'pdf');
    const printed = await readFile(pdfPath);
    requireJourney(printed.subarray(0, 5).toString('latin1') === '%PDF-' && printed.subarray(Math.max(0, printed.length - 1_024)).toString('latin1').includes('%%EOF') &&
      pdfRecord.byteLength === printed.length && pdfRecord.fileSha256 === createHash('sha256').update(printed).digest('hex'), 'pdf-written-as-printed', { bytes: printed.length, recorded: pdfRecord.byteLength });
    requireJourney(JSON.stringify(await readdir(resolve(dataRoot, 'export-staging'))) === '[]', 'pdf-print-not-kept');
    requireJourney(JSON.stringify((await readdir(exportsRoot)).sort()) === JSON.stringify([EXPORT_FILE, PDF_FILE].sort()), 'pdf-folder-holds-the-two-files');

    at('export-markdown');
    // A launch whose Save dialog answers with a Markdown file: the 备用格式 of the same revision, read back by the
    // runner — every paragraph the manuscript's words at its heading level, the two edits in the first, the author's
    // 批注 a footnote under their name after its words, the tracked replacement CriticMarkup where it stands, and no 备注.
    await close();
    renderer = await launch({ save: markdownPath });
    await reopenDeliverables(renderer, 'markdown');
    const markdownRecord = await exportAs(renderer, 'markdown', markdownPath, MARKDOWN_FILE, 'markdown');
    const markdownBytes = await readFile(markdownPath);
    requireJourney(markdownRecord.byteLength === markdownBytes.length && markdownRecord.fileSha256 === createHash('sha256').update(markdownBytes).digest('hex'), 'markdown-written-as-recorded');
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
    const graphemesOf = (text) => Array.from(segmenter.segment(text), ({ segment }) => segment);
    const shapes = await admittedParagraphShapes(EXCERPT);
    const commentWords = await admittedSpanText(EXCERPT.source, EXPORT_INPUT.comment.text);
    const insertWords = await admittedSpanText(EXCERPT.source, EXPORT_INPUT.replacement.insert);
    const { comment, replacement } = EXPORT_INPUT;
    const expectedMarkdown = excerpt.map((text, index) => {
      const words = graphemesOf(index === 0 ? `${text}${FIRST_EDIT}${SECOND_EDIT}` : text);
      const span = (from, to) => markdownWords(words.slice(from, to).join(''));
      const markdown = index + 1 === comment.block
        ? `${span(0, comment.to)}[^1]${span(comment.to)}`
        : index + 1 === replacement.block
          ? `${span(0, replacement.from)}{~~${span(replacement.from, replacement.to)}~>${markdownWords(insertWords)}~~}[^2]${span(replacement.to)}`
          : span(0);
      return markdownBlock(shapes[index], markdown);
    });
    const markdownText = markdownBytes.toString('utf8');
    requireJourney(markdownText.endsWith('\n') && !markdownText.endsWith('\n\n'), 'markdown-ends-with-one-line-break');
    const markdownParts = markdownText.slice(0, -1).split('\n\n');
    const markdownBody = markdownParts.slice(0, excerpt.length);
    requireJourney(markdownParts.length === excerpt.length + 2 && JSON.stringify(markdownBody.map(digestOf)) === JSON.stringify(expectedMarkdown.map(digestOf)), 'markdown-paragraphs-as-the-manuscript',
      { parts: markdownParts.length, differing: markdownBody.map((part, index) => digestOf(part) === digestOf(expectedMarkdown[index] ?? '') ? 0 : index + 1).filter(Boolean) });
    const dated = (note) => note.replace(/^(\[\^\d\]: \S+ · .+?) · \d{4}-\d{2}-\d{2}：/u, '$1 · <date>：');
    const expectedNotes = [
      `[^1]: 批注 · ${IMPORTED_MARKS_AUTHOR} · <date>：${markdownWords(commentWords)}`,
      `[^2]: 修改建议 · ${IMPORTED_MARKS_AUTHOR} · <date>：「${markdownWords(graphemesOf(excerpt[replacement.block - 1]).slice(replacement.from, replacement.to).join(''))}」改为「${markdownWords(insertWords)}」`,
    ];
    requireJourney(JSON.stringify(markdownParts.slice(excerpt.length).map(dated).map(digestOf)) === JSON.stringify(expectedNotes.map(digestOf)), 'markdown-notes-by-their-author',
      markdownParts.slice(excerpt.length).map((note) => /^\[\^\d\]: (\S+) · (\S+) · \d{4}-\d{2}-\d{2}：/u.exec(note)?.slice(1).map((part) => part === IMPORTED_MARKS_AUTHOR ? 'file-author' : part) ?? 'unrecognized'));
    requireJourney(!markdownText.includes(NOTE.body) && !markdownText.includes('备注 · '), 'markdown-writes-no-note');
    requireJourney(JSON.stringify((await readdir(exportsRoot)).sort()) === JSON.stringify([EXPORT_FILE, MARKDOWN_FILE, PDF_FILE].sort()), 'markdown-folder-holds-the-three-files');
    await waitFor(renderer, `window.__j07.block()?.querySelector('section.export-records-section')?.dataset.exportRecords === '3'`, 'markdown-three-records-listed', 30_000);

    at('documents-source-import');
    // Issue #415 (S66a): a 新闻稿's draft enters the Book as its source material — 导入稿件 → 作为来源材料导入 — which is
    // what a Production Document starts from until the writing task drafts one.
    await close();
    // This launch also answers the Save dialog, for the export of the version delivered below (S66b).
    renderer = await launch({ picker: draftPath, save: documentExportPath, folder: packageFolder });
    await importDraftAsSource(renderer, bookId);

    at('documents-cards');
    // 交付物 shows 交付 · 生产文档 apart from 发稿: one card per house type in the house's order, none made yet, each
    // offering 从来源材料创建… and 本书不做, and nothing that reads as progress.
    await clickSelector(renderer, '[data-screen="imported"] .book-deliverables-summary [data-deliverables-action="open"]', 'documents-open-deliverables');
    await waitForDeliverables(renderer, 'documents');
    await waitFor(renderer, `window.__j07.documents()?.querySelectorAll('li.production-document-card').length === ${DOCUMENT_TYPES.length}`, 'documents-block');
    await assertRenderer(renderer, `(() => {
      const block = window.__j07.documents();
      const cards = Array.from(block.querySelectorAll('li.production-document-card'));
      return block.querySelector(':scope > h3')?.textContent === '交付 · 生产文档' && block.dataset.documentSources === '1' &&
        JSON.stringify(cards.map((card) => card.dataset.documentTypeId + ':' + card.querySelector('h4')?.textContent + ':' + card.dataset.documentState)) === ${JSON.stringify(JSON.stringify(DOCUMENT_TYPES.map(([typeId, label]) => `${typeId}:${label}:none`)))} &&
        cards.every((card) => card.querySelector('.document-state-none')?.textContent === '尚未创建' &&
          window.__j07.cardAction(card.dataset.documentTypeId, 'create')?.disabled === false &&
          window.__j07.cardAction(card.dataset.documentTypeId, 'notForThisBook')?.disabled === false) &&
        !/%|百分/.test(block.textContent ?? '');
    })()`, 'documents-five-cards-none-made');

    at('document-create');
    // 从来源材料创建… offers the Book's source material, none preselected; 创建文档 waits for a choice, then the 新闻稿 opens
    // on the manuscript's own surface — named by its type and 版本 1, with the 工作流程 column beside it and nothing of the
    // manuscript's own: no 审阅, no 分析, no milestone, no 发稿.
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="news-release"] [data-document-action="create"]', 'document-create-open');
    await waitFor(renderer, `window.__j07.card('news-release')?.querySelector('form.document-create') !== null && document.activeElement === window.__j07.card('news-release').querySelector('input[name="document-source"]')`, 'document-create-form');
    await assertRenderer(renderer, `(() => { const form = window.__j07.card('news-release').querySelector('form.document-create'); const radios = Array.from(form.querySelectorAll('input[name="document-source"]')); return radios.length === 1 && !radios[0].checked && form.querySelector('legend')?.textContent === '选择来源材料' && (form.querySelector('label.choice-row span')?.textContent ?? '').startsWith(${JSON.stringify(`${DRAFT_FILE} · DOCX · 导入于 `)}) && window.__j07.cardAction('news-release', 'confirmCreate')?.disabled === true; })()`, 'document-create-nothing-preselected');
    await assertRenderer(renderer, `(() => { const radio = window.__j07.card('news-release').querySelector('input[name="document-source"]'); radio.click(); return radio.checked && window.__j07.cardAction('news-release', 'confirmCreate')?.disabled === false; })()`, 'document-create-choose');
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="news-release"] [data-document-action="confirmCreate"]', 'document-create-confirm');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-deliverable="production-document"][data-document-type-id="news-release"] [data-testid="manuscript-editor"] > [data-block-id]') !== null`, 'document-opened', 120_000);
    const surface = await renderer.evaluate(`(() => {
      const shell = document.querySelector('.editor-shell[data-deliverable="production-document"][data-document-type-id="news-release"]');
      const lens = shell?.querySelector('aside.document-lens');
      const work = Array.from(shell?.querySelectorAll('nav.book-work-group button[data-work-destination]') ?? []).map((item) => item.dataset.workDestination + ':' + item.textContent);
      const edge = Array.from(shell?.querySelectorAll('.edge-entries button') ?? []).map((item) => item.dataset.edgeEntry);
      const versions = Array.from(lens?.querySelectorAll('ol.document-version-list > li') ?? []).map((item) => item.dataset.versionOrdinal + ':' + (item.dataset.versionCurrent ?? ''));
      return {
        book: shell?.dataset.bookId === ${JSON.stringify(bookId)},
        label: shell?.querySelector('.editor-toolbar .section-label')?.textContent === ${JSON.stringify(`${EXCERPT.title} · 生产文档`)},
        heading: shell?.querySelector('.editor-toolbar h2')?.textContent === '新闻稿 · 版本 1',
        meta: Array.from(shell?.querySelectorAll('.editor-meta > span') ?? []).some((item) => item.textContent === '当前版本 版本 1'),
        lens: lens?.querySelector(':scope > .section-label')?.textContent === '工作流程',
        // Since S66c (Issue #415) the workflow opens the column: 下一项需要处理 and 阶段, then 版本与交付 and the materials.
        sections: JSON.stringify(Array.from(lens?.querySelectorAll('h3') ?? []).map((item) => item.textContent)) === '["下一项需要处理","阶段","版本与交付","这份文档的材料"]',
        versions: JSON.stringify(versions) === '["1:true"]',
        materials: lens?.querySelector('.document-materials .field-note')?.textContent === '暂无材料。任务简报、引语台账、事实核查记录与参考的范例会列在这里。',
        work: JSON.stringify(work) === '["deliverables:返回交付物"]',
        noAnalysis: shell?.querySelector('[data-records-destination="analysis"]') === null,
        edge: JSON.stringify(edge) === '["navigation"]',
        noMilestone: shell?.querySelector('details.milestone-section') === null,
        saveVersion: shell?.querySelector('[data-document-action="saveVersion"]')?.textContent === '保存为版本',
        // The surface's own words, not the document's or the Book's: the text in the editor is the draft's, and this
        // Book's title happens to hold 发稿.
        noManuscriptWords: (() => {
          const clone = shell?.cloneNode(true);
          for (const text of clone?.querySelectorAll('[data-testid="manuscript-editor"]') ?? []) text.remove();
          return !/里程碑|签发|发稿/.test((clone?.textContent ?? '').replaceAll(${JSON.stringify(EXCERPT.title)}, ''));
        })(),
      };
    })()`);
    requireJourney(surface !== null && typeof surface === 'object' && Object.values(surface).every((value) => value === true), 'document-surface-is-the-documents', surface);
    const documentTexts = await renderer.evaluate(`Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]'), (block) => block.textContent ?? '')`);
    const draftParagraphs = await admittedParagraphs(DRAFT);
    requireJourney(Array.isArray(documentTexts) && JSON.stringify(documentTexts.map(digestOf)) === JSON.stringify(draftParagraphs.map(digestOf)), 'document-reads-as-the-draft', { blocks: documentTexts?.length });

    at('document-edit-and-version');
    // An edit is written to the document's own journal; 保存为版本 makes it 版本 2, and the column lists both.
    await assertRenderer(renderer, `(() => { const block = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]'); if (!(block instanceof HTMLElement)) return false; block.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText', false, ${JSON.stringify(DOCUMENT_EDIT)}); return block.textContent?.endsWith(${JSON.stringify(DOCUMENT_EDIT)}); })()`, 'document-edit');
    await waitFor(renderer, `Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '保存当前编辑' && !button.disabled)`, 'document-edit-save-ready');
    await click(renderer, '保存当前编辑', 'document-edit-save');
    await waitFor(renderer, `window.__j07.status().includes('已写入修订日志')`, 'document-edit-durable');
    // Hold the new version's first animation frame until the next explicit command has taken focus. This reproduces
    // a slow frame on macOS: an arrival's pending editor restore must not steal focus back from the workflow row.
    await assertRenderer(renderer, `(() => {
      const request = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      const held = new Map(); let id = 0;
      window.requestAnimationFrame = (callback) => { const key = --id; held.set(key, callback); return key; };
      window.cancelAnimationFrame = (key) => { if (!held.delete(key)) cancel(key); };
      window.__j07.releaseVersionFrame = () => {
        window.requestAnimationFrame = request; window.cancelAnimationFrame = cancel;
        for (const callback of held.values()) callback(performance.now());
        held.clear(); delete window.__j07.releaseVersionFrame;
        return new Promise((resolve) => request(() => resolve(true)));
      };
      return true;
    })()`, 'document-version-hold-frame');
    await clickSelector(renderer, '.editor-shell[data-deliverable="production-document"] [data-document-action="saveVersion"]', 'document-save-version');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-deliverable="production-document"] .editor-toolbar h2')?.textContent === '新闻稿 · 版本 2' && window.__j07.status() === '已保存为版本 2'`, 'document-version-saved', 120_000);
    await assertRenderer(renderer, `(() => { const versions = Array.from(document.querySelectorAll('aside.document-lens ol.document-version-list > li')).map((item) => item.dataset.versionOrdinal + ':' + (item.dataset.versionCurrent ?? '')); return JSON.stringify(versions) === '["2:true","1:"]' && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.textContent?.endsWith(${JSON.stringify(DOCUMENT_EDIT)}); })()`, 'document-two-versions');

    at('document-workflow');
    // Issue #415 (S66c; WORK-002 to 009): the document follows the built-in profile's seven phases, none started, and
    // only the editor's commands move one. 开始 and 完成 起草; 跳过… 来源建设, which asks for a reason first; and
    // 重新打开… 起草 in the editor's own words. Each move is said, and the column paints what the service recorded.
    const phaseRow = (id) => `document.querySelector('aside.document-lens li.document-phase[data-phase-id="${id}"]')`;
    const phaseState = (id, state) => `${phaseRow(id)}?.dataset.phaseState === ${JSON.stringify(state)}`;
    await assertRenderer(renderer, `(() => { const section = document.querySelector('aside.document-lens section.document-workflow'); const rows = Array.from(section?.querySelectorAll('li.document-phase') ?? []); return (section?.querySelector('.document-workflow-profile')?.textContent ?? '').startsWith('基础书稿编辑流程 2.0.0 · 启用于 ') && section.querySelector('.document-workflow-summary')?.textContent === '七个阶段都未开始' && section.querySelector('.document-workflow-next-empty')?.textContent === '目前没有需要处理的事项' && JSON.stringify(rows.map((row) => row.dataset.phaseId + ':' + row.dataset.phaseState)) === JSON.stringify(['intake', 'source-development', 'drafting', 'review-verification', 'finalization', 'delivery', 'maintenance'].map((id) => id + ':not-started')) && rows.every((row) => JSON.stringify(Array.from(row.querySelectorAll('[data-phase-action]'), (button) => button.textContent)) === '["开始","跳过…"]'); })()`, 'document-workflow-fresh');
    at('document-workflow-start');
    await clickSelector(renderer, `aside.document-lens li.document-phase[data-phase-id="drafting"] [data-phase-action="start"]`, 'document-workflow-start');
    await waitFor(renderer, `${phaseState('drafting', 'in-progress')} && window.__j07.status() === '「起草」已开始' && document.activeElement === ${phaseRow('drafting')}`, 'document-workflow-before-version-frame');
    await assertRenderer(renderer, `window.__j07.releaseVersionFrame()`, 'document-version-release-frame');
    try {
      await waitFor(renderer, `${phaseState('drafting', 'in-progress')} && window.__j07.status() === '「起草」已开始' && document.activeElement === ${phaseRow('drafting')}`, 'document-workflow-started');
    } catch (error) {
      // Read extra diagnostic state only on failure: successful runs keep the original sequence of renderer calls.
      at(await renderer.evaluate(`${phaseState('drafting', 'in-progress')} && window.__j07.status() === '「起草」已开始'`) ? 'document-workflow-start-focus' : 'document-workflow-start');
      throw error;
    }
    at('document-workflow-complete');
    await clickSelector(renderer, `aside.document-lens li.document-phase[data-phase-id="drafting"] [data-phase-action="complete"]`, 'document-workflow-complete');
    await waitFor(renderer, `${phaseState('drafting', 'completed')} && window.__j07.status() === '「起草」已完成'`, 'document-workflow-completed');
    // 跳过… opens the phase's reason form with nothing chosen; confirming without a reason asks for one.
    at('document-workflow-skip-open');
    await clickSelector(renderer, `aside.document-lens li.document-phase[data-phase-id="source-development"] [data-phase-action="skip"]`, 'document-workflow-skip-open');
    at('document-workflow-skip-focus');
    await waitFor(renderer, `(() => { const form = ${phaseRow('source-development')}?.querySelector('form.document-phase-form[data-phase-form="skip"]'); return form !== null && form !== undefined && document.activeElement === form.querySelector('input[type="radio"]') && Array.from(form.querySelectorAll('input[type="radio"]')).every((radio) => !radio.checked) && form.querySelector('legend')?.textContent === '跳过的原因'; })()`, 'document-workflow-skip-form');
    at('document-workflow-skip-unreasoned');
    await clickSelector(renderer, `aside.document-lens li.document-phase[data-phase-id="source-development"] [data-phase-form-confirm]`, 'document-workflow-skip-unreasoned');
    await waitFor(renderer, `${phaseRow('source-development')}?.querySelector('.document-phase-form .field-error')?.textContent === '请先选一个原因。' && ${phaseState('source-development', 'not-started')}`, 'document-workflow-skip-asks');
    at('document-workflow-skip-reason');
    await assertRenderer(renderer, `(() => { const radio = ${phaseRow('source-development')}?.querySelector('input[type="radio"][value="done-elsewhere"]'); radio?.click(); return radio?.checked === true; })()`, 'document-workflow-skip-reason');
    at('document-workflow-skip-confirm');
    await clickSelector(renderer, `aside.document-lens li.document-phase[data-phase-id="source-development"] [data-phase-form-confirm]`, 'document-workflow-skip-confirm');
    await waitFor(renderer, `${phaseState('source-development', 'skipped')} && window.__j07.status() === '「来源建设」已跳过' && ${phaseRow('source-development')}?.querySelector('details.document-phase-reason summary')?.textContent === '查看原因' && (${phaseRow('source-development')}?.querySelector('details.document-phase-reason .document-phase-latest')?.textContent ?? '').endsWith(' · 这一阶段已在别处完成')`, 'document-workflow-skipped');
    // 重新打开… 起草 in the editor's own words.
    at('document-workflow-reopen-open');
    await clickSelector(renderer, `aside.document-lens li.document-phase[data-phase-id="drafting"] [data-phase-action="reopen"]`, 'document-workflow-reopen-open');
    await waitFor(renderer, `${phaseRow('drafting')}?.querySelector('form.document-phase-form[data-phase-form="reopen"] legend')?.textContent === '重新打开的原因'`, 'document-workflow-reopen-form');
    at('document-workflow-reopen-words');
    await assertRenderer(renderer, `(() => { const row = ${phaseRow('drafting')}; const radio = row?.querySelector('input[type="radio"][value="custom"]'); const words = row?.querySelector('textarea[data-phase-reason-text]'); if (!(radio instanceof HTMLInputElement) || !(words instanceof HTMLTextAreaElement)) return false; radio.click(); words.value = ${JSON.stringify(WORKFLOW_REOPEN_WORDS)}; words.dispatchEvent(new Event('input', { bubbles: true })); return radio.checked; })()`, 'document-workflow-reopen-words');
    at('document-workflow-reopen-confirm');
    await clickSelector(renderer, `aside.document-lens li.document-phase[data-phase-id="drafting"] [data-phase-form-confirm]`, 'document-workflow-reopen-confirm');
    await waitFor(renderer, `${phaseState('drafting', 'reopened')} && window.__j07.status() === '「起草」已重新打开' && (${phaseRow('drafting')}?.querySelector('details.document-phase-reason .document-phase-latest')?.textContent ?? '').endsWith(${JSON.stringify(` · ${WORKFLOW_REOPEN_WORDS}`)}) && ${phaseRow('drafting')}?.querySelector('.document-phase-moves')?.textContent === '共 3 次变动'`, 'document-workflow-reopened');
    at('document-workflow-summary');
    await assertRenderer(renderer, `(() => { const section = document.querySelector('aside.document-lens section.document-workflow'); return section?.dataset.workflowTransitions === '4' && section.querySelector('.document-workflow-summary')?.textContent === '1 个阶段进行中 · 0 项等待处理' && JSON.stringify(Array.from(section.querySelectorAll('ol.document-workflow-next > li'), (item) => item.textContent)) === '["起草 · 已重新打开"]'; })()`, 'document-workflow-summary');

    at('document-card-after-version');
    // 返回交付物: the 新闻稿's card names its latest version and the material it came from, and offers 打开.
    await clickSelector(renderer, '.editor-shell[data-deliverable="production-document"] nav.book-work-group [data-work-destination="deliverables"]', 'document-back');
    await waitForDeliverables(renderer, 'document-back');
    await waitFor(renderer, `window.__j07.card('news-release')?.dataset.documentState === 'document'`, 'document-card-ready');
    // Its workflow at a glance (WORK-005): the summary, the first 下一项 and a chip per phase in its state.
    await assertRenderer(renderer, `(() => { const workflow = window.__j07.card('news-release').querySelector('.document-workflow-card'); return workflow?.querySelector('.document-workflow-summary')?.textContent === '1 个阶段进行中 · 0 项等待处理' && workflow.querySelector('.document-workflow-next-line')?.textContent === '下一项需要处理：起草 · 已重新打开' && JSON.stringify(Array.from(workflow.querySelectorAll('li.phase-chip'), (chip) => chip.dataset.phaseId + ':' + chip.dataset.phaseState)) === JSON.stringify(['intake:not-started', 'source-development:skipped', 'drafting:reopened', 'review-verification:not-started', 'finalization:not-started', 'delivery:not-started', 'maintenance:not-started']); })()`, 'document-card-workflow');
    await assertRenderer(renderer, `(() => { const card = window.__j07.card('news-release'); return card.dataset.documentVersion === '2' && card.dataset.documentChanged === 'false' && card.querySelector('.document-card-line')?.textContent === ${JSON.stringify(`版本 2 · 由「${DRAFT_FILE}」创建`)} && window.__j07.cardAction('news-release', 'open')?.textContent === '打开' && window.__j07.cardAction('news-release', 'create') === null; })()`, 'document-card-names-the-version');

    at('document-not-for-this-book');
    // 本书不做 is one record, and 恢复 another; focus stays with the card's own next action.
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="promotion-article"] [data-document-action="notForThisBook"]', 'document-not-for-this-book');
    await waitFor(renderer, `window.__j07.card('promotion-article')?.dataset.documentState === 'not-for-this-book' && document.activeElement === window.__j07.cardAction('promotion-article', 'restore') && window.__j07.status() === '已标为本书不做'`, 'document-not-for-this-book-recorded');
    await assertRenderer(renderer, `window.__j07.card('promotion-article').querySelector('.document-not-for-this-book')?.textContent === '本书不做' && window.__j07.cardAction('promotion-article', 'create') === null`, 'document-not-for-this-book-card');
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="promotion-article"] [data-document-action="restore"]', 'document-restore');
    await waitFor(renderer, `window.__j07.card('promotion-article')?.dataset.documentState === 'none' && document.activeElement === window.__j07.cardAction('promotion-article', 'notForThisBook') && window.__j07.status() === '已恢复'`, 'document-restored');
    const documentsRead = await renderer.evaluate(`window.ai7.inspectProductionDocuments().then((documents) => documents.types.map((type) => [type.typeId, type.notForThisBook, type.document === null ? null : type.document.versions.map((version) => version.label)]))`);
    requireJourney(JSON.stringify(documentsRead) === JSON.stringify(DOCUMENT_TYPES.map(([typeId]) => [typeId, false, typeId === 'news-release' ? ['版本 2', '版本 1'] : null])), 'documents-service-agrees', documentsRead);

    at('document-deliver');
    // 交付… (DELIV-003): the 新闻稿's card says 尚未交付; the form offers its two saved versions and the house's recipients,
    // none preselected, beside the sentence that a delivery records and never sends, and 交付 waits for both choices.
    // 交付 records 第 1 次交付 and opens the export card on the delivered version by itself.
    await assertRenderer(renderer, `(() => {
      const card = window.__j07.card('news-release');
      const deliver = window.__j07.cardAction('news-release', 'deliver');
      return card.dataset.documentDeliveries === '0' && card.dataset.documentChangedSinceDelivery === 'false' &&
        card.querySelector('.document-delivery-line')?.textContent === '尚未交付' && deliver?.textContent === '交付…' &&
        deliver.getAttribute('aria-expanded') === 'false' && window.__j07.deliveries('news-release').length === 0;
    })()`, 'deliver-card-not-delivered');
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="news-release"] [data-document-action="deliver"]', 'deliver-open');
    await waitFor(renderer, `window.__j07.delivery('news-release') !== null && document.activeElement === window.__j07.delivery('news-release').querySelector('input[name="delivery-version"]')`, 'deliver-form');
    await assertRenderer(renderer, `(() => {
      const form = window.__j07.delivery('news-release');
      const versions = Array.from(form.querySelectorAll('input[name="delivery-version"]'));
      const recipients = Array.from(form.querySelectorAll('input[name="delivery-recipient"]'));
      const confirm = window.__j07.cardAction('news-release', 'confirmDeliver');
      return JSON.stringify(Array.from(form.querySelectorAll('legend'), (item) => item.textContent)) === '["交付哪一版","交给谁"]' &&
        JSON.stringify(versions.map((item) => item.checked + ':' + (item.closest('label')?.querySelector('span')?.textContent ?? '').split(' · ')[0])) === '["false:版本 2","false:版本 1"]' &&
        JSON.stringify(recipients.map((item) => item.value + ':' + item.checked + ':' + item.closest('label')?.querySelector('span')?.textContent)) === ${JSON.stringify(DELIVERY_RECIPIENTS)} &&
        form.querySelector('[data-delivery-field="custom"]')?.disabled === true && form.querySelector('.delivery-unsaved') === null &&
        form.querySelector('.delivery-statement')?.textContent === ${JSON.stringify(DELIVERY_STATEMENT)} &&
        confirm?.textContent === '交付' && confirm.disabled === true && window.__j07.deliveryReason('news-release') === '先选择要交付的版本';
    })()`, 'deliver-nothing-preselected');
    await assertRenderer(renderer, `(() => { const version = window.__j07.delivery('news-release').querySelector('input[name="delivery-version"]'); version.click(); return version.checked && window.__j07.cardAction('news-release', 'confirmDeliver').disabled === true && window.__j07.deliveryReason('news-release') === '先选择交给谁'; })()`, 'deliver-choose-version');
    await assertRenderer(renderer, `(() => {
      const form = window.__j07.delivery('news-release');
      const recipient = form.querySelector('input[name="delivery-recipient"][value="publicity"]');
      recipient.click();
      const note = form.querySelector('[data-delivery-field="note"]');
      note.value = ${JSON.stringify(DELIVERY_NOTE)};
      note.dispatchEvent(new Event('input', { bubbles: true }));
      return recipient.checked && window.__j07.cardAction('news-release', 'confirmDeliver').disabled === false;
    })()`, 'deliver-choose-recipient');
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="news-release"] [data-document-action="confirmDeliver"]', 'deliver-confirm');
    await waitFor(renderer, `window.__j07.deliveries('news-release').length === 1 && window.__j07.exportCard()?.dataset.exportTarget === 'document'`, 'deliver-recorded', 60_000);
    await assertRenderer(renderer, `(() => {
      const card = window.__j07.card('news-release');
      const [record] = window.__j07.deliveries('news-release');
      return card.dataset.documentDeliveries === '1' && card.dataset.documentChangedSinceDelivery === 'false' && window.__j07.delivery('news-release') === null &&
        (card.querySelector('.document-delivery-line')?.textContent ?? '').startsWith('第 1 次交付 · 宣传部 · 版本 2 · ') &&
        record.dataset.deliveryOrdinal === '1' && record.querySelector('.document-delivery-note')?.textContent === ${JSON.stringify(DELIVERY_NOTE)} &&
        window.__j07.cardAction('news-release', 'redeliver')?.textContent === '再交付…' && window.__j07.cardAction('news-release', 'deliver') === null;
    })()`, 'deliver-record-shown');
    const deliveredDocument = await renderer.evaluate(`window.ai7.inspectProductionDocuments().then((documents) => { const news = documents.types[0].document; return { documentId: news.documentId, revisionId: news.versions[0].revisionId, deliveries: news.deliveries.map((delivery) => ({ ordinal: delivery.ordinal, revisionId: delivery.revisionId, versionLabel: delivery.versionLabel, recipient: delivery.recipient, note: delivery.note })) }; })`);
    requireJourney(UUID_PATTERN.test(deliveredDocument?.documentId ?? '') && JSON.stringify(deliveredDocument.deliveries) === JSON.stringify([
      { ordinal: 1, revisionId: deliveredDocument.revisionId, versionLabel: '版本 2', recipient: { kind: 'publicity', label: '宣传部' }, note: DELIVERY_NOTE },
    ]), 'deliver-service-agrees', deliveredDocument?.deliveries);

    at('document-delivery-export');
    // The export card is the delivered version's — 新闻稿 · 版本 2, DOCX chosen — and exports it under this launch's
    // Save-dialog answer; the Delivery Record then names the file, and the file reads as that version of the 新闻稿.
    await waitFor(renderer, `(() => { const card = window.__j07.exportCard(); return card?.dataset.exportPhase === 'ready' && card.querySelector('input[name="export-format"]:checked')?.value === 'docx'; })()`, 'delivery-export-reviewed', 120_000);
    await assertRenderer(renderer, `(() => {
      const card = window.__j07.exportCard();
      return card.dataset.exportTarget === 'document' && card.dataset.documentId === ${JSON.stringify(deliveredDocument.documentId)} &&
        card.dataset.revisionId === ${JSON.stringify(deliveredDocument.revisionId)} && card.querySelector('h4')?.textContent === '导出 · 新闻稿 · 版本 2' &&
        card.querySelector('.export-saved-line') === null && card.querySelector('.export-local-line')?.textContent === ${JSON.stringify(EXPORT_LOCAL_LINE)};
    })()`, 'delivery-export-names-the-version');
    await exportAct(renderer, 'choose', 'delivery-export-choose');
    await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'prepared' && window.__j07.status() === '已准备好导出文件，等待你确认。'`, 'delivery-export-prepared', 120_000);
    await assertRenderer(renderer, `window.__j07.exportCard().querySelector('.export-destination-line')?.textContent === ${JSON.stringify(`${documentExportPath}（新建文件）`)} && window.__j07.exportAction('approve')?.disabled === false`, 'delivery-export-destination-bound');
    requireJourney(!existsSync(documentExportPath), 'delivery-export-nothing-written-before-approval');
    await exportAct(renderer, 'approve', 'delivery-export-approve');
    await waitFor(renderer, `window.__j07.exportCard()?.dataset.exportPhase === 'done' && window.__j07.status() === ${JSON.stringify(EXPORTED_LABEL)} && window.__j07.tone() === 'success'`, 'delivery-export-written', 120_000);
    await waitFor(renderer, `window.__j07.deliveries('news-release')[0]?.dataset.deliveryExport === 'created'`, 'delivery-export-on-the-record', 30_000);
    await assertRenderer(renderer, `window.__j07.deliveries('news-release')[0].querySelector('.document-delivery-export')?.textContent === ${JSON.stringify(`${EXPORTED_LABEL} · ${DOCUMENT_EXPORT_FILE}`)}`, 'delivery-export-line');
    const deliveryExport = await renderer.evaluate(`window.ai7.inspectProductionDocuments().then((documents) => documents.types[0].document.deliveries[0].export)`);
    requireJourney(deliveryExport?.outcome === 'created' && deliveryExport.fileName === DOCUMENT_EXPORT_FILE && UUID_PATTERN.test(deliveryExport.preparationId ?? ''), 'delivery-export-service-agrees', deliveryExport);
    const documentFile = await readExportedDocx(documentExportPath);
    const deliveredParagraphs = draftParagraphs.map((text, index) => digestOf(index === 0 ? `${text}${DOCUMENT_EDIT}` : text));
    requireJourney(JSON.stringify(documentFile.paragraphs.map((paragraph) => paragraph.digest)) === JSON.stringify(deliveredParagraphs), 'delivery-export-is-the-version',
      { paragraphs: documentFile.paragraphs.length, differing: documentFile.paragraphs.map((paragraph, index) => paragraph.digest === deliveredParagraphs[index] ? 0 : index + 1).filter(Boolean) });
    // 完成 closes the card, and focus finds the Delivery Record's own 导出….
    await exportAct(renderer, 'close', 'delivery-export-close');
    await waitFor(renderer, `window.__j07.exportCard() === null && document.activeElement === window.__j07.deliveries('news-release')[0]?.querySelector('[data-export-action="open"]')`, 'delivery-export-closed-focus-returns', 10_000);

    at('document-changed-since-delivery');
    // The document's 工作流程 column lists the delivery beside its versions. An edit after it: the card reads
    // 交付后有修改 (DELIV-004) beside 有修改尚未保存为版本.
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="news-release"] [data-document-action="open"]', 'changed-open');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-deliverable="production-document"] .editor-toolbar h2')?.textContent === '新闻稿 · 版本 2' && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]') !== null`, 'changed-document', 120_000);
    await assertRenderer(renderer, `(() => {
      const lens = document.querySelector('aside.document-lens');
      const records = Array.from(lens?.querySelectorAll('ol.document-lens-deliveries > li') ?? []);
      return lens?.querySelector('section.document-versions h4')?.textContent === '交付记录' && records.length === 1 &&
        (records[0].querySelector('.document-delivery-record')?.textContent ?? '').startsWith('第 1 次交付 · 宣传部 · 版本 2 · ') &&
        records[0].querySelector('.document-delivery-export')?.textContent === ${JSON.stringify(`${EXPORTED_LABEL} · ${DOCUMENT_EXPORT_FILE}`)} &&
        lens.querySelector('.document-changed-since-delivery') === null;
    })()`, 'changed-lens-lists-the-delivery');
    // 交付 started now reads 进行中: the document stands on the version it delivered.
    await clickSelector(renderer, 'aside.document-lens li.document-phase[data-phase-id="delivery"] [data-phase-action="start"]', 'changed-delivery-start');
    await waitFor(renderer, `(() => { const row = document.querySelector('aside.document-lens li.document-phase[data-phase-id="delivery"]'); return row?.dataset.phaseState === 'in-progress' && row.dataset.phaseWaiting === 'false' && row.querySelector('.phase-pill')?.textContent === '进行中' && window.__j07.status() === '「交付」已开始'; })()`, 'changed-delivery-started');
    await assertRenderer(renderer, `(() => { const block = document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]'); if (!(block instanceof HTMLElement)) return false; block.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('insertText', false, ${JSON.stringify(DELIVERY_EDIT)}); return block.textContent?.endsWith(${JSON.stringify(`${DOCUMENT_EDIT}${DELIVERY_EDIT}`)}); })()`, 'changed-edit');
    await waitFor(renderer, `Array.from(document.querySelectorAll('button')).some((button) => button.textContent === '保存当前编辑' && !button.disabled)`, 'changed-edit-save-ready');
    await click(renderer, '保存当前编辑', 'changed-edit-save');
    await waitFor(renderer, `window.__j07.status().includes('已写入修订日志')`, 'changed-edit-durable');
    // The document window follows the edit it wrote (Issue #543): the lens drops 当前 from 版本 2 and says both moves.
    await waitFor(renderer, `(() => {
      const lens = document.querySelector('aside.document-lens');
      return lens?.querySelector('.document-changed-since-delivery')?.textContent === '交付后有修改' &&
        lens.querySelector('[data-version-current]') === null && lens.querySelector('.document-changed')?.textContent === '有修改尚未保存为版本';
    })()`, 'changed-edit-lens-repaints');
    // And the workflow reads what 交付 now waits on, with no phase moved (WORK-005): the lens reads the document again once
    // the edit rests, and 下一项需要处理 leads with it.
    await waitFor(renderer, `(() => {
      const section = document.querySelector('aside.document-lens section.document-workflow');
      const row = section?.querySelector('li.document-phase[data-phase-id="delivery"]');
      return section?.dataset.workflowTransitions === '5' && row?.dataset.phaseWaiting === 'true' && row.querySelector('.phase-pill')?.textContent === '等待你处理' &&
        row.querySelector('.document-phase-waiting')?.textContent === '有修改尚未保存为版本' &&
        section.querySelector('.document-workflow-summary')?.textContent === '2 个阶段进行中 · 1 项等待处理' &&
        JSON.stringify(Array.from(section.querySelectorAll('ol.document-workflow-next > li'), (item) => item.textContent)) === '["交付 · 有修改尚未保存为版本","起草 · 已重新打开"]';
    })()`, 'changed-edit-workflow-repaints');
    await clickSelector(renderer, '.editor-shell[data-deliverable="production-document"] nav.book-work-group [data-work-destination="deliverables"]', 'changed-back');
    await waitForDeliverables(renderer, 'changed-back');
    await waitFor(renderer, `window.__j07.card('news-release')?.dataset.documentChangedSinceDelivery === 'true'`, 'changed-card');
    await assertRenderer(renderer, `(() => {
      const card = window.__j07.card('news-release');
      return card.querySelector('.document-changed-since-delivery')?.textContent === '交付后有修改' && card.dataset.documentChanged === 'true' &&
        card.querySelector('.document-changed')?.textContent === '有修改尚未保存为版本' && card.dataset.documentDeliveries === '1' &&
        window.__j07.cardAction('news-release', 'redeliver')?.textContent === '再交付…';
    })()`, 'changed-card-says-so');

    at('document-redeliver');
    // 再交付… of the current text in the editor's own words (DELIV-003, DELIV-004): the form offers the text as it stands —
    // saved as 版本 3 when delivered — before the saved versions, none preselected, and 自行输入 needs its words. The
    // second record is 版本 3's, newest first, and 交付后有修改 is gone; its export, cancelled, leaves it at 暂无导出记录
    // and writes nothing.
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="news-release"] [data-document-action="redeliver"]', 'redeliver-open');
    await waitFor(renderer, `window.__j07.delivery('news-release') !== null && document.activeElement === window.__j07.delivery('news-release').querySelector('input[name="delivery-version"]')`, 'redeliver-form');
    await assertRenderer(renderer, `(() => {
      const form = window.__j07.delivery('news-release');
      const versions = Array.from(form.querySelectorAll('input[name="delivery-version"]'));
      return form.querySelector('.delivery-unsaved')?.textContent === ${JSON.stringify(DELIVERY_UNSAVED)} &&
        JSON.stringify(versions.map((item) => item.value === 'current' ? item.closest('label')?.querySelector('span')?.textContent : (item.closest('label')?.querySelector('span')?.textContent ?? '').split(' · ')[0])) === ${JSON.stringify(JSON.stringify([DELIVERY_CURRENT_TEXT, '版本 2', '版本 1']))} &&
        Array.from(form.querySelectorAll('input[name="delivery-version"], input[name="delivery-recipient"]')).every((item) => !item.checked);
    })()`, 'redeliver-current-text-offered');
    await assertRenderer(renderer, `(() => {
      const form = window.__j07.delivery('news-release');
      form.querySelector('input[name="delivery-version"]').click();
      form.querySelector('input[name="delivery-recipient"][value="custom"]').click();
      const custom = form.querySelector('[data-delivery-field="custom"]');
      return custom.disabled === false && document.activeElement === custom && window.__j07.cardAction('news-release', 'confirmDeliver').disabled === true &&
        window.__j07.deliveryReason('news-release') === '请写明交给谁';
    })()`, 'redeliver-custom-needs-words');
    await assertRenderer(renderer, `(() => { const custom = window.__j07.delivery('news-release').querySelector('[data-delivery-field="custom"]'); custom.value = ${JSON.stringify(DELIVERY_CUSTOM)}; custom.dispatchEvent(new Event('input', { bubbles: true })); return window.__j07.cardAction('news-release', 'confirmDeliver').disabled === false; })()`, 'redeliver-custom-written');
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="news-release"] [data-document-action="confirmDeliver"]', 'redeliver-confirm');
    await waitFor(renderer, `window.__j07.deliveries('news-release').length === 2 && window.__j07.exportCard()?.dataset.exportPhase === 'ready'`, 'redelivered', 120_000);
    await assertRenderer(renderer, `window.__j07.exportCard().querySelector('h4')?.textContent === '导出 · 新闻稿 · 版本 3'`, 'redeliver-export-is-version-3');
    await exportAct(renderer, 'cancel', 'redeliver-export-cancel');
    await waitFor(renderer, `window.__j07.exportCard() === null && document.activeElement === window.__j07.deliveries('news-release')[0]?.querySelector('[data-export-action="open"]')`, 'redeliver-export-cancelled', 10_000);
    await assertRenderer(renderer, `(() => {
      const card = window.__j07.card('news-release');
      const records = window.__j07.deliveries('news-release');
      return card.dataset.documentDeliveries === '2' && card.dataset.documentChangedSinceDelivery === 'false' &&
        card.dataset.documentVersion === '3' && card.dataset.documentChanged === 'false' && card.querySelector('.document-changed-since-delivery') === null &&
        card.querySelector('.document-card-line')?.textContent === ${JSON.stringify(`版本 3 · 由「${DRAFT_FILE}」创建`)} &&
        (card.querySelector('.document-delivery-line')?.textContent ?? '').startsWith(${JSON.stringify(`第 2 次交付 · ${DELIVERY_CUSTOM} · 版本 3 · `)}) &&
        JSON.stringify(records.map((record) => record.dataset.deliveryOrdinal + ':' + record.dataset.deliveryExport)) === '["2:none","1:created"]' &&
        records[0].querySelector('.document-delivery-export')?.textContent === '暂无导出记录' && records[0].querySelector('.document-delivery-note') === null;
    })()`, 'redeliver-records-newest-first');
    requireJourney(JSON.stringify((await readdir(exportsRoot)).sort()) === JSON.stringify([EXPORT_FILE, MARKDOWN_FILE, PDF_FILE, DOCUMENT_EXPORT_FILE].sort()), 'redeliver-nothing-written');
    const redelivered = await renderer.evaluate(`window.ai7.inspectProductionDocuments().then((documents) => { const news = documents.types[0].document; return { changedSinceDelivery: news.changedSinceDelivery, versions: news.versions.map((version) => version.label), deliveries: news.deliveries.map((delivery) => [delivery.ordinal, delivery.versionLabel, delivery.recipient.kind, delivery.recipient.label, delivery.note, delivery.export === null ? null : delivery.export.outcome]) }; })`);
    requireJourney(JSON.stringify(redelivered) === JSON.stringify({
      changedSinceDelivery: false, versions: ['版本 3', '版本 2', '版本 1'],
      deliveries: [[2, '版本 3', 'custom', DELIVERY_CUSTOM, null, null], [1, '版本 2', 'publicity', '宣传部', DELIVERY_NOTE, 'created']],
    }), 'redeliver-service-agrees', redelivered);

    at('package-conditions');
    // 图书交付包 (Issue #416, S67a; BUNDLE-001 to 005): the last block of 交付物 says what a package is and is not and
    // lists its conditions — the 发稿版本 set, with 自发稿版本后有修改 beside it; the 新闻稿 delivered; the four other
    // types neither made nor 本书不做; no review to finish — and 准备图书交付包 waits, naming the four. A row's route
    // takes the editor to where it is met: here, the type's own card.
    await waitFor(renderer, `window.__j07.pkg()?.dataset.packageReady === 'false' && window.__j07.condition('document:news-release')?.dataset.conditionMet === 'true'`, 'package-read');
    await assertRenderer(renderer, `(() => {
      const bundle = window.__j07.pkg();
      const rows = Array.from(bundle.querySelectorAll('ol.package-condition-list > li'))
        .map((row) => row.dataset.conditionId + ':' + row.dataset.conditionMet + ':' + (row.querySelector('.package-condition-detail')?.textContent ?? ''));
      const prepare = bundle.querySelector('[data-package-action="prepare"]');
      return bundle.querySelector('.package-statement')?.textContent === ${JSON.stringify(PACKAGE_STATEMENT)} &&
        JSON.stringify(rows) === ${JSON.stringify(JSON.stringify([
          `publication:true:发稿版本「${FIRST.label}」 · r1`,
          'document:news-release:true:第 2 次交付 · 版本 3',
          ...OTHER_TYPES.map((typeId) => `document:${typeId}:false:尚未创建`),
          'work-records:true:暂无审阅记录',
        ]))} &&
        window.__j07.condition('publication').querySelector('.package-condition-notice')?.textContent === '自发稿版本后有修改：可以另设发稿版本，也可以按当前发稿版本打包。' &&
        window.__j07.condition('document:news-release').querySelector('[data-package-route]') === null &&
        prepare instanceof HTMLButtonElement && prepare.disabled && window.__j07.packageReason() === '还不能准备：宣传文章、评论文章、发布会材料、营销要点未满足。' &&
        !/%|百分/.test(bundle.textContent ?? '');
    })()`, 'package-conditions-name-what-is-missing');
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-condition-id="document:promotion-article"] [data-package-route="document"]', 'package-route-document');
    await waitFor(renderer, `document.activeElement === window.__j07.cardAction('promotion-article', 'create')`, 'package-route-focuses-the-card');

    at('package-not-for-this-book');
    // The four other types 本书不做 on their own cards: every condition holds, 准备 waits only for a purpose, and the
    // preview lists the 发稿版本 and the 新闻稿 at its delivered 版本 3 as included, the four types and the fixed
    // exclusions as left out, and what the package cannot say.
    for (const typeId of OTHER_TYPES) {
      await clickSelector(renderer, `[data-screen="book-deliverables"] li[data-document-type-id="${typeId}"] [data-document-action="notForThisBook"]`, `package-not-for-this-book-${typeId}`);
      await waitFor(renderer, `window.__j07.card(${JSON.stringify(typeId)})?.dataset.documentState === 'not-for-this-book' && window.__j07.condition(${JSON.stringify(`document:${typeId}`)})?.dataset.conditionMet === 'true'`, `package-condition-${typeId}`);
    }
    await waitFor(renderer, `window.__j07.pkg()?.dataset.packageReady === 'true'`, 'package-ready');
    await assertRenderer(renderer, `(() => {
      const bundle = window.__j07.pkg();
      const lines = (selector) => Array.from(bundle.querySelectorAll(selector)).map((item) => item.dataset.itemKind + ':' + item.querySelector('.package-item-label')?.textContent);
      const limitations = Array.from(bundle.querySelectorAll('ul.package-limitations > li')).map((item) => item.textContent);
      return JSON.stringify(lines('ul.package-included > li')) === ${JSON.stringify(JSON.stringify([`publication:发稿版本「${FIRST.label}」 · r1`, 'document:新闻稿 · 版本 3']))} &&
        JSON.stringify(lines('ul.package-excluded > li')) === ${JSON.stringify(JSON.stringify([
          ...['宣传文章', '评论文章', '发布会材料', '营销要点'].map((label) => `not-for-this-book:${label}`), 'exclusion:备注', 'exclusion:资料库原件', 'exclusion:中间修订版',
        ]))} &&
        JSON.stringify(limitations) === ${JSON.stringify(JSON.stringify(['稿件：自发稿版本后有修改，本包按发稿版本。', '评估记录与定稿的审稿意见：AI7 尚未提供这两类记录，本包不含。']))} &&
        bundle.querySelector('[data-package-action="prepare"]').disabled && window.__j07.packageReason() === '先写明交付包用途。';
    })()`, 'package-preview-lists-what-it-holds');

    at('package-prepare');
    // 准备图书交付包 with a purpose freezes v1 — 图书交付包已准备 · 暂无导出记录 — and writes no file anywhere; the same
    // content with the same purpose is v1, unchanged.
    await assertRenderer(renderer, `(() => { const input = window.__j07.pkg().querySelector('[data-package-field="purpose"]'); input.value = ${JSON.stringify(PACKAGE_PURPOSE)}; input.dispatchEvent(new Event('input', { bubbles: true })); return window.__j07.pkg().querySelector('[data-package-action="prepare"]').disabled === false && window.__j07.packageReason() === ''; })()`, 'package-purpose-written');
    const exportsBefore = JSON.stringify((await readdir(exportsRoot)).sort());
    await clickSelector(renderer, '[data-screen="book-deliverables"] section.deliverables-package [data-package-action="prepare"]', 'package-prepare');
    await waitFor(renderer, `window.__j07.packageVersions().length === 1 && window.__j07.status() === '已准备图书交付包 v1'`, 'package-v1', 60_000);
    await assertRenderer(renderer, `(() => {
      const [v1] = window.__j07.packageVersions();
      const line = v1.querySelector('.package-version-line');
      return v1.dataset.packageCurrent === 'true' && (line?.textContent ?? '').startsWith('v1 · 图书交付包已准备 · 暂无导出记录') &&
        line.querySelector('.package-current-mark')?.textContent === '当前' && document.activeElement === line &&
        (v1.querySelector('.package-version-meta')?.textContent ?? '').startsWith(${JSON.stringify(`用途：${PACKAGE_PURPOSE} · `)}) &&
        v1.querySelector('.package-version-summary')?.textContent === ${JSON.stringify(`发稿版本「${FIRST.label}」 · r1 · 生产文档 1 份 · 本书不做 4 类 · 审阅报告 0 份`)} &&
        window.__j07.pkg().dataset.packageChanged === 'false';
    })()`, 'package-v1-listed');
    requireJourney(JSON.stringify((await readdir(exportsRoot)).sort()) === exportsBefore, 'package-writes-no-file');
    const preparedPackage = await renderer.evaluate(`window.ai7.inspectBookDeliveryPackage().then((bundle) => ({ ready: bundle.ready, changed: bundle.changedSinceLatest, versions: bundle.versions.map((version) => [version.label, version.purpose, version.current, version.exportHistoryLabel]) }))`);
    requireJourney(JSON.stringify(preparedPackage) === JSON.stringify({ ready: true, changed: false, versions: [['v1', PACKAGE_PURPOSE, true, '暂无导出记录']] }), 'package-service-agrees', preparedPackage);
    await clickSelector(renderer, '[data-screen="book-deliverables"] section.deliverables-package [data-package-action="prepare"]', 'package-prepare-again');
    await waitFor(renderer, `window.__j07.status() === '内容和用途都没有变化，仍是图书交付包 v1' && window.__j07.packageVersions().length === 1`, 'package-unchanged', 60_000);

    at('package-v2');
    // A new purpose is a new version: v2 stands above v1 and names it, and v1 is kept exactly as it was.
    const v1Before = await renderer.evaluate(`window.ai7.inspectBookDeliveryPackage().then((bundle) => JSON.stringify({ ...bundle.versions[0], current: false }))`);
    await assertRenderer(renderer, `(() => { const input = window.__j07.pkg().querySelector('[data-package-field="purpose"]'); input.value = ${JSON.stringify(PACKAGE_PURPOSE_2)}; input.dispatchEvent(new Event('input', { bubbles: true })); return window.__j07.pkg().querySelector('[data-package-action="prepare"]').disabled === false; })()`, 'package-new-purpose');
    await clickSelector(renderer, '[data-screen="book-deliverables"] section.deliverables-package [data-package-action="prepare"]', 'package-prepare-v2');
    await waitFor(renderer, `window.__j07.packageVersions().length === 2 && window.__j07.status() === '已准备图书交付包 v2'`, 'package-v2', 60_000);
    const secondPackage = await renderer.evaluate(`window.ai7.inspectBookDeliveryPackage().then((bundle) => ({ labels: bundle.versions.map((version) => version.label + ':' + version.current + ':' + version.purpose), v1: JSON.stringify(bundle.versions[1]), prior: bundle.versions[0].technical.priorVersionId === bundle.versions[1].packageVersionId, stable: bundle.versions[0].packageId === bundle.versions[1].packageId }))`);
    requireJourney(JSON.stringify(secondPackage?.labels) === JSON.stringify([`v2:true:${PACKAGE_PURPOSE_2}`, `v1:false:${PACKAGE_PURPOSE}`]) &&
      secondPackage.v1 === v1Before && secondPackage.prior === true && secondPackage.stable === true, 'package-v2-names-v1', secondPackage?.labels);
    await assertRenderer(renderer, `JSON.stringify(window.__j07.packageVersions().map((item) => item.dataset.packageVersion + ':' + item.dataset.packageCurrent)) === '["2:true","1:false"]'`, 'package-v2-above-v1');

    at('package-export');
    // 导出… of v2 (Issue #416, S67b; BUNDLE-004, EXP-010 to EXP-022) lists the files it writes and binds nothing until a
    // folder is chosen; 选择位置… answers the folder dialog with the run's own empty folder and prepares every file there,
    // writing none; 按上述方式导出 writes them one by one, each with its receipt. The folder then holds exactly the three
    // files — the 发稿版本's revision and the 新闻稿's delivered 版本 3 as DOCX, and the 交付包清单 in the package's own
    // words — v2's history says so, and 交付物's export records and the package itself stay as they were.
    const packageFiles = [
      ['publication', 'docx', `稿件 · 发稿版本「${FIRST.label}」 · r1`, `001 ${EXCERPT.title} · ${FIRST.label}.docx`],
      ['document:news-release', 'docx', '新闻稿 · 版本 3', `002 ${EXCERPT.title} · 新闻稿 · 版本 3.docx`],
      ['manifest', 'markdown', '交付包清单', PACKAGE_MANIFEST_FILE],
    ];
    const firstMembers = packageFiles.filter(([key]) => key !== 'document:news-release');
    const packageFileLines = (outcome, words, members = packageFiles) => members.map(([key, format, label, fileName]) =>
      [key, format, label, `「${fileName}」 · ${format === 'docx' ? 'DOCX' : 'Markdown'}`, outcome, words].join('|'));
    const recordsBefore = await renderer.evaluate(`window.ai7.inspectDeliverables().then((answer) => JSON.stringify(answer.exports))`);
    const packageAction = (action) => `[data-screen="book-deliverables"] ol.package-version-list > li[data-package-current="true"] [data-package-action="${action}"]`;
    await clickSelector(renderer, packageAction('export'), 'package-export-open');
    await waitFor(renderer, `window.__j07.packageExport()?.dataset.packageExportPhase === 'ready' && window.__j07.status() === '要导出的文件已列出'`, 'package-export-reviewed', 60_000);
    await assertRenderer(renderer, `(() => {
      const panel = window.__j07.packageExport();
      const approve = panel.querySelector('[data-package-action="export-approve"]');
      const reason = document.getElementById(approve?.getAttribute('aria-describedby') ?? '');
      return panel.closest('li')?.dataset.packageVersion === '2' && panel.querySelector('h5')?.textContent === '导出 · 图书交付包 v2' &&
        panel.querySelector('.export-local-line')?.textContent === ${JSON.stringify(PACKAGE_EXPORT_STATEMENT)} &&
        JSON.stringify(window.__j07.packageExportFiles()) === ${JSON.stringify(JSON.stringify(packageFileLines('', '')))} &&
        approve instanceof HTMLButtonElement && approve.disabled && reason?.textContent === '先选择位置。' &&
        panel.querySelector('.package-export-folder-line')?.textContent === ${JSON.stringify(PACKAGE_EXPORT_FOLDER_UNCHOSEN)} &&
        document.activeElement === panel.querySelector('h5') && panel.querySelector('[data-package-action="export-choose"]')?.disabled === true &&
        Array.from(panel.querySelectorAll('input[data-package-member]')).every((box) => !box.checked) && !/%|百分/.test(panel.textContent ?? '');
    })()`, 'package-export-lists-the-files');
    // 含批注 and 含修改建议（作为修订） are offered on (EXP-023), and each file carries its own Export Fidelity Review
    // (EXP-007), open by itself when something in it is not written as it was: the classes the service's own review of the
    // version shows, and its restoration line.
    const packageVersionId = await renderer.evaluate(`window.__j07.packageVersions()[0].dataset.packageVersionId`);
    const packageReview = await renderer.evaluate(`window.ai7.reviewBookDeliveryPackageExport({ packageVersionId: ${JSON.stringify(packageVersionId)}, options: { includeAnnotations: true, includeSuggestions: true } })
      .then((review) => ({ degraded: review.degraded, files: review.files.map((file) => [file.key, file.degraded, file.fidelity.filter((row) => row.count > 0 || row.status !== 'preserved').length, file.restorationLine, true]) }))`);
    requireJourney(Array.isArray(packageReview?.files) && packageReview.files.length === packageFiles.length, 'package-export-service-review', packageReview?.files?.length);
    await assertRenderer(renderer, `(() => {
      const panel = window.__j07.packageExport();
      const boxes = Array.from(panel.querySelectorAll('fieldset.package-export-options input[type="checkbox"]'));
      const files = Array.from(panel.querySelectorAll('ol.package-export-files > li')).map((item) => {
        const details = item.querySelector('details.package-export-fidelity');
        const degraded = item.dataset.packageExportDegraded === 'true';
        return [item.dataset.packageExportFile, degraded, item.querySelectorAll('.export-fidelity-row').length, details?.querySelector('.export-restoration-line')?.textContent ?? null,
          details?.open === degraded && (details.querySelector('summary')?.textContent ?? '').startsWith('导出保真审阅')];
      });
      return JSON.stringify(boxes.map((box) => box.dataset.packageField + ':' + box.checked + ':' + box.closest('label')?.querySelector('strong')?.textContent)) ===
          '["includeAnnotations:true:含批注","includeSuggestions:true:含修改建议（作为修订）"]' &&
        JSON.stringify(files) === ${JSON.stringify(JSON.stringify(packageReview.files))} &&
        (panel.querySelector('.export-degraded-note') !== null) === ${packageReview.degraded === true};
    })()`, 'package-export-fidelity-and-switches');
    // Turning 含批注 off reviews the files again under it, focus staying on the switch; turning it on again restores the
    // review the folder is then bound to.
    const toggleAnnotations = (name) => assertRenderer(renderer, `(() => { const box = window.__j07.packageExport()?.querySelector('input[data-package-field="includeAnnotations"]');
      if (!(box instanceof HTMLInputElement) || box.disabled) return false; box.focus(); box.click(); return true; })()`, name);
    const switchedTo = (checked) => `(() => { const panel = window.__j07.packageExport(); const box = panel?.querySelector('input[data-package-field="includeAnnotations"]');
      return panel?.dataset.packageExportPhase === 'ready' && box?.checked === ${checked} && document.activeElement === box && window.__j07.status() === '要导出的文件已列出'; })()`;
    await toggleAnnotations('package-export-annotations-off');
    await waitFor(renderer, switchedTo(false), 'package-export-reviewed-without-annotations', 60_000);
    await toggleAnnotations('package-export-annotations-on');
    await waitFor(renderer, switchedTo(true), 'package-export-reviewed-with-annotations', 60_000);
    for (const [key] of firstMembers) {
      await clickSelector(renderer, `input[data-package-member="${key}"]`, 'package-export-select-member');
    }
    await clickSelector(renderer, packageAction('export-choose'), 'package-export-choose');
    await waitFor(renderer, `window.__j07.packageExport()?.dataset.packageExportPhase === 'prepared' && window.__j07.status() === '已准备好导出文件，等待你确认。'`, 'package-export-prepared', 60_000);
    await assertRenderer(renderer, `(() => {
      const panel = window.__j07.packageExport();
      const approve = panel.querySelector('[data-package-action="export-approve"]');
      return panel.querySelector('.package-export-folder-line')?.textContent === ${JSON.stringify(`导出到：${packageFolder}`)} &&
        JSON.stringify(window.__j07.packageExportFiles()) === ${JSON.stringify(JSON.stringify(packageFileLines('prepared', '已准备', firstMembers)))} &&
        approve instanceof HTMLButtonElement && !approve.disabled && document.activeElement === approve &&
        panel.querySelector('[data-package-action="export-choose"]')?.textContent === '重新选择位置…' &&
        (window.__j07.packageVersions()[0].querySelector('.package-version-line')?.textContent ?? '').startsWith('v2 · 图书交付包已准备 · 暂无导出记录');
    })()`, 'package-export-bound-to-the-folder');
    requireJourney((await readdir(packageFolder)).length === 0, 'package-export-prepared-writes-nothing');
    await clickSelector(renderer, packageAction('export-approve'), 'package-export-approve');
    await waitFor(renderer, `window.__j07.packageExport()?.dataset.packageExportPhase === 'done' && window.__j07.status() === '已导出到所选位置 · 2 个文件'`, 'package-export-written', 60_000);
    await assertRenderer(renderer, `(() => {
      const panel = window.__j07.packageExport();
      const result = panel.querySelector('.package-export-result');
      const [v2, v1] = window.__j07.packageVersions();
      const history = Array.from(v2.querySelectorAll('ol.package-export-list > li'));
      return result?.dataset.packageExportState === 'exported' && result.querySelector('.package-export-summary')?.textContent === '已导出到所选位置 · 2 个文件' &&
        result.querySelector('.package-export-stopped') === null &&
        JSON.stringify(window.__j07.packageExportFiles()) === ${JSON.stringify(JSON.stringify(packageFileLines('created', '已导出到所选位置', firstMembers)))} &&
        document.activeElement === result.querySelector('[data-package-action="export-reveal"]') && panel.querySelector('[data-package-action="export-choose"]') === null &&
        (v2.querySelector('.package-version-line')?.textContent ?? '').startsWith('v2 · 图书交付包已准备 · 已导出 1 次') &&
        history.length === 1 && history[0].dataset.packageExportState === 'exported' &&
        (history[0].querySelector('.package-export-line')?.textContent ?? '').startsWith('已导出到所选位置 · 2 个文件 · ') &&
        history[0].querySelector('.package-export-folder')?.textContent === ${JSON.stringify(packageFolder)} &&
        history[0].querySelector('[data-package-action="reveal-export"]')?.textContent === '在文件夹中显示' &&
        v1.querySelector('ol.package-export-list') === null && (v1.querySelector('.package-version-line')?.textContent ?? '').startsWith('v1 · 图书交付包已准备 · 暂无导出记录') &&
        window.__j07.pkg().dataset.packageVersions === '2' && window.__j07.pkg().dataset.packageChanged === 'false';
    })()`, 'package-export-history');
    requireJourney(JSON.stringify((await readdir(packageFolder)).sort()) === JSON.stringify(firstMembers.map(([, , , fileName]) => fileName).sort()), 'package-export-selected-subset-only');
    await clickSelector(renderer, packageAction('export-close'), 'package-export-subset-close');
    // Each native dialog control is single-use. Restart with a fresh answer for the second explicit batch.
    await close();
    renderer = await launch({ folder: packageFolder });
    await reopenDeliverables(renderer, 'package-export-second-batch');
    await clickSelector(renderer, packageAction('export'), 'package-export-remaining-open');
    await waitFor(renderer, `window.__j07.packageExport()?.dataset.packageExportPhase === 'ready'`, 'package-export-remaining-reviewed', 60_000);
    await clickSelector(renderer, 'input[data-package-member="document:news-release"]', 'package-export-select-remaining');
    await clickSelector(renderer, packageAction('export-choose'), 'package-export-remaining-choose');
    await waitFor(renderer, `window.__j07.packageExport()?.dataset.packageExportPhase === 'prepared'`, 'package-export-remaining-prepared', 60_000);
    await assertRenderer(renderer, `window.__j07.packageExport().querySelectorAll('ol.package-export-files > li').length === 1`, 'package-export-one-prepared-member');
    await clickSelector(renderer, packageAction('export-approve'), 'package-export-remaining-approve');
    await waitFor(renderer, `window.__j07.packageExport()?.dataset.packageExportPhase === 'done' && window.__j07.status() === '已导出到所选位置 · 1 个文件'`, 'package-export-remaining-written', 60_000);
    await assertRenderer(renderer, `window.__j07.packageVersions()[0].querySelectorAll('ol.package-export-list > li').length === 2`, 'package-export-two-subset-receipts');
    // The folder holds exactly the three files; each DOCX is a package, and the 交付包清单 is the version's own words, byte
    // for byte, as the package and its Delivery Records answer them.
    requireJourney(JSON.stringify((await readdir(packageFolder)).sort()) === JSON.stringify(packageFiles.map(([, , , fileName]) => fileName).sort()), 'package-export-folder-files');
    for (const [key, format, , fileName] of packageFiles) {
      if (format !== 'docx') continue;
      const bytes = await readFile(resolve(packageFolder, fileName));
      requireJourney(bytes.byteLength > 1_000 && bytes.subarray(0, 2).toString('latin1') === 'PK', `package-export-docx-${key}`);
    }
    const manifestInputs = await renderer.evaluate(`Promise.all([window.ai7.inspectBookDeliveryPackage(), window.ai7.inspectProductionDocuments()]).then(([bundle, documents]) => ({
      version: bundle.versions[0], included: bundle.content.included, limitations: bundle.content.limitations, statement: bundle.statement,
      deliveries: documents.types.find((type) => type.typeId === 'news-release').document.deliveries,
    }))`);
    const expectedManifest = [
      `# ${EXCERPT.title} · 图书交付包 v2`, '',
      `- 用途：${PACKAGE_PURPOSE_2}`, `- 准备于：${manifestInputs.version.preparedAt}`, `- 内容摘要：${manifestInputs.version.technical.contentDigest}`, '',
      '## 包含', '',
      `- 稿件 · ${manifestInputs.included[0].label}（${manifestInputs.included[0].detail}）`, `- ${manifestInputs.included[1].label}`, '',
      '## 交付记录', '', '### 新闻稿', '',
      ...manifestInputs.deliveries.map((delivery) =>
        `- 第 ${delivery.ordinal} 次交付 · ${delivery.recipient.label} · ${delivery.versionLabel} · ${delivery.recordedAt}${delivery.note === null ? '' : `（备注：${delivery.note}）`}`),
      '',
      '## 不包含', '',
      '- 备注：稿件与文档上的备注只供编辑自己参考', '- 资料库原件', '- 中间修订版：稿件只含发稿版本，文档只含交付过的版本', '- 本书不做：宣传文章、评论文章、发布会材料、营销要点', '',
      '## 说明', '',
      ...manifestInputs.limitations.map((line) => `- ${line}`), `- ${manifestInputs.statement}`, '',
    ].join('\n');
    const manifest = await readFile(resolve(packageFolder, PACKAGE_MANIFEST_FILE));
    requireJourney(manifestInputs.included.length === 2 && manifestInputs.deliveries.length === 2 &&
      createHash('sha256').update(manifest).digest('hex') === createHash('sha256').update(expectedManifest, 'utf8').digest('hex'), 'package-export-manifest-words');
    requireJourney(await renderer.evaluate(`window.ai7.inspectDeliverables().then((answer) => JSON.stringify(answer.exports))`) === recordsBefore, 'package-export-not-in-export-records');
    // 完成 closes the card; focus returns to v2's 导出….
    await clickSelector(renderer, packageAction('export-close'), 'package-export-close');
    await waitFor(renderer, `window.__j07.packageExport() === null && document.activeElement === window.__j07.packageVersions()[0].querySelector('[data-package-action="export"]')`, 'package-export-closed');
    await assertNoForbiddenWords(renderer, 'package-export-without-forbidden-words');

    at('documents-restart');
    // A restart moves nothing: 交付物, 交付 · 生产文档 and 图书交付包 answer byte for byte as before, the card still names
    // its second delivery, the package lists its two versions and v2's export, and the 新闻稿 opens at 版本 3 with both its edits.
    const readBoth = `Promise.all([window.ai7.inspectDeliverables(), window.ai7.inspectProductionDocuments(), window.ai7.inspectBookDeliveryPackage()]).then((answers) => JSON.stringify(answers))`;
    const documentsBefore = await renderer.evaluate(readBoth);
    await close();
    renderer = await launch();
    await reopenDeliverables(renderer, 'documents-restart');
    const documentsAfter = await renderer.evaluate(readBoth);
    requireJourney(typeof documentsBefore === 'string' && documentsAfter === documentsBefore, 'documents-restart-moved-nothing');
    await waitFor(renderer, `window.__j07.card('news-release')?.dataset.documentState === 'document' && window.__j07.card('news-release').dataset.documentDeliveries === '2' && window.__j07.card('news-release').dataset.documentChangedSinceDelivery === 'false' && window.__j07.packageVersions().length === 2 && (window.__j07.packageVersions()[0].querySelector('ol.package-export-list > li .package-export-line')?.textContent ?? '').startsWith('已导出到所选位置 · 1 个文件 · ')`, 'documents-restart-card');
    await clickSelector(renderer, '[data-screen="book-deliverables"] li[data-document-type-id="news-release"] [data-document-action="open"]', 'documents-restart-open');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-deliverable="production-document"] .editor-toolbar h2')?.textContent === '新闻稿 · 版本 3' && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')?.textContent?.endsWith(${JSON.stringify(`${DOCUMENT_EDIT}${DELIVERY_EDIT}`)})`, 'documents-restart-document');
    await assertNoForbiddenWords(renderer, 'documents-without-forbidden-words');

    at('zero-loopback-requests');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-loopback-requests');

    at('completion-browser-close');
    await close();
    await loopback.close();
    journeyCompleted = true;
  } finally {
    try {
      // Only a Journey that finished names its cleanup; one that failed keeps the stage it failed at.
      if (journeyCompleted) at('completion-cleanup');
      await cancellation.cleanup();
    } finally {
      cancellation.dispose();
    }
  }
}

main().catch((error) => reportJourneyFailure('J-07', location, error));
