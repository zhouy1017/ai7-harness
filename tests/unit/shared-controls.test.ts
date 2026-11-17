import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSheet } from '../../src/renderer/components/sheet.js';
import { createDispatchChooser } from '../../src/renderer/components/dispatch-chooser.js';
import { styleInput } from '../../src/renderer/components/controls.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { restore(); vi.unstubAllGlobals(); });

it('styles text and checkbox inputs without changing the form value', () => {
  const input = document.createElement('input'); input.value = '1200';
  expect(styleInput(input).classList.contains('ui-input')).toBe(true);
  expect(input.value).toBe('1200');
  input.type = 'checkbox'; input.checked = true;
  expect(styleInput(input).classList.contains('ui-checkbox')).toBe(true);
  expect(input.checked).toBe(true);
});

it('takes focus after its caller paints and returns focus on close', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  Object.defineProperty(opener, 'isConnected', { value: true });
  const sheet = createSheet('example'); document.body.append(sheet); sheet.show();
  const control = document.createElement('button');
  Object.defineProperty(control, 'getClientRects', { value: () => [{}] });
  sheet.append(control);
  await Promise.resolve();
  expect(miniDocument.activeElement).toBe(control);
  sheet.close();
  expect(miniDocument.activeElement).toBe(opener);
});

it('dismisses a chooser on Tab to a real outside focus target', () => {
  vi.stubGlobal('window', { removeEventListener: () => {} });
  const chooser = createDispatchChooser({ role: 'main-editorial', changed: () => {} });
  const outside = document.createElement('button'); document.body.append(chooser.element, outside);
  chooser.element.open = true;
  const event = Object.assign({ type: 'focusout', bubbles: true }, { relatedTarget: outside });
  (chooser.element as unknown as MiniElement).dispatchEvent(event);
  expect(chooser.element.open).toBe(false);
});

it('supplies focus, category fallback and danger styles', () => {
  const css = readFileSync('src/renderer/styles.css', 'utf8');
  expect(css).not.toContain('var(--accent)');
  expect(css).toContain('button.danger');
  expect(css).toContain('var(--category-accent, var(--focus))');
});

it('uses shared controls on the listed form surfaces', () => {
  for (const file of ['feedback-history.ts', 'imported-exemplars.ts', 'components/launch-bar.ts', 'keyboard-settings.ts', 'library-screen.ts']) {
    expect(readFileSync(`src/renderer/${file}`, 'utf8')).toContain('styleInput(');
  }
  expect(readFileSync('src/renderer/settings-screens.ts', 'utf8')).toContain("element('span', 'settings-switch')");
});

it('closes on Escape even after focus moves outside the sheet', async () => {
  vi.stubGlobal('Event', class { defaultPrevented = false; constructor(readonly type: string) {} });
  const sheet = createSheet('example'); document.body.append(sheet); sheet.show();
  const control = document.createElement('button'); sheet.append(control); await Promise.resolve();
  const outside = document.createElement('button'); document.body.append(outside); outside.focus();
  miniDocument.body.dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true });
  expect(sheet.open).toBe(false);
});

it('keeps a chooser open while its sheet restores focus after reattaching it', async () => {
  vi.stubGlobal('window', { removeEventListener: () => {} });
  const chooser = createDispatchChooser({ role: 'main-editorial', changed: () => {} });
  document.body.append(chooser.element);
  chooser.element.open = true;
  const summary = chooser.element.querySelector('summary')!;
  summary.focus();
  (chooser.element as unknown as MiniElement).dispatchEvent({ type: 'focusout', bubbles: true });
  summary.focus();
  await Promise.resolve();
  expect(chooser.element.open).toBe(true);
});

it('keeps padding focus inside the chooser and tolerates focus restored on the next frame', async () => {
  vi.stubGlobal('window', { removeEventListener: () => {} });
  let frame = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { frame = callback; });
  const chooser = createDispatchChooser({ role: 'main-editorial', changed: () => {} });
  document.body.append(chooser.element); chooser.element.open = true;
  const panel = chooser.element.querySelector<HTMLElement>('.dispatch-chooser-panel')!;
  expect(panel.tabIndex).toBe(-1);
  panel.focus();
  (chooser.element as unknown as MiniElement).dispatchEvent({ type: 'focusout', bubbles: true });
  await Promise.resolve(); frame(); panel.focus(); frame(); await Promise.resolve();
  expect(chooser.element.open).toBe(true);
});

it('Escape in a focused upper sheet leaves the lower sheet open', async () => {
  vi.stubGlobal('Event', class { defaultPrevented = false; constructor(readonly type: string) {} });
  const lower = createSheet('lower'), upper = createSheet('upper');
  const lowerButton = document.createElement('button'), upperButton = document.createElement('button');
  lower.append(lowerButton); upper.append(upperButton); document.body.append(lower, upper);
  lower.show(); await Promise.resolve(); upper.show(); await Promise.resolve();
  (upperButton as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true });
  expect(upper.open).toBe(false); expect(lower.open).toBe(true);
  lower.close();
});
