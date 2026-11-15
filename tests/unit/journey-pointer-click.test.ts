import { expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

type Renderer = { evaluate(expression: string): Promise<unknown>; send(method: string, input: { type: string; x: number; y: number }): Promise<void> };
type WaitFor = (renderer: Renderer, expression: string, name: string) => Promise<void>;
const { pointerClick } = await import(pathToFileURL(resolve('e2e/dispatch-chooser.mjs')).href) as {
  pointerClick(renderer: Renderer, waitFor: WaitFor, selector: string, name: string): Promise<void>;
};

function scene({ covered = false, moveOnPress = false } = {}) {
  let frame = 0, pressed = false;
  const events: { type: string; frame: number; x: number }[] = [];
  const left = () => moveOnPress && pressed ? 900 : [640, 650, 700, 770][Math.min(frame, 3)]!;
  const node = { scrollIntoView() {}, getBoundingClientRect: () => ({ left: left(), top: 300, right: left() + 110, bottom: 334, width: 110, height: 34 }), contains: (other: unknown) => other === node };
  const document = { querySelector: () => node, elementFromPoint: (x: number) => !covered && x >= left() && x <= left() + 110 ? node : null };
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
