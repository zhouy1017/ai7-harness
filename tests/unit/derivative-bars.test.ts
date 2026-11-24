import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { mountManuscriptSwitcher, type ManuscriptSwitcher } from '../../src/renderer/manuscript-switcher.js';
import { mountWritingTask, type WritingTaskSurface } from '../../src/renderer/writing-task.js';
import type { ProductionDocumentProjection, ProductionDocumentsProjection, WritingTaskProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
const surfaces: Array<ManuscriptSwitcher | WritingTaskSurface> = [];
beforeEach(() => { restore = installMiniDom(); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { for (const surface of surfaces.splice(0)) surface.destroy(); vi.unstubAllGlobals(); restore(); });

const manuscript: ProductionDocumentProjection = {
  documentId: 'document', branchId: 'branch', title: '媒体稿', createdAt: '2026-11-09T00:00:00Z',
  finalized: false, preview: '', characterCount: 0, versions: [], versionsTruncated: false, changedSinceVersion: false,
  journalSequence: 0, workingDigest: '', deliveries: [], deliveriesTruncated: false, changedSinceDelivery: false,
  origin: { sourceVersionId: '', displayName: '', marksNotCarried: null, drafted: false },
  workflow: { profile: { id: '', name: '', version: '', activatedAt: '' }, summary: '', next: [], phases: [], transitions: 0 },
};
const documents = (present: boolean): ProductionDocumentsProjection => ({
  bookId: 'book', configuration: { schema: '', version: '', digest: '' }, unavailableReason: null, sources: [], sourcesTruncated: false,
  types: [{ typeId: 'news-release', label: '新闻稿', notForThisBook: false, document: present ? manuscript : null, documents: present ? [manuscript] : [] }],
});
type WritingState = NonNullable<WritingTaskProjection['task']>['state'];
const writingPage = (state: WritingState | null = null, drafted = false, refusal: string | null = null): WritingTaskProjection => ({
  bookId: 'book', unavailable: null,
  references: { synopsis: '', evaluation: '', book: '', materials: { statement: '', items: [], more: 0 } },
  consequences: { read: '', send: '', notDo: '', cost: '' },
  types: [{ typeId: 'news-release', label: '新闻稿', prepare: { allowed: true, mode: 'writing-first' }, exemplars: { count: 0, statement: '' },
    drafted: drafted ? { revisionId: 'draft', createdAt: '2026-11-09T00:00:00Z' } : null, quickStart: { available: false, reason: null, rule: null } }],
  task: state === null ? null : { taskIntentId: 'task', typeId: 'news-release', typeLabel: '新闻稿', state, label: state === 'failed' ? '写作失败' : '写作状态',
    modelLabel: '测试模型@high', refusal, planEnvelopeDigest: null },
});
const callbacks = () => ({ setStatus: vi.fn(), errorMessage: (_error: unknown, fallback: string) => fallback,
  awaitServiceJob: vi.fn(), openLaunch: vi.fn(), openDocument: vi.fn(async () => {}) });

async function switcher(present = false) {
  const toolbar = document.createElement('header'); toolbar.className = 'editor-toolbar'; document.body.append(toolbar);
  const openWorkspace = vi.fn(async () => {});
  const openPrimary = vi.fn(async () => {});
  const surface = mountManuscriptSwitcher({ ...callbacks(), toolbar, bookId: 'book', bookTitle: '测试图书', currentDocumentId: present ? manuscript.documentId : null,
    api: { inspectProductionDocuments: async () => documents(present), inspectWritingTask: async () => writingPage() } as never,
    openWorkspace, openPrimary, openWritingPlan: vi.fn() });
  surfaces.push(surface); document.body.append(surface.element);
  await vi.waitFor(() => expect(toolbar.querySelector<HTMLButtonElement>('[data-manuscript-switch="new"]')?.disabled).toBe(false));
  return { surface, toolbar, openWorkspace, openPrimary, bar: surface.element.querySelector<HTMLElement>('.manuscript-switcher-bar')! };
}

it('hides an empty tab row while create, import and manage remain in the manuscript toolbar', async () => {
  const { surface, toolbar, bar, openWorkspace } = await switcher();
  expect(bar.hidden).toBe(true);
  expect(toolbar.querySelector('[data-derivative-menu]')?.textContent).toBe('衍生稿件 ▾');
  expect(bar.querySelector('.derivative-menu')).toBeNull();
  toolbar.querySelector<HTMLButtonElement>('[data-manuscript-switch="new"]')!.click();
  expect(surface.element.querySelector<HTMLElement>('.derivative-create')!.hidden).toBe(false);
  expect([...surface.element.querySelectorAll<HTMLInputElement>('.derivative-modes input')].map((input) => input.value)).toContain('import');
  toolbar.querySelector<HTMLButtonElement>('[data-manuscript-switch="new"]')!.click();
  expect(surface.element.querySelector<HTMLElement>('.derivative-create')!.hidden).toBe(true);
  expect(miniDocument.activeElement).toBe(toolbar.querySelector('[data-derivative-menu]'));
  toolbar.querySelector<HTMLButtonElement>('[data-manuscript-switch="manage"]')!.click();
  expect(openWorkspace).toHaveBeenCalledOnce();
});

it('shows manuscript tabs when derivatives exist and removes them when the last derivative disappears', async () => {
  const { surface, toolbar, bar, openPrimary } = await switcher(true);
  expect(bar.hidden).toBe(false);
  expect(bar.querySelector('[data-manuscript-switch="document"]')?.getAttribute('aria-current')).toBe('page');
  bar.querySelector<HTMLButtonElement>('[data-manuscript-switch="primary"]')!.click();
  expect(openPrimary).toHaveBeenCalledOnce();
  surface.renamed(documents(false));
  expect(bar.hidden).toBe(true);
  surface.renamed(documents(true));
  expect(bar.hidden).toBe(false);
  expect(toolbar.querySelectorAll('.derivative-menu')).toHaveLength(1);
  surface.destroy();
  expect(toolbar.querySelector('.derivative-menu')).toBeNull();
});

async function writing(page: WritingTaskProjection) {
  const root = document.createElement('main'); document.body.append(root);
  const openPlan = vi.fn();
  const surface = mountWritingTask({ ...callbacks(), root, embedded: true,
    api: { inspectWritingTask: async () => page } as never, documentsChanged: vi.fn(), openPlan });
  surfaces.push(surface); surface.refresh();
  await vi.waitFor(() => expect(root.querySelector('.writing-task')?.getAttribute('data-writing-state')).toBe(page.task?.state ?? 'none'));
  return { surface, section: root.querySelector<HTMLElement>('.writing-task')!, openPlan };
}

it.each([null, 'available', 'settled', 'cancelled'] as const)('hides writing without drafts after %s', async (state) => {
  const { section } = await writing(writingPage(state));
  expect(section.hidden).toBe(true);
});

it.each(['prepared', 'authorized-blocked', 'waiting', 'admitted', 'executing', 'cancelling', 'pausing', 'queued',
  'paused', 'resumable', 'awaiting-clarification', 'interrupted', 'failed'] as const)('keeps %s writing reachable in one status row', async (state) => {
  const { section, openPlan } = await writing(writingPage(state));
  expect(section.hidden).toBe(false);
  const row = section.querySelector<HTMLElement>('.writing-task-summary')!;
  expect(row.querySelector('h3')?.textContent).toBe('AI 写作');
  // Developer mode shows the record's level name; ordinary mode says it in the list's word.
  expect(row.querySelector('.writing-task-line')?.textContent).toContain('测试模型@high');
  setTechnicalLayerVisible(false);
  try { expect((await writing(writingPage(state))).section.querySelector('.writing-task-line')?.textContent).toContain('测试模型@高'); }
  finally { setTechnicalLayerVisible(true); }
  expect(section.querySelector('.field-note')).toBeNull();
  row.querySelector<HTMLButtonElement>('[data-writing-action="open-task"]')!.click();
  expect(openPlan).toHaveBeenCalledWith('task');
});

it('keeps a refused result and its reason visible even when the run settled', async () => {
  const { section } = await writing(writingPage('settled', false, '写作未能完成，请查看任务。'));
  expect(section.hidden).toBe(false);
  expect(section.querySelector('.writing-task-refusal')?.textContent).toBe('写作未能完成，请查看任务。');
});

it('keeps a completed draft available and can open the sheet after historical writing is hidden', async () => {
  const drafted = await writing(writingPage('settled', true));
  expect(drafted.section.hidden).toBe(false);
  expect(drafted.section.querySelector('[data-writing-action="open-draft"]')).not.toBeNull();
  const completed = await writing(writingPage('settled'));
  completed.surface.open('news-release', '媒体稿');
  expect(completed.section.hidden).toBe(false);
  expect(completed.section.querySelector<HTMLElement>('.writing-task-sheet')?.getAttribute('aria-modal')).toBe('false');
  expect((completed.section.querySelector('.writing-task-sheet') as unknown as MiniElement).open).toBe(true);
});

it('lays out the writing summary as a single compact row and hides the empty flex tab bar', () => {
  const css = readFileSync(new URL('../../src/renderer/styles.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.writing-task-summary \{[^}]*display: flex;[^}]*align-items: center;/u);
  expect(css).toMatch(/\.writing-task-summary > :is\(p, \.field-note\) \{[^}]*white-space: nowrap;/u);
  expect(css).toMatch(/\.manuscript-switcher-bar\[hidden\] \{ display: none; \}/u);
});
