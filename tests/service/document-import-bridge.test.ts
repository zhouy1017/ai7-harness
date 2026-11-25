import type { IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
vi.mock('electron', () => ({
  app: {}, BrowserWindow: {}, dialog: {}, Menu: {}, Notification: {}, session: {}, shell: {},
  nativeTheme: { on() {}, removeListener() {} },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => handlers.set(channel, handler),
    on() {}, removeListener() {}, removeHandler: (channel: string) => handlers.delete(channel),
  },
}));

import { ServiceCallError } from '../../src/main/service-client.js';
import { registerRendererHandlers } from '../../src/main/application.js';
import type { ApplicationAuthorityClaims, OwnedRendererWindow } from '../../src/main/application-types.js';
import { EditorialStore } from '../../src/service/store.js';
import { IPC_CHANNELS, type PickerStageResult, type RendererCallResult, type ServiceOperationMap } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, admittedSourcePath } from '../support/composed-fixture.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

describe('same-page document import main boundary', () => {
  it.each([true, false])('cleans a refused file with preserveBookRoute=%s and retains ordinary exit semantics', async (preserveBookRoute) => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let dispose: (() => void) | undefined;
    try {
      const initial = await store.stageSelectedManuscript(randomUUID(), admittedSourcePath(ADMITTED_BASELINE_DOCX));
      const review = store.prepareNewBookReview(initial.draftId, initial.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: initial.titleSuggestion.value }, false);
      const commit = await store.commitNewBookImport({ draftId: initial.draftId, expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest!, commitId: randomUUID() });
      await store.acknowledgeImportCompletion(commit.commitId);
      const path = join(roots.inputRoot, 'refused.pdf');
      // Format signature only: this refused container carries no manuscript content.
      await writeFile(path, '%PDF-1.7\n%%EOF\n');
      const frame = {};
      const owned = {
        window: { isDestroyed: () => false, webContents: { id: 1, mainFrame: frame } },
        bookId: commit.bookId,
        route: { kind: 'book', bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId, destination: 'deliverables' },
        routeGeneration: 1, routeRequestSequence: 1, injectedPickerPath: path,
        importDraftIds: new Set<string>(), importCommitIds: new Set<string>(), importTargets: new Map(), commitBindings: new Map(),
      } as unknown as OwnedRendererWindow;
      const event = { sender: { id: 1 }, senderFrame: frame };
      const claims = {
        requireNewDraftCapacity() {},
        claimImportState: (_owned: OwnedRendererWindow, draftId: string) => owned.importDraftIds.add(draftId),
        requireDraft: (_owned: OwnedRendererWindow, draftId: string) => { expect(owned.importDraftIds.has(draftId)).toBe(true); },
        releaseDraft: (_owned: OwnedRendererWindow, draftId: string) => owned.importDraftIds.delete(draftId),
      } as unknown as ApplicationAuthorityClaims;
      const operations = {
        stageSelectedManuscript: (input: ServiceOperationMap['stageSelectedManuscript']['input']) => store.stageSelectedManuscript(input.selectionToken, input.selectedPath),
        abandonImportDraft: (input: ServiceOperationMap['abandonImportDraft']['input']) => store.abandonImportDraft(input.draftId, input.expectedDraftVersion),
        createProductionDocument: (input: ServiceOperationMap['createProductionDocument']['input']) => store.createProductionDocument(input),
        renameProductionDocument: (input: ServiceOperationMap['renameProductionDocument']['input']) => store.renameProductionDocument(input),
        getImportStartup: () => store.getImportStartup(),
      };
      const call = vi.fn(async (operation: keyof typeof operations, input: unknown) => operations[operation](input as never));
      const unused = () => { throw new Error('Unexpected application effect'); };
      const args = [
        { call }, () => owned, () => true, unused, unused, (effect: () => Promise<unknown>) => effect(), claims, unused,
        () => { owned.bookId = null; owned.route = null; owned.routeGeneration += 1; },
        unused, unused, unused, unused, unused, unused, {}, {}, () => false, () => undefined, unused, () => undefined,
        unused, () => false, { read: () => ({ values: { 'appearance.theme': 'system' } }) }, () => [], () => [], false,
      ] as unknown as Parameters<typeof registerRendererHandlers>;
      dispose = registerRendererHandlers(...args);
      const stagedResult = await handlers.get(IPC_CHANNELS.selectAndStageManuscript)!(event) as RendererCallResult<PickerStageResult>;
      expect(stagedResult.ok).toBe(true);
      if (!stagedResult.ok || stagedResult.result.status !== 'staged') throw new Error('Expected staged byte container');
      const staged = stagedResult.result.staged;
      expect(staged.source.format).toBe('PDF');
      if (preserveBookRoute) {
        owned.importTargets.set(staged.draftId, { kind: 'existing-book', mutation: 'source-import', bookId: commit.bookId });
        await expect(handlers.get(IPC_CHANNELS.abandonImportDraft)!(event, { draftId: staged.draftId,
          expectedDraftVersion: staged.draftVersion, preserveBookRoute: true })).resolves.toMatchObject({ ok: false });
        expect(call.mock.calls.filter(([operation]) => operation === 'abandonImportDraft')).toHaveLength(0);
        owned.importTargets.delete(staged.draftId);
      }
      await expect(handlers.get(IPC_CHANNELS.abandonImportDraft)!(event, { draftId: staged.draftId,
        expectedDraftVersion: staged.draftVersion, ...(preserveBookRoute ? { preserveBookRoute: true } : {}) }))
        .resolves.toMatchObject({ ok: true, result: { state: 'none' } });
      expect(call).toHaveBeenCalledWith('abandonImportDraft', { draftId: staged.draftId, expectedDraftVersion: staged.draftVersion });
      expect(owned.importDraftIds.has(staged.draftId)).toBe(false);
      if (preserveBookRoute) {
        const created = await handlers.get(IPC_CHANNELS.createProductionDocument)!(event, { typeId: 'news-release' }) as RendererCallResult<ServiceOperationMap['createProductionDocument']['output']>;
        expect(created.ok).toBe(true);
        if (!created.ok || created.result.document === null) throw new Error('Expected blank document');
        await expect(handlers.get(IPC_CHANNELS.renameProductionDocument)!(event, { documentId: created.result.document.documentId, title: '继续编辑' }))
          .resolves.toMatchObject({ ok: true, result: { document: { title: '继续编辑' } } });
        expect(owned.bookId).toBe(commit.bookId);
      } else {
        expect(owned.route).toBeNull();
        await expect(handlers.get(IPC_CHANNELS.createProductionDocument)!(event, { typeId: 'news-release' }))
          .resolves.toMatchObject({ ok: false, error: { code: 'AI7_EDITOR_ROUTE_INVALID' } });
      }
      await expect(handlers.get(IPC_CHANNELS.getImportStartup)!(event)).resolves.toMatchObject({ ok: true, result: { state: 'none' } });
    } finally {
      dispose?.(); handlers.clear(); store.close(); await roots.dispose();
    }
  });
});

function returnBridge(store: EditorialStore, owned: OwnedRendererWindow, other: OwnedRendererWindow) {
  const operations = {
    returnImportToEditing: (input: ServiceOperationMap['returnImportToEditing']['input']) => store.returnImportToEditing(input.draftId, input.expectedDraftVersion),
    prepareSourceImportReview: (input: ServiceOperationMap['prepareSourceImportReview']['input']) => store.prepareSourceImportReview(input.draftId, input.expectedDraftVersion, input.target),
    commitSourceImport: (input: ServiceOperationMap['commitSourceImport']['input']) => store.commitSourceImport(input),
  };
  const calls = vi.fn(async (op: keyof typeof operations, input: unknown) => operations[op](input as never));
  const claims = {
    requireDraft: (owner: OwnedRendererWindow, draftId: string) => {
      if (!owner.importDraftIds.has(draftId)) throw new ServiceCallError('AI7_IMPORT_DRAFT_CAPABILITY_INVALID', '当前窗口没有这次导入。');
    },
    claimImportState(owner: OwnedRendererWindow, draftId: string) { owner.importDraftIds.add(draftId); },
    claimCommit(owner: OwnedRendererWindow, commitId: string) { owner.importCommitIds.add(commitId); },
    releaseCommit(owner: OwnedRendererWindow, commitId: string) { owner.importCommitIds.delete(commitId); },
  } as unknown as ApplicationAuthorityClaims;
  const open = vi.fn(async () => ({ target: 'existing-window', route: other.route }));
  const unused = () => { throw new Error('Unexpected application effect'); };
  const args = [
    { call: calls }, (event: IpcMainInvokeEvent) => event.sender.id === 1 ? owned : other, () => true, unused, open,
    (effect: () => Promise<unknown>) => effect(), claims,
    (owner: OwnedRendererWindow, bookId: string) => {
      if (owner.bookId !== null && owner.bookId !== bookId) throw new ServiceCallError('AI7_WORKBENCH_BOOK_CONFLICT', 'Conflict');
      owner.bookId = bookId;
    },
    (owner: OwnedRendererWindow) => { owner.bookId = null; owner.route = null; owner.routeGeneration += 1; },
    unused, unused, unused, unused, unused, unused, {}, {}, () => false, () => undefined, unused, () => undefined,
    unused, () => false, { read: () => ({ values: { 'appearance.theme': 'system', 'onboarding.state': 'skipped' } }) }, () => [], () => [], false,
  ] as unknown as Parameters<typeof registerRendererHandlers>;
  return { dispose: registerRendererHandlers(...args), calls, open };
}

it.each([[false, false], [true, false], [false, true]])('returns source details without reserving Book X (other=%s, current=%s) (#1638)', async (otherHoldsX, currentHoldsX) => {
  const roots = await createServiceTestRoots();
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  let bridge: ReturnType<typeof returnBridge> | undefined;
  try {
    const original = await store.stageSelectedManuscript(randomUUID(), admittedSourcePath(ADMITTED_BASELINE_DOCX));
    const reviewed = store.prepareNewBookReview(original.draftId, original.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '目标图书' }, false);
    const book = await store.commitNewBookImport({ draftId: original.draftId, expectedDraftVersion: reviewed.draftVersion, reviewDigest: reviewed.reviewDigest!, commitId: randomUUID() });
    const path = join(roots.inputRoot, 'source.pdf'); // Container signature only; no manuscript content.
    await writeFile(path, '%PDF-1.7\n%%EOF\n');
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, { kind: 'existing-book', bookId: book.bookId, relationship: 'source-only', reuseSourceVersionId: null });
    const frame = {}; const otherFrame = {};
    const makeWindow = (id: number, mainFrame: object) => ({ window: { isDestroyed: () => false, webContents: { id, mainFrame } }, bookId: null, route: null,
      routeGeneration: 1, routeRequestSequence: 1, importDraftIds: new Set(), importCommitIds: new Set(), importTargets: new Map(), commitBindings: new Map(), manuscriptCapabilities: new Map(), editorResourceCapabilities: new Map() }) as unknown as OwnedRendererWindow;
    const owned = makeWindow(1, frame); const other = makeWindow(2, otherFrame);
    if (otherHoldsX) other.bookId = book.bookId;
    else if (currentHoldsX) owned.bookId = book.bookId; // A previously occupied workbench must also be released.
    owned.importDraftIds.add(staged.draftId);
    owned.importTargets.set(staged.draftId, { kind: 'existing-book', mutation: 'source-import', bookId: book.bookId });
    bridge = returnBridge(store, owned, other);
    const input = { draftId: staged.draftId, expectedDraftVersion: review.draftVersion };
    await expect(handlers.get(IPC_CHANNELS.returnImportToEditing)!({ sender: { id: 2 }, senderFrame: otherFrame }, input)).resolves.toMatchObject({ ok: false, error: { code: 'AI7_IMPORT_DRAFT_CAPABILITY_INVALID' } });
    expect(bridge.calls).not.toHaveBeenCalled();
    const event = { sender: { id: 1 }, senderFrame: frame };
    const returned = await handlers.get(IPC_CHANNELS.returnImportToEditing)!(event, input) as RendererCallResult<ServiceOperationMap['returnImportToEditing']['output']>;
    expect(returned.ok).toBe(true); if (!returned.ok || returned.result.state !== 'staged') throw new Error('Expected staged');
    expect(owned.bookId).toBeNull(); expect(bridge.open).not.toHaveBeenCalled();
    expect(other.bookId).toBe(otherHoldsX ? book.bookId : null);
    const again = await handlers.get(IPC_CHANNELS.prepareSourceImportReview)!(event, { draftId: staged.draftId, expectedDraftVersion: returned.result.draftVersion, target: { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '新目标', relationship: 'source-only' } }) as RendererCallResult<ServiceOperationMap['prepareSourceImportReview']['output']>;
    expect(again.ok).toBe(true); if (!again.ok) throw new Error('Expected prepared source');
    await expect(handlers.get(IPC_CHANNELS.commitSourceImport)!(event, { draftId: staged.draftId, expectedDraftVersion: again.result.draftVersion, reviewDigest: again.result.reviewDigest, commitAttemptId: null })).resolves.toMatchObject({ ok: true, result: { completionLabel: '来源材料已导入' } });
    store.markCleanShutdown();
  } finally { bridge?.dispose(); handlers.clear(); store.close(); await roots.dispose(); }
}, 180_000);
