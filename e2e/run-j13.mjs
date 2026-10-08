import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, platform, release, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, journeyCheckFailure, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';
import { assertSecretsAbsentFromDataRoot, recoverSyntheticCredentialCleanupState, removeSyntheticCredentialWithElectron } from './credential-cleanup.mjs';

// J-13 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012): 书系 as a stable global destination. Three empty Books; 新建书系
// with a name refused past its bound; one Series' 成员与共享范围; 加入书系 through the four-part Series Membership Impact Preview
// whose only committing action is exactly `加入书系`; a preview another change moved past, refused and read again; 书库's
// search by 书系; each Book's own 书系 records on its 工作概览; 移出书系 as prospective; a restart that keeps everything; and the
// preview by keyboard, at 200% and under forced colours. Those Books are empty and every name is the runner's own.
//
// Since S28b (Issue #63; V2-UX-SER-013 to SER-019) a fourth Book is made from the one admitted input, exact `sample1`, through
// the launch control `--j13-picker-path`, and joins the Series. Its selected words become a Series Knowledge Candidate from
// the manuscript's selection menu; an editor-authored candidate for the same name discloses a conflict; 书系知识纳入审阅 keeps
// it by `保留已披露冲突` and `纳入书系知识` creates the item; 编辑候选项 retargets the other candidate to that item, which is
// taken in as its second revision.
//
// Since S29a (Issue #64; V2-UX-REV-013, SER-018) the member Book offers 书系一致性 in 审阅, its basis naming that second
// revision. The Review Run executes on the J-04 model adapter through the authored fixture
// `sample1-series-consistency-authored`, bound to every launch with `--j04-model-adapter`; its findings arrive as 批注 on the
// manuscript, and the Series page's 书系一致性审阅 column says when. Its prerequisites are the product's own setup, as J-11
// makes them: the editorial workspace profile at Revision 2, and one Main Editorial Role connection whose synthetic
// credential is saved and removed again, so only its reference is recorded. No Provider, no transmission.
//
// Since S30 (Issue #65; ADR 0087) J-13 ends with 可复用工序, moved here from J-15, which runs in the pull-request lane: a
// window bound to the authored review fixture runs 体例与格式 and 文学性与表达改进 on the member Book, captures 体例与格式 as
// 《体例复核》 and the same capture as a 开发建议, validates and enables it in 知识库 › 工序与规则, runs it pinned in a second
// `sample1` Book, stops it with the pin kept, writes the 开发建议 to a file through the Save dialog, and restarts. Since S31
// (Issue #66) it also captures a second version that becomes 最新可用, chooses and pins the older one instead on the second
// Book's 新建审阅, previews 停用… — the prepared Run prepared again, the history kept, version 2 next — before confirming it,
// opens a linked Run from the stopped version, and 全部停用… leaves nothing to run.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRST = '星河之一';
const SECOND = '星河之二';
const OUTSIDE = '书系之外';
const SERIES = '星河三部曲';
const NOTE = '同一个宇宙里的三部长篇。';
const SERIES_LEDE = '书系把相关的图书放在一起。加入书系只让以后的任务可以明确选用书系的范围：不会让一本书读到另一本书的原文，也不会自动授权任何任务。';
const SCOPE_NOTE = '成员只表示以后的任务可以明确选用这个书系的范围；这里不汇总、也不打开成员图书的原文。';
const STALE = '预览之后，书系成员或相关记录有了变化；请重新查看影响，再决定。';
const GROUPS = [['future-tasks', '未来任务'], ['runs', '已授权或正在运行'], ['knowledge-learning', '书系知识与学习'], ['history', '历史记录']];
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const MEMBER = '星河之三';
const PLACE = '海边小城';
const EDITOR_WORDS = '三部曲里海边小城的地名，以第一部的写法为准。';
const KNOWLEDGE_NOTE = '书系知识只有经过纳入审阅才会成为书系可以选用的知识；候选项不会被任何任务读取，纳入也不会授权读取、发送或改动稿件。';
const FIXTURE_IDENTITY = 'sample1-series-consistency-authored';
const NO_KNOWLEDGE = `书系「${SERIES}」还没有纳入可用于一致性审阅的书系知识；在书系中纳入后才能选。`;
// 书系检索排除 (Issue #64, S29b).
const ITEM_LABEL = `书系知识条目「${PLACE}」（地点）`;
const EXCLUSION_REASON = '地名写法待与第一部核对';
const SCOPE_CHANGED = '书系检索范围已变化 · 需要重新确认计划';
const MARKER = '此结果使用的材料后来被排除';
const CAPTURE_CANCELLED = '这次审阅已取消，不能保存为可复用工序；从一次完成的审阅保存。';
const EXCLUDED_REASON = `书系「${SERIES}」可用于一致性审阅的书系知识都已排除在书系检索之外；停止排除或纳入其他书系知识后才能选。`;
const CONSISTENCY_BASIS = `依据：书系「${SERIES}」的书系知识：地点「${PLACE}」第 2 版 · 工序：书系一致性检查（第 1 版） · 不使用搜索引擎`;
let location = 'entry';

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-13', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = journeyCheckFailure('J-13', name);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-13', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-13' };
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
    server.once('error', () => rejectListen(journeyCheckFailure('J-13', 'loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  requireJourney(address && typeof address === 'object' && address.address === '127.0.0.1' && address.port > 0, 'loopback-address');
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j13-network-probe`,
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
    if (response.error) completion.reject(journeyCheckFailure('J-13', 'renderer-cdp-response'));
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
          rejectResponse(journeyCheckFailure('J-13', 'renderer-cdp-timeout'));
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
  throw journeyCheckFailure('J-13', name);
}

async function waitForRenderer(manager, name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const renderers = await manager.list();
    if (renderers.length === 1) return renderers[0];
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-13', name);
}

async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), name);
}

async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const node=Array.from(document.querySelectorAll('button')).find((item)=>item.textContent===${JSON.stringify(label)}); if(!(node instanceof HTMLButtonElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function clickSelector(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!(node instanceof HTMLElement)||node.disabled)return false; node.click(); return true; })()`, name);
}

async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input=document.querySelector(${JSON.stringify(selector)}); if(!(input instanceof HTMLInputElement)&&!(input instanceof HTMLTextAreaElement))return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return input.value===${JSON.stringify(value)}; })()`, name);
}

async function choose(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const select=document.querySelector(${JSON.stringify(selector)}); if(!(select instanceof HTMLSelectElement))return false; select.value=${JSON.stringify(value)}; select.dispatchEvent(new Event('change',{bubbles:true})); return select.value===${JSON.stringify(value)}; })()`, name);
}

const KEYS = Object.freeze({
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
});
async function press(renderer, key) {
  const descriptor = KEYS[key];
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor });
  const { text: _text, unmodifiedText: _unmodifiedText, ...released } = descriptor;
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...released });
}

const status = `(document.querySelector('#persistence-status')?.textContent ?? '')`;

/** Create an empty Book titled `title`; its checks are labelled by `name`, never by the title (Issue #652). */
async function createEmptyBook(renderer, title, name) {
  await click(renderer, '新建图书', `${name}-open`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, `${name}-form`);
  await fill(renderer, '#empty-book-title', title, `${name}-title`);
  await click(renderer, '复核创建', `${name}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, `${name}-review-ready`);
  await click(renderer, '新建图书', `${name}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-manuscript-state="empty"]')`, `${name}-created`, 120_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId`);
  requireJourney(UUID_PATTERN.test(bookId), `${name}-book-id`);
  return bookId;
}

async function backToLibrary(renderer, name) {
  await click(renderer, '返回图书列表', `${name}-back`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, `${name}-library`);
}

/** Where focus stands inside a page: an action by name, a field by its id or name, or the preview's heading. */
const FOCUS = `(() => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active.classList.contains('series-preview-heading')) return 'preview-heading';
  return active.dataset.seriesAction ?? (active.id || active.getAttribute('name') || active.tagName);
})()`;

/** 书系's list as the editor reads it: each Series' entry, the empty line, the form and any refusal, and where focus is. */
const READ_SERIES_LIST = `(() => {
  const screen = document.querySelector('[data-screen="series-list"]');
  const root = screen?.querySelector('.series-list-page');
  if (!(root instanceof HTMLElement) || root.dataset.seriesCount === undefined) return null;
  const create = root.querySelector('[data-series-action="create"]');
  return {
    lede: screen.querySelector('.series-lede')?.textContent ?? null,
    empty: root.querySelector('.series-empty')?.textContent ?? null,
    items: Array.from(root.querySelectorAll('li.series-item'), (item) => [item.dataset.seriesId ?? null, item.querySelector('[data-series-action="open"]')?.textContent ?? null, item.querySelector('.series-item-note')?.textContent ?? null]),
    form: root.querySelector('form.series-create-form') !== null,
    createDisabled: create instanceof HTMLButtonElement ? create.disabled : null,
    refusal: root.querySelector('.series-refusal')?.textContent ?? null,
    focus: root.contains(document.activeElement) ? ${FOCUS} : null,
  };
})()`;

/** One Series' 成员与共享范围 as the editor reads it: members, the chooser, the preview, any refusal, the records, and focus. */
const READ_SERIES = `(() => {
  const screen = document.querySelector('[data-screen="series"]');
  const root = screen?.querySelector('.series-page');
  if (!(root instanceof HTMLElement) || root.dataset.seriesId === undefined) return null;
  const preview = root.querySelector('.series-preview');
  const addOpen = root.querySelector('[data-series-action="add-open"]');
  const look = root.querySelector('[data-series-action="preview"]');
  return {
    seriesId: root.dataset.seriesId,
    heading: screen.querySelector('h2')?.textContent ?? null,
    note: screen.querySelector('.series-note')?.textContent ?? null,
    scopeNote: root.querySelector('.series-scope-note')?.textContent ?? null,
    membersEmpty: root.querySelector('.series-members-empty')?.textContent ?? null,
    members: Array.from(root.querySelectorAll('table.series-member-table tbody tr'), (row) => [row.dataset.bookId ?? null, ...Array.from(row.children, (cell) => cell.textContent ?? '')]),
    columns: Array.from(root.querySelectorAll('table.series-member-table thead th'), (cell) => cell.textContent ?? ''),
    addOpen: addOpen instanceof HTMLButtonElement ? !addOpen.disabled : null,
    addNone: root.querySelector('.series-add-none')?.textContent ?? null,
    chooser: root.querySelector('.series-add-chooser') === null ? null : Array.from(root.querySelectorAll('input[name="series-add-book"]'), (radio) => [radio.value, radio.checked, radio.parentElement?.textContent ?? '']),
    lookDisabled: look instanceof HTMLButtonElement ? look.disabled : null,
    preview: preview === null ? null : {
      kind: preview.dataset.previewKind ?? null,
      bookId: preview.dataset.bookId ?? null,
      heading: preview.querySelector('.series-preview-heading')?.textContent ?? null,
      identity: preview.querySelector('.series-preview-identity')?.textContent ?? null,
      groups: Array.from(preview.querySelectorAll(':scope > .series-impact-group'), (group) => [group.dataset.impactGroup ?? null, group.querySelector('h5')?.textContent ?? null,
        Array.from(group.querySelectorAll('.series-impact-changes li'), (line) => line.textContent ?? ''), Array.from(group.querySelectorAll('.series-impact-unchanged li'), (line) => line.textContent ?? '')]),
      actions: Array.from(preview.querySelectorAll('[data-series-action]'), (node) => [node.dataset.seriesAction ?? null, node.textContent ?? '']),
    },
    refusal: root.querySelector('.series-refusal')?.textContent ?? null,
    historyEmpty: root.querySelector('.series-history-empty')?.textContent ?? null,
    history: Array.from(root.querySelectorAll('ol.series-history > li'), (item) => [item.dataset.changeKind ?? null, item.dataset.bookId ?? null, item.querySelector('.series-change-line')?.textContent ?? null, item.querySelectorAll('.series-impact-group').length]),
    focus: root.contains(document.activeElement) ? ${FOCUS} : null,
  };
})()`;

/** A Book's own 书系 on its 工作概览: the Series it is in and its membership records. */
const READ_BOOK_SERIES = `(() => {
  const section = document.querySelector('[data-screen="book-overview"] section.book-series');
  if (!(section instanceof HTMLElement) || section.dataset.seriesCount === undefined) return null;
  return {
    bookId: section.dataset.bookId ?? null,
    none: section.querySelector('.book-series-none')?.textContent ?? null,
    memberships: Array.from(section.querySelectorAll('.book-series-membership'), (line) => [line.dataset.seriesId ?? null, line.textContent ?? '']),
    summary: section.querySelector('details.book-series-history > summary')?.textContent ?? null,
    history: Array.from(section.querySelectorAll('details.book-series-history li.series-change'), (item) => [item.dataset.changeKind ?? null, item.querySelector('.series-change-line')?.textContent ?? null]),
  };
})()`;

async function readUntil(renderer, reader, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(reader).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-13', name);
  error.detail = page;
  throw error;
}
const readSeriesList = (renderer, predicate, name) => readUntil(renderer, READ_SERIES_LIST, predicate, name);
const readSeries = (renderer, predicate, name) => readUntil(renderer, READ_SERIES, predicate, name);
const readBookSeries = (renderer, predicate, name) => readUntil(renderer, READ_BOOK_SERIES, predicate, name);

/** From the landing, 书系 and then one Series' page. */
async function openSeries(renderer, seriesId, name) {
  await click(renderer, '书系', `${name}-list`);
  await readSeriesList(renderer, (page) => page.items.some(([id]) => id === seriesId), `${name}-listed`);
  await clickSelector(renderer, `[data-screen="series-list"] [data-series-id="${seriesId}"] [data-series-action="open"]`, `${name}-open`);
  return readSeries(renderer, (page) => page.seriesId === seriesId, `${name}-page`);
}

/** From a Series' page, back through 书系 to the landing's list. */
async function leaveSeries(renderer, name) {
  await click(renderer, '返回书系', `${name}-list`);
  await waitFor(renderer, `document.querySelector('[data-screen="series-list"] .series-list-page')?.dataset.seriesCount !== undefined`, `${name}-listed`);
  await click(renderer, '返回', `${name}-landing`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, `${name}-library`);
}

/** A Book's 工作概览 from the landing's list, and its 书系 section once it has read. */
async function bookSide(renderer, bookId, name) {
  await clickSelector(renderer, `[data-screen="landing"] button[data-book-id="${bookId}"]`, `${name}-open`);
  return readBookSeries(renderer, (side) => side.bookId === bookId, `${name}-series`);
}

/**
 * Exact `sample1` through the import flow, as a new Book with its first manuscript; the Book's identity. A second import names
 * the new Book as a distinct intended work (Issue #65, S30), as J-09 does: the same source is already a Book here.
 */
async function importSample1(renderer, title, sample1, name, distinct = false) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await click(renderer, '导入稿件', `${name}-start`);
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${name}-target`);
  const target = distinct ? '新建图书（作为不同作品）' : '新建图书';
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label=${JSON.stringify(target)}]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-target-explicit`);
  await waitFor(renderer, `document.querySelector('[data-screen="relationship"]')`, `${name}-relationship`);
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="作为首份稿件导入"]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-relationship-explicit`);
  await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, `${name}-title-screen`);
  await assertRenderer(renderer, `document.querySelector('[data-source-sha256]')?.textContent===${JSON.stringify(sample1.sha256)} && document.querySelector('[data-source-bytes]')?.textContent===${JSON.stringify(String(sample1.bytes))}`, `${name}-exact-source`);
  await fill(renderer, '#book-title', title, `${name}-title`);
  await click(renderer, '确认书名并复核', `${name}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, `${name}-review-ready`);
  await waitFor(renderer, `!document.querySelector('#accept-import-degradation')&&Array.from(document.querySelectorAll('button')).some((button)=>button.textContent==='新建图书并导入稿件'&&!button.disabled)`, `${name}-review-clean`);
  await click(renderer, '新建图书并导入稿件', `${name}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="imported"] .book-overview[data-manuscript-state="populated"]')`, `${name}-completed`, 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'`, `${name}-acknowledged`, 180_000);
  const bookId = await renderer.evaluate(`document.querySelector('.book-overview')?.dataset.bookId ?? null`);
  requireJourney(UUID_PATTERN.test(bookId ?? ''), `${name}-book-identity`);
  return bookId;
}

// A hand on the manuscript, as J-11 has it: a selection put into a block by offset, a right-click the way a pointer does,
// and the floating Mark surface acted on by its data attributes. A block's durable text leaves out any preview's words.
const MARK_HELPERS = `(() => {
  if (window.__j13) return true;
  const editor = () => document.querySelector('[data-testid="manuscript-editor"]');
  const block = (id) => editor()?.querySelector('[data-block-id="' + id + '"]') ?? null;
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
  window.__j13 = {
    place: (id, from, to) => {
      const root = block(id);
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
    block,
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
      if (!(input instanceof HTMLTextAreaElement) && !(input instanceof HTMLSelectElement)) return false;
      input.value = value;
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      return input.value === value;
    },
  };
  return true;
})()`;

/** A menu opened with the pointer: the editor reads a selection a tick after the page sets it, so it is asked again until it shows. */
async function openSelectionMenu(renderer, blockId, from, to, name) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await assertRenderer(renderer, `window.__j13.place(${JSON.stringify(blockId)}, ${from}, ${to})`, `${name}-prepare`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await assertRenderer(renderer, `window.__j13.rightClick(window.__j13.block(${JSON.stringify(blockId)}))`, `${name}-right-click`);
    if (await renderer.evaluate(`Boolean(window.__j13.menu()?.dataset.markMenu === 'selection' && window.__j13.menu().textContent.includes('已选 ${to - from} 字'))`)) return;
    await press(renderer, 'Escape');
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  throw journeyCheckFailure('J-13', name);
}

/** 书系知识 on the Series page as the editor reads it: items, candidates, the propose form, the review, and focus. */
const READ_KNOWLEDGE = `(() => {
  const root = document.querySelector('[data-screen="series"] .series-knowledge');
  if (!(root instanceof HTMLElement) || root.dataset.knowledgeItems === undefined) return null;
  const review = root.querySelector('.knowledge-review');
  const form = root.querySelector('form.knowledge-form-propose');
  const active = document.activeElement;
  const promote = review?.querySelector('[data-knowledge-action="promote"]');
  const text = (node) => node?.textContent ?? null;
  return {
    note: text(root.querySelector('.knowledge-note')),
    items: Array.from(root.querySelectorAll('li.knowledge-item'), (item) => [item.dataset.itemId ?? null, text(item.querySelector('.knowledge-item-title')), text(item.querySelector('.knowledge-item-content')),
      text(item.querySelector('.knowledge-item-provenance')), text(item.querySelector('.knowledge-item-reuse')), text(item.querySelector('.knowledge-item-conflicts')), text(item.querySelector('details.knowledge-item-history > summary'))]),
    itemsEmpty: text(root.querySelector('.knowledge-items-empty')),
    candidates: Array.from(root.querySelectorAll('li.knowledge-candidate'), (item) => [item.dataset.candidateId ?? null, item.dataset.authoring ?? null, text(item.querySelector('.knowledge-candidate-target')),
      text(item.querySelector('.knowledge-candidate-provenance')), item.querySelector('.knowledge-candidate-conflict') !== null]),
    candidatesEmpty: text(root.querySelector('.knowledge-candidates-empty')),
    form: form === null ? null : {
      targets: Array.from(form.querySelectorAll('input[name="knowledge-target"]'), (radio) => [radio.value, radio.checked, radio.parentElement?.textContent ?? '']),
      subject: form.querySelector('#knowledge-subject-propose') !== null,
    },
    review: review === null ? null : {
      candidateId: review.dataset.candidateId ?? null,
      identity: text(review.querySelector('.knowledge-review-identity')),
      provenance: text(review.querySelector('.knowledge-review-provenance')),
      superseded: text(review.querySelector('.knowledge-review-superseded')),
      conflictLabel: text(review.querySelector('.knowledge-conflict-label')),
      conflicts: Array.from(review.querySelectorAll('.knowledge-review-conflicts li'), (line) => [line.dataset.conflictKind ?? null, line.textContent ?? '']),
      dispositions: Array.from(review.querySelectorAll('.knowledge-dispositions [data-knowledge-action]'), (button) => [button.dataset.knowledgeAction ?? null, button.textContent ?? '', button.getAttribute('aria-pressed')]),
      preserved: text(review.querySelector('.knowledge-preserved-note')),
      reuse: Array.from(review.querySelectorAll('input[name="knowledge-reuse"]'), (radio) => [radio.value, radio.checked]),
      promote: promote instanceof HTMLButtonElement ? [promote.textContent, promote.disabled] : null,
      waits: text(review.querySelector('.knowledge-promote-waits')),
      editing: review.querySelector('form.knowledge-form-edit') !== null,
      editTargets: Array.from(review.querySelectorAll('form.knowledge-form-edit input[name="knowledge-target"]'), (radio) => [radio.value, radio.checked]),
    },
    focus: active instanceof HTMLElement && root.contains(active)
      ? (active.dataset.knowledgeAction ?? (active.classList.contains('knowledge-review-heading') ? 'review-heading' : active.classList.contains('knowledge-item-title') ? 'item-title' : (active.getAttribute('name') || active.id || active.tagName)))
      : null,
  };
})()`;
const readKnowledge = (renderer, predicate, name) => readUntil(renderer, READ_KNOWLEDGE, predicate, name);


// ---- 可复用工序 (Issue #65, plan slice S30; ADR 0087) ----------------------------------------------------------------------
// The capture branch runs Review Runs of 体例与格式 and 文学性与表达改进, so its window binds the J-04 model adapter over the
// authored fixture `sample1-review-authored` — the local deterministic route, no Provider — and answers one Save dialog with
// `--j13-save-path`. Its Books are reached through 书库's 查找, since by then the library holds more than one page of Books.
const REVIEW_FIXTURE_IDENTITY = 'sample1-review-authored';
const CAPTURE_TARGET_TITLE = '工序运行之书';
const PROCEDURE_TITLE = '体例复核';
const PROPOSAL_TITLE = '图注核对';
const PROPOSAL_FILE_NAME = '开发建议.md';

/** A Book from 书库 by 查找, into its manuscript. */
async function openFoundBook(renderer, title, bookId, name) {
  await fill(renderer, '#book-filter-text', title, `${name}-find-text`);
  await clickSelector(renderer, '[data-book-filter-action="find"]', `${name}-find`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] button[data-book-id=${JSON.stringify(bookId)}]')`, `${name}-found`);
  await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(bookId)}]`, `${name}-book`);
  await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookId)}]')`, `${name}-manuscript`, 120_000);
}

/** A Book's ②B 审阅 from 书库: its manuscript first, then 工作 › 审阅, as the editor reaches it. */
async function openBookReview(renderer, title, bookId, name) {
  await openFoundBook(renderer, title, bookId, name);
  await assertRenderer(renderer, `(() => { const button=document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"] button[data-work-destination="review"]'); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, `${name}-entry`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-review"] .book-review .review-workspace-card')`, `${name}-card`, 60_000);
}

/** From ②B 审阅 back to 书库: its 工作概览, then the library. */
async function leaveReviewToLibrary(renderer, name) {
  await click(renderer, '工作概览', `${name}-overview`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview')`, `${name}-overview-ready`);
  await backToLibrary(renderer, name);
}

/** Prepare a Review Run on the open 审阅 sheet, start it from the drawer, and wait for it to settle; its projection. */
async function startPreparedReview(renderer, name) {
  await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='prepared'`, `${name}-prepared`, 180_000);
  const prepared = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
  requireJourney(prepared?.state === 'prepared' && UUID_PATTERN.test(prepared.reviewRunId ?? ''), `${name}-prepared-run`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(prepared.reviewRunId)} && document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready'`, `${name}-drawer`);
  await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', `${name}-start`);
  await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='settled'`, `${name}-settled`, 300_000);
  await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', `${name}-drawer-close`);
  await waitFor(renderer, `document.body.dataset.taskDrawer !== 'open'`, `${name}-drawer-closed`);
  return (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
}

/** The capture sheet as an editor reads it. */
const READ_CAPTURE = `(() => {
  const dialog = document.querySelector('dialog.procedure-capture');
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return null;
  return {
    kind: dialog.dataset.captureKind ?? null,
    kept: dialog.dataset.captureKept ?? null,
    steps: Array.from(dialog.querySelectorAll('[data-capture-step]'), (label) => [label.dataset.captureStep, label.dataset.captureEligible, label.querySelector('input')?.checked ?? null, label.querySelector('.procedure-capture-step-text')?.textContent ?? null]),
    kinds: Array.from(dialog.querySelectorAll('[data-capture-kind]'), (label) => [label.dataset.captureKind, label.querySelector('input')?.disabled ?? null, label.querySelector('input')?.checked ?? null]),
    why: dialog.querySelector('.procedure-capture-why p')?.textContent ?? null,
    extract: Array.from(dialog.querySelectorAll('.procedure-capture-extract li'), (item) => item.textContent),
    notSaved: Array.from(dialog.querySelectorAll('.procedure-capture-not-saved li'), (item) => item.textContent),
    procedureShown: !dialog.querySelector('.procedure-capture-procedure')?.hidden,
    proposalShown: !dialog.querySelector('.procedure-capture-proposal')?.hidden,
    affected: dialog.querySelector('[data-capture-field="affected-procedure"]')?.value ?? null,
    focused: document.activeElement === dialog.querySelector('h3'),
  };
})()`;
const readCapture = (renderer, predicate, name) => readUntil(renderer, READ_CAPTURE, predicate, name);

/** 知识库 › 工序与规则's 可复用工序 and 开发建议 as an editor reads them; versions only where they are opened. */
const READ_PROCEDURES = `(() => {
  const procedures = document.querySelector('.knowledge-captured-procedures');
  const proposals = document.querySelector('.knowledge-developer-proposals');
  if (!(procedures instanceof HTMLElement) || !(proposals instanceof HTMLElement)) return null;
  const border = (node) => node instanceof HTMLElement ? getComputedStyle(node).borderTopStyle : null;
  // 停用…'s preview (Issue #66, S31): its heading, the versions it takes with their prepared and active counts, the prepared Runs,
  // and what a new use takes afterwards.
  const readStop = (panel) => panel instanceof HTMLElement ? {
    heading: panel.querySelector('h5')?.textContent ?? null,
    after: panel.dataset.stopAfter ?? null,
    versions: Array.from(panel.querySelectorAll('[data-stop-version]'), (entry) => [entry.dataset.stopVersion, entry.dataset.stopPrepared, entry.dataset.stopActive]),
    prepared: Array.from(panel.querySelectorAll('.captured-procedure-stop-prepared li[data-review-run-id]'), (entry) => entry.textContent),
    afterLine: panel.querySelector('.captured-procedure-stop-after')?.textContent ?? null,
    kept: panel.querySelector('.captured-procedure-stop-kept')?.textContent ?? null,
  } : null;
  return {
    count: procedures.dataset.procedureCount ?? null,
    proposalCount: proposals.dataset.proposalCount ?? null,
    procedures: Array.from(procedures.querySelectorAll('article.captured-procedure'), (card) => ({
      id: card.dataset.procedureId,
      runnable: card.dataset.procedureRunnable,
      latest: card.dataset.procedureLatestState,
      title: card.querySelector('h4')?.textContent ?? null,
      pill: card.querySelector('.captured-procedure-latest .status-pill')?.textContent ?? null,
      pillBorder: border(card.querySelector('.captured-procedure-latest .status-pill')),
      versions: Array.from(card.querySelectorAll('li.captured-procedure-version'), (item) => ({
        version: item.dataset.version, state: item.dataset.versionState,
        pill: item.querySelector('.status-pill')?.textContent ?? null, pillBorder: border(item.querySelector('.status-pill')),
        steps: Array.from(item.querySelectorAll('.captured-procedure-steps li'), (step) => step.textContent),
        source: item.querySelector('.captured-procedure-source')?.textContent ?? null,
        runs: item.querySelector('.captured-procedure-runs')?.textContent ?? null,
        validation: item.querySelector('.captured-procedure-validation')?.dataset.validationPasses ?? null,
        guidelines: Array.from(item.querySelectorAll('.captured-procedure-guideline'), (line) => line.textContent),
        actions: Array.from(item.querySelectorAll('.captured-procedure-version-actions [data-procedure-action]'), (button) => button.dataset.procedureAction),
        latestEligible: item.dataset.latestEligible ?? null,
        eligiblePill: item.querySelector('.captured-procedure-latest-eligible')?.textContent ?? null,
        runLinks: Array.from(item.querySelectorAll('button.captured-procedure-run-link'), (link) => [link.dataset.reviewRunId, link.textContent]),
        stop: readStop(item.querySelector(':scope > .captured-procedure-stop')),
      })),
      stopAll: readStop(card.querySelector(':scope > .captured-procedure-stop')),
      run: card.querySelector('[data-procedure-action="run"]') instanceof HTMLButtonElement,
    })),
    proposals: Array.from(proposals.querySelectorAll('article.developer-proposal'), (card) => ({
      title: card.querySelector('h4')?.textContent ?? null,
      versionCount: card.dataset.proposalVersions ?? null,
      versions: Array.from(card.querySelectorAll('li.developer-proposal-version'), (item) => [item.dataset.proposalVersion, item.dataset.proposalFiles]),
    })),
  };
})()`;
const readProcedures = (renderer, predicate, name) => readUntil(renderer, READ_PROCEDURES, predicate, name);

/** The 新建审阅 sheet's procedure field as an editor reads it (Issue #66, S31): the exact version, its choices, what is ticked. */
const READ_SHEET_PROCEDURE = `(() => {
  const sheet = document.querySelector('dialog.review-sheet');
  const field = sheet?.querySelector('.review-sheet-procedure');
  if (!(field instanceof HTMLElement)) return null;
  const select = field.querySelector('[data-review-field="procedure-version"]');
  return {
    version: field.dataset.procedureVersion ?? null,
    latestEligible: field.dataset.procedureLatestEligible ?? null,
    options: select instanceof HTMLSelectElement ? Array.from(select.options, (option) => option.textContent) : [],
    chosen: select instanceof HTMLSelectElement ? select.selectedIndex : null,
    versionDisabled: select instanceof HTMLSelectElement ? select.disabled : null,
    checked: Array.from(sheet.querySelectorAll('input[name="review-category"]:checked'), (input) => input.value),
    lines: Array.from(field.querySelectorAll('.review-sheet-procedure-line'), (line) => line.textContent),
  };
})()`;

/** 知识库 › 工序与规则 from 书库. */
async function openProcedures(renderer, name) {
  await click(renderer, '知识库', `${name}-knowledge`);
  await waitFor(renderer, `document.querySelector('.review-guidelines')?.dataset.guidelines==='ready'`, `${name}-knowledge-ready`);
  await click(renderer, '工序与规则', `${name}-rules`);
  await waitFor(renderer, `document.querySelector('.knowledge-captured-procedures')`, `${name}-rules-ready`);
}

async function activateFocused(renderer, key) {
  const descriptor = key === 'Enter'
    ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: process.platform === 'darwin' ? 36 : 13, text: '\r', unmodifiedText: '\r' }
    : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: process.platform === 'darwin' ? 49 : 32, text: ' ', unmodifiedText: ' ' };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor });
  const { text: _text, unmodifiedText: _unmodifiedText, ...released } = descriptor;
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...released });
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
  let dataRoot;
  let electronExecutableForCleanup;
  let cleanupPromise;
  let finalCleanupRequested = false;
  // 书系一致性's Review Run needs a Main Editorial Role connection (Issue #64, S29a), so J-13 owns the one synthetic credential
  // and its cleanup as J-11 does: through the product while it answers, and directly by its reference as the last resort.
  let credentialRenderer;
  let credentialMutationReached = false;
  let credentialRemoved = false;
  let credentialReferenceForCleanup;
  let syntheticSecret;
  const closeBrowser = async () => {
    let owned = browser;
    if (owned === undefined && browserAcquisition !== undefined) owned = await browserAcquisition.catch(() => undefined);
    if (owned !== undefined) await owned.close();
    browser = undefined;
    browserAcquisition = undefined;
  };
  const READ_CONNECTION = `window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`;
  const removeCredentialThroughProduct = async () => {
    if (credentialRenderer === undefined || browser === undefined || !browser.isConnected()) return;
    const state = await credentialRenderer.evaluate(READ_CONNECTION);
    if (UUID_PATTERN.test(state?.credentialReference ?? '')) credentialReferenceForCleanup = state.credentialReference;
    if (state === null || state.credentialOperationState === 'missing') {
      credentialRemoved = true;
      return;
    }
    await credentialRenderer.evaluate(`window.ai7.removeModelServiceCredential()`);
    const after = await credentialRenderer.evaluate(READ_CONNECTION);
    credentialRemoved = after === null || after.credentialOperationState === 'missing';
  };
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      let failure;
      if (credentialMutationReached && !credentialRemoved) {
        try { await removeCredentialThroughProduct(); } catch (error) { failure ??= error; }
      }
      await closeBrowser();
      if (credentialMutationReached && !credentialRemoved) {
        try {
          if (credentialReferenceForCleanup === undefined && dataRoot !== undefined && runRoot !== undefined) {
            const recovered = await recoverSyntheticCredentialCleanupState('J-13', dataRoot, runRoot);
            if (recovered.kind === 'not-started' || recovered.kind === 'removed') credentialRemoved = true;
            else credentialReferenceForCleanup = recovered.credentialReference;
          }
          if (!credentialRemoved && credentialReferenceForCleanup !== undefined) {
            requireJourney(electronExecutableForCleanup !== undefined, 'credential-direct-cleanup-executable');
            await removeSyntheticCredentialWithElectron('J-13', electronExecutableForCleanup, productEnvironment(electronExecutableForCleanup), credentialReferenceForCleanup);
            credentialRemoved = true;
          }
        } catch (error) {
          failure ??= error;
        }
      }
      const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
      await ownedLoopback?.close().catch(() => undefined);
      loopback = undefined;
      if (credentialMutationReached && !credentialRemoved) throw failure ?? journeyCheckFailure('J-13', 'credential-cleanup-failed');
      const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
      if (ownedRoot !== undefined) {
        if (syntheticSecret !== undefined && dataRoot !== undefined) {
          try { await assertSecretsAbsentFromDataRoot('J-13', dataRoot, [syntheticSecret]); } catch (error) { failure ??= error; }
        }
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j13-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
        await rm(ownedRoot, { recursive: true, force: true });
        runRoot = undefined;
      }
      if (failure !== undefined) throw failure;
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j13-e2e-'));
    runRoot = await runRootAcquisition;
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j13-e2e-'), 'temp-root');
    dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    const sample1Bytes = await readFile(SAMPLE1_PATH);
    const sample1 = { sha256: createHash('sha256').update(sample1Bytes).digest('hex'), bytes: sample1Bytes.length };
    requireJourney(sample1.sha256 === 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483' && sample1.bytes === 29_550, 'exact-sample1');
    // A 书系一致性 Run's first reading range is held through this file while an exclusion is recorded (Issue #64, S29b); absent,
    // it holds nothing, so every other launch runs as before.
    const holdPath = resolve(runRoot, 'j13-unit-hold.txt');
    // `fixture` is the authored fixture the J-04 adapter answers from, and `extra` the capture branch's Save dialog answer (Issue #65).
    const launch = async (fixture = FIXTURE_IDENTITY, extra = []) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
        // J-13's picker imports the member Book whose words become a Series Knowledge Candidate (Issue #63, S28b).
        '--j13-picker-path', SAMPLE1_PATH,
        // Its 书系一致性 Review Run executes on the J-04 model adapter (Issue #64, S29a).
        '--j04-model-adapter', fixture,
        '--j10-unit-hold-path', holdPath,
        ...extra,
      ];
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      cancellation.throwIfRequested();
      browserAcquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browser = await browserAcquisition;
      attachProductOutput('J-13', browser, 'launch');
      cancellation.throwIfRequested();
      return createRendererManager(browser);
    };

    at('empty-books');
    // Three empty Books; each 工作概览 says its Book is in no Series.
    let manager = await launch();
    let renderer = await waitForRenderer(manager, 'initial-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'initial-ready');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
    await renderer.send('Page.setBypassCSP', { enabled: false });
    requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'offline-product');
    const first = await createEmptyBook(renderer, FIRST, 'book-1');
    const firstNone = await readBookSeries(renderer, (side) => side.bookId === first, 'first-overview-series');
    requireJourney(firstNone.none === '不在任何书系中。' && firstNone.memberships.length === 0 && firstNone.summary === null, 'first-in-no-series', firstNone);
    await backToLibrary(renderer, 'first');
    const second = await createEmptyBook(renderer, SECOND, 'book-2');
    await backToLibrary(renderer, 'second');
    const outside = await createEmptyBook(renderer, OUTSIDE, 'book-3');
    await backToLibrary(renderer, 'outside');

    at('series-empty');
    // 书系 is one of the landing's destinations; before any Series it says so and offers 新建书系….
    await click(renderer, '书系', 'series-destination');
    const empty = await readSeriesList(renderer, () => true, 'series-empty-page');
    requireJourney(empty.lede === SERIES_LEDE && empty.empty === '还没有书系。' && empty.items.length === 0 && !empty.form, 'series-empty-words', empty);
    requireJourney(JSON.stringify(await renderer.evaluate('window.ai7.inspectSeriesList()')) === JSON.stringify({ series: [], nextCursor: null }), 'series-empty-service');

    at('series-create');
    // 新建书系: the form opens at its name with the action unavailable until there is one; a name past its bound is refused in
    // place; the Series is then created, listed with no member, and takes focus.
    await clickSelector(renderer, '[data-series-action="create-open"]', 'series-create-open');
    const form = await readSeriesList(renderer, (page) => page.form && page.focus === 'series-title', 'series-create-form');
    requireJourney(form.createDisabled === true, 'series-create-waits', form);
    await fill(renderer, '#series-title', '星'.repeat(41), 'series-title-too-long');
    await clickSelector(renderer, '[data-series-action="create"]', 'series-create-too-long');
    const tooLong = await readSeriesList(renderer, (page) => page.refusal !== null, 'series-title-refused');
    requireJourney(tooLong.refusal === '书系名称要 1–40 个字，写在一行里。' && tooLong.focus === 'series-title' && tooLong.items.length === 0, 'series-title-refused-words', tooLong);
    await fill(renderer, '#series-title', SERIES, 'series-title');
    await fill(renderer, '#series-note', NOTE, 'series-note');
    await clickSelector(renderer, '[data-series-action="create"]', 'series-create');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已新建书系「${SERIES}」`)}`, 'series-created-status');
    const created = await readSeriesList(renderer, (page) => page.items.length === 1 && !page.form, 'series-created');
    const seriesId = created.items[0][0];
    requireJourney(UUID_PATTERN.test(seriesId ?? '') && created.items[0][1] === `书系「${SERIES}」 · 成员 0 本` && created.items[0][2] === NOTE && created.focus === 'open', 'series-created-words', created);
    const listed = await renderer.evaluate('window.ai7.inspectSeriesList().then((answer) => answer.series.map((entry) => [entry.seriesId, entry.title, entry.note, entry.memberCount]))');
    requireJourney(JSON.stringify(listed) === JSON.stringify([[seriesId, SERIES, NOTE, 0]]), 'series-created-service', listed);

    at('series-open');
    // 成员与共享范围: what membership means, no member yet, 加入书系… and no change recorded.
    await clickSelector(renderer, `[data-series-id="${seriesId}"] [data-series-action="open"]`, 'series-open-entry');
    const page = await readSeries(renderer, (read) => read.seriesId === seriesId, 'series-page');
    requireJourney(page.heading === `书系「${SERIES}」` && page.note === NOTE && page.scopeNote === SCOPE_NOTE && page.membersEmpty === '书系里还没有图书。' &&
      page.members.length === 0 && page.addOpen === true && page.historyEmpty === '还没有成员变更。' && page.history.length === 0 && page.preview === null, 'series-page-words', page);

    at('membership-add-preview');
    // 加入书系…: every Book offered and none chosen; 查看影响 shows the exact Book and Series, then the four groups in their
    // order, what changes and what stays, and exactly `加入书系` to commit. Nothing is recorded by looking.
    await clickSelector(renderer, '[data-series-action="add-open"]', 'add-open');
    const chooser = await readSeries(renderer, (read) => read.chooser !== null && read.focus === 'series-add-book', 'add-chooser');
    requireJourney(JSON.stringify(chooser.chooser) === JSON.stringify([[outside, false, `《${OUTSIDE}》`], [first, false, `《${FIRST}》`], [second, false, `《${SECOND}》`]]) &&
      chooser.lookDisabled === true && chooser.addOpen === false, 'add-chooser-words', chooser);
    await clickSelector(renderer, `input[name="series-add-book"][value="${first}"]`, 'add-choose-first');
    await clickSelector(renderer, '[data-series-action="preview"]', 'add-preview');
    const preview = await readSeries(renderer, (read) => read.preview?.heading !== null && read.preview?.heading !== undefined && read.focus === 'preview-heading', 'add-preview-shown');
    requireJourney(preview.chooser === null && preview.preview.kind === 'add' && preview.preview.bookId === first && preview.preview.heading === '加入书系的影响' &&
      preview.preview.identity === `图书《${FIRST}》 · 书系「${SERIES}」` &&
      JSON.stringify(preview.preview.groups.map(([key, title]) => [key, title])) === JSON.stringify(GROUPS) &&
      JSON.stringify(preview.preview.groups[0][2]) === JSON.stringify([`以后新建任务时，可以明确选用书系「${SERIES}」的范围，其中会包括《${FIRST}》。`]) &&
      preview.preview.groups[1][2].length === 0 && preview.preview.groups[1][3][0] === `现在没有使用书系「${SERIES}」范围、已授权或正在运行的任务。` &&
      preview.preview.groups[2][2].length === 0 && preview.preview.groups[2][3][0] === `《${FIRST}》还没有学习材料。` &&
      JSON.stringify(preview.preview.groups[3][2]) === JSON.stringify(['追加一条书系成员变更记录，书系和图书两边都能查看。']) &&
      JSON.stringify(preview.preview.actions) === JSON.stringify([['commit', '加入书系'], ['preview-cancel', '取消']]), 'add-preview-words', preview);
    const nothingYet = await renderer.evaluate(`window.ai7.inspectSeries({ seriesId: ${JSON.stringify(seriesId)} }).then((answer) => [answer.members.length, answer.history.length])`);
    requireJourney(JSON.stringify(nothingYet) === JSON.stringify([0, 0]), 'add-preview-recorded-nothing', nothingYet);

    at('membership-added');
    // 加入书系: the member row with its people, when it joined and 尚未审阅, focus on its 移出书系…, and one record that keeps
    // the four groups it showed; the service and the Book's own side agree.
    await clickSelector(renderer, '[data-series-action="commit"]', 'add-commit');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已加入书系「${SERIES}」：《${FIRST}》`)}`, 'added-status');
    const added = await readSeries(renderer, (read) => read.members.length === 1 && read.preview === null, 'added');
    requireJourney(JSON.stringify(added.columns) === JSON.stringify(['图书', '作者', '责编', '加入时间', '书系一致性审阅', '操作']) &&
      added.members[0][0] === first && added.members[0][1] === `《${FIRST}》` && added.members[0][2] === '未填写' && added.members[0][3] === '未填写' &&
      added.members[0][4].length > 0 && added.members[0][5] === `尚未审阅 · 暂不能审阅：${NO_KNOWLEDGE}` && added.members[0][6] === '移出书系…' && added.focus === 'remove-open' &&
      JSON.stringify(added.history) === JSON.stringify([['add', first, `加入书系 · 《${FIRST}》`, 4]]), 'added-words', added);
    const addedService = await renderer.evaluate(`Promise.all([window.ai7.inspectSeries({ seriesId: ${JSON.stringify(seriesId)} }), window.ai7.inspectBookSeries({ bookId: ${JSON.stringify(first)} })])
      .then(([series, side]) => [series.members.map((member) => member.bookId), series.history.map((change) => [change.kind, change.bookId, change.priorMember, change.newMember, change.impact.length]),
        side.memberships.map((membership) => membership.seriesId), side.history.length])`);
    requireJourney(JSON.stringify(addedService) === JSON.stringify([[first], [['add', first, false, true, 4]], [seriesId], 1]), 'added-service', addedService);

    at('membership-stale-preview');
    // The same membership changes elsewhere while the editor reads a preview — 星河之二 added and removed again. The preview's
    // 加入书系 is refused and withdrawn, 重新查看影响 reads it again, and only then does 加入书系 go through.
    await clickSelector(renderer, '[data-series-action="add-open"]', 'stale-add-open');
    // The chooser reads its Books when it opens (Issue #63 review): wait for them, not only for the chooser.
    const remaining = await readSeries(renderer, (read) => read.chooser !== null && read.chooser.length === 2, 'stale-chooser');
    requireJourney(JSON.stringify(remaining.chooser) === JSON.stringify([[outside, false, `《${OUTSIDE}》`], [second, false, `《${SECOND}》`]]), 'stale-chooser-words', remaining);
    await clickSelector(renderer, `input[name="series-add-book"][value="${second}"]`, 'stale-choose-second');
    await clickSelector(renderer, '[data-series-action="preview"]', 'stale-preview');
    await readSeries(renderer, (read) => read.preview?.bookId === second && read.preview.heading !== null, 'stale-preview-shown');
    const elsewhere = await renderer.evaluate(`(async () => {
      const seriesId = ${JSON.stringify(seriesId)};
      const bookId = ${JSON.stringify(second)};
      const add = await window.ai7.previewSeriesMembershipChange({ seriesId, bookId, kind: 'add' });
      await window.ai7.changeSeriesMembership({ seriesId, bookId, kind: 'add', previewDigest: add.previewDigest });
      const remove = await window.ai7.previewSeriesMembershipChange({ seriesId, bookId, kind: 'remove' });
      await window.ai7.changeSeriesMembership({ seriesId, bookId, kind: 'remove', previewDigest: remove.previewDigest });
      // A change answers with its record alone (Issue #63 review): the Series is read again for its records.
      return (await window.ai7.inspectSeries({ seriesId })).history.length;
    })()`);
    requireJourney(elsewhere === 3, 'stale-elsewhere', elsewhere);
    await clickSelector(renderer, '[data-series-action="commit"]', 'stale-commit');
    const stale = await readSeries(renderer, (read) => read.refusal !== null, 'stale-refused');
    requireJourney(stale.refusal === STALE && stale.focus === 'refresh' && stale.preview?.heading === null && stale.preview.groups.length === 0 &&
      JSON.stringify(stale.preview.actions) === JSON.stringify([['refresh', '重新查看影响'], ['preview-cancel', '取消']]) &&
      JSON.stringify(stale.members.map(([id]) => id)) === JSON.stringify([first]) && stale.history.length === 3, 'stale-refused-words', stale);
    await clickSelector(renderer, '[data-series-action="refresh"]', 'stale-refresh');
    const refreshed = await readSeries(renderer, (read) => read.preview?.heading === '加入书系的影响' && read.refusal === null, 'stale-refreshed');
    requireJourney(refreshed.preview.bookId === second && refreshed.focus === 'preview-heading' &&
      JSON.stringify(refreshed.preview.actions) === JSON.stringify([['commit', '加入书系'], ['preview-cancel', '取消']]), 'stale-refreshed-words', refreshed);
    await clickSelector(renderer, '[data-series-action="commit"]', 'stale-commit-again');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已加入书系「${SERIES}」：《${SECOND}》`)}`, 'stale-added-status');
    const both = await readSeries(renderer, (read) => read.members.length === 2 && read.preview === null, 'stale-added');
    // Members newest joined first (Issue #63 review): the Book just added heads the table.
    requireJourney(JSON.stringify(both.members.map(([id]) => id)) === JSON.stringify([second, first]) &&
      JSON.stringify(both.history.map(([kind, bookId]) => [kind, bookId])) === JSON.stringify([['add', second], ['remove', second], ['add', second], ['add', first]]),
    'stale-added-words', both);

    at('library-by-series');
    // 书库 finds the Books now in the Series by its name, and not the Book outside it.
    await leaveSeries(renderer, 'library');
    await choose(renderer, '#book-filter-field', 'series', 'library-field');
    await fill(renderer, '#book-filter-text', SERIES, 'library-text');
    await clickSelector(renderer, '[data-book-filter-action="find"]', 'library-find');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work')?.dataset.bookFilter === 'series' && ${status} === '已列出找到的图书'`, 'library-found');
    const found = await renderer.evaluate(`[document.querySelector('.book-filter-line')?.textContent ?? null, Array.from(document.querySelectorAll('[data-screen="landing"] article.book-summary-item button[data-book-id]'), (button) => button.dataset.bookId)]`);
    requireJourney(JSON.stringify(found) === JSON.stringify([`按书系查找「${SERIES}」`, [first, second]]), 'library-found-words', found);
    await clickSelector(renderer, '[data-book-filter-action="clear"]', 'library-clear');
    await waitFor(renderer, `document.querySelectorAll('[data-screen="landing"] article.book-summary-item').length === 3`, 'library-cleared');

    at('book-series-records');
    // Each Book's 工作概览 lists the Series it is in and its own membership records, newest first.
    const firstSide = await bookSide(renderer, first, 'first-side');
    requireJourney(firstSide.none === null && firstSide.memberships.length === 1 && firstSide.memberships[0][0] === seriesId &&
      firstSide.memberships[0][1].startsWith(`书系「${SERIES}」 · `) && firstSide.memberships[0][1].endsWith(' 加入') &&
      firstSide.summary === '书系成员变更记录（1）' && JSON.stringify(firstSide.history) === JSON.stringify([['add', `加入书系「${SERIES}」`]]), 'first-side-words', firstSide);
    await backToLibrary(renderer, 'first-side');
    const secondSide = await bookSide(renderer, second, 'second-side');
    requireJourney(secondSide.memberships.length === 1 && secondSide.summary === '书系成员变更记录（3）' &&
      JSON.stringify(secondSide.history) === JSON.stringify([['add', `加入书系「${SERIES}」`], ['remove', `移出书系「${SERIES}」`], ['add', `加入书系「${SERIES}」`]]), 'second-side-words', secondSide);
    await backToLibrary(renderer, 'second-side');
    const outsideSide = await bookSide(renderer, outside, 'outside-side');
    requireJourney(outsideSide.none === '不在任何书系中。' && outsideSide.summary === null, 'outside-side-words', outsideSide);
    await backToLibrary(renderer, 'outside-side');

    at('membership-remove');
    // 移出书系… from the member's row: its own preview, prospective, then exactly `移出书系`; focus returns to 加入书系….
    await openSeries(renderer, seriesId, 'remove-series');
    await clickSelector(renderer, `tr[data-book-id="${first}"] [data-series-action="remove-open"]`, 'remove-open');
    const leave = await readSeries(renderer, (read) => read.preview?.kind === 'remove' && read.focus === 'preview-heading', 'remove-preview');
    requireJourney(leave.preview.heading === '移出书系的影响' && leave.preview.identity === `图书《${FIRST}》 · 书系「${SERIES}」` &&
      JSON.stringify(leave.preview.groups.map(([key, title]) => [key, title])) === JSON.stringify(GROUPS) &&
      JSON.stringify(leave.preview.groups[0][2]) === JSON.stringify([`以后新建任务时，书系「${SERIES}」的范围不再包括《${FIRST}》。`]) &&
      leave.preview.groups[1][3].includes('已经冻结的任务范围不会因移出而改变，任务也不会被取消。') &&
      JSON.stringify(leave.preview.actions) === JSON.stringify([['commit', '移出书系'], ['preview-cancel', '取消']]), 'remove-preview-words', leave);
    await clickSelector(renderer, '[data-series-action="commit"]', 'remove-commit');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已移出书系「${SERIES}」：《${FIRST}》`)}`, 'removed-status');
    const removed = await readSeries(renderer, (read) => read.members.length === 1 && read.preview === null, 'removed');
    requireJourney(removed.members[0][0] === second && removed.focus === 'add-open' && removed.history.length === 5 &&
      JSON.stringify(removed.history[0]) === JSON.stringify(['remove', first, `移出书系 · 《${FIRST}》`, 4]), 'removed-words', removed);
    await click(renderer, '返回书系', 'removed-list');
    const count = await readSeriesList(renderer, (list) => list.items.length === 1 && list.focus === 'open', 'removed-listed');
    requireJourney(count.items[0][1] === `书系「${SERIES}」 · 成员 1 本`, 'removed-count', count);

    at('series-restart');
    // After a restart the Series, its member and its five records read as before, and 星河之一 is in no Series with both records.
    await closeBrowser();
    manager = await launch();
    renderer = await waitForRenderer(manager, 'restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, 'restart-ready');
    const after = await openSeries(renderer, seriesId, 'restart-series');
    requireJourney(JSON.stringify(after.members.map(([id]) => id)) === JSON.stringify([second]) &&
      JSON.stringify(after.history.map(([kind, bookId]) => [kind, bookId])) === JSON.stringify([['remove', first], ['add', second], ['remove', second], ['add', second], ['add', first]]),
    'restart-series-words', after);
    await leaveSeries(renderer, 'restart-series');
    const firstAfter = await bookSide(renderer, first, 'restart-first');
    requireJourney(firstAfter.none === '不在任何书系中。' && firstAfter.summary === '书系成员变更记录（2）' &&
      JSON.stringify(firstAfter.history.map(([kind]) => kind)) === JSON.stringify(['remove', 'add']), 'restart-first-words', firstAfter);
    await backToLibrary(renderer, 'restart-first');

    at('j14-series-keyboard');
    // Without a pointer: Enter on 加入书系… opens the chooser at its first Book, an arrow chooses the next, Tab reaches 查看影响,
    // Enter shows the preview with focus on its heading, and Escape closes it — and the chooser — with focus back on the opener
    // and nothing recorded.
    await openSeries(renderer, seriesId, 'keyboard-series');
    await assertRenderer(renderer, `(() => { const open=document.querySelector('[data-series-action="add-open"]'); if(!(open instanceof HTMLButtonElement)||open.disabled)return false; open.focus(); return document.activeElement===open; })()`, 'keyboard-opener');
    await press(renderer, 'Enter');
    const keyboardChooser = await readSeries(renderer, (read) => read.chooser !== null && read.focus === 'series-add-book', 'keyboard-chooser');
    requireJourney(JSON.stringify(keyboardChooser.chooser.map(([id, checked]) => [id, checked])) === JSON.stringify([[outside, false], [first, false]]), 'keyboard-chooser-words', keyboardChooser);
    await press(renderer, 'Escape');
    await readSeries(renderer, (read) => read.chooser === null && read.focus === 'add-open', 'keyboard-chooser-escaped');
    await press(renderer, 'Enter');
    await readSeries(renderer, (read) => read.chooser !== null && read.focus === 'series-add-book', 'keyboard-chooser-again');
    await press(renderer, 'ArrowDown');
    await readSeries(renderer, (read) => JSON.stringify(read.chooser?.map(([id, checked]) => [id, checked])) === JSON.stringify([[outside, false], [first, true]]) && read.lookDisabled === false, 'keyboard-arrow-chooses');
    await press(renderer, 'Tab');
    await waitFor(renderer, `document.activeElement?.dataset.seriesAction === 'preview' && document.activeElement.matches(':focus-visible')`, 'keyboard-preview-reached', 10_000);
    await press(renderer, 'Enter');
    await readSeries(renderer, (read) => read.preview?.bookId === first && read.focus === 'preview-heading', 'keyboard-preview-shown');
    await press(renderer, 'Escape');
    const escaped = await readSeries(renderer, (read) => read.preview === null && read.chooser === null && read.focus === 'add-open', 'keyboard-preview-escaped');
    requireJourney(escaped.history.length === 5 && escaped.members.length === 1, 'keyboard-recorded-nothing', escaped);

    at('j14-series-reflow-forced-colors');
    // At 200% the member table stacks and the preview's groups wrap within the width; under forced colours the preview keeps
    // its border.
    await clickSelector(renderer, `tr[data-book-id="${second}"] [data-series-action="remove-open"]`, 'reflow-preview-open');
    await readSeries(renderer, (read) => read.preview?.kind === 'remove' && read.preview.heading !== null, 'reflow-preview');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[document.querySelector('.series-preview'), document.querySelector('table.series-member-table'), document.querySelector('ol.series-history')]; return parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2 && getComputedStyle(document.querySelector('table.series-member-table tbody tr')).display==='block'; })()`, 'series-reflow', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const preview = document.querySelector('.series-preview');
      return preview instanceof HTMLElement && getComputedStyle(preview).borderTopStyle === 'solid';
    })()`, 'series-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await clickSelector(renderer, '[data-series-action="preview-cancel"]', 'reflow-cancel');
    const cancelled = await readSeries(renderer, (read) => read.preview === null && read.focus === 'remove-open', 'reflow-cancelled');
    requireJourney(cancelled.members.length === 1 && cancelled.history.length === 5, 'reflow-recorded-nothing', cancelled);

    at('knowledge-member-book');
    // A fourth Book from exact sample1 through the product's own import, then 加入书系 for it like the others.
    await leaveSeries(renderer, 'knowledge-leave');
    const member = await importSample1(renderer, MEMBER, sample1, 'knowledge-import');
    await click(renderer, '返回图书列表', 'knowledge-import-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, 'knowledge-import-library');
    await openSeries(renderer, seriesId, 'knowledge-series');
    await clickSelector(renderer, '[data-series-action="add-open"]', 'knowledge-add-open');
    await readSeries(renderer, (read) => read.chooser?.some(([id]) => id === member), 'knowledge-add-chooser');
    await clickSelector(renderer, `input[name="series-add-book"][value="${member}"]`, 'knowledge-add-choose');
    await clickSelector(renderer, '[data-series-action="preview"]', 'knowledge-add-preview');
    await readSeries(renderer, (read) => read.preview?.bookId === member && read.preview.heading !== null, 'knowledge-add-preview-shown');
    await clickSelector(renderer, '[data-series-action="commit"]', 'knowledge-add-commit');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已加入书系「${SERIES}」：《${MEMBER}》`)}`, 'knowledge-added');
    const noKnowledge = await readKnowledge(renderer, () => true, 'knowledge-empty');
    requireJourney(noKnowledge.note === KNOWLEDGE_NOTE && noKnowledge.itemsEmpty === '还没有书系知识。' && noKnowledge.candidatesEmpty === '没有待审阅的候选项。' &&
      noKnowledge.form === null && noKnowledge.review === null, 'knowledge-empty-words', noKnowledge);

    at('knowledge-from-manuscript');
    // In the member Book's manuscript the selection menu offers its Series: the composer quotes the selected words, asks for
    // the item's name and class with none chosen, and keeps the words as the content until the editor changes them.
    await leaveSeries(renderer, 'knowledge-manuscript');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(member)}]`, 'knowledge-open-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(member)}]') && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')`, 'knowledge-editor', 120_000);
    await assertRenderer(renderer, MARK_HELPERS, 'knowledge-mark-helpers');
    // A paragraph whose first 40 code units are 40 graphemes, so a range by offset is a range of characters.
    const blockId = await renderer.evaluate(`(() => { const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }); return Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > p[data-block-id]')).find((node) => { const head = (node.textContent ?? '').slice(0, 40); return head.length === 40 && Array.from(segmenter.segment(head)).length === 40; })?.dataset.blockId ?? null; })()`);
    requireJourney(/^blk_[0-9a-f]{24}$/.test(blockId ?? ''), 'knowledge-markable-paragraph');
    const quote = await renderer.evaluate(`(window.__j13.block(${JSON.stringify(blockId)})?.textContent ?? '').slice(2, 8)`);
    await openSelectionMenu(renderer, blockId, 2, 8, 'knowledge-menu');
    // The menu has its 书系 group once the editor's first read of the Book's Series answers, and is drawn again then
    // (Issue #642): wait for it rather than read the menu once.
    await waitFor(renderer, `(() => { const menu = window.__j13.menu(); if (!(menu instanceof HTMLElement)) return false; const groups = Array.from(menu.querySelectorAll('[role="group"]'), (group) => group.getAttribute('aria-label')); const item = window.__j13.item('propose-series-knowledge'); return groups.at(-1) === '书系' && item instanceof HTMLButtonElement && !item.disabled && item.textContent === ${JSON.stringify(`提议为书系「${SERIES}」的知识…`)}; })()`, 'knowledge-menu-words', 15_000);
    await assertRenderer(renderer, `(() => { const item = window.__j13.item('propose-series-knowledge'); if (!(item instanceof HTMLButtonElement) || item.disabled) return false; item.click(); return true; })()`, 'knowledge-menu-choose');
    await waitFor(renderer, `window.__j13.composer()?.dataset.markComposer === 'propose-series-knowledge'`, 'knowledge-composer');
    const composer = await renderer.evaluate(`(() => { const box = window.__j13.composer(); const field = (name) => box.querySelector('[data-mark-field="' + name + '"]'); return [box.querySelector('[data-mark-quote]')?.textContent ?? null, field('subject')?.value ?? null, field('knowledgeClass')?.value ?? null, Array.from(field('knowledgeClass')?.options ?? [], (option) => option.textContent), field('body')?.value ?? null]; })()`);
    requireJourney(composer[0] === quote && composer[1] === '' && composer[2] === '' && JSON.stringify(composer[3]) === JSON.stringify(['请选择', '正典设定', '人物', '地点', '时间线', '术语', '连续性规则', '共同文风', '定位']) && composer[4] === quote,
      'knowledge-composer-words', composer);
    await assertRenderer(renderer, `window.__j13.write('subject', ${JSON.stringify(PLACE)}) && window.__j13.write('knowledgeClass', 'places') && window.__j13.act('submit')`, 'knowledge-composer-submit');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已提议为书系「${SERIES}」的知识候选项`)} && window.__j13.composer() === null`, 'knowledge-proposed');

    at('knowledge-editor-authored');
    // On the Series page the candidate waits with where it came from; the editor's own candidate for the same name — however
    // it is spaced — discloses a conflict on both.
    // The manuscript leaves for 书库 through the header's 待我处理, as J-07 does.
    await clickSelector(renderer, '#global-attention-entry', 'knowledge-editor-attention');
    await waitFor(renderer, `document.querySelector('[data-screen="global-attention"]')`, 'knowledge-editor-attention-screen');
    await click(renderer, '返回图书列表', 'knowledge-editor-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, 'knowledge-editor-library');
    await openSeries(renderer, seriesId, 'knowledge-candidates');
    const waiting = await readKnowledge(renderer, (read) => read.candidates.length === 1, 'knowledge-candidate-listed');
    requireJourney(waiting.candidates[0][1] === 'manuscript-revision' && waiting.candidates[0][2] === `新条目「${PLACE}」（地点）` &&
      waiting.candidates[0][3] === `来自《${MEMBER}》r1 的原文：「${quote}」` && waiting.candidates[0][4] === false, 'knowledge-candidate-words', waiting);
    await clickSelector(renderer, '[data-knowledge-action="propose-open"]', 'knowledge-propose-open');
    const proposeForm = await readKnowledge(renderer, (read) => read.form !== null && read.focus === 'knowledge-target', 'knowledge-propose-form');
    requireJourney(JSON.stringify(proposeForm.form.targets) === JSON.stringify([['new', false, '新条目']]) && proposeForm.form.subject === false, 'knowledge-propose-form-words', proposeForm);
    await clickSelector(renderer, 'form.knowledge-form-propose input[name="knowledge-target"][value="new"]', 'knowledge-propose-new');
    await readKnowledge(renderer, (read) => read.form?.subject === true, 'knowledge-propose-new-fields');
    await fill(renderer, '#knowledge-subject-propose', '海边 小城', 'knowledge-propose-subject');
    await choose(renderer, '#knowledge-class-propose', 'places', 'knowledge-propose-class');
    await fill(renderer, '#knowledge-content-propose', EDITOR_WORDS, 'knowledge-propose-content');
    await clickSelector(renderer, '[data-knowledge-action="propose"]', 'knowledge-propose');
    await waitFor(renderer, `${status} === ${JSON.stringify(`已提议为书系「${SERIES}」的知识候选项`)}`, 'knowledge-proposed-again');
    const twoCandidates = await readKnowledge(renderer, (read) => read.candidates.length === 2 && read.form === null, 'knowledge-two-candidates');
    requireJourney(twoCandidates.candidates.every((candidate) => candidate[4] === true) && twoCandidates.candidates[1][1] === 'editor' && twoCandidates.candidates[1][3] === '编辑撰写' && twoCandidates.focus === 'review',
      'knowledge-two-candidates-words', twoCandidates);
    const [fromManuscript, fromEditor] = twoCandidates.candidates.map(([id]) => id);

    at('knowledge-review-conflict');
    // 书系知识纳入审阅 names the exact Series and item, discloses the other candidate, offers the three choices and the two uses
    // none chosen, and keeps 纳入书系知识 unavailable, saying why, until the conflict is kept explicitly.
    await clickSelector(renderer, `[data-candidate-id="${fromManuscript}"] [data-knowledge-action="review"]`, 'knowledge-review-open');
    const review = await readKnowledge(renderer, (read) => read.review?.identity !== null && read.review?.identity !== undefined && read.focus === 'review-heading', 'knowledge-review');
    requireJourney(review.review.identity === `书系「${SERIES}」 · 新条目「${PLACE}」（地点）` && review.review.provenance === `来自《${MEMBER}》r1 的原文：「${quote}」` &&
      review.review.superseded === null && review.review.conflictLabel === '存在书系知识冲突 · 需要处理' &&
      JSON.stringify(review.review.conflicts) === JSON.stringify([['competing-candidate', '另一个候选项也在提议「海边 小城」（第 1 版）。']]) &&
      JSON.stringify(review.review.dispositions) === JSON.stringify([['edit', '编辑候选项', null], ['preserve', '保留已披露冲突', 'false'], ['review-cancel', '取消', null]]) &&
      JSON.stringify(review.review.reuse) === JSON.stringify([['series-tasks', false], ['consistency-review', false]]) &&
      JSON.stringify(review.review.promote) === JSON.stringify(['纳入书系知识', true]) && review.review.waits === '先处理已披露的冲突：编辑候选项，或选择保留已披露冲突。',
    'knowledge-review-words', review);
    await clickSelector(renderer, 'input[name="knowledge-reuse"][value="consistency-review"]', 'knowledge-reuse');
    const stillWaits = await readKnowledge(renderer, (read) => read.review?.reuse.some(([scope, checked]) => scope === 'consistency-review' && checked), 'knowledge-reuse-chosen');
    requireJourney(stillWaits.review.promote[1] === true, 'knowledge-still-waits', stillWaits);
    await clickSelector(renderer, '[data-knowledge-action="preserve"]', 'knowledge-preserve');
    const kept = await readKnowledge(renderer, (read) => read.review?.preserved !== null && read.review?.preserved !== undefined, 'knowledge-preserved');
    requireJourney(kept.review.preserved === '已选择保留已披露冲突：冲突会随这一版一起记录，不代表核实。' && kept.review.dispositions[1][2] === 'true' && kept.review.promote[1] === false && kept.review.waits === null,
      'knowledge-preserved-words', kept);
    await clickSelector(renderer, '[data-knowledge-action="promote"]', 'knowledge-promote');
    await waitFor(renderer, `${status} === '书系知识已纳入'`, 'knowledge-promoted-status');
    const promotedOne = await readKnowledge(renderer, (read) => read.items.length === 1 && read.review === null, 'knowledge-promoted');
    requireJourney(promotedOne.items[0][1] === `「${PLACE}」 · 地点 · 第 1 版` && promotedOne.items[0][2] === quote && promotedOne.items[0][3] === `来自《${MEMBER}》r1 的原文：「${quote}」` &&
      promotedOne.items[0][4] === '以后的用途：只用于书系一致性审阅' && promotedOne.items[0][5] === '保留了 1 处已披露冲突，未作核实。' && promotedOne.focus === 'item-title' &&
      promotedOne.candidates.length === 1 && promotedOne.candidates[0][0] === fromEditor && promotedOne.candidates[0][4] === true, 'knowledge-promoted-words', promotedOne);
    const itemId = promotedOne.items[0][0];

    at('knowledge-review-edit');
    // The editor's candidate now names an item that exists. 编辑候选项 retargets it to that item; read again, it discloses
    // nothing, states the version it would supersede, waits only for its use, and becomes the item's second revision.
    await clickSelector(renderer, `[data-candidate-id="${fromEditor}"] [data-knowledge-action="review"]`, 'knowledge-edit-review');
    const existing = await readKnowledge(renderer, (read) => read.review?.candidateId === fromEditor && read.review.identity !== null, 'knowledge-edit-review-open');
    requireJourney(JSON.stringify(existing.review.conflicts.map(([kind]) => kind)) === JSON.stringify(['existing-item']) &&
      existing.review.conflicts[0][1] === `书系知识里已有「${PLACE}」（地点）第 1 版。`, 'knowledge-existing-conflict', existing);
    await clickSelector(renderer, '[data-knowledge-action="edit"]', 'knowledge-edit-open');
    const editing = await readKnowledge(renderer, (read) => read.review?.editing === true, 'knowledge-editing');
    requireJourney(JSON.stringify(editing.review.editTargets) === JSON.stringify([['new', true], [itemId, false]]), 'knowledge-editing-words', editing);
    await clickSelector(renderer, `form.knowledge-form-edit input[name="knowledge-target"][value="${itemId}"]`, 'knowledge-edit-target');
    await readKnowledge(renderer, (read) => JSON.stringify(read.review?.editTargets) === JSON.stringify([['new', false], [itemId, true]]), 'knowledge-edit-target-chosen');
    await clickSelector(renderer, '[data-knowledge-action="edit-save"]', 'knowledge-edit-save');
    await waitFor(renderer, `${status} === '候选项已更新，请重新审阅。'`, 'knowledge-edited');
    const reread = await readKnowledge(renderer, (read) => read.review?.editing === false && read.review.identity !== null && read.focus === 'review-heading', 'knowledge-reread');
    requireJourney(reread.review.identity === `书系「${SERIES}」 · 条目「${PLACE}」（地点）` && reread.review.conflictLabel === null && reread.review.conflicts.length === 0 &&
      reread.review.superseded === `将被取代的当前版本：第 1 版 · ${quote}` && JSON.stringify(reread.review.promote) === JSON.stringify(['纳入书系知识', true]) &&
      reread.review.waits === '先选择以后的用途。', 'knowledge-reread-words', reread);
    await clickSelector(renderer, 'input[name="knowledge-reuse"][value="series-tasks"]', 'knowledge-edit-reuse');
    await readKnowledge(renderer, (read) => read.review?.promote?.[1] === false, 'knowledge-edit-ready');
    await clickSelector(renderer, '[data-knowledge-action="promote"]', 'knowledge-edit-promote');
    await waitFor(renderer, `${status} === '书系知识已更新'`, 'knowledge-updated-status');
    const updated = await readKnowledge(renderer, (read) => read.items[0]?.[1] === `「${PLACE}」 · 地点 · 第 2 版` && read.review === null, 'knowledge-updated');
    requireJourney(updated.items[0][2] === EDITOR_WORDS && updated.items[0][3] === '编辑撰写' && updated.items[0][4] === '以后的用途：以后的书系范围任务都可以选用' &&
      updated.items[0][5] === null && updated.items[0][6] === '历次版本（2）' && updated.candidatesEmpty === '没有待审阅的候选项。', 'knowledge-updated-words', updated);
    // An item answers with its current revision; its 历次版本 are read on their own (Issue #63 review).
    const knowledgeService = await renderer.evaluate(`(async () => {
      const seriesId = ${JSON.stringify(seriesId)};
      const answer = await window.ai7.inspectSeries({ seriesId });
      const items = await Promise.all(answer.knowledge.items.map(async (item) => [item.itemId, item.subject, item.knowledgeClass,
        (await window.ai7.inspectSeriesKnowledgeRevisions({ seriesId, itemId: item.itemId, before: null })).revisions
          .map((revision) => [revision.ordinal, revision.outcome, revision.authoring, revision.conflicts.length, revision.reuseScope])]));
      return [items, answer.knowledge.candidates.length];
    })()`);
    requireJourney(JSON.stringify(knowledgeService) === JSON.stringify([[[itemId, PLACE, 'places', [[2, 'updated', 'editor', 0, 'series-tasks'], [1, 'created', 'manuscript-revision', 1, 'consistency-review']]]], 0]),
      'knowledge-service', knowledgeService);

    at('j14-knowledge-keyboard');
    // Without a pointer: Enter on 提议为书系知识… opens the form at its first choice, and Escape closes it back onto the opener.
    await assertRenderer(renderer, `(() => { const open=document.querySelector('[data-knowledge-action="propose-open"]'); if(!(open instanceof HTMLButtonElement)||open.disabled)return false; open.focus(); return document.activeElement===open; })()`, 'knowledge-keyboard-opener');
    await press(renderer, 'Enter');
    await readKnowledge(renderer, (read) => read.form !== null && read.focus === 'knowledge-target', 'knowledge-keyboard-form');
    await press(renderer, 'Escape');
    await readKnowledge(renderer, (read) => read.form === null && read.focus === 'propose-open', 'knowledge-keyboard-escaped');

    at('knowledge-restart');
    // After a restart the item keeps both revisions and no candidate waits.
    await closeBrowser();
    manager = await launch();
    renderer = await waitForRenderer(manager, 'knowledge-restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, 'knowledge-restart-ready');
    await openSeries(renderer, seriesId, 'knowledge-restart-series');
    const restarted = await readKnowledge(renderer, (read) => read.items.length === 1, 'knowledge-restarted');
    requireJourney(restarted.items[0][1] === `「${PLACE}」 · 地点 · 第 2 版` && restarted.items[0][6] === '历次版本（2）' && restarted.candidatesEmpty === '没有待审阅的候选项。', 'knowledge-restarted-words', restarted);

    // ---- 书系一致性 (Issue #64, plan slice S29a; V2-UX-REV-013, SER-018) ------------------------------------------------
    at('consistency-prerequisites');
    // The Review Run's prerequisites through the product's own setup, as J-11 makes them: the editorial workspace profile at
    // Revision 2 for the member Book, and one Main Editorial Role connection whose synthetic credential is saved and removed
    // again, so only its reference is recorded — the J-04 adapter's route sends nothing and needs no credential.
    await leaveSeries(renderer, 'consistency-leave');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(member)}]`, 'consistency-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(member)}]')`, 'consistency-manuscript', 120_000);
    await click(renderer, '返回图书工作概览', 'consistency-overview');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="install-disabled"]')`, 'consistency-artifact-install-ready');
    await click(renderer, '获取并安装（保持停用）', 'consistency-artifact-install');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'consistency-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'consistency-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'consistency-artifact-enabled');
    await backToLibrary(renderer, 'consistency-model');
    await click(renderer, '模型服务', 'consistency-model-open');
    await waitFor(renderer, `document.querySelector('[data-screen="model-service"] [data-model-role="main-editorial"]')`, 'consistency-model-ready');
    cancellation.throwIfRequested();
    syntheticSecret = randomBytes(48).toString('base64url');
    credentialRenderer = renderer;
    await fill(renderer, '#main-editorial-connection-name', 'J-13 主编辑连接', 'consistency-model-name');
    await fill(renderer, '#main-editorial-credential', syntheticSecret, 'consistency-model-secret');
    cancellation.throwIfRequested();
    credentialMutationReached = true;
    await click(renderer, '保护并保存', 'consistency-model-save');
    at('model-credential-saved');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('[data-credential-state="ready"]')`, 'consistency-model-saved');
    const readyConnection = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(UUID_PATTERN.test(readyConnection?.credentialReference ?? '') && readyConnection?.credentialOperationState === 'ready', 'consistency-model-ready-reference');
    credentialReferenceForCleanup = readyConnection.credentialReference;
    await click(renderer, '移除', 'consistency-model-remove');
    at('model-credential-removed');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='setup-required' && document.querySelector('[data-credential-state="missing"]')`, 'consistency-model-removed');
    credentialRemoved = true;
    await click(renderer, '返回', 'consistency-model-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, 'consistency-model-library');

    at('consistency-offered');
    // The member's row says 书系一致性 can be chosen now; in 审阅 the category is offered, its basis naming the Series and the
    // exact revision of its knowledge — the second, the editor's words — and nothing else is chosen for the editor.
    await openSeries(renderer, seriesId, 'consistency-series');
    const offered = await readSeries(renderer, (read) => read.members.some(([id]) => id === member), 'consistency-member-row');
    requireJourney(offered.members.find(([id]) => id === member)?.[5] === '尚未审阅 · 可以审阅', 'consistency-member-offered', offered.members);
    await leaveSeries(renderer, 'consistency-series-leave');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(member)}]`, 'consistency-review-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(member)}]')`, 'consistency-review-manuscript', 120_000);
    await assertRenderer(renderer, `(() => { const group=document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]'); const button=group?.querySelector('button[data-work-destination="review"]'); if(!(button instanceof HTMLButtonElement)||button.disabled||button.textContent!=='审阅')return false; button.click(); return true; })()`, 'consistency-review-entry');
    await waitFor(renderer, `document.querySelector('[data-screen="book-review"] .book-review .review-workspace-card')`, 'consistency-review-card');
    await assertRenderer(renderer, `document.querySelector('table.review-coverage tbody tr[data-review-category="series-consistency"]')?.dataset.coverage==='never'`, 'consistency-coverage-never');
    await clickSelector(renderer, '[data-review-action="new-review"]', 'consistency-new-review');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true`, 'consistency-sheet-open');
    const sheet = await renderer.evaluate(`(() => { const sheet=document.querySelector('dialog.review-sheet'); const box=sheet.querySelector('input[name="review-category"][value="series-consistency"]'); const label=sheet.querySelector('[data-review-category-option="series-consistency"]'); return { enabled: box instanceof HTMLInputElement && !box.disabled && !box.checked, basis: label?.querySelector('.review-category-basis')?.textContent ?? null, checked: Array.from(sheet.querySelectorAll('input[name="review-category"]:checked'), (input) => input.value) }; })()`);
    requireJourney(sheet?.enabled === true && sheet.basis === CONSISTENCY_BASIS && sheet.checked.length === 0, 'consistency-sheet-offered', sheet);
    await assertRenderer(renderer, `(() => { const sheet=document.querySelector('dialog.review-sheet'); const box=sheet.querySelector('input[name="review-category"][value="series-consistency"]'); box.click(); const whole=sheet.querySelector('input[name="review-scope"][value="whole"]'); if(!(whole instanceof HTMLInputElement)||whole.disabled)return false; whole.click(); const prepare=sheet.querySelector('[data-review-action="prepare"]'); if(!(prepare instanceof HTMLButtonElement)||prepare.disabled)return false; prepare.click(); return true; })()`, 'consistency-prepare');
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='prepared' && document.querySelector('section.review-plans')?.dataset.reviewCategories==='series-consistency'`, 'consistency-prepared', 120_000);
    const prepared = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
    requireJourney(prepared?.state === 'prepared' && UUID_PATTERN.test(prepared.reviewRunId) && prepared.categories.length === 1 &&
      prepared.categories[0].categoryId === 'series-consistency' && prepared.categories[0].basisStatement === CONSISTENCY_BASIS &&
      (prepared.categories[0].planEnvelopeDigest ?? '').length === 64, 'consistency-prepared-run', prepared?.categories);

    at('consistency-review-run');
    // The one approval is the drawer's 开始任务; the Run executes on the J-04 adapter through the authored fixture, and its
    // three findings — place names to check against the first book's writing, citing the one clause — become 批注.
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(prepared.reviewRunId)} && document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready'`, 'consistency-drawer');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'consistency-start');
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='settled'`, 'consistency-settled', 180_000);
    const reviewed = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
    const findings = reviewed?.findings ?? [];
    requireJourney(reviewed?.state === 'settled' && reviewed.categories.length === 1 && reviewed.categories[0].state === 'settled' &&
      reviewed.categories[0].findingsCount === 3 && reviewed.categories[0].excludedCount === 0 && reviewed.categories[0].basisStatement === CONSISTENCY_BASIS &&
      findings.length === 3 && findings.every((finding) => finding.categoryId === 'series-consistency' && finding.output === 'annotation' &&
        finding.markId !== null && finding.status === 'pending' && finding.anchorState === 'exact' && finding.clauseRefs.length === 1 &&
        finding.clauseRefs[0].clauseId === 'series-knowledge/1' && finding.clauseRefs[0].documentTitle === `地点「${PLACE}」` &&
        finding.clauseRefs[0].text === `地点「${PLACE}」：${EDITOR_WORDS}`),
    'consistency-run-settled', { state: reviewed?.state, categories: reviewed?.categories, findings: findings.map((finding) => [finding.status, finding.anchorState, finding.clauseRefs]) });
    await assertRenderer(renderer, `document.querySelector('table.review-coverage tbody tr[data-review-category="series-consistency"]')?.dataset.coverage==='current' && document.querySelectorAll('section.review-group[data-review-category="series-consistency"] article.review-finding').length===3`, 'consistency-results');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'consistency-drawer-close');
    await waitFor(renderer, `document.body.dataset.taskDrawer !== 'open'`, 'consistency-drawer-closed');

    at('consistency-marks-on-manuscript');
    // A finding is the mark on the manuscript: 回到原文 opens the text at it, its card naming the category.
    await clickSelector(renderer, `article.review-finding[data-finding-id="${findings[0].findingId}"] [data-review-action="go-to-text"]`, 'consistency-go-to-text');
    await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"] [data-mark-id="${findings[0].markId}"]')?.dataset.markSource==='ai7' && (document.querySelector('[data-mark-card]')?.textContent??'').includes('AI7 · 审阅「书系一致性」')`, 'consistency-mark-and-card', 30_000);

    at('consistency-member-reviewed');
    // The Series page's 书系一致性审阅 column says when the member's findings reached its manuscript.
    await click(renderer, '返回图书工作概览', 'consistency-reviewed-overview');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview')?.dataset.bookId===${JSON.stringify(member)}`, 'consistency-reviewed-overview-ready');
    await backToLibrary(renderer, 'consistency-reviewed');
    await openSeries(renderer, seriesId, 'consistency-reviewed-series');
    const reviewedRow = await readSeries(renderer, (read) => read.members.some(([id]) => id === member), 'consistency-reviewed-row');
    const reviewedLine = reviewedRow.members.find(([id]) => id === member)?.[5] ?? '';
    requireJourney(reviewedLine.startsWith('审阅于 ') && reviewedLine.endsWith(' · 可以审阅'), 'consistency-member-reviewed-line', reviewedLine);

    // ---- 书系检索排除 (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-027) ---------------------------------------------
    at('exclusion-held-run');
    // A second 书系一致性 Review Run, its first reading range held in flight by the unit hold, so the exclusion is recorded
    // while the Run reads.
    await writeFile(holdPath, '0', 'utf8');
    await leaveSeries(renderer, 'exclusion-series-leave');
    const openMemberReview = async () => {
      await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(member)}]`, 'exclusion-review-book');
      await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(member)}]')`, 'exclusion-review-manuscript', 120_000);
      await assertRenderer(renderer, `(() => { const group=document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]'); const button=group?.querySelector('button[data-work-destination="review"]'); if(!(button instanceof HTMLButtonElement)||button.disabled)return false; button.click(); return true; })()`, 'exclusion-review-entry');
      await waitFor(renderer, `document.querySelector('[data-screen="book-review"] .book-review .review-workspace-card')`, 'exclusion-review-card');
    };
    const leaveMemberReview = async () => {
      await assertRenderer(renderer, `(() => { const open = Array.from(document.querySelectorAll('[data-screen="book-review"] .workbench-actions button')).find((button) => button.textContent === '工作概览'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'exclusion-review-overview');
      await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview')?.dataset.bookId===${JSON.stringify(member)}`, 'exclusion-review-overview-ready');
      await backToLibrary(renderer, 'exclusion-review-library');
    };
    await openMemberReview();
    await clickSelector(renderer, '[data-review-action="new-review"]', 'exclusion-new-review');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true`, 'exclusion-sheet-open');
    await assertRenderer(renderer, `(() => { const sheet=document.querySelector('dialog.review-sheet'); const box=sheet.querySelector('input[name="review-category"][value="series-consistency"]'); if(!(box instanceof HTMLInputElement)||box.disabled)return false; box.click(); const whole=sheet.querySelector('input[name="review-scope"][value="whole"]'); if(!(whole instanceof HTMLInputElement)||whole.disabled)return false; whole.click(); const prepare=sheet.querySelector('[data-review-action="prepare"]'); if(!(prepare instanceof HTMLButtonElement)||prepare.disabled)return false; prepare.click(); return true; })()`, 'exclusion-prepare');
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='prepared'`, 'exclusion-prepared', 120_000);
    const heldRun = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
    requireJourney(heldRun?.state === 'prepared' && heldRun.ordinal === 2 && UUID_PATTERN.test(heldRun.reviewRunId), 'exclusion-prepared-run', heldRun?.state);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(heldRun.reviewRunId)} && document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready'`, 'exclusion-drawer');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'exclusion-start');
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='running' && document.querySelector('ol.review-progress li[data-review-category="series-consistency"]')?.dataset.categoryState==='running'`, 'exclusion-running', 120_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'exclusion-drawer-close');
    await waitFor(renderer, `document.body.dataset.taskDrawer !== 'open'`, 'exclusion-drawer-closed');
    await leaveMemberReview();

    at('exclusion-preview');
    // 添加检索排除…: the item, a reason, and 书系检索排除影响预览 — exact target, scope, effective time, how far it reaches, reason
    // and actor, then four groups naming the Run reading now and the result that used the item. Nothing is recorded yet.
    await openSeries(renderer, seriesId, 'exclusion-series');
    await waitFor(renderer, `document.querySelector('.series-exclusions')?.dataset.exclusionsEffective==='0'`, 'exclusion-section');
    await clickSelector(renderer, '[data-exclusion-action="add-open"]', 'exclusion-add-open');
    await clickSelector(renderer, 'input[name="series-exclusion-kind"][value="knowledge-item"]', 'exclusion-kind');
    await waitFor(renderer, `document.querySelector('input[name="series-exclusion-target"][value=${JSON.stringify(itemId)}]') instanceof HTMLInputElement`, 'exclusion-targets');
    await clickSelector(renderer, `input[name="series-exclusion-target"][value=${JSON.stringify(itemId)}]`, 'exclusion-target');
    await fill(renderer, '#series-exclusion-reason', EXCLUSION_REASON, 'exclusion-reason');
    await clickSelector(renderer, '[data-exclusion-action="preview"]', 'exclusion-preview-open');
    await waitFor(renderer, `document.querySelector('.series-exclusion-preview')?.dataset.previewAction==='add' && document.activeElement === document.querySelector('.series-exclusion-preview-heading')`, 'exclusion-previewed');
    const exclusionPreview = await renderer.evaluate(`(() => { const box=document.querySelector('.series-exclusion-preview'); return {
      rows: Array.from(box.querySelectorAll('.series-exclusion-preview-identity dt'), (term) => [term.textContent, term.nextElementSibling?.textContent ?? null]),
      groups: Array.from(box.querySelectorAll(':scope > .series-impact-group'), (group) => [group.dataset.impactGroup, group.querySelector('h5')?.textContent ?? null,
        Array.from(group.querySelectorAll('.series-impact-changes li'), (line) => line.textContent)]),
      commit: box.querySelector('[data-exclusion-action="commit"]')?.textContent ?? null,
    }; })()`);
    requireJourney(JSON.stringify(exclusionPreview?.rows) === JSON.stringify([
      ['对象', ITEM_LABEL], ['范围', `只限书系「${SERIES}」的书系检索`], ['生效时间', '记录后立即生效'], ['持续范围', '这个条目现在和以后的修订版都一并排除。'],
      ['理由', EXCLUSION_REASON], ['操作人', '本机编辑'],
    ]), 'exclusion-preview-rows', exclusionPreview?.rows);
    requireJourney(JSON.stringify(exclusionPreview?.groups.map((group) => [group[0], group[1]])) === JSON.stringify([
      ['future-reads', '今后的检索'], ['runs', '已排队、已授权或正在运行的任务'], ['history', '已完成的历史'], ['unaffected', '不受影响的授权'],
    ]) && exclusionPreview.groups[1][2][0] === `1 个已授权或正在运行的任务会在下一次读取前停下，显示「书系检索范围已变化 · 需要重新确认计划」：《${MEMBER}》第 2 次审阅。` &&
      exclusionPreview.groups[2][2][0] === `1 个已完成的结果用过这些材料，会标上「${MARKER}」：《${MEMBER}》第 1 次审阅。` && exclusionPreview.commit === '添加检索排除',
    'exclusion-preview-groups', exclusionPreview?.groups);
    requireJourney((await renderer.evaluate(`window.ai7.inspectSeries({ seriesId: ${JSON.stringify(seriesId)} })`))?.exclusions.effective.length === 0, 'exclusion-preview-records-nothing');

    at('exclusion-recorded');
    // 添加检索排除: in force at once, listed with its reason, and the member can no longer choose 书系一致性 — the plan it would make
    // leaves the item out, and with it everything there was to read.
    await clickSelector(renderer, '[data-exclusion-action="commit"]', 'exclusion-commit');
    await waitFor(renderer, `document.querySelector('.series-exclusions')?.dataset.exclusionsEffective==='1' && document.querySelector('li.series-exclusion')?.dataset.targetId===${JSON.stringify(itemId)}`, 'exclusion-listed');
    await assertRenderer(renderer, `(document.querySelector('li.series-exclusion .series-exclusion-reason')?.textContent ?? '') === ${JSON.stringify(`理由：${EXCLUSION_REASON}`)} && document.querySelectorAll('ol.series-exclusion-revisions > li').length === 1`, 'exclusion-listed-words');
    const excludedRow = await readSeries(renderer, (read) => read.members.some(([id]) => id === member), 'exclusion-member-row');
    requireJourney((excludedRow.members.find(([id]) => id === member)?.[5] ?? '').endsWith(`暂不能审阅：${EXCLUDED_REASON}`), 'exclusion-member-unavailable', excludedRow.members);

    at('exclusion-held-run-stopped');
    // The held range is let go; before the next one the current-read guard stops the Run, which offers exactly 修改计划并重新授权
    // and 取消任务 — never 继续审阅.
    await writeFile(holdPath, 'release', 'utf8');
    await leaveSeries(renderer, 'exclusion-stopped-leave');
    await openMemberReview();
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='scope-changed'`, 'exclusion-stopped', 120_000);
    const stoppedRun = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
    requireJourney(stoppedRun?.reviewRunId === heldRun.reviewRunId && stoppedRun.stateLabel === SCOPE_CHANGED && stoppedRun.canContinue === false &&
      stoppedRun.categories[0]?.state === 'interrupted' && stoppedRun.categories[0]?.stateLabel === SCOPE_CHANGED && stoppedRun.findings.length === 0,
    'exclusion-stopped-run', { state: stoppedRun?.state, categories: stoppedRun?.categories?.map((category) => [category.state, category.stateLabel]) });
    await assertRenderer(renderer, `document.querySelector('[data-review-action="continue"]') === null && document.querySelector('.review-scope-stop [data-review-action="scope-redo"]')?.textContent === '修改计划并重新授权' && document.querySelector('.review-scope-stop [data-review-action="scope-cancel"]')?.textContent === '取消任务'`, 'exclusion-stopped-actions');

    at('exclusion-plan-leaves-out');
    // 修改计划并重新授权 opens 新建审阅 with the Run's own choices; the plan it would make leaves the excluded item out, and here
    // that is every item, so 书系一致性 cannot be chosen and says why.
    await clickSelector(renderer, '[data-review-action="scope-redo"]', 'exclusion-redo');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true`, 'exclusion-redo-sheet');
    await assertRenderer(renderer, `(() => { const box=document.querySelector('dialog.review-sheet input[name="review-category"][value="series-consistency"]'); return box instanceof HTMLInputElement && box.disabled && !box.checked && box.dataset.unavailableReason === ${JSON.stringify(EXCLUDED_REASON)}; })()`, 'exclusion-redo-unavailable');
    await clickSelector(renderer, 'dialog.review-sheet [data-review-action="close-sheet"]', 'exclusion-redo-close');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open!==true`, 'exclusion-redo-closed');

    at('exclusion-marker');
    // The first Run's result used the item: it is marked beside the Run, its report and each finding, and nothing is rewritten.
    await clickSelector(renderer, 'ol.review-runs li[data-review-run="1"] [data-review-action="open-run"]', 'exclusion-open-first');
    await waitFor(renderer, `document.querySelector('section.review-run')?.dataset.reviewRunState==='settled' && document.querySelectorAll('article.review-finding').length===3`, 'exclusion-first-open');
    await assertRenderer(renderer, `document.querySelector('section.review-run .review-historical-marker .review-historical-marker-label')?.textContent === ${JSON.stringify(MARKER)} && document.querySelector('.review-report-marker')?.textContent === ${JSON.stringify(MARKER)} && Array.from(document.querySelectorAll('article.review-finding .review-finding-marker')).every((line) => line.textContent === ${JSON.stringify(MARKER)}) && document.querySelectorAll('article.review-finding .review-finding-marker').length === 3 && document.querySelector('ol.review-runs li[data-review-run="1"] .review-run-marker')?.textContent === ${JSON.stringify(MARKER)}`, 'exclusion-marker-shown');
    await leaveMemberReview();

    at('exclusion-ended');
    // 停止此排除 after its own preview: later reads may read the item again, the member may choose 书系一致性 again — and the Run
    // the exclusion stopped stays stopped, its authorization never restored.
    await openSeries(renderer, seriesId, 'exclusion-end-series');

    at('j14-exclusions-keyboard');
    // Without a pointer (Issue #64 review): Enter on 添加检索排除… opens the chooser at its first kind and Escape closes it back
    // onto the opener; Enter on 停止此排除… shows the preview with focus on its heading, and Escape closes it back onto the
    // exclusion's own 停止此排除…. Nothing is recorded.
    await assertRenderer(renderer, `(() => { const open=document.querySelector('[data-exclusion-action="add-open"]'); if(!(open instanceof HTMLButtonElement)||open.disabled)return false; open.focus(); return document.activeElement===open; })()`, 'exclusion-keyboard-opener');
    await press(renderer, 'Enter');
    await waitFor(renderer, `document.activeElement?.getAttribute('name') === 'series-exclusion-kind' && document.querySelector('.series-exclusion-chooser') !== null`, 'exclusion-keyboard-chooser', 10_000);
    await press(renderer, 'Escape');
    await waitFor(renderer, `document.querySelector('.series-exclusion-chooser') === null && document.activeElement?.dataset.exclusionAction === 'add-open'`, 'exclusion-keyboard-chooser-escaped', 10_000);
    await assertRenderer(renderer, `(() => { const end=document.querySelector('li.series-exclusion [data-exclusion-action="end-open"]'); if(!(end instanceof HTMLButtonElement)||end.disabled)return false; end.focus(); return document.activeElement===end; })()`, 'exclusion-keyboard-end-focus');
    await press(renderer, 'Enter');
    await waitFor(renderer, `document.querySelector('.series-exclusion-preview')?.dataset.previewAction==='end' && document.activeElement === document.querySelector('.series-exclusion-preview-heading')`, 'exclusion-keyboard-preview', 10_000);
    await press(renderer, 'Escape');
    await waitFor(renderer, `document.querySelector('.series-exclusion-preview') === null && document.activeElement?.dataset.exclusionAction === 'end-open' && document.querySelector('.series-exclusions')?.dataset.exclusionsEffective === '1'`, 'exclusion-keyboard-preview-escaped', 10_000);

    at('j14-exclusions-reflow-forced-colors');
    // At 200% the exclusion list, its preview and its records wrap within the width; under forced colours the preview keeps its
    // border and the exclusion its rule.
    await clickSelector(renderer, 'li.series-exclusion [data-exclusion-action="end-open"]', 'exclusion-reflow-preview-open');
    await waitFor(renderer, `document.querySelector('.series-exclusion-preview')?.dataset.previewAction==='end'`, 'exclusion-reflow-preview');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const parts=[document.querySelector('.series-exclusion-preview'), document.querySelector('ul.series-exclusion-list'), document.querySelector('ol.series-exclusion-revisions')]; return parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2); })()`, 'exclusion-reflow-200', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const preview = document.querySelector('.series-exclusion-preview');
      const exclusion = document.querySelector('li.series-exclusion');
      return preview instanceof HTMLElement && getComputedStyle(preview).borderTopStyle === 'solid' &&
        exclusion instanceof HTMLElement && getComputedStyle(exclusion).borderLeftStyle === 'solid';
    })()`, 'exclusion-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await clickSelector(renderer, '[data-exclusion-action="preview-cancel"]', 'exclusion-reflow-cancel');
    await waitFor(renderer, `document.querySelector('.series-exclusion-preview') === null && document.querySelector('.series-exclusions')?.dataset.exclusionsEffective === '1'`, 'exclusion-reflow-cancelled');
    await clickSelector(renderer, 'li.series-exclusion [data-exclusion-action="end-open"]', 'exclusion-end-open');
    await waitFor(renderer, `document.querySelector('.series-exclusion-preview')?.dataset.previewAction==='end' && document.querySelector('.series-exclusion-preview [data-exclusion-action="commit"]')?.textContent==='停止此排除'`, 'exclusion-end-previewed');
    await assertRenderer(renderer, `Array.from(document.querySelectorAll('.series-exclusion-preview [data-impact-group="runs"] .series-impact-unchanged li'), (line) => line.textContent).includes('因这条排除停下的任务不会自动恢复，旧的授权和来源范围也不会恢复；要继续，需修改计划并重新授权。')`, 'exclusion-end-preview-words');
    await clickSelector(renderer, '.series-exclusion-preview [data-exclusion-action="commit"]', 'exclusion-end-commit');
    await waitFor(renderer, `document.querySelector('.series-exclusions')?.dataset.exclusionsEffective==='0' && document.querySelectorAll('ol.series-exclusion-revisions > li').length === 2`, 'exclusion-ended-listed');
    const endedRow = await readSeries(renderer, (read) => (read.members.find(([id]) => id === member)?.[5] ?? '').endsWith(' · 可以审阅'), 'exclusion-member-available');
    requireJourney(endedRow.members.some(([id]) => id === member), 'exclusion-member-row-again');
    await leaveSeries(renderer, 'exclusion-ended-leave');
    await openMemberReview();
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='scope-changed'`, 'exclusion-still-stopped');

    at('j14-scope-stop-keyboard-reflow-forced-colors');
    // The stopped Run without a pointer (Issue #64 review): Enter on 取消任务 moves focus to 确认取消任务, and Escape keeps the Run,
    // focus back on 取消任务. At 200% the stop and the marker wrap within the width; under forced colours the marker keeps its rule.
    await assertRenderer(renderer, `(() => { const cancel=document.querySelector('[data-review-action="scope-cancel"]'); if(!(cancel instanceof HTMLButtonElement)||cancel.disabled)return false; cancel.focus(); return document.activeElement===cancel; })()`, 'scope-keyboard-focus');
    await press(renderer, 'Enter');
    await waitFor(renderer, `document.activeElement?.dataset.reviewAction === 'scope-cancel-confirm'`, 'scope-keyboard-confirm', 10_000);
    await press(renderer, 'Escape');
    await waitFor(renderer, `document.activeElement?.dataset.reviewAction === 'scope-cancel' && document.querySelector('[data-review-action="scope-cancel-confirm"]') === null && document.querySelector('.review-workspace-card')?.dataset.reviewState==='scope-changed'`, 'scope-keyboard-kept', 10_000);
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const stop=document.querySelector('.review-scope-stop'); const marker=document.querySelector('ol.review-runs li[data-review-run="1"]'); return stop instanceof HTMLElement && stop.scrollWidth<=stop.clientWidth+2 && marker instanceof HTMLElement && marker.scrollWidth<=marker.clientWidth+2; })()`, 'scope-reflow-200', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => { if (!matchMedia('(forced-colors: active)').matches) return false; const parts = [document.querySelector('.review-scope-stop .attention-note'), document.querySelector('ol.review-runs li[data-review-run="1"] .review-run-marker')]; return parts.every((part) => part instanceof HTMLElement && part.offsetHeight > 0 && getComputedStyle(part).color !== getComputedStyle(part).backgroundColor); })()`, 'scope-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('exclusion-cancel');
    // 取消任务, confirmed inline: the Run reads 已取消 and offers nothing more; the marked result stays marked.
    await clickSelector(renderer, '[data-review-action="scope-cancel"]', 'exclusion-cancel-open');
    await waitFor(renderer, `document.activeElement === document.querySelector('[data-review-action="scope-cancel-confirm"]')`, 'exclusion-cancel-confirm-focus');
    await clickSelector(renderer, '[data-review-action="scope-cancel-confirm"]', 'exclusion-cancel-confirm');
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='cancelled' && document.querySelector('.review-scope-stop') === null && document.querySelector('[data-review-action="continue"]') === null`, 'exclusion-cancelled');
    // A cancelled Run is not a finished one: it offers no 保存为可复用工序 (Issue #674), and says why wherever the control shows.
    const cancelledRun = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
    requireJourney(cancelledRun?.reviewRunId === heldRun.reviewRunId && cancelledRun.capture?.available === false && cancelledRun.capture.unavailableReason === CAPTURE_CANCELLED,
      'exclusion-cancel-capture-unavailable', cancelledRun?.capture);
    await assertRenderer(renderer, `(() => { const control = document.querySelector('[data-review-action="capture"]'); if (control === null) return true; const why = document.getElementById(control.getAttribute('aria-describedby') ?? ''); return control instanceof HTMLButtonElement && control.disabled && why?.textContent === ${JSON.stringify(CAPTURE_CANCELLED)}; })()`, 'exclusion-cancel-no-capture');
    await assertRenderer(renderer, `document.querySelector('ol.review-runs li[data-review-run="1"] .review-run-marker')?.textContent === ${JSON.stringify(MARKER)}`, 'exclusion-marker-kept');
    await leaveMemberReview();
    await openSeries(renderer, seriesId, 'exclusion-back-series');

    at('knowledge-bounded-pages');
    const pagesSeeded = await renderer.evaluate(`(async () => {
      const seriesId = ${JSON.stringify(seriesId)};
      const itemId = ${JSON.stringify(itemId)};
      for (let index = 0; index < 30; index += 1) {
        const candidate = await window.ai7.proposeSeriesKnowledge({ seriesId,
          target: { kind: 'new', subject: '分页条目' + String(index).padStart(2, '0'), knowledgeClass: 'canon' }, content: '分页内容' + index, span: null });
        const review = await window.ai7.inspectSeriesKnowledgeReview({ seriesId, candidateId: candidate.candidateId });
        await window.ai7.promoteSeriesKnowledge({ seriesId, candidateId: candidate.candidateId, candidateVersion: 1,
          reviewDigest: review.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'none' });
      }
      for (let index = 0; index < 10; index += 1) {
        const candidate = await window.ai7.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId }, content: '历次分页内容' + index, span: null });
        const review = await window.ai7.inspectSeriesKnowledgeReview({ seriesId, candidateId: candidate.candidateId });
        await window.ai7.promoteSeriesKnowledge({ seriesId, candidateId: candidate.candidateId, candidateVersion: 1,
          reviewDigest: review.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'none' });
      }
      for (let index = 0; index < 31; index += 1) {
        await window.ai7.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '待审分页' + index, knowledgeClass: 'canon' }, content: '待审内容' + index, span: null });
      }
      return true;
    })()`);
    requireJourney(pagesSeeded === true, 'knowledge-pages-seeded');
    await leaveSeries(renderer, 'knowledge-pages-leave');
    await openSeries(renderer, seriesId, 'knowledge-pages-reopen');
    await waitFor(renderer, `document.querySelectorAll('.knowledge-item').length === 30 && document.querySelectorAll('.knowledge-candidate').length === 30`, 'knowledge-pages-first');
    const selectedTarget = await renderer.evaluate(`document.querySelector('.knowledge-item').dataset.itemId`);
    await clickSelector(renderer, '.knowledge-item [data-knowledge-action="propose-item"]', 'knowledge-pages-propose');
    await fill(renderer, '#knowledge-content-propose', '保留翻页中的草稿', 'knowledge-pages-draft');
    for (let pass = 0; pass < 2; pass += 1) {
      await clickSelector(renderer, '[data-knowledge-action="items-more"]', 'knowledge-pages-items-next');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-item').length === 1 && document.querySelector('[data-knowledge-action="items-reset"]')?.disabled === false && document.querySelector('input[name="knowledge-target"]:checked')?.value === ${JSON.stringify(selectedTarget)} && document.querySelector('#knowledge-content-propose')?.value === '保留翻页中的草稿' && document.activeElement === document.querySelector('.knowledge-item-title')`, 'knowledge-pages-items-last');
      await clickSelector(renderer, '[data-knowledge-action="items-reset"]', 'knowledge-pages-items-reset');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-item').length === 30 && document.querySelector('[data-knowledge-action="items-reset"]') === null && document.querySelector('#knowledge-content-propose')?.value === '保留翻页中的草稿'`, 'knowledge-pages-items-first');
      await clickSelector(renderer, '[data-knowledge-action="candidates-more"]', 'knowledge-pages-candidates-next');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-candidate').length === 1 && document.querySelector('[data-knowledge-action="candidates-reset"]')?.disabled === false && document.activeElement === document.querySelector('.knowledge-candidate [data-knowledge-action="review"]')`, 'knowledge-pages-candidates-last');
      await clickSelector(renderer, '[data-knowledge-action="candidates-reset"]', 'knowledge-pages-candidates-reset');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-candidate').length === 30 && document.querySelector('[data-knowledge-action="candidates-reset"]') === null`, 'knowledge-pages-candidates-first');
    }
    await clickSelector(renderer, '[data-knowledge-action="propose-cancel"]', 'knowledge-pages-cancel-draft');
    await clickSelector(renderer, '[data-knowledge-action="items-more"]', 'knowledge-pages-history-item');
    await waitFor(renderer, `document.querySelectorAll('.knowledge-item').length === 1`, 'knowledge-pages-history-item-ready');
    await clickSelector(renderer, '.knowledge-item-history summary', 'knowledge-pages-history-open');
    await waitFor(renderer, `document.querySelectorAll('.knowledge-item-history ol li').length === 10 && document.querySelector('[data-knowledge-action="revisions-more"]')?.disabled === false`, 'knowledge-pages-history-first');
    for (let pass = 0; pass < 2; pass += 1) {
      await clickSelector(renderer, '[data-knowledge-action="revisions-more"]', 'knowledge-pages-history-next');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-item-history ol li').length === 2 && document.querySelector('[data-knowledge-action="revisions-reset"]')?.disabled === false && document.activeElement === document.querySelector('.knowledge-item-history summary')`, 'knowledge-pages-history-last');
      await clickSelector(renderer, '[data-knowledge-action="revisions-reset"]', 'knowledge-pages-history-reset');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-item-history ol li').length === 10 && document.querySelector('[data-knowledge-action="revisions-reset"]') === null`, 'knowledge-pages-history-reset-ready');
    }

    // A separate Series keeps the existing list assertions unchanged while exercising one immutable conflict reader.
    const conflictSeed = await renderer.evaluate(`(async () => {
      const seriesId = (await window.ai7.createSeries({ title: '冲突读取书系', note: '' })).seriesId;
      let first;
      let last;
      for (let index = 0; index < 52; index += 1) {
        const candidate = await window.ai7.proposeSeriesKnowledge({ seriesId,
          target: { kind: 'new', subject: '同名冲突条目', knowledgeClass: 'canon' }, content: '候选内容' + index, span: null });
        first ??= candidate;
        last = candidate;
      }
      return { seriesId, candidateId: first.candidateId, offPageCandidateId: last.candidateId };
    })()`);
    requireJourney(typeof conflictSeed?.seriesId === 'string' && typeof conflictSeed?.candidateId === 'string', 'knowledge-conflicts-seeded');
    await leaveSeries(renderer, 'knowledge-conflicts-leave');
    await openSeries(renderer, conflictSeed.seriesId, 'knowledge-conflicts-open');
    await clickSelector(renderer, `[data-candidate-id="${conflictSeed.candidateId}"] [data-knowledge-action="review"]`, 'knowledge-conflicts-review');
    await waitFor(renderer, `document.querySelectorAll('.knowledge-review-conflicts li').length === 50`, 'knowledge-conflicts-review-first');
    await clickSelector(renderer, '[data-knowledge-action="preserve"]', 'knowledge-conflicts-review-preserve');
    await clickSelector(renderer, 'input[name="knowledge-reuse"][value="series-tasks"]', 'knowledge-conflicts-review-reuse');
    for (let pass = 0; pass < 2; pass += 1) {
      await clickSelector(renderer, '[data-knowledge-action="review-conflicts-next"]', 'knowledge-conflicts-review-next');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-review-conflicts li').length === 1 &&
        document.querySelector('.knowledge-conflicts-range')?.textContent === '第 51–51 处 / 共 51 处冲突' &&
        document.activeElement === document.querySelector('.knowledge-review-heading') &&
        document.querySelector('[data-knowledge-action="preserve"]')?.getAttribute('aria-pressed') === 'true' &&
        document.querySelector('input[name="knowledge-reuse"][value="series-tasks"]')?.checked`, 'knowledge-conflicts-review-last');
      await clickSelector(renderer, '[data-knowledge-action="review-conflicts-first"]', 'knowledge-conflicts-review-reset');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-review-conflicts li').length === 50 &&
        document.activeElement === document.querySelector('.knowledge-review-heading')`, 'knowledge-conflicts-review-reset-ready');
    }
    // Change the off-page governing record without changing the conflict count: the page must refuse the old review.
    await assertRenderer(renderer, `window.ai7.editSeriesKnowledgeCandidate({ seriesId: ${JSON.stringify(conflictSeed.seriesId)},
      candidateId: ${JSON.stringify(conflictSeed.offPageCandidateId)}, expectedVersion: 1,
      target: { kind: 'new', subject: '同名冲突条目', knowledgeClass: 'canon' }, content: '改过的候选内容' }).then(() => true)`, 'knowledge-conflicts-review-drift');
    await clickSelector(renderer, '[data-knowledge-action="review-conflicts-next"]', 'knowledge-conflicts-review-stale');
    await waitFor(renderer, `document.querySelector('[data-knowledge-action="review-refresh"]') && !document.querySelector('[data-knowledge-action="promote"]') &&
      document.activeElement === document.querySelector('[data-knowledge-action="review-refresh"]')`, 'knowledge-conflicts-review-stale-refused');
    await clickSelector(renderer, '[data-knowledge-action="review-refresh"]', 'knowledge-conflicts-review-refresh');
    await waitFor(renderer, `document.querySelectorAll('.knowledge-review-conflicts li').length === 50 &&
      document.querySelector('[data-knowledge-action="preserve"]')?.getAttribute('aria-pressed') === 'false' &&
      !document.querySelector('input[name="knowledge-reuse"]:checked') && document.querySelector('[data-knowledge-action="promote"]')?.disabled`, 'knowledge-conflicts-review-refresh-unchosen');
    await clickSelector(renderer, '[data-knowledge-action="preserve"]', 'knowledge-conflicts-review-preserve-again');
    await clickSelector(renderer, 'input[name="knowledge-reuse"][value="series-tasks"]', 'knowledge-conflicts-review-reuse-again');
    await clickSelector(renderer, '[data-knowledge-action="promote"]', 'knowledge-conflicts-review-promote');
    await waitFor(renderer, `document.querySelector('.knowledge-review') === null && document.querySelector('.knowledge-item')`, 'knowledge-conflicts-review-promoted');
    const conflictRevision = await renderer.evaluate(`(async () => {
      const seriesId = ${JSON.stringify(conflictSeed.seriesId)};
      const item = (await window.ai7.inspectSeries({ seriesId })).knowledge.items[0];
      const promoted = { itemId: item.itemId, revisionId: item.current.revisionId };
      const candidate = await window.ai7.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId: promoted.itemId }, content: '后来的冲突版本', span: null });
      const next = await window.ai7.inspectSeriesKnowledgeReview({ seriesId, candidateId: candidate.candidateId });
      await window.ai7.promoteSeriesKnowledge({ seriesId, candidateId: candidate.candidateId, candidateVersion: 1,
        reviewDigest: next.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'preserved' });
      return { seriesId, revisionId: promoted.revisionId };
    })()`);
    requireJourney(typeof conflictRevision?.revisionId === 'string', 'knowledge-conflicts-revision');
    await leaveSeries(renderer, 'knowledge-conflicts-leave');
    await openSeries(renderer, conflictSeed.seriesId, 'knowledge-conflicts-open');
    await clickSelector(renderer, '.knowledge-item-history summary', 'knowledge-conflicts-history');
    const olderConflict = '[data-knowledge-action="conflicts-read"][data-revision-id="' + conflictRevision.revisionId + '"]';
    await waitFor(renderer, `document.querySelector(${JSON.stringify(olderConflict)})?.disabled === false`, 'knowledge-conflicts-old-ready');
    await clickSelector(renderer, olderConflict, 'knowledge-conflicts-old');
    for (let pass = 0; pass < 2; pass += 1) {
      await waitFor(renderer, `document.querySelectorAll('.knowledge-conflicts-page li').length === 50 && document.querySelector('.knowledge-conflicts-heading')?.textContent === '第 1 版保留的冲突（共 51 项）' && document.activeElement === document.querySelector('.knowledge-conflicts-heading')`, 'knowledge-conflicts-first');
      await clickSelector(renderer, '[data-knowledge-action="conflicts-more"]', 'knowledge-conflicts-next');
      await waitFor(renderer, `document.querySelectorAll('.knowledge-conflicts-page li').length === 1 && document.querySelector('[data-knowledge-action="conflicts-reset"]')?.disabled === false && document.activeElement === document.querySelector('.knowledge-conflicts-heading')`, 'knowledge-conflicts-last');
      await clickSelector(renderer, '[data-knowledge-action="conflicts-reset"]', 'knowledge-conflicts-reset');
    }
    await waitFor(renderer, `document.querySelectorAll('.knowledge-conflicts-page li').length === 50 && document.querySelector('[data-knowledge-action="conflicts-close"]')?.disabled === false`, 'knowledge-conflicts-reset-ready');
    await clickSelector(renderer, '[data-knowledge-action="conflicts-close"]', 'knowledge-conflicts-close');
    await waitFor(renderer, `document.querySelector('.knowledge-conflicts-reader') === null && document.activeElement === document.querySelector(${JSON.stringify(olderConflict)})`, 'knowledge-conflicts-closed-focus');
    at('series-bounded-pages');
    // Real membership changes beyond one Book's history page, followed through the visible controls.
    requireJourney(await renderer.evaluate(`(async () => {
      for (let index = 0; index < 10; index += 1) for (const kind of ['add', 'remove']) {
        const input = { seriesId: ${JSON.stringify(seriesId)}, bookId: ${JSON.stringify(first)}, kind };
        const preview = await window.ai7.previewSeriesMembershipChange(input);
        await window.ai7.changeSeriesMembership({ ...input, previewDigest: preview.previewDigest });
      }
      return true;
    })()`), 'history-seed');
    await leaveSeries(renderer, 'history-pages');
    await bookSide(renderer, first, 'history-pages');
    await readBookSeries(renderer, (page) => page.history.length === 20, 'history-page-ready');
    await assertRenderer(renderer, `(() => { document.querySelector('details.book-series-history').open = true; return true; })()`, 'history-expand');
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await clickSelector(renderer, '[data-series-action="book-history-more"]', 'book-history-next');
      await waitFor(renderer, `document.querySelectorAll('details.book-series-history li.series-change').length === 2 && document.activeElement?.tagName === 'SUMMARY'`, 'book-history-bounded');
      await clickSelector(renderer, '[data-series-action="book-history-first"]', 'book-history-reset');
      await waitFor(renderer, `document.querySelectorAll('details.book-series-history li.series-change').length === 20`, 'book-history-first-page');
    }
    await backToLibrary(renderer, 'history-pages');
    // Empty runner-authored Books and Series through the real service; no fixture database or mocked page response.
    at('series-bounded-seed');
    requireJourney(await renderer.evaluate(`(async () => {
      for (let index = 0; index < 51; index += 1) {
        await window.ai7.createSeries({ title: '分页书系' + String(index).padStart(3, '0'), note: '' });
      }
      return true;
    })()`), 'page-series-created');
    const pageBooks = [];
    for (let index = 0; index < 51; index += 1) {
      // Creation binds this window to that Book. The real return action releases the route before the next creation.
      pageBooks.push(await createEmptyBook(renderer, '分页图书' + String(index).padStart(3, '0'), `page-book-${index}`));
      await backToLibrary(renderer, 'page-book-created');
    }
    requireJourney(pageBooks.length === 51 && new Set(pageBooks).size === 51 && pageBooks.every((id) => UUID_PATTERN.test(id)), 'page-books-created');
    at('series-bounded-navigation');
    await click(renderer, '书系', 'paged-series-list');
    await readSeriesList(renderer, (page) => page.items.length === 50, 'list-first-page');
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await clickSelector(renderer, '[data-series-action="list-more"]', 'list-next');
      await readSeriesList(renderer, (page) => page.items.length === 3 && page.focus === 'open', 'list-bounded');
      await clickSelector(renderer, '[data-series-action="list-first"]', 'list-reset');
      await readSeriesList(renderer, (page) => page.items.length === 50 && page.focus === 'open', 'list-reset-bounded');
    }
    await clickSelector(renderer, '[data-series-action="list-more"]', 'list-target-page');
    await readSeriesList(renderer, (page) => page.items.some(([id]) => id === seriesId), 'list-target-visible');
    await clickSelector(renderer, `[data-series-id="${seriesId}"] [data-series-action="open"]`, 'paged-series-open');
    await readSeries(renderer, (page) => page.seriesId === seriesId, 'paged-series-ready');
    await clickSelector(renderer, '[data-series-action="add-open"]', 'paged-chooser');
    await readSeries(renderer, (page) => page.chooser?.length === 50, 'chooser-first-page');
    await assertRenderer(renderer, `(() => { const radio = document.querySelector('input[name="series-add-book"]'); if (!(radio instanceof HTMLInputElement)) return false; radio.click(); return radio.checked; })()`, 'chooser-select');
    await clickSelector(renderer, '[data-series-action="add-more"]', 'chooser-next');
    await readSeries(renderer, (page) => page.chooser?.length === 4 && page.chooser.filter(([, checked]) => checked).length === 1 && page.lookDisabled === false, 'chooser-bounded-selection');
    await clickSelector(renderer, '[data-series-action="add-first"]', 'chooser-reset');
    await readSeries(renderer, (page) => page.chooser?.length === 50 && page.chooser.every(([, checked]) => !checked), 'chooser-reset-bounded');
    await clickSelector(renderer, '[data-series-action="add-more"]', 'chooser-next-again');
    await readSeries(renderer, (page) => page.chooser?.length === 3, 'chooser-last-page');
    await clickSelector(renderer, '[data-series-action="add-cancel"]', 'chooser-close');
    requireJourney(await renderer.evaluate(`(async () => {
      for (const bookId of ${JSON.stringify(pageBooks)}) {
        const input = { seriesId: ${JSON.stringify(seriesId)}, bookId, kind: 'add' };
        const preview = await window.ai7.previewSeriesMembershipChange(input);
        await window.ai7.changeSeriesMembership({ ...input, previewDigest: preview.previewDigest });
      }
      return true;
    })()`), 'member-pages-seed');
    await click(renderer, '返回书系', 'members-reload-list');
    await readSeriesList(renderer, (page) => page.items.length === 50, 'members-reload-first');
    await clickSelector(renderer, '[data-series-action="list-more"]', 'members-reload-target');
    await readSeriesList(renderer, (page) => page.items.some(([id]) => id === seriesId), 'members-target-visible');
    await clickSelector(renderer, `[data-series-id="${seriesId}"] [data-series-action="open"]`, 'members-reload');
    await readSeries(renderer, (page) => page.members.length === 50 && page.history.length === 20, 'members-first');
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await clickSelector(renderer, '[data-series-action="members-more"]', 'members-next');
      await readSeries(renderer, (page) => page.members.length === 3 && page.focus === 'remove-open', 'members-bounded');
      await clickSelector(renderer, '[data-series-action="members-first"]', 'members-reset');
      await readSeries(renderer, (page) => page.members.length === 50, 'members-reset-bounded');
      for (let next = 0; next < 3; next += 1) {
        await clickSelector(renderer, '[data-series-action="history-more"]', 'series-history-next');
        await waitFor(renderer, `document.querySelectorAll('ol.series-history > li').length === ${next === 2 ? 17 : 20} && document.activeElement?.matches('.series-history-section h3')`, 'series-history-bounded');
      }
      await clickSelector(renderer, '[data-series-action="history-first"]', 'series-history-reset');
      await readSeries(renderer, (page) => page.history.length === 20, 'series-history-reset-bounded');
    }

    at('knowledge-member-series-pages');
    // The same manuscript Book joins all fifty-one runner-authored Series while its editor is open (Issue #642): the first
    // selection menu after that shows the one Series the editor knew, then is drawn again with the first fifty. Proposal
    // selection must reach the tail.
    await leaveSeries(renderer, 'knowledge-member-series');
    await fill(renderer, '#book-filter-text', MEMBER, 'knowledge-member-series-find-text');
    await clickSelector(renderer, '[data-book-filter-action="find"]', 'knowledge-member-series-find');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] button[data-book-id=${JSON.stringify(member)}]')`, 'knowledge-member-series-found');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(member)}]`, 'knowledge-member-series-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(member)}]') && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')`, 'knowledge-member-series-editor', 120_000);
    await assertRenderer(renderer, MARK_HELPERS, 'knowledge-member-series-helpers');
    requireJourney(await renderer.evaluate(`(async () => {
      let after = null;
      do {
        const page = await window.ai7.inspectSeriesList({ after });
        for (const series of page.series) if (series.title.startsWith('分页书系')) {
          const input = { seriesId: series.seriesId, bookId: ${JSON.stringify(member)}, kind: 'add' };
          const preview = await window.ai7.previewSeriesMembershipChange(input);
          await window.ai7.changeSeriesMembership({ ...input, previewDigest: preview.previewDigest });
        }
        after = page.nextCursor;
      } while (after !== null);
      return (await window.ai7.inspectBookSeries({ bookId: ${JSON.stringify(member)} })).membershipCount === 52;
    })()`), 'knowledge-member-series-seed');
    await openSelectionMenu(renderer, blockId, 2, 8, 'knowledge-member-series-menu');
    await waitFor(renderer, `window.__j13.menu()?.querySelectorAll('[data-mark-action="propose-series-knowledge"]').length === 50`, 'knowledge-member-series-menu-follows', 15_000);
    await assertRenderer(renderer, `(() => { const item = window.__j13.item('choose-knowledge-series'); if (!(item instanceof HTMLButtonElement) || item.disabled) return false; item.click(); return true; })()`, 'knowledge-member-series-choose');
    const knowledgeChooser = '[data-mark-composer="choose-knowledge-series"]';
    await waitFor(renderer, `document.querySelectorAll('${knowledgeChooser} .knowledge-series-choices button').length === 50`, 'knowledge-member-series-first');
    for (let pass = 0; pass < 2; pass += 1) {
      await click(renderer, '下一页书系', 'knowledge-member-series-next');
      await waitFor(renderer, `document.querySelectorAll('${knowledgeChooser} .knowledge-series-choices button').length === 2`, 'knowledge-member-series-tail');
      await click(renderer, '回到第一页', 'knowledge-member-series-reset');
      await waitFor(renderer, `document.querySelectorAll('${knowledgeChooser} .knowledge-series-choices button').length === 50`, 'knowledge-member-series-reset-ready');
    }
    await click(renderer, '下一页书系', 'knowledge-member-series-next-final');
    await waitFor(renderer, `document.querySelectorAll('${knowledgeChooser} .knowledge-series-choices button').length === 2`, 'knowledge-member-series-tail-final');
    const offPage = await renderer.evaluate(`(() => { const item = Array.from(document.querySelectorAll('${knowledgeChooser} .knowledge-series-choices button')).find((node) => node.textContent === '分页书系050'); if (!(item instanceof HTMLButtonElement)) return null; const id = item.dataset.seriesId; item.click(); return id; })()`);
    requireJourney(UUID_PATTERN.test(offPage ?? ''), 'knowledge-member-series-tail-identity');
    await waitFor(renderer, `window.__j13.composer()?.dataset.markComposer === 'propose-series-knowledge'`, 'knowledge-member-series-composer');
    await assertRenderer(renderer, `window.__j13.composer().querySelector('[data-mark-quote]').textContent === ${JSON.stringify(quote)} && window.__j13.write('subject', '分页原文提议') && window.__j13.write('knowledgeClass', 'canon') && window.__j13.act('submit')`, 'knowledge-member-series-submit');
    await waitFor(renderer, `window.__j13.composer() === null && ${status} === '已提议为书系「分页书系050」的知识候选项'`, 'knowledge-member-series-proposed');
    requireJourney(await renderer.evaluate(`(async () => {
      const page = await window.ai7.inspectSeriesKnowledgeCandidates({ seriesId: ${JSON.stringify(offPage)}, after: null });
      const candidate = page.candidates[0];
      const source = candidate?.provenance;
      return page.candidates.length === 1 && candidate.authoring === 'manuscript-revision' && source?.bookId === ${JSON.stringify(member)} &&
        source.blockId === ${JSON.stringify(blockId)} && source.fromGrapheme === 2 && source.toGrapheme === 8 && source.quote === ${JSON.stringify(quote)};
    })()`), 'knowledge-member-series-provenance');

    // ---- 可复用工序 (Issue #65, plan slice S30; ADR 0087; V2-UX-REUSE-001 to 020, 029 to 031, 063 to 066, KB-010) ---------
    at('capture-source-review');
    // A window whose service binds the J-04 model adapter over the authored review fixture, whose picker still serves exact
    // sample1, and whose Save dialog answers the 开发建议's 导出为文件… once. The member Book, 星河之三, reviews 体例与格式 and
    // 文学性与表达改进 over the whole book from the drawer's 开始任务; a Run chosen by hand pins no procedure, and once finished
    // it offers the capture beside its report.
    const proposalPath = resolve(runRoot, PROPOSAL_FILE_NAME);
    await closeBrowser();
    manager = await launch(REVIEW_FIXTURE_IDENTITY, ['--j13-save-path', proposalPath]);
    renderer = await waitForRenderer(manager, 'capture-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'capture-ready');
    await openBookReview(renderer, MEMBER, member, 'capture-source-review');
    await clickSelector(renderer, '[data-review-action="new-review"]', 'capture-source-new-review');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true && document.querySelector('[data-review-field="procedure"]')`, 'capture-source-sheet');
    await assertRenderer(renderer, `(() => { const sheet=document.querySelector('dialog.review-sheet'); for (const id of ['style-and-format','literary-expression']) { const box=sheet.querySelector('input[name="review-category"][value="'+id+'"]'); if(!(box instanceof HTMLInputElement)||box.disabled)return false; box.click(); } const whole=sheet.querySelector('input[name="review-scope"][value="whole"]'); if(!(whole instanceof HTMLInputElement)||whole.disabled)return false; whole.click(); const prepare=sheet.querySelector('[data-review-action="prepare"]'); if(!(prepare instanceof HTMLButtonElement)||prepare.disabled)return false; prepare.click(); return true; })()`, 'capture-source-prepare');
    const sourceRun = await startPreparedReview(renderer, 'capture-source-run');
    // The member's 第 3 次审阅, after 书系一致性's two: the capture names it by those words, so the Journey pins it by its ordinal here.
    requireJourney(sourceRun?.state === 'settled' && sourceRun.ordinal === 3 && sourceRun.procedure === null && sourceRun.capture?.available === true &&
      JSON.stringify(sourceRun.categories.map((category) => [category.categoryId, category.state])) === JSON.stringify([['style-and-format', 'settled'], ['literary-expression', 'settled']]),
    'capture-source-settled', { state: sourceRun?.state, ordinal: sourceRun?.ordinal, capture: sourceRun?.capture });

    at('capture-source-set');
    // 将以上工序保存为可复用工序: the source set — both categories, each kept — the classification it recommends and why, what
    // extraction keeps and what it never saves. Removing a step changes what it keeps; nothing can be added or reordered.
    await clickSelector(renderer, 'section.review-report [data-review-action="capture"]', 'capture-open');
    const captureSheet = await readCapture(renderer, (read) => read.steps.length === 2 && read.focused, 'capture-sheet');
    requireJourney(JSON.stringify(captureSheet.steps.map(([id, eligible, checked]) => [id, eligible, checked])) === JSON.stringify([['style-and-format', 'true', true], ['literary-expression', 'true', true]]) &&
      captureSheet.steps[0][3] === '体例与格式 · 体例与格式审阅工序（第 1 版） · 输出批注 · 调用模型 · 不使用搜索引擎' &&
      JSON.stringify(captureSheet.kinds) === JSON.stringify([['captured-procedure', false, true], ['developer-proposal', false, false], ['skill-draft', true, false], ['workflow-draft', true, false], ['default-rule', true, false]]) &&
      captureSheet.kind === 'captured-procedure' && captureSheet.procedureShown && !captureSheet.proposalShown && captureSheet.notSaved.length === 6 &&
      captureSheet.notSaved[0] === '稿件文字、书名与这本书的身份、章节与书系' && (captureSheet.why ?? '').startsWith('这次审阅的每一步都是 AI7 已有的审阅类别') &&
      captureSheet.extract[1] === '步骤（按顺序）：体例与格式 → 文学性与表达改进' && captureSheet.extract[2] === '参数：审阅范围「全书」',
    'capture-sheet-words', captureSheet);
    await clickSelector(renderer, 'dialog.procedure-capture input[name="capture-step"][value="literary-expression"]', 'capture-remove-step');
    await fill(renderer, 'dialog.procedure-capture [data-capture-field="title"]', PROCEDURE_TITLE, 'capture-title');
    const trimmed = await readCapture(renderer, (read) => read.kept === 'style-and-format', 'capture-step-removed');
    requireJourney(trimmed.extract[0] === `用途：《${PROCEDURE_TITLE}》` && trimmed.extract[1] === '步骤（按顺序）：体例与格式' &&
      trimmed.extract[3] === '输出：批注', 'capture-extract-words', trimmed.extract);

    at('capture-save');
    // 保存为可复用工序: version 1, 待验证 — nothing runs, and the document holds nothing of the Book.
    await clickSelector(renderer, 'dialog.procedure-capture [data-capture-action="save"]', 'capture-save');
    await waitFor(renderer, `!document.querySelector('dialog.procedure-capture') && ${status}===${JSON.stringify(`已保存《${PROCEDURE_TITLE}》第 1 版 · 待验证；在知识库「工序与规则」里验证并启用后才能运行。`)}`, 'capture-saved');
    const savedProcedures = await renderer.evaluate(`window.ai7.inspectCapturedProcedures()`);
    const procedureId = savedProcedures?.procedures?.[0]?.procedureId;
    requireJourney(savedProcedures?.procedures?.length === 1 && UUID_PATTERN.test(procedureId ?? '') && savedProcedures.procedures[0].latestState === 'pending-validation',
      'capture-saved-service', savedProcedures?.procedures?.[0]);
    const savedVersion = (await renderer.evaluate(`window.ai7.inspectCapturedProcedure({ procedureId: ${JSON.stringify(procedureId)}, before: null })`))?.versions?.[0];
    // Its source is the Run this stage ran, by identity, not only by the words that name it.
    requireJourney(savedVersion?.source?.bookId === member && savedVersion.source.reviewRunId === sourceRun.reviewRunId &&
      JSON.stringify(savedVersion.steps.map((step) => step.categoryId)) === JSON.stringify(['style-and-format']),
      'capture-saved-version', savedVersion);
    const storedDocument = (() => {
      const database = new DatabaseSync(resolve(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try { return database.prepare('SELECT document_json FROM captured_procedure_versions').all().map((row) => row.document_json); } finally { database.close(); }
    })();
    requireJourney(storedDocument.length === 1 && !storedDocument[0].includes(member) && !storedDocument[0].includes(MEMBER) &&
      !storedDocument[0].includes(sourceRun.reviewRunId) && JSON.parse(storedDocument[0]).schema === 'ai7.captured-procedure/1', 'capture-document-holds-no-book');

    at('capture-developer-proposal');
    // The same capture as a 开发建议: kept only here, its affected 工序 named by the steps, never sent.
    await clickSelector(renderer, 'section.review-report [data-review-action="capture"]', 'proposal-open');
    await readCapture(renderer, (read) => read.focused, 'proposal-sheet');
    await clickSelector(renderer, 'dialog.procedure-capture input[name="capture-kind"][value="developer-proposal"]', 'proposal-kind');
    const proposalSheet = await readCapture(renderer, (read) => read.kind === 'developer-proposal', 'proposal-kind-chosen');
    requireJourney(proposalSheet.proposalShown && !proposalSheet.procedureShown && proposalSheet.affected === '体例与格式、文学性与表达改进', 'proposal-sheet-words', proposalSheet);
    await fill(renderer, 'dialog.procedure-capture [data-capture-field="proposal-title"]', PROPOSAL_TITLE, 'proposal-title');
    await fill(renderer, 'dialog.procedure-capture [data-capture-field="missing-capability"]', '核对图注与正文图号是否一致。', 'proposal-capability');
    await clickSelector(renderer, 'dialog.procedure-capture [data-capture-action="save"]', 'proposal-save');
    await waitFor(renderer, `!document.querySelector('dialog.procedure-capture') && ${status}===${JSON.stringify(`已保存开发建议《${PROPOSAL_TITLE}》第 1 版；只记在本机，AI7 不会发送它。`)}`, 'proposal-saved');

    at('capture-validate-enable');
    // 知识库 › 工序与规则 lists it apart from the built-in 工序: dashed 待验证. Its versions open a page at a time; 验证并启用…
    // previews version 1 — today's 体例条款 the same as the source Run's — and 确认启用 makes it 已启用, solid, runnable.
    await leaveReviewToLibrary(renderer, 'validate-leave');
    await openProcedures(renderer, 'validate');
    const pending = await readProcedures(renderer, (page) => page.count === '1' && page.proposalCount === '1', 'validate-listed');
    requireJourney(pending.procedures[0].title === `《${PROCEDURE_TITLE}》` && pending.procedures[0].runnable === 'false' && !pending.procedures[0].run &&
      pending.procedures[0].latest === 'pending-validation' && pending.procedures[0].pill === '待验证' && pending.procedures[0].pillBorder === 'dashed' &&
      pending.procedures[0].versions.length === 0 && pending.proposals[0].title === `《${PROPOSAL_TITLE}》` && pending.proposals[0].versionCount === '1',
    'validate-pending', pending);
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-procedure-action="versions"]`, 'validate-versions');
    const opened = await readProcedures(renderer, (page) => page.procedures[0]?.versions.length === 1, 'validate-versions-open');
    // The member Book's third Review Run: its first finished and its second stopped at the 书系检索排除 (S29b) above.
    requireJourney(opened.procedures[0].versions[0].source.startsWith(`来自《${MEMBER}》第 3 次审阅`) &&
      JSON.stringify(opened.procedures[0].versions[0].actions) === JSON.stringify(['validate', 'stop']), 'validate-version-words', opened.procedures[0].versions[0]);
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-version="1"] [data-procedure-action="validate"]`, 'validate-open');
    const validationPreview = await readProcedures(renderer, (page) => page.procedures[0]?.versions[0]?.validation === 'true', 'validate-preview');
    requireJourney(JSON.stringify(validationPreview.procedures[0].versions[0].guidelines) === JSON.stringify(['体例条款（AI7 内置默认）第 1 版 · 与来源审阅相同']),
      'validate-preview-words', validationPreview.procedures[0].versions[0]);
    await waitFor(renderer, `document.activeElement === document.querySelector('.captured-procedure-validation h5')`, 'validate-preview-focused', 10_000);
    await clickSelector(renderer, '.captured-procedure-validation [data-procedure-action="confirm-enable"]', 'validate-confirm');
    const enabled = await readProcedures(renderer, (page) => page.procedures[0]?.versions[0]?.state === 'enabled', 'validate-enabled');
    requireJourney(enabled.procedures[0].runnable === 'true' && enabled.procedures[0].run && enabled.procedures[0].pill === '已启用' &&
      enabled.procedures[0].pillBorder === 'solid' && enabled.procedures[0].versions[0].validation === null, 'validate-enabled-card', enabled.procedures[0]);
    await waitFor(renderer, `${status}===${JSON.stringify(`已启用《${PROCEDURE_TITLE}》第 1 版；在一本书的新建审阅里可以按它运行。`)}`, 'validate-enabled-status', 10_000);

    at('capture-run-second-book');
    // A second Book from exact sample1 (this window's picker answer), a distinct intended work, its 方案 enabled. 运行此工序…
    // opens its 审阅 with 新建审阅 filled from version 1 — 体例与格式 ticked and locked, the whole book — and the ordinary plan and
    // 开始任务 run it; the Run pins version 1.
    await click(renderer, '返回', 'run-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'run-landing');
    const targetBook = await importSample1(renderer, CAPTURE_TARGET_TITLE, sample1, 'run-import', true);
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'run-profile-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'run-profile-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'run-profile-enabled', 60_000);
    await backToLibrary(renderer, 'run-profile');
    await openProcedures(renderer, 'run');
    await readProcedures(renderer, (page) => page.procedures[0]?.run === true, 'run-listed');
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-procedure-action="run"]`, 'run-open');
    await waitFor(renderer, `document.querySelector('[data-procedure-field="run-book"]')`, 'run-chooser');
    await assertRenderer(renderer, `(() => { const select=document.querySelector('[data-procedure-field="run-book"]'); if(!(select instanceof HTMLSelectElement))return false; const values=Array.from(select.options, (option)=>option.value); if(!values.includes(${JSON.stringify(targetBook)}) || !values.includes(${JSON.stringify(member)}) || values.length!==2)return false; select.value=${JSON.stringify(targetBook)}; select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`, 'run-choose-book');
    await clickSelector(renderer, '[data-procedure-action="open-run"]', 'run-open-review');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true && document.querySelector('.review-sheet-procedure')?.dataset.procedureVersion==='1'`, 'run-sheet-filled', 60_000);
    const filled = await renderer.evaluate(`(() => {
      const sheet=document.querySelector('dialog.review-sheet');
      return {
        procedure: sheet.querySelector('[data-review-field="procedure"]')?.value ?? null,
        checked: Array.from(sheet.querySelectorAll('input[name="review-category"]:checked'), (input) => input.value),
        enabled: Array.from(sheet.querySelectorAll('input[name="review-category"]:not(:disabled)'), (input) => input.value),
        scope: sheet.querySelector('input[name="review-scope"]:checked')?.value ?? null,
        lines: Array.from(sheet.querySelectorAll('.review-sheet-procedure-line'), (line) => line.textContent),
        book: document.querySelector('.book-review')?.dataset.bookId ?? null,
      };
    })()`);
    requireJourney(filled.procedure === procedureId && JSON.stringify(filled.checked) === JSON.stringify(['style-and-format']) && filled.enabled.length === 0 &&
      filled.scope === 'whole' && filled.book === targetBook &&
      JSON.stringify(filled.lines) === JSON.stringify([`按《${PROCEDURE_TITLE}》第 1 版：体例与格式；范围「全书」。类别已按它选好，计划照常先看。`]), 'run-sheet-words', filled);
    await clickSelector(renderer, 'dialog.review-sheet [data-review-action="prepare"]', 'run-prepare');
    const ran = await startPreparedReview(renderer, 'run-review');
    requireJourney(ran?.state === 'settled' && JSON.stringify(ran.categories.map((category) => category.categoryId)) === JSON.stringify(['style-and-format']) &&
      ran.procedure?.procedureId === procedureId && ran.procedure.version === 1 && ran.procedure.stopped === false && ran.procedure.missing === false &&
      ran.procedure.leftOut.length === 0, 'run-pinned', ran?.procedure);
    await assertRenderer(renderer, `document.querySelector('.review-procedure-pin .review-procedure-line')?.textContent===${JSON.stringify(`按可复用工序《${PROCEDURE_TITLE}》第 1 版`)}`, 'run-pin-shown');

    // ---- exact procedure versions (Issue #66, plan slice S31; UI ADR 0013; REUSE-031, REUSE-038 to REUSE-045, REUSE-054) -----
    at('procedure-second-version');
    // A next version from the member Book's same finished Review Run, both steps kept: 《体例复核》第 2 版 · 待验证. 验证并启用…
    // makes it 最新可用, the version a new use takes; version 1 stays 已启用 beside it, its Run in the second Book linked.
    await leaveReviewToLibrary(renderer, 'version-two-leave');
    await openBookReview(renderer, MEMBER, member, 'version-two-review');
    await clickSelector(renderer, 'section.review-report [data-review-action="capture"]', 'version-two-capture');
    await readCapture(renderer, (read) => read.steps.length === 2 && read.focused, 'version-two-sheet');
    await assertRenderer(renderer, `(() => { const select=document.querySelector('dialog.procedure-capture [data-capture-field="target"]'); if(!(select instanceof HTMLSelectElement))return false; select.value=${JSON.stringify(procedureId)}; select.dispatchEvent(new Event('change',{bubbles:true})); return select.value===${JSON.stringify(procedureId)}; })()`, 'version-two-target');
    await readCapture(renderer, (read) => read.kept === 'style-and-format,literary-expression', 'version-two-kept');
    await clickSelector(renderer, 'dialog.procedure-capture [data-capture-action="save"]', 'version-two-save');
    await waitFor(renderer, `!document.querySelector('dialog.procedure-capture') && ${status}===${JSON.stringify(`已保存《${PROCEDURE_TITLE}》第 2 版 · 待验证；在知识库「工序与规则」里验证并启用后才能运行。`)}`, 'version-two-saved');
    await leaveReviewToLibrary(renderer, 'version-two-validate-leave');
    await openProcedures(renderer, 'version-two-validate');
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-procedure-action="versions"]`, 'version-two-versions');
    const waitingTwo = await readProcedures(renderer, (page) => page.procedures[0]?.versions.length === 2, 'version-two-listed');
    requireJourney(JSON.stringify(waitingTwo.procedures[0].versions.map((version) => [version.version, version.state, version.latestEligible])) ===
      JSON.stringify([['2', 'pending-validation', 'false'], ['1', 'enabled', 'true']]) && waitingTwo.procedures[0].versions[1].eligiblePill === '最新可用',
    'version-two-pending', waitingTwo.procedures[0].versions);
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-version="2"] [data-procedure-action="validate"]`, 'version-two-validate');
    await readProcedures(renderer, (page) => page.procedures[0]?.versions[0]?.validation === 'true', 'version-two-preview');
    await clickSelector(renderer, '.captured-procedure-validation [data-procedure-action="confirm-enable"]', 'version-two-confirm');
    const enabledTwo = await readProcedures(renderer, (page) => page.procedures[0]?.versions[0]?.state === 'enabled', 'version-two-enabled');
    requireJourney(JSON.stringify(enabledTwo.procedures[0].versions.map((version) => [version.version, version.state, version.latestEligible, version.eligiblePill])) ===
      JSON.stringify([['2', 'enabled', 'true', '最新可用'], ['1', 'enabled', 'false', null]]) && enabledTwo.procedures[0].versions[1].runLinks.length === 1 &&
      enabledTwo.procedures[0].versions[1].runLinks[0][1].startsWith(`《${CAPTURE_TARGET_TITLE}》第 1 次审阅 · 已完成 · `), 'version-two-latest-eligible', enabledTwo.procedures[0].versions);

    at('procedure-exact-version');
    // The second Book's 新建审阅 fills from version 2, 最新可用, both steps ticked; the version can be changed before the plan:
    // version 1 chosen instead says so, ticks its one step, and the prepared Run pins exactly version 1 (REUSE-054, REUSE-045).
    await click(renderer, '返回', 'exact-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'exact-landing');
    await openBookReview(renderer, CAPTURE_TARGET_TITLE, targetBook, 'exact-review');
    await clickSelector(renderer, '[data-review-action="new-review"]', 'exact-new-review');
    await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open===true && document.querySelector('[data-review-field="procedure"]')`, 'exact-sheet');
    await assertRenderer(renderer, `(() => { const select=document.querySelector('dialog.review-sheet [data-review-field="procedure"]'); if(!(select instanceof HTMLSelectElement)||select.disabled)return false; select.value=${JSON.stringify(procedureId)}; select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`, 'exact-choose-procedure');
    const latestSheet = await readUntil(renderer, READ_SHEET_PROCEDURE, (read) => read?.version === '2', 'exact-latest-filled');
    requireJourney(latestSheet.latestEligible === 'true' && JSON.stringify(latestSheet.options) === JSON.stringify(['第 2 版（最新可用）', '第 1 版']) &&
      latestSheet.chosen === 0 && latestSheet.versionDisabled === false && JSON.stringify(latestSheet.checked) === JSON.stringify(['style-and-format', 'literary-expression']) &&
      latestSheet.lines[0] === `按《${PROCEDURE_TITLE}》第 2 版：体例与格式 → 文学性与表达改进；范围「全书」。类别已按它选好，计划照常先看。`, 'exact-latest-words', latestSheet);
    await assertRenderer(renderer, `(() => { const select=document.querySelector('dialog.review-sheet [data-review-field="procedure-version"]'); if(!(select instanceof HTMLSelectElement)||select.disabled)return false; select.selectedIndex=1; select.dispatchEvent(new Event('change',{bubbles:true})); const prepare=document.querySelector('dialog.review-sheet [data-review-action="prepare"]'); return prepare instanceof HTMLButtonElement && prepare.disabled && select.disabled && document.querySelector('.review-sheet-procedure')?.dataset.procedureLoading==='true'; })()`, 'exact-choose-version');
    // While the chosen version loads, 先看计划 and the selectors wait: nothing is prepared from the version on show before its
    // answer fills the sheet (S31 review P2-1).
    const olderSheet = await readUntil(renderer, READ_SHEET_PROCEDURE, (read) => read?.version === '1', 'exact-older-filled');
    requireJourney(olderSheet.latestEligible === 'false' && olderSheet.chosen === 1 && JSON.stringify(olderSheet.checked) === JSON.stringify(['style-and-format']) &&
      olderSheet.lines.includes('你选了第 1 版；最新可用的是第 2 版。'), 'exact-older-words', olderSheet);
    await waitFor(renderer, `document.activeElement === document.querySelector('dialog.review-sheet [data-review-field="procedure-version"]')`, 'exact-version-focused', 10_000);
    await clickSelector(renderer, 'dialog.review-sheet [data-review-action="prepare"]', 'exact-prepare');
    await waitFor(renderer, `document.querySelector('.review-workspace-card')?.dataset.reviewState==='prepared'`, 'exact-prepared', 180_000);
    const exactRun = (await renderer.evaluate(`window.ai7.inspectReviewWorkspace()`))?.run;
    requireJourney(exactRun?.state === 'prepared' && exactRun.procedure?.procedureId === procedureId && exactRun.procedure.version === 1 &&
      exactRun.procedure.stopped === false && JSON.stringify(exactRun.categories.map((category) => category.categoryId)) === JSON.stringify(['style-and-format']),
    'exact-pinned', exactRun?.procedure);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef===${JSON.stringify(exactRun.reviewRunId)} && document.querySelector('#task-drawer')?.dataset.taskPlanState==='ready'`, 'exact-drawer');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'exact-drawer-close');
    await waitFor(renderer, `document.body.dataset.taskDrawer !== 'open'`, 'exact-drawer-closed');

    at('capture-stop');
    // 停用… of version 1 shows what it touches before anything is stopped: the prepared Run in the second Book is prepared again,
    // both Runs keep naming it, a new use takes version 2, nothing is deleted (REUSE-038, REUSE-040, REUSE-041). 确认停用 makes
    // version 1 final; version 2 stays 最新可用. A linked Run opens that exact Run, which keeps naming the stopped version (REUSE-031).
    await leaveReviewToLibrary(renderer, 'stop-leave');
    await openProcedures(renderer, 'stop');
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-procedure-action="versions"]`, 'stop-versions');
    const beforeStop = await readProcedures(renderer, (page) => page.procedures[0]?.versions[1]?.runLinks.length === 2, 'stop-listed');
    const versionOne = beforeStop.procedures[0].versions[1];
    requireJourney(versionOne.version === '1' && versionOne.runs === '按这一版运行过 1 次；另有 1 次已准备、未开始' &&
      versionOne.runLinks[0][0] === exactRun.reviewRunId && versionOne.runLinks[0][1].startsWith(`《${CAPTURE_TARGET_TITLE}》第 2 次审阅 · 计划已冻结 · 待授权 · `) &&
      versionOne.runLinks[1][0] === ran.reviewRunId, 'stop-runs-before', versionOne);
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-version="1"] [data-procedure-action="stop"]`, 'stop-version');
    const stopPreview = await readProcedures(renderer, (page) => page.procedures[0]?.versions[1]?.stop !== null, 'stop-preview');
    const previewRead = stopPreview.procedures[0].versions[1].stop;
    requireJourney(stopPreview.procedures[0].versions[1].state === 'enabled' && previewRead.heading === `停用《${PROCEDURE_TITLE}》第 1 版` && previewRead.after === '2' &&
      JSON.stringify(previewRead.versions) === JSON.stringify([['1', '1', '0']]) &&
      JSON.stringify(previewRead.prepared) === JSON.stringify([`《${CAPTURE_TARGET_TITLE}》第 2 次审阅 · 计划已冻结 · 待授权`]) &&
      previewRead.afterLine === '停用后，新建审阅按这个工序运行时用第 2 版。' && (previewRead.kept ?? '').startsWith('不会删除任何东西'), 'stop-preview-words', previewRead);
    await waitFor(renderer, `document.activeElement === document.querySelector('.captured-procedure-stop h5')`, 'stop-preview-focused', 10_000);
    await clickSelector(renderer, '.captured-procedure-stop [data-procedure-action="confirm-stop"]', 'stop-confirm');
    const stopped = await readProcedures(renderer, (page) => page.procedures[0]?.versions[1]?.state === 'stopped', 'stop-stopped');
    const [stoppedTwo, stoppedOne] = stopped.procedures[0].versions;
    requireJourney(stopped.procedures[0].runnable === 'true' && stopped.procedures[0].run && stoppedOne.pill === '已停用' && stoppedOne.pillBorder === 'dotted' &&
      stoppedOne.actions.length === 0 && stoppedOne.stop === null && stoppedOne.runs === '按这一版运行过 1 次；另有 1 次已准备、未开始' && stoppedTwo.latestEligible === 'true' &&
      stoppedTwo.state === 'enabled', 'stop-card', stopped.procedures[0]);
    await waitFor(renderer, `${status}===${JSON.stringify(`已停用《${PROCEDURE_TITLE}》的这一版；按它运行过的审阅仍然记着它。`)}`, 'stop-status', 10_000);
    await clickSelector(renderer, `[data-version="1"] button.captured-procedure-run-link[data-review-run-id="${ran.reviewRunId}"]`, 'stop-open-linked-run');
    await waitFor(renderer, `document.querySelector('[data-screen="book-review"] .book-review')?.dataset.bookId===${JSON.stringify(targetBook)} && document.querySelector('section.review-run')?.dataset.reviewRunId===${JSON.stringify(ran.reviewRunId)}`, 'stop-linked-run-open', 60_000);
    await waitFor(renderer, `document.querySelector('.review-procedure-pin')?.dataset.procedureStopped==='true' && document.querySelector('.review-procedure-pin')?.dataset.procedureVersion==='1'`, 'stop-pin-kept', 30_000);
    await leaveReviewToLibrary(renderer, 'stop-review-leave');

    at('procedure-stop-all');
    // 全部停用… takes what is left — version 2 — and says no version will run afterwards; confirmed, the procedure no longer runs
    // and both versions stay listed with their history.
    await openProcedures(renderer, 'stop-all');
    await readProcedures(renderer, (page) => page.procedures[0]?.run === true, 'stop-all-listed');
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] [data-procedure-action="stop-all"]`, 'stop-all-open');
    const allPreview = (await readProcedures(renderer, (page) => page.procedures[0]?.stopAll !== null, 'stop-all-preview')).procedures[0].stopAll;
    requireJourney(allPreview.heading === `停用《${PROCEDURE_TITLE}》尚未停用的 1 个版本` && allPreview.after === '' && JSON.stringify(allPreview.versions) === JSON.stringify([['2', '0', '0']]) &&
      allPreview.afterLine === '停用后，这个工序没有可以运行的版本；要再用它，请从一次新的审阅重新保存。', 'stop-all-words', allPreview);
    await clickSelector(renderer, `[data-procedure-id="${procedureId}"] > .captured-procedure-stop [data-procedure-action="confirm-stop"]`, 'stop-all-confirm');
    const allStopped = await readProcedures(renderer, (page) => page.procedures[0]?.runnable === 'false', 'stop-all-stopped');
    requireJourney(!allStopped.procedures[0].run && allStopped.procedures[0].pill === '已停用' && allStopped.procedures[0].pillBorder === 'dotted' &&
      allStopped.procedures[0].stopAll === null, 'stop-all-card', allStopped.procedures[0]);
    await click(renderer, '返回', 'stop-all-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'stop-all-landing');

    at('capture-proposal-file');
    // 导出为文件…: the platform Save dialog (this window's launch control answers it once); the file is the proposal in words
    // with its digest, and only its name is recorded. Nothing of either Book is in it.
    await openProcedures(renderer, 'proposal-file');
    await readProcedures(renderer, (page) => page.proposals.length === 1, 'proposal-file-listed');
    await clickSelector(renderer, '.developer-proposal [data-procedure-action="proposal-versions"]', 'proposal-file-versions');
    await readProcedures(renderer, (page) => page.proposals[0]?.versions.length === 1, 'proposal-file-versions-open');
    await clickSelector(renderer, '.developer-proposal [data-procedure-action="proposal-file"]', 'proposal-file-save');
    await waitFor(renderer, `${status}===${JSON.stringify(`已导出为文件「${PROPOSAL_FILE_NAME}」；AI7 不会发送它。`)}`, 'proposal-file-status', 30_000);
    const proposalFile = await readFile(proposalPath, 'utf8');
    requireJourney(proposalFile.startsWith(`# 开发建议：${PROPOSAL_TITLE}\n`) && proposalFile.includes('核对图注与正文图号是否一致。') &&
      proposalFile.includes('AI7 不会发送这份开发建议') && !proposalFile.includes(MEMBER) && !proposalFile.includes(member) && !proposalFile.includes(targetBook),
    'proposal-file-content');
    await readProcedures(renderer, (page) => JSON.stringify(page.proposals[0]?.versions) === JSON.stringify([['1', '1']]), 'proposal-file-recorded');

    at('capture-restart');
    // A restart keeps every version, its state and use, and the proposal's file record.
    await closeBrowser();
    manager = await launch();
    renderer = await waitForRenderer(manager, 'capture-restart-window');
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true' && document.querySelector('[data-screen="landing"]')`, 'capture-restart-ready');
    const keptOnRestart = await renderer.evaluate(`(async () => {
      const list = await window.ai7.inspectCapturedProcedures();
      const procedure = await window.ai7.inspectCapturedProcedure({ procedureId: ${JSON.stringify(procedureId)}, before: null });
      const proposal = await window.ai7.inspectDeveloperProposal({ proposalId: list.proposals[0].proposalId, before: null });
      return [list.procedures.length, procedure.runnable, procedure.versions.map((version) => [version.version, version.state, version.runCount]), proposal.versions[0].fileCount];
    })()`);
    requireJourney(JSON.stringify(keptOnRestart) === JSON.stringify([1, false, [[2, 'stopped', 0], [1, 'stopped', 1]], 1]), 'capture-restart-kept', keptOnRestart);

    at('j14-capture-keyboard-reflow-forced-colors');
    // Without a pointer: Tab reaches 修改… with its focus visible, and Enter opens the next version's form with focus on its title.
    await openProcedures(renderer, 'capture-keyboard');
    await readProcedures(renderer, (page) => page.proposals.length === 1, 'capture-keyboard-listed');
    await renderer.evaluate(`(() => { const active=document.activeElement; if(active instanceof HTMLElement)active.blur(); return true; })()`);
    let reached = false;
    for (let count = 0; count < 120 && !reached; count += 1) {
      await press(renderer, 'Tab');
      reached = await renderer.evaluate(`document.activeElement?.dataset.procedureAction==='revise-proposal' && document.activeElement.matches(':focus-visible')`).catch(() => false);
    }
    requireJourney(reached, 'capture-keyboard-focus');
    await activateFocused(renderer, 'Enter');
    await waitFor(renderer, `document.activeElement === document.querySelector('.developer-proposal-form [data-proposal-field="title"]')`, 'capture-keyboard-form', 10_000);
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root=document.documentElement; const parts=[...document.querySelectorAll('article.captured-procedure, article.developer-proposal, li.developer-proposal-version, form.developer-proposal-form')]; return parts.length===4 && parts.every((part)=>part instanceof HTMLElement && part.scrollWidth<=part.clientWidth+2) && root.scrollWidth<=root.clientWidth+2; })()`, 'capture-reflow', 10_000);
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const card = document.querySelector('article.captured-procedure');
      const proposal = document.querySelector('article.developer-proposal');
      const pill = document.querySelector('.captured-procedure-latest .captured-procedure-state-stopped');
      return card instanceof HTMLElement && getComputedStyle(card).borderTopStyle === 'solid' && proposal instanceof HTMLElement &&
        getComputedStyle(proposal).borderTopStyle === 'solid' && pill instanceof HTMLElement && getComputedStyle(pill).borderTopStyle === 'dotted';
    })()`, 'capture-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await clickSelector(renderer, '.developer-proposal-form [data-procedure-action="cancel-proposal"]', 'capture-keyboard-cancel');

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

main().catch((error) => reportJourneyFailure('J-13', location, error));
