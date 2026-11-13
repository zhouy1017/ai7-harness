import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';

// Execute the private production flush loop and composition handlers together. The view's delayed
// composing flag models ProseMirror's end-of-composition cleanup; no editor algorithm is duplicated.
const source = ts.createSourceFile('editor.ts', readFileSync(new URL('../../src/renderer/editor.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function declaration(name: string): string {
  let result: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) result = node;
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) result = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!result) throw new Error(`Missing editor seam: ${name}`);
  return result.getText(source);
}
const program = ts.transpileModule(`
  let destroyed=false, interrupted=false, composing=false, saving=false, retryRequired=false;
  let protection, retryPrepared, flushPromise, autoFlushTimer, compositionWaiters=[];
  const structures=Array.from({length:8},()=>({}));
  const block={blockId:'block',text:'公开合成原文',digest:'block-0'};
  let windowProjection={manuscriptId:'manuscript',branchId:'branch',revisionId:'revision',journalSequence:0,workingDigest:'working-0',blocks:[block]};
  const baselineMap=window=>new Map(window.blocks.map(block=>[block.blockId,{...block}]));
  let baselines=baselineMap(windowProjection);
  const changedBlocks=()=>structures.length?['block']:[];
  const nextPrepared=()=>({input:{clientEditId:'edit-'+windowProjection.journalSequence,manuscriptId:'manuscript',branchId:'branch',baseRevisionId:'revision',blockId:'block',windowStartBlockId:'block',structure:{kind:'merge'}}});
  const requireEditor=(value)=>{if(!value)throw new Error('invalid editor state');};
  const requireAcknowledgement=requireEditor;
  const captureRenderedContinuity=()=>({scrollAnchor:{blockId:'block'},head:{blockId:'block'}});
  const makeState=()=>({});
  const restoreContinuity=()=>{};
  const announceState=()=>{};
  const applyEditableState=()=>{};
  const settleProtection=()=>{};
  const checkBufferLimit=()=>{};
  const enterProtection=cause=>{protection={cause};};
  const classifyJournalFailure=()=> 'unavailable';
  const technicalWords=(_technical,ordinary)=>ordinary;
  let lastDurable;
  const window={setTimeout:(fn,delay)=>setTimeout(fn,delay),clearTimeout:id=>clearTimeout(id)};
  const scheduleAutomaticFlush=()=>{autoFlushTimer=window.setTimeout(()=>void flush(),700);};
  const ${declaration('waitForComposition')};
  const ${declaration('flush')};
  const handlers={${declaration('compositionstart')},${declaration('compositionend')}};
  return {flush,handlers,read:()=>({saving,journal:windowProjection.journalSequence,retryRequired})};
`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it.each([true,false])('adopts the eighth acknowledgement across the compositionend/view cleanup gap (end before ack=%s, #1459)', async endFirst => {
  vi.useFakeTimers();
  const eighth = Promise.withResolvers<void>();
  const view = { composing: false, dom: { dataset: {} }, state: { doc: {
    forEach: (visit: (node: object) => void) => visit({attrs:{blockId:'block'},textContent:'公开合成原文'}),
  } } };
  let durable = 0;
  let editor: { flush(): Promise<void>; handlers: { compositionstart(): void; compositionend(): void }; read(): { saving: boolean; journal: number; retryRequired: boolean } };
  const options = { onAnnouncement: vi.fn(), flushJournalEdit: async (input: {clientEditId:string}) => {
    const sequence=++durable;
    if(sequence===8){view.composing=true;editor.handlers.compositionstart();if(endFirst)editor.handlers.compositionend();eighth.resolve();}
    const digest=`block-${sequence}`,working=`working-${sequence}`;
    return {clientEditId:input.clientEditId,branchId:'branch',baseRevisionId:'revision',blockId:'block',sequence,
      resultingBlockDigest:digest,resultingWorkingDigest:working,durableAt:'2026-11-14T00:00:00Z',completionLabel:'已保存',
      window:{manuscriptId:'manuscript',branchId:'branch',revisionId:'revision',journalSequence:sequence,workingDigest:working,
        blocks:[{blockId:'block',text:'公开合成原文',digest}]}};
  } };
  editor = Function('view','options',program)(view,options) as typeof editor;
  const completion=editor.flush();
  await eighth.promise; await Promise.resolve(); await Promise.resolve();
  expect(durable).toBe(8); expect(editor.read()).toMatchObject({journal:7,saving:true});
  if(!endFirst){editor.handlers.compositionend();await Promise.resolve();expect(editor.read()).toMatchObject({journal:7,saving:true});}
  view.composing=false;
  await vi.advanceTimersByTimeAsync(20);
  expect(editor.read()).toEqual({journal:8,saving:false,retryRequired:false});
  await completion;
});
