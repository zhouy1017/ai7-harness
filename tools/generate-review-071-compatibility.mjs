// Rebuild the Public-SampleBook-only 0.7.1 compatibility package; no network or enrolled credential.
if (process.env.AI7_REGENERATE_REVIEW_071_FIXTURE !== '1') throw new Error('Set AI7_REGENERATE_REVIEW_071_FIXTURE=1 to replace the compatibility fixture.');
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {relative,resolve} from 'node:path';
const root=process.cwd(),base='1654f386342374e9b67b5fe51390dc8f0cb2c0e7';
const contents=`
import {randomUUID} from 'node:crypto';
import{join}from'node:path';
import{mkdir,unlink}from'node:fs/promises';
import{EditorialStore}from'./src/service/store.js';
import{ModelRequestGovernor}from'./src/service/analysis/execution.js';
import{ReviewRunDriver}from'./src/service/review/review-run-driver.js';
import{capturedOrdinaryExecution}from'./tests/support/captured-ordinary-transport.js';
import{parseReviewCategoryUnitMessageHeader}from'./src/service/review/review-category-contract.js';
import{reviewCategoryKindDefinition}from'./src/service/review/review-category-kind.js';
import{parseAssuranceSamplingListedRefs}from'./src/service/analysis/assurance-sampling-contract.js';
import{loadModelFixture,resolveFixtureEntry}from'./src/service/provider/model-fixture.js';
import{createServiceTestRoots}from'./tests/support/temp-data-root.js';
import{importSample1Book,pinEditorialWorkspaceProfileRevision2,recordMissingCredentialConnection}from'./tests/support/sample1-baseline.js';
import{TYPOS_AND_USAGE}from'./tests/support/review-categories.js';
const roots=await createServiceTestRoots('ai7-071-compatibility-'),gov=new ModelRequestGovernor();
const store=await EditorialStore.open(roots.dataRoot,roots.codeRoot);
const fixture=await loadModelFixture(join(roots.codeRoot,'tests/fixtures/model'),'sample1-review-contract-v2-controls'),definition=reviewCategoryKindDefinition(TYPOS_AND_USAGE);
let hold=false,reached,release;const held=new Promise(r=>reached=r),gate=new Promise(r=>release=r);
const capture=capturedOrdinaryExecution(store,roots.codeRoot,roots.dataRoot,gov,(request,message)=>{
const h=parseReviewCategoryUnitMessageHeader(message);
if(request.stage==='units'&&h)return resolveFixtureEntry(fixture.entries,h.ordinal,definition.requestDigest(h.ordinal,h.unitDigest),request.attemptIndex)?.response;
const content=request.stage==='assurance-sampling'?{schema:'ai7.analysis.assurance-sampling-result/1',dispositions:parseAssuranceSamplingListedRefs(message).map(ref=>({ref,disposition:'成立',reason:'SampleBook compatibility evidence.'}))}:request.stage==='run-report-reflection'?{schema:'ai7.analysis.run-report-reflection-result/1',items:[]}:null;
return content===null?undefined:{kind:'unit-result',text:JSON.stringify(content),usage:{inputTokens:10,outputTokens:5}};
},{unitHold:async n=>{if(hold&&n>0){hold=false;reached();await gate;}}});
const driver=new ReviewRunDriver(store.reviewRunDriveSteps,capture.owner),scope={kind:'whole',fromChapterBlockId:null,toChapterBlockId:null};
try{
for(const paused of [false,true]){
 const book=await importSample1Book(store,roots.codeRoot,paused?'sample1 · 0.7.1 暂停审阅':'sample1 · 0.7.1 已归档审阅');await pinEditorialWorkspaceProfileRevision2(store,book.bookId);if(!paused)recordMissingCredentialConnection(store,'0.7.1 provider-free compatibility');
 hold=paused;const run=store.launchReviewRun({bookId:book.bookId,clientCommandId:randomUUID(),categoryIds:['typos-and-usage'],scope},capture.policy).projection.run;
 const driving=driver.drive(run.reviewRunId);
 if(paused){await held;const c=store.requestTaskRunControl({bookId:book.bookId,kind:'review-run',ref:run.reviewRunId,action:'pause'});capture.owner.pauseRun(c.runRecordId,c.ledger);release();}
 await driving;
 if(!paused)store.generateReviewReport(book.bookId,run.reviewRunId);
 const current=store.inspectReviewWorkspace(book.bookId,run.reviewRunId).run;
 console.log(JSON.stringify({paused,state:current.state,canContinue:current.canContinue,categories:current.categories.length,reportDigest:current.report?.digest}));
}
console.log(JSON.stringify(store.inspectDataVersion()));
await mkdir(join(roots.codeRoot,'tests/fixtures/database'),{recursive:true});
const output=join(roots.codeRoot,'tests/fixtures/database/sample1-review-071.ai7db');await unlink(output).catch(error=>{if(error.code!=='ENOENT')throw error;});const prep=await store.prepareDatabaseExport(output,true);console.log((await store.approveDatabaseExport(prep.preparationId,true)).outcome);capture.assertMatched();store.markCleanShutdown();
}finally{release();await driver.dispose();await capture.owner.dispose();store.close();gov.close();await gov.whenIdle();await roots.dispose();}
`;
await build({stdin:{contents,resolveDir:root,sourcefile:'1433-generate-071.ts'},outfile:'node_modules/.cache/1433-generate-071.mjs',bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent',plugins:[{name:'exact-071-source',setup(b){b.onLoad({filter:/\.ts$/},args=>{const path=relative(root,args.path).replaceAll('\\','/');if(!path.startsWith('src/'))return;return{contents:execFileSync('git',['show',base+':'+path],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),loader:'ts'};});}}]});
await import('../node_modules/.cache/1433-generate-071.mjs');
