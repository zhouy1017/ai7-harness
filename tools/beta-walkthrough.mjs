/** Owner-authorized manual Windows Beta acceptance on a background guest; never a CI layer. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import { serveGuestEnrollment, storeEnrollment } from './enroll-dev-credential.mjs';
import { chromium } from 'playwright-core';
import { selfCheckEnvironment } from '../tools/package.mjs';
import { composeExportAdmittedDocx, addReadOnlySourceObjects } from '../e2e/composed-docx.mjs';
import { build } from 'esbuild';
import { unzipSync, strFromU8 } from 'fflate';

const ROOT=resolve('.');
const args=process.argv.slice(2),STARTUP_ONLY=args.includes('--startup-only');
const assetsIndex=args.indexOf('--assets-from');
const RELEASE=assetsIndex<0?join(ROOT,'release'):resolve(args[assetsIndex+1]??'');
const OUTPUT=join(ROOT,'release');await mkdir(OUTPUT,{recursive:true});
if(assetsIndex>=0&&!RELEASE.toLowerCase().startsWith('c:\\ai7\\beta-inputs\\'))throw Error('assets-root-refused');
const packagedKeyring=()=>import(pathToFileURL(join(RELEASE,'AI7','app','resources','app','node_modules','@napi-rs','keyring','index.js')).href);
let stage='inputs';
const report={schema:'ai7.windows-beta-acceptance/1',scope:STARTUP_ONLY?'native-startup-probe':'six-flow-packaged-acceptance',state:'running',checks:[],limitations:[
 'Separate Owner-authorized packaged live acceptance uses available Go and search accounts; other provider accounts remain unconfigured. Ordinary source Journeys and CI are provider-free.',
 'Human Beta acceptance and the external editor study remain pending.',
 'The prior-version public Book is seeded through the exact 0.4.1 product store; current import/export use the actual package UI.',
]};
const check=(condition,name)=>{if(!condition)throw Error(name);report.checks.push(name);console.log('BETA_PACKAGE/pass/'+name);};
const at=(name)=>{stage=name;console.log('BETA_PACKAGE/stage/'+name);};
const run=(file,args,env=process.env)=>{const result=spawnSync(file,args,{cwd:ROOT,env,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});if(result.status!==0)throw Error('child-failed');return result.stdout;};
const wait=async(predicate,name,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}throw Error(name);};
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
 return {send,evaluate:async(expression)=>{const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error('renderer-expression');return value.result.value;}};
}
const boolean=async(page,expression)=>page.evaluate('Promise.resolve('+expression+').then(Boolean)');
const click=async(page,label)=>check(await page.evaluate(`(()=>{const node=[...document.querySelectorAll('button')].find(n=>n.textContent===${JSON.stringify(label)});if(!node||node.disabled)return false;node.click();return true})()`),'click-'+label);
const select=async(page,selector)=>check(await page.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)return false;node.click();return true})()`),'select-'+selector);
const ready=async(page,expression,name,ms=120000)=>wait(()=>boolean(page,expression).catch(()=>false),name,ms);
const fill=async(page,selector,value)=>check(await page.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));return true})()`),'fill-'+selector);
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
   const model=store.saveModelServiceConnection('Beta available Go account',null,'ready','opencode-go');
   store.selectModelServiceRoute('opencode-go');
   store.selectMainRoleModel('opencode-go','deepseek-v4.1-flash');store.selectFastRoleModel('opencode-go','deepseek-v4.1-flash');
   const refs=[{slot:'opencode-go',credentialReference:model.credentialReference}];
   for(const slot of ['search-brave','search-bochaai']){const saved=store.saveSearchBackendCredential(slot,null,'ready');refs.push({slot,credentialReference:saved.credentialReference});}
   store.selectSearchBackend('search-brave');store.selectSearchBackend('search-bochaai','fallback');
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
  await configureLiveConnections(expectedDataRoot,dirname(input),expectedChannel);
  browser=await chromium.launch({executablePath:executable,headless:false,ignoreDefaultArgs:true,args:['--remote-debugging-pipe'],env,timeout:60000});
  let page=await renderer(browser);
  await ready(page,"document.documentElement.dataset.ai7ProductReady==='true'",'product-ready');
  check(!await boolean(page,'Promise.resolve(false)')&&await boolean(page,'Promise.resolve(true)'),expectedChannel+'-async-predicate-resolution');
  at(expectedChannel+'-open-library');
  await select(page,'#app-sidebar [data-nav-destination=library]');
  await ready(page,"document.querySelector('[data-screen=landing]')",'initial-library-ready');
  check(true,expectedChannel+'-library');
  if(expectedChannel==='windows-installer'){
   check(await page.evaluate(`window.ai7.getBookOverview({bookId:${JSON.stringify(report.priorBook?.bookId)},historyCursor:null}).then(v=>v.manuscriptState.state==='populated')`),'prior-book-survives-upgrade');
   check(await page.evaluate(`window.ai7.inspectDataVersion().then(v=>v.schemaRevision===106&&v.history.some(h=>h.softwareVersion==='0.4.1')&&v.history.some(h=>h.softwareVersion==='0.5.0'))`),'upgrade-history-and-schema');
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
  await select(page,'input[aria-label="新建图书"]');await select(page,'input[aria-label="作为首份稿件导入"]');
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
  const bookId=await page.evaluate('window.ai7.inspectReviewWorkspace().then(v=>v.bookId)');

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
  const headingCount=await page.evaluate("document.querySelectorAll('[data-testid=manuscript-editor] > [data-block-kind=heading]').length");
  await fill(page,'select[aria-label=段落样式]','heading-2');await ready(page,`document.querySelectorAll('[data-testid=manuscript-editor] > [data-block-kind=heading]').length===${headingCount+1}`,'heading-style-saved');
  await fill(page,'select[aria-label=段落样式]','paragraph');await ready(page,`document.querySelectorAll('[data-testid=manuscript-editor] > [data-block-kind=heading]').length===${headingCount}`,'paragraph-style-restored');
  check(true,expectedChannel+'-heading-style-edit');
  check(await page.evaluate(`(()=>{const p=[...document.querySelectorAll('[data-testid=manuscript-editor] > p[data-block-id]')].find(n=>n.firstChild?.nodeType===3&&n.firstChild.length>30&&!n.querySelector('.editorial-mark'));if(!p)return false;const r=document.createRange();r.setStart(p.firstChild,2);r.setEnd(p.firstChild,22);getSelection().removeAllRanges();getSelection().addRange(r);p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));const rect=p.getBoundingClientRect();p.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:rect.x+20,clientY:rect.y+10}));return true})()`),'contextual-selection');
  await ready(page,"document.querySelector('[data-mark-action=ask-on-selection]')",'context-menu');await select(page,'[data-mark-action=ask-on-selection]');
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
  at(expectedChannel+'-full-review');
  await select(page,'#app-sidebar [data-nav-destination=knowledge]');await click(page,'工序与规则');
  await ready(page,"document.querySelector('.procedure-library [data-procedure-id=\"ai7-procedure/full-review\"]')",'procedure-library');
  check(await page.evaluate(`(()=>{const root=document.querySelector('[data-procedure-id="ai7-procedure/full-review"]');const n=[...root.querySelectorAll('button')].find(n=>n.textContent.startsWith('运行此工序'));if(!n||n.disabled)return false;n.click();return true})()`),'full-review-choose');
  await ready(page,"document.querySelector('.procedure-book-chooser select[data-procedure-field=book]')",'procedure-book-chooser');
  // The newest import is selected by the actual chooser option; no synthetic run is inserted.
  const importedBookId=await page.evaluate("[...document.querySelector('.procedure-book-chooser select[data-procedure-field=book]').options].find(o=>o.textContent.includes('Beta package compatibility'))?.value");
  check(Boolean(importedBookId),'imported-book-choice');
  await fill(page,'.procedure-book-chooser select[data-procedure-field=book]',importedBookId);await click(page,'打开任务');
  await ready(page,"document.querySelector('dialog.review-sheet[open]')",'full-review-sheet');
  check(await boolean(page,"document.querySelector('[data-procedure-definition=\"ai7-procedure/full-review@1\"]')"),'full-review-pinned');
  await select(page,'input[name=review-scope][value=whole]');await select(page,'dialog.review-sheet [data-review-action=start]');
  await ready(page,"window.ai7.inspectReviewWorkspace().then(v=>v.run?.state==='settled')",'full-review-settled',1800000);
  const review=await page.evaluate("window.ai7.inspectReviewWorkspace().then(v=>({runId:v.run?.reviewRunId,categories:v.run?.categories.map(c=>({id:c.categoryId,state:c.state})),findings:v.run?.findings.length}))");
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
    return {categoryId:c.categoryId,taskIntentId:c.task.taskIntentId,revisionId:revision?.revisionId,coverage:revision?.coverage??null,gaps:revision?.gaps.map(g=>g.code)??['missing-result']};
   });
  }finally{coverageDb.close();}
  report.reviews.at(-1).memberCoverage=memberCoverage;
  check(memberCoverage.every(c=>c.local||(c.coverage?.state==='complete'&&c.gaps.length===0)),expectedChannel+'-full-review-complete-coverage');
  at(expectedChannel+'-retained-factual-evidence');
  let factualSources=await page.evaluate(`window.ai7.inspectResearchEvidence({bookId:${JSON.stringify(bookId)},after:null}).then(v=>({count:v.records.length,next:v.next,translated:v.records.filter(r=>r.translation?.state==='translated'||r.translation?.text?.length>0).length,captured:v.records.filter(r=>r.captureState==='full-text').length}))`);
  check(factualSources.count>0&&factualSources.captured>0,expectedChannel+'-retained-live-sources');
  report.factualEvidence??=[];report.factualEvidence.push({channel:expectedChannel,...factualSources});
  await select(page,'#app-sidebar [data-nav-book-section=sources]');await ready(page,"document.querySelector('.research-evidence')",'sources-surface');
  while(!await boolean(page,"document.querySelector('.research-evidence-translated blockquote')?.textContent.length>0")&&await boolean(page,"document.querySelector('[data-evidence-action=more]')")){await select(page,'[data-evidence-action=more]');await new Promise(r=>setTimeout(r,300));}
  check(await boolean(page,"document.querySelector('.research-evidence-translated blockquote')?.textContent.length>0"),expectedChannel+'-foreign-source-translation-visible');
  await select(page,'#app-sidebar [data-nav-book-section=review]');await ready(page,"document.querySelector('.review-workspace-card')",'review-after-evidence');
  const applicable=await page.evaluate("[...document.querySelectorAll('[data-review-action=accept-apply]')].find(n=>!n.disabled)?.closest('article')?.dataset.findingId??null");
  check(Boolean(applicable),expectedChannel+'-applicable-card-required');
  if(applicable){await select(page,`article[data-finding-id=${JSON.stringify(applicable)}] [data-review-action=accept-apply]`);await ready(page,`document.querySelector('article[data-finding-id=${JSON.stringify(applicable)}] [data-review-action=accept-apply]')?.disabled!==false`,'finding-adopted');check(true,expectedChannel+'-finding-adopted');}
  const reject=await page.evaluate("[...document.querySelectorAll('[data-review-action=ignore]')].find(n=>!n.disabled)?.closest('article')?.dataset.findingId??null");
  check(Boolean(reject),expectedChannel+'-finding-to-reject');
  await select(page,`article[data-finding-id=${JSON.stringify(reject)}] [data-review-action=ignore]`);await fill(page,'[data-review-field=ignore-reason]','Beta 人工复核：该项不符合本次修改目的。');await select(page,'[data-review-action=ignore-confirm]');
  at(expectedChannel+'-agent-workspace');
  await select(page,'#app-sidebar [data-nav-agent-workspace=row]');await ready(page,"document.querySelector('[data-agent-workspace-block]')",'agent-workspace');
  check(await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('p[data-agent-workspace-block]')];const start=rows.find(n=>n.firstChild?.nodeType===3&&n.nextElementSibling?.matches('p[data-agent-workspace-block]'));if(!start)return false;const end=start.nextElementSibling;const r=document.createRange();r.setStart(start.firstChild,0);r.setEnd(end.firstChild,Math.min(2,end.firstChild.length));const s=getSelection();s.removeAllRanges();s.addRange(r);end.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return document.querySelector('.agent-workspace-quote')?.textContent.includes(String.fromCharCode(10));})()`),expectedChannel+'-cross-paragraph-selection');
  await fill(page,'[data-agent-workspace-field=instruction]','请仅检查所选公开样书文字中明确的错别字和语病，保留历史用语与人物口吻，提出有原文锚点的必要修改；无问题可不修改。');
  await select(page,'[data-agent-workspace-action=propose]');
  await ready(page,"document.querySelector('.agent-workspace-proposal')?.dataset.agentWorkspaceProposal==='ready'",'agent-proposal-ready',300000);
  check(await boolean(page,"!document.querySelector('[data-agent-workspace-field=instruction]')?.disabled"),expectedChannel+'-agent-next-round');
  const agent=await page.evaluate("window.ai7.inspectAgentWorkspace().then(v=>({dialogueId:v.proposal?.dialogueId,count:v.proposal?.candidates.length}))");
  const firstProposal=await page.evaluate('window.ai7.inspectAgentWorkspace().then(v=>v.proposal?.proposalSetId)');
  await fill(page,'[data-agent-workspace-field=instruction]','请复核上一轮结果，只保留能用所选原文证实的必要修改，并撤回仅属风格偏好的建议。');await select(page,'[data-agent-workspace-action=propose]');
  await ready(page,`window.ai7.inspectAgentWorkspace().then(v=>v.proposal?.state==='ready'&&v.proposal.proposalSetId!==${JSON.stringify(firstProposal)})`,'agent-second-round',300000);check(true,expectedChannel+'-agent-refinement-round');
  agent.count=await page.evaluate('window.ai7.inspectAgentWorkspace().then(v=>v.proposal?.candidates.length??0)');
  if(agent.count>0){await select(page,'[data-agent-workspace-action=promote]');await ready(page,"document.querySelector('[data-agent-workspace-promoted]')",'agent-promoted');}
  report.agent??=[];report.agent.push({channel:expectedChannel,...agent});
  at(expectedChannel+'-global-agent-live');
  await select(page,'#app-sidebar [data-nav-destination=global-agent]');await ready(page,"document.querySelector('[data-global-agent-question-form]')",'global-ready');
  check(await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('[data-global-agent-scope-book]')];for(const n of rows){if(!n.checked)n.click();}return rows.length>=2})()`),'global-book-scope');
  await fill(page,'[data-global-agent-question]','请使用跨书检索工具 retrieve 查找本次选入公开样书的共同内容，再使用 exact_fetch 读取至少一处精确原文；据此简短说明证据来自哪本书，不推测没有的内容。');
  await select(page,'[data-global-agent-question-form] button[type=submit]');
  await ready(page,"document.querySelector('.global-agent-answer-bubble')?.textContent.length>0&&document.querySelector('[data-global-agent-question-form] button[type=submit]')?.disabled===false",'global-answer',300000);
  const globalTurn=await page.evaluate('window.ai7.inspectGlobalAgent().then(v=>{const h=v.history[0];return {dialogueId:h?.dialogueId,state:h?.attempts.at(-1)?.state,fragments:h?.attempts.at(-1)?.fragments.length,tools:h?.toolCalls?.map(c=>({tool:c.tool,outcome:c.outcome}))}})');
  check(globalTurn.state==='completed'&&globalTurn.fragments>0&&['retrieve','exact_fetch'].every(t=>globalTurn.tools?.some(c=>c.tool===t&&c.outcome==='returned')),expectedChannel+'-global-real-cross-book-tools');report.globalTurns??=[];report.globalTurns.push({channel:expectedChannel,...globalTurn});
  // Habits is another real scoped turn, using the product's ordinary button.
  const beforeHabits=await page.evaluate('window.ai7.inspectGlobalAgent().then(v=>v.history.map(h=>h.dialogueId))');
  await select(page,'[data-global-agent-habits=summary]');
  await ready(page,"document.querySelector('[data-global-agent-question-form] button[type=submit]')?.disabled===false",'habits-answer',300000);
  await ready(page,`window.ai7.inspectGlobalAgent().then(v=>v.history.some(h=>!${JSON.stringify(beforeHabits)}.includes(h.dialogueId)&&h.attempts.at(-1)?.state==='completed'&&h.attempts.at(-1)?.fragments.length>0))`,'new-habits-completed',300000);
  check(true,expectedChannel+'-habits-new-completed-answer');
  await select(page,'#app-sidebar [data-nav-destination=library]');await ready(page,"document.querySelector('[data-screen=landing]')",'library-after-agents');
  await select(page,`#app-sidebar [data-nav-book=${JSON.stringify(importedBookId)}]`);await ready(page,"document.querySelector('[data-nav-book-section=manuscript]')",'reopened-book-context');

  await select(page,'#app-sidebar [data-nav-book-section=manuscript]');await ready(page,"document.querySelector('[data-testid=manuscript-editor]')",'return-manuscript-milestone');
  check(await page.evaluate(`(()=>{const n=document.querySelector('[data-edge-entry=navigation]');if(n.getAttribute('aria-expanded')!=='true')n.click();document.querySelector('details.milestone-section').open=true;return true})()`),'milestone-form');
  await fill(page,'#milestone-label','Beta 验收发稿');await select(page,'input[name=milestone-purpose][value=delivery-candidate]');await click(page,'保存里程碑版本');
  await ready(page,"document.querySelector('#milestone-label')?.value===''",'milestone-saved');
  await select(page,'#app-sidebar [data-nav-book-section=deliverables]');await ready(page,"document.querySelector('[data-screen=book-deliverables]')",'deliverables');
  at(expectedChannel+'-native-docx-export');
  await select(page,'[data-export-action=open][data-export-target=current]');native(executable,['-FileName',output]);
  await ready(page,"document.querySelector('.export-receipt')?.dataset.exportOutcome==='created'",'export-created');
  const source=unzipSync(await readFile(input)), exported=unzipSync(await readFile(output));
  const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
  check(hash(source['word/media/source-preview.png'])===hash(exported['word/media/source-preview.png']),expectedChannel+'-media-fidelity');
  const table=(files)=>strFromU8(files['word/document.xml']).match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/)?.[0];
  check(table(source)===table(exported),expectedChannel+'-table-fidelity');

  at(expectedChannel+'-delivery-package-export');
  await select(page,'[data-publication-action=designate]');await ready(page,"document.querySelector('input[name=publication-milestone]')",'publication-designation');
  await select(page,'input[name=publication-milestone]');await fill(page,'[data-publication-field=scope]','公开样书打包态 Beta 功能验收');await fill(page,'[data-publication-field=basis]','完成本次公开样书交互与导出检查后固定此版本，不代表实际出版或外部 Beta 通过。');
  await select(page,'[data-publication-action=confirm]');await ready(page,"document.querySelector('form.publication-designate')===null",'publication-recorded');
  await fill(page,'[data-package-field=purpose]','公开样书 Beta 打包交付验收');await select(page,'[data-package-action=prepare]');
  await ready(page,"document.querySelector('[data-package-action=export][data-package-version-id]')",'delivery-package-prepared');
  await select(page,'[data-package-action=export][data-package-version-id]');await select(page,'input[name=package-export-route][value=archive]');
  await ready(page,"document.querySelector('[data-package-action=export-choose]:not(:disabled)')",'delivery-archive-ready');await select(page,'[data-package-action=export-choose]');
  const deliveryPath=join(dirname(output),expectedChannel+'-delivery.zip');native(executable,['-FileName',deliveryPath]);
  await ready(page,"document.querySelector('[data-package-action=export-approve]:not(:disabled)')",'delivery-destination');await select(page,'[data-package-action=export-approve]');
  await wait(()=>existsSync(deliveryPath),'delivery-archive-created',120000);const delivery=unzipSync(await readFile(deliveryPath));
  check(Object.keys(delivery).some(name=>name.endsWith('.docx'))&&Object.keys(delivery).some(name=>name.endsWith('.json')),expectedChannel+'-delivery-archive');
  await select(page,'#app-sidebar [data-nav-settings]');await ready(page,"document.querySelector('[data-screen=settings]')",'settings-storage');
  await click(page,'数据与存储');await ready(page,"document.querySelector('.data-storage-summary')",'storage');
  check(await page.evaluate(`(()=>{const node=document.querySelector('.data-storage-summary');return node.dataset.runtimeForm==='packaged'&&node.dataset.channel===${JSON.stringify(expectedChannel)}&&document.querySelector('[data-product-data-root]')?.textContent===${JSON.stringify(expectedDataRoot)}})()`),expectedChannel+'-data-isolation');

  at(expectedChannel+'-automatic-backup-restore');
  await ready(page,"document.querySelector('[data-scheduled-backup-switch]')",'backup-switch');await select(page,'[data-scheduled-backup-switch]');
  await ready(page,"window.ai7.inspectScheduledBackups().then(v=>v.total>0&&!v.backingUp&&v.lastFailure===null)",'automatic-backup-created',120000);
  const backup=await page.evaluate('window.ai7.inspectScheduledBackups().then(v=>({location:v.location,fileName:v.backups[0].fileName}))');
  const backupPath=join(backup.location,backup.fileName),backupFiles=unzipSync(await readFile(backupPath));
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
 }finally{await browser?.close();}
}

try{
 try{const previous=JSON.parse(await readFile('C:/ai7/results/beta-last-run.json','utf8'));await cleanupInstallation(join(previous.testRoot,'installed'));}catch(e){if(e.code!=='ENOENT')throw e;}
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
 const temp=await realpath(await mkdtemp(join(tmpdir(),'ai7-beta-package-')));report.testRoot=temp;
 const input=join(temp,'public-sample1-objects.docx');
 await composeExportAdmittedDocx(input,{endnote:{block:15,noteSourceBlock:22},source:'sample1.docx',startBlock:1,blocks:30,title:'Beta sample1',header:{sourceBlock:20},styledRun:{block:13},comment:{block:8,from:10,to:20,author:'示例作者',text:{block:14,from:0,to:10}},replacement:{block:10,from:5,to:9,author:'示例作者',date:'2026-09-01T10:02:00Z',insert:{block:14,from:0,to:6}}});
 await addReadOnlySourceObjects(input);
 const noteParts=unzipSync(await readFile(input));check(Boolean(noteParts['word/endnotes.xml'])&&strFromU8(noteParts['word/document.xml']).includes('<w:endnoteReference w:id="1"/>')&&strFromU8(noteParts['word/_rels/document.xml.rels']).includes('Target="endnotes.xml"')&&strFromU8(noteParts['[Content_Types].xml']).includes('PartName="/word/endnotes.xml"'),'composed-endnote-archive');
 const installed=join(temp,'installed');const executable=join(installed,'AI7.exe');
 const env=selfCheckEnvironment(executable);env.LOCALAPPDATA=join(temp,'local');await mkdir(env.LOCALAPPDATA,{recursive:true});env.APPDATA=join(temp,'roaming');await mkdir(env.APPDATA,{recursive:true});
 const priorSetup='C:/ai7/beta-inputs/AI7-0.4.1-win-x64-setup.exe';
 check(createHash('sha256').update(await readFile(priorSetup)).digest('hex')==='3df2653125ace44b58dd8e5cce458a14d0937080906cf6b38684b62793cb7927','trusted-prior-installer');
 at('prior-install');run(priorSetup,['/S','/D='+installed]);check(existsSync(executable),'prior-nsis-install');
 const priorCheck=JSON.parse(run(executable,['--self-check'],env).trim());
 check(priorCheck.softwareVersion==='0.4.1'&&priorCheck.buildIdentity.sourceCommit==='754f1bdc541f69bc5adf573b9d70116004982cb6','prior-binary-identity');
 report.priorBook=await seedPriorBook(temp,join(env.LOCALAPPDATA,'ai7','production'));
 check(report.priorBook.softwareVersion==='0.4.1'&&report.priorBook.schemaRevision===104,'prior-public-book-schema');
 at('upgrade-to-beta');run(setup,['/S','/D='+installed]);check(existsSync(executable),'nsis-upgrade-install');
 const selfcheck=JSON.parse(run(executable,['--self-check'],env).trim());
 report.installedBuildIdentity=selfcheck.buildIdentity;
 check(selfcheck.channel==='windows-installer'&&selfcheck.writable&&selfcheck.keyringCarrier==='loaded'&&selfcheck.buildIdentity.sourceCommit===identity.sourceCommit,'installed-self-check');
 await walk(executable,env,'windows-installer',join(env.LOCALAPPDATA,'ai7','production'),input,join(temp,'installed-export.docx'));
 if(!STARTUP_ONLY){
 at('reinstall');run(setup,['/S','/D='+installed]);
 const after=JSON.parse(run(executable,['--self-check'],env).trim());check(after.channel==='windows-installer'&&after.store_versions==='readable','same-candidate-reinstall');
  const portableRoot=join(temp,'portable');await mkdir(portableRoot);run(join(process.env.SystemRoot,'System32','tar.exe'),['-xf',zip,'-C',portableRoot]);
 const portable=join(portableRoot,'AI7','app','AI7.exe');
 const portableEnv={...env,...selfCheckEnvironment(portable),LOCALAPPDATA:env.LOCALAPPDATA,APPDATA:env.APPDATA};
 await mkdir(join(temp,'portable-prior'));report.portablePriorBook=await seedPriorBook(join(temp,'portable-prior'),join(portableRoot,'AI7','data'));
 const portableSelfcheck=JSON.parse(run(portable,['--self-check'],portableEnv).trim());check(portableSelfcheck.channel==='windows-portable'&&portableSelfcheck.writable,'extracted-portable-self-check');
 await walk(portable,portableEnv,'windows-portable',join(portableRoot,'AI7','data'),input,join(temp,'portable-export.docx'));
 at('uninstall');const uninstaller=(await readdir(installed)).find(name=>/^Uninstall.*\.exe$/i.test(name));check(Boolean(uninstaller),'uninstaller-present');
 run(join(installed,uninstaller),['/S']);await wait(()=>!existsSync(executable),'uninstall-timeout');check(existsSync(join(env.LOCALAPPDATA,'ai7','production','store','ai7.sqlite')),'uninstall-keeps-user-data');
 }
 report.state='passed';
}catch(error){report.state='failed';report.failedStage=stage;report.failureCode=/^[a-z0-9/-]+$/.test(error?.message??'')?error.message:'unclassified';process.exitCode=1;console.error('BETA_PACKAGE/failed/'+stage);}
try{await cleanupInstallation(report.testRoot?join(report.testRoot,'installed'):null);}catch{report.installationCleanup='failed';report.state='failed';process.exitCode=1;}
try{await removeOwnedCredentials();}catch{report.credentialCleanup='failed';report.state='failed';process.exitCode=1;}
await writeFile(join(OUTPUT,'beta-acceptance.json'),JSON.stringify(report,null,2)+'\n');
await writeFile('C:/ai7/results/beta-last-run.json',JSON.stringify(report,null,2)+'\n');
console.log('BETA_PACKAGE/'+report.state);
