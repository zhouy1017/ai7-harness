import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { IPC_CHANNELS, type RendererApi } from '../../src/shared/protocol.js';
import { NavigationGeneration, reconcileBookWorkbenchApi } from '../../src/renderer/navigation-generation.js';

const guards = new Set(['requireCurrentBookRoute', 'requireManuscriptCapability', 'requireEditorResource']);
// Route acquisition/inspection has no require-Book guard, but must cross the same barrier.
const routeOperations = ['getBookOverview','getBookWorkbenchRoute','getHistoricalRevision','openBookWorkbench'] as const;
const channelNames = new Map<string,string>(Object.entries(IPC_CHANNELS).map(([name, channel]) => [channel, name]));
function deriveOperations(sources:readonly ts.SourceFile[],checker:ts.TypeChecker):Set<keyof RendererApi> {
  const symbolOf=(node:ts.Node):ts.Symbol|undefined=>{const symbol=checker.getSymbolAtLocation(node);return symbol&&(symbol.flags&ts.SymbolFlags.Alias)?checker.getAliasedSymbol(symbol):symbol;};
  const bodies=(node:ts.Node):ts.Node[] => (symbolOf(node)?.declarations??[]).flatMap(declaration=>{
    const body=ts.isFunctionDeclaration(declaration)||ts.isMethodDeclaration(declaration)?declaration.body
      :ts.isVariableDeclaration(declaration)||ts.isPropertyAssignment(declaration)?declaration.initializer:undefined;
    return body?[body]:[];
  });
  const ownedRoute=(node:ts.Node):boolean=>ts.isPropertyAccessExpression(node)&&node.name.text==='route'&&
    ((ts.isIdentifier(node.expression)&&node.expression.text==='owned')||checker.getTypeAtLocation(node.expression).getSymbol()?.name==='OwnedRendererWindow');
  function guarded(node:ts.Node,analysis:{direct:boolean},seen=new Set<ts.Node>()):boolean {
    if(ownedRoute(node))analysis.direct=true;
    if(ts.isCallExpression(node)) {
      const name=ts.isIdentifier(node.expression)?node.expression.text:ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:'';
      if(guards.has(name)) {
        if(!ts.isIdentifier(node.expression))throw new Error('Unsupported property-access ownership helper');
        return true;
      }
      for(const argument of node.arguments)if((ts.isIdentifier(argument)||ts.isPropertyAccessExpression(argument))&&checker.getTypeAtLocation(argument).getCallSignatures().length>0) {
        const passed={direct:false};
        if(guards.has(symbolOf(argument)?.name??'')||bodies(argument).some(body=>{if(seen.has(body))return false;const next=new Set(seen);next.add(body);return guarded(body,passed,next);})||passed.direct) {
          // The existing serialized effect queue invokes this callback unchanged.
          if(ts.isIdentifier(node.expression)&&node.expression.text==='serializeEffect')return true;
          throw new Error('Unsupported guarded function passed as an argument');
        }
      }
      for(const body of bodies(node.expression)) {
        if(seen.has(body))continue;seen.add(body);
        const local={direct:false};const found=guarded(body,local,seen);analysis.direct ||= local.direct;
        if(ts.isPropertyAccessExpression(node.expression)&&(found||local.direct))throw new Error('Unsupported property-access ownership helper');
        if(found)return true;
      }
    }
    return ts.forEachChild(node,child=>guarded(child,analysis,seen))===true;
  }
  // These existing house-wide reads/updates explicitly permit a Bookless window. Pin that
  // null-permitting check rather than silently allowing any future direct check.
  function optionalBookRoute(node:ts.Node):boolean {
    const permitsNull=(condition:ts.Node):boolean=>{
      if(!ts.isBinaryExpression(condition))return false;
      if(condition.operatorToken.kind===ts.SyntaxKind.BarBarToken)return permitsNull(condition.left)||permitsNull(condition.right);
      return condition.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken&&condition.right.kind===ts.SyntaxKind.NullKeyword&&
        (symbolOf(condition.left)?.declarations??[]).some(d=>ts.isVariableDeclaration(d)&&d.initializer!==undefined&&ownedRoute(d.initializer));
    };
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='requireDesktop'&&node.arguments[0]&&permitsNull(node.arguments[0]))return true;
    return ts.forEachChild(node,optionalBookRoute)===true;
  }
  const operations=new Set<keyof RendererApi>();
  for(const source of sources) {
    const visit=(node:ts.Node):void=>{
      if(ts.isCallExpression(node)&&node.expression.getText(source)==='ipcMain.handle') {
        const [channel,handler]=node.arguments;
        if(!handler||(!ts.isArrowFunction(handler)&&!ts.isFunctionExpression(handler)))throw new Error('Unsupported handler passed by reference');
        const analysis={direct:false};const required=guarded(handler,analysis);
        if(required||analysis.direct) {
          if(!channel)throw new Error('Book handler has no channel');
          const type=checker.getTypeAtLocation(channel);
          for(const candidate of type.isUnion()?type.types:[type]) {
            const name=candidate.isStringLiteral()?channelNames.get(candidate.value):undefined;
            if(name===undefined)throw new Error(`Book handler has an unbounded channel: ${channel.getText(source)}`);
            if(!required&&!routeOperations.some(operation=>operation===name)&&!(['updateBookPeople','inspectBookSeries','inspectSeriesHistory'].includes(name)&&optionalBookRoute(handler)))throw new Error(`Unsupported direct ownership check: ${name}`);
            if(required)operations.add(name as keyof RendererApi);
          }
        }
      }
      ts.forEachChild(node,visit);
    };visit(source);
  }
  return operations;
}
const main=new URL('../../src/main/',import.meta.url);
const files=readdirSync(main,{recursive:true,encoding:'utf8'}).filter(name=>name.endsWith('.ts')).map(name=>fileURLToPath(new URL(name,main)));
const program=ts.createProgram(files,{target:ts.ScriptTarget.ES2023,skipLibCheck:true});
const operations=new Set<keyof RendererApi>([...routeOperations,...deriveOperations(files.map(file=>program.getSourceFile(file)!),program.getTypeChecker())]);

it('gates every derived Book operation and the four explicit route operations',async()=>{
  expect(operations.size).toBeGreaterThan(routeOperations.length);
  const answer=Promise.withResolvers<void>();
  const calls=new Map([...operations].map(name=>[name,vi.fn(async()=>undefined)]));
  const raw={...Object.fromEntries(calls),leaveBookWorkbench:()=>answer.promise};
  const api=reconcileBookWorkbenchApi(raw as unknown as RendererApi,{bookOnScreen:()=>null,left:vi.fn(),failed:vi.fn()},new NavigationGeneration());
  const leave=api.leaveBookWorkbench();
  const waiting=[...operations].map(name=>(api[name] as (input:unknown)=>Promise<unknown>)({}));
  const bypassed=[...calls].filter(([,call])=>call.mock.calls.length>0).map(([name])=>name);
  answer.resolve();await Promise.all([leave,...waiting]);
  expect(bypassed,'main Book operations bypassing the ownership gate').toEqual([]);
  for(const [name,call]of calls)expect(call,`${name} stays blocked after reconciliation`).toHaveBeenCalledOnce();
});

function probe(body:string):void {
  const path=fileURLToPath(new URL('../../.cache/ownership-registration-probe.ts',import.meta.url));
  const text=`declare const ipcMain:any;declare function requireCurrentBookRoute(value:any):void;declare function requireSender(value:any):any;
    const IPC_CHANNELS={listBooks:${JSON.stringify(IPC_CHANNELS.listBooks)}} as const;${body}`;
  const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
  const options={noResolve:true,noLib:true,types:[]};const host=ts.createCompilerHost(options);host.getSourceFile=()=>source;
  const test=ts.createProgram([path],options,host);deriveOperations([source],test.getTypeChecker());
}
it.each([
  ['handler passed by reference',`function handle(event:any){requireCurrentBookRoute(event)};ipcMain.handle(IPC_CHANNELS.listBooks,handle);`],
  ['property-access ownership helper',`const checks={book(event:any){requireCurrentBookRoute(event)}};ipcMain.handle(IPC_CHANNELS.listBooks,(event:any)=>checks.book(event));`],
  ['guarded function passed as an argument',`function book(event:any){requireCurrentBookRoute(event)}function run(fn:any,event:any){return fn(event)};ipcMain.handle(IPC_CHANNELS.listBooks,(event:any)=>run(book,event));`],
  ['direct ownership check',`ipcMain.handle(IPC_CHANNELS.listBooks,(event:any)=>{const owned=requireSender(event);if(owned.route?.kind!=='book')throw new Error('unavailable');});`],
])('rejects an unaccounted %s rather than silently dropping its gate obligation',(form,body)=>{
  expect(()=>probe(body)).toThrow(new RegExp(form));
});
