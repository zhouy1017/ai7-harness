import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

type Renderer = { evaluate(expression: string): Promise<unknown>; send(method: string, input: { type: string; x: number; y: number }): Promise<void> };
type WaitFor = (renderer: Renderer, expression: string, name: string) => Promise<void>;
const { pointerClick, pointerElementDescription, pointerFailureDetail } = await import(pathToFileURL(resolve('e2e/dispatch-chooser.mjs')).href) as {
  pointerClick(renderer: Renderer, waitFor: WaitFor, selector: string, name: string, options?: { rest?: boolean }): Promise<void>;
  pointerElementDescription(node: unknown): unknown;
  pointerFailureDetail(value: unknown): unknown;
};

function scene({ covered = false, moveOnPress = false, neverSettles = false, moveOnHover = false } = {}) {
  let frame = 0, pressed = false, hovered = false;
  const events: { type: string; frame: number; x: number }[] = [];
  const left = () => moveOnPress && pressed || moveOnHover && hovered ? 900 : neverSettles ? 640 + frame * 5 : [640, 650, 700, 770][Math.min(frame, 3)]!;
  const node = { tagName: 'SUMMARY', id: 'summary-toggle', className: 'summary', getAttributeNames: () => ['data-toggle'], scrollIntoView() {}, getBoundingClientRect: () => ({ left: left(), top: 300, right: left() + 110, bottom: 334, width: 110, height: 34 }), contains: (other: unknown) => other === node };
  const blocker = { tagName: 'DIV', id: 'sticky-bar', className: 'sticky overlay', getAttributeNames: () => ['data-overlay'], get textContent(): never { throw new Error('Text must never be read'); }, getAttribute(): never { throw new Error('Attribute values must never be read'); } };
  const document = { querySelector: () => node, elementFromPoint: (x: number) => covered ? blocker : x >= left() && x <= left() + 110 ? node : null };
  const renderer: Renderer = {
    evaluate: async expression => await Function('document', 'requestAnimationFrame', 'innerWidth', 'innerHeight', `return (${expression})`)(document, (callback: () => void) => queueMicrotask(() => { frame++; callback(); }), 1280, 800),
    send: async (_method, input) => { events.push({ type: input.type, frame, x: input.x }); if (input.type === 'mousePressed') pressed = true; if (input.type === 'mouseMoved') hovered = true; },
  };
  const waitFor: WaitFor = async (target, expression, name) => {
    for (let attempt = 0; attempt < 10; attempt++) if (await target.evaluate(expression)) return;
    throw new Error(name);
  };
  return { renderer, waitFor, events, blocker, node };
}

it('waits for a moving target to settle across animation frames before pressing (#1490)', async () => {
  const target = scene();
  await pointerClick(target.renderer, target.waitFor, 'button', 'attention-item');
  expect(target.events.map(event => event.type)).toEqual(['mousePressed', 'mouseReleased']);
  expect(target.events[0]!.frame).toBeGreaterThanOrEqual(4);
  expect(target.events[0]!.x).toBe(825);
});

it('never presses a covered target', async () => {
  const target = scene({ covered: true });
  await expect(pointerClick(target.renderer, target.waitFor, 'button', 'attention-item')).rejects.toThrow('attention-item-pointer-target');
  expect(target.events).toEqual([]);
});

it('still refuses a target that moves after the press', async () => {
  const target = scene({ moveOnPress: true });
  await expect(pointerClick(target.renderer, target.waitFor, 'button', 'attention-item')).rejects.toThrow('attention-item-target-moved-after-press');
  expect(target.events.map(event => event.type)).toEqual(['mousePressed']);
});

it('rests the pointer on a target the page moves before the press, follows it, and presses it once (#1526)', async () => {
  const target = scene({ moveOnHover: true });
  await pointerClick(target.renderer, target.waitFor, 'button', 'view-plan', { rest: true });
  expect(target.events.map(event => event.type)).toEqual(['mouseMoved', 'mouseMoved', 'mousePressed', 'mouseReleased']);
  expect(target.events.slice(1).every(event => event.x === 955)).toBe(true);
});

it('makes the J-11 caller await a false asynchronous actionability predicate', async () => {
  const source = readFileSync(new URL('../../e2e/run-j11.mjs', import.meta.url), 'utf8').match(/async function waitFor\(renderer,[\s\S]*?\n\}/u)?.[0];
  if (!source) throw new Error('J-11 wait seam missing');
  const wait = Function('journeyCheckFailure', `return (${source})`)((_journey: string, name: string) => new Error(name)) as (renderer: Renderer, expression: string, name: string, timeout: number) => Promise<void>;
  vi.useFakeTimers();
  try {
    const target = scene();
    const outcome = wait(target.renderer, 'Promise.resolve(false)', 'not-actionable', 1).then(() => true, () => false);
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome).toBe(false);
  } finally { vi.useRealTimers(); }
});

function j08WaitBoundary() {
  const source=readFileSync(new URL('../../e2e/run-j08.mjs',import.meta.url),'utf8').match(/async function waitFor\(renderer,[\s\S]*?\n\}/u)?.[0];
  if(!source)throw Error('J-08 wait seam missing');
  return Function('journeyCheckFailure',`return (${source})`)((_journey:string,name:string)=>Error(name));
}

it('keeps the actual J-08 wait boundary closed for resolved false, then continues on resolved true', async () => {
  vi.useFakeTimers();
  try {
    let ready=false,finished=false;
    const probe=vi.fn(async()=>ready),renderer={evaluate:async(expression:string)=>await Function('probe',`return (${expression})`)(probe)};
    const pending=j08WaitBoundary()(renderer,'probe()','asynchronous-ready',500).then(()=>{finished=true;});
    await vi.advanceTimersByTimeAsync(100);
    expect(finished).toBe(false);expect(probe.mock.calls.length).toBeGreaterThan(1);
    ready=true;await vi.advanceTimersByTimeAsync(50);await pending;expect(finished).toBe(true);
  } finally {vi.useRealTimers();}
});

it('times out at the actual J-08 wait boundary when a Promise keeps resolving false', async () => {
  vi.useFakeTimers();
  try {
    const renderer={evaluate:async(expression:string)=>await Function(`return (${expression})`)()};
    const result=j08WaitBoundary()(renderer,'Promise.resolve(false)','still-not-ready',1).then(()=>null,(error:Error)=>error.message);
    await vi.advanceTimersByTimeAsync(50);expect(await result).toBe('still-not-ready');
  } finally {vi.useRealTimers();}
});

it('never starts the background-review fixture when its plan preview does not disable models', async () => {
  const {startDraftBackgroundRefresh}=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  const renderer={evaluate:vi.fn(async()=>({scopeReady:true,prepared:true,localOnly:false,itemId:'fixture-task',runId:'fixture-run'})),send:vi.fn()};
  await expect(startDraftBackgroundRefresh(renderer,(ok:boolean,name:string)=>{if(!ok)throw Error(name);},vi.fn())).rejects.toThrow('draft-background-no-model-preview');
  expect(renderer.send).not.toHaveBeenCalled();
});

it('rejects a second stored annotation at the same span even when only the first ID is rendered', async () => {
  const source=readFileSync(new URL('../../e2e/run-j05.mjs',import.meta.url),'utf8');
  const raw=source.match(/await assertRenderer\(renderer, `([^`]+)`, 'header-annotation-service-once'\)/u)?.[1];
  if(!raw)throw Error('header service readback Journey seam missing');
  const expression=raw.replaceAll('${JSON.stringify(first)}',JSON.stringify('original-paragraph'));
  const shown={markId:'shown',kind:'annotation',blockId:'original-paragraph',fromGrapheme:34,toGrapheme:35};
  let marks=[shown],truncated=false;
  const document={querySelector:()=>({dataset:{bookId:'book'}})};
  const window={ai7:{listPriorWork:async()=>[{bookId:'book',manuscriptId:'manuscript',branchId:'branch'}],getManuscriptWindowAt:async()=>({marks,marksTruncated:truncated})}};
  const read=()=>Function('document','window','globalThis',`return (${expression})`)(document,window,{__headerAnnotationId:'shown'});
  expect(await read()).toBe(true);
  marks=[shown,{...shown,markId:'second-unrendered'}];
  expect(await read()).toBe(false);
  marks=[{...shown,markId:'different-only-id'}];expect(await read()).toBe(false);
  marks=[shown,{...shown,kind:'editor-note'},{...shown,blockId:'another-paragraph'},{...shown,fromGrapheme:33}];
  expect(await read()).toBe(true);
  truncated=true;expect(await read()).toBe(false);
});

it('reads the header refusal from the actual visible error surface, rejecting hidden or offscreen reasons', async () => {
  const {createStatusSurface}=await import('../../src/renderer/notifications.js');
  const {installMiniDom,miniDocument}=await import('../support/mini-dom.js');
  const restore=installMiniDom();
  try {
    const source=readFileSync(new URL('../../e2e/run-j05.mjs',import.meta.url),'utf8');
    const expression=source.match(/await waitFor\(renderer, `([^`]+)`, 'header-no-selection-reason'\)/u)?.[1];
    if(!expression)throw Error('header reason Journey seam missing');
    const surface=miniDocument.createElement('div');surface.id='persistence-status';miniDocument.body.append(surface);
    const status=createStatusSurface(surface as unknown as HTMLElement);
    let top=600,opacity='1';
    status('先选中一段文字，再添加备注。','error');
    const line=surface.querySelector('.status-line')!;
    line.getBoundingClientRect=()=>({left:80,right:380,top,bottom:top+30,width:300,height:30});
    const window={__j05:{notice:()=>'',composer:()=>miniDocument.querySelector('[data-mark-composer]')}};
    const document={querySelector:(selector:string)=>selector==='#persistence-status'?surface:miniDocument.querySelector(selector)};
    const read=()=>Function('document','window','getComputedStyle','innerWidth','innerHeight',`return (${expression})`)(document,window,()=>({visibility:'visible',opacity}),1008,681);
    expect(miniDocument.querySelector('[data-toast]')).toBeNull();
    expect(read()).toBe(true);
    top=700;expect(read()).toBe(false);top=600;
    opacity='0';expect(read()).toBe(false);opacity='1';
    const composer=miniDocument.createElement('section');composer.dataset['markComposer']='create-editor-note';miniDocument.body.append(composer);
    expect(read()).toBe(false);composer.remove();
    status('另一条合成错误','error');expect(read()).toBe(false);
    status('先选中一段文字，再添加备注。','error');status.clearError();expect(read()).toBe(false);
  } finally {restore();}
});

it('prepares only a local check on a punctuation-free loaded paragraph and stops on preparation failure', async () => {
  const {startDraftBackgroundRefresh}=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  const prepare=vi.fn(async(_input:unknown)=>({state:'failed'}));
  const editor={parentElement:{dataset:{}},querySelector:()=>({dataset:{blockId:'window-start'}})};
  const document={querySelector:()=>editor},window={ai7:{getManuscriptWindowAt:async()=>({blocks:[{kind:'paragraph',blockId:'punctuated',text:'公开合成。'},{kind:'paragraph',blockId:'clean',text:'公开合成'}],marks:[]}),prepareReviewRun:prepare}};
  const background={manuscriptId:'fixture-manuscript',branchId:'fixture-branch'};
  const renderer={evaluate:async(expression:string)=>await Function('document','window','__draftBackground',`return (${expression})`)(document,window,background),send:vi.fn()};
  await expect(startDraftBackgroundRefresh(renderer,(ok:boolean,name:string)=>{if(!ok)throw Error(name);},vi.fn())).rejects.toThrow('draft-background-local-prepared');
  expect(prepare).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({categoryIds:['local-text-check'],scope:{kind:'selection',fromChapterBlockId:'clean',toChapterBlockId:'clean'},localCheck:expect.objectContaining({numerals:'off',tables:{characters:true,variantWords:false,bookTerms:[],houseWordList:null}})}));
  expect(renderer.send).not.toHaveBeenCalled();
});

it('compares every existing review run before and after an operation, including when the latest run stays the same', async () => {
  const {draftReviewRunIds,draftReviewRunsUnchanged}=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let runs=[{reviewRunId:'already-completed'}],truncated=false;
  const window={ai7:{inspectReviewWorkspace:async()=>({run:runs[0],runs,runsTruncated:truncated})}};
  const renderer={evaluate:async(expression:string)=>await Function('window',`return (${expression})`)(window)};
  const check=(ok:boolean,name:string)=>{if(!ok)throw Error(name);};
  const before=await draftReviewRunIds(renderer,check,'before');
  expect(before).toEqual(['already-completed']);
  await draftReviewRunsUnchanged(renderer,check,before,'unchanged');
  runs=[...runs,{reviewRunId:'unexpected-new-run'}];
  await expect(draftReviewRunsUnchanged(renderer,check,before,'no-new-run')).rejects.toThrow('no-new-run');
  runs=[{reviewRunId:'replacement-run'}];
  await expect(draftReviewRunsUnchanged(renderer,check,before,'no-replacement')).rejects.toThrow('no-replacement');
  truncated=true;
  await expect(draftReviewRunIds(renderer,check,'all-runs')).rejects.toThrow('all-runs-complete');
});

it('rejects an identical-word draft row at another paragraph and a composer quoting another selection', async () => {
  const {assertDraftPlace}=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let top=206,quote='合';
  const block={getBoundingClientRect:()=>({left:80,bottom:200})};
  const node={getBoundingClientRect:()=>({left:80,top}),querySelector:()=>({textContent:quote})};
  const document={querySelector:(selector:string)=>selector.includes('[data-block-id=')?block:node};
  const proof={text:new Map([['original-paragraph','合成范围']])};
  const renderer={evaluate:async(expression:string)=>await Function('document','__draftProof',`return (${expression})`)(document,proof)};
  const check=(ok:boolean,name:string)=>{if(!ok)throw Error(name);};
  await assertDraftPlace(renderer,check,'row','original-paragraph',0,1,'row');
  await assertDraftPlace(renderer,check,'composer','original-paragraph',0,1,'range',true);
  top=306;
  await expect(assertDraftPlace(renderer,check,'row','original-paragraph',0,1,'wrong-row')).rejects.toThrow('wrong-row');
  top=206;quote='成';
  await expect(assertDraftPlace(renderer,check,'composer','original-paragraph',0,1,'wrong-selection',true)).rejects.toThrow('wrong-selection');
  quote='合成';
  await expect(assertDraftPlace(renderer,check,'composer','original-paragraph',0,1,'wrong-length',true)).rejects.toThrow('wrong-length');
});


it('records the covering element and four geometry frames without reading text or attribute values (#1433 hosted diagnosis)', async () => {
  const target = scene({ covered: true });
  let failure: { pointerFailure?: { frames: Array<{ hit: { tag: string; id: string; classes: string[]; data: string[] }; contains: boolean }> } } | undefined;
  try { await pointerClick(target.renderer, target.waitFor, 'button', 'covered-summary'); }
  catch (error) { failure = error as typeof failure; }
  expect(failure?.pointerFailure?.frames).toHaveLength(4);
  expect(failure?.pointerFailure?.frames.every(frame => !frame.contains && frame.hit.tag === 'div' && frame.hit.id === 'sticky-bar' && frame.hit.data[0] === 'data-overlay')).toBe(true);
  expect(target.events).toEqual([]);
});

it('caps pointer metadata and reconstructs only names and geometry (#1433 hosted diagnosis)', () => {
  const descriptor = pointerElementDescription({ tagName: 'DIV', id: 'x'.repeat(5000), className: Array(50).fill('c'.repeat(500)).join(' '),
    getAttributeNames: () => Array.from({ length: 50 }, (_, index) => `data-${index}-${'n'.repeat(500)}`),
    get textContent(): never { throw new Error('Text must never be read'); }, getAttribute(): never { throw new Error('Attribute values must never be read'); } });
  const detail = pointerFailureDetail({ viewport: [1008, 681], target: descriptor, textContent: 'private-payload',
    frames: Array.from({ length: 4 }, () => ({ rect: [1, 2, 3, 4], point: [2.5, 4], hit: descriptor, contains: false, attributeValue: 'private-payload' })) });
  expect(detail).not.toBeNull();
  expect(JSON.stringify(detail).length).toBeLessThanOrEqual(4096);
  expect(JSON.stringify(detail)).not.toContain('private-payload');
  expect(pointerFailureDetail({ viewport: [1008, 681], frames: Array(5).fill({}) })).toBeNull();
});


it('distinguishes a target that never settles from a covering element (#1433 hosted diagnosis)', async () => {
  const target = scene({ neverSettles: true });
  let failure: { pointerFailure?: { frames: Array<{ rect: number[]; contains: boolean }> } } | undefined;
  try { await pointerClick(target.renderer, target.waitFor, 'summary', 'moving-summary'); }
  catch (error) { failure = error as typeof failure; }
  expect(failure?.pointerFailure?.frames.every(frame => frame.contains)).toBe(true);
  expect(new Set(failure?.pointerFailure?.frames.map(frame => frame.rect[0])).size).toBe(4);
  expect(target.events).toEqual([]);
});


it('captures the covering ancestor chain and its rectangles only in the first frame (#1433)', async () => {
  const target = scene({ covered: true });
  let tableReads = 0, screenReads = 0;
  const screen = { tagName: 'SECTION', id: 'editor-screen', className: 'editor-shell', getAttributeNames: () => ['data-screen'],
    hasAttribute: (name: string) => name === 'data-screen', getBoundingClientRect: () => { screenReads++; return { left: 200, top: 30, width: 800, height: 700 }; } };
  const table = { tagName: 'TABLE', id: '', className: 'manuscript-table', getAttributeNames: () => ['data-table-id'], parentElement: screen,
    getBoundingClientRect: () => { tableReads++; return { left: 200, top: 300, width: 1800, height: 100 }; } };
  Object.assign(target.blocker, { parentElement: table });
  let failure: { pointerFailure?: { coveringAncestors: Array<{ tag: string; rect: number[] }> } } | undefined;
  try { await pointerClick(target.renderer, target.waitFor, 'summary', 'covered-summary'); }
  catch (error) { failure = error as typeof failure; }
  expect(failure?.pointerFailure?.coveringAncestors.map(entry => entry.tag)).toEqual(['table', 'section']);
  expect(failure?.pointerFailure?.coveringAncestors[0]?.rect).toEqual([200, 300, 1800, 100]);
  expect(tableReads).toBe(1); expect(screenReads).toBe(1);
});

it('retains twelve ancestor rectangles while capping the complete structural detail at 4 KiB (#1433)', () => {
  const descriptor = { tag: 'section', id: 'i'.repeat(64), classes: Array(6).fill('c'.repeat(32)), data: Array(6).fill('data-' + 'n'.repeat(27)) };
  const rect = [12345678.1234567, -12345678.1234567, 12345678.1234567, 12345678.1234567];
  const detail = pointerFailureDetail({ viewport: [1280, 800], target: descriptor,
    frames: Array.from({ length: 4 }, () => ({ rect, point: rect.slice(0, 2), hit: descriptor, contains: false })),
    coveringAncestors: Array.from({ length: 12 }, () => ({ ...descriptor, rect, textContent: 'private-payload' })) }) as { coveringAncestors: Array<{ rect: number[] }> } | null;
  expect(detail?.coveringAncestors).toHaveLength(12);
  expect(detail?.coveringAncestors.every(entry => JSON.stringify(entry.rect) === JSON.stringify(rect))).toBe(true);
  expect(JSON.stringify(detail).length).toBeLessThanOrEqual(4096);
  expect(JSON.stringify(detail)).not.toContain('private-payload');
});

it('attaches admitted four-frame action geometry and card/pane ancestors to a failing card assertion (#1661)', async () => {
  const { assertCardActionReachable } = await import(pathToFileURL(resolve('e2e/marks-paging.mjs')).href) as {
    assertCardActionReachable(renderer: Renderer, check: (condition: boolean, name: string) => void, waitFor: WaitFor, selector: string, name: string): Promise<void>;
  };
  const target = scene({ covered: true });
  const ancestor = (className: string, parentElement?: unknown) => ({ tagName: 'DIV', id: '', className, parentElement,
    getAttributeNames: () => ['data-pane'], hasAttribute: () => false,
    getBoundingClientRect: () => ({ left: 600, top: 250, width: 300, height: 409 }),
    get textContent(): never { throw new Error('Text must never be read'); }, getAttribute(): never { throw new Error('Values must never be read'); } });
  Object.assign(target.node, { tagName: 'BUTTON', parentElement: ancestor('manuscript-comments-card', ancestor('manuscript-comments-scroll', ancestor('manuscript-comments-pane'))) });
  const renderer: Renderer = { ...target.renderer, evaluate: expression => expression.includes('const card=document.querySelector(')
    ? Promise.resolve({ branch: 'fits', whole: false, action: false }) : target.renderer.evaluate(expression) };
  let failure: { message: string; pointerFailure?: { frames: Array<{ contains: boolean }>; coveringAncestors: Array<{ classes: string[] }> } } | undefined;
  try { await assertCardActionReachable(renderer, (condition, name) => { if (!condition) throw new Error(name); }, async () => {}, '[data-comment-card]', 'card-action'); }
  catch(error) { failure = error as typeof failure; }
  expect(failure?.message).toBe('card-action-arrival');
  expect(failure?.pointerFailure?.frames).toHaveLength(4);
  expect(failure?.pointerFailure?.frames.every(frame => !frame.contains)).toBe(true);
  expect(failure?.pointerFailure?.coveringAncestors.map(node => node.classes[0])).toEqual(['manuscript-comments-card', 'manuscript-comments-scroll', 'manuscript-comments-pane']);
  expect(target.events).toEqual([]);
});


it('keeps a header geometry failure when its diagnostic capture also throws', async () => {
  const { assertCommentsHeader } = await import(pathToFileURL(resolve('e2e/marks-paging.mjs')).href);
  const primary = new Error('header-rest');
  const renderer = { evaluate: vi.fn().mockRejectedValue(new Error('page gone')), send: vi.fn() };
  await expect(assertCommentsHeader(renderer, () => {}, async () => { throw primary; }, 'header')).rejects.toBe(primary);
  expect(primary).toHaveProperty('pointerFailure', { unavailable: true });
});

it.each([{ top: 122.4, count: 2, failed: false, passes: true }, { top: 150, count: 2, failed: false, passes: false }, { top: 146.4, count: 1, failed: true, passes: true }, { top: 169, count: 1, failed: true, passes: false }, { top: 101.6, count: 1, failed: false, covered: 'filter', passes: true }, { top: 101.6, count: 1, failed: false, covered: 'other', passes: false }, { top: 146.4, count: 1, failed: true, covered: 'filter', passes: false }])('bounds the entire top area at $top (failure $failed) and restores caller sampling emulation', async ({ top, count, failed, covered, passes }) => {
  const { sampleCommentsHeaderSizes } = await import(pathToFileURL(resolve('e2e/marks-paging.mjs')).href);
  const methods: string[] = [];
  const caller = { width: 1008, height: 681, deviceScaleFactor: 1, mobile: false };
  const calls: unknown[] = [];
  const facts = { viewport: [1164, 781], heading: 34, filters: 24, summaryVisible: true, summaryOneLine: true, filterRowFits: true, fullTitles: true, topArea: top,
    rows: [{ aligned: true, inside: true }], notices: [{ kind: 'disclosure', visible: count === 2, oneLine: true, inside: true, button: true, buttonOnTop: true }, { kind: 'paging', visible: true, failed, whole: true, oneLine: !failed, inside: true, button: true, buttonOnTop: covered === undefined, coveredByFilter: covered === 'filter' }] };
  const renderer = { evaluate: async (expression: string) => expression.includes('devicePixelRatio') ? caller : expression.includes('const describe=') ? { unavailable: true } : facts,
    send: async (method: string, parameters: unknown) => { methods.push(method); calls.push(parameters); } };
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const check = (condition: boolean) => { if (!condition) throw new Error('top-area'); };
    const outcome = sampleCommentsHeaderSizes(renderer, check, async () => {}, 'header');
    if (passes) await expect(outcome).resolves.toBeUndefined(); else await expect(outcome).rejects.toThrow('top-area');
    expect(methods.at(-1)).toBe('Emulation.setDeviceMetricsOverride');
    expect(calls.at(-1)).toEqual(caller);
    expect(methods.filter(method => method === 'Emulation.setDeviceMetricsOverride')).toHaveLength(passes ? 3 : 2);
  } finally { log.mockRestore(); }
});


it('attaches sanitized geometry when a draft control disappears after the stable-frame wait (#1678)', async () => {
  const { draftClick } = await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  const primary = new Error('reply-draft-late-open-hit');
  const metadata = { viewport: [1008, 681], target: { tag: 'button', classes: ['btn'], data: ['data-mark-action'], textContent: 'private-draft' },
    frames: [{ rect: [700, 400, 80, 28], point: [740, 414], hit: null, contains: false }],
    coveringAncestors: [{ tag: 'div', classes: ['manuscript-comments-scroll'], data: [], rect: [690, 200, 300, 210], title: 'private-draft' }], body: 'private-draft' };
  const renderer = { evaluate: vi.fn(async (expression: string) => expression.includes('const describe=') ? metadata : null), send: vi.fn() };
  let failure: unknown;
  try { await draftClick(renderer, () => { throw primary; }, async () => {}, '[data-mark-action="reply"]', 'reply-draft-late-open'); }
  catch (error) { failure = error; }
  expect(failure).toBe(primary);
  expect(failure).toHaveProperty('pointerFailure', pointerFailureDetail(metadata));
  expect(JSON.stringify(failure)).not.toContain('private-draft');
  expect(renderer.send).not.toHaveBeenCalled();
});


it('samples a draft control on two consecutive animation frames after its reply layout changes (#1678)', async () => {
  const { draftClick } = await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let frame = 0; const presses: number[] = [];
  const pane = { parentElement: null, clientLeft: 0, clientTop: 0, clientWidth: 300, clientHeight: 400, getBoundingClientRect: () => ({ left: 600, top: 100, bottom: 500 }) };
  const node = { parentElement: pane, matches: () => false,
    getBoundingClientRect: () => ({ left: frame === 1 ? 715 : 700, top: 300, right: frame === 1 ? 795 : 780, bottom: 328, width: 80, height: 28 }), contains: (hit: unknown) => hit === node,
    get scrollIntoView(): never { throw new Error('No scripted scroll is allowed'); } };
  const document = { createRange: () => ({ selectNodeContents() {} }), querySelector: () => node, elementFromPoint: () => node };
  const renderer = { evaluate: async (expression: string) => Function('document', 'requestAnimationFrame', 'innerWidth', 'innerHeight', 'getComputedStyle', 'setTimeout', `return (${expression})`)(document,
    (callback: () => void) => queueMicrotask(() => { frame++; callback(); }), 1008, 681, () => ({ overflowY: 'auto' }), (callback: () => void) => callback()),
    send: async (_method: string, event: { type: string }) => { if (event.type === 'mousePressed') presses.push(frame); } };
  const wait = async (_renderer: unknown, expression: string) => {
    for (let attempt = 0; attempt < 10; attempt++) if (await renderer.evaluate(expression)) return;
    throw new Error('draft-layout-never-stable');
  };
  await draftClick(renderer, (condition: boolean, name: string) => { if (!condition) throw new Error(name); }, wait, 'button', 'late-reply');
  expect(presses).toEqual([4]);
});


it('lets Tab-driven card layout settle before accepting an already focused reply control (#1689)', async () => {
  const { draftTabTo } = await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let frame = 0; const node = { closest: () => ({ dataset: { selected: 'true' } }), getBoundingClientRect: () => ({ width: 80, height: frame >= 2 ? 28 : 0 }) };
  const document = { activeElement: node, querySelector: () => node };
  const renderer = { evaluate: async (expression: string) => Function('document','requestAnimationFrame',`return (${expression})`)(document,(callback: () => void) => queueMicrotask(() => { frame++; callback(); })), send: vi.fn() };
  await draftTabTo(renderer, 'button', (condition: boolean) => { expect(condition).toBe(true); }, 'reply-focus');
  expect(frame).toBeGreaterThanOrEqual(2); expect(renderer.send).not.toHaveBeenCalled();
});


it('does not Tab past a reply before the focused card has expanded (#1689)', async () => {
  const { draftTabTo } = await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let expanded = false, pending = false; const before = {}, card = {}, after = {};
  const reply = { closest: () => ({ dataset: { selected: 'true' } }), getBoundingClientRect: () => ({ width: 80, height: expanded ? 28 : 0 }) };
  const document = { activeElement: before as unknown, querySelector: () => reply };
  const renderer = { evaluate: async (expression: string) => Function('document','requestAnimationFrame',`return (${expression})`)(document,(callback: () => void) => queueMicrotask(() => { if (pending) { expanded = true; pending = false; } callback(); })),
    send: async (_method: string, event: { type: string; key?: string }) => {
      if (event.type !== 'keyDown' || event.key !== 'Tab') return;
      document.activeElement = document.activeElement === before ? (pending = true, card) : document.activeElement === card ? expanded ? reply : after : before;
    } };
  await draftTabTo(renderer, 'reply', (condition: boolean) => { expect(condition).toBe(true); }, 'reply-focus');
  expect(document.activeElement).toBe(reply); expect(expanded).toBe(true);
});

it.each([
  { name:'horizontal overflow', box:[100,120,240,148], passes:false },
  { name:'left border', box:[100,120,180,148], passes:false },
  { name:'right border', box:[130,120,210,148], passes:false },
  { name:'top border', box:[110,100,190,128], passes:false },
  { name:'bottom border', box:[110,175,190,203], passes:false },
  { name:'whole client box', box:[110,120,190,148], passes:true },
])('requires both clipped axes of the client box before a draft press: $name', async ({box,passes}) => {
  const { draftClick } = await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  const pane={parentElement:null,clientLeft:8,clientTop:6,clientWidth:100,clientHeight:90,getBoundingClientRect:()=>({left:100,top:100,right:216,bottom:202})};
  const [left,top,right,bottom]=box as [number,number,number,number];
  const node={parentElement:pane,matches:()=>false,contains:(hit:unknown)=>hit===node,getBoundingClientRect:()=>({left,top,right,bottom,width:right-left,height:bottom-top})};
  const document={createRange:()=>({selectNodeContents(){}}),querySelector:()=>node,elementFromPoint:()=>node};
  const renderer={evaluate:async(expression:string)=>expression.includes('const describe=')?null:Function('document','requestAnimationFrame','innerWidth','innerHeight','getComputedStyle','setTimeout',`return (${expression})`)(document,(callback:()=>void)=>queueMicrotask(callback),1008,681,()=>({overflowX:'hidden',overflowY:'auto'}),(callback:()=>void)=>callback()),send:vi.fn()};
  const wait=async(_renderer:unknown,expression:string)=>{if(!await renderer.evaluate(expression))throw new Error('clipped');};
  const press=draftClick(renderer,(value:boolean)=>{if(!value)throw new Error('hit');},wait,'button','draft');
  if(passes){await expect(press).resolves.toBeUndefined();expect(renderer.send).toHaveBeenCalledTimes(3);}
  else {await expect(press).rejects.toThrow('clipped');expect(renderer.send).not.toHaveBeenCalled();}
});

it.each(['auto','confirm','direct'].flatMap(original=>[false,true].map(blockRestore=>({original,blockRestore}))))('restores $original and preserves the edit failure if restore is blocked: $blockRestore', async ({original,blockRestore}) => {
  const { withDraftDirectEdit }=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let current=original; const chosen:string[]=[];
  const buttons=['menu','direct','auto','confirm'].map((method,index)=>({method,parentElement:null,matches:()=>false,
    dataset:{editMethod:method},getAttribute:()=>String(current===method),getBoundingClientRect:()=>({left:index*100,top:10,right:index*100+80,bottom:40,width:80,height:30}),contains:(hit:unknown)=>hit===buttons[index]}));
  const document={createRange:()=>({selectNodeContents(){}}),querySelector:(selector:string)=>selector.includes('[aria-checked="true"]')?buttons.find(node=>node.method===current):selector.includes('input-mode-toggle')?buttons[0]:buttons.find(node=>selector.includes(`"${node.method}"`)&&!(blockRestore&&chosen.length===3&&node.method===original)),elementFromPoint:(x:number)=>buttons[Math.floor(x/100)]};
  const renderer={evaluate:async(expression:string)=>Function('document','requestAnimationFrame','innerWidth','innerHeight','setTimeout',`return (${expression})`)(document,(callback:()=>void)=>queueMicrotask(callback),1008,681,(callback:()=>void)=>callback()),
    send:async(_method:string,event:{type:string;x:number})=>{if(event.type==='mouseReleased'){const method=buttons[Math.floor(event.x/100)]!.method;chosen.push(method);if(method!=='menu')current=method;}}};
  const failure=new Error('readback');const edit=vi.fn(async()=>{expect(current).toBe('direct');throw failure;});
  const wait=async(_renderer:unknown,expression:string)=>{expect(await renderer.evaluate(expression)).toBe(true);};
  await expect(withDraftDirectEdit(renderer,(ok:boolean)=>{expect(ok).toBe(true);},wait,edit)).rejects.toBe(failure);
  expect(edit).toHaveBeenCalledTimes(1); expect(current).toBe(blockRestore&&original!=='direct'?'direct':original);
  if(original!=='direct')expect(chosen).toEqual(blockRestore?['menu','direct','menu']:['menu','direct','menu',original]);else expect(chosen).toEqual([]);
});

it.each(['viewport','transformed','ordinary'])('checks the actual clipping chain for a %s menu', async kind => {
  const { draftClick }=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  const shell={parentElement:null,clientLeft:0,clientTop:0,clientWidth:500,clientHeight:600,getBoundingClientRect:()=>({left:80,top:60,right:580,bottom:660})};
  const panel={parentElement:shell,clientLeft:1,clientTop:1,clientWidth:366,clientHeight:162,getBoundingClientRect:()=>({left:48,top:150,right:416,bottom:314})};
  const button={parentElement:panel,matches:()=>false,contains:(node:unknown)=>node===button,getBoundingClientRect:()=>({left:54,top:257,right:410,bottom:307,width:356,height:50})};
  const document={querySelector:()=>button,createRange:()=>({selectNodeContents(){}}),elementFromPoint:()=>button};
  const style=(node:unknown)=>({position:node===panel&&kind!=='ordinary'?'fixed':'static',overflowX:node===shell?'hidden':'auto',overflowY:node===shell?'hidden':'auto',transform:node===shell&&kind==='transformed'?'matrix(1,0,0,1,0,0)':'none',filter:'none',perspective:'none',contain:'none',willChange:'auto'});
  const renderer={evaluate:async(expression:string)=>expression.includes('const describe=')?null:Function('document','getComputedStyle','requestAnimationFrame','innerWidth','innerHeight','setTimeout',`return (${expression})`)(document,style,(callback:()=>void)=>queueMicrotask(callback),1164,781,(callback:()=>void)=>callback()),send:vi.fn()};
  const wait=async(_renderer:unknown,expression:string,name:string)=>{if(!await renderer.evaluate(expression))throw Error(name);};
  const result=draftClick(renderer,(ok:boolean,name:string)=>{if(!ok)throw Error(name);},wait,'button','fixed-menu');
  if(kind==='viewport'){await expect(result).resolves.toBeUndefined();expect(renderer.send).toHaveBeenCalledTimes(3);}
  else {await expect(result).rejects.toThrow('fixed-menu-visible');expect(renderer.send).not.toHaveBeenCalled();}
});

it.each([0,7])('selects with native Home and shift arrows, rejecting a clipped first line at grapheme %s', async home => {
  const { draftSelect }=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let anchor=15,head=15; const keys:Array<[string,number]>=[];
  const block={parentElement:null,matches:()=>true,contains:(hit:unknown)=>hit===block};
  const editor={dataset:{get selectionSnapshot(){return JSON.stringify({anchor:{blockId:'block',grapheme:anchor},head:{blockId:'block',grapheme:head}});}}};
  const scroll={dataset:{},clientLeft:0,clientTop:0,clientWidth:1008,clientHeight:681,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0,right:1008,bottom:681}),contains:(node:unknown)=>node===block};
  const document={querySelector:(selector:string)=>selector==='.editor-window'?scroll:selector.includes('[data-block-id=')?block:editor,createRange:()=>({selectNodeContents(){},getClientRects:()=>[{left:10,top:10,right:210,bottom:30,width:200,height:20}]}),elementFromPoint:()=>block};
  const renderer={evaluate:async(expression:string)=>expression.includes('const describe=')?null:Function('document','requestAnimationFrame','innerWidth','innerHeight','setTimeout',`return (${expression})`)(document,(callback:()=>void)=>queueMicrotask(callback),1008,681,(callback:()=>void)=>callback()),send:async(_method:string,event:{type:string;key:string;modifiers:number})=>{if(event.type!=='keyDown')return;keys.push([event.key,event.modifiers]);if(event.key==='Home')anchor=head=home;else if(event.key==='ArrowRight'){head++;if(event.modifiers!==8)anchor=head;}}};
  const wait=async(_renderer:unknown,expression:string,name:string)=>{if(!await renderer.evaluate(expression))throw Error(name);};
  const result=draftSelect(renderer,(ok:boolean)=>{expect(ok).toBe(true);},wait,'block',2,5,'range');
  if(home===0){await expect(result).resolves.toBeUndefined();expect([anchor,head]).toEqual([2,5]);expect(keys).toEqual([['Home',0],['ArrowRight',0],['ArrowRight',0],['ArrowRight',8],['ArrowRight',8],['ArrowRight',8]]);}
  else {await expect(result).rejects.toThrow('range-start');expect(keys).toEqual([['Home',0]]);}
});

it('reaches the first text line of a tall paragraph before native Home and selection', async () => {
  const {draftSelect}=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let offset=300,anchor=90,head=90,clickedFirst=false;
  const events:Array<{type:string;key?:string;deltaY?:number}>=[];
  const first=()=>({left:100,right:300,top:390-offset,bottom:414-offset,width:200,height:24});
  const scroll={parentElement:null,dataset:{},clientLeft:0,clientTop:0,clientWidth:525,clientHeight:510,get scrollTop(){return offset;},set scrollTop(_value:number){throw Error('scripted scroll forbidden');},getBoundingClientRect:()=>({left:80,top:150,right:605,bottom:660}),contains:(node:unknown):boolean=>node===block};
  const block={parentElement:scroll,matches:()=>true,contains:(node:unknown)=>node===block,getBoundingClientRect:()=>({...first(),height:1000,bottom:1390-offset})};
  const editor={dataset:{get selectionSnapshot(){return JSON.stringify({anchor:{blockId:'block',grapheme:anchor},head:{blockId:'block',grapheme:head}});}}};
  const document={querySelector:(selector:string)=>selector==='.editor-window'?scroll:selector.includes('[data-block-id=')?block:editor,createRange:()=>({selectNodeContents(){},getClientRects:()=>[first(),{...first(),top:520-offset,bottom:544-offset}]}),elementFromPoint:()=>block};
  const renderer={evaluate:async(expression:string)=>expression.includes('const describe=')?null:Function('document','requestAnimationFrame','innerWidth','innerHeight','setTimeout','getComputedStyle',`return (${expression})`)(document,(callback:()=>void)=>queueMicrotask(callback),1008,681,(callback:()=>void)=>callback(),()=>({position:'static',overflowX:'auto',overflowY:'auto',transform:'none',filter:'none',perspective:'none',contain:'none',willChange:'auto'})),send:async(_method:string,event:{type:string;key?:string;modifiers?:number;deltaY?:number;y?:number})=>{events.push(event);if(event.type==='mouseWheel')offset=Math.max(0,offset+event.deltaY!);if(event.type==='mousePressed')clickedFirst=event.y===first().top+12;if(event.type==='keyDown'&&event.key==='Home')anchor=head=clickedFirst?0:70;if(event.type==='keyDown'&&event.key==='ArrowRight'){head++;if(event.modifiers!==8)anchor=head;}}};
  const wait=async(_renderer:unknown,expression:string,name:string)=>{if(!await renderer.evaluate(expression))throw Error(name);};
  await draftSelect(renderer,(ok:boolean,name:string)=>{if(!ok)throw Error(name);},wait,'block',2,5,'range');
  expect([anchor,head]).toEqual([2,5]);expect(clickedFirst).toBe(true);
  expect(events.some(event=>event.type==='mouseWheel'&&event.deltaY!<0)).toBe(true);
  expect(block.getBoundingClientRect().bottom).toBeGreaterThan(660);
});

it('reaches Reply backwards from its appended textarea without tabbing out and hiding the card (#1689 guest diagnosis)', async () => {
  const { draftTabTo }=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let leftCard=false; const modifiers:number[]=[];
  const reply={closest:()=>({dataset:{selected:String(!leftCard)}}),getBoundingClientRect:()=>({width:leftCard?0:80,height:leftCard?0:28})},resolveButton={},input={},send={},cancel={},other={};
  const order=[reply,resolveButton,input,send,cancel,other];const document={activeElement:input,querySelector:()=>reply};
  const renderer={evaluate:async(expression:string)=>expression.includes('const describe=')?null:Function('document','requestAnimationFrame',`return (${expression})`)(document,(callback:()=>void)=>queueMicrotask(callback)),send:async(_method:string,event:{type:string;key:string;modifiers:number})=>{if(event.type!=='keyDown'||event.key!=='Tab')return;modifiers.push(event.modifiers);document.activeElement=order[(order.indexOf(document.activeElement)+(event.modifiers===8?-1:1)+order.length)%order.length]!;if(document.activeElement===other)leftCard=true;}};
  await draftTabTo(renderer,'reply',(ok:boolean,name:string)=>{if(!ok)throw Error(name);},'late-reply',{backwards:true});
  expect(document.activeElement).toBe(reply);expect(leftCard).toBe(false);expect(modifiers).toEqual([8,8]);
});

it.each([{top:747.796875,covered:false,moving:false},{top:94.953125,covered:false,moving:false},{top:3562,covered:false,moving:false},{top:300,covered:false,moving:false},{top:3562,covered:true,moving:false},{top:3562,covered:false,moving:true}])('returns to the loaded anchor at $top through an uncovered wheel target: $covered; pending scroll: $moving', async ({top,covered,moving}) => {
  const { draftWheelToAnchor }=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  let offset=0,frames=0;const events:Array<{type:string;deltaY?:number}>=[];
  const editor={},anchor={getBoundingClientRect:()=>({left:253,right:288,top:top-offset,bottom:top-offset+27,width:35,height:27}),focus(){throw Error('must not focus the draft');}};
  const scroll={dataset:{scrolling:moving?'true':undefined},clientLeft:0,clientTop:0,clientWidth:525,clientHeight:510,get scrollTop(){return offset;},set scrollTop(_value:number){throw Error('must not scroll by script');},getBoundingClientRect:()=>({left:80,top:150,right:605,bottom:660,width:525,height:510}),contains:(node:unknown)=>node===editor};
  const focused=top<150?{kind:'composer-field'}:editor;
  const document={activeElement:focused,querySelector:(selector:string)=>selector==='.editor-window'?scroll:anchor,elementFromPoint:()=>covered?{}:editor};
  const renderer={evaluate:async(expression:string)=>expression.includes('const describe=')?null:Function('document','requestAnimationFrame','innerWidth','innerHeight',`return (${expression})`)(document,(callback:()=>void)=>queueMicrotask(()=>{if(++frames>=4)scroll.dataset.scrolling=undefined;callback();}),1008,681),send:async(_method:string,event:{type:string;deltaY?:number})=>{events.push(event);if(event.type==='mouseMoved'&&moving&&scroll.dataset.scrolling==='true')offset+=20;if(event.type==='mouseWheel'){if(scroll.dataset.scrolling==='true')throw Error('wheel-before-scroll-idle');offset+=event.deltaY!;if(moving){frames=0;scroll.dataset.scrolling='true';}};}};
  const j05Source=top<150||top===747.796875?readFileSync(new URL('../../e2e/run-j05.mjs',import.meta.url),'utf8').match(/async function waitFor\(renderer,[\s\S]*?\n\}/u)?.[0]:null;
  const wait=j05Source?Function('journeyCheckFailure',`return (${j05Source})`)((_journey:string,name:string)=>Error(name)):j08WaitBoundary();
  const result=draftWheelToAnchor(renderer,(ok:boolean,name:string)=>{if(!ok)throw Error(name);},wait,'.anchor','return-place');
  if(covered){await expect(result).rejects.toThrow('return-place-wheel-hit');expect(events).toEqual([]);}
  else {await expect(result).resolves.toBeUndefined();const r=anchor.getBoundingClientRect();expect(r.top).toBeGreaterThanOrEqual(150);expect(r.bottom).toBeLessThanOrEqual(660);expect(events.every(event=>event.type==='mouseMoved'||event.type==='mouseWheel')).toBe(true);if(top===300)expect(events).toEqual([]);else expect(events.some(event=>event.type==='mouseWheel')).toBe(true);}
  expect(document.activeElement).toBe(focused);
});

it('records a surviving card when a restored draft field is absent, preserving the primary failure and redacting values', async () => {
  const { draftGeometry }=await import(pathToFileURL(resolve('e2e/mark-drafts.mjs')).href);
  const card='[data-comment-card="card"]',field=card+' textarea',primary=Error('reply-draft-screen-kept');
  const metadata={viewport:[1008,681],target:{tag:'article',classes:['manuscript-comments-card'],data:['data-comment-card']},frames:[{rect:[700,300,280,40],point:[840,320],hit:null,contains:false}],body:'private-draft'};
  const document={querySelector:(selector:string)=>selector===card?{}:null};
  const renderer={evaluate:async(expression:string)=>expression.includes('const describe=')?expression.includes(JSON.stringify(card))?metadata:{...metadata,target:null,frames:[{rect:null,point:null,hit:null,contains:false}]}:Function('document',`return (${expression})`)(document)};
  let error:unknown;try{await draftGeometry(renderer,field,async()=>{throw primary},{fallbackSelectors:[card,'.editor-shell']});}catch(caught){error=caught;}
  expect(error).toBe(primary);expect(error).toHaveProperty('pointerFailure.target.tag','article');expect(JSON.stringify((error as {pointerFailure:unknown}).pointerFailure)).not.toContain('private-draft');
});
