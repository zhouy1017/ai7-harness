import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type WireServiceOperationMap as ServiceOperationMap } from '../shared/protocol.js';
import { ServiceClient } from './service-client.js';
import { envelope, requireDesktop } from './handler-guards.js';
import type { OwnedRendererWindow, ManuscriptCapability } from './application-types.js';

export function registerSeriesHandlers(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  service: ServiceClient;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
}) {
  const { requireSender, requireAuthority, service, serializeEffect } = context;
  // 书系 (Issue #63, S28a): house-wide, bound to no Book route; 新建书系, 加入书系 and 移出书系 are serialized with every other
  // effect. A Book's side of it reads the Book this window shows, or any Book from a window that shows none.
  ipcMain.handle(IPC_CHANNELS.inspectSeriesList, (event, input: { after?: ServiceOperationMap['inspectSeriesList']['input']['after'] } | undefined) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input === undefined || (input !== null && typeof input === 'object'), 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesList', { after: input?.after ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.createSeries, (event, input: ServiceOperationMap['createSeries']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('createSeries', { title: input.title, note: input.note });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectSeries, (event, input: ServiceOperationMap['inspectSeries']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeries', { seriesId: input.seriesId });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.previewSeriesMembershipChange, (event, input: ServiceOperationMap['previewSeriesMembershipChange']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('previewSeriesMembershipChange', { seriesId: input.seriesId, bookId: input.bookId, kind: input.kind });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.changeSeriesMembership, (event, input: ServiceOperationMap['changeSeriesMembership']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('changeSeriesMembership', {
          seriesId: input.seriesId, bookId: input.bookId, kind: input.kind, previewDigest: input.previewDigest,
        });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectBookSeries, (event, input: ServiceOperationMap['inspectBookSeries']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = owned.route;
      requireDesktop(route === null || (route.kind === 'book' && route.bookId === input.bookId), 'AI7_RENDERER_BOUNDARY_INVALID');
      const result = await service.call('inspectBookSeries', { bookId: input.bookId, membershipsAfter: input.membershipsAfter ?? null });
      requireDesktop(result.bookId === input.bookId, 'AI7_SERVICE_ROUTE_INVALID');
      return result;
    }),
  );

  // 书系's further pages (Issue #63 review): more members, the Books 加入书系… offers, and older change records.
  ipcMain.handle(IPC_CHANNELS.inspectSeriesMembers, (event, input: ServiceOperationMap['inspectSeriesMembers']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesMembers', { seriesId: input.seriesId, after: input.after ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectSeriesCandidates, (event, input: ServiceOperationMap['inspectSeriesCandidates']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesCandidates', { seriesId: input.seriesId, text: input.text, after: input.after ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectSeriesHistory, (event, input: ServiceOperationMap['inspectSeriesHistory']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      // A Book's records are read from that Book's window, as its first page is.
      const route = owned.route;
      requireDesktop(input.bookId === null || route === null || (route.kind === 'book' && route.bookId === input.bookId), 'AI7_RENDERER_BOUNDARY_INVALID');
      return service.call('inspectSeriesHistory', { seriesId: input.seriesId ?? null, bookId: input.bookId ?? null, after: input.after ?? null });
    }),
  );

}

export function registerSeriesKnowledgeHandlers(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  requireAuthority: () => void;
  requireManuscriptCapability: (owned: OwnedRendererWindow, input: { manuscriptId: string; branchId: string; }) => ManuscriptCapability;
  service: ServiceClient;
}) {
  const { requireSender, serializeEffect, requireAuthority, requireManuscriptCapability, service } = context;
  // 书系知识 (Issue #63, S28b): house-wide and serialized; a candidate that cites a manuscript span comes from the window that
  // holds that manuscript's capability, exactly as a mark does.
  ipcMain.handle(IPC_CHANNELS.proposeSeriesKnowledge, (event, input: ServiceOperationMap['proposeSeriesKnowledge']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        if (input.span !== null) {
          requireDesktop(typeof input.span === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
          requireManuscriptCapability(owned, input.span);
        }
        return service.call('proposeSeriesKnowledge', { seriesId: input.seriesId, target: input.target, content: input.content, span: input.span });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectSeriesKnowledgeReview, (event, input: ServiceOperationMap['inspectSeriesKnowledgeReview']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesKnowledgeReview', input);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.editSeriesKnowledgeCandidate, (event, input: ServiceOperationMap['editSeriesKnowledgeCandidate']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('editSeriesKnowledgeCandidate', {
          seriesId: input.seriesId, candidateId: input.candidateId, expectedVersion: input.expectedVersion, target: input.target, content: input.content,
        });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.promoteSeriesKnowledge, (event, input: ServiceOperationMap['promoteSeriesKnowledge']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('promoteSeriesKnowledge', {
          seriesId: input.seriesId, candidateId: input.candidateId, candidateVersion: input.candidateVersion, reviewDigest: input.reviewDigest,
          reuseScope: input.reuseScope, conflictDisposition: input.conflictDisposition,
        });
      });
    }),
  );

  // 书系知识's further pages (Issue #63 review): items by name or 查找条目, open candidates, and one item's 历次版本.
  ipcMain.handle(IPC_CHANNELS.inspectSeriesKnowledgeItems, (event, input: ServiceOperationMap['inspectSeriesKnowledgeItems']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesKnowledgeItems', { seriesId: input.seriesId, text: input.text, after: input.after ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectSeriesKnowledgeCandidates, (event, input: ServiceOperationMap['inspectSeriesKnowledgeCandidates']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesKnowledgeCandidates', { seriesId: input.seriesId, after: input.after ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectSeriesKnowledgeConflicts, (event, input: ServiceOperationMap['inspectSeriesKnowledgeConflicts']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesKnowledgeConflicts', { seriesId: input.seriesId, itemId: input.itemId, revisionId: input.revisionId, after: input.after });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectSeriesKnowledgeRevisions, (event, input: ServiceOperationMap['inspectSeriesKnowledgeRevisions']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesKnowledgeRevisions', { seriesId: input.seriesId, itemId: input.itemId, before: input.before ?? null });
    }),
  );

  // 书系检索排除 (Issue #64, S29b): house reads of a Series' targets and revisions, the impact preview, and the commit of one
  // revision — serialized like every other effect, since it may stop an approved Run in the same transaction.
  ipcMain.handle(IPC_CHANNELS.inspectSeriesExclusionTargets, (event, input: ServiceOperationMap['inspectSeriesExclusionTargets']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesExclusionTargets', { seriesId: input.seriesId, kind: input.kind, after: input.after ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectSeriesExclusionHistory, (event, input: ServiceOperationMap['inspectSeriesExclusionHistory']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectSeriesExclusionHistory', { seriesId: input.seriesId, after: input.after });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.previewSeriesExclusion, (event, input: ServiceOperationMap['previewSeriesExclusion']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('previewSeriesExclusion', {
        seriesId: input.seriesId, action: input.action, exclusionId: input.exclusionId, target: input.target, reason: input.reason,
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.recordSeriesExclusion, (event, input: ServiceOperationMap['recordSeriesExclusion']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('recordSeriesExclusion', {
          seriesId: input.seriesId, action: input.action, exclusionId: input.exclusionId, target: input.target, reason: input.reason,
          previewDigest: input.previewDigest,
        });
      });
    }),
  );

}
