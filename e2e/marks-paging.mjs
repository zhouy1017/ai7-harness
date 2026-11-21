import { pointerClick } from './dispatch-chooser.mjs';

// J-05, #1604: a stretch of text with more than 400 open marks. The 批注栏 says how many it shows and reads the rest by 显示更多;
// 上一条待处理 under a category filter goes straight to a mark beyond the 400th; a decision there keeps what was loaded.
// Real pointer and key events throughout; the service's own reads only supply the expectation.

const PANE = `document.querySelector('.manuscript-comments-pane')`;
/** The window on screen as the service pages it: every mark in page order, with the paging facts of the first answer. */
const READ_WINDOW = `(async () => {
  const bookId=document.querySelector('.editor-shell').dataset.bookId, work=(await window.ai7.listPriorWork()).find((item)=>item.bookId===bookId);
  const binding={manuscriptId:work.manuscriptId,branchId:work.branchId}, start=document.querySelector('[data-testid="manuscript-editor"] [data-block-id]').dataset.blockId;
  const at={...binding,target:{kind:'window-start',blockId:start}};
  let page=await window.ai7.getManuscriptWindowAt(at); const first=page, marks=[...page.marks];
  while (page.marksPage?.nextOrdinal!=null) { page=await window.ai7.getManuscriptWindowAt({...at,marks:{afterOrdinal:page.marksPage.nextOrdinal,digest:page.marksPage.digest}}); marks.push(...page.marks); }
  globalThis.__marksPaging={...binding,start};
  return {shown:first.marks.length,total:first.marksPage?.total??first.marks.length,marks:marks.map((mark)=>({markId:mark.markId,kind:mark.kind,status:mark.status,anchorState:mark.anchorState,blockId:mark.blockId,categoryKey:mark.categoryKey,from:mark.fromGrapheme,to:mark.toGrapheme,source:mark.sourceKind}))};
})()`;

async function key(renderer, name, code, windowsVirtualKeyCode, modifiers = 0) {
  const text = name.length === 1 && modifiers === 0 ? { text: name } : {};
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode, modifiers, ...text });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode, modifiers });
}

/** The row's words and where it stands: inside the pane, which is inside the window, with its control under the pointer. */
const SENTENCE = `(() => {
  const row=document.querySelector('[data-marks-paging]'), pane=${PANE}, button=row?.querySelector('[data-marks-more]');
  if (!row || row.hidden || !pane || !button) return null;
  const r=row.getBoundingClientRect(), p=pane.getBoundingClientRect(), b=button.getBoundingClientRect();
  const inWindow=(box)=>box.width>0 && box.height>0 && box.left>=0 && box.top>=0 && box.right<=innerWidth && box.bottom<=innerHeight;
  const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
  return {text:row.querySelector('span')?.textContent??null, inPane:r.left>=p.left-1 && r.right<=p.right+1 && r.top>=p.top-1 && r.bottom<=p.bottom+1, rowInWindow:inWindow(r), buttonInWindow:inWindow(b), buttonOnTop:button.contains(hit), label:button.textContent, viewport:[innerWidth,innerHeight], row:[r.left,r.top,r.right,r.bottom], pane:[p.left,p.top,p.right,p.bottom]};
})()`;

export async function commentsMarksPaging(renderer, check, waitFor, at, wide) {
  at(wide ? 'marks-paging-wide' : 'marks-paging-gate');
  const opened = async () => {
    await waitFor(renderer, `document.querySelector('[data-screen="editor"]')!==null && document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')!==null && document.querySelector('[data-edge-entry="comments"]')!==null`, 'marks-paging-editor-ready', 60_000);
    if (await renderer.evaluate(`document.querySelector('[data-edge-entry="comments"]').getAttribute('aria-expanded')!=='true'`)) await pointerClick(renderer, waitFor, '[data-edge-entry="comments"]', 'marks-paging-open-pane');
    try {
      await waitFor(renderer, `${PANE}?.hidden===false && document.querySelector('[data-edge-entry="comments"]').getAttribute('aria-expanded')==='true'`, 'marks-paging-pane-open');
    } catch {
      check(false, 'marks-paging-pane-open', await renderer.evaluate(`({expanded:document.querySelector('[data-edge-entry="comments"]')?.getAttribute('aria-expanded'),hidden:${PANE}?.hidden??null,right:document.documentElement.dataset.rightColumn??null,sidebar:document.documentElement.dataset.sidebar??null,viewport:[innerWidth,innerHeight]})`));
    }
  };
  await opened();
  // The text on screen carries more marks than one answer: the first 400, and the sentence says so.
  // The Book's reads answer once the screen has settled after the way in (they are not registered while it changes).
  await waitFor(renderer, `(async () => { try { globalThis.__marksFacts=await (${READ_WINDOW}); return true; } catch { return false; } })()`, 'marks-paging-window-read', 60_000);
  const facts = await renderer.evaluate('globalThis.__marksFacts');
  check(facts.total > 400 && facts.shown === 400, 'marks-paging-dense-window', { shown: facts.shown, total: facts.total });
  const sentence = `已显示 400 / ${facts.total} 条。`;
  await waitFor(renderer, `document.querySelector('[data-marks-paging]')?.hidden===false && document.querySelector('[data-marks-paging] span')?.textContent===${JSON.stringify(sentence)}`, 'marks-paging-sentence');
  // Wait for the pane to rest, then measure: the sentence and 显示更多 are inside the pane and the window, and 显示更多 is topmost.
  await waitFor(renderer, `new Promise((resolve)=>{const box=()=>JSON.stringify(document.querySelector('[data-marks-paging]')?.getBoundingClientRect());const first=box();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(box()===first)));})`, 'marks-paging-sentence-rest');
  const placed = await renderer.evaluate(SENTENCE);
  check(placed !== null && placed.text === sentence && placed.label === '显示更多' && placed.inPane && placed.rowInWindow && placed.buttonInWindow && placed.buttonOnTop, 'marks-paging-sentence-place', placed);
  // 显示更多 by a real click: the rest is loaded, the sentence is gone, and every open mark of the window is drawn in the text.
  // Each press reads one page of 400; the Book may hold applied marks of an earlier form in the same window, so there can be several.
  for (let shown = 400; shown < facts.total; shown += 400) {
    await pointerClick(renderer, waitFor, '[data-marks-paging] [data-marks-more]', 'marks-paging-more');
    const now = Math.min(facts.total, shown + 400);
    await waitFor(renderer, now >= facts.total ? `document.querySelector('[data-marks-paging]')?.hidden===true` : `document.querySelector('[data-marks-paging]')?.hidden===false && document.querySelector('[data-marks-paging] span')?.textContent===${JSON.stringify(`已显示 ${now} / ${facts.total} 条。`)} && document.querySelector('[data-marks-more]').disabled===false`, 'marks-paging-page-loaded', 60_000);
  }
  // The marks the pane did not have before the press: those past the first page (an earlier stage's mark may stand undrawn on page 1).
  const open = facts.marks.slice(400).filter((mark) => mark.status === 'open' && mark.anchorState === 'exact' && mark.kind !== 'personal-highlight');
  const drawn = await renderer.evaluate(`(() => { const ids=${JSON.stringify(open.map((mark) => mark.markId))};
    const missing=ids.filter((id)=>document.querySelector('.editor-window [data-mark-id="'+id+'"]')===null); return {ids:ids.length,missing:missing.length,first:missing.slice(0,3)}; })()`);
  check(drawn.ids > 0 && drawn.missing === 0, 'marks-paging-all-drawn', drawn);

  // The way back loads the first page again. 上一条待处理 from the end of the text, under the category the marks share, goes
  // straight to the last of them, which is beyond the 400th, whatever page the pane holds.
  await pointerClick(renderer, waitFor, '[data-nav-book-section="review"]', 'marks-paging-leave');
  await waitFor(renderer, `document.querySelector('.review-workspace-card')!==null`, 'marks-paging-left');
  await pointerClick(renderer, waitFor, '[data-nav-book-section="manuscript"]', 'marks-paging-return');
  await opened();
  await waitFor(renderer, `document.querySelector('[data-marks-paging]')?.hidden===false && document.querySelector('[data-marks-paging] span')?.textContent===${JSON.stringify(sentence)}`, 'marks-paging-sentence-again');
  // The caret at the end of the text: a real click in the last block of the window, then Ctrl+End.
  const LAST = `Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')).at(-1)`;
  await pointerClick(renderer, waitFor, '[data-testid="manuscript-editor"] > [data-block-id]:last-child', 'marks-paging-caret-click');
  await key(renderer, 'End', 'End', 35, 2);
  await waitFor(renderer, `(() => { const selection=getSelection(), last=${LAST}; if (!selection || !selection.isCollapsed || !last || !last.contains(selection.focusNode)) return false; const range=document.createRange(); range.setStart(selection.focusNode,selection.focusOffset); range.setEnd(last,last.childNodes.length); return range.toString()===''; })()`, 'marks-paging-caret-at-end');
  // The expectation, from the service's own read of the same step: where it lands and where that stands among the window's marks.
  const expected = await renderer.evaluate(`(async () => {
    const window_=await (${READ_WINDOW}), last=${LAST};
    const category=window_.marks.filter((mark)=>mark.status==='open' && mark.kind==='change-suggestion').at(-1)?.categoryKey??null;
    const found=await window.ai7.findPendingMark({manuscriptId:globalThis.__marksPaging.manuscriptId,branchId:globalThis.__marksPaging.branchId,from:{blockId:last.dataset.blockId,grapheme:1000000,markId:null},direction:'previous',categories:category===null?[]:[category],models:[]});
    const ordinal=found.mark===null?-1:window_.marks.findIndex((mark)=>mark.markId===found.mark.markId);
    return {category,markId:found.mark?.markId??null,ordinal,total:window_.total};
  })()`);
  check(expected.category !== null && expected.markId !== null && expected.ordinal >= 400, 'marks-paging-expected-beyond-first-page', expected);
  const isOpen = `document.querySelector('.editorial-mark-filter-popover').matches(':popover-open')`;
  await pointerClick(renderer, waitFor, '[data-mark-filter-toggle]', 'marks-paging-filter-open');
  await waitFor(renderer, isOpen, 'marks-paging-filter-opened');
  await pointerClick(renderer, waitFor, `[data-mark-category-filter="${expected.category}"]`, 'marks-paging-category');
  await waitFor(renderer, `document.querySelector('[data-mark-category-filter="${expected.category}"]').getAttribute('aria-pressed')==='true'`, 'marks-paging-category-on');
  await pointerClick(renderer, waitFor, '[data-mark-filter-toggle]', 'marks-paging-filter-close');
  await waitFor(renderer, `!(${isOpen})`, 'marks-paging-filter-closed');
  await pointerClick(renderer, waitFor, '[data-pending-step="previous"]', 'marks-paging-previous');
  // The card of that mark is selected, focused and inside the pane; its words are drawn inside the text's window; the pane holds
  // the pages up to that mark (all of them, and no sentence, when it stands on the last page).
  const held = Math.min(expected.total, Math.ceil((expected.ordinal + 1) / 400) * 400);
  const rowNow = `(() => { const row=document.querySelector('[data-marks-paging]'); return row===null || row.hidden ? 'none' : row.querySelector('span')?.textContent; })()`;
  const rowWant = held >= expected.total ? 'none' : `已显示 ${held} / ${expected.total} 条。`;
  const card = `[data-comment-card="${expected.markId}"]`;
  try {
    await waitFor(renderer, `(() => { const node=document.querySelector(${JSON.stringify(card)}); return node?.dataset.selected==='true' && node.dataset.revalidating==='false' && document.activeElement===node; })()`, 'marks-paging-card-selected', 60_000);
  } catch {
    check(false, 'marks-paging-card-selected', await renderer.evaluate(`(() => { const node=document.querySelector(${JSON.stringify(card)}); return {card:node!==null,selected:node?.dataset.selected??null,revalidating:node?.dataset.revalidating??null,hidden:node?.hidden??null,active:document.activeElement?.tagName+'.'+(document.activeElement?.className??'')+'['+(document.activeElement?.dataset?.commentCard??'')+']',selectedCard:document.querySelector('[data-comment-card][data-selected="true"]')?.dataset.commentCard??null,status:document.querySelector('#persistence-status')?.textContent??null,row:${rowNow},first:document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.dataset.blockId,paneHidden:${PANE}?.hidden,viewport:[innerWidth,innerHeight],filter:document.querySelector('[data-mark-filter-toggle]')?.textContent}; })()`));
  }
  await waitFor(renderer, `new Promise((resolve)=>{const box=()=>JSON.stringify([document.querySelector(${JSON.stringify(card)})?.getBoundingClientRect(),document.querySelector('.editor-window [data-mark-id="${expected.markId}"]')?.getBoundingClientRect()]);const first=box();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(box()===first)));})`, 'marks-paging-card-rest');
  const arrived = await renderer.evaluate(`(() => {
    const node=document.querySelector(${JSON.stringify(card)}), scroll=document.querySelector('.manuscript-comments-scroll'), words=document.querySelector('.editor-window [data-mark-id="${expected.markId}"]'), editor=document.querySelector('.editor-window');
    const inside=(a,b)=>a!==null && b!==null && a.width>0 && a.height>0 && a.left>=b.left-1 && a.right<=b.right+1 && a.top>=b.top-1 && a.bottom<=b.bottom+1;
    const rect=(element)=>element?.getBoundingClientRect()??null, view={left:0,top:0,right:innerWidth,bottom:innerHeight};
    return {card:inside(rect(node),rect(scroll)) && inside(rect(node),view), words:inside(rect(words),rect(editor)) && inside(rect(words),view), row:${rowNow}, cardBox:rect(node)&&[rect(node).left,rect(node).top,rect(node).right,rect(node).bottom], viewport:[innerWidth,innerHeight]};
  })()`);
  check(arrived.card && arrived.words && arrived.row === rowWant, 'marks-paging-arrived-beyond-first-page', { ...arrived, rowWant });
  // It can be accepted: 接受并应用 on its card, by a real click (a pointer decision stays on the page); the service records the Apply.
  await pointerClick(renderer, waitFor, `${card} [data-mark-action="accept-and-apply"]`, 'marks-paging-accept');
  check(await renderer.evaluate(`(async () => {
    for (let turn=0; turn<120; turn++) {
      const card=await window.ai7.getEditorialMarkCard({manuscriptId:globalThis.__marksPaging.manuscriptId,branchId:globalThis.__marksPaging.branchId,markId:${JSON.stringify(expected.markId)}});
      if (card.status==='applied' && card.suggestion?.application!==null) return true;
      await new Promise((done)=>setTimeout(done,250));
    }
    return false;
  })()`), 'marks-paging-accepted-beyond-first-page');
  // The decision does not throw the loaded pages away: the same pages are still held and its card stays where the editor left it.
  const kept = `${rowNow}===${JSON.stringify(rowWant)} && document.querySelector(${JSON.stringify(card)})!==null && document.querySelector('.editor-window [data-mark-id="${expected.markId}"]')!==null`;
  try {
    await waitFor(renderer, kept, 'marks-paging-decision-keeps-pages', 60_000);
  } catch {
    check(false, 'marks-paging-decision-keeps-pages', await renderer.evaluate(`({row:${rowNow},rowWant:${JSON.stringify(rowWant)},card:document.querySelector(${JSON.stringify(card)})!==null,words:document.querySelector('.editor-window [data-mark-id="${expected.markId}"]')!==null,anyWords:document.querySelector('[data-mark-id="${expected.markId}"]')!==null,first:document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.dataset.blockId,drawn:document.querySelectorAll('.editor-window [data-mark-id]').length,status:document.querySelector('#persistence-status')?.textContent??null})`));
  }
  await pointerClick(renderer, waitFor, '[data-mark-filter-toggle]', 'marks-paging-reset-open');
  await waitFor(renderer, isOpen, 'marks-paging-reset-opened');
  await pointerClick(renderer, waitFor, '[data-mark-category-filter="all"]', 'marks-paging-reset-category');
  await pointerClick(renderer, waitFor, '[data-mark-filter-toggle]', 'marks-paging-reset-close');
  await waitFor(renderer, `!(${isOpen}) && document.querySelector('[data-mark-filter-toggle]').textContent==='筛选'`, 'marks-paging-reset-done');
}
