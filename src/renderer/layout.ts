import {
  DEFAULT_LAYOUT_REGIONS,
  DEFAULT_TYPOGRAPHY,
  READING_PRESETS,
  REGION_BOUNDS,
  TYPOGRAPHY_BOUNDS,
  isLayoutRegions,
  isManuscriptTypography,
  isWorkspaceDensity,
  type LayoutRegions,
  type ManuscriptFontFamily,
  type ManuscriptTypography,
  type OptionalRegion,
  type PreferenceValues,
  type PreferencesRendererApi,
  type ReadingPreset,
  type WorkspaceDensity,
} from '../shared/preferences.js';
import {
  ALIGNMENT_CHOICES,
  ALIGNMENT_LABEL,
  COLUMN_WIDTH_LABEL,
  DENSITY_CHOICES,
  DENSITY_LEGEND,
  FONT_FALLBACK_NOTE,
  FONT_FAMILY_CHOICES,
  FONT_FAMILY_LABEL,
  FONT_SIZE_LABEL,
  LINE_HEIGHT_LABEL,
  PRESET_CHOICES,
  PRESET_LEGEND,
  PRESET_NOTE,
  REGIONS_LEGEND,
  REGIONS_NOTE,
  REGION_NAMES,
  RESTORED_DEFAULT_LAYOUT,
  RESTORE_DEFAULT_LAYOUT,
  TYPOGRAPHY_LEGEND,
  TYPOGRAPHY_RESET,
  TYPOGRAPHY_RESET_DONE,
  VIEW_SETTINGS_PROMISE,
  VIEW_SETTINGS_SAVED,
  VIEW_SETTINGS_SAVE_FAILED,
  columnWidthValue,
  fontSizeValue,
  lineHeightValue,
  regionAnnouncement,
  regionDefault,
  regionWidthValue,
  separatorLabel,
} from './layout-labels.js';

// Workspace density, manuscript reading typography and Resizable Workspace Regions (Issue #951, wave 12 slice 12a;
// V2-UX-VIEW-001 to VIEW-012). The values are the three local preferences `editor.density`, `editor.typography` and
// `layout.regions`, written only through 11a's preferences owner. Applying them changes root attributes and CSS custom
// properties and nothing else: no manuscript character, style, export or model context reads them (VIEW-006).
//
// The layout API the other manuscript surfaces read (12b's 分析 panel takes the supporting slot's width from it):
//   - CSS: `--supporting-surface-width` (the one right-side supporting slot) and `--task-drawer-width` on :root, set only
//     when the editor chose a width; `--manuscript-min-width`, below which neither may squeeze the manuscript.
//   - DOM: :root[data-density], :root[data-hidden-regions], and editor-modes.ts's :root[data-focus-mode].
//   - JS: `viewPreferences.current`, `viewPreferences.subscribe`, `mountRegionSeparator` for a panel of the supporting slot.

export type RegionKey = keyof typeof REGION_BOUNDS;

/** The central manuscript's usable minimum (VIEW-008): a supporting region never takes the window below it. */
export const MANUSCRIPT_MIN_WIDTH_PX = 480;

/** Each face with a stable CJK fallback chain, so a missing glyph is drawn by a face of the same kind (VIEW-004). */
const FONT_STACKS: Readonly<Record<ManuscriptFontFamily, string>> = Object.freeze({
  serif: '"Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif',
  kai: '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif CJK SC", "Songti SC", serif',
  fangsong: '"FangSong", "STFangsong", "Fangsong SC", "Noto Serif CJK SC", "Songti SC", serif',
  sans: '"Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
});

export interface ViewState {
  readonly density: WorkspaceDensity;
  readonly typography: ManuscriptTypography;
  readonly regions: LayoutRegions;
}

export const DEFAULT_VIEW_STATE: ViewState = Object.freeze({ density: 'standard', typography: DEFAULT_TYPOGRAPHY, regions: DEFAULT_LAYOUT_REGIONS });

/** The CSS custom properties a typography sets; nothing but presentation. */
export function typographyProperties(typography: ManuscriptTypography): Readonly<Record<string, string>> {
  return {
    '--manuscript-font-family': FONT_STACKS[typography.fontFamily],
    '--manuscript-font-size': `${typography.fontSize}px`,
    '--manuscript-line-height': String(typography.lineHeight),
    '--manuscript-column': String(typography.columnWidth),
    '--manuscript-align': typography.alignment,
  };
}

/** A region width the editor chose, as the root property states it: never wider than leaves the manuscript its minimum. */
export function regionProperty(region: RegionKey, width: number): string {
  if (region === 'supportingWidth') return `${width}px`;
  return `min(${width}px, max(20rem, calc(100vw - var(--sidebar-width) - var(--manuscript-min-width) - 9rem)))`;
}

export function clampRegion(region: RegionKey, width: number): number {
  const bounds = REGION_BOUNDS[region];
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

/** The keyboard adjustment of a separator (VIEW-007): arrows step, Page keys step four times, Home/End reach the bounds. */
export function steppedRegion(region: RegionKey, current: number, key: string): number | null {
  const bounds = REGION_BOUNDS[region];
  // The supporting slot and the drawer sit on the right: moving their left edge left widens them.
  switch (key) {
    case 'ArrowLeft': return clampRegion(region, current + bounds.step);
    case 'ArrowRight': return clampRegion(region, current - bounds.step);
    case 'PageUp': return clampRegion(region, current + bounds.step * 4);
    case 'PageDown': return clampRegion(region, current - bounds.step * 4);
    case 'Home': return bounds.min;
    case 'End': return bounds.max;
    default: return null;
  }
}

/** Apply a view state to the root: attributes and custom properties only (VIEW-006). */
export function applyViewState(root: Pick<HTMLElement, 'dataset' | 'style'>, state: ViewState): void {
  root.dataset['density'] = state.density;
  root.dataset['readingPreset'] = state.typography.preset;
  for (const [name, value] of Object.entries(typographyProperties(state.typography))) root.style.setProperty(name, value);
  root.style.setProperty('--manuscript-min-width', `${MANUSCRIPT_MIN_WIDTH_PX}px`);
  const regions: ReadonlyArray<[RegionKey, string]> = [['supportingWidth', '--supporting-surface-width'], ['drawerWidth', '--task-drawer-width']];
  for (const [region, property] of regions) {
    const width = state.regions[region];
    if (width === null) root.style.removeProperty(property);
    else root.style.setProperty(property, regionProperty(region, width));
  }
  if (state.regions.hidden.length === 0) delete root.dataset['hiddenRegions'];
  else root.dataset['hiddenRegions'] = state.regions.hidden.join(' ');
}

/** A typography that starts again from a preset's values (VIEW-003). */
export function presetTypography(preset: ReadingPreset): ManuscriptTypography {
  return { preset, ...READING_PRESETS[preset] };
}

/**
 * The view preferences in this window: read from the preferences owner, written through it one at a time, and applied to the
 * root as they change. A write that fails leaves the applied values as they were before it.
 */
export class ViewPreferences {
  private state: ViewState = DEFAULT_VIEW_STATE;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(state: ViewState) => void>();

  constructor(private readonly api: Pick<PreferencesRendererApi, 'savePreference'>, private readonly root: () => Pick<HTMLElement, 'dataset' | 'style'> | null) {}

  get current(): ViewState {
    return this.state;
  }

  subscribe(listener: (state: ViewState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The values the preferences owner holds now (every read and every write of any key answers with them). */
  accept(values: PreferenceValues): void {
    const density = isWorkspaceDensity(values['editor.density']) ? values['editor.density'] : DEFAULT_VIEW_STATE.density;
    const typography = isManuscriptTypography(values['editor.typography']) ? values['editor.typography'] : DEFAULT_VIEW_STATE.typography;
    const regions = isLayoutRegions(values['layout.regions']) ? values['layout.regions'] : DEFAULT_VIEW_STATE.regions;
    this.state = { density, typography, regions };
    const root = this.root();
    if (root !== null) applyViewState(root, this.state);
    for (const listener of this.listeners) listener(this.state);
  }

  setDensity(density: WorkspaceDensity): Promise<void> {
    return this.write('editor.density', () => density);
  }

  setTypography(typography: ManuscriptTypography): Promise<void> {
    return this.write('editor.typography', () => typography);
  }

  /** Adjust one value; the preset stays named, its values are now the editor's own. */
  adjustTypography(change: Partial<Omit<ManuscriptTypography, 'preset'>>): Promise<void> {
    return this.write('editor.typography', () => ({ ...this.state.typography, ...change }));
  }

  choosePreset(preset: ReadingPreset): Promise<void> {
    return this.write('editor.typography', () => presetTypography(preset));
  }

  resetTypography(): Promise<void> {
    return this.write('editor.typography', () => DEFAULT_TYPOGRAPHY);
  }

  setRegionWidth(region: RegionKey, width: number): Promise<void> {
    return this.write('layout.regions', () => ({ ...this.state.regions, [region]: clampRegion(region, width) }));
  }

  /** Show or hide an optional region (VIEW-010); identity, persistence status and danger are never among them (VIEW-011). */
  setRegionHidden(region: OptionalRegion, hidden: boolean): Promise<void> {
    return this.write('layout.regions', () => {
      const rest = this.state.regions.hidden.filter((entry) => entry !== region);
      return { ...this.state.regions, hidden: hidden ? [...rest, region] : rest };
    });
  }

  /** 恢复默认布局 (VIEW-007, VIEW-012): region sizes and visibility return to their defaults; nothing is dismissed or resolved. */
  restoreDefaultLayout(): Promise<void> {
    return this.write('layout.regions', () => DEFAULT_LAYOUT_REGIONS);
  }

  /** Apply at once for a drag in progress, without writing; the drag's end writes. */
  preview(region: RegionKey, width: number): void {
    const root = this.root();
    if (root === null) return;
    applyViewState(root, { ...this.state, regions: { ...this.state.regions, [region]: clampRegion(region, width) } });
  }

  private write<Key extends 'editor.density' | 'editor.typography' | 'layout.regions'>(key: Key, value: () => PreferenceValues[Key]): Promise<void> {
    const run = this.queue.then(async () => {
      try {
        this.accept((await this.api.savePreference({ key, value: value() })).values);
      } catch (error) {
        // What is shown stays what is stored.
        const root = this.root();
        if (root !== null) applyViewState(root, this.state);
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface RegionSeparatorOptions {
  readonly region: RegionKey;
  readonly view: ViewPreferences;
  /** The region's current rendered width, for a first adjustment from the window-following default. */
  measure(): number;
  announce(message: string): void;
}

/**
 * A pointer drag separator with keyboard adjustment (VIEW-007): `role="separator"`, its current size announced and stated as
 * `aria-valuetext`, kept within the region's safe bounds. The caller places it on the region's left edge.
 */
export function mountRegionSeparator(options: RegionSeparatorOptions): { element: HTMLElement; destroy(): void } {
  const { region, view } = options;
  const bounds = REGION_BOUNDS[region];
  const separator = el('div', 'region-separator');
  separator.dataset['region'] = region;
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-orientation', 'vertical');
  separator.setAttribute('aria-label', separatorLabel(region));
  separator.setAttribute('aria-valuemin', String(bounds.min));
  separator.setAttribute('aria-valuemax', String(bounds.max));
  separator.tabIndex = 0;
  // The CSS may constrain a saved width when the window is smaller; announce and adjust the width actually on screen.
  const current = (): number => Math.round(options.measure() || view.current.regions[region] || bounds.initial);
  const paint = (): void => {
    const width = current();
    separator.setAttribute('aria-valuenow', String(width));
    separator.setAttribute('aria-valuetext', regionWidthValue(width));
  };
  const commit = (width: number): void => {
    void view.setRegionWidth(region, width).then(
      () => { paint(); options.announce(regionAnnouncement(region, current())); },
      () => options.announce(VIEW_SETTINGS_SAVE_FAILED),
    );
  };
  separator.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const next = steppedRegion(region, current(), event.key);
    if (next === null) return;
    event.preventDefault();
    commit(next);
  });
  let drag: { pointerId: number; startX: number; startWidth: number; width: number } | undefined;
  separator.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: current(), width: current() };
    separator.setPointerCapture(event.pointerId);
    separator.dataset['dragging'] = 'true';
  });
  separator.addEventListener('pointermove', (event) => {
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    drag.width = clampRegion(region, drag.startWidth + (drag.startX - event.clientX));
    view.preview(region, drag.width);
    separator.setAttribute('aria-valuenow', String(drag.width));
    separator.setAttribute('aria-valuetext', regionWidthValue(drag.width));
  });
  const endDrag = (event: PointerEvent): void => {
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    const width = drag.width;
    const moved = width !== drag.startWidth;
    drag = undefined;
    delete separator.dataset['dragging'];
    if (moved) commit(width);
    else paint();
  };
  separator.addEventListener('pointerup', endDrag);
  separator.addEventListener('pointercancel', endDrag);
  separator.addEventListener('focus', paint);
  window.addEventListener('resize', paint);
  paint();
  const unsubscribe = view.subscribe(paint);
  return { element: separator, destroy: () => { unsubscribe(); window.removeEventListener('resize', paint); separator.remove(); } };
}

/** 设置 › 本机 › 外观's density, reading preset, typography and region controls, beside 11b's theme (VIEW-001 to VIEW-009). */
export function renderViewSettings(view: ViewPreferences, setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void): { element: HTMLElement; destroy(): void } {
  const section = el('div', 'view-settings');
  const message = el('p', 'field-note');
  message.setAttribute('role', 'status');
  const saved = (write: Promise<void>, done = VIEW_SETTINGS_SAVED): void => {
    void write.then(() => { message.textContent = done; }, () => { message.textContent = VIEW_SETTINGS_SAVE_FAILED; setStatus(VIEW_SETTINGS_SAVE_FAILED, 'error'); });
  };
  const radios = <Value extends string>(legend: string, name: string, choices: ReadonlyArray<{ value: Value; label: string; description?: string }>, choose: (value: Value) => void) => {
    const set = el('fieldset', 'appearance-choices');
    set.append(el('legend', undefined, legend));
    const inputs: HTMLInputElement[] = [];
    for (const choice of choices) {
      const label = el('label', 'appearance-choice');
      const input = el('input');
      input.type = 'radio';
      input.name = name;
      input.value = choice.value;
      input.dataset[name === 'view-density' ? 'viewDensity' : name === 'view-preset' ? 'viewPreset' : 'viewAlignment'] = choice.value;
      input.addEventListener('change', () => { if (input.checked) choose(choice.value); });
      inputs.push(input);
      label.append(input, el('strong', undefined, choice.label), ...(choice.description === undefined ? [] : [el('span', 'field-note', choice.description)]));
      set.append(label);
    }
    return { set, inputs };
  };
  const density = radios(DENSITY_LEGEND, 'view-density', DENSITY_CHOICES, (value) => saved(view.setDensity(value)));
  const preset = radios(PRESET_LEGEND, 'view-preset', PRESET_CHOICES, (value) => saved(view.choosePreset(value)));
  preset.set.append(el('p', 'field-note', PRESET_NOTE));

  const typography = el('fieldset', 'appearance-choices view-typography');
  typography.append(el('legend', undefined, TYPOGRAPHY_LEGEND));
  const familyLabel = el('label', 'view-control', FONT_FAMILY_LABEL);
  const family = el('select');
  family.dataset['viewTypography'] = 'fontFamily';
  for (const choice of FONT_FAMILY_CHOICES) {
    const option = el('option', undefined, choice.label);
    option.value = choice.value;
    family.append(option);
  }
  family.addEventListener('change', () => saved(view.adjustTypography({ fontFamily: family.value as ManuscriptFontFamily })));
  familyLabel.append(family);
  const range = (labelText: string, key: 'fontSize' | 'lineHeight' | 'columnWidth', words: (value: number) => string) => {
    const bounds = TYPOGRAPHY_BOUNDS[key];
    const label = el('label', 'view-control', labelText);
    const input = el('input');
    input.type = 'range';
    input.min = String(bounds.min);
    input.max = String(bounds.max);
    input.step = String(bounds.step);
    input.dataset['viewTypography'] = key;
    const output = el('output', 'field-note');
    input.addEventListener('input', () => { output.textContent = words(Number(input.value)); input.setAttribute('aria-valuetext', output.textContent); });
    input.addEventListener('change', () => saved(view.adjustTypography({ [key]: key === 'lineHeight' ? Math.round(Number(input.value) * 100) / 100 : Number(input.value) })));
    label.append(input, output);
    return { label, input, output, words };
  };
  const fontSize = range(FONT_SIZE_LABEL, 'fontSize', fontSizeValue);
  const lineHeight = range(LINE_HEIGHT_LABEL, 'lineHeight', lineHeightValue);
  const columnWidth = range(COLUMN_WIDTH_LABEL, 'columnWidth', columnWidthValue);
  const alignment = radios(ALIGNMENT_LABEL, 'view-alignment', ALIGNMENT_CHOICES, (value) => saved(view.adjustTypography({ alignment: value })));
  const resetTypography = el('button', 'quiet', TYPOGRAPHY_RESET);
  resetTypography.type = 'button';
  resetTypography.dataset['viewAction'] = 'reset-typography';
  resetTypography.addEventListener('click', () => saved(view.resetTypography(), TYPOGRAPHY_RESET_DONE));
  typography.append(familyLabel, el('p', 'field-note', FONT_FALLBACK_NOTE), fontSize.label, lineHeight.label, columnWidth.label, alignment.set, resetTypography);

  const regions = el('fieldset', 'appearance-choices view-regions');
  regions.append(el('legend', undefined, REGIONS_LEGEND), el('p', 'field-note', REGIONS_NOTE));
  const regionRows = (Object.keys(REGION_NAMES) as RegionKey[]).map((region) => {
    const row = el('p', 'view-region-row');
    row.dataset['viewRegion'] = region;
    regions.append(row);
    return { region, row };
  });
  const restore = el('button', 'secondary', RESTORE_DEFAULT_LAYOUT);
  restore.type = 'button';
  restore.dataset['viewAction'] = 'restore-default-layout';
  restore.addEventListener('click', () => saved(view.restoreDefaultLayout(), RESTORED_DEFAULT_LAYOUT));
  regions.append(restore);

  const paint = (state: ViewState): void => {
    for (const input of density.inputs) input.checked = input.value === state.density;
    for (const input of preset.inputs) input.checked = input.value === state.typography.preset;
    family.value = state.typography.fontFamily;
    for (const control of [fontSize, lineHeight, columnWidth]) {
      const value = state.typography[control.input.dataset['viewTypography'] as 'fontSize' | 'lineHeight' | 'columnWidth'];
      control.input.value = String(value);
      control.output.textContent = control.words(value);
      control.input.setAttribute('aria-valuetext', control.output.textContent);
    }
    for (const input of alignment.inputs) input.checked = input.value === state.typography.alignment;
    for (const { region, row } of regionRows) {
      const width = state.regions[region];
      row.textContent = `${REGION_NAMES[region]}：${width === null ? regionDefault : regionWidthValue(width)}`;
    }
  };
  paint(view.current);
  const unsubscribe = view.subscribe(paint);
  section.append(el('p', 'field-note', VIEW_SETTINGS_PROMISE), density.set, preset.set, typography, regions, message);
  return { element: section, destroy: unsubscribe };
}
