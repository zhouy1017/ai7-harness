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
  const reenable = await button('重新启用');
  await inWindowPress(renderer, waitFor, true)(reenable, 'lifecycle-reenable-focus');
  const beforeReenable = await renderer.evaluate('window.ai7.inspectGlobalAgent().then(p=>p.directives.length)');
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter });
  await waitFor(renderer,`document.querySelector('[data-memory-preferences] ${row}')!==null`,'lifecycle-enabled-group');
  requireJourney((await renderer.evaluate(`window.ai7.inspectGlobalAgent().then(p=>p.items.some(i=>i.itemId===${JSON.stringify(itemId)}&&i.state==='active'))`))===true,'lifecycle-service-active');
  for (let repeat=0;repeat<8;repeat++) await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, autoRepeat: true });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...enter });
  await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  requireJourney((await renderer.evaluate(`window.ai7.inspectGlobalAgent().then(p=>p.directives.length===${beforeReenable + 1}&&p.items.some(i=>i.itemId===${JSON.stringify(itemId)}&&i.state==='active'))`))===true,'lifecycle-held-enter-once');
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
  await waitFor(renderer,`(() => {
    const root=document.querySelector(${JSON.stringify(row)}), strip=root?.querySelector('.review-preference-confirm');
    const sentence=root?.querySelector(':scope > p'), confirm=Array.from(strip?.querySelectorAll('button')??[]).find(n=>n.textContent==='确认删除');
    if(!sentence||!strip||!confirm)return false;
    const text=sentence.getBoundingClientRect(), box=strip.getBoundingClientRect(), r=confirm.getBoundingClientRect(), outer=root.getBoundingClientRect();
    return text.width>outer.width*.45&&box.width>outer.width*.8&&getComputedStyle(strip).borderTopStyle==='solid'&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&confirm.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
  })()`,'lifecycle-open-strip-layout');
  await press(await button('确认删除'),'lifecycle-delete-confirm');
  await waitFor(renderer,`document.querySelector(${JSON.stringify(row)})===null`,'lifecycle-deleted-knowledge');
  await press(SIDEBAR.destination('quality'),'lifecycle-quality');
  await waitFor(renderer,`document.querySelector('[data-screen="quality-learning"] [data-memory-preferences]')!==null&&document.querySelector('[data-screen="quality-learning"] [data-editorial-memory] ${row}')===null`,'lifecycle-deleted-quality');
  requireJourney((await renderer.evaluate(`(async () => {const [global,learning]=await Promise.all([window.ai7.inspectGlobalAgent(),window.ai7.inspectEditorialLearning({signalOffset:0,itemOffset:0})]);return !global.items.some(i=>i.itemId===${JSON.stringify(itemId)})&&!learning.items.some(i=>i.current.itemId===${JSON.stringify(itemId)});})()`))===true,'lifecycle-deleted-service');
  requireJourney((await renderer.evaluate(`window.ai7.inspectGlobalAgent().then(p=>p.directives.length===${beforeReenable + 3})`))===true,'lifecycle-directive-count');
}

export function inWindowPress(renderer, waitFor, focusOnly = false) {
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
    if (focusOnly) {
      // Tab reaches the already-visible action without activating it.
      for(let step=0;step<60&&(await renderer.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`))!==true;step++) {
        await renderer.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        await renderer.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      }
      await waitFor(renderer,`document.activeElement===document.querySelector(${JSON.stringify(selector)})`,`${name}-focused`);
    } else await pointerClick(renderer,waitFor,selector,name);
  };
}
