import { pointerClick } from './dispatch-chooser.mjs';

// Issue #1543: shared steps of the Journeys that read 本社词表, 分析 › 自定义 and 评估校准与预测 as ordinary pages. Each press and each
// typed letter goes through the browser's own input events, the way the editor makes them.

/** The two window forms the interface lane holds every surface to. */
export const ORDINARY_VIEWPORTS = Object.freeze([{ width: 1280, height: 800 }, { width: 1008, height: 681 }]);

/** Run `step` once per window form, then give the window back its own size. */
export async function atBothSizes(renderer, waitFor, name, step) {
  try {
    for (const viewport of ORDINARY_VIEWPORTS) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
      await waitFor(renderer, `innerWidth===${viewport.width} && innerHeight===${viewport.height}`, `${name}-viewport-${viewport.width}`);
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
