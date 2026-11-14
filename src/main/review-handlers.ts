import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  REVIEW_FINDING_PAGE_KEYS,
  type InspectReviewFindingOfMarkRendererInput,
  MAX_WRITING_MATERIALS,
  type ResolvedBookWorkbenchRoute,
  type ReviewFindingPageRequest,
  type ReviewWorkspaceProjection,
  type WireServiceOperationMap as ServiceOperationMap,
} from '../shared/protocol.js';
import { ServiceCallError, ServiceClient } from './service-client.js';
import { envelope, requireDesktop } from './handler-guards.js';
import type { EditorResourceCapability, ManuscriptCapability, OwnedRendererWindow } from './application-types.js';

export function registerReviewHandlers(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  requireAuthority: () => void;
  requireCurrentBookRoute: (owned: OwnedRendererWindow) => Extract<ResolvedBookWorkbenchRoute, { kind: "book"; }>;
  service: ServiceClient;
  requireCurrentRouteReadEpoch: (owned: OwnedRendererWindow, routeGeneration: number, routeRequestSequence: number) => void;
  rememberEditorResource: (owned: OwnedRendererWindow, kind: EditorResourceCapability["kind"], id: string, capability: Omit<EditorResourceCapability, "kind" | "routeGeneration">) => EditorResourceCapability;
  requireCurrentRouteGeneration: (owned: OwnedRendererWindow, routeGeneration: number) => void;
  requireManuscriptCapability: (owned: OwnedRendererWindow, input: { manuscriptId: string; branchId: string; }) => ManuscriptCapability;
}) {
  const { requireSender, serializeEffect, requireAuthority, requireCurrentBookRoute, service, requireCurrentRouteReadEpoch, rememberEditorResource, requireCurrentRouteGeneration, requireManuscriptCapability } = context;
  // 审阅 (Issue #417, plan slice S69) is a Book destination: the renderer never names a Book, the service
  // is asked within the route's, and every answer must be that Book's — and, where the renderer named a
  // Review Run, open exactly that Run. Reads are held to the route's read epoch; writes are serialized
  // with every other effect of this window's authority and held to its route generation.
  const requireReviewWorkspaceOfRoute = (
    route: Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>,
    result: ReviewWorkspaceProjection,
    reviewRunId: string | null,
  ): ReviewWorkspaceProjection => {
    if (result.bookId !== route.bookId || (reviewRunId !== null && result.run?.reviewRunId !== reviewRunId)) {
      throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '审阅记录不属于当前图书工作台。');
    }
    return result;
  };

  for (const operation of ['inspectHouseWordList', 'saveHouseWordList'] as const) {
    ipcMain.handle(IPC_CHANNELS[operation], (event, input: ServiceOperationMap[typeof operation]['input']) => envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireCurrentBookRoute(owned);
        return service.call(operation, input);
      });
    }));
  }

  ipcMain.handle(
    IPC_CHANNELS.inspectReviewWorkspace,
    (event, input?: Omit<ServiceOperationMap['inspectReviewWorkspace']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const routeRequestSequence = owned.routeRequestSequence;
        const reviewRunId = typeof input?.reviewRunId === 'string' ? input.reviewRunId : null;
        // The page and the four filters travel as the renderer gave them; the request frame is what
        // decides whether each is well formed, and a key the renderer left out reads as none.
        const page: Partial<ReviewFindingPageRequest> = {};
        if (typeof input === 'object' && input !== null) {
          for (const key of REVIEW_FINDING_PAGE_KEYS) if (Object.hasOwn(input, key)) Object.assign(page, { [key]: input[key] });
        }
        const result = await service.call('inspectReviewWorkspace', { ...page, bookId: route.bookId, reviewRunId });
        requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
        return requireReviewWorkspaceOfRoute(route, result, reviewRunId);
      }),
  );

  ipcMain.handle(IPC_CHANNELS.launchReviewRun, (event, input: Omit<ServiceOperationMap['launchReviewRun']['input'], 'bookId'>) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const generation = owned.routeGeneration;
        const result = await service.call('launchReviewRun', { ...input, bookId: route.bookId });
        requireCurrentRouteGeneration(owned, generation);
        return requireReviewWorkspaceOfRoute(route, result, null);
      });
    }));

  ipcMain.handle(
    IPC_CHANNELS.prepareReviewRun,
    (event, input: Omit<ServiceOperationMap['prepareReviewRun']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireDesktop(input !== null && typeof input === 'object' &&
          (input.materialIds === undefined || (Array.isArray(input.materialIds) && input.materialIds.length <= MAX_WRITING_MATERIALS &&
            input.materialIds.every((id) => typeof id === 'string' && id.length <= 64))), 'AI7_RENDERER_BOUNDARY_INVALID');
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          requireDesktop(input.seriesId == null || (typeof input.seriesId === 'string' && /^[0-9a-f-]{36}$/i.test(input.seriesId)), 'AI7_RENDERER_BOUNDARY_INVALID');
          const result = await service.call('prepareReviewRun', {
            ...(input.seriesId == null ? {} : { seriesId: input.seriesId }),
            categoryIds: input.categoryIds,
            scope: input.scope,
            ...(input.materialIds === undefined ? {} : { materialIds: input.materialIds }),
            bookId: route.bookId,
            // A sheet pre-filled from a Captured Procedure (Issue #65, S30), or opened for a composite version (Issue #1173), names it.
            ...(input.capturedProcedure == null ? {} : { capturedProcedure: input.capturedProcedure }), ...(input.procedureDefinition == null ? {} : { procedureDefinition: input.procedureDefinition }),
            // 本地文字检查 (Issue #1119) carries the editor's explicit options, which the service's request frame validates.
            ...(input.localCheck === undefined ? {} : { localCheck: input.localCheck }),
          });
          // A Run of the leads alone is prepared by the job's first step, so its answer may already carry the workspace.
          const prepared = result.result;
          if (result.kind !== 'review-run-preparation' ||
              (prepared !== null && !('scopeOptions' in prepared && prepared.bookId === route.bookId))) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '审阅计划准备结果类型无效或不属于当前图书工作台。');
          }
          rememberEditorResource(owned, 'job', result.jobId, {
            operation: 'review-run',
            bookId: route.bookId,
            manuscriptId: null,
            branchId: null,
          });
          return result;
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.authorizeReviewRun,
    (event, input: Omit<ServiceOperationMap['authorizeReviewRun']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('authorizeReviewRun', {
            reviewRunId: input.reviewRunId,
            planDigests: input.planDigests,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.continueReviewRun,
    (event, input: Omit<ServiceOperationMap['continueReviewRun']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('continueReviewRun', { reviewRunId: input.reviewRunId, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.recordReviewFindingDisposition,
    (event, input: Omit<ServiceOperationMap['recordReviewFindingDisposition']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('recordReviewFindingDisposition', {
            reviewRunId: input.reviewRunId,
            findingId: input.findingId,
            disposition: input.disposition,
            reason: input.reason,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );

  // 取消任务 of the current Book's Review Run a Series Retrieval Exclusion stopped (Issue #64, S29b), bound to the window's route.
  ipcMain.handle(
    IPC_CHANNELS.cancelReviewRun,
    (event, input: Omit<ServiceOperationMap['cancelReviewRun']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('cancelReviewRun', { reviewRunId: input.reviewRunId, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.generateReviewReport,
    (event, input: Omit<ServiceOperationMap['generateReviewReport']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('generateReviewReport', { reviewRunId: input.reviewRunId, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireReviewWorkspaceOfRoute(route, result, input.reviewRunId);
        });
      }),
  );

  // 查看任务 lives on the Mark Card, which was opened on this manuscript: the window proves that
  // capability within the route, and a mark of any other Book is answered as no Review Run's mark.
  ipcMain.handle(IPC_CHANNELS.inspectReviewFindingOfMark, (event, input: InspectReviewFindingOfMarkRendererInput) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const capability = requireManuscriptCapability(owned, input);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectReviewFindingOfMark', { bookId: capability.bookId, markId: input.markId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      return result !== null && result.bookId === capability.bookId ? result : null;
    }),
  );

}
