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
