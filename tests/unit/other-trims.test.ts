import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDataStorage } from '../../src/renderer/data-storage.js';
import { mountProposalWorkspace } from '../../src/renderer/proposal-workspace.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { ProductDataLocationProjection, ProposalWorkspaceProjection, RendererApi } from '../../src/shared/protocol.js';
import { installMiniDom } from '../support/mini-dom.js';

const mounts = vi.hoisted(() => ({ export: vi.fn(), import: vi.fn(), backup: vi.fn() }));
vi.mock('../../src/renderer/database-export.js', () => ({ mountDatabaseExport: mounts.export }));
vi.mock('../../src/renderer/database-import.js', () => ({ mountDatabaseImport: mounts.import }));
vi.mock('../../src/renderer/scheduled-backup.js', () => ({ mountScheduledBackup: mounts.backup }));
vi.mock('../../src/renderer/windowed-list.js', () => ({ mountWindowedList: () => ({ setItems: vi.fn(), activate: vi.fn(), destroy: vi.fn() }) }));
vi.mock('../../src/renderer/position-rail.js', () => ({ mountPositionRail: () => ({ setPosition: vi.fn(), refresh: vi.fn(), destroy: vi.fn() }) }));

const location: ProductDataLocationProjection = {
  platform: 'windows', platformLabel: 'Windows', runtimeForm: 'source-checkout', runtimeFormLabel: '源码检出运行',
  channel: 'source-checkout', channelLabel: '源码检出', channelDescription: '开发运行说明', dataLocationException: null,
  syncWarning: null, locationLabel: '本机产品数据位置', canonicalRoot: 'C:/synthetic/AI7/data',
  footprint: { kind: 'bounded-measurement', measuredBytes: 100, measuredEntries: 1, maximumEntries: 128, complete: true, label: '100 B' },
  protectedSecretStore: 'windows-credential-manager', protectedSecretStoreLabel: 'Windows 凭据管理器',
  separationLabel: '模型服务凭据由操作系统单独保护，不在产品数据中，也不随产品数据复制。',
};
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); vi.clearAllMocks(); });
afterEach(() => { setTechnicalLayerVisible(false); vi.unstubAllGlobals(); restore(); });

it('shows the location and three compact storage actions with one explanation in ordinary mode', async () => {
  const api = { getProductDataLocation: vi.fn().mockResolvedValue(location), inspectDataVersion: vi.fn().mockResolvedValue(null),
    revealProductDataLocation: vi.fn().mockResolvedValue({ state: 'requested', nativeRevealSuppressedForE2e: true }) };
  vi.stubGlobal('window', { ai7: api });
  const screen = document.createElement('main'); document.body.append(screen);
  const storage = createDataStorage({
    panel: () => document.createElement('section'),
    element: (tag, className, text) => { const node = document.createElement(tag); node.className = className ?? ''; node.textContent = text ?? ''; return node; },
    button: (label, _tone, action) => { const node = document.createElement('button'); node.textContent = label; node.addEventListener('click', () => void action()); return node; },
    setStatus: vi.fn(), rendererErrorMessage: (_error, fallback) => fallback, initializeStartup: vi.fn(), technicalDetails: () => document.createElement('details'),
    replaceScreen: (_state, content) => screen.replaceChildren(content),
  });
  await storage.renderDataAndStorage();
  expect(screen.querySelector('[data-product-data-root]')?.textContent).toBe(location.canonicalRoot);
  expect(screen.querySelectorAll('.lede')).toHaveLength(1);
  expect(screen.textContent).not.toMatch(/运行方式|分发渠道|开发运行说明|数据库修订|授予文件系统权限/u);
  const actions = [...screen.querySelectorAll<HTMLDetailsElement>('[data-storage-operation]')];
  expect(actions.map((action) => action.querySelector('summary')?.textContent)).toEqual(['自动备份', '导出数据库…', '导入数据库…']);
  expect(actions.every((action) => !action.open)).toBe(true);
  for (const [index, mount] of [mounts.backup, mounts.export, mounts.import].entries()) {
    expect(mount).toHaveBeenCalledOnce();
    expect(actions[index]!.contains(mount.mock.calls[0]![0].root)).toBe(true);
  }
  screen.querySelector<HTMLElement>('[data-action="reveal-product-data-location"]')!.click();
  await Promise.resolve();
  expect(api.revealProductDataLocation).toHaveBeenCalledOnce();
});

it('keeps selected-item actions visible and groups all wider scopes in a closed batch menu', async () => {
  const workspace: ProposalWorkspaceProjection = { totalItems: 0, nextOffset: null, bookId: 'book', manuscriptId: 'manuscript', branchId: 'branch', resultId: null,
    revisionId: 'revision', journalSequence: 0, items: [], offerWorkspace: true, truncated: false, scopeDigest: 'scope', decision: null, returnPosition: null };
  const batch = vi.fn().mockResolvedValue({ included: [], excluded: [], nextOffset: null, scopeDigest: 'scope', workspace });
  const api = { inspectProposalWorkspace: vi.fn().mockResolvedValue(workspace), batchProposalDecisionDraft: batch } as unknown as RendererApi;
  const root = document.createElement('main'); document.body.append(root);
  const surface = mountProposalWorkspace({ root, api, input: { manuscriptId: 'manuscript', branchId: 'branch', resultId: null },
    bookTitle: '合成测试', setStatus: vi.fn(), returnToManuscript: vi.fn(), openConflict: vi.fn() });
  surface.start();
  await vi.waitFor(() => expect(root.getAttribute('aria-busy')).toBe('false'));
  const controls = root.querySelector('.proposal-controls')!;
  const primary = [...controls.children].filter((node) => node.tagName === 'BUTTON');
  expect(primary.map((node) => (node as HTMLElement).dataset['proposalAction'])).toEqual([
    'batch-selection-accepted', 'batch-selection-rejected', 'batch-selection-deferred', 'apply-accepted',
  ]);
  const more = root.querySelector<HTMLDetailsElement>('[data-proposal-batch-more]')!;
  expect(more.open).toBe(false);
  expect(more.querySelectorAll('button')).toHaveLength(10);
  more.open = true;
  more.querySelector<HTMLElement>('[data-proposal-action="batch-chapter-deferred"]')!.click();
  await vi.waitFor(() => expect(batch).toHaveBeenCalledWith(expect.objectContaining({ scope: 'chapter', disposition: 'deferred', confirmDigest: null })));
  surface.destroy();
});
