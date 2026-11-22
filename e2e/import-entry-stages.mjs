import { pointerClick } from './dispatch-chooser.mjs';

/**
 * The stages of Issue #1682 that J-01 and J-07 share: the 「导入新版本…」 entries and the question a dropped file asks. Each
 * Journey passes its own `io` — `renderer`, its `waitFor(renderer, expression, name)` and its `assertRenderer(renderer,
 * expression, name)` — so a failure names the stage in that Journey's own words. Every press is a real pointer or key event;
 * a control a stage names is first read inside the window, without any scripted scroll, as the topmost thing at its centre.
 */

/** True when the control stands whole inside the window and is what a pointer at its centre would hit. */
export function reachable(selector) {
  return `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!(node instanceof HTMLElement) || node.hidden || node.matches(':disabled')) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
      && node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
  })()`;
}

/** Press a control that is in the window, with the pointer. */
export async function pressReachable(io, selector, name) {
  await io.assertRenderer(io.renderer, reachable(selector), `${name}-in-window`);
  await pointerClick(io.renderer, io.waitFor, selector, name);
}

/** A real file drag onto the page: enter, over and drop at a point inside the page's own box, as J-01's empty-Book drop does. */
export async function dropFile(io, filePath, pageSelector, name) {
  const point = await io.renderer.evaluate(`(() => { const box = document.querySelector(${JSON.stringify(pageSelector)})?.getBoundingClientRect(); return box ? { x: Math.min(innerWidth - 20, box.left + box.width / 2), y: Math.min(innerHeight - 20, box.top + 50) } : null; })()`);
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
  await io.click('取消导入', `${name}-cancel`);
  await io.waitFor(io.renderer, `!document.querySelector(${JSON.stringify(importPageButton(kind, bookId))})`, `${name}-left-page`);
  await noImportDraft(io, name);
}

const KEY_CODES = Object.freeze({ ArrowDown: 40, ArrowUp: 38, Enter: 13 });

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
    await io.assertRenderer(io.renderer, `(() => { const summary = document.querySelector(${JSON.stringify(SAVE_MENU.summary)}); if (!(summary instanceof HTMLElement)) return false; summary.focus(); return document.activeElement === summary; })()`, `${name}-menu-focus`);
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
