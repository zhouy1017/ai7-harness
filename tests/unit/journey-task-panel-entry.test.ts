import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

function scene(view: string | null, heldFrames = false) {
  const source = readFileSync(new URL('../../e2e/run-j16.mjs', import.meta.url), 'utf8').match(/async function openPanel\([\s\S]*?\n\}/u)?.[0];
  if (!source) throw new Error('Task panel entry seam missing');
  const drawer = { hidden: view === null, dataset: { taskDrawerView: view } };
  const document = { querySelector: (selector: string) => selector === '#task-drawer' ? drawer : null,
    querySelectorAll: () => [ {} ], getAnimations: () => [] };
  const renderer = { evaluate: async (expression: string) => Function('document', 'globalThis', `return (${expression})`)(document, { __ai7HeldCompletionFrames: heldFrames ? [] : undefined }) };
  const actions: string[] = [];
  const nativePress = async (_page: unknown, _wait: unknown, _check: unknown, selector: string) => {
    if (heldFrames) throw new Error('Presented-frame wait is unavailable');
    await press(selector);
  };
  const press = async (selector: string) => {
    if (selector.includes('control="close"')) { drawer.hidden = true; actions.push('close-plan'); }
    else { if (!drawer.hidden) throw new Error('Edge is covered'); drawer.hidden = false; drawer.dataset.taskDrawerView = 'panel'; actions.push('open-panel'); }
  };
  const wait = async (_page: unknown, expression: string, name: string) => { if (!await renderer.evaluate(expression)) throw new Error(name); };
  const open = Function('pressReachable', 'pressWithoutFrames', 'waitFor', 'requireJourney', 'assertRenderer', 'waitForPanel', `return (${source})`)(nativePress,
    async (_io: unknown, selector: string) => press(selector), wait, () => {}, wait, async () => ({ state: 'ready' }));
  return { open: () => open(renderer, 'panel-entry', { heldFrames }), actions, drawer };
}

it('closes the covering plan by pointer before reaching the manuscript edge', async () => {
  const page = scene('plan'); await page.open();
  expect(page.actions).toEqual(['close-plan', 'open-panel']);
  expect(page.drawer.dataset.taskDrawerView).toBe('panel');
});

it('keeps the refusal scenario frame hold while reaching the panel with native geometry checks', async () => {
  const page = scene(null, true); await page.open();
  expect(page.actions).toEqual(['open-panel']);
});

it('keeps an already visible panel without pressing the covered manuscript edge', async () => {
  const page = scene('panel'); await page.open(); expect(page.actions).toEqual([]);
});
