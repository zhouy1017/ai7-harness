/** Pointer failure metadata never reads text or attribute values. Bounds also apply to SVG names. */
export function pointerElementDescription(node) {
  if (!node) return null;
  const name = (value, limit) => String(value ?? '').replace(/[^a-zA-Z0-9_.:-]/gu, '').slice(0, limit);
  return { tag: name(node.tagName, 24).toLowerCase() || 'unknown', id: name(node.id, 64),
    classes: String(typeof node.className === 'string' ? node.className : node.className?.baseVal ?? '').split(/\s+/u).filter(Boolean).slice(0, 6).map(value => name(value, 32)),
    data: (node.getAttributeNames?.() ?? []).filter(value => /^data-[a-zA-Z0-9_.:-]+$/u.test(value)).slice(0, 6).map(value => name(value, 32)) };
}

/** Reconstruct a closed, capped payload before forwarding child output into CI. */
export function pointerFailureDetail(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.unavailable === true) return { unavailable: true };
  const numbers = (items, count) => Array.isArray(items) && items.length === count && items.every(item => typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 100_000_000) ? items : null;
  const describe = entry => entry === null ? null : pointerElementDescription({ tagName: entry?.tag, id: entry?.id,
    className: Array.isArray(entry?.classes) ? entry.classes.join(' ') : '', getAttributeNames: () => Array.isArray(entry?.data) ? entry.data.filter(item => typeof item === 'string') : [] });
  if (!numbers(value.viewport, 2) || !Array.isArray(value.frames) || value.frames.length < 1 || value.frames.length > 4) return null;
  const frames = [];
  for (const frame of value.frames) {
    if (!frame || typeof frame !== 'object' || typeof frame.contains !== 'boolean' ||
      (frame.rect !== null && !numbers(frame.rect, 4)) || (frame.point !== null && !numbers(frame.point, 2))) return null;
    frames.push({ rect: frame.rect, point: frame.point, hit: describe(frame.hit), contains: frame.contains });
  }
  const detail = { viewport: value.viewport, target: describe(value.target), frames };
  return JSON.stringify(detail).length <= 4096 ? detail : null;
}

async function capturePointerFailure(renderer, selector) {
  try {
    const detail = await renderer.evaluate(`(async () => {const describe=${pointerElementDescription.toString()},frames=[];let target=null;for(let index=0;index<4;index++){await new Promise(resolve=>requestAnimationFrame(resolve));const node=document.querySelector(${JSON.stringify(selector)}),r=node?.getBoundingClientRect(),x=r?r.left+r.width/2:null,y=r?r.top+r.height/2:null;target=describe(node);const hit=r?document.elementFromPoint(x,y):null;frames.push({rect:r?[r.left,r.top,r.width,r.height]:null,point:r?[x,y]:null,hit:describe(hit),contains:!!node&&node.contains(hit)});}return {viewport:[innerWidth,innerHeight],target,frames};})()`);
    return pointerFailureDetail(detail) ?? { unavailable: true };
  } catch { return { unavailable: true }; }
}

/** Real pointer interaction: wait for layout motion, then require a visible, topmost target. */
export async function pointerClick(renderer, waitFor, selector, name) {
  try {
    const query = JSON.stringify(selector);
    await renderer.evaluate(`document.querySelector(${query})?.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
    const pointExpression = `(() => {const node=document.querySelector(${query});if(!node)return null;node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&node.contains(document.elementFromPoint(x,y))?{x,y,width:r.width,height:r.height}:null;})()`;
    // A closed drawer changes the body's padding over several frames (#1490). A hit-test during
    // that transition can be true while its coordinates already belong to the next moving frame.
    const stableExpression = `new Promise(resolve=>requestAnimationFrame(()=>{const before=${pointExpression};
      requestAnimationFrame(()=>{const after=${pointExpression};resolve(before!==null&&after!==null&&
        before.x===after.x&&before.y===after.y&&before.width===after.width&&before.height===after.height);});}))`;
    await waitFor(renderer, stableExpression, `${name}-pointer-target`);
    const ready = await renderer.evaluate(pointExpression);
    if (ready === null) throw new Error(`${name}-target-moved-before-press`);
    const point = { x: ready.x, y: ready.y };
    await renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    if (!(await renderer.evaluate(`document.querySelector(${query})?.contains(document.elementFromPoint(${point.x},${point.y}))===true`))) throw new Error(`${name}-target-moved-after-press`);
    await renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  } catch (error) {
    const detail = await capturePointerFailure(renderer, selector);
    if (error && typeof error === 'object') Object.defineProperty(error, 'pointerFailure', { value: detail, configurable: true });
    throw error;
  }
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
