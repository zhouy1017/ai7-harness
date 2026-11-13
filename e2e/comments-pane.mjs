import { SIDEBAR, sidebarNavigate } from './controller.mjs';

// All async service operations are evaluated directly and awaited; waitFor receives synchronous DOM predicates only.
export async function commentsOrdinaryMode(renderer, check, waitFor) {
  await waitFor(renderer, `document.documentElement.dataset.ai7ProductReady === 'true' && document.querySelector('[data-screen="landing"]')`, 'comments-startup-landing');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.settings)), 'comments-settings');
  await waitFor(renderer, `document.querySelector('[data-screen="settings"]')`, 'comments-settings-ready');
  check(await renderer.evaluate(`(() => { const help=document.querySelector('.settings-hub-row[data-settings-route="help"]') ?? Array.from(document.querySelectorAll('[data-screen="settings"] button')).find((button)=>button.textContent==='帮助'); if(!help||help.disabled)return false; help.click(); return true; })()`), 'comments-settings-help');
  await waitFor(renderer, `document.querySelector('.help-developer-mode input[aria-label="开发者模式"]')?.disabled===false`, 'comments-enabled-mode-toggle');
  check(await renderer.evaluate(`(() => { const input=document.querySelector('.help-developer-mode input[aria-label="开发者模式"]'); if(input.checked)input.click(); return true; })()`), 'comments-mode-off');
  await waitFor(renderer, `document.documentElement.dataset.technicalLayerVisible==='false'`, 'comments-ordinary-mode');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.destination('library'))), 'comments-return-library');
  await waitFor(renderer, `document.querySelector('[data-screen="landing"]')`, 'comments-library-ready');
}

export async function commentsLayouts(renderer, check, waitFor) {
  const native = await renderer.evaluate(`({ width: innerWidth, height: innerHeight })`);
  for (const size of [native, { width: 1280, height: 800 }, { width: 1008, height: 681 }, { width: 640, height: 681 }]) {
    await renderer.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false });
    check(await renderer.evaluate(`(() => { const entry=document.querySelector('[data-edge-entry="comments"]'); if(!entry||entry.disabled)return false; if(entry.getAttribute('aria-expanded')!=='true')entry.click(); return true; })()`), 'comments-layout-open');
    await waitFor(renderer, `(() => { const panel=document.querySelector('.manuscript-comments-pane'), text=document.querySelector('.manuscript-surface'), edge=document.querySelector('.editor-edge'); const p=panel.getBoundingClientRect(), t=text.getBoundingClientRect(), e=edge.getBoundingClientRect(); return !panel.hidden && p.height>100 && p.right<=e.left+1 && p.bottom<=innerHeight+1 && (innerWidth>=1120 ? p.width>=300 && p.width<=340 && t.right<=p.left+1 : getComputedStyle(panel).position==='absolute' && p.left>=document.querySelector('.editor-workspace').getBoundingClientRect().left-1); })()`, 'comments-responsive-geometry');
    check(await renderer.evaluate(`(() => { document.querySelector('[data-view-command="focus-mode"]').click(); return document.documentElement.dataset.focusMode==='on' && getComputedStyle(document.querySelector('.manuscript-comments-pane')).display==='none'; })()`), 'comments-focus-hidden');
    check(await renderer.evaluate(`(() => { document.querySelector('[data-view-command="focus-mode"]').click(); return document.documentElement.dataset.focusMode==='off' && !document.querySelector('.manuscript-comments-pane').hidden; })()`), 'comments-focus-restored');
    check(await renderer.evaluate(`(() => { document.querySelector('.manuscript-comments-heading [aria-label="关闭批注栏"]').click(); return document.querySelector('.manuscript-comments-pane').hidden; })()`), 'comments-layout-close');
  }
  await renderer.send('Emulation.clearDeviceMetricsOverride');
  await waitFor(renderer, `innerWidth===${native.width} && innerHeight===${native.height}`, 'comments-native-viewport-restored');
  check(await renderer.evaluate(`(() => { document.querySelector('[data-view-command="menu"]').click(); const button=document.querySelector('[data-view-command="toggle-comments"]'); if(!button||button.disabled)return false; button.click(); return document.querySelector('[data-edge-entry="comments"]').getAttribute('aria-expanded')==='true' && button.getAttribute('aria-pressed')==='true'; })()`), 'comments-view-menu-synchronized');
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F9', code: 'F9', windowsVirtualKeyCode: 120 });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F9', code: 'F9', windowsVirtualKeyCode: 120 });
  await waitFor(renderer, `document.querySelector('.manuscript-comments-pane').hidden===true && document.querySelector('[data-view-command="toggle-comments"]').getAttribute('aria-pressed')==='false'`, 'comments-f9-synchronized');
}

export async function seedCommentsPane(renderer, check, waitFor) {
  await renderer.send('Emulation.setDeviceMetricsOverride', { width:1280, height:800, deviceScaleFactor:1, mobile:false });
  check(await renderer.evaluate(`(async () => {
    const editor=document.querySelector('[data-testid="manuscript-editor"]');
    const bookId=document.querySelector('.editor-shell').dataset.bookId;
    const work=(await window.ai7.listPriorWork()).find((item)=>item.bookId===bookId);
    const binding={manuscriptId:work.manuscriptId,branchId:work.branchId};
    const start=editor.querySelector('[data-block-id]').dataset.blockId;
    const page=await window.ai7.getManuscriptWindowAt({...binding,target:{kind:'window-start',blockId:start}});
    const paragraphs=page.blocks.filter(item=>item.kind==='paragraph');
    const short=item=>item && Array.from(item.text??'').length>=20 && Array.from(item.text??'').length<=120;
    const block=paragraphs.find((item,index)=>index>=10 && short(item) && short(paragraphs[index+1])) ?? paragraphs.find((item,index)=>short(item) && short(paragraphs[index+1]));
    if(!block)return false;
    const second=paragraphs[paragraphs.indexOf(block)+1];
    if(!second)return false;
    const ids=[]; const kinds=['change-suggestion','change-suggestion','annotation','annotation','editor-note'];
    for(let index=0;index<12;index++){
      const current=index<5?block:second;
      const words=Array.from(new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(current.text),item=>item.segment);
      const from=index<5?index*3:(index-5)*2, to=from+2;
      const result=await window.ai7.createEditorialMark({...binding,windowStartBlockId:start,clientMarkId:crypto.randomUUID(),baseRevisionId:page.revisionId,expectedJournalSequence:page.journalSequence,blockId:current.blockId,baseBlockDigest:current.digest,fromGrapheme:from,toGrapheme:to,selectedText:words.slice(from,to).join(''),kind:kinds[index]??'annotation',highlightColor:null,body:index>=2?'公开合成批注 '+index:'',proposedText:index<2?'合成':null,rationale:index<2?'公开合成理由':null});
      ids.push(result.markId);
    }
    globalThis.__comments={...binding,bookId,blockId:block.blockId,start,ids,journal:page.journalSequence};
    document.querySelector('.editorial-mark-layer [data-mark-action="close"]')?.click();
    return true;
  })()`), 'comments-seed-five');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.section('overview'))), 'comments-reload-overview');
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'comments-overview-ready');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.section('manuscript'))), 'comments-reload-manuscript');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')`, 'comments-editor-ready');
  check(await renderer.evaluate(`(async () => { const entry=document.querySelector('[data-edge-entry="comments"]'); if(entry.getAttribute('aria-expanded')!=='true')entry.click(); document.querySelector('[data-mark-filter-toggle]').focus({preventScroll:true}); await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))); const editor=document.querySelector('[data-testid="manuscript-editor"]'); editor.querySelector('[data-block-id="'+__comments.blockId+'"]').scrollIntoView({block:'center',behavior:'instant'}); await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))); return true; })()`), 'comments-open');
  try { await waitFor(renderer, `(() => { const scroll=document.querySelector('.editor-window'),v=scroll.getBoundingClientRect(),first=document.querySelector('.editor-window [data-mark-id="'+__comments.ids[0]+'"]'),last=document.querySelector('.editor-window [data-mark-id="'+__comments.ids[11]+'"]'); if(first&&last&&(first.getBoundingClientRect().top<v.top||last.getBoundingClientRect().bottom>v.bottom)){scroll.scrollTop+=first.getBoundingClientRect().top-v.top-100;return false;} return __comments.ids.every(id=>document.querySelector('[data-comment-card="'+id+'"]')?.hidden===false) && document.querySelector('.manuscript-comments-canvas').dataset.loading==='false'; })()`, 'comments-five-visible'); } catch {
    const geometry=await renderer.evaluate(`(() => { const scroll=document.querySelector('.editor-window'),pane=document.querySelector('.manuscript-comments-scroll'),canvas=document.querySelector('.manuscript-comments-canvas'),v=scroll.getBoundingClientRect(); return {viewportTop:v.top,viewportBottom:v.bottom,textScroll:scroll.scrollTop,paneScroll:pane.scrollTop,loading:canvas.dataset.loading,reads:canvas.dataset.cardReads,seeds:__comments.ids.map(id=>{const a=document.querySelector('.editor-window [data-mark-id="'+id+'"]'),c=document.querySelector('[data-comment-card="'+id+'"]'),r=a?.getBoundingClientRect();return {anchor:!!a,top:r?.top,bottom:r?.bottom,card:!!c,hidden:c?.hidden,read:c?.dataset.revalidating};})}; })()`);
    check(false,'comments-five-visible',geometry);
  }
  // #1429: use the existing complete comments journey to exercise category/search linkage.
  check(await renderer.evaluate(`(() => {
    const pane=document.querySelector('.manuscript-comments-pane');
    const cards=__comments.ids.map(id=>pane.querySelector('[data-mark-card="'+id+'"]'));
    const inline=__comments.ids.map(id=>document.querySelector('.editor-window [data-mark-id="'+id+'"]'));
    if(!cards.every(card=>card?.dataset.markCategory==='editor' && card.querySelector('.editorial-mark-category-badge')?.textContent==='编辑修订') || !inline.every(mark=>mark?.dataset.markCategory==='editor'))return false;
    pane.querySelector('[data-mark-filter-toggle]').click();
    pane.querySelector('[data-mark-category-filter="editor"]').click();
    const input=pane.querySelector('[data-mark-search-input]'); input.value='公开合成批注 2'; input.dispatchEvent(new Event('input',{bubbles:true}));
    globalThis.__commentsSearch=input; return true;
  })()`), 'comments-category-badges-and-search');
  await waitFor(renderer, `(() => {
    const pane=document.querySelector('.manuscript-comments-pane');
    return __comments.ids.every((id,index)=>pane.querySelector('[data-comment-card="'+id+'"]')?.hidden===(index!==2)) &&
      __comments.ids.every((id,index)=>document.querySelector('.editor-window [data-mark-id="'+id+'"]')?.dataset.markFilteredOut===(index===2?undefined:'true'));
  })()`, 'comments-search-cards-and-highlights');
  check(await renderer.evaluate(`(() => { window.dispatchEvent(new Event('resize')); return document.querySelector('[data-mark-search-input]')===__commentsSearch && __commentsSearch.value==='公开合成批注 2' && document.querySelector('[data-mark-category-filter="editor"]').getAttribute('aria-pressed')==='true'; })()`), 'comments-filter-controls-survive-redraw');
  check(await renderer.evaluate(`(() => { document.querySelector('[data-mark-status-filter="handled"]').click(); return true; })()`), 'comments-status-handled');
  await waitFor(renderer, `__comments.ids.every(id=>document.querySelector('[data-comment-card="'+id+'"]')?.hidden===true)`, 'comments-status-no-match');
  check(await renderer.evaluate(`(() => { __commentsSearch.value=''; __commentsSearch.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-mark-status-filter="all"]').click(); document.querySelector('[data-mark-category-filter="all"]').click(); return true; })()`), 'comments-filter-reset');
  await waitFor(renderer, `__comments.ids.every(id=>document.querySelector('[data-comment-card="'+id+'"]')?.hidden===false && !document.querySelector('.editor-window [data-mark-id="'+id+'"][data-mark-filtered-out]'))`, 'comments-filter-all-restored');
  await renderer.evaluate(`(() => { const popover=document.querySelector('.editorial-mark-filter-popover'); if(popover.matches(':popover-open'))popover.hidePopover(); return true; })()`);
}

// Native input is intentional: focus and pointer-down must take the same path as an editor's first click.
async function commentsNativeClick(renderer, point) {
  if (!point) return { target: false };
  await renderer.evaluate(`(() => { globalThis.__commentsClickTrace={}; for(const type of ['mousedown','mouseup','click']) document.addEventListener(type,()=>{__commentsClickTrace[type]=true;},{capture:true,once:true}); return true; })()`);
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 });
  await renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  const held = await renderer.evaluate(`(async () => { await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))); const node=document.elementFromPoint(${point.x},${point.y})?.closest('[data-comment-card]'); return {top:node?.getBoundingClientRect().top,selected:node?.dataset.selected,expanded:node?.dataset.expanded}; })()`);
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
  const events = await renderer.evaluate(`new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(__commentsClickTrace))))`);
  return { target: true, held, events, real:events.mousedown===true && events.mouseup===true && events.click===true };
}

async function commentsControlPoint(renderer, index, action) {
  return renderer.evaluate(`(async () => {
    const node=document.querySelector('[data-comment-card="'+__comments.ids[${index}]+'"]'), button=node.querySelector('[data-mark-action="${action}"]');
    button.scrollIntoView({block:'nearest',behavior:'instant'});
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    return {x,y,hit:button.contains(document.elementFromPoint(x,y))};
  })()`);
}

async function commentsSelectCard(renderer, check, waitFor, index) {
  const point=await renderer.evaluate(`(async () => {
    const node=document.querySelector('[data-comment-card="'+__comments.ids[${index}]+'"]'), pane=document.querySelector('.manuscript-comments-scroll');
    pane.scrollTop+=node.getBoundingClientRect().top-pane.getBoundingClientRect().top-24;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const r=node.getBoundingClientRect();return {x:r.left+12,y:r.top+10};
  })()`);
  const click=await commentsNativeClick(renderer,point);
  check(click.real,'comments-compact-card-real-click',click);
  await waitFor(renderer, `(() => {const node=document.querySelector('[data-comment-card="'+__comments.ids[${index}]+'"]');return node.dataset.selected==='true'&&node.dataset.expanded==='true'&&!node.querySelector('.editorial-mark-expanded-content').hidden;})()`, 'comments-selected-expanded');
  return click;
}

const commentsUnmarkedPoint = `(() => {
  const words=document.querySelector('.editor-window [data-mark-id="'+__comments.ids[11]+'"]'), block=words.closest('[data-block-id]');
  const walk=document.createTreeWalker(block,NodeFilter.SHOW_TEXT); let node, last;
  while(node=walk.nextNode()) if(node.textContent.trim() && !node.parentElement.closest('[data-mark-id]'))last=node;
  if(!last)return null;
  const range=document.createRange(); range.selectNodeContents(last); const rects=range.getClientRects(), r=rects[rects.length-1];
  const x=r.right-3,y=r.top+r.height/2; return document.elementFromPoint(x,y)?.closest('[data-mark-id]')?null:{x,y};
})()`;

export async function commentsGeometryAndScroll(renderer, check, waitFor) {
  await renderer.send('Page.bringToFront');
  await renderer.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const coordinates = await renderer.evaluate(`(async () => {
    const pane=document.querySelector('.manuscript-comments-scroll'), scroll=document.querySelector('.editor-window');
    const search=document.querySelector('[data-mark-search-input]'); document.querySelector('[data-mark-filter-toggle]').focus({preventScroll:true}); getSelection().removeAllRanges();
    search.value='公开合成不匹配筛选'; search.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    search.value=''; search.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const words=document.querySelector('.editor-window [data-mark-id="'+__comments.ids[0]+'"]');
    words.scrollIntoView({block:'center',behavior:'instant'}); scroll.scrollTop+=words.getBoundingClientRect().top-pane.getBoundingClientRect().top-40;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const cards=Array.from(document.querySelectorAll('[data-comment-card]')).filter(node=>!node.hidden).sort((a,b)=>parseFloat(a.style.top)-parseFloat(b.style.top));
    const first=cards[0],last=cards[cards.length-1], before=first.getBoundingClientRect().top, oldScroll=pane.scrollTop, height=pane.scrollHeight;
    pane.scrollTop=pane.scrollHeight;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const p=pane.getBoundingClientRect(), l=last.getBoundingClientRect();
    const moved=pane.scrollTop>oldScroll && pane.scrollTop>0 && first.getBoundingClientRect().top<before-1;
    const reachable=moved && l.top>=p.top-1 && l.bottom<=p.bottom+1 && Math.abs(first.getBoundingClientRect().top-before+pane.scrollTop-oldScroll)<=4 && pane.scrollHeight===height;
    scroll.scrollTop+=24;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const firstAnchor=Array.from(document.querySelectorAll('[data-comment-card]')).filter(node=>!node.hidden).map(card=>({card,anchor:document.querySelector('.editor-window [data-mark-id="'+card.dataset.commentCard+'"]')})).filter(item=>item.anchor).sort((a,b)=>a.anchor.getBoundingClientRect().top-b.anchor.getBoundingClientRect().top)[0];
    const cardTop=firstAnchor.card.getBoundingClientRect().top, wordsTop=firstAnchor.anchor.getBoundingClientRect().top;
    const selected=!!document.querySelector('[data-comment-card][data-selected="true"]');
    return {pass:reachable && !selected && pane.scrollTop===0 && Math.abs(cardTop-wordsTop)<=4, reachable, scrollTop:pane.scrollTop, cardTop,wordsTop,selected};
  })()`);
  check(coordinates.pass, 'comments-scrolled-canvas-coordinates', coordinates);
  const compact = await renderer.evaluate(`(() => {
    const pane=document.querySelector('.manuscript-comments-scroll'), p=pane.getBoundingClientRect();
    const rows=__comments.ids.map(id=>document.querySelector('[data-comment-card="'+id+'"]'));
    const visible=rows.filter(node=>{const r=node.getBoundingClientRect();return !node.hidden&&r.top>=p.top-1&&r.bottom<=p.bottom+1;});
    const header=document.querySelector('.manuscript-comments-heading').getBoundingClientRect().height+document.querySelector('.editorial-mark-filters').getBoundingClientRect().height;
    return {width:innerWidth,height:innerHeight,visible:visible.length,header,compact:rows.every(node=>node.dataset.expanded==='false'&&node.getBoundingClientRect().height<=76&&!node.querySelector('.editorial-mark-expanded-content')?.checkVisibility())};
  })()`);
  check(compact.width===1280 && compact.height===800 && compact.visible>=7 && compact.header<=84 && compact.compact, 'comments-seven-compact-visible', compact);
  check(await renderer.evaluate(`(async () => {
    const words=document.querySelector('.editor-window [data-mark-id="'+__comments.ids[11]+'"]'),pane=document.querySelector('.manuscript-comments-scroll');
    words.scrollIntoView({block:'center',behavior:'instant'}); document.querySelector('.editor-window').scrollTop+=words.getBoundingClientRect().top-pane.getBoundingClientRect().top-24;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))); return true;
  })()`), 'comments-overflow-position');
  const elsewhere = await commentsNativeClick(renderer, await renderer.evaluate(commentsUnmarkedPoint));
  check(elsewhere.real, 'comments-real-unmarked-caret', elsewhere);
  const wordPoint = await renderer.evaluate(`(async () => {
    const id=__comments.ids[11],words=document.querySelector('.editor-window [data-mark-id="'+id+'"]'),pane=document.querySelector('.manuscript-comments-scroll');
    words.scrollIntoView({block:'center',behavior:'instant'}); document.querySelector('.editor-window').scrollTop+=words.getBoundingClientRect().top-pane.getBoundingClientRect().top-24;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))); await Promise.all(document.body.getAnimations().map(a=>a.finished));
    const fresh=document.querySelector('.editor-window [data-mark-id="'+id+'"]'), r=fresh.getClientRects()[0],x=r.left+r.width/2,y=r.top+r.height/2;
    const c=document.querySelector('[data-comment-card="'+id+'"]')?.getBoundingClientRect(),p=pane.getBoundingClientRect();
    return {x,y,outside:!!c && (c.top>=p.bottom || c.bottom<=p.top),hit:fresh.contains(document.elementFromPoint(x,y)),elsewhere:!fresh.contains(getSelection()?.anchorNode)};
  })()`);
  check(wordPoint.outside && wordPoint.hit && wordPoint.elsewhere, 'comments-overflow-card-outside-before-click', wordPoint);
  const wordClick = await commentsNativeClick(renderer, wordPoint);
  check(wordClick.real, 'comments-real-word-click', wordClick);
  try { await waitFor(renderer, `(() => {
    const id=__comments.ids[11], card=document.querySelector('[data-comment-card="'+id+'"]'), words=document.querySelector('.editor-window [data-mark-id="'+id+'"]');
    const p=document.querySelector('.manuscript-comments-scroll').getBoundingClientRect(), c=card.getBoundingClientRect(), w=words.getClientRects()[0];
    return card.dataset.selected==='true' && c.top>=p.top-1 && c.bottom<=p.bottom+1 && Math.abs(c.top-w.top)<=4 && document.querySelector('[data-comment-leader="'+id+'"]') && !document.querySelector('.editorial-mark-layer [data-mark-card]');
  })()`, 'comments-overflow-selected-aligned'); } catch {
    const geometry = await renderer.evaluate(`(() => {
      const id=__comments.ids[11], card=document.querySelector('[data-comment-card="'+id+'"]'), words=document.querySelector('.editor-window [data-mark-id="'+id+'"]');
      const p=document.querySelector('.manuscript-comments-scroll').getBoundingClientRect(), c=card.getBoundingClientRect(), w=words.getClientRects()[0];
      const selection=getSelection(), parent=selection?.anchorNode?.parentElement, block=parent?.closest('[data-block-id]');
      let caret=-1; if(block&&selection?.anchorNode){ const range=document.createRange(); range.selectNodeContents(block); range.setEnd(selection.anchorNode,selection.anchorOffset); caret=Array.from(new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(range.toString())).length; }
      return {selected:card.dataset.selected==='true', selectedIndex:__comments.ids.findIndex(id=>document.querySelector('[data-comment-card="'+id+'"]')?.dataset.selected==='true'), paneTop:p.top, paneBottom:p.bottom, cardTop:c.top, cardBottom:c.bottom, wordsTop:w.top, wordsLeft:w.left, wordsRight:w.right, wordsHeight:w.height, caret, caretBlock:block?.dataset.blockId===words.closest('[data-block-id]')?.dataset.blockId, clickTrace:__commentsClickTrace, connector:!!document.querySelector('[data-comment-leader="'+id+'"]'), floating:!!document.querySelector('.editorial-mark-layer [data-mark-card]')};
    })()`);
    check(false, 'comments-overflow-selected-aligned', geometry);
  }
  check(await renderer.evaluate(`(() => { for(const id of __comments.ids.slice(2,4)){ const node=document.querySelector('[data-comment-card="'+id+'"]'); node.dispatchEvent(new PointerEvent('pointerenter')); node.dispatchEvent(new PointerEvent('pointerleave')); } return document.querySelector('[data-comment-card="'+__comments.ids[11]+'"]').dataset.selected==='true'; })()`), 'comments-hover-keeps-selection');
  const unmarkedClick = await commentsNativeClick(renderer, await renderer.evaluate(commentsUnmarkedPoint));
  check(unmarkedClick.real, 'comments-real-unmarked-clear', unmarkedClick);
  await waitFor(renderer, `!document.querySelector('[data-comment-card][data-selected="true"]') && !document.querySelector('[data-comment-leader]')`, 'comments-cleared-pair');

  const compactClick = await commentsSelectCard(renderer, check, waitFor, 2);
  check(compactClick.held.selected!=='true' && compactClick.held.expanded==='false', 'comments-pushed-control-held-still', compactClick);
  const controlPoint = await commentsControlPoint(renderer, 2, 'reply');
  check(controlPoint.hit, 'comments-pushed-control-before-click', controlPoint);
  const controlClick = await commentsNativeClick(renderer, controlPoint);
  check(controlClick.real, 'comments-expanded-reply-real-click', controlClick);
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[2]+'"]').dataset.selected==='true' && document.querySelector('[data-comment-reply="'+__comments.ids[2]+'"]')`, 'comments-pushed-control-first-click');
  await renderer.evaluate(`new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))`);

  check(await renderer.evaluate(`(() => {
    const cards=__comments.ids.map(id=>document.querySelector('[data-comment-card="'+id+'"]'));
    const sorted=cards.map(node=>node.getBoundingClientRect()).sort((a,b)=>a.top-b.top);
    const pane=document.querySelector('.manuscript-comments-scroll');
    const clear=sorted.every((box,index)=>box.height>0 && (index===0||box.top>=sorted[index-1].bottom+9));
    globalThis.__commentsReads=document.querySelector('.manuscript-comments-canvas').dataset.cardReads;
    const first=cards[0]; first.focus(); first.dispatchEvent(new PointerEvent('pointerenter'));
    return clear && pane.scrollHeight>=sorted[sorted.length-1].bottom-pane.getBoundingClientRect().top-1 && document.documentElement.dataset.technicalLayerVisible==='false' && cards.every(card=>!card.textContent.match(/[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{64}/i));
  })()`), 'comments-five-measured-no-overlap');
  try {
    await waitFor(renderer, `document.querySelector('[data-comment-leader="'+__comments.ids[0]+'"]') && document.querySelector('.manuscript-comments-anchor') && document.querySelector('[data-comment-card="'+__comments.ids[0]+'"]').dataset.active==='true'`, 'comments-anchor-and-leader');
  } catch {
    // Payload-free diagnosis only: keep the complete acceptance conjunction above and real focus/pointer triggers.
    const flags = await renderer.evaluate(`(() => {
      const id=__comments.ids[0], card=document.querySelector('[data-comment-card="'+id+'"]');
      const anchors=Array.from(document.querySelectorAll('.editorial-mark[data-mark-id="'+id+'"]'));
      const viewport=document.querySelector('.editor-window').getBoundingClientRect();
      const leader=document.querySelector('[data-comment-leader="'+id+'"]'), svg=leader?.ownerSVGElement;
      const bounds=svg?.getBoundingClientRect();
      return {'focused-card':card?.contains(document.activeElement)===true,'active-card':card?.dataset.active==='true',
        'anchor-present':anchors.length>0,'anchor-highlighted':anchors.some(node=>node.classList.contains('manuscript-comments-anchor')),
        'anchor-viewport':anchors.some(node=>{const box=node.getBoundingClientRect();return box.bottom>=viewport.top-200&&box.top<=viewport.bottom+200;}),
        'leader-present':leader!==null,'leader-visible':!!bounds&&bounds.width>0&&bounds.height>0&&getComputedStyle(svg).display!=='none'};
    })()`);
    const missing = Object.entries(flags).filter(([, present]) => !present).map(([name]) => name).join('-');
    check(false, 'comments-anchor-and-leader-' + (missing || 'state'), flags);
  }
  check(await renderer.evaluate(`(async () => {
    const scroll=document.querySelector('.editor-window'); const before=scroll.scrollTop;
    scroll.scrollTop=before+12; await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    scroll.scrollTop=before; window.dispatchEvent(new Event('resize')); await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    return document.querySelector('.manuscript-comments-canvas').dataset.cardReads===__commentsReads;
  })()`), 'comments-scroll-zero-card-ipc');
  check(await renderer.evaluate(`(() => { const cards=__comments.ids.map(id=>document.querySelector('[data-comment-card="'+id+'"]')); cards[0].focus(); cards[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true})); return document.activeElement===cards[1] && cards[1].dataset.selected==='true'; })()`), 'comments-arrow-focus');
  check(await renderer.evaluate(`(() => { const node=document.activeElement; node.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,isComposing:true})); return document.activeElement===node; })()`), 'comments-ime-escape');
  check(await renderer.evaluate(`(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); return document.activeElement===document.querySelector('[data-testid="manuscript-editor"]'); })()`), 'comments-escape-anchor-focus');
}

export async function commentsApplyAndReject(renderer, check, waitFor) {
  await commentsSelectCard(renderer, check, waitFor, 0);
  const accept = await commentsNativeClick(renderer, await commentsControlPoint(renderer, 0, 'accept-and-apply'));
  check(accept.real, 'comments-expanded-accept-real-click', accept);
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[0]+'"] [data-mark-application]') && document.querySelector('[data-comment-card="'+__comments.ids[0]+'"] [data-mark-state]').textContent.includes('已应用')`, 'comments-applied-pane-updated');
  check(await renderer.evaluate(`(async () => { const page=await window.ai7.getManuscriptWindowAt({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,target:{kind:'window-start',blockId:__comments.start}}); const card=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:__comments.ids[0]}); return page.journalSequence===__comments.journal+1 && page.blocks.find(block=>block.blockId===__comments.blockId).text.startsWith('合成') && card.suggestion.application!==null && !document.querySelector('[data-mark-preview="'+__comments.ids[0]+'"]') && document.querySelector('[data-testid="manuscript-editor"] [data-block-id="'+__comments.blockId+'"]').textContent.startsWith('合成'); })()`), 'comments-one-real-apply-and-text');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[1]+'"]')?.hidden===false && document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-action="reject"]')?.disabled===false`, 'comments-reject-card-ready');
  await commentsSelectCard(renderer, check, waitFor, 1);
  check(await renderer.evaluate(`(() => { const reject=document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-action="reject"]'); if(!reject||reject.disabled)return false; reject.click(); return true; })()`), 'comments-reject');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-state]').textContent.includes('已拒绝')`, 'comments-rejected-pane-updated');
  check(await renderer.evaluate(`(async () => { const page=await window.ai7.getManuscriptWindowAt({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,target:{kind:'window-start',blockId:__comments.start}}); const card=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:__comments.ids[1]}); return page.journalSequence===__comments.journal+1 && card.suggestion.decision.disposition==='rejected'; })()`), 'comments-reject-retains-text');
  await commentsHandledFilter(renderer, check, waitFor, [0, 1]);
  await renderer.send('Emulation.clearDeviceMetricsOverride');
}

export async function commentsReplyAndResolve(renderer, check, waitFor) {
  await commentsSelectCard(renderer, check, waitFor, 2);
  check(await renderer.evaluate(`(() => { const node=document.querySelector('[data-comment-card="'+__comments.ids[2]+'"]'); node.querySelector('[data-mark-action="reply"]').click(); const input=node.querySelector('[data-comment-reply]'); input.value='公开合成待发回复'; input.focus(); input.setSelectionRange(3,5); globalThis.__commentsReply=input; node.querySelector('[data-mark-action="resolve"]').click(); return true; })()`), 'comments-inline-reply-draft-and-resolve');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[2]+'"] [data-mark-state]').textContent.includes('已处理')`, 'comments-resolved');
  check(await renderer.evaluate(`(() => { const input=document.querySelector('[data-comment-reply="'+__comments.ids[2]+'"]'); return input===__commentsReply && input.value==='公开合成待发回复' && input.selectionStart===3 && input.selectionEnd===5 && document.activeElement===input; })()`), 'comments-reply-caret-survives-refresh');
  check(await renderer.evaluate(`(() => { __commentsReply.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true})); return __commentsReply.value==='公开合成待发回复'; })()`), 'comments-ime-enter-keeps-draft');
  check(await renderer.evaluate(`(() => { __commentsReply.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); return true; })()`), 'comments-send-reply-enter');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[2]+'"] [data-mark-region="replies"]')?.textContent.includes('公开合成待发回复') && __commentsReply.value===''`, 'comments-latest-returned-reply');
  check(await renderer.evaluate(`(async () => { const card=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:__comments.ids[2]}); return card.status==='resolved' && card.replies.length===1 && card.replies[0].body==='公开合成待发回复'; })()`), 'comments-reply-service-parity');
  check(await renderer.evaluate(`(() => { const node=document.querySelector('[data-comment-card="'+__comments.ids[2]+'"]'); node.focus(); node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); return true; })()`), 'comments-expand-enter');
  await waitFor(renderer, `document.querySelector('.editorial-mark-layer [data-mark-card="'+__comments.ids[2]+'"] [data-mark-region="replies"]')?.textContent.includes('公开合成待发回复')`, 'comments-existing-full-card');
  check(await renderer.evaluate(`(() => { document.querySelector('.editorial-mark-layer [data-mark-action="close"]').click(); return true; })()`), 'comments-full-card-close');
  await commentsHandledFilter(renderer, check, waitFor, [2]);
  await renderer.send('Emulation.clearDeviceMetricsOverride');
}

export async function commentsBookMemory(renderer, check, waitFor) {
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.destination('library'))), 'comments-book-library');
  await waitFor(renderer, `document.querySelector('.recent-work-item')`, 'comments-books-ready');
  check(await renderer.evaluate(`(() => { const other=Array.from(document.querySelectorAll('.recent-work-item button')).find(button=>button.textContent.includes('无关工作乙')); if(!other)return false; other.click(); return true; })()`), 'comments-other-book-open');
  await waitFor(renderer, `document.querySelector('[data-screen="editor"]') && document.querySelector('.editor-shell').dataset.bookId!==__comments.bookId`, 'comments-other-book-ready');
  check(await renderer.evaluate(`(() => { const pane=document.querySelector('.manuscript-comments-pane'); if(!pane.hidden || pane.querySelector('[data-comment-card]'))return false; document.querySelector('[data-edge-entry="comments"]').click(); return true; })()`), 'comments-other-book-own-toggle');
  await waitFor(renderer, `document.querySelector('.manuscript-comments-pane')?.hidden===false`, 'comments-other-book-pane');
  check(await renderer.evaluate(`__comments.ids.every(id=>!document.querySelector('[data-comment-card="'+id+'"]'))`), 'comments-no-cross-book-data');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.destination('library'))), 'comments-return-book-library');
  await waitFor(renderer, `document.querySelector('.recent-work-item')`, 'comments-return-books-ready');
  check(await renderer.evaluate(`(() => { const original=document.querySelector('.recent-work-item button[data-manuscript-id="'+__comments.manuscriptId+'"]'); if(!original)return false; original.click(); return true; })()`), 'comments-original-book-open');
  await waitFor(renderer, `document.querySelector('.editor-shell')?.dataset.bookId===__comments.bookId && document.querySelector('[data-edge-entry="comments"]').getAttribute('aria-expanded')==='true' && document.querySelector('.manuscript-comments-pane').hidden===false`, 'comments-per-book-toggle-restored');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[2]+'"] [data-mark-region="replies"]')?.textContent.includes('公开合成待发回复') && document.querySelector('[data-comment-card="'+__comments.ids[2]+'"] [data-mark-state]')?.textContent.includes('已处理')`, 'comments-return-book-current-content');
}

export async function commentsOrdinaryForEditor(renderer, check, waitFor) {
  check(await renderer.evaluate(`(async () => { const bookId=document.querySelector('.editor-shell').dataset.bookId; const work=(await window.ai7.listPriorWork()).find(item=>item.bookId===bookId); globalThis.__commentsOriginalManuscript=work.manuscriptId; return true; })()`), 'comments-remember-original-book');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.destination('library'))), 'comments-ordinary-library');
  await commentsOrdinaryMode(renderer, check, waitFor);
  check(await renderer.evaluate(`(() => { const button=document.querySelector('.recent-work-item button[data-manuscript-id="'+__commentsOriginalManuscript+'"]'); if(!button)return false; button.click(); return true; })()`), 'comments-ordinary-open-original');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]') && document.documentElement.dataset.technicalLayerVisible==='false'`, 'comments-ordinary-editor');
}


// A producing local route supplies its real frozen source; an editor note supplies a different source.
export async function commentsModelFilter(renderer, check, waitFor, markId) {
  check(await renderer.evaluate(`(async () => {
    const bookId=document.querySelector('.editor-shell').dataset.bookId,work=(await window.ai7.listPriorWork()).find(item=>item.bookId===bookId);
    const binding={manuscriptId:work.manuscriptId,branchId:work.branchId},card=await window.ai7.getEditorialMarkCard({...binding,markId:${JSON.stringify(markId)}});
    const page=await window.ai7.getManuscriptWindowAt({...binding,target:{kind:'block',blockId:card.blockId}}),block=page.blocks.find(item=>item.blockId===card.blockId);
    const text=Array.from(new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(block.text),item=>item.segment).slice(0,2).join('');
    const result=await window.ai7.createEditorialMark({...binding,windowStartBlockId:page.blocks[0].blockId,clientMarkId:crypto.randomUUID(),baseRevisionId:page.revisionId,expectedJournalSequence:page.journalSequence,blockId:block.blockId,baseBlockDigest:block.digest,fromGrapheme:0,toGrapheme:2,selectedText:text,kind:'annotation',highlightColor:null,body:'公开合成模型筛选对照',proposedText:null,rationale:null});
    globalThis.__commentsModel={mark:${JSON.stringify(markId)},other:result.markId,block:block.blockId,source:card.source.modelLabel};return card.source.modelLabel==='AI7 本地检查';
  })()`), 'comments-model-frozen-local-source');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.section('overview'))), 'comments-model-reload-overview');
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'comments-model-overview-ready');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.section('manuscript'))), 'comments-model-reload-manuscript');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')`, 'comments-model-editor-ready');
  check(await renderer.evaluate(`(() => {
    const entry=document.querySelector('[data-edge-entry="comments"]');if(entry.getAttribute('aria-expanded')!=='true')entry.click();
    document.querySelector('.editor-window [data-block-id="'+__commentsModel.block+'"]').scrollIntoView({block:'center',behavior:'instant'});return true;
  })()`), 'comments-model-open');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__commentsModel.mark+'"] [data-mark-source]')?.textContent===__commentsModel.source && document.querySelector('[data-comment-card="'+__commentsModel.other+'"]')?.hidden===false`, 'comments-model-cards-ready');
  check(await renderer.evaluate(`(() => {document.querySelector('[data-mark-filter-toggle]').click();const chip=document.querySelector('[data-mark-model-filter="'+__commentsModel.source+'"]');if(!chip)return false;chip.click();return true;})()`), 'comments-model-chip');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__commentsModel.mark+'"]')?.hidden===false && document.querySelector('[data-comment-card="'+__commentsModel.other+'"]')?.hidden===true && document.querySelector('.editor-window [data-mark-id="'+__commentsModel.other+'"]')?.dataset.markFilteredOut==='true' && !document.querySelector('.editor-window [data-mark-id="'+__commentsModel.mark+'"][data-mark-filtered-out]')`, 'comments-model-cards-and-highlights');
  check(await renderer.evaluate(`(() => {document.querySelector('[data-mark-model-filter="'+__commentsModel.source+'"]' ).click();document.querySelector('.editorial-mark-filter-popover').hidePopover();return true;})()`), 'comments-model-reset');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__commentsModel.other+'"]')?.hidden===false`, 'comments-model-all-restored');
  check(await renderer.evaluate(`(() => {const node=document.querySelector('[data-comment-card="'+__commentsModel.mark+'"]');node.focus();node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return true;})()`), 'comments-model-full-card');
  await waitFor(renderer, `document.querySelector('.editorial-mark-layer [data-mark-card="'+__commentsModel.mark+'"]')`, 'comments-model-full-card-ready');
}


async function commentsHandledFilter(renderer, check, waitFor, indexes) {
  check(await renderer.evaluate(`(() => {document.querySelector('[data-mark-status-filter="handled"]').click();return true;})()`), 'comments-handled-filter');
  await waitFor(renderer, `__comments.ids.every((id,index)=>{const handled=${JSON.stringify(indexes)}.includes(index);return document.querySelector('[data-comment-card="'+id+'"]')?.hidden===!handled && document.querySelector('.editor-window [data-mark-id="'+id+'"]')?.dataset.markFilteredOut===(handled?undefined:'true');})`, 'comments-handled-cards-and-highlights');
  check(await renderer.evaluate(`(() => {document.querySelector('[data-mark-status-filter="all"]').click();return true;})()`), 'comments-handled-reset');
  await waitFor(renderer, `__comments.ids.every(id=>document.querySelector('[data-comment-card="'+id+'"]')?.hidden===false)`, 'comments-handled-all-restored');
}
