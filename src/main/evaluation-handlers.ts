import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  MAX_WRITING_MATERIALS,
  type RendererApi,
  type ResolvedBookWorkbenchRoute,
  type WireServiceOperationMap as ServiceOperationMap,
} from '../shared/protocol.js';
import { ServiceCallError, ServiceClient } from './service-client.js';
import { envelope, requireDesktop } from './handler-guards.js';
import type { EditorResourceCapability, OwnedRendererWindow } from './application-types.js';

export function registerEvaluationHandlers(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  service: ServiceClient;
  requireCurrentBookRoute: (owned: OwnedRendererWindow) => Extract<ResolvedBookWorkbenchRoute, { kind: "book"; }>;
  requireCurrentRouteReadEpoch: (owned: OwnedRendererWindow, routeGeneration: number, routeRequestSequence: number) => void;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  requireCurrentRouteGeneration: (owned: OwnedRendererWindow, routeGeneration: number) => void;
  rememberEditorResource: (owned: OwnedRendererWindow, kind: EditorResourceCapability["kind"], id: string, capability: Omit<EditorResourceCapability, "kind" | "routeGeneration">) => EditorResourceCapability;
}) {
  const { requireSender, requireAuthority, service, requireCurrentBookRoute, requireCurrentRouteReadEpoch, serializeEffect, requireCurrentRouteGeneration, rememberEditorResource } = context;
  // 知识库 › 评估方案 (Issue #429, S81a) names no Book; ②C 评估 is the route's Book's — the renderer never names it, the
  // service is asked within the route's, reads are held to its read epoch, and writes are serialized and held to its generation.
  ipcMain.handle(IPC_CHANNELS.inspectEvaluationProfiles, (event, input: { before?: number | null } = {}) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectEvaluationProfiles', input);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.saveEvaluationProfile, (event, input: Parameters<RendererApi['saveEvaluationProfile']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('saveEvaluationProfile', input);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectEvaluation, (event, input: Parameters<RendererApi['inspectEvaluation']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectEvaluation', { bookId: route.bookId, recordId: input.recordId, recordsBefore: input.recordsBefore ?? null });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评估不属于当前图书工作台。');
      return result;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.startEvaluation, (event, input?: Parameters<RendererApi['startEvaluation']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input === undefined || input === null || (typeof input === 'object' && typeof input.fromInitial === 'boolean' &&
        (input.skipDamaged === undefined || typeof input.skipDamaged === 'boolean')), 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        // Skipping a latest version that cannot be read (Issue #726) is said explicitly, never assumed.
        const result = await service.call('startEvaluation', { bookId: route.bookId, fromInitial: input?.fromInitial === true, skipDamaged: input?.skipDamaged === true });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评估不属于当前图书工作台。');
        return result;
      });
    }),
  );

  // AI7 初评 (Issue #429, S81b1): prepared and started within the route's Book, as the baseline analysis is; the renderer
  // never names the Book, and every answer must be that Book's.
  ipcMain.handle(IPC_CHANNELS.prepareInitialEvaluation, (event, input: Parameters<RendererApi['prepareInitialEvaluation']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input === undefined || (input !== null && typeof input === 'object' &&
        (input.materialIds === undefined || (Array.isArray(input.materialIds) && input.materialIds.length <= MAX_WRITING_MATERIALS && input.materialIds.every((id) => typeof id === 'string' && id.length <= 64)))), 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        requireDesktop(input?.seriesId == null || (typeof input.seriesId === 'string' && /^[0-9a-f-]{36}$/i.test(input.seriesId)), 'AI7_RENDERER_BOUNDARY_INVALID');
        const result = await service.call('prepareInitialEvaluation', { bookId: route.bookId, ...(input?.seriesId == null ? {} : { seriesId: input.seriesId }), ...(input?.materialIds === undefined ? {} : { materialIds: input.materialIds }) });
        const prepared = result.result;
        if (result.kind !== 'initial-evaluation-preparation' ||
            (prepared !== null && !('recordCount' in prepared && 'initial' in prepared && prepared.bookId === route.bookId))) {
          throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', 'AI7 初评准备结果类型无效或不属于当前图书工作台。');
        }
        rememberEditorResource(owned, 'job', result.jobId, {
          operation: 'initial-evaluation',
          bookId: route.bookId,
          manuscriptId: null,
          branchId: null,
        });
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.authorizeInitialEvaluation, (event, input: Parameters<RendererApi['authorizeInitialEvaluation']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('authorizeInitialEvaluation', {
          bookId: route.bookId,
          taskIntentId: input.taskIntentId,
          planEnvelopeDigest: input.planEnvelopeDigest,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评估不属于当前图书工作台。');
        return result;
      });
    }),
  );

  // 审稿意见 (Issue #429, S81c): drafted, started and opened within the route's Book, as 初评 is; the renderer names a template,
  // a Task or a drafted result, never the Book, and every answer must be that Book's.
  ipcMain.handle(IPC_CHANNELS.prepareReadersReport, (event, input: Parameters<RendererApi['prepareReadersReport']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && (input.template === 'author' || input.template === 'editorial') &&
        (input.materialIds === undefined || (Array.isArray(input.materialIds) && input.materialIds.length <= MAX_WRITING_MATERIALS && input.materialIds.every((id) => typeof id === 'string' && id.length <= 64))), 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const result = await service.call('prepareReadersReport', { bookId: route.bookId, template: input.template, ...(input.materialIds === undefined ? {} : { materialIds: input.materialIds }) });
        const prepared = result.result;
        if (result.kind !== 'readers-report-preparation' ||
            (prepared !== null && !('recordCount' in prepared && 'initial' in prepared && prepared.bookId === route.bookId))) {
          throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '审稿意见准备结果类型无效或不属于当前图书工作台。');
        }
        rememberEditorResource(owned, 'job', result.jobId, {
          operation: 'readers-report',
          bookId: route.bookId,
          manuscriptId: null,
          branchId: null,
        });
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.authorizeReadersReport, (event, input: Parameters<RendererApi['authorizeReadersReport']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('authorizeReadersReport', {
          bookId: route.bookId,
          taskIntentId: input.taskIntentId,
          planEnvelopeDigest: input.planEnvelopeDigest,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评估不属于当前图书工作台。');
        return result;
      });
    }),
  );

  // 按我的评分重写评语 (Issue #429, S81b2): asked of one version, started and decided within the route's Book, as 审稿意见 is; the
  // renderer names a version, a Task or a rewritten result, never the Book, and every answer must be that Book's.
  ipcMain.handle(IPC_CHANNELS.prepareEvaluationRewrite, (event, input: Parameters<RendererApi['prepareEvaluationRewrite']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && typeof input.recordId === 'string', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const result = await service.call('prepareEvaluationRewrite', { bookId: route.bookId, recordId: input.recordId });
        const prepared = result.result;
        if (result.kind !== 'evaluation-rewrite-preparation' ||
            (prepared !== null && !('recordCount' in prepared && 'initial' in prepared && prepared.bookId === route.bookId))) {
          throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评语重写准备结果类型无效或不属于当前图书工作台。');
        }
        rememberEditorResource(owned, 'job', result.jobId, {
          operation: 'evaluation-rewrite',
          bookId: route.bookId,
          manuscriptId: null,
          branchId: null,
        });
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.authorizeEvaluationRewrite, (event, input: Parameters<RendererApi['authorizeEvaluationRewrite']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('authorizeEvaluationRewrite', {
          bookId: route.bookId,
          taskIntentId: input.taskIntentId,
          planEnvelopeDigest: input.planEnvelopeDigest,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评估不属于当前图书工作台。');
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.decideEvaluationRewrite, (event, input: Parameters<RendererApi['decideEvaluationRewrite']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && typeof input.revisionId === 'string' &&
        (input.decision === 'accept' || input.decision === 'discard'), 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('decideEvaluationRewrite', { bookId: route.bookId, revisionId: input.revisionId, decision: input.decision });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评估不属于当前图书工作台。');
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.createReadersReportDraft, (event, input: Parameters<RendererApi['createReadersReportDraft']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && typeof input.revisionId === 'string', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('createReadersReportDraft', { bookId: route.bookId, revisionId: input.revisionId });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评估不属于当前图书工作台。');
        return result;
      });
    }),
  );

  // 写作任务 (Issue #432, S84a): read, prepared, started and opened within the route's Book, as 审稿意见 is; the renderer names a
  // house type and its own words, a Task or a drafted result, never the Book, and every answer must be that Book's.
  ipcMain.handle(IPC_CHANNELS.inspectWritingTask, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectWritingTask', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '写作任务不属于当前图书工作台。');
      return result;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.prepareWritingTask, (event, input: Parameters<RendererApi['prepareWritingTask']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && typeof input.typeId === 'string' && typeof input.audience === 'string' &&
        typeof input.channel === 'string' && (input.requirements === null || typeof input.requirements === 'string') &&
        // 允许参考's ticked 资料库 items (Issue #428): identities only; the service reads, pins and bounds them.
        (input.materialIds === undefined || (Array.isArray(input.materialIds) && input.materialIds.length <= MAX_WRITING_MATERIALS &&
          input.materialIds.every((id) => typeof id === 'string' && id.length <= 64))), 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const result = await service.call('prepareWritingTask', {
          bookId: route.bookId,
          typeId: input.typeId,
          audience: input.audience,
          channel: input.channel,
          requirements: input.requirements,
          materialIds: [...(input.materialIds ?? [])],
        });
        const prepared = result.result;
        if (result.kind !== 'writing-preparation' ||
            (prepared !== null && !('consequences' in prepared && 'types' in prepared && prepared.bookId === route.bookId))) {
          throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '写作任务准备结果类型无效或不属于当前图书工作台。');
        }
        rememberEditorResource(owned, 'job', result.jobId, {
          operation: 'writing',
          bookId: route.bookId,
          manuscriptId: null,
          branchId: null,
        });
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.authorizeWritingTask, (event, input: Parameters<RendererApi['authorizeWritingTask']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('authorizeWritingTask', {
          bookId: route.bookId,
          taskIntentId: input.taskIntentId,
          planEnvelopeDigest: input.planEnvelopeDigest,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '写作任务不属于当前图书工作台。');
        return result;
      });
    }),
  );

  // 快速开始 of a writing Task (Issue #432, S84b): the Task just prepared within the route's Book, its exact plan and the rule
  // version the editor started under; the answer must be that Book's.
  ipcMain.handle(IPC_CHANNELS.quickStartWritingTask, (event, input: Parameters<RendererApi['quickStartWritingTask']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('quickStartWritingTask', {
          bookId: route.bookId,
          taskIntentId: input.taskIntentId,
          planEnvelopeDigest: input.planEnvelopeDigest,
          ruleVersionId: input.ruleVersionId,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.projection.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '快速开始的结果不属于当前图书工作台。');
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.createWritingDraft, (event, input: Parameters<RendererApi['createWritingDraft']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && typeof input.revisionId === 'string', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('createWritingDraft', { bookId: route.bookId, revisionId: input.revisionId, ...(input.title === undefined ? {} : { title: input.title }) });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.writing.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '写作任务不属于当前图书工作台。');
        return result;
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.saveEvaluation, (event, input: Parameters<RendererApi['saveEvaluation']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('saveEvaluation', {
          bookId: route.bookId,
          recordId: input.recordId,
          expectedEntries: input.expectedEntries,
          content: input.content,
          finalize: input.finalize,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '评估不属于当前图书工作台。');
        return result;
      });
    }),
  );

}
