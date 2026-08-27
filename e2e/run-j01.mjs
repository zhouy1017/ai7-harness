import { copyFile, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strToU8, zipSync } from 'fflate';

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

async function createSyntheticDocx(path, variant) {
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:r><w:t>公共合成导入身份测试</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>相同内容和结构。</w:t></w:r></w:p>' +
    '<w:sectPr/></w:body></w:document>';
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
    ...(variant === 'b'
      ? { 'docProps/app.xml': strToU8('<Properties><Application>AI7 J-01 synthetic B</Application></Properties>') }
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
  } = options;
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
  at('renderer-ready');
  const initialScreen = start === 'accepted-review' ? 'review' : start;
  await waitFor(
    renderer,
    `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen=${JSON.stringify(initialScreen)}]')`,
    'renderer-ready',
  );
  await assertRenderer(
    renderer,
    `typeof globalThis.process === 'undefined' && typeof globalThis.require === 'undefined' && Object.keys(window.ai7).sort().join(',') === 'abandonImportDraft,acknowledgeImportCompletion,cancelServiceJob,commitNewBookImport,commitReplacement,continueImportDraft,dismissReplacementPreview,flushJournalEdit,freezeReplacement,getImportStartup,getManuscriptWindow,getManuscriptWindowAt,getOutline,getSearchResults,listPriorWork,platform,pollServiceJob,prepareNewBookReview,prepareReplacement,redoManuscript,reselectImportDraft,saveMilestone,selectAndStageDocx,startReplacementCommit,startSearch,undoManuscript'`,
    'renderer-isolation',
  );
  await assertRenderer(
    renderer,
    `(async () => { try { await fetch('http://127.0.0.1:9/ai7-j01-denial-probe'); return false; } catch { return true; } })()`,
    'renderer-network-denial',
  );
  if (start === 'landing') {
    at('landing');
    await clickExactButton(renderer, '导入稿件', 'stage-click');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'stage-target');
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
  at('review');
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
    at('review');
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
      `(() => { let frameId = 0; globalThis.__ai7HeldCompletionFrames = []; globalThis.requestAnimationFrame = (callback) => { globalThis.__ai7HeldCompletionFrames.push(callback); frameId += 1; return frameId; }; return true; })()`,
      'completion-paint-held',
    );
  }
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
  await assertRenderer(
    renderer,
    `Array.from(document.querySelectorAll('h2')).some((heading) => heading.textContent === '稿件已导入')`,
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
    await createSyntheticDocx(syntheticAPath, 'a');
    await createSyntheticDocx(syntheticBPath, 'b');
    const syntheticAInfo = await lstat(syntheticAPath);
    const syntheticBInfo = await lstat(syntheticBPath);
    const syntheticASha256 = await digestFile(syntheticAPath);
    const syntheticBSha256 = await digestFile(syntheticBPath);
    requireJourney(
      syntheticAInfo.isFile() &&
        syntheticBInfo.isFile() &&
        !syntheticAInfo.isSymbolicLink() &&
        !syntheticBInfo.isSymbolicLink() &&
        (await realpath(syntheticAPath)) === syntheticAPath &&
        (await realpath(syntheticBPath)) === syntheticBPath &&
        syntheticASha256 !== SAMPLE1_SHA256 &&
        syntheticBSha256 !== SAMPLE1_SHA256 &&
        syntheticASha256 !== syntheticBSha256,
      'synthetic-input-identities',
    );
    const executable = electronExecutable();
    const entry = resolve(ROOT, 'dist', 'main', 'index.cjs');
    const launchProduct = async ({ dataRoot, pickerPath, importControl }) => {
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
      at('launch');
      browser = await chromium.launch({
        executablePath: executable,
        headless: false,
        ignoreDefaultArgs: true,
        args: productArgs,
        env: productEnvironment(executable),
        timeout: 30_000,
      });
      return attachRendererTarget(browser);
    };
    const closeProduct = async () => {
      await browser.close();
      browser = undefined;
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

    const continuityRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'continuity-data'), checkoutRoot);
    const selectedRoot = resolve(runRoot, 'selected-input');
    await mkdir(selectedRoot);
    const selectedCopy = resolve(selectedRoot, 'sample1.docx');
    await copyFile(docx, selectedCopy);
    requireJourney((await realpath(selectedCopy)) === selectedCopy, 'selected-copy-identity');

    let renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: selectedCopy });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'restart-before-review-landing',
    );
    await clickExactButton(renderer, '导入稿件', 'restart-before-review-stage');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'restart-before-review-target');
    await closeProduct();
    await rm(selectedCopy, { force: true });

    renderer = await launchProduct({ dataRoot: continuityRoot });
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
    await runJourney(renderer, { ...sample1Expectation, exerciseEditor: true }, { start: 'target' });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: docx });
    await runJourney(renderer, exactSample1Expectation);
    await closeProduct();

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: syntheticAPath });
    await runJourney(renderer, syntheticAExpectation, { stopAfterAcceptedReview: true });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: continuityRoot });
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
    await runJourney(renderer, syntheticAExpectation, { start: 'accepted-review' });
    await closeProduct();

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: syntheticBPath });
    await runJourney(renderer, syntheticBExpectation);
    await closeProduct();

    renderer = await launchProduct({ dataRoot: continuityRoot, pickerPath: docx });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'abandon-stage-landing',
    );
    await clickExactButton(renderer, '导入稿件', 'abandon-stage-click');
    await waitFor(renderer, `document.querySelector('[data-screen="target"]')`, 'abandon-stage-target');
    await closeProduct();
    renderer = await launchProduct({ dataRoot: continuityRoot });
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
    });
    await runJourney(renderer, sample1Expectation, { stopAfterAcceptedReview: true });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: legacyReviewRoot });
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
    await runJourney(renderer, sample1Expectation, { start: 'target' });
    await closeProduct();

    const beforePaintRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'before-paint-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: beforePaintRoot, pickerPath: docx });
    await runJourney(renderer, sample1Expectation, { holdCompletionPaint: true });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: beforePaintRoot });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="imported"]')`,
      'before-paint-completion-recovered',
    );
    await assertRenderer(
      renderer,
      `document.querySelector('[data-screen="imported"] h2')?.textContent === '稿件已导入'`,
      'before-paint-exact-completion',
    );
    await waitFor(
      renderer,
      `document.visibilityState === 'visible' && document.documentElement.dataset.ai7ImportCompletionPainted === 'true' && document.documentElement.dataset.ai7ImportCompletionAcknowledged === 'true'`,
      'before-paint-recovery-acknowledged',
    );
    await closeProduct();

    const abandonFailureRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'abandon-failure-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: abandonFailureRoot, pickerPath: docx });
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
    renderer = await launchProduct({ dataRoot: abandonFailureRoot });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`,
      'abandon-retry-finalized',
    );
    requireJourney(!existsSync(abandonFailureObject), 'abandon-retry-unshared-object-removed');
    await closeProduct();

    const abandonInterruptionRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'abandon-interruption-data'), checkoutRoot);
    renderer = await launchProduct({ dataRoot: abandonInterruptionRoot, pickerPath: docx });
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
    renderer = await launchProduct({ dataRoot: abandonInterruptionRoot, pickerPath: docx });
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
    });
    await runJourney(renderer, sample1Expectation, { expectInterruption: true });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: beforeCommitRoot });
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
    await runJourney(renderer, sample1Expectation, { start: 'accepted-review' });
    await closeProduct();

    const afterCommitRoot = await createCanonicalExternalDataRoot(resolve(runRoot, 'after-commit-data'), checkoutRoot);
    renderer = await launchProduct({
      dataRoot: afterCommitRoot,
      pickerPath: docx,
      importControl: 'after-commit-before-response',
    });
    await runJourney(renderer, sample1Expectation, { expectInterruption: true });
    await closeProduct();
    renderer = await launchProduct({ dataRoot: afterCommitRoot });
    await waitFor(
      renderer,
      `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="imported"]')`,
      'after-commit-completion-recovered',
    );
    await assertRenderer(
      renderer,
      `document.querySelector('[data-screen="imported"] h2')?.textContent === '稿件已导入' && !document.body.textContent.includes('导入提交结果待确认')`,
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
    });
    await runJourney(renderer, sample1Expectation, { expectInterruption: true });
    await closeProduct();
    renderer = await launchProduct({
      dataRoot: uncertainRoot,
      importControl: 'uncertain-reconciliation',
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
