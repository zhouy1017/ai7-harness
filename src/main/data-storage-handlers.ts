import type { NativeFilePickers } from './file-pickers.js';
import { writeFile } from 'node:fs/promises';
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type UsageCsvExportResult, type RendererApi } from '../shared/protocol.js';
import { usageCsv } from '../shared/usage.js';
import { ServiceClient } from './service-client.js';
import type { PreferenceStore } from './preferences.js';
import { envelope, requireDesktop } from './handler-guards.js';
import type { OwnedRendererWindow } from './application-types.js';

export function registerDataStorageHandlers(context: {
  chooseDatabaseExportFile: NativeFilePickers['chooseDatabaseExportFile'];
  chooseUsageCsvFile: NativeFilePickers['chooseUsageCsvFile'];
  chooseDatabaseImportFile: NativeFilePickers['chooseDatabaseImportFile'];
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  requireAuthority: () => void;
  service: ServiceClient;
  preferences: PreferenceStore;
  requireNothingUnsaved: () => void;
  quitApplication: () => "quitting" | "blocked";
}) {
  const { chooseDatabaseExportFile, chooseUsageCsvFile, chooseDatabaseImportFile, requireSender, serializeEffect, requireAuthority, service, preferences, requireNothingUnsaved, quitApplication } = context;
  // 导出数据库 (Issue #434, S86a): house-wide, bound to no Book route; choosing the file begins the preparation, and approving
  // begins the write, each begun in turn with every other effect and followed by the window, which may stop it (Issue #434
  // review, V2-UX-EXP-011).
  ipcMain.handle(IPC_CHANNELS.chooseDatabaseExportDestination, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async (): Promise<Awaited<ReturnType<RendererApi['chooseDatabaseExportDestination']>>> => {
        requireAuthority();
        const destination = await chooseDatabaseExportFile(owned);
        // A cancelled dialog records nothing at all (V2-UX-EXP-020).
        if (destination === undefined) return { outcome: 'cancelled' };
        return { outcome: 'preparing', activity: await service.call('prepareDatabaseExport', { destination }) };
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.approveDatabaseExport, (event, input: Parameters<RendererApi['approveDatabaseExport']>[0]) =>
    envelope(async () => {
      requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('approveDatabaseExport', { preparationId: input.preparationId });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectDatabaseExports, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectDatabaseExports', {});
    }),
  );

  ipcMain.handle(IPC_CHANNELS.cancelDatabaseExport, (event, input: Parameters<RendererApi['cancelDatabaseExport']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('cancelDatabaseExport', { activityId: input.activityId });
      });
    }),
  );

  // 定期自动备份 (Issue #434, S86b): house-wide; turning the switch is serialized with every other effect.
  ipcMain.handle(IPC_CHANNELS.inspectScheduledBackups, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectScheduledBackups', {});
    }),
  );

  // 用量 (Issue #936, S11c): a read of the recorded Runs; the CSV is numbers and ids only, built here from the same read and
  // the editor's own unit prices, and written where the Save dialog said.
  ipcMain.handle(IPC_CHANNELS.inspectUsage, (event, input: Parameters<RendererApi['inspectUsage']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectUsage', { range: input.range, groupBy: input.groupBy,
        ...(input.runOffset === undefined ? {} : { runOffset: input.runOffset }),
        ...(input.runRecordId === undefined ? {} : { runRecordId: input.runRecordId }),
        ...(input.asOf === undefined ? {} : { asOf: input.asOf }) });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.exportUsageCsv, (event, input: Parameters<RendererApi['exportUsageCsv']>[0]) =>
    envelope(async (): Promise<UsageCsvExportResult> => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const usage = await service.call('inspectUsage', { range: input.range, groupBy: input.groupBy });
      const destination = await chooseUsageCsvFile(owned);
      if (destination === undefined) return { outcome: 'cancelled' };
      const { values } = preferences.read();
      await writeFile(destination, usageCsv(usage, values['usage.unitPrices']), 'utf8');
      return { outcome: 'written', rows: usage.rows.reduce((count, row) => count + row.byRoute.length, 0) };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.setScheduledBackup, (event, input: Parameters<RendererApi['setScheduledBackup']>[0]) =>
    envelope(async () => {
      requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('setScheduledBackup', { enabled: input.enabled, expectedOrdinal: input.expectedOrdinal });
      });
    }),
  );

  // 导入数据库 (Issue #434, S86c): house-wide, bound to no Book route. Choosing the file reads it for the preview; preparing,
  // cancelling and rolling back a replacement are serialized with every other effect.
  ipcMain.handle(IPC_CHANNELS.chooseDatabaseImportFile, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async (): Promise<Awaited<ReturnType<RendererApi['chooseDatabaseImportFile']>>> => {
        requireAuthority();
        const source = await chooseDatabaseImportFile(owned);
        if (source === undefined) return { outcome: 'cancelled' };
        return { outcome: 'previewed', preview: await service.call('inspectDatabaseImport', { source }) };
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.prepareDatabaseReplacement, (event, input: Parameters<RendererApi['prepareDatabaseReplacement']>[0]) =>
    envelope(async () => {
      requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        // Once a replacement waits nothing more is saved (Issue #434 review), so no window may still hold changes not yet saved.
        requireNothingUnsaved();
        return service.call('prepareDatabaseReplacement', { previewId: input.previewId });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.cancelDatabaseReplacement, (event, input: Parameters<RendererApi['cancelDatabaseReplacement']>[0]) =>
    envelope(async () => {
      requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('cancelDatabaseReplacement', { replacementId: input.replacementId });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectDatabaseReplacements, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectDatabaseReplacements', {});
    }),
  );

  ipcMain.handle(IPC_CHANNELS.rollBackDatabaseReplacement, (event, input: Parameters<RendererApi['rollBackDatabaseReplacement']>[0]) =>
    envelope(async () => {
      requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        requireNothingUnsaved();
        return service.call('rollBackDatabaseReplacement', { replacementId: input.replacementId });
      });
    }),
  );

  // 只导入其中的图书 (Issue #434, S86d): house-wide and serialized, like 替换本机全部数据.
  ipcMain.handle(IPC_CHANNELS.prepareDatabaseMerge, (event, input: Parameters<RendererApi['prepareDatabaseMerge']>[0]) =>
    envelope(async () => {
      requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('prepareDatabaseMerge', { previewId: input.previewId });
      });
    }),
  );

  // 现在关闭 AI7 (Issue #434, S86c): the whole application closes, after every effect already asked for, unless a window still
  // holds changes not yet saved — then nothing closes and that window says so, as when the editor closes AI7 themselves.
  ipcMain.handle(IPC_CHANNELS.quitApplication, (event) =>
    envelope(async () => {
      requireSender(event);
      return serializeEffect(async (): Promise<Awaited<ReturnType<RendererApi['quitApplication']>>> => ({ outcome: quitApplication() }));
    }),
  );

}

export function registerDataVersionHandler(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  service: ServiceClient;
}) {
  const { requireSender, requireAuthority, service } = context;
  // 设置 › 数据与存储 › 版本 (Issue #433, S85a): a house read, bound to no Book route.
  ipcMain.handle(IPC_CHANNELS.inspectDataVersion, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectDataVersion', {});
    }),
  );

}
