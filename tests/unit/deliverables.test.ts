import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { mountDeliverables } from '../../src/renderer/deliverables.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { DeliverablesProjection } from '../../src/shared/protocol.js';

vi.mock('../../src/renderer/manuscript-export.js', () => ({ mountManuscriptExport: () => ({ menu: () => miniDocument.createElement('details'), busy: () => false, destroy() {} }) }));
const { refreshPackage } = vi.hoisted(() => ({ refreshPackage: vi.fn() }));
vi.mock('../../src/renderer/book-delivery-package.js', () => ({ mountBookDeliveryPackage: () => ({ refresh: refreshPackage, destroy() {} }) }));
vi.mock('../../src/renderer/maintenance-cases.js', () => ({ mountMaintenance: () => ({ destroy() {} }) }));
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); refreshPackage.mockClear(); });
afterEach(() => restore());
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
async function setup(refuse = false, press = true) {
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const projection: DeliverablesProjection = { bookId: 'book', bookTitle: '图书',
    manuscript: { manuscriptId: 'manuscript', branchId: 'branch', revisionId: 'revision', revisionLabel: 'r1', journalSequence: 1, workingDigest: 'a'.repeat(64) },
    publication: { milestones: [], milestonesTruncated: false, designations: [], designationsTruncated: false, changeNotice: null,
      designate: { available: false, unavailableReason: '先保存里程碑版本' }, statement: '仅表示此版本可用于上述发稿范围；AI7 不会发布或发送', actualsPrompt: null }, exports: [] };
  const calls: string[] = [];
  const api = {
    designatePublicationVersion: vi.fn(),
    inspectDeliverables: vi.fn(async () => { calls.push('inspect'); return structuredClone(projection); }),
    getManuscriptWindow: vi.fn(async () => { calls.push('window'); }),
    saveMilestone: vi.fn(async (input) => {
      calls.push('save');
      if (refuse) throw new Error('暂时无法保存，请重试。');
      projection.publication.milestones = [{ milestoneId: 'milestone', label: input.label, purposeKind: input.purposeKind, purposeLabel: '阶段留档', revisionId: 'revision', revisionLabel: 'r1', actor: '本机编辑', createdAt: '2026-11-21T00:00:00Z', note: null, changedSince: false, changedSinceLabel: null, designation: null, technical: { signoffRecordId: 'signoff' } }];
      projection.publication.designate = { available: true, unavailableReason: null };
      return { milestoneId: 'milestone', completionLabel: '已保存' };
    }),
  };
  const setStatus = vi.fn();
  const surface = mountDeliverables({ root: root as unknown as HTMLElement, bookId: 'book', bookTitle: '图书', api: api as never,
    technicalDetails: () => miniDocument.createElement('details') as unknown as HTMLElement,
    setStatus, errorMessage: (error) => (error as Error).message, openDocument: vi.fn(), openReview: vi.fn(), openManuscript: vi.fn() });
  surface.start(); await settle(); calls.length = 0;
  if (press) { root.querySelector('[data-publication-action="designate"]')!.click(); await settle(); }
  return { root, api, calls, setStatus, surface };
}
it('saves with menu defaults and opens the selected designation at its confirm', async () => {
  const { root, api, calls, setStatus } = await setup();
  expect(calls).toEqual(['save', 'inspect']);
  expect(api.getManuscriptWindow).not.toHaveBeenCalled();
  expect(api.designatePublicationVersion).not.toHaveBeenCalled();
  expect(setStatus).toHaveBeenLastCalledWith('里程碑已保存，请在下方确认设为发稿版本。', 'success');
  expect(refreshPackage).toHaveBeenCalledTimes(2);
  expect(miniDocument.activeElement).toBe(root.querySelector('[data-publication-action="confirm"]'));
  expect(api.saveMilestone).toHaveBeenCalledWith({ manuscriptId: 'manuscript', branchId: 'branch', label: expect.stringMatching(/^阶段留档 · /u), purposeKind: 'stage-archive', purpose: null, note: '' });
  expect(root.querySelector('input')?.checked).toBe(true);
  expect(root.querySelector('[data-publication-field="scope"]')?.value).toBe('全书定稿');
});
it('shows the service refusal and leaves the in-place action usable', async () => {
  const { root, calls, setStatus } = await setup(true);
  expect(calls).toEqual(['save', 'inspect']);
  expect(setStatus).toHaveBeenLastCalledWith('暂时无法保存，请重试。', 'error');
  expect(root.querySelector('[data-publication-action="designate"]')?.disabled).toBe(false);
  expect(root.querySelector('form.publication-designate')).toBeNull();
});

it('retains the saved status and refreshes when the post-save read rejects', async () => {
  const { root, api, calls, setStatus } = await setup(false, false);
  api.inspectDeliverables.mockRejectedValueOnce(new Error('read failed'));
  root.querySelector('[data-publication-action="designate"]')!.click(); await settle();
  expect(calls).toEqual(['save', 'inspect']);
  expect(api.inspectDeliverables).toHaveBeenCalledTimes(3);
  expect(setStatus).toHaveBeenLastCalledWith('里程碑已保存，请在下方确认设为发稿版本。', 'success');
  expect(root.querySelector('[data-publication-action="designate"]')?.textContent).toBe('设为发稿版本…');
  expect(root.querySelector('input')?.checked).toBe(true);
});

it('renders all three definitions', async () => {
  const { root } = await setup(false, false);
  expect(root.querySelectorAll('p.deliverables-definition')).toHaveLength(3);
});
it('offers the existing milestone form without saving another milestone', async () => {
  const { root, api } = await setup();
  root.querySelector('[data-publication-action="cancel"]')!.click();
  api.saveMilestone.mockClear();
  expect(root.querySelector('[data-publication-action="designate"]')?.textContent).toBe('设为发稿版本…');
  root.querySelector('[data-publication-action="designate"]')!.click(); await settle();
  expect(api.saveMilestone).not.toHaveBeenCalled();
  expect(root.querySelector('form.publication-designate')).not.toBeNull();
});
it('keeps the pressed control and busy state while two presses send only one save', async () => {
  const { root, api, setStatus } = await setup(false, false);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const save = api.saveMilestone.getMockImplementation()!;
  api.saveMilestone.mockImplementation(async input => { await pending; return save(input); });
  const button = root.querySelector('[data-publication-action="designate"]')!;
  button.focus(); button.click(); button.click();
  expect(api.saveMilestone).toHaveBeenCalledTimes(1);
  expect(miniDocument.activeElement).toBe(button);
  expect(root.querySelector('.deliverables-publication')?.getAttribute('aria-busy')).toBe('true');
  expect(setStatus).toHaveBeenLastCalledWith('正在保存里程碑版本…', 'busy');
  expect(button.hasAttribute('aria-expanded')).toBe(false);
  finish(); await settle();
  expect(root.querySelector('.deliverables-publication')?.getAttribute('aria-busy')).toBeNull();
});
it('ignores an old reading begun during saving even when it answers after the saved form opens', async () => {
  const { root, api, surface } = await setup(false, false);
  const before = await api.inspectDeliverables();
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const save = api.saveMilestone.getMockImplementation()!;
  api.saveMilestone.mockImplementation(async input => { await pending; return save(input); });
  root.querySelector('[data-publication-action="designate"]')!.click();
  let answer!: (value: DeliverablesProjection) => void;
  api.inspectDeliverables.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  surface.start(); finish(); await settle();
  answer(before); await settle();
  expect(root.querySelector('form.publication-designate')).not.toBeNull();
  expect(root.querySelector('[data-publication-action="designate"]')?.textContent).toBe('设为发稿版本…');
});

it('holds a saved milestone through two failed reads and offers a reread instead of another save', async () => {
  const { root, api, setStatus } = await setup(false, false);
  api.inspectDeliverables.mockRejectedValueOnce(new Error('read failed')).mockRejectedValueOnce(new Error('read failed'));
  const pressed = root.querySelector('[data-publication-action="designate"]')!;
  pressed.click(); await settle();
  expect(root.querySelector('[data-publication-action="designate"]')?.textContent).toBe('设为发稿版本…');
  root.querySelector('[data-publication-action="designate"]')!.click(); pressed.click(); await settle();
  expect(api.saveMilestone).toHaveBeenCalledTimes(1);
  expect(setStatus).toHaveBeenLastCalledWith('里程碑已保存，但交付物未能重新读取。请点「重新读取交付物」后再确认发稿版本。', 'error');
  root.querySelector('[data-publication-action="refresh"]')!.click(); await settle();
  expect(root.querySelector('input')?.checked).toBe(true);
});
it('keeps the focused busy control when a reading answers during saving', async () => {
  const { root, api, surface } = await setup(false, false);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const save = api.saveMilestone.getMockImplementation()!;
  api.saveMilestone.mockImplementation(async input => { await pending; return save(input); });
  const pressed = root.querySelector('[data-publication-action="designate"]')!;
  pressed.focus(); pressed.click(); surface.start(); await settle();
  expect(root.querySelector('[data-publication-action="designate"]')).toBe(pressed);
  expect(miniDocument.activeElement).toBe(pressed);
  expect(pressed.disabled).toBe(false);
  finish(); await settle();
});
it('keeps a refusal sentence when the follow-up read fails too', async () => {
  const { root, api, setStatus } = await setup(true, false);
  api.inspectDeliverables.mockRejectedValueOnce(new Error('read failed'));
  root.querySelector('[data-publication-action="designate"]')!.click(); await settle();
  expect(setStatus).toHaveBeenLastCalledWith('暂时无法保存，请重试。', 'error');
});
it('clears busy controls when a successful reread does not contain the saved milestone', async () => {
  const { root, api } = await setup(false, false);
  const before = await api.inspectDeliverables();
  api.inspectDeliverables.mockResolvedValueOnce(before);
  root.querySelector('[data-publication-action="designate"]')!.click(); await settle();
  expect(root.querySelector('.deliverables-publication')?.getAttribute('aria-busy')).toBeNull();
  expect(root.querySelector('[data-publication-action="refresh"]')).not.toBeNull();
});
it('prevents a held Enter from activating the newly focused confirm', async () => {
  const { root, api } = await setup();
  expect(root.querySelector('[data-publication-action="confirm"]')!.dispatchEvent({ type: 'keydown', key: 'Enter', ...{ repeat: true } })).toBe(false);
  expect(api.designatePublicationVersion).not.toHaveBeenCalled();
});
