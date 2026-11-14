import { SIDEBAR, sidebarNavigate } from './controller.mjs';

// All async service operations are evaluated directly and awaited; waitFor receives synchronous DOM predicates only.
// pointer-events:none removes SVG from hit tests; compare its sibling stacking context
// with opaque hit-test surfaces without temporarily making the connector interactive.
const commentsConnectorVisible = `(() => {
  const card=document.querySelector('[data-comment-card][data-selected="true"]'), id=card?.dataset.commentCard;
  const line=document.querySelector('[data-comment-leader="'+id+'"]'), svg=line?.ownerSVGElement, dot=svg?.querySelector('circle');
  const words=document.querySelector('.editor-window [data-mark-id="'+id+'"]'), pane=document.querySelector('.manuscript-comments-pane');
  if(!line||!dot||!words||!pane||line.parentElement!==dot.parentElement||getComputedStyle(svg).pointerEvents!=='none')return false;
  const l=line.getBoundingClientRect(), d=dot.getBoundingClientRect();
  if(l.width<=0||l.height<=0||d.width<=0||d.height<=0)return false;
  const origin=svg.getBoundingClientRect(), x=origin.left+Number(dot.getAttribute('cx')), y=origin.top+Number(dot.getAttribute('cy'));
  const p=pane.getBoundingClientRect(), overlay=getComputedStyle(pane).position==='absolute', z=Number(getComputedStyle(svg).zIndex);
  const exposed=Array.from(words.getClientRects()).some(r=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom&&(!overlay||x<p.left||x>=p.right||y<p.top||y>=p.bottom));
  const visible=document.elementsFromPoint(x,y).every(node=>{
    if(node===svg||svg.contains(node)||node.contains(svg)||words.contains(node)||node.contains(words))return true;
    const style=getComputedStyle(node), context=node.closest('.manuscript-comments-pane');
    return style.backgroundColor==='rgba(0, 0, 0, 0)' || (context&&z>Number(getComputedStyle(context).zIndex));
  });
  return exposed&&visible&&(!overlay||z>Number(getComputedStyle(pane).zIndex));
})()`;

async function commentsConnectorExposure(renderer, check, waitFor) {
  await waitFor(renderer, commentsConnectorVisible, 'comments-connector-visible');
}

// Seed actual ranges in the admitted sample; use browser line geometry to find
// occlusion and wrapping without changing the manuscript, words or stylesheet.
async function commentsSeedConnectorCases(renderer, check, waitFor) {
  check(await renderer.evaluate(`(async () => {
    const pane=document.querySelector('.manuscript-comments-pane'), p=pane.getBoundingClientRect();
    const page=await window.ai7.getManuscriptWindowAt({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,target:{kind:'window-start',blockId:__comments.start}});
    const segmenter=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
    for(const block of page.blocks.filter(b=>b.kind==='paragraph')) {
      const node=document.querySelector('.editor-window [data-block-id="'+block.blockId+'"]');
      if(!node||node.querySelector('[data-mark-id]')||node.textContent!==block.text)continue;
      const segments=Array.from(segmenter.segment(block.text));
      if(segments.length<60||segments.length>500)continue;
      node.scrollIntoView({block:'center',behavior:'instant'});
      await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
      const leaves=[];const walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let leaf,total=0;
      while(leaf=walk.nextNode()){leaves.push({node:leaf,start:total});total+=leaf.length;}
      const boundary=offset=>{const item=leaves.findLast(n=>n.start<=offset);return [item.node,offset-item.start];};
      const boxes=segments.map((part,index)=>{
        const range=document.createRange();range.setStart(...boundary(part.index));range.setEnd(...boundary(segments[index+1]?.index??block.text.length));
        return Array.from(range.getClientRects()).find(r=>r.width>0&&r.height>0);
      });
      const covered=r=>r&&r.left>=p.left+1&&r.right<=p.right-1;
      const wrap=boxes.findIndex((r,i)=>i>=4&&i+1<boxes.length&&r&&boxes[i-1]&&r.top>boxes[i-1].top&&covered(boxes[i-4])&&covered(boxes[i-3])&&covered(boxes[i-2])&&covered(boxes[i-1])&&r.right<p.left&&boxes[i+1]?.right<p.left);
      const partial=boxes.findIndex((r,i)=>i>0&&r&&boxes[i-1]&&r.top===boxes[i-1].top&&boxes[i-1].left<p.left&&r.right>p.left);
      if(wrap<0||partial<0)continue;
      const cases=[{kind:'covered',from:wrap-4,to:wrap-2},{kind:'wrapped',from:wrap-2,to:wrap+2},{kind:'partial',from:partial-1,to:partial+1}];
      for(const item of cases){
        const result=await window.ai7.createEditorialMark({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,windowStartBlockId:__comments.start,clientMarkId:crypto.randomUUID(),baseRevisionId:page.revisionId,expectedJournalSequence:page.journalSequence,blockId:block.blockId,baseBlockDigest:block.digest,fromGrapheme:item.from,toGrapheme:item.to,selectedText:segments.slice(item.from,item.to).map(s=>s.segment).join(''),kind:'annotation',highlightColor:null,body:'公开连线覆盖检查',proposedText:null,rationale:null});
        item.id=result.markId;
      }
      globalThis.__connectorCases={blockId:block.blockId,cases};return true;
    }
    return false;
  })()`), 'comments-seed-real-connector-ranges');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.section('overview'))), 'comments-connector-reload-overview');
  await waitFor(renderer, `document.querySelector('[data-screen="book-overview"]')`, 'comments-connector-overview-ready');
  check(await renderer.evaluate(sidebarNavigate(SIDEBAR.section('manuscript'))), 'comments-connector-reload-manuscript');
  await waitFor(renderer, `document.querySelector('[data-testid="manuscript-editor"]')`, 'comments-connector-editor-ready');
  await renderer.evaluate(`(() => { const entry=document.querySelector('[data-edge-entry="comments"]');if(entry.getAttribute('aria-expanded')!=='true')entry.click();document.querySelector('.editor-window [data-block-id="'+__connectorCases.blockId+'"]').scrollIntoView({block:'center',behavior:'instant'}); })()`);
  for(const index of [0,1,2]) {
    // A loading row is focusable before its card has arrived. Select through the same
    // ready-card and real mouse-input path as the rest of the editor interaction flow.
    await commentsSelectMark(renderer, check, waitFor, await renderer.evaluate(`__connectorCases.cases[${index}].id`));
    const geometry=`(() => {
      const item=__connectorCases.cases[${index}], words=document.querySelector('.editor-window [data-mark-id="'+item.id+'"]'), p=document.querySelector('.manuscript-comments-pane').getBoundingClientRect();
      const rects=Array.from(words.getClientRects()).filter(r=>r.width>0&&r.height>0), first=rects[0], dot=document.querySelector('.manuscript-comments-leaders circle'), svg=dot?.ownerSVGElement;
      if(!first)return false;
      if(item.kind==='covered')return rects.every(r=>r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom)&&!document.querySelector('[data-comment-leader]')&&!dot;
      if(item.kind==='partial')return first.left<p.left&&first.right>p.left;
      const y=svg?.getBoundingClientRect().top+Number(dot?.getAttribute('cy'));
      return rects.filter(r=>r.top===first.top).every(r=>r.left>=p.left&&r.right<=p.right)&&rects.some(r=>r.top>first.top&&r.left<p.left&&y>=r.top&&y<=r.bottom);
    })()`;
    await waitFor(renderer,geometry,'comments-real-connector-case-geometry');
    if(index!==0)await waitFor(renderer,commentsConnectorVisible,'comments-real-connector-case-visible');
  }
}

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
    await waitFor(renderer, `(() => { const panel=document.querySelector('.manuscript-comments-pane'), text=document.querySelector('.manuscript-surface'), edge=document.querySelector('.editor-edge'); const p=panel.getBoundingClientRect(), t=text.getBoundingClientRect(), e=edge.getBoundingClientRect(); return !panel.hidden && p.height>100 && p.right<=e.left+1 && p.bottom<=innerHeight+1 && (innerWidth>=1120 ? p.width>=300 && p.width<=340 && t.right<=p.left+1 : getComputedStyle(panel).position==='absolute' && p.width>=Math.min(300,document.querySelector('.editor-workspace').getBoundingClientRect().width-e.width) && p.left>=document.querySelector('.editor-workspace').getBoundingClientRect().left-1); })()`, 'comments-responsive-geometry');
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

// Repeat the complete interaction flow, with independent marks, before restoring the desktop viewport.
export async function commentsPaneForms(renderer, check, waitFor, at, action) {
  const native=await renderer.evaluate('({width:innerWidth,height:innerHeight})');
  try {
    for(const [form,size] of [['column',{width:1280,height:800}],['overlay',{width:1008,height:681}]]) {
      at('comments-inline-'+action+'-'+form);
      await seedCommentsPane(renderer,check,waitFor,size);
      await waitFor(renderer,`innerWidth===${size.width} && innerHeight===${size.height} && getComputedStyle(document.querySelector('.manuscript-comments-pane')).position===${JSON.stringify(form==='overlay'?'absolute':'static')}`, 'comments-'+form+'-viewport');
      await commentsGeometryAndScroll(renderer,check,waitFor);
      if(action==='apply')await commentsApplyAndReject(renderer,check,waitFor);
      else await commentsReplyAndResolve(renderer,check,waitFor);
      if(form==='overlay')await commentsSeedConnectorCases(renderer,check,waitFor);
      check(true,'comments-'+form+'-complete');
    }
  } finally {
    await renderer.send('Emulation.clearDeviceMetricsOverride');
    await waitFor(renderer,`innerWidth===${native.width} && innerHeight===${native.height}`,'comments-native-viewport-restored');
  }
}

export async function seedCommentsPane(renderer, check, waitFor, size = {width:1280,height:800}) {
  await renderer.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor:1, mobile:false });
  check(await renderer.evaluate(`(async () => {
    const editor=document.querySelector('[data-testid="manuscript-editor"]');
    const bookId=document.querySelector('.editor-shell').dataset.bookId;
    const work=(await window.ai7.listPriorWork()).find((item)=>item.bookId===bookId);
    const binding={manuscriptId:work.manuscriptId,branchId:work.branchId};
    const start=editor.querySelector('[data-block-id]').dataset.blockId;
    const page=await window.ai7.getManuscriptWindowAt({...binding,target:{kind:'window-start',blockId:start}});
    const paragraphs=page.blocks.filter(item=>item.kind==='paragraph');
    const short=item=>item && Array.from(item.text??'').length>=20 && Array.from(item.text??'').length<=120;
    const previous=globalThis.__commentsSeedBlocks??[];
    const candidates=paragraphs.map((item,index)=>({item,index})).filter(({item,index})=>short(item)&&short(paragraphs[index+1])&&!previous.includes(item.blockId)&&!previous.includes(paragraphs[index+1].blockId));
    const previousIndex=paragraphs.findIndex(item=>item.blockId===previous[0]);
    const block=previous.length?candidates.sort((a,b)=>Math.abs(b.index-previousIndex)-Math.abs(a.index-previousIndex))[0]?.item:(candidates.find(({index})=>index>=10)??candidates[0])?.item;
    if(!block)return false;
    const second=paragraphs[paragraphs.indexOf(block)+1];
    if(!second)return false;
    globalThis.__commentsSeedBlocks=[block.blockId,second.blockId];
    const ids=[]; const kinds=['change-suggestion','change-suggestion','annotation','annotation','editor-note'];
    for(let index=0;index<12;index++){
      const current=index<5?block:second;
      const words=Array.from(new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(current.text),item=>item.segment);
      const from=index<5?index*3:(index-5)*2, to=from+2;
      const result=await window.ai7.createEditorialMark({...binding,windowStartBlockId:start,clientMarkId:crypto.randomUUID(),baseRevisionId:page.revisionId,expectedJournalSequence:page.journalSequence,blockId:current.blockId,baseBlockDigest:current.digest,fromGrapheme:from,toGrapheme:to,selectedText:words.slice(from,to).join(''),kind:kinds[index]??'annotation',highlightColor:null,body:index>=2?(index===3?'【未联网核查】【锚点不唯一】（标点已与原稿对齐）':'')+'公开合成批注 '+index:'',proposedText:index<2?'合成':null,rationale:index<2?'公开合成理由':null});
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
  const category=await renderer.evaluate(`(() => {
    const pane=document.querySelector('.manuscript-comments-pane');
    const cards=__comments.ids.map(id=>pane.querySelector('[data-mark-card="'+id+'"]'));
    const inline=__comments.ids.map(id=>document.querySelector('.editor-window [data-mark-id="'+id+'"]'));
    const cardsReady=cards.every(card=>card?.dataset.markCategory==='editor' && card.querySelector('.editorial-mark-category-badge')?.textContent==='编辑修订');
    const inlineReady=inline.every(mark=>mark?.dataset.markCategory==='editor');
    if(!cardsReady || !inlineReady)return {cardsReady,inlineReady,headerReady:false};
    pane.querySelector('[data-mark-filter-toggle]').click();
    pane.querySelector('[data-mark-category-filter="editor"]').click();
    const input=pane.querySelector('[data-mark-search-input]'); input.value='公开合成批注 2'; input.dispatchEvent(new Event('input',{bubbles:true}));
    globalThis.__commentsSearch=input; const heading=document.querySelector('.manuscript-comments-heading').getBoundingClientRect().height,filters=document.querySelector('.editorial-mark-filters').getBoundingClientRect().height; return {cardsReady,inlineReady,headerReady:heading+filters<=84,heading,filters};
  })()`);
  check(category.cardsReady,'comments-category-badges-and-search-cards',category);
  check(category.inlineReady,'comments-category-badges-and-search-words',category);
  check(category.cardsReady&&category.inlineReady&&category.headerReady,'comments-category-badges-and-search',category);
  await waitFor(renderer, `(() => {
    const pane=document.querySelector('.manuscript-comments-pane');
    return __comments.ids.every((id,index)=>pane.querySelector('[data-comment-card="'+id+'"]')?.hidden===(index!==2)) &&
      __comments.ids.every((id,index)=>document.querySelector('.editor-window [data-mark-id="'+id+'"]')?.dataset.markFilteredOut===(index===2?undefined:'true'));
  })()`, 'comments-search-cards-and-highlights');
  const filterHeader=await renderer.evaluate(`({heading:document.querySelector('.manuscript-comments-heading').getBoundingClientRect().height,filters:document.querySelector('.editorial-mark-filters').getBoundingClientRect().height})`);
  check(filterHeader.heading+filterHeader.filters<=84, 'comments-filter-header-height', filterHeader);
  check(await renderer.evaluate(`(() => { window.dispatchEvent(new Event('resize')); return document.querySelector('[data-mark-search-input]')===__commentsSearch && __commentsSearch.value==='公开合成批注 2' && document.querySelector('[data-mark-category-filter="editor"]').getAttribute('aria-pressed')==='true'; })()`), 'comments-filter-controls-survive-redraw');
  check(await renderer.evaluate(`(() => { document.querySelector('[data-mark-status-filter="handled"]').click(); return true; })()`), 'comments-status-handled');
  await waitFor(renderer, `__comments.ids.every(id=>document.querySelector('[data-comment-card="'+id+'"]')?.hidden===true)`, 'comments-status-no-match');
  check(await renderer.evaluate(`(() => { __commentsSearch.value=''; __commentsSearch.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-mark-status-filter="all"]').click(); document.querySelector('[data-mark-category-filter="all"]').click(); return true; })()`), 'comments-filter-reset');
  await waitFor(renderer, `__comments.ids.every(id=>document.querySelector('[data-comment-card="'+id+'"]')?.hidden===false && !document.querySelector('.editor-window [data-mark-id="'+id+'"][data-mark-filtered-out]'))`, 'comments-filter-all-restored');
  await renderer.evaluate(`(() => { const popover=document.querySelector('.editorial-mark-filter-popover'); if(popover.matches(':popover-open'))popover.hidePopover(); return true; })()`);
  await commentsFilterMouse(renderer, check, waitFor);
}

// Native input is intentional: focus and pointer-down must take the same path as an editor's first click.
export async function commentsRangeElsewhere(renderer, check, waitFor, selector) {
  check(await renderer.evaluate(`(() => {
    const words=document.querySelector(${JSON.stringify(selector)}),editor=document.querySelector('[data-testid="manuscript-editor"]'),target=words.closest('[data-block-id]');
    const paragraphs=Array.from(editor.querySelectorAll('p[data-block-id]')).filter(node=>node!==target);
    for(const paragraph of paragraphs){
      const walk=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);let text;
      while(text=walk.nextNode())if(text.length>=4&&!text.parentElement.closest('[data-mark-id]')){
        editor.focus({preventScroll:true});const range=document.createRange();range.setStart(text,0);range.setEnd(text,4);
        const selection=getSelection();selection.removeAllRanges();selection.addRange(range);globalThis.__commentsRangeBlock=paragraph.dataset.blockId;return !selection.isCollapsed;
      }
    }
    return false;
  })()`), 'comments-existing-range-elsewhere');
  await waitFor(renderer, `(() => {const model=JSON.parse(document.querySelector('[data-testid="manuscript-editor"]').dataset.selectionSnapshot);return !getSelection().isCollapsed && model.from!==model.to && model.anchor.blockId===__commentsRangeBlock && model.head.blockId===__commentsRangeBlock;})()`, 'comments-existing-range-ready');
}

// Select the paragraph containing the marked words: the click is strictly INSIDE the range.
// Chromium keeps that range through mousedown; collapsing it on mouseup must not lose the click.
export async function commentsRangeInside(renderer, check, waitFor, selector) {
  check(await renderer.evaluate(`(() => {
    const words=document.querySelector(${JSON.stringify(selector)}),editor=document.querySelector('[data-testid="manuscript-editor"]'),paragraph=words.closest('[data-block-id]');
    editor.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(paragraph);
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    globalThis.__commentsRangeBlock=paragraph.dataset.blockId;
    return !selection.isCollapsed && selection.containsNode(words,true);
  })()`),'comments-existing-range-inside');
  await waitFor(renderer,`(() => {const model=JSON.parse(document.querySelector('[data-testid="manuscript-editor"]').dataset.selectionSnapshot),words=document.querySelector(${JSON.stringify(selector)});return !getSelection().isCollapsed && getSelection().containsNode(words,true) && model.from!==model.to && model.anchor.blockId===__commentsRangeBlock && model.head.blockId===__commentsRangeBlock;})()`,'comments-existing-range-inside-ready');
}

async function commentsInsideSelection(renderer,check,waitFor) {
  const id=await renderer.evaluate('__comments.ids[11]'),selector='.editor-window [data-mark-id="'+id+'"]';
  const point=()=>renderer.evaluate(`(() => {const words=document.querySelector(${JSON.stringify(selector)}),r=words.getClientRects()[0],x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,hit:words.contains(document.elementFromPoint(x,y)),inside:getSelection().containsNode(words,true)};})()`);
  for(const pane of [true,false]) {
    if(!pane)check(await renderer.evaluate(`(() => {document.querySelector('[data-edge-entry="comments"]').click();return document.querySelector('.manuscript-comments-pane').hidden;})()`),'comments-existing-range-close-pane');
    await commentsRangeInside(renderer,check,waitFor,selector);
    const before=await point();check(before.hit&&before.inside,'comments-existing-range-inside-hit',before);
    check((await commentsNativeClick(renderer,before)).real,'comments-existing-range-inside-real-click');
    await waitFor(renderer,pane?`document.querySelector('[data-comment-card="'+${JSON.stringify(id)}+'"]').dataset.selected==='true'`:`document.querySelector('.editorial-mark-layer [data-mark-card="'+${JSON.stringify(id)}+'"]')`,pane?'comments-existing-range-inside-pane-selected':'comments-existing-range-inside-floating-open');
    await waitFor(renderer,`getSelection().isCollapsed && JSON.parse(document.querySelector('[data-testid="manuscript-editor"]').dataset.selectionSnapshot).from===JSON.parse(document.querySelector('[data-testid="manuscript-editor"]').dataset.selectionSnapshot).to`,'comments-existing-range-inside-caret');
    if(!pane)check(await renderer.evaluate(`(() => {document.querySelector('.editorial-mark-layer [data-mark-action="close"]').click();document.querySelector('[data-edge-entry="comments"]').click();return !document.querySelector('.manuscript-comments-pane').hidden;})()`),'comments-existing-range-restore-pane');
  }
  check((await commentsNativeClick(renderer,await renderer.evaluate(commentsUnmarkedPoint))).real,'comments-existing-range-clear');
  await waitFor(renderer,`!document.querySelector('[data-comment-card][data-selected="true"]')`,'comments-existing-range-cleared');
}

export async function commentsNativeClick(renderer, point) {
  if (!point) return { target: false };
  await renderer.evaluate(`(() => { globalThis.__commentsClickTrace={}; for(const type of ['mousedown','mouseup','click']) document.addEventListener(type,()=>{__commentsClickTrace[type]=true;},{capture:true,once:true}); return true; })()`);
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 });
  await renderer.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  const held = await renderer.evaluate(`(async () => { await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))); const node=document.elementFromPoint(${point.x},${point.y})?.closest('[data-comment-card]'); return {top:node?.getBoundingClientRect().top,index:globalThis.__comments?.ids.indexOf(node?.dataset.commentCard)??-1,selected:node?.dataset.selected,expanded:node?.dataset.expanded}; })()`);
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
  const events = await renderer.evaluate(`new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(__commentsClickTrace))))`);
  return { target: true, held, events, real:events.mousedown===true && events.mouseup===true && events.click===true };
}

async function commentsControlPoint(renderer, index, action, waitFor) {
  await renderer.evaluate(`(() => {globalThis.__commentsPoint=null;globalThis.__commentsPointPrevious=null;document.querySelector('[data-comment-card="'+__comments.ids[${index}]+'"] [data-mark-action="${action}"]').scrollIntoView({block:'nearest',behavior:'instant'});return true;})()`);
  await waitFor(renderer, `(() => {
    const button=document.querySelector('[data-comment-card="'+__comments.ids[${index}]+'"] [data-mark-action="${action}"]'),r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    const before=__commentsPointPrevious;__commentsPointPrevious={x,y};
    const hit=button.contains(document.elementFromPoint(x,y));
    if(!before||before.x!==x||before.y!==y||!hit)return false;
    __commentsPoint={x,y,hit};return true;
  })()`, 'comments-control-hit-ready');
  return renderer.evaluate(`__commentsPoint`);
}

async function commentsSelectCard(renderer, check, waitFor, index, requireCompact = false) {
  return commentsSelectMark(renderer, check, waitFor, await renderer.evaluate(`__comments.ids[${index}]`), requireCompact);
}

export async function commentsSelectMark(renderer, check, waitFor, markId, requireCompact = false) {
  const id=JSON.stringify(markId);
  const readyUntil=Date.now()+60_000,remaining=()=>Math.max(0,readyUntil-Date.now());
  await renderer.evaluate(`(() => {document.querySelector('.editor-window [data-mark-id="'+${id}+'"]')?.scrollIntoView({block:'center',behavior:'instant'});return true;})()`);
  await waitFor(renderer, `(() => {
    const words=document.querySelector('.editor-window [data-mark-id="'+${id}+'"]'),node=document.querySelector('[data-comment-card="'+${id}+'"]');
    if(!words||!node||node.hidden||!node.querySelector('[data-mark-card]')||node.dataset.revalidating==='true')return false;
    const w=words.getBoundingClientRect(),v=document.querySelector('.editor-window').getBoundingClientRect();return w.bottom>v.top&&w.top<v.bottom;
  })()`, 'comments-card-words-listed', remaining());
  await renderer.evaluate(`(() => {globalThis.__commentsPoint=null;globalThis.__commentsPointPrevious=null;document.querySelector('[data-comment-card="'+${id}+'"]')?.scrollIntoView({block:'start',behavior:'instant'});return true;})()`);
  try { await waitFor(renderer, `(() => {
    const node=document.querySelector('[data-comment-card="'+${id}+'"]');if(!node)return false;
    const r=node.getBoundingClientRect(),pane=document.querySelector('.manuscript-comments-scroll').getBoundingClientRect(),x=r.left+12,y=r.top+10;
    const before=__commentsPointPrevious;__commentsPointPrevious={x,y};
    if(node.hidden||y<pane.top||y>pane.bottom||!node.contains(document.elementFromPoint(x,y))){node.scrollIntoView({block:'start',behavior:'instant'});return false;}
    if(!before||before.x!==x||before.y!==y)return false;
    __commentsPoint={x,y,hit:true,top:r.top,selected:node.dataset.selected,expanded:node.dataset.expanded};return true;
  })()`, 'comments-card-hit-ready', remaining()); } catch {
    const reason=await renderer.evaluate(`(() => {
      const node=document.querySelector('[data-comment-card="'+${id}+'"]'),pane=document.querySelector('.manuscript-comments-scroll');
      if(!node)return 'missing';if(!pane||pane.getClientRects().length===0)return 'pane-hidden';if(node.hidden)return 'not-listed';
      const r=node.getBoundingClientRect(),p=pane.getBoundingClientRect(),x=r.left+12,y=r.top+10;
      if(y<p.top||y>p.bottom)return 'outside-pane';if(!node.contains(document.elementFromPoint(x,y)))return 'covered';return 'moving';
    })()`);
    const names={missing:'comments-card-hit-ready-missing','pane-hidden':'comments-card-hit-ready-pane-hidden','not-listed':'comments-card-hit-ready-not-listed','outside-pane':'comments-card-hit-ready-outside-pane',covered:'comments-card-hit-ready-covered',moving:'comments-card-hit-ready-moving'};
    check(false,names[reason]??'comments-card-hit-ready');
  }
  const point=await renderer.evaluate(`__commentsPoint`);
  if(requireCompact)check(point.expanded==='false'&&point.selected!=='true','comments-card-compact-before-click',point);
  const click=await commentsNativeClick(renderer,point);
  check(click.real,'comments-compact-card-real-click',click);
  try {
    await waitFor(renderer, `(() => {const node=document.querySelector('[data-comment-card="'+${id}+'"]');return node.dataset.selected==='true'&&node.dataset.expanded==='true'&&!node.querySelector('.editorial-mark-expanded-content').hidden;})()`, 'comments-selected-expanded');
  } catch {
    const state=await renderer.evaluate(`(() => {const node=document.querySelector('[data-comment-card="'+${id}+'"]');return {selected:node.dataset.selected,expanded:node.dataset.expanded,hidden:node.hidden};})()`);
    check(false,'comments-selected-expanded',{point,click,state});
  }
  return {...click,before:point};
}

async function commentsFilterMouse(renderer, check, waitFor) {
  const point=async(selector)=>renderer.evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  const toggle='[data-mark-filter-toggle]',isOpen=`document.querySelector('.editorial-mark-filter-popover').matches(':popover-open')`;
  check((await commentsNativeClick(renderer,await point(toggle))).real,'comments-filter-real-open');
  await waitFor(renderer,isOpen,'comments-filter-open');
  check((await commentsNativeClick(renderer,await point(toggle))).real,'comments-filter-real-toggle');
  await waitFor(renderer,`!(${isOpen})`,'comments-filter-real-toggle-close');
  await commentsNativeClick(renderer,await point(toggle)); await waitFor(renderer,isOpen,'comments-filter-reopen');
  await renderer.evaluate(`(() => {document.querySelector('[data-mark-search-input]').focus();return true;})()`);
  await renderer.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await renderer.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor(renderer,`!(${isOpen})&&document.activeElement===document.querySelector('${toggle}')`,'comments-filter-escape-focus');
  await commentsNativeClick(renderer,await point(toggle)); await waitFor(renderer,isOpen,'comments-filter-reopen-outside');
  check((await commentsNativeClick(renderer,await point('.manuscript-comments-heading strong'))).real,'comments-filter-real-outside');
  await waitFor(renderer,`!(${isOpen})`,'comments-filter-real-outside-close');
}

const commentsUnmarkedPoint = `(() => {
  const editor=document.querySelector('[data-testid="manuscript-editor"]'),words=document.querySelector('.editor-window [data-mark-id="'+__comments.ids[11]+'"]');
  const target=words.closest('[data-block-id]'),viewport=document.querySelector('.editor-window').getBoundingClientRect();
  const blocks=[target,...Array.from(editor.querySelectorAll('[data-block-id]')).filter(node=>node!==target)];
  for(const block of blocks){const walk=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);let node;
    while(node=walk.nextNode())if(node.textContent.trim()&&!node.parentElement.closest('[data-mark-id]')){
      // Avoid the shared caret rule at a mark's inclusive end: choose an interior unmarked glyph.
      const glyphs=Array.from(new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(node.textContent));
      if(glyphs.length<3)continue;
      const range=document.createRange();range.setStart(node,glyphs[1].index);range.setEnd(node,glyphs[2].index);
      for(const r of range.getClientRects()){
        const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
        if(y>viewport.top&&y<viewport.bottom&&editor.contains(hit)&&!hit.closest('[data-mark-id]'))return {x,y};
      }
    }
  }
  return null;
})()`;

export async function commentsGeometryAndScroll(renderer, check, waitFor) {
  await renderer.send('Page.bringToFront');
  await renderer.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const readCoordinates = () => renderer.evaluate(`(async () => {
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
    const beforeText=scroll.scrollTop;
    scroll.scrollTop+=scroll.scrollTop<scroll.scrollHeight-scroll.clientHeight?24:-24;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const textMoved=scroll.scrollTop!==beforeText;
    const firstAnchor=Array.from(document.querySelectorAll('[data-comment-card]')).filter(node=>!node.hidden).map(card=>({card,anchor:document.querySelector('.editor-window [data-mark-id="'+card.dataset.commentCard+'"]')})).filter(item=>item.anchor).sort((a,b)=>a.anchor.getBoundingClientRect().top-b.anchor.getBoundingClientRect().top)[0];
    const cardTop=firstAnchor.card.getBoundingClientRect().top, wordsTop=firstAnchor.anchor.getBoundingClientRect().top;
    const selected=!!document.querySelector('[data-comment-card][data-selected="true"]');
    return {pass:reachable && textMoved && !selected && pane.scrollTop===0 && Math.abs(cardTop-wordsTop)<=4, reachable, textMoved, scrollTop:pane.scrollTop, cardTop,wordsTop,selected};
  })()`);
  const assertCoordinates = coordinates => {
  check(coordinates.reachable, 'comments-scrolled-canvas-reachable', coordinates);
  check(!coordinates.selected, 'comments-scrolled-canvas-unselected', coordinates);
  check(coordinates.textMoved, 'comments-scrolled-canvas-text-moved', coordinates);
  check(coordinates.scrollTop===0, 'comments-scrolled-canvas-text-scroll-reset', coordinates);
  check(Math.abs(coordinates.cardTop-coordinates.wordsTop)<=4, 'comments-scrolled-canvas-word-level', coordinates);
  check(coordinates.pass, 'comments-scrolled-canvas-coordinates', coordinates);
  };
  assertCoordinates(await readCoordinates());
  const compact = await renderer.evaluate(`(() => {
    const pane=document.querySelector('.manuscript-comments-scroll'), p=pane.getBoundingClientRect();
    const rows=__comments.ids.map(id=>document.querySelector('[data-comment-card="'+id+'"]'));
    const visible=rows.filter(node=>{const r=node.getBoundingClientRect();return !node.hidden&&r.top>=p.top-1&&r.bottom<=p.bottom+1;});
    const header=document.querySelector('.manuscript-comments-heading').getBoundingClientRect().height+document.querySelector('.editorial-mark-filters').getBoundingClientRect().height;
    const disclosure=document.querySelector('.editorial-mark-disclosure');
    if(disclosure.hidden||disclosure.textContent!=='以下 AI 建议未联网核查')return {disclosure:false};
    return {width:innerWidth,height:innerHeight,visible:visible.length,header,compact:rows.every(node=>node.dataset.expanded==='false'&&node.getBoundingClientRect().height<=76&&!node.querySelector('.editorial-mark-expanded-content')?.checkVisibility())};
  })()`);
  if(compact.width===1280)check(compact.height===800 && compact.visible>=7 && compact.header<=84 && compact.compact, 'comments-seven-compact-visible', compact);
  else check(compact.width===1008 && compact.height===681 && compact.header<=84 && compact.compact, 'comments-overlay-compact-rows', compact);
  await commentsFilterMouse(renderer,check,waitFor);
  check(await renderer.evaluate(`(async () => {
    const words=document.querySelector('.editor-window [data-mark-id="'+__comments.ids[11]+'"]'),pane=document.querySelector('.manuscript-comments-scroll');
    words.scrollIntoView({block:'center',behavior:'instant'}); document.querySelector('.editor-window').scrollTop+=words.getBoundingClientRect().top-pane.getBoundingClientRect().top-24;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))); return true;
  })()`), 'comments-overflow-position');
  const elsewhere = await commentsNativeClick(renderer, await renderer.evaluate(commentsUnmarkedPoint));
  check(elsewhere.real, 'comments-real-unmarked-caret', elsewhere);
  await commentsRangeElsewhere(renderer, check, waitFor, '.editor-window [data-mark-id="'+await renderer.evaluate('__comments.ids[11]')+'"]');
  const wordPoint = await renderer.evaluate(`(async () => {
    const id=__comments.ids[11],words=document.querySelector('.editor-window [data-mark-id="'+id+'"]'),pane=document.querySelector('.manuscript-comments-scroll');
    words.scrollIntoView({block:'center',behavior:'instant'}); document.querySelector('.editor-window').scrollTop+=words.getBoundingClientRect().top-pane.getBoundingClientRect().top-24;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))); await Promise.all(document.body.getAnimations().map(a=>a.finished));
    const fresh=document.querySelector('.editor-window [data-mark-id="'+id+'"]'), r=fresh.getClientRects()[0],x=r.left+r.width/2,y=r.top+r.height/2;
    pane.scrollTop=0;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const c=document.querySelector('[data-comment-card="'+id+'"]')?.getBoundingClientRect(),p=pane.getBoundingClientRect();
    return {cardTop:c?.top,cardBottom:c?.bottom,paneTop:p.top,paneBottom:p.bottom,paneScroll:pane.scrollTop,x,y,outside:!!c && (c.top>=p.bottom || c.bottom<=p.top),hit:fresh.contains(document.elementFromPoint(x,y)),elsewhere:!fresh.contains(getSelection()?.anchorNode)};
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
  await commentsConnectorExposure(renderer, check, waitFor);
  check(await renderer.evaluate(`(() => { for(const id of __comments.ids.slice(2,4)){ const node=document.querySelector('[data-comment-card="'+id+'"]'); node.dispatchEvent(new PointerEvent('pointerenter')); node.dispatchEvent(new PointerEvent('pointerleave')); } return document.querySelector('[data-comment-card="'+__comments.ids[11]+'"]').dataset.selected==='true'; })()`), 'comments-hover-keeps-selection');
  const unmarkedClick = await commentsNativeClick(renderer, await renderer.evaluate(commentsUnmarkedPoint));
  check(unmarkedClick.real, 'comments-real-unmarked-clear', unmarkedClick);
  await waitFor(renderer, `!document.querySelector('[data-comment-card][data-selected="true"]') && !document.querySelector('[data-comment-leader]')`, 'comments-cleared-pair');

  await commentsInsideSelection(renderer,check,waitFor);
  const compactClick = await commentsSelectCard(renderer, check, waitFor, 2, true);
  check(compactClick.held.index===2 && Math.abs(compactClick.held.top-compactClick.before.top)<=1 && compactClick.held.selected!=='true' && compactClick.held.expanded==='false', 'comments-pushed-control-held-still', compactClick);
  const controlPoint = await commentsControlPoint(renderer, 2, 'reply', waitFor);
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
  const acceptPoint=await commentsControlPoint(renderer, 0, 'accept-and-apply', waitFor);
  check(await renderer.evaluate(`(() => {
    globalThis.__commentsApplySamples=[];globalThis.__commentsApplySampling=true;globalThis.__commentsApplyActivations=0;
    globalThis.__commentsApplySnapshot=()=>{const nodes=__comments.ids.map(id=>document.querySelector('[data-comment-card="'+id+'"]'));const first=nodes[0].getBoundingClientRect();__commentsApplySamples.push({top:first.top,height:first.height,words:document.querySelector('.editor-window [data-mark-id="'+__comments.ids[0]+'"]')?.getBoundingClientRect().top,pane:document.querySelector('.manuscript-comments-scroll').getBoundingClientRect().top,others:nodes.slice(1).map(node=>({expanded:node.dataset.expanded,top:node.getBoundingClientRect().top,height:node.getBoundingClientRect().height}))});};
    const sample=()=>{if(!__commentsApplySampling)return;__commentsApplySnapshot();requestAnimationFrame(sample);};sample();
    const button=document.querySelector('[data-comment-card="'+__comments.ids[0]+'"] [data-mark-action="accept-and-apply"]');
    button.addEventListener('click',()=>{__commentsApplyActivations++;});
    button.addEventListener('click',()=>button.click(),{once:true});
    return __commentsApplySamples[0].others.every(item=>item.expanded==='false');
  })()`),'comments-apply-compact-neighbors');
  const accept = await commentsNativeClick(renderer, acceptPoint);
  check(accept.real, 'comments-expanded-accept-real-click', accept);
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[0]+'"] [data-mark-application]') && document.querySelector('[data-comment-card="'+__comments.ids[0]+'"] [data-mark-state]').textContent.includes('已应用')`, 'comments-applied-pane-updated');
  await waitFor(renderer, `document.querySelector('.manuscript-comments-canvas').dataset.loading==='false' && __comments.ids.every(id=>document.querySelector('[data-comment-card="'+id+'"]')?.dataset.revalidating==='false')`,'comments-apply-reads-settled');
  const stable=await renderer.evaluate(`(() => {__commentsApplySnapshot();__commentsApplySampling=false;const samples=__commentsApplySamples,base=samples[0],heights=samples.map(item=>item.height),allowed=Math.max(...heights)-Math.min(...heights);return {samples:samples.length,compact:samples.every(sample=>sample.others.every(item=>item.expanded==='false')),drift:Math.max(...samples.flatMap(sample=>sample.others.map((item,index)=>Math.abs(item.top-base.others[index].top)))),allowed,selectedDrift:Math.max(...samples.map(sample=>Math.abs(sample.top-base.top))),wordsDrift:Math.max(...samples.filter(sample=>Number.isFinite(sample.words)).map(sample=>Math.abs(sample.words-base.words))),paneDrift:Math.max(...samples.map(sample=>Math.abs(sample.pane-base.pane))),relativeDrift:Math.max(...samples.flatMap(sample=>sample.others.map((item,index)=>Math.abs(item.top-sample.top-base.others[index].top+base.top)))),rowHeightDrift:Math.max(...samples.flatMap(sample=>sample.others.map((item,index)=>Math.abs(item.height-base.others[index].height)))),activations:__commentsApplyActivations};})()`);
  check(stable.samples>=2 && stable.compact,'comments-apply-read-state-stable',stable);
  check(stable.rowHeightDrift<=1 && stable.relativeDrift<=stable.allowed+1,'comments-apply-layout-height-bound',stable);
  check(stable.drift<=stable.allowed+stable.wordsDrift+1,'comments-apply-anchor-translation',stable);
  check(stable.activations===2,'comments-duplicate-apply-once',stable);

  check(await renderer.evaluate(`(async () => { const page=await window.ai7.getManuscriptWindowAt({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,target:{kind:'window-start',blockId:__comments.start}}); const card=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:__comments.ids[0]}); return page.journalSequence===__comments.journal+1 && page.blocks.find(block=>block.blockId===__comments.blockId).text.startsWith('合成') && card.suggestion.application!==null && !document.querySelector('[data-mark-preview="'+__comments.ids[0]+'"]') && document.querySelector('[data-testid="manuscript-editor"] [data-block-id="'+__comments.blockId+'"]').textContent.startsWith('合成'); })()`), 'comments-one-real-apply-and-text');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[1]+'"]')?.hidden===false && document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-action="reject"]')?.disabled===false`, 'comments-reject-card-ready');
  await commentsSelectCard(renderer, check, waitFor, 1);
  check(await renderer.evaluate(`(() => { const reject=document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-action="reject"]'); if(!reject||reject.disabled)return false; reject.click(); return true; })()`), 'comments-reject');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-state]').textContent.includes('已拒绝')`, 'comments-rejected-pane-updated');
  check(await renderer.evaluate(`(async () => { const page=await window.ai7.getManuscriptWindowAt({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,target:{kind:'window-start',blockId:__comments.start}}); const card=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:__comments.ids[1]}); return page.journalSequence===__comments.journal+1 && card.suggestion.decision.disposition==='rejected'; })()`), 'comments-reject-retains-text');
  await commentsHandledFilter(renderer, check, waitFor, [0, 1]);
}


export async function commentsReplyAndResolve(renderer, check, waitFor) {
  // A wheel scroll can remove preceding cards while a reply remains in the text's 200px buffer.
  // Reordering that live card must preserve the browser's focused editing state.
  check(await renderer.evaluate(`(() => {const node=document.querySelector('[data-comment-card="'+__comments.ids[11]+'"]');node.focus({preventScroll:true});return true;})()`), 'comments-buffer-reply-select');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[11]+'"]')?.dataset.expanded==='true'`, 'comments-buffer-reply-expanded');
  check(await renderer.evaluate(`(() => {
    const node=document.querySelector('[data-comment-card="'+__comments.ids[11]+'"]');node.querySelector('[data-mark-action="reply"]').click();
    const input=node.querySelector('[data-comment-reply]');if(!input)return false;
    input.value='公开合成滚动草稿';input.focus();input.setSelectionRange(2,4);globalThis.__commentsBufferReply=input;
    const ready=document.activeElement===input&&input.selectionStart===2&&input.selectionEnd===4;
    const scroll=document.querySelector('.editor-window'),first=document.querySelector('.editor-window [data-mark-id="'+__comments.ids[0]+'"]');if(!first)return false;
    scroll.scrollTop+=first.getBoundingClientRect().bottom-scroll.getBoundingClientRect().top+202;return ready;
  })()`), 'comments-buffer-reply-scroll');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[0]+'"]')?.hidden===true && document.querySelector('[data-comment-card="'+__comments.ids[11]+'"]')?.hidden===false`, 'comments-buffer-reply-reordered');
  const editing = await renderer.evaluate(`(() => {const input=document.querySelector('[data-comment-reply="'+__comments.ids[11]+'"]');return {same:input===__commentsBufferReply,focused:document.activeElement===input,start:input.selectionStart,end:input.selectionEnd,body:input.value==='公开合成滚动草稿',active:document.activeElement?.tagName};})()`);
  check(editing.same&&editing.focused&&editing.start===2&&editing.end===4&&editing.body,'comments-buffer-reply-caret',editing);
  check(await renderer.evaluate(`(() => {document.querySelector('.editor-window [data-mark-id="'+__comments.ids[2]+'"]').scrollIntoView({block:'center',behavior:'instant'});return true;})()`), 'comments-buffer-reply-return');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[2]+'"]')?.hidden===false`, 'comments-buffer-reply-returned');

  await commentsSelectCard(renderer, check, waitFor, 2, true);
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
    const split=value=>Array.from(new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(value),item=>item.segment);
    let comparison=block,from=card.toGrapheme;
    if(from+2>split(block.text).length){
      if(card.fromGrapheme>=2)from=card.fromGrapheme-2;
      else {comparison=page.blocks.slice(page.blocks.indexOf(block)+1).find(item=>item.kind==='paragraph'&&split(item.text??'').length>=2);from=0;}
    }
    if(!comparison)return false;
    const to=from+2,text=split(comparison.text).slice(from,to).join('');
    const result=await window.ai7.createEditorialMark({...binding,windowStartBlockId:page.blocks[0].blockId,clientMarkId:crypto.randomUUID(),baseRevisionId:page.revisionId,expectedJournalSequence:page.journalSequence,blockId:comparison.blockId,baseBlockDigest:comparison.digest,fromGrapheme:from,toGrapheme:to,selectedText:text,kind:'annotation',highlightColor:null,body:'公开合成模型筛选对照',proposedText:null,rationale:null});
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
  await waitFor(renderer, `(() => {
    const scroll=document.querySelector('.editor-window'),words=scroll.querySelector('[data-mark-id="'+__commentsModel.mark+'"]');if(!words)return false;
    const r=words.getClientRects()[0]??words.getBoundingClientRect(),v=scroll.getBoundingClientRect();
    if(r.top<v.top+40||r.bottom>v.bottom-40){scroll.scrollTop+=r.top-v.top-80;return false;}
    return document.querySelector('[data-comment-card="'+__commentsModel.mark+'"] [data-mark-source]')?.textContent===__commentsModel.source && document.querySelector('[data-comment-card="'+__commentsModel.mark+'"]')?.hidden===false && document.querySelector('[data-comment-card="'+__commentsModel.other+'"]')?.hidden===false && document.querySelector('.manuscript-comments-canvas').dataset.loading==='false';
  })()`, 'comments-model-cards-ready');
  check(await renderer.evaluate(`(() => {document.querySelector('[data-mark-filter-toggle]').click();const chip=document.querySelector('[data-mark-model-filter="'+__commentsModel.source+'"]');if(!chip)return false;chip.click();return true;})()`), 'comments-model-chip');
  try {
    await waitFor(renderer, `document.querySelector('[data-comment-card="'+__commentsModel.mark+'"]')?.hidden===false && document.querySelector('[data-comment-card="'+__commentsModel.other+'"]')?.hidden===true && document.querySelector('.editor-window [data-mark-id="'+__commentsModel.other+'"]')?.dataset.markFilteredOut==='true' && !document.querySelector('.editor-window [data-mark-id="'+__commentsModel.mark+'"][data-mark-filtered-out]')`, 'comments-model-cards-and-highlights');
  } catch {
    const flags=await renderer.evaluate(`(() => {const model=__commentsModel;return {ordinary:document.documentElement.dataset.technicalLayerVisible==='false',selected:document.querySelector('[data-mark-model-filter="'+model.source+'"]')?.getAttribute('aria-pressed'),sourceHidden:document.querySelector('[data-comment-card="'+model.mark+'"]')?.hidden,editorHidden:document.querySelector('[data-comment-card="'+model.other+'"]')?.hidden,sourceWord:!!document.querySelector('.editor-window [data-mark-id="'+model.mark+'"]'),editorWord:!!document.querySelector('.editor-window [data-mark-id="'+model.other+'"]'),sourceDim:!!document.querySelector('.editor-window [data-mark-id="'+model.mark+'"][data-mark-filtered-out]'),editorDim:!!document.querySelector('.editor-window [data-mark-id="'+model.other+'"][data-mark-filtered-out]')};})()`);
    check(false,'comments-model-cards-and-highlights',flags);
  }
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
