import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SIDEBAR, journeyCheckFailure, journeyCheckLabel } from './controller.mjs';
import { setDeveloperMode } from './ordinary-pages.mjs';

const FIXTURE_PHASES = new Set(['build', 'directory', 'import-module', 'open-fixture', 'import-sample', 'install-profile', 'configure-connection',
  'prepare-review', 'authorize-review', 'drive-review', 'read-review', 'read-research', 'read-lens', 'check-order', 'read-mode', 'set-mode', 'open-library', 'open-book', 'open-review', 'check-rows', 'copy-observer', 'check-source', 'read-opener', 'press-open', 'check-open', 'press-copy', 'check-copy', 'restore-mode']);
const FIXTURE_CHECKS = new Set(['review-finding-present', 'retained-before-write', 'retained-after-write', 'verification-results-absent']);
const FIXTURE_ERRORS = Object.freeze({ ENOENT: 'missing-file', EACCES: 'access', EPERM: 'permission', ERR_SQLITE_ERROR: 'sqlite', SQLITE_BUSY: 'sqlite-busy',
  ERR_ASSERTION: 'assertion', MODEL_SERVICE_ROUTE_NOT_CONFIGURED: 'route-not-configured' });
export function retainedFixtureFailureCheck(phase, error) {
  if (FIXTURE_CHECKS.has(error?.fixtureCheck)) return `retained-fixture-${error.fixtureCheck}`;
  const step = FIXTURE_PHASES.has(phase) ? phase : 'unknown';
  const kind = Object.hasOwn(FIXTURE_ERRORS, error?.code) ? FIXTURE_ERRORS[error.code] : error instanceof TypeError ? 'type-error' : 'error';
  return `retained-fixture-${step}-${kind}`;
}


/** Cleanup cannot replace the first failed predicate; a cleanup-only failure remains visible. */
export async function withRetainedCopyObserver(renderer, action) {
  await renderer.evaluate(`(() => {window.__j04RetainedCopied=[];window.__j04RetainedCopy=event=>{const field=event.target;window.__j04RetainedCopied.push(field instanceof HTMLTextAreaElement?field.value.slice(field.selectionStart,field.selectionEnd):String(getSelection()));};document.addEventListener('copy',window.__j04RetainedCopy,true);})()`);
  let failed = false;
  try { return await action(); }
  catch (error) { failed = true; throw error; }
  finally {
    try { await renderer.evaluate(`document.removeEventListener('copy',window.__j04RetainedCopy,true);delete window.__j04RetainedCopied;delete window.__j04RetainedCopy`); }
    catch (error) { if (!failed) throw journeyCheckFailure('J-04', 'retained-copy-observer-cleanup', { cause: error }); }
  }
}

/** The real retained-before-verification failure, then the standalone source's actual native controls. */
export async function checkRetainedFindingSources(io, dataRoot, codeRoot, runRoot, browserRecord) {
  const { renderer, waitFor, assertRenderer, requireJourney, press } = io;
  let phase = 'build';
  let fixture;
  try {
    const helper = resolve(runRoot, 'retained-review-fixture.mjs');
    await build({ entryPoints: [resolve(codeRoot, 'tests/support/retained-review-fixture.ts')], bundle: true,
      platform: 'node', format: 'esm', outfile: helper, logLevel: 'silent',
      banner: { js: "import { createRequire as createFixtureRequire } from 'node:module'; const require = createFixtureRequire(import.meta.url);" } });
    phase = 'directory';
    const inputRoot = resolve(runRoot, 'retained-review-input'); await mkdir(inputRoot);
    phase = 'import-module';
    const { seedRetainedReviewFallback } = await import(pathToFileURL(helper).href);
    fixture = await seedRetainedReviewFallback({ codeRoot, dataRoot, inputRoot }, undefined, value => { phase = value; });
    requireJourney(fixture.retainedBeforeFailure === 3 && fixture.verificationResults === 0, 'retained-source-write-order');
    phase = 'read-mode';
    const original = await renderer.evaluate(`document.documentElement.dataset.technicalLayerVisible==='true'`);
    const card = `article.review-finding[data-finding-id=${JSON.stringify(fixture.findingId)}]`;
    for (const developer of [false, true]) {
      const mode = developer ? 'developer' : 'ordinary';
      phase = 'set-mode';
      await setDeveloperMode(renderer, waitFor, developer, `retained-source-${mode}`, press);
      phase = 'open-library';
      await press(renderer, SIDEBAR.destination('library'), `retained-source-${mode}-library`);
      await waitFor(renderer, `document.querySelector('button[data-book-id=${JSON.stringify(fixture.bookId)}]')`, `retained-source-${mode}-book-ready`);
      phase = 'open-book';
      await press(renderer, `button[data-book-id=${JSON.stringify(fixture.bookId)}]`, `retained-source-${mode}-book`);
      await waitFor(renderer, `document.querySelector('.editor-shell[data-book-id=${JSON.stringify(fixture.bookId)}]')`, `retained-source-${mode}-editor`);
      phase = 'open-review';
      await press(renderer, SIDEBAR.section('review'), `retained-source-${mode}-review`);
      phase = 'check-rows';
      await waitFor(renderer, `document.querySelector(${JSON.stringify(card)})?.querySelectorAll('.finding-evidence-source').length===3`, `retained-source-${mode}-rows`);
      await assertRenderer(renderer, `document.querySelector(${JSON.stringify(card)}).closest('.fact-lens')===null`, `retained-source-${mode}-standalone`);
      await assertRenderer(renderer, `window.ai7.inspectFactualVerification(${JSON.stringify({ bookId: fixture.bookId, reviewRunId: fixture.reviewRunId,
        after: null, chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null })}).then(p=>p.results.length===0)`, `retained-source-${mode}-no-verification`);
      phase = 'copy-observer';
      await withRetainedCopyObserver(renderer, async () => {
        for (const [index, source] of fixture.sources.entries()) {
          const row = `${card} [data-evidence-id=${JSON.stringify(source.evidenceId)}]`;
          phase = 'check-source';
          await assertRenderer(renderer, `(() => { const row=document.querySelector(${JSON.stringify(row)}); return row.querySelector('.review-finding-source')?.textContent.startsWith('来源：') && row.querySelector('.source-link-domain')?.textContent===${JSON.stringify(new URL(source.address).host)} && row.querySelector('.research-evidence-url')?.textContent===${JSON.stringify(developer ? source.address : '')}; })()`, `retained-source-${mode}-${index}-words`);
          phase = 'read-opener';
          const before = await browserRecord();
          phase = 'press-open';
          await press(renderer, `${row} [data-source-action="open-in-browser"]`, `retained-source-${mode}-${index}-open`);
          phase = 'check-open';
          await waitFor(renderer, `document.querySelector(${JSON.stringify(row + ' .source-link-status')})?.textContent==='已在浏览器中打开。'`, `retained-source-${mode}-${index}-opened`);
          requireJourney(await browserRecord() === `${before}${source.address}\n`, `retained-source-${mode}-${index}-exact-open`);
          phase = 'press-copy';
          await press(renderer, `${row} [data-source-action="copy-link"]`, `retained-source-${mode}-${index}-copy`);
          phase = 'check-copy';
          await waitFor(renderer, `document.querySelector(${JSON.stringify(row + ' .source-link-status')})?.textContent==='已复制链接。'`, `retained-source-${mode}-${index}-copied`);
        }
        requireJourney(JSON.stringify(await renderer.evaluate('window.__j04RetainedCopied')) === JSON.stringify(fixture.sources.map(source => source.address)), `retained-source-${mode}-exact-copy`);
      });
    }
    phase = 'restore-mode';
    if (!original) await setDeveloperMode(renderer, waitFor, false, 'retained-source-restore-mode', press);
  } catch (error) {
    if (journeyCheckLabel(error) !== null) throw error;
    throw journeyCheckFailure('J-04', retainedFixtureFailureCheck(phase, error), { cause: error });
  }
}
