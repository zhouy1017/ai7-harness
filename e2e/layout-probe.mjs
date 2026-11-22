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
