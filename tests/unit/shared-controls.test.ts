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

it('dismisses a chooser when focus leaves its element', () => {
  vi.stubGlobal('window', { removeEventListener: () => {} });
  const chooser = createDispatchChooser({ role: 'main-editorial', changed: () => {} });
  chooser.element.open = true;
  (chooser.element as unknown as MiniElement).dispatchEvent({ type: 'focusout', bubbles: true });
  expect(chooser.element.open).toBe(false);
});

it('supplies focus, category fallback and danger styles', () => {
  const css = readFileSync('src/renderer/styles.css', 'utf8');
  expect(css).not.toContain('var(--accent)');
  expect(css).toContain('button.danger');
  expect(css).toContain('var(--category-accent, var(--focus))');
});

it('uses shared controls on the listed form surfaces', () => {
  for (const file of ['feedback-history.ts', 'imported-exemplars.ts', 'task-drawer.ts', 'keyboard-settings.ts', 'library-screen.ts']) {
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
