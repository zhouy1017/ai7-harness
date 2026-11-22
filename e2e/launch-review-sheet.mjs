import { capturePointerFailure, pointerClick } from './dispatch-chooser.mjs';
import { popoverShownInside } from './launch-task-bar.mjs';

function reviewControlGeometry(selector, containerSelector) {
  const node = document.querySelector(selector);
  const container = containerSelector ? node?.closest(containerSelector) : document.scrollingElement;
  if (!node || !container) return null;
  const bounds = container.getBoundingClientRect(), rect = node.getBoundingClientRect();
  const page = container === document.scrollingElement;
  const left = page ? 0 : Math.max(0, bounds.left + container.clientLeft);
  const top = page ? 0 : Math.max(0, bounds.top + container.clientTop);
  const right = page ? container.clientWidth : Math.min(innerWidth, bounds.left + container.clientLeft + container.clientWidth);
  const bottom = page ? container.clientHeight : Math.min(innerHeight, bounds.top + container.clientTop + container.clientHeight);
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const ready = rect.width > 0 && rect.height > 0 && rect.left >= left - 0.5 && rect.right <= right + 0.5 &&
    rect.top >= top - 0.5 && rect.bottom <= bottom + 0.5 && node.contains(document.elementFromPoint(x, y));
  return { ready, x: Math.min(right - 1, Math.max(left + 1, x)), y, wheelY: (top + bottom) / 2 };
}

export async function pressReviewControl(renderer, waitFor, selector, name, container, { wheel = false, rest = false, reachable = `${name}-reachable` } = {}) {
  const geometry = `(${reviewControlGeometry.toString()})(${JSON.stringify(selector)},${JSON.stringify(container)})`;
  if (wheel) {
    const deadline = Date.now() + 10_000;
    const nextPaint = 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';
    while (Date.now() < deadline) {
      const point = await renderer.evaluate(geometry);
      if (point?.ready) {
        if (rest) await renderer.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0 });
        await renderer.evaluate(nextPaint);
        const after = await renderer.evaluate(geometry);
        if (after?.ready && after.x === point.x && after.y === point.y) break;
      } else {
        if (point && Math.abs(point.y - point.wheelY) >= 1) {
          await renderer.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x, y: point.wheelY, deltaX: 0, deltaY: Math.round(point.y - point.wheelY) });
        }
        await renderer.evaluate(nextPaint);
      }
    }
  }
  try {
    await waitFor(renderer, `${geometry}?.ready===true`, reachable);
  } catch (error) {
    if (error instanceof Error) Object.defineProperty(error, 'pointerFailure', { value: await capturePointerFailure(renderer, selector, { includeTargetAncestors: true }), configurable: true });
    throw error;
  }
  await pointerClick(renderer, waitFor, selector, name, {rest, scroll:false});
}

/** Start exactly as the editor does, then open the resulting run's read-only plan. */
export async function launchReviewFromSheet(renderer, waitFor, viewport) {
  await waitFor(renderer, `document.querySelector('dialog.review-sheet [data-review-action="start"]')?.disabled === false`, 'review-sheet-launch-ready');
  try {
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await pressReviewControl(renderer, waitFor, 'dialog.review-sheet .task-launch-estimate > summary', `review-plan-${width}`, '.sheet-foot');
      // The estimate is shown once computed; a local-only review has no model call to estimate, so its line may be empty.
      await waitFor(renderer, `document.querySelector('dialog.review-sheet .review-estimate')?.hidden===false`, `review-estimate-${width}`);
      await waitFor(renderer, `!!document.querySelector('dialog.review-sheet .task-launch-estimate .review-consequences') && ${popoverShownInside(`document.querySelector('dialog.review-sheet .task-launch-estimate .task-launch-popover')`)}`, `review-plan-reachable-${width}`);
      await pressReviewControl(renderer, waitFor, 'dialog.review-sheet .task-launch-estimate > summary', `review-plan-close-${width}`, '.sheet-foot');
    }
  } finally {
    if (viewport === undefined) await renderer.send('Emulation.clearDeviceMetricsOverride');
    else await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  }
  await pressReviewControl(renderer, waitFor, 'dialog.review-sheet [data-review-action="start"]', 'review-sheet-start', '.sheet-foot');
  await waitFor(renderer, `!!document.querySelector('dialog.review-sheet[open] .review-sheet-problem')?.textContent || (document.querySelector('dialog.review-sheet')?.open !== true && !!document.querySelector('.review-workspace-card') && document.querySelector('.review-workspace-card').dataset.reviewState !== 'prepared' && document.querySelector('[data-review-action="view-plan"]')?.disabled === false)`, 'review-sheet-launched', 120_000);
  const refusal = await renderer.evaluate(`document.querySelector('dialog.review-sheet[open] .review-sheet-problem')?.textContent ?? ''`);
  if (refusal) {
    process.stderr.write(`REVIEW_SHEET_LAUNCH_REFUSED/${refusal}\n`);
    throw new Error('REVIEW_SHEET_LAUNCH_REFUSED');
  }
  const runId = await renderer.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(workspace=>workspace.run?.reviewRunId)`);
  if (typeof runId !== 'string') throw new Error('REVIEW_SHEET_RUN_MISSING');
  // The running review draws its card again as findings arrive above 查看计划; the pointer rests on it, then presses once.
  await pressReviewControl(renderer, waitFor, '[data-review-action="view-plan"]', 'review-sheet-view-plan', null, { wheel: true, rest: true });
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
