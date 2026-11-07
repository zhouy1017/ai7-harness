import { afterEach, beforeEach, expect, it } from 'vitest';
import { enhanceSelect, mountMenuControls, mountSelectControls } from '../../src/renderer/components/controls.js';
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
