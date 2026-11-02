/** Developer-run Windows Beta acceptance on a background test guest; no hosted gate or Provider credential. */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { selfCheckEnvironment } from '../tools/package.mjs';
import { composeExportAdmittedDocx, addReadOnlySourceObjects } from '../e2e/composed-docx.mjs';
import { build } from 'esbuild';
import { unzipSync, strFromU8 } from 'fflate';

const ROOT=resolve('.');
const RELEASE=join(ROOT,'release');
let stage='inputs';
const report={schema:'ai7.windows-beta-acceptance/1',state:'running',checks:[],limitations:[
 'Provider-free packaged compatibility; real host live quality and live /models/search account evidence are separate.',
 'Human Beta acceptance and the external editor study remain pending.',
 'The prior-version public Book is seeded through the exact 0.4.1 product store; current import/export use the actual package UI.',
]};
const check=(condition,name)=>{if(!condition)throw Error(name);report.checks.push(name);console.log('BETA_PACKAGE/pass/'+name);};
const at=(name)=>{stage=name;console.log('BETA_PACKAGE/stage/'+name);};
const run=(file,args,env=process.env)=>{const result=spawnSync(file,args,{cwd:ROOT,env,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});if(result.status!==0)throw Error('child-failed');return result.stdout;};
const wait=async(predicate,name,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}throw Error(name);};
const native=(exe,options)=>run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(ROOT,'tools','beta-native-dialog.ps1'),'-Executable',exe,...options]);

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
const boolean=async(page,expression)=>page.evaluate('Boolean('+expression+')');
const click=async(page,label)=>check(await page.evaluate(`(()=>{const node=[...document.querySelectorAll('button')].find(n=>n.textContent===${JSON.stringify(label)});if(!node||node.disabled)return false;node.click();return true})()`),'click-'+label);
const select=async(page,selector)=>check(await page.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)return false;node.click();return true})()`),'select-'+selector);
const ready=async(page,expression,name)=>wait(()=>boolean(page,expression).catch(()=>false),name,120000);

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

async function walk(executable,env,expectedChannel,expectedDataRoot,input,output){
 at(expectedChannel+'-launch');
 let browser;
 try{
  // Ordinary packaged argv: the pipe only; data location is still resolved by the actual channel.
  browser=await chromium.launch({executablePath:executable,headless:false,ignoreDefaultArgs:true,args:['--remote-debugging-pipe'],env,timeout:60000});
  if(expectedChannel==='windows-installer')native(executable,['-ButtonName','使用默认位置']);
  const page=await renderer(browser);
  await ready(page,"document.documentElement.dataset.ai7ProductReady==='true'",'product-ready');
  check(await boolean(page,"document.querySelector('[data-screen=landing]')"),expectedChannel+'-library');
  if(expectedChannel==='windows-installer'){
   check(await page.evaluate(`window.ai7.getBookOverview({bookId:${JSON.stringify(report.priorBook?.bookId)},historyCursor:null}).then(v=>v.manuscriptState.state==='populated')`),'prior-book-survives-upgrade');
   check(await page.evaluate(`window.ai7.inspectDataVersion().then(v=>v.schemaRevision===106&&v.history.some(h=>h.softwareVersion==='0.4.1')&&v.history.some(h=>h.softwareVersion==='0.5.0'))`),'upgrade-history-and-schema');
  }
  // The application presents the real six channel choices; no synthetic credential is installed.
  await select(page,'#app-sidebar [data-nav-settings]');await ready(page,"document.querySelector('[data-screen=settings]')",'settings');
  await click(page,'模型服务');await ready(page,"document.querySelector('.model-service-flow')",'models');
  check(await page.evaluate(`(()=>{const labels=[...document.querySelectorAll('[data-model-channel]')].map(n=>n.textContent);return ['OpenAI','Claude','Gemini','DeepSeek','OpenCode Go'].every(name=>labels.some(label=>label.includes(name)))})()`),expectedChannel+'-model-channels');
  check(await boolean(page,"document.querySelector('[data-action=save-channel-credential]')?.disabled"),expectedChannel+'-empty-credential');
  check(await page.evaluate(`(()=>{const root=document.querySelector('[data-screen=model-service-settings]')??document.body;return root.textContent.includes('联网检索')&&root.textContent.includes('测试检索')})()`),expectedChannel+'-search-settings');
  await select(page,'#app-sidebar [data-nav-destination=global-agent]');await ready(page,"document.querySelector('[data-global-agent-question-form]')",'global-agent');
  check(await page.evaluate(`(()=>{const node=document.querySelector('[data-global-agent=destination]');return getComputedStyle(node).display==='grid'&&document.querySelector('[data-global-agent-question-form] button[type=submit]')?.textContent==='发送问题'&&document.querySelector('#task-drawer')?.hidden===true})()`),expectedChannel+'-global-agent-layout');
  await select(page,'#app-sidebar [data-nav-destination=library]');await ready(page,"document.querySelector('[data-screen=landing]')",'library-return');
  at(expectedChannel+'-native-import');
  await click(page,'导入稿件');native(executable,['-FileName',input]);
  await ready(page,"document.querySelector('[data-screen=target]')",'import-target');
  await select(page,'input[aria-label="新建图书"]');await select(page,'input[aria-label="作为首份稿件导入"]');
  check(await page.evaluate(`(()=>{const node=document.querySelector('#book-title');node.value='Beta package compatibility';node.dispatchEvent(new Event('input',{bubbles:true}));return true})()`),'book-title');
  await click(page,'确认书名并复核');await ready(page,"document.querySelector('[data-screen=review]')",'import-review');
  check(await boolean(page,"!document.body.textContent.includes('获取并安装（保持停用）')"),expectedChannel+'-no-workspace-ceremony');
  await click(page,'新建图书并导入稿件');await ready(page,"document.querySelector('[data-screen=imported]')",'import-completed');
  await ready(page,"document.documentElement.dataset.ai7ImportCompletionAcknowledged==='true'",'import-acknowledged');
  await click(page,'打开稿件');await ready(page,"document.querySelector('[data-testid=manuscript-editor]')",'manuscript-ready');
  check(await boolean(page,"document.querySelector('.editor-shell')"),expectedChannel+'-manuscript');
  await select(page,'#app-sidebar [data-nav-book-section=deliverables]');await ready(page,"document.querySelector('[data-screen=book-deliverables]')",'deliverables');
  at(expectedChannel+'-native-docx-export');
  await select(page,'[data-export-action=open][data-export-target=current]');native(executable,['-FileName',output]);
  await ready(page,"document.querySelector('.export-receipt')?.dataset.exportOutcome==='created'",'export-created');
  const source=unzipSync(await readFile(input)), exported=unzipSync(await readFile(output));
  const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
  check(hash(source['word/media/source-preview.png'])===hash(exported['word/media/source-preview.png']),expectedChannel+'-media-fidelity');
  const table=(files)=>strFromU8(files['word/document.xml']).match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/)?.[0];
  check(table(source)===table(exported),expectedChannel+'-table-fidelity');
  await select(page,'#app-sidebar [data-nav-settings]');await ready(page,"document.querySelector('[data-screen=settings]')",'settings-storage');
  await click(page,'数据与存储');await ready(page,"document.querySelector('.data-storage-summary')",'storage');
  check(await page.evaluate(`(()=>{const node=document.querySelector('.data-storage-summary');return node.dataset.runtimeForm==='packaged'&&node.dataset.channel===${JSON.stringify(expectedChannel)}&&document.querySelector('[data-product-data-root]')?.textContent===${JSON.stringify(expectedDataRoot)}})()`),expectedChannel+'-data-isolation');
  const version=await page.evaluate('window.ai7.inspectDataVersion().then(v=>({dataVersion:v.dataVersion,history:v.history.length}))');
  check(version.dataVersion===1&&version.history>=1,expectedChannel+'-persistent-store');
 }finally{await browser?.close();}
}

try{
 check(process.platform==='win32'&&process.arch==='x64','windows-x64');
 // This runner is invoked by the host guest runner inside the guest's interactive scheduled task.
 check(/^AI7-TESTBED-0[12]$/i.test(process.env.COMPUTERNAME??''),'background-test-guest');
 const manifest=JSON.parse(await readFile(join(ROOT,'package.json'),'utf8'));
 const identity=JSON.parse(await readFile(join(ROOT,'dist/build-identity.json'),'utf8'));
 report.buildIdentity=identity;check(identity.softwareVersion===manifest.version&&!identity.dirty,'clean-build-identity');
 const setup=join(RELEASE,`AI7-${manifest.version}-win-x64-setup.exe`),zip=join(RELEASE,`AI7-${manifest.version}-win-x64-portable.zip`);
 const archive=unzipSync(await readFile(zip));const names=Object.keys(archive);
 check(names.every(name=>!/(^|\/)(?:SampleBooks|\.git|test-results)(\/|$)|\.key\.txt$|\.pem$/i.test(name)),'distribution-hygiene');
 check(names.filter(name=>name.startsWith('AI7/data/')).every(name=>name.endsWith('/')),'pristine-portable-data');
 report.assets=[];
 for(const path of [setup,zip]){const bytes=await readFile(path);report.assets.push({name:path.split(/[\\/]/).at(-1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const temp=await realpath(await mkdtemp(join(tmpdir(),'ai7-beta-package-')));report.testRoot=temp;
 const input=join(temp,'public-sample1-objects.docx');
 await composeExportAdmittedDocx(input,{source:'sample1.docx',startBlock:1,blocks:30,title:'Beta sample1',header:{sourceBlock:20},styledRun:{block:13},comment:{block:8,from:10,to:20,author:'示例作者',text:{block:14,from:0,to:10}},replacement:{block:10,from:5,to:9,author:'示例作者',date:'2026-09-01T10:02:00Z',insert:{block:14,from:0,to:6}}});
 await addReadOnlySourceObjects(input);
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
 check(selfcheck.channel==='windows-installer'&&selfcheck.writable&&selfcheck.keyringCarrier==='loaded','installed-self-check');
 await walk(executable,env,'windows-installer',join(env.LOCALAPPDATA,'ai7','production'),input,join(temp,'installed-export.docx'));
 at('reinstall');run(setup,['/S','/D='+installed]);
 const after=JSON.parse(run(executable,['--self-check'],env).trim());check(after.channel==='windows-installer'&&after.store_versions==='readable','same-candidate-reinstall');
 const portable=join(RELEASE,'AI7','app','AI7.exe');
 const portableEnv={...env,...selfCheckEnvironment(portable),LOCALAPPDATA:env.LOCALAPPDATA,APPDATA:env.APPDATA};
 await walk(portable,portableEnv,'windows-portable',join(RELEASE,'AI7','data'),input,join(temp,'portable-export.docx'));
 at('uninstall');const uninstaller=(await readdir(installed)).find(name=>/^Uninstall.*\.exe$/i.test(name));check(Boolean(uninstaller),'uninstaller-present');
 run(join(installed,uninstaller),['/S']);await wait(()=>!existsSync(executable),'uninstall-timeout');check(existsSync(join(env.LOCALAPPDATA,'ai7','production','store','ai7.sqlite')),'uninstall-keeps-user-data');
 report.state='passed';
}catch{report.state='failed';report.failedStage=stage;process.exitCode=1;console.error('BETA_PACKAGE/failed/'+stage);}
await writeFile(join(RELEASE,'beta-acceptance.json'),JSON.stringify(report,null,2)+'\n');
console.log('BETA_PACKAGE/'+report.state);
