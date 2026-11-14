import { SIDEBAR, sidebarNavigate } from './controller.mjs';

/** Explicit setup for retained queue/procedure/plan tests. Ordinary review starts use launchReviewRun. */
export async function prepareLegacyReviewPlan(renderer, waitFor) {
  const runId = await renderer.evaluate(`(async () => {
    const sheet=document.querySelector('dialog.review-sheet');
    const definition=sheet.querySelector('[data-procedure-definition]')?.dataset.procedureDefinition;
    const field=sheet.querySelector('.review-sheet-procedure');
    // A selected Procedure fixes its membership: its checked controls are intentionally disabled.
    const categoryIds=Array.from(sheet.querySelectorAll('input[name="review-category"]:checked'),input=>input)
      .filter(input=>definition||field?.dataset.procedureVersionId||!input.disabled).map(input=>input.value);
    const kind=sheet.querySelector('input[name="review-scope"]:checked').value;
    const scope={kind,fromChapterBlockId:kind==='chapters'?sheet.querySelector('[data-review-chapter="from"]').value:null,
      toChapterBlockId:kind==='chapters'?sheet.querySelector('[data-review-chapter="to"]').value:null};
    const input={categoryIds,scope};
    if(field?.dataset.procedureVersionId){
      const captured=await window.ai7.inspectCapturedProcedureRun({procedureId:field.dataset.procedureId,versionId:field.dataset.procedureVersionId});
      input.capturedProcedure={versionId:captured.resolved.versionId,documentSha256:captured.resolved.documentSha256};
    }
    if(definition){
      const at=definition.lastIndexOf('@'), id=definition.slice(0,at), version=Number(definition.slice(at+1));
      const library=await window.ai7.procedureLibrary({action:'inspect'});
      const entry=library.procedures.find(item=>item.procedureId===id);
      if(entry.documents.find(item=>item.version===version)?.members) input.procedureDefinition=entry.versions.find(item=>item.version===version);
    }
    if(categoryIds.includes('local-text-check')){
      const numerals=sheet.querySelector('[data-local-check-numerals]').value;
      const house=sheet.querySelector('[data-local-house-word-list]')?.checked
        ? (await window.ai7.inspectHouseWordList({versionId:null,entryOffset:0,historyOffset:0})).current : null;
      input.localCheck={punctuation:sheet.querySelector('[data-local-check-prose]').checked?'chinese-prose':'off',numerals,
        publication:sheet.querySelector('[data-local-check-publication]').value,numeralRules:numerals==='off'?[]:['N01','N02'],
        numeralsConfirmed:numerals!=='off',excludedRanges:[],doubledEllipsisBlockIds:[],tables:{
          characters:sheet.querySelector('[data-local-table="characters"]').checked,
          variantWords:sheet.querySelector('[data-local-table="variantWords"]').checked,houseWordList:house,
          bookTerms:Array.from(sheet.querySelectorAll('[data-book-term-row]'),row=>({kind:row.querySelector('select').value,
            preferred:row.querySelector('[data-book-term-field="preferred"]').value.trim(),
            variants:row.querySelector('[data-book-term-field="variants"]').value.split(/[、，,|]/u).map(value=>value.trim()).filter(Boolean)})).filter(row=>row.preferred||row.variants.length)}};
    }
    const series=sheet.querySelector('[data-review-field="series"]')?.value;
    if(series)input.seriesId=series;
    let job=await window.ai7.prepareReviewRun(input);
    while(job.state==='running'||job.state==='queued')job=await window.ai7.pollServiceJob({jobId:job.jobId});
    if(job.state!=='completed'||!job.result?.run)throw new Error('LEGACY_REVIEW_SETUP_FAILED');
    sheet.close();return job.result.run.reviewRunId;
  })()`);
  await renderer.evaluate(sidebarNavigate(SIDEBAR.section('manuscript')));
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]')`, 'legacy-review-setup-manuscript');
  await renderer.evaluate(sidebarNavigate(SIDEBAR.section('review')));
  await waitFor(renderer, `document.querySelector('[data-review-run-id="${runId}"]')`, 'legacy-review-setup-visible');
  await renderer.evaluate(`(() => { const open=document.querySelector('[data-review-run-id="${runId}"] [data-review-action="open-run"]'); if(open&&!open.disabled)open.click(); return true; })()`);
  await waitFor(renderer, `document.querySelector('[data-review-run-id="${runId}"][aria-current="true"]')`, 'legacy-review-setup-open');
  await renderer.evaluate(`document.querySelector('[data-review-action="view-plan"]').click()`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden===false`, 'legacy-review-setup-drawer');
}
