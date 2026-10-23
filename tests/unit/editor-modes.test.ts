import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFocusMode, mountEditorModes } from '../../src/renderer/editor-modes.js';
import {
  DEFAULT_VIEW_STATE,
  MANUSCRIPT_MIN_WIDTH_PX,
  ViewPreferences,
  applyViewState,
  clampRegion,
  mountRegionSeparator,
  presetTypography,
  steppedRegion,
  typographyProperties,
  type ViewState,
} from '../../src/renderer/layout.js';
import {
  DEFAULT_LAYOUT_REGIONS,
  DEFAULT_TYPOGRAPHY,
  PREFERENCE_KEYS,
  READING_PRESETS,
  REGION_BOUNDS,
  preferenceDefaults,
  type PreferenceValues,
  type PreferencesRendererApi,
} from '../../src/shared/preferences.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// Unit suite for 专注模式, Workspace Density Mode, the Manuscript Reading Presets and Resizable Workspace Regions (Issue #951,
// wave 12 slice 12a; V2-UX-ED-004 to ED-007, VIEW-001 to VIEW-012). A view choice changes root attributes and custom
// properties only; 专注模式 writes nothing and no Run outcome changes it.

class FakeRootState {
  readonly dataset: Record<string, string> = {};
  readonly properties = new Map<string, string>();
  readonly style = {
    setProperty: (name: string, value: string) => { this.properties.set(name, value); },
    removeProperty: (name: string) => { this.properties.delete(name); return ''; },
  } as unknown as CSSStyleDeclaration;
}
type FakeRoot = FakeRootState & { readonly dataset: DOMStringMap };
const FakeRoot = FakeRootState as unknown as new () => FakeRoot;

function fakeApi(fail = false) {
  let values: PreferenceValues = preferenceDefaults();
  const savePreference = vi.fn(async ({ key, value }: { key: string; value: unknown }) => {
    if (fail) throw new Error('disk full');
    values = { ...values, [key]: value } as PreferenceValues;
    return { version: 1 as const, values, notice: null };
  });
  return { api: { savePreference } as unknown as Pick<PreferencesRendererApi, 'savePreference'>, savePreference, values: () => values };
}

describe('reading typography and density (VIEW-001 to VIEW-006)', () => {
  it('starts from a Chinese serif near 17 px, leading 1.9–2.0 and 30–38 characters a line, editing and reading apart', () => {
    expect(DEFAULT_TYPOGRAPHY).toEqual({ preset: 'editing', ...READING_PRESETS.editing });
    for (const preset of ['editing', 'reading'] as const) {
      const values = READING_PRESETS[preset];
      expect(values.fontFamily).toBe('serif');
      expect(values.fontSize).toBeGreaterThanOrEqual(16);
      expect(values.fontSize).toBeLessThanOrEqual(18);
      expect(values.lineHeight).toBeGreaterThanOrEqual(1.9);
      expect(values.lineHeight).toBeLessThanOrEqual(2);
      expect(values.columnWidth).toBeGreaterThanOrEqual(30);
      expect(values.columnWidth).toBeLessThanOrEqual(38);
      expect(PREFERENCE_KEYS['editor.typography'].validate(presetTypography(preset))).toBe(true);
    }
    expect(READING_PRESETS.editing).not.toEqual(READING_PRESETS.reading);
  });

  it('refuses typography outside the readable bounds and density outside its two modes', () => {
    const typography = PREFERENCE_KEYS['editor.typography'];
    expect(typography.validate({ ...DEFAULT_TYPOGRAPHY, fontSize: 13 })).toBe(false);
    expect(typography.validate({ ...DEFAULT_TYPOGRAPHY, fontSize: 17.5 })).toBe(false);
    expect(typography.validate({ ...DEFAULT_TYPOGRAPHY, lineHeight: 3 })).toBe(false);
    expect(typography.validate({ ...DEFAULT_TYPOGRAPHY, columnWidth: 60 })).toBe(false);
    expect(typography.validate({ ...DEFAULT_TYPOGRAPHY, fontFamily: 'comic' })).toBe(false);
    expect(typography.validate({ ...DEFAULT_TYPOGRAPHY, extra: true })).toBe(false);
    expect(PREFERENCE_KEYS['editor.density'].validate('compact')).toBe(true);
    expect(PREFERENCE_KEYS['editor.density'].validate('cozy')).toBe(false);
  });

  it('applies as root attributes and custom properties only, with a stable CJK fallback chain', () => {
    const root = new FakeRoot();
    const state: ViewState = { density: 'compact', typography: presetTypography('reading'), regions: DEFAULT_LAYOUT_REGIONS };
    applyViewState(root, state);
    expect(root.dataset).toEqual({ density: 'compact', readingPreset: 'reading' });
    expect(Object.fromEntries(root.properties)).toEqual({
      ...typographyProperties(state.typography),
      '--manuscript-min-width': `${MANUSCRIPT_MIN_WIDTH_PX}px`,
    });
    expect(root.properties.get('--manuscript-font-size')).toBe('18px');
    expect(root.properties.get('--manuscript-column')).toBe('32');
    expect(root.properties.get('--manuscript-align')).toBe('justify');
    for (const family of ['serif', 'kai', 'fangsong', 'sans'] as const) {
      expect(typographyProperties({ ...DEFAULT_TYPOGRAPHY, fontFamily: family })['--manuscript-font-family']).toMatch(/(serif|sans-serif)$/u);
    }
  });
});

describe('Resizable Workspace Regions (VIEW-007 to VIEW-012)', () => {
  // Source contracts only: mini-dom has no stylesheet/layout engine. J03 owns geometry evidence.
  const stylesheet = readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
  const compact = (value: string) => value.replace(/\s+/gu, '');
  // Normalize formatting inside these guards, but retain descendant spaces between selector subjects.
  const selectorText = (value: string) => value.trim().replace(/\s+/gu, ' ')
    .replace(/([[(=]) /gu, '$1').replace(/ ([\])=])/gu, '$1');
  const drawer = 'body[data-task-drawer="open"]';
  const guards = [':root:not([data-sidebar="icons"])', drawer, ':has(.editor-workspace)'];
  const fallbackSelector = `${guards[0]} ${drawer}${guards[2]}`;
  const fallbackQuery = '(min-width:1120px)and(max-width:1184px)';
  const fallbackEffects = [
    { target: '', declaration: 'padding-right:0' },
    { target: '.status-bar', declaration: 'right:1.2rem' },
    { target: '#task-drawer-separator', declaration: 'display:none' },
  ];

  function assertDrawerStyles(source: string) {
    const css = source.replace(/\/\*[\s\S]*?\*\//gu, '');
    // These drawer media blocks contain flat rules. Consume every rule, rather than stopping at the first closing brace.
    const media = [...css.matchAll(/@media\s*([^{}]+)\{((?:[^{}]*\{[^{}]*\}\s*)+)\}/gu)];
    // Include every block at this range, even a body/status-only override; the separator also catches changed boundaries.
    const fallback = media.filter(([, query, rules]) => compact(query!) === fallbackQuery
      || (query!.includes('max-width') && rules!.includes('#task-drawer-separator')));
    expect(fallback).toHaveLength(1);
    const [, query, block] = fallback[0]!;
    expect(compact(query!)).toBe(fallbackQuery);
    const rules = [...block!.matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
    expect(block!.replace(/[^{}]+\{[^{}]*\}/gu, '').trim()).toBe('');
    const seen = new Set<string>();
    for (const [, selectors, declarations] of rules) {
      for (const selector of selectors!.split(',')) {
        // Compare each complete selector: a guarded list member cannot conceal a broad sibling or different subject.
        const effect = fallbackEffects.find(({ target }) => selectorText(selector) === selectorText(`${fallbackSelector} ${target}`));
        expect(effect, selector.trim()).toBeDefined();
        expect(declarations!.split(';').map(compact).filter(Boolean)).toEqual([effect!.declaration]);
        seen.add(effect!.target);
      }
    }
    expect([...seen].sort()).toEqual(fallbackEffects.map(({ target }) => target).sort());

    // Ordinary columns with focus mode OFF. Later focus-mode-on rules intentionally hide the drawer/separator.
    const columns = media.filter(([, header]) => compact(header!) === '(min-width:1120px)');
    const columnRules = columns.flatMap(([, , body]) => [...body!.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]);
    for (const { target, declaration } of [
      { target: '', declaration: 'padding-right:var(--task-drawer-width)' },
      { target: '.status-bar', declaration: 'right:calc(var(--task-drawer-width)+1.2rem)' },
      { target: '#task-drawer-separator', declaration: 'display:block' },
    ]) {
      const declarations = columnRules.filter(([, selectors]) => selectors!.split(',').some((selector) => selectorText(selector) === selectorText(`${drawer} ${target}`)))
        .flatMap(([, , body]) => body!.split(';').map(compact).filter(Boolean));
      expect(declarations, `focus off: ${target || 'body'}`).toEqual([declaration]);
    }
    return { css, query: query!, rules };
  }

  it('limits the inclusive 1120–1184px drawer fallback to manuscripts with the expanded sidebar, preserving ordinary columns', () => {
    assertDrawerStyles(stylesheet);
    assertDrawerStyles(stylesheet.replaceAll('{', ' { /* formatting only */\n').replaceAll(';', ' ;\n'));
    assertDrawerStyles(stylesheet.replaceAll(fallbackSelector, ':root:not( [ data-sidebar = "icons" ] )\n\tbody[ data-task-drawer = "open" ]:has( .editor-workspace )'));
  });

  it('rejects missing guards in every fallback rule and every added selector-list member', () => {
    const { css, rules } = assertDrawerStyles(stylesheet);
    for (const { target } of fallbackEffects) {
      const selector = `${fallbackSelector}${target ? ` ${target}` : ''}`;
      const original = rules.find(([, selectors]) => selectorText(selectors!) === selectorText(selector))![1]!;
      for (const guard of guards) {
        const broad = selector.replace(guard, '');
        expect(() => assertDrawerStyles(css.replace(original, broad)), `${target || 'body'} missing ${guard}`).toThrow();
        expect(() => assertDrawerStyles(css.replace(original, `${selector}, ${broad}`)), `${target || 'body'} list member missing ${guard}`).toThrow();
      }
    }
  });

  it('rejects changed fallback boundaries and an additional broad override after the guarded rules', () => {
    const { css, query, rules } = assertDrawerStyles(stylesheet);
    for (const changed of [query.replace('1120', '1119'), query.replace('1120', '1121'), query.replace('1184', '1183'), query.replace('1184', '1185')]) {
      expect(() => assertDrawerStyles(css.replace(query, changed)), changed).toThrow();
    }
    for (const { target, declaration } of fallbackEffects) {
      const selector = `${fallbackSelector}${target ? ` ${target}` : ''}`;
      const rule = rules.find(([, selectors]) => selectorText(selectors!) === selectorText(selector))![0];
      expect(() => assertDrawerStyles(css.replace(rule, `${rule}\n${drawer} ${target} { ${declaration}; }`))).toThrow();
    }
  });

  it('rejects selector changes that move a guard or effect to a different subject', () => {
    const { css, rules } = assertDrawerStyles(stylesheet);
    for (const { target } of fallbackEffects) {
      const selector = `${fallbackSelector}${target ? ` ${target}` : ''}`;
      const original = rules.find(([, selectors]) => selectorText(selectors!) === selectorText(selector))![1]!;
      const changedSelectors = [
        selector.replace(':has(', ' :has('),
        selector.replace(`${guards[0]} `, guards[0]!),
        ...(target ? [selector.replace(` ${target}`, target)] : []),
      ];
      for (const changed of changedSelectors) {
        expect(() => assertDrawerStyles(css.replace(original, changed)), changed).toThrow();
      }
      if (target) {
        expect(() => assertDrawerStyles(css.replace(`${drawer} ${target}`, `${drawer}${target}`)), `column subject: ${target}`).toThrow();
      }
    }
  });

  it('rejects an unguarded fallback override in a separate media block', () => {
    const { css, query } = assertDrawerStyles(stylesheet);
    for (const { target, declaration } of fallbackEffects) {
      const override = `@media ${query} { ${drawer} ${target} { ${declaration}; } }`;
      expect(() => assertDrawerStyles(`${css}\n${override}`), target || 'body').toThrow();
    }
  });

  it('keeps each region within its safe bounds, by pointer or by keyboard', () => {
    expect(clampRegion('supportingWidth', 10)).toBe(REGION_BOUNDS.supportingWidth.min);
    expect(clampRegion('drawerWidth', 10_000)).toBe(REGION_BOUNDS.drawerWidth.max);
    expect(steppedRegion('supportingWidth', 336, 'ArrowLeft')).toBe(352);
    expect(steppedRegion('supportingWidth', 336, 'ArrowRight')).toBe(320);
    expect(steppedRegion('drawerWidth', 416, 'PageUp')).toBe(480);
    expect(steppedRegion('drawerWidth', 416, 'Home')).toBe(REGION_BOUNDS.drawerWidth.min);
    expect(steppedRegion('drawerWidth', 416, 'End')).toBe(REGION_BOUNDS.drawerWidth.max);
    expect(steppedRegion('drawerWidth', 416, 'a')).toBeNull();
  });

  it('never lets the drawer take the manuscript below its minimum, and leaves the window-following default unset', () => {
    const root = new FakeRoot();
    applyViewState(root, { ...DEFAULT_VIEW_STATE, regions: { supportingWidth: 400, drawerWidth: 500, hidden: ['position-rail'] } });
    expect(root.properties.get('--supporting-surface-width')).toBe('400px');
    expect(root.properties.get('--task-drawer-width')).toBe('min(500px, max(20rem, calc(100vw - var(--sidebar-width) - var(--manuscript-min-width) - 9rem)))');
    expect(root.dataset['hiddenRegions']).toBe('position-rail');
    applyViewState(root, DEFAULT_VIEW_STATE);
    expect(root.properties.has('--supporting-surface-width')).toBe(false);
    expect(root.properties.has('--task-drawer-width')).toBe(false);
    expect(root.dataset['hiddenRegions']).toBeUndefined();
  });

  it('writes through the preferences owner, resets, and restores the default layout without touching typography', async () => {
    const root = new FakeRoot();
    const { api, savePreference } = fakeApi();
    const view = new ViewPreferences(api, () => root);
    await view.setDensity('compact');
    await view.choosePreset('reading');
    await view.adjustTypography({ fontSize: 20 });
    expect(view.current.typography).toEqual({ ...presetTypography('reading'), fontSize: 20 });
    await view.setRegionWidth('supportingWidth', 9_999);
    await view.setRegionHidden('position-rail', true);
    expect(view.current.regions).toEqual({ supportingWidth: REGION_BOUNDS.supportingWidth.max, drawerWidth: null, hidden: ['position-rail'] });
    await view.restoreDefaultLayout();
    expect(view.current.regions).toEqual(DEFAULT_LAYOUT_REGIONS);
    expect(view.current.typography.fontSize).toBe(20);
    await view.resetTypography();
    expect(view.current.typography).toEqual(DEFAULT_TYPOGRAPHY);
    expect(root.dataset['density']).toBe('compact');
    expect(savePreference.mock.calls.map(([input]) => input.key)).toEqual([
      'editor.density', 'editor.typography', 'editor.typography', 'layout.regions', 'layout.regions', 'layout.regions', 'editor.typography',
    ]);
  });

  it('shows what is stored when a write fails', async () => {
    const root = new FakeRoot();
    const { api } = fakeApi(true);
    const view = new ViewPreferences(api, () => root);
    view.accept(preferenceDefaults());
    view.preview('supportingWidth', 500);
    expect(root.properties.get('--supporting-surface-width')).toBe('500px');
    await expect(view.setRegionWidth('supportingWidth', 500)).rejects.toThrow('disk full');
    expect(root.properties.has('--supporting-surface-width')).toBe(false);
    expect(view.current).toEqual(DEFAULT_VIEW_STATE);
  });

  it('keeps independent adjustments made before the previous preference write answers', async () => {
    const { api } = fakeApi();
    const view = new ViewPreferences(api, () => new FakeRoot());
    await Promise.all([view.choosePreset('reading'), view.adjustTypography({ fontSize: 21 }), view.adjustTypography({ columnWidth: 30 })]);
    expect(view.current.typography).toEqual({ ...presetTypography('reading'), fontSize: 21, columnWidth: 30 });
    await Promise.all([view.setRegionWidth('supportingWidth', 400), view.setRegionWidth('drawerWidth', 500), view.setRegionHidden('position-rail', true)]);
    expect(view.current.regions).toEqual({ supportingWidth: 400, drawerWidth: 500, hidden: ['position-rail'] });
  });
});

describe('专注模式 (ED-004 to ED-007)', () => {
  let restore: () => void;
  let keydown: Array<(event: unknown) => void>;
  beforeEach(() => {
    restore = installMiniDom();
    keydown = [];
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: unknown) => void) => { if (type === 'keydown') keydown.push(listener); },
      removeEventListener: (type: string, listener: (event: unknown) => void) => { if (type === 'keydown') keydown = keydown.filter((entry) => entry !== listener); },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); restore(); });

  function mounted() {
    const root = new FakeRoot();
    const { api, savePreference } = fakeApi();
    const view = new ViewPreferences(api, () => root);
    const focus = createFocusMode(() => root);
    const host = miniDocument.createElement('div');
    const openNavigation = vi.fn();
    const openTasks = vi.fn();
    const setStatus = vi.fn();
    const modes = mountEditorModes({
      host: host as unknown as HTMLElement, view, focus, rail: true, openNavigation, openTasks, setStatus, shortcutHint: () => '快捷键 Ctrl+Shift+E',
    });
    const press = (event: Record<string, unknown>) => {
      const dispatched = { key: 'Escape', isComposing: false, keyCode: 27, defaultPrevented: false, preventDefault() { dispatched.defaultPrevented = true; }, ...event };
      for (const listener of keydown) listener(dispatched);
      return dispatched;
    };
    return { root, host, focus, modes, savePreference, openNavigation, openTasks, setStatus, press };
  }

  it('toggles from the header, keeps a visible restore control, and leaves with Esc', () => {
    const { root, host, focus, press } = mounted();
    const toggle = host.querySelector('[data-view-command="focus-mode"]') as MiniElement;
    toggle.click();
    expect(focus.active).toBe(true);
    expect(root.dataset['focusMode']).toBe('on');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('退出专注（Esc）');
    // Esc that an input method or another surface took is not 专注模式's.
    press({ isComposing: true });
    press({ keyCode: 229 });
    press({ defaultPrevented: true });
    expect(focus.active).toBe(true);
    expect(press({}).defaultPrevented).toBe(true);
    expect(focus.active).toBe(false);
    expect(root.dataset['focusMode']).toBe('off');
  });

  it('creates no record and persists nothing (ED-005); per session', () => {
    const { focus, savePreference, host } = mounted();
    focus.enter();
    focus.leave();
    (host.querySelector('[data-view-command="focus-mode-item"]') as MiniElement).click();
    expect(focus.active).toBe(true);
    expect(savePreference).not.toHaveBeenCalled();
    expect(Object.keys(PREFERENCE_KEYS).some((key) => key.toLowerCase().includes('focus'))).toBe(false);
  });

  it('is changed by no Run outcome: a Task Drawer opening for a finished Run leaves it as it was (ED-006)', () => {
    const { focus, root } = mounted();
    focus.enter();
    // What a Run outcome does to the shell: the drawer opens and the quiet notice speaks. Neither reaches 专注模式.
    miniDocument.body.dataset['taskDrawer'] = 'open';
    miniDocument.body.append(miniDocument.createElement('p'));
    expect(focus.active).toBe(true);
    expect(root.dataset['focusMode']).toBe('on');
  });

  it('restores supporting surfaces from 视图, and 恢复默认布局 resets regions only', async () => {
    const { host, focus, openNavigation, openTasks } = mounted();
    focus.enter();
    (host.querySelector('[data-view-command="show-navigation"]') as MiniElement).click();
    expect(openNavigation).toHaveBeenCalledOnce();
    expect(focus.active).toBe(false);
    (host.querySelector('[data-view-command="show-tasks"]') as MiniElement).click();
    expect(openTasks).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-view-command="restore-default-layout"]')).not.toBeNull();
    expect(host.querySelector('[data-view-command="toggle-rail"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves 专注模式 and empties the slot when the manuscript leaves the screen', () => {
    const { host, focus, modes } = mounted();
    focus.enter();
    modes.destroy();
    expect(focus.active).toBe(false);
    expect(host.children).toHaveLength(0);
    expect(keydown).toHaveLength(0);
  });

  it('announces and adjusts a constrained region from its rendered width, not a larger stored width', async () => {
    const root = new FakeRoot();
    const { api, savePreference } = fakeApi();
    const view = new ViewPreferences(api, () => root);
    await view.setRegionWidth('supportingWidth', 560);
    const separator = mountRegionSeparator({ region: 'supportingWidth', view, measure: () => 320, announce: vi.fn() });
    const node = separator.element as unknown as MiniElement;
    expect(node.getAttribute('aria-valuenow')).toBe('320');
    node.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
    await vi.waitFor(() => expect(savePreference).toHaveBeenLastCalledWith({ key: 'layout.regions', value: { ...DEFAULT_LAYOUT_REGIONS, supportingWidth: 304 } }));
    expect(node.getAttribute('aria-valuetext')).toBe('320 像素');
    separator.destroy();
  });
});
