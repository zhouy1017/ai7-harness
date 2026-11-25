import { assertReachable } from './task-card-reach.mjs';

/**
 * 设置 › 模型服务's 思考强度 lists (0.8.0 stage one), driven as the editor drives them. A control a stage names is wheeled into
 * view, asserted reachable at engine level without a scripted scroll (Issue #1662: its rectangle inside the window and
 * `document.elementFromPoint` at its centre the control), and only then pressed. Every geometry reading comes from
 * `innerWidth` / `innerHeight`.
 */
const KEY_CODES = Object.freeze({ Tab: 9, Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40 });

/** One real key press: down and up, as the keyboard sends it. */
export async function effortKey(renderer, key) {
  const base = { key, code: key, windowsVirtualKeyCode: KEY_CODES[key], nativeVirtualKeyCode: KEY_CODES[key] };
  await renderer.send('Input.dispatchKeyEvent', { type: key === 'Enter' ? 'keyDown' : 'rawKeyDown', ...base, ...(key === 'Enter' ? { text: '\r' } : {}) });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

const frames = `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`;

/** Wheels the page until the control sits clear of the window's top and bottom edges, or the page cannot move further. */
export async function wheelClear(renderer, waitFor, selector, name) {
  const query = JSON.stringify(selector);
  const read = `(() => { const node = document.querySelector(${query}); if (!(node instanceof HTMLElement)) return null;
    const r = node.getBoundingClientRect(), top = Math.min(96, innerHeight / 6), bottom = innerHeight - Math.min(120, innerHeight / 5);
    return { delta: r.top < top ? r.top - top : r.bottom > bottom ? r.bottom - bottom : 0, at: r.top, x: Math.min(innerWidth - 24, Math.max(24, r.left + r.width / 2)), y: innerHeight / 2 }; })()`;
  for (let turn = 0; turn < 60; turn += 1) {
    const before = await renderer.evaluate(read);
    if (before === null || before.delta === 0) return;
    await renderer.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: before.x, y: before.y, deltaX: 0, deltaY: Math.sign(before.delta) * Math.min(240, Math.max(40, Math.abs(before.delta))) });
    let moved = false;
    for (let wait = 0; wait < 6 && !moved; wait += 1) {
      await waitFor(renderer, frames, `${name}-wheel-${turn}`);
      moved = (await renderer.evaluate(read))?.at !== before.at;
    }
    if (!moved) return;
  }
}

/** Brings the named control into view by the wheel, asserts it reachable, then presses it once with the real pointer. */
export async function reachPress(renderer, waitFor, check, selector, name) {
  await waitFor(renderer, `document.querySelector(${JSON.stringify(selector)}) !== null`, `${name}-present`);
  await wheelClear(renderer, waitFor, selector, name);
  const { rect } = await assertReachable(renderer, waitFor, check, selector, name);
  const point = { x: (rect[0] + rect[2]) / 2, y: (rect[1] + rect[3]) / 2, button: 'left', clickCount: 1 };
  await renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, buttons: 1 });
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, buttons: 0 });
}

/** What the engine shows of one list while it is open or closed: its rows as drawn, what is chosen and the sentence under it. */
export function effortListFacts(select) {
  return `(() => { const select = document.querySelector(${JSON.stringify(select)}); if (!(select instanceof HTMLSelectElement)) return null;
    const trigger = select.nextElementSibling, popup = trigger?.nextElementSibling, owner = select.closest('.model-service-effort');
    const inside = (node, within) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && within.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); };
    const open = trigger?.getAttribute('aria-expanded') === 'true' && popup instanceof HTMLElement && !popup.hidden;
    const rows = open ? Array.from(popup.querySelectorAll('.ui-select-option')).map((row) => ({ words: row.firstElementChild.textContent, value: select.options[Number(row.dataset.index)]?.value ?? null, chosen: row.getAttribute('aria-selected') === 'true', inside: inside(row, row) })) : [];
    const sentence = owner?.querySelector('[data-effort-note="reason"],[data-effort-note="stale"]'), note = owner?.querySelector('.model-service-effort-note');
    const shown = sentence instanceof HTMLElement && getComputedStyle(note).display !== 'none';
    return { open, rows, values: Array.from(select.options).map((option) => option.value), selected: select.value, state: select.dataset.effortState ?? null, disabled: select.disabled,
      shown: trigger?.matches('.ui-select-trigger') ? trigger.firstElementChild.textContent : null, focused: document.activeElement === trigger,
      note: shown ? sentence.textContent : '', noteKind: shown ? sentence.dataset.effortNote : null, noteInside: shown ? inside(sentence, owner) : null, noteDisplay: note instanceof HTMLElement ? getComputedStyle(note).display : null,
      typed: owner?.querySelector('input:not(.ui-select-filter)') != null || select.querySelector('option[value="__other"]') !== null, window: [innerWidth, innerHeight] }; })()`;
}

/** Opens a list with the pointer and returns what the engine drew in it. */
export async function openEffortList(renderer, waitFor, check, select, name) {
  await reachPress(renderer, waitFor, check, `${select} + .ui-select-trigger`, `${name}-open`);
  await waitFor(renderer, `(${effortListFacts(select)})?.open === true`, `${name}-opened`);
  await waitFor(renderer, frames, `${name}-drawn`);
  const facts = await renderer.evaluate(effortListFacts(select));
  console.log(`EFFORT_LIST/${name}/${JSON.stringify({ values: facts.values, selected: facts.selected, state: facts.state, rows: facts.rows.map((row) => [row.value, row.inside, row.chosen]), noteKind: facts.noteKind, typed: facts.typed, window: facts.window })}`);
  return facts;
}

/** Presses one row of the open list, after asserting it reachable, and waits until the list shows it chosen and closed. */
export async function pressEffortRow(renderer, waitFor, check, select, value, name) {
  const index = await renderer.evaluate(`Array.from(document.querySelector(${JSON.stringify(select)}).options).findIndex((option) => option.value === ${JSON.stringify(value)})`);
  check(index >= 0, `${name}-offered`, { value });
  // The list is drawn in the top layer, outside its field's own box: the row is measured against the window alone.
  const row = `${select} ~ .ui-select-popover .ui-select-option[data-index="${index}"]`;
  const at = `(() => { const node = document.querySelector(${JSON.stringify(row)}); if (!(node instanceof HTMLElement)) return null; const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && node.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`;
  await waitFor(renderer, `new Promise(resolve => requestAnimationFrame(() => { const before = JSON.stringify(${at}); requestAnimationFrame(() => resolve(before !== 'null' && before === JSON.stringify(${at}))); }))`, `${name}-row-in-window`);
  const spot = await renderer.evaluate(at);
  check(spot !== null, `${name}-row-in-window`, { value });
  const point = { x: spot.x, y: spot.y, button: 'left', clickCount: 1 };
  await renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, buttons: 1 });
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, buttons: 0 });
  await waitFor(renderer, `(() => { const facts = ${effortListFacts(select)}; return facts !== null && !facts.open && facts.selected === ${JSON.stringify(value)}; })()`, `${name}-chosen`);
}

/** Chooses a value in any list of the page with the pointer: open, read, press the row. Returns what the open list showed. */
export async function chooseEffort(renderer, waitFor, check, select, value, name) {
  const facts = await openEffortList(renderer, waitFor, check, select, name);
  await pressEffortRow(renderer, waitFor, check, select, value, name);
  return facts;
}
