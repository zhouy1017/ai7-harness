import { pointerClick } from './dispatch-chooser.mjs';

const inside = (selector) => `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!node)return false; const r=node.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); if(!(r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&node.contains(hit)))return false; for(let parent=node.parentElement;parent;parent=parent.parentElement){if(/auto|scroll/.test(getComputedStyle(parent).overflowY)){const box=parent.getBoundingClientRect();if(r.top<box.top||r.bottom>box.bottom)return false;}} return true; })()`;

/** Real pointer/key selection, with reachability checked before each press (#1681). */
export async function chooseImportTarget(renderer, waitFor, value, name) {
  if (value === 'new-book') value = await renderer.evaluate(`Array.from(document.querySelector('#import-book').options).find(option=>option.dataset.importTargetChoice==='new-book')?.value`);
  const index = await renderer.evaluate(`Array.from(document.querySelector('#import-book').options).findIndex(option=>option.value===${JSON.stringify(value)})`);
  await waitFor(renderer, `${index}>=0`, `${name}-option`);
  const custom=await renderer.evaluate(`document.querySelector('#import-book + .ui-select-trigger')!==null`);
  const selector=custom?'#import-book + .ui-select-trigger':'#import-book';
  await waitFor(renderer, inside(selector), `${name}-visible`);
  await pointerClick(renderer, waitFor, selector, `${name}-open`);
  if (custom) {
    const option=`#import-book ~ .ui-select-popover .ui-select-option[data-index="${index}"]`;
    for (let attempt=0;attempt<30 && !(await renderer.evaluate(inside(option)));attempt++) {
      const point=await renderer.evaluate(`(() => {const item=document.querySelector(${JSON.stringify(option)});const menu=item.closest('.ui-select-popover');const r=menu.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,deltaY:item.getBoundingClientRect().y<r.y?-180:180};})()`);
      await renderer.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0});
      await renderer.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    }
    await waitFor(renderer, inside(option), `${name}-choice-visible`);
    await pointerClick(renderer, waitFor, option, `${name}-choose`);
  } else {
    for (const [key, code] of [['Home',36], ...Array.from({length:index},()=>['ArrowDown',40]), ['Enter',13]]) {
      await renderer.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});
      await renderer.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});
    }
  }
  await waitFor(renderer, `document.querySelector('#import-book').value===${JSON.stringify(value)}`, `${name}-current`);
}

export async function assertImportPrimary(renderer, waitFor, name) {
  for (const end of [false,true]) {
    await renderer.evaluate(`(() => {const button=document.querySelector('.import-page-actions button.primary');for(let node=button.parentElement;node;node=node.parentElement)if(node.scrollHeight>node.clientHeight)node.scrollTop=${end} ? node.scrollHeight : 0;})()`);
    await waitFor(renderer, `new Promise(resolve=>{const node=document.querySelector('.import-page-actions button.primary');const before=node.getBoundingClientRect();requestAnimationFrame(()=>requestAnimationFrame(()=>{const after=node.getBoundingClientRect();resolve(before.x===after.x&&before.y===after.y&&before.width===after.width&&before.height===after.height);}));})`, `${name}-stable`);
    await waitFor(renderer, inside('.import-page-actions button.primary'), `${name}-inside`);
    await waitFor(renderer, `getComputedStyle(document.querySelector('.import-page-actions')).position==='sticky'`, `${name}-sticky`);
  }
}

export async function assertFidelityFold(renderer, waitFor, name, selector='.fidelity-details') {
  await waitFor(renderer, `(() => {const fold=document.querySelector(${JSON.stringify(selector)});return fold instanceof HTMLDetailsElement&&!fold.open&&!document.querySelector('#screen').textContent.includes('后续提供');})()`, `${name}-closed`);
  await pointerClick(renderer, waitFor, `${selector} > summary`, `${name}-expand`);
  await waitFor(renderer, `!document.querySelector('#screen').textContent.includes('后续提供')`, `${name}-current-export`);
  await pointerClick(renderer, waitFor, `${selector} > summary`, `${name}-collapse`);
}
