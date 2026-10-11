import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isFunctionDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { describe, expect, it } from 'vitest';
import { decodeRequest } from '../../src/service/request-frames.js';
import { exemplarDesignation, exemplarLine } from '../../src/renderer/knowledge-base-labels.js';
import type { ExemplarProjection, ServiceRequest } from '../../src/shared/protocol.js';

const request = (value: unknown) => decodeRequest(new TextEncoder().encode(JSON.stringify(value)));
describe('imported exemplar boundaries and editor words', () => {
  it('decodes exact picker/import/decision requests and refuses extra authority or malformed parameters', () => {
    const preview = { id: randomUUID(), op: 'previewImportedExemplar', input: { path: resolve('synthetic.txt') } } satisfies ServiceRequest;
    const imported = { id: randomUUID(), op: 'importEarlierExemplar', input: {
      previewId: randomUUID(), bookId: null, bookTitle: '测试图书', authors: ['测试作者'], editors: ['测试责编'], typeId: 'news-release', expectedVersion: 0,
    } } satisfies ServiceRequest;
    const decision = { id: randomUUID(), op: 'decideImportedExemplar', input: {
      revisionId: randomUUID(), revisionDigest: 'a'.repeat(64), expectedDecisions: 1, choice: 'excluded',
    } } satisfies ServiceRequest;
    for (const frame of [preview, imported, decision]) {
      expect(request(frame)).toEqual(frame);
      expect(() => request({ ...frame, input: { ...frame.input, autoPublish: true } })).toThrow();
    }
    expect(() => request({ ...preview, input: { path: 'relative.txt' } })).toThrow();
    expect(() => request({ ...imported, input: { ...imported.input, expectedVersion: -1 } })).toThrow();
    expect(() => request({ ...decision, input: { ...decision.input, choice: 'book' } })).toThrow();
  });
  it('calls an earlier Book imported and names its version, original and eligibility without inventing delivery', () => {
    expect(exemplarDesignation({ imported: true, publicationOrdinal: 0, designatedAt: 'T', withdrawn: false }, (instant) => instant))
      .toBe('以前出版的图书 · 导入于 T');
    const entry: ExemplarProjection = { documentId: 'd', revisionId: 'r', revisionDigest: 'a'.repeat(64), typeId: 'news-release', typeLabel: '新闻稿',
      version: 2, deliveredTo: '', deliveredAt: 'T', archivedAt: 'T', eligibility: 'excluded', earlierVersions: [1], earlierVersionCount: 1,
      imported: { sourceName: '测试.txt', decisions: 2 } };
    expect(exemplarLine(entry, (instant) => instant)).toBe('新闻稿 · 版本 2 · 导入于 T · 原件：测试.txt · 学习准入：明确排除 · 此前导入过 1 个版本');
    expect(exemplarLine({ ...entry, eligibility: 'deferred' }, (instant) => instant)).toContain('稍后决定');
  });
});

// Run the actual import form with a small DOM stub, as writing-material-selection does: no type is preselected, and 导入范例
// stays disabled until the editor chooses one (Issue #778). The form and its `node` helper are lifted from the renderer source.
const formSource = readFileSync(new URL('../../src/renderer/imported-exemplars.ts', import.meta.url), 'utf8');
const formFile = createSourceFile('imported-exemplars.ts', formSource, ScriptTarget.ES2022, true);
const extracted = new Map<string, string>();
function extract(node: Node): void {
  if (isFunctionDeclaration(node) && node.name !== undefined && (node.name.text === 'node' || node.name.text === 'exemplarImportButton')) {
    extracted.set(node.name.text, node.getText(formFile).replace(/^export\s+/u, ''));
  }
  forEachChild(node, extract);
}
extract(formFile);
if (extracted.size !== 2) throw new Error('Expected the import form and its node helper.');
const formCode = transpileModule([...extracted.values()].join('\n'), { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;

class FormElement {
  children: FormElement[] = [];
  dataset: Record<string, string> = {};
  listeners = new Map<string, (event?: unknown) => unknown>();
  disabled = false;
  hidden = false;
  required = false;
  maxLength = 0;
  value = '';
  textContent: string | null = null;
  className = '';
  type = '';
  constructor(readonly tag: string) {}
  append(...nodes: FormElement[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FormElement[]): void { this.children = [...nodes]; }
  addEventListener(key: string, listener: (event?: unknown) => unknown): void { this.listeners.set(key, listener); }
  remove(): void {}
  focus(): void {}
  all(): FormElement[] { return [this, ...this.children.flatMap((child) => child.all())]; }
}

function importFormHarness() {
  const preview = {
    previewId: 'preview-1', displayName: '测试.txt', format: 'TXT', sha256: 'a'.repeat(64), bytes: 12, excerpt: '测试文字',
    types: [{ typeId: 'news-release', label: '新闻稿' }, { typeId: 'promotion-article', label: '宣传文章' }],
  };
  let imported: Record<string, unknown> | null = null;
  let select: FormElement | null = null;
  let selectDisabledDuringImport: boolean | null = null;
  const statuses: string[] = [];
  const context = createContext({
    document: { createElement: (tag: string) => new FormElement(tag) },
    surface: {
      api: {
        previewImportedExemplar: async () => preview,
        importEarlierExemplar: async (input: Record<string, unknown>) => { imported = input; selectDisabledDuringImport = select?.disabled ?? null; return {}; },
      },
      refresh: async () => {},
      status: (message: string) => { statuses.push(message); },
      error: (_error: unknown, fallback: string) => fallback,
    },
  });
  runInContext(formCode, context);
  const root = runInContext('exemplarImportButton(surface)', context) as FormElement;
  const open = root.children[0]!;
  expect(open.dataset['exemplarAction']).toBe('import');
  open.listeners.get('click')!();
  const form = root.children[1]!;
  const type = form.all().find((element) => element.tag === 'select')!;
  select = type;
  const choose = form.all().find((element) => element.tag === 'button' && element.textContent === '选择文件')!;
  const submit = form.all().find((element) => element.tag === 'button' && element.textContent === '导入范例')!;
  return {
    type, choose, submit, statuses,
    imported: () => imported,
    selectDisabledDuringImport: () => selectDisabledDuringImport,
    submitNow: async () => { await form.listeners.get('submit')!({ preventDefault: () => {} }); },
  };
}

describe('earlier-Book exemplar import form', () => {
  it('preselects no type and keeps 导入范例 disabled until the editor chooses one (Issue #778)', async () => {
    const view = importFormHarness();
    await view.choose.listeners.get('click')!();
    expect(view.type.disabled).toBe(false);
    expect(view.type.value).toBe('');
    expect(view.type.children.map((option) => option.value)).toEqual(['', 'news-release', 'promotion-article']);
    expect(view.type.children[0]!.textContent).toBe('请选择文档类型');
    expect(view.submit.disabled).toBe(true);
    await view.submitNow();
    expect(view.imported()).toBeNull();
    view.type.value = 'promotion-article';
    view.type.listeners.get('change')!();
    expect(view.submit.disabled).toBe(false);
    await view.submitNow();
    expect(view.imported()).toMatchObject({ previewId: 'preview-1', bookId: null, typeId: 'promotion-article', expectedVersion: 0 });
    // While it imports, the type cannot be changed — the change listener would otherwise offer 导入范例 a second time.
    expect(view.selectDisabledDuringImport()).toBe(true);
    expect(view.statuses).toContain('范例已导入');
  });
});
