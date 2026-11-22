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
  // Issue #1673: hosted startup/chooser observations share the existing failure-only carrier.
  // Reconstruct only fixed numeric/boolean fields; never forward DOM labels, values or IDs.
  if (value.kind === 'j01-readiness') {
    const detail = { kind: 'j01-readiness' };
    for (const key of ['elapsedMs', 'pending', 'targets', 'width', 'height', 'options', 'selected', 'relationships']) {
      const item = value[key];
      if (item !== undefined) {
        if (!Number.isSafeInteger(item) || item < 0 || item > 100_000_000) return null;
        detail[key] = item;
      }
    }
    for (const key of ['connected', 'detached', 'serviceCrash', 'rendererCrash', 'fatalCrash', 'productReady', 'serviceInterrupted', 'visible', 'focused', 'chooser', 'relationshipChooser', 'existingSelected', 'expectedSelected', 'screenOverview', 'screenLanding', 'screenImport', 'screenRecovery']) {
      if (value[key] !== undefined) {
        if (typeof value[key] !== 'boolean') return null;
        detail[key] = value[key];
      }
    }
    return detail;
  }
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
  if (value.coveringAncestors !== undefined) {
    if (!Array.isArray(value.coveringAncestors) || value.coveringAncestors.length > 12) return null;
    detail.coveringAncestors = [];
    for (const ancestor of value.coveringAncestors) {
      if (!ancestor || !numbers(ancestor.rect, 4)) return null;
      detail.coveringAncestors.push({ ...describe(ancestor), rect: ancestor.rect });
    }
  }
  // Keep the structural chain and geometry first; shorten names if a heavily decorated DOM
  // would exceed the CI-safe limit. Neither text nor attribute values enter this object.
  const descriptions = [detail.target, ...frames.map(frame => frame.hit), ...(detail.coveringAncestors ?? [])].filter(Boolean);
  for (const limit of [24, 16, 12]) {
    if (JSON.stringify(detail).length <= 4096) return detail;
    for (const entry of descriptions) {
      entry.tag = entry.tag.slice(0, limit); entry.id = entry.id.slice(0, limit);
      entry.classes = entry.classes.slice(0, 1).map(name => name.slice(0, limit));
      entry.data = entry.data.slice(0, 1).map(name => name.slice(0, limit));
    }
  }
  return JSON.stringify(detail).length <= 4096 ? detail : null;
}

export async function capturePointerFailure(renderer, selector, { includeTargetAncestors = false } = {}) {
  try {
    const detail = await renderer.evaluate(`(async () => {const describe=${pointerElementDescription.toString()},frames=[],coveringAncestors=[];let target=null;for(let index=0;index<4;index++){await new Promise(resolve=>requestAnimationFrame(resolve));const node=document.querySelector(${JSON.stringify(selector)}),r=node?.getBoundingClientRect(),x=r?r.left+r.width/2:null,y=r?r.top+r.height/2:null;target=describe(node);const hit=r?document.elementFromPoint(x,y):null;if(index===0){const ancestors=[],append=(start)=>{for(let ancestor=start;ancestor&&ancestors.length<12;ancestor=ancestor.parentElement){if(!ancestors.includes(ancestor))ancestors.push(ancestor);if(ancestor.hasAttribute?.('data-screen'))break;}};if(${includeTargetAncestors})append(node?.parentElement);append(hit?.parentElement);for(const ancestor of ancestors){const box=ancestor.getBoundingClientRect();coveringAncestors.push({...describe(ancestor),rect:[box.left,box.top,box.width,box.height]});}}frames.push({rect:r?[r.left,r.top,r.width,r.height]:null,point:r?[x,y]:null,hit:describe(hit),contains:!!node&&node.contains(hit)});}return {viewport:[innerWidth,innerHeight],target,frames,coveringAncestors};})()`);
    return pointerFailureDetail(detail) ?? { unavailable: true };
  } catch { return { unavailable: true }; }
}

/** Real pointer interaction: wait for layout motion, then require a visible, topmost target. */
export async function pointerClick(renderer, waitFor, selector, name, { rest = false } = {}) {
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
    let point = { x: ready.x, y: ready.y };
    if (rest) {
      // As an editor's pointer does, it comes to rest on the control first, following it while the page still moves it; the page
      // keeps a control under a resting pointer in place. Once it has stayed under the pointer for two frames, it is pressed once.
      const resting = (at) => `new Promise(resolve=>requestAnimationFrame(()=>{const under=()=>document.querySelector(${query})?.contains(document.elementFromPoint(${at.x},${at.y}))===true;
        const before=under();requestAnimationFrame(()=>resolve(before&&under()));}))`;
      let rested = false;
      for (let moves = 0; moves < 20 && !rested; moves += 1) {
        await renderer.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'none', buttons: 0 });
        rested = (await renderer.evaluate(resting(point))) === true;
        if (!rested) {
          const moved = await renderer.evaluate(pointExpression);
          if (moved !== null) point = { x: moved.x, y: moved.y };
        }
      }
      if (!rested) throw new Error(`${name}-pointer-rest`);
    }
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
