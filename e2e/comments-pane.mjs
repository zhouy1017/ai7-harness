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
    check(await renderer.evaluate(`(() => { document.querySelector('.manuscript-comments-heading button').click(); return document.querySelector('.manuscript-comments-pane').hidden; })()`), 'comments-layout-close');
  }
  await renderer.send('Emulation.clearDeviceMetricsOverride');
  await waitFor(renderer, `innerWidth===${native.width} && innerHeight===${native.height}`, 'comments-native-viewport-restored');
  check(await renderer.evaluate(`(() => { document.querySelector('[data-view-command="menu"]').click(); const button=document.querySelector('[data-view-command="toggle-comments"]'); if(!button||button.disabled)return false; button.click(); return document.querySelector('[data-edge-entry="comments"]').getAttribute('aria-expanded')==='true' && button.getAttribute('aria-pressed')==='true'; })()`), 'comments-view-menu-synchronized');
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F9', code: 'F9', windowsVirtualKeyCode: 120 });
  await renderer.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F9', code: 'F9', windowsVirtualKeyCode: 120 });
  await waitFor(renderer, `document.querySelector('.manuscript-comments-pane').hidden===true && document.querySelector('[data-view-command="toggle-comments"]').getAttribute('aria-pressed')==='false'`, 'comments-f9-synchronized');
}

export async function seedCommentsPane(renderer, check, waitFor) {
  check(await renderer.evaluate(`(async () => {
    const editor=document.querySelector('[data-testid="manuscript-editor"]');
    const bookId=document.querySelector('.editor-shell').dataset.bookId;
    const work=(await window.ai7.listPriorWork()).find((item)=>item.bookId===bookId);
    const binding={manuscriptId:work.manuscriptId,branchId:work.branchId};
    const start=editor.querySelector('[data-block-id]').dataset.blockId;
    const page=await window.ai7.getManuscriptWindowAt({...binding,target:{kind:'window-start',blockId:start}});
    const block=page.blocks.find((item)=>item.kind==='paragraph' && Array.from(item.text??'').length>=20);
    if(!block)return false;
    const ids=[]; const kinds=['change-suggestion','change-suggestion','annotation','annotation','editor-note'];
    for(let index=0;index<5;index++){
      const words=Array.from(new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(block.text),item=>item.segment);
      const from=index*3, to=from+2;
      const result=await window.ai7.createEditorialMark({...binding,windowStartBlockId:start,clientMarkId:crypto.randomUUID(),baseRevisionId:page.revisionId,expectedJournalSequence:page.journalSequence,blockId:block.blockId,baseBlockDigest:block.digest,fromGrapheme:from,toGrapheme:to,selectedText:words.slice(from,to).join(''),kind:kinds[index],highlightColor:null,body:index>=2?'公开合成批注 '+index:'',proposedText:index<2?'合成':null,rationale:index<2?'公开合成理由':null});
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
  check(await renderer.evaluate(`(() => { const editor=document.querySelector('[data-testid="manuscript-editor"]'); editor.querySelector('[data-block-id="'+__comments.blockId+'"]').scrollIntoView({block:'center'}); const entry=document.querySelector('[data-edge-entry="comments"]'); if(entry.getAttribute('aria-expanded')!=='true')entry.click(); return true; })()`), 'comments-open');
  await waitFor(renderer, `__comments.ids.every(id=>document.querySelector('[data-comment-card="'+id+'"]')?.hidden===false) && document.querySelector('.manuscript-comments-canvas').dataset.loading==='false'`, 'comments-five-visible');
}

export async function commentsGeometryAndScroll(renderer, check, waitFor) {
  check(await renderer.evaluate(`(() => {
    const cards=__comments.ids.map(id=>document.querySelector('[data-comment-card="'+id+'"]'));
    const sorted=cards.map(node=>node.getBoundingClientRect()).sort((a,b)=>a.top-b.top);
    const pane=document.querySelector('.manuscript-comments-scroll');
    const clear=sorted.every((box,index)=>box.height>0 && (index===0||box.top>=sorted[index-1].bottom+9));
    globalThis.__commentsReads=document.querySelector('.manuscript-comments-canvas').dataset.cardReads;
    const first=cards[0]; first.focus(); first.dispatchEvent(new PointerEvent('pointerenter'));
    return clear && pane.scrollHeight>=sorted[sorted.length-1].bottom-pane.getBoundingClientRect().top-1 && document.documentElement.dataset.technicalLayerVisible==='false' && cards.every(card=>!card.textContent.match(/[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{64}/i));
  })()`), 'comments-five-measured-no-overlap');
  await waitFor(renderer, `document.querySelector('[data-comment-leader="'+__comments.ids[0]+'"]') && document.querySelector('.manuscript-comments-anchor') && document.querySelector('[data-comment-card="'+__comments.ids[0]+'"]').dataset.active==='true'`, 'comments-anchor-and-leader');
  check(await renderer.evaluate(`(async () => {
    const scroll=document.querySelector('.editor-window'); const before=scroll.scrollTop;
    scroll.scrollTop=before+12; await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    scroll.scrollTop=before; window.dispatchEvent(new Event('resize')); await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    return document.querySelector('.manuscript-comments-canvas').dataset.cardReads===__commentsReads;
  })()`), 'comments-scroll-zero-card-ipc');
  check(await renderer.evaluate(`(() => { const cards=__comments.ids.map(id=>document.querySelector('[data-comment-card="'+id+'"]')); cards[0].focus(); cards[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true})); return document.activeElement===cards[1]; })()`), 'comments-arrow-focus');
  check(await renderer.evaluate(`(() => { const node=document.activeElement; node.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,isComposing:true})); return document.activeElement===node; })()`), 'comments-ime-escape');
  check(await renderer.evaluate(`(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); return document.activeElement===document.querySelector('[data-testid="manuscript-editor"]'); })()`), 'comments-escape-anchor-focus');
}

export async function commentsApplyAndReject(renderer, check, waitFor) {
  check(await renderer.evaluate(`(() => { const card=document.querySelector('[data-comment-card="'+__comments.ids[0]+'"]'); card.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); const accept=card.querySelector('[data-mark-action="accept-and-apply"]'); if(!accept||accept.disabled)return false; accept.click(); accept.click(); return true; })()`), 'comments-accept-once');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[0]+'"] [data-mark-application]') && document.querySelector('[data-comment-card="'+__comments.ids[0]+'"] [data-mark-state]').textContent==='已应用'`, 'comments-applied-pane-updated');
  check(await renderer.evaluate(`(async () => { const page=await window.ai7.getManuscriptWindowAt({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,target:{kind:'window-start',blockId:__comments.start}}); const card=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:__comments.ids[0]}); return page.journalSequence===__comments.journal+1 && page.blocks.find(block=>block.blockId===__comments.blockId).text.startsWith('合成') && card.suggestion.application!==null && !document.querySelector('[data-mark-preview="'+__comments.ids[0]+'"]') && document.querySelector('[data-testid="manuscript-editor"] [data-block-id="'+__comments.blockId+'"]').textContent.startsWith('合成'); })()`), 'comments-one-real-apply-and-text');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[1]+'"]')?.hidden===false && document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-action="reject"]')?.disabled===false`, 'comments-reject-card-ready');
  check(await renderer.evaluate(`(() => { const reject=document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-action="reject"]'); if(!reject||reject.disabled)return false; reject.click(); return true; })()`), 'comments-reject');
  await waitFor(renderer, `document.querySelector('[data-comment-card="'+__comments.ids[1]+'"] [data-mark-state]').textContent.includes('已拒绝')`, 'comments-rejected-pane-updated');
  check(await renderer.evaluate(`(async () => { const page=await window.ai7.getManuscriptWindowAt({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,target:{kind:'window-start',blockId:__comments.start}}); const card=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:__comments.ids[1]}); return page.journalSequence===__comments.journal+1 && card.suggestion.decision.disposition==='rejected'; })()`), 'comments-reject-retains-text');
}

export async function commentsReplyAndResolve(renderer, check, waitFor) {
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
