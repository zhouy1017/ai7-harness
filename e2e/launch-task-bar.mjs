import { pointerClick } from './dispatch-chooser.mjs';

/** Fail as the runner's own named check (its `waitFor` reports the code-only name), never as a bare Error without one. */
const failCheck = (renderer, waitFor, name) => waitFor(renderer, 'false', name, 1);

/** Choose through the actual product control; never assign a select's value from script. */
export async function chooseLaunchOption(renderer, waitFor, selector, value, name) {
  const index = await renderer.evaluate(`Array.from(document.querySelector(${JSON.stringify(selector)}).options).findIndex(option=>option.value===${JSON.stringify(value)})`);
  if (index < 0) await failCheck(renderer, waitFor, `${name}-option-unavailable`);
  const custom = await renderer.evaluate(`document.querySelector(${JSON.stringify(selector)})?.nextElementSibling?.matches('.ui-select-trigger')===true`);
  if (custom) {
    await pointerClick(renderer, waitFor, `${selector} + .ui-select-trigger`, `${name}-open`);
    await pointerClick(renderer, waitFor, `${selector} ~ .ui-select-popover .ui-select-option[data-index="${index}"]`, `${name}-choose`);
  } else {
    await pointerClick(renderer, waitFor, selector, `${name}-open`);
    for (const [key, code] of [['Home', 36], ...Array.from({ length: index }, () => ['ArrowDown', 40]), ['Enter', 13]]) {
      await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code });
      await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code });
    }
  }
  await waitFor(renderer, `document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`, `${name}-current`);
}

export async function openLaunchOptions(renderer, waitFor, root, name) {
  if (!(await renderer.evaluate(`document.querySelector(${JSON.stringify(root + ' .task-launch-options')})?.open===true`))) await pointerClick(renderer, waitFor, `${root} .task-launch-options > summary`, name);
}

export async function setLaunchBudget(renderer, waitFor, root, value, name) {
  await openLaunchOptions(renderer, waitFor, root, `${name}-options`);
  const selector = `${root} [data-task-launch-option="budget"]`;
  if (await renderer.evaluate(`document.querySelector(${JSON.stringify(selector)}) instanceof HTMLSelectElement`)) return chooseLaunchOption(renderer, waitFor, selector, value, name);
  await pointerClick(renderer, waitFor, selector, `${name}-field`);
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await renderer.send('Input.insertText', { text: value });
}

/** True when the bar's popover is shown, has a size, and lies inside the window (a closed popover has a zero rect). */
export function popoverShownInside(panelExpression) {
  return `(() => {const panel=${panelExpression};if(!panel||!panel.matches(':popover-open'))return false;const r=panel.getBoundingClientRect();
    return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth;})()`;
}

/**
 * Inspect this surface's current choices at both sizes, then start with one real click — on the bar's own start, or on
 * `startSelector` when the surface's own row starts through the bar (审稿意见's template rows).
 */
export async function launchTaskFromBar(renderer, waitFor, name, viewport, previewContains = [], startSelector = null) {
  // A surface may open its bar after an asynchronous read (the 任务 panel's 发起任务 opens the drawer's): wait for one shown.
  await waitFor(renderer, `Array.from(document.querySelectorAll('[data-task-launch-kind]')).some(node=>node.getClientRects().length>0)`, `${name}-launch-surface`);
  const id = await renderer.evaluate(`(() => {
    const active = Array.from(document.querySelectorAll('[data-task-launch-kind]')).filter(node=>node.getClientRects().length>0);
    return (active.find(node=>node.querySelector('.task-launch-estimate[open]')) ?? active.find(node=>node.id==='task-drawer') ?? active[0])?.id;
  })()`);
  if (!id) await failCheck(renderer, waitFor, `${name}-launch-surface-missing`);
  const root = `#${id}`;
  await waitFor(renderer, `document.querySelector(${JSON.stringify(root + ' [data-task-drawer-control="launch"]')})?.disabled===false`, `${name}-launch-ready`);
  try {
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const options = `${root} .task-launch-options`;
      if (!(await renderer.evaluate(`document.querySelector(${JSON.stringify(options)})?.open===true`))) await pointerClick(renderer, waitFor, `${options} > summary`, `${name}-options-${width}`);
      // The popover shows on the details' toggle task and is placed again once its content has a size: wait for both.
      await waitFor(renderer, popoverShownInside(`document.querySelector(${JSON.stringify(options + ' .task-launch-popover')})`), `${name}-options-reachable-${width}`);
      const retry = `${root} [data-task-launch-option="retry"]`;
      const original = await renderer.evaluate(`document.querySelector(${JSON.stringify(retry)}).value`);
      for (const value of [original === 'never' ? 'auto' : 'never', original]) await chooseLaunchOption(renderer, waitFor, retry, value, `${name}-retry-${value}-${width}`);
      await pointerClick(renderer, waitFor, `${options} > summary`, `${name}-options-close-${width}`);
      const estimate = `${root} .task-launch-estimate`;
      if (!(await renderer.evaluate(`document.querySelector(${JSON.stringify(estimate)})?.open===true`))) await pointerClick(renderer, waitFor, `${estimate} > summary`, `${name}-preview-${width}`);
      else await pointerClick(renderer, waitFor, `${root} [data-task-drawer-control="preview-launch"]`, `${name}-refresh-preview-${width}`);
      await waitFor(renderer, `document.querySelector(${JSON.stringify(estimate + ' ol')})?.children.length>0 && document.querySelector(${JSON.stringify(estimate)})?.textContent.includes('阅读范围')`, `${name}-preview-current-${width}`);
      for (const text of previewContains) {
        await waitFor(renderer, `document.querySelector(${JSON.stringify(estimate)})?.textContent.includes(${JSON.stringify(text)})===true`, `${name}-preview-missing-disclosure-${width}`, 5_000);
      }
      await waitFor(renderer, popoverShownInside(`document.querySelector(${JSON.stringify(estimate + ' .task-launch-popover')})`), `${name}-plan-reachable-${width}`);
      await pointerClick(renderer, waitFor, `${estimate} > summary`, `${name}-preview-close-${width}`);
    }
  } finally {
    if (viewport === undefined) await renderer.send('Emulation.clearDeviceMetricsOverride');
    else await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  }
  // A page bar leaves the drawer on whatever it showed (another Book's started Run, say): the launch is the drawer moving to a new ref.
  const before = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanRef ?? null`);
  await pointerClick(renderer, waitFor, startSelector ?? `${root} [data-task-drawer-control="launch"]`, `${name}-start`);
  await waitFor(renderer, `(() => { const drawer=document.querySelector('#task-drawer'); return drawer?.dataset.taskPlanStart==='started' && !!drawer.dataset.taskPlanRef && drawer.dataset.taskPlanRef!==${JSON.stringify(before)}; })() || !!document.querySelector(${JSON.stringify(root + ' .task-bar-refusal')})?.textContent`, `${name}-launched`, 120_000);
  const refusal = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' ? '' : document.querySelector(${JSON.stringify(root + ' .task-bar-refusal')})?.textContent??''`);
  if (refusal) await failCheck(renderer, waitFor, `${name}-launch-refused`);
  return renderer.evaluate(`document.querySelector('#task-drawer').dataset.taskPlanRef`);
}
