import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transpileModule } from 'typescript';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { enhanceSelect, menuDestinations, mountMenuControls, mountSelectControls } from '../../src/renderer/components/controls.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => restore());

it('preserves the native value/change contract when progressive APIs are unavailable', () => {
  const root = document.createElement('section');
  const select = document.createElement('select');
  select.id = 'native-choice'; select.name = 'choice'; select.value = 'first';
  select.setAttribute('aria-label', '选择'); select.dataset['choice'] = 'native';
  root.append(select);
  let changes = 0; select.addEventListener('change', () => { changes++; });
  const stop = mountSelectControls(root);
  expect(enhanceSelect(select)).toBeNull();
  select.value = 'second'; (select as unknown as MiniElement).dispatchEvent({ type: 'change', bubbles: true });
  expect([select.value, select.id, select.name, select.dataset['choice'], changes]).toEqual(['second', 'native-choice', 'choice', 'native', 1]);
  expect(select.getAttribute('aria-hidden')).toBeNull();
  expect(root.querySelector('button')).toBeNull();
  stop(); mountMenuControls(root)();
  expect(root.querySelector('select')).toBe(select);
});

it('navigates visible disclosure summaries and skips enabled controls in closed sections', () => {
  const panel = document.createElement('div'), milestone = document.createElement('details');
  const summary = document.createElement('summary'), save = document.createElement('button'), exportAction = document.createElement('button');
  summary.textContent = '保存为里程碑版本'; save.textContent = '保存里程碑版本'; exportAction.textContent = '导出稿件';
  milestone.append(summary, save); panel.append(milestone, exportAction);
  expect(menuDestinations(panel).map((node) => node.textContent)).toEqual(['保存为里程碑版本', '导出稿件']);
  milestone.open = true;
  expect(menuDestinations(panel).map((node) => node.textContent)).toEqual(['保存为里程碑版本', '保存里程碑版本', '导出稿件']);
  save.disabled = true;
  expect(menuDestinations(panel).map((node) => node.textContent)).toEqual(['保存为里程碑版本', '导出稿件']);
});

it('Space chooses the active option in an open select and preserves spaces in its filter', () => {
  const source = readFileSync('src/renderer/components/controls.ts', 'utf8');
  const handler = source.slice(source.indexOf('const keydown = (event: KeyboardEvent)'), source.indexOf('  function destroy()'));
  const filter = {};
  let chosen = -1;
  const keydown = runInNewContext(transpileModule(`let typeahead = ''; let typedAt = 0; ${handler}; keydown;`, {}).outputText, {
    composing: false, open: true, filter, active: 2, choose: (index: number) => { chosen = index; },
  });
  let prevented = false;
  keydown({ key: ' ', target: {}, preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
  expect(chosen).toBe(2); expect(prevented).toBe(true);
  chosen = -1; prevented = false;
  keydown({ key: ' ', target: filter, preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
  expect(chosen).toBe(-1); expect(prevented).toBe(false);
});

it('keeps Space in an active typeahead phrase without committing its first match', () => {
  const source = readFileSync('src/renderer/components/controls.ts', 'utf8');
  const handler = source.slice(source.indexOf('const keydown = (event: KeyboardEvent)'), source.indexOf('  function destroy()'));
  const chosen: number[] = [], active: number[] = [];
  const keydown = runInNewContext(transpileModule(`let typeahead = 'beta'; let typedAt = Date.now(); ${handler}; keydown;`, {}).outputText, {
    composing: false, open: true, filter: { hidden: true }, active: 0, visible: [0, 1],
    select: { options: [{ text: 'beta one' }, { text: 'beta two' }] },
    setActive: (index: number) => active.push(index), choose: (index: number) => chosen.push(index),
  });
  for (const key of [' ', 't']) keydown({ key, target: {}, preventDefault: () => {}, stopPropagation: () => {} });
  expect(chosen).toEqual([]); expect(active.at(-1)).toBe(1);
});
