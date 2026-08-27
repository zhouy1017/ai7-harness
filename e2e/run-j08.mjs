import { createWriteStream, existsSync } from 'node:fs';
import { appendFile, lstat, mkdir, mkdtemp, open as openFile, readdir, realpath, rename, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEBUG_SELECTORS = new Set(['DEBUG', 'DEBUG_FILE', 'PWDEBUG', 'PWDEBUGIMPL']);
const OBJECT_PATTERN = /^[0-9a-f]{64}\.snapshot$/;
let location = 'entry';
let electronExecutable;
let Zip;
let ZipPassThrough;
let strToU8;

function at(next) { location = next; }
function requireJourney(condition, name) { if (!condition) throw new Error(`J-08/${name}`); }
function inside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function parseJourney() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireJourney(args.length === 2 && args[0] === '--journey' && args[1] === 'J-08', 'cli');
  requireJourney(process.versions.node === '24.18.1', 'node-runtime');
  requireJourney(
    (platform() === 'win32' && arch() === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
      (platform() === 'darwin' && arch() === 'arm64' && Number(release().split('.')[0]) >= 24),
    'host-runtime',
  );
  requireJourney(!Object.keys(process.env).some((name) => DEBUG_SELECTORS.has(name.toUpperCase())), 'debug-environment');
}

function productEnvironment(executable) {
  const selected = { AI7_E2E_JOURNEY: 'J-08' };
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
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': '21',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end('AI7_LOOPBACK_SENTINEL');
  });
  server.on('error', () => { runtimeFault = true; });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', () => rejectListen(new Error('J-08/loopback-listen')));
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!(address !== null && typeof address === 'object' && address.address === '127.0.0.1' &&
      Number.isSafeInteger(address.port) && address.port > 0)) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw new Error('J-08/loopback-address');
  }
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}/j08-network-probe`,
    healthy: () => server.listening && !runtimeFault,
    observedRequests: () => observedRequests,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(new Error('J-08/loopback-close')) : resolveClose());
      });
      requireJourney(!runtimeFault, 'loopback-runtime');
    },
  };
}

async function createSyntheticDocx(path, title, seed) {
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
    zip.add(entry);
    entry.push(strToU8(text), true);
    await drain();
  };
  await push('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  await push('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></cp:coreProperties>`);
  const paragraphs = Array.from({ length: 48 }, (_, index) =>
    `<w:p>${index === 0 ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>' : index % 12 === 0 ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''}<w:r><w:t>${title}的公开合成段落${seed}-${index + 1}，用于本地恢复功能校验。</w:t></w:r></w:p>`).join('');
  await push('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`);
  zip.end();
  await completion;
  const metadata = await lstat(path);
  requireJourney(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 1_000, `fixture-${seed}`);
}

async function attachRenderer(browser) {
  const root = await browser.newBrowserCDPSession();
  const deadline = Date.now() + 60_000;
  let target;
  while (Date.now() < deadline) {
    const pages = (await root.send('Target.getTargets')).targetInfos.filter((item) => item.type === 'page');
    if (pages.length === 1) { target = pages[0]; break; }
    requireJourney(pages.length === 0, 'renderer-target-count');
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  requireJourney(target, 'renderer-target-timeout');
  const { sessionId } = await root.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
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
    if (response.error) completion.reject(new Error('J-08/renderer-cdp-response'));
    else completion.resolve(response.result);
  });
  const send = async (method, params = {}) => {
    const id = nextId++;
    const response = new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => { pending.delete(id); rejectResponse(new Error('J-08/renderer-cdp-timeout')); }, 60_000);
      timeout.unref();
      pending.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolveResponse(value); },
        reject: (error) => { clearTimeout(timeout); rejectResponse(error); },
      });
    });
    await root.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
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
    if (await renderer.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`J-08/${name}`);
}
async function assertRenderer(renderer, expression, name) {
  requireJourney(await renderer.evaluate(`Boolean(${expression})`), name);
}
async function click(renderer, label, name) {
  await assertRenderer(renderer, `(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === ${JSON.stringify(label)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.click(); return true; })()`, name);
}
async function fill(renderer, selector, value, name) {
  await assertRenderer(renderer, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (!(input instanceof HTMLInputElement)) return false; input.value=${JSON.stringify(value)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`, name);
}
async function press(renderer, key) {
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
}

async function importBook(renderer, title, token, openEditor = false) {
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, `${token}-landing`);
  await click(renderer, '导入稿件', `${token}-import`);
  await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, `${token}-target`);
  await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if (!(radio instanceof HTMLInputElement)) return false; radio.click(); return radio.checked; })()`, `${token}-target-select`);
  await fill(renderer, '#book-title', title, `${token}-title`);
  await click(renderer, '确认书名并复核', `${token}-review`);
  await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, `${token}-review-ready`);
  await click(renderer, '新建图书并导入稿件', `${token}-commit`);
  await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, `${token}-committed`, 180_000);
  await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`, `${token}-acknowledged`, 180_000);
  if (openEditor) {
    await click(renderer, '打开稿件', `${token}-open`);
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, `${token}-editor`);
  }
}

async function saveMilestone(renderer, label, token) {
  await assertRenderer(renderer, `(() => { const details=document.querySelector('.milestone-section'); if (!(details instanceof HTMLDetailsElement)) return false; details.open=true; return true; })()`, `${token}-details`);
  await fill(renderer, '#milestone-label', label, `${token}-label`);
  await fill(renderer, '#milestone-purpose', '恢复边界校验', `${token}-purpose`);
  await fill(renderer, '#milestone-note', '本地、提供方免费、无导出。', `${token}-note`);
  await click(renderer, '保存为里程碑版本', `${token}-save`);
  await waitFor(renderer, `document.querySelector('#persistence-status')?.textContent.includes(${JSON.stringify(label)})`, `${token}-saved`, 120_000);
}

async function assertRecoveryScreen(renderer, snapshotState = 'eligible') {
  const stateToken = snapshotState === 'eligible' ? 'eligible' : snapshotState === '摘要不匹配' ? 'mismatch' : snapshotState === '对象缺失' ? 'missing' : snapshotState === '对象不完整' ? 'incomplete' : 'none';
  await waitFor(renderer, `document.querySelector('[data-screen="manuscript-recovery"]')`, `recovery-${stateToken}`);
  await assertRenderer(renderer, `document.querySelector('.recovery-identity')?.textContent.includes('最后持久写入边界') && document.querySelector('.recovery-identity')?.textContent.includes('未获得修订日志确认的输入可能不存在')`, 'durable-boundary-disclosed');
  await assertRenderer(renderer, `document.querySelectorAll('input[name="recovery-source"]:checked').length === 0 && Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='仅查看')?.disabled && Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='恢复为新版本')?.disabled`, 'comparison-unselected');
  const expected = snapshotState === 'eligible' ? 3 : 2;
  await assertRenderer(renderer, `(() => { const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i; const cards=Array.from(document.querySelectorAll('.recovery-candidate')); return cards.length===${expected} && document.querySelectorAll('input[name="recovery-source"]').length===${expected} && cards.every((card)=>uuid.test(card.querySelector('[data-candidate-revision-id]')?.textContent??'') && /^[0-9a-f]{64}$/.test(card.querySelector('[data-candidate-revision-digest]')?.textContent??'')); })()`, 'candidate-identities');
  if (snapshotState === 'eligible') {
    await assertRenderer(renderer, `document.querySelector('[data-recovery-candidate="snapshot"] input[type="radio"]') && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(document.querySelector('[data-recovery-candidate="snapshot"] [data-snapshot-id]')?.textContent??'') && document.querySelector('[data-recovery-candidate="snapshot"]')?.textContent.includes('已独立校验快照对象') && !document.querySelector('.recovery-snapshot-disclosure')`, 'snapshot-eligible');
  } else {
    await assertRenderer(renderer, `!document.querySelector('[data-recovery-candidate="snapshot"]') && !document.querySelector('.recovery-candidate-grid .recovery-snapshot-disclosure') && document.querySelector('.recovery-snapshot-disclosure')?.textContent.includes(${JSON.stringify(snapshotState)})`, `snapshot-${stateToken}`);
  }
}

async function readSnapshotHeader(path) {
  const handle = await openFile(path, 'r');
  try {
    const buffer = Buffer.alloc(32_768);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const newline = buffer.subarray(0, bytesRead).indexOf(0x0a);
    requireJourney(newline > 0 && newline < buffer.length - 1, 'snapshot-header-boundary');
    const header = JSON.parse(buffer.subarray(0, newline).toString('utf8'));
    requireJourney(header.type === 'header' && typeof header.snapshotId === 'string' && typeof header.createdAt === 'string', 'snapshot-header-shape');
    return header;
  } finally {
    await handle.close();
  }
}

async function overwriteFinalByte(path, size, value) {
  requireJourney(Number.isSafeInteger(size) && size > 0 && Number.isSafeInteger(value) && value >= 0 && value <= 255, 'snapshot-byte-boundary');
  const handle = await openFile(path, 'r+');
  try {
    const written = await handle.write(Buffer.from([value]), 0, 1, size - 1);
    requireJourney(written.bytesWritten === 1, 'snapshot-byte-write');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main() {
  parseJourney();
  let loopback;
  let runRoot;
  let browser;
  let tempParent;
  try {
    at('controller-loopback-sentinel');
    loopback = await createLoopbackSentinel();
    at('controller-imports');
    const denial = resolve(ROOT, 'dist', 'shared', 'network-denial.mjs');
    requireJourney(existsSync(denial), 'controller-network-denial-carrier');
    (await import(pathToFileURL(denial).href)).installNodeNetworkDenial();
    ({ Zip, ZipPassThrough, strToU8 } = await import('fflate'));
    ({ electronExecutable } = await import('../tools/electron-runtime.mjs'));
    const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'data-root.mjs')).href);
    const { chromium } = await import('playwright-core');
    tempParent = await realpath(tmpdir());
    const checkout = await realpath(ROOT);
    requireJourney(!inside(checkout, tempParent) && !inside(tempParent, checkout), 'temp-boundary');
    runRoot = await mkdtemp(join(tempParent, 'ai7-j08-e2e-'));
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j08-e2e-'), 'temp-root');
    const inputs = resolve(runRoot, 'synthetic-inputs');
    await mkdir(inputs);
    const bookA = resolve(inputs, 'recovery-a.docx');
    const bookB = resolve(inputs, 'unrelated-b.docx');
    const draftC = resolve(inputs, 'pending-import-c.docx');
    await createSyntheticDocx(bookA, '恢复边界甲', 'a');
    await createSyntheticDocx(bookB, '无关工作乙', 'b');
    await createSyntheticDocx(draftC, '待处理导入丙', 'c');
    const dataRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'data'), checkout);
    const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
    const executable = electronExecutable();
    const launch = async ({ picker, interrupt = false } = {}) => {
      const args = [
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
        '--disable-sync', '--metrics-recording-only', '--no-first-run', '--remote-debugging-pipe', `--user-data-dir=${shellRoot}`,
        resolve(ROOT, 'dist', 'main', 'index.cjs'), '--data-root', dataRoot, '--launcher-pid', String(process.pid),
      ];
      if (picker) args.push('--j08-picker-path', picker);
      if (interrupt) args.push('--j08-recovery-control', 'interrupt-after-journal-ack');
      requireJourney(!args.some((argument) => /--inspect|--remote-debugging-port|^https?:|^wss?:/i.test(argument)), 'pipe-only-product-transport');
      browser = await chromium.launch({ executablePath: executable, headless: false, ignoreDefaultArgs: true, args, env: productEnvironment(executable), timeout: 60_000 });
      return attachRenderer(browser);
    };
    const close = async () => { await browser.close(); browser = undefined; };

    at('baseline-import-and-snapshot');
    let renderer = await launch({ picker: bookA });
    await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true'`, 'ready-a');
    await renderer.send('Page.setBypassCSP', { enabled: true });
    try {
      const fetchRejected = await renderer.evaluate(`(async()=>{try{await fetch(${JSON.stringify(loopback.url)});return false}catch{return true}})()`);
      requireJourney(
        fetchRejected === true && loopback.healthy() && loopback.observedRequests() === 0,
        'renderer-network-denial',
      );
    } finally {
      await renderer.send('Page.setBypassCSP', { enabled: false });
    }
    await loopback.close();
    await importBook(renderer, '恢复边界甲', 'book-a', true);
    await saveMilestone(renderer, '中断前检查点', 'checkpoint-one');
    await saveMilestone(renderer, '中断前复核快照', 'checkpoint-two');
    await close();

    at('clean-reopen');
    renderer = await launch({ picker: bookB });
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'clean-reopen-no-attention');
    await assertRenderer(renderer, `!document.querySelector('[data-screen="manuscript-recovery"]')`, 'clean-reopen-no-recovery');
    await importBook(renderer, '无关工作乙', 'book-b');
    await close();

    at('acknowledged-interruption-with-lower-priority-import');
    renderer = await launch({ picker: draftC, interrupt: true });
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'interrupt-landing');
    await assertRenderer(renderer, `(async()=>{ const staged=await window.ai7.selectAndStageDocx(); if(staged.status!=='staged')return false; const work=await window.ai7.listPriorWork(); const item=work.find((entry)=>entry.bookTitle==='恢复边界甲'); if(!item)return false; const page=await window.ai7.getManuscriptWindowAt({manuscriptId:item.manuscriptId,branchId:item.branchId,target:{kind:'start'}}); const block=page.blocks[0]; const length=Array.from(block.text).length; const ack=await window.ai7.flushJournalEdit({clientEditId:'00000000-0000-4000-8000-000000000108',manuscriptId:item.manuscriptId,branchId:item.branchId,baseRevisionId:page.revisionId,blockId:block.blockId,windowStartBlockId:block.blockId,baseBlockDigest:block.digest,expectedJournalSequence:page.journalSequence,fromGrapheme:length,toGrapheme:length,insertText:'中断后已确认'}); return ack.sequence===page.journalSequence+1 && ack.completionLabel==='已写入修订日志'; })()`, 'acknowledged-edit');
    await waitFor(renderer, `document.documentElement.dataset.ai7ServiceState === 'interrupted'`, 'service-interrupted');
    await close();

    at('recovery-priority-comparison-view-defer');
    renderer = await launch();
    await assertRecoveryScreen(renderer, 'eligible');
    await assertRenderer(renderer, `document.querySelector('.recovery-candidate-grid')?.children.length===3 && document.querySelector('.recent-work-item')===null`, 'recovery-before-import');
    await press(renderer, 'Tab');
    await assertRenderer(renderer, `document.activeElement===document.querySelector('input[name="recovery-source"]') && document.activeElement.matches(':focus-visible')`, 'recovery-visible-focus');
    await press(renderer, 'ArrowRight');
    await assertRenderer(renderer, `document.querySelectorAll('input[name="recovery-source"]:checked').length===1`, 'recovery-keyboard-radio');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(renderer, `getComputedStyle(document.querySelector('.recovery-candidate-grid')).gridTemplateColumns.split(' ').length===1 && document.documentElement.scrollWidth<=document.documentElement.clientWidth+2`, 'j14-recovery-zoom-200-reflow');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.manuscript-recovery-panel')).boxShadow==='none' && getComputedStyle(document.querySelector('.recovery-candidate')).borderStyle!=='none'`, 'j14-recovery-forced-colors');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await assertRenderer(renderer, `(() => { const journal=document.querySelector('[data-recovery-candidate="journal"] input'); journal.click(); return journal.checked; })()`, 'journal-select');
    await assertRenderer(renderer, `!document.querySelector('.recovery-selection-consequence')?.hidden && document.querySelector('.recovery-selection-consequence')?.textContent.includes('新的后代修订版') && document.querySelector('.recovery-selection-consequence')?.textContent.includes('既有历史与稿件固定点保持原位') && !Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='恢复为新版本')?.disabled`, 'selection-consequence');
    await click(renderer, '仅查看', 'readonly-view');
    await waitFor(renderer, `document.querySelector('[data-screen="recovery-viewer"]')`, 'readonly-view-ready');
    await assertRenderer(renderer, `document.querySelector('.recovery-readonly-blocks') && document.querySelectorAll('.recovery-readonly-blocks > *').length<=32 && !document.querySelector('[contenteditable="true"]') && !document.querySelector('[data-testid="manuscript-editor"]')`, 'permanent-readonly-view');
    await click(renderer, '返回比较', 'back-comparison');
    await waitFor(renderer, `document.querySelector('[data-screen="manuscript-recovery"]')`, 'back-comparison-ready');
    await click(renderer, '稍后处理', 'defer');
    await waitFor(renderer, `document.querySelector('[data-screen^="import-"]')`, 'defer-lower-priority-import');
    await assertRenderer(renderer, `Number(document.querySelector('[data-recovery-return]')?.dataset.recoveryReturnVersion)>=2`, 'return-route-import-recovery');
    await click(renderer, '继续导入', 'continue-lower-import');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'lower-import-target');
    await assertRenderer(renderer, `document.querySelector('[data-recovery-return]')`, 'return-route-target');
    await assertRenderer(renderer, `(() => { const radio=document.querySelector('input[aria-label="新建图书"]'); if (!(radio instanceof HTMLInputElement)) return false; radio.click(); return radio.checked; })()`, 'lower-import-target-select');
    await waitFor(renderer, `document.querySelector('[data-screen="title"]')`, 'lower-import-title');
    await assertRenderer(renderer, `document.querySelector('[data-recovery-return]')`, 'return-route-title');
    await fill(renderer, '#book-title', '待处理导入丙', 'lower-import-title-fill');
    await click(renderer, '确认书名并复核', 'lower-import-review');
    await waitFor(renderer, `document.querySelector('[data-screen="review"]')`, 'lower-import-review-ready');
    await assertRenderer(renderer, `document.querySelector('[data-recovery-return]')`, 'return-route-review');
    await click(renderer, '新建图书并导入稿件', 'lower-import-commit');
    await waitFor(renderer, `document.querySelector('[data-screen="imported"]')`, 'lower-import-committed', 180_000);
    await waitFor(renderer, `document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`, 'lower-import-acknowledged', 180_000);
    await assertRenderer(renderer, `document.querySelector('[data-recovery-return]')`, 'return-route-completion');
    await click(renderer, '打开稿件', 'lower-import-open');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'lower-import-editor');
    await assertRenderer(renderer, `Array.from(document.querySelectorAll('button')).some((item)=>item.textContent==='返回恢复待确认')`, 'return-route-imported-editor');
    await click(renderer, '返回恢复待确认', 'return-from-imported-editor');
    await assertRecoveryScreen(renderer, 'eligible');
    await click(renderer, '稍后处理', 'defer-after-import');
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'deferred-prior-work');
    await assertRenderer(renderer, `Array.from(document.querySelectorAll('.recent-work-item')).some((item)=>item.textContent.includes('恢复待确认状态')) && Array.from(document.querySelectorAll('.recent-work-item')).some((item)=>item.textContent.includes('无关工作乙'))`, 'deferred-affected-and-unrelated');
    await assertRenderer(renderer, `(async()=>{ const item=(await window.ai7.listPriorWork()).find((entry)=>entry.bookTitle==='恢复边界甲'); if(!item)return false; const page=await window.ai7.getManuscriptWindowAt({manuscriptId:item.manuscriptId,branchId:item.branchId,target:{kind:'start'}}); const block=page.blocks[0]; try { await window.ai7.flushJournalEdit({clientEditId:'00000000-0000-4000-8000-000000000208',manuscriptId:item.manuscriptId,branchId:item.branchId,baseRevisionId:page.revisionId,blockId:block.blockId,windowStartBlockId:block.blockId,baseBlockDigest:block.digest,expectedJournalSequence:page.journalSequence,fromGrapheme:0,toGrapheme:0,insertText:'禁止写入'}); return false; } catch(error) { return error?.code==='RECOVERY_ATTENTION_REQUIRED'; } })()`, 'deferred-branch-service-readonly');
    await assertRenderer(renderer, `(() => { const button=Array.from(document.querySelectorAll('.recent-work-item button')).find((item)=>item.textContent.includes('无关工作乙')); if(!button)return false; button.click(); return true; })()`, 'open-unrelated');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'unrelated-editor');
    await assertRenderer(renderer, `Array.from(document.querySelectorAll('button')).some((item)=>item.textContent==='返回恢复待确认') && document.querySelector('[data-testid="manuscript-editor"]')?.getAttribute('contenteditable')==='true'`, 'unrelated-remains-editable');
    await close();

    const objectRoot = resolve(dataRoot, 'recovery-objects', 'v1');
    const objectNames = (await readdir(objectRoot)).filter((name) => OBJECT_PATTERN.test(name));
    requireJourney(objectNames.length === 2, 'initial-snapshot-object-count');
    const objects = await Promise.all(objectNames.map(async (name) => {
      const path = resolve(objectRoot, name);
      return { name, path, size: (await stat(path)).size, header: await readSnapshotHeader(path) };
    }));
    objects.sort((left, right) => right.header.createdAt.localeCompare(left.header.createdAt) ||
      right.header.snapshotId.localeCompare(left.header.snapshotId));
    const [newestObject, olderObject] = objects;
    requireJourney(newestObject && olderObject && newestObject.header.snapshotId !== olderObject.header.snapshotId, 'snapshot-order');
    const partial = resolve(objectRoot, '.partial-00000000-0000-4000-8000-000000000108');
    const orphan = resolve(objectRoot, `${'f'.repeat(64)}.snapshot`);
    await writeFile(partial, 'partial', { flag: 'wx' });
    await writeFile(orphan, 'orphan', { flag: 'wx' });
    await appendFile(newestObject.path, Buffer.from([0]));

    at('snapshot-newest-mismatch-fallback');
    renderer = await launch();
    await assertRecoveryScreen(renderer, 'eligible');
    await assertRenderer(renderer, `document.querySelector('[data-recovery-candidate="snapshot"] [data-snapshot-id]')?.textContent===${JSON.stringify(olderObject.header.snapshotId)}`, 'snapshot-older-fallback');
    requireJourney(!(await exists(partial)) && !(await exists(orphan)), 'invisible-orphan-cleanup');
    await close();
    await appendFile(olderObject.path, Buffer.from([0]));

    at('snapshot-mismatch-and-orphan-cleanup');
    renderer = await launch();
    await assertRecoveryScreen(renderer, '摘要不匹配');
    await close();
    await truncate(newestObject.path, newestObject.size);
    await truncate(olderObject.path, olderObject.size);
    await overwriteFinalByte(newestObject.path, newestObject.size, 0x20);
    await overwriteFinalByte(olderObject.path, olderObject.size, 0x20);

    at('snapshot-incomplete');
    renderer = await launch();
    await assertRecoveryScreen(renderer, '对象不完整');
    await close();
    await overwriteFinalByte(newestObject.path, newestObject.size, 0x0a);
    await overwriteFinalByte(olderObject.path, olderObject.size, 0x0a);
    const heldNewest = resolve(objectRoot, `.held-${newestObject.name}`);
    const heldOlder = resolve(objectRoot, `.held-${olderObject.name}`);
    await rename(newestObject.path, heldNewest);

    at('snapshot-newest-missing-fallback');
    renderer = await launch();
    await assertRecoveryScreen(renderer, 'eligible');
    await assertRenderer(renderer, `document.querySelector('[data-recovery-candidate="snapshot"] [data-snapshot-id]')?.textContent===${JSON.stringify(olderObject.header.snapshotId)}`, 'snapshot-older-missing-fallback');
    await close();
    await rename(olderObject.path, heldOlder);

    at('snapshot-missing');
    renderer = await launch();
    await assertRecoveryScreen(renderer, '对象缺失');
    await close();
    await rename(heldNewest, newestObject.path);
    await rename(heldOlder, olderObject.path);

    at('descendant-restore');
    renderer = await launch();
    await assertRecoveryScreen(renderer, 'eligible');
    await assertRenderer(renderer, `(async()=>{ const startup=await window.ai7.getStartup(); if(startup.state!=='manuscript-recovery')return false; try { await window.ai7.restoreRecovery({attentionId:startup.recovery.attentionId,expectedAttentionVersion:startup.recovery.attentionVersion,selection:{kind:'snapshot',snapshotId:'00000000-0000-4000-8000-000000000045'}}); return false; } catch(error) { return error?.code==='RECOVERY_SNAPSHOT_INELIGIBLE'; } })()`, 'failed-selection-released');
    await assertRenderer(renderer, `(() => { const journal=document.querySelector('[data-recovery-candidate="journal"] input'); journal.click(); return journal.checked; })()`, 'restore-journal-select');
    await assertRenderer(renderer, `!document.querySelector('.recovery-selection-consequence')?.hidden && !Array.from(document.querySelectorAll('button')).find((item)=>item.textContent==='恢复为新版本')?.disabled`, 'restore-consequence-visible');
    await click(renderer, '恢复为新版本', 'restore-descendant');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && document.querySelector('.editor-meta')?.textContent.includes('当前修订版 r2')`, 'restored-r2', 120_000);
    await assertRenderer(renderer, `!document.querySelector('.recovered-state-marker')?.hidden && document.querySelector('.recovered-state-marker')?.textContent==='当前为恢复的工作状态'`, 'recovered-marker');
    await click(renderer, '撤销', 'history-floor-undo');
    await waitFor(renderer, `document.querySelector('#persistence-status')?.textContent.includes('没有可撤销')`, 'history-floor-enforced');
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 2, mobile: false });
    await renderer.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await assertRenderer(renderer, `document.documentElement.scrollWidth<=document.documentElement.clientWidth+2`, 'j14-zoom-200-reflow');
    await renderer.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await assertRenderer(renderer, `matchMedia('(forced-colors: active)').matches && getComputedStyle(document.querySelector('.editor-shell')).boxShadow==='none' && getComputedStyle(document.querySelector('button')).borderStyle!=='none'`, 'j14-forced-colors');
    await close();

    at('persistent-marker-and-later-milestone');
    renderer = await launch();
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'post-restore-landing');
    await assertRenderer(renderer, `(() => { const button=Array.from(document.querySelectorAll('.recent-work-item button')).find((item)=>item.textContent.includes('恢复边界甲')); if(!button)return false; button.click(); return true; })()`, 'reopen-restored');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && !document.querySelector('.recovered-state-marker')?.hidden`, 'marker-persists');
    await saveMilestone(renderer, '恢复后人工复核', 'post-recovery-review');
    await waitFor(renderer, `document.querySelector('.recovered-state-marker')?.hidden`, 'marker-cleared-only-by-milestone');
    await close();
    requireJourney((await readdir(objectRoot)).filter((name) => OBJECT_PATTERN.test(name)).length === 3, 'later-milestone-snapshot');

    at('snapshot-none-interruption');
    renderer = await launch({ interrupt: true });
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'none-interrupt-landing');
    await assertRenderer(renderer, `(async()=>{ const work=await window.ai7.listPriorWork(); const item=work.find((entry)=>entry.bookTitle==='无关工作乙'); if(!item)return false; const page=await window.ai7.getManuscriptWindowAt({manuscriptId:item.manuscriptId,branchId:item.branchId,target:{kind:'start'}}); const block=page.blocks[0]; const ack=await window.ai7.flushJournalEdit({clientEditId:'00000000-0000-4000-8000-000000000308',manuscriptId:item.manuscriptId,branchId:item.branchId,baseRevisionId:page.revisionId,blockId:block.blockId,windowStartBlockId:block.blockId,baseBlockDigest:block.digest,expectedJournalSequence:page.journalSequence,fromGrapheme:0,toGrapheme:0,insertText:'无快照边界'}); return ack.sequence===page.journalSequence+1; })()`, 'none-acknowledged-edit');
    await waitFor(renderer, `document.documentElement.dataset.ai7ServiceState === 'interrupted'`, 'none-service-interrupted');
    await close();

    at('snapshot-none-comparison');
    renderer = await launch();
    await assertRecoveryScreen(renderer, '没有适用的恢复快照');
    await assertRenderer(renderer, `(() => { const journal=document.querySelector('[data-recovery-candidate="journal"] input'); journal.click(); return journal.checked; })()`, 'none-journal-select');
    await click(renderer, '恢复为新版本', 'none-restore');
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && !document.querySelector('.recovered-state-marker')?.hidden`, 'none-restored', 120_000);
    await close();

    renderer = await launch();
    await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'final-clean-reopen');
    await assertRenderer(renderer, `!document.querySelector('[data-screen="manuscript-recovery"]') && !document.body.textContent.includes('恢复待确认状态')`, 'final-no-recovery-attention');
    await close();
  } finally {
    await browser?.close().catch(() => undefined);
    if (runRoot !== undefined) {
      requireJourney(tempParent !== undefined && dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j08-e2e-') && (await realpath(runRoot)) === runRoot, 'cleanup-target');
      await rm(runRoot, { recursive: true, force: true });
    }
    await loopback?.close();
  }
}

async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

main().catch((error) => {
  const message = error instanceof Error && error.message.startsWith('J-08/') ? error.message : `J-08/${location}`;
  console.error(message);
  process.exitCode = 1;
});
