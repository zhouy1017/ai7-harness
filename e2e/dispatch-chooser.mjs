/** Real pointer interaction: every target must be visible and topmost at its own centre. */
export async function pointerClick(renderer, waitFor, selector, name) {
  const query = JSON.stringify(selector);
  await renderer.evaluate(`document.querySelector(${query})?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`);
  const pointExpression = `(() => {const node=document.querySelector(${query});if(!node)return null;node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&node.contains(document.elementFromPoint(x,y))?{x,y}:null;})()`;
  await waitFor(renderer, `Boolean(${pointExpression})`, `${name}-pointer-target`);
  const point = await renderer.evaluate(pointExpression);
  await renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
}

export async function chooseDispatch(renderer, waitFor, selector, name, { model = 'next', effort = 'first', reset = false } = {}) {
  const root = JSON.stringify(selector);
  if (!(await renderer.evaluate(`document.querySelector(${root})?.open===true`))) await pointerClick(renderer, waitFor, `${selector} > summary`, `${name}-open`);
  await waitFor(renderer, `(() => {const panel=document.querySelector(${root})?.querySelector('.dispatch-chooser-panel');if(!panel)return false;
    const r=panel.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&panel.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})()`, `${name}-panel-visible`);
  const pick = async (label, choice) => {
    const select = `${selector} select[aria-label=${JSON.stringify(label)}]`;
    const index = await renderer.evaluate(`(() => {const select=document.querySelector(${JSON.stringify(select)}),options=Array.from(select.options);
      return ${JSON.stringify(choice)}==='next'?options.findIndex((option,index)=>!option.disabled&&index!==select.selectedIndex):${JSON.stringify(choice)}==='first'?options.findIndex(option=>!option.disabled&&option.value!=='off'):options.findIndex(option=>option.textContent===${JSON.stringify(choice)}||option.value===${JSON.stringify(choice)});})()`);
    if (index < 0) throw new Error(`${name}-choice-unavailable/${label}`);
    await pointerClick(renderer, waitFor, `${select} + .ui-select-trigger`, `${name}-${label}-select`);
    await pointerClick(renderer, waitFor, `${select} ~ .ui-select-popover .ui-select-option[data-index="${index}"]`, `${name}-${label}-option`);
    await waitFor(renderer, `(() => {const sheet=document.querySelector(${root})?.closest('dialog.review-sheet'),progress=sheet?.querySelector('.review-preparation-progress');return !progress||progress.hidden;})()`, `${name}-${label}-choice-settled`);
  };
  if (reset) await pointerClick(renderer, waitFor, `${selector} .dispatch-chooser-panel > button`, `${name}-reset`);
  else {
    await pick('本次任务的模型', model);
    if (await renderer.evaluate(`!document.querySelector(${root}).querySelector('select[aria-label="本次任务的思考强度"]').closest('label').hidden`)) await pick('本次任务的思考强度', effort);
  }
  const label = await renderer.evaluate(`document.querySelector(${root}).querySelector('summary').textContent`);
  await pointerClick(renderer, waitFor, `${selector} > summary`, `${name}-close`);
  return label;
}
