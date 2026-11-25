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
      // The computed estimate replaces the cost row's rough call count; local-only reviews say no model is called.
      await waitFor(renderer, `/^(?:预计.+；(?:用时暂无可靠估计|按最近同类任务，.+)|只在本机检查，不调用模型)。$/u.test(document.querySelector('dialog.review-sheet .review-consequences [data-consequence="cost"]')?.textContent ?? '')`, `review-estimate-${width}`);
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
  // 查看计划 stands in the Run's own header (#1706): the running review draws its summary, findings and progress again below it, so
  // nothing a poll brings moves it. Real geometry says so before the press; the pointer rests on it, then presses once.
  const viewPlan = '.review-run-heading > [data-review-action="view-plan"]';
  await waitFor(renderer, `(() => {const button=document.querySelector(${JSON.stringify(viewPlan)});if(!button||document.querySelectorAll('[data-review-action="view-plan"]').length!==1)return false;
    const bottom=button.getBoundingClientRect().bottom;let below=0;
    for(let node=button.parentElement.nextElementSibling;node;node=node.nextElementSibling){const box=node.getBoundingClientRect();if(box.height===0)continue;below+=1;if(box.top<bottom-.5)return false;}
    return below>0;})()`, 'review-sheet-view-plan-in-header');
  await pressReviewControl(renderer, waitFor, viewPlan, 'review-sheet-view-plan', null, { wheel: true, rest: true });
  await waitFor(renderer, `document.querySelector('#task-drawer')?.dataset.taskPlanRef === ${JSON.stringify(runId)}`, 'review-sheet-run-plan');
  if (await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanState==='waiting'`)) {
    try {
      for(const [width,height] of [[1280,800],[1008,681]]) {
        await renderer.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        const reachable=await renderer.evaluate(`(() => {const button=document.querySelector('#task-drawer [data-task-drawer-control="cancel-wait"]');if(!button||button.disabled)return false;button.scrollIntoView({block:'nearest'});button.focus();const box=button.getBoundingClientRect();return button.textContent==='取消任务'&&document.activeElement===button&&box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight;})()`);
        if(reachable!==true)throw new Error('REVIEW_WAITING_CANCEL_OUTSIDE_VIEWPORT');
      }
    } finally {
      if(viewport===undefined)await renderer.send('Emulation.clearDeviceMetricsOverride');
      else await renderer.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
    }
  }
  return runId;
}


/** The real close/reopen sequence remains rapid; geometry is checked without waiting for the old close to settle. */
export async function checkReviewPlanReopening(renderer, waitFor) {
  const root = 'dialog.review-sheet .task-launch-estimate';
  const selector = `${root} > summary`;
  const geometry = `(${reviewControlGeometry.toString()})(${JSON.stringify(selector)},'.sheet-foot')`;
  const open = `document.querySelector(${JSON.stringify(root)})?.open===true && ${popoverShownInside(`document.querySelector('${root} .task-launch-popover')`)}`;
  const closed = `document.querySelector(${JSON.stringify(root)})?.open===false && !document.querySelector('${root} .task-launch-popover')?.matches(':popover-open')`;
  await waitFor(renderer, `document.querySelector('dialog.review-sheet [data-review-action="start"]')?.disabled===false`, 'review-reopen-ready');
  await pressReviewControl(renderer, waitFor, selector, 'review-reopen-initial', '.sheet-foot');
  await waitFor(renderer, open, 'review-reopen-initial-open');
  for (const leg of ['close', 'reopen']) {
    await waitFor(renderer, `${geometry}?.ready===true`, `review-rapid-${leg}-in-window`);
    const point = await renderer.evaluate(geometry);
    if (!point?.ready) await waitFor(renderer, 'false', `review-rapid-${leg}-point-moved`, 1);
    for (const type of ['mousePressed', 'mouseReleased']) await renderer.send('Input.dispatchMouseEvent', {
      type, x: point.x, y: point.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
    });
    if (leg === 'close') await waitFor(renderer, `document.querySelector('${root}')?.open===false`, 'review-rapid-close-state');
  }
  await waitFor(renderer, `new Promise(resolve=>{const shown=()=>(${open});const before=shown();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(before&&shown())));})`, 'review-rapid-reopened-stable');
  // A blank exposed point in the sheet header is outside the popover and activates no other control.
  const outside = `(() => {const header=document.querySelector('dialog.review-sheet .sheet-bar'),panel=document.querySelector('${root} .task-launch-popover');if(!header||!panel)return null;const r=header.getBoundingClientRect();
    for(const x of [r.left+8,r.right-8])for(const y of [r.top+8,r.bottom-8]){const hit=document.elementFromPoint(x,y);if(x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight&&header.contains(hit)&&!panel.contains(hit)&&!hit.closest('button,input,select,textarea,summary,a'))return {x,y};}return null;})()`;
  await waitFor(renderer, `${outside}!==null`, 'review-reopen-outside-point');
  const point = await renderer.evaluate(outside);
  if (point === null) await waitFor(renderer, 'false', 'review-reopen-outside-point-moved', 1);
  for (const type of ['mousePressed', 'mouseReleased']) await renderer.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await waitFor(renderer, closed, 'review-reopen-outside-closed');
  await pressReviewControl(renderer, waitFor, selector, 'review-keyboard-initial', '.sheet-foot');
  await waitFor(renderer, open, 'review-keyboard-initial-open');
  for (const [key, code, shown, leg] of [['Enter',13,false,'close'],['Enter',13,true,'open']]) {
    await waitFor(renderer, `${geometry}?.ready===true && document.querySelector('${root} > summary').contains(document.activeElement)`, `review-keyboard-${leg}-ready`);
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, ...(key === 'Enter' ? { text: '\r' } : {}) });
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
    await waitFor(renderer, shown ? open : closed, `review-keyboard-${leg}-state`);
  }
  for (let step = 0; step < 60 && await renderer.evaluate(`document.querySelector('${root}')?.open===true`); step++) {
    await renderer.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  }
  await waitFor(renderer, closed, 'review-keyboard-focus-leave-closed');
}
