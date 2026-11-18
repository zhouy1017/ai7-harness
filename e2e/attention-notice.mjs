import { pointerClick } from './dispatch-chooser.mjs';

/** The manuscript caret as the editor left it: whether the text holds the focus, and the block and offset of the caret. */
export const READ_CARET = `(() => {
  const editor = document.querySelector('[data-testid="manuscript-editor"]');
  const selection = getSelection();
  const anchor = selection?.anchorNode ?? null;
  const block = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('[data-block-id]') ?? null;
  return { focused: editor instanceof HTMLElement && editor.contains(document.activeElement), block: block?.dataset.blockId ?? null, offset: selection?.anchorOffset ?? null };
})()`;

/**
 * #1528: the notice of a task that needs the editor — its words and 去处理 — stands whole inside the window at both sizes
 * (every box read from `innerWidth` / `innerHeight`), while the caret and the focus stay where the editor left them.
 */
export async function attentionNoticeHolds(renderer, waitFor, requireJourney, name, words, caret) {
  try {
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await waitFor(renderer, `(() => {
        const notice = document.querySelector('[data-attention-toast]');
        if (!(notice instanceof HTMLElement) || notice.hidden || innerWidth !== ${width} || innerHeight !== ${height}) return false;
        const box = notice.getBoundingClientRect();
        return box.width > 0 && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight &&
          notice.children[0]?.textContent === ${JSON.stringify(words)} && notice.children[1]?.textContent === '去处理' && !notice.querySelector('[data-toast]');
      })()`, `${name}-shown-${width}`);
      requireJourney(JSON.stringify(await renderer.evaluate(READ_CARET)) === JSON.stringify(caret), `${name}-caret-${width}`);
    }
  } finally {
    await renderer.send('Emulation.clearDeviceMetricsOverride');
  }
}

/**
 * #1528: the quiet toast of a completion and its 查看结果, pressed with the pointer at both window sizes. The pointer is put on
 * the toast first (it pauses its 2.5 seconds while the pointer is over it); at each size the button must be the topmost thing at
 * its own centre, read from the viewport, before the pointer is moved there; the press is the real one, at the last size.
 */
export async function pressQuietResult(renderer, waitFor, name) {
  const BUTTON = '[data-toast] button';
  const centre = `(() => { const toast = document.querySelector('[data-toast]'); const view = toast?.querySelector('button'); if (!(toast instanceof HTMLElement) || toast.hidden || !String(toast.dataset.tone).startsWith('analysis-completed') || !(view instanceof HTMLButtonElement) || view.textContent !== '查看结果') return null; const box = view.getBoundingClientRect(); const x = box.left + box.width / 2; const y = box.top + box.height / 2; return box.width > 0 && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && view.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`;
  try {
    let first = true;
    for (const [width, height] of [[1280, 800], [1008, 681]]) {
      if (first) {
        await waitFor(renderer, `(() => { const toast = document.querySelector('[data-toast]'); return toast instanceof HTMLElement && !toast.hidden && String(toast.dataset.tone).startsWith('analysis-completed'); })()`, `${name}-raised`, 180_000);
        await waitFor(renderer, `${centre} !== null`, `${name}-shown`, 10_000);
      }
      first = false;
      await renderer.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await waitFor(renderer, `innerWidth === ${width} && innerHeight === ${height} && ${centre} !== null`, `${name}-reachable-${width}`, 10_000);
      const point = await renderer.evaluate(centre);
      await renderer.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'none', buttons: 0 });
    }
    await pointerClick(renderer, waitFor, BUTTON, name);
  } finally {
    await renderer.send('Emulation.clearDeviceMetricsOverride');
  }
}

/**
 * #1528: with the notice showing at 1008×681, an open menu (the manuscript's save menu) is over the notice, not under it: the
 * centre of every control in the menu hits that control.
 */
export async function attentionNoticeClearsMenu(renderer, waitFor, requireJourney, name) {
  const summary = '#context-actions details[data-save-menu="manuscript"] > summary';
  try {
    await renderer.send('Emulation.setDeviceMetricsOverride', { width: 1008, height: 681, deviceScaleFactor: 1, mobile: false });
    await waitFor(renderer, `innerWidth === 1008 && document.querySelector('[data-attention-toast]')?.hidden === false`, `${name}-size`);
    // A Task Drawer left open (500 px wide) covers the header's save menu at this width: it is closed first, as the editor would.
    if (await renderer.evaluate(`document.querySelector('#task-drawer')?.hidden === false`)) {
      await pointerClick(renderer, waitFor, '#task-drawer [data-task-drawer-control="close"]', `${name}-drawer-close`);
      await waitFor(renderer, `document.querySelector('#task-drawer')?.hidden !== false`, `${name}-drawer-closed`);
    }
    await pointerClick(renderer, waitFor, summary, `${name}-open`);
    const covered = await renderer.evaluate(`(() => {
      const body = document.querySelector('#context-actions details[data-save-menu="manuscript"][open] .editor-save-menu-body');
      if (!(body instanceof HTMLElement)) return null;
      const notice = document.querySelector('[data-attention-toast]');
      const a = body.getBoundingClientRect(); const b = notice.getBoundingClientRect();
      const meets = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      // Where the two meet, the menu is the one on top.
      const under = meets && !(Number(getComputedStyle(notice).zIndex) < Number(getComputedStyle(body).zIndex)) ? 1 : 0;
      return under + Array.from(body.querySelectorAll('button, input, select, textarea')).filter((control) => control.getBoundingClientRect().width > 0)
        .filter((control) => { const box = control.getBoundingClientRect(); return !control.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); }).length;
    })()`);
    requireJourney(covered === 0, `${name}-controls-covered`, { covered });
    await pointerClick(renderer, waitFor, summary, `${name}-close`);
    await waitFor(renderer, `document.querySelector('#context-actions details[data-save-menu="manuscript"]')?.open === false`, `${name}-closed`);
  } finally {
    await renderer.send('Emulation.clearDeviceMetricsOverride');
  }
}
