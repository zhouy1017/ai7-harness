/** Owner-authorized manual Windows Beta acceptance on a background guest; never a CI layer. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import { serveGuestEnrollment, storeEnrollment } from './enroll-dev-credential.mjs';
import { chromium } from 'playwright-core';
import { selfCheckEnvironment } from '../tools/package.mjs';
import { composeAdmittedDocx, composeExportAdmittedDocx, addReadOnlySourceObjects, readExportedDocx } from '../e2e/composed-docx.mjs';
import { wordTablePresentation } from './beta-docx-fidelity.mjs';
import { inspectDeliveryArchive } from './beta-archive-fidelity.mjs';
import { build } from 'esbuild';
import { unzipSync, strFromU8 } from 'fflate';

const ROOT=resolve('.');
const args=process.argv.slice(2),SEARCH_ONLY=args.includes('--search-only'),STARTUP_ONLY=args.includes('--startup-only'),RETAINED_REVIEW_ONLY=args.includes('--retained-review-only'),RESUME_LAST=args.includes('--resume-last')||RETAINED_REVIEW_ONLY;
let resume;
const assetsIndex=args.indexOf('--assets-from');
const RELEASE=assetsIndex<0?join(ROOT,'release'):resolve(args[assetsIndex+1]??'');
const OUTPUT=join(ROOT,'release');await mkdir(OUTPUT,{recursive:true});
if(assetsIndex>=0&&!RELEASE.toLowerCase().startsWith('c:\\ai7\\beta-inputs\\'))throw Error('assets-root-refused');
const packagedKeyring=()=>import(pathToFileURL(join(RELEASE,'AI7','app','resources','app','node_modules','@napi-rs','keyring','index.js')).href);
let stage='inputs';
const report={schema:'ai7.windows-beta-acceptance/1',scope:SEARCH_ONLY?'provider-free-packaged-search-return':STARTUP_ONLY?'native-startup-probe':RETAINED_REVIEW_ONLY?'retained-review-disclosure-probe':'six-flow-packaged-acceptance',state:'running',checks:[],limitations:[
 'Separate Owner-authorized packaged live acceptance uses available Go and search accounts; other provider accounts remain unconfigured. Ordinary source Journeys and CI are provider-free.',
 'Human Beta acceptance and the external editor study remain pending.',
 'The prior-version public Book is seeded through the exact 0.4.1 product store; current import/export use the actual package UI.',
]};
const checkpoint=()=>{if(report.testRoot)writeFileSync(join(OUTPUT,'beta-in-progress.json'),JSON.stringify({...report,currentStage:stage},null,2)+'\n');};
const check=(condition,name)=>{if(!condition)throw Error(name);report.checks.push(name);console.log('BETA_PACKAGE/pass/'+name);checkpoint();};
const at=(name)=>{stage=name;console.log('BETA_PACKAGE/stage/'+name);checkpoint();};
const run=(file,args,env=process.env)=>{const result=spawnSync(file,args,{cwd:ROOT,env,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});if(result.status!==0){
 report.childFailures??=[];const error=(result.stderr??'').match(/(?:^|\n)([A-Za-z]+Error)(?: \[([A-Z0-9_/-]+)\])?:/);const code=(result.stderr??'').match(/\bcode:\s*['"]([A-Z0-9_/-]+)['"]/);
 report.childFailures.push({executable:file.split(/[\\/]/).at(-1),entry:args[0]?.split(/[\\/]/).at(-1),exit:result.status,errorName:error?.[1]??null,code:code?.[1]??error?.[2]??result.error?.code??null});
 throw Error('child-failed');}return result.stdout;};
const wait=async(predicate,name,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(existsSync('C:/ai7/results/beta-cancel.txt'))throw Error('operator-cancelled');if(await predicate())return;await new Promise(r=>setTimeout(r,100));}throw Error(name);};
const native=(exe,options)=>{
 const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(ROOT,'tools','beta-native-dialog.ps1'),'-Executable',exe,...options],{cwd:ROOT,windowsHide:true,encoding:'utf8',timeout:60000});
 const ui=result.stdout?.split(/\r?\n/).find(line=>line.startsWith('BETA_NATIVE_UI:'));if(ui){report.nativeStartupUi=JSON.parse(ui.slice('BETA_NATIVE_UI:'.length));}
 const dialog=result.stdout?.split(/\r?\n/).find(line=>line.startsWith('BETA_NATIVE_DIALOG:'));if(dialog){report.nativeFileDialog=JSON.parse(dialog.slice('BETA_NATIVE_DIALOG:'.length));}
 const marker=result.stdout?.match(/^BETA_NATIVE\/[A-Za-z0-9/._-]+$/m)?.[0]??'BETA_NATIVE/no-marker';
 report.nativeCalls??=[];report.nativeCalls.push({stage,exit:result.status,marker});
 if(result.status!==0)throw Error(marker.toLowerCase().replaceAll('_','-').replaceAll('.','-'));
 return marker;
};

// The same CDP pipe used by the ordinary source Journeys, without any product test controls.
async function renderer(browser){
 const root=await browser.newBrowserCDPSession();let sequence=1;const pending=new Map();
 root.on('Target.receivedMessageFromTarget',({sessionId,message})=>{const value=JSON.parse(message);const key=sessionId+':'+value.id;const entry=pending.get(key);if(!entry)return;pending.delete(key);clearTimeout(entry.timer);value.error?entry.reject(Error('renderer-cdp')):entry.resolve(value.result);});
 let target;
 await wait(async()=>{target=(await root.send('Target.getTargets')).targetInfos.find(t=>t.type==='page');return Boolean(target);},'renderer-target');
 const {sessionId}=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 const send=async(method,params={})=>{const id=sequence++;const answer=new Promise((resolveAnswer,reject)=>{const timer=setTimeout(()=>{pending.delete(sessionId+':'+id);reject(Error('renderer-timeout'));},60000);pending.set(sessionId+':'+id,{resolve:resolveAnswer,reject,timer});});await root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});return answer;};
 return {send,evaluate:async(expression)=>{const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails){const fault=value.exceptionDetails.exception;const code=fault?.value?.code;report.rendererFailure={stage,className:fault?.className??null,code:typeof code==='string'&&/^[A-Z0-9_/-]+$/.test(code)?code:null};checkpoint();throw Error('renderer-expression');}return value.result.value;}};
}
const boolean=async(page,expression)=>page.evaluate('Promise.resolve('+expression+').then(Boolean)');
const actionCheck=(condition,operation,target)=>{if(!condition){report.failedAction={operation,target};check(false,'ui-'+operation+'-unavailable');}check(true,operation+'-'+target);};
const ready=async(page,expression,name,ms=120000)=>{
 try{await wait(()=>boolean(page,expression).catch(()=>false),name,ms);}catch(error){
  report.failedWait={stage,name};
  try{report.failedWait.controls=await page.evaluate("({screen:document.querySelector('[data-screen]')?.dataset.screen,buttons:[...document.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({label:n.textContent,disabled:n.disabled})),selects:[...document.querySelectorAll('select')].filter(n=>n.getClientRects().length).map(n=>({field:n.dataset.markField??n.dataset.reviewField??n.name,value:n.value,options:[...n.options].map(o=>({value:o.value,disabled:o.disabled}))}))})");}catch{}
  try{if(report.testRoot){const shot=await page.send('Page.captureScreenshot',{captureBeyondViewport:false});const path=join(report.testRoot,'failed-ui-'+Date.now()+'.png');await writeFile(path,Buffer.from(shot.data,'base64'));report.failedWait.screenshot=path;}}catch{}
  checkpoint();throw error;
 }
};
const actionable="node&&!node.disabled&&node.getAttribute('aria-disabled')!=='true'&&node.getClientRects().length>0";
const act=async(page,operation,target,lookup,mutation)=>{
 const observe=`(()=>{const node=${lookup};return Boolean(${actionable})})()`;
 try{await ready(page,observe,'ui-'+operation+'-readiness');}catch(error){
  report.failedAction={operation,target,phase:'readiness',surface:await page.evaluate("({path:location.pathname,screen:document.querySelector('[data-screen]')?.dataset.screen??null})").catch(()=>null)};
  throw error;
 }
 // Observe until ready, then send exactly one mutation; never retry a sent action.
 actionCheck(await page.evaluate(`(()=>{const node=${lookup};if(!(${actionable}))return false;${mutation};return true})()`),operation,target);
};
const click=async(page,label)=>act(page,'click',label,`[...document.querySelectorAll('button')].find(n=>n.textContent===${JSON.stringify(label)}&&n.getClientRects().length>0)`,'node.click()');
const select=async(page,selector)=>act(page,'select',selector,`document.querySelector(${JSON.stringify(selector)})`,'node.click()');
const fill=async(page,selector,value)=>act(page,'fill',selector,`document.querySelector(${JSON.stringify(selector)})`,`node.value=${JSON.stringify(value)};if(node.value!==${JSON.stringify(value)})throw Error('field-value-refused');node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}))`);
async function openKnownBook(page,bookId){
 if(await boolean(page,`document.querySelector('[data-screen=editor] [data-book-id="${bookId}"] [data-testid=manuscript-editor]')`))return;
 const selector=`#app-sidebar [data-nav-book=${JSON.stringify(bookId)}], [data-screen=landing] button[data-book-id=${JSON.stringify(bookId)}]`;
 const lookup=`[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.getClientRects().length>0)`;
 if(!await boolean(page,`(${lookup})`)){await select(page,'#app-sidebar [data-nav-destination=library]');await ready(page,"document.querySelector('[data-screen=landing]')",'known-book-library');}
 await act(page,'open-book',bookId,lookup,'node.click()');
 await ready(page,`document.querySelector('[data-screen=editor] [data-book-id="${bookId}"] [data-testid=manuscript-editor]')`,'known-book-manuscript');
}
async function openRetainedReview(page,runId){
 await select(page,'#app-sidebar [data-nav-book-section=review]');
 const item=`.review-runs [data-review-run-id=${JSON.stringify(runId)}]`;
 await ready(page,`document.querySelector(${JSON.stringify(item)})`,'retained-review-history-row');
 if(!await boolean(page,`document.querySelector(${JSON.stringify(item)})?.getAttribute('aria-current')==='true'`))await select(page,item+' [data-review-action=open-run]');
 await ready(page,`document.querySelector(${JSON.stringify(item)})?.getAttribute('aria-current')==='true'`,'retained-review-opened');
}
async function followReview(page,dataRoot,runId){
 let previous=null,advancedAt=Date.now();
 for(;;){
  const progress=await page.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(runId)}}).then(v=>({runId:v.run?.reviewRunId,state:v.run?.state,categories:v.run?.categories.map(c=>({id:c.categoryId,state:c.state,taskIntentId:c.taskIntentId,progress:c.progress?{unitsSettled:c.progress.unitsSettled,completedAttempts:c.progress.completedAttempts,stage:c.progress.stage,lastTransitionAt:c.progress.lastTransitionAt}:null}))}))`);
  if(progress.runId!==runId)throw Error('observed-review-changed');
  const db=new DatabaseSync(join(dataRoot,'store','ai7.sqlite'),{readOnly:true});
  try{
   progress.claimEvents=db.prepare('SELECT COUNT(*) total,MAX(e.recorded_at) latest FROM factual_claim_events e JOIN factual_claim_sessions s USING(session_id) JOIN analysis_run_records r USING(run_record_id) WHERE r.task_intent_id IN (SELECT json_extract(value,\'$.task.taskIntentId\') FROM review_runs rr,json_each(rr.canonical_json,\'$.categories\') WHERE rr.review_run_id=?)').get(runId);
  }finally{db.close();}
  const fingerprint=JSON.stringify(progress);
  if(fingerprint!==previous){previous=fingerprint;advancedAt=Date.now();report.reviewProgress={...progress,advancedAt:new Date(advancedAt).toISOString()};checkpoint();}
  if(['settled','partial','failed','scope-changed','plan-moved','cancelled'].includes(progress.state)&&progress.categories.every(c=>!['prepared','waiting','running'].includes(c.state)))return;
  if(existsSync('C:/ai7/results/beta-cancel.txt')||Date.now()-advancedAt>360000){
   report.reviewObserverStop={runId,reason:existsSync('C:/ai7/results/beta-cancel.txt')?'operator-request':'six-minutes-without-durable-progress',lastProgress:report.reviewProgress};checkpoint();
   await page.evaluate(`window.ai7.controlTaskRun({kind:'review-run',ref:${JSON.stringify(runId)},action:'pause'})`);
   const end=Date.now()+300000;
   while(Date.now()<end){
    const paused=new DatabaseSync(join(dataRoot,'store','ai7.sqlite'),{readOnly:true});
    let states;
    try{states=paused.prepare('SELECT s.state FROM analysis_run_states s JOIN analysis_run_records r USING(run_record_id) WHERE s.sequence=(SELECT MAX(x.sequence) FROM analysis_run_states x WHERE x.run_record_id=s.run_record_id) AND r.task_intent_id IN (SELECT json_extract(value,\'$.task.taskIntentId\') FROM review_runs rr,json_each(rr.canonical_json,\'$.categories\') WHERE rr.review_run_id=?)').all(runId);}finally{paused.close();}
    if(states.every(s=>!['executing','pausing','authorized'].includes(s.state)))throw Error('full-review-paused-at-boundary');
    await new Promise(r=>setTimeout(r,1000));
   }
   throw Error('full-review-pause-not-settled');
  }
  await new Promise(r=>setTimeout(r,1000));
 }
}
async function controlledSourceTranslation(page,bookId,dataRoot,channel,input,executable){
 at(channel+'-controlled-english-source');
 const fact='Apollo 11 landed on the Moon on July 20, 1969. Neil Armstrong became the first person to step onto the lunar surface. NASA describes this mission at https://www.nasa.gov/history/july-20-1969-one-giant-leap-for-mankind/.';
 const typo='Beta 测试者加入的独立纠错样例：这句话有的的重复字。';
 report.controlledTranslations??=[];
 let probe=report.controlledTranslations.find(p=>p.channel===channel&&p.bookId===bookId);
 if(!probe){probe={scope:'explicit tester edit of admitted sample1; controlled functional stratum, excluded from natural precision and original FullReview coverage',source:'https://www.nasa.gov/history/july-20-1969-one-giant-leap-for-mankind/',factSha256:createHash('sha256').update(fact).digest('hex'),bookId,channel};report.controlledTranslations.push(probe);checkpoint();}
 await select(page,'#app-sidebar [data-nav-book-section=manuscript]');
 await ready(page,"document.querySelector('[data-testid=manuscript-editor] p[data-block-id]')",'controlled-editor');
 const enter=async()=>{await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});};
 if(!probe.blockId){
  check(await page.evaluate(`(()=>{const e=document.querySelector('[data-testid=manuscript-editor]');const p=[...e.querySelectorAll('p[data-block-id]')].find(n=>n.textContent.length>30);if(!p)return false;e.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);return true})()`),'controlled-insertion-caret');
  await enter();await page.send('Input.insertText',{text:fact});await enter();await page.send('Input.insertText',{text:typo});
  await ready(page,`[...document.querySelectorAll('[data-testid=manuscript-editor] p[data-block-id]')].some(n=>n.textContent===${JSON.stringify(fact)})&&document.querySelector('#persistence-status')?.dataset.tone!=='busy'`,'controlled-public-edit-saved');
  probe.blockId=await page.evaluate(`[...document.querySelectorAll('[data-testid=manuscript-editor] p[data-block-id]')].find(n=>n.textContent===${JSON.stringify(fact)}).dataset.blockId`);checkpoint();
 }
 // This factual contract does not offer range supplement. Isolate one edited Public SampleBook paragraph,
 // so its ordinary whole-book review cannot widen into the paid manuscript's original FullReview.
 await select(page,'#app-sidebar [data-nav-destination=library]');await ready(page,"document.querySelector('[data-screen=landing]')",'controlled-library');
 if(!probe.isolatedBookId)probe.isolatedBookId=await page.evaluate("[...document.querySelectorAll('#app-sidebar [data-nav-book]')].find(n=>n.textContent.includes('Beta source translation functional'))?.dataset.navBook??null");
 if(!probe.isolatedBookId){
  const isolatedInput=join(dirname(input),'controlled-public-sample1-one-paragraph.docx');
  await composeAdmittedDocx(isolatedInput,{source:'sample1.docx',startBlock:1,blocks:1,title:'Beta source translation functional'});
  probe.isolatedInput={source:'sample1.docx',startBlock:1,blocks:1,sha256:createHash('sha256').update(await readFile(isolatedInput)).digest('hex')};checkpoint();
  await click(page,'导入稿件');native(executable,['-FileName',isolatedInput]);await ready(page,"document.querySelector('[data-screen=target]')",'controlled-import-target');
  await select(page,'input[data-import-target-choice=new-book]');await select(page,'input[aria-label="作为首份稿件导入"]');
  await fill(page,'#book-title','Beta source translation functional');await click(page,'确认书名并复核');await ready(page,"document.querySelector('[data-screen=review]')",'controlled-import-review');
  await click(page,'新建图书并导入稿件');await ready(page,"document.querySelector('[data-screen=imported]')&&document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'",'controlled-import-completed');
  await click(page,'打开稿件');await ready(page,"document.querySelector('[data-testid=manuscript-editor]')",'controlled-import-opened');
  probe.isolatedBookId=await page.evaluate('window.ai7.inspectReviewWorkspace().then(v=>v.bookId)');checkpoint();
 }else{await openKnownBook(page,probe.isolatedBookId);}
 if(!probe.isolatedEdited){
  check(await page.evaluate("(()=>{const e=document.querySelector('[data-testid=manuscript-editor]');e.focus();const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);return true})()"),'controlled-isolated-edit-selection');
  await page.send('Input.insertText',{text:fact});
  await ready(page,`document.querySelector('[data-testid=manuscript-editor]')?.textContent===${JSON.stringify(fact)}&&document.querySelector('#persistence-status')?.dataset.tone!=='busy'`,'controlled-isolated-edit-saved');
  probe.isolatedEdited=true;checkpoint();
 }
 const sourceBookId=probe.isolatedBookId;
 if(!probe.runId){
  await select(page,'#app-sidebar [data-nav-book-section=review]');await ready(page,"document.querySelector('[data-review-action=new-review]')",'controlled-review-surface');
  check(await page.evaluate('window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(v=>v.run===null)'),'controlled-no-previous-paid-run');
  await select(page,'[data-review-action=new-review]');await ready(page,"document.querySelector('dialog.review-sheet[open]')",'controlled-factual-sheet');
  check(await page.evaluate("(()=>{const boxes=[...document.querySelectorAll('dialog.review-sheet input[name=review-category]')];const fact=boxes.find(n=>n.value==='factual-review');if(!fact||fact.disabled)return false;for(const n of boxes)if(n.checked!==(n===fact))n.click();return fact.checked})()"),'controlled-only-factual-category');
  await select(page,'input[name=review-scope][value=whole]');await select(page,'dialog.review-sheet [data-review-action=start]');
  await ready(page,'window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(v=>v.run!==null)','controlled-factual-started');
  const started=await page.evaluate('window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(v=>({runId:v.run.reviewRunId,taskIntentId:v.run.categories.find(c=>c.categoryId===\'factual-review\').taskIntentId}))');Object.assign(probe,started);probe.startedAt=new Date().toISOString();checkpoint();
 }
 await followReview(page,dataRoot,probe.runId);
 const sources=await page.evaluate(`(async()=>{const records=[];let after=null;for(let n=0;n<20;n++){const v=await window.ai7.inspectResearchEvidence({bookId:${JSON.stringify(sourceBookId)},taskIntentId:${JSON.stringify(probe.taskIntentId)},after});records.push(...v.records);if(v.next==null)break;after=v.next;}const eligible=records.filter(r=>r.captureState==='full-text'&&r.translation?.state==='translated'&&r.passage&&(r.passage.match(/\\p{L}+/gu)?.length??0)>=5&&r.translation.text.trim()!==r.passage.trim());const r=eligible.find(r=>r.url==='https://svs.gsfc.nasa.gov/4185')??eligible[0];return {count:records.length,translated:records.filter(r=>r.translation?.state==='translated').length,target:r?{evidenceId:r.evidenceId,url:r.url,contentSha256:r.contentSha256,attribution:r.translation.attribution}:null};})()`);if(probe.target&&probe.target.evidenceId!==sources.target?.evidenceId){probe.priorTargets??=[];probe.priorTargets.push({target:probe.target,assessment:'retained but not substantive acceptance: first passage truncated at an abbreviation'});}Object.assign(probe,sources);probe.targetSelection='Prefer already-retained complete NASA mission landing prose; all captures and rejected prior choice preserved, no new call';checkpoint();
 check(Boolean(probe.target),'controlled-current-foreign-prose-required');
 const retainedDb=new DatabaseSync(join(dataRoot,'store','ai7.sqlite'),{readOnly:true});
 try{
  const row=retainedDb.prepare('SELECT e.canonical_json,e.sha256,c.content_text FROM research_evidence e JOIN research_evidence_contents c USING(content_sha256) JOIN analysis_run_records r USING(run_record_id) WHERE e.evidence_id=? AND e.book_id=? AND r.task_intent_id=?').get(probe.target.evidenceId,sourceBookId,probe.taskIntentId);
  check(Boolean(row)&&createHash('sha256').update(row.canonical_json).digest('hex')===row.sha256,'controlled-retained-record-hash');
  const content=String(row.content_text),attribution=probe.target.attribution;
  check(createHash('sha256').update(content).digest('hex')===probe.target.contentSha256&&attribution.contentSha256===probe.target.contentSha256&&attribution.url===probe.target.url&&attribution.from>=0&&attribution.to>attribution.from&&attribution.to<=content.length,'controlled-original-range-hash');
  const passage=content.slice(attribution.from,attribution.to),translation=JSON.parse(row.canonical_json).translation;
  check((passage.match(/[A-Za-z]+/g)?.length??0)>=5&&!/PHP\s+(?:Warning|Fatal)|^https?:\/\//i.test(passage.trim()),'controlled-retained-english-prose');
  probe.retainedOriginal={passageSha256:createHash('sha256').update(passage).digest('hex'),characters:passage.length,route:translation.route,model:translation.model,from:attribution.from,to:attribution.to};checkpoint();
 }finally{retainedDb.close();}
 await select(page,'#app-sidebar [data-nav-book-section=sources]');await ready(page,"document.querySelector('.research-evidence[data-evidence-count]')",'controlled-source-surface-loaded');
 const selector=`article[data-evidence-id=${JSON.stringify(probe.target.evidenceId)}] .research-evidence-translated blockquote`;
 for(let n=0;n<20&&!await boolean(page,`document.querySelector(${JSON.stringify(selector)})?.textContent.length>0`)&&await boolean(page,"document.querySelector('[data-evidence-action=more]')");n++){const before=await page.evaluate("Number(document.querySelector('.research-evidence').dataset.evidenceCount)");await select(page,'[data-evidence-action=more]');await ready(page,`Number(document.querySelector('.research-evidence')?.dataset.evidenceCount)>${before}`,'controlled-source-page-loaded');}
 await ready(page,`document.querySelector(${JSON.stringify(selector)})?.textContent.length>0`,'controlled-foreign-source-translation-rendered');
 await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
 const displayed=await page.evaluate(`(()=>{const card=document.querySelector('article[data-evidence-id=${JSON.stringify(probe.target.evidenceId)}]');const text=card?.querySelector('.research-evidence-translated blockquote');return {visible:Boolean(text?.getClientRects().length),original:card?.querySelector('.research-evidence-original blockquote')?.textContent,text:text?.textContent,caption:card?.querySelector('.research-evidence-translated figcaption')?.textContent}})()`);
 check(displayed.visible&&displayed.caption?.includes('来源译文')&&createHash('sha256').update(displayed.original??'').digest('hex')===probe.retainedOriginal.passageSha256,'controlled-foreign-source-translation-visible');
 probe.ui={evidenceId:probe.target.evidenceId,caption:displayed.caption,originalCharacters:displayed.original.length,translatedCharacters:displayed.text.length,translatedSha256:createHash('sha256').update(displayed.text).digest('hex')};probe.completedAt=new Date().toISOString();checkpoint();
 const sourceShot=await page.send('Page.captureScreenshot',{captureBeyondViewport:false});
 probe.ui.screenshot=join(report.testRoot,'controlled-source-'+channel+'-'+Date.now()+'.png');await writeFile(probe.ui.screenshot,Buffer.from(sourceShot.data,'base64'));checkpoint();
 await select(page,'#app-sidebar [data-nav-destination=library]');await ready(page,"document.querySelector('[data-screen=landing]')",'controlled-return-library');
 await openKnownBook(page,bookId);
}
async function cleanupInstallation(path){if(!path)return;const actual=resolve(path);if(!actual.toLowerCase().startsWith(resolve(tmpdir(),'ai7-beta-package-').toLowerCase())||!actual.endsWith('installed'))throw Error('cleanup-target-refused');if(!existsSync(actual))return;const name=(await readdir(actual)).find(n=>/^Uninstall.*\.exe$/i.test(n));if(name){run(join(actual,name),['/S']);await wait(()=>!existsSync(join(actual,'AI7.exe')),'cleanup-uninstall-timeout');}}

async function seedPriorBook(temp,dataRoot){
 const baseline='754f1bdc541f69bc5adf573b9d70116004982cb6';
 const prior=join(temp,'prior-source');await mkdir(prior);
 const archive=join(temp,'prior-source.zip');run('git.exe',['archive','--format=zip','--output='+archive,baseline]);
 run(join(process.env.SystemRoot,'System32','tar.exe'),['-xf',archive,'-C',prior]);
 const entry=join(temp,'seed-prior.mjs'),bundle=join(ROOT,'node_modules','.cache','beta-seed-prior.mjs');
 const modulePath=join(prior,'src','service','store.ts').replaceAll('\\','/');
 await writeFile(entry,`
  import {EditorialStore} from ${JSON.stringify(modulePath)};
  import {randomUUID} from 'node:crypto';
  const store=await EditorialStore.open(${JSON.stringify(dataRoot)},${JSON.stringify(prior)});
  try {
   const staged=await store.stageSelectedManuscript(randomUUID(),${JSON.stringify(join(ROOT,'SampleBooks','sample1.docx'))});
   const choice=staged.targetChoices.find(c=>c.kind==='new-book');
   const target={kind:'new-book',choiceId:choice.id,confirmedTitle:'Prior 0.4.1 Public SampleBook'};
   let review=store.prepareNewBookReview(staged.draftId,staged.draftVersion,target,false);
   if(!review.reviewDigest)review=store.prepareNewBookReview(staged.draftId,review.draftVersion,target,true);
   const commitId=randomUUID();const imported=await store.commitNewBookImport({draftId:staged.draftId,expectedDraftVersion:review.draftVersion,reviewDigest:review.reviewDigest,commitId});
   await store.acknowledgeImportCompletion(commitId);
   const version=store.inspectDataVersion();store.markCleanShutdown();
   console.log(JSON.stringify({bookId:imported.bookId,softwareVersion:version.softwareVersion,schemaRevision:version.schemaRevision}));
  }finally{store.close();}
 `);
 await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',logLevel:'silent'});
 return JSON.parse(run(process.execPath,[bundle]).trim());
}

async function configureLiveConnections(dataRoot,temp,channel){
 const entry=join(temp,'configure-'+channel+'.ts'),bundle=join(ROOT,'node_modules','.cache','beta-configure.mjs');
 await writeFile(entry,`
  import {EditorialStore} from ${JSON.stringify(join(ROOT,'src/service/store.ts').replaceAll('\\','/'))};
  const store=await EditorialStore.open(${JSON.stringify(dataRoot)},${JSON.stringify(ROOT)});
  try{
   const existing=store.getModelServiceRouteConnection('opencode-go');
   const model=store.saveModelServiceConnection('Beta available Go account',existing?.credentialReference??null,'ready','opencode-go');
   store.selectModelServiceRoute('opencode-go');
   store.selectMainRoleModel('opencode-go','deepseek-v4.1-flash');store.selectFastRoleModel('opencode-go','deepseek-v4.1-flash');
   const refs=[{slot:'opencode-go',credentialReference:model.credentialReference}];
   for(const slot of ['search-brave','search-bochaai']){const current=store.getSearchBackendConnections().find(c=>c.backendId===slot);const saved=store.saveSearchBackendCredential(slot,current?.credentialReference??null,'ready');refs.push({slot,credentialReference:saved.credentialReference});}
   // Enrollment preserves the ordinary primary/fallback selection. The visible
   // settings flow chooses a tested primary for new work; resumed tasks keep their pins.
   store.markCleanShutdown();console.log(JSON.stringify(refs));
  }finally{store.close();}
 `);
 await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',logLevel:'silent'});
 const refs=JSON.parse(run(process.execPath,[bundle]).trim());
 report.ownedCredentialReferences??=[];report.ownedCredentialReferences.push(...refs);
 const nonce=randomUUID(),probe={slot:'opencode-go',credentialReference:randomUUID(),ephemeral:true};const closeEnrollment=await serveGuestEnrollment(nonce,[...refs,probe],{importKeyring:packagedKeyring});
 await writeFile('C:/ai7/results/beta-enrollment-request.json',JSON.stringify({schema:1,nonce,channel,sourceCommit:report.buildIdentity.sourceCommit,runnerHead:report.runnerHead,createdAt:new Date().toISOString(),processId:process.pid,references:refs,probe})+'\n');
 at('await-protected-enrollment-'+channel);
 try{await wait(async()=>{try{if(existsSync('C:/ai7/results/beta-enrollment-cancel.txt'))throw Error('enrollment-cancelled');return (await readFile('C:/ai7/results/beta-enrollment-complete.txt','utf8')).trim()===nonce;}catch(e){if(e.message==='enrollment-cancelled')throw e;return false;}},'protected-enrollment-timeout',1200000);}finally{await closeEnrollment();}
 check(true,channel+'-protected-enrollment');
}

async function removeOwnedCredentials(){
 for(const ref of report.ownedCredentialReferences??[]){
  await storeEnrollment(['--slot',ref.slot,'--credential-reference',ref.credentialReference,'--delete'],{importKeyring:packagedKeyring});
 }
 report.credentialCleanup='completed';
}

async function preparePortableCarry(executable,env,dataRoot,input){
 at('portable-restore-paid-history');
 const backup=report.storageBackups?.findLast(b=>b.channel==='windows-installer');
 check(Boolean(backup)&&createHash('sha256').update(await readFile(backup.path)).digest('hex')===backup.sha256,'portable-supported-backup-exact-source');
 let browser;
 try{
  browser=await chromium.launch({executablePath:executable,headless:false,ignoreDefaultArgs:true,args:['--remote-debugging-pipe'],env,timeout:60000});let page=await renderer(browser);
  await ready(page,"document.documentElement.dataset.ai7ProductReady==='true'",'portable-local-startup');
  const originalBook=report.controlledTranslations.find(t=>t.channel==='windows-installer').bookId;
  const restoredReceipt=await page.evaluate(`window.ai7.inspectDatabaseReplacements().then(v=>v.replacements.find(r=>r.kind==='replace'&&r.outcome==='applied'&&r.packageFileName===${JSON.stringify(backup.path.split(/[\\/]/).at(-1))})??null)`);
  const restoredBook=restoredReceipt&&await page.evaluate(`window.ai7.getBookOverview({bookId:${JSON.stringify(originalBook)},historyCursor:null}).then(v=>v.manuscriptState.state==='populated').catch(()=>false)`);
  if(restoredBook&&!report.portableCarry?.restored){
   await openKnownBook(page,originalBook);
   await openRetainedReview(page,report.completedReview.review.runId);
   check(await page.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(report.completedReview.review.runId)}}).then(v=>v.run?.reviewRunId===${JSON.stringify(report.completedReview.review.runId)})`),'portable-existing-supported-restore-exact-review');
   report.portableCarry={restored:true,restoredAt:restoredReceipt.recordedAt,method:'ordinary database backup preview/replace/restart UI; recovered applied receipt before any repeat',replacement:restoredReceipt,sourceBackup:backup,fullReviewExecution:report.completedReview.buildIdentity,observedBy:report.buildIdentity,priorMigrationChecks:resume?.checks.filter(c=>c.startsWith('portable-prior-')||c.startsWith('portable-own-upgrade-')||c==='portable-separate-data-before-restore')??[]};checkpoint();
  }
  if(!report.portableCarry?.restored){
   check(await page.evaluate(`window.ai7.getBookOverview({bookId:${JSON.stringify(report.portablePriorBook.bookId)},historyCursor:null}).then(v=>v.manuscriptState.state==='populated')`),'portable-prior-book-survives-upgrade');
   check(await page.evaluate("window.ai7.inspectDataVersion().then(v=>v.schemaRevision===107&&v.history.some(h=>h.softwareVersion==='0.4.1')&&v.history.some(h=>h.softwareVersion==='0.5.0'))"),'portable-own-upgrade-history');
   await select(page,'#app-sidebar [data-nav-settings]');await click(page,'数据与存储');
   await ready(page,"document.querySelector('.data-storage-summary')",'portable-initial-storage');
   check(await page.evaluate(`document.querySelector('[data-product-data-root]')?.textContent===${JSON.stringify(dataRoot)}`),'portable-separate-data-before-restore');
   await select(page,'[data-database-import-action=choose]');native(executable,['-FileName',backup.path]);
   await ready(page,"document.querySelector('input[name=database-import-choice][value=replace]')",'portable-supported-restore-preview');
   await select(page,'input[name=database-import-choice][value=replace]');await select(page,'[data-database-import-action=confirm]');
   await ready(page,"document.querySelector('.database-import')?.dataset.pending==='true'",'portable-supported-restore-pending');
   await browser.close();browser=undefined;
   browser=await chromium.launch({executablePath:executable,headless:false,ignoreDefaultArgs:true,args:['--remote-debugging-pipe'],env,timeout:60000});page=await renderer(browser);
   await ready(page,"document.documentElement.dataset.ai7ProductReady==='true'",'portable-restored-startup');
   const original=report.completedReview.review.runId;
   await openKnownBook(page,originalBook);
   await openRetainedReview(page,original);
   check(await page.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(original)}}).then(v=>v.run?.reviewRunId===${JSON.stringify(original)})`),'portable-restored-exact-review');
   report.portableCarry={restored:true,restoredAt:new Date().toISOString(),method:'ordinary database backup preview/replace/restart UI; no raw store copy',sourceBackup:backup,fullReviewExecution:report.completedReview.buildIdentity,observedBy:report.buildIdentity};checkpoint();
  }
  for(const key of ['agent','agentAttempts','globalTurns','globalAttempts','habits','habitAttempts','controlledTranslations','findingDispositions']){
   report[key]??=[];
   // Earlier receipts identify different binaries for the separately executed phases.
   // Carry these identities forward; the restore does not make them new executions.
   const executedBy=['agent','agentAttempts','controlledTranslations'].includes(key)
    ? {buildNumber:538,sourceCommit:'5328fc484231e032177d134d91cee091b29a62af'}
    : ['globalTurns','globalAttempts','habits','habitAttempts'].includes(key)
     ? {buildNumber:550,sourceCommit:'4f0d1b87ace6115e1e9515b2ffb96a00e2bc795b'} : null;
   if(!report[key].some(v=>v.channel==='windows-portable'))report[key].push(...report[key].filter(v=>v.channel==='windows-installer').map(v=>({...structuredClone(v),channel:'windows-portable',reusedFrom:{channel:'windows-installer',method:'supported backup restore',executedBy,observedBy:report.buildIdentity}})));
  }
  checkpoint();
  at('portable-native-accepted-import');
  if(await boolean(page,"document.querySelector('[data-screen=import-recovery]')")){
   check(await page.evaluate(`document.querySelector('[data-screen=import-recovery] .source-card [data-source-sha256]')?.textContent===${JSON.stringify(report.input.sha256)}`),'portable-recovered-exact-staged-input');
   await click(page,'继续导入');await ready(page,"document.querySelector('[data-screen=target]')",'portable-recovered-import-target');
  }
  const staged=await boolean(page,"document.querySelector('[data-screen=target]')");
  if(!staged){await select(page,'#app-sidebar [data-nav-destination=library]');await ready(page,"document.querySelector('[data-screen=landing]')",'portable-import-library');}
  const title='Beta portable accepted-baseline';
  let imported=report.portableImport?.bookId??await page.evaluate(`[...document.querySelectorAll('#app-sidebar [data-nav-book]')].find(n=>n.textContent.includes(${JSON.stringify(title)}))?.dataset.navBook??null`);
  if(!imported){
   if(!staged){await click(page,'导入稿件');native(executable,['-FileName',input]);await ready(page,"document.querySelector('[data-screen=target]')",'portable-import-target');}
   check(await page.evaluate(`document.querySelector('[data-screen=target] .source-card [data-source-sha256]')?.textContent===${JSON.stringify(report.input.sha256)}`),'portable-exact-staged-native-input');
   await select(page,'input[data-import-target-choice=new-book]');await select(page,'input[aria-label="作为首份稿件导入"]');
   await select(page,'input[data-word-import-mode=accepted-baseline]');await select(page,'[data-word-accepted-baseline-confirmation]');await fill(page,'#book-title',title);
   await click(page,'确认书名并复核');await ready(page,"document.querySelector('[data-screen=review]')",'portable-import-review');
   await click(page,'新建图书并导入稿件');await ready(page,"document.querySelector('[data-screen=imported]')&&document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'",'portable-import-finished');
   await click(page,'打开稿件');await ready(page,"document.querySelector('[data-testid=manuscript-editor]')",'portable-import-editor');
   imported=await page.evaluate('window.ai7.inspectReviewWorkspace().then(v=>v.bookId)');
  }else{await openKnownBook(page,imported);}
  report.portableImport={...report.portableImport,bookId:imported,mode:'accepted-baseline',inputSha256:report.input.sha256};checkpoint();
  await ready(page,"document.querySelector('[aria-label^=跳转到尾注]')&&document.querySelector('.manuscript-source-table td')&&[...document.querySelectorAll('.manuscript-source-image img')].some(n=>n.naturalWidth>0)",'portable-fresh-accepted-objects');
  check(true,'portable-fresh-accepted-import-without-workspace-ceremony');
  const output=join(dirname(input),'portable-accepted-export.docx');
  await select(page,'#app-sidebar [data-nav-book-section=deliverables]');await ready(page,"document.querySelector('[data-screen=book-deliverables]')",'portable-accepted-deliverables');
  if(!existsSync(output)){
   await select(page,'[data-export-action=open][data-export-target=current]');native(executable,['-FileName',output]);
   await ready(page,"document.querySelector('.export-receipt')?.dataset.exportOutcome==='created'",'portable-accepted-exported');
  }
  const bytes=await readFile(output),sha256=createHash('sha256').update(bytes).digest('hex');
  const receipt=await page.evaluate(`window.ai7.inspectDeliverables().then(v=>v.exports.find(r=>['created','replaced'].includes(r.outcome)&&r.target.revisionId===v.manuscript.revisionId&&r.technical.fileSha256===${JSON.stringify(sha256)})??null)`);
  check(Boolean(receipt),'portable-accepted-native-export-receipt');
  const source=unzipSync(await readFile(input)),exported=unzipSync(bytes),sourceTable=wordTablePresentation(source),exportTable=wordTablePresentation(exported);
  check(sourceTable.presentationSha256===exportTable.presentationSha256&&exportTable.commentsResolve,'portable-accepted-table-fidelity');
  check(createHash('sha256').update(source['word/media/source-preview.png']).digest('hex')===createHash('sha256').update(exported['word/media/source-preview.png']).digest('hex'),'portable-accepted-media-fidelity');
  report.portableImport={bookId:imported,mode:'accepted-baseline',nativeExport:{path:output,sha256,receipt},sourceTable,exportTable};checkpoint();
 }finally{await browser?.close();}
}

async function portableLiveOnce(page,bookId){
 at('windows-portable-live-once');
 report.portableLiveAttempts??=[];
 let attempt=report.portableLiveAttempts.find(t=>t.bookId===bookId);
 if(attempt?.dialogueId){
  check(await page.evaluate(`window.ai7.inspectDialogue({dialogueId:${JSON.stringify(attempt.dialogueId)},afterFragment:0}).then(v=>v.attempts.at(-1)?.state==='completed'&&v.attempts.at(-1)?.fragmentTotal>0)`),'portable-original-live-once-complete');return;
 }
 check(!attempt,'portable-live-once-intent-needs-lineage-reconciliation');
 const blockId=await page.evaluate("(()=>{const e=document.querySelector('[data-testid=manuscript-editor]');const p=[...e.querySelectorAll('p[data-block-id]')].find(n=>n.firstChild?.nodeType===3&&n.firstChild.length>30&&!n.querySelector('.editorial-mark'));if(!p)return null;e.focus();const r=document.createRange();r.setStart(p.firstChild,2);r.setEnd(p.firstChild,22);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));return p.dataset.blockId})()");
 check(Boolean(blockId),'portable-live-once-selection');
 await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await page.evaluate(`(()=>{const p=document.querySelector('p[data-block-id="${blockId}"]');const r=p.getBoundingClientRect();p.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:r.x+20,clientY:r.y+10}));})()`);
 await select(page,'[data-mark-action=ask-on-selection]');await ready(page,"document.querySelector('[data-mark-composer=ask-about-selection]')",'portable-live-once-question');
 await fill(page,'[data-mark-field=question]','请用一句话说明所选公开样书文字的叙述语气，不改写正文。');
 attempt={bookId,intendedAt:new Date().toISOString(),scope:'one bounded new portable interaction; earlier paid review/translation/Agent/global/habits reused through supported restore'};report.portableLiveAttempts.push(attempt);checkpoint();
 await select(page,'[data-mark-composer=ask-about-selection] [data-mark-action=submit]');
 await ready(page,"document.querySelector('#task-drawer .dialogue')?.dataset.dialogueId",'portable-live-once-created');
 attempt.dialogueId=await page.evaluate("document.querySelector('#task-drawer .dialogue').dataset.dialogueId");checkpoint();
 await ready(page,`window.ai7.inspectDialogue({dialogueId:${JSON.stringify(attempt.dialogueId)},afterFragment:0}).then(v=>v.attempts.at(-1)?.state==='completed'&&v.attempts.at(-1)?.fragmentTotal>0)`,'portable-live-once-streamed',300000);
 attempt.completedAt=new Date().toISOString();checkpoint();check(true,'portable-own-keyring-route-streaming');
 await select(page,'#task-drawer [data-task-drawer-control=close]');
}

async function verifyDeliveryArchive(path,dataRoot,bookId,page,channel){
 const inspected=inspectDeliveryArchive(await readFile(path)),db=new DatabaseSync(join(dataRoot,'store','ai7.sqlite'),{readOnly:true});
 let recorded,version;
 try{
  const row=db.prepare("SELECT canonical_json,sha256 FROM book_delivery_package_exports WHERE book_id=? AND json_extract(canonical_json,'$.kind')='archive-receipt' AND json_extract(canonical_json,'$.receipt.finalPath')=? ORDER BY created_at DESC LIMIT 1").get(bookId,path);
  check(Boolean(row)&&createHash('sha256').update(row.canonical_json).digest('hex')===row.sha256,channel+'-delivery-receipt-canonical-hash');
  recorded=JSON.parse(row.canonical_json);
  const frozen=db.prepare('SELECT canonical_json,sha256 FROM book_delivery_package_versions WHERE package_version_id=? AND book_id=?').get(recorded.packageVersionId,bookId);
  check(Boolean(frozen)&&createHash('sha256').update(frozen.canonical_json).digest('hex')===frozen.sha256,channel+'-delivery-frozen-version-hash');
  version=JSON.parse(frozen.canonical_json);
 }finally{db.close();}
 const r=recorded.receipt;
 check(['created','replaced'].includes(r.outcome)&&r.stopped===null&&r.sha256===inspected.sha256&&r.byteLength===inspected.byteLength,channel+'-delivery-exact-success-receipt');
 check(r.memberCount===r.members.length&&r.metadata.length===2&&r.members.length+r.metadata.length===inspected.members.length&&[...r.members,...r.metadata].every(m=>inspected.members.some(f=>f.path===m.path&&f.sha256===m.sha256&&(m.byteLength===undefined||m.byteLength===f.byteLength))),channel+'-delivery-all-member-hashes');
 check(version.contentDigest===inspected.contentDigest&&version.content.limitations.every(l=>inspected.manifest.includes(l)),channel+'-delivery-frozen-manifest-and-limitations');
 check(await page.evaluate(`window.ai7.inspectBookDeliveryPackage().then(v=>v.versions.some(p=>p.packageVersionId===${JSON.stringify(recorded.packageVersionId)}&&p.exports.some(e=>e.exportId===${JSON.stringify(recorded.parentExportId)}&&e.state==='exported')))`),channel+'-delivery-ordinary-history-receipt');
 report.deliveryExports??=[];report.deliveryExports.push({channel,path,sha256:inspected.sha256,byteLength:inspected.byteLength,contentDigest:inspected.contentDigest,members:inspected.members,receipt:r,packageVersionId:recorded.packageVersionId,buildIdentity:report.buildIdentity,runnerHead:report.runnerHead});checkpoint();
}

async function walk(executable,env,expectedChannel,expectedDataRoot,input,output){
 at(expectedChannel+'-launch');
 let browser;
 try{
  // Ordinary packaged argv: the pipe only; data location is still resolved by the actual channel.
  if(expectedChannel==='windows-installer'&&!existsSync(join(expectedDataRoot,'..','startup-data-location.json'))){
   at('native-first-startup-choice');
   const initial=spawn(executable,[],{env,windowsHide:false,stdio:'ignore'});initial.once('exit',code=>{report.firstLaunchExit=code;});
   native(executable,['-ButtonName','使用默认位置']);
   await wait(()=>existsSync(join(expectedDataRoot,'..','startup-data-location.json')),'startup-choice-persisted');
   await new Promise(r=>setTimeout(r,3000));native(executable,['-StopOwnedProcess']);
   await new Promise(r=>setTimeout(r,1000));initial.unref();
   check(true,'native-first-run-relaunch');
  }
  if(STARTUP_ONLY){check(true,expectedChannel+'-native-startup-probe');return;}
  if(!RETAINED_REVIEW_ONLY)await configureLiveConnections(expectedDataRoot,dirname(input),expectedChannel);
  browser=await chromium.launch({executablePath:executable,headless:false,ignoreDefaultArgs:true,args:['--remote-debugging-pipe'],env,timeout:60000});
  let page=await renderer(browser);
  await ready(page,"document.documentElement.dataset.ai7ProductReady==='true'",'product-ready');
  check(!await boolean(page,'Promise.resolve(false)')&&await boolean(page,'Promise.resolve(true)'),expectedChannel+'-async-predicate-resolution');
  at(expectedChannel+'-open-library');
  await select(page,'#app-sidebar [data-nav-destination=library]');
  await ready(page,"document.querySelector('[data-screen=landing]')",'initial-library-ready');
  check(true,expectedChannel+'-library');
  const resumePrefix=Boolean((resume&&expectedChannel==='windows-installer')||(expectedChannel==='windows-portable'&&report.portableCarry?.restored));
  let bookId;
  if(resumePrefix){
   bookId=await page.evaluate("[...document.querySelectorAll('#app-sidebar [data-nav-book]')].find(n=>n.textContent.includes('Beta package compatibility'))?.dataset.navBook");
   check(Boolean(bookId),'resume-existing-public-book');
   await openKnownBook(page,bookId);
   // Opening a populated Book already restores its manuscript. A second section click
   // races that mount and can destroy the editor whose leave guard navigation is awaiting.
   await ready(page,`document.querySelector('[data-screen=editor] [data-book-id="${bookId}"] [data-testid=manuscript-editor]')`,'resume-book-manuscript');
   await ready(page,"document.querySelector('[aria-label^=跳转到尾注]')&&document.querySelector('.manuscript-source-table td')",'resume-current-source-objects');
  }else{
  if(expectedChannel==='windows-installer'){
   check(await page.evaluate(`window.ai7.getBookOverview({bookId:${JSON.stringify(report.priorBook?.bookId)},historyCursor:null}).then(v=>v.manuscriptState.state==='populated')`),'prior-book-survives-upgrade');
   check(await page.evaluate(`window.ai7.inspectDataVersion().then(v=>v.schemaRevision===107&&v.history.some(h=>h.softwareVersion==='0.4.1')&&v.history.some(h=>h.softwareVersion==='0.5.0'))`),'upgrade-history-and-schema');
  }
  // The application presents the real six channel choices; no synthetic credential is installed.
  await select(page,'#app-sidebar [data-nav-settings]');await ready(page,"document.querySelector('[data-screen=settings]')",'settings');
  await click(page,'模型服务');await ready(page,"document.querySelector('.model-service-flow')",'models');
  check(await page.evaluate(`(()=>{const labels=[...document.querySelectorAll('[data-model-channel]')].map(n=>n.textContent);return ['OpenAI','Claude','Gemini','DeepSeek','OpenCode Go'].every(name=>labels.some(label=>label.includes(name)))})()`),expectedChannel+'-model-channels');

  await select(page,'input[name=model-service-flow-channel][value=opencode-go]');
  await ready(page,"document.querySelector('[data-flow-channel=opencode-go]')",'go-channel-selected');
  at(expectedChannel+'-live-model-discovery');
  await select(page,'[data-action=refresh-model-list]');
  await ready(page,"document.querySelector('[data-action=refresh-model-list]')?.disabled===false",'model-refresh-finished');
  const catalogueDb=new DatabaseSync(join(expectedDataRoot,'store','ai7.sqlite'),{readOnly:true});
  let accountModels;try{accountModels=JSON.parse(catalogueDb.prepare("SELECT cached_models FROM model_service_connections WHERE connection_id='main-editorial-opencode-go'").get().cached_models);}finally{catalogueDb.close();}
  check(accountModels.length>0,expectedChannel+'-account-model-list');report.accountDiscovery??=[];report.accountDiscovery.push({channel:expectedChannel,count:accountModels.length});
  await select(page,'[data-model-choice="deepseek-v4.1-flash"]');
  await select(page,'.model-service-flow [data-action=select-main-role-model]');
  await ready(page,"document.querySelector('.model-service-flow [data-action=select-fast-role-model]')?.disabled===false",'main-role-saved');
  await select(page,'.model-service-flow [data-action=select-fast-role-model]');
  await ready(page,"document.querySelector('.model-service-flow [data-action=select-main-role-model]')?.disabled===false",'fast-role-saved');
  check(await page.evaluate(`window.ai7.getModelServiceSettings().then(s=>['main-editorial','fast-interaction'].every(role=>s.roles.some(r=>r.roleId===role&&r.binding?.modelId==='deepseek-v4.1-flash')))`),expectedChannel+'-independent-role-bindings');
  const alternate=accountModels.find(m=>m.modelId!=='deepseek-v4.1-flash')?.modelId;
  if(alternate){
   await select(page,`[data-model-choice=${JSON.stringify(alternate)}]`);await select(page,'.model-service-flow [data-action=select-fast-role-model]');
   await ready(page,`window.ai7.getModelServiceSettings().then(s=>s.roles.find(r=>r.roleId==='fast-interaction')?.binding?.modelId===${JSON.stringify(alternate)}&&s.roles.find(r=>r.roleId==='main-editorial')?.binding?.modelId==='deepseek-v4.1-flash')`,'roles-independent');
   check(true,expectedChannel+'-distinct-role-selections');
  }

  at(expectedChannel+'-live-search-probe');
  const probeUi=async(backend)=>{
   check(await page.evaluate(`(()=>{const root=document.querySelector('[data-search-backend="${backend}"]');const button=[...root.querySelectorAll('button')].find(n=>n.textContent==='测试检索');if(!button||button.disabled)return false;button.click();return true})()`),expectedChannel+'-'+backend+'-probe-start');
   await ready(page,`(()=>{const root=document.querySelector('[data-search-backend="${backend}"]');return document.querySelector('[data-search-probe="${backend}"] p')&&[...root.querySelectorAll('button')].some(n=>n.textContent==='测试检索'&&!n.disabled)})()`,'search-probe-finished');
   const line=await page.evaluate(`document.querySelector('[data-search-probe="${backend}"] p').textContent`);
   const result={channel:expectedChannel,backend,reachable:line.startsWith('可达'),statusLine:line};report.searchProbes??=[];report.searchProbes.push(result);return result.reachable;
  };
  const braveReady=await probeUi('search-brave');
  const bochaReady=await probeUi('search-bochaai');
  check(braveReady||bochaReady,expectedChannel+'-live-search-available');
  if(!braveReady&&bochaReady){
   await select(page,'[data-search-backend=search-bochaai] [data-action=clear-search-fallback]');
   await ready(page,"window.ai7.getModelServiceSettings().then(v=>v.searchBackends.fallbackBackendId===null)",'fallback-cleared');
   check(await page.evaluate(`(()=>{const n=[...document.querySelector('[data-search-backend=search-bochaai]').querySelectorAll('button')].find(n=>n.textContent==='选择后端');if(!n||n.disabled)return false;n.click();return true})()`),'choose-reachable-search');
   await ready(page,"document.querySelector('[data-search-backend=search-bochaai]')?.dataset.selected==='true'",'reachable-search-selected');
  }

  check(await page.evaluate(`(()=>{const root=document.querySelector('[data-screen=model-service-settings]')??document.body;return root.textContent.includes('联网检索')&&root.textContent.includes('测试检索')})()`),expectedChannel+'-search-settings');
  await select(page,'#app-sidebar [data-nav-destination=global-agent]');await ready(page,"document.querySelector('[data-global-agent-question-form]')",'global-agent');
  check(await page.evaluate(`(()=>{const node=document.querySelector('[data-global-agent=destination]');return getComputedStyle(node).display==='grid'&&document.querySelector('[data-global-agent-question-form] button[type=submit]')?.textContent==='发送问题'&&document.querySelector('#task-drawer')?.hidden===true})()`),expectedChannel+'-global-agent-layout');
  check(await page.evaluate(`(()=>{const menu=document.querySelector('.compact-model-selector');if(!menu||menu.hidden)return false;menu.open=true;const radio=menu.querySelector('input[value="opencode-go/deepseek-v4.1-flash"]');if(!radio)return false;radio.click();menu.querySelector('[data-action="select-fast-role-model"]').click();return true})()`),expectedChannel+'-compact-fast-switch');
  await ready(page,"window.ai7.getModelServiceSettings().then(s=>s.roles.find(r=>r.roleId==='fast-interaction')?.binding?.modelId==='deepseek-v4.1-flash')",'compact-fast-persisted');

  await select(page,'#app-sidebar [data-nav-destination=library]');await ready(page,"document.querySelector('[data-screen=landing]')",'library-return');
  at(expectedChannel+'-native-import');
  await click(page,'导入稿件');native(executable,['-FileName',input]);
  await ready(page,"document.querySelector('[data-screen=target]')",'import-target');
  await select(page,'input[data-import-target-choice=new-book]');await select(page,'input[aria-label="作为首份稿件导入"]');
  const importMode=expectedChannel==='windows-installer'?'suggestions':'accepted-baseline';
  await select(page,`input[data-word-import-mode=${importMode}]`);
  if(importMode==='accepted-baseline')await select(page,'[data-word-accepted-baseline-confirmation]');
  report.importModes??=[];report.importModes.push(importMode);
  check(await page.evaluate(`(()=>{const node=document.querySelector('#book-title');node.value='Beta package compatibility';node.dispatchEvent(new Event('input',{bubbles:true}));return true})()`),'book-title');
  await click(page,'确认书名并复核');await ready(page,"document.querySelector('[data-screen=review]')",'import-review');
  check(await boolean(page,"!document.body.textContent.includes('获取并安装（保持停用）')"),expectedChannel+'-no-workspace-ceremony');
  await click(page,'新建图书并导入稿件');await ready(page,"document.querySelector('[data-screen=imported]')",'import-completed');
  await ready(page,"document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'",'import-acknowledged');
  await click(page,'打开稿件');await ready(page,"document.querySelector('[data-testid=manuscript-editor]')",'manuscript-ready');
  check(await boolean(page,"document.querySelector('.editor-shell')"),expectedChannel+'-manuscript');
  await ready(page,"document.querySelector('[aria-label^=跳转到尾注]')",'endnote-structure-ready');
  check(true,expectedChannel+'-endnote-structure');

  await ready(page,"document.querySelector('.manuscript-source-table td')&&[...document.querySelectorAll('.manuscript-source-image img')].some(n=>n.naturalWidth>0)",'source-table-image-ready');
  check(true,expectedChannel+'-source-table-image');
  bookId=await page.evaluate('window.ai7.inspectReviewWorkspace().then(v=>v.bookId)');

  at(expectedChannel+'-paragraph-editing-and-contextual-dialogue');
  const beforeParagraphs=await page.evaluate("[...document.querySelectorAll('[data-testid=manuscript-editor] > [data-block-id]')].map(n=>n.textContent)");
  check(await page.evaluate(`(()=>{const editor=document.querySelector('[data-testid=manuscript-editor]');const p=[...editor.querySelectorAll('p[data-block-id]')].find(n=>n.textContent.length>30&&!n.querySelector('.editorial-mark'));if(!p)return false;editor.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);return true})()`),'paragraph-caret');
  await new Promise(r=>setTimeout(r,300));
  const key=async(name,code)=>{await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code,...(name==='Enter'?{text:'\r'}:{})});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code});};
  await key('Enter',13);await key('Enter',13);
  await ready(page,`document.querySelectorAll('[data-testid=manuscript-editor] > [data-block-id]').length===${beforeParagraphs.length+2}`,'rapid-enter-two-paragraphs');
  await key('Backspace',8);await key('Backspace',8);
  await ready(page,`JSON.stringify([...document.querySelectorAll('[data-testid=manuscript-editor] > [data-block-id]')].map(n=>n.textContent))===${JSON.stringify(JSON.stringify(beforeParagraphs))}`,'backspace-merge-restores-text');
  check(true,expectedChannel+'-rapid-enter-and-merge');
  const headingCount=await page.evaluate("document.querySelectorAll('[data-testid=manuscript-editor] > :is(h2,h3,h4,h5,h6)[data-block-id]').length");
  await fill(page,'select[aria-label=段落样式]','heading-2');await ready(page,`document.querySelectorAll('[data-testid=manuscript-editor] > :is(h2,h3,h4,h5,h6)[data-block-id]').length===${headingCount+1}`,'heading-style-saved');
  await fill(page,'select[aria-label=段落样式]','paragraph');await ready(page,`document.querySelectorAll('[data-testid=manuscript-editor] > :is(h2,h3,h4,h5,h6)[data-block-id]').length===${headingCount}`,'paragraph-style-restored');
  check(true,expectedChannel+'-heading-style-edit');
  await ready(page,"document.querySelector('#persistence-status')?.dataset.tone!=='busy'",'editor-persistence-idle');
  const selectionBlockId=await page.evaluate(`(()=>{const editor=document.querySelector('[data-testid=manuscript-editor]');const p=[...editor.querySelectorAll('p[data-block-id]')].find(n=>n.firstChild?.nodeType===3&&n.firstChild.length>30&&!n.querySelector('.editorial-mark'));if(!p)return null;editor.focus();const r=document.createRange();r.setStart(p.firstChild,2);r.setEnd(p.firstChild,22);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));return p.dataset.blockId})()`);
  check(Boolean(selectionBlockId),'contextual-selection');
  await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  check(await page.evaluate(`(()=>{const p=[...document.querySelectorAll('[data-testid=manuscript-editor] p[data-block-id]')].find(n=>n.dataset.blockId===${JSON.stringify(selectionBlockId)});if(!p||getSelection().toString().length!==20)return false;const rect=p.getBoundingClientRect();const init={bubbles:true,cancelable:true,button:2,buttons:2,clientX:rect.x+20,clientY:rect.y+10};p.dispatchEvent(new MouseEvent('mousedown',init));p.dispatchEvent(new MouseEvent('mouseup',{...init,buttons:0}));p.dispatchEvent(new MouseEvent('contextmenu',{...init,buttons:0}));return true})()`),'contextual-right-click');
  report.contextMenu=await page.evaluate(`(()=>{const n=document.querySelector('[data-mark-action=ask-on-selection]');return {disabled:n?.disabled??null,reason:n?.title??null,selectedCodeUnits:getSelection()?.toString().length??0}})()`);
  await ready(page,"document.querySelector('[data-mark-action=ask-on-selection]')?.disabled===false",'context-question-enabled');await select(page,'[data-mark-action=ask-on-selection]');
  await ready(page,"document.querySelector('[data-mark-composer=ask-about-selection]')",'contextual-question');
  await fill(page,'[data-mark-field=question]','请用三句话说明这段公开样书的叙述语气，引用所选文字作为依据，不改写正文。');await select(page,'[data-mark-composer=ask-about-selection] [data-mark-action=submit]');
  await ready(page,"document.querySelector('#task-drawer .dialogue')?.dataset.dialogueLatestState==='completed'",'contextual-answer',300000);
  const dialogueId=await page.evaluate("document.querySelector('#task-drawer .dialogue').dataset.dialogueId");
  const beforeFollow=await page.evaluate(`window.ai7.inspectDialogue({dialogueId:${JSON.stringify(dialogueId)},afterFragment:0}).then(v=>({count:v.attempts.length,fragments:v.attempts.at(-1)?.fragments.length}))`);
  check(beforeFollow.fragments>0,expectedChannel+'-contextual-streamed-fragments');
  await fill(page,'#task-drawer [data-dialogue-follow-up]','请补充说明其中一处措辞如何支持上述判断，不改变原文。');await select(page,'#task-drawer [data-dialogue-action=follow-up]');
  await ready(page,`window.ai7.inspectDialogue({dialogueId:${JSON.stringify(dialogueId)},afterFragment:0}).then(v=>v.attempts.length===${beforeFollow.count+1}&&v.attempts.at(-1)?.state==='completed'&&v.attempts.at(-1)?.fragments.length>0)`,'contextual-followup',300000);
  check(true,expectedChannel+'-right-drawer-followup');await select(page,'#task-drawer [data-task-drawer-control=close]');
  // Baseline and full review are started through their ordinary product controls.
  at(expectedChannel+'-baseline-analysis');
  await select(page,'#app-sidebar [data-nav-book-section=analysis]');
  await ready(page,"document.querySelector('.baseline-analysis-card [data-analysis-action=start]:not(:disabled)')",'baseline-start-available');
  await select(page,'.baseline-analysis-card [data-analysis-action=start]');
  await ready(page,"window.ai7.inspectBaselineAnalysis().then(v=>v.resultSetRevision!==null)",'baseline-result',900000);
  check(await page.evaluate("window.ai7.inspectBaselineAnalysis().then(v=>v.resultSetRevision?.coverage?.state==='complete')"),expectedChannel+'-baseline-complete');
  }
  if(expectedChannel==='windows-portable'&&report.portableCarry?.restored)await portableLiveOnce(page,bookId);
  at(expectedChannel+'-full-review');
  const retainedReview=resumePrefix?report.completedReview?.review:null;
  if(retainedReview){
   // A projection-only successor may inspect this valid historical Run without
   // authorizing the original paid requests again. Keep its original binary identity.
   report.retainedReviewEvidence=report.completedReview;
   await openRetainedReview(page,retainedReview.runId);
   await ready(page,`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(retainedReview.runId)}}).then(v=>v.run&&['settled','scope-changed'].includes(v.run.state)&&v.run.categories.every(c=>c.state==='settled'))`,'retained-completed-review');
   const expectedTasks=retainedReview.memberCoverage.filter(c=>!c.local).map(c=>({categoryId:c.categoryId,taskIntentId:c.taskIntentId}));
   check(await page.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(retainedReview.runId)}}).then(v=>${JSON.stringify(expectedTasks)}.every(e=>v.run.categories.some(c=>c.categoryId===e.categoryId&&c.taskIntentId===e.taskIntentId)))`),'retained-review-task-identities');
  }else if(resumePrefix&&(resume.activeReview||resume.failedStage==='windows-installer-full-review'&&resume.checks.includes('select-dialog.review-sheet [data-review-action=start]'))){
   const db=new DatabaseSync(join(expectedDataRoot,'store','ai7.sqlite'),{readOnly:true});
   let kept;
   try{const row=resume.activeReview?db.prepare('SELECT r.canonical_json FROM review_runs r JOIN review_run_authorizations a USING(review_run_id) WHERE r.book_id=? AND r.review_run_id=?').get(bookId,resume.activeReview.runId):db.prepare('SELECT r.canonical_json FROM review_runs r JOIN review_run_authorizations a USING(review_run_id) WHERE r.book_id=? ORDER BY r.ordinal DESC LIMIT 1').get(bookId);kept=row?JSON.parse(row.canonical_json):null;}finally{db.close();}
   check(Boolean(kept)&&(!resume.activeReview||kept.reviewRunId===resume.activeReview.runId),'resume-existing-authorized-review');
   report.activeReview=resume.activeReview??{runId:kept.reviewRunId,buildIdentity:resume.buildIdentity,runnerHead:resume.runnerHead,tasks:kept.categories.filter(c=>c.task).map(c=>({categoryId:c.categoryId,taskIntentId:c.task.taskIntentId}))};checkpoint();
   await openRetainedReview(page,kept.reviewRunId);
   if(await page.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(kept.reviewRunId)}}).then(v=>v.run.canContinue)`))await select(page,'[data-review-action=continue]');
   await followReview(page,expectedDataRoot,kept.reviewRunId);
  }else{
  check(!RETAINED_REVIEW_ONLY,'retained-review-receipt-required');
  await select(page,'#app-sidebar [data-nav-destination=knowledge]');
  await ready(page,"document.querySelector('[data-screen=knowledge-base]')",'knowledge-destination');
  await click(page,'工序与规则');
  await ready(page,"document.querySelector('.procedure-library [data-procedure-id=\"ai7-procedure/full-review\"]')",'procedure-library');
  check(await page.evaluate(`(()=>{const root=document.querySelector('[data-procedure-id="ai7-procedure/full-review"]');const n=[...root.querySelectorAll('button')].find(n=>n.textContent.startsWith('运行此工序'));if(!n||n.disabled)return false;n.click();return true})()`),'full-review-choose');
  await ready(page,"document.querySelector('.procedure-book-chooser select[data-procedure-field=book]')",'procedure-book-chooser');
  // The newest import is selected by the actual chooser option; no synthetic run is inserted.
  const importedBookId=await page.evaluate("[...document.querySelector('.procedure-book-chooser select[data-procedure-field=book]').options].find(o=>o.textContent.includes('Beta package compatibility'))?.value");
  check(Boolean(importedBookId),'imported-book-choice');
  await fill(page,'.procedure-book-chooser select[data-procedure-field=book]',importedBookId);await click(page,'打开任务');
  await ready(page,"document.querySelector('dialog.review-sheet[open]')",'full-review-sheet');
  check(await boolean(page,"document.querySelector('[data-procedure-definition=\"ai7-procedure/full-review@1\"]')"),'full-review-pinned');
  const previousReviewRunId=await page.evaluate('window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(v=>v.run?.reviewRunId??null)');
  await select(page,'input[name=review-scope][value=whole]');await select(page,'dialog.review-sheet [data-review-action=start]');
  await ready(page,`window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(v=>v.run&&v.run.reviewRunId!==${JSON.stringify(previousReviewRunId)})`,'new-full-review-created');
  report.activeReview=await page.evaluate('window.ai7.inspectReviewWorkspace({reviewRunId:null}).then(v=>({runId:v.run.reviewRunId,tasks:v.run.categories.filter(c=>c.taskIntentId).map(c=>({categoryId:c.categoryId,taskIntentId:c.taskIntentId}))}))');
  report.activeReview.buildIdentity=report.buildIdentity;report.activeReview.runnerHead=report.runnerHead;checkpoint();
  await followReview(page,expectedDataRoot,report.activeReview.runId);
  }
  const review=await page.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(retainedReview?.runId??report.activeReview?.runId??null)}}).then(v=>({runId:v.run?.reviewRunId,state:v.run?.state,categories:v.run?.categories.map(c=>({id:c.categoryId,state:c.state,detail:c.detail})),findings:v.run?.findings.length}))`);
  report.reviews??=[];report.reviews.push({channel:expectedChannel,...review});
  check(review.categories?.length===5&&review.categories.every(c=>c.state==='settled'),expectedChannel+'-full-review-five-members');

  const coverageDb=new DatabaseSync(join(expectedDataRoot,'store','ai7.sqlite'),{readOnly:true});
  let memberCoverage;
  try{
   const snapshot=JSON.parse(coverageDb.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id=?').get(review.runId).canonical_json);
   memberCoverage=snapshot.categories.map(c=>{
    if(!c.task)return {categoryId:c.categoryId,local:true};
    const row=coverageDb.prepare('SELECT canonical_json FROM analysis_result_set_revisions WHERE task_intent_id=? ORDER BY created_at DESC,ordinal DESC LIMIT 1').get(c.task.taskIntentId);
    const revision=row?JSON.parse(row.canonical_json):null;
    const outcome=coverageDb.prepare('SELECT run_record_id,classification FROM analysis_task_outcomes WHERE task_intent_id=?').get(c.task.taskIntentId);
    const synthesis=revision?.crossChapterSynthesis;
    let claimProgress=null;
    if(c.categoryId==='factual-review'&&outcome){
     const membership=coverageDb.prepare("SELECT json_array_length(canonical_json,'$.claims') total,json_array_length(canonical_json,'$.excluded') excluded FROM factual_claim_ledgers WHERE run_record_id=?").get(outcome.run_record_id);
     if(membership){
      const rounds=coverageDb.prepare("SELECT json_extract(e.canonical_json,'$.state') state FROM factual_claim_sessions s LEFT JOIN factual_claim_events e ON e.session_id=s.session_id AND e.kind='verification-result' AND e.sequence=(SELECT MAX(x.sequence) FROM factual_claim_events x WHERE x.session_id=s.session_id AND x.kind='verification-result') WHERE s.run_record_id=? AND s.stage='web-verification'").all(outcome.run_record_id);
      claimProgress={...membership,closed:rounds.filter(r=>r.state==='closed').length,unknown:rounds.filter(r=>r.state==='unknown').length,unfinished:rounds.filter(r=>!['closed','unknown'].includes(r.state)).length,notStarted:membership.total-rounds.length};
     }
    }
    return {categoryId:c.categoryId,taskIntentId:c.task.taskIntentId,revisionId:revision?.revisionId,executionState:outcome?.classification??null,coverage:revision?.coverage??null,gaps:revision?.gaps.map(g=>g.code)??['missing-result'],claimProgress,reducerClosure:revision?.reducerClosure?{state:revision.reducerClosure.state,stages:revision.reducerClosure.stages}:null,synthesis:synthesis?{state:synthesis.state,code:synthesis.code??null,requestDigest:synthesis.requestDigest??null}:null};
   });
  }finally{coverageDb.close();}
  report.reviews.at(-1).memberCoverage=memberCoverage;
  check(memberCoverage.every(c=>c.local||(c.coverage?.state==='complete'&&c.gaps.length===0)),expectedChannel+'-full-review-complete-coverage');
  if(expectedChannel==='windows-installer')report.completedReview=retainedReview?resume.completedReview:{buildIdentity:report.activeReview?.buildIdentity??report.buildIdentity,runnerHead:report.activeReview?.runnerHead??report.runnerHead,review:report.reviews.at(-1),checks:[...report.checks],observedBy:{buildIdentity:report.buildIdentity,runnerHead:report.runnerHead}};
  const executionGaps=memberCoverage.filter(c=>!c.local&&(c.executionState!=='completed'||c.synthesis?.state==='gap'||c.claimProgress&&c.claimProgress.closed<c.claimProgress.total));
  report.executionGaps??=[];report.executionGaps.push(...executionGaps.map(c=>({channel:expectedChannel,...c})));
  for(const gap of executionGaps){
   const status=gap.claimProgress?`已完成核查 ${gap.claimProgress.closed}/${gap.claimProgress.total} 条断言`:gap.synthesis?.code==='outcome-unknown'?'跨章汇总结果待确认':gap.synthesis?.state==='gap'?'跨章检查尚未完成':'尚未完成';
   await ready(page,`document.querySelector('.review-progress [data-review-category="${gap.categoryId}"] .review-progress-detail')?.textContent.includes(${JSON.stringify(status)})`,'retained-stage-gap-disclosed');
  }
  if(executionGaps.length)report.limitations.push('Completed unit findings remain usable; retained synthesis or execution gaps are disclosed and unknown paid outcomes are not resent.');
  if(RETAINED_REVIEW_ONLY){at('retained-review-disclosure');check(true,'historical-review-read-without-model-enrollment-or-authorization');return;}
  at(expectedChannel+'-retained-factual-evidence');
  const visibleFactLabels=await page.evaluate("[...document.querySelectorAll('.fact-lens-row')].map(n=>({outcome:n.dataset.outcome,legacyStateLines:[...n.querySelectorAll('.review-finding-state')].map(s=>s.textContent)}))");
  report.factualCardLabels??=[];report.factualCardLabels.push({channel:expectedChannel,reviewRunId:review.runId,rows:visibleFactLabels});checkpoint();
  check(visibleFactLabels.length>0&&!visibleFactLabels.some(r=>r.legacyStateLines.includes('未外部复核')&&r.outcome!=='待核查'),'factual-card-verdict-consistent');
  const factualTaskIntentId=memberCoverage.find(c=>c.categoryId==='factual-review')?.taskIntentId;
  check(Boolean(factualTaskIntentId),'current-factual-task');
  const factualSources=await page.evaluate(`(async()=>{const records=[];let after=null;for(let n=0;n<20;n++){const v=await window.ai7.inspectResearchEvidence({bookId:${JSON.stringify(bookId)},taskIntentId:${JSON.stringify(factualTaskIntentId)},after});records.push(...v.records);if(v.next==null)break;after=v.next;}const translated=records.find(r=>r.captureState==='full-text'&&r.translation?.state==='translated'&&r.passage&&(r.passage.match(/\\p{L}+/gu)?.length??0)>=5&&r.translation.text.trim()!==r.passage.trim());return {taskIntentId:${JSON.stringify(factualTaskIntentId)},count:records.length,translated:records.filter(r=>r.translation?.state==='translated').length,captured:records.filter(r=>r.captureState==='full-text').length,target:translated?{evidenceId:translated.evidenceId,url:translated.url,contentSha256:translated.contentSha256,attribution:translated.translation.attribution}:null}})()`);
  check(factualSources.count>0&&factualSources.captured>0,expectedChannel+'-retained-live-sources');
  report.factualEvidence??=[];report.factualEvidence.push({channel:expectedChannel,...factualSources});
  if(factualSources.target){
  const translatedSelector=`article[data-evidence-id=${JSON.stringify(factualSources.target.evidenceId)}] .research-evidence-translated blockquote`;
  await select(page,'#app-sidebar [data-nav-book-section=sources]');await ready(page,"document.querySelector('.research-evidence[data-evidence-count]')",'sources-surface-loaded');
  for(let n=0;n<20&&!await boolean(page,`document.querySelector(${JSON.stringify(translatedSelector)})?.textContent.length>0`)&&await boolean(page,"document.querySelector('[data-evidence-action=more]')");n++){const before=await page.evaluate("Number(document.querySelector('.research-evidence').dataset.evidenceCount)");await select(page,'[data-evidence-action=more]');await ready(page,`Number(document.querySelector('.research-evidence')?.dataset.evidenceCount)>${before}`,'source-page-loaded');}
  check(await boolean(page,`document.querySelector(${JSON.stringify(translatedSelector)})?.textContent.length>0`),expectedChannel+'-foreign-source-translation-visible');
  await select(page,'#app-sidebar [data-nav-book-section=review]');await ready(page,"document.querySelector('.review-workspace-card')",'review-after-evidence');
  }else report.limitations.push(`${expectedChannel}: original FullReview retained no translated foreign passage; a separately labelled controlled sample1 edit tests the current translation UI without rerunning that FullReview.`);
  report.findingDispositions??=[];
  let disposition=report.findingDispositions.find(d=>d.channel===expectedChannel&&d.reviewRunId===review.runId);
  if(!disposition){disposition={channel:expectedChannel,reviewRunId:review.runId,accepted:null,rejected:null};report.findingDispositions.push(disposition);}
  const priorAccept=resumePrefix&&resume?.checks.includes(expectedChannel+'-finding-adopted')?resume.checks.map(c=>/^select-article\[data-finding-id="(rvf_[a-f0-9]+)"\] \[data-review-action=accept-apply\]$/.exec(c)?.[1]).filter(Boolean).at(-1):null;
  if(!disposition.accepted&&priorAccept){
   check(await page.evaluate(`window.ai7.inspectReviewWorkspace({reviewRunId:${JSON.stringify(review.runId)}}).then(v=>v.run.findings.some(f=>f.findingId===${JSON.stringify(priorAccept)}&&f.status==='handled'))`),'resume-prior-adoption-committed');
   disposition.accepted=priorAccept;disposition.recoveredFrom=resume.runnerHead;checkpoint();
  }
  if(!disposition.accepted){
  const applicable=await page.evaluate("[...document.querySelectorAll('[data-review-action=accept-apply]')].find(n=>!n.disabled)?.closest('article')?.dataset.findingId??null");
  check(Boolean(applicable),expectedChannel+'-applicable-card-required');
  if(applicable){await select(page,`article[data-finding-id=${JSON.stringify(applicable)}] [data-review-action=accept-apply]`);await ready(page,`document.querySelector('article[data-finding-id=${JSON.stringify(applicable)}]')?.dataset.status==='handled'`,'finding-adopted');check(true,expectedChannel+'-finding-adopted');disposition.accepted=applicable;disposition.acceptedAt=new Date().toISOString();checkpoint();}
  }
  if(!disposition.rejected){
  await ready(page,"[...document.querySelectorAll('[data-review-action=ignore]')].some(n=>!n.disabled)",'reject-action-settled');
  const reject=await page.evaluate("[...document.querySelectorAll('[data-review-action=ignore]')].find(n=>!n.disabled)?.closest('article')?.dataset.findingId??null");
  check(Boolean(reject),expectedChannel+'-finding-to-reject');
  await select(page,`article[data-finding-id=${JSON.stringify(reject)}] [data-review-action=ignore]`);await fill(page,'[data-review-field=ignore-reason]','Beta 人工复核：该项不符合本次修改目的。');await select(page,'[data-review-action=ignore-confirm]');
  await ready(page,`document.querySelector('article[data-finding-id=${JSON.stringify(reject)}]')?.dataset.status==='ignored'`,'finding-rejected');
  disposition.rejected=reject;disposition.rejectedAt=new Date().toISOString();checkpoint();
  }
  if(!factualSources.target)await controlledSourceTranslation(page,bookId,expectedDataRoot,expectedChannel,input,executable);
  at(expectedChannel+'-agent-workspace');
  report.agent??=[];report.agentAttempts??=[];
  if(!report.agent.some(a=>a.channel===expectedChannel&&a.twoRoundsComplete)){
  check(!report.agentAttempts.some(a=>a.channel===expectedChannel),'agent-prior-attempt-needs-lineage-reconciliation');
  const agentAttempt={channel:expectedChannel,intendedAt:new Date().toISOString()};report.agentAttempts.push(agentAttempt);checkpoint();
  await select(page,'#app-sidebar [data-nav-agent-workspace=row]');await ready(page,"document.querySelector('[data-agent-workspace-block]')",'agent-workspace');
  check(await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('p[data-agent-workspace-block]')];const controlled=rows.find(n=>n.textContent.includes('Beta 测试者加入的独立纠错样例'));const start=controlled?.previousElementSibling??rows.find(n=>n.firstChild?.nodeType===3&&n.nextElementSibling?.matches('p[data-agent-workspace-block]'));if(!start)return false;const end=controlled??start.nextElementSibling;const r=document.createRange();r.setStart(start.firstChild,0);r.setEnd(end.firstChild,end.firstChild.length);const s=getSelection();s.removeAllRanges();s.addRange(r);end.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return document.querySelector('.agent-workspace-quote')?.textContent.includes(String.fromCharCode(10));})()`),expectedChannel+'-cross-paragraph-selection');
  await fill(page,'[data-agent-workspace-field=instruction]','请仅提出一条必要的原文锚点修改：若所选测试样例含“的的”重复字，只删除一个“的”；不要改变英文事实或其他措辞。');
  await select(page,'[data-agent-workspace-action=propose]');
  await ready(page,"document.querySelector('.agent-workspace-proposal')?.dataset.agentWorkspaceProposal==='ready'",'agent-proposal-ready',300000);
  check(await boolean(page,"!document.querySelector('[data-agent-workspace-field=instruction]')?.disabled"),expectedChannel+'-agent-next-round');
  const agent=await page.evaluate("window.ai7.inspectAgentWorkspace().then(v=>({dialogueId:v.proposal?.dialogueId,count:v.proposal?.candidates.length}))");
  const firstProposal=await page.evaluate('window.ai7.inspectAgentWorkspace().then(v=>v.proposal?.proposalSetId)');
  agentAttempt.first={dialogueId:agent.dialogueId,proposalSetId:firstProposal,completedAt:new Date().toISOString()};checkpoint();
  await fill(page,'[data-agent-workspace-field=instruction]','请复核上一轮，只保留删除测试样例中一个重复“的”的那一条候选；不要提出风格修改或改变英文事实。');await select(page,'[data-agent-workspace-action=propose]');
  await ready(page,`window.ai7.inspectAgentWorkspace().then(v=>v.proposal?.state==='ready'&&v.proposal.proposalSetId!==${JSON.stringify(firstProposal)})`,'agent-second-round',300000);check(true,expectedChannel+'-agent-refinement-round');
  agent.count=await page.evaluate('window.ai7.inspectAgentWorkspace().then(v=>v.proposal?.candidates.length??0)');
  agentAttempt.second={...await page.evaluate('window.ai7.inspectAgentWorkspace().then(v=>({proposalSetId:v.proposal?.proposalSetId,dialogueId:v.proposal?.dialogueId}))'),completedAt:new Date().toISOString()};checkpoint();
  if(agent.count===1){await select(page,'[data-agent-workspace-action=promote]');await ready(page,"document.querySelector('[data-agent-workspace-promoted]')?.dataset.agentWorkspacePromoted==='1'",'agent-single-promoted');agent.singleCandidatePromoted=true;}
  else{agent.singleCandidatePromoted=false;report.limitations.push(`${expectedChannel}: Agent returned ${agent.count} candidates; single-candidate promotion remains unmeasured, with no answer reroll.`);}
  report.agent.push({channel:expectedChannel,...agent,twoRoundsComplete:true});checkpoint();
  }
  const recordedAgent=report.agent.find(a=>a.channel===expectedChannel&&a.twoRoundsComplete);
  const heldAgent=report.agentAttempts.find(a=>a.channel===expectedChannel);
  if(!heldAgent.second.dialogueId){
   const db=new DatabaseSync(join(expectedDataRoot,'store','ai7.sqlite'),{readOnly:true});
   try{
    const rows=db.prepare("SELECT dialogue_id,canonical_json,sha256 FROM dialogue_tasks WHERE book_id=? AND json_extract(canonical_json,'$.origin')='agent-workspace' AND asked_at>=? AND asked_at<=? ORDER BY asked_at").all(bookId,heldAgent.intendedAt,heldAgent.second.completedAt);
    check(rows.length===2&&rows[0].dialogue_id===heldAgent.first.dialogueId&&rows.every(r=>createHash('sha256').update(r.canonical_json).digest('hex')===r.sha256),'agent-exact-two-round-lineage');
    heldAgent.second.dialogueId=rows[1].dialogue_id;heldAgent.lineageRecoveredFrom='two exact persisted workspace dialogue tasks inside original observed round window';checkpoint();
   }finally{db.close();}
  }
  const agentIds=[heldAgent.first.dialogueId,heldAgent.second.dialogueId];
  const agentDialogue=await page.evaluate(`Promise.all(${JSON.stringify(agentIds)}.map(async dialogueId=>{const v=await window.ai7.inspectDialogue({dialogueId,afterFragment:0});return {dialogueId,attempts:v.attempts.map(a=>({attemptId:a.attemptId,state:a.state,streamFragmentTotal:a.fragmentTotal,publicFragments:a.fragments.length}))};}))`);
  recordedAgent.attempts=agentDialogue;recordedAgent.streamDisclosure='Workspace projection withholds raw proposal JSON fragments but retains its verified stream fragment total.';checkpoint();
  check(new Set(agentIds).size===2&&agentDialogue.every(d=>d.attempts.length>0&&d.attempts.at(-1).state==='completed'&&d.attempts.at(-1).streamFragmentTotal>0),expectedChannel+'-agent-two-streamed-rounds');
  at(expectedChannel+'-global-agent-live');
  await select(page,'#app-sidebar [data-nav-destination=global-agent]');await ready(page,"document.querySelector('[data-global-agent-question-form]')",'global-ready');
  report.globalTurns??=[];report.globalAttempts??=[];
  if(!report.globalTurns.some(t=>t.channel===expectedChannel)){
  if(resumePrefix&&report.globalAttempts.some(t=>t.channel===expectedChannel&&t.beforeDialogues===undefined)&&!resume.checks.includes('select-[data-global-agent-question-form] button[type=submit]')){
   check(await page.evaluate('window.ai7.inspectGlobalAgent().then(v=>v.history.length===0)'),'global-prior-unsent-history-empty');
   report.closedUnsentAttempts??=[];report.closedUnsentAttempts.push(...report.globalAttempts.filter(t=>t.channel===expectedChannel).map(t=>({...t,reason:'closed before scope selection or any send; actual global history empty'})));
   report.globalAttempts=report.globalAttempts.filter(t=>t.channel!==expectedChannel);checkpoint();
  }
  check(!report.globalAttempts.some(t=>t.channel===expectedChannel),'global-prior-attempt-needs-lineage-reconciliation');
  await ready(page,"document.querySelectorAll('[data-global-agent-scope-book]').length>=2",'global-book-scope-loaded');
  check(await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('[data-global-agent-scope-book]')];for(const n of rows){if(!n.checked)n.click();}return rows.length>=2})()`),'global-book-scope');
  await fill(page,'[data-global-agent-question]','请使用跨书检索工具 retrieve 查找本次选入公开样书的共同内容，再使用 exact_fetch 读取至少一处精确原文；据此简短说明证据来自哪本书，不推测没有的内容。');
  const globalBefore=await page.evaluate('window.ai7.inspectGlobalAgent().then(v=>v.history.map(h=>h.dialogueId))');
  report.globalAttempts.push({channel:expectedChannel,beforeDialogues:globalBefore,intendedAt:new Date().toISOString()});checkpoint();
  await select(page,'[data-global-agent-question-form] button[type=submit]');
  await ready(page,"document.querySelector('.global-agent-answer-bubble')?.textContent.length>0&&document.querySelector('[data-global-agent-question-form] button[type=submit]')?.disabled===false",'global-answer',300000);
  const globalTurn=await page.evaluate(`(async()=>{const p=await window.ai7.inspectGlobalAgent();const h=p.history.find(h=>!${JSON.stringify(globalBefore)}.includes(h.dialogueId));if(!h)return {};const v=await window.ai7.inspectGlobalAgentDialogue({dialogueId:h.dialogueId});return {dialogueId:v.dialogueId,state:v.attempts.at(-1)?.state,fragments:v.attempts.at(-1)?.fragments.length,tools:v.toolCalls?.map(c=>({tool:c.tool,outcome:c.outcome}))}})()`);
  check(globalTurn.state==='completed'&&globalTurn.fragments>0&&['retrieve','exact_fetch'].every(t=>globalTurn.tools?.some(c=>c.tool===t&&c.outcome==='returned')),expectedChannel+'-global-real-cross-book-tools');report.globalTurns??=[];report.globalTurns.push({channel:expectedChannel,...globalTurn});
  checkpoint();
  }
  if(expectedChannel==='windows-portable'&&report.portableCarry?.restored){
   const retainedGlobal=report.globalTurns.find(t=>t.channel===expectedChannel);
   const historyIndex=await page.evaluate(`window.ai7.inspectGlobalAgent().then(v=>v.history.findIndex(h=>h.dialogueId===${JSON.stringify(retainedGlobal.dialogueId)}))`);
   check(historyIndex>=0,'portable-restored-global-history');
   await select(page,`.global-agent-history-entry:nth-child(${historyIndex+1})`);
   await ready(page,"document.querySelector('.global-agent-answer-bubble')?.textContent.length>0",'portable-restored-global-answer');
   check(await page.evaluate(`window.ai7.inspectGlobalAgentDialogue({dialogueId:${JSON.stringify(retainedGlobal.dialogueId)}}).then(v=>v.attempts.at(-1)?.state==='completed'&&['retrieve','exact_fetch'].every(t=>v.toolCalls.some(c=>c.tool===t&&c.outcome==='returned')))`),'portable-restored-global-tools');
   const beforeHabits=report.habitAttempts.find(t=>t.channel===expectedChannel).beforeHabits;
   const habitIndex=await page.evaluate(`window.ai7.inspectGlobalAgent().then(v=>v.history.findIndex(h=>!${JSON.stringify(beforeHabits)}.includes(h.dialogueId)))`);
   check(habitIndex>=0,'portable-restored-habits-history');
   await select(page,`.global-agent-history-entry:nth-child(${habitIndex+1})`);
   await ready(page,"document.querySelector('.global-agent-answer-bubble')?.textContent.length>0",'portable-restored-habits-answer');
  }
  // Habits is another real scoped turn, using the product's ordinary button.
  report.habits??=[];report.habitAttempts??=[];
  if(!report.habits.some(t=>t.channel===expectedChannel)){
  check(!report.habitAttempts.some(t=>t.channel===expectedChannel),'habits-prior-attempt-needs-lineage-reconciliation');
  const beforeHabits=await page.evaluate('window.ai7.inspectGlobalAgent().then(v=>v.history.map(h=>h.dialogueId))');
  report.habitAttempts.push({channel:expectedChannel,beforeHabits,intendedAt:new Date().toISOString()});checkpoint();
  await select(page,'[data-global-agent-habits=summary]');
  await ready(page,"document.querySelector('[data-global-agent-question-form] button[type=submit]')?.disabled===false",'habits-answer',300000);
  await ready(page,`(async()=>{const p=await window.ai7.inspectGlobalAgent();for(const h of p.history.filter(h=>!${JSON.stringify(beforeHabits)}.includes(h.dialogueId))){const v=await window.ai7.inspectGlobalAgentDialogue({dialogueId:h.dialogueId});if(v.attempts.at(-1)?.state==='completed'&&v.attempts.at(-1)?.fragments.length>0)return true;}return false;})()`,'new-habits-completed',300000);
  check(true,expectedChannel+'-habits-new-completed-answer');
  report.habits.push({channel:expectedChannel,completedAt:new Date().toISOString()});checkpoint();
  }
  await select(page,'#app-sidebar [data-nav-destination=library]');await ready(page,"document.querySelector('[data-screen=landing]')",'library-after-agents');
  await openKnownBook(page,bookId);
  await ready(page,`document.querySelector('[data-screen=editor] [data-book-id="${bookId}"] [data-testid=manuscript-editor]')`,'return-manuscript-milestone');
  const priorMilestone=await page.evaluate("window.ai7.inspectDeliverables().then(v=>v.publication.milestones.find(m=>m.label==='Beta 验收发稿'&&m.purposeKind==='delivery-candidate'&&!m.changedSince)??null)");
  if(!priorMilestone){
  await ready(page,"document.querySelector('#manuscript-save-menu > summary')",'save-menu-ready');
  if(!await boolean(page,"document.querySelector('#manuscript-save-menu')?.open"))await select(page,'#manuscript-save-menu > summary');
  await ready(page,"document.querySelector('details.milestone-section > summary')?.getClientRects().length>0",'milestone-menu-ready');
  if(!await boolean(page,"document.querySelector('details.milestone-section')?.open"))await select(page,'details.milestone-section > summary');
  check(await boolean(page,"document.querySelector('#milestone-label')?.getClientRects().length>0"),'milestone-form');
  await fill(page,'#milestone-label','Beta 验收发稿');await select(page,'input[name=milestone-purpose][value=delivery-candidate]');await click(page,'保存里程碑版本');
  await ready(page,"document.querySelector('#milestone-label')?.value===''",'milestone-saved');
  }
  const milestone=priorMilestone??await page.evaluate("window.ai7.inspectDeliverables().then(v=>v.publication.milestones.find(m=>m.label==='Beta 验收发稿'&&!m.changedSince)??null)");
  check(Boolean(milestone),'current-delivery-milestone-retained');report.milestoneEvidence??=[];report.milestoneEvidence.push({channel:expectedChannel,...milestone,reused:Boolean(priorMilestone)});checkpoint();
  await select(page,'#app-sidebar [data-nav-book-section=deliverables]');await ready(page,"document.querySelector('[data-screen=book-deliverables]')",'deliverables');
  at(expectedChannel+'-native-docx-export');
  let exactExportReceipt;
  if(existsSync(output)){
   const existingHash=createHash('sha256').update(await readFile(output)).digest('hex');
   exactExportReceipt=await page.evaluate(`window.ai7.inspectDeliverables().then(v=>v.exports.find(r=>['created','replaced'].includes(r.outcome)&&r.format==='docx'&&r.target.revisionId===v.manuscript.revisionId&&r.technical.fileSha256===${JSON.stringify(existingHash)})??null)`);
   check(Boolean(exactExportReceipt),'prior-native-export-exact-receipt-and-current-revision');
  }else{
   await select(page,'[data-export-action=open][data-export-target=current]');native(executable,['-FileName',output]);
   await ready(page,"document.querySelector('.export-receipt')?.dataset.exportOutcome==='created'",'export-created');
   const createdHash=createHash('sha256').update(await readFile(output)).digest('hex');
   exactExportReceipt=await page.evaluate(`window.ai7.inspectDeliverables().then(v=>v.exports.find(r=>r.technical.fileSha256===${JSON.stringify(createdHash)}&&['created','replaced'].includes(r.outcome))??null)`);
   check(Boolean(exactExportReceipt),'native-export-durable-receipt');
  }
  const source=unzipSync(await readFile(input)), exported=unzipSync(await readFile(output));
  const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
  check(hash(source['word/media/source-preview.png'])===hash(exported['word/media/source-preview.png']),expectedChannel+'-media-fidelity');
  const sourceTable=wordTablePresentation(source),exportTable=wordTablePresentation(exported);
  check(sourceTable.count>0&&sourceTable.count===exportTable.count&&sourceTable.presentationSha256===exportTable.presentationSha256,expectedChannel+'-table-fidelity');
  check(exportTable.commentsResolve,expectedChannel+'-table-comments-resolve');
  const [originalRead,exportedRead]=await Promise.all([readExportedDocx(input),readExportedDocx(output)]);
  check(originalRead.comments.every(c=>exportedRead.comments.some(e=>e.author===c.author&&e.digest===c.digest)),expectedChannel+'-source-comments-retained');
  const untouchedStories=Object.keys(source).filter(n=>/^word\/(?:endnotes|footnotes|header[^/]*)\.xml$/.test(n));
  check(untouchedStories.length>0&&untouchedStories.every(n=>exported[n]&&hash(source[n])===hash(exported[n])),expectedChannel+'-untouched-note-header-fidelity');
  report.nativeExports??=[];report.nativeExports.push({channel:expectedChannel,path:output,receipt:exactExportReceipt,sourceTable,exportTable,untouchedStories});checkpoint();

  at(expectedChannel+'-delivery-package-export');
  const deliveryPath=join(dirname(output),expectedChannel+'-delivery.zip');
  if(!existsSync(deliveryPath)){
  const currentDesignation=await page.evaluate(`window.ai7.inspectDeliverables().then(v=>v.publication.designations.find(d=>d.current&&d.milestoneId===${JSON.stringify(milestone.milestoneId)})??null)`);
  if(!currentDesignation){
  await select(page,'[data-publication-action=designate]');await ready(page,"document.querySelector('input[name=publication-milestone]')",'publication-designation');
  await select(page,'input[name=publication-milestone]');await fill(page,'[data-publication-field=scope]','公开样书打包态 Beta 功能验收');await fill(page,'[data-publication-field=basis]','完成本次公开样书交互与导出检查后固定此版本，不代表实际出版或外部 Beta 通过。');
  await select(page,'[data-publication-action=confirm]');await ready(page,"document.querySelector('form.publication-designate')===null",'publication-recorded');
  }else check(true,'prior-valid-publication-payload-retained');
  await fill(page,'[data-package-field=purpose]','公开样书 Beta 打包交付验收');await select(page,'[data-package-action=prepare]');
  await ready(page,"document.querySelector('[data-package-action=export][data-package-version-id]')",'delivery-package-prepared');
  await select(page,'[data-package-action=export][data-package-version-id]');await select(page,'input[name=package-export-route][value=archive]');
  await ready(page,"document.querySelector('[data-package-action=export-choose]:not(:disabled)')",'delivery-archive-ready');await select(page,'[data-package-action=export-choose]');
  native(executable,['-FileName',deliveryPath]);
  await ready(page,"document.querySelector('[data-package-action=export-approve]:not(:disabled)')",'delivery-destination');await select(page,'[data-package-action=export-approve]');
  await wait(()=>{const db=new DatabaseSync(join(expectedDataRoot,'store','ai7.sqlite'),{readOnly:true});try{return Boolean(db.prepare("SELECT 1 FROM book_delivery_package_exports WHERE book_id=? AND json_extract(canonical_json,'$.kind')='archive-receipt' AND json_extract(canonical_json,'$.receipt.finalPath')=?").get(bookId,deliveryPath));}finally{db.close();}},'delivery-archive-receipted',120000);
  }else check(true,expectedChannel+'-existing-native-delivery-archive-reused');
  await verifyDeliveryArchive(deliveryPath,expectedDataRoot,bookId,page,expectedChannel);
  await select(page,'#app-sidebar [data-nav-settings]');await ready(page,"document.querySelector('[data-screen=settings]')",'settings-storage');
  await click(page,'数据与存储');await ready(page,"document.querySelector('.data-storage-summary')",'storage');
  check(await page.evaluate(`(()=>{const node=document.querySelector('.data-storage-summary');return node.dataset.runtimeForm==='packaged'&&node.dataset.channel===${JSON.stringify(expectedChannel)}&&document.querySelector('[data-product-data-root]')?.textContent===${JSON.stringify(expectedDataRoot)}})()`),expectedChannel+'-data-isolation');

  at(expectedChannel+'-automatic-backup-restore');
  await ready(page,"document.querySelector('[data-scheduled-backup-switch]')",'backup-switch');if(!await boolean(page,"document.querySelector('[data-scheduled-backup-switch]').checked"))await select(page,'[data-scheduled-backup-switch]');
  await ready(page,"window.ai7.inspectScheduledBackups().then(v=>v.total>0&&!v.backingUp&&v.lastFailure===null)",'automatic-backup-created',120000);
  const backup=await page.evaluate('window.ai7.inspectScheduledBackups().then(v=>({location:v.location,fileName:v.backups[0].fileName}))');
  const backupPath=join(backup.location,backup.fileName),backupBytes=await readFile(backupPath),backupFiles=unzipSync(backupBytes);
  report.storageBackups??=[];report.storageBackups.push({channel:expectedChannel,path:backupPath,sha256:createHash('sha256').update(backupBytes).digest('hex'),buildIdentity:report.buildIdentity,runnerHead:report.runnerHead});checkpoint();
  check(Object.keys(backupFiles).some(n=>n.endsWith('.sqlite'))&&!Object.keys(backupFiles).some(n=>/\.key\.txt$/.test(n)),expectedChannel+'-automatic-backup-package');
  await select(page,'[data-database-import-action=choose]');native(executable,['-FileName',backupPath]);await ready(page,"document.querySelector('input[name=database-import-choice][value=replace]')",'backup-preview');
  await select(page,'input[name=database-import-choice][value=replace]');await select(page,'[data-database-import-action=confirm]');await ready(page,"document.querySelector('.database-import')?.dataset.pending==='true'",'backup-restore-pending');
  await browser.close();browser=undefined;await new Promise(r=>setTimeout(r,1000));
  browser=await chromium.launch({executablePath:executable,headless:false,ignoreDefaultArgs:true,args:['--remote-debugging-pipe'],env,timeout:60000});page=await renderer(browser);
  await ready(page,"document.documentElement.dataset.ai7ProductReady==='true'",'backup-restored-startup');
  check(await page.evaluate(`window.ai7.getBookOverview({bookId:${JSON.stringify(bookId)},historyCursor:null}).then(v=>v.manuscriptState.state==='populated')`),expectedChannel+'-backup-restored-book');
  at(expectedChannel+'-renderer-crash-diagnostics');
  await page.send('Page.crash').catch(()=>{});await browser.close().catch(()=>{});browser=undefined;await new Promise(r=>setTimeout(r,2000));
  browser=await chromium.launch({executablePath:executable,headless:false,ignoreDefaultArgs:true,args:['--remote-debugging-pipe'],env,timeout:60000});page=await renderer(browser);await ready(page,"document.documentElement.dataset.ai7ProductReady==='true'",'post-crash-startup');
  await select(page,'#app-sidebar [data-nav-settings]');await click(page,'诊断');await ready(page,"document.querySelector('[data-crash-list-ready=true]')",'crash-records-ready');
  check(await boolean(page,"document.querySelector('[data-crash-list]')?.textContent.includes('界面进程退出')"),expectedChannel+'-real-renderer-crash-record');
  const version=await page.evaluate('window.ai7.inspectDataVersion().then(v=>({dataVersion:v.dataVersion,history:v.history.length}))');
  check(version.dataVersion===1&&version.history>=1,expectedChannel+'-persistent-store');
  report.completedChannels??=[];if(!report.completedChannels.includes(expectedChannel))report.completedChannels.push(expectedChannel);checkpoint();
 }finally{await browser?.close();}
}

async function searchSmoke(){
 report.limitations=['Provider-free search and exact return smoke on retained admitted Public SampleBooks; earlier paid acceptance keeps its original source and receipt.','Human Beta acceptance and external editorial study remain pending.'];
 check(process.platform==='win32'&&process.arch==='x64'&&/^AI7-TESTBED-0[12]$/i.test(process.env.COMPUTERNAME??''),'search-background-windows-guest');
 const previous=JSON.parse(await readFile('C:/ai7/results/beta-last-run.json','utf8'));
 check(previous.state==='passed'&&previous.scope==='six-flow-packaged-acceptance'&&previous.buildIdentity.softwareVersion==='0.5.0','search-retained-acceptance');
 const temp=await realpath(previous.testRoot);
 check(temp.toLowerCase().startsWith(resolve(tmpdir(),'ai7-beta-package-').toLowerCase()),'search-owned-data-root');
 report.testRoot=temp;report.retainedAcceptance={sourceCommit:previous.buildIdentity.sourceCommit,runnerHead:previous.runnerHead,scope:previous.scope};
 report.runnerHead=run('git.exe',['rev-parse','HEAD']).trim();
 const identity=JSON.parse(await readFile(join(RELEASE,assetsIndex<0?'../dist/build-identity.json':'build-identity.json'),'utf8'));
 report.buildIdentity=identity;
 check(identity.softwareVersion==='0.5.0'&&!identity.dirty&&['src','config','package.json','pnpm-lock.yaml'].every(path=>run('git.exe',['rev-parse',identity.sourceCommit+':'+path]).trim()===run('git.exe',['rev-parse','HEAD:'+path]).trim()),'search-exact-product-identity');
 const setup=join(RELEASE,'AI7-0.5.0-win-x64-setup.exe'),zip=join(RELEASE,'AI7-0.5.0-win-x64-portable.zip');
 const zipBytes=await readFile(zip),members=Object.keys(unzipSync(zipBytes));
 check(members.every(name=>!/(^|\/)(?:SampleBooks|\.git|test-results)(\/|$)|\.key\.txt$|\.pem$/i.test(name))&&members.filter(name=>name.startsWith('AI7/data/')).every(name=>name.endsWith('/')),'search-pristine-distribution');
 report.assets=[];for(const path of [setup,zip]){const bytes=await readFile(path);report.assets.push({name:path.split(/[\\/]/).at(-1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const installed=join(temp,'installed'),portableRoot=join(temp,'portable');
 at('search-install-current');run(setup,['/S','/D='+installed]);run(join(process.env.SystemRoot,'System32','tar.exe'),['-xf',zip,'-C',portableRoot]);
 const isolated={LOCALAPPDATA:join(temp,'local'),APPDATA:join(temp,'roaming')};
 report.channels=[];
 for(const [channel,executable,dataRoot,bookId] of [
  ['windows-installer',join(installed,'AI7.exe'),join(isolated.LOCALAPPDATA,'ai7','production'),previous.priorBook.bookId],
  // Full-backup carry replaced Portable's original priorBook with the installer's full Public sample1.
  ['windows-portable',join(portableRoot,'AI7','app','AI7.exe'),join(portableRoot,'AI7','data'),previous.priorBook.bookId],
 ]){
  at(channel+'-search-return');const env={...selfCheckEnvironment(executable),...isolated};
  const selfcheck=JSON.parse(run(executable,['--self-check'],env).trim());
  check(selfcheck.channel===channel&&selfcheck.buildIdentity.sourceCommit===identity.sourceCommit&&selfcheck.writable,channel+'-search-self-check');
  const countAttempts=()=>{const db=new DatabaseSync(join(dataRoot,'store','ai7.sqlite'),{readOnly:true});try{return db.prepare('SELECT COUNT(*) n FROM analysis_execution_attempts').get().n;}finally{db.close();}};
  const before=countAttempts();let browser;
  try{
   browser=await chromium.launch({executablePath:executable,headless:false,ignoreDefaultArgs:true,args:['--remote-debugging-pipe'],env,timeout:60000});
   const page=await renderer(browser);await ready(page,"document.documentElement.dataset.ai7ProductReady==='true'",'search-product-ready');
   check(await page.evaluate(`window.ai7.listPriorWork().then(rows=>rows.some(row=>row.bookId===${JSON.stringify(bookId)}))`),channel+'-search-retained-full-public-book');
   await openKnownBook(page,bookId);
   await page.evaluate(`(async()=>{const binding=(await window.ai7.listPriorWork()).find(w=>w.bookId===${JSON.stringify(bookId)});const request={manuscriptId:binding.manuscriptId,branchId:binding.branchId};const first=await window.ai7.getManuscriptWindowAt({...request,target:{kind:'proportion',proportion:0}});const end=await window.ai7.getManuscriptWindowAt({...request,target:{kind:'proportion',proportion:1}});const candidate=[...end.blocks].reverse().find(b=>b.kind==='paragraph'&&/[一-鿿]{12}/u.test(b.text)&&!first.blocks.some(f=>f.blockId===b.blockId));if(!candidate)throw Error('search-disjoint-public-range');globalThis.__ai7PackagedSearch={firstBlockId:first.blocks[0].blockId,query:candidate.text.match(/[一-鿿]{12}/u)[0]};})()`);
   await fill(page,'#manuscript-position','0');
   await ready(page,"document.querySelector('[data-testid=manuscript-editor] > [data-block-id]')?.dataset.blockId===__ai7PackagedSearch.firstBlockId",'search-start-window');
   if(await boolean(page,"document.querySelector('#manuscript-navigation-panel')?.hidden"))await select(page,'[data-edge-entry=navigation]');
   check(await page.evaluate("(()=>{const input=document.querySelector('#manuscript-search');input.value=__ai7PackagedSearch.query;input.dispatchEvent(new Event('input',{bubbles:true}));return input.value.length===12})()"),'search-public-query');
   await click(page,'查找全稿');await ready(page,"document.querySelector('.search-result button')&&!document.querySelector('#manuscript-search').disabled",'search-results');
   for(let iteration=0;iteration<3;iteration++){
    check(await page.evaluate("(()=>{const pane=document.querySelector('.editor-window'),block=document.querySelectorAll('[data-testid=manuscript-editor] > [data-block-id]')[5],text=block?.firstChild;if(!(text instanceof Text)||text.length<5)return false;block.scrollIntoView({block:'center'});const top=pane.getBoundingClientRect().top,visible=[...document.querySelectorAll('[data-testid=manuscript-editor] > [data-block-id]')].find(b=>b.getBoundingClientRect().bottom>=top);getSelection().setBaseAndExtent(text,4,text,1);__ai7PackagedSearch.return={meta:document.querySelector('.editor-meta').textContent,blockId:block.dataset.blockId,scrollBlockId:visible.dataset.blockId,scrollOffset:visible.getBoundingClientRect().top-top,text:getSelection().toString()};return true})()"),channel+'-search-return-anchor-'+iteration);
    await select(page,'.search-result button');
    await ready(page,"document.querySelector('.editor-meta').textContent!==__ai7PackagedSearch.return.meta&&getSelection().toString()===__ai7PackagedSearch.query",'search-exact-range');
    await new Promise(resolve=>setTimeout(resolve,500));check(await boolean(page,"getSelection().toString()===__ai7PackagedSearch.query"),channel+'-search-range-stable-'+iteration);
    await click(page,'返回查找前位置');
    await ready(page,"(()=>{const expected=__ai7PackagedSearch.return,s=getSelection(),pane=document.querySelector('.editor-window'),block=document.querySelector('[data-block-id=\"'+expected.scrollBlockId+'\"]');return document.querySelector('.editor-meta').textContent===expected.meta&&s.anchorNode?.parentElement?.closest('[data-block-id]')?.dataset.blockId===expected.blockId&&s.anchorOffset===4&&s.focusOffset===1&&s.toString()===expected.text&&block&&Math.abs(block.getBoundingClientRect().top-pane.getBoundingClientRect().top-expected.scrollOffset)<=3})()",'search-exact-return');
    check(true,channel+'-search-exact-return-'+iteration);
   }
   check(await page.evaluate(`window.ai7.inspectDataVersion().then(v=>v.schemaRevision===107&&v.dataVersion===1)`),channel+'-search-retained-store-readable');
  }finally{await browser?.close();}
  check(countAttempts()===before,channel+'-search-no-new-model-attempts');report.channels.push({channel,bookId,iterations:3,modelAttemptsBefore:before,modelAttemptsAfter:countAttempts()});checkpoint();
 }
 report.state='passed';
}

try{
 if(SEARCH_ONLY)await searchSmoke();else{
 try{
  const previous=JSON.parse(await readFile('C:/ai7/results/beta-last-run.json','utf8'));
  if(RESUME_LAST){
   const stages=['windows-installer-full-review','windows-installer-retained-factual-evidence','windows-installer-controlled-english-source','windows-installer-agent-workspace','windows-installer-global-agent-live','windows-installer-native-docx-export','windows-installer-delivery-package-export','windows-installer-automatic-backup-restore','windows-installer-renderer-crash-diagnostics','windows-installer-launch','await-protected-enrollment-windows-installer','portable-restore-paid-history','portable-native-accepted-import','windows-portable-launch','await-protected-enrollment-windows-portable','windows-portable-full-review','windows-portable-controlled-english-source','windows-portable-agent-workspace','windows-portable-global-agent-live','windows-portable-native-docx-export','windows-portable-delivery-package-export','windows-portable-automatic-backup-restore','windows-portable-renderer-crash-diagnostics','windows-portable-live-once'];
   if((RETAINED_REVIEW_ONLY?!['failed','passed'].includes(previous.state):previous.state!=='failed'||!stages.includes(previous.failedStage))||previous.buildIdentity?.softwareVersion!=='0.5.0'||!resolve(previous.testRoot).toLowerCase().startsWith(resolve(tmpdir(),'ai7-beta-package-').toLowerCase()))throw Error('resume-receipt-refused');
   const completedReview=previous.completedReview??(()=>{const review=previous.reviews?.findLast(r=>r.channel==='windows-installer'&&r.state==='settled'&&r.categories?.length===5&&r.categories.every(c=>c.state==='settled'));return review?{buildIdentity:previous.buildIdentity,runnerHead:previous.runnerHead,review,checks:previous.checks}:null;})();
   if((RETAINED_REVIEW_ONLY||previous.failedStage==='windows-installer-retained-factual-evidence')&&!completedReview)throw Error('resume-completed-review-missing');
   resume=previous;
   report.activeReview=previous.activeReview??null;
   report.controlledTranslations=previous.controlledTranslations??[];report.findingDispositions=previous.findingDispositions??[];
   for(const key of ['agent','agentAttempts','globalTurns','globalAttempts','habits','habitAttempts','storageBackups','nativeExports','deliveryExports','milestoneEvidence','portableLiveAttempts','completedChannels'])report[key]=previous[key]??[];
   resume.completedReview=completedReview;report.completedReview=completedReview;
   report.priorEvidence=previous.priorEvidence??{buildIdentity:previous.buildIdentity,runnerHead:previous.runnerHead,checks:previous.checks,importModes:previous.importModes,accountDiscovery:previous.accountDiscovery,searchProbes:previous.searchProbes,reason:'Completed prefix retained from earlier candidate; current candidate resumes at FullReview after actual product repair.'};
   report.priorBook=previous.priorBook;report.portablePriorBook=previous.portablePriorBook;report.portableCarry=previous.portableCarry;report.portableImport=previous.portableImport;
  }else await cleanupInstallation(join(previous.testRoot,'installed'));
 }catch(e){if(e.code!=='ENOENT')throw e;}
 check(process.platform==='win32'&&process.arch==='x64','windows-x64');
 // This runner is invoked by the host guest runner inside the guest's interactive scheduled task.
 check(/^AI7-TESTBED-0[12]$/i.test(process.env.COMPUTERNAME??''),'background-test-guest');
 const manifest=JSON.parse(await readFile(join(ROOT,'package.json'),'utf8'));
 const identity=JSON.parse(await readFile(assetsIndex<0?join(ROOT,'dist/build-identity.json'):join(RELEASE,'build-identity.json'),'utf8'));
 report.runnerHead=run('git.exe',['rev-parse','HEAD']).trim();
 if(assetsIndex>=0)check(['src','config','package.json','pnpm-lock.yaml'].every(path=>run('git.exe',['rev-parse',identity.sourceCommit+':'+path]).trim()===run('git.exe',['rev-parse','HEAD:'+path]).trim()),'reused-package-product-tree-equivalent');
 report.buildIdentity=identity;check(identity.softwareVersion===manifest.version&&!identity.dirty,'clean-build-identity');
 const setup=join(RELEASE,`AI7-${manifest.version}-win-x64-setup.exe`),zip=join(RELEASE,`AI7-${manifest.version}-win-x64-portable.zip`);
 const archive=unzipSync(await readFile(zip));const names=Object.keys(archive);
 check(names.every(name=>!/(^|\/)(?:SampleBooks|\.git|test-results)(\/|$)|\.key\.txt$|\.pem$/i.test(name)),'distribution-hygiene');
 check(names.filter(name=>name.startsWith('AI7/data/')).every(name=>name.endsWith('/')),'pristine-portable-data');
 report.assets=[];
 for(const path of [setup,zip]){const bytes=await readFile(path);report.assets.push({name:path.split(/[\\/]/).at(-1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 if(RESUME_LAST&&!resume)throw Error('resume-receipt-missing');
 const temp=resume?await realpath(resume.testRoot):await realpath(await mkdtemp(join(tmpdir(),'ai7-beta-package-')));report.testRoot=temp;
 const input=join(temp,'public-sample1-objects.docx');
 if(!resume){await composeExportAdmittedDocx(input,{endnote:{block:15,noteSourceBlock:22},source:'sample1.docx',startBlock:1,blocks:24,title:'Beta sample1',header:{sourceBlock:20},styledRun:{block:13},comment:{block:8,from:10,to:20,author:'示例作者',text:{block:14,from:0,to:10}},replacement:{block:10,from:5,to:9,author:'示例作者',date:'2026-09-01T10:02:00Z',insert:{block:14,from:0,to:6}}});
 await addReadOnlySourceObjects(input);}
 if(resume)check(createHash('sha256').update(await readFile(input)).digest('hex')===resume.input.sha256,'resume-exact-public-input');
 report.input={source:'sample1.docx',startBlock:1,blocks:24,sha256:createHash('sha256').update(await readFile(input)).digest('hex'),classes:['Word revisions','comments','endnote','table','image']};
 const noteParts=unzipSync(await readFile(input));check(Boolean(noteParts['word/endnotes.xml'])&&strFromU8(noteParts['word/document.xml']).includes('<w:endnoteReference w:id="1"/>')&&strFromU8(noteParts['word/_rels/document.xml.rels']).includes('Target="endnotes.xml"')&&strFromU8(noteParts['[Content_Types].xml']).includes('PartName="/word/endnotes.xml"'),'composed-endnote-archive');
 const installed=join(temp,'installed');const executable=join(installed,'AI7.exe');
 const env=selfCheckEnvironment(executable);env.LOCALAPPDATA=join(temp,'local');await mkdir(env.LOCALAPPDATA,{recursive:true});env.APPDATA=join(temp,'roaming');await mkdir(env.APPDATA,{recursive:true});
 const priorSetup='C:/ai7/beta-inputs/AI7-0.4.1-win-x64-setup.exe';
 check(createHash('sha256').update(await readFile(priorSetup)).digest('hex')==='3df2653125ace44b58dd8e5cce458a14d0937080906cf6b38684b62793cb7927','trusted-prior-installer');
 if(!resume){at('prior-install');run(priorSetup,['/S','/D='+installed]);check(existsSync(executable),'prior-nsis-install');
 const priorCheck=JSON.parse(run(executable,['--self-check'],env).trim());
 check(priorCheck.softwareVersion==='0.4.1'&&priorCheck.buildIdentity.sourceCommit==='754f1bdc541f69bc5adf573b9d70116004982cb6','prior-binary-identity');
 report.priorBook=await seedPriorBook(temp,join(env.LOCALAPPDATA,'ai7','production'));
 check(report.priorBook.softwareVersion==='0.4.1'&&report.priorBook.schemaRevision===104,'prior-public-book-schema');}
 at('upgrade-to-beta');run(setup,['/S','/D='+installed]);check(existsSync(executable),'nsis-upgrade-install');
 const selfcheck=JSON.parse(run(executable,['--self-check'],env).trim());
 report.installedBuildIdentity=selfcheck.buildIdentity;
 check(selfcheck.channel==='windows-installer'&&selfcheck.writable&&selfcheck.keyringCarrier==='loaded'&&selfcheck.buildIdentity.sourceCommit===identity.sourceCommit,'installed-self-check');
 if(!report.completedChannels?.includes('windows-installer'))await walk(executable,env,'windows-installer',join(env.LOCALAPPDATA,'ai7','production'),input,join(temp,'installed-export.docx'));
 else check(true,'completed-installer-channel-retained-without-paid-or-native-export-repetition');
 if(!STARTUP_ONLY&&!RETAINED_REVIEW_ONLY){
 at('reinstall');run(setup,['/S','/D='+installed]);
 const after=JSON.parse(run(executable,['--self-check'],env).trim());check(after.channel==='windows-installer'&&after.store_versions==='readable','same-candidate-reinstall');
  const portableRoot=join(temp,'portable');await mkdir(portableRoot,{recursive:true});run(join(process.env.SystemRoot,'System32','tar.exe'),['-xf',zip,'-C',portableRoot]);
 const portable=join(portableRoot,'AI7','app','AI7.exe');
 const portableEnv={...env,...selfCheckEnvironment(portable),LOCALAPPDATA:env.LOCALAPPDATA,APPDATA:env.APPDATA};
 if(!report.portablePriorBook){await mkdir(join(temp,'portable-prior'),{recursive:true});report.portablePriorBook=await seedPriorBook(join(temp,'portable-prior'),join(portableRoot,'AI7','data'));checkpoint();}
 const portableSelfcheck=JSON.parse(run(portable,['--self-check'],portableEnv).trim());check(portableSelfcheck.channel==='windows-portable'&&portableSelfcheck.writable,'extracted-portable-self-check');
 await preparePortableCarry(portable,portableEnv,join(portableRoot,'AI7','data'),input);
 await walk(portable,portableEnv,'windows-portable',join(portableRoot,'AI7','data'),input,join(temp,'portable-export.docx'));
 at('uninstall');const uninstaller=(await readdir(installed)).find(name=>/^Uninstall.*\.exe$/i.test(name));check(Boolean(uninstaller),'uninstaller-present');
 run(join(installed,uninstaller),['/S']);await wait(()=>!existsSync(executable),'uninstall-timeout');check(existsSync(join(env.LOCALAPPDATA,'ai7','production','store','ai7.sqlite')),'uninstall-keeps-user-data');
 }
 report.state='passed';
 }
}catch(error){report.state='failed';report.failedStage=stage;report.failureCode=/^[a-z0-9/-]+$/.test(error?.message??'')?error.message:'unclassified';process.exitCode=1;console.error('BETA_PACKAGE/failed/'+stage);}
try{await cleanupInstallation(report.testRoot?join(report.testRoot,'installed'):null);}catch{report.installationCleanup='failed';report.state='failed';process.exitCode=1;}
try{await removeOwnedCredentials();}catch{report.credentialCleanup='failed';report.state='failed';process.exitCode=1;}
await writeFile(join(OUTPUT,SEARCH_ONLY?'beta-search-smoke.json':'beta-acceptance.json'),JSON.stringify(report,null,2)+'\n');
await mkdir('C:/ai7/results/beta-receipts',{recursive:true});
await writeFile(`C:/ai7/results/beta-receipts/${report.runnerHead??'unstarted'}-${Date.now()}.json`,JSON.stringify(report,null,2)+'\n');
if(!SEARCH_ONLY)await writeFile('C:/ai7/results/beta-last-run.json',JSON.stringify(report,null,2)+'\n');
console.log('BETA_PACKAGE/'+report.state);
