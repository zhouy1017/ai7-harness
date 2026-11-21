import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type ResolvedBookWorkbenchRoute, type WireServiceOperationMap as ServiceOperationMap } from '../shared/protocol.js';
import { ServiceCallError, type ServiceClient } from './service-client.js';
import { envelope } from './handler-guards.js';
import type { ManuscriptCapability, OwnedRendererWindow } from './application-types.js';

/**
 * 「存为里程碑」 (Issue #1639): a milestone is saved from the editor and from 交付物. A window that came straight from 工作概览 to 交付物
 * has the Book open but has not opened the manuscript, so it holds no manuscript capability yet. The window then obtains it the way
 * a derivative page does before its manuscript actions — by reading the manuscript's window, which main only remembers for a
 * manuscript of this window's Book — instead of being refused. A window with no Book open, another Book's manuscript and a branch
 * that does not exist are refused as before, and nothing is remembered.
 */
export function registerMilestoneHandlers(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  requireCurrentBookRoute: (owned: OwnedRendererWindow) => Extract<ResolvedBookWorkbenchRoute, { kind: 'book' }>;
  requireManuscriptCapability: (owned: OwnedRendererWindow, input: { manuscriptId: string; branchId: string }) => ManuscriptCapability;
  rememberManuscriptCapability: (
    owned: OwnedRendererWindow,
    projection: ServiceOperationMap['getManuscriptWindow']['output'],
    expected: { manuscriptId: string; branchId: string },
    routeGeneration: number,
  ) => ManuscriptCapability;
  requireResourceIdentity: (capability: { manuscriptId: string | null; branchId: string | null }, result: { manuscriptId: string; branchId: string }) => void;
  service: ServiceClient;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
}): void {
  const { requireSender, requireAuthority, requireCurrentBookRoute, requireManuscriptCapability, rememberManuscriptCapability,
    requireResourceIdentity, service, serializeEffect } = context;
  ipcMain.handle(IPC_CHANNELS.saveMilestone, (event, input: ServiceOperationMap['saveMilestone']['input']) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireCurrentBookRoute(owned);
        let capability: ManuscriptCapability;
        try {
          capability = requireManuscriptCapability(owned, input);
        } catch (error) {
          if (!(error instanceof ServiceCallError) || error.code !== 'AI7_EDITOR_CAPABILITY_INVALID') throw error;
          const routeGeneration = owned.routeGeneration;
          const target = { manuscriptId: input.manuscriptId, branchId: input.branchId };
          rememberManuscriptCapability(owned, await service.call('getManuscriptWindow', { ...target, cursor: null }), target, routeGeneration);
          capability = requireManuscriptCapability(owned, input);
        }
        const result = await service.call('saveMilestone', input);
        requireResourceIdentity(capability, result);
        return result;
      });
    }),
  );
}
