/** Start exactly as the editor does, then open the resulting run's read-only plan. */
export async function launchReviewFromSheet(renderer, waitFor, viewport) {
  await waitFor(renderer, `document.querySelector('dialog.review-sheet [data-review-action="start"]')?.disabled === false`, 'review-sheet-launch-ready');
  try {
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const reachable = await renderer.evaluate(`(() => { const sheet=document.querySelector('dialog.review-sheet'), start=sheet.querySelector('[data-review-action="start"]'), chooser=sheet.querySelector('.dispatch-chooser');const bounds=start.getBoundingClientRect();if(bounds.left<0||bounds.right>innerWidth||bounds.top<0||bounds.bottom>innerHeight||!chooser)return false;chooser.open=true;chooser.querySelector('summary').focus();const focused=document.activeElement===chooser.querySelector('summary');chooser.open=false;return focused; })()`);
      if (reachable !== true) throw new Error('REVIEW_SHEET_START_OUTSIDE_VIEWPORT');
    }
  } finally {
    if (viewport === undefined) await renderer.send('Emulation.clearDeviceMetricsOverride');
    else await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  }
  const started = await renderer.evaluate(`(() => { const button=document.querySelector('dialog.review-sheet [data-review-action="start"]'); if(!button||button.disabled)return false; button.click(); return true; })()`);
  if (started !== true) throw new Error('REVIEW_SHEET_START_UNAVAILABLE');
  await waitFor(renderer, `document.querySelector('dialog.review-sheet')?.open !== true && !!document.querySelector('.review-workspace-card') && document.querySelector('.review-workspace-card').dataset.reviewState !== 'prepared' && document.querySelector('[data-review-action="view-plan"]')?.disabled === false`, 'review-sheet-launched', 120_000);
  const runId = await renderer.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(workspace=>workspace.run?.reviewRunId)`);
  if (typeof runId !== 'string') throw new Error('REVIEW_SHEET_RUN_MISSING');
  await renderer.evaluate(`(() => { const button=document.querySelector('[data-review-action="view-plan"]'); if(!button||button.disabled)return false;button.click();return true; })()`);
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef === ${JSON.stringify(runId)}`, 'review-sheet-run-plan');
  return runId;
}
