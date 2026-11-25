import { SIDEBAR } from './controller.mjs';
import { pressReachable } from './task-card-reach.mjs';

/**
 * Issue #1703 (RET-002): the manuscript is read by the wheel alone, left for 工作概览 from the sidebar and opened again — and
 * the paragraph that was at the middle of the text is on screen again, with the caret on it. Every press is a real pointer
 * press on a control asserted reachable first; the text is moved only by real wheel events; every rectangle is read from the
 * engine at the moment it is compared. No scroll position is set by script anywhere.
 */
const PANE = `document.querySelector('[data-screen="editor"] .editor-window')`;

/** The pane's visible box, clipped to the window, and the paragraph whose box holds a point one third down — or `null`. */
function place(blockId = null) {
  return `(() => {
    const pane = ${PANE};
    const text = document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"]');
    if (!(pane instanceof HTMLElement) || !(text instanceof HTMLElement)) return null;
    const box = pane.getBoundingClientRect();
    const view = { left: Math.max(0, box.left), top: Math.max(0, box.top), right: Math.min(innerWidth, box.left + pane.clientWidth), bottom: Math.min(innerHeight, box.top + pane.clientHeight) };
    const middle = (view.top + view.bottom) / 2;
    const blocks = Array.from(text.querySelectorAll(':scope > [data-block-id]'));
    const named = ${JSON.stringify(blockId)};
    const block = named === null ? blocks.find((item) => item.getBoundingClientRect().bottom >= middle) : blocks.find((item) => item.dataset.blockId === named);
    const selection = getSelection();
    const anchor = selection && selection.anchorNode ? (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement) : null;
    const caret = anchor instanceof Element && text.contains(anchor) ? anchor.closest('[data-block-id]') : null;
    const shows = (item) => { if (!(item instanceof HTMLElement)) return false; const r = item.getBoundingClientRect(); return r.height > 0 && r.bottom > view.top + 1 && r.top < view.bottom - 1; };
    const r = block instanceof HTMLElement ? block.getBoundingClientRect() : null;
    // The paragraph is what the engine paints there: a point inside both the paragraph and the pane hits it, not something over it.
    const y = r === null ? null : (Math.max(r.top, view.top) + Math.min(r.bottom, view.bottom)) / 2;
    const hit = r === null || y === null || !shows(block) ? null : document.elementFromPoint(Math.min(view.right - 2, Math.max(view.left + 2, r.left + Math.min(24, r.width / 2))), y);
    return { blockId: block instanceof HTMLElement ? block.dataset.blockId ?? null : null, top: r === null ? null : Math.round(r.top - view.top), scrollTop: Math.round(pane.scrollTop),
      room: Math.round(pane.scrollHeight - pane.clientHeight - pane.scrollTop), height: Math.round(view.bottom - view.top), window: [innerWidth, innerHeight],
      shows: shows(block), painted: hit instanceof Node && block instanceof HTMLElement && (hit === block || block.contains(hit)),
      caretBlockId: caret instanceof HTMLElement ? caret.dataset.blockId ?? null : null, caretShows: shows(caret),
      first: blocks[0] instanceof HTMLElement ? blocks[0].dataset.blockId ?? null : null, wheel: { x: Math.round((view.left + view.right) / 2), y: Math.round(middle) } };
  })()`;
}

const rested = (blockId) => `new Promise((resolve) => { const read = () => JSON.stringify(${place(blockId)}); const before = read(); setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(before !== 'null' && before === read()))), 250); })`;

async function roundTrip(renderer, waitFor, check, name) {
  await pressReachable(renderer, waitFor, check, SIDEBAR.section('overview'), `${name}-leave`);
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]') !== null && document.querySelector('[data-testid="manuscript-editor"]') === null`, `${name}-overview`);
  await pressReachable(renderer, waitFor, check, SIDEBAR.section('manuscript'), `${name}-reopen`);
  await waitFor(renderer, `document.querySelector('[data-screen="editor"] [data-testid="manuscript-editor"] > [data-block-id]') !== null`, `${name}-manuscript`);
}

export async function readingPlaceSurvivesOverview(renderer, waitFor, check, name) {
  await waitFor(renderer, rested(null), `${name}-ready`);
  // The wheel, a notch at a time, until the caret's paragraph has left the pane: what the editor reads is no longer the caret.
  for (let turn = 0; turn < 24; turn += 1) {
    const seen = await renderer.evaluate(place());
    check(seen !== null, `${name}-pane`, seen);
    if (!seen.caretShows && seen.scrollTop > 0) break;
    await renderer.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: seen.wheel.x, y: seen.wheel.y, deltaX: 0, deltaY: 200 });
    await waitFor(renderer, `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`, `${name}-wheel-${turn}`);
  }
  await waitFor(renderer, rested(null), `${name}-read`);
  const read = await renderer.evaluate(place());
  console.log(`READING_PLACE/${name}/read/${JSON.stringify(read)}`);
  check(read !== null && typeof read.blockId === 'string' && read.shows && read.scrollTop > 0 && !read.caretShows && read.caretBlockId !== read.blockId, `${name}-caret-out-of-sight`, read);

  await roundTrip(renderer, waitFor, check, `${name}-first`);
  await waitFor(renderer, rested(read.blockId), `${name}-arrived`);
  const back = await renderer.evaluate(place(read.blockId));
  console.log(`READING_PLACE/${name}/back/${JSON.stringify(back)}`);
  check(back !== null && back.blockId === read.blockId && back.shows && back.scrollTop > 0 && back.caretBlockId === read.blockId, `${name}-paragraph-on-screen`, { read, back });
  // The Issue saw the same wrong place two frames and one second after the return: read it again a second on.
  await waitFor(renderer, `new Promise((resolve) => setTimeout(() => resolve(true), 1000))`, `${name}-a-second-on`);
  const later = await renderer.evaluate(place(read.blockId));
  check(later !== null && later.shows && later.painted && later.scrollTop === back.scrollTop, `${name}-paragraph-stays`, { back, later });

  // Untouched, a second round trip opens on the same paragraph at the same place: the remembered position does not creep.
  await roundTrip(renderer, waitFor, check, `${name}-second`);
  await waitFor(renderer, rested(read.blockId), `${name}-arrived-again`);
  const again = await renderer.evaluate(place(read.blockId));
  console.log(`READING_PLACE/${name}/again/${JSON.stringify(again)}`);
  check(again !== null && again.shows && again.caretBlockId === read.blockId && Math.abs(again.top - back.top) <= 2, `${name}-no-creep`, { back, again });
}
