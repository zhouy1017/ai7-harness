import { pointerClick } from './dispatch-chooser.mjs';

/** Start through the ordinary product bar. Opening its estimate never creates or authorizes a prepared task. */
export async function launchTaskFromBar(renderer, waitFor, name, viewport, previewContains = []) {
  await waitFor(renderer, `document.querySelector('#task-drawer [data-task-drawer-control="launch"]')?.disabled===false`, `${name}-launch-ready`);
  try {
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await renderer.evaluate(`(async () => { const drawer=document.querySelector('#task-drawer');drawer.getBoundingClientRect();
        await Promise.all(drawer.getAnimations().map(animation=>animation.finished.catch(()=>undefined))); })()`);
      const reachable = await renderer.evaluate(`(() => {
        const drawer=document.querySelector('#task-drawer'), button=drawer.querySelector('[data-task-drawer-control="launch"]'), chooser=drawer.querySelector('.dispatch-chooser');
        if(getComputedStyle(drawer.querySelector('.task-drawer-modes')).display!=='none'||getComputedStyle(drawer.querySelector('.task-drawer-pill')).display!=='none'||!drawer.querySelector('.task-drawer-footer').hidden)return false;
        const bounds=button.getBoundingClientRect();
        if(bounds.left<0||bounds.top<0||bounds.right>innerWidth||bounds.bottom>innerHeight||!chooser)return false;
        chooser.querySelector('summary').focus();
        const focused=document.activeElement===chooser.querySelector('summary');
        if(drawer.dataset.taskLaunchKind==='custom-analysis') {
          drawer.querySelector('.task-launch-options').open=true;
          const retry=drawer.querySelector('[data-task-launch-option="retry"]'),focus=retry.nextElementSibling?.matches('.ui-select-trigger')?retry.nextElementSibling:retry;
          focus.scrollIntoView({block:'center',behavior:'instant'});focus.focus({preventScroll:true});
          const rect=focus.getBoundingClientRect();
          if(document.activeElement!==focus||rect.left<0||rect.right>innerWidth||rect.top<0||rect.bottom>innerHeight||Array.from(retry.options,option=>option.value).join('|')!=='auto|never')return false;
        }
        return focused&&!button.disabled;
      })()`);
      if (reachable !== true) throw new Error(`task-launch-bar-unreachable-${width}x${height}`);
      if (!(await renderer.evaluate(`document.querySelector('#task-drawer .task-launch-estimate')?.open===true`))) {
        await pointerClick(renderer, waitFor, '#task-drawer .task-launch-estimate > summary', `${name}-preview-${width}`);
      } else await pointerClick(renderer, waitFor, '#task-drawer [data-task-drawer-control="preview-launch"]', `${name}-refresh-preview-${width}`);
      await waitFor(renderer, `document.querySelector('#task-drawer .task-launch-estimate ol')?.children.length>0 && document.querySelector('#task-drawer .task-launch-estimate')?.textContent.includes('阅读范围')`, `${name}-preview-current-${width}`);
      for (const text of previewContains) {
        if (!(await renderer.evaluate(`document.querySelector('#task-drawer .task-launch-estimate')?.textContent.includes(${JSON.stringify(text)})`))) throw new Error(`${name}-preview-missing-disclosure-${width}/${text}`);
      }
    }
  } finally {
    if (viewport === undefined) await renderer.send('Emulation.clearDeviceMetricsOverride');
    else await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  }
  await renderer.evaluate(`(async () => {const drawer=document.querySelector('#task-drawer');drawer.getBoundingClientRect();await Promise.all(drawer.getAnimations().map(animation=>animation.finished.catch(()=>undefined)));})()`);
  await pointerClick(renderer, waitFor, '#task-drawer [data-task-drawer-control="launch"]', `${name}-start`);
  await waitFor(renderer, `(document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' && !!document.querySelector('#task-drawer')?.dataset.taskPlanRef) || !!document.querySelector('#task-drawer .task-bar-refusal')?.textContent`, `${name}-launched`, 120_000);
  const refusal = await renderer.evaluate(`document.querySelector('#task-drawer')?.dataset.taskPlanStart==='started' ? '' : document.querySelector('#task-drawer .task-bar-refusal')?.textContent??''`);
  if (refusal) throw new Error(`task-launch-refused/${refusal}`);
  return renderer.evaluate(`document.querySelector('#task-drawer').dataset.taskPlanRef`);
}
