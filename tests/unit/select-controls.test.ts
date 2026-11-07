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
