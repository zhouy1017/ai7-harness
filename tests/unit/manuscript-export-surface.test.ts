import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountManuscriptExport, type MountManuscriptExportOptions } from '../../src/renderer/manuscript-export.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, type ManuscriptExportReviewProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';
import { readActionDefaults, rememberActionDefaults } from '../../src/renderer/action-defaults.js';
vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: vi.fn(), rememberActionDefaults: vi.fn(async () => undefined) }));
let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); vi.mocked(readActionDefaults).mockResolvedValue({ exportFormat: 'pdf', includeAnnotations: false, includeSuggestions: true, includeEditorNotes: true } as Awaited<ReturnType<typeof readActionDefaults>>); vi.mocked(rememberActionDefaults).mockClear(); });
afterEach(() => uninstall());
function mount(loss = true) {
  const root = miniDocument.createElement('div'); miniDocument.body.append(root);
  const review = { bookId: 'book', bookTitle: 'Sample', formats: [], retention: null, technical: { revisionDigest: '', sourceVersionId: null, writerIdentity: '', inputDigest: '' }, target: { kind: 'current', milestoneId: null, milestoneLabel: null, packageVersion: null, revisionId: 'r', revisionLabel: 'r1', report: null, document: null },
    savedForExport: false, options: DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, format: 'docx', fidelity: [{ key: 'inline-styles', label: '样式', count: 1, status: 'degraded', statusLabel: '降级导出', detail: '样式降级', positions: [], positionsTruncated: false }],
    degraded: true, restoration: 'regenerated', restorationLine: '转为 AI7 修订建议', retentionSummary: null, formatLine: 'DOCX', reviewDigest: 'digest', suggestedFileName: 'sample.docx' } as ManuscriptExportReviewProjection;
  const choose = vi.fn(async () => { expect(root.querySelector('.export-fidelity-details')!.open).toBe(loss); return { outcome: 'cancelled' as const }; });
  if (!loss) { review.fidelity = []; review.degraded = false; }
  const api = { reviewManuscriptExport: vi.fn<MountManuscriptExportOptions['api']['reviewManuscriptExport']>(async input => ({ ...review, options: input.options, format: input.format ?? 'docx' })), chooseManuscriptExportDestination: choose, approveManuscriptExport: vi.fn(), revealManuscriptExport: vi.fn() };
  const surface = mountManuscriptExport({ root: root as unknown as HTMLElement, bookId: 'book', api, setStatus: vi.fn(), errorMessage: (_e, fallback) => fallback, onChanged: vi.fn(), openerOf: () => null } satisfies MountManuscriptExportOptions);
  const menu = surface.menu({ kind: 'current' }, null); miniDocument.body.append(menu as unknown as MiniElement);
  return { root, menu: miniDocument.body.querySelector('.export-menu')!, api, surface };
}
it('renders stored switches once and exports a clean DOCX without changing defaults', async () => {
  const { root, menu, api, surface } = mount(); await vi.waitFor(() => expect(readActionDefaults).toHaveBeenCalled());
  menu.dispatchEvent({ type: 'toggle' });
  expect(menu.querySelectorAll('[data-export-option]').map(box => box.checked)).toEqual([false, true, true]);
  expect(root.querySelectorAll('[data-export-option]')).toHaveLength(0);
  menu.querySelector('[data-export-clean]')!.click();
  await vi.waitFor(() => expect(api.chooseManuscriptExportDestination).toHaveBeenCalled());
  expect(api.reviewManuscriptExport).toHaveBeenCalledWith({ target: { kind: 'current' }, format: 'docx', options: { includeAnnotations: false, includeSuggestions: false, includeEditorNotes: false } });
  expect(rememberActionDefaults).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(surface.busy()).toBe(false));
  menu.querySelector('[data-export-format-action="docx"]')!.click();
  await vi.waitFor(() => expect(api.reviewManuscriptExport).toHaveBeenCalledTimes(2));
  expect(api.reviewManuscriptExport.mock.calls[1]![0].options).toEqual({ includeAnnotations: false, includeSuggestions: true, includeEditorNotes: true });
});
it('keeps loss rows open after native cancellation and retries the same choices', async () => {
  const { root, menu, api } = mount();
  menu.querySelector('[data-export-format-action="docx"]')!.click();
  await vi.waitFor(() => expect(root.querySelector('[data-export-action="retry"]')).not.toBeNull());
  expect(root.querySelector('.export-restoration-line')!.textContent).toBe('转为 AI7 修改建议');
  expect(root.hidden).toBe(false); expect(root.querySelector('.export-fidelity-details')!.open).toBe(true);
  expect(api.approveManuscriptExport).not.toHaveBeenCalled();
  root.querySelector('[data-export-action="retry"]')!.click();
  await vi.waitFor(() => expect(api.chooseManuscriptExportDestination).toHaveBeenCalledTimes(2));
  expect(api.chooseManuscriptExportDestination.mock.calls[0]).toEqual(api.chooseManuscriptExportDestination.mock.calls[1]);
});

it('hides a cancelled lossless export without a retry', async () => {
  const { root, menu, api, surface } = mount(false);
  menu.querySelector('[data-export-format-action="docx"]')!.click();
  await vi.waitFor(() => expect(api.chooseManuscriptExportDestination).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(surface.busy()).toBe(false));
  expect(root.hidden).toBe(true); expect(root.querySelector('[data-export-action="retry"]') === null).toBe(true);
  expect(api.approveManuscriptExport).not.toHaveBeenCalled();
});
it('focuses and dismisses the cancelled loss card and never remembers a clean retry', async () => {
  const { root, menu, api, surface } = mount();
  await Promise.resolve(); menu.querySelector('[data-export-clean]')!.click();
  await vi.waitFor(() => expect(surface.busy()).toBe(false));
  const retry = root.querySelector('[data-export-action="retry"]')!;
  expect(miniDocument.activeElement === retry).toBe(true); retry.click();
  await vi.waitFor(() => expect(api.chooseManuscriptExportDestination).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(surface.busy()).toBe(false));
  expect(api.reviewManuscriptExport.mock.calls.every(([input]) => Object.values(input.options!).every(value => value === false))).toBe(true);
  expect(rememberActionDefaults).not.toHaveBeenCalled();
  root.querySelector('[data-export-action="close"]')!.click(); expect(root.hidden).toBe(true);
});
