import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Preferences } from '../../src/main/preferences.js';
import { applyAppearance, createAppearance } from '../../src/renderer/appearance.js';
import type { AppearanceState } from '../../src/shared/preferences.js';
import { renderDocxExport, type DocxExportInput } from '../../src/service/docx-export.js';
import { renderMarkdownExport, renderPdfHtmlExport } from '../../src/service/text-export.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

// #935 / VIS-004..009: local preferences and decoration never enter manuscript/export state.
const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); vi.unstubAllGlobals(); });

describe('application appearance', () => {
  it('defaults to system and restores a validated choice after relaunch; rejects undeclared values', async () => {
    const path = await mkdtemp(join(tmpdir(), 'ai7-appearance-')); directories.push(path);
    const preferences = new Preferences(path);
    expect(await preferences.get()).toEqual({ 'appearance.theme': 'system' });
    await preferences.save({ key: 'appearance.theme', value: 'dark' });
    expect(await new Preferences(path).get()).toEqual({ 'appearance.theme': 'dark' });
    expect(JSON.parse(await readFile(join(path, 'preferences.json'), 'utf8'))).toEqual({ version: 1, values: { 'appearance.theme': 'dark' } });
    await expect(preferences.save({ key: 'appearance.theme', value: 'custom' })).rejects.toThrow('PREFERENCE_INVALID');
    await expect(preferences.save({ key: '__proto__', value: 'dark' })).rejects.toThrow('PREFERENCE_INVALID');
    await Promise.all(['light', 'dark', 'system'].map((value) => preferences.save({ key: 'appearance.theme', value })));
    expect(await new Preferences(path).get()).toEqual({ 'appearance.theme': 'system' });
    await writeFile(join(path, 'preferences.json'), '{broken');
    expect(await preferences.get()).toEqual({ 'appearance.theme': 'system' });
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
      const save = vi.fn(async ({ value }: { key: string; value: unknown }) => ({ 'appearance.theme': value }));
      const appearance = createAppearance({ getPreferences: async () => ({}), savePreference: save,
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

  it('defines every color in a root token and leaves forced-colors independent of theme tokens', () => {
    const css = readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
    const roots = [...withoutComments.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{([^}]+)\}/gu)].slice(0, 2).map((match) => match[1]!);
    const names = roots.map((root) => [...root.matchAll(/(--[\w-]+):/gu)].map((match) => match[1]!).sort());
    expect(names[0]).toEqual(names[1]);
    const components = withoutComments.replace(/:root(?:\[data-theme="dark"\])?\s*\{[^}]+\}/gu, '');
    expect(components).not.toMatch(/#[a-f\d]{3,8}\b|rgba?\(|:\s*(?:white|black)\b/iu);
    const start = css.indexOf('@media (forced-colors: active)');
    let depth = 1; let end = css.indexOf('{', start) + 1;
    for (; depth > 0; end += 1) { if (css[end] === '{') depth += 1; if (css[end] === '}') depth -= 1; }
    expect(css.slice(start, end)).not.toMatch(/var\(--|data-theme/gu);
    expect(css.slice(start, end)).toContain('background: Canvas');
  });
});
