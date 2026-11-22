import { pointerClick } from './dispatch-chooser.mjs';

/**
 * Issue #1680: a control a stage names is asserted reachable at engine level BEFORE it is pressed, without a scripted scroll —
 * its rectangle inside the window and inside its scroller's visible box, and `document.elementFromPoint` at its centre the
 * control. The shared `pointerClick` scrolls its target into view by script (Issue #1662), so a press through it alone proves
 * nothing about what the editor could see. A control below its scroller's fold is brought up as an editor would, by the wheel.
 */
function facts(selector) {
  return `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!(node instanceof HTMLElement)) return null;
    let scroller = node.parentElement;
    while (scroller && !(/(auto|scroll)/u.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
    const box = scroller ? scroller.getBoundingClientRect() : { left: 0, top: 0 };
    const view = scroller
      ? { left: Math.max(0, box.left), top: Math.max(0, box.top), right: Math.min(innerWidth, box.left + scroller.clientWidth), bottom: Math.min(innerHeight, box.top + scroller.clientHeight) }
      : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const inWindow = r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    const inScroller = r.left >= view.left - 0.5 && r.right <= view.right + 0.5 && r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5;
    return { rect: [r.left, r.top, r.right, r.bottom], view: [view.left, view.top, view.right, view.bottom], window: [innerWidth, innerHeight], inWindow, inScroller,
      hit: hit === node || node.contains(hit), wheel: { x: (view.left + view.right) / 2, y: (view.top + view.bottom) / 2 },
      delta: r.top < view.top ? r.top - view.top - 16 : r.bottom > view.bottom ? r.bottom - view.bottom + 16 : 0 };
  })()`;
}

/** The control rests (two frames alike), then is asserted inside the window and its scroller, and topmost at its centre. */
export async function assertReachable(renderer, waitFor, check, selector, name) {
  await waitFor(renderer, `new Promise(resolve => { const before = JSON.stringify(${facts(selector)}); requestAnimationFrame(() => requestAnimationFrame(() => resolve(before !== 'null' && before === JSON.stringify(${facts(selector)})))); })`, `${name}-rest`);
  const seen = await renderer.evaluate(facts(selector));
  console.log(`TASK_CARD_REACH/${name}/${JSON.stringify(seen)}`);
  check(seen !== null && seen.inWindow && seen.inScroller && seen.hit, `${name}-in-window`, seen);
  return seen;
}

/** Wheel the control's scroller until the control is inside its visible box, as the editor's own wheel would. */
export async function wheelIntoView(renderer, waitFor, selector, name) {
  for (let turn = 0; turn < 40; turn += 1) {
    const seen = await renderer.evaluate(facts(selector));
    if (seen === null) return;
    if (seen.delta === 0) return;
    await renderer.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: seen.wheel.x, y: seen.wheel.y, deltaX: 0, deltaY: Math.sign(seen.delta) * Math.min(240, Math.abs(seen.delta)) });
    await waitFor(renderer, `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`, `${name}-wheel-${turn}`);
  }
}

/** Bring the named control into view by the wheel, assert it reachable, then press it with the real pointer. */
export async function pressReachable(renderer, waitFor, check, selector, name) {
  await waitFor(renderer, `document.querySelector(${JSON.stringify(selector)}) !== null`, `${name}-present`);
  await wheelIntoView(renderer, waitFor, selector, name);
  await assertReachable(renderer, waitFor, check, selector, name);
  await pointerClick(renderer, waitFor, selector, name);
}
