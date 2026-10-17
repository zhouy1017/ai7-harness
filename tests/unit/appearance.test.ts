import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreferenceStore } from '../../src/main/preferences.js';
import { applyAppearance, createAppearance } from '../../src/renderer/appearance.js';
import type { AppearanceState } from '../../src/shared/appearance.js';
import type { PreferencesProjection } from '../../src/shared/preferences.js';
import { renderDocxExport, type DocxExportInput } from '../../src/service/docx-export.js';
import { renderMarkdownExport, renderPdfHtmlExport } from '../../src/service/text-export.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

// #935 / VIS-004..009: local preferences and decoration never enter manuscript/export state.
const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); vi.unstubAllGlobals(); });

describe('application appearance', () => {
  it('defaults to system through the shared preferences owner and restores a validated choice after relaunch', async () => {
    const path = await mkdtemp(join(tmpdir(), 'ai7-appearance-')); directories.push(path);
    const preferences = createPreferenceStore(path);
    expect(preferences.read().values['appearance.theme']).toBe('system');
    preferences.save({ key: 'appearance.theme', value: 'dark' });
    expect(createPreferenceStore(path).read().values['appearance.theme']).toBe('dark');
    const stored = JSON.parse(await readFile(join(path, 'preferences.json'), 'utf8'));
    expect(stored.version).toBe(1); expect(stored.values['appearance.theme']).toBe('dark');
    expect(() => preferences.save({ key: 'appearance.theme', value: 'custom' })).toThrow(expect.objectContaining({ code: 'AI7_PREFERENCE_VALUE_INVALID' }));
    expect(createPreferenceStore(path).read().values['appearance.theme']).toBe('dark');
    await writeFile(join(path, 'preferences.json'), '{broken');
    expect(createPreferenceStore(path).read().values['appearance.theme']).toBe('system');
  });

  it('follows main-process system changes across windows without replacing focused editing content', async () => {
    const uninstall = installMiniDom();
    try {
      const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
      const secondRoot = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
      const editor = miniDocument.createElement('textarea');
      editor.value = '合成编辑状态'; miniDocument.body.append(editor); editor.focus();
      const state = { scrollTop: 275, selectionStart: 2, selectionEnd: 5, journalSequence: 7 };
      Object.assign(editor, state);
      vi.stubGlobal('document', { ...miniDocument, documentElement: root });
      let notify: (state: AppearanceState) => void = () => undefined;
      const save = vi.fn(async ({ value }: { key: string; value: unknown }) => ({ values: { 'appearance.theme': value } }) as unknown as PreferencesProjection);
      const appearance = createAppearance({ savePreference: save,
        onAppearanceChanged: (listener) => { notify = (next) => { listener(next); applyAppearance(secondRoot as unknown as HTMLElement, next); }; return () => undefined; } });
      notify({ preference: 'system', systemDark: false }); await appearance.ready;
      notify({ preference: 'system', systemDark: true });
      expect(root.dataset['theme']).toBe('dark'); expect(root.style.colorScheme).toBe('dark');
      expect(secondRoot.dataset['theme']).toBe('dark');
      expect(miniDocument.activeElement).toBe(editor); expect(miniDocument.body.children[0]).toBe(editor);
      expect(editor.value).toBe('合成编辑状态'); expect(editor).toMatchObject(state);
      expect(save).not.toHaveBeenCalled();
      await appearance.choose('light');
      notify({ preference: 'light', systemDark: true });
      expect(root.dataset['theme']).toBe('light');
      await appearance.choose('system');
      expect(root.dataset['theme']).toBe('dark');
    } finally { uninstall(); }
  });

  it('runs the J-14 dark pass from every runner exactly once, on a named representative screen', () => {
    const e2e = new URL('../../e2e/', import.meta.url);
    const runners = readdirSync(e2e).filter((name) => /^run-j\d\d\.mjs$/u.test(name));
    expect(runners).toHaveLength(15);
    for (const runner of runners) {
      const source = readFileSync(new URL(runner, e2e), 'utf8');
      const calls = source.match(/await runJ14DarkPass\(\{[^\n]*/gu) ?? [];
      expect(calls, runner).toHaveLength(1);
      expect(calls[0], runner).toContain(`journey: 'J-${runner.slice(5, 7)}'`);
    }
  });

  it('starts the J-14 dark pass from its painted screen and names the screen it found when a check passes its bound', async () => {
    // The hosted J-08 failure: product-ready came before the first screen, and 设置 opened then was replaced by 书库.
    const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
      runJ14DarkPass(options: object): Promise<void>;
      journeyCheckLabel(error: unknown): string | null;
    };
    const representative = '#screen[data-screen="landing"] > .panel';
    const painted = `Promise.resolve(document.querySelector(${JSON.stringify(representative)})).then(Boolean)`;
    const labelOf = async (evaluate: (expression: string) => Promise<unknown>) => {
      const outcome = controller.runJ14DarkPass({ renderer: { evaluate, send: async () => undefined }, journey: 'J-08', at: () => undefined, representative })
        .then(() => null, (error: unknown) => controller.journeyCheckLabel(error));
      await vi.runAllTimersAsync();
      return outcome;
    };
    const screenWord = (word: string | Error) => async (expression: string) => {
      if (expression.includes('#screen\')?.dataset.screen')) { if (word instanceof Error) throw word; return word; }
      return false;
    };
    vi.useFakeTimers();
    try {
      expect(await labelOf(screenWord('none'))).toBe('j14-dark-pass-ready-on-none');
      expect(await labelOf(screenWord(new Error('J-08/renderer-evaluate')))).toBe('j14-dark-pass-ready-on-none');
      const landing = screenWord('landing');
      expect(await labelOf(async (expression) => expression === painted || landing(expression))).toBe('j14-dark-pass-open-settings-on-landing');
      expect(await labelOf(async (expression) => expression === painted || expression.includes('data-nav-settings') || landing(expression)))
        .toBe('j14-dark-pass-settings-on-landing');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the theme and the preference file out of every service module, so no record, export or model context can read them', () => {
    const service = new URL('../../src/service/', import.meta.url);
    const files = readdirSync(service, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(new URL(file.replaceAll('\\', '/'), service), 'utf8'), file).not.toMatch(/shared\/preferences|preferences\.json|appearance\.theme|data-theme|dataset\.theme|nativeTheme/u);
    }
  });

  it('keeps DOCX, Markdown and PDF-page export digests identical across light and dark decoration', () => {
    const root = { dataset: {}, style: { colorScheme: '' } } as unknown as HTMLElement;
    const block = { blockId: 'blk_' + 'a'.repeat(24), position: 1, kind: 'paragraph' as const, level: null, text: '合成外观回归内容。' };
    const input: DocxExportInput = { title: '合成图书', blocks: [{ ...block,
      digest: createHash('sha256').update(JSON.stringify({ kind: block.kind, level: block.level, text: block.text })).digest('hex') }], marks: [], options: DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
      source: { kind: 'fresh', reason: 'no-mapping', scan: null, converter: null } };
    const digest = (bytes: Uint8Array | null) => createHash('sha256').update(bytes!).digest('hex');
    const exports = () => [renderDocxExport(input, { emit: true }), renderMarkdownExport(input, { emit: true }), renderPdfHtmlExport(input, { emit: true })].map((result) => digest(result.bytes));
    applyAppearance(root, { preference: 'light', systemDark: true }); const light = exports();
    applyAppearance(root, { preference: 'dark', systemDark: false }); expect(exports()).toEqual(light);
  });

  it('keeps a newer cross-window theme when an older save acknowledgement arrives later', async () => {
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
    vi.stubGlobal('document', { documentElement: root });
    let notify!: (state: AppearanceState) => void;
    let complete!: (projection: PreferencesProjection) => void;
    const appearance = createAppearance({
      savePreference: () => new Promise((resolve) => { complete = resolve; }),
      onAppearanceChanged: (listener) => { notify = listener; return () => undefined; } });
    notify({ preference: 'system', systemDark: false }); await appearance.ready;
    const saving = appearance.choose('dark');
    notify({ preference: 'dark', systemDark: false });
    notify({ preference: 'light', systemDark: true });
    complete({ values: { 'appearance.theme': 'dark' } } as unknown as PreferencesProjection); await saving;
    expect(appearance.preference).toBe('light');
    expect(root.dataset['theme']).toBe('light');
  });

  it('defines every color in a root token and leaves forced-colors independent of theme tokens', () => {
    const css = readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
    const roots = [...withoutComments.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{([^}]+)\}/gu)].slice(0, 2).map((match) => match[1]!);
    const names = roots.map((root) => [...root.matchAll(/(--[\w-]+):/gu)].map((match) => match[1]!).sort());
    expect(names[0]).toEqual(names[1]);
    const luminance = (hex: string) => {
      const channels = hex.slice(1).match(/../gu)!.map((part) => {
        const value = Number.parseInt(part, 16) / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
    };
    for (const root of roots) {
      const tokens = Object.fromEntries([...root.matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/gu)].map((match) => [match[1]!, match[2]!]));
      const pairs = ['surface', 'surface-subdued', 'manuscript', 'shell'].flatMap((surface) => [['text', surface], ['text-subdued', surface]]);
      pairs.push(['action-primary-text', 'action-primary'], ['selection-text', 'selection']);
      for (const status of ['neutral', 'good', 'attention', 'blocked', 'progress']) pairs.push([`status-${status}`, `status-${status}-surface`]);
      for (const [foreground, background] of pairs) {
        const l1 = luminance(tokens[`--${foreground}`]!), l2 = luminance(tokens[`--${background}`]!);
        expect((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
      // Non-text contrast (3:1) for the boundaries that identify a control or a chosen/current item.
      for (const boundary of ['boundary-strong', 'selection-boundary']) {
        for (const surface of ['surface', 'surface-subdued', 'manuscript', 'shell']) {
          const l1 = luminance(tokens[`--${boundary}`]!), l2 = luminance(tokens[`--${surface}`]!);
          expect((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05), `${boundary} on ${surface}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
    const components = withoutComments.replace(/:root(?:\[data-theme="dark"\])?\s*\{[^}]+\}/gu, '');
    expect(components).not.toMatch(/#[a-f\d]{3,8}\b|rgba?\(|:\s*(?:white|black)\b/iu);
    // A checked, current, selected or pressed item marked by a line keeps a visible one, never only the faint boundary or shadow.
    for (const [, selector, body] of components.matchAll(/([^{}]*(?::checked|aria-current|aria-selected|aria-pressed)[^{}]*)\{([^}]*)\}/gu)) {
      const lines = body!.split(';').filter((item) => /^\s*(?:border|box-shadow)/u.test(item));
      if (!lines.some((line) => line.includes('var(--'))) continue; // none, or forced system colours
      expect(lines.join(';'), selector!.trim()).not.toMatch(/box-shadow:[^;]*var\(--shadow\)/u);
      expect(lines.some((line) => /var\(--(?!boundary\)|shadow\))[\w-]+\)/u.test(line)), selector!.trim()).toBe(true);
    }
    let blocks = 0;
    for (let start = css.indexOf('@media (forced-colors: active)'); start >= 0; start = css.indexOf('@media (forced-colors: active)', start + 1)) {
      let depth = 1; let end = css.indexOf('{', start) + 1;
      for (; depth > 0; end += 1) { if (css[end] === '{') depth += 1; if (css[end] === '}') depth -= 1; }
      expect(css.slice(start, end)).not.toMatch(/var\(--|data-theme/gu);
      blocks += 1;
    }
    expect(blocks).toBeGreaterThan(0);
    expect(css.slice(css.indexOf('@media (forced-colors: active)'))).toContain('background: Canvas');
  });
});
