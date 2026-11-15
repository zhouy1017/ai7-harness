/** Start through the ordinary product bar. Opening its estimate never creates or authorizes a prepared task. */
export async function launchTaskFromBar(renderer, waitFor, name, viewport) {
  await waitFor(renderer, `document.querySelector('#task-drawer [data-task-drawer-control="launch"]')?.disabled===false`, `${name}-launch-ready`);
  try {
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await renderer.evaluate(`(async () => { const drawer=document.querySelector('#task-drawer');drawer.getBoundingClientRect();
        await Promise.all(drawer.getAnimations().map(animation=>animation.finished.catch(()=>undefined))); })()`);
      const reachable = await renderer.evaluate(`(() => {
        const drawer=document.querySelector('#task-drawer'), button=drawer.querySelector('[data-task-drawer-control="launch"]'), chooser=drawer.querySelector('.dispatch-chooser');
        const bounds=button.getBoundingClientRect();
        if(bounds.left<0||bounds.top<0||bounds.right>innerWidth||bounds.bottom>innerHeight||!chooser)return false;
        chooser.querySelector('summary').focus();
        const focused=document.activeElement===chooser.querySelector('summary');
        const estimate=drawer.querySelector('.task-launch-estimate');estimate.open=true;
        return focused&&!button.disabled;
      })()`);
      if (reachable !== true) throw new Error(`task-launch-bar-unreachable-${width}x${height}`);
    }
  } finally {
    if (viewport === undefined) await renderer.send('Emulation.clearDeviceMetricsOverride');
    else await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  }
  const started = await renderer.evaluate(`(() => {const button=document.querySelector('#task-drawer [data-task-drawer-control="launch"]');if(!button||button.disabled)return false;button.click();return true;})()`);
  if (started !== true) throw new Error('task-launch-button-unavailable');
  await waitFor(renderer, `(document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' && !!document.querySelector('#task-drawer')?.dataset.taskPlanRef) || !!document.querySelector('#task-drawer .task-bar-refusal')?.textContent`, `${name}-launched`, 120_000);
  const refusal = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' ? '' : document.querySelector('#task-drawer .task-bar-refusal')?.textContent??''`);
  if (refusal) throw new Error(`task-launch-refused/${refusal}`);
  return renderer.evaluate(`document.querySelector('#task-drawer').dataset.taskPlanRef`);
}
