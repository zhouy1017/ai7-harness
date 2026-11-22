import { capturePointerFailure, pointerFailureDetail } from './dispatch-chooser.mjs';
import { SIDEBAR, localDebugEnabled, recordDebugDetail } from './controller.mjs';
import { railJump } from './marks-paging.mjs';

/** Preserve the original failure and use the existing closed, text-free hosted geometry channel. */
export async function draftGeometry(renderer, selector, assertion, { waitFor, name = 'draft-geometry' } = {}) {
  try {
    if (waitFor) {
      const boxes=`(() => {const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;return [node,...node.querySelectorAll('button,input,textarea')].map(item=>{const r=item.getBoundingClientRect();return [r.left,r.top,r.width,r.height];});})()`;
      await waitFor(renderer,`new Promise(resolve=>requestAnimationFrame(()=>{const before=JSON.stringify(${boxes});requestAnimationFrame(()=>resolve(before!=='null'&&before===JSON.stringify(${boxes})));}))`,name+'-stable');
    }
    return await assertion();
  } catch (error) {
    const detail=pointerFailureDetail(await capturePointerFailure(renderer,selector,{includeTargetAncestors:true}))??{unavailable:true};
    if(error&&typeof error==='object')Object.defineProperty(error,'pointerFailure',{value:detail,configurable:true});
    throw error;
  }
}

/** A named control must already be reachable before the real press. Never scroll it by script. */
export async function draftClick(renderer, check, waitFor, selector, name, button = 'left') {
  return draftGeometry(renderer, selector, async () => {
  const point = `(() => {const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;
    let range=document.createRange();range.selectNodeContents(node);if(${button === 'right'}&&node.matches('[data-block-id]')&&getSelection()?.rangeCount&&!getSelection().isCollapsed)range=getSelection().getRangeAt(0);const rects=node.matches('[data-block-id]')?Array.from(range.getClientRects()):[node.getBoundingClientRect()];
    for(const r of rects){if(r.width<=0||r.height<=0||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)continue;
      let visible=true;for(let parent=node.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent),p=parent.getBoundingClientRect(),left=p.left+parent.clientLeft,top=p.top+parent.clientTop;
        if((/auto|scroll|hidden|clip/.test(style.overflowX)&&(r.left<left||r.right>left+parent.clientWidth))||(/auto|scroll|hidden|clip/.test(style.overflowY)&&(r.top<top||r.bottom>top+parent.clientHeight))){visible=false;break;}}
      const x=r.left+r.width/2,y=r.top+r.height/2;if(visible&&node.contains(document.elementFromPoint(x,y)))return {x,y};}return null;})()`;
  await waitFor(renderer, `new Promise(resolve=>requestAnimationFrame(()=>{const before=JSON.stringify(${point});requestAnimationFrame(()=>resolve(before!=='null'&&before===JSON.stringify(${point})));}))`, name+'-visible');
  const at = await renderer.evaluate(point); check(at!==null,name+'-hit');
  await renderer.send('Input.dispatchMouseEvent',{type:'mouseMoved',...at,buttons:0});
  check(JSON.stringify(await renderer.evaluate(point))===JSON.stringify(at),name+'-before-press');
  await renderer.send('Input.dispatchMouseEvent',{type:'mousePressed',...at,button,buttons:button==='left'?1:2,clickCount:1});
  await renderer.send('Input.dispatchMouseEvent',{type:'mouseReleased',...at,button,buttons:0,clickCount:1});
  await renderer.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),280))');
  });
}

export async function draftKey(renderer, key, code, modifiers=0) {
  const values={key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,modifiers};
  await renderer.send('Input.dispatchKeyEvent',{type:'keyDown',...values,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
  await renderer.send('Input.dispatchKeyEvent',{type:'keyUp',...values});
}

/** Choose manuscript words with native pointer/keys. Reading the snapshot never installs a selection. */
export async function draftSelect(renderer, check, waitFor, blockId, from, to, name) {
  await draftClick(renderer,check,waitFor,`[data-testid="manuscript-editor"] [data-block-id="${blockId}"]`,name+'-text');
  await draftKey(renderer,'Home',36);
  const snapshot=`(() => {const raw=document.querySelector('[data-testid="manuscript-editor"]').dataset.selectionSnapshot;return raw?JSON.parse(raw):null;})()`;
  await waitFor(renderer,`(() => {const s=${snapshot};return s?.anchor.blockId===${JSON.stringify(blockId)}&&s.head.blockId===${JSON.stringify(blockId)}&&s.anchor.grapheme===0&&s.head.grapheme===0;})()`,name+'-start');
  for(let step=0;step<from;step++)await draftKey(renderer,'ArrowRight',39);
  for(let step=from;step<to;step++)await draftKey(renderer,'ArrowRight',39,8);
  await waitFor(renderer,`(() => {const s=${snapshot};return s?.anchor.blockId===${JSON.stringify(blockId)}&&s.head.blockId===${JSON.stringify(blockId)}&&s.anchor.grapheme===${from}&&s.head.grapheme===${to};})()`,name+'-selected');
}

/** Guest-debug only: structural focus/list context, never field values, words, ids or attribute payloads. */
async function recordDraftSeek(renderer,selector,name,turn) {
  if(!localDebugEnabled())return;
  const facts=await renderer.evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector)}),card=node?.closest('[data-comment-card]'),id=card?.dataset.commentCard,ids=globalThis.__comments?.ids??[],focus=document.activeElement,text=document.querySelector('.editor-window'),pane=document.querySelector('.manuscript-comments-scroll'),anchor=id?document.querySelector('.editor-window [data-mark-id="'+id+'"]'):null,box=n=>{const r=n?.getBoundingClientRect();return r?[r.left,r.top,r.width,r.height]:null;},hidden=n=>!!n?.closest('[hidden]');return {turn:${turn},target:!!node,card:ids.indexOf(id),hidden:hidden(card),expanded:card?.dataset.expanded==='true',selected:card?.dataset.selected==='true',updating:card?.dataset.revalidating==='true',anchor:box(anchor),targetBox:box(node),textBox:box(text),paneBox:box(pane),textScroll:text?.scrollTop,paneScroll:pane?.scrollTop,seedBlockLoaded:!!document.querySelector('.editor-window [data-block-id="'+globalThis.__comments?.blockId+'"]'),visibleCards:Array.from(document.querySelectorAll('[data-comment-card]')).filter(n=>!n.hidden).map(n=>ids.indexOf(n.dataset.commentCard)),focusTag:focus?.tagName,focusClasses:typeof focus?.className==='string'?focus.className.split(/\s+/).slice(0,6):[],focusCard:ids.indexOf(focus?.closest('[data-comment-card]')?.dataset.commentCard),statusFilter:document.querySelector('[data-mark-status-filter][aria-pressed="true"]')?.dataset.markStatusFilter,searchEmpty:!document.querySelector('[data-mark-search-input]')?.value};})()`);
  recordDebugDetail('J-08','draft-seek/'+name+'/'+JSON.stringify(facts));
}

export async function draftTabTo(renderer,selector,check,name) {
  return draftGeometry(renderer,selector,async()=>{
    for(let turn=0;turn<100;turn++) {
      await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
      await recordDraftSeek(renderer,selector,name,turn);
      const ready=await renderer.evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector)}),card=node?.closest('[data-comment-card]'),r=node?.getBoundingClientRect();return !!node&&document.activeElement===node&&r.width>0&&r.height>0&&(!card||card.dataset.selected==='true');})()`);
      if(ready)return;
      await draftKey(renderer,'Tab',9);
    }
    await recordDraftSeek(renderer,selector,name,100);
    check(false,name);
  });
}

export async function replyDraftKept(renderer,check,waitFor,at) {
  at('reply-draft-kept');
  const id=await renderer.evaluate('__comments.ids[2]');
  const card=`[data-comment-card="${id}"]`, input=card+' [data-comment-reply]', reply=card+' [data-mark-action="reply"]';
  // Tab is the reader's way to reach a low control of a tall card; no scripted scroll precedes the hit check.
  await draftTabTo(renderer,reply,check,'reply-draft-tab-first-reply');
  await draftClick(renderer,check,waitFor,reply,'reply-draft-open');
  await waitFor(renderer,`document.activeElement===document.querySelector(${JSON.stringify(input)})`,'reply-draft-focused');
  await renderer.send('Input.insertText',{text:'公开合成会话回复'});
  const other=await renderer.evaluate('__comments.ids[3]');
  await draftTabTo(renderer,`[data-comment-card="${other}"]`,check,'reply-draft-tab-other');
  check(await renderer.evaluate(`document.querySelector(${JSON.stringify(input)})?.value==='公开合成会话回复' && document.querySelector('[data-comment-card="${other}"]').dataset.selected==='true'`),'reply-draft-other-card-kept');
  await draftClick(renderer,check,waitFor,'[data-mark-filter-toggle]','reply-draft-filter');
  await draftClick(renderer,check,waitFor,'[data-mark-status-filter="open"]','reply-draft-hide');
  await waitFor(renderer,`document.querySelector(${JSON.stringify(card)})?.hidden===true`,'reply-draft-hidden');
  await draftClick(renderer,check,waitFor,'[data-mark-status-filter="all"]','reply-draft-unfilter');
  await draftClick(renderer,check,waitFor,'[data-mark-filter-toggle]','reply-draft-filter-close');
  let replyWords='公开合成会话回复';
  const kept=()=>`document.querySelector(${JSON.stringify(input)})?.value===${JSON.stringify(replyWords)}`;
  await waitFor(renderer,kept(),'reply-draft-filter-kept');
  await draftClick(renderer,check,waitFor,'.manuscript-comments-heading [aria-label="关闭批注栏"]','reply-draft-pane-close');
  await draftClick(renderer,check,waitFor,`.editor-window [data-mark-id="${id}"]`,'reply-draft-floating');
  await waitFor(renderer,`document.querySelector('[data-mark-card="${id}"] [data-mark-form="reply"] textarea')?.value==='公开合成会话回复'`,'reply-draft-floating-kept');
  const floatingInput=`[data-mark-card="${id}"] [data-mark-form="reply"] textarea`;
  await draftClick(renderer,check,waitFor,floatingInput,'reply-draft-floating-edit');
  await draftKey(renderer,'a',65,2); await renderer.send('Input.insertText',{text:'公开合成会话回复 · 浮卡补充'});
  await waitFor(renderer,`document.querySelector(${JSON.stringify(floatingInput)})?.value==='公开合成会话回复 · 浮卡补充'`,'reply-draft-floating-edited');
  await draftKey(renderer,'Escape',27);
  await draftClick(renderer,check,waitFor,'[data-edge-entry="comments"]','reply-draft-pane-return');
  replyWords='公开合成会话回复 · 浮卡补充';
  await waitFor(renderer,kept(),'reply-draft-pane-kept');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('overview'),'reply-draft-overview');
  await waitFor(renderer,`!document.querySelector('.editor-shell')`,'reply-draft-left-screen');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('manuscript'),'reply-draft-screen-return');
  await waitFor(renderer,kept(),'reply-draft-screen-kept');
  check(await renderer.evaluate(`(async()=>{const c=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:${JSON.stringify(id)}});return !c.replies.some(reply=>reply.body.includes('公开合成会话回复'));})()`),'reply-draft-before-send-silent');
  await draftTabTo(renderer,input,check,'reply-draft-tab-input');
  await draftClick(renderer,check,waitFor,input,'reply-draft-send-focus');
  await draftKey(renderer,'Enter',13); await draftKey(renderer,'Enter',13);
  await waitFor(renderer,`document.querySelector(${JSON.stringify(card+' [data-mark-region="replies"]')})?.textContent.includes('公开合成会话回复 · 浮卡补充')&&!document.querySelector(${JSON.stringify(input)})?.value`,'reply-draft-sent');
  check(await renderer.evaluate(`(async()=>{const c=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:${JSON.stringify(id)}});return c.replies.filter(reply=>reply.body==='公开合成会话回复 · 浮卡补充').length===1;})()`),'reply-draft-sent-once');
  await draftTabTo(renderer,reply,check,'reply-draft-tab-late-reply');
  await draftClick(renderer,check,waitFor,reply,'reply-draft-late-open');
  await renderer.send('Input.insertText',{text:'公开合成离页回复'});
  await draftKey(renderer,'Enter',13);
  await draftClick(renderer,check,waitFor,SIDEBAR.section('overview'),'reply-draft-leave-sending');
  await waitFor(renderer,`!document.querySelector('.editor-shell')`,'reply-draft-late-left');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('manuscript'),'reply-draft-late-return');
  await waitFor(renderer,`document.querySelector(${JSON.stringify(card+' [data-mark-region="replies"]')})?.textContent.includes('公开合成离页回复')&&!document.querySelector(${JSON.stringify(input)})?.value`,'reply-draft-late-cleared');
}

async function verifyComposerWords(renderer,check,waitFor,row,field,name) {
  await draftClick(renderer,check,waitFor,row,name+'-expand');
  check(await renderer.evaluate(`document.querySelector(${JSON.stringify(field)})?.value==='公开合成未发送批注' && document.activeElement===document.querySelector(${JSON.stringify(field)})`),name+'-words');
  await draftKey(renderer,'Escape',27);
  await waitFor(renderer,`document.querySelector(${JSON.stringify(row)})&&!document.querySelector('[data-mark-composer]')`,name+'-fold');
}

/** The temporary responsiveness edit must return the exact persisted choice, even when its assertion fails. */
export async function withDraftDirectEdit(renderer,check,waitFor,edit) {
  const original=await renderer.evaluate(`document.querySelector('[data-edit-method][aria-checked="true"]')?.dataset.editMethod`);
  check(['direct','confirm','auto'].includes(original),'draft-original-edit-method');
  const choose=async(method,name)=>{
    await draftClick(renderer,check,waitFor,'[data-editor-input-mode-toggle]',name+'-menu');
    await draftClick(renderer,check,waitFor,`[data-edit-method="${method}"]`,name+'-choose');
    await waitFor(renderer,`document.querySelector('[data-edit-method="${method}"]').getAttribute('aria-checked')==='true'`,name+'-ready');
  };
  try { if(original!=='direct')await choose('direct','draft-direct-mode'); await edit(); }
  finally { if(original!=='direct')await choose(original,'draft-edit-mode-restore'); }
}

export async function markDraftKept(renderer,check,waitFor,at,blockId) {
  at('mark-draft-kept');
  const pane='.manuscript-comments-pane', row='[data-mark-draft-row="annotation"]', field='[data-mark-composer="create-annotation"] textarea';
  if(await renderer.evaluate(`document.querySelector('${pane}').hidden`)) await draftClick(renderer,check,waitFor,'[data-edge-entry="comments"]','draft-pane-open');
  await draftSelect(renderer,check,waitFor,blockId,0,1,'draft-range');
  await draftClick(renderer,check,waitFor,'[data-comments-add="annotation"]','draft-add');
  await waitFor(renderer,`document.activeElement===document.querySelector('${field}')`,'draft-focus');
  await renderer.send('Input.insertText',{text:'公开合成未发送批注'});
  await renderer.evaluate(`(() => {const editor=document.querySelector('.ProseMirror'),block=document.querySelector('[data-block-id="${blockId}"]');globalThis.__draftProof={block,mutations:0,text:new Map(Array.from(editor.querySelectorAll('[data-block-id]')).map(node=>[node.dataset.blockId,window.__j05.text(node.dataset.blockId)]))};__draftProof.observer=new MutationObserver(records=>{__draftProof.mutations+=records.filter(record=>record.target!==editor||record.type!=='attributes'||record.attributeName!=='class').length;});__draftProof.observer.observe(editor,{childList:true,subtree:true,attributes:true,characterData:true});return true;})()`);
  // An internal press on the quote must not close either an empty or a populated composer.
  await draftClick(renderer,check,waitFor,'[data-mark-composer] [data-mark-quote]','draft-inside-quote');
  check(await renderer.evaluate(`document.querySelector('${field}')?.value==='公开合成未发送批注'`),'draft-inside-kept');
  const before=await renderer.evaluate(`document.querySelector('.editor-window').scrollTop`);
  await draftKey(renderer,'Escape',27);
  const kept=`document.querySelector('${row}') && !document.querySelector('[data-mark-composer]') && !document.querySelector('${row}').contains(document.activeElement)`;
  await waitFor(renderer,kept,'draft-folded');
  check(await renderer.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const block=document.querySelector('[data-block-id="${blockId}"]');__draftProof.observer.disconnect();resolve(__draftProof.mutations===0&&block===__draftProof.block&&block.getAttribute('style')===null);})))`),'draft-fold-no-editor-mutations');
  await draftGeometry(renderer,row,async()=>{ check(await renderer.evaluate(`(() => {const row=document.querySelector('${row}'),block=document.querySelector('[data-block-id="${blockId}"]'),next=block.nextElementSibling;if(!next)return false;const a=row.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(next);const b=range.getClientRects()[0];return b&&a.bottom<=b.top&&document.querySelector('.editor-window').scrollTop===${before};})()`),'draft-fold-gap-scroll'); }, {waitFor,name:'draft-fold-gap-scroll'});
  // Type elsewhere while the row is folded, read it back, then undo this admitted sample edit.
  const nextBlock=await renderer.evaluate(`document.querySelector('[data-block-id="${blockId}"]').nextElementSibling.dataset.blockId`);
  const nextBefore=await renderer.evaluate(`window.__j05.text(${JSON.stringify(nextBlock)})`);
  await withDraftDirectEdit(renderer,check,waitFor,async()=>{
    await draftClick(renderer,check,waitFor,`[data-testid="manuscript-editor"] [data-block-id="${nextBlock}"]`,'draft-responsive-text');
    await renderer.send('Input.insertText',{text:'⟐'});
    await waitFor(renderer,`(() => {const text=window.__j05.text(${JSON.stringify(nextBlock)});return text?.length===${nextBefore.length+1}&&text.replace('⟐','')===${JSON.stringify(nextBefore)};})()`,'draft-responsive-readback');
    await draftKey(renderer,'z',90,2);
    await waitFor(renderer,`window.__j05.text(${JSON.stringify(nextBlock)})===${JSON.stringify(nextBefore)}`,'draft-responsive-undone');
  });

  // Simulate a mark added in another window: the ordinary background read must arrive while the row stands unfocused.
  await renderer.evaluate(`(async()=>{const work=(await window.ai7.listPriorWork()).find(item=>item.bookId===document.querySelector('.editor-shell').dataset.bookId),binding={manuscriptId:work.manuscriptId,branchId:work.branchId},page=await window.ai7.getManuscriptWindowAt({...binding,target:{kind:'block',blockId:${JSON.stringify(nextBlock)}}}),block=page.blocks.find(item=>item.blockId===${JSON.stringify(nextBlock)});const result=await window.ai7.createEditorialMark({...binding,windowStartBlockId:page.blocks[0].blockId,clientMarkId:crypto.randomUUID(),baseRevisionId:page.revisionId,expectedJournalSequence:page.journalSequence,blockId:block.blockId,baseBlockDigest:block.digest,fromGrapheme:0,toGrapheme:1,selectedText:Array.from(block.text)[0],kind:'personal-highlight',highlightColor:1,body:'',proposedText:null,rationale:null});globalThis.__draftBackground={...binding,windowStartBlockId:page.blocks[0].blockId,markId:result.markId};return true;})()`);
  await waitFor(renderer,`document.querySelector('.editor-window [data-mark-id="'+__draftBackground.markId+'"]') && ${kept}`,'draft-background-read-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-background-read-kept');
  await renderer.evaluate(`window.ai7.updateEditorialMark({...__draftBackground,action:'remove',body:null,highlightColor:null,status:null,targetKind:null,proposedText:null,rationale:null})`);
  await waitFor(renderer,`!document.querySelector('.editor-window [data-mark-id="'+__draftBackground.markId+'"]')`,'draft-background-cleanup');
  await draftClick(renderer,check,waitFor,row,'draft-expand');
  check(await renderer.evaluate(`document.querySelector('${field}').value==='公开合成未发送批注' && document.activeElement===document.querySelector('${field}')`),'draft-expanded-words');
  // A real press on the paragraph folds the form, retaining the text without sending it.
  await draftClick(renderer,check,waitFor,`[data-testid="manuscript-editor"] [data-block-id="${blockId}"]`,'draft-text');
  await waitFor(renderer,kept,'draft-text-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-text-kept');
  await draftClick(renderer,check,waitFor,row,'draft-mark-expand');
  await draftClick(renderer,check,waitFor,`.editor-window [data-block-id="${blockId}"] [data-mark-kind="personal-highlight"]`,'draft-other-mark');
  await waitFor(renderer,kept,'draft-mark-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-mark-kept');
  await draftClick(renderer,check,waitFor,`[data-testid="manuscript-editor"] [data-block-id="${blockId}"]`,'draft-menu','right');
  await waitFor(renderer,`document.querySelector('[data-mark-menu]')`,'draft-menu-open');
  await draftKey(renderer,'Escape',27); await waitFor(renderer,kept,'draft-menu-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-menu-kept');
  await draftClick(renderer,check,waitFor,'.manuscript-comments-heading [aria-label="关闭批注栏"]','draft-pane-close');
  await draftClick(renderer,check,waitFor,'[data-edge-entry="comments"]','draft-pane-return');
  await waitFor(renderer,kept,'draft-pane-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-pane-kept');
  await draftClick(renderer,check,waitFor,'[data-edge-entry="tasks"]','draft-tasks');
  await waitFor(renderer,`document.querySelector('#task-drawer:not([hidden])')`,'draft-tasks-ready');
  await draftClick(renderer,check,waitFor,'.task-drawer-close','draft-tasks-close');
  await waitFor(renderer,kept,'draft-tasks-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-tasks-kept');
  for(let turn=0;turn<60 && await renderer.evaluate(`!!document.querySelector('[data-testid="manuscript-editor"] [data-block-id="${blockId}"]')`);turn++) {
    const point=await renderer.evaluate(`(() => {const node=document.querySelector('.editor-window'),r=node.getBoundingClientRect(),x=r.left+16,y=Math.min(innerHeight,r.bottom)-25;return {x,y,delta:Math.max(240,node.clientHeight*.8),hit:node.contains(document.elementFromPoint(x,y))};})()`);
    check(point.hit,'draft-edge-wheel-hit');
    await renderer.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:point.delta});
    await renderer.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  }
  await waitFor(renderer,`!document.querySelector('[data-testid="manuscript-editor"] [data-block-id="${blockId}"]')`,'draft-place-away');
  await railJump(renderer,waitFor,check,0,'draft-page-back');
  await waitFor(renderer,kept,'draft-page-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-page-kept');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('overview'),'draft-overview');
  await waitFor(renderer,`!document.querySelector('.editor-shell')`,'draft-overview-ready');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('manuscript'),'draft-manuscript');
  await waitFor(renderer,kept,'draft-screen-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-screen-kept');
  const manuscript=await renderer.evaluate(`(async()=> (await window.ai7.listPriorWork()).find(item=>item.bookId===document.querySelector('.editor-shell').dataset.bookId).manuscriptId)()`);
  await draftClick(renderer,check,waitFor,SIDEBAR.destination('library'),'draft-library');
  await waitFor(renderer,`document.querySelector('.recent-work-item button[data-manuscript-id="${manuscript}"]')`,'draft-library-ready');
  await draftClick(renderer,check,waitFor,`.recent-work-item button[data-manuscript-id="${manuscript}"]`,'draft-book-return');
  await waitFor(renderer,kept,'draft-book-kept');
  await verifyComposerWords(renderer,check,waitFor,row,field,'draft-book-kept');
  await draftClick(renderer,check,waitFor,row,'draft-final-expand');
  check(await renderer.evaluate(`document.querySelector('${field}').value==='公开合成未发送批注'`),'draft-final-words');
  await draftClick(renderer,check,waitFor,field,'draft-discard-field-focus');
  await draftClick(renderer,check,waitFor,'[data-mark-composer] [data-mark-action="cancel"]','draft-discard');
  await waitFor(renderer,`!document.querySelector('${row}')&&!document.querySelector('[data-mark-composer]')`,'draft-discarded');
  check(await renderer.evaluate(`Array.from(__draftProof.text).every(([id,text])=>window.__j05.text(id)===text)`),'draft-text-unchanged');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('overview'),'draft-cancel-leave');
  await waitFor(renderer,`!document.querySelector('.editor-shell')`,'draft-cancel-left');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('manuscript'),'draft-cancel-return');
  await waitFor(renderer,`document.querySelector('.editor-shell')&&!document.querySelector('${row}')&&!document.querySelector('[data-mark-composer]')`,'draft-cancel-stays-gone');
  await draftClick(renderer,check,waitFor,'.manuscript-comments-heading [aria-label="关闭批注栏"]','draft-pane-reset');
}
