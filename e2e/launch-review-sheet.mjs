import { pointerClick } from './dispatch-chooser.mjs';
import { popoverShownInside } from './launch-task-bar.mjs';

/** Start exactly as the editor does, then open the resulting run's read-only plan. */
export async function launchReviewFromSheet(renderer, waitFor, viewport) {
  await waitFor(renderer, `document.querySelector('dialog.review-sheet [data-review-action="start"]')?.disabled === false`, 'review-sheet-launch-ready');
  try {
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await pointerClick(renderer, waitFor, 'dialog.review-sheet .task-launch-estimate > summary', `review-plan-${width}`);
      // The estimate is shown once computed; a local-only review has no model call to estimate, so its line may be empty.
      await waitFor(renderer, `document.querySelector('dialog.review-sheet .review-estimate')?.hidden===false`, `review-estimate-${width}`);
      await waitFor(renderer, `!!document.querySelector('dialog.review-sheet .task-launch-estimate .review-consequences') && ${popoverShownInside(`document.querySelector('dialog.review-sheet .task-launch-estimate .task-launch-popover')`)}`, `review-plan-reachable-${width}`);
      await pointerClick(renderer, waitFor, 'dialog.review-sheet .task-launch-estimate > summary', `review-plan-close-${width}`);
    }
  } finally {
    if (viewport === undefined) await renderer.send('Emulation.clearDeviceMetricsOverride');
    else await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  }
  await pointerClick(renderer, waitFor, 'dialog.review-sheet [data-review-action="start"]', 'review-sheet-start');
  await waitFor(renderer, `!!document.querySelector('dialog.review-sheet[open] .review-sheet-problem')?.textContent || (document.querySelector('dialog.review-sheet')?.open !== true && !!document.querySelector('.review-workspace-card') && document.querySelector('.review-workspace-card').dataset.reviewState !== 'prepared' && document.querySelector('[data-review-action="view-plan"]')?.disabled === false)`, 'review-sheet-launched', 120_000);
  const refusal = await renderer.evaluate(`document.querySelector('dialog.review-sheet[open] .review-sheet-problem')?.textContent ?? ''`);
  if (refusal) {
    process.stderr.write(`REVIEW_SHEET_LAUNCH_REFUSED/${refusal}\n`);
    throw new Error('REVIEW_SHEET_LAUNCH_REFUSED');
  }
  const runId = await renderer.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(workspace=>workspace.run?.reviewRunId)`);
  if (typeof runId !== 'string') throw new Error('REVIEW_SHEET_RUN_MISSING');
  // The running review draws its card again as findings arrive above 查看计划; the pointer rests on it, then presses once.
  await pointerClick(renderer, waitFor, '[data-review-action="view-plan"]', 'review-sheet-view-plan', { rest: true });
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef === ${JSON.stringify(runId)}`, 'review-sheet-run-plan');
  if (await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanState==='waiting'`)) {
    try {
      for(const [width,height] of [[1280,800],[1008,681]]) {
        await renderer.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        const reachable=await renderer.evaluate(`(() => {const button=document.querySelector('#task-drawer [data-task-drawer-control="cancel-wait"]');if(!button||button.disabled)return false;button.scrollIntoView({block:'nearest'});button.focus();const box=button.getBoundingClientRect();return document.activeElement===button&&box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight;})()`);
        if(reachable!==true)throw new Error('REVIEW_WAITING_CANCEL_OUTSIDE_VIEWPORT');
      }
    } finally {
      if(viewport===undefined)await renderer.send('Emulation.clearDeviceMetricsOverride');
      else await renderer.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
    }
  }
  return runId;
}
