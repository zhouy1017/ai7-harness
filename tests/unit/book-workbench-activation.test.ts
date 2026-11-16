import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { IPC_CHANNELS, isNonActivatingBookOpen } from '../../src/shared/protocol.js';
import { decodeRequest } from '../../src/service/request-frames.js';

const source=ts.createSourceFile('application.ts',readFileSync(new URL('../../src/main/application.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declarations:string[]=[];let handler='';
function collect(node:ts.Node):void {
  if(ts.isVariableDeclaration(node)&&['assignRoute','applyBookWorkbench','requestBookWorkbench'].includes(node.name.getText(source)))declarations.push('const '+node.getText(source)+';');
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='ipcMain.handle'&&node.arguments[0]?.getText(source)==='IPC_CHANNELS.openBookWorkbench')handler=node.arguments[1]!.getText(source);
  ts.forEachChild(node,collect);
}
collect(source);
const compiled=ts.transpileModule(declarations.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2023}}).outputText;
const bookId='00000000-0000-4000-8000-000000000001';
const route={kind:'book',bookId,bookTitle:'公开合成图书'};
function owner(book:string|null=null){return {bookId:book,route:book===null?null:route,routeGeneration:1,routeRequestSequence:1,closeRisk:true,
  manuscriptCapabilities:new Map([['manuscript',{routeGeneration:1}]]),editorResourceCapabilities:new Map([['job',{routeGeneration:1}]]),
  window:{isDestroyed:()=>false,webContents:{send:vi.fn()}}};}
function main(){
 const bookWindows=new Map<string,ReturnType<typeof owner>>(),focus=vi.fn(),create=vi.fn();
 const call=vi.fn(async()=>route);
 const context=createContext({bookWindows,focusOwnedWindow:focus,createOwnedWindow:create,service:{call},MAIN_EVENTS:{bookWorkbenchRouteChanged:'route'},
  requireDesktop:(condition:boolean)=>{if(!condition)throw new Error('invalid');},ServiceCallError:Error,
  serializeRoute:(operation:()=>unknown)=>operation(),serializeEffect:(operation:()=>unknown)=>operation()});
 runInContext(compiled,context);
 return {bookWindows,focus,create,call,open:(requester:ReturnType<typeof owner>,nonActivating?:boolean)=>{context['requester']=requester;return runInContext(`requestBookWorkbench(requester,{kind:'book',bookId:${JSON.stringify(bookId)}},${String(nonActivating)})`,context) as Promise<{target:string}>;}};
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
