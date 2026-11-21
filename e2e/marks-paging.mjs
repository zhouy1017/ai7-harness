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

/** Where the editor stands: the text's scroll position, the first block in view and its top, the selected card and the focused card. */
const PLACE = `(() => {
  const scroll=document.querySelector('.editor-window'), top=scroll.getBoundingClientRect().top;
  const first=Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')).find((node)=>node.getBoundingClientRect().bottom>top+1);
  return {scrollTop:Math.round(scroll.scrollTop), first:first?.dataset.blockId??null, firstTop:first?Math.round(first.getBoundingClientRect().top-top):null,
    selected:document.querySelector('[data-comment-card][data-selected="true"]')?.dataset.commentCard??null, active:document.activeElement?.closest('[data-comment-card]')?.dataset.commentCard??null,
    // The head of the selected card and of the focused element stand inside the window.
    boxes:(() => { const box=(node)=>{const r=node?.getBoundingClientRect(); return r?[Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)]:null;}; return {selected:box(document.querySelector('[data-comment-card][data-selected="true"]')),active:box(document.activeElement),activeTag:document.activeElement?.tagName+'.'+(document.activeElement?.className??'')+'['+(document.activeElement?.dataset?.markAction??'')+']',pane:box(document.querySelector('.manuscript-comments-scroll')),window:[innerWidth,innerHeight]}; })(),
    selectedInWindow:(() => { const r=document.querySelector('[data-comment-card][data-selected="true"]')?.getBoundingClientRect(); return !!r && r.width>0 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.top<=innerHeight-40; })(),
    activeInWindow:(() => { const r=document.activeElement?.getBoundingClientRect(); return !!r && r.width>0 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.top<=innerHeight-40; })()};
})()`;

/** Check final engine geometry; Tab reaches a taller card's action while the pane follows focus. */
export async function assertCardActionReachable(renderer, check, waitFor, selector, name) {
  const facts = `(() => {
    const card=document.querySelector(${JSON.stringify(selector)}), pane=document.querySelector('.manuscript-comments-scroll');
    const button=card?.querySelector('[data-mark-action="accept-and-apply"]');
    if (!card || !pane || !button) return null;
    const c=card.getBoundingClientRect(), p=pane.getBoundingClientRect(), b=button.getBoundingClientRect();
    const view={left:Math.max(0,p.left),top:Math.max(0,p.top),right:Math.min(innerWidth,p.left+pane.clientWidth),bottom:Math.min(innerHeight,p.top+pane.clientHeight)};
    const inside=r=>r.width>0 && r.height>0 && r.left>=view.left && r.right<=view.right && r.top>=view.top && r.bottom<=view.bottom;
    const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    const line=parseFloat(getComputedStyle(card).lineHeight)||parseFloat(getComputedStyle(card).fontSize)*1.2;
    return {branch:c.height<=view.bottom-view.top?'fits':'tall',cardHeight:c.height,paneHeight:view.bottom-view.top,whole:inside(c),head:c.top>=view.top && c.top+line<=view.bottom,
      action:inside(b) && (hit===button || button.contains(hit)),card:[c.left,c.top,c.right,c.bottom],button:[b.left,b.top,b.right,b.bottom],pane:view,window:[innerWidth,innerHeight],scrollTop:pane.scrollTop,
      x:(view.left+view.right)/2,y:(view.top+view.bottom)/2,delta:Math.max(40,Math.min((view.bottom-view.top)*0.7,b.bottom-view.bottom+8))};
  })()`;
  await waitFor(renderer, `new Promise(resolve=>{const before=JSON.stringify(${facts});requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(before===JSON.stringify(${facts}))));})`, name+'-rest');
  const before=await renderer.evaluate(facts);
  console.log('COMMENTS_ACTION_ARRIVAL/'+name+'/'+JSON.stringify(before));
  check(before!==null && (before.branch==='fits'?before.whole && before.action:before.head), name+'-arrival', before);
  if (before.branch==='tall') {
    const focused=`document.activeElement===document.querySelector(${JSON.stringify(selector)})?.querySelector('[data-mark-action="accept-and-apply"]')`;
    const trail=[];
    for (let turn=0;turn<40 && !(await renderer.evaluate(focused));turn++) {
      trail.push(await renderer.evaluate(`({tag:document.activeElement?.tagName,action:document.activeElement?.dataset?.markAction??null})`));
      await renderer.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
      await renderer.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
    }
    check(await renderer.evaluate(focused),name+'-tab-reached',{trail,arrival:before});
    const focusBox=await renderer.evaluate(facts);
    await renderer.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:(focusBox.button[0]+focusBox.button[2])/2,y:(focusBox.button[1]+focusBox.button[3])/2,buttons:0});
    await waitFor(renderer, `new Promise(resolve=>{const before=JSON.stringify(${facts});requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(before===JSON.stringify(${facts}))));})`, name+'-tab-rest');
  }
  const after=await renderer.evaluate(facts);
  console.log('COMMENTS_ACTION/'+name+'/'+JSON.stringify({arrival:before,after}));
  check(after?.action===true,name+'-action',{...after,branch:before.branch,arrival:before});
}

/** The action was revealed by the reader already: measure and press without moving either pane. */
async function pressCardAction(renderer, waitFor, selector, name) {
  const query=JSON.stringify(selector);
  const point=`(() => { const node=document.querySelector(${query}), r=node?.getBoundingClientRect();
    if (!r || r.width<=0 || r.height<=0 || r.left<0 || r.top<0 || r.right>innerWidth || r.bottom>innerHeight) return null;
    const x=r.left+r.width/2,y=r.top+r.height/2;
    return node.contains(document.elementFromPoint(x,y))?{x,y,width:r.width,height:r.height}:null;
  })()`;
  try {
    await waitFor(renderer,`new Promise(resolve=>requestAnimationFrame(()=>{const before=${point};requestAnimationFrame(()=>{const after=${point};resolve(before!==null&&after!==null&&JSON.stringify(before)===JSON.stringify(after));});}))`,name+'-pointer-target');
    const ready=await renderer.evaluate(point);
    if (ready===null) throw new Error(name+'-target-moved-before-press');
    const at={x:ready.x,y:ready.y};
    await renderer.send('Input.dispatchMouseEvent',{type:'mousePressed',...at,button:'left',buttons:1,clickCount:1});
    const hit=await renderer.evaluate(`document.querySelector(${query})?.contains(document.elementFromPoint(${at.x},${at.y}))===true`);
    await renderer.send('Input.dispatchMouseEvent',{type:'mouseReleased',...at,button:'left',buttons:0,clickCount:1});
    if (!hit) throw new Error(name+'-target-moved-after-press');
  } catch(error) { console.log('COMMENTS_ACTION_PRESS/'+name+'/'+error.message); throw error; }
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

/**
 * The Book's position rail moved by real input: a pointer press on a point of the track at `fraction` of its length (a point no rail
 * marker covers: a press on a marker jumps to its block instead), and for the start of the Book the Home key on the track the press
 * focused. The track stands inside the window and is topmost at the point pressed.
 */
export async function railJump(renderer, waitFor, check, fraction, name) {
  const TRACK = '#manuscript-position[role="slider"]';
  const point = `(() => { const track=document.querySelector(${JSON.stringify(TRACK)}); if(!track) return null; const r=track.getBoundingClientRect();
    if (r.width<=0 || r.height<=0 || r.left<0 || r.top<0 || r.right>innerWidth || r.bottom>innerHeight) return null;
    const x=r.left+r.width/2, wanted=r.top+Math.min(r.height-2, Math.max(2, r.height*${fraction}));
    for (let step=0; step<=40; step+=1) for (const y of [wanted+step, wanted-step]) { if (y<r.top+1 || y>r.bottom-1) continue; const hit=document.elementFromPoint(x,y); if (hit && track.contains(hit) && !hit.closest('.rail-marker')) return {x,y}; }
    return null; })()`;
  // The same wait as `pointerClick`: the chosen point and its hit test are the same on two consecutive frames before the pointer moves
  // there, and are checked again once it has, before it presses.
  await waitFor(renderer, `new Promise((resolve)=>requestAnimationFrame(()=>{const before=${point};requestAnimationFrame(()=>{const after=${point};resolve(before!==null&&after!==null&&before.x===after.x&&before.y===after.y);});}))`, `${name}-track-point-stable`);
  const at = await renderer.evaluate(point);
  check(at !== null, `${name}-track-point`);
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at, button: 'none', buttons: 0 });
  const held = await renderer.evaluate(`new Promise((resolve)=>requestAnimationFrame(()=>{const track=document.querySelector(${JSON.stringify(TRACK)}),hit=document.elementFromPoint(${at.x},${at.y}),now=${point};resolve(!!track&&!!hit&&track.contains(hit)&&!hit.closest('.rail-marker')&&now!==null&&now.x===${at.x}&&now.y===${at.y});}))`);
  check(held === true, `${name}-track-point-held`);
  await renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 });
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 });
  if (fraction === 0) {
    await waitFor(renderer, `document.activeElement===document.querySelector(${JSON.stringify(TRACK)})`, `${name}-track-focused`);
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
    await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
  }
}

/** 显示更多 by real clicks until the window holds every mark; nothing to do for a window that carries them all. */
export async function loadEveryMark(renderer, waitFor) {
  const row = `document.querySelector('[data-marks-paging]')`;
  for (let page = 0; page < 8 && await renderer.evaluate(`${row}!==null && ${row}.hidden===false`); page += 1) {
    const before = await renderer.evaluate(`${row}.querySelector('span')?.textContent`);
    await pointerClick(renderer, waitFor, '[data-marks-paging] [data-marks-more]', 'marks-paging-load-every-mark');
    await waitFor(renderer, `${row}.hidden===true || (${row}.querySelector('span')?.textContent!==${JSON.stringify(before)} && ${row}.querySelector('[data-marks-more]').disabled===false)`, 'marks-paging-every-mark-page', 60_000);
  }
}

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
  // The caret in the paragraph after the last mark's, by a real click: the step then goes back to that mark. The caret stands in the
  // middle of the window, so reading the mark's place does not carry the text past the window's end into the next window.
  const LAST = `Array.from(document.querySelectorAll('[data-testid="manuscript-editor"] > [data-block-id]')).at(-1)`;
  const lastMark = facts.marks.filter((mark) => mark.status === 'open' && mark.kind === 'change-suggestion').at(-1);
  const after = await renderer.evaluate(`document.querySelector('[data-testid="manuscript-editor"] > [data-block-id="${lastMark.blockId}"]')?.nextElementSibling?.dataset.blockId??'${lastMark.blockId}'`);
  const BLOCK = `[data-testid="manuscript-editor"] > [data-block-id="${after}"]`;
  await pointerClick(renderer, waitFor, BLOCK, 'marks-paging-caret-click');
  await waitFor(renderer, `(() => { const selection=getSelection(), block=document.querySelector(${JSON.stringify(BLOCK)}); return selection?.isCollapsed===true && block!==null && block.contains(selection.focusNode); })()`, 'marks-paging-caret-in-paragraph');
  // The expectation, from the service's own read of the same step: where it lands and where that stands among the window's marks.
  // The step starts from the selected card when the caret stands on a mark (at the end of the last paragraph it may), else from the caret.
  await renderer.evaluate(`new Promise((done)=>requestAnimationFrame(()=>requestAnimationFrame(done)))`);
  const expected = await renderer.evaluate(`(async () => {
    const window_=await (${READ_WINDOW});
    const category=window_.marks.filter((mark)=>mark.status==='open' && mark.kind==='change-suggestion').at(-1)?.categoryKey??null;
    const selected=window_.marks.find((mark)=>mark.markId===document.querySelector('[data-comment-card][data-selected="true"]')?.dataset.commentCard);
    const selection=getSelection(), block=document.querySelector(${JSON.stringify(BLOCK)}), range=document.createRange(); range.setStart(block,0); range.setEnd(selection.focusNode,selection.focusOffset);
    const from=selected===undefined?{blockId:block.dataset.blockId,grapheme:Array.from(range.toString()).length,markId:null}:{blockId:selected.blockId,grapheme:selected.from,markId:selected.markId};
    const found=await window.ai7.findPendingMark({manuscriptId:globalThis.__marksPaging.manuscriptId,branchId:globalThis.__marksPaging.branchId,from,direction:'previous',categories:category===null?[]:[category],models:[]});
    const ordinal=found.mark===null?-1:window_.marks.findIndex((mark)=>mark.markId===found.mark.markId);
    return {category,markId:found.mark?.markId??null,ordinal,total:window_.total,fromSelected:selected!==undefined};
  })()`);
  check(expected.category !== null && expected.markId !== null && expected.ordinal >= 400, 'marks-paging-expected-beyond-first-page', expected);
  const isOpen = `document.querySelector('.editorial-mark-filter-popover').matches(':popover-open')`;
  await pointerClick(renderer, waitFor, '[data-mark-filter-toggle]', 'marks-paging-filter-open');
  await waitFor(renderer, isOpen, 'marks-paging-filter-opened');
  await pointerClick(renderer, waitFor, `[data-mark-category-filter="${expected.category}"]`, 'marks-paging-category');
  await waitFor(renderer, `document.querySelector('[data-mark-category-filter="${expected.category}"]').getAttribute('aria-pressed')==='true'`, 'marks-paging-category-on');
  await pointerClick(renderer, waitFor, '[data-mark-filter-toggle]', 'marks-paging-filter-close');
  await waitFor(renderer, `!(${isOpen})`, 'marks-paging-filter-closed');
  const caretBefore = await renderer.evaluate(`(() => { const selection=getSelection(), block=(selection?.focusNode?.parentElement??null)?.closest('[data-block-id]'); return {block:block?.dataset.blockId.slice(-6)??null,last:${LAST}?.dataset.blockId.slice(-6),focusInEditor:document.activeElement?.closest('.ProseMirror')!==null,active:document.activeElement?.tagName}; })()`);
  const startBefore = await renderer.evaluate(`document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.dataset.blockId`);
  await pointerClick(renderer, waitFor, '[data-pending-step="previous"]', 'marks-paging-previous');
  // What the page did in the seconds after the press, kept for the failure message.
  const trace = await renderer.evaluate(`(async () => { const rows=[]; for (let turn=0; turn<30; turn++) { rows.push([turn*100, document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.dataset.blockId?.slice(-6), document.querySelectorAll('.editor-window [data-mark-id]').length, document.querySelector('[data-comment-card][data-selected="true"]')?.dataset.commentCard?.slice(0,6)??null, document.querySelector('#persistence-status')?.textContent??null, document.querySelector('[data-marks-paging] span')?.textContent??null]); await new Promise((done)=>setTimeout(done,100)); } return rows.filter((row,index)=>index===0||JSON.stringify(row.slice(1))!==JSON.stringify(rows[index-1].slice(1))); })()`);
  // The card is selected and focused, with its action reachable; its words are drawn inside the text's window; the pane holds
  // the pages up to that mark (all of them, and no sentence, when it stands on the last page).
  const held = Math.min(expected.total, Math.ceil((expected.ordinal + 1) / 400) * 400);
  const rowNow = `(() => { const row=document.querySelector('[data-marks-paging]'); return row===null || row.hidden ? 'none' : row.querySelector('span')?.textContent; })()`;
  const rowWant = held >= expected.total ? 'none' : `已显示 ${held} / ${expected.total} 条。`;
  const card = `[data-comment-card="${expected.markId}"]`;
  try {
    await waitFor(renderer, `(() => { const node=document.querySelector(${JSON.stringify(card)}); return node?.dataset.selected==='true' && node.dataset.revalidating==='false' && document.activeElement===node; })()`, 'marks-paging-card-selected', 60_000);
  } catch {
    check(false, 'marks-paging-card-selected', await renderer.evaluate(`(() => { const node=document.querySelector(${JSON.stringify(card)}); return {card:node!==null,selected:node?.dataset.selected??null,revalidating:node?.dataset.revalidating??null,hidden:node?.hidden??null,active:document.activeElement?.tagName+'.'+(document.activeElement?.className??'')+'['+(document.activeElement?.dataset?.commentCard??'')+']',selectedCard:document.querySelector('[data-comment-card][data-selected="true"]')?.dataset.commentCard??null,status:document.querySelector('#persistence-status')?.textContent??null,row:${rowNow},first:document.querySelector('[data-testid="manuscript-editor"] [data-block-id]')?.dataset.blockId,paneHidden:${PANE}?.hidden,viewport:[innerWidth,innerHeight],filter:document.querySelector('[data-mark-filter-toggle]')?.textContent,trace:${JSON.stringify(trace)},caretBefore:${JSON.stringify(caretBefore)},expected:${JSON.stringify(expected)},startBefore:${JSON.stringify(startBefore)},drawn:document.querySelectorAll('.editor-window [data-mark-id]').length,wordsX:document.querySelector('[data-mark-id="${expected.markId}"]')!==null,cards:document.querySelectorAll('[data-comment-card]').length,hiddenCards:Array.from(document.querySelectorAll('[data-comment-card]')).filter((node)=>node.hidden).length,summary:document.querySelector('.editorial-mark-filter-summary')?.textContent,pending:document.querySelector('[data-comments-book-pending]')?.textContent}; })()`));
  }
  await waitFor(renderer, `new Promise((resolve)=>{const box=()=>JSON.stringify([document.querySelector(${JSON.stringify(card)})?.getBoundingClientRect(),document.querySelector('.editor-window [data-mark-id="${expected.markId}"]')?.getBoundingClientRect()]);const first=box();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(box()===first)));})`, 'marks-paging-card-rest');
  const arrived = await renderer.evaluate(`(() => {
    const node=document.querySelector(${JSON.stringify(card)}), scroll=document.querySelector('.manuscript-comments-scroll'), words=document.querySelector('.editor-window [data-mark-id="${expected.markId}"]'), editor=document.querySelector('.editor-window');
    const inside=(a,b)=>a!==null && b!==null && a.width>0 && a.height>0 && a.left>=b.left-1 && a.right<=b.right+1 && a.top>=b.top-1 && a.bottom<=b.bottom+1;
    const rect=(element)=>element?.getBoundingClientRect()??null, view={left:0,top:0,right:innerWidth,bottom:innerHeight};
    const cardBox=rect(node), paneBox=rect(scroll);
    const visibleHeight=Math.min(innerHeight,paneBox.top+scroll.clientHeight)-Math.max(0,paneBox.top);
    return {card:cardBox.height<=visibleHeight?inside(cardBox,paneBox) && inside(cardBox,view):cardBox.top>=Math.max(0,paneBox.top) && cardBox.top+24<=Math.min(innerHeight,paneBox.bottom), words:inside(rect(words),rect(editor)) && inside(rect(words),view), row:${rowNow}, cardBox:[cardBox.left,cardBox.top,cardBox.right,cardBox.bottom], cardHeight:cardBox.height,paneHeight:visibleHeight,branch:cardBox.height<=visibleHeight?'fits':'tall',viewport:[innerWidth,innerHeight]};
  })()`);
  check(arrived.card && arrived.words && arrived.row === rowWant, 'marks-paging-arrived-beyond-first-page', { ...arrived, rowWant });
  // It can be accepted: 接受并应用 on its card, by a real click (a pointer decision stays on the page); the service records the Apply.
  // The next pending card of the marks' category after this one, in the window's reading order: where a pointer decision goes on to.
  const around = await renderer.evaluate(`(async () => { const read=await (${READ_WINDOW}); const at=read.marks.findIndex((mark)=>mark.markId===${JSON.stringify(expected.markId)});
    return read.marks.slice(at+1).find((mark)=>mark.kind!=='personal-highlight' && mark.status==='open' && mark.categoryKey===${JSON.stringify(expected.category)})?.markId??null; })()`);
  const wantSelected = around ?? expected.markId;
  const placeBefore = await renderer.evaluate(PLACE);
  await assertCardActionReachable(renderer, check, waitFor, card, 'marks-paging-accept');
  await pressCardAction(renderer, waitFor, `${card} [data-mark-action="accept-and-apply"]`, 'marks-paging-accept');
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
  // At the window's last pending mark (`around` is null) there is no card to go on to: the card stays selected and the focus is where an
  // ordinary window leaves it (the re-drawn card does not hold it; the unit parity case for the last mark pins that).
  // The editor's place is kept: the same paragraph at the top of the text and the scroll where it was (to a few lines, as the applied
  // words reflow), and the next pending card is selected and focused (a pointer decision stays on the page), as in a window that
  // holds every mark; both stand inside the window.
  try {
    await waitFor(renderer, `(() => { const place=${PLACE}; return place.selected===${JSON.stringify(wantSelected)} && (${JSON.stringify(around)}===null || place.active===${JSON.stringify(wantSelected)}); })()`, 'marks-paging-decision-keeps-place', 60_000);
  } catch { /* said below with what stood */ }
  await waitFor(renderer, `new Promise((resolve)=>{const box=()=>JSON.stringify(${PLACE});const first=box();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(box()===first)));})`, 'marks-paging-decision-place-rest');
  const placeAfter = await renderer.evaluate(PLACE);
  console.log('COMMENTS_DECISION_PLACE/'+JSON.stringify({placeBefore,placeAfter,next:around}));
  check(placeAfter.first === placeBefore.first && Math.abs(placeAfter.scrollTop - placeBefore.scrollTop) <= Math.round((await renderer.evaluate('innerHeight')) / 4) && placeAfter.selected === wantSelected && (around === null || placeAfter.active === wantSelected) && placeAfter.selectedInWindow && placeAfter.activeInWindow,
    'marks-paging-decision-keeps-place', { placeBefore, placeAfter, next: around });
  await pointerClick(renderer, waitFor, '[data-mark-filter-toggle]', 'marks-paging-reset-open');
  await waitFor(renderer, isOpen, 'marks-paging-reset-opened');
  await pointerClick(renderer, waitFor, '[data-mark-category-filter="all"]', 'marks-paging-reset-category');
  await pointerClick(renderer, waitFor, '[data-mark-filter-toggle]', 'marks-paging-reset-close');
  await waitFor(renderer, `!(${isOpen}) && document.querySelector('[data-mark-filter-toggle]').textContent==='筛选'`, 'marks-paging-reset-done');
}
