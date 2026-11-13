import { afterEach, expect, it, vi } from 'vitest';
import { installMiniDom } from '../support/mini-dom.js';

type Renderer = {evaluate(expression:string):Promise<unknown>;send(method:string):Promise<void>};
type WaitFor = (renderer:Renderer,expression:string,name:string,timeout?:number)=>Promise<void>;
const {commentsSelectMark} = await import(new URL('../../e2e/comments-pane.mjs',import.meta.url).href) as {
  commentsSelectMark(renderer:Renderer,check:(passed:unknown,name:string)=>void,waitFor:WaitFor,id:string):Promise<unknown>;
};
let restore: (()=>void)|undefined;
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();restore?.();});

it('reveals the words before trying real input on a card outside the listed text buffer (#1459)', async()=>{
  restore=installMiniDom();
  vi.stubGlobal('__commentsPoint',null);vi.stubGlobal('__commentsPointPrevious',null);vi.stubGlobal('__commentsClickTrace',null);
  const box=(top:number,bottom:number)=>({top,bottom,left:100,right:420,width:320,height:bottom-top}) as DOMRect;
  const text=document.createElement('section');text.className='editor-window';
  const words=document.createElement('span');words.dataset['markId']='target';text.append(words);
  const pane=document.createElement('section');pane.className='manuscript-comments-scroll';
  const canvas=document.createElement('div');canvas.className='manuscript-comments-canvas';canvas.dataset['loading']='false';pane.append(canvas);
  const card=document.createElement('article');card.dataset['commentCard']='target';card.hidden=true;canvas.append(card);
  const body=document.createElement('div');body.dataset['markCard']='target';card.append(body);
  document.body.append(text,pane);
  let wordsTop=900;
  Object.assign(text,{getBoundingClientRect:()=>box(40,540)});
  Object.assign(words,{getBoundingClientRect:()=>box(wordsTop,wordsTop+20),getClientRects:()=>[box(wordsTop,wordsTop+20)],
    scrollIntoView:()=>{wordsTop=120;card.hidden=false;}});
  Object.assign(pane,{getBoundingClientRect:()=>box(80,520)});
  Object.assign(card,{getBoundingClientRect:()=>card.hidden?box(0,0):box(120,180),scrollIntoView:()=>{}});
  Object.assign(document,{elementFromPoint:()=>card.hidden?null:card});
  let now=0;vi.spyOn(Date,'now').mockImplementation(()=>now);const budgets:number[]=[];
  const send=vi.fn(async()=>{throw new Error('READY_FOR_REAL_INPUT');});
  const renderer:Renderer={evaluate:async expression=>await Function(`return (${expression})`)(),send};
  const waitFor:WaitFor=async(reader,expression,name,timeout)=>{
    budgets.push(timeout??60_000);
    for(let tick=0;tick<4;tick++)if(await reader.evaluate(expression)){now+=1_000;return;}
    throw new Error(`DEPENDENCY_UNMET/${name}`);
  };
  const check=(passed:unknown,name:string)=>{if(!passed)throw new Error(name);};
  await expect(commentsSelectMark(renderer,check,waitFor,'target')).rejects.toThrow('READY_FOR_REAL_INPUT');
  expect(wordsTop).toBeGreaterThanOrEqual(40);expect(wordsTop+20).toBeLessThanOrEqual(540);expect(card.hidden).toBe(false);expect(send).toHaveBeenCalledOnce();
  expect(budgets[0]).toBe(60_000);expect(budgets.at(-1)).toBeLessThanOrEqual(59_000);
});
