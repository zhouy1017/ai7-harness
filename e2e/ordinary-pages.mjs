import { pointerClick } from './dispatch-chooser.mjs';
import { SIDEBAR } from './controller.mjs';

// Issue #1543: shared steps of the Journeys that read 本社词表, 分析 › 自定义 and 评估校准与预测 as ordinary pages. Each press and each
// typed letter goes through the browser's own input events, the way the editor makes them.

/** The two window forms the interface lane holds every surface to. */
export const ORDINARY_VIEWPORTS = Object.freeze([{ width: 1280, height: 800 }, { width: 1008, height: 681 }]);

/** Run `step` once per window form, then give the window back its own size. */
export async function atBothSizes(renderer, waitFor, name, step) {
  try {
    for (const [index, viewport] of ORDINARY_VIEWPORTS.entries()) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
      await waitFor(renderer, `innerWidth===${viewport.width} && innerHeight===${viewport.height}`, `${name}-viewport-${index + 1}`);
      await step(viewport);
    }
  } finally {
    await renderer.send('Emulation.clearDeviceMetricsOverride');
  }
}

/** Focus a field with a real press, then type into it through the input method. */
export async function typeInto(renderer, waitFor, selector, text, name) {
  await pointerClick(renderer, waitFor, selector, `${name}-focus`);
  await renderer.send('Input.insertText', { text });
}

/** The Escape key, as a keyboard sends it. */
export async function pressEscape(renderer) {
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', ...escape });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape });
}

/**
 * An expression that is true while every visible `.button-row` inside `scope` holds its buttons on one top edge and none of them
 * stretches across the row — no full-width stack — and the page does not scroll sideways.
 */
export function buttonRowsAtOneEdge(scope) {
  return `(() => {
    const root = document.querySelector(${JSON.stringify(scope)});
    if (!(root instanceof HTMLElement)) return false;
    const rows = Array.from(root.querySelectorAll('.button-row')).filter((row) => row.getClientRects().length > 0);
    const rowsOk = rows.every((row) => {
      const width = row.getBoundingClientRect().width;
      const buttons = Array.from(row.querySelectorAll('button')).filter((button) => button.getClientRects().length > 0);
      const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
      return buttons.length === 0 || (Math.max(...tops) - Math.min(...tops) <= 1 && buttons.every((button) => button.getBoundingClientRect().width < width * 0.9));
    });
    return rows.length > 0 && rowsOk && root.getBoundingClientRect().right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
  })()`;
}

/**
 * Switch 设置 › 帮助's developer-mode switch to `developer`, pressed with the pointer, and wait until the window shows it. The ordinary
 * editor's pages are read in ordinary mode, and the Journeys that run in development mode switch back after.
 */
export async function setDeveloperMode(renderer, waitFor, developer, name, press = (page, selector, label) => pointerClick(page, waitFor, selector, label)) {
  await press(renderer, SIDEBAR.settings, `${name}-settings-open`);
  await waitFor(renderer, `document.querySelector('[data-settings-nav="help"]')`, `${name}-settings`);
  await press(renderer, '[data-settings-nav="help"]', `${name}-help`);
  await waitFor(renderer, `document.querySelector('.help-developer-mode input')?.disabled===false`, `${name}-switch`);
  if (await renderer.evaluate(`document.querySelector('.help-developer-mode input').checked !== ${developer}`)) await press(renderer, '.help-developer-mode input', `${name}-press`);
  await waitFor(renderer, `document.documentElement.dataset.technicalLayerVisible===${JSON.stringify(String(developer))}`, `${name}-applied`);
}

/**
 * An expression whose value is the measure of 本社词表's draft rows: each row's 词条, 说明 and 启用 + 移除 side by side on one line, and
 * the three headings over the same three columns. `ok` is the one verdict; the rest says what was measured.
 */
export const HOUSE_DRAFT_MEASURE = `(() => {
  const rows = Array.from(document.querySelectorAll('[data-house-entry-row]'));
  const head = Array.from(document.querySelectorAll('.house-row-head > span'), (span) => Math.round(span.getBoundingClientRect().left));
  const lefts = [];
  const checks = rows.map((row) => {
    const [literal, note, enabled, remove] = ['[data-house-field="literal"]', '[data-house-field="note"]', '[data-house-field="enabled"]', '[data-house-action^="remove-"]'].map((selector) => row.querySelector(selector)?.getBoundingClientRect());
    if (!(literal && note && enabled && remove)) return false;
    lefts.push([Math.round(literal.left), Math.round(note.left), Math.round(enabled.left)]);
    return literal.right <= note.left + 1 && note.right <= enabled.left + 1 && enabled.right <= remove.left + 1 && Math.abs(literal.top - note.top) <= 8 && Math.abs(note.top - remove.top) <= 12;
  });
  const aligned = head.length === 3 && lefts.every((row) => row.every((left, index) => Math.abs(left - head[index]) <= 1));
  return { ok: rows.length > 0 && checks.every(Boolean) && aligned, rows: rows.length, checks, head, lefts, width: innerWidth };
})()`;
