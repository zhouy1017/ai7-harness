import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type ContinueImportProjection, type ServiceWireJobProjection as ServiceJobProjection, type WireServiceOperationMap as ServiceOperationMap } from '../shared/protocol.js';
import type { EditorResourceCapability, ImportMutationKind, ImportTargetBinding, OwnedRendererWindow } from './application-types.js';
import { envelope, requireDesktop } from './handler-guards.js';
import type { ServiceClient } from './service-client.js';

type ImportReview = Extract<ContinueImportProjection, { state: 'review-ready' }>['review'];
export function registerImportEditingHandlers(context: {
  requireSender(event: IpcMainInvokeEvent): OwnedRendererWindow;
  requireAuthority(): void;
  serializeEffect<T>(operation: () => Promise<T>): Promise<T>;
  requireImportDraft(owned: OwnedRendererWindow, draftId: string): void;
  requireImportTarget(owned: OwnedRendererWindow, input: { draftId: string; expectedDraftVersion: number }, mutation: ImportMutationKind): Promise<ImportTargetBinding>;
  reserveExistingImportTarget(owned: OwnedRendererWindow, target: ImportTargetBinding): Promise<void>;
  captureImportReviewTarget(owned: OwnedRendererWindow, review: ImportReview): void;
  rememberJobResources(owned: OwnedRendererWindow, job: ServiceJobProjection, capability: Omit<EditorResourceCapability, 'kind' | 'routeGeneration'>): void;
  captureReimportJob(owned: OwnedRendererWindow, job: ServiceJobProjection): void;
  leaveBookWorkbench(owned: OwnedRendererWindow): void;
  releaseCommitBinding(owned: OwnedRendererWindow, draftId: string): void;
  service: ServiceClient;
}): void {
  const { requireSender, requireAuthority, serializeEffect, requireImportDraft, requireImportTarget,
    reserveExistingImportTarget, captureImportReviewTarget, rememberJobResources, captureReimportJob,
    releaseCommitBinding, leaveBookWorkbench, service } = context;
  ipcMain.handle(IPC_CHANNELS.returnImportToEditing,
    (event, input: ServiceOperationMap['returnImportToEditing']['input']) => envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireImportDraft(owned, input.draftId);
        const target = owned.importTargets.get(input.draftId);
        if (target?.mutation === 'manuscript-reimport') await reserveExistingImportTarget(owned, target);
        const result = await service.call('returnImportToEditing', input);
        releaseCommitBinding(owned, input.draftId);
        if (result.state === 'reimport') captureImportReviewTarget(owned, result.review);
        else { owned.importTargets.delete(input.draftId); leaveBookWorkbench(owned); }
        return result;
      });
    }));
  ipcMain.handle(
    IPC_CHANNELS.acceptReimportDegradation,
    (event, input: ServiceOperationMap['acceptReimportDegradation']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const target = await requireImportTarget(owned, input, 'manuscript-reimport');
          requireDesktop(target.kind === 'existing-book', 'AI7_SERVICE_ROUTE_INVALID');
          await reserveExistingImportTarget(owned, target);
          const result = await service.call('acceptReimportDegradation', input);
          captureImportReviewTarget(owned, result);
          return result;
        });
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.resolveReimportMapping,
    (event, input: ServiceOperationMap['resolveReimportMapping']['input']) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const target = await requireImportTarget(owned, input, 'manuscript-reimport');
          requireDesktop(target.kind === 'existing-book', 'AI7_SERVICE_ROUTE_INVALID');
          await reserveExistingImportTarget(owned, target);
          const result = await service.call('resolveReimportMapping', input);
          rememberJobResources(owned, result, {
            operation: 'reimport',
            bookId: target.bookId,
            manuscriptId: null,
            branchId: null,
          });
          captureReimportJob(owned, result);
          return result;
        });
      }),
  );
}
