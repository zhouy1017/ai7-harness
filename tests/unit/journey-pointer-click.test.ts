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

it('forwards only bounded readiness counts and flags through hosted failure metadata', () => {
  expect(pointerFailureDetail({ kind: 'j01-readiness', options: 3, expectedSelected: false,
    label: 'private-payload', value: 'private-payload', windowTitle: 'private-payload' }))
    .toEqual({ kind: 'j01-readiness', options: 3, expectedSelected: false });
  expect(pointerFailureDetail({ kind: 'j01-readiness', options: 'private-payload' })).toBeNull();
  expect(pointerFailureDetail({ kind: 'j01-readiness', pending: -1 })).toBeNull();
  expect(pointerFailureDetail({ kind: 'j01-readiness', elapsedMs: Infinity })).toBeNull();
  expect(pointerFailureDetail({ kind: 'j01-readiness', connected: 'private-payload' })).toBeNull();
});

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

it.each([{ top: 122.4, count: 2, failed: false, passes: true }, { top: 150, count: 2, failed: false, passes: false }, { top: 146.4, count: 1, failed: true, passes: true }, { top: 169, count: 1, failed: true, passes: false }, { top: 101.6, count: 1, failed: false, covered: 'filter', passes: true }, { top: 101.6, count: 1, failed: false, covered: 'other', passes: false }, { top: 146.4, count: 1, failed: true, covered: 'filter', passes: false }])('bounds the entire top area at $top (failure $failed) and clears sampling emulation', async ({ top, count, failed, covered, passes }) => {
  const { sampleCommentsHeaderSizes } = await import(pathToFileURL(resolve('e2e/marks-paging.mjs')).href);
  const methods: string[] = [];
  const facts = { viewport: [1164, 781], heading: 34, filters: 24, summaryVisible: true, summaryOneLine: true, filterRowFits: true, fullTitles: true, topArea: top,
    rows: [{ aligned: true, inside: true }], notices: [{ kind: 'disclosure', visible: count === 2, oneLine: true, inside: true, button: true, buttonOnTop: true }, { kind: 'paging', visible: true, failed, whole: true, oneLine: !failed, inside: true, button: true, buttonOnTop: covered === undefined, coveredByFilter: covered === 'filter' }] };
  const renderer = { evaluate: async (expression: string) => expression.includes('const describe=') ? { unavailable: true } : facts,
    send: async (method: string) => { methods.push(method); } };
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const check = (condition: boolean) => { if (!condition) throw new Error('top-area'); };
    const outcome = sampleCommentsHeaderSizes(renderer, check, async () => {}, 'header');
    if (passes) await expect(outcome).resolves.toBeUndefined(); else await expect(outcome).rejects.toThrow('top-area');
    expect(methods.at(-1)).toBe('Emulation.clearDeviceMetricsOverride');
    expect(methods.filter(method => method === 'Emulation.setDeviceMetricsOverride')).toHaveLength(passes ? 2 : 1);
  } finally { log.mockRestore(); }
});
