import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

type Renderer = { evaluate(expression: string): Promise<unknown>; send(method: string, input: { type: string; x: number; y: number }): Promise<void> };
type WaitFor = (renderer: Renderer, expression: string, name: string) => Promise<void>;
const { pointerClick, pointerElementDescription, pointerFailureDetail } = await import(pathToFileURL(resolve('e2e/dispatch-chooser.mjs')).href) as {
  pointerClick(renderer: Renderer, waitFor: WaitFor, selector: string, name: string): Promise<void>;
  pointerElementDescription(node: unknown): unknown;
  pointerFailureDetail(value: unknown): unknown;
};

function scene({ covered = false, moveOnPress = false, neverSettles = false } = {}) {
  let frame = 0, pressed = false;
  const events: { type: string; frame: number; x: number }[] = [];
  const left = () => moveOnPress && pressed ? 900 : neverSettles ? 640 + frame * 5 : [640, 650, 700, 770][Math.min(frame, 3)]!;
  const node = { tagName: 'SUMMARY', id: 'summary-toggle', className: 'summary', getAttributeNames: () => ['data-toggle'], scrollIntoView() {}, getBoundingClientRect: () => ({ left: left(), top: 300, right: left() + 110, bottom: 334, width: 110, height: 34 }), contains: (other: unknown) => other === node };
  const blocker = { tagName: 'DIV', id: 'sticky-bar', className: 'sticky overlay', getAttributeNames: () => ['data-overlay'], get textContent(): never { throw new Error('Text must never be read'); }, getAttribute(): never { throw new Error('Attribute values must never be read'); } };
  const document = { querySelector: () => node, elementFromPoint: (x: number) => covered ? blocker : x >= left() && x <= left() + 110 ? node : null };
  const renderer: Renderer = {
    evaluate: async expression => await Function('document', 'requestAnimationFrame', 'innerWidth', 'innerHeight', `return (${expression})`)(document, (callback: () => void) => queueMicrotask(() => { frame++; callback(); }), 1280, 800),
    send: async (_method, input) => { events.push({ type: input.type, frame, x: input.x }); if (input.type === 'mousePressed') pressed = true; },
  };
  const waitFor: WaitFor = async (target, expression, name) => {
    for (let attempt = 0; attempt < 10; attempt++) if (await target.evaluate(expression)) return;
    throw new Error(name);
  };
  return { renderer, waitFor, events };
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
