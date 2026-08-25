import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { arch, platform, release, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { _electron as electron } from 'playwright-core';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
let diagnosticLocation = 'entry';

function at(location) {
  diagnosticLocation = location;
}

function requireJourney(condition, location) {
  if (!condition) throw new Error(`J-01/${location}`);
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

function productEnvironment() {
  const selected = { AI7_E2E_JOURNEY: 'J-01' };
  const names =
    process.platform === 'win32'
      ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'ComSpec']
      : ['PATH', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) selected[name] = value;
  }
  return selected;
}

async function runJourney(app, page) {
  at('renderer-ready');
  let rendererScriptFailed = false;
  page.on('pageerror', () => {
    rendererScriptFailed = true;
  });
  try {
    await page.locator('[data-screen="landing"]').waitFor({ timeout: 30_000 });
  } catch {
    throw new Error(`J-01/${rendererScriptFailed ? 'renderer-script' : page.url().startsWith('file:') ? 'renderer-file' : 'renderer-navigation'}`);
  }
  at('network-boundaries');
  const isolation = await page.evaluate(() => ({
    api: Object.keys(window.ai7).sort(),
    nodeProcess: typeof globalThis.process,
    nodeRequire: typeof globalThis.require,
  }));
  requireJourney(
    isolation.nodeProcess === 'undefined' &&
      isolation.nodeRequire === 'undefined' &&
      isolation.api.join(',') ===
        'commitNewBookImport,flushJournalEdit,getManuscriptWindow,platform,prepareNewBookReview,selectAndStageDocx',
    'renderer-isolation',
  );
  const rendererDenied = await page.evaluate(async () => {
    try {
      await fetch('http://127.0.0.1:9/ai7-j01-denial-probe');
      return false;
    } catch {
      return true;
    }
  });
  requireJourney(rendererDenied, 'renderer-network-denial');

  at('landing');
  requireJourney((await page.locator('[data-screen="landing"]').count()) === 1, 'landing-screen');
  at('stage-click');
  await page.getByRole('button', { name: '导入稿件', exact: true }).click();
  at('stage-target');
  try {
    await page.locator('[data-screen="target"]').waitFor();
  } catch {
    const state = await page.locator('#screen').getAttribute('data-screen').catch(() => null);
    throw new Error(`J-01/stage-${state === 'error' ? 'error' : state === 'landing' ? 'landing' : 'unknown'}`);
  }
  at('target-contract');
  const radio = page.getByRole('radio', { name: '新建图书', exact: true });
  requireJourney(!(await radio.isChecked()), 'no-preselection');
  requireJourney((await page.getByRole('textbox', { name: '书名', exact: true }).count()) === 0, 'title-before-target');

  at('target-select');
  await radio.check();
  at('target-title');
  await page.locator('[data-screen="title"]').waitFor();
  at('title');
  const title = page.getByRole('textbox', { name: '书名', exact: true });
  requireJourney(await title.evaluate((input) => input instanceof HTMLInputElement && input.value.length > 0), 'title-suggestion');
  requireJourney(
    await page.locator('.field-note').evaluateAll((notes) => notes.some((note) => note.textContent?.includes('建议来源：DOCX 标题元数据'))),
    'title-source-label',
  );
  requireJourney((await page.locator('[data-fidelity-category]').count()) === 8, 'title-fidelity-eight');
  await page.getByRole('button', { name: '确认书名并复核', exact: true }).click();

  await page.locator('[data-screen="review"]').waitFor();
  at('review');
  requireJourney((await page.getByRole('table', { name: '导入保真审阅', exact: true }).count()) === 1, 'review-fidelity-table');
  requireJourney((await page.locator('[data-fidelity-category]').count()) === 8, 'review-fidelity-eight');
  requireJourney(
    await page.locator('[data-fidelity-category]').evaluateAll((rows) => {
      const expected = [
        ['inline-styles', 'status-preserved'],
        ['comments-revisions', 'status-preserved'],
        ['notes', 'status-preserved'],
        ['tables', 'status-preserved'],
        ['images-captions', 'status-preserved'],
        ['sections', 'status-preserved'],
        ['headers-footers', 'status-preserved'],
        ['round-trip-export', 'status-unsupported'],
      ];
      return (
        rows.length === expected.length &&
        rows.every((row, index) =>
          row.getAttribute('data-fidelity-category') === expected[index]?.[0] &&
          row.querySelector('.count')?.textContent?.includes('· 0 项') === true &&
          row.querySelector('.status-pill')?.classList.contains(expected[index]?.[1] ?? '') === true,
        )
      );
    }),
    'review-fidelity-exact',
  );
  requireJourney(
    await page.locator('[data-fidelity-category="round-trip-export"]').evaluate((row) =>
      Boolean(row.textContent?.includes('不提供往返保证') && row.textContent.includes('不阻止本次 clean 文本导入')),
    ),
    'review-roundtrip-non-effect',
  );
  requireJourney((await page.getByText('明确不会发生', { exact: true }).count()) === 1, 'review-non-effects');
  requireJourney((await page.getByText('将创建的记录', { exact: true }).count()) === 1, 'review-records');
  requireJourney(
    await page.locator('.review-section').evaluateAll((sections) => {
      const exact = (heading, expected) => {
        const section = sections.find((item) => item.querySelector('h3')?.textContent === heading);
        const actual = Array.from(section?.querySelectorAll('li') ?? [], (item) => item.textContent);
        return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
      };
      return (
        exact('将创建的记录', [
          '图书与稳定标识',
          '图书编辑维度集（8 项）',
          '源材料版本与来源记录',
          '导入保真审阅',
          '主稿件',
          '稿件分支',
          '稿件修订版 r1 与有序稳定内容块',
          '工作流程实例与精确方案版本绑定',
          '稿件导入记录',
        ]) &&
        exact('明确不会发生', [
          '不创建书系或书系成员关系',
          '不创建编辑学习准入决定',
          '不授予或执行模型提供方传输',
          '不创建发稿版本',
          '不创建公开发布许可或公开发布事实',
          '不导出、不发送、不交付、不发布',
          '不承诺 DOCX 往返或版式复原',
          'clean 导入不创建导入降级决定',
        ])
      );
    }),
    'review-exact-effects',
  );
  await page.getByRole('button', { name: '新建图书并导入稿件', exact: true }).click();

  await page.locator('[data-screen="imported"]').waitFor();
  at('imported');
  requireJourney((await page.getByRole('heading', { name: '稿件已导入', exact: true }).count()) === 1, 'import-completion');
  await page.getByRole('button', { name: '打开稿件', exact: true }).click();
  await page.locator('[data-screen="editor"]').waitFor();
  at('editor');
  const blocks = page.locator('[data-testid="manuscript-editor"] > [data-block-id]');
  requireJourney((await blocks.count()) === 32, 'bounded-window-count');
  requireJourney(
    await page.locator('.editor-meta').evaluate((meta) => /1\D+32\D+51/.test(meta.textContent ?? '')),
    'bounded-window-position',
  );

  const editedBlock = blocks.nth(3);
  await editedBlock.click();
  await editedBlock.evaluate((block) => {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type('，新增合成编辑');
  at('journal');
  const save = page.getByRole('button', { name: '保存当前编辑', exact: true });
  requireJourney(await save.isEnabled(), 'edit-dirty');
  const journalStates = page.evaluate(
    () =>
      new Promise((resolve) => {
        const status = document.querySelector('#persistence-status');
        if (!status) return resolve({ busy: false, durable: false });
        let busy = status.textContent?.includes('正在写入修订日志') ?? false;
        const observer = new MutationObserver(() => {
          busy ||= status.textContent?.includes('正在写入修订日志') ?? false;
          if (status.textContent?.includes('已写入修订日志')) {
            observer.disconnect();
            resolve({ busy, durable: true });
          }
        });
        observer.observe(status, { childList: true, subtree: true, characterData: true });
        setTimeout(() => {
          observer.disconnect();
          resolve({ busy, durable: false });
        }, 30_000);
      }),
  );
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
  const persisted = await journalStates;
  requireJourney(persisted.busy && persisted.durable, 'durable-journal-ack');
  requireJourney(
    await page.locator('.editor-meta').evaluate((meta) =>
      Boolean(meta.textContent?.includes('稿件修订版 r1') === false && meta.textContent?.includes('当前修订版 r1') && meta.textContent.includes('修订日志序号 1')),
    ),
    'r1-journal-sequence',
  );
}

async function main() {
  at('cli');
  parseJourney();
  const tempParent = await realpath(tmpdir());
  const runRoot = await realpath(await mkdtemp(join(tempParent, 'ai7-j01-e2e-')));
  requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j01-e2e-'), 'temp-root');
  const dataRoot = resolve(runRoot, 'data');
  const docx = await createSyntheticDocx(runRoot);
  requireJourney(isAbsolute(dataRoot) && isAbsolute(docx), 'absolute-runtime-inputs');
  const executable =
    process.platform === 'win32'
      ? resolve(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
      : resolve(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
  const entry = resolve(ROOT, 'dist', 'main', 'index.cjs');
  let app;
  try {
    at('launch');
    app = await electron.launch({
      executablePath: executable,
      args: [entry, '--data-root', dataRoot, '--j01-picker-path', docx],
      cwd: ROOT,
      env: productEnvironment(),
      timeout: 30_000,
    });
    at('first-window');
    const page = await app.firstWindow({ timeout: 30_000 });
    await runJourney(app, page);
    await app.close();
    app = undefined;
  } finally {
    if (app) await app.close().catch(() => undefined);
    requireJourney(dirname(runRoot) === tempParent && basename(runRoot).startsWith('ai7-j01-e2e-'), 'cleanup-target');
    await rm(runRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error && error.message.startsWith('J-01/') ? error.message : `J-01/${diagnosticLocation}`;
  console.error(message);
  process.exitCode = 1;
});
