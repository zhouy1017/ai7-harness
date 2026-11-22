import { capturePointerFailure, pointerFailureDetail } from './dispatch-chooser.mjs';
import { SIDEBAR } from './controller.mjs';
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
      let visible=true;for(let parent=node.parentElement;parent;parent=parent.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(parent).overflowY)){const p=parent.getBoundingClientRect();if(r.top<p.top||r.bottom>p.bottom){visible=false;break;}}}
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

async function draftTabTo(renderer,selector) {
  for(let turn=0;turn<100 && !(await renderer.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`));turn++) await draftKey(renderer,'Tab',9);
}

export async function replyDraftKept(renderer,check,waitFor,at) {
  at('reply-draft-kept');
  const id=await renderer.evaluate('__comments.ids[2]');
  const card=`[data-comment-card="${id}"]`, input=card+' [data-comment-reply]', reply=card+' [data-mark-action="reply"]';
  // Tab is the reader's way to reach a low control of a tall card; no scripted scroll precedes the hit check.
  await draftTabTo(renderer,reply);
  await draftClick(renderer,check,waitFor,reply,'reply-draft-open');
  await waitFor(renderer,`document.activeElement===document.querySelector(${JSON.stringify(input)})`,'reply-draft-focused');
  await renderer.send('Input.insertText',{text:'公开合成会话回复'});
  const other=await renderer.evaluate('__comments.ids[3]');
  await draftTabTo(renderer,`[data-comment-card="${other}"]`);
  check(await renderer.evaluate(`document.querySelector(${JSON.stringify(input)})?.value==='公开合成会话回复' && document.querySelector('[data-comment-card="${other}"]').dataset.selected==='true'`),'reply-draft-other-card-kept');
  await draftClick(renderer,check,waitFor,'[data-mark-filter-toggle]','reply-draft-filter');
  await draftClick(renderer,check,waitFor,'[data-mark-status-filter="open"]','reply-draft-hide');
  await waitFor(renderer,`document.querySelector(${JSON.stringify(card)})?.hidden===true`,'reply-draft-hidden');
  await draftClick(renderer,check,waitFor,'[data-mark-status-filter="all"]','reply-draft-unfilter');
  await draftClick(renderer,check,waitFor,'[data-mark-filter-toggle]','reply-draft-filter-close');
  const kept=`document.querySelector(${JSON.stringify(input)})?.value==='公开合成会话回复'`;
  await waitFor(renderer,kept,'reply-draft-filter-kept');
  await draftClick(renderer,check,waitFor,'.manuscript-comments-heading [aria-label="关闭批注栏"]','reply-draft-pane-close');
  await draftClick(renderer,check,waitFor,`.editor-window [data-mark-id="${id}"]`,'reply-draft-floating');
  await waitFor(renderer,`document.querySelector('[data-mark-card="${id}"] [data-mark-form="reply"] textarea')?.value==='公开合成会话回复'`,'reply-draft-floating-kept');
  await draftKey(renderer,'Escape',27);
  await draftClick(renderer,check,waitFor,'[data-edge-entry="comments"]','reply-draft-pane-return');
  await waitFor(renderer,kept,'reply-draft-pane-kept');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('overview'),'reply-draft-overview');
  await waitFor(renderer,`!document.querySelector('.editor-shell')`,'reply-draft-left-screen');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('manuscript'),'reply-draft-screen-return');
  await waitFor(renderer,kept,'reply-draft-screen-kept');
  await draftTabTo(renderer,input);
  await draftClick(renderer,check,waitFor,input,'reply-draft-send-focus');
  await draftKey(renderer,'Enter',13); await draftKey(renderer,'Enter',13);
  await waitFor(renderer,`document.querySelector(${JSON.stringify(card+' [data-mark-region="replies"]')})?.textContent.includes('公开合成会话回复')&&!document.querySelector(${JSON.stringify(input)})?.value`,'reply-draft-sent');
  check(await renderer.evaluate(`(async()=>{const c=await window.ai7.getEditorialMarkCard({manuscriptId:__comments.manuscriptId,branchId:__comments.branchId,markId:${JSON.stringify(id)}});return c.replies.filter(reply=>reply.body==='公开合成会话回复').length===1;})()`),'reply-draft-sent-once');
  await draftTabTo(renderer,reply);
  await draftClick(renderer,check,waitFor,reply,'reply-draft-late-open');
  await renderer.send('Input.insertText',{text:'公开合成离页回复'});
  await draftKey(renderer,'Enter',13);
  await draftClick(renderer,check,waitFor,SIDEBAR.section('overview'),'reply-draft-leave-sending');
  await waitFor(renderer,`!document.querySelector('.editor-shell')`,'reply-draft-late-left');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('manuscript'),'reply-draft-late-return');
  await waitFor(renderer,`document.querySelector(${JSON.stringify(card+' [data-mark-region="replies"]')})?.textContent.includes('公开合成离页回复')&&!document.querySelector(${JSON.stringify(input)})?.value`,'reply-draft-late-cleared');
}

export async function markDraftKept(renderer,check,waitFor,at,blockId) {
  at('mark-draft-kept');
  const pane='.manuscript-comments-pane', row='[data-mark-draft-row="annotation"]', field='[data-mark-composer="create-annotation"] textarea';
  if(await renderer.evaluate(`document.querySelector('${pane}').hidden`)) await draftClick(renderer,check,waitFor,'[data-edge-entry="comments"]','draft-pane-open');
  await renderer.evaluate(`window.__j05.place(${JSON.stringify(blockId)},0,1)`);
  await draftClick(renderer,check,waitFor,'[data-comments-add="annotation"]','draft-add');
  await waitFor(renderer,`document.activeElement===document.querySelector('${field}')`,'draft-focus');
  await renderer.send('Input.insertText',{text:'公开合成未发送批注'});
  const before=await renderer.evaluate(`document.querySelector('.editor-window').scrollTop`);
  await draftKey(renderer,'Escape',27);
  const kept=`document.querySelector('${row}') && !document.querySelector('[data-mark-composer]') && !document.querySelector('${row}').contains(document.activeElement)`;
  await waitFor(renderer,kept,'draft-folded');
  await draftGeometry(renderer,row,async()=>{ check(await renderer.evaluate(`(() => {const row=document.querySelector('${row}'),block=document.querySelector('[data-block-id="${blockId}"]'),next=block.nextElementSibling;if(!next)return false;const a=row.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(next);const b=range.getClientRects()[0];return b&&a.bottom<=b.top&&document.querySelector('.editor-window').scrollTop===${before};})()`),'draft-fold-gap-scroll'); }, {waitFor,name:'draft-fold-gap-scroll'});
  await draftClick(renderer,check,waitFor,row,'draft-expand');
  check(await renderer.evaluate(`document.querySelector('${field}').value==='公开合成未发送批注' && document.activeElement===document.querySelector('${field}')`),'draft-expanded-words');
  // A real press on the paragraph folds the form, retaining the text without sending it.
  await draftClick(renderer,check,waitFor,`[data-testid="manuscript-editor"] [data-block-id="${blockId}"]`,'draft-text');
  await waitFor(renderer,kept,'draft-text-kept');
  await draftClick(renderer,check,waitFor,`[data-testid="manuscript-editor"] [data-block-id="${blockId}"]`,'draft-menu','right');
  await waitFor(renderer,`document.querySelector('[data-mark-menu]')`,'draft-menu-open');
  await draftKey(renderer,'Escape',27); await waitFor(renderer,kept,'draft-menu-kept');
  await draftClick(renderer,check,waitFor,'.manuscript-comments-heading [aria-label="关闭批注栏"]','draft-pane-close');
  await draftClick(renderer,check,waitFor,'[data-edge-entry="comments"]','draft-pane-return');
  await waitFor(renderer,kept,'draft-pane-kept');
  await draftClick(renderer,check,waitFor,'[data-edge-entry="tasks"]','draft-tasks');
  await waitFor(renderer,`document.querySelector('#task-drawer:not([hidden])')`,'draft-tasks-ready');
  await draftClick(renderer,check,waitFor,'.task-drawer-close','draft-tasks-close');
  await waitFor(renderer,kept,'draft-tasks-kept');
  await railJump(renderer,waitFor,check,1,'draft-page-away');
  await waitFor(renderer,`!document.querySelector('[data-testid="manuscript-editor"] [data-block-id="${blockId}"]')`,'draft-place-away');
  await railJump(renderer,waitFor,check,0,'draft-page-back');
  await waitFor(renderer,kept,'draft-page-kept');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('overview'),'draft-overview');
  await waitFor(renderer,`!document.querySelector('.editor-shell')`,'draft-overview-ready');
  await draftClick(renderer,check,waitFor,SIDEBAR.section('manuscript'),'draft-manuscript');
  await waitFor(renderer,kept,'draft-screen-kept');
  const manuscript=await renderer.evaluate(`(async()=> (await window.ai7.listPriorWork()).find(item=>item.bookId===document.querySelector('.editor-shell').dataset.bookId).manuscriptId)()`);
  await draftClick(renderer,check,waitFor,SIDEBAR.destination('library'),'draft-library');
  await waitFor(renderer,`document.querySelector('.recent-work-item button[data-manuscript-id="${manuscript}"]')`,'draft-library-ready');
  await draftClick(renderer,check,waitFor,`.recent-work-item button[data-manuscript-id="${manuscript}"]`,'draft-book-return');
  await waitFor(renderer,kept,'draft-book-kept');
  await draftClick(renderer,check,waitFor,row,'draft-final-expand');
  check(await renderer.evaluate(`document.querySelector('${field}').value==='公开合成未发送批注'`),'draft-final-words');
  await draftClick(renderer,check,waitFor,'[data-mark-composer] [data-mark-action="cancel"]','draft-discard');
  await waitFor(renderer,`!document.querySelector('${row}')&&!document.querySelector('[data-mark-composer]')`,'draft-discarded');
  await draftClick(renderer,check,waitFor,'.manuscript-comments-heading [aria-label="关闭批注栏"]','draft-pane-reset');
}
