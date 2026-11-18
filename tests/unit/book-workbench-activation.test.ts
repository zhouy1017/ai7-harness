import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { IPC_CHANNELS, isNonActivatingBookOpen, type RendererApi } from '../../src/shared/protocol.js';
import { decodeRequest } from '../../src/service/request-frames.js';
import { NavigationGeneration, reconcileBookWorkbenchApi } from '../../src/renderer/navigation-generation.js';

const source=ts.createSourceFile('application.ts',readFileSync(new URL('../../src/main/application.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declarations:string[]=[];let handler='',closed='';const parkingLeaves:string[]=[];
function collect(node:ts.Node):void {
  if(ts.isVariableDeclaration(node)&&['assignRoute','applyBookWorkbench','requestBookWorkbench','parkedBookResources','unparkWindow','leaveBookWorkbench','requireCurrentBookRoute','resourceCapabilityKey','requireEditorResource'].includes(node.name.getText(source)))declarations.push('const '+node.getText(source)+';');
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='ipcMain.handle'&&node.arguments[0]?.getText(source)==='IPC_CHANNELS.openBookWorkbench')handler=node.arguments[1]!.getText(source);
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='window.on'&&node.arguments[0]?.getText(source)==="'closed'")closed=node.arguments[1]!.getText(source);
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='leaveBookWorkbench'&&node.arguments.length>1) {
    let channel:ts.Node|undefined=node;while(channel&&!(ts.isCallExpression(channel)&&channel.expression.getText(source)==='ipcMain.handle'))channel=channel.parent;
    parkingLeaves.push(channel&&ts.isCallExpression(channel)?channel.arguments[0]!.getText(source):'outside an IPC handler');
  }
  ts.forEachChild(node,collect);
}
collect(source);
const compiled=ts.transpileModule(declarations.join('\n')+'\nfunction closedFor(owned,webContentsId){return '+closed+';}',{compilerOptions:{target:ts.ScriptTarget.ES2023}}).outputText;
const bookId='00000000-0000-4000-8000-000000000001';
const route={kind:'book',bookId,bookTitle:'公开合成图书'};
function owner(book:string|null=null){return {bookId:book,route:book===null?null:{...route,bookId:book},routeGeneration:1,routeRequestSequence:1,closeRisk:true,
  manuscriptCapabilities:new Map([['manuscript',{routeGeneration:1}]]),editorResourceCapabilities:new Map([['job',{routeGeneration:1}]]),
  window:{isDestroyed:()=>false,webContents:{send:vi.fn()}}};}
function main(){
 const bookWindows=new Map<string,ReturnType<typeof owner>>(),focus=vi.fn(),create=vi.fn();
 const call=vi.fn(async(_operation:string,input:{bookId:string})=>({...route,bookId:input.bookId}));
 const context=createContext({bookWindows,ownedWindows:new Map(),releaseOwnedClaims:()=>undefined,focusOwnedWindow:focus,createOwnedWindow:create,service:{call},MAIN_EVENTS:{bookWorkbenchRouteChanged:'route'},
  requireDesktop:(condition:boolean)=>{if(!condition)throw new Error('invalid');},ServiceCallError:Error,
  serializeRoute:(operation:()=>unknown)=>operation(),serializeEffect:(operation:()=>unknown)=>operation()});
 runInContext(compiled,context);
 return {bookWindows,focus,create,call,context,
  open:(requester:ReturnType<typeof owner>,nonActivating?:boolean,book=bookId)=>{context['requester']=requester;return runInContext(`requestBookWorkbench(requester,{kind:'book',bookId:${JSON.stringify(book)}},${String(nonActivating)})`,context) as Promise<{target:string}>;},
  leave:(owned:ReturnType<typeof owner>,park?:boolean)=>{context['owned']=owned;runInContext(`leaveBookWorkbench(owned,${String(park)})`,context);},
  close:(owned:ReturnType<typeof owner>)=>{context['owned']=owned;runInContext('closedFor(owned,1)()',context);},
  parked:()=>runInContext('[...parkedBookResources.keys()]',context) as string[],
  requireJob:(owned:ReturnType<typeof owner>,jobId:string)=>{context['owned']=owned;context['jobId']=jobId;runInContext(`requireEditorResource(owned,'job',jobId)`,context);}};
}
it('non-activating open acquires a free Book only for the requesting window without focusing or revoking',async()=>{
 const app=main(),requester=owner();const manuscripts=[...requester.manuscriptCapabilities],resources=[...requester.editorResourceCapabilities];
 expect(await app.open(requester,true)).toMatchObject({target:'requesting-window'});
 expect(requester.bookId).toBe(bookId);expect(app.bookWindows.get(bookId)).toBe(requester);
 expect(requester.routeRequestSequence).toBe(1);expect(requester.routeGeneration).toBe(2);
 expect([...requester.manuscriptCapabilities]).toEqual(manuscripts);expect([...requester.editorResourceCapabilities]).toEqual(resources);
 expect(app.focus).not.toHaveBeenCalled();expect(app.create).not.toHaveBeenCalled();
});
it('non-activating open leaves the other window, capabilities, focus and requester unchanged when held elsewhere',async()=>{
 const app=main(),requester=owner(),other=owner(bookId);app.bookWindows.set(bookId,other);
 const manuscripts=[...other.manuscriptCapabilities],resources=[...other.editorResourceCapabilities];
 expect(await app.open(requester,true)).toMatchObject({target:'held-elsewhere'});
 expect(requester.bookId).toBeNull();expect(requester.routeRequestSequence).toBe(1);expect(other.routeGeneration).toBe(1);
 expect([...other.manuscriptCapabilities]).toEqual(manuscripts);expect([...other.editorResourceCapabilities]).toEqual(resources);
 expect(other.window.webContents.send).not.toHaveBeenCalled();expect(app.focus).not.toHaveBeenCalled();expect(app.create).not.toHaveBeenCalled();
});
it('ordinary open keeps the existing reassign and focus behavior',async()=>{
 const app=main(),requester=owner(),other=owner(bookId);other.closeRisk=false;app.bookWindows.set(bookId,other);
 expect(await app.open(requester)).toMatchObject({target:'existing-window'});
 expect(requester.routeRequestSequence).toBe(2);expect(other.routeGeneration).toBe(2);
 expect(other.manuscriptCapabilities.size).toBe(0);expect(other.editorResourceCapabilities.size).toBe(0);
 expect(app.focus).toHaveBeenCalledExactlyOnceWith(other);expect(other.window.webContents.send).toHaveBeenCalledOnce();
 expect(app.call).toHaveBeenCalledWith('resolveBookWorkbenchRoute',{kind:'book',bookId});
});

it('non-activating open refuses Book B when the requester already holds Book A without changing either binding',async()=>{
 const app=main(),first='00000000-0000-4000-8000-000000000002',requester=owner(first);
 requester.route={...route,bookId:first};app.bookWindows.set(first,requester);
 const before={route:requester.route,generation:requester.routeGeneration,sequence:requester.routeRequestSequence,
  manuscripts:[...requester.manuscriptCapabilities],resources:[...requester.editorResourceCapabilities]};
 expect(await app.open(requester,true)).toMatchObject({target:'held-elsewhere'});
 expect(requester.bookId).toBe(first);expect(requester.route).toBe(before.route);
 expect(requester.routeGeneration).toBe(before.generation);expect(requester.routeRequestSequence).toBe(before.sequence);
 expect([...requester.manuscriptCapabilities]).toEqual(before.manuscripts);expect([...requester.editorResourceCapabilities]).toEqual(before.resources);
 expect([...app.bookWindows]).toEqual([[first,requester]]);expect(requester.window.webContents.send).not.toHaveBeenCalled();
 expect(app.focus).not.toHaveBeenCalled();expect(app.create).not.toHaveBeenCalled();
});

// #1504: a renderer leave parks the window's own job/search/preview grants; only its next non-activating re-acquire of
// that Book, with no route of its own and no other holder in between, takes them back.
const bookB='00000000-0000-4000-8000-000000000002';
function holding(app:ReturnType<typeof main>,book=bookId){
 const window=owner(book);window.closeRisk=false;app.bookWindows.set(book,window);window.editorResourceCapabilities=new Map([
  ['job:job-1',{kind:'job',operation:'search',bookId:book,manuscriptId:'m',branchId:'b',routeGeneration:1}],
  ['search:search-1',{kind:'search',operation:'search',bookId:book,manuscriptId:'m',branchId:'b',routeGeneration:1}],
  ['preview:preview-1',{kind:'preview',operation:'replacement',bookId:book,manuscriptId:'m',branchId:'b',routeGeneration:1}]]) as never;
 return window;
}
const grants=(window:ReturnType<typeof owner>)=>[...window.editorResourceCapabilities].map(([key,value])=>[key,(value as {routeGeneration:number}).routeGeneration]);
it('(a) a renderer leave followed by a non-activating re-acquire of the same Book restores the window\'s own grants, once',async()=>{
 const app=main(),window=holding(app);
 app.leave(window,true);expect(window.editorResourceCapabilities.size).toBe(0);expect(window.manuscriptCapabilities.size).toBe(0);
 expect(await app.open(window,true)).toMatchObject({target:'requesting-window'});
 expect(grants(window)).toEqual([['job:job-1',3],['search:search-1',3],['preview:preview-1',3]]);
 expect(window.manuscriptCapabilities.size).toBe(0);expect(app.parked()).toEqual([]);
});
it('(b) another window acquiring and releasing the Book in between restores nothing',async()=>{
 const app=main(),window=holding(app),other=owner();
 app.leave(window,true);expect(await app.open(other,true)).toMatchObject({target:'requesting-window'});
 expect(app.parked()).toEqual([]);app.leave(other,true);
 expect(await app.open(window,true)).toMatchObject({target:'requesting-window'});expect(window.editorResourceCapabilities.size).toBe(0);
});
it('(b2) another window holding the Book through an explicit open in between restores nothing',async()=>{
 const app=main(),window=holding(app),other=owner();other.closeRisk=false;
 app.leave(window,true);expect(await app.open(other,false)).toMatchObject({target:'requesting-window'});
 expect(app.bookWindows.get(bookId)).toBe(other);app.leave(other,true);
 expect(await app.open(window,true)).toMatchObject({target:'requesting-window'});expect(window.editorResourceCapabilities.size).toBe(0);
});
it('(b3) a Bookless second window whose route generation equals the parked one receives nothing and ends the entry',async()=>{
 const app=main(),window=holding(app),other=owner();
 app.leave(window,true);other.routeGeneration=window.routeGeneration;other.editorResourceCapabilities=new Map() as never;
 expect(await app.open(other,true)).toMatchObject({target:'requesting-window'});
 expect(other.editorResourceCapabilities.size).toBe(0);expect(app.parked()).toEqual([]);
});
it('(c) an explicit open of another Book in between restores nothing for either Book',async()=>{
 const app=main(),window=holding(app);
 app.leave(window,true);expect(await app.open(window,false,bookB)).toMatchObject({target:'requesting-window'});
 app.leave(window,true);expect(await app.open(window,true)).toMatchObject({target:'requesting-window'});
 expect(window.editorResourceCapabilities.size).toBe(0);expect(app.parked()).toEqual([]);
});
it('(d) closing the owner window discards what it parked',()=>{
 const app=main(),window=holding(app);app.leave(window,true);expect(app.parked()).toEqual([bookId]);
 app.close(window);expect(app.parked()).toEqual([]);
});
it('(e) leave, restore, leave, restore carries exactly what the window held at the second leave',async()=>{
 const app=main(),window=holding(app);
 app.leave(window,true);await app.open(window,true);
 window.editorResourceCapabilities.delete('search:search-1');
 window.editorResourceCapabilities.set('job:job-2',{kind:'job',operation:'replacement',bookId,manuscriptId:'m',branchId:'b',routeGeneration:3} as never);
 app.leave(window,true);await app.open(window,true);
 expect(grants(window)).toEqual([['job:job-1',5],['preview:preview-1',5],['job:job-2',5]]);expect(app.parked()).toEqual([]);
});
it('(f) a leave main decides parks nothing and discards what was parked; only the renderer leave parks',async()=>{
 const app=main(),window=holding(app);
 app.leave(window);expect(app.parked()).toEqual([]);
 await app.open(window,true);expect(window.editorResourceCapabilities.size).toBe(0);
 const again=holding(app,bookB);app.leave(again,true);app.leave(again);expect(app.parked()).toEqual([]);
 await app.open(again,true,bookB);expect(again.editorResourceCapabilities.size).toBe(0);
 expect(parkingLeaves).toEqual(['IPC_CHANNELS.leaveBookWorkbench']);
});

it('through the real ownership boundary, a superseded leave re-acquires the Book and the page\'s job poll still reaches main',async()=>{
 const app=main(),window=holding(app),shown=new NavigationGeneration();shown.commit('editor',bookId);
 const raw={
  leaveBookWorkbench:async()=>{app.leave(window,true);return {state:'library'};},
  openBookWorkbench:(input:{bookId:string;activation?:string})=>app.open(window,input.activation==='non-activating',input.bookId),
  pollServiceJob:async(input:{jobId:string})=>{app.requireJob(window,input.jobId);return {jobId:input.jobId};},
 };
 const failed=vi.fn(),api=reconcileBookWorkbenchApi(raw as unknown as RendererApi,{bookOnScreen:()=>shown.bookId,left:vi.fn(),failed},shown);
 const leaving=api.leaveBookWorkbench();shown.begin();await leaving;
 expect(app.bookWindows.get(bookId)).toBe(window);expect(failed).not.toHaveBeenCalled();
 await expect(api.pollServiceJob({jobId:'job-1'})).resolves.toEqual({jobId:'job-1'});
});

const preload=ts.createSourceFile('preload.ts',readFileSync(new URL('../../src/main/preload.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
let bridge='';
function findBridge(node:ts.Node):void {if(ts.isPropertyAssignment(node)&&node.name.getText(preload)==='openBookWorkbench')bridge=node.initializer.getText(preload);ts.forEachChild(node,findBridge);}
findBridge(preload);
function evaluate(expression:string,bindings:object){return runInContext(ts.transpileModule('('+expression+')',{compilerOptions:{target:ts.ScriptTarget.ES2023}}).outputText,createContext(bindings)) as (...args:unknown[])=>Promise<unknown>;}
it.each(['preload','main'])('the %s validates the activation field and preserves the ordinary input',async surface=>{
 const input={kind:'book',bookId},nonActivating={...input,activation:'non-activating'};
 const invoke=vi.fn(async()=>({target:'requesting-window'}));
 const open=surface==='preload'?evaluate(bridge,{isNonActivatingBookOpen,IPC_CHANNELS,invoke}):evaluate(handler,{isNonActivatingBookOpen,requireSender:()=>({}),requireAuthority:()=>undefined,envelope:(work:()=>unknown)=>work(),requestBookWorkbench:invoke});
 const call=(value:unknown)=>surface==='preload'?open(value):open({},value);
 await call(input);expect(invoke.mock.calls[0]?.at(-1)).toBe(input);
 invoke.mockClear();await call(nonActivating);expect(invoke).toHaveBeenCalledOnce();
 for(const invalid of [null,false,'background',undefined]){await expect(Promise.resolve().then(()=>call({...input,activation:invalid}))).rejects.toThrow('AI7_RENDERER_BOUNDARY_INVALID');}
 await expect(Promise.resolve().then(()=>call({...nonActivating,extra:true}))).rejects.toThrow();
 await expect(Promise.resolve().then(()=>call({kind:'revision',revisionId:bookId,activation:'non-activating'}))).rejects.toThrow();
});
it('the activation option remains forbidden on the closed service-wire route shape',()=>{
 const frame=(input:object)=>Buffer.from(JSON.stringify({id:bookId,op:'resolveBookWorkbenchRoute',input}));
 expect(decodeRequest(frame({kind:'book',bookId}))).toMatchObject({op:'resolveBookWorkbenchRoute'});
 expect(()=>decodeRequest(frame({kind:'book',bookId,activation:'non-activating'}))).toThrow();
});
