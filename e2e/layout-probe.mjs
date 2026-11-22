import { pointerElementDescription } from './dispatch-chooser.mjs';

// Temporary 1681 diagnostic: only geometry, bounded element descriptions and focus flags; no page text or attribute values.
export async function layoutProbe(renderer, selector, words) {
  return renderer.evaluate(`(async () => {
    const describe=(${pointerElementDescription.toString()}), bounds=node=>{if(!node)return null;const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
    const find=()=>${words === undefined ? `document.querySelector(${JSON.stringify(selector)})` : `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(node=>node.textContent.trim()===${JSON.stringify(words)})`};
    const frames=[];
    for(let i=0;i<3;i++) { await new Promise(resolve=>requestAnimationFrame(resolve)); const node=find(), r=node?.getBoundingClientRect(), hit=r?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2):null;
      const ancestors=[]; for(let p=node?.parentElement;p&&ancestors.length<12;p=p.parentElement) {const style=getComputedStyle(p);ancestors.push({node:describe(p),rect:bounds(p),client:[p.clientWidth,p.clientHeight],scroll:[p.scrollLeft,p.scrollTop,p.scrollWidth,p.scrollHeight],overflow:[style.overflowX,style.overflowY],position:style.position,open:p instanceof HTMLDetailsElement?p.open:null,popover:p.hasAttribute('popover')?p.matches(':popover-open'):null});}
      frames.push({node:describe(node),rect:bounds(node),hit:describe(hit),contains:!!node&&node.contains(hit),focused:document.activeElement===node,ancestors});
    }
    return {viewport:[innerWidth,innerHeight],visible:document.visibilityState==='visible',focused:document.hasFocus(),active:describe(document.activeElement),frames};
  })()`).catch(()=>({unavailable:true}));
}


export async function startPlanTrace(renderer) {
  await renderer.evaluate(`(() => {
    if(globalThis.__planTrace1681)return;
    const entries=[],ids=new WeakMap();let nextId=0,seq=0,context=null,contextTimer;
    const id=node=>{if(!node)return null;if(!ids.has(node))ids.set(node,++nextId);return ids.get(node);};
    const owner=node=>{if(!(node instanceof Element))return 'none';if(node.closest('.task-launch-estimate > summary'))return 'plan-summary';if(node.closest('.task-launch-popover'))return 'plan-panel';if(node.closest('dialog.review-sheet'))return 'review-sheet';return 'other';};
    const snap=(phase,extra={})=>{const details=document.querySelector('dialog.review-sheet .task-launch-estimate'),panel=details?.querySelector('.task-launch-popover'),r=panel?.getBoundingClientRect();entries.push({seq:++seq,phase,details:id(details),open:details?.open??null,panelOpen:panel?.matches(':popover-open')??null,rect:r?[r.x,r.y,r.width,r.height]:null,focus:owner(document.activeElement),focused:document.hasFocus(),visible:document.visibilityState==='visible',viewport:[innerWidth,innerHeight],...extra});if(entries.length>256)entries.shift();};
    const listeners=[];
    for(const type of ['pointerdown','pointerup','click','keydown','keyup','focusin','focusout','toggle','beforetoggle']) {
      const listener=event=>{const target=event.target,plan=target instanceof Element&&(target.matches('.task-launch-estimate,.task-launch-popover')||target.closest('.task-launch-estimate'));
        if(['pointerdown','pointerup','click','keydown','keyup'].includes(type)){context={source:type.startsWith('key')?'key':'pointer',event:type,trusted:event.isTrusted};clearTimeout(contextTimer);contextTimer=setTimeout(()=>{context=null;},0);}
        if(plan||(['focusin','focusout'].includes(type)&&document.querySelector('dialog.review-sheet .task-launch-estimate')))snap(type,{trusted:event.isTrusted,target:owner(target),from:owner(event.relatedTarget),cause:context?.source??'script',sourceEvent:context?.event??null,oldState:['open','closed'].includes(event.oldState)?event.oldState:null,newState:['open','closed'].includes(event.newState)?event.newState:null});};
      document.addEventListener(type,listener,true);listeners.push([type,listener]);
    }
    const proto=HTMLDetailsElement.prototype,original=Object.getOwnPropertyDescriptor(proto,'open');
    Object.defineProperty(proto,'open',{...original,set(value){if(this.matches('.task-launch-estimate'))snap('script-open-set-before',{setting:!!value,cause:context?.source??'script',sourceEvent:context?.event??null,trusted:context?.trusted??false});original.set.call(this,value);if(this.matches('.task-launch-estimate'))snap('script-open-set-after',{setting:!!value,cause:context?.source??'script',sourceEvent:context?.event??null,trusted:context?.trusted??false});}});
    const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'&&record.target.matches('.task-launch-estimate'))snap('open-attribute',{cause:context?.source??'script',sourceEvent:context?.event??null});}});
    observer.observe(document,{subtree:true,attributes:true,attributeFilter:['open']});
    globalThis.__planTrace1681={entries,snap,stop(){observer.disconnect();for(const [type,listener]of listeners)document.removeEventListener(type,listener,true);Object.defineProperty(proto,'open',original);clearTimeout(contextTimer);}};
    snap('trace-start');
  })()`);
}

export async function markPlanTrace(renderer, phase) {
  await renderer.evaluate(`globalThis.__planTrace1681?.snap(${JSON.stringify(phase)})`);
}
