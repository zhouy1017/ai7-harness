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

it('a closed menu panel drops its placement so the next opening starts at its summary', () => {
  const source = readFileSync('src/renderer/components/controls.ts', 'utf8');
  const body = source.slice(source.indexOf('const position = (): void => {', source.indexOf('export function mountMenuControls')), source.indexOf('  const close = (menu: HTMLDetailsElement'));
  const style = { values: { position: 'fixed', left: '742px', top: '43px' } as Record<string, string>, removeProperty(name: string) { delete this.values[name]; } };
  const panel = { style };
  const position = runInNewContext(transpileModule(`${body}; position;`, {}).outputText, {
    menus: () => [{ open: false }], panelOf: () => panel,
  });
  position();
  expect(style.values).toEqual({});
});

it('a menu panel wider than its narrow anchor stays inside the window near the right edge', () => {
  const source = readFileSync('src/renderer/components/controls.ts', 'utf8');
  const body = source.slice(source.indexOf('const position = (): void => {', source.indexOf('export function mountMenuControls')), source.indexOf('  const close = (menu: HTMLDetailsElement'));
  const values: Record<string, string> = {};
  const style = { removeProperty: (name: string) => { delete values[name]; }, set position(value: string) { values['position'] = value; }, set left(value: string) { values['left'] = value; }, get left() { return values['left'] ?? ''; }, set top(value: string) { values['top'] = value; }, set margin(value: string) { values['margin'] = value; }, set right(value: string) { values['right'] = value; }, set maxHeight(value: string) { values['max-height'] = value; }, get maxHeight() { return values['max-height'] ?? ''; } };
  // Inside its 83 px anchor the nowrap content measures 83 px; once fixed with room to grow it is 340 px.
  const panel = { style, scrollHeight: 120, get offsetWidth() { return values['position'] === 'fixed' && values['left'] !== undefined ? 340 : 83; } };
  const summary = { getBoundingClientRect: () => ({ left: 907, right: 990, top: 8, bottom: 40 }) };
  const menu = { open: true, dataset: {}, querySelector: () => summary };
  const position = runInNewContext(transpileModule(`${body}; position;`, {}).outputText, {
    menus: () => [menu], panelOf: () => panel, fixedOrigin: () => ({ left: 0, top: 0 }), view: { innerWidth: 1008, innerHeight: 681 },
  });
  position();
  const left = Number.parseFloat(values['left'] ?? 'NaN');
  expect(left).toBeGreaterThanOrEqual(8);
  expect(left + 340).toBeLessThanOrEqual(1008 - 8);
  // A menu that opts in opens from its button's left edge, so it never reaches back over what is left of the button (the sidebar).
  const start = runInNewContext(transpileModule(`${body}; position;`, {}).outputText, {
    menus: () => [{ ...menu, dataset: { menuAnchor: 'start' }, querySelector: () => ({ getBoundingClientRect: () => ({ left: 300, right: 383, top: 8, bottom: 40 }) }) }],
    panelOf: () => panel, fixedOrigin: () => ({ left: 0, top: 0 }), view: { innerWidth: 1008, innerHeight: 681 },
  });
  start();
  expect(Number.parseFloat(values['left'] ?? 'NaN')).toBe(300);
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


it('renders labelled option groups only for callers that opt in', () => {
  const source = readFileSync('src/renderer/components/controls.ts', 'utf8');
  const renderer = source.slice(source.indexOf('  const renderOptions = ():'), source.indexOf('  const sync = ():'));
  for (const optIn of [false, true]) {
    const list = document.createElement('div'), group = document.createElement('optgroup'); group.setAttribute('label', '推荐');
    const render = runInNewContext(transpileModule(`let signature='',visible=[],rows=[],active=-1; ${renderer}; renderOptions;`, {}).outputText, {
      select: { dataset: { showOptionGroups: String(optIn) }, selectedIndex: 0, options: [{ text: '合成模型', value: 'synthetic', selected: true, hidden: false, parentElement: group }] },
      filter: { value: '' }, list, doc: document, optionDisabled: () => false, empty: {}, setActive: () => {}, position: () => {},
    });
    render();
    const node = list as unknown as MiniElement;
    expect(node.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(node.querySelectorAll('[role="group"]')).toHaveLength(optIn ? 1 : 0);
    if (optIn) expect(node.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('推荐');
    else expect(node.textContent).not.toContain('推荐');
  }
});
