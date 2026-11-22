import { layoutProbe } from './layout-probe.mjs';
function target(selector, words) {
  return words === undefined ? `document.querySelector(${JSON.stringify(selector)})` : `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(node => node.textContent.trim() === ${JSON.stringify(words)})`;
}

function hitPoint(selector, words) {
  return `(() => {
    const node = ${target(selector, words)};
    if (!(node instanceof HTMLElement) || node.matches(':disabled')) return null;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height || box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) return null;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
      const left = rect.left + parent.clientLeft, top = rect.top + parent.clientTop;
      if (['scroll', 'auto'].includes(style.overflowY) && (box.top < top - 1 || box.bottom > top + parent.clientHeight + 1)) return null;
      if (['scroll', 'auto'].includes(style.overflowX) && (box.left < left - 1 || box.right > left + parent.clientWidth + 1)) return null;
    }
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    return node.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  })()`;
}

export function reachable(selector, words) { return `(${hitPoint(selector, words)} !== null)`; }

export async function pressReachable(io, selector, name, words) {
  try { await io.waitFor(io.renderer, reachable(selector, words), `${name}-in-window`); }
  catch(error) { process.stderr.write(`IMPORT_ENTRY_GEOMETRY/${JSON.stringify(await layoutProbe(io.renderer,selector,words))}\n`); throw error; }
  const point = await io.renderer.evaluate(hitPoint(selector, words));
  if (!point) throw new Error(`${name}-target-moved`);
  await io.renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
  await io.renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
}

export async function tabTo(io, selector, name, words, reverse = false) {
  const focused = `document.activeElement === (${target(selector, words)})`;
  for (let step = 0; step < 60; step++) {
    if (await io.renderer.evaluate(focused)) {
      try { await io.assertRenderer(io.renderer, reachable(selector, words), `${name}-in-window`); }
      catch(error) { process.stderr.write(`IMPORT_ENTRY_GEOMETRY/${JSON.stringify(await layoutProbe(io.renderer,selector,words))}\n`); throw error; }
      return;
    }
    for (const type of ['rawKeyDown', 'keyUp']) await io.renderer.send('Input.dispatchKeyEvent', {
      type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: reverse ? 8 : 0,
    });
  }
  throw new Error(`${name}-keyboard-focus`);
}

/** A real file drag onto the page: enter, over and drop at a point inside the page's own box, as J-01's empty-Book drop does. */
export async function dropFile(io, filePath, pageSelector, name) {
  const point = await io.renderer.evaluate(`(() => {
    const page = document.querySelector(${JSON.stringify(pageSelector)});
    if (!page) return null;
    const box = page.getBoundingClientRect(), left = Math.max(0, box.left), right = Math.min(innerWidth, box.right);
    const top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
    if (right <= left || bottom <= top) return null;
    for (const row of [0.5, 0.25, 0.75]) for (const column of [0.5, 0.25, 0.75]) {
      const x = left + (right - left) * column, y = top + (bottom - top) * row;
      if (page.contains(document.elementFromPoint(x, y))) return { x, y };
    }
    return null;
  })()`);
  if (point === null) throw new Error(`${name}-drop-page`);
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await io.renderer.send('Input.dispatchDragEvent', { type, ...point, data: { items: [], files: [filePath], dragOperationsMask: 1 } });
  }
}

const ANSWER_WORDS = Object.freeze({ update: '更新稿件', source: '存为来源材料', derivative: '存为衍生稿件', cancel: '取消' });

/** The question stands, offers exactly these answers in this order, and each button is inside the window. */
export async function questionOffers(io, answers, name) {
  await io.waitFor(io.renderer, `document.querySelector('[data-import-question]')?.open === true`, `${name}-question`);
  const expected = JSON.stringify(answers.map((answer) => [answer, ANSWER_WORDS[answer]]));
  await io.assertRenderer(io.renderer, `JSON.stringify(Array.from(document.querySelectorAll('[data-import-question] [data-import-answer]'), (node) => [node.dataset.importAnswer, node.textContent])) === ${JSON.stringify(expected)}`, `${name}-answers`);
  for (const answer of answers) {
    await io.assertRenderer(io.renderer, reachable(`[data-import-question] [data-import-answer="${answer}"]`), `${name}-${answer}-in-window`);
  }
  await io.assertRenderer(io.renderer, `/^「.+」要怎样导入？$/u.test(document.querySelector('[data-import-question] h3')?.textContent ?? '')`, `${name}-heading`);
}

/** Press one answer of the open question. */
export async function answer(io, key, name) {
  await pressReachable(io, `[data-import-question] [data-import-answer="${key}"]`, `${name}-answer-${key}`);
}

/** The startup read finds no import draft: nothing was staged, or the staging was cancelled. */
export async function noImportDraft(io, name) {
  await io.assertRenderer(io.renderer, `window.ai7.getImportStartup().then((startup) => startup.state === 'none')`, `${name}-no-draft`);
}

/** The import page this Book's file reached: 「更新稿件」's or 「存为来源材料」's own button. */
export function importPageButton(kind, bookId) {
  return `[${kind === 'update' ? 'data-prepare-manuscript-reimport' : 'data-prepare-source-import-review'}="${bookId}"]`;
}

/** 取消导入 on the import page the entry reached, then the startup read: the staged file was never kept. */
export async function cancelImportPage(io, kind, bookId, name) {
  await io.waitFor(io.renderer, `document.querySelector(${JSON.stringify(importPageButton(kind, bookId))})`, `${name}-page`);
  if (!await io.renderer.evaluate(reachable('#screen button', '取消导入'))) await tabTo(io, '#screen button', `${name}-cancel`, '取消导入');
  await pressReachable(io, '#screen button', `${name}-cancel`, '取消导入');
  await io.waitFor(io.renderer, `!document.querySelector(${JSON.stringify(importPageButton(kind, bookId))})`, `${name}-left-page`);
  await noImportDraft(io, name);
}

const KEY_CODES = Object.freeze({ ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, Enter: 13 });

/** One real key press: down and up, as the keyboard sends it. */
export async function pressKey(renderer, key) {
  const code = KEY_CODES[key];
  const base = { key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
  await renderer.send('Input.dispatchKeyEvent', { type: key === 'Enter' ? 'keyDown' : 'rawKeyDown', ...base, ...(key === 'Enter' ? { text: '\r' } : {}) });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

/** The manuscript's save menu and its 导入新版本… entry, as the header holds them. */
export const SAVE_MENU = Object.freeze({
  menu: '#context-actions details[data-save-menu="manuscript"]',
  summary: '#context-actions details[data-save-menu="manuscript"] > summary',
  entry: '#context-actions details[data-save-menu="manuscript"] [data-import-new-version="manuscript"]',
  actions: '#context-actions details[data-save-menu="manuscript"] .editor-save-menu-body > button',
});

/** 导入新版本… sits above 导出… in the menu: these two, in this order, are the menu's own buttons. */
export function saveMenuActionsInOrder() {
  return `JSON.stringify(Array.from(document.querySelectorAll(${JSON.stringify(SAVE_MENU.actions)}), (node) => node.textContent)) === ${JSON.stringify(JSON.stringify(['导入新版本…', '导出…']))}`;
}

/** 稿件 → 「已保存 ▾」 → 导入新版本…, by pointer or by keyboard, then 取消导入 on the page it opens. */
export async function newVersionFromSaveMenu(io, how, bookId, name) {
  if (how === 'pointer') await pressReachable(io, SAVE_MENU.summary, `${name}-menu`);
  else {
    await io.assertRenderer(io.renderer, reachable(SAVE_MENU.summary), `${name}-summary-in-window`);
    await io.assertRenderer(io.renderer, `(() => { const summary = document.querySelector(${JSON.stringify(SAVE_MENU.summary)}); if (!(summary instanceof HTMLElement)) return false; summary.focus({ preventScroll: true }); return document.activeElement === summary; })()`, `${name}-menu-focus`);
    await pressKey(io.renderer, 'Enter');
  }
  await io.waitFor(io.renderer, `document.querySelector(${JSON.stringify(SAVE_MENU.menu)})?.open === true`, `${name}-menu-open`);
  await io.assertRenderer(io.renderer, saveMenuActionsInOrder(), `${name}-menu-order`);
  if (how === 'pointer') await pressReachable(io, SAVE_MENU.entry, `${name}-entry`);
  else {
    // The milestone form's own summary comes first, then 导入新版本…, then 导出….
    await pressKey(io.renderer, 'ArrowDown');
    await pressKey(io.renderer, 'ArrowDown');
    await io.assertRenderer(io.renderer, `document.activeElement === document.querySelector(${JSON.stringify(SAVE_MENU.entry)})`, `${name}-entry-focus`);
    await io.assertRenderer(io.renderer, reachable(SAVE_MENU.entry), `${name}-entry-in-window`);
    await pressKey(io.renderer, 'Enter');
  }
  await cancelImportPage(io, 'update', bookId, name);
}
