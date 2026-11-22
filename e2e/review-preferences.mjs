import { pointerClick } from './dispatch-chooser.mjs';
import { pressEscape, buttonRowsAtOneEdge } from './ordinary-pages.mjs';
import { SIDEBAR } from './controller.mjs';

// Issue #1684, J-12: lifecycle actions through both ordinary entries.
export async function reviewPreferenceLifecycle(renderer, waitFor, requireJourney, itemId) {
  const row = `[data-review-preference="${itemId}"]`;
  const press = inWindowPress(renderer, waitFor);
  const button = async (label) => {
    const selector=`${row} button[data-lifecycle-target]`;
    await renderer.evaluate(`(() => {document.querySelectorAll('[data-lifecycle-target]').forEach(n=>n.removeAttribute('data-lifecycle-target'));const n=Array.from(document.querySelector(${JSON.stringify(row)})?.querySelectorAll('button')??[]).find(n=>n.textContent===${JSON.stringify(label)});if(n)n.dataset.lifecycleTarget='';})()`);
    return selector;
  };
  await waitFor(renderer,`document.querySelector('[data-disabled-preferences] ${row}')!==null`,'lifecycle-stopped-group');
  await press(await button('重新启用'),'lifecycle-reenable');
  await waitFor(renderer,`document.querySelector('[data-memory-preferences] ${row}')!==null`,'lifecycle-enabled-group');
  requireJourney((await renderer.evaluate(`window.ai7.inspectGlobalAgent().then(p=>p.items.some(i=>i.itemId===${JSON.stringify(itemId)}&&i.state==='active'))`))===true,'lifecycle-service-active');
  await press(await button('停用'),'lifecycle-stop-again');
  await waitFor(renderer,`document.querySelector('[data-disabled-preferences] ${row}')!==null`,'lifecycle-disabled-again');
  await press(SIDEBAR.destination('knowledge'),'lifecycle-knowledge');
  await waitFor(renderer,`document.querySelector('[data-knowledge-category="memory"]')!==null`,'lifecycle-knowledge-home');
  await press('[data-knowledge-category="memory"]','lifecycle-memory-entry');
  await waitFor(renderer,`document.querySelector('[data-disabled-preferences] ${row}')!==null`,'lifecycle-knowledge-parity');
  await press(await button('删除…'),'lifecycle-delete-open');
  await waitFor(renderer,`document.activeElement?.textContent==='取消'`,'lifecycle-cancel-focus');
  await pressEscape(renderer);
  await waitFor(renderer,`!document.querySelector('.review-preference-confirm')&&document.activeElement?.textContent==='删除…'`,'lifecycle-escape');
  await press(await button('删除…'),'lifecycle-delete-reopen');
  await waitFor(renderer,buttonRowsAtOneEdge('.review-preference-confirm'),'lifecycle-confirm-buttons');
  await press(await button('确认删除'),'lifecycle-delete-confirm');
  await waitFor(renderer,`document.querySelector(${JSON.stringify(row)})===null`,'lifecycle-deleted-knowledge');
  await press(SIDEBAR.destination('quality'),'lifecycle-quality');
  await waitFor(renderer,`document.querySelector('[data-editorial-memory]')!==null&&document.querySelector(${JSON.stringify(row)})===null`,'lifecycle-deleted-quality');
  requireJourney((await renderer.evaluate(`window.ai7.inspectGlobalAgent().then(p=>!p.items.some(i=>i.itemId===${JSON.stringify(itemId)}))`))===true,'lifecycle-deleted-service');
}

export function inWindowPress(renderer, waitFor) {
  const visible = (selector) => `(() => {
    const node=document.querySelector(${JSON.stringify(selector)}); if(!node)return false;
    const r=node.getBoundingClientRect();
    if(r.width<=0||r.height<=0||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight||!node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))return false;
    for(let parent=node.parentElement;parent;parent=parent.parentElement){
      if(/auto|scroll|hidden/.test(getComputedStyle(parent).overflowY)) { const box=parent.getBoundingClientRect(); if(r.top<box.top||r.bottom>box.bottom)return false; }
    }
    return true;
  })()`;
  return async (selector, name) => {
    // Reach the row by real wheel events, then prove reachability before pointerClick can scroll it.
    for(let attempt=0;attempt<12 && (await renderer.evaluate(visible(selector)))!==true;attempt++) {
      const direction=await renderer.evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r&&r.top<120?-220:220;})()`);
      const point=await renderer.evaluate('({x:innerWidth*.65,y:innerHeight*.65})');
      await renderer.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:direction});
      await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    }
    await waitFor(renderer,visible(selector),`${name}-in-window`);
    await pointerClick(renderer,waitFor,selector,name);
  };
}
