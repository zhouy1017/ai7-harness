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
