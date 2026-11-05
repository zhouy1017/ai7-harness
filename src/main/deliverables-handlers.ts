import type { NativeFilePickers } from './file-pickers.js';
import { enqueueQuickTasks } from './task-overview-quick-start.js';
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  TASK_OVERVIEW_OPERATIONS,
  type TaskOverviewCall,
  type DeliverablesProjection,
  type DesignatePublicationVersionInput,
  type RendererApi,
  type ResolvedBookWorkbenchRoute,
  type WireServiceOperationMap as ServiceOperationMap,
  type ServiceWireJobProjection as ServiceJobProjection,
} from '../shared/protocol.js';
import { ServiceCallError, ServiceClient } from './service-client.js';
import { envelope, UUID_PATTERN } from './handler-guards.js';
import type { OwnedRendererWindow, ManuscriptCapability } from './application-types.js';
import { resolve } from 'node:path';

export function registerDeliverablesHandlers(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  requireCurrentBookRoute: (owned: OwnedRendererWindow) => Extract<ResolvedBookWorkbenchRoute, { kind: "book"; }>;
  service: ServiceClient;
  requireCurrentRouteReadEpoch: (owned: OwnedRendererWindow, routeGeneration: number, routeRequestSequence: number) => void;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  requireCurrentRouteGeneration: (owned: OwnedRendererWindow, routeGeneration: number) => void;
}) {
  const { requireSender, requireAuthority, requireCurrentBookRoute, service, requireCurrentRouteReadEpoch, serializeEffect, requireCurrentRouteGeneration } = context;
  // ⑥ 交付物 (Issue #414, plan slice S65) is a Book destination like 审阅: the renderer never names a Book,
  // the service is asked within the route's, and every answer must be that Book's. The read is held to the
  // route's read epoch; 设为发稿版本 is serialized with every other effect of this window's authority and
  // held to its route generation. The milestone is named by the renderer and checked by the service, which
  // refuses one that is not a milestone of this Book's primary Manuscript.
  const requireDeliverablesOfRoute = (
    route: Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>,
    result: DeliverablesProjection,
  ): DeliverablesProjection => {
    if (result.bookId !== route.bookId) {
      throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '交付物不属于当前图书工作台。');
    }
    return result;
  };

  ipcMain.handle(IPC_CHANNELS.inspectDeliverables, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectDeliverables', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      return requireDeliverablesOfRoute(route, result);
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.designatePublicationVersion,
    (event, input: Omit<DesignatePublicationVersionInput, 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('designatePublicationVersion', {
            milestoneId: input.milestoneId,
            scope: input.scope,
            basis: input.basis,
            bookId: route.bookId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          if (result.bookId !== route.bookId) {
            throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '发稿版本不属于当前图书工作台。');
          }
          requireDeliverablesOfRoute(route, result.deliverables);
          return result;
        });
      }),
  );

  // 维护事项 (Issue #426, S68a): one case of the route's Book, and each of its steps, serialized like every other command.
  // The service checks the designation, the case and the step; main only names the route's Book.
  const requireMaintenanceOfRoute = (route: { bookId: string }, bookId: string): void => {
    if (bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '维护事项不属于当前图书工作台。');
  };

  ipcMain.handle(
    IPC_CHANNELS.inspectMaintenanceCase,
    (event, input: Parameters<RendererApi['inspectMaintenanceCase']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('inspectMaintenanceCase', { ...input, bookId: route.bookId });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.listMaintenanceCases,
    (event, input: Parameters<RendererApi['listMaintenanceCases']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('listMaintenanceCases', {
            bookId: route.bookId,
            publicationVersionId: input.publicationVersionId,
            beforeOrdinal: input.beforeOrdinal,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.recordMaintenanceCase,
    (event, input: Parameters<RendererApi['recordMaintenanceCase']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('recordMaintenanceCase', { bookId: route.bookId, publicationVersionId: input.publicationVersionId, classification: input.classification, reason: input.reason, evidence: input.evidence });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.appendMaintenanceCaseRevision,
    (event, input: Parameters<RendererApi['appendMaintenanceCaseRevision']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('appendMaintenanceCaseRevision', { bookId: route.bookId, caseId: input.caseId, expectedRevision: input.expectedRevision, step: input.step });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.saveMaintenanceErrata,
    (event, input: Parameters<RendererApi['saveMaintenanceErrata']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('saveMaintenanceErrata', { bookId: route.bookId, caseId: input.caseId, expectedRevision: input.expectedRevision, body: input.body });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireMaintenanceOfRoute(route, result.bookId);
          return result;
        });
      }),
  );

}

export function registerProductionAndPackageHandlers(context: {
  chooseExportFolder: NativeFilePickers['chooseExportFolder'];
  choosePackageArchiveFile: NativeFilePickers['choosePackageArchiveFile'];
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  requireCurrentBookRoute: (owned: OwnedRendererWindow) => Extract<ResolvedBookWorkbenchRoute, { kind: "book"; }>;
  service: ServiceClient;
  requireCurrentRouteReadEpoch: (owned: OwnedRendererWindow, routeGeneration: number, routeRequestSequence: number) => void;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  requireCurrentRouteGeneration: (owned: OwnedRendererWindow, routeGeneration: number) => void;
  requireManuscriptCapability: (owned: OwnedRendererWindow, input: { manuscriptId: string; branchId: string; }) => ManuscriptCapability;
}) {
  const { chooseExportFolder, choosePackageArchiveFile, requireSender, requireAuthority, requireCurrentBookRoute, service, requireCurrentRouteReadEpoch, serializeEffect, requireCurrentRouteGeneration, requireManuscriptCapability } = context;
  ipcMain.handle(IPC_CHANNELS.inspectProductionDocuments, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectProductionDocuments', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '生产文档不属于当前图书工作台。');
      return result;
    }),
  );

  const overviewBooks = new WeakMap<OwnedRendererWindow, Set<string>>();
  // 图书交付包 (Issue #416, S67a): a read bound to the route's Book and its read epoch, and 准备图书交付包 serialized
  // like every other command. The service decides whether the content is still what the editor saw; nothing here
  // chooses a destination or writes a file.
  const requireBookDeliveryPackageOfRoute = (route: { bookId: string }, bookId: string): void => {
    if (bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '图书交付包不属于当前图书工作台。');
  };

  ipcMain.handle(IPC_CHANNELS.inspectBookDeliveryPackage, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectBookDeliveryPackage', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      requireBookDeliveryPackageOfRoute(route, result.bookId);
      return result;
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.prepareBookDeliveryPackage,
    (event, input: Omit<ServiceOperationMap['prepareBookDeliveryPackage']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('prepareBookDeliveryPackage', {
            bookId: route.bookId,
            purpose: input.purpose,
            expectedContentDigest: input.expectedContentDigest,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireBookDeliveryPackageOfRoute(route, result.bookId);
          requireBookDeliveryPackageOfRoute(route, result.package.bookId);
          return result;
        });
      }),
  );

  // Its export (Issue #416, S67b): the review is a read of the route's Book; choosing the folder prepares and 按上述方式导出
  // writes, each serialized like every other command. The service checks the files and the folder; main only asks the
  // platform's dialog.
  ipcMain.handle(
    IPC_CHANNELS.reviewBookDeliveryPackageExport,
    (event, input: Parameters<RendererApi['reviewBookDeliveryPackageExport']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('reviewBookDeliveryPackageExport', {
            bookId: route.bookId,
            packageVersionId: input.packageVersionId,
            options: input.options,
            ...(input.route === 'archive' ? { route: 'archive' as const } : {}),
            ...(input.offset === undefined ? {} : { offset: input.offset }),
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          requireBookDeliveryPackageOfRoute(route, result.bookId);
          return result;
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.chooseBookDeliveryPackageExportFolder,
    (event, input: Parameters<RendererApi['chooseBookDeliveryPackageExportFolder']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async (): Promise<Awaited<ReturnType<RendererApi['chooseBookDeliveryPackageExportFolder']>>> => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const folder = await chooseExportFolder(owned);
          // A cancelled dialog records nothing at all (V2-UX-EXP-020).
          if (folder === undefined) return { outcome: 'cancelled' };
          requireCurrentRouteGeneration(owned, routeGeneration);
          const prepared = await service.call('prepareBookDeliveryPackageExport', {
            bookId: route.bookId,
            packageVersionId: input.packageVersionId,
            options: input.options,
            ...(input.offset === undefined ? {} : { offset: input.offset }),
            reviewDigest: input.reviewDigest,
            memberKeys: input.memberKeys,
            folder,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return { outcome: 'prepared', export: prepared };
        });
      }),
  );

  ipcMain.handle(IPC_CHANNELS.chooseBookDeliveryPackageArchiveDestination,
    (event, input: Parameters<RendererApi['chooseBookDeliveryPackageArchiveDestination']>[0]) => envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async (): Promise<Awaited<ReturnType<RendererApi['chooseBookDeliveryPackageArchiveDestination']>>> => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const destination = await choosePackageArchiveFile(owned);
        if (destination === undefined) return { outcome: 'cancelled' };
        requireCurrentRouteGeneration(owned, routeGeneration);
        const prepared = await service.call('prepareBookDeliveryPackageArchiveExport', {
          bookId: route.bookId, packageVersionId: input.packageVersionId, options: input.options,
          ...(input.offset === undefined ? {} : { offset: input.offset }),
          reviewDigest: input.reviewDigest, destination,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        return { outcome: 'prepared', export: prepared };
      });
    }),
  );

  // The effect lock stays held while a package job runs. Only its owning window's cancellation bypasses it.
  let packageExportInFlight: { owned: OwnedRendererWindow; bookId: string; exportId: string; job: Promise<ServiceJobProjection> } | null = null;

  for (const operation of ['approveBookDeliveryPackageExport', 'approveBookDeliveryPackageArchiveExport'] as const) {
  ipcMain.handle(
    IPC_CHANNELS[operation],
    (event, input: Parameters<RendererApi['approveBookDeliveryPackageExport']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const active = { owned, bookId: route.bookId, exportId: input.exportId,
            job: service.call(operation, { bookId: route.bookId, exportId: input.exportId }) };
          packageExportInFlight = active;
          try {
            let job = await active.job;
            while (job.state === 'queued' || job.state === 'running') {
              await new Promise<void>((resolve) => setTimeout(resolve, 50));
              job = await service.call('pollServiceJob', { jobId: job.jobId });
            }
            if (job.state === 'cancelled') throw new ServiceCallError('EXPORT_CANCELLED', '已取消导出，没有写入任何文件。');
            if (job.state === 'failed') throw new ServiceCallError(job.failure?.code ?? 'EXPORT_FAILED', job.failure?.message ?? '交付包导出未完成。');
            const result = job.result;
            if (job.kind !== 'package-export' || result === null || !('export' in result) || result.export.exportId !== input.exportId) {
              throw new ServiceCallError('AI7_EXPORT_INVALID', '交付包导出结果不一致。');
            }
            requireCurrentRouteGeneration(owned, routeGeneration);
            requireBookDeliveryPackageOfRoute(route, result.bookId);
            requireBookDeliveryPackageOfRoute(route, result.package.bookId);
            return result;
          } finally {
            if (packageExportInFlight === active) packageExportInFlight = null;
          }
        });
      }),
  );
  }

  for (const operation of ['cancelBookDeliveryPackageExport', 'cancelBookDeliveryPackageArchiveExport'] as const) {
  ipcMain.handle(
    IPC_CHANNELS[operation],
    (event, input: Parameters<RendererApi['cancelBookDeliveryPackageExport']>[0]) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const active = packageExportInFlight;
        if (active === null || active.owned !== owned || active.bookId !== route.bookId || active.exportId !== input.exportId) return false;
        const job = await active.job;
        if (packageExportInFlight !== active) return false;
        try { return await service.call(operation, { jobId: job.jobId }); }
        catch (error) {
          if (error instanceof ServiceCallError && error.code === 'JOB_NOT_FOUND') return false;
          throw error;
        }
      }),
  );
  }

  ipcMain.handle(
    IPC_CHANNELS.createProductionDocument,
    (event, input: Omit<ServiceOperationMap['createProductionDocument']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('createProductionDocument', {
            bookId: route.bookId,
            typeId: input.typeId,
            sourceVersionId: input.sourceVersionId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.decideProductionDocumentType,
    (event, input: Omit<ServiceOperationMap['decideProductionDocumentType']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('decideProductionDocumentType', {
            bookId: route.bookId,
            typeId: input.typeId,
            notForThisBook: input.notForThisBook,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );

  // A document's workflow phase (Issue #415, S66c): one deterministic move of a document of the route's Book, serialized
  // like every other command; the service decides whether the move is open to the phase and still what the editor saw.
  ipcMain.handle(
    IPC_CHANNELS.transitionProductionDocumentPhase,
    (event, input: Omit<ServiceOperationMap['transitionProductionDocumentPhase']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('transitionProductionDocumentPhase', {
            bookId: route.bookId,
            documentId: input.documentId,
            phaseId: input.phaseId,
            action: input.action,
            expectedTransitions: input.expectedTransitions,
            reason: input.reason,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.saveProductionDocumentVersion,
    (event, input: Omit<ServiceOperationMap['saveProductionDocumentVersion']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const capability = requireManuscriptCapability(owned, { manuscriptId: input.documentId, branchId: input.branchId });
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('saveProductionDocumentVersion', {
            bookId: capability.bookId,
            documentId: capability.manuscriptId,
            branchId: capability.branchId,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );

  // 交付 (Issue #415, S66b): a Delivery Record of one version of a document of the route's Book — a saved one, or the
  // current text saved as the next version first; the service decides whether the document and the version are that
  // Book's. Nothing is sent: the export follows on its card.
  ipcMain.handle(
    IPC_CHANNELS.recordProductionDocumentDelivery,
    (event, input: Omit<ServiceOperationMap['recordProductionDocumentDelivery']['input'], 'bookId'>) =>
      envelope(async () => {
        const owned = requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          const route = requireCurrentBookRoute(owned);
          const routeGeneration = owned.routeGeneration;
          const result = await service.call('recordProductionDocumentDelivery', {
            bookId: route.bookId,
            documentId: input.documentId,
            version: input.version,
            recipient: input.recipient,
            note: input.note,
          });
          requireCurrentRouteGeneration(owned, routeGeneration);
          return requireProductionDocumentResultOfRoute(route, result);
        });
      }),
  );

  // 待我处理 (Issue #424, plan slice S78): a read across every Book, in any window whatever it shows. It needs no
  // Book route and takes none — unlike getStartup it claims nothing and leaves no workbench. It remembers only
  // which Recovery Attention States it showed this window, so opening one from there can claim it while no
  // other window holds it (getRecoveryComparison above).
  ipcMain.handle(IPC_CHANNELS.inspectGlobalAttention, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const result = await service.call('inspectGlobalAttention', {});
      owned.attentionOffers.clear();
      for (const group of result.groups) {
        for (const item of group.items) {
          if (item.target.kind === 'manuscript-recovery' && UUID_PATTERN.test(item.target.attentionId)) owned.attentionOffers.add(item.target.attentionId);
        }
      }
      return result;
    }),
  );

  // Cross-Book task control preserves this window's manuscript and Book route.
  ipcMain.handle(IPC_CHANNELS.taskOverviewCall, (event, request: TaskOverviewCall) => envelope(async () => {
    const owned = requireSender(event);
    requireAuthority();
    if (!request || !TASK_OVERVIEW_OPERATIONS.includes(request.operation) || !UUID_PATTERN.test(request.bookId) || !overviewBooks.get(owned)?.has(request.bookId)) {
      throw new ServiceCallError('TASK_OVERVIEW_INVALID', '无法打开这项任务。');
    }
    return serializeEffect(async () => {
      const generation = owned.routeGeneration;
      const result = await service.call(request.operation, { ...request.input, bookId: request.bookId });
      requireCurrentRouteGeneration(owned, generation);
      if (result && typeof result === 'object' && 'bookId' in result && result.bookId !== request.bookId) throw new ServiceCallError('TASK_OVERVIEW_INVALID', '任务结果不属于所选图书。');
      // Preparation jobs stay owned here until terminal; the overview never borrows a Book-route job capability.
      if (!['redoTaskPlan', 'prepareBaselineAnalysis', 'prepareCustomAnalysis', 'prepareReviewRun', 'promoteTaskIntentDraft'].includes(request.operation)) return result;
      let job = result as ServiceJobProjection;
      while (job.state === 'queued' || job.state === 'running') {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        job = await service.call('pollServiceJob', { jobId: job.jobId });
      }
      return job;
    });
  }));
  ipcMain.handle(IPC_CHANNELS.controlAllTasks, (event, input: ServiceOperationMap['controlAllTasks']['input']) => envelope(async () => {
    requireSender(event);
    requireAuthority();
    return serializeEffect(() => service.call('controlAllTasks', input));
  }));

  ipcMain.handle(IPC_CHANNELS.inspectTaskOverview, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const result = await service.call('inspectTaskOverview', {});
      // Like Global Attention, this cross-Book read remains valid across Book navigation.
      overviewBooks.set(owned, new Set(result.books.map((book) => book.bookId)));
      return result;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.reorderQueuedRun, (event, input: ServiceOperationMap['reorderQueuedRun']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('reorderQueuedRun', input);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.startQuickTasks, (event, input: ServiceOperationMap['startQuickTasks']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return enqueueQuickTasks(service, input, serializeEffect);
    }),
  );

}

const requireProductionDocumentResultOfRoute = (
    route: Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>,
    result: ServiceOperationMap['createProductionDocument']['output'],
  ): ServiceOperationMap['createProductionDocument']['output'] => {
    if (result.bookId !== route.bookId || result.documents.bookId !== route.bookId) {
      throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '生产文档不属于当前图书工作台。');
    }
    return result;
  };
