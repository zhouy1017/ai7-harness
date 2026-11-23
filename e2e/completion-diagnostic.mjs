// Temporary, content-free observations for the repeated hosted J-09 completion failure.
const prefix = 'COMPLETION_DIAGNOSTIC/J-09/';
const stages = ['before-attention', 'after-attention', 'after-tasks', 'after-result', 'failed'];
const flags = ['routeRead', 'overviewRead', 'routeUnbound', 'routeMatches', 'routeOtherBook',
  'entryExists', 'entryBookMatches', 'entryRevisionMatches', 'entryAnalysisResult',
  'attentionVisible', 'tasksVisible', 'analysisVisible', 'expectedBookVisible', 'anyCard', 'expectedCard',
  'inspectedMatches', 'resultMatches', 'displayedMatches', 'resultExists', 'resultEnabled',
  'resultVisible', 'resultInWindow', 'resultHit', 'windowFocused', 'documentVisible',
  'pointerDownReceived', 'pointerUpReceived', 'clickReceived', 'trustedClickReceived'];

function safeSamples(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > stages.length) return null;
  if (new Set(value.map(sample => sample?.stage)).size !== value.length) return null;
  const allowed = ['stage', ...flags];
  if (value.some(sample => !sample || typeof sample !== 'object' || !stages.includes(sample.stage) ||
    Object.keys(sample).length !== allowed.length || Object.keys(sample).some(key => !allowed.includes(key)) ||
    flags.some(key => typeof sample[key] !== 'boolean'))) return null;
  return value.map(sample => Object.fromEntries(allowed.map(key => [key, sample[key]])));
}

/** Full Gate forwards only the fixed stages and Boolean schema, on this Journey's failure path. */
export function collectCompletionDiagnostic(result, journey, failure) {
  if (journey !== 'J-09' || failure?.location !== 'open-completion' || failure.errorClass !== 'journey-failure') return null;
  const lines = result.stderr.split(/\r?\n/u).filter(line => line.startsWith(prefix));
  if (lines.length !== 1 || lines[0].length > 16384) return null;
  try { const safe = safeSamples(JSON.parse(lines[0].slice(prefix.length))); return safe === null ? null : JSON.stringify(safe); }
  catch { return null; }
}

export async function observeCompletion(renderer, { bookId, itemId, revisionId, selector, card }) {
  const samples = [];
  await renderer.evaluate(`(() => {
    const state={pointerDownReceived:false,pointerUpReceived:false,clickReceived:false,trustedClickReceived:false};
    const listen=event=>{const button=document.querySelector(${JSON.stringify(selector)});if(!button?.contains(event.target))return;
      if(event.type==='pointerdown')state.pointerDownReceived=true;if(event.type==='pointerup')state.pointerUpReceived=true;
      if(event.type==='click'){state.clickReceived=true;state.trustedClickReceived=event.isTrusted;}};
    for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,listen,true);
    globalThis.__completionObservation={state,dispose:()=>{for(const type of ['pointerdown','pointerup','click'])document.removeEventListener(type,listen,true);}};return true;
  })()`);
  const sample = async stage => {
    const reading = await renderer.evaluate(`(async()=>{
      const [routeRead,overviewRead]=await Promise.allSettled([window.ai7.getBookWorkbenchRoute(),window.ai7.inspectTaskOverview()]);
      const route=routeRead.status==='fulfilled'?routeRead.value:undefined;
      const entry=overviewRead.status==='fulfilled'?overviewRead.value.groups.flatMap(group=>group.items).find(item=>item.itemId===${JSON.stringify(itemId)}):undefined;
      const node=document.querySelector(${JSON.stringify(selector)}),r=node?.getBoundingClientRect(),record=document.querySelector(${JSON.stringify(card)})?.dataset;
      return {routeRead:routeRead.status==='fulfilled',overviewRead:overviewRead.status==='fulfilled',routeUnbound:route===null,routeMatches:route?.bookId===${JSON.stringify(bookId)},routeOtherBook:!!route&&route.bookId!==${JSON.stringify(bookId)},
        entryExists:!!entry,entryBookMatches:entry?.bookId===${JSON.stringify(bookId)},entryRevisionMatches:entry?.result?.revisionId===${JSON.stringify(revisionId)},entryAnalysisResult:entry?.result?.kind==='analysis-revision',
        attentionVisible:!!document.querySelector('[data-screen="global-attention"]'),tasksVisible:!!document.querySelector('[data-screen="task-overview"]'),analysisVisible:!!document.querySelector('[data-screen="book-analysis"]'),expectedBookVisible:document.querySelector('[data-screen="book-analysis"] .book-analysis')?.dataset.bookId===${JSON.stringify(bookId)},anyCard:!!document.querySelector('.baseline-analysis-card'),expectedCard:!!record,
        inspectedMatches:record?.inspectedRevisionId===${JSON.stringify(revisionId)},resultMatches:record?.resultRevisionId===${JSON.stringify(revisionId)},displayedMatches:(record?.inspectedRevisionId??record?.resultRevisionId)===${JSON.stringify(revisionId)},
        resultExists:!!node,resultEnabled:!!node&&!node.disabled,resultVisible:!!r&&r.width>0&&r.height>0,resultInWindow:!!r&&r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,resultHit:!!r&&node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),
        windowFocused:document.hasFocus(),documentVisible:document.visibilityState==='visible',...globalThis.__completionObservation.state};
    })()`);
    samples.push({ stage, ...reading });
  };
  return { sample, failed: async () => { await sample('failed'); const safe=safeSamples(samples); if(safe)process.stderr.write(prefix+JSON.stringify(safe)+'\n'); },
    dispose: () => renderer.evaluate(`(()=>{globalThis.__completionObservation.dispose();delete globalThis.__completionObservation;return true;})()`) };
}
