import { pointerClick } from './dispatch-chooser.mjs';

/** Choose through the actual product control; never assign a select's value from script. */
export async function chooseLaunchOption(renderer, waitFor, selector, value, name) {
  const index = await renderer.evaluate(`Array.from(document.querySelector(${JSON.stringify(selector)}).options).findIndex(option=>option.value===${JSON.stringify(value)})`);
  if (index < 0) throw new Error('launch-option-unavailable');
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

/** Inspect this surface's current choices at both sizes, then start with one real click. */
export async function launchTaskFromBar(renderer, waitFor, name, viewport, previewContains = []) {
  const id = await renderer.evaluate(`(() => {
    const active = Array.from(document.querySelectorAll('[data-task-launch-kind]')).filter(node=>node.getClientRects().length>0);
    return (active.find(node=>node.querySelector('.task-launch-estimate[open]')) ?? active.find(node=>node.id==='task-drawer') ?? active[0])?.id;
  })()`);
  if (!id) throw new Error('launch-surface-missing');
  const root = `#${id}`;
  await waitFor(renderer, `document.querySelector(${JSON.stringify(root + ' [data-task-drawer-control="launch"]')})?.disabled===false`, `${name}-launch-ready`);
  try {
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const options = `${root} .task-launch-options`;
      if (!(await renderer.evaluate(`document.querySelector(${JSON.stringify(options)})?.open===true`))) await pointerClick(renderer, waitFor, `${options} > summary`, `${name}-options-${width}`);
      const retry = `${root} [data-task-launch-option="retry"]`;
      const original = await renderer.evaluate(`document.querySelector(${JSON.stringify(retry)}).value`);
      for (const value of [original === 'never' ? 'auto' : 'never', original]) await chooseLaunchOption(renderer, waitFor, retry, value, `${name}-retry-${value}-${width}`);
      await pointerClick(renderer, waitFor, `${options} > summary`, `${name}-options-close-${width}`);
      const estimate = `${root} .task-launch-estimate`;
      if (!(await renderer.evaluate(`document.querySelector(${JSON.stringify(estimate)})?.open===true`))) await pointerClick(renderer, waitFor, `${estimate} > summary`, `${name}-preview-${width}`);
      else await pointerClick(renderer, waitFor, `${root} [data-task-drawer-control="preview-launch"]`, `${name}-refresh-preview-${width}`);
      await waitFor(renderer, `document.querySelector(${JSON.stringify(estimate + ' ol')})?.children.length>0`, `${name}-preview-current-${width}`);
      for (const text of previewContains) {
        if (!(await renderer.evaluate(`document.querySelector(${JSON.stringify(estimate)})?.textContent.includes(${JSON.stringify(text)})`))) throw new Error(`${name}-preview-missing-disclosure-${width}`);
      }
      const reachable = await renderer.evaluate(`(() => {
        const surface=document.querySelector(${JSON.stringify(root)}),panel=surface.querySelector('.task-launch-estimate .task-launch-popover');
        const r=panel.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth;
      })()`);
      if (reachable !== true) throw new Error(`task-launch-bar-unreachable-${width}x${height}`);
      await pointerClick(renderer, waitFor, `${estimate} > summary`, `${name}-preview-close-${width}`);
    }
  } finally {
    if (viewport === undefined) await renderer.send('Emulation.clearDeviceMetricsOverride');
    else await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  }
  await pointerClick(renderer, waitFor, `${root} [data-task-drawer-control="launch"]`, `${name}-start`);
  await waitFor(renderer, `(document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' && !!document.querySelector('#task-drawer')?.dataset.taskPlanRef) || !!document.querySelector(${JSON.stringify(root + ' .task-bar-refusal')})?.textContent`, `${name}-launched`, 120_000);
  const refusal = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' ? '' : document.querySelector(${JSON.stringify(root + ' .task-bar-refusal')})?.textContent??''`);
  if (refusal) throw new Error('task-launch-refused');
  return renderer.evaluate(`document.querySelector('#task-drawer').dataset.taskPlanRef`);
}
