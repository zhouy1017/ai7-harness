import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SIDEBAR } from './controller.mjs';
import { setDeveloperMode } from './ordinary-pages.mjs';

/** The real retained-before-verification failure, then the standalone source's actual native controls. */
export async function checkRetainedFindingSources(io, dataRoot, codeRoot, runRoot, browserRecord) {
  const { renderer, waitFor, assertRenderer, requireJourney, press } = io;
  const helper = resolve(runRoot, 'retained-review-fixture.mjs');
  await build({ entryPoints: [resolve(codeRoot, 'tests/support/retained-review-fixture.ts')], bundle: true,
    platform: 'node', format: 'esm', outfile: helper, logLevel: 'silent',
    banner: { js: "import { createRequire as createFixtureRequire } from 'node:module'; const require = createFixtureRequire(import.meta.url);" } });
  const inputRoot = resolve(runRoot, 'retained-review-input'); await mkdir(inputRoot);
  const { seedRetainedReviewFallback } = await import(pathToFileURL(helper).href);
  const fixture = await seedRetainedReviewFallback({ codeRoot, dataRoot, inputRoot });
  requireJourney(fixture.retainedBeforeFailure === 3 && fixture.verificationResults === 0, 'retained-source-write-order');
  const original = await renderer.evaluate(`document.documentElement.dataset.technicalLayerVisible==='true'`);
  const card = `article.review-finding[data-finding-id=${JSON.stringify(fixture.findingId)}]`;
  for (const developer of [false, true]) {
    const mode = developer ? 'developer' : 'ordinary';
    await setDeveloperMode(renderer, waitFor, developer, `retained-source-${mode}`, press);
    await press(renderer, SIDEBAR.destination('library'), `retained-source-${mode}-library`);
    await waitFor(renderer, `document.querySelector('button[data-book-id=${JSON.stringify(fixture.bookId)}]')`, `retained-source-${mode}-book-ready`);
    await press(renderer, `button[data-book-id=${JSON.stringify(fixture.bookId)}]`, `retained-source-${mode}-book`);
    await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(fixture.bookId)}]')`, `retained-source-${mode}-editor`);
    await press(renderer, SIDEBAR.section('review'), `retained-source-${mode}-review`);
    await waitFor(renderer, `document.querySelector(${JSON.stringify(card)})?.querySelectorAll('.finding-evidence-source').length===3`, `retained-source-${mode}-rows`);
    await assertRenderer(renderer, `document.querySelector(${JSON.stringify(card)}).closest('.fact-lens')===null`, `retained-source-${mode}-standalone`);
    await assertRenderer(renderer, `window.ai7.inspectFactualVerification(${JSON.stringify({ bookId: fixture.bookId, reviewRunId: fixture.reviewRunId,
      after: null, chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null })}).then(p=>p.results.length===0)`, `retained-source-${mode}-no-verification`);
    await renderer.evaluate(`(() => {window.__j04RetainedCopied=[];window.__j04RetainedCopy=event=>{const field=event.target;window.__j04RetainedCopied.push(field instanceof HTMLTextAreaElement?field.value.slice(field.selectionStart,field.selectionEnd):String(getSelection()));};document.addEventListener('copy',window.__j04RetainedCopy,true);})()`);
    try {
      for (const [index, source] of fixture.sources.entries()) {
        const row = `${card} [data-evidence-id=${JSON.stringify(source.evidenceId)}]`;
        await assertRenderer(renderer, `(() => { const row=document.querySelector(${JSON.stringify(row)}); return row.querySelector('.review-finding-source')?.textContent.startsWith('来源：') && row.querySelector('.source-link-domain')?.textContent===${JSON.stringify(new URL(source.address).host)} && row.querySelector('.research-evidence-url')?.textContent===${JSON.stringify(developer ? source.address : '')}; })()`, `retained-source-${mode}-${index}-words`);
        const before = await browserRecord();
        await press(renderer, `${row} [data-source-action="open-in-browser"]`, `retained-source-${mode}-${index}-open`);
        await waitFor(renderer, `document.querySelector(${JSON.stringify(row + ' .source-link-status')})?.textContent==='已在浏览器中打开。'`, `retained-source-${mode}-${index}-opened`);
        requireJourney(await browserRecord() === `${before}${source.address}\n`, `retained-source-${mode}-${index}-exact-open`);
        await press(renderer, `${row} [data-source-action="copy-link"]`, `retained-source-${mode}-${index}-copy`);
        await waitFor(renderer, `document.querySelector(${JSON.stringify(row + ' .source-link-status')})?.textContent==='已复制链接。'`, `retained-source-${mode}-${index}-copied`);
      }
      requireJourney(JSON.stringify(await renderer.evaluate('window.__j04RetainedCopied')) === JSON.stringify(fixture.sources.map(source => source.address)), `retained-source-${mode}-exact-copy`);
    } finally { await renderer.evaluate(`document.removeEventListener('copy',window.__j04RetainedCopy,true);delete window.__j04RetainedCopied;delete window.__j04RetainedCopy`); }
  }
  if (!original) await setDeveloperMode(renderer, waitFor, false, 'retained-source-restore-mode', press);
}
