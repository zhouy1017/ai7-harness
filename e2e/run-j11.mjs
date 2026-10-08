import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachProductOutput, installJourneyCancellationCleanup, journeyCheckFailure, localDebugEnabled, recordDebugDetail, reportJourneyFailure, settleOnBrowserDisconnect } from './controller.mjs';
import { assertSecretsAbsentFromDataRoot, recoverSyntheticCredentialCleanupState, removeSyntheticCredentialWithElectron } from './credential-cleanup.mjs';

// J-11 (Issue #431, plan slice S83): a Book's 作者, 责编 and 相关人 — the attribution dimensions later feedback and learning
// records name. Two empty Books are created through 新建图书, so this Journey reads no manuscript and composes no input:
// the people are what it proves, recorded on 工作概览, shown on 书库's cards, found by 书名, 作者 and 责编, and kept across a
// restart. Every name is an authored stand-in. Later J-11 slices (S38, S26, S27) add the feedback and learning records
// that attribute by them.
//
// Since #429 (S81a) J-11 also walks ②C 评估 on a third Book made from the one admitted input, exact `sample1`, through the
// product's own import: the editor's scores out of each item's 满分, a 不评 with its reason, the risk items capping 推荐出版,
// 保存评估 and 定稿, and 重新评估 compared with the version before — then 知识库 › 评估方案 counting its use. Every score and
// word is the Journey's own; nothing of the manuscript is read.
//
// Since #94 (S38) J-11 also walks ②A 分析反馈 on the same Book: its workspace profile enabled and one Main Editorial Role
// connection whose synthetic credential is saved and removed again, as J-16 makes them, then its first baseline run to its
// end on the J-04 model adapter. Every item of the revision offers 反馈…, with nothing judged and the tally saying so; an
// entry is judged 不准确 for a reason fitted to it, with a correction; the synopsis 不完整 in the editor's own words; the
// entry changed to 准确 as a successor the service keeps beside the first; the same judgment again refused as changing
// nothing; Enter and Escape without a pointer; the card at 200% and without colour; what nobody judged left unjudged and
// unlisted; and a restart moving nothing. Every correction and reason is the Journey's own stand-in.
//
// Since #61 (S26a) J-11 also walks the reason a Proposal Decision is asked for once, on two 修改建议 of its own words made on
// the same manuscript through the selection menu: 拒绝 asks why under 你的处理, and 不说明 records no more than that, never
// asked again on reopening; of the editor's own accord 补充原因… takes their words and 改原因… a successor; 接受并应用 asks
// too, and moving on without answering records nothing; Enter reaches the row without a pointer; a restart asks nothing.
//
// Since #61 (S26b) J-11 also walks 质量与学习 › 学习准入 on the material those records make: 待我处理 lists the Book once in
// 等待你的决定; its Review Card reads in place with the choice unselected and 仅纳入当前图书 recommended; a wider choice says
// its consequence first; one material is decided for the Book with the editor's note and the other left for later, which
// 待我处理 then says; Enter and Escape reach the card without a pointer; it reflows at 200% and keeps its borders without
// colour; and a restart moves nothing.
//
// Since #61 (S26c) 质量与学习 opens from the landing at 反馈历史, the passive history of the same Book's feedback: newest
// first, each entry's verdict and reason as it stands and nothing pending; filtered by 来源, and — once the Book's 作者 and
// 责编 are set on its 工作概览 — by them; each opening the exact record it came from.

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRST = Object.freeze({ title: '人员旅程甲' });
const SECOND = Object.freeze({ title: '人员旅程乙' });
const PEOPLE = Object.freeze({ authors: '周一、吴二', editors: '郑三', relatedRole: 'proofreader', relatedName: '王四' });
const PEOPLE_NOTE = '作者与责编用于标注和查找这本书，也是之后反馈与学习记录的归属；它们不是账号，也不决定谁能做什么。';
const SAMPLE1_PATH = resolve(ROOT, 'SampleBooks', 'sample1.docx');
const THIRD = Object.freeze({ title: '评估旅程丙' });
/**
 * The J-04 model adapter's fixture: AI7 初评's authored units and synthesis of exact `sample1` (Issue #429, S81b1), layered over
 * the base fixture that answers every unit, the reduction and the sample of the baseline analysis (Issue #94).
 */
const FIXTURE_IDENTITY = 'sample1-evaluation-authored';
/** AI7 初评's scores and lines as the authored fixture gives them, item by item (Issue #429, S81b1). */
const AI7_ITEM_LINES = [
  ['literary-quality', 'sufficient', '文学品质与作者声音：AI7 初评 16.5 / 20 · 依据充分度 充分（引用 19 个段落，分布在 8 个阅读范围）'],
  ['theme-and-context', 'fair', '主题、价值与社会文化语境：AI7 初评 15 / 20 · 依据充分度 一般（引用 6 个段落，分布在 3 个阅读范围）'],
  ['structure-and-coherence', 'sufficient', '结构、叙事逻辑与连贯：AI7 初评 15.5 / 20 · 依据充分度 充分（引用 16 个段落，分布在 8 个阅读范围）'],
  ['chinese-language', 'sufficient', '中文语言与表达：AI7 初评 14 / 20 · 依据充分度 充分（引用 9 个段落，分布在 7 个阅读范围）'],
  ['readers-and-market', 'insufficient', '读者与市场潜力：AI7 初评 12 / 20 · 依据充分度 不足（没有引用内容块）'],
];
/** 分析反馈's words the Journey writes: stand-ins of its own, never the manuscript's. */
const ENTITY_CORRECTION = '（旅程示例）应分作两个人物';
const SYNOPSIS_REASON = '（旅程示例）少了尾声';
const METRIC_NOTE = '只统计你明确给出的判断：没有判断的条目不算认可；这是对分析结果的评价，不代表事实核实，也不改变 AI7 的做法。';
/** 就地反馈轻问's suggestions and reason (Issue #61): the Journey's own words, never the manuscript's. */
const SUGGESTION_REJECTED = '（旅程示例一）';
const SUGGESTION_APPLIED = '（旅程示例二）';
const OWN_REASON = '（旅程示例）篇幅所限';
/** 学习准入's words (Issue #61, S26b): the Journey's note, and what the page says of every decision. */
const LEARNING_NOTE = '（旅程示例）只在这本书里参考';
/** 反馈历史's words (Issue #61, S26c), and the stand-in people the Journey gives 评估旅程丙. */
const FEEDBACK_HISTORY_NOTE = '这里只是记录你给过的反馈：不会催你补充原因，也不会把没有说明当作认可。';
const THIRD_PEOPLE = Object.freeze({ authors: '冯五', editors: '郑三', laterEditors: '王六' });
const LEARNING_BASIS = '学习准入策略还在「仅建议」阶段：没有批准任何可以自动纳入的材料或范围，所以每一条都由你决定。';
const LEARNING_INFLUENCE = '纳入以后，它只可能在所选范围内帮 AI7 以后的建议更接近你的判断：不会改动稿件或它来自的记录，不会自动生效为规则，不会启用记忆，也不会被发送出去。';
const BROWSER_CLOSE_TIMEOUT_MS = 25_000;
const BROWSER_CLOSE_TIMEOUT = journeyCheckFailure('J-11', 'browser-close-timeout');
let location = 'entry';
let electronExecutable;
let runnerLifecycleIncomplete = false;

function at(next) {
  location = next;
  if (localDebugEnabled()) recordDebugDetail('J-11', `at ${next}`);
}
function requireJourney(condition, name, detail) {
  if (condition) return;
  const error = journeyCheckFailure('J-11', name);
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
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-11', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(localDebugEnabled() || !Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-11' };
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
    server.once('error', () => rejectListen(journeyCheckFailure('J-11', 'loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' &&
      Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw journeyCheckFailure('J-11', 'loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j11-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(journeyCheckFailure('J-11', 'loopback-close')) : resolveClose());
      });
      requireJourney(!runtimeFault, 'loopback-runtime');
    },
  };
}

async function attachRenderer(browser, excludedTargetId = null) {
  const guard = (request) => settleOnBrowserDisconnect(browser, request);
  const root = await guard(browser.newBrowserCDPSession());
  const deadline = Date.now() + 60_000;
  let target;
  while (Date.now() < deadline) {
    const pages = (await guard(root.send('Target.getTargets'))).targetInfos.filter((item) => item.type === 'page' && item.targetId !== excludedTargetId);
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
    if (response.error) completion.reject(journeyCheckFailure('J-11', 'renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(journeyCheckFailure('J-11', 'renderer-cdp-timeout')); }, 60_000);
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
    targetId: target.targetId,
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
    if (await renderer.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-11', name);
}
async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Promise.resolve(${expression}).then((value)=>Boolean(value))`), name);
}
async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function clickSelector(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const button = document.querySelector(${JSON.stringify(selector)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); return input.value === ${JSON.stringify(value)}; })()`, name);
}
/** Enter as a keyboard sends it: only a key that carries its text activates the focused control or submits its form. */
async function pressEnter(renderer) {
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, text: '\r', unmodifiedText: '\r' });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
}
async function pressEscape(renderer) {
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...escape });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape });
}
async function choose(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const select = document.querySelector(${JSON.stringify(selector)}); if (!(select instanceof HTMLSelectElement)) return false; select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value === ${JSON.stringify(value)}; })()`, name);
}
/** Commit a date or exact-dimension filter as leaving the field does; input alone does not submit these filters. */
async function changeHistoryInput(renderer, filter, value, name) {
  await assertRenderer(renderer, `(() => {
    const input = document.querySelector(${JSON.stringify(`#feedback-filter-${filter}`)});
    if (!(input instanceof HTMLInputElement) || input.disabled) return false;
    input.focus();
    input.value = ${JSON.stringify(value)};
    if (input.value !== ${JSON.stringify(value)}) return false;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`, name);
}
async function toggleHistoryUnclassified(renderer, name) {
  await assertRenderer(renderer, `(() => {
    const input = document.querySelector('#feedback-filter-unclassified');
    if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox' || input.disabled) return false;
    input.focus(); input.click(); return true;
  })()`, name);
}
const status = `(document.querySelector('#persistence-status')?.textContent ?? '')`;
const peopleSection = '[data-screen="book-overview"] .book-people-slot > section.book-people';

/** 新建图书 with a title, through its review, onto the new Book's 工作概览; the Book's identity. */
async function createBook(renderer, title, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await click(renderer, '新建图书', `${name}-open`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-create"]')`, `${name}-form`);
  await fill(renderer, '#empty-book-title', title, `${name}-title`);
  await click(renderer, '复核创建', `${name}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-create-review"]')`, `${name}-review-ready`);
  await click(renderer, '新建图书', `${name}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"] .book-overview[data-manuscript-state="empty"]') && document.querySelector(${JSON.stringify(peopleSection)})`, `${name}-overview`);
  const bookId = await renderer.evaluate(`document.querySelector('[data-screen="book-overview"] .book-overview')?.dataset.bookId ?? null`);
  requireJourney(UUID_PATTERN.test(bookId ?? ''), `${name}-identity`);
  return bookId;
}

/** 返回图书列表 from 工作概览: the landing with 书库's list. */
async function backToLibrary(renderer, name) {
  await click(renderer, '返回图书列表', `${name}-back`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, `${name}-library`);
}

const CARDS = `Array.from(document.querySelectorAll('[data-screen="landing"] section.recent-work article.book-summary-item'), (card) => ({
  bookId: card.querySelector('button[data-book-id]')?.dataset.bookId ?? null,
  title: card.querySelector('button[data-book-id]')?.textContent ?? '',
  people: card.querySelector('.book-people-line')?.textContent ?? null,
  related: card.querySelector('.book-related-line')?.textContent ?? null,
}))`;

/** 查找图书 by one field: 查找 pressed, or — from the keyboard — Enter in the words. */
async function search(renderer, field, text, name, keyboard = false) {
  await choose(renderer, '#book-filter-field', field, `${name}-field`);
  await fill(renderer, '#book-filter-text', text, `${name}-text`);
  if (keyboard) {
    await assertRenderer(renderer, `(() => { const input = document.querySelector('#book-filter-text'); input?.focus(); return input !== null && document.activeElement === input; })()`, `${name}-focused`);
    await pressEnter(renderer);
  } else await clickSelector(renderer, '[data-book-filter-action="find"]', `${name}-find`);
  await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work')?.dataset.bookFilter === ${JSON.stringify(field)} && ${status} === '已列出找到的图书'`, `${name}-found`);
  return renderer.evaluate(CARDS);
}

/** Exact `sample1` through the import flow, as a new Book with its first manuscript; the Book's identity. */
async function importSample1(renderer, title, sample1, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await click(renderer, '导入稿件', `${name}-start`);
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${name}-target`);
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if(!(radio instanceof HTMLInputElement)||radio.checked)return false; radio.click(); return radio.checked; })()`, `${name}-target-explicit`);
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

/** ②C 评估 as the editor reads it: its versions, the version on show, its form and its conclusion, and where focus is. */
const READ_EVALUATION = `(() => {
  const host = document.querySelector('[data-screen="book-evaluation"] .evaluation');
  if (!(host instanceof HTMLElement)) return null;
  const record = host.querySelector('.evaluation-record');
  const active = document.activeElement;
  return {
    state: host.dataset.evaluation ?? null,
    empty: host.querySelector('.evaluation-empty')?.textContent ?? null,
    start: host.querySelector('[data-evaluation-action="start"]')?.textContent ?? null,
    startReason: host.querySelector('.evaluation-start-reason')?.textContent ?? null,
    versions: Array.from(host.querySelectorAll('.evaluation-version-list button'), (button) => button.textContent),
    refusal: host.querySelector('.evaluation-refusal')?.textContent ?? null,
    startFromInitial: host.querySelector('[data-evaluation-action="start-from-initial"]')?.textContent ?? null,
    initial: (() => {
      const section = host.querySelector('.evaluation-initial');
      return section === null ? null : {
        state: section.dataset.initialState ?? null,
        task: section.querySelector('.evaluation-initial-task')?.textContent ?? null,
        none: section.querySelector('.evaluation-initial-none')?.textContent ?? null,
        latest: section.querySelector('.evaluation-initial-latest')?.textContent ?? null,
        items: Array.from(section.querySelectorAll('.evaluation-initial-items li'), (line) => [line.dataset.itemId, line.dataset.sufficiency, line.textContent]),
        conclusion: section.querySelector('.evaluation-initial-conclusion')?.textContent ?? null,
        actions: Array.from(section.querySelectorAll('.evaluation-initial-actions button'), (button) => [button.dataset.evaluationAction, button.textContent, button.disabled]),
        reason: section.querySelector('.evaluation-initial-reason')?.textContent ?? null,
      };
    })(),
    record: record === null ? null : {
      state: record.dataset.evaluationState,
      entries: record.dataset.entries,
      heading: record.querySelector('h3')?.textContent ?? null,
      revision: record.querySelector('.evaluation-revision')?.textContent ?? null,
      finalized: record.querySelector('.evaluation-finalized')?.textContent ?? null,
      ai7: record.querySelector('.evaluation-ai7')?.textContent ?? null,
      total: record.querySelector('.evaluation-total')?.textContent ?? null,
      comparison: record.querySelector('.evaluation-comparison') === null ? null
        : [record.querySelector('.evaluation-comparison h4')?.textContent ?? null, ...Array.from(record.querySelectorAll('.evaluation-comparison li'), (item) => item.textContent)],
      items: Array.from(record.querySelectorAll('.evaluation-item'), (item) => {
        const band = item.querySelector('.evaluation-band');
        return [item.dataset.itemId, item.querySelector('legend')?.textContent ?? null, item.querySelector('[data-evaluation-field="score"]')?.value ?? null,
          band instanceof HTMLElement && !band.hidden ? band.textContent : null, item.querySelector('[data-evaluation-field="not-rated"]')?.checked ?? null];
      }),
      conclusions: Array.from(record.querySelectorAll('.evaluation-conclusion [data-conclusion]'), (choice) => [choice.dataset.conclusion, choice.querySelector('input')?.checked ?? null, choice.querySelector('input')?.disabled ?? null]),
      // AI7's score beside each item, whether 调分原因 is offered, and what is ticked (Issue #429, S81b1).
      ai7Items: Array.from(record.querySelectorAll('.evaluation-item'), (item) => {
        const group = item.querySelector('.evaluation-adjustment');
        return [item.dataset.itemId, item.querySelector('.evaluation-item-ai7')?.textContent ?? null, group instanceof HTMLElement ? !group.hidden : null,
          Array.from(item.querySelectorAll('[data-evaluation-field="adjustment-reason"]:checked'), (input) => input.value)];
      }),
      // What each of AI7's scores rests on (EVAL-006), and the ranges a 初评 with gaps never read (Issue #429 review).
      ai7Evidence: Array.from(record.querySelectorAll('.evaluation-item'), (item) => item.querySelector('.evaluation-item-ai7-evidence summary')?.textContent ?? null),
      ai7Unread: record.querySelector('.evaluation-ai7-unread')?.textContent ?? null,
      suggested: Array.from(record.querySelectorAll('.evaluation-conclusion [data-conclusion]'), (choice) => choice.querySelector('.evaluation-ai7-suggested')?.textContent ?? null),
      ai7Conclusion: record.querySelector('.evaluation-ai7-conclusion')?.textContent ?? null,
      blocked: record.querySelector('.evaluation-recommend-blocked')?.hidden === false,
      allDisabled: Array.from(record.querySelectorAll('input, textarea')).every((control) => control.disabled),
      actions: Array.from(record.querySelectorAll('.evaluation-actions button'), (button) => button.textContent),
    },
    focus: active instanceof HTMLElement ? (active.tagName === 'H3' ? 'heading' : active.dataset.evaluationAction ?? active.dataset.evaluationField ?? active.tagName) : null,
  };
})()`;
async function readEvaluation(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_EVALUATION).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-11', name);
  error.detail = page;
  throw error;
}
/** Check pending input in the click's own turn, before the awaited save can repaint or refuse. */
async function submitEvaluationWithPendingInput(renderer, action, name) {
  at('evaluation-pending-submit');
  await assertRenderer(renderer, `(() => {
    const record = document.querySelector('.evaluation-record');
    const button = record?.querySelector('[data-evaluation-action="${action}"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    const before = Array.from(record.querySelectorAll('input, select, textarea'), (control) => [control.value, control.checked ?? null, control.disabled]);
    window.__j11EvaluationSubmit = { before };
    button.click();
    // This synchronous turn cannot run the save's await continuation, including an immediate refusal.
    const controls = Array.from(record.querySelectorAll('input, select, textarea, button'));
    const score = record.querySelector('[data-evaluation-field="score"]');
    score.focus();
    record.querySelector('input[type="radio"]')?.click();
    document.execCommand('insertText', false, '9');
    const values = Array.from(record.querySelectorAll('input, select, textarea'), (control) => [control.value, control.checked ?? null]);
    return controls.length > 0 && controls.every((control) => control.disabled) && document.activeElement !== score &&
      JSON.stringify(values) === JSON.stringify(before.map((entry) => entry.slice(0, 2)));
  })()`, `${name}-pending-input-blocked`);
}

/** A response keeps the submitted values; a save or refusal also restores each field's prior availability. */
async function assertSubmittedEvaluation(renderer, restoreDisabled, name) {
  at('evaluation-submitted-values');
  await assertRenderer(renderer, `(() => {
    const submitted = window.__j11EvaluationSubmit;
    const after = Array.from(document.querySelectorAll('.evaluation-record input, .evaluation-record select, .evaluation-record textarea'), (control) => [control.value, control.checked ?? null, control.disabled]);
    const same = JSON.stringify(after.map((entry) => entry.slice(0, 2))) === JSON.stringify(submitted.before.map((entry) => entry.slice(0, 2)));
    const restored = ${JSON.stringify(restoreDisabled)} === false || JSON.stringify(after.map((entry) => entry[2])) === JSON.stringify(submitted.before.map((entry) => entry[2]));
    delete window.__j11EvaluationSubmit;
    return same && restored;
  })()`, name);
}

/** Click a checkbox or a radio of the form, as a pointer would. */
async function tick(renderer, selector, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement) || input.disabled) return false; input.click(); return true; })()`, name);
}
const item = (itemId) => `[data-screen="book-evaluation"] .evaluation-item[data-item-id="${itemId}"]`;
const risk = (riskId) => `[data-screen="book-evaluation"] .evaluation-risk[data-risk-id="${riskId}"]`;
const ITEM_LEGENDS = ['文学品质与作者声音 · 满分 20', '主题、价值与社会文化语境 · 满分 20', '结构、叙事逻辑与连贯 · 满分 20', '中文语言与表达 · 满分 20', '读者与市场潜力 · 满分 20'];

/** Open a Book with a manuscript from 书库 into its manuscript, then its 分析 (②A) from the 资料与记录 group, as J-16 does. */
async function openAnalysisOf(renderer, bookId, name) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${name}-landing`);
  await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(bookId)}]`, `${name}-book`);
  await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(bookId)}]')`, `${name}-manuscript`, 120_000);
  await assertRenderer(renderer, `(() => { const group=document.querySelector('.editor-shell nav.book-records-group'); const open=group?.querySelector('button[data-records-destination="analysis"]'); if(!(open instanceof HTMLButtonElement)||open.disabled||open.textContent!=='分析')return false; open.click(); return true; })()`, `${name}-analysis-entry`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-analysis"] .book-analysis[data-book-id=${JSON.stringify(bookId)}] .baseline-analysis-card')`, `${name}-analysis`);
}

/** The first baseline prepared from ②A's card and its plan open in the drawer, ready to start, as J-16 does. */
async function prepareFirstBaseline(renderer, readiness, name) {
  await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='available'`, `${name}-available`);
  await clickSelector(renderer, '.baseline-analysis-card [data-analysis-action="prepare"]', `${name}-prepare`);
  await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='prepared'`, `${name}-prepared`, 120_000);
  const showing = await renderer.evaluate(`(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawer==='open' && drawer.dataset.taskPlanKind==='baseline-analysis' && drawer.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId; })()`);
  if (!showing) await clickSelector(renderer, '.baseline-analysis-card [data-task-plan-open="baseline-analysis"]', `${name}-open-plan`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanKind==='baseline-analysis' && document.querySelector('#task-drawer')?.dataset.taskPlanRef===document.querySelector('.baseline-analysis-card')?.dataset.taskIntentId && document.querySelector('#task-drawer')?.dataset.taskPlanStart===${JSON.stringify(readiness)} && document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, `${name}-bar-ready`);
}

/**
 * ②A 分析反馈 as the editor reads it: each item by its place with its judgment, how many it holds, its recorded line and its
 * toggle; the one open card, with its choices, whether its words and correction show, 记录反馈 and any refusal; the Book's
 * tally; and where focus is. Nothing of an item's own reading is read, so nothing of the manuscript is carried.
 */
const READ_FEEDBACK = `(() => {
  const card = document.querySelector('[data-screen="book-analysis"] .baseline-analysis-card');
  if (!(card instanceof HTMLElement)) return null;
  const metric = card.querySelector('.analysis-feedback-metric');
  const open = card.querySelector('.analysis-feedback-card');
  const shown = (node) => node instanceof HTMLElement && !node.hidden;
  const active = document.activeElement;
  return {
    items: Array.from(card.querySelectorAll('[data-analysis-item-key]'), (item) => [
      item.dataset.analysisItemKey, item.dataset.analysisFeedbackJudgment ?? null, item.dataset.analysisFeedbackSignals ?? null,
      item.querySelector(':scope > .analysis-feedback > .analysis-feedback-line')?.textContent ?? null,
      item.querySelector(':scope > .analysis-feedback > [data-analysis-action="open-feedback"]')?.textContent ?? null,
    ]),
    card: open === null ? null : {
      item: open.closest('[data-analysis-item-key]')?.dataset.analysisItemKey ?? null,
      judgments: Array.from(open.querySelectorAll('.analysis-feedback-judgments input'), (input) => [input.value, input.checked]),
      reasons: shown(open.querySelector('.analysis-feedback-reasons'))
        ? Array.from(open.querySelectorAll('.analysis-feedback-reasons label'), (label) => [label.querySelector('input')?.value ?? null, label.textContent, label.querySelector('input')?.checked ?? null])
        : null,
      other: shown(open.querySelector('.analysis-feedback-other')),
      correction: shown(open.querySelector('.analysis-feedback-correction')),
      record: open.querySelector('[data-analysis-action="record-feedback"]')?.disabled === false ? 'enabled' : 'disabled',
      refusal: open.querySelector('.analysis-feedback-refusal')?.textContent ?? null,
    },
    metric: metric === null || metric.dataset.metricJudged === undefined ? null : {
      judged: metric.dataset.metricJudged,
      lineage: metric.dataset.metricLineage ?? null,
      total: metric.querySelector('.analysis-feedback-total')?.textContent ?? null,
      dimensions: Array.from(metric.querySelectorAll('.analysis-feedback-dimensions li'), (item) => item.textContent),
      note: metric.querySelector('.analysis-feedback-note')?.textContent ?? null,
    },
    focus: active instanceof HTMLElement && active.closest('[data-analysis-item-key]') !== null
      ? [active.closest('[data-analysis-item-key]').dataset.analysisItemKey, active.dataset.analysisAction ?? active.dataset.analysisFeedbackField ?? (active instanceof HTMLInputElement ? active.value : active.tagName)]
      : null,
  };
})()`;
async function readFeedback(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_FEEDBACK).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-11', name);
  error.detail = page;
  throw error;
}
const feedbackItem = (itemKey) => `[data-screen="book-analysis"] [data-analysis-item-key="${itemKey}"]`;
const rowOf = (page, itemKey) => page.items.find(([key]) => key === itemKey) ?? [];

// ---- the Mark surface, as J-05 acts on it (Issue #61, S26a) ---------------------------------------------------------------

// A hand on the manuscript: put a selection into a block by offset, right-click the way a pointer does, and act on the
// floating Mark surface by its data attributes. A block's durable text leaves out any preview's words.
const MARK_HELPERS = `(() => {
  if (window.__j11) return true;
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
  window.__j11 = {
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
    mark: (kind, id) => Array.from(block(id)?.querySelectorAll('.editorial-mark[data-mark-kind="' + kind + '"]') ?? []),
    menu: () => document.querySelector('.editorial-mark-menu-layer [data-mark-menu]'),
    item: (action) => document.querySelector('.editorial-mark-menu-layer [data-mark-menu] [data-mark-action="' + action + '"]'),
    card: () => layer()?.querySelector('[data-mark-card]') ?? null,
    composer: () => layer()?.querySelector('[data-mark-composer]') ?? null,
    act: (action) => {
      const control = layer()?.querySelector('[data-mark-card] [data-mark-action="' + action + '"], [data-mark-composer] [data-mark-action="' + action + '"]');
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

/** A menu opened with the pointer: the editor reads a selection a tick after the page sets it, so it is asked again until it shows. */
async function rightClickUntil(renderer, prepare, target, ready, name) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await assertRenderer(renderer, prepare, `${name}-prepare`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await assertRenderer(renderer, `window.__j11.rightClick(${target})`, `${name}-right-click`);
    if (await renderer.evaluate(`Boolean(${ready})`)) return;
    await pressEscape(renderer);
    await new Promise((resolveWait) => setTimeout(resolveWait, 120));
  }
  throw journeyCheckFailure('J-11', name);
}
async function openSelectionMenu(renderer, blockId, from, to, name) {
  await rightClickUntil(
    renderer,
    `window.__j11.place(${JSON.stringify(blockId)}, ${from}, ${to})`,
    `window.__j11.block(${JSON.stringify(blockId)})`,
    `window.__j11.menu()?.dataset.markMenu === 'selection' && window.__j11.menu().textContent.includes('已选 ${to - from} 字')`,
    name,
  );
}
async function chooseMenuItem(renderer, action, name) {
  await assertRenderer(renderer, `(() => { const item = window.__j11.item(${JSON.stringify(action)}); if (!(item instanceof HTMLButtonElement) || item.disabled) return false; item.click(); return true; })()`, name);
}
/** A pointer puts the caret down before its click arrives, and the editor reads that caret a tick later; asked again until it has. */
async function openMarkCard(renderer, kind, blockId, name) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await assertRenderer(renderer, `window.__j11.mark(${JSON.stringify(kind)}, ${JSON.stringify(blockId)}).length > 0 && window.__j11.place(${JSON.stringify(blockId)}, 0, 0)`, `${name}-caret`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    await assertRenderer(renderer, `window.__j11.mark(${JSON.stringify(kind)}, ${JSON.stringify(blockId)})[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })) || true`, `${name}-click`);
    const settle = Date.now() + 1_500;
    while (Date.now() < settle) {
      if (await renderer.evaluate(`window.__j11.card()?.dataset.markKind === ${JSON.stringify(kind)}`)) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  throw journeyCheckFailure('J-11', `${name}-card`);
}

/**
 * A 修改建议's card as the editor reads it after a decision: its reason's state; the one row asking why, with its question,
 * its chips (and whether any is pressed), `其他 / 自行输入` and how it ends; the reason recorded, with where it came from; the
 * editor's own `补充原因…` or `改原因…`; and where focus is. Nothing of the manuscript is read.
 */
const READ_DECISION = `(() => {
  const card = document.querySelector('.editorial-mark-layer [data-mark-card]');
  if (!(card instanceof HTMLElement)) return null;
  const yours = card.querySelector('[data-mark-region="disposition"]');
  const row = card.querySelector('[data-mark-reasons]');
  const reason = card.querySelector('[data-mark-reason]');
  const active = document.activeElement;
  return {
    state: yours?.dataset.markReasonState ?? null,
    applied: card.querySelector('[data-mark-application]') !== null,
    prompt: row === null ? null : {
      mode: row.dataset.markReasonMode ?? null,
      question: row.querySelector('p')?.textContent ?? null,
      chips: Array.from(row.querySelectorAll('[data-mark-reason-chip]'), (chip) => [chip.dataset.markReasonChip, chip.getAttribute('aria-pressed') === 'true']),
      own: row.querySelector('[data-mark-action="reason-own"]')?.textContent ?? null,
      end: row.querySelector('[data-mark-action="reason-dismiss"], [data-mark-action="reason-cancel"]')?.textContent ?? null,
    },
    reason: reason === null ? null : [reason.dataset.markReason ?? null, reason.textContent],
    reasonSource: card.querySelector('[data-mark-reason-source]')?.textContent ?? null,
    later: card.querySelector('[data-mark-action="reason-add"], [data-mark-action="reason-revise"]')?.textContent ?? null,
    focus: active instanceof HTMLElement && card.contains(active) ? (active.dataset.markReasonChip ?? active.dataset.markAction ?? active.tagName) : null,
  };
})()`;
async function readDecision(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let card = null;
  while (Date.now() < deadline) {
    card = await renderer.evaluate(READ_DECISION).catch(() => null);
    if (card !== null && predicate(card)) return card;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-11', name);
  error.detail = card;
  throw error;
}

// ---- 质量与学习 › 学习准入 as the editor reads it (Issue #61, S26b) --------------------------------------------------------

/** One 待我处理 item as the editor reads it: its group, state, Book, object, pill and next step. */
const readAttentionItem = (selector) => `(() => {
  const item = document.querySelector(${JSON.stringify(selector)});
  if (!(item instanceof HTMLElement)) return null;
  return {
    group: item.closest('section.global-attention-group')?.dataset.attentionGroup ?? null,
    state: item.dataset.attentionState ?? null,
    book: item.querySelector('.global-attention-book')?.textContent ?? null,
    object: item.querySelector('button.global-attention-open')?.textContent ?? null,
    pill: item.querySelector('.global-attention-pill')?.textContent ?? null,
    next: item.querySelector('.global-attention-next')?.textContent ?? null,
  };
})()`;

/**
 * 学习准入 as the editor reads it: each Book's heading and people, each material's kind, state and origin; the open Review
 * Card's heading, the heads of its excerpt lines and its last line, its facts, its choices and recommendation, the
 * consequence shown, 记录 and any refusal; and where focus is. The excerpt's manuscript words are never read.
 */
const READ_LEARNING = `(() => {
  const root = document.querySelector('[data-screen="quality-learning"] .learning-materials');
  if (!(root instanceof HTMLElement) || root.querySelector('.learning-basis') === null) return null;
  const card = root.querySelector('.learning-card');
  const active = document.activeElement;
  const kindOf = (node) => node?.dataset.materialKey?.split(':')[0] ?? null;
  const consequence = card?.querySelector('.learning-consequence');
  return {
    basis: root.querySelector('.learning-basis')?.textContent ?? null,
    books: Array.from(root.querySelectorAll('.learning-book'), (book) => ({
      bookId: book.dataset.bookId ?? null,
      heading: book.querySelector('h3')?.textContent ?? null,
      people: book.querySelector('.learning-people')?.textContent ?? null,
      materials: Array.from(book.querySelectorAll('li.learning-material'), (item) => [
        kindOf(item), item.dataset.learningState ?? null, item.querySelector('.learning-state')?.textContent ?? null,
        (item.querySelector('.learning-origin')?.textContent ?? '').split(' · 记录于')[0],
      ]),
    })),
    card: card === null ? null : {
      material: kindOf(card.closest('li.learning-material')),
      heading: card.querySelector('h4')?.textContent ?? null,
      excerptHeads: Array.from(card.querySelectorAll('.learning-excerpt li'), (line) => (line.textContent ?? '').split('：')[0]),
      excerptTail: card.querySelector('.learning-excerpt li:last-child')?.textContent ?? null,
      facts: Object.fromEntries(Array.from(card.querySelectorAll('[data-learning-fact]'), (fact) => [fact.dataset.learningFact, fact.dataset.learningFact === 'excerpt' ? null : fact.textContent])),
      choices: Array.from(card.querySelectorAll('.learning-choices input'), (input) => [input.value, input.checked, input.disabled]),
      recommended: card.querySelector('.learning-recommended')?.closest('label')?.querySelector('input')?.value ?? null,
      seriesReason: card.querySelector('.learning-series-reason')?.textContent ?? null,
      consequence: consequence instanceof HTMLElement && !consequence.hidden ? consequence.textContent : null,
      record: card.querySelector('[data-learning-action="record"]')?.disabled === false ? 'enabled' : 'disabled',
      refusal: card.querySelector('.learning-refusal')?.textContent ?? null,
    },
    focus: active instanceof HTMLElement && root.contains(active) ? [kindOf(active.closest('li.learning-material')), active.dataset.learningAction ?? active.tagName] : null,
  };
})()`;
async function readLearning(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_LEARNING).catch(() => null);
    if (page !== null && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-11', name);
  error.detail = page;
  throw error;
}
const learningRow = (kind) => `[data-screen="quality-learning"] li.learning-material[data-material-key^="${kind}:"]`;

/**
 * 反馈历史 as the editor reads it (Issue #61, S26c): its note, what it says when nothing matches, each Book's heading and
 * people, each entry's origin, first line and reason, the people an entry names as its own, the filters' values and choices,
 * and where focus is.
 */
const READ_HISTORY = `(() => {
  const root = document.querySelector('[data-screen="quality-learning"] .feedback-history');
  if (!(root instanceof HTMLElement) || root.dataset.feedbackEntries === undefined) return null;
  const active = document.activeElement;
  return {
    note: root.querySelector('.feedback-history-note')?.textContent ?? null,
    none: root.querySelector('.feedback-history-none')?.textContent ?? null,
    books: Array.from(root.querySelectorAll('.feedback-book'), (book) => [book.querySelector('h3')?.textContent ?? null, book.querySelector('.feedback-people')?.textContent ?? null]),
    grouping: root.dataset.feedbackGrouping ?? null,
    groups: Array.from(root.querySelectorAll('.feedback-group'), (group) => [group.querySelector('h3')?.textContent ?? null, group.querySelectorAll('li.feedback-entry').length]),
    entryBooks: Array.from(root.querySelectorAll('li.feedback-entry'), (item) => item.querySelector('.feedback-entry-book')?.textContent ?? null),
    entries: Array.from(root.querySelectorAll('li.feedback-entry'), (item) => [item.dataset.feedbackOrigin ?? null, item.querySelector('.feedback-entry-line')?.textContent ?? null, item.querySelector('.feedback-entry-reason')?.textContent ?? null]),
    people: Array.from(root.querySelectorAll('li.feedback-entry'), (item) => item.querySelector('.feedback-entry-people')?.textContent ?? null),
    loading: root.querySelector('select[data-feedback-filter]')?.disabled ?? false,
    filters: Object.fromEntries(Array.from(root.querySelectorAll('select[data-feedback-filter]'), (select) => [select.dataset.feedbackFilter, [select.value, Array.from(select.options, (option) => option.textContent)]])),
    inputs: Object.fromEntries(['dimension', 'from', 'to'].map((name) => [name, root.querySelector('#feedback-filter-' + name)?.value ?? null])),
    unclassified: root.querySelector('#feedback-filter-unclassified')?.checked ?? false,
    dimensionDisabled: root.querySelector('#feedback-filter-dimension')?.disabled ?? false,
    dimensions: Array.from(root.querySelectorAll('#feedback-dimensions option'), (option) => option.value),
    next: root.querySelector('[data-feedback-action="next"]')?.disabled === false,
    reset: root.querySelector('[data-feedback-action="reset"]')?.disabled === false,
    focus: active instanceof HTMLElement && root.contains(active) ? (active.id || active.dataset.feedbackAction || active.tagName) : null,
  };
})()`;
async function readHistory(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_HISTORY).catch(() => null);
    if (page !== null && !page.loading && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-11', name);
  error.detail = page;
  throw error;
}
const historyEntry = (condition) => `[data-screen="quality-learning"] li.feedback-entry${condition} [data-feedback-action="open"]`;

/**
 * 学习回溯 as the editor reads it (Issue #62, S27a): its note and the filters that wait, each Book's heading, each row's
 * material identity, standing, pill and downstream-use line; the selection bar; the open lineage's heading, steps in order
 * with their counts, its decisions newest first, its empty stages and actions; the remediation preview's four groups and
 * what it left out; the re-inclusion choice; any refusal; and where focus is. No excerpt word is read.
 */
const READ_AUDIT = `(() => {
  const root = document.querySelector('[data-screen="quality-learning"] .learning-audit');
  if (!(root instanceof HTMLElement) || root.dataset.learningAuditView === undefined) return null;
  const active = document.activeElement;
  const lineage = root.querySelector('.learning-lineage');
  const preview = root.querySelector('.learning-remediation-preview');
  const reinclude = root.querySelector('.learning-reinclude');
  const batch = root.querySelector('.learning-audit-batch');
  const enabled = (node) => node instanceof HTMLButtonElement && !node.disabled;
  return {
    view: root.dataset.learningAuditView,
    busy: Array.from(root.querySelectorAll('[data-learning-audit-action="back"], #learning-audit-query')).some((node) => node.disabled),
    note: root.querySelector('.learning-audit-note')?.textContent ?? null,
    later: root.querySelector('.learning-audit-later')?.textContent ?? null,
    none: root.querySelector('.learning-audit-none')?.textContent ?? null,
    books: Array.from(root.querySelectorAll('.learning-audit-book'), (book) => book.querySelector('h3')?.textContent ?? null),
    rows: Array.from(root.querySelectorAll('li.learning-audit-material'), (item) => [item.dataset.materialKey ?? null, item.dataset.learningStanding ?? null,
      item.querySelector('.learning-audit-standing')?.textContent ?? null, item.querySelector('.learning-audit-use')?.textContent ?? null,
      item.querySelector('.learning-audit-select') !== null]),
    batch: batch === null ? null : {
      selected: batch.querySelector('.learning-audit-selected')?.textContent ?? null,
      stop: enabled(batch.querySelector('[data-learning-audit-action="batch-stop"]')),
      mismatch: batch.querySelector('.learning-audit-mismatch')?.textContent ?? null,
    },
    lineage: lineage === null ? null : {
      key: lineage.dataset.materialKey ?? null,
      standing: lineage.dataset.learningStanding ?? null,
      heading: lineage.querySelector('h4')?.textContent ?? null,
      steps: Array.from(lineage.querySelectorAll('.learning-lineage-step'), (step) => [step.dataset.lineageStep, step.dataset.lineageCount ?? null, step.querySelector('h5')?.textContent ?? null]),
      decisions: Array.from(lineage.querySelectorAll('.learning-lineage-decision'), (item) => [item.dataset.decisionState, item.dataset.decisionVia,
        (item.querySelector('.learning-lineage-decision-line')?.textContent ?? '').split(' · ')[0], item.querySelector('.learning-lineage-decision-status')?.textContent ?? null]),
      empties: Array.from(lineage.querySelectorAll('.learning-lineage-empty'), (node) => node.textContent),
      forward: lineage.querySelector('.learning-lineage-forward-heading')?.textContent ?? null,
      why: lineage.querySelector('.learning-lineage-why')?.textContent ?? null,
      actions: Array.from(lineage.querySelectorAll('.learning-lineage-actions [data-learning-audit-action]'), (node) => node.dataset.learningAuditAction),
      details: [lineage.querySelector('.learning-audit-details summary')?.textContent ?? null, lineage.querySelector('.learning-audit-details')?.open ?? null],
      refusal: lineage.querySelector(':scope > .learning-audit-refusal')?.textContent ?? null,
    },
    preview: preview === null ? null : {
      groups: Array.from(preview.querySelectorAll('.learning-remediation-group'), (group) => [group.dataset.remediationGroup, group.dataset.remediationCount,
        group.querySelector('h5')?.textContent ?? null, group.querySelector('p')?.textContent ?? null]),
      leftOut: Array.from(preview.querySelectorAll('.learning-remediation-left-out li'), (line) => [line.dataset.leftOutReason, line.textContent]),
      confirm: enabled(preview.querySelector('[data-learning-audit-action="confirm"]')),
    },
    reinclude: reinclude === null ? null : {
      choices: Array.from(reinclude.querySelectorAll('input'), (input) => [input.value, input.checked]),
      consequence: reinclude.querySelector('.learning-consequence:not([hidden])')?.textContent ?? null,
      record: enabled(reinclude.querySelector('[data-learning-audit-action="reinclude-record"]')),
    },
    focus: active instanceof HTMLElement && root.contains(active)
      ? [active.closest('[data-material-key]')?.dataset.materialKey ?? null, active.dataset.learningAuditAction ?? active.tagName, active.closest('.learning-remediation-preview') !== null]
      : null,
  };
})()`;
async function readAudit(renderer, predicate, name) {
  const deadline = Date.now() + 60_000;
  let page = null;
  while (Date.now() < deadline) {
    page = await renderer.evaluate(READ_AUDIT).catch(() => null);
    if (page !== null && !page.busy && predicate(page)) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const error = journeyCheckFailure('J-11', name);
  error.detail = page;
  throw error;
}
const auditRow = (key) => `[data-screen="quality-learning"] li.learning-audit-material[data-material-key="${key}"]`;
const AUDIT_LATER = '记忆候选、已启用记忆、后续使用和历史影响暂不能筛选：AI7 还没有从学习材料生成学习信号或记忆，也没有任务读取学习材料，这几项目前都是空的。';
const AUDIT_WHY_EMPTY = 'AI7 目前还没有从学习材料生成学习信号、记忆候选或记忆的功能，也没有任务读取学习材料；这几步因此都是空的，并非被隐藏。';
const AUDIT_STALE = '预览之后，这些学习材料或它们的准入决定有了变化；请重新查看影响，再决定。';

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
  let journeyCompleted = false;
  // 分析反馈's baseline needs a Main Editorial Role connection (Issue #94, S38), so J-11 owns the one synthetic credential
  // and its cleanup exactly as J-16 does: through the product while it answers, relaunched for cleanup when it does not, and
  // directly by its reference as the last resort.
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
      throw journeyCheckFailure('J-11', 'browser-close-unconfirmed');
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
      requireJourney(credentialReferenceForCleanup === undefined || credentialReferenceForCleanup === state.credentialReference, 'credential-cleanup-reference');
      credentialReferenceForCleanup = state.credentialReference;
    }
    if (state === null || state.credentialOperationState === 'missing') {
      credentialRemoved = true;
      return true;
    }
    await renderer.evaluate(`window.ai7.removeModelServiceCredential()`);
    const after = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection??null)`);
    if (UUID_PATTERN.test(after?.credentialReference)) {
      requireJourney(credentialReferenceForCleanup === undefined || credentialReferenceForCleanup === after.credentialReference, 'credential-cleanup-reference');
      credentialReferenceForCleanup = after.credentialReference;
    }
    credentialRemoved = after === null || after.credentialOperationState === 'missing';
    requireJourney(credentialRemoved, 'credential-cleanup-state');
    return true;
  };
  const cleanup = () => (cleanupPromise ??= (async () => {
    if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-11', 'browser-cleanup-failed');
    if (credentialMutationReached && !credentialRemoved) {
      try {
        await removeCredentialThroughProduct();
      } catch (error) {
        credentialCleanupFailure ??= error;
      }
      if (!credentialRemoved && launchForCleanup !== undefined) {
        const closedForRetry = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-11', 'browser-cleanup-failed');
        if (closedForRetry) {
          try {
            await launchForCleanup({ forCleanup: true });
            await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady==='true'`, 'credential-cleanup-ready');
            await removeCredentialThroughProduct();
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
      }
      if (!credentialRemoved) {
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-11', 'browser-cleanup-failed');
        const closedForFallback = await closeOwnedBrowserForCleanup();
        if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-11', 'browser-cleanup-failed');
        if (closedForFallback && credentialReferenceForCleanup === undefined && dataRoot !== undefined && runRoot !== undefined) {
          try {
            const recovered = await recoverSyntheticCredentialCleanupState('J-11', dataRoot, runRoot);
            if (recovered.kind === 'not-started' || recovered.kind === 'removed') credentialRemoved = true;
            else credentialReferenceForCleanup = recovered.credentialReference;
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
        if (closedForFallback && !credentialRemoved && credentialReferenceForCleanup !== undefined) {
          try {
            requireJourney(electronExecutableForCleanup !== undefined, 'credential-direct-cleanup-executable');
            await removeSyntheticCredentialWithElectron('J-11', electronExecutableForCleanup, productEnvironment(electronExecutableForCleanup), credentialReferenceForCleanup);
            credentialRemoved = true;
          } catch (error) {
            credentialCleanupFailure ??= error;
          }
        }
      }
    }
    if (browserCloseRejected) throw cleanupFailure ?? journeyCheckFailure('J-11', 'browser-cleanup-failed');
    const browserClosed = await closeOwnedBrowserForCleanup();
    if (!browserClosed) throw cleanupFailure ?? journeyCheckFailure('J-11', 'browser-cleanup-failed');
    const ownedLoopback = loopback ?? (loopbackAcquisition === undefined ? undefined : await loopbackAcquisition.catch(() => undefined));
    try { await ownedLoopback?.close(); } catch (error) { cleanupFailure ??= error; }
    loopback = undefined;
    if (credentialMutationReached && !credentialRemoved) {
      throw credentialCleanupFailure ?? journeyCheckFailure('J-11', 'credential-cleanup-failed');
    }
    const ownedRoot = runRoot ?? (runRootAcquisition === undefined ? undefined : await runRootAcquisition.catch(() => undefined));
    if (ownedRoot !== undefined) {
      if (syntheticSecret !== undefined && dataRoot !== undefined) {
        try { await assertSecretsAbsentFromDataRoot('J-11', dataRoot, [syntheticSecret]); } catch (error) { cleanupFailure ??= error; }
      }
      try {
        requireJourney(tempParent !== undefined && dirname(ownedRoot) === tempParent && basename(ownedRoot).startsWith('ai7-j11-e2e-') && (await realpath(ownedRoot)) === ownedRoot, 'cleanup-target');
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
    runRootAcquisition = mkdtemp(join(tempParent, 'ai7-j11-e2e-'));
    runRoot = await runRootAcquisition;
    cancellation.throwIfRequested();
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j11-e2e-'), 'temp-root');
    dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    electronExecutableForCleanup = executable;
    // J-10's unit hold, admitted under J-11 (#641): absent until feedback-pending-submit writes it, so nothing before is held.
    const unitHoldPath = resolve(runRoot, 'j11-unit-hold.txt');
    const sample1Bytes = await readFile(SAMPLE1_PATH);
    const sample1 = { sha256: createHash('sha256').update(sample1Bytes).digest('hex'), bytes: sample1Bytes.length };
    const launch = async ({ forCleanup = false } = {}) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      // J-11's picker imports the manuscript its 评估 evaluates (Issue #429, S81a): one choice per window. The J-04 model
      // adapter runs the baseline 分析反馈 judges (Issue #94, S38), and J-10's unit hold keeps one Run in flight (#641). A
      // cleanup launch names none of them.
      if (!forCleanup) args.push('--j11-picker-path', SAMPLE1_PATH, '--j04-model-adapter', FIXTURE_IDENTITY, '--j10-unit-hold-path', unitHoldPath);
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      if (!forCleanup) cancellation.throwIfRequested();
      const acquisition = chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      browserAcquisition = acquisition;
      const acquiredBrowser = await acquisition;
      attachProductOutput('J-11', acquiredBrowser, forCleanup ? 'cleanup' : 'launch');
      if (browserAcquisition === acquisition) {
        browser = acquiredBrowser;
        browserAcquisition = undefined;
      }
      if (!forCleanup) cancellation.throwIfRequested();
      renderer = await attachRenderer(acquiredBrowser);
      if (!forCleanup) cancellation.throwIfRequested();
      return renderer;
    };
    launchForCleanup = launch;
    const close = () => closeOwnedBrowser();

    at('renderer-api-boundary');
    await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true'`, 'product-ready');
    // The renderer gains the one people command and nothing named like an account, a role grant or a permission.
    await assertRenderer(renderer, `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && typeof window.ai7.updateBookPeople === 'function' && !Object.keys(window.ai7).some((key) => /account|permission|login|grant/i.test(key))`, 'renderer-api-boundary');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0, 'renderer-network-denial');
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }

    at('first-book-created');
    const firstId = await createBook(renderer, FIRST.title, 'first-book');

    at('people-empty');
    // A new Book has no people yet: each field reads 未填写, and the section says what the people are for.
    await assertRenderer(renderer, `(() => {
      const section = document.querySelector(${JSON.stringify(peopleSection)});
      const values = Array.from(section.querySelectorAll('dd[data-people-field]'), (dd) => dd.dataset.peopleField + ':' + dd.textContent);
      return section.querySelector('h3')?.textContent === '人员' && section.dataset.peopleVersion === '0' &&
        JSON.stringify(values) === '["authors:未填写","editors:未填写","related:未填写"]' &&
        section.querySelector('.book-people-recorded')?.textContent === '尚未填写作者、责编和相关人。' &&
        section.querySelector('.book-people-note')?.textContent === ${JSON.stringify(PEOPLE_NOTE)} &&
        section.querySelector('[data-people-action="edit"]')?.textContent === '编辑人员…';
    })()`, 'people-empty-section');

    at('j14-people-keyboard');
    // Without a pointer: Enter on 编辑人员… opens the form at 作者, and Escape closes it with nothing saved and the focus
    // back on 编辑人员….
    const editButton = `${peopleSection} [data-people-action="edit"]`;
    const authorsInput = `${peopleSection} input[data-people-field="authors"]`;
    await assertRenderer(renderer, `(() => { const edit = document.querySelector(${JSON.stringify(editButton)}); if (!(edit instanceof HTMLButtonElement) || edit.disabled) return false; edit.focus(); return document.activeElement === edit; })()`, 'keyboard-edit-focused');
    await pressEnter(renderer);
    await waitFor(renderer, `document.activeElement === document.querySelector(${JSON.stringify(authorsInput)})`, 'keyboard-form-open', 10_000);
    await renderer.send('Input.insertText', { text: '临时' });
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(authorsInput)})?.value === '临时'`, 'keyboard-typed');
    await pressEscape(renderer);
    await waitFor(renderer, `document.querySelector(${JSON.stringify(`${peopleSection} form`)}) === null && document.activeElement === document.querySelector(${JSON.stringify(editButton)})`, 'keyboard-form-closed', 10_000);
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '0' && document.querySelector(${JSON.stringify(`${peopleSection} dd[data-people-field="authors"]`)})?.textContent === '未填写'`, 'keyboard-nothing-saved');

    at('people-form');
    // 编辑人员… opens the whole set in one form; a 相关人 row waits for both its role and its name.
    await clickSelector(renderer, editButton, 'people-edit');
    // Escape kept nothing: the form opens fresh from the saved set, at 作者.
    await waitFor(renderer, `document.querySelector(${JSON.stringify(authorsInput)})?.value === '' && document.activeElement === document.querySelector(${JSON.stringify(authorsInput)})`, 'people-form-fresh');
    await fill(renderer, authorsInput, PEOPLE.authors, 'people-authors');
    await fill(renderer, `${peopleSection} input[data-people-field="editors"]`, PEOPLE.editors, 'people-editors');
    await clickSelector(renderer, `${peopleSection} [data-people-action="addRelated"]`, 'people-add-related');
    await waitFor(renderer, `document.activeElement === document.querySelector(${JSON.stringify(`${peopleSection} .book-people-related-row[data-related-index="0"] select`)})`, 'people-related-row');
    await assertRenderer(renderer, `(() => {
      const save = document.querySelector(${JSON.stringify(`${peopleSection} [data-people-action="save"]`)});
      const reason = document.getElementById(save?.getAttribute('aria-describedby') ?? '');
      const options = Array.from(document.querySelectorAll(${JSON.stringify(`${peopleSection} .book-people-related-row select option`)}), (option) => option.textContent);
      return save instanceof HTMLButtonElement && save.disabled && reason?.textContent === '每位相关人都要选角色、填名字。' &&
        JSON.stringify(options) === '["选择角色","校对","美编","译者","外审专家","作者经纪","营销","其他"]';
    })()`, 'people-related-needs-role-and-name');
    await choose(renderer, `${peopleSection} .book-people-related-row[data-related-index="0"] select`, PEOPLE.relatedRole, 'people-related-role');
    await fill(renderer, `${peopleSection} .book-people-related-row[data-related-index="0"] input[data-people-field="related-name"]`, PEOPLE.relatedName, 'people-related-name');
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(`${peopleSection} [data-people-action="save"]`)})?.disabled === false`, 'people-save-ready');

    at('j14-people-zoom-200-reflow');
    // At 200% the form, its fields, its 相关人 group and row reflow into the width: nothing scrolls sideways.
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [document.querySelector(${JSON.stringify(peopleSection)}), ...document.querySelectorAll(${JSON.stringify(`${peopleSection} .book-people-field, ${peopleSection} .book-people-related, ${peopleSection} .book-people-related-row`)})]; return parts.length === 5 && parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'people-reflow-at-200', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');

    at('j14-people-forced-colors');
    // Without colour the 相关人 group keeps its rule, the card its plain edge, and 保存人员 its outline.
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const section = document.querySelector(${JSON.stringify(peopleSection)});
      const related = section?.querySelector('.book-people-related');
      const save = section?.querySelector('[data-people-action="save"]');
      return section instanceof HTMLElement && getComputedStyle(section).boxShadow === 'none' && getComputedStyle(section).borderTopStyle === 'solid' &&
        related instanceof HTMLElement && getComputedStyle(related).borderTopStyle === 'solid' && parseFloat(getComputedStyle(related).borderTopWidth) >= 1 &&
        save instanceof HTMLButtonElement && getComputedStyle(save).borderTopStyle === 'solid';
    })()`, 'people-rules-without-colour');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });

    at('people-saved');
    await clickSelector(renderer, `${peopleSection} [data-people-action="save"]`, 'people-save');
    await waitFor(renderer, `${status} === '人员已保存' && document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '1'`, 'people-recorded');
    await assertRenderer(renderer, `(() => {
      const section = document.querySelector(${JSON.stringify(peopleSection)});
      const values = Array.from(section.querySelectorAll('dd[data-people-field]'), (dd) => dd.dataset.peopleField + ':' + dd.textContent);
      return JSON.stringify(values) === '["authors:周一、吴二","editors:郑三","related:校对 王四"]' && section.querySelector('form') === null &&
        (section.querySelector('.book-people-recorded')?.textContent ?? '').startsWith('第 1 次保存 · ') &&
        document.activeElement === section.querySelector('[data-people-action="edit"]');
    })()`, 'people-shown');
    const saved = await renderer.evaluate(`window.ai7.getBookOverview({ bookId: ${JSON.stringify(firstId)}, historyCursor: null }).then((overview) => overview.people)`);
    requireJourney(JSON.stringify([saved?.version, saved?.authors, saved?.editors, saved?.related]) === JSON.stringify([1, ['周一', '吴二'], ['郑三'], [{ roleId: 'proofreader', roleLabel: '校对', name: '王四' }]]), 'people-service-agrees', saved);

    at('people-unchanged');
    // The same set again records nothing and says so.
    await clickSelector(renderer, `${peopleSection} [data-people-action="edit"]`, 'people-edit-again');
    await clickSelector(renderer, `${peopleSection} [data-people-action="save"]`, 'people-save-again');
    await waitFor(renderer, `${status} === '人员没有变化' && document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '1'`, 'people-unchanged-said');
    // Read here, while this window shows the Book, so the read binds nothing new.
    const peopleBefore = await renderer.evaluate(`window.ai7.getBookOverview({ bookId: ${JSON.stringify(firstId)}, historyCursor: null }).then((overview) => JSON.stringify(overview.people))`);
    requireJourney(typeof peopleBefore === 'string' && peopleBefore === JSON.stringify(saved), 'people-unchanged-recorded-nothing');

    at('second-book-created');
    await backToLibrary(renderer, 'first-book');
    const secondId = await createBook(renderer, SECOND.title, 'second-book');
    await backToLibrary(renderer, 'second-book');

    at('library-cards');
    // 书库's cards: the first Book names its 作者, 责编 and 相关人; the second, with none, names nobody.
    const cards = await renderer.evaluate(CARDS);
    requireJourney(JSON.stringify(cards) === JSON.stringify([
      { bookId: secondId, title: `${SECOND.title} · 尚无稿件`, people: null, related: null },
      { bookId: firstId, title: `${FIRST.title} · 尚无稿件`, people: '作者：周一、吴二 · 责编：郑三', related: '相关人：校对 王四' },
    ]), 'library-cards-name-the-people', cards);

    at('library-search');
    // 查找图书 by 作者, by 责编 and by 书名: the service keeps only the Books that hold the words.
    const byAuthor = await search(renderer, 'author', '吴二', 'search-author');
    requireJourney(JSON.stringify(byAuthor.map((card) => card.bookId)) === JSON.stringify([firstId]), 'search-by-author', byAuthor);
    await assertRenderer(renderer, `document.querySelector('.book-filter-line')?.textContent === '按作者查找「吴二」' && document.activeElement === document.querySelector('#book-filter-text')`, 'search-by-author-line');
    const byEditor = await search(renderer, 'editor', '郑三', 'search-editor', true);
    requireJourney(JSON.stringify(byEditor.map((card) => card.bookId)) === JSON.stringify([firstId]), 'search-by-editor', byEditor);
    const byTitle = await search(renderer, 'title', '乙', 'search-title');
    requireJourney(JSON.stringify(byTitle.map((card) => card.bookId)) === JSON.stringify([secondId]), 'search-by-title', byTitle);
    await choose(renderer, '#book-filter-field', 'author', 'search-none-field');
    await fill(renderer, '#book-filter-text', '无此人', 'search-none-text');
    await clickSelector(renderer, '[data-book-filter-action="find"]', 'search-none-find');
    await waitFor(renderer, `document.querySelector('.book-filter-none')?.textContent === '没有找到符合的图书。' && document.querySelectorAll('[data-screen="landing"] section.recent-work article.book-summary-item').length === 0`, 'search-none');
    await clickSelector(renderer, '[data-book-filter-action="clear"]', 'search-clear');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work')?.dataset.bookFilter === 'none' && document.querySelectorAll('[data-screen="landing"] section.recent-work article.book-summary-item').length === 2 && ${status} === '已显示全部图书'`, 'search-cleared');

    // Hold the real request's completion callback until later navigation has acquired user input.
    // The Promise hook exists only during the synchronous click and is restored before any other work.
    for (const action of ['find', 'clear']) {
      if (action === 'clear') await search(renderer, 'author', '吴二', 'late-clear-setup');
      else await fill(renderer, '#book-filter-text', '吴二', 'late-find-words');
      await assertRenderer(renderer, `(() => {
        const original = Promise.prototype.then;
        const held = { release: null };
        window.__j11HeldSearch = held;
        try {
          Promise.prototype.then = function (success, failure) {
            Promise.prototype.then = original;
            return original.call(this,
              (value) => { held.release = () => success(value); },
              (error) => { held.release = () => failure(error); });
          };
          document.querySelector('[data-book-filter-action="${action}"]').click();
        } finally { Promise.prototype.then = original; }
        return true;
      })()`, `late-${action}-hold`);
      await waitFor(renderer, `typeof window.__j11HeldSearch?.release === 'function'`, `late-${action}-response-held`);
      await click(renderer, '新建图书', `late-${action}-navigate`);
      await fill(renderer, '#empty-book-title', '保留输入', `late-${action}-draft`);
      await assertRenderer(renderer, `(() => {
        window.__j11HeldSearch.release();
        delete window.__j11HeldSearch;
        return document.querySelector('[data-screen="book-create"] #empty-book-title')?.value === '保留输入';
      })()`, `late-${action}-keeps-destination`);
      await click(renderer, '取消', `late-${action}-cancel`);
      await waitFor(renderer, `document.querySelector('[data-screen="landing"] form.book-filter')`, `late-${action}-landing`);
    }

    at('restart-keeps-people');
    // A restart moves nothing: the cards and the 工作概览 read the people exactly as saved.
    const booksBefore = await renderer.evaluate(`window.ai7.listBooks({ after: null }).then((page) => JSON.stringify(page))`);
    await close();
    renderer = await launch();
    await waitFor(renderer, `document.querySelector('[data-screen="landing"] section.recent-work article.book-summary-item')`, 'restart-library');
    const booksAfter = await renderer.evaluate(`window.ai7.listBooks({ after: null }).then((page) => JSON.stringify(page))`);
    requireJourney(typeof booksBefore === 'string' && booksAfter === booksBefore, 'restart-library-moved-nothing');
    requireJourney(JSON.stringify(await renderer.evaluate(CARDS)) === JSON.stringify(cards), 'restart-cards');
    await clickSelector(renderer, `[data-screen="landing"] section.recent-work article.book-summary-item button[data-book-id="${firstId}"]`, 'restart-open-first');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '1'`, 'restart-overview');
    await assertRenderer(renderer, `JSON.stringify(Array.from(document.querySelectorAll(${JSON.stringify(`${peopleSection} dd[data-people-field]`)}), (dd) => dd.textContent)) === '["周一、吴二","郑三","校对 王四"]'`, 'restart-overview-people');
    const peopleAfter = await renderer.evaluate(`window.ai7.getBookOverview({ bookId: ${JSON.stringify(firstId)}, historyCursor: null }).then((overview) => JSON.stringify(overview.people))`);
    requireJourney(peopleAfter === peopleBefore, 'restart-people-moved-nothing');

    // ---- ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012) --------
    at('evaluation-book-imported');
    // A third Book from exact sample1: its 工作概览 says it has no 评估 yet, one step from the destination.
    await click(renderer, '返回图书列表', 'evaluation-library');
    const thirdId = await importSample1(renderer, THIRD.title, sample1, 'evaluation-import');
    await waitFor(renderer, `document.querySelector('.book-evaluation-summary')?.dataset.evaluationState === 'empty'`, 'evaluation-summary-empty');
    await assertRenderer(renderer, `(() => { const summary = document.querySelector('.book-evaluation-summary'); return summary?.querySelector('h3')?.textContent === '评估' && summary.querySelector('p')?.textContent === '还没有评估。' && summary.querySelector('[data-evaluation-action="open"]')?.textContent === '打开评估'; })()`, 'evaluation-summary-words');

    at('evaluation-open');
    await clickSelector(renderer, '.book-evaluation-summary [data-evaluation-action="open"]', 'evaluation-open');
    const opened = await readEvaluation(renderer, (page) => page.state === 'ready', 'evaluation-ready');
    requireJourney(opened.empty === '这本书还没有评估。开始评估后，按本社评估方案逐项打分，定稿后留作记录。' && opened.start === '开始评估' &&
      opened.versions.length === 0 && opened.record === null, 'evaluation-empty', opened);

    at('evaluation-start');
    // 开始评估: version 1 on r1, AI7's 初评 not yet there, every item unscored and no conclusion chosen.
    await clickSelector(renderer, '[data-evaluation-action="start"]', 'evaluation-start');
    const started = await readEvaluation(renderer, (page) => page.record !== null && page.focus === 'heading', 'evaluation-started');
    requireJourney(started.record.heading === '第 1 版 · 编辑评分中' && started.record.revision === '评估的是修订版 r1' &&
      started.record.ai7 === '这一版不是从 AI7 初评开始的：由你打分。' && started.record.total === '总分 0 / 100 · 还有 5 项没有打分' &&
      JSON.stringify(started.record.items.map(([, legend, score]) => [legend, score])) === JSON.stringify(ITEM_LEGENDS.map((legend) => [legend, ''])) &&
      started.record.conclusions.every(([, checked]) => checked === false) && JSON.stringify(started.record.actions) === JSON.stringify(['保存评估', '定稿']) &&
      started.startReason === '第 1 版还没有定稿；定稿后才能重新评估。', 'evaluation-started-words', started);
    await waitFor(renderer, `${status} === '已开始第 1 版评估。'`, 'evaluation-started-status', 10_000);

    at('evaluation-score');
    // A score the scale does not admit shows no band, counts for nothing and says why until it is corrected (Issue #638).
    const literaryScore = `${item('literary-quality')} [data-evaluation-field="score"]`;
    const literaryInvalid = `document.querySelector(${JSON.stringify(`${item('literary-quality')} .evaluation-score-invalid`)})`;
    await fill(renderer, literaryScore, '25', 'evaluation-score-inadmissible');
    const inadmissible = await readEvaluation(renderer, (page) => page.record?.items[0]?.[2] === '25', 'evaluation-score-inadmissible-read');
    requireJourney(inadmissible.record.items[0][3] === null && inadmissible.record.total === '总分 0 / 100 · 还有 5 项没有打分' &&
      await renderer.evaluate(`${literaryInvalid}?.hidden === false && ${literaryInvalid}.textContent === '得分要在 0 到 20 之间，按整分或半分填写；这个得分不计入总分，也不能保存。' && document.querySelector(${JSON.stringify(literaryScore)})?.getAttribute('aria-invalid') === 'true'`),
      'evaluation-score-inadmissible-words', inadmissible.record);
    // Every item 不评 leaves nothing scored: 定稿 waits and says why, as the Owner answered on #638.
    const everyItem = ['literary-quality', 'theme-and-context', 'structure-and-coherence', 'chinese-language', 'readers-and-market'];
    const notRatedBox = (itemId) => `${item(itemId)} [data-evaluation-field="not-rated"]`;
    for (const itemId of everyItem) await tick(renderer, notRatedBox(itemId), `evaluation-all-not-rated-${itemId}`);
    await waitFor(renderer, `(() => { const finalize = document.querySelector('[data-screen="book-evaluation"] [data-evaluation-action="finalize"]'); const note = document.querySelector('[data-screen="book-evaluation"] .evaluation-finalize-blocked'); return finalize instanceof HTMLButtonElement && finalize.disabled && note instanceof HTMLElement && !note.hidden && note.textContent === '至少要给一项打分才能定稿。' && finalize.getAttribute('aria-describedby') === note.id; })()`, 'evaluation-all-not-rated-waits', 10_000);
    for (const itemId of everyItem) await tick(renderer, notRatedBox(itemId), `evaluation-all-not-rated-undo-${itemId}`);
    await waitFor(renderer, `document.querySelector('[data-screen="book-evaluation"] [data-evaluation-action="finalize"]')?.disabled === false && document.querySelector('[data-screen="book-evaluation"] .evaluation-finalize-blocked')?.hidden === true`, 'evaluation-finalize-open-again', 10_000);
    // Four items scored, half points allowed; the fifth 不评 with its reason, leaving the total out of 80; each band shown.
    for (const [itemId, score] of [['literary-quality', '18'], ['theme-and-context', '16.5'], ['structure-and-coherence', '15'], ['chinese-language', '17']]) {
      await fill(renderer, `${item(itemId)} [data-evaluation-field="score"]`, score, `evaluation-score-${itemId}`);
    }
    await assertRenderer(renderer, `${literaryInvalid}?.hidden === true && !document.querySelector(${JSON.stringify(literaryScore)})?.hasAttribute('aria-invalid')`, 'evaluation-score-corrected');
    await tick(renderer, `${item('readers-and-market')} [data-evaluation-field="not-rated"]`, 'evaluation-not-rated');
    await fill(renderer, `${item('readers-and-market')} [data-evaluation-field="not-rated-reason"]`, '市场资料尚未收集。', 'evaluation-not-rated-reason');
    const scoredPage = await readEvaluation(renderer, (page) => page.record?.total === '总分 66.5 / 80 · 优秀（1 项不评）', 'evaluation-total');
    requireJourney(JSON.stringify(scoredPage.record.items.map(([, , score, band, notRated]) => [score, band, notRated])) === JSON.stringify([
      ['18', '卓越', false], ['16.5', '优秀', false], ['15', '优秀', false], ['17', '优秀', false], ['', null, true],
    ]), 'evaluation-bands', scoredPage.record.items);
    // A 高 risk nobody reviewed keeps 推荐出版 closed, with why; a person's review opens it.
    await tick(renderer, `${risk('facts-and-sources')} input[value="low"]`, 'evaluation-risk-facts');
    await tick(renderer, `${risk('law-rights-ethics-policy')} input[value="high"]`, 'evaluation-risk-legal');
    await fill(renderer, `${risk('law-rights-ethics-policy')} [data-evaluation-field="statement"]`, '书中写到真实人物，需要法务看过。', 'evaluation-risk-statement');
    const capped = await readEvaluation(renderer, (page) => page.record?.blocked === true, 'evaluation-capped');
    requireJourney(JSON.stringify(capped.record.conclusions) === JSON.stringify([['recommend', false, true], ['revise', false, false], ['defer', false, false], ['reject', false, false]]),
      'evaluation-recommend-waits', capped.record.conclusions);
    await tick(renderer, `${risk('law-rights-ethics-policy')} [data-evaluation-field="reviewed"]`, 'evaluation-risk-reviewed');
    const reviewed = await readEvaluation(renderer, (page) => page.record?.blocked === false, 'evaluation-uncapped');
    requireJourney(reviewed.record.conclusions[0][2] === false, 'evaluation-recommend-open', reviewed.record.conclusions);
    await tick(renderer, '[data-screen="book-evaluation"] .evaluation-conclusion [data-conclusion="revise"] input', 'evaluation-conclusion');
    await fill(renderer, '[data-screen="book-evaluation"] .evaluation-lists [data-evaluation-field="readiness"]', '第三章结尾需要重写', 'evaluation-readiness');
    await submitEvaluationWithPendingInput(renderer, 'save', 'evaluation-save');
    await waitFor(renderer, `${status} === '评估已保存。'`, 'evaluation-saved-status');
    await assertSubmittedEvaluation(renderer, true, 'evaluation-save-keeps-submitted-draft');
    const savedPage = await readEvaluation(renderer, (page) => page.record?.entries === '2', 'evaluation-saved');
    requireJourney(JSON.stringify(savedPage.versions) === JSON.stringify(['第 1 版 · 编辑评分中 · 修订版 r1 · 总分 66.5 / 80 · 优秀（1 项不评） · 修改后再议']) &&
      savedPage.record.conclusions[1][1] === true && savedPage.focus === 'save', 'evaluation-saved-words', savedPage);

    at('evaluation-finalize');
    await submitEvaluationWithPendingInput(renderer, 'finalize', 'evaluation-missing-low-statement');
    await waitFor(renderer, `${status} === '定稿前，要写明「事实与来源」的风险说明。'`, 'evaluation-low-statement-refused');
    await assertSubmittedEvaluation(renderer, true, 'evaluation-refusal-restores-draft-controls');
    await readEvaluation(renderer, (page) => page.record?.state === 'editing' && page.record.entries === '2', 'evaluation-refusal-keeps-draft');
    await fill(renderer, `${risk('facts-and-sources')} [data-evaluation-field="statement"]`, '已核对事实和来源，未发现未解决问题。', 'evaluation-low-risk-statement');
    // 定稿: the version reads as it was, with the actor and the time, and 重新评估 begins the next.
    await submitEvaluationWithPendingInput(renderer, 'finalize', 'evaluation-finalize');
    await waitFor(renderer, `${status} === '第 1 版评估已定稿。'`, 'evaluation-finalized-status');
    await assertSubmittedEvaluation(renderer, false, 'evaluation-finalize-keeps-submitted-draft');
    const finalizedPage = await readEvaluation(renderer, (page) => page.record?.state === 'finalized', 'evaluation-finalized');
    requireJourney(finalizedPage.record.heading === '第 1 版 · 定稿' && (finalizedPage.record.finalized ?? '').startsWith('定稿 · 本机编辑 · ') &&
      finalizedPage.record.allDisabled === true && finalizedPage.record.actions.length === 0 && finalizedPage.start === '重新评估' &&
      finalizedPage.record.total === '总分 66.5 / 80 · 优秀（1 项不评）', 'evaluation-finalized-words', finalizedPage.record);

    at('evaluation-from-manuscript');
    // 评估 is one of the manuscript's 工作 destinations (IA-012, editor-surfaces §0.3): from 评估's own 打开稿件, the manuscript's
    // 工作 group reads 审阅 · 评估 · 交付物, and its 评估 opens the version just finalized.
    await assertRenderer(renderer, `(() => { const open = Array.from(document.querySelectorAll('[data-screen="book-evaluation"] .workbench-actions button')).find((button) => button.textContent === '打开稿件'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'evaluation-open-manuscript');
    await waitFor(renderer, `document.querySelector('.editor-shell [data-testid="manuscript-editor"] > [data-block-id]') !== null && document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]') !== null`, 'evaluation-manuscript-ready', 60_000);
    await assertRenderer(renderer, `(() => { const group = document.querySelector('.editor-shell nav.book-work-group[aria-label="工作"]'); const entries = Array.from(group?.querySelectorAll('button[data-work-destination]') ?? []).map((item) => item.dataset.workDestination + ':' + item.textContent); const open = group?.querySelector('button[data-work-destination="evaluation"]'); if (entries.join('|') !== 'review:审阅|evaluation:评估|deliverables:交付物' || !(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'evaluation-work-group-entry');
    const returned = await readEvaluation(renderer, (page) => page.state === 'ready' && page.record?.state === 'finalized', 'evaluation-from-manuscript-ready');
    requireJourney(returned.record.heading === '第 1 版 · 定稿' && returned.start === '重新评估' && returned.versions.length === 1, 'evaluation-from-manuscript-words', returned);

    at('evaluation-reevaluate');
    // 重新评估: version 2 begins from 定稿's scores but not its conclusion, which the editor decides again for this text; one
    // moved item shows against version 1.
    await clickSelector(renderer, '[data-evaluation-action="start"]', 'evaluation-again');
    const again = await readEvaluation(renderer, (page) => page.record?.heading === '第 2 版 · 编辑评分中', 'evaluation-again-started');
    requireJourney(JSON.stringify(again.record.items.map(([, , score]) => score)) === JSON.stringify(['18', '16.5', '15', '17', '']) &&
      JSON.stringify(again.record.comparison) === JSON.stringify(['与第 1 版相比', '总分：66.5 / 80 → 66.5 / 80', '结论：修改后再议 → 结论未定']), 'evaluation-again-seeded', again.record);
    await fill(renderer, `${item('literary-quality')} [data-evaluation-field="score"]`, '19', 'evaluation-again-score');
    await clickSelector(renderer, '[data-evaluation-action="save"]', 'evaluation-again-save');
    const compared = await readEvaluation(renderer, (page) => page.record?.entries === '2' && page.record.comparison?.length === 4, 'evaluation-compared');
    requireJourney(JSON.stringify(compared.record.comparison) === JSON.stringify(['与第 1 版相比', '文学品质与作者声音：18 → 19', '总分：66.5 / 80 → 67.5 / 80', '结论：修改后再议 → 结论未定']) &&
      compared.versions.length === 2 && compared.versions[1] === '第 1 版 · 定稿 · 修订版 r1 · 总分 66.5 / 80 · 优秀（1 项不评） · 修改后再议', 'evaluation-compared-words', compared);
    // Version 1 asked for with an unsaved score keeps it: 留在这一版 comes first, and only the named discard opens it (Issue #638).
    const openVersion = (nth) => `[data-screen="book-evaluation"] .evaluation-version-list li:nth-child(${nth}) [data-evaluation-action="open-version"]`;
    await fill(renderer, `${item('literary-quality')} [data-evaluation-field="score"]`, '20', 'evaluation-unsaved-score');
    await clickSelector(renderer, openVersion(2), 'evaluation-unsaved-open-first');
    await waitFor(renderer, `document.querySelector('.evaluation-unsaved p')?.textContent === '第 2 版有未保存的修改；打开第 1 版会放弃这些修改。' && document.activeElement?.dataset.evaluationAction === 'stay' && document.querySelector('[data-evaluation-action="discard-and-open"]')?.textContent === '放弃修改并打开第 1 版'`, 'evaluation-unsaved-asks', 10_000);
    await clickSelector(renderer, '[data-evaluation-action="stay"]', 'evaluation-unsaved-stay');
    const stayed = await readEvaluation(renderer, (page) => page.record?.heading === '第 2 版 · 编辑评分中' && page.record.items[0][2] === '20', 'evaluation-unsaved-stayed');
    requireJourney(await renderer.evaluate(`document.querySelector('.evaluation-unsaved') === null && document.activeElement === document.querySelector('.evaluation-record h3')`), 'evaluation-unsaved-kept', stayed.record.items);
    await clickSelector(renderer, openVersion(2), 'evaluation-unsaved-open-again');
    await clickSelector(renderer, '[data-evaluation-action="discard-and-open"]', 'evaluation-unsaved-discard');
    await readEvaluation(renderer, (page) => page.record?.heading === '第 1 版 · 定稿', 'evaluation-discarded-opens-first');
    await clickSelector(renderer, openVersion(1), 'evaluation-back-to-second');
    await readEvaluation(renderer, (page) => page.record?.heading === '第 2 版 · 编辑评分中' && page.record.items[0][2] === '19', 'evaluation-discard-left-saved');

    at('j14-evaluation-reflow-forced-colors');
    // At 200% the version, its items and risks reflow into the width; under forced colours each keeps its border.
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [document.querySelector('.evaluation-record'), ...document.querySelectorAll('.evaluation-item, .evaluation-risk, .evaluation-conclusion')]; return parts.length === 9 && parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'evaluation-reflow', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const parts = [document.querySelector('.evaluation-record'), document.querySelector('.evaluation-item'), document.querySelector('.evaluation-risk'), document.querySelector('.evaluation-conclusion')];
      return parts.every((part) => part instanceof HTMLElement && getComputedStyle(part).borderTopStyle === 'solid');
    })()`, 'evaluation-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });

    at('evaluation-overview-and-profile');
    // 工作概览 names the version on show in one line; 知识库 › 评估方案 names the profile and counts its use.
    await assertRenderer(renderer, `(() => { const open = Array.from(document.querySelectorAll('[data-screen="book-evaluation"] .workbench-actions button')).find((button) => button.textContent === '工作概览'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'evaluation-overview');
    await waitFor(renderer, `document.querySelector('.book-evaluation-summary')?.dataset.evaluationState === 'editing' && document.querySelector('.book-evaluation-summary p')?.textContent === '第 2 版 · 编辑评分中 · 修订版 r1 · 总分 67.5 / 80 · 优秀（1 项不评）'`, 'evaluation-overview-line');
    await click(renderer, '返回图书列表', 'evaluation-profile-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'evaluation-profile-landing');
    await click(renderer, '知识库', 'evaluation-profile-knowledge');
    await waitFor(renderer, `document.querySelector('[data-screen="knowledge-base"] .knowledge-base')`, 'evaluation-profile-knowledge-open');
    await click(renderer, '评估方案', 'evaluation-profile-tab');
    await waitFor(renderer, `document.querySelector('.knowledge-base')?.dataset.knowledgeTab === 'evaluation' && document.querySelector('.evaluation-profile') !== null`, 'evaluation-profile-painted');
    const profile = await renderer.evaluate(`(() => { const card = document.querySelector('.evaluation-profile'); return { title: card.querySelector('h3')?.textContent, pill: card.querySelector('.evaluation-profile-pill')?.textContent, use: card.querySelector('.evaluation-profile-use')?.textContent, items: Array.from(card.querySelectorAll('.evaluation-profile-items li'), (item) => item.textContent), bands: card.querySelectorAll('.evaluation-profile-bands li').length, risks: card.querySelector('.evaluation-profile-risks')?.textContent, conclusions: card.querySelector('.evaluation-profile-conclusions')?.textContent }; })()`);
    requireJourney(JSON.stringify(profile) === JSON.stringify({
      title: '审稿评估方案', pill: '第 1 版 · AI7 内置默认', use: '已用于 1 本书的 2 版评估', items: ITEM_LEGENDS, bands: 5,
      risks: '事实与来源、法律、权利、伦理与出版政策', conclusions: '推荐出版 · 修改后再议 · 暂缓 · 不推荐',
    }), 'evaluation-profile-words', profile);
    const service = await renderer.evaluate(`window.ai7.inspectEvaluationProfiles().then((projection) => projection.profiles.map((entry) => [entry.records, entry.books]))`);
    requireJourney(JSON.stringify(service) === JSON.stringify([[2, 1]]) && typeof thirdId === 'string', 'evaluation-profile-service', service);

    // ---- ②A 分析反馈 (Issue #94, plan slice S38; V2-UX-ANALYSIS-023, ANALYSIS-024, FDBK-005 to FDBK-008) ----------------
    at('feedback-prerequisites');
    // The analysis's prerequisites through the product's own setup, as J-16 makes them: the editorial workspace profile at
    // Revision 2 for 评估旅程丙, and one Main Editorial Role connection whose synthetic credential is saved and removed
    // again, so only its reference is recorded — the J-04 adapter's route sends nothing and needs no credential.
    await click(renderer, '返回', 'feedback-knowledge-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'feedback-landing');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(thirdId)}]`, 'feedback-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(thirdId)}]')`, 'feedback-manuscript', 120_000);
    await click(renderer, '返回图书工作概览', 'feedback-overview');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="install-disabled"]')`, 'feedback-artifact-install-ready');
    await click(renderer, '获取并安装（保持停用）', 'feedback-artifact-install');
    await waitFor(renderer, `document.querySelector('[data-native-artifact-action="enable-current-book"]')`, 'feedback-artifact-enable-ready');
    await click(renderer, '审阅并为本图书启用 Revision 2', 'feedback-artifact-enable');
    await waitFor(renderer, `document.querySelector('.native-artifact-card')?.dataset.authoritySidecarActiveRevision==='2'`, 'feedback-artifact-enabled');
    await click(renderer, '返回图书列表', 'feedback-model-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'feedback-model-landing');
    await click(renderer, '模型服务', 'feedback-model-open');
    await waitFor(renderer, `document.querySelector('[data-screen="model-service"] [data-model-role="main-editorial"]')`, 'feedback-model-ready');
    cancellation.throwIfRequested();
    syntheticSecret = randomBytes(48).toString('base64url');
    await fill(renderer, '#main-editorial-connection-name', 'J-11 主编辑连接', 'feedback-model-name');
    await fill(renderer, '#main-editorial-credential', syntheticSecret, 'feedback-model-secret');
    cancellation.throwIfRequested();
    credentialMutationReached = true;
    await click(renderer, '保护并保存', 'feedback-model-save');
    at('model-credential-saved');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='available' && document.querySelector('[data-credential-state="ready"]')`, 'feedback-model-saved');
    const readyConnection = await renderer.evaluate(`window.ai7.getModelServiceSettings().then((settings)=>settings.roles.find((role)=>role.roleId==='main-editorial')?.connection)`);
    requireJourney(UUID_PATTERN.test(readyConnection?.credentialReference) && readyConnection?.credentialOperationState === 'ready', 'feedback-model-ready-reference');
    credentialReferenceForCleanup = readyConnection.credentialReference;
    await click(renderer, '移除', 'feedback-model-remove');
    at('model-credential-removed');
    await waitFor(renderer, `document.querySelector('[data-model-role="main-editorial"]')?.dataset.modelRoleStatus==='setup-required' && document.querySelector('[data-credential-state="missing"]')`, 'feedback-model-removed');
    credentialRemoved = true;
    await click(renderer, '返回', 'feedback-model-back');

    at('feedback-analysis-settled');
    // The Book's first baseline: prepared from ②A's card, started from its plan's bar, and run to its end on the J-04
    // adapter; the drawer then closes, leaving ②A the width.
    await openAnalysisOf(renderer, thirdId, 'feedback-analysis');
    await prepareFirstBaseline(renderer, 'ready', 'feedback-analysis');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'feedback-analysis-start');
    await waitFor(renderer, `['settled','failed','interrupted'].includes(document.querySelector('.baseline-analysis-card')?.dataset.analysisState)`, 'feedback-analysis-ended', 180_000);
    await assertRenderer(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'feedback-analysis-settled-state');
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'feedback-drawer-close');
    await waitFor(renderer, `document.body.dataset.taskDrawer !== 'open'`, 'feedback-drawer-closed');

    at('feedback-card-offered');
    // Every item of the revision offers 反馈… and nothing is judged: the tally says so, and what it is and is not.
    const revisionId = await renderer.evaluate(`document.querySelector('.baseline-analysis-card')?.dataset.resultRevisionId ?? null`);
    requireJourney(UUID_PATTERN.test(revisionId ?? ''), 'feedback-revision');
    const serviceItems = await renderer.evaluate(`window.ai7.inspectAnalysisFeedback({ revisionId: ${JSON.stringify(revisionId)} }).then((projection) => projection.items.map((item) => item.itemKey))`);
    requireJourney(Array.isArray(serviceItems) && serviceItems[0] === 'synopsis' && serviceItems.includes('entities/0') && serviceItems.includes('events/0'), 'feedback-service-items', serviceItems);
    const offered = await readFeedback(renderer, (page) => page.metric?.judged === '0' && page.items.every(([, judgment]) => judgment !== null), 'feedback-offered');
    requireJourney(JSON.stringify(offered.items.map(([key]) => key)) === JSON.stringify(serviceItems) &&
      offered.items.every(([, judgment, signals, line, toggle]) => judgment === 'none' && signals === '0' && line === null && toggle === '反馈…') &&
      offered.metric.total === '还没有给出判断。' && offered.metric.dimensions.length === 0 && offered.metric.note === METRIC_NOTE && offered.card === null,
    'feedback-offered-words', offered);

    // 待我处理 as it reads before any judgment: judging asks nothing of it, so it must read the same after.
    const attentionBefore = await renderer.evaluate(`window.ai7.inspectGlobalAttention().then((projection) => projection.groups.map((group) => [group.key, group.items.map((entry) => entry.itemId)]))`);

    at('feedback-judge-item');
    // 人物与名称's first entry: 反馈… opens its card with nothing chosen and 记录反馈 closed; 不准确 offers three reasons fitted
    // to a name, 其他 beside them, none chosen, and the correction; one reason, the correction and 记录反馈 record it there.
    await clickSelector(renderer, '#analysis-tab-entities', 'feedback-entities-tab');
    await clickSelector(renderer, `${feedbackItem('entities/0')} [data-analysis-action="open-feedback"]`, 'feedback-entity-open');
    const entityCard = await readFeedback(renderer, (page) => page.card?.item === 'entities/0', 'feedback-entity-card');
    requireJourney(JSON.stringify(entityCard.card.judgments) === JSON.stringify([['accurate', false], ['inaccurate', false], ['incomplete', false]]) &&
      entityCard.card.reasons === null && entityCard.card.correction === false && entityCard.card.record === 'disabled' &&
      JSON.stringify(entityCard.focus) === JSON.stringify(['entities/0', 'accurate']), 'feedback-entity-card-fresh', entityCard);
    await tick(renderer, `${feedbackItem('entities/0')} .analysis-feedback-judgments input[value="inaccurate"]`, 'feedback-entity-inaccurate');
    const reasonsOffered = await readFeedback(renderer, (page) => Array.isArray(page.card?.reasons), 'feedback-entity-reasons');
    requireJourney(JSON.stringify(reasonsOffered.card.reasons) === JSON.stringify([
      ['misnamed', '名字或称谓不对', false], ['merged', '把不同人物当成一个', false], ['wrong-kind', '类别标错', false], ['other', '其他 / 自行输入', false],
    ]) && reasonsOffered.card.other === false && reasonsOffered.card.correction === true && reasonsOffered.card.record === 'enabled',
    'feedback-entity-reasons-words', reasonsOffered.card);
    await tick(renderer, `${feedbackItem('entities/0')} .analysis-feedback-reasons input[value="merged"]`, 'feedback-entity-reason');
    await fill(renderer, `${feedbackItem('entities/0')} [data-analysis-feedback-field="correction"]`, ENTITY_CORRECTION, 'feedback-entity-correction');
    await clickSelector(renderer, `${feedbackItem('entities/0')} [data-analysis-action="record-feedback"]`, 'feedback-entity-record');
    await waitFor(renderer, `${status} === '反馈已记录。'`, 'feedback-entity-recorded-status');
    const entityJudged = await readFeedback(renderer, (page) => page.card === null && page.metric?.judged === '1', 'feedback-entity-recorded');
    const entityRow = rowOf(entityJudged, 'entities/0');
    requireJourney(entityRow[1] === 'inaccurate' && entityRow[2] === '1' && (entityRow[3] ?? '').startsWith(`你的反馈：不准确 · 把不同人物当成一个 · 修正：${ENTITY_CORRECTION} · `) &&
      entityRow[4] === '改反馈…' && JSON.stringify(entityJudged.focus) === JSON.stringify(['entities/0', 'open-feedback']) &&
      entityJudged.metric.total === '这本书判断了 1 条：准确 0、不准确 1、不完整 0' &&
      JSON.stringify(entityJudged.metric.dimensions) === JSON.stringify(['人物与名称：1 条，准确 0、不准确 1、不完整 0']), 'feedback-entity-recorded-words', entityJudged);

    at('feedback-own-reason');
    // The synopsis 不完整 for the editor's own reason: 其他 / 自行输入 opens their words beside the alternatives, focused.
    await clickSelector(renderer, '#analysis-tab-synopsis', 'feedback-synopsis-tab');
    await clickSelector(renderer, `${feedbackItem('synopsis')} [data-analysis-action="open-feedback"]`, 'feedback-synopsis-open');
    await readFeedback(renderer, (page) => page.card?.item === 'synopsis', 'feedback-synopsis-card');
    await tick(renderer, `${feedbackItem('synopsis')} .analysis-feedback-judgments input[value="incomplete"]`, 'feedback-synopsis-incomplete');
    const synopsisReasons = await readFeedback(renderer, (page) => Array.isArray(page.card?.reasons), 'feedback-synopsis-reasons');
    requireJourney(JSON.stringify(synopsisReasons.card.reasons) === JSON.stringify([['key-plot-missing', '漏了关键情节', false], ['ending-missing', '没有概括到结尾', false], ['other', '其他 / 自行输入', false]]),
      'feedback-synopsis-reasons-words', synopsisReasons.card);
    await tick(renderer, `${feedbackItem('synopsis')} .analysis-feedback-reasons input[value="other"]`, 'feedback-synopsis-other');
    const ownWords = await readFeedback(renderer, (page) => page.card?.other === true, 'feedback-synopsis-own-words');
    requireJourney(JSON.stringify(ownWords.focus) === JSON.stringify(['synopsis', 'other']), 'feedback-synopsis-own-words-focused', ownWords.focus);
    await fill(renderer, `${feedbackItem('synopsis')} [data-analysis-feedback-field="other"]`, SYNOPSIS_REASON, 'feedback-synopsis-reason-text');
    await clickSelector(renderer, `${feedbackItem('synopsis')} [data-analysis-action="record-feedback"]`, 'feedback-synopsis-record');
    const synopsisJudged = await readFeedback(renderer, (page) => page.card === null && page.metric?.judged === '2', 'feedback-synopsis-recorded');
    const synopsisRow = rowOf(synopsisJudged, 'synopsis');
    requireJourney(synopsisRow[1] === 'incomplete' && (synopsisRow[3] ?? '').startsWith(`你的反馈：不完整 · ${SYNOPSIS_REASON} · `) &&
      synopsisJudged.metric.total === '这本书判断了 2 条：准确 0、不准确 1、不完整 1' &&
      JSON.stringify(synopsisJudged.metric.dimensions) === JSON.stringify(['全书梗概：1 条，准确 0、不准确 0、不完整 1', '人物与名称：1 条，准确 0、不准确 1、不完整 0']),
    'feedback-synopsis-recorded-words', synopsisJudged);

    at('feedback-change');
    // 改反馈… records a successor: 准确 asks for no reason and no correction; the earlier judgment stays on record beside it,
    // and the tally counts the entry once, by its latest.
    await clickSelector(renderer, '#analysis-tab-entities', 'feedback-change-tab');
    await clickSelector(renderer, `${feedbackItem('entities/0')} [data-analysis-action="open-feedback"]`, 'feedback-change-open');
    await readFeedback(renderer, (page) => page.card?.item === 'entities/0', 'feedback-change-card');
    await tick(renderer, `${feedbackItem('entities/0')} .analysis-feedback-judgments input[value="accurate"]`, 'feedback-change-accurate');
    const accurateCard = await readFeedback(renderer, (page) => page.card?.judgments?.[0]?.[1] === true, 'feedback-change-accurate-card');
    requireJourney(accurateCard.card.reasons === null && accurateCard.card.correction === false && accurateCard.card.record === 'enabled',
      'feedback-change-accurate-asks-nothing', accurateCard.card);
    await clickSelector(renderer, `${feedbackItem('entities/0')} [data-analysis-action="record-feedback"]`, 'feedback-change-record');
    const changed = await readFeedback(renderer, (page) => page.card === null && rowOf(page, 'entities/0')[2] === '2', 'feedback-changed');
    const changedRow = rowOf(changed, 'entities/0');
    requireJourney(changedRow[1] === 'accurate' && (changedRow[3] ?? '').startsWith('你的反馈：准确 · ') && !(changedRow[3] ?? '').includes('修正') &&
      changed.metric.total === '这本书判断了 2 条：准确 1、不准确 0、不完整 1', 'feedback-changed-words', changed);
    const recorded = await renderer.evaluate(`window.ai7.inspectAnalysisFeedback({ revisionId: ${JSON.stringify(revisionId)} })`);
    const recordedEntity = recorded?.items?.find((entry) => entry.itemKey === 'entities/0');
    requireJourney(recordedEntity?.signals === 2 && UUID_PATTERN.test(recordedEntity.latest?.supersedes ?? '') && recordedEntity.latest.judgment === 'accurate' &&
      recorded.metric.judged === 2 && recorded.metric.definition === 'ai7.analysis-quality-metric/1' && recorded.metric.scope === 'book' &&
      recorded.metric.lineageDigest === changed.metric.lineage, 'feedback-changed-service', { signals: recordedEntity?.signals, metric: recorded?.metric });

    at('feedback-unchanged');
    // The same judgment again would change nothing: it is refused in the card, with why, and the entry keeps its two.
    await clickSelector(renderer, `${feedbackItem('entities/0')} [data-analysis-action="open-feedback"]`, 'feedback-unchanged-open');
    await readFeedback(renderer, (page) => page.card?.item === 'entities/0', 'feedback-unchanged-card');
    await tick(renderer, `${feedbackItem('entities/0')} .analysis-feedback-judgments input[value="accurate"]`, 'feedback-unchanged-accurate');
    await clickSelector(renderer, `${feedbackItem('entities/0')} [data-analysis-action="record-feedback"]`, 'feedback-unchanged-record');
    const unchanged = await readFeedback(renderer, (page) => typeof page.card?.refusal === 'string', 'feedback-unchanged-refused');
    requireJourney(unchanged.card.refusal === '反馈没有变化。' && rowOf(unchanged, 'entities/0')[2] === '2' &&
      JSON.stringify(unchanged.card.judgments) === JSON.stringify([['accurate', true], ['inaccurate', false], ['incomplete', false]]), 'feedback-unchanged-words', unchanged);
    await waitFor(renderer, `${status} === '反馈没有变化。'`, 'feedback-unchanged-status');
    await clickSelector(renderer, `${feedbackItem('entities/0')} [data-analysis-action="cancel-feedback"]`, 'feedback-unchanged-cancel');
    await readFeedback(renderer, (page) => page.card === null, 'feedback-unchanged-closed');

    at('j14-feedback-keyboard');
    // Without a pointer: Enter on an event's 反馈… opens its card at the first judgment, nothing chosen, and Escape closes it
    // with nothing recorded and the focus back on 反馈….
    await clickSelector(renderer, '#analysis-tab-events', 'feedback-keyboard-tab');
    const eventToggle = `${feedbackItem('events/0')} [data-analysis-action="open-feedback"]`;
    await assertRenderer(renderer, `(() => { const open = document.querySelector(${JSON.stringify(eventToggle)}); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.focus(); return document.activeElement === open; })()`, 'feedback-keyboard-focused');
    await pressEnter(renderer);
    const keyboardCard = await readFeedback(renderer, (page) => page.card?.item === 'events/0' && JSON.stringify(page.focus) === JSON.stringify(['events/0', 'accurate']), 'feedback-keyboard-open');
    requireJourney(keyboardCard.card.judgments.every(([, checked]) => checked === false), 'feedback-keyboard-nothing-chosen', keyboardCard.card);
    await pressEscape(renderer);
    const keyboardClosed = await readFeedback(renderer, (page) => page.card === null && JSON.stringify(page.focus) === JSON.stringify(['events/0', 'open-feedback']), 'feedback-keyboard-closed');
    requireJourney(rowOf(keyboardClosed, 'events/0')[2] === '0' && keyboardClosed.metric.judged === '2', 'feedback-keyboard-nothing-recorded', keyboardClosed);

    at('j14-feedback-reflow-forced-colors');
    // At 200% an open card, its judgments, its reasons and its correction reflow into the width; without colour the card
    // and both its groups keep their borders.
    await clickSelector(renderer, eventToggle, 'feedback-reflow-open');
    await readFeedback(renderer, (page) => page.card?.item === 'events/0', 'feedback-reflow-card');
    await tick(renderer, `${feedbackItem('events/0')} .analysis-feedback-judgments input[value="incomplete"]`, 'feedback-reflow-incomplete');
    await readFeedback(renderer, (page) => Array.isArray(page.card?.reasons), 'feedback-reflow-reasons');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [document.querySelector('.analysis-feedback-card'), ...document.querySelectorAll('.analysis-feedback-card fieldset'), document.querySelector('.analysis-feedback-correction')]; return parts.length === 4 && parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'feedback-reflow', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const card = document.querySelector('.analysis-feedback-card');
      const groups = Array.from(document.querySelectorAll('.analysis-feedback-card fieldset'));
      return card instanceof HTMLElement && getComputedStyle(card).borderTopStyle === 'solid' && groups.length === 2 && groups.every((group) => getComputedStyle(group).borderTopStyle === 'solid');
    })()`, 'feedback-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await clickSelector(renderer, `${feedbackItem('events/0')} [data-analysis-action="cancel-feedback"]`, 'feedback-reflow-cancel');
    await readFeedback(renderer, (page) => page.card === null, 'feedback-reflow-closed');

    at('feedback-silence-is-not-approval');
    // What nobody judged stays unjudged: every other item reads no judgment, the tally counts the two, and nothing asks for
    // more — 待我处理 lists no feedback. The one thing it gains is 学习准入's single item for the Book (Issue #61, S26b): the
    // synopsis was judged in the editor's own words, which are material for them to decide on, not a call to judge the rest.
    const silence = await readFeedback(renderer, (page) => page.card === null, 'feedback-silence');
    requireJourney(silence.items.filter(([, judgment]) => judgment !== 'none').map(([key, judgment]) => `${key}:${judgment}`).join() === 'synopsis:incomplete,entities/0:accurate' &&
      silence.metric.judged === '2', 'feedback-silence-unjudged', silence.items.map(([key, judgment]) => [key, judgment]));
    const attentionAfter = await renderer.evaluate(`window.ai7.inspectGlobalAttention().then((projection) => projection.groups.map((group) => [group.key, group.items.map((entry) => entry.itemId)]))`);
    const learningAsk = `learning-materials:${thirdId}`;
    const attentionBesideLearning = Array.isArray(attentionAfter) ? attentionAfter.map(([key, items]) => [key, items.filter((itemId) => itemId !== learningAsk)]) : null;
    requireJourney(Array.isArray(attentionBefore) && JSON.stringify(attentionBesideLearning) === JSON.stringify(attentionBefore) &&
      attentionAfter.some(([key, items]) => key === 'decisions' && items.includes(learningAsk)), 'feedback-no-attention', { before: attentionBefore, after: attentionAfter });

    at('feedback-restart');
    // A restart moves nothing: each judgment and the tally read as before, over the same lineage.
    const feedbackBefore = await readFeedback(renderer, (page) => page.card === null, 'feedback-restart-before');
    await close();
    cancellation.throwIfRequested();
    await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'feedback-restart-ready');
    await openAnalysisOf(renderer, thirdId, 'feedback-restart');
    const feedbackAfter = await readFeedback(renderer, (page) => page.metric?.judged === '2' && page.items.every(([, judgment]) => judgment !== null), 'feedback-restart-after');
    requireJourney(JSON.stringify(feedbackAfter.items) === JSON.stringify(feedbackBefore.items) && JSON.stringify(feedbackAfter.metric) === JSON.stringify(feedbackBefore.metric),
      'feedback-restart-unmoved', { before: feedbackBefore.items, after: feedbackAfter.items });
    await click(renderer, '工作概览', 'evaluation-pages-overview');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'evaluation-pages-overview-ready');
    at('evaluation-reevaluate');
    await click(renderer, '返回图书列表', 'evaluation-pages-return');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'evaluation-pages-library');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id="${thirdId}"]`, 'evaluation-pages-book');
    await waitFor(renderer, `document.querySelector('.editor-shell [data-work-destination="evaluation"]')`, 'evaluation-pages-manuscript');
    await clickSelector(renderer, '.editor-shell [data-work-destination="evaluation"]', 'evaluation-pages-open');
    await readEvaluation(renderer, (page) => page.record?.heading === '第 2 版 · 编辑评分中', 'evaluation-pages-second');
    for (let ordinal = 2; ordinal <= 12; ordinal += 1) {
      await tick(renderer, '[data-screen="book-evaluation"] .evaluation-conclusion [data-conclusion="revise"] input', 'evaluation-pages-conclusion');
      await clickSelector(renderer, '[data-evaluation-action="finalize"]', 'evaluation-pages-finalize');
      await readEvaluation(renderer, (page) => page.record?.heading === `第 ${ordinal} 版 · 定稿`, 'evaluation-pages-finalized');
      await clickSelector(renderer, '[data-evaluation-action="start"]', 'evaluation-pages-next');
      await readEvaluation(renderer, (page) => page.record?.heading === `第 ${ordinal + 1} 版 · 编辑评分中`, 'evaluation-pages-started');
    }
    await tick(renderer, `${risk('law-rights-ethics-policy')} input[value="low"]`, 'evaluation-pages-low-risk');
    await assertRenderer(renderer, `(() => {
      const original=Promise.prototype.then;
      const held={release:null}; window.__j11HeldEvaluationPage=held;
      try {
        Promise.prototype.then=function(success,failure) {
          Promise.prototype.then=original;
          return original.call(this,
            (value)=>new Promise((resolve)=>{held.release=()=>resolve(success(value));}),
            (error)=>new Promise((_resolve,reject)=>{held.release=()=>reject(error);}));
        };
        document.querySelector('[data-evaluation-action="versions-older"]').click();
      } finally { Promise.prototype.then=original; }
      return true;
    })()`, 'evaluation-pages-hold-completion');
    await waitFor(renderer, `typeof window.__j11HeldEvaluationPage?.release==='function'`, 'evaluation-pages-completion-held');
    await fill(renderer, `${item('literary-quality')} [data-evaluation-field="score"]`, '17.5', 'evaluation-pages-unsaved');
    await assertRenderer(renderer, `(() => { window.__j11HeldEvaluationPage.release(); delete window.__j11HeldEvaluationPage; return true; })()`, 'evaluation-pages-release');
    await waitFor(renderer, `document.querySelectorAll('.evaluation-version-list li').length===3 && document.querySelector('.evaluation-version-list button')?.textContent.startsWith('第 3 版') && document.activeElement===document.querySelector('.evaluation-versions h3')`, 'evaluation-pages-oldest');
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(`${item('literary-quality')} [data-evaluation-field="score"]`)})?.value==='17.5' && document.querySelector('.evaluation-record')?.dataset.entries==='1' && document.querySelector('.evaluation-conclusion [data-conclusion="recommend"] input')?.disabled===false`, 'evaluation-pages-kept-input');
    await clickSelector(renderer, '[data-evaluation-action="versions-latest"]', 'evaluation-pages-latest');
    await waitFor(renderer, `document.querySelectorAll('.evaluation-version-list li').length===10 && document.querySelector('.evaluation-version-list button')?.textContent.startsWith('第 13 版') && document.activeElement===document.querySelector('.evaluation-versions h3')`, 'evaluation-pages-latest-focus');
    await clickSelector(renderer, '[data-evaluation-action="save"]', 'evaluation-pages-save-input');
    await readEvaluation(renderer, (page) => page.record?.entries === '2' && page.record.items[0][2] === '17.5', 'evaluation-pages-saved-input');

    // ---- AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007, EVAL-011, EVAL-014) ---------------
    at('initial-evaluation-start');
    // ②C offers AI7's 初评 before there is one; 准备 AI7 初评 opens its plan in the Task Drawer, whose bar starts it, and ②C follows
    // the Run to its end on the J-04 adapter's authored fixture.
    const beforeInitial = await readEvaluation(renderer, (page) => page.initial !== null, 'initial-evaluation-offered');
    requireJourney(beforeInitial.initial.state === 'none' && beforeInitial.initial.none === 'AI7 还没有为这本书做初评。' &&
      JSON.stringify(beforeInitial.initial.actions) === JSON.stringify([['prepare-initial', '准备 AI7 初评', false]]) && beforeInitial.startFromInitial === null,
    'initial-evaluation-offered-words', beforeInitial.initial);
    await clickSelector(renderer, '[data-evaluation-action="prepare-initial"]', 'initial-evaluation-prepare');
    await waitFor(renderer, `(() => { const drawer = document.querySelector('#task-drawer'); return drawer?.dataset.taskDrawer === 'open' && drawer.dataset.taskPlanKind === 'initial-evaluation' && drawer.dataset.taskPlanStart === 'ready' && drawer.querySelector('[data-task-drawer-control="start"]')?.disabled === false; })()`, 'initial-evaluation-plan', 120_000);
    // The plan in the editor's words, as the drawer reads it: its task, its two steps, its 工序, and that it scores nothing for
    // the editor; no button of the drawer carries 授权.
    const planWords = await renderer.evaluate(`window.ai7.inspectTaskPlan({ kind: 'initial-evaluation', ref: document.querySelector('#task-drawer').dataset.taskPlanRef })
      .then((plan) => JSON.stringify([plan.goal.sentence, plan.steps.map((step) => step.label), plan.notDo.editorial.includes('不替你打分：评估记录保存的是你的评分'), plan.goal.chips.procedure]))`);
    requireJourney(planWords === JSON.stringify(['按本社评估方案为这本书做 AI7 初评：各评分项的初评分数与评语，供你打分时参考', ['逐章读取，记下各评分项的依据', '全书综合'], true, '审稿评估方案 第 1 版']),
      'initial-evaluation-plan-words', planWords);
    await assertRenderer(renderer, `(() => { const drawer = document.querySelector('#task-drawer'); return (drawer?.textContent ?? '').includes('按本社评估方案为这本书做 AI7 初评') && Array.from(drawer.querySelectorAll('button'), (button) => button.textContent).every((label) => !label.includes('授权')); })()`, 'initial-evaluation-plan-shown');
    const prepared = await readEvaluation(renderer, (page) => page.initial?.state === 'prepared', 'initial-evaluation-prepared');
    requireJourney(JSON.stringify(prepared.initial.actions) === JSON.stringify([['open-initial-plan', '查看计划并开始', false]]) &&
      prepared.initial.task === 'AI7 初评 · 尚未开始', 'initial-evaluation-prepared-words', prepared.initial);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="start"]', 'initial-evaluation-run');
    const settledInitial = await readEvaluation(renderer, (page) => ['settled', 'failed', 'interrupted'].includes(page.initial?.state), 'initial-evaluation-ended');
    requireJourney(settledInitial.initial.state === 'settled', 'initial-evaluation-settled', settledInitial.initial);
    await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanState === 'settled'`, 'initial-evaluation-drawer-settled', 30_000);
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'initial-evaluation-drawer-close');
    await waitFor(renderer, `document.body.dataset.taskDrawer !== 'open'`, 'initial-evaluation-drawer-closed');

    at('initial-evaluation-draft');
    // AI7's 初评 on ②C: each item's score with its 依据充分度 — 充分, 一般 or 不足 by what it cited — and the conclusion it would
    // suggest, said as AI7's. A version begins from it once the open one is 定稿; it reads 「AI7 初稿」 with AI7's scores beside the
    // editor's, no risk and no conclusion chosen for them.
    requireJourney(settledInitial.initial.latest === '第 1 次初评 · 读的是修订版 r1 · 总分 73 / 100 · 优秀' &&
      JSON.stringify(settledInitial.initial.items) === JSON.stringify(AI7_ITEM_LINES) &&
      settledInitial.initial.conclusion === 'AI7 建议的结论：修改后再议（由你选定）' &&
      JSON.stringify(settledInitial.initial.actions) === JSON.stringify([['prepare-initial', '重新初评', false], ['open-initial-task', '查看任务', false]]) &&
      settledInitial.startReason === '第 13 版还没有定稿；定稿后才能重新评估。' && settledInitial.startFromInitial === null,
    'initial-evaluation-latest-words', settledInitial.initial);
    await tick(renderer, '[data-screen="book-evaluation"] .evaluation-conclusion [data-conclusion="revise"] input', 'initial-evaluation-close-open-conclusion');
    await clickSelector(renderer, '[data-evaluation-action="finalize"]', 'initial-evaluation-close-open');
    const closedOpen = await readEvaluation(renderer, (page) => page.record?.heading === '第 13 版 · 定稿' && page.startFromInitial !== null, 'initial-evaluation-open-closed');
    requireJourney(closedOpen.startFromInitial === '从 AI7 初评开始' && closedOpen.start === '重新评估', 'initial-evaluation-start-offered', closedOpen);
    await clickSelector(renderer, '[data-evaluation-action="start-from-initial"]', 'initial-evaluation-begin');
    const draft = await readEvaluation(renderer, (page) => page.record?.heading === '第 14 版 · AI7 初稿', 'initial-evaluation-begun');
    requireJourney(draft.record.ai7 === '这一版从 AI7 第 1 次初评开始（读的是修订版 r1）：AI7 的分数列在每一项旁边，记录保存的是你的评分。' &&
      JSON.stringify(draft.record.items.map(([, , score]) => score)) === JSON.stringify(['16.5', '15', '15.5', '14', '12']) &&
      JSON.stringify(draft.record.ai7Items.map(([itemId, line, offered, ticked]) => [itemId, line, offered, ticked.length])) ===
        JSON.stringify(AI7_ITEM_LINES.map(([itemId, , line]) => [itemId, line.slice(line.indexOf('：') + 1), false, 0])) &&
      draft.record.total === '总分 73 / 100 · 优秀' && draft.record.conclusions.every(([, checked]) => checked === false) &&
      JSON.stringify(draft.record.ai7Evidence) === JSON.stringify(['AI7 的依据（9 条）', 'AI7 的依据（3 条）', 'AI7 的依据（8 条）', 'AI7 的依据（7 条）', null]) &&
      draft.record.ai7Unread === null &&
      JSON.stringify(draft.record.suggested) === JSON.stringify([null, 'AI7 建议', null, null]) &&
      draft.record.ai7Conclusion === 'AI7 建议的结论：修改后再议（由你选定）' && JSON.stringify(draft.record.actions) === JSON.stringify(['保存评估', '定稿']) && draft.versions[0].startsWith('第 14 版 · AI7 初稿 · 修订版 r1 · 总分 73 / 100'),
    'initial-evaluation-draft-words', draft.record);

    at('initial-evaluation-adjust');
    // The editor's own score departs from AI7's: 调分原因 is offered beside it, none ticked, and the one they tick is kept with
    // the score. The record keeps the editor's; AI7's stays beside it.
    await fill(renderer, `${item('readers-and-market')} [data-evaluation-field="score"]`, '10', 'initial-evaluation-adjust-score');
    const adjustmentOffered = await readEvaluation(renderer, (page) => page.record?.ai7Items[4]?.[2] === true, 'initial-evaluation-reasons-offered');
    requireJourney(JSON.stringify(adjustmentOffered.record.ai7Items.map(([, , open, ticked]) => [open, ticked.length])) === JSON.stringify([[false, 0], [false, 0], [false, 0], [false, 0], [true, 0]]) &&
      adjustmentOffered.record.total === '总分 71 / 100 · 优秀', 'initial-evaluation-reasons-unticked', adjustmentOffered.record.ai7Items);
    await tick(renderer, `${item('readers-and-market')} [data-evaluation-field="adjustment-reason"][value="too-high"]`, 'initial-evaluation-reason');
    await clickSelector(renderer, '[data-evaluation-action="save"]', 'initial-evaluation-adjust-save');
    await waitFor(renderer, `${status} === '评估已保存。'`, 'initial-evaluation-adjust-saved-status');
    const adjusted = await readEvaluation(renderer, (page) => page.record?.heading === '第 14 版 · 编辑评分中' && page.record.entries === '2', 'initial-evaluation-adjusted');
    requireJourney(JSON.stringify(adjusted.record.ai7Items[4]) === JSON.stringify(['readers-and-market', AI7_ITEM_LINES[4][2].slice(AI7_ITEM_LINES[4][2].indexOf('：') + 1), true, ['too-high']]) &&
      adjusted.record.items[4][2] === '10', 'initial-evaluation-adjusted-words', adjusted.record);
    const storedAdjustment = await renderer.evaluate(`window.ai7.inspectEvaluation({ recordId: null }).then((page) => JSON.stringify([page.record.content.items.map((entry) => entry.score), page.record.content.items[4].adjustment, page.record.initial.items.map((entry) => entry.score)]))`);
    requireJourney(storedAdjustment === JSON.stringify([[16.5, 15, 15.5, 14, 10], { note: null, reasons: ['too-high'] }, [16.5, 15, 15.5, 14, 12]]), 'initial-evaluation-adjusted-service', storedAdjustment);

    at('initial-evaluation-finalize');
    // 定稿: the conclusion is the editor's to choose — AI7's suggestion was never chosen for them — and the risks carry from the
    // version before, as 重新评估 carries them.
    await tick(renderer, '[data-screen="book-evaluation"] .evaluation-conclusion [data-conclusion="revise"] input', 'initial-evaluation-conclusion');
    await clickSelector(renderer, '[data-evaluation-action="finalize"]', 'initial-evaluation-finalize');
    await waitFor(renderer, `${status} === '第 14 版评估已定稿。'`, 'initial-evaluation-finalized-status');
    const finalizedInitial = await readEvaluation(renderer, (page) => page.record?.state === 'finalized' && page.record.heading === '第 14 版 · 定稿', 'initial-evaluation-finalized');
    requireJourney(finalizedInitial.record.total === '总分 71 / 100 · 优秀' && finalizedInitial.record.allDisabled === true &&
      JSON.stringify(finalizedInitial.record.ai7Items[4][3]) === JSON.stringify(['too-high']), 'initial-evaluation-finalized-words', finalizedInitial.record);

    at('initial-evaluation-calibration');
    // 设置 › 评估校准与预测 counts the Book whose AI7 初评 the editor adjusted, once — 「1 本」 — and no longer says AI7's 初评 is not
    // connected. The calibration itself waits for ten such Books.
    await assertRenderer(renderer, `(() => { const open = Array.from(document.querySelectorAll('[data-screen="book-evaluation"] .workbench-actions button')).find((button) => button.textContent === '工作概览'); if (!(open instanceof HTMLButtonElement) || open.disabled) return false; open.click(); return true; })()`, 'initial-evaluation-overview');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'initial-evaluation-overview-ready');
    await click(renderer, '返回图书列表', 'initial-evaluation-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'initial-evaluation-landing');
    await click(renderer, '评估校准与预测', 'initial-evaluation-calibration-open');
    await waitFor(renderer, `document.querySelector('[data-screen="evaluation-calibration"] .calibration-calibration .calibration-progress')?.textContent === '调分记录 1 / 10 本 · 满 10 本后生效'`, 'initial-evaluation-calibration-count');
    await assertRenderer(renderer, `document.querySelector('[data-screen="evaluation-calibration"] .calibration-waiting') === null`, 'initial-evaluation-calibration-connected');
    const calibrationService = await renderer.evaluate(`window.ai7.inspectEvaluationCalibration({ after: null, focusBookId: null }).then((answer) => JSON.stringify([answer.calibration.adjustments, answer.calibration.initialScoresConnected, answer.calibration.active]))`);
    requireJourney(calibrationService === JSON.stringify([1, true, false]), 'initial-evaluation-calibration-service', calibrationService);
    // Back to 评估 by the manuscript's 工作 group, where the Journey goes on.
    await click(renderer, '返回', 'initial-evaluation-calibration-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'initial-evaluation-back-landing');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id="${thirdId}"]`, 'initial-evaluation-back-book');
    await waitFor(renderer, `document.querySelector('.editor-shell [data-work-destination="evaluation"]')`, 'initial-evaluation-back-manuscript', 120_000);
    await clickSelector(renderer, '.editor-shell [data-work-destination="evaluation"]', 'initial-evaluation-back-open');
    await readEvaluation(renderer, (page) => page.state === 'ready' && page.record?.heading === '第 14 版 · 定稿', 'initial-evaluation-back-ready');

    // ---- 就地反馈轻问 after a Proposal Decision (Issue #61, plan slice S26a; FDBK-001 to FDBK-007, PDEC-009, MARK-005) -------
    at('decision-feedback-suggestions');
    // Two 修改建议 of the Journey's own words on the same manuscript, made through the selection menu as J-05 makes them.
    await click(renderer, '打开稿件', 'decision-open-manuscript');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')`, 'decision-editor', 120_000);
    await assertRenderer(renderer, MARK_HELPERS, 'decision-page-helpers');
    // Two paragraphs whose first 40 code units are 40 graphemes, so a range by offset is a range of characters.
    const markable = await renderer.evaluate(`(() => { const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }); return Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > p[data-block-id]')).filter((node) => { const head = (node.textContent ?? '').slice(0, 40); return head.length === 40 && Array.from(segmenter.segment(head)).length === 40; }).slice(0, 2).map((node) => node.dataset.blockId); })()`);
    requireJourney(Array.isArray(markable) && markable.length === 2 && markable.every((id) => /^blk_[0-9a-f]{24}$/.test(id)), 'decision-markable-paragraphs');
    const [rejectBlock, applyBlock] = markable;
    for (const [blockId, words, name] of [[rejectBlock, SUGGESTION_REJECTED, 'decision-suggestion-rejected'], [applyBlock, SUGGESTION_APPLIED, 'decision-suggestion-applied']]) {
      await openSelectionMenu(renderer, blockId, 2, 6, `${name}-menu`);
      await chooseMenuItem(renderer, 'add-change-suggestion', `${name}-choose`);
      await waitFor(renderer, `window.__j11.composer()?.dataset.markComposer === 'create-change-suggestion'`, `${name}-composer`);
      await assertRenderer(renderer, `window.__j11.write('proposedText', ${JSON.stringify(words)}) && window.__j11.act('submit')`, `${name}-submit`);
      await waitFor(renderer, `window.__j11.mark('change-suggestion', ${JSON.stringify(blockId)}).length > 0 && window.__j11.composer() === null`, `${name}-drawn`);
    }

    at('decision-feedback-dismiss');
    // 拒绝 asks why once, under 你的处理: three reasons fitted to a rejection, none chosen, `其他 / 自行输入` beside them, and
    // `不说明`. 不说明 records no more than that, and closing and reopening the card never asks again.
    await openMarkCard(renderer, 'change-suggestion', rejectBlock, 'decision-reject-card');
    await assertRenderer(renderer, `window.__j11.act('reject')`, 'decision-reject');
    const asked = await readDecision(renderer, (card) => card.prompt?.mode === 'prompt', 'decision-reject-asked');
    requireJourney(asked.state === 'none' && asked.prompt.question === '为什么拒绝？（可选）' &&
      JSON.stringify(asked.prompt.chips) === JSON.stringify([['证据不足', false], ['方向不合适', false], ['保持作者风格', false]]) &&
      asked.prompt.own === '其他 / 自行输入' && asked.prompt.end === '不说明' && asked.reason === null && asked.later === null, 'decision-reject-asked-words', asked);
    await assertRenderer(renderer, `window.__j11.act('reason-dismiss')`, 'decision-dismiss');
    await waitFor(renderer, `${status} === '已记下：这次不说明原因。'`, 'decision-dismiss-status');
    const dismissed = await readDecision(renderer, (card) => card.state === 'dismissed', 'decision-dismissed');
    requireJourney(dismissed.prompt === null && dismissed.reason === null && dismissed.later === '补充原因…', 'decision-dismissed-words', dismissed);
    await pressEscape(renderer);
    await waitFor(renderer, `window.__j11.card() === null`, 'decision-dismissed-closed');
    await openMarkCard(renderer, 'change-suggestion', rejectBlock, 'decision-dismissed-reopen');
    const reopenedDismissed = await readDecision(renderer, (card) => card.state === 'dismissed', 'decision-dismissed-reopened');
    requireJourney(reopenedDismissed.prompt === null && reopenedDismissed.later === '补充原因…', 'decision-dismissed-not-asked-again', reopenedDismissed);

    at('decision-feedback-own-accord');
    // Of the editor's own accord: 补充原因… opens the same row, ending in 取消 rather than 不说明; their own words under
    // `其他 / 自行输入` are recorded as theirs; 改原因… records a successor, the first reason kept on record.
    await assertRenderer(renderer, `window.__j11.act('reason-add')`, 'decision-add');
    const adding = await readDecision(renderer, (card) => card.prompt?.mode === 'add', 'decision-adding');
    requireJourney(adding.prompt.end === '取消' && adding.prompt.chips.every(([, pressed]) => pressed === false), 'decision-adding-words', adding);
    await assertRenderer(renderer, `window.__j11.act('reason-cancel')`, 'decision-add-cancel');
    await readDecision(renderer, (card) => card.prompt === null && card.focus === 'reason-add', 'decision-add-cancel-focus');
    await assertRenderer(renderer, `window.__j11.act('reason-add')`, 'decision-add-again');
    await assertRenderer(renderer, `window.__j11.act('reason-own')`, 'decision-own');
    await waitFor(renderer, `window.__j11.card()?.querySelector('[data-mark-form="decision-reason"] [data-mark-field="reason"]') !== null`, 'decision-own-form');
    await assertRenderer(renderer, `window.__j11.write('reason', ${JSON.stringify(OWN_REASON)}) && window.__j11.act('submit')`, 'decision-own-submit');
    await waitFor(renderer, `${status} === '已记下你的原因。'`, 'decision-own-status');
    const own = await readDecision(renderer, (card) => card.state === 'given', 'decision-own-recorded');
    requireJourney(JSON.stringify(own.reason) === JSON.stringify(['free-text', `你的原因：${OWN_REASON}`]) && own.later === '改原因…' && own.prompt === null, 'decision-own-words', own);
    requireJourney(own.reasonSource === '原因来源：你自行输入的文字', 'decision-own-source', own.reasonSource);
    await assertRenderer(renderer, `window.__j11.act('reason-revise')`, 'decision-revise');
    await readDecision(renderer, (card) => card.prompt?.mode === 'revise', 'decision-revising');
    await assertRenderer(renderer, `window.__j11.act('reason-cancel')`, 'decision-revise-cancel');
    await readDecision(renderer, (card) => card.prompt === null && card.focus === 'reason-revise', 'decision-revise-cancel-focus');
    await assertRenderer(renderer, `window.__j11.act('reason-revise')`, 'decision-revise-again');
    await assertRenderer(renderer, `(() => { const chip = window.__j11.card()?.querySelector('[data-mark-reason-chip="证据不足"]'); if (!(chip instanceof HTMLButtonElement)) return false; chip.click(); return true; })()`, 'decision-revise-chip');
    await waitFor(renderer, `${status} === '已改好原因；原来的原因仍留在记录里。'`, 'decision-revise-status');
    const revisedCard = await readDecision(renderer, (card) => card.reason?.[0] === 'suggested', 'decision-revised');
    requireJourney(revisedCard.reason[1].startsWith('你的原因：证据不足（') && revisedCard.reason[1].endsWith(' 改过）') && revisedCard.later === '改原因…', 'decision-revised-words', revisedCard);
    requireJourney(revisedCard.reasonSource === '原因来源：你选择的选项', 'decision-revised-source', revisedCard.reasonSource);
    await pressEscape(renderer);
    await waitFor(renderer, `window.__j11.card() === null`, 'decision-revised-closed');

    at('decision-feedback-after-apply');
    // 接受并应用 asks why too, with the reasons fitted to an acceptance; moving on without answering ends the prompt and records
    // nothing: reopened, the card offers 补充原因… and the service holds no entry after the decision.
    await openMarkCard(renderer, 'change-suggestion', applyBlock, 'decision-apply-card');
    await assertRenderer(renderer, `window.__j11.act('accept-and-apply')`, 'decision-accept-and-apply');
    const applied = await readDecision(renderer, (card) => card.applied && card.prompt?.mode === 'prompt', 'decision-applied-asked');
    requireJourney(applied.state === 'none' && applied.prompt.question === '为什么接受？（可选）' &&
      JSON.stringify(applied.prompt.chips) === JSON.stringify([['语言更准确', false], ['保持作者风格', false]]) && applied.prompt.end === '不说明', 'decision-applied-asked-words', applied);
    await pressEscape(renderer);
    await waitFor(renderer, `window.__j11.card() === null`, 'decision-applied-moved-on');
    await openMarkCard(renderer, 'change-suggestion', applyBlock, 'decision-applied-reopen');
    const movedOn = await readDecision(renderer, (card) => card.applied && card.state === 'none', 'decision-applied-reopened');
    requireJourney(movedOn.prompt === null && movedOn.later === '补充原因…', 'decision-applied-not-asked-again', movedOn);
    const appliedMark = await renderer.evaluate(`window.__j11.card()?.dataset.markCard ?? null`);
    requireJourney(typeof appliedMark === 'string', 'decision-applied-mark-identity');
    const appliedDecision = await renderer.evaluate(`(async () => { const work = (await window.ai7.listPriorWork()).find((entry) => entry.bookTitle === ${JSON.stringify(THIRD.title)}); const card = await window.ai7.getEditorialMarkCard({ manuscriptId: work.manuscriptId, branchId: work.branchId, markId: ${JSON.stringify(appliedMark)} }); return card.suggestion.decision; })()`);
    requireJourney(appliedDecision?.disposition === 'accepted' && appliedDecision.reasonState === 'none' && appliedDecision.feedbackEntries === 0 && appliedDecision.reason === null,
      'decision-applied-nothing-recorded', appliedDecision);

    at('j14-decision-feedback-keyboard');
    // Without a pointer: Enter on 补充原因… opens the row with the focus on its first reason, and Escape leaves it.
    await assertRenderer(renderer, `(() => { const add = window.__j11.card()?.querySelector('[data-mark-action="reason-add"]'); if (!(add instanceof HTMLButtonElement)) return false; add.focus(); return document.activeElement === add; })()`, 'decision-keyboard-focused');
    await pressEnter(renderer);
    const keyboardRow = await readDecision(renderer, (card) => card.prompt?.mode === 'add' && card.focus === '语言更准确', 'decision-keyboard-row');
    requireJourney(keyboardRow.prompt.end === '取消', 'decision-keyboard-row-words', keyboardRow);
    await pressEscape(renderer);
    await waitFor(renderer, `window.__j11.card() === null`, 'decision-keyboard-closed');

    at('decision-feedback-restart');
    // A restart asks nothing again: the rejection keeps its changed reason, and the acceptance nobody explained still waits
    // only for the editor's own 补充原因….
    await close();
    cancellation.throwIfRequested();
    await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'decision-restart-ready');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(thirdId)}]`, 'decision-restart-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(thirdId)}]') && document.querySelector('[data-testid="manuscript-editor"] > [data-block-id]')`, 'decision-restart-manuscript', 120_000);
    await assertRenderer(renderer, MARK_HELPERS, 'decision-restart-helpers');
    await openMarkCard(renderer, 'change-suggestion', rejectBlock, 'decision-restart-rejected');
    const keptRejected = await readDecision(renderer, (card) => card.state === 'given', 'decision-restart-rejected-read');
    requireJourney(keptRejected.prompt === null && keptRejected.reason?.[0] === 'suggested' && keptRejected.reason[1].startsWith('你的原因：证据不足（'), 'decision-restart-rejected-kept', keptRejected);
    await pressEscape(renderer);
    await waitFor(renderer, `window.__j11.card() === null`, 'decision-restart-rejected-closed');
    await openMarkCard(renderer, 'change-suggestion', applyBlock, 'decision-restart-applied');
    const keptApplied = await readDecision(renderer, (card) => card.applied && card.state === 'none', 'decision-restart-applied-read');
    requireJourney(keptApplied.prompt === null && keptApplied.later === '补充原因…', 'decision-restart-applied-not-asked', keptApplied);
    await pressEscape(renderer);

    // ---- 质量与学习 › 学习准入 (Issue #61, plan slice S26b; LEARN-001 to LEARN-012, ATTN-009, FDBK-013) --------------------
    at('learning-attention');
    // 待我处理 lists the Book once, in 等待你的决定: two of its records say why — the rejection's reason and the synopsis's
    // own words — and wait for the editor; the acceptance nobody explained and the bare 准确 are no material.
    const learningItem = `learning-materials:${thirdId}`;
    const learningSelector = `[data-screen="global-attention"] li.global-attention-item[data-attention-item=${JSON.stringify(learningItem)}]`;
    await clickSelector(renderer, '#global-attention-entry', 'learning-attention-entry');
    await waitFor(renderer, `document.querySelectorAll('[data-screen="global-attention"] section.global-attention-group').length === 4 && document.querySelector(${JSON.stringify(learningSelector)}) !== null`, 'learning-attention-listed', 30_000);
    const learningListed = await renderer.evaluate(readAttentionItem(learningSelector));
    requireJourney(learningListed?.group === 'decisions' && learningListed.state === 'learning-materials-pending' && learningListed.book === `《${THIRD.title}》` &&
      learningListed.object === '学习材料 · 2 条待定' && learningListed.pill === '学习准入待处理' && learningListed.next === '安全的下一步：定学习准入…',
    'learning-attention-words', learningListed);
    await clickSelector(renderer, `${learningSelector} button.global-attention-open`, 'learning-attention-open');
    const learningOpened = await readLearning(renderer, (page) => page.books.length === 1, 'learning-opened');
    requireJourney(learningOpened.basis === LEARNING_BASIS && learningOpened.books[0].bookId === thirdId && learningOpened.books[0].heading === `《${THIRD.title}》 · 2 条` &&
      learningOpened.books[0].people === '作者与责编：尚未填写' && learningOpened.card === null &&
      JSON.stringify(learningOpened.books[0].materials) === JSON.stringify([
        ['proposal-decision', 'pending', '待定', '修改建议 · 拒绝'], ['analysis-feedback', 'pending', '待定', '分析反馈 · 全书梗概'],
      ]), 'learning-opened-words', learningOpened);

    at('learning-review-card');
    // 查看… opens the Review Card in place at its heading: the bounded material, where it came from, why it is one, the basis,
    // what it could later influence, and no decision yet; the choice unselected, 仅纳入当前图书 marked 建议, 纳入当前书系 shown
    // with why it is not there, and 记录学习准入决定 closed until a choice is made.
    await clickSelector(renderer, `${learningRow('proposal-decision')} [data-learning-action="open"]`, 'learning-open-card');
    const learningCard = await readLearning(renderer, (page) => page.card?.material === 'proposal-decision', 'learning-card');
    requireJourney(learningCard.card.heading === '修改建议 · 拒绝' && JSON.stringify(learningCard.card.excerptHeads) === JSON.stringify(['原文', '建议', '你的原因']) &&
      learningCard.card.excerptTail === '你的原因：证据不足' && learningCard.card.facts.rationale === '你说明了为什么这样处理：它可以帮 AI7 以后的建议更接近你的判断。' &&
      learningCard.card.facts.basis === LEARNING_BASIS && learningCard.card.facts.influence === LEARNING_INFLUENCE && learningCard.card.facts.decision === '还没有决定。' &&
      learningCard.card.facts.task === undefined &&
      JSON.stringify(learningCard.card.choices) === JSON.stringify([['book', false, false], ['series', false, true], ['house', false, false], ['excluded', false, false], ['deferred', false, false]]) &&
      learningCard.card.recommended === 'book' && learningCard.card.seriesReason === '还没有书系：书系接通后，才能把材料纳入书系。' &&
      learningCard.card.consequence === null && learningCard.card.record === 'disabled' && JSON.stringify(learningCard.focus) === JSON.stringify(['proposal-decision', 'H4']),
    'learning-card-words', learningCard);

    at('learning-decide');
    // 纳入出版社经验 says its house-wide consequence beside it before anything is recorded, 仅纳入当前图书 the Book's; with the
    // editor's note, 记录学习准入决定 records the Book, and the row reads 已决定 with the focus back on 查看….
    await tick(renderer, `${learningRow('proposal-decision')} .learning-choices input[value="house"]`, 'learning-choose-house');
    const houseCard = await readLearning(renderer, (page) => typeof page.card?.consequence === 'string', 'learning-house-consequence');
    requireJourney(houseCard.card.consequence === '纳入出版社经验：全社以后的图书都可能从它学习。' && houseCard.card.record === 'enabled', 'learning-house-words', houseCard.card);
    await tick(renderer, `${learningRow('proposal-decision')} .learning-choices input[value="book"]`, 'learning-choose-book');
    const bookCard = await readLearning(renderer, (page) => page.card?.consequence?.startsWith('仅纳入当前图书') === true, 'learning-book-consequence');
    requireJourney(bookCard.card.consequence === `仅纳入当前图书：它只在《${THIRD.title}》里帮 AI7 学习。`, 'learning-book-words', bookCard.card);
    await fill(renderer, `${learningRow('proposal-decision')} [data-learning-field="note"]`, LEARNING_NOTE, 'learning-note');
    await clickSelector(renderer, `${learningRow('proposal-decision')} [data-learning-action="record"]`, 'learning-record');
    await waitFor(renderer, `${status} === '学习准入决定已记录。'`, 'learning-recorded-status');
    const learningRecorded = await readLearning(renderer, (page) => page.card === null && page.books[0]?.materials[0]?.[1] === 'decided', 'learning-recorded');
    requireJourney(learningRecorded.books[0].materials[0][2] === '已决定' && JSON.stringify(learningRecorded.focus) === JSON.stringify(['proposal-decision', 'open']),
      'learning-recorded-words', learningRecorded);
    const learningService = await renderer.evaluate(`window.ai7.inspectLearningMaterials({ bookId: ${JSON.stringify(thirdId)} }).then((projection) => projection.books[0].materials.map((material) => [material.kind, material.state, material.decision?.choice ?? null, material.decision?.note ?? null, material.decisions]))`);
    requireJourney(JSON.stringify(learningService) === JSON.stringify([['proposal-decision', 'decided', 'book', LEARNING_NOTE, 1], ['analysis-feedback', 'pending', null, null, 0]]),
      'learning-recorded-service', learningService);

    at('learning-defer');
    // 稍后决定 on the synopsis's own words keeps it unresolved — neither taught from nor excluded — and 待我处理 still lists the
    // Book once, as left for later.
    await clickSelector(renderer, `${learningRow('analysis-feedback')} [data-learning-action="open"]`, 'learning-open-analysis');
    const analysisCard = await readLearning(renderer, (page) => page.card?.material === 'analysis-feedback', 'learning-analysis-card');
    const analysisSourceTask = await renderer.evaluate(`window.ai7.inspectLearningMaterials({ bookId: ${JSON.stringify(thirdId)} }).then((projection) => projection.books[0].materials.find((material) => material.kind === 'analysis-feedback')?.sourceTask ?? null)`);
    requireJourney(analysisCard.card.heading === '分析反馈 · 全书梗概' && JSON.stringify(analysisCard.card.excerptHeads) === JSON.stringify(['全书梗概', '你的判断']) &&
      analysisCard.card.excerptTail === `你的判断：不完整 · ${SYNOPSIS_REASON}` && analysisSourceTask !== null &&
      analysisCard.card.facts.task === `${analysisSourceTask.label} · ${analysisSourceTask.taskIntentId}`, 'learning-analysis-card-words', analysisCard.card);
    await tick(renderer, `${learningRow('analysis-feedback')} .learning-choices input[value="deferred"]`, 'learning-choose-deferred');
    await clickSelector(renderer, `${learningRow('analysis-feedback')} [data-learning-action="record"]`, 'learning-defer-record');
    const learningDeferred = await readLearning(renderer, (page) => page.card === null && page.books[0]?.materials[1]?.[1] === 'deferred', 'learning-deferred');
    requireJourney(learningDeferred.books[0].materials[1][2] === '稍后决定', 'learning-deferred-words', learningDeferred);
    await clickSelector(renderer, '#global-attention-entry', 'learning-deferred-attention');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(learningSelector)})?.dataset.attentionState === 'learning-materials-deferred'`, 'learning-deferred-listed', 30_000);
    const deferredListed = await renderer.evaluate(readAttentionItem(learningSelector));
    requireJourney(deferredListed?.object === '学习材料 · 1 条稍后决定' && deferredListed.pill === '学习准入待处理 · 稍后决定', 'learning-deferred-attention-words', deferredListed);
    await clickSelector(renderer, `${learningSelector} button.global-attention-open`, 'learning-deferred-open');
    await readLearning(renderer, (page) => page.books.length === 1 && page.books[0].materials[1]?.[1] === 'deferred', 'learning-deferred-reopened');

    at('j14-learning-keyboard');
    // Without a pointer: Enter on 查看… opens the card at its heading, the decision it has stated and nothing chosen anew, and
    // Escape closes it with nothing recorded and the focus back on 查看….
    const decidedOpen = `${learningRow('proposal-decision')} [data-learning-action="open"]`;
    await assertRenderer(renderer, `(() => { const open = document.querySelector(${JSON.stringify(decidedOpen)}); if (!(open instanceof HTMLButtonElement)) return false; open.focus(); return document.activeElement === open; })()`, 'learning-keyboard-focused');
    await pressEnter(renderer);
    const keyboardLearning = await readLearning(renderer, (page) => page.card?.material === 'proposal-decision' && page.focus?.[1] === 'H4', 'learning-keyboard-card');
    requireJourney((keyboardLearning.card.facts.decision ?? '').startsWith('仅纳入当前图书 · ') && (keyboardLearning.card.facts.decision ?? '').endsWith(` · ${LEARNING_NOTE}`) &&
      keyboardLearning.card.choices.every(([, checked]) => checked === false), 'learning-keyboard-card-words', keyboardLearning.card);
    await pressEscape(renderer);
    await readLearning(renderer, (page) => page.card === null && JSON.stringify(page.focus) === JSON.stringify(['proposal-decision', 'open']), 'learning-keyboard-closed');

    at('j14-learning-reflow-forced-colors');
    // At 200% the Book, an open card, its facts and its choices reflow into the width; without colour each keeps its border.
    await clickSelector(renderer, decidedOpen, 'learning-reflow-open');
    await readLearning(renderer, (page) => page.card?.material === 'proposal-decision', 'learning-reflow-card');
    await tick(renderer, `${learningRow('proposal-decision')} .learning-choices input[value="house"]`, 'learning-reflow-house');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [document.querySelector('.learning-book'), document.querySelector('.learning-card'), document.querySelector('.learning-facts'), document.querySelector('.learning-choices')]; return parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'learning-reflow', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const parts = [document.querySelector('.learning-book'), document.querySelector('.learning-card'), document.querySelector('.learning-choices')];
      return parts.every((part) => part instanceof HTMLElement && getComputedStyle(part).borderTopStyle === 'solid');
    })()`, 'learning-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await clickSelector(renderer, `${learningRow('proposal-decision')} [data-learning-action="cancel"]`, 'learning-reflow-cancel');
    await readLearning(renderer, (page) => page.card === null, 'learning-reflow-closed');

    at('learning-restart');
    // A restart moves nothing: 质量与学习, opened from the landing, lists the one Book with material exactly as before.
    const learningBefore = await renderer.evaluate(`window.ai7.inspectLearningMaterials({ bookId: null }).then((projection) => JSON.stringify(projection))`);
    await close();
    cancellation.throwIfRequested();
    await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'learning-restart-ready');
    await click(renderer, '质量与学习', 'learning-restart-open');
    // Synchronized delta with S26c: the landing opens 质量与学习 at 反馈历史, and 学习准入 is its second tab.
    await clickSelector(renderer, '#quality-tab-learning', 'learning-restart-tab');
    const learningAfterPage = await readLearning(renderer, (page) => page.books.length === 1, 'learning-restart-page');
    requireJourney(JSON.stringify(learningAfterPage.books[0].materials.map(([kind, state]) => [kind, state])) === JSON.stringify([['proposal-decision', 'decided'], ['analysis-feedback', 'deferred']]),
      'learning-restart-page-words', learningAfterPage);
    const learningAfter = await renderer.evaluate(`window.ai7.inspectLearningMaterials({ bookId: null }).then((projection) => JSON.stringify(projection))`);
    requireJourney(typeof learningBefore === 'string' && learningAfter === learningBefore, 'learning-restart-unmoved');

    // ---- 质量与学习 › 反馈历史 (Issue #61, plan slice S26c; FDBK-009, FDBK-010, FDBK-013) ---------------------------------------
    at('feedback-history');
    // 反馈历史, where the landing opens 质量与学习: the Book's four pieces of feedback, newest first — the acceptance nobody
    // explained, the rejection with its reason as it stands, the entity's latest 准确 and the synopsis's own words — each read
    // as no more than it is, with nothing pending or counted.
    await clickSelector(renderer, '#quality-tab-feedback', 'feedback-history-tab');
    const history = await readHistory(renderer, (page) => page.entries.length === 4, 'feedback-history-read');
    requireJourney(history.note === FEEDBACK_HISTORY_NOTE && history.none === null &&
      JSON.stringify(history.books) === JSON.stringify([[`《${THIRD.title}》 · 4 条`, '作者与责编：尚未填写']]) &&
      JSON.stringify(history.entries) === JSON.stringify([
        ['proposal-decision', '修改建议 · 接受', '没有说明原因'],
        ['proposal-decision', '修改建议 · 拒绝', '原因：证据不足'],
        ['analysis-feedback', '分析反馈 · 人物与名称 · 准确', '没有说明原因'],
        ['analysis-feedback', '分析反馈 · 全书梗概 · 不完整', `原因：${SYNOPSIS_REASON}`],
      ]) && JSON.stringify(history.filters.origin) === JSON.stringify(['', ['全部', '修改建议', '分析反馈', '审阅']]) &&
      JSON.stringify(history.filters.author) === JSON.stringify(['', ['全部']]), 'feedback-history-words', history);
    await choose(renderer, '#feedback-filter-origin', 'analysis-feedback', 'feedback-filter-origin');
    const analysisOnly = await readHistory(renderer, (page) => page.entries.length === 2, 'feedback-filter-origin-read');
    requireJourney(analysisOnly.entries.every(([origin]) => origin === 'analysis-feedback') && analysisOnly.focus === 'feedback-filter-origin', 'feedback-filter-origin-words', analysisOnly);
    await choose(renderer, '#feedback-filter-origin', '', 'feedback-filter-origin-all');
    await readHistory(renderer, (page) => page.entries.length === 4, 'feedback-filter-origin-cleared');

    at('feedback-history-grouping');
    await choose(renderer, '#feedback-group-by', 'origin', 'history-group-origin');
    const byOrigin = await readHistory(renderer, (page) => page.grouping === 'origin', 'history-group-origin-ready');
    requireJourney(JSON.stringify(byOrigin.groups) === JSON.stringify([['修改建议 · 2 条', 2], ['分析反馈 · 2 条', 2]]) &&
      byOrigin.entryBooks.every((line) => line === `《${THIRD.title}》 · 作者与责编：尚未填写`) && byOrigin.focus === 'feedback-group-by',
      'history-group-origin-words');
    await choose(renderer, '#feedback-group-by', 'dimension', 'history-group-dimension');
    const byDimension = await readHistory(renderer, (page) => page.grouping === 'dimension', 'history-group-dimension-ready');
    requireJourney(JSON.stringify(byDimension.groups) === JSON.stringify([['未分类 · 2 条', 2], ['人物与名称 · 1 条', 1], ['全书梗概 · 1 条', 1]]) &&
      byDimension.entries.length === 4 && byDimension.focus === 'feedback-group-by', 'history-group-dimension-words');
    await choose(renderer, '#feedback-group-by', 'time', 'history-group-time');
    const byTime = await readHistory(renderer, (page) => page.grouping === 'time', 'history-group-time-ready');
    requireJourney(byTime.groups.every(([heading]) => /^\d{4}-\d{2}-\d{2} · \d+ 条$/u.test(heading)) &&
      byTime.groups.reduce((total, [, count]) => total + count, 0) === 4 && byTime.focus === 'feedback-group-by', 'history-group-time-words');
    await choose(renderer, '#feedback-group-by', 'book', 'history-group-book');
    await readHistory(renderer, (page) => page.grouping === 'book' && JSON.stringify(page.books) === JSON.stringify(history.books), 'history-group-book-ready');

    at('feedback-history-time-dimension');
    // Only calendar bounds leave this expression; no feedback text or manuscript payload is returned.
    const historyDays = await renderer.evaluate(`(async () => {
      const projection = await window.ai7.inspectFeedbackHistory();
      const day = (date) => String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      const dates = projection.entries.map((entry) => new Date(entry.recordedAt)).sort((a, b) => a - b);
      const first = dates[0], last = dates.at(-1);
      const before = new Date(first), after = new Date(last);
      before.setDate(before.getDate() - 1); after.setDate(after.getDate() + 1);
      return { first: day(first), last: day(last), before: day(before), after: day(after) };
    })()`);
    await changeHistoryInput(renderer, 'from', historyDays.first, 'history-date-from');
    await readHistory(renderer, (page) => page.inputs.from === historyDays.first && page.entries.length === 4, 'history-date-from-ready');
    await changeHistoryInput(renderer, 'to', historyDays.last, 'history-date-to');
    await readHistory(renderer, (page) => page.inputs.to === historyDays.last && page.entries.length === 4 && page.focus === 'feedback-filter-to', 'history-date-inclusive');
    await changeHistoryInput(renderer, 'from', historyDays.after, 'history-date-invalid');
    await waitFor(renderer, `${status} === '请填写有效日期，截止日期不能早于起始日期。'`, 'history-date-invalid-said');
    await readHistory(renderer, (page) => page.inputs.from === historyDays.first && page.inputs.to === historyDays.last &&
      page.entries.length === 4 && page.focus === 'feedback-filter-from', 'history-date-invalid-preserved');
    await changeHistoryInput(renderer, 'from', '', 'history-date-clear-from');
    await readHistory(renderer, (page) => page.inputs.from === '' && page.entries.length === 4, 'history-date-clear-from-ready');
    await changeHistoryInput(renderer, 'to', historyDays.before, 'history-date-before');
    await readHistory(renderer, (page) => page.entries.length === 0 && page.none === '没有符合的反馈记录。' && page.focus === 'feedback-filter-to', 'history-date-before-empty');
    await changeHistoryInput(renderer, 'to', '', 'history-date-clear-to');
    await readHistory(renderer, (page) => page.inputs.to === '' && page.entries.length === 4, 'history-date-clear-to-ready');
    await changeHistoryInput(renderer, 'from', historyDays.after, 'history-date-after');
    await readHistory(renderer, (page) => page.entries.length === 0 && page.focus === 'feedback-filter-from', 'history-date-after-empty');
    await changeHistoryInput(renderer, 'from', '', 'history-date-reset');
    await readHistory(renderer, (page) => page.entries.length === 4 && page.inputs.from === '', 'history-date-reset-ready');
    await changeHistoryInput(renderer, 'dimension', '人物与名称', 'history-dimension-entity');
    await readHistory(renderer, (page) => page.entries.length === 1 && page.entries[0][1] === '分析反馈 · 人物与名称 · 准确' &&
      page.inputs.dimension === '人物与名称' && page.focus === 'feedback-filter-dimension', 'history-dimension-entity-ready');
    await changeHistoryInput(renderer, 'dimension', '', 'history-dimension-clear');
    await readHistory(renderer, (page) => page.entries.length === 4 && page.inputs.dimension === '', 'history-dimension-clear-ready');
    await toggleHistoryUnclassified(renderer, 'history-unclassified');
    await readHistory(renderer, (page) => page.unclassified && page.dimensionDisabled && page.entries.length === 2 &&
      page.entries.every((entry) => entry[0] === 'proposal-decision') && page.focus === 'feedback-filter-unclassified', 'history-unclassified-ready');
    await toggleHistoryUnclassified(renderer, 'history-unclassified-clear');
    await readHistory(renderer, (page) => !page.unclassified && !page.dimensionDisabled && page.entries.length === 4, 'history-unclassified-clear-ready');
    await choose(renderer, '#feedback-filter-signal', '拒绝', 'history-signal-rejected');
    await readHistory(renderer, (page) => page.entries.length === 1 && page.entries[0][1].endsWith(' · 拒绝') && page.focus === 'feedback-filter-signal', 'history-signal-rejected-ready');
    await choose(renderer, '#feedback-filter-signal', '不准确', 'history-signal-empty');
    await readHistory(renderer, (page) => page.entries.length === 0 && page.focus === 'feedback-filter-signal', 'history-signal-empty-ready');
    await choose(renderer, '#feedback-filter-signal', '', 'history-signal-clear');
    await readHistory(renderer, (page) => page.entries.length === 4, 'history-signal-clear-ready');

    at('feedback-history-attribution');
    // The Book's 作者 and 责编, set on its 工作概览, attribute its feedback (FDBK-013): 作者 冯五 keeps all four, 责编 郑三 with it
    // too, and with 来源 审阅 — the Book gave none — nothing is left, and the page says so.
    await click(renderer, '返回', 'attribution-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'attribution-landing');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(thirdId)}]`, 'attribution-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(thirdId)}]')`, 'attribution-manuscript', 120_000);
    await click(renderer, '返回图书工作概览', 'attribution-overview');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '0'`, 'attribution-people');
    await clickSelector(renderer, `${peopleSection} [data-people-action="edit"]`, 'attribution-edit');
    await fill(renderer, `${peopleSection} input[data-people-field="authors"]`, THIRD_PEOPLE.authors, 'attribution-authors');
    await fill(renderer, `${peopleSection} input[data-people-field="editors"]`, THIRD_PEOPLE.editors, 'attribution-editors');
    await clickSelector(renderer, `${peopleSection} [data-people-action="save"]`, 'attribution-save');
    await waitFor(renderer, `${status} === '人员已保存' && document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '1'`, 'attribution-saved');
    await click(renderer, '返回图书列表', 'attribution-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'attribution-landing-again');
    await click(renderer, '质量与学习', 'attribution-quality');
    const attributed = await readHistory(renderer, (page) => page.books[0]?.[1] === `作者：${THIRD_PEOPLE.authors} · 责编：${THIRD_PEOPLE.editors}`, 'attribution-history');
    requireJourney(JSON.stringify(attributed.filters.author) === JSON.stringify(['', ['全部', THIRD_PEOPLE.authors]]) &&
      JSON.stringify(attributed.filters.editor) === JSON.stringify(['', ['全部', THIRD_PEOPLE.editors]]), 'attribution-filters', attributed.filters);
    await choose(renderer, '#feedback-filter-author', THIRD_PEOPLE.authors, 'attribution-author');
    await readHistory(renderer, (page) => page.filters.author?.[0] === THIRD_PEOPLE.authors && !page.loading, 'attribution-author-done');
    await choose(renderer, '#feedback-filter-editor', THIRD_PEOPLE.editors, 'attribution-editor');
    await readHistory(renderer, (page) => page.entries.length === 4 && page.filters.author?.[0] === THIRD_PEOPLE.authors && page.filters.editor?.[0] === THIRD_PEOPLE.editors, 'attribution-both');
    await choose(renderer, '#feedback-filter-origin', 'review-disposition', 'attribution-review');
    const noneLeft = await readHistory(renderer, (page) => page.entries.length === 0, 'attribution-none');
    requireJourney(noneLeft.none === '没有符合的反馈记录。' && noneLeft.books.length === 0, 'attribution-none-words', noneLeft);

    // A later 责编 takes nothing from the one before (FDBK-013, Issue #61 review): all four came before any people were saved,
    // so they stay with the first — 郑三 is still the 责编 offered and keeps all four, and each entry names whose it is.
    await click(renderer, '返回', 'later-back');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'later-landing');
    await clickSelector(renderer, `[data-screen="landing"] button[data-book-id=${JSON.stringify(thirdId)}]`, 'later-book');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(thirdId)}]')`, 'later-manuscript', 120_000);
    await click(renderer, '返回图书工作概览', 'later-overview');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '1'`, 'later-people');
    await clickSelector(renderer, `${peopleSection} [data-people-action="edit"]`, 'later-edit');
    await fill(renderer, `${peopleSection} input[data-people-field="editors"]`, THIRD_PEOPLE.laterEditors, 'later-editors');
    await clickSelector(renderer, `${peopleSection} [data-people-action="save"]`, 'later-save');
    await waitFor(renderer, `${status} === '人员已保存' && document.querySelector(${JSON.stringify(peopleSection)})?.dataset.peopleVersion === '2'`, 'later-saved');
    await click(renderer, '返回图书列表', 'later-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'later-landing-again');
    await click(renderer, '质量与学习', 'later-quality');
    const later = await readHistory(renderer, (page) => page.books[0]?.[1] === `作者：${THIRD_PEOPLE.authors} · 责编：${THIRD_PEOPLE.laterEditors}`, 'later-history');
    const firstPeople = `当时的人员 · 作者：${THIRD_PEOPLE.authors} · 责编：${THIRD_PEOPLE.editors}`;
    requireJourney(JSON.stringify(later.filters.editor) === JSON.stringify(['', ['全部', THIRD_PEOPLE.editors]]) &&
      later.people.length === 4 && later.people.every((line) => line === firstPeople), 'later-attribution', { filters: later.filters, people: later.people });
    await choose(renderer, '#feedback-filter-editor', THIRD_PEOPLE.editors, 'later-editor');
    await readHistory(renderer, (page) => page.entries.length === 4 && page.filters.editor?.[0] === THIRD_PEOPLE.editors, 'later-editor-keeps');

    at('feedback-history-open');
    // Each entry opens its exact record: the rejection, the manuscript with its 修改建议's card and the reason as it stands; the
    // entity's judgment, ②A on the revision it judged — the current one — on 人物与名称, not the tab ②A opens at, with the
    // judged item in view and focused (Issue #61 review).
    await choose(renderer, '#feedback-filter-origin', '', 'open-origin-all');
    await readHistory(renderer, (page) => page.entries.length === 4, 'open-history');
    await clickSelector(renderer, historyEntry('[data-feedback-origin="proposal-decision"][data-reason-state="given"]'), 'open-rejection');
    await waitFor(renderer, `(document.querySelector('.editorial-mark-layer [data-mark-card] [data-mark-reason]')?.textContent ?? '').startsWith('你的原因：证据不足')`, 'open-rejection-card', 120_000);
    // After the handoff, the current reason belongs to the editor who revised it; the other three entries stay put.
    await assertRenderer(renderer, MARK_HELPERS, 'history-mark-helpers-after-restart');
    await assertRenderer(renderer, `window.__j11.act('reason-revise')`, 'history-reason-revise');
    await readDecision(renderer, (card) => card.prompt?.mode === 'revise', 'history-reason-revising');
    await assertRenderer(renderer, `window.__j11.act('reason-own')`, 'history-reason-own');
    await waitFor(renderer, `window.__j11.card()?.querySelector('[data-mark-form="decision-reason"] [data-mark-field="reason"]') !== null`, 'history-reason-form');
    await assertRenderer(renderer, `window.__j11.write('reason', '交接后的新说明') && window.__j11.act('submit')`, 'history-reason-submit');
    await waitFor(renderer, `${status} === '已改好原因；原来的原因仍留在记录里。'`, 'history-reason-saved');
    await pressEscape(renderer);
    await click(renderer, '返回图书工作概览', 'open-overview');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(peopleSection)}) !== null`, 'open-overview-shown');
    await click(renderer, '返回图书列表', 'open-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'open-landing');
    await click(renderer, '质量与学习', 'open-quality');
    const revisedHistory = await readHistory(renderer, (page) => page.entries.length === 4, 'open-history-again');
    requireJourney(revisedHistory.entries[0]?.[2] === '原因：交接后的新说明' && revisedHistory.people.filter((line) => line !== null).length === 3 &&
      revisedHistory.people.every((line) => line === null || line === firstPeople), 'history-revised-attribution');
    await choose(renderer, '#feedback-filter-editor', THIRD_PEOPLE.laterEditors, 'history-new-editor');
    await readHistory(renderer, (page) => page.entries.length === 1 && page.entries[0]?.[2] === '原因：交接后的新说明', 'history-new-editor-entry');
    await choose(renderer, '#feedback-filter-editor', '', 'history-clear-new-editor');
    await readHistory(renderer, (page) => page.entries.length === 4, 'history-clear-new-editor-done');
    await choose(renderer, '#feedback-filter-editor', THIRD_PEOPLE.editors, 'history-old-editor');
    await readHistory(renderer, (page) => page.entries.length === 3 && page.entries.every((entry) => entry[2] !== '原因：交接后的新说明'), 'history-old-editor-entries');
    await choose(renderer, '#feedback-filter-editor', '', 'history-editor-all');
    await readHistory(renderer, (page) => page.entries.length === 4, 'history-all-again');
    await clickSelector(renderer, historyEntry('[data-entry-id$="/entities/0"]'), 'open-entity');
    await waitFor(renderer, `(() => {
      const item = document.querySelector('[data-screen="book-analysis"] [data-analysis-item-key="entities/0"]');
      const card = document.querySelector('.baseline-analysis-card');
      return item instanceof HTMLElement && item.dataset.analysisFeedbackJudgment === 'accurate' && card instanceof HTMLElement && card.dataset.analysisTab === 'entities' &&
        item.closest('[data-analysis-panel]')?.hidden === false && item.getClientRects().length > 0 && document.activeElement === item;
    })()`, 'open-entity-in-view', 60_000);
    await assertRenderer(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.inspectedRevisionId === undefined`, 'open-entity-current');

    at('feedback-history-pages');
    await click(renderer, '打开稿件', 'history-pages-manuscript');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(thirdId)}]')`, 'history-pages-editor', 120_000);
    // Create real feedback through the renderer boundary; only the closed success result leaves the renderer.
    const historySeeded = await renderer.evaluate(`(async () => {
      const history = await window.ai7.inspectFeedbackHistory();
      const target = history.entries.find((entry) => entry.target.kind === 'mark').target;
      const view = await window.ai7.getManuscriptWindow({ manuscriptId: target.manuscriptId, branchId: target.branchId, cursor: null });
      const block = view.blocks.find((candidate) => candidate.kind === 'paragraph' && candidate.text.length > 0);
      const selected = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(block.text)[Symbol.iterator]().next().value.segment;
      const binding = { manuscriptId: target.manuscriptId, branchId: target.branchId, windowStartBlockId: view.blocks[0].blockId };
      for (let index = 0; index < 305; index += 1) {
        const mark = await window.ai7.createEditorialMark({ ...binding, clientMarkId: crypto.randomUUID(),
          baseRevisionId: view.revisionId, expectedJournalSequence: view.journalSequence, blockId: block.blockId,
          baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 1, selectedText: selected,
          kind: 'change-suggestion', highlightColor: null, body: '', proposedText: '分页建议' + index, rationale: '分页检查' });
        await window.ai7.recordChangeSuggestionDecision({ ...binding, markId: mark.markId, clientDecisionId: crypto.randomUUID(),
          disposition: 'rejected', editedText: null, reason: null });
      }
      return true;
    })()`);
    requireJourney(historySeeded === true, 'history-pages-seeded');
    await click(renderer, '返回图书工作概览', 'history-pages-overview');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(peopleSection)}) !== null`, 'history-pages-overview-ready');
    await click(renderer, '返回图书列表', 'history-pages-library');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'history-pages-landing');
    await click(renderer, '质量与学习', 'history-pages-quality');
    await readHistory(renderer, (page) => page.entries.length === 300 && page.entries.every((entry) => entry[0] === 'proposal-decision'), 'history-pages-first');
    // Origin filtering happens before the page bound, so old analysis is reachable immediately.
    await choose(renderer, '#feedback-filter-origin', 'analysis-feedback', 'history-pages-analysis');
    await readHistory(renderer, (page) => page.entries.length === 2 && page.entries.every((entry) => entry[0] === 'analysis-feedback'), 'history-pages-analysis-found');
    await choose(renderer, '#feedback-filter-origin', '', 'history-pages-all');
    await readHistory(renderer, (page) => page.entries.length === 300, 'history-pages-all-ready');
    at('feedback-history-filtered-pages');
    // A signal whose only entry is older than the unfiltered 300-entry page remains reachable.
    await choose(renderer, '#feedback-filter-signal', '准确', 'history-offpage-signal');
    await readHistory(renderer, (page) => page.entries.length === 1 && page.entries[0][1] === '分析反馈 · 人物与名称 · 准确' &&
      !page.next && !page.reset && page.focus === 'feedback-filter-signal', 'history-offpage-signal-found');
    await choose(renderer, '#feedback-filter-signal', '', 'history-offpage-signal-clear');
    await readHistory(renderer, (page) => page.entries.length === 300 && page.next, 'history-offpage-signal-cleared');
    // The first page has no classified feedback; typing its exact dimension must still reach the older analysis.
    await assertRenderer(renderer, `!Array.from(document.querySelectorAll('#feedback-dimensions option')).some((option) => option.value === '人物与名称')`, 'history-offpage-dimension-absent');
    await changeHistoryInput(renderer, 'dimension', '人物与名称', 'history-offpage-dimension');
    await readHistory(renderer, (page) => page.entries.length === 1 && page.entries[0][1] === '分析反馈 · 人物与名称 · 准确' &&
      !page.next && !page.reset && page.focus === 'feedback-filter-dimension', 'history-offpage-dimension-found');
    await changeHistoryInput(renderer, 'dimension', '', 'history-offpage-dimension-clear');
    await readHistory(renderer, (page) => page.entries.length === 300 && page.inputs.dimension === '' && page.next, 'history-offpage-dimension-cleared');
    await toggleHistoryUnclassified(renderer, 'history-unclassified-pages');
    await readHistory(renderer, (page) => page.entries.length === 300 && page.unclassified && page.next, 'history-unclassified-pages-ready');
    await clickSelector(renderer, '[data-feedback-action="next"]', 'history-unclassified-next');
    await readHistory(renderer, (page) => page.entries.length === 7 && page.entries.every((entry) => entry[0] === 'proposal-decision') &&
      page.unclassified && page.reset && !page.next && page.focus === 'reset', 'history-unclassified-older');
    await toggleHistoryUnclassified(renderer, 'history-filter-resets-page');
    await readHistory(renderer, (page) => page.entries.length === 300 && !page.unclassified && page.next && !page.reset &&
      page.focus === 'feedback-filter-unclassified', 'history-filter-reset-ready');
    at('feedback-history-pages');
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await clickSelector(renderer, '[data-feedback-action="next"]', 'history-pages-next');
      await readHistory(renderer, (page) => page.entries.length === 9 && page.focus === 'reset', 'history-pages-older');
      await clickSelector(renderer, '[data-feedback-action="reset"]', 'history-pages-reset');
      await readHistory(renderer, (page) => page.entries.length === 300 && page.focus === 'next', 'history-pages-reset-ready');
    }

    at('feedback-source-windows');
    // Bind the current workbench to the source Book, then request an exact feedback item from another window.
    await clickSelector(renderer, '.feedback-entry [data-feedback-action="open"]', 'history-window-mark');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(thirdId)}]') && document.querySelector('.editorial-mark-card')`, 'history-window-mark-ready', 120_000);
    const otherOpened = await renderer.evaluate(`window.ai7.openBookWorkbench({ kind: 'book', bookId: ${JSON.stringify(firstId)} }).then((opened) => opened.target === 'new-window')`);
    requireJourney(otherOpened === true, 'history-other-window');
    const otherRenderer = await attachRenderer(browser, renderer.targetId);
    await waitFor(otherRenderer, `document.querySelector('[data-screen="book-overview"]')`, 'history-other-ready', 120_000);
    await click(otherRenderer, '返回图书列表', 'history-other-books');
    await waitFor(otherRenderer, `document.querySelector('[data-screen="landing"]')`, 'history-other-landing');
    await click(otherRenderer, '质量与学习', 'history-other-quality');
    await readHistory(otherRenderer, (page) => page.entries.length === 300, 'history-other-page');
    await choose(otherRenderer, '#feedback-filter-origin', 'analysis-feedback', 'history-other-analysis');
    await readHistory(otherRenderer, (page) => page.entries.length === 2, 'history-other-analysis-ready');
    await clickSelector(otherRenderer, historyEntry('[data-entry-id$="/entities/0"]'), 'history-other-open-entity');
    await waitFor(renderer, `(() => {
      const item = document.querySelector('[data-screen="book-analysis"] [data-analysis-item-key="entities/0"]');
      const card = document.querySelector('.baseline-analysis-card');
      return item instanceof HTMLElement && item.dataset.analysisFeedbackJudgment === 'accurate' &&
        card?.dataset.analysisTab === 'entities' && item.getClientRects().length > 0 && document.activeElement === item;
    })()`, 'history-existing-window-exact', 60_000);
    await waitFor(otherRenderer, `document.querySelector('#feedback-filter-origin')?.value === 'analysis-feedback' &&
      document.querySelector('#feedback-filter-origin')?.disabled === false &&
      document.activeElement === document.querySelector('[data-entry-id$="/entities/0"] [data-feedback-action="open"]')`, 'history-requester-focus-restored');

    await close();
    cancellation.throwIfRequested();
    await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'learning-source-restart-ready');
    await click(renderer, '质量与学习', 'learning-source-quality');
    await clickSelector(renderer, '#quality-tab-learning', 'learning-source-tab');
    await readLearning(renderer, (page) => page.books.length === 1, 'learning-source-page');
    at('learning-source-records');
    await clickSelector(renderer, `${learningRow('proposal-decision')} [data-learning-action="open"]`, 'learning-source-proposal-card');
    await readLearning(renderer, (page) => page.card?.material === 'proposal-decision', 'learning-source-proposal-ready');
    await clickSelector(renderer, '[data-learning-action="source"]', 'learning-source-proposal');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(thirdId)}]') && document.querySelector('.editorial-mark-card')`, 'learning-source-mark-open', 120_000);
    await assertRenderer(renderer, `document.querySelector('.editorial-mark-card')?.textContent.includes(${JSON.stringify('交接后的新说明')}) === true`, 'learning-source-mark-reason');
    await click(renderer, '返回图书工作概览', 'learning-source-overview');
    await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'learning-source-overview-ready');
    await click(renderer, '返回图书列表', 'learning-source-books');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'learning-source-landing');
    await click(renderer, '质量与学习', 'learning-source-learning');
    await clickSelector(renderer, '#quality-tab-learning', 'learning-source-learning-tab');
    await readLearning(renderer, (page) => page.books.length === 1, 'learning-source-page');
    await clickSelector(renderer, `${learningRow('analysis-feedback')} [data-learning-action="open"]`, 'learning-source-analysis-card');
    await readLearning(renderer, (page) => page.card?.material === 'analysis-feedback', 'learning-source-analysis-ready');
    await clickSelector(renderer, '[data-learning-action="source"]', 'learning-source-analysis');
    await waitFor(renderer, `(() => {
      const card = document.querySelector('.baseline-analysis-card');
      const item = document.querySelector('[data-analysis-item-key="synopsis"]');
      return card?.dataset.resultRevisionId === ${JSON.stringify(revisionId)} && card.dataset.analysisTab === 'synopsis' &&
        item instanceof HTMLElement && item.getClientRects().length > 0 && document.activeElement === item;
    })()`, 'learning-source-analysis-exact', 60_000);

    // A separate workbench opens the same exact source in the window that already owns its Book.
    const learningOtherOpened = await renderer.evaluate(`window.ai7.openBookWorkbench({ kind: 'book', bookId: ${JSON.stringify(firstId)} }).then((opened) => opened.target === 'new-window')`);
    requireJourney(learningOtherOpened === true, 'learning-source-other-window');
    const learningOtherRenderer = await attachRenderer(browser, renderer.targetId);
    await waitFor(learningOtherRenderer, `document.querySelector('[data-screen="book-overview"]')`, 'learning-source-other-ready', 120_000);
    await click(learningOtherRenderer, '返回图书列表', 'learning-source-other-books');
    await waitFor(learningOtherRenderer, `document.querySelector('[data-screen="landing"]')`, 'learning-source-other-landing');
    await click(learningOtherRenderer, '质量与学习', 'learning-source-other-learning');
    await clickSelector(learningOtherRenderer, '#quality-tab-learning', 'learning-source-other-learning-tab');
    await readLearning(learningOtherRenderer, (page) => page.books.length === 1, 'learning-source-other-page');
    await clickSelector(learningOtherRenderer, `${learningRow('proposal-decision')} [data-learning-action="open"]`, 'learning-source-other-card');
    await readLearning(learningOtherRenderer, (page) => page.card?.material === 'proposal-decision', 'learning-source-other-card-ready');
    await tick(learningOtherRenderer, '.learning-choices input[value="house"]', 'learning-source-draft-choice');
    await fill(learningOtherRenderer, '[data-learning-field="note"]', '保留未提交说明', 'learning-source-draft-note');
    await assertRenderer(learningOtherRenderer, `(() => {
      document.querySelector('[data-learning-action="source"]').click();
      return Array.from(document.querySelectorAll('.learning-card input, .learning-card textarea, .learning-card button')).every((control) => control.disabled);
    })()`, 'learning-source-pending-disabled');
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(thirdId)}]') && document.querySelector('.editorial-mark-card')?.textContent.includes('交接后的新说明')`, 'learning-source-existing-window-exact', 120_000);
    await waitFor(learningOtherRenderer, `document.querySelector('.learning-choices input[value="house"]')?.checked === true &&
      document.querySelector('[data-learning-field="note"]')?.value === '保留未提交说明' &&
      document.querySelector('[data-learning-action="record"]')?.disabled === false &&
      document.activeElement === document.querySelector('[data-learning-action="source"]')`, 'learning-source-draft-restored');

    at('learning-material-pages');
    const learningSeeded = await renderer.evaluate(`(async () => {
      const materials = await window.ai7.inspectLearningMaterials({ bookId: ${JSON.stringify(thirdId)}, after: null });
      const target = materials.books[0].materials.find((entry) => entry.target.kind === 'mark').target;
      const view = await window.ai7.getManuscriptWindow({ manuscriptId: target.manuscriptId, branchId: target.branchId, cursor: null });
      const block = view.blocks.find((candidate) => candidate.kind === 'paragraph' && candidate.text.length > 0);
      const selected = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(block.text)[Symbol.iterator]().next().value.segment;
      const binding = { manuscriptId: target.manuscriptId, branchId: target.branchId, windowStartBlockId: view.blocks[0].blockId };
      for (let index = 0; index < 40; index += 1) {
        const mark = await window.ai7.createEditorialMark({ ...binding, clientMarkId: crypto.randomUUID(),
          baseRevisionId: view.revisionId, expectedJournalSequence: view.journalSequence, blockId: block.blockId,
          baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 1, selectedText: selected,
          kind: 'change-suggestion', highlightColor: null, body: '', proposedText: '分页建议' + index, rationale: '分页检查' });
        await window.ai7.recordChangeSuggestionDecision({ ...binding, markId: mark.markId, clientDecisionId: crypto.randomUUID(),
          disposition: 'rejected', editedText: null, reason: '分页原因' + index });
      }
      return true;
    })()`);
    requireJourney(learningSeeded === true, 'learning-pages-seeded');
    await clickSelector(learningOtherRenderer, '[data-learning-action="cancel"]', 'learning-pages-close-draft');
    await click(learningOtherRenderer, '返回', 'learning-pages-back');
    await waitFor(learningOtherRenderer, `document.querySelector('[data-screen="landing"]')`, 'learning-pages-landing');
    await click(learningOtherRenderer, '质量与学习', 'learning-pages-open');
    await clickSelector(learningOtherRenderer, '#quality-tab-learning', 'learning-pages-open-tab');
    await waitFor(learningOtherRenderer, `document.querySelectorAll('.learning-material').length === 40`, 'learning-pages-first');
    await clickSelector(learningOtherRenderer, '[data-learning-action="open"]', 'learning-pages-card');
    await fill(learningOtherRenderer, '[data-learning-field="note"]', '翻页前保留', 'learning-pages-draft');
    await assertRenderer(learningOtherRenderer, `document.querySelector('[data-learning-action="more"]')?.disabled === true && document.querySelector('[data-learning-field="note"]')?.value === '翻页前保留'`, 'learning-pages-open-protected');
    await clickSelector(learningOtherRenderer, '[data-learning-action="cancel"]', 'learning-pages-close');
    for (let pass = 0; pass < 2; pass += 1) {
      await clickSelector(learningOtherRenderer, '[data-learning-action="more"]', 'learning-pages-next');
      await waitFor(learningOtherRenderer, `document.querySelectorAll('.learning-material').length === 2 && document.querySelector('[data-learning-action="more"]') === null && document.querySelector('[data-learning-action="reset"]')?.disabled === false && document.activeElement === document.querySelector('[data-learning-action="open"]')`, 'learning-pages-last');
      await clickSelector(learningOtherRenderer, '[data-learning-action="reset"]', 'learning-pages-reset');
      await waitFor(learningOtherRenderer, `document.querySelectorAll('.learning-material').length === 40 && document.querySelector('[data-learning-action="reset"]') === null && document.querySelector('[data-learning-action="more"]')?.disabled === false && document.activeElement === document.querySelector('[data-learning-action="open"]')`, 'learning-pages-reset-ready');
    }
    at('feedback-pending-submit');
    // Hold an actual follower timer, then the actual feedback response, so a changed analysis answer crosses a pending save.
    await close();
    cancellation.throwIfRequested();
    await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'feedback-pending-restart-ready');
    await openAnalysisOf(renderer, thirdId, 'feedback-pending');
    await waitFor(renderer, `document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'feedback-pending-analysis-ready');
    await clickSelector(renderer, '[data-analysis-tab="history"]', 'feedback-pending-history');
    await click(renderer, '重新分析全书', 'feedback-pending-mode');
    await clickSelector(renderer, '[data-analysis-action="reanalyze-book"]', 'feedback-pending-prepare');
    await waitFor(renderer, `document.querySelector('#task-drawer [data-task-drawer-control="start"]')?.disabled===false`, 'feedback-pending-plan-ready');
    // ②A arms its 250 ms follower only when a draw finds the Run under way. Unheld, the J-04 adapter's Run can end before
    // the card's first read after 开始任务 answers on a slow runner, leaving no follower to hold (#641). J-10's unit hold
    // keeps the Run's first unit in flight until the follower is held; nothing else in the stage waits on the hold.
    await writeFile(unitHoldPath, '0', 'utf8');
    await assertRenderer(renderer, `(() => {
      const original=window.setTimeout;
      const held={original,timers:[],release:null}; window.__j11HeldFeedbackFollow=held;
      window.setTimeout=function(callback,delay,...args) {
        if(delay===250 && typeof callback==='function') {
          const timer=original(()=>{},60000);
          held.timers.push(()=>{clearTimeout(timer);callback(...args);});
          held.release=()=>{window.setTimeout=original;for(const fire of held.timers.splice(0))fire();};
          return timer;
        }
        return original(callback,delay,...args);
      };
      document.querySelector('#task-drawer [data-task-drawer-control="start"]').click();
      return true;
    })()`, 'feedback-pending-hold-follow');
    await waitFor(renderer, `typeof window.__j11HeldFeedbackFollow?.release==='function' && ['admitted','executing'].includes(document.querySelector('.baseline-analysis-card')?.dataset.analysisState)`, 'feedback-pending-follow-held', 60_000);
    await rm(unitHoldPath, { force: true });
    await clickSelector(renderer, '#task-drawer [data-task-drawer-control="close"]', 'feedback-pending-close-plan');
    await clickSelector(renderer, '#analysis-tab-synopsis', 'feedback-pending-synopsis');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(`${feedbackItem('synopsis')} [data-analysis-action="open-feedback"]`)})?.disabled===false`, 'feedback-pending-card-ready');
    await clickSelector(renderer, `${feedbackItem('synopsis')} [data-analysis-action="open-feedback"]`, 'feedback-pending-card');
    await tick(renderer, `${feedbackItem('synopsis')} .analysis-feedback-judgments input[value="accurate"]`, 'feedback-pending-accurate');
    await assertRenderer(renderer, `(() => {
      const original=Promise.prototype.then;
      const held={release:null,node:null,outcome:null}; window.__j11HeldFeedbackSave=held;
      try {
        Promise.prototype.then=function(success,failure) {
          Promise.prototype.then=original;
          return original.call(this,
            (value)=>new Promise(resolve=>{held.outcome='success';held.release=()=>resolve(success(value));}),
            (error)=>new Promise((_resolve,reject)=>{held.outcome='failure';held.release=()=>reject(error);}));
        };
        document.querySelector(${JSON.stringify(`${feedbackItem('synopsis')} [data-analysis-action="record-feedback"]`)}).click();
        held.node=document.querySelector('.analysis-feedback-card');
      } finally { Promise.prototype.then=original; }
      return held.node!==null && [...held.node.querySelectorAll('input,textarea,button')].every(control=>control.disabled);
    })()`, 'feedback-pending-hold-save');
    await waitFor(renderer, `typeof window.__j11HeldFeedbackSave?.release==='function'`, 'feedback-pending-save-held');
    await assertRenderer(renderer, `window.__j11HeldFeedbackSave.outcome==='success'`, 'feedback-pending-save-accepted');
    await waitFor(renderer, `window.ai7.inspectBaselineAnalysis().then(projection=>projection.state==='settled')`, 'feedback-pending-run-settled');
    await assertRenderer(renderer, `(() => { window.__j11HeldFeedbackFollow.release(); return true; })()`, 'feedback-pending-release-follow');
    // A real changed follower read has time to settle. Pending work, rather than focus, must retain this exact disabled card.
    await new Promise(resolveWait=>setTimeout(resolveWait,750));
    await assertRenderer(renderer, `document.querySelector('.analysis-feedback-card')===window.__j11HeldFeedbackSave.node && [...window.__j11HeldFeedbackSave.node.querySelectorAll('input,textarea,button')].every(control=>control.disabled)`, 'feedback-pending-keeps-card');
    await assertRenderer(renderer, `(() => {
      window.__j11HeldFeedbackSave.release();
      window.setTimeout=window.__j11HeldFeedbackFollow.original;
      delete window.__j11HeldFeedbackSave; delete window.__j11HeldFeedbackFollow;
      return true;
    })()`, 'feedback-pending-release-save');
    await waitFor(renderer, `document.querySelector('.analysis-feedback-card')===null && document.querySelector('.baseline-analysis-card')?.dataset.analysisState==='settled'`, 'feedback-pending-finished');

    // ---- 质量与学习 › 学习回溯 (Issue #62, plan slice S27a; LAUD-001 to LAUD-012) ----------------------------------------------
    at('learning-audit-list');
    // Four of the paging stage's rejections are included for learning as their Review Cards would record it: three for the
    // Book, one for the house. 学习回溯 lists the Book's material grouped under it, each row with where it stands and that no
    // Task used it; the filters that would need memory or Task use say why they wait.
    const auditKeys = await renderer.evaluate(`(async () => {
      const keys = [];
      for (const index of [0, 1, 2, 3]) {
        const page = await window.ai7.inspectLearningAudit({ bookId: ${JSON.stringify(thirdId)}, kind: 'proposal-decision', query: '分页原因' + index });
        const found = page.books[0]?.materials.find((material) => material.excerpt.at(-1) === '你的原因：分页原因' + index);
        if (found === undefined || found.standing !== 'pending') return null;
        await window.ai7.decideLearningMaterial({ bookId: ${JSON.stringify(thirdId)}, materialKey: found.materialKey, materialDigest: found.digest,
          expectedDecisions: found.decisions, choice: index === 3 ? 'house' : 'book', note: null });
        keys.push(found.materialKey);
      }
      return keys;
    })()`);
    requireJourney(Array.isArray(auditKeys) && auditKeys.length === 4, 'learning-audit-seeded', auditKeys);
    const [auditFirst, auditSecond, auditThird, auditHouse] = auditKeys;
    await close();
    cancellation.throwIfRequested();
    await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'learning-audit-ready');
    await click(renderer, '质量与学习', 'learning-audit-quality');
    await clickSelector(renderer, '#quality-tab-audit', 'learning-audit-tab');
    const auditAll = await readAudit(renderer, (page) => page.view === 'list' && page.rows.length === 40, 'learning-audit-all');
    requireJourney(auditAll.note === '学习回溯只是记录：每条学习材料从哪里来、准入怎样决定、后来影响了什么。停止今后使用不会删除任何历史，这里也不授予任何权限。' &&
      auditAll.later === AUDIT_LATER && auditAll.books.length === 1 && auditAll.books[0].startsWith(`《${THIRD.title}》 · `) &&
      auditAll.rows.every(([, , , use]) => use === '尚未被任何任务使用') &&
      auditAll.rows.every(([, standing, , , selectable]) => selectable === (standing === 'book' || standing === 'house')), 'learning-audit-all-words', auditAll);
    await choose(renderer, '#learning-audit-filter-standing', 'book', 'learning-audit-filter-book');
    const auditBook = await readAudit(renderer, (page) => page.rows.length === 3 && page.rows.every(([, standing]) => standing === 'book'), 'learning-audit-book-only');
    requireJourney(auditBook.books[0] === `《${THIRD.title}》 · 3 条` && JSON.stringify(auditBook.rows.map(([key, , pill]) => [key, pill])) ===
      JSON.stringify([[auditFirst, '仅纳入当前图书'], [auditSecond, '仅纳入当前图书'], [auditThird, '仅纳入当前图书']]) &&
      JSON.stringify(auditBook.focus) === JSON.stringify([null, 'SELECT', false]), 'learning-audit-book-words', auditBook);
    await choose(renderer, '#learning-audit-filter-standing', '', 'learning-audit-filter-all');
    await readAudit(renderer, (page) => page.rows.length === 40, 'learning-audit-filter-cleared');
    await fill(renderer, '#learning-audit-query', '分页原因3', 'learning-audit-query');
    await choose(renderer, '#learning-audit-filter-standing', 'house', 'learning-audit-filter-house');
    const auditSearched = await readAudit(renderer, (page) => page.rows.length === 1, 'learning-audit-searched');
    requireJourney(auditSearched.rows[0][0] === auditHouse && auditSearched.rows[0][2] === '纳入出版社经验', 'learning-audit-searched-words', auditSearched);
    await choose(renderer, '#learning-audit-filter-kind', 'review-disposition', 'learning-audit-filter-kind');
    const auditNone = await readAudit(renderer, (page) => page.rows.length === 0 && page.none !== null, 'learning-audit-none');
    requireJourney(auditNone.none === '没有符合的学习材料。', 'learning-audit-none-words', auditNone);

    at('learning-audit-lineage');
    // 查看来源链… opens the explorer in place at its heading: 学习材料 → 准入决定 → 学习信号 → 记忆候选 → 已启用记忆 →
    // 使用过的任务, the one decision standing, and each later stage empty with why; ids stay under a closed 审计详情.
    await fill(renderer, '#learning-audit-query', '', 'learning-audit-query-cleared');
    await choose(renderer, '#learning-audit-filter-kind', '', 'learning-audit-kind-cleared');
    await readAudit(renderer, (page) => page.rows.length === 1, 'learning-audit-kind-cleared-read');
    await choose(renderer, '#learning-audit-filter-standing', 'book', 'learning-audit-standing-book');
    await readAudit(renderer, (page) => page.rows.length === 3, 'learning-audit-book-again');
    await clickSelector(renderer, `${auditRow(auditFirst)} [data-learning-audit-action="open"]`, 'learning-audit-open');
    const lineageOpened = await readAudit(renderer, (page) => page.lineage?.key === auditFirst, 'learning-audit-lineage-open');
    requireJourney(lineageOpened.lineage.heading === '学习来源链：修改建议 · 拒绝' && lineageOpened.lineage.standing === 'book' &&
      JSON.stringify(lineageOpened.lineage.steps) === JSON.stringify([['material', null, '学习材料'], ['decisions', '1', '准入决定'], ['signals', '0', '学习信号'],
        ['candidates', '0', '记忆候选'], ['memories', '0', '已启用记忆'], ['tasks', '0', '使用过的任务']]) &&
      JSON.stringify(lineageOpened.lineage.decisions) === JSON.stringify([['current', 'learning-eligibility', '仅纳入当前图书', '现在的决定']]) &&
      JSON.stringify(lineageOpened.lineage.empties) === JSON.stringify(['尚未生成', '尚未生成', '尚未生成', '尚未被任何任务使用']) &&
      lineageOpened.lineage.forward === '后来影响了什么' && lineageOpened.lineage.why === AUDIT_WHY_EMPTY &&
      JSON.stringify(lineageOpened.lineage.actions) === JSON.stringify(['stop', 'back']) &&
      JSON.stringify(lineageOpened.lineage.details) === JSON.stringify(['审计详情', false]) &&
      JSON.stringify(lineageOpened.focus) === JSON.stringify([auditFirst, 'H4', false]), 'learning-audit-lineage-words', lineageOpened);

    at('learning-audit-stop-preview');
    // 停止今后使用… first shows the 学习补救影响预览 in its four groups, and records nothing.
    await clickSelector(renderer, '.learning-lineage [data-learning-audit-action="stop"]', 'learning-audit-stop');
    const stopPreview = await readAudit(renderer, (page) => page.preview !== null, 'learning-audit-preview');
    requireJourney(JSON.stringify(stopPreview.preview.groups) === JSON.stringify([
      ['future', '1', '未来使用 · 1', `1 条学习材料今后不再用于学习（原来是仅纳入《${THIRD.title}》）；它们会显示为明确排除。`],
      ['running', '0', '正在运行 · 0', '没有正在运行的任务使用它们：AI7 现在还没有读取学习材料的任务。'],
      ['memory', '0', '候选或已启用记忆 · 0', '没有由它们生成的记忆候选或已启用记忆：AI7 还没有生成这些。'],
      ['completed', '0', '已完成历史 · 0', '没有已完成的任务用过它们，因此没有结果需要标记；它们来自的反馈与改动，以及此前的 1 个准入决定，都原样保留。'],
    ]) && stopPreview.preview.leftOut.length === 0 && stopPreview.preview.confirm === true &&
      JSON.stringify(stopPreview.focus) === JSON.stringify([auditFirst, 'H4', true]), 'learning-audit-preview-words', stopPreview);
    const unrecorded = await renderer.evaluate(`window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey: ${JSON.stringify(auditFirst)} }).then((read) => read.decisions.length)`);
    requireJourney(unrecorded === 1, 'learning-audit-preview-records-nothing', unrecorded);

    at('learning-audit-stop-recorded');
    // 确认停止今后使用 appends one exclusion: the explorer shows it standing over the decision it superseded, which stays.
    await clickSelector(renderer, '.learning-remediation-preview [data-learning-audit-action="confirm"]', 'learning-audit-confirm');
    await waitFor(renderer, `${status} === '已停止今后使用 1 条学习材料。'`, 'learning-audit-recorded-status');
    const stopped = await readAudit(renderer, (page) => page.lineage?.decisions.length === 2 && page.preview === null, 'learning-audit-recorded');
    requireJourney(stopped.lineage.standing === 'excluded' && JSON.stringify(stopped.lineage.decisions) === JSON.stringify([
      ['current', 'learning-audit', '明确排除', '现在的决定 · 在学习回溯中停止今后使用'],
      ['superseded', 'learning-eligibility', '仅纳入当前图书', '已被后来的决定取代'],
    ]) && JSON.stringify(stopped.lineage.actions) === JSON.stringify(['reinclude', 'back']) && stopped.lineage.steps[1][1] === '2', 'learning-audit-recorded-words', stopped);
    const stoppedService = await renderer.evaluate(`window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey: ${JSON.stringify(auditFirst)} })
      .then((read) => [read.standing, read.decisions.map((entry) => [entry.ordinal, entry.choice, entry.superseded, entry.via, entry.audit.supersedes === (read.decisions[0]?.decisionId ?? null) || entry.ordinal === 1])])`);
    requireJourney(JSON.stringify(stoppedService) === JSON.stringify(['excluded', [[1, 'book', true, 'learning-eligibility', true], [2, 'excluded', false, 'learning-audit', true]]]),
      'learning-audit-recorded-service', stoppedService);
    // 返回学习回溯 comes back to the row it left, now read as excluded and so out of the 仅纳入当前图书 filter.
    await clickSelector(renderer, '.learning-lineage [data-learning-audit-action="back"]', 'learning-audit-back');
    const afterStop = await readAudit(renderer, (page) => page.view === 'list' && page.rows.length === 2, 'learning-audit-after-stop');
    requireJourney(JSON.stringify(afterStop.rows.map(([key]) => key)) === JSON.stringify([auditSecond, auditThird]), 'learning-audit-after-stop-words', afterStop);

    at('learning-audit-eligibility-reflects');
    // 学习准入 reads the same exclusion: the material decided, its Review Card stating 明确排除 as the decision that stands.
    await clickSelector(renderer, '#quality-tab-learning', 'learning-audit-to-eligibility');
    await waitFor(renderer, `document.querySelector(${JSON.stringify(`[data-screen="quality-learning"] li.learning-material[data-material-key="${auditFirst}"]`)})?.dataset.learningState === 'decided'`, 'learning-audit-eligibility-row');
    await clickSelector(renderer, `[data-screen="quality-learning"] li.learning-material[data-material-key="${auditFirst}"] [data-learning-action="open"]`, 'learning-audit-eligibility-card');
    const reflected = await readLearning(renderer, (page) => page.card !== null, 'learning-audit-eligibility-read');
    requireJourney((reflected.card.facts.decision ?? '').startsWith('明确排除 · '), 'learning-audit-eligibility-words', reflected.card);
    await pressEscape(renderer);
    await clickSelector(renderer, '#quality-tab-audit', 'learning-audit-back-to-audit');
    await readAudit(renderer, (page) => page.view === 'list' && page.rows.length === 40, 'learning-audit-back-ready');

    at('learning-audit-batch');
    // Two of the Book's included materials selected together; one moves before the preview. The preview names it as
    // changed and leaves it out, and 确认 stops only the other, each outcome its own.
    await choose(renderer, '#learning-audit-filter-standing', 'book', 'learning-audit-batch-filter');
    await readAudit(renderer, (page) => page.rows.length === 2, 'learning-audit-batch-rows');
    await tick(renderer, `${auditRow(auditSecond)} .learning-audit-select`, 'learning-audit-select-second');
    await tick(renderer, `${auditRow(auditThird)} .learning-audit-select`, 'learning-audit-select-third');
    const selected = await readAudit(renderer, (page) => page.batch?.selected === '已选 2 条', 'learning-audit-selected');
    requireJourney(selected.batch.stop === true && selected.batch.mismatch === null, 'learning-audit-selected-words', selected.batch);
    const drifted = await renderer.evaluate(`window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey: ${JSON.stringify(auditThird)} })
      .then((read) => window.ai7.decideLearningMaterial({ bookId: ${JSON.stringify(thirdId)}, materialKey: read.material.materialKey, materialDigest: read.material.digest,
        expectedDecisions: read.material.decisions, choice: 'house', note: null })).then((decided) => decided.decision?.choice ?? null)`);
    requireJourney(drifted === 'house', 'learning-audit-drifted', drifted);
    await clickSelector(renderer, '.learning-audit-batch [data-learning-audit-action="batch-stop"]', 'learning-audit-batch-stop');
    const batchPreview = await readAudit(renderer, (page) => page.preview !== null, 'learning-audit-batch-preview');
    requireJourney(batchPreview.preview.groups[0][1] === '1' &&
      JSON.stringify(batchPreview.preview.leftOut) === JSON.stringify([['changed', '修改建议 · 拒绝：在你选中之后改过，不在本次之列']]) &&
      batchPreview.preview.confirm === true, 'learning-audit-batch-preview-words', batchPreview.preview);
    await clickSelector(renderer, '.learning-remediation-preview [data-learning-audit-action="confirm"]', 'learning-audit-batch-confirm');
    await waitFor(renderer, `${status} === '已停止今后使用 1 条学习材料；另有 1 条未处理。'`, 'learning-audit-batch-status');
    const afterBatch = await readAudit(renderer, (page) => page.view === 'list' && page.rows.length === 0 && page.batch === null, 'learning-audit-batch-done');
    requireJourney(afterBatch.none === '没有符合的学习材料。', 'learning-audit-batch-done-words', afterBatch);
    const batchService = await renderer.evaluate(`Promise.all([${JSON.stringify(auditSecond)}, ${JSON.stringify(auditThird)}].map((materialKey) =>
      window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey }).then((read) => [read.standing, read.decisions.map((entry) => entry.choice).join('>')])))`);
    requireJourney(JSON.stringify(batchService) === JSON.stringify([['excluded', 'book>excluded'], ['house', 'book>house']]), 'learning-audit-batch-service', batchService);

    at('learning-audit-reinclude');
    // An excluded material is re-included with a new decision beside the exclusion, which stays on record.
    await choose(renderer, '#learning-audit-filter-standing', 'excluded', 'learning-audit-filter-excluded');
    await readAudit(renderer, (page) => page.rows.length === 2, 'learning-audit-excluded-rows');
    await clickSelector(renderer, `${auditRow(auditFirst)} [data-learning-audit-action="open"]`, 'learning-audit-reopen');
    await readAudit(renderer, (page) => page.lineage?.key === auditFirst, 'learning-audit-reopened');
    await clickSelector(renderer, '.learning-lineage [data-learning-audit-action="reinclude"]', 'learning-audit-reinclude-open');
    const reincluding = await readAudit(renderer, (page) => page.reinclude !== null, 'learning-audit-reinclude-card');
    requireJourney(JSON.stringify(reincluding.reinclude.choices) === JSON.stringify([['book', false], ['house', false]]) && reincluding.reinclude.record === false &&
      reincluding.reinclude.consequence === null, 'learning-audit-reinclude-card-words', reincluding.reinclude);
    await tick(renderer, '.learning-reinclude input[value="book"]', 'learning-audit-reinclude-book');
    const reincludeChosen = await readAudit(renderer, (page) => page.reinclude?.record === true, 'learning-audit-reinclude-chosen');
    requireJourney(reincludeChosen.reinclude.consequence === `仅纳入当前图书：它只在《${THIRD.title}》里帮 AI7 学习。`, 'learning-audit-reinclude-consequence', reincludeChosen.reinclude);
    await clickSelector(renderer, '.learning-reinclude [data-learning-audit-action="reinclude-record"]', 'learning-audit-reinclude-record');
    await waitFor(renderer, `${status} === '学习准入决定已记录。'`, 'learning-audit-reinclude-status');
    const reincluded = await readAudit(renderer, (page) => page.lineage?.decisions.length === 3 && page.reinclude === null, 'learning-audit-reincluded');
    requireJourney(reincluded.lineage.standing === 'book' && JSON.stringify(reincluded.lineage.decisions.map(([state, , choice]) => [state, choice])) === JSON.stringify([
      ['current', '仅纳入当前图书'], ['superseded', '明确排除'], ['superseded', '仅纳入当前图书'],
    ]) && JSON.stringify(reincluded.lineage.actions) === JSON.stringify(['stop', 'back']), 'learning-audit-reincluded-words', reincluded);

    at('learning-audit-stale-refused');
    // A preview the material moved past is refused: nothing is appended, the explorer reads the chain as it stands, and the
    // refusal says to look again.
    await clickSelector(renderer, '.learning-lineage [data-learning-audit-action="stop"]', 'learning-audit-stale-stop');
    await readAudit(renderer, (page) => page.preview !== null, 'learning-audit-stale-preview');
    const moved = await renderer.evaluate(`window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey: ${JSON.stringify(auditFirst)} })
      .then((read) => window.ai7.decideLearningMaterial({ bookId: ${JSON.stringify(thirdId)}, materialKey: read.material.materialKey, materialDigest: read.material.digest,
        expectedDecisions: read.material.decisions, choice: 'house', note: null })).then((decided) => decided.decisions)`);
    requireJourney(moved === 4, 'learning-audit-stale-moved', moved);
    await clickSelector(renderer, '.learning-remediation-preview [data-learning-audit-action="confirm"]', 'learning-audit-stale-confirm');
    const refused = await readAudit(renderer, (page) => page.lineage?.refusal !== null && page.lineage?.decisions.length === 4, 'learning-audit-stale-read');
    requireJourney(refused.lineage.refusal === AUDIT_STALE && refused.preview === null && refused.lineage.standing === 'house' &&
      refused.lineage.decisions[0][2] === '纳入出版社经验' && JSON.stringify(refused.focus) === JSON.stringify([auditFirst, 'P', false]), 'learning-audit-stale-words', refused);
    const staleService = await renderer.evaluate(`window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey: ${JSON.stringify(auditFirst)} }).then((read) => read.decisions.map((entry) => entry.choice).join('>'))`);
    requireJourney(staleService === 'book>excluded>book>house', 'learning-audit-stale-service', staleService);

    at('learning-audit-restart');
    // A restart keeps the whole chain: 学习回溯 opens to the same lineage, each decision where it was.
    const auditBefore = await renderer.evaluate(`window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey: ${JSON.stringify(auditFirst)} }).then((read) => JSON.stringify(read))`);
    await close();
    cancellation.throwIfRequested();
    await launch();
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'learning-audit-restart-ready');
    await click(renderer, '质量与学习', 'learning-audit-restart-quality');
    await clickSelector(renderer, '#quality-tab-audit', 'learning-audit-restart-tab');
    await readAudit(renderer, (page) => page.view === 'list' && page.rows.length === 40, 'learning-audit-restart-list');
    await clickSelector(renderer, `${auditRow(auditFirst)} [data-learning-audit-action="open"]`, 'learning-audit-restart-open');
    const restarted = await readAudit(renderer, (page) => page.lineage?.key === auditFirst, 'learning-audit-restart-lineage');
    requireJourney(JSON.stringify(restarted.lineage.decisions.map(([state, via, choice]) => [state, via, choice])) === JSON.stringify([
      ['current', 'learning-eligibility', '纳入出版社经验'], ['superseded', 'learning-eligibility', '仅纳入当前图书'],
      ['superseded', 'learning-audit', '明确排除'], ['superseded', 'learning-eligibility', '仅纳入当前图书'],
    ]), 'learning-audit-restart-words', restarted);
    const auditAfter = await renderer.evaluate(`window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey: ${JSON.stringify(auditFirst)} }).then((read) => JSON.stringify(read))`);
    requireJourney(typeof auditBefore === 'string' && auditAfter === auditBefore, 'learning-audit-restart-unmoved');

    at('j14-learning-audit-keyboard');
    // Without a pointer: Escape leaves the explorer for the row it came from; Enter opens it again at its heading; Enter on
    // 停止今后使用… opens the preview at its heading, and Escape closes it with the focus back where it was.
    await pressEscape(renderer);
    await readAudit(renderer, (page) => page.view === 'list' && JSON.stringify(page.focus) === JSON.stringify([auditFirst, 'open', false]), 'learning-audit-keyboard-back');
    await pressEnter(renderer);
    await readAudit(renderer, (page) => page.lineage?.key === auditFirst && JSON.stringify(page.focus) === JSON.stringify([auditFirst, 'H4', false]), 'learning-audit-keyboard-open');
    await assertRenderer(renderer, `(() => { const stop = document.querySelector('.learning-lineage [data-learning-audit-action="stop"]'); if (!(stop instanceof HTMLButtonElement)) return false; stop.focus(); return document.activeElement === stop; })()`, 'learning-audit-keyboard-stop-focused');
    await pressEnter(renderer);
    await readAudit(renderer, (page) => page.preview !== null && JSON.stringify(page.focus) === JSON.stringify([auditFirst, 'H4', true]), 'learning-audit-keyboard-preview');
    await pressEscape(renderer);
    await readAudit(renderer, (page) => page.preview === null && JSON.stringify(page.focus) === JSON.stringify([auditFirst, 'stop', false]), 'learning-audit-keyboard-preview-closed');
    const keyboardService = await renderer.evaluate(`window.ai7.inspectLearningLineage({ bookId: ${JSON.stringify(thirdId)}, materialKey: ${JSON.stringify(auditFirst)} }).then((read) => read.decisions.length)`);
    requireJourney(keyboardService === 4, 'learning-audit-keyboard-records-nothing', keyboardService);

    at('j14-learning-audit-reflow-forced-colors');
    // At 200% the explorer, its steps and an open preview reflow into the width; without colour each keeps its border.
    await clickSelector(renderer, '.learning-lineage [data-learning-audit-action="stop"]', 'learning-audit-reflow-stop');
    await readAudit(renderer, (page) => page.preview !== null, 'learning-audit-reflow-preview');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await waitFor(renderer, `(() => { const root = document.documentElement; const parts = [document.querySelector('.learning-lineage'), document.querySelector('.learning-lineage-steps'), document.querySelector('.learning-lineage-forward'), document.querySelector('.learning-remediation-preview')]; return parts.every((part) => part instanceof HTMLElement && part.scrollWidth <= part.clientWidth + 2) && root.scrollWidth <= root.clientWidth + 2; })()`, 'learning-audit-reflow', 10_000);
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `(() => {
      if (!matchMedia('(forced-colors: active)').matches) return false;
      const parts = [document.querySelector('.learning-lineage'), document.querySelector('.learning-lineage-step'), document.querySelector('.learning-remediation-preview')];
      const decision = document.querySelector('.learning-lineage-decision[data-decision-state="superseded"]');
      return parts.every((part) => part instanceof HTMLElement && getComputedStyle(part).borderTopStyle === 'solid') &&
        decision instanceof HTMLElement && getComputedStyle(decision).borderLeftStyle === 'dashed';
    })()`, 'learning-audit-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await clickSelector(renderer, '.learning-remediation-preview [data-learning-audit-action="cancel-preview"]', 'learning-audit-reflow-cancel');
    await readAudit(renderer, (page) => page.preview === null, 'learning-audit-reflow-closed');

    at('zero-loopback-requests');
    requireJourney(loopback.healthy() && loopback.observedRequests() === 0, 'zero-loopback-requests');

    at('completion-browser-close');
    await close();
    await loopback.close();
    journeyCompleted = true;
  } finally {
    // Only a Journey that finished names its cleanup; one that failed keeps the stage it failed at.
    if (journeyCompleted) at('completion-cleanup');
    finalCleanupRequested = true;
    try { await cancellation.cleanup(); } finally { cancellation.dispose(); }
  }
}

main().catch((error) => {
  reportJourneyFailure('J-11', location, error);
  if (runnerLifecycleIncomplete) process.stderr.write('', () => process.exit(1));
});
